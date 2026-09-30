# 0037 — Profile editor: HELP view; underscores in LITE

- Status: Accepted
- Date: 2026-09-30
- Amends: ADR 0015 (P3 — profile editor)

## Context

Two things from the owner. A player who opens the profile editor has no
description of the language at hand: About points to the tt++ manual,
which describes commands WebCockpit does not run and says nothing of
what differs here. And in the LITE view the alias `_show_class` showed
as ` show_class`; the owner also did not find it in the EDITOR view.

## Decision

### HELP view

- The toggle in the title row is `LITE  EDITOR  HELP` (`VIEWS` in
  `src/editor/logic.ts`; `TOGGLE_W` is derived from it, so the title
  centring follows).
- HELP is a read-only manual, not a third editing mode. `mode` stays
  `lite` or `editor` underneath: the lite state is kept as it is and the
  CodeMirror buffer stays mounted, hidden, so its text, cursor and undo
  history survive. Going to HELP and back changes nothing. Walking the
  toggle with ← / → passes EDITOR and flips through the usual
  serialise / parse path.
- ESC is the same in all three views: the text to save is the buffer or
  the serialised document, whichever is underneath, with the same
  "Apply changes to your profile?" flow while live.
- Keys. Toggle zone: ← / → step through the three views (no wrap), Enter
  or ↓ enters the manual. Tab cycles toggle ↔ manual. In the manual:
  ↑ / ↓ one row (↑ on the first row goes to the toggle), PgUp / PgDn and
  Enter / Space a page, Home / End, the mouse wheel three rows, and
  `n` / `p` jump to the next / previous heading. PgUp / PgDn, Home / End
  and `n` / `p` also work from the toggle. The scrollbar track pages.
- Look: the kit's own pieces. Rows on the cell grid, the 1-cell `█` / `░`
  scrollbar, headings in C_TITLE as in About, group titles in C_SECTION,
  syntax lines bold, examples indented four cells and coloured by the
  editor's tt++ lexer (`syntax.ts`, `wc-syn-*`). Text wraps to the frame
  width; a long example breaks after a space and continues two cells in.

### The manual is data, checked against the engine

- `src/editor/help.ts` holds the manual as sections (heading, the
  commands it covers, syntax lines, paragraphs, examples) and lays it out
  into rows. It lives in the editor's lazy chunk.
- It describes what `src/script/engine` does, not what tt++ does.
  `tests/unit/editor-help.test.ts` loads every example into a real
  engine (or types it, for input-line examples) and expects no warning
  and no message; an example's `check` lists what is typed, received or
  pressed and exactly what must be sent and shown. The test also
  requires a section for every command of tier `must`, `should` or
  `client` in `src/script/commands.ts`, nothing beyond those, alphabetical
  order starting with `#action`, and every engine event named. The
  "Not supported" section is generated from the command table (tiers
  `unsupported` and `inert`, grouped by their hint).
- `_send` is not mentioned (ADR 0036); a test keeps it out.
- The `#un…` forms are folded into their command's section. `#else` and
  `#elseif` have short sections of their own that point to `#if`.

### Underscores

- **Cause.** The cell is lower than the font's ascent + descent
  (`cells.ts` rounds it down so block glyphs tile), so a line box of one
  cell has negative leading. Firefox takes the odd pixel from the bottom;
  Chromium does at some fractional device pixel ratios (125 %, 150 %).
  The lowest descender row then lies outside the cell, and that row is
  where DejaVu Sans Mono draws `_`. It was clipped by `.wc-line`
  (`overflow: hidden`), by the text field's own box, or painted over by
  the cursor band of the next row. Letters kept their shape, so
  `_show_class` read as ` show class`. Measured before the fix (2
  browsers × 4 pixel ratios × 2 fonts × 16 sizes): Firefox lost the
  underscores at 52 of 128 settings, the default (DejaVu 15) among them;
  Chromium at 6 of 128, none at pixel ratio 1.
- **Fix** (`editor.css`). Text that shows entry characters — list rows,
  the title, the Key cell, warnings, the footer, the manual — gets
  `line-height: cell − 2px` in a box that is still one cell high, which
  puts the baseline one pixel higher in both engines. The Pattern field
  gets `line-height: cell + 2px` with 2 px bottom padding: a single-line
  field centres its line in the content box and clips at the line box,
  and Firefox ignores a line-height below `normal` there. The Commands
  box gets one more pixel before its clip. Scrollbar cells and box
  borders keep the full line-height, so block and box glyphs tile as
  before.
- **Test.** `tests/e2e/editor.spec.ts` screenshots the Pattern field, the
  list rows around the cursor band and the Commands box, and counts the
  lit pixels in the underscore cells, in both browsers, at pixel ratios
  1 and 1.5, in both fonts and at several sizes. It fails without the
  fix.
- **EDITOR.** Not reproduced: the buffer equals the stored text byte for
  byte for the bundled khazdul profile, and the alias line is rendered
  when scrolled to. A test now locks both. CodeMirror renders only the
  lines in view, so the browser's find-in-page cannot find a line further
  down; the editor has no search of its own. That is the likely reason
  the alias was not found, and it is left open.

## Consequences

- The same clipping exists wherever the chrome shows text in `.wc-line`
  rows outside the editor (a profile name with `_` in the Profiles list,
  for example). This ADR fixes the editor only; a general fix belongs in
  the kit and needs a look at block-glyph tiling.
- A new engine command needs a manual section, or the drift test fails.
- The editor chunk grows by the manual's text.
