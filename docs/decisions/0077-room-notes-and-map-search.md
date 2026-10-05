# 0077 — Room notes, map hover and map search

- Status: Accepted
- Date: 2026-10-05
- Builds on ADR 0020 (map), ADR 0051 (script host), ADR 0057 (map marks)
- Research: MMapper 26.06.0 `map/Map.cpp` `displayRoom`/`previewRoom`,
  `parser/abstractparser.cpp` (notes after exits, `dirsCommand`),
  `mapdata/roomfilter.cpp`, `mapdata/shortestpath.cpp`,
  `mainwindow/findroomsdlg.cpp`

## Context

MMapper map files carry per-room notes (players' knowledge: 1 283 rooms
in the default `arda.mm2`, mostly `Herb: …` and `Quest: …`), contents
(13 855 rooms) and mob/load flags. WebCockpit draws the flags but skips
notes and contents when it parses the map. The owner wants notes in the
game window, a room-info box when the pointer rests on the map, search
in the script API, and a bundled "Map search" pane that matches
MMapper's Find Rooms dialog.

Owner decisions (2026-10-05):

- Options → Mapper gets a notes on/off toggle. On: notes appear in the
  game window as in MMapper (after the room's exits).
- The script API can search notes, names and descriptions (MMapper's
  other fields are added too: contents, area, exits, flags, all).
- Hover: a small, discreet box next to the pointer after about 3 s of
  rest over a room. **Minimal content: room name and note.**
- Map search shows a **shortest-path direction text** per result (like
  MMapper's `_dirs`), as text only; nothing is sent to the game.
- Marks from Map search live **until cleared** (or a new mark, or the
  pane closes). The map zooms out to show the player and the marked
  rooms; when the player moves, the zoom goes back and follows the
  player again. The marks keep pulsing.
- No player-written notes for now (the map file's notes only).
- No "Select and Edit": the map is read-only.

## Decision

Sections below are filled in per part as built (package notes).

### A. Map data, notes in the game window, hover

- The `.mm2` reader keeps `note` and `contents` per room in `MapData`.
- Options → Mapper: *Room notes On/Off*, default **On** (MMapper's
  `showNotes` default).
- Notes are a client line after the located room's exits line:
  `Note:` (bold) and the text (italic, dim); a multi-line note puts each
  line under `Note:`. Not seen by triggers.
- Hover: rest 3 s over one room → a small box beside the pointer with
  the name and, when present, the note. Touch: long press.
- Owner (2026-10-05, later): Options → Mapper *Room info on hover:
  Off / Minimal / Full*, default **Minimal**. Off: no box and no hover
  or long-press timer at all. Minimal: name + note. Full: name,
  description, exits (`Exits: n e [s] u`, doors in brackets) and mob /
  load flags in words, then the note. **Never area/zone or terrain.**
  Full caps its width (wraps) and stays inside the pane.

Package notes (A, built 2026-10-05):

- **Map data.** `MapData.notes` / `contents` (`string[]`, '' when
  absent; 1 283 notes, 13 855 contents in arda.mm2) from `mm2.ts`;
  `subset.ts` keeps notes and empties contents (a replay has no search),
  so `mm2-write.ts` writes what the map holds: replay packages carry the
  notes of their rooms. Parse time unchanged within noise (bench).
- **Settings.** `settings.mapper = { notes, hover }` (`migrateMapper`),
  not in `ViewSnapshot`: a log plays with the viewer's own. Options →
  Mapper rows *Room notes: On/Off* and *Room info on hover: …* (cyclers).
- **Where the note comes from.** Only the worker can locate a room, and
  it answers after the text: one chunk carries Room.Info, the room text
  and the prompt, and is handled synchronously before the forwarder's
  microtask batch reaches the worker. So the note cannot be decided at the
  exits line (MMapper predicts from its queue instead). The Map pane's
  forwarder stamps Room.Info with a `seq` (only while notes are wanted),
  `Tracker` reports the room each stamped Room.Info was *located* in
  (a tentative or failed match gives none), the worker posts
  `roomNotes [{seq, note}]` once per batch, and the pane hands the note
  back with that Room.Info's bus payload to `RoomNotes` (`src/map/notes.ts`,
  `PaneContext.mapNotes`, owned by App).
- **Insertion point.** `RoomNotes` pairs the exits line (`exits` XML span,
  not in `snoop`; without XML a line starting `Exits:`) with Room.Info in
  either order: an exits line takes the newest Room.Info that has no exits
  line yet, else waits for the next one; each waits at most 1 s. The real
  order was not verifiable from a capture (only synthetic fixtures, which
  send GMCP first), so both are handled. The note rows go in after the
  exits line's display copy: `OutputPane.insertAfter` splices them into
  the not yet flushed queue (the usual case: the worker answers within a
  few ms, before the next frame) or after the anchor's row in the DOM
  (`watchAnchor`: one WeakMap entry per exits line). The game lines are
  never delayed or reordered.
- **Edge cases.** Brief mode keeps the exits line, so notes show. `look`
  sends Room.Info: same path. Prespam: each exits line pairs with its own
  Room.Info. Unknown room, empty note, notes off, map pane not running
  (desktop: hidden; ADR 0020 forwards only while shown and loaded) or no
  map: nothing. No exits line (gagged by the player, exits off): no note,
  as in MMapper.
- **Look.** `Note:` bold in the default colour, the text italic in
  `--c-hint`; a one-line note on the `Note:` row, a longer one under it,
  each line indented two spaces (MMapper displayRoom).
- **Triggers, capture, runs, replay.** The rows never touch the bus (like
  `#help` rows): no action, gag or substitute sees them, the recorder
  never captures them, run statistics never count them. The log player
  and the HTML replay are Apps too: when their Map pane runs (the replay's
  subset now carries notes) and notes are on, they make the rows again
  from the map, exactly as live.
- **Hover.** `src/map/hover.ts` (pure): hit test on the current layer
  with the renderer's projection (`pxPerRoom`), a lazy position index per
  map (WeakMap), and the content. Protocol `roomAt` both ways; the worker
  answers once per request. `src/panes/map-hover.ts`: one timeout, re-armed
  only when the mouse moves beyond 4 px; asks when it fires; hides when
  the pointer leaves the room's square, on button, wheel, drag, leave,
  player move (`status`), map load, or the pane hiding. Touch: 550 ms
  press within 8 px; the answer may land after the finger lifts; the next
  press hides it; the context menu is suppressed on touch. The point is
  scaled from the element to the worker's canvas size (the phone stretches
  the canvas a little). Box: `.wc-map-hover`, the script pane tooltip look
  (`--c-line-hl`, `--c-body`), name in `--c-title` bold, note italic
  `--c-hint`; Minimal capped at 36ch, Full at 56ch. Works wherever the
  Map pane runs: live, log player and HTML replay.
- **Cost.** Idle: nothing (no timer unless the pointer moved; none in
  Off). Notes: one extra small message per Room.Info batch while notes
  are wanted. Bench (quick, budgets + map): map on/off unchanged; map load
  583 / 637 ms (Firefox / Chromium GPU) against 632 / 977 before.

### B. Script API

- `mapSearch`, `mapRoom`, `mapPath`; `mapMark` until-cleared and
  follow-on-move focus; pane checkbox/radio helpers.

Package notes (B, built 2026-10-05):

- **API (additive to `@api 1`).** `mapSearch({text, field, case, regex,
  max}, fn)` → `fn(results, total, here)`, results `{id, name, area,
  note, steps, dirs}`; `mapPath(id, fn)` → `fn(dirs, steps)` or
  `fn(nil)`; `mapRoom(id, fn)` → `fn(room)` or `fn(nil)`, room `{id,
  name, area, desc, contents, note, terrain, x, y, z, exits = {{dir, to,
  door, flags}}, flags}`. Each returns `true`, or `nil, "map off"` at
  once (as `mapFind`); bad arguments are Lua errors. `here` (the player's
  room id or nil) is the third argument instead of a `mapHere`: Map
  search needs nothing more.
- **Matching (`src/map/search.ts`, MMapper `RoomFilter`).** Plain text:
  trimmed, escaped, whitespace runs match any whitespace (`\s+`), found
  anywhere, case-insensitive unless `case`; `regex = true` is a
  JavaScript RegExp (`i` unless `case`, no `u`: closest to Qt's PCRE for
  simple patterns). The query and the room text are folded to ASCII (ADR
  0069). Fields as MMapper: `exits` matches door names only; `flags`
  matches MMapper's flag names (mob `aggmob`…, load `herb`…, exit `door`
  `road` `climb`…, door `hidden` `needkey`…, and the defined light /
  sundeath / portable / ridable / align values) and also our words for
  mob and load flags (`aggressive mob`, as `mapRoom` and the hover box
  show them). Deviation: the `exit` flag is never matched (every exit has
  it, so `it` would find every room). `all` = any field. Empty text is an
  error. A bad regex is the player's typing, so it is `nil, "bad regex:
  …"` (checked on the main thread with the same engine before asking),
  not a Lua error. A catastrophic regex blocks only the map worker.
