# Stage 40 — Lantern pane look ("Lykta")

Status: **In progress** (started 2026-11-05).

## Goal

Every pane gets the "Lykta" (lantern) look the owner chose on 2026-11-05:
a thin band of dark tinted iron with riveted corner brackets, a small
centred iron hood holding the title (lit from behind), and a window lit
from within by the pane's colour. Group and Timers get frosted-glass cards
and glossy tube bars, so frame and content read as one object. The light
background (Paper) gets its own counterpart in the same stage. ADR 0123.

Research, mockups and owner decisions:
`notes/research/pane-lantern-mockups/README.md` (read it first). The
reference for the look is `round3-src/variants/17.css` with the shots
`s17*.png`; the mockup is throwaway CSS over a simplified DOM and is never
copied as is.

## Owner decisions (2026-11-05)

1. All panes (the frame for every pane; content styling where it applies).
2. Title centred.
3. Outer glow kept, but within the gap between panes.
4. Light background (Paper) in the same stage.
5. Build thoroughly and carefully.

No settings change: the look replaces today's glass rim and nameplate for
every framed pane. Border on/off, Colour and Background glass/clear
(ADR 0095) keep working and must look finished in every combination.

## Parts

- **40a Frame** (dark): geometry (centred hood, band thickness), iron band
  with corner brackets and rivets, the hood and its title (bundled
  Cinzel), the lamp-lit window, the outer glow in the gap, borderless and
  clear panes, floating panes, weather on/off (Chromium and Firefox
  flat), the hover buttons, the weather worker's rim and plate model.
- **40b Content**: Group and Timers in frosted cards and tube bars; the
  other panes (Character, Comm, UI, Statistics, map, script panes) meet
  the lit window and stay readable.
- **40c Paper**: the light-side counterpart of the lamp, iron and cards.
- **40d** Performance, e2e, docs (ADR 0123, Inv pointers, manual), test
  guide.

## Tasks

- [x] 40a: ADR 0123 (frame model, tokens, geometry, cost)
- [x] 40a: `frame.ts`: centred hood (`framePlate`), band thickness; unit
      tests at DPR 1, 1.25, 1.5, 2; the hover buttons keep clear of the
      hood (`titleEnd`)
- [x] 40a: bundled Cinzel (bold, Latin subset, OFL; licence in
      `public/fonts/`), also in the HTML replay export if panes show there
- [x] 40a: iron band, brackets, rivets, hood, lit title; lamp tokens per
      tint (Plain/Grey: candle light); lamp-lit window and vignette; outer
      glow in the gap
- [x] 40a: borderless (window light and cards stay), clear (edge glow, no
      fill), floating (opaque ring), weather on/off and Firefox flat, map
      pane, script panes; the weather worker's glints and snow on the new
      band and hood
- [x] 40b: Group: fight zone, member rows as frosted cards; tube bars;
      the NPC hatched bars, away dimming, statuses unchanged in function
- [x] 40b: Timers: chips as frosted glass with the group colour edge,
      header lines, ending-soon red time, untimed dashed, charm; bars and
      circles, flow and grid
- [x] 40b: Character, Comm, UI, Statistics, map, script panes checked in
      the lit window; adjustments where text loses contrast
- [x] 40a+: hood moves left on narrow panes, buttons over the hood when
      they still do not fit (owner feedback 2026-11-05)
- [ ] 40c: Paper design (lamp, iron, cards on a light page), built; every
      tint, border on/off, clear
- [ ] 40d: performance: many panes, weather on, floats; frame times vs
      main in Chromium and Firefox
- [ ] 40d: e2e updated (frame geometry, title centred, states), unit
      tests, docs, Inv §2.1 / §10.4 pointers to ADR 0123, manual
- [ ] 40d: test guide, progress.md

## Notes (40a)

Built 2026-11-05; the numbers are in ADR 0123 "Built (stage 40a)".

