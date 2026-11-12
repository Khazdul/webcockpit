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
35.7 / 18.3). The three `diag` rows place the difference in how Chromium
handles a touch, not in the app's handler:

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
a text commit that has no touch in it. What was shown about that gap is
this much, and no more: the same key pressed with a mouse pointer is
level with the device path (the `diag` row: 4.9 and 11.1 ms), and the
app's handler is synchronous (a key acts in the first `pointerdown`
listener and changes the field there, 1.0–1.2 ms). That places the gap
in the touch's way to the page and the frame after it; it does not prove
that nothing in the app could shorten it (the listener's options, the
element's `touch-action`, and what else listens for touches were not
varied).

Not all of the gap under the burst is accounted for. Against the mouse
row (11.1 ms) the touch row is 18.5 ms later: about 13 ms is the
`pointerdown` reaching its listener late (item 2), and the rest is a
longer wait for the frame after the field changed, 12.4 ms against
6.9 ms (8.1 ms on the device path). Item 1 explains that wait when idle
(a frame at once against the 60 Hz grid); under the burst every row
already paints on the grid, so these 3 to 5 ms are unexplained.

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

---

# Round 53i (2026-11-12): after the device keyboard path was removed

Everything above is round 53e and stays as history. `?kbd=0` is gone, so
the rows "device path (`Input.insertText`, `?kbd=0`)", "key event
(`?kbd=0`)" and "diag: `?kbd=0`, `Input.insertText` 3 ms after a finger
went down" **can no longer be run**: there is no page without our
keyboard to measure them on. The comparison against the device
keyboard's path rests on the numbers above. The script
(`bench/phone-keyboard-bench.ts`) now measures our keyboard, a physical
key with our keyboard open, and the two `diag` rows that have our
keyboard.

## Key → echo, our keyboard

- Date: 2026-11-12 16:43 UTC
- Commit: e0cf58bf (branch `stage-53i`; a docs-only change uncommitted)
- Script: `node bench/phone-keyboard-bench.ts --no-build --diag`, Chromium 153.0.8010.12 headless, CPU throttled 4×, 360 × 800 at ratio 3, 120 keys per cell and round, 2 rounds
- Load average: 1.25 at the start, 1.06 at the end

All times in ms, median / p95 / max.

| idle | n | event → painted | handler → painted | script (handler → value changed) | wait for the frame (value changed → its callback) | the frame (callback → rendered) | event → painted, median per round |
|---|---|---|---|---|---|---|---|
| our keyboard (touch on a key) | 210 | 13.8 / 27.6 / 36.1 | 11.7 / 18.4 / 19.1 | 1.10 / 1.63 / 1.93 | 8.6 / 15.3 / 15.7 | 2.1 / 2.8 / 3.1 | 13.8, 13.8 |
| key event (`Input.dispatchKeyEvent`, our keyboard open) | 210 | 3.9 / 5.6 / 19.0 | 3.4 / 4.7 / 18.4 | 0.97 / 1.42 / 1.93 | 0.7 / 1.3 / 15.1 | 1.7 / 2.4 / 2.8 | 3.8, 3.9 |
| diag: our keyboard, the key pressed with a mouse pointer | 210 | 4.8 / 7.5 / 21.2 | 4.2 / 6.3 / 19.9 | 1.18 / 1.82 / 2.17 | 0.7 / 1.2 / 15.5 | 2.3 / 3.0 / 4.4 | 4.8, 4.8 |
| diag: our keyboard open, the text by `Input.insertText` | 206 | 2.9 / 4.2 / 23.8 | 2.8 / 4.1 / 23.8 | 0.93 / 1.57 / 2.42 | 0.6 / 1.3 / 20.3 | 1.3 / 1.8 / 2.3 | 2.9, 2.9 |

