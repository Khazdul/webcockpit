# 0124 — Start page sky engine

- Status: Accepted
- Date: 2026-11-07
- Related: stage 41a (`docs/stages/41-start-page.md`); the approved look
  is `notes/research/start-menu-mockups/round6/logo-3.html` and the
  "Baseline" in that folder's README (rules from `BRIEF-round3.md`,
  `BRIEF-round4.md`). Game time: `src/gmcp/clock.ts`,
  `src/gmcp/gametime.ts` (ADR 0074). First paint: ADR 0083 (41d adds the
  addendum). In-game weather: ADR 0091 and stage 28 (`src/weather/`).

## Context

The new start page has a living sky behind the menu, driven by the
offline game clock: sun and moon on a slow, shallow path from just
off-screen left to just off-screen right, the sun clearly larger than the
moon and never overlapped by it, soft clouds, sparse stars (no Milky Way:
it read as white specks), shooting stars, and a calm weather director
(winter always snows, rare light rain in spring and autumn, never rain in
summer, a rare short autumn storm, fog only sometimes at dawn). Below the
horizon the sky goes on as a plain surface. The wordmark (41b) reflects
the sun or moon; the quote and almanac (41c) pick dark or pale text from
the sky behind them; the first paint (41d) must show the sky before the
app loads and hand over without a visible change. Targets: 60 fps on an
Iris Xe laptop and a mid phone, a cheap fallback for weak devices, no
main-thread hitch over 16 ms in normal running.

## Decision

### 1. Its own module, not the in-game weather engine

`src/start/sky/` is a separate main-thread engine; it shares only the game
time model (`gametime.ts`: `moonAt`, `moonUpFraction`, `periodOf`,
`seasonOf`; `clock.ts`: DAWN/DUSK and the anchor). Reasons:

- **Different job.** `src/weather/` paints effects *over the cockpit*:
  pane geometry, holes under floating panes, GMCP-driven signals, a
  protocol, a worker with OffscreenCanvas. The start sky is a full-screen
  scene with a different look (the approved mockup) and no game input.
- **First paint.** The smooth sky must be computable without the engine
  (41d). A worker-rendered canvas cannot give the first paint its pixels;
  CSS gradients from a pure function can (§3).
- **Size.** The weather engine is a lazy chunk with a worker; the start
  page is the first thing every user sees. The sky engine is ~37 KB min /
  15 KB gzip (all of `src/start/sky/`, rolldown, minified); the look model
  alone (`look.ts` + `weather.ts` + the moon from `gametime.ts`) ~10 KB /
  5 KB, with `src/start/clock.ts` ~13 KB / 6 KB.
- **Main thread is enough.** Measured (§7): the engine's own work is a
  median 0.1–0.9 ms per frame. A worker would save little and add the
  protocol, startup latency and a second copy of the model.

### 2. The look model is a pure function of game time

`look.ts`: `skyLookAt(g, { view, weather })` → `SkyLook`, no DOM, no
canvas reads, the same object the engine paints from (`skySceneAt` adds
`paint`, the colours as numbers). The stub's fields keep their names; added
fields: `textBack {quote, almanac}`, `g`, `month`, `hour`, `elevation`,
`horizonY`, `view`, `weather`, `sun`, `moon`.

- **Sun elevation** `e`: in the day (dawn hour to dusk hour + 1, gametime's
  DAWN/DUSK) `sin(π·tt)·maxAlt` (maxAlt 0.5 in winter … 1 in summer);
  at night −distance to the nearer rise/set / 2.4 h, floored at −1.
  `dayness = smoothstep(−0.22, 0.2, e)`: continuous and monotonic from deep
  night to noon (unit test), ~50 game minutes from 0.1 to 0.9.
- **Geometry**, in viewport fractions. Horizon line `horizonY` = 0.6 on
  wide screens, easing to 0.655 as w/h goes from 0.85 to 0.65 (phones).
  Path shared by sun and moon, `f` 0 at rise … 1 at set:
  `x = −0.08 + 1.16·f` (time only, no aspect),
  `y = horizonY − sin(πf)^1.35 · k · (horizonY − 0.05)` (k = 0.55 + 0.45·maxAlt
  for the sun, 0.95 for the moon; the 1.35 power is the slow, shallow lift).
  Sun radius `max(21, 0.04·min(w,h))` px, moon `max(9, 0.018·min(w,h))` px.
  When both are drawn and closer than `3.6·r_sun + 2·r_moon` px the moon's
  drawn position is pushed out along the line between them (kept above
  the horizon), so `moon.x/y` (and the light, when it is the moon) depend
  on the view in px. Unit tests check over a year at 1440×900 and 390×844
  that they never come within `3·r_sun + r_moon`.
