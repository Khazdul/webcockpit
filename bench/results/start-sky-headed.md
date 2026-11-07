# Start page sky — frame times

Date: 2026-11-07 01:25 · load 4.15 5.49 10.43 · headed (real windows) · 6 s per run after 2 s settling, automatic quality.

- chromium: ANGLE (Intel, Mesa Intel(R) Iris(R) Xe Graphics (ADL GT2), OpenGL ES 3.2)
- firefox: Intel(R) HD Graphics, or similar

| browser | geometry | scene | tier | sky work ms p50 / p95 / max | rAF ms p50 / p95 / max | fps | long frames (> 50 ms) | mount ms |
|---|---|---|---|---|---|---|---|---|
| chromium | laptop 1728×1000 @2 | day, fair | high | 0.13 / 0.29 / 0.44 | 16.7 / 16.9 / 17.4 | 60.0 | 0 | 12.2 |
| chromium | laptop 1728×1000 @2 | clear night (stars, moon) | high | 0.18 / 0.35 / 0.64 | 16.7 / 17.3 / 18.1 | 60.0 | 0 | 11.9 |
| chromium | laptop 1728×1000 @2 | winter night, snow | high | 0.30 / 1.06 / 1.66 | 16.7 / 33.0 / 50.4 | 56.0 | 0 | 13.7 |
| chromium | laptop 1728×1000 @2 | autumn storm | high | 0.19 / 0.33 / 0.95 | 16.7 / 33.1 / 35.2 | 56.5 | 0 | 6.7 |
| chromium | phone 390×844 @3 | day, fair | high | 0.12 / 0.34 / 0.41 | 16.7 / 17.0 / 19.5 | 60.0 | 0 | 1262.7 |
| chromium | phone 390×844 @3 | clear night (stars, moon) | high | 0.11 / 0.19 / 0.27 | 16.7 / 16.9 / 17.9 | 60.0 | 0 | 9.2 |
| chromium | phone 390×844 @3 | winter night, snow | high | 0.22 / 1.31 / 1.95 | 16.7 / 17.0 / 18.1 | 60.0 | 0 | 10.4 |
| chromium | phone 390×844 @3 | autumn storm | high | 0.40 / 0.93 / 1.87 | 16.7 / 17.2 / 19.8 | 60.0 | 0 | 19.4 |
| firefox | laptop 1728×1000 @2 | day, fair | high | 0.50 / 13.36 / 15.02 | 16.9 / 29.2 / 41.1 | 59.3 | n/a | 4.8 |
| firefox | laptop 1728×1000 @2 | clear night (stars, moon) | high | 0.20 / 0.80 / 1.40 | 16.9 / 28.0 / 45.0 | 59.0 | n/a | 4.5 |
| firefox | laptop 1728×1000 @2 | winter night, snow | high | 0.40 / 0.70 / 1.50 | 16.7 / 25.5 / 45.9 | 58.2 | n/a | 6.0 |
| firefox | laptop 1728×1000 @2 | autumn storm | high | 0.72 / 2.52 / 3.50 | 16.6 / 23.4 / 40.8 | 58.5 | n/a | 4.7 |
| firefox | phone 390×844 @3 | day, fair | high | 0.22 / 1.54 / 3.20 | 16.8 / 18.5 / 28.6 | 60.0 | n/a | 6.5 |
| firefox | phone 390×844 @3 | clear night (stars, moon) | high | 0.14 / 0.52 / 0.90 | 16.9 / 28.4 / 46.2 | 58.4 | n/a | 4.6 |
| firefox | phone 390×844 @3 | winter night, snow | high | 0.40 / 0.84 / 2.10 | 16.8 / 25.6 / 41.8 | 58.5 | n/a | 7.2 |
| firefox | phone 390×844 @3 | autumn storm | high | 0.44 / 0.88 / 2.00 | 16.6 / 21.9 / 37.7 | 58.5 | n/a | 5.6 |
