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

- a turn starts when the clock's time lies in -60 … FULL_S (+18 s; a page load or a
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
relative to the turn's second; sst = smoothstep, lin = clamped linear;
revised for owner items 71–72, see "Steady turns" below):

| curve | formula | values |
| --- | --- | --- |
| weight (the new sky's share) | sst(-32, 18, s) | 0 to -32, 0.15 at -20, 0.70 at 0, 1 at +18 (FULL_S) |
| fade (the rays) | 1 − lin(-10, 18, s)^1.2 | 1 to -10 (the new sky perceptible, its share 0.4), 0.64 at 0, 0.33 at +10, 0 at +18 |
| rays (rays, beams, glints) | sst(-60, -57.5, s) · (E + (1 − E) · lin(-60, -3, s)) · fade; sunrise E 0.6 (item 75), sunset E 0.5 | 0.5 at -55 (sunset), 0.74 at -30, peak 0.93 at -10, 0.71 at 0, 0.33 at +10, 0 at +18 |
| rays on / beams on | three rays from the start, the other five from -54 s, 6 s apart (each over 8 s); the beams from -42, -34, -26 s (each over 10 s) | 3 → 8 rays by -20 s, 0 → 3 beams by -16 s |
| intensity (sky tint, glow, day life held back) | lin(-60, -3, s)^1.3 · fade | 0.10 at -50, 0.43 at -30, 0.84 at -10, 0.71 at 0, 0 at +18 |
| palette (cloud palette → RISE_K / SET_K) | lin(-55, -5, s) · fade | rising to 1 at -5, 0 at +18 |
| progress (RISE_C / SET_C colours, the sun's angle) | lin(-60, 18, s) | even over the whole turn |

The look (RISE_K / SET_K, RISE_C / SET_C, rays, beams, glints, the sky
tint) is unchanged, only re-timed. The early ray strength was set by eye
from headless screenshots on the dark background (owner items 62, 71: a few
rays, vague but visible, from the first seconds); a sunset's rays are drawn
at about half a sunrise's strength (0.62 against 1.25) and over the day
sky, so its E is higher. While a turn's visuals are on the sky asks for
FPS_FAST (no step over 0.005 per frame at 30 fps).

**Demo.** The Sunrise and Sunset steps send `sun.rise` / `sun.set` with
`{ from: -25 }`: the last 25 s at the game's own pace (owner item 70; the
demo has no speed-up any more); the next step pins the day (night). The
first pin sets `dayAt`, `nightAt`, `moonRiseAt` and `moonSetAt` to -1, so
the game's clock does not start a turn or a moon of its own; the release at
the end gives the game's back. A demo turn (`from` given) never holds back
the game's next one. 2:58 in all.

`#weather demo sunrise` / `#weather demo sunset` (owner item 74) play one
whole turn exactly as live: a clear moonless night (a clear day) for 5 s
with `dayAt` (`nightAt`) pinned 65 s ahead, so the director runs the
clock's turn (the full minute, then on until the new sky is complete at
FULL_S), a little of the new day (night: the pulse; a shooting star), then
the release; 1:36 / 1:34. The caption counts to and from the turn's second
("the day begins in 0:42", "the day began 0:07 ago"), once a second. Such a
turn counts for the once-a-dawn guard, so the release lifts it
(`setSpeed(1)`); and a turn whose clock time the clock no longer gives (the
game's own `dayAt` back after the release) ends once its sky is complete
instead of LATE_S after its second, so nothing of the demo stays behind.

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
  40° (linear in the turn's progress since items 71–72); `sunPsi('day', sunU)` goes on from 40° to 140°; `sunPsi('set', p)`
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

### Steady turns and a gentle pulse (owner items 71–73)

After a live sunrise and sunset with the build of items 64–70: the first
5–10 s were good (a few rays from the right angle), then very little for a
long time and very much in a few seconds, a jerk; the rays died too fast;
the sunset seemed to end with the sun at the middle of the left side; the
day sky's glimpses came and went with long pauses.

- **Even build-up.** The intensity's steep peak (sst(-20, -7) then gone by
  0) and the colours' u^5 are replaced by the curves above: the strength
  rises linearly from the kind's early value to its peak (-10 … -3 s),
  more rays and then the beams fade in one by one, and the colours and the
  sun's angle (`sunPsi` is linear in the progress now, no smoothstep) move
  at one pace over the whole turn. Per second the rays change by at most
  0.043.
- **Slow fade, gone when the new sky is complete.** The rays, the tint and
  the palette fade from -10 s (the new sky's share 0.4) to FULL_S = 18 s
  (was 14), when it is complete; the turn's visuals run until then.
- **The sunset ends low at the left** (item 72; its end point changed by
  item 75, below): it starts at 40° up as before, continuous with the
  day's path.
- **Fan fix.** For a sun beyond the right edge the rays' fan was laid
  between the corners' angles across ±π, so most rays pointed away from the
  screen (the dead first seconds of a sunrise); the corners are now taken
  round the sun's middle direction.
- **The day sky's rays pulse** (daylife.ts `pulseStrength`): one continuous
  pulse, sin² of its phase, about every 20 s (±15 % from one to the next),
  between nothing and 0.14 (morning, evening) … 0.30 (midday) of the old
  glimpse's strength; no glints. Held back during a turn as before (fades
  out with tau 0.35 s, back over 4 s). It asks for no frame rate of its
  own: at FPS_STILL it changes by under 0.01 alpha per frame; a clear day
  sky with it ran at 3 frames per second (60 frames in 20 s, headless
  Chromium). The `glimpse` event (dev, demo) brings its peak in ~2 s.

### One horizon above the input line (owner item 75)

Item 72's sunset ended with the sun below the bottom-left corner, and its
last rays crossed the input line, where one types. The owner: the horizon
the sun sets below should be about 30–40 % up from the bottom, as for the
sunrise; the day sky stops being visible about 20–25 % from the bottom
anyway.

- One turn horizon for both (beams.ts `SUN_TURN_HORIZON` 0.65 H, a third up
  from the bottom): through a sunrise the sun's circle moves from it to the
  day's middle (0.45 H) as the sun climbs to 40°, through a sunset back;
  the circle's radius is set for the lower middle, so the sun stays outside
  the screen. `SUN_SET_LOW` is gone.
- The rays aim level with a sun at that horizon (`sunMid` aims at its
  height, between 0.45 H and 0.65 H), so a sunrise starts and a sunset ends
  with light coming in level from the right / left, above the input line;
  the ray fan's lower edge aims at 0.78 H instead of the bottom corners.
- A sunrise's first rays, level from the right, pass behind the right
  dock's panes and their shadows, so its early strength E is 0.6 (was 0.45;
  by eye from screenshots of `#weather demo sunrise`).

