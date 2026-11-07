#!/usr/bin/env python3
"""Build the self-contained, Marrow-only Custom Module dataset.

Sources (both pinned and checksum verified):
  * sunday2212/WEBREPLITX5 @ 7442d6f918a7469be0e0941eb39586220dc31ce7
      codeload archive: https://codeload.github.com/sunday2212/WEBREPLITX5/tar.gz/<REV>
  * amrenkhan07-pixel/qbank-hub @ cfb6dddbf0c4d760080792d953e0582e0e9e6ee7
      import-reports/marrow-pyq-stage-v1.json.gz (Marrow PYQ only)

What this produces:
  * assets/mcq-tags.json            permanent 16-tag index on Edition 8 qBank codes
  * assets/mcq-question-index.json  MCQ-code search index extended to every M#xxxx code
  * assets/custom-module-data-manifest.json  checksums and counts (small, committed)
  * custom-module.html              small manifest + raw-text gzip payload inline

Rules enforced here (see docs/custom-module-data.md):
  * Edition 8 qBank is the base pool. No Mini Test / PYQ question is merged into it.
  * The 14 non-exam tags come from Marrow Mini/Test series filenames, joined to
    qBank codes. FMGE files are used as tag evidence only; FMGE questions are
    never emitted as MCQs.
  * #AIIMS / #recentNEET come ONLY from QBank Hub Marrow PYQ (exam_family).
    WEBREPLITX PYQ papers are not used at all.
  * QBank Hub PYQ questions that match a qBank code only tag that code; unmatched
    ones become subject-wise, topic-less extras. Every PYQ extra carries its full
    inclusive tag list (exam tag(s) + Mini Test chips joined by exact text+options),
    so a multi-tag PYQ appears under any one of its tags when its subject has ALL
    topics selected.
  * Mini Test questions that match no qBank code become subject-less, topic-less
    extras (NEET PG series only).

Usage:
  python3 scripts/build-custom-module-data.py \
      --web5-tar /tmp/web5.tar.gz \
      --qbh-gz  /tmp/qbh/import-reports__marrow-pyq-stage-v1.json.gz
"""

import argparse
import base64
import collections
import gzip
import hashlib
import json
import os
import re
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB5_REV = "7442d6f918a7469be0e0941eb39586220dc31ce7"
QBH_REV = "cfb6dddbf0c4d760080792d953e0582e0e9e6ee7"
QBH_SHA = "c3ee2697542afacd49d3931c71ec05f010190394dd2196252ff0c0efc132f76a"
BRAIN = "frontend/quizx/Brain/"
QBANK = "Marrow/Edition 8 qBank/"
PYQ = "Marrow/Previous Year Question Papers/"
EXAM_TAGS = {"AIIMS", "recentNEET"}

