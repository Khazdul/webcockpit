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

## Addendum: as built in round 53g (2026-11-12)

Points 4–5 and the multi-line part of point 1. After this round only the
two CodeMirror buffers take the device's keyboard (53h).

**The multi-line fields.** The look kit's `TextArea` is marked on a
phone. Lite's body is `data-okb-kind="lines"`: text goes in with its line
breaks, Enter is a line break, backspace deletes back across one, the
caret goes up and down by the text's own lines (a long line that wraps is
one line; the column is kept through a run of up and down). The export
comment is one paragraph (`enterSubmits`): no kind, Enter saves as
before. After every edit and caret move the field's own scroll follows
the caret's line (measured once in a hidden copy of the text, per edit),
and the page's real scrolling boxes are moved so that line stands above
the keyboard. `useKeyboardInset` is 0 under our keyboard, since the page
already ends at its top edge; the export editor asks `useOwnKeyboardUp()`
as well, so it steps aside for ours as for the device's and adds no
padding.

**Where the keys sit, and why.**

- **Portrait:** one more row at the top of the block:
  `esc · tab · ← · → · ↑ · ↓`, six keys of 59 px at 360 px (a letter key
  is 32 px). The bottom row was full and its keys are the narrow ones; a
  row of its own keeps every existing key where it was and puts the two
  keys that can close things farthest from the thumbs. Portrait has the
  height (566 px of page left on the S21, 354 px on a 320 × 568 phone).
- **Landscape:** no row is added (the page keeps its 212 px). The keys
  stand in a column at each side of the block, in the room the centred
  block leaves: `esc, tab, ←` left of it and `↑, ↓, →` right of it,
  52 px wide and a third of the keyboard high. The block gets narrower
  for them where it must, its letter keys never under the game layout's
  36 px; a landscape too narrow even for that gets the row if the page
  keeps 150 px, else no page keys.
- **A page has no history arrows** (it has no history); the bottom row is
  the wide one there. ↑ and ↓ are dimmed in a one-line field.
- **The game layout is unchanged:** no Esc, no Tab, and no caret keys
  either. Its bottom row is full at 360 px and a tap in the field moves
  the caret; adding two keys would have shrunk the others (the stage plan
  listed them as cuttable).
- **The backtick** is the last symbol. In the Swedish layout with the
  digit row up the list is one longer than the one page it had: the
  backtick stands in shift's (empty) place there instead of bringing a
  page key for a single symbol. Elsewhere it is on the last page.

**What the keys do.**

- **Enter:** in a multi-line field a line break (the key is drawn unlit,
  `data-enter="newline"`, and acts on the press, in step with the
  letters); elsewhere the marked `Enter` key event of round 53f, on the
  click.
- **Esc:** a marked `Escape` key event at the field, on the click. It
  does what a real Esc does there: one press closes the look kit's dialog
  and the old-look prompt, cancels the export title and comment and a
  script setting's edit; in the manual's find it leaves the field (the
  frame stack's rule; a second Esc would go back), and in Lite's fields
  it goes back to the list. The keyboard goes with the field (it was
  removed, or lost the focus) and leaves no reserve.
- **Tab:** a marked `Tab` key event (`shiftKey` when shift is on, which
  is then used up). The profile editor cycles its zones: pattern to body
  keeps the keyboard up for the body; out of the last field it closes.
- **Caret keys:** set the field's selection through the adapter, never a
  key event; all four repeat while held, as backspace does.
- A second Enter or Esc for the same field within 300 ms is dropped, and
  none is sent to a field that is gone or has lost the focus.
- The hot key box, the Timers pane's herb menu and the log player, which
  listen for Esc in the capture phase, leave a marked key (or a key aimed
  at a page's field) to the page.

**Found and changed on the way.**

- A look page opened from the game's menu is `position: fixed` over the
  whole screen and did not end at the keyboard (53f's reserve only moved
  the overlay's box): it does now.
- **The keyboard no longer opens while the finger is down.** It opened on
  the focus, the page shrank under the finger, and the tap's click landed
  on what then lay there (a tap on Lite's body could press Delete). It
  opens with the click, or 60 ms after the finger lifts.
- On a low page (`max-height: 640px` for Lite, `480px` for the export
  composer) what is not the entry typed in steps aside: Lite's head,
  kinds and foot; the export page's bar, counter and preview.
- A rotation: the keyboard is placed anew and the field brought back into
  view. A field hidden for a moment with the focus in it (a page between
  two layouts) keeps the keyboard; the Scripts panel and the profile
  editor's sheet no longer hide for the frame before the script has
  measured the new width (`is-keys`, `has-sheet`).
- A field focused before the phone chunk came gets the keyboard when the
  mount comes. A chunk that failed and loads on a later try (the game
  opening) mounts the pages' keyboard and marks fields again.
- `PAGE_KEEP_PX` (150 px) stays: the start page's own too-small guard is
  off while the keyboard is up, so this is the floor there, and it decides
  when the digit row and the row of page keys give way.
- `.wc-ck-hex` (the settings popup's colour field) is not marked: the
  popup hangs on the menu bar, which a phone does not have.
