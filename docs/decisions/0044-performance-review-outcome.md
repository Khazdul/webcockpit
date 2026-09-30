# 0044 — Performance review outcome and performance rules

- Status: Accepted
- Date: 2026-09-30
- Amends ADR 0004 (the canvas fallback is not triggered) and ADR 0009
  (the `content-visibility` note is re-measured)

## Context

The owner asked for a review of the whole input → socket → parse →
render path with three goals: text drawn as fast as possible, no
slowdown over long sessions, and the lowest possible input latency. The
owner's repro was `help 24-bit colours`. Five subagent reviews measured
the production build in Firefox (the owner's browser) and Chromium at
pixel ratio 2.

The findings, numbers and ranked proposals are in
`notes/research/performance-review.md`. The reviewer reports, experiment
patches and harnesses are in `notes/research/perf-review/`.

In short:

- Normal play is fast and does not slow down over a 12.9-hour soak.
- The repro is one DOM element per colour cell.
- Quiet play is held back by the blinking caret's CSS animation, which
  keeps the frame loop on the vsync grid.
- The long stalls come from style invalidation or layout of the whole
  20 000-row scrollback, and from main-thread tasks sized by data volume.
- A key waits for whatever task the main thread is running.

## Decision

- **The output stays DOM** (ADR 0004). A canvas-2D spike at ratio 2 was
  no faster than the DOM, and only a WebGL glyph atlas could be. That
  would be a large change and would lose selection, find and
  accessibility. The fallback is not triggered.
- **The build list is the report's §4, in its order.** It is built in
  stage 8 part C. The owner's choices:
  - all four groups (small fixes, medium fixes, `#perf`, the benchmark);
  - the caret keeps blinking, driven by a timer;
  - catch-up after a hidden tab is capped at 500 rows per frame;
  - the scrollback depth becomes a setting, default 20 000.
- **Performance rules for new code:**
  1. **Nothing animates continuously while connected.** No infinite CSS
     animation, transition loop or `requestAnimationFrame` loop. Either
     one moves every text frame onto the vsync grid (+7–9 ms median per
     received line). A blink is a timer that toggles a class.
  2. **Nothing toggled during play may restyle the scrollback.**
     - No inherited property changes on an ancestor of `.wc-rows`; give
       `.wc-rows` its own value instead.
     - No `*` or descendant rules keyed on attributes or classes of
       `.wc-cockpit`, `.wc-app` or the root that change during play.
     - Root custom properties change only when the appearance changes.
     - Each case in the review cost 85–171 ms at 20 000 rows.
  3. **Send first.** In a key handler `ws.send` comes before any layout
     read or other UI work.
  4. **Panes patch, they do not rebuild.** Rows whose content did not
     change keep their elements, and a render that changes nothing
     touches no DOM.
  5. **Output rows use as few elements as their styles need.** Game text
     still reaches the DOM only as text nodes.
  6. **Main-thread work sized by data volume is bounded per task:**
     recorder writes, catch-up flushes, and ingest per message if that
     is ever needed.
  7. **Measure where the owner plays:** Firefox first, pixel ratio 2,
     about 1728 × 1000 CSS px, panes active with GMCP, A/B interleaved on
     a quiet machine.
- **Kept as they are (measured, not to be revisited without new data):**
  - the `scrollTop = scrollHeight` write in the flush;
  - the font stack with the underscore face (ADR 0043);
  - `pre-wrap` / `overflow-wrap: anywhere`;
  - `contain: content` on chunks and no containment on rows;
  - no `column-reverse` or scroll-anchor bottom lock;
  - no spreading of one heavy page over several frames;
  - MCCP2 refused.

## Consequences

- Stage 8 part C builds the list. Features with their own design
  (`#perf`, the scrollback setting) get their own ADR when built.
- ADR 0009's note that `content-visibility` was slower in stage 1 no
  longer holds at ratio 2: it now costs nothing per frame in play.
  - It turns a width change at 20 000 rows from 90–130 ms into 4–6 ms.
  - It is proposal #8, with scroll anchoring while scrolled back, and is
    decided when it is built.
- The benchmark grows to cover the owner's geometry, active panes, a
  colour page, real keys under load, a live-like WebSocket with the
  recorder, a soak, and full-scrollback actions (report §7).
- Its published frame → paint medians were measured while the caret
  blinked. Numbers before and after rule 1 are not comparable.