- **Moon**: phase, level and rise/set from gametime (MMapper's model);
  visible when up, not new, and bright (level > 4) or the sun below −0.05.
- **Light** (`SkyLight`): the sun when its intensity ≥ 0.8 × the moon's,
  else the moon; `kind 'none'` below 0.02. `strength` = the mockup's
  intensity clamped to 0..1: a low clear sun reaches 1, a high one 0.75,
  a full clear moon 0.85; clouds dim both (×(1 − 0.8·cloud) sun,
  ×(1 − 0.75·cloud) moon). Colour: `#fff1d6` high sun → `#ff9a48` low,
  `#b9c8f2` moon.
- **Text backs**: `skyColorAt(look, x, y)` composites the smooth layers
  (§3) at a point; `skyLumaAt` gives Rec. 709 luma of the gamma-encoded
  colour (0..1), the measure the mockup read from canvas pixels.
  `textBackLuminance` = luma at the quote (0.5, 0.8); `textBack.almanac`
  at (0.9, 0.95). Dark iron-brown text above ~0.5; use hysteresis
  (dark above 0.54, pale below 0.46, the mockup's values). Both points lie
  below the horizon, on the plain surface, where nothing else is drawn
  (rain and snow aside), so the value is exact. The layout may call
  `skyLumaAt` for its real positions.

### 3. Layers: CSS gradients for the smooth sky, canvases for the rest

Bottom first, in one `div.wc-start-sky` (pointer-events none,
`contain: strict`, `aria-hidden`):

| layer | what | how |
|---|---|---|
| back | base gradient (zenith → middle → horizon colour), horizon glow behind the sun | `div`, CSS `background` from `skyCss(look).back` |
| bodies | stars (turning about a pole above the top left), shooting stars, sun, moon | canvas, device px (ratio capped) |
| clouds | 17 soft puffs, overcast sheet | canvas at ~½ CSS px, upscaled by CSS, top 62 % |
| air | afterglow, twilight belt, haze band, veil round a low sun / bright moon, the plain surface below the horizon, fog, vignette | `div`, CSS `skyCss(look).air` |
| front | rain, snow, lightning and flash | canvas, device px, only sized and shown while needed |
| grain | static noise texture | `div`, high quality only |

- The smooth layers are **data** (`skyLayers` → linear and radial
  gradients in px of the view) written as CSS (`skyCss`) and evaluated in
  JS (`skyColorAt`). The browser rasterizes CSS gradients off the main
  thread, and **the first paint can paint `skyCss(look).all` on one element
  and get the very same pixels**: measured pixel-identical (max channel
  difference 0) in Chromium and Firefox at dawn, day and night. The
  engine then fades its canvases in over 0.9 s, so the hand-over shows
  no jump. The vignette is part of the sky (air layer): the layout must not
  add its own.
- The approved look **adds** the sun's glow and the moon's halo to the sky
  ("lighter"). A canvas over CSS can only blend source-over, so each glow is
  a small sprite (½ CSS resolution) holding a copy of the back layers
  round the body with the glow added in "lighter", faded out over its rim
  (where the glow is nil): over the real sky it is exactly the additive
  result, with no edge (checked on screenshots against the mockup).
- Clouds are lit as in the mockup (vertical tint over the band and a
  highlight towards the light, "source-atop"), but the tint is baked into a
  lit copy of each puff and of the sheet at the 2 Hz refresh (the tint is
  linear, so per-puff equals all-at-once); a frame only blits sprites.
  Puff positions are a function of game time (drift = speed × g, wrapping
  just off-screen), so reloads show the same sky.
- Stars: positions and alpha per star, then one path per colour and alpha
  step (24 steps) instead of ~1000 fills.

### 4. Calm weather director, deterministic

`weather.ts`: `skyWeatherAt(g)` is a pure, seeded function of game time.
Game time is cut into 240-minute slots (4 real minutes); a hash of the slot
index picks one state, weighted by season (winter: always snow; spring:
clear 4, fair 4, clouds 1.6, rain 1.5; summer: clear 5, fair 3.5; autumn:
clear 3, fair 3, clouds 2, rain 1.7, storm 0.3). A wet slot directly after a
wet slot becomes clouds. In a wet slot the clouds come first, the rain
falls 45–100 s in the middle (a storm: a 25–45 s core in a 70–110 s rain)
and stops well before the boundary. Slots cross-fade over 60 minutes
centred on the boundary, so winter snows to its last minute and no rain
leaks into summer. Snow drifts between light and steady by smooth noise
over ~1.5 minutes. Fog is not a slot state: on about one morning in four
(never in winter or on a wet morning) it rises 1.5 h before the dawn hour
and lifts 2 h after. The wind always blows from the west (clouds drift
right; rain slants with it), its strength from the state plus gusts.

Measured over ten game years (every third minute): winter snow 100 %;
spring clear 34 %, fair 38 %, clouds 24 %, raining 2.9 %, fog 2.3 %;
summer clear 57 %, fair 40 %, fog 2.8 %, never rain; autumn clear 28 %,
fair 32 %, clouds 33 %, raining 4.2 %, storm 0.3 %, fog 1.9 %. Unit tests
pin the rules (winter always snow, summer never rain, rare rain, storms
only in autumn and short, no rain after rain, fog only round dawn and never
in winter, no jumps between minutes, long calm stretches, determinism).

### 5. Clock and URL parameters

`src/start/clock.ts` `startGameMinutes()`: the saved `wc.clock` anchor,
else the seed epoch; the page's `sky*` parameters shift it (the almanac
reads the same clock, so it agrees with the sky). All parameters work in
production builds (the owner tests branch previews) and collide with none
of the app's (`safe`, `bench*`, `fixture`, `replay`, `speed`, `weather`,
`player`, `session`, `replayhtml`):

