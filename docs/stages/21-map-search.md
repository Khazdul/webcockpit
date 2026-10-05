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
- [ ] B1 mapSearch with path directions
- [ ] B2 mapRoom, mapPath
- [ ] B3 mapMark until cleared, follow-on-move focus
- [ ] B4 checkbox / radio
- [ ] C1 Map search script
- [ ] D1 full check, release

## Test guide

(Written when the stage is ready.)

## Owner feedback