TAG_ORDER = [
    "ImageBased", "DrugOfChoice", "AIIMS", "RecentUpdates", "TheCommons",
    "Controversial", "recentNEET", "Criteria", "Clinical", "Eponyms",
    "Instruments", "GIFBased", "InvestigationsOfChoice", "Slides",
    "Numbers", "Problems",
]
LABELS = {
    "ImageBased": "#ImageBased", "DrugOfChoice": "#Drug_OfChoice", "AIIMS": "#AIIMS",
    "RecentUpdates": "#RecentUpdates", "TheCommons": "#TheCommons",
    "Controversial": "#Controversial", "recentNEET": "#recentNEET",
    "Criteria": "#Criteria", "Clinical": "#Clinical", "Eponyms": "#Eponyms",
    "Instruments": "#Instruments", "GIFBased": "#GIFBased",
    "InvestigationsOfChoice": "#Investigation_ofChoice", "Slides": "#Slides",
    "Numbers": "#Numbers", "Problems": "#Problems",
}
# Tag-named Mini/Test series files are the evidence for the 14 non-exam tags.
# These patterns are byte-for-byte the original tag-index build so the 14 chip
# counts stay identical. AIIMS/recentNEET patterns gate file selection only;
# those two tags are now owned exclusively by QBank Hub Marrow PYQ.
TAGDEF_ALL = [
    ("ImageBased", r"imagebased|image_based|image_only|image_test|clinical_images|cadaveric|radiographs|histopatholog|ecg"),
    ("DrugOfChoice", r"drugs?_?of_?choice|drug_ofchoice"),
    ("AIIMS", r"aiims"),
    ("RecentUpdates", r"recent_?updates?"),
    ("TheCommons", r"the_?commons|most_commons|commons"),
    ("Controversial", r"controvers"),
    ("recentNEET", r"recentneet|wrwu_neet|neet_20[0-9][0-9]_mini"),
    ("Criteria", r"criterias?|classifications"),
    ("Clinical", r"clinical(?!_images)"),
    ("Eponyms", r"eponym"),
    ("Instruments", r"instrument"),
    ("GIFBased", r"gif"),
    ("InvestigationsOfChoice", r"investigations?_?of_?choice"),
    ("Slides", r"slides"),
    ("Numbers", r"numbers"),
    ("Problems", r"problems"),
]
TAGDEF_ALL = [(n, re.compile(p, re.I)) for n, p in TAGDEF_ALL]
TAGDEF = [(n, p) for n, p in TAGDEF_ALL if n not in EXAM_TAGS]
ANY_TAG = re.compile(
    "|".join(p.pattern for _, p in TAGDEF_ALL).replace("clinical(?!_images)", "clinical"), re.I
)

SUBJECT_ORDER = [
    "Anatomy", "Biochemistry", "Physiology", "Pharmacology", "Microbiology",
    "Pathology", "Community Medicine", "Forensic Medicine", "Ophthalmology", "ENT",
    "Anaesthesia", "Dermatology", "Psychiatry", "Radiology", "Medicine", "Surgery",
    "Orthopaedics", "Paediatrics", "Obstetrics & Gynaecology",
]
ALIASES = {
    "Obstetrics & Gynecology": "Obstetrics & Gynaecology",
    "Obstetrics And Gynaecology": "Obstetrics & Gynaecology",
    "Obstetrics And Gynecology": "Obstetrics & Gynaecology",
    "Pediatrics": "Paediatrics",
    "Orthopedics": "Orthopaedics",
    "Anesthesiology": "Anaesthesia",
    "Anaesthesiology": "Anaesthesia",
    "Anesthesia": "Anaesthesia",
    "ENT": "ENT", "Otorhinolaryngology": "ENT",
    "Community Medicine (PSM)": "Community Medicine",
    "FMT": "Forensic Medicine", "Forensic Medicine & Toxicology": "Forensic Medicine",
    "PSM": "Community Medicine", "Social And Preventive Medicine": "Community Medicine",
}
CODE_RE = re.compile(r"^M[A-Z]\d{4}$")

BEGIN = "/* BEGIN EMBEDDED MARROW DATA */"
END = "/* END EMBEDDED MARROW DATA */"
PAYLOAD_BEGIN = "<!-- BEGIN EMBEDDED MARROW PAYLOAD -->"
PAYLOAD_END = "<!-- END EMBEDDED MARROW PAYLOAD -->"
PAYLOAD_ID = "cm-embedded-data"


# ---------------------------------------------------------------- matching ----
def N(value):
    value = re.sub(r"<[^>]*>", " ", str(value or ""))
    value = re.sub(r"&[^;]+;", " ", value)
    return re.sub(r"[^a-z0-9]", "", value.lower())


def TOK(value):
    return re.findall(r"[a-z0-9]{4,}", re.sub(r"<[^>]*>", " ", str(value or "")).lower())


STOP = set(
    "the and for with from that this which following are was were has have not all except most "
    "likely about into than then given true false below above seen associated patient year old "
    "years age".split()
)


