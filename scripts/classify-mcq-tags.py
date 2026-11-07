#!/usr/bin/env python3
"""Deterministic, offline tag + subject/topic classifier for the Marrow Custom Module.

The maker (custom-module.html) already subject/topic-categorises the Edition 8
qBank from its folder path, but two sidecar pools were uncategorised and barely
tagged:

  * tagExtras  (872 Mini Test questions absent from qBank) - no subject, no topic
  * pyqExtras  (4,391 QBH Marrow PYQ absent from qBank)    - subject only, no topic

and the 13 non-exam tags only covered the Mini Test files that happened to be
tag-named, so "#Clinical in Medicine" could return nothing.

This script closes that gap with rules only (no network, no API key, no model):

  1. Assigns every tagExtra and pyqExtra a subject and a module-file topic by
     nearest-neighbour against the Edition 8 qBank corpus (same token-overlap
     idea the data generator already uses), with a subject-profile fallback.
  2. Assigns the 13 AI-derivable tags to every question (qBank + both extra
     pools) from question text + images. #recentNEET, #AIIMS and #RecentUpdates
     are exam-history tags and are never touched.
  3. Unions the new tags with the existing Mini Test tags (nothing is removed).

#ImageBased / #GIFBased are objective (an image is present / the image is a GIF)
and are decided by rule, never by judgement.

Outputs (all idempotent):
  * assets/mcq-ai-tags.json   the overlay this script produces and re-applies
  * assets/mcq-tags.json      extended with the overlay (union, never replace)
  * custom-module.html        embedded payload patched (extras get _subject/_topic
                              and unioned _tags) and INLINE_TAG_INDEX regenerated

Usage:
  python3 scripts/classify-mcq-tags.py            # apply
  python3 scripts/classify-mcq-tags.py --dry-run  # report only, write nothing
  python3 scripts/classify-mcq-tags.py --sample N # extra sample lines per tag
"""

import argparse
import base64
import collections
import gzip
import html as htmlmod
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "custom-module.html"
TAG_ASSET = ROOT / "assets" / "mcq-tags.json"
OVERLAY_ASSET = ROOT / "assets" / "mcq-ai-tags.json"

PAYLOAD_RE = re.compile(
    r'<script id="cm-embedded-data" type="text/plain">(.*?)</script>', re.S
)
SOURCE_PREFIX = "Marrow/Edition 8 qBank/"

# Tags this script may assign. The three exam-history tags are excluded on
# purpose: they record what was actually asked, which no text rule can infer.
AI_TAGS = [
    "ImageBased", "GIFBased", "Clinical", "Slides", "Numbers", "Problems",
    "Eponyms", "TheCommons", "Instruments", "Criteria", "DrugOfChoice",
    "InvestigationsOfChoice", "Controversial",
]
EXAM_TAGS = {"AIIMS", "recentNEET", "RecentUpdates"}


# --------------------------------------------------------------- text utils --
def strip_html(value):
    value = re.sub(r"<[^>]*>", " ", str(value or ""))
    return htmlmod.unescape(value)


def N(value):
    """Alphanumeric-only normalisation (mirrors the data generator)."""
    value = re.sub(r"<[^>]*>", " ", str(value or ""))
    value = re.sub(r"&[^;]+;", " ", value)
    return re.sub(r"[^a-z0-9]", "", value.lower())


STOP = set(
    "the and for with from that this which following are was were has have not all "
    "except most likely about into than then given true false below above seen "
    "associated patient year old years age case you your his her its can may also "
    "will would should could who whom whose what when where why how does did done".split()
)


def words(value):
    raw = re.findall(r"[a-z0-9]{3,}", strip_html(value).lower())
    return [w for w in raw if w not in STOP]


def qtext(q):
    return strip_html(q.get("text") or q.get("question_html") or "")


def qsolution(q):
    return strip_html(q.get("solution") or q.get("explanation_html") or "")


def images(q):
    arr = q.get("question_images") or []
    out = []
    for item in arr:
        url = item if isinstance(item, str) else (item or {}).get("url") or (item or {}).get("src")
        if url:
            out.append(str(url))
    return out


