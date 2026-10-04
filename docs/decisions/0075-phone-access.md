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
  Desktop e2e must stay green unchanged. The two exceptions the owner
  approved for desktop too are in §2: clickable `ESC …` footer tokens and
  `#menu`.
- The flags do not change at runtime (rotating the phone keeps *phone*).

### 2. Touch fixes (part A; on with *touch*)

- **Menu button.** A small `☰` control at the right end of the input row
  opens the ESC menu (the same call as Esc in the input). It sits in the
  input row, not over a pane, so it covers no text and stays reachable
  above the on-screen keyboard.
- **`#menu`** (owner-approved for desktop too, 2026-10-04): a client
  command that opens the ESC menu, on every device. It resolves only by
  its full name, so it takes no tt++ abbreviation (`#me` stays #message).
- **Tappable back** (owner-approved for desktop too, 2026-10-04). Footer
  tokens that name Esc (`ESC Back`, `ESC Save & back`, …) are clickable
  on every device and dispatch a synthetic Escape keydown at the focused
  element (`src/chrome/kit/esc.tsx`), so the frame stack's window capture
  listener and the frame's own Esc path run as for a real key
  (unsaved-change prompts included). No per-frame back logic is added.
  The press keeps the focus where it is. Look: the existing clickable
  footer-token style (pointer, hover colour).
- **No focus on tap.** On a touch device the last pointerdown's
  `pointerType` is tracked (the compatibility mouse events after a tap
  carry none). `InputPane.focus()`, which every refocus path uses (the
  mouseup handlers, window focus, closing the menu), does nothing after a
  touch or before any pointer; a mouse on the touch device refocuses as on
  desktop. A tap on the output neither copies a selection nor refocuses.
  Typed keys still move the focus to the input. The input gets focus only
  when it is tapped, and the keyboard opens only then.
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

#### 3.1 As built (part B, 2026-10-04)

Refines §3; where they differ, this wins.

- **Guard.** 30×8 cells on a phone (`PHONE_MIN_*` in
  `src/layout/phone.ts` and `src/chrome/kit/nav.ts` `minView()`); the
  "Window too small" text names the phone minimum. The ESC menu covers the
  whole screen on a phone (desktop keeps 80 %), with an opaque background.
  Every chrome frame was checked at 43×40 and 93×20 (start page, menu,
  options pages, profiles, profile editor, scripts, history, statistics,
  spotlights, credits, about): all open without errors and stay usable;
  wide tables are cut at the right edge, no further changes.
- **Allocator.** `allocatePhone()` in `src/layout/phone.ts` (pure,
  unit-tested in `tests/unit/layout-phone.test.ts`). Tabs: `GAME`, then
  every shown pane in layout order (docks left, right, top, bottom in
  stack order, then floating panes; script panes only while present).
  The selected pane gets the view rectangle with its own border setting.
  The game pane keeps the view rectangle under a pane tab and is only
  hidden (`visibility`), so its scroll position, the cell grid and NAWS
  do not change on a switch. A tab that disappears falls back to GAME.
- **Tab strip.** One text row: ` LABEL ` tokens (built-ins by their short
  names, script panes by their title in capitals, at most 12) split by
  `│` in the pane frame colour; the selected one in reverse video
  (accent background). Tapping selects; the strip swipes sideways when
  the tabs do not fit and keeps the selected tab in view. The selected tab
  lives in memory only. The `☰` stays in the input row (part A), not in
  the strip.
- **Temporary script panes** show over the GAME view only, kept inside
  it; they cannot be moved or closed by hand on a phone.
- **No arranging.** On a phone the cockpit attaches no grip, close cross
  or float handles, renders no resize handles and ignores pointer
  presses for drags, so the phone never writes the layout.
- **Keyboard.** `src/layout/phone-viewport.ts` follows `visualViewport`
  (resize/scroll, plus window resize) and, 150 ms after the last event,
  publishes `--wc-vv-h` / `--wc-vv-top`; under `html.wc-phone` `#app` is
  `position: fixed` at that top and height, so the cockpit and the chrome
  fit above the keyboard and the input line sits just over it. The
  relayout and NAWS follow from the one resize. The keyboard counts as
  up (`html.wc-kbd`, `keyboardUp()`) while the visible height is below
  80 % of the tallest seen at this width; the cockpit skips the guard
  then, and with under 3 rows the strip gives way to the view.
- **Viewport meta and safe areas.** At startup on a phone the meta becomes
  `width=device-width, initial-scale=1, maximum-scale=1,
  viewport-fit=cover`. `#app` is padded by `--pad` plus
  `env(safe-area-inset-*)` (no bottom inset while the keyboard is up);
  the start page and the menu overlay are inset by the same amounts, so
  every cell grid measures the safe area.
- **Desktop-only notes.** History `EXPORT` flashes "Export: desktop
  only."; in the profile editor a new macro and the key field flash "Key
  capture: desktop only." instead of capturing.

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
