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
- [ ] A1 clock audit against logs
- [ ] A2 season and time-of-day model
- [ ] A3 moon model and tests
- [ ] A4 `Event.Moon` check
- [ ] B1 `gameTime`, `localTime`
- [ ] B2 `gameTimeFind` solver and tests
- [ ] B3 `sysGameTimeEvent`
- [ ] B4 manual, completion, hover
- [ ] C1 almanac NOW tab
- [ ] C2 PLAN tab
- [ ] C3 LORE tab and the add form
- [ ] C4 store, add, export and import
- [ ] D1 verify, release

## Open

- The bundled event list will be reviewed with the owner later.
- Juniper's season is unknown (Herbs.txt only says "certain yeartime").

## Build notes

## Test guide

## Owner feedback