# ---------------------------------------------------------------- tag rules --
# #Clinical is decided by CLINICAL_ANCHOR + CLINICAL_CASE below, not a single
# regex: it needs a patient anchor AND case evidence. A lone "patient" noun is
# not enough - that admitted fact stems like "Which of the following is true
# about melanoma of the anal canal?".
CLINICAL_ANCHOR = re.compile(
    r"\b\d{1,3}[\s-]?(?:year|yr|month|day|week|hour)s?[\s-]?old\b"
    r"|\b\d{1,3}\s?(?:yrs?|yo)\b"
    r"|\b(?:middle[\s-]?aged|elderly|teenage|teenager|adolescent|newborn|"
    r"neonate|infant|baby|toddler|primigravida|primipara|pregnan\w+)\b"
    r"|\b(?:man|woman|male|female|boy|girl|lady|gentleman|patient|mother|"
    r"father|sister|brother|child|adult|couple|person|smoker|athlete|victim|"
    r"surgeon|resident|doctor|nurse|intern|professor|student|worker|farmer|"
    r"driver|team)\b",
    re.I,
)
CLINICAL_CASE = re.compile(
    r"\b(?:presents?|presented|presenting|complains?|complained|was brought|"
    r"is brought|brought to|was admitted|is admitted|admitted to|underwent|"
    r"comes to|came to|you see|you notice|you observe|you are examining|"
    r"you are posted|is scheduled|was scheduled|has difficulty|had difficulty|"
    r"sustained|was drugged|rushed to|met with|became pregnant|you suffer|"
    r"is being evaluated|was being evaluated|posted for|you are asked to examine|"
    r"is asked to examine|is asked|was asked|was done|is done|is planning|"
    r"was planning|receives|received|had consumed|is found|was found|"
    r"is suspected|was suspected|developed|develops|is given|was given)\b"
    r"|\b\d+(?:\.\d+)?\s*(?:mg/dl|mmol/l|meq/l|g/dl|mg%|iu/l|ng/ml|pg/ml|"
    r"µg/ml|ug/ml|mmhg|/min|bpm|mg/24h|g/24h)\b"
    r"|\b(?:bp|blood pressure)\s*[:=]?\s*\d{2,3}\s*/\s*\d{2,3}\b"
    r"|\b(?:pulse|hr|heart rate)\s*[:=]?\s*\d{2,3}\b"
    r"|\bHbA1c\b"
    r"|\b(?:on|general|clinical|physical|local) examination\b"
    r"|\bexamination (?:reveals|shows|findings?|is|was)\b"
    r"|\bhas been diagnosed with\b|\bwas diagnosed with\b|\bis diagnosed with\b"
    r"|\bhas been on\b|\bis being treated\b|\bwas being treated\b",
    re.I,
)


def is_clinical(text):
    """A vignette: a patient anchor AND case evidence (narrative or measured value)."""
    return bool(CLINICAL_ANCHOR.search(text) and CLINICAL_CASE.search(text))


