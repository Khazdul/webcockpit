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

**2026-10-17 (owner feedback 2):**

- Root causes. The bevel was the main "buggy" look: the dark bottom/right
  edge (`--pane-border` 30 % toward black, ~#1d1d1d) all but vanished on a
  black page, so frames looked open. With weather on, the rain's wet sheen
  (1 px rects along the top and sides) and a moving glint sprite were drawn
  over the line, and the label tab was an opaque box of the pane fill.
  "All borders disappeared" was not reproduced on a fresh server (two right
  columns, ratios 1–2, Chromium and Firefox, weather off and on): it matches
  the owner's stale dev server, which served main's `layout.css` (no border
  on `.wc-pane-frame`) with the new `pane.ts`.
- One colour: `--pane-border` 78 % mixed with white (the old lit edge) on
  all four sides. No bevel.
- No CSS border: the sides and the bottom are inset box shadows of the frame
  box, the top is two pieces (`::before`, `::after`, inset shadows too)
  either side of the label, so the label has no box behind it and the
  weather shows through the gap like the rest of the pane.
- `frameGeometry(box, cell w, cell h, dpr)` puts every edge on a whole device
  pixel of the page: the cockpit's origin (`PaneCell.ox/oy`, read once per
  relayout) plus the pane box, insets per side (`--frame-l/r/top/b`), the
  thickness `--frame-t`, the label gap `--frame-label-x/w`. Before, insets
  were whole device pixels relative to a pane at a fractional `col × cell-w`.
  Note: Playwright's emulated `deviceScaleFactor` in Chromium lays out at
  ratio 1 and scales, so lines look soft in its screenshots at 1.25/1.5
  either way; with a real scale factor (`--force-device-scale-factor`) both
  the old and the new frames are sharp in Chromium, as in Firefox.

**2026-10-17 (owner feedback 12, 14–17, 19; second test):**

- Thickness: the first thin frames' `max(2, round(cell-h·dpr / 9))` device
  px plus one CSS px (`round(dpr)` device px): 3 px at the default size
  (Hack 17, a 10 × 19 cell) and ratio 1, 4 device px at 1.25, 6 at 2.
- Look: a small glass tube, the same on all four sides: an edge band
  (`--frame-e`, a third of the line, ≥ 1 device px), a core, an edge band.
  Edges: `--pane-border` 80 % with `--term-fg`; core: 52 % with
  `--term-fg`, so the core has the most contrast with the page on every
  background (lighter on black and dark grey, darker on a light page) and
  no side fades out as the bevel's dark side did. Three inset spread box
  shadows of the frame box; no pseudo-elements.
- Gaps: the line is no longer centred in the outer cells; it is
  `frameInset = (cell-w − first line − 1.5) / 2` px in from every edge, the
  same on all four sides (still inside the outer cell ring; pane sizes, the
  content rectangle and the layout are unchanged). Measured at the default
  size, ratio 1 (Chromium and Firefox), outer edge to outer edge: beside
  each other 8 → 6 px, above each other 17 → 6 px; Firefox 1.25: 6.4 and
  6.4 (were 8 and 17.6), ratio 2: 6.5 and 6.5 (were 8 and 17).
- Title: 0.82 em, its box at the pane's top edge (the highest it can sit:
  the pane clips, and the gap above belongs to the neighbour's line), drawn
  over the unbroken top line (`z-index: 2`, also over a map that fills its
  frame), a step brighter than before (`--pane-border` 60 % with
  `--term-fg`) with a tight 1 px halo in the pane fill so the line does not
  cut the letters. With a 6 px gap there is no room for the letters above
  the line: it runs through their upper part. The label gap is gone
  everywhere (`--frame-label-w`, `PaneGeom.tab`, the snow dusting's skip).
- Close cross on a frame: no background (it was the pane fill from the line
  down, a black square over the line), the title's size, colour and halo;
  the click box stays three cells wide and a row high.
- Map: framed, its content element fills the frame up to the line's inner
  edge on every side (`MapPane.fitFrame`); the map canvas is that size
  (whole device px), not `cols × cell`. The title lies over its top edge.
- Rectangle behind the title at sunrise/sunset (item 19), seen in
  before/after shots: two edges met in the empty label gap. The sky's ray
  glint along each pane's top (`drawRaysFront`: a 5 px rect at alpha
  0.16·a and a 1.2 px rect at 0.6·a over the whole frame width, on the
  front layer) ran on through the gap as a lit band under the dim title,
  and the rays are weaker inside the frame box than outside it
  (`drawRaysBack` cuts each pane's shadow from the frame box), a step in
  brightness that the line hides everywhere but in the gap. With the line
  unbroken under the title both lie on the line. The glint itself (and that
  it is on the front layer, over the title) is left to the sky rework.

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

**2026-10-17 (owner feedback 2 and 3):**

- See-through floating panes. A third canvas, *mid* (`z-index: 9`, under
  `FLOAT_Z` = 10, over the game text and docked panes). Per floating pane,
  back to front, the worker fills the pane box (1 device px larger) with the
  terminal background, its frame box with the pane's own background, then
  copies the back layer's pixels there (`drawImage` of its own canvas, after
  the mask, before the docked pane backgrounds): three rect operations per
  float, no paths or clips. Main thread: each layout post carries a sequence
  number; the worker answers `painted` one frame after drawing it; only then
  `floatSee` (index.ts) sets `data-weather-see` on the floats, which drops
  their fill (weather.css). Every relayout (Cockpit.onLayout, synchronously,
  before it is painted) takes the mark off a float whose inline box changed,
  so game text never shows through a moving or resizing float; it is back
  after ~60–90 ms. Floats that overlap another float stay opaque (both): a
  see-through upper one would show the lower one's text. Without floats the
  mid canvas is hidden and 1 × 1 (a full-size one cost a 1.5 s GPU stall on
  the next page in the bench).
