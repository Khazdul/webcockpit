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

## Addendum: as built in round 53h (2026-11-12)

Point 6, and the findings of the review of round 53g. After this round
no text field a phone user can reach asks the device for its keyboard
while the gate is on.

**§6 The two CodeMirror buffers** (the script editor, the profile
editor's Editor view)

- **Marking and registering** (`src/editor/own-keyboard-cm.ts`, in the
  editor chunk): one extension, empty unless `pageKeyboard()`. On a
  phone it marks the content element through `contentAttributes`
  (`inputmode="none"`, `virtualkeyboardpolicy="manual"`,
  `data-okb-kind="editor"`) and registers the view for that element
  (`registerOwnEditor`, `src/core/own-keyboard.ts`). The shell hands the
  pages' mount `ownEditorOf`; the phone chunk imports no CodeMirror and
  the editor chunk nothing of the phone.
- **Text** (`typeText`): the `EditorView.inputHandler` handlers first
  (Lua's bracket and quote closing, the profile editor's `{`), else one
  transaction, `replaceSelection` with `userEvent: "input.type"` and
  `scrollIntoView`: completion opens, `indentOnInput` and the case
  correction run, the caret's line is kept in view by CodeMirror.
- **Keys:** Enter, Backspace, Tab, Shift+Tab, Esc and the four caret
  keys are marked key events at the content element (`OwnKey` grew
  `Backspace` and the arrows). The frame stack hands them to the
  frame's handler, which runs the buffer's bindings as for a physical
  key: `closeBlock`, indent and dedent, bracket pair delete and
  `pairDelete`, completion accept, move and dismiss, snippet fields, the
  search keys. Backspace and the carets repeat while held. Enter is the
  newline key (on the press, never held back as a double tap); Esc is
  still held back for 300 ms after an Enter or Esc to the same field.
  What a physical key does, ours does: Esc with nothing open closes the
  script editor (it asks when there are changes) and leaves the profile
  editor's buffer; Tab in the profile editor's buffer goes to its other
  zones, and the keyboard goes with the focus.
- **Opening.** A tap in the text opens it; so does a focus that comes
  from another field of ours with the keyboard up (Esc in Find) or from
  our Tab key. A focus the frame gives the buffer after a tap elsewhere
  (the editor opened, Save, back from the manual) opens nothing: the
  code is read first. A read-only buffer (a bundled script) is marked
  and opens nothing. A drag that scrolls the code opens and closes
  nothing. Selection, the touch handles and paste are the browser's and
  CodeMirror's.
- **The find row** is the editor's as far as the keyboard goes: moving
  between the code and Find or Replace keeps the keyboard, its height
  and its symbols; Esc in Find returns to the code with it up.
- **Layout.** The page ends at the keyboard as in 53f, so the buffer's
  scroller does; the mount only asks the editor to bring its caret into
  view when the room changed (the keyboard came up, a rotation), and
  moves nothing of the page for an editor. On a low page (a phone on its
  side, `max-height: 480px`) what is not code steps aside while the
  keyboard is up: the box's hood and Back, the script editor's status
  line, the profile editor's views and foot (eight lines of code show at
  800 × 360 where four did; the fold key brings them back). The
  completion list stands alone under our keyboard (its info box had no
  room and lay over the list); on a low page it shows two rows at a time
  so it fits above or below the caret's line. A doc plate is never
  higher than the page. The find row on a phone is three rows instead of
  five (the arrows and Close beside the field), and on a low page one
  row each for Find and Replace without their labels.
- **Characters for code.** For an editor (and its find row) the symbols
  stand in a code order (`OKB_SYMBOLS_CODE`: `( ) { } = " ,` nearest the
  thumbs, then `[ ] # % : - _ < > +`), and in portrait the digit row is
  up whatever the stored state, where the page keeps 360 px above it
  (not on a 320 × 568 phone): with the row up one symbols page holds
  everything Lua and the profile syntax need, two taps away (English
  keeps `@ ! ?` for a second page). The row's key folds it for the
  editors. In landscape the row follows the stored state, and with it
  folded `' * / \ ~ ^ $ & |` and the backtick are a third tap away. The
  game layout and every other field keep their order.

**The sweep.** Reached on a phone and marked: every look kit `Field`
and `TextArea`, `TextField`, the script setting's input, both
CodeMirror buffers, and now also the old-look find panel's two inputs
(`search.ts`, used by no page today). Not marked: the settings popup's
hex field (`.wc-ck-hex`: the popup hangs on the menu bar, which a phone
does not have). `<select>`, file and colour inputs stay native.

