# 0093 — The sunrise is timed by the clock

- Status: Accepted
- Date: 2026-10-18
- Builds on ADR 0091 (weather effects trial; "Sky timing", owner
  feedback 29), ADR 0074 (game time)

## Context

Live play after 0.1.63 (stage 28 items 59–60, log
`mume-Gittan-2026-10-18T18-01-53`): at the dawn hour MUME says "The light
slowly increases in the east." (`Event.Sun rise`) and rooms are still dark;
"The day has begun." (`light`) comes an hour later and rooms are lit from
then. WebCockpit counted the day from the dawn hour, so the clock strip
showed the sun a game hour (a real minute) early, and the almanac turned the
weather sky to day at the dawn hour: the day sky was complete 25–30 s before
the day began. The sunrise moment ran only on `Event.Sun rise`, which often
does not arrive, so there was no sunrise at all.

The owner wants: the sunrise starts exactly 60 s (one game hour) before the
day begins and ends at the day's first second; very faint for the first
40 s, building over the last 20; the night sky turns into the day sky
somewhere in that minute, the day sky stronger than the night at the day's
first second and complete within 10–20 s after; smooth, no steps.

## Decision

**Day = dawn + 1 ≤ hour < dusk** (clock.ts `isDay`, `dayHour`). The strip's
countdown (`nextTransition`) counts to dawn + 1:00 at night; the almanac,
`sunU` (0 when the day begins) and gametime.ts `periodOf` ('day' was
already dawn < h < dusk) agree. Night still begins at the dusk hour
(`set`), as before. `Event.Sun rise` no longer makes it day; `light` does.

**The clock times the sunrise.** At minute precision the signal bridge
sends `WeatherState.dayAt`: the unix ms of the second the current day began
or the next one begins (clock.ts `dayBeginsAt`; -1 below minute precision).
It changes only on a clock sync or at nightfall, so it costs nothing per
frame on the main thread. In the worker the director keeps the rise clock
`riseS`, seconds relative to that second, against `Date.now()`:

- it starts when the clock's time lies in -60 … +14 s (a page load or a
  sync mid-rise joins at its place, the mix with it);
- it advances with the frame time (× the demo's speed) and glides toward
  the clock's time (tau 2 s), so a resync of a few seconds never jumps; a
  correction over 15 s snaps, but never back over the day's start;
- from 0 the settled clock is day (the almanac's own change, up to its 30 s
  re-read later, is then a no-op); it ends 60 s into the day;
- without minute precision `Event.Sun rise` starts it at -60 and it runs on
  its own (the clock syncs to the minute on that event, so `dayAt` usually
  takes over at once); a rise event while one runs is ignored; `light`
  without a rise fades to day at SKY_RATE (12 s) without the hold;
- never two in one dawn: none starts within 20 min (wall) after one reached
  the day; `jump` and a speed change (the demo) lift that.

While it runs, the director sets the sky selection itself: `sun` =
max(the share when it started, `riseDayWeight`), the rest split between
moon and dark as the night was. The hold (SKY_HOLD_S) now applies only to a
change to night, so the sunset is unchanged.

**Curves** (src/weather/sunrise.ts, `s` = seconds relative to the day's
first second; sst = smoothstep):

| curve | formula | values |
| --- | --- | --- |
| intensity (rays, beams, glints, tint) | (0.06 · sst(-60, -20, s) + 0.94 · sst(-20, -7, s)) · (1 − sst(-8, 0, s)) | ≤ 0.06 to -20 s (0.03 at -40), 0.48 at -14, peak ~0.99 at -7.5, 0.5 at -4, 0 at 0 |
| palette (cloud palette → RISE_K) | sst(-50, -14, s) · (1 − sst(-7, 0, s)) | 0.19 at -40, 1 from -14 to -7, 0 at 0 |
| progress (RISE_C colours, sun path, ray front) | ((s + 60) / 60)^2.5 | 0.06 at -40, 0.36 at -20, 1 at 0 |
| day weight (day sky share) | sst(-28, 14, s) | 0 to -28, 0.1 at -20, 0.74 at 0, 1 at +14 |

The sunrise look (RISE_K, RISE_C, rays, beams, glints) is unchanged, only
re-timed; the sunset moment (26 s from `Event.Sun set`) is unchanged. While
the rise is on the sky asks for FPS_FAST, so the 40 s faint part creeps in
steps of < 0.0001 per frame (< 0.001 even at FPS_STILL).

**Demo.** The 'Sunrise' step sends `sun.rise` with `{ from: -30 }`: the
last half minute (10 s at the demo's speed 3, 30 s `slow`); the next step
pins the day. The first pin sets `dayAt: -1` so the game's clock cannot
start a rise of its own during the demo.

## Consequences

- The strip, the scripts' `period` and the weather agree on when the day
  begins.
- A sunrise is seen every game dawn outdoors with a synced clock, whether or
  not `Event.Sun rise` arrives; indoors the timing runs and the sky stays
  hidden, so going out mid-rise shows the right moment.
- The rise costs ~75 s of FPS_FAST per game day (the old moment 24 s).
- Dev: `__weather.jump({ weather: ' ', clock: 'night', dayAt: Date.now() +
  65_000 })` plays one (then `__weather.unpin()`).
