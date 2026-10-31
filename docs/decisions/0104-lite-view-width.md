# 0104 — Lite view fills its frame; no hints panel

- Status: Accepted
- Date: 2026-10-31
- Amends: ADR 0037 ("Full width" and "Edge to edge": LITE, the title
  and the toggle on the centred 77-cell column), Inv §5.3 (sizes) and
  §5.6 (the hint lines, the 8-cell pattern column)
- Related: stage 30 (`docs/stages/30-fixed-menu.md` S8, "30b build
  plan"), ADR 0103 (windows), ADR 0075 §3.2 (phone: editors drop their
  40-cell floor), ADR 0015 (profile editor)

## Context

Until now the profile editor's LITE view was a centred column of at most
77 cells (`FULL_W`, Inv §5.3): a 38-cell entry list, a 3-cell gap and a
35-cell detail panel, with the Commands box capped at 10 rows and a
`─── Hint ───` panel of two example lines under it. EDITOR and HELP
already span the frame (ADR 0037). In 30b the editor moves into a
resizable window (ADR 0103), and the owner asked (S8, 2026-10-31) that
LITE fill the window's width: the list keeps a moderate width, the
detail panel takes the rest, so Pattern and Commands grow wider, and
Commands also takes the remaining height. The hints panel goes away
(HELP explains); the short key row at the bottom stays.

A first build kept the list at 38 cells and gave the detail panel the
rest, with the kind row at the column's left edge. The owner found the
boxes huge and the list too narrow, and asked for halves and a centred
kind row (round 2, same day); this ADR records the result.

## Decision

- **One rule, everywhere the editor runs:** the window, the start page
  and the phone's ESC menu. The geometry is a pure function,
  `liteGeometry(cols, phone)` in `src/editor/logic.ts`, unit-tested.
- **The column** is the frame less one cell on each side, as before, but
  up to `LITE_MAX_W` = 160 cells instead of 77. A wider frame (the start
  page on a very wide screen) centres the 160-cell column, so the boxes
  never get absurdly wide. The desktop 40-cell floor and the phone's
  missing floor (ADR 0075 §3.2) are unchanged.
- **List and detail in halves** from `FULL_W` up: the list (its text
  plus its scrollbar cell) and the detail panel split the column less
  `LIST_GAP` in two, the odd cell to the detail panel. At 77 cells that
  is a 36-cell list and a 37-cell detail panel (was 38 and 35); at 160,
  77 and 79. Below `FULL_W` the old rule holds (detail 45 % of the
  column, at least 24 cells; the list the rest), so narrow frames and
  the phone lay out exactly as before. The switch at 76 → 77 cells moves
  the boundary by 2–3 cells (list 38 → 36, detail 34 → 37); that is
  small enough not to blend the two rules.
- **The list's own columns in halves:** the pattern column is
  `max(PATTERN_COL, floor((list - 1) / 2))` (`patternColumn` in
  `logic.ts`, used by `rowText` and the list header), the Commands
  column the rest after one space. The 8-cell `PATTERN_COL` stays as the
  floor, so a list under 19 cells (the phone's 11) is unchanged; at 36
  cells the pattern gets 17.
- **The kind row** is centred over the column. From `FULL_W` up it keeps
  its full-size buttons (13 cells, 3 apart); below, the buttons shrink
  and centre as before. Left-aligned (the first build) it did not match
  the centred title.
- **The title row** stays on the column: the title centred, the view
  toggle ending at the column's right edge, which is now the detail
  panel's right edge. The toggle still does not move between views. The
  EDITOR footer's `Ln, Col` still ends at the column's right edge.
- **Commands takes the height that is left**: the body rows less what
  the panel already used, the box's label and borders, and two note
  rows. The 10-row cap (`BODY_MAX_ROWS`) is gone, and the box no longer
  grows with its content: it is always that height (at least one row), so
  it does not jump while typing and the note rows stay put. Its
  scrollbar shows when the text is taller than the box.
- **No hints panel.** `HINTS` and the `─── Hint ───` block are removed.
- **Two note rows under the detail panel's last part** (the Commands
  box, or the colour grid for highlights): the validation message in red
  (`wc-ped-msg`), then the entry warning in yellow (`wc-ped-warn`),
  wrapped to the panel's width. The warning gets the rows the message
  leaves; a longer warning ends in `…` on its last row. Both used to sit
  in the hint area (the warning replaced the hints); they are not hints,
  so they stay.
- **Highlights** have no Commands box: the style checkboxes and the
  Text / BG grid stay left-aligned under the Pattern box, which grows
  with the panel. The grid is a fixed 32 cells; it is a form and reads
  well left-aligned at any width.

## Consequences

- On a wide window a one-line command sits in a tall, wide box; that is
  what the owner asked for (room to write long command chains).
- The Inv §5.3 sizes `KIND_W`, `KIND_GAP` and `LIST_GAP` move from
  `frame.tsx` to `logic.ts` beside `FULL_W` and `LITE_MAX_W`;
  `DETAIL_W` (35) and `BODY_MAX_ROWS` (10) are gone.
- The full-size (77-cell) layout changes slightly too: list 36, detail
  37, pattern column 17.
- The e2e assertion that LITE left room at the frame's right edge
  (ADR 0037 "full width") now checks the left margin instead; the manual
  is checked against the old 77-cell width.
- On a phone the Commands box also fills the height (it was at most 10
  rows); its width is unchanged.
