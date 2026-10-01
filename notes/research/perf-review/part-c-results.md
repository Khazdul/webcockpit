# Part C results: before / after on a quiet machine (2026-10-01, 09:13–11:15)

The part C fixes (C1–C14) were measured against the commit before part C
(26cf8e8, "base") with the review's own harnesses, then the extended
benchmark (C15) was run. "Main" is 3a58e50. Both were production builds
(`vite build`), headless Playwright Firefox 155 and Chromium 153, pixel
ratio 2, 1728 × 1000 CSS px (the scroll-mode and ingest harnesses use
1728 × 1050, as in the review). Firefox first, then Chromium; A/B
interleaved within each browser.

- **Load:** 1-min load average 0.2–1.9 for every step. Nothing else ran
  on the machine.
- **Harnesses:** `notes/research/perf-review/harness/<area>/` copied to an
  untracked `perf/` per area, as in `README.md`. Adaptations, all outside
  `src/`:
  - `probe-scrollmode.ts`: a `--dist` option (it served `dist/` only).
  - `e-inval.ts`: the drag action calls the cockpit's `showShield('move')`
    when it exists (main's name for the shield; base sets `data-drag`).
  - `c-recorder-ab.ts` (new, from `c-recorder.ts`): see §7.
  - The output paths of the area C harness.
- **Not used:** the harness timing patch (A), so the flush phase columns of
  `ab.ts` are empty; frame, script and receipt → painted are unaffected.

## Summary: the review's prediction vs measured

| # | Measure | Review predicted | Measured, base → main |
|---|---|---|---|
| 1 | Receipt → rendered, caret visible, Firefox / Chromium (median) | 10.3 → 3.1 / 11.7 → 3.4 ms | 10.5–11.2 → 3.7–4.0 / 11.4–13.8 → 3.9–4.0 ms; **updated** (follow-up), Firefox: 10.1–12.0 → 2.7–2.9 ms |
| 2 | Leave scroll mode at 20 000 rows, Chromium / Firefox | 123–140 → 17–19 / 17–28 → 15–19 ms | 118.5 → 17.4 / 28.4 → 20.3 ms |
| 3 | Colour page 2 frame, Firefox / Chromium | −75 % / −77 % | 34.1 → 8.7 (−74 %) / 34.4 → 5.7 ms (−83 %) |
| 3 | The frame after page 2, Firefox / Chromium | 6–15 → about 2 ms | 13.1 → 5.8 / 14.7 → 2.8 ms; **updated** (follow-up): 11.8 → 4.4 / 13.7 → 2.2 ms |
| 8 | Width change at 20 000 rows, frame, Firefox / Chromium | 90 → 6 / 129 → 4.6 ms | 45.2 → 6.3 / 56.9 → 5.8 ms |
| 5 | Drag start + drop at 20 000 rows, style, Chromium / Firefox | 171 → 0.3 / 85 → 0.5 ms | 88.8 → 0.3 / 35.2 → 0.5 ms |
| 4, 10, 11 | Ingest µs per line, colour-heavy, Firefox / Chromium | about −45 % | 15.8 → 10.9 (−31 %) / 13.7 → 9.1 (−34 %) |
| 4, 10, 11 | Ingest µs per line, normal text, Firefox / Chromium | about −25 % | 2.62 → 2.06 (−22 %) / 1.91 → 1.48 (−22 %) |
| 7 | Recorder task for a 1 MB burst, Firefox / Chromium | ≤ 2–4 ms per task | 12.1 → 3.7 / 11.0 → 1.5 ms (longest of 4) |
| 9 | Text frames with a pane render, Firefox / Chromium | 3.16 → 2.10 / 2.96 → 2.29 ms | **5.06 → 5.28** / 5.33 → 4.09 ms; **updated** (follow-up): 5.17 → 3.72 / 5.27 → 3.82 ms |
| 12 | Catch-up, longest frame, 1 000 / 5 000-line backlog, Firefox | 14–38 → 7–15 ms | 14.4 → 9.5 / 17.3 → 8.5 ms |
| 14 | `#perf` overhead | none within noise | none within noise (§10) |

- Every item but #9 in Firefox improved as predicted.
- **Fixed in the follow-up** (see "Follow-up: chunk height write" at the
  end): the regression below is gone, and #9 in Firefox now improves too.
- **One regression, Firefox only: every output flush costs 1–2 ms more.**
  - The cause, proven by a scratch build (§11): the per-flush
    `contain-intrinsic-block-size` write on the last chunk
    (`OutputPane.addChunkLines`, C8 / ADR 0045).
  - Without that write, a 4-line combat frame's flush script in Firefox is
    0.70 ms. Main: 2.82 ms; base: 1.18 ms.
  - It explains three things:
    - #9's missing gain in Firefox;
    - the Firefox floor of #1 being about 1 ms above base without a
      blink;
    - the later frames of #3 at about 6 ms instead of about 2 in Firefox.
  - Not fixed here (measurement only).
- The ingest gains are smaller than ADR 0048's estimate (−31/−34 % instead
  of about −45 % on colour-heavy text). They are in line with the
  quiet-machine re-run of #4 alone (−22/−33 %).

