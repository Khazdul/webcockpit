# Area C — Input latency (key → ws.send, and what delays input under load)

Reviewer C, 2026-09-30. Code at 20c4815 (worktree; `main` 5207e7b differs only in docs).
Everything below was measured on the owner's machine while four other reviewers
were running browsers (load average 2.2–7.2, mostly 3–5; logged per run). Absolute
numbers are therefore noisy; A/B comparisons were interleaved in one browser.

## 1. Summary

1. **The key → send code is not the problem.** Enter (plain, alias, pattern alias,
   multi-command alias), F1–F9 and printable-key macros reach `ws.send` in
   0.05–0.40 ms median, p99 < 2 ms, in both browsers, with focus on the input
   line (about 1 ms more in Firefox when focus is elsewhere). The send happens
   synchronously in the first keydown listener, and the bytes leave the browser
   0.1–0.7 ms later even while the page's main thread stays busy. Keys are delayed
   by **what the main thread is doing when they arrive**, not by the handler.
2. **Normal play is fine.** In a busy 90th-percentile play window (GMCP, all side
   panes, recorder writing to IndexedDB, map), keys wait < 1 ms at p95, and key →
   command on the wire is ≤ 5.3 ms at p99 in both browsers. That includes ~1 ms of
   harness overhead. The main thread is 5 % busy and no task is longer than 10 ms.
3. **The owner's repro (`help 24-bit colours`) is a rendering stall that holds keys
   back.** Each page is one 45–80 ms frame at DPR 2. A key that arrives during it
   waits for the rest of the frame: key → wire p95 46 ms, max 69 ms (Chromium) and
   p95 14–32 ms, max 51 ms (Firefox). Enter → echo on screen reaches p95 54–103 ms.
   In Chromium, 84 % of that wait is paint/prepaint/layerize/commit. In Cockpit, tt++
   reads keys in a different process from the one foot paints in, so a slow paint
   never delays a send. In a browser, keys and paint share one thread.
4. **PageUp, Esc and wheel-scrolling back are slow with a full scrollback.** Toggling
   `.wc-scrolled` changes an inherited property (`scrollbar-color`) on the ancestor
   of every row, so all 20 000 rows are restyled. Measured with 20 000 rows:
   123–127 ms frames in Chromium, 24–28 ms in Firefox. A 4-line CSS change
   (experiment patch) brings them to 18–19 ms and 15–19 ms.
5. **The run recorder's 2-second chunk write is one main-thread task, and its cost
   grows with the amount of output.** It costs 6.6 ms per MB in Chromium (56 % of
   that is a `TextEncoder` pass done only to count bytes) and 14 ms per MB in
   Firefox. During live WebSocket bursts it made 30–95 ms tasks, which land right
   when the player reacts.
6. **In Firefox bursts, the longest stalls are cycle-collector slices of up to
   132 ms.** They clean up DOM garbage from dropped scrollback chunks. Firefox also
   applied no WebSocket backpressure: a fast sender gets the whole stream queued as
   tasks, and in a paced real-WebSocket burst the gap between frames reached
   124–165 ms.
7. **Send first in `submit()`.** `toTail()` currently forces a style/layout pass
   before the command is sent: 0.04–0.30 ms median, and unbounded if the page has
   layout work pending. Moving it after the send cuts Enter key → send to
   0.05–0.08 ms median in Chromium and 0.10–0.12 ms in Firefox (measured A/B).
8. **Spreading a heavy page over several frames does not help (tested, not
   recommended).** Chromium's p95 key → next frame went from 43 to 63 ms; Firefox
   was unchanged. A frame's rendering cost follows what is on screen: in Firefox, a
   frame that adds one line costs 13 ms over a colour screen and 3.9 ms over plain
   text. The frame cost has to come down first (area A).
9. **A built-in `#perf` latency monitor is feasible at no measurable cost.** The
   same instrumentation left the burst drain time unchanged (979 vs 971 ms in
   Chromium, 1001 vs 998 ms in Firefox). Event Timing works in both browsers;
   Long Animation Frames only in Chromium.
10. **The bench cannot see any of this.** Its key → send test dispatches a synthetic
    keydown on an idle page, and its burst is a replay, which is never recorded.
    Harnesses for real keys under load and for a loopback WebSocket server are in
    `perf/` and ready to adopt.

## 2. Measurements

### 2.1 Environment and method (all runs)

- Machine: i7-12700H, Linux 7.2.6-1-cachyos. Headless Playwright 1.63 browsers:
  Chromium 153.0.8010.12 with `--enable-gpu --use-angle=vulkan` (RTX 3050 Ti) and
  Firefox 155.0. The owner has Firefox 156.
- Display: DPR 2 (Firefox: `layout.css.devPixelsPerPx=2` plus context
  `deviceScaleFactor: 2`, because each covers a different page type; verified
  `devicePixelRatio === 2`). Viewport 1728×1000.
- Build: production `dist/` served by a harness static server.
  - Main runs used COOP/COEP (cross-origin isolated) for timer resolution:
    Chromium 5 µs, Firefox 20 µs.
  - Without COI (like Pages, the owner's setup) resolution is Chromium 0.1 ms and
    Firefox **1 ms** (checked with `perf/c-probe.ts`). The app behaves the same in
    both: `?bench` is offline, so the link probe is off either way.
- Page setup: `?bench` probe (fake socket, per-flush script and frame times),
  default settings (**the map pane is on by default, also in `?bench`**), the
  bundled `khazdul` profile plus two test macros: `` ` `` (Backquote) → `sc` and
  `Shift+1` → `hit $target`.
- Keys are real Playwright key events at random 40–250 ms gaps: letters (35 %),
  Enter (35 %), F1 macro (15 %), `` ` `` printable-key macro (15 %).
  - **Chromium:** `event.timeStamp` is set when the browser process creates the
    event, so *timeStamp → first listener* is the input delay (IPC plus queueing).
    That matches real input from the browser process onwards.
  - **Firefox:** Playwright (Juggler) creates the event inside the content process
    in a normal-priority task, so `timeStamp ≈ handler`. Delay is therefore
    measured from Node's clock just before `keyboard.down` (offset by min-RTT sync;
    idle floor ~1 ms). Real Firefox input gets input priority
    (`dom.input_event_queue.*`; inferred, not verifiable headless), so Firefox
    numbers under a *backlog of queued tasks* are upper bounds. For those cases I
    also give a Gecko-profile estimate for input-priority keys: Σd²/2T over the
    top-level task durations.
