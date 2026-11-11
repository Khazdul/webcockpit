# Phone text speed

- Date: 2026-11-10 22:52 UTC
- Commit: fb744906
- Flags: --out bench/results/phone-51-before.md
- Browser: Chromium 153.0.8010.12, headless (`--enable-gpu --use-angle=vulkan`); WebGL: ANGLE (NVIDIA, Vulkan 1.4.351 (NVIDIA NVIDIA GeForce RTX 3050 Ti Laptop GPU (0x000025A0)), NVIDIA)
- Page: `?bench&phone=1`, mobile + touch, viewport 390 × 844, ratio 3; output pane 384 × 812 CSS px; default settings
- Fixture: `Rasta/2026-09-26T21-00-45.log` (3.91 MB)
- Load average: 9.57 18.08 9.72 at the start, 6.18 16.45 9.44 at the end

| measure | result |
|---|---|
| frame → paint, ms (median / p95 / max; 400 frames at 20–80 ms) | 3.8 / 17.4 / 22.2 |
| … its flush script, ms (median / p95 / max) | 0.9 / 1.7 / 2.7 |
| burst: longest frame, ms (rAF gap max; p95) | 18.5; 17.0 |
| burst: longest Long Animation Frame, ms | 0.0 |
| burst: total time, ms (79447 lines) | 938 |
| burst: lines/s | 84666 |
| key → send, ms (median / p95 / max; n = 200) | 0.050 / 0.080 / 0.115 |

Frame → paint includes the wait for the next animation frame (about half a frame at the median); the flush script row is the app's own part of it. Key → send is a synthetic Enter keydown on the input (the probe's `keyToSend`), not a tap on a soft keyboard.
