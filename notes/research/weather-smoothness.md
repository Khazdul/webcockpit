# Weather smoothness (stage 31b)

Why falling snow feels laggy or jerky, measured; and the other effects
reviewed the same way. Decision: ADR 0113.

## Setup

- Machine: i7-12700H, the laptop screen eDP-1 (60.001 Hz, scale 2). Headed
  Firefox 155 and Chromium 153 (Playwright builds), page at 1728 × 1000 CSS
  px, `devicePixelRatio` 2 (logged per scene). The weather canvases are at
  ratio 1 as always (`CANVAS_RATIO`): one canvas px is 2 × 2 device px.
- Every run checks the page's own animation frame rate before (≥ 55 Hz)
  and while measuring; a scene whose window was hidden or throttled (Firefox
  dropped to 1–17 Hz several times while other sessions used the desktop)
  is measured again or thrown away. The first exploratory runs (on the
  external screen, display scale 1.5, page still at ratio 2) are not used.
- `bench/weather-smooth.ts` (new): per scene 6 s settle, 8–10 s measured.
  - **Worker trace** (`stats({ trace: true })`, engine.ts): per drawn
    frame the animation frame's time, the callback's start and the end of
    drawing. Reported: frame intervals in refreshes, the callback's delay,
    drawing time, frames ending after the next refresh.
  - **What the page shows**: a main-thread rAF loop copies a 160 × 120
    patch of the back canvas each refresh and notes when it changed; the
    runs between changes are the presented cadence (30 fps on 60 Hz: 2, 2,
    2 …).
  - **Flakes**: the near flakes' `fillRect` calls matched frame to frame:
    step per frame, and the spread of each flake's speed (step / interval)
    against the spread of its step.
- `bench/weather-power.ts` for browser CPU (ms per s, all browser
  processes), 2 rounds × 15 s. Other sessions ran Playwright browsers at
  the same time (flagged "foreign" in its output; load up to 9): CPU
  numbers are ±15 %.

## Snow: what it is not

| | Chromium | Firefox |
|---|---|---|
| Frame intervals (30 fps) | 100 % exactly 2 refreshes | 100 % exactly 2 refreshes |
| Callback after its refresh, p50 / p95 | 0.4 / 0.7 ms | 0.4–1.8 / 0.6–4.6 ms |
| Drawing, avg / p95 / max | 1.2 / 2.4 / 3.6 ms | 6.1 / 11.1 / 14.4 ms |
| Shown: runs of 1 / 2 / 3 refreshes | 0 / 100 / 0 % | 0 / 100 / 0 % (one run: 10 / 79 / 10 %) |
| Flake step per frame | 1.9 px (canvas) | 2.0 px |
| Spread of speed vs spread of step | 26.8 vs 26.8 % | 27.1 vs 26.4 % |

- **Uneven pacing: no.** The loop already runs on the worker's
  requestAnimationFrame (both browsers have it) and takes its time from the
  refresh grid; every frame is two refreshes from the last.
- **Motion per frame instead of time: no.** `dt` is the refresh-grid
  interval; a flake's speed varies exactly as much as its step does (the
  spread is its sway and the gusts, not timing).
- **Sub-pixel snapping: no** for snow (fractional `fillRect`,
  anti-aliased). Yes for birds (below).
- **Worker → compositor hand-off: fine in Chromium**; Firefox shows a frame
  on the next refresh while its drawing ends in time. In one run with
  longer frames (p95 15, max 23 ms: the sky's cached redraw landing on the
  same frame) a fifth of the frames were shown a refresh late or early
  (3, 1 instead of 2, 2): an occasional stumble on top.
- **Dropped frames / GC: no** in snow (max frame 3.6 ms Chromium, 14–23 ms
  Firefox, inside the 33 ms budget).

**Root cause: the rate.** At 30 fps each flake stands still for two
refreshes, then jumps ~2 canvas px (4 device px). Snowflakes are small,
sharp, slow, and the eye follows them, which is exactly where a low rate
shows as judder; rain's long fast streaks hide it.

## Snow at 60 fps (`FPS_SMOOTH`)

| | Chromium 30 → 60 | Firefox 30 → 60 |
|---|---|---|
| Frame intervals | 100 % 2 → 100 % 1 refresh | 100 % 2 → 100 % 1 refresh |
| Shown | every 2nd → every refresh (100 %) | every 2nd → every refresh (100 %) |
| Drawing avg / p95 / max (day) | 1.2 / 2.4 / 3.6 → 0.8 / 1.6 / 4.9 ms | 6.1 / 11.1 / 14.4 → 4.3 / 7.8 / 12.5 ms |
| Drawing avg / p95 / max (night) | 1.6 / 3.4 / 5.1 → 0.9 / 1.9 / 3.4 ms | 7.4 / 13.2 / 21.2 → 5.2 / 9.6 / 11.7 ms |
| Frames ending after the next refresh | 0 → 0 % | 0–3 → 0 % |
| Flake step | 1.9 → 0.9 px | 2.0 → 1.0 px |
| Browser CPU, ms/s (weather-power, snow by day) | 740 → 852 (+15 %) | 463 → 518 (+12 %) |

