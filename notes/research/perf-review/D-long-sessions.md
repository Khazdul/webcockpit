# Perf review D — long sessions

Reviewer D: unbounded growth, work that grows with session length, soak test.

- **Machine:** the owner's laptop (i7-12700H, 31 GB, CachyOS, Hyprland), shared
  with four other reviewers the whole time. Load average (1 min) during the
  runs: 0.7–7.2; it is logged next to every number in the result files.
  Absolute timings are therefore noisy. Growth claims below come from
  counters (heap after forced GC, DOM nodes, listeners, handlers, timers,
  IndexedDB records), which the load does not affect, and from start-vs-end
  timings inside one run.
- **Browsers:** Playwright Firefox 155.0 (the owner plays in Firefox 156) and
  Chromium headless shell 153.0.8010.12. Both run headless at DPR 2 in a
  1728 × 1050 CSS px window (the owner's full-screen window).
- **Build:** the production bundle, served by `vite preview`, so the page is
  cross-origin isolated. Worktree at 20c4815 (0.1.19).
- **Labels:** "measured" is a number from a run listed here; "inferred" is
  reasoning from code or from those numbers.

## 1. Summary

1. **Nothing grows with the number of events past its cap.** The soak played
   the owner's three biggest logs back to back on one connection. That is
   12.9 h of his real play: 234,752 lines and 34,358 typed commands, with
   GMCP synthesized at MUME's rates, khazdul loaded and all panes on (map
   too). Once the scrollback is full (~20 k lines, about 1–1.5 h of play),
   the counters stay flat to the end in both browsers:
   - Chromium: JS heap after GC 6.4 → 7.1 MB; DOM nodes 52–54 k; JS
     listeners 110; bus handlers 46; live timers 5–6; intervals 1;
     renderer RSS after GC 365 → 387 MB.
   - Firefox: content-process RSS 443 → 453 MB.
2. **No measured slowdown with session length.** Flush script time, frame
   time, key → send and rAF gaps are the same at the end as at the first
   full checkpoint, within the noise of this machine (±30 % run to run; see
   §2.2). Chromium's layout time per 1000 frames is 646 / 692 / 585 ms for
   loops 0 / 1 / 2. The main session's quiet-machine rerun can narrow the
   bound.
3. **The full 20 k-row scrollback sets the memory and GC floor.**
   - Size: ~52–54 k DOM nodes; ~4 KB of Blink objects per row (1.1 M heap
     objects); Oilpan heap (`blink_gc`) 117–140 MB after GC.
   - Forced full GC: 150–190 ms. This is an upper bound; normal GCs are
     incremental.
   - Against 5 k rows: frame median 5–9 % higher (Chromium and Firefox);
     Chromium's worst major GC 18 ms vs 10 ms.
   - The depth is a trade-off for the owner to decide (P3).
4. **Scrolling back restyles every row.** `.wc-scrolled` toggles the
   inherited `scrollbar-color` on the scroller (src/ui/ui.css:84-86), so each
   scroll-back and each return to the tail restyles the whole scrollback. At
   20 k rows this costs 126 ms (enter) and 140 ms (leave) in Chromium, and
   17 ms and 28 ms in Firefox. The cost grows as the scrollback fills.
   Adding `.wc-rows { scrollbar-color: auto }` brings both to one frame in
   both browsers (measured, exp-scrollbar-color-inherit.patch).
5. **The steady garbage comes from the side panes, not the game text.**
   - At the live rate the Character pane creates 6.2 k DOM nodes per minute
     and the Timers pane 5.1 k, because both rebuild their DOM on every
     render. The game output creates 0.8 k per minute: the panes produce
     about 15× more.
   - Chromium at 1× runs a major GC every ~20 s. In 15 minutes of steady
     real-time play all 44 took ≤ 4.1 ms.
   - Pauses of 36–55 ms (Oilpan atomic compaction or atomic marking)
     appear only after DOM churn bursts: a fast fill, or the 30× soak.
   - Firefox: GC slices at most 16 ms, and no rAF gap over 34 ms in 20
     minutes at 1×; no gap over 50 ms in the whole soak.
   - So GC does not cause hitches in steady play today. The churn matters
     for bursts and for frame time (P2).
6. **Only two in-memory structures are unbounded, and both are small.**
   - Input history (src/ui/input-pane.ts:136, 299): +22 k entries over the
     soak, about +0.7 MB of JS heap. The heap-snapshot diff shows mainly
     strings.
   - The run-event list: a few hundred events.

   IndexedDB grows by design, 6–12 MB per 6-hour run. Its cost per write
   stays flat up to 10,800 run chunks and 20,000 comm messages.
7. **Reconnects and the log player:**
   - 100 disconnect/reconnect cycles leak nothing in either browser: bus
     handlers, timers, intervals, global listeners, observers and workers
     stay constant.
   - 12 open/close cycles of the log player leave DOM, workers (2 map
     workers per open, all terminated), observers and timers clean.
   - One leak: each player open creates a MessageChannel that is never
     closed, +1 live listener per open (src/player/engine.ts:105-119).
     Closing it keeps the count flat (measured,
     exp-player-wall-channel.patch).
8. **Tooling pitfalls, and a gap in bench/.**
   - Chromium's `--trace-gc` does not report the unified-heap major GCs that
     free the DOM.
   - A heap snapshot makes later scavenges about 3× slower. Timing runs must
     trace instead, and keep snapshots out.
   - bench/ has no soak scenario; §5 proposes one.

## 2. Measurements

### 2.1 Method

**Soak** (`perf/soak.ts`, data from `perf/soak-gen.ts`).

- **Page and profile:** production `?bench`, profile khazdul, the fake
  socket (a live connection, not a replay), and `offline` off so the
  profile write-back runs as it does live. All panes are on by default,
  including the map (arda.mm2 in its worker).
- **Input:**
  - Rasta's logs 2026-09-18 (5.45 h), 2026-09-26 (5.04 h) and 2026-09-25
    (2.41 h) are played back to back as "loops" 0–2 on one connection.
  - Gaps are capped at 2 s. Playback runs at 30× log time, 17.6 min of
    play in total.
  - Commands are typed as Enter keydowns on the input, so they go through
    history, the alias engine, send, echo and capture.
