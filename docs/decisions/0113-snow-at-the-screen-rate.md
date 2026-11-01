# 0113 — Snow at the screen's rate, birds at 30

- Status: Accepted
- Date: 2026-11-01
- Builds on ADR 0091 (weather effects: "Rate by content", owner feedback
  4 "Heat" and 56), stage 31b (`docs/stages/31-clock-and-snow.md`, owner
  brief item 2)
- Measurements: `notes/research/weather-smoothness.md`,
  `bench/weather-smooth.ts`

## Context

The owner finds falling snow laggy and jerky (stage 31 brief, item 2;
earlier item 56). Snow drew at `FPS_FAST` 30. The question was whether
that is the frame rate or something else: uneven pacing, motion tied to
frames instead of time, whole-pixel snapping, the worker → compositor
hand-off, dropped frames.

Measured (headed Firefox 155 and Chromium 153, 60 Hz screen, page ratio 2,
the canvases at ratio 1 as always; `bench/weather-smooth.ts`):

- **Pacing is even.** Every snow frame came exactly 2 refreshes after the
  last (100 % of intervals, both browsers), its callback 0.4–1.8 ms after
  the refresh (p50), drawing done in 1.2 ms (Chromium) and 6.1 ms
  (Firefox, p95 11) — well inside the 33 ms. What the page showed (a
  main-thread probe of the canvas) changed every second refresh too.
- **Motion follows time.** A flake's step over its frame's interval is as
  steady as its step (the interval does not vary); the step is 1.8–2.0 px.
  Positions are fractional and drawn anti-aliased: no snapping.
- **Hand-off.** Chromium shows every frame on its refresh. Firefox does
  too while a frame's drawing ends within the refresh; in one run with
  longer frames (p95 15, max 23 ms) a fifth of its frames were shown a
  refresh late or early (3/1 instead of 2/2).

So the jerk is the rate itself: a small sharp dot that the eye follows
stands still for two refreshes and then jumps 2 px (4 device px on the
owner's screen). Rain's long, fast streaks do not show it.

Reviewing the other effects the same way found one more of the same kind:
**birds** at `BIRD_FPS` 10, drawn at whole pixels: a bird jumped 2–5 px
every 100 ms and its six wing frames were sampled 3–4 times per flap. The
rest is even and slow enough for its rate: clouds (20, Firefox 15; their
motion is a cross-fade of key frames), fog (12; banks at 2–13 px/s, half
resolution, soft), the night sky (12; the moon moves ~0.2 px a frame),
sunrise and sunset (30; slow light), cover changes (30), lightning (60),
rain (30).

## Decision

- **`FPS_SMOOTH` 60** (env.ts): small, sharp things the eye follows.
  The weather module asks it while snow falls or fades out
  (`snowAmt > 0`, flakes left, or the fade running); rain stays at
  `FPS_FAST`. The loop runs at the fastest module's rate as before, so the
  sky, fog and the rest keep their own rates and caches.
- **Birds and the insect** ask `BIRD_FPS` = `FPS_FAST` 30 (was 10) while
  they are on screen (a flock crosses in 25–60 s, one every 70–170 s); the
  bird strip is drawn at its exact, fractional place (it was rounded). Not
  60 like the snow: while birds fly the day sky (otherwise at `FPS_STILL`)
  is drawn whole every frame, and 60 cost the browser ~600–700 ms of CPU a
  second against ~320–450 at 30 and ~200 at 10. 60 is left to the owner.
- **The snow fade starts at 0** (it started at 1 and ran its 10 s fade on
  every load, which made a rain scene ask the snow's rate for 10 s).
- **Frame trace.** The engine keeps per frame the animation frame's time,
  the callback's start and the end of drawing (`stats({ trace: true })`);
  `bench/weather-smooth.ts` reads it per scene with a main-thread probe of
  what the page shows and the flakes' steps.

## Cost

Browser CPU (ms per s, all processes; `bench/weather-power.ts`, headed,
2 rounds × 15 s, other sessions' browsers running: ±15 %):

| Scene | Chromium before → after | Firefox before → after |
|---|---|---|
| Snow by day | 740 → 852 (30 → 60 fps) | 463 → 518 (30 → 60 fps) |
| Birds crossing | 198 → 316 (10 → 30 fps) | 226 → 450 (10 → 30 fps) |
| (birds at 60, not chosen) | 691 | 595 |

Worker frame in snow, avg / p95 / max: Chromium 1.2 / 2.4 / 3.6 → 0.8 /
1.6 / 4.9 ms; Firefox 6.1 / 11.1 / 14.4 → 4.3 / 7.8 / 12.5 ms (the
overcast sky now draws into its cache at its own rate and is copied).
Text latency with snow on (`bench/weather-bench.ts --quick --state` snow,
headed; text → painted median / p95): Chromium 16.0 / 25.5 → 15.5 / 22.7
ms, Firefox 12.0 / 19.9 → 10.7 / 20.6 ms; key → send unchanged
(≤ 0.35 ms p99). Chromium's idle main thread: 323 → 626 tasks per 5 s,
21.6 → 35.5 ms in all (a task per canvas frame).

## Consequences

- Snow moves every refresh on a 60 Hz screen, birds every second one; on
  a faster screen the loop's cap (`MAX_FPS` 60 with its early-frame slack)
  keeps snow at an even divisor of the refresh (120 Hz: 60; 144 Hz: 72).
- Considered and not done: a third canvas for the falling layer (the sky
  would not be copied every frame, but fog draws above the snow and would
  have to move too); drawing cached modules in a task after the visible
  frame (Firefox's frames already finish in time at 60 fps: p95 8 ms);
  rain at 60 (an owner decision: see the research note).

## Addendum 2026-11-01: one-effect demos

So the owner can judge the change without the browser console,
`#weather demo snow` (day then night snow), `#weather demo birds` (three
flocks and an insect on a clear day) and `#weather demo rain` (clouds,
rain, a downpour) play one effect alone, each under a minute, with the
same caption box and hand-back as the other demos (`demo-script.ts`
`SNOW_STEPS`, `BIRDS_STEPS`, `RAIN_STEPS`).

## Addendum 2026-11-01: birds at the screen's rate

The owner chose 60 for birds and insects (`BIRD_FPS = FPS_SMOOTH`),
like the snow, accepting the higher CPU while a flock is on screen
(measured ~600–700 ms/s of browser CPU against ~320–450 at 30).
