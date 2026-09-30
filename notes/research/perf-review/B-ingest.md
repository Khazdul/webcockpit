# Area B — Ingest CPU path (WebSocket → telnet → assembler → bus → engine + system rules → recorder → output enqueue)

Reviewer B, 2026-09-30. Code at commit 20c4815 (worktree below). Line numbers below are for that commit.
Separates **measured** from **inferred**. All timings are from a laptop shared with four other reviewers.
Load (1-min average) was 0.8–7 during the runs and is listed with each measurement. Absolute numbers moved up to
1.7× with load. **Ratios come from interleaved A/B rounds and are the numbers to trust.**

## 1. Summary

1. **Ingest does not cause the owner's `help 24-bit colours` stall.** Per help page (45 rows with ~50–96 SGR runs each), ingest takes
   0.7 ms (Chromium) / 1.1 ms (Firefox) warm, and ~2.5–4 ms JIT-cold. Rendering that page takes 12.5 / 18.4 ms of output-flush
   script warm (the cold single pass of all 3 pages: 45–64 ms), plus layout and paint. Ingest is ~5% (warm) to ~10–20% (cold)
   of the main-thread JavaScript in that burst. → Area A.
2. **Ingest does cause GC pauses on SGR-heavy text (B1).** Each 24-bit colour line allocates ~22 KB. The recorder also keeps
   each line's `raw` for up to 2 s, as a rope of ~150–200 string pieces. Measured: GC is 36% of Firefox's ingest time on the
   repro. Single `onData` calls (one WebSocket message) took 49.7 ms (Chromium) and 69.4 ms (Firefox) on the repro, and 148 ms
   (Firefox) on a GMCP-heavy log, at load 4–7. That breaks the "no frame > 50 ms" budget.
3. **Prototype P1 fixes B1 and is small and safe.** In the assembler, `raw` is appended lazily as one slice per stretch, and
   the SGR parameter array keeps its capacity. Measured in the browser, P1 alone:
   - repro ingest −40% (Chromium) / −50% (Firefox);
   - the longest `onData` 49.7 → 8.3 ms / 69.4 → 5.0 ms;
   - GC inside Firefox ingest −88% (profile).

   With all four prototypes, allocation drops from 22.1 to 9.2 KB per line (Node). P1 needs no test changes, and the chunking
   fuzz test on a real log passes.
4. **For normal text, the script engine is the largest ingest cost (B2).** It checks khazdul's 24 substitute/highlight
   literals (one `indexOf` each) and 17 actions one by one on every line. That is 54% of ingest in Chromium and 43% in
   Firefox. Prototype P3 tests one combined RegExp of the rules' required literals per line first. Measured: normal-text
   ingest −26% (Chromium) and −10% (Firefox) over P1+P2. With 500 rules, the engine-only bench goes 16.9 → 8.4 µs/line.
5. **Telnet reads the data state byte by byte through a `switch` (B3).** Prototype P2 uses a native `indexOf` scan for
   IAC/NUL: repro ingest −22% (Chromium) and −21% (Firefox) on top of P1. No measurable change on normal text.
6. **Absolute cost of the real pipeline** (playing, recording, khazdul, all system rules, all panes, map loaded), load ~3–5:
   - normal text: 2.1 µs/line (Chromium), 3.2 µs/line (Firefox);
   - the SGR-heavy repro: 15 / 24 µs/line;
   - one GMCP message: ~10 µs (≈ 3–5 lines);
   - one WebSocket message: p99 45–100 µs on normal text.

   Against the spec budget (500 rules < 200 µs/line on average): normal text uses ~1–3%, 500 rules ~8%, and SGR-heavy lines
   8–25%. The bench's engine-only rule number does not include the assembler, the recorder or GC, which are the dominant
   costs on colourful text.
7. **Scheduling adds no hops.** From `ws.onmessage` to the output queue everything is synchronous in one task. The flush comes
   in the next `requestAnimationFrame`, with no promises, timers or message channels in between. Messages that arrive during a
   long frame queue as tasks and are coalesced into one flush. Their latency is set by the long frame, not by ingest.
8. **Partials (B4).** Every MUME prompt first becomes a `text.partial`, and the GA in the same frame replaces it: 17,121 of
   93,883 lines on the big log. None of them is still pending when the output flushes, so the DOM cost is only a clear, about
   0.3 ms per burst. Prototype P4 (emit the partial once per inbound frame) removes them all. Its ingest gain is small and
   noisy (0 to −15%), and it changes 6 unit tests.
9. **GMCP (B5): ~10 µs per message (up to ~30 µs under load).** The main parts are:
   - a new `TextDecoder` for every message;
   - `JSON.parse`;
   - 9 subscribers that each lower-case the package name;
   - a second `GroupModel` inside run events;
   - synchronous `localStorage` / IndexedDB writes in some handlers.

   This is not a lag source at play rates. Cheap fixes are listed under P5.
10. **MCCP2 (refused):** it does not matter for latency on the owner's link. A `DecompressionStream` would add an async hop
    per message, so keep refusing unless slow-link users need it.

## 2. Measurements

