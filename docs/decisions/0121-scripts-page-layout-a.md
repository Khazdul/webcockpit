# 0121 — Scripts page: framed detail, editable settings, readable help

- Status: Accepted
- Date: 2026-11-04
- Related: stage 38 (`docs/stages/38-scripts-page.md`). ADR 0051 (user
  scripts: header, settings, Scripts page P2), ADR 0103 (Scripts window),
  stage 33 (full-width Scripts). Mockups: the canvas
  https://claude.ai/artifact/AnegkBudftdxxgbKjL9ZiZ, direction A.

## Context

The owner's feedback on the Scripts page (2026-11-04, with a screenshot of
almanac in the Scripts window):

- The help is one long text column. Scripts with long `@help` (almanac 46
  lines, keymanager 54) fill the panel, and the hard-wrapped `@help` lines
  are wrapped a second time, so lines break in odd places ("and hour," on
  a line of its own). It is hard to read in a small window.
- Settings cannot be changed on the page; they are shown as
  `name = value` plus a `#script set …` line to type. They come after the
  help, so they are usually below the fold.
- The right side does not visibly belong to the script picked on the left.

Four mockup directions were made (A pure TUI, B hybrid, C modern, D
accordion). The owner chose **A**: the page stays pure cell-grid TUI so it
blends into the start menu, where every other page is pure TUI. Saving on
change, one "reset all", no `#script set` on the page and changes to the
script API were approved in the same round.

## Decision

### Layout (cell grid, existing `--c-*` roles only)

- **Buttons.** The page row keeps `NEW IMPORT MANUAL` (page-wide). `EXPORT`,
  `RENAME`, `DELETE` and `EDIT` belong to the selected script and move to
  the detail frame's top border (right end). `EXPORT` keeps its dialog
  (this script, or all scripts as a backup). `RENAME` and `DELETE` are
  disabled for bundled scripts, as today.
- **List.** `[X] name  🔒 ●`: toggle, name, padlock for bundled scripts,
  running dot. The per-row `EDIT` column goes.
- **Selection joins the frame.** The selected list row is a tab: it has
  the panel fill, its name is in the title role, bold, and the frame's
  left edge is open at that row so the row runs into the panel. The
  amber cursor marks where the keys go, as in the profile editor.
- **Detail frame.** A box-drawn frame with a panel fill. The top border
  carries `┤ name ├` (title role) on the left and the script's buttons on
  the right. Inside, top to bottom:
  1. summary; status (`● on · running` / `○ off`) and
     `bundled · read-only`; load problems, last error, syntax error and
     header problems, as today;
  2. `─ Settings ─────── RESET ALL`, one row per setting (below);
     "No settings." when there are none;
  3. `─ Commands ─`: aliases and keys, the key in active bold, the text
     wrapped with a hanging indent;
  4. `▾ Help ─────── PgUp/PgDn`: an inner framed box that takes the rows
     that are left, with its own TUI scrollbar. `▾`/`▸` folds it.
  Settings and Commands are therefore always visible; only the help
  scrolls. When even they do not fit, the frame's content scrolls as a
  whole and the help box keeps a minimum height.
- **Narrow widths** (the in-game window): each setting's label moves to
  its own line under the control, and help tables become one column with
  the description indented under the term. The phone layout keeps
  working; it is not redesigned here.
- **The panel fill** is a new derived role (the background mixed a little
  toward the foreground), so it works on dark, light and paper themes.

### Settings controls

| Type | Control | Keys | Mouse |
|---|---|---|---|
| boolean | `[ON|OFF]`, the active half inverted (ok role for ON, grey for OFF) | Space, Enter, ← → flip | click |
| number | `◂ 25 ▸ unit` | ← → step; a digit (or `-`, `.`) starts typing, Enter keeps, Esc cancels | click ◂ ▸; click the value to type |
| choice | `( ) 10  (•) 20 unit` | ← → pick | click an option |
| string | a text field | Enter edits, Enter keeps, Esc cancels | click |

