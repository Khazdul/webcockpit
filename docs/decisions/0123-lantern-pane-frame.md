# 0123 — Lantern pane frame ("Lykta")

- Status: Accepted
- Date: 2026-11-05
- Related: stage 40 (`docs/stages/40-lantern-panes.md`). Replaces the look
  of ADR 0091 "Frames" and its addendum "glass rim and nameplate" (the
  cell-ring geometry and whole-device-pixel rules stay). Extends ADR 0095
  (hover buttons, clear background), ADR 0122 (Group and Timers content).
- Mockups and owner decisions: `notes/research/pane-lantern-mockups/`
  (README; the reference is `round3-src/variants/17.css`).

## Context

The owner wants frame and content to feel like one object with depth, a
softer and slightly playful look, less retro than the round-2 mockups, and
working with every pane colour, the border off and a clear background.
They chose mockup 17 "Lykta" for all panes, the title centred, the outer
glow kept within the gap between panes, and a light (Paper) counterpart
in the same stage.

## Decision

**Elements.** The pane's frame elements stay (pane.ts): `.wc-pane-rim`
is now the iron, `.wc-pane-frame::before` the window, `.wc-pane-title`
the hood's label, `svg.wc-pane-seam` the hairline edges. No new elements
per pane. The corner brackets and their rivets are background layers of
the rim (they lie in the band, which the rim's clip keeps).

**Iron, not glass.** The band and hood are opaque dark iron with a faint
hue from `--pane-border`, so the rim's backdrop blur is gone: the four
`.wc-pane-blur` strips and `frameStrips` are removed (with weather on that
was four backdrop filters per framed pane).

**Geometry.** The cell ring, the insets and the whole-device-pixel rules
of `frameGeometry` stay. The band is thinner (≈ 5 px at the default cell,
a fraction of the cell height in whole device px; the exact divisor is
tuned on screenshots). The plate becomes the hood: centred on the frame
box, from the frame's top edge down to today's plate bottom, rounded
lower corners, little or no fillet. Its width is the label's measured
width (the title is no longer mono: measured once per label and font
size, cached; the mono estimate until the font has loaded) plus room for
a rivet each side. `framePlate` keeps its contract (`x0, x1, y0, y1, r`),
so the hole path, the weather worker's rim and plate model and the hover
buttons' `titleEnd` follow without new protocol. On a pane too narrow for
the hood and the hover buttons, the buttons drop as today (ADR 0095).

**Title.** Cinzel Bold, bundled (OFL, Latin subset, served by us), in the
lamp colour with a soft glow, as if lit from behind through the hood.

**Tokens** (layout.css, on every pane, derived from `--pane-border` and
`--pane-bg` in CSS; relative `oklch(from …)` is already used by the glass
rim, so no new browser requirement):

- `--lamp`: the tint's hue mixed with a warm candle white; Plain and Grey
  (chroma ≈ 0) give candle light. Chroma capped inside sRGB.
- `--iron`, `--iron-hi`, `--iron-lo`: dark iron at low chroma in the hue.
- `--frost`, `--frost2`, `--frost-edge`: the lamp at low alpha, for cards.
- `--card-back`: transparent, or some `--pane-fill` on a clear pane.

**Window.** The fill is the pane colour with two lamp gradients over it
(a hot spot under the hood, a wide fall-off) and an inset shadow as a
vignette. With weather on it keeps today's glass (55 % over a 2.5 px blur,
64 % without blur) with the lamp over it.

**Glow.** A lamp-coloured shadow round the frame box. The pane's box
clips it (`overflow: hidden`, `contain: strict`), so it never reaches
past the pane's own inset: it stays in the gap and never paints on a
neighbour.

**States.**

- Borderless: no iron, hood, brackets or glow; the window light and
  vignette stay on the pane's own background, so the content still reads
  as a lantern.
- Clear: no fill; the lamp shows as an inner edge glow; cards get
  `--card-back` so text stays readable over the sky and the game text.
- Floating: the ring outside the band stays opaque (`--term-bg`).
- Paper (`data-light`): its own counterpart, decided in 40c and added
  here as an addendum.

**Cost.** Everything new is static paint (gradients, shadows), repainted
only when a pane is placed or its theme changes; nothing animates and no
backdrop filter is added. Stage 40d measures frame times against main.

## Consequences

- Every pane changes look at once; there is no option for the old glass.
- The e2e tests that measure the plate's position and the glass colours
  change with it.
- The weather worker's rim lights, glints and snow land on iron instead
  of glass; they are checked on screenshots and tuned if they look wrong.

## Built (stage 40a, 2026-11-05)

Dark backgrounds; Paper is 40c. The numbers as built:

- **Band**: `frameThickness` = cell height / 3.6 (`BAND_DIV`) in whole
  device px, at least 3: 5 px at the default 19 px cell (and at 17),
  4 at 14, 8 at 28; 11 device px (5.5 px) at 19 and ratio 2. The inset
  (`frameInset`, ≈ 2 px) and the snapping are unchanged. Outer corner
  radius `RIM_R` 3 (was 4; the worker follows it).
- **Brackets**: `--frame-arm` = 2.6 bands (`BRACKET`), whole device px
  (13 px at a 5 px band): a square of `--iron-hi` → 65 % iron-hi in each
  corner of the rim's background with a dark hairline where it ends; the
  rim's clip leaves the L in the band. A rivet (lamp-lit centre, iron-lo
  ring) one band across in each corner.
- **Hood** (`framePlate`, contract kept, `y0` now 0): centred on the frame
  box to the device px (the width made even), from the frame's top edge
  to the old plate bottom (8/9 of the top row less 1 px); width = the
  label's measured width + 1.4 cells (`HOOD_PAD`) each side, rounded up
  to whole device px; lower corners `HOOD_R` 6 px (at most its depth
  below the band less a device px); no fillets (`frameHolePath`,
  `frameSeams` and the worker's `plateRects` lost theirs). Room
  (`hoodRoom`): the frame width less a bracket arm and a cell each side
  and the padding; a longer label is shortened with `…` (`fitTitle`, at
  least two letters), else no hood (and no title). Two recessed rivets
  (`max(3 px, 0.34 cell)`) 0.62 cells in from its sides; a dark hairline
  outline, a lit bottom lip, a soft drop shadow (`0 2px 5px` at 50 %),
  clipped at the frame's top edge.
- **Title**: Cinzel Bold (bundled, `Cinzel-Bold-latin.woff2`, OFL;
  `TITLE_FACE` in `src/theme/fonts.ts`, also embedded in the HTML replay),
  `--title-px` = cell height × 0.62 to the quarter px (11.75 px at 19),
  letter spacing 0.08 em, colour `--lamp` 75 % + white, glow `0 0 4px`
  lamp 85 % and `0 0 10px` lamp 45 %. Measured with a canvas
  `measureText` per (size, label), cached (`src/panes/title-font.ts`);
  until the face has loaded an estimate of 0.66 em per letter plus the
  tracking (the built-in labels measure 0.53–0.82, average ≈ 0.65); when
  it loads, the cockpit relayouts (`onTitleFont`).
- **Tokens** (layout.css, every pane):
  `--lamp` (as changed in 40b, below; 40a had `color-mix(in srgb,
  oklch(from --pane-border .72 min(c × 8, .12) h) 62 %, #ffd79a)`, which
  read cool grey on Plain and flooded a Green text pane);
  `--iron` L .25 C min(c × 3, .03),
  `--iron-hi` L .42 C min(c × 3, .035), `--iron-lo` L .14 C min(c × 3,
  .02); `--frost2` 5 %, `--frost-edge` 24 % of the lamp (40a also had
  `--frost` 11 %, unused since 40b);
  `--card-back` transparent, on a clear pane `--pane-fill` at 62 %.
  `--pane-fill` is a new pane token (src/theme/apply.ts): the tint's own
  fill, glass or clear. All oklch shades stay inside sRGB for every tint
  on every preset (tests/unit/frame-colors.test.ts).
- **Window** (`.wc-pane-frame::before`, now the hole's own box, inset by
  the band, clipped by `--frame-window`): a hot spot `radial-gradient(38 %
  × 2.6 cells at the top centre)` of the lamp at 16 %; a fall-off
  `radial-gradient(120 % 80 % at 50 % 28 %)` 19 % → 6 % at 55 % → 0 at
  88 %; over `--window-base` (the pane colour; with weather the old glass,
  55 % with `--window-blur: blur(2.5px) saturate(1.25)`, 64 % and no blur
  in Firefox flat and under a float). A lamp hairline at 10 % on its edge
  and the vignette `inset 0 0 1.3 cells rgb(0 0 0 / .55)` (`--vignette`;
  .12 on a light pane until 40c).
- **Glow**: `.wc-pane-frame` `box-shadow: 0 0 4px 1px` lamp 26 % (clear:
  `0 0 5px 1px` at 36 %), radius 3 px. The pane's box clips it to the
  ≈ 2 px inset ring.
- **Borderless**: rim and hood hidden; the window covers the whole pane
  with the two lamp gradients (no fill of its own: the pane's background,
  or its weather glass) and a vignette of one cell at 82 % of
  `--vignette`; no glow, no blur on the window. Clear and borderless:
  nothing.
- **Clear**: the window has no fill and no blur; `inset 0 0 0 hair` lamp
  22 % and `inset 0 0 1 cell` lamp 24 %.
- **Removed**: `.wc-pane-blur` and its four strips, `frameStrips`,
  `frameLabel`, `LABEL_COL`, `PLATE_PAD`, `PLATE_R`, `PLATE_LIP` and the
  glass tokens (`--glass`, `--glass-hi`, `--ink`, `--glass-mix`,
  `--glass-edge`, `--glass-seam`).
- **Weather worker**: no protocol change. The band (`border` = the new
  thickness) and the hood (`plate`) arrive as before; `plateRects` drops
  the fillets, so glints, the sun's lift and the lightning light the band
  and the hood's shape; the snow dusting lies on the top band. Checked on
  screenshots (snow, a strike).
- **Hover buttons**: `titleEnd` is the hood's right edge. With the title
  centred they had less room than beside the left-hand plate, and the
  half-cell gap `lookButtonsFit` kept from the plate cost the default Map
  pane (30 cells at a 1280 px window) its Gear by two pixels; the hood
  has its own padding and outline and each button's two cells their own
  air, so the cockpit now passes no gap (`lookButtonsFit(…, gap)`). In the
  legacy 33-cell lane every pane keeps all its buttons; in the new-player
  layout's half-width Timers and Group (≈ 24 cells) Colour and the Gear
  drop on hover, Border and Background stay. Narrower panes drop more, as
  before. A trade-off of the centred title, for the owner to judge.
- **Cost** (rough, headless at ratio 1, six framed panes with rain at
  night, one float; 10 s of rAF): Chromium (software compositing) ran at
  ≈ 14 fps on main and ≈ 30 fps (the weather's cap) on this branch, the
  four backdrop-blur strips per framed pane being gone; main-thread task
  time ≈ 1 % of the time either way. Firefox (no blur there before
  either): 60 fps on both. Stage 40d measures properly.

## Built (stage 40b, 2026-11-05)

Content in the lit window, dark backgrounds (Paper is 40c). CSS only:
group.ts and timers.ts are unchanged, so Group/Timers function, layout
logic and the stage 39 performance rules (fills by transform or `--p`,
values set in place, no layout reads on a tick) hold.

- **Lamp** (layout.css): mixed in oklab from the border, `--lamp-w` =
  min(hypot(a, b) × 60, 1); L .78, a/b = the border's hue direction × .06
  × w + the candle (C .085 at h 70: a .0291, b .0799) × (1 − .6 w). A grey
  border (Plain, Grey) gives the candle alone, warm amber
  (≈ rgb 219 174 123); a tint gives its own hue over 40 % of the candle,
  so the light is coloured but restrained (Green ≈ 177 191 135, Blue
  ≈ 175 184 201, Red ≈ 232 164 145), and blue, opposite the candle, is not
  cancelled to grey. No hue wraps (Cartesian mix). Unit tests: inside
  sRGB on every preset and tint; Plain/Grey hue 55–85°, Blue 220–290°.
  Chromium and Firefox compute the same oklab (checked).
- **Cards**: one flat colour, the lamp at 8 % over `--card-back` (hover
  13 %), a lit top edge (`inset 0 1px 0` lamp 26 %), a `--frost2` rim and
  `0 1px 2px` shadow at 45 %. The mockup's frost gradient was dropped:
  with it Firefox paid ≈ 0.3 ms per Group update and ≈ 0.5 ms per Timers
  tick (headless, ratio 2). A member card is the row's `::before`, inset
  1 px top and 2 px bottom of its cells (1 px each side on a one-line
  row), behind the content (`isolation: isolate`, z-index −1), so the
  rows keep the cell grid and the cards have 3 px of air; the name line
  sits 1 px lower (`top: 1px`, no layout).
- **Group**: the fight card and the one-line strip keep their side tints
  over the card, rim `--frost-edge`, lit edge 30 %; the vs mark is a
  medallion (dark glass, a lamp spot, Cinzel Bold 0.68 em in the lamp);
  the NPC tag and the divider take `--frost-edge`, the tag a dark backing.
  Bars: a dark recessed track (`rgb(0 0 0 / .55)`, `inset 0 1px 1px` at
  .7, a lamp lip under it) and a glossy fill (white .38 → 0 at 55 % →
  black .15 over the bar's own colour, a static `background-image`, so the
  e2e now checks "no stripes" instead of no image); the sanctuary ring's
  track is the same dark. Band-word bars stay solid (ADR 0122).
- **Timers**: chips are rounded rectangles (0.3 em) on the card colour,
  border the group colour at 45 %, lit top edge 22 %, `0 1px 2px` shadow;
  the fill is the group colour at 28 % with a hard stop at `--p` (the
  mockup's faint-to-strong ramp made Firefox redraw a real gradient per
  chip on every tick, ≈ 1.5 ms with two dozen chips). Headers: the pane's
  mono font, bold, 0.85 em, colour lamp 30 % over the text colour, box
  height kept (1.27 em = the old 1.08 pane em, so scrolling is the same),
  icon with a 2 px drop-shadow glow in the group colour (static), rule
  lamp 38 % fading out by 85 %. Ending soon: the red bold time gets a
  `0 0 5px` glow at 45 % (only those few seconds). Untimed: dashed rim
  (label colour 80 %) on `--card-back`, no shadow; charm: the lamp at
  4 %. Circles keep their look; their ring track is dark.
- **Light pane** (`data-light`, until 40c): the old track colour, no
  recess, a soft gloss and shadow, header in the text colour over the
  pane's line, no glows; tag and vs on light backings.
- **Other panes** (Character, Comm, UI, Statistics, Map, the key manager)
  checked on Plain, red, blue, green, border off, clear (and weather day):
  no change needed. Map content covers the window. A clear Character pane
  over a bright day sky has low-contrast dim labels; that is the clear
  background's (ADR 0095), not the lamp's.
- **Cost** (headless, ratio 2, Group with fight card and six members,
  Timers with 18 chips; the main-thread time of the frame after an update,
  median of 150; 40a → 40b): Firefox Group update 2.50 → 2.76 ms, fight
  update 3.86 → 3.70, the Timers tick's frame 6.9 → 7.1; Chromium Group
  2.86 → 2.86, fight 3.43 → 3.25, tick 3.0 → 3.0. Noise between runs
  ≈ ±0.3 ms.


## Hood position and hover buttons (stage 40a+, 2026-11-05)

Owner feedback after 40a: the centred hood cost narrow panes (the
new-player layout's 25-cell Timers and Group) the Gear and Colour on
hover. The owner: the title may move left, about to where the old plate
sat; if the buttons still land on the title they may lie over it, tidily.
This replaces the 40a rule "the buttons drop as today" for framed panes.

- **Position** (`framePlate(…, clearFrom)`, decided at layout time, never
  on hover): the cockpit gives each shell the cells its hover set covers
  from the right edge (`PaneShell.hoverCells`: the corner cell and the
  cross, 4, plus two per button; 0 on a phone, and none on a script pane
  made with `cross = false`). The hood is centred when its right edge then
  lies at or left of where the set begins; otherwise it moves left just
  enough (its right edge on the device px at or before the set), but its
  left edge no further left than the start of the pane's fourth cell
  (`HOOD_MIN_COL` 3, the old plate's place; also at least a bracket arm and
  a cell from the frame's edge) and never right of centre. Whole device
  px as before; width, depth and corners unchanged, so `--plate-*`, the
  hole, the seams and the weather worker follow without change. At the
  default cell, with the Gear: "Timers" is centred from 32 cells, moved
  left from 31 down to 23 (the new-player 25-cell Timers and Group keep
  all four buttons clear of it), and lies under the set below that. The
  legacy 33-cell lane stays centred.
- **Over the hood** (`hoverFit`, pane-buttons.ts): where the moved hood
  still reaches under the set, every button shows, over the hood's right
  part. Buttons drop (from the left, the Gear first) only where they
  would cover the hood's left end and rivet (`PaneShell.titleKeep`: its
  left edge plus `HOOD_PAD` cells, where the label starts): with the Gear
  at 16 cells and less. A pane too narrow for a hood has nothing to keep
  clear, as before. Borderless panes are unchanged.
- **Look** (layout.css `data-hood-cover`, `--cover-x` from
  `PaneShell.coverHood`; on hover only, hidden during a drag): an iron
  shelf (`.wc-pane-frame::after`) slides out of the hood from where the
  set begins to the right corner bracket, the hood's iron, depth, lit lip,
  outline and shadow, with no seam on its left, so the hood reads as grown
  to hold the buttons. The label fades out over 1.5 cells before it (the
  hood's own iron over the label through a mask, `.wc-pane-title::after`),
  so no letter is cut; when under two cells of label would stay clear of
  the fade (`data-hood-cover="all"`), the label fades out whole and the
  hood's left end shows only its rivet. The buttons and the cross centre
  on the shelf's depth, in line with the title (the icons lose their
  0.14 em nudge, the cross's line box is the shelf's height). At rest the
  hood and its label show whole.
- **Tests**: unit (frame.ts placement centred / moved / at the minimum /
  never right of centre at ratio 1, 1.25, 2 and two cell sizes; `hoverFit`;
  the cockpit's drop and cover marks over a range of lane widths); e2e
  `pane-buttons` (a 17-cell lane: hood at the fourth cell, all buttons on
  the shelf, centred on the hood; 14 cells: the Gear drops, the rest clear
  of the label's start).
- Screenshots: `docs/stages/img/40a2-*.png`.
- Not covered: the weather worker knows nothing of the shelf (hover only;
  glints and snow lie on the band under it); Paper (40c) restyling the
  hood must restyle the shelf and fade the same way.
