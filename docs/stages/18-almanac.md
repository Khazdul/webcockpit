# Stage 18 — Almanac (game time API and showcase script)

Player request via the owner, 2026-10-04: a pane that tracks MUME's
seasons, moon phases and time-bound events, inspired by Bladorfat's
community calendar. Built as a bundled showcase script on a new game
time API.

Intent Goal 10, spec §2.10 (Game time), ADR 0074. Research:
`notes/research/almanac-events.md`. Mock-up:
https://claude.ai/artifact/QNeJcxY9hUzGoKkAQtrKkY

## Owner decisions

- 2026-10-04: **variant B**, one almanac pane with the tabs NOW, PLAN
  and LORE. The one-row status strip is not built.
- 2026-10-04: it is a **showcase script**, not a built-in pane.
- 2026-10-04: **order**: first make the built-in clock as good as
  possible, then the API, then the script.
- 2026-10-04: **events are data.** People will want to add events, so
  adding one must be easy and must not need code.
- 2026-10-04: the bundled event list is a **first draft**. What belongs
  in it, and additions from other sources, are reviewed later.

## Plan

### A. Clock (`src/gmcp/clock.ts` and a new pure module beside it)

- Audit the existing sync paths against real logs (`~/Downloads/mume-*.html`,
  `/home/ole/MUME` session logs, read-only). Fix what is found.
- Add the season and time-of-day model.
- Add the moon model (ADR 0074 §1): level, phase, waxing, position,
  visibility, moonrise and moonset. Unit tests use known moments, for
  example a GMCP `Event.Moon` seen in a log at a known game time.
- Compare GMCP `Event.Moon` with the prediction and keep the result in
  the clock diagnostics. Decide from the logs whether moon events can
  sync minutes.

### B. Lua API (ADR 0074 §2)

- `gameTime([epoch])`, `gameTimeFind(cond, [from], [horizon])`,
  `sysGameTimeEvent`, and `localTime(epoch)` if needed.
- Script manual entries with examples, editor completion and hover.
- Unit tests for the solver: every `cond` key, windows that cross
  midnight, a season or a year, and nil beyond the horizon.
- Bench: the solver over a full horizon stays well under a frame.

### C. Almanac script (`src/scripts/bundled/almanac.lua`)

- NOW: the moon drawn with half blocks, the game date and time, the
  daylight band, the year band and COMING UP with countdowns and
  reminders.
- PLAN: real-date month grid with a season gradient, wheel and ◂ ▸ to
  change month, and day details (full moons, Dead Knight windows,
  season starts, Ingrove).
- LORE: the event list with conditions and places, plus a form to add
  an event.
- Data: `EVENTS` from `notes/research/almanac-events.md`. Player
  additions go in `store`. `almanac add`, `almanac export` and `almanac
  import` handle them.
- Help header (`@summary`, `@alias`, `@setting`) in the style of the
  other bundled scripts.

### D. Verify and release

- Typecheck, unit, e2e (enable almanac, switch tabs, add an event),
  bench.
- Release, then the owner tests.

## Tasks

- [x] ADR 0074, spec §2.10 addition, §5 row, stage file.
- [x] A1 clock audit against logs
- [x] A2 season and time-of-day model
- [x] A3 moon model and tests
- [x] A4 `Event.Moon` check
- [x] B1 `gameTime`, `localTime`
- [x] B2 `gameTimeFind` solver and tests
- [x] B3 `sysGameTimeEvent`
- [x] B4 manual, completion, hover
- [x] C1 almanac NOW tab
- [x] C2 PLAN tab
- [x] C3 LORE tab and the add form
- [x] C4 store, add, export and import
- [x] D1 verify: typecheck, unit, e2e, bench
- [ ] D1 release

## Open

- The bundled event list will be reviewed with the owner later.
- Juniper's season is unknown (Herbs.txt only says "certain yeartime").

## Build notes

**A1 audit** (Cockpit run logs 2026-09-25…29, WebCockpit replays
2026-09-28…10-03; no MSSP or room clocks logged). Cockpit's anchor
(`clock.state`, same year-0 origin as ours) fits every event:
- Weekdays were off by one. The three `time` lines (year 2854) fit Shire
  Reckoning: every year starts on Sterday, weekday = day of year mod 7.
  Fixed (`weekdayOf`).
- `Event.Sun light` comes an hour after dawn and `dark` an hour after
  dusk, on the hour (16 Wedmath: light 05:00, set 22:00, dark 23:00;
  Astron: dark 20:00). They are far more common than rise/set and now
  sync the minute. Inv §2.5 says light/dark are ignored; that row is out
  of date.
- Sun events arrive ~0.6 s into the second: the minute model holds.

**A3/A4 moon.** `src/gmcp/gametime.ts`, MMapper's model counted from
year 2850 (MMapper's origin; month and day 0-based, as our
`momentSeconds`). The one logged `Event.Moon set` (19 Wedmath 2855,
22:58) is predicted to the minute. One event is too few to sync from,
so `Event.Moon` only records `moonCheck` (`set +0`) in the clock state.
Rise, set and phase changes are closed forms, checked against
minute-stepping in the tests.

