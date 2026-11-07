# Additional QBank Hub PYQ codes in MCQ search

The existing ProHTML index and its QBank-first/PYQ lookup behavior remain unchanged. A supplemental index adds **816** distinct codes absent from it: **573 MH**, **227 MG**, and **16 MF**. Together, the two indexes contain **20,807** distinct codes. The supplemental entries come only from the public `marrow-pyq-stage-v1.json.gz` artifact at QBank Hub revision `cfb6dddbf0c4d760080792d953e0582e0e9e6ee7`; they are not a live inventory of the private Supabase database, nor a complete index of its QBank collection.

For example, `MH4348` is present in the artifact (Pathology INI-CET 2026). It is the highest numerically numbered MH code in this snapshot; a larger number is not proof that a question is the most recently added. Codes are exact matches, so not every `MH` number exists. The artifact contains 5,881 distinct PYQ codes, including 5,065 already in the original ProHTML index.

## How it works

1. The existing per-code downloaded cache and original index are checked first. Existing results and remembered answers are not replaced.
2. If the code is absent, the supplemental metadata index identifies its record in the pinned public artifact. The first uncached lookup requires Network access and downloads the approximately 6.7 MB compressed artifact. The browser must support `DecompressionStream('gzip')`; the source must remain publicly available and allow browser access. Where Web Crypto is available the artifact checksum is verified before unpacking.
3. The record is converted to the same question/answer/explanation view and sanitization as other lookups. The source's question and explanation image references are retained. Once successfully opened, that individual question is cached for offline lookup, subject to browser storage. External images may still require network access.

The supplemental index contains metadata only, not the full questions. No private database keys or credentials are used. This feature does not change the Custom Module source. Content rights and permissions remain the responsibility of the deployer.

## Deployment and rollback

Back up the current deployment. Deploy these files together at the existing site origin:

- `assets/mcq-search.js`
- `assets/mcq-qbank-hub-pyq-index.json` (new)
- `sw.js`

Do not replace `index.html`, `custom-module.html`, or the original index, and do not delete other files. Open/reload the site online so the new service worker installs. Search `MH4348`, answer it and check its explanation, then reopen it with Network access disabled. Check an existing code such as `MB1838`, an invalid code, a saved HTML file, and library counts. Do not clear site data or uninstall the PWA.

If rollback is necessary, restore the previous versions of `assets/mcq-search.js` and `sw.js` together and redeploy. The new supplemental index can remain unused; no library, answer or downloaded-question data needs to be deleted. Old cached supplemental questions may remain in the lookup cache until individually cleared through the existing settings; clearing downloaded MCQ text removes all lookup text, not library files or remembered answers.

## Rebuild and test

Download the exact pinned artifact from the repository, then run `python3 scripts/build-qbank-hub-pyq-index.py /path/to/marrow-pyq-stage-v1.json.gz`. The script verifies the artifact SHA-256, rejects conflicting content and invalid answer mappings, and excludes codes in the original index. Updating to a new source revision requires deliberately updating the pinned revision/checksum in both the script and lookup code, then auditing and testing again.

Optional isolated test: install `jsdom@26` and `fake-indexeddb@6` outside the app, then run `NODE_PATH=/path/to/node_modules QBANK_STAGE=/path/to/marrow-pyq-stage-v1.json.gz node tests/qbank-hub-lookup.cjs`. It checks every supplemental mapping and exercises lookup, cache, network policy and old-source precedence using mocked network responses. A real browser/deployment test is still required for source access and visual verification.
