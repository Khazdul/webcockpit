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
  Removed in stage 25 (2026-10-07): the manual no longer lists the
  commands it does not run. `#help <command>` and the EDITOR's wavy
  underline with its note still say why for each one.
- `_send` is not mentioned (ADR 0036); a test keeps it out.
- The `#un…` forms are folded into their command's section. `#else` and
  `#elseif` have short sections of their own that point to `#if`.

### Underscores

Superseded by ADR 0043 (2026-09-30).

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

### Navigation menu (2026-09-30)

The owner asked for a menu to the left of the manual that jumps to a
section ("the syntax for #highlight").

- **Content.** One entry per section in manual order, with the group
  titles (Basics, Commands) as dim labels that cannot be selected.
  `helpMenu()` in `help.ts` builds it from the same section list as the
  manual; the column is as wide as the longest heading plus a cell on
  each side (19 cells today).
- **Layout** (`helpFrame`). The menu goes in the left margin: menu text,
  one scrollbar cell, a gap of 3, then the manual, 23 cells in all. From
  125 columns the manual is the same centred 77-cell column as LITE and
  EDITOR. With less margin the menu stays at cell 1 and the manual moves
  right, keeping its width down to 102 columns; below that it narrows.
  Under 77 columns (a manual column of less than 52 cells) the menu is
  hidden and the view is as before. The title and the toggle do not
  move, so the buttons stay under the pointer when the view changes; in
  the 79 – 124 column range the manual therefore ends up to 11 cells to
  the right of the toggle. The same rule serves the start page and the
  80 % ESC box.
- **Keys.** The menu is a zone (`menu`): Tab cycles toggle → menu →
  manual. In the menu ↑ / ↓ move to the previous / next section and the
  manual follows at once, as the LITE list shows the entry under its
  cursor (↑ on the first entry goes to the toggle); → or Enter / Space go
  to the manual, ← in the manual goes back. PgUp / PgDn, Home / End and
  `n` / `p` scroll the manual from every zone. ↓ / Enter on the toggle
  still enter the manual, which is what lies below it. A click on an
  entry jumps and focuses the menu; the wheel over the menu scrolls the
  menu alone, and its scrollbar track pages.
- **The mark.** The entry of the section on the manual's top row has the
  list band: grey, amber while the menu has focus. It follows every
  scroll, and the menu scrolls to keep it (and the group label above a
  group's first entry) in view. The last sections cannot reach the top
  row; a section jumped to (menu, `n`, `p`) stays marked until the manual
  is scrolled by other means, and is restored to the top row when a new
  width lays the manual out again.
- `n` / `p` now step by section (`helpStep`, replacing `helpJump`), so
  they agree with the mark at the end of the manual; elsewhere they
  behave as before.
- Menu rows use the list rows' line-height fix (see Underscores).

### `#help` on the input line (2026-09-30)

The owner: `#connect`, `#disconnect`, `#reconnect`, `#replay` and
`#runlog` are covered by the menus and are not to be shown in help; and
`#help alias` on the input line should print the manual's section.

- **Five commands left out.** Their sections are gone from the manual,
  and with them from the navigation menu; the manual text does not name
  them. The commands work as before. The drift test now requires a
  section for every `must` and `should` command plus `help`, and asserts
  the five are absent. This replaces "every command of tier `must`,
  `should` or `client`" above.
- **Topics.** A section may carry `topics`: words for `#help <topic>`.
  The Basics sections have one each (`braces`, `arguments`, `variables`,
  `patterns`, `priorities`, `colours` / `colors`, `keys`, `typing`,
  `saved`) and the closing section has `unsupported`.
- **`#help`** lists the command headings and the first topic word of each
  section in columns, from the manual data, then one paragraph: `#help
  <command>` or `<topic>` shows the details, HELP in the profile editor
  has the whole manual. "While disconnected, Enter reconnects." is kept
  from the old list. `HELP_LINES` in `app.ts` is gone.
- **`#help <word>`** (`src/app/help-command.ts`, `resolveHelp`): a topic
  written in full; else a command, resolved by `resolveCommand`, so
  `al`, `#alias` and `unalias` all give the `#alias` section (the
  section that `covers` the command); else the start of a topic, two
  letters or more (`col`). With a `#` the word is only a command. A
  command the engine does not run gives one system line with the command
  table's hint; one of the five gives "has no help entry; it is handled
  from the menus"; anything else points to `#help`.
- **Same layout, same colours.** The section is laid out by `helpLayout`
  (new option `groups: false`: no group title) at the game pane's width
  less one cell, at most 100; the list uses the same row kinds. Each row
  becomes an output pane row `wc-help wc-help-<kind>` with the lexer's
  `wc-syn-*` spans. `ui.css` gives the row kinds the tokens the HELP view
  uses (`--c-title`, `--c-active` bold, `--c-body`, `--c-hint`,
  `--c-item`), and the `wc-syn-*` rules moved there from `editor.css`, so
  there is one definition and the colours follow the theme. Style runs
  were not used: a run carries a palette index or an RGB value, not a
  theme token.
- **Not game text.** The rows go to the pane through
  `OutputPane.pushStyled`, not over the bus. `#showme` lines are
  `text.display` lines and run actions, substitutes and highlights;
  system lines are `sys.message`. Help follows the system-line
  convention one step further: no bus event at all, so no action,
  substitute, gag or highlight sees the rows and nothing records them
  (capture records `text.line`; neither `#showme` nor system lines are
  captured either). They queue with the game lines, so they land in
  order, above an open prompt. One-line answers (not supported, unknown)
  are ordinary `[SYSTEM]` lines.
- **Lazy.** `help.ts` and `help-command.ts` are their own chunks; `app.ts`
  loads them with a dynamic import on the first `#help`, and a promise
  chain keeps several `#help` in typed order. Measured on a production
  build: the manual chunk is 27.4 kB (9.9 kB gzip) and is not preloaded;
  the editor chunk shrinks by the same amount; `app` grows 0.26 kB,
  `index` 0.11 kB and the start-up CSS 0.45 kB. `commands.ts` and the
  kit's `wrapText` became small shared chunks of their own (4.4 kB,
  preloaded, taken out of `keys`; 1.9 kB, loaded with the chrome).

