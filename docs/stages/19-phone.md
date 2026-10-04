# Stage 19 — Phone access

Owner request, 2026-10-04: be able to open WebCockpit on a phone. Today a
phone shows "Window too small"; in "desktop mode" it runs but menus are
hard to use.

Intent Goal 12, spec §2.12, ADR 0075. Research: `notes/research/mobile.md`.

## Owner decisions

- 2026-10-04: build **A (touch fixes) and B (phone layout)** from the
  research. C (touch play) and D (PWA, wake lock, reconnect) are not built.
- 2026-10-04: **low ambition.** A phone is for logging in and chatting,
  not for real play.
- 2026-10-04: **desktop must not be affected.** Changes that would also
  reach desktop are asked about first.
- 2026-10-04: two items **apply on desktop too**: `ESC …` footer tokens
  are clickable everywhere (mouse as well as tap), and a new `#menu`
  client command opens the ESC menu on every device.

## Plan

### A. Touch fixes (on with the *touch* flag)

- `src/core/device.ts`: *touch* / *phone* flags, `?touch=1` /
  `?phone=1`, `wc-touch` / `wc-phone` classes on `<html>`.
- Menu button `☰` in the cockpit.
- Tappable `ESC …` footer tokens (synthetic Escape).
- No refocus of the input on touch taps.
- Whole-row tap targets in menus; stepper and cycler arrows work without
  selecting first.
- Swipe-scrollable `.wc-body`; `touch-action`; `text-size-adjust`.

### B. Phone layout (on with the *phone* flag)

- Lower size guard for phones (cockpit and chrome).
- `allocatePhone()`: tab strip, one view at a time, input at the bottom.
- No drag, resize or close cross on a phone.
- Input above the on-screen keyboard (`visualViewport`), debounced
  relayout and NAWS.
- `maximum-scale=1` and `viewport-fit=cover` on phones, safe-area insets.
- "Desktop only" note for the export editor and macro key capture.

### C. Verify and release

- Playwright `phone` project and a phone e2e file.
- Typecheck, unit, full desktop e2e unchanged, phone e2e.
- Release after the owner's go, then the owner tests on the phone.

## Tasks

- [x] Research note, intent Goal 12, spec §2.12, ADR 0075, stage file.
- [x] A1 device flags
- [x] A2 menu button
- [x] A3 tappable Esc footers
- [x] A4 no refocus on touch
- [x] A5 hit targets, swipe scroll, touch-action, text-size-adjust
- [x] B1 phone guard
- [x] B2 phone allocator and tab strip
- [x] B3 no arranging on phone
- [x] B4 keyboard-aware input
- [x] B5 viewport meta, safe areas
- [x] B6 desktop-only notes
- [x] C1 phone e2e project: `phone` project in playwright.config.ts runs
  `tests/e2e/phone*.spec.ts`. `phone-touch.spec.ts` covers menu by tap,
  ESC Back by tap, whole-row tap, no input focus on an output tap
  (`?touch=1`, 1000×700). `phone-layout.spec.ts` (`?phone=1`, Pixel 7
  and 844×390) covers the tab strip, COMM/GAME switching with the scroll
  position kept, no arranging controls, the menu by `☰`, a shorter
  visible area (keyboard) without "too small", landscape, the start page.
  Desktop: `esc-click.spec.ts` for `#menu` and a clicked `ESC Back`.
  Part B as built: ADR 0075 §3.1.
- [x] C2 full check, release (0.1.45)

## Test guide

Open mumecockpit.com on your phone in the normal browser (not desktop
mode). Built and tested only in emulation so far; real phones are the
real test.

1. **Start page.** It should show the menu, not "Window too small". Tap
   Profile, Options, History, About; go back by tapping `ESC Back` at the
   bottom. Swipe a long Options page.
2. **Log in.** Enter MUME. A tab strip at the top: `GAME`, then your panes
   (`CHAR`, `COMM`, …). Tap `COMM`, then `GAME`; the game text keeps its
   place.