**When the keyboard opens (corrects the 53g addendum).** Never before
the tap's click. 53g deferred the opening only while the finger was
down; a field that takes its focus on the mouse press a phone makes up
after the lift (every plain field) still opened at once, and the made-up
release and click were hit-tested on the shrunk page (a lost click, a
key of ours hit). Now a focus that comes while the finger is down, or
between its lift and the click, is only noted; the click opens, or
60 ms after the lift where no click follows. The same holds with the
keyboard up when the new field would change its height. Checked with a
finger's real timing (touch start, 90 ms, touch end through CDP).

**Also from the review of 53g.**

- A field that has the focus with the keyboard folded gets the keyboard
  back when a tap on the page leaves the focus there (Lite's New reuses
  the focused Pattern field, so no focus event comes). Not for an
  editor.
- The first line of a multi-line field shows with the field's own top
  air: its scroll is 0 (it was 9).
- Tests for the guards that had none: the log player and a marked key
  (`player/view.ts`), the `.wc-menu-look` bottom rule, keys to a field
  that lost the focus (`once()`, Tab). The guards in `hotkeys.ts` and
  `timers.ts` and the two rotation classes had tests already; each was
  checked by taking the guard out.
- Our Tab key's claim on the next focus ends at the fold key.

**A dialog's error line on a low page** (the profile and script name
dialogs, a phone on its side): it keeps its height (the dialog's window
is a column that squeezed it under the buttons); the buttons are 34 px
high there.

**Open.**

- With Paper chosen, the script editor on the start page (always dark)
  takes Paper's pop-up and tool colours on the dark box: low contrast.
  Older than this stage and the same on a desktop; not touched here.
- Undo and redo have no key. Caret up and down in the two editors
  follow CodeMirror (visual lines), in Lite the text's own lines.
- Not tried on a device: the touch handles and the paste bubble over a
  marked CodeMirror, and whether the device's keyboard stays down on a
  marked `contenteditable` after an app switch.

## Addendum: as built in round 53i (2026-11-12)

Point 7, the leftovers of the 53h review, and one addition from the
owner's phone. Line numbers are those of the round's last commit.

**Removed** (the device keyboard on a phone with the phone layer)

- The gate: `?kbd=0` in the shell, `okbFromQuery`'s null, the Keyboard
  group's `available`, `ownKeyboard` being optional in `PhoneLayerDeps`.
- The phone layer: `watchKeyboard` and `SHAPE_SETTLE_MS` (the blur when
  the device's keyboard folded), `PhoneKit.keyboardUp`, the box's place
  over the command row, the key size and lens row branches, the
  readout's `wc-kbd` and its class observer.
- The cockpit and the allocator: `PHONE_KBD_GAME_ROWS` and `gameKeep`,
  the `kbd` argument of `lensCells`, `side.keyboard` and
  `SIDE_COMM_KBD_ROWS` / `SIDE_COMM_KBD_BESIDE_ROWS`, the "keyboard
  down" condition of the portrait limit.
- CSS: the four `wc-kbd` rules of `phone.css` (compass, hot keys, the
  box's notch, the field's width).
- Tests and tools: every `?kbd=0` e2e case, the shots states `keyboard`
  and `comm-keyboard` (their pictures of stage 51 stay), the bench's
  device path rows.

**The device keyboard state is switched, not deleted.**
`src/layout/phone-viewport.ts` still computes `keyboardUp()` and sets
`html.wc-kbd`, but only while someone needs it: the shell turns it off
when the pages' keyboard is mounted (`watchDeviceKeyboard(false)`,
`src/app/shell.ts:794`) and on again if the phone layer cannot be
mounted (`:941`); a cockpit in the old phone layout holds it on while
it lives (`holdDeviceKeyboard`, `src/layout/cockpit.ts:617`). So with
the phone layer and no old-layout cockpit on the page, a shrunken
visible area never sets it. `--wc-vv-h`, the viewport meta and the
fullscreen re-measure are untouched.

**Kept for the old phone layout** (a phone flag forced in a wide
window; a phone whose phone chunk failed; the run log player and
Spotlights on a phone, which are the old tab layout and whose pane
fields, such as Comm's search, still get the device's keyboard). To be
removed with that layout (stage 52 file, section C):

- `src/layout/phone-viewport.ts`: `KEYBOARD_SHARE` (:62),
  `watchDeviceKeyboard` (:87), `holdDeviceKeyboard` (:99),
  `keyboardUp` (:118), `isKeyboardUp` (:159), the class toggle (:248);
  `phone-viewport-debug.ts:32` (`kbd` in the `?vv=1` readout).
- `src/layout/cockpit.ts`: the hold (:617); `guard: !keyboardUp()` in
  `relayoutPhone` (:1077); in `relayoutPhoneGame` the `kbd` that turns
  the guard off and pins the shape (:1368, a phone without the layer);
  `phoneGameLayoutClosed` passes it on (:1476). The allocators' `guard`
  option.
