# Stage 36 — Tileset picker

Status: **In progress** (2026-11-04).

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

- [ ] `scripts/build-tileset-previews.py`: 6×6 scene per concrete set,
      default fallback per file and aliases as in `src/map/tilesets.ts`,
      144 × 144 PNGs in `public/map/tilesets/previews/`, committed
- [ ] Unit test: a preview for the default and every `TILESETS` entry
- [ ] Mapper component: new order, Tileset grid (5 × 2) with credit line,
      radio group semantics and keys, `chooseTileset` on choose
- [ ] Shimrod card: four season quadrants, the season now full, others
      dimmed
- [ ] CSS in surface tokens; check on Black and Paper
- [ ] Height: Mapper page ≤ Appearance page (e2e)
- [ ] Update e2e (`map-tilesets.spec.ts` dropdown helpers) and unit tests
      (`chrome-mapper`, `chrome-popups`)
- [ ] Screenshots of Settings → Mapper and the gear popup, reviewed
- [ ] ADR 0107 note that the Tileset dropdown became the picker

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
