# Stage 22 — Map tilesets

Owner request 2026-10-06: let the user pick an alternative tileset for
the map pane in Options → Mapper. Bundle Shimrod's four seasonal
tilesets, an "alternating" choice that follows MUME's season, and the
owner's Desert tileset. More community tilesets may come later, so
adding one must be a data change, not a code change.

Spec §2.9, ADR 0020 (map, tiles, assets), ADR 0074 (game time,
`seasonOf`), ADR 0082 (this stage).

Source files (read-only, outside the repo):
`~/Downloads/MUME tilesets/Desert/` and
`~/Downloads/MUME tilesets/MUME-Shimrod tileset for mMapper/{SPRING,Summer,Autumn,WINTER}/`.

## Owner decisions

- 2026-10-06: the choice lives in **Options → Mapper**.
- 2026-10-06: selectable: Default (MMapper), Desert, Shimrod Spring,
  Shimrod Summer, Shimrod Autumn, Shimrod Winter, and **Shimrod
  alternating**, which uses the Shimrod set of MUME's current season
  (Winter = Afteryule–Rethe, Spring = Astron–Forelithe,
  Summer = Afterlithe–Halimath, Autumn = Winterfilth–Foreyule).
- 2026-10-06: **Desert** was made by the owner by modifying Shimrod's
  tiles; Shimrod has agreed. Shimrod's README: "You may copy, use or
  edit the tiles in any other mod, just give credit." Credit Shimrod
  for all five sets, and Desert as the owner's adaptation.
- 2026-10-06: an exported **HTML replay uses the same tileset** as the
  client at export time (alternating: the season at export).
- 2026-10-06: keep future tilesets in mind; adding one should be easy.

## Plan

### A. Tileset catalogue and assets

- Copy the PNGs into `public/map/tilesets/<id>/`. Leave out the
  `Glaze/` folder, the README, the cover image, `terrain-hills - Copy.png`
  and files the renderer never loads. Lossless PNG optimisation is fine;
  no resampling of the files themselves.
- A catalogue (data) lists each set: id, name, credit, folder, and for
  a seasonal family its four season members. Adding a set = folder +
  one catalogue entry.
- A set overrides the default pixmaps file by file; files it lacks come
  from `public/map/pixmaps/` (as MMapper's custom resource folder does).
- Credits in `public/map/README` and `THIRD_PARTY_NOTICES.md`, and a
  short credit line in Options → Mapper for the chosen set.

### B. Renderer

- Tiles of other sizes than the default (Shimrod: trails 128², icons
  and exits 256²) load correctly into the texture arrays.
- Switching set swaps textures live without reloading the map.
- Only the chosen set's files are fetched.

### C. Setting and alternating

- `mapper.tileset` setting, default `default`. Options → Mapper row
  "Tileset: …" (←→ cycles), with a credit line.
- Alternating resolves via the game clock (`seasonOf`), and switches
  when the season changes during a session.

### D. HTML replay

- The export embeds the needed tiles from the resolved set.

### E. Verify and release

- Typecheck, unit, e2e, map bench with a non-default set.
- Release on the owner's go.

## Tasks

- [ ] A. Catalogue, assets, credits
- [ ] B. Renderer: mixed tile sizes, live swap
- [ ] C. Setting, Options → Mapper row, alternating
- [ ] D. HTML replay embeds the resolved set
- [ ] E. Tests, ADR 0082, test guide

## Test guide

(Written when the build is done.)

## Owner feedback

(None yet.)
