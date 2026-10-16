# 0091 — Weather effects (trial)

- Status: Proposed (trial on branch `weather-trial`; may be dropped)
- Date: 2026-10-16
- Changes: ADR 0010 (pane frame glyphs) for the trial

## Context

The owner wants discreet, decorative weather over the whole client, not
only the map as in MMapper. Four prototype rounds
(`notes/research/weather-world/`) settled the look and the signal
mapping. Latency of text and commands must not be affected.

## Decision

### Signal mapping (owner, rounds 3–4)

- Sky: the latest `Event.Sun` / `Event.Moon` decides: sun up → day sky;
  night with the moon up → moonlit sky with a big moon in the almanac's
  phase that rises, crosses and sets; otherwise a starry night with
  shooting stars. `light` matters only as `o`, which overrides with the
  darkness sky (dark, slight red).
- `weather`: ` ` nothing; `~` few large distant clouds in the top ~35 %;
  `'` light rain with drips along pane edges; `"` heavier rain and more
  drips; `*` snow that falls in from above, builds up gradually, with gusts;
  `null` indoors: no sky effects.
- `fog`: `-` light, `=` dense; little at the bottom-left.
- `Event.Sun` rise/set: sun rays. `Event.Darkness` start/grow: a short red
  ominous bleed; shrink/end: a brief lightening.
- `position`: sleeping → floating z z Z; stunned → corner/edge flare with a
  short shake (no white flash); incapacitated/dying → blood spatters
  landing at once plus a red wash pulsing with a heartbeat.
- Lightning: GMCP has no thunder value (MUME `help weather`; a log on
  2026-10-16 shows `weather: "*"` in a room with lightning). Use the XML
  `<weather>` tag message instead (verify live).
- Weather, fog and light changes only apply after 3 s stable, so running
  through rooms does not flicker; values ease in.

### Latency

Rendering runs in a Web Worker on OffscreenCanvas. The main thread posts
only state changes and layout geometry; no per-frame main-thread work.
The module loads only when enabled; off = no worker, no canvases.

### Isolation

All code in `src/weather/` plus one hook point each in the app, the
layout and Options; the frame change in `src/panes/frame.ts` and CSS.
Dropping the trial = revert the branch.

### Frames

Thin equal-thickness bevelled frames drawn in the middle of the outer
frame cells, keeping the cell grid and pane sizes.

Built (stage 28 A): `.wc-pane-frame` is a CSS box, no glyph text.
`frameGeometry` (`src/panes/frame.ts`) gives the line in whole device
pixels: thickness `max(2, round(cell-h·dpr / 9))` device px (2 CSS px at
the default size), centred in the outer cells; pane.ts sets `--frame-t/x/y`
on the pane when the cell size or ratio changes. Border colours are
`--pane-border` mixed 22 % toward white (top, left) and 30 % toward black
(bottom, right) with `color-mix`. The pane's fill is the frame box; the
ring outside the line is transparent (a floating pane: the terminal
background, so game text does not show around it). The label ` Label `
sits from column 3 on a tab of the pane fill (as the old label cells), so
it stays legible when the tint differs from the page. Borderless panes are
unchanged.

### Engine (stage 28 B)

- `src/weather/`: `index.ts` (main thread, `createWeather(host)`),
  `worker/` (engine + the four ported modules), pure `director.ts`,
  `palette.ts`, `geometry.ts`, `protocol.ts`. Nothing imports it
  statically; the dev hook (`__wc.weather()`, `?weather`, dev builds only)
  is the only caller until C/D.
- Layering: the back canvas is the cockpit's first child (positioned, no
  z-index), so it paints under the game text and docked panes; the front
  canvas is `z-index: 90` (over floating panes, under drop bars, the drag
  shield and the chrome). Docked panes are opaque, so while the engine runs
  (`data-weather` on the cockpit, set on the worker's first frame) the
  docked `.wc-pane` and its `.wc-pane-frame` get `background: transparent`,
  and the worker paints each docked pane's own background, when it differs
  from the terminal's, under the back layer (`destination-over`, after the
  mask) in the frame box. The page/app background already shows through.
  Floating panes stay opaque. The label tab keeps its fill.
- Geometry is measured only on ResizeObserver / `Cockpit.onLayout` /
  window resize, posted only when `geometryDiff` says it changed (0.5 px
  tolerance). Text lines are re-sampled every 2.5 s in an idle callback
  and posted as a cheap `linesOnly` update. Pane rects are the frame box
  from `--frame-x/y/t` (stage 28 A), so drips and ledges sit on the line.
- Worker loop: `requestAnimationFrame` in the worker (timer fallback),
  capped at 60 fps; when every mix value is at rest and no module reports
  activity it idles at a 4 Hz director tick with cleared canvases. Hidden
  page: paused. A failing worker before its first frame removes the
  canvases (no effects); without worker OffscreenCanvas `createWeather`
  returns null.
