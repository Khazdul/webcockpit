# 0142 — One phone layout; the old one is scrapped

- Status: Accepted (owner, 2026-11-13: the old phone layout goes; the
  player reuses the game's phone layout; "Desktop site" gives the
  desktop cockpit). Built in stage 55. Not yet tried by the owner as
  built; not yet released.
- Date: 2026-11-13
- Related: supersedes ADR 0075 §3 (the phone's tab layout, `☰` and the
  ESC menu on a phone) and ADR 0098 (the phone tab keys' old path);
  amends ADR 0075 §1 and ADR 0140 §1–§2 (the device flags), ADR 0109
  (`NOT_ON_PHONE` is gone), ADR 0112 (the ESC menu is gone on every
  device) and ADR 0136 §1 (the game layout's gating). Investigation:
  `notes/research/stage-55-plan.md`. Stage:
  `docs/stages/55-scrap-old-phone-layout.md`.

## Context

Since stage 51 the code held two phone layouts. The new one (ADR 0136,
0137, 0138, 0140) is the game on a phone and a tablet. The old one
(ADR 0075: a tab strip, `☰`, the ESC menu with its Options pages in the
cell-grid look) still served four things: the run log player and
Spotlights on a phone, a phone flag forced in a desktop-size window
(`?phone=1`, used by desktop e2e specs), a phone in the browser's
"Desktop site" mode, and the fallback when the phone chunk failed to
load. The owner wanted it gone.

## Decision

### 1. The player on a phone or tablet is the game's phone layout

The run log player mounts the same phone layer over the recording, in a
replay mode: lens, pane strip, Comm, bands and the unread badge; no
compass, hot keys, keyboard, menu, wake lock, defaults patch or
automatic login. Comm is read-only (no reply line, no search); the
strip has no Statistics page.

- The cockpit option `phoneReplay: { bar }` lays the phone layout out
  without a command line; `bar` keeps the command row's rows.
- The player's transport is docked in those rows and never hides. Under
  600 px: Exit, −10 s, Play/Pause, +10 s, Speed (one key that steps and
  wraps), position, Display. From 600 px: also To start, the speed
  stepper and the length. No Panes popup and no Fullscreen.
- The way out is the bar's first key. There is no Back at the top left
  and the header shows no key hints.
- The host owns an in-memory settings store for the layer and the
  layer's state, both kept over the rebuild a backward seek makes.
  Nothing is written to the viewer's settings (ADR 0021).
- The cockpit marks its own theme (`data-ph-light`); `phone.css` reads
  that, so a Paper recording is Paper inside a dark viewer.
- The player's font keeps the recorded size down to the phone layout's
  minimum grid, not the desktop's 60 × 18.
- Spotlights' viewer uses the same layout with no bar and no layer:
  text only, as on desktop.
- `player-host.ts` is bundled into the exported HTML replay and imports
  `src/phone` as types only; the shell hands the module in. The export
  never runs phone code.

### 2. Device flags

- **Desktop site.** A touch device found on a phone's screen, in a
  window whose short side is 600 CSS px or more, is
  `{ touch, desktopSite }` and not `phone`: the desktop cockpit with
  the touch behaviours and the device's keyboard. The player asked for
  the desktop version and gets it. An unknown or 0 × 0 window counts as
  a phone's.
- New-user defaults (settings, first paint, bundled scripts) follow the
  device, `phone || desktopSite`, so a first visit in that mode does
  not store desktop defaults that follow the phone back.
- **`?phone=1`** forces `phone` and `touch` at any window size and
  never makes a tablet. In a desktop-size window it gives the phone
  layout (development and tests).
- A tablet is as in ADR 0140: iPadOS asks for the desktop site by
  default, so the request says nothing there; `?tablet=desktop` is the
  way to the desktop cockpit.
- With the phone flag on, the cockpit is the phone layout. The
  `phoneGame` option is gone.

### 3. A failed phone chunk

One eager, dependency-free cover (`src/app/phone-failed.ts`): "The
phone layout could not be loaded. Check the connection and reload."
with a Reload button. No retry and no fallback layout. `Shell.openMenu`
called before the layer is up waits for it.

### 4. What is deleted

`src/layout/phone.ts`, the cockpit's tab strip path, the device
keyboard state (`wc-kbd`, `keyboardUp`, the baseline logic in
`phone-viewport.ts`), the `☰` button; `EscMain`, `ExitConfirm`, the
Options hub and its frames, the old Statistics page, the parts of the
old kit that lost their last user (`banner.tsx`, `scroll.tsx`, most
of `widgets.tsx` and `nav.ts`); `NOT_ON_PHONE`. The ESC overlay
itself stays: the phone's menu sheet opens Profile and Scripts in it.

### 5. What is kept on purpose

- The password field swap in `src/ui/input-pane.ts` (`passField`,
  `swapField`). The phone's input is built before the phone layer
  mounts; on a slow load a player can reach MUME's password prompt with
  the device's keyboard, and the swapped-in password field is what
  keeps that keyboard from learning the password.
- `setPageKeyboard(false)` and the device-keyboard paths a desktop, a
  `?tablet=desktop` tablet and a Desktop-site phone use.
- `MapPane.forwardHidden`: still in effect on a phone while no lens is
  set (before the layer mounts, and in Spotlights' viewer).

## Consequences

- The stage removed 7 400 lines and added 3 700 (source, tests and
  scripts): 3 700 fewer. `chrome` chunk 280.0 →
  235.0 kB, `app` 228.6 → 224.9 kB; phone JS 125.1 → 126.9 kB, phone
  CSS 59.1 → 63.7 kB, `player-host` 30.2 → 33.8 kB, `index` 28.3 →
  29.2 kB.
- Test coverage knowingly dropped with the old pages: their keyboard
  navigation, row texts and the pane grid. What still exists on desktop
  (Paper palette, cursor blink, Reset appearance, the preview) is
  tested through the Settings popup.
- A phone whose phone chunk cannot be loaded has no layout at all until
  a reload.
- A phone in Desktop-site mode has small text, the device's keyboard
  and no automatic login.

## To verify on a device

1. Android Chrome, "Desktop site": that `screen.width` stays the
   phone's while the window grows to about 980 px. If the screen value
   is scaled too, the phone counts as a tablet and keeps the phone
   layout.
2. iPhone Safari, "Request Desktop Website": expected to change
   nothing (the layout viewport stays at the device's width).
3. Page zoom below 100 % on a phone does not push the window past
   600 px.
4. The player's bar at the bottom edge on a phone with a home
   indicator; the browser's back gesture from the player.
