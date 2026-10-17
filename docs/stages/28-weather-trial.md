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
   pale, faint disc. Without the moon at night a starry sky (reaching
   lower on the right) with shooting stars, which pass behind the frames
   and make the lines they pass glint. Sunrise and sunset (`Event.Sun`)
   send rays across the screen; the frame lines light up and a glint runs
   along them with the ray front. Lightning lights every frame's lines.
5. `sleep` (floating z z Z), getting stunned, and (carefully) being
   incapacitated or dying (blood and a red heartbeat wash).
6. Darkness: walk into a room with magical darkness (its description
   says "A deep, impenetrable darkness lingers here."): after ~3 s a red
   bleed from the top and corners, then a dark red sky that stays while you
   are in darkened rooms; leaving gives a brief lightening. Ordinary dark
   rooms (caves, moonless nights, light `o`) give nothing now.
   `Event.Darkness` start / grow still bleed, shrink / end lift.
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
`'sun.set'`, `'darkness.start'`, `'birds'`, `'glimpse'`, `'shoot'`, …);
`__weather.jump({ magic: true })` pins magical darkness, `{ moonU: 0.3 }`
the moon's place (0 rising … 1 setting); `await __weather.stats()` shows the
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
