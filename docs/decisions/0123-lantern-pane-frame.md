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
  `--lamp` = `color-mix(in srgb, oklch(from --pane-border .72 min(c × 8,
  .12) h) 62 %, #ffd79a)`; `--iron` L .25 C min(c × 3, .03),
  `--iron-hi` L .42 C min(c × 3, .035), `--iron-lo` L .14 C min(c × 3,
  .02); `--frost` 11 %, `--frost2` 5 %, `--frost-edge` 24 % of the lamp;
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
