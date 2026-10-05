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

Package notes (C, built 2026-10-05):

- **Script.** `src/scripts/bundled/mapsearch.lua` (`@name mapsearch`),
  off until the player turns it on, like the other bundled scripts. Pane
  `mapsearch/main`, title *Map search*, short `FIND`, `dock = "right"`,
  `lane = "own"`, 60 × 24 (the almanac's pattern; a float would cover the
  game text, and a list of 200 rows wants height). Alias `mapsearch` shows
  or hides it (shown: the query field takes the keyboard); `mapsearch
  <text>` shows it and searches with the pane's options. The pane is also
  in Options → Panes as every script pane.
- **Layout (60 columns; a real render, Notes "Herb" from Hill Road, two
  rows marked; the field holds the query).**

  ```
   Query: [Herb                               ] [Find] [Close]
   Search                       Options
   ( ) Name         ( ) Exits   [ ] Case sensitive
   ( ) Description  (•) Notes   [ ] Regular expression
   ( ) Contents     ( ) Flags
   ( ) Area         ( ) All
   200 of 916 rooms · 2 marked             [Mark all] [Clear]
  ────────────────────────────────────────────────────────────
     Steps  Room name           Area      Way
   ●    20  Young Forest                  4s 7w 4s 2e s 2e
   ●    20  Dusty Meadowland              4s 7w 3n 4w n w
        20  Barren Grasslands             4s 7w 3n 4w 2n
        25  Currant and Goose…            4s 7w 8n e 2n 2w s
        27  Narrow Valley in…   the Old…  3s 3e 4s 4e 2n e n…
        21  Windy Plains                  4s 7w 3n 4w n 2w
  ```

  Under 53 columns the Options go under the radio buttons; [Close] needs
  40. The list's columns: Area only when some room in the list has one
  (most rooms of arda.mm2 have none) and the width allows (≥ 44 cells for
  the text columns), then Way (≥ 26), else the name alone. A long way is
  cut with `…`; the row's tooltip has the name and area, the steps and the
  whole way wrapped to 56 cells (14 lines at most, then a count), the note,
  and "Click to mark/unmark". Rooms without a path show `—` and *no path*
  (dim); the player's own room *here*. Marked rows: `●` in the mark colour
  on the pane's `@dim` band.
- **Order.** As `mapSearch` gives it: by MMapper's walking cost, so the
  Steps column is not strictly rising (a road is cheaper than a forest);
  the header's tooltip says so. The ways are from where the player stood
  when searching: no re-search on every move (the list would reorder under
  the pointer); Find again refreshes.
- **Searching.** Enter in the field or [Find]. An empty query says *Type
  something to find.* A radio or checkbox change searches again when a
  search was made and the field is not empty (MMapper needs Find; here the
  options are one click, so the answer follows). Answers to an older
  search are dropped. Status row: `N rooms` / `200 of N rooms`, `· N
  marked`, `· your room is unknown` (no ways), or a message instead:
  *Searching …*, *No rooms found.*, *Bad regex: …* (red), *Map off: turn
  the Map pane on (with a map) to search.* (red).
