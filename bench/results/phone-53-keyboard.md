# Key → echo on the phone: our keyboard against the device keyboard's path

- Date: 2026-11-12 07:02 UTC
- Commit: 394201b8
- Script: `node bench/phone-keyboard-bench.ts`, flags --diag
- Browser: Chromium 153.0.8010.12, headless (`--enable-gpu --use-angle=vulkan`); WebGL: ANGLE (NVIDIA, Vulkan 1.4.351 (NVIDIA NVIDIA GeForce RTX 3050 Ti Laptop GPU (0x000025A0)), NVIDIA); CPU throttled 4×
- Page: production build, `?bench&phone=1` (our keyboard) and `?bench&phone=1&kbd=0` (the device path), 360 × 800 at ratio 3, mobile + touch, default settings
- Keys: 120 per cell and round (the first 15 dropped), 2 rounds, the modes alternating; about 8 keys a second
- Burst fixture: `Rasta/2026-09-26T21-00-45.log`, its first 400 frames in a loop
- Load average: 0.37 4.70 9.55 at the start, 1.04 1.93 6.50 at the end

All times in ms, median / p95 / max.

| idle | n | event → painted | handler → painted | script (handler → value changed) | wait for the frame (value changed → its callback) | the frame (callback → rendered) | event → painted, median per round |
|---|---|---|---|---|---|---|---|
| our keyboard (touch on a key) | 210 | 13.6 / 27.4 / 1255.9 | 11.4 / 18.5 / 19.1 | 1.15 / 1.58 / 1.90 | 8.0 / 15.2 / 16.2 | 2.2 / 2.9 / 3.2 | 12.7, 14.9 |
| device path (`Input.insertText`, `?kbd=0`) | 210 | 2.8 / 11.5 / 17.8 | 2.8 / 11.5 / 17.8 | 0.95 / 1.47 / 1.81 | 0.7 / 9.5 / 15.7 | 1.1 / 1.6 / 1.9 | 2.8, 2.7 |
| key event (`Input.dispatchKeyEvent`, `?kbd=0`) | 209 | 3.8 / 5.2 / 18.6 | 3.3 / 4.3 / 17.7 | 0.98 / 1.52 / 1.99 | 0.7 / 1.3 / 14.8 | 1.6 / 2.3 / 2.5 | 3.9, 3.7 |
| diag: our keyboard, the key pressed with a mouse pointer | 210 | 4.9 / 6.6 / 18.6 | 4.2 / 5.3 / 18.4 | 1.22 / 1.75 / 2.28 | 0.7 / 1.2 / 15.2 | 2.3 / 3.0 / 3.6 | 5.1, 4.8 |
| diag: our keyboard open, the text by `Input.insertText` | 192 | 2.9 / 4.8 / 17.8 | 2.9 / 4.6 / 17.8 | 0.93 / 1.47 / 1.72 | 0.7 / 1.6 / 15.7 | 1.3 / 1.8 / 2.5 | 2.9, 2.9 |
| diag: `?kbd=0`, `Input.insertText` 3 ms after a finger went down on a compass key | 210 | 7.7 / 15.9 / 17.8 | 7.7 / 15.8 / 17.8 | 0.71 / 1.15 / 1.52 | 5.6 / 13.1 / 14.7 | 1.4 / 2.1 / 2.4 | 8.2, 7.1 |

