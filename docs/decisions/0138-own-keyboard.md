# 0138 — An on-screen keyboard of our own on the phone

- Status: Accepted (decisions by the owner, 2026-11-11; built in stage
  53). The technique in §2 is confirmed or replaced after the device
  test of round 53a; the stage has two go / no-go points (§9).
- Date: 2026-11-11
- Related: amends ADR 0136 §9 (command row and keyboard) and ADR 0137
  §3 (vibration) and §5 (keyboard). Investigation with sources:
  `notes/research/own-keyboard.md`. Plan and rounds:
  `docs/stages/53-own-keyboard.md`.

## Context

The device's on-screen keyboard is the weakest part of the phone's game
layout. The page is re-measured and rearranged while the keyboard
animates; each device brings its own keyboard, with a bar of smileys and
clipboard keys; it does not fit the look; in landscape it leaves about
one row of game text; and after two rounds of fixes it still fails on
the owner's phone (0.6.0: every hot key raises it again in landscape;
the fullscreen fix collapsed the layout in portrait and was taken out
in 0.6.1). MUME is also told a new window height every time it comes
up or goes down.

The owner wants a keyboard that is part of the client and made for the
game.

## Decision

### 1. Scope

- The **phone's game layout** only. Every text field inside it uses our
  keyboard: the command field (also at the name and password prompts),
  Comm's reply and search, the hot key box, script pane fields.
- The start page and the pages and frames opened from the menu (Profile,
  Scripts, editors) keep the device's keyboard, and
  `src/layout/phone-viewport.ts` stays for them.
- Desktop and tablet do not change. A tablet is its own later stage; the
  keyboard is built so it can be reused there (sizes from the width,
  with an upper limit per key).
- **No setting to use the device's keyboard instead.** Ours is the only
  one in the game layout, or the stage is dropped (§9). Known and
  accepted losses: prediction and autocorrect, swipe typing, dictation,
  layouts other than the two in §4, non-Latin input, and password
  managers at the password prompt.

### 2. Keeping the device's keyboard down

- The fields stay real fields and get `inputmode="none"`, plus
  `virtualkeyboardpolicy="manual"` (Chromium, Samsung Internet 17+; a
  second guard). The native caret, selection, paste and a physical
  keyboard keep working.
- If a target browser still raises its keyboard, that browser gets the
  fallback: no editable element (text kept by us, caret drawn by us, a
  Paste key through `navigator.clipboard.readText()`). Decided per
  browser from device tests, the S21 first.

### 3. Keys never pretend to be a physical keyboard

- A key calls a small public editing API on the field's owner (insert,
  delete back, move the caret, submit, history up and down). **No
  synthetic `KeyboardEvent` is dispatched**: macros match on `e.code`,
  every keydown teaches key labels, and `enterDown` follows any Enter
  keydown.
- `InputPane` gets that API (its private `edit` / `afterEdit` stay the
  one path, so history browsing, the password mask and the suggestion
  behave as when typed). The other fields get the same small interface
  (an adapter over the element and its own Enter / Esc actions).
- The phone chunk reaches it through `PhoneLayerDeps` / `PhoneKit`
  (chunk rule, ADR 0136 addendum).
- A key acts on `pointerdown`, each `pointerId` on its own (two thumbs),
  never moves the focus, and repeats by timer where it should
  (backspace, the caret). Nothing runs per frame.

### 4. The keyboard

- **Layouts:** Swedish (q–å, a–ä, z–m) and English (QWERTY), chosen in
  the phone's settings; the default follows the browser's language
  (Swedish for `sv`, else English).
- **Rows:** three letter rows (shift left and backspace right on the
  third) and a bottom row: fold down, symbols, digit row toggle, `;`,
  space, `.`, Enter. A **digit row** `1`–`0` folds up above the letters
  with the toggle and is remembered; it also carries history **↑** and
  **↓**. (If the keys become too narrow at 360 px the arrows move to
  the bottom row; settled from screenshots.)
- **Symbols** are a second page of the same rows. Which characters stand
  where is a first proposal, to be tuned by the owner in use.
- **Shift:** one tap gives one capital; a double tap locks until the
  next tap.
- The keyboard is one block over the full width in portrait and in
  landscape: never split in the middle.
- The look is the phone layer's (Lykta, with Paper); the keys are solid,
  not see-through.

### 5. Opening, closing, and the layout

