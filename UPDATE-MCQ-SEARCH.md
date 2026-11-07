# ProHTML — QBank and PYQ code lookup update

**Version:** QBank + PYQ search v2 · **Prepared:** 24 October 2026  
**Based on:** ProHTML commit `aece418a2240a4caf4389c3cc29478cc7f1a2110`

This is an **update for your existing ProHTML website/PWA**, not a standalone app or an App Store/Play Store package. It preserves the existing reader, Custom Module, normal tests, files, folders and status filters.

## 1. Upload the update — no deletions

Back up your repository first. Extract `ProHTML-MCQ-PYQ-Search-Update.zip`, then add/replace these **six runtime files** in your existing ProHTML repository, keeping these exact paths:

```text
index.html                         replace
custom-module.html                 replace
sw.js                              replace
assets/mcq-search.css              add
assets/mcq-search.js               add
assets/mcq-question-index.json     add
```

- Merge the `assets` folder; **do not replace or delete the whole folder**.
- Keep all other existing files, folders, icons, the manifest, glass assets, notices and licenses.
- Put `index.html` at the existing app root, not inside a new enclosing folder. Upload the extracted files, not just the ZIP.
- Upload all six files together. Updating only `index.html` is not sufficient.
- The guide, verification report and checksum file in this ZIP are documentation; they do not need to be deployed.
- Commit the update and wait for your normal website/GitHub Pages deployment to finish. No build command or additional package is needed.

Open the existing site **online**, reload it, then close and reopen the PWA if needed. The new service worker (`html-reader-mcq-pyq-search-v2`) caches the added search assets. Keep the same site address/origin so your existing locally stored files and preferences remain available. An ordinary update does not clear the library, normal quiz progress or preferences.

**Do not clear site data, uninstall the PWA, or use “Remove all files” to install this update.** Those actions are unnecessary and can remove locally stored data. If an old page remains visible, try a normal browser hard reload while online; check deployment completion and asset paths before changing storage settings.

This app must be served by your website or a local HTTP server; double-clicking an extracted `index.html` as a `file:` URL is not a supported installation method.

## 2. Use the new search

1. In **My HTML** (or Favorites), tap the new magnifying-glass icon beside the existing status filters.
2. Enter a complete database question code, for example **MB1838** (QBank) or **MF5092** (PYQ), then tap **Find MCQ** or press Enter.
3. The question opens in the existing reader with **four options** and the standard test-style layout.
4. Tap an option. The correct/incorrect result, correct answer and explanation appear immediately.
5. Close the reader to return to your library. The previous library filter remains selected.

There is **no timer, submission step, next-question flow, score report or summary page** in this lookup view. Existing normal Custom Module tests retain their own original behavior.

- Only the icon is added to the filter row; the code field appears after tapping it.
- Search uses the pinned QBank **and dedicated coded PYQ papers** from the same database, not just saved HTML files or the active library filter. Dedicated PYQ results show a **PYQ** label and paper name.
- Codes are case-insensitive and whitespace is ignored. Leading zeros are preserved: `MG0531` is not rewritten as `MG531`.
- MA, MB, MC, MD, ME, MF and MG codes present in this bank are supported. It is an exact-code lookup, not a keyword or partial-code search.
- The reader’s **⋯ → Font Size** control enlarges the question, options **and explanation** together.

## 3. Remembered answers — separate from your library

Your selected answer is remembered **on this device, in this browser and site origin**. Looking up the same question again restores that answer and its explanation. This does not add a My HTML file, change favorites, alter normal test progress, or increment the existing status-filter counts.

The first response is locked. Use **Try again** in the question view to clear only that question’s remembered answer and choose again. When the question was opened from a bookmarked subject page, **Try again** and a **Next** button appear beside each other only after the explanation is revealed — even if that question has a remembered answer on the device. **Next** advances through that subject’s bookmarks in the listed order and returns to that subject’s bookmark page after the last one.

Settings now provides two independent controls:

- **Clear MCQ answer history:** removes only remembered lookup answers. Library files, normal quiz progress and downloaded lookup text remain.
- **Clear downloaded MCQ text:** removes the lookup-specific text cache. Remembered answers and library files remain. The next lookup needs an online source fetch before its previous answer can be shown again.

Answers are not cloud-synced. Browser storage restrictions, private browsing, eviction or clearing site data can prevent or remove saved answers. A storage failure is reported rather than silently claiming the answer was saved.

Technical storage is separate: answers use `hr.mcq.answer.v1.<CODE>.<SIGNATURE>` localStorage keys; normalized question text uses the `prohtml-mcq-lookup-v1` IndexedDB database. No answer is sent to an external service.