RULES = {
    "Numbers": re.compile(
        r"\bhow many\b|\bhow long\b|\bhow much\b|\bhow frequently\b"
        r"|\bwhat is the (?:average|normal|maximum|minimum|total|usual|expected)\b"
        r"|\b(?:average|normal|maximum|minimum|usual) (?:dose|dosage|duration|"
        r"level|value|number|age|time|amount|volume|length|size)\b"
        r"|\bwhat (?:percentage|proportion|fraction)\b"
        r"|\bwithin how many\b|\bat what (?:age|time|week|month|hour|day)\b"
        r"|\bhow many (?:days|weeks|months|years|hours|minutes|doses|mg|ml|units)\b"
        r"|\bwhat is the (?:half[\s-]?life|generation time|incubation period)\b",
        re.I,
    ),
    "Problems": re.compile(
        r"\bcalculate\b|\bcalculation\b|\bcompute\b|\bformula\b|\bderive\b"
        r"|\bfirst[\s-]order kinetics\b|\bzero[\s-]order kinetics\b"
        r"|\bvolume of distribution\b|\bclearance\b|\bhow much drug\b"
        r"|\bwhat (?:dose|dosage|size|amount|volume) (?:would|should|will|is)\b"
        r"|\b(?:given|administered) .{0,40}\b(?:excreted|remaining|eliminated)\b"
        r"|\bendotracheal tube\b[^.]{0,40}\bsize\b|\bappropriate size\b"
        r"|\brequired (?:dosage|dose|amount|volume)\b|\bmg\/kg\b|\bmcg\/kg\b",
        re.I,
    ),
    # Case-sensitive on purpose: the eponym name is a proper noun, so "Which
    # test" must not match while "Goodsall's rule" must.
    "Eponyms": re.compile(
        r"\b[A-Z][a-z]{2,}(?:['\u2019]s)\s+(?:rule|sign|syndrome|disease|triad|"
        r"classification|criteria|index|score|test|maneuver|manoeuvre|law|"
        r"phenomenon|method|technique|procedure|grading|staging|scale|formula|"
        r"sequence|reaction|anomaly|defect|tumor|tumour|syndromes)\b"
        r"|\b[A-Z][a-z]{2,}(?:\s+(?:and|of|de|von|van|the)?\s*[A-Z][a-z]{2,}){1,3}"
        r"\s+(?:syndrome|criteria|classification|grading|staging|index|score|"
        r"rule|law|phenomenon|triad|disease|test|sign)\b"
    ),
    "TheCommons": re.compile(
        r"\bmost common\b|\bcommonest\b|\bmost frequent\b"
        r"|\bmost often\b|\bmost typical\b|\busually (?:the|caused|seen|present)\b"
        r"|\bmost common(?:ly)?\b|\bthe commonest\b"
        r"|\bmost (?:common) (?:cause|causes|organism|site|type|"
        r"presentation|complication|finding)\b",
        re.I,
    ),
    "Instruments": re.compile(
        r"\binstrument\b|\bscissors\b|\bforceps\b|\bcatheter\b|\bneedle holder\b"
        r"|\bsuture\b|\bspeculum\b|\bretractor\b|\bclamp\b|\blaryngeal mask\b"
        r"|\bLMA\b|\bendotracheal tube\b|\bbougie\b|\btrocar\b|\bscalpel\b"
        r"|\blaryngoscope\b|\botoscope\b|\bophthalmoscope\b|\bproctoscope\b"
        r"|\bsigmoidoscope\b|\btonometer\b|\bgonioscope\b|\bperimeter\b"
        r"|\bprobe\b|\bcannula\b|\bdilator\b|\bintroducer\b|\bstent\b"
        r"|\bpessary\b|\bventouse\b|\bamnihook\b|\bcurette\b|\blaparoscope\b"
        r"|\bcystoscope\b|\bnephroscope\b|\btracheostomy tube\b|\bchest tube\b",
        re.I,
    ),
    "Criteria": re.compile(
        r"\bcriteria\b|\bcriterion\b|\bclassification\b|\bgrading\b|\bstaging\b"
        r"|\bscore\b|\bscoring system\b|\bindex\b|\bclass\s*[IVX]+\b"
        r"|\bTNM\b|\bChild[\s-]?Pugh\b|\bMELD\b|\bRanson\b|\bAPACHE\b"
        r"|\bGlasgow\b|\bBishop\b|\bBreslow\b|\bClark\b|\bFIGO\b|\bBethesda\b"
        r"|\bKellgren\b|\bSackett\b|\bLight'?s criteria\b|\bDuke criteria\b"
        r"|\bWHO (?:classification|criteria|grading)\b|\bdefinitions\b"
        r"|\bwhich of the following (?:is|are) (?:a|the) (?:criteria|classification)\b",
        re.I,
    ),
    "DrugOfChoice": re.compile(
        r"\bdrug of choice\b|\btreatment of choice\b|\bdrugs? of choice\b"
        r"|\bfirst[\s-]line (?:drug|agent|therapy|treatment|antimicrobial|antibiotic)\b"
        r"|\bbest (?:drug|antibiotic|antimicrobial|agent|treatment)\b"
        r"|\bpreferred (?:drug|agent|treatment|therapy)\b"
        r"|\bwhich (?:drug|antibiotic|antimicrobial|agent)\b"
        r"|\bmost appropriate (?:drug|antibiotic|antimicrobial|agent)\b"
        r"|\b(?:drug|agent) of choice\b|\bideal (?:drug|agent)\b",
        re.I,
    ),
    "InvestigationsOfChoice": re.compile(
        r"\binvestigation of choice\b|\btest of choice\b|\bgold standard\b"
        r"|\bconfirmatory test\b|\bdiagnostic (?:test|investigation|modality) of choice\b"
        r"|\bbest (?:investigation|test|imaging|diagnostic|radiological)\b"
        r"|\bwhich (?:test|investigation|imaging|radiological|serological|"
        r"laboratory|lab) (?:should|is|would|will|can|must)\b"
        r"|\bmost appropriate (?:test|investigation|imaging|radiological)\b"
        r"|\bwhich of the following (?:tests|investigations|imaging)\b"
        r"|\bwhat (?:investigation|test) (?:should|would|is|will)\b",
        re.I,
    ),
    "Controversial": re.compile(
        r"\bcontroversial\b|\bcontroversy\b|\bdebated\b|\bconflicting\b"
        r"\bno consensus\b|\bdiffering opinion\b|\bdisputed\b",
        re.I,
    ),
    "Slides": re.compile(
        r"\bidentify the\b|\bwhat (?:type|kind) of\b[^.]{0,30}\bshown\b"
        r"|\bshown (?:in|by|on) the (?:image|figure|slide|picture|photograph)\b"
        r"|\bthe (?:following|given|above) (?:image|figure|slide|picture|"
        r"photograph|smear|film|specimen|slide)\b"
        r"|\bwhat is (?:shown|seen|depicted) (?:in|by|on)\b"
        r"|\bidentify this\b|\bname the (?:organism|structure|lesion)\b",
        re.I,
    ),
}


def rule_tags(q):
    """Rules that depend on the question text only."""
    # Tags describe what the *question* asks, so only the stem is matched.
    # Matching the solution as well made the chip meaningless: a Cardiology stem
    # whose explanation happened to say "drug of choice" was tagged #Drug_OfChoice,
    # and "clearance"/"suture" in an explanation tagged #Problems/#Instruments.
    text = qtext(q)
    tags = set()
    if is_clinical(text):
        tags.add("Clinical")
    for tag, pattern in RULES.items():
        # Slides is handled after the image check: a "slide" tag must point at an
        # image that is actually present, otherwise the chip is misleading.
        if tag == "Slides":
            continue
        if pattern.search(text):
            tags.add(tag)
    imgs = images(q)
    if imgs:
        tags.add("ImageBased")
        if any(u.lower().split("?")[0].endswith(".gif") or ".gif" in u.lower() for u in imgs):
            tags.add("GIFBased")
    if "ImageBased" in tags and RULES["Slides"].search(text):
        tags.add("Slides")
    return tags