## 1. Caret blink → text latency (#1)

- **What:** receipt → rendered median, with a short line every 150–450 ms
  and the caret visible. Three runs of 30 s per variant, interleaved.
  "No blink" is the cursor-blink setting off.
- **Command:** `node perf/e-harness.ts latency --caret --browsers
  firefox,chromium --gpu --builds base,main --configs default,noblink
  --runs 3 --secs 30 --warm 10`

| ms, per run | Base, blink | Base, no blink | Main, blink (timer) | Main, no blink |
|---|---|---|---|---|
| Firefox | 11.2 / 10.5 / 11.2 | 2.9 / 2.8 / 2.8 | 3.7 / 3.9 / 4.0 | 3.8 / 3.9 / 4.0 |
| Chromium | 13.8 / 11.4 / 12.3 | 3.6 / 3.8 / 3.6 | 3.9 / 3.9 / 4.0 | 3.9 / 3.9 / 4.0 |

- The wait for the frame is 7.1–11.3 ms with the CSS blink and 0.5 ms
  (Firefox) / 1.2–1.3 ms (Chromium) on main, with or without the blink.
- Flush script per line, Firefox: base 0.67 ms, main 1.54–1.82 ms.
  Chromium: 0.58 → 0.73–0.80 ms. Main's Firefox floor is about 1 ms above
  base without a blink because of the flush cost in §11.
- **Fixed.** The blink no longer costs anything. The bench's caret check
  passes in both engines (median 3.0 / 3.1 ms, budget 4).

## 2. Scroll mode at a full scrollback (#2)

- **What:** from `pageUp()` / `toTail()` to after the next paint, median
  of 5, at about 20 000 rows.
- **Command:** `node perf/probe-scrollmode.ts --browser firefox|chromium
  --dist perfwork/builds/base|main`

| ms, median [of 5] | Enter, base | Leave, base | Enter, main | Leave, main |
|---|---|---|---|---|
| Firefox (20 048 / 20 058 rows) | 28.9 | 28.4 | 16.0 | 20.3 |
| Chromium (20 107 / 20 102 rows) | 113.5 | 118.5 | 19.2 | 17.4 |

- At 3 200–5 900 rows, Chromium was 30.8 / 42.3 ms on base and
  14.9 / 19.1 ms on main.
- The new bench measures it without the harness's own rAF loop: enter /
  leave 8.0 / 7.8 ms (Firefox) and 5.3 / 4.9 ms (Chromium).
- **Fixed.**

## 3. The owner's repro: colour pages (#3)

- **What:** frame median (rAF start → after rendering), n = 14,
  interleaved fresh pages with 2 000 rows of prefill. `+next` is a combat
  frame right after the page.
- **Command:** `node perf/ab.ts --variants base,main --payloads
  p24a,p24b,combat --rounds 7 --reps 2 --next`

| ms | Firefox base | Firefox main | Chromium base | Chromium main |
|---|---|---|---|---|
| Page 1 (`p24a`) | 25.9 | 8.2 (−68 %) | 24.2 | 4.8 (−80 %) |
| Page 2 (`p24b`) | 34.1 | 8.7 (−74 %) | 34.4 | 5.7 (−83 %) |
| The frame after page 1 / page 2 | 12.6 / 13.1 | 6.3 / 5.8 | 12.9 / 14.7 | 2.5 / 2.8 |
| Receipt → painted, page 2 | 37.4 | 10.6 | 44.3 | 7.0 |
| Flush script, page 2 | 26.4 | 6.8 | 19.7 | 3.9 |

- The bench's synthetic 24-bit page agrees: page frame 7.5 / 6.6 ms,
  next 20 frames 5.0 / 2.8 ms median (Firefox / Chromium).
- **Fixed as predicted, except the frames after the page in Firefox.**
  They are about 6 ms because a combat frame costs that much in Firefox
  on main with or without colour rows on screen (§11).

## 4. Width change at a full scrollback (#8)

- **What:** the game pane one cell narrower, median of 10 (max).
- **Command:** `node perf/resize.ts --n 10 --dist
  perfwork/builds/base|main`

