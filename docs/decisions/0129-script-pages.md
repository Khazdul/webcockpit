# 0129 — The Scripts pages in the new look

- Status: Accepted (stage 44 built in wave 2 of the broad pass; owner testing with stages 42–47)
- Date: 2026-11-07
- Related: stage 44 (`docs/stages/44-script-pages.md`), ADR 0127 (the look
  pages base), ADR 0125 (start surface and the lantern kit), ADR 0121
  (Scripts page behaviour; its layout is superseded here, see its
  addendum), ADR 0051 and 0053 (user scripts, header, backup), ADR 0013
  (frame stack), ADR 0015 and 0037 (editor host), ADR 0070 (find in the
  manuals), ADR 0075 (phone), ADR 0103 (in-game windows), ADR 0106 (the
  TUI scrollbars, gone from these pages), ADR 0108 (popup focus), ADR 0112
  (ESC menu on the phone only), ADR 0119 (Ctrl+F / Ctrl+H), ADR 0123
  (Lykta).
- Reference: `notes/research/start-menu-mockups/README.md` ("Round 7
  decisions"), `round7/scripts/` (`page-c.html`, `editor-c.html`,
  `manual-a.html`, `CONTENT.md`).

## Context

Stage 44 moves the three Scripts pages off the TUI cell grid into the
lantern look, in the directions the owner chose from round 7 on
2026-11-07: the Scripts page **C "Instrumentbrädan"**, the script editor
**C "Fokus"**, the manual **A "Boken"**. The same pages run in three
places: the start page (layout B's large box), the game's Scripts window,
and the phone's ESC menu. Four packages built it in parallel: 44a (the
page), 44b (the editor), 44c (the manual) and 44d (the window, the phone
host, the specs and the docs).

Owner decisions of 2026-11-07, recorded here:

- **One window frame.** The Scripts window and all its sub-pages (the
  page, the editor, the manual) use the **Lykta** frame. The window never
  switches frame when a sub-page opens; the mockups' Glass frame for the
  editor (`win-b`) is dropped. The top frame sets only the title and the
  note (`useWindowChrome({ title, note })`).
- Defaults accepted by not objecting (the round 7 review page):
  1. **Tooltips are enough** for Ctrl+S, Ctrl+F / Ctrl+H and F1; no key
     rows or hint rows anywhere.
  2. **Settings work on the phone** (new; ADR 0121 had none there): index →
     tap → the script's panel with its settings → "All scripts" back.
  3. **Sub-pages in an in-game window get their own small Back** (the
     editor, the manual); the window's root (the Scripts page) has none.
  4. **"on · runs when you enter MUME" becomes "on · at login"** on the
     start page; the toggle's flash stays a sentence ("It runs when you
     enter MUME."). The guide's sentence follows.
- Not taken: B's inspector rail instead of the signature pop-up; the
  editor keeps CodeMirror's pop-ups, restyled.

## Decision

### 44a — The Scripts page (C Instrumentbrädan)

**One look frame, three places.** `ScriptsFrame = lookFrame(…)` renders
`<Box size="large" title="Scripts" onBack={nav.pop}>` and calls
`useWindowChrome({ title: 'Scripts' })`. Box adapts: the large box with
Back on the start page, the bare window body in the Scripts window (no
Back: X, Esc or the bar icon close it), the full-screen box with Back in
the phone's ESC menu. Without a library: "Scripts are not available
here."

**Layout by container width** (on the box's `wc-page`, never the
viewport, so one rule set serves the start box, any window and the
phone):

- over 1000 px: index (228 px) | panel | help (1.05fr), hairlines between;
- 641–1000 px: index and panel; the help folds in under the panel;
- 640 px and under: the index alone; a tap or (narrow) Enter drills into
  the panel, "All scripts" (`data-btn=LIST`) returns; the panel's buttons
  go two by two.

The one help element is moved, never drawn twice: a ResizeObserver on
`.wc-scr` with the same thresholds sets `data-w="wide|mid|narrow"` and
decides where it is rendered; the drill-down is a class (`.is-drill`)
inside the narrow container query.