### Sky order and calm rays (owner items 76–79)

After `#weather demo sunrise` / `sunset` with items 71–75: a sunset's blue
lasted too long, but its stars came while rays and a sun above the horizon
were still clearly there (76); a sunrise's hazy glow came in its first 3 s,
its stars and blue were in the wrong order, and it was not over when the
day began (77); the rays looked like moving spotlights, bunched, mostly
pointing up, their glints on the frame lines faint (78); some rays moved
very fast (79). This replaces the curve table above where they differ.

- **The sun's part ends at the turn's second for both.** Rays, beams,
  glints, glow, tint and warm palette are over at 0 (`turnOn` is -60 … 0);
  the colours and the sun's path run over -60 … 0 (`turnProgress`), so a
  sunset's sun reaches the horizon as its last rays go. What comes after
  differs: a sunrise's day sky is complete at 0 (`TURN_FULL.rise` 0), a
  sunset's stars come out over the 14 s after (`TURN_FULL.set` 14,
  `FULL_S` 14; was 18 for both). The director's join window and the end of
  a released demo turn use FULL_S.
- **Sky colours and stars apart.** The sky's colour share (`turnWeight`,
  per kind) and the stars (`turnStars`, a factor on the night part's stars
  only; the moon is left as the almanac has it) are separate:

