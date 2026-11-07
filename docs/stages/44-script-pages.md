# Stage 44 — Scripts page, script editor and script manual in the new look

Status: **Next** (planned 2026-11-07; wave 2 of the broad pass, after
stage 42; branch to be decided by the main session, nothing merged
until the owner has tested).

## Goal

The three Scripts pages leave the TUI cell grid for the lantern look of
stage 41 (ADR 0125), in the directions the owner chose from round 7 (README,
"Round 7 decisions"):

- **Scripts page: C "Instrumentbrädan"**: three columns. A slim index of
  the scripts, the selected script as an instrument panel (settings as
  tiles), the help as its own reading column. The page buttons are in the foot.
- **Script editor: C "Fokus"**: the least chrome and the most code. The
  script's name is in the hood. Save, Find and Manual are small glass icons
  in the code well's corner and dim while you type. The find row slides
  down inside the well, and a quiet status line runs under it.
- **Script manual: A "Boken"**: contents on the left (Guide, API
  reference, Lua reference, the references folding with counts), the
  whole manual as one typeset text on the right, find always in the head.

The same pages run in three hosts. On the start page they use the big-page
layout B "Rummet växer" from stage 42. In game they open in the movable,
resizable Scripts window, in one frame (Lykta) on every page. On the phone
they open from ESC → Options → Scripts. Every function, key and editor
feature listed under "Must keep working" stays. The editor and the
manual must stay as fast as today.

The mockups are throwaway code over a simplified DOM and a textarea
"editor". Never copy them as they are. Re-derive the look in the app's
own structure and keep CodeMirror.

## Owner decisions (2026-11-07)

- Scripts page **C Instrumentbrädan**, script editor **C Fokus**, manual
  **A Boken**.
- In-game window frame: **one frame, Lykta, for every page** (owner,
  2026-11-07: "the Profile page and the Scripts page, with their
  sub-pages, can all have the same frame, the direction's own"). The
  Scripts window and all its sub-pages (Scripts page, script editor,
  manual) use the **Lykta** frame (`win-a`), the frame of the chosen
  directions (Scripts page C, and Profile editor B in stage 43). The window
  never switches frame when a sub-page opens; the mockups' Glass frame for
  the editor (`win-b`) is dropped from scope. The top frame sets only the
  title and note (`useWindowChrome({ title?, note? })`). This answers the
  earlier question "Riktningens (Glass for the editor) or Lykta
  everywhere": Lykta everywhere.
- Big pages on the start page: **B Rummet växer** (stage 42 builds it).

Defaults the owner accepted by not objecting (the open questions on the
round 7 review page). Record them in this stage's ADR:

1. **Tooltips are enough** for Ctrl+S, Ctrl+F / Ctrl+H and F1. There are no
   key rows and no hint rows anywhere. The editor's tools carry
   `title="Save (Ctrl+S)"`, `"Find and replace (Ctrl+F, Ctrl+H)"` and
   `"The manual at the name under the cursor (F1)"`.
2. **The settings controls work on the phone** (new; ADR 0121 had none
   there): list → tap → the script's panel with its settings → "All
   scripts" back.
3. **Sub-pages inside an in-game window get their own small Back**
   (the window has no Back of its own). This covers the editor, the
   manual and the dialogs. The window's root (the Scripts page) has none:
   X, Esc or the bar icon close it.
4. **The status "on · runs when you enter MUME" becomes "on · at
   login"** (start page, no host yet). The toggle's flash stays a
   sentence: "almanac is on. It runs when you enter MUME." The guide text
   in `src/editor/script-manual.ts` (Getting started) that quotes the old
   status is updated to match.

Not taken: B's inspector rail instead of the signature popup. The editor
keeps CodeMirror's pop-ups (completion, info box, signature help, hover,
lint message), restyled as small lit plates.

## References

Read first:

- `CLAUDE.md`, `progress.md` (top), `docs/stages/41-start-page.md`
  (the model for this file), `docs/stages/42-look-pages-base.md` and ADR
  0127 (the shared base this stage builds on; read its "API" and
  "Canonical names" sections before starting).
- `notes/research/start-menu-mockups/README.md`: "Baseline", "Night pass",
  "Round 7 decisions".
- `notes/research/start-menu-mockups/NIGHT-PASS.md` (decisions 3–6: the
  box, big pages, in-game windows).
- `notes/research/start-menu-mockups/round7/scripts/CONTENT.md`: the real
  content, states, flashes and keys of all three pages. **This is the
  checklist of what must stay reachable.**
- `round7/scripts/index.html`: the review page with the owner's
  questions; the frame switch "Riktningens / Lykta / Glas" (answered:
  Lykta everywhere).

Mockups (open with `?ctx=start&open&nointro` or
`?ctx=game[&bg=paper][&win=small]`. The DEMO panel at the bottom left
shows the states: empty library, failed import, completion, signature,
hover, find, a syntax error, unsaved → Esc, a bundled script):

| File | What |
|---|---|
| `round7/scripts/page-c.html` | Scripts page C (layout, breakpoints, keys in its `key()`) |
| `round7/scripts/page.js` | Shared page logic: `SP.parts` (detail rows and keys), `SP.actions`, letters `N I M E X R D` |
| `round7/scripts/editor-c.html` | Editor C (tools, read-only plate, find slot, status line, `typing` dim) |
| `round7/scripts/editor.js` | Editor logic: status text, save flashes, Duplicate, unsaved prompt, find/replace keys, Esc order |
| `round7/scripts/editor.css` | Status line and position styles |
| `round7/scripts/manual-a.html` | Manual A (contents, scroll spy, find in the head, narrow "Contents" overlay, keys) |
| `round7/scripts/common.js` / `common.css` | Host (start box vs window, inline Back), dialogs (`SC.dialog`, `SC.dialogs`), setting controls (`SC.control`, `SC.settings`), help typesetting, manual HTML, code surface and pop-up styles |
| `round7/base/README.md`, `base.css` | The kit's mockup classes (`.lp`, `.box-large`, `.ibtn`, `.field`, `.tog`, `.seg`, `.rows`, `.code`, `.wwin.win-a` (the window frame; `.wwin.win-b` is not built), Paper variants) |
| `round7/layout/b-room.html` | How a big page opens and closes on the start page |

