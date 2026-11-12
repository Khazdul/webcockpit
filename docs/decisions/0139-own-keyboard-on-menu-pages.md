# 0139 — Our keyboard on the phone's menu pages too

- Status: Accepted (owner, 2026-11-12: "our own keyboard should apply
  everywhere, the start menu's parts included", and before the
  release). Built in stage 53, rounds 53f–53i.
- Date: 2026-11-12
- Related: amends ADR 0138 §1 (the pages kept the device's keyboard)
  and §3 (no synthetic key events). Survey:
  `notes/research/own-keyboard.md` §6.

## Context

After 53e our keyboard is the only one in the phone's game layout. The
pages and frames opened from the start menu and the game's menu
(profiles, scripts, export, the editors) still raise the device's
keyboard, with everything ADR 0138 lists against it. The owner wants
one keyboard on the phone.

## Decision

1. **Scope.** Every text field a phone user can reach uses our
   keyboard: the one-line fields, the multi-line fields (Lite body,
   export comment) and the two CodeMirror editors and their search
   panel. Desktop and tablet do not change. `<select>`, file, colour
   and range controls are not text fields and stay native.
2. **One keyboard, two mounts.** The same view and model
   (`src/phone/keyboard.ts`, `keyboard-model.ts`). In the game layout
   it stands on the allocator's rows as today. On a page it stands at
   the bottom of the app box, and the page gets a fixed bottom reserve
   (a CSS variable on the app box; the page's own layout is not
   measured or animated). A page opened over the game uses the page
   mount; the game's keyboard is closed under it. The chunk rule
   holds: the phone chunk gets what it needs of the chrome through its
   deps.
3. **Marking the fields.** `inputmode="none"` and
   `virtualkeyboardpolicy="manual"` are set inside the shared
   components (`Field`, `TextArea`, `TextField`), on the few raw
   inputs, and through CodeMirror's `contentAttributes`, only on a
   phone.
4. **Keys on a page.** Text goes in through the field's adapter, never
   as key events (as ADR 0138 §3). **Enter, Esc, Tab and the caret
   keys may be sent as a synthetic `keydown` on a page**, aimed at the
   focused field, because the frame stack, the fields' own handlers and
   CodeMirror's keymaps all take them that way. Such an event is
   marked, and the script engine's key handling (macros, key label
   learning) and `enterDown` ignore it. In the game layout ADR 0138 §3
   stands unchanged: no synthetic events.
5. **New keys** (for the pages; in the game layout only where they do
   no harm): newline where the field is multi-line (Enter's face
   changes), Tab, Esc, caret left / right (up / down in multi-line
   fields and the editors), and the backtick on a symbols page. The
   history arrows show only where there is a history.
6. **CodeMirror.** An adapter over the view: text through the input
   handlers and a transaction with `userEvent: "input.type"` (so
   bracket closing and completion work), the keys of point 4 through
   its own key handling, selection native. Popups (completion, search)
   stay above the keyboard.
7. **Afterwards** the device keyboard code on the phone is removed
   (`wc-kbd`, `keyboardUp()`, the keyboard inset hooks, the phone-only
   textarea swap, `?kbd=0`), with what a shrunken window (split
   screen) should do decided there. `--wc-vv-h` stays for the address
   bar and fullscreen.

## Go / no-go

If the CodeMirror round (53h) does not give an editor the owner finds
usable on the S21, the two editors keep the device's keyboard and the
rest stands; decided by the owner after that round.