| while text arrives (a frame every 25 ms) | n | event → painted | handler → painted | script (handler → value changed) | wait for the frame (value changed → its callback) | the frame (callback → rendered) | event → painted, median per round |
|---|---|---|---|---|---|---|---|
| our keyboard (touch on a key) | 210 | 28.1 / 35.5 / 38.1 | 15.7 / 18.7 / 19.4 | 0.96 / 1.35 / 1.61 | 12.4 / 15.3 / 15.8 | 2.4 / 3.1 / 3.7 | 28.4, 27.6 |
| key event (`Input.dispatchKeyEvent`, our keyboard open) | 210 | 11.2 / 18.6 / 20.3 | 10.7 / 17.4 / 18.3 | 0.77 / 1.13 / 1.87 | 7.7 / 14.2 / 16.0 | 2.1 / 3.1 / 4.9 | 11.2, 11.1 |
| diag: our keyboard, the key pressed with a mouse pointer | 210 | 12.2 / 18.7 / 19.2 | 11.5 / 17.2 / 18.5 | 1.01 / 1.38 / 3.15 | 7.9 / 13.6 / 15.4 | 2.6 / 3.9 / 5.7 | 11.8, 12.3 |
| diag: our keyboard open, the text by `Input.insertText` | 207 | 10.2 / 16.9 / 19.4 | 10.2 / 16.9 / 19.4 | 0.70 / 1.14 / 1.86 | 6.9 / 13.5 / 15.6 | 2.3 / 3.5 / 4.1 | 9.3, 10.5 |

What 20 keys of ours touched: 0 cockpit layouts; 59 style recalculations (3.0 per key: the press, the release, the caret); DOM mutations: `button.wc-ph-okb-k.is-down [attributes class]` × 20, `span.wc-caret [attributes style]` × 18, `button.wc-ph-okb-k [attributes class]` × 20.

Against round 53e: our keyboard's touch row is 13.8 ms idle (13.6 then)
and 28.1 ms while text arrives (29.6); the script per key 1.10 and
0.96 ms (1.15, 0.99); still no cockpit layout per key. Text committed
by `Input.insertText` with our keyboard open (2.9 and 10.2 ms) is where
the removed device path row stood (2.8 and 10.9 ms). Unchanged within
the rounds' spread.

## Text speed: `main`, the branch with the keyboard closed, and open

- Date: 2026-11-12 16:35–16:39 UTC
- Commits: `main` c6058579 (0.6.1); branch e0cf58bf
- Script: `node bench/phone-bench.ts --no-build --rounds 3` (the same script, in a copy of `main`), production builds, the same fixture (`Rasta/2026-09-26T21-00-45.log`, 79 447 lines), no CPU throttle. Keyboard open: `--eval "document.querySelector('.wc-input-wrap').click()"`, checked after each burst (`html.wc-okb`: true in all six)
- Order: main, closed, open; then the same again
- Page: `?bench&phone=1`, 390 × 844 at ratio 3, mobile + touch, the phone's game layout with the lens

| measure | main 1 | closed 1 | open 1 | main 2 | closed 2 | open 2 |
|---|---|---|---|---|---|---|
| burst total ms, median of 3 (each round) | 956 (962, 946, 956) | 959 (959, 954, 967) | 958 (966, 955, 958) | 953 (953, 938, 969) | 954 (968, 939, 954) | 956 (965, 954, 956) |
| burst longest frame ms (max of 3; median p95) | 19.0; 16.9 | 18.9; 17.0 | 18.1; 17.0 | 21.3; 17.1 | 18.3; 16.9 | 19.5; 17.0 |
| frame → paint ms, median / p95 | 3.8 / 18.9 | 3.9 / 17.6 | 4.1 / 18.6 | 3.8 / 17.2 | 3.9 / 17.6 | 4.1 / 17.6 |
| flush script ms, median / p95 | 0.88 / 1.78 | 0.89 / 1.47 | 0.88 / 1.65 | 0.86 / 1.65 | 0.91 / 1.78 | 0.85 / 1.66 |
| key → send ms, median / p95 | 0.050 / 0.080 | 0.055 / 0.085 | 0.055 / 0.075 | 0.055 / 0.080 | 0.030 / 0.065 | 0.055 / 0.080 |
| load average (1 min) at the start | 7.13 | 4.49 | 2.74 | 1.85 | 1.41 | 1.12 |

Burst, median of the six rounds of each: `main` 955 ms, keyboard closed
957 ms, keyboard open 957 ms. The rounds of one configuration spread by
12–31 ms, so the three are the same, as in round 53e (956 / 959 / 963).
Frame → paint with the keyboard open is 4.1 ms at the median against
3.8 ms on `main`, as then (the focused field's caret). The first pass
started under load from the test runs before it (7.1 falling to 2.7);
the second pass was quiet and says the same.