| curve | sunrise | sunset |
| --- | --- | --- |
| weight (new sky's colours) | sst(-30, 0): the blue over the last 30 s | sst(-50, 0): the blue fades from 10 s in, into the dusk (the night colour under the warm tint) |
| stars | 1 at -60, 0.5 at -50, 0.24 at -40, 0.1 at -30, 0.04 at -18, 0 at -6 (linear between) | 0 until -5 (the rays then under 0.1 and falling), sst(-5, 14) |
| glow (the sun's haze, its own curve now) | 0 at -60 → 0.6 at -35 → 1 at -14 (in 25 s what used to come in 3), fading -14 … 0 | 0 → 0.6 at -52 → 1 at -24, fading with the rays |
| rays | sst(-60, -57.5) · (E + (1 − E) · lin(-60, -24)) · (1 − lin(-24, 0))^1.5 | the same: 0.35 at -12, 0.1 at -5, 0 at 0 |
| intensity, palette | lin(-60, -14)^1.3, lin(-55, -14); both · (1 − lin(-14, 0))^1.3 | the same |
| beams on | from -48, -42, -36 s (each over 10 s) | the same |

- **Gliding onto the curve** (director `TURN_JOIN_RATE` 0.1/s): a turn
  started mid-way by an event (the demo's `from`) moves the sky to its
  curve at that rate instead of jumping (a sunset from -30 starts with its
  blue a third gone); joining at once (page load, sync, `jump`) still sets it.
- **Calm rays: the fan no longer aims at the corners** (beams.ts `turnFan`).
  The cause of 79: the fan's edges were the screen's four corners as seen
  from the sun, and the sun's path passes close by the top-right (top-left)
  corner, so that corner's angle swung by up to ~160° within seconds and
  every ray, laid evenly across the fan, swung with it: up to 4.4–6.5°/s
  (1400 × 800 … 2560 × 1100). Now the lower edge aims at the floor
  (FAN_FLOOR 0.78 H) 45 % in from the far side, the upper edge is 2° above
  the horizontal under a sun low at the turn horizon and 12° as it climbs,
  but never above the far top corner; both points lie on the far side,
  never near the sun. The beams are laid at 0.25, 0.5 and 0.75 of the same
  fan (between the thin rays; they were bunched within ±0.06 rad of its
  middle) and the rays at their even places ± 0.1 of a place (was ± 0.35).
  Every ray and beam now moves at under 0.84°/s at any window size (unit
  test bound 1°/s): the sun's own climb and the shared sway.
- **Sideways and down.** The first rays of a sunrise (and the last of a
  sunset) span about 6° down to 2° up, most of them level or down; from
  about a third in, one or two point up toward the far top corner.
- **Subtle rays, clear glints.** Thin rays drawn at 0.085 (was 0.2), the
  beams' layers at about a third (0.022 / 0.05 / 0.065, the glow layer 2.2
  half-widths); a sunset's rays at 0.75 of a sunrise's (was 0.62, so they
  still show over the dusk). A thin ray's glint is now by the square root
  of its strength × 1.1 (was linear × 0.35), as a soft glow and a brighter
  core like a beam's, at least 36 px long. By eye from headless screenshots
  of both demos every 5 s.
- **Cost.** A sunset's sky colours now move from -50 s instead of -32, so
  the sky's cached gradient is redrawn for those 18 s too: headless
  Chromium (software), worker frame average over the last 600 frames at
  -30 s 1.6 → 4.5 ms, p95 6.2 → 6.8 ms; at -15 s 3.6 → 4.1 ms. A turn's
  fast rate ends at 0 (a sunset's stars then fade in at the sky's own
  rate). `node bench/weather-bench.ts --rounds 2` (no turn in its scene):
  in line with bench/results/weather.md.
- **Demo.** The main demo's sunrise and sunset show their last 30 s
  (DEMO_TURN_FROM -30, was -25); "The day begins" is 6 s (the sky is
  complete then); the sunset step's shooting star is gone (no stars yet);
  2:56 in all.
  `#weather demo sunrise` 1:20 (the day step 12 s), `#weather demo sunset`
  1:30 (the night step 14 s, the stars filling in); captions follow the
  new order.

### Tiered rays and a wider fan (owner items 80–82)

After items 76–79: a sunrise's rays were bunched in one span to the left
and down-left, none pointing down, three much stronger beams side by side,
a few rays visible from the start, the glints marked from the first
seconds (80); a sunset's fan was too narrow, its stars came only at -5 s
and were complete 14 s into the night, and its frame glints stayed while
its rays faded (81); the day sky's pulsing rays were too strong, bunched
round one direction and as strong low on the screen as high (82). The
owner's screenshots `docs/stages/img/28-item80-sunrise-rays.png`,
`28-item81-sunset-rays.png`, `28-item82-day-rays.png` show the wanted
directions. This replaces the sections above where they differ.

- **One tiered fan for both turns** (beams.ts `SLOTS` 'wmwSwmwSwmwSwmw'):
  15 even places from the fan's lower edge, three beams (S, a little
  stronger) at places 3, 7 and 11 (a quarter, the middle, three quarters),
  four middle rays (m, 1) and eight weak ones (w, 0.4) between, so no two
  of a tier are side by side. Thin rays 12 (`TURN_RAY_N`, was 8), beams 3
  (strengths 0.9 / 1 / 0.9, was 0.62 / 1 / 0.76). The rays' widths by tier
  (no more random alpha 0.21–1).
- **Down to the bottom edge.** The fan's lower edge aims at the bottom edge
  10 % in from the sun's side (`FAN_FLOOR` 1, `FAN_FLOOR_X` 0.1; was 0.78 H,
  45 % in from the far side, item 75 overridden by the owner), but as the
  angle seen from the sun where the turn starts and where it ends, linear in
  between: aimed at the point all the way, it swung at up to 1.4°/s while
  the low sun was near it. The upper edge is as before. Below horizontal at
  2000 × 1150 (sunrise; a sunset the mirror, end to start):