**B API** as ADR 0074 §2, plus `dawn`/`dusk` hours in `gameTime()`.
`weekday` is a name. `localTime` was needed (no `os`). `gameTimeFind`
returns `start, end`; with `at`, start = end; if cond holds at `from`,
start = from; a window is cut a game year after it starts; horizon at
most 5 game years. Hours are `{from, to}` or `{h1, h2}`, `to` not
included. `sysGameTimeEvent(kind)` runs on one timer while a handler
exists and the clock is at hour or minute precision. Bench (`lua-bench`):
a game year without a match ≈ 0.5 ms.

**C almanac** (`src/scripts/bundled/almanac.lua`). Every time comes from
the API; the mock's epoch is not used.
- Pane: own 50-column lane at the right edge (`lane = "own"`), so the
  mock's layout fits; dragged into a narrower dock it drops parts (moon
  10 cells, short daylight label, one cell an hour, no condition column,
  cut text gets …). Rows are put()s into a grid, flushed only when a
  row's writes changed; fixed parts are memoized. NOW redraws once a
  second while the pane is on (≈1.6 ms in Node), on `sysGameTimeEvent`
  and on clicks; nothing runs while it is off but a set reminder's one
  timer. `gameTimeFind` answers are kept until the next event or until
  their window passed; PLAN months until the next `sync`.
- Conditions as text (`parseWhen`): all words must hold; `|` or `or`
  joins choices of one kind; `not`/`no`/`except` before seasons; filler
  words skipped (`full moon in winter`). Kinds: seasons, months (both
  names), dawn/day/dusk/night, `daylight`, `dark`, `hours a-b` (`to` not
  included, across midnight), `hour 5`, phases and `waxing`/`waning`/
  `crescent`/`gibbous`/`quarter`, `moon up`/`moon down`, one moment
  (`sunrise`, `sunset`, `midnight`, `moonrise`, `moonset`, `season
  start`). Stored in canonical form; errors name the bad word.
- Export `ALM1:` + events joined by `~`, fields (name, when, place,
  note) by `^`; `= ^ ~ ; \ { } $ & % #` and control characters as `=XX`
  (the input line splits at `;` and expands `$`/`&`). Import adds names
  not in the list, reports added / already there / skipped.
- Reminders: a line in the game window and a UI message, `remind` real
  minutes before (no sound: the client has no sound API). Marker ♪ (⏰
  and ⛏ are not in DejaVu Sans Mono, our glyph fallback).
- PLAN Dead Knight: the real moonrises in the window, grouped per run
  (4–5 a window in this moon model), not the mock's phase window.
  Full moon (level 12) lasts ≈30 real minutes in MMapper's model.
- Data: 16 events with a condition, 4 lore-only rows (Juniper, Moon
  pool, glowing stone, cold-proof shoes). Spirit Knight is `hours 0-3
  not winter` (mock; Faine says midnight); West Gate and Hrivesur are
  `moon up night`; Sundeath is `dawn|day`.
- Lost clicks: script pane links fired on the DOM `click`, which the
  browser drops when the row under the press is rebuilt before the
  release (the almanac's per-second redraw: about one click a minute).
  Links now fire on a primary pointerdown + pointerup on the same link
  (row, column, length); a pane move cancels the press; the input line
  and the cockpit no longer take the focus back on that mouseup from a
  script field the link just focused.

## Test guide

Enable the script: Options → Scripts → almanac `[X]`, or type
`#script enable almanac`. Enter MUME and type `time` (or wait for the
next sunrise or sunset) so the clock knows the hour. The Almanac pane
opens in its own column at the right edge; `almanac` hides and shows it.

1. **NOW:** check the moon picture, date, time and day/night against
   the game, the hour marker on the daylight band, and the countdowns in
   COMING UP. Click an event to set a reminder (♪); with
   `#script set almanac remind 1` it comes one minute before.
2. **PLAN:** browse months with ◂ ▸ or the wheel, click a day: do the
   season line, full moons and Dead Knight times look useful for
   planning a session?
3. **LORE:** point at names for notes and sources. `[+ add]` an event
   of your own, e.g. *When* `winter full` or `moonrise waxing|full`; try
   a wrong word and read the message. Then `almanac export`, copy the
   line, `almanac remove <name>` and `almanac import <line>`.
4. Drag the pane into the normal right column: is the narrow version
   acceptable, or should the default be different?

Feedback wanted: the look against the mock-up; whether the default place
(own 50-column lane) is right; reminders without sound; and the event
list itself: it is a **first draft** (see Build notes for the guesses),
so say what is missing, wrong or not worth listing.

## Owner feedback

### Round 1 (2026-10-04)

- Show time as MUME time, not real seconds and minutes. The ticking
  seconds are distracting. Updating once per real minute (one game hour)
  is enough.
- Asked where `add` saves data. Answer: in the script's `store` (browser
  storage for the script), not in the code. It survives releases and is
  part of the scripts backup; `almanac export`/`import` moves it.
- Adding an event must not need any syntax. Wanted: a pop-up with
  choices for seasons, times of day, moon and so on, easy to understand,
  plus a choice of icons.
- Sundeath does not need to be in the list.

Tasks from round 1:

- [ ] R1.1 game-time countdowns, redraw once per game hour (no 1 s timer)
- [ ] R1.2 pop-up event editor with choices and an icon picker (no syntax)
- [ ] R1.3 remove Sundeath