### Environment
- Machine: i7-12700H (6P+8E), 31 GB, CachyOS, Linux 7.2.6.
- Node: v26.8.2 (V8).
- Browsers, headless through Playwright 1.63:
  - Chromium 153.0.8010.12 (headless shell), `deviceScaleFactor: 2`;
  - Firefox 155.0 (Juggler build; the owner has 156.0.1), `layout.css.devPixelsPerPx=2`;
  - both with a 1728×1050 viewport, DPR 2 confirmed in the page.
- Build: production bundle (`vite build`, minified), served by `vite preview`. The page is therefore cross-origin isolated:
  timer resolution 5 µs in Chromium, 20 µs in Firefox. Production (Pages) is not isolated; this does not affect CPU cost.
- Page state, as the owner plays:
  - `?bench` with the fake socket, IAC WILL GMCP, then `Char.Name` → `playing`; the recorder shows `capture: recording`;
  - `Char.Vitals` (run started);
  - the bundled `khazdul` profile applied;
  - default settings (all panes on, the map pane loaded and forwarding: 3 `text.line` handlers).
- Fixtures:
  - `big`: `Rasta/2026-09-18T18-11-42.log`, 93,883 lines, 2.89 MB on the wire, 19,791 frames (replay speed-1 grouping).
  - `repro`: `Rasta/2026-09-30T00-11-08.log` lines 226–364 (`help 24-bit colours`, 3 pages): 136 lines, 123 KB, 16 frames,
    ~52 style runs per line on average and ~96 on full rows. Repeated ×40 for timing; `repro1` is one pass.
  - `big-gmcp`: `big` with a GMCP record after every 10 lines, looping over the 118 records of `tests/fixtures/map-demo.log`
    and `gmcp-demo.log` (10,794 messages).
  - `big-xml` (Node only): `big` turned into MUME XML-mode output (perf/xml-mode.ts).
- **Ingest** = time spent inside the socket's `onData` for every frame, i.e. exactly what a WebSocket `message` event runs.
  Frames are delivered in slices of ≤ 8 ms, yielding to the next animation frame between slices (as the replay does at max
  speed), so output flushes, timers and the recorder's 2 s chunk writes run in between but are not counted.
- The rendering flush is reported for context only (area A).

### M1. Stage breakdown, Node (V8), committed code

Load 0.8–1.1, 7 rounds after 2 warm-up rounds, cumulative configurations run interleaved on a fresh pipeline each run.
The pipeline is `perf/pipeline.ts`, wired like `App`. µs per line, medians.

| Stage added | big (normal text) | repro (SGR-heavy) |
|---|---|---|
| telnet + UTF-8 decode | 0.136 | 1.770 |
| + assembler | +0.149 | **+7.908** |
| + engine (no rules) | +0.100 | −0.10 (noise) |
| + output enqueue | +0.042 | +0.39 |
| + system rules (game state, timers trackers, run events) | +0.348 | +0.17 |
| + khazdul profile | **+0.890** | +0.94 |
| + recorder capturing | +0.194 (GC 1.3 → 5.0 ms/run) | **+2.97 (GC 1.5 → 16.2 ms/run, max pause 0.8 → 5.9 ms)** |
| + status, UI messages, App's gmcp handler | +0.015 | +0.85 (GC noise) |
| + map forwarder (`MOVE_FAILURE_RE`) | +0.087 | +0.84 |
| **total** | **1.96 µs/line = 65 µs/KB** | **15.7 µs/line = 17.7 µs/KB** |
| per frame p50 / p95 / max | 6.8 / 22.5 µs / 3.6 ms | 73 / 281 µs / 8.6 ms |

Other runs:
- GMCP: +52 ms per 10,794 messages → **4.9 µs per message** in Node (no panes).
- Frames cut at 1460 bytes (mid-line splits): +3–5 µs per extra split on SGR-heavy lines (the partial snapshot copies ~50 runs).

Re-run: `perf/run-node.sh node-ingest --rounds 7 --warm 2`. Default variant: base.
Output: `node-ingest-run1.txt`, `node-ingest.json`.

### M2. Real app in the browser, committed build (`dist-base`)

Primary run `browser-ingest-4b` at load 3–5, 5 rounds after 1 warm-up, 4 builds interleaved. Medians. Frame = one WebSocket message.

| | Chromium | Firefox |
|---|---|---|
| big: µs/line; per message p99; max | 2.10; 45 µs; 5.9 ms | 3.16; 60 µs; 10.4 ms |
| repro: µs/line; per message p99; max | 15.1; 0.56 ms; 6.4 ms | 23.7; 2.82 ms; 9.0 ms |
| big-gmcp: µs/line → µs per GMCP message | 3.20 → **9.6** | 4.42 → **11.0** |
| repro flush script (render, area A), per line | 277 µs | 408 µs |

Earlier run `browser-ingest-ab1`, load 3–7, same method:
- big: 3.73 µs/line (Chromium) / 5.43 (Firefox).
- repro: 34.9 / 50.3 µs/line. The longest single `onData` was **49.7 ms / 69.4 ms**; Firefox p99 was 5.5 ms.
- big-gmcp: 31 / 29 µs per GMCP message. Firefox's longest single `onData` was **147.9 ms**.