**Index rows:** the kit's Toggle (switch only), the name, the padlock
(tooltip "Bundled with WebCockpit: read-only. Duplicate it to change
it."), the mark (ok dot when running; "!" with the problem as tooltip when
failed) and the error line (Cannot load / last error / Syntax error from
the lazy compile check).

**Panel:** the Cinzel title and padlock, the summary, the status with its
dot (`on · running`, `on · starting`, `on · at login`, `on · not running`,
`off`) and "bundled · read-only"; Edit / Export / Rename / Delete (Rename
and Delete disabled for bundled scripts, "Bundled scripts are
read-only"); the problems; `Rule` "Settings" with Reset all; the setting
tiles; `Rule` "Commands" (aliases in mono, keys as key caps); the help
(`Fold` "Help" and a well holding the typeset `@help`; the fold state is
kept across scripts).

**Setting tiles** (`script-settings.tsx`, `auto-fill minmax(min(100%,
210px), 1fr)`): boolean is the kit Toggle; number is ◂ value ▸ with its
unit (glass arrows disabled at the range ends; a click on the value
types); choice is the kit Seg plus unit; string is a text well. Typing
uses a real focused `<input class="wc-scr-input">`; Enter keeps, Esc
cancels; pressing another tile commits an open edit first (no
blur-commit, as before). A changed value gets a lit diamond and "default
…". Values save at once through `setSetting` with the pending map kept.

**Help in the DOM.** `help-text.ts` gains `HelpBlock` and `helpBlocks`
(additions only; `typesetHelp` and `#script help` are byte-identical):
headings → h4, paragraphs → p, items → ul/li, tables → a dl grid, pre runs
→ pre. A table goes term-over-description when its widest term (7.8 px a
character) is over 42 % of the help width or under 160 px would be left
for the descriptions (`helpStacks`), the DOM version of the 40 % rule.
The help DOM is memoised by script name, `updated` and the stacking flags.

**Model.** `scripts-model.ts` loses the cell layout (`scriptsLayout`,
`buttonRows`, `controlSegs`, `detailRows`, `helpLines`, `cutRow`,
`listLines`, …). `scriptState` is look-neutral (`cls: ok|err|off`, `dot:
on|wait|off|bad`, `mark: ok|err|null`; `glyph` kept). New pure helpers:
`rowProblem`, `panelProblems`, `panelKeys`, `shownValue`, `anyChanged`,
`defaultText`, `nextChoice`, `typedNumber`, `countText`, `noHelpText`.

**Keys** (ADR 0121's, re-zoned):

- Zones list, panel, foot; Tab / Shift+Tab cycle them.
- Index: ↑ ↓ (↓ on the last row goes to the foot; ↑ on the first stays),
  Home / End, Space and Enter toggle (narrow: Enter drills in, Space
  toggles), → enters the panel at its first setting (else the button row).
- Panel: ↑ ↓ over the button row, Reset all, each setting and the help
  fold; ← → / Enter / Space act; a digit, `-` or `.` starts typing a
  number; ← at the first button or Esc returns to the index.
- Foot: ← → walk the buttons, ↑ returns to the index.
- PgUp / PgDn scroll the help column (wide) or the panel, from anywhere.
- **Letters N I M E X R D** (New, Import, Manual, Edit, Export, Rename,
  Delete), marked in the labels, through `letterAction` (never in a field).
- Esc in the index or the foot leaves the page. After Edit (and Export /
  Rename / Delete from the panel) the keys are on the panel's button row,
  so coming back from the editor Esc goes to the index first; New also
  returns onto the button row; Delete moves the cursor to the neighbour.

**Mouse and touch.** No `useListCursor` on the index (a pointer move must
not change the selection: hover only lightens). A click selects (and
drills in when narrow); a mouse double click opens the editor (the
pointer type is read on pointerdown); a click on the switch toggles
without moving the keyboard's zone; a press on a tile puts the keyboard
there. **The touch "second tap on the selected name opens the editor"
is removed** (Edit is in reach on the panel). Scrolling into view follows
keys only, never a pointer (44d: also the drill-down tap, which used to
scroll the first setting into view and hid the name and buttons in a
small window).

**Dialogs** (`script-dialogs.tsx`): six overlay frames (`nav.push(…,
{ overlay: true })`) on the kit's `Dialog`, `data-dlg = new | rename |
delete | export | import | restore`:

- New / Rename: Field, hint, error line; Enter confirms; New then opens
  the editor on the template.
- Delete: Cancel (N, the primary, so Enter cancels) and "Yes, delete" (Y,
  danger); any other key cancels (today's y/N).
- Export: two rows (`data-k=one|all`) with ↑ ↓ and Enter, and the note.
- Import `.lua`: the warning, the note, the code in a well with a sticky
  line-number gutter (one `pre` each, no per-line DOM), ↑ ↓ PgUp PgDn
  Home End Space scroll it; Import (I, also Y) is the primary, so Enter
  imports (the old page paged with Enter).
- Restore: the warning, the question, the summary lines, the note;
  Restore (R, also Y).
- The hidden file input and every flash keep their wording.

**Performance.** The running-state poll runs every 1 s only while the
page is on top and `!document.hidden`. No `backdrop-filter` in
`scripts.css`. `scripts.css` lands in a shared chunk with
`scripts-model` (the editor chunk imports it): 16.1 kB, 3.7 kB gzip.

### 44b — The script editor (C Fokus)

**A look frame.** `ScriptEditor` renders `<Box size="large" title={name
+ (dirty ? ' •' : '')} onBack={close} winClass="wc-sed-win">`. In the game
it calls `useWindowChrome({ title: 'Scripts', note: name[ •] })` inside
the Lykta window and puts an `InlineBack` in a `BoxHead` row above the
well (only when it is a sub-page). The Box's Back, Esc, the InlineBack and
the window's X all go through one `close()`, which asks when there are
unsaved changes.

**The root** is `.wc-sed` with `display: contents`, the frame's direct
child (Box wraps its content on the start page and in the menu), so the
`.wc-frame:not([hidden]) > .wc-sed` hooks survive; it carries
`data-script`, `data-readonly`, `data-zone` and the pop-up tokens
(`--lk-pop-*`, Paper under `[data-light] .wc-sed`).

**The well.** CodeMirror fills an opaque well. The tools sit in a dark
pill at the top right: Save (primary, disabled when clean), Find, Manual,
icon-only glass buttons with the tooltips "Save (Ctrl+S)", "Find and
replace (Ctrl+F, Ctrl+H)" and "The manual at the name under the cursor
(F1)". A bundled script gets Duplicate (wide, primary) instead of Save,
and the "bundled · read-only" plate at the top left past the gutter
(bottom left under 600 px, so it never meets the tools). The tools dim to
35 % for 1.6 s after input (one class on the root, one timer), come back
on hover or with the keyboard on Duplicate, and hide while the find row
is open (`lua-cm`'s new `onSearch`). Find is stage 42's lantern panel at
the top (`searchExtension({ look: 'lantern', top: true })`).

**The status line** under the well: the state dot and text, the first
problem (ellipsis; the full text is the title of `.wc-sed-status`), the
flash (`LookFlash`, `useLocalFlash`) in the middle, "Modified · Ln, Col"
on the right; it wraps when narrow.

**The unsaved prompt** is stage 42's inline `Dialog` (`dlg="unsaved"`):
"Unsaved changes", "Save changes to **x**?", Keep editing / No, discard
(N, danger) / Yes, save (Y, primary); "Saving…" with the buttons disabled
while it saves. `useUnsaved(unsaved, modal !== null)` stays, so the
window's close request waits for the answer.

**No re-render per keystroke.** The buffer text is a ref; `dirty` is a
boolean that changes only on transitions; the cursor position is a small
store read by its own `PosLine`; the 1 s running poll lives in
`StateLine`, only while the editor is on top; the view is created once in
a layout effect. Focus: the buffer has it in the `buffer` zone; on
Duplicate and while the prompt is up the stack host has it, so the
prompt's letters never type into CodeMirror and the glass buttons never
take it.

**Pop-ups as lit plates.** `lookCodeTheme()` replaces `cm.ts`'s `theme()`;
`luaTheme()` holds the plates' structure (completion list of 10 rows of 25
px, the info box as its own plate 4 px beside it, hover, signature help,
lint message) and the colours are CSS custom properties, so one theme
serves dark and Paper and a window turning Paper needs no reconfigure.
Doc boxes: Cormorant text, the terminal font for signatures and
parameter names, small-caps "Parameters" / "Returns", the example in a
well with the `wc-lua-*` classes. `tooltipSpace` is the nearest
`.wc-lk-win`, so pop-ups stay inside the box or window. API names (`send`,
`tempTimer`, `store.get`) are marked `wc-lua-std` in the visible lines
(longest known dotted prefix, comments and strings skipped by the syntax
tree), as in the mockup and the manual's examples.

**No blur anywhere in the editor**, against the stage file's "the pill
may blur", chosen on the measurements below: the box window takes stage
42's no-blur fallback (`--lk-large-blur: none`, a 0.86 fill), the pill is
a 0.86 fill, and `--lk-glass-blur: none` applies inside `.wc-sed`. The
editor calls `useSkyPause(true)` while it is on top: its box is in effect
opaque, so only the ~28 px margins show the resting sky.

**Focus after the box's morph** (44d). On the start page the editor's box
is hidden by layout B's `visibility` animation while it morphs, and
Firefox drops the focus of the buffer inside it; nothing re-rendered the
editor afterwards, so typing did nothing until a click. The editor now
calls `useBoxSettled()`: settling re-renders it and its focus effect takes
the focus back. Keys typed during the ~0.3 s morph are still lost in
Firefox (a kit matter, see Consequences).

**Phone:** full width, a smaller code font (12.5 px), Save, Find and
Manual tappable (≥ 40 px); the old tappable hint words go.

### 44c — The script manual (A Boken)

**Host.** `ScriptManual` is a `lookFrame` hosting stage 42's `LookManual`
over `scriptManualSections()` with `contents: 'own'`, `find: 'head'`,
`groups = SCRIPT_MANUAL_GROUPS` (Guide, API reference, Lua reference, with
counts; `scriptManualCounts()` gives the same numbers for tests),
`initial` from `manualSectionOf` through the new pure
`scriptManualSection(name?)` (the entry; the Lua index for a library
table; Lua basics for a keyword; Sandbox and limits for a removed name;
The header for an `@tag`; else Getting started), `link(name) =
indexLinkOf('- ' + name + ':')?.section`, examples as
`codeLine(line, 'lua', n => apiDoc(n) !== null)` cached per line in a
module-level Map, and a module-level find memory. `openScriptManual(nav,
name?)` keeps its signature; `script-reference.ts` gains only
`SCRIPT_MANUAL_GROUPS` and `scriptManualCounts()`.

**Places.** Start page: Box "Script Manual" with Back. Window:
`useWindowChrome({ title: 'Scripts', note: 'Manual' })` and an
`InlineBack` in the reader's head row only when it is a sub-page. Menu:
the Box's own Back. `.wc-sman` is the class on the frame's Box (on the
start page it is not a direct child of `.wc-frame`).

**Keys.** The frame's `useKeys` forwards to `ManualCtl.key`; an unhandled
Esc falls through to the stack's pop, so the order is the contents
overlay, then a non-empty find, then back. The editor below keeps its
buffer, cursor, undo history and search.

**Local CSS** (`script-manual-frame.css`): the head wraps (Contents on one
row, the find on the next at phone width); the window's Back is absolute
at the left of the head with its width measured once
(`--wc-sman-iback-w`); narrow (≤ 700 px on the reader's own container)
the Contents button gets the margin instead of the find.

The find searches on every input (stage 42's reader; ADR 0127 measured
each keystroke as cheap), not "debounced ~180 ms" as the stage file said.

### 44d — The Scripts window, the phone host, the specs

**The window** keeps one Lykta frame (`.wc-win-look`, the free body) on
every page; the title is always "Scripts"; the note follows the top
frame: none on the page, the script's name (with " •" while unsaved) in
the editor, "Manual" in the manual, reverting as each pops. Checked end
to end (`windows.spec.ts`): the same `.wc-win` element throughout, one
hood, the inline Back on sub-pages only, focus dimming and a press on the
bar taking the keys back, X with unsaved changes → the prompt, Esc keeps
editing (the window stays), N discards and closes, the bar icon's
`is-open` mark, Esc at each level, a small window (the minimum, 62 × 20
cells, at least 360 × 260 px) on dark and Paper with the page (drill-down
width), the editor (tools and status) and the manual (head, Contents)
inside the window, and the stored place across a reload.

**A press inside a window keeps the keys there.** The cockpit's mouseup
handler refocused the game input for any click whose mouseup reached it;
the frame stack stops mouseups except inside `[data-wc-native-mouse]`
(CodeMirror's content, the manual's text), so a click in the Scripts
window's editor buffer handed the keys to the game input (also on `main`,
with the TUI editor). The cockpit now leaves targets inside
`.wc-windows-host` alone: the windows set their own focus on the press
(ADR 0103). One line in `src/layout/cockpit.ts`.

**The phone.** ESC → Options → Scripts renders the look frames in the
`menu` place (`phone-scripts-menu.spec.ts`): the index alone, a tap opens
the panel (status, buttons two by two, settings), a switch tap saves the
setting and the running script sees it at once (a trigger echoes
`settings.loud`), Edit and the Manual open in the same place with the
script's name and "Script Manual" in the hood, Back walks down to Options.
Every target is at least 40 px high and inside the viewport; a tap on a
row, a switch or a button never puts the focus in a field. Edit puts the
focus in the buffer (as before stage 44): that keyboard is asked for.

**Test hooks** (agreed in the stage file; what was built):

| Hook | Where |
|---|---|
| `.wc-scr[data-w=wide\|mid\|narrow]`, `.wc-scr-idx`, `.wc-scr-panel`, `.wc-scr-helpcol`, `.wc-scr-help` | the page and its columns |
| `.wc-scr-row[data-name]` `.is-on` (selected) `.is-cur` (keyboard); `.wc-scr-tog [role=switch]`, `.wc-scr-name`, `.wc-scr-lock`, `.wc-scr-mark.is-ok\|is-err`, `.wc-scr-error` | index rows |
| `.wc-scr-title`, `.wc-scr-status.is-ok\|err\|off`, `.wc-scr-problem` | the panel |
| `.wc-scr-set[data-set]` `.is-cur`, `.wc-scr-input`, `.wc-scr-chg`, `.wc-scr-def`, `.wc-scr-val`, `.wc-scr-str` | setting tiles |
| `.wc-scr-foot`, `.wc-scr-count` | the foot |
| `[data-btn=NEW\|IMPORT\|MANUAL\|EDIT\|EXPORT\|RENAME\|DELETE\|RESET\|LIST]` | page buttons |
| `.wc-lk-dialog[data-dlg=new\|rename\|delete\|export\|import\|restore\|unsaved]`; `.wc-scr-warn`, `.wc-scr-codebox`, `.wc-scr-gut`, `.wc-scr-src` | dialogs |
| `.wc-sed[data-script][data-readonly][data-zone]`, `.wc-sed-well`, `.wc-sed-tools [data-btn=SAVE\|DUPLICATE\|FIND\|MANUAL]`, `.wc-sed-ro`, `.wc-sed-status`, `.wc-sed-problem`, `.wc-sed-pos` | the editor |
| `.wc-sman`, `.wc-sman-iback`; the reader's `.wc-lk-mtoc`, `.wc-lk-mtext section[data-i]`, `.wc-lk-mfind input`, `.wc-search-count`, `[data-btn=contents]` | the manual |
| `.wc-win[data-win=scripts]`, `.wc-win-t`, `.wc-win-n`, `.wc-lk-iback` | the window |

The old grid hooks (`wc-scr-frame`, `wc-scr-top`, `wc-scr-cursor`,
`wc-scr-buttons`, `wc-scr-list`, `wc-scr-import-code`, `.wc-scr-row
[data-script]`, the TUI `wc-scroll-*` and `.wc-ped-bufbar` in Scripts
tests, the "─── Scripts ───" title) are gone from the specs. The TUI
scrollbar cases became native-scroll checks (the Scripts help and index,
the Import dialog's code, the editor's buffer); the manual's TUI-bar case
was dropped.

### Wave 3 — fixes after review

- **The narrow drill-down follows the keys.** On a narrow page (640 px
  and under) the panel shows exactly while the keys are on it
  (`narrow && zone === 'panel'`), instead of a separate `drill` flag. A
  letter (E X R D), a panel button, a setting press, or New's "back from
  the editor" that moves the keys to the panel now also shows the panel,
  and a resize from wide to narrow shows whichever side holds the keys.
  Before, X from the index then Esc left the keys on the hidden panel.
- **A typed setting is kept unless Esc drops it.** A number or string
  being typed is saved on Enter and also when the tile is left any other
  way: the input's blur (a tap elsewhere, the phone's keyboard closed and
  a tap on empty space), All scripts, or a click on another row. Esc is
  the only cancel. The edit ends once: the page clears its edit ref at
  once, so the blur that follows Enter or Esc saves nothing twice.
- **A double click on a row's switch is no edit.** The switch's span
  stops `dblclick`; a double click on the rest of the row still opens
  the editor.
- **Dialogs pop only while on top.** New, Rename, Delete, Import and
  Restore record the stack depth before their await and pop only if it
  is unchanged (as `editScript` does). A New left with Esc while the
  script is being created keeps the script, opens no editor and flashes
  "Created …". Delete has a busy guard against a second Y.
- **Touch-size completion rows.** Under `pointer: coarse` the completion
  list's rows are 40 px (six visible, about the old ten rows' height),
  and the signature, lint and hover plates are capped at the viewport
  less 40 px so they stay inside the phone's frame.

## Measurements

All headless on a machine shared with other agents (load average 2–15);
treat them as rough. Wave 3 measured the page's fps headed (below).

- **Typing** (44b; 300 characters at 35 ms into the middle of a 400-line
  script; production builds; keydown to the next frame, p95 / max ms; base
  = the stage-41 tip with the old grid editor):
  - Chromium, start page: base 33.0 / 47; new 21.3 / 24.
  - Chromium, window: base 18.0 / 21.5; new 20.2 / 22.6.
  - Firefox, start page: base 10.7 / 16.7; new 14.6 / 21.6.
  - Firefox, window: base 13.7 / 40.1; new 9.1 / 14.1.
  - No long task over 50 ms (Chromium). Before the no-blur choice: the
    large box's blur made Chromium's start-page p95 313 ms; the kit glass
    buttons' blur in a window made Firefox's p95 128–238 ms; the sky
    running behind the box made Firefox's start-page p95 ~150 ms.
- **The manual** (44c; production build, medians of 5, start page →
  Scripts → Manual):
  - open, cold / warm: Chromium 64 / 35 ms (the old TUI manual 354 / 349
    ms, long tasks up to 655 ms); Firefox 179 / 112 ms (old 357 / 251).
  - find "timer" to the first mark: Chromium 132 ms, Firefox 369 ms
    (headless, the sky and the morph running; ADR 0127's headed numbers
    are 10.5 / 11.9 ms).
- **Start page fps with the Scripts page open** (44d; production build,
  `vite preview`, 1440 × 900, rAF over 5 s after settling, headless):

  | | menu | Profile list | Scripts page | History | About | Scripts, blur off |
  |---|---|---|---|---|---|---|
  | Chromium fps | 60.0 | 60.0 | 34.5 | 59.0 | 28.2 | 60.0 |
  | Firefox fps | 18.3 | 17.7 | 9.9 | 11.8 | 10.8 | 40.8 |

  The target "within 2 fps of the Profile list" is not met headless, but
  the cost is the kit's large-box `backdrop-filter` over the moving sky
  in software rendering, not the page: every full-width large box drops
  the same way (About), and with `backdrop-filter` switched off the
  Scripts page runs at 60 in Chromium. ADR 0127 measured the blurred
  large box headed on the owner's GPU at 58–60 fps.

  **Headed (wave 3):** real windows on the owner's Iris Xe, 1728 × 1000
  @2 and 390 × 844 @3, production build: the Scripts page runs at 60.0
  fps in Chromium and 59.4–60.0 in Firefox, so the drop is headless only.
  About runs at 58.0 (Chromium) and 55.7–56.4 (Firefox); that is its
  wordmark's sheen, not the blur. Headless Chromium (SwiftShader)
  reproduces the drop (Scripts 22.2 fps on the build, 60.0 with the blur
  off). Nothing to do on this page; the software-compositing case (a
  machine without GPU compositing) belongs to stage 42's blur rule (ADR
  0127, "The blur rule", and its wave-3 finding).
- **Chunks** (production build): chrome JS 265.3 kB (93.5 kB gzip);
  scripts chunk 279.5 kB (85.5 kB gzip); editor 651.8 kB (216.3 kB gzip).
  44b's import of the kit barrel from the editor chunk moved the barrel
  into a shared `look` chunk (start path about +1.5 kB gzip).

## Consequences

- ADR 0121's layout is superseded; its behaviour stays (addendum there).
  spec §2.10 describes the new page, editor and manual.
- `typesetHelp` stays for `#script help`; `helpBlocks` serves the page.
- The grid editor's `.wc-ped*` rules stay for wave 3's sweep.
  `scriptManualLayout()` in `script-reference.ts` was unused once the
  lantern manual landed and is removed (wave 3); the profile Help keeps
  the TUI `ManualView`.
- **For wave 3 (kit, stage 42's files):**
  - Layout B hides the new box with a `visibility` animation while it
    morphs; Firefox drops the focus of anything inside it, so keys typed
    during a morph are lost there (the editor takes the focus back once
    the box settles). An `opacity`-based hide would keep the focus.
  - Kit glass buttons and `InlineBack` keep `backdrop-filter:
    var(--lk-glass-blur)` in dark windows; set `--lk-glass-blur: none` on
    `.wc-win-look` (the editor sets it locally).
  - `Field`'s `autoFocus` runs in `useEffect`: keys typed the instant a
    dialog opens are dropped (move it to `useLayoutEffect`).
  - A switch-only `Toggle` variant; `Rule` taking a node as its head;
    `DialogButton` with an icon; a head slot (Back) on `LookManual`, and
    `.wc-lk-mhead` wrapping.
  - In the phone's `menu` place the Box's Back (y 22–62 px on a Pixel 7)
    overlaps the top 5 px of the content (from y 57: the index's first
    row, the editor's well, the manual's Contents button).

## Open questions (built with the default)

1. The second tap on the selected script no longer opens the editor.
   *Default: removed* (a mouse double click still does).
2. The page's letters N I M E X R D. *Default: these letters.*
3. Narrow page: Enter drills into the panel and Space toggles (ADR 0121
   said Enter toggles); on wider pages both toggle.
4. Import dialog: Enter imports (the mockup's primary); the old page paged
   the code with Enter.
5. The sky rests behind the script editor (its box is effectively
   opaque). *Default: paused.*
6. No blur at all in the editor. *Default: none*, on the measurements.
7. API names coloured in the editor's buffer. *Default: on.*
8. The manual's find query is kept across opens (Esc clears it before it
   leaves, so it survives only a Back with a query typed).
