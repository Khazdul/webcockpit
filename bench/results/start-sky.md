# Start page sky — frame times

Date: 2026-11-07 01:23 · load 3.46 6.54 11.50 · headless · 6 s per run after 2 s settling, automatic quality.

- chromium: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)
- firefox: Intel(R) HD Graphics, or similar

| browser | geometry | scene | tier | sky work ms p50 / p95 / max | rAF ms p50 / p95 / max | fps | long frames (> 50 ms) | mount ms |
|---|---|---|---|---|---|---|---|---|
| chromium | laptop 1728×1000 @2 | day, fair | high | 0.10 / 0.14 / 3.73 | 16.7 / 18.1 / 22.5 | 60.0 | 0 | 8.2 |
| chromium | laptop 1728×1000 @2 | clear night (stars, moon) | high | 0.16 / 0.24 / 0.51 | 16.7 / 17.2 / 28.3 | 60.0 | 0 | 11.2 |
| chromium | laptop 1728×1000 @2 | winter night, snow | high | 0.25 / 0.44 / 5.02 | 16.6 / 20.1 / 28.8 | 60.0 | 0 | 8.5 |
| chromium | laptop 1728×1000 @2 | autumn storm | high | 0.15 / 0.25 / 13.91 | 16.9 / 20.8 / 42.2 | 57.2 | 0 | 7.7 |
| chromium | phone 390×844 @3 | day, fair | high | 0.10 / 0.16 / 5.62 | 16.7 / 16.9 / 22.2 | 60.0 | 0 | 10.5 |
| chromium | phone 390×844 @3 | clear night (stars, moon) | high | 0.10 / 0.17 / 0.44 | 16.7 / 16.9 / 17.5 | 60.0 | 0 | 10.3 |
| chromium | phone 390×844 @3 | winter night, snow | high | 0.23 / 0.60 / 4.75 | 16.7 / 17.0 / 23.5 | 60.0 | 0 | 12.4 |
| chromium | phone 390×844 @3 | autumn storm | high | 0.14 / 0.32 / 9.71 | 16.7 / 17.0 / 26.2 | 60.0 | 0 | 6.7 |
| firefox | laptop 1728×1000 @2 | day, fair | medium | 0.70 / 5.10 / 7.90 | 17.8 / 82.3 / 180.7 | 31.0 | n/a | 9.1 |
| firefox | laptop 1728×1000 @2 | clear night (stars, moon) | low | 2.86 / 6.98 / 14.08 | 87.4 / 229.0 / 279.7 | 11.0 | n/a | 8.1 |
| firefox | laptop 1728×1000 @2 | winter night, snow | low | 5.38 / 10.84 / 15.52 | 120.5 / 208.5 / 227.1 | 10.6 | n/a | 5.5 |
| firefox | laptop 1728×1000 @2 | autumn storm | low | 8.54 / 16.84 / 21.80 | 115.8 / 131.3 / 203.4 | 11.1 | n/a | 7.3 |
| firefox | phone 390×844 @3 | day, fair | high | 0.46 / 2.32 / 3.38 | 17.2 / 38.5 / 63.1 | 52.9 | n/a | 6.8 |
| firefox | phone 390×844 @3 | clear night (stars, moon) | medium | 0.52 / 0.68 / 1.02 | 17.5 / 45.0 / 107.6 | 40.1 | n/a | 7.6 |
| firefox | phone 390×844 @3 | winter night, snow | low | 1.44 / 4.62 / 5.82 | 35.2 / 72.9 / 84.6 | 27.6 | n/a | 4.5 |
| firefox | phone 390×844 @3 | autumn storm | medium | 1.08 / 3.80 / 4.26 | 16.8 / 71.9 / 92.8 | 34.8 | n/a | 6.3 |
