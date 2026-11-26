# 0168 — The balloon's flight on the compositor

Date: 2026-11-26. Status: accepted (built on `stage-79-balloon-smoothness`;
stage 79). Related: ADR 0159 (balloon notices: the frame loop, the fixed
layers, the cost notes), ADR 0164 (the morph's proxy on the compositor),
ADR 0135 (Firefox's frame pacing).

## Context

The owner's report (stage 79): the balloons' motion is a little jerky now
and then, mostly when a balloon flies fast and a little even when it is
nearly at rest; in Firefox on the Linux laptop (3456 × 2160 at scale 2),
less on a smaller Windows laptop.

What the main session measured (`docs/stages/79-balloon-smoothness.md`):
the picture is sub-pixel smooth and rigid; on mains power the frame rate
is clean; on battery Firefox loses frames (one balloon 20–25 frames per
4 s, four balloons 40 fps), and the loss follows the rig's filtered SVG
and the device pixels. And everything hung on the main thread: the flight
wrote one transform per `requestAnimationFrame` (ADR 0159), so any late
main-thread frame (the raster, or game text, panes and GC in a fight,
which is when balloons fly) was a hitch of the whole balloon; the
transform was rounded to 0.1 px.

## Decision

- **The whole balloon's flight is a Web Animation.** The wrapper's
  (`.wc-balloon`) transform (`translate3d(x, y, 0) scale(s)`, the same
  shape in every keyframe) and its opacity are one animation per balloon
  (`el.animate`, linear, `fill: forwards`), its keyframes sampled from the
  same `flightAt` (`flight.ts flightKeys`, `flightTransform`: a
  thousandth of a px, five decimals of scale). Transform and opacity
  only, so the browser may run it on its compositor.
- **One clock.** The balloon's `t` is the animation's `currentTime`. The
  frame loop reads it and does, as before, everything inside the balloon
  from the same `flightAt`: lean, swing, burner (its step is the change
  of `t`), the layer change at the glide, `rest`, `phase`, the end. It
  writes no transform and no opacity. A hidden page pauses the
  animations (`visibilitychange`; only a running one is paused and only
  a paused one played, since `play()` on a finished one would start the
  flight again). A finished animation is the end of the flight; destroy
  paths cancel it.
- **A changed plan keeps the animation.** A joined kill (`extendRead`)
  and a hurried fade (`fadeAt`, folded into the opacity keyframes) give
  the *same* animation new keyframes and, when the end moves, a new
  duration (`KeyframeEffect.setKeyframes`, `updateTiming`), in the same
  task. Its clock is not touched. (The brief was a new animation with its
  `currentTime` set: a new animation is play-pending until the browser
  has it ready, a frame or more of standstill; this has none.) A join is
  decided on the animation's time now, not the last frame's.
- **Few keyframes at a time, on a fixed grid** (see "What Firefox does
  with many keyframes"). Every 1/12 s (`KEYFRAME_DT`) over the next 4 s
  (`KEYS_AHEAD`), renewed when less than 2 s are left (`KEYS_MARGIN`);
  one keyframe at the launch (the past, never shown) and one at the
  flight's end: about 50. The grid is fixed from the launch, so two
  spans agree where they overlap and a plan's keyframes before and after
  a joined kill agree up to its time (a join needs 0.4 s of readable time
  left, more than one grid step): nothing jumps. A fade's first keyframe
  lies on the chord it starts from.
- **Reduced motion**: the same machinery, four keyframes, one transform,
  the fade in and out.
- **Without Web Animations** (`BalloonsHost.compositor: false`; default:
  `Element.animate` and `KeyframeEffect.setKeyframes` exist): the frame
  loop writes the transform and the opacity as before, from the same
  `flightAt` and `flightTransform`. The option is explicit because
  happy-dom 20 has a working `animate` (its timeline is
  `performance.now()`), so the unit tests run both paths.
- `Balloons.flights()` (tests, dev): each balloon's element, plan, clock
  and animation, so a test can hold the box against `flightAt`.
- Unchanged: `rig.ts`, the passengers, `will-change: transform, opacity`
  on the wrapper, the fixed layers (ADR 0159 round 3), the path, the
  timings, the look.

## What Firefox does with many keyframes

The first build gave the animation the whole flight at 1/30 s: about
2150 keyframes for a long one. In headless Firefox (software WebRender),
four balloons, `measure.mjs` (main-thread frames), the browser under a
CPU quota (`systemd-run --user --scope -p CPUQuota=…`):

| CPU quota | main (per-frame writes) | whole flight, 1/30 s | whole flight, 0.2 s (350) | 4 s ahead, 1/12 s (about 50) |
| --- | --- | --- | --- | --- |
| none | 60.0 | 59.7 | | 58.3 |
| 400 % | 59.9 | 39.8 | | |
| 250 % | 59.9 | 38.7 | 59.9 | 59.9, 56.3 |
| 150 % | 59.2, 58.4, 57.4 | 27.7, 29.4 | 48.4 | 48.2, 53.3, 51.6, 52.3 |
| 100 % | 37.5 | | | |

With the whole flight at 1/30 s and a 250 % quota: without the opacity
in the keyframes 40.7 and 41.9; `will-change: auto` 31.6; the filters
off 38.4; the rig hidden (four empty boxes animated) 50.6; one balloon
at 150 %: 60.1. So the cost is the animation itself and grows with its
keyframes, not with what is drawn: Firefox sends an animation's
keyframes to its compositor again with each paint of the page, and a
balloon's parts repaint every frame. Hence few keyframes at a time.
Chromium at 150 %: 59.9 with the whole flight.

What is left at 150 % (about 52 fps against 58): the frames are lost in
the first ten seconds of the leave (four balloons shrinking in the sky
layer); the arrival, the read and the later drift lose none. Not
examined further. These are main-thread frames under a quota the
compositor shares; see "Not measured".

## What was measured

- **The keyframes against the flight** (unit): linear between two
  keyframes is within 0.1 px of `flightAt` for the whole balloon (its
  scaled foot included) over 180 flights on three layouts, joined kills
  among them. At 1/30 s the worst over 600 flights was 0.0056 px; at
  1/12 s that is about 0.035.
- **The balloon against the plan** (e2e, Chromium and Firefox): the
  wrapper's `getBoundingClientRect()` against `flightAt` at the
  animation's time, in one task, at three moments of the arrival, right
  after a joined kill, during and after `#weather balloon burst`, and in
  the leave (the sky layer, scale under 1; the origin is `50% 0`): at
  most 0.03 px off; a joined kill moves the box by exactly 0; one
  animation, the same one from the launch through the layer change,
  running, and no inline transform or opacity.
- **A blocked main thread** (`notes/research/balloons/pacing/stall.mjs`:
  headless, 1280 × 720, the page's video at 25 pictures a second, a
  magenta bar on the wrapper; a busy loop of 700 ms, 2.5 s into the
  arrival at about 100 px/s):
  - main: the bar stood on one row for 18 pictures (720 ms) and then
    stepped 12 px, in Chromium and in Firefox (the frame loop's 0.1 s
    cap: the flight lost 0.6 s).
  - this build: it rose in every picture; the largest step 7 px in both
    browsers. A 3 s block in Firefox: the same (largest step 9 px),
    though its keyframes reached only 2 to 4 s ahead: the rest of the
    block is the straight line to the flight's end.
- **Main-thread frames, headless, no quota, four balloons, 16 s**:
  Firefox 60.0 → 58.3 (27 frames lost), Chromium 60.1.
- **The whole browser starved** (`stall.mjs` with no block, 100 % quota,
  four balloons; the mean change of the bar's step from one picture to
  the next): main 6.7 and 7.3 px (it stood still for up to 200 ms, steps
  up to 53 px), this build 6.6 and 7.9 px (120 ms, 29 px); unloaded 2.0
  and 2.1 (the pictures' whole pixels). When the compositor itself has
  no CPU (software WebRender, the video's capture included), an
  animation on it does not help.

## Not measured

- **The owner's case: Firefox with the GPU, on battery.** The headed
  runs were made while the screen was locked (a picture of the browser's
  window showed the lock screen): 30 fps with and without the change,
  and 53–56 with no balloon at all. They say nothing and are not in the
  table. `notes/research/balloons/pacing/compositor.mjs` (WebRender's
  profiler overlay, photographed) is written for it and has not been
  seen working.
- So it is **not shown that the balloon is presented at 60 frames a
  second where it was not before**, only that its flight no longer waits
  for the main thread. Whether Firefox runs the animation on its
  compositor cannot be asked from a page; the conditions are met (a
  transform and opacity animation on a 204 × 363 box, no
  `transform-style`, no animated geometry), and the blocked-main-thread
  run shows it does in headless Firefox (software WebRender; the GPU's
  WebRender samples such animations the same way).

## Consequences

- A late main-thread frame no longer stops the balloon. The parts inside
  (lean, swing, flame, sign, ropes, the passenger's life) still move at
  the main thread's rate and still repaint the rig every frame: in
  Firefox the raster the stage file measured is still paid while a
  balloon's parts move. If the owner still sees jerks on battery, that
  is the next place: fewer writes inside (the parts at half rate, or
  only on a visible change), not the flight.
- The position is exact to a thousandth of a px and no longer follows
  Firefox's 1 ms `requestAnimationFrame` timestamps.
- A main thread hung for longer than the keyframes reach (2 to 4 s):
  the balloon heads straight for where its flight ends until the frame
  loop is back, then takes up its path again (a jump by however far the
  two differ).
- A kill that joins while the main thread has been blocked for more than
  the 0.4 s a join needs could change the plan under a balloon the
  compositor already flies past the read (the page's animation time is
  its last frame's): a jump back. Not seen; a fight's long tasks are tens
  of ms.
- Chromium holds a new animation until its first frame is ready: under
  load the clock stood at 0 for up to half a second after the launch
  (the balloon is below the bottom edge then). And when the rig first
  comes into view, headless Chromium under a parallel test run stopped
  its frames for 0.75 s (the rig's first raster): there before this
  change too, where it stopped the flight; now the flight's clock runs
  through it.
- A reduced-motion balloon has one running animation on its wrapper
  (opacity only); nothing in the rig is animated, as before.
- The frame loop's work per balloon and frame is `flightAt` and the
  parts, plus about 50 keyframes every 2 s.