- A tap on a field opens the keyboard for that field and gives the field
  the focus. The fold key closes it and blurs the field. It stays up
  after Enter.
- The keyboard takes **fixed rows at the bottom** from the allocator
  (`allocatePhoneGame`): the page's size never changes, nothing is
  measured, and there is no animation that relayouts. MUME gets one
  window size when it opens and one when it closes.
- While it is up the compass and the K keys are hidden (as with the
  device's keyboard today); the lens stays.
- It has its own state (not `html.wc-kbd`, which keeps meaning the
  device's keyboard on the pages that still use it). The game layout's
  uses of `keyboardUp()` move to the new state; when the stage is
  released the device keyboard path is no longer reached from the game
  layout.

### 6. Password prompt

Our keyboard is used there too. The field keeps its mask. Whether the
phone's swap to a real `type="password"` input is still needed is
decided in the build (it was made for the device keyboard's behaviour).

### 7. Vibration returns as a setting

`phone.vibrate` (default off) is back: a short vibration on a key of
the keyboard, the compass and the hot keys, where `navigator.vibrate`
exists (not on iOS; the row is not shown there). It did not work on the
owner's S21 in stage 51; it is kept as a choice for phones where it
does. Replaces "vibration is removed" in ADR 0137 §3.

### 8. Performance

Key to echo is measured against the device's keyboard path (intent
Goal 1) and must not be slower. Opening and closing cost one relayout.

### 9. Go / no-go

- After **53a** (a rough keyboard on the S21 behind `?kbd=1`): does the
  device's keyboard stay down in every case, is the caret usable, do
  the keys feel fast enough? If not with either technique of §2, the
  stage stops.
- Before the **release**: the owner's verdict on the whole on the S21,
  and one test on an iPhone. Until then the old path stays in the code.

## Settings keys (additive, under `phone`)

`keyboard.layout` (`sv` | `en`), `keyboard.digits` (the digit row
shown), `vibrate`. No settings version bump.

## To verify on a device (53a)

- The device's keyboard stays down on focus, after rotation, after an
  app switch, in and out of fullscreen, with Samsung Keyboard.
- The caret shows and a tap in the field moves it; a long press offers
  paste.
- The bottom edge: the gesture bar and the safe area on Android; later
  Safari's toolbar on an iPhone (no fullscreen there).

## Addendum: as built in rounds 53b and 53c (2026-11-11)

Where this differs from the decision above, this is what the code does.
Still behind `?kbd=` (`1`: the layout of the browser's language; `sv`,
`en`: that layout), and for the command field only; the other fields,
the layout's setting and vibration are round 53d.

**§4 Layouts, rows and keys** (`src/phone/keyboard-model.ts`, pure)

- A key's element is its whole cell, so the touch targets have no gaps;
  the cap drawn in it stands 2 px in. A letter key is the block's width
  shared by the row's keys (eleven in Swedish, ten in English), at most
  48 px in portrait and 46 px in landscape. A row is 46 px high in
  portrait (less on a low screen, down to 38) and 36 px in landscape (32
  at 800 × 280), from the screen's height.
- **History arrows:** on the digit row where its twelve keys are at
  least 30 px wide; else on the bottom row, where they stay whether the
  digit row is up or not. At 360 px they are on the bottom row (twelve
  keys would be 29.7 px); at 412 px and in landscape they are on the
  digit row, and so are gone while it is folded away.
- **Symbols:** one list in order of use,
  `' " , - ! ? : # @ $ % & * ( ) / _ \ { } [ ] + = < > ~ ^ |`; the third
  row takes the first seven, then the second row, then the first. `.`
  and `;` keep their bottom-row keys on every page. **With the digit row
  folded away the page's first row is the digits** (and the arrows where
  the digit row would carry them), so the page is usable on its own and
  the block never changes height with the page: no relayout and no
  window size for MUME when the page is changed. What then does not fit
  is on a second page, reached with the key in shift's place (`1/2`).
  With the digit row up Swedish holds every symbol on one page; English
  is two short (`^ |` on a second page).
- **Shift:** a second tap within 350 ms locks. A single shift is used up
  by the next character of any kind (a letter, a digit, a symbol, a
  space) and by Enter; not by backspace. A lock survives all of them.
  Shift, the lock and the symbols page end when the keyboard closes.
- **Backspace** removes a whole grapheme cluster (`Intl.Segmenter`, else
  a code point). Its repeat also stops when the page is hidden or the
  window loses the focus.
- The fold key, the digit row's toggle and the two page keys act on the
  click, not on the press: what is under the finger changes.
- The digit row's state is `phone.keyboard.digits` (default: folded).
  The key `phone.keyboard.layout` comes with its setting in 53d.

**§3 The target interface** `OkbTarget`: `insert`, `deleteBack`,
`submit`, `focus`, `blur`, and optional `historyUp` / `historyDown`
(absent: the arrows are dimmed). The command line implements it over
`InputPane` (`insertText`, `deleteBackward`, `submitLine`, `historyStep`;
no history at a password prompt). A key pressed while the field is
blurred gives it the focus back.

**§5 Opening and closing**

- Opens on a tap (at its click), and on a focus of the field that comes
  while a pointer is on it or within 700 ms after (a long press). A
  focus without a pointer opens nothing.
- Closes, besides the fold key and the menu: when a text field that is
  not ours takes the focus (Comm's reply and search, the hot key box, a
  script pane's field; until 53d those have the device's keyboard), and
  **when a held hot key opens its box** (the box and the keyboard never
  stand together; the release of that finger is not taken for a tap on
  what moved under it). A tap on the command field closes the box and
  opens the keyboard again.

**§5 Layout: replaces "while it is up the compass and the K keys are
hidden" and, for landscape, "one block over the full width"** (the
owner, after the device test of 53a and during 53c)

