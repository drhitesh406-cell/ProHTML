# Third-party notices — ProHTML Liquid Glass update

## Liquid Glass Widgets

- Repository: https://github.com/sdegenaar/liquid_glass_widgets
- Author/copyright: Copyright (c) 2024–2026 Sebastian Degenaar
- License: MIT
- Referenced revision: `5d2859796ef0f6964e2fdf25962b033eede27814` (v1.15.0)
- Complete license: [`licenses/liquid_glass_widgets-LICENSE.txt`](licenses/liquid_glass_widgets-LICENSE.txt)

This update uses the library as its material and interaction reference. Its opening/closing spring parameter presets are adapted from `lib/utils/liquid_morph_physics.dart` into `assets/liquid-glass.js`, with an original analytical browser-spring implementation, viewport-aware DOM positioning, keyboard/focus handling, pointer interactions, and tab-lens behavior. `assets/liquid-glass.css` is an original CSS interpretation of the glass-material appearance.

The Flutter widgets, Dart runtime, GPU shaders, vendored renderer, and embedded Flutter example assets are **not distributed** with this update. This is not an official JavaScript distribution of Liquid Glass Widgets or an Apple product. The browser effect approximates the reference's feel, rather than reproducing its shader rendering pipeline.

The pre-existing ProHTML source and assets retain their existing ownership/licensing. This notice does not relicense the whole ProHTML application under the referenced package's MIT license.

## Runtime dependencies

The added UI uses local CSS, local JavaScript, inline SVG paths, and browser APIs. No external icon font, hosted font, image service, CDN script, or Flutter package is introduced by the glass update. The original Custom Module maker and imported HTML documents retain their own existing network behavior.

Playwright is used only for optional developer tests, is not bundled, and is not a runtime dependency of the Reader.
