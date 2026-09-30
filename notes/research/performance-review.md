# Performance review (stage 8 part B)

> Date: 2026-09-30. Status: done; the owner picked what to build (§5).
> Built in stage 8 part C. Reviewer reports, patches and harnesses:
> `notes/research/perf-review/`.

## 1. Question

Owner brief (`docs/stages/08-hardening.md`, owner feedback 2026-09-30):

- In play WebCockpit sometimes feels a little laggier than Cockpit (tt++
  in `foot` under tmux).
- Repro: `help 24-bit colours` fills the screen with colour examples, and
  the paint stalls noticeably (Cockpit stalls too, but less).
- The owner widened the scope to three goals:
  1. text drawn as fast as possible;
  2. no slowdown over long sessions;
  3. the lowest possible input latency.
- Proposals first; nothing is built before the owner picks.

## 2. How it was measured

- **Where the owner plays.** This machine has only Firefox installed
  (156), on Wayland (Hyprland), 60 Hz, device pixel ratio 2, a
  full-screen window of about 1728 × 1050 CSS px. Firefox is the primary
  target, Chromium second.
- **Five reviewers, one area each:**
  - A: output rendering;
  - B: the ingest CPU path;
  - C: input latency;
  - D: long sessions;
  - E: side panes and frame composition.
- **Setup:**
  - Headless Playwright Firefox 155 and Chromium 153, at ratio 2 and
    1728 × 1000–1050.
  - The production build, the owner's Cockpit logs, the bundled `khazdul`
    profile, and the default layout with the map.
  - GMCP synthesized where the logs have none.
- **Caveats:**
  - The five measured at the same time on one laptop (load 2–7), so
    absolute numbers are noisy. Comparisons were interleaved A/B, and the
    key ones were re-run on a quiet machine (§6).
  - Headless browsers raster and composite in software. Main-thread
    costs (script, style, layout, display list) are representative;
    raster and composite times are not.

## 3. What we found

### 3.1 Normal play is fast and stays fast

- A text frame costs about 1.5–2 ms of main-thread time at ratio 2. With
  a side-pane render in the same frame it is about 3 ms (Firefox 3.16,
  Chromium 2.96).
- Ingest (socket → telnet → assembler → script engine with `khazdul` →
  recorder) costs 2.1 µs per line in Chromium and 3.2 µs in Firefox.
- Key → `ws.send` takes 0.05–0.40 ms median, p99 under 2 ms, for Enter,
  aliases, F-keys and printable-key macros.
- In a busy fight window with GMCP and all panes, key → command on the
  wire is at most 5.3 ms p99, and no task is longer than 10 ms.
- A 12.9-hour soak (the owner's three biggest logs back to back:
  235 000 lines, 34 000 typed commands) grew nothing once the scrollback
  was full:
  - Chromium heap after GC 6.4 → 7.1 MB; DOM nodes 52–54 k;
  - listeners, bus handlers and timers constant;
  - Firefox content RSS 443 → 453 MB;
  - flush, frame and key → send times the same at the end.

### 3.2 The owner's repro: one element per colour cell

- MUME's 24-bit chart changes the background every 1–2 characters. The
  output pane makes one span per style run: 2 352 spans on page 1 and
  4 658 on page 2.
- Cost per page:
  - Firefox: 28 / 42 ms per frame (p95 34 / 47); receipt → painted
    36 / 50 ms.
  - Chromium: 40 / 56 ms (p95 56 / 78).
- The cost stays while the rows are on screen. Every later frame is 3–5×
  slower (Firefox: a 4-line combat frame about 15 ms instead of 2.5 ms,
  until the rows scroll out). Firefox rebuilds the display list for
  everything visible on every paint.
- How the colour is written makes no difference (inline style, classes,
  `cssText`, `innerHTML`: all within ±17 %). Only fewer elements help.
- The owner's play logs never carry more than 16 colour codes per line,
  and no 256-colour or 24-bit codes. The repro is rare content, but it
  is the owner's concrete complaint.

### 3.3 Why quiet play can feel a little slower than Cockpit

These are the two likely causes, in order of size. Both are measured in
headless browsers; neither is measured on the owner's screen.

