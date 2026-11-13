# Stage 57 — The profile editor and the manuals remember the place

Status: **Done** (2026-11-13). Released in 0.9.1.

## Goal

The profile editor (the Profile window in the game, the phone's menu
page, the start page's Profile → Edit) comes back, on the next open, to
the kind that was chosen and the row that was marked, with the list
scrolled as it was left. It opens in the view it was left in (Lite or
Editor); the Editor view comes back at its scroll and cursor; the
profile manual (Help) and the script manual come back where they were
scrolled to; the script editor comes back at each script's scroll and
cursor. ADR 0143.

## Owner brief (2026-11-13)

A player's request: "In active session, when I open profile, go
somewhere (like macros and scroll to middle of my macros, edit
something) and I close it, test the macro, realize it's bad and needs
fixing, I have to navigate to the original place again. Could the
cockpit remember where I left off?" He also asked for a search in the
profile.

The owner's decision:

1. No search. It is not built.
2. The editor remembers which kind (actions, aliases, highlights,
   macros, substitutes) was chosen and which row was marked, and comes
   back there on the next open.

A second message from the owner the same day (translated): "The Editor
and Help view too would be nice if they remember the last scrolled
position. Both profile help and script help."

A third message: "scripteditor också" (the script editor too).

Worked out for the build (ADR 0143): per profile name, in memory for the
page's lifetime (a reload forgets). The editor opens in the view it was
left in, Lite or Editor (the coordinating session's decision); Help is
not opened by itself. The first open after a page load is Lite. The
script editor's place is per script name (the library has no other id);
it has one view, so there is no view to reopen. The detail's field in
Lite is not remembered.

## Tasks

- [x] `src/editor/profile/place.ts`: the place per profile name, a row's
      mark (document position, pattern, display row) and its fallbacks
- [x] `editor.tsx`: the kind and the cursors start from the place; the
      place is kept on every Lite change and on the list's scroll; the
      scroll offset is put back and the row brought into view at the
      open; header comment
- [x] `place.ts` and `editor.tsx`: the view an open starts in
- [x] `src/editor/buffer-place.ts`: a buffer's selection and scroll,
      put back in a new buffer and clamped to its text; used by the
      profile editor's Editor view and the script editor
      (`script-frame.tsx`, per script name)
- [x] `look-manual.tsx`: a manual's place (section + offset from its
      top), one per manual; used by the profile Help (`help-view.tsx`)
      and the script manual (`script-manual-frame.tsx`; F1 on a known
      name still goes to its entry)
- [x] The manual (`help.ts`, "Lite and Editor"): one sentence. The
      README says nothing about what an open shows, so it is unchanged
- [x] ADR 0143
- [x] Unit: `tests/unit/editor-place.test.ts`
- [x] Existing tests changed: `editor.spec.ts` (the Profile window left
      in Editor now opens in Editor: no `e` before typing),
      `script-editor.spec.ts` (F1 away from any name, and the Scripts
      page's Manual after it, open the manual where it was left, not at
      Getting started; a script opened again has its cursor where it
      was left, so the test goes to the top before typing),
      `typed-settings.spec.ts` (the Profile window left in Editor opens
      in Editor: the test clicks Lite),
      `script-manual-frame.test.tsx` (the manual's place is forgotten
      between tests)
- [x] e2e: `profile-place.spec.ts` (the Profile window: kind, row and
      scroll in a long macro list, left by Esc, by X from Help, by a
      discard from Editor; a new entry; the New row; a profile changed
      between the opens; the start page and a reload; Editor: view,
      scroll and cursor after a close and after a flip, a shorter text;
      Help after a close and inside one open; the script manual after a
      close, and a reload; the script editor: two long scripts, each at
      its own scroll and cursor, a script saved shorter), `phone-profile-editor.spec.ts` (one column:
      the list, not the sheet)

## Test guide

Dev server (`npm run dev`, http://localhost:5173/) on `main`. Use a profile with more macros (or aliases)
than the list shows at once.

1. **In the game:** enter MUME, open the Profile window from the menu
   bar. Choose Macros (M), go down to a row in the middle of the list,
   open it (Enter), change its commands, Esc to leave the field. Close
   the window (Esc or X).
2. **Open the window again.** Macros is chosen, the same row is marked
   and in view, the list is scrolled as you left it, and the detail
   beside the list shows that macro. The keyboard is in the list: Enter
   opens the entry.
3. **Other ways out:** go to another kind and row, switch to Help and
   close from there (X). The next open is Lite at that kind and row.
4. **Each kind keeps its own row:** mark a row in Aliases and one in
   Macros; after a reopen, both kinds are on their rows.
5. **A new entry** (N), given a pattern and commands: after a reopen it
   is still the marked one, now at its sorted place in the list.
6. **Start page:** Profile → Edit, choose a kind and a row, Esc back to
   Profiles, Edit again: the same kind and row. The same profile opened
   in the game afterwards starts there too.
7. **A reload forgets:** reload the page and open the editor: Actions,
   the first row, as before.
8. **Editor view:** in a long profile, click EDITOR, scroll down, put
   the cursor in a line, close the window. Open it again: it opens in
   Editor, scrolled as you left it, the cursor on the same line and
   column, the keyboard in the text, and the status does not say
   Modified. Click LITE and EDITOR again: the same place. Close from
   Lite: the next open is Lite.
9. **Help:** press H, scroll down in the manual, close the window. Open
   it (Lite or Editor, as you left it), press H: the manual shows the
   same lines. L and H again inside the same open: the same lines too.
10. **Script manual:** Scripts → Manual, scroll down or pick a section,
    go back; Manual again: the same lines. The same from the script
    editor (F1 with the cursor on empty space); F1 on an API name still
    goes to that entry. Try it in the game's Scripts window and on the
    start page.
11. **Script editor:** Scripts → a long script → Edit. Scroll down, put
    the cursor in a line, Esc. Edit again: the same lines, the cursor on
    the same line and column. Open another script: it has its own place
    (the top the first time); go back to the first: still where you
    left it. The same in the game's Scripts window.
12. **Phone** (if at hand): the menu's Profile, Macros, tap a row, go
   back to the list, close; open again: Macros, the list with that row
   marked (the entry is not reopened).

Feedback wanted:

- Is it right that the editor opens in Editor when it was left in
  Editor?
- Should Help open by itself when the editor was left with Help up?
- Should the entry reopen for typing (the caret in its field) instead
  of only being marked in the list?
- Is "until the page is reloaded" long enough, or should the place
  survive a reload?

## Owner feedback

2026-11-13: "Det här blir bra. Publicera." Approved and released in
0.9.1. The four questions in the test guide were not answered one by
one; the behaviour stands as built.
