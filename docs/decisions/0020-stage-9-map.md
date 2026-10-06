# 0020 — Stage 9: the map pane (MMapper look, tiles, worker renderer)

- Status: Accepted
- Date: 2026-09-28
- Amends: ADR 0003 (TUI look → MMapper tiles; nothing bundled → arda.mm2
  bundled), spec §2.9, spec §5 order (stage 9 is built before stage 8).

## Context

The owner wants the map now, before hardening (2026-09-28). New owner
direction, replacing the "TUI map" of ADR 0003:

- The map looks identical to the owner's MMapper 2D view: tiles, not
  characters. The default MMapper tileset is used as is.
- Only the map canvas: no menus, status bars, clock, weather, tilt/3D.
- Drag inside the map pans; wheel zooms; the pane is moved by its title
  row like other panes. Same borders (toggleable), toggle, dock and
  float as other panes.
- Group mates are shown on the map. Pre-spammed moves show the path
  ahead, as in MMapper.
- Options → Panes → Mapper imports a new MMapper map file. The default
  map is the owner's `arda.mm2`, **bundled with the client** (owner
  decision; the file holds MUME's room texts, which have no licence —
  accepted risk, revisit before any public release).
- Read-only: no auto-mapping, no editing (owner decision).
- Speed is critical: the map must not slow sending or text scrolling.

