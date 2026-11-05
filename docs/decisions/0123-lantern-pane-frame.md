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
