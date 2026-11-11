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