Research: `notes/research/mmapper-rendering.md` (MMapper 26.06.0, the
owner's version; `.mm2` v42 format; exact rendering rules; colours).
MMapper is GPL-2.0-or-later and WebCockpit is GPL-3.0-or-later (ADR
0001), so copying MMapper's tiles and porting its algorithms is allowed.
The files carry their origin and licence notice (`public/map/README`).

## Decision

### Architecture: everything in one worker

- The map runs in a dedicated module worker (`src/map/worker/`) that owns
  an `OffscreenCanvas` (WebGL2). Load (fetch or imported bytes) →
  `DecompressionStream('deflate')` → `.mm2` parse → mesh build →
  render, all off the main thread.
- The main thread only transfers the canvas and posts small messages.
  Game events are forwarded in batches: a subscriber pushes to an array
  and schedules one `postMessage` per microtask/frame. Nothing runs in
  the `cmd.sent` key-press stack beyond an array push.
- Rendering is on demand (view, position, path or group change),
  coalesced per worker animation frame (`setTimeout` fallback). No
  continuous loop.
- Main thread forwards only what the map needs:
  - `gmcp` for `Room.Info`, `Event.Moved`, `Group.Set/Add/Update/Remove`,
    `Char.StatusVars` (race, for troll exits), and `conn.state`;
  - `cmd.sent` (text only);
  - `text.line` only for lines matching one precompiled regex of MMapper's
    move-failure and death messages (research §6.2).
- The locator (which room am I in) runs in the worker, next to the map
  data.

### Modules

| Module | Role |
|---|---|
| `src/map/mm2.ts` | `.mm2` v42 reader (pure; worker and Node). Rejects other versions with a clear error. |
| `src/map/model.ts` | `MapData`: compact typed arrays (coords, terrain, flags, exits, server ids), name/desc strings, infomarks; incoming-exit index; server-id → room index; name hash index. |
| `src/map/locate.ts` | Locator (pure): Room.Info/Event.Moved → room index. |
| `src/map/path.ts` | Prespam queue and path walk (pure). |
| `src/map/group.ts` | Group positions from `mapid` and MMapper's colour generator (pure). |
| `src/map/render/*` | WebGL2 renderer: atlases, per-layer static meshes, connections, infomarks, text (Cantarell BMFont), characters, off-screen arrows. |
| `src/map/worker/map.worker.ts` | Worker entry and message protocol. |
| `src/map/client.ts` | Main-thread `MapClient`: worker lifecycle, event forwarding, protocol. |
| `src/panes/map.ts` | `MapPane` (PaneShell): canvas, pointer/wheel → worker, resize/DPR. |
| `src/chrome/frames/options-mapper.tsx` | Options → Panes → Mapper. |
| `public/map/` | `arda.mm2`, MMapper `pixmaps/`, Cantarell BMFont, licences. |

`src/map/*` has no DOM. Worker/protocol types in `src/map/protocol.ts`.

### Locating the player

Only 4 912 of 30 074 rooms in `arda.mm2` have a server id, so an id
lookup alone fails for most of the map. Order, per `Room.Info` (with
`Event.Moved` direction when one came since the last room):

1. `Room.Info.id` matches a room's server id → that room.
2. From the last known room, follow the moved direction's exit if it has
   exactly one target and the target's name matches `Room.Info.name`.
3. Rooms whose name and description equal `Room.Info` (normalised
   whitespace); if several, prefer one adjacent to the last known room
   via the moved direction, then the one whose exit set matches; unique
   only.
4. Otherwise unknown: the last room stays drawn, the marker switches to
   MMapper's "far" outline style.

A match found by 2 or 3 records `server id → room` in memory (and in
IndexedDB `mapIds` keyed by map hash, so it survives reloads). The map
file is never changed.

### Group mates

MMapper reads `mapid` (server room id) and `room` from `Group.*`
(`group/CGroupChar.cpp:60`); the owner confirms MUME sends them. The
map keeps its own member table in the worker, keyed by the `Group.*`
id, and draws a member when `mapid` resolves (server id or learned id).
Colours, shared-room rotation, labels and off-screen arrows as in
research §7. The existing `GroupModel` is not changed.

### Map files and storage

- Default: `public/map/arda.mm2`, fetched by the worker on first show
  (lazy; not part of cold start).
- Import: Options → Panes → Mapper → Import reads a `.mm2` file; the
  bytes are stored in IndexedDB (DB v7, store `maps`, one record
  `current` with name, size, date, bytes). "Use bundled map" deletes it.
  The worker validates before the record is replaced; a bad file
  flashes an error and keeps the current map.
- Only `.mm2` (v42) is supported now. `.xml` / web JSON stay open.
  *Amended 2026-09-28 (owner test 1):* `.mm2` versions 17–42 are read
  (every schema MMapper 26.06 reads; 37 was never released), converted
  to the current MapData. See "Amendment: older `.mm2` versions" below.

### Pane

- `PaneId` `map`, label `Map`. Default `on: false`, border on. When
  turned on and not placed before, it floats at the owner's screenshot
  position (top-right over the output, 50 % × 35 % of the window).
- Left-drag pans (pointer capture; focus returns to the input on
  release like other panes); wheel zooms ×1.175 per notch around the
  cursor (0.04…5); Ctrl+wheel changes layer; every move re-centres on
  the player (MMapper behaviour).
- Canvas background MMapper `#2e3436` (owner config), not the pane tint.

### Replays

- The in-app log player shows the map: its App gets a map loader that
  fetches the same map (no DB needed for the bundled map).
- The HTML replay includes the map (owner, 2026-09-28, replacing the
  first draft of this ADR). The export embeds a **map subset**: the rooms
  visited in the exported chain plus a margin around them (and the
  connections/infomarks among them), and only the tiles and font pages
  that subset uses, inline in the file. The replay bundle starts the
  same worker code as an inline blob worker (works from `file://`).
  Target: the subset adds well under 1 MB for a normal fight.
- The map used is the one active at export time.

### Performance gates

- Existing bench budgets hold with the map pane on and a Room.Info-heavy
  fixture replaying (`tests/fixtures/map-demo.log`, generated from a real
  path through `arda.mm2`).
- Main-thread time per forwarded event < 0.05 ms; no main-thread task
  > 5 ms caused by the map (load included).

## Consequences

- WebGL2 + OffscreenCanvas + module workers are required for the map
  (Chrome, Firefox, Safari ≥ 17). Without them the pane shows a notice;
  the client is unaffected.
- `public/map` adds ~7 MB to the deploy, loaded only when the map is on.
- The replay bundle grows by the renderer and worker code.

## Package notes

### P0 Foundation (2026-09-28)

- **Assets.** `public/map/`: `arda.mm2`, MMapper 26.06.0 `pixmaps/` (126
  files, unmodified), Cantarell BMFont 18/27/36 (`fonts/`), `fonts/OFL.txt`
  and `README` (origins, licences). Cantarell is SIL OFL 1.1 with no
  Reserved Font Name (checked against the upstream COPYING); MMapper's own
  fonts/LICENSE does not cover it.
- **Reader.** `src/map/mm2.ts` reads v42 only (other versions: a clear
  error naming the version). Inflate is injectable (`Inflate`; default
  `DecompressionStream('deflate')`). It applies MMapper's exit invariants
  (EXIT / UNMAPPED / DOOR), resolves file room ids to indices (dangling
  targets dropped), and skips contents and notes. `src/map/mm2-write.ts` is
  the inverse (tests, and the replay export's subset). arda.mm2 in Node:
  inflate about 40 ms, parse about 60 ms, indexes about 50 ms.
- **MapData** (`src/map/model.ts`). Typed arrays per room (x, y, z,
  extId, serverId, terrain, light, align, portable, ridable, sundeath,
  mob/load flags), `names`/`descs`/`areas`. Seven exit slots per room
  (`room*7+dir`, N S E W U D UNKNOWN): exitFlags, doorFlags, doorNames
  (a Map by slot), and CSR `outStart/outTo` plus rebuilt `inStart/inFrom`.
  Infomarks are struct-of-arrays. Indexes: `byServerId`, `byNameDesc`
  (FNV-1a of the whitespace-normalised name + desc → rooms; use
  `roomsByNameDesc`, which verifies the text), `bounds`, `layers`. It is
  structured-cloneable. `buildIndexes` rebuilds everything derived.
- **Subsets for the HTML replay.** `subsetMap(map, rooms)` cuts a
  MapData. `neighbourhood(map, rooms, depth)` adds rings of neighbours.
  Exits that leave a subset keep their flags but lose their targets, and
  a `.mm2` round trip turns them into UNMAPPED. So export a ring (depth ≥
  1) around what is shown. The worker loads a subset as
  `{kind:'data', map}` or as `.mm2` bytes (`{kind:'bytes'}`).
- **Protocol** (`src/map/protocol.ts`). The unions are keyed by `t`, and
  unknown `t` values are ignored on both sides. `init` carries the
  transferred OffscreenCanvas, CSS size, dpr and an **AssetSource**
  (`base` URL, or `inline` path → data URI / Blob). The worker reads
  every asset through `assetResolver` (`src/map/assets.ts`) and never
  through a hard-coded path. `load` has a `req` id that `loaded`/`error`
  echo. `events` carries batched `MapEvent`s (gmcp subset, cmd, fail
  kind, conn). The worker sends `ready`, `loaded` (counts, hash, ms),
  `error` (stage init/load/render) and `status`.
- **Worker.** `src/map/worker/core.ts` (`MapWorkerCore`, testable in
  Node) and the entry `map.worker.ts`. Rendering is on demand, coalesced
  per worker rAF (16 ms timeout fallback) and skipped while hidden. The
  view lives in `src/map/view.ts` (MMapper's projection
  `s(z)=2640·zoom/(60−7z)`, pan, zoom at the cursor, layer). The renderer
  seam is `src/map/render/renderer.ts` (`Renderer`, `createRenderer`);
  P0's `ClearRenderer` only clears to `#2e3436`.
- **Worker start.** The app uses `src/map/spawn-worker.ts`, a module
  worker (`worker.format: 'es'`), a separate ~10 kB asset. The HTML
  replay build (`bundleReplay` in vite.config.ts) aliases `./spawn-worker`
  to `spawn-worker-inline.ts`, which uses `?worker&inline`: the worker is
  bundled as an IIFE, embedded as base64 and started from a blob: URL,
  with Vite's data: URL fallback. Verified from file:// in Chromium and
  Firefox (e2e `map.spec.ts`). The replay bundle grew from 302 179 to
  319 755 bytes (+17.6 kB, +6.4 kB gzip). `__WC_REPLAY__` (defined only
  there) makes the replay's default map host load nothing until P3
  passes one in.
- **Pane.** `PaneId` `map` has `blankWhenInactive` false, `MIN_ROWS` 3,
  first in `LEFTOVER_PRIORITY` and first in `DROP_ORDER`. Default
  placement is `FloatPane.auto`: until the user moves or resizes it, the
  map floats at the game pane's top-right corner, 50 % × 35 % of the
  window (25 % × 27 % since ADR 0023) (`autoFloatRect`, recomputed on every layout). `defaultLayout`
  and `migrateLayout` add `{id:'map', auto:true}` as the backmost
  floating entry, so other floating panes' z-index moves up by one.
  `MapPane` imports `src/map/client.ts` on the first show. Input is
  coalesced per frame: drag → `pan`, wheel → `zoom` (pixel/100, line/3),
  Ctrl+wheel → `layer` (wheel away = down). The canvas prevents
  `mousedown`, so the input keeps the focus. `PaneContext.map`
  (`MapPaneHost`: `source()` + `assets`) overrides what is loaded (the log
  player and the replay, P3). `content.dataset.mapState` / `mapRooms`
  are for tests.
- **DB v7.** `maps` (keyPath `key`, record `current`: `StoredMap`) and
  `mapIds` (keyPath `['mapHash','serverId']`, `StoredMapId`). `mapHash` is
  a 32-hex SHA-256 prefix of the file bytes.

### P2 Tracking (2026-09-28)

- **Forwarding** (`MapEventForwarder`, `src/map/client.ts`). `MapPane`
  subscribes its four handlers only while the pane is shown and its map is
  loaded, and unsubscribes when hidden; each (re)start sends `{k:'resync'}`
  (the worker drops its prespam queue and pending move). `cmd.sent` is one
  push (secret commands skipped); `gmcp` is a lower-case lookup against
  `MAP_GMCP_PACKAGES`; `text.line` runs one anchored regex
  (`MOVE_FAILURE_RE`, MMapper's failure and death actions); `conn.state`
  is forwarded as is. One `postMessage` per microtask. Measured in Node:
  0.04–0.11 µs per event (unit test asserts < 0.05 ms); `postMessage` of a
  move batch (cmd + Event.Moved + Room.Info) 2.4 µs Chromium, 4.7 µs
  Firefox.
- **Locator** (`src/map/locate.ts`) follows "Locating the player" and
  adds two guards: a room whose own server id differs from `Room.Info.id`
  is never matched by direction or text, and a learned id is used only
  while its room's name equals `Room.Info.name` (else it is forgotten).
  Besides direction/text matches it learns the exit ids Room.Info lists
  for neighbours without a server id that the map reaches by exactly one
  exit (as MMapper's path machine does). On `map-demo.log`: 29 of 29
  Room.Infos located (8 by map id, 18 by learned id, 3 by direction +
  name). Troll exit mapping only affects MMapper's sunlight flags while
  mapping, so it is not used; Char.StatusVars gives the player's name.
- **Event order.** `Event.Moved` is kept until the next `Room.Info`,
  which is located with it (no Event.Moved = LOOK). A second
  `Event.Moved` before a Room.Info steps blindly along a single-target
  exit (MMapper fires the pending event there).
- **Learned ids persist in the worker**: `src/map/worker/ids.ts` opens
  the same `webcockpit` DB (`openWebcockpitDb` is worker-safe) and writes
  `mapIds` records per batch, after `{t:'persistIds', on:true}`. The pane
  sends it only for the app's own map (no `PaneContext.map` host, not the
  replay build), so the log player and the HTML replay learn in memory
  only. Stored ids are loaded after every map load. No main-thread cost.
- **Prespam** (`src/map/path.ts`): MMapper's `isAbbrev` / first-word
  rules, dequeue per Room.Info (mismatch clears), failure pops, death,
  disconnect, connect and resync clear; `walkPath` as `walk_path`.
- **Group** (`src/map/group.ts`): member table by Group.* id; `type:"you"`
  is the player and gets no colour; Group.Set clears without releasing
  hues (as MMapper's `resetChars`); ColorGenerator starts at the player
  hue (60) and gives 198, 335, 113, …; members whose `text` equals the
  Char.StatusVars name (non-NPC) are also hidden. A live disconnect or a
  new connection clears the table; a finished replay keeps it.
- **Worker**: on every located Room.Info the view re-centres on the
  player and takes its layer; the renderer gets `setScene` only when the
  scene changed; `status` (with an optional `how`) is posted on change.
  Protocol additions: `MapEvent {k:'resync'}`, `MainToWorker
  {t:'persistIds'}`, `status.how`. The pane mirrors status as
  `data-map-located`, `data-map-room`, `data-map-how`.
- **Fixture** `tests/fixtures/map-demo.log` (generator
  `map-demo.gen.ts`, reads arda.mm2): 29 arrivals through Bree, invented
  MUME ids (17 000 000 + room) for rooms the map has no id for, two rooms
  with no id, one description that differs from the map, `n;n;n`
  prespam, a failed move, a look, up/down, two mates with `mapid`.
- **Unverified without live GMCP**: whether MUME's `Group.*` carries
  `mapid` for members outside the player's room (Cockpit's gmcp.md
  describes Group.* as room-scoped), whether `look` sends a Room.Info
  (a queued `look` otherwise clears the queue on the next move, as in
  MMapper), and the exact Room.Info exit object shape.

### P3 Options, log player, HTML replay (2026-09-28)

- **Current map.** `src/map/store.ts` `MapStore` (one per page, owned by
  the shell): the `maps` record `current` (now with optional `rooms`), else
  the bundled `arda.mm2`. `host()` is the Map pane's `MapPaneHost`; it is
  passed to the cockpit App and to every log player App
  (`AppOptions.map`, `PlayerHostOptions.map`), so both show the same map
  and the player reuses the bytes read once from IndexedDB (a copy per
  load, since the pane transfers them). `MapPaneHost` gained, additively,
  an async `source()` and `subscribe()`: the pane reloads when the map
  changes. Other tabs pick up an import on reload only.
- **Map tools worker.** `src/map/tools.ts` (pure) runs in a short-lived
  module worker (`src/map/worker/tools.worker.ts`, started per request by
  `src/map/tools-client.ts` and terminated after its answer; inline where
  there are no workers). It validates an import (parse + hash) and cuts
  replay subsets, so the page never parses a map on its main thread. It
  is separate from the render worker, so the import works with the Map
  pane off and does not touch P2's worker code.
- **Options → Panes → Mapper** (`options-mapper.tsx`): the current map
  (name, rooms, size, import date, or "arda.mm2 (bundled)"), `[X] Show map
  pane` (the same `panes.map.on` as the General grid, where the Map row
  appears automatically), `Import map file…` (hidden `.mm2` input; checked
  in the tools worker, then stored; a bad file flashes the reason and the
  old map stays) and `Use bundled map` (deletes the record).
- **HTML replay.** At export (`buildReplayHtml(payload, { map })`,
  `src/replay/map-embed.ts`) the chain's `Room.Info` (id, else name +
  description: unique, or the candidate next to the previous room, or all
  of ≤ 4 candidates) and `Group.*` `mapid`s give the visited rooms; the
  subset is every room within 8 rooms (x/y, |Δz| ≤ 1) of a visited room
  plus one exit ring (`SUBSET_MARGIN`, `SUBSET_RING`), written as `.mm2`.
  Tiles: only those the subset draws (its terrains, road/trail indices
  per MMapper's RoadIndex, the mob/load overlays it uses) plus the small
  fixed set (walls, doors, exits, streams, markers) and all three
  Cantarell sizes; `mellon.png` and unused terrain/road tiles are left
  out and the page's `AssetSource.inline.fallback` (new, optional) answers
  a missing `pixmaps/` path with a transparent 1×1 PNG, so a renderer that
  loads a whole tile group never fails. The payload carries it as
  `map: { name, rooms, visited, mm2 (base64), files (data URIs) }`
  (inside the gzip + base64 payload, so the `.fnt` files compress). No
  `Room.Info` → no map; an unreadable map → no map and a console warning.
  The page (`src/replay/map-host.ts`) passes it to the pane.
- **Sizes** (arda.mm2, shortest-path trips): 30 rooms → 321–394 rooms,
  mm2 57–65 kB, tiles + fonts 350–360 kB raw; an exported HTML file grows
  by about 495 kB (e2e: 708 kB → 1 204 kB). A 300-room trip → about 3 800
  rooms and 1.6 MB of base64. All 125 map tiles would be 700 kB raw
  (`mellon.png` alone 210 kB), fonts 149 kB. `replay.js` 320 536 bytes
  (+0.8 kB; the export code is not in it).
- **Replay layout.** VIEW records carry `panes.map` and the layout's
  floating map entry (`auto` survives `migrateLayout`), so on/off, the auto
  float and a moved rect replay like other panes (unit test). A VIEW from
  before stage 9 turns the map off.

### P1 Renderer (2026-09-28)

- **Modules** (`src/map/render/`, pure unless noted): `palette.ts`
  (MMapper's named colours), `textures.ts` (texture catalogue, generated
  dotted walls), `rooms.ts` (per-layer instanced room meshes, a port of
  `visitRoom`/`LayerBatchBuilder`), `connections.ts` + `geometry.ts`
  (connections and door names, a port of `Connections.cpp` and
  `ConnectionLineBuilder.cpp`), `infomarks.ts`, `font.ts` (BMFont parse
  and `FontBatchBuilder` layout), `characters.ts` (player, group mates,
  path, off-screen arrows, labels, MapScreen visibility), `shaders.ts`,
  `webgl.ts` (the WebGL2 renderer; `createRenderer` returns it). Origin
  comments name the MMapper files ported (GPL-2.0-or-later).
- **Projection.** The vertex shaders apply MMapper's 2D camera exactly:
  clip = ((x − sx)·5280·zoom/W, (y − sy)·5280·zoom/H, 0, 60 − 7z), so
  other layers get MMapper's per-layer scale. No depth buffer: layers are
  drawn in ascending z (painter's order), which gives the same result as
  MMapper's depth tests in the 2D view.
- **Textures.** Tiles are read through the AssetResolver and decoded with
  `createImageBitmap(…, {imageOrientation: 'flipY', premultiplyAlpha:
  'none'})`, matching MMapper's `QImage::mirrored()` upload, so texture
  coordinates and quads are MMapper's. Arrays: every 128² file (96
  layers), trails (64²), doors + `char-room-sel` (256²), all with
  `generateMipmap` + LINEAR_MIPMAP_LINEAR / LINEAR, mirrored repeat. The
  dotted walls are generated like MMapper (manual mips, NEAREST). A file
  that is missing (an HTML-replay subset) leaves its layer transparent.
  *Amended by 0082 (2026-10-06):* Options → Mapper picks a tileset that
  overrides `pixmaps/` file by file; each array takes the size of its
  largest file (≤ 256²) and the tiles swap live.
- **Draw order** per frame: clear; per layer ascending (fade quad before
  the current layer; `LayerMeshes::render`: terrain, multiply tints,
  streams, trails, overlays, up/down, doors, walls, dotted, other-layer
  dim; connections at zoom ≥ 0.15; door names on the current layer at
  zoom ≥ 0.4); infomarks (current layer, zoom ≥ 0.25); characters
  (squares, far-style fills and 2-px outlines, edge arrows), path point,
  path quads, name labels. About 15 draw calls per layer; a frame only
  sets uniforms. The scene geometry (a few dozen vertices) is rebuilt
  when the scene or the view changes.
- **Text.** Cantarell 18/27/36 by DPR (MMapper's thresholds), offsets in
  physical px, anchors snapped to the pixel grid, background box = glyph
  bounds + 2/1 px. Text meshes are rebuilt when the DPR picks another
  size.
- **Player marker.** The far (outline) style is used at zoom ≤ 0.4 and,
  WebCockpit-specific, whenever `scene.located` is false.
- **Worker changes.** `createRenderer(gl, assets, onChange)`: `onChange`
  requests a redraw when tiles or the font arrive. `webglcontextrestored`
  rebuilds the renderer and its meshes. The appended protocol message
  `{t: 'debugScene', scene?, center?, zoom?}` (development and tests
  only) sets a scene and the view without the tracking side; the e2e
  finds the worker by wrapping `Worker` in an init script (`name: 'map'`).
- **Numbers.** arda.mm2 mesh build in Node: rooms ~50 ms, connections
  ~35 ms, infomarks ~1 ms (plus the GPU upload), once per `setMap`, in the
  worker. Map worker bundle 10.0 → 43.0 kB; replay bundle 319 768 →
  352 821 bytes (+33.1 kB).
- **Parity check.** `tests/e2e/map-render.spec.ts` renders the owner's
  screenshot area (Orc Sleeping Warrens, 451,-84,0). The owner's
  screenshot matches a DPR 2 render at zoom 1.0 scaled by 0.58 (51 px
  per room, Cantarell 36): tiles, walls, icons, connection lines and
  door-name labels line up.

### P4 Integration and performance gate (2026-09-28)

- **Checks.** typecheck, 1 049 unit tests, build, 178 e2e (Chromium and
  Firefox) green. The flaky chromium `export.spec`/`player.spec` failure
  (cursor on Gittan, not Rasta) was a load race, not a date bug: History
  fills its list asynchronously and an `ArrowDown` sent before that was
  lost. The specs now wait for the rows. (The fixture ages: its unsaved
  Gittan runs pass the 14-day sweep cutoff from 2026-10-09; the sweep runs
  when the start page first shows, before the tests restore the backup, so
  it does not touch them today.)
- **Replay tiles from the renderer's tables.** `neededAssets` maps the
  subset's own room-mesh instances back through `ARRAY_FILES`
  (`roomMeshPixmaps`), plus `CHARACTER_PIXMAPS` and `FONT_FILES`; its own
  copies of the terrain/road/mob/load tables are gone. Nothing was
  missing before; unused stream, climb and `room-highlight` tiles are no
  longer embedded (e2e 30-room export: +491 kB). `CATEGORY_TEX` in
  `rooms.ts` is the category → texture array table `drawLayer` uses. A
  unit test checks arda.mm2 and eight subsets.
- **Context restore.** The restored renderer now also gets the tracker's
  current scene (it had the map only, so marker, path and mates were gone
  until the next move), the old renderer is disposed, and the worker posts
  `{t:'restored'}` (additive) so the pane drops its "context lost" notice.
- **persistIds** verified: the cockpit's host has it, the log player's
  (`MapStore.host()`) and the HTML replay (`IN_REPLAY`) do not;
  `map-tracking.spec` checks the stored ids.
- **Load timing** (additive): `loaded.info.stages` (fetch, inflate,
  parse + indexes, hash, meshes + upload) and a once-per-load
  `{t:'drawn', req, ms}` for the first frame with every tile and the font;
  the pane mirrors them as `data-map-load` / `data-map-drawn-ms`.
- **Bench** (`bench/browser-bench.ts`, `bench/results/latest.md`): a map-on
  run of key → send, frame → paint, scrollback and burst (map-demo GMCP fed
  every 100 ms; the burst log gets 2 158 GMCP lines, and its "off"
  baseline replays the same log), a map-load run, and a `chromium-gpu`
  configuration (ANGLE/Vulkan, the real GPU) next to the default headless
  Chromium, which draws WebGL with SwiftShader. Off → on:

  | | chromium (SwiftShader) | chromium-gpu | firefox |
  |---|---|---|---|
  | key → send p99 (ms) | 0.155 → 0.075 | 0.180 → 0.140 | 0.120 → 0.180 |
  | paint: late frames; median (ms) | 0 → 4; 9.7 → 8.8 | 1 → 0; 9.4 → 9.2 | 0 → 0; 9.8 → 9.6 |
  | scrollback at full (ms) | 3.18 → 1.82 | 4.99 → 5.05 | 3.58 → 4.04 |
  | burst max frame (ms) | 20.9 → 650.7 | 21.2 → 26.4 | 24.6 → 22.7 |
  | burst drain (ms) | 779 → 1 263 | 735 → 782 | 762 → 803 |

  All budgets pass with the map on in `chromium-gpu` and Firefox. The
  SwiftShader failures (4 late paints, one 0.65 s burst frame) are a
  GPU-process artefact: a single WebGL flush of the map takes 0.3–0.7 s
  on CPU (rare, early; most likely pipeline compiles), the worker waits in
  its canvas readback and the page's frames wait on the same GPU thread,
  while the main thread is idle (flush script < 1 ms). Chrome no longer
  gives WebGL through SwiftShader by default, so users get a GPU or the
  map's notice.
- **Main thread, map on** (Chromium trace, every task from the settings
  change to 1 s after the first complete frame): longest 2.3–4.7 ms. The
  worst one is the cockpit's relayout rAF when a pane appears, and turning
  the `ui` pane on costs the same (4–6.5 ms); the map's own JS (client
  chunk, worker start, canvas transfer, messages) is under 2 ms per task.
  Load, parse and mesh build run in the worker only.
- **Load** (arda.mm2, 5.8 MB, localhost preview), turn on → first frame
  with tiles and font: Chromium 535 ms, chromium-gpu 606 ms, Firefox
  559 ms. In the worker (load start → that frame 480 / 521 / 460 ms):
  fetch 188 / 226 / 167, inflate 61 / 63 / 70, parse + indexes 148 / 152 /
  152, hash 5 / 5 / 4, meshes + upload 76 / 74 / 57 ms; tiles and font
  arrive in the remaining ~60 ms.
- **Visual check** (dev server, `map-demo.log` at speed 0.25): the map
  follows every move (id, learned and direction matches), the marker, the
  prespam path (`n;n;n`), group mates (squares in view, edge arrows off
  view) and labels draw, and drag pans and the wheel zooms around the
  cursor in all three configurations. `map.spec` now asserts that the
  canvas changes on drag and on wheel.

### Amendment: older `.mm2` versions (2026-09-28, owner test 1)

The owner's `arda(1).mm2` is schema 36 (MMapper 19.10 … 25.03). The
reader now takes every schema MMapper 26.06.0 accepts: 17, 24, 25, 32–36,
38–42 (the same list as its `mapstorage.cpp`). Other versions fail with
"Unsupported MMapper map version N: versions 17–42 (MMapper 2.0 to
26.06, except 37) can be read, and …" (newer: "newer than this reader
knows"). The conversions are ported from MMapper's loader, with an
origin comment in `src/map/mm2.ts`:

- Storage: v ≥ 34 qCompress (u32 length + zlib), 25–33 a bare zlib stream
  after the 8-byte header, < 25 uncompressed. Strings are QString
  (UTF-16BE) in every version.
- Rooms: area from 42, server id from 40 (0 before), terrain 15 (death)
  before 41 → INDOORS + DEATHTRAP load flag, an upToDate byte before 39,
  ridable from 24, sundeath and 32-bit mob/load and 16-bit exit flags
  from 33 (else 16/16/8 bits), 16-bit door flags from 32 (else 8),
  NO_MATCH exit flags dropped for 25–34 (MMapper: corrupt in those),
  y negated before 36 (south was +y), for the selected position too.
- Exits: before 38 each exit also stores inbound links. As in
  `WorldBuilder::sanitize`, an inbound link A → B without A's outgoing
  link adds it; dangling ones are ignored. Incoming is rebuilt as before.
- Infomarks: before 36 a name string and a QDateTime (9 bytes, Qt 4.8
  stream) are skipped, the angle is stored ×100, and
  `transformInfomarkOnLoad` applies (half-room offset, TEXT and ARROW
  nudges, angle negated, y negated). Class and angle exist from 32.
- All versions, as MMapper's `toEnum` / `bitmaskToFlags`: unknown
  terrain, light, align, portable, ridable and sundeath values become 0
  (UNDEFINED) and flags are masked to the defined bits.

`mm2-write.ts` takes a schema version (tests only; the replay export
keeps v42) and inverts these conversions. `arda(1).mm2` parses to 30 074
rooms, 674 infomarks, the same bounds and positions as the bundled v42
`arda.mm2`, 52 death rooms → DEATHTRAP, 85 921 links (one dangling
dropped, one added from an inbound list), no server ids. Its render at
the Orc Sleeping Warrens matches the bundled map pixel for pixel.
With no server ids, the locator works from direction and text matches
and learned ids (P2), as for the 84 % of arda.mm2 rooms without one.

## Amendment 2026-09-28: Mapper menu and default on (owner test 2)

- The Mapper page moves from Options → Panes → Mapper to **Options →
  Mapper** (directly after Panes).
- The map pane is **on by default** (`panes.map.on: true`) for new
  settings. Stored settings keep their value.

## Amendment 2026-09-29: status of the bundled map data

- One of the MMapper authors answered (2026-09-29): the MMapper authors
  hold no rights in the map; it repackages the MUME world, MUME has no
  licence, and each zone's builder owns its copyright. MMapper's own map,
  `MUME/arda` (`arda.xml`), declares no licence and says it grants no
  rights beyond fair use.
- Switching to `MUME/arda` would not change the legal position (same
  texts, same status), so **the owner's `arda.mm2` stays bundled** (owner
  decision, 2026-09-29). WebCockpit does what MMapper does; MUME is not
  contacted separately (owner decision).
- `public/map/README` and `THIRD_PARTY_NOTICES.md` now state that the
  file carries no licence, that WebCockpit's GPL does not cover it, and
  that WebCockpit grants no rights in it. The earlier wording "on the
  same terms as MMapper" could be read as the GPL applying.

## Amendment 2026-10-03: locator exit check (ADR 0071)

Step 2 also needs the exit set or the description to agree (both from
an unlocated origin), a lost tracker advances tentatively along a
single-target exit, matches from such an origin teach no ids, and a
learned id needs name and exit set to agree. See ADR 0071.
