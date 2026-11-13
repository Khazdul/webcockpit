# 0143 — The profile editor and the manuals remember the place

- Status: Accepted (owner, 2026-11-13: the editor remembers the chosen
  kind and the marked row; no search in the profile; then, the same day:
  the Editor view and the Help views, the profile manual and the script
  manual, remember where they were scrolled to; and the script editor
  too). Built in stage 57. Not yet tried by the owner as built; not yet
  released.
- Date: 2026-11-13
- Related: ADR 0128 (the editor "Ryggen", its zones and layouts), ADR
  0127 and 0129 (the manual reader, the script manual), ADR
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
The owner: no search; remember the kind and the marked row. In a second
message he added the Editor view and the Help views: "it would be nice
if they remember the last scrolled position. Both profile help and
script help." And in a third: "the script editor too".

## Decision

### 1. What is remembered, and for how long

Per profile name: the chosen kind, the marked row of each kind, and the
list's scroll offset for the chosen kind. In memory only
(`src/editor/profile/place.ts`, one `Map`), for the page's lifetime: a
reload starts fresh, and nothing goes into the settings, IndexedDB or
any storage. One map for every host: the Profile window, the phone's
menu page and the start page's Profile → Edit share a profile's place.

Not remembered: the detail's field, the highlight grids' cursors, an
open sheet, the find queries (the script manual's find query was already
kept while the page lives; that is unchanged). The `+ New` row is not remembered, and neither is a kind whose cursor was
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
prompt's Yes or No, a discard). In Editor nothing of Lite's is written,
and Help changes nothing in Lite, so leaving from either keeps the last
Lite place. A flip from Editor back to Lite resets Lite's cursors, as it
always did, and the remembered rows with them.

The mark is taken from the document as Lite shows it, including an edit
that is not applied yet. If that edit is then discarded, rule 1 fails on
the pattern and rule 3 gives the same display row, which is the same
entry (the list did not re-sort).

### 4. At the open in Lite

The keyboard is in the list, as before; the kind and the cursors
start from the place. The list's scroll offset is put back first, then
the marked row is brought into view if it is not (inside the list only:
the box and the window body never scroll for it). This waits for the
list to have a size, so on the start page it happens when the box's
morph has landed. In the wide layout the detail beside the list shows
the entry; in one column the list shows with the row marked and the
sheet stays closed.

### 5. The view an open starts in

Decided in the build (the coordinating session's call, not the owner's
words): the editor opens in the view it was left in, Lite or Editor.
Left in Editor, the next open is Editor with the keyboard in the buffer.
The first open of a profile after a page load is Lite. Help is not a
view of its own here: it lies over Lite or Editor, so an editor left
with Help up opens in the view under it, and Help opens on H as before,
at its remembered place.

An open straight into Editor starts the buffer with the stored text, so
nothing is unapplied and nothing is committed by the open.

### 6. The Editor buffer

Per profile name, same lifetime (`src/editor/buffer-place.ts`, shared
with the script editor, §8): the selection (anchor and head) and the
scroll, kept as the text position of the line at the scroller's top plus
the pixels scrolled past that line's text (not a pixel offset from the
top: CodeMirror estimates the heights of lines it has not drawn, and
wrapped lines make a pixel offset drift). The selection is written when
it changes, the scroll when the buffer scrolls.

The buffer is a new one at every flip to Editor, so the place is put
back at an open and also at Lite → Editor inside one open. Both are
clamped to the text: a selection beyond the end is the end; a top line
beyond the end is the end, unscrolled. The scroll is put back once the
buffer has a size (after the start page's morph, not under Help), and
nothing is written before that.

### 7. The manuals

The reader (`look-manual.tsx`) takes a `place`: the current section and
the text's offset from that section's top. One place per manual for the
page's lifetime (`manualPlace('profile')`, `manualPlace('script')`), so
the profile manual's place is shared by all profiles and every host, and
the script manual's by every way in (the Scripts page's Manual, the
script editor, in the game and on the start page).

The offset is from the section at the top, not from the text's top: the
sections are laid out lazily (`content-visibility`), so the same pixel
offset is another place at the next open. It is written on the frame
after a scroll and when the current section changes.

- Profile Help comes back to the same lines after a close of the editor
  and also when Help is closed and opened inside one open (before, that
  went to the top of the section).
- The script manual opens where it was left. F1 on a name the manual has
  an entry for goes to that entry, as before, and that is then the
  place. F1 on no name, or on a name without an entry, used to open
  Getting started; it now opens where the manual was left.

### 8. The script editor

The script editor's buffer uses the same helper (`BufferKeeper` in
`buffer-place.ts`): the selection and the scroll are kept per script and
put back at the next open of that script, clamped to its text (a script
saved shorter, imported again or edited elsewhere in between).

A script's identity is its name: the library has no other id. The key is
read at every write, so a script that takes a new `@name` on a save goes
on under the new name from its next cursor move or scroll; the old
name's place stays in the map, unused, until the reload. A renamed or
deleted script simply has no place; nothing is looked up that can throw.
A bundled (read-only) script keeps a place too, and a Duplicate starts
at the top, as a new script.

The script editor has one view, the code; the manual is a frame of its
own over it (§7). So there is no view to reopen: it opens in the code,
as before.

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
- A manual's place is read a frame after a scroll: a close in the same
  frame as the last scroll keeps the place of the frame before.
- An editor that was left in Editor opens in Editor also for a player
  who only wanted to look something up in Lite: one click or L away.
  Whether that is right, and whether Help should reopen by itself, are
  questions for the owner's test.
- A buffer's scroll is written on scroll events and its selection on
  cursor moves; both read the buffer only while it is shown.
