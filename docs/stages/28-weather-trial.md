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
- [x] `#weather demo` with its caption box; `?weather` after login (item 33)
- [x] ADR 0091, this file, progress table

## Test guide

**Setup.** Check out branch `weather-trial`, run `npm run dev` and open
the printed address (`http://localhost:5173/`). Enter MUME as usual.

**Try first: the demo.** Type `#weather demo` in the input line (dev
server or a production build, logged in or offline). In about a minute and
a half it plays every effect: night with moon and stars, sunrise, the day
sky with birds, clouds, light and heavy rain, lightning, snow with a gust,
fog, going indoors and out, sleeping, stunned, dying and getting up,
sunset, rain and fog at night, darkness spreading and lifting. A small box
at the top left names each step, what to look at and the game signal that
drives it. Sun moments, the day/night change, clouds, fog and the build-up
of rain and snow run three times faster than in the game; `#weather demo
slow` plays them at the game's pace (about three minutes). `#weather stop`
ends it. Afterwards the effects follow the game again with the normal
transitions; if they were off, they are off again, and your categories are
as you left them.

**Turn it on.** ESC → Options → Weather effects (last in the list) → `[X] Weather effects`.
The effects start at once; turning the switch off removes them at once
(nothing of the engine stays loaded). The six categories below the switch
(Sky, Precipitation, Lightning, Fog, Darkness, Body) fade their part in or
out live; the line under the menu explains the highlighted row. The
setting is saved; it is off by default everywhere, phones included.

**What to try in MUME.**

1. Walk outdoors, then into a building: the sky (sun glow, clouds, moon,
   stars) is outdoors only. Weather, fog and light changes wait about 3 s
   before they show, so running through rooms does not flicker; then the
   whole sky fades out (going in) or in (going out) evenly over about 5 s.
   By day a clear sky is a plain light-blue gradient with a soft sun glow
   at the top right, kept dark along the left: it starts about 30 % in
   from the left edge, so the text at the top left stays on the background;
   clouds come only with weather `~` and wetter. Moving or docking
   panes leaves the sky as it is. By day the sky is a brighter, bluer
   gradient down to about a third above the bottom; now and then birds
   cross, rarely an insect darts, on clear days a few faint tufts drift,
   and every few minutes a few faint sun rays come and go from the top
   right. Walking from a clear into a cloudy area, the clouds come one by
   one over ~25 s, from the right; leaving, they thin out from the right.
2. Rain and snow areas: light rain (`'`) and heavy rain (`"`) with drips
   along the pane edges; snow (`*`) that falls in from above, builds up
   over half a minute and gusts now and then.
3. Fog (`-` light, `=` dense) drifting low over the screen. It grows in
   slowly (about 20 s from nothing to light fog, 20 s more to dense) and
   thins out at the same pace.
4. Moon and night: whenever the moon is up (`Event.Moon`, the almanac), a
   big moon in the almanac's phase follows one arc from below the left
   edge, high over the middle, to below the right edge over its ~12
   minutes up, at an even pace, whatever the text does; by day it is a
   pale, faint disc. Without the moon at night a starry sky (about half way
   down on the left, almost to the bottom on the right) with shooting
   stars, which pass behind the frames and make the lines they pass glint.
   Sunrise and sunset (`Event.Sun`) take about 25 s: a few thin rays cross
   the screen, the frame lines light up and a glint runs along them with
   the ray front. At sunset the blue day sky stays for about the first
   half and then turns slowly into the night sky as the rays fade; at
   sunrise the night stays first and the day comes slowly in the second
   half. Lightning lights every frame's lines.
5. `sleep` (floating z z Z), getting stunned, and (carefully) being
   incapacitated or dying (blood and a red heartbeat wash).
