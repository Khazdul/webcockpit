# 0047 — `#perf`, a latency monitor for real sessions

- Status: Accepted
- Date: 2026-10-01
- Builds on ADR 0044 (owner decision: `#perf` as a command that prints a
  summary, no status readout, no run record; performance review #14,
  `notes/research/perf-review/C-input.md` P2)

## Context

The owner's lag is intermittent and happens in real play, which the
benchmark cannot see: its key → send test is a synthetic keydown on an
idle page and its burst is a replay. The review (C-input.md finding 9)
measured the same instrumentation as below at no cost within noise
(burst drain 979 vs 971 ms in Chromium, 1001 vs 998 ms in Firefox).

## Decision

### What is measured

In memory only, in fixed-size rings (`src/app/perf-monitor.ts`):

| Ring | Entries | Value | Context | How |
|---|---|---|---|---|
| key → send | 2048 | keydown `timeStamp` → just after `ws.send` | Enter or macro | App wraps `onCommand` / `onMacroKey` in `keyStart` / `keyEnd`; the keydown is `window.event`; Session's `onSend` hook ends it at the first write |
| socket buffer | 2048 | `ws.bufferedAmount` after each write (includes the bytes just written) | bytes written | Session `onSend` (every write: commands, GMCP, telnet replies) |
| frames | 4096 | flush script time | rows built, style runs built | the output pane's frame scheduler is wrapped; a frame callback that changed `flushCount` was a flush; the pane fills `flushStats` in place |
| received → shown | 4096 | oldest game line's receive time (`Line.ts`) → after the frame was rendered | rows, script | one MessageChannel message posted from the flush frame runs after its style, layout and paint (as the `?bench` probe); the receive time is clamped to when the tab was last shown, so a hidden tab's backlog does not count |
| input delay | 512 | `processingStart − startTime` | event type, duration, handler time | Event Timing (`event`, `durationThreshold` 16, the minimum), where supported (Firefox and Chromium) |
| long frames | 256 | LoAF duration | blocking time, forced style and layout, the longest script (`invoker function (file)`) | Long Animation Frames, Chromium only |

About 200 KB in all, allocated at start. A write is a few typed-array
stores; nothing grows over a 12-hour session. Feature detection is
`PerformanceObserver.supportedEntryTypes`; a missing API shows as "not
supported" / "chromium only".

### Overhead rules (ADR 0044)

- No listener per line, no timer, no `requestAnimationFrame` loop: a
  frame is measured only when the output pane already scheduled one, and
  posts one message (rule 1).
- No layout read anywhere; per row the pane adds one integer.
- The key path adds `window.event` and one assignment before the send and
  one `performance.now()` after it (rule 3 holds: nothing before
  `ws.send`).
- Stats are computed only when `#perf` is typed (a sorted copy per
  measure), and the formatting is a lazy chunk.

### The command

`#perf` prints rows straight to the output pane, like `#help` (ADR 0037)
and the confirmations (ADR 0039): not on the bus, so no rule fires on
them and the run capture does not record them. The style is ADR 0039's:
lower case, no period, the `#perf` word in the command colour, the rest
in the message colours.

    #perf last 12m 04s, firefox 132, pixel ratio 2
      measure            count median    p95    p99    max
      key -> send          412    0.2    0.6    1.1    4.8 ms
      input delay           12    3.1     18     22     22 ms  events over 16 ms
      frame script        3104    0.4    2.1    5.0     48 ms
      received -> shown   2981    7.9     16     22    180 ms
      rows per frame      3104      1      4     12    500
      runs per frame      3104      3     40    200   2400
      long frames            0      -      -      -      - ms  chromium only
      socket buffer        412     12     40     80    230 B   last 41m 10s

- Percentiles are nearest-rank over the ring's entries. A ring that has
  wrapped says how far back it reaches (`last 41m 10s`).
- `#perf worst`: the ten worst moments over the timed rings, slowest
  first: wall time, age, measure, value, context (rows and runs of the
  frame, the event type, the long frame's script). The socket buffer is
  in bytes and is left out of the ranking.
- `#perf reset` empties the rings (`#perf cleared`). Anything else gives
  `[SYSTEM] Usage: #perf [worst | reset]`.
- `->` instead of an arrow glyph: the bundled fonts are not guaranteed
  to have `→`, and a fallback glyph would break the columns.
- `#help perf` has a manual entry; `#perf` is a client command in the
  command table (`#pe` resolves to it).

### Not built (owner decision, may be added later)

- No `Lag:` readout in the status line: a number that moves while
  playing is a distraction and would itself cost a status update.
- No `PERF` record in the run capture.

### Where it runs

The main app only. A log player App (`player: true`, the HTML replay and
the run viewer) has no monitor. In `?replay` / `#replay` the monitor runs
and its numbers describe the client drawing the replay, which is
harmless.

## Consequences

- The owner can type `#perf` / `#perf worst` right after a slow moment and
  paste the rows; that is the feedback stage 8 part C's test guide asks
  for.
- `Socketish` gains an optional `bufferedAmount`; Session an `onSend`
  hook; the output pane a `flushStats` object.