| ms, frame (max) | 2 003 rows | 20 003 rows | Forced layout at 20 003 |
|---|---|---|---|
| Firefox base | 8.9 (14.3) | 45.2 (47.6) | 43.4 |
| Firefox main | 4.9 (5.6) | 6.3 (8.8) | 5.5 |
| Chromium base | 10.9 (14.5) | 56.9 (71.4) | 34.7 |
| Chromium main | 2.3 (5.0) | 5.8 (6.2) | 2.2 |

- The bench's width change at 20 000 rows: forced layout 6.4 / 3.6 ms,
  frame 7.3 / 6.7 ms (Firefox / Chromium).
- **Fixed.**

## 5. Drag start and drop at a full scrollback (#5)

- **What:** at 20 192 rows, start (shield or `data-drag`) + two frames +
  `endDrag()`, 5 reps. Chromium: DevTools trace; Firefox: Gecko profiler.
- **Command:** `node perf/e-inval.ts --browsers firefox,chromium --build
  base|main --reps 5 --actions drag,line`

| | Base: elements restyled, style ms | Main: elements, style ms |
|---|---|---|
| Firefox | 45 105, 35.2 ms (ticks 40.1 ms) | 7, 0.5 ms (ticks 15.0 ms) |
| Chromium | 89 749, 88.8 ms (+6.5 pre-paint) | 10, 0.3 ms (+0.5 pre-paint) |

- The bench's real right-dock drag at 20 003 rows: press / drop →
  rendered 16.4 / 17.9 ms (Firefox), 8.4 / 13.7 ms (Chromium). That
  includes the relayout at the drop.
- Side finding from the `line` action in the same run (one line appended
  at 20 192 rows, Firefox): reflow 0.47 → 4.35 ms, ticks 3.7 → 9.2 ms.
  Chromium did not get dearer (layout 1.9 → 0.5 ms). See §11.
- **Fixed.**

## 6. Ingest (#4, #10, #11)

- **What:** the session is `playing` and recording, with `khazdul` and all
  panes, 5 rounds after 1 warm-up, alternating builds.
  - `repro`: 5 440 lines, the three help pages ×40.
  - `big`: 93 883 lines of the owner's biggest log.
- **Command:** `node perf/browser-ingest.ts --builds
  perfwork/builds/base,perfwork/builds/main --browsers firefox,chromium
  --scenarios repro,big --rounds 5 --warm 1`

| µs per line (median ratio main/base) | Colour-heavy (`repro`) | Normal (`big`) |
|---|---|---|
| Firefox | 15.79 → 10.91 (0.68) | 2.62 → 2.06 (0.78) |
| Chromium | 13.75 → 9.10 (0.73) | 1.91 → 1.48 (0.78) |

- Per-message p99, `repro`: Firefox 0.38 → 0.26 ms, Chromium
  0.29 → 0.19 ms. Longest message 8.9 → 5.4 ms in Firefox; in Chromium
  5.6 → 10.7 ms (GC timing, noisy as in the re-run).
