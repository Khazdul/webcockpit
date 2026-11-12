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

## Addendum: as built in round 53f (2026-11-12)

Points 1–4 for the **one-line fields**. The multi-line fields (Lite's
body, the export comment) and the CodeMirror buffers keep the device's
keyboard until 53g and 53h.

**§2 The page mount** (`src/phone/keyboard-pages.ts`, mounted by the
shell at boot once the phone chunk is there; deps `PageKeyboardDeps`)

- Same view and model. Its host (`.wc-okb-page`) is in the app box
  only while the keyboard is up, above the start page and the menu's
  overlay. The reserve is `--wc-okb-page-h` on the app box with
  `html.wc-okb-pg`: `.wc-chrome` and `.wc-overlay` end at the keyboard's
  top edge and lay themselves out once in what is left, as for a
  smaller window. The cockpit under a page is not touched: **no window
  size is sent for this keyboard.** The game's own keyboard is closed
  by the menu as before (and by the mount when it comes up).
- Size (`pageKeyboardPlan`, pure): the game layout's row heights; the
  block centred, a key at most as wide as in the game. Under 150 px of
  page left the digit row gives way, then the keyboard does not open.
  One `ResizeObserver` on the app box while open (rotation).
- The start page's too-small guards are off while it is up
  (`pageKeyboardUp()`), as the cockpit's is under the game's keyboard.
  The almanac is hidden, as under the device's keyboard. On a low page
  (a phone on its side, `max-height: 480px`) the look kit's dialog is
  drawn tighter and its hint line gives way, so the field and both
  buttons stand above the keys.
- The focused field is brought into view once, by moving only real
  scrolling boxes (`overflow-y: auto | scroll`); `scrollIntoView` is
  not used (it scrolls the clipped page boxes too).

**§3 Marking** (`src/core/own-keyboard.ts`: `pageKeyboard()`,
`ownFieldAttrs()`): `Field` (so also the manual's find and the editors'
Find / Replace row, which are `Field`s), the phone branch of
`TextField`, and the script setting's raw input. The flag is set once by
the shell: the phone's game layout decision (`device().phone` and a
phone-size window) and not `?kbd=0`. `TextArea` is not marked yet.

**Opening and closing.** A tap on a marked field, or a focus within
700 ms of a pointer (a dialog a tap opened focuses its field), opens
it; a focus without a pointer opens nothing. The target follows the
focus between marked fields. It closes: on the fold key (and blurs);
when the field goes away (one `MutationObserver` on its ancestors while
open); when the field loses the focus to anything that is not a marked
field; when a text field that is not ours takes the focus (so ours and
the device's never stand together). After a close, a focus the page
gives back by itself opens nothing until the next press.

**§4 Enter** is `sendOwnKey(field, 'Enter')`: a marked `keydown` +
`keyup` (a `WeakSet` of the events; `isOwnKey`). `keyNameFromEvent`
returns null and `learnKeyLabel` false for a marked event, and the input
pane's key handlers return at once (no `enterDown`). No emulation of the
browser's default action (`change`) was needed: every field's Enter
goes through the frame stack or its own `keydown` handler. On a page
**Enter acts on the click, not on the press** (`enterOnClick`): it may
close the dialog and the keyboard under the finger. `TextField`'s own
line-break path is not reached by our Enter (no `beforeinput`), so
nothing fires twice. Esc is not a key yet (53g).

**Numeric fields** (`data-okb-kind="digits"`, the script setting's
number): the digit row is up for that field whatever the stored state;
its key folds it for that field only.

**History arrows** are dimmed (no history). Layout setting and
vibration as in the game. No readout on the pages.