Cold single pass: `repro1`, 136 lines, a fresh browser per repetition, 5 repetitions, load ~4–5 (`cold-repro.txt`).

| | Chromium | Firefox |
|---|---|---|
| ingest, base (median, range) | **11.4 ms** (10.7–13.6) | **7.5 ms** (6.6–9.4) |
| per line | 84 µs | 55 µs |
| flush script, whole help | 44–55 ms | 54–64 ms |
| longest single flush | 25–40 ms | 52–64 ms |
| ingest with all prototypes (p1234) | 7.9 ms (6.7–11.5), 0.62–0.91× | 6.8 ms (6.5–7.9), 0.74–1.0× |

Re-run:
- `node perf/browser-ingest.ts --builds dist-base,dist-exp3,dist-exp4,dist-exp5 --rounds 5 --warm 1 --scenarios big,repro,big-gmcp`
- `perf/run-cold.sh 5 dist-base,dist-exp5`

### M3. Where ingest time goes: CPU profiles of the committed code

The profiled build is unminified with source maps (`dist-prof-base`). Only samples whose stack holds the socket's `onData` are
counted. Each sample is attributed to the first `src/` frame from the leaf, so natives count for their caller.
- Chromium: CDP sampler at 100 µs.
- Firefox: Gecko profiler (`MOZ_PROFILER_STARTUP`, 0.1 ms, features `js`). The profiler inflates Firefox's times ~1.8×;
  the shares are what matter.

Normal text (`big`):

| Chromium (ingest share) | Firefox (ingest share) |
|---|---|
| **engine 54%**: `displayCopy` 26%, actions (`entry`→`matchPattern`) 15.5%, `text.line` handler (`processLine`) 12% | **engine 43%**: `displayCopy` 17.5%, `matchPattern` 11%, `matchRule` 4% |
| telnet + session 12.7% (TextDecoder 6.6%) | GC 11.8% |
| assembler 10% | assembler 8.8% |
| timers trackers 5.3%, bus 4.2%, map regex 3.1%, recorder 2.7%, `nowUs` 3% | telnet 8.6%, timers 6.9%, bus 4.6%, map regex 3.7%, recorder 3.5% |

SGR-heavy (`repro`):

| Chromium (ingest share) | Firefox (ingest share) |
|---|---|
| **assembler 76%**: `process` 28%, `applySgr` 21%, `parseEsc` 18%, `text` 9% | **GC 35.6%**; **assembler 37.6%**: `applySgr` 15%, `parseEsc` 9%, `add` 7%, `process` 6% |
| telnet `receive` 13% | telnet 11.7% (`receive` 8%) |
| engine 6.5% | engine ~9% (`matchPattern` 4.6%: flattening the text rope) |
| whole round: GC 41 ms, flush 2809 ms vs ingest 168 ms | whole round: flush 7300 ms vs ingest 519 ms (profiled) |

Firefox repro with P1 (`dist-prof-exp`): GC 33.9 → 4.0 µs/line and assembler 35.9 → 28.9 µs/line
(`prof-firefox-repro-exp.txt`).

GMCP-heavy (`big-gmcp` minus `big`), per GMCP message:
- Chromium: JSON parse ~3.5 µs, `new TextDecoder` + decode ~2.3 µs, game state ~3.8 µs, recorder ~1.3 µs, panes ~1.3 µs
  (comm ~0.7 µs), bus ~0.6 µs, map ~0.5 µs.
- Firefox (profiled): TextDecoder ~5.8 µs, JSON parse ~8.6 µs, pane `requestAnimationFrame` calls ~3.4 µs.

Node, same method, committed code, share of full-pipeline self time:
- `big`: `displayCopy` 28.6% (0.675 µs/line), `matchPattern` 11.6%, `processLine` 7%, assembler 10.5%, telnet 7.7%,
  bus 5.3%, GC 3.5%.
- `repro`: assembler 47% (`applySgr` 18%, `parseEsc` 11%), **GC 24.5%**, telnet 10.7%.

Re-run:
- `perf/run-profiles.sh dist-prof-base "big big-gmcp repro" "chromium firefox"`
- `perf/run-node.sh node-profile --scenario big|repro|big-gmcp --passes 3`
- Output: `prof-*.txt`, `*.cpuprofile`, `node-profile-*.txt`. The Gecko JSON of the repro can be opened in
  profiler.firefox.com.

### M4. Allocation and GC

Allocation, sampled heap profiler including collected objects, Node, 2 passes (`node-alloc.txt`):

| bytes per line | base | all prototypes (p1234) |
|---|---|---|
| repro | **22,132** (assembler 91%: `process` 12.2 KB, `applySgr` 7.9 KB) | **9,158** |
| big | 1,321 (engine 37%, assembler 28%, recorder 11%, telnet 9%, output 6.5%) | 1,183 |
| big-gmcp | 1,700 (→ **3.3 KB per GMCP message**) | 1,559 |
| GC time per 2 repro passes | 76.5 ms | 8.0 ms |

Chromium trace of one repro round (5,440 lines, flushes included; `browser-gc-repro.txt`, 3 rounds, load ~4):

