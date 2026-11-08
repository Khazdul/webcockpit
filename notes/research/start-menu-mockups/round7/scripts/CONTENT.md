# Scripts group · real content inventory (round 7)

Read from the code on main (stage 38 / ADR 0121 for the Scripts page, stage 10 for the editor and
manual, stage 30b for the in-game window). Everything listed here must stay reachable in the mockups.
Data in the mockups is real: the six bundled scripts' headers and help (`src/scripts/bundled/*.lua`,
parsed with the real `parseHeader`), the real manual (`scriptManualSections()`: 19 guide chapters,
86 API entries, 83 Lua entries) and real Lua source (coinlooter, mercenaries). `data.js` is generated
from those sources (see its header).

## 1. Scripts page (`src/chrome/frames/scripts.tsx`, `scripts-model.ts`, ADR 0121)

Reached from: start menu → Scripts (`SCRIPTS (gibur)`), the in-game Scripts window (menu bar icon,
`#scripts`), the phone's ESC → Options → Scripts.

**Page buttons:** NEW · IMPORT · MANUAL (page-wide). **Script buttons** (the selected script):
EDIT · EXPORT · RENAME · DELETE; RENAME and DELETE disabled for bundled (read-only) scripts.

**List row:** on/off toggle `[X]`, name (12–32 cells), padlock for bundled ("Bundled with WebCockpit:
read-only. Duplicate it to change it."), status mark: `●` running (ok), `!` failed (err, tooltip = the
problem), blank otherwise. Under a failed script an error line: `Cannot load: …`, the last error, or
`Syntax error: name:line: …` (a compile check of scripts that do not run). Touch: a second tap on the
selected name opens the editor.

**Detail frame** (the selected script):
- name (title) in the frame's top border with the four buttons;
- summary; status `● on · running` / `● on · starting` / `● on · runs when you enter MUME` (no host:
  start page) / `● on · not running` (err) / `○ off`; `bundled · read-only`;
- problems: `Cannot load: …`, `Last error: …`, `Syntax error: …`, `Header line N: …` (danger);
- **Settings** rule with **RESET ALL** (disabled when every value is the default; no confirmation;
  flash "Reset cost, warn to the defaults."). One row per setting: cursor mark, name, `*` when not the
  default, the control, the label (wraps; under the control when narrow). "No settings." when none.
  - boolean `[ON|OFF]` — Space/Enter/←→ flip, click ON/OFF/bracket;
  - number `◂ 25 ▸ min` — ←→ step (to the next multiple of step, clamped), a digit/`-`/`.` starts
    typing, Enter on it types with the value selected, Enter keeps (clamped), Esc cancels; click ◂ ▸,
    click the value to type; not a number → flash "warn must be a number." (fail);
  - choice `( ) 10  (•) 20 silver` — ←→ pick (stop at ends), Enter/Space next (wraps), click;
  - string `[bread    ]` — Enter or click edits, Enter keeps, Esc cancels.
  - A typed value flashes "delay = 5 s"; steps and flips do not flash. Saved at once.
- **Commands**: aliases and keys (`@alias`, `@key`): the key/alias in active bold, the text wrapped.
- **Help** fold `▾ Help` / `▸ Help` (Enter folds), in its own scroll box (PgUp/PgDn anywhere, wheel).
  Typeset `@help`: paragraphs, `- ` list items, two-column tables (term · description; stacked when
  narrow), preformatted runs (game text examples), `## ` headings. No help: "No help." or
  "No help yet. Add @summary, @help, @alias, @key and @setting lines to the header."
- No script selected: "No script selected." Empty library: "No scripts yet: NEW writes one."

**Keys:** zones buttons / list / detail, Tab / Shift+Tab cycle. List: ↑↓ Home End, ↑ on the first
reaches the buttons, Space/Enter on/off, → into the detail. Detail: ↑↓ over button row, RESET ALL,
each setting, the help fold; ←→/Enter act; ← at the start of the button row or Esc → list.
PgUp/PgDn scroll the help everywhere. Esc in list/buttons leaves the page (in game: closes the window
at the root). Old footer hint rows go (new rule: no hint rows).

**Flashes:** "almanac is off." / "almanac is on." / "… It runs when you enter MUME." (start page),
"Renamed to x.", "Deleted x.", "Exported almanac.lua.", "Exported 2 scripts and all settings to
webcockpit-scripts-2026-11-07.json.", "Imported x from f. It is off until you turn it on.",
"Restored 2 scripts, 1 already present, settings and data of 6. Restored scripts are off.",
failures in the fail colour ("Import failed: …", "Restore failed: …", "Could not open the editor: …").

**Sub-pages (dialogs):**
- **New Script** / **Rename Script**: "Name of the new script:" / `Rename "x" to:`, a text field,
  hint "A letter, then letters, digits, _ or -. At most 32.", validation error (danger), Enter confirm,
  Esc cancel. NEW then opens the editor on the template.
- **Delete Script**: "Delete script 'x'?  (y/N)", "Its settings and saved data go too."; Y confirms,
  any other key cancels.
- **Export Scripts**: menu "This script (x.lua)" / "All scripts and their data (backup)" / Back;
  note "A backup holds your own scripts, every script's settings and saved data. IMPORT reads it back."
- **Import Script** (a `.lua` file): warning "This script can send commands to the game as you." (err),
  "Read f before you import it. It is added turned off.", the code with line numbers in a scroll box
  (↑↓ PgUp PgDn Home End), Y imports, Esc cancels.
