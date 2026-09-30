# E — Side panes, chrome and frame composition during play

Reviewer E, WebCockpit performance review, 2026-09-30. Worktree
`/home/ole/proj/webcockpit/.claude/worktrees/agent-a6ffa49a90e9337b7`
(base 20c4815 = 0.1.19; main's two later commits are docs only). No fix
is committed; experiments are patches (§7). "FF" = Playwright Firefox
155 (the owner has 156), "CR" = Playwright Chromium 153 headless shell
with `--enable-gpu --use-angle=vulkan` (real GPU; without it SwiftShader
burns 10+ s of CPU per 20 s with the map on and distorts everything).

## 1. Summary

1. **The caret blink costs text latency (E3).** It is an infinite CSS
   animation; while the caret shows (a command being typed, an empty
   line) it keeps both browsers' frame loops running, so arriving text
   waits for the next vsync: receipt → rendered median **10.3 ms (FF) /
   11.7 ms (CR)** (p95 ~19 ms), against **2.3 / 2.9 ms** (p95 5–8 ms)
   with nothing animating (both engines render at once from idle). It also costs
   ~3.6 s (FF) / ~2.7 s (CR) of CPU per minute. **P1** (a 500 ms JS
   toggle, patch): 3.1 / 3.4 ms, FF 6 instead of 60 refresh ticks/s, CR
   7 instead of 60 compositor frames/s. Rule: nothing may animate
   continuously during play.
2. **The GMCP panes rebuild all their DOM on every message, inside the
   text frame (E1, E5).** In a fight (owner log + synthesized GMCP, DPR 2,
   default layout + map) 56 % of the frames that paint game text also run
   pane renders, ~1.5 ms more main-thread time each (FF 3.16 vs 1.46 ms,
   CR 2.96 vs 1.47 ms median). The Character pane re-renders on every
   `Char.Vitals` (~1.4/s in a fight) though it shows none of the values
   that change.
3. **P2 row diff (patch):** those frames −1.0 ms (FF 3.16 → 2.10, CR
   2.96 → 2.29 ms; p95 −1.4 ms), pane script −38–44 %, CR main-thread busy
   −13 %. Same markup, ~80 lines.
4. **Drag hitch (E2):** `.wc-cockpit[data-drag] *` restyles every element
   in the cockpit when a resize/move starts and at the drop — with 20 000
   rows 90 k elements / 171 ms (CR), 45 k / 85 ms (FF). **P3** (a cursor
   shield element, patch): 0.3 / 0.5 ms, behaviour checked.
5. **Invalidation scope is otherwise good (E4):** no pane or chrome update
   during play restyled more than 90 elements (CR trace); `contain:
   strict` holds; `data-status` on `.wc-app` restyles nothing; no
   ResizeObserver callbacks during play.
6. **Idle after a command is cheap (E6):** FF ~4 refresh ticks/s, CR 3
   main-thread frames/s, < 1 % of a core; the clock strip repaints once a
   second by design (a game minute is a real second).
7. **The map is cheap on the main thread (E7):** 2–6 µs per forwarded
   GMCP message, 70 ns per text line, 0.7–0.9 ms worker round trip; no
   measurable CR main-thread cost; in FF ~0.4 ms of display-list work per
   map redraw, ~80–330 ms per minute of 2× play, no reliable effect on
   text frames.
8. **GMCP handling, hidden chrome and long sessions are fine (E9):**
   30–55 µs per GMCP message end to end; UI/Comm histories capped, renders
   0.3–0.6 ms at 1000 entries; the hidden start page and the closed ESC
   menu do no work during play.
9. **Bench gaps (§5):** the frame → paint budget runs with the caret
   blinking, so its published medians (9.7 ms CR, 9.8 ms FF) are the
   vsync-wait regime — the same scenario gives 3.4 / 4.1 ms with blink
   off (M10); every budget run has the panes inactive (no GMCP, never
   `playing`); the "map off" baseline is map-on since 9c0cf8e; all runs
   are DPR 1 at 1280×720; nothing checks idle CPU or invalidation scope.
10. No frame in this area came near 16.7 ms on this machine (worst text
    frames with pane work 9–11 ms, CR, traced, 2× play speed); the gains
    are latency (P1), frame-time headroom (P2) and hitches (P3).

## 2. Measurements

### 2.1 Setup (all measurements)

- Production bundles (`vite build`) of each variant under `perf/builds/`,
  served by `perf/serve.ts` with COOP/COEP (like `vite preview`; timer
  resolution 5–20 µs). `?bench` page, fake socket
  (`__wcBench.connectFake`), fresh browser context per run.
- 1728×1000 CSS px at devicePixelRatio 2 (FF: `layout.css.devPixelsPerPx=2`,
  CR: `deviceScaleFactor: 2`), checked in-page. Default settings = ADR 0023
  layout: right dock Character/Timers/Group/Comm/UI, None tints, borders,
  map floating 25 % × 27 % over the game pane's top-right; arda.mm2 loaded
  and drawn (`data-map-drawn-ms`) before measuring.
- **Play feed** (`perf/gen-play.ts`): the owner's log
  `Rasta/2026-09-18T18-11-42.log` from line 88 000 (a hunting stretch:
  288 prompts, 236 of them fight prompts, 87 moves, 198 commands in 3 min)
  plus synthesized GMCP: `Char.Name`/`StatusVars`/`Group.Set` (5 members)
  and two clock lines first; a partial `Char.Vitals` before every prompt
  (hp/mana/mp walk, fight fields in fights); a `Group.Update` on 80 % of
  fight prompts (10 % otherwise); `Comm.Channel.Text` before each
  narrate/tell/say/yell line (28); `Room.Info` + `Event.Moved` from the
  `tests/fixtures/map-demo.log` walk after each move command (real rooms:
  the map locates, re-centres, redraws). Frames come from
  `logToFrames(…, {speed: 1, sends: true})`; the page delivers them on
  their timestamps ×1/`speed`; each `> cmd` is typed through the real
  input (`__wcBench.keyToSend`). The session reaches `playing`, so every
  pane is active.
- **In-page recording** (`perf/e-harness.ts`, init script): every rAF
  callback is grouped by its frame timestamp; a MessageChannel message
  posted from the frame's first callback gives the main-thread frame time
  (callbacks + style + layout + paint/commit — as bench-hook does). Every
  pane `render`/`blank` is wrapped (duration, frame, elements in the
  pane); output flushes are tagged with their frame; ResizeObserver
  callbacks and clock-strip updates are timed. A frame is **O** (output
  flush only), **OP** (output flush + ≥ 1 pane render), **P** (pane
  render only).
- **CPU**: per-thread utime+stime from `/proc/<pid>/task/*/stat` of the
  browser processes the harness started (`perf/procstat.ts`), 10 ms
  resolution. FF headless composites in software (parent `Renderer`,
  `SwComposite`, `WR*` threads) — those numbers are an upper bound, not
  the owner's GPU; the content-process **main thread** is the comparable
  figure. CR: renderer main thread; its compositor and the GPU process run
  on the real GPU.
- **Traces**: CR DevTools trace (UpdateLayoutTree `elementCount`, Layout
  dirty/total objects, forced layouts with their JS stack, Paint, Commit
  per main frame, compositor BeginFrame/DrawFrame). FF Gecko profiler via
  `MOZ_PROFILER_STARTUP`/`MOZ_PROFILER_SHUTDOWN` (one browser per run):
  RefreshDriverTick count, Styles markers (`elementsStyled`), Reflow,
  DisplayList, thread CPU from sample `threadCPUDelta` (ns), sliced by
  `performance.mark` windows (`perf/ffprof.ts`).
- Load: 4 other reviewers on the machine for most runs; load average
  (1 min) 0.6–8.8 (logged per run in the JSON; M3b, M5 and M10 ran on a
  nearly quiet machine). Variants interleave
  within one browser instance (ABBA order per run); ≥ 4–5 runs each;
  tables give the median over runs and (min–max).

### 2.2 Play: per-pane render frequency, cost and frame placement (M1, base)

Per pane, base build, default layout, speed 2 (divide the rates by 2 for
real time). Render = script time of `render()` (the DOM work it does, not
the browser's style/layout/paint afterwards); median over 5 runs of the
per-run median (p95). "In text frame" = share of its renders that ran in
a frame that also flushed output. Elements = elements in the pane after a
render, all of them new (every render is a `replaceChildren` rebuild).

| Pane | renders/min (speed 2) | FF render ms | CR render ms | in text frame | elements | what triggers it |
|---|---|---|---|---|---|---|
| Character | 172 | 0.44 (0.82) | 0.31 (0.55) | 100 % | 40 | every `Char.Vitals` (any key), `Char.*` |
| Group | 103 | 0.24 (0.52) | 0.14 (0.32) | 100 % | 27 | `Group.*`, fight fields of `Char.Vitals` |
| Timers | 45–47 | 0.62 (1.00) | 0.40 (0.66) | 9–11 % | 8 | tracker changes; 1 Hz wall-clock tick while a bar counts |
| Comm | 13 | 1.00 (2.02) | 0.82 (1.54) | 100 % | 35 | `Comm.Channel.Text` (renders `rows+1` messages, then measures) |
| UI | 7 | 1.06 (1.28) | 0.77 (1.25) | 40 % | 23 | `ui.message` (tracker ◆ lines, system lines) |
| Clock strip | 60 (1/s) | 0.16 | 0.17 | — | 2 spans | 1 Hz timer; text changes every second (a game minute is 1 s) |
| Map | 0 renders | — | — | — | canvas | worker draws; main thread only forwards (§2.8) |

Frame placement (M1 base, 45 s): ~132 OP, ~105 O and ~34 P frames with
rAF work; i.e. 56 % of the frames that paint text also run pane renders.
Median main-thread frame time: O 1.46 ms (FF) / 1.47 ms (CR), OP 3.16 /
2.96 ms, P 2.30 / 1.44 ms. Pane script inside OP frames: median 0.64 ms
(FF) / 0.42 ms (CR) — the rest of the OP − O difference (≈ 0.9 / 1.1 ms)
is the second style/layout pass and paint the renders cause (and slightly
larger flushes: flush script 0.54 vs 0.42 ms in OP vs O frames).
ResizeObserver callbacks during play: 0. No style recalc during play
touched more than 90 elements (CR trace, 5 runs, ~715 recalcs each;
p95 66 elements).

### 2.3 Play: row diff vs base (M1, 5 runs × 45 s, speed 2)

`exp-rowdiff` (§4 P2): Character, Group and Timers keep each row element
whose content key is unchanged and rebuild only changed rows; a render
that changes nothing touches no DOM. Same feed, interleaved, 5 runs each;
median over runs (min–max). Frame ms = main-thread frame time (§2.1).
"Main-thread CPU" = FF content-process main thread / CR renderer main
thread from /proc; "trace busy" = sum of CR main-thread tasks.

| | FF base | FF rowdiff | CR base | CR rowdiff |
|---|---|---|---|---|
| O frame ms, median | 1.46 (1.30–1.76) | 1.54 (1.30–1.64) | 1.47 (1.44–1.65) | 1.49 (1.32–1.57) |
| OP frame ms, median | 3.16 (2.52–3.84) | **2.10** (1.74–2.44) | 2.96 (2.87–3.61) | **2.29** (2.06–2.56) |
| OP frame ms, p95 | 5.44 (3.74–7.20) | **3.82** (3.10–5.06) | 5.17 (4.38–6.22) | **3.80** (3.29–4.55) |
| OP − O, median | 1.54 | 0.50 | 1.53 | 0.81 |
| P frame ms, median | 2.30 (1.84–2.70) | 1.34 (1.20–1.56) | 1.44 (1.30–1.82) | 0.82 (0.72–1.00) |
| pane script ms/min | 159 (125–192) | 89 (71–104) | 114 (105–132) | 71 (61–76) |
| Character render ms, median | 0.44 | 0.16 | 0.31 | 0.14 |
| Group / Timers render ms | 0.24 / 0.62 | 0.16 / 0.36 | 0.14 / 0.40 | 0.16 / 0.26 |
| main-thread CPU ms/min | 1519 (1239–1865) | 1279 (1119–1479) | 1665 (1586–1919) | 1519 (1332–1599) |
| CR trace: main busy ms/min | — | — | 1599 (1465–1827) | 1389 (1217–1490) |
| CR trace: recalc / layout / paint ms/min | — | — | 95 / 161 / 348 | 70 / 109 / 298 |
| CR trace: recalc elements p95 | — | — | 66 | 17 |
| load avg (1 min) | 4.5 (3.6–4.8) | 4.2 (2.6–5.5) | 4.4 (3.5–4.9) | 4.3 (3.4–5.3) |

Command: `node perf/e-harness.ts play --browsers firefox,chromium --gpu --trace --builds base,exp-rowdiff --configs default --runs 5 --secs 45 --speed 2 --out perf/results/M1-play-rowdiff.json`
(then `node perf/report.ts perf/results/M1-play-rowdiff.json`).

### 2.4 Play: what the side panes and the map cost (M2, base, 5 runs × 45 s)

Same feed; `default` (all panes + floating map), `nomap` (map off),
`nopanes` (all six panes off). Interleaved in one session. The machine
was ~1.5× slower in this session than in M1 (both browsers, all
variants: P/E-core placement and clocks on this laptop vary; governor
`powersave`, profile `balanced`), so compare within the table, not with
M1.

| | FF default | FF nomap | FF nopanes | CR default | CR nomap | CR nopanes |
|---|---|---|---|---|---|---|
| O frame ms, median | 1.96 (1.54–2.44) | 1.62 (1.52–2.26) | 1.56 (1.30–2.08) | 2.24 (2.13–2.46) | 2.25 (2.15–2.43) | 2.45 (2.33–2.65) |
| OP frame ms, median / p95 | 4.10 / 8.10 | 3.66 / 7.28 | — | 5.17 / 7.83 | 5.08 / 8.28 | — |
| main-thread CPU ms/min | **2065** (1652–2372) | 1732 (1546–2278) | **1239** (1066–1558) | **2730** (2570–2837) | 2689 (2556–2744) | **1984** (1891–2158) |
| CR trace main busy ms/min | — | — | — | 2598 | 2571 | 1860 |
| CR recalc / layout / paint ms/min | — | — | — | 155 / 250 / 536 | 151 / 247 / 531 | 98 / 151 / 446 |
| map worker thread ms/min | 293 | 0 | 0 | 266 | 40 | 40 |
| FF parent Renderer + SwComposite ms/min (software, headless) | 4703 | 3318 | 2865 | — | — | — |
| CR GPU process main + viz ms/min | — | — | — | 1559 | 1239 | 1079 |
| CR raster threads ms/min | — | — | — | 746 | 693 | 386 |
| load avg (1 min) | 4.4 | 3.3 | 2.8 | 2.9 | 3.9 | 4.1 |

At speed 2 (halve for real time): the five panes without the map cost
the FF content main thread ~490 ms/min (8 ms/s) and the CR renderer
main thread ~700 ms/min; the map adds ~330 ms/min in FF (ranges
overlap; M9 with the profiler measured +77 ms/min) and ~40 ms/min
(noise) in CR. The FF median text frame was 1.96 vs 1.62 ms with vs
without the map here, 1.72 vs 1.74 ms in M9: no reliable effect. In CR
the map costs the GPU process ~320 ms/min and nothing measurable on the
main thread. Per-pane render ms in this slower session: Character 0.54 / 0.52,
Group 0.28 / 0.25, Timers 0.86 / 0.78, Comm 1.44 / 1.19, UI 1.10 / 1.28
(FF / CR).

Command: `node perf/e-harness.ts play --browsers firefox,chromium --gpu --trace --builds base --configs default,nomap,nopanes --runs 5 --secs 45 --speed 2 --out perf/results/M2-play-configs.json`.

**M9, FF with the Gecko profiler** (3 × 30 s, speed 2, per minute,
medians; `mapright` = the map floating over the right dock instead of
the game text, 30 × 14 cells):

| FF, per minute | default | mapright | nomap | nopanes |
|---|---|---|---|---|
| refresh-driver ticks | 868 | 850 | 870 | 826 |
| Styles: flushes / ms / elements styled | 804 / 139 / 11 101 | 786 / 166 / 11 085 | 796 / 145 / 11 085 | 584 / 83 / 1 252 |
| Reflow ms | 259 | 320 | 262 | 211 |
| DisplayList ms / WebRender DL ms | 208 / 292 | 247 / 333 | 203 / 271 | 196 / 235 |
| content main CPU (profiler) | 1794 | 2188 | 1717 | 1670 |
| O frame ms, median | 1.72 | 1.80 | 1.74 | 2.86 |

The panes restyle ~9 800 elements per minute (40 per Character render,
27 per Group render …) but add no refresh ticks: their renders share the
text frames. With 3 runs this session is noisy (`nopanes` O frames and
`mapright` pane renders were slower for no mechanism the data shows);
M1/M2 are the figures to rely on.

Command: `node perf/e-harness.ts play --ffprof --browsers firefox --builds base --configs default,mapright,nomap,nopanes --runs 3 --secs 30 --speed 2 --out perf/results/M9-play-ffprof.json`.

### 2.5 Invalidation scope with 20 000 rows (M6, base; 5 reps, medians)

`perf/e-inval.ts`: 15 s of the play feed (session `playing`, panes
filled, map located), then 21 000 synthetic lines (20 192 rows kept).
Each action runs 5×, 3 frames + 120 ms apart, between
`performance.mark`s; the table sums the rendering work in that window.
CR: UpdateLayoutTree count/elements/ms, Layout dirty objects/ms, Paint
ms. FF: Styles markers (elements styled, ms), Reflow ms, DisplayList ms.

| Action | CR recalc (n / elements / ms) | CR layout (objects / ms) | CR paint ms | FF styles (elements / ms) | FF reflow ms | FF display list ms |
|---|---|---|---|---|---|---|
| one output line (baseline, area A) | 1 / 2 / 0.09 | 7 / 1.34 | 1.61 | 2 / 0.33 | 0.53 | 0.86 |
| `link.rtt` → `data-status` on `.wc-app` | 2 / 8 / 0.14 | 0 / 0 | 0 | 0 / 0 | 0 | 0.34 |
| clock strip update | 2 / 6 / 0.11 | 0 / 0 | 0 | 0 / 0 | 0 | 0 |
| Character render | 1 / 40 / 0.28 | 95 / 0.23 | 0.29 | 40 / 0.52 | 0.95 | 0.68 |
| Group render | 1 / 27 / 0.17 | 53 / 0.20 | 0.28 | 27 / 0.45 | 0.39 | 0.59 |
| Timers render | 3 / 14 / 0.24 | 31 / 0.31 | 0.36 | 9 / 0.70 | 0.33 | 1.00 |
| `Char.Vitals` message | 1 / 40 / 0.37 | 95 / 0.29 | 0.36 | 40 / 0.31 | 0.76 | 0.75 |
| `Comm.Channel.Text` message | 1 / 29 / 0.14 | 53 / 0.27 | 0.18 | 36 / 0.35 | 0.96 | 0.66 |
| `ui.message` | 3 / 28 / 0.32 | 56 / 0.36 | 0.34 | 23 / 0.39 | 0.45 | 0.58 |
| `Room.Info` (map move) | 2 / 6 / 0.18 | 0 / 0 | 0 | 0 / 0 | 0 | **0.42** |
| cockpit relayout (`relayoutNow`) | 1 / 5 / 0.09 | 12 / 1.23 | 0.19 | 5 / 0.20 | 0.39 | 1.37 |
| settings change (Comm filter toggle) | 2 / 56 / 0.42 | 133 / 1.69 | 0.46 | 48 / 0.76 | 1.43 | 2.03 |
| caret move (typing) | 4 / 8 / 0.40 | 6 / 0.16 | 0.25 | 3 / 1.10 | 0.19 | 0.40 |
| cursor-blink setting (root attributes) | 5 / 42 / 1.71 | 102 / 4.76 | 0.50 | 50 / 3.76 | 2.35 | 1.63 |
| **drag start + end (base)** | 3 / **89 737** / **171.2** | 12 / 0.92 | 5.1 (+11.2 prepaint) | **45 099** / **84.7** | 0.51 | 3.57 |
| drag start + end (`exp-dragshield`) | 4 / 12 / 0.27 | 25 / 3.25 | 0.24 | 7 / 0.49 | 1.28 | 2.83 |

(The two drag rows use the cockpit's own drag start and `endDrag()`; the
other rows are from the full base run. FF tick time of the drag window:
104 ms base, 12.7 ms with the shield.)

Commands: `node perf/e-inval.ts --browsers chromium,firefox --build base --reps 5`;
`node perf/e-inval.ts --browsers chromium,firefox --build exp-dragshield --reps 5 --actions drag,line,char`;
`node perf/check-dragshield.ts exp-dragshield` (functional check: during a
real pointer drag of the right dock's gap, the element under the pointer
shows `col-resize` over the gap and over the output text, no text is
selected, the dock resizes 297 → 333 px as in base, the shield hides after
the drop — CR and FF).

### 2.6 Idle and typing (M3, M5)

Idle = 10 s of the play feed (panes filled, timers counting, map
located), then nothing arrives for 20 s. `--caret` presses End first so
a collapsed caret shows (as while composing a command); after a sent
command the text stays selected and the caret is hidden, which behaves
like `noblink` here. Variants: builds `base` / `exp-blinkjs` (P1) ×
configs `default` (blink on) / `noblink` / `nopanesnoblink`. Medians of
4 runs, ms of CPU per minute.

**FF, Gecko profiler on (M3)** — refresh ticks from `RefreshDriverTick`
markers; CPU from /proc (includes profiler overhead, same for all).

| FF, per minute | CSS blink (base) | no blink (base) | JS blink (P1) | no blink, no panes |
|---|---|---|---|---|
| refresh-driver ticks/s | **60.0** | 3.8 | **5.7** | 3.8 |
| content main thread | 1470 | 540 | 1080 | 420 |
| parent main thread | 1080 | 450 | 450 | 510 |
| WR RenderBackend + SceneBuilder | 1860 | 420 | 750 | 300 |
| Compositor | 930 | 330 | 540 | 300 |
| sum of the above | **5340** | **1740** | **2820** | 1530 |
| (software) Renderer + SwComposite | 2760 | 510 | 2340 | 1440 |
| Styles / DisplayList ms (content) | 25 / 99 | 4 / 90 | 60 / 162 | 3 / 67 |

The CSS blink adds ~3.6 s of CPU per minute across FF's main and
WebRender threads (6 % of a core) while the caret shows; the JS blink
adds ~1.1 s (2 % of a core; each of its 2 toggles/s is a real paint,
~0.5 ms style + 0.5 ms display list). The software-compositor rows only
say that both variants repaint twice a second in headless.

**CR, DevTools trace on (M3)** — compositor `BeginFrame`/`DrawFrame`
and main-thread `Commit` counts from the trace; CPU from /proc.

| CR, per minute | CSS blink (base) | no blink (base) | JS blink (P1) | no blink, no panes |
|---|---|---|---|---|
| compositor BeginFrame/s | **60** | 6.1 | **7.3** | 9.2 |
| compositor DrawFrame/s | 3.0 | 3.0 | 3.0 | 2.9 |
| main-thread frames/s (Commit) | 3.0 | 3.0 | 3.0 | 2.9 |
| renderer main thread (trace busy) | 480 (400) | 510 (391) | 510 (438) | 420 (316) |
| renderer Compositor thread | **2100** | 480 | **420** | 390 |
| GPU process VizCompositor | 1170 | 360 | 270 | 300 |
| browser process main thread | 480 | 180 | 180 | 180 |

In CR the blink is composited: the main thread does not notice it, but
the renderer's compositor thread, viz and the browser process run every
vsync (+2.7 s CPU per minute, ~4.5 % of a core) to draw 2 changes a
second. The JS blink removes that; it costs 2 small style recalcs a
second on the main thread (recalc 180/min vs 60/min). Idle floor after a
command: 3 main-thread frames/s, ~0.4 s of main-thread time per minute
(0.7 % of a core), mostly the clock strip (E6).

**FF without the profiler (M3b, 4 runs, per minute)** — the same idle
set-up, /proc only; load average 0.6–1.4 (the other reviewers had
finished):

| FF, per minute | CSS blink | no blink | JS blink | JS build, no blink |
|---|---|---|---|---|
| content main thread | 1260 | 570 | 1020 | 540 |
| parent main thread | 750 | 150 | 210 | 150 |
| WR RenderBackend + SceneBuilder | 1650 | 390 | 690 | 390 |
| Compositor | 870 | 300 | 390 | 270 |
| sum | **4530** | **1410** | **2310** | 1350 |

Unprofiled, the CSS blink adds ~3.1 s/min and the JS blink ~0.9 s/min
over no blink.

**Typing (M5, 3 runs × 15 s, a key every 100 ms; per minute; includes
Playwright's input dispatch):**

| | FF CSS blink | FF JS blink | CR CSS blink | CR JS blink |
|---|---|---|---|---|
| FF refresh ticks/s · CR compositor BeginFrame/s | 64.5 | 20.8 | 59.4 | 29.5 |
| main thread (FF content · CR renderer) | 4970 | 3890 | 4380 | 3350 |
| FF parent main · CR browser main | 2150 | 1720 | 2070 | 1680 |
| FF WR backend + scene · CR renderer compositor | 2900 | 1590 | 4180 | 2630 |
| FF Compositor · CR viz | 1200 | 880 | 1750 | 1360 |

While typing, every key renders anyway; the CSS blink still adds the
display-rate ticking on top (FF 64 vs 21 ticks/s, CR 59 vs 30
BeginFrames/s) and 20–45 % more CPU on those threads.

Commands: `node perf/e-harness.ts idle --caret --ffprof --browsers firefox --builds base,exp-blinkjs --configs default,noblink,nopanesnoblink --runs 4 --secs 20 --warm 10 --out perf/results/M3-idle-ff.json`;
the same with `--browsers chromium --gpu --trace` (M3-idle-cr.json); M3b
without `--ffprof`; M5 `typing` (15 s, a key every 100 ms, Ctrl+A every
30 keys).

### 2.7 Text latency with and without a running caret animation (M4)

`latency` scenario: after the idle set-up (visible caret), one short
line arrives at random 150–450 ms intervals for 30 s (~95 lines per
run); `__wcBench.inject` gives receipt → start of the output flush
("wait") and receipt → after that frame rendered on the main thread
("to paint"). 3 runs per variant; median of the per-run medians / p95.

| receipt → rendered, ms | FF CSS blink | FF no blink | FF JS blink | CR CSS blink | CR no blink | CR JS blink |
|---|---|---|---|---|---|---|
| to paint, median | **10.3** | 2.3 | **3.1** | **11.7** | 2.9 | **3.4** |
| to paint, p95 | 19.3 | 5.1 | 6.0 | 19.3 | 8.0 | 7.8 |
| wait for the frame, median | **7.4** | 0.4 | **0.5** | **9.2** | 0.9 | **1.0** |
| wait, p95 | 15.0 | 1.1 | 1.1 | 15.9 | 6.3 | 5.1 |

Per run (FF CSS blink 10.2 / 10.3 / 10.7 ms; no blink 1.7 / 2.3 / 3.5;
CR CSS blink 9.9 / 11.7 / 13.1; no blink 1.8 / 2.9 / 3.3) the split is
clean. Mechanism: with nothing animating, both engines start a frame
almost at once when a message asks for one (FF: an idle refresh driver
ticks right away; CR: the compositor's scheduler issues the missed
BeginFrame); while an animation keeps the frame loop running, the
flush waits for the next vsync tick, on average half a frame. This is
main-thread render time; the display adds the compositor's own vsync
wait in both cases, so the on-screen difference should be similar (an
inference: headless has no real display). CR runs with the GPU flags
had rare 0.3–1.2 s stalls (GPU process busy) in the no-blink and JS
columns; they move the max, not the medians.

Command: `node perf/e-harness.ts latency --caret --browsers firefox,chromium --gpu --builds base,exp-blinkjs --configs default,noblink --runs 3 --secs 30 --warm 10 --out perf/results/M4-latency.json`.

**M10, the bench's own frame → paint scenario** (`benchpaint`: frames
10…409 of `Rasta/2026-09-18T18-11-42.log` at random 20–80 ms, the input
empty and focused as `bench/browser-bench.ts` leaves it, session in
`login`, panes inactive; DPR 2; 3 runs × 400 frames):

| receipt → rendered, ms | FF blink on (default) | FF blink off | CR blink on | CR blink off |
|---|---|---|---|---|
| to paint, median (per run) | **10.3** (11.9 / 10.3 / 9.6) | **3.4** (3.4 / 3.4 / 3.0) | **12.4** (10.8 / 14.2 / 12.4) | **4.1** (4.3 / 4.1 / 4.0) |
| to paint, p95 | 19.5 | 6.1 | 21.2 | 18.6 |
| wait for the frame, median | 7.7 | 0.6 | 9.3 | 1.2 |

The published budget medians (`bench/results/latest.md`: 9.7 ms CR,
9.8 ms FF, DPR 1) match the blink-on column. Command:
`node perf/e-harness.ts benchpaint --browsers firefox,chromium --gpu --builds base --configs default,noblink --runs 3 --secs 40 --out perf/results/M10-benchpaint.json`.

### 2.8 GMCP on the main thread; map; rings (M7, M8)

`perf/e-gmcp.ts` (unminified build, 15 s of play first, then 300
deliveries of each package's real payloads from the play log through the
fake socket; every `gmcp`/`gmcp.raw` bus handler timed separately):

| Per message, µs (`sock.onData` → telnet → JSON.parse → every handler) | FF | CR |
|---|---|---|
| `Char.Vitals` | 43 | 55 |
| `Group.Update` | 30 | 54 |
| `Room.Info` (1–2 KB JSON) | 47 | 46 |
| `Event.Moved` | 33 | 45 |
| `Comm.Channel.Text` | 119 | 140 |
| of which the Comm pane handler (history + one IndexedDB `append` per message, `src/panes/comm.ts:145-160`) | 86 | 91 |
| of which the map forwarder (`src/map/client.ts:165-168`) per `Room.Info` | 6.1 | 2.4 |
| map worker round trip, `Room.Info` → worker `status` back on the main thread, ms | 0.88 | 0.71 |

Map, other: the move-failure regex the forwarder runs on every text line
(`src/map/client.ts:115-116,170-173`) costs 70 ns per line (Node/V8,
93 884 lines of the 5-hour log; `node perf/re-bench.ts`). In FF each map
redraw invalidates the page from the worker's canvas commit and costs a
main-thread display-list update (0.42 ms per `Room.Info`, table in 2.5);
in CR a map move causes no main-thread layout or paint (only 6 elements
restyled for the `data-map-*` attributes, `src/panes/map.ts:263-268`).

`perf/e-rings.ts` (map off, rings filled through the real paths):

| | FF | CR |
|---|---|---|
| UI ring `sessionStorage` write at 10 / 1000 lines (JSON 1 KB / 112 KB), ms median (max) | 0.00 / 0.26 (0.36) | 0.01 / 0.63 (2.06) |
| UI render at 10 / 1000 lines, ms | 0.64 / 0.48 | 0.30 / 0.25 |
| Comm render at 10 / 1000 messages, ms | 0.66 / 0.58 | 0.34 / 0.40 |

The write is coalesced 250 ms after a message (`src/panes/ui.ts:184-200`),
so at most ~4 per second; renders build only the visible `rows + 1`
items. Both are bounded for long sessions.

Commands: `node perf/e-gmcp.ts --build base-nomin --reps 300`;
`node perf/e-rings.ts`; `node perf/re-bench.ts`.

### 2.9 Re-running

Everything, in order (~2.5 h, ports 4241–4249, headless):

```sh
cd /home/ole/proj/webcockpit/.claude/worktrees/agent-a6ffa49a90e9337b7
cp …/scratchpad/perf/E/exp-*.patch perf/   # if perf/ was lost
perf/run-all.sh
node perf/report.ts perf/results/M1-play-rowdiff.json   # etc.
```

`perf/run-all.sh` builds the variants (`perf/build.sh`), regenerates
the play log and runs M1–M10 (and M3b) with the exact commands quoted
in each subsection. Each harness also runs alone; `--runs`, `--secs`,
`--browsers`, `--builds`, `--configs`, `--coi 0` (production headers)
are options of `perf/e-harness.ts` (header comment).

## 3. Findings

### E1 — GMCP panes rebuild all their DOM on every message, inside the text frame

- **Evidence.**
  - Any key of `Char.Vitals` (sent with nearly every prompt; hp, mana
    and moves change all the time) makes `CharModel.apply` report a
    change (`src/gmcp/char.ts:82-86`) and `GameState` emit `char`
    (`src/gmcp/state.ts:115`). The Character pane re-renders on every
    `char` (`src/panes/character.ts:141`) although its board shows none
    of hp/mana/moves (name, XP/TP bars, toggles, four gauges;
    `src/panes/character.ts:61-128`), and each render rebuilds all nine
    rows, ~40 new elements (`src/panes/character.ts:149`).
  - Group rebuilds every member row on any change
    (`src/panes/group.ts:100`). Timers rebuilds all rows and every hit box
    on every change and on its 1 Hz tick (`src/panes/timers.ts:413-430`,
    tick `:436-445`). `CellLine.toElement` always creates new elements
    (`src/panes/grid.ts:68-93`).
  - Each pane schedules its own rAF (`src/panes/pane.ts:146-151`,
    `src/panes/context.ts:73-76`). GMCP arrives in the same socket
    message as the prompt, so the render runs in the same frame, after
    the output flush: 100 % of Character, Group and Comm renders, 40 % of
    UI renders (§2.2).
- **Mechanism.** Full DOM churn per GMCP message, in 56 % of the frames
  that paint game text during a fight, plus a second style/layout pass
  in those frames (E5).
- **Impact (measured, M1 base, speed 2).** OP frames 3.16 ms vs O frames
  1.46 ms median in FF, 2.96 vs 1.47 ms in CR; p95 5.4 / 5.2 ms. Pane
  script 159 (FF) / 114 (CR) ms per minute at 341 renders/min. All far
  below 16.7 ms: a cost, not a missed frame, on this machine.
- **Confidence:** high.

### E2 — A drag start or end restyles the whole cockpit, output rows included

- **Evidence.** `src/layout/layout.css:135-172`:
  `.wc-cockpit[data-drag="…"], .wc-cockpit[data-drag="…"] * { cursor: … !important }`.
  `data-drag` is set when a dock gap or pane boundary is pressed, when
  a floating pane's edge is pressed, and when a title-row drag passes
  4 px (`src/layout/cockpit.ts:424, 460, 499`); removed on drop (`:585`).
- **Mechanism.** A descendant rule with `*` makes the attribute change
  invalidate every element under `.wc-cockpit` — with a full scrollback
  ~20 000 rows plus their spans.
- **Impact (measured, 20 192 rows).** Start + end: CR 89 737 elements,
  171 ms of style recalc (+11 ms pre-paint, 5 ms paint); FF 45 099
  elements, 85 ms (104 ms tick). That is a ~85 ms (CR) / ~42 ms (FF)
  frozen frame when a resize or move starts and again at the drop — the
  only > 50 ms frames this area can cause.
- **Confidence:** high.

### E3 — The caret blink keeps the frame loop running: +7–9 ms text latency and CPU

- **Evidence.** `src/ui/ui.css:361-377`
  (`animation: wc-caret-a 1s steps(1, end) infinite`), restarted by a
  class swap on every caret move (`src/ui/input-pane.ts:731-737`);
  blink is on by default (`src/settings/types.ts:197`).
- **Mechanism.** A `steps()` opacity animation changes twice a second,
  but while it runs FF ticks its refresh driver at the display rate and
  both browsers' compositors sample it every frame. It runs whenever the
  caret shows: while a command is being typed or the line is empty.
  After Enter the sent text stays selected, the caret hides and the
  animation stops (`src/ui/input-pane.ts:300-301, 715-718`).
- **Impact (measured, M3, idle with a visible caret, per minute).** FF:
  refresh driver 60 ticks/s instead of 3.8; content main 1470 vs 540 ms,
  parent main 1080 vs 450 ms, WebRender backend/scene builder 1860 vs
  420 ms, compositor 930 vs 330 ms — ~3.6 s/min (6 % of a core) more,
  plus software-composite work that on the owner's GPU becomes a
  full-window composite each vsync. CR: compositor BeginFrame 60/s
  instead of 6/s; renderer compositor thread 2100 vs 480 ms, viz 1170 vs
  360 ms, browser main 480 vs 180 ms (+2.7 s/min, 4.5 % of a core); the
  main thread is unaffected.
- **Impact on latency (measured, M4).** While the animation runs, text
  that arrives waits for the next vsync tick: receipt → rendered median
  10.3 ms (FF) / 11.7 ms (CR), p95 ~19 ms, against 2.3 / 2.9 ms (p95
  5 / 8 ms) without it — ~7–9 ms more per message, whenever the caret
  shows. The bench's own frame → paint scenario shows the same split
  (M10: 10.3 / 12.4 ms with the default blink, 3.4 / 4.1 ms without).
  Typed characters and echoes wait the same way (inference, same
  mechanism). This is the largest latency effect found in this area.
- **Confidence:** high for the mechanism and for the headless numbers
  (clean split in every run, both engines, two scenarios). Medium that
  the owner's headed Firefox on Wayland shows the same size: the refresh
  driver and scheduler code is shared, but a real vsync source and
  compositor add their own waits; the compositor-side CPU on the owner's
  GPU is an inference (headless composites in software). A 5-minute
  check in the owner's Firefox (blink on vs off, Firefox Profiler
  "Graphics" track) would settle it.

### E4 — Invalidation scope during play is good (negative finding)

- No pane or chrome update during play restyled more than 90 elements
  (CR trace, 5 × 45 s of fight play, ~715 recalcs per run; p95 66). Per
  action at 20 000 rows (§2.5): pane renders 8–40 elements, a settings
  change 48–56, layouts ≤ 133 objects, none touching output rows.
  `.wc-pane` and `.wc-game` have `contain: strict`
  (`src/layout/layout.css:13-30`) and it works.
- `data-status` on `.wc-app` on every status change
  (`src/app/app.ts:235-240`) restyles nothing: no selector uses it (FF 0
  elements; CR 8, the same as a clock tick). Root custom properties are
  written only on appearance changes (`src/main.ts:54-59`,
  `src/theme/cells.ts:139-149`).
- ResizeObserver callbacks during play: 0 (cockpit, output pane and
  chrome observers fire only on real size changes).
- **Confidence:** high.

### E5 — Frame composition: one rAF per pane after the flush's forced layout

- **Evidence.** The output flush forces style + layout
  (`src/ui/output-pane.ts:372`, `scrollTop = scrollHeight`); the pane
  callbacks that follow in the same frame write DOM again, so the frame
  then runs its own style/layout pass. CR trace of the slowest play
  frames (speed 2, with tracing overhead, 9–11 ms): flush with forced
  UpdateLayoutTree 9–15 elements + Layout ~1 ms, two pane callbacks
  1–2 ms, then UpdateLayoutTree 40–65 elements, Layout 95–144 objects,
  pre-paint 0.8–1.2 ms, paint ~2.5 ms, layerize 0.5 ms.
- **Impact.** Explains most of the OP − O difference beyond the pane
  script (≈ 0.9 ms FF, 1.1 ms CR). P2 shrinks the second pass (CR
  recalc 95 → 70 ms/min, layout 161 → 109 ms/min). A scheduler that
  defers pane renders out of busy frames is not needed at these costs
  (P6).
- **Confidence:** high (CR trace), medium for FF (profiler markers, same
  pattern).

### E6 — Idle after a command: one paint a second, by design

- **Evidence.** Clock strip: a timeout 5 ms after every wall-clock
  second (`src/ui/clock-strip.ts:81-100`); with minute precision the
  countdown is game hours:minutes and a game minute is one real second
  (`src/gmcp/clock.ts:27, 302-306`), so its text changes every second.
  Timers pane: its own second-aligned tick while a bar counts
  (`src/panes/timers.ts:436-445`). Timers hub: a 1 s interval not aligned
  to the second, no DOM unless a tracker changes
  (`src/timers/hub.ts:313-326`). Recorder: 2 s flush
  (`src/capture/recorder.ts:339-341`); link probe every 10 s (production
  only). The clock strip also rewrites `data-period` every second
  (`:98`; no selector, no restyle).
- **Impact (measured, M3 `noblink`).** FF 3.8 refresh ticks/s, content
  main ~0.5 s/min (profiled); CR 3 main-thread frames/s, ~0.4 s/min of
  main-thread time. Panes add ~0.1 s/min (Timers ticks) over no panes.
  < 1 % of a core; nothing to fix (P5).
- **Confidence:** high.

### E7 — The map: small on the main thread, but Firefox pays a display-list update per map frame

- **Evidence.** Forwarder: one Map lookup + array push per GMCP event,
  one regex per text line (70 ns), one `postMessage` per microtask
  (`src/map/client.ts:126-177`): 2–6 µs per `Room.Info`; worker round
  trip 0.7–0.9 ms (§2.8). The worker's `status` reply writes three
  `data-map-*` attributes (`src/panes/map.ts:263-268`; 6 elements
  restyled in CR). In FF, each map redraw invalidates the page from the
  worker's canvas commit: 0.42 ms main-thread display-list update per
  move (§2.5).
- **Impact (speed 2).** FF, M2 (5 runs, no profiler): content main
  thread 2065 vs 1732 ms/min with vs without the map (ranges overlap:
  1652–2372 vs 1546–2278); median text frame 1.96 vs 1.62 ms (overlap).
  FF, M9 (3 runs, Gecko profiler): 1794 vs 1717 ms/min, text frame 1.72
  vs 1.74 ms, DisplayList 208 vs 203 ms/min, WebRender display-list
  serialization 292 vs 271 ms/min. So ~80–330 ms/min, i.e. 0.7–2.7 ms
  per second of real-time play, and no reliable effect on text frames.
  The map worker thread uses ~290 ms/min; the headless software
  compositor ~+0.3–1.4 s/min. CR: no measurable main-thread cost (2730
  vs 2689 ms/min); GPU process +320 ms/min. Floating the map over the
  right dock instead of the game text (`mapright`, M9) gave no clear
  difference (3 runs; all pane renders were slower in those runs,
  including panes the map did not cover — noise).
- **Confidence:** high that it is small; low for its exact size in FF.

### E8 — Comm and UI renders force a synchronous layout

- **Evidence.** `AnchoredList.render` replaces the items, then reads
  `clientHeight` and `getBoundingClientRect()`
  (`src/panes/anchored-list.ts:142-159`) inside the pane's rAF, i.e.
  after the flush wrote rows: a forced style + layout.
- **Impact.** CR trace, 30 s of play: 10 forced layouts, 3.1 ms layout +
  1.8 ms style in all (~0.5 ms per Comm/UI render). Comm/UI render
  13 + 7 times per minute at speed 2. Negligible today; would grow with
  channel spam.
- **Confidence:** high.

### E9 — GMCP handling, hidden chrome and long sessions are fine

- GMCP end to end (telnet, JSON.parse, every handler): 30–55 µs per
  message; `Comm.Channel.Text` 120–140 µs, of which 86–91 µs is the
  Comm pane's per-message IndexedDB append (§2.8).
- Hidden chrome is quiet (code reading, not measured): the start page's
  banner timer runs only while its frame is the visible top frame
  (`src/chrome/frames/start-main.tsx:70`, `src/chrome/banner.tsx:29-51`),
  so it stops when Enter MUME hides the start page; the closed ESC menu
  renders an empty `hidden` overlay (`src/chrome/index.tsx:223-249`) and
  subscribes to status only while open. The hidden start page re-renders
  only on settings / cell-size / notice changes.
- UI and Comm histories are capped at 1000; at the cap a render costs
  0.25–0.6 ms and the coalesced UI `sessionStorage` write 0.26 ms (FF) /
  0.63 ms (CR, max 2.1 ms) for 112 KB. Pane DOM is replaced, never
  accumulated.
- A settings change during play (e.g. a Comm header click) relayouts the
  whole cockpit (`src/layout/cockpit.ts:244-246, 276-309`: theme tokens
  on all six panes, handles rebuilt, a forced layout): CR 1.7 ms layout
  + 3.6 ms script, FF 11 ms tick. Rare; fine.
- **Confidence:** high (measured parts), medium (code-read parts).

## 4. Proposals (ranked)

### P1 — Blink the caret with a 500 ms timer instead of an infinite CSS animation

- **Change.** `exp-blinkjs.patch` (~50 lines): a timer toggles
  `wc-caret-off` (visibility) while the caret shows, the input has the
  focus and blink is on; a caret move restarts it visible, as today.
  Drop the `@keyframes`. For a real fix, also restart it from the
  settings change (the patch waits for the next caret move).
- **Gain (measured).** Latency (M4), while the caret shows: text
  receipt → rendered median 10.3 → 3.1 ms (FF), 11.7 → 3.4 ms (CR);
  p95 19 → 6–8 ms (no blink at all: 2.3 / 2.9 ms). CPU (M3, idle with a
  visible caret): FF refresh ticks 60 → 5.7/s, main + WebRender threads
  5.3 → 2.8 s/min; CR compositor BeginFrames 60 → 7/s, compositor + viz
  + browser threads 3.75 → 0.87 s/min.
- **Effort** S. **Risk** low (the same 1 s on/off, restarted visible on
  every caret move; `wc-caret-b` kept for the unit test; the full unit
  suite passes; a background tab throttles the timer, harmless).
  **Owner-visible:** no. Owner option: stop blinking a few seconds after
  the last key (GTK's default) or default blink to off (as foot's cursor
  is) — either also removes the residual 2 toggles/s.
- **Goals:** text speed and input latency (the frame loop stays idle, so
  a message or a key is rendered at once instead of at the next vsync);
  idle CPU/power. **Budget:** frame → paint "next animation frame" (today
  met, but half a frame later than possible while the caret shows);
  propose an idle-latency check (G4).
- **General rule this shows:** nothing may animate continuously during
  play (CSS animations, transitions, rAF loops). Any such thing moves
  every text frame to the vsync grid; a bench check should catch it.

### P2 — Row-level diffing for the cell-grid panes (Character, Group, Timers)

- **Change.** `CellLine.key()` + a small `RowList` in
  `src/panes/grid.ts`: a row whose key is unchanged keeps its element,
  a changed row is rebuilt in place, and a render that changes nothing
  touches no DOM (`exp-rowdiff.patch`, ~80 lines). Same markup, so the
  same pixels.
- **Gain (measured, M1, 5 × 45 s interleaved):** OP frames 3.16 → 2.10 ms
  (FF), 2.96 → 2.29 ms (CR) median; p95 5.44 → 3.82 / 5.17 → 3.80 ms;
  P frames 2.30 → 1.34 / 1.44 → 0.82 ms; pane script −44 % / −38 %;
  CR main-thread busy 1599 → 1389 ms/min (−13 %; recalc −26 %, layout
  −32 %, paint −14 %); FF content main thread 1519 → 1279 ms/min (−16 %,
  noisy). The pane share of a text frame falls from ~1.5 to ~0.5–0.8 ms.
- **Effort** S–M. **Risk** low: markup unchanged; the unit tests pass;
  a caller that empties the content element must call `reset()` (the
  patch does it in each `blank()`).
- **Owner-visible:** no. **Goals:** text speed (shorter text frames),
  input latency (less main-thread work queued ahead of a key), long
  sessions (~90 fewer short-lived elements per second in a fight). **Budget:** frame →
  paint next frame; burst.

### P3 — Drag cursor on a shield element, not on `.wc-cockpit … *`

- **Change.** During a drag the cockpit shows a transparent full-size
  `.wc-drag-shield` carrying the cursor (and `user-select: none`);
  drop the `.wc-cockpit[data-drag=…] *` rules (`exp-dragshield.patch`,
  ~40 lines). Pointer capture stays on the cockpit.
- **Gain (measured, 20 192 rows):** drag start + end 171 → 0.3 ms style
  (CR), 85 → 0.5 ms (FF); the ~42–85 ms frozen frames at a resize/move
  start and drop disappear. Functionally checked in both browsers
  (cursor over gap and text, no selection, same resize result).
- **Effort** S. **Risk** low (layout e2e checks cursors outside drags
  only). **Owner-visible:** no. **Goal:** text speed / no hitches
  (a layout tweak mid-fight). **Budget:** burst ("no frame > 50 ms").

### P4 — Bench coverage for this area

- G1–G5 in §5: a play scenario with GMCP (panes active), explicit map
  state, DPR 2, an idle scenario and an invalidation check. **Effort** M
  (reuse `perf/gen-play.ts`, `perf/e-harness.ts`, `perf/e-inval.ts`,
  `perf/ffprof.ts`, `perf/procstat.ts`). **Risk** none to the app.
  **Goals:** all three (keeps P1–P3 from regressing).

### P5 — Not needed: aligning the 1 Hz tickers

- The clock strip must repaint every second anyway (E6). The Timers pane
  already ticks on the same second boundary; with P2 its ticks mostly
  touch no DOM. A shared ticker would save at most a fraction of a
  millisecond per second. Leave as is.

### P6 — Not recommended now: a frame-budget scheduler for panes

- Deferring pane renders out of a frame whose output flush was long (or
  running all rAF work through one scheduler, output first) would protect
  text frames in GMCP-heavy bursts. After P2 a pane adds ~0.5–0.8 ms to
  a text frame, and no measured frame came near 16.7 ms; revisit only if
  a burst-with-GMCP benchmark (G1) shows long frames. Effort M, risk
  medium (panes one frame late, ordering).

### P7 — Optional, tiny

- Character: compare a view key before building the nine `CellLine`s
  (saves the remaining ~0.1 ms per `Char.Vitals` after P2).
- `AnchoredList`: cache item heights, measure only after a width change
  or a new item (E8).
- Comm pane: batch its IndexedDB appends (86–91 µs per message) with the
  recorder's 2 s flush (area B/D).

## 5. Benchmark gaps in this area

- **G1 — The budget runs never have active panes.** Every
  `bench/browser-bench.ts` scenario feeds a Cockpit log without GMCP
  through `connectFake`, so the session stays in `login` and all panes
  but UI show `blank()`; the map runs replay only `map-demo.log`'s Room
  lines. No number in `bench/results/latest.md` includes a Character,
  Group, Timers or Comm render, although in play 56 % of the text frames
  carry one (§2.2). Add a play scenario with GMCP (the `perf/gen-play.ts`
  approach: an owner log + synthesized `Char.Vitals` / `Group.Update` /
  `Comm.Channel.Text` / `Room.Info`, `Char.Name` first) and report O vs
  OP frame time, pane renders/min and ms, and a pass rule (e.g. OP p95 ≤
  O p95 + 2 ms).
- **G2 — "Map off" is no longer off.** `latest.md` was generated
  2026-09-28 11:35; the map pane became default-on at 14:08 (9c0cf8e).
  A re-run's "off" columns now start the worker, fetch and parse
  arda.mm2 and draw during `openBench`'s 300 ms settle and the first
  measurements. Set `panes.map.on=false` explicitly for "off", and for
  "on" wait for `data-map-drawn-ms` (as `mapOn` does).
- **G3 — Owner geometry.** The bench runs at 1280×720, DPR 1. The owner
  plays at DPR 2, ~1728×1050 CSS px. FF needs the
  `layout.css.devPixelsPerPx` pref for cross-origin isolated pages
  (`tests/e2e/dpr.ts`); the harness here does that.
- **G4 — The frame → paint budget hides the animation cost.** Its page
  has an empty, focused input, so the caret shows and blinks for the
  whole run: the published receipt → painted medians (9.7 ms CR, 9.8 ms
  FF in `latest.md`) are the vsync-wait regime of E3 (M4 CSS blink:
  10.3 / 11.7 ms), and "pass" hides the ~7 ms a quiet frame loop would
  save. Measured in the bench's own scenario (M10, §2.7: fixture frames
  at random 20–80 ms, empty focused input, panes inactive, DPR 2):
  receipt → painted median 10.3 ms (FF) / 12.4 ms (CR) with the default
  blink, 3.4 / 4.1 ms with blink off. Add a "latency with a visible
  caret" check (the `latency` scenario: isolated lines 150–450 ms apart;
  pass: median receipt → rendered ≤ 4 ms) and an "idle with a visible caret" check
  (FF RefreshDriverTick/s via the Gecko profiler as `perf/ffprof.ts`,
  CR compositor BeginFrame/s and `Commit`/s from the trace, per-thread
  CPU from `/proc` via `perf/procstat.ts`; pass: a few frames per second
  at most while nothing arrives).
