#!/usr/bin/env python3
"""Stage QBank Hub's public staged-question artifacts for the Custom Module maker.

This is a PREPARATION tool only. It does not modify custom-module.html and does
not switch the live maker away from the pinned Marrow source. It reads the two
checksum-verified staged artifacts from a QBank Hub checkout and emits:

  <out>/qbank-hub-module.json   full maker-ready question index (large, /tmp)
  <out>/manifest.json           subject -> system/topic map for wizard step 3
  assets/qbank-hub-module-counts.json  small, committed counts artifact

Usage:
  python3 scripts/build-qbank-hub-module.py \
      --source /path/to/qbank-hub --out /tmp/qbank-hub-module

The live QBank Hub database is a private Supabase project and is NOT used here.
Only the public, read-only staged artifacts inside the repository are read.
"""
import argparse
import collections
import gzip
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REVISION = 'cfb6dddbf0c4d760080792d953e0582e0e9e6ee7'
ARTIFACTS = {
    'marrow': ('import-reports/marrow-pyq-stage-v1.json.gz',
               'c3ee2697542afacd49d3931c71ec05f010190394dd2196252ff0c0efc132f76a'),
    'core': ('import-reports/core-btr-stage-v1.json.gz',
             'c9f5de705de40ef4d07608e90003b1752eae18616725c3c049acf9781ea32817'),
}
# QBank Hub / taxonomy spellings -> the maker's exact 19-subject order.
SUBJECT_ORDER = ['Anatomy', 'Biochemistry', 'Physiology', 'Pharmacology', 'Microbiology',
                 'Pathology', 'Community Medicine', 'Forensic Medicine', 'Ophthalmology',
                 'ENT', 'Anaesthesia', 'Dermatology', 'Psychiatry', 'Radiology', 'Medicine',
                 'Surgery', 'Orthopaedics', 'Paediatrics', 'Obstetrics & Gynaecology']
SUBJECT_ALIAS = {
    'Orthopedics': 'Orthopaedics', 'Pediatrics': 'Paediatrics',
    'Obstetrics & Gynecology': 'Obstetrics & Gynaecology',
    'Obstetrics and Gynaecology': 'Obstetrics & Gynaecology',
    'Anaesthesiology': 'Anaesthesia', 'Otorhinolaryngology': 'ENT',
    'Radiodiagnosis': 'Radiology',
}
TAG_LABELS = {
    'AIIMS': '#AIIMS', 'recentNEET': '#recentNEET', 'ImageBased': '#ImageBased',
    'TOPIC_TEST': 'Topic test', 'CORE_BTR_PYQ': 'Core BTR PYQ',
    'ZV_RECOMMENDED': 'ZV recommended', 'ALL_QBANK_EXCLUDING_PYQ': 'All QBank (excl. PYQ)',
    'HIT_LIST': 'Hit list',
}
BTR_FLAGS = [('in_topic_test', 'TOPIC_TEST'), ('is_core_btr_pyq', 'CORE_BTR_PYQ'),
             ('is_zv_recommended', 'ZV_RECOMMENDED'),
             ('in_all_qbank', 'ALL_QBANK_EXCLUDING_PYQ'), ('is_hit_list', 'HIT_LIST')]


def canon_subject(value):
    s = str(value or '').strip()
    return SUBJECT_ALIAS.get(s, s if s in SUBJECT_ORDER else None)


def load(source, kind):
    rel, expected = ARTIFACTS[kind]
    path = Path(source) / rel
    raw = path.read_bytes()
    actual = hashlib.sha256(raw).hexdigest()
    if actual != expected:
        raise ValueError(f'{rel}: SHA-256 mismatch ({actual}); refusing an unverified source')
    return json.loads(gzip.decompress(raw)), {'revision': REVISION, 'path': rel, 'sha256': actual, 'bytes': len(raw)}


def normalize_payload(payload):
    """Convert a QBank Hub payload to the maker's {q,o,a,e} MCQ shape."""
    options = payload.get('options') or []
    keys = payload.get('correct_keys') or []
    texts = [str(o.get('html') or '') for o in options]
    answer = -1
    if len(keys) == 1:
        answer = next((i for i, o in enumerate(options) if o.get('key') == keys[0]), -1)
    if answer < 0:
        answer = next((i for i, o in enumerate(options) if o.get('is_correct')), -1)
    if len(texts) < 2 or answer < 0 or answer >= len(texts):
        return None
    return {
        'q': str(payload.get('question_html') or ''),
        'o': texts,
        'a': answer,
        'e': str(payload.get('explanation_html') or ''),
    }


def has_question_image(payload):
    """#ImageBased means a question image, not an explanation-only image."""
    return any(str(m.get('type') or '').lower() == 'image' and
               str(m.get('placement') or '').lower() == 'question'
               for m in (payload.get('media') or []))


