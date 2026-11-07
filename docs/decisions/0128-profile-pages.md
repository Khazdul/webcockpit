# 0128 — Profile editor, Import and Export in the new look

- Status: Accepted (stage 43 built in wave 2; owner testing)
- Date: 2026-11-07
- Related: stage 43 (`docs/stages/43-profile-pages.md`), ADR 0127 (the look
  pages base), ADR 0125 (the lantern kit), ADR 0115 (the export editor),
  ADR 0073 (import), ADR 0075 (phone), ADR 0103 (in-game windows), ADR 0105
  and ADR 0119 (the profile editor's apply chain and keys).
- Reference: `notes/research/start-menu-mockups/README.md` ("Round 7
  decisions"), `round7/profiles/` (`editor-b.html`, `import-c.html`,
  `export-b.html`, `CONTENT.md`).

## Context

Stage 43 moves the three content pages of the profiles group from the TUI
cell grid to the new look on stage 42's base: the Profile editor
(direction B "Ryggen"), Import (C "Importsidan") and the Export editor
(B "Verktygsraden", with a format toggle and an explicit Export button).
It is built as four packages in parallel worktrees; each owns its section
below.

## Decision

### 43a — The Profile editor, direction B

(Written by package 43a.)

### 43b — The editor in the game (window, phone ESC menu)

(Written by package 43b.)

### 43c — The import page and the receipt

(Written by package 43c.)

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

- History keeps `nav.push(<ExportEditorFrame session={…} />)`; stage 45
  removes the phone gate ("Export: desktop only."), and
  `phone-export.spec.ts` skips itself until it is gone.
- Wave 3: the kit could take the "page starts below a coarse Back" rule
  (every large page on a touch screen needs it) and a small inline-field
  helper with own keys (`fieldKeys` here).

## Addenda to older ADRs

- ADR 0115 (the export editor): addendum 2026-11-07 (43d).
- ADR 0075 (phone): addendum 2026-11-07, export on the phone (43d).