- Attribution:
  - Chromium: DevTools traces (every top-level `ThreadControllerImpl::RunTask`;
    each key's wait sampled every 0.1 ms and classified by the innermost known
    event) and Long Animation Frames.
  - Firefox: Gecko profiler (`MOZ_PROFILER_STARTUP`, 1 ms sampling, markers).
  - Both: own-task attribution against the output flush, rendering and ingest
    timings.
- "Rendered" means a MessageChannel message posted from a rAF callback. It runs
  after that frame's rendering, which is the bench's definition, not presentation
  on screen.
- **Harness caveat.** In the fake-socket runs (idle, help, play in §2.3),
  connecting reloads the stored `default` profile (`src/app/app.ts:458`), which only
  has numpad macros. There, F1 did nothing and `` ` `` typed a character, so key →
  send comes from Enter keys only. The real-WebSocket runs (§2.4) re-apply
  `khazdul` after connecting and include F1 and `` ` `` sends. Input delay does not
  depend on the profile.

### 2.2 Q1 — the synchronous key → send path (in-page dispatch, A/B)

Method:
- In the page: a synthetic keydown is dispatched on the input, like
  `bench-hook.keyToSend`, and the time is taken at the first `net.bytesOut`, which
  is emitted right after `socket.send`.
- 200 samples per case after 20 warm-up rounds. The two builds' pages are
  interleaved round by round.
- A = current code. B = `exp-send-first.patch` (the send before `toTail()`).
- "Dirty" cases set the state in the same task as the dispatch.

Re-run: `npm run build`, build the B variant (§7), then
`node perf/c-keysend.ts --browsers chromium,firefox --n 200 --dist dist --dist-b dist-exp`.
Load average 1.5 → 5.8 during the run.

Key → `socket.send`, median / p99 / max (ms). Measured.