| while text arrives (a frame every 25 ms) | n | event → painted | handler → painted | script (handler → value changed) | wait for the frame (value changed → its callback) | the frame (callback → rendered) | event → painted, median per round |
|---|---|---|---|---|---|---|---|
| our keyboard (touch on a key) | 210 | 29.6 / 35.7 / 41.4 | 15.9 / 18.6 / 19.3 | 0.99 / 1.33 / 1.66 | 12.4 / 15.2 / 15.5 | 2.4 / 3.2 / 4.9 | 29.6, 29.2 |
| device path (`Input.insertText`, `?kbd=0`) | 196 | 10.9 / 18.3 / 22.1 | 10.9 / 18.3 / 22.1 | 0.70 / 1.13 / 1.31 | 8.1 / 14.7 / 16.1 | 2.2 / 3.7 / 13.5 | 11.2, 10.6 |
| key event (`Input.dispatchKeyEvent`, `?kbd=0`) | 205 | 11.0 / 18.3 / 19.8 | 10.7 / 16.7 / 18.1 | 0.72 / 1.22 / 1.67 | 7.8 / 14.2 / 15.6 | 1.8 / 3.1 / 4.3 | 11.2, 11.0 |
| diag: our keyboard, the key pressed with a mouse pointer | 210 | 11.1 / 19.0 / 20.7 | 10.7 / 17.8 / 19.6 | 1.04 / 1.48 / 1.82 | 6.9 / 13.7 / 15.3 | 2.7 / 3.9 / 5.3 | 11.1, 11.1 |
| diag: our keyboard open, the text by `Input.insertText` | 211 | 11.1 / 18.3 / 20.8 | 11.1 / 18.3 / 20.8 | 0.71 / 1.13 / 1.99 | 7.9 / 14.8 / 16.0 | 2.1 / 3.7 / 4.4 | 11.2, 11.1 |
| diag: `?kbd=0`, `Input.insertText` 3 ms after a finger went down on a compass key | 210 | 12.5 / 17.3 / 19.0 | 12.5 / 17.3 / 18.7 | 0.69 / 1.08 / 1.64 | 9.6 / 14.4 / 16.2 | 2.0 / 3.3 / 5.1 | 12.5, 12.4 |

What 20 keys of ours touched: 0 cockpit layouts; 59 style recalculations (3.0 per key: the press, the release, the caret); DOM mutations: `button.wc-ph-okb-k.is-down [attributes class]` × 20, `span.wc-caret [attributes style]` × 18, `button.wc-ph-okb-k [attributes class]` × 20.

## What the numbers mean

**The app's own work for a key is the same on both paths, to about a
millisecond at 4× throttle.** The script from the first listener to the
changed field is 1.0–1.2 ms with our keyboard against 0.7–1.0 ms on the
device path, and the frame that paints it 2.2–2.4 ms against 1.1–2.2 ms
(ours also paints the pressed key). No cockpit layout runs for a key, and
the only DOM a key touches is its own class and the caret (last line of
the report). Unthrottled these are a few tenths of a millisecond.

**End to end, in this emulation, a touch on our key is painted later than
text committed by `Input.insertText`:** median 13.6 ms against 2.8 ms
idle, 29.6 ms against 10.9 ms while text arrives (p95 27.4 / 11.5 and
35.7 / 18.3). The difference is not in the app. It is how Chromium
handles a touch, and the three `diag` rows show it:

- The same key of ours pressed with a mouse pointer is painted in 4.9 ms
  idle and 11.1 ms under the burst: the device path's numbers plus our
  extra millisecond of frame.
- Text committed by `Input.insertText` while our keyboard is open:
  2.9 ms and 11.1 ms, as on the device path. The open keyboard costs
  nothing.
- The device path with a finger going down on the screen 3 ms before the
  text is committed: 7.7 ms idle instead of 2.8 ms.

So two things separate the rows, both outside the page:

1. *The wait for the frame.* An idle headless page gets a frame at once
   when something changes (0.7 ms median wait); after a touch the next
   frame comes on the display's 60 Hz grid (8.0 ms median, up to 16 ms).
   A real phone always paints on its display's grid, so this part of the
   device path's advantage is the emulation's, not the device's.
2. *The touch's way to the page.* The `pointerdown` of a touch reaches
   its listener 2 ms after its timestamp when idle and about 14 ms after
   it while text arrives (a mouse press: 0.5 ms in both). The device
   path's row has no such part by construction: its clock starts at the
   `beforeinput`, when the text is already in the page.

