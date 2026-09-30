# 0042 — Underscores in the kit, the panes and the input line

- Status: Accepted
- Date: 2026-09-30
- Amends: ADR 0037 (the editor-only fix; its first Consequence is closed)

## Context

ADR 0037 found why `_show_class` read as ` show class` in the profile
editor and fixed it there. The cause is general: the cell is lower than
the font's ascent + descent (`cells.ts` rounds it down so block glyphs
tile), so a one-cell line box has negative leading, and the lowest
descender row, where DejaVu Sans Mono draws `_`, can fall outside the
cell. The owner asked to go over the rest: profile names and other text
outside the editor.

### Survey

A probe rendered every text-bearing structure with the app's own
stylesheets and counted the lit pixels in the underscore cells: Firefox
and Chromium, device pixel ratios 1, 1.25, 1.5 and 2, both bundled fonts,
sizes 10 – 25 (128 settings per browser). "Lost" = the underscore is not
visible at all. Before the fix:

| Surface | Firefox | Chromium |
| --- | --- | --- |
| Kit row `.wc-line`: plain text, list row, the row above a band, the band row, a selected button, last row of a frame | 48 | 1 – 6 |
| Kit row, bold text (titles, the selected menu row) | 12 | 1 – 3 |
| Kit text field `.wc-field` (profile name, export title / comment) | 48 | 1 |
| Input line: the field, the password mask | 48 | 1 |
| Output row with a row below it | 0 (drawn over the next row) | 0 |
| Output: the last row of the pane, and the last row of every chunk | 48 | 1 |
| Output row with a coloured-background row below it | 56 | 33 |
| Output tail bar | 48 | 6 |
| Pane row `.wc-prow` (Character, Timers, Group) | 48 | 1 – 4 |
| Comm / UI message: the last row of the list | 48 | 2 |
| Comm header | 48 | 1 |
| Pane border title | 0 (not clipped) | 0 |
| Log player: header, marker tip rows | 48 | 3 |

- In Firefox the 48 are the same at every pixel ratio: DejaVu Sans Mono
  at sizes 10 – 17, 20 and 23 – 25, the default (15) among them.
  JetBrains Mono is never affected.
- In Chromium nothing is lost at pixel ratio 1 except under a
  background row in the output; the rest is at 1.25 and 1.5.
- Every chrome frame is built from `.wc-line` rows and the kit's text
  field, so the first three rows of the table cover the Profiles list and
  its name prompts, the start page, the ESC menu and its header, all
  Options pages, History, Statistics, the export frames and About.

## Decision

Text sits one pixel higher than a plain one-cell line would put it;
every row is still exactly one cell high; glyph art renders as before.

- **Kit rows** (`kit.css`). `.wc-line` takes its line-height from
  `--line-lh`, which `.wc-chrome` and `.wc-overlay` set to
  `cell − 2px`. That moves the baseline up one pixel in both engines
  (`cell − 1px` was measured too: Firefox still lost 12 of 128).
  Text is the default, so new text in a frame is covered without
  marking it.
- **Bands.** `.wc-tr` and `.wc-btn` are inline-blocks one cell high,
  top-aligned. An inline box's background is the font's content area,
  which the raised baseline would move off the cell.
- **Glyph art.** Block and box glyphs that continue into the next row
  keep `line-height: cell` in a line box of their own (an inline-block
  one cell high, top-aligned), which renders them pixel for pixel as
  before. The scrollbar cells, `.wc-box`, `.wc-swatch` and the banner
  rows have it built in; elsewhere the class is `wc-art`, on a span or on
  a whole `.wc-line` (Statistics marks its block / box segments by
  content; the palette swatches and the export editor's bar and overview
  map carry the class).
- **Text fields.** `input.wc-field` and the input line's field get
  `line-height: cell + 2px` with 2 px bottom padding, as the editor's
  Pattern field (ADR 0037). `.wc-input` has `cell − 2px`, so the prompt,
  the block caret's character and the password mask follow the field.