3. **Chat.** Tap the input line at the bottom. The keyboard opens and the
   input stays just above it. Send a `say` or a `tell`. Tapping the game
   text should *not* open the keyboard.
4. **Menu.** Tap `☰` at the right end of the input line; the ESC menu
   fills the screen. Disconnect / back from there.
5. **Turn the phone** to landscape and back.
6. **Desktop (also changed, approved):** on the computer, click
   `ESC Back` in a menu footer, and type `#menu` in the input. Everything
   else on desktop should be exactly as before.

Feedback wanted: does it open and fit on your phone (which phone and
browser)? Does the keyboard hide the input? Are the tabs useful, and is
anything missing for logging in and chatting?

## Owner feedback

### Round 1 (2026-10-04, Samsung Android Chrome, ~412 px portrait, light theme)

1. Menus have content you cannot reach: the Scripts action bar is cut at
   the right edge (RENAME, DELETE, MANUAL unreachable), footers end in `…`.
   Wide tables (Statistics, History) cut at the right edge are not
   acceptable either: on a phone nothing in a frame may be out of reach.
2. Chrome shows its autofill bar (key, card, location) above the keyboard
   when the command line has the focus; it does not for a `<textarea>`.
3. (Via the coordinator) the start banner is not centred: it starts ~7 %
   in and the last `T` of COCKPIT is cut off.

### Round 1 tasks

- [x] Survey script (scratchpad `survey.mjs`): every chrome frame at
  412×800, 360×740 and 915×400 with `?phone=1`, dark and paper themes;
  flags text clipped sideways and lines ending in `…`; screenshots.
- [x] Footers wrap at the ` · ` joints on a phone (`Footer`,
  `footerRows`/`packRows` in kit/nav.ts); `useBodyRows(footer)` takes the
  extra rows off.
- [x] `Centered` text wider than the grid wraps on a phone (name hints,
  delete and exit warnings, export note).
- [x] Safety net: on a phone `.wc-body` swipes sideways and its rows and
  scroll rows do not clip, so wide content (History table, Options Panes
  and Timers colour grids, the Appearance preview) is reachable.
- [x] Scripts: the list fits the grid, the buttons wrap onto two rows,
  no help panel when narrow; a tap on `[ ]` toggles, a tap on the
  selected name opens the editor (EDIT stays).
- [x] Statistics: under 64 columns on a phone the two sides stack (each
  the grid's width); the header wraps.
- [x] ESC menu status header wraps between its parts.
- [x] Editors: no 40-cell floor on a phone; the editor footer moves
  `Ln, Col` to the row above when it does not fit; `Ctrl+S Save`,
  `F1 Manual`, the confirm's `Y`/`N` are tappable on touch. Credits:
  column fits the grid, `Escape to exit` tappable on touch.
- [x] Banner: under 45 columns it crops its starfield (wordmark whole,
  centred), under 39 it is dropped. Cause: a 412 px phone at DPR 3.5 has
  10 px cells, so 41 columns; the banner had no width check. Desktop
  (≥ 60 columns) is not affected.
- [x] Command line on a phone: one-row `<textarea>` (`enterkeyhint=send`),
  Enter sends, no newline ever lands; password prompts swap in an
  `<input type=password>`. Chrome text fields (`TextField`) on a phone:
  one-row textarea too.
- [x] Tests: `tests/e2e/phone-frames.spec.ts`; unit tests for
  `packRows`, `bannerCrop`, the phone input pane; desktop `live-mock`
  asserts the `<input type=text>`.

Left as `<input>` on a phone (the autofill bar can still show there):
script pane text fields (`src/panes/script-pane.ts`), the profile
editor's lite fields (`src/editor/frame.tsx`), the manual's find field
(`src/editor/manual-find.tsx`).

Known limits: in the profile editor lite view at about 40 columns the
category tabs and the list are truncated (`HIGHLI…`, `^You a`) but every
control is tappable; a wide table swipes sideways as a whole (the History
button column scrolls out with it).