1. **The caret blink keeps the browser rendering at the display rate.**
   - What it is: an infinite CSS animation (`src/ui/ui.css`), on by
     default.
   - Effect: while the caret shows (a command being typed, or an empty
     line) both engines tick every vsync, so arriving text waits for the
     next tick.
   - Measured (receipt → rendered, median):

     | | CSS blink (today) | No animation |
     |---|---|---|
     | Firefox | 10.3 ms (quiet re-run 10.8–12.7 ms) | 2.3 ms (quiet re-run 2.8–3.3 ms) |
     | Chromium | 11.7 ms | 2.9 ms |

   - With nothing animating, both engines render a requested frame at
     once.
   - A 500 ms timer blink gives the same look at 3.1 ms (Firefox) and
     3.4 ms (Chromium). It also cuts idle CPU while the caret shows: by
     about half in Firefox (4.5 → 2.3 s per minute across the main and
     WebRender threads) and by about three quarters in Chromium's
     compositor threads.
   - The bench's published frame → paint medians (9.7 and 9.8 ms) are in
     the blinking state.
2. **Firefox presents a content paint one vsync after drawing it.**
   - From a headless profile: tick → scene build → frame build at the
     next vsync → composite.
   - That is about one frame (≈ 17 ms at 60 Hz) more than foot, which
     commits at its next frame callback.
   - The page cannot change this. It can only avoid adding ticks and
     long frames of its own.

### 3.4 Stalls the benchmark does not see

Each of these is a main-thread task that also holds back any key pressed
during it: in a browser, keys and paint share one thread. In Cockpit,
tt++ reads keys in a different process from the one foot paints in.

| Stall | When | Measured | Cause |
|---|---|---|---|
| Scroll back / return, full scrollback | PgUp, Esc, wheel, Enter while scrolled | Chromium 123–140 ms, Firefox 17–28 ms at 20 000 rows | `.wc-scrolled` toggles the inherited `scrollbar-color`, so every row is restyled |
| Width change, full scrollback | Window resize (incl. Hyprland retiling), dock drag, pane toggle | Firefox 90 ms, Chromium 75–130 ms per frame | All 20 000 rows re-wrap (chunks have no size containment) |
| Drag start and drop | Any dock or pane drag | Chromium 171 ms, Firefox 85 ms at 20 000 rows | `.wc-cockpit[data-drag] *` cursor rules restyle every element |
| Recorder chunk write | Every 2 s, sized by output volume | 6.6 ms/MB (Chromium), 14 ms/MB (Firefox); 30–95 ms tasks in live WebSocket bursts | `join` + a `TextEncoder` pass only to count bytes + the IndexedDB put, in one task |
| GC on colour-heavy text | The help pages, under load | Single socket messages 50–69 ms (148 ms GMCP-heavy) | ~22 KB per 24-bit line; the recorder keeps each line's raw text as a rope of ~200 pieces |
| Firefox cycle collector | Big bursts | Slices up to 132 ms | Inferred: DOM garbage from dropped scrollback chunks and pane rebuilds |
| Catch-up after a hidden tab or workspace | Returning to the game | 14–38 ms per 1 000-row frame | `MAX_ROWS_PER_FRAME = 1000` |
| Enter before send | Every Enter | 0.04–0.30 ms median; unbounded with pending layout (365 ms seen with a pending root style) | `submit()` calls `toTail()` (reads `scrollHeight`) before `ws.send` |

### 3.5 Long sessions

- Nothing grows beyond its cap (§3.1). The costs that grow are the ones
  that scale with the scrollback until it is full: scroll-mode restyle,
  width change and drag in §3.4.
- **Memory floor.** A full 20 000-row scrollback is about 4 KB of Blink
  objects per row (Oilpan 117–140 MB after GC). Against 5 000 rows,
  frames are 5–9 % dearer and Chromium's worst major GC is 18 ms instead
  of 10 ms.
- **Garbage.** The side panes rebuild their whole DOM on every render:
  about 13 000 nodes per minute, against 800 from the game text. GC is
  harmless at the real rate today (major GCs ≤ 4 ms, Firefox slices
  ≤ 16 ms), but pauses of 36–55 ms followed churn bursts.
