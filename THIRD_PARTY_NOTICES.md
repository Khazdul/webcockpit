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
| `src/map/search.ts` | `mapdata/roomfilter.cpp`, `mapdata/shortestpath.cpp`, `parser/abstractparser.cpp` (`compressDirections`), `parser/AbstractParser-Commands.cpp` (flag names) | Script map search, paths and room details; one Dijkstra over the whole map (2026-10-05) |
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

Terminal fonts offered in Options → Appearance → Font (ADR 0010, ADR
0049). Each is an unmodified font converted losslessly to WOFF2 (or
upstream's own WOFF2), not subset; names and copyright notices are kept.
Each licence text is shipped next to the files. Sources, versions, the
conversion, metrics and SHA-256 sums: `public/fonts/README.md`.

- **DejaVu Sans Mono** 2.37 (regular, bold). Bitstream Vera Fonts
  licence (Copyright (c) 2003 Bitstream, Inc.), DejaVu changes in the
  public domain, Arev glyphs (c) Tavmjong Bah. `LICENSE-DejaVu.txt`.
- **WebCockpit Underscore** (regular, bold): a modified version of DejaVu
  Sans Mono holding only its underscore (U+005F), moved up 278 font units
  (ADR 0043). Same licence and copyright as DejaVu Sans Mono above; as the
  Bitstream Vera licence requires of a modified version, its name contains
  neither "Bitstream" nor "Vera" (nor "DejaVu"). Built by
  `scripts/build-underscore-font.py`.
- **JetBrains Mono** 2.304, NL build (regular, bold). Copyright 2020 The
  JetBrains Mono Project Authors. SIL Open Font License 1.1.
  `LICENSE-JetBrainsMono-OFL.txt`.
- **Agave** 39 (regular, bold). Copyright 2013-2026 The agave Project
  Authors (https://github.com/blobject/agave). SIL Open Font License 1.1.
  `LICENSE-Agave.txt`.
- **Anonymous Pro** 1.002 (regular, bold). Copyright (c) 2009, Mark
  Simonson, with Reserved Font Name "Anonymous Pro". SIL Open Font
  License 1.1. `LICENSE-AnonymousPro.txt`.
- **Cascadia Mono** 2407.24 (regular, bold; the no-ligature sibling of
  Cascadia Code, upstream's WOFF2). Copyright (c) 2019 - Present,
  Microsoft Corporation, with Reserved Font Name "Cascadia Code". SIL
  Open Font License 1.1 (https://github.com/microsoft/cascadia-code).
  `LICENSE-CascadiaCode.txt`.
- **Fantasque Sans Mono** 1.8.0, "Normal" variant (regular, bold).
  Copyright (c) 2013-2017, Jany Belluz. SIL Open Font License 1.1.
  `LICENSE-FantasqueSansMono.txt`.
- **Fira Code** 6.2 (regular, bold). Copyright (c) 2014, The Fira Code
  Project Authors (https://github.com/tonsky/FiraCode). SIL Open Font
  License 1.1. `LICENSE-FiraCode.txt`. Its programming ligatures are
  turned off in the CSS.
- **Go Mono** 2.010 (regular, bold). Copyright (c) 2016 Bigelow & Holmes
  Inc., under the Go project's BSD-style licence (Copyright 2009 The Go
  Authors). `LICENSE-GoMono.txt` (the Go fonts README and the Go
  licence).
- **Hack** 3.003 (regular, bold). Copyright 2018 Source Foundry Authors,
  MIT License; derived from DejaVu (public domain changes) and Bitstream
  Vera Sans Mono, Copyright 2003 Bitstream Inc., Bitstream Vera License
  with Reserved Font Names "Bitstream" and "Vera". `LICENSE-Hack.txt`.
- **Hermit** 2.0 (regular, bold). Copyright (c) 2013, Pablo Caro, with
  Reserved Font Name "Hermit". SIL Open Font License 1.1.
  `LICENSE-Hermit.txt`.
- **IBM 3270** 3.0.1 (regular; there is no bold). Copyright 2011-2022
  Ricardo Banffy and the 3270font authors, 1993-2011 Paul Mattes, and
  others; BSD 3-clause licence (https://github.com/rbanffy/3270font). The
  font contains a Debian logo glyph, Copyright (c) 1999 Software in the
  Public Interest, Inc., under CC BY-SA 3.0 Unported or LGPL-3.0-or-later,
  and Ubuntu logo glyphs; Ubuntu and its logo are registered trademarks
  of Canonical Ltd. `LICENSE-3270.txt`.
- **IBM Plex Mono** 2.5.0 (font version 2.005; regular, bold). Copyright
  2017 IBM Corp., with Reserved Font Name "Plex". SIL Open Font License
  1.1. `LICENSE-IBMPlexMono.txt`.
- **Inconsolata** 3.000 (regular, bold). Copyright 2006 The Inconsolata
  Project Authors (https://github.com/cyrealtype/Inconsolata). SIL Open
  Font License 1.1. `LICENSE-Inconsolata.txt`.
- **mononoki** 1.6 (font version 1.006; regular, bold). Copyright (c)
  2022, Matthias Tellen, with Reserved Font Name "mononoki". SIL Open
  Font License 1.1. `LICENSE-mononoki.txt`.
- **Noto Sans Mono** 2.014 (regular, bold). Copyright 2022 The Noto
  Project Authors (https://github.com/notofonts/latin-greek-cyrillic).
  SIL Open Font License 1.1. `LICENSE-NotoSansMono.txt`.
- **WebCockpit Fill AP, H, GM, LC**: box-drawing, block and shade glyphs
  that Anonymous Pro, Hermit, Go Mono and Lucida Console lack, drawn from
  rectangles for WebCockpit by `scripts/build-fill-fonts.py` (no
  third-party outlines; only the host fonts' metrics are used).
  Copyright 2026 The WebCockpit Authors. SIL Open Font License 1.1.
  `LICENSE-WebCockpitFill.txt`.

**Lucida Console** is not distributed with WebCockpit and is never
embedded in an exported file. It is offered only when it is installed on
the user's device, and then used through the browser's `local()` font
lookup. Lucida is a trademark of its owner.

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
- **wasmoon** 1.16.0 — MIT License, Copyright (c) 2023 Gabriel Francisco
  (https://github.com/ceifa/wasmoon). The Lua runtime for user scripts
  (`src/lua/`, ADR 0051): its JavaScript glue and its WebAssembly build
  `glue.wasm`, emitted as a hashed asset next to the app. Both load
  lazily, only when a script is enabled. Licence text:
  `node_modules/wasmoon/LICENSE` (MIT, GPL-compatible).
- **Lua** 5.4, compiled into wasmoon's `glue.wasm` — MIT License,
  Copyright (C) 1994-2023 Lua.org, PUC-Rio (https://www.lua.org/license.html,
  MIT, GPL-compatible).

## Map assets (`public/map/`)

- **MMapper** 26.06.0 default tileset (`pixmaps/`), GPL-2.0-or-later,
  Copyright (C) The MMapper Authors.
- **Cantarell** bitmap fonts (`fonts/`), SIL Open Font License 1.1.
- **arda.mm2**, a MUME map. Its room texts and other game data belong
  to MUME and its zone builders and carry no licence. WebCockpit's GPL
  does not cover the file and grants no rights in it.

Details and licence texts: `public/map/README`.
