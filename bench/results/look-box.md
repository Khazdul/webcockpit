# Layout B: the large box over the sky — frame times

Server: http://localhost:5302 (a `VITE_KIT=1` production build). Date: 2026-11-07 14:57 · load 2.40 6.43 16.26 · headed (real windows) · scene `skyMonth=4&skyHour=13&skyWeather=fair` · idle runs 6 s after 2–2.5 s settling; morphs 3× each way, 1.4 s from the key. `large blur`: the large window with `blur(9px)` and a 0.68 fill; `large flat`: no backdrop-filter, a 0.84 fill. Sky: quality tier and rate (`calm` behind a large box).

- chromium: ANGLE (Intel, Mesa Intel(R) Iris(R) Xe Graphics (ADL GT2), OpenGL ES 3.2)
- firefox: Intel(R) HD Graphics, or similar

| browser | geometry | variant | sky | rAF ms p50 / p95 / max | fps | frames > 20 ms | long frames (> 50 ms) |
|---|---|---|---|---|---|---|---|
| chromium | laptop 1728×1000 @2 | menu | high full | 16.7 / 17.1 / 34.2 | 58.2 | 12 | 0 |
| chromium | laptop 1728×1000 @2 | large blur | high calm | 16.7 / 17.0 / 17.2 | 60.0 | 0 | 0 |
| chromium | laptop 1728×1000 @2 | large flat | high calm | 16.7 / 16.9 / 17.3 | 60.0 | 0 | 0 |
| chromium | laptop 1728×1000 @2 | close | high calm | 16.7 / 23.1 / 33.1 | 58.0 | 6 | 0 |
| chromium | laptop 1728×1000 @2 | open | high full | 16.7 / 27.0 / 50.2 | 57.1 | 4 | 0 |
| chromium | laptop 1728×1000 @2 | close | high calm | 16.7 / 26.3 / 33.8 | 57.1 | 9 | 0 |
| chromium | laptop 1728×1000 @2 | open | high full | 16.6 / 17.2 / 34.0 | 59.3 | 2 | 0 |
| chromium | laptop 1728×1000 @2 | close | high calm | 16.7 / 27.1 / 33.6 | 57.9 | 5 | 0 |
| chromium | laptop 1728×1000 @2 | open | high full | 16.7 / 21.0 / 33.8 | 58.6 | 5 | 0 |
| chromium | phone 390×844 @3 | menu | high full | 16.7 / 17.1 / 33.8 | 58.7 | 9 | 0 |
| chromium | phone 390×844 @3 | large blur | high calm | 16.7 / 16.9 / 17.2 | 60.0 | 0 | 0 |
| chromium | phone 390×844 @3 | large flat | high calm | 16.7 / 17.0 / 17.5 | 60.0 | 0 | 0 |
| chromium | phone 390×844 @3 | close | high calm | 16.7 / 32.9 / 33.7 | 55.9 | 11 | 0 |
| chromium | phone 390×844 @3 | open | high full | 16.7 / 17.1 / 33.7 | 58.6 | 3 | 0 |
| chromium | phone 390×844 @3 | close | high calm | 16.7 / 33.5 / 34.0 | 56.4 | 6 | 0 |
| chromium | phone 390×844 @3 | open | high full | 16.7 / 17.1 / 33.4 | 58.6 | 3 | 0 |
| chromium | phone 390×844 @3 | close | high calm | 16.7 / 25.9 / 33.7 | 57.1 | 6 | 0 |
| chromium | phone 390×844 @3 | open | high full | 16.7 / 28.8 / 33.6 | 57.8 | 4 | 0 |
| firefox | laptop 1728×1000 @2 | menu | high full | 16.8 / 28.6 / 44.6 | 59.8 | 40 | n/a |
| firefox | laptop 1728×1000 @2 | large blur | high calm | 16.7 / 17.5 / 30.4 | 60.0 | 3 | n/a |
| firefox | laptop 1728×1000 @2 | large flat | high calm | 16.8 / 17.6 / 33.3 | 59.8 | 4 | n/a |
| firefox | laptop 1728×1000 @2 | close | high calm | 16.7 / 31.2 / 40.0 | 59.3 | 7 | n/a |
| firefox | laptop 1728×1000 @2 | open | high full | 16.8 / 31.3 / 47.7 | 59.3 | 13 | n/a |
| firefox | laptop 1728×1000 @2 | close | high calm | 16.7 / 30.7 / 47.6 | 58.6 | 5 | n/a |
| firefox | laptop 1728×1000 @2 | open | high full | 16.8 / 32.0 / 50.8 | 57.8 | 7 | n/a |
| firefox | laptop 1728×1000 @2 | close | high calm | 16.9 / 30.7 / 31.6 | 60.0 | 6 | n/a |
| firefox | laptop 1728×1000 @2 | open | high full | 16.7 / 31.7 / 32.0 | 60.2 | 10 | n/a |
| firefox | phone 390×844 @3 | menu | high full | 16.8 / 24.9 / 41.9 | 58.8 | 103 | n/a |
| firefox | phone 390×844 @3 | large blur | high calm | 16.9 / 17.6 / 30.8 | 60.0 | 10 | n/a |
| firefox | phone 390×844 @3 | large flat | high calm | 16.8 / 21.4 / 38.6 | 59.5 | 67 | n/a |
| firefox | phone 390×844 @3 | close | high calm | 16.7 / 24.0 / 40.4 | 59.3 | 21 | n/a |
| firefox | phone 390×844 @3 | open | high full | 16.7 / 17.9 / 25.4 | 60.0 | 3 | n/a |
| firefox | phone 390×844 @3 | close | high calm | 17.0 / 24.2 / 40.0 | 57.8 | 24 | n/a |
| firefox | phone 390×844 @3 | open | high full | 16.7 / 23.4 / 40.9 | 59.6 | 16 | n/a |
| firefox | phone 390×844 @3 | close | high calm | 16.9 / 23.2 / 39.9 | 59.3 | 12 | n/a |
| firefox | phone 390×844 @3 | open | high full | 16.8 / 23.2 / 39.5 | 59.3 | 14 | n/a |

## Reading (stage 42a, ADR 0127)

- **The blur rule: the large box keeps the blur** (`blur(9px)`, 0.68 fill).
  In both browsers and both geometries the large box idles at 60 fps, at or
  above the menu (58–60 fps), with no frame over 50 ms; the sky behind it
  runs at the calm rate. The flat variant (0.84 fill, no blur) is no
  faster. An earlier run of the same build while other agents loaded the
  machine (load average 15–30) had Firefox phone with the blur at 57.6 fps
  against the menu's 59.7 and one 53 ms frame; two repeats at a normal load
  (59.2 / 60.0 fps against 58.5 / 59.3, max 37 / 26 ms) did not.
- **The morph** (1.3 s each way): no long animation frame (Chromium's Long
  Animation Frames: none over 20 ms; the main thread is idle), 57–60 fps,
  but 2–11 of its ~80 frames come 33 ms apart (one frame skipped, spread
  over the flight and the content's fade-in), against about 1.5 per second
  on the idle menu. A per-frame profile (Chromium, laptop, 3× each way):
  as built 2–6 skipped frames per morph; the proxy without its blur,
  shadow and grain 0–6; no proxy at all 0–3, all with no long animation
  frame. So the proxy's repaint (its size changes every frame) costs part
  of it, the rest is the compositor's (the large window's blur appearing,
  the content fading in as layers). The stage's target (no frame over
  16 ms during a morph at 1728×1000 @2) is not met on this machine;
  recorded for 42-Z (a lighter proxy during the flight is the candidate).