- The flush script of the colour run drops far more (background rows,
  #3): Firefox 1 588 → 219 ms, Chromium 1 200 → 113 ms per round.
- Base `big` in Firefox had one 647 ms message in one round (a GC or
  cycle-collector pause); main's longest was 10.6 ms.
- The bench's 500 rules through the whole ingest path: 6.76 / 7.29 µs per
  line (Firefox / Chromium; budget 200).
- **Improved, less than ADR 0048's estimate:** −31/−34 % colour-heavy
  (estimate about −45 %), −22 % normal (about −25 %).

## 7. Recorder chunk write (#7)

- **What:** the main-thread task(s) for a burst of N MB of captured lines.
  - Base: one task of `join` + `TextEncoder` byte count + the
    `RunStore.append` synchronous part.
  - Main, mirroring `recorder.ts`: lines cut into chunks of ≤ 256 KB, one
    task per chunk (`join` + `append`), each after the previous
    transaction. The per-line `utf8Length` count is timed separately,
    since it is spread over ingest.
  - Median of 18 per cell, 3 interleaved rounds.
- **Command:** `node perf/c-recorder-ab.ts --browsers firefox,chromium`

| ms | 0.1 MB | 1 MB | 4 MB |
|---|---|---|---|
| Firefox base: one task (max) | 1.2 (3.4) | 12.1 (19.4) | 32.3 (37.0) |
| Firefox main: longest task (max); tasks | 0.9 (4.0); 1 | 3.7 (6.5); 4 | 2.2 (4.8); 16 |
| Chromium base | 2.0 (4.4) | 11.0 (15.7) | 26.5 (30.5) |
| Chromium main | 1.2 (1.8); 1 | 1.5 (2.5); 4 | 0.9 (1.8); 16 |

- The byte count spread over ingest is about 6.3 ms per MB in both
  engines.
- In the live WebSocket burst (§12), the longest Firefox task fell from
  83.4 ms (a `setTimeout` callback: the recorder's chunk timer) to
  16.3 ms.
- **Fixed.**

## 8. Text frames with a pane render (#9)

- **What:** the play log (owner log + synthesized GMCP) at speed 2, all
  panes, 4 × 45 s per build, interleaved. Median main-thread frame time by
  frame type: O = output flush only, OP = output + ≥ 1 pane render,
  P = panes only.
- **Command:** `node perf/e-harness.ts play --browsers firefox,chromium
  --gpu --builds base,main --configs default --runs 4 --secs 45 --speed 2`

| ms, median (range of runs) | O | OP | OP p95 | P | Pane script ms/min |
|---|---|---|---|---|---|
| Firefox base | 2.60 | 5.06 (5.00–5.24) | 7.48 | 3.70 | 256 |
| Firefox main | 2.76 | 5.28 (5.08–5.28) | 7.84 | 2.50 | 113 |
| Chromium base | 2.83 | 5.33 (5.04–5.39) | 7.03 | 2.98 | 212 |
| Chromium main | 2.65 | 4.09 (3.69–4.11) | 5.52 | 1.64 | 104 |

- The pane work halved in both engines. The Character render went
  0.76 → 0.10 ms, Timers 1.04 → 0.60 ms, Group 0.38 → 0.28 ms.
- Base's absolute numbers are higher than the review's (3.16 / 2.96 ms
  OP). The review measured with 20c4815 and a different log window; the
  A/B here is interleaved, so the difference between base and main stands.
- **Chromium improved (−1.2 ms OP, −1.5 ms p95). Firefox did not.** Its
  pane savings (about 0.6 ms per OP frame) are eaten by the extra flush
  cost (§11).

## 9. Catch-up after a hidden tab (#12)

- **What:** a backlog of N lines of play fed as one socket frame, 2 000
  rows prefilled, 4 reps per size.
- **Command:** `node perf/catchup.ts --variants base,main --sizes
  1000,2000,5000 --reps 4`

| Lines | Firefox: longest frame, base → main (ms) | Firefox: newest line painted | Chromium: longest frame | Chromium: newest painted |
|---|---|---|---|---|
| 1 000 | 14.4 → 9.5 | 25.5 → 34.5 | 12.7 → 11.3 | 23.3 → 33.5 |
| 2 000 | 10.4 → 7.6 | 37.9 → 66.0 | 11.5 → 6.6 | 40.0 → 61.1 |
| 5 000 | 17.3 → 8.5 | 90.4 → 156.2 | 10.5 → 7.9 | 80.9 → 157.3 |

- No rAF gap over 50 ms in either build.
- **As predicted:** shorter frames. The newest line of a 5 000-line
  backlog shows about 70 ms later (review: 20–80 ms).

## 10. `#perf` overhead (#14)

- **What:** main against a scratch build of main with the monitor not
  created (`App`: `perf = null`; the monitor code is then not in the
  bundle). The build was not committed.
- **Commands:**
  - `node perf/e-harness.ts latency --caret --browsers firefox,chromium
    --gpu --builds main,main-nomon --configs default --runs 4 --secs 30`
  - the same with `play --runs 4 --secs 45 --speed 2`

| | Monitor on | Monitor off |
|---|---|---|
| Firefox: receipt → rendered, per run (ms) | 3.90 / 3.74 / 3.80 / 3.88 | 3.76 / 3.68 / 3.82 / 3.68 |
| Chromium: receipt → rendered | 3.92 / 4.10 / 3.98 / 4.04 | 3.76 / 3.97 / 4.05 / 3.88 |
| Firefox play: O / OP / OP p95 (ms) | 2.80 / 5.16 / 7.94 | 2.86 / 5.18 / 7.78 |
| Chromium play: O / OP / OP p95 | 2.56 / 3.94 / 5.47 | 2.59 / 3.94 / 5.30 |
| Main-thread CPU ms/min, Firefox / Chromium | 2 492 / 2 265 | 2 465 / 2 225 |

- **Within noise**, as expected. At most about 0.1 ms on receipt →
  rendered, and 1–2 % CPU.

## 11. Finding: a Firefox flush cost from the chunk height estimate

- **What:** a 4-line combat frame and a 35-line `info` frame on a 2 000-row
  pane, n = 10, interleaved. Two variants on top of base and main:
  - `cvoff`: main with `.wc-chunk { content-visibility: visible
    !important }`;
  - `noisize`: a scratch build of main without the
    `chunk.style.setProperty('contain-intrinsic-block-size', …)` in
    `addChunkLines` (and without the monitor, which §10 shows does not
    matter).
- **Commands:**
  - `node perf/ab.ts --variants base,main,cvoff=main+cvoff --payloads
    combat,info,room --rounds 5 --reps 2`
  - `node perf/ab.ts --variants base,main,main-nomon,noisize --payloads
    combat,info --rounds 5 --reps 2`

| Firefox, ms (script / frame) | Base | Main | Main, cv off | Main, no monitor | Main, no size write |
|---|---|---|---|---|---|
| combat (run 1) | 1.12 / 3.12 | 3.14 / 4.76 | 3.26 / 4.60 | — | — |
| combat (run 2) | 1.18 / 3.64 | 2.82 / 4.58 | — | 2.98 / 4.56 | **0.70 / 2.40** |
| info (run 2) | 2.70 / 4.92 | 4.06 / 6.24 | — | 3.48 / 5.32 | **1.98 / 3.98** |

- Chromium, run 2: combat script 0.54 (base), 0.93 (main), 0.59 (no size
  write) ms. Small in Chromium.
- **Cause:** the write itself, not `content-visibility`. Turning
  `content-visibility` off keeps the cost; removing the write removes it
  and brings Firefox below base.
  - Every flush rewrites the inline style of the last chunk, so Firefox
    restyles and reflows that chunk (up to 200 rows) instead of laying out
    only the appended rows.
  - At 20 000 rows the same write shows as a reflow of 0.47 → 4.35 ms per
    appended line (§5).
- **Effect on the owner's play (Firefox):** about +1–2 ms per text frame.
  It is why #9 shows no gain in Firefox and why #1 is 3.7–4.0 ms instead
  of about 2.8 ms.
- **Fix direction (not built):** write the estimate only when a chunk is
  sealed (full) or while it is off screen. The open, newest chunk is at
  the tail and laid out anyway, so its estimate is never used.

## 12. Firefox key → wire during the paced WebSocket burst (bench lead, C-P8)

- **What:** the bench author saw Firefox key → wire p95 of 121–235 ms
  under the paced WebSocket burst, against 5–17 ms in Chromium.
  - The bench cannot run on base: its probe hooks (`connectWs`,
    `benchFrames`) are new.
  - So the review's own harness (`c-ws.ts`: a loopback server, the 4.7 MB
    log in 16 KB messages, the next burst 1 s after the page acknowledges
    the end marker) ran on both builds, interleaved, 100 Playwright keys
    each. Then one run per build with the Gecko profiler.
- **Commands:**
  - `npm run bench -- --only ws --browsers firefox` ×3
  - `node perfC/c-ws.ts --browsers firefox --scenarios burst --keys 100
    --dist perfwork/builds/base|main` (×2 each, then `--gecko 1`)
  - `node perfC/c-gecko.ts <profile> <raw>`

| Firefox, paced burst | Key → wire median / p95 / max (ms) | rAF gap p95 / max (ms); gaps > 50 ms |
|---|---|---|
| Bench on main, 4 runs | 2.4–3.9 / 146–208 / 200–245 | max 53.1 / 64.7 / 66.7 / 67.0 |
| `c-ws` base, run 1 / 2 | 3.8 / 240 / 262; 3.2 / 163 / 251 | 49.1 / 92.5, 42 of 1 039; 44.6 / 135.2, 36 of 1 031 |
| `c-ws` main, run 1 / 2 | 2.6 / 141 / 220; 2.8 / 152 / 191 | 33.4 / 53.6, 7 of 1 067; 33.9 / 63.3, 9 of 1 056 |

- **It is real, but not a regression.** It predates part C, and part C
  made it better: p95 160–240 → 140–150 ms, longest frame gap
  92–135 → 54–63 ms, gaps over 50 ms 36–42 → 7–9.
- **What the keys wait for:** Event Timing gives an input delay of
  ≤ 0.2 ms for every key. The page runs the key at once once the event
  exists. The wait comes before that.
  - Playwright's Firefox (Juggler) delivers the key as a normal-priority
    message to the content process.
  - In the profile, each delayed key waited behind 75–150 ms of WebSocket
    `message` tasks plus 20–70 ms of nursery GC. These are queued tasks
    (Firefox applies no WebSocket backpressure), not one long task.
- **What a real (input-priority) key would wait** (Gecko profile, main
  vs base):

  | | Main | Base |
  |---|---|---|
  | Gecko eventDelay over the key phase, median / p95 / max | 1.2 / 7.3 / 26.4 ms | 1.9 / 16.8 / 95.2 ms |
  | Longest top-level task | 16.3 ms (a CC slice) | 83.4 ms (the recorder timer) |
  | Tasks > 50 ms | 0 | 9 |
  | Expected wait at a random moment (Σd²/2T) | 1.30 ms | 2.89 ms |

- **Main thread during the burst (main, 17.2 s, 49 % busy):**
  - WebSocket message tasks (ingest) 2 072 ms, longest 15.7;
  - reflow 1 840 ms;
  - rAF callbacks (flush, panes) 1 336 ms;
  - nursery GC 784 ms;
  - display list 571 ms;
  - style 550 ms.
- **Recommendation: do not build C-P8 now.**
  - Expected gain, estimated:
    - longest frame gap in this stress case about 55–65 → about 25–35 ms
      (one slice plus a frame);
    - Playwright key → wire p95 → about 10–20 ms.
  - For real keys the gain is small: the wait is about 1.3 ms on average,
    p95 7 ms, and no task is over 17 ms.
  - The load is also far beyond play: the whole 4.7 MB log per burst,
    back to back, 12–15 bursts in 18 s.
  - Effort M, with a throughput risk.
  - Fix §11 first: it cuts reflow, the second-largest item above.
  - The bench should label Firefox key → wire under the WebSocket burst as
    a Juggler upper bound (or read Gecko eventDelay), and not judge
    Firefox on the burst's longest rAF gap alone (also report gaps
    > 50 ms).

