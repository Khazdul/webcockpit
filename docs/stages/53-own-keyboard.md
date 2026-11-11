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

### Can be cut

Long-press alternatives (not planned), caret keys (a tap in the field
moves the caret), script pane fields, key sound.

## Tasks

- [x] Investigation with the owner; decisions recorded as ADR 0138
- [ ] 53a device test behind `?kbd=1` (go / no-go on the S21)
- [ ] 53b model and editing API
- [ ] 53c the keyboard in the game layout
- [ ] 53d other fields, settings, vibration
- [ ] 53e finish, test guide, release decision

## Owner feedback

(After each round.)