| Case | Chromium A | Chromium B | Firefox A | Firefox B | `toTail()` before the send in A, median (C / F) |
|---|---|---|---|---|---|
| Enter `look`, clean | 0.145 / 0.49 / 0.75 | 0.065 / 0.25 / 0.43 | 0.16 / 0.50 / 1.62 | 0.12 / 1.78 / 3.22 | 0.080 / 0.040 |
| Enter `look`, input just typed | 0.160 / 0.40 / 1.16 | 0.050 / 0.14 / 0.23 | 0.40 / 0.78 / 0.86 | 0.10 / 0.18 / 0.22 | 0.095 / 0.30 |
| Enter `bb` (alias) | 0.080 / 0.20 / 0.24 | 0.060 / 0.22 / 0.27 | 0.34 / 0.94 / 1.34 | 0.12 / 0.60 / 0.94 | 0.015 / 0.22 |
| Enter `b2` (pattern alias) | 0.090 / 0.19 / 0.26 | 0.075 / 0.16 / 0.18 | 0.36 / 0.72 / 1.42 | 0.12 / 0.46 / 0.80 | 0.015 / 0.24 |
| Enter `lordf` (10 sends), first send / last send | 0.075 / 0.15 · last 0.13 | 0.055 / 0.11 · last 0.115 | 0.34 / 0.64 · last 0.44 | 0.12 / 0.24 · last 0.24 | 0.020 / 0.22 |
| F1 `hit $target` | 0.050 / 0.31 / 5.2 | 0.050 / 0.14 / 0.22 | 0.10 / 0.28 / 0.30 | 0.10 / 0.30 / 0.36 | none |
| F2 (`#if` chain → cast) | 0.100 / 0.30 / 0.33 | 0.105 / 0.24 / 5.6 | 0.16 / 1.40 / 1.54 | 0.18 / 1.66 / 3.56 | none |
| F8 `sc` / `` ` `` (printable macro) | 0.050 / 0.12 · 0.050 / 0.13 | 0.050 / 0.13 · 0.050 / 0.18 | 0.08 / 0.18 · 0.10 / 0.76 | 0.10 / 0.18 · 0.10 / 0.52 | none |
| Enter, 50 output rows not laid out | 1.31 / 3.68 / 9.7 | 0.040 / 0.12 / 0.12 | 2.40 / 4.52 / 4.62 | 0.10 / 0.20 / 0.20 | 1.26 / 2.30 |
| Enter, a 24-bit help page not laid out | **10.5 / 38.8 / 51.9** | 0.045 / 0.13 / 0.16 | **17.6 / 30.1 / 39.3** | 0.12 / 0.18 / 0.20 | 10.5 / 17.5 |
| F1, a 24-bit help page not laid out | 0.045 / 0.12 / 0.28 | 0.045 / 0.14 / 0.16 | 0.10 / 0.20 / 0.20 | 0.12 / 0.18 / 0.20 | none (macros read no layout) |
| Enter, focus elsewhere | 0.150 / 0.45 / 7.6 | 0.130 / 0.39 / 1.8 | **1.18** / 3.0 / 3.4 | 1.10 / 2.6 / 2.9 | `input.focus()` costs ~1 ms in Firefox |
| F1, focus elsewhere | 0.140 / 0.37 / 0.46 | 0.140 / 0.36 / 0.41 | **0.96** / 1.9 / 2.0 | 0.96 / 2.4 / 2.5 | same |

Also measured:
- Dispatch → first listener is 0.00–0.04 ms.
- A smoke run (N=30, Chromium, several thousand rows) had a pending `:root` custom
  property change before Enter: `toTail()` took **365 ms median (546 max)** before
  the send (a full-document restyle). Not realistic in play today: root properties
  change only on appearance and font changes (`src/theme/cells.ts:139–149`,
  `src/theme/apply.ts:176`). It shows that the cost in front of the send is
  unbounded.

Which dirty cases can happen in play today (from reading the code):
- The output flush lays out its own rows (`src/ui/output-pane.ts:372`), and side
  panes render in rAF (`src/panes/pane.ts:148–150`). So "rows not laid out" is not
  reached today.
- The realistic dirty state at an Enter is the text just typed into the input.
- The clock strip rewrites its text in a timer once a second
  (`src/ui/clock-strip.ts:91–99`), outside rAF.

### 2.3 Q2/Q3 — real keys under load (fake socket or replay, as the bench)

Command:
`node perf/c-load.ts --browsers chromium,firefox --scenarios idle,help,burst,play --keys 150 --tag q2`

Load average 3.4–6.8.

Scenarios:
- **help**: the three pages of `help 24-bit colours` from
  `Rasta/2026-09-30T00-11-08.log` lines 230–354 (39–52 KB and ~2 400 SGR runs per
  page), one page every 150–450 ms, as when paging with Enter.
- **burst**: `Rasta/2026-09-18T18-11-42.log` (4.7 MB) replayed at speed 0 (the
  bench's ReplaySocket, 8 ms slices), restarted 300 ms after each drain.
- **play**: lines 51551–52456 of the same log. That is the 90th-percentile busiest
  90 s window (906 lines), at speed 1, with 273 GMCP records mixed in (Char.Vitals
  after prompts; Room.Info, Event.Moved, Group.*, Comm.* every 8 lines). It runs
  after a GMCP login through the fake, live-like socket, so the recorder writes
  runs to IndexedDB, and the timers, side panes and map are live.

Chromium, median / p95 / max (ms). Measured. 150 keys each; the second help and
burst run in brackets.

| | idle | help | burst (replay) | play |
|---|---|---|---|---|
| input delay (`timeStamp` → listener) | 0.33 / 0.51 / 0.56 | 0.34 / **34** / 51 (0.46 / 56 / 93) | 6.0 / 14.5 / 27 (5.3 / 16.8 / 29) | 0.29 / 0.52 / 2.7 |
| key → `socket.send` | 0.43 / 0.62 / 1.1 | 0.45 / 28 / 52 | 5.2 / 15.4 / 24 | 0.42 / 0.76 / 1.4 |
| typed letter → rendered | 13.0 / 37¹ / 601¹ | 17.6 / 59 / 60 | **46** / 66 / 66 | 11.0 / 18.9 / 19.3 |
| Enter → echo row rendered | 12.0 / 18.4 / 164¹ | 33.8 / 54 / 80 (42.7 / 91 / 125) | 37 / 49 / 65 | 12.3 / 18.2 / 19.7 |
| keys waiting > 4 ms | 0 of 150 | 20 of 150 (34) | 97 of 150 | 0 |
| output frame (rAF callback → rendered), median / p95 / max | 1.3 / 17 / 17 | 32 / 67 / 83 | 15 / 44 / 76 | 1.8 / 5.7 / 19 |

¹ One 613 ms Long Animation Frame with no script and a 0.8 ms render part occurred
in one idle run. It is unexplained; most likely the environment (a GPU shared with
other reviewers' browsers). The other idle run and every play run are free of it.

Firefox (Node press → …; idle floor ~1 ms), median / p95 / max (ms). Measured.

| | idle | help | burst (replay) | play |
|---|---|---|---|---|
| Node press → first listener | 1.09 / 1.35 / 13 | 1.06 / **29** / 53 | 11.1 / 41 / **145** | 0.96 / 1.68 / 6.1 |
| Node press → `socket.send` | 1.28 / 1.58 / 2.0 | 1.33 / 22 / 54 | 11.9 / 76 / 145 | 1.27 / 2.36 / 6.3 |
| typed letter → rendered | **3.0** / 6.6 / 7.5 | 11.6 / 44 / 61 | 38.6 / 65 / 104 | 3.7 / 7.4 / 7.7 |
| Enter → echo rendered | 9.6 / 18.7 / 19.0 | 24.9 / 57 / 85 | 39.7 / 80 / 112 | 12.7 / 19.7 / 20.7 |
| keys waiting > 4 ms beyond the floor | 1 | 19 | 116 | 1 |

What the waiting keys waited for, from own-task attribution (both browsers):
- **help**: Chromium: the output flush script (the rAF callback, including its
  forced layout) for 12 keys and 446 ms, rendering after the flush for 7 keys and
  102 ms. Firefox: flush 14 keys (401 ms), rendering 5 keys (42 ms).
- **burst**: Chromium: flush 67 keys, ingest slice 13, other 10, rendering 7.
  Firefox: flush 67 keys (739 ms), ingest 28 (500 ms), rendering 7 (428 ms),
  other 14 (309 ms).

Q3 in short:
- A typed letter appears in the next frame; the custom caret's rAF
  (`src/ui/input-pane.ts:682–743`) lands in the same frame as the text.
- Idle: Chromium waits for the next vsync (11–16 ms). Firefox ticks its refresh
  driver soon after input (3–7.5 ms).
- Under load, the typed letter waits for frames: 38–71 ms median during bursts in
  both browsers.
- Enter → echo: the echo row is always in the first frame after the send.

### 2.4 Q2/Q4 — key → command on the wire, with a real WebSocket

Method:
- `perf/ws-server.ts` is a minimal RFC 6455 server in the harness process,
  subprotocol `binary` like ws-play. It timestamps each command it receives.
- The page connects the app's Session through a Socketish built like
  `src/net/ws-transport.ts`, so ingest runs in real WebSocket message tasks, one
  per server message. The recorder is live.
- Node press and server receive are on the same clock, so **key → wire** needs no
  sync.
- Burst: the 4.7 MB log in 16 KB messages. The next burst starts 1 s after the
  page acknowledges an end-of-burst marker.

Commands:
`node perf/c-ws.ts --browsers chromium,firefox --scenarios idle,help,burst,play --keys 100 --tag ws`
Add `--gecko 1` for a Firefox profile.

The runs: ws2 (idle, help, play) and ws3 (paced burst), load average 2.2–4.1.

| Node press → server receive, median / p95 / p99 / max (ms) | Chromium | Firefox |
|---|---|---|
| idle | 2.42 / 3.54 / 6.42 / 6.42 (Enter 2.27, F1 2.53, `` ` `` 2.28 median) | 2.45 / 5.11 / 6.38 / 6.38 |
| play | 2.24 / 3.34 / 4.08 / 4.08 | 1.42 / 3.71 / 5.28 / 5.28 |
| help | 1.94 / **46.1** / 69.3 / 69.3 | 2.54 / **32.2** / 50.9 / 50.9 (another run: 2.19 / 13.8 / 25.6) |
| burst (paced) | 1.95 / 12.8 / 14.2 / 14.2 | 3.60 / 293 / 351 / 351 (Juggler, normal priority: upper bound). Gecko estimate for input-priority keys: mean wait 3.2 ms, longest task 95 ms |
| `socket.send` → server receive | 0.12–0.43 median | 0.27–0.70 median |
| WebSocket message task (16 KB, burst) | 0.97 median, 12 max | 1.04 median, 16.6 max |

