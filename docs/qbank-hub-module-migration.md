# Using the QBank Hub database in the Custom Module maker — plan (NOT switched)

Status: **preparation only**. `custom-module.html` still uses the pinned Marrow
`WEBREPLITX5` source. Nothing in this document changes the live maker. Revision
audited: `amrenkhan07-pixel/qbank-hub` @ `cfb6dddbf0c4d760080792d953e0582e0e9e6ee7`
(current `main`, pushed 2026-10-25; repo last pushed 2026-10-29).

## 1. What "the QBank Hub database" actually is

QBank Hub is a **private Supabase-backed app**, not a public static question
bank. Its real data lives in `https://flulljensjugfcxmeczu.supabase.co` behind
authentication and RLS; the repo contains only migrations, importers, a draft
taxonomy and **read-only staged import artifacts**.

- The live REST endpoint is not reachable from this sandbox (host allowlist) and
  would require an authenticated session anyway. Docs state the live project had
  22,844 PrepLadder payloads, 1,129 PrepLadder source tests and **zero** Marrow
  rows at the 2026-09-20 snapshot. No service-role key is in the repo (correctly).
- `docs/marrow-pyq-staged-import-2026-09-20.md` says **"Production status:
  NO-GO today"** — the staged artifacts were never imported into production.
- `question_tags(id, question_id, tag)` is the canonical tag model, but **no tag
  rows are checked in**; `personal_tags` are per-user. There is no public export
  of the 16 Marrow pedagogical tags.
- This repo **already consumes** the same QBank Hub artifact for MCQ search:
  `assets/mcq-qbank-hub-pyq-index.json` (816 supplemental codes) and
  `assets/mcq-search.js` fetch the pinned, SHA-256-verified
  `marrow-pyq-stage-v1.json.gz` and decompress it with `DecompressionStream`.
  That verified URL, checksum and decompression path can be reused.

Therefore a static Custom Module can only use the **public staged artifacts**
unless the user supplies an authorised export of the live Supabase tables.

### Public staged inventory (all checksum-verified)

| Artifact | Questions | Occurrences | Tests | Subjects | Tags available |
|---|---:|---:|---:|---:|---|
| `marrow-pyq-stage-v1.json.gz` | 5,914 | 5,938 | 342 | 19 | exam family (AIIMS / NEET-PG / INI-CET), exam year 2017–2026, media |
| `core-btr-stage-v1.json.gz` | 14,066 | 19,137 | 284 | 19 | collection flags, 197 topic-test titles, media |
| `prepladder-safe-v1-filter-20260920.json` | 1,355 accepted / 1,399 deferred **reasoning assignments** (2,186 labels), not questions | | | 19 | concept labels |
| `gt-taxonomy/live-taxonomy.json` | 1,026 draft concept families + 1,297 draft concepts | | | 19 | subject + system, all `status: draft` |

Combined renderable MCQs: **19,980** (all have ≥2 options, one resolvable answer
and an explanation). Full normalised index produced by the generator: 36.2 MB.

**Important:** the Marrow PYQ artifact has **342 papers, including 19 INI-CET
2026 papers (200 questions, all 19 subjects)** — this is the 2026 data missing
from the pinned `WEBREPLITX5` source. It also has 19 NEET-PG 2025 papers. It has
no NEET-PG 2026 paper.

## 2. Counts — questions per subject

Distinct questions. "Marrow PYQ" and "Core BTR" are separate corpora; a question
can appear in both (384 Marrow versions matched existing PrepLadder versions), so
the total is a sum of the two staged sets, not a de-duplicated global union.