- **Paths.** One Dijkstra over the whole map from the player's room
  (MMapper `shortestPathSearch` without its hit limit; binary heap on
  typed arrays), cached per map until the player's room changes, so
  `mapPath` calls after a search are free. Costs are MMapper's
  `getLength` (terrain, random/damage/fall +30, door +1, climb +2, not
  ridable +3 and +4 on entering, road −0.1, death trap +1000); only exits
  with the EXIT flag and exactly one target are walked, all seven
  directions (`?` for an unknown one, as MMapper). arda.mm2 (30 074
  rooms, 29 246 reachable from Bree): **about 8 ms** per Dijkstra in
  Node; a name search with paths 13–18 ms, a flags or note search under
  3 ms after the tree.
- **Order and caps.** Rooms with a path by cost (ties by index), then the
  rest by ADR 0057's straight-line metric; without a position index
  order, `steps`/`dirs` nil. `max` default 200, at most 500; `total`
  counts every match.
- **Direction text.** MMapper's `compressDirections` runs, separated by
  spaces for reading (`3e n 2u`; MMapper writes `3en2u (total: …)`), no
  delta, no door annotation (MMapper has none either); `''` in the
  player's room.
- **Protocol (additive, version stays 1).** One generic pair instead of
  three: `{t:'ask', req, ask: {k:'search'|'path'|'room', …}}` →
  `{t:'answer', req, answer}`. `MapMarkHub.ask` routes by `req`; a
  detach answers `null` (the script gets empty results or `nil`).