| | Minor GC per round | Major GC | Longest `onData` (ingest) |
|---|---|---|---|
| base | 3–4, 17.8–26.5 ms total, longest 6.8–9.2 ms | 2 in one round, 18.2 ms, longest 9.9 ms | 7.2–9.8 ms |
| p1234 | 2–4, 7.3–11.9 ms, longest 3.3–7.0 ms | none | 0.25–3.3 ms |

Recorder chunk write on the main thread (Node, `node-chunk.txt`), which runs every 2 s:
- 1 M chars of SGR-heavy records: `join` 2.1–3.1 ms (base ropes) vs 0.5–0.9 ms (P1).
- 4.4 M chars of plain text: `join` 6.8–9.4 ms, plus `TextEncoder.encode` 0.7–0.9 ms (only to count bytes).

Re-run:
- `perf/run-node.sh node-profile --scenario repro --passes 2 --variant base|p1234`
- `node perf/browser-gc.ts --builds dist-base,dist-exp5 --scenario repro --rounds 3`
- `perf/run-node.sh node-chunk --mb 1`

### M5. Prototype A/B (interleaved, same process or same browser)

Builds:
- `dist-exp` = P1
- `dist-exp3` = P1 + P2
- `dist-exp4` = P1–P3
- `dist-exp5` = P1–P4

Node variants are named the same way: `p1`, `p12`, `p123`, `p1234`. Values are median ratios of ingest time (range in brackets).

| Change | Chromium | Firefox | Node |
|---|---|---|---|
| **P1 vs base, repro** | **0.60** (0.42–0.80); longest `onData` 49.7 → 8.3 ms | **0.50** (0.41–0.59); 69.4 → 5.0 ms | 0.61 (0.51–0.77); GC 22.9 → 2.9 ms/run |
| P1 vs base, big | 0.95 (0.83–1.13) | 0.97 (0.87–1.18) | 0.92 |
| P1 vs base, big-gmcp | 0.89 | 0.84; longest `onData` 147.9 → 11.5 ms | — |
| **P2 vs P1, repro** | **0.78** (0.72–0.93) | **0.79** (0.66–1.04) | 0.92–0.94 |
| P2 vs P1, big | 1.03 (0.90–1.20) | 0.86 (0.66–1.24) | ~1.0 |
| **P3 vs P1+P2, big** | **0.73** (4b run: 184.8 → 135.3 ms) | 0.90 (322.3 → 289.6 ms) | 0.68–0.77 |
| P3, 500 rules + khazdul, big | — | — | **0.49** (full pipeline 16.7 → 8.2 µs/line) |
| P3, engine only (`bench/script-bench.ts`, 500 rules) | — | — | 16.88 → 8.40 µs/line |
| P4 vs P1–P3, big | 1.08 (noise) | 0.85 | 0.89 (noisy) |
| **P1–P4 vs base**: big / repro / big-gmcp | 0.77 / 0.62 / 0.85 | 0.85 / 0.55 / 0.78 | 0.67 / 0.55 / — |
| P1–P4, repro per-message p99 | 0.56 → 0.18 ms | 2.82 → 0.40 ms | — |

P4: `text.partial` events per big pass 17,121 → 0; `renderPartial` calls 38 clears (0.3 ms) → 0 (`browser-partial.ts`, both browsers).

Re-run:
- `perf/run-node.sh node-ab --rounds 9 --warm 2 --scenarios big,repro,repro-1460,big-500,big-xml`
- `node perf/browser-ingest.ts --builds dist-base,dist-exp3,dist-exp4,dist-exp5 ...` (as in M2)
- `node perf/browser-partial.ts --builds dist-base,dist-exp5 --browser chromium|firefox --scenario big`
- Result files: `node-ab-asm.json`, `node-ab-4v.json` (incl. `big-xml`), `node-ab-gate.json`, `browser-ingest-ab1.*`,
  `browser-ingest-telnet.*`, `browser-ingest-4b.*`.

### M6. Spec §1.3 budgets (ingest share)

| Budget | Measured (ingest) | Verdict |
|---|---|---|
| 500 user rules < 0.2 ms per line | Real pipeline with khazdul: 2.1–5.4 µs/line on normal text, 15–50 µs/line SGR-heavy. With 500 rules + khazdul, full pipeline (Node): 16.7 µs/line. The engine-only bench reports 12.6 µs (latest.md, Chromium) and 16.9 µs (Node today). | PASS with a 4–12× margin. The bench misses assembler, recorder and GC costs, which dominate on colourful text. |
| Burst: no frame > 50 ms | Per message p99: 45–80 µs (normal), 0.56–2.8 ms (SGR-heavy, base). Longest: 6–13 ms at load 3–5, but **49.7 / 69.4 / 147.9 ms** at load 4–7 (GC). | At risk from GC on SGR-heavy or GMCP-heavy bursts. With P1–P4 the longest was ≤ 8.3 ms (repro) and ≤ 11.5 ms (big-gmcp). |
| Frame → paint in the next frame | No hops between the message and the enqueue; one `requestAnimationFrame`; per-message ingest ≪ 16 ms. | PASS for ingest. |
| Key → send < 1 ms | Area C. GC pauses inside ingest tasks delay key handling by their length. | P1 shortens that tail. |