| # | Subject | Marrow PYQ | Core BTR | Total |
|---:|---|---:|---:|---:|
| 1 | Anatomy | 319 | 699 | 1,018 |
| 2 | Biochemistry | 310 | 825 | 1,135 |
| 3 | Physiology | 316 | 145 | 461 |
| 4 | Pharmacology | 463 | 175 | 638 |
| 5 | Microbiology | 428 | 909 | 1,337 |
| 6 | Pathology | 476 | 378 | 854 |
| 7 | Community Medicine | 399 | 1,164 | 1,563 |
| 8 | Forensic Medicine | 245 | 547 | 792 |
| 9 | Ophthalmology | 212 | 542 | 754 |
| 10 | ENT | 161 | 503 | 664 |
| 11 | Anaesthesia | 113 | 287 | 400 |
| 12 | Dermatology | 162 | 537 | 699 |
| 13 | Psychiatry | 132 | 423 | 555 |
| 14 | Radiology | 133 | 388 | 521 |
| 15 | Medicine | 571 | 2,775 | 3,346 |
| 16 | Surgery | 516 | 1,222 | 1,738 |
| 17 | Orthopaedics | 200 | 348 | 548 |
| 18 | Paediatrics | 254 | 629 | 883 |
| 19 | Obstetrics & Gynaecology | 504 | 1,570 | 2,074 |
| | **Total** | **5,914** | **14,066** | **19,980** |

QBank Hub spellings are normalised (`Orthopedics`→`Orthopaedics`,
`Pediatrics`→`Paediatrics`, `Obstetrics & Gynecology`→`Obstetrics & Gynaecology`,
`Anaesthesiology`→`Anaesthesia`, `Radiodiagnosis`→`Radiology`,
`Otorhinolaryngology`→`ENT`) to keep the maker's exact 19-subject order.

