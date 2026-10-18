# 0093 — Sunrise and sunset are timed by the clock

- Status: Accepted
- Date: 2026-10-18
- Builds on ADR 0091 (weather effects trial; "Sky timing", owner
  feedback 29), ADR 0074 (game time)

## Context

Live play after 0.1.63 (stage 28 items 59–61). MUME sends four `Event.Sun`
events a day, and rooms follow the second of each pair:

| hour | event | game text | rooms |
| --- | --- | --- | --- |
| dawn | `rise` | "The light slowly increases in the east." | still dark |
| dawn + 1 | `light` | "The day has begun." | lit |
| dusk | `set` | "The sun slowly disappears in the west." | still lit (prompt `*`) |
| dusk + 1 | `dark` | "The night has begun." | dark (prompt `o`) |

(Logs `mume-Gittan-2026-10-18T18-01-53` for the morning, Cockpit
`Rasta/2026-09-25T22-03-02` for the evening.) WebCockpit counted the day
from dawn to dusk, so the clock strip showed the sun and the moon a game
hour (a real minute) early, and the weather sky turned an hour early: the
day sky was complete 25–30 s before the day began. The sunrise and sunset
moments ran only on `rise` and `set`, which often do not arrive, so there
was often no sunrise at all.

The owner wants, for both: the sunrise (sunset) starts exactly 60 s (one
game hour) before the day (night) begins and ends at that second; very
faint for the first 40 s, building over the last 20; the old sky turns
into the new one somewhere in that minute, the new one stronger at the
turn's second and complete within 10–20 s after; smooth, no steps.

## Decision

**Day = dawn + 1 ≤ hour < dusk + 1** (clock.ts `isDay`, `dayHour`,
`nightHour`). The strip's countdown (`nextTransition`) counts to dawn + 1:00
at night and to dusk + 1:00 by day. The almanac and `sunU` (0 when the day
begins, 1 when the night begins) agree. gametime.ts `periodOf` keeps its
four periods (the dawn hour, day, the dusk hour, night); `isDay` is `day`
or `dusk`, and the script manual says the dawn hour is dark and the dusk
hour lit. `rise` and `set` no longer change the clock; `light` and `dark`
do.

**The clock times both turns.** At minute precision the signal bridge sends
`WeatherState.dayAt` and `nightAt`: the unix ms of the second the current
day (night) began or the next one begins (clock.ts `dayBeginsAt`,
`nightBeginsAt`; -1 below minute precision). They change only on a clock
sync, at nightfall or at daybreak, so nothing runs per frame on the main
thread. In the worker the director keeps one turn, `{ kind: rise | set,
s, base }`, `s` in seconds relative to the turn's second, against
`Date.now()`:

- a turn starts when the clock's time lies in -60 … +14 s (a page load or a
  sync mid-turn joins at its place, the mix with it); starting one ends one
  of the other kind;
- it advances with the frame time (× the demo's speed) and glides toward
  the clock's time (tau 2 s), so a resync of a few seconds never jumps; a
  correction over 15 s snaps, but never back over the turn's second;
- from 0 the settled clock is the new one (the almanac's own change, up to
  its 30 s re-read later, is then a no-op); it ends 60 s after;
- without minute precision `Event.Sun rise` / `set` starts it at -60 and it
  runs on its own (the clock syncs to the minute on those events, so the
  clock usually takes over at once); an event while one of its kind runs
  is ignored; `light` / `dark` without a turn fade over 12 s (SKY_RATE);
- never two in one dawn or dusk: no turn of a kind starts within 20 min
  (wall) after one of that kind reached its second; `jump` and a speed
  change (the demo) lift that.

While it runs the director sets the sky selection itself: the new sky's
share = max(its share when the turn started, `turnWeight`) (`sun` for a
sunrise, `1 − sun` for a sunset), the night part split between moon and
dark as the almanac's moon says. Gone: the event-driven sunset moment
(26 s from `set`) and the 11 s sky hold (SKY_HOLD_S); the sky's other
changes (a moon rising or setting, a turn without a sunrise or sunset)
keep SKY_RATE.

**Curves** (src/weather/sunturn.ts, the same for both; `s` = seconds
relative to the turn's second; sst = smoothstep):

| curve | formula | values |
| --- | --- | --- |
| intensity (sky tint, palette glow, day life held back) | (0.06 · sst(-60, -20, s) + 0.94 · sst(-20, -7, s)) · (1 − sst(-8, 0, s)) | ≤ 0.06 to -20 s (0.03 at -40), 0.48 at -14, peak ~0.99 at -7.5, 0.5 at -4, 0 at 0 |
| rays (rays, beams, glints; owner item 62) | max(intensity, (E · sst(-60, -57.5, s) + (L − E) · sst(-34, -26, s)) · (1 − sst(-8, 0, s))); sunrise E 0.2, L 0.3; sunset E 0.35, L 0.5 | the floor E from -57.5 s (faded in over 2.5 s), L from -26 s, then the intensity from ~-15 s; 0 at 0 |
| palette (cloud palette → RISE_K / SET_K) | sst(-50, -14, s) · (1 − sst(-7, 0, s)) | 0.19 at -40, 1 from -14 to -7, 0 at 0 |
| progress (RISE_C / SET_C colours, sun path, ray front) | ((s + 60) / 60)^5 | 0.004 at -40, 0.13 at -20, 0.51 at -7.5, 1 at 0 |
| weight (the new sky's share) | sst(-28, 14, s) | 0 to -28, 0.1 at -20, 0.74 at 0, 1 at +14 |

The progress curve puts the old moments' strong middle (p ≈ 0.15–0.6:
orange to pale gold at sunrise, gold to crimson at sunset) under the
intensity's peak. The look (RISE_K / SET_K, RISE_C / SET_C, rays, beams,
glints, the sky tint) is unchanged, only re-timed. The rays' floor (owner
item 62: "the first 30 seconds were rather dead") was set by eye from
headless screenshots on the dark background at -58 … -20 s: vague but
visible from the start, a little more from -30 s. A sunset's rays are drawn
at about half a sunrise's strength (0.62 against 1.25) and over the day
sky, so its floor is higher. The floor feeds only the rays, beams and their
glints; the tint, palette, glow and day life keep the intensity. While a turn's visuals
are on the sky asks for FPS_FAST, so the faint part creeps in steps of
< 0.0001 per frame (< 0.001 even at FPS_STILL).

**Demo.** The Sunrise and Sunset steps send `sun.rise` / `sun.set` with
`{ from: -30 }`: the last half minute (10 s at the demo's speed 3, 30 s
`slow`); the next step pins the day (night). The first pin sets `dayAt` and
`nightAt` to -1, so the game's clock does not start a turn of its own; the
release at the end gives the game's back. 1:38 in all.

## Consequences

- The strip, the scripts' periods and the weather agree on when the day
  and the night begin.
- A sunrise and a sunset are seen every game day outdoors with a synced
  clock, whether or not `rise` / `set` arrive; indoors the timing runs and
  the sky stays hidden, so going out mid-turn shows the right moment.
- A turn costs ~75 s of FPS_FAST (the old moments 24 and 26 s).
- Dev: `__weather.jump({ weather: ' ', clock: 'night', dayAt: Date.now() +
  65_000 })` plays a sunrise, `__weather.jump({ weather: ' ', clock: 'day',
  nightAt: Date.now() + 65_000 })` a sunset (then `__weather.unpin()`).
