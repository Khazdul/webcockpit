# 0143 — The profile editor remembers its place

- Status: Accepted (owner, 2026-11-13: the editor remembers the chosen
  kind and the marked row; no search in the profile). Built in stage 57.
  Not yet tried by the owner as built; not yet released.
- Date: 2026-11-13
- Related: ADR 0128 (the editor "Ryggen", its zones and layouts), ADR
  0015 (the text is the source of truth; Lite never reorders it), ADR
  0105 (apply in place), ADR 0103 (the Profile window). Stage:
  `docs/stages/57-profile-remembers-place.md`.

## Context

The editor's state lives in its component, and the component is gone
when the editor is left (the Profile window closes, the menu page or the
start page's box goes back). A player who edits a macro in the middle of
a long list, closes the window, tries the macro and wants to fix it had
to choose the kind and find the row again on every round. He asked for
the editor to remember where it was, and for a search in the profile.
The owner: no search; remember the kind and the marked row.

## Decision

### 1. What is remembered, and for how long

Per profile name: the chosen kind, the marked row of each kind, and the
list's scroll offset for the chosen kind. In memory only
(`src/editor/profile/place.ts`, one `Map`), for the page's lifetime: a
reload starts fresh, and nothing goes into the settings, IndexedDB or
any storage. One map for every host: the Profile window, the phone's
menu page and the start page's Profile → Edit share a profile's place.

Not remembered: the view (every open is Lite), the Editor buffer's
cursor, the detail's field, the highlight grids' cursors, an open sheet.
The `+ New` row is not remembered, and neither is a kind whose cursor was
never moved: those open as before (the first row).

### 2. A row's identity

Entry ids come from a fresh parse at every open, so a row is kept as a
mark: `at`, its index among the kind's entries in **document order**;
`pattern` (a macro's key name); and `row`, the display row it was on.

Document order, because that is what stays put: Lite never reorders the
text (ADR 0015), while the list sorts by pattern, moves an entry whose
pattern was edited once the edit is applied, and shows a new entry last
only until the editor is left. An entry edited and applied, a new entry,
and one of several entries with the same pattern are all found again by
`at` + `pattern`.

At the next open the mark is resolved against the new parse:

1. the entry at `at`, when its pattern is `pattern`;
2. else the first entry of the kind with that pattern;
3. else display row `row`, clamped to the list (after a delete or an
   import the mark lands near where it was, not on an unrelated entry
   that happens to have the old document index);
4. an empty kind marks nothing.

Nothing here can throw or mark a missing row: the result is always an
entry of the new parse or none.

### 3. When it is kept

Continuously, not at the close: while Lite is the mode, a layout effect
writes the place whenever the kind, the cursor or the marked entry
changes, and the list's scroll event writes the offset. So the place is
right however the editor is left (Esc, the window's X, the apply
prompt's Yes or No, a discard). In Editor nothing is written, and Help
changes nothing in Lite, so leaving from either keeps the last Lite
place. A flip from Editor back to Lite resets Lite's cursors, as it
always did, and the remembered rows with them.

The mark is taken from the document as Lite shows it, including an edit
that is not applied yet. If that edit is then discarded, rule 1 fails on
the pattern and rule 3 gives the same display row, which is the same
entry (the list did not re-sort).

### 4. At the open

Lite, the keyboard in the list, as before; the kind and the cursors
start from the place. The list's scroll offset is put back first, then
the marked row is brought into view if it is not (inside the list only:
the box and the window body never scroll for it). This waits for the
list to have a size, so on the start page it happens when the box's
morph has landed. In the wide layout the detail beside the list shows
the entry; in one column the list shows with the row marked and the
sheet stays closed.

## Consequences

- The first open of a profile after a page load is exactly as before.
- A profile renamed or deleted leaves a dead entry in the map until the
  reload; a new profile that takes the name inherits a place that then
  falls back by the rules above.
- With two entries of one pattern, and the marked one deleted outside
  the editor, rule 2 marks the other one.
- In a kind of more than 200 entries (a windowed list) the row is
  brought into view by the measured row height; before a row has been
  measured that is the default height, so a row that moved far (a new
  entry sorted elsewhere) can land a few pixels off the edge.
- The view is not remembered. Whether Editor and its cursor should be is
  a question for the owner's test.
