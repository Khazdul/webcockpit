# Stage 53 — An on-screen keyboard of our own (investigation first)

Status: **In progress** (investigated and decided with the owner
2026-11-11: ADR 0138; branch `stage-53-own-keyboard`).

## Goal

The owner wants to look at replacing the device's on-screen keyboard
with a keyboard that is part of the client, on the phone and later on a
tablet. The session starts as an **investigation with the owner**: is it
possible, at what cost, and what are the questions; no building before
he has decided.

## The owner's thoughts (2026-11-11, translated)

What chafes most now is when the keyboard has to come up to type:

- It is not smooth: things are redrawn and jump when the keyboard folds
  out.
- Different devices give different keyboards.
- His keyboard has a bar at the top with smileys, clipboard and so on.
- The keyboard does not fit the theme.
- There is probably a risk that the keyboard ends up in the wrong place
  on some devices.

His idea: build our own keyboard that does not use the device's. Like
the hot keys today, a "keyboard" of keys in the client folds up; the
device's own keyboard is overridden completely. It could then be made
for our purpose:

- No top bar with smileys.
- The digit row 1–0 folds up and down with a toggle key.
- The layout is chosen in settings (Swedish and English to start with).
- It can look like a real keyboard, with an Enter key.
- It can be spare: only the characters, digits and letters that are
  really needed.

The same keyboard could be used on an **iPad**, where the device's
keyboard lands very oddly today and the layout with the keyboard up has
been hard to control. He believes the phone layout as now built would
work better on a tablet too (touch keys are needed there as well),
perhaps with some adaptation.

## To investigate (first list; the session adds to it)

- How to keep the device's keyboard down while a field has focus:
  `inputmode="none"`, `readonly`, a field of our own that is not an
  input at all (caret and selection drawn by us), `virtualKeyboard`
  API; what each does on Android Chrome, Samsung Internet, iOS and
  iPadOS Safari.
- What is lost without the device's keyboard and whether it matters:
  autocorrect and prediction, swipe typing, dictation, paste and the
  clipboard, long-press accents, key repeat, haptics, accessibility
  (screen readers, switch access), password managers at the login
  prompt, a physical keyboard attached to a tablet.
- Where it is used: the command field only, or also Comm's reply, the
  hot key box, the profile and script editors, the start pages (those
  could keep the device's keyboard).
- Layout and size: rows and key sizes at 360 px width, the digit row
  toggle, symbols MUME play needs (`;`, `#`, `'`, `.`, `,`, `-`, digits),
  Swedish å ä ö, shift and caps, backspace repeat, cursor movement,
  command history.
- How it meets the layout of stages 51 and 52: it takes fixed rows, so
  nothing has to be measured or re-measured (the whole
  `phone-viewport.ts` keyboard path would not run); what happens to the
  compass, the K keys and the lens while it is up.
- Performance: key to echo latency against the device's keyboard
  (intent Goal 1).
- A setting to use the device's keyboard instead, and which is the
  default.
- The tablet: what the phone layout needs to work on an iPad, and
  whether that is this stage or its own.
- Cost: an estimate in rounds, and what could be cut.

## Known from stage 52 that bears on this

- ADR 0137 §5: fields are blurred when the device's keyboard goes down;
  in fullscreen the keyboard's rectangle is taken from the
  VirtualKeyboard API. Unverified on the device when stage 52 closed.
- `src/layout/phone-viewport.ts` and `?vv=1` (the readout of the
  measured numbers).
- The hot keys and compass (`src/phone/hotkeys.ts`, `compass.ts`) are
  the model for keys that send without taking focus.

## Investigation and decisions (2026-11-11)

- Findings with sources: `notes/research/own-keyboard.md`.
- The owner's answers are ADR 0138. In short: our keyboard for every
  field in the phone's game layout (also name and password), start
  pages and editors keep the device's; Swedish and English; digit row
  with history arrows; shift once / double tap locks; compass and K
  keys hidden while it is up; opened by a tap on the field, closed by
  its fold key, stays after Enter; full width and never split, in
  landscape too; **no setting for the device's keyboard** (ours for
  everyone, or the stage is dropped); vibration back as a setting;
  tablet is its own stage; device tests on the S21 first (the owner
  also has an iPhone and an iPad).
- The owner's first use of 0.6.0 (stage 52 file, Owner feedback) found
  the fullscreen fix broken in portrait: taken out in 0.6.1.

## Plan

Rules of stages 51 and 52 hold (desktop and tablet unchanged; chunk
rule; keys send only in play; nothing per frame or per line; never the
real MUME from tests). Each round: one building subagent, checks and
screenshots by the main session, a fresh reviewer, fixes, commit. The
owner tests on the phone with `npm run dev:tailnet` on the branch.

