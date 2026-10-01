# 0046 — Scrollback depth as a setting

- Status: Accepted
- Date: 2026-10-01
- Builds on ADR 0044 (owner decision: the depth becomes a setting,
  default 20 000; performance review #13); amends spec §1.3 (scrollback)

## Context

The game window keeps 20 000 rows (spec §1.3, ADR 0009). The performance
review measured what that costs once the scrollback is full
(notes/research/perf-review/D-long-sessions.md §2.2–2.3, D1):

- Memory: about 4 KB of Blink objects per row (Chromium `blink_gc`
  117–140 MB at 20 000 rows with real play, 52–54 k DOM nodes); it is
  reached after 1–1.5 hours and stays flat.
- GC: Chromium's worst major GC 18 ms at 20 000 rows against 10 ms at
  5 000; frames 5–9 % dearer than at 5 000.
- Nothing grows past the cap.

The owner chose to keep 20 000 as the default and let each player trade
history for memory.

## Decision

- **`settings.output.scrollback`**, one of **5 000, 10 000, 20 000
  (default) and 50 000** rows (`SCROLLBACK_CHOICES`). The migration keeps
  only these values; anything else (an older store has none) loads as
  20 000.
  (Memory at ~4 KB per row; time at the review's 20 000 rows per 1–1.5 h.)
  - 5 000: about 20 MB, 15–20 minutes of play; for a small machine or
    many tabs.
  - 10 000: about 40 MB, half an hour or more; half the nodes and GC work
    of the default.
  - 20 000: about 80 MB (measured 117–140 MB of `blink_gc` with real
    play), 1–1.5 hours, as in spec §1.3.
  - 50 000: about 200 MB, 2.5–4 hours: a long evening. Beyond that
    the memory floor and full-GC pauses (130–190 ms to mark 1.1 M objects
    at 20 000 rows, when one runs) grow past what a browser tab should
    hold for text; a run log (`#runlog`, RUN LOG) keeps the whole session
    anyway.
  - Four fixed steps, not a free number: the UI is a cycler like the other
    Options rows, and every value is one the review's numbers cover.
- **Options → Appearance → `Scrollback: 20 000 lines`**, a cycler after
  Input color (the other game-window options live there). It is not part
  of the appearance in `ViewSnapshot`, so it is not recorded in a run and
  "Reset appearance" leaves it. A log player builds on the viewer's own
  settings and uses the viewer's depth.
- **Applied live.** `OutputPane.setScrollback` takes the new depth at once:
  a lower depth drops the oldest whole chunks immediately (no reload, no
  new output needed), and new chunks take the size for the new depth
  (depth / 100, at most 200 rows; ADR 0009). A higher depth keeps more
  rows from then on.

## Consequences

- Spec §1.3 notes the range next to the 20 000 default.
- The benchmark keeps measuring the default.
- Lowering the depth at a full 50 000-row scrollback removes up to 45 000
  rows in one task; that happens only in the Options menu.