| parameter | effect |
|---|---|
| `skyHour=21.5` | start the clock at this hour (0–24) |
| `skyMonth=0` | … in this month (0–11, or a Westron/Sindarin name) |
| `skyDay=15` | … on this day (1–30; moves the moon) |
| `skyYear=3038` | … in this year (all four: the same sky whatever the real date) |
| `skyFast[=600]` | game time runs this much faster (bare: 600) |
| `skyFreeze` | the clock stands still; the sky paints one still frame |
| `skyWeather=snow` | pin the weather (clear fair clouds rain storm fog snow) |
| `skyQuality=low` | pin the quality tier (high medium low) |
| `skyMotion=reduce` | as prefers-reduced-motion (`full` ignores it) |
| `skyStats` | frame-time readout in the corner |

For deterministic screenshots: `?skyYear=3038&skyDay=2&skyMonth=0&skyHour=22&skyWeather=snow&skyFreeze`
and wait for `.wc-start-sky[data-sky-ready="1"]`. The root also carries
`data-sky-quality`, `data-sky-mode` (run, still, frozen),
`data-sky-weather` and `data-sky-period`. A dev harness:
`/src/start/sky/dev/harness.html?…` (dev server only; `&text` shows a
sample quote whose ink follows `textBackLuminance`, `&firstpaint` only the
CSS gradients).

### 6. Running: cadence, quality, motion, pause

- The frame loop runs at the display's rate, but **canvases repaint at
  ~30 Hz at most** except rain and snow (high tier): stars while they
  twinkle (else the bodies at ~10 Hz: the sun moves 2 px a second), clouds
  in the frames between (staggered). On Iris Xe (Chromium, 1728 × 1000 @2,
  a real window) any canvas repainted every frame cost ~6 % dropped
  frames; at 30 Hz none. Stars, clouds and bodies move a fraction of a pixel
  per frame, so it looks the same.
- The CSS gradients, the glow sprites and the clouds' tint are refreshed
  twice a second (every frame with `skyFast`). Cloud puffs are drawn and
  re-lit a few per frame within a 2 ms budget. Mount takes 4–9 ms (no
  front canvas until rain or snow, grain made after 300 ms).
- **Quality tiers**, chosen by measured frame times and only ever stepping
  down (pinned by `?skyQuality` or the `quality` option):
  high (canvas ratio ≤ 1.5, clouds at ½ px, all stars and particles, grain),
  medium (ratio ≤ 1, clouds 0.4, 80 %, rain/snow at 30 Hz), low (ratio
  0.75, clouds 0.3, 50 %, a 30 fps cap, no grain). After 0.7 s of running
  a window of ≥ 1.5 s and 30 frames is measured: our work median > 6 ms or
  p90 > 10 ms, or a median frame interval > 22 ms, steps down; a steady
  window looks again 10 s later.
- `prefers-reduced-motion` (or `?skyMotion=reduce`): a still sky repainted
  every 2 s (game time still moves the sun; clouds drift at 5 %, no
  twinkle, no shooting stars, no lightning, rain and snow stand still).
  `?skyFreeze` (or the `freeze` option): one frame, repainted on resize.
- Paused on `document.hidden` and `setPaused(true)`; resize is debounced
  (120 ms, ResizeObserver on the host and window resize); `dispose()`
  removes everything. `onLook` pushes at most 4 times a second, only on a
  noticeable change.
