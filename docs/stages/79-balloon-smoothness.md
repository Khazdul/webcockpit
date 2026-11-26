# Stage 79 — Balloon smoothness

**Status: building (2026-11-26).**

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

To be written when built.

## Owner feedback