| s | lower edge | upper edge | span |
| --- | --- | --- | --- |
| -59 | 39° down | 2° up | 41° |
| -45 | 49° down | 4° up | 53° |
| -30 | 60° down | 5° up | 65° |
| -15 | 71° down | 3° down | 68° |
| -1 | 81° down | 9° down | 72° |

  (1280 × 720 … 2560 × 1100 within 2°; 900 × 1000 to 75°.) Every ray and
  beam moves at under 0.82°/s at the six tested window sizes (unit bound
  1°/s).
- **A sunrise's rays come with its glow** (`turnRays`): 0 at -60, 0.6 at
  -35 as the glow, 1 at -24 (was 0.6 from the first seconds); all rays and
  beams together (`turnRayOn` / `turnBeamOn` take the kind). A sunset keeps
  its few rays from the start (`SET_RAYS_EARLY` 0.5) and the rest one by
  one (the nine others from -54 s, 2.5 s apart; beams from -48 s).
- **Glints by tier and with the rays** (`turnGlint`): every glint's strength
  is `turnRays^1.5` (a sunrise's also · sst(-60, -42): faint for the first
  10–20 s), × the tier (`TIER_GLINT` S 1, m 0.6, w 0.3), core at most 0.95
  (`GLINT_CORE`). Before, a beam's glint was drawn at 1.3 and a ray's at 1.1
  and clipped at 1, so the first third of the rays' fade did not show in
  them; and a faint ray's glint went by the square root of its strength
  (item 78). The power 1.5: a glint is bright on its line, so it must fall
  a little faster than the faint ray to look as if it fades in step.
- **A sunset's stars from -7 s, complete at 0** (`SET_STARS_S`,
  `turnStars`; was -5 … +14). `TURN_FULL.set` and `FULL_S` are 0: every
  part of both turns is complete at the turn's second, so the director's
  sky curve and a released demo turn end there. A page load or sync still
  joins a turn up to `TURN_JOIN_S` (14 s, director.ts) after its second, as
  before, since the turn gives the new clock until the almanac re-reads it.
  The "dark gap around the night's second" is gone with it. The stars' sst
  over 7 s changes by up to 0.0071 per frame at 30 fps (unit bound 0.0075).
