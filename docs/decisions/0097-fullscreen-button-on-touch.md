# 0097 — Fullscreen button on touch devices

- Status: Accepted
- Date: 2026-10-22
- Related: ADR 0075 (touch and phone flags)

## Context

A `Fullscreen` row in the start and ESC menus (same day) worked, but the
owner wants it out of the menus: desktops have F11, and the row took a
menu line everywhere. Phones and tablets have no such key.

## Decision

- No fullscreen row in the menus. `START_MENU_ROWS` is back at 7.
- `src/ui/fullscreen-button.ts`: a small, faint (50 % opacity, 44 px
  touch target) icon button fixed near the top right corner of the page
  (12 px in from the safe area),
  above the start page, the cockpit and the menus. Added once at startup
  (not in bench mode), only when `device().touch` and `canFullscreen()`:
  never on a desktop, never on the iPhone (no page fullscreen).
- The icon shows the action: outward corners, inward corners while in
  fullscreen. A tap does not move the input's focus.
- A refused request (Firefox on iPad, `src/core/fullscreen.ts`) removes
  the button for the page's life instead of flashing a message.
- The HTML replay keeps its own `F` key and control box button.

## Consequences

The button can sit over the top right cell of whatever is there (a pane's
title bar or game text); it is small and faint enough to accept that.
