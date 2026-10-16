# Stage 28 — Weather effects (trial)

Owner request 2026-10-16, after four rounds of prototypes
(`notes/research/weather-atelier/`, `notes/research/weather-world/`, live
demo https://claude.ai/artifact/5bQ8wjratKitNufUn6tZ8j): decorative weather
and body effects over the whole client, driven by GMCP. **A trial:** it is
built on branch `weather-trial` and may be dropped entirely. Everything
stays isolated so that backing out is deleting a module and its hooks.
The owner chose to run the thin pane frames as part of the same trial.
ADR 0091.

## Plan

### A. Thin pane frames

Replace the quadrant-glyph frame (`▛▀▜ ▌▐ ▙▄▟`, ADR 0010) with a thin
frame of equal thickness on all four sides, with a slight bevel (light
top/left edge, dark bottom/right edge) for a hint of 3D. It still sits
on the cell grid: drawn in the middle of the outer frame cells, so pane
sizes, layout, script panes and the pane API do not change. That leaves
half a frame cell of gap between neighbouring panes. The label stays as
text in the top row. Frame colours still per pane (pane theme).

### B. Weather engine

- `src/weather/`: one module, imported lazily only when the feature is on.
- Two full-client canvases with `pointer-events: none`: *back* (behind
  text and panes, seen through pane interiors) and *front* (above
  everything). The prompt and input rows and the far left are masked.
- Rendering runs in a Web Worker on `OffscreenCanvas`
  (`transferControlToOffscreen`). The main thread only posts small
  messages on change: GMCP values, events, pane rectangles and text-line
  rows on resize/layout change, theme colours. No per-frame work on the
  main thread. Fallback without OffscreenCanvas in workers: effects off.
- Port of the v4 prototype modules: sky, weather (rain, drips, snow,
  wind, lightning), fog, body. Same look, same signal mapping (ADR 0091).
- Colours adapt to the client background (dark, mid, light).
- Low frame rate caps; pause when the tab is hidden; budget ≤ 1 ms
  average per frame in the worker.

### C. Signals

- `Char.Vitals`: `weather` (null = indoors), `fog`, `light` (`o` only),
  `position`.
- `Event.Sun`, `Event.Moon`, `Event.Darkness`.
- Moon phase from the almanac (`src/gmcp/clock.ts` / `gametime.ts`).
- Lightning: GMCP has none. Use MUME's XML `<weather>` tag: a weather
  message mentioning lightning fires a strike. To verify live (the log
  export drops tags); fallback to a narrow text match if the tag is not
  there.

### D. Options → Weather effects

Master switch (default off) and categories: Sky, Precipitation, Lightning,
Fog, Darkness, Body. Changes apply at once. Off unloads the worker.

### E. Latency proof

`bench/browser-bench.ts` (or a sibling) with effects off vs. on in heavy
rain + fog: text-to-screen and key-to-send latency must not move.

## Tasks

- [x] A. Thin frames (all framed panes, script panes, phone layout);
  unit/e2e updated
- [x] B. Worker engine, canvases, masking, geometry feed, theme colours
- [x] B. Port sky, weather, fog, body from the prototype
- [x] C. Signal bridge incl. XML weather tag; unit tests
- [x] D. Options page and settings (with migration), defaults off
- [x] E. Latency bench before/after (`bench/weather-bench.ts`,
  `bench/results/weather.md`); fixed the GPU-thread stalls it found
- [ ] Screenshots on black, dark-grey and light backgrounds
- [x] ADR 0091, this file, progress table

## Test guide

**Setup.** Check out branch `weather-trial`, run `npm run dev` and open
the printed address (`http://localhost:5173/`). Enter MUME as usual.

**Turn it on.** ESC → Options → Weather effects (last in the list) → `[X] Weather effects`.
The effects start at once; turning the switch off removes them at once
(nothing of the engine stays loaded). The six categories below the switch
(Sky, Precipitation, Lightning, Fog, Darkness, Body) fade their part in or
out live; the line under the menu explains the highlighted row. The
setting is saved; it is off by default everywhere, phones included.

**What to try in MUME.**

1. Walk outdoors, then into a building: the sky (sun glow, clouds, moon,
   stars) is outdoors only. Weather, fog and light changes wait about 3 s
   before they show, so running through rooms does not flicker. By day a
   clear sky is a plain light-blue gradient with a soft sun glow at the top
   right; clouds come only with weather `~` and wetter. Moving or docking
   panes leaves the sky as it is.
2. Rain and snow areas: light rain (`'`) and heavy rain (`"`) with drips
   along the pane edges; snow (`*`) that falls in from above, builds up
   over half a minute and gusts now and then.
3. Fog (`-` light, `=` dense) drifting low over the screen. It grows in
   slowly (about 20 s from nothing to light fog, 20 s more to dense) and
   thins out at the same pace.
4. Night: with the moon up a big moon in the almanac's phase crosses the
   sky slowly and smoothly, whatever the text does; without it a starry sky with shooting stars. Sunrise and sunset
   (`Event.Sun`) send rays across the screen.
5. `sleep` (floating z z Z), getting stunned, and (carefully) being
   incapacitated or dying (blood and a red heartbeat wash).
6. Darkness: walk into a dark room (light `o` in the prompt, indoors or
   out, e.g. a cave or a magical darkness): after ~3 s a red bleed from the
   top and corners, then a dark red sky that stays as long as the room is
   dark; leaving it gives a brief lightening. `Event.Darkness` start / grow
   also bleed. Note: every dark room counts (caves, moonless nights).
7. Lightning: the Redhorn Pass room with "A bright streak of lightning
   flashes over the … mountains." should strike a bolt each time that
   line appears. **Please check** that it does: the client looks for
   MUME's XML `<weather>` tag on that line first and falls back to the
   exact sentence; the tag has not been seen live yet.
8. Options → Appearance: change the background colour (black, dark grey,
   a light one). The effects should follow at once and stay discreet.

**Forcing states (dev server only).** `?weather` in the URL turns the
effects on and exposes `window.__weather` in the console:
`__weather.jump({ weather: '"', fog: '=', clock: 'night', moonUp: true })`
pins values (the game's are ignored for those keys) until
`__weather.unpin()`; `__weather.set({...})` sets raw values with the 3 s
delay; `__weather.emit('strike')` (also `'gust'`, `'sun.rise'`,
`'sun.set'`, `'darkness.start'`, …); `await __weather.stats()` shows the
worker's frame times; `__weather.stop()` turns the option off.

**Feedback wanted.** Is it discreet enough while playing (text always
readable, nothing distracting during fights)? Which effects to keep, tone
down or drop? Does lightning fire in the Redhorn Pass room? Any stutter
in typing or scrolling with the effects on (the bench says no; your
machine is the real test, especially in Firefox)? Keep the trial or drop
it?

## Handoff (end of session 2026-10-16)

State: built and committed on branch `weather-trial` (not merged, not
released). The owner will test and keep improving it in new sessions;
some parts they like, others less. Collect their feedback under
"Owner feedback" before changing things.

Where things live:

- `src/weather/` (main thread): `hook.ts` (the single app hook,
  `installWeather`), `controller.ts` (lazy chunk: engine + bridge),
  `index.ts` (`createWeather` API, canvases, layering), `signals.ts`
  (GMCP / almanac / lightning-line bridge), `director.ts` (dwell 3 s, eased
  mix, sky selection), `geometry.ts` (pane rects, text rows, diffing),
  `palette.ts` (colours from the theme background), `protocol.ts`
  (worker messages), `dev.ts` (`?weather`, `window.__weather`),
  `support.ts`, `weather.css`.
- `src/weather/worker/`: `engine.ts` (frame loop, masking, rates and
  caches), `sky.ts`, `weather.ts` (rain, drips, snow, gusts,
  lightning), `fog.ts`, `body.ts`, `env.ts`.
- Options page: `src/chrome/frames/options-weather.tsx` (last in the
  Options hub); settings `weather` section (`migrateWeather`).
- Frames: `src/panes/frame.ts` (`frameGeometry`), `src/panes/pane.ts`,
  `src/layout/layout.css`.
- Tests: `tests/unit/weather.test.ts`, `tests/unit/weather-signals.test.ts`,
  `tests/e2e/weather.spec.ts`. Bench: `bench/weather-bench.ts`,
  `bench/results/weather.md`.
- Prototype (the visual reference, approved round by round):
  `notes/research/weather-world/` (on main too); demo artifact
  https://claude.ai/artifact/5bQ8wjratKitNufUn6tZ8j. Earlier experiments:
  `notes/research/weather-atelier/`.

Rules learned (ADR 0091): no many-subpath paths or clips on the GPU
canvases (Skia software path masks stalled the GPU thread: text p95 went
83 ms); batch rect fills, use sprites made once on CPU canvases. Every
change: rerun `node bench/weather-bench.ts --rounds 3` and compare with
`bench/results/weather.md`.

Open:

- XML `<weather>` tag on the lightning line unverified live (fallback:
  the exact Redhorn Pass sentence).
- Firefox draws the worker canvas on the CPU (headless ~45 ms/frame);
  check in the owner's Firefox.
- Moon and stars over a full output show only between text lines; the
  sky horizon sits at least 30 % down. Blood and the strike glow can lie
  over text.
- The pane label tab stays opaque; z z Z falls back to the system
  monospace font in the worker.
- Frames: the 2 px line in the default dim border colour is subtle on
  black panes; may want brighter.
- Screenshots on three backgrounds: engine shots exist (scratchpad, lost
  on reboot); not kept in the repo.
- e2e: three specs flaky under parallel load (pass alone), as before.

## Owner feedback

### 2026-10-16 — first test of the branch (to address next session)

1. **Day sky.** The light sky with thin cloud streaks meant to say "day"
   looks blurry; the owner no longer wants clouds always visible by day.
   Wanted: something simpler, a lighter gradient toward a light sky
   colour in which you can sense the sun.
   - **Done (2026-10-17):** no cloud streaks any more (day or night); a plain
     gradient toward a light sky blue with a soft warm glow where the sun is
     (top right); clouds only with weather `~` and wetter, a bit fainter than
     before. Drawn once into a cached image and copied; a settled day sky
     runs at 3 frames per second. ADR 0091 "Sky, darkness, fog, text".
2. **Frames.** The borders do not look sharp and seem buggy. With two
   docked columns on the right, all borders disappeared. Docking and
   creating more columns felt less smooth than before.
   - **Done (2026-10-17):** one-colour line (the bevel's dark side vanished
     on black), every edge on a whole device pixel of the page, the label
     breaks the line with no box behind it, no sheen/glint drawn over lines
     with weather on. "All borders disappeared" was the stale dev server
     (main's CSS with the new pane code); not reproducible on a fresh one.
     The worker no longer rebuilds its sprites on every step of a drag
     (250 ms settle). ADR 0091 "Frames" and "Engine" notes 2026-10-17.
3. **Transparency.** Docked panes get a transparent background (weather
   shows through), floating panes do not. Wanted: all panes see-through.
   - **Done (2026-10-17):** floating panes are see-through too: a mid canvas
     under them gets the pane's fill plus a copy of the weather, so game text
     stays hidden; a float being moved or resized is opaque for ~0.1 s until
     the engine has painted its new place; two overlapping floats stay
     opaque. ADR 0091 "Engine" note 2026-10-17.
4. **Heat.** The laptop gets noticeably warmer with weather on; the
   discrete GPU seems to wake up (it normally sleeps).
   - [x] Done (2026-10-17, ADR 0091 "Power"): effects run at the rate of
     their content (30 fps while rain/snow falls, 12 fps for sky, fog,
     moon; 60 only during a lightning strike; 12 without window focus),
     slow parts cached, fog at half resolution, canvases at ratio 1.
     Firefox CPU: clear day sky 0.80 → 0.30 cores, heavy rain + fog +
     moon 1.15 → 0.67 cores; Chromium 0.45 → 0.18 and 0.69 → 0.49.
     Firefox itself never touched the NVIDIA GPU in tests; the wake-ups
     seen here came from Chromium GPU processes (test browsers) at start.
     To check: `cat /sys/bus/pci/devices/0000:01:00.0/power/runtime_status`
     with only Firefox running, and whether the laptop stays cooler.
5. **Moon jumps.** The moon sometimes jumps around, apparently avoiding
   scrolling text. It should drift smoothly (and a bit slower), never
   jump.
   - **Done (2026-10-17):** cause verified: the moon's path and visibility
     followed the 2.5 s sample of the text lines (and the comm pane's box);
     an `Event.Moon rise` after the almanac's rise also put a shown moon back
     on the horizon. Now its path depends only on the window size, it crosses
     in 800 s instead of 600, and a moon already up keeps its place.
6. **Moving panes.** Moving a pane makes the clouds vanish quickly and
   redraw. Clouds must not be affected by pane moves.
   - **Done (2026-10-17):** cause verified: every layout change rebuilt the
     cloud layer from empty (and moved the stars, which sat inside the
     panes). Now a pane move or dock change leaves the whole sky alone; only
     a real window size change rebuilds it, at once and in the same relative
     places.
7. **Darkness.** Entering rooms with darkness should give the darkness
   animation toward a red sky, and the sky should then stay red as long
   as the room is dark. This did not happen.
   - **Done (2026-10-17):** cause found: the darkness sky was outdoors only,
     and dark rooms are mostly indoors or underground (MUME sends `light`
     `o` with `weather` null there); the red bleed only came with
     `Event.Darkness`, which is about a darkness spell, not about entering a
     dark room. Now any room with `light` `o` (after the 3 s settle) plays the
     bleed toward a dark red sky, which stays while the room is dark;
     leaving plays the brief lightening. Note: `o` is every dark room (caves,
     moonless nights outdoors too); GMCP does not say "magical".
8. **Fog fade.** Fog should fade in much more slowly and grow gradually;
   the same when it goes away.
   - **Done (2026-10-17):** fog now changes at a constant pace: from none to
     light, light to dense, and back, 20 s each (none to dense 40 s).
9. **Text backgrounds near the top.** Text near the top sometimes gets a
   visible, delayed adjustment of its background colour (presumably to
   stand out against light clouds). The owner dislikes it: better that
   text is harder to read at the very top than to adjust the background
   of single lines.
   - **Done (2026-10-17):** the per-line protection is gone, and with it the
     main thread's text-line sampling every 2.5 s (nothing follows the text
     any more: lightning, z z Z and blood placement included).

