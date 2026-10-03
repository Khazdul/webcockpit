# 0070 — Find in the manuals, and Ctrl+F / Ctrl+H from LITE

- Status: Accepted
- Date: 2026-10-03
- Extends: ADR 0037 (HELP view), the buffer search of stage 10 (`search.ts`)

## Context

The owner asked for the same Ctrl+F search in the two manuals (the
profile editor's HELP view and the Script Manual) as in the editors, and
for find and replace while editing a profile. The editors' search is
`@codemirror/search` with our TUI panel (`search.ts`); the manuals are
not CodeMirror but rows of laid-out text on the grid (`manual-view.tsx`,
`HelpLayout`), and only the editor's EDITOR view had a search. LITE, the
view each open starts in, had none.

## Decision

**Manual search lives in `ManualView`**, so both manuals get it:

- The match logic is pure (`manual-search.ts`): the query has the
  buffer search's toggles (Case, Word, Regex); it runs over the laid-out
  rows, a row's segments joined, so a match may span syntax colours but
  not wrapped rows. Offsets are UTF-16 indexes into the row text, which
  slice the segments directly. Empty regex matches are skipped; at most
  10 000 matches are kept (shown as `n+`).
- The panel (`manual-find.tsx`) is the read-only variant of the buffer
  panel: rule, `Find › field  3 of 12  [ ] Case [ ] Word [ ] Regex`, then
  `PREV NEXT` and the hint, in the same `.wc-search*` classes and `--c-*`
  roles. The rule, hint, toggles and count format are shared with
  `search.ts` (exported from `manual-search.ts`, which has no CodeMirror
  import). It takes three grid rows under the manual; the manual and its
  scrollbars shrink by three rows while it is open.
- Keys follow `searchFrameKey`: the frame calls `ManualControl.findKey`
  before its own keys (true consumed, false the field's own key, null not
  ours). Typing searches incrementally from the origin (the top row when
  the panel opened, then the current match); Enter / F3 / Ctrl+G next,
  with Shift previous, wrapping; Alt+C/W/R toggle; ESC closes the panel
  first, so a second ESC is the frame's. Ctrl+F while open refocuses and
  selects the field.
- Matches are marked like the buffer's (`--c-brace-match-bg` with a hint
  outline; the current one `--c-sel-fg` on `--c-focus-bg`). Only rows
  with matches are rebuilt; the others keep their memoised vnodes. A
  marked row is drawn without the link transform (the Lua index links,
  the tt++ manual address) until the panel closes.
- The current match is scrolled to the middle when it is out of view,
  and the menu's current section is the match's section (set as a jump,
  so it holds until the user scrolls).
- The query is remembered per frame instance and comes back when the
  panel reopens (not searched until typing or Enter, as in CodeMirror).
  The profile editor keeps it in a ref, since HELP unmounts the view.
- The frames' "focus the root" layout effects leave the keyboard in the
  find field; a press in the manual or menu moves it back to the root.

**LITE:** Ctrl+F and Ctrl+H flip to EDITOR (the usual serialise, so
nothing is reordered) and open the buffer's search panel once the new
buffer is mounted (in the mount layout effect), Find focused for Ctrl+F
and Replace for Ctrl+H. The cursor is placed at the start of the
selected entry's text, so typing searches from that entry. The editor
does not flip back by itself; LITE stays one click away.

## Consequences

- The two manuals and the two editors share one search grammar and one
  look, light chrome included.
- No search across wrapped rows: a phrase broken by the wrap is not
  found. The manual's rows are short paragraphs' lines, so this rarely
  matters; the layout-row model keeps highlighting and scrolling simple.
- LITE has no find of its own: its list is short and filtered by kind,
  and the profile text is the source of truth (ADR 0015), so the search
  goes where replace can work on the text.
