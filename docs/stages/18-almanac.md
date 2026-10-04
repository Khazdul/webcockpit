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
- [ ] C1 almanac NOW tab
- [ ] C2 PLAN tab
- [ ] C3 LORE tab and the add form
- [ ] C4 store, add, export and import
- [ ] D1 verify, release

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

## Test guide

## Owner feedback