# ------------------------------------------------------- topic nearest-neigh --
class TopicModel:
    """Nearest-neighbour subject/topic assignment over the Edition 8 qBank."""

    def __init__(self, qbank):
        self.rows = []                       # (subject, topic_key, token_set)
        self.inv = collections.defaultdict(list)
        self.subj_tokens = collections.defaultdict(collections.Counter)
        df = collections.Counter()
        sets = []
        for q in qbank:
            subject = q["_subject"]
            key = q["_topic"]
            toks = set(words(qtext(q)))
            sets.append(toks)
            self.rows.append((subject, key, toks))
            for w in toks:
                df[w] += 1
        for i, toks in enumerate(sets):
            for w in toks:
                if df[w] <= 180:
                    self.inv[w].append(i)
        for subject, _key, toks in self.rows:
            self.subj_tokens[subject].update(toks)
        self.row_index = {id(q): i for i, q in enumerate(qbank)}
        self.df = df
        self.total = max(1, len(self.rows))

    def best(self, text, prefer_subject=None, min_ratio=0.34, exclude=None):
        toks = set(words(text))
        if not toks:
            return None, 0.0
        cand = collections.Counter()
        for w in sorted(toks):            # sorted: stable across interpreter runs
            for i in self.inv.get(w, ()):  # rare-ish tokens only
                if exclude is not None and i in exclude:
                    continue
                cand[i] += 1
        # Explicit tie-break on the corpus index so the choice never depends on
        # Counter insertion order (which set iteration would otherwise leak).
        ranked = sorted(cand.items(), key=lambda kv: (-kv[1], kv[0]))[:200]
        best = (None, 0.0)
        for i, shared in ranked:
            subject, key, qt = self.rows[i]
            if prefer_subject and subject != prefer_subject:
                continue
            if not qt:
                continue
            ratio = shared / min(len(toks), len(qt))
            if ratio > best[1]:
                best = ((subject, key), ratio)
        if best[1] >= min_ratio:
            return best[0], best[1]
        return None, best[1]

    def best_subject(self, text, exclude=None):
        toks = set(words(text))
        if not toks:
            return None, 0.0
        scores = {}
        for i, (subject, _key, qt) in enumerate(self.rows):
            if exclude is not None and i in exclude:
                continue
            score = 0.0
            for w in sorted(toks):
                if w in qt:
                    score += 1.0 / (1.0 + self.df[w])
            if score:
                scores[subject] = scores.get(subject, 0.0) + score
        if not scores:
            return None, 0.0
        subject = min(scores, key=lambda s: (-scores[s], s))
        return subject, scores[subject]

    def best_topic_in(self, text, subject, min_ratio=0.18, exclude=None):
        return self.best(text, prefer_subject=subject, min_ratio=min_ratio, exclude=exclude)


def clean_name(value):
    value = re.sub(r"\.json$", "", str(value or ""), flags=re.I)
    value = re.sub(r"^\d+[_ -]*", "", value)
    value = value.replace("_", " ")
    return re.sub(r"\s+", " ", value).strip()


# ------------------------------------------------------------------- loading --
def load_payload():
    text = PAGE.read_text(encoding="utf-8")
    match = PAYLOAD_RE.search(text)
    if not match:
        raise SystemExit("Embedded payload block not found in custom-module.html")
    raw = gzip.decompress(base64.b64decode(match.group(1)))
    return json.loads(raw)


def qbank_records(payload):
    rows = []
    for path, questions in payload["files"].items():
        if not path.startswith(SOURCE_PREFIX):
            continue
        suffix = path[len(SOURCE_PREFIX):]
        if "/" not in suffix:
            continue
        subject, file = suffix.split("/", 1)
        key = subject + "|" + file
        for q in questions:
            rec = dict(q)
            rec["_subject"] = subject
            rec["_topic"] = key
            rows.append(rec)
    return rows


# ------------------------------------------------------------------ classify --
def classify(payload, existing_tags):
    qbank = qbank_records(payload)
    model = TopicModel(qbank)

    # 1. AI tags for the qBank itself.
    qbank_ai = {}
    for q in qbank:
        code = str(q.get("question_id") or "")
        if not code:
            continue
        tags = rule_tags(q)
        if tags:
            qbank_ai[code] = sorted(tags)

    # 2. tagExtras: subject + topic + AI tags.
    tag_extras = []
    for row in payload.get("tagExtras", []):
        tags = rule_tags(row)
        hit, _ratio = model.best(qtext(row))
        subject = hit[0] if hit else None
        topic = hit[1] if hit else None
        if not subject:
            subject, sscore = model.best_subject(qtext(row))
            if sscore <= 0:
                subject = None
        if subject and not topic:
            hit2, _r2 = model.best_topic_in(qtext(row), subject)
            if hit2:
                topic = hit2[1]
        tag_extras.append({
            "question_id": str(row.get("question_id") or ""),
            "_subject": subject,
            "_topic": topic,
            "_ai_tags": sorted(tags),
        })

    # 3. pyqExtras: topic + AI tags (subject already known).
    pyq_extras = []
    for row in payload.get("pyqExtras", []):
        tags = rule_tags(row)
        subject = row.get("_subject")
        topic = None
        # The subject from the paper filename is authoritative, so a topic is
        # only ever taken from that same subject. An unplaceable question keeps
        # subject + the old all-topics rule rather than borrowing another
        # subject's topic.
        hit, _r = model.best(qtext(row), prefer_subject=subject)
        if hit:
            topic = hit[1]
        else:
            hit2, _r2 = model.best_topic_in(qtext(row), subject)
            if hit2:
                topic = hit2[1]
        pyq_extras.append({
            "question_id": str(row.get("question_id") or ""),
            "_subject": subject,
            "_topic": topic,
            "_ai_tags": sorted(tags),
        })
    return qbank_ai, tag_extras, pyq_extras


