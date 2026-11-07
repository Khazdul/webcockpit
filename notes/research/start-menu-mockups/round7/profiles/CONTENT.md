# Round 7 · profiles group · content inventory

What the real pages hold today (read from the code on 2026-11-07), so the mockups show real content and
keep every real action reachable. Paths are under `src/`.

## 0. How the pages are reached

- **Profile list** (`chrome/frames/profiles.tsx`, built in the new look by another agent): table Name ▲ /
  Selected (✓ on the chosen profile); buttons SELECT, NEW, EDIT, RENAME, DELETE, IMPORT, EXPORT, BACK.
  Enter (or a click) on a row selects it; on the profile that is already selected it opens the editor.
  - EDIT → the **Profile editor** (`editor/frame.tsx`, via `frames/profile-edit.ts` `editProfile`, a lazy
    chunk; error flash `Could not open the editor: …`, `No profile "x".`). Not live: isLive = false.
  - IMPORT → the native file picker (multiple files) → `import-load.ts` → the **Import report**. On
    failure the list flashes `Import failed: …`. After the report: flash `Imported "gibur" from gibur.set.`
  - EXPORT (of the list) only downloads the profile text: flash `Exported gibur.tt.` / `Export failed: …`.
    It is not the Export editor.
- **In game**: the menu bar's Profile button, `#profile`, Esc menu → the **Profile window**
  (`chrome/windows.tsx`): a movable/resizable window titled `Profile:` with the profile name as a note.
  Its root frame opens the editor for the active profile at once (isLive = true while connected); when
  the editor is left the window closes, unless the editor left with a failure flash: then the root page
  shows the flash, `Enter Edit`, `ESC Close`.
- **Export editor**: History → EXPORT on a session with a captured log (`frames/export-editor.tsx`).
  Desktop and tablet only: History flashes `Export: desktop only.` on a phone.

## 1. Profile editor (`editor/frame.tsx`, `logic.ts`, ADR 0015, 0037, 0070, 0104, 0105, 0119)

Title `─── Profile Editor: Gibur ───`; a toggle of three views: **LITE · EDITOR · HELP**. Each open starts
in LITE. HELP is laid over LITE or EDITOR (their state is kept).

### LITE
- **Kind row** (five tabs): ACTIONS, ALIASES, HIGHLIGHTS, MACROS, SUBSTITUTES.
- **Entry list**: two columns, the headers are the kind's field labels — Pattern | Commands (actions,
  aliases), Pattern | Color (highlights), Key | Commands (macros), Text | New text (substitutes).
  Sorted by pattern (macros by key), entries made in this visit last. The body preview is the first
  non-blank line, `…` when cut or more lines follow. Highlights preview their body in their own colours.
  The last row is `+ New entry`. A scrollbar when long.
- **Detail panel** for the entry under the cursor:
  - actions/aliases/substitutes: the Pattern (Text) field, the Commands (New text) box (multi-line,
    scrolls).
  - macros: the **Key cell** `[ F1 ]`, `[ Press to bind… ]` (empty), `[ Custom: \eOp ]` (unknown);
    Enter or a click starts **key capture**; then the Commands box.
  - highlights: Pattern, then the **styles** `[ ] Undersc. [ ] Blink [ ] Reverse`, then the **colour
    picker**: `── Text ──` and `── BG ──`, 7 rows (red, green, yellow, blue, magenta, cyan, white) ×
    dark/bright, toggle one per column. Bodies it cannot parse (`bold`, RGB codes) are kept verbatim
    until a swatch is touched.
  - **Note rows** under the boxes: the validation message in red (`Pattern required`, `Unbalanced braces
    in Pattern`, `Unbalanced braces in Commands`; `Key required`, `Text required` …) and the entry
    warning in yellow (`Ctrl+E overrides the input line (moves to the end).`, `F5 is also bound by script
    group-heal; this macro wins.`, `#help is a client command; this alias never runs.`).
- **Sentinel prompt** (cursor on `+ New entry`): `No aliases yet. Press n to add one.` / `Press Enter to
  create a new alias.`
- **Applies by itself** (ADR 0105): leaving a field, another entry/kind, clicking in the game, a new or
  deleted entry, a captured key, a highlight swatch. Never per keystroke. Footer flash: `Applied` (live)
  / `Saved`, `Applied · a new warning: …`, `Not applied: Unbalanced braces in Commands (alias gv)`.
