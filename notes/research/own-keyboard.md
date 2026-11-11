# An on-screen keyboard of our own: investigation (stage 53)

Written 2026-11-11 from two subagent reports (web research with
sources; a read of the code). Nothing was tried on a device. Not
authoritative: the decisions go in an ADR once the owner has chosen.

## 1. Keeping the device's keyboard down

| Technique | Android Chrome | Samsung Internet | iOS Safari | iPadOS |
|---|---|---|---|---|
| `inputmode="none"` on a real field | yes | yes (standard attribute; Samsung Keyboard quirks unconfirmed) | iOS 13+ | as iOS; hardware keyboard path had bugs, fixed 2019; shortcut bar unconfirmed |
| `virtualkeyboardpolicy="manual"` | Chromium 94+ | 17.0+ | no (WebKit bug 230225 still NEW) | no |
| `readonly` | no keyboard, but caret and hardware input reported lost | same (inferred) | no keyboard; stray autofill/share popup | same |
| No field at all (text in JS, caret drawn) | cannot raise a keyboard; paste needs `clipboard.readText()` with a permission prompt | `readText()` 9.2+, reliability unconfirmed | hardware keydown reaches body; "Paste" bubble on every read | as iOS |

- `inputmode="none"` is the standard mechanism ("for when the page
  implements its own keyboard input control", MDN) and the only one on
  all four targets. The field stays a real editable: caret, selection,
  native paste, hardware keyboard and screen readers should keep
  working (inferred, to be tried on a device).
- iOS does not re-read `inputmode` while the field has focus: a switch
  between our keyboard and the device's needs a blur and refocus.
- Unconfirmed, to try on the S21 and an iPhone/iPad: caret shown and
  moved by a tap; the long-press paste callout; the keyboard staying
  down after rotation, app switch and fullscreen; Samsung Keyboard; the
  iPad shortcut bar with a hardware keyboard.
- Fallback if a target still raises its keyboard: no field at all.

## 2. Touch keys

- `touch-action: manipulation` (iOS 13+ in full) gives fast taps and no
  double-tap zoom. Keys act on `pointerdown`, one press per `pointerId`
  (two thumbs), repeat by timer, `user-select: none` and
  `-webkit-touch-callout: none` (as the compass does today).
- `navigator.vibrate`: Android Chrome and Samsung Internet yes, iOS no.
  The iOS switch-checkbox haptic trick is reported patched in iOS 26.5.
- Key click sound: Web Audio is muted by the iPhone's silent switch
  unless the audio session is set to playback (iOS 17+).

## 3. Screen edges

- Chrome Android 135+: with `viewport-fit=cover` (we set it) the page
  reaches under the gesture bar; `env(safe-area-inset-bottom)` gives the
  inset. Side-edge back swipe cannot be turned off by a page.
- iPhone: no Fullscreen API, so Safari's bars stay. iOS 26's floating
  bottom toolbar has many reports of fixed bottom elements overlapped or
  gapped (Safari 26.1 fixed one such gap). The largest unknown for a
  keyboard at the bottom edge on an iPhone.
- iPad: element fullscreen exists. `visualViewport` is not a reliable
  keyboard detector there (shrinks with a hardware keyboard attached,
  bug 247410; floating and split keyboards do not shrink it).

## 4. Lost without the device's keyboard

Autocorrect and prediction, swipe typing, dictation, long-press accents
(can be rebuilt), non-Latin IMEs, the user's own layout and key feel,
haptics on iOS, password manager autofill (the phone's password prompt
is a real `type=password` input today). Recoverable only by a setting
that gives the device's keyboard back.

## 5. What the code says

- Command field on a phone: a one-row `<textarea>` (`makeField`,
  `src/ui/input-pane.ts`), swapped for `<input type="password">` at the
  password prompt (`swapField`). No `inputmode` anywhere today.
- `InputPane` has no public insert / delete / caret API (`edit`,
  `afterEdit` are private). History, the password mask and the
  suggestion depend on them. Needed: a small public editing API.
- **No synthetic KeyboardEvents.** Macros match on `e.code` and every
  keydown teaches key labels (`src/script/keys.ts`); `enterDown` is set
  by any document keydown Enter. Our keys call the API directly.
- `InputPane.focus()` returns at once after a touch
  (`touchInteraction()`); with `inputmode="none"` the field must be
  focused on purpose.
- `wc-kbd` / `keyboardUp()` sites that assume the viewport shrinks:
  `ui.css` (#app sized by `--wc-vv-h`), `phone.css` (compass, hot keys
  hidden; field full width), `cockpit.ts` (guard off, `gameKeep` 2,
  `maxTop` dropped), `src/phone/index.ts` (`watchKeyboard` blur, box
  place, key size, lens row). Our keyboard needs its own state, not
  `wc-kbd`.
- `allocatePhoneGame` has no bottom reserve; the compass and K keys are
  placed from the bottom edge over the command row's right end.
- NAWS: MUME gets fewer rows each time the device's keyboard comes up
  (the game pane's real rows). Fixed keyboard rows make that one known
  change, with no animation steps.
- Other fields in the game layout, each with its own Enter/Esc handling
  and `data-wc-own-keys`: Comm reply and search (`src/panes/comm.ts`),
  the hot key box (`src/phone/hotkeys.ts`), script pane fields
  (`src/panes/script-pane.ts`). Start pages: `TextField`, the look
  kit's `Field` / `TextArea`, CodeMirror.
- The phone chunk gets nothing for the command line through `PhoneKit`
  today (`command(text)` in `PhoneLayerDeps` bypasses history). A new
  command-line API goes through the deps or the kit (chunk rule).
- A tablet is touch but not phone (`decideDevice`, short side 600 px):
  desktop cockpit, `<input type="text">`, no viewport tracking.
- Tests on the keyboard path: `phone-viewport*.test.ts`,
  `layout-phone-game.test.ts`, about ten `phone-*.spec.ts` cases that
  shrink the viewport and wait for `wc-kbd`, `scripts/phone-shots.ts`
  states `keyboard` and `comm-keyboard`.

## Sources (the main ones)

- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inputmode
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/virtualkeyboardpolicy
- https://developer.chrome.com/docs/web-platform/virtual-keyboard
- https://caniuse.com/mdn-api_virtualkeyboard
- https://bugs.webkit.org/show_bug.cgi?id=230225 (VirtualKeyboard API in WebKit)
- https://bugs.webkit.org/show_bug.cgi?id=195856, 203061, 200216 (`inputmode=none` on iOS)
- https://caniuse.com/mdn-api_clipboard_readtext
- https://developer.apple.com/forums/thread/736994 (Safari's Paste bubble)
- https://webkit.org/blog/5610/more-responsive-tapping-on-iOS/
- https://caniuse.com/vibration
- https://developer.chrome.com/docs/css-ui/edge-to-edge
- https://bugs.webkit.org/show_bug.cgi?id=247410 (iPad visualViewport with a hardware keyboard)
- https://developer.apple.com/forums/thread/800125 (iOS 26 visualViewport)