### 53a Device test (go / no-go)

Behind `?kbd=1`, command field only, portrait and landscape:

- the field gets `inputmode="none"` and `virtualkeyboardpolicy="manual"`
  and the focus on a tap;
- a minimal public editing API on `InputPane` (insert, delete back,
  submit), reached through the phone layer's deps;
- a rough keyboard (English letters, shift, space, backspace, Enter,
  fold) in fixed rows from the allocator, with its own state class;
  compass and K keys hidden while it is up;
- a readout line in `?kbd=1` (focus, `activeElement`, `wc-kbd`) for the
  owner's screenshots.

Not in 53a: the look, layouts, digits and symbols, other fields.

### 53b Model and editing API

- The keyboard as a pure model: layouts `sv` / `en`, pages (letters,
  symbols), shift states, the digit row, key sizes from the width (with
  a cap per key), all unit-tested.
- The full editing API (caret left / right, history, password mode) on
  `InputPane`, and the adapter interface for other fields.

### 53c The keyboard in the game layout

- The view in the phone's look (dark and Paper), portrait and landscape,
  one block; key repeat; two-thumb presses.
- Allocator reserve, one NAWS on open and on close; lens, strip, Comm
  and the fight card with the keyboard up; `gameKeep` and limits.
- The game layout's `keyboardUp()` / `wc-kbd` uses moved to the new
  state; the `?kbd=1` gate stays until the release decision.

### 53d Other fields, settings, vibration

- Comm reply and search, the hot key box, script pane fields; the
  password prompt (and whether the `type="password"` swap stays).
- Settings: Keyboard (layout), vibration on keys (`phone.vibrate`, also
  compass and hot keys; no row without `navigator.vibrate`).

### 53e Finish

- Key to echo measured against the device keyboard path.
- e2e and screenshots (`scripts/phone-shots.ts` states), contrast, small
  screens (320 px wide, 800 × 280).
