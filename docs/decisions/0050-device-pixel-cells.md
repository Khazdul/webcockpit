# 0050 — Device-pixel cells

- Status: Accepted
- Date: 2026-10-01
- Builds on ADR 0010 ("Fonts and cell grid"), ADR 0011 (whole-px
  advance), ADR 0049 (more fonts, cover height, `cellMargin`, `wholePx`,
  `halfUpPx`, clipped rows)

## Context

The cell was whole CSS px. At device pixel ratio 1 that is whole device
px, and the seam sweep of ADR 0049 is clean there. At other ratios it is
not: at 125 % and 150 % (common Windows scalings) a cell of 9 CSS px is
11.25 or 13.5 device px, so column and row edges fall between device
pixels and runs of `█` show seams in every family, DejaVu Sans Mono
included, in both browsers. At 200 % Chromium still showed seams for
JetBrains Mono (it draws the font at the device size rounded to whole
px) and 1-device-px gaps in `│` for a few families. The owner plays in
Firefox at 200 % (clean after ADR 0049) and approved a fix for the other
ratios on the condition that ratio-1 cells stay exactly as they are.

What the sweep showed about the engines (Linux):

- **Gecko (Firefox)** lays out fractional advances and baselines and
  paints them on device pixels: a cell of whole device px is enough.
- **Blink (Chrome)** rounds font ascent and descent to whole CSS px, so
  at 200 % the baseline can be a device px off where the glyph is drawn;
  it draws the font at the device size rounded to whole px and rounds
  advances (to CSS px at some ratios, to device px at others). Whole
  device px cells that are half CSS px tall left seams at 200 %, which
  whole CSS px cells with a little more margin do not.

## Decision

`nominalCell(a, dpr, grid)` (src/theme/cells.ts) starts from the ratio-1
cell (the CSS px rules of ADR 0010/0011/0049, unchanged) and fits it to
the device pixels by text grid (`textGridOf(doc)`):

- **Ratio 1, any engine:** the ratio-1 cell, exactly. A unit test checks
  every family × size 6–32 against a recorded table
  (`tests/unit/fixtures/cells-dpr1.json`).
- **`device` (Gecko, any other ratio):** width `w × dpr` rounded to whole
  device px; the font size whose advance is exactly that; height rounded
  down from the block height less the family margin, in device px. The
  cell is fractional CSS px (11.2 px at 125 %), whole device px.
- **`css` (Blink at a whole ratio, e.g. 200 %):** the ratio-1 width; for
  the families Chrome draws at whole px (`wholePx`, `halfUpPx`) a font
  size whose device size is whole or just over a half, so the block is
  at least as wide as the cell; the height less `CSS_GRID_MARGIN`
  (0.5 px) for the rounded baseline.
- **`blink-device` (Blink at a fractional ratio):** whole device px as on
  the `device` grid, with a font size Chrome draws at least as wide as
  the cell but under half a device px wider (trying the next width when
  none fits), and below 150 % the extra 0.5 px of height margin (it
  removed 1-px `│` gaps at 125 %; at 150 % it made seams instead).
- The engine is told apart by `CSS.supports('-moz-appearance', 'none')`
  (Gecko). WebKit gets Blink's grids (untested).
- `measureCell` still measures the real advance and corrects up to
  0.5 CSS px with letter-spacing (Chrome at 150 % gets +0.33 px: its
  advance is 11 CSS px, the cell 11.33).

**Ratio changes** (browser zoom, a window moved to another screen):
`CellMetrics` listens to a `(resolution: Xdppx)` query and to `resize`,
and re-measures when `devicePixelRatio` changes.

**Fractional cells in the code:** cell counts from a size now use
`Math.floor(size / cell + 1e-6)` (output pane, kit grid, player,
spotlight; the cockpit already did); the kit's centring offsets are
whole device px. Mouse hit-testing divides by the cell and needs no
change. Every other consumer multiplies cells by the cell size, which
stays on device pixels.

## Results

Seam sweep after the change (Linux, headless Chromium and Firefox),
every family, sizes 6–32: output-pane rows of `█`, `│ ║`, `─`, halves
and quadrants; kit rows with the bold scrollbar thumb; pane rows with
`│ ║`. Screenshots of the sweep and of the running app (cockpit and ESC
menu at 125 %, 150 %, 200 %) were checked by eye. Not counted below: thin
box lines at sizes ≤ 11 that are faint but unbroken (as at 100 %), and
the small-size underscores of ADR 0049.

| Ratio | Firefox | Chromium |
|---|---|---|
| 100 % | clean (unchanged) | clean (unchanged) |
| 125 % | clean | seams or `│` gaps at some sizes: Agave 11–12, 19–20, 27–28; Anonymous Pro 11, 22–24, 27–28; Cascadia 30–31; DejaVu 8–12; Fantasque 7–8, 13–14, 27–28; Go Mono 10, 28–30; Hack 10, 13–14, 20, 25; IBM 3270 25–26; IBM Plex Mono 10, 30; JetBrains Mono 10–12, 30; mononoki 10–11; Lucida 10. Clean: Fira Code, Hermit, Inconsolata, Noto Sans Mono |
| 150 % | clean (row lines at 252/255 at some sizes, not visible) | clean but: Agave 6, 9–10, 13–14, 17–18, 21–22, 25–26; DejaVu 6–9, 15, 21–24; Fantasque 29; Go Mono 15, 25–27; Hack 6–7; IBM 3270 12–13, 16–17; IBM Plex Mono 15, 25; JetBrains Mono 6–7, 15, 23–25; Lucida 24–28 |
| 200 % | clean | clean but Lucida Console `│` gaps at 11–12, 16–17, 21–23, 26–28 |
| 175 % (spot) | output pane clean; kit and pane rows seam at most sizes | seams at many sizes |

Before the change, 125 % and 150 % seamed at most sizes of every family
in both browsers, and Chromium at 200 % seamed for JetBrains Mono at a
third of the sizes.

Why the rest is left: Chrome on Linux rounds the advance to whole CSS px
at some ratios and to device px at others, draws at the rounded device
size, and rounds the baseline to CSS px; no single cell fits all three
at every size. Firefox at 175 % cannot place whole device px exactly
(its layout unit is 1/60 CSS px; 1/1.75 px is not a multiple), which the
clipped kit rows show.

## Consequences

- Ratio 1: no change for anyone.
- Firefox at 200 % (the owner): widths unchanged; heights and font sizes
  can differ by a device px (the height is now rounded in device px).
- Firefox at 125 % / 150 %: cells are whole device px, so a size setting
  gives a slightly different cell (within a device px of the old one
  in width, up to two CSS px in height).
- Chromium at 200 %: rows up to a CSS px lower (the extra margin).
- Chromium at 150 %: letters spaced up to a third of a CSS px wider (the
  letter-spacing that pads Chrome's rounded advance to the cell).
- Chromium at 200 %: font sizes of the `wholePx` / `halfUpPx` families
  can be a quarter px larger (whole device px).
- Still imperfect: the Chromium cases in the table, and Firefox's kit
  rows at 175 %. Windows and macOS were not tested; their Chrome lays
  text out differently from Linux (subpixel positioning).
- Runtime ratio changes: checked in Chromium with a DevTools device
  scale change (cells re-measured: 9 → 8.8 px at 125 %). Under
  Playwright's own viewport emulation the query event did not fire; the
  `resize` fallback covers real zoom, which resizes the viewport.