- Frame lines stay crisp: no wet sheen or glint along pane edges; rivulets
  run 2 px outside the side lines; the snow dusting lies on top of the top
  line and skips the label gap (`PaneGeom.tab`, from `--frame-label-*`).
  Beads still hang under the bottom line. The lightning rim light (a strike
  only) is unchanged.
- Smoother layout changes. Measured: a layout change costs the main thread
  the same with weather on and off and as on main (~5–10 ms of tasks,
  CDP; no rAF gaps or long tasks in Chromium or Firefox during a lane
  drag); `measureGeometry` takes 0.05–0.2 ms. The worker, though, rebuilt
  every module on each geometry post: 10–25 ms (sky star canvases 6–19 ms,
  rain/snow sprites 3–10 ms) and a reset of drips, splashes and rivulets,
  on every cell step of a drag. Now a pane-only change applies the canvas
  size, mask, pane fills and mid layer at once, and the modules' `resize`
  runs once the layout has been still for `RESIZE_SETTLE_MS` (250 ms); a
  canvas size change still rebuilds at once.

**2026-10-17 (owner feedback 13, 18): float canvases replace the mid layer.**

- The mid canvas could not keep two overlapping floats see-through: it lies
  under every float, so an upper see-through float showed the lower one's
  text. And a float that moved was opaque until the worker had painted its
  new place (60–90 ms, longer at the 3–12 fps rates of "Power").
- Now each shown floating pane holds its own canvas as its first child
  (`.wc-weather-float`, `floatLayers` in index.ts), the size of the pane,
  transferred to the worker (`float` / `floatGone` messages, keyed per
  element). The worker copies the back layer's pixels under the pane into
  it each frame (one `drawImage`, clipped to the canvas; no paths or clips).
  The canvas element's CSS background is the pane's old fill (terminal
  background, the tint inside the frame line), so the pane is opaque to the
  game text from the moment the canvas is in and moves with it in the same
  frame; the pane drops its own fill (`data-weather-see`) at once and keeps
  it off while it moves. Each canvas is inside its pane's stacking layer,
  so an upper float covers a lower one's text: overlapping floats stay
  see-through. A geometry post that moves or resizes a float, and a new
  float canvas, get a frame at the next animation frame whatever the rate
  (`frameNow`), so the stale weather copy lasts one frame.
- Gone: the mid canvas, the `painted` answer and the layout sequence
  number. Memory: a pane-sized canvas per float instead of a full-size one
  while any float is shown.

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

### Sky, darkness, fog, text (2026-10-17, owner feedback 1, 5–9)

Root causes found:

- **Moon jumps (5)** — the moon path's left end (`yL`) was the first text
  line's y from the 2.5 s line sample (`buildProtect`, unclamped there,
  clamped in `resize`), the right end hung on the comm pane's box, its fade
  on the output's right edge, and the text protection map erased 72 % of
  the sky (moon included) behind each line at the sampled places. A probe
  (moon tracked in screenshots, text streaming, text hidden) showed jumps of
  600–1200 px before and none after. Also, `Event.Moon rise` after the
  almanac's predicted rise reset a moon already shown at mid-sky to the
  horizon.
- **Clouds vanish on a pane move (6)** — the settled `resize` (250 ms after
  a layout change) ran the sky's `setupDeck`, which emptied both deck
  buffers, so the clouds faded out and were rebuilt over ~10 s; the stars
  were placed inside the pane boxes, so they jumped too. Measured: the top
  third's mean brightness 51 → 33 within 0.7 s of floating a pane before,
  unchanged (52.4 → 52.3) after.