- **G5 — No invalidation-scope check.** Add the `perf/e-inval.ts`
  actions at 20 000 rows with pass rules: no pane or chrome update
  restyles more than ~200 elements; drag start/end < 5 ms of style.
  This would have caught the drag hitch (E2).
- **G6 — Headless compositing is not the owner's.** FF headless
  composites in software (`SwComposite`, `Renderer`: ~4 s CPU per minute
  of play here) and CR headless uses SwiftShader unless
  `--enable-gpu --use-angle=vulkan` (the bench's `chromium-gpu` does
  this). Judge budgets by main-thread time; compositor numbers only as
  relative.
- **G7 — Attribution.** The harness's rAF wrapper (frame grouping +
  MessageChannel "after paint"), pane-render wrappers and flush tags are
  ~40 lines and cheap; folding them into `src/app/bench-hook.ts` would
  let every scenario report which work shared a frame.
- **Harness caveat.** In M1/M2 each 45 s window starts with one ~20–30 ms
  task (Playwright handing the event array to the page); identical for
  all variants, invisible in the medians, but it is the "longest task"
  of each run. The idle/latency/typing windows start after it.

## 6. Notes for other areas

- **A and C (latency, all areas):** from an idle frame loop both engines
  run a requested rAF almost at once (FF wait 0.4 ms, CR 0.9 ms median,
  M4); while anything animates continuously the rAF waits for the next
  vsync (7.4 / 9.2 ms median, p95 15–16 ms). So receipt → paint and key
  → echo depend on nothing else keeping the loop alive: today the caret
  blink (E3/P1). Worth a line in the budget method (spec §1.3 "next
  animation frame" is met either way, but half a frame later).
- **A (output):** the flush forces style + layout on every flush:
  `scroller.scrollTop = scroller.scrollHeight` (`src/ui/output-pane.ts:372`).
  CR trace, 30 s of play at speed 2: 156 forced layouts from `flush`
  (63 ms layout + 31 ms style). Pane renders that follow in the same
  frame then need a second style/layout pass (§E1). A one-line append at
  20 000 rows costs ~1.3 ms layout + 1.6 ms paint in CR and 0.5 ms
  reflow + 0.9 ms display list in FF (§2.5, first row).
- **C (input):** `InputPane.submit` calls `output.toTail()` *before*
  sending (`src/ui/input-pane.ts:286` → `src/ui/output-pane.ts:502`,
  reads `scrollHeight`): a forced style + layout inside the Enter
  keydown, ahead of `ws.send` (CR trace: 43 per 30 s, ~0.2 ms layout +
  0.1 ms style each, with tracing). Moving it after the send keeps it
  off the key → send path. `updateCaret` reads `scrollLeft` in its rAF
  (`src/ui/input-pane.ts:713`). The caret blink is §E3/P1 (the patch
  touches `input-pane.ts` and `ui.css`).
- **B (ingest):** GMCP is cheap: 30–55 µs per message end to end
  (§2.8). The Comm pane's per-message IndexedDB `append` (86–91 µs,
  `src/panes/comm.ts:156-160`) could ride the recorder's 2 s flush if B
  batches storage writes.
