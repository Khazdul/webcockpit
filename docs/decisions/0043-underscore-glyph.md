# 0043 — A higher underscore: the one-glyph face "WebCockpit Underscore"

- Status: Accepted
- Date: 2026-09-30
- Supersedes the fix in ADR 0042; amends ADR 0037 ("Underscores")

## Context

The cell is lower than DejaVu Sans Mono's ascent + descent (`cells.ts`
rounds it down so block glyphs tile), so a one-cell line box has negative
leading and the lowest descender row, where DejaVu draws `_` (y −483 …
−403 of 2048 units), falls outside the cell at many settings: clipped by
the row or field, or painted over by the next row. ADR 0037 fixed the
profile editor and ADR 0042 everything else by lifting all text one pixel
(`line-height: cell − 2px` in one-cell boxes, the input recipe, `wc-art`
marking of glyph art, the output pane drawn one pixel up). The lift moved
every glyph, and the tops of accented capitals (`Å Ä Ö É`) were cut far
more often. The owner rejected that side effect and asked for both:
visible underscores, and accents no worse than before the lift. ADR 0042
listed the alternative as open: a face with a higher `_`.

## Decision

- **The face.** `public/fonts/WebCockpitUnderscore.woff2` and
  `-Bold.woff2`, family "WebCockpit Underscore", hold one glyph each:
  DejaVu Sans Mono's `_` (regular / bold) with its outline moved up
  **278 font units** (y −205 … −125; bold −205 … −15). Advance (1233),
  width, stroke thickness, the glyph's hinting program (it measures from
  the origin, so it follows the move) with DejaVu's `fpgm` / `prep` /
  `cvt ` / `gasp`, and the hhea / OS/2 / head / post line metrics are
  DejaVu's, so the face cannot change a line box. 278 units is
  1.35 / 2.03 / 2.71 px at sizes 10 / 15 / 20 (9.97 / 14.95 / 19.93 px
  fonts); the bottom of `_` is then 1.0 / 1.5 / 2.0 px below the baseline
  instead of 2.35 / 3.53 / 4.70.
- **Built** by `scripts/build-underscore-font.py` (Python fontTools +
  brotli at build time, no npm or runtime dependency; reproducible byte for
  byte; how to run it is in the script and `public/fonts/README.md`).
- **Stack.** The DejaVu stack is `"WebCockpit Underscore", "DejaVu Sans
  Mono", monospace` (`FONTS.dejavu.stack`, and the default `--font-mono`
  in `ui.css`); the @font-face rules have `unicode-range: U+5F` and
  `font-display: block`. The JetBrains stack is unchanged: JetBrains
  Mono's own `_` sits inside the cell, and it only falls back to DejaVu
  for symbols it lacks, never for `_`.
- **Loading.** `FontInfo.overrides` lists the face for DejaVu;
  `fontFiles(id)` gives every file of a family. `preloadFont` preloads
  the face with DejaVu, `loadFont` (which `CellMetrics.update` waits on
  before the second measurement) loads it with `_`, so it is in before
  the grid is measured and painted. The cell is measured with `█`, which
  the face does not have; `--cell-w`, `--cell-h`, `--cell-ls` and
  `--font-size` are identical with and without it at all 256 measured
  settings.
- **Everywhere the stack goes.** The chrome, panes, output, input line,
  profile editor (LITE, EDITOR / CodeMirror, HELP) and the log player use
  `--font-mono`. The HTML replay export embeds the face (data URI, with
  its `unicode-range`) with the DejaVu family (`fontFiles` in
  `replay/export.ts`); it plays from file:// with the face loaded. The
  map pane draws its labels with the bundled Cantarell bitmap fonts, not
  the text stack; no other canvas uses `ctx.font`.
- **The lift is removed.** The CSS of ADR 0042 (`kit.css`, `ui.css`,
  `panes.css`, `player.css`), the art splitting in `grid.ts`, the `wc-art`
  marks in Statistics, Options and the export editor, and ADR 0037's
  editor rules (`cell − 2px` rows, the `.wc-ped-input` recipe, the
  Commands box padding) are gone; text sits where it did before either
  fix. Kept: `.wc-ped-help-text` stays a one-cell inline-block, since it
  carries the HELP line's width (its line-height is the cell).