- **Day sky rays** (daylife.ts, item 82): six rays (`DAY_TIERS` 'wSmwSw',
  strengths 1 / 0.7 / 0.4) evenly over ±55° round the sun's direction
  (`dayRayAngle`, was six within about ±0.4 rad), so a sun above the top
  right of the middle sends them from about 30° below level at the left to
  about 60° at the right; drawn with a vertical gradient (1 at the top, 0.6
  at 0.23 H, 0.2 at 0.5 H, gone at 0.78 H; was by distance from the sun);
  the pulse's peak 0.1 … 0.2 (was 0.14 … 0.3). The same six triangles a
  frame at the still rate; under 1°/s as the sun crosses the day (unit test, a day in 10 min).
- **Demo.** `#weather demo sunset`'s night step 10 s (was 14; the stars are
  complete when it begins), 1:26 in all; captions name the wider fan, the
  sunrise's rays with its glow, the glints fading with the rays and the
  stars from 7 s before the night.
- **Cost.** Four more thin rays (12 triangles and their cores, was 8)
  and the glints of the wider fan. Headless Chromium (software) at
  2000 × 1150, worker frame average / p95 over the last 600 frames, the
  previous build in brackets (two runs): sunrise -30 s 2.21 / 6.07
  (1.96–2.00 / 5.6–5.8), -10 s 6.20 / 10.15 (5.89–6.01 / 9.2); sunset
  -30 s 7.96 / 13.78 (7.70–7.88 / 12.9–13.5), -10 s 6.76 / 9.41
  (6.78–8.03 / 9.5–11.1): about +0.2 ms in a sunrise, the same in a
  sunset. `node bench/weather-bench.ts --rounds 2` (no turn in its scene)
  ran on a loaded machine (load 4–7.5): Chromium worker 1.86–1.95 ms,
  Firefox 55–57 ms, against 1.62–1.95 and 54–62 for the previous build in
  the same hour, so in line; bench/results/weather.md (load 2–3) left as
  it was.

### Sunset at the night's second (owner item 83)

After items 80–82 the sunset read as over about 10 s before the night
began, and its stars as in place 5 s before it. Three things made it read
as set at -10: the colour the sun's light takes (`SET_C`) was already
night blue at progress 0.88 (-7 s), so the glow, rays and tint went dark
before they faded; the rays and glow fell as (1 − x)^1.5 from -24 s (0.45
at -10, 0.1 at -5) and the glints as that ^1.5 (0.3 at -10, 0.03 at -5);
the tint and warm palette as (1 − x)^1.3 from -14 s (0.26 at -5). This
replaces the sections above where they differ.

- **A late fade for a sunset** (sunturn.ts `lateFade`, `turnFade(s, kind)`,
  `glowFade`): (1 − x/4)(1 − x³) over the same windows (rays and glow from
  `RAYS_FADE_S` -24, tint and palette from `GLOW_FADE_S` -14). Rays: 0.77 at
  -12, 0.72 at -10, 0.40 at -5, 0.18 at -2, 0.09 at -1, 0 at 0; they still
  visibly fade from about -22 (item 81). Steepest 0.094/s at the end (unit
  bound 0.1/s; a sunrise keeps 0.07). The glints stay `turnRays^1.5`, so
  they fade with them. A sunrise is unchanged.
- **Warm to the end** (sky.ts `SET_C`): red at 0.5, crimson 0.8 (-12 s),
  purple 0.95 (-3 s), a dusky blue only at 1; was purple at 0.7 and night
  blue at 0.88.
