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

- [x] A. Files, generator script, catalogue entries (`aliases`,
  `background`, `streamsAsIs`)
- [x] B. Untinted flow marks per set (live map and replay)
- [x] C. Options rows, recommended background and restore
  (`chooseTileset`, `mapper.backgroundBefore`)
- [x] D. Credits (README, notices), unit + e2e, ADR 0088, test guide

## Test guide

Open the client (local dev or the release build), enter MUME or the
offline demo, and turn the Map pane on. Note your background colour
(ESC → Options → Mapper → *Background colour*); pick a dark one other
than Default, e.g. Navy, to make the restore easy to see.

1. **The rows.** Options → Mapper → *Tileset*: ← from *Default (MMapper)*
   wraps to the two new rows, last in the list: *Gray's Map*, then
   *Gefe & Rik* (→ order: … Desert, Gefe & Rik, Gray's Map). The credit
   line under the menu: `Tiles by Octavia, after Gefe & Rik's maps` /
   `Tiles by Sunnyl75, after Gray's Mapeditor`.
2. **Background switch.** Choosing either set switches *Background
   colour* to White at once. Going from one to the other keeps it white.
3. **Look at them.** Leave the menu and look at Bree, and at a river
   with flow (the Anduin by Lórien, or the river east of Bree). The flow
   marks are our "v" chevrons, one per half room: cyan on Gefe & Rik,
   light sky blue on Gray's Map, with no dark edge. Walls, loads and
   other icons a set lacks come from MMapper's default set.
4. **Rapids in Gray's Map.** Rapids rooms draw Gray's plain water tile.
5. **Restore.** Back to *Default (MMapper)* (or any older set): the
   background returns to the colour you had (Navy). If you change the
   background by hand while on a light set, leaving the set keeps your
   colour.
6. **Replay.** With Gefe & Rik or Gray's Map chosen, export an HTML
   replay of a run with movement (History → a session → Export, HTML)
   and open it: the same set, the white background and the same flow
   marks.

Feedback wanted: do the two sets look right (scale, sharpness, nothing
missing that should be there)? Are the flow marks readable on both? Is
the background switch and restore what you expected? Are the names,
order and credit lines fine?

## Owner feedback

### Round 1 (2026-10-08)

1. **Gefe & Rik: river rooms with flow marks were solid cyan** (Bruinen
   ford, ~35 px per room). Fixed: Firefox's `createImageBitmap` resize
   returned opaque bitmaps; mixed-size tiles are now scaled on the GPU
   (ADR 0088 addendum). Reproduced and verified in Firefox at DPR 1.
2. **Gray's Map: rooms next to doors were black** (sturdydoor, trapdoor,
   …, Caravanserai, Bree east). Same cause and fix: Gray's 128² doors
   were rescaled into the 256² doors array.
3. **Lighter dark tint on the two white sets.** Done: dark `#e3dcdc`,
   no-sundeath `#f1eded` (`Tileset.tints`), live and in the HTML replay.

Status: done.

### Round 2 (2026-10-08)

- Re-test after round 1: "looks good now". Approved. The owner does not
  know whether Shimrod or Desert showed the Firefox bug before (their
  MMapper fallback walls and doors were rescaled the same way); the
  round 1 fix covers them too.

Status: stage 26 done; not released (the owner decides when).

