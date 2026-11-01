# Stage 33 — Full-width Scripts and a new Export Editor

Status: **In progress** (2026-11-01). Owner brief 2026-11-01 (below), the
first of the start-page menu reviews.

## Goal

- **33a Full width.** Scripts and the Export Editor use the whole screen
  width (black bands left and right today).
- **33b Export Editor redesign.** Same features, easier to use: select a
  range of lines with the mouse and exclude or include it; the format is
  picked by the export button itself; a panel on the right instead of the
  button column on the left.

## Owner brief (2026-11-01)

1. Scripts from the start menu leaves black areas left and right: the
   view does not use the screen width.
2. The same for the Export Editor.
3. A full review of the Export Editor. Everything needed is there, but it
   feels clumsy. Use the full width; make "exclude from here" / "stop
   excluding" easier, for example by clicking beside the line with the
   mouse. Clicking `FORMAT: HTML` to switch to a text file is not
   intuitive. Redo the interface so it is easier to use.

## Owner picks (2026-11-01)

Asked as three questions with sketches; the owner took the recommended
option each time.

- **Excluding:** select a range (press in the margin and drag, or
  Shift+click; Shift+arrows on the keyboard), then EXCLUDE or INCLUDE.
- **Format:** no format mode. Two export buttons, HTML REPLAY and TEXT
  FILE, each saying what it makes. The last one used is marked.
- **Layout:** the log fills the width; a narrow panel on the right holds
  the summary, the selection's actions, the title and the export
  buttons. No button column on the left.

## Starting points

- Scripts: `src/chrome/frames/scripts-model.ts` (`scriptsLayout`,
  `DETAIL_MAX = 76` caps the help panel), `scripts.tsx`.
- Export Editor: `src/chrome/frames/export-editor.tsx` (`LOG_MAX = 100`
  caps the log), `export-model.ts`, `export-input.tsx`, `export.css`;
  the document and its operations in `src/share/edits.ts` (ADR 0019,
  Inv §7.7). Tests: `tests/unit/chrome-export.test.tsx`,
  `chrome-export-model.test.ts`, `share-edits.test.ts`,
  `tests/e2e/export.spec.ts`, `scrolling.spec.ts`,
  `scrollbar-drag.spec.ts`.

## Decisions *(Claude)*

ADR 0115 holds the design: layout and widths, the selection model, the
range operations, the panel, keys, touch, narrow grids.

## Tasks

- [ ] 33a Scripts: the help panel fills the room to the right of the list
      (no 76-cell cap); tests updated.
- [ ] 33a/b Export Editor: the log fills the width (no 100-cell cap).
- [ ] 33b `edits.ts`: `excludeRange` / `includeRange` over entry µs;
      `format` becomes "last used"; unit tests.
- [ ] 33b Selection: anchor + cursor over entries; mouse drag in the log
      (margin or text), Shift+click, Shift+keys, auto-scroll while
      dragging, Esc clears it first; the margin shows it.
- [ ] 33b Right panel: summary, selection actions, comment actions,
      title, two export buttons, BACK, legend; Tab between log and panel.
- [ ] 33b Keys and footer: X, C, E, D, Enter, Delete, T, H, P, ESC.
- [ ] 33b Narrow grids and touch (ADR 0115 §6).
- [ ] 33b Unit and e2e tests updated; `npm run check`, unit, e2e green.
- [ ] Owner test.

## Test guide 33

Open the dev server (`npm run dev`, http://localhost:5173/), Firefox on a
wide screen first.

1. **Scripts:** start page → Scripts. The help on the right reaches near
   the right edge; no wide black band.
2. **Export Editor:** History → a session → EXPORT. The log fills the
   screen up to a panel on the right. No button column on the left.
3. **Select and exclude:** press in the left margin of a line and drag
   down a few lines: they get a bar in the margin and the panel says
   "4 lines". Press EXCLUDE (or X): they grey out. With the same lines
   selected, the button now says INCLUDE. Shift+click further down
   extends the selection. Click a line without dragging: the selection
   is gone. Shift+↓ and Shift+End select with the keyboard; Esc clears
   the selection before it leaves the editor.
4. **Exclude to the end:** click a line, Shift+End, X.
5. **Comments:** C adds a comment above the selection (or the cursor
   line). Click a comment: EDIT and DELETE show in the panel; Enter
   edits it, Delete removes it.
6. **Export:** HTML REPLAY (H) and TEXT FILE (P) each download their
   file; the one you used last is marked when you come back. TITLE (T)
   still renames the file.
7. **Narrow window** (optional): make the window narrow; the panel moves
   above the log and everything still works.

Feedback wanted: is selecting and excluding now natural? Does the panel
read well, and is anything missing or in the way?

## Owner feedback

*(after testing)*