- **No darkness (7)** — `evil` required outdoors (`weather !== null`), but a
  dark room is mostly indoors or underground: MUME sends `light: "o"`
  (Char.Vitals; values `*` sun, `!` lit, `)` moon, `o` dark) and
  `weather: null` there, and the sky gave nothing. The owner's logs show
  `o` prompts in tunnels ("Limestone Tunnel" → "Darkness", `o=`) and on a
  road in a lingering magical darkness by day (`o+`, "A deep, wavering
  darkness lingers here."). The bleed only ran on `Event.Darkness`, which
  is about a darkness spell's life (start / grow / shrink / end), not about
  entering a dark room. No raw GMCP log with `Event.Darkness` exists in the
  reference logs (the Cockpit run logs keep text only), so the event's
  timing stays unverified live.
- **Line backgrounds (9)** — the sky's protection map (soft blobs at the
  sampled line boxes, `destination-out` at 0.72 and 0.88) lagged the
  scrolling text by up to 2.5 s.

Decisions:

- **Signal mapping change:** `light` `o` gives the darkness sky indoors too
  (`mix.evil` no longer needs outdoors); everything else in the sky stays
  outdoors only. The sky watches the settled `light`: becoming `o` (after the
  3 s dwell) plays the red bleed, as `Event.Darkness start` does, and the red
  sky stays while the room is dark; leaving it plays the lift. `o` is every
  dark room (caves at any hour, moonless nights outdoors), not only magical
  darkness: GMCP does not tell them apart. The darkness sky is a clearer
  dark red (top `[72,8,14]`, horizon `[92,16,18]`, alpha 0.72 on dark).
- **Day sky (1):** no cirrus streaks (gone at night too); a plain gradient
  toward a light sky blue (top `[128,170,214]`, alpha 0.44 on dark; a pale
  blue at 0.34 on paper) with a soft warm sun glow (radial, alpha 0.36, at
  80 % of the width just above the top edge; at night the same glow is a
  cool lift toward the moon). `~` and wetter still bring the cloud deck,
  now at 0.62 opacity since nothing protects the text behind it. The sky is
  drawn once into a full-resolution cached canvas when its colours move
  (two gradient fills) and copied per frame; the darkness sky's breathing
  is the copy's alpha, not a redraw.
- **Still rate:** a module whose content does not move reports
  `FPS_STILL` (3); while every busy module is still and the director rests
  (no dwell pending, every mix value at its target, `Director.resting`),
  the loop runs at 3 fps; any message brings it back to 12 at once. A still
  module draws straight on the canvases even when the loop runs faster (one
  image copy, less than copying a full-size cache). The settled day sky is
  the case.
- **Relative sky (5, 6):** stars (upper 45 %, denser toward the top), the
  moon path (rises at 86 % of the width, 60 % down; sets at 10 %, behind the
  text horizon at 30 % down) and the clouds depend only on the canvas size.
  The sky's `resize` returns at once when the size and ratio are unchanged;
  a real size change rebuilds the deck in full at once (no empty sky) at the
  same relative places. A theme change keeps the moon, the cloud drift and
  the time. `Event.Moon rise` keeps a moon already shown; the crossing takes
  800 s at game pace (was 600).
- **Fog (8):** `mix.fog` moves at a constant `FOG_RATE` = 1/40 per second
  instead of easing (tau 0.9 s): none → light, light → dense and back each
  take 20 s, none → dense 40 s; the light and dense layers are smoothsteps
  of it, so it grows and thins gradually. Switching the Fog category off
  still fades at the normal rate.
- **No text tracking (9):** the line sampling is gone (`measureLines`, the
  2.5 s idle sample, `linesOnly` posts, `Geometry.lines`, `Module.lines`).
  Its other users: the lightning bolt no longer dims behind lines (it
  paints straight, a fraction of a second), ground strikes land in the right
  38 % of the output, the z z Z and blood spatters are placed by the panes
  and the output box only.

Measured (same session, old code from a worktree of `ca52995` right after
the new, `bench/weather-power.ts --scenes off,calm --rounds 2`, headed,
owner geometry; the owner's own Firefox was running, so the absolute
numbers are high): clear day sky, CPU of all browser processes per second
Firefox 230 → 121 ms (off: ~50–75), worker 11.5 fps × 17.1 ms → 3 fps ×
7.5 ms; Chromium 148 → 72 ms (off: ~30), 12 → 3 fps. Latency
(`bench/weather-bench.ts --rounds 2`, heavy scene): unchanged, text →
painted p95 Chromium 19.1 → 19.1 ms, Firefox 18.7 off / 18.1 on; Firefox's
rAF gaps with the effects on (p95 ~33 ms) were the same with the old code
under the same load. Chromium idle main thread with the effects on: 25.5 →
16.4 ms per 5 s, longest task 2.7 → 0.6 ms (no line sampling).
`bench/results/weather.md` is not rewritten (no meaningful change).

## Consequences

- Settings gain a `weather` section (default off).
- Browsers without worker OffscreenCanvas get no effects.