- **The stars from -9 to +5** (`SET_STARS_S` -9, `TURN_FULL.set` 5,
  `FULL_S` 5): lin(-9, 5)^1.2: 0.16 at -6, 0.22 at -5, 0.36 at -3, 0.59 at
  0, 0.83 at +3, complete at +5. The dusk sky is drawn over the stars, so
  a share under about 0.15 does not show while it lasts: by eye, a few
  faint stars at -5, more at -3, clearly there at 0 (a first try,
  sst(-6, 5)², 0.0005 at -5, showed none before 0). The director keeps a
  sunset's sky curve and a released demo turn to +5; `TURN_JOIN_S` (14)
  stays above it. The sky module keeps the fast rate while the stars fill
  in after the turn (`starsIn`). Steepest change 0.003 per frame at 30 fps.
  The item 76 test now allows a share under 0.2 while the rays are above
  0.45 (the stars start under the sun's last light, as the owner asked).
- **Half the sun, half the rays.** The sun's own light (its hot spot, its
  hazy glow, the ray front's band; sky.ts `SUN_LIGHT`) is half of before.
  The owner asked it of the sunset; a sunrise's sun is the same drawing and
  nothing the owner said of it conflicts, so it is halved too (one
  constant per kind if it should not be). Thin rays `RAY_ALPHA` 0.0425
  (was 0.085) and the beams' layers 0.011 / 0.025 / 0.0325 in both turns;
  the frame glints go by `turnGlint` and `TIER_GLINT`, not by these, so
  they keep their strength.
- **Demo.** Captions for the new order; `#weather demo sunset` keeps its
  10 s night step (the stars complete at +5).
- Checked in headless Chromium at 2000 × 1150 by screenshots every 1–4 s
  from -20 to +8 (sunset) and the first and last 20 s of the sunrise: the
  warm glow and the rays still show at -5 and faintly at -2, nothing at 0,
  a few faint stars at -5, more at -3, filled in by +5.

### Dithered day rays (owner item 84)

The day sky's pulsing rays came and went visibly. The cause is 8-bit
alpha: at the pulse's peak a ray's alpha is about 0.026 (the glow's 0.01),
a few levels over the sky, and each level came or went at once over a
whole ray (bands along it) or the glow (a ring) as the pulse crossed it,
the last step to 0 the most visible. Headless frame diffs of the old
build show whole stretches of a ray and the glow's disc stepping in one
frame. The still rate (3 fps) was not the cause: a level step is
instantaneous at any rate.

- **Textures that hold the peak's light** (daylife.ts `textures`): made
  once per size on a CPU canvas: the rays' (256 px wide, repeated across,
  fading down the screen as item 82's gradient) and the glow's (half size,
  drawn scaled up unsmoothed). Each pixel holds the light at the pulse's
  peak × 0.5 … 1 (random, fixed on the screen), rounded at random. They are
  drawn at globalAlpha = the pulse's share (0 … 1), so each pixel takes its
  steps at its own moment: the light comes and goes pixel by pixel, over
  seconds. A full-alpha texture under a tiny globalAlpha does not work:
  globalAlpha is itself 8-bit, and the whole glow stepped with it (seen
  in a first try). Frame diffs now show scattered pixels, no stretch.
- **Subtler**: the light is 0.6 of before (`GLIMPSE_RAY` 0.132 and
  `GLIMPSE_GLOW` 0.048 with the textures' mean 0.75; were 0.165, 0.06).
- **Nine rays** (`DAY_TIERS` 'wSmwSwmSw': three S, two m, four w,
  interleaved) evenly over the same ±55°; still under 1°/s.
- **Cost**: the same rate (FPS_STILL); per frame one image copy and nine
  pattern-filled triangles instead of a radial and a linear gradient fill;
  the textures (256 × 0.78 H and about 0.42 H square) are made once per
  window size. No bench run (no change of rate or of the number of draws
  that matters).

### A glint on the first pane only (owner item 86)

A ray glinted on every pane it crossed, so a ray through one pane lit the
frame of a pane behind it too. Now `beamHits` (beams.ts) keeps only the
hits on the pane with the nearest hit along the ray: that pane's entry
(strong, with the sparkle) and its exit (BEAM_EXIT, as before); every pane
further along gets none from that ray. "First" is purely along the ray:
a float the ray meets before the docked pane under it is the first (the
docked pane gets nothing from that ray), a float further along inside a
docked pane gets nothing; a borderless pane is passed over (no glass, item
53). It applies to the thin rays and the beams of a sunrise and a sunset
(the only rays that glint; the day sky's rays have none). The drawing of
the rays and beams is unchanged. Cost: one pass over a handful of hits per
ray, and fewer glints drawn.

### No gap below the rays, a soft start, later stars (owner item 88)

- **Fan's lower edge.** The even path between the turn's two ends
  (aimed at the bottom edge 0.1 W in from the sun's side) fell up to ~15°
  short of the bottom corner midway, so a sunset left the lower-left
  corner without rays. `turnFan` now takes the steeper of that path and an
  aim that puts the fan's lowest place (half a place in) about 0.02 W from
  that corner. The aim is taken at three knots of the turn (start, middle,
  end) and interpolated evenly: aimed at the corner each frame it swung at
  up to 1.35°/s as a low sun neared it; now every ray stays under 0.95°/s.
  The wider fan pushed the sunrise's upper rays down, so FAN_UP_HIGH went
  from 12° to 15° to keep a ray or two pointing up from a third in.
- **A soft start.** A sunset's rays reached half strength in 2.5 s, three
  of them at once, and each 8-bit step of a faint alpha came at once over a
  whole ray (globalAlpha is itself 8-bit; a ray adds only a few levels), so
  they popped up. Now the rays come in over the first 14 s (smoothstep to
  the early strength), the first three one at a time 4 s apart (each over
  10 s), the other nine from -50 s, 2.5 s apart; the hazy glow over 12 s.
  Every turn ray, beam and glow alpha is dithered in time (`dith8`): each
  frame takes the 8-bit level below or above at random by how near it is,
  so at 30 fps the light changes smoothly between levels. No new canvas or
  texture; cost is one random number per fill.
- **Stars.** A sunset's stars start at -3 s, so a few are just
  perceptible at the night's second (share 0.17; under about 0.15 they do
  not show over the dusk sky), and they are complete 10 s into the night
  (TURN_FULL.set 10, was 5). The sunset demo is 5 s longer.

### Calm rays, a later dusk, a lifting fan (owner item 89)

- **Flicker.** Item 88's dithering in time (a random 8-bit level each frame)
  made the faint rays flicker, worst in a sunset's first 30 s where a ray is
  one or two levels. Replaced by a fixed spatial grain: the turn's rays and
  beams are drawn into a layer at about 16× their alpha, multiplied there by
  a fixed grain tile (0.5 … 1 per pixel, 256 px, repeated) and copied onto the
  sky at alpha 21/255. Each pixel takes its 8-bit step at its own moment and
  nothing changes between frames but the light. Measured in headless
  Chromium (40 px patches, frame-to-frame second difference): 2–4× less than
  item 88, and none left in the rays. The rays' shimmer is a third of before
  (depth 0.1, beams 0.08) and grows from none over a turn's first 30 s.
  Cost (measured before the release, headless Chromium, software
  rendering, 1728 × 1000, the worker's frame time in a sunset): 11–13 ms
  before item 88's change, 44–51 ms with a full-size layer drawn in two
  passes. Now one layer at half the resolution (drawn scaled up), the rays
  and beams in it together (the panes' shadow wedges cut from the sky and
  from the layer before the beams go in, as before), the grain one image copy
  (a pattern fill cost more): 16–21 ms, inside the 33 ms of FPS_FAST, and
  only while a turn runs (twice a game day, a minute each).
- **The blue.** A sunset's dusk share follows points (-50 0, -30 0.16,
  -10 0.45, -5 0.68, -2 0.9, 0 1): the blue still fairly clear at -10,
  weaker at -5, just perceptible at -2, gone at the night (was smoothstep
  -50 … 0, a tenth left at -10).
- **The last rays.** The rays had faded from their far ends (0.4 at -5 s)
  and the fan still pointed steeply down from a sun at the horizon, so only a
  few short rays showed at the far left. Now a sunset's rays keep their
  strength until -4 s (0.75), fade over the last 3 s and shrink toward the
  sun (reach 1 → 0.4); their far end is brighter (0.3 of the start, was
  0.05), the ray front stays far until the last tenth, and they are up to 2×
  stronger from -8 s, where the dusk sky's own colour hid them. The fan
  lifts: its lower edge turns evenly from its path to level between -42 and
  -3 s, its upper edge rises to 35° up (toward 0.35 W at the top, was the far
  corner), so the last rays point right and up-right over the screen, none
  down. The lowest ray turns at up to 3°/s during the lift, the only move
  above item 79's 1°/s; the sun's hazy glow keeps item 83's late curve.

### The sun's light over the sky only; a sunset sun at the band (owner item 104)

The left band (ADR 0091, `band.ts`) kept every weather effect out, but not
the sunrise and sunset: their glow, rays and beams reached the left edge.

- **Masked along the band's curve.** The sun's glow and hot spot (drawn
  first on the back layer, which holds nothing else then), the ray layer
  (rays and beams) and the ray front are cut along the band's own curve
  (destination-out, `bandCut` in sky.ts); the ray front goes through the
  free ray layer for that, since the front layer already holds day life.
  Frame glints fade with `bandK` at the hit. The sky's left fade also holds
  through a turn: from a sunrise's first 12 s (before the day's sun weight)
  and to a sunset's last 8 s, so the tint is not seen in the band either.
- **A sunset's sun at the band.** It no longer stands beyond the left edge:
  its x is the band's solid edge (`bandSolid`, ~40 % of W), its height and
  the fan's angles as on its circle (`turnFan` from the circle point, then
  the origin moved). Its light and rays come out of the band's fade.
- **Cost (pre-release check, 2026-10-20).** Headless Chromium, software
  rendering, 1728 × 1000 at ratio 2, the worker's frame in the middle of a
  turn: first ~19 ms against main's ~12 ms. Most of it was the ray front
  drawn through a layer to be cut; it is now filled straight in 8 strips
  through the band's fade, each at the band's strength at its middle (at
  ~2 % alpha the steps do not show). A half-size layer for the sun's glow
  was tried and was slower (~22 ms), so the glow is still cut on the sky.
  Now ~16 ms (p95 ~21) against main's ~12.5 (p95 ~17), inside FPS_FAST's
  33 ms, and only while a turn runs.
- **Dimmer sunset rays.** A sunset's rays, beams and their glints × 0.6 all
  through (`SET_RAYS_DIM`); its glow is unchanged.

### Sunset rays upward and a dusk light (owner item 105)

- **A wider fan at the end.** With the sun at the band (item 104) the last
  rays bunched between level and ~30° up (the upper edge was bounded by the
  far top corner as seen from the sun's old place beyond the left edge).
  The upper edge now lifts with the lower one (`setLift`, -42 … -3 s) to
  60° up (`FAN_UP_SET_END`): the last rays spread from level to steeply
  up-right. The lift stays under 3°/s; elsewhere every ray under 1°/s.
- **Dusk light.** A sunset gets a wide red-orange glow (`turnDusk`,
  sunturn.ts) apart from the sun's own glow and its rays: smoothstep in
  from -50 to -20 s, out from -20 to -8 s. Drawn on the back layer round the
  sun's x, no higher than mid-height, an ellipse 1.6 × 0.8 of 0.75 ×
  max(W, H), alpha 0.22 at its middle (0.6 × on Paper), weaker with rain
  and fog, and cut by the band with the rest of the sun's light.
- **Near the sun (owner item 106).** The wide ellipse filled nearly the
  whole sky with red, most of all toward the bottom. Now two layers round a
  point a quarter into the band's fade right of the sun, at the sun's height
  (clamped to 0.12 … 0.5 H): a core of 0.28 × max(W, H) (x 1.25), alpha 0.3,
  and a faint flat halo of 0.6 × (x 1.4, y 0.5), alpha 0.06, that fades
  out well above the bottom (`DUSK_LAYERS`).

### A sunset's rays fall 40 % before the night (owner item 107)

A sunset's ray strength (`turnRays`, so its rays, beams and, by the power
1.5, their glints) is multiplied by `1 − 0.4 · smoothstep(-16, -10, s)`: it
starts to fall at -16 s, is 40 % below the old level at -10 s, and from
there fades on its old curve, at 0.6 of its old level (first 50 %, the
owner clarified 40 %). The sun's glow and the dusk light are
unchanged.

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