- The pointer gives a slight parallax (stars, sun, moon, snow; mouse
  only), as in the mockup.

### 7. Measurements

`node bench/start-sky-bench.ts` (headless) and `WC_BENCH_HEADED=1 node
bench/start-sky-bench.ts` (real windows on this machine: Intel Iris Xe,
Alder Lake). Automatic quality, 6 s after 2 s settling; sky work = the
engine's own time per painted frame (median / p95 / max ms); rAF = frame
intervals of the page. Results: `bench/results/start-sky-headed.md` and
`start-sky.md`. Other agents were loading the machine during some runs.

Real windows (Iris Xe), all at the **high** tier:

| browser | geometry | day, fair | clear night | winter night, snow | autumn storm |
|---|---|---|---|---|---|
| Chromium | 1728×1000 @2 | 60 fps · work 0.13 / 0.29 / 0.44 | 60 · 0.18 / 0.35 / 0.64 | 56 · 0.30 / 1.06 / 1.66 | 56.5 · 0.19 / 0.33 / 0.95 |
| Chromium | 390×844 @3 | 60 · 0.12 / 0.34 / 0.41 | 60 · 0.11 / 0.19 / 0.27 | 60 · 0.22 / 1.31 / 1.95 | 60 · 0.40 / 0.93 / 1.87 |
| Firefox | 1728×1000 @2 | 59 · 0.50 / 13.4 / 15.0 ¹ | 59 · 0.20 / 0.80 / 1.40 | 58 · 0.40 / 0.70 / 1.50 | 58.5 · 0.72 / 2.52 / 3.50 |
| Firefox | 390×844 @3 | 60 · 0.22 / 1.54 / 3.20 | 58 · 0.14 / 0.52 / 0.90 | 58.5 · 0.40 / 0.84 / 2.10 | 58.5 · 0.44 / 0.88 / 2.00 |

(fps · sky work median / p95 / max ms.) No long animation frame or long
task (> 50 ms) in any Chromium run. ¹ The first page of a fresh Firefox;
two reruns: 0.26 / 5.66 / 9.2 and 0.24 / 0.52 / 0.9. Firefox here drops
some frames even on an empty page (p95 33 ms), so its p95 intervals are
not ours. Firefox with software WebRender (`gfx.webrender.software`, a
stand-in for a machine without GPU acceleration), 1728×1000 @2: 59–60
fps at the high tier, work ≤ 1.7 ms.

Headless (software compositing): Chromium 57–60 fps at the high tier
everywhere (work median ≤ 0.25 ms, max 13.9 ms in the storm: a lightning
bolt). Headless Firefox composites on a timer in software and is the
worst case: the fallback stepped down as designed (laptop: medium by day,
low at night; 11–31 fps), phone geometry medium/low at 28–53 fps; the
engine's work there is 0.5–8.5 ms median, under 22 ms max.

Mount: 4–9 ms (the first page of a fresh browser 12–20 ms, once 1.3 s
while Chromium started its GPU process). Before these changes a canvas
repainted every frame dropped ~6 % of frames in a real Chromium window,
the grain's overlay blend cut headless Firefox to 6 fps, and mounting with
all clouds lit at once took 20–90 ms.


## Consequences

- 41b (wordmark): use `look.light` (`x`, `y` viewport fractions of the
  view the engine was given, `strength`, `color`, `kind`) and `dayness`;
  subscribe with `onLook` (≤ 4 Hz) or read `look()` in your own frame.
- 41c (layout): mount with `mountStartSky(host)` in a positioned host that
  covers the viewport; import the engine lazily (`import('…/sky')`) or keep
  it out of the first chunk; quote ink from `textBackLuminance` with the
  0.46/0.54 hysteresis, almanac from `textBack.almanac` (or `skyLumaAt`
  for real positions); do not add a vignette or grain; call
  `setPaused(true)` when the start page is hidden and `dispose()` when the
  game is entered.
- 41d (first paint): `skyLookAt(startGameMinutes(), { view: { w: innerWidth,
  h: innerHeight } })` and `skyCss(look).all` on one element give the
  engine's CSS layers pixel for pixel; the engine fades its canvases in on
  top. `look.ts` has no DOM and pulls in only `weather.ts`, `color.ts` and
  the moon from `gametime.ts`.
- The mockup's demo panel is gone; the URL parameters replace it.
- Deviations from the mockup: the grain is static and in plain blend (the
  overlay blend cost software compositors a backdrop read per frame);
  canvases repaint at ~30 Hz; cloud positions follow game time and wrap
  just off-screen (more stay in view than drifting from a random start);
  the lightning flash whitens the clouds as one wash; the reduced-motion sky
  is still rather than slowed.
