# 0128 — The profile pages in the new look

- Status: Accepted (stage 43 built in wave 2 of the broad pass; owner testing with stages 42–47)
- Date: 2026-11-07
- Related: stage 43 (`docs/stages/43-profile-pages.md`), ADR 0127 (the look
  pages base), ADR 0125 (the lantern kit), ADR 0105 (apply in place), ADR
  0119 (the editor's keys), ADR 0104, 0070, 0037, 0015 (the profile
  editor), ADR 0103 (in-game windows), ADR 0073 (import), ADR 0115 (export).
- Reference: `notes/research/start-menu-mockups/round7/profiles/`
  (`editor-b.html`, `import-c.html`, `export-b.html`, `CONTENT.md`).

## Context

Stage 43 moves the three content pages of the profiles group off the TUI
cell grid into the new look, on stage 42's base: the Profile editor
(direction B "Ryggen", on the start page, in the Profile window and in the
phone's ESC menu), the import page and receipt (C), and the Export editor
(B with a format toggle and an explicit Export). It runs as four packages
(43a–43d) in parallel worktrees; each writes its own section below.

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

(43b writes this part.)

### 43c — The import page and the receipt (direction C)

(43c writes this part.)

### 43d — The Export editor (direction B, with the format toggle)

(43d writes this part.)

## Consequences

- The profile editor has no cell grid left; the TUI frame, its geometry
  helpers and its footer hints are dead code to sweep in wave 3 (the
  helpers stay in `logic.ts` while their unit tests do).
- Specs outside 43a that drove the old editor (`.wc-ped`, `data-mode`,
  the `─── Profile Editor ───` title) move to the hooks above in their
  own packages or in wave 3.
