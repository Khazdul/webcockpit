# 0057 — Script map marks

- Status: Accepted
- Date: 2026-10-02
- Builds on ADR 0020 (map: worker, renderer, view), ADR 0051 (script
  host), ADR 0054 (key manager TV); design note
  `notes/research/scry-map-marks-design.md`

## Context

After a scry the owner wants to see on the map where the scried room is.
A scry shows the room's text, not its id, so the room must be found on
the map by name (and description and exits), marked visibly, and shown
together with the player. The map lives in a worker (ADR 0020); scripts
live on the main thread in the script host. Owner decisions (2026-10-02):
magenta, 15 s, the view returns unless the player moved it, map off means
nothing happens (and the player is told), live only, at most the 20
nearest matches.

## Decision

### Matching (`src/map/query.ts`, pure, in the worker)

- `RoomQuery = { name, lines?, exits?, max? }`. A lazy name index
  (`normalizeText(name)` → rooms, and a lower-case one) is built on the
  first query per map (one pass; kept in a `WeakMap` beside `MapData`, so
  the model is unchanged). Exact name first, else case-insensitive.
- Description narrowing: a candidate scores the number of query lines
  (normalised, at least 20 characters) that occur in its normalised
  description; the best score wins when it is above 0, otherwise all stay
  (brief mode shows no description; aura and object lines match nothing).
- Exits narrowing: `Exits: north, [south].` (brackets are doors) →
  Room.Info-style bits; candidates whose `visibleExits` equal them are
  kept when there are any.
- Order: nearest to the player's room first (`dx² + dy² + (8·dz)²`;
  index order when the player is unknown); the result is the first `max`
  (default 20, at most 50) and the `total`.

### Protocol (additive, `MAP_PROTOCOL_VERSION` stays 1)

- main → worker: `{t:'find', req, query}`, `{t:'mark', id, target,
  style, ms, focus}` (`target`: `{rooms}` or `{query}`), `{t:'unmark',
  id}`.
- worker → main: `{t:'found', req, rooms, total}`, `{t:'marked', id,
  rooms, total}`, `{t:'markEnded', id}`.
- `MarkStyle = {color, blink, fade, arrows, label?}`. An older worker
  ignores these; the hub then never hears back (a mark simply never
  resolves).

### Worker core and rendering

- The core keeps marks with an absolute end (`host.now()`). While a mark
  lives and the pane is visible it runs a frame loop that refreshes the
  scene at most every 66 ms (15 Hz): `alpha = envelope × (0.55 + 0.45 ·
  cos 2πt)` with a 1 s period (`blink`), the envelope 1 and falling
  linearly over the last `fade` seconds. The loop stops with the last
  mark and while the pane is hidden. A hidden pane's marks are checked
  when it is shown again and on every message to the worker, so a mark
  never shows past its end, but its `markEnded` may come late while the
  pane is hidden (the hub then counts it as live a little longer).
  `markEnded` is posted at the end; a map load ends every mark.
- `Scene.marks` (optional, additive): `{rooms, color, alpha, label,
  arrows}`. The renderer stays clock-free; `buildScene` draws marks
  before the group and the player (`CharBatch.drawMark`): per room a
  fill (α 0.35·alpha) and a 2 px outline (alpha) slightly larger than
  the room; below 12 px per room also a 16 px screen dot (the path-end
  point); a room off the view gets an edge arrow (`screenArrow` at the
  `proxy` point, the same as a group mate), at most 8, nearest first; a
  room on another layer gets the layer arrow. A label is drawn on the
  nearest room. Only the scene mesh is rebuilt per tick.

### View

- `fitRooms(view, player, targets, w, h, margin = 48)` (`view.ts`): the
  player's room and the targets (all when ≤ 5, else the nearest 3) in
  view on the player's layer; it only zooms out (never in) and clamps at
  `ZOOM_MIN`. Without a player position the targets alone.