def CW(value):
    return [w for w in re.findall(r"[a-z0-9]{3,}", re.sub(r"<[^>]*>", " ", str(value or "")).lower()) if w not in STOP]


def stem(q):
    return N(q["text"])


def opts(q):
    return " ".join(q["opts"])


def sopts(q):
    return "|".join(sorted(N(o) for o in q["opts"]))


def img(q):
    arr = q.get("imgs") or []
    if not arr:
        return ""
    s = str(arr[0]).split("?")[0].split("/")[-1]
    return s.lower() if len(s) >= 8 else ""


def sol(q):
    return N(q.get("sol", ""))[:120]


def dkey(q):
    s = re.sub(r"[0-9]", "", stem(q))
    return s if len(s) >= 30 else ""


def wkey(q):
    w = sorted(CW(q["text"]))
    return "|".join(w) if len(w) >= 4 else ""


def fkey(q):
    w = CW(q["text"])[:6]
    return "|".join(w) if len(w) >= 4 else ""


class Matcher:
    """Question-text join from the original tag-index build, unchanged in spirit."""

    def __init__(self, qbank):
        self.qbank = qbank
        self.codes = {q["id"] for q in qbank if q["id"]}
        self.M = {k: {} for k in ["s", "p60", "p30", "os", "o", "im", "so", "dk", "wk", "fk"]}

        def put(k, key, code):
            if key and code and key not in self.M[k]:
                self.M[k][key] = code

        for q in qbank:
            c, s = q["id"], stem(q)
            put("s", s, c)
            put("p60", s[:60], c)
            if len(s) >= 30:
                put("p30", s[:30], c)
            put("os", sopts(q), c)
            put("o", N(opts(q))[:60], c)
            x = img(q)
            if x:
                put("im", x, c)
            y = sol(q)
            if len(y) > 40:
                put("so", y, c)
            put("dk", dkey(q), c)
            put("wk", wkey(q), c)
            put("fk", fkey(q), c)
        self.TT = [set(TOK(q["text"])) for q in qbank]
        self.WW = [set(CW(q["text"])) for q in qbank]
        self.INV = collections.defaultdict(list)
        self.IVW = collections.defaultdict(list)
        df = collections.Counter()
        for s in self.TT:
            df.update(s)
        for i, s in enumerate(self.TT):
            for w in s:
                if df[w] <= 180:
                    self.INV[w].append(i)
        dfw = collections.Counter()
        for s in self.WW:
            dfw.update(s)
        for i, s in enumerate(self.WW):
            for w in s:
                if dfw[w] <= 200:
                    self.IVW[w].append(i)

    def old_fuzzy(self, q):
        uq = set(TOK(q["text"]))
        if len(uq) < 3:
            return ""
        tl = sorted((w for w in uq if w in self.INV), key=lambda w: (len(self.INV[w]), w))[:8]
        cd = collections.Counter()
        for w in tl:
            cd.update(self.INV[w])
        cand = sorted((i for i, n in cd.items() if n >= 3), key=lambda i: (-cd[i], i))[:120]
        for i in cand:
            b = self.TT[i]
            if b and len(uq & b) / min(len(uq), len(b)) >= 0.65:
                return self.qbank[i]["id"]
        return ""

    def txt_fuzzy(self, q):
        a = set(CW(q["text"]))
        if len(a) < 4:
            return ""
        ks = sorted((w for w in a if w in self.IVW), key=lambda w: (len(self.IVW[w]), w))[:10]
        cd = collections.Counter()
        for w in ks:
            cd.update(self.IVW[w])
        cand = sorted((i for i, n in cd.items() if n >= 2), key=lambda i: (-cd[i], i))[:200]
        for i in cand:
            b = self.WW[i]
            if b and len(a & b) / min(len(a), len(b)) >= 0.60:
                return self.qbank[i]["id"]
        return ""

    def old(self, q):
        c = q.get("id", "")
        if c and c in self.codes:
            return c
        s, y, x = stem(q), sol(q), img(q)
        for k, key in [
            ("s", s), ("p60", s[:60]), ("p30", s[:30] if len(s) >= 30 else ""),
            ("os", sopts(q)), ("o", N(opts(q))[:60]), ("im", x if x else ""),
            ("so", y if len(y) > 40 else ""),
        ]:
            if key and key in self.M[k]:
                return self.M[k][key]
        return self.old_fuzzy(q)

    def text(self, q):
        for k, fn in [("dk", dkey), ("wk", wkey), ("fk", fkey)]:
            key = fn(q)
            if key and key in self.M[k]:
                return self.M[k][key]
        return self.txt_fuzzy(q)