- **Portrait:** the block over the full width. The compass and the hot
  key columns are **not hidden**: they stand exactly as with the keyboard
  down, lifted by the keyboard's height, so the compass starts at the
  command row and the field ends left of it. The lens's clearance and the
  limit for the strip, the fight card and Comm ("above the place of
  three K keys") are counted from the keyboard's top edge. On a screen
  too low (less than 48 px left above them) the columns give way first,
  then the compass; the field then takes the full width.
- **Landscape:** the block is compressed towards the middle, with K1 to
  K3 in a column left of it, K4 to K6 in a column right of it and the
  compass at the far right, all in the keyboard's band and in the middle
  of its height. The block and its columns stand as one group in the
  middle of what the compass leaves; an empty column takes no width; the
  K key hides the columns as ever. The field takes the row's full
  width; the lens keeps its place. A letter key is as wide as fits, at
  most 46 px. When everything together would leave it under 36 px, the
  parts give way in this order: **both hot key columns, then the
  compass; only then do the keys get narrower.** (At 568 × 320 with
  Swedish: no columns, the compass stays.)
- The band is always the full width and lies **under** the landscape left
  column of ADR 0137 §1: the column ends above it, so the block stays in
  the middle whatever is open.
- The reserve follows the keyboard's real height: the digit row folded up
  or down is one relayout and one window size. What the screen has under
  its last whole row counts towards the keyboard's height, and the
  keyboard gives up to 6 % of its height (its rows share what it gets)
  before it takes one more row from the game text.
- `gameKeep` is the layout's usual eight rows; the too-small guard stays
  on (the page's size does not change). A reserve the screen cannot give
  (rows under 24 px) closes the keyboard.

## Addendum: as built in round 53d (2026-11-12)

Still behind `?kbd=`, except the vibration of the compass and the hot
keys, which is its own feature.

**§1, §3 The other fields** (`src/phone/keyboard-fields.ts`, the layer)

- Every plain text field in a pane or in the hot key box is ours: Comm's
  reply line and search field, the box's Label and Command, a script
  pane's fields. Found by a delegated handler in the phone layer (the
  panes import nothing of the phone); marked `inputmode="none"` +
  `virtualkeyboardpolicy="manual"` at mount, when the box opens, when a
  script pane comes, and at a press in their pane.
- Each is an `OkbTarget` through one adapter over the element: it
  changes the value at the selection and dispatches the `input` event a
  typed key ends with (so the label's cleaning, the search and a
  script's change report run as when typed); `maxLength` holds; no key
  event is made up. No history: the arrows are dimmed.
- **Enter per field:** Comm's reply sends (`CommPane.submitReply`, the
  Enter key's own path) and keeps the focus and the keyboard; Comm's
  search has no Enter action (nor has the Enter key there); the box
  saves (`HotkeysView.saveBox`); a script pane's field is submitted to
  its script (`ScriptPane.submitField`) and the keys go back to the
  command line, as the focus does on a computer.
- **Target:** a tap on a field opens the keyboard for it, or moves an
  open keyboard to it (no relayout, no window size). While open, the
  target follows the focus among our fields. A field that leaves the
  screen (the search closed, the box closed, Comm closed) hands the keys
  back to the command line. A pointer anywhere in the cockpit followed
  by a focus of one of these fields opens it too (Comm's search key).
- **Fields in the game layout that still use the device's keyboard:
  none.** The rule "a text field that is not ours closes ours" stays for
  anything else that may take the focus; the menu's sheet, pages and
  frames close ours when they open, as before.

**§5 Layout while those fields are typed in**

- **Comm** (review finding B): while its reply or search holds the
  target, Comm never goes under its least rows (6) as long as something
  else can give way. After the usual order (Comm to its minimum, the
  strip to its own, the strip closed): the hot key columns give way
  (Comm may reach under their place; they are hidden), then the game
  text goes down to 3 rows, then the fight card. Only then does Comm
  close, and the keys go back to the command line. Landscape needs no
  rule: the column has every row above the band.
- **The hot key box:** a hold on a K key still folds the keyboard and
  opens the box. A tap in one of its fields opens the keyboard for that
  field with the box staying: in portrait beside the lifted column as
  ever (whole above the keyboard); in landscape on the band at the right
  edge, over the command row's end, without its notch. Save, Cancel and
  a press outside close the box **and the keyboard** (back to how the
  screen was before the box); when that press is on the command field or
  another field of ours, the keyboard stays and types there.
- **One layout per change** (finding A): the cockpit asks the layer for
  the limit at each layout with the keyboard's lift
  (`setPhoneLimit(fn)`), so whether the columns stand above the keyboard
  is decided before the reserve is laid out. The reserve's rounding is
  `ownKeyboardReserve` (pure, unit-tested).

**§6 Password prompt:** with our keyboard the phone masks as the desktop
does (the same textarea, transparent text, bullets over it, our own
caret); the swap to `<input type="password">` stays for the device's
keyboard only (gate off). Why: the swap was made so the device's
keyboard would treat the text as a password, which no longer applies; a
password field brings the browser's password manager ("save
password?") and the device's secure input with it. Kept from the swap:
the line is emptied when the prompt comes and when it goes. New: a
range selected in the masked line is collapsed at once, so a phone's
selection toolbar (share, translate, search) is never offered the
password; the caret and paste stay. The arrows are dimmed (finding D).

**§7 Vibration:** `phone.vibrate` (off; the key of 0.5.0 is read again).
One row, "Vibrate on key press", in Quick buttons (it governs the
compass, the hot keys and the keyboard; Quick buttons is there without
the gate), absent without `navigator.vibrate`. One pulse of **30 ms** on
the pointer's press of a key (a held backspace pulses once). Why 30:
0.5.0 asked for 10 ms from the press's own handler in the top frame,
which is a valid call; phones such as the S21 are known not to render a
pulse shorter than their motor's start-up (20 to 30 ms), and Android
gives none while touch vibration is off or the phone is silent or in Do
not disturb. Not verified on a device.

**Settings:** `phone.keyboard.layout` is `auto` | `sv` | `en` (`auto`:
the browser's language; the row "Layout: Swedish / English" in a
Keyboard group shows the one in use and stores the one chosen).
`?kbd=sv|en` still wins, for tests.

**Review findings C to F:** in a band lower than three large keys (a
landscape screen 300 to about 312 px high) the compass and hot keys are
36 px (`--ph-ck` on the layer only: no relayout). The block has no dead
zone: the room beside English `a` and `l` belongs to those keys, and a
press on the rim or an empty place goes to the nearest key of that row.
With a column on each side the block stands where it does without them
(the K key no longer moves it 4 px). The keyboard's ground continues
under the safe-area padding to the screen's edge (`#app::after`); the
keys were inside the safe area already, since `#app` is padded by it.

## Addendum: as built in round 53e (2026-11-12)

**§9 The gate flips.** Our keyboard is the keyboard of the phone's game
layout by default. What the address can still say (`okbFromQuery`):

- `?kbd=0`: the device's keyboard, the path of before stage 53. Kept
  until the owner's verdict on the S21 and one test on an iPhone; then
  it is deleted (not in this round).
- `?kbd=1` or `?kbd=debug`: ours, with the readout (keyboard-readout.ts).
  Without one of them there is no readout.
- `?kbd=sv`, `?kbd=en`: ours with that layout whatever the setting says.
  Kept because the tests name the layout that way (they do not depend on
  the browser's language); a player uses the setting.

The Keyboard settings group shows whenever our keyboard is there (not
with `?kbd=0`). Desktop and tablet are untouched: the keyboard lives in
the phone layer, which is mounted only for the game layout (the phone
flag and a short side under 600 px, as before). The start page, the
menu's pages and frames, the run log player and Spotlights keep the
device's keyboard and `phone-viewport.ts`.

**What remains of the old path, and why.** All of it, because `?kbd=0`
still needs it: the layer's `watchKeyboard` (the blur when the device's
keyboard folds), the `wc-kbd` rules of the game layout in phone.css
(compass and hot keys hidden, the field full width), the cockpit's
`keyboardUp()` branches (the guard off, two game rows kept, Comm's
least rows in the landscape column), the box's place over the command
row, and the input pane's swap to a `type="password"` field. The specs
that shrink the visible area and wait for `wc-kbd` say `?kbd=0`; the
two screenshot states of stage 51 that show the device's keyboard too.

**§2 A browser that raises its keyboard all the same: no guess in the
app.** Round 53e first had a stopgap for a browser that ignores
`inputmode="none"` (none is known; the iPhone is not tested yet): a
shrink of the visible area (`wc-kbd`) within 2.5 s of a tap on one of
our fields was taken for the device's keyboard, and ours closed and
stayed shut while `wc-kbd` was set. It was removed in the same round.
The app cannot tell a keyboard from any other shrink, and the guess
misfired on browsers that do honour the attribute: a split screen, a
window made lower, or fullscreen left in landscape just after a field
tap locked our keyboard out for as long as the window stayed lower, so
the phone had no keyboard at all; the password would also have gone
into a plain text field. §2 stands as written: what such a browser
gets is decided per browser from a device test, not from timing. A
shrink of the visible area never closes or locks our keyboard; only
the allocator's room does (it closes on a screen with no rows for it,
blurs the field, and opens again only at a tap). A field with
`inputmode="none"` keeps the focus when `wc-kbd` drops.

**Review findings of 53d.**

- A selection in the masked password line has no text colour
  (`.wc-input-field.wc-masked::selection`), on the desktop too, where a
  selected password could be read before; its ground is a tint the
  bullets stay readable on. In forced colours (a high contrast
  mode) the masked line keeps its own colours (`forced-color-adjust:
  none`): the mode would otherwise paint the text, selected or not.
- Enter as Save in the hot key box: the box and the keyboard close at
  the press, so the click that follows that finger's release is dropped
  (`swallowClick`, only when a pointer is down on a key).
- A target that goes away is dropped at once, not at the next key: one
  `MutationObserver` while a field other than the command line is typed
  in (its place in its parent, and its ancestors' own attributes up to
  the cockpit); the keys also ask whenever they are drawn or pressed
  (`okbTarget`). Comm closed with its key, or left with no rows on a
  short screen, is one window size. The caret goes to the command line
  with the keys. (A check after each layout and a hand-back at the Comm
  key were also built; the tests passed without either, so they were
  taken out.)

**§8 Performance** (`bench/phone-keyboard-bench.ts`,
`bench/results/phone-53-keyboard.md`; Chromium as a phone, CPU 4×).

- Key → echo: the app's own work for a key is the same as on the device
  keyboard's path to about a millisecond (script 1.0–1.2 ms against
  0.7–1.0 ms, the frame 2.2–2.4 ms against 1.1–2.2 ms; no cockpit layout,
  only the key's class and the field change). End to end the emulation
  has a touch on our key painted 11 ms (idle) to 19 ms (while text
  arrives) after text committed by `Input.insertText`. The same key
  pressed with a mouse pointer is level with the device path and the
  handler is synchronous, which places the gap in how Chromium brings a
  touch to the page and frames it (3 to 5 ms of it under the burst are
  unexplained); the device keyboard's own handling of
  its touch is not in that number and cannot be measured here. So "not
  slower" holds for what the app does and is not shown end to end: a
  matter for a device.
- Incoming text is as fast with the keyboard open as closed and as on
  `main` (burst 956 / 959 / 963 ms, within the rounds' spread; a frame of
  text 0.2–0.4 ms later at the median while the command field has the
  focus, p95 unchanged).