- `focus = true` saves the zoom and fits. While the focus lasts, a
  located move re-fits instead of only centring. A pan, zoom or layer
  change by the player marks the focus `touched`: no more fitting. When
  the mark ends: untouched → the saved zoom back, centred on the player;
  touched → the view stays.

### Main thread: `MapMarkHub` (`src/map/marks.ts`)

- App owns one hub and puts it in `PaneContext.mapMarks`; the hub never
  imports the worker or the client. The Map pane attaches a port to it
  once its map is loaded (and detaches on dispose); the port forwards
  find/mark/unmark to the client and routes the answers back by id.
- `available()` is false while no map is loaded or the pane is not shown
  (Options off, or no room). A deviation from the design note's "a
  request while the map loads waits": an answer that might come much
  later is worse for a 15 s mark than a clear "map off" now.
- The pane sets `data-map-marks` (the live marks) for tests.

### Script API (additive to `@api 1`)

- `mapMark(target, opts, fn)` → handle, or `nil, reason` (`"map off"`
  at once when the map is not available). `target`: a list of room ids,
  or `{name, lines, exits, max}`. `opts`: `color` (a Mudlet colour name,
  `#rrggbb` or `r,g,b`; default magenta `#ff40ff`), `duration` (s,
  default 30, 1–600), `fade` (s, default 10, at most the duration),
  `blink`, `arrows` (default true), `label`, `focus` (default false).
  `fn(count, total, ids)` once resolved (count 0 when nothing matched).
- `mapUnmark(handle)` → true when it was live. `mapFind(query, fn)` →
  `fn(ids, total)` (`nil, "map off"` at once otherwise).
- Room ids are map room indices, valid for the current map only.
- Ownership: the Owner's marks are unmarked when the script stops. Caps:
  8 live marks per script, 50 rooms per mark.

### Key manager

On the end of a scry block: the first captured line is the room name
(the room's first line in MUME, also in brief mode), the rest are the
description lines, the `Exits:` line the exits. `mapMark` with magenta,
15 s, fade 5 s, `focus = true`, label `$name`. The dim `KEYS TV` line
says the result: `scried; on the map.`, `scried; 4 rooms named "A
Tunnel" marked (nearest first).`, `… 20 of 230 …`, `scried; "X" is not
on the map.`, `scried (map off).`

### Runs

Live only for now: marks are not recorded, so the log player and the
HTML replay do not show them. A later `ESC MAPMARK` record (positions,
style) can add them.

## Package notes (2026-10-02)

- `src/map/query.ts` (`findRooms`, `parseExits`), `src/map/marks.ts`
  (`MapMarkHub`, `ScriptMapSurface`), `view.ts` `fitRooms`,
  `render/characters.ts` `drawMark`, `worker/core.ts` (marks, loop,
  focus), protocol and scene additions, `PaneContext.mapMarks`,
  `App.mapMarks`, the pane's port, host `mapMark`/`mapUnmark`/`mapFind`.
- An empty Lua table reads as an object in the host; `lines = {}` is
  accepted as an empty list.
- The key manager no longer replaces the scry header with a KEYS line
  (with `tvgag` it is gagged); the KEYS TV line with the map's answer
  follows the block instead, so it says one thing once.
- Bench gate: with the map on, `bench/browser-bench.ts` keeps three marks
  (20 rooms each, blinking, arrows) live for the whole run. Measured
  2026-10-02 (`--only budgets,map`, 1728 × 1000 at ratio 2): every
  map-on budget passes — key → send p99 0.12 ms (Firefox) / 0.065 ms
  (Chromium GPU); frame → paint no late frames, p95 19.6 / 19.9 ms;
  burst longest gap 20.0 / 25.8 ms, none over 50 ms; scrollback 2.76 →
  2.80 / 5.50 → 6.14 ms; tracking located at the end.

## Consequences

- No cost while no mark lives; a live mark costs a scene rebuild 15
  times a second (a few dozen vertices), measured by the map bench.
- The scry format is unverified (no log has a scry); if the first line
  after the header is not the room name, nothing matches and the KEYS
  line says so.