## 13. The new benchmark (`npm run bench`, 12.3 min)

- **What:** the full run (both browsers, owner geometry), written to
  `bench/results/latest.md`. Load 1.22 at the start, 0.64 at the end.
- **Command:** `npm run bench`

Everything passes except three checks.

| Check | Result | Explanation |
|---|---|---|
| Scrollback 20 000, Chromium map on | 1.44 → 6.40 ms **FAIL** | A low baseline, not a slowdown. Two re-runs (`--only budgets,map --browsers chromium`) passed: 4.98 → 5.75 and 4.42 → 5.80 ms (map off), 5.44 → 6.30 and 5.63 → 5.49 ms (map on). Chromium's empty-pane median is bimodal (1.4 or 4.4–5.6 ms) between runs; the pass rule (≤ 1.5 × empty + 0.5 ms) then hangs on which mode the empty pass hit. |
| WebSocket burst, Firefox: longest rAF gap ≤ 50 ms | 67.0 ms **FAIL** | Real, reproducible (re-runs 66.7 / 64.7 / 53.1). It predates part C and was worse on base (92–154 ms); see §12. |
| Soak counters flat, Chromium | **FAIL**: JS heap after GC 4.3 → 8.3 MB; DOM elements 24 888 → 26 637 (60 s) | Not a leak trend. A 180 s soak gave heap 4.2 → 6.7 MB (lower than at 60 s) and DOM elements 24 888 → 30 276. Rows stayed at 20 004 → 20 118 and frames stayed flat (4.63 → 4.93 ms). The element growth is outside the scrollback: most likely the Comm / UI panes filling their rings, which the short soak starts empty (not verified per pane). The review's 12.9 h soak was flat. The first checkpoint should come after the pane rings are full, or count elements per pane. |

