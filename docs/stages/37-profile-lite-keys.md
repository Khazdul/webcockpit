# Stage 37 — Profile editor LITE keys

Status: **Owner testing** (2026-11-04).

## Goal

The profile editor's LITE view (in game and from the start menu's
Profile) gets `n` for a new entry on the kind row, and loses Ctrl+F /
Ctrl+H. ADR 0119 (supersedes the LITE part of ADR 0070).

## Owner brief (2026-11-04)

1. When a kind button on the kind row (ACTIONS, HIGHLIGHTS, MACROS …) has
   focus, pressing plain `n` must create a new entry of that kind, exactly
   like `n` in the entry list does today: new entry, focus to the Pattern
   field; for macros it starts key capture, and on phone it shows the
   "Key capture: desktop only." flash. The owner should not have to go
   down into the list first.
   - Only `n`. `Del` must not work on the kind row (it stays list-only).
   - `n` works on the kind row and in the list only, not on the
     LITE/EDIT/HELP toggle, not in the detail panel.
2. Ctrl+F and Ctrl+H must be removed from LITE entirely. In LITE (not
   HELP) they are swallowed silently (the browser's own find or history
   does not open) and nothing happens. EDITOR keeps Ctrl+F and Ctrl+H;
   HELP keeps Ctrl+F.
3. Footer hints:
   - kind row: `n New · Tab Cycle · ESC Back`
   - list: `n New · Del Delete · Tab Cycle · ESC Back`
   - elsewhere in LITE: `Tab Cycle · ESC Back`

## Tasks

- [x] `n` on the kind row calls `newEntry()` (`src/editor/frame.tsx`,
      zone `kind`); Del does nothing there
- [x] LITE Ctrl+F / Ctrl+H swallowed; the `pendingSearch` plumbing,
      `entryOffset` and the `openSearch` import removed from the frame
- [x] Footer hints `KIND_HINTS`, `LIST_HINTS`, `LITE_HINTS` with
      narrower fallbacks (`fitHint`); ESC tokens tappable as before
- [x] Header comment of `frame.tsx`; the manual (`help.ts`) did not
      mention LITE find or where `n` works, so it is unchanged
- [x] ADR 0119; ADR 0070's status line points to it
- [x] e2e: `manual-find.spec.ts` (LITE Ctrl+F/Ctrl+H do nothing on the
      kind row, in the list and in Pattern; EDITOR Ctrl+H then Ctrl+F),
      `editor.spec.ts` (kind row `n` for an action and a macro, Del,
      `n` on the toggle, footer hints per zone), `profile-apply.spec.ts`
      (the in-game Profile window: kind row `n`, Ctrl+F, Del)

## Test guide

Dev server (`npm run dev`, http://localhost:5173/) on the branch
`stage-37-profile-lite-keys`.

1. **From the start menu:** Profile → EDIT. The editor opens in LITE with
   the focus on the kind row. The footer says
   `n New · Tab Cycle · ESC Back`.
2. **n on the kind row:** with ACTIONS chosen, press `n`. A new action
   appears and the cursor is in Pattern. Go back up to the kind row
   (↑), choose MACROS with →, press `n`: "Press the key to bind…"
   appears; press a key, then type the commands.
3. **Del on the kind row** does nothing. In the list (↓ from the kind
   row) the footer says `n New · Del Delete · Tab Cycle · ESC Back`, and
   `n` and Del work as before. On the toggle (LITE / EDITOR / HELP) and
   in the detail panel the footer says `Tab Cycle · ESC Back`.
4. **Ctrl+F / Ctrl+H in LITE** do nothing: you stay in LITE, and neither
   the editor's search nor the browser's find bar or history opens.
5. **EDITOR and HELP:** click EDITOR; Ctrl+F opens Find and Ctrl+H
   Replace, as before. In HELP, Ctrl+F finds in the manual.
6. **In game:** enter MUME, open the Profile window from the menu bar and
   repeat 2–4. A new alias made with `n` on the kind row works as soon as
   you click in the game.

Feedback wanted: does `n` from the kind row feel right, and are the
footer hints clear? Anything else in LITE that should go or change?

## Owner feedback

(pending)