## 3. Findings

**B1 — SGR-heavy lines allocate ~22 KB each, and the recorder keeps each line's `raw` rope for 2 s → GC pauses in ingest.**
Confidence: high.
- Evidence (text/assembler.ts):
  - Every SGR code is appended to `lineRaw` (`:267`, `this.lineRaw += s.slice(i, end)`).
  - Every plain piece is appended to both `lineText` and `lineRaw` (`:283–284`).
  - Each piece gets a new `StyleRun` (`:304–313`).
  - `applySgr` resets `p.length = 0` and then `push`es (`:440–450`), which drops and reallocates the array's backing store
    on every SGR.
- Evidence (capture): the recorder keeps `formatInbound(line.ts, line.raw)` (capture/recorder.ts:220–221, three more cons
  strings in capture/format.ts:40) until the next 2 s chunk (recorder.ts:48, :339–341), then `join`s (:451).
- Mechanism (inferred from engine internals, confirmed by the allocation profile):
  - A 24-bit colour line's `raw` becomes a concatenation tree of ~150–200 nodes plus slices.
  - The capture buffer keeps it alive, so it survives scavenges and is promoted.
  - The params array's backing store is released on every `length = 0`.
- Measured:
  - 22.1 KB per line; the recorder adds 15 ms of GC per 5,440-line run in Node.
  - GC is 36% of Firefox ingest.
  - Major GCs in Chromium during a single repro round.
  - Single messages took 50–148 ms under load.
- P1 removes about 90% of the ingest GC (M4, M5).

**B2 — Per-line rule scanning grows with the rule count and is the largest ingest cost on normal text.** Confidence: high
for the mechanism, medium for the exact gain in the browser.
- Evidence (script/engine/engine.ts):
  - Every action goes through `matchRule` → `matchPattern`: `:932`, `:945–953`, pattern.ts:330–351.
  - Every substitute and highlight is checked with its own `text.indexOf(c.literal)`: `:996`, `:1023`.
- The workload: khazdul has 11 actions, 2 substitutes and 22 highlights (src/profiles/khazdul.tin:386–541), plus 6 system
  actions.
- Measured: 43–54% of normal-text ingest. The khazdul stage alone is 45% of the Node pipeline (M1, M3).
- P3 skips every rule whose literal cannot be in the line, using one combined RegExp test per rule list.

**B3 — Telnet walks the data state one byte at a time through a `switch`.** Confidence: high.
- Evidence: net/telnet.ts:234–252.
- Measured: `receive` is 8–13% of SGR-heavy ingest (~900 bytes per line, ~4.5 ns per byte in Chromium, ~9 ns in Firefox).
  P2 cuts repro ingest by 21–22%.

**B4 — Every prompt takes the partial path before its GA.** Confidence: medium (the effect is small).
- Evidence:
  - `text()` emits `text.partial` whenever the tail changed (text/assembler.ts:173–176).
  - The GA arrives as a separate `sink.ga` right after (net/telnet.ts:260–263).
  - `snapshot` copies every run and tag (text/assembler.ts:356–370).
  - `processPartial` runs `displayCopy` (script/engine/engine.ts:940–943).
  - The output pane sets the partial and then clears it (ui/output-pane.ts:213–240), and `renderPartial` clears the row at
    the next flush (:369, :436–449).
- Measured:
  - Prompts are 18% of lines on the big log; none is still pending when the output flushes.
  - DOM cost is ~8 µs per flush.
  - Lines split across messages cost +3–5 µs per split when SGR-heavy.
  - A split line is rendered twice (partial row, then final row) only when an animation frame falls between the two
    messages. That is inherent to showing partials.

**B5 — GMCP costs ~10 µs per message (≈ 3–5 text lines), partly avoidable.** Confidence: high for the costs, low for the
impact (live message rates not measured).
- Evidence:
  - A new `TextDecoder` per message (net/telnet.ts:554).
  - Slices, `trim` and `JSON.parse` (net/gmcp.ts:79–92), then two emits (:151–155).
  - Nine `gmcp` subscribers each call `pkg.toLowerCase()`: app/status.ts:78, app/app.ts:368, app/ui-messages.ts:60,
    gmcp/state.ts:113, timers/hub.ts:135, runs/events.ts:297, capture/recorder.ts:187, panes/comm.ts:127,
    map/client.ts:166; plus gmcp/group.ts:205 inside the model.
  - A second `GroupModel` in run events applies every `Group.*` again (runs/events.ts:204, :304).
  - A synchronous `localStorage.setItem` on each clock sync (gmcp/state.ts:155).
  - An IndexedDB transaction per `Comm.Channel.Text` (panes/comm.ts:159).
  - A microtask plus `postMessage` (a structured clone) for map events (map/client.ts:132, :143–149).
- Measured: M2 and M3; 3.3 KB allocated per message.
- Inferred: at PvP rates (10–30 messages/s) this is < 1 ms/s, so it is not a lag source.