### Full width (2026-09-30)

The owner asked that EDITOR and HELP use the window's width: same left
margin, the scrollbar at the far right.

- **Rule.** The frame's centred column is still `W = max(40, min(77,
  cols - 2))` cells at `at = floor((cols - W) / 2)`. At full size (`W` =
  77, that is `cols` ≥ 79) the body of EDITOR and HELP keeps its left
  edge and ends in the last cell of the grid: the EDITOR buffer is
  `cols - at - 1` cells at `at` with its scrollbar in cell `cols - 1`
  (`bodyWidth` in `logic.ts`); the HELP menu and manual start where they
  did (`helpFrame`, new argument `fill`) and the manual column is
  `cols - left` cells: text, one blank cell, the scrollbar in cell
  `cols - 1`. The manual is laid out again at that width.
- **Flush, no right margin.** The scrollbar is in the very last cell, as
  the output pane's is. In the game the frame's grid is the ESC menu's
  box, so the scrollbar sits in the box's last cell, inside its border.
- **Narrow frames are unchanged.** Under 79 cells the column already
  spans the frame less one cell on each side; EDITOR and HELP keep it.
- **Everything else stays on the column.** LITE, the title and the view
  toggle, the footer (hints centred, `Ln, Col` ending at the column's
  right edge) and the overlays are where they were, so the toggle does
  not move when the view changes.

### Edge to edge (2026-10-01)

The owner asked that EDITOR and HELP fill the window's width, without
the left margin. This replaces the rule under "Full width" for those two
views.

- **Rule.** At every size the EDITOR buffer starts in cell 0 and is
  `cols - 1` cells wide, its scrollbar in cell `cols - 1`. `bodyWidth` is
  gone. HELP's menu starts in cell 0; the manual follows after the menu,
  its scrollbar and the gap, and runs to the last cell
  (`helpFrame(cols, menuW)`; `fill` and `menuAt` are gone). When that
  leaves the manual under HELP_MIN_W cells the menu is dropped and the
  manual takes the whole width.
- **Narrow frames too.** The earlier exception (under 79 cells the column
  is kept) is dropped: one rule for every width.
- **Unchanged.** LITE, the title, the view toggle, the footer and the
  overlays stay on the centred column.

## Consequences

- The same clipping exists wherever the chrome shows text in `.wc-line`
  rows outside the editor (a profile name with `_` in the Profiles list,
  for example). This ADR fixes the editor only; a general fix belongs in
  the kit and needs a look at block-glyph tiling.
- A new engine command needs a manual section, or the drift test fails.
- The editor chunk grows by the manual's text.