- **Small leaks:**
  - input history is unbounded (about 0.35 MB per 6 hours);
  - the log player leaks one MessageChannel per open;
  - the comm archive is pruned only when the Comm pane is built;
  - the XML tag stack has no depth cap (theoretical).
- IndexedDB write costs are flat up to 10 800 run chunks and 20 000 comm
  messages. 100 reconnects leak nothing.

### 3.6 Input latency

- The key handler is not the problem (§3.1). The bytes leave the browser
  0.1–0.7 ms after `ws.send`, even while the page stays blocked.
- Keys wait for whatever the main thread is doing:
  - during the help pages, key → wire p95 46 ms (Chromium) and
    14–32 ms (Firefox);
  - during a replay burst, Firefox Playwright keys waited up to 145 ms
    (an upper bound; real keys have input priority).
- So input latency is bounded by the longest main-thread tasks: every
  stall in §3.4 and the repro frames in §3.2.
- Firefox applies no WebSocket backpressure. In a flood it queues
  everything as tasks; even a paced burst gave frame gaps of up to
  124–165 ms.

## 4. Proposals, ranked

The owner picked all four groups (§5). Build in this order. Patches from
the review are in `notes/research/perf-review/patches/`; "ready" means a
measured experiment patch exists, not reviewed production code.

**Group 1: small and safe.**

| # | Change | Measured gain | Effort | Source |
|---|---|---|---|---|
| 1 | Caret blink by a 500 ms timer, no infinite CSS animation. Restart visible on every caret move and on a setting change (ready, except the restart on a setting change). | Text receipt → rendered 10.3 → 3.1 ms (Firefox), 11.7 → 3.4 ms (Chromium) while the caret shows; idle CPU about halved (Firefox) | S | E-P1 |
| 2 | `.wc-rows, .wc-partial { scrollbar-color: auto }`, so the scroll-mode class stops at the scroller (ready) | Scroll back / return at 20 000 rows: Chromium 123–140 → 17–19 ms, Firefox 17–28 → 15–19 ms | S | C-P1, D-P1 |
| 3 | Background rows: a line with ≥ 4 background runs (uniform flags, one-cell characters, fits the pane) becomes one row with a hard-stop gradient; text in text nodes, a span only where the foreground differs (ready) | Repro page 1: −69 % Firefox (23.1 → 7.1 ms), −81 % Chromium. Page 2: −75 % / −77 %. Later frames 6–15 → about 2 ms | S–M | A-P1 |
| 4 | Assembler: raw text as one slice per stretch; the SGR parameter array keeps its capacity (ready) | Colour-heavy ingest −40 % (Chromium) / −50 % (Firefox); Firefox ingest GC −88 %; longest message 50–69 → 5–8 ms | S | B-P1 |
| 5 | Drag cursor on a shield element instead of `.wc-cockpit[data-drag] *` (ready) | Drag start + drop at 20 000 rows: 171 → 0.3 ms (Chromium), 85 → 0.5 ms (Firefox) | S | E-P3 |
| 6 | Send first: `toTail()` after the send, and only when scrolled; macros run before the refocus (partly ready) | Enter → send median 0.15–0.40 → 0.05–0.12 ms; no layout before `ws.send` | S | C-P4 |
| 7 | Recorder: count bytes as lines are captured (no `TextEncoder` pass); write by size as well as by time (≤ 256 KB per task) | Burst chunk tasks 30–95 ms → ≤ ~2–4 ms each (estimated from 6.6–14 ms/MB) | S | C-P3, B-P8 |

**Group 2: medium effort.**

