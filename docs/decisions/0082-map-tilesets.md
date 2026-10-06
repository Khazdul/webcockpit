# 0082 — Map tilesets

- Status: Accepted
- Date: 2026-10-06
- Amends: ADR 0020 (map: "The default MMapper tileset is used as is";
  texture arrays by fixed size; `AssetSource`; replay tiles)
- Builds on ADR 0074 (game time, `seasonOf`), ADR 0075 (phone)
- Stage: `docs/stages/22-tilesets.md`

## Context

Owner request (2026-10-06): let the user pick another tileset for the
map in Options → Mapper. Bundle Shimrod's four seasonal sets ("Shimrod's
tileset for MUME mmapper", v0.92), an *alternating* choice that follows
MUME's season (Winter = Afteryule–Rethe, Spring = Astron–Forelithe,
Summer = Afterlithe–Halimath, Autumn = Winterfilth–Foreyule), and the
owner's Desert set (Shimrod's tiles modified by the owner, with
Shimrod's agreement). An HTML replay uses the client's set at export
time. More community sets may come; adding one should be data.

The sets are MMapper custom-resource folders: files under MMapper's
pixmap names (106 per set) that override the default `pixmaps/` (126)
file by file. They lack walls, doors, `char-*`, three load icons and
`terrain-road` (Desert and Winter also `terrain-underwater`), and carry
some files the renderer never loads (`mob-genericguild`,
`terrain-deathtrap`, a `terrain-hills - Copy`). Their sizes differ from
the default set: trails 128² (default 64²); mobs, loads, exits,
streams, no-ride and several terrains 256² (default 128²).

## Decision

### Catalogue and files

- `public/map/tilesets/<dir>/` holds each set: only the files the
  renderer loads (`RENDERER_PIXMAPS`), copied **unmodified**. A
  lossless re-encode saved only about 1.5 % once the files' metadata
  (14 % of the bytes, mostly C2PA content-credential `caBX` chunks) was
  kept, and stripping that metadata would remove the author's
  provenance from Glazed art; so no re-encoding. Desert 4.0 MB, Shimrod
  5.5–6.2 MB per season.
- `src/map/tilesets.ts` is the catalogue, as data: `TILESETS` (id,
  name, one-line credit, folder, `lacks`: renderer files the set does
  not have), `TILESET_FAMILIES` (a seasonal family: its four member set
  ids) and `TILESET_CHOICES` (Options order: Default (MMapper), Desert,
  Shimrod (alternating), Shimrod Spring, Summer, Autumn, Winter). A unit
  test checks each folder against `RENDERER_PIXMAPS − lacks` and that
  no folder lacks an entry, so adding a set is its folder, one entry
  and one choice row; the test names any file list mismatch.
- **Per-file fallback.** `resolveTileset(choice, month)` gives a set (or
  null = default); `tilesetOverlay` turns it into a `TilesetOverlay`
  `{dir, files}`. The `base` `AssetSource` takes an optional `tileset`
  overlay, and `assetResolver` reads `pixmaps/<f>` from `<dir><f>` when
  the set has `<f>`, else from `pixmaps/` (`overlayPath`). The renderer
  still asks for `pixmaps/…` paths only. Fonts are untouched. Nothing
  is probed: the lists decide, so only the chosen set's files and the
  default files it lacks are fetched (e2e checks the exact set), and
  only when the Map pane is on.

### Renderer: mixed sizes

- Each file-backed texture array takes the **size of its largest file**
  (`arraySize`: width or height, capped at `MAX_TILE_SIZE` = 256; the
  nominal size when nothing decoded). Files of another size are decoded
  again with `createImageBitmap(blob, {resizeWidth, resizeHeight,
  resizeQuality: 'high'})` (same flip/premultiply options); where the
  browser ignores the resize, they are drawn scaled on an
  `OffscreenCanvas` 2D context. Mip levels follow the size.
- The default set has every file at its nominal size, so it takes the
  old path exactly (no rescale, same array sizes and uploads): default
  rendering is unchanged.
- **Quality vs memory.** Shimrod's icons and several terrains are 256²
  and the map zooms to 220 CSS px per room (zoom 5, ×DPR 2–3 on a
  phone), so keeping them at 256² shows the sets as drawn; a fixed 128²
  array would blur exactly where the detail shows. The cost is GPU
  memory: with mipmaps the 96-layer array is ~34 MB at 256² instead of
  ~8.4 MB at 128², so a Shimrod or Desert set needs about 38 MB of
  texture against ~11 MB for the default set (trails 64→128²: +1 MB).
  That is allocated only when a non-default set is chosen and the map is
  on, and is well inside what WebGL2 phones handle (shared memory, GBs
  of RAM). The cap bounds a future set with larger files. If a phone
  runs short, a phone-only cap of 128 is a one-line change
  (`MAX_TILE_SIZE` per device); not done now (ADR 0075's phones show the
  map one tab at a time).
