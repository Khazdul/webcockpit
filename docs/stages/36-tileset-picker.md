# Stage 36 — Tileset picker

Status: **Done** (2026-11-04). Released in 0.2.3.

## Goal

Settings → Mapper (and the map pane's gear popup) choose the tileset from
checkable previews instead of a dropdown, without making the settings
popup taller. ADR 0118, mockup `notes/research/tileset-picker-mockup/`
(`mockup.html`, published to the owner at
https://claude.ai/artifact/DivXdmw8KYn9xkgtPh71yW).

## Owner brief (2026-11-04)

- Instead of the dropdown: tick the set you want, with a small preview
  (about 6×6 rooms of a representative mix) per set.
- Shimrod alternating needs its own look, showing all four seasons.
  Picked variant A: quadrants, the season now lit.
- Must not make the whole settings popup tall and give the other tabs
  empty room: five per row, Background colour and Map file before the
  tilesets so the grid is last.
- Card names are fine as in the mockup.

## Tasks

- [x] `scripts/build-tileset-previews.py`: 6×6 scene per concrete set,
      default fallback per file and aliases as in `src/map/tilesets.ts`,
      144 × 144 PNGs in `public/map/tilesets/previews/`, committed
- [x] Unit test: a preview for the default and every `TILESETS` entry
- [x] Mapper component: new order, Tileset grid (5 × 2) with credit line,
      radio group semantics and keys, `chooseTileset` on choose
- [x] Shimrod card: four season quadrants, the season now full, others
      dimmed
- [x] CSS in surface tokens; check on Black and Paper
- [x] Height: Mapper page ≤ Appearance page (e2e)
- [x] Update e2e (`map-tilesets.spec.ts` dropdown helpers) and unit tests
      (`chrome-mapper`, `chrome-popups`)
- [x] Screenshots of Settings → Mapper and the gear popup, reviewed
- [x] ADR 0107 note that the Tileset dropdown became the picker

## Build notes

- **The control:** `CardGrid` in the control kit (`controls.tsx`, with
  `gridStep`): ←→ move along (into the next or previous row), ↑↓ a column
  up or down, Home/End; it stops at the ends (no wrap). The cards and
  their short names are `TILESET_CARDS` in `src/map/tilesets.ts`; the full
  name ("Shimrod Spring") is each card's accessible
  name and tooltip.
- **Previews** are 8 PNGs, 4–19 KB each (about 120 KB in all, the
  photographic Shimrod sets the largest). The Settings popup renders every
  page, so it loads them when it opens. The e2e tile tracker ignores
  `tilesets/previews/`, and the catalogue test skips that folder.
- **Names in the gear popup:** at five columns the cards are narrower, and
  Chromium on Linux rounds DejaVu's advances up to whole pixels, which cut
  "Gefe & Rik" and "Gray's Map". The name's size is
  `min(0.846em, 15cqi)` (container units on the card) with unhinted
  advances (`text-rendering: geometricPrecision`); an e2e checks every name
  is whole in both popups.
- **Focus ring** is offset 1 px outside the card so it shows on the chosen
  card's `--sf-hot` border.
- **Measured** (default font, 13 px popup font, Chromium/Firefox): page
  content incl. padding Appearance 537.6 px, Mapper 483.9 px, Weather
  453/440, Text input 141; popup 599 px, unchanged.

## Test guide

Dev server (`npm run dev`, http://localhost:5173/) on the branch
`stage-36-tileset-picker`.

1. **Settings → Mapper:** open Settings from the menu bar, Mapper tab.
   Tileset is last, five previews per row. Compare the popup's height with
   the Appearance tab: it should not change when you switch tabs.
2. **Choose:** click a few sets and watch the map change. Gefe & Rik and
   Gray's Map switch the background to White; going back restores yours.
3. **Shimrod:** the first card shows the four seasons; the one lit is the
   season MUME is in now (the credit line says "now <Season>").
4. **Keys:** Tab to the grid, arrows move and choose.
5. **Gear popup:** the map pane's gear shows the same picker.
6. **Paper:** switch to the Paper background and look at the cards.

Feedback wanted: are the previews big and clear enough? Does the Shimrod
card read as "follows the seasons"? Anything about the order?

## Owner feedback

2026-11-04, round 1: "Default" should be called MMapper, since the
new-player default is Shimrod (alternating). Done: the card and the
choice's name (Options → Mapper too) are "MMapper"; the id stays
`default`.

2026-11-04, round 2: "Ser bra ut. Låt oss publicera." Approved and
released in 0.2.3.