**B6 — The recorder's chunk write runs on the main thread.** Confidence: medium (Node only).
- Evidence: capture/recorder.ts:451 (`join`), :457 (a full UTF-8 `encode` only for `byteLength`).
- Measured (M4): 0.5–9 ms per written chunk in a max-speed burst; negligible in normal play (~10 KB per 2 s).

**B7 — The map forwarder runs a full-line regex on every line while the map is shown.** Confidence: high.
- Evidence: map/client.ts:115–116, :170–173.
- The last alternative, `.*(?:seems? to be closed|…)\.$`, forces a scan to the end of every line.
- Measured: 0.15 µs/line (Chromium) / 0.33 µs/line (Firefox) = 3–4% of normal-text ingest; 0.84 µs/line on 95-char lines (Node).

**B8 — System catch-alls go through the generic rule machinery on every line.** Confidence: medium.
- Evidence: two catch-all actions, `%*` in timers/lines.ts:81–86 and `%0` in runs/events.ts:256–263. Each one, on every line:
  - runs the `LINE_BREAK` regex (script/engine/pattern.ts:331);
  - builds an args array and a result object (pattern.ts:332–342);
  - builds a `MatchContext` (script/engine/engine.ts:491).
- `processLine` also creates a closure for `entry()` on every line (engine.ts:932).
- Measured: the system-rules stage costs 0.35 µs/line (Node). About 300 bytes per line of allocation is attributed to
  `entry` (inlined matching).

**B9 — Small fixed costs.** Confidence: high.
- `formatTs` runs `String(n).padStart` for every line, although all lines of a frame share one timestamp
  (capture/format.ts:34–41). Cost: 0.07–0.3 µs/line.
- `nowUs()` calls `performance.now()` once per frame (core/types.ts:92–94). Cost: ~0.7 µs per call in cross-origin-isolated
  Chromium (0.12–0.15 µs/line in the profile).
- `net.bytesIn` is emitted with no subscriber (net/session.ts:224). Cost: a Map lookup.

**B10 — StyleRun objects come in many shapes.** Confidence: low (impact not measured; it is felt in rendering, area A).
- Evidence: runs start as `{start, end}` and get `fg`, `bg`, `bold`, … in varying combinations (text/assembler.ts:304–313).
  The engine adds spread copies (script/engine/runs.ts:13–21, :76–82) and the partial snapshot another (assembler.ts:359).
- Inferred: property reads in `styleSpan` (ui/output-pane.ts:660–684) see many hidden classes.

**B11 — The fixtures do not look like the live stream.** Confidence: high.
- Live, WebCockpit turns MUME XML mode on (net/gmcp.ts:136). Cockpit's logs are ANSI only, and WebCockpit's own capture
  strips the tags from `raw`.
- Replay frames are synthesized (lines < 1 ms apart are grouped); real WebSocket frame boundaries and GMCP timing are absent.
- An approximate XML-mode transform adds +0.35 µs/line (Node: 2.96 vs ~2.6 µs/line).

**B12 — Scheduling: no finding to fix.**
- Path, all synchronous in one task: net/ws-transport.ts:59–63 → net/session.ts:222–231 → telnet → assembler → bus
  (core/bus.ts:39–51) → ui/output-pane.ts:283–305 (a push and one `requestAnimationFrame`).
- The only async step is the map forwarder's microtask (map/client.ts:132). It runs before the task ends and does not delay
  the output's frame request.
- The bench probe's `MessageChannel` exists only in `?bench` (app/bench-hook.ts:72–91).
- A message that arrives during a long frame waits for it and is then processed and coalesced into the next flush.

**B13 — MCCP2 is refused.** Confidence: medium.
- Evidence: net/telnet.ts:18–19, :382–387.
- Inferred:
  - On broadband a 40 KB help page takes ~3 ms on the wire, so compression would not reduce latency.
  - It would help on slow links: the 123 KB help output takes ~0.5 s at 2 Mbit/s.
  - A `DecompressionStream` is promise-based and would add at least one async hop per message.

## 4. Proposals, ranked

Patches are in the scratchpad (section 7). All were prototyped in the worktree. With P1–P4 applied, the whole unit suite
passes 1320 of 1327:
- 6 failures are P4's partial tests.
- 1 is pre-existing (section 6).

P1–P3 on their own change no tests.