6. Darkness: only when someone's darkness spell spreads or fades
   (`Event.Darkness`): start / grow give a short red bleed from the top and
   corners, shrink / end a brief lightening. There is no red sky any more:
   walking into a darkened room ("A deep, impenetrable darkness lingers
   here.") or any dark room gives nothing by itself.
7. Lightning: the Redhorn Pass room with "A bright streak of lightning
   flashes over the … mountains." should strike a bolt each time that
   line appears. **Please check** that it does: the client looks for
   MUME's XML `<weather>` tag on that line first and falls back to the
   exact sentence; the tag has not been seen live yet.
8. Options → Appearance: change the background colour (black, dark grey,
   a light one). The effects should follow at once and stay discreet.

**Forcing states (dev server only).** `?weather` in the URL turns the
effects on and exposes `window.__weather` in the console once the cockpit
exists (at once with `?replay`; after Enter MUME from the start page), or
`await __wc.weather()` at any time after that:
`__weather.jump({ weather: '"', fog: '=', clock: 'night', moonUp: true })`
pins values (the game's are ignored for those keys) until
`__weather.unpin()`; `__weather.set({...})` sets raw values with the 3 s
delay; `__weather.emit('strike')` (also `'gust'`, `'sun.rise'`,
`'sun.set'`, `'darkness.start'`, `'darkness.end'`, `'birds'`, `'glimpse'`,
`'shoot'`, `'insect'`, …); `__weather.jump({ moonU: 0.3 })` pins the
moon's place (0 rising … 1 setting); `weather: null` means indoors (`' '`
is a clear sky outdoors); `__weather.demo()` / `__weather.demoStop()` are
`#weather demo` / `#weather stop`; `await __weather.stats()` shows the
worker's frame times; `__weather.stop()` turns the option off.

**Feedback wanted.** Is it discreet enough while playing (text always
readable, nothing distracting during fights)? Which effects to keep, tone
down or drop? Does lightning fire in the Redhorn Pass room? Any stutter
in typing or scrolling with the effects on (the bench says no; your
machine is the real test, especially in Firefox)? Keep the trial or drop
it?

## Handoff (end of session 2026-10-17)

State: on branch `weather-trial` (not merged, not released). Three owner
feedback rounds (items 1–32), the weather demo (item 33, `#weather demo`)
and the see-through Transparent map (item 34) are done. **Next session:
the owner brings new feedback, first on pane frames, titles and borders,
then on the weather effects**; record it under "Owner feedback" (new
subsection, numbered from 35) before changing things. Use `#weather demo`
to check effects visually. The owner's dev server must be
restarted after a branch switch (a running Vite served main's CSS once).

Where things live:

- `src/weather/` (main thread): `hook.ts` (the single app hook,
  `installWeather`), `controller.ts` (lazy chunk: engine + bridge),
  `index.ts` (`createWeather`, back/front canvases, one canvas per
  floating pane `floatLayers`), `signals.ts` (GMCP / almanac / lightning
  lines), `director.ts` (dwell 3 s, mix rates, sky selection, the in/out
  and day/night pace), `geometry.ts` (pane frame boxes incl. the title's gap, diffing),
  `palette.ts`, `protocol.ts`, `dev.ts` (`?weather`, `?weather=<json>`,
  `window.__weather`), `support.ts`, `weather.css`; the demo
  (`#weather demo`, its own lazy chunk): `demo-script.ts` (steps, timeline,
  command parsing), `demo.ts` (runner, caption box), `demo.css`.
- `src/weather/worker/`: `engine.ts` (frame loop, rates 60/30/12/3 fps,
  module caches, mask, float copies), `sky.ts` (sky, moon, stars, clouds,
  sun rays), `daylife.ts` (birds, insects, tufts, sun glimpses),
  `glint.ts` (glints on frame lines), `weather.ts` (rain, drips, snow,
  gusts, lightning), `fog.ts`, `body.ts`, `env.ts`.
- Options page: `src/chrome/frames/options-weather.tsx` (last in the
  Options hub); settings `weather` section (`migrateWeather`).
- Frames: `src/panes/frame.ts` (`frameGeometry`, `framePlate`,
  `frameRimPath`, `frameHolePath`, `frameSeams`, `frameStrips`),
  `src/panes/pane.ts` (`.wc-pane-blur`, `.wc-pane-rim`, `.wc-pane-frame`;
  the worker gets the nameplate as `Pane.plate`, along which only the rim's
  lip is lit), `src/layout/layout.css`, glass with weather in
  `src/weather/weather.css` (`data-weather-flat` in Firefox); map flush to
  the rim and cut round the plate: `MapPane.fitFrame`.
- Tests: `tests/unit/weather*.test.ts`, `tests/unit/panes.test.ts`,
  `tests/e2e/weather.spec.ts`, `tests/e2e/layout.spec.ts`. Benches:
  `bench/weather-bench.ts` (latency), `bench/weather-power.ts` (CPU/W,
  headed), results in `bench/results/`.
- Prototype: `notes/research/weather-world/`; demo artifact
  https://claude.ai/artifact/5bQ8wjratKitNufUn6tZ8j.

Rules learned (ADR 0091): no many-subpath paths or clips on the GPU
canvases; batch rect fills, sprites made once on CPU canvases. Firefox
draws the canvases on the CPU, so keep still scenes cached and slow.
Every change: rerun `node bench/weather-bench.ts --rounds 2` (latency)
and `bench/weather-power.ts` (CPU), compare with `bench/results/`. Use
your own `WC_E2E_PORT` / `WC_BENCH_PORT`, never the owner's 5173 server.

Open:

- XML `<weather>` tag on the lightning line and the XML around the
  darkness room line unverified live; no live `Event.Darkness` seen.
- z z Z falls back to the system monospace font in the worker.
- e2e: chromium "a drag shows its cursor on a shield" fails on main too
  (pre-existing); a few specs flaky under parallel load (pass alone).

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


### 2026-10-17 — second test (translated from the owner's Swedish)

Darkness:

10. The red sky only in a room with magical darkness, or in a zone the
    darkness has spread to (if that can be told apart technically). If a
    darkness room cannot be told apart from an ordinary night/dark room,
    show the red effect only on the `Event.Darkness` events.
    - **Done (2026-10-17):** it can be told apart, from the room text. A
      room with magical darkness prints "A deep, impenetrable darkness
      lingers here." (once "wavering", at its edge) right after the room
      name, on every entry and look, brief mode too; an ordinary dark room
      never does (one you cannot see is named "Darkness"). The prompt's
      light cannot tell them apart (`o` in any dark room, `!` inside
      magical darkness with a lantern). Now only such rooms give the red
      sky (also the room where "The light decreases." was just seen, the
      spell taking hold): the bleed ~3 s after entering, the red sky while
      you stay in darkened rooms, the lift on leaving; ordinary dark rooms
      and nights do nothing. `Event.Darkness` start/grow and shrink/end
      still play the bleed and the lift. Verified in the owner's logs;
      the XML tag around the line and `Event.Darkness` itself are not seen
      live yet. ADR 0091 "Sky, moon, darkness, glints".

Moon:

11. The moon vanished just because it became day. The moon is probably up
    by day too; then show it much fainter but visible. `Event.Moon`
    rise/set should decide when it is up. Rising: it climbs from below and
    comes in from the side of the screen; setting: it sinks and leaves on
    the other side. Even pace, no (big) jumps.
    - **Done (2026-10-17):** the moon is up whenever `Event.Moon` / the
      almanac say so, day or night; by day a pale disc of only its lit part
      at about a quarter of its night strength. It runs on one arc from
      below the left edge, high in the middle, to below the right edge, at
      an even pace over its 720 s up (game pace); the almanac gives its
      place on load and at a clock sync (a disagreement glides, never
      jumps); low down it is fainter (behind the text).

Panes and frames:

12. Hovering a framed pane: the close "x" has an opaque background (a
    black square). Make it transparent.
    - **Done (2026-10-17):** no background; the cross has the title's size
      and colour and sits just under the top line; the click box is three
      cells wide as before.
13. Two overlapping floating panes lose the see-through effect on both.
    Keep it.
    - **Done (2026-10-17):** each floating pane has its own weather canvas
      (inside the pane, so the upper one covers the lower one's text); both
      stay see-through. ADR 0091 "Engine".
14. Frame line 1 px thicker; not one flat colour: slightly 3D, glossy or
    glass-like.
    - **Done (2026-10-17):** 3 px at the default size (was 2), a small glass
      tube: edge band, core with the most contrast, edge band, the same on
      all four sides; checked on black, #2a2a2e and a light page.
15. The gap between the frames of two horizontally adjacent panes about
    1–2 px smaller than today; then the vertical gap the same as the
    horizontal one.
    - **Done (2026-10-17):** the line now sits the same few px in from
      every pane edge: beside each other 8 → 6 px, above each other
      17 → 6 px (default size, ratio 1). Layout and pane sizes unchanged.
16. Pane title: smaller font, moved up a little, and the frame line runs
    under the title instead of breaking for it.
    - **Done (2026-10-17):** 0.82 em; the top line winds under the title: it
      steps down before it, runs along under the letters (its lower edge on
      the first content row, so no content is covered) and steps back up
      after it, the same glass line with square bends. The title sits in that
      notch on the pane's own background, clear of the line (about 1 px
      above the floor, 2 px under the pane's top edge at the default size).
17. No gap between the map and its frame: the map sits flush against the
    frame.
    - **Done (2026-10-17):** the map fills its frame up to the line on every
      side; around the title's notch it stops at the line too.
18. Moving and dropping a pane: it first gets a background colour, then
    turns see-through a moment later. It should be see-through at once.
    - **Done (2026-10-17):** see-through at once and while it moves: its
      weather canvas moves with it and is opaque underneath; the weather in
      it catches up at the next frame.
19. At sunrise/sunset, when the rays hit a pane title, a rectangle behind
    the title shows. The title must look like text on a transparent
    background.
    - **Done (2026-10-17):** the box was the label's gap in the line: there
      the sunrise glint along the pane top (a lit band) and the step between
      the brighter rays outside a pane and the weaker ones inside it showed
      under the title. Now the title sits in a notch of the line on the
      pane's own background. The glint is still drawn straight along the top
      over the notch; the engine gets the notch (`PaneGeom.notch`) so the sky
      rework (items 20–22) can follow the line there.

Effects on frames:

20. Owner likes that the frames glint in the sunrise/sunset rays; make it
    even better, and do the same for shooting stars, lightning or other
    events.
    - **Done (2026-10-17):** glints are brief, sharp stretches of the line
      itself (no halo). Sunrise/sunset: the lit top and sunward side line
      plus a bright glint with a small sparkle running along each top and
      side line where the ray front crosses it. Shooting star: the line it
      passes near glints and the glint runs on with it. Lightning: every
      frame's lines light up (the ones near the bolt most). Day sun
      glimpses: a faint glint where a ray crosses a top line. The moon's
      light on nearby top lines is a sharp line glint now.

Sky:

21. Dislikes the sky's gradient at the left edge that darkens it there.
    - **Done (2026-10-17):** the mask's fade along the far left (meant to
      keep the first columns of text clear) is gone.
22. Day sky: visible over much more of the screen (a soft start about
    30 % from the bottom), lighter and more "bright sky" at the top, more
    saturated sky blue (less grey) for more day/night contrast. Add very
    subtle flying birds (some large, some small), maybe an insect, wind,
    and very discreet small cloud tufts (few, small, almost blending into
    the sky). A subtle glimpse of the sun or small rays now and then (much
    more discreet than sunrise/sunset), touching the frames they hit. The
    problem today: it does not feel like being outdoors in daytime.
    - **Done (2026-10-17):** a bright, saturated sky blue that stays strong
      over the top and fades softly down to ~20–30 % above the bottom (on
      paper a clear pale blue). Now and then (every 1–3 min) birds cross:
      a loose V or a lone gull near, or a few small far-off ones that fade
      into the distance, flapping in bursts and gliding; rarely an insect
      darts for a few seconds; on a clear day four small soft tufts drift
      slowly with the wind; every 2–4 min a sun glimpse: a few faint rays
      from the top right for ~12 s, glinting faintly on the frame lines they
      cross. The still day sky stays at 3 fps; birds ask for 10 fps while
      they fly, an insect or a glimpse 12.
23. Walking in/out of cloudy rooms switches to the cloud sky too fast.
    Find a better way in/out (e.g. not all clouds fading at once, or a
    slightly different cloud animation). The owner likes the clouds as
    they are and does not want too distinct cloud structures.
    - **Done (2026-10-17):** the clouds are the same, but the cover now
      changes at a slow constant pace (clear → `~` in ~24 s, and back), and
      each cloud has its own arrival: they show one by one, from the right
      (where the wind brings them) on the way in; on the way out the right
      side clears first and the rest drift off to the left. Before, a cover
      change of more than 0.12 rebuilt the whole deck at once.
24. Shooting stars may pass behind the pane frames.
    - **Done (2026-10-17):** they were already on the back layer (behind
      the frames, seen through the panes); now the frame lines they pass
      glint. A `shoot` dev event sends one at once.
25. The starry sky may reach a bit further down on the right part of the
    screen.
    - **Done (2026-10-17):** the star field reaches 45 % down on the left
      and 62 % on the right.

### 2026-10-17 — third test (to address next session; translated)

26. **Darkness, again.** The current trigger is wrong: magical darkness
    is a spell someone casts (a special case). Give an effect only on the
    `Event.Darkness` events (when it grows or goes away) and otherwise no
    red sky at all (drop the room-line trigger and the steady red sky).
    - **Done (2026-10-17):** the room text ("A deep, … darkness lingers
      here.", "The light decreases.") no longer does anything, and the red
      darkness sky is gone. `Event.Darkness` start / grow play the red bleed,
      shrink / end the brief lightening, indoors and out; nothing stays red.
      The dev pin `jump({ magic: true })` is gone; `emit('darkness.start')`
      shows the bleed.
27. **Indoors/outdoors fades.** Going indoors (the blue sky disappears)
    and out again is far too abrupt/choppy. Make it much smoother.
    - **Done (2026-10-17):** after the 3 s settle the whole sky (gradient,
      clouds, stars, moon, birds) fades out or in as one, evenly over about
      5 s with soft ends (before: ~2 s, front-loaded, and the cached sky was
      redrawn only a few times a second, which stepped). The fade runs at
      30 frames per second, then the engine drops back to 3 (a still day
      sky) or idles indoors; measured in Chromium and Firefox. Indoors the
      sky keeps its clouds and wetness, so it comes back as it was.
28. **Top-left readability.** Text at the top left is hard to read. Keep
    the top left dark: the blue sky starts about 30 % in from the left,
    a left-to-right gradient from black to the sky.
    - **Done (2026-10-17):** the day sky fades in from the left edge (the
      page background there) to full at about a third of the width; with
      the fade toward the bottom the top-left corner stays the background
      on black, dark grey and light pages alike. The night sky and stars are
      unchanged (dark already, they did not hurt readability in the shots).
29. **Sunset/sunrise timing.** At sunset the blue sky should not go until
    the sunset animation is nearly over; the whole thing should take about
    2–3 times as long as now, with a much softer change from the blue day
    sky to the night sky. The same at the end of the night: slower
    sunrise, softer change to day.
    - **Done (2026-10-17):** sunset 26 s (was 10), sunrise 24 s (was 9).
      The day sky stays for the first 11 s of a sunset, lightly tinted, and
      then turns into the night sky over 12 s while the rays fade, so it is
      night as the sunset ends. A sunrise tints the night first; the day
      comes over the same 12 s in its second half.
30. **Sunrise/sunset rays more discreet:** thinner rays, more sparing.
    - **Done (2026-10-17):** 8 rays instead of 15, about a third as wide,
      fainter, and a fainter band where the ray front passes.
31. **Stars lower.** About 10 % further down in general, and further still
    on the right (down to about 10 % from the bottom right).
    - **Done (2026-10-17):** the star field reaches 55 % down on the left
      (was 45 %) and 90 % on the right (was 62 %), as dense as before.
32. **Title notch out.** The line winding under the title does not look
    good. Bring back the line ending left and right of the title (a gap,
    as before), keeping the title transparent (no box).
    - **Done (2026-10-17):** the top line is straight again and ends about
      half a space before the title and resumes the same distance after it
      (square cut ends, closed by the line's edge band like the corners).
      The title (0.82 em) sits centred in the gap, across the line's
      height, with nothing behind it: the page, sky or weather shows
      around the letters as outside the frame, on a tinted pane too. The
      map fills its frame up to the line again. Frame glints, lightning on
      the frames, snow on pane tops and the sunrise/sunset light on pane
      tops leave the gap alone (no lit band or brightness step behind the
      title).

### 2026-10-17 — demo request (translated)

33. **A demo sequence.** The owner is fairly happy, but checking every
    effect by running around in the game looking for events is too
    cumbersome. Wanted: a test sequence of about 60 seconds that goes
    through every phenomenon: e.g. night for a few seconds, the sun rises,
    day with every combination of what can happen, sunset, night with
    everything that can happen; when it is done it goes back to the normal
    mode that follows the game. It should be started with a command. While
    it runs, a small box at the top left describes what happens, in a
    visually nice way. (Also found: `?weather` in the URL left
    `__weather` undefined after logging in from the start page.)
    - **Done (2026-10-17):** `#weather demo` (input line, also in production
      builds) plays 21 steps in 1:36: night with moon, stars and a shooting
      star; sunrise; the clear day with birds, a sun glimpse and an insect;
      clouds; light rain; heavy rain; lightning; snow and a gust; fog light
      then dense; indoors; outdoors; sleeping; stunned; incapacitated then
      dying; getting up (the blood dries); sunset with a shooting star;
      rain and lightning at night; fog at night; darkness spreading; darkness
      lifting; back to the game. To fit, the slow paces (sun moments, the
      day/night change, cloud cover, fog, the rain and snow build-up, the
      blood drying) run 3× faster during the demo; `#weather demo slow`
      plays them at the game's pace (2:58). The box at the top left, in the
      panes' frame style, shows the step, what to look at, the game signal
      behind it, a progress bar with the time left and "#weather stop to
      end"; it fades between steps and is gone afterwards. The demo turns
      the effects on if they were off (and off again after), shows every
      category, then restores yours; switching the effects off ends it. At
      the end everything is unpinned and the effects follow the game with
      the normal transitions. `?weather` now applies once the cockpit is
      built, so `__weather` exists after login. ADR 0091 "Demo".
34. **Transparent map over the weather** (2026-10-17). When the Mapper
    option "Background colour" is set to Transparent, the areas of the map
    pane that have background colours should be transparent, so weather
    effects happening behind show through.
    - **Done (2026-10-17):** with Transparent the map's empty space is
      truly see-through: the sky, clouds, rain, fog and stars show between
      the rooms, in a docked and a floating map pane, the same as through
      any other pane. Rooms, walls, lines, marks, the character and text
      labels stay solid and readable. Rooms on the floors below are dimmed
      toward the pane's colour as before and stay solid (the weather shows
      only in the empty space); the faint rooms of the floors above stay
      faint over the weather. Lines are still dark on a light page and white
      on a dark one. Without weather, Transparent looks exactly as before
      (a tinted map pane keeps its tint behind the map); every other colour
      is unchanged. ADR 0085 "Addendum 2 — see-through Transparent".

### 2026-10-17 — fourth test (translated)

Panes and frames (the owner is not fully happy with the panes and their
frames):

35. **Frame mockup: ten alternative designs** of panes, frame lines and
    titles, covering every direction before one is chosen. Ideas to
    explore:
    1. *Better-looking frames:* thicker (about 2–4 px more) and/or built
       from several shades so the frame "pops": e.g. a fairly dark outer
       stroke, a much lighter second stroke, then the normal frame colour,
       and the two innermost strokes in their own shades (instead of only
       a dark outer and inner stroke as now).
    2. *Titles baked into the frame:* today the title floats in the air,
       and over an unlucky background it cannot be read. E.g. a backing
       that blends into the frame, or a text colour that always shows
       whatever lies behind, or text in two colours with a very thin black
       outline around each letter, or something else clever.
    3. *Light glass blur inside panes:* a very light blur, the weather
       behind should still be glimpsed.
    4. *Pane colour in the frame:* frames look about the same whatever
       colour a pane has; the frame should clearly take the colour chosen
       for the pane.
    - **Mockup (2026-10-17):** a Design canvas
      https://claude.ai/artifact/AA75geBq5rii2iJFydqc6H, sources in
      `notes/research/frame-mockup/` (`BRIEF.md`, one `.dc.html` per
      board). Board 00 is today's frame over a shared weather scene (day
      sky, sunrise, rain, a bright cloud behind one title, panes in Plain,
      Blue, Red, Green, Orange, a floating pane over the map); 01–10 change
      only the frame, title and pane glass: five-band ridge, nameplate,
      frosted glass rim, neon tube, title band, double rule, lit from
      above, corner brackets, soft elevation, engraved metal. Each derives
      its frame shades from the preset with `oklch(from --pane-border …)`
      (fixed lightness per band, chroma boosted, Plain stays grey) and uses
      a semi-transparent fill with `backdrop-filter` instead of today's
      screen blend.
    - **Owner choice (2026-10-17):** 03 "Frosted glass rim" for the frame
      and its in-pane glass, with a nameplate inspired by 02 worked into
      the frame so it seems to grow out of it. Three such variants added:
      11 "Glass swell plate" (rim and plate one moulded piece of glass,
      one clip path), 12 "Hanging glass plate" (02's shape in frosted
      glass, fillets), 13 "Inlaid crystal plate" (the rim splits around a
      chamfered crystal). Awaiting the owner's pick. Notes for the build:
      cap lightness/chroma so the light shades stay in sRGB (03's specular
      line shows a yellow fringe otherwise); measure `backdrop-filter` cost
      over the weather canvases before building.
    - **Owner (2026-10-17):** 12 is best, but the plate hangs down too far
      and is too dark: smaller title font so it hangs less, plate in about
      the rim's light mid colour. Three refinements of 12 added, all with
      the rim's glass as the plate and dark ink with a light lip: 14
      "Light hanging plate" (0.72 em, hangs 6 px below the rim; 12 hung
      9), 15 "Rim swell plate" (0.68 em, 4 px, tight), 16 "Glowing glass
      plate" (0.70 em, 5 px, a soft glow at the plate's centre). Awaiting
      the owner's pick.
    - **Owner choice (2026-10-17):** 14 "Light hanging plate" is the
      reference for the build. Two fixes: the title sits a little too low
      on the plate (move it up), and the plate looks greyish while the rim
      looks bluish: the plate must have the same colour as the rim.
    - **Done (2026-10-17):** design 14 is built into the app. Every framed
      pane has the frosted glass rim (6 px) in its own colour and the light
      nameplate hanging from it, joined by rounded fillets, with the title
      in dark engraved letters. Rim and plate are now one piece of the same
      glass, so the plate has exactly the rim's colour over any sky, and the
      title sits in the middle of the plate (checked at 1×, 2× and 3×).
      Inside the panes, light glass: the weather glimpsed through a slight
      blur. In Firefox the glass has no blur (it cost a third more CPU in
      heavy rain); it is a little denser instead and looks almost the same.
      With weather off the panes are opaque as before, and the rims a little
      denser so they do not look dull on black. Light page (Paper): pastel
      rims with softer dark edges. The map is cut around the plate; the
      sun's beams glint on the new rims and pass over the plate's top edge
      only, above the letters. Pane sizes, the text grid and the layout are
      unchanged. Not yet restyled: the `#weather demo` caption box. ADR
      0091 "Frames", addendum: glass rim and nameplate.

Weather:

36. **Blue sky off on its own.** There is no way to switch off the blue
    day sky other than switching the weather effects off altogether.
    - **Done (2026-10-17):** Options → Weather effects has a new row "Blue
      day sky" under Sky (on by default). Off: by day the page background
      shows where the blue sky and its warm sun glow were; clouds, rain,
      birds, tufts, sun glimpses, sunrise and sunset, the night sky, stars
      and moon all stay. At sunset the night sky fades in from the plain
      background as softly as it did from the blue, and at sunrise it fades
      out to it. Flipping the row fades the blue in or out over ~3 s. The
      demo shows the blue sky and puts your choice back at the end.
37. **Sun rays that make the frames glint where they hit.** The owner
    likes the frames glinting at sunrise and sunset, but it does not look
    like it happens where the rays hit them. Make the rays more
    concentrated, e.g. a few rays in the middle stronger and on a clearly
    defined path across the screen. Where those central rays hit a pane
    and its frame, that part of the frame glints, so the glint is seen to
    happen where the strongest rays hit (which depends on where the panes
    are on screen).
    - **Done (2026-10-17):** in a sunrise or sunset, three strong, clearly
      edged beams now run from the sun in the middle of the ray fan, in
      straight lines across the screen, and sweep slowly over the moment (a
      sunset from the top left starts steep and ends flat toward the upper
      right; a sunrise from the top right the other way round). The other
      rays are fainter than before. Where a beam crosses a frame line, that
      stretch of the line glints, about as wide as the beam, with a small
      sparkle where the beam enters the pane; where it leaves, only a trace.
      A pane no beam crosses gets just a faint lift of its top line; the old
      lit top and sun-side lines and the glint running with the ray front
      are gone. The beams are not blocked by panes (they go on behind them),
      only weaker inside a pane, like the rays. Which panes glint depends on
      where they are on the screen and where the beams are at that moment.
      Checked in `#weather demo` (Sunrise, Sunset) and with the `sun.rise` /
      `sun.set` dev events, on dark and light pages.
38. **Moon direction.** The game said "The moon disappears in the west."
    but our moon set on the right side of the screen. Swap the sides the
    moon rises and sets on.
    - **Done (2026-10-17):** the moon now comes up below the right edge
      (east), crosses high and goes down below the left edge (west), the same
      way as the sun. Its cool glow at night follows it, but stops about a
      third of the way in from the left as it sets, so the top-left corner
      stays dark; the moonlight on frame top lines follows it as before.
      Without a set event it waits just past the left edge.

### 2026-10-17 — fifth test, on the glass frames (translated)

39. **Title legibility, subtle.** The pane title is sometimes hard to
    read, mostly over a fully black background. Make the light pixels
    next to the letters (the light lip) not fully white, just a touch
    darker, and the title ink not fully black, just a touch lighter.
    Small differences only: changing too much loses the effect.
    - **Done (2026-10-17):** the ink is a touch lighter (oklch L .17 → .19:
      on the blue Character plate #07101c → #0a1421) and the light lip under
      the letters a touch darker (70 % → 60 % of the highlight: #bccbde →
      #aebed4 on the same plate). Still engraved; checked at 1× and 3× over a
      black page, weather on and off, together with the darker frames (44).
40. **Plate 1 px shorter under the text.** The nameplate can lose about
    1 px just below the text; it seems to fit, and the text will feel
    better centred vertically on the plate.
    - **Done (2026-10-17):** the plate ends 1 px higher; the letters stay
      exactly where they were, so there is now one row of plate under the lip
      as there is above the capitals. The rounded corners, the map's cut-out
      round the plate and what the weather knows of the plate follow it.
41. **Drips closer to the frame.** The drops running along the pane
    frames sit too far out. Move them closer to the frame so they really
    run along the edge instead of hanging in the air.
    - **Done (2026-10-17):** the drops running down the pane sides now hug
      the rim: the drop's middle is half a pixel outside the rim's outer edge
      (it was 2 px out, from the old thin line), so it sits on the rim's dark
      edge. They stop where the rim's lower corner rounds off, and the drops
      hanging under the corners moved in under the corner's flat part.
      Checked at 3× in heavy rain.
42. **Plate takes the dawn/dusk tint.** At dusk and dawn the frames shift
    colour a little to imitate the sunlight, but the area behind the
    nameplates does not. The plates read as part of the frame, so they
    should get the same colour shift.
    - **Done (2026-10-17):** the plate now takes the same warm (or rosy)
      light as the rim in a sunrise or sunset. It lay in the pane's "shadow",
      so it stayed cool beside the rim; now the shadow, the beams and the
      faint lift of the top rim treat the plate as part of the rim. At dawn
      on the blue Character pane rim and plate now differ by about 5 levels
      (were 18 in red). The letters get the same faint lift.
43. **Demo box without a pane frame.** The `#weather demo` caption box
    need not look like a pane: a plain grey area at the top left holding
    the text, no border. It is a debug tool, not something that needs
    pane dress.
    - **Done (2026-10-17):** the caption box is a plain grey area flush with
      the top left of the game pane: no frame, the title "Weather demo" and
      the step count on one top line, then the step, what to look at, the
      game signal, the progress bar and the time left as before. Dark grey on
      a dark page, light grey on Paper, opaque so game text does not show
      through.
44. **Darker frames.** The frames are generally too light grey now. Tone
    them down to a darker grey without otherwise changing the look.
    - **Done (2026-10-17):** the glass is darker (oklch L .66 → .59, its
      colour cap .115 → .105 so Teal stays a clean colour): Plain's rim over
      black 93 → 80 grey, Blue #3e5f89 → #345178, Orange #795624 → #68491c;
      with weather on and on Paper the rims darken by a similar step.
      Coloured panes keep their hue; the plates follow (it is one piece of
      glass), and the title's contrast on the plate goes from about 4.1:1 to
      3.6:1 over black, still clearly readable. Weather on and off, dark and
      Paper pages checked.

### 2026-10-17 — sixth test, on the glass frames (translated)

Screenshots from the owner: `images/4.png` (Timers, rounded corner and
plate edges), `images/5.png` (Character plate), `images/6.png` (Map search,
artifacts above the top rim) in the session scratchpad.

45. **Square outline at rounded corners.** With some effects the rounded
    corners get an angular outline next to them. Not very noticeable, but
    it should go.
    - **Done (2026-10-17):** the outline came from the weather's lights on
      the frame: the faint lift of the top rims at sunrise and sunset, the
      glints (sun beams, moon, shooting stars) and the lightning flash on the
      rims were drawn as square strips over the frame's box, so their square
      corner showed just outside the rounded corner; the sun's shadow behind
      a pane and its beams did the same at the lower corners. All of them
      now follow the rounded corners. Checked at 1× and 2× in sunrise,
      sunset, rain, lightning, moon and fog: the corners match the
      background around them (before, up to 10–40 levels lighter).
46. **Thin dark vertical lines beside the plate.** A thin dark vertical
    line crosses the rim just left and right of the nameplate. Barely
    perceptible, but it should be possible to remove.
    - **Done (2026-10-17):** it was the plate's small drop shadow: its blur
      also fell sideways onto the rim, a line one pixel wide either side of
      the plate (8 levels darker). The shadow now shows only under the
      plate's bottom edge; across the rim beside the plate the pixels are
      now even, at 1× and 2×, weather on and off.
47. **Title legibility, more (39 again).** No visible difference after
    item 39. Make the dark title ink less dark and the light lip under the
    letters less light, enough that it shows.
    - **Done (2026-10-17):** clearly softer both ways: the ink is lighter
      (oklch L .19 → .28: on the blue Character plate #0a1421 → #1f2a38,
      Plain #141414 → #292929) and the light lip under the letters dimmer
      (60 % → 42 % of the highlight: #abb9ce → #8fa1b9 over black). Still
      engraved. Contrast of ink against plate over black about 3.3:1 →
      2.6:1, over the day sky 6.2 → 4.9 (Character), on Paper 8.9 → 7.0;
      the lip against the plate 2.8 → 2.1 over black. Checked on Plain,
      Blue, Orange, Red and Green, over black, over the day sky and on
      Paper.
48. **Artifacts outside the frame.** Along the top edge above the rim,
    artifacts show outside the frame (a speckled band above the line).
    - **Done (2026-10-17):** that band was the snow dusting, which lay as a
      5 px speckled strip above each pane's top rim (and stayed a while
      after the snow). It now lies on the top rim itself, in its upper 4 px,
      inside the rounded corners, so nothing speckled is drawn above the
      frame. The rain drops running down the sides are unchanged (item 41).
49. **Glint across the whole plate.** When sun rays glint along a top line
    and pass the title, the glint does not cover the whole nameplate. It
    should.
    - **Done (2026-10-17):** a glint on a top rim now lights the whole
      nameplate it passes, the fillets and the rounded lower corners in the
      plate's own shape, as part of the rim (before, only the rim's top 2 px
      above the letters). The same for the lightning flash on the rims. The
      letters are lit with it while the glint passes; still no sparkle star
      over the title.

### 2026-10-17 — seventh test (translated)

Screenshot: `images/7.png` in the session scratchpad (a side rim over
black: the brightest stroke stands out).

50. **Transparent map as see-through as other panes.** The transparent
    areas of the map pane come out a little darker than other panes; they
    should have about the same transparency.
    - **Done (2026-10-17):** the map itself was not the cause: its empty space
      is truly clear. The map floats by default, and floating panes had a
      denser glass than docked ones (the pane colour at 72 % instead of 55 %,
      in Firefox 78 % instead of 64 %), so the floating map came out about
      40 % darker than the docked panes beside it. Floating panes now have
      exactly the docked panes' glass (the game text under them stays
      hidden). Measured over the same day sky: map empty space 13,23,34
      against the Timers pane's 22,38,57 before, 21,38,57 against 22,38,57
      now; the same in Firefox, on a Blue map and Timers, and on Paper.
      Docked maps already matched. Any other floating pane is now as
      see-through as a docked one too.
51. **Brightest frame strokes toned down.** The very lightest strokes in
    the frames are a touch too light, so the frames sting the eye a
    little. Tone them down so the lightest strokes/parts are not quite as
    light, keeping the look; the frame as a whole may need rebalancing
    for it.
    - **Done (2026-10-17):** the bright line along the top and left of each
      rim is clearly dimmer (Plain over black about 215 → 171 grey, beside the
      80 grey rim; Blue #ccd7e8 → #9badc4), the light line along the inner
      bottom/right edge and under the nameplate a little dimmer (about 155 →
      145), and the dark outer edge a touch softer, so the frame keeps its
      depth with less contrast. The rim's glass and the title's light lip are
      unchanged; the lip stays the softest light, under the nameplate's edge
      and the top line. Checked at 1× over black, over the day sky and on
      Paper.

### 2026-10-17 — eighth test (translated)

52. **Day sun glimpses more often and more visible.** On a clear blue
    day, the small sun streaks that come now and then have hardly ever
    been seen in play. Make them a little more prominent, and let them
    come and vary through the day: seen at least once a minute, sometimes
    a little and sometimes more, most around midday when the sun is
    strongest.
53. **Borderless pane shows edges in sunrise/sunset rays.** A pane
    without a frame (otherwise fully transparent) gets visible edges when
    the sunrise/sunset rays pass (screenshot `images/8.png` in the session
    scratchpad: a rectangle where the rays are weaker inside the pane).
    The owner adds: the same happens with lightning and during the
    day/night fade, so likely the same kind of problem.