Current code (what each page replaces; read before you change it):

| Area | Files |
|---|---|
| Scripts page | `src/chrome/frames/scripts.tsx` (page, `NameFrame`, `DeleteFrame`, `ExportFrame`, `RestoreFrame`, `ImportFrame`, `editScript`, `openManual`), `scripts-model.ts` (cell layout and the pure helpers), `scripts.css` |
| Help typesetting | `src/scripts/help-text.ts` (`typesetHelp`, its internal `blocks()`; also used by `#script help` through `command-rows.ts`) |
| Script library | `src/scripts/library.ts`, `header.ts` (`SettingDecl`), `backup.ts`, `check.ts` (`syntaxProblem`, `knownSyntaxProblem`) |
| Script editor | `src/editor/script-frame.tsx`, `lua-cm.ts` (buffer, completion, hover, signature, the pop-up theme), `cm.ts` (shared with the profile editor: `theme()`, `handleKey`, `pageScroll`, `onFirstLine`), `search.ts` (find panel, shared with the profile editor), `lua-lint.ts`, `lua-diagnostics.ts`, `lua-holdback.ts`, `lua-blocks.ts`, `lua-case.ts`, `lua-reopen.ts`, `lua-sig.ts`, `editor.css` (script section and lint/search rules) |
| Script manual | `src/editor/script-manual-frame.tsx`, `script-reference.ts` (`scriptManualSections`, `manualSectionOf`, `indexLinkOf`, `LUA_INDEX`), `script-manual.ts` (the guide), `help.ts` (`HelpSection`; the grid layout), `manual-view.tsx`, `manual-find.tsx`, `manual-search.ts` (**the last four are shared with the profile editor's HELP view: do not change them in this stage**) |
| Entry points | `src/chrome/frames/start-main.tsx` (Scripts row), `src/chrome/frames/options.tsx` (phone ESC → Options → Scripts), `src/chrome/index.tsx` (`menuRoot` target `scripts`), `src/chrome/windows.tsx` (`WinStackBody`: `<ScriptsFrame />` as the window's root), `src/editor/index.ts` (the lazy chunk's exports) |
| Kit | `src/chrome/kit/look.tsx|css` (lantern kit), `stack.tsx` (frame stack, `useKeys`, `useUnsaved`, `useFlash`), `window.tsx`, `window-geom.ts` |

ADRs: 0013 (frame stack), 0015 and 0037 (editor host, HELP view), 0051
and 0053 (user scripts, header, backup), 0070 (find in the manuals), 0075
(phone layout), 0103 (windows), 0106 (draggable scrollbars: the TUI
bars go with this stage's pages), 0108 (popup focus), 0112 (ESC menu
only on the phone), 0119 (Ctrl+F / Ctrl+H), **0121** (Scripts page
behaviour: every rule there survives except the cell layout), 0123
(Lykta), **0125** (start surface and kit), and **0127** (stage 42).

## Scope

In:

- The Scripts page, its six dialogs (New, Rename, Delete, Export, Import
  `.lua`, Restore backup) and the file picker, in the new look, in all
  three hosts.
- The script editor (CodeMirror kept) with its pop-ups, find/replace and
  the unsaved prompt, in the new look.
- The script manual in the new look (a new DOM manual; the grid manual
  stays for the profile editor).
- The Scripts window's per-page title and note (the frame is stage 42's
  Lykta, the same on every page), the inline Back,
  and the close request through the unsaved prompt.
- Tests, the ADR, the guide's status text, spec §2.10 / §5 and README /
  About lines that describe these pages.

Out:

- The profile editor and its HELP view (`frame.tsx`, `help.ts`,
  `manual-view.tsx`, `manual-find.tsx`, `manual-search.ts`): the Profiles
  stage (43) or the wave-3 sweep. `cm.ts`, `search.ts`, the lantern code
  theme and `LookManual` are stage 42's (read only); `editor.css` changes
  only in its script section (44b).
- The window manager, the window frames, the big-page layout, the code
  theme, the find panel and the manual reader: stage 42.
- The phone's ESC menu itself and its other Options pages (NIGHT-PASS
  decision 5). Only its Scripts entry renders the new pages, through the
  host from stage 42.
- `#script help` in the game: it keeps `typesetHelp` (cells).
- The script API and the header format (unchanged).

## Must keep working (from the code and CONTENT.md)

**Scripts page** (ADR 0121, every rule except the cell layout):

- List: on/off toggle, name, padlock for bundled scripts (tooltip
  "Bundled with WebCockpit: read-only. Duplicate it to change it."), the
  status mark (running ok dot; failed: error dot with the problem as its
  tooltip), and the error line under a failed script (`Cannot load: …`,
  the last error, or `Syntax error: name:line: …` from the lazy compile
  check of scripts that do not run, `useSyntaxProblems`).
- Panel: name, summary, status (`on · running`, `on · starting`,
  `on · at login`, `on · not running`, `off`), `bundled · read-only`,
  problems (`Cannot load`, `Last error`, `Syntax error`, `Header line N`).
  Buttons Edit, Export, Rename, Delete. Rename and Delete are disabled
  for bundled scripts, with the tooltip "Bundled scripts are read-only".
- Settings: boolean switch, number stepper (`◂ 25 ▸ unit`: step to the
  next multiple of `step`, clamped; a digit, `-` or `.` starts typing;
  Enter on it types with the value selected; Enter keeps and clamps; Esc
  cancels; a value that is not a number flashes "warn must be a
  number." and keeps the old one), choice (segmented control: ← → stop at
  the ends, Enter/Space take the next and wrap), string (text well:
  Enter or a click edits, Enter keeps, Esc cancels). Saved at once
  through `ScriptLibrary.setSetting`, so the running script sees the
  change (`sysSettingChanged`). Changed-from-default mark plus "default
  …". **Reset all** is disabled when every value is the default, needs no
  confirmation and flashes "Reset cost, warn to the defaults.". A typed
  value flashes "delay = 5 s"; steps and flips do not flash. Bundled
  scripts' settings stay editable. "No settings." when there are none.
