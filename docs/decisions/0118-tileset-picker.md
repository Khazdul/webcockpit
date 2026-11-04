# 0118 — Tileset picker with previews

- Status: Accepted
- Date: 2026-11-04
- Related: stage 36 (`docs/stages/36-tileset-picker.md`), mockup
  `notes/research/tileset-picker-mockup/` (approved by the owner
  2026-11-04). Amends ADR 0107 (the Mapper settings component). Builds on
  ADR 0082 and 0088 (tilesets, light sets), ADR 0116 (menu surfaces).

## Context

Settings → Mapper chose the tileset with a dropdown of nine names. A name
says little about how a set looks. The owner wants checkable previews
instead, and the settings popup must not grow: the popup takes its
tallest page's height, so a tall Mapper page would give every other tab
empty room at the bottom.

Measured on 0.2.2 at the default font (13 px popup font): Appearance
532 px of content (the tallest, popup 599 px), Weather effects 447,
Mapper 293, Text input 135.

## Decision

- **A grid of cards** replaces the Tileset dropdown in the Mapper
  component (`src/chrome/popups/mapper-settings.tsx`), so both Settings →
  Mapper and the map pane's gear popup get it. Five cards per row, two
  rows: Shimrod (alternating), Spring, Summer, Autumn, Winter; then
  MMapper, Desert, Gefe & Rik, Gray's Map. Each card is a square preview
  with a check box in its top-right corner and the name under it.
  Names: Shimrod, Spring, Summer, Autumn, Winter, MMapper, Desert,
  Gefe & Rik, Gray's Map. MMapper's set is called "MMapper", not
  "Default", everywhere (the picker, Options → Mapper): new players get
  Shimrod (alternating) since ADR 0092 (owner, 2026-11-04). Its id stays
  `default`, so saved settings are unchanged.
- **Last on the page.** Order: Show map pane, Room notes, Room info on
  hover, Hover text size, Background colour, Map file, then Tileset with
  the credit line (and "now <Season>") right of its label.
- **One choice.** The check box looks like a check box but the group is a
  radio group (`role="radiogroup"`, cards `role="radio"`, roving
  tabindex, arrows move and choose, Home/End). Choosing goes through
  `chooseTileset` as before, so light sets still switch the background.
- **The preview** is one 6×6 scene (mountains, hills, forest, brush,
  field, water, shallows, a road and a little city) drawn with the set's
  own files, falling back to the default pixmaps for a file the set
  lacks, as the renderer does. Pre-rendered at build time by
  `scripts/build-tileset-previews.py` into one small PNG per concrete set
  (`public/map/tilesets/previews/<id>.png`, 144 × 144, 24 px per room),
  committed. A unit test checks that every set in `TILESETS` and the
  default has one. The popup loads 8 images (tens of KB) instead of the
  sets' tile files.
- **Shimrod (alternating)** shows the four season previews in quadrants,
  the year clockwise from spring in the north-west; the season the family
  draws now is at full strength and the others dimmed. Drawn with the
  four season PNGs and `clip-path`, no image of its own.
- **Height rule.** The Mapper page stays no taller than the tallest other
  tab, so the popup's height does not change. With five per row the
  previews are about 72 px and the page about 495 px. An e2e test checks
  that the Mapper page's content is not taller than Appearance's.
- **Look.** Surface tokens only (ADR 0116): cards on `--sf-field`, the
  chosen card's border and check in `--sf-hot`, hover `--sf-border-hot`,
  focus ring as the other controls. Works on Paper's light card.
- **Unchanged:** Options → Mapper (the TUI page) and the Export Editor
  keep their lists.

## Consequences

- A new set needs a preview: run the script; the unit test fails until
  it is there.
- In the gear popup (403 px) the previews are about 62 px (10 px rooms).
- The dropdown's e2e helpers move to the cards.