| ID | Change | Expected gain (measured) | Effort | Risk | Owner-visible | Goal; budget |
|---|---|---|---|---|---|---|
| **P1** (B1) | Assembler: append `raw` lazily as one slice per stretch between dropped constructs (a line in one chunk with only SGR gets `raw` as one slice). Keep the SGR params array's capacity (a counter instead of `length = 0` / `push`). | SGR-heavy ingest −40% (Chromium) / −50% (Firefox); ingest GC −88% (Firefox); longest `onData` 50–69 → 5–8 ms; allocation −59% (with P2–P4); recorder `join` 4× faster. Normal text ~−3% (noise). | S | Low. `raw` is byte-identical; 95 text/capture/replay tests pass, incl. the chunking fuzz on a real log. No test churn. | No | Text speed, long sessions (GC), input latency (shorter GC stalls); "no frame > 50 ms" |
| **P2** (B3) | Telnet: in the data state, find the next IAC with `bytes.indexOf(IAC, i)` and the next NUL once per stretch, instead of a `switch` per byte. | SGR-heavy −21/−22% on top of P1 (both browsers); normal text within noise. | S | Low. 70 net tests pass. | No | Text speed; burst |
| **P3** (B2) | Engine: per rule list, one RegExp of the rules' required literals (`CompiledPattern.literal`), cached in a WeakMap by list identity. When it fails, run only the rules without a literal (catch-alls, `$var`, `%i`). Applied to actions, substitutes, gags and highlights; gags and highlights are tested on the substituted text. | Normal text −26% (Chromium) / −10% (Firefox) over P1+P2. 500 rules −50% (engine-only 16.9 → 8.4 µs/line; full pipeline 16.7 → 8.2). | M | Medium. Relies on `literal` being a necessary substring (true by construction, pattern.ts:143–147, :279–296). Runtime rule churn rebuilds the gate (a RegExp compile per list change); add a use-count threshold. Add tests: a substitute that creates a highlight's literal, `$var`/`%i`, catch-alls. 101 engine/app tests pass. | No | Text speed (normal play, large profiles); 500-rule budget |
| P4 (B4) | Emit `text.partial` once per inbound frame: telnet calls `sink.endFrame(ts)` at the end of `receive`; the assembler emits the partial there instead of in `text()`. | 17k partial pipelines and all per-prompt `renderPartial` clears removed per 94k lines; ingest 0 to −15% (noisy). | S | Medium-low. 6 unit tests change (text-lines ×5, text-xml ×1). A prompt whose GA is in the same frame is never a partial (not visible: rendering runs after the task). | No | Text speed (small); frame work |
| P5 (B5) | GMCP trims: one reusable non-streaming `TextDecoder` in `decodeWhole`; lower-case the package once in `Gmcp.handle` and pass it in the `gmcp` payload; run events reuse GameState's group model; batch comm IndexedDB writes. | ~−3 to −8 µs per message (≈ −30–50%); estimated from profile shares, not prototyped. | S (each) | Low. The `gmcp` payload gains a field (BusEvents contract, core/types.ts:153). | No | Input latency and text speed under GMCP bursts |
| P6 (B8, B9) | Fast path for native catch-all taps (call `fn(line)` directly, no args or MatchContext); cache `formatTs` per timestamp; drop the `entry()` closure per line. | −0.1 to −0.3 µs/line (estimated) | S | Low | No | Text speed |
| P7 (B7) | Split `MOVE_FAILURE_RE` into an anchored prefix regex with a first-character gate plus `endsWith` checks for the three suffixes. | −0.1 to −0.3 µs/line while the map is shown (estimated) | S | Low (map tests) | No | Text speed |
| P8 (B6) | Recorder: count bytes without a full `encode` (or `encodeInto` a reused buffer); with P1, the ropes are already flat. | −1 ms per MB written (measured `encode` cost) | S | Low | No | Long sessions, bursts |
| P9 | Bench coverage (section 5) | Keeps the above from regressing | M | None | No | All |

Order of work: **P1 → P2 → P3** give most of the benefit: SGR-heavy ingest ~−45%, normal text ~−25%, GC tails gone.
P4–P8 are cleanups.

## 5. Benchmark gaps and how bench/ should cover them

- **The rule benchmark is not the ingest path.** `ruleBench` (app/bench-hook.ts:206–240) runs a separate ScriptEngine on
  pre-assembled lines. It has none of: telnet, assembler, system rules, recorder, output enqueue, map, panes, GMCP. It never
  sees SGR-heavy lines, where the assembler and GC dominate.
  Add an `ingestBench` that uses the same live-like page as this review (perf/browser-common.ts: `install`, `openPage`,
  `runRound`): playing, recording, khazdul, map loaded, frames delivered through the fake socket. Report per browser:
  - µs per line;
  - p99 and longest time per message;
  - GC (Chromium trace MinorGC/MajorGC).

  Budgets: longest ingest per message < 16 ms; p99 < 1 ms.