Notes on the WebSocket runs (measured):
- **Recorder chunk write in live bursts.**
  - Chromium Long Animation Frames attribute tasks to `TimerHandler:setInterval`
    in the `library` chunk, which is the recorder (`src/capture/recorder.ts:339`).
    The longest was 94 ms, in an unpaced flood run (ws1); 63 ms in ws2 and 30 ms
    when paced (ws3).
  - Firefox's Gecko profile shows a 95 ms timer callback in the paced burst.
- **An unpaced flood (ws1, ws2) shows the backpressure difference.**
  - Chromium held the sender to 17–19 bursts in ~40 s: its socket write buffer
    stayed full.
  - Firefox accepted 48 bursts (default profile) and then **695 bursts (3.3 GB)**
    in ws2. It buffered everything and queued it as tasks. Frame gaps grew to
    16.9 s and output frames p95 to 46 s.
  - That flood is not realistic. It is why the burst was re-run with page
    acknowledgements.
  - Even paced (ws3), Firefox frame gaps reached p95 50 ms and max 124 ms (the
    profiled run: 63 / 165 ms).
- **Key sends with a matching profile.** With `khazdul` actions active, a burst also
  triggers sends from the profile's actions (`WARNING` → `sc`): 1 442–2 108
  commands per paced run.

### 2.5 Attribution — what the main thread was doing while keys waited

Commands:
- Chromium traces: `node perf/c-load.ts --browsers chromium --scenarios help,burst,play --keys 80 --trace 1 --tag trace`,
  then `node perf/c-trace.ts <trace-chromium-<scen>-trace.json> <load-trace-<stamp>.json> <scen>`.
- Firefox profiles: `node perf/c-load.ts --browsers firefox --scenarios help,burst,play --keys 80 --gecko 1 --tag gecko`,
  then `node --max-old-space-size=8000 perf/c-gecko.ts <gecko-….json> <load-….json>`.
- The same `c-gecko.ts` works on `c-ws.ts --gecko 1` output.

Σd²/2T is the expected wait for a key at a random moment that runs as soon as the
current task ends.

| Scenario | Chromium (trace) | Firefox (Gecko profile) |
|---|---|---|
| help | Busy 32 %. Tasks > 50 ms: 23; longest 82 ms; Σd²/2T **6.2 ms**. Key wait: **paint/prepaint/layerize/commit 84 %**, layout (forced in the flush) 9 %, style 4 %. Per heavy frame: Paint 30–56 ms, Layerize 10–15 ms, FireAnimationFrame (the flush) 15–34 ms. | Busy 20–21 %. Longest 44–55 ms (refresh tick); Σd²/2T **2.3–2.6 ms**; eventDelay p95 27–33 ms, max 45–55 ms. Key wait: display-list building 45 %, style 18 %, rAF callbacks (flush) 15 %, reflow 14 %. |
| burst (replay) | Busy 99.6 %. Longest 57 ms; Σd²/2T **9.2 ms**. Key wait: paint 40 %, **layout 25 % (forced in the flush)**, script 16 % (replay slices = ingest), style 12 %, GC 2 %. Longest task: FireAnimationFrame 45 ms, of which **MajorGC 18 ms**. | Busy 97 %. Longest 180 ms (a replay slice containing a **132 ms CCSlice**); Σd²/2T **9.1 ms**; eventDelay p99 101 ms, max 184 ms. Key wait: **reflow 47 %**, rAF flush 14 %, ingest slices 13 %, style 6 %, paint 6 %, CC 4 %, minor GC 3 %. CC slices of 22–132 ms: 9 in 14 s. |
| burst (real WebSocket, paced) | No trace. LoAF: flush ≤ 17 ms, recorder `setInterval` ≤ 30 ms, message tasks ≤ 12 ms. | Busy 54 %. Longest **95 ms (timer callback: recorder chunk)**; CC slice ≤ 28 ms; IndexedDB `success` events ≤ 29 ms; refresh tick ≤ 30 ms; Σd²/2T **3.2 ms**. |
| play | Busy 4.7 %. Longest **3.8 ms**; Σd²/2T 0.03 ms. | Busy 4.5 %. Longest **9.6 ms**; Σd²/2T 0.06 ms; minor GC ≤ 1 ms, IDB ≤ 0.4 ms, `Worker.postMessage` ≤ 0.5 ms. |

The tasks the brief asked about:

| Task | What delays input (all measured) |
|---|---|
| Long output flushes | Their forced layout (`output-pane.ts:372`) is 9 % of key waits in the help scenario and 25 % in the burst (Chromium). In Firefox, reflow is 47 % of burst waits. |
| Rendering of colour-heavy frames | The biggest single cause in the owner's repro. |
| GC | Chromium: MajorGC ≤ 18 ms inside flushes. Firefox: minor GC ≤ 8 ms, many of them. |
| Firefox cycle collector | ≤ 132 ms, the worst stall seen. |
| IndexedDB | The recorder chunk: join plus byte count plus structured clone. |
| Pane renders | Not a factor. They run in rAF and are ≤ 1 ms in play. |
| Map worker messages | Not a factor. `Worker.postMessage` ≤ 0.5 ms. |

### 2.6 Q3 extra — PageUp / PageDown / Esc with a full scrollback (A/B)

Command:
`node perf/c-scroll.ts --browsers chromium,firefox --dist dist --dist-b dist-scroll --rows 0,20000 --reps 15`

Load average ~3.0. A = current. B = `exp-scrollbar-color.patch`.

Key → rendered, median / max (ms). Measured.

| 20 001 rows | Chromium A | Chromium B | Firefox A | Firefox B |
|---|---|---|---|---|
| PageUp (leaves the tail) | **123 / 138** | 19 / 32 | 28 / 40 | 19 / 31 |
| PageUp (already scrolled) | 9 / 19 | 10 / 18 | 6.7 / 16 | 8.5 / 18 |
| PageDown | 14 / 19 | 10 / 18 | 11 / 18 | 14 / 21 |
| Esc (back to the tail) | **127 / 147** | 18 / 27 | 24 / 35 | 15 / 21 |
| (3 rows: every case 8–20 ms in both builds) | | | | |

### 2.7 Q4 — the send itself

Command: `node perf/c-nagle.ts`

- `ws.send` → server receive on loopback: 0.43 ms median (Chromium) and 0.55 ms
  (Firefox).
