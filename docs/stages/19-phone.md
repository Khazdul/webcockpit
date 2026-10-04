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
- [ ] A1 device flags
- [ ] A2 menu button
- [ ] A3 tappable Esc footers
- [ ] A4 no refocus on touch
- [ ] A5 hit targets, swipe scroll, touch-action, text-size-adjust
- [ ] B1 phone guard
- [ ] B2 phone allocator and tab strip
- [ ] B3 no arranging on phone
- [ ] B4 keyboard-aware input
- [ ] B5 viewport meta, safe areas
- [ ] B6 desktop-only notes
- [ ] C1 phone e2e project
- [ ] C2 full check, release

## Test guide

(Written when the stage is built.)

## Owner feedback

(None yet.)
