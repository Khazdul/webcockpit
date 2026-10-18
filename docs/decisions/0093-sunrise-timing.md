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
- it advances with the frame time (× the dev time scale) and glides toward
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
  change lift that, and the demo's turns never count.

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
`{ from: -25 }`: the last 25 s at the game's own pace (owner item 70; the
demo has no speed-up any more); the next step pins the day (night). The
first pin sets `dayAt`, `nightAt`, `moonRiseAt` and `moonSetAt` to -1, so
the game's clock does not start a turn or a moon of its own; the release at
the end gives the game's back. A demo turn (`from` given) never holds back
the game's next one. 2:58 in all.

### One sun (owner items 64–68)

After a live sunset the owner asked for: no day glimpses during a turn
(64); the glimpses' rays following the sun through the day (65); a sunset
that starts at most ~45° up (66); a sunrise from the horizon straight from
the right, climbing to where the day's glimpses then come from (67); the
strong beams and the thin rays coming from one sun, and every ray glinting
where it crosses a frame line (68).

- **One model** (beams.ts): the sun stands at an angle `psi` on a circle
  round the point (W/2, 0.45 H), radius 1.05 · its distance to the corner,
  so it is always outside the screen: 0 at the horizon to the right, π/2
  straight above, π at the horizon to the left. Its light reaches that
  point at `psi` from the horizontal. `sunPsi('rise', p)` climbs from 0 to
  40° (smoothstep of the turn's progress, so it stays low through the faint
  part); `sunPsi('day', sunU)` goes on from 40° to 140°; `sunPsi('set', p)`
  sinks from 140° (40° up) to 180°. Each ends where the next begins.
- **Glimpses** use the same sun at the day's `sunU`, eased (tau 8 s; it
  comes in SUN_U_STEP steps; unknown counts as 0.3), fanned round the
  direction to that point; their glow sits where that line crosses the
  screen's edge, their glints come from `beamHits` (any side).
- **One source.** The beams no longer aim at a point of their own that
  sweeps across: the bundle is laid round the sun's middle direction and
  moves only as the sun does; the thin rays and the beams share one slow
  sway (`sunDrift`, ±0.013 rad), each with a little of its own (±0.0015).
- **All rays glint.** Each thin ray's crossings (`beamHits`) glint at
  0.35 × its strength × the beams' strength factor; 8 rays and 3 beams
  over the framed panes per frame. Headless Chromium, a sunset with the
  default panes: the sky's worker frame 9.8 → 10.1 ms (software rendering;
  within run-to-run noise).
- **No glimpse in a turn** (`glimpseBlocked`, sunturn.ts): while a sunrise
  or sunset runs, and from GLIMPSE_LEAD_S (18 s, the longest glimpse is
  16 s) before the clock's turn begins, no glimpse starts; a running one
  fades out (tau 0.35 s).
- Dev: `__weather.jump({ weather: ' ', clock: 'day', sunU: 0.05 });
  __weather.emit('glimpse')`.

### The moonrise (owner item 63)

The game said "The moon rises in the east." (`Event.Moon rise`) but no moon
was seen in the minute after: the moon started at u = 0 at x0 = W + 2.4R,
fully off the right edge, and moved (W + 4.8R) / 720 px/s, so its edge
came in only 1.4R / v ≈ 25 s after the rise and its centre reached the edge
after ~44 s (1400 × 800: R 40, v 2.21 px/s), low (0.67 H, the "low down is
fainter" rule at 0.61) and behind the right dock. The almanac's own moonUp
can also come up to 30 s late (its re-read). The owner: keep the path, but
the moon must already be half inside the screen when the game says it
rises.

- **Clock.** At minute precision the bridge sends `WeatherState.moonRiseAt`:
  the unix ms of the next rise (gametime.ts `nextMoonEvent`; the current
  minute when it rises now; -1 below minute precision). It changes at a
  sync and after each rise.
- **Lead.** `moonLead(P, W, R) = (x0 − (W − 0.6 R)) / (x0 − x1)`: the
  share of the path at which the centre is 0.6 R inside the right edge
  (`MOON_RISE_IN`; about 80 % of the disc in). The game's u (0 at the
  rise, 1 at the set) maps onto the drawn path as `lead + (1 − lead) · u`,
  so the path (its shape and crossing) and the set's end are unchanged;
  the way in is the path's first `lead`, game u from −lead / (1 − lead) to
  0. The pace on the path is (1 − lead) of before (7.5 % slower at
  1400 × 800), the price of keeping the set where it was. At 1400 × 800:
  R 40, lead 0.0754, the way in starts 58.7 s before the rise (computed
  from W, H and R, so it holds for any window).