- **`mapMark` options.** `duration = 0`: until `mapUnmark` or the script
  stops (the host sends `ms = Infinity`; the core's end and fade maths
  need no special case; no fade). It blinks all the while with the
  existing 15 Hz scene-only refresh. `focus = "move"`: fit now; a located
  move to another room (a `look` does not count) restores the saved zoom
  and centres on the player, ending the focus while the mark stays; a
  pan or zoom first ends it with the view left as is; unmarked before
  either, the zoom comes back as with `focus = true` (unchanged). Ids per
  mark: up to 200 (`MARK_ROOMS_MAX`, a Map search "Mark all" of a long
  list); a query mark keeps 50.
- **Bench.** `bench/browser-bench.ts` (map on) now adds a fourth mark of
  200 rooms that never ends. `--quick --only budgets,map` (Firefox /
  Chromium GPU, 1728 × 1000 at ratio 2), all PASS: key → send p99 0.12 /
  0.06 ms; frame → paint 0 late, p95 19.8 / 18.2 ms; burst + GMCP
  longest gap 23.2 / 32.6 ms, none over 50 ms; scrollback 2.42 → 2.92 /
  1.88 → 2.50 ms; map load 583 / 748 ms.
- **Checkbox and radio (`pane:setCheckbox`, `pane:setRadio`).** Built in
  the host on the existing cells and links, no new pane machinery: the
  marker and label are written with `setText` (`[ ]`/`[x]`, `( )`/`(•)`,
  then a space and the label with colour tags) and covered by a link the
  host handles itself (`PaneReg.toggles`, not a Lua function), so mouse,
  tap, hover band and tooltip (`hint`) come for free, and runs, the log
  player and the HTML replay show them as text. A click flips a checkbox
  (`onChange(checked)`) or chooses a radio button (`onChange(value)`,
  `value` defaults to the label; a click on the chosen one does nothing);
  radios are exclusive per `group` within the pane. The handle
  (`PaneToggle`): `:checked()`, `:set(on)` (redraws, no `onChange`; a
  radio set on unsets its group), `:remove()` (drops the link, blanks the
  cells). Like links and fields they go with their row (`setLine`,
  `gauge`, `clear`, an overlapping link); then `:checked()` is nil. No
  keyboard access (not trivial: panes have no focus model for it).

### C. Bundled Map search

- A pane modelled on MMapper's Find Rooms dialog.