- A row shows `name`, the control and the label (`@setting`'s text). A
  value that differs from the default has an accent `*` after the name.
- **A change is saved at once** through `ScriptLibrary.setSetting`; the
  running script sees it at once (`settings.<name>`, `sysSettingChanged`),
  as with `#script set`. Numbers are clamped to their range; a value that
  is not a number is refused with a flash and the old value stays.
- **RESET ALL** removes the stored values of every setting of the selected
  script (they fall back to the defaults, also to future defaults) and
  sends `sysSettingChanged` for each one that changed. It is disabled when
  every value equals its default. No confirmation; the flash says what was
  reset.
- Bundled scripts are read-only as code, not as settings: their settings
  are editable.
- The `#script set …` line is no longer shown on the page. `#script set`
  and `#script help` are unchanged; the script manual documents them.

### Keys

Three zones, Tab / Shift+Tab cycle them: the page buttons, the list
(default) and the detail.

- **List.** ↑↓ pick a script (↑ on the first reaches the buttons), Home /
  End, Space or Enter turn it on or off, → enters the detail.
- **Detail.** ↑↓ move over the rows: the button row (`EDIT EXPORT RENAME
  DELETE`), each setting, the help fold. On the button row ← → choose and
  Enter presses; on a setting the keys of the table above; on the help
  fold Enter folds or unfolds. Esc (or ← at the start of the button row)
  returns to the list.
- **Everywhere.** PgUp / PgDn scroll the help; the wheel over the help box
  scrolls it. Esc in the list or the buttons leaves the page, as today.
- The footer hints follow the zone, longest first, the first that fits.

### Help text

The `@help` lines are typeset, not printed as written:

- **Indentation is kept.** The header parser keeps each `@help` line's
  indentation relative to the script's least-indented `@help` line (today
  it trims it).
- **Paragraphs.** Consecutive unindented lines are joined into one
  paragraph and wrapped to the box width. A blank `@help` line ends it.
- **Lists.** A line starting with `- ` or `• ` starts an item, wrapped
  with a hanging indent; its following unindented lines continue it.
- **Tables.** A run of indented lines in which every entry line has a
  term, two or more spaces and a description (continuation lines indented
  to the description or further) is a two-column table: the term in the
  active role, the description wrapped at its column. When the term column
  would take more than about 40 % of the width, each description goes on
  the line under its term instead.