- Three small messages 2 ms apart were not held back: the 3rd arrived at most
  0.2–0.8 ms later than its send spacing implies.
- **After `ws.send` the page blocked its main thread for 50 ms; the server still had
  the bytes after 0.54 ms (Chromium) and 0.57 ms (Firefox).** Nothing after
  `ws.send` needs the page's main thread. Measured.

### 2.8 Recorder chunk write cost

Command: `node perf/c-recorder.ts`

One task: `join` + `TextEncoder` byte count + the synchronous part of
`RunStore.append` (the IndexedDB put). Median of 5.

| Chunk | Chromium: join / encode / put → task | Firefox: join / encode / put → task |
|---|---|---|
| 0.1 MB | 0.08 / 0.18 / 0.32 → 0.6 ms | 0.32 / 0.24 / 0.70 → 1.2 ms |
| 1 MB | 0.54 / **3.68** / 2.44 → **6.6 ms** | 4.84 / 2.82 / 6.72 → **14.1 ms** |
| 4 MB | 3.35 / 14.4 / 8.78 → **26 ms** | 10.0 / 3.12 / 23.1 → **39 ms** |

The transaction then completes asynchronously (1–28 ms later), not on the main
thread's critical path.

### 2.9 Q5 — monitor overhead

Command: `node perf/c-overhead.ts --reps 6`

Method: the burst drain (the bench replay at speed 0) with and without this
review's instrumentation: keydown/input listeners, the send hook, Event Timing and
LoAF observers, and a rAF gap tick. `khazdul` is applied in both modes. 6 runs
each, alternated.

| | Without | With |
|---|---|---|
| Chromium drain, median | 979 ms | 971 ms |
| Chromium flush script, median | 7.91 ms | 7.99 ms |
| Firefox drain, median | 1001 ms | 998 ms |
| Firefox flush script, median | 8.68 ms | 8.86 ms |

**Within noise.** A first run with the profile applied only in the "with" mode
measured the profile itself: see note B-1 in §6.

## 3. Findings

**C1 — `submit()` forces style/layout before it sends.**

- Evidence:
  - `src/ui/input-pane.ts:286` calls `this.opts.output?.toTail()` before
    `onCommand` / `sendCommand` (`:289`, `:296–297`).
  - `toTail()` reads `scrollHeight` and writes `scrollTop`
    (`src/ui/output-pane.ts:501–507`).
- Mechanism: any pending style or layout work is flushed synchronously in front of
  the send.
- Impact, measured (§2.2):
  - 0.04–0.30 ms median, 0.14–0.64 ms p99 in realistic cases. Firefox pays
    0.22 ms on every alias Enter.
  - 1–18 ms median (p99 up to 39 ms) when output rows were not laid out.
  - 365 ms when a root property changed.
- Today the unbounded cases are unreachable only because the flush lays out itself
  (`output-pane.ts:372`) and panes render in rAF.
- Confidence: high.

**C2 — The handler is otherwise minimal; nothing is async.**

- The Enter path before the send:
  - `onKeyDown`: dead-key and composition checks, `learnKeyLabel` (`keys.ts:389`),
    `isOtherInteractive`, and a refocus if focus is elsewhere
    (`input-pane.ts:390–394`).
  - `runMacro` → `keyNameFromEvent` → `onMacroKey` → `hasMacro`.
  - `handleKey` → `submit`.
  - `script.input` → `execList` → `execText` → `findAlias` → `send`
    (`engine.ts:292–453`).
  - `sendFromScript` (`app.ts:623`) → `Session.sendCommand` → `encodeText` →
    `writeRaw` → `ws.send` (`session.ts:318–342`, `ws-transport.ts:74–77`).
- Macros skip `toTail`.
- After the send: the `cmd.sent` fan-out (output echo queue, recorder string,
  timers trackers, map client → `queueMicrotask` → `Worker.postMessage`), then the
  history and selection updates.
- The only other key listeners that run in play are the input pane's. The chrome
  stack's window-capture listener (`src/chrome/kit/stack.tsx:141–170`) is only
  active while a menu is open, and `src/player/view.ts:276` only in the player.
- One cost stands out: when focus is not on the input, `input.focus()` runs before
  the macro or Enter. That costs ~1 ms in Firefox and 0.05–0.1 ms in Chromium.
- Impact, measured: key → send is 0.05–0.40 ms median in both browsers (§2.2).
- Confidence: high.

