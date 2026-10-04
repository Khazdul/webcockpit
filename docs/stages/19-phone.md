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
- [ ] C2 full check, release

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

(None yet.)
