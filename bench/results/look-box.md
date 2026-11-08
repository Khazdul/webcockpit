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

## Final check (2026-11-08): the built pages of stages 42–47

Server: a `VITE_KIT=1` production build of the branch tip (`vite build
--outDir …`, `vite preview`). Date: 2026-11-08 01:31–01:48, load average
(1 min) 1.4–4.5, nothing else running. Headed (real windows, `WC_BENCH_HEADED=1`)
on the owner's machine: Chromium on ANGLE (Intel Iris Xe, Mesa, OpenGL ES
3.2), Firefox on "Intel(R) HD Graphics, or similar". Scene
`skyMonth=4&skyHour=13&skyWeather=fair`. The large box has no blur (ADR
0127, wave 3). Each page is opened from the start menu as a user would,
left 2.5 s after the morph, then measured for 5 s.

How to read the cells: `fps · p95 / max frame ms · frames > 20 ms`. A
frame over 20 ms is a skipped vsync (at 60 Hz a frame is 16.7 ms, so "over
16 ms" counts every frame). Two more counts were taken: main-thread stalls
(a `setTimeout(0)` chain whose gap passes 16 ms) and, in Chromium, Long
Animation Frames over 50 ms. Idle: **no stall over 16 ms and no long
animation frame on any page in either browser**, so they are left out of
the table.

### Idle

| page | Chromium 1728×1000 @2 | Chromium 390×844 @3 | Firefox 1728×1000 @2 | Firefox 390×844 @3 |
|---|---|---|---|---|
| start menu | 59.7 · 17.9 / 34.6 · 2 | 59.5 · 17.9 / 36.2 · 3 | 59.1 · 26.0 / 44.1 · 33 | 59.2 · 28.7 / 47.2 · 32 |
| Profile list | 59.7 · 18.0 / 34.9 · 2 | 59.6 · 18.1 / 35.8 · 3 | 58.8 · 26.6 / 45.6 · 35 | 58.9 · 28.9 / 50.3 · 20 |
| Profile editor | 60.0 · 18.0 / 19.5 · 0 | 60.0 · 17.6 / 19.3 · 0 | 59.4 · 26.4 / 43.3 · 33 | 59.8 · 24.5 / 42.7 · 29 |
| Import | 60.1 · 18.1 / 19.6 · 0 | 59.9 · 17.7 / 35.4 · 1 | 59.0 · 19.3 / 36.7 · 9 | 59.2 · 28.6 / 47.9 · 35 |
| Export editor | 60.0 · 18.0 / 19.4 · 0 | 60.0 · 17.8 / 19.3 · 0 | 58.6 · 20.9 / 40.2 · 20 | 59.4 · 25.4 / 45.8 · 34 |
| Scripts page | 60.0 · 18.0 / 19.3 · 0 | 60.0 · 17.8 / 19.4 · 0 | 58.6 · 22.8 / 43.1 · 25 | 59.6 · 28.8 / 45.0 · 35 |
| script editor | 60.1 · 17.3 / 17.8 · 0 | 60.0 · 17.2 / 17.7 · 0 | 59.0 · 33.3 / 38.3 · 18 | 58.4 · 33.5 / 50.7 · 22 |
| script manual | 60.0 · 17.8 / 19.0 · 0 | 60.0 · 17.9 / 19.3 · 0 | 59.4 · 19.5 / 35.9 · 10 | 59.6 · 19.2 / 34.8 · 8 |
| History | 60.0 · 18.1 / 19.6 · 0 | 60.0 · 18.0 / 19.8 · 0 | 58.6 · 19.7 / 36.2 · 14 | 59.2 · 30.1 / 47.2 · 28 |
| Spotlights wall | 60.0 · 17.8 / 18.8 · 0 | 60.0 · 17.8 / 19.0 · 0 | 58.8 · 19.3 / 37.5 · 8 | 60.0 · 19.4 / 32.4 · 11 |
| Spotlights viewer (playing) | 56.8 · 33.1 / 35.8 · 17 | 57.2 · 30.4 / 37.6 · 16 | 53.6 · 34.8 / 52.6 · 59 | 59.0 · 19.9 / 39.9 · 11 |
| Credits | 60.0 · 18.0 / 19.3 · 0 | 60.0 · 17.7 / 19.6 · 0 | 59.4 · 30.0 / 49.5 · 28 | 59.4 · 19.5 / 39.3 · 12 |
| About | 60.0 · 17.9 / 19.5 · 0 | 60.0 · 17.8 / 19.2 · 0 | 59.0 · 28.3 / 50.4 · 35 | 59.5 · 25.8 / 43.7 · 33 |
- Chromium: every large page idles at 60.0 fps with no frame over 20 ms,
  steadier than the menu itself (2–3 skipped vsyncs in 5 s while the sky
  runs at its full rate). The one exception is the Spotlights viewer,
  which is not idle: it plays the run (16–17 skipped vsyncs, 56.8–57.2
  fps).
- Firefox: 58.4–60.0 fps on every page but the viewer, with 8–35 frames
  over 20 ms in 5 s, as many as on the menu (32–33): Firefox's own frame
  pacing on this machine, not the pages. The script editor's p95 is
  33 ms (cause not traced; its max is 38–51 ms). The viewer playing drops to 53.6 fps at 1728×1000
  @2 (59 frames over 20 ms, max 52.6 ms) and holds 59.0 on the phone.

### The grow morph (menu ↔ a large box)

1.4 s from the key, three times each way; About (the heaviest page to
mount) and the Scripts page.

| browser | geometry | morph | fps (3 runs) | frames > 20 ms | max frame ms | main-thread stalls > 16 ms (longest) |
|---|---|---|---|---|---|---|
| chromium | 1728×1000 @2 | menu → About | 57.7, 54.3, 58.3 | 8, 15, 4 | 35.8, 34.5, 33.6 | 1 (45.3), 1 (20.9), 1 (23.7) |
| chromium | 1728×1000 @2 | About → menu | 56.4, 57.5, 55.6 | 8, 5, 9 | 35.3, 34.8, 34.8 | 1 (32.8), 1 (21.3), 0 |
| chromium | 1728×1000 @2 | menu → Scripts page | 57.5, 57.5, 58.9 | 6, 7, 4 | 43.7, 36.4, 34.4 | 2 (49.2), 1 (25.4), 1 (27.4) |
| chromium | 1728×1000 @2 | Scripts page → menu | 56.5, 55.9, 57.4 | 9, 9, 5 | 34.5, 35.3, 35.2 | 1 (23.3), 1 (26.1), 1 (26.5) |
| chromium | 390×844 @3 | menu → About | 58.3, 58.1, 59.8 | 4, 6, 3 | 36.6, 37.4, 32.1 | 1 (38.8), 1 (27.9), 1 (22.1) |
| chromium | 390×844 @3 | About → menu | 58.1, 57.8, 57.5 | 4, 4, 5 | 36.8, 37.6, 36.6 | 1 (20.5), 0, 1 (20.5) |
| chromium | 390×844 @3 | menu → Scripts page | 59.8, 58.6, 57.8 | 3, 2, 4 | 34.3, 36.3, 34.4 | 2 (40.6), 1 (20.6), 0 |
| chromium | 390×844 @3 | Scripts page → menu | 59.0, 58.1, 57.8 | 3, 4, 3 | 35.9, 33.7, 33.8 | 1 (26.0), 1 (22.2), 1 (21.2) |
| firefox | 1728×1000 @2 | menu → About | 52.4, 53.9, 54.8 | 17, 18, 20 | 57.7, 47.5, 48.5 | 1 (40.6), 1 (23.1), 1 (22.0) |
| firefox | 1728×1000 @2 | About → menu | 57.9, 50.9, 51.9 | 20, 18, 23 | 42.7, 52.8, 43.6 | 1 (25.9), 1 (23.7), 1 (21.0) |
| firefox | 1728×1000 @2 | menu → Scripts page | 52.0, 52.8, 54.5 | 17, 14, 18 | 62.7, 62.9, 47.6 | 2 (35.6), 2 (29.0), 2 (32.3) |
| firefox | 1728×1000 @2 | Scripts page → menu | 53.2, 55.5, 50.7 | 13, 16, 17 | 57.5, 44.5, 59.6 | 1 (18.3), 1 (19.9), 0 |
| firefox | 390×844 @3 | menu → About | 51.7, 53.9, 54.5 | 19, 17, 15 | 51.9, 51.3, 52.9 | 1 (32.7), 2 (24.5), 1 (20.5) |
| firefox | 390×844 @3 | About → menu | 53.6, 50.1, 54.6 | 16, 13, 18 | 48.3, 68.6, 48.4 | 1 (20.2), 1 (18.9), 1 (18.6) |
| firefox | 390×844 @3 | menu → Scripts page | 55.2, 55.0, 57.2 | 19, 14, 13 | 42.0, 37.1, 37.4 | 2 (36.5), 1 (27.2), 1 (23.6) |
| firefox | 390×844 @3 | Scripts page → menu | 55.1, 52.3, 53.2 | 20, 19, 12 | 39.8, 48.7, 51.5 | 0, 1 (19.5), 1 (20.1) |
- No long animation frame (Chromium) in any morph. Each open has one or
  two main-thread stalls of 20–49 ms (the key's task that mounts the
  page, ADR 0127 wave 3) and each close one of 18–33 ms.
- Chromium skips 2–15 of ~84 vsyncs per morph (54.3–59.8 fps), Firefox
  12–23 (50.1–57.9 fps, longest frame 37–69 ms). The target "no frame over
  16 ms during a morph" is still not met; nothing changed since wave 3.

### Typing

150 characters at 35 ms (`keyboard.type`), keydown to the next frame
(a `requestAnimationFrame` plus a message, so ~16 ms means "in the next
frame").

| browser | geometry | where | keydown → next frame p50 / p95 / max ms | keys > 33 ms | rAF fps | main-thread stalls > 16 ms (longest) |
|---|---|---|---|---|---|---|
| chromium | 1728×1000 @2 | Profile editor, Lite (pattern field) | 12.0 / 20.7 / 21.9 | 0 of 150 | 60.0 | 66 (27.1) |
| chromium | 1728×1000 @2 | Profile editor, Editor view | 12.6 / 20.6 / 24.3 | 0 of 150 | 60.1 | 78 (28.3) |
| chromium | 1728×1000 @2 | script editor (400 lines, the middle) | 13.9 / 23.7 / 26.3 | 0 of 150 | 60.1 | 109 (30.2) |
| chromium | 390×844 @3 | Profile editor, Lite (pattern field) | 10.8 / 20.4 / 21.8 | 0 of 150 | 60.0 | 69 (26.4) |
| chromium | 390×844 @3 | Profile editor, Editor view | 12.8 / 22.8 / 36.6 | 1 of 150 | 60.1 | 76 (40.1) |
| chromium | 390×844 @3 | script editor (400 lines, the middle) | 13.5 / 22.6 / 24.6 | 0 of 150 | 60.0 | 95 (29.7) |
| firefox | 1728×1000 @2 | Profile editor, Lite (pattern field) | 7.5 / 23.7 / 44.1 | 4 of 150 | 66.9 | 1 (19.2) |
| firefox | 1728×1000 @2 | Profile editor, Editor view | 9.2 / 19.0 / 23.4 | 0 of 150 | 65.9 | 1 (16.0) |
| firefox | 1728×1000 @2 | script editor (400 lines, the middle) | 12.7 / 24.1 / 32.5 | 0 of 150 | 42.8 | 1 (16.3) |
| firefox | 390×844 @3 | Profile editor, Lite (pattern field) | 7.7 / 20.0 / 30.2 | 0 of 150 | 66.1 | 0 (0.0) |
| firefox | 390×844 @3 | Profile editor, Editor view | 9.4 / 16.6 / 36.7 | 1 of 150 | 65.0 | 2 (20.1) |
| firefox | 390×844 @3 | script editor (400 lines, the middle) | 11.1 / 23.8 / 41.9 | 2 of 150 | 43.4 | 2 (18.0) |
- Every keystroke lands within two frames but for a handful (at most 4 of
  150 over 33 ms, the longest 44 ms in Firefox's Lite pattern field). No
  long animation frame.
- Chromium's `setTimeout` probe sees a 17–30 ms gap on about every
  second key (66–109 per run, one of 40 ms on the phone) while the rAF
  rate stays at 60 and no animation frame is long; not traced further.
- Firefox keeps its main thread free (0–2 stalls) but its rAF rate falls
  to 43 fps while typing in the 400-line script; the profile editor's
  views count 65–67 rAF callbacks a second (above the 60 Hz vsync).

The harness is a scratchpad copy of `pages-bench.ts` (the wave-3 run's,
reduced to the built variant), not committed.