- **Synthesized GMCP:**
  - Char.Vitals after every prompt: 42 k.
  - Fight fields plus Group.Add/Update/Remove parsed from MUME's fight
    prompts: 725 fights, 17 k Group.Update.
  - Event.Moved + Room.Info (29 real arda rooms) after each move command:
    13.5 k.
  - Comm.Channel.Text on each comm line: 2 k.
  - Event.Sun and Event.Achieved.
  - The login preamble once.
- **Checkpoints:**
  - When: at the start, after the scrollback fills (cp1), and after each
    loop.
  - Counters: after a drain; in Chromium also after a forced GC.
  - Chromium extras: `Runtime.getHeapUsage`, `Memory.getDOMCounters`, and
    optionally a memory-infra dump and heap snapshots.
  - Storage: IndexedDB record counts and `navigator.storage.estimate()`.
  - Probe: 120 fixed frames from loop 0 at 25–60 ms intervals (flush
    script time; frame time = frame callback → after paint), a 24-bit
    colour block (45 × 64 truecolour cells) ×5, a 2000-line burst, 100
    key → send, and 5 s idle (rAF gaps).
- **Samples every 20 s:** counters, flush/frame/key stats since the last
  sample, a rAF-gap histogram, CDP `Performance.getMetrics` (Chromium) and
  RSS per process from /proc.
- **GC:**
  - Chromium: DevTools trace windows of 40–66 s per loop (`--trace`). `--trace-gc` is also recorded but misses the major
    GCs.
  - Firefox: `JS_GC_PROFILE=0` and `JS_GC_PROFILE_NURSERY=1` (major GC
    slices, and minor GCs ≥ 1 ms) of the content process.
  - Firefox has no forced GC or heap API reachable from Playwright (about:memory does not load there). For Firefox, content-process RSS, DOM counts and rAF gaps are the measures.
- **What 30× does not reproduce:**
  - Wall-time cadences: IndexedDB chunk count, timer ticks, keep-alive.
  - Hours of allocator ageing.
  - These are covered separately: IndexedDB growth (§2.6), and 1× windows
    (§2.5).

**Other harnesses:**

| Harness | Question | What it does |
|---|---|---|
| `perf/scrollback-gc.ts` | Q3 | Output capped at 20 000 vs 5 000 rows through the experiment knob. 90 s of loop-0 frames at 25–60 ms each (~80 rows/s), live then scrolled up. Per flush: script time, frame time, and whether a chunk was dropped. Chromium traced. |
| `perf/probe-scrollmode.ts` | Scroll mode | Enter and leave scroll mode at 2 k and 20 k rows. |
| `perf/churn.ts` | Churn | DOM nodes added per pane per minute at 1×, counted with MutationObservers. |
| `perf/gc-1x.ts` | GC at 1× | Traced 5-minute windows at 1×. |
| `perf/idb-growth.ts` | IndexedDB growth | Store costs up to 10,800 chunks and 20,000 comm messages. |
| `perf/reconnect.ts` | Q4 | 100 reconnect cycles. |
| `perf/player-cycles.ts` | Q4 | 12 open/close cycles of the log player: a PlayerHost from the production chunk, with its CSS, on the synthesized 2.4 h log. Each cycle plays 2 s at 8×, seeks forward, seeks back (the App is rebuilt), then closes. |
| `perf/probe-content.ts` | Firefox noise | Whether a late-probe difference is content or session age. |
| `perf/writeback-bench.ts` | Write-back | Node timing of the profile write-back. |
| `perf/instrument.js` | Counters | Init script counting live timers, intervals, global listeners, ResizeObservers, workers, MessageChannels, IndexedDB transactions and Web Storage writes. |

### 2.2 Soak results

The Chromium run used `--trace --memdump --instrument`. The Chromium
heap-snapshot run is summarised separately below. The Firefox run used
`--instrument`.

**Checkpoints.**

| | rows | DOM nodes after GC | JS listeners after GC | heap after GC (MB) | renderer / content RSS (MB) | runChunks / comm / runEvents | IDB MB |
|---|---|---|---|---|---|---|---|
| Chromium cp0 empty | 3 | 214 | 110 | 4.4 | 241 | 0 / 0 / 0 | 0.1 |
| cp1 full (28 k lines) | 20 127 | 53 875 | 110 | 6.4 | 365 | 67 / 263 / 91 | 1.2 |
| cp2 end loop 0 (94 k) | 20 184 | 52 445 | 110 | 6.8 | 385 | 229 / 827 / 262 | 3.6 |
| cp3 end loop 1 (173 k) | 20 199 | 52 639 | 110 | 6.9 | 391 | 420 / 1513 / 479 | 6.5 |
| cp4 end loop 2 (235 k) | 20 148 | 52 175 | 110 | 7.1 | 387 | 551 / 2017 / 607 | 8.6 |
| Firefox cp0 / cp1 / cp2 / cp3 / cp4 | 3 → 20 148 | elements 145 / 29 610 / 29 139 / 29 358 / 28 208 | — | — | 372 / 443 / 446 / 454 / 453 | same counts | 0.1 → 17 |

Also measured:

- **Bus handlers:** 46 at every checkpoint in both browsers.
- **Live timers / intervals:** 5–6 and 1 at the start and the end.
- **Global listeners:** the same set throughout.
- **Chromium memory-infra, renderer after GC, cp1 → cp4:**

  | Allocator | cp1 → cp4 (MB) | Note |
  |---|---|---|
  | blink_gc (Oilpan: DOM, style, layout) | 116.6 → 130.9 | Intermediate values 132.5 and 139.6; varies with content |
  | partition_alloc | 96.1 → 98.7 | +0.9 per loop |
  | v8 | 15.6 → 16.6 | |
  | malloc | 34.7 → 36.7 | |
  | cc | 61.7 → 57.7 | |
  | gpu | 29.6 | Unchanged |

  Before GC, blink_gc was 130–157 MB: 15–20 MB of garbage between
  checkpoints.

**Chromium heap snapshots.**

- Composition at cp1: 1.10 M objects, 103.7 MB self size, including the
  harness's 20 MB of soak buffers.
