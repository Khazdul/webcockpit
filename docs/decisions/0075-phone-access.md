# 0075 — Phone access: touch fixes and a phone layout

Status: accepted 2026-10-04 (stage 19)

## Context

The owner wants WebCockpit to open on a phone, to log in, read and chat
(intent Goal 12). Real play on a phone is not a goal. Desktop is 99 % of
the use and must not change; anything that would also reach desktop is
put to the owner first.

Today a phone shows "Window too small" (portrait is ~43 columns at the
default font; the guard is 60×18). In the browser's "desktop mode" it runs
but menus are hard to use: tiny one-cell targets, Esc-only back and menu,
no swipe scroll, and every tap pops the keyboard. Research:
`notes/research/mobile.md`.

## Decision

### 1. Gating

- One module, `src/core/device.ts`, decides two flags once at startup:
  - **touch:** `matchMedia('(pointer: coarse) and (hover: none)')`. The
    *primary* pointer is used, so a laptop with a touch screen and a
    touchpad stays desktop.
  - **phone:** touch, and `min(screen.width, screen.height) < 600`.
  - `?touch=1` and `?phone=1` (phone implies touch) force them on, for
    development on a desktop and for e2e tests. There is no way to force
    them off on a real phone; not needed.
- The flags are set as classes on `<html>`: `wc-touch`, `wc-phone`. All
  phone CSS is scoped under them. All phone JS branches read the flags.
- With both flags off, no phone code path runs and no phone rule matches.
  Desktop e2e must stay green unchanged.
- The flags do not change at runtime (rotating the phone keeps *phone*).

### 2. Touch fixes (part A; on with *touch*)

- **Menu button.** A small fixed `☰` control in the cockpit opens the ESC
  menu (the same call as Esc in the input).
- **Tappable back.** Footer tokens that name Esc (`ESC Back`, `ESC Save &
  back`, …) become tappable and dispatch a synthetic Escape keydown on the
  window, so the frame's own Esc path runs (unsaved-change prompts
  included). No per-frame back logic is added.
- **No focus on tap.** The mouseup/focus handlers that return focus to the
  input skip touch input (`pointerType === 'touch'`, or the touch flag for
  plain mouse compatibility events). The input gets focus only when it is
  tapped. The keyboard opens only then.
- **Hit targets.** In menus the whole row is the tap target; a tap on a
  row selects it as a desktop click on its label does. Stepper/cycler
  arrows act without the row being selected first.
- **Swipe scroll.** `.wc-body` scrolls natively by touch; the cursor
  logic (`ensureVisible`) stays.
- `touch-action: manipulation` on chrome controls (no double-tap zoom),
  `touch-action: none` where a control drags.
- `text-size-adjust: 100%` under `wc-touch` (iOS landscape inflation
  would break the measured cell grid).

### 3. Phone layout (part B; on with *phone*)

- **Guard.** Phones use a lower minimum (about 30×8 cells) for the
  cockpit and the chrome. Desktop keeps 60×18.
- **Allocator.** A separate pure `allocatePhone()` beside `allocate()`;
  `Cockpit.relayoutNow` picks one by the flag. The desktop allocator and
  the stored layout model are untouched; the phone does not write layout
  changes back.
- **Shape.** From the top: a one-row tab strip (`GAME`, then the panes the
  layout has enabled, e.g. `COMM`, `CHAR`, `GROUP`; and `☰`), the selected
  view, and the input line. `GAME` shows the output pane; another tab
  shows that pane full width in the output's place. Comm is the main
  reason to open the phone, so it is one tap away. Script panes are tabs
  like the others.
- **No arranging.** Drag handles, resize grips and the close cross are
  not rendered on a phone.
- **Keyboard.** `visualViewport` resize/scroll keeps the input line just
  above the on-screen keyboard. Relayout and NAWS during the keyboard
  animation are debounced, and the size guard is not applied while the
  keyboard is up.
- **iOS input zoom.** On a phone the viewport meta gets
  `maximum-scale=1` at startup, so focusing the input does not zoom the
  page (iOS zooms inputs under 16 px).
- **Safe areas.** `viewport-fit=cover` on phones plus
  `env(safe-area-inset-*)` padding on the cockpit and chrome roots.
- **Desktop-only screens.** On a phone the export editor and macro key
  capture show a short "desktop only" note instead.

### 4. Tests

- A Playwright project `phone` (Chromium, `isMobile`, `hasTouch`, a
  390×844 viewport) runs a phone e2e file: start page, menu by tap, Back
  by tap, tabs, input above an emulated small viewport.
- The existing firefox and chromium projects run unchanged and must stay
  green; they prove the desktop path.

## Consequences

- Desktop behaviour and look do not change. A few shared modules gain a
  flag check; the desktop branch is the existing code.
- Out of scope (research §3 C and D): direction pad and macro buttons,
  history buttons, map pinch zoom, PWA manifest, Wake Lock, reconnect on
  resume, a smaller phone scrollback default.
- Known limits on a phone: switching app or locking the screen ends the
  session (linkdeath); on iOS Safari, profiles may be deleted after 7
  days without a visit unless the site is on the home screen.