**C3 — Heavy colour output holds keys back for up to one frame (the owner's lag).**

- Evidence: §2.3–2.5.
  - Help-page frames last 45–80 ms in Chromium (trace; up to ~120 ms in other
    runs; Paint 30–56 ms plus Layerize 10–15 ms per frame) and 30–55 ms in
    Firefox.
  - Key → wire p95 46 ms, max 69 ms (Chromium); p95 14–32 ms, max 51 ms (Firefox).
  - Enter → echo p95 54–103 ms.
  - 13–28 % of keys waited more than 4 ms.
- Mechanism:
  - Keyboard events are only delivered on the main thread.
  - A rendering update (rAF flush plus style, layout, paint) is one uninterruptible
    task.
  - While the user pages with Enter, the next Enter usually arrives during the
    previous page's frame.
- Confidence: high for the mechanism and Chromium numbers. Medium for Firefox paint
  cost: headless Firefox rasterises differently from the owner's GPU WebRender,
  although display-list building, style and reflow are main-thread work either way.

**C4 — Leaving or returning to the live tail restyles the whole scrollback.**

- Evidence: `src/ui/ui.css:84–86` sets `.wc-scroller.wc-scrolled { scrollbar-color: auto; }`.
  `scrollbar-color` is an inherited property. The class is toggled by
  `updateScrolled` (`output-pane.ts:457–474`) and by `toTail` (`:504`).
- Mechanism: an inherited change on the scroller forces a style recalc of every
  descendant row and span.
- Impact, measured:
  - 20k rows: Chromium 123–127 ms frames for PageUp and Esc, 24–28 ms in Firefox.
  - The same frame follows any wheel scroll-back or Enter while scrolled.
  - It grows with the scrollback, so it is also a long-session issue.
  - The patch gives 18–19 ms (Chromium) and 15–19 ms (Firefox).
- Confidence: high.

**C5 — The recorder's chunk write is one task whose cost grows with the output.**

- Evidence:
  - `src/capture/recorder.ts:339–341` runs a 2 s interval.
  - `writeChunk` (`:445–474`) does `buf.join('')`, then
    `this.encoder.encode(text).byteLength` (`:457`, only to count bytes), then
    `RunStore.append` → `put` of the chunk text (`src/runs/store.ts:60–78`), which
    is a structured clone on the main thread.
- Impact, measured:
  - 6.6 ms/MB (Chromium) and 14 ms/MB (Firefox) (§2.8).
  - In live WebSocket bursts: 30–95 ms tasks.
  - The bench never sees it, because a replay is never recorded.
- Confidence: high.

**C6 — Firefox cycle-collector slices during bursts.**

- Evidence: Gecko markers `CCSlice` (idle: false) of 95–132 ms, 22–43 ms
  repeatedly, and `ForgetSkippable` up to 17 ms (§2.5, replay burst).
- Mechanism (inferred): `trimTop` removes whole 200-row chunks
  (`output-pane.ts:416–434`) with thousands of DOM nodes each. In Firefox, DOM
  nodes are cycle-collected, so a burst that churns through the 20k-row scrollback
  generates DOM garbage faster than incremental CC can retire it in small slices.
  Chromium's Oilpan GC showed ≤ 18 ms major GCs instead.
- Impact, measured: the longest input stall in Firefox, 145–180 ms.
- Confidence: medium-high for the cause (it matches the markers and timing; not
  isolated by an experiment).

**C7 — Firefox applies no WebSocket backpressure.**

- Evidence: §2.4. With the server pacing by its socket buffer, Firefox accepted
  695 bursts (3.3 GB) where Chromium took 17. Paced, Firefox frame gaps still
  reached 124–165 ms.
- Mechanism: incoming messages become queued normal-priority tasks. Timers,
  IndexedDB callbacks, MessageChannel continuations and Playwright's keys all wait
  behind them. Real keys have input priority (inferred), and the refresh driver has
  vsync priority.
- Impact:
  - Measured: Playwright keys up to 293–407 ms at p95.
  - Estimated: real keys mean ~3 ms, but with a tail of whole tasks (≤ 95 ms).
- Confidence: medium. Real input priority could not be exercised headless.

**C8 — A dropped send looks like a sent command.**

- Evidence: `ws-transport.ts:74–77` drops silently when `readyState !== 1`, while
  `Session.writeRaw` returns true whenever it has an open socket
  (`session.ts:318–324`). The command is then echoed, recorded and fed to the
  trackers.
- It happens in the CLOSING window before `onclose`.
- `bufferedAmount` is never looked at, so a stalled link that holds commands in the
  browser is invisible.
- Impact: correctness, not measured.
- Confidence: high (code).

**C9 — Splitting a heavy page over frames does not reduce input delay.**

- Evidence: §2.3. `exp-flush-run-budget.patch` builds at most 800 styled runs per
  frame. Command:
  `node perf/c-ab.ts --a dist --b dist-budget --scenario help --reps 4 --keys 60`.

| Chromium, current → budget | Median | p95 | p99 | Max |
|---|---|---|---|---|
| Input delay | | 11 → 20 ms (worse) | 37 → 24 ms (better) | 42 → 30 ms (better) |
| Key → next frame | | 43 → 63 ms (worse) | | |
| Typed letter → rendered | | 38 → 70 ms (worse) | | |
| Output frames | 22 → 23 ms | 51 → 57 ms | | 67 → 91 ms |

  - The number of frames doubled.
  - Firefox: neutral, within noise.
- `node perf/c-render-probe.ts`: a 1-line frame over a colour screen costs 13 ms in
  Firefox (3.9 ms over plain text). In Chromium, 9.9 vs 9.5 ms.
- Conclusion: per-frame cost is not proportional to the rows added. Not
  recommended until area A lowers the frame cost.
- Confidence: medium-high. Two interleaved A/B runs of 240 keys each.

**C10 — Latency data is available cheaply in both browsers.**

- Event Timing (`event`, `first-input`) is supported by Firefox 155 and Chromium
  153. `long-animation-frame` and `longtask` are Chromium only.
- Production Firefox (not cross-origin isolated) has 1 ms timers.
- The instrumentation overhead is within noise (§2.9).
- Confidence: high.

## 4. Proposals, ranked

**P1. Stop the whole-scrollback restyle on `.wc-scrolled` (C4).**
- Change: `exp-scrollbar-color.patch`, 4 lines of CSS. `.wc-rows` and `.wc-partial`
  get their own `scrollbar-color`, so the inherited change stops at two elements.
- Expected gain, measured at 20k rows:
  - Chromium: PageUp / Esc → rendered 123 / 127 ms → 19 / 18 ms median
    (max 138 / 147 → 32 / 27 ms).
  - Firefox: 28 / 24 → 19 / 15 ms.
- Effort: S. Risk: minimal. Rows never scroll themselves, so their scrollbar colour
  is unused.
- Owner-visible: no.
- Goals: input latency, long sessions.
- Budgets: "Scrollback: no slowdown as it fills" and "no frame > 50 ms".

**P2. Built-in latency monitor, `#perf` (C10, Q5).**

What it records, in in-memory ring buffers:

- Per key:
  - `event.timeStamp`, handler start, and the first `Session` write after it (key →
    send).
  - Enter or macro; never the text.
- Per output frame:
  - Flush script time and the rows and style runs built.
  - "Rendered" via one MessageChannel message per flush (none while idle).
  - The oldest line's receive time (`Line.ts`), giving received → on screen.
- Event Timing (`durationThreshold: 16`) for keydown and pointerdown: input delay
  (`processingStart − startTime`) and presentation.
- LoAF in Chromium: the long frame's scripts (invoker, function, file) and its
  forced style/layout time.
- `ws.bufferedAmount` after each send. A backlog that lasts more than ~100 ms means
  the link is stalled, not the client.
- Context: wall time, scrollback rows, whether scrolled back, connection state.

How it is shown:

- `#perf` prints a short block as client rows (via `pushStyled` like `#help`: not
  recorded, no rules fire), for example:

```
[PERF] last 10 min: 812 keys; key → send median 0.4 ms, p95 3 ms,
       worst 48 ms at 21:03:12 (waited for a 45 ms output frame)
       output frames: 12 over 50 ms, worst 180 ms at 21:02:55
       (44 rows, 2 400 colour runs); received → on screen p95 22 ms
       socket backlog: none
```

- `#perf worst` lists the ten worst moments with their attribution.
- Optional: a `Lag:` readout next to `Link:`.
- Optional: a `PERF` client record in the run capture for each bad moment, so a
  laggy fight can be found again in RUN LOG.

Overhead, measured: none within noise (burst drain 979 vs 971 ms, 1001 vs 998 ms).
Per key: a few timestamps. Per output frame: one message. Memory ~100 KB.

Rest of the assessment:
- Expected gain: diagnosis of the owner's intermittent lag in real sessions, which
  the bench cannot do.
- Effort: M. Risk: low.
- Owner-visible: yes. The owner decides on the command, the wording, the readout,
  and whether runs record `PERF`.
- Goals: all three.

**P3. Take the recorder's chunk write off the critical path (C5).**
- Change:
  - Count bytes as lines are captured and drop the `TextEncoder` pass
    (`recorder.ts:457`).
  - Write by size as well as by time (for example at ≥ 256 KB, or split a large
    buffer into ≤ 256 KB appends in separate tasks or in `requestIdleCallback` with
    a timeout).
  - Optionally, move the IndexedDB write to a worker.
- Expected gain, estimated from §2.8:
  - The encode pass is −56 % of the task in Chromium.
  - ≤ 256 KB pieces cost ≤ ~1.7 ms (Chromium) or ~3.5 ms (Firefox) per task,
    against the 30–95 ms tasks seen in live bursts.
- Effort: S for the byte count and size trigger; M for a worker.
- Risk: more, smaller chunks per run; the stored format is unchanged. Recorder
  tests would need updating.
- Owner-visible: no.
- Goals: input latency during bursts, long sessions.
- Budget: "Burst: UI stays responsive; no frame > 50 ms".

**P4. Send first (C1, C2).**
- Change:
  - `exp-send-first.patch`: call `toTail()` after `sendCommand` / `onCommand`, in
    the password branch too.
  - Better: only when `output.isScrolled()`, because when not scrolled the next
    flush already keeps the tail. That removes the forced layout altogether.
  - Optionally, look up the macro before the refocus in `onKeyDown`
    (`input-pane.ts:390–399`), so a macro sends before `focus()`.
- Expected gain, measured A/B:
  - Chromium Enter key → send: 0.145 → 0.065 ms median (clean) and 0.16 → 0.05 ms
    (just typed); p99 0.49 → 0.25 ms.
  - Firefox: 0.34–0.40 → 0.10–0.12 ms median (just typed and aliases); p99
    0.78 → 0.18 ms.
  - It also makes the send independent of any future layout work that is not done
    in rAF (365 ms observed with a pending root style).
  - Refocus reorder: about −1 ms per key in Firefox when focus is elsewhere
    (estimated from the "focus elsewhere" cases).
- Effort: S. Risk: minimal. Behaviour is the same, since the scroll lands in the
  same frame either way.
- Owner-visible: no.
- Goal: input latency.
- Budget: "Key press → ws.send < 1 ms" (already met; this adds margin).

**P5. Reduce DOM garbage churn in Firefox bursts (C6).**
- Change: recycle row elements instead of dropping whole chunks. Spec §1.3 says
  "old lines are recycled once scrollback is full"; the code drops chunks
  (`output-pane.ts:416–434`). Alternatives: drop old chunks in idle time
  (`requestIdleCallback`), or release them gradually.
- Expected gain, estimated: removes the 22–132 ms CC slices, which are the longest
  input stalls in Firefox bursts.
- Effort: M. Risk: medium. Recycling must not leak styles or classes between rows,
  and scroll compensation must be kept.
- Owner-visible: no.
- Goals: input latency, long sessions, text speed.
- Budget: burst "no frame > 50 ms". Owned by areas A and D. Verify with Gecko
  `CCSlice` counts.

**P6. Make colour-heavy frames cheaper (C3, C9).** Owned by area A.
- From the input side: do not spread pages over frames (C9). The cost to remove is
  Paint + Layerize (Chromium) and display lists + reflow (Firefox) per frame.
- The only design that fully decouples keys from painting is the ADR 0004 fallback:
  a canvas (OffscreenCanvas in a worker) output renderer. The main thread would
  then only handle input and chrome.
- Expected gain: a key's worst wait during the repro falls with the frame length.
  Today it is 51–93 ms (Chromium) and 41–58 ms (Firefox).
- Effort: M for paint-cost work; L for canvas.
- Risk: canvas loses native selection, copy and accessibility.
- Owner-visible: yes, for canvas.
- Goals: text speed, input latency.
- Budgets: "Frame → paint", burst.

**P7. Report sends that did not happen (C8).**
- Change:
  - `Socketish.send` returns false when the socket is not OPEN.
  - `Session.writeRaw` passes it on, so no echo, capture or tracker sees a dropped
    command. Show one `[SYSTEM] not sent` line.
  - Feed `bufferedAmount` to P2.
- Expected gain: correctness in the last moments of a connection. Not measured.
- Effort: S. Risk: low.
- Owner-visible: yes (a new line).
- Goal: input correctness.

**P8. Bounded ingest slices for WebSocket data in Firefox (C7).**
- Change: `onmessage` only queues the bytes. The app processes ≤ ~4–8 ms per task
  (the replay socket's pattern) and yields to rendering between slices.
- Expected gain, estimated: Firefox keeps rendering and its own continuations
  flowing during a large burst, with frame gaps closer to one slice plus one frame.
  Needs measuring with a realistic 1 MB burst first.
- Effort: M. Risk: throughput; the bench burst drain should not regress.
- Owner-visible: no.
- Goals: text speed, input latency (Firefox).
- Budget: burst.

**Not recommended: the per-frame run budget** (`exp-flush-run-budget.patch`, C9).

## 5. Benchmark gaps in area C and how bench/ should cover them

**No input delay.** `keyToSend` and `macroToSend` in `src/app/bench-hook.ts:167–199`
dispatch a synthetic keydown on an idle page, so the bench can never see a key
waiting.
- Add real key events:
  - Chromium: Playwright's keyboard (CDP). `event.timeStamp` → handler is the input
    delay.
  - Firefox: Node-clock press times plus the Gecko profiler.
- Run them under three loads: help pages, burst, play with GMCP.
- Report the input delay p95 and max, key → send, typed letter → rendered, and
  Enter → echo rendered.
- `perf/c-common.ts` (`install`, `pressKeys`, `analyse`) and `perf/c-load.ts`
  already do this, and could move into bench/.
- A budget line could read "input delay p95 < 16 ms, max < 50 ms, under the burst
  and the colour page".

**Firefox needs the input-priority view.** Playwright's Firefox keys are
normal-priority tasks inside the content process.
- Add a Gecko-profile pass (`MOZ_PROFILER_STARTUP`, `perf/c-gecko.ts`).
- Report Σd²/2T over top-level tasks and the longest task by kind, including
  `CCSlice`.

**A real WebSocket path.** The bench's burst is a replay (8 ms slices, never
recorded), so it misses:
- the recorder chunk task (C5);
- per-message ingest tasks;
- Firefox's missing backpressure (C7).

Add a loopback WebSocket server (`perf/ws-server.ts`, pacing by page
acknowledgement) and measure key → wire with Node's clock (`perf/c-ws.ts`).

**Scroll-state toggles.** Add PageUp and Esc with a full 20 000-row scrollback to
the scrollback budget (`perf/c-scroll.ts`).

**A colour-heavy fixture.** The `help 24-bit colours` pages
(`Rasta/2026-09-30T00-11-08.log` lines 230–354) should be a standard frame → paint
and input case, next to the burst.

**The bench's "map off" is probably map on.** `panes.map.on` defaults to true
(`src/settings/types.ts:206`), and in these runs the map drew in `?bench` without
`mapOn()`. The bench's "off" columns are therefore likely map-on without the GMCP
feed. Check this.

## 6. Notes for other areas (not investigated deeply)

**A (rendering):**
- Heavy frames at DPR 2 in Chromium are Paint 30–56 ms plus Layerize 10–15 ms.
- In Firefox, per-frame display-list cost follows the visible content: 13 ms vs
  3.9 ms for a 1-line frame.
- The flush's forced layout (`output-pane.ts:372`) is 25 % of Chromium burst key
  waits. It moves work rather than adding it.
- A `:root` custom-property change with ~10k rows cost a 365 ms restyle in Chromium
  (`cells.ts:139–149` writes 4 root properties on every font or appearance update).
- See C4 (`scrollbar-color`) and C9 (the run budget does not help).

**B (ingest):**
- B-1: the `khazdul` profile adds ~22 % to the burst drain (800 → 979 ms in
  Chromium, 822 → 1001 ms in Firefox), about 2 µs per line.
- WebSocket message tasks are ~1 ms per 16 KB (max 12–17 ms).
- The replay socket's 8 ms slices account for 13–16 % of burst key waits.

**D (long sessions):**
- The CC slices from dropped chunks (C6).
- Recorder task size grows with output volume (C5).
- The `scrollbar-color` restyle cost grows with the scrollback (C4).
- Input history is unbounded (`input-pane.ts:299`) but small.

**E (panes and chrome):**
- In play, pane renders and map messages never exceeded 1 ms per task.
- A mouse resting over the output causes Chromium boundary events and hit tests on
  every output frame: 16–37 ms in total per scenario, minor.

**Bench/harness:** the fake-socket connect reloads the stored profile
(`app.ts:458`). Apply test profiles after connecting.

## 7. Worktree, patches, harness files

Worktree: `/home/ole/proj/webcockpit/.claude/worktrees/agent-a012030f62b91bef8`
(HEAD 20c4815, clean except for the untracked `perf/` and `dist-*/`).

**Patches** (in `/tmp/claude-1000/-home-ole-proj-webcockpit/839d0ad2-3f20-4e68-a808-1e236720a92c/scratchpad/perf/C/`):

| Patch | What it does | Build |
|---|---|---|
| `exp-send-first.patch` | `src/ui/input-pane.ts`: send before `toTail()` (P4) | `dist-exp` |
| `exp-scrollbar-color.patch` | `src/ui/ui.css`: stop inherited `scrollbar-color` at `.wc-rows` / `.wc-partial` (P1) | `dist-scroll` |
| `exp-flush-run-budget.patch` | `src/ui/output-pane.ts`: ≤ 800 styled runs per frame. **Not recommended** (C9) | `dist-budget` |

Build a variant from the worktree root:
`git apply <patch> && npx vite build --outDir dist-<name> --emptyOutDir && git checkout -- src`

**Harness files** (in `perf/` of the worktree, copies in `…/scratchpad/perf/C/harness/`).
Run from the worktree root after `npm run build`. Ports are 4221–4229 only; some
early runs used 4230–4246 before I moved them.

| File | Purpose |
|---|---|
| `lib.ts` | Static server (optional COI), launch at DPR 2, open `?bench`, stats |
| `c-probe.ts` | API support, timer resolution, `event.timeStamp` semantics per browser |
| `c-keysend.ts` | Q1: in-page key → send with dirty states, A/B |
| `c-feeds.ts` | Help pages, burst, play window with GMCP, login frames (uses `src/net/replay-socket.ts`) |
| `c-common.ts` | In-page instrumentation, load drivers, key driver, analysis, Chromium trace attribution |
| `c-load.ts` | Q2/Q3 under load (fake socket and replay); `--trace 1` (Chromium), `--gecko 1` (Firefox) |
| `c-trace.ts` | Offline Chromium trace attribution |
| `c-gecko.ts` | Offline Gecko-profile attribution and Σd²/2T |
| `ws-server.ts`, `c-ws.ts` | Real-WebSocket key → wire |
| `c-scroll.ts` | PageUp/Esc A/B |
| `c-ab.ts` | Interleaved A/B of two builds under a load |
| `c-recorder.ts` | Recorder chunk cost |
| `c-nagle.ts` | `ws.send` timing and blocking |
| `c-overhead.ts` | Monitor overhead |
| `c-render-probe.ts` | Per-frame cost, colour vs plain screen |
| `c-gecko-try.ts` | Gecko profiler smoke test |

**Result files** (same scratchpad folder):
- Logs: `keysend-run1.log`, `load-q2a.log`, `load-q2.log`, `load-trace.log`,
  `load-gecko.log`, `ws1.log`–`ws4.log`, `scroll-ab.log`, `ab-budget-help.log`,
  `nagle.log`, `overhead2.log`, `render-probe.log`.
- Raw JSON: `load-*.json`, `ws-*.json`.
- Chromium traces: `trace-chromium-{help,burst,play}-trace.json`.
- Gecko profiles: `gecko-gecko-1790798723374.json`,
  `gecko-ws-ws4gecko-1790801625649.json`.