# -------------------------------------------------------------------- report --
def evaluate(model, qbank, sample, seed=13):
    """Leave-one-out accuracy on a sample of qBank questions (truth = folder)."""
    import random
    rng = random.Random(seed)
    rows = [q for q in qbank if words(qtext(q))]
    rng.shuffle(rows)
    rows = rows[:sample]
    subj_ok = top_ok = top_try = 0
    for i, q in enumerate(rows):
        idx = model.row_index.get(id(q))
        exclude = {idx} if idx is not None else None
        text = qtext(q)
        hit, _r = model.best(text, exclude=exclude)
        if hit and hit[0] == q["_subject"]:
            subj_ok += 1
        if hit:
            top_try += 1
            if hit[1] == q["_topic"]:
                top_ok += 1
    n = max(1, len(rows))
    print("=" * 78)
    print("Leave-one-out accuracy on %d qBank questions" % len(rows))
    print("=" * 78)
    print("  subject correct      : %d / %d  (%.1f%%)" % (subj_ok, len(rows), 100.0 * subj_ok / n))
    print("  topic tried / correct: %d / %d  (%.1f%% of tries)"
          % (top_try, top_ok, 100.0 * top_ok / max(1, top_try)))


def order_tags(tags):
    order = ["ImageBased", "DrugOfChoice", "AIIMS", "RecentUpdates", "TheCommons",
             "Controversial", "recentNEET", "Criteria", "Clinical", "Eponyms",
             "Instruments", "GIFBased", "InvestigationsOfChoice", "Slides",
             "Numbers", "Problems"]
    return sorted(set(tags), key=lambda t: (order.index(t) if t in order else 999, t))


