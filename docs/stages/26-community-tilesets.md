# Stage 26 — Community tilesets

Owner request 2026-10-08: add two community tilesets for MMapper to
Options → Mapper → Tileset, last in the list:

- **Gefe & Rik** by Octavia (v0.1, 2025), based on Gefe and Rik's
  classic MUME maps:
  https://github.com/octavia-mc/gefe-rik-mmapper-tileset/releases/tag/v0.1
- **Gray's Map** by Sunnyl75 (v1.1, 2026), a homage to Gray's
  Mapeditor maps: https://github.com/Sunnyl75/Gray-s-Map-Tileset

Builds on stage 22 (ADR 0082, tilesets) and ADR 0085 (map background).
ADR 0088 (this stage).

## Licences

Both are MIT (© 2025 octavia-mc, © 2026 Sunnyl75). The copyright and
permission notice ships with the files (`public/map/README`,
`THIRD_PARTY_NOTICES.md`). Credit the originals too: Gefe and Rik's maps
(mume.kyrania.com, also Eolo), and Gray's Mapeditor (Gray, Morfizm,
Dorien/White, Moonshade, Waba). No AI clause, no NC/ND parts.

## Owner decisions

- 2026-10-08: names **Gefe & Rik** and **Gray's Map**, after Desert, in
  that order.
- 2026-10-08 (1a): both sets are drawn for a white background. A set
  carries a **recommended background** (`#ffffff` for both); choosing
  the set in Options switches the map background to it, the user can
  change it afterwards, and going back to a set without one restores
  the background the user had before.
- 2026-10-08 (2): Gray's Map has no `terrain-rapids`: rapids draw
  **Gray's own water tile**.
- 2026-10-08: everything a set lacks comes from MMapper's default set
  (the normal fallback), **except the flow arrows**: both sets get
  WebCockpit's own flow marks (mockup rounds 1–6).
- 2026-10-08: flow marks are bare pixel-art "v" chevrons, no line, one
  per half room in the flow direction (two in a through-flow room, one
  in the first and last room of a run), 8 px strokes. Colours, drawn
  as is (not tinted by the water colour):
  - Gefe & Rik: cyan `#4cd8ff`.
  - Gray's Map: light sky blue `#c4dcff` (on Gray's `#bfbffd` water).
- 2026-10-08: dark rooms keep the normal darkness tint on the white
  background.

Mockups: https://claude.ai/artifact/4f83DXCkLEgM5Hh2QJVZPW (private).

## Plan

### A. Files and catalogue

- `public/map/tilesets/gefe-rik/` and `grays-map/`: the renderer's
  files from each release, unmodified (Gefe: `pixmaps/` only, not
  `options/`; leave out `update0.png`, `terrain-deathtrap.png`; Gray:
  leave out `load-pony.png`, `mob-genericguild.png`,
  `terrain-deathtrap.png`).
- Our flow marks (`stream-in-*`, `stream-out-*`, 12 per set) generated
  by a committed script (`scripts/build-flow-chevrons.py`; Gefe 160²,
  Gray 128²). Transparent texels keep the mark's RGB (no dark rim when
  filtered).
- Catalogue entries with `lacks`, a file alias (Gray:
  `terrain-rapids.png` → `terrain-water.png`), the recommended
  background, and "streams drawn as is".

### B. Renderer

- A set can turn off the water tint of the flow textures; the default
  set and Shimrod are unchanged. The HTML replay follows the same set.

### C. Options

- The two rows last; the background switch and restore of decision 1a.

### D. Credits, tests, ADR, test guide

## Tasks

- [ ] A. Files, generator script, catalogue entries
- [ ] B. Untinted flow marks per set (live map and replay)
- [ ] C. Options rows, recommended background and restore
- [ ] D. Credits (README, notices), unit + e2e, ADR 0088, test guide

## Test guide

(written when the stage is built)

## Owner feedback
