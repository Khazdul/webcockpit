# Stage 50 — Firefox frame latency

Status: **Owner testing** (2026-11-10). Branch `stage-50-firefox-frame`
(from `main`), not merged.

## Goal

Stage 49 found headless Firefox at 12–14 fps with the weather on and a
large framed float (the Statistics pane) over the game. The owner plays in
Firefox, and feeling extremely fast is a key parameter. The stage has four
goals:

1. Find out whether the slowdown happens in a real Firefox window with
   hardware WebRender, as the owner's Firefox runs (about:support →
   Compositing: WebRender).
2. Find the cause, and fix it in the cheapest way that keeps the look.
3. Add a permanent regression check.
4. Give the owner a live latency readout for their own Firefox. On the
   owner's decision this is the existing `#perf`: `#perf` alone toggles
   an overlay, and `#perf report` prints the table.

ADR 0135 holds the decisions. ADR 0047 has an addendum for `#perf`.

## Plan

- **50a Matrix on main.** Measure in a real window and headless. Vary the
  weather, the float's size, the border, glass or clear, the pane
  (Statistics, Comm, Group) and float or dock. Record the compositor in
  every run.
- **50b Cause.** Bisect the frame's CSS effects and the holes under
  floats. Measure CPU per browser thread.
- **50c Fix.** Prototype the fix. Verify it with the same matrix, and
  with screenshots on dark and Paper in every tint.
- **50d Regression check** in browser-bench (`float`).
- **50e `#perf` overlay**, unit-tested, with its cost measured.
- **50f** Docs, test guide, progress.

## Tasks

- [x] Branch from `main`. Bring over the bench's `WC_BENCH_SETTINGS` patch
      and `pane-cost.ts` from stage 49 (cherry-pick of 1831d839).
- [x] `bench/float-frame.ts`, `bench/frame-matrix.ts`: cells, measures,
      modes `headed` / `headed-sw` / `headless`. Each Firefox row records
      the compositor over Marionette, and each headed run records the
      monitor.
- [x] Check that the headed runs use hardware WebRender. The
      `gfx.webrender.software` pref does not force software in
      Playwright's Firefox; Mesa's `LIBGL_ALWAYS_SOFTWARE=1` does.
- [x] Matrix on main: every cell in all three modes.
- [x] Bisect the frame's effects and the holes (`bisect-*` cells), and
      measure CPU per thread (`bench/thread-cpu.ts`).
- [x] Prototypes: polygon hole, layer hints, `-moz-element` veil, plain
      veil.
- [x] Veils behind `FloatVeilWatch`, unit-tested
      (`tests/unit/veil-watch.test.ts`, `tests/unit/float-holes.test.ts`).
- [x] Final matrix: main against the branch, 3 runs. The headed runs were
      redone after the owner undocked the laptop (see "Display").
- [x] Screenshots before and after: dark and Paper, all seven tints,
      glass and clear (`bench/frame-shots.ts`).
- [x] browser-bench `float` section with its budgets.
- [x] `#perf` overlay, `#perf report`, help, usage, ADR 0047 addendum;
      unit tests and e2e.
- [x] Overlay cost measured.
- [x] Typecheck, unit tests (3520 passed), and e2e in Firefox and
      Chromium. The focused specs (layout, pane-buttons, weather, perf,
      help) passed 74 of 74. The full run passed 859; three tests failed
      under full parallel load (pane-buttons script pane in Firefox;
      look-kit-box and scripts-settings in Chromium). All 52 tests of
      those three specs passed when rerun with 4 workers.

## Findings

### How it was measured

- **Tool.** `node bench/frame-matrix.ts --url <preview> --modes
  headed,headed-sw,headless --cells …`, with the cells in
  `bench/float-frame.ts`.
- **Setup.** One page per cell at the owner's geometry (1728 × 1000 CSS
  px, ratio 2 through `layout.css.devPixelsPerPx`), map off.
- **Builds.** `main` is this branch's production build before any `src`
  change, served on its own port. The branch is a separate `vite build`
  on another port. Main and branch runs were interleaved.
