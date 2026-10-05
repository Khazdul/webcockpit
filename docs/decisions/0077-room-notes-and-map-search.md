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

### C. Bundled Map search

- A pane modelled on MMapper's Find Rooms dialog.
