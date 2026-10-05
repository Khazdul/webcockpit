# Stage 21 — Room notes and map search

Owner request 2026-10-05: show MMapper room notes, a room-info box on
map hover, search in the script API, and a bundled "Map search" pane
like MMapper's Find Rooms dialog.

Spec §2.9, §2.10, ADR 0077. Research: MMapper 26.06.0 source
(`/home/ole/build/mmapper/src/MMapper-26.06.0/src`), see the ADR.

## Owner decisions

- 2026-10-05: notes toggle in Options → Mapper; on shows notes in the
  game window as MMapper does.
- 2026-10-05: API search on notes, room names and descriptions (the
  other MMapper fields come along).
- 2026-10-05: hover box after ~3 s, discreet, **name and note only**.
- 2026-10-05 (later): the hover box content is a setting, Options →
  Mapper "Room info on hover: Minimal / Full" (default Minimal).
  Minimal = name + note. Full = name, description, exits (doors in
  brackets as MUME), mob/load flags in words, and the note. Never area/
  zone or terrain in either mode; Full has a capped, wrapping width.
- 2026-10-05 (later): a third value, **Off** (Off / Minimal / Full,
  default still Minimal): no hover box, no long-press box, no timers.
- 2026-10-05: Map search shows shortest-path directions as text.
- 2026-10-05: marks live until cleared; zoom shows player + marks, and
  goes back to following the player when the player moves; marks keep
  pulsing.
- 2026-10-05: no player-written notes for now.

## Plan

### A. Map data, notes in the game window, hover

- Parse notes and contents from `.mm2` into `MapData`.
- Options → Mapper: Room notes On/Off (default On); Room info on hover
  Off/Minimal/Full (default Minimal).
- Note line(s) after the located room's exits line in the game window.
- Map pane hover box (3 s rest; long press on touch): name + note
  (Minimal) or the full room (Full).

### B. Script API

- `mapSearch(query, fn)`: field (name, desc, contents, note, area,
  exits, flags, all), case, regex; results nearest first by path with
  direction text.
- `mapRoom(id, fn)`, `mapPath(id, fn)`.
- `mapMark`: until-cleared duration and a focus that lets go on move.
- Pane `:setCheckbox` / `:setRadio`.

### C. Bundled Map search

- Query, field radios, Case sensitive / Regular expression, Find;
  results (steps, name, area, directions); click marks; Mark all,
  Clear.

### D. Verify and release

- Typecheck, unit, e2e, map bench with long-lived marks.
- Release on the owner's go.

## Tasks

- [x] ADR 0077, stage file, spec
- [x] A1 notes and contents in MapData
- [x] A2 Options → Mapper toggle (Room notes, Room info on hover)
- [x] A3 note lines in the game window
- [x] A4 hover box (Off / Minimal / Full; touch long press)
- [x] B1 mapSearch with path directions
- [x] B2 mapRoom, mapPath
- [x] B3 mapMark until cleared, follow-on-move focus
- [x] B4 checkbox / radio
- [x] C1 Map search script
- [ ] D1 full check, release

## Test guide

Open WebCockpit, log in, and have the Map pane on (the bundled map loads
by itself). Walk a little so the map knows where you are.

**1. Notes in the game window (part A).**

- Walk into or past a room with a herb or quest note (the Bree area has
  several; Map search below finds them). After the room's `Exits:` line a
  `Note:` row shows the note in dim italics.
- Try `brief` mode too: the note still comes after the exits line.
- Options → Mapper → *Room notes: Off*: no note rows. Turn it back on.

**2. Room info on hover (part A).**

- Rest the mouse over a room on the map for about 3 seconds: a box with
  the room's name (green) and note (*Minimal*, the default). It sits
  just right of and below the pointer (left / above near the window's
  edges), and may reach past the Map pane's edges. Also on the map's top
  row, and after a click with the mouse kept still.