def build(source, out, counts_path):
    marrow, meta_marrow = load(source, 'marrow')
    core, meta_core = load(source, 'core')
    questions = []
    by_subject = collections.defaultdict(collections.Counter)
    by_tag = collections.Counter()
    by_subject_tag = collections.defaultdict(collections.Counter)
    by_year = collections.Counter()
    systems = collections.defaultdict(collections.Counter)
    sources = collections.Counter()

    # --- Marrow PYQ: exam family -> #AIIMS / #recentNEET ---
    occ_by_q = collections.defaultdict(list)
    for o in marrow['occurrences']:
        occ_by_q[o['question_id']].append(o)
    for v in marrow['content_versions']:
        rows = occ_by_q.get(v['question_id'], [])
        subject = canon_subject(v.get('subject') or (rows[0].get('subject') if rows else ''))
        n = normalize_payload(v.get('payload') or {})
        if not subject or not n:
            continue
        tags = set()
        for r in rows:
            fam = r.get('exam_family')
            if fam in ('AIIMS', 'INI-CET'):
                tags.add('AIIMS')
            elif fam == 'NEET-PG':
                tags.add('recentNEET')
            if r.get('year'):
                by_year[int(r['year'])] += 1
        if has_question_image(v["payload"]):
            tags.add('ImageBased')
        g = sorted(tags)
        exams = sorted({str(r.get('exam_family')) for r in rows if r.get('exam_family')})
        years = sorted({int(r['year']) for r in rows if r.get('year')})
        questions.append({**n, 'id': str(v.get('source_question_id_first_seen') or v['question_id']),
                          's': subject, 't': 'Previous Year Questions', 'g': g, 'src': 'Marrow PYQ',
                          'exam': exams, 'y': years})
        by_subject[subject]['Marrow PYQ'] += 1
        sources['Marrow PYQ'] += 1
        for t in g:
            by_tag[t] += 1
            by_subject_tag[subject][t] += 1
        systems[subject]['Previous Year Questions'] += 1

    # --- Core BTR: analytics subject + topic title + collection flags ---
    occ_by_q = collections.defaultdict(list)
    for o in core['occurrences']:
        occ_by_q[o['question_id']].append(o)
    for v in core['content_versions']:
        subject = canon_subject(v.get('analytics_subject'))
        n = normalize_payload(v.get('payload') or {})
        if not subject or not n:
            continue
        rows = occ_by_q.get(v['question_id'], [])
        topic = next((r.get('source_test_title') for r in rows
                      if r.get('collection_type') == 'TOPIC_TEST'), None)
        # Only TOPIC_TEST titles are real topics; collection names such as
        # "All Qbank Qs Excluding Pyqs" are tags, not systems.
        topic = topic or 'All questions'
        tags = {label for flag, label in BTR_FLAGS if v.get(flag)}
        if has_question_image(v["payload"]):
            tags.add('ImageBased')
        g = sorted(tags)
        questions.append({**n, 'id': str(v.get('source_question_id_first_seen') or v['question_id']),
                          's': subject, 't': topic, 'g': g, 'src': 'Core BTR'})
        by_subject[subject]['Core BTR'] += 1
        sources['Core BTR'] += 1
        for t in g:
            by_tag[t] += 1
            by_subject_tag[subject][t] += 1
        systems[subject][topic] += 1

    for s in SUBJECT_ORDER:
        by_subject[s]['Total'] = by_subject[s]['Marrow PYQ'] + by_subject[s]['Core BTR']

    counts = {
        'schema': 1,
        'source': {'repository': 'amrenkhan07-pixel/qbank-hub', 'revision': REVISION,
                   'artifacts': [meta_marrow, meta_core],
                   'note': 'Public read-only STAGED artifacts only; the live Supabase database is private.'},
        'subjectOrder': SUBJECT_ORDER,
        'tagLabels': TAG_LABELS,
        'totals': {'questions': len(questions), 'bySource': dict(sources),
                   'topicRows': sum(len(v) for v in systems.values()),
                   'distinctTopicTitles': len({k for v in systems.values() for k in v}),
                   'years': dict(sorted(by_year.items()))},
        'bySubject': {s: dict(by_subject[s]) for s in SUBJECT_ORDER},
        'byTag': dict(by_tag.most_common()),
        'bySubjectTag': {s: dict(by_subject_tag[s]) for s in SUBJECT_ORDER},
        'systemsBySubject': {s: dict(systems[s].most_common()) for s in SUBJECT_ORDER},
    }

    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    full = {'schema': 1, 'source': counts['source'], 'subjects': SUBJECT_ORDER,
            'tagLabels': TAG_LABELS, 'questions': questions}
    (out / 'qbank-hub-module.json').write_text(
        json.dumps(full, ensure_ascii=False, separators=(',', ':')))
    manifest = {'schema': 1, 'subjects': [
        {'name': s, 'systems': [{'name': k, 'count': v} for k, v in systems[s].most_common()]}
        for s in SUBJECT_ORDER]}
    (out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
    Path(counts_path).write_text(json.dumps(counts, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f"staged {len(questions)} questions; {sum(len(v) for v in systems.values())} topic titles")
    print(f"full index: {out / 'qbank-hub-module.json'} ({(out / 'qbank-hub-module.json').stat().st_size} bytes)")
    print(f"counts:     {counts_path}")


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source', default='.', help='QBank Hub checkout root')
    p.add_argument('--out', default='/tmp/qbank-hub-module', help='output dir for the large index')
    p.add_argument('--counts', default=str(ROOT / 'assets/qbank-hub-module-counts.json'))
    a = p.parse_args()
    build(a.source, a.out, a.counts)
