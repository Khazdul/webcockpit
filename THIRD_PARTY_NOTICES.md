# Third-party notices

WebCockpit is GPL-2.0-or-later (ADR 0027). It ships the following
third-party material, each under its own GPL-compatible licence, except
the bundled map data (`public/map/arda.mm2`), which has no licence (see
"Map assets").

## MMapper-derived code

Parts of the map are derived from **MMapper** 26.06.0
(https://github.com/MUME/MMapper), Copyright (C) 2019-2026 The MMapper
Authors, licensed under the GNU General Public License, version 2 or (at
your option) any later version. No MMapper source file is included as is.
The files below are new TypeScript (and GLSL ES 3.00) written for
WebCockpit on 2026-09-28 that translate MMapper's C++ and GLSL algorithms,
formulas and constants. Each carries MMapper's copyright notice and a
modification notice in its header. General changes: C++/Qt/OpenGL
rewritten as TypeScript/WebGL2 running in a Web Worker; read-only (no
map editing); no Qt types; data kept in typed arrays.

| WebCockpit file | Derived from (MMapper `src/`) | Changes |
|---|---|---|
| `src/map/mm2.ts` | `mapstorage/mapstorage.cpp`, `map/WorldBuilder.cpp` (sanitize) | Reader for schema 17–42 only; skips room contents and notes; typed-array output |
| `src/map/mm2-write.ts` | inverse of the `.mm2` format above | Writer for tests and replay subsets |
| `src/map/view.ts` | `display/ProjectionUtils.cpp`, `display/MapCanvasData.cpp` (2D camera) | Pan, zoom and layer only |
| `src/map/path.ts` | `parser/AbstractParser-Commands.cpp`, `parser/Abbrev.cpp`, `parser/abstractparser.cpp`, `parser/mumexmlparser.cpp`, `parser/AbstractParser-Actions.cpp` | Prespam queue and path walk only |
| `src/map/group.ts` | `group/mmapper2group.cpp`, `group/CGroupChar.cpp`, `group/ColorGenerator.cpp` | GMCP group table and colours only |
| `src/map/render/rooms.ts` | `display/MapCanvasRoomDrawer.cpp` | Instanced quads per layer |
| `src/map/render/connections.ts` | `display/Connections.cpp`, `display/ConnectionLineBuilder.cpp` | Triangle lists per layer |
| `src/map/render/geometry.ts` | `opengl/LineRendering.cpp` | Plain arrays |
| `src/map/render/infomarks.ts` | `display/Infomarks.cpp` | Draw only |
| `src/map/render/font.ts` | `opengl/Font.cpp` | BMFont parse and layout |
| `src/map/render/characters.ts` | `display/Characters.cpp`, `display/MapCanvasData.cpp` | Player, group, path |
| `src/map/render/palette.ts` | `configuration/configuration.cpp`, `global/Color.h`, `global/Color.cpp` | Default colours only |
| `src/map/render/textures.ts` | `display/Textures.cpp` | One array per tile size |
| `src/map/render/shaders.ts` | `resources/shaders/legacy/{room,font,point}` | GLSL ES 3.00 |
| `src/map/render/webgl.ts` | `display/mapcanvas_gl.cpp` (`actuallyPaintGL`, `renderMapBatches`), `display/MapCanvasRoomDrawer.cpp` (`LayerMeshes::render`) | WebGL2, on-demand rendering |

The full history of every change is in this repository's git log.

## Fonts (`public/fonts/`)

- **DejaVu Sans Mono** 2.37 (regular, bold), converted to WOFF2.
  Bitstream Vera Fonts licence (Copyright (c) 2003 Bitstream, Inc.), DejaVu
  changes in the public domain, Arev glyphs (c) Tavmjong Bah.
  Full text: `public/fonts/LICENSE-DejaVu.txt`.
- **WebCockpit Underscore** (regular, bold): a modified version of DejaVu
  Sans Mono holding only its underscore (U+005F), moved up 278 font units
  (ADR 0043). Same licence and copyright as DejaVu Sans Mono above; as the
  Bitstream Vera licence requires of a modified version, its name contains
  neither "Bitstream" nor "Vera" (nor "DejaVu"). Built by
  `scripts/build-underscore-font.py`.
- **JetBrains Mono** 2.304, NL build (regular, bold), converted to WOFF2.
  Copyright 2020 The JetBrains Mono Project Authors. SIL Open Font
  License 1.1. Full text: `public/fonts/LICENSE-JetBrainsMono-OFL.txt`.

Sources, versions and the conversion are recorded in
`public/fonts/README.md`.

## JavaScript libraries (bundled into the build)

- **Preact** 10.29.8 — MIT License, Copyright (c) 2015-present Jason
  Miller. Used for the start page, ESC menu and Options chrome
  (`src/chrome/`), loaded as a separate chunk. Licence text:
  `node_modules/preact/LICENSE` (MIT, GPL-compatible).
- **CodeMirror 6** — `@codemirror/state` 6.7.6, `@codemirror/view` 6.43.13,
  `@codemirror/commands` 6.11.1 and their dependencies `@codemirror/language`
  6.12.4, `@lezer/common` 1.5.3, `@lezer/highlight` 1.2.4, `@lezer/lr` 1.4.10,
  `style-mod` 4.1.4, `w3c-keyname` 2.2.8, `crelt` 1.0.7 — MIT License,
  Copyright (C) 2018-2021 by Marijn Haverbeke and others. Used for the
  profile editor's text view (`src/editor/`), loaded as a separate chunk.
  Licence texts: `node_modules/<package>/LICENSE` (MIT, GPL-compatible).

## Map assets (`public/map/`)

- **MMapper** 26.06.0 default tileset (`pixmaps/`), GPL-2.0-or-later,
  Copyright (C) The MMapper Authors.
- **Cantarell** bitmap fonts (`fonts/`), SIL Open Font License 1.1.
- **arda.mm2**, a MUME map. Its room texts and other game data belong
  to MUME and its zone builders and carry no licence. WebCockpit's GPL
  does not cover the file and grants no rights in it.

Details and licence texts: `public/map/README`.
