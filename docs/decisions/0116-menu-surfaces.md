# 0116 — Menu surfaces follow the background (stage 34)

- Status: Accepted
- Date: 2026-11-01
- Related: stage 34 (`docs/stages/34-menu-surfaces.md`). Amends ADR 0099
  (menu bar popups "dark on every background"), ADR 0107 (settings
  popups, same), ADR 0114 (player chrome "dark glass on every
  background") and ADR 0103 (the windows' title bar). Builds on ADR 0041
  (light chrome) and ADR 0061 (contrast on dark themes).

## Context

The menu bar's popups, the settings and gear popups, the tooltip, the
player's control box and popups, and the Spotlights card were drawn as
near-black panels with fixed greys on every terminal background. On Paper
they are black slabs on a cream page; on Teal, Sepia or Slate they are a
neutral black that clashes with the tinted page. The owner (2026-11-01):
the menus should adapt to the chosen background so they look harmonious
and do not hurt the eyes.

## Decision

- One pure function, `surfaceColors(termBg)` in `src/theme/surface.ts`,
  derives every surface colour from the terminal background, published as
  `--sf-<role>` by `rootTokens` on every themed root (`<html>`, an in-app
  player, the replay page). Roles: `bg field raised hover line border
  border-hot hot fg dim faint icon off on-track on-knob danger
  danger-border danger-hover warn gold focus shadow glass scheme`.
- The side: a background that takes dark ink (`takesDarkInk`; Paper) gets
  a light panel (the background halfway to white, a card lighter than the
  page, a soft shadow in the background's own dark hue); every other
  background gets a dark panel (the background 4 % toward white: black →
  `#0a0a0a`, the old ghost panel, unchanged).
- Every level is the panel mixed toward its ink by a fixed share, so the
  greys carry the background's hue. Text levels are fitted to minimum
  contrasts against the panel (hot 10, fg 7, dim 3.8, faint 2.6, icon 3;
  danger and warning 4.5).
- CSS uses only `var(--sf-*)` for surface colours. Exceptions that stay
  fixed: the preview box (it shows the terminal's own colours), colour
  swatches, the Spotlights kind colours, the clock's sun and moon hues,
  the windows' cyan identity colour.
- A popup or card takes the surface of the root it lives in: the player's
  chrome follows the player's background (the viewer's theme), not the
  app's.
- `color-scheme: var(--sf-scheme)` on the panels, so native scrollbars and
  controls inside match.

## Consequences

- On black nothing changes visibly; on tinted dark backgrounds the panels
  are tinted; on Paper every menu is a light card.
- New floating UI must use `--sf-*`, not hard-coded greys.