- Keys: Tab / Shift+Tab cycle toggle → kinds → list → detail fields; ←→ on the toggle and the kinds;
  ↑↓ PgUp PgDn Home End in the list; Enter/→ into the detail; ← at the start of a field back;
  **n** new entry (kind row and list), **Del** delete (list only), Ctrl+S apply now; Ctrl+F/Ctrl+H do
  nothing in LITE (ADR 0119). Footer hints today: `n New · Del Delete · Tab Cycle · ESC Back`.
- Key capture overlay: `─── Bind key ───`, `Press the key to bind…`, errors `AltGr keys type text.`,
  `ESC opens the menu.`, `Enter sends the input line.`, `The browser keeps that key.`, `Press a key with
  the modifier.`, `Unknown key.`; then flash `Bound to F1.`. Esc cancels (a new macro is removed).
  Phone: `Key capture: desktop only.`

### EDITOR
- CodeMirror buffer with the whole profile text (tt++), syntax colours, brace matching, folding of
  nothing; line numbers off (a grid look today). Ctrl+S applies (live) / saves; flipping back to LITE
  applies. Footer right: `Modified` · brace balance (`1 unclosed {` in red) · `Ln 12, Col 4`. Footer
  hint `Ctrl+S Apply · Ctrl+F Find · Tab Cycle · ESC Back`. Flash `Copied` / `Cut`.
- Find (Ctrl+F) and replace (Ctrl+H) panel (`search.ts`): field, `n of m`, case / word / regex toggles,
  replace field, Replace / All.

