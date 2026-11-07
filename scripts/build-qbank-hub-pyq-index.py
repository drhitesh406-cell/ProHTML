#!/usr/bin/env python3
"""Index missing codes from QBank Hub's public staged PYQ artifact, without copying question text.

Usage: python3 scripts/build-qbank-hub-pyq-index.py /path/to/marrow-pyq-stage-v1.json.gz
The existing ProHTML index is authoritative for duplicate codes.
"""
import gzip
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REVISION = 'cfb6dddbf0c4d760080792d953e0582e0e9e6ee7'
SHA256 = 'c3ee2697542afacd49d3931c71ec05f010190394dd2196252ff0c0efc132f76a'
URL = f'https://raw.githubusercontent.com/amrenkhan07-pixel/qbank-hub/{REVISION}/import-reports/marrow-pyq-stage-v1.json.gz'


def build(path):
    raw = Path(path).read_bytes()
    if hashlib.sha256(raw).hexdigest() != SHA256:
        raise ValueError('Unexpected artifact SHA-256')
    data = json.loads(gzip.decompress(raw))
    current = json.loads((ROOT / 'assets/mcq-question-index.json').read_text())['questions']
    versions = {v['question_id']: (i, v) for i, v in enumerate(data['content_versions'])}
    result = {}
    for o in data['occurrences']:
        code = re.sub(r'\s+', '', str(o.get('source_question_id') or '').upper())
        if not re.fullmatch(r'[A-Z]{1,8}\d{1,14}', code) or code in current:
            continue
        index, version = versions[o['question_id']]
        p = version['payload']
        if version['source_question_id_first_seen'] != code or len(p['options']) != 4 or len(p['correct_keys']) != 1 or sum(opt['key'] == p['correct_keys'][0] for opt in p['options']) != 1:
            raise ValueError(f'Unsupported source record: {code}')
        hit = [index, o['subject'], o['source_test_title'], version['content_sha256']]
        if code in result and result[code][3] != hit[3]:
            raise ValueError(f'Conflicting versions for {code}')
        result.setdefault(code, hit)
    output = {'schema': 1, 'source': {'revision': REVISION, 'url': URL, 'sha256': SHA256}, 'questions': dict(sorted(result.items()))}
    (ROOT / 'assets/mcq-qbank-hub-pyq-index.json').write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'{len(result)} missing codes indexed; {sum(c.startswith("MH") for c in result)} MH codes')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    build(sys.argv[1])