- **Licence.** DejaVu's Bitstream Vera terms allow modified versions under
  a name without "Bitstream" or "Vera"; the face has its own name
  (name IDs 1–6), keeps the copyright notice (ID 0) and is listed in
  `public/fonts/README.md` and `THIRD_PARTY_NOTICES.md`.

### How the shift was measured

A probe renders every text surface with the app's stylesheets (the rows
of ADR 0042's survey, plus the output row above a row with an ANSI or
24-bit background) in Firefox and Chromium at pixel ratios 1, 1.25, 1.5
and 2, both fonts, sizes 10 – 25: 128 settings per browser. Each surface
is shot with `x_h_w` and with `x h w`; the difference in the `_` cells is
the visible underscore. A twin of each surface with nothing clipped or
covered (overflow visible, the other rows hidden) gives the full glyph.
"Whole" = at least 99 % of the twin's ink; "in cell" = no ink below the
cell. Accents: the same with `ÅÄÖÉ` against `AAOE`.

Firefox ignores a context's `deviceScaleFactor` on this cross-origin
isolated page (`devicePixelRatio` reads 1), so ADR 0042's "same at every
pixel ratio" Firefox numbers were all at ratio 1. The probe and the tests
now set Firefox's ratio with the `layout.css.devPixelsPerPx` pref
(`tests/e2e/dpr.ts`).

Settings (of 128) where some surface does not show `_` whole, by raise:

| Raise (units) | 0 | 100 | 120 | 140 | 160 | 180 – 200 | 240 | 250 – 275 | 278 |
|---|---|---|---|---|---|---|---|---|---|
| Firefox | 61 | 24 | 16 | 10 | 8 | 5 | 3 | 1 | 0 |
| Chromium | 38 | 3 | 3 | 3 | 0 | 0 | 0 | 0 | 0 |

From 160 units only the output row above a background row is left: the
next row's background is its inline box (the font's content area, taller
than the cell), which reaches up into the row above. The last setting to
clear is Firefox, ratio 1, DejaVu 10; 272 and 275 still lose part of it
there, 278 does not (runs from 240 up were Firefox / DejaVu only; the
final 278 run covers everything). Zoomed shots of `x_h_two`, `_show_class`
and `a_g_j` at 10, 15 and 20 in both browsers keep a clear gap between
`_` and the baseline of letters without descenders; at 10 px the gap is
one pixel.

### Before / after

Underscores, lost / partly hidden / whole but (partly) below the cell,
settings of 128: before = no lift, no face (the state before ADR 0037 /
0042); lift = ADR 0042's CSS; after = this ADR.

| Surface | before FF | before Cr | lift FF | lift Cr | after FF | after Cr |
|---|---|---|---|---|---|---|
| Kit row: text, list row, row above the band, band, band under band, selected button | 20–22 / 0–16 / 0 | 1–3 / 19–26 / 0 | 0 / 0 / 0 | 0 / 0 / 0–12 | 0 / 0 / 0 | 0 / 0 / 0 |
| Kit row, bold (title, menu row) | 3 / 20 / 0 | 1 / 26 / 0 | 0 / 2 / 0 | 0 / 0 / 12 | 0 / 0 / 0 | 0 / 0 / 0 |
| Kit text field | 20 / 16 / 0 | 1 / 2 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| Output row with a row below (also with its own background) | 0 / 0 / 36 | 0 / 0 / 10 | 0 / 0 / 48 | 0 / 0 / 12 | 0 / 0 / 0 | 0 / 0 / 0 |
| Output row above a background row | 43 / 18 / 0 | 8 / 28 / 0 | 50 / 10 / 0 | 8 / 23 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| Output: last row, last row of a chunk | 22 / 14 / 0 | 1 / 26 / 0 | 0 / 0 / 48 | 0 / 0 / 12 | 0 / 0 / 0 | 0 / 0 / 0 |
| Input line: field, password mask | 20 / 16 / 0 | 1 / 2–26 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| Pane rows (also last, above a background) | 22 / 14 / 0 | 1–3 / 24–26 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| UI message, last row | 23 / 18 / 0 | 1 / 22 / 0 | 0 / 0 / 42 | 0 / 0 / 13 | 0 / 0 / 0 | 0 / 0 / 0 |
| Comm header, player header / tip rows, tail bar | 22–24 / 0–14 / 0 | 1–3 / 19–26 / 0 | 0 / 0 / 0 | 0 / 0 / 0–12 | 0 / 0 / 0 | 0 / 0 / 0 |