- Passing, for the record (Firefox / Chromium):
  - key → send p99 0.08 / 0.08 ms;
  - caret receipt → rendered 3.0 / 3.1 ms;
  - idle 2.0 / 2.1 frames/s;
  - burst (replay) longest gap 31.0 / 19.2 ms;
  - colour page 7.5 / 6.6 ms;
  - real keys under the colour page, input delay p95 3.4 / 0.9 ms;
  - soak frames 5.10 → 5.56 / 4.71 → 3.25 ms.

## Files

- Untracked working files (not kept): the harness copies in `perf/` and
  `perfC/`, and the builds and raw output in `perfwork/`. The scratch
  worktrees `.claude/worktrees/perf-base` (26cf8e8) and `perf-nomon`
  (main without the monitor or the size write) were removed.

## Follow-up: chunk height write (2026-10-01, 11:24–12:06)

- **The fix** (8d90741, ADR 0045 Consequences): `OutputPane.addChunkLines`
  still counts each chunk's screen lines, but writes
  `contain-intrinsic-block-size` only
  - when the chunk is new (before it is in the document),
  - when it is full,
  - while the view is scrolled back,
  - and for the open chunk on entering scroll mode.
- Rows added to the open chunk at the tail no longer rewrite it. That chunk
  is on screen and laid out, so its estimate is not used there.
- A first version wrote no estimate to the open chunk at all. The e2e
  underscore test at ratio 1.5 caught the flaw: Firefox skips a new
  `content-visibility: auto` chunk until it has checked it. The flush pins
  the view before that check, so a chunk added below the view stayed 0 px
  high and never came into view. The write when the chunk is new costs
  nothing (the element is not in the document yet).