- `src/ui/ui.css:568` and `:590` (`#app` padding, `.wc-chrome` /
  `.wc-overlay` bottom), `src/chrome/start.css:542` (the almanac
  hidden).
- `src/ui/input-pane.ts`: `passField` (:284), `swapField` (:436) and
  their uses (:485, :548): the `type="password"` field at the password
  prompt where the command line is not ours.
- `src/chrome/kit/widgets.tsx:648`: `TextField`'s one-row textarea on a
  phone. Its only user is the old-look Options frames
  (`src/chrome/frames/options.tsx`), reached only in the old layout.

**Kept, though listed as candidates**

- `keyboardInset` / `useKeyboardInset` and the resize effect of
  `useFieldEl` (`src/chrome/kit/look-controls.tsx:807`, `:829`, `:307`)
  and their users (the export editor, the kit gallery): they follow
  `visualViewport` on any device, so a tablet's own keyboard uses them.
  Not phone code; removing them would change the tablet.
- Comm's one-row textarea in the phone mode (`src/panes/comm.ts:583`,
  `:609`). Its reason (the device keyboard's autofill bar) is gone,
  but an `<input>` there has not been seen on a device (Chrome's own
  suggestions on a focused input), and the owner approved the field as
  it is. Left for a device test.
- "A text field that is not ours closes ours"
  (`src/phone/index.ts:606`, `src/phone/keyboard-pages.ts:653`): no
  such field is known in the game layout; on a page a read-only code
  buffer is one. Three lines each, kept as the guard that the two
  keyboards never stand together if a later field forgets its mark.

**Decision C: a shrunken visible area** (a split screen, a window made
lower). Nothing special: the layout uses the smaller area as any small
screen (the too-small guard is on), our keyboard stays while the
allocator has rows for it and closes once when it has not.

- A tap on a screen too low for the keyboard opens nothing: the layer
  asks the cockpit for the room first (`Cockpit.phoneBottomLift`, the
  same sum the layout closes it by), and the field does not keep the
  focus. Before: opened, then closed by the next layout, two window
  sizes per tap.
- A held K key with our keyboard and Comm open in portrait: the box's
  room is judged on the layout as it would be with the keyboard closed
  (`Cockpit.phoneGameLayoutClosed`, the allocator run without the
  reserve; nothing is laid out). A refused hold changes nothing, and
  the keyboard stays. Landscape still folds first and judges after.

**The 53h review's leftovers.** In an editor, while the digit row is
forced for code and the stored `phone.keyboard.digits` is off, the
row's key folds the row and brings it back for that editor (its buffer
and find row) and never writes the setting; an editor opened anew has
the row up again. The 300 ms sentence of the 53h addendum is corrected
in place. New e2e: a double tap on Esc with unsaved changes (four
intervals) never discards; a snippet taken with Tab and its fields; a
long press in the code; a script edited from the game's menu.

**Comm's hood in portrait** (the owner's S21; amends ADR 0137 §1, "In
landscape Comm has a hood reading COMM … Portrait has neither"). The
missing title was that decision, not a fault. Comm now has the same
hood in portrait, on rows of its own as the strip's hood
(`phoneCommHeadRows`). The hood is 16 px: it takes one row wherever a
row is at least 15 px (it may reach 1 px into Comm's own top air,
`PHONE_COMM_HOOD_SLACK_PX`), so also at a new phone's text size 14 (a
15.24 px cell), where the first build of this round took two (review
F3); smaller text takes two rows. Where Comm's
content would keep less than 104 px under it (a small phone, typing
above the keyboard) the hood is left out and the rows are the
conversation's (`PHONE_COMM_HOOD_KEEP_PX`, `Cockpit.phoneCommHead`).
Landscape is unchanged.

**Seen on the way, and fixed after the review (F1).** After a turn the
visible area's new height was published 150 ms late (`VV_SETTLE_MS`)
while the page's width followed at once, so the first layout was at the
new width and the old height; the phone layer then changed the keys'
size for the shape and asked for one more layout. MUME was told window
sizes that never were. This is older than the round (stage 52, the same
on `main`); the first note here blamed a pause of the page, which was
wrong. Now a viewport event with a new width is published at once
(`later()` in `phone-viewport.ts`; the trailing measurement stays): a
turn is one window size, both ways, with the strip and Comm open and
with our keyboard up (e2e). A width change is never taken for a
keyboard: the baseline starts over at a new width, as before.

**Not verified on a device:** everything of this round. In emulation
only: the split screen, the low window, the player's Comm search with
the device's keyboard.