- Commands (`@alias`, `@key`) and the typeset help: paragraphs, `- `
  items, two-column tables (stacked when narrow), preformatted runs,
  `## ` headings. Help fold (`▾ Help`). The fold state is kept across
  scripts. "No help." / "No help yet. Add @summary, @help, @alias, @key
  and @setting lines to the header."
- Empty states: an empty library ("No scripts yet." in the index; the
  panel: "Write your first script with New, or Import one."), "No script
  selected.", "Scripts are not available here." (no library).
- Actions: New (name prompt, then the editor on the template), Import
  (file picker `.lua,.json`: a `.lua` shows its code and the warning
  first, a backup shows what it holds; everything is added turned off),
  Manual, Edit (lazy editor chunk; "Could not open the editor: …"),
  Export (this script `.lua`, or all scripts as a backup through
  `downloadBlob`), Rename (validation `scriptNameError`, hint "A letter,
  then letters, digits, _ or -. At most 32."), Delete (y/N; "Its settings
  and saved data go too."; the cursor moves to the neighbour).
- Every flash in CONTENT.md §1 "Flashes", with the same wording (except
  item 4 above).
- The running state is polled (1 s) only while the page is the top frame.
  The list follows `lib.subscribe`.
- Coming back from the editor: the cursor is on the edited or renamed
  script and the keys are on the button row, so Esc goes to the list first.

**Script editor:**

- CodeMirror 6 buffer, Lua 5.4 highlighting, line numbers, current-line
  band, bracket matching, soft wrap, history 200, Alt+↑/↓ swap lines,
  line-wise Ctrl+C / Ctrl+X, closeBrackets.
- Live errors 300 ms after typing (lint gutter dot, red line band,
  underline at `near`, message on hover), held back on the line being
  typed (`lua-holdback.ts`). Runtime error of the saved version dashed on
  its line until the line is edited.
- Completion (Ctrl+Space and while typing; ten rows, label + detail, the
  info box), reopening by itself (`lua-reopen.ts`), snippets with Tab
  stops, signature help (Ctrl+Shift+Space and inside a call; current
  parameter marked), hover docs, Enter after a block header adds `end`,
  case correction as its own undo step.
- Tab / Shift+Tab: accept the completion, else the next or previous snippet
  field, else indent or dedent. On a read-only script, Tab or ↑ on the
  first line reaches **Duplicate**.
- Ctrl+S save, F1 manual at the name under the cursor (`nameAt`,
  `manualSectionOf`), Ctrl+F / Ctrl+H find and replace (Case / Word /
  Regex toggles, Alt+C/W/R, `n of m`, "No matches", "Bad regex", Enter
  next, Shift+Enter previous, Replace, All; no replace row when read-only).
- Esc order: a pop-up, then the find panel, then the editor. With unsaved
  changes it asks "Save changes to x?": Y saves ("Saving…"), N discards,
  Esc keeps editing. In game the window's close request waits for this
  prompt (`useUnsaved`).
- Status: the state, then the first live error (`Ln 4: Syntax error: …`),
  else the saved script's load or last error, else the first header
  problem. The position line shows `Modified · Ln 12, Col 5`. Save flashes:
  "Saved. The script reloads.", "Saved. Turn it on in the list to run
  it.", "Saved as x." (a new `@name`: `onName`), "Saved. <warning>"
  (6 s, fail colour), "Save failed: …".
- Bundled scripts open read-only with the plate "bundled · read-only" and
  Duplicate ("Duplicated as x-copy. This copy is yours to edit."; the copy
  opens in place). `checkScript`, `markScriptSaved` and
  `setScriptLastError` stay as they are.
- On the phone: full width, a smaller code font, tappable Save, Find and
  Manual.

**Script manual:**

- Every section of `scriptManualSections()` (19 guide chapters, the
  API reference A–Z, the Lua reference: the "Lua library" index and its
  entries). In the Lua index each `- name:` is a link to its entry
  (`indexLinkOf`). Examples are highlighted Lua with API names coloured
  (`luaHighlightLine`, `apiDoc`).
- Opened from the Scripts page (Manual) and the editor (F1 at the name:
  its entry, the Lua index for a library table, Lua basics for a
  keyword, Sandbox and limits for a removed name, The header for `@tag`;
  else Getting started). Esc goes back, and the editor below keeps its
  buffer, cursor, undo history and search.
- The current section follows the scroll. Contents: ↑↓ section, → or
  Enter to the text. Text: ↑↓ scroll, Enter / Space a page, ← to the
  contents. Both: PgUp/PgDn, Home/End, n/p next/previous chapter, Tab
  switches zones.
- Find (Ctrl+F): matches marked, `n of m` (`1000+` cap), Case / Word /
  Regex (Alt+C/W/R), Enter / F3 / Ctrl+G next, Shift for previous, the
  current match scrolled into view and the contents following it. Esc
  clears the find before it leaves the manual.
- Narrow (manual container under about 700 px): the text alone, and a
  Contents button opens the list over it.

**Hosts:**

- Start page: Scripts row in the start menu. The page, the editor and the
  manual are big boxes (layout B). Back at the top left and Esc do the
  same.
- In game: the menu bar's Scripts icon, `#scripts`, and Esc in the game
  input (`escapeTop`). The window is movable and resizable and its place
  is stored. Focus follows presses, and the window dims when it loses
  focus. The close request goes through the frames' Esc layers and the
  unsaved prompt. The bar icon carries its mark while the window is open.
  Dark and Paper (light) backgrounds both work.
- Phone: ESC → Options → Scripts (no windows on the phone). Touch targets
  are at least 40 px.

## Work packages

Wave 2 runs these four in parallel with the other page stages, so each
package owns its files and nothing else. All of them build on stage 42's
API (canonical names in its file). If 42 left something out, add a minimal
local version **inside your own files**, note it in your report, and do
not edit 42's files (the integration wave folds it back).

### File ownership

| Package | Owns (may create or edit) | Reads only |
|---|---|---|
| 44a Scripts page | `src/chrome/frames/scripts.tsx`, `scripts.css`, `scripts-model.ts`; new `src/chrome/frames/script-settings.tsx`, `script-dialogs.tsx` (names are suggestions); `src/scripts/help-text.ts` (**additions only**: export a block-level `helpBlocks(lines)` for DOM rendering; `typesetHelp` unchanged); the status text in `src/editor/script-manual.ts` (one sentence) | `src/scripts/*` (library, header, backup, check), the kit |
| 44b Script editor | `src/editor/script-frame.tsx`, `lua-cm.ts` (pop-up plates and DOM classes; uses stage 42's `lookCodeTheme()`), new `src/editor/script-editor.css` (imported from `script-frame.tsx`), the **script section** of `editor.css` (`.wc-lua-*`, `.wc-sed-*`, lines 281–343 today) | `cm.ts`, `search.ts`, `look-code.ts|css` (stage 42's), `lua-*.ts` logic (change them only for a bug, and say so) |
| 44c Script manual | `src/editor/script-manual-frame.tsx` (hosts stage 42's `LookManual`); `script-reference.ts` (additions only: group labels and counts) | `look-manual.tsx|css`, `look-manual-find.ts` (stage 42's), `help.ts`, `manual-view.tsx`, `manual-find.tsx`, `manual-search.ts` (**do not edit**) |
| 44d Window, phone host, docs | The Scripts parts of the e2e specs listed under 44d below, ADR 0129, the ADR 0121 addendum, `spec.md` §2.10 | Everything else. It calls 42's window and host API from the frames' own files only through 44a–c (it hands them the exact hook calls). README lines go to wave 3; the About text's Scripts lines are stage 47's (`about.tsx`): 44d lists the facts in its report |

`src/editor/index.ts` (the lazy chunk's exports) is stage 43a's in wave 2:
keep the exported names of the script frames; if a package needs a new
export, it names it in its report and wave 3 adds it.

Shared test files are split by `test(...)`: each package edits only the
tests named for it below. Where a spec file also holds Profiles tests
(`phone-frames.spec.ts`, `manual-find.spec.ts`, `editor.spec.ts`), leave
those tests alone.

### 44a — Scripts page (C Instrumentbrädan)

Uses from 42: `Box size="large"` (place-aware: `useLookPlace()`),
`useWindowChrome`, the `menu` place, overlay frames and `Dialog`, and the
kit widgets (`Field`, `Toggle`, `Seg`, icon-only `GlassButton`, `Rule`,
`Fold`, `Well`, `.wc-lk-scroll`, `useListCursor`, `useButtonZone`,
`letterAction`, the icons).

1. Rewrite `ScriptsFrame` as a `lookFrame`: `<Box size="large"
   title="Scripts" onBack=…>`, with `useWindowChrome({ title: 'Scripts' })`. In the window it is the root, so it has no Back
   (`Box` shows none in the `window` place).
2. Layout from `page-c.html`, with container queries on the box/window
   content (never the viewport, so one rule set serves the start box, a
   window of any size and the phone):
   - over 1000 px: `228px | panel | help (1.05fr)`, with hairline rules
     between the columns;
   - 641–1000 px: index and panel; the help folds in under the panel.
     Move the one help element; do not render it twice;
   - 640 px and under: the index alone. A tap or Enter drills into the
     panel, and "All scripts" (a small Back inside the panel) returns.
     The panel's buttons go in a 2 × 2 grid. Settings work here
     (owner default 2).
   - Foot: New, Import, Manual (small glass buttons), the flash
     (`LookFlash`) and the count ("8 scripts", plus "· 3 running" in game).
3. The panel: the title (Cinzel), the padlock, the summary, the status line
   with its dot, the four buttons, problems, `Rule` "Settings" with
   **Reset all**, setting **tiles** (`auto-fill, minmax(210px, 1fr)`: the
   name in small caps over the control, the label under it, and "default
   …" when changed), `Rule` "Commands" (key/alias bold, text wrapped),
   and the help (`Fold` "Help" plus a `Well` with the typeset help from
   `helpBlocks`, Cormorant body, term tables as a grid that stacks under
   about 40 % term share).
4. Settings controls in `script-settings.tsx`. Keep the pure step, clamp
   and choice helpers (`stepSetting`, `clampSetting`, `stepChoice`,
   `valueText`) and the `pending` map (a value shows at once and is the
   base of the next step). Typing uses a real `<input>` that holds the
   focus while editing, as `SettingInput` does today.
5. Keys (`page-c.html` `key()`, ADR 0121 "Keys"): Tab / Shift+Tab cycle
   index → panel → foot buttons. Index: ↑↓ (on the last, ↓ goes to the
   foot; on the first, ↑ stays), Home/End, Space/Enter toggle, → into the
   panel (at the first setting, or the button row). Panel: ↑↓ over the
   button row, Reset all, each setting and the help fold; ←→ / Enter /
   Space act; ← at the start of the button row or Esc goes back to the
   index; digits type a number. PgUp/PgDn scroll the help anywhere (the
   help column when wide, else the panel). **Letters** N I M E X R D,
   marked in the labels (new; record them). Not while a field is being
   typed in, and not for digits on a number. Esc in the index or the foot
   leaves the page. Selection is the kit's restrained one (the row text
   brightens, plus the fine tick at the left of the keyboard's row).
6. Mouse and touch: a click on a row selects it, and a double click opens
   the editor. A click on the toggle toggles without moving the
   keyboard's zone. A press on a setting puts the cursor there. Hover
   only lightens. On touch, a tap on the row drills in (≤ 640 px) or
   selects. The old "second tap on the selected name opens the editor"
   goes, because Edit is in reach (record it).
7. Dialogs (`script-dialogs.tsx`) as **overlay frames**
   (`nav.push(node, { overlay: true })` rendering stage 42's `Dialog`; the
   page stays visible and dimmed under it, as `SC.dialog`), with the
   wording of CONTENT.md §1 and the mockup's buttons:
   - New / Rename: a field, the hint, the error in the danger colour,
     Enter confirms, Esc cancels. New then opens the editor.
   - Delete: Cancel (N), "Yes, delete" (Y, danger); any other key cancels.
   - Export: two rows (This script `name.lua` / All scripts and their
     data · backup), plus the note.
   - Import: the warning, the note, the code in a `Well` with line
     numbers (↑↓ PgUp PgDn Home End), and Import (I, also Y).
   - Restore: the warning, the summary lines, and Restore (R, also Y).
   - The hidden file input stays as it is.
8. Model: `scripts-model.ts` loses the cell layout (`scriptsLayout`,
   `buttonRows`, `controlSegs`, `detailRows`, `helpLines`, `cutRow`
   etc.) and keeps the pure state helpers. `scriptState`'s
   `running === null` text becomes `on · at login`, and its `cls` / `glyph`
   become look-neutral (`ok | err | off`).
9. Unit tests: `tests/unit/chrome-scripts.test.tsx` (model tests for
   what stays; the frame tests rewritten for the new DOM),
   `tests/unit/scripts-help-text.test.ts` (add `helpBlocks`). E2e:
   `scripts-page.spec.ts` (all 4), `scripts-settings.spec.ts` (all 6,
   rewritten: tiles, keys, mouse, Reset all, help fold and scrolling, a
   narrow window), `script-editor.spec.ts` "the Scripts page shows a
   syntax error of a script that is off", `phone-frames.spec.ts` the
   three Scripts tests, `scrolling.spec.ts` and `scrollbar-drag.spec.ts`
   (their Scripts cases: the TUI scrollbars go, so turn them into native
   scroll checks or drop them, and say which).

### 44b — Script editor (C Fokus)

Uses from 42: `Box size="large"` (its `title` may change), `useWindowChrome`,
`InlineBack`, `Dialog` (`inline`, the unsaved prompt), `lookCodeTheme()`
and `.wc-code`, the lantern find panel (`searchExtension({ look:
'lantern', top: true })`), icon-only `GlassButton`, the icons, the `--lk-*`
tokens and `--lk-mono`.

1. `ScriptEditor` becomes a `lookFrame`: `<Box size="large"
   title={name + (dirty ? ' •' : '')}>` on the start page.
   `useWindowChrome({ title: 'Scripts', note: name + (dirty ? ' •' : '') })`
   in game (the window keeps its Lykta frame), with `InlineBack` at the top
   left of the well.
2. The well (`.ec-well`): CodeMirror fills it. Tools at the top right are
   small glass icon buttons in a frosted pill: Save (primary, disabled
   when clean or read-only), Find, Manual. A read-only script gets
   **Duplicate** (wide, primary) instead of Save, and the plate "bundled ·
   read-only" at the top left. The tools dim to 35 % for 1.6 s after
   input, return on hover or focus, and hide while find is open.
3. The find row slides down at the top of the well, over the code (CM
   panel at the top; 42's lantern find panel, placed with `top: true`),
   250 ms (none with reduced motion).
4. The status line under the well: the state dot and text, the first
   problem (ellipsis, full text as a tooltip), the flash in the middle,
   and `Modified · Ln, Col` on the right. On the phone it wraps.
5. The CodeMirror look is stage 42's `lookCodeTheme()` (mono font,
   line-height in px, the gutter, a soft current-line band, selection,
   caret, match and lint marks) with the `.wc-code` class on the buffer
   host (the `wc-lua-*` token colours, dark and Paper); `lua-cm.ts` uses it
   instead of `cm.ts theme()`. This package makes the pop-ups small lit
   plates (completion list, info box, signature help, hover, lint
   message) in `lua-cm.ts` / `script-editor.css`. Keep the class hooks the
   tests use (`.cm-tooltip-autocomplete`, the lint classes). The old lint
   and search-match rules in `editor.css` keyed on `.wc-ped-buffer` stay
   for the TUI editor until wave 3.
6. Keys: as today (`useKeys` → `searchFrameKey`, `handleKey`,
   `snippetTab`, `dismissPopups`, `onFirstLine` for Duplicate). The
   footer hints go (owner default 1), so the phone's tappable hint words
   are replaced by the tools.
7. The unsaved prompt as stage 42's `Dialog` with `inline` and `dlg="unsaved"` inside the editor ("Unsaved changes",
   "Save changes to **x**?", Keep editing / No, discard (N) / Yes, save
   (Y, primary)). It keeps `useUnsaved(dirty, prompting)`, so the
   window's close request waits for it.
8. Keep the root and status hooks the tests use: `.wc-sed`,
   `.wc-sed-status`, `.wc-sed-problem`, `.wc-search-count`.
9. E2e: `script-editor.spec.ts` (all except the Scripts-page and MANUAL
   tests), `script-code-editor.spec.ts` (all 9: "no buttons" becomes
   "the tools: Save, Find, Manual; Ctrl+S saves, F1 opens the manual"),
   `lua-help.spec.ts` (the completion, signature, snippet and hover
   tests).

### 44c — Script manual (A Boken)

Uses from 42: `Box size="large"`, `useWindowChrome`, `InlineBack`, and
`LookManual` with its find and contents (built by stage 42e from this
stage's plan: the DOM reader over `HelpSection[]`, the folding contents
with counts and scroll spy, the find in the head with the CSS Custom
Highlight API and a `<mark>` fallback, the keys and the Esc order, the
narrow contents overlay).

1. `ScriptManual` becomes a `lookFrame`: `<Box size="large" title="Script
   Manual">` on the start page; in game `useWindowChrome({ title:
   'Scripts', note: 'Manual' })` and `InlineBack` in the head.
   `openScriptManual(nav, name?)` keeps its signature and its
   `manualSectionOf` lookup.
2. Host stage 42's `LookManual` (`src/editor/look-manual.tsx`, read only)
   over `scriptManualSections()`: `contents: 'own'`, `find: 'head'`,
   `groups` (Guide, API reference, Lua reference: labels and, with
   `ManualContents`'s `counts`, the counts), `initial` from
   `manualSectionOf`, `link` = `indexLinkOf` (the Lua index links),
   `example` = highlighted Lua through `luaHighlightLine` with API names
   coloured, `memory` (the find query kept across opens). The reader
   already does what the mockup's A does: group rules, Cinzel headings,
   syntax lines in mono wells, paragraphs, `- ` items, `Parameters:` /
   `Returns:` lines, sections laid out lazily (`content-visibility`), the
   contents at the left (250 px, Guide open, the references folded with
   counts, the current section lit and following the scroll, its group
   unfolding when reached), the find in the head (field, count, Case /
   Word / Regex, prev / next; CSS Custom Highlight API with a `<mark>`
   fallback; input debounced ~180 ms; Ctrl+F focuses and selects; Enter /
   F3 / Ctrl+G next, Shift previous; Esc in the field clears it and
   blurs), the Esc order (a contents overlay, then a non-empty find, then
   the host) and the narrow layout (≤ 700 px: the contents behind a
   "Contents" button; the find's toggles and empty count hide).
3. Check every one of those against `manual-a.html` and CONTENT.md with
   the script manual's real sections; anything the reader lacks goes into
   a local helper in `script-manual-frame.tsx` and the report (stage 42's
   files stay untouched).
4. The frame's own keys forward to `ManualCtl.key(e, nk)`; F1's targets
   (its entry, the Lua index for a library table, Lua basics for a
   keyword, Sandbox and limits for a removed name, The header for `@tag`,
   else Getting started) go through `ctl.goto`.
5. The editor below keeps its buffer, cursor, undo history and search
   while the manual is open (as today).
6. The frame's root carries `.wc-sman` (its own hooks); the reader's hooks
   are the kit's (below).
7. E2e: `manual-find.spec.ts` "Script Manual: Ctrl+F …" (not the
   profile HELP test, not LITE), `lua-help.spec.ts` "MANUAL: Lua basics
   …, a linked index" and "hover on ipairs …; F1 opens its Lua reference
   entry" (the F1 half; share it with 44b by test, not by line),
   `script-editor.spec.ts` "MANUAL: from the editor … and from the
   Scripts page".

### 44d — The Scripts window, the phone host, docs (after 44a–c land, or as the integration step)

Uses from 42: the window frame (Lykta, dark and Paper), `useWindowChrome`, the `menu` place for look
frames in the phone's ESC menu, and the `WindowsHandle` API unchanged.

1. Check that the Scripts window keeps its Lykta frame on every page while
   the title and note follow the top frame: page (title "Scripts"), then
   Edit (note = name), then F1 (note "Manual"), and back down. Check the title, note, focus dimming, the X, and Esc at
   each level. Check the close request with unsaved changes: X → the
   prompt; Keep editing keeps the window; No closes. Check the bar
   icon's mark and the stored place. Check a small window (360 × 260 px)
   and a large one, on dark and on Paper.
2. Phone: ESC → Options → Scripts → panel → settings → Edit → Manual →
   back. Check the touch targets and that a tap never opens the on-screen
   keyboard by mistake.
3. E2e (Scripts parts only): `windows.spec.ts`, `menubar.spec.ts`,
   `chrome.spec.ts`, `esc-click.spec.ts`, `phone-touch.spec.ts`,
   `popup-focus.spec.ts`, `settings-popup.spec.ts`, `scripts.spec.ts`,
   `script-fields.spec.ts`, `script-panes.spec.ts`,
   `script-pane-runs.spec.ts` (most only open the window or the page
   and reach the list: update the selectors to the new hooks below).
   Unit: `tests/unit/chrome-frames.test.tsx`, `menubar.test.ts`,
   `app-menubar.test.ts` where they touch Scripts.
4. Docs: **ADR 0129** (assigned by the main session; parallel stages
   never take "the next free number" themselves). It collects the
   decisions 44a–c report: letters, the phone drill-down, the second-tap
   change, the status text, the class hooks, the dialog overlays, the
   one window frame (Lykta on every page, Glass dropped; owner
   2026-11-07) with the note per top frame (the highlight API is ADR
   0127's). Also an
   ADR 0121 addendum (layout superseded by the new look; behaviour kept)
   and spec §2.10 (stage 42 adds the §5 rows). README lines are wave 3's;
   the About text's Scripts lines are stage 47's (`about.tsx`): list the
   facts in the report.

### Test hooks (agree on these so 44d and the other packages can write tests in parallel)

| Hook | Where |
|---|---|
| `.wc-scr` | the Scripts page root (inside the box or window) |
| `.wc-scr-row[data-name]`, `.wc-scr-row.is-on` | index rows, the selected one |
| `.wc-scr-tog`, `.wc-scr-name`, `.wc-scr-lock`, `.wc-scr-mark`, `.wc-scr-error` | parts of a row |
| `.wc-scr-panel`, `.wc-scr-title`, `.wc-scr-status` | the panel (replaces `.wc-scr-frame` / `.wc-scr-top`) |
| `.wc-scr-set[data-set=<name>]`, `.wc-scr-set.is-cur`, `.wc-scr-input` | setting tiles, the keyboard's tile (replaces `.wc-scr-cursor`), the typing input |
| `.wc-scr-help` | the help well (scrolls) |
| `[data-btn=NEW|IMPORT|MANUAL|EDIT|EXPORT|RENAME|DELETE|RESET|DUPLICATE|SAVE|FIND]` | buttons (the kit's `GlassButton id`) |
| `.wc-lk-flash` | the flash |
| `.wc-lk-dialog[data-dlg=new|rename|delete|export|import|restore|unsaved]` | dialogs (stage 42's `Dialog`) |
| `.wc-sed`, `.wc-sed-status`, `.wc-sed-problem`, `.wc-sed-tools` | editor |
| `.wc-sman` (the frame's root), and stage 42's `.wc-lk-mtoc li[data-i]`, `.wc-lk-mtoc li.is-on`, `.wc-lk-mtext section[data-i]`, `.wc-lk-mfind input`, `.wc-search-count` | manual |
| `.wc-win[data-win="scripts"]`, `.wc-win-t`, `.wc-win-n` (stage 42; no `data-look`) | the window |

## Tasks

- [ ] Stage 42 merged; its API in place (see "Uses from stage 42"); gaps noted
- [ ] 44a: `ScriptsFrame` as a look frame in the large box; three
      breakpoints by container query; index, panel, help column; foot
- [ ] 44a: setting tiles (switch, stepper, choice, text) with keys,
      mouse and touch; Reset all; flashes as before
- [ ] 44a: keys (zones, letters N I M E X R D), selection, Esc levels;
      back from the editor on the button row
- [ ] 44a: dialogs as overlay frames with `Dialog` (New, Rename, Delete, Export,
      Import, Restore); file picker; flashes
- [ ] 44a: phone drill-down with settings; `on · at login`; guide sentence
- [ ] 44a: `helpBlocks` + DOM help; model pruned; unit and e2e tests
- [ ] 44b: editor C in the large box and the Scripts window (Lykta); tools, read-only
      plate, Duplicate; status line; `Modified · Ln, Col`
- [ ] 44b: stage 42's lantern code theme on the buffer (`.wc-code`);
      pop-up plates (dark and Paper)
- [ ] 44b: find row in the well (42's lantern panel, `top`); unsaved
      prompt as an inline `Dialog` with `useUnsaved`; e2e tests
- [ ] 44c: the script manual hosts stage 42's `LookManual` (contents with
      counts, links, highlighted examples, find in the head); checked
      against `manual-a.html`; F1 targets; e2e tests
- [ ] 44d: Scripts window: one Lykta frame on every page, note per top frame, inline Back, close
      request, bar mark; dark and Paper; small and large window
- [ ] 44d: phone ESC → Options → Scripts end to end
- [ ] 44d: remaining e2e/unit selector updates; ADR 0129; ADR 0121
      addendum; spec §2.10; About facts listed for stage 47, README for
      wave 3
- [ ] Performance checks (below), numbers in the ADR
- [ ] `npm run typecheck`, lint, `npm test`, `npm run test:e2e`,
      `npm run build` all green
- [ ] Screenshots: start (1440×900, 1280×720), window (large, small, dark,
      Paper), phone (390×844) for each page, compared with the mockups
- [ ] Test guide for the owner (below) checked against the build

## Test plan

Unit (vitest, happy-dom):

- `scripts-model`: `scriptState` (incl. `on · at login`), steps, clamps,
  choices, `rowProblem` and the list's error lines.
- `help-text`: `helpBlocks` gives the same block decisions as `typesetHelp`
  for every bundled script's `@help`. Check paragraphs, items, tables
  (with the ends-with-`.` rule), pre and headings. `typesetHelp` stays
  byte-identical, so `#script help` does not change.
- The Scripts page frame: rows, padlock, toggle by Enter, arrows, letters,
  rename and delete through the dialogs, and the "no library" note.
- (`look-manual-find` is stage 42's and tested there.)

E2e (Playwright). Update the specs listed per package. New cases:

- The page at three container widths (start box at 1440, a window at
  ~900 px and ~560 px, the phone), with the help moving column → under
  the panel → drill-down.
- Letters N I M E X R D, and no letter firing while a field is typed in.
- The editor's tools: they dim while typing; Save is disabled when the
  buffer is clean; Duplicate on a bundled script.
- The Scripts window keeps one frame on every page (stage 42's Lykta),
  and its note (`.wc-win-n`) shows the script name with `•`
  when dirty.
- The manual: F1 targets, link to a Lua entry, find count and navigation,
  the narrow contents overlay.
- Phone: settings change on the phone, and the value is seen by the
  running script in game.

Grep before and after for every old selector so nothing is left behind:
`rg "wc-scr-|wc-sed|wc-sman|wc-msearch|wc-search" tests/`. The old
grid-only hooks (`wc-scr-frame`, `wc-scr-top`, `wc-scr-cursor`,
`wc-scr-buttons`, `wc-scr-list`, `wc-scr-import-code`, the TUI
`wc-scroll-track/thumb` in Scripts tests) must be gone or mapped to the new
hooks.

## Performance notes

The editor and the manual must stay as fast as today. Measure a
production build (`npm run build && npm run preview`), not the dev
server (ADR 0125 addendum: Firefox runs at half speed there).

- **Typing latency.** CodeMirror owns the buffer. The Preact frame must
  not re-render on each keystroke beyond the status line: keep position,
  dirty state and diagnostics in small state, and never re-create the
  view or its extensions on render. Use `useRef` for the view, as today.
  The tools' "typing" dim is one class toggle with a single timer.
  Lint stays at 300 ms with the hold-back.
- **No blur under the code.** The code well is opaque (or close to it).
  No `backdrop-filter` over the scrolling text area. The tools pill may
  blur (it is small). In-game windows have no `backdrop-filter` at all
  (ADR 0127; the window body is opaque); still give the well its
  own opaque background.
- **The sky behind a big box** keeps its ADR 0124 budget. Do not add
  canvas or animation work. Stage 42 runs the sky at its calm rate while
  a large box covers the window; the editor gets that for free.
- **The manual** renders only when opened (lazy editor chunk, as today). Its
  ~190 sections are built once (memoised; the Lua highlighting of examples
  is done once too) and laid out lazily with `content-visibility: auto`.
  The scroll spy must not read layout per scroll event. Find is debounced,
  works on precomputed plain text per section, and marks through the
  Highlight API (no DOM rewriting of the text).
- **The Scripts page** is in the chrome chunk (start page). Keep its CSS
  and JS lean. The help DOM is built per selected script (memoised by
  name and `updated`). The 1 s running poll runs only while the page is
  on top and visible.
- **Checks to record in the ADR:** (1) type 300 characters into a 400-line
  script in Chromium and Firefox, on the start page and in a window: no
  long task over 50 ms and keypress-to-paint p95 no worse than `main`
  (compare against `main` with a small Playwright script under `bench/`
  or a Performance trace); (2) open the manual cold and warm (time to the
  first paint of the text); (3) find "timer" in the manual (time to the
  first mark); (4) start page fps with the Scripts page open
  (`bench/start-page-bench.ts` style, `?skyStats`): within 2 fps of the
  Profile list.

## Test guide

Branch only (the main session names it): `npm run dev`, open
http://localhost:5173/. For timing and smoothness use
`npm run build && npm run preview`. Try Chromium and Firefox. In game
you can use the demo or a real login.

1. **Start page → Scripts.** The menu panel grows into the big box (no
   wordmark while it is open). Three columns: the index, the script's
   panel and its help. Back at the top left and Esc return; the box
   shrinks back into the menu.
2. **Pick mercenaries.** Change `autopay` (switch), `cost` (10/20),
   `minutes` (◂ ▸, or type a number), and `warn` (type a word to see the
   error, then a number). The changed mark and "default …" appear, and
   Reset all puts them back. The keys: Tab between the zones, ↑↓,
   ←→, Enter, and the letters N I M E X R D.
3. **Help.** Read almanac's and keymanager's long help in the right column;
   PgUp/PgDn scroll it. Make the window narrower: the help moves under
   the panel, and further down the index and the panel become two steps.
4. **Dialogs.** New (a bad name, then a good one, which opens the
   editor), Rename, Delete (Y), Export (one, then the backup), Import a
   `.lua` (the code first) and the backup (what it holds). Everything is
   added turned off.
5. **Editor.** Edit a script. The name is in the hood, and Save, Find and
   Manual are in the corner of the code (tooltips name the keys). They
   dim while you type. Try Ctrl+Space, `tempTimer(` (signature),
   hover, an error (red dot and line), Ctrl+F / Ctrl+H, F1, and Esc with
   unsaved changes (the prompt). Open coinlooter: read-only, then
   Duplicate.
6. **Manual.** From the editor (F1 on a name) and from the page. The
   contents follow the scroll, n/p jump chapters, links work in the Lua
   index, and Ctrl+F finds with Case/Word/Regex. On a narrow window the
   contents are behind a Contents button.
7. **In game.** Open the Scripts window (bar icon or `#scripts`). The
   window has the Lykta frame on every page: Edit shows the script's name
   as a note and F1 shows "Manual"; the frame itself never changes. The
   small Back on sub-pages and Esc go back a level; X with unsaved
   changes asks first. Move and resize it, make it small, and try the
   Paper background.
8. **Phone.** ESC → Options → Scripts: the list, a tap opens a script's
   panel, change a setting, Edit, Manual, back.
9. **Speed.** Typing in the editor and scrolling and finding in the manual
   should feel as quick as before.

Feedback wanted: the instrument panel tiles (size, density), the help
column's typography, the editor's tools (too hidden, too visible?), the
one Lykta frame for the page, the editor and the manual in game, and the
manual's contents and find.

## Open questions for the owner (after testing)

The build follows the default until the owner answers.

1. **The second tap on the selected script no longer opens the editor**
   (Edit is in reach on the panel). *Default: removed.*
2. **The page's letters N I M E X R D** (new; the TUI page had none).
   *Default: these letters.*

## Owner feedback

(none yet)

## Uses from stage 42

The canonical names are in `docs/stages/42-look-pages-base.md` ("API" and
"Canonical names") and ADR 0127. Stage 42's files are read-only in wave 2.

1. **Layout B**: `Box size="large"` (the menu panel grows into the box; no
   wordmark, almanac or quote while it is open; Back / Esc reverses it;
   a short cross-fade with reduced motion; inset `--lk-box-m`, 6 px on the
   phone); `title` may change between renders (the editor's `name •`).
   The box's window is a flex column with `min-height: 0` and an
   inline-size container `wc-page`. Slots `BoxHead` / `BoxBody` / `BoxFoot`;
   `useBoxSettled()`.
2. **Places**: `useLookPlace(): 'start' | 'window' | 'menu'`; `Box` renders
   the iron box with Back on the start page, nothing of its own in a
   window (the window frame is the box), and a full-screen Lykta page with
   Back on the phone's ESC menu. **`InlineBack`**: the small Back for a
   window sub-page (rendered only in a window and only when the frame is
   not the stack's root; calls `nav.pop()`).
3. **Window frame**: one frame, Lykta (dark and Paper), the same on every
   page and sub-page; the top frame sets the title and note with
   `useWindowChrome({ title, note })` while it is on top, reverting when it
   pops; 8 edges, the grip,
   focus dimming, the stored place, the minimum (≥ 360 × 260 px) and
   `data-win` unchanged; `WindowsHandle` unchanged; look frames get a free
   body, old-look frames the cell grid.
4. **The phone's ESC menu**: look frames render in the `menu` place;
   old-look frames stay as they are.
5. **Overlay frames and dialogs**: `nav.push(node, { overlay: true })` (the
   frame below stays drawn, veiled and inert; keys go to the overlay; the
   flash reaches the frame below after the pop) rendering `Dialog({ title,
   dlg, buttons: [{ id, label, letter?, primary?, danger?, run }],
   onCancel, error?, anyKeyCancels? })` (`.wc-lk-dialog[data-dlg]`);
   `Dialog` with `inline` inside a frame (the unsaved prompt) with
   `useUnsaved` still in charge.
6. **Widgets** (they never take the stack's focus, except a field being
   typed in): `Field({ value, onInput, mono?, error?, hint?, placeholder?,
   autoFocus?, selectAll?, label? })`, `Toggle({ on, onChange, label })`,
   `Seg({ options, value, onChange, label })` (`aria-checked`; choice
   settings and the find toggles), icon-only `GlassButton({ icon, title,
   id?, primary?, disabled?, onClick })` and `small` / `primary` glass
   buttons, `Rule({ title, children? })` (Settings ─── Reset all),
   `Fold({ open, onToggle, label })`, `Well`, `.wc-lk-scroll`, the rows
   classes with `.is-on` and the zone tick `.is-cur`, `useListCursor`,
   `useButtonZone`, `letterAction`.
7. **Icons**: `book`, `save`, `find`, `duplicate`, `reset`, `lock`, `fold`,
   `up`, `down`, `prev`, `next`, `close`, and the existing `plus`, `pencil`,
   `rename`, `import`, `export`, `trash`, `back`, `check`.
8. **Tokens** `--lk-*` on dark and Paper (text, dim, faint, item, on, head,
   accent (mithril), danger, ok; `--lk-display`, `--lk-serif`, `--lk-mono`
   = the user's terminal font; `--lk-ts` with reduced motion).
9. **CodeMirror**: `lookCodeTheme()` and the `.wc-code` host class (token
   colours for `wc-lua-*`, lint and match marks, dark and Paper);
   `searchExtension({ look: 'lantern', top: true })`: the Find field,
   `n of m` (`.wc-search-count`), Case / Word / Regex, prev / next / close,
   a Replace row (Replace, All) when editable; keys and `searchFrameKey`
   unchanged.
10. **The manual**: `LookManual` (`contents: 'own'`, `find: 'head'`,
    `groups`, `link`, `example`, `initial`, `memory`, `ctl`) and its find.
11. **Flash and letters**: `LookFlash`, `KeyLabel`, `letterOf`.
12. **The sky**: the calm rate behind a large box is stage 42's; this stage
    adds no sky work.