- The gate removed: ours is the only keyboard in the game layout; what
  is then dead in the game layout's device keyboard path is removed
  (`watchKeyboard`'s blur and the like). Spec §2.12, README, About.
- Test guide; the owner's verdict on the S21 and one test on an iPhone.

### 53f–53i The menu pages too (ADR 0139; added 2026-11-12)

The owner after 53e: our keyboard everywhere on the phone, and before
the release.

- **53f** the page mount and bottom reserve; the one-line fields
  (profile and script names, export title, Lite pattern, manual find,
  script settings, the editors' search fields); Enter and Esc on a
  page.
- **53g** multi-line fields (Lite body, export comment); newline, Tab,
  Esc and caret keys, the backtick.
- **53h** the two CodeMirror editors (go / no-go by the owner).
- **53i** the device keyboard code on the phone removed, `?kbd=0`
  gone; docs; release decision.

### Can be cut

Long-press alternatives (not planned), caret keys (a tap in the field
moves the caret), script pane fields, key sound.

## Tasks

- [x] Investigation with the owner; decisions recorded as ADR 0138
- [x] 53a built behind `?kbd=1`; the owner's test on the S21: go
- [x] 53b model and editing API
- [x] 53c the keyboard in the game layout
- [x] 53d other fields, settings, vibration
- [x] 53e built: the gate flipped (`?kbd=0` keeps the old path), the 53d
  review findings, key to echo and text speed measured, tests,
  screenshots, spec §2.12, README, About
- [x] 53f page mount, one-line fields (built; owner test open)
- [x] 53g multi-line fields and the new keys (built; owner test open)
- [x] 53h CodeMirror editors built
- [x] 53h the owner's go / no-go on the editors: go
- [x] 53i device keyboard code removed (built)
- [ ] 53i review; the owner's release decision
- [ ] 53e test guide, the owner's verdict on the S21, one test on an
  iPhone, release decision (then the old path is removed)

## Built

- **53a** (31392f2d…cd5326a8, by a subagent; reviewed by a fresh one):
  `src/phone/keyboard.ts` (rough English keyboard, one block, keys on
  `pointerdown`, backspace repeat), `keyboard-readout.ts`; `InputPane`
  `insertText` / `deleteBackward` / `submitLine` / `setOwnKeyboard`
  (through `edit` / `afterEdit`); `bottom` reserve in
  `allocatePhoneGame`, `Cockpit.setPhoneBottom`; state class `wc-okb`;
  gate in `shell.ts`. Unit 3866, phone e2e 274, typecheck clean.
  Screenshots `docs/stages/img/53-a-*`.
- Game text rows with the keyboard open (new phone defaults): 39 of 53
  at 360 × 800, 10 of 21 at 800 × 360, 6 at 800 × 280.
- As built, beyond the ADR: the fold key acts on the click (the row
  under the finger moves); the keyboard opens on a tap on the field,
  not on focus from a physical key; opening the menu closes it; a
  rotation sends the window sizes it sends without the keyboard.

- **Review of 53a** (fresh subagent): nothing changes without `?kbd=1`
  (allocator compared with `main` on 200 000 random inputs); no
  must-fix. For the next round:
  - the backspace repeat is not stopped on `visibilitychange`;
  - with our keyboard open, a tap on Comm's reply or search raises the
    device's keyboard too (those fields are not ours until 53d), the
    reserve is clamped and the block can stand at a stale place: close
    ours when the focus enters a field that is not ours, until 53d;
  - keys type into a blurred field (after a tap on the game text)
    without refocusing it;
  - backspace removes one code point, not a grapheme cluster;
  - shift survives space, backspace and Enter;
  - a long press on the field focuses it without opening our keyboard;
  - test gaps: the lens check is conditional, no test for the repeat
    stopping on cancel or close, none for the password swap with the
    keyboard open.

- **53b + 53c** (63074c79…b1478621, one subagent; a fresh review
  follows): `keyboard-model.ts` (pure: layouts `sv` / `en`, symbols,
  digit row, shift, sizes, the landscape band, degrade rules), the view
  in the phone's look (dark and Paper), `deleteBackward` by grapheme
  cluster, history through the target interface (`OkbTarget`),
  `phone.keyboard.digits`, the gate takes `?kbd=1|sv|en`, the 53a
  review findings. Unit 3904, phone e2e 301, typecheck clean.
  Decisions made in the build: ADR 0138 addendum. Screenshots
  `docs/stages/img/53-c-*`.
- **Owner's additions during 53c:** in portrait the compass and the K
  keys stay with the keyboard up, lifted by its height (nothing is
  hidden); in landscape K1–K3 stand left of the block, K4–K6 right, the
  compass at the far right.
- Game rows kept (Swedish, new phone defaults): 360 × 800 40 of 53
  (digit row up 37); 800 × 360 11 of 21 (9); 800 × 280 7 of 16.

- **Review of 53b + 53c** (fresh subagent; diff read, unit and the
  keyboard spec run, edge sizes probed): nothing changes without
  `?kbd`; the 53a findings are fixed; no must-fix. For 53d:
  - A. a low portrait window (about 320 × 480, six K keys, Comm open)
    gets two window sizes on a digit toggle: `arrangeOwnKeyboard` calls
    `setPhoneLimit(null)` inside the layout callback; decide the
    columns before the reserve is laid out;
  - B. on short portrait screens (360 × 520 and lower) the lifted limit
    squeezes Comm to 0 rows;
  - C. landscape at 300–312 px of height: the 44 px compass overhangs
    the band by 1–3 px; use 36 px keys when the lift is lower than the
    compass;
  - D. ↑ ↓ are not dimmed at the password prompt (silent no-ops);
  - E. English: about 18 px left of `a` and right of `l` take no tap;
    widen the two keys' hit areas;
  - F. the block moves 4 px sideways in landscape when K toggles the
    columns; one closure per hold left in `unsubs`; one extra layout
    after a rotation with dropped columns; no safe-area inset on the
    band (matters for the iPhone test);
  - tests: no case for A, no unit test for the reserve's rounding in
    the cockpit, the lens check is still conditional.

- **53d** (3fa45aa0…761ebb66, one subagent, resumed once after a usage
  limit; a fresh review follows): `keyboard-fields.ts` (an `OkbTarget`
  over any text field of the game layout: Comm's reply and search, the
  hot key box, script pane fields; no field is left on the device's
  keyboard), the target follows the focus with no relayout; the
  password masked the desktop way with the gate on (no
  `type="password"` element); `phone.keyboard.layout`
  (`auto` | `sv` | `en`) and `phone.vibrate` with their settings rows;
  `haptics.ts` (30 ms pulse on the press of a keyboard, compass or hot
  key); review findings A–F fixed. Unit 3938, phone e2e 319 of 320 (the
  known flaky swipe test), typecheck clean. Decisions: ADR 0138, "as
  built in round 53d". Screenshots `docs/stages/img/53-d-*`.

- **Review of 53d** (fresh subagent; allocator compared with the
  round before on 400 000 random inputs, slow-tap and selection
  probes): without `?kbd` only the vibration row differs; no must-fix.
  For 53e:
  - the masked password line: `.wc-input-field::selection` paints the
    selected text opaque, so secrecy rests on the async collapse of the
    selection (a one-frame flash is possible on a device; on desktop a
    selection in the masked line is readable, older than this stage):
    `.wc-masked::selection { color: transparent }`;
  - Enter as Save in the hot key box acts on the press and closes box
    and keyboard with no click swallow: with a real finger in
    landscape the click lands on the command field and reopens the
    keyboard (two window sizes); the test uses `tap()` and misses it;
  - a target that disappears (Comm or its search closed) is dropped
    only at the next key press: arrows stay dimmed, `commKeep` stays,
    possibly two window sizes on a short portrait screen;
  - notes: a stored `vibrate: true` from 0.5.0 is honoured again (only
    a file never rewritten by 0.6.x, or an old export); exports carry
    the two new keys; a slow press on a compass key with box and
    keyboard open closes both and sends the direction;
  - test gaps: the slow tap, the selection paint, a vanishing target.

- **53e** (branch `stage-53e`, merged): **our keyboard is the default**
  in the phone's game layout; `?kbd=0` keeps the device keyboard path
  until the release decision; the readout only with `?kbd=1` or
  `?kbd=debug`; `?kbd=sv|en` still names the layout. The three 53d
  review findings fixed (a masked selection is painted as a tint over
  the bullets, on desktop too; the click after Enter as Save is
  swallowed; a field that goes away hands the keys back at once, one
  `MutationObserver` only while such a field is typed in). (A timing
  fallback for a browser that ignores `inputmode="none"` was also
  built; removed after the review, below.) Unit 3938, phone e2e 339 of 339,
  Chromium 434 of 435 and Firefox 432 of 434 (the failures pass alone;
  `import.spec.ts:148` and `keymanager.spec.ts:319` are new to the
  flaky list), typecheck and build clean. Decisions: ADR 0138, "as
  built in round 53e". Screenshots `docs/stages/img/53-e-final-*`.
  - **Benches** (`bench/results/phone-53-keyboard.md`, headless
    Chromium, CPU 4×): the app's own work per key is level with the
    device path (about 1 ms script, 0 cockpit layouts per key). End to
    end the emulation puts our touch key 11 ms (idle) to 19 ms (during
    a burst) behind the device row, and the diagnostic rows place that
    in Chromium's touch handling, not in the app; the device row is a
    lower bound, since the device keyboard's own touch handling cannot
    be measured there. **ADR 0138 §8 ("not slower") is therefore not
    shown by measurement; it rests on the owner's verdict on the
    device** (53a: "typing keeps up"). Text speed with the keyboard
    open equals main (burst 956 / 959 / 963 ms, within the spread).
  - Bundle, the whole stage against main: phone chunk JS 63.5 → 88.5 kB
    (gzip 20.1 → 28.2), phone CSS 39.0 → 46.3 kB; eager JS +4 kB.
  - `intent.md` Goal 12 says "up to three commands ... without the
    keyboard": six since stage 52, and "the keyboard" now means the
    device's. For the owner to reword at the release.

- **Review of 53e** (fresh subagent, reproduced in emulation): the
  fallback misfired on a browser that honours `inputmode="none"` (a
  split screen, or leaving fullscreen in landscape, within 2.5 s of a
  tap left the phone with no keyboard). **The fallback is removed**
  (ADR 0138 §2 already covers a browser that raises its keyboard: per
  browser, from device tests). Also fixed: the masked line under
  forced colours (`forced-color-adjust: none`; in Chromium older than
  this stage); tests that did not test their fix; the bench wording.
  Phone e2e 342 of 342, unit 3938. Left: at a window too low for the
  keyboard (800 × 150) a tap opens it and the next layout closes it
  (two window sizes per tap; since 53d). Not checked: WebKit, devices.

- **53f** (branch `stage-53f`, merged; ADR 0139 "as built in round
  53f"): our keyboard on the phone's pages outside the game layout
  (`src/phone/keyboard-pages.ts`, the same view and model; the page
  gets a fixed bottom reserve, `--wc-okb-page-h` on `#app`; the cockpit
  is untouched and no window size is sent for it). One-line fields
  marked in `Field`, `TextField` and the script setting input (a
  numeric field brings the digit row). Enter is a marked `keydown`
  (`src/core/own-keyboard.ts`) that the script engine's key handling
  and `enterDown` ignore; it acts on the click, since it may close the
  dialog under the finger. Multi-line fields and the CodeMirror
  buffers still take the device's keyboard (53g, 53h); the two never
  stand together. Unit 3969, phone e2e 358 of 360
  (`phone-game-landscape.spec.ts:672` twice, passes alone), desktop
  868 of 871 (pass alone), typecheck and build clean. Open: no Esc key
  yet; a Paper keyboard under the always-dark start page; nothing
  tried on a device. Screenshots `docs/stages/img/53-f-*`.

- **Review of 53f** (fresh subagent, Playwright probes): no double
  keyboard, stuck reserve, ghost tap or command sent to MUME found;
  rules hold. Handed to 53g to fix: Lite's Pattern field is hidden
  under the page's foot in landscape with the keyboard up; after a
  rotation the field can lie under the keyboard, and back to portrait
  the keyboard closes; a field focused before the phone chunk arrives
  has no keyboard until a second tap; a fast double tap on Enter sends
  two; capture-phase Esc listeners (`hotkeys.ts`, `timers.ts`,
  `player/view.ts`) do not check the mark; the 150 px rule is dead.
  Not checked: devices, fullscreen, the browser's back.

- **53g** (branch `stage-53g`, merged; ADR 0139 "as built in round
  53g"): the Lite body (real lines) and the export comment (Enter
  saves) use our keyboard. New keys on pages: Esc, Tab (shift then Tab
  is Shift+Tab) and four caret keys, repeating; a row above the
  letters in portrait, a column on each side of the block in landscape
  (no added height). Enter is a newline key in a multi-line field. The
  backtick is on the symbols page. The game layout's keyboard is
  unchanged but for the backtick. The 53f review findings fixed. Two
  faults of 53f found and fixed: look pages over the game did not end
  at the keyboard (lower fields lay under the keys); the keyboard
  opened on focus under a finger still down, so the tap's click could
  land on another control (a tap on Lite's body pressed Delete): it now
  opens on the click. The owner's Pattern report was not reproduced
  (flows in `phone-own-keyboard-lite-game.spec.ts`); the two faults
  above may be what he saw. Unit 4007, phone e2e 390 of 392
  (`phone-game-landscape.spec.ts:672` twice), Chromium 435 of 436,
  Firefox 433 of 435 (`look-kit-box.spec.ts:182` fails about 1 in 6
  alone, new to the flaky list). Open: caret up / down moves by
  logical lines; Esc in an editor's Find row returns the focus to
  CodeMirror (device keyboard until 53h). Screenshots
  `docs/stages/img/53-g-*`.

- **Review of 53g** (fresh subagent; 115 desktop and tablet states
  compared with the round before: identical; marked keys over a live
  mock game sent nothing to MUME; the game layout's keys identical but
  for the backtick): nothing blocking. Handed to 53h: the keyboard
  still opens before the click for a field the page does not focus on
  pointerdown (the manual's find; a lost click, a keyboard raised by a
  tap on blank page); several guards have no failing test (the Esc
  guards in `hotkeys.ts`, `timers.ts`, `player/view.ts`, the rotation
  classes, the `.wc-menu-look` bottom rule); New in Lite with the
  keyboard folded opens none; `scrollTop` 9 at the first line. Not
  checked: devices, touch selection handles, native undo.

- **Profile prompts in the new look** (branch
  `stage-53-profile-dialogs`, merged; ADR 0128 addendum; on the
  owner's word after 53f): New / Rename (name), Blank or Copy, the copy
  list and Delete are look kit dialogs
  (`src/chrome/frames/profile-dialogs.tsx`) on every device; the four
  cell-grid frames are gone from `profiles.tsx`. Changed behaviour: Esc
  in Blank / Copy and in the copy list goes one step back with the
  name kept (it left the whole flow before). The other old-look pages
  (the ESC menu, its Options, Statistics, Exit) are reached only in the
  old phone layout and go with it (stage 52 file, C). Open: the error
  line touches the buttons on a landscape phone with the keyboard up
  (handed to 53h). Screenshots `docs/stages/img/53-p-*`.

- **53h** (branch `stage-53h`, merged; ADR 0139 "as built in round
  53h"): the two CodeMirror buffers (profile Editor, script editor) are
  typed in with our keyboard on a phone. `src/editor/own-keyboard-cm.ts`
  registers the view through `src/core/own-keyboard.ts` (the phone
  chunk imports no CodeMirror): text through the input handlers or an
  `input.type` transaction; Enter, Backspace, Tab, Esc and the carets
  as marked keydowns to the editor's own bindings. Find and the buffer
  share the keyboard. In landscape the page's hood, Back and status
  step aside (8 code lines at 800 × 360). A code order of the symbols
  for editors; in portrait the digit row is up there. The keyboard
  opens on a tap in the code only. The 53g review findings and the
  dialog error line fixed. After this round no text field on a phone
  raises the device's keyboard with the gate on. Unit 4047, phone e2e
  421 of 423 (`phone-game-landscape.spec.ts:672` twice), Chromium 443
  of 444, Firefox 442 of 443 (pass alone). Phone chunk 99.9 → 101.9 kB,
  editor chunk +0.7 kB. Open: no undo / redo key; Paper under the
  always-dark start page gives low contrast in the script editor's
  pop-ups (older than this stage); touch handles, the paste bubble and
  an app switch untried on a device. Screenshots
  `docs/stages/img/53-h-*`. Its list of what is dead for 53i is in
  the round's report (device keyboard class and `wc-kbd` CSS, the
  inset hooks, the textarea swaps, the gate, the "not ours" close).

- **Review of 53h** (fresh subagent; desktop and tablet editors
  compared with the round before on Chromium and Firefox: identical;
  data safety, marked keys, touch timing, layout and rules probed):
  nothing blocking. For 53i: in an editor the digit-row key writes the
  stored `phone.keyboard.digits` from its second tap on, and the fold
  lasts for the session (`keyboard-pages.ts:296-306`); two wordings
  (the fold's lifetime; the 300 ms rule in the ADR addendum). Test
  gaps: a double Esc with unsaved changes, snippet fields, a long
  press, an editor opened from the game's menu. Not checked: devices
  (handles, paste, app switch), a chunk that fails to load with an
  editor already marked.

- **53i** (branch `stage-53i`, merged; ADR 0139 "as built in round
  53i", ADR 0138 "as released", ADR 0137 addendum): **`?kbd=0` is
  gone**; our keyboard is the only one in the phone's game layout, on
  its pages and in the editors. Removed: the gate, `watchKeyboard` and
  `PhoneKit.keyboardUp`, the `kbd` branches of the cockpit and the
  allocator, the game layout's `wc-kbd` rules, every `?kbd=0` test and
  shot state. The device keyboard state is switched, not deleted: the
  shell turns it off once our keyboard is mounted, and an old-layout
  cockpit holds it on (the run log player and Spotlights on a phone
  are the old tab layout, and Comm's search there still raises the
  device's keyboard). **Kept for the old phone layout** (to go with
  it, stage 52 file C): `phone-viewport.ts` `KEYBOARD_SHARE`,
  `keyboardUp`, `isKeyboardUp` and the class toggle; `cockpit.ts`
  `relayoutPhone`'s guard and the shape pin; `ui.css` and `start.css`
  `wc-kbd` rules; `InputPane` `passField` / `swapField`; `TextField`'s
  textarea in `widgets.tsx`. Kept on purpose: the keyboard inset hooks
  (a tablet's own keyboard), Comm's reply textarea, the "not ours
  closes ours" guard (a read-only code buffer). Also: a tap in a
  window too low for the keyboard opens nothing; a refused K hold
  leaves the keyboard up; the editors' digit key no longer writes the
  setting. **Comm has its hood in portrait too** (owner; ADR 0137 §1
  said "Portrait has neither"; left out where Comm would keep under
  104 px). Unit 4046, phone e2e 400 of 400, three projects 1282 of
  1287 before the last test-only commits (the failures pass alone
  except `phone-game-landscape.spec.ts:637`, about one in four
  alone). Bench: burst main 955, closed 957, open 957 ms. Open:
  turning back to portrait sends three window sizes to MUME in
  emulation (cause not found; for the review); nothing device-tested.
  Screenshots `docs/stages/img/53-i-*`.

- **Review of 53i** (fresh subagent, the review before the release):
  would release; nothing blocking. The three window sizes on a turn
  are older than this stage (the same on main): `phone-viewport.ts`
  publishes the height 150 ms after the width, and the phone layer's
  key size change asks for one more layout. Being fixed with: two
  window sizes when the keyboard closes for lack of room; the Comm
  hood costing two rows at the default text size; a test race in
  `phone-game-landscape.spec.ts`; the device state after a failed
  layer mount. Whole stage against main: every change that reaches a
  desktop or tablet is gated or intended. Not checked: devices, real
  fullscreen, forced colours.

## Test guide 53a (for the owner, S21)

Open the dev server's address with `?kbd=1` (the session runs
`npm run dev:tailnet` on the branch). Two blue lines at the top left
show: the focused element and its `inputmode`, `okb` (our keyboard
open), `wc-kbd` (the device's keyboard detected), `vv` / `inner`.

1. Tap the command field. Our keyboard comes up; **the device's must
   not**. Is the caret seen in the field?
2. Type, use shift, hold backspace, send with Enter. Does it keep up
   with fast typing with two thumbs? Any missed or doubled letters?
3. Tap in the middle of typed text: does the caret move there? Long
   press the field: is paste offered, and does anything else come up?
4. Fold it down with the key at the bottom left; tap a hot key and a
   compass key: no keyboard of either kind.
5. With our keyboard up: rotate; switch to another app and back; enter
   and leave fullscreen (lens key); lock and unlock. Does the device's
   keyboard ever come up? If it does: a screenshot with the blue lines.
6. Landscape, in and out of fullscreen: enough rows of text?
7. The bottom edge: are the lowest keys clear of Android's gesture bar,
   and do taps near the edge work?

Wanted: go or no-go on the technique, and how typing feels (key size
32 × 44 px in portrait, speed). The look, Swedish, digits and symbols
come in the next rounds.

## Test guide 53b + 53c (for the owner, S21)

`?kbd=1` (layout by the browser's language), or `?kbd=sv` / `?kbd=en`.
Still the command field only: Comm's reply and the hot key box use the
device's keyboard until 53d (ours closes when you tap them).

1. **Typing:** å ä ö, shift once, shift twice quickly (lock), hold
   backspace. Are the keys (about 32 px wide) hit reliably?
2. **Digit row:** the `123` key folds it up and down; reload: it is
   remembered. **Symbols:** the `!#?` key; are the right characters
   there and easy to find? Which do you miss on the first page?
3. **History:** ↑ and ↓ (bottom row in portrait; on the digit row in
   landscape).
4. **Portrait with the keyboard up:** compass and K keys above the
   keyboard, the field left of the compass. Tap them while text stands
   in the field: sent, and the text and caret stay. Does the lens keep
   clear? Open Comm and the strip.
5. **Hold a K key** with the keyboard up: our keyboard closes and the
   box opens; a tap on the command field brings the keyboard back.
6. **Landscape:** the block in the middle, K1–K3 left, K4–K6 right, the
   compass far right. Is the key width (at most 46 px) right for fast
   typing? In and out of fullscreen. Try 6, 3 and hidden K keys.
7. **Long press** on the field: paste is offered and our keyboard opens.
8. **Look:** dark and Paper; is the pressed key seen at once?

Wanted: key sizes, the symbol set and its order, where ↑ ↓ should
live, the landscape arrangement, anything that jumps.

## Test guide 53d (for the owner, S21)

`?kbd=1` as before. New in this round:

1. **Comm:** open Comm, tap the reply line of a chat: our keyboard
   types there; Enter sends the tell and the keyboard stays. Tap the
   command field: the keys move there with nothing jumping. The search
   key: our keyboard, never the device's (also no flash of it).
2. **Hot key box:** hold a K key, tap Label or Command: our keyboard
   comes up and the box stays whole above it (landscape: the box stands
   at the right over the band, its lower part scrolls). Enter saves;
   does anything under your finger fire when the box and keyboard go?
3. **Password:** reconnect and log in with our keyboard. The password
   shows as bullets; long press and double tap in it: no toolbar with
   share or translate may show the password; paste still works. ↑ ↓ are
   dimmed.
4. **Settings → Keyboard:** Swedish / English, changes at once (use
   `?kbd=1`, not `?kbd=sv`).
5. **Settings → Quick buttons → Vibrate on key press:** on; do the
   keyboard, the compass and the K keys vibrate (30 ms now, 10 ms in
   0.5.0)? If not: is "touch vibration" on in Android's sound settings,
   and is the phone out of silent and Do not disturb?
6. **Script pane fields** (if a script pane of yours has one in the
   strip): our keyboard, Enter submits to the script.

Wanted: anything that still raises the device's keyboard in the game
layout; the password prompt; whether vibration works.

## Test guide 53e (for the owner: S21, then one iPhone)

The ordinary address now, **without `?kbd`**: our keyboard is the one
in the game layout. `?kbd=0` gives the device's back (until the
release).

1. **The whole, as you play:** log in (name, password), move, fight,
   talk in Comm, edit a K key, rotate, fullscreen in and out. Does the
   device's keyboard ever come up in the game layout? Does anything
   jump?
2. **Typing speed:** type fast with two thumbs. Is any key slower to
   show than with the device's keyboard (`?kbd=0` to compare)? The
   measurement could not settle this; your feel decides.
3. **Password:** select in the masked field (long press, double tap):
   only bullets under a tint, never the word.
4. **Hot key box, landscape:** Enter as Save with a slow finger: the
   keyboard must not come back up.
5. **Comm:** type in the reply line, then close Comm (its key), or its
   search: the keys go to the command field at once, ↑ ↓ lit again.
6. **Start pages and editors** (Profile, Scripts): the device's
   keyboard as before.
7. **iPhone (Safari), once:** does the device's keyboard stay down?
   Does Safari's bottom toolbar cover our bottom row? Rotate once. A
   screenshot of each is enough. (No vibration row there, by design.)

Wanted: your verdict on the whole (release or not), and anything on
the iPhone.

## Test guide 53f (for the owner, S21)

The ordinary address. One-line fields on the pages now use our
keyboard; the big text boxes and the code editors still use the
device's until the next rounds.

1. Start page → Profile → New and Rename: our keyboard comes up with
   the prompt; Enter confirms once.
2. Scripts → New and Rename: the buttons stay reachable above the
   keys; fold the keyboard, tap the field again. Also in landscape.
3. A script's number setting: the digit row is up.
4. History → Export → Title.
5. In the game: menu → Profile → an alias's Pattern (ours), then tap
   Commands (the device's replaces ours, never both); Back: the game's
   keyboard still works.
6. Script editor → Find.

Wanted: anything that jumps or is covered, and any field that raises
the wrong keyboard.

## Test guide 53g (for the owner, S21)

1. Game → menu → Profile → an alias: Pattern and Commands both with
   our keyboard. In Commands: three lines, backspace across a line
   break, the arrow keys, a long text (the caret's line stays in
   view).
2. Tab and shift + Tab between the fields; Esc.
3. Landscape: the keys at the sides (esc, tab, arrows); Lite and the
   export comment.
4. History → Export: the comment; Enter saves, Esc cancels.
5. Rotate with the keyboard up.
6. The backtick on the symbols page.

Wanted: any field that still raises the device's keyboard (the two
code editors do until 53h), anything covered by the keys, a tap that
lands on the wrong thing.

## Test guide 53h (for the owner, S21): go / no-go on the editors

1. Scripts → a script → Edit: tap in the code, type a small function
   (brackets close, Enter after `then`, Tab takes a completion, Esc
   closes the list).
2. Long press to select, paste, drag to scroll: does the keyboard
   behave?
3. Find → type → Enter → Tab → Replace → Esc (back in the code, the
   keyboard still up).
4. Landscape, and rotate with the keyboard up.
5. Profile → Editor.
6. Switch to another app and back: does Samsung's keyboard stay down?

Wanted: are the editors usable this way (go), or should the two
editors keep the device's keyboard (no-go)? Which symbols are too far
away?

## Test guide 53i (for the owner, S21): the whole, before the release

The ordinary address; there is no `?kbd=0` any more.

1. Play as usual for a while: log in, move, fight, Comm, K keys,
   rotate, fullscreen in and out. Anything that jumps, any keyboard
   but ours?
2. Comm in portrait: the COMM hood is there; with the keyboard up while
   you type a reply too.
3. Hold a K key with Comm and the keyboard open in portrait: nothing
   happens, and the keyboard stays.
4. A script editor: the 123 key folds and unfolds the digit row there,
   and the game's keyboard keeps its own setting.
5. Pages once more in outline: a new profile, a script name, Lite, the
   export comment.
6. The run log player (History → a run) and Spotlights: these are the
   old layout and still use Samsung's keyboard in Comm's search; is
   anything broken there?

Wanted: release or not.

## Owner feedback

- 2026-11-11, 53a on the S21 (`?kbd=1`): **go.** Our keyboard comes up
  and the device's never does (focus, rotation, app switch, lock and
  unlock); the caret shows and a tap moves it; a long press offers
  paste, copy, cut, translate and more; typing keeps up; the bottom
  edge is fine; nothing odd from hot keys and compass.
  - Landscape, for the fine tuning: the keyboard is too wide to type
    fast on. Compress it towards the middle, with the hot keys beside
    it (K1–K3 left, K4–K6 right) and the compass at the far right.
- 2026-11-12, 53b + 53c on the S21: everything in the test guide tried,
  all OK (typing, digit row, symbols, history, compass and K keys with
  the keyboard up in portrait, the landscape band, hold on a K key,
  long press, the look). No changes asked for.
- 2026-11-12, 53d on the S21: everything works. One flaw: holding a K
  key with an upper panel open does not open the settings box (fine,
  there is no room), but the map lens goes out and comes back quickly,
  which looks bad.
- 2026-11-12, 53e on the S21: all OK. **The iPhone test waits** (iPhone
  and iPad are looked at together later; ADR 0138 §9's iPhone
  condition is lifted by the owner). Goal 12 in `intent.md` reworded as
  proposed. New wish: our keyboard everywhere on the phone, the start
  menu's pages included.
  - Fixed (9743c577): a held K key asks whether its box has room
    before anything is shown or hidden; a refused hold changes
    nothing. Left: with our keyboard and Comm both open in portrait a
    refused hold still folds the keyboard (room is only known on the
    layout without it).
- 2026-11-12, 53f on the S21: the Pattern field (game → menu →
  Profile) did not give our keyboard: wanted there too (looked into in
  53g). Find in the script editor gives ours; the editor itself the
  device's: ours wanted everywhere (53h). Also seen: some pages are
  still in the old TUI look, for example creating a new profile; they
  are to be moved to the new graphical look (surveyed; its own work).
- 2026-11-12, 53g on the S21: feels OK (tested in outline only).
- 2026-11-12, 53h on the S21: looks OK (tested in outline). **Go on
  the editors.**
- 2026-11-12: the Comm pane has no header text in portrait on the
  phone (it has one in landscape): to be fixed too (handed to 53i).

(After each round.)