- **Pane rows** (`panes.css`, `grid.ts`). `.wc-prow` has `cell − 2px`
  and every styled run is a one-cell inline-block. `CellLine.toElement`
  splits runs of block / box glyphs (U+2500 – 259F) from text and gives
  them `wc-art`.
- **Output pane** (`ui.css`), CSS only, no layout change. Rows are not
  clipped one by one, so `_` showed over the next row; it was lost on
  the pane's last row and on the last row of each chunk (paint
  containment). `.wc-rows` and the partial row are drawn one pixel up
  (`position: relative`), and `.wc-chunk` has `overflow-clip-margin:
  1px`. Row heights, scroll height and the chunk containment are
  unchanged.
- **Comm / UI lists.** `.wc-alist-stack` sits one pixel above the
  bottom edge. The Comm header, the player header and the player's tip
  rows have `cell − 2px`.
- **The editor is untouched.** `.wc-ped` sets `--line-lh` back to the
  cell, so its own rules (ADR 0037) work as before.

After the fix the probe loses no underscore in any kit, field, input
line, pane or player structure at any of the 256 settings. The glyph-art
structures are pixel-identical to before at all 256 settings, and so are
the art elements of the start page, Options, About, the cockpit and the
ESC menu in a before / after comparison of the real frames.

`tests/e2e/underscores.spec.ts` measures the Profiles list (the row
above the band, the band row, the row below), the rename prompt and its
field, the last output row, the input line, a Timers row, the last UI
message and the ESC menu header, in both browsers at pixel ratios 1 and
1.5, in both fonts and at several sizes. With the old metrics every one
of them fails in Firefox.

## Consequences

- Text in the chrome, the panes and the input line is one pixel higher
  in both browsers, at every setting, also where nothing was clipped
  (Chromium at pixel ratio 1). The top of the cell loses a pixel row:
  the marks of capital letters with accents (`Å`, `É`) are cut more
  often. Without the fix 88 (Firefox) and 80 (Chromium) of 128 settings
  showed them whole; now 44 and 17. The cell is simply lower than the
  font; underscores were judged the more important.
- A new block or box glyph that must join the rows above and below
  needs `wc-art` (or one of the kit's art classes). Without it the glyph
  sits one pixel high and shows a seam.
- Two band rows directly above each other show a slightly darker seam
  in Chromium at pixel ratios 1.25 and 1.5 than before (16 of 128
  settings); the rows are at fractional device pixels there. The kit has
  one band per list.

### Open

- **Output row above a row with a background colour.** The next row's
  background (the font's content area, not the cell) paints over the
  underscore: Firefox 56, Chromium 27 of 128 settings, the default
  among them. Limiting the background to the cell needs a box per run,
  which costs layout in the output pane; not done.
- **Output tail bar** in Firefox at DejaVu 10 (its text is fixed and has
  no underscore).
- **Lifting only where needed.** `cells.ts` could measure whether the
  descent ends outside the cell and publish the lift as a custom
  property, which would leave the unaffected settings as they were
  (accents included). It needs a re-measure when the pixel ratio
  changes.
- **The font.** A one-glyph face for `_` placed higher, ahead of the
  bundled families, would fix every surface with no CSS at all,
  CodeMirror and coloured output rows included, at the price of a
  changed glyph and a font build step.
- **The editor's own rules** (`.wc-ped-list .wc-tr`, `.wc-ped-title`,
  `.wc-ped-warn`, `.wc-ped-footer`, `.wc-ped-input` in `editor.css`)
  duplicate the kit's now. They can go once the editor drops its
  `--line-lh` override and marks its scrollbar, border and column cells
  as art.
- Seen while measuring, not changed: in Chromium at the default size a
  column of `█` in clipped kit rows has a faintly lighter pixel row at
  each row boundary (the block glyph ends 0.26 px above the cell's
  bottom edge there).
