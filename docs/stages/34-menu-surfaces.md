# Stage 34 — Menu surfaces follow the background

Status: **In progress** (2026-11-01).

## Goal

Every menu, popup, tooltip and floating card takes its colours from the
chosen terminal background, so it looks harmonious on every theme and
never glares (a black slab on Paper). ADR 0116.

## Owner brief (2026-11-01)

Menus blend badly with some colours, worst on Paper. Make the menus adapt
to the chosen background so they look harmonious and nice. The six
screenshots were examples (player Display and Panes popups, the reel's
Spotlights card, the menu bar's Panes and Exit popups, Settings on Teal
and Paper); do a broad review.

## Plan

- `src/theme/surface.ts`: `surfaceColors(bg)` → `--sf-*` on every themed
  root (ADR 0116).
- Replace the hard-coded greys of every floating surface with `--sf-*`:
  menu bar popups and tooltip, Exit, settings and gear popups and their
  control kit, the player's control box, popups and marker tips, the
  Spotlights card, the windows' title bar, and any other menu found in
  the review.

## Tasks

- [x] `surface.ts` and the `--sf-*` root tokens (ADR 0116)
- [x] Unit tests for `surface.ts`
- [x] Menu bar: popups, Exit, tooltip (`src/menubar/menubar.css`)
- [x] Settings and gear popups, control kit (`src/chrome/popups/`)
- [x] Player chrome and popups (`src/player/player.css`, `view.ts`)
- [x] Spotlights card (`src/player/spotlight.css`)
- [x] Windows' title bar (`src/chrome/kit/window.css`)
- [x] Review of the rest (layout, panes, frames) for other floating menus
- [x] Screenshots on Black, Teal, Sepia, Slate and Paper, reviewed
- [x] Unit and e2e green

Review notes: the map hover, the script panes' link tips, the ESC menu,
the phone tabs and the export editor's bands are TUI elements already
drawn from the terminal colours (`--c-*`, `--c-line-hl`), not fixed dark
panels, and stay. The map's loading box sits on the map's own background
and stays. The kind colours are published as `--kind-*` on the player
(`kindTokens`, src/player/icons.ts), fitted to the panel (contrast 3).

## Test guide

1. Open the app, Settings → Appearance, Background **Paper**. Open each
   menu bar popup (Panes, Settings, the pane gears, Exit) and hover the
   bar's icons for the tooltip. Expected: light cream cards with dark
   text, a soft shadow, no black panels.
2. The same on **Teal**, **Sepia** and **Slate**: the panels are tinted
   like the page, not neutral black.
3. **Black**: as before.
4. History → a run log, and the Spotlights reel, with the player on
   Paper (Display → Paper): the control bar, Display and Panes popups and
   the Spotlights card are light too.

Feedback wanted: do the light cards on Paper look right (how light, how
strong the border and shadow)? Are the tinted panels on the dark themes
too strong or too weak?

## Owner feedback

(pending)