- Largest groups:

  | Type | Count | Size |
  |---|---|---|
  | ComputedStyle | 86 k | 6.2 MB |
  | StyleInheritedData | 43 k | 5.9 MB |
  | HarfBuzz glyph vectors | 38 k | 5.4 MB |
  | UniqueElementData | 43 k | 4.8 MB |
  | LayoutText | 38 k | 4.0 MB |
  | FragmentItem vectors | 16 k | 3.5 MB |
  | InlineItem | 85 k | 3.4 MB |
  | LayoutBlockFlow | 20 k | 3.1 MB |
  | Text | 38 k | 3.1 MB |

  That is about 4 KB of Blink objects per scrollback row.
- cp1 → cp4 diff: +0.28 MB self, +299 objects. Growth is in strings
  (+5 k), external string data (+9.5 k) and object-element arrays
  (+193 KB), which matches the input history (+22,286 entries). There are
  no detached DOM nodes in either snapshot, and closures and contexts do
  not grow.
- `perf/heap-diff.ts` compares self size per constructor. It does not
  compute retained sizes, which were not needed because the total grows by
  only 0.28 MB.
- The snapshot run also showed renderer RSS after GC jumping to ~485 MB
  after the first snapshot and staying there. The run without snapshots
  stayed at 365–391 MB, so the jump was the snapshot itself.

**In play, per loop.**

Medians of the 20-s samples. The key → send numbers here include the 30×
load. rAF gaps count all frames.

| | flush med / p95 (ms) | frame med / p95 (ms) | key → send med / p99 / max (ms) | rAF gaps > 34 / > 50 ms (max) |
|---|---|---|---|---|
| Chromium loop 0 / 1 / 2 (no tracing, heap-snapshot run) | 0.73/1.33, 0.79/1.54, 0.70/1.46 | 3.80/7.13, 4.12/7.44, 3.58/6.94 | 0.19/0.49/7.8, 0.19/0.47/1.8, 0.16/0.44/2.6 | 4/0 (42), 2/1 (94), 0/0 (31) |
| Chromium loop 0 / 1 / 2 (traced run) | 0.83/1.72, 0.78/1.60, 1.06/2.19 | 4.88/8.07, 3.85/7.49, 5.36/9.46 | 0.20/0.68/13.2, 0.19/0.71/6.7, 0.21/0.66/7.5 | 2/2 (101), 2/1 (119), 8/3 (634)* |
| Firefox loop 0 / 1 / 2 | 0.60/1.08, 0.74/1.62, 0.76/1.76 | 3.02/5.38, 3.54/7.00, 3.62/7.36 | 0.14/0.36/1.5, 0.16/0.52/1.3, 0.18/0.62/4.0 | 0/0 (33), 1/0 (34), 4/0 (41) |

\* Tracing start and stop fall inside those samples; the run without
tracing had no such gaps.

- Within each loop, the first third and the last third are within ±10 %.
- Firefox steps up from loop 0 to loops 1–2 (frame p95 5.4 → 7.0–7.4). The
  probe at cp3/cp4 was also slower than at cp1/cp2: frame med 3.7–4.0 vs
  2.1–2.4 ms.
- `probe-content.ts` checked whether that step is session age:
  - Setup: one Firefox page, the scrollback refilled with loops
    0, 1, 2, 0, 1, then the same probe after each refill.
  - Result: frame p95 6.9 / 7.1 / 8.1 / 7.7 / 8.6 ms, with load 2.5 → 4.1.
    There is no pattern tied to content or age, and the spread (±30 %) is
    as large as the soak's step.
  - Conclusion: no evidence of a session-length slowdown. The step is
    noise and load on this machine.
- Chromium CDP totals per 1000 delivered frames (loops 0 / 1 / 2):

  | Metric | loop 0 | loop 1 | loop 2 |
  |---|---|---|---|
  | layout (ms) | 646 | 692 | 585 |
  | style (ms) | 468 | 508 | 444 |
  | script (ms) | 999 | 1054 | 885 |

  There is no upward trend. Loop content differs.
- Checkpoint probe, key → send while idle: median 0.01–0.03 ms and p99
  0.2–0.9 ms at every checkpoint in both browsers.

**GC during the soak.**

- **Chromium trace windows** (page main thread; n / max ms):

  | Window | MajorGC | CppGC.AtomicMark max | MinorGC | incremental marking step max | sweep step max |
  |---|---|---|---|---|---|
  | While filling (4–13 k rows, 47 s) | 5 / 7.1 | 0.04 | 24 / 2.1 | 5.1 | 5.0 |
  | Full, loop 0 (66 s) | 4 / 8.6 | 0.05 | 50 / 2.6 | 5.2 | 5.2 |
  | Full, loop 1 (60 s) | 5 / 36.0 | 25.5 | 19 / 4.9 | 5.3 | 5.3 |
  | Full, loop 2 (38 s) | 3 / 9.3 | 0.07 | 26 / 2.9 | 5.4 | 5.5 |
- **Layout per delivered frame:** 1.52 ms while filling, then 2.51 / 1.89 /
  2.50 ms at full. So a full scrollback costs +25–65 % layout, but the
  cost does not grow after that.
- **`--trace-gc` scavenges** (page isolate, run without snapshots): median
  1.0–1.1 ms, p95 1.8–1.9, max 3–4 ms in every loop. In the snapshot run
  they were 3.1–3.6 ms median, max 22 ms, after the first snapshot: that is
  an artefact of the heap profiler.
- **Forced full GC** (`HeapProfiler.collectGarbage`, not incremental):
  6–9 ms empty, 131–191 ms with a full scrollback.
- **Firefox `JS_GC_PROFILE`** (content process), loops 0 / 1 / 2:
  - Major slices: 184 / 134 / 217, p95 4 / 5 / 6 ms, max 9 / 8 / 8 ms.
  - Minor GCs ≥ 1 ms: max 2.6 / 3.5 / 4.4 ms.
  - Reasons: FULL_GC_TIMER, BG_TASK_FINISHED, INTER_SLICE_GC, CC_FINISHED.
    Cycle-collector pauses themselves are not visible here; the rAF gaps
    cover them.

**Writes, soak rate (30×, Firefox; Chromium the same ±10 %).**

| Writer | Rate at 30× | Rate at 1× (inferred) |
|---|---|---|
| comm archive | 106–130 transactions/min | ~4/min |
| timers save | 44–51/min | ~2/min |
| run chunk (+ events + meta) | 28–30/min | Fixed by the 2 s timer: 30/min |
| UI ring to sessionStorage | 51–63/min, 70 KB each | ~2/min |
| clock to localStorage | 3–4/min | |
| profile write-back | 1–3/min | |

