# Start page (integrated) — frame times

Server: http://localhost:5193. Date: 2026-11-07 02:14 · load 1.67 1.76 2.43 · headed (real windows) · 6 s per run after the reveal and 2 s settling, automatic quality. `glass`: as built (backdrop-filter on the panel and the buttons); `flat`: every backdrop-filter off.

- chromium: ANGLE (Intel, Mesa Intel(R) Iris(R) Xe Graphics (ADL GT2), OpenGL ES 3.2)
- firefox: Intel(R) HD Graphics, or similar

| browser | geometry | scene | variant | tier | sky work ms p50 / p95 / max | rAF ms p50 / p95 / max | fps | long frames (> 50 ms) |
|---|---|---|---|---|---|---|---|---|
| chromium | laptop 1728×1000 @2 | day, fair | glass | high | 0.32 / 0.78 / 2.09 | 16.7 / 34.1 / 37.9 | 56.1 | 0 |
| chromium | laptop 1728×1000 @2 | day, fair | flat | high | 0.30 / 0.57 / 1.63 | 16.7 / 33.2 / 37.7 | 56.3 | 0 |
| chromium | laptop 1728×1000 @2 | winter night, snow | glass | high | 0.82 / 1.96 / 2.54 | 16.7 / 28.5 / 36.5 | 57.0 | 0 |
| chromium | laptop 1728×1000 @2 | winter night, snow | flat | high | 0.75 / 1.97 / 10.01 | 16.7 / 34.6 / 42.6 | 56.3 | 0 |
| chromium | phone 390×844 @3 | day, fair | glass | high | 0.31 / 0.75 / 2.44 | 16.6 / 32.9 / 37.9 | 56.5 | 0 |
| chromium | phone 390×844 @3 | day, fair | flat | high | 0.27 / 0.53 / 1.24 | 16.7 / 31.4 / 37.6 | 56.6 | 0 |
| chromium | phone 390×844 @3 | winter night, snow | glass | high | 0.57 / 1.02 / 1.68 | 16.7 / 31.0 / 37.3 | 56.5 | 0 |
| chromium | phone 390×844 @3 | winter night, snow | flat | high | 0.59 / 1.00 / 9.06 | 16.7 / 33.2 / 36.9 | 56.5 | 0 |
| firefox | laptop 1728×1000 @2 | day, fair | glass | high | 0.52 / 1.30 / 2.22 | 16.8 / 31.7 / 49.9 | 58.0 | n/a |
| firefox | laptop 1728×1000 @2 | day, fair | flat | high | 0.40 / 1.32 / 2.88 | 16.8 / 32.0 / 54.5 | 58.0 | n/a |
| firefox | laptop 1728×1000 @2 | winter night, snow | glass | high | 0.68 / 1.40 / 3.46 | 16.8 / 41.9 / 46.5 | 56.2 | n/a |
| firefox | laptop 1728×1000 @2 | winter night, snow | flat | high | 0.98 / 2.12 / 4.58 | 16.7 / 35.2 / 55.2 | 54.5 | n/a |
| firefox | phone 390×844 @3 | day, fair | glass | high | 0.44 / 1.20 / 3.02 | 16.8 / 39.3 / 43.7 | 56.2 | n/a |
| firefox | phone 390×844 @3 | day, fair | flat | high | 0.48 / 1.12 / 3.02 | 16.8 / 33.1 / 41.9 | 57.0 | n/a |
| firefox | phone 390×844 @3 | winter night, snow | glass | high | 0.70 / 1.88 / 4.92 | 16.8 / 32.2 / 50.5 | 57.8 | n/a |
| firefox | phone 390×844 @3 | winter night, snow | flat | high | 0.78 / 1.92 / 3.80 | 16.3 / 28.2 / 45.6 | 58.8 | n/a |
