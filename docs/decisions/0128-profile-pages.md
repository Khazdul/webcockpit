# 0128 — The profile pages in the new look

- Status: Accepted (stage 43 built in wave 2 of the broad pass; owner testing with stages 42–47)
- Date: 2026-11-07
- Related: stage 43 (`docs/stages/43-profile-pages.md`), ADR 0127 (the look
  pages base), ADR 0125 (start surface and the lantern kit), ADR 0073 and
  ADR 0076 (foreign import), ADR 0115 (export), ADR 0075 (phone), ADR 0103
  (in-game windows), ADR 0105 (apply in place), ADR 0119 (the editor's
  keys), ADR 0104, 0070, 0037, 0015 (the profile editor).
- Reference: `notes/research/start-menu-mockups/README.md` ("Round 7
  decisions"), `round7/profiles/` (`editor-b.html`, `import-c.html`,
  `export-b.html`, `CONTENT.md`).

## Context

Stage 43 moves the three content pages of the profiles group (the Profile
editor, Import, Export) from the TUI cell grid to the new look, built on
stage 42's kit, in four parallel packages (43a–43d). Each package records
its decisions in its own section below.

## Decision

### 43a — The Profile editor, direction B (start page first)

**Files.** The TUI frame (`src/editor/frame.tsx`, 1712 lines) is replaced by
`src/editor/profile/`: `editor.tsx` (the look frame: head, views, rail,
foot, status, dialogs, keys, the focus), `model.ts` (the apply chain),
`lite.tsx` (the rail's kinds, the entry list, the detail),
`detail-highlight.tsx` (styles, swatches, "Shows as"), `capture.tsx` (Bind
key), `text-view.tsx` (Editor's rail and its jumps), `help-view.tsx`
(`LookManual` and its rail); `src/editor/profile.css` (prefix `wc-pe-`).
`src/editor/index.ts` exports the same three names from the new place.
`logic.ts` keeps every helper its tests use and gains the new look's pure
helpers (`textSections`, `previewLine`, `keyLabel`, `statusText`,
`liveText`, `showsAs`, `peLayout`, the letters and labels). The shared
`.wc-ped*` rules in `editor.css` are untouched (the script editor and
manual still use them; wave 3 drops the profile editor's leftovers).

**The apply model, extracted.** `ProfileModel` (`model.ts`) holds what the
frame held in refs: the base, the chain (one apply at a time), the
in-flight count, the queued refresh, the last held text, `savedAny`,
`closing`, `alive`. It reaches the open view through `ModelView` (`mode`,
`doc` / `setDoc`, `buffer` / `setBuffer`, `baseChanged`, `report`), so the
commit points' outcomes, held entries, the rebase onto an outside save,
the discard on leave and the one-at-a-time chain are unit-tested without a
DOM (`tests/unit/editor-model.test.ts`). The semantics are ADR 0105's,
unchanged: `commit(why)` takes its snapshot at the commit point; an
automatic apply does not retry (or flash) the text it held back last time;
`nothingApplicable()` is the Lite check behind "Not applied: …" instead of
"Apply changes?". The component keeps the UI state and the commit points
(the `spot` layout effect, `requestCommit`, leaving the editor's DOM).

**One frame, every place.** `ProfileEditor` is a `lookFrame` that renders
`<Box size="large" title="Profile" onBack>`; `Box` adapts (stage 42): the
large box on the start page (normal → large from the Profile list), the
bare window body in the Profile window, a full-screen Lykta page in the
phone's ESC menu. The editor calls `useWindowChrome({ title: 'Profile',
note })` (the window's defaults, set explicitly). The head shows the
profile's name in Cinzel with "tt++ profile" on the start page, and the
live line in the game (`useLookPlace() !== 'start'`): "● Connected ·
changes apply to the game", or "Not connected · changes are saved" when
the session ended. `EditorHost` gains `onLiveChange?(fn) → unsubscribe`
(and `EditOptions` in `profile-edit.ts` passes it through); 43b fills it in
for the in-game hosts, without it the line is read at each render.

**Laid out by its own width.** The root is a size container (`container:
pe`); CSS container queries draw three layouts and a `ResizeObserver` on
the same element gives the keys the same answer (`peLayout`, `PE_WIDE`
940, `PE_NARROW` 640, `data-layout`): `wide` rail | list | detail; `mid`
the rail as a row of tabs on top (no icons, no headings), list | detail;
`narrow` one column, the detail opens as a sheet over the list with a
small back button named after the kind ("‹ Aliases"). In a window and in
the ESC menu the type is denser through a place class (`.is-window`,
`.is-menu`), never a media query. The rail is 228 px wide (the mockup's
196 px cut "Substitutes" in Cinzel at the kit's letter-spacing).

**The rail follows the view.** Lite: "Kinds" and the five kinds with
their icons, counts and letters. Editor: "In the text", the sections of
the parsed text (`textSections`): the first line of each kind of setting
(Variables, Actions, Aliases, Highlights, Macros, Substitutes, Timers &
events, Classes) and the profile's own `#nop` headings (a comment that
starts a paragraph), in text order, with line numbers; a heading that only
names the kind under it (`#nop ---- actions ----` over the first
`#action`) is that kind's entry, so the usual layout does not list
everything twice. They are re-read 250 ms after the buffer rests (from the
parsed text; never per keystroke). A click puts the line at the top and the
cursor on it; ↑↓ preview the jump, Enter / → make it. Help:
`ManualContents` (the manual's groups, the intro labelled "Introduction",
the current heading lit and following the scroll); on a narrow editor a
`Select` of the sections instead (the mockup's dropdown, open question 4).

**The list.** Two lines per row (the flag and the pattern; the body's first
line, ` …` when more lines follow; macros show the key as a chip,
"unbound" when empty; highlight bodies in their own colours), the kit's
`.wc-lk-rows.is-flat` rows, `+ New <kind>` last. The display order
(`listRows`) is read at the commit points (a new base, an entry added or
removed, another kind or view), never per keystroke: a pattern being typed
does not move its row until the edit applies. Rows re-render only when
their entry or marks change (a `shouldComponentUpdate` row), and a kind
with more than 200 entries draws only the rows near the view, between two
spacers of the measured row height (`data-windowed`). Hover never moves
the cursor; a click selects, a click on the chosen row, a double click, or
any click or tap in one column opens it.

**The detail** has no card: the kit's `Field` (Pattern, Text, Key's label)
and `TextArea` (Commands, New text; it takes the height that is left) in
glass wells; the macro's Key cell (a keycap of the page's own: `F5`,
"Press to bind…", "Custom: \eOp"; "Choose it, then press the key." or "Key
capture: desktop only." beside it); for highlights the kit's `Check`es
(Underscore, Blink, Reverse), the Text and Background swatch grids (7 × 2,
the terminal's own palette), "Shows as" (the pattern without anchors,
wildcards and arguments, in its colours on the game's background), and
"Kept as written: … Choosing a style or colour replaces it." for a body
the picker cannot read; the notes (the validation in the danger colour,
the warning in the accent). The sentinel's prompt says "Press N" now.

**The foot.** Lite: New entry (N), Delete (D; disabled on the New row);
Editor: Save (start page) or Apply (live), Find; Help: Find. The flash in
the middle, the quiet status at the right: "All saved" / "All applied"
(live) / "Editing" / "Not applied" in Lite (`statusText`; "Editing" while
the pending text differs from the base, "Not applied" after an apply held
something back, until a clean one); "Modified", the brace balance, "Ln 12,
Col 4" (and an inert command's hint) in Editor.

**Dialogs.** Stage 42's `Dialog`, `inline` inside the editor's root:
`apply` (Yes, apply · No, discard · Keep editing), `not-applied`,
`applying`, `saving`, `bind`. The capture needs every key, also the plain
ones the dialog holds: `BindDialog` mounts a key layer of its own after the
dialog (`CaptureLayer`), so it is activated later and runs first. Esc
cancels (a new macro goes again), Enter is refused ("Enter sends the input
line."), the rest is `bindability`'s.

**Keys (a rework of ADR 0119 for the rail).** The keyboard's place is
state (`data-zone`: `views`, `rail`, `list`, `detail`, `buffer`, `help`);
only text fields and the CodeMirror buffer take the DOM focus, the stack
host keeps it otherwise.

- Letters, outside text fields and the buffer (`letterAction`): L E H the
  views; in Lite A I G M S the kinds, N new, D delete; in Help n / p the
  headings (the manual's own).
- Tab / Shift+Tab: views → rail → list → the detail's fields (→ the buffer
  in Editor, → the manual in Help) and around.
- Views: ← → switch the view and stay; ↓ / Enter to the rail.
- Rail: ↑↓ (← → as a row) move and switch; → / Enter (↓ as a row) into the
  list, the buffer or the manual; ↑ from a row to the views.
- List: ↑↓ PgUp PgDn Home End; → / Enter / Space open (or create on the New
  row); ← to the rail; Del / D delete.
- Detail: Enter / ↓ from Pattern to the next field; ← at the start of a
  field (or on the Key cell, the first style, the Text grid's left column)
  back to the list; the swatch grids by arrows (← → cross from Text to
  Background, ↑ from the top row to the styles); Enter / Space pick or
  start the capture.
- Esc, in order: a dialog; the find (buffer panel or manual bar); a field or
  the buffer: leave it (the list; the rail from the buffer); the sheet:
  close it; else leave (prompting as before). The editor handles this Esc
  itself rather than through the stack's Esc rule, because the keyboard
  must land in the list (the rule only blurs). In one column the first Esc
  in a field also closes the sheet: the keyboard goes back to the list,
  which the sheet covers. Back (top left) = Esc at the top level.
- Ctrl+S applies in every view, also from fields; Ctrl+F / Ctrl+H in
  Editor, Ctrl+F in Help, nothing in Lite (still `preventDefault`).

**Focus.** A layout effect gives the zone's field (or the buffer) the
focus when the editor is the top frame, and moves a field's focus back to
the stack host when the zone has left it; a window without the focus is
left alone (ADR 0103). Two cases needed care: a press on a field moves the
zone on `pointerdown`, before the browser moves the focus (otherwise a
render between the old field's blur and the new one's focus pulled it
back, a tap from Pattern to Commands); and the editor reads
`useBoxSettled()`, so a field the keyboard went to while the box was still
hidden by the morph gets the focus when it lands.

**Editor and Help.** The buffer is `cm.ts` with `look: 'lantern'` (the
lantern theme and find panel at the top; nothing else in `cm.ts` changes);
it stays mounted (hidden) while Help lies over Editor. Help is
`LookManual` (`contents: 'none'`, `find: 'bar'`, the find query kept in a
`FindMemory` across opens, examples through `codeLine`).

**Test hooks.** `.wc-pe` with `data-view` (`lite` | `editor` | `help`),
`data-mode` (`lite` | `editor`), `data-zone`, `data-kind`, `data-layout`
(`wide` | `mid` | `narrow`), `data-unapplied`, `.is-sheet`; the views are
the kit's `Seg` options `.wc-pe-views [data-opt=lite|editor|help]` (with
`aria-checked`; a `Seg` has no `data-btn`); `[data-rail=action…]`,
`[data-rail=text][data-line]`; `.wc-pe-list` (`data-windowed`),
`.wc-pe-row[data-id][data-i]`, `[data-row=new]`, `.wc-pe-row.is-on`;
`[data-field=pattern|body] input|textarea`, `[data-field=key]`,
`[data-style=…]`, `[data-swatch=fg-r-c|bg-r-c]`; `[data-btn=NEW|DELETE|
SAVE|APPLY|FIND|SHEET]`; `.wc-pe-status`, `.wc-pe-flash`, `.wc-pe-msg`,
`.wc-pe-warn`, `.wc-pe-live`; `.wc-lk-dialog[data-dlg=apply|not-applied|
applying|saving|bind]`.

**Performance** (production build, `vite preview`, headless Chromium,
1440 × 900; script time from the event's timestamp to the end of the
render, no paint; a profile with N aliases and N actions):

| | N = 400 | N = 2000 | target |
|---|---|---|---|
| a key typed in Pattern | 1.4 ms (max 7.5) | 1.9 ms (max 3.9) | < 4 ms at 400 |
| a kind switch (A ⇄ I) | 5.1 ms | 7.3 ms | < 16 ms at 2000 |

Before the windowing and the commit-point reads the same kind switch took
106 ms at 2000 and a key 4.5 ms. Headless Firefox reported sub-millisecond
numbers for the same measurement, which are not trusted (its microtask
timing differs); the real-window bench with the editor open
(`bench/start-page-bench.ts`) is wave 3's.

Chunks (production build against the 43a base `36137595`, raw / gzip):
the start chunk 22.47 / 8.42 kB unchanged; the editor JS 639.93 / 208.50 →
661.78 / 216.80 kB (+8.30 gzip: the new editor with `LookManual`, which
stage 42 measured at +6.68 on its own, less the TUI frame); the editor CSS
11.98 / 3.06 → 33.05 / 7.21 kB (+4.15: `look-manual.css` and
`profile.css`). Because the editor chunk now imports the kit's barrel,
Rollup moves the barrel's modules (`Box`, the overlays, the cursors) from
the chrome chunk into the chunk the two share (`look-controls-*` →
`look-*`): chrome JS 85.18 → 83.59, shared JS 19.67 → 22.91, chrome CSS
14.71 → 13.76, shared CSS 3.64 → 4.88 kB gzip, so the chrome's first load
grows by about 1.9 kB gzip, the kit's `Dialog` and its CSS that no
start-page frame used before (wave 2's other pages use them too).

**Local helpers for wave 3** (stage 42's files are read only): the
editor's flash (`useEditorFlash`: the kit's `useLocalFlash` has no clear
and no "is a flash showing"); the capture's key layer that outranks an
inline dialog (`CaptureLayer`; a `Dialog` prop for raw keys would do);
the windowed list (`EntryList`, `revealRow`), a candidate for the kit's
list cursor; `Seg` options carry `data-opt` but no `data-btn` (the stage
plan named `[data-btn=LITE]`).

**Deviations from the stage plan.** ← at the start of Commands goes back to
the list (the plan's rule), not to the end of Pattern as before; the first
Esc in a field on the narrow layout closes the sheet too (above); the
rail is 228 px; the views' hooks are `data-opt`. The old TUI-only tests go:
the cell geometry (ADR 0104's halves, ADR 0037's last cell), the footer
hints, the TUI scrollbar drags of the profile editor
(`scrollbar-drag.spec.ts`); the underscore checks (ADR 0037, 0043) stay,
measured on the new rows and the lantern buffer.


### 43b — The editor in the game (window, phone ESC menu)

**One root page for both in-game hosts.** The Profile window's root frame
(`ProfileRoot`, `src/chrome/frames/profile-window.tsx`) and the frame the
phone's ESC menu opens at for `#profile` (`ProfileEntry`, `esc-main.tsx`)
are both look frames over one component, `ProfileHome`: it opens the
active profile's editor over itself as soon as it mounts, so it is seen
only while the editor's chunk loads and after the editor left with a
failure to show. While loading it shows the profile's name and nothing
else for 300 ms (`OPENING_MS`), then a quiet "Opening default…". After a
failure (`No profile "x".`, "Could not open the editor: …", a save or
apply that failed on the way out) the failure stays on the page — the
stack's flash fades after 3 s, so the page keeps its own copy until the
next try — with a glass **Edit** (E, Enter); Esc, the window's X or
Back (in the menu) closes. Leaving the editor cleanly closes the window
or the menu, as before. In the window the Lykta frame is the box (title
"Profile", the name as the note, from the window's defaults and the
editor's `useWindowChrome`); in the ESC menu `Box` draws the full-screen
box with its hood and Back. Change: `ProfileEntry` used to close the menu
even when the editor left with a failure; it now keeps the failure, as
the window always did.

**The live line.** `profileEditOptions` moves next to the root page
(`esc-main.tsx` re-exports it) and fills the editor's `onLiveChange`: it
subscribes to the app status and calls back only when `isLive` flips
(connected ⇄ not), never on a status tick (link samples, capture text),
so the editor renders once per connection change. With it the head line
("Connected · changes apply to the game" / "Not connected · changes are
saved"), Editor's Apply ⇄ Save button and the status's "All applied" ⇄
"All saved" follow a session that ends with the window open.

**Focus, checked with the real fields.** No new code was needed: the
window's capture-phase pointerdown takes the focus from a window on a
press in the game, the field blurs, and the editor's `focusout` (no
related target inside the editor) is a Lite commit point; the editor's
focus effect runs only while it is the top frame of an active stack
(`useIsTop`), so a window without the focus never focuses a field on a
re-render (a viewport resize re-renders the window's stack); the window
body carries `OWN_KEYS_ATTR`, so typing in a field never reaches the game
input. `profile-window.spec.ts` covers all three.

**The minimum window.** At the window's minimum (60 × 18 content cells,
about 540 × 330 CSS px) the editor is one column; the head, the rail's row
of tabs, the sheet's bar, the field gaps and the foot are denser in a
window at ≤ 640 px (`profile.css`, place class `is-window`, a container
query, not a media query), and the sheet's detail scrolls. A field the
keyboard moves to is now brought into the detail's view (`revealField` in
`editor.tsx`): the focus itself still never scrolls (`preventScroll`), so
the box and the window body never move; only the detail does. Both are
small edits to 43a's files after 43a was merged (no other package owns
them in wave 2). The dialogs fit at the minimum size as they are.

**Phone and tablet.** Nothing changes in the hosts: the menu's look host
(stage 42) gives the editor the place `menu` (full screen, Lykta, dark or
Paper by the game background), Back and Esc leave it and return to the
menu (or close the menu for `#profile`); the ESC menu's own pages stay
old-look. On a tablet (`?touch=1` at desktop size) the window works by
taps: a kind, a row, a tap on a field brings the soft keyboard, a tap in
the game applies.

**Test hooks.** The root page: `.wc-pw` (in the frame), `.wc-pw-name`,
`.wc-pw-opening`, `.wc-pw-flash`, `[data-btn="EDIT"]`. CSS prefix `wc-pw-`
(`src/chrome/frames/profile-window.css`, in the chrome chunk: the page is
up before the editor's chunk).

### 43c — The import page and the receipt (direction C)

**Two frames, one box.** Import on the Profile list pushes `ImportFrame`
(`src/chrome/frames/import-page.tsx`), a normal box (hood "Import", Back,
780 px wide) that takes the list's place: the surface's normal → normal
swap keeps the box and morphs its size. The page holds the choosing, the
reading and the error states itself. A success replaces it
(`nav.replace`) by `ImportReceipt` (`import-report.tsx`), so the box swap
morphs once more to the receipt and the receipt's OK pops straight back
to the list, never to the import page. The receipt is a tall normal box
(`Box tall`) only when it has groups to read; the short form (a native
profile that needed no change) and "Every setting was translated as it
was." stay a normal box, which would otherwise stand mostly empty.

**The import sequence is unchanged** (`loadImportFiles` → `importFiles` →
`profiles.importFile` → `settings.update({ profile })`; the core and the
archive unpacking are untouched). `readImportFiles(files)` in
`import-load.ts` reads a `FileList`, `DataTransfer.files` or an array into
`ImportFile`s for both the picker and a drop. Errors (`Import failed: …`
with the chosen file names under it) stay on the page in place of the
formats, with the drop zone to try again; they are no longer the list's
flash. After OK the list gets the flash `Imported "x" from y.` and its
cursor on the new profile through the list's own `done` callback (the same
one New and Rename use).

**Reading.** "Reading a.set, b.set…" with a thin running bar while the
chunk loads and the files are read; the page keeps the height it had when
the reading began, so the box does not jump for the moment it lasts.
Keys wait meanwhile, except Esc / Back: leaving during the reading drops
the import (nothing is saved). The page tracks this with its own flag set
by Back, because a popped frame stays mounted for the stack's 240 ms hold
and an unmount check alone would let a late import replace the list.

**The picker's input sits beside the box**, in the frame but outside
`Box`: the box is `visibility: hidden` while the morph carries it in, and
an input under it could miss its file chooser for an Enter pressed right
after Import. (While building, a Chromium miss turned out to be the
Playwright file-chooser listener being registered too late; the specs now
register it before Import. The input stays beside the box as the safer
place.)

**Drops.** A drag of files over the box (anywhere on it, not only on the
zone) lights the zone (a dragenter / dragleave depth count, so child
elements do not flicker it) and a drop imports those files. While the
page is the top frame a file drop beside the box is swallowed
(`preventDefault` on the document's `dragover` / `drop`), so the browser
never opens the file over the running page. Drags of text or links are
ignored. On a touch device (`pointer: coarse` and `hover: none`, or the
phone class) "Drop the files here" hides; Choose files… stays.

**The receipt.** The head (`BoxHead`): the profile name in Cinzel, "a new
profile from **gibur.set** and 2 more files" (the number of chosen files
besides the entry), the format and its signals as chips. The body
(`BoxBody`, native scroll): the file-wide warnings and "Missing files: …"
(red), the summary sentence, then the groups Kept as #nop / Skipped /
Translated with a warning as collapsible sections with their counts, the
first open, each item `file:line`, the reason (and the warning in the
accent) and the first source line dimmed (` …` when more). The notes sit
in the body, not in the head as in the mockup: on a phone a head with
three warnings would leave little room for the list, and in the body they
scroll away. The summary sentence drops zero parts except the first ("3
settings were translated.", "1 setting was translated and 1 needs a
look."); its numbers are also data attributes for the tests. The short
form adds the mockup's line "A WebCockpit profile as it is: every setting
kept as written." **OK only** (owner, 2026-11-07); the new profile is
selected and highlighted on the list, where Enter (or E) opens the editor.

**Keys.** Import page: Enter or C = Choose files…, Esc / Back = the list.
Receipt: ↑↓ (44 px) PgUp PgDn Home End scroll the body; Tab / Shift+Tab
walk the group headers and OK (the kit's `is-sel` on OK, `.is-sel` on a
header; nothing takes the DOM focus); Space, or Enter on a header, opens
or closes that group; Enter elsewhere, O, Esc and Back are OK. Nothing is
lit until the keyboard walks (as in the mockup: OK is the primary button,
Enter presses it); Tab starts at the first header, Shift+Tab at OK. The
same holds for the import page's Choose files… (primary, unlit).

**Local helper (for the kit in wave 3).** The groups use a local
collapsible (`Group` in `import-report.tsx`: a header button with
`aria-expanded`, a chevron, the title and a count at the right) because
the kit's `Fold` takes only a string label: a `Fold` with a right-hand
slot (a count) would replace it.

**Layout.** Prefix `wc-imp-` (`import.css`). Both frames lay themselves out
by the box's width (`@container wc-page (max-width: 600px)`: the formats
in two columns, a smaller drop zone and name). With a coarse pointer the
window's top padding grows to 58 px, since the kit's Back is 40 px high
there and covered the lead and the profile name. No `backdrop-filter`
inside; the drop zone and the format cards are solid fills. Reduced
motion: the bar pulses instead of running, the chevron does not turn,
groups open with a plain fade.

**Measurements** (production build, `vite build`, against the integration
tip before 43c): the start chunk `index` 8.44 → 8.45 kB gzip (a hash
reference); the chrome chunk JS 85.92 → 87.15 kB gzip (+1.23 kB) and CSS
14.87 → 16.25 kB gzip (+1.38 kB, `import.css`); the lazy import chunk
unchanged (39.03 kB gzip).

### 43d — The Export editor (direction B, with the format toggle)

**The page.** `ExportEditorFrame` is a `lookFrame` in a large box (hood
"Export", Back), pushed by History with the same props (`{ session }`).
Inside the box's window the page (`.wc-exp`, `data-format`) is a flex
column of `BoxHead` (the bar), `BoxBody` without its own scroll (the log
and the overview strip) and `BoxFoot` (the file line, the toggle, Export,
the flash). The box stays full width (History → Export keeps stage 42's
box swap from History's cap to full width); the page caps its own width
at 1320 px, centred, so a very wide window shows more of the box, not
longer lines. `useWindowChrome({ title: 'Export' })` is called for
completeness; the page is reached only from the start page today.

**The bar** (direction B): the character in Cinzel and the summary in
the serif (`barSummary`: `Level 72 · 2026-09-25 · 70,098 lines · 3 excluded
· 1 comment`, counts with thousands separators), the selection heading
(`selectionTitle` now returns `Selection · 4 lines`, `Line · 12`,
`Comment`, `End of log`; the capitals are CSS) and the tools as small
glass buttons: Exclude ↔ Include (X; Include also answers I), Add comment
(C), Edit (E) and Delete (D, danger), Edit and Delete disabled off a
comment. The tools stay laid out (disabled, not hidden), so nothing moves.

**The log is the terminal inside the box.** The user's terminal font
(`--lk-mono`), the terminal's background (72 % over the box's glass) and
foreground, and the ANSI colours through the same `.wc-f*` classes as the
output pane; commands in the terminal's echo colour with a dim `> `,
system lines dim italic, comments in a warm yellow, `── end of log ──` in
the faint serif. `[data-light]` (a light terminal background, set on the
root by the theme) turns the marks dark. 13 / 21 px rows (12 / 19 px under
600 px).

**Virtual rows in pixels.** The wrap width is measured, not cells: a probe
of ten zeros in the log's font gives the character width, the log's
client width less its margins gives `cols` (`logCols`: 16 to 120 columns,
`LOG_MAX_COLS`; the log carries `data-cols`). Entries wrap hard at `cols`
as before (`buildItems` / `entrySegments` / `entryPlainRows` unchanged), so
every item's height is its row count times the line height and nothing is
measured per row. `LogGeom` (`lh`, a top padding, the composer slot)
places items: `itemTop`, `itemHeight`, `itemAtY`, `contentHeight`,
`composerTop`, `revealTop` (pure, unit-tested). A spacer holds the whole
height; only the items within one view above and two below the current
block are in the DOM, each absolutely placed at its row (`.wc-exp-row
[data-item][data-kind]`, one `.wc-exp-ln` per row). The scroll handler
re-renders only when the scroll position crosses a block (half a view),
and moves the strip's thumb by style, without a render. The cursor pulls
the view along after keys and edits (`revealTop`, as little as possible);
a pointer press or a strip jump does not.

**The inline composer** (`CommentComposer`) is one more item of measured
height in the log: before the anchor for a new comment (before the
selection, before the cursor entry, or after a cursor comment, as
`commentSlot` decides), in place of the comment it edits. A
`ResizeObserver` gives its height to the geometry, so the rows below move
down by exactly that. It holds the kit's `TextArea` (600 characters;
newlines and tabs become spaces as typed or pasted, `pasteText`), the
counter of the collapsed text, the `## ` preview as in the replay, the hold
time, Cancel and Save. Comments are one paragraph: Enter saves (Shift+Enter
too), Esc cancels, Ctrl+U clears; an empty new comment is not added, an
emptied edit deletes. The composer and the title field carry
`data-wc-own-keys`, so the stack never sees their keys (a letter typed
there is text, not a tool) and their own `keydown` handles Enter, Esc,
Ctrl+U and keeps Tab in the field. Their text is their own state: a
keystroke re-renders the field, never the log. While one is open the log's
keys pause (an Esc with the focus elsewhere closes it), the tools are
disabled and presses on the log do nothing; closing gives the focus back
to the stack host.

**The foot**: `File` and the file name with its extension (a click or T
opens the title inline: a mono `Field` with everything selected, the hint
`File: Big fight.html` / `Empty: the default title.`, Save and Cancel, 200
characters, `TITLE_MAX`); the **format toggle** as the kit's `Seg` (HTML
replay, H, "Player, map and comments"; Plain text, P, "Plain text
(.txt)"), whose value is the export doc's stored `format`, saved at once
(`setFormat`); the primary **Export** (O) that builds and downloads the
chosen format ("Building the replay…", "Exported …", "Export failed: …";
disabled while it builds); the stack's flash under them (`LookFlash`).
Choosing a format never exports; the old "◄ last" mark is gone (the
toggle shows the format).

**Keys.** ↑↓ PgUp PgDn Home End in the log (Shift extends), X / I, C, E
(and Enter on a comment), D / Delete, T, H / P, O; Tab / Shift+Tab ring
the log and the enabled buttons in the order Exclude, Add comment, Edit,
Delete, Title, HTML replay, Plain text, Export (`useButtonZone`; the
keyboard's button is `is-sel`, the Seg's option through `selected`; the
log's cursor bar dims while the keyboard is in the buttons), ← → walk them,
Enter presses. Esc: the composer or the title field, then the selection,
then back to History.

**Mouse and touch** as ADR 0115 §2 and §6, in pixels: a press moves the
cursor and clears the selection, a drag selects and auto-scrolls on
animation frames (up to eight line heights per 50 ms past the edge),
Shift+click extends; a tap in the margin (26 px, 28 px on the phone)
selects the line and a second extends, a tap on the text moves the cursor
and clears. The overview strip (`mapStrip`: merged excluded stretches,
comments, the K D A L letters, as fractions of the rows; a few absolutely
placed marks, never one per line): the thumb drags the log like a
scrollbar, a press elsewhere jumps there and centres that item. The strip
is hidden under 900 px (`@container wc-page`).

**Narrow and phone** (by the page's own width, `@container wc-page`): under
900 px the selection heading takes its own line and the strip goes; under
600 px the rows shrink, the file line takes the full width and the toggle
(without icons, the two options sharing the room) and Export share one row.
On a coarse pointer the page starts 12 px lower, clear of the kit's 40 px
Back (a local rule; the kit's large window padding is 42 px). Fields stay
above the soft keyboard: the kit's fields scroll themselves into view, and
while a field is open the page pads its bottom by `useKeyboardInset()`, so
the log shrinks above the keyboard and the composer is revealed in it.
Downloads use the same `downloadBlob` on the phone (checked on the Pixel 7
project; iOS Safari by hand).

**Test hooks.** `.wc-exp[data-format]`, `.wc-exp-name`, `.wc-exp-counts`,
`.wc-exp-selhead`, `.wc-exp-log[data-cols]` (`.is-idle`), `.wc-exp-row
[data-item][data-kind]` (`entry`, `command`, `system`, `excluded`,
`comment`, `end`; `.is-cur`, `.is-sel`), `.wc-exp-ln`, `.wc-exp-map`
(`.wc-exp-mx`, `.wc-exp-mc`, `[data-mark]`, `.wc-exp-thumb`),
`.wc-exp-comp` (`[data-field="comment"]`, `.wc-exp-count`,
`.wc-exp-preview`, `.wc-exp-hold`, `[data-btn=SAVE|CANCEL]`), `.wc-exp-fn`
/ `.wc-exp-title`, `[data-field="title"]`, `.wc-exp-thint`,
`[data-btn=EXCLUDE|INCLUDE|COMMENT|EDIT|DELETE|TITLE|EXPORT]`, the toggle
`[data-opt=HTML|TEXT]` with `aria-checked` (stage 42's `Seg` marks its
options with `data-opt`, not `data-btn` as the stage file guessed).

**Removed.** `export-input.tsx` (the comment and title pages): its
`pasteText` and `TITLE_MAX` moved to `export-model.ts`. From the model: the
cell layout (`exportLayout`, `MARGIN`, `PANEL_*`, `MAP_*`, `LOG_MIN`), the
row-based view helpers (`topFor`, `clampTop`, `centredTop`), the row map
(`mapMarks`, `mapThumb` by rows, `mapItem`) and the panel summary
(`summaryLines`, `summaryText`); their tests were replaced by tests of the
pixel helpers.

**Measurements** (production `vite build`, raw / gzip, against the
integration tip `36137595`):

| Chunk | Before | After 43d |
|---|---|---|
| start (`index-*.js`) | 22.47 / 8.44 kB | 22.47 / 8.44 kB |
| chrome JS | 239.48 / 85.92 kB | 242.69 / 87.16 kB (+1.24 gzip) |
| chrome CSS | 65.98 / 14.87 kB | 72.35 / 16.17 kB (+1.30 gzip: `export.css`) |
| shared kit chunk (`look-controls-*.js`) | 52.88 / 19.95 kB | 53.97 / 20.14 kB (`Field`, `TextArea`, `Seg` now used) |

The log renders about two and a half views of rows (about 100 rows at
1440 × 900); a scroll inside a block costs no render.

## Consequences

- The profile editor has no cell grid left; the TUI frame, its geometry
  helpers and its footer hints are dead code to sweep in wave 3 (the
  helpers stay in `logic.ts` while their unit tests do).
- Specs outside 43a that drove the old editor (`.wc-ped`, `data-mode`,
  the `─── Profile Editor ───` title) move to the hooks above in their
  own packages or in wave 3.
- The import report's TUI text helpers (`reportHeader`, `reportRows`,
  `countsText`) are gone; the pure text lives in
  `src/chrome/frames/import-model.ts`.
- History keeps `nav.push(<ExportEditorFrame session={…} />)`; stage 45
  removes the phone gate ("Export: desktop only."), and
  `phone-export.spec.ts` skips itself until it is gone.
- Wave 3: the kit could take the "page starts below a coarse Back" rule
  (every large page on a touch screen needs it) and a small inline-field
  helper with own keys (`fieldKeys` here).

## Addenda to older ADRs

- ADR 0103 (windows): addendum 2026-11-07, the Profile window's content (43b).

- ADR 0115 (the export editor): addendum 2026-11-07 (43d).
- ADR 0075 (phone): addendum 2026-11-07, export on the phone (43d).