**What is not measured, and cannot be here:** the device keyboard itself.
On a phone its key also starts with a touch, handled in another process
(the keyboard app), which decides the character (most keyboards on the
release of the finger, ours on the press), and commits it to the browser
over IPC; only then does the `beforeinput` of the device row begin. The
device row is therefore a lower bound of the device's path, and our row
is our whole path. Whether ours is faster or slower than Samsung Keyboard
on the S21 end to end is a question for a device (a high-speed camera, or
the owner's fingers: "typing keeps up", 53a).

**Verdict against ADR 0138 §8 ("must not be slower"):** met for
everything the app does (within about 1 ms at 4× throttle, no layout, no
per-key work beyond the key and the field); not shown end to end, where
this emulation has our touch 11 ms (idle) to 19 ms (under a burst) behind
a text commit that has no touch in it. Nothing in the app was found that
would shorten the touch's path: a key already acts in the first
`pointerdown` listener and changes the field synchronously.

One sample of 210 in the idle row has an event timestamp 1.2 s before its
listener ran (the row's max); its handler → painted time is ordinary. Not
looked into (bench/phone-bench.ts has a similar first-frame artefact
after idle, stage 52 E.4).

# Text speed: `main`, the branch with the keyboard closed, and with it open

- Date: 2026-11-12 07:02–07:20 UTC
- Commits: `main` c6058579 (0.6.1); branch 394201b8 plus uncommitted docs, the About page's text and a test (the keyboard's code as in that commit)
- Script: `node bench/phone-bench.ts --no-build --rounds 3` (the same script in a `main` worktree), production builds, the same fixture (`Rasta/2026-09-26T21-00-45.log`, 79 447 lines), no CPU throttle. Keyboard open: `--eval "document.querySelector('.wc-input-wrap').click()"` before the measure (a tap on the command field), checked after each burst (`html.wc-okb`)
- Order: main, closed, open; then the same again. Load average at each start in the last row
- Page: `?bench&phone=1`, 390 × 844 at ratio 3, mobile + touch, the phone's game layout with the lens. Output pane 384 × 784 CSS px, 384 × 602 with the keyboard open

| measure | main 1 | closed 1 | open 1 | main 2 | closed 2 | open 2 |
|---|---|---|---|---|---|---|
| burst total ms, median of 3 (each round) | 950 (961, 950, 947) | 954 (955, 940, 954) | 962 (951, 963, 962) | 957 (962, 956, 957) | 964 (966, 964, 963) | 963 (963, 967, 950) |
| burst longest frame ms (max of 3; median p95) | 18.9; 16.9 | 17.4; 17.0 | 19.3; 17.1 | 22.4; 17.0 | 18.8; 17.0 | 18.9; 17.0 |
| frame → paint ms, median / p95 | 3.8 / 19.1 | 3.8 / 17.7 | 4.2 / 18.6 | 3.8 / 16.7 | 3.8 / 18.1 | 4.2 / 19.2 |
| flush script ms, median / p95 | 0.92 / 1.89 | 0.89 / 1.70 | 0.84 / 1.58 | 0.88 / 1.59 | 0.87 / 1.64 | 0.87 / 1.73 |
| key → send ms, median / p95 | 0.050 / 0.075 | 0.050 / 0.075 | 0.050 / 0.070 | 0.050 / 0.070 | 0.055 / 0.080 | 0.050 / 0.080 |
| load average (1 min) at the start | 0.71 | 1.56 | 0.84 | 2.14 | 1.21 | 1.09 |

Burst, median of the six rounds of each: `main` 956 ms, keyboard closed 959 ms (+0.3 %), keyboard open 963 ms (+0.7 %). The rounds of one configuration spread by 15–25 ms, so the three are the same.

The one row that differs is frame → paint with the keyboard open: 4.2 ms at the median against 3.8 ms, in both passes (p95 the same). Attributed with five variants, `--only paint`, three alternating passes (median ms):

| variant | pass 1 | pass 2 | pass 3 |
|---|---|---|---|
| keyboard closed | 3.91 | 3.88 | 3.89 |
| keyboard closed, the command field focused (`focus()`) | 4.16 | 4.07 | 3.99 |
| keyboard open | 4.15 | 4.10 | 4.22 |
| keyboard open, `contain: layout paint style` on its band | 4.22 | 4.00 | 4.14 |
| keyboard open, its keys hidden (`visibility: hidden`) | 3.96 | 4.04 | 4.05 |

Most of the 0.3 ms comes with the focused field (its caret is on screen and painted), which typing with the device's keyboard has as well; the keys themselves are about 0.1 ms, at the edge of what three passes can tell, and containment on the band changes nothing (not added). The flush script is unchanged: nothing of the keyboard runs per line or per frame.

## What it means

Incoming text is as fast with the keyboard open as with it closed and as on `main`: the burst and the flush script are equal within the spread of the rounds; a frame of text is painted 0.2–0.4 ms later at the median while the command field has the focus, with the p95 unchanged.