## 4. QBank + PYQ coverage and offline behavior

The index includes both sections at the same immutable source revision:

```text
Revision:    7442d6f918a7469be0e0941eb39586220dc31ce7
QBank:       Marrow/Edition 8 qBank/
PYQ:         Marrow/Previous Year Question Papers/
```

| Coverage | QBank | Dedicated PYQ papers |
|---|---:|---:|
| Topic/paper JSON files audited | 829 | 322 |
| Question records audited | 16,376 | 5,522 |
| Distinct usable question codes | 16,373 | 5,065 |

**Combined: 19,991 distinct searchable codes**, including **3,618 additional PYQ-only codes**. All 21,898 source records have four options and valid answer mappings. The PYQ section contains **400 records without a usable source question code**; these cannot be found by code, and no synthetic question IDs have been invented for them.

There are 1,447 codes shared by QBank and PYQ. Existing QBank primary matches, cached questions and answer signatures are retained. Where a shared code has differing source content (52 codes), the existing QBank version remains the default. **A dedicated PYQ-only code opens its matching PYQ directly**, with no extra mode or source-selection step. This preserves previous answers instead of silently replacing their question version.

The metadata index contains codes, source locations and fingerprints, **not the full question/answer payloads**. It uses the existing Marrow `question_id` codes; unrelated providers' numeric internal record IDs are not treated as interchangeable question codes.

Source base:
<https://raw.githubusercontent.com/sunday2212/WEBREPLITX5/7442d6f918a7469be0e0941eb39586220dc31ce7/frontend/quizx/Brain/>

A first-time lookup needs internet and **Network access enabled in Settings**. Only the matching QBank topic or PYQ paper JSON is fetched. After a successful lookup, its question, four options and explanation text are cached separately and can be reopened offline, provided browser storage is available and the PWA shell has been cached.

**External question/explanation images are not bundled or guaranteed offline.** They may still need internet and can be blocked when Network access is off. The cached MCQ view uses `srcdoc` so it does not depend on fetching a Blob document while offline.

This searches the coded questions **at that pinned revision**. It is not a live Marrow service and does not automatically include future upstream additions. If the source changes later, regenerate the index for the matching revision. Clear downloaded MCQ text when replacing previously cached question content; source files and the matching index should be updated together.

Question content remains supplied by the existing external source. This update does not grant additional rights to that content.

## 5. Question IDs in new Custom Modules

Newly generated Custom Modules now retain the source `question_id` and display it beside the question number in both the test and review screens. This makes a displayed code available for future lookup.

Previously saved modules are **not overwritten**. If an older module discarded question IDs when it was generated, this update cannot reconstruct those absent IDs inside that saved HTML. Newly generated modules include them.

## 6. Verification

Final automated results against the QBank + PYQ version:

- **101/101 original MCQ feature checks passed** across desktop/phone layouts in Chromium and WebKit, including remembered answers, retries, sanitation, font scaling, cache cleanup, no library/status changes, and generated module IDs.
- **30/30 additional PYQ checks passed**, including complete coded-PYQ metadata coverage, dedicated-paper lookup, immediate feedback, offline persistence, Network access/error handling, old QBank cache/answer compatibility, and no library/count changes.
- **61 existing-reader regression checks passed**, with **one explicit Linux WebKit installed-PWA offline test skip** caused by that runner's Cache API limitation.
- Live, unmocked `MF5092` PYQ lookups and correct-answer feedback succeeded in both Chromium and WebKit. Live QBank `MB1838` lookups were also verified during the initial implementation.
- Chromium installed-PWA offline reload/lookup passed for both QBank and PYQ. Cached-question lookup with network disabled passed in desktop/phone WebKit.
- No uncaught application JavaScript errors in the final suites. Runtime scripts passed syntax checks.

These are automated browser-engine checks, not certification on physical iPhones/Android devices or a native-store release. Both source collections were data-audited; not every question's visual layout was individually browser-tested.

Quick manual checks after deployment:

1. Look up **MB1838** (QBank): the urogenital ridge question should open with four options, and **B — Intermediate mesoderm** should be correct.
2. Look up **MF5092** (PYQ): the NTEP/HIV-TB prevalence question should open with a **PYQ · Community Medicine Ini-Cet 2022** label; **A — >10%** should be correct according to the source.
3. Reopen each code to check answer restoration. Confirm existing files and status-filter counts stay unchanged.

`MCQ-SEARCH-VERIFICATION.json` records file hashes and preservation checks. `MCQ-SEARCH-FILES.sha256` lists hashes of the runtime files and this documentation. Developer test runners and fixtures are not part of this deployment ZIP.