- **Restore Scripts** (a backup `.json`): warning (err), "Restore from f?  (y/N)", "3 scripts: a, b, c",
  "Settings and saved data of 6 scripts.", "Only what is missing is added; nothing here is replaced.
  Scripts are added turned off." Y restores.
- A file picker (`.lua,.json`) behind IMPORT.

**Phone:** no frame: the list alone, every button above it (NEW IMPORT EDIT EXPORT RENAME DELETE
MANUAL, wrapping), no settings controls (ADR 0121 "No frame"). Mockups improve this: list → tap →
detail (with settings), see "Frågor".

**In game (stage 30b, `windows.tsx`):** the Scripts window holds its own frame stack rooted at the
Scripts page; EDIT, MANUAL and the dialogs push inside the same window. Title "Scripts". Movable
(title bar), resizable (8 edges, grip), min 60×18 cells, default 80 % of the grid; place stored when a
move/resize ends. Focus follows presses; unfocused it dims; Esc at the root (or X, or the bar icon when
focused) is the close request; unsaved editor changes prompt first. The menu bar's Scripts icon gets a
mark while it is open.

## 2. Script editor (`src/editor/script-frame.tsx`, `cm.ts`, `lua-cm.ts`, lint, search)

- Title "─── Script Editor: name ───", `read-only` note for bundled scripts with the **DUPLICATE**
  button (Tab or ↑ on the first line reaches it; opens an editable copy `name-copy`, flash
  "Duplicated as x-copy. This copy is yours to edit.").
- **Buffer** (CodeMirror 6, monospace): Lua 5.4 highlighting (keywords, strings, numbers, API/library
  names, comments), line numbers, current-line band, bracket matching, soft wrap, history 200,
  Alt+↑↓ swap lines, Ctrl+C/X line-wise.
- **Live errors** (300 ms after typing): a red `●` in a one-cell lint gutter, a red band on the line,
  an underline under the `near` token, the message on hover; "Runtime error (saved version)" dashed on
  the saved script's error line. Held back while the line is being typed.
- **Completion** (Ctrl+Space, while typing): ten rows, label + detail (`(seconds, fn, repeat)`,
  `library`, keyword snippets), an info box with the doc (signature, text, parameters, returns,
  example). Snippets (for/if/while/function) with Tab between fields.
- **Signature help** inside a call: `tempTimer(seconds, fn, repeat) → id`, the current parameter
  marked, its description; Esc closes. **Hover** over a name: the same doc box.
- **Find / replace** (Ctrl+F, Ctrl+H): `Find › …  3 of 12  [ ] Case [ ] Word [ ] Regex`,
  `Replace › …  REPLACE  ALL`; Enter next, Shift+Enter previous, Esc closes the panel first. Bad regex →
  "Bad regex" (err), "No matches".
- **Status row**: `● on · running` then the first live error `Ln 4: Syntax error: '=' expected near
  'x'`, else the saved script's load/last error, else the first header problem.
- **Footer**: hints (go), a flash in their place ("Saved. The script reloads.", "Saved. Turn it on in the
  list to run it.", "Saved as x.", "Saved. <warning>", "Save failed: …"), right side
  `Modified  ·  Ln 12, Col 5`.
- **Keys**: Ctrl+S save, F1 manual at the name under the cursor, Ctrl+F/H find/replace, Ctrl+Space
  complete, Ctrl+Shift+Space signature, Tab/Shift+Tab indent / snippet fields / accept completion,
  Enter after a block header adds `end`, case correction (`temptrigger(` → `tempTrigger(`), Esc closes
  pop-ups, then the editor.
- **Unsaved changes**: Esc asks "Save changes to x?" — Y save (then "Saving…"), N discard, Esc keep
  editing. In game the window's close request waits for this prompt.
- Phone: full width, 40-cell floor dropped; touch makes the hint words tappable (they go now).

## 3. Script manual (`script-manual-frame.tsx`, `manual-view.tsx`, `manual-find.tsx`, `script-reference.ts`)

- Title "─── Script Manual ───". Opened from the Scripts page (MANUAL) and the editor (F1, at the name
  under the cursor: its API/Lua entry, the Lua index for a library table, Lua basics for a keyword,
  Sandbox for a removed name, The header for `@tag`). Esc goes back; the editor below keeps its state.
- **Menu** (left, own scrollbar): groups with titles — *Guide* (Getting started, Lua basics, Lua
  patterns, The header, Triggers, Aliases, Keys, Timers, Game time, Events and GMCP, Output, Panes,
  Map marks, Settings and store, Profile bridge, In-game commands, Sandbox and limits, Errors and
  debugging, Examples), *API reference* (86 entries A–Z, cecho … wrapText), *Lua reference* (the "Lua
  library" index, then 83 entries). The current section follows the scroll.
- **Text** (continuous, own scrollbar): group rules "─── API reference ───", headings, syntax lines,
  paragraphs, `- ` items, `Parameters:` / `Returns:` lines, example notes and Lua code (highlighted, API
  names coloured). In the Lua index each `- string.format: …` name is a link to its entry.
- **Find** (Ctrl+F): a 3-row panel under the manual: `Find › …  3 of 12  [ ] Case [ ] Word [ ] Regex`,
  `PREV  NEXT`; Enter/F3/Ctrl+G next, Shift previous, Alt+C/W/R toggles, Esc closes the panel first;
  matches marked, the current one like a selection, scrolled into view, the menu follows.
- **Keys**: menu ↑↓ section, →/Enter to text; text ↑↓ row, Enter page, ← menu; both PgUp/PgDn,
  Home/End, n/p next/previous heading; Tab cycles; Esc back.
- **Narrow** (manual column < 52 cells): no menu, the text alone.