def write_overlay(qbank_ai, tag_extras, pyq_extras):
    overlay = {
        "schema": 1,
        "method": "deterministic rules (scripts/classify-mcq-tags.py); no model, no network",
        "note": ("#recentNEET/#AIIMS/#RecentUpdates are exam-history tags and are never "
                 "assigned here. #ImageBased/#GIFBased are decided by the presence of an "
                 "image / a .gif URL, never by judgement."),
        "qbank": qbank_ai,
        "tagExtras": {r["question_id"]: {"subject": r["_subject"], "topic": r["_topic"],
                                         "tags": r["_ai_tags"]}
                      for r in tag_extras if r["question_id"]},
        "pyqExtras": {r["question_id"]: {"subject": r["_subject"], "topic": r["_topic"],
                                         "tags": r["_ai_tags"]}
                      for r in pyq_extras if r["question_id"]},
    }
    OVERLAY_ASSET.write_text(
        json.dumps(overlay, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print("wrote", OVERLAY_ASSET.relative_to(ROOT),
          "| qBank AI tags", len(qbank_ai), "| extras", len(tag_extras) + len(pyq_extras))


def update_tag_asset(existing_asset, qbank_ai, clinical_only=False):
    questions = existing_asset["questions"]
    per_tag = collections.Counter()
    for code, tags in questions.items():
        if clinical_only:
            # #Clinical is *replaced* (the previous rule over-tagged it); every
            # other tag is carried over untouched.
            union = (set(tags) - {"Clinical"}) | (set(qbank_ai.get(code, ())) & {"Clinical"})
        else:
            union = set(tags) | set(qbank_ai.get(code, ()))
        # Never let this pass add or drop an exam-history tag.
        union = {t for t in union if t not in EXAM_TAGS} | (set(tags) & EXAM_TAGS)
        questions[code] = order_tags(union)
    # qBank codes that had no Mini Test tag can still gain AI tags.
    for code, tags in qbank_ai.items():
        if code not in questions:
            questions[code] = order_tags(tags)
    for tags in questions.values():
        per_tag.update(tags)
    counts = existing_asset.setdefault("counts", {})
    counts.update({
        "tagged": len(questions),
        "multi": sum(1 for v in questions.values() if len(v) >= 2),
        "assignments": sum(len(v) for v in questions.values()),
        "untagged": counts.get("qbankCodes", 0) - len(questions) if counts.get("qbankCodes") else counts.get("untagged", 0),
    })
    for row in existing_asset["tags"]:
        row["count"] = per_tag[row["id"]]
    existing_asset["aiAssisted"] = True
    existing_asset["aiSource"] = "scripts/classify-mcq-tags.py (rules)"
    TAG_ASSET.write_text(
        json.dumps(existing_asset, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print("updated", TAG_ASSET.relative_to(ROOT),
          "| tagged qBank codes", counts["tagged"], "| assignments", counts["assignments"])


def patch_payload_html(payload, tag_extras, pyq_extras, clinical_only=False):
    ai_by_id = {r["question_id"]: r for r in tag_extras}
    pyq_by_id = {r["question_id"]: r for r in pyq_extras}

    def merge(existing, added):
        if not clinical_only:
            return order_tags(list(existing or []) + added)
        # #Clinical is re-derived, so the stale value must be dropped before the
        # fresh one is unioned in; every other tag is left as it was.
        return order_tags([t for t in (existing or []) if t != "Clinical"] + added)

    for row in payload.get("tagExtras", []):
        upd = ai_by_id.get(str(row.get("question_id") or ""))
        if not upd:
            continue
        row["_subject"] = upd["_subject"]
        row["_topic"] = upd["_topic"]
        row["_tags"] = merge(row.get("_tags"), upd["_ai_tags"])
    for row in payload.get("pyqExtras", []):
        upd = pyq_by_id.get(str(row.get("question_id") or ""))
        if not upd:
            continue
        if upd["_topic"]:
            row["_topic"] = upd["_topic"]
        row["_tags"] = merge(row.get("_tags"), upd["_ai_tags"])

    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    gz = gzip.compress(raw, 9, mtime=0)
    b64 = base64.b64encode(gz).decode("ascii")
    page = PAGE.read_text(encoding="utf-8")
    match = PAYLOAD_RE.search(page)
    page = page[:match.start(1)] + b64 + page[match.end(1):]
    PAGE.write_text(page, encoding="utf-8")
    print("patched", PAGE.name, "| gzip", len(gz), "bytes | base64", len(b64), "chars")
    return {"embeddedGzipBytes": len(gz), "embeddedBase64Chars": len(b64),
            "embeddedSha256": __import__("hashlib").sha256(gz).hexdigest()}


def update_data_manifest(stats, payload, tag_extras, pyq_extras):
    path = ROOT / "assets" / "custom-module-data-manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    per_tag = collections.Counter()
    for tags in json.loads(TAG_ASSET.read_text(encoding="utf-8"))["questions"].values():
        per_tag.update(tags)
    manifest.update(stats)
    manifest["perTag"] = dict(per_tag)
    manifest["tagOnlyExtras"] = len(tag_extras)
    manifest["pyqExtras"] = len(pyq_extras)
    manifest["pyqExtrasByTag"] = dict(collections.Counter(
        r["_tag"] for r in payload.get("pyqExtras", [])))
    manifest["pyqExtrasMultiTag"] = sum(1 for r in payload.get("pyqExtras", [])
                                        if len(r.get("_tags") or []) > 1)
    manifest["tagExtrasByTag"] = dict(collections.Counter(
        t for r in payload.get("tagExtras", []) for t in (r.get("_tags") or [])))
    manifest["taggedQbankCodes"] = len(json.loads(TAG_ASSET.read_text(encoding="utf-8"))["questions"])
    manifest["rules"] = {
        "fmge": "tag evidence only; no FMGE question is emitted",
        "web5Pyq": "removed entirely",
        "examTags": "QBank Hub Marrow PYQ exam_family only; #recentNEET/#AIIMS/#RecentUpdates are never assigned by the classifier",
        "tagOnlyExtras": ("subject + AI topic when the classifier placed the question (admitted for that "
                          "subject/topic); otherwise all 19 subjects in scope only, and only when its tag is selected"),
        "pyqExtras": ("subject + AI topic when placed (admitted for that subject/topic); otherwise the "
                      "selected subject with ALL topics selected; inclusive tag match (ANY of its tags, "
                      "including #recentNEET/#AIIMS, admits it)"),
        "aiTags": ("13 non-exam tags assigned by rules over the whole pool and unioned with the Mini Test "
                   "tags; #ImageBased/#GIFBased are objective (image present / GIF URL)"),
    }
    manifest["aiClassified"] = {
        "script": "scripts/classify-mcq-tags.py",
        "method": "deterministic rules; no model, no network",
        "tagExtrasWithSubject": sum(1 for r in tag_extras if r["_subject"]),
        "tagExtrasWithTopic": sum(1 for r in tag_extras if r["_topic"]),
        "pyqExtrasWithTopic": sum(1 for r in pyq_extras if r["_topic"]),
    }
    universe, raw = build_universe(payload, json.loads(TAG_ASSET.read_text(encoding="utf-8"))["questions"])
    deg = collections.Counter(len(u["tags"]) for u in universe)
    manifest["universe"] = {
        "rawRecords": raw,
        "distinctQuestions": len(universe),
        "tagDegree": {str(k): deg[k] for k in sorted(deg)},
        "taggedQuestions": len(universe) - deg[0],
        "tagAssignments": sum(n * c for n, c in deg.items()),
    }
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
                    encoding="utf-8")
    print("updated", path.relative_to(ROOT))


def build_universe(payload, qmap):
    """Every distinct question the maker can emit, deduped across all sources.

    Mirrors the maker exactly: identity is the question text *as the maker sees
    it* (withImages appends one <img src> per image URL, so image URLs are part
    of the identity) plus the sorted normalised options. A question can appear
    in Edition 8 qBank, in a Mini Test and in a PYQ paper with HTML, entity and
    whitespace differences; those copies collapse to one row. qBank wins a tie
    (it is the subject/topic-categorised base pool), then Mini Test, then PYQ.
    PYQ copies already present in qBank are dropped, matching the maker.
    """
    def opts_of(r):
        ch = r.get("choices") or []
        return [str(c.get("text", "") if isinstance(c, dict) else c) for c in ch]

    def text_of(r):
        out = str(r.get("text") or "")
        seen = set(m.group(1) for m in
                   re.finditer(r'<img\b[^>]*\bsrc=["\']([^"\']+)["\']', out, re.I))
        for u in (r.get("question_images") or []):
            url = u if isinstance(u, str) else (u.get("url") or u.get("src") or u.get("image_url"))
            if not url or not re.match(r"^https?:", url, re.I) or url in seen:
                continue
            seen.add(url)
            out += ' <img src="%s">' % url
        return out

    def nkey(r):
        return N(text_of(r)) + "\0" + "\0".join(sorted(N(o) for o in opts_of(r)))

    def stem(r):
        s = N(text_of(r))[:60]
        return s if len(s) >= 30 else ""

    def row_tags(row):
        # The maker merges a record's inline tags with its canonical-index entry,
        # so mirror that exactly (index alone for qBank, which has no inline tags).
        tags = set(row.get("_tags") or [])
        tags |= set(qmap.get(str(row.get("question_id") or ""), []))
        return tags

    rows = {}
    qbank_ids = set()
    qbank_stems = set()
    twin_by_id = {}
    twin_by_stem = {}
    raw = 0
    for _path, questions in payload["files"].items():
        for q in questions:
            raw += 1
            cid = str(q.get("question_id") or "")
            qbank_ids.add(cid)
            st = stem(q)
            if st:
                qbank_stems.add(st)
            k = nkey(q)
            if k in rows:
                rows[k]["tags"] |= set(qmap.get(cid, []))
            else:
                rows[k] = {"id": cid, "source": "qBank",
                           "tags": set(qmap.get(cid, []))}
            twin_by_id.setdefault(cid, rows[k])
            if st:
                twin_by_stem.setdefault(st, rows[k])
    for row in payload.get("tagExtras", []):
        raw += 1
        k = nkey(row)
        if k in rows:
            rows[k]["tags"] |= row_tags(row)
        else:
            rows[k] = {"id": str(row.get("question_id") or ""), "source": "MiniTest",
                       "tags": row_tags(row)}
        cid = str(row.get("question_id") or "")
        st = stem(row)
        twin_by_id.setdefault(cid, rows[k])
        if st:
            twin_by_stem.setdefault(st, rows[k])
    for row in payload.get("pyqExtras", []):
        raw += 1
        pid = str(row.get("question_id") or "")
        st = stem(row)
        # A PYQ copy already present in qBank (by code) or sharing a stem is
        # dropped as a duplicate, but its tags are folded onto the survivor so
        # no tag is ever lost with the copy.
        twin = (twin_by_id.get(pid) if pid in qbank_ids else None) or \
               (twin_by_stem.get(st) if st and st in qbank_stems else None)
        if twin is not None:
            twin["tags"] |= row_tags(row)
            continue
        k = nkey(row)
        if k in rows:
            rows[k]["tags"] |= row_tags(row)
        else:
            rows[k] = {"id": pid, "source": "PYQ", "tags": row_tags(row)}
    return list(rows.values()), raw


def universe_report(payload, qmap, sample_n):
    universe, raw = build_universe(payload, qmap)
    print("=" * 78)
    print("Database universe (all sources, deduplicated)")
    print("=" * 78)
    print("  raw records across all sources : %d" % raw)
    print("  distinct questions (no dupes)  : %d" % len(universe))
    by_source = collections.Counter(u["source"] for u in universe)
    print("  after dedupe by source         : qBank %d | MiniTest %d | PYQ %d"
          % (by_source["qBank"], by_source["MiniTest"], by_source["PYQ"]))

    degree = collections.Counter(len(u["tags"]) for u in universe)
    print()
    print("  tag-degree distribution (how many questions carry exactly N tags):")
    for n in sorted(degree):
        label = "0 (untagged)" if n == 0 else str(n)
        print("    %-12s : %6d" % (label, degree[n]))
    tagged = len(universe) - degree[0]
    print("  tagged questions: %d | total tag assignments: %d"
          % (tagged, sum(n * c for n, c in degree.items())))

    print()
    print("  distinct questions per tag:")
    per = collections.Counter()
    for u in universe:
        for t in u["tags"]:
            per[t] += 1
    for t in ["ImageBased", "DrugOfChoice", "AIIMS", "RecentUpdates", "TheCommons",
              "Controversial", "recentNEET", "Criteria", "Clinical", "Eponyms",
              "Instruments", "GIFBased", "InvestigationsOfChoice", "Slides",
              "Numbers", "Problems"]:
        print("    %-24s %6d" % ("#" + t, per[t]))
    return universe, degree, per


def report(qbank_ai, tag_extras, pyq_extras, existing, sample_n):
    print("=" * 78)
    print("AI tag coverage over the full pool")
    print("=" * 78)
    per = collections.Counter()
    for tags in qbank_ai.values():
        for t in tags:
            per[t] += 1
    for t in AI_TAGS:
        base = sum(1 for v in existing.values() if t in v)
        print("  %-24s existing %5d  ->  +qBankAI %5d" % (t, base, per[t]))

    print()
    print("=" * 78)
    print("tagExtras subject/topic coverage")
    print("=" * 78)
    n = len(tag_extras)
    got_subject = sum(1 for r in tag_extras if r["_subject"])
    got_topic = sum(1 for r in tag_extras if r["_topic"])
    print("  %d extras | subject assigned %d (%.1f%%) | topic assigned %d (%.1f%%)"
          % (n, got_subject, 100.0 * got_subject / max(1, n),
             got_topic, 100.0 * got_topic / max(1, n)))
    for r in tag_extras[:sample_n]:
        print("   ", r["question_id"], "|", r["_subject"], "|", r["_topic"], "|", ",".join(r["_ai_tags"]))

    print()
    print("=" * 78)
    print("pyqExtras topic coverage")
    print("=" * 78)
    n = len(pyq_extras)
    got_topic = sum(1 for r in pyq_extras if r["_topic"])
    print("  %d extras | topic assigned %d (%.1f%%)"
          % (n, got_topic, 100.0 * got_topic / max(1, n)))
    for r in pyq_extras[:sample_n]:
        print("   ", r["question_id"], "|", r["_subject"], "|", r["_topic"], "|", ",".join(r["_ai_tags"]))


def rebuild_by_topic(asset, payload):
    """Keep mcq-tags.json 'byTopic' consistent with the unioned tag map."""
    questions = asset["questions"]
    by_topic = {}
    for path, rows in payload["files"].items():
        if not path.startswith(SOURCE_PREFIX):
            continue
        suffix = path[len(SOURCE_PREFIX):]
        if "/" not in suffix:
            continue
        subject, file = suffix.split("/", 1)
        counts = collections.Counter()
        for q in rows:
            code = str(q.get("question_id") or "")
            for t in questions.get(code, ()):
                counts[t] += 1
        if counts:
            by_topic[subject + "|" + file] = dict(counts)
    asset["byTopic"] = by_topic


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--sample", type=int, default=5)
    ap.add_argument("--eval", type=int, default=600, help="leave-one-out sample size")
    ap.add_argument("--clinical-only", action="store_true",
                    help="re-derive only #Clinical; carry every other tag over unchanged")
    args = ap.parse_args()

    payload = load_payload()
    tag_asset = json.loads(TAG_ASSET.read_text(encoding="utf-8"))
    existing = tag_asset["questions"]
    qbank_ai, tag_extras, pyq_extras = classify(payload, existing)
    if args.clinical_only:
        # Only #Clinical is being re-derived; discard every other tag this run
        # produced so the 11 untouched tags keep their committed values.
        qbank_ai = {c: [t for t in v if t == "Clinical"] for c, v in qbank_ai.items()}
        qbank_ai = {c: v for c, v in qbank_ai.items() if v}
        for r in tag_extras + pyq_extras:
            r["_ai_tags"] = [t for t in r["_ai_tags"] if t == "Clinical"]
    model = TopicModel(qbank_records(payload))
    evaluate(model, qbank_records(payload), args.eval)
    report(qbank_ai, tag_extras, pyq_extras, existing, args.sample)
    # Report the universe with this run's overlay already applied, otherwise the
    # per-tag table describes the asset as it was *before* classification.
    merged = {c: list(set(existing.get(c, ())) | set(qbank_ai.get(c, ())))
              for c in set(existing) | set(qbank_ai)}
    universe, degree, per_tag = universe_report(payload, merged, args.sample)
    if args.dry_run:
        print("\n[dry-run] nothing written.")
        return 0

    write_overlay(qbank_ai, tag_extras, pyq_extras)
    update_tag_asset(tag_asset, qbank_ai, clinical_only=args.clinical_only)
    rebuild_by_topic(tag_asset, payload)
    TAG_ASSET.write_text(
        json.dumps(tag_asset, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n",
        encoding="utf-8",
    )
    stats = patch_payload_html(payload, tag_extras, pyq_extras, clinical_only=args.clinical_only)
    update_data_manifest(stats, payload, tag_extras, pyq_extras)

    import subprocess
    rc = subprocess.call([sys.executable, str(ROOT / "scripts" / "embed-mcq-tags.py")])
    if rc != 0:
        raise SystemExit("embed-mcq-tags.py failed with exit code %d" % rc)
    print("done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