Topic/system rows: 199 distinct titles (197 Core BTR topic tests + "Previous
Year Questions" + "All questions"), 241 per-subject rows.

## 3. Counts — questions per tag

Tags are multi-label, so the sum exceeds 19,980.

| Tag | Questions | Where it comes from |
|---|---:|---|
| `TOPIC_TEST` | 7,797 | Core BTR `in_topic_test` |
| `#ImageBased` | 4,347 | derived: payload has a **question** image (1,465 Marrow + 2,882 Core BTR); explanation-only images excluded |
| `CORE_BTR_PYQ` | 4,304 | Core BTR `is_core_btr_pyq` |
| `#AIIMS` | 3,845 | Marrow `AIIMS` + `INI-CET` exam family |
| `ALL_QBANK_EXCLUDING_PYQ` | 3,685 | Core BTR `in_all_qbank` |
| `ZV_RECOMMENDED` | 3,351 | Core BTR `is_zv_recommended` |
| `#recentNEET` | 2,069 | Marrow `NEET-PG` exam family |
| `HIT_LIST` | 688 | Core BTR `is_hit_list` |

Exam-family detail (distinct Marrow questions): AIIMS 1,459, NEET-PG 2,069,
INI-CET 2,390 (4 questions appear under both AIIMS and INI-CET). Years: 2017
391, 2018 677, 2019 601, 2020 677, 2021 599, 2022 794, 2023 599, 2024 800,
2025 600, **2026 200**.

### Mapping to the existing 16 chips

| Existing chip | QBank Hub equivalent | Count |
|---|---|---:|
| `#AIIMS` | AIIMS + INI-CET exam family | 3,845 |
| `#recentNEET` | NEET-PG exam family | 2,069 |
| `#ImageBased` | payload has a question-placement image (not explanation-only) | 4,347 |
| Other 13 chips (`#Clinical`, `#Criteria`, `#Eponyms`, `#Instruments`, `#Slides`, `#Numbers`, `#Problems`, `#DrugOfChoice`, `#Investigation_ofChoice`, `#RecentUpdates`, `#TheCommons`, `#Controversial`, `#GIFBased`) | **no public source** | 0 |

Five extra collection tags exist and would need new chips, changing the
16-chip layout. A switch therefore **cannot preserve the tag data** unless we
(a) keep the existing `assets/mcq-tags.json` index and join it to QBank Hub
questions by `source_question_id`/question text, or (b) derive proxies by text
heuristics (as the original tag index was built).

### 3.1 Do the other 13 tags work? — short answer: **not natively**

QBank Hub has **no tag column or tag row** for `#Clinical`, `#DrugOfChoice`,
`#Eponyms`, `#Criteria`, `#Instruments`, `#Slides`, `#Numbers`, `#Problems`,
`#Investigation_ofChoice`, `#RecentUpdates`, `#TheCommons`, `#Controversial` or
`#GIFBased`. Only three of the 16 chips have a native equivalent:

| Chip | Native QBank Hub field | Works? |
|---|---|---|
| `#AIIMS` | `exam_family` AIIMS + INI-CET | ✅ 3,845 |
| `#recentNEET` | `exam_family` NEET-PG | ✅ 2,069 |
| `#ImageBased` | `media[].placement == 'question'` | ✅ 4,347 |
| Other 13 | none | ❌ 0 |

There is `question_tags(id, question_id, tag)` in the live schema, but **no tag
rows are checked in**; `personal_tags` are per-user; `exam_tags` only holds exam
names. Words like "clinical", "drug of choice", "eponym" and "image based" do
appear in PrepLadder question stems, explanations and source-test titles (e.g.
`065 Stroke Tia And Image Based Questions`, `074 Recent Updates 2026`), and in a
160-entry draft concept vocabulary — but as **text/evidence, not labels**. The
live app's filters are Platform → Subject → Topic → Subtopic (+ System) and exam;
it has no pedagogical tag filter.

Two ways to make the other chips work after a switch:

1. **Carry over the existing index (exact, limited coverage).** Join
   `assets/mcq-tags.json` to QBank Hub Marrow PYQ questions by
   `source_question_id`. Measured coverage: **5,098 / 5,914 (86.2%)** PYQ
   questions join to `assets/mcq-question-index.json`, and **1,458 / 5,914
   (24.7%)** carry existing 16-tag data. Per-tag counts on those 1,458:
   AIIMS 808, recentNEET 727, ImageBased 100, Clinical 31, Slides 23,
   Numbers 21, Instruments 15, DrugOfChoice 12, Problems 8, Eponyms 8,
   Criteria 8, RecentUpdates 5, TheCommons 4, InvestigationsOfChoice 1.
   **Core BTR cannot be joined** — its `source_question_id` values are things
   like `"1"`, and the 14,066 Core BTR questions would have no pedagogical tags.
2. **Derive them (approximate).** Re-run the original text/title heuristic
   against QBank Hub stems, explanations and 667 PrepLadder source-test titles,
   mapping hits to the 16 chips. This covers all 19,980 questions but is a
   heuristic — exactly the approach that produced the current 3,492-code index,
   with the same precision caveats.

Practical consequence: with QBank Hub alone, the tags page would show three
useful chips and 13 chips that return zero matches. Keeping the current
`assets/mcq-tags.json` recovers them only for the overlapping Marrow PYQ subset.

## 4. Pros and cons

### Pros
1. **2026 exam data.** 19 INI-CET 2026 papers / 200 questions across all 19
   subjects — the single biggest gap in the current pinned source. Also adds
   one extra 2021 paper (342 vs 322 papers).
2. **Bigger, multi-platform pool.** 19,980 questions vs the current 16,373
   qBank + ~3,994 exam-only; includes Cerebellum Core BTR topic tests, PYQs,
   ZV-recommended and hit-list collections.
3. **Richer metadata.** Exact exam family, exam year, collection membership,
   197 topic titles, 4,347 questions with a question-placement image (1,465
   Marrow + 2,882 Core BTR) plus explanation images and 9,588 video metadata
   references, plus a draft concept taxonomy (1,026 families / 1,297 concepts)
   that could power future filters.
4. **Verified, pinned, reusable pipeline.** The repo already has the exact
   revision, SHA-256, raw URL and `DecompressionStream('gzip')` browser code
   (`assets/mcq-search.js`) for the Marrow artifact. No credentials needed.
5. **Fully offline-capable if pre-built.** A generated static index can be
   inlined/fetched like `INLINE_TAG_INDEX`, removing ~1,151 network requests
   per build (829 qBank topics + 322 PYQ papers).
6. **Subject data is first-class.** Every question has an explicit subject, so
   the subject filter stays exact without filename inference.

### Cons / risks
1. **Not the live database.** The checked-in artifacts are *staged, read-only,
   "production not authorized"* imports. The real 22,844-payload PrepLadder
   bank is private; we cannot enumerate or count it. Using only the artifacts
   is not "the whole QBank Hub database".
2. **Live Supabase is inaccessible here** (host allowlist + auth required). A
   true switch needs an authorised export file from the user; a runtime
   Supabase connection would also break the offline PWA and require an
   API key in browser code.
3. **The 16 pedagogical tags are missing (see §3.1).** Only `#AIIMS`,
   `#recentNEET` and `#ImageBased` have native equivalents; 13 of 16 chips
   would have zero questions. 5 new collection tags would need new chips,
   breaking the exact screenshot layout. Keeping the old tag index recovers
   tags for only 1,458 of 5,914 Marrow PYQ questions and none of Core BTR.
4. **Topic hierarchy differs.** Current maker: 192 systems / 829 numbered
   modules from `SYSTEM_MAP`. QBank Hub: 197 topic-test titles, no numbered
   module files, no drill-down subtopics in the public artifacts. The UI can
   stay identical but the listed topics/modules change, and the ▶ drill-down
   needs a new data source (or is reduced to one level).
5. **Content is not Marrow-only.** Core BTR is Cerebellum; the live bank is
   PrepLadder-heavy. This conflicts with the standing "PYQ = Marrow only" scope
   and mixes vendors/explanations.
6. **Different ID space.** QBank Hub uses UUID `question_id`s plus
   `source_question_id` (e.g. `MA0618`, `"1"`). Core BTR source IDs are often
   just `"1"`, so the Reader's MCQ-code lookup and our `assets/mcq-tags.json`
   join only work for Marrow PYQ rows.
7. **Big payload.** 36.2 MB normalised; 17.2 MB compressed artefacts. A static
   inline copy would make `custom-module.html` huge; runtime decompression
   needs `DecompressionStream` (already used, but not on older browsers) and
   Network Access.
8. **Draft/quality caveats.** Taxonomy is 100% `status: draft`; PrepLadder
   reasoning labels are only 1,355 accepted of 2,754 (49%); Marrow PYQ has
   REVIEW_IDENTITY_CANDIDATE rows and 384 PrepLadder matches — dedupe and
   provenance must be handled explicitly.
9. **Licensing.** Third-party content rights remain the deployer's
   responsibility; the existing `THIRD-PARTY-NOTICES.md` would need review.

## 5. Migration plan — exact same layouts, all working functions

### 5.1 Frozen (do not touch)
`REFERENCE_TEMPLATE_B64`, the generated runner/MCQ shape, all CSS in
`custom-module.html`, the 4-step wizard, the exact 19-subject order, the
downward count dropdown (10/25/36/40/50/100), **Choose subjects** unticking
all, topic clearing, ▶ drill-down behaviour, All/Choose tags radio + 16 green
chips, `< Previous` / `NEXT` pinned footer on every page, ✕ + progress dots,
shortfall and zero-match popups, `#tag` chips in explanations, untagged MCQs
showing nothing, `Include untagged MCQs` semantics, `localStorage` persistence,
`postMessage` save to the Reader, and `index.html`/PWA behaviour.

### 5.2 Data layer replacement
1. **Source of truth.** Run `scripts/build-qbank-hub-module.py --source
   <qbank-hub checkout>` to produce `qbank-hub-module.json` (maker-shaped
   questions) + `manifest.json` (subject → topic system map). Both artifacts
   are SHA-256 verified against `cfb6dddb`.
2. **Deliver offline.** Preferred: split the generated index into 19 compact
   per-subject JSON files under `assets/qbank-hub/<n>.json`, referenced by a
   small inlined manifest (`INLINE_QBH_MANIFEST`) so the maker works from the
   Reader's `blob:` URL. Resolve the asset URL with `window.parent.location.href`
   when `location.href` starts with `blob:` (same fix used for the tag index).
   Alternative (no new asset): fetch the pinned `.gz` artifacts at build time
   via the verified raw URL and decompress with `DecompressionStream`, reusing
   `assets/mcq-search.js` logic; heavier but always matches the pinned revision.
3. **`boot()`**: replace the `MANIFEST_URL` parse + `SYSTEM_MAP` construction
   with the inlined subject/topic manifest. Keep `state.subjects`,
   `subjectMap`, `selectedSubjects`, `currentSubject` and `restore()` untouched
   so steps 2–3 render identically. Map QBank Hub names through
   `SUBJECT_ALIAS` to the exact 19 canonical subjects.
4. **`buildJobs()` / `buildModule()`**: replace the ~1,151 absolute
   `raw.githubusercontent.com` fetches with a read from the staged index:
   filter by `activeSubjects()` + `selectedTopics` (mapped to the 199 topic
   titles), then apply the same tag filter, `qbankIds`/stem dedupe, shuffle,
   shortfall popup and `slice(0,count)`. Keep subject gating: never return an
   MCQ whose `s` is not in the active subject set.
5. **`normalize()`**: add a QBank Hub adapter for `question_html`,
   `options[].html`, `correct_keys[0]` → 0-based `a`, `explanation_html`, and
   media references. Keep `appendMcqCode()` only for codes matching
   `^[A-Z]{2}\d{4}$`; Core BTR IDs get no code marker.
6. **Tags**: keep `INLINE_TAG_INDEX` for the existing 16 chips (join by
   `source_question_id` where available), and add QBank Hub's own tags as a
   separate derived map (`#AIIMS`, `#recentNEET`, `#ImageBased` plus the five
   collection flags if the user accepts extra chips). `tagChipsHtml()`,
   `TAG_CHIP_CSS` and `decodeReference()` stay unchanged.
7. **2026**: expose `exam`/`y` from the generator so a future year filter can
   include INI-CET 2026 without any new source.
8. **Media**: keep the current text-only MCQ format by default; if enabled,
   inject image references into `q.q`/`q.e` (the runner's `tidyHtml()` already
   preserves `<img>`), with CSP/network caveats documented.

### 5.3 Switch, QA and rollback
- Switch behind one constant (`const DATA_SOURCE='qbank-hub'`) so the old path
  remains intact and rollback is a one-line revert.
- QA: all 88 current jsdom checks must still pass with a QBank Hub fixture
  (blob URL, all four pages, chip layout, subject gating, 2026 questions,
  shortfall/zero match, chips, untagged explanations, `tidyHtml`), plus new
  checks for alias normalisation, 2026 presence and no foreign-subject leakage.
- Verify `REFERENCE_TEMPLATE_B64` byte-identical, `node --check`, inline index
  equals asset, duplicate IDs none, preview HTTP 200.
- Rollback: restore `custom-module.html` from the previous commit; staged
  generator/counts files are inert.

## 6. What is already staged (ready to use)

- `scripts/build-qbank-hub-module.py` — checksum-verified generator; produced
  19,980 maker-shaped questions and 199 topic titles from the real artifacts.
- `assets/qbank-hub-module-counts.json` — the reproducible counts in §2–§3.
- `/tmp/qbank-hub-module/qbank-hub-module.json` (36.2 MB) and
  `/tmp/qbank-hub-module/manifest.json` — locally generated sample index,
  deliberately NOT committed (large dataset).
- Existing `assets/mcq-search.js` verified raw URL + SHA-256 +
  `DecompressionStream` code, ready to reuse.
- `assets/mcq-qbank-hub-pyq-index.json` — 816 supplemental codes already
  joined to the same pinned artifact.

## 7. Decision needed before flipping

| Option | Pool | Effect |
|---|---:|---|
| A. Marrow PYQ artifact only | 5,914 | Smallest change; keeps 19 subjects, adds INI-CET 2026 + 20 missing papers; loses 829-module layout |
| B. Marrow + Core BTR (recommended static) | 19,980 | Full staged corpus; 199 topics; mixes Cerebellum content |
| C. Live Supabase export | unknown (22,844+ PrepLadder payloads reported) | Requires the user to supply an authorised export; cannot be read from this sandbox |

Until that choice is made, `custom-module.html` remains on the current Marrow
source and all existing behaviour is unchanged.