- **Worker.** While the moon is not up and `moonRiseAt` says the way in
  has begun (or the rise was under a minute ago, while the almanac or the
  event catches up), the moon is up at the clock's u; a page load or sync
  joins at its place (fading in), a resync glides (the existing tau 8 s
  correction). `Event.Moon rise` keeps a moon already on its way;
  without one (no clock to the minute) the moon starts at the path's
  start below the edge and glides briskly onto its way (the same
  correction, ~13 px/s at first), no pop.
- **Brightness.** On its way in the moon is at full strength (no "low down"
  fading) through the rise, and takes the low rule over the next tenth of
  its path. By day it stays DAY_MOON-faint.
- Dev: see "An even pace" below.

### An even pace (owner item 69)

A moon came in very fast, went to about the middle of the window and then
moved very slowly (log `mume-Gittan-2026-10-18T20-40-32`). The log has a
clock to the minute (`The current time is 4:33 pm.` 18:40:58; `Event.Sun
set` 18:41:24 at 17:00), `Event.Moon rise` 18:45:06, no input from 18:46 to
18:49:58, then `ti` (18:49:59, the date line: a clock sync, so the almanac
re-sent `moonU`, the moon "to the south", u ≈ 0.41). The moon's place was
integrated from the frame time: in a hidden tab the worker stops (and at
the still rate frames are capped at 0.25 s), so it lagged; the re-sent
`moonU` then glided out with tau 8 s, a rush across, and the normal pace
afterwards looked very slow.

- **The clock places it.** The bridge sends the rise and set of the moon's
  current time up (or the next, from 2 min after the set; `moonRiseAt`,
  `moonSetAt`, signals.ts `moonTimes`). The worker's u is `(now − rise) /
  (set − rise)` from `Date.now()` at every frame, so its pace is its real
  time up (~745 s, the model's hour angle stalls now and then) and no pause
  or frame rate can make it lag.
- **Symmetric path.** The game's u maps onto the drawn path as `lead +
  (1 − 2 lead) · u`: at the rise the centre is 0.6 R inside the right edge,
  at the set as far inside the left; it comes in before the rise and goes
  out after the set at the same pace (the path's first and last `lead`).
  The pace on screen is (1 − 2 lead) of the old one (0.85 at 1400 × 800),
  even all the time. The set event no longer hurries it off.
- **Corrections** (`moonGlide`): a resync changes its pace by at most half
  (0.5 … 1.5 ×); a correction the cap cannot take up in 20 s fades it out
  (tau 0.5 s) and in at its place. After a gap of over 2 s between frames
  (a hidden tab), on a page load or a sync it is placed at once, fading in.
- **Below minute precision** the place is integrated (from the real time
  between frames) from the almanac's `moonU`, with the same caps; `Event.Moon
  rise` without a moon fades it in at its rise place; it waits off the left
  edge for a late set event, which then takes it out at its pace.
- **Brightness** as for the rise: full strength through the set too.
- Dev: `r = Date.now() + 60_000; __weather.jump({ clock: 'night',
  moonRiseAt: r, moonSetAt: r + 745_000 })` (`Date.now() - 300_000` puts it
  mid-way).

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