- **Marks.** One live `mapMark(ids, {duration = 0, focus = "move"})` with
  every marked room: each change unmarks it and marks the new set, so the
  map zooms again to the player and the marks and gives the view back at
  the next move. **A new search keeps the marks** (they belong to rooms,
  not to the list: search a herb, mark it, search the next, mark it, see
  both); [Clear] removes them; [Mark all] adds the rows in the list; 200
  marked rooms at most (the mark's cap). [Close], the alias hiding the
  pane, the close cross and Options → Panes (seen through
  `sysPanesChanged`) all clear the marks, as the script stopping does.
- **Redraws.** Three parts: the controls (field, radios, checkboxes;
  drawn only when the width changes, so typing and the keyboard survive
  every other redraw), the status row, and the list. A list shorter than
  the last one clears the pane and draws all (a pane cannot drop rows).
  The list scrolls with the pane's own scrolling, the controls with it:
  that works with a finger (a script's `onWheel` paging has no touch).
- **Focus after show.** A pane shown again at the same size gets no
  `onResize`, and a field cannot take focus while hidden, so the script
  focuses the field on the `sysPanesChanged` that reports its pane shown
  (and on `onResize`), for a second after the alias.
- **Kept** (`store.query`): the last query text, field, case and regex.
- **Tests.** `tests/unit/scripts-mapsearch.test.ts` (the real host, a
  fake pane surface and a recording map port: layout wide and narrow,
  Enter, rows, hints, marks, Mark all, Clear, kept marks, re-search on
  option change, stale answers, store, messages, columns, alias, Close);
  `tests/e2e/mapsearch-pane.spec.ts` (bundled map, located player: Notes
  "Herb", click marks, Flags "rent" keeps them, Clear, close cross clears,
  the alias focuses the field).

### Feedback round 1 (2026-10-05)

Owner feedback after testing (stage file, "Round 1"): items 1–7 and 9
here; item 8 (the pane bar's gear menu) belongs to the pane bar (ADR 0065).
These notes replace the parts of A and C they name.

- **Top edge (1).** Cause: on a pane with *Border off* the title grip
  (`.wc-pane-grip`, one cell row, z-index 1) lies over the canvas's top
  row (ADR 0012), so the canvas got `pointerleave` and no moves there. A
  framed pane (the default float) was fine. Fix: the mouse hover listens
  on the pane element (the grip's moves bubble there), maps the point to
  the canvas and cancels outside it; `pointerdown` / `pointerleave` on the
  pane cancel. The pane drag itself is unchanged (the grip still takes the
  press). Touch keeps its canvas listeners (a phone has no grip).
- **Green name (2).** `--c-ok`, the theme's green, fitted to 4.5:1 on dark
  and light backgrounds (ADR 0041); Cockpit shows room names in ANSI green
  as the game does, but the ANSI green is not contrast-fitted.
- **Text size (3).** `settings.mapper.hoverSize`: `small` / `medium` /
  `large` (default medium = the cockpit font), `migrateMapper` clamps;
  Options → Mapper *Hover text size*. CSS scales `font-size` and
  `line-height` by 0.85 / 1 / 1.2 on `[data-size]`; the width caps are in
  `ch`, so they scale with it.
- **Click then still (4).** A primary button released over the canvas (a
  click or the end of a drag; `pointerup` only, not a lost capture) starts
  a new 3 s rest at that point (`MapHover.up`). Button down and drag still
  hide.
- **Full = MMapper's room preview (5).** `previewRoom` = `displayRoom`
  (name, desc, contents) + `displayExits` + the note. Ours: name; the
  description as one paragraph (MUME's hard line breaks at 80 columns are
  joined so the capped box wraps it); the contents lines in italic; the
  exits line as `displayExits` builds it without "(emulated)" (`Exits:
  {north}, =east=, -south-, |up|, ~west~, *down*.`, `Exits: none.`:
  door braces, climb bars, road `=` between roads, trail `-`, water `~`,
  sundeath `*` from the first target, MMapper's order N S E W U D); then a
  bold `Note:` and the note (one line on its row, else each line under it
  indented two spaces, as `displayRoom`). Skipped: the `### Room …`
  header, `enhanceExits` (its tail names flags: `smob`, `deathtrap`,
  `attention`, hidden door names), mob/load flag words, area, terrain.
  Minimal is unchanged (name + note lines, no label). The sun markers are
  MMapper's and cheap (half of arda.mm2's rooms have one, a `*` around an
  exit into a sunlit room).
- **Outside the pane (6).** The box is `position: fixed` (z-index 250,
  over floats, under the drag shield) in the cockpit element (the pane's
  parent), so it inherits the theme of the app or an in-app log player /
  HTML replay. Placement (`placeHoverBox`, pure): beside the pane on the
  side with more room that fits the box (left of a right-docked map), its
  top at the pointer's row; else above or below the pane, centred on the
  pointer; else beside the pointer (the old rule); always inside the
  viewport with a 4 px margin. Phone (`device().phone`): beside the
  finger, inside the viewport (one view at a time). Width caps 36ch /
  56ch (Minimal / Full) and `100vw − 8px`; a box taller than the viewport
  drops description words, then contents lines, from the end and shows
  `…`. It hides as before and also when the layout moves, resizes or hides
  the pane (`MapPane.place`). A containing block other than the viewport
  (none today) is corrected by measuring where (0, 0) lands.
- **No way (7).** The Map search pane has no Way column and no way in the
  row tooltip (`N steps away.`, `You are here.`, `No path from here.`).
  The Steps column and the order stay. The API keeps `dirs` and `mapPath`.
- **No Case / Regex, diacritics (9).** The pane drops both checkboxes;
  the query asks `{text, field, max}` and a stored `case` / `regex` is
  ignored (the store now keeps text and field). The API keeps `case` and
  `regex`. Diacritics: §B's fold already applied to both sides, and
  arda.mm2's text is all ASCII (no character above U+007F in names,
  descriptions, contents, notes or areas: MMapper saves ASCII), so `Círdan`
  already found `Cirdan's Home`. What it did not cover: combining marks
  outside U+0300–036F and letters NFD keeps whole besides the Nordic ones.
  `foldAscii` now strips every `\p{M}` and folds `Ł ł Đ đ Ħ ħ ı Ŧ ŧ` too
  (the locator uses the same fold on both sides, so its matching is
  unchanged for real text). Plain mode is case- and accent-insensitive.
- **Tests.** Unit: `map-hover.test.ts` (Full content and lines, exits
  markers, `placeHoverBox`, `up`), `map-search.test.ts` (diacritics per
  field; arda `Círdan`, `Lhûn`), `scripts-mapsearch.test.ts` (no Options,
  no Way, hints, stored case/regex ignored), settings and Options →
  Mapper. E2E: `map-notes.spec.ts` (outside the pane, Full as MMapper,
  green name, text sizes, click then still, the top row of a borderless
  map under the grip), `mapsearch-pane.spec.ts` (no Way / Options,
  tooltip, `Círdan`), `phone-map.spec.ts` (inside the viewport).

### Feedback round 2 (2026-10-05)

Owner feedback (stage file, "Round 2"). These notes replace the parts of
round 1 they name.

- **Beside the pointer (1).** The box outside the pane usually landed far
  from the pointer; the owner wants it near the pointer always, as with a
  full-window map. `placeHoverBox(bw, bh, px, py, vw, vh)`: 12 px right
  of and below the pointer, flipped left / up where it would leave the
  viewport, then clamped inside it (4 px margin). The pane rule (side
  with the most room, above / below) and `data-where` are gone; the box
  stays `position: fixed` in the cockpit, so it may extend past the pane
  and a long Full room is not clipped. Desktop and phone use the same rule.
- **No tooltips in Map search (2).** `mapsearch.lua` passes no hint to
  any link: result rows, the column header (its tooltip-only link is
  gone), the Search radios, Find, Close, Mark all, Clear. Clicks are
  unchanged. The help text no longer says to point at a row.
- **Text sizes (3).** Small / Medium / Large = 0.72 / 0.85 / 1 of the
  cockpit font (was 0.85 / 1 / 1.2): the old Small is the new Medium (the
  default), Large is the old Medium. The keys and the default `medium`
  are unchanged, so a user on the default gets the new Medium (intended).
  The `ch` width caps scale with the font as before.
- **Tests.** Unit: `map-hover.test.ts` (`placeHoverBox`: beside, flipped,
  clamped), `scripts-mapsearch.test.ts` (no link has a hint). E2E:
  `map-notes.spec.ts` (box beside the pointer, inside the viewport),
  `mapsearch-pane.spec.ts` (no tooltip on a row, the header, a radio,
  Find), `phone-map.spec.ts` (inside the viewport).
