# 0045 — Off-screen scrollback chunks and a self-anchored scrolled view

- Status: Accepted
- Date: 2026-10-01
- Amends ADR 0009 ("Output rows in chunks", and its `content-visibility`
  note); builds on ADR 0044 (performance review #8)

## Context

The output pane keeps up to 20 000 rows in chunks of 200 with
`contain: content` (ADR 0009). Layout containment keeps a change inside
one chunk from moving the others, but without size containment every
width change re-wraps every row. The performance review measured it
(notes/research/perf-review/A-render.md §2.9, `.wc-game` one cell
narrower, pixel ratio 2):

| | 2 003 rows | 20 003 rows | 20 003 rows, `content-visibility: auto` |
|---|---|---|---|
| Firefox, forced layout (frame) | 10.6 (12.3) ms | 90.0 (92.5) ms | 4.4 (6.1) ms |
| Chromium | 9.6 (18.5) ms | 75.4 (128.6) ms | 1.5 (4.6) ms |

A width change happens on every window resize (Hyprland retiling
animates it), dock drag frame and pane toggle. Catch-up frames after a
hidden tab were also about halved with `content-visibility: auto` (§2.7),
and play frames did not get dearer (Firefox 3.96 → 4.02 ms, Chromium
3.54 → 3.32 ms median, n = 216, §2.9). ADR 0009's stage-1 trial, slower in
Chromium, no longer holds at ratio 2.

The review named the risk: an off-screen chunk takes a placeholder
height until it is rendered, so the view can jump when it scrolls back
into chunks whose height was estimated, and the manual compensation of
top trims (`scrollTop -= removed height`) would need the browser's scroll
anchoring instead.

## Decision

- **`content-visibility: auto` on `.wc-chunk`**, with `contain: content`
  kept. Each chunk gets `contain-intrinsic-block-size: auto
  calc(var(--cell-h) * L)`, where `L` is the chunk's screen lines: one per
  row, `ceil(length / cols)` for a row longer than the pane is wide. `auto`
  makes the browser use the height it last laid out once the chunk has
  been rendered; the estimate only covers chunks built and scrolled past in
  one frame (a burst or a catch-up). It follows a font or cell change by
  itself (`--cell-h`). It is exact for rows that do not wrap, which is
  almost all of MUME's output (MUME wraps at the NAWS width).
- **At the tail**, the flush pins the view to the bottom as before, and
  the resize observer now also watches the rows' container. A chunk near
  the view takes its real height in the rendering after the flush; the
  observer runs before that frame's paint and pins again.
- **Scrolled back, the pane anchors the view itself**, not the browser.
  `overflow-anchor` stays `none`. The pane holds one row at a fixed
  distance from the top of the view; the resize observer (the rows'
  container and the scroller) corrects `scrollTop` after any layout change
  and before the paint: chunks dropped at the top, chunks taking their real
  height, rows re-wrapping after a width change. The manual trim
  compensation is gone (the anchor covers it).
  - PgUp anchors on the row at the top (it ends at the bottom), PgDn on the
    row at the bottom. Steps faster than the frames carry the previous
    step's anchor, because the view in between was never rendered.
  - A user scroll (wheel, scrollbar, touch) anchors on the row at the top.
  - Two frames after a scroll, when the rows in view are rendered, the
    anchor moves to the row at the top: a step's anchor would otherwise end
    up outside the view, where its chunk stops being laid out.
- **Why not the browser's scroll anchoring** (the review's proposal): it
  worked in Chromium, but in Firefox a PgUp into chunks not laid out yet
  moved the view by the estimate's error (221 px in the e2e test), and a
  width change while scrolled moved the view by about 900 px in both
  engines. The browser picks its anchor after the newly visible chunk has
  taken its height, or picks the chunk itself. The pane knows which row
  the user was looking at.

## Consequences

- e2e (`tests/e2e/output.spec.ts`, Firefox and Chromium): 70 PgUp/PgDn
  steps through a 20 000-row scrollback built in one burst, with wrapping
  rows, each moving the row at the edge by exactly one page and not again
  after two more frames; fast PgUps land within a few rows of single steps
  and stay; 3 000 rows (15 trimmed chunks) while scrolled back leave the
  rows on screen in place; a width change keeps the tail at the tail and a
  scrolled view on rows it showed; a selection over 1 000 rows across
  off-screen chunks copies all of them.
- Firefox leaves chunks it skips out of `Selection.toString()`. A mouse
  selection makes its chunks relevant (rendered) before the copy at
  `mouseup`, so copying is unaffected; code that builds a selection and
  reads it in the same task would miss the skipped rows.
- Fast PgUps over chunks never rendered move by their estimated height:
  the landing row can differ by a few rows from single steps. Nothing that
  was painted moves.
- While scrolled back, each layout change costs one `getBoundingClientRect`
  pair in the observer, and each scroll event a binary search over chunks
  and rows (about 15 rect reads). Nothing runs at the tail.
- Find in page and selection work with `content-visibility: auto`
  (browsers render skipped content they need). The app has no find of its
  own.
- Timing measurements before and after are left to the quiet-machine pass
  of stage 8 part C; this change ships on the review's numbers above.