# ------------------------------------------------------------------ helpers ----
def compact_rec(q, rel=""):
    """Shape used by the text join, built from a raw source question object."""
    ch = q.get("choices") or []
    return {
        "id": str(q.get("question_id") or ""),
        "text": str(q.get("text") or q.get("question_text") or q.get("question_html") or ""),
        "opts": [str(c.get("text", "") if isinstance(c, dict) else c) for c in ch],
        "imgs": q.get("question_images") or [],
        "sol": str(q.get("solution") or q.get("explanation_html") or q.get("explanation") or ""),
        "rel": rel,
    }


def tagof(filename):
    name = str(filename)
    if not ANY_TAG.search(name):
        return []
    return [tag for tag, pattern in TAGDEF if pattern.search(name)]


def raw_signature(q):
    body = json.dumps(
        [q.get("text") or "", [str(c.get("text", "") if isinstance(c, dict) else c) for c in (q.get("choices") or [])]],
        ensure_ascii=False, sort_keys=True,
    )
    return hashlib.sha256(body.encode("utf-8")).hexdigest()[:24]


def key_of(q):
    """Stable identity for a normalized question, used for dedupe."""
    body = N(q["q"]) + "\0" + "\0".join(sorted(N(o) for o in q["o"]))
    return hashlib.sha256(body.encode()).hexdigest()[:24]


def tag_order(tags):
    """Deterministic chip order: the 16-chip wizard order, unknowns last."""
    return sorted(set(tags), key=lambda t: (TAG_ORDER.index(t) if t in TAG_ORDER else 999, t))


def qkey(text, options):
    """Exact text+options identity, used to inherit Mini Test tags onto PYQ extras."""
    return N(text) + "\0" + "|".join(sorted(N(o) for o in options))


def chunk_b64(data):
    """Split a base64 string into concatenated JS string literals (fast parse)."""
    parts = [data[i:i + 16384] for i in range(0, len(data), 16384)]
    return "(\n  " + "\n+ ".join("'" + p + "'" for p in parts) + "\n)"