- Background adaptation (`palette.ts`): luminance > 0.3 counts as light.
  On light backgrounds "light" effect colours (rain, snow, stars, bolt,
  dust, letters) keep their hue with inverted lightness, additive glows
  become `multiply` tints, the sky table is lightness-inverted at ~55 %
  alpha, fog tints become mid greys; the moon becomes a slate disc. Dark
  grey (#2a2a2e) uses the dark look.
- Real-client adjustments: the text horizon (moon set line, star field
  over the output) is at least 30 % down, since a real output is full of
  text; the moon crosses at game pace (`moonSpeed` 1, the prototype demo
  used 600 / 90); the z z Z letters use the client font stack in the
  worker, falling back to `monospace`.
- Measured (Chromium headless, 1600 × 1000, worker): heavy rain + light
  fog + moon avg 0.38 ms, p95 0.50 ms; snow + dense fog avg 0.41 ms,
  p95 0.53 ms; clear moonlit night avg 0.13 ms. Indoors with nothing
  showing: idle.

### Signals (stage 28 C)

- `src/weather/signals.ts` (pure) + `controller.ts` (wiring, lazy chunk).
  `Char.Vitals` weather / fog / light / position are read from the
  character model on its change event: it already merges the deltas,
  keeps absent keys and clears on a new connection or character, so the
  bridge only forwards keys whose value changed. Absent = indoors, no fog,
  standing.
- `Event.Sun` / `Event.Moon` / `Event.Darkness {what}` → `emit`. The bus
  handler checks the package's first letter before anything else.
- Almanac (`gmcp/clock.ts`, `gametime.ts`): the start state (sun up, moon
  up) and the moon phase (level / 12, always). Re-read every 30 s; sun or
  moon from the almanac applies only when the almanac's own value changes
  (a predicted rise or set), so an event in between wins until then; a
  clock sync re-applies it. An unsynced clock gives day, no moon.
- Lightning: a `text.line` with a `weather` XML span whose text is a
  flash (`streak|bolt|fork|flash of lightning`, `lightning
  flashes|strikes|…`; not "lit by", "has stopped") → `strike`. Without a
  weather span on the line, exactly `^A bright streak of lightning
  flashes\b` (the Redhorn Pass message in the owner's logs). **The
  `<weather>` tag is unverified live**: the log export drops tags; the
  owner checks it. A weather-tagged "wind coming from" line, or exactly
  `^You can feel a <word> wind coming from`, → `gust` (snow swirl).
- `__wcBench` / dev: `controller.pin(state)` holds values over the game's
  (bench, `__weather.jump`).

### Options and loading (stage 28 D)

- `settings.weather {enabled: false, sky, precipitation, lightning, fog,
  darkness, body: true}`; additive, no version bump; `migrateWeather`.
- Options → Weather effects (`options-weather.tsx`): master switch and
  the six categories, a one-line help for the highlighted row; the
  categories show dimmed while off. Phone: allowed, off by default like
  everywhere (no phone-specific rule).
- The one app hook is `installWeather` (`src/weather/hook.ts`), passed
  by the Shell into `AppOptions.weather`, so the log player and the HTML
  replay bundle never include it. It imports `controller.ts` (engine,
  bridge, CSS; worker separate) only while enabled; off destroys it.
  Main bundle: the hook, `support.ts` and the Options page only (a few
  kB); the controller chunk ~10 kB, the worker ~78 kB, loaded on demand.
- Appearance and pane colour changes call `refresh()` (theme re-read and
  geometry re-measured in the next frame).
- Unsupported browser or a worker failure: a UI-pane warning; the switch
  stays on but nothing runs until it is flipped again.

### Latency (stage 28 E)

`bench/weather-bench.ts` (`bench/results/weather.md`): off vs on, heavy
rain + dense fog + dying + moonlit night, owner geometry, alternating
rounds. The first run found Chromium's text → painted p95 at 83 ms
(off: 20 ms) and rAF gaps of 90 ms: not the main thread (idle ~4 ms/s),
but the GPU thread, where Skia's software path renderer drew stroked
paths with hundreds of subpaths (rain streaks, splashes, sparks), a path
of many rects (snow) and clips of many rects (the bolt behind text) as
full-screen masks, 60–350 ms per flush. Rule for the engine since then:
**no many-subpath paths or clips on the GPU canvases** — rect fills
(sheared or rotated per item, batched), separate convex polygons, and
sprites from big paths or blur filters drawn on CPU canvases
(`ctx2dCpu`, `willReadFrequently`) once, then as images.

Firefox draws worker OffscreenCanvas 2D on the CPU (headless: 35–120 ms
per frame at ratio 2). It does not touch the page's latency (the worker
is its own thread) but the effects stutter, so the engine checks its
frame time every 4 s while drawing and drops to ratio 1 above 12 ms.

Results (3 rounds, `bench/results/weather.md`), off → on:

- Key → send median 0.045 → 0.045 ms (Chromium), 0.040 → 0.040 ms
  (Firefox); text → painted p95 19.7 → 19.9 ms (Chromium), 19.3 → 17.4 ms
  (Firefox); no long tasks or Long Animation Frames, no rAF gaps > 50 ms.
- Chromium idle main thread: 5.6 → 38.9 ms of tasks per 5 s (the canvas
  commits and the 2.5 s line sampling), longest 2.9 ms.
- Worker frame: Chromium 1.4 ms avg / 2.3 ms p95; headless Firefox
  45 ms avg (software canvas): the page's latency is unaffected, but the
  effects themselves run at ~20 fps there. To check in the owner's Firefox.

### Power (2026-10-17, owner feedback 4 "Heat")

The owner's laptop (i7-12700H, Intel iGPU + RTX 3050 Ti, Firefox) ran
warm with the effects on. Measured with `bench/weather-power.ts`
(`bench/results/weather-power.md`): headed browsers, owner geometry, CPU
time of all browser processes per second, RAPL watts, iGPU busy share,
NVIDIA runtime-PM state. Before, Firefox used 0.8 cores for a clear day
sky and 1.1 cores in heavy rain + dense fog + moon (iGPU 50–95 % busy,
package ~20–28 W); Chromium 0.45 / 0.69 cores.

Decisions:

- **Rate by content.** `Module.fps` says how fast each module's current
  content is: `FPS_FAST` 30 while rain, snow, splashes or drips fall, for
  a stun, fresh blood and the heartbeat wash, and for rare sky events
  (shooting star, lightning-lit clouds, sun moments, darkness bleeds);
  `FPS_SLOW` 12 for the drifting sky, clouds, moon, stars, fog and the
  floating z z Z; `FPS_BURST` 60 only while a lightning strike flickers.
  The loop runs at the fastest busy module (≥ 12); between its frames it
  waits on a timer, not on every animation frame.
- **Caches.** A module slower than the loop draws into its own pair of
  cache canvases at its own rate, and the engine copies them onto the
  canvases every loop frame (`source-over` is associative, so the result
  is the same as drawing in place). A cache layer that nothing was drawn
  on is not copied (the engine wraps the cache contexts' draw calls).
- **Resolution.** The canvases are always at ratio 1 (`CANVAS_RATIO`);
  the adaptive drop is gone. On the owner's ratio-2 screen rain, stars
  and snow looked the same in side-by-side shots; it is a quarter of the
  pixels. Fog (`Module.scale` 0.5) always draws through a half-resolution
  cache: soft banks drifting at 2–13 px/s.
- **Focus.** Without window focus the loop runs at `FPS_SLOW`; a hidden
  page still pauses.
- The cloud deck rebuilds a fixed share of rows per frame, so at 12 fps
  its key frames are ~4.7 s apart instead of ~0.9 s (the drift speed is
  unchanged). Accepted; the day sky is reworked next (owner item 1) and
  should stay a cheap, mostly static image.

Results, before → after (medians of 2 rounds, ms of CPU per second over
all browser processes; 1000 = one core):

| | Chromium calm | Chromium heavy | Firefox calm | Firefox heavy |
|---|---|---|---|---|
| CPU ms/s | 452 → 183 | 691 → 491 | 800 → 298 | 1146 → 665 |
| Worker fps | 60 → 12 | 60 → 30 | 60 → 12 | 36 → 30 |
| Worker ms/frame | 0.27 → 0.40 | 1.50 → 1.35 | 9.4 → 16.0 | 28.2 → 17.5 |
| iGPU busy % | 52 → 40 | 69 → 45 | 94 → 36 | 53 → 48 |
| RAPL package W | 7.8 → 6.7 | 8.1 → 7.7 | 20 → 16 | 28 → 18 |

(Off: ~30 ms/s in both. RAPL is the whole machine and noisy; another
agent's browsers ran during the Chromium rounds.) Firefox calm still costs
~16 ms per frame: the day sky draws several full-screen layers in
software; at 12 fps that is 0.2 cores.

NVIDIA dGPU: watched with inotify on `/dev/nvidia*` and the runtime
status while launching the system Firefox 157 (own profile, the owner's
environment, which pins `__EGL_VENDOR_LIBRARY_FILENAMES` to Mesa) with the
effects off, on (heavy) and on `about:blank`: no Firefox process ever
opened an NVIDIA device or mapped an NVIDIA library. Every wake-up
observed was a Chromium GPU process opening `/dev/nvidiactl` at its
start (Playwright's Chromium and headless shell, from this session's and
another agent's test runs; it loads `libGLX_nvidia` while probing GPUs),
whatever the page. So the effects do not wake the dGPU in Firefox; the
heat was CPU (software canvas) and iGPU (compositing two full-screen
canvases at 60 fps). Context options were not changed: Firefox's worker
canvases already draw on the CPU, and `willReadFrequently` in Chromium
would move the raster into the worker and add a texture upload per frame.

## Consequences

- Settings gain a `weather` section (default off).
- Browsers without worker OffscreenCanvas get no effects.