- **Add a colour-heavy fixture:** the owner's repro stretch, or a generator that emits 24-bit SGR rows like `help 24-bit
  colours`. Measure both warm (×40) and cold (one pass per fresh page), because cold ingest is 4–6× warm.
- **Add a GMCP-heavy mix** (`big-gmcp`: GMCP every 10 lines) and report µs per GMCP message.
- **Add XML-mode input** (perf/xml-mode.ts), or better, a dev-only wire recorder that writes `net.bytesIn` with µs timestamps
  to a binary file. That would allow replaying real frames with XML, GMCP and the real frame boundaries (B11).
- **Run the 500-rule profile through the full pipeline** as well as through the engine alone.
- **Method:** interleave builds (A B A B), log the load, and report medians and ranges. During this review the same build
  moved 1.7× between load 3 and load 6, so the P/E cores and the other reviewers matter.

## 6. Notes for other areas

- **A (rendering):**
  - The flush is what stalls in the repro: 277–408 µs of script per SGR-heavy row warm, and 45–64 ms of flush script for the
    cold 136-row help. Ingest is ~5–20% of that.
  - `MAX_ROWS_PER_FRAME = 1000` (ui/output-pane.ts:41) allowed single flushes of 250–525 ms with ~96-span rows in my
    max-speed runs. A span or time budget per frame would bound it.
  - StyleRun shapes vary (B10).
  - The partial row is only cleared after prompts (~8 µs per flush), so it is not an issue.
- **C (input latency):** GC pauses land inside ingest tasks (up to 50–148 ms under load before P1) and block keydown handling
  for as long. P1 removes most of that tail.
- **D (long sessions):**
  - The recorder holds 2 s of lines; with P1 they are flat slices.
  - Engine caches are bounded: splitCache 1000 (engine.ts:349), hashCache 2000 (engine.ts:510), pattern cache 2000
    (pattern.ts:110–118).
  - The P3 gate cache is a WeakMap keyed by rule list, so it cannot grow.
  - The comm history uses `splice` (panes/comm.ts:147).
- **E (panes):**
  - Panes schedule a frame on GMCP (`defaultRequestFrame`, 0.4 µs/line in the Firefox GMCP profile).
  - The ClockStrip has a timer.
  - `GameState.clockSynced` writes `localStorage` synchronously (gmcp/state.ts:155).
  - The comm pane opens an IndexedDB transaction per message (panes/comm.ts:159).
- **Pre-existing unit test failure:** tests/unit/timers-replay.test.ts:19 expects more than 1000 lines in every fixture log.
  The owner's new `Rasta/2026-09-30T00-11-08.log` has 364, so the test fails on commit 20c4815 as well. Fixture-dependent,
  not caused by any change here.

## 7. Worktree, patches, harness

- **Worktree:** `/home/ole/proj/webcockpit/.claude/worktrees/agent-a0f73628e89536846`.
  - `src/` holds P1–P4 uncommitted: net/telnet.ts, net/textsink.ts, script/engine/engine.ts, text/assembler.ts.
  - `perf/` is untracked.
  - `dist-base`, `dist-exp` (P1), `dist-exp3` (P1+P2), `dist-exp4` (P1–P3), `dist-exp5` (P1–P4) and `dist-prof-base` /
    `dist-prof-exp` (unminified with source maps) are untracked build outputs.
- **Patches** (`scratchpad/perf/B/`):
  - `exp-assembler-raw-params.patch` — P1.
  - `exp-telnet-scan.patch` — P2.
  - `exp-engine-literal-gate.patch` — P3.
  - `exp-partial-per-frame.patch` — P4, for reading. It sits on top of P1; its last hunk, the telnet `endFrame` call, is
    written out by hand and does not apply as a patch.
  - `exp-all-cumulative.patch` — P1–P4 as in the worktree.
  - P1, P2, P3 and the cumulative patch each apply cleanly to 20c4815 (`patch -p1 --dry-run`).
- **Harness:** `scratchpad/perf/B/harness/`, a copy of the worktree's `perf/`. Setup: copy node_modules. Node harnesses are
  built with Vite SSR: `perf/run-node.sh <name>`.
  - `pipeline.ts` — the ingest pipeline from real src/ modules, wired like App.
  - `variants.ts`, `make-variants.py`, `base/` (the committed files), `p1/`–`p4/` — explicit copies for base/p1/p12/p123/p1234,
    independent of src/.
  - `node-ingest.ts` — M1.
  - `node-ab.ts` — M5, Node.
  - `node-profile.ts` — M3 and M4, Node.
  - `node-chunk.ts` — recorder `join` / `encode`.
  - `analyze.ts` — profile and heap attribution through source maps.
  - `xml-mode.ts`, `gmcp-mix.ts`.
  - `browser-common.ts` — the live-like page, fixtures and timed delivery.
  - `browser-ingest.ts` — M2 and M5, browsers.
  - `browser-profile.ts` — CDP and Gecko profiles, M3.
  - `browser-gc.ts`, `browser-partial.ts`.
  - `run-profiles.sh`, `run-cold.sh`.
  - `gecko-inspect.ts`, `browser-probe.ts`, `ff-profiler-test.ts` — exploratory.
- **Browser builds for a re-run** (from a clean checkout):
  - `npx vite build --outDir dist-base`
  - apply the patches cumulatively, building `--outDir dist-exp`, `dist-exp3`, `dist-exp4` after each; `dist-exp5` =
    `exp-all-cumulative.patch`
  - `npx vite build --outDir dist-prof-base --minify false --sourcemap` (profiles)
  - Ports 4211–4218.
- **Results** (`scratchpad/perf/B/`):
  - `node-ingest-run1.txt` / `node-ingest.json`
  - `node-profile-{big,repro}.txt`
  - `node-ab-{asm,4v,gate}.json`
  - `node-alloc.txt`, `node-chunk.txt`
  - `browser-ingest-{ab1,telnet,4b}.{txt,json}`
  - `prof-{chromium,firefox}-*.txt`, plus `*.cpuprofile`, `*.heapprofile` and the Firefox repro Gecko profiles (`*.gecko.json`)
  - `browser-gc-repro.txt`, `cold-repro.txt`
