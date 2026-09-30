# Quiet-machine re-run (2026-09-30, 23:44–00:08)

After the five reviews, the key comparisons were re-run one at a time with
the reviewers' own harnesses and builds (commit 20c4815 plus the
experiment patches). The browsers were headless Playwright Firefox 155 and
Chromium 153, at pixel ratio 2 and 1728 × 1000 CSS px.

- **Load:** 1-min load average 0.3–1.8 during step 1. During steps 2–7 it
  was 2.5–5: the harnesses' own browsers and servers, with the owner's
  Firefox open. The reviews themselves ran at 2–7.
- **Script:** `rerun.sh` in the session scratchpad (not kept). Each step
  below gives its harness command.

## 1. Caret blink → text latency (area E, #1)

- **What:** receipt → rendered median, with a short line arriving every
  150–450 ms and the caret visible. Three runs of 30 s per variant,
  interleaved.
- **Command:** `node perf/e-harness.ts latency --caret --browsers
  firefox,chromium --gpu --builds base,exp-blinkjs --configs
  default,noblink --runs 3 --secs 30 --warm 10`

| ms, per run | CSS blink (today) | No blink | Timer blink (`exp-blinkjs`) |
|---|---|---|---|
| Firefox | 10.8 / 12.7 / 11.5 | 3.3 / 2.8 / 3.2 | 3.3 / 2.9 / 3.4 |
| Chromium | 11.1 / 12.7 / 10.8 | 3.7 / 3.4 / 3.4 | 3.5 / 3.4 / 3.4 |

- The wait for the frame alone is 7.8–10.8 ms with the CSS blink and
  0.5–1.1 ms without.
- **Confirms #1.**

## 2. Scroll mode at a full scrollback (areas C and D, #2)

- **What:** from `pageUp()` / `toTail()` to after the next paint, median
  of 5, at about 20 000 rows. "Fix" is `.wc-rows { scrollbar-color: auto }`.
- **Command:** `node perf/probe-scrollmode.ts --browser chromium|firefox
  [--fix]`

| ms | Enter, today | Leave, today | Enter, fix | Leave, fix |
|---|---|---|---|---|
| Chromium | 119 | 129 | 15.2 | 18.4 |
| Firefox | 20.5 | 33.5 | 18.0 | 25.0 |

- At about 3 500 rows Chromium was already 35 / 41 ms today.
- **Confirms #2.** Large gain in Chromium; in Firefox leaving scroll mode
  drops by about 8 ms.

## 3. The owner's repro: background rows (area A, #3)

- **What:** frame median (rAF start → after rendering), n = 14,
  interleaved fresh pages. `+next` is a combat frame right after the
  page.
- **Command:** `node perf/ab.ts --variants base,bgclean --payloads
  p24a,p24b,combat --rounds 7 --reps 2 --next`

| ms | Firefox today | Firefox bg rows | Chromium today | Chromium bg rows |
|---|---|---|---|---|
| Page 1 (`p24a`) | 27.3 | 8.7 (−68 %) | 26.5 | 7.0 (−74 %) |
| Page 2 (`p24b`) | 38.3 | 9.4 (−75 %) | 38.7 | 7.1 (−82 %) |
| The frame after page 2 | 15.1 | 5.6 | 16.9 | 3.0 |
| Receipt → painted, page 2 | 44.0 | 15.1 | 51.2 | 13.9 |

- **Confirms #3.**

## 4. Width change at a full scrollback (area A, #8)

- **What:** the game pane one cell narrower, median of 10.
- **Command:** `node perf/resize.ts --n 10`

| ms (frame, max) | 2 003 rows | 2 003 rows + cv | 20 003 rows | 20 003 rows + cv |
|---|---|---|---|---|
| Firefox | 12.3 (19.5) | 3.8 (8.0) | 50.9 (62.7) | 5.6 (8.1) |
| Chromium | 7.9 (14.2) | 3.8 (8.4) | 62.4 (87.6) | 4.6 (11.5) |

- The review measured 90 ms (Firefox) under load. It is 51–62 ms when
  quiet, with the same shape.
- **Confirms #8.**

## 5. Drag start and drop at a full scrollback (area E, #5)

- **What:** at 20 192 rows.
- **Commands:** `node perf/e-inval.ts --browsers chromium,firefox --build
  base|exp-dragshield --reps 5 --actions drag,line`

| | Today: elements restyled, style ms | Shield: elements, style ms |
|---|---|---|
| Chromium | 89 749, 105.7 ms (+6.4 pre-paint, 3.6 paint) | 12, 0.2 ms |
| Firefox | 45 107, 60.1 ms (tick 65.3 ms) | 7, 0.6 ms (tick 17.5 ms) |

- **Confirms #5.**

## 6. Ingest of the repro: assembler raw slice (area B, #4)

- **What:** 5 440 lines of the three help pages ×40. The session is
  `playing`, recording, with `khazdul`; 5 rounds.
- **Command:** `node perf/browser-ingest.ts --builds dist-base,dist-exp
  --browsers chromium,firefox --scenarios repro --rounds 5 --warm 1`

| | Ingest µs/line, today → P1 | Median ratio | Per-message p99 | Longest message |
|---|---|---|---|---|
| Chromium | 13.8 → 10.8 | 0.78 | 0.33 → 0.24 ms | 6.3 → 15.2 ms |
| Firefox | 18.1 → 13.2 | 0.67 | 2.46 → 0.30 ms | 10.1 → 6.0 ms |

- **Confirms #4, with a smaller gain than in the review.**
  - The review measured −40 % / −50 % and 50–69 ms messages under load
    4–7. On a quiet machine the gain is −22 % / −33 %.
  - Firefox's p99 per message falls 8×.
  - The longest single message is 6–15 ms either way, set by GC timing,
    so it is noisy.
  - It is still worth building: small, safe, and it removes most of the
    allocation (22 → 9 KB per colour line).

## 7. Recorder chunk write (area C, #7)

- **What:** the synchronous cost of one chunk write, by chunk size. The
  fix is not prototyped, so this shows the cost only.
- **Command:** `node perf/c-recorder.ts`

| One task, ms | 0.1 MB | 1 MB | 4 MB |
|---|---|---|---|
| Chromium | 1.5 | 13.8 (8.5 of it the `TextEncoder` byte count) | 23.3 |
| Firefox | 1.8 | 9.1 | 35.2 |

- **Confirms #7.** The task grows with the output in the 2 s window, and
  in Chromium most of it is the byte count.