- **D (long sessions):** in this area everything is bounded (UI/Comm
  rings 1000, pane DOM replaced, no listener growth). Base-build GC
  churn: ~40 new elements per Character render at ~1.4/s in fights; P2
  removes most. `tests/unit/timers-replay.test.ts` fails on base (not
  caused by any patch): it replays every owner log and expects > 1000
  lines, and the newest, `Rasta/2026-09-30T00-11-08.log`, has 364.
- **All:** `bench/results/latest.md` predates the map-on default (G2);
  budget runs have inactive panes (G1).

## 7. Worktree, patches, harness files

Worktree: `/home/ole/proj/webcockpit/.claude/worktrees/agent-a6ffa49a90e9337b7`
(src/ clean; everything under the untracked `perf/`). Copies of the
patches, harness files and result JSONs:
`/tmp/claude-1000/-home-ole-proj-webcockpit/839d0ad2-3f20-4e68-a808-1e236720a92c/scratchpad/perf/E/`.

Patches (apply to 20c4815 with `git apply`). With each one applied,
`npx tsc --noEmit` is clean and the full unit suite (`npx vitest run`)
passes 1326 of 1327; the one failure, `timers-replay` on the newest
owner log, fails the same way on base (§6 D):

- `exp-rowdiff.patch` — `RowList` + `CellLine.key()` in
  `src/panes/grid.ts`; Character, Group, Timers render through it
  (Timers also rebuilds its hit boxes only when the zones change).
