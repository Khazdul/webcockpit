# Stage 54 — The tablet's layout

Status: **In progress** (design; started 2026-11-12).

## Goal

A layout of its own for tablets in the game, between the phone's and
the desktop's. Today a tablet is "touch, not phone"
(`src/core/device.ts`, short side 600 px and up): it gets the desktop
cockpit and the device's keyboard, which covers much of the screen and
has been hard to control on an iPad.

## Owner decisions (2026-11-12)

- No more iPhone work now. 0.7.0 looked over on an iPhone: most works;
  fullscreen is missing (iOS Safari has no element fullscreen on a
  phone) and is left as it is.
- Ambition: **play in between**. Better than the phone, clearly below
  desktop; good for an XP session, probably not PvP (`intent.md`
  Non-goals, reworded the same day).
- No physical keyboard: our own keyboard (ADR 0138) is the keyboard.
- Portrait and landscape must be equally good.
- iPad (10th gen, 820 x 1180 CSS px) is the test device, over the dev
  server on the tailnet (ADR 0096). Android tablets should work; the
  owner cannot test them, so they are covered by emulation only.
- Direction: a hybrid of the phone's layout and fixed panes sounded
  most right. Not yet chosen in detail (mockups below).

## Rules

- Desktop and phone do not change. Tablet code runs only behind a
  tablet gate; shared paths change only where the owner has agreed.
- The phone chunk's rule holds (ADR 0136): what a tablet reuses from
  `src/phone/` must not grow the desktop's first load.
- Stage 52 passes C–E (scrapping the old phone layout) wait until this
  stage has settled what the tablet reuses.

## Plan

1. **Trial** — the phone's game layout and our keyboard unchanged on a
   tablet-size window behind `?tablet=phone` (branch
   `stage-54-tablet`), with screenshots at 820 x 1180 and 1180 x 820 and
   notes in `notes/research/tablet/trial.md`. The owner tries it on the
   iPad. Purpose: learn what breaks and what feels right before the
   design is fixed.
2. **Mockups** — `notes/research/tablet/README.md`. Round 1: A (panes
   always in view) and B (the phone grown up).
3. **Decision** — ADR 0140 from the owner's verdict; this file gets the
   rounds.
4. **Build** in rounds as in stage 53, each with a test guide for the
   iPad; review; release.

## Tasks

- [x] Owner's answers recorded; `intent.md` reworded
- [x] Mockup round 1 published and its sources kept
- [ ] Trial flag, screenshots and notes (subagent, in progress)
- [ ] Owner: verdict on round 1
- [ ] Owner: the trial on the iPad
- [ ] ADR 0140 and the build rounds

## Test guide (for now)

- **Mockups:** open the canvas "WebCockpit tablet layout, round 1"
  (best on the iPad itself, to judge sizes by hand). Wanted: A or B or
  a mix; the pane set; where the keyboard goes; size and place of the
  compass and hot keys.
- **Trial:** filled in when the trial branch is ready.

## Owner feedback

(none yet)