| # | Change | Measured gain | Effort | Source |
|---|---|---|---|---|
| 8 | `content-visibility: auto` on scrollback chunks, with `contain-intrinsic-size` from the row count, and browser scroll anchoring while scrolled back (replacing the manual top-trim compensation). Revisits ADR 0009's note. | Width change at 20 000 rows: Firefox 90 → 6 ms, Chromium 129 → 4.6 ms; catch-up frames about halved; nothing per frame in play (Firefox 4.02 vs 3.96 ms, n = 216). Risk: the view can jump when scrolling back into chunks whose height was estimated; needs PgUp/PgDn and trim tests. | M | A-P2 |
| 9 | Side panes patch rows instead of rebuilding (Character, Group, Timers; ready), and Character skips renders when nothing it shows changed | Text frames with a pane render: 3.16 → 2.10 ms (Firefox), 2.96 → 2.29 ms (Chromium), p95 −1.4 ms; most of the in-play DOM garbage gone | S–M | E-P2, D-P2 |
| 10 | Telnet data state: native `indexOf` for IAC/NUL instead of a per-byte switch (ready) | Colour-heavy ingest −21 % more | S | B-P2 |
| 11 | Script engine: one combined RegExp of the rules' required literals gates each rule list (ready; needs tests for substitutes that create a highlight's literal, `$var`, `%i`, catch-alls) | Normal-text ingest −26 % (Chromium) / −10 % (Firefox); 500 rules 16.9 → 8.4 µs/line | M | B-P3 |
| 12 | Catch-up: `MAX_ROWS_PER_FRAME` 1000 → 500 (owner: simple cap; ready) | Catch-up frames 14–38 → 7–15 ms; the newest line of a 5 000-line backlog shows 20–80 ms later | S | A-P3 |
| 13 | Scrollback depth as a setting (owner decision), default 20 000 | The owner trades history for memory | M | D-P3 |

**Group 3: diagnostics.**

| # | Change | Effort | Source |
|---|---|---|---|
| 14 | `#perf`: in-memory rings of key → send, Event Timing input delay, output frames (flush script, rows and style runs, received → rendered), Chromium LoAF attribution and `ws.bufferedAmount` after each send; `#perf` prints a summary as client rows (not recorded, no rules fire), `#perf worst` the ten worst moments. No status readout and no run record (owner may add later). Measured overhead: none within noise. | M | C-P2 |

**Group 4: benchmark.**

| # | Change | Effort | Source |
|---|---|---|---|
| 15 | See §7. | M | All |

**Small fixes, alongside (S each):**