Accent marks of `ÅÄÖÉ` whole (settings of 128). After is pixel-identical
to before at all 256 settings, on every surface:

| Surface | before FF | before Cr | lift FF | lift Cr | after FF | after Cr |
|---|---|---|---|---|---|---|
| Kit row | 77 | 62 | 12 | 11 | 77 | 62 |
| Kit band row | 94 | 82 | 128 | 77 | 94 | 82 |
| Kit title (bold) | 60 | 61 | 5 | 8 | 60 | 61 |
| Kit text field | 77 | 99 | 12 | 11 | 77 | 99 |
| Input line | 77 | 101 | 12 | 11 | 77 | 101 |
| Output, first row | 82 | 70 | 15 | 13 | 82 | 70 |
| Output row under a background row | 128 | 128 | 128 | 128 | 128 | 128 |
| Pane row | 77 | 60 | 12 | 11 | 77 | 60 |

"Whole" here counts even the faintest anti-aliased row, so it is stricter
than ADR 0042's count (88 / 80 before, 44 / 17 with the lift). The "lift"
columns reapply ADR 0042's stylesheets over this build's and are close
to, not exactly, the committed state.

### Tests

- `tests/e2e/underscores.spec.ts`: the Profiles list and rename field, the
  cockpit (last output row, input line, Timers row, UI message, ESC
  header), an output row directly above an ANSI and a 24-bit background
  row; `_` ink counted inside the cell only; pixel ratios 1 and 1.5 in
  both browsers (Firefox with the pref). Accents: the marks in a kit row,
  the input line and an output row are no worse than the same text drawn
  as a plain one-cell line (the pre-lift geometry); with ADR 0042's CSS
  reapplied this fails in both browsers. The face changes no cell size,
  font size, letter-spacing or row height (face loaded vs blocked).
- `tests/e2e/editor.spec.ts`: LITE as before, and EDITOR (CodeMirror)
  with the cursor on the next line, so its highlight is the background
  right below.
- `tests/e2e/replay.spec.ts`: the exported file embeds both faces with
  `unicode-range` and they load from file://.
- `tests/unit/font-glyphs.test.ts`: the face maps only U+005F, its line
  metrics and advance equal DejaVu's, it is first in the DejaVu stack
  only, and `fonts.css` declares it with `unicode-range` and
  `font-display: block`.

## Consequences

- `_` in DejaVu Sans Mono is drawn 1.35 – 2.7 px higher than DejaVu draws
  it, closer to the baseline (one pixel of gap at size 10). JetBrains
  Mono is unchanged.
- Text is back where it was before ADR 0037: accents are exactly as
  before the lift; the lift's seams at band rows and its `wc-art` rule
  for new glyph art are gone.
- Two more small requests per page load (about 2 KB each), preloaded
  and loaded with DejaVu; the HTML replay grows by about 5 KB.
- A change to the DejaVu files means rebuilding the face.

### Open

- Measured on Linux (FreeType, headless). Windows (DirectWrite) and
  macOS (Core Text) round and hint differently; 278 units leaves a small
  margin only at the tightest setting (Firefox, ratio 1, DejaVu 10, the
  row above a background row).
- The next row's background still paints over the lowest pixel of other
  glyphs with descenders (`g j p q y`) in the row above; unchanged from
  before.
- The top of accented capitals is still cut at many settings, as it
  always was: the cell is lower than the font.
