# Stage 54 — The tablet's layout

Status: **In progress** (started 2026-11-12; direction changed the same day: the tablet keeps the phone's layout, see "Direction" below).

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
- [x] Trial flag `?tablet=phone`, screenshots and notes (branch `stage-54-tablet`; unit 4126 passed, phone e2e 118, desktop gating e2e 34; full e2e not run)
- [x] Owner: verdict on round 1 (A, with changes; see feedback)
- [x] Owner: the trial on the iPad (keyboard stays down; fullscreen flaky)
- [x] Mockup round 2 published (A refined: switches, swipe, keys above the compass)
- [x] Owner: verdict on round 2; canvas revised (one frame, draggable dividers)
- [ ] Owner: verdict on the revision; which dividers lock while the keys are on
- [ ] ADR 0140 and the build rounds

## Test guide (for now)

- **Mockups:** open the canvas "WebCockpit tablet layout, round 1"
  (best on the iPad itself, to judge sizes by hand). Wanted: A or B or
  a mix; the pane set; where the keyboard goes; size and place of the
  compass and hot keys.
- **Trial** (branch `stage-54-tablet`, not on main, not released): the
  dev server runs from the branch's worktree with `npm run dev:tailnet`
  (ADR 0096). On the iPad, in a **private tab** (stored desktop
  settings otherwise win over the phone's defaults), open
  `https://<machine>.<tailnet>.ts.net:5173/` with one of:
  - `?tablet=phone` — the live game in the phone's layout.
  - `?fixture=gmcp-demo.log&speed=0&tablet=phone` — the same, filled
    from a log, no login.
  - no flag — today's tablet (the desktop cockpit), to compare.
  The flag must be in the URL on every load. Try both orientations:
  typing with our keyboard, the compass and hot keys, the lens, the
  pane strip, Comm, the menu, a start-menu page with a text field.
  Wanted: what works as it is, what is too small or in the wrong
  place, and anything iPadOS does on its own (its keyboard coming up,
  bars, rotation). What the agent saw in emulation (Chromium only) is
  in `notes/research/tablet/trial.md` with screenshots beside it.

## Owner feedback

### Mockup round 1 and the trial on the iPad (2026-11-12)

- **A** (panes always in view) feels best in landscape and in portrait.
- The borders and details can be made finer, from our theme and how the
  desktop draws panes (frosted glass, glow and so on).
- Map, Comm and the pane box can each be **toggled** on and off.
- The pane box changes pane by a **sideways swipe**, as on the phone (no
  tabs).
- The map zooms by **pinch**.
- The hot keys go **above the compass**, as on the phone.
- All hot keys and the compass can be **hidden and shown** together. The
  room they had is then filled: by panel space in landscape, by the
  command field in portrait. The control for it is always visible;
  perhaps Map, Comm, panes and keys as a group of icons somewhere.
- **Trial on the iPad:** iPadOS's own keyboard stays down. Fullscreen
  with our keyboard up is unreliable: sometimes it works, sometimes it
  jumps back out; it flickers and things seem to be redrawn on the way
  into fullscreen. To investigate in the build.

### Mockup round 2 (2026-11-12)

- The switches sit in the command row (the top bar, X1, is not chosen).
- The column's order in landscape is right: Map, Comm, then the pane
  box beside the keys.
- In portrait the keys ride above the keyboard while typing.
- Six hot keys in two rows of three above the compass: yes.
- **One thick frame round all the panes:** Map, Comm and the pane box
  lie visually in the same floating box, with more discreet dividers
  between them. The pane headers are redone to suit (they can be more
  discreet).
- **The dividers can be dragged** between Map, Comm and the pane box.
  His words: "in portrait only between Map and Comm if the hot keys are
  on". Drawn as: in **landscape** only Map / Comm while the keys are
  on (the keys' row has a fixed height), all dividers otherwise; put
  to him to confirm which orientation he meant.

The canvas of round 2 was revised in place for the last two items
(shared `kit.css`: one frame, hairlines, grips on the dividers that
can be dragged, corner labels).

### Direction changed (2026-11-12, after round 2)

The owner: the mockups are not moving in the right direction. The
phone's layout as it is, seen on the iPad behind `?tablet=phone`, feels
very good. **The tablet keeps the phone's layout as it is, with minor
improvements only.** What chafes: our keyboard is too narrow, and
fullscreen is a little buggy. The mockups of rounds 1 and 2
(`notes/research/tablet/`) are shelved, not built.

## Direction (replaces "Plan" above from step 2 on)

1. **A tablet gets the phone's game layout and our keyboard by
   default** (today only behind the trial flag). ADR 0140.
2. **The keyboard uses the width of a tablet:** wider keys, and rows
   to suit, on a tablet-size window. The phone's sizes do not change.
3. **Fullscreen on the iPad:** find out why it flickers and sometimes
   jumps back out with our keyboard up; fix what is ours, and say
   plainly what is iPadOS's.
4. Owner test on the iPad over the tailnet, then merge and release.

### Tasks (new direction)

- [ ] 54a: tablet gate (the phone's layout by default on a tablet), ADR 0140
- [ ] 54a: keyboard width on a tablet
- [ ] 54b: fullscreen on the iPad: investigation, then fix or note
- [ ] Review, owner test, release