- Options → Mapper → *Room info on hover*: *Full* shows MMapper's room
  preview (name, description, contents in italics, `Exits: {north},
  =east=, …`, the note); *Off* shows nothing. *Hover text size*: Small,
  Medium (the default, a little smaller than the game text), Large (the
  game text's size).
- On the phone: a long press on a room shows the same box.

**3. Map search pane (part C).**

- Scripts page (or `#script enable mapsearch`): turn on *mapsearch*. The
  Map search pane opens at the right edge. `mapsearch` shows or hides it;
  `mapsearch <text>` searches straight away.
- Choose *Notes*, type `herb`, press Enter. The list shows the nearest
  rooms first: steps, name and area. Nothing in the pane shows a
  tooltip.
- Click a row or two: they get a `●`, pulse on the map, and the map zooms
  out to show you and them. Walk one step: the map follows you again and
  the marks keep pulsing.
- Choose *Flags* and search `rent` (inns), then *Name* and a room name.
  The marks from before stay; *Mark all* marks the list; *Clear* removes
  every mark. *Close* (or the pane's ×) hides the pane and clears too.
- Accents do not count: *Name* `Círdan` finds *Cirdan's Home* (as
  `cirdan` does). Turn the Map pane off and search: "Map off".

**Feedback wanted:** is the pane's size and place right (right edge, 60
columns), are the columns readable (steps, name, area), is "a new search
keeps the marks" the right call (or should a new search clear them), and
does the zoom-out on every mark click feel right or too jumpy? Anything in
the hover box or the note rows that reads wrong.

## Owner feedback

### Round 1 (2026-10-05)

1. Hover does not work when the pointer is near the map's top edge.
2. Hover box: room names in green.
3. Hover text size selectable: Small / Medium / Large (Medium = today).
4. Click on the map and keep the mouse still: no hover box. It should
   come.
5. Hover content like MMapper's room preview: no "aggressive mob" flag
   words; show the room's contents (the mobs/objects as seen in play).
   Skip MMapper's first line ("### Room …") and the "(emulated)" after
   Exits.
6. The hover box may extend outside the Map pane, so long rooms show in
   a small map window; place it so it covers as little of the map as
   possible.
7. Remove the "way" (direction text) completely from Map search: no
   column, not in the row tooltip.
8. Pane bar: hovering the bar shows a gear next to the drag grip;
   clicking it opens a small menu to choose which panes the bar shows.
9. Map search: remove Case sensitive and Regular expression for now.
   Search ignores diacritics ("o" finds "ó").

### Round 1 status

Details: ADR 0077 "Feedback round 1".

- [x] 1. Top edge: a borderless map's title grip lay over the canvas's
  top row; the hover now follows the mouse over the whole pane.
- [x] 2. Room name in green (`--c-ok`, readable on dark and light).
- [x] 3. Options → Mapper *Hover text size: Small / Medium / Large*.
- [x] 4. A click (button up) with the mouse kept still starts the 3 s
  rest again.
- [x] 5. Full = MMapper's room preview: name, description, contents,
  MMapper's exits line (no "(emulated)"), note; no flag words, area or
  terrain, no "### Room" line.
- [x] 6. The box sits outside the Map pane (side with the most room,
  inside the viewport, width capped by text size).
- [x] 7. No way in Map search (column and tooltip).
- [x] 8. Pane bar gear menu: built (⚙ beside the grip, a "Bar buttons"
  pop-up), then removed in round 2 at the owner's request (revert of
  merge 9332b3f; ADR 0065 unchanged).
- [x] 9. No Case sensitive / Regular expression; search ignores accents
  (the bundled map's text is ASCII, so it already did; the fold now
  covers every combining mark).

### Round 2 (2026-10-05)

1. The hover box should stay near the pointer (as with a full-window
   map), not outside the Map pane.
2. No tooltips in the Map search pane: not on result rows, the radio
   buttons or the Find button.
3. Hover sizes: today's Small becomes the new Medium (default); Small
   smaller still; Large = today's Medium.
4. Pane bar gear: not liked; removed.
5. Notes in the game window look fine.

### Round 2 status

Details: ADR 0077 "Feedback round 2".

- [x] 1. The hover box sits beside the pointer (12 px right and below,
  flipped left / up at the viewport's edges), may extend past the pane,
  always inside the viewport; the "side with the most room" rule is gone.
- [x] 2. Map search: no tooltips (rows, column header, radios, Find,
  Close, Mark all, Clear); clicks unchanged.
- [x] 3. Hover text sizes: Small 0.72, Medium 0.85 (default, the old
  Small), Large 1 (the old Medium). Stored keys unchanged.
- 4. Pane bar gear: reverted (commit 3544b6d).
- 5. Notes in the game window: no change needed.
