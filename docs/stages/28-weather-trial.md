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
- [x] Screenshots on black, dark-grey and light backgrounds (covered by
  the per-item screenshots and the owner's own tests)
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
   right. Walking from a clear into a cloudy area, the clouds come from
   the right and cover most of the sky in ~5 s, then fill in more slowly;
   the sky's grey follows the clouds, and an overcast day stays a light
   grey day sky (items 94, 95); leaving, they thin out from the right over
   ~10 s.
2. Rain and snow areas: light rain (`'`) and heavy rain (`"`) with drips
   along the pane edges; snow (`*`) that is there at once across the
   screen (after the 3 s wait) and builds up
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
   After that line, 2–3 more bolts come at random over the next 30 s
   (none in the first 5 s) while you stay in rain or snow, in that room or
   the next; a room without rain or snow ends them at once (ADR 0094,
   item 90).
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

## Handoff (end of session 2026-10-18)

State: on branch `weather-trial` (not merged, not released). Ten owner
feedback rounds (items 1–57) are done, including the glass frames
(design 14, item 35). The owner is fairly happy with how it works now; the
small defects that remain are listed under "Known small defects" below,
to pick up later if wanted. **Next session: new-player defaults** (which
panes show and how they are arranged, the mapper's background colour, the
map tileset, weather effects on by default, and more; the owner brings the
list). **The session after: merge `weather-trial` to main** and review what
is needed before a release with all of this. The owner's dev server must
be restarted after a branch switch (a running Vite served main's CSS once).

Where things live:

- `src/weather/` (main thread): `hook.ts` (the single app hook,
  `installWeather`), `controller.ts` (lazy chunk: engine + bridge),
  `index.ts` (`createWeather`, back/front canvases; floats are
  see-through and what lies under them is clipped out, `floatHoles`), `signals.ts` (GMCP / almanac / lightning
  lines), `director.ts` (dwell 3 s, mix rates, sky selection, the in/out
  and day/night pace), `geometry.ts` (pane frame boxes incl. the nameplate, diffing, `cutRects`, `holeClip`),
  `palette.ts`, `protocol.ts`, `dev.ts` (`?weather`, `?weather=<json>`,
  `window.__weather`), `support.ts`, `weather.css`; the demo
  (`#weather demo`, its own lazy chunk): `demo-script.ts` (steps, timeline,
  command parsing), `demo.ts` (runner, caption box), `demo.css`.
- `src/weather/worker/`: `engine.ts` (frame loop, rates 60/30/12/3 fps, transitions ≥ 30, clouds 20 (15 in Firefox), glimpses 6,
  module caches, mask, pane tints `paneFills`), `sky.ts` (sky, moon, stars, clouds,
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

### Known small defects (to pick up later)

Visual:

- A tinted (coloured) floating pane's tint is painted by the worker and
  can trail a moving float by about a frame. Plain floats are unaffected.
- A black patch can show where two floating panes overlap over the game
  text (seen before item 57 too; cause not yet found).
- A docked pane or lower float covered by a float gets unblurred glass
  while covered (a clipped element cannot blur what is behind it).
- A float over a framed pane shows that pane's rain-free interior.
- Day sun glimpses are faint on the Paper theme.
- Title contrast over pure black is about 2.6:1.
- Firefox's far snow (dots, item 56) looks a touch crisper than the old
  pattern fills.
- z z Z falls back to the system monospace font in the worker.

Cost and detection:

- Every fog change (a 40 s fade) runs all modules at 30 fps for its whole
  length; a cloud cover change costs about a quarter core more while it
  lasts.
- Firefox is told apart by user agent (flat glass, `Env.cpu`).
- Headless Firefox (software rendering) stalls with complex clips on the
  game text; headed Firefox does not (ADR 0091 addendum, item 57).

Unverified and tests:

- XML `<weather>` tag on the lightning line and the XML around the
  darkness room line unverified live; no live `Event.Darkness` seen.
- e2e: chromium "a drag shows its cursor on a shield" fails on main too
  (pre-existing); map-notes / map-tilesets and a few other specs are
  flaky under parallel load (pass alone).

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
    - **Done (2026-10-17):** the glimpses now follow the game's clock (how
      far the sun is between the dawn and the dusk hour of the month). On a
      clear day one comes at least once a minute: every 50–60 s around the
      dawn and dusk hours, every 22–40 s at midday. Each one is a different
      size, small ones more often: early and late 5–8 s long and faint, at
      midday 8–16 s and up to a little more than twice as bright as before
      (still well below a sunrise or sunset). The rays now fan out further to
      the left over the open sky and the game text (before, most fell behind
      the panes on the right, which is why you hardly saw them), with a soft
      warm glow where the sun sits; where a ray enters a framed pane through
      its top or right rim, that stretch of the rim glints, following the
      rounded corners and taking the nameplate with it as the sun beams do.
      Still only on a clear-ish day outdoors: clouds, rain, snow, dense fog,
      indoors and a sunrise/sunset moment stop them; light fog makes them
      fainter. With the blue day sky switched off they still come (as birds
      and tufts do, item 36), over the plain background. The demo's day step
      shows a strong one. Cost: a glimpse runs at 6 frames a second (was 12);
      at midday that adds about 2 % of a CPU core in Firefox on average
      (measured with the power bench), at dawn and dusk about what the old
      rare glimpses cost.
53. **Borderless pane shows edges in sunrise/sunset rays.** A pane
    without a frame (otherwise fully transparent) gets visible edges when
    the sunrise/sunset rays pass (screenshot `images/8.png` in the session
    scratchpad: a rectangle where the rays are weaker inside the pane).
    The owner adds: the same happens with lightning and during the
    day/night fade, so likely the same kind of problem.
    - **Done (2026-10-17):** the weather treated every pane box as a pane:
      at sunrise and sunset the sun's shadow behind panes and the weaker
      inside of the beams also fell on panes without a frame, and in rain the
      drops stopped at their top edge and dripped from their bottom, so in a
      lightning flash the lit rain stopped at the box too. A pane without a
      frame is now no glass to the weather at all: rays, beams, shadows,
      rain, drips, snow and fog wisps pass as if it were not there, as over
      the game text (which never had a box). Measured across the top edge of
      a large borderless floating pane: at sunset outside/inside 26 vs 13
      before, 26 vs 26 now; in a lightning flash 34 vs 30 before, 31 vs 29
      now (Chromium). The day/night fade and the indoor/outdoor fade showed
      no step at the box in Chromium or Firefox, before or after (57 vs 56,
      50 vs 50). One thing is left, mostly in Firefox: a floating pane shows
      the weather through its own small canvas (that is how it hides the
      game text under it), and the browser sometimes puts that canvas on
      screen a frame later than the big one, so during the flicker of a
      lightning flash a borderless floating pane can flash a frame
      early or late (3 of 15 frames in Firefox, 1 of 15 in Chromium, in a
      test). Docked borderless panes and the game text never show it; a
      framed pane's glass hides most of it. Fixing it would mean a different
      way of hiding the game text under floating panes; say if it bothers
      you.

### 2026-10-17 — ninth test (translated)

54. **Light line under the nameplate.** The bottom line under a pane's
    nameplate is very light and looks wrong (`images/9.png`, the Map
    plate); elsewhere on a frame the bottom lines do not look light
    (`images/10.png`, a bottom rim).
    - **Done (2026-10-17):** the nameplate's bottom edge had the light inner
      line that the rim has where its bottom part meets the pane, but the
      plate's bottom is a lower edge of the glass, like the frame's outer
      bottom edge, so it read as a bright stroke under the title. It now has
      the same dark line as the plate's sides and rounded lower corners: one
      unbroken dark edge from fillet to fillet, with the plate's soft shadow
      below as before. Over black at 2× the line under the Map plate went from
      about 147 grey (beside 104 for the plate's glass) to 56; the rest of the
      frame is unchanged. Checked on the Map and Character plates, weather on
      and off, dark and Paper, 1× and 2×.
55. **Sun rays a little weaker.** Back the strength of the sun rays down
    a little. (Read as the day sun glimpses just strengthened in item 52.)
    - **Done (2026-10-17):** the day sun glimpses are a quarter weaker: the
      rays, the warm glow at the sun and the glints where a ray meets a frame
      (the sparkle still comes on the strongest ones). The schedule is
      unchanged (at least once a minute, most and strongest at midday). The
      sunrise and sunset rays and beams are left as they are: a glimpse at
      its peak is now about two thirds of a sunrise ray, and they did not look
      too strong beside it; say if you want those down too.
56. **Smoother transitions and snow; higher frame rates?** Transitions
    sometimes feel a little laggy, e.g. between a clear day and a day with
    clouds; falling snow also feels laggy at times. Is the frame rate too
    low? Raise frame rates generally so everything feels more fluid, if
    the CPU price is not too high: no need to be needlessly frugal, but
    watch out for obvious resource hogs.
    - **Done (2026-10-17):** three causes, all fixed. (1) A change of cloud
      cover ran at 12 frames a second, the sky's colours were redrawn only 6
      times a second, and the clouds were rebuilt as a new "key picture" only
      every 4.7 s, so they came and moved in long blurred steps. Now every
      transition (clouds coming or going, day to night, in and out, rain or
      fog coming) runs at 30 frames a second while it lasts, the sky's colours
      change every frame, and the clouds get a new key picture every 0.7 s
      during a change and every 1.2 s while they drift. A cloudy day drifts at
      20 frames a second (was 12; 15 in Firefox, where it costs more). (2) The
      frames came unevenly: now and then a frame slipped by one screen refresh
      (33 then 50 ms at 30 frames a second). The loop now follows the screen's
      own rhythm: measured during a cloud change the intervals are 33/33/33 ms
      (median/95 %/max), against 83/84/94 before (Chromium; Firefox 87/91/170
      → 33/34/34). (3) In Firefox the distant snow cost about 25 ms per frame
      (Firefox draws the effects without the graphics card), so falling snow
      ran right at its limit and slipped frames; it is now drawn another way
      at about 1.5 ms (looks the same, perhaps a touch crisper), and snow costs
      Firefox about half the CPU it did. Rain and snow stay at 30 frames a
      second (60 would roughly double their cost); fog, moon and stars stay at
      12, a still day sky at 3. CPU (ms per second, 1000 = one core),
      before → after:

      | Scene | Chromium | Firefox |
      |---|---|---|
      | Clear day | 111 → 100 | 170 → 163 |
      | Cloudy day | 198 → 309 | 281 → 367 |
      | Cloud cover changing (24–40 s) | 212 → 480 | 314 → 528 |
      | Snow | 491 → 484 | 964 → 515 |
      | Heavy rain, fog, night | 521 → 497 | 574 → 604 |
      | Sunset | 518 → 532 | 723 → 741 |
      | Sun glimpse | 115 → 103 | 182 → 174 |
      | Going indoors | 153 → 158 | 200 → 218 |

      So a cloudy day costs about a tenth of a core more, a cloud change about
      a quarter of a core more while it runs, snow in Firefox half a core
      less. Please try: a clear day → `~` clouds (`#weather demo` has it, or
      the game), falling snow in Firefox, and going in and out; say if
      anything still steps, or if the laptop runs warmer than before.

### 2026-10-17 — tenth request (translated)

57. **Borderless floating pane in step with lightning.** The owner asked
    to fix the known lag: a borderless floating pane copies the weather
    canvas behind it one frame late, so during lightning flicker (and
    any fast flash) it can show the previous frame's brightness and stand
    out as a rectangle. It should show the same frame as the weather
    around it.
    - **Done (2026-10-17):** a floating pane now shows the weather canvas
      itself instead of a copy of it. The copy was of the right frame, but
      the browser put each canvas on screen on its own, so now and then the
      pane showed it a frame early or late. Now the pane is see-through like
      a docked pane, and what lies under it (game text, docked panes, a
      lower float) is cut away round it. Measured across the top edge of a
      borderless float in lightning, inside against outside: before, up to
      a third or nearly double the brightness (Chromium 0.31–1.90, Firefox
      0.52–1.38); now 0.81–1.07 and 0.88–1.14, which is the flash's own
      shading. Day/night fades show no step; framed floats look as before. A
      moved float now shows the right weather in the same frame too. One
      visible change: a docked pane (or a lower float) with a float lying
      over it gets its glass without blur while it is covered, as Firefox
      always draws it (the cut makes the blur see nothing). The CPU cost is
      unchanged, a little lower with floats. Please try: lightning with a
      borderless float over the text (`#weather demo` has strikes), and drag
      a float over a framed docked pane and see if the change in its glass
      bothers you.

### 2026-10-18 — new-player defaults (translated)

58. **New-player defaults.** Weather effects on; the map on a transparent
    background with the Shimrod (alternating) tileset; panes arranged after
    two screenshots (right dock: Character, the map, Timers | Group, Comm,
    UI, pane bar; Map search at the game pane's top-right corner) with
    Character, UI and Map search hidden. Everything else as before. Then:
    existing users get the weather on with the update (an explicit off is
    kept); on a phone the weather is always off by default.
    - **Done (2026-10-18):** ADR 0092. The map is docked under Character in
      a 50-cell right dock (two 25-cell lanes); in 174 × 51 the default
      shows the map 22, Timers | Group 13 and Comm 15 rows. Existing users
      keep their layout, tileset and background; desktop users get the
      weather on unless they turned it off; phones default to off (new and
      existing) and keep Character on. Unit 2692; e2e 522/524 (the two
      failures are flaky and fail on 8e0998c too). Please try: a private
      window (new player) on desktop and on the phone, and your own browser
      after the update (weather should be on, nothing else changed).
    - **Owner, same day:** the map pane without a frame. Done: the default
      map toggle is borderless (a damaged stored entry stays framed); its
      share is 195 so the rows stay the same (map 22 in 174 × 51).
    - **Owner, 2026-10-18:** "looks good" — item 58 approved.

### 2026-10-18 — live play after 0.1.63, night to day (translated)

59. **Clock strip: the sun icon one game hour early.** The clock to the
    right of the input line shows the sun icon one minute (one game hour)
    before rooms are actually lit in the game.
    - Evidence (`mume-Gittan-2026-10-18T18-01-53`): at 9 am on the 11th of
      Solmath (dawn hour 9) `time` says "The light slowly increases in the
      east."; "The day has begun." comes an hour later. `Event.Sun rise` is
      the dawn hour, `light` dawn + 1; rooms are lit from `light`. The
      strip's day starts at the dawn hour (`isDay`), one hour early.
    - **Done (2026-10-18):** ADR 0093. The day is dawn + 1 ≤ hour < dusk:
      the strip shows the moon and counts down to dawn + 1:00 through the
      dawn hour, the sun from "The day has begun." on; the weather's
      almanac and `sunU` and the scripts' `period` agree (the scripts
      already had the dawn hour as `dawn`, not `day`). Night still begins
      at the dusk hour, as before.
60. **Sunrise timed to the game's day.** The night sky turned slowly into
    the day sky, which was complete about 25–30 s before the day began; no
    sunrise animation at all. Wanted: the sunrise starts exactly one minute
    (one game hour) before the day begins and ends exactly at the second the
    day begins. It fades in very slowly: the first 40 s only just
    perceptible, the last 20 s it builds up. Somewhere in that minute the
    night sky turns into the day sky; the day sky need not be complete when
    the day begins and may go on fading in 10–20 s after, but at that second
    it must be more prominent than the night sky. The change must be smooth.
    - **Done (2026-10-18):** ADR 0093. The sunrise is timed by the synced
      clock, not by `Event.Sun rise`: it starts 60 s before the day begins
      and is over at that second. Its rays, beams, glints and warm colours
      stay at most 6 % for the first 40 s, build up over the last 20 (peak
      ~7 s before the day) and fade out by the day's first second. The day
      sky comes in from 28 s before the day; at the day's first second it
      is 74 % of the sky, complete 14 s later. A page load or a clock sync
      mid-rise joins at its place, a small resync glides, never two in one
      dawn. Without a clock synced to the minute, `Event.Sun rise` starts
      it (and syncs the clock); "The day has begun." without one fades to
      day over 12 s. The look is the old sunrise, re-timed; the sunset is
      unchanged. The demo's Sunrise step plays its last half minute (10 s).
      Unit 2711 (new: the curves, the rise clock, the dawn-hour strip);
      e2e weather + layout 44/44. Checked in headless Chromium by
      screenshots at -24, -15, -7, 0 and +14 s; how it looks on your screen
      is yours to judge.
      Please try: (1) outdoors on a clear night with the clock synced to the
      minute (the strip shows H:MM), watch the last game minute before the
      strip's ☾ turns ☼: almost nothing for 40 s, then the beams build and
      are gone as the day begins, the blue sky coming through and finishing
      some 15 s into the day; (2) the strip's ☼ comes with "The day has
      begun.", not with "The light slowly increases"; (3) `#weather demo`
      (step 2, Sunrise); (4) dev server: `__weather.jump({ clock: 'night',
      dayAt: Date.now() + 65_000 })`, then `__weather.unpin()`. Feedback
      wanted: is the first 40 s too faint or not faint enough, and does the
      day sky arrive at the right pace.

### 2026-10-18 — sunset the same way (translated)

61. **Sunset timed to the game's night.** The same as item 60 for the
    sunset: it runs over the last game hour of the day and ends exactly at
    the second the night begins, faint for 40 s, building the last 20 s;
    the night sky more prominent than the day sky at that second, and it
    may go on 10–20 s after.
    - Evidence (Cockpit run `Rasta/2026-09-25T22-03-02`): after "The sun
      slowly disappears in the west." (`Event.Sun set`, the dusk hour) the
      prompt's light symbol stays `*` (sunlit) for the whole hour; it turns
      `o` at "The night has begun. You feel stronger in the dark!" (`dark`,
      dusk + 1). So the night begins at DUSK+1 and the strip's moon icon
      also comes one game hour early.
    - **Done (2026-10-18):** ADR 0093 (now covering both). The night
      begins at dusk + 1: the strip keeps the sun and counts down to dusk
      + 1:00 through the dusk hour, the moon from "The night has begun."
      on. The sunset runs like the sunrise: over the 60 s before the night
      begins, timed by the clock; at most 6 % for the first 40 s, building
      over the last 20, gone at the night's first second; the night sky
      (moon or stars, as the almanac says) comes in from 28 s before, 74 %
      of the sky at the night's first second, complete 14 s later. Joins
      mid-set, glides on a resync, never two in one dusk; `Event.Sun set`
      starts it without a clock synced to the minute, "The night has
      begun." alone fades to night over 12 s. Gone: the old 26 s sunset
      that ran from `set` and the 11 s hold before the night sky came. The
      sunset look is the old one re-timed; the colours of both now follow
      the timing so that the strong middle of the old moments (orange to
      pale gold at sunrise, gold to crimson at sunset) is under the peak.
      The demo's Sunset step plays its last half minute (10 s), like the
      Sunrise step. Unit 2720; e2e weather + layout 44/44 (Chromium,
      Firefox). Checked in headless Chromium by screenshots at -24, -15,
      -7, 0 and +14 s for both; how it looks on your screen is yours to
      judge.
      Please try: (1) a synced clock (the strip shows H:MM), outdoors on a
      clear evening: the last game minute before ☼ turns ☾, almost nothing
      for 40 s, then the beams from the left build and are gone as "The
      night has begun." comes, the stars coming through and finishing some
      15 s into the night; the prompt's `*` should stay until the same
      second; (2) the same at dawn for the sunrise (☾ → ☼ with "The day has
      begun."); (3) `#weather demo`: steps Sunrise and Sunset; (4) dev
      server: `__weather.jump({ weather: ' ', clock: 'day', nightAt:
      Date.now() + 65_000 })` for a sunset, `__weather.jump({ weather: ' ',
      clock: 'night', dayAt: Date.now() + 65_000 })` for a sunrise, then
      `__weather.unpin()`. Feedback wanted: the faint first 40 s, the pace
      of the new sky, and whether the re-timed colours look right.
62. **Sun rays from the turn's first second.** "The first 30 seconds of
    the sunrise were rather dead. I want the sun rays to be glimpsed right
    from 1 minute before sunrise (visible but vague). After 30 seconds they
    should show a little more but still not much. Otherwise it was good."
    Then, same day: "I want the corresponding experience at sunset."
    - **Done (2026-10-18):** ADR 0093 (curve table). The rays, beams and
      their glints get a floor of their own: faded in over the first 2.5 s
      and vague but visible from then on, a little more from 30 s before
      the turn, then the old build-up over the last 20 s; still gone at
      the turn's second. Set by eye from screenshots for each (the
      sunset's rays are drawn about half as strong and over the blue sky,
      so its floor is higher). The sky tint, colours and everything else
      are unchanged. Unit 2721; e2e weather + layout 44/44.
      Please try: the dev hooks (`__weather.jump({ weather: ' ', clock:
      'night', dayAt: Date.now() + 65_000 })` for a sunrise, `clock: 'day',
      nightAt: …` for a sunset, then `__weather.unpin()`) or a real dawn
      and dusk with a synced clock: the rays should be there, faintly, from
      the first second of the last game hour, a little stronger halfway.
      Feedback wanted: too faint, too strong, or right, for each.

### 2026-10-18 — moonrise (translated)

63. **The moon on screen when the game says it rises.** The game said "The
    moon rises in the east." (`Event.Moon rise`, log
    `mume-Gittan-2026-10-18T20-20-06`, 18:20:16; `time` agreed, as did the
    almanac script) but no moon was seen in the following minute. Keep the
    path (the panes are transparent now). The moon must already have come
    into the screen when the message comes: since it glides slowly, start
    it early, so that at least about half the moon is inside the screen at
    the rise message.
    - **Done (2026-10-18):** ADR 0093, "The moonrise". Before: the moon
      started fully off the right edge at the rise message and glided in so
      slowly that its edge showed only ~25 s later and its centre reached
      the edge after ~44 s, low and behind the right dock: at 18:21:00 in
      the log about half of it was just in, at the far right, for the last
      seconds. Now, with the clock synced to the minute, the moon starts on
      its path about a minute before the rise (58.7 s at 1400 × 800;
      worked out from the window size), so at the rise message its centre
      is 0.6 radii inside the right edge (about 80 % of the disc in), at
      full strength. The path is the same; it moves about 7 % slower so it
      still leaves at the left edge when the game says it sets. Joining
      mid-way or after the rise puts it in place; without a clock to the
      minute the rise message starts it from below the edge and it glides
      in quickly. Unit 2724; e2e weather + layout 44/44. Checked in
      headless Chromium at 20 s and 5 s before the rise, at it, and 20 s
      after.
      Please try: (1) with the clock synced (the strip shows H:MM),
      outdoors on a clear night, watch the right edge in the minute before
      "The moon rises in the east."; the almanac script shows when;
      (2) dev server: `__weather.jump({ clock: 'night', moonUp: false,
      moonU: -1, moonRiseAt: Date.now() + 60_000 })`, then
      `__weather.unpin()`. Feedback wanted: is it in early enough, and is
      it bright enough at the edge.

### 2026-10-18 — sunset test (translated)

64. **No day-sky sun rays during a sunset.** The day sky's sun rays (the
    sun glimpses) must not appear while the sunset animation runs (nor the
    sunrise's).
65. **Day-sky rays follow the sun.** Today they always come from the same
    angle. They should come slanting from the side the sun rose on (top
    right) and through the day turn toward the side the rays come from at
    sunset (top left).
66. **Sunset starts with the sun lower.** The sunset animation starts with
    the sun "too high in the sky". It should be felt to start lower: the
    sun at most about 45° up.
67. **Sunrise from the horizon.** Likewise the sunrise: the sun should be
    felt to come very low (from the horizon, straight from the right at
    first) and then climb, ending at about the angle the day sky's rays
    are then felt to come from.
68. **All rays from one sun, all rays glint.** The three strong beams (the
    ones that make the pane borders glint) move differently from the other
    rays, so the light does not feel as if it comes from one source. Some
    rays moving a little differently is lively, but it must feel coherent,
    all from the sun. Every sun ray that hits a pane border should make it
    glint.
    - **Done (2026-10-18), items 64–68:** ADR 0093, "One sun". One sun
      for the whole day: the sunrise starts at the horizon straight from
      the right and climbs to 40°; the day's glimpses go on from there,
      over the top to the top left by evening (following the time of day);
      the sunset starts 40° up at the left and sinks to the horizon. The
      strong beams and the thin rays now come from the same sun and sway
      together; every thin ray glints where it crosses a pane border, as
      faint as the ray. No glimpse while a sunrise or sunset runs or is
      about to begin; one already shining fades out quickly. Colours and
      timing as before. Unit 2726; e2e weather + layout 44/44. Checked in
      headless Chromium (sunrise at -50/-20/-8/-2 s, glimpses at 0.05, 0.5
      and 0.95 of the day, sunset at -50/-20/-8/-2 s).
      Please try: a real sunrise and sunset with the clock synced; on the
      dev server a glimpse at a given time of day: `__weather.jump({
      weather: ' ', clock: 'day', sunU: 0.05 }); __weather.emit('glimpse')`
      (0.5 midday, 0.95 evening), and the turns with `__weather.jump({
      weather: ' ', clock: 'day', nightAt: Date.now() + 65_000 })` /
      `clock: 'night', dayAt: …`, then `__weather.unpin()`. Feedback
      wanted: do the angles feel right through the day, and do all rays
      read as one sun.
69. **The moon at an even pace.** A moon came in very fast, went to about
    the middle of the window and then moved very slowly (log
    `mume-Gittan-2026-10-18T20-40-32`, at its end). Wanted: the moon glides
    at about the same pace all the time, comes in from the very edge at
    about the rise and glides out at the set.
    - **Done (2026-10-18):** ADR 0093, "An even pace". Cause: the moon's
      place was counted up frame by frame; with the tab in the background
      (or the effects running slowly) it fell behind, and the `ti` at
      18:49:59 synced the clock, which made it rush to where the game said
      (south) and then go on at its normal, by contrast very slow, pace.
      Now, with the clock synced to the minute, its place comes from the
      time alone: in at the right edge at the rise, across at one even
      pace, out at the left edge at the set. A small correction of the
      clock changes its pace by at most half; a big one fades it out and in
      at its place; coming back to a hidden tab, it is simply there (fading
      in). Unit 2727; e2e weather + layout 44/44. Checked in headless
      Chromium: a moon mid-way, the tab hidden for 90 s, back: it fades in
      where the time says, no rush.
      Please try: (1) on a clear night with the clock synced, watch a moon
      cross, switch to another tab for a minute or two and back; (2) dev
      server: `r = Date.now() + 60_000; __weather.jump({ clock: 'night',
      moonRiseAt: r, moonSetAt: r + 745_000 })` for a rise
      (`Date.now() - 300_000` for one mid-way), then `__weather.unpin()`.
      Feedback wanted: is the pace even and right, and does it come in and
      go out at the edges at the game's messages.
70. **One demo, at the real pace.** `#weather demo` feels fast-forwarded;
    `#weather demo slow` gives a more realistic picture of how the effects
    look. Keep only `#weather demo`, giving a realistic experience of the
    different effects; it may run a little longer if needed, at most about
    3 minutes in total.
    - **Done (2026-10-18):** ADR 0091 "Demo" (note), ADR 0093 "Demo".
      `#weather demo` now runs everything at the game's own pace (`slow` is
      gone) and shows a part of each slow process instead of speeding it
      up: the last 25 s of the sunrise and the sunset, 14 s of clouds
      coming and of snow building up, 16 s of fog thickening, the day and
      night skies filling in after the turns. 20 steps, 2:58:
      night and moon 0:00 (5 s), sunrise 0:05 (25), day clear 0:30 (12),
      clouds 0:42 (14), light rain 0:56 (6), heavy rain 1:02 (5), lightning
      1:07 (5), snow and a gust 1:12 (14), fog 1:26 (16), indoors 1:42 (6),
      outdoors 1:48 (5), sleeping 1:53 (4), stunned 1:57 (3),
      incapacitated/dying 2:00 (5), on your feet 2:05 (9), sunset 2:14
      (25), night rain and lightning 2:39 (8), darkness spreads 2:47 (5),
      lifts 2:52 (3), back to the game 2:55 (3). Watched through once in
      headless Chromium (screenshots at eleven points).
      Please try: `#weather demo` once through; feedback wanted on any
      step that feels too short to see or too long.

### 2026-10-18 — sun test (translated)

71. **Sunrise builds up steadily.** The first 5–10 s were good: a few
    rays from the right angle. Then more rays should fade in gradually over
    the following 20–30 s, so the sunrise builds up a little all the time.
    At the most intense part everything happened very fast and felt like a
    jerk: very little for a long time, then very much in a very short time.
    The climb and the build-up of rays must be gradual. Nor may the effect
    die out too fast: when the blue sky becomes perceptible the rays fade
    out slowly, and when the blue sky is complete the rays are gone.
72. **Sunset: gradual, and setting at the bottom left.** The same as 71:
    too fast at the end. When the sun reaches its end below the horizon on
    the left, the rays should feel as if they come from the screen's lower
    left edge; now they seemed to come from about the middle of the left
    side when the sun was lowest.
73. **Day-sky rays pulse gently.** Today they fade in and out with long
    pauses between. Instead they should slowly pulse between not visible
    and only just perceptible, about every 20 s; so subtle you hardly
    notice it unless you look closely. A little more visible at midday,
    when the sun is brightest.
    - **Done (2026-10-18), items 71–73:** ADR 0093, "Steady turns and a
      gentle pulse". Sunrise and sunset now build up evenly: three faint
      rays from the first seconds, the other five fading in one by one
      over the next half minute, then the three strong beams; the strength
      rises steadily to its peak about 10 s before the turn, and the sun's
      angle and the colours move at one pace all through. The rays fade
      slowly as the new sky comes (from about 10 s before the turn) and are
      gone exactly when it is complete, 18 s after the turn. At the end of
      a sunset the sun is below the horizon at the bottom left, so the last
      rays come up from the lower left edge. (A fault made the first
      seconds of a sunrise darker than meant: most of the early rays
      pointed off the screen; fixed.) The day sky's rays no longer come and
      go: they pulse slowly, about every 20 s, between nothing and only just
      perceptible, a little more at midday, without glints; the frame rate
      stays at the still rate. The demo's sunrise is followed by "The day
      begins" (18 s, the rays fading as the blue sky fills in), still
      3:00 at most. Unit 2725; e2e weather + layout 44/44. Checked in
      headless Chromium (a sunrise and a sunset every 5 s from -60 to +20,
      the pulse at morning, midday and evening).
      Please try: `#weather demo sunrise` and `#weather demo sunset`
      (item 74) or a real sunrise and sunset with the clock synced (watch
      the whole minute and the 20 s after); a clear day sky for a minute
      or two (look closely for the pulse); and `#weather demo`. Feedback wanted: is the
      build-up even now, is the fade slow enough, and is the pulse too
      faint or too strong.
74. **Demo commands for one sunrise and one sunset.** `#weather demo
    sunrise` and `#weather demo sunset`, to test them properly: the whole
    cycle, without console commands.
    - **Done (2026-10-18):** ADR 0093 "Demo". `#weather demo sunrise`: a
      clear starry night without a moon for 5 s, then the whole sunrise
      exactly as in the game (the last game hour of the night, then on
      until the blue sky is complete), 10 s of day with the sun's rays
      pulsing, then back to the game; about 1:36. `#weather demo sunset` is
      the same the other way round, ending with the starry night and a
      shooting star; about 1:34. The caption box shows the step and counts
      to and from the turn's second ("the day begins in 0:42", "the day
      began 0:07 ago"), so you can name a moment in feedback.
      `#weather stop` ends any demo; starting one while another runs says
      so. After it, the game's own sunrise or sunset comes as usual, even
      soon after. These commands replace the console commands in the
      earlier "Please try" notes for testing the sunrise and sunset; `#help
      weather` lists them. Unit 2729; e2e weather + layout 44/44. Played
      once each in headless Chromium (screenshots, no errors).
      Please try: `#weather demo sunrise` and `#weather demo sunset`, out
      of the game or in it; note the caption's time for anything you want
      changed.
75. **Sunset to a horizon above the input.** The sun should not go all the
    way down to the lower-left corner after all. Think of the horizon it
    sets below as about 30–40 % up from the bottom edge, as for the
    sunrise. The problem is that the effect gets in the way of where you
    type. At the same time it is logical that the horizon isn't the
    screen's bottom edge, since the day sky stops being visible about
    20–25 % from the bottom.
    - **Done (2026-10-18):** ADR 0093, "One horizon above the input line".
      Sunrise and sunset now share one horizon a third up from the bottom
      (65 % down the screen): the sunset ends with the sun just below it at
      the left, the last rays coming in level from there, and the sunrise
      starts the same way from the right. No strong rays reach down over
      the input line. The sunrise's first rays were made a little stronger,
      since they pass behind the right-hand panes. Unit 2729; e2e weather +
      layout 44/44. Checked with `#weather demo sunset` (every 5 s) and the
      first 25 s of `#weather demo sunrise` in headless Chromium.
      Please try: `#weather demo sunset` and `#weather demo sunrise`; note
      the caption's time for anything you want changed.


### 2026-10-18 — sun test 2 (translated)

76. **Sunset: rays fade out before the night sky shows.** As the sun goes
    down, the last rays fade out softly. The night sky starts to show only
    when the last rays are barely perceptible; until then the blue day sky
    still dominates. The night sky must not be clearly visible while there
    are visible rays and a sun that seems to be above the horizon. The blue
    day sky also lasts too long at a sunset: it may start to fade out as
    early as 10 s after the sunset begins.
77. **Sunrise: the hazy light and the sky's order.** The sun's hazy light
    (the glow, not the rays) comes too fast: what happens in the first 3 s
    should take about 25 s, and from then until day it should grow
    step by step. The stars fade out as the sun becomes visible: about
    50 % faded 10 s into the sunrise, then down to barely perceptible over
    about 20 s more; the last 30 s are the blue sky fading in. When the
    day begins, the sky is fully blue and the sun and all its rays have
    faded away.
78. **Rays: subtle, even, glinting at the frames.** The rays should be much
    more subtle; now they look a bit like moving spotlights. The glint is
    to be much stronger for the weaker rays along the pane edges. The rays
    should be spread evenly, not clustered. In a sunrise, and above all at
    its start, they should mostly point sideways and down; further in, a
    few pointing up may have come.
79. **Rays: no fast or big movement.** Some rays start to move very fast.
    No quick or large movement at all: the animation should feel calming.
    - **Done (2026-10-18), items 76–79:** ADR 0093, "Sky order and calm
      rays". The sun's part of both turns (rays, beams, glints, glow,
      colours) now ends at the turn's second. Sunrise: the hazy glow comes
      in over 25 s (what came in 3 s) and grows until 14 s before the day;
      the stars are half gone 10 s in, barely there 30 s in, gone 6 s before
      the day; the blue comes over the last 30 s and is complete when the
      day begins, the sun and every ray gone then. Sunset: the blue starts
      to fade 10 s in, into a warm dusk (darker, no stars); the rays fade
      softly to nothing at the night's second (barely there 5 s before);
      the stars come only from then, complete 14 s into the night. Rays
      and beams are drawn much fainter (the beams about a third of before),
      spread evenly over the fan (the beams between the rays), and a
      sunrise starts with them sideways and down (about 6° down to 2° up),
      a ray or two pointing up from about a third in. A faint ray's glint
      on a frame line is now much stronger (a glow and a core, like a
      beam's). The fast movement (79): the fan's edges were the screen's
      corners seen from the sun, and the sun passes close by a top corner,
      so the fan swung by up to ~160° in seconds; now it aims at two points
      on the far side and every ray and beam moves at under 0.84°/s (was up
      to 4.4–6.5°/s; unit test bound 1°/s). Demo: the main demo shows the
      last 30 s of each turn (2:56 in all); `#weather demo sunrise` 1:20,
      `#weather demo sunset` 1:30. Unit 2734; e2e weather + layout 44/44
      (Chromium, Firefox); bench in line with bench/results. Checked in
      headless Chromium by screenshots of both demos every 5 s (-57 … 0,
      the sunset to +18), and against the previous build's sunrise.
      Please try: `#weather demo sunrise` and `#weather demo sunset`; note
      the caption's time for anything you want changed.
      Feedback wanted: is the order right now (sunset: blue, dusk, rays
      gone, then stars; sunrise: glow, stars going, blue), are the rays
      subtle enough and the glints clear enough, and does any ray still
      move too much.

### 2026-10-18 — sun test 3 (translated)

80. **Sunrise: rays in all downward directions, strength tiers, a slow
    start.** The rays are concentrated in one span to the left and down-left;
    rays pointing down are missing (`img/28-item80-sunrise-rays.png`: the
    orange arrows from the sun at the upper right go steeply down-left to
    the bottom edge, the steepest nearly straight down at the right). No
    three much stronger rays bunched together: instead three a little
    stronger, some a little weaker and some much weaker, the tiers evenly
    spread over the directions. The rays fade in in step with the sun's
    hazy light over the first ~30 s, barely visible at the start. Frame
    glints: strongest from the strongest rays, less from the middle ones,
    least from the weakest; not so marked at first, fading in over the
    first ~10–20 s of the sunrise.
81. **Sunset: wider span, stars earlier, glints fade with the rays.** The
    stars may start to show ~7 s before the night begins and are fully
    visible when it begins. A few more rays for a wider span of angles
    (`img/28-item81-sunset-rays.png`: from the sun at the upper left, one
    arrow almost level to the right across the top, two steeply down-right
    to the bottom edge). About 22 s before the night begins the rays
    clearly fade; the frame glints must fade in step with them.
    - **Done (2026-10-18), items 80–81:** ADR 0093, "Tiered rays and a
      wider fan". Both turns now share one fan of 15 evenly spread places:
      three beams a little stronger than the rest at a quarter, the middle
      and three quarters of the fan, and between them twelve thin rays,
      middle and much weaker ones in turn (beam, weak, middle, weak, beam
      …), never two of a kind side by side. The fan reaches from about
      level to the bottom edge: in a sunrise from 39° down at the start,
      60° down midway and 81° down (nearly straight down at the right) at
      the end; a sunset the mirror, nearly straight down at its start and
      about 40° down at its end. A sunrise's rays come in step with its
      hazy light (barely there at first, not a few rays early). The frame
      glints go by the ray's strength: strongest from the beams, less from
      the middle rays, least from the weak; a sunrise's are faint for its
      first 10–20 s, and in both turns the glints fade with the rays (they
      were drawn too strong and clipped, so the first third of the fade
      did not show in them). A sunset's stars start to show 7 s before the
      night and are complete when it begins (they came at -5 and were
      complete 14 s in). Every ray still moves at under 0.82°/s. The rays
      that go steeply down pass behind the right-hand panes, so they show
      there mostly as glints on the frame lines. `#weather demo sunset` is
      now 1:26. Unit 2739; e2e weather + layout 44/44 (Chromium, Firefox). Checked in
      headless Chromium at 2000 × 1150 by screenshots of both demos every
      2–5 s.
      Please try: `#weather demo sunrise` and `#weather demo sunset`; note
      the caption's time for anything you want changed.
      Feedback wanted: does the fan reach where your arrows went, are the
      three stronger rays and the tiers right, does the sunrise start
      slowly enough, and do the glints now fade with the rays.
82. **Day sky: fainter, sparser, wider sun rays.** The sun glimpses / rays
    on the blue day sky should be even fainter, only just perceptible, and
    fade out a little towards the lower part. They are too centred in one
    span of angles: make them a little sparser and spread them over more
    angles from the sun's place (`img/28-item82-day-rays.png`: from a sun
    above the top edge, right of the middle, arrows down-left at about 30°
    and 45° below level on the left, steeply down a little to the right, and
    down-right at about 50° to the right edge).
    - **Done (2026-10-18):** ADR 0093, "Tiered rays and a wider fan". The
      day sky's pulsing rays are fainter (their peak about two thirds of
      before), fade out down the screen (gone about three quarters down),
      and are six rays spread evenly over about 110° round the sun's
      direction (they were within about ±23°): for a sun above the top,
      right of the middle, from about 30° below level at the left to about
      60° at the right; two a little stronger, one middle, three weak, in
      turn. Same cost; calm (under 1°/s). Checked in headless Chromium at
      2000 × 1150 in the morning, before and at midday, and in the evening.
      Please try: `__weather.jump({ weather: ' ', clock: 'day', sunU: 0.35 });
      __weather.emit('glimpse')` (or `#weather demo`'s clear day), and
      watch a few pulses.
      Feedback wanted: are they faint enough now (or too faint to see), and
      is the spread right.

### 2026-10-19 — sun test 4 (translated)

83. **Sunset ends at the night's second; fainter sun, fainter rays.**
    Sunset: the sun now feels set 10 s before the night begins, and the
    stars feel in place 5 s before it. Shift the process so the sun feels
    set exactly when the night begins. The stars fade in more slowly:
    perceptible 5 s before the night begins, fully visible only 5 s after.
    The sun itself (not the rays) and the light round it should be less
    marked: the whole effect about 50 % weaker. In both sunrise and sunset
    the rays should be less marked: dimmed by about 50 %.
    - **Done (2026-10-19):** ADR 0093, "Sunset at the night's second". It
      read as set at -10 s mostly because the sun's light turned night blue
      at -7 s, and its rays and glow had fallen to under half by -10 and a
      tenth by -5. Now a sunset's colours stay warm (purple at -3 s), and its
      rays, glow, glints and warm tint fade late: the rays 0.7 at -10, 0.4
      at -5, 0.2 at -2, gone at 0. A few faint stars show at -5, more at
      -3, about half there when the night begins, complete at +5. The sun itself
      and its hazy light are half of before, in the sunrise too (the same
      drawing). Thin rays and beams half of before in both turns; the frame
      glints keep their strength and still fade with the rays. Unit 2739;
      e2e weather + layout 44/44 (Chromium, Firefox). Checked in headless
      Chromium at 2000 × 1150, the sunset every 1–4 s from -20 to +8.
      Please try: `#weather demo sunset` (and `#weather demo sunrise`).
      Feedback wanted: does the sun now feel set as the night begins, do
      the stars come in slowly enough, and are the sun and the rays faint
      enough (or now too faint).
84. **Day sky rays: subtler, three more, a smooth vanish.** On the blue
    day sky, make the rays even less visible, so that they are there more
    subtly. Add three more rays (spread evenly). When a ray goes out
    (opacity reaching 0) it can be perceived: make the transition smoother
    as a ray weakens and vanishes or comes in (probably the frame rate, or
    too few transparency steps, so that it looks choppy).
    - **Done (2026-10-19):** ADR 0093, "Dithered day rays". The cause was
      too few transparency steps: at their peak the rays add only a few
      colour levels to the sky, so each step came at once over a whole ray
      (or the sun's glow), the last one to nothing the most visible. Now the
      rays and the glow are drawn from a fine, fixed grain, so each pixel
      takes its step at its own moment and the light comes and goes
      pixel by pixel. The rays are about 0.6 of before and nine (was six),
      spread evenly with the same tiers in turn. Same frame rate and cost.
      Please try: `__weather.jump({ weather: ' ', clock: 'day', sunU: 0.35 });
      __weather.emit('glimpse')`, and watch a few pulses (one about every
      20 s), especially as they fade out.
      Feedback wanted: can you still see a ray come or go, and are they
      subtle enough.

### 2026-10-19 — sun test 5 (translated)

85. **A real event broke into a demo.** The owner believes the night
    began in the game while a demo played and upset it. Confirmed in code:
    the demo pins the state (clock, dayAt / nightAt …), but GMCP
    `Event.Sun` / `Event.Moon` events pass the pins (`signals.gmcp` emits
    them; the worker applies `eventState` and `turnEvent`), so a real
    "The night has begun." sets the night, and a real `Event.Sun rise/set`
    starts a turn, in the middle of a demo.
    - **Done (2026-10-19):** ADR 0091, Demo, "The game held back". While a
      demo (or any pin: a dev `jump`, a bench) runs, none of the game's
      events reach the effects. The sun and moon events are still noted,
      and when the demo ends the effects follow the game from there: a
      night that began during the demo is night after it (eased as usual),
      a moon that rose is up. A sunrise or sunset the game opened during
      the demo joins at its place afterwards (by the clock when it is
      synced; otherwise from the held `Event.Sun rise` / `set`, if its
      minute is not over). A magical darkness begun during the demo and
      not ended starts when it ends. Lightning and gusts from the game are
      dropped during a demo (they are moments, and the demo shows its own).
      Checked in headless Chromium: `#weather demo sunrise` with a real
      `Event.Sun set`, `Event.Sun dark` and `Event.Moon rise` sent 30 s in
      played on unchanged to its blue day sky; after it the game's night
      and moon. Unit 2747; e2e weather + layout 44/44 (Chromium, Firefox).
      Please try: a demo while playing, ideally across a real nightfall
      or daybreak.
      Feedback wanted: is the demo now undisturbed, and does the sky after
      it match the game.
86. **A ray glints only on the first pane it meets.** A frame glint from a
    sun ray shows only on the first pane the ray hits; a pane behind it
    along the same ray gets no glint from it.
    - **Done (2026-10-19):** ADR 0093, "A glint on the first pane only".
      Each sunrise or sunset ray and beam now glints only on the first
      pane it meets along its path: where it enters (the strong glint with
      the sparkle) and the faint trace where it leaves that same pane; any
      pane behind it on the same ray gets nothing from it. A float the ray
      meets before the docked pane under it is the first; a borderless
      pane does not count. The day sky's rays have no glints (unchanged).
      Checked in headless Chromium at 2000 × 1150 with the default right
      dock: in the sunset the Group pane's left line no longer glints from
      the rays that pass through Timers first; Timers' and Comm's left
      lines still do.
      Please try: `#weather demo sunset` and `#weather demo sunrise`.
      Feedback wanted: do the glints now sit only on the first pane, and
      are there now too few glints anywhere.

### 2026-10-19 — end of session (translated)

Overall the owner is happy; some polish remains for the next session.

87. **Sunset stars later.** The night still feels as if it begins a little
    early. The stars should only just be perceptible when the night begins,
    fade in for about 5–6 s more and be complete 5–6 s after it began (now
    perceptible from -5, about half at 0, full at +5).
    - Superseded by item 88 (the owner's later timing).
- The sunrise sun's strength (halved in item 83) feels right: kept.
- The day sky (items 82, 84) feels better.
- The owner will next check fog, lightning, clouds, snow, rain and the rest
  in real play.

### 2026-10-19 — sun test 6 (translated)

88. **Sunset: rays downward too, a soft start, stars after the night
    begins.** Rays also pointing down, so there is no gap below them
    (`img/28-item88-sunset-gap.png`: from the sun at the upper left, arrows
    steeply down along the left edge into the lower-left corner). The very
    first rays come a bit abruptly: fade them in more softly over the first
    10–15 s (more steps, slower steps, a higher frame rate or one ray at a
    time), so they do not pop up. The stars fade in from the night's
    second to 10 s after it, just barely perceptible at the second itself.
    - **Done (2026-10-19):** ADR 0093, "No gap below the rays, a soft start,
      later stars". The fan's lowest ray now lands near the bottom corner on
      the sun's side all through both turns (midway it fell ~15° short),
      still under 1°/s. A sunset's rays come in over its first 14 s, the
      first three one at a time 4 s apart; every turn ray, beam and the glow
      has its faint 8-bit alpha dithered frame by frame, so no step shows at
      once over a whole ray. Stars: none before -3 s, just perceptible at 0,
      about 60 % at +5, complete at +10. `#weather demo sunset` is 5 s
      longer. Unit 2748; e2e weather + layout 44/44 (Chromium, Firefox).
      Checked in headless Chromium at 1920 × 1226, the sunset at -58 … +10.
      Please try: `#weather demo sunset` (and `#weather demo sunrise`: its
      fan reaches the lower-right corner the same way).
      Feedback wanted: is the lower corner filled now, do the first rays
      come in softly enough, and do the stars come at the right moment.

### 2026-10-19 — sun test 7 (translated)

89. **Sunset: no flicker, a later blue, rays to the end pointing
    right.** The stars' fade-in is good now. About 2 s before the night
    the blue sky should still just be perceptible; 10 s before, fairly
    clearly; 5 s before, weaker; gone when the night begins. The flicker on
    the rays in the first 30 s is far too marked ("a bit epileptic"): much,
    much lower there; lower the rest of the time too. Over the last ~25 s
    the rays' spread shrinks until only a few show at the far left: the rays
    should run far over the screen until their last 2–3 s, then fade and
    shrink. The last rays should seem to come from the left (the horizon)
    and, as the sun goes below it, point right or up-right, not down.
    - **Done (2026-10-19):** ADR 0093, "Calm rays, a later dusk, a lifting
      fan". The flicker came from item 88's dithering in time; now a fixed
      spatial grain (no change between frames but the light), and the
      shimmer is a third of before, growing from none over the first 30 s.
      The blue: fairly clear at -10, weaker at -5, just perceptible at -2,
      gone at 0. The rays keep their strength to -4 s, then fade and shrink
      toward the sun over the last 3 s; the fan lifts from -42 s so the last
      rays point right and up-right across the screen. The lift turns the
      lowest ray at up to 3°/s (the only move faster than item 79's 1°/s).
      Unit 2749; e2e weather + layout 44/44 (Chromium, Firefox). Checked in
      headless Chromium at 1920 × 1226 (sunset -30 … 0, sunrise -45, -25).
      Please try: `#weather demo sunset`.
      Feedback wanted: is the flicker gone, is the blue's timing right, do
      the last rays run far enough and point the right way, and does the
      fan's lift feel calm.

### 2026-10-19 — real play: snow and lightning (translated)

90. **Lightning now and then in a thunderstorm.** Bolts came only with the
    game's flash line ("A bright streak of lightning flashes over the
    snow-covered mountains."), which MUME prints on entering a room, and
    not every time; the `weather` command confirmed a thunderstorm ("It's a
    freezing night, the sky is snowy and lit by some flashes of lightning,
    …"). Wanted: a few more bolts while in the storm, not only at the
    message. **Revised by the owner the same day:** no trigger from the
    `weather` command (the player types it). The flash line strikes at once
    as before; then a few more strikes now and then over the next ~30 s
    (a new flash line restarts the window), only while the player is in a
    room with rain or snow (`'`, `"`, `*`). Moving on through rain or snow
    keeps it going; a room without rain or snow stops it at once (raw
    weather, no 3 s delay) until a new flash line. Discreet: 2–3 extra
    strikes, not in the first ~5 s. Also end on a new connection or
    character, and hold back under pins.
    - **Done (2026-10-19):** ADR 0094. The flash line strikes at once and
      opens a 30 s window with 2 or 3 more strikes, one at a random moment
      in each equal part of 5–30 s after it. They fall while the game's
      weather is rain, heavy rain or snow; the first room without them ends
      the window for good (checked from 1.5 s after the flash, since the
      room's weather comes just after its text: verified in the owner's
      log). A new character or connection, a demo or a dev `jump` ends it;
      flash lines are ignored while a demo runs. The timing lives in the
      worker (no timer on the main thread). Unit 2761; e2e weather + layout
      44/44 (Chromium, Firefox). Checked in headless Chromium: a flash in
      snow gave two more bolts, at ~16 s and ~24 s.
      Please try: walk the Redhorn Pass in a snowstorm until the flash line
      comes, stay or move on through snow, then step out of the snow.
      Feedback wanted: is 2–3 extra bolts over 30 s the right amount, and do
      they stop at once when you leave the snow.
91. **Snow lingers after leaving.** Leaving a snowy room, the snow takes a
    very long time to disappear. Wanted: the snow fades out nicely over
    about 10 s.
    - **Done (2026-10-19):** ADR 0091, "Overcast, snow fade, storm window".
      When the settled weather stops being snow (3 s after leaving, as all
      weather changes), the flakes, the far snow and the dusting on the
      pane rims fade out smoothly over 10 s while they keep falling, and are
      then gone; if the snow comes back mid-fade it returns within 1.5 s.
      (Before, the far snow fell out at its own slow speed for a minute or
      more.) Rain's fall-out was already about 3 s and is unchanged.
      Screenshots 0, 5 and 10 s after leaving (night, `*` → `~`):
      `img/28-item91-fade-0s.png`, `img/28-item91-fade-5s.png`,
      `img/28-item91-fade-10s.png`.
      Please try: leave a snowy area for a dry one.
      Feedback wanted: does 10 s feel right, and is the fade smooth.
92. **Snow under a fully overcast sky.** In snow the sky is not fully
    overcast. Snow and heavy rain should give a fully overcast sky; partly
    cloudy and fully overcast should differ where the game tells them
    apart.
    - **Done (2026-10-19):** ADR 0091, "Overcast, snow fade, storm window".
      The game tells only these apart: `~` cloudy (now partly cloudy, with
      gaps, unchanged), light rain mostly cloudy, heavy rain and snow fully
      overcast. Snow was 0.8 cover and only half grey; now snow and heavy
      rain close the cloud deck, the sky behind is grey, the deck's shading
      is evener, and at night the moon behind it is only a faint disc.
      Screenshots: snow by day `img/28-item92-snow-day.png`, by night
      `img/28-item92-snow-night.png`, on the Paper theme
      `img/28-item92-snow-day-light.png`; heavy rain
      `img/28-item92-heavy-rain-day.png`; partly cloudy by day
      `img/28-item92-partly-day.png` and by night
      `img/28-item92-partly-night.png`.
      Please try: `__weather.jump({ weather: '*', clock: 'day' })`, then
      `'"'`, `"'"` and `'~'` (or walk from snow to cloud in the game).
      Feedback wanted: does snow and heavy rain read as fully overcast, and
      does `~` still look partly cloudy.

### 2026-10-19 — real play 2 (translated)

93. **Snow at once.** Snow should start falling at once on entering a
    snowing room. It felt slower at night than by day.
    - **Done (2026-10-19):** ADR 0091, "Snow at once, fast clouds, an
      overcast day, the left band". Snow used to start from nothing and
      build up over 26 s from the top, so the first ten seconds or so showed
      only a few flakes. At night they were fainter still (the dim night
      tint), so it did look slower at night. Now, when the 3 s wait is over,
      snow is already spread over the whole screen, half of its full amount
      (it fades in over about 1.5 s), and goes on to build up as before.
      Night flakes are a little brighter. The 3 s wait stays: without it,
      running through rooms makes the weather flicker.
      Screenshots 1 s after the snow begins: by day
      `img/28-item93-snow-start-day-1s.png`, by night
      `img/28-item93-snow-start-night-1s.png`.
      Please try: walk from a clear room into snow, by day and at night.
      Feedback wanted: does the snow come at once now, and is the first
      amount right (or too much).
94. **Clouds faster.** From a clear sky into a snow room it took over 30 s
    before the sky was cloudy. Wanted: about 5–6 s until clouds cover most
    of the sky, then more slowly.
    - **Done (2026-10-19):** ADR 0091 (same addendum). The clouds now come
      fast and then slow down: most of the sky covered in about 5 s, the
      rest filling in over the next few seconds (they still come from the
      right). Clearing is a little slower: about 9 s until most of them are
      gone. Before it was an even pace over half a minute.
      Screenshots from a clear day into snow: `img/28-item94-clouds-2s.png`,
      `img/28-item94-clouds-6s.png`.
      Please try: walk from clear weather into clouds or snow, and back out.
      Feedback wanted: is ~5 s right coming in, and ~9 s going out.
95. **A cloudy day sky.** By day, from a clear blue sky into a snow room,
    the sky turned grey at once and the clouds came after; it looked as if
    night fell. Wanted: the clouds first, then the sky somewhat less clear
    blue rather than fully grey; an overcast day that clearly reads as
    day, with clouds lit as day clouds.
    - **Done (2026-10-19):** ADR 0091 (same addendum). The grey now follows
      the clouds, never ahead of them. Cloudy (`~`) makes the blue only a
      little greyer, light rain mostly grey, heavy rain and snow overcast.
      The overcast day sky is a light blue-grey, about as bright as the
      clear sky. It reaches as far down the screen as the blue one; that
      cut-off was what made it look like night, since the lower half went
      dark. The clouds are light day clouds. At night overcast stays dark.
      On Paper it is a pale grey.
      Screenshots by day: snow `img/28-item95-snow-day.png`, heavy rain
      `img/28-item95-heavy-rain-day.png`, light rain
      `img/28-item95-light-rain-day.png`, cloudy
      `img/28-item95-partly-day.png`; snow at night
      `img/28-item95-snow-night.png`; Paper: snow
      `img/28-item95-snow-day-paper.png`, cloudy
      `img/28-item95-partly-day-paper.png`.
      Please try: by day, walk from clear into clouds, rain and snow.
      Feedback wanted: does overcast now read as day, does the grey come
      after the clouds, and is cloudy (`~`) grey enough or too grey.
96. **The left edge of the sky.** Move the blue sky's left boundary to the
    right, for a wider dark band along the left (the grey sky too), and
    remove the bright vertical band just right of the boundary
    (`img/28-item96-sky-left-band.png`).
    - **Done (2026-10-19):** ADR 0091 (same addendum). The bright band came
      from the left fade itself. It was a straight ramp that stopped
      abruptly, and the eye reads such an abrupt stop as a bright line
      (measured: no brighter pixels there, only the kink). Now the sky
      comes in along a smooth S-curve from 16 % to 46 % of the width (was
      roughly 15–34 %), with no corner at either end. The same band now
      also covers the grey sky and the clouds.
      Screenshot (clear day, 2000 px wide):
      `img/28-item96-clear-day.png`.
      Please try: a clear day sky, then a grey one, on your wide screen.
      Feedback wanted: is the band gone, and is the dark strip wide enough
      (or too wide).


### 2026-10-19 — left band (translated)

97. **Move the sky's left boundary further right**, by about the length of
    the arrow in `img/28-item97-left-band.png` (~9 % of the width).
    - **Done (2026-10-19):** the left fade keeps its width and shape and moves
      ~9 % right: fully dark up to ~25 % of the width, the whole sky from 55 %
      (was 16 % and 46 %; `LEFT_DARK` 0.55, `LEFT_SOLID` 0.46 in `sky.ts`).
      It applies to the blue and grey sky and the cloud deck alike.
      Please try: any outdoor room by day. Feedback wanted: is the band wide
      enough now?

### 2026-10-19 — snow start (translated)

98. **Snow falls in from the top again, at once.** Entering a snowy room by
    day, flakes faded in over the whole screen (item 93). Wanted: as before,
    the flakes start falling from the top, but at once on entering the room,
    with no delay, by day and night.
    - **Done (2026-10-19):** snow now begins on the raw `Char.Vitals` value,
      without the 3 s dwell; it still stops only once the change has settled
      (then the 10 s fade, item 91). At its start the flakes of half the
      build-up (`SNOW_START`) are spread over a screen's height above the
      top, so a steady stream falls in from the top at once and fills the
      screen downward (~2/3 down after 12 s); the far layers fall in from
      the top too. The whole-screen fill is kept only for a page load or a
      dev jump. Checked in headless Chromium (0.5, 2.5, 6, 12 s).
      Please try: walk into a snowy room by day and by night.
      Feedback wanted: does it start soon enough and look right?

### 2026-10-19 — weather only over the sky (translated)

99. **Weather only where there is sky.** Limit the snowflakes and the rain
    to the part of the screen that has sky; not a sharp boundary: on the
    left they fade out the same way the sky fades out. The same for the
    drifting clouds and all other weather effects. The dark band on the left
    must stay clear of everything. Exceptions: sunrise, sunset and the moon,
    which stay as they are. (The owner's arrow: weather from about 34 % of
    the width to the right edge.)
    - **Done (2026-10-19):** ADR 0091, "Weather only over the sky". Every
      weather effect now fades out to the left along the sky's own curve.
      Nothing shows up to about 25 % of the width, everything from 55 %,
      and between the two it fades just as the sky does. That one curve
      (now in `band.ts`) is shared by the sky and all the effects, so moving
      the band moves everything together. It covers rain (streaks, splashes,
      drips, rivulets, the beads under panes), snow (flakes, the far snow,
      the dusting on pane rims), the clouds, fog, lightning (the bolt now
      always comes down right of the band; its glow, flash and the light on
      frames in the band fade with it), stars and shooting stars, and the
      day's birds, insects, tufts and sun glimpses. Not changed: sunrise and
      sunset, the moon and its glow, sleeping/stunned/dying effects and a
      darkness spell. Same cost as before: each effect simply skips or dims
      what lies in the band (fog: once per fog frame on its half-size
      layer). Unit 2772; e2e weather + layout 44/44 (Chromium, Firefox);
      latency unchanged.
      Screenshots (2000 px wide): heavy rain by day
      `img/28-item99-heavy-rain-day.png`, snow at night
      `img/28-item99-snow-night.png`, snow by day in Firefox
      `img/28-item99-snow-day-firefox.png`, fog `img/28-item99-fog.png`, a
      strike `img/28-item99-strike.png`, birds over a clear day
      `img/28-item99-day-birds.png`; not masked: the moon on the left
      `img/28-item99-night-moon.png`, a sunset
      `img/28-item99-sunset.png`.
      Please try: rain, snow, fog and a thunderstorm in the game, and a
      starry night; then a sunset and the moon low in the west.
      Feedback wanted: does the left band now stay clear and the weather fade
      in smoothly where the sky does, and is anything left in the band that
      should not be (or missing where it should show).

### 2026-10-19 — the moon sets into the band (translated)

100. **The moon, shooting stars, clouds and birds leave into the band.**
     Instead of leaving at the left edge, the moon should leave (fade out)
     where the sky fades out to the left toward the dark band; the same for
     shooting stars, clouds and flying birds. The moon's speed may change:
     its fade into the band must end at the game's moonset (never up in the
     game while invisible, nor visible after it set), and it should come
     into view at the moonrise. Sunrise and sunset stay as before.
     - **Done (2026-10-19):** ADR 0091, "The moon sets into the band". The
       moon's arc now runs over its real time up from the right edge to the
       band: at the moonrise the disc just touches the right edge from
       outside and comes into view, it crosses high, and as it goes down in
       the west it fades out along the sky's curve, gone exactly at the
       moonset. It moves a little slower than before, since the path is
       shorter. It no longer slides in before the rise or out past the left
       edge after the set. If the clock's set comes a few seconds before the
       game's "the moon sets" message, it stays out of sight at the set
       point instead of reappearing. Shooting stars, the clouds and the birds
       keep moving left and fade out on the same curve (item 99). Unit 2771;
       e2e weather + layout 44/44 (Chromium, Firefox).
       Screenshots (2000 px wide), the moon by the clock: night at 0.6 of its
       time up `img/28-item100-moon-night-060.png` (full, before the band),
       0.85 `img/28-item100-moon-night-085.png` (fading), 0.95
       `img/28-item100-moon-night-095.png`, the set
       `img/28-item100-moon-night-100.png` (gone); by day 0.85
       `img/28-item100-moon-day-085.png` and 0.95
       `img/28-item100-moon-day-095.png`; a shooting star flying into the
       band `img/28-item100-shoot-a.png`, then
       `img/28-item100-shoot-b.png`.
       Please try: watch a moonset (and a moonrise) in the game; a starry
       night for shooting stars.
       Feedback wanted: does the moon set into the band at the right moment
       and pace, and does it come up at the moonrise?


### 2026-10-19 — left band again (translated)

101. **Move the band's boundary a little further right**, by about the
     arrow in `img/28-item101-left-band.png` (~6 % of the width).
     - **Done (2026-10-19):** `band.ts` `LEFT_DARK` 0.61, `LEFT_SOLID` 0.51:
       fully dark up to ~31 % of the width, the whole sky and all weather
       from 61 % (was 25 % and 55 %). The moon's no-clock waiting place
       (`MOON_HOLD`) moved from 0.6 to 0.55 so it stays right of the band.
       Weather unit tests green; checked in headless Chromium (rain by day).
       Please try: any outdoor room. Feedback wanted: is the band right now?

### 2026-10-19 — left band a third time (translated)

102. **Move the band's boundary further right**, by about the arrow in
     `img/28-item102-left-band.png` (~12.5 % of the width).
     - **Done (2026-10-19):** `band.ts` `LEFT_DARK` 0.735, `LEFT_SOLID` 0.59:
       fully dark up to ~43 % of the width, the whole sky and all weather
       from ~73 % (was 31 % and 61 %). The moon's path still ends at the
       band's solid edge, so it now fades over roughly the second half of
       its time up; its no-clock waiting place (`MOON_HOLD`) moved to 0.45
       to stay right of the band. Weather unit tests green.
       Please try: any outdoor room; the moon in its second half.
       Feedback wanted: is the band right now, and is the moon's longer fade
       acceptable (or should its path end further right)?

### 2026-10-19 — left band, a little back (translated)

103. **Item 102 went a bit too far: move the boundary back** by about the
     arrow in `img/28-item103-left-band.png` (~3.5 % of the width).
     - **Done (2026-10-19):** `band.ts` `LEFT_DARK` 0.70, `LEFT_SOLID` 0.57:
       fully dark up to ~40 % of the width, the whole sky and all weather
       from 70 % (was ~43 % and ~73 %). `MOON_HOLD` stays 0.45. Weather unit
       tests green. Please try: any outdoor room. Feedback wanted: is the
       band right now?

### 2026-10-19 — sunrise and sunset kept out of the band (translated)

104. **Sunrise and sunset only over the sky.** At sunrise the sun's light
     covers the whole width; it should only be within the sky right of the
     left band, and the rays should fade out like the sky and not show in
     the band. The sunset is redone: the sun lies just left of the
     transition between the band and the sky, the rays come from there,
     neither rays nor light show in the band, and the sunset's rays are
     dimmed by about 40 % all through.
     - **Done (2026-10-19):** ADR 0093, "The sun's light over the sky only".
       The sun's glow, its rays and beams, the sweeping light front and the
       glints on frames all fade out along the band's curve, for sunrise and
       sunset alike; the sky's tint stays out of the band through both. The
       sunset's sun now stands at the band's solid edge (~40 % of the width),
       sinking from above the top to the horizon there; its light and rays
       come out of the band's fade at the same angles as before. Sunset rays,
       beams and their glints are at 60 %. Weather unit 178/178, e2e weather
       6/6 (Chromium, Firefox).
       Screenshots (2000 px wide): sunrise 12 s before day
       `img/28-item104-sunrise-12s.png`; sunset 25 s and 8 s before night
       `img/28-item104-sunset-25s.png`, `img/28-item104-sunset-8s.png`.
       Please try: a sunrise and a sunset in the game (or `__weather.jump`).
       Feedback wanted: is the band clear now, is the sunset sun in the right
       place, and are the dimmed sunset rays right?

### 2026-10-19 — sunset rays upward, dusk light (translated)

105. **Sunset rays too bunched; a dusk light.** At sunset the rays are
     bunched within a narrow span of angles; rays pointing upward are
     missing, mostly at the end of the sunset (the owner's arrows: from
     ~20° to ~60° up). Also more red-orange dusk light from the sun (not the
     rays), as a sunset looks: noticeable from 50 s before the sunset,
     strongest at ~20 s, and nearly dark from the sun at 8 s (as today).
     - **Done (2026-10-19):** ADR 0093, "Sunset rays upward and a dusk
       light". Over the sunset's last 40 s the fan now opens upward as it
       lifts: at the end the rays spread from level to about 60° up (they
       stopped at ~30° before). A new red-orange dusk glow rises from the
       west from -50 s, is strongest at -20 s and is gone at -8 s; it sits
       round the sun, low over the sky, and stays out of the left band.
       Weather unit 178/178, e2e weather 6/6.
       Screenshots: `img/28-item105-sunset-35s.png`,
       `img/28-item105-sunset-20s.png` (strongest dusk),
       `img/28-item105-sunset-12s.png`, `img/28-item105-sunset-8s.png`
       (the fan opening upward).
       Please try: a sunset in the game. Feedback wanted: are the rays
       spread enough upward, and is the dusk light the right strength and
       colour (it can go stronger, redder or higher up)?

### 2026-10-19 — dusk light near the sun (translated)

106. **The dusk light mainly near the sun** (the owner's circle: round the
     sun at the band's edge, upper middle of the screen). It may be sensed a
     little further away, more subtly. Now almost the whole sky fills with
     red, and above all it should not show so much at the bottom.
     - **Done (2026-10-19):** ADR 0093 (same addendum, "Near the sun"). The
       dusk light is now a smaller core round the sun, at its height,
       moved a little right so it is seen out of the band's fade, plus a
       faint flat halo further out that ends well above the bottom. Timing
       unchanged (-50 / -20 / -8 s). Weather unit 178/178, e2e weather 6/6.
       Screenshots at -20 s: `img/28-item106-sunset-20s.png`, a taller
       window `img/28-item106-sunset-20s-tall.png`; -35 s
       `img/28-item106-sunset-35s.png`.
       Please try: a sunset. Feedback wanted: is the glow where you want
       it, and its size and strength right?

### 2026-10-20 — sunset rays fade earlier (translated)

107. **From 16 s to 10 s before the night the sun rays should fade down
     about 50 %** relative to their strength now; then, from the strength
     they have at 10 s before the night, keep fading out with about the
     course they have now (from that strength).
     - **Clarified (2026-10-20):** not a drop over the whole span: the
       fall starts at -16 s and at -10 s the level is 40 % below today's.
     - **Done (2026-10-20):** ADR 0093, "A sunset's rays fall 40 % before
       the night". The rays and beams start to fall at -16 s, are 40 %
       below the old level at -10 s, then fade out on the same course as
       before, from that level. Their glints on the frames follow. The dusk light and the
       sun's glow are unchanged. Weather unit 178/178.
       Please try: the last 20 s of a sunset. Feedback wanted: is the drop
       right in size and timing?

### 2026-10-20 — a better weather demo (translated)

108. **Improve `#weather demo`.** Now it opens with a short, jerky clip of
     night with a moon that jumps in position, then jumps into the end of a
     sunrise, which also feels jerky. Review the whole sequence so it runs
     evenly and builds the effects up step by step for a "wow" factor.
     Suggested: a night sky; a fast-forwarded sunrise (the whole sequence,
     about 2×, then 2.5–3× so the time does not run away); some day with
     flying birds, turning to rain; night (the whole sunset ×2); in the
     night the moon peeks in, clouds, a downpour, thunder, the weather
     turns to snow; then a fast-forwarded sunrise; also show every other
     effect forgotten (stunned, incapacitated etc.). A little longer is
     fine, preferably not over 4–5 minutes; fill in what is missing.
     - **Done (2026-10-20):** ADR 0091, "Demo" (2026-10-20 addendum). 27
       steps, about 4:40: a clear moonless starry night with shooting
       stars → a whole sunrise at 2.5× (24 s) → morning, birds, an insect →
       clouds roll in → rain → the rain passes and the sky clears → a whole
       sunset at 2.5× → night falls, the stars fill in → the moon rises at
       the right edge → clouds hide it → downpour → thunderstorm → snow and
       a gust → fog → a darkness spell → dawn: the sky clears and a second
       whole sunrise → a new day → indoors and out → sleeping, stunned,
       incapacitated, dying, on your feet → back to the game. Only the first
       step jumps; everything after eases. The moon now goes by its own
       clock from the right edge, so it never jumps. Weather unit 179/179,
       e2e weather 6/6; a full real-time run checked by screenshots every
       5 s.
       Please try: `#weather demo`. Feedback wanted: is it even, does it
       build up, is anything missing or too long?
     - **Follow-up (2026-10-20):** cut it to about 3 minutes; no need to
       say it runs at 2.5× or to be too technical in the captions (the
       owner likes the texts and how they tell a story); 3× instead of
       2.5× for the sunrises and sunsets; merge some parts or let them run
       a little faster.
     - **Done (2026-10-20):** 3:00, 21 steps. Sunrises and sunsets at 3×
       (20 s each). Merged: morning and birds; clouds and rain; nightfall
       and the moonrise; clouds and the downpour; the darkness spell's
       start and end; indoors and out. The rest a little shorter. The
       captions no longer mention the pace. Weather unit 179/179, e2e
       weather 6/6; a full real-time run checked by screenshots.

### 2026-10-20 — performance review (translated)

The owner: close to the goal; review the code and the performance after
many iterations. A stutter seen once at a sunset. Proposals welcome, but
the experience must not get worse (or only marginally; no lower fps).

Review (four read-only agents, 2026-10-20): Firefox draws a sunrise or
sunset at 15–19 fps (worker frame 50–68 ms, headed, owner geometry)
against the 30 fps the turn asks for, with a 75 ms first frame; Chromium
~3 ms. All of it is the sky (full-screen fills rasterised on the CPU).
ADR 0093's ~16 ms was a Chromium figure. The owner approved the whole
package and a marginally softer shadow edge in the sun's glow.

109. **One-off spikes** (no visible change): the day life's full-screen
     texture (43–80 ms on the first day frame), a lightning strike's setup
     in one frame, the ray layer and grain built at a turn's first frame.
     - **Done (2026-10-20):** ADR 0091, "Performance review (items
       109–111)". Day life textures built in 3 ms slices with a cheap PRNG
       (Chromium's first day frame 58–74 → 4–10 ms); a strike's setup over
       the leader frames (≤ 6 ms each; frame gaps max 82–100 → 50–67 ms).
       The turn's ray layer and grain are sky.ts: left to item 112.
110. **Bugs:** a `theme` post (and a re-init of every module) on any pane
     or appearance change; a clock-started turn never drawn while the loop
     is idle indoors; window resize rebuilds the modules on every step
     instead of settling; the sun's position stale when stepping out
     mid-turn; spatter sprites kept at the old dpr.
     - **Done (2026-10-20):** theme posted and modules re-inited only on a
       new background; an indoor turn keeps the loop awake; a window drag
       rebuilds at most once per 250 ms and once after; spatters rebuilt at
       a new dpr. Unit tests added. The stale sun position is sky.ts: left
       to item 112.
111. **Other Firefox scenes** (no or marginal visible change): moon halos
     as one sprite; fog drawn once per element instead of once per tint;
     the fog cache copied up only where it holds something; the heartbeat
     wash as one upscale; nothing drawn or copied in the band's solid part;
     no FPS_FAST floor for slow modules during a whole turn; the front
     canvas left alone while empty.
     - **Done (2026-10-20):** all but the sky.ts parts (moon halos, the
       band's solid part in the sky; left to item 112). Firefox: dense fog
       at night 28–29 → 22–25 ms/frame (fog 19.7 → 13–14), dying 31–32 →
       19–24 (body 24 → 10–12). Screenshots before/after look the same.
       Open: at the now reached 30 fps the bench's heavy+dying scene raises
       Firefox's text → paint p95 (18–19 → 26–41 ms; at a 20 fps cap 19).
112. **Sunrise and sunset in Firefox** (goal: a steady 30 fps, frame
     ≤ ~25 ms): the sun's glow, dusk light, band cut and shadow cut in a
     half-resolution layer; the sky gradient cheaper during a turn; a
     cheaper grain pass. Before/after screenshots at fixed turn times.
     - **Done (2026-10-20):** ADR 0093, "Firefox turn cost (item 112)";
       `bench/weather-turn.ts`. Firefox (headed, owner geometry) 46–69 ms
       at 15–21 fps → sunset 22–24 ms, sunrise 26–28 ms, 30 fps
       throughout, no first-frame spike; Chromium ~2 → ~2.8 ms. The sun's
       light, sky, rays, beams and cuts in one half-size layer, the sky cache at a
       quarter during a turn, one quarter-size shadow mask, grain and merge
       within the drawn bounds, nothing in the band's solid part (sky,
       deck, stars, sun layer), stars as single fills on the CPU, one moon
       halo sprite, the stale sun position and the indoor turn rate fixed,
       less garbage. Screenshots match to ~0.1–0.2 levels on average.
113. **Cleanup:** dead code and stale names left from the iterations, one
     band gradient helper, stale ADR text. No change in behaviour.
     - **Done (2026-10-20):** the moon's lead plumbing (0 since item 100),
       the sky's dead tick and unread fields, `sunPos` / `turnFull`, unused
       params in weather.ts and daylife.ts, clearer names (`sw`, `R`, snow
       fills), `lerp` / `rr` in env.ts, `bandGradient` everywhere; ADR 0091
       "Corrections (item 113)". src/weather −73 lines. Firefox turn bench
       unchanged (sunset 22–25, sunrise 25–27 ms avg, 30 fps).