- Screenshots (`img/`): `40a-plain-chromium-1x.png`,
  `40a-plain-chromium-2x.png`, `40a-red-chromium-2x.png`,
  `40a-blue-grey-green-chromium-2x.png` (Timers blue, Group grey, Comm
  green), `40a-border-off-chromium-2x.png` (Timers blue, Group red),
  `40a-clear-weather-chromium-2x.png` (snow at night; Timers red, Group
  blue), `40a-float-chromium-2x.png`, `40a-map-chromium-2x.png`,
  `40a-weather-firefox-2x.png` (Firefox flat glass),
  `40a-hover-buttons-chromium-2x.png` (≈ 24-cell panes: Border, Background
  and the cross), `40a-hover-map-chromium-2x.png` (the 30-cell Map: all four).
- Cost: no backdrop filter on the band any more; rough numbers in the ADR.
- Open: the hover buttons drop sooner with the title centred (ADR);
  Paper (light) panes are only kept legible (dark iron on the page, a
  softer vignette) until 40c; the frosted card tokens are defined but not
  used yet (40b).

## Notes (40a+)

Built 2026-11-05 after the owner's feedback on the hover buttons; the rule
and numbers are in ADR 0123 "Hood position and hover buttons".

- The hood is centred when the hover set fits right of it, else moved
  left just enough, down to the fourth cell; the new-player layout's
  25-cell Timers and Group now keep all four buttons. Where the set still
  reaches the hood, it shows on an iron shelf grown out of the hood, the
  label fading before it (or whole); buttons drop only where they would
  cover the hood's left end (16 cells and less with the Gear).
- Screenshots (`img/`): `40a2-wide-chromium-2x.png` (legacy 33-cell
  lane: centred, all four), `40a2-shifted-chromium-2x.png` (new-player
  layout at 1280 px: hood moved left), `40a2-cover-chromium-2x.png`
  (1000 px, Group in 20 cells: the shelf over the hood, label fading),
  `40a2-cover-all-chromium-1x.png` (Timers in 17 cells at ratio 1: the
  label fades out whole).

## Notes (40b)

Built 2026-11-05; the numbers are in ADR 0123 "Built (stage 40b)". CSS
only (layout.css, group.css, timers.css); no change to what the panes
show or how they lay out.

- Lamp: Plain and Grey now give warm candle light; a tint colours the
  light but over 40 % of the candle, so a Green or Blue text pane stays
  near neutral (oklab mix, unit-tested inside sRGB).
- Group: frosted member and fight cards, glossy tube bars in a recessed
  track, the vs medallion; Timers: frosted chips with the group colour
  edge, bold mono headers over a lamp-coloured rule, a soft glow on the
  ending-soon time. Cards keep a backing on clear panes and look finished
  with the border off.
- Cost: the mockup's frost gradient and the chip fill's ramp were made
  flat after a Firefox measurement (they cost ≈ 0.3 ms per Group update
  and ≈ 2 ms per Timers tick); now within noise of 40a in both browsers.
- Screenshots (`img/`): `40b-plain-chromium-2x.png`,
  `40b-plain-chromium-1x.png`, `40b-blue-red-green-chromium-2x.png`
  (Timers blue, Group red, Comm green), `40b-border-off-chromium-2x.png`
  (blue), `40b-clear-weather-chromium-2x.png` (red, clear, day sky),
  `40b-circles-grid-chromium-2x.png` (green, circles in grid),
  `40b-oneline-chromium-2x.png` (one-line Group rows and fight strip),
  `40b-orange-firefox-2x.png`, `40b-other-panes-chromium-1x.png`
  (Character, Map, Statistics, the key manager, Comm, UI).
- Other panes: no change needed. Open: a clear Character pane over a
  bright day sky has low-contrast dim labels (the clear background's
  trait, ADR 0095); the mockup's faint-to-strong chip fill ramp is
  dropped for cost (a flat tint instead).

## Test guide

(Written when 40a–40d are built.)

## Owner feedback

- **2026-11-05, title vs hover buttons** (after 40a: centred hood left too
  little room, narrow panes dropped Colour and the Gear): "Titeln får
  flyttas vänsterut snarlikt hur den sitter idag. Skulle knapparna ibland
  ändå hamna över titeln så får de hamna ovanpå titeln. Försök lös det
  snyggt." So: centred when there is room; on a narrow pane the hood moves
  left, at most to about where today's plate sat (from the fourth cell);
  if the buttons still do not fit, they show over the hood's right part on
  hover instead of being dropped, and must look tidy there.