# -------------------------------------------------------------------- build ----
def build(web5_tar, qbh_gz):
    qbh_bytes = Path(qbh_gz).read_bytes()
    digest = hashlib.sha256(qbh_bytes).hexdigest()
    if digest != QBH_SHA:
        raise ValueError("QBank Hub Marrow PYQ artifact SHA-256 mismatch: " + digest)
    qbh = json.loads(gzip.decompress(qbh_bytes))

    files = {}                       # topic path -> raw source question objects
    manifest_folders = {}
    qbank_recs = []
    tag_src = []                     # (compact_rec, tags, is_fmge, raw source object)

    tar = tarfile.open(web5_tar, "r:gz")
    for member in tar:
        if not member.isfile():
            continue
        full = member.name
        if BRAIN not in full or not full.endswith(".json"):
            continue
        rel = full.split(BRAIN, 1)[1]
        if not rel.startswith("Marrow/"):
            continue
        if rel.startswith(PYQ):
            continue                 # WEBREPLITX PYQ papers are deliberately unused
        try:
            data = json.loads(tar.extractfile(member).read())
        except Exception:
            continue
        questions = data.get("questions") or [] if isinstance(data, dict) else []
        if rel.startswith(QBANK):
            suffix = rel[len(QBANK):]
            parts = suffix.split("/")
            if len(parts) != 2:
                continue
            subject = parts[0]
            manifest_folders.setdefault(QBANK + subject, {"type": "folder", "files": []})["files"].append(parts[1])
            files[rel] = questions
            for q in questions:
                qbank_recs.append(compact_rec(q, rel))
        else:
            cat = rel.split("/")[1]
            is_fmge = "FMGE" in cat
            # Only the two Mini Test Series are tag evidence, matching the
            # original tag-index build. Test Series / Subject Test Series are
            # Marrow MCQs but are not tag-named Mini Tests.
            is_mini = "Mini Test Series" in cat
            tags = tagof(os.path.basename(rel)) if is_mini else []
            tag_rows = [t for t in tags if t not in EXAM_TAGS]
            for q in questions:
                rec = compact_rec(q, rel)
                if tag_rows:
                    tag_src.append((rec, tag_rows, is_fmge, q))
    tar.close()

    # A PYQ question that is not in Edition 8 qBank can still carry our 14
    # non-exam chips if the same question appears in a tag-named Mini Test.
    # Join on exact normalized question text + options (never on stem alone),
    # so a PYQ extra keeps its exam tag AND its other tags. Tag evidence only;
    # the Mini Test question itself is not added to the module pool.
    mini_tag_by_key = collections.defaultdict(set)
    for rec, tags, _is_fmge, _raw in tag_src:
        if tags:
            mini_tag_by_key[qkey(rec["text"], rec["opts"])].update(tags)

    matcher = Matcher(qbank_recs)
    # Canonical 14-tag map: the checked-in Mini Test join is authoritative, so the
    # 14 non-exam chip counts are bit-for-bit unchanged. Only the two exam tags
    # are removed here; they are re-assigned below from QBank Hub Marrow PYQ.
    baseline = json.loads((ROOT / "assets/mcq-minitest-tags.json").read_text(encoding="utf-8"))
    by_code = collections.defaultdict(set)
    for code, tags in baseline["questions"].items():
        kept = [t for t in tags if t not in EXAM_TAGS]
        if kept:
            by_code[code].update(kept)
    tag_extras = []
    for rec, tags, is_fmge, raw in tag_src:
        code = matcher.old(rec) or matcher.text(rec)
        if code:
            continue
        elif not is_fmge:
            choices = raw.get("choices") or []
            answer = raw.get("correct_choice_id")
            if len(choices) < 2 or answer is None or str(answer) not in {str(c.get("id")) for c in choices if isinstance(c, dict)}:
                continue  # an incomplete Mini Test row can never produce a valid MCQ
            tag_extras.append({
                "question_id": str(raw.get("question_id") or ""),
                "text": str(raw.get("text") or ""),
                "choices": raw.get("choices") or [],
                "correct_choice_id": raw.get("correct_choice_id"),
                "solution": str(raw.get("solution") or ""),
                "question_images": raw.get("question_images") or [],
                "explanation_images": raw.get("explanation_images") or [],
                "_tags": tags,
            })

    # QBank Hub Marrow PYQ: exam tags on qBank codes, and subject-wise extras.
    occ = collections.defaultdict(list)
    for o in qbh["occurrences"]:
        occ[o["question_id"]].append(o)
    qbank_ids = set(matcher.codes)
    qbank_stems = {}
    qbank_keys = {}
    for q in qbank_recs:
        s = N(q["text"])
        qbank_stems.setdefault(s, q["id"])
        qbank_keys.setdefault(N(q["text"]) + "\0" + "|".join(sorted(N(o) for o in q["opts"])), q["id"])
    pyq_extras = []
    exam_on_codes = collections.defaultdict(set)
    for v in qbh["content_versions"]:
        payload = v["payload"]
        options = payload.get("options") or []
        keys = payload.get("correct_keys") or []
        rows = occ[v["question_id"]]
        families = [str(o.get("exam_family") or "") for o in rows] + [str(v.get("exam_family") or "")]
        exam_tags = {"recentNEET" if "neet" in f.lower() else "AIIMS" for f in families if f}
        if not exam_tags:
            exam_tags = {"AIIMS"}
        tag = tag_order(exam_tags)[0]  # primary exam tag, also the legacy _tag field
        subject_raw = str(v.get("subject") or (rows[0].get("subject") if rows else "") or "")
        subject = ALIASES.get(subject_raw, subject_raw)
        if subject not in SUBJECT_ORDER:
            continue
        sid = str(v.get("source_question_id_first_seen") or "")
        for row in rows:
            if row.get("source_question_id"):
                sid = str(row["source_question_id"])
                break
        text = str(payload.get("question_html") or "")
        opt_texts = [str(o.get("html") or "") for o in options]
        ntext = N(text)
        nkey = qkey(text, opt_texts)
        code = ""
        if sid in qbank_ids:
            code = sid
        elif nkey in qbank_keys:
            code = qbank_keys[nkey]
        elif ntext in qbank_stems:
            code = qbank_stems[ntext]
        if code:
            exam_on_codes[code].update(exam_tags)
            continue
        media = payload.get("media") or []
        qimgs = [m["reference"] for m in media if m.get("type") == "image" and m.get("placement") == "question" and isinstance(m.get("reference"), str)]
        eimgs = [m["reference"] for m in media if m.get("type") == "image" and m.get("placement") == "explanation" and isinstance(m.get("reference"), str)]
        pyq_extras.append({
            "question_id": sid,
            "text": text,
            "choices": [{"id": o.get("key"), "text": o.get("html") or ""} for o in options],
            "correct_choice_id": keys[0] if len(keys) == 1 else None,
            "solution": str(payload.get("explanation_html") or ""),
            "question_images": qimgs,
            "explanation_images": eimgs,
            "_subject": subject,
            "_tag": tag,
            # Inclusive tag list: every exam tag this PYQ carries, plus any of
            # the 14 Mini Test chips inherited by exact text+options match.
            # The maker admits the question when ANY of these is selected and
            # renders all of them as chips in the explanation.
            "_tags": tag_order(exam_tags | mini_tag_by_key.get(nkey, set())),
            "_exam_year": v.get("exam_year") or (rows[0].get("exam_year") if rows else ""),
        })

    final_tags = collections.defaultdict(set)
    for code, tags in by_code.items():
        final_tags[code].update(tags)
    for code, tags in exam_on_codes.items():
        final_tags[code].update(tags)

    # ---- assets/mcq-tags.json ----
    per_tag = collections.Counter(t for tags in final_tags.values() for t in tags)
    by_topic = {}
    for path, questions in files.items():
        suffix = path[len(QBANK):]
        if "/" not in suffix:
            continue
        subject, topic_file = suffix.split("/", 1)
        counts = collections.Counter()
        for q in questions:
            code = str(q.get("question_id") or "")
            for t in final_tags.get(code, ()):
                counts[t] += 1
        if counts:
            by_topic[subject + "|" + topic_file] = dict(counts)
    tag_asset = {
        "schema": 1,
        "source": "sunday2212/WEBREPLITX5 @ " + WEB5_REV + " / Marrow/Edition 8 qBank + amrenkhan07-pixel/qbank-hub @ " + QBH_REV + " Marrow PYQ",
        "matching": "14 pedagogical tags joined from Marrow Mini/Test series filenames to qBank codes; #AIIMS/#recentNEET from QBank Hub Marrow PYQ exam_family; FMGE used as tag evidence only, never emitted as an MCQ",
        "qbankCodes": len(qbank_ids),
        "counts": {
            "tags": len(TAG_ORDER),
            "tagged": len(final_tags),
            "multi": sum(1 for v in final_tags.values() if len(v) >= 2),
            "assignments": sum(len(v) for v in final_tags.values()),
            "untagged": len(qbank_ids) - len(final_tags),
            "newByQuestionText": 0,
        },
        "tags": [{"id": t, "label": LABELS[t], "count": per_tag[t]} for t in TAG_ORDER],
        "questions": {c: sorted(v) for c, v in sorted(final_tags.items())},
        "byTopic": by_topic,
    }
    (ROOT / "assets/mcq-tags.json").write_text(
        json.dumps(tag_asset, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n", encoding="utf-8"
    )

    # ---- assets/mcq-question-index.json : every M#xxxx Marrow code ----
    index_path = ROOT / "assets/mcq-question-index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    topics = index["topics"]
    questions = index["questions"]
    # Second pass: locate every Marrow M#xxxx code missing from the index in the
    # NEET PG test-series files. Existing qBank/PYQ entries stay first so cached
    # questions and remembered answers remain compatible.
    tar = tarfile.open(web5_tar, "r:gz")
    for member in tar:
        if not member.isfile():
            continue
        full = member.name
        if BRAIN not in full or not full.endswith(".json"):
            continue
        rel = full.split(BRAIN, 1)[1]
        if not rel.startswith("Marrow/") or rel.startswith(QBANK) or rel.startswith(PYQ) or "FMGE" in rel:
            continue
        try:
            raw = tar.extractfile(member).read()
            data = json.loads(raw)
        except Exception:
            continue
        rows = data.get("questions") or [] if isinstance(data, dict) else []
        hits = [(i, q) for i, q in enumerate(rows)
                if CODE_RE.match(str(q.get("question_id") or "")) and str(q["question_id"]) not in questions]
        if not hits:
            continue
        topic_name = os.path.basename(rel).replace(".json", "").replace("_", " ")
        topic_index = len(topics)
        topics.append(["Marrow", topic_name, rel, hashlib.sha256(raw).hexdigest()])
        for i, q in hits:
            code = str(q["question_id"])
            questions[code] = [[topic_index, i, raw_signature(q)]]
    tar.close()
    prefixes = index["source"].get("prefixes") or []
    for prefix in ["Marrow/NEET PG Mini Test Series/", "Marrow/NEET PG Subject Test Series/", "Marrow/NEET PG Test Series/"]:
        if prefix not in prefixes:
            prefixes.append(prefix)
    index["source"]["prefixes"] = prefixes
    test_series_paths = ("Marrow/NEET PG Mini Test Series/", "Marrow/NEET PG Subject Test Series/", "Marrow/NEET PG Test Series/")
    series_topic_rows = {i for i, t in enumerate(topics) if any(str(t[2]).startswith(p) for p in test_series_paths)}
    series_code_count = sum(1 for hits in questions.values() if hits and hits[0][0] in series_topic_rows)
    index["counts"].update({
        "topicFiles": len(topics),
        "uniqueQuestionCodes": len(questions),
        "testSeriesTopicFiles": len(series_topic_rows),
        "testSeriesCodes": series_code_count,
        "testSeriesCodesAdded": series_code_count,
        "questionRecords": len(questions),
        "codePattern": "^M[A-Z]\\d{4}$",
    })
    index_path.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    # ---- embedded payload ----
    embedded_manifest = {"folders": {k: {"type": "folder", "files": sorted(v["files"])} for k, v in sorted(manifest_folders.items())}}
    payload = {"files": files, "tagExtras": tag_extras, "pyqExtras": pyq_extras}
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    gz = gzip.compress(raw, 9, mtime=0)  # deterministic: no wall-clock in the gzip header
    b64 = base64.b64encode(gz).decode("ascii")
    js_manifest = json.dumps(embedded_manifest, ensure_ascii=False, separators=(",", ":"))
    js_manifest = js_manifest.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")

    page = ROOT / "custom-module.html"
    html = page.read_text(encoding="utf-8")
    if BEGIN not in html:
        anchor = "const REFERENCE_TEMPLATE_B64=("
        pos = html.find(anchor)
        if pos < 0:
            raise ValueError("REFERENCE_TEMPLATE_B64 anchor not found")
        html = html[:pos] + BEGIN + "\n" + END + "\n" + html[pos:]
    if PAYLOAD_BEGIN not in html:
        anchor = "<script>\n'use strict';"
        pos = html.find(anchor)
        if pos < 0:
            raise ValueError("Main script anchor not found")
        html = html[:pos] + PAYLOAD_BEGIN + "\n" + PAYLOAD_END + "\n" + html[pos:]

    # Raw, non-executing text: the browser never has to parse ~14.7 MB of JS
    # string literals just to show the wizard. Boot reads only the 34 KB manifest;
    # loadEmbedded() reads this element once, in an idle callback / on first Build.
    pi = html.find(PAYLOAD_BEGIN)
    pj = html.find(PAYLOAD_END) + len(PAYLOAD_END)
    payload_block = (
        PAYLOAD_BEGIN
        + "\n<script id=\"" + PAYLOAD_ID + "\" type=\"text/plain\">" + b64 + "</script>\n"
        + PAYLOAD_END
    )
    html = html[:pi] + payload_block + html[pj:]

    i = html.find(BEGIN)
    j = html.find(END) + len(END)
    block = (
        BEGIN
        + "\n/* Generated by scripts/build-custom-module-data.py — do not edit by hand. */\n"
        + "/* Inline because HTML Reader opens the maker from a blob: URL with CSP that blocks fetches. */\n"
        + "/* The gzip payload is raw text above, not a JS string expression: startup stays fast. */\n"
        + "const EMBEDDED_MANIFEST=" + js_manifest + ";\n"
        + END
    )
    page.write_text(html[:i] + block + html[j:], encoding="utf-8")

    (ROOT / "assets/custom-module-data-manifest.json").write_text(json.dumps({
        "schema": 1,
        "web5Revision": WEB5_REV,
        "qbankHubRevision": QBH_REV,
        "qbankHubSha256": QBH_SHA,
        "embeddedSha256": hashlib.sha256(gz).hexdigest(),
        "embeddedGzipBytes": len(gz),
        "embeddedBase64Chars": len(b64),
        "embeddedQuestionRecords": len(qbank_recs),
        "qbankTopicFiles": len(files),
        "tagOnlyExtras": len(tag_extras),
        "pyqExtras": len(pyq_extras),
        "taggedQbankCodes": len(final_tags),
        "tagAssignments": sum(len(v) for v in final_tags.values()),
        "mcqCodeIndexCodes": len(questions),
        "mcqCodeIndexTopics": len(topics),
        "perTag": dict(per_tag),
        "pyqExtrasByTag": dict(collections.Counter(p["_tag"] for p in pyq_extras)),
        "pyqExtrasMultiTag": sum(1 for p in pyq_extras if len(p["_tags"]) > 1),
        "tagExtrasByTag": dict(collections.Counter(t for p in tag_extras for t in p["_tags"])),
        "rules": {
            "fmge": "tag evidence only; no FMGE question is emitted",
            "web5Pyq": "removed entirely",
            "examTags": "QBank Hub Marrow PYQ exam_family only",
            "tagOnlyExtras": "all 19 subjects in scope only, and only when their tag is selected",
            "pyqExtras": "selected subject with ALL topics selected only; inclusive tag match (ANY of its tags, including #recentNEET/#AIIMS, admits it)",
        },
    }, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")
    print("qBank topics", len(files), "| tagged codes", len(final_tags), "| tag-only extras", len(tag_extras),
          "| PYQ extras", len(pyq_extras), "| M#xxxx codes", len(questions))
    print("embedded gzip", len(gz), "bytes; base64", len(b64), "chars")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--web5-tar", required=True)
    ap.add_argument("--qbh-gz", required=True)
    args = ap.parse_args()
    build(args.web5_tar, args.qbh_gz)
    return 0


if __name__ == "__main__":
    sys.exit(main())