- **Each cell measures:**
  - **Busy interval:** the rAF interval while 60 fixture frames arrive
    20–80 ms apart (median / p95, ms). It is taken after 60 unmeasured
    frames on the branch, so the watch has decided, and after 40 on main.
  - **Text → painted:** the probe's `inject`, from delivery until a
    MessageChannel message from the flush frame has run.
  - **Letter → rendered:** 40 real key presses into the input line, from
    the keydown listener to the frame after the `input` event.
  - The idle frame interval was 16.5–16.8 / 17.5–18.0 everywhere.
- **Modes.** Each Firefox run records about:support's Compositing, read
  over Marionette:
  - **headed:** a real window, "WebRender" (hardware; Wayland, Intel Iris
    Xe), the same as the owner's Firefox reports.
  - **headed-sw:** a real window with Mesa's software GL, "WebRender
    (Software)", as on a machine without a usable GPU.
  - **headless:** "WebRender (Software)".
- **Display.** The owner undocked the laptop during the session. Every
  headed comparison below (main and branch, every cell) is from the runs
  after that, on one setup: `eDP-1 3456x2160@60.001`, scale 2 (`hyprctl
  monitors`), page `devicePixelRatio` 2. The earlier headed runs, on the
  external monitor, gave the same picture; they are not used. One cell
  that ran during the undock (`overlay-large`, headed-sw: letters
  591 / 1573 ms, a 1.8 s frame) was thrown away. Headless runs are
  unaffected.
- **Load.** The machine was quiet: load average 0.6–2.3 at the start of
  each run (most 1–2), printed per cell by the tool.
- **Cells.**
  - `stats-large`: the Statistics float, 82 × 26 cells, framed, glass,
    weather on.
  - `-clear`: background clear.
  - `-noweather`: weather off.
  - `-noborder`: border off.
  - `-paper`: Paper background.
  - `stats-small`: a float of 16 × 8 cells.
  - `comm-large` / `group-large`: that pane as the large float.
  - `stats-dock`: Statistics docked in the right dock.
  - `overlay-*`: the same with the `#perf` overlay on.

### The matrix, main → branch

Ranges over three runs, in ms (median / p95); one run for comm, group,
paper and noborder. "Veils" means the branch switched to veils in every
run of that cell.