### 2.3 Full scrollback: steady state, chunk drop, GC (Q3)

`perf/scrollback-gc.ts`:

- **Setup:** 90 s windows at ~70–83 rows/s, which is about 4× heavy PvP
  spam. Map off, default profile.
- **Chunks:** 100 chunks in both cases (200 rows at 20 k, 50 rows at 5 k).
- **Chromium traced:** tracing inflates the script times.

| | live, no drop: script / frame med (p95) | live, drop flush: script / frame med | scrolled up, no drop: script / frame med | GC in 90 s | long tasks > 16 / > 33 ms |
|---|---|---|---|---|---|
| Chromium 20 000 | 2.08 / 7.38 (10.01) | 5.59 / 12.41 (38 drops) | 0.08 / 4.92 | MajorGC 18, max 18.1; minor max 2.2 | 6 / 1 (max 69 ms) |
| Chromium 5 000 | 2.05 / 6.77 (9.16) | 3.59 / 8.51 (154 drops) | 0.15 / 6.19 | MajorGC 29, max 9.7; minor max 3.2 | 1 / 1 (max 33 ms) |
| Firefox 20 000 | 1.58 / 5.76 (8.74) | 2.54 / 7.52 (38 drops) | 0.24 / 5.82 | slices 28, max 8; minor max 2.6 | rAF > 50 ms: 1 (59.5) |
| Firefox 5 000 | 1.30 / 5.48 (9.40) | 2.02 / 6.98 (154 drops) | 0.14 / 3.06 | slices 35, max 5; minor max 3.8 | rAF > 50 ms: 1 (54.3) |

Also measured:

- **DOM nodes after the fill:** 44 k at 20 000 rows vs 11.5 k at 5 000 (map
  off, few spans). The soak's real content gives 52–54 k at 20 000.
- **Forced full GC after the fill:** 244 + 71 ms at 20 000 rows.
- **The chunk drop:** the flush that drops the oldest 200-row chunk costs
  +3.5 ms script and +5 ms frame in Chromium, and +1.0 / +1.8 ms in
  Firefox. It happens once per 200 rows, every ~10 s in heavy spam.
- **Forced layout in each live flush** (inferred from the "scrolled"
  column): 1.1–2 ms of every live flush script is the synchronous layout
  forced by `scrollTop = scrollHeight` (src/ui/output-pane.ts:372). Scrolled
  flushes skip it: 0.08–0.24 ms.

### 2.4 Entering and leaving scroll mode

`perf/probe-scrollmode.ts`: from `pageUp()` / `toTail()` to after the next
paint, median of 5. One frame is ~17 ms and is the floor.

| | ~2.4 k rows: enter / leave | 20 k rows: enter / leave | 20 k rows with `.wc-rows { scrollbar-color: auto }` |
|---|---|---|---|
| Chromium | 20.8 / 31.6 ms | **125.9 / 140.1 ms** (up to 155) | 16.9 / 17.0 ms |
| Firefox | 16.7 / 17.8 ms | 16.9 / **28.3 ms** | 18.6 / 19.4 ms |

### 2.5 DOM churn and GC at the live rate (1×)

**`perf/churn.ts`.** Firefox, 120 s of loop 0 at 1× (the log's own pace),
full scrollback, khazdul, all panes on.

DOM nodes added per minute:

| Part | Nodes added / min | Mutation records / min |
|---|---|---|
| Character pane | 6 167 | 67 |
| Timers pane | 5 106 | 204 |
| UI pane | 680 | |
| Group pane | 610 | |
| Comm pane | 381 | |
| Game output | 838 | |
| Input clock | 60 | |
| Map | 0 | |

- Panes: ~13 k nodes/min. Output: 0.84 k. Over 6 hours that is about
  4.7 M dead DOM nodes from the panes.

**Chromium, 5-minute traced windows at 1× after a fast fill** (`churn.ts
--trace`, run twice):

- 17–18 major GCs per 5 minutes, one every ~17 s.
- 15–16 of them took 1.5–3.5 ms.
- The first major GC after the fill took 55.4 ms in the first run and
  41.5 ms in the second. The 41.5 ms one was 33.7 ms `CppGC.AtomicCompact`,
  i.e. Oilpan compacting its heap in the atomic pause.
- Minor GC at most 2.2 ms. Sweep steps at most 0.6–2.2 ms.
- Long tasks over 33 ms: 1 per window, and that one is the GC.

**`perf/gc-1x.ts`, 20 minutes of real-time play per browser.** Setup: after
a fast fill, loop 0 plays on at 1× in 4 × 5-minute windows, with khazdul,
all panes on and commands typed. Load was 0.7–1.2 because the other
reviewers had finished. Values per window, 0 / 1 / 2 / 3.

Chromium (traced):

| Metric | Window 0 / 1 / 2 / 3 |
|---|---|
| MajorGC count | 17 / 15 / 14 / 15 (≈ 3 per minute) |
| MajorGC max (ms) | **52.7** / 3.3 / 4.1 / 4.1 |
| MinorGC max (ms) | 2.2 / 1.9 / 3.6 / 2.8 |
| Main-thread tasks > 50 ms | 1 / 1 / 0 / 0 |
| rAF gaps > 100 ms | 0 / 3 / 7 / 4 |
| Flush median (ms) | 3.5–4.4 |
| Frame median / p95 (ms) | 7.0–8.0 / 11.1–11.2 |
| key → send median / p99 (ms) | 0.35–0.41 / 0.93–1.19 |

- The 52.7 ms major GC in window 0 is the first GC after the fill.
- After it, every one of the 44 major GCs in windows 1–3 was ≤ 4.1 ms.
- Sweep steps ≤ 1 ms; incremental marking steps ≤ 5.1 ms.
- The two long tasks: the GC in window 0, and one frame of style + layout
  + rAF work (73 ms) in window 1.
- The rAF gaps over 100 ms (max ~0.6 s) have no main-thread task longer
  than 73 ms behind them. Inferred: stalls in the headless GPU process or
  compositor under `--enable-gpu`, not the page.
- Flush times are inflated by tracing.

Firefox (JS_GC_PROFILE, content process):

| Metric | Window 0 / 1 / 2 / 3 |
|---|---|
| Major GC slices | 9 / 6 / 0 / 0 |
| Slice max (ms) | 16 / 16 / — / — |
| Minor GCs ≥ 1 ms | none |
| rAF gaps > 34 ms | none (max 19–28 ms) |
| Flush median / p95 (ms) | 1.1–1.3 / 2.2–2.4 |
| Frame median / p95 (ms) | 4.4–4.8 / 7.6–7.9 |
| key → send median / p99 (ms) | 0.32–0.36 / 0.72–1.16 |

Conclusion: at the real rate, GC does not cause visible hitches in steady
play in either browser. The 36–55 ms pauses come after heavy DOM churn: a
fast fill, a replay, or the 30× soak.

### 2.6 IndexedDB and Web Storage writers over a 6-hour run

`perf/idb-growth.ts`, using the app's own stores in the page (Chromium /
Firefox):