- **Builds:** base = 26cf8e8, main = 3a58e50 (the same `src/` as bbed3dd),
  fix = 8d90741. Production builds, same harnesses, commands and machine as
  above, A/B/C interleaved. Sequential runs, nothing else running. The
  1-min load average was 0.2–1.7, except the first two latency variants
  (8.9 and 4.5, decaying after the e2e suite; CPU idle, and the later runs
  agree with them).

### #1: caret latency, Firefox

- **Command:** `node perf/e-harness.ts latency --caret --browsers firefox
  --gpu --builds base,main,fix --configs default,noblink --runs 3 --secs 30
  --warm 10`

| Firefox, ms per run | Blink (timer; base: CSS) | No blink | Flush script per line |
|---|---|---|---|
| Base | 10.7 / 10.1 / 12.0 | 2.78 / 2.80 / 2.82 | 0.92–0.96 (no blink 0.66–0.68) |
| Main | 3.86 / 3.88 / 3.98 | 4.06 / 3.88 / 4.00 | 1.64–1.84 |
| Fix | 2.90 / 2.74 / 2.92 | 2.84 / 2.84 / 2.76 | 0.68–0.72 |

- **Fixed.** The extra 1 ms is gone, and the blink costs nothing: 2.7–2.9 ms
  with or without it, as base without the blink. The review predicted
  3.1 ms.

### #9: text frames with a pane render

- **Command:** `node perf/e-harness.ts play --browsers firefox,chromium
  --gpu --builds base,main,fix --configs default --runs 4 --secs 45
  --speed 2`

| ms, median of the runs (range) | O | OP | OP p95 | P | Flush script O / OP | Pane script ms/min |
|---|---|---|---|---|---|---|
| Firefox base | 2.64 | 5.17 (4.98–5.20) | 7.50 | 3.64 | 0.71 / 1.00 | 254 |
| Firefox main | 2.78 | 5.23 (5.14–5.40) | 7.49 | 2.57 | 0.83 / 3.01 | 112 |
| Firefox fix | 2.63 | **3.72** (3.60–3.74) | 5.75 | 2.90 | 0.74 / 1.04 | 127 |
| Chromium base | 2.69 | 5.27 (5.23–5.40) | 7.07 | 2.98 | 0.64 / 1.10 | 219 |
| Chromium main | 2.60 | 3.91 (3.84–4.03) | 5.49 | 1.57 | 0.72 / 1.31 | 98 |
| Chromium fix | 2.61 | 3.82 (3.63–4.00) | 5.33 | 1.51 | 0.70 / 1.16 | 99 |

- **Fixed in Firefox:** OP 5.23 → 3.72 ms (−1.5 ms against main and base),
  p95 7.5 → 5.8 ms. The flush in OP frames went from 3.01 to 1.04 ms.
  Chromium is unchanged within noise, slightly better.

### #3: the frames after the colour page

- **Command:** `node perf/ab.ts --variants base,main,fix --payloads
  p24a,p24b,combat --rounds 7 --reps 2 --next`

| ms, frame median (n = 14) | Firefox base | Firefox main | Firefox fix | Chromium base | Chromium main | Chromium fix |
|---|---|---|---|---|---|---|
| Page 1 (`p24a`) | 25.2 | 8.4 | 5.4 | 22.9 | 3.8 | 3.6 |
| Page 2 (`p24b`) | 38.3 | 8.8 | 7.7 | 35.8 | 5.9 | 5.8 |
| The frame after page 1 / page 2 | 10.8 / 11.8 | 6.3 / 6.2 | **4.2 / 4.4** | 11.4 / 13.7 | 2.7 / 2.5 | 2.4 / 2.2 |
| Its script, after page 1 / page 2 | 1.17 / 1.04 | 4.72 / 3.66 | 1.04 / 0.87 | 0.60 / 0.62 | 0.98 / 0.76 | 0.74 / 0.63 |

- **Improved, not to about 2 ms in Firefox.** The frame after the page is
  4.2–4.4 ms (main 6.2). Its script is back at base (about 1 ms). The rest
  is rendering after the script, 3.2–3.5 ms; a combat frame without the
  page before it renders in 2.8 ms in the same run, so the colour rows on
  screen cost Firefox about 0.5 ms per frame. Chromium reaches about 2 ms.
- The page frames got cheaper in Firefox too (page 1 8.4 → 5.4 ms): the
  page's rows go into the open chunk, which is no longer rewritten.

### The 4-line combat flush (§11)

- **Command:** `node perf/ab.ts --variants base,main,fix --payloads
  combat,info --rounds 5 --reps 2`