**Headed, hardware WebRender (the owner's case):**

| Cell | Busy interval main → branch | Text → painted main → branch | Letter → rendered main → branch |
|---|---|---|---|
| stats-large | 16.7 / 17.5–18.1 → 16.7 / 17.6–17.7 | 14.1–15.6 / 24.6–25.5 → 15.3–17.3 / 24.7–25.3 | 7.7–8.6 / 12.6–13.9 → 7.5–8.4 / 11.8–15.9 |
| stats-large-clear | 16.7 / 17.6–18.1 → 16.7 / 17.5–17.8 | 13.6–16.3 / 24.9–26.5 → 15.5–16.6 / 24.8–26.3 | 7.9–8.8 / 12.5–14.2 → 7.8–9.2 / 12.6–13.6 |
| stats-large-noweather | 16.7 / 17.7–17.9 → 16.6–16.7 / 17.7–17.8 | 14.5–15.6 / 24.5–27.2 → 14.9–15.9 / 25.5–29.0 | 8.0–8.9 / 11.3–14.0 → 7.9–9.2 / 12.1–14.7 |
| stats-small | 16.7 / 17.6–17.7 → 16.7 / 17.5–18.0 | 13.1–17.8 / 23.1–27.4 → 14.7–16.0 / 24.0–26.6 | 8.4–9.6 / 12.8–14.9 → 8.0–9.8 / 12.1–13.3 |
| stats-dock | 16.7 / 17.5–17.6 → 16.7–16.8 / 17.6–18.0 | 14.4–15.8 / 24.4–25.7 → 15.4–15.9 / 23.7–26.6 | 7.5–9.9 / 12.3–14.3 → 7.3–9.0 / 12.2–13.3 |

**Headed, software WebRender:**

| Cell | Busy interval main → branch | Text → painted main → branch | Letter → rendered main → branch | Veils |
|---|---|---|---|---|
| stats-large | 106.1–107.6 / 196.5–198.9 → 16.7–16.8 / 17.6–18.0 | 65.9–70.4 / 159.4–171.4 → 13.3–13.6 / 21.8–24.4 | 6.9–7.9 / 39.0–69.8 → 6.4–6.9 / 12.8–13.8 | yes |
| stats-large-clear | 100.5–104.7 / 194.9–195.9 → 16.8 / 17.5–18.1 | 54.1–60.3 / 143.8–160.5 → 11.3–13.3 / 21.8–23.9 | 6.1–6.2 / 27.3–56.6 → 6.0–7.0 / 11.6–12.8 | yes |
| comm-large | 105.0 / 204.1 → 16.8 / 17.6 | 67.5 / 170.7 → 13.6 / 24.0 | 6.3 / 42.7 → 5.6 / 10.7 | yes |
| group-large | 105.1 / 143.8 → 16.8 / 19.3 | 61.7 / 104.3 → 13.2 / 24.0 | 6.3 / 80.0 → 6.0 / 10.1 | yes |
| stats-large-paper | 117.7 / 215.1 → 16.7 / 21.3 | 71.4 / 178.3 → 10.9 / 72.9 | 6.2 / 52.3 → 6.8 / 10.9 | yes |
| stats-large-noborder | 16.7 / 98.7 → 16.7 / 100.3 | 12.8 / 84.1 → 12.3 / 87.4 | 6.9 / 12.6 → 6.1 / 13.1 | no |
| stats-small | 16.7–16.8 / 79.1–84.9 → 16.7–16.8 / 78.2–83.8 | 14.1–15.1 / 65.9–82.7 → 13.9–14.5 / 48.4–77.7 | 6.2–7.2 / 10.4–12.7 → 6.4–7.6 / 11.5–12.5 | no |
| stats-large-noweather | 16.6–16.7 / 17.7 → 16.6–16.7 / 17.7–18.1 | 14.6–15.6 / 23.9–25.9 → 14.4–15.7 / 23.6–25.5 | 7.5–8.1 / 12.2–13.6 → 6.7–7.9 / 11.3–12.8 | no |
| stats-dock | 16.7–16.8 / 17.7 → 16.8–16.9 / 17.9–18.4 | 10.2–12.0 / 19.6–22.6 → 13.1–14.2 / 22.2–23.9 | 6.8–7.4 / 11.8–13.7 → 6.1–7.2 / 11.5–11.7 | no |

**Headless (software WebRender):**

| Cell | Busy interval main → branch | Text → painted main → branch | Letter → rendered main → branch | Veils |
|---|---|---|---|---|
| stats-large | 114.3–115.5 / 195.4–198.8 → 16.5–16.6 / 17.6–17.8 | 62.7–75.5 / 153.3–162.9 → 11.0–12.9 / 21.3–23.6 | 5.7–6.5 / 9.7–65.1 → 5.6–6.4 / 8.5–10.3 | yes |
| stats-large-clear | 105.6–108.4 / 185.1–189.4 → 16.5–16.6 / 17.6–17.8 | 55.0–63.8 / 143.1–158.1 → 9.7–11.5 / 20.2–23.6 | 5.8–7.2 / 41.6–71.4 → 5.6–6.3 / 8.5–10.0 | yes |
| comm-large | 111.6 / 199.4 → 16.6 / 17.7 | 60.4 / 164.7 → 11.6 / 20.4 | 6.2 / 66.9 → 5.3 / 8.5 | yes |
| group-large | 115.9 / 139.4 → 16.6 / 18.3 | 65.2 / 103.4 → 11.8 / 23.9 | 5.9 / 48.6 → 5.0 / 11.1 | yes |
| stats-large-paper | 119.5 / 209.4 → 16.7 / 21.1 | 73.0 / 178.4 → 13.5 / 66.9 | 6.1 / 8.9 → 5.9 / 9.1 | yes |
| stats-large-noborder | 16.9 / 96.2 → 17.0 / 120.1 | 14.6 / 85.8 → 14.1 / 97.2 | 5.8 / 8.7 → 5.8 / 9.1 | no |
| stats-small | 16.7–16.9 / 54.0–78.7 → 16.8 / 77.2–79.1 | 9.8–15.1 / 55.8–85.3 → 9.7–13.1 / 66.0–73.6 | 5.9–6.5 / 8.9–9.8 → 5.6–6.5 / 10.5–10.9 | no |
| stats-large-noweather | 16.6–16.7 / 17.6–17.7 → 16.5–16.6 / 17.6–17.8 | 14.4–15.7 / 22.7–24.0 → 13.6–14.7 / 22.5–24.2 | 6.3–6.5 / 8.5–9.2 → 5.7–7.2 / 9.1–9.7 | no |
| stats-dock | 16.5–16.7 / 17.6–18.8 → 16.5–16.6 / 17.6–17.8 | 10.7–13.1 / 20.4–22.9 → 11.0–12.1 / 21.7–22.0 | 6.3–6.8 / 8.6–10.7 → 5.7–6.8 / 7.6–10.4 | no |

**Chromium** (one run each, headed GPU and headless, main and branch):
busy interval 16.7 / 17.2–17.7 and text 13–16 / 21–26 for the large
float and the docked pane alike. Unaffected, and unchanged.

**Reading:**

- **Hardware WebRender (the owner's Firefox): no problem, before or
  after.** Every cell runs at 60 fps. Text reaches the screen in about
  15 ms (median) and 25 ms (p95), and a letter in about 8 / 13 ms. That
  is the same with the weather off or the pane docked. Stage 49's
  finding does not happen in a real window with a GPU, and the branch
  changes nothing there.
- **Software WebRender, real window or headless: the problem on main.**
  - Any large float with a frame drops to about 9 fps while text
    arrives: busy interval 100–120 ms, p95 about 195 ms.
  - Text takes 55–77 ms (median) and 140–180 ms (p95).
  - This holds for Statistics, Comm and Group, glass or clear, dark or
    Paper.
- **The branch fixes the large floats** in software WebRender: 60 fps,
  and text at 10–14 / 20–25 ms, the same as docked.
- **Left as it was:**
  - A small or borderless float has late frames now and then (text p95
    50–100 ms, median fine). That is too seldom for the watch.
  - Paper keeps a text p95 of 67–73 ms after the switch (median 11–14,
    busy p95 21). Not explained.

### Cause

The holes under floats in the game text: an even-odd `clip-path: path()`
that cuts what a see-through float covers out of the game text and the
input line (`src/layout/float-holes.ts`, ADR 0091 item 57). A glass float
is see-through only with the weather on; a clear one always is.

- **Bisect** (headless, one run each; busy interval and text → painted,
  median / p95, ms; the `bisect-*` cells of `frame-matrix.ts`). Each row
  removes one effect from `stats-large`:

  | Removed | Busy | Text |
  |---|---|---|
  | nothing | 115 / 209 | 71 / 176 |
  | **the hole in the game text and the input line** | **16.6 / 17.9** | **12.4 / 22.5** |
  | the band's path clip | 105 / 184 | 66 / 148 |
  | the band's gradients | 87 / 152 | 53 / 101 |
  | the band's edge (`::before`) | 107 / 180 | 62 / 141 |
  | the whole band | 19 / 116 | 24 / 77 |
  | the seams | 113 / 195 | 82 / 163 |
  | the glow | 100 / 170 | 59 / 137 |
  | the window's path clip | 108 / 194 | 70 / 161 |
  | the window's gradients | 109 / 190 | 71 / 146 |
  | the window's inset shadows | 91 / 161 | 55 / 125 |
  | the whole window layer | 80 / 137 | 47 / 87 |
  | the hood's shadows, clip and glow | 114 / 196 | 80 / 160 |

- **Clear float with the weather off** (it has the hole too): 101 / 180
  and 55 / 155. So the weather canvas is not needed.
- **CPU per thread** (`bench/thread-cpu.ts`, headless, 60 lines). The
  Renderer thread (WebRender's software rasteriser) used 7.4 s of CPU in
  a 7.5 s text phase. Without the hole it used 2.0 s, docked 1.7 s. The
  main thread used 0.3 s in all three.
- **Prototypes that did not help:** the hole as `polygon(evenodd)`;
  `will-change: transform` on the game text, the float, or the frame's
  layers; `opacity` on the game text. A rectangular `inset()` clip on the
  game text is as cheap as none, so it is the non-rectangular mask.
- **Mechanism.** Each new line scrolls the game text. Software WebRender
  re-rasterises every text run under the mask, across the game's width
  and the float's height. The frame's layers on top add to the cost of
  each masked tile, which is why border off or a small float helps but
  does not cure it. A GPU does this for free.

### The fix and its look

See ADR 0135. In Firefox, App's `FloatVeilWatch` watches the latency
monitor's received → shown. When half of the quick frames have been late
by more than 35 ms for 4 s while there is a hole in the text, the
cockpit switches to **veils**: a plain box in the page colour at each
float, above the game text and below every pane.

- **Hardware WebRender:** it never switched in any run, so nothing
  changes. A headed screenshot of the frame (dark and Paper, seven
  tints, glass and clear; `bench/frame-shots.ts --headed`) matches main
  within the weather's own noise.
  At most 817 of 1.88 million pixels per shot differ by more than 8 of
  255 (the stars' twinkle; max 55). The main and branch shots were taken
  on the laptop display.
- **Software WebRender:** with the weather on, the weather no longer
  shows through a large float. The float looks as it does with the
  weather off:
  - `img/50-clear-float-holes.jpg`: a clear float on main, with the sky
    inside;
  - `img/50-clear-float-veil.jpg`: with a veil.

  **This trade-off is the owner's to confirm.**
- **Tried and dropped: a veil with the weather's live image**
  (`-moz-element` of the back canvas).
  - It kept the look exactly (at most 8 of 255).
  - Its first paint froze a real software-WebRender window for 10 s at
    about half the switches: rAF gaps of 10 019–10 021 ms in 5 of 11
    tries. A plain veil never froze (4 tries, and every headed-sw cell
    of the final matrix).
  - It cost a main-thread paint at the canvas' 30 fps: a typed letter's
    frame went from 6–7 to 15–16 ms (median) in software WebRender, and
    to 15–18 ms in hardware WebRender when forced on.
- **The watch, tuned twice:**
  - Its first rule (two thirds of 24 frames over 45 ms) switched a
    hardware window once, on a back-to-back load of lines right after
    page load, in the screenshots.
  - With a 4 s span over the window, it then never switched in software
    WebRender, because two dozen lines come within 3 s.
  - The rule now: half the judged frames over 35 ms, held for 4 s.

### The `#perf` overlay

`#perf` toggles it; `#perf report` prints the table. It is described in
the ADR 0047 addendum and ADR 0135.

- **Does received → shown capture the compositor?** No. It ends after the
  main thread's paint, and in Firefox the composite runs after that, on
  WebRender's threads. A slow compositor shows in the frame intervals:
  Firefox's refresh driver waits for the compositor, so the next frame
  and the next text wait too. That is why the overlay shows fps and the
  worst frame of the last 5 s next to the latency. The matrix shows the
  same: on main in software WebRender the busy interval is 107 ms while
  text is 66 ms.
- **Cost** (`overlay-*` against the same cell without it, branch, three
  runs, median / p95 ms):

  | Mode | Cell | Busy interval | Text → painted | Letter → rendered |
  |---|---|---|---|---|
  | headed (HW) | dock | 16.7–16.8 / 17.6–18.0 → 16.7 / 17.5–17.9 | 15.4–15.9 / 23.7–26.6 → 12.5–16.1 / 24.4–27.0 | 7.3–9.0 / 12.2–13.3 → 7.9–9.0 / 12.0–13.7 |
  | headed (HW) | large | 16.7 / 17.6–17.7 → 16.7 / 17.5–18.0 | 15.3–17.3 / 24.7–25.3 → 14.2–16.9 / 24.3–26.0 | 7.5–8.4 / 11.8–15.9 → 8.3–8.7 / 12.8–14.8 |
  | headed-sw | dock | 16.8–16.9 / 17.9–18.4 → 16.8 / 17.7–18.1 | 13.1–14.2 / 22.2–23.9 → 12.5–15.3 / 23.0–23.1 | 6.1–7.2 / 11.5–11.7 → 6.4–6.8 / 10.6–12.4 |
  | headed-sw | large | 16.7–16.8 / 17.6–18.0 → 16.8 / 18.0–21.0 | 13.3–13.6 / 21.8–24.4 → 11.4–13.1 / 20.0–25.4 | 6.4–6.9 / 12.8–13.8 → 5.7–6.4 / 11.6–13.1 |
  | headless | large | 16.5–16.6 / 17.6–17.8 → 16.6 / 19.9–20.5 | 11.0–12.9 / 21.3–23.6 → 11.5–14.1 / 21.4–22.6 | 5.6–6.4 / 8.5–10.3 → 5.5–6.3 / 8.4–9.4 |

  In hardware WebRender the overlay is within noise. In software it adds
  2–3 ms to the busy interval's p95 (its text repaint 4 times a second),
  with no effect on the latencies.

### Regression check

browser-bench has a `float` section (`--only float`). It measures the
framed Statistics float over the weather against the pane docked, in
each browser, headless. Firefox runs there with software WebRender, the
mode that failed. There are two budgets:

- busy interval p95 ≤ 34 ms;
- text → painted p95 ≤ the docked pane's + 15 ms.

On main, Firefox misses both (busy p95 about 195 ms; text p95 150–160
against about 22). On the branch (`--only float`, 2026-11-10, load 1.5–1.9):

| | Firefox (software WebRender) | Chromium (GPU) |
|---|---|---|
| Busy interval, float | 16.6 / 17.6 **PASS** | 16.7 / 17.4 **PASS** |
| Text → painted, float vs docked | 13.5 / 21.4 vs 11.7 / 20.6 **PASS** | 11.5 / 19.3 vs 11.6 / 21.1 **PASS** |
| Letter → rendered, float vs docked | 5.5 / 9.0 vs 5.8 / 10.5 | 12.0 / 18.7 vs 12.1 / 19.8 |
| Veils | yes | no |

### Remaining risk

- The veils change the look for software-WebRender users (see above).
- A small or borderless float in software WebRender still has late
  frames now and then. So does Paper after the switch (p95 only).
- The first 4 s or so of text after a large float opens is still slow on
  those machines, until the watch switches. The switch holds until the
  page is reloaded.
- A hardware machine that is slow for another reason could switch. It
  then loses the weather inside floats; the veil itself costs nothing.
- Playwright's Firefox is a patched build. Its compositing mode on this
  machine matches the owner's report ("WebRender"), but the owner's own
  numbers are the real check: see the test guide.

## Test guide

Run `npm run dev` on the branch `stage-50-firefox-frame` (not merged to
`main`) and open it in your normal Firefox.

1. In Firefox, open `about:support` and note **Compositing** (expected:
   WebRender).
2. Enter MUME (or replay a run log) and type `#perf` on the input line.
   A small box appears low in the left corner:
   - **fps**: frames in the last second (60 on a 60 Hz screen);
   - **worst frame 5 s**: the longest gap between two frames in the last
     5 s (about 17 ms is perfect; over 50 ms is a visible hitch);
   - **received -> shown**: text arrival to drawn, median / p95 over
     30 s;
   - **key -> send**: key press to the command leaving, median / p95.

   It takes no keys or clicks and stays on in the tab until `#perf`
   again. `#perf report` prints the full table, as `#perf` used to.
3. Play for a minute with your usual setup. Then try, a minute each:
   - the weather on and off (Settings → Weather);
   - the Statistics pane on (it floats over the game), and moved large;
   - the Comm or Group pane dragged out as a float;
   - border off and clear background (pane hover buttons);
   - Paper.
4. Expected in a Firefox with hardware WebRender: fps 60, worst frame
   below about 35 ms, received → shown about 15 / 25 ms, in every case.

**Feedback wanted:**

- Your four overlay numbers in the normal setup and with a large
  Statistics float over the weather.
- Whether the overlay's place and look are fine.
- A decision on the trade-off: on a machine whose Firefox has no GPU
  compositing (about:support → "WebRender (Software)"), large floats
  stop showing the weather inside them, instead of running at about
  9 fps while text arrives. You can see it by starting Firefox with
  `LIBGL_ALWAYS_SOFTWARE=1` (Linux), turning the weather on, opening
  Statistics and playing for 5 s.

## Owner feedback

(None yet.)