- **`RunStore.append`** (chunk + meta, an event every 50th):
  - Median per 1000 appends: 0.30–0.59 ms in Chromium, 0.42–0.64 ms in
    Firefox, from chunk 1 to chunk 10,800 (6 h at 2 s). p95 < 1.4 ms. One
    70 ms outlier in Chromium.
  - The synchronous part is 0.05–0.12 ms. It does not grow.
  - After 10,800 chunks: lastChunk 0.4 / 0.6 ms; getChunks (the whole run,
    the player's chainLog) 139 / 79 ms; sealRun 8.5 / 7.0 ms; getEvents
    2.3 / 1.0 ms.
  - Storage estimate: 5.9 MB in Chromium, 11.7 MB in Firefox.
- **`CommArchive.append`** (one transaction per message): 0.17–0.34 ms
  median, flat to 20,000 messages. loadRecent(1000) with 20 k stored:
  15.5 / 23.9 ms. prune: 0.5 / 1.1 ms.
- **UI ring write** (1000 lines, 70 KB JSON to sessionStorage): median
  0.20 ms, max 0.74 / 0.50 ms.
- **Profile write-back** (khazdul parse + setVariable + serialize, Node):
  median 0.33 ms, p95 0.93 ms, at most once per second.

### 2.7 Reconnect cycles and the log player (Q4)

**`perf/reconnect.ts`, 100 cycles per browser.**

- Each cycle: connect (alternately `#reconnect` and `connectLive()`), login
  GMCP, 150 frames with typed commands, then a drop (alternately a server
  close and `#disconnect`).
- Readings every 10 cycles, both browsers:
  - bus handlers 46;
  - live timeouts 1–2;
  - intervals 1 (the banner of the ESC menu, which auto-opens on a server
    drop, 6 Hz while open);
  - global listeners the identical set;
  - ResizeObservers observing 3;
  - workers 1;
  - MessageChannels 1.
- Chromium after GC:
  - DOM nodes plateau at 51–52 k once the scrollback fills (cycle 50).
  - JS listeners 117 constant.
  - Heap 5.34 → 5.67 MB over cycles 50–100 (~6.6 KB per cycle). Inferred:
    about half is the input history, ~55 typed commands per cycle.
- Per cycle, IndexedDB gains one run with its chunk and events, by design.

**`perf/player-cycles.ts`, 12 cycles per browser.**

- After each close, in both browsers:
  - DOM back to baseline: 186 nodes / 137 elements;
  - 0 player elements;
  - timers and intervals at baseline;
  - global listeners unchanged;
  - ResizeObservers all disconnected (74 created, 2 alive);
  - map workers 2 per cycle, all terminated.
- Chromium after GC:
  - Heap 3.5 → 4.1–4.3 MB. It flattens after ~5 opens (warm-up), then grows
    ~16 KB per open.
  - **JS listeners +1 per open (97 → 108)**, matching +1 MessageChannel per
    open.
  - With exp-player-wall-channel.patch (close the ports on dispose): flat
    at 98 over 8 opens, heap unchanged.

### 2.8 Commands to re-run

All commands run from the worktree after `npm run build` (the soak script
builds unless `--no-build`). Every script writes JSON into the scratch dir
`…/scratchpad/perf/D/`.

**Soak** (~20 min each):

```
node perf/soak.ts --browser firefox --instrument
node perf/soak.ts --browser chromium --trace --memdump --instrument
node perf/soak.ts --browser chromium --snapshots      # composition only
node perf/soak-report.ts <soak-….json>
node --max-old-space-size=8192 perf/heap-diff.ts <cp1.heapsnapshot> <cp4.heapsnapshot>
```

**Q3 knobs:**

```
git apply exp-scrollback-knob.patch && npx vite build --outDir dist-exp && git checkout src/ui/output-pane.ts
node perf/scrollback-gc.ts --browser chromium --sb 20000 --minutes 1.5   # and --sb 5000, --browser firefox
```

**Probes:**

```
node perf/probe-scrollmode.ts --browser chromium [--fix]                   # and firefox
node perf/churn.ts --browser firefox --speed 1 --seconds 120 --no-build
node perf/churn.ts --browser chromium --speed 1 --seconds 300 --trace --no-observe --no-build
node perf/gc-1x.ts --browser chromium --windows 4 --seconds 300 --no-build  # and firefox
node perf/idb-growth.ts --browser chromium --no-build                      # and firefox
node perf/reconnect.ts --browser chromium --no-build                       # and firefox
node perf/player-cycles.ts --browser chromium --no-build [--dist dist-exp-wall]   # and firefox
node perf/probe-content.ts --browser firefox --order 0,1,2,0,1 --no-build
node perf/writeback-bench.ts
```

## 3. Findings

### Code review (Q1): what grows with the session

| Structure / work | Where | Bound | Cost per event | Verdict |
|---|---|---|---|---|
| Output rows (DOM) | ui/output-pane.ts:385-434 | 20 000–20 199 rows, dropped a chunk at a time | O(1) append; chunk drop every 200 rows | Bounded; the memory floor (D1) |
| Output queue | output-pane.ts:283-299, 352-358 | ≤ 2 × scrollback ops; compacted | O(1) amortised | Bounded |
| Comm history | panes/comm.ts:70, 145-148 | 1000 | `splice(0,1)` on a 1000-array; render filters 1000 (comm.ts:281) and JSON-stringifies the filters (274) | Bounded, trivial |
| Comm archive (IndexedDB) | gmcp/comm-archive.ts:70-76 | 7 days, but pruned only when the Comm pane is built (panes/comm.ts:101-108) | One transaction per message | By design; D6 |
| UI lines + sessionStorage ring | panes/ui.ts:153-161, 184-200 | 1000 | The whole ring (≤ 70 KB JSON) rewritten ≤ 4/s | Bounded; 0.2 ms per write |
| Input history | ui/input-pane.ts:136, 299 | **unbounded** | O(1) push | D3 |
| Run events | runs/events.ts:206, 444 | Per run, unbounded (few hundred) | O(1); Statistics rebuilds all every 1 s while open (chrome/frames/statistics.tsx:463) | Fine |
| Recorder buffers | capture/recorder.ts:287-293, 445-474 | Flushed every 2 s | TextEncoder of each chunk (457) | Fine |
| runChunks/runEvents/runs (IndexedDB) | runs/store.ts:60-78 | Retention 14 days (at start page) | Meta record rewritten per chunk (constant size) | Flat to 10,800 (D6) |
| Orphan sealing / previous run | recorder.ts:481, runs/store.ts:111-118 | All runs in DB, read per run start | O(runs) per reconnect, not per event | Fine |
| Map: learned ids, prespam queue, group table | map/tracking.ts:45, map/path.ts:95-133, map/group.ts:73-89 | Map size; cleared on mismatch/death/drop; balanced | O(1) | Fine (worker) |
| Timers trackers | timers/*.ts | Samples capped (affects.ts:31), cast queue idles out (castq.ts:203-205) | Bounded | `stored.pending` grows only with `store` commands that never resolve (stored.ts:110,119) |
| Script engine caches | script/engine/engine.ts:346-350, 502-511; pattern.ts:109-118; expr.ts:279-287 | Cleared at 1000/2000/2000/500 | — | Fine |
| Keep-alive samples, link probe | net/keepalive.ts:140-143, net/link-probe.ts:152-153 | 60 s window, 3 samples | — | Fine |
| XML tag stack | text/assembler.ts:600-606, copied per line 338-348 | **unbounded** if tags never close | O(depth) per line | Theoretical (D8) |
| Pane re-renders | panes/character.ts:149, group.ts:100, timers.ts:430, anchored-list.ts:142 | — | Whole pane DOM rebuilt per render | Garbage (D4) |
| Bench probe flush records | app/bench-hook.ts:52, 78 | **unbounded** | — | Harness only; bench soak must clear it |

No O(n) work per event where n is the session length (inferred and
measured): every per-event loop is over a fixed cap (1000, 20 000 rows, the
visible rows) or over small state.

### D1. The full scrollback is the memory and GC floor (bounded)

- **Evidence:** §2.2 (52–54 k nodes, blink_gc 117–140 MB, 1.1 M heap
  objects, ~4 KB per row); §2.3 (20 k vs 5 k); src/ui/output-pane.ts:40-50,
  385-434.
- **Mechanism:** each row keeps its DOM nodes plus two ComputedStyles,
  LayoutObjects, fragments, shaping results and inline items. A full
  (non-incremental) mark of ~1.1 M objects takes 130–190 ms. Normal GCs are
  incremental and concurrent, with atomic pauses of 1.5–9 ms.
- **Impact:**
  - Memory: reached after ~20 k lines (1–1.5 h) and constant after that.
  - Per-frame cost, 20 k vs 5 k: +5–9 % frame median, +22 % flush script
    in Firefox.
  - Worst GC pauses: Chromium major GC 18 vs 10 ms.
- **Confidence:** high.

### D2. No session-length growth of work or memory beyond D1/D3 (measured)

- **Evidence:** §2.2, §2.6, §2.7: counters flat for 207 k lines after the
  scrollback filled; per-write IndexedDB cost flat; CDP layout, style and
  script per frame flat.
- **Confidence:** high for the counters. For timings, medium: the noise on
  this machine is ±30 %.

### D3. Input history is unbounded

- **Evidence:** ui/input-pane.ts:136, 299. Heap-snapshot diff: +0.28 MB of
  self size in strings and arrays for +22 k entries. The JS heap after GC
  grew +0.75 MB over the soak.
- **Impact (extrapolated):** ~12 k entries per 6-hour session (the owner
  types ~2.6 k commands per hour; consecutive duplicates are dropped),
  ≈ 0.35 MB. There is no time cost; `historyUp` is indexed.
- **Confidence:** high.

### D4. Side panes rebuild their whole DOM on every render: the main garbage source in play

- **Evidence:**
  - Code: panes/character.ts:149, group.ts:100, timers.ts:430 (every
    second while countdowns show), anchored-list.ts:142.
  - Churn (§2.5): ~13 k nodes/min from panes vs 0.84 k from the output.
  - Chromium: DOM node count swings 52 k → 226 k between GCs in the soak.
  - Firefox: 184–217 GC slices per loop.
- **Mechanism:** Char.Vitals (≈ one per prompt), Group.Update, the 1 Hz
  timers tick and each comm/UI message replace the pane's children.
  Allocation pressure drives Oilpan/Gecko GCs and sweeping.
- **Impact:** Chromium runs a major GC every ~20 s at 1×.
  - In steady real-time play all 44 major GCs in 15 minutes took ≤ 4.1 ms
    (§2.5).
  - The 36–55 ms pauses appeared only after churn bursts:
    - Oilpan atomic compaction (33.7 ms of a 41.5 ms GC) right after a
      fast fill;
    - atomic marking (25.5 ms of a 36 ms GC) during the 30× soak.
  - Firefox: slices ≤ 9 ms at 30× and ≤ 16 ms at 1×.
  - Today the steady cost is the per-render DOM work (area E) plus
    background sweeping. The risk is bursts: a big fight means many Vitals
    and much output at once, the same churn pattern that produced the long
    pauses.
- **Extrapolated:** ~4.7 M dead DOM nodes per 6-hour session.
- **Confidence:**
  - Churn numbers: high.
  - Burst-GC link: medium. It is inferred from when the long pauses
    occurred; compaction work also scales with the scrollback's backing
    stores.

### D5. Scroll mode toggles an inherited property on the scroller

- **Evidence:**
  - src/ui/ui.css:84-86. The class is toggled at
    src/ui/output-pane.ts:463, 469, 504.
  - Entered by wheel or PgUp (output-pane.ts:453-474). Left by PgDn to the
    bottom, Esc, Enter (input-pane.ts:286), or scrolling to the bottom.
  - §2.4: 126 / 140 ms in Chromium and 17 / 28 ms in Firefox at 20 k rows;
    one frame with the one-line fix.
- **Mechanism:** `scrollbar-color` is inherited. Changing it on
  `.wc-scroller` changes the computed style of every row, so every one of
  ~27 k elements is restyled. Chromium also relayouts.
- **Impact:**
  - Chromium: a ~120 ms freeze each time the user scrolls back and again on
    return, from ~1 h into a session on.
  - Firefox: +10 ms on return.
  - The Enter that returns to the tail sends first (the recalc happens on
    the next frame). The echo and the reply paint ~120 ms late in
    Chromium.
- **Confidence:** high (measured with and without the fix).

### D6. IndexedDB writers do not slow down (by design; one pruning gap)

- **Evidence:** §2.6.
- **Minor gap:** the comm archive is pruned only when the Comm pane is
  constructed (panes/comm.ts:101-108), so a tab kept open for days never
  prunes. The run library's 14-day sweep likewise runs only when the start
  page first shows (app/shell.ts:275-280).
- **Impact:** none per event.
- **Confidence:** high.

### D7. The log player leaks one MessageChannel per open

- **Evidence:** player/engine.ts:105-119 (`browserWall` creates a
  MessageChannel with `port1.onmessage` and never closes it); dispose at
  engine.ts:298-305. §2.7: +1 JS listener per open; flat with the patch.
- **Impact:** a few KB per RUN LOG / Spotlights / replay open. Negligible
  in practice.
- **Confidence:** high.

### D8. XML-mode tag stack has no depth cap

- **Evidence:** text/assembler.ts:600-606 (push), 338-348 (copied into
  every line), reset on reconnect (139-151).
- **Impact:** zero with MUME's well-formed XML (and none in GMCP mode).
  With a stream of unclosed tags, every line would carry a growing tag
  array.
- **Confidence:** code only, not triggered.

### D9. Measurement caveats

- **Chromium `--trace-gc`:** it prints scavenges but not the unified-heap
  major GCs that free detached DOM. `perf/probe-oilpan.ts` showed DOM nodes
  dropping 173 k → 85 k with no Mark-Compact line, while traces show
  MajorGC events.
- **Heap snapshots:** they switch on object-move tracking. In the soak,
  scavenges became 3× slower (median 1.0 → 3.1–3.6 ms, max 22 ms) and RSS
  stayed ~100 MB higher.
- **This machine:** noisy; the Firefox soak's cp1 vs cp4 probe differences
  are inside the run-to-run spread (probe-content).
- **Headless Chromium with `--enable-gpu`:** it showed rAF gaps of up to
  ~0.6 s with no main-thread task longer than 73 ms. These are not the
  page; count main-thread tasks (trace) as well as rAF gaps.
- **30× soak:** does not reproduce wall-time cadences or allocator ageing
  over hours. That is why the 1× windows and the IndexedDB test exist.

## 4. Proposals (ranked)

| # | Change | Expected gain | Effort | Risk | Owner-visible | Goal / §1.3 budget |
|---|---|---|---|---|---|---|
| P1 | `.wc-rows { scrollbar-color: auto; }` (exp-scrollbar-color-inherit.patch) | −110–125 ms per scroll-back and per return in Chromium, −10 ms in Firefox, at a full scrollback; stops the cost from growing with scrollback | S (1 line + a browser test at 20 k rows) | None expected (rows have no scrollbars); no data change | No | Text speed, input latency; "frame → paint next frame", "no slowdown as it fills" |
| P2 | Pane rendering by patch, not rebuild: keep row elements and update text/attrs; skip the render when the drawn lines are unchanged; the Timers tick updates only countdown cells | Up to ~13 k fewer DOM nodes/min at 1× (≈ 94 % of in-play DOM garbage), so less GC and sweeping work, no repeat of the churn pattern behind the 36–55 ms burst pauses (inferred), and less work per frame | M | Visual regressions in 3 panes; tests churn in panes-* unit tests | No | Long sessions, text speed; frame → paint, burst (shared with area E) |
| P3 | Owner decision on the scrollback depth: keep 20 000 (spec §1.3), or 10 000 and/or a setting | 10 k: ~60 MB less Oilpan, half the nodes, lower worst GC (18 → ~13 ms, interpolated), frame −3–5 % | S (default) / M (setting) | Less history to scroll | **Yes** | Long sessions; memory; "Scrollback 20 000 lines" is a spec budget |
| P4 | Cap input history at 1000 entries (tt++'s default size) | Removes the only unbounded JS structure in the live path (~0.35 MB / 6 h) | S | Owner loses very old history (Cockpit-like) | Maybe (mention) | Long sessions |
| P5 | Close the player wall's MessageChannel in `PlayerEngine.dispose` (exp-player-wall-channel.patch) | No growth per player open | S | None | No | Long sessions |
| P6 | Add a soak scenario and leak checks to bench/ (§5) | Guards all of the above | M | None | No | All |
| P7 | Prune the comm archive on each live `Char.Name` (not only at pane build) | Bounded archive for tabs kept open for days | S | None | No | Long sessions |
| P8 | Cap the XML tag stack (e.g. 32; drop the oldest open tag) | Robustness | S | None with MUME's XML | No | Long sessions |

Not proposed: node recycling or changing the chunk size for the drop. The
drop costs +1–5 ms once per 200 rows. ADR 0009 already measured recycling
as not helping. Also not proposed: `content-visibility` (ADR 0009 found it
slower); area A can re-check it together with the forced layout.

## 5. Benchmark gaps and how bench/ should cover them

- **No soak.** `npm run bench` measures a fresh page.
  - Add `bench/soak.ts` from `perf/soak.ts` + `perf/soak-gen.ts`: the owner's
    biggest logs back to back with synthesized GMCP, khazdul, all panes
    on, typed commands, 30×, both browsers.
  - Pass criteria from cp1 (scrollback full) to the end:
    - heap after GC +≤ 2 MB per 10 h-equivalent;
    - DOM nodes ±10 %;
    - JS listeners, bus handlers, live timers and intervals equal;
    - flush and frame p95 ≤ 1.2 × cp1 + 1 ms;
    - key → send p99 < 1 ms;
    - no rAF gap > 50 ms in play (untraced run).
  - Run it on a quiet machine.
- **GC:** measure with trace windows (MajorGC, `CppGC.*`, MinorGC on
  CrRendererMain) in Chromium and `JS_GC_PROFILE` in Firefox. Do not use
  `--trace-gc`, and keep heap snapshots out of timing runs.
- **The scrollback budget.** The current test injects synthetic lines with
  no GMCP, so the panes are blank. It compares a nearly empty pane with a
  full one, and never scrolls. Add three things:
  - a 2 k vs 20 k comparison with the panes active (real frames);
  - drop and no-drop flushes reported separately;
  - enter/leave scroll mode at 20 k rows (would have caught D5).
- **Leaks:** turn `perf/reconnect.ts` and `perf/player-cycles.ts` into
  e2e checks using `perf/instrument.js` counters, and add a MessagePort
  check to the player dispose unit tests. The existing App.dispose tests
  cover DOM, bus and listener balance but not ports.
- **IndexedDB:** `perf/idb-growth.ts` as an occasional bench (append cost
  at 1 k vs 10 k chunks).
- **Churn:** DOM nodes created per minute at 1×, per pane (from
  `perf/churn.ts`), as a regression number for area E's work.
- **Harness hygiene:** `BenchProbe.flushes` (src/app/bench-hook.ts:52, 78)
  grows without bound. A soak must drain it, as `perf/soak-page.js` does.

## 6. Notes for other areas

- **A (rendering):**
  - Every live flush forces a synchronous layout through
    `scrollTop = scrollHeight` (output-pane.ts:372). That is 1.1–2 ms of the
    flush script at a full scrollback; scrolled flushes cost 0.08–0.24 ms.
    CDP shows ~2.1 layouts per received frame.
  - The 24-bit colour block (45 × 64 truecolour cells) costs 19–34 ms of
    flush script and 25–51 ms per frame in both browsers (inline style per
    span, output-pane.ts:673/677). It does not change with session length.
  - D5 (scroll mode restyle) is also a scrolling bug.
  - Trace, 1× (Chromium): layout p95 4.3 ms per event at full scrollback.
- **B (ingest):** nothing session-dependent found.
  - The recorder's TextEncoder allocation per chunk
    (capture/recorder.ts:457) is negligible.
  - The XML stack cap is D8.
- **C (input):**
  - `InputPane.submit()` calls `output.toTail()` before sending
    (input-pane.ts:286 → output-pane.ts:502). It reads `scrollHeight`, so
    any pending style or layout (a pane render from a timer, for example)
    runs synchronously before `ws.send`. After a scroll-back, the
    Chromium restyle (D5) lands on the frame right after the send.
  - Suggest sending first and deferring `toTail()`.
  - Key → send under 30× load: median 0.14–0.21 ms, p99 0.4–0.7 ms, max
    1.3–13 ms, the same in the first and last loop.
  - Key → send at the real rate with a full scrollback (§2.5) is higher:
    median 0.32–0.41 ms and p99 0.72–1.19 ms, above the 1 ms budget in 3
    of 4 Chromium windows and 1 of 4 Firefox windows. It is flat over 20
    minutes, so it is not session length. Inferred causes: idle-clocked
    cores, plus the forced layout above.
- **E (panes/chrome):**
  - D4: churn per pane and rebuild-per-render.
  - The Timers pane rebuilds every second while countdowns show.
  - AnchoredList forces a layout per render (anchored-list.ts:147).
  - Each backward seek in the player builds a new App, which starts a new
    map worker and re-fetches and parses arda.mm2 (2 workers per open plus
    a seek back).
  - The ESC menu (auto-opened on a server drop) runs its banner interval at
    6 Hz while open. That is expected, and it stops when closed.

## 7. Worktree, patches, harness files

- **Worktree:** `/home/ole/proj/webcockpit/.claude/worktrees/agent-a5dcb1f5695d20f8d`
  - Source is unchanged. `perf/` is untracked.
  - `dist-exp/` = scrollback-knob build; `dist-exp-wall/` =
    player-channel build.
- **Patches** (`…/scratchpad/perf/D/`):
  - `exp-scrollback-knob.patch`: `window.__wcScrollback` / `__wcChunkRows`
    knobs in output-pane.ts. Measurement only.
  - `exp-scrollbar-color-inherit.patch`: P1, one CSS rule.
  - `exp-player-wall-channel.patch`: P5, close the ports on dispose.
- **Harness** (`…/scratchpad/perf/D/harness/`, identical to `perf/` in the
  worktree):
  - Soak: `soak.ts`, `soak-gen.ts`, `soak-page.js`, `soak-report.ts`,
    `memdump.ts`, `trace-summary.ts`, `heap-diff.ts`, `instrument.js`.
  - Q3 and GC: `scrollback-gc.ts`, `churn.ts`, `gc-1x.ts`,
    `gc-breakdown.ts`, `probe-scrollmode.ts`, `probe-content.ts`.
  - Q4 and storage: `idb-growth.ts`, `reconnect.ts`, `player-cycles.ts`,
    `writeback-bench.ts`.
  - One-off probes: `probe-apis.ts`, `probe-ffgc.ts`,
    `probe-aboutmemory.ts` (shows about:memory is unreachable),
    `probe-oilpan.ts`, `probe-oilpan-trace.ts`, `probe-player-map.ts`.
- **Results** (`…/scratchpad/perf/D/`):
  - Soaks: `soak-chromium-2026-09-30-19-11.json` (snapshot run) with
    heap snapshots `chromium-2026-09-30-19-11-cp1-full.heapsnapshot` and
    `…-cp4-loop2.heapsnapshot`; `soak-chromium-2026-09-30-20-06.json`
    (trace + memdump run); `soak-firefox-2026-09-30-19-47.json`.
  - Q3 and GC: `scrollback-gc-*.json`, `churn-*.json`, `gc-1x-*.json`,
    `probe-content-firefox.json`.
  - Q4 and storage: `idb-growth-*.json`, `reconnect-*.json`,
    `player-cycles-*.json`.
  - Plus a log (`*.log`) per run.
