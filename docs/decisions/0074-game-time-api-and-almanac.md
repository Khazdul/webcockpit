# 0074 — Game time API, moon model and the almanac script

Status: accepted 2026-10-04 (stage 18)

## Context

A player asked for a pane that tracks MUME's seasons and moon phases,
inspired by a community calendar (Bladorfat's "MUME daylight & seasons",
which syncs over MSSP and uses MMapper's moon formula). The owner chose a
tabbed almanac (NOW / PLAN / LORE) built as a **showcase script**, not a
built-in pane. Order: make the built-in clock as good as possible, then
give scripts the game time API they need, then write the script.

Today `src/gmcp/clock.ts` syncs the date and hour (MSSP, GMCP
`Event.Sun`, `time` lines, room clocks) and knows dawn and dusk per
month. It has no seasons, no moon, and scripts cannot read it.

Research: `notes/research/almanac-events.md`.

## Decision

### 1. Moon and season model (pure TS, beside the clock)

- **Seasons:** Winter = Afteryule–Rethe, Spring = Astron–Forelithe,
  Summer = Afterlithe–Halimath, Autumn = Winterfilth–Foreyule.
- **Time of day:** dawn hour, day, dusk hour, night, with the existing
  `DAWN` / `DUSK` tables. `isDay` keeps its meaning.
- **Moon:** a function of absolute game time, so the clock's anchor
  fixes it and no separate moon sync is needed. This matches Faine's
  note that the phase "changes only when the calendar is restarted".
  - Synodic cycle 29 d 12 h 44 m game time.
  - Derived values: zenith minute of day, level 0–12 (0 new, 12 full),
    waxing or waning, eight named phases, position (east … west, below
    the horizon), visible / dim / bright, moonrise and moonset.
  - The model follows MMapper's published model (MMapper 26.06,
    `src/clock/mumemoment.cpp`). MMapper is GPL. We read it to learn the
    model and do not copy code; the source is credited in a comment.
- **Checks against the game:** GMCP `Event.Moon {what: rise|set}` is
  compared with the predicted moonrise and moonset. A mismatch is
  recorded in the clock's diagnostics. If the moon events prove
  reliable they may also lift precision to the minute, as `Event.Sun`
  does; the build decides from real logs.

### 2. Lua game time API

The API is read-only and costs nothing while unused.

- `gameTime([epoch])` → table, or nil while the clock is unset.
  - Fields: `year`, `month` (1–12), `monthName`, `sindarin`, `day`
    (1–30), `hour`, `minute`, `weekday`, `season`, `period` (`dawn`,
    `day`, `dusk`, `night`), `precision`, `epoch`.
  - `moon`: `phase`, `level`, `waxing`, `visible`, `bright`, `position`.
  - `epoch` (real unix seconds) may be any time, past or future. This
    is the planner's need: "what is the game time on Saturday at 20:00?"
- `gameTimeFind(cond, [from], [horizon])` → `startEpoch, endEpoch` of
  the next window where `cond` holds, or nil.
  - `cond` is data: `season`, `notSeason`, `month`, `hours = {from,
    to}`, `period`, `moon` (phase name or list), `moonVisible`, and `at`
    (`dawn`, `dusk`, `midnight`, `moonrise`, `moonset`, `seasonStart`).
  - The solver runs in TS and steps game hours, refining to minutes
    for `at` moments. The default horizon is one game year (6 real
    days).
  - A new almanac event therefore needs a data row, not code.
- `sysGameTimeEvent` (event): fired with a kind (`sync`, `hour`,
  `dawn`, `dusk`, `moonrise`, `moonset`, `phase`, `season`) so panes
  redraw on change instead of polling.
- If the sandbox lacks a local wall-clock formatter, add
  `localTime(epoch)` → `{year, month, day, hour, min, sec, wday}` in the
  browser's time zone. The planner needs it for real dates.

### 3. The almanac script (`src/scripts/bundled/almanac.lua`)

- **Pane:** tabs NOW, PLAN and LORE, after the approved mock-up
  (https://claude.ai/artifact/QNeJcxY9hUzGoKkAQtrKkY).
- **Events are data.** A table `EVENTS` at the top of the file holds the
  bundled rows. Each row has `name`, `icon`, `color`, `where`, `when`
  (a `gameTimeFind` condition), `note` and `source`.
- **Players can add events without editing code:**
  - with a form on the LORE tab and the alias `almanac add`;
  - the additions are kept in the script's `store`;
  - `almanac export` and `almanac import` move them as one line of
    text, for sharing on Discord. Good additions can move into the
    bundled list in a later release.
- Reminders are opt-in per event: a bell and an echo a set time before.

## Consequences

- The clock grows a moon and season model that the input strip or the
  map can also use later.
- The script API gains its first game-domain functions. They are
  documented in the script manual with examples.
- The bundled event list is a first draft. The owner expects to review
  later what belongs in it and to add rows from other sources.
