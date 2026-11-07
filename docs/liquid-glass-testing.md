# Liquid Glass upgrade — verification

Date: 24 October 2026.

## Automated result

**61 checks passed, 1 explicitly skipped; no uncaught application JavaScript errors.**

Tools: Playwright 1.58.2; Chromium 145.0.7632.6 and Playwright WebKit 26.0 on Linux. WebKit tests use isolated persistent profiles for normal-browser IndexedDB Blob support, rather than WebKit's private/ephemeral storage mode.

| Area | Chromium desktop/phone | WebKit desktop/phone |
|---|---|---|
| Shell assets, all four tabs, no nested buttons | Pass / Pass | Pass / Pass |
| Add button anchoring, outside dismissal, Escape, focus return | Pass / Pass | Pass / Pass |
| Empty-library CTA uses its own position | Pass / Pass | Pass / Pass |
| Native picker imports, record counts, stored blobs | Pass / Pass | Pass / Pass |
| File-specific options, menu rebind after redraw, favorites/search | Pass / Pass | Pass / Pass |
| Original HTML scripts, font submenu, slider, reset | Pass / Pass | Pass / Pass |
| Focus mode/floating-menu anchor and offline network choice | Pass / Pass | Pass / Pass |
| Exact right-click/long-press origin; no accidental file open | Pass / Pass | Pass / Pass |
| Native folder picker, nested paths, folder-menu Open | Pass / Pass | Pass / Pass |
| Reload retains files, folders, favorites | Pass / Pass | Pass / Pass |
| Theme/settings and unchanged Custom Module maker open | Pass / Pass | Pass / Pass |
| Resizing and short-landscape edge clamping | Pass / Pass | Pass / Pass |
| Keyboard tabs/menus, focus trap, Reduce Motion | Pass / Pass | Pass / Pass |
| Delete selected fixture only; other records unaffected | Pass / Pass | Pass / Pass |

Additional scenarios:

- **Spring motion and interruption:** pass in both engines. Opening uses 660 ms sampled spring keyframes. Six immediate close/reopen interruptions leave the correct menu visible and its trigger state consistent.
- **Existing-data upgrade:** pass in both engines. A pre-seeded original version-1 database retains its file blobs, IDs, favorites, folder paths, saved Custom Module lock/review, preferences, and a sample quiz-progress key after loading the upgraded app.
- **Cache isolation:** pass in Chromium. Activation removes an old `html-reader-` shell cache but preserves an unrelated app's cache.
- **Installed-shell offline behavior:** pass in Chromium. Both glass assets are precached; reloading offline, opening an anchored menu, and reading a previously imported HTML blob work.
- **WebKit offline PWA automation:** explicitly skipped. In this Linux runner, even an isolated Cache API `put` / `addAll` probe resolves without retaining responses, so it cannot validate service-worker offline behavior reliably. This is not counted as a passing Safari offline test. Check offline installed-PWA behavior on a physical iPhone/iPad.

Primary viewports: **1440 × 1000** and **390 × 844**. The live resize sequence also checks **320 × 568**, **844 × 390**, and **768 × 1024** while a menu is open.

## File preservation

A working-tree comparison against the downloaded ProHTML baseline confirms:

- All **8** original tracked files are present.
- **0** original files or folders are deleted.
- Only `index.html` and `sw.js` are modified.
- `custom-module.html`, `manifest.webmanifest`, all three PNG app icons, and `README.md` are byte-identical to the original repository versions.
- The uploaded Reader's `viewport-fit=cover` setting is retained.
- Storage name/version/key paths are not changed, and no upgrade code clears localStorage or IndexedDB.

See `upgrade-manifest.json` for the source revisions and SHA-256 inventory.

## Recommended real-device checks

Browser automation is not a measurement of mobile GPU performance or a substitute for actual Safari/PWA testing. Before distributing widely:

1. Open the existing Pages URL on your iPhone/iPad, then refresh online once. Do not clear site data.
2. Check that existing folders, favorites, saved test, font preference, and test progress remain.
3. Tap **+** in portrait and landscape. It should open immediately beside the button, not in the center.
4. Tap **•••** on a file near the bottom of the screen. Its menu should flip above the button and stay readable.
5. Long-press a row and confirm that its menu opens at the press location without also opening the file.
6. Read a file in Adjacent, Focus, and Full Screen modes. Check Font Size, Back, Network Access, sharing, and toolbar recovery.
7. Test the installed PWA offline after one successful online load. Previously imported local pages should open; creating a new online-source module still requires network access.
8. Check Reduce Motion, Reduce Transparency, large text, the keyboard/visual viewport, and pinch zoom on your own device.

The original Custom Module data source remains external and unchanged. These tests open its real maker document and preserve saved-module handling; they do not certify the availability or correctness of the entire remote question bank. The unchanged platform-specific native share/fullscreen APIs also merit on-device checks.

## Re-run

Follow the optional commands in `../LIQUID-GLASS-UPGRADE.md`. The tests create only disposable browser profiles and fixture files. No sample files are seeded into the production Reader or the live preview.