- `exp-dragshield.patch` — `src/layout/cockpit.ts` shows a transparent
  `.wc-drag-shield` with the drag cursor during a drag;
  `src/layout/layout.css` drops the `.wc-cockpit[data-drag…] *` rules.
- `exp-blinkjs.patch` — `src/ui/input-pane.ts` blinks the caret with a
  500 ms timer (`wc-caret-off`), only while it shows and the input has
  the focus; `src/ui/ui.css` drops the `@keyframes` animation. (A real
  fix should also restart the timer when the blink setting turns on;
  the patch picks it up at the next caret move.)

Harness (`perf/` in the worktree, copied to `…/scratchpad/perf/E/`):

- `run-all.sh` — every measurement of this report in order (§2.9).
- `build.sh` — builds `base`, `base-nomin` and every `exp-*.patch`
  variant into `perf/builds/<name>/`.
- `gen-play.ts` — play log: owner log + synthesized GMCP.
- `e-harness.ts` — scenarios `play`, `idle`, `latency`, `typing`,
  `benchpaint`;
  variants = builds × settings presets; rAF/pane/flush recorder; /proc
  CPU; CR trace summary (`--trace`); FF Gecko profile (`--ffprof`).
- `report.ts` — tables from an `e-harness` JSON.
- `e-inval.ts` — invalidation scope per action at 20 000 rows.
- `e-gmcp.ts` — per-handler GMCP cost; map worker round trip.
- `e-rings.ts` — UI/Comm ring costs at 1000 entries.
- `check-dragshield.ts` — functional check of the drag shield.
- `re-bench.ts` — map move-failure regex per line (Node).
- `serve.ts`, `procstat.ts`, `ffprof.ts` — static server (optional
  COOP/COEP), per-thread CPU from /proc, Gecko profile summary.
- `results/` — JSON (+ console logs) of every run quoted here:
  `M1-play-rowdiff`, `M2-play-configs`, `M3-idle-ff`, `M3-idle-cr`,
  `M3b-idle-ff-noprof`, `M4-latency`, `M5-typing-ff`, `M5-typing-cr`,
  `M9-play-ffprof`, `M10-benchpaint`; §2.5 = `inval-base-…T19-22-09`
  (CR), `inval-base-…T19-25-05` (FF), `inval-base-…T19-28-08` and
  `inval-exp-dragshield-…T19-28-51` (drag rows); §2.8 =
  `gmcp-base-nomin-…`, `rings-base`; forced-layout attribution =
  `trace-play-probe` (and `smoke-cr-gpu`).
- `play-88000-3m.log` — the generated play feed (also regenerated by
  `run-all.sh`).