### HELP
- The manual (`help.ts`): a section menu at the left (narrow frames drop it) and the scrolling manual.
  Groups: intro (Writing a profile), basics (Braces and ;, Arguments %0 %1 …, Variables $name, Patterns,
  Priorities, Colours, Keys, Typing commands, What is saved, Scripts), commands (#action, #alias,
  #class, #delay, #else, #elseif, #event, #exit, #format, #fullscreen, #gag, #help, #highlight, #if,
  #lua, #macro, #math, #menu, #message, #nop, #panes, #perf, #profile, #script, #scripts, #settings,
  #showme, #substitute, #ticker, #variable …). Sections: heading, syntax lines, paragraphs, examples
  (code + note). Keys: ↑↓ scroll, PgUp/PgDn, n/p heading, ← menu / → manual, Ctrl+F find.

### Leaving, prompts
- ESC: when nothing is unapplied it leaves; the list flashes `Saved Gibur.` (start page) or `Profile
  updated.` (live). Not live: ESC saves (`Saving…`), only what cannot be saved asks.
- Live with unapplied edits: modal **`Apply changes to your profile?`** — `Y to apply · N to discard ·
  ESC to keep editing` (`Applying…` while it runs).
- Nothing applicable left: modal `Not applied: Unbalanced braces in Commands (alias gv)` — `N to discard
  · ESC to keep editing`.
- A failed save: flash `… · ESC again leaves without saving`; leaving: `Changes to Gibur were not saved.`
- Phone: same views; the LITE column has no 40-cell floor; key capture is desktop only; tappable hints.

## 2. Import (`frames/import-load.ts`, `import-report.tsx`, `import/*`, ADR 0073, 0076)

- **Loading** has no page: files from the picker (one or more) → archives (`.mpackage` / `.zip`)
  unpacked to their XML entries → `importFiles`. Errors become the list's flash `Import failed: …`
  (`rasta.mpackage holds no XML file; it was not imported.`, `No files chosen.`).
- Formats: **TinTin++** (and native WebCockpit), **JMC** (`.set`), **Powwow**, **Mudlet** (profile saves
  and packages `.xml` / `.mpackage`). Detection signals (up to three), e.g. `.set file name`, `JMC state
  header`, `#hot/#hotkey with Ctrl+/Alt+`, `#group local/global`; `#class`, `#ticker`, `<xyz> colour
  codes`; `MudletPackage version 1.001`, `profile save`, `package archive`; `no foreign signals (tt++ syntax)`.
- **Import report** (title `IMPORT REPORT`):
  - header: `Profile  gibur` · `Format   JMC (.set file name, JMC state header, #hot/#hotkey with
    Ctrl+/Alt+)` · `Translated 412 · Kept 9 · Skipped 6 · Warnings 4` · file-wide warnings (`! JMC fires
    only the first matching action (#multiaction OFF); WebCockpit fires every matching action, in
    priority order.`, `! gibur.set was read as windows-1252.`, `! paths.set was not read by gibur.set; it
    was added at the end.`) · `Missing files: spells.set` (red).
  - list grouped **KEPT (n)**, **SKIPPED (n)**, **WARNINGS (n)** (translated with a warning): each item
    `file:line  reason[; warning]` and its source dimmed on the next row, one line, ` …` if more.
    Empty: `Every setting was translated as it was.`
  - native unchanged short form: `Format   TinTin++, 214 lines, nothing changed` (no list).
  - buttons **EDIT** (opens the editor on the new profile) and **OK** (back to the list; flash).
    Keys: Tab list ↔ buttons, ↑↓ PgUp PgDn Home End scroll, ←→ buttons, Enter, ESC = OK.
- The new profile is named after the entry file (collisions get a suffix) and becomes the selected one.

## 3. Export editor (`frames/export-editor.tsx`, `export-model.ts`, `export.css`, ADR 0019, 0106, 0115)

- Title `Export Editor`. States: `Reading the log…`, `Could not read the log: …`.
- **Log** (monospace game text with its colours): entries (inbound lines, `> commands`, `[SYSTEM]`
  lines), comments `## …` (yellow, wrapped at 80), `── end of log ──`. Margin marks: `►` cursor, `┃`
  selected (accent), `▌` excluded (red bar, the line greyed). Only rows near the view render (70 000
  lines).
- **Overview map** (2 cells beside the log): excluded stretches, comments ■, event letters K (pkill) D
  (death) A (achievement) L (level), the viewport thumb (drag it; click jumps).
- **Panel** (30 cells, right): summary `Rasta (L73)` · `2026-09-25 · 70,098 lines` · `3 excluded · 1
  comment`; selection heading `SELECTION · 4 lines` / `LINE · 12` / `COMMENT` / `END OF LOG`; buttons
  EXCLUDE ↔ INCLUDE (all excluded), ADD COMMENT, EDIT COMMENT and DELETE COMMENT (only on a comment);
  `TITLE` + the file name (`mume-Rasta-2026-09-25T21-00`) + EDIT TITLE; `EXPORT`: HTML REPLAY (`player,
  map and comments`), TEXT FILE (`plain text (.txt)`), `◄ last` after the one used last; BACK; legend.
- Selection: drag on rows (auto-scroll), Shift+click, Shift+↑↓ PgUp PgDn Home End; Esc clears first.
  Touch: margin taps select / extend.
- Keys: X exclude/include, C comment, E (Enter in the log) edit comment, D / Delete delete comment, T
  title, H HTML replay, P text file, Tab log ↔ panel, ESC selection then back. Every edit saves at once
  (`Could not save the edit: …`). Flash `Building the replay…`, `Exported mume-Rasta-….html`, `Export
  failed: …`.
- Narrow (tablet portrait): the summary on one line (`· n selected`), the buttons wrapped above the log,
  `◄` marks the last export.

### Export input (`frames/export-input.tsx`)
- Pages `Add comment`, `Edit comment`, `Export title`. A field `> text_` (keys read directly; paste
  joins lines), counter `52 / 600` (comments; titles max 200).
- Comment preview: the `## ` lines as in the replay, `Holds the replay for 7 s.` (2.5–10 s); empty:
  `Type the comment.` / `An empty comment is deleted.` (edit).
- Title: `File: Rasta in the Trollshaws.html`; empty: `Empty: the default title.`
- Keys: Enter save, Backspace, Ctrl+U clear, ESC cancel.

## 4. What the mockups add or change (not in the app today)

- **No hint rows.** Every key the footers listed is reachable by a marked letter or a visible button:
  - editor: L / E / H views, A / I (Al**i**ases) / G (Hi**g**hlights) / M / S kinds, N new entry, D (and Del)
    delete; Save/Apply and Find as buttons in EDITOR (Ctrl+S / Ctrl+F stay); a Find button in HELP.
  - import report: E Edit, O OK (Enter and Esc also OK).
  - export: X Exclude (I when the label says Include), C, E, D, T, H, and **P "Plain text"** (the real button
    is "TEXT FILE" with the hint "plain text (.txt)"; renamed so its key P is in the label).
- Editor: a quiet save status at the foot right ("All saved" / "All applied" / "Editing" / "Not applied")
  instead of the 1.5 s flash alone; in game a "Connected · changes apply to the game" line; a "Shows as"
  preview for highlights; the leave prompt as buttons "Yes, apply" (Y) / "No, discard" (N) / "Keep editing".
  Esc in a text field steps out of the field first (the base kit's rule); a second Esc leaves.
- Import C adds a page before the file picker (drop zone, the four formats); A and B keep today's flow
  (the native picker opens at once).
- Export B writes the comment inline in the log and the title inline in the foot; C uses a drawer and a
  timeline; A keeps the input as a dialog (today a full page).
- The phone has no Export editor (History says "Export: desktop only."); the mockups still lay out at
  390 px for tablets in split view.