- **Preformatted.** Any other indented run is kept line by line (examples
  such as readability's "becomes:" lines); a line wider than the box wraps
  with a hanging indent.
- **Headings (new markup).** `-- @help ## Text` is a heading inside the
  help, in the section role.

The same typesetting is used by `#script help` in the game, so a script
author sees one result.

### `@setting` extensions (script API, still `@api 1`)

Additions only; every header that parses today parses the same way.

```
-- @setting <name> number <default> [<min>..<max>] [step <n>] [unit <word>] ["label"]
-- @setting <name> choice <default> <opt>|<opt>[|<opt>…] [unit <word>] ["label"]
```

- Options come after the default and before the label, in any order; the
  first token that is not an option starts the label.
- `number`: a range bounds the UI and `#script set` (out of range is
  refused with the range in the reason); `step` is the ← → step (default
  1); `unit` is shown after the value. A default outside the range is a
  header problem.
- `choice`: the options, separated by `|`; the default must be one of
  them. When every option is a number the values are numbers, else
  strings. `#script set` takes one of the options and refuses others.
- `unit` is allowed on `number` and `choice`. Options on `boolean` or
  `string` are header problems.
- The bundled scripts use them: mercenaries `cost` becomes
  `choice 10 10|20 unit silver`, the numbers get ranges and units
  (`delay`, `minutes`, `warn`, `hours`, `tvclose`, `remind`), and the long
  helps get `##` headings where it helps (almanac, keymanager,
  readability).

## Consequences

- The page model (`scripts-model.ts` `helpRows`) becomes a detail model
  with a fixed top part and a scrolling help part; `listLines` loses the
  EDIT column; key handling gains a detail zone.
- `ScriptHeader.help` keeps relative indentation; its other users
  (`command-rows.ts`, `#script help`) use the shared typesetting.
- `SettingDecl` gains `min`, `max`, `step`, `unit` and `options`;
  `SettingType` gains `choice`. `convertSetting` checks range and options.
- `ScriptLibrary` gains `resetSettings(name)`.
- The script manual and the API reference document the new `@setting`
  options, `## ` headings, list items and how help is typeset; the
  "Scripts page" section loses the `#script set` line description.

## Build notes

Decided while building stage 38, where the decision above is silent.

- **Header options.** An option is taken only when it is well formed:
  `step` followed by a number, `unit` followed by a word, `<a>..<b>` with
  two numbers, a `|` list. Anything else starts the label, so an
  unquoted label such as `step by step` parses as before. A tab in an
  `@help` line counts as four spaces.
- **Stored values against a changed header.** `settingsOf` clamps a
  stored number to the current range and falls back to the default for
  a choice that is no longer an option (or a value of another type).
- **Help tables.** A term that ends with `.`, `!` or `?` is not a table
  entry (readability's "A young troll leaves north.   becomes: …" lines
  stay preformatted). A table also stacks when its description column
  would be under 12 cells. Blank `@help` lines are kept (runs of them
  collapse to one); a heading gets a blank line above it. Tables and
  preformatted runs are indented two cells.
- **Bundled ranges.** almanac `remind` 0..24 h; coinlooter `delay`
  0..10 step 0.5 s; keymanager `hours` 0.5..24 h, `tvclose` 0..120
  step 5 s; mercenaries `cost` choice 10|20 silver, `minutes` 5..60
  step 5 min, `warn` 0..30 min. keymanager's and mercenaries' command
  lists were realigned so every entry has two spaces before its
  description; coinlooter's help uses `- ` items.
- **Keys in the detail.** The rows ↑↓ visit are the button row, RESET
  ALL (when the script has settings), each setting and the help fold.
  → from the list lands on the first setting (the button row when there
  is none). Enter on a number starts typing with the value selected; a
  digit, `-` or `.` starts typing with that character. Enter or Space on
  a choice picks the next option (wrapping); ← → stop at the ends.
  Coming back from the editor after EDIT, the keys are still on the
  button row, so Esc goes to the list first.
- **Number steps** go to the next multiple of the step that way (from
  0), then into the range: 27 → 30 with step 5, 0.5 → 1 with step 1.
- **Mouse.** A click on ON or OFF sets that value, on a bracket flips
  it; a click on a number's value types over it; a click on a string's
  field edits it; a click on a setting row puts the cursor there.
- **Flash.** A typed value and RESET ALL say what was saved ("delay = 5
  s", "Reset cost to the default."); a step or a flip does not, the
  control shows it.
- **The tab.** The frame's left edge is a blank (with the panel fill)
  at the selected row, `┘` on the row above and `┐` on the row below;
  the top or bottom corner becomes `─` when the selected row is next to
  it. The frame's lines use the section colour (not bold), the help
  box's the hint colour.
- **Narrow frame.** When the name (cut to at least 8 cells) and the four
  buttons do not fit the top border, the buttons go on a row of their
  own at the top of the frame (the in-game window at its least width).
- **No frame.** Without room for it (a phone) the list is alone and
  the button row holds every button: `NEW IMPORT EDIT EXPORT RENAME
  DELETE MANUAL`. The phone has no settings controls, as before.
- **Panel fill** `--c-panel`: the background mixed 9 % (dark) or 7 %
  (light) toward the terminal foreground; toward white or black when
  the foreground is too close to the background (contrast under 3).
- **`#script help`** shows each setting with its unit and what it
  takes (`#script set mercenaries cost <10|20>`, `<number 0..30>`).

## Owner feedback (2026-11-04, after the first build)

Supersedes two points above:

- **No join.** The selected row no longer runs into the frame: the
  frame's left edge is a whole `│` line and its corners stay `┌`/`└`
  whatever is selected. The selected row keeps the panel fill (within the
  list's cells) and its name in the title role, bold.
- **No brackets round the name.** The top border reads
  `┌── name ───── EDIT ─ EXPORT ─ RENAME ─ DELETE ─┐`: the line stops at
  the name with a space either side, without `┤ ├`.