- **Live swap.** `Renderer.setAssets(resolver)` (optional in the
  interface) loads all arrays again in the background and swaps them in
  when complete (the old textures draw until then and are deleted
  after); a newer swap drops an older one still loading. The worker's
  new message `{t: 'assets', assets}` (additive, protocol version
  unchanged) replaces its resolver (a restored context uses it too) and
  calls `setAssets`. The map, view, scene and marks stay.

### Setting and alternating

- `mapper.tileset` (string, default `default`), validated against
  `TILESET_IDS`; an unknown or stale id becomes `default`. No
  `SETTINGS_VERSION` bump (additive, like `hoverSize`). Not in
  `ViewSnapshot`: a log plays with the viewer's own setting.
- Options → Mapper: `Tileset: <name>` after *Hover text size* (←→ and
  click cycle, as the hover rows), and a centred hint line under the
  menu with the set's credit. Alternating adds the season it draws now
  (`Tiles by Shimrod (v0.92) · now Autumn`), from the saved game clock.
  The in-app credit has no e-mail address.
- **Alternating** resolves to the family member for
  `seasonOf(month)`, with the month from the game clock's anchor
  (`mumeMonth(epoch, now)`). An unsynced clock still has an anchor
  (the saved one, else the cold-start estimate `SEED_EPOCH`), so the map
  never waits for a sync. The Map pane uses its `GameState` clock;
  Options and the replay export read the saved clock (`wc.clock`, which
  the live clock writes after every sync; `CLOCK_KEY` moved to
  `clock.ts` so the map code need not import `GameState`).
- The Map pane resolves the set when the worker starts and re-resolves
  on a settings change, on a clock sync (`GameState` `'clock'`), and
  once a minute (a season lasts about 36 real hours); a different set
  sends `{t: 'assets'}`. `content.dataset.mapTileset` is the drawn set id
  (tests). Only a `base` asset source gets an overlay: the HTML replay's
  inline source never does.

### HTML replay

- `buildReplayHtml(…, {tileset})` → `embedReplayMap` fetches each needed
  pixmap through `overlayPath` (the set's file, else the default) and
  embeds it under its `pixmaps/` key, so the replay page needs no
  tileset logic and `neededAssets` keeps its meaning. The export editor
  (and the dev hook `__wc.replayHtml`) pass `currentOverlay(setting)`:
  the set resolved by the saved clock at export time.

### Credits and terms

- `public/map/README` and `THIRD_PARTY_NOTICES.md`: Shimrod's set
  (v0.92, the README's contact address), its terms ("You may copy, use
  or edit the tiles in any other mod, just give credit."; no use in
  generative-AI datasets, the tiles are Glazed), Desert as the owner's
  adaptation under the same terms, and the full list of 3D-asset
  credits from Shimrod's README. Some of those 3D models are CC BY-NC,
  BY-ND, BY-NC-SA or BY-NC-ND; the tiles are rendered from them.
  WebCockpit's GPL does not cover the tilesets.

## Consequences

- The deploy grows by ~27 MB (`public/map/tilesets/`), fetched only for
  the chosen set while the map is on. The prod smoke test checks one
  tileset file is served.
- Map worker bundle +1.3 kB; replay bundle +5.4 kB (the catalogue, for
  the pane's resolution; unused there).
- Choosing a set costs one decode of ~120 files (~6 MB) and ~38 MB of
  texture; the default set is unchanged.
- **Bench** (`WC_BENCH_TILESET`, `--quick --only map`, 1728 × 1000 at
  ratio 2, a busy machine: load average ~18–21). Map turn-on → first
  complete frame, Firefox / chromium-gpu: default 1 494 / 1 660 ms,
  Shimrod Autumn (the largest set) 1 438 / 1 897 ms. The longest
  main-thread task in the Chromium trace is 10.1 ms (default) and
  8.5 ms (Autumn); the > 5 ms gate fails on both, so that is not the
  tileset (the worker does the decoding and uploads).
- A future set: drop the renderer's files in a folder, add a `TILESETS`
  entry (its `lacks` from the unit test's message) and a
  `TILESET_CHOICES` row, credit it in the README and notices. A new
  seasonal family is a `TILESET_FAMILIES` entry.
