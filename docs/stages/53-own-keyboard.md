# Stage 53 — An on-screen keyboard of our own (investigation first)

Status: **Next** (written 2026-11-11 as the handoff from stage 52;
nothing investigated or built, no plan yet).

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

## Tasks

- [ ] Investigation with the owner; decisions recorded as an ADR
- [ ] (plan to be written after the decision)

## Owner feedback

(After each round.)
