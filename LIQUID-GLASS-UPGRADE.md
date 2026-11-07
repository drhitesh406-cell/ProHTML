# ProHTML · Liquid Glass upgrade

A merge-in update for your existing HTML Reader. **Do not delete your repository, any existing folder, or browser/site data.** No Flutter installation, npm build, CDN, or additional hosting service is needed.

## Install in the existing repository

1. Extract `ProHTML-liquid-glass.zip` on your computer.
2. Upload the extracted **contents** to the root of your existing ProHTML repository, on the branch used by GitHub Pages. `index.html` should remain at the root, not inside a new enclosing folder.
3. Allow the two updated files, **`index.html` and `sw.js`**, to overwrite their older versions. Merge the new `assets/` directory into your repository; do **not** replace/delete an existing assets directory. Keep the included attribution and license.
4. Keep your current Pages deployment settings and website address. Wait for deployment, then open the existing site while online and refresh once. Close/reopen the installed PWA if it was already running.
5. Try the **+**, a file/folder's **•••**, and the reader's **••• → Font Size / Display / Network Access**.

You do **not** need to delete a file or folder first. Do **not** clear site data, uninstall the PWA, or remove your imported library to refresh the design.

### Only want to copy the necessary changes?

Update these two existing files:

```text
index.html
sw.js
```

Add these new runtime files and attribution:

```text
assets/liquid-glass.css
assets/liquid-glass.js
THIRD-PARTY-NOTICES.md
licenses/liquid_glass_widgets-LICENSE.txt
```

The upgrade guide, `docs/`, and `tests/` are documentation/developer checks, not runtime dependencies. If those folders already exist, merge the specifically named new files instead of replacing the folders.

**Do not upload only `index.html`: it now loads the two local glass assets.**

## What changed

- Frosted glass navigation, search, add button, reader toolbar, and menus, with reflective edges and pointer-following highlights.
- Consistent inline SVG navigation, document, folder, and action icons; your existing installed-app PNG icons are retained.
- A single spring-animated selection lens slides between tabs.
- Buttons and document icons have subtle press/release and hover feedback. The add icon rotates while its menu is open.
- Menus spring out from the **actual button or press position**, not a centered sheet or a fixed top-right coordinate. Add-menu and row-menu placement use the same controller.
- Each file and folder now has a separate, touch-friendly **••• button**. Tapping the rest of the row still opens it. Long-press and right-click remain supported.
- Menus flip above a trigger near the bottom of the screen, clamp to safe viewport edges, and scroll internally if space is limited.
- Desktop submenus open beside the selected option. On phones, a single anchored card drills into the submenu, with a Back button, rather than overlapping two wide panels.
- Placement recalculates after resizing, scrolling, and visual-viewport changes. A progress-scan redraw rebinds an open menu to the same file's replacement row.
- Keyboard navigation, focus return/trapping, accessible menu/choice states, Reduce Motion, Reduce Transparency, and contrast fallbacks are included.
- The service-worker shell cache includes the new assets. Its cleanup is limited to obsolete `html-reader-` shell caches, not unrelated apps' caches.

## What is preserved

All eight original tracked repository files are still present. Only `index.html` and `sw.js` were edited.

These files are **byte-for-byte unchanged** from ProHTML commit `b366954`:

- `custom-module.html`
- `manifest.webmanifest`
- `icon-180.png`, `icon-192.png`, `icon-512.png`
- `README.md`

The uploaded `index.html` was used as the Reader base, including its `viewport-fit=cover` safe-area setting.

The storage database remains **`html-reader-pwa`, version 1, store `files`**. There is no schema migration, database reset, imported-file purge, or localStorage clearing. File IDs, folder paths, favorites, saved Custom Module records, preferences, and existing test progress are retained. The existing explicit Delete / Remove all files actions remain available; the upgrade itself does not invoke them.

The module maker, saved-module lock/review workflow, font-size slider, network controls, content formatting/image fixes, imports, sharing, and display modes are retained. Imported pages and the module-maker document are **not re-skinned**; the glass style applies to the Reader's own shell.

### Important about saved data

Your library is stored in the browser, not in the GitHub repository. Deploy over the existing site and use the same browser/profile. Another host, private browsing, cleared site data, or a different device may show a different/empty local library. This design update does not transfer browser-local uploads between sites or devices.

The service worker caches the *application shell*. Updating its cache does not delete IndexedDB files or quiz progress. Storage availability and eviction still depend on the browser, as in the original Reader.

## How the referenced repository is used

Reference: <https://github.com/sdegenaar/liquid_glass_widgets>, version 1.15.0, commit `5d2859796ef0f6964e2fdf25962b033eede27814`.

That repository is a **Flutter/Dart** library, not a JavaScript package that can be loaded by a plain HTML reader. This update is a browser-native adaptation of its glass-material/interaction ideas and opening/closing spring presets:

| Spring | Mass | Stiffness | Damping |
|---|---:|---:|---:|
| Open | 1 | 120 | 16 |
| Close | 1 | 200 | 21 |

The web implementation samples an analytical spring into Web Animations keyframes, morphs the panel from its trigger's rectangle, and renders glass using CSS backdrop blur, tint, borders, and highlights. It is **not** the original Flutter GPU shader/metaball/refraction renderer, nor a pixel-identical port. No Flutter runtime, Dart source tree, or shader bundle is added to your site.

Attribution and the upstream MIT license are included.

## Optional local preview

From the project directory:

```sh
python -m http.server 3000
```

Open `http://localhost:3000/`. Use the existing HTTPS Pages site for the installed PWA. Opening `index.html` directly with `file://` is not a substitute for hosting: browsers restrict the module fetch, service worker, and sometimes storage there.

## Optional automated checks

The app itself has **no npm/runtime dependency**. To run the included developer regression suite:

```sh
npm install --no-save --no-package-lock playwright@1.58.2
npx playwright install --with-deps chromium webkit
# Keep a static server running on localhost:3000 in another terminal.
node tests/browser.cjs
```

`BASE_URL` can point to another served copy. `ENGINES=chromium` runs Chromium only. `QA_DIR` optionally saves test screenshots and JSON results. Generated browser profiles and fixture files are isolated and removed after testing; the tests never connect to your normal browser profile.

See `docs/liquid-glass-testing.md` for the test results and explicit automation limitations. Physical-device Safari/PWA and pinch-zoom checks remain recommended.