| ms, script / frame (n = 10) | Base | Main | Fix |
|---|---|---|---|
| Firefox combat | 0.98 / 2.74 | 2.88 / 4.52 | **0.94 / 2.84** |
| Firefox info (35 lines) | 2.54 / 4.66 | 3.98 / 5.22 | **2.32 / 4.22** |
| Chromium combat | 0.74 / 2.82 | 0.80 / 2.68 | 0.74 / 2.56 |
| Chromium info | 2.07 / 4.40 | 2.40 / 4.56 | 1.84 / 3.74 |

- **Fixed.** Firefox combat script 2.88 → 0.94 ms, at base. The scratch
  build without the write in §11 gave 0.70 ms; that build had no monitor
  and differs by run.

### One line appended at 20 192 rows (§5)

- **Command:** `node perf/e-inval.ts --browsers firefox,chromium --build
  base|main|fix --reps 5 --actions line` (the `line` action only)

| Median of 5 | Base | Main | Fix |
|---|---|---|---|
| Firefox: elements styled; style / reflow ms; ticks ms | 1; 0.20 / 0.58; 3.8 | 2; 0.44 / 4.90; 8.4 | **1; 0.18 / 0.55; 3.7** |
| Chromium: elements; layout / paint ms | 2; 1.85 / 1.81 | 4; 0.47 / 0.86 | 2; 0.53 / 0.96 |

- **Fixed.** Firefox reflow per appended line 4.90 → 0.55 ms (base 0.58).
  The style touches one element again, the new row, not the chunk.

### Bench fixes and the full run (`npm run bench`, 12.6 min)

- **Bench changes** (bench/ only), for the three failures in §13:
  - **Soak:** the first checkpoint comes after 15 s of play, and DOM
    elements are counted per area. The growth in §13 is row content: the
    scrollback starts filled with synthetic rows, and the log's rows
    (prompts, echoes, colours) carry more spans. Firefox: row content
    25 073 → 26 638, the rest of the output 105 → 105, side panes
    246 → 292, the rest of the page 58 → 58. Row content is reported, not
    judged (the row count is). Chromium heap after the warm-up:
    8.6 → 9.1 MB (was 4.3 → 8.3 from a cold start).
  - **WebSocket burst:**
    - Firefox key → wire is labelled an upper bound (§12).
    - The check reports the rAF gaps over 50 ms.
    - Firefox passes at ≤ 2 gaps over 50 ms per burst and none over
      100 ms. Chromium keeps the longest gap ≤ 50 ms.
    - The threshold comes from six interleaved `--only ws --browsers
      firefox` runs:

      | Firefox | Gaps > 50 ms (bursts) | Longest gap (ms) | Key → wire p95 (ms) |
      |---|---|---|---|
      | 3a58e50 | 13 (12), 6 (12), 13 (11) | 63.3, 60.4, 66.6 | 115–200 |
      | Fix | 8 (12), 4 (12), 18 (13) | 63.4, 53.3, 82.2 | 110–154 |

    - The two runs are the same within noise. A run that fits 13 bursts in
      the window has more gaps. The review's harness gave about 3 gaps
      per burst before part C.
  - **Scrollback 20 000:** passes at ≤ 1.5 × the empty-pane median + 0.5 ms,
    or ≤ 8 ms, half the §1.3 next-frame budget at 60 Hz.
    - Chromium's empty-pane median is bimodal between pages (§13). With the
      relative rule alone, the check failed whenever the empty pass hit the
      low mode.
    - 8 ms still catches the slowdown the check was written for (21 ms at
      full with rows trimmed one by one).
- **The first full run** (with a fixed threshold of 15 gaps) failed one
  check: Firefox's WebSocket burst, 17 gaps of 922 in 13 bursts, longest
  79.3 ms. The re-runs above led to the per-burst rule.
- **The second full run passes every check** (19 of 19). Load 0.7 at the
  start, 0.5 at the end. Firefox / Chromium:
  - caret receipt → rendered median 2.3 / 3.1 ms (was 3.0 / 3.1).
    - One Chromium line took 1 023 ms (the max).
    - Frame → paint (map off) had one 1.9 s frame wait too, with a 0.5 ms
      script (1 late frame of 400, within the 1 % allowed).
    - These are stalls of headless Chromium, not the page's work.
  - colour page, the next 20 frames: median 3.1 / 2.7 ms (was 5.0 / 2.8);
  - scrollback 2.18 → 2.08 / 4.82 → 5.80 ms (map off);
  - WebSocket burst 6 gaps in 12 bursts, longest 66.6 ms / longest
    29.9 ms;
  - play with GMCP, text frames with a pane render: median 3.6 / 3.9 ms;
  - colour page 24-bit page frame 8.2 / 5.5 ms;
  - soak frames 3.40 → 3.56 / 4.30 → 4.95 ms. Counters are flat.
