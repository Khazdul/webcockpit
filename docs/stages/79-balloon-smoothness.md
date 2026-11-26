# Stage 79 — Balloon smoothness

**Status: built and merged (2026-11-26); the owner: a considerable improvement, acceptable; what remains is open.**

## The owner's report (2026-11-26)

The balloons' motion is a little jerky now and then: subtle, seen mostly
when a balloon flies fast, and a little even when it is nearly at rest.
Seen in Firefox on the Linux laptop (3456 × 2160 at scale 2, and a 4K
external screen). Less of it in Edge and Firefox on a Windows laptop at
1280 × 800. Wanted: gone entirely, if that is possible.

## What was measured (main session, same day)

Tools: `notes/research/balloons/pacing/measure.mjs` (rAF frame intervals
while balloons fly, headed, fullscreen, the display's own scale) and
`snap.mjs` (a frozen balloon stepped by a fraction of a pixel, the
screenshots compared).

- **The picture is sub-pixel smooth and rigid.** Every 0.1 px step changes
  the pixels, envelope and sign text alike, in Firefox and Chromium; a
  whole-pixel step gives the identical picture moved. No snapping, no
  "boiling" of the pen filter.
- **On mains power the frame rate is clean.** Headed Firefox, fullscreen
  3456 × 2160 (scale 2), four balloons at once: 60.1 fps, no frame lost in
  16 s. Chromium the same.
- **On battery Firefox loses frames.** The same test in a half-screen
  window while the laptop ran on battery (the dock had been unplugged):
  one balloon lost 20–25 frames per 4 s during the read and the glide;
  four balloons ran at 40 fps. With the SVG filters off: 46–48 fps; all
  parts static but filtered: 49; static and unfiltered: 56; the rig hidden
  (empty boxes moving): 60. Chromium: 59–60 throughout. So Firefox
  rasterises the rig's SVG again, on the CPU, for every frame in which the
  balloon's transform is written from the main thread; the turbulence
  filter is the dearest part, and the cost grows with device pixels
  (scale 2: four times the 1280 × 800 laptop's).
- **Everything hangs on the main thread.** The flight writes one
  transform per rAF. A late main-thread frame (the CPU raster above, or
  game text, panes and GC during a fight, which is when balloons fly) is a
  visible hitch of the whole balloon. The rAF timestamp in Firefox has
  1 ms steps and the transform is rounded to 0.1 px: about ±0.2 device px
  of jitter at the fastest; small, but it goes away with the same change.

## Plan

Move the flight to the compositor (ADR 0168). The whole balloon's
transform (translate, scale) and opacity become one Web Animation per
balloon, its keyframes sampled from `flightAt` (linear between samples);
the browser's compositor then moves a rasterised balloon at every vsync,
whatever the main thread does. The parts inside (lean, swing, sign,
ropes, flame, the passenger's life) stay on the main thread's rAF, read
from the same clock (the animation's `currentTime`).

The look and the flight must not change: same path, same timings.

## Tasks

- [x] `flight.ts`: keyframes for a plan (pure, unit tested): times,
      transform parts and opacity sampled from `flightAt`; the sampling
      error against `flightAt` under 0.1 px. (`flightKeys`: every 1/12 s
      on a fixed grid, over a span; about 0.035 px.)
- [x] `balloons.ts`: one animation per balloon; its clock is the
      balloon's `t` (hidden page: paused; `extendRead`, the hurry fade:
      the same animation gets new keyframes at the same time, no jump);
      the layer change, `rest`, the inner frame hook and `list()` as
      before; without Web Animations (`compositor: false`; the unit
      tests run both), the present per-frame writes.
- [x] Few keyframes at a time (not in the plan; ADR 0168 "What Firefox
      does with many keyframes"): the next 4 s, renewed 2 s before they
      run out. A whole flight's 2000 keyframes cost Firefox more than
      the change saved.
- [x] Reduced motion: unchanged behaviour (fade in, stay, fade out).
- [x] Unit and e2e tests updated; a new e2e holds the balloon's box
      against `flightAt` (at most 0.03 px off, a joined kill moves it by
      0) in Chromium and Firefox.
- [ ] Measured: `measure.mjs` headed fullscreen, Firefox and Chromium,
      one and four balloons; with the CPU held back (a CPU quota on the
      browser) before and after. **Not done as planned:** the screen
      was locked during the build, so the headed runs are void (30 fps
      with and without the change). Done instead, headless: the CPU
      quota runs and `stall.mjs` (a blocked main thread no longer stops
      the balloon, both browsers). The owner's case (Firefox with the
      GPU, on battery) is still to be measured: `measure.mjs` and
      `compositor.mjs` with the screen unlocked.
- [x] ADR 0168; ADR 0159's cost notes point to it.

## Test guide (for the owner)

(As it was for the comparison, before the merge: the build on branch
`stage-79-balloon-smoothness` at port 5231, the code before it at the
owner's own server, port 5173. Since the merge 5173 serves the build.)

1. Open both in Firefox, side by side or one after the other, same
   window size. In each: Settings → Weather effects on, Balloons on.
2. Type `#weather balloon great`, and `#weather balloon burst`. Watch the
   whole flight: the rise, the rest at the readable spot, the leave.
3. Do it once on battery and once docked (the 4K screen).

Wanted: is the branch smoother than the present code, the same, or
worse; and, where it still jerks, whether it is the whole balloon that
jerks or the parts inside it (the lean, the sign, the ropes, the flame).

What the main session measured after the build (headed Firefox, on
battery, a half-screen window at scale 2, four balloons): the main
thread paints at 29 fps on the branch and on main alike (57 with the
rigs hidden; Chromium 55 with the rigs). So on battery the parts inside
still update at half rate; the branch can only have made the whole
balloon's motion independent of that, which numbers from the page
cannot show. If the parts are what jerks, the next step is the rig's
cost in Firefox (the SVG is rasterised again each frame its parts move).

## Owner feedback

**2026-11-26, after comparing the branch with main:** a considerable
improvement. Small jerks can still be felt now and then, harder to notice
than before and hard to place; perhaps most just after the balloon has
come to rest, and just as it starts to move again at a low, growing
speed. Acceptable as it is; better still would be a plus. Merged.

What the main session checked after that (mains power, headed Firefox,
scale 2, one balloon, the branch): the main thread lost no frame in four
flights; a balloon moved by its animation is drawn between pixels (no
snapping; `snap3` in the session, the animation's time stepped by 40 ms);
WebRender's own overlay (`compositor.mjs`, now seen working) showed 61 fps
and 2.4 ms of CPU per frame (max 3.0) during the leave. So nothing
measured on mains explains the jerks that remain. Not ruled out: the
parts inside on battery (the main thread paints them at half rate there,
and they move most at exactly those two moments: the sign's kick as the
balloon stops, the swing as it leaves); the move from the front layer to
the sky layer at the start of the leave (the rig is rasterised again).

**Same day, on battery (the owner unplugged it for this):** with the
flight on the compositor one balloon costs the main thread almost
nothing (`phases.mjs`, headed Firefox, five flights: no long frame during
the rise, the read or the leave), except one: **a 33 ms frame at the very
frame the balloon changes layer** (front → sky, a reparent), in five
flights of five. That is the second of the two moments the owner named.
`layer.mjs` does only that change during the read: the reparent gives a
34 ms frame (5 of 6); the same change of paint order by `z-index` (the
cockpit `isolation: isolate`, the back canvas at −2, the balloon's layer
from auto to −1) gives none (3 of 3), and the balloon is drawn. Round 2
builds the layer change that way.

## Round 2: the layer change without a reparent

- [ ] Each balloon keeps its place in the tree for its whole flight; it
      goes under the game text by a change of `z-index`, not by moving.
- [ ] The paint order is the same as before in every phase (under every
      pane, over the text while arriving and readable, under it after;
      over the weather's back canvas always).
- [ ] `phases.mjs` on battery: no long frame at the layer change.

**Round 2, built on branch `stage-79-round-2`, not merged (same day).**
A layer per balloon, the layer change by `z-index` (the cockpit isolated
only while balloons are loaded); unit 6243 passed, the balloon, weather,
windows and layout e2e 48 per browser. The change of layer by itself now
costs no frame, but the 33 ms frame at the glide's start is still there
on battery in every flight: with the SVG filters off, or the rig hidden,
it is gone, so it is the filtered rig rasterised again as the leave
begins (the shrinking that starts there, or the parts starting to swing:
not settled, the laptop went back on mains during that run). Not merged:
no gain shown yet, and it changes one stacking order (a bar popup open
during a pane drag is over the drag shield). The addendum to ADR 0168 and
`variants.mjs` are on the branch. Next, on battery:
`variants.mjs firefox control,still,control,still headed`.

**Later the same day, on battery again** (`variants.mjs` on the round 2
branch, headed Firefox, one balloon per flight). The long frame at the
glide's start comes in about half the flights and no single cause
removes it: the parts frozen 2 of 2 with it; no shrinking 0 of 2; no
`rig-off` 1 of 2; no shrinking and no `rig-off` 1 of 1; unchanged 2 of 4.
Only the filters off (or the rig hidden) removes it every time. Four
balloons at once on battery (main-thread frames, the flight itself is the
compositor's): 41.8 and 41.9 fps; filters off 50.0 and 50.5; the rig
hidden 60.1. So the filters are about half of what the rig costs Firefox
there, its plain SVG raster the other half. One balloon, the usual case,
loses the main thread a frame at the launch (below the screen's edge) and
sometimes one at the glide, nothing else.

Where it stands: round 1 is merged and is the gain. Round 2 stays on its
branch (no gain shown that the eye could have). Going further means
making the rig itself cheap for Firefox to draw (its filtered layers as
bitmaps made once, or a cheaper noise than `feTurbulence`): a stage of
its own, with the look at stake. Not started; the owner's call.

