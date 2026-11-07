# Stage 43 — Profile editor, Import and Export in the new look

Status: **Next** (planned 2026-11-07; built in wave 2 of the broad pass,
after stage 42, in parallel with the other wave-2 stages; branch decided by
the main session).

## Goal

Move the three content pages of the "profiles" group from the TUI cell grid
to the new look of stage 41 (the lantern kit, ADR 0125) and the big-page
layout of stage 42, following the round 7 directions the owner chose:

- the **Profile editor** in direction **B "Ryggen"**, both as a big page on
  the start page and as a movable window in the game (and on the phone),
- **Import** in direction **C "Importsidan"**: its own page before the file
  picker, then the receipt in the same box,
- the **Export editor** in direction **B "Verktygsraden"**, with a format
  toggle and an explicit EXPORT button.

Every function, key and message of today's pages keeps working (lists
below). The mockups are throwaway code over a simplified DOM: never copy
them; re-derive the look in the app's own structure with the kit.

## Owner decisions (2026-11-07)

Chosen directions (recorded in the mockups README, "Round 7 decisions"):

1. **Profile editor: B Ryggen** (`round7/profiles/editor-b.html`): a
   navigation spine (the rail) on the left whose content follows the view
   (the kinds with icons in Lite, the text's sections in Editor, the
   manual's headings in Help), the entry list with pattern and body on two
   lines, the entry's detail on the right without a card. Narrow: the rail
   becomes a row on top; narrower: one column, the entry opens as a sheet.
2. **In-game window frame: the direction's own** ("Riktningens"): for B
   that is **A "Lyktfönster"** (stage 42's one window frame, Lykta; the
   mockup's `.wwin.win-a` in `round7/base/base.css`: the
   Lykta pane as a window, thin iron band, small riveted brackets, centred
   hood with title and dim note, small iron X, opaque lamp-lit window).
3. **Import: C Importsidan** (`import-c.html`), **but the receipt after an
   import has no Edit button** (only OK).
4. **Export: B Verktygsraden** (`export-b.html`), changed: the two export
   buttons become **a toggle between "HTML replay" and "Plain text"** plus
   **an explicit EXPORT button**; choosing a format no longer exports at
   once. "TEXT FILE" is called **"Plain text"** everywhere.

Defaults the owner accepted by not objecting (recorded here as decisions;
the ADRs of this stage repeat them):

5. **Shortcut letters** in the editor: views **L**ite / **E**ditor /
   **H**elp; kinds **A**ctions, Al**i**ases, Hi**g**hlights, **M**acros,
   **S**ubstitutes; **N** new entry, **D** delete. Marked in the labels
   (`KeyLabel`), no hint rows anywhere.
6. **Esc in a text field first leaves the field** (the keyboard goes back
   to the list or the zone it came from); **a second Esc goes back** (leaves
   the editor, asking first when something is unapplied).
7. **One window frame in the game, Lykta** (owner decision 2026-11-07,
   explicit: "the Profile page and the Scripts page, with their sub-pages,
   can all have the same frame, the direction's own"): every in-game
   window for Profile and Scripts and all their sub-pages (Profile editor,
   Import, Export; Scripts page, script editor, manual) uses the Lykta
   frame, the frame of both chosen directions (Profile editor B, Scripts
   page C). The window never switches frame when a sub-page opens. The
   Glass window frame is dropped; stage 42 builds only Lykta. This answers
   the earlier question "Riktningens (Glass for the script editor) or
   Lykta everywhere": Lykta everywhere.
8. **Export works on the phone** (today History says "Export: desktop
   only."). The mockup's 390 px layout is the reference.
9. **Keep the editor's quiet status** at the foot right ("All saved" on the
   start page, "All applied" in the game, "Editing", "Not applied") and the
   in-game line **"Connected · changes apply to the game"**, as in the
   mockup (CONTENT.md §4 agrees).

Technical defaults decided in this plan (not the owner's; change in the
ADRs if the build shows a better way, and list them in the test guide):

- The Export button's shortcut is **O** (Exp**o**rt): E (Edit comment), X
  (Exclude), P (Plain text) and T (title) are taken.
- H and P **choose** the format (the toggle), they no longer export.
- The toggle's state is the export doc's stored `format` (ADR 0115 §4,
  `setFormat`), saved at once like every edit; the "◄ last" mark goes.
- When the in-game editor is **not live** (the session ended, the cockpit
  is still up) the live line reads "Not connected · changes are saved".
- In Help on a narrow editor (the rail as a row) the section list is a
  dropdown (the mockup's `.ped-hsel`), not a row of 60 headings.
- On a touch device the import page hides "Drop the files here" and keeps
  "Choose files…".

## References

Read first:

- `CLAUDE.md`, `progress.md` (top), this file.
- `notes/research/start-menu-mockups/README.md`: "Baseline", "Night pass
  (2026-11-07)", "Round 7 decisions (owner, 2026-11-07)".
- `notes/research/start-menu-mockups/NIGHT-PASS.md` (decisions 4–6: the big
  box, scope, the in-game windows).
- `docs/stages/41-start-page.md` and ADR 0125 (the lantern kit, the start
  surface, `lookFrame`, `Box`, `GlassButton`, `KeyLabel`, `LookFlash`;
  the Profile list addendum with its row actions) and ADR 0126.
- `docs/stages/42-look-pages-base.md` and ADR 0127: the big-page layout
  B, the kit extensions, the in-game window frames, the lantern CodeMirror
  theme and find panel, and `LookManual`, which this stage builds on (its
  "API" section has the canonical names). See "Uses from stage 42" at the
  end.

Mockups (`notes/research/start-menu-mockups/round7/`):

| What | Files | Notes |
|---|---|---|
| Content inventory | `profiles/CONTENT.md` | every real field, state, message and key of the three pages; §4 lists what the mockups add or change |
| Review page | `profiles/index.html` | the review notes per direction; tabs `eb` (editor B: start, in game dark/Paper, side by side), `ic`, `xb` |
| Editor B | `profiles/editor-b.html`, `editor-page.js` (wiring, URL states `?page=editor`, `?ctx=game&bg=paper`, `?view=editor|help`, `?kind=macro`, `?sel=F5`, `?modal=confirm|held|capture`, `?empty`, `?sheet`), `ped.js` (the editor; the `L === 'b'` branches), `ped.css` (`.ped-b`, the `@container ped` rules at 940 and 640 px, the shared narrow rules at 520 px, the `.wwin` density rules), `shell.js` / `shell.css` (dialogs `SHELL.dialog`, the window `SHELL.game`), `data.js` (Gibur's real-shaped profile, the manual sections) | `ped.js` `window.PED_FRAME = 'a'` = Lyktfönster |
| Import C | `profiles/import-c.html`, `imp.js` (`layout === 'c'`: pick → reading → report or error), `imp.css` (`.imp-c`, `.imp-drop`, `.imp-fmts`, `.imp-acc`, `.imp-sum`) | ignore the receipt's Edit button (decision 3) |
| Export B | `profiles/export-b.html`, `exp.js` (`L === 'b'`: the bar, `exp-tools`, `exp-foot2`, the inline comment `placeInline`, the inline title), `exp.css` (`.exp-b`, `@media 900 / 600 px`) | replace the two export buttons by the toggle + EXPORT (decision 4) |
| Shared base | `base/README.md`, `base/base.css`, `base/base.js`, `base/ingame.html` (the window frames over real game screenshots, `?bg=paper`; only Lykta, `win-a`, is built), `base/gallery.html` (every component) | |
| Big-page layout | `layout/b-room.html` (B Rummet växer) | built by stage 42 |

Current code these pages replace (read before building; every item in the
"Keep working" lists below comes from it):

| Page | Files | ADRs |
|---|---|---|
| Profile editor | `src/editor/frame.tsx` (1712 lines: view, focus zones, the apply chain), `src/editor/logic.ts` (pure helpers: kinds, sort, previews, highlight specs, held text), `src/editor/cm.ts` (the CodeMirror buffer), `src/editor/search.ts` (find/replace panel), `src/editor/help.ts` (manual data, `helpSections()`), `src/editor/manual-view.tsx` + `manual-find.tsx` + `manual-search.ts` (the manual on the grid, shared with the script manual), `src/editor/editor.css` (shared `.wc-ped*` rules, also used by the script editor and manual), `src/editor/index.ts` (the lazy chunk's exports), `src/chrome/frames/profile-edit.ts` (`editProfile`, the host), `src/script/doc/*` (the profile document) | 0015, 0037, 0070, 0104, 0105, 0119; Inv §5.1–5.9 |
| Profile window | `src/chrome/frames/profile-window.tsx` (`ProfileRoot`, moved out of `windows.tsx` verbatim by stage 42), `src/chrome/windows.tsx` (`WinStack`, focus rules; read only), `src/chrome/kit/window.tsx` + `window.css` + `window-geom.ts` (the frame; stage 42's, read only), `src/chrome/frames/esc-main.tsx` (`profileEditOptions`, `ProfileEntry` for the phone's `#profile`), `src/chrome/index.tsx` (the ESC menu's `FrameStack`; its look host is stage 42's, read only) | 0103, 0108, 0112, 0099; Inv §4.5 |
| Import | `src/chrome/frames/profiles.tsx` (`onFile`, the hidden file input, the I action), `src/chrome/frames/import-load.ts` (`loadImportFiles`, `unpackArchives`), `src/chrome/frames/import-report.tsx` (`ImportReportFrame`, `reportHeader`, `countsText`, `formatName`), `src/import/*` (the core, unchanged) | 0073, 0076; spec §2.11 |
| Export | `src/chrome/frames/export-editor.tsx` (903 lines), `export-input.tsx` (comment and title pages), `export-model.ts` (the cell layout, items, map marks, selection), `export.css`, `src/share/edits.ts` (`ExportDoc`, `setFormat`, titles), `src/share/text.ts`, `src/share/payload.ts`, `src/replay/export.ts`, `src/chrome/kit/download.ts`; reached from `src/chrome/frames/history.tsx` (EXPORT, the phone gate at the `'EXPORT'` case) | 0019, 0106, 0115, 0075 §3; Inv §7.7 |

## What must keep working

### Profile editor (all hosts)

- **Hosts and entry points**: the start page's Profile list (Edit, Enter on
  the selected profile; not live), the in-game Profile window (menu bar
  Profile, `#profile` on desktop and tablet; live while connected), the
  phone's ESC menu Profile row and the phone's `#profile` (`ProfileEntry`;
  live). The editor chunk stays lazy (`import('../../editor')` in
  `profile-edit.ts`; CodeMirror never on the start-up path; prefetch when
  idle stays). Errors: "Could not open the editor: …", `No profile "x".`
- **Views**: Lite, Editor, Help; each open starts in Lite; Help lies over
  the other two and keeps their state (the buffer stays mounted).
- **Lite**: the five kinds with counts; the entry list sorted for display
  (`listRows`: by pattern, macros by key, entries made in this visit
  last), body previews (first non-blank line, `…`), highlight bodies in
  their own colours, `+ New <kind>` last; validation flags (red) and
  warnings (yellow) per row; the detail per kind: Pattern / Commands
  (actions, aliases), Text / New text (substitutes), the macro **Key cell**
  (`[ F1 ]`, "Press to bind…", "Custom: \eOp") with **key capture** (all its
  messages: "AltGr keys type text.", "ESC opens the menu.", "Enter sends
  the input line.", "The browser keeps that key.", "Press a key with the
  modifier.", "Unknown key.", "Bound to F1."; Esc cancels and removes a new
  macro; "Key capture: desktop only." on the phone), highlights: Pattern,
  styles Underscore / Blink / Reverse, Text and BG swatch grids 7 × 2, bodies
  it cannot parse kept verbatim until a swatch or style is touched; the
  note rows (validation in red, entry warning in yellow); the sentinel
  prompts ("No aliases yet. Press N to add one." / "Press Enter to create a
  new alias.").
- **Apply in place (ADR 0105), unchanged semantics**: Lite applies on
  leaving a field (also when the window loses focus or the game is
  clicked), another entry or kind, new / delete, a captured key, a style or
  colour; never per keystroke. Editor applies on Ctrl+S and on the flip
  back to Lite. Ctrl+S applies in every view. Held entries
  (`applicableDoc`, `heldText`), rebasing on the latest stored text
  (`rebaseDoc`), outside saves laid under the open edits (`subscribe`),
  one apply at a time (`chain`). Flashes: "Applied" / "Saved", "Applied · a
  new warning: …", "Not applied: …", "Nothing to apply." / "Nothing to
  save.", "Copied", "Cut".
- **Editor**: the CodeMirror buffer with tt++ colours and brace matching;
  status "Modified", brace balance ("1 unclosed {", "1 stray }"), "Ln 12,
  Col 4"; find (Ctrl+F) and replace (Ctrl+H) with case / word / regex,
  "n of m", Replace / All (`search.ts`, ADR 0070).
- **Help**: the manual (`helpSections()`): section headings grouped
  (Writing a profile; Basics; Commands), syntax, paragraphs, examples; ↑↓
  scroll, PgUp/PgDn, Home/End, n / p next / previous heading, Ctrl+F find in
  the manual (Enter / F3 / Ctrl+G next, Shift previous, Alt+C/W/R toggles,
  Esc closes the find first).
- **Leaving**: Esc / Back with nothing unapplied leaves; the list flashes
  "Saved Gibur." (start page) or "Profile updated." (live). Not live: Esc
  saves ("Saving…"). Live with unapplied edits: **"Apply changes to your
  profile?"** Yes, apply (Y) / No, discard (N) / Keep editing (Esc),
  "Applying…". Nothing applicable: **"Not applied: …"** No, discard (N) /
  Keep editing (Esc). A failed save: "… · ESC again leaves without saving";
  leaving then: "Changes to Gibur were not saved."
- **Keys (ADR 0119)**: Tab / Shift+Tab cycle the zones; Enter / → into the
  detail, ← at the start of a field back; ↑↓ PgUp PgDn Home End in the
  list; **n** new (kinds and list), **Del** delete (list only); Ctrl+F and
  Ctrl+H do nothing in Lite (the browser's find must not open either).
- **The window**: move and resize as today (stage 30b), geometry stored in
  `settings.windows`, focus follows presses, the X and Esc are the close
  request through the editor's own prompts, a window without focus never
  takes the DOM focus, `unsaved()` and `closeAll()` (leaving the cockpit
  discards), the failure root page (the flash stays, Enter edits again, Esc
  closes), the title "Profile" with the profile name as the note.
- **Phone**: the editor works from the start page and from the ESC menu;
  Lite fits at 320–390 px; taps on rows, kinds, buttons and swatches; the
  soft keyboard does not hide the field being edited.

### Import

- I on the Profile list (and its Import button) starts the import; one or
  more files; archives `.mpackage` / `.zip` unpacked to their XML entries
  (`unpackArchives`, its warnings); formats TinTin++ (and native), JMC,
  Powwow, Mudlet; the new profile is named after the entry file (suffix on
  a collision) and becomes the selected one; after the receipt the list
  flashes `Imported "gibur" from gibur.set.` and its cursor is on the new
  profile.
- Errors: `Import failed: …` (e.g. "rasta.mpackage holds no XML file; it
  was not imported.", "No files chosen.") — now shown on the import page
  (C), not only as the list's flash.
- The receipt: profile name, "a new profile from **gibur.set** and 2 more
  files", the format with its signals (chips), the counts (as a sentence in
  C: "412 settings were translated, 9 kept as #nop, 6 skipped, and 4 need a
  look."), the file-wide warnings, "Missing files: spells.set" (red), the
  groups Kept as #nop / Skipped / Translated with a warning, each item
  `file:line`, the reason (and warning) and the first source line dimmed
  (` …` when more); "Every setting was translated as it was."; the native
  short form "TinTin++, 214 lines, nothing changed." OK closes (Enter, O,
  Esc). **No Edit** (decision 3): the editor is one key away on the list
  (the new profile is selected and highlighted; Enter or E opens it).

### Export

- History → Export on a session with a captured log (the button stays in
  History; the History stage owns `history.tsx`). States "Reading the
  log…" and "Could not read the log: …".
- The log: entries (inbound lines with their colours, `> commands`,
  `[SYSTEM]` lines), `## …` comments (wrapped at 80), "── end of log ──";
  the cursor, the selected range, excluded lines greyed with their mark;
  **only the rows near the view are rendered** (70 000 lines); native
  pixel scrolling (wheel, touchpad, touch).
- The overview strip beside the log (excluded stretches, comments, event
  letters K D A L, the viewport thumb: drag it, a click jumps); hidden
  below 900 px as in the mockup.
- Summary: "Rasta" · "Level 72 · 2026-09-25 · 70,098 lines · 3 excluded ·
  1 comment"; the selection heading (`Selection · 4 lines` / `Line · 12` /
  `Comment` / `End of log`).
- Selection: press and drag (auto-scroll above / below the log),
  Shift+click, Shift with ↑↓ PgUp PgDn Home End; touch: a margin tap
  selects, a second extends, a tap on the text moves the cursor and clears;
  Esc clears the selection first, then goes back to History (whose state
  is kept).
- Actions: Exclude ↔ Include (X; the label is Include when all is
  excluded, I then works too), Add comment (C), Edit (E, or Enter on a
  comment), Delete (D or Delete; only on a comment), title (T). Every edit
  saves at once ("Could not save the edit: …"). Flashes "Excluded 4
  lines." / "Included …", "Comment deleted.", "Title: …" / "The default
  title.", "Building the replay…", "Exported mume-Rasta-….html", "Export
  failed: …".
- The comment input: 600 characters, newlines and tabs become spaces (paste
  joins lines), counter `52 / 600`, the `## ` preview as in the replay,
  "Holds the replay for 7 s." (2.5–10 s); empty: "Type the comment." /
  "An empty comment is deleted." (edit). Enter saves, Esc cancels, Ctrl+U
  clears. The title input: 200 characters, "File: Rasta in the
  Trollshaws.html", empty: "Empty: the default title."
- The two exports: HTML replay (player, map and comments; the bundled map
  when no map store; MMapper's default tiles) and plain text (.txt, without
  the excluded lines); the file name from the title and the format.

## Scope

In scope: the Profile editor (all three hosts), the Profile window's
content and root page, the import page and receipt, the Export editor and
its inputs, their tests, ADRs, Inv notes and user-facing texts.

Out of scope: the Profile list itself (stage 41; only its import entry
changes here), the window frame and the big-page layout themselves (stage
42), the script editor, the script manual and the Scripts window's content
(the Scripts stage), History (the History stage), the ESC menu's own
pages (unchanged), the import core `src/import/*` and the export builders
`src/share/*`, `src/replay/*` (unchanged logic).

## Work packages

Four packages, one subagent each, all in wave 2 after stage 42 is merged
into the branch. 43a is the largest; if the main session wants five agents
it splits 43a into **43a1** (shell, rail, Lite, dialogs, the model) and
**43a2** (the Editor and Help views and their rail sections) along the file
split given below.

**Collision rules for every package:** do not edit any file stage 42 owns
(its "File ownership in wave 1" table: the kit's `look*.tsx|css`,
`stack.tsx`, `window*.ts(x)|css`, `windows.tsx`, `index.tsx`,
`start-surface.tsx`, `hooks.ts`, `cm.ts`, `search.ts`, `look-code.*`,
`look-manual*`); a missing kit piece goes into a local helper in your own
files and is named in your report for wave 3. Do not edit
`src/editor/editor.css` (`.wc-ped*` is shared with the script editor; 44b
owns its script section); do not edit `manual-view.tsx`, `manual-find.tsx`,
`manual-search.ts` (left to the wave-3 sweep); `help.ts` is 43a's for the
profile manual's text only (the `HelpSection` type does not change); do
not edit `history.tsx` (stage 45). New CSS uses its own prefix per package
(below).

### 43a — The Profile editor, direction B (start page first)

Owns: `src/editor/frame.tsx` (replaced; keep the file name or move it to
`src/editor/profile/` and re-export from `src/editor/index.ts`), new
`src/editor/profile/*.tsx` (suggested split: `editor.tsx` shell — head,
views, rail, foot, status, dialogs, keys; `lite.tsx` list and detail;
`detail-highlight.tsx`; `capture.tsx`; `text-view.tsx` the Editor view;
`help-view.tsx`; `model.ts` the apply chain and editor state as a hook),
new `src/editor/profile.css` (prefix **`wc-pe-`**), `src/editor/logic.ts`
(new pure helpers only; keep the existing ones that tests use),
`src/editor/index.ts` (exports; stage 44 adds none in wave 2 and asks 43a
if it must), `src/editor/help.ts` (the profile manual's texts that describe
the old editor: LITE / EDITOR / footer wording; the `HelpSection` type and
`helpSections()` stay), `src/chrome/frames/profile-edit.ts` (the host fields
below). Tests: `tests/e2e/editor.spec.ts`,
`tests/e2e/manual-find.spec.ts` (its profile-editor HELP cases),
`tests/e2e/scrollbar-drag.spec.ts` (its profile-editor cases),
`tests/unit/editor-logic.test.ts`, new unit tests for the new helpers.

Build:

1. **Extract the model** from `frame.tsx` before touching the view:
   `useProfileEditorModel(host)` (or a small class) holding doc / base /
   pinned / visited / cursors / the apply chain / held state / savedAny /
   closing / the outside-save subscription, with the same commit points
   and outcomes (`Outcome`, `CommitWhy`). Unit-test it without a DOM where
   possible (the commit points, held entries, rebase, discard on leave).
2. **The component** is a `lookFrame` and renders `<Box size="large"
   title="Profile" onBack=…>`, which is place-aware (stage 42,
   `useLookPlace()`: start page: the large box, hood "Profile", Back top
   left; window: the bare window body; phone ESC menu: the full-screen
   Lykta page). It makes its root a size container (`container-name:
   pe`) and lays itself out by its own width, never by the device:
   - wide (> 940 px): rail 196 px | list | detail (B's grid);
   - 641–940 px: the rail as a row of tabs on top (no icons, no group
     headings), list | detail;
   - ≤ 640 px: one column; the detail opens as a sheet with a small back
     button labelled with the kind ("‹ Aliases"); Esc closes the sheet
     first.
3. **Head**: on the start page the profile name (Cinzel) with "tt++
   profile" small; in the game the live line ("● Connected · changes apply
   to the game", or "Not connected · changes are saved" when not live); the
   views toggle Lite · Editor · Help (`Seg`, letters L E H).
4. **Rail**: Lite: "Kinds" + the five kinds with icons and counts (letters
   A I G M S marked in the labels); Editor: "In the text": the first line
   of each kind present (Variables, Actions, Aliases, Highlights, Macros,
   Substitutes, Timers & events, Classes) and the profile's own `#nop`
   heading comments, in text order, with line numbers; a click puts that
   line at the top and the cursor on it; recomputed after edits (debounced,
   from the parsed doc, not by regex on every keystroke); Help: the
   manual's headings grouped, the current one lit, a click goes there, the
   current one follows scrolling.
5. **List** (two lines per row: flag + pattern, body preview; macros show
   the key as a chip, "unbound" when empty) and **detail** (no card; the
   fields and notes per kind, the "Shows as" preview for highlights, the
   "Kept as written: … Choosing a style or colour replaces it." note for
   unparsed bodies). Fields are stage 42's `Field` / `TextArea` (real
   `input` / `textarea` elements in glass wells), highlight styles `Check`,
   the swatch grids the page's own.
6. **Foot**: Lite: New entry (N), Delete (D, disabled on the New row);
   Editor: Save (start page) / Apply (live) primary, Find; Help: Find; the
   flash in the middle (the editor's own 1.5 s / 6 s flash: `LookFlash({
   flash })` with `useLocalFlash()`); the status at the right (decision 9).
7. **Dialogs** with stage 42's `Dialog` (`inline`, drawn inside the
   editor's box or window, not over the whole game; `data-dlg` `apply`,
   `applying`, `not-applied`, `saving`, `bind`): Apply changes?, Applying…,
   Not applied, Saving…, Bind key (a pulsing keycap of the page's own in
   the dialog's children, the error line through `error`, Cancel).
8. **Keys** (a rework of ADR 0119 for the rail; record in the ADR):
   - letters (outside text fields and the buffer): L E H views; in Lite A I
     G M S kinds, N new, D delete; in Help n / p headings;
   - Tab / Shift+Tab: views → rail → list → detail fields (→ buffer in
     Editor, → manual in Help) and around;
   - rail (vertical): ↑↓ move between kinds (switching the kind), → / Enter
     to the list; as a row: ←→;
   - list: ↑↓ PgUp PgDn Home End; → / Enter / Space open the entry (or
     create on the New row); ← back to the rail; Del / D delete;
   - detail: ← at the start of a field (or on a non-text control) back to
     the list; swatch grids by arrows (← → cross from Text to BG), Enter /
     Space pick; Enter / Space on the Key cell starts capture;
   - Esc: in a field or the buffer → leave it (decision 6; stage 42's Esc
     rule does this when the handler does not consume Esc); sheet open →
     close it; find open → close it; else leave (prompts as above);
   - Ctrl+S apply in every view, also from inside fields; Ctrl+F / Ctrl+H
     in Editor, Ctrl+F in Help, nothing in Lite (still preventDefault);
   - Back (top left) = Esc at the top level.
9. **Mouse and touch**: click selects a row (pointer down outside the
   editor with pending Lite edits applies, as today); a click on the
   selected row, a double click, or any tap in the one-column layout opens
   the entry; hover never moves the cursor in the list (it scrolls under
   the pointer).
10. **Editor view** uses `cm.ts` with `look: 'lantern'` (stage 42's
    `lookCodeTheme()`, the `.wc-code` host class and the lantern find panel
    `searchExtension({ look: 'lantern' })`); nothing else in `cm.ts`
    changes. **Help view** uses stage 42's `LookManual` with `contents:
    'none'` and `find: 'bar'`, and `ManualContents` in the rail as its
    section list (`ctl.goto`, `onSection`).
11. **The host** (`EditorHost` in `frame.tsx` / `profile-edit.ts`) reads the
    place from `useLookPlace()` (no `place` field) and gains a way to follow
    the live state for the head line (`onLiveChange?(fn): () => void`);
    43b fills it in for its hosts.
12. Remove the profile editor's own rules from `editor.css` only in wave
    3, after the Scripts stage has moved off the shared `.wc-ped*` rules.

Stable test hooks (record in the ADR): `.wc-pe` root with `data-view`
(`lite` | `editor` | `help`), `data-zone` (`views` | `rail` | `list` |
`detail` | `buffer` | `help`), `data-kind`, `data-unapplied`;
`[data-rail=…]`, `.wc-pe-row[data-id]` / `[data-row="new"]`,
`.wc-pe-row.is-on`, `[data-field="pattern|body|key"]`,
`[data-style=…]`, `[data-swatch="fg-r-c"|"bg-r-c"]`, `[data-btn=…]`
(`LITE`, `EDITOR`, `HELP`, `NEW`, `DELETE`, `SAVE`/`APPLY`, `FIND`),
`.wc-pe-status`, `.wc-pe-flash`, and stage 42's `.wc-lk-dialog[data-dlg=…]`
for the dialogs.

### 43b — The editor in the game (window, phone ESC menu)

Owns: `src/chrome/frames/profile-window.tsx` (`ProfileRoot`, moved there
verbatim from `windows.tsx` by stage 42d), `src/chrome/frames/esc-main.tsx`
(only `profileEditOptions` and `ProfileEntry`). **Not** `windows.tsx` or
`index.tsx`: the window frames, the look host in the window stacks and the
ESC menu's look host are stage 42's (read only; nobody edits them in wave
2). Tests: `tests/e2e/windows.spec.ts` (Profile cases),
`menubar.spec.ts` (the Profile window title check), `profile-apply.spec.ts`,
`phone-esc-menu.spec.ts`, `phone-frames.spec.ts` (the profile editor case),
`popup-focus.spec.ts` (Profile cases) if a selector changes.

Build (against the current editor at first, then against 43a's):

1. Check the Profile window in stage 42's Lykta frame (the one frame for
   every window and sub-page; it does not change when Import or Export
   opens): title "Profile", note the profile name, X,
   resize grip, dimmed content without focus, bronze on Paper. The frame,
   its API and geometry rules are stage 42's; this package only checks
   them with the new editor inside and reports gaps.
2. The window's `FrameStack` already renders look frames free inside the
   window body (stage 42's look host, place `window`); old-look frames
   inside (none left for Profile after 43a) still get the cell grid.
3. `ProfileRoot` in the new look: while the editor loads, nothing (or a
   quiet "Opening Gibur…" line after 300 ms); after a failure the flash and
   a glass **Edit** button (E, Enter), Esc / X closes. Closing on leaving
   unchanged.
4. Pass the live state (the place comes from `useLookPlace()`); live = connected
   (`profileEditOptions` unchanged otherwise). Check the focus rules with
   the new real inputs: a press in the game takes the window's focus and
   applies pending Lite edits; a window without focus never focuses a
   field on re-render; Esc in the game input goes to the window's close
   request; typing in the editor's fields never reaches the game input
   (`OWN_KEYS_ATTR`).
5. The editor's layout in a window: at the default size (80 % of the
   cockpit) the wide or middle layout; at the minimum size
   (`MIN_CONTENT_COLS` × `MIN_CONTENT_ROWS` cells) the one-column layout
   must still work (list, sheet, dialogs fit). Denser type in the window
   (the mockup's `.wwin .ped` rules) through a place class, not a media
   query.
6. The phone: the ESC menu's Profile row and `#profile` open the new
   editor in stage 42's `menu` place (a full-screen Lykta page over the
   opaque background, dark or Paper; no sky in the game); Back /
   Esc returns to the ESC menu (or closes it for `ProfileEntry`) as today.
   The ESC menu's own pages stay old-look.
7. Tablet (touch, windows on): the window, a tap on a row, the soft
   keyboard in a field.

### 43c — The import page and the receipt (direction C)

Owns: new `src/chrome/frames/import-page.tsx` (and `import.css`, prefix
**`wc-imp-`**), `src/chrome/frames/import-report.tsx` (rewritten as the
receipt; keep `formatName`, `countsText` if still used, and the pure
helpers the unit test covers, or move them to an `import-model.ts`),
`src/chrome/frames/import-load.ts` (API unchanged; add a helper to read a
`FileList` / `DataTransfer` into `ImportFile[]` if useful),
`src/chrome/frames/profiles.tsx` (only the import entry: I / Import push
the import page; `onFile` and the hidden file input move to the import
page; the list's `done` flash and cursor after OK). Tests:
`tests/e2e/import.spec.ts`, the import block of `tests/e2e/chrome.spec.ts`
(around "IMPORT: name from the file …"), `tests/unit/chrome-import-report.test.tsx`
(rewrite), new unit tests for the page states.

Build:

1. **The import page**: a normal box (hood "Import", Back), replacing the
   list in place (the list steps away as in the mockup). The lead "Settings
   from another client become a new profile. Choose the main file together
   with the files it #reads."; the drop zone (icon, "Drop the files here",
   the primary **Choose files…** button, C); the four formats (TinTin++ `.tin
   .tt .txt` and WebCockpit profiles; JMC `.set` with the files it #reads;
   Powwow `.pow .txt` definitions file; Mudlet `.xml .mpackage .zip`
   profile saves, packages). Enter = Choose files…; Esc / Back = the list.
   Drops on the zone (and anywhere on the box) import those files; a drag
   over lights the zone. Touch: no drop text (decision above).
2. **Reading**: "Reading gibur.set, paths.set, spells.set…" with a thin
   bar while the chunk loads and the files are read (the same
   `loadImportFiles` → `importFiles` → `profiles.importFile` →
   `settings.update({ profile })` sequence as today).
3. **Error**: on the page, "Import failed: …" with the chosen file names
   under it, and the drop zone again (choose again); not a list flash.
4. **The receipt** in the same box, grown tall (`Box size="normal" tall`):
   the head (name, "a new profile from …", the format and signal chips, the
   file-wide warnings, missing files), the summary sentence, the groups as
   collapsible sections (the first open; Kept as #nop / Skipped /
   Translated with a warning, each with its count), items as today; the
   short form for an unchanged native profile; **OK only** (O, Enter, Esc,
   Back). Keys: ↑↓ PgUp PgDn Home End scroll; Tab / Shift+Tab walk the group
   headers and OK (the kit's `is-sel`, buttons never take the DOM focus);
   Space (or Enter on a header) opens / closes a group; Enter elsewhere = OK.
5. After OK: back to the Profile list (not the import page), the flash
   `Imported "x" from y.`, the cursor on the new profile.
6. Phone: the page and the receipt fit at 320–390 px (the wordmark hidden
   for the tall receipt as in the mockup); the native picker opens from the
   button.

### 43d — The Export editor (direction B, with the format toggle)

Owns: `src/chrome/frames/export-editor.tsx` (rewritten), `export-input.tsx`
(becomes the inline composer, or is removed), `export-model.ts` (the pixel
layout replaces the cell layout; keep the item / selection / map-mark logic
and its tests), `export.css` (prefix **`wc-exp-`**, rewritten). Tests:
`tests/e2e/export.spec.ts`, the export case of `tests/e2e/scrolling.spec.ts`,
`tests/unit/chrome-export.test.tsx`, `tests/unit/chrome-export-model.test.ts`,
new `tests/e2e/phone-export.spec.ts`. Does **not** edit `history.tsx`: the
phone gate there ("Export: desktop only.") is removed by stage 45 (WP
45-A) in the same wave; wave 3 restores it only if this package's phone
layout does not land.

Build:

1. A `lookFrame` in a large box (hood "Export", Back), pushed by History
   with the same props (`{ session }`); stage 42's box swap from History
   (the box stays; its width morphs from History's cap to full width).
2. **The bar** (head): the character in Cinzel with "Level 72 · 2026-09-25
   · 70,098 lines · 3 excluded · 1 comment" small; the selection heading;
   the tools: Exclude / Include (X / I), Add comment (C), Edit (E), Delete
   (D) (Edit and Delete disabled unless the cursor is on a comment).
3. **The log** in full width, monospace (the user's terminal font and its
   ANSI colours), the overview strip at its right (hidden < 900 px). Keep
   the virtual rendering: rows at a known line height (wrapped entries
   count their rows, as `entryPlainRows` does now), a spacer of the full
   height, only the rows near the view in the DOM; the inline composer is
   one extra item of measured height.
4. **The foot**: "File" + the file name with its extension (a click or T
   edits it inline: the field, the "File: ….html" / "Empty: the default
   title." hint, Save / Cancel, Enter / Esc / Ctrl+U, 200 characters); the
   **format toggle** HTML replay (H) | Plain text (P) (tooltips "Player, map
   and comments", "Plain text (.txt)"); the primary **Export** button (O)
   that builds and downloads the chosen format; the flash line under it.
5. **The comment composer** inline in the log at its place (before the
   anchor for a new one, in place of the comment when editing): label,
   textarea, counter, the `## ` preview, the hold time, Cancel / Save;
   Enter saves (Shift+Enter is not a newline either: comments are one
   paragraph), Esc cancels, Ctrl+U clears; the log keys pause while it is
   open.
6. **Keys**: as today minus the panel zone: ↑↓ PgUp PgDn Home End (Shift
   extends), X / I, C, E / Enter on a comment, D / Delete, T, H / P choose
   the format, **O exports**, Tab / Shift+Tab walk log → tools → title →
   toggle → Export (keyboard `is-sel`), Enter presses; Esc: composer →
   selection → back.
7. **Phone (decision 8)**: no gate; the bar wraps (the selection heading on
   its own line), the file line full width, the toggle and Export on one
   row, the map hidden; margin taps select / extend as today; the composer
   stays above the soft keyboard (`visualViewport`); the download works on
   Android Chrome (Pixel 7 project) and is checked by hand on iOS Safari.
8. Wide screens: the large box (the log needs width); on a very wide
   window the log does not need more than ~120 columns: the page caps its
   own content width inside the full-width box with its own CSS (stage
   42's `maxWidth` is not used here, so History → Export keeps the box
   swap's full width).

## Tasks

- [ ] Before launch: stage 42 merged into the branch; its "Uses" items
      checked (below). This stage's ADR is **0128** (assigned by the main
      session; the profile editor B, with the import page and the export
      editor's decisions in it), plus addenda to 0073, 0115, 0075 and 0103
- [ ] 43a: model extracted from `frame.tsx`, unit-tested
- [ ] 43a: editor shell (head, views, rail, foot, status, dialogs) in the
      large box on the start page; layouts at > 940, 641–940, ≤ 640 px
- [ ] 43a: Lite list and detail for all five kinds (key capture, highlight
      styles and swatches, notes, sentinel)
- [ ] 43a: Editor view (CodeMirror, rail sections, status, find/replace)
- [ ] 43a: Help view (look manual, rail headings, find)
- [ ] 43a: keys (letters, Tab ring, rail, list, detail, Esc rule, Ctrl+S/F/H)
- [ ] 43a: editor e2e and unit tests updated; ADR 0128 (Profile editor B)
- [ ] 43b: Profile window (stage 42's Lykta frame and look host) checked
      with the new editor; `ProfileRoot` in the new look; live line; focus
      rules re-checked
- [ ] 43b: phone ESC menu and `#profile` host the new editor; tablet checked
- [ ] 43b: window, menubar, profile-apply and phone tests updated; ADR 0103
      addendum for the Profile window's content (stage 42's addendum covers
      the frame)
- [ ] 43c: import page (drop zone, choose, formats, reading, error)
- [ ] 43c: receipt (summary, groups, OK only, keys), list flash and cursor
      after OK; tests; ADR 0073 addendum
- [ ] 43d: Export editor B (bar, log, map, foot, toggle, Export, inline
      comment and title), virtual log kept; tests; ADR 0115 addendum
- [ ] 43d: phone layout and `phone-export.spec.ts`; ADR 0075 addendum
      (export on the phone)
- [ ] Wave 3: check that History's EXPORT is no longer gated on the phone
      (removed by stage 45, WP 45-A); restore the gate only if 43d's phone
      layout did not land
- [ ] Wave 3: drop the profile editor's leftover `.wc-ped*` rules from
      `editor.css` once nothing uses them; remove `export-input.tsx` and the
      old cell layout helpers if unused
- [ ] Wave 3: Inv §5.1–5.9, §7.7 and spec §2.11 pointers; README, About and
      manual texts that name "TEXT FILE", "IMPORT REPORT", "Export Editor",
      "Profile Editor" or "Export: desktop only" (grep `src`, `README.md`)
- [ ] Wave 3: performance checks (below); owner test guide checked against
      the build
- [ ] Owner feedback recorded in this file

## Test plan

Run for every package: `npm run typecheck`, the linter, `npm test`
(vitest), the e2e specs below (`npm run test:e2e -- <spec>`; Chromium and
Firefox; the `phone` project for `phone*.spec.ts`), and the full e2e suite
once per wave-2 merge.

Unit (vitest, `tests/unit/`):

- `editor-logic.test.ts`: keep green (logic.ts helpers); add the rail
  sections helper, the status text, the letter map.
- New `editor-model.test.ts` (43a): the extracted apply model: commit
  points, held entries, rebase on an outside save, discard on leave,
  savedAny and the leave flash.
- `chrome-import-report.test.tsx` (43c): rewrite for the receipt (summary
  sentence, groups, items, the short form, missing files, no Edit, O /
  Enter / Esc) and the page states (pick, reading, error, a drop).
- `chrome-export.test.tsx`, `chrome-export-model.test.ts` (43d): no panel;
  the toggle (H / P only choose; the stored format), Export (O) builds the
  chosen format, the inline composer and title, the virtual rows.
- `chrome-history.test.tsx` "EXPORT opens the export editor": keeps
  passing (the History stage owns any change there).
- `chrome-frames.test.tsx`, `window-geom.test.ts`, `start-look.test.ts`:
  keep green.

E2E (Playwright, `tests/e2e/`), with the selectors that change:

- `editor.spec.ts` (43a; ~60 uses of `.wc-ped*`, `data-zone`, `data-mode`,
  `data-view`, `data-kind`, `data-field`, `[data-btn="LITE|EDITOR|HELP|EDIT"]`,
  `.wc-ped-footer` hints, `.wc-ped-title`): move to the new hooks; drop
  the footer-hint assertions (no hint rows); add the rail, letters, the
  Esc-leaves-field rule, the sheet at ≤ 640 px, the status line.
- `manual-find.spec.ts` and `scrollbar-drag.spec.ts` (43a for their
  profile-editor cases: `.wc-ped-manual*`, `.wc-ped-bufbar`, `.wc-ped-vbar`,
  the TUI scrollbars): the new look has native thin scrollbars, so the
  TUI-bar drag cases for the profile editor go; keep their script-editor
  and script-manual cases for the Scripts stage untouched.
- `windows.spec.ts`, `menubar.spec.ts` (the `─── Profile Editor: default
  ───` title at line ~270), `profile-apply.spec.ts`, `popup-focus.spec.ts`
  (43b): the window frame selectors from stage 42 (`.wc-win[data-win]`,
  `.wc-win-t`, `.wc-win-n`), the editor's new hooks;
  apply-in-place cases unchanged in substance.
- `phone-esc-menu.spec.ts` (line ~155), `phone-frames.spec.ts` (lines
  ~158–161) (43b): the editor's new hooks on the phone.
- `import.spec.ts`, `chrome.spec.ts` import block (43c): I opens the page;
  the `filechooser` comes from Choose files…; a drop test
  (`dispatchEvent('drop')` with a `DataTransfer`); the receipt has no
  `[data-btn="EDIT"]`; OK returns to the list with the flash.
- `export.spec.ts` (43d; `.wc-exp-row`, `.wc-exp-log`, `.wc-exp-last`,
  `.wc-exp-summary`, `.wc-exp-panel`, `[data-btn="TEXT FILE"]`): the bar,
  the toggle (stage 42's `Seg`: `[data-btn="HTML"]`, `[data-btn="TEXT"]`
  with `aria-checked`), `[data-btn="EXPORT"]`, the inline composer; the
  download events for both formats; `scrolling.spec.ts` "Export editor log
  scrolls by pixels; the rows near the view are rendered" (title check
  `─── Export Editor ───` goes).
- New `phone-export.spec.ts` (43d): open from History on the phone,
  margin-tap selection, exclude, a comment with the soft keyboard, export
  both formats (download event).
- Screenshots (gitignored, for the review): editor B on the start page at
  1440×900, 1280×720, 390×844; the Profile window dark and Paper at the
  default and the minimum size; the import page, reading, error and
  receipt; the export editor at 1440, 1024 and 390 px.

## Performance notes

- **Chunks**: the editor (with CodeMirror) stays in its lazy chunk; the
  import core stays lazy; nothing of this stage enters the start chunk or
  the first paint. Check the build's chunk sizes before and after (the
  start chunk must not grow).
- **The big box over the sky**: stage 42's rules (ADR 0127): the sky runs
  at its calm rate behind a large box; the large window's blur is kept or
  dropped by stage 42's measurement. No `backdrop-filter` on inner surfaces
  of the editor and the export log (the list, the buffer, the log are solid
  wells); measure with
  `bench/start-page-bench.ts` on a build with the editor open (target as
  ADR 0125: 56–60 fps on the Iris Xe in Chromium and Firefox, no long
  frame > 50 ms while idle).
- **In the game**: the window's content never blurs the game behind it
  (no window has a `backdrop-filter`, ADR 0127); the window's stack re-renders only on focus,
  size or open changes (keep the `WinStack` guard); the live line reads
  the connection state only, not every status tick.
- **Typing**: a key in a pattern or body field costs one small render of
  the detail and the row (no list re-sort, no rail recompute per key);
  target < 4 ms per key at a 400-entry profile; the rail's text sections
  recompute debounced (≥ 200 ms) from the parsed doc.
- **Lists**: Lite renders all rows of one kind (profiles have tens to a few
  hundred per kind); if a kind passes ~1500 rows, window it. Switching
  kinds < 16 ms at a 2000-entry profile (measure once).
- **Export log**: keep the virtual rendering (70 000 lines); the overview
  strip draws merged stretches and marks, never one element per line;
  drag-select and auto-scroll on `requestAnimationFrame`; the replay build
  stays async with "Building the replay…".
- `prefers-reduced-motion`: no growing or sliding of the sheet, composer
  or receipt groups; plain fades.

## Test guide (for the owner, after the build)

On the branch: `npm run dev`, http://localhost:5173/ (for the feel of
speed, `npm run build && npm run preview`). Chromium and Firefox; a phone
or a narrow window; a game session for the in-game parts.

1. **Profile editor on the start page.** Profile → highlight a profile →
   Edit (or Enter on the selected one). The box grows, the rail on the
   left. Try the kinds with A I G M S, ↑↓ in the list, Enter into an entry,
   type, Esc (leaves the field), Esc again (leaves; "Saved …" on the list).
   N for a new entry, D to delete. G (Highlights): the colour swatches and
   "Shows as". M (Macros): Enter on the key, press a key. E for Editor:
   the rail lists the text's sections, Ctrl+F finds, Save. H for Help: the
   rail lists the manual's headings.
2. **Narrow.** Make the window narrower: the rail becomes a row, then one
   column where the entry opens as a sheet ("‹ Aliases" back).
3. **In the game.** Menu bar Profile: the window with the lantern frame,
   dark and Paper backgrounds. "Connected · changes apply to the game";
   change an alias, click in the game, use it. Type in Editor and press Esc
   twice: "Apply changes?" with Yes / No / Keep editing. Move and resize
   the window, also very small.
4. **Phone.** Start page Profile → Edit, and in the game the ESC menu →
   Profile: the one-column editor, the sheet, typing with the soft
   keyboard.
5. **Import.** Profile → I: the import page with the drop zone. Drop a
   JMC `.set` with its files (or Choose files…), see "Reading…", then the
   receipt (no Edit; OK). Back on the list the new profile is highlighted:
   Enter opens it. Try a broken file: the error stays on the page.
6. **Export.** History → a session with a log → Export. Select lines (drag
   or Shift+↑↓), X, C for a comment written in the log, T for the title in
   the foot. Choose HTML replay or Plain text with the toggle (H / P),
   then Export (O). Also on the phone.

Feedback wanted: the editor's rail and density on the start page and in a
small game window; the "Not connected · changes are saved" line; the
import page before the picker; the export toggle and the O letter for
Export; anything that worked before and does not now.

## Open questions for the owner (after testing)

The build follows the default until the owner answers.

1. **The Export button's letter is O** (Exp**o**rt; E, X, P and T are
   taken). *Default: O.*
2. **"Not connected · changes are saved"** as the in-game head line when the
   session has ended. *Default: this wording.*
3. **The import page before the file picker** (direction C's own page with
   the drop zone; the picker opens from Choose files…). *Default: as built
   (the owner chose C).*
4. **Help on a narrow editor** shows the manual's sections as a dropdown,
   not a row of 60 headings. *Default: the dropdown.*

## Owner feedback

(none yet)

## Uses from stage 42

The canonical names are in `docs/stages/42-look-pages-base.md` ("API" and
"Canonical names") and ADR 0127. Stage 42's files are read-only in wave 2:
a missing piece goes into a local helper in this stage's own files, named
in the package's report, and the main session moves it into the kit in
wave 3.

1. **Layout B**: `Box size="large"` (menu → large, normal → large from the
   Profile list, large → normal back; the box swap History → Export; the
   final size from the first frame, the growth carried by the morph proxy)
   and `useBoxSettled()` for anything that measures after the growth.
2. **Slots**: `BoxHead`, `BoxBody` (native scroll, thin iron scrollbar),
   `BoxFoot`; the box's window is an inline-size container `wc-page` in
   every place.
3. **The tall normal box**: `Box size="normal" tall` for the import
   receipt (the wordmark hides for it on the phone).
4. **Places**: `useLookPlace(): 'start' | 'window' | 'menu'`; `Box` renders
   the right thing per place (no separate page wrapper); the look hosts of
   the window stacks and the ESC menu stack are stage 42's.
5. **The window frame**: stage 42's one Lykta frame (the Profile window's
   default: title "Profile", note the profile name); `useWindowChrome({
   title?, note? })` if a sub-page needs another title or note. The frame
   itself never changes.
6. **Tokens** `--lk-*` with the Paper values under `data-light` (text,
   dim, faint, item, on, head, accent, danger, ok, well, rule; the fonts).
7. **Controls**: `Seg` (views, the export format; `aria-checked`,
   `selected` for the keyboard's option), `Tabs`, `Field`, `TextArea`
   (`mono`, `error`, `hint`, `maxLength`), `Check`, `Select`, the rows
   classes (`.wc-lk-rows.is-flat > .wc-lk-row.is-on`, `.is-idle`),
   `GlassButton` (`small`, `primary`, `danger`, icon-only with `title`).
8. **Dialogs**: `Dialog` (`inline` inside the editor; overlay frames with
   `nav.push(node, { overlay: true })` where a page pushes one), hook
   `.wc-lk-dialog[data-dlg]`.
9. **The controlled flash**: `LookFlash({ flash })` with `useLocalFlash()`.
10. **The Esc rule** (decision 6) is the stack's: an Esc the frame does not
    consume, in a text field or the CodeMirror buffer, blurs it; Ctrl+S /
    Ctrl+F / Ctrl+H reach the frame's handler from fields.
11. **CodeMirror**: `cm.ts` with `look: 'lantern'` (`lookCodeTheme()`,
    `.wc-code`) and the lantern find panel (`searchExtension({ look:
    'lantern' })`), shared with the script editor.
12. **The manual**: `LookManual({ sections: helpSections(), contents:
    'none', find: 'bar', ctl, onSection })` and `ManualContents` in the
    rail.
13. **Icons**: `action`, `alias`, `highlight`, `macro`, `substitute`,
    `save`, `find`, `back`, `exclude`, `include`, `comment`, `title`,
    `html`, `text`, `folder`, `drop`, `check`; a page's own drawing as an
    `IconDraw`.
14. **Letters and cursors**: `KeyLabel`, `letterAction(e, map)` (fires only
    outside text fields), `useListCursor`, `useButtonZone`,
    `useKeyboardInset` (the phone's soft keyboard).
