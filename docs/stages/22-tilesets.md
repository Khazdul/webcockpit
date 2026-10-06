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

- [x] A. Catalogue, assets, credits (`src/map/tilesets.ts`,
  `public/map/tilesets/`, README, notices; files unmodified, see ADR 0082)
- [x] B. Renderer: mixed tile sizes (array = largest file, ≤ 256²),
  live swap (`{t:'assets'}`)
- [x] C. Setting `mapper.tileset`, Options → Mapper row + credit line,
  alternating via the game clock (re-checked on sync and every minute)
- [x] D. HTML replay embeds the resolved set
- [x] E. Tests (unit, e2e `map-tilesets.spec.ts`), ADR 0082, test guide;
  `WC_BENCH_TILESET=<id>` for the map bench

## Test guide

Open the client (local dev or the release build), enter MUME or the
offline demo, and turn the Map pane on.

1. **Pick a set.** ESC → Options → Mapper. The new row
   *Tileset: Default (MMapper)* sits under *Hover text size*; ←→ (or a
   click) cycles: Default (MMapper), Shimrod (alternating),
   Shimrod Spring, Summer, Autumn, Winter, Desert. The line under the menu
   credits the chosen set. Leave the menu: the map shows the new tiles
   within a second or two, at the same place and zoom, without
   reloading.
2. **Look at it.** Zoom in close (wheel) on a town and a few outdoor
   areas. Icons (mobs, loads, exits, no-ride) and terrain should look
   sharp and upright; walls, doors, the yellow player square and the
   off-screen arrows still come from MMapper's default set (Shimrod's
   set does not have them).
3. **Alternating.** Pick *Shimrod (alternating)*. The credit line says
   which season it draws now (`… · now Autumn`). The season follows
   MUME's month: Afteryule–Rethe winter, Astron–Forelithe spring,
   Afterlithe–Halimath summer, Winterfilth–Foreyule autumn. To check,
   type `time` in MUME (or look at the almanac pane's NOW tab) and compare
   the month. Before the client has synced the clock it uses its best
   estimate; after a sync it switches by itself if the estimate was off.
4. **Replay.** Export an HTML replay of a run with movement (History →
   a session → Export, format HTML). Open it: the map uses the set you had at
   export time.
5. **Phone** (optional): pick a Shimrod set on the phone and zoom in;
   tell me if the map gets slow or the tab reloads.

Feedback wanted: do the sets look right (scale, sharpness, nothing
upside down or missing)? Is the row and its name list fine (labels,
order)? Is the credit line OK? Any set or season that looks wrong in
some area?

## Owner feedback



### Round 1 (2026-10-06)

- Desert credit: "Khazdul" instead of the owner's name.
- Order: Default (MMapper), Shimrod (alternating), Shimrod Spring,
  Summer, Autumn, Winter, Desert (last).
- Otherwise approved. Step 5 (phone) after release.

Status: both done.

### Round 2 (2026-10-06)

- Phone (step 5) on 0.1.51: a Shimrod set works well, no lag or change
  in performance. The 256² cap stays on phones too.

Status: stage 22 done.
