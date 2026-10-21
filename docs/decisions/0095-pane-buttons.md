# 0095 — Pane hover buttons and the clear background

- Status: Accepted
- Date: 2026-10-22
- Extends: ADR 0084 (script pane cross and hover outline), ADR 0087 (pane
  name tag), ADR 0091 (weather effects, "Frames"), ADR 0053 (script panes)

## Context

Changing a pane's look meant Options → Panes → Appearance: a grid of
tints and a Border column, far from the pane. And every pane had the
same background, frosted glass (the tint, blurred over the weather when it
is on); there was no way to see the weather or the game text behind a
pane sharp. The owner asked (stage 29) for the controls on the pane
itself, beside the close cross, and for a choice between glass and a
fully transparent background.

## Decision

**Setting.** `PaneSettings.glass: boolean`, default `true` (the look
before this ADR). The migration fills `true` for stored entries without
it, built-in and script panes alike; `SCRIPT_PANE_DEFAULTS` has it. The
Options grid (`gridToggle`) keeps it.

**Clear** (`glass` off), the pane element marked `data-clear` from
`applyPaneTheme` (every relayout, with the other pane tokens):

- No fill inside the pane and no blur, weather on or off: the pane's own
  background, the floating pane's opaque `--term-bg` ring and the frame
  fill (`.wc-pane-frame::before`) are gone (layout.css).
- A frame keeps its rim and nameplate: the tint's glass, but never
  blurred (weather.css: the rim's blur strips hidden, the denser 60 % mix
  the unblurred glass has in Firefox). A borderless pane has no
  background at all, nor a box behind its cross and buttons.
- With weather on, the worker paints no tint under the back layer for
  it: `--pane-bg` of a clear pane is the page's, so `measureGeometry`
  reports no own background.
- A clear float cuts no holes (`floatHoles`): what lies under it, the
  game text and the panes it covers, shows through it. That is what
  clear means; a glass float keeps covering what is under it.
- The content's colours follow the page: `paneContentBg` (the page's
  background for a clear pane) drives `--pane-bg`, the shade ramp,
  `data-light`, the UI pane's ink and the map's Transparent background.
  Otherwise a dark tint's light text would sit on a light (Paper) page.
  The tint stays in `--pane-border` and so in the rim.
- The map's own background (Options → Mapper) still paints unless it is
  Transparent: it is the map's setting, not the pane's.

**Buttons.** Left of the close cross, in its row, shown on hover like it:
Colour, Border, Background from the left, then `×`. Two cells each, side
by side, ending at the cross's three cells (`--slot` 0 is next to the
cross). Colour steps the tint in the Options order and wraps (Plain → Red
→ Green → Blue → Grey → Orange → Purple → Plain); Border and Background
flip their settings (`lookPatch`, a whole entry like `togglePatch`).
Tooltip and aria-label name the action and the state: `Colour: Red`,
`Border: on`, `Background: glass` / `Background: clear`.

- They share the cross's colour, shadow, hover accent and rules: no box
  on a frame, the light glyph with its dark shadow (the icons get it as a
  drop shadow), the border colour toward the text on a light pane, the
  dim frame colour on a borderless one; hidden while a drag runs;
  hidden with the cross on a `cross = false` script pane.
- No focus, no drag: a press on one is kept from the focus and from the
  grip and soft grip like a press on the cross; the input gets the focus
  back after the click.
- None on a phone (no cross there, ADR 0075) and none on temporary script
  panes (no settings to change).
- A pane too narrow for all three beside its nameplate (or a borderless
  pane's name tag, ADR 0087) drops them from the left, Colour first, so
  the ones that stay keep their places; half a cell stays free after the
  title. The cross always stays.

**Icons.** Small inline SVG (and one CSS shape) in `currentColor`, not
font glyphs: the user picks among fifteen fonts and their coverage and
weights differ. About the cross glyph's size (0.66 em of the cross's font
size), set where the cross's ink sits. Each shows its state:

- Colour: a small colour wheel at fixed, low chroma (no hue shouts),
  round a dot in the pane's own tint (Plain: neutral grey), a hairline gap
  between. Dimmed like the cross; full on hover. A conic gradient, so CSS.
- Border: an outlined rounded square, the frame; dimmed when off.
- Background: the same square's inverse, filled. Glass: frosted (the ink
  at 72 %) with a sheen cut across its corner. Clear: a two-by-two
  checkerboard, the usual sign for transparency.

The SVGs use no ids: they repeat in every pane, and a mask or clip by id
resolves to the first copy, which is hidden while its pane is not
hovered.

Options → Panes → Appearance stays: until a fixed menu exists, it is the
only built-in way to show a hidden pane.

## Consequences

- The last ten cells of a pane's top row are covered while the pointer is
  over it (was four). The script manual says so; `cross = false` panes
  are unaffected.
- A clear float over the game text mixes both texts; that is the
  player's choice, one click away from glass.
- Recordings (VIEW records) made before this ADR carry no `glass`; the
  store's migration makes their panes glass, as they were.
