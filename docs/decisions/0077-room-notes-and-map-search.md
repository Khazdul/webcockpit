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

### B. Script API

- `mapSearch`, `mapRoom`, `mapPath`; `mapMark` until-cleared and
  follow-on-move focus; pane checkbox/radio helpers.

### C. Bundled Map search

- A pane modelled on MMapper's Find Rooms dialog.
