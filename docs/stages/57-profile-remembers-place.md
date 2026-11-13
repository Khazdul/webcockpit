# Stage 57 — The profile editor remembers its place

Status: **Built, owner test pending** (2026-11-13). On the branch
`stage-57-profile-place`; not merged, not released.

## Goal

The profile editor (the Profile window in the game, the phone's menu
page, the start page's Profile → Edit) comes back, on the next open, to
the kind that was chosen and the row that was marked, with the list
scrolled as it was left. ADR 0143.

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

Worked out for the build (ADR 0143): per profile name, in memory for the
page's lifetime (a reload forgets); every open is still Lite with the
keyboard in the list; the Editor / Help view, the buffer's cursor and
the detail's field are not remembered.

## Tasks

- [x] `src/editor/profile/place.ts`: the place per profile name, a row's
      mark (document position, pattern, display row) and its fallbacks
- [x] `editor.tsx`: the kind and the cursors start from the place; the
      place is kept on every Lite change and on the list's scroll; the
      scroll offset is put back and the row brought into view at the
      open; header comment
- [x] The manual (`help.ts`, "Lite and Editor"): one sentence. The
      README says nothing about what an open shows, so it is unchanged
- [x] ADR 0143
- [x] Unit: `tests/unit/editor-place.test.ts`
- [x] e2e: `profile-place.spec.ts` (the Profile window: kind, row and
      scroll in a long macro list, left by Esc, by X from Help, by a
      discard from Editor; a new entry; the New row; a profile changed
      between the opens; the start page and a reload),
      `phone-profile-editor.spec.ts` (one column: the list, not the
      sheet)

## Test guide

Dev server (`npm run dev`, http://localhost:5173/) on the branch
`stage-57-profile-place`. Use a profile with more macros (or aliases)
than the list shows at once.

1. **In the game:** enter MUME, open the Profile window from the menu
   bar. Choose Macros (M), go down to a row in the middle of the list,
   open it (Enter), change its commands, Esc to leave the field. Close
   the window (Esc or X).
2. **Open the window again.** Macros is chosen, the same row is marked
   and in view, the list is scrolled as you left it, and the detail
   beside the list shows that macro. The keyboard is in the list: Enter
   opens the entry.
3. **Other ways out:** go to another kind and row, switch to Help or
   Editor and close from there; change something in Editor and answer
   "No, discard". Each time the next open is at the last place Lite
   showed.
4. **Each kind keeps its own row:** mark a row in Aliases and one in
   Macros; after a reopen, both kinds are on their rows.
5. **A new entry** (N), given a pattern and commands: after a reopen it
   is still the marked one, now at its sorted place in the list.
6. **Start page:** Profile → Edit, choose a kind and a row, Esc back to
   Profiles, Edit again: the same kind and row. The same profile opened
   in the game afterwards starts there too.
7. **A reload forgets:** reload the page and open the editor: Actions,
   the first row, as before.
8. **Phone** (if at hand): the menu's Profile, Macros, tap a row, go
   back to the list, close; open again: Macros, the list with that row
   marked (the entry is not reopened).

Feedback wanted:

- Should the view be remembered too: closed in Editor, open in Editor,
  with the cursor where it was in the text?
- Should the entry reopen for typing (the caret in its field) instead
  of only being marked in the list?
- Is "until the page is reloaded" long enough, or should the place
  survive a reload?

## Owner feedback