Cheaper per frame than feared: the overcast sky (15–20 fps) redraws its
cache on every 3rd–4th frame instead of every 2nd and is copied in
between, so the average frame got shorter and steadier; in Firefox no
frame ended after the next refresh and the stumble above did not occur at
60 fps.

## The other effects

Baseline (30 / 20 / 12 / 10 fps as before), drawing avg / p95 / max ms,
frames on the refresh grid:

| Scene | Rate | Chromium | Firefox | Cadence | Verdict |
|---|---|---|---|---|---|
| Heavy rain | 30 | 1.2 / 3.0 / 3.9 | 6.5 / 11.9 / 17.2 | 100 % 2 refr. | fine: fast long streaks |
| Light rain | 30 | 1.3 / 2.9 / 4.2 | 6.2 / 11.3 / 14.6 | 100 % 2 | fine |
| Clouds | 20 (Fx 15) | 1.0 / 2.1 / 4.1 | — | 3 refr. (2 while the cover eases in) | fine: motion is a key-frame cross-fade |
| Dense fog | 12 | 1.2 / 2.2 / 2.9 | 17.5 / 22.8 / 25.5 | 100 % 5 | fine: soft banks at 2–13 px/s, half resolution |
| Night, moon, stars | 12 | 0.7 / 1.3 / 1.7 | 8.0 / 12.0 / 15.5 | 5 | fine: the moon moves ~0.2 px a frame |
| Birds | 10 | 0.7 / 1.3 / 1.8 | 5.6–10 | 6 | **jerky**: see below |
| Lightning | 60 burst | 1.5 / 3.4 / 52 | 7.9 / 17.3 / 35.4 | 1–2 | fine; one long frame at a strike's start (known, item 109) |
| Sunset | 30 | 1.6 / 3.0 / 4.7 | 22–25 (ADR 0093) | 100 % 2 | fine: slow light |
| Cloud cover change | 30 | 1.3 / 2.5 / 6.8 | — | 100 % 2 | fine |

("—": Firefox's window was throttled in that scene; the earlier weather
benches cover it.)

**Birds** (daylife.ts): 10 fps and positions rounded to whole pixels. A
bird flies 16–46 px/s, so it jumped 2–5 px every 100 ms, by an uneven
whole-pixel amount, and its six wing frames (2.2–3.4 flaps a second) were
sampled 3–4 times a flap. Fixed: sub-pixel places, and a higher rate while a
flock (or the insect) is on screen. The rate is a trade-off, because while
birds fly the day sky (which otherwise crawls at 3 fps) is drawn whole every
frame:

| Birds | Chromium CPU ms/s | Firefox CPU ms/s | Bird step per frame |
|---|---|---|---|
| 10 fps (before) | 198 | 226 | 2–5 px (whole px) |
| 30 fps (now) | 316 | 450 | 0.5–1.5 px |
| 60 fps | 691 | 595 | 0.3–0.8 px |

(A clear day without birds: ~30–45 ms/s. A flock is on screen for 25–60 s
every 70–170 s by day, i.e. about a third of a clear day outdoors.)
Chromium's extra cost at 60 is mostly its GPU process (533 ms/s), which
composites the page, glass blur included, on every canvas frame.

## Options for the owner

1. **Birds at 60 instead of 30** (as smooth as the snow): +~250–370 ms/s
   of browser CPU while a flock flies (≈ +100 ms/s averaged over a clear
   day). Branch default: 30.
2. **Rain at 60**: not changed; rain at 30 looks continuous because its
   streaks are long and fast. Doubling it would cost about what snow's
   change did (+10–15 %) on top of a heavy scene; only if rain is ever
   felt to stutter.
3. A cheaper bird frame (birds as their own small layer over a cached sky)
   would cut Firefox's worker share, not Chromium's GPU-process share
   (that is per frame, whatever changed). Not done.

## Not affected

- **Text latency with snow on** (`bench/weather-bench.ts --quick --state`
  snow, headed, effects off / on):

  | | Chromium off / on | Firefox off / on |
  |---|---|---|
  | Text → painted median / p95, before (30 fps) | 16.2 / 25.7 · 16.0 / 25.5 ms | 11.5 / 21.7 · 12.0 / 19.9 ms |
  | Text → painted median / p95, after (60 fps) | 14.7 / 24.8 · 15.5 / 22.7 ms | 13.1 / 21.2 · 10.7 / 20.6 ms |
  | Key → send p99 (before → after, on) | 0.145 → 0.100 ms | 0.340 → 0.260 ms |
  | rAF gap p95 (on) | 17.3 → 17.1 ms | 17.6 → 17.3 ms |
  | Worker frame avg / p95 / max (on) | 1.30 / 2.95 / 6.7 → 0.65 / 1.48 / 2.6 | 9.87 / 16.4 / 27.1 → 5.88 / 11.9 / 20.2 |

  Chromium's idle main thread in snow: 323 → 626 tasks per 5 s, 21.6 →
  35.5 ms in all (one small task per canvas frame); no long tasks.
- **Sunset in Firefox** (`bench/weather-turn.ts --browsers firefox --turns
  set`, after): 30 fps throughout, frame avg 10.7–12.9 ms, p95 ≤ 16, max ≤
  22 ms per phase (ADR 0093's goal ≤ ~25 ms); the turn's code path is
  unchanged.
