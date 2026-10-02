# Scry map marks — design (2026-10-02)

Planning note for stage 12 round 6. Source: a design pass over the map
code (ADR 0020) and the script host (ADR 0051/0053). The decisions are
recorded in ADR 0057 when built.

## Owner decisions (2026-10-02)

- Mark colour: magenta.
- Duration: 15 s (not 30). If the user pans/zooms during the mark, the
  view is left where they put it; otherwise it returns to the previous
  zoom and centres on the player.
- Map pane off: do nothing; the KEYS line says the map is off.
- Replay: live only for now; recording marks is a later package.
- Many matches: the 20 nearest (main-session call).

## Evidence

- Room output in owner logs (`/home/ole/MUME/data/runs/*/*.log`): the
  room name is the first line, whole-line ANSI green; then optional
  magenta aura lines, objects, mobs, `Exits: north, [south].`, blank.
  The owner plays brief mode: descriptions are rarely shown.
- No scry in any log. Format from the Mudlet script: header line, then
  the room. Rule: first non-empty line after the header = room name.
  Colour is not needed (it is a MUME user setting). If an XML `name`
  span is present (`Line.tags`, MUME.Client.XML is on), it wins.

## 1. Matching (worker, new `src/map/query.ts`, pure)

- Lazy `byName: Map<normalizedName, number[]>` on `MapData`, built on
  the first query (one pass, a few ms). Normalise with `normalizeText`;
  exact, then case-insensitive fallback.
- Description narrowing: score = number of captured lines (normalised,
  ≥ 20 chars) that are substrings of `normalizeText(map.descs[r])`.
  Best score > 0 keeps the best; 0 keeps all (brief mode, aura lines).
- Exits narrowing: parse `Exits:` (brackets = door); prefer candidates
  whose `visibleExits` (locate.ts) equal it; ignore if none equal.
- Order by distance from the player's room (x/y, z penalty); return
  `total` and the first `max` (default 20). Zero matches: empty list.

## 2. Script API (additive to `@api 1`; lua-api.ts, manual, spec §2.10)

- `mapMark(target, opts?, fn?) → handle | nil, reason`
  - target: list of map room ids, or `{name=, lines={…}, exits="…", max=20}`
  - opts: `color` (default magenta `#ff40ff`), `duration` (s, default
    30, max 600), `fade` (s of fade-out at the end, default 10),
    `blink` (true), `arrows` (true), `label`, `focus` (false)
  - `fn(count, total, ids)` once resolved, or `fn(nil, reason)`.
- `mapUnmark(handle) → bool`; `mapFind(query, fn)` → `fn(ids, total)`.
- Later: `mapFocus`, `mapRoomInfo`, `lineTags()`.
- Ids are map room indices, valid for the current map; a map reload
  drops all marks silently.
- Ownership: an Owner `marks` set, released on unload. Caps: 8 live
  marks per script, 50 rooms per mark, 200 rooms total.
- Map pane off / worker never started: `nil, "map off"` synchronously.
  Map loading: the request waits. Pane hidden after being shown: mark
  placed, plays out its remaining time when shown again.
- Plumbing: `src/map/marks.ts` `MapMarkHub` owned by App (never imports
  the worker); `MapPane` attaches via optional `PaneContext.mapMarks`
  once its client has loaded, detaches on dispose, resends live marks
  with remaining time on attach. `ScriptHostOptions.map?:
  ScriptMapSurface` with `available/find/mark/unmark`.

Protocol (`src/map/protocol.ts`, additive, version 1):

- main→worker: `{t:'find', req, query}`, `{t:'mark', id, target:
  {rooms}|{query}, style, ms, focus?}`, `{t:'unmark', id}`
- worker→main: `{t:'found', req, rooms, total}`, `{t:'marked', id,
  rooms, total}`, `{t:'markEnded', id}`
- `RoomQuery = {name, lines?, exits?, max?}`, `MarkStyle = {color,
  blink, fade, arrows, label?}`

## 3. Rendering

- `MapWorkerCore` holds marks with absolute expiry (`host.now()`), and
  per tick computes alpha → `scene.marks: {rooms, color, alpha, label,
  arrows}[]` via `setScene`; renderer stays clock-free, `buildScene`
  pure.
- Ticks only while a mark lives and the pane is visible, 15 Hz
  (`setTimeout` 66 ms → `requestRender`), stops at the last expiry. Only
  the scene mesh is rebuilt. Alpha = envelope × (0.55 + 0.45·cos 2πt),
  1 s period; envelope 1, then linear over the last `fade` s. Bench
  gate: 3 marks within existing map budgets.
- `drawMark` in `CharBatch` (`render/characters.ts`), before mates: a
  filled quad slightly larger than the room + 2 px outline; below
  ~12 px/room also a fixed 16 px screen sprite (the `points` path).
  Off view: reuse `drawCharacter`'s visibility test, `screenArrow`,
  `Screen.proxy`; other layer: the layer arrow. Max 8 arrows, nearest
  first, blinking with the mark.

## 4. View

- `focus=true` → `fitRooms(view, rooms, w, h, margin=48)` in view.ts:
  player's room + marks (all if ≤ 5, else nearest 3), `pxPerRoom` on
  the player's layer; only zooms out, clamps at `ZOOM_MIN`.
- Focus state `{rooms, until, savedZoom, touched}` in the core; a
  located move re-fits instead of `centreOn` while active. User pan,
  zoom or layer change sets `touched` and ends auto-fit (marks keep
  blinking). On expiry: untouched → restore `savedZoom`, centre on the
  player; touched → leave the view.

## 5. Runs

Live only. Later: an `ESC MAPMARK <json>` record (query, resolved rooms'
x,y,z,name, style); the player re-resolves by position;
`src/replay/map-embed.ts` adds marked rooms to the subset.

## 6. Key manager

In `scryDone()`: name = first captured plain line, lines = the rest,
exits = the `Exits:` line. `mapMark({name, lines, exits}, {color =
magenta, focus = true, label = "$"..key, duration = 15, fade = …}, fn)`.
Feedback in the dim `KEYS TV` line: `scried; on the map.` / `scried; 4
rooms named "A Tunnel" marked (nearest first).` / `… 20 of 230` /
`scried; "X" is not on the map.` / `scried (map off).`

## Tests

- query.ts on arda.mm2: unique name, ambiguous narrowed by a desc line,
  brief mode, aura ignored, exits, zero, ordering and `max`.
- `fitRooms`: never zooms in, clamps, unknown player position.
- Core with a fake clock: mark → marked; expiry → markEnded, ticker
  stops; no ticks while hidden; restore untouched / not after a pan; a
  move during focus re-fits.
- `buildScene`: off-view arrow, layer arrow, minimum sprite.
- Host: async callback, nil without a surface, caps, release on unload.
- Key manager: scry block → mapMark with name/lines/exits; feedback.
- e2e map.spec: replay map-demo, mark a known room, `data-map-marks`
  count, 0 after expiry.