- Input history capped at 1000 entries (tt++'s default).
- A command that could not be sent (socket not OPEN) shows one
  `[SYSTEM]` line and is not echoed, recorded or fed to the trackers.
- The log player closes its MessageChannel on dispose.
- The comm archive is pruned on each live `Char.Name`.
- The XML tag stack is capped (e.g. 32 open tags).
- GMCP trims:
  - one reusable `TextDecoder`;
  - the package lower-cased once;
  - run events reuse GameState's group model;
  - comm IndexedDB appends batched.
- Map forwarder: the move-failure regex gets an anchored prefix and
  `endsWith` checks.
- Catch-all system rules get a direct call; `formatTs` is cached per
  timestamp.
- `tests/unit/timers-replay.test.ts` skips logs shorter than its minimum
  (it fails on the owner's 364-line log of 2026-09-30).

**Deferred until the new bench shows a need:**

- `text.partial` once per inbound frame (B-P4): small gain, 6 tests
  change.
- Bounded ingest slices for WebSocket data in Firefox (C-P8): measure a
  realistic 1 MB live burst first.
- Recycling or idle-time release of dropped scrollback chunks against
  Firefox cycle-collector slices (C-P5): re-measure after #9.
- A frame-budget scheduler for pane renders (E-P6): not needed at
  today's costs.
- Static classes for palette colours 16–255 (A-P5): play never uses
  them.

**Measured and not recommended (record, do not revisit without new
data):**

- **A canvas output renderer (ADR 0004's fallback).** A canvas-2D spike
  at ratio 2 was no faster (full redraw of the colour page 9–21 ms,
  scroll-blit 11.7 ms against about 4 ms for the DOM). Only a WebGL
  glyph atlas could win: large work, and it loses selection, find and
  accessibility.
- **Spreading a heavy page over several frames.** Chromium's key → next
  frame p95 went 43 → 63 ms.
- **Other scroll anchoring:** `column-reverse` bottom anchoring (4–7×
  slower small frames in Chromium), a scroll-anchor element (Firefox
  loses the bottom), and `scrollTop = 1e9` without the read (the same
  forced layout).
- **Containment changes:** removing `contain: content` from chunks
  (2–4× slower frames), and containment on rows (+45–60 % in Chromium).
- **Text CSS:** changing the font stack or the underscore face,
  `pre-wrap` / `overflow-wrap`, kerning or `text-rendering`. None had a
  measurable cost.
- **Aligning the 1 Hz tickers.**
- **MCCP2.** A `DecompressionStream` adds an async hop per message and
  would not help on broadband.

## 5. Owner decisions (2026-09-30)

- Build all four groups (§4): group 1, group 2, `#perf`, the benchmark.
- Caret: it keeps blinking as now, driven by a timer.
- Catch-up after a hidden tab: a simple cap per frame (500 rows).
- Scrollback depth: a setting in Options, default 20 000.
- Decided in the session, not objected to: input history capped at 1000;
  a `[SYSTEM]` line for a command that could not be sent; `#perf` as a
  command that prints a summary (no readout, no run record).

## 6. Quiet-machine re-run

The key comparisons were re-run one at a time after the reviews (load
about 0.3–1.3). Details are in `notes/research/perf-review/rerun.md`.

- **Caret blink, Firefox:** receipt → rendered median 10.8 / 12.7 ms with
  today's CSS blink, 3.3 / 2.8 ms without blink, 3.3 / 2.9 ms with the
  timer blink (two runs each). This confirms #1.
- **The remaining comparisons** are in `rerun.md`: Chromium caret,
  scroll mode, the repro, width change, drag, ingest and recorder.

## 7. Benchmark gaps (for #15)

- **Geometry.** The bench runs at ratio 1 in 1280 × 720. Add the owner's
  geometry: ratio 2 at 1728 × 1000. Firefox needs the
  `layout.css.devPixelsPerPx` pref (`tests/e2e/dpr.ts`).
- **Frame → paint.**
  - Its medians include the caret-blink vsync wait.
  - Add a latency check with a visible caret (isolated lines 150–450 ms
    apart; pass: median receipt → rendered ≤ 4 ms).
  - Add an idle check: a few frames per second at most while nothing
    arrives.
- **Panes are never active.** No budget run reaches `playing`. Add a play
  scenario with synthesized GMCP (`Char.Vitals`, `Group.Update`,
  `Comm.Channel.Text`, `Room.Info`). Report text frames with and without
  pane renders.
- **"Map off" is map on** since the map became default-on (9c0cf8e). Set
  `panes.map.on` explicitly for both columns.
- **No colour-heavy page.** Add a synthetic 24-bit and 256-colour chart
  (MUME's layout) to `tests/fixtures`. Report the page frame, the next 20
  frames, and receipt → painted.
- **Key → send is a synthetic dispatch on an idle page.**
  - Add real key events under three loads: the colour page, a burst, and
    play with GMCP.
  - Report the input delay p95 and max, key → send, and typed letter /
    echo → rendered.
  - Firefox's view needs the Gecko profiler.
- **The burst is a replay, which is never recorded.**
  - Add a loopback WebSocket server with a live-like (recording)
    session, paced by page acknowledgements.
  - Report the longest tasks (recorder chunk, GC, cycle collector) and
    key → wire.
- **Full-scrollback actions.** At 20 000 rows: enter/leave scroll mode,
  a width change, drag start/drop. Report trim frames separately (p95
  and max, not only medians).
- **Soak.** 30× playback of the owner's biggest logs with GMCP, all
  panes and typed commands. Pass: counters flat from a full scrollback to
  the end, and frames within 1.2× + 1 ms.
- **The 500-rule check runs the engine alone.** Also run it through the
  full ingest path: assembler, recorder, GC.
- **Method.** Interleave A/B, log the load average, run on a quiet
  machine.
  - GC: trace windows, not `--trace-gc`, which misses Chromium's
    unified-heap major GCs.
  - Keep heap snapshots out of timing runs; they slow later scavenges 3×.

## 8. Follow-ups

- **A 5-minute check in the owner's own Firefox (optional).** Take a
  Firefox Profiler recording ("Graphics" preset) with the cursor blink on
  and off (Options → Appearance). It would show on the real display how
  much §3.3 item 1 and the extra vsync of item 2 cost.
- **Performance rules for new work:** see ADR 0044.
