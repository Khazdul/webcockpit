# 0115 — The Export Editor redesigned, full-width Scripts (stage 33)

- Status: Accepted
- Date: 2026-11-01
- Related: stage 33 (`docs/stages/33-export-editor.md`, "Owner picks").
  Amends ADR 0019 (the export editor's UI and the `format` field) and the
  Export Editor in Inv §7.7. ADR 0106 (the overview map's draggable
  thumb) still holds.

## Context

The owner (2026-11-01) found the Export Editor clumsy: a button column on
the left, `EXCLUDE FROM HERE` / `STOP EXCLUDING` reached through the
cursor and a button, and `FORMAT: HTML` as a mode toggle. The log was
capped at 100 cells and the Scripts help at 76, which left black bands
on a wide screen. The owner picked: select a range then exclude or
include it; two export buttons instead of a format mode; a panel on the
right.

## Decision

### 1. Widths

- Scripts: the help panel takes all the room to the right of the list
  (`DETAIL_MAX` goes); the package fills the grid less a one-cell margin
  each side. The phone layout (no help panel) is unchanged.
- Export Editor: the package fills the grid less a one-cell margin each
  side: `[margin 2][log][map gap 1][map 2][gap 2][panel 30]`. The log has
  no upper cap. Entries wrap at the log width as before; comments still
  wrap at 80 (`COMMENT_COLS`, the export's own width).

### 2. Selection

- A selection is an anchor entry and the cursor entry; the range is every
  entry between them, inclusive. With no selection the actions apply to
  the cursor's entry alone.
- Mouse: pressing anywhere on a log row (the margin or the text) and
  dragging selects from that row to the row under the pointer; the log
  scrolls while the pointer is above or below it. A press without
  movement moves the cursor and clears the selection. Shift+click
  extends from the cursor (or from the anchor if there is one).
- Keys: Shift with ↑ ↓ PgUp PgDn Home End extends. Plain moves clear it.
  Esc clears the selection first; with none, it leaves the editor.
- The margin cell shows `┃` (accent) on selected rows, `▌` (red) on
  excluded rows, `►` on the cursor's first row; selected rows also get a
  faint band.
- Comment rows are skipped by a selection's range (they are not entries)
  but the cursor can sit on one.

### 3. Range operations (`src/share/edits.ts`)

- `excludeRange(doc, fromUs, toUs)` and `includeRange(doc, fromUs, toUs)`
  over half-open `[fromUs, toUs)` entry µs, `toUs` null to the end; both
  return merged, sorted ranges. `toUs` is the µs of the entry after the
  last selected one, or null when the last selected entry is the log's
  last.
- EXCLUDE when any entry in the range is shown; INCLUDE when all are
  excluded. One key, X, does the same.
- `excludeFrom` / `stopExcluding` / `toggleFormat` go once nothing uses
  them. The stored document is unchanged (schema 1).

### 4. Format

- No format mode in the UI. The panel has two export buttons:
  `HTML REPLAY` (a page with the player, the map and the comments) and
  `TEXT FILE` (plain text, `.txt`), each with a hint line.
- `ExportDoc.format` stays and now means "the last one exported": an
  export saves it, the panel marks that button, and the title frame's
  extension follows it.

### 5. Panel (right, 30 cells)

Top to bottom: summary (character and level; date and lines; excluded
and comments), the selection block (`SELECTION · n lines` or
`LINE · n`; EXCLUDE/INCLUDE, ADD COMMENT; EDIT COMMENT and DELETE
COMMENT when the cursor is on a comment), the title block (the file
name without extension, `EDIT TITLE`), the export block (the two
buttons), BACK, and the legend (`┃ selected`, `▌ excluded`,
`## comment`) when there is room. The top info row goes (its content is
in the summary).

Focus zones stay: the log and the panel, Tab / Shift+Tab between them,
↑↓ in the panel over its enabled buttons.

### 6. Keys, touch, narrow grids

- Keys in both zones: X exclude/include, C add comment, E or Enter on a
  comment edit it, D or Delete on a comment delete it, T title,
  H export HTML replay, P export text file, ESC (selection, then back).
  `←`/`→` no longer switch zones (Tab does).
- Footer: `↑↓ Move · Shift Select · X Exclude · C Comment · T Title ·
  H/P Export · ESC Back`.
- Touch: a tap in the margin selects that line, a second margin tap
  extends to the tapped line; a tap on the text moves the cursor and
  clears the selection; the log scrolls natively. (The phone stage may
  revisit this.)
- When the grid is too narrow for a 40-cell log beside the panel, the
  panel moves above the log as rows: the summary on one line, then the
  buttons wrapped to the width.

## Consequences

- Excluding a stretch is one drag and one key or click, and the tail of
  a log is a click, Shift+End, X.
- The export buttons say what they make; nothing is a hidden mode.
- The log uses a wide screen fully; very wide prose in the Scripts help
  is the accepted cost of filling the width.

## Build notes (2026-11-01)

Small additions made while building; none changes the design above.

- `includeRange` takes an optional fourth argument, the entries' µs, so a
  bounded piece left without an entry is dropped instead of kept as an
  empty range. `excludedBetween(doc, keys, lo, hi)` counts the excluded
  entries of a selection by binary search (EXCLUDE vs INCLUDE on a 5 h
  log).
- The selection heading also reads `COMMENT` (cursor on a comment, no
  selection) and `END OF LOG` (cursor on the end row).
- EDIT COMMENT and DELETE COMMENT keep their two panel rows (blank off a
  comment), so nothing below them moves as the cursor goes over comments.
- In the panel zone Enter presses the focused button; Enter edits a
  comment in the log zone only. A click on the overview map moves the
  cursor and clears the selection, as a plain move does.
- The format is saved as "last used" after the download succeeds.
- On a narrow grid the one-line summary ends with `· n selected` while a
  selection is up (there is no selection heading there), and the export
  used last is marked `◄` after its button.
