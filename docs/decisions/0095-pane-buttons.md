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

## Addendum: round 1 (2026-10-22)

Owner feedback on 0.1.72.

**A clear float hides the game text.** Showing the game text through a
clear float mixed two texts; the owner wants everything else behind it
(the weather, or the page with weather off, and docked panes) but not the
game text. A clear float now cuts a hole in the game pane and the input
line at its box, weather on or off, and in nothing else.

- The holes moved from the weather chunk to `src/layout/float-holes.ts`,
  owned by the cockpit: `sync()` after every relayout, before it is
  painted (it was the weather's `floatHoles`, run from the relayout hook).
  The weather calls `Cockpit.syncHoles` (via `WeatherHost.syncHoles`) when
  it marks or unmarks the cockpit `data-weather`, which changes the holes,
  and before it measures. `holeClip` and `cutRects` moved with it
  (re-exported from `weather/geometry.ts`).
- Weather on, a glass float works as before (see-through, holes in the
  game, the input, docked panes and floats below). Weather off, a glass
  float is opaque and cuts nothing, as before. Floats are see-through
  (`data-weather-see`) only while the weather runs: before the worker's
  first frame they were marked already, now with `data-weather`.

**Borderless title bar.** Hovering a borderless pane (one with a cross)
turns its top row into a title bar: `::before` over the row, under its
text, in `--pane-bar`. The cross moves to the right edge (the last three
cells; a borderless float gives its top-right resize corner to it), the
buttons follow it (`CROSS_CELLS_BORDERLESS`), and the name tag (ADR 0087)
moves from the centre to the left. The cross, the buttons and the tag
have the bar's colour as their box, so the row's text does not show
through them, and the pane's label shade as ink (the frame colour they
had nearly vanished on the bar). The drop rule measures from the left
tag's end. Framed panes do not change.

`--pane-bar` (`paneBar`, theme/color.ts) is opaque, glass or clear: the
tint background one hover-outline step lighter (`paneOutline`; darker on
a light background). The tint fill itself would not read as a bar: it is
the pane's own background with weather off, and close to black on a black
page. Plain is therefore the hover outline's colour, so bar and outline
make one tab. A clear tinted pane on a light page has dark text (it
follows the page), so its bar is the tint's hue, light (L 84), not the
dark fill.

**Borderless glass.** With weather on a borderless glass pane had no
glass: the pane was see-through and the worker painted its tint under the
back layer, sharp. It now gets the glass a frame has inside it, on the
pane element itself: its colour at 55 % over a 2.5 px blur; 64 % without
blur in Firefox (`data-weather-flat`) and while a float lies over it
(`data-weather-under`). A see-through borderless float gets the same.
Weather off it keeps the opaque fill; clear stays clear. The map with its
own opaque background (Options → Mapper) is left out: its canvas covers
the pane, so the blur would cost and show nothing.

**Top-row cells.** On a borderless pane the cross and the buttons now
cover the last nine cells of the top row (was ten, one cell in); the key
manager's `?` moves to width-10, one empty cell before them. The script
manual says so. The Timers `+` is covered on a borderless Timers pane;
the owner accepts that for now.

## Addendum: round 2 (2026-10-22)

Owner feedback on 0.1.73: rain should fall inside a clear floating pane.
The coordinator extended it to clear docked panes: clear means fully
see-through.

What kept the weather off a pane was its place in the worker's scene,
`Env.panes`: the framed panes, treated as glass. Rain and snow stop on
their tops (splashes, beads, drips from the eaves) and respawn under
them, fog wisps lie along their tops, the sun casts their shadow wedges,
beams and glints light their rims. Inside a framed float nothing fell,
because its top caught it. A borderless pane was already out of the scene
(owner item 53). Darkness, the left band, the sky and lightning are drawn
over the whole back layer and were never kept off panes; a clear pane has
no fill (round 0), so they show through it already.

- `PaneGeom.clear` (from `data-clear`, `measureGeometry`), compared in
  `geometryDiff`, so a switch posts a new geometry with the next layout.
- The worker's scene is `scenePanes`: framed and not clear. A clear pane,
  framed or not, docked or floating, is out of it: rain and snow fall
  through it, no fog along its top, no shadow, no glints or beams on its
  rim (its rim stays, unlit by the weather). It stays in `textPanes`, so
  the floating letters and the blood still keep off its text.
- A geometry that changes which panes are in the scene (glass ↔ clear, a
  frame on or off, a pane shown or hidden: a click, not a drag) rebuilds
  the modules at once instead of after `RESIZE_SETTLE_MS`, so the change
  shows from the next frame. A float that moves keeps the settle as
  before (one rebuild once the drag is still).
- Cost: nothing per frame. The modules loop over fewer panes when some are
  clear; a switch costs one module rebuild (as a pane toggle did after the
  settle). Measured in Chromium (heavy rain, day sky, 1280 × 860): average
  frame 4.6 ms with the panes clear and 4.5 ms with them glass, the sky
  module dominant either way; 30 fps cadence (p50 gap 33.3 ms) in both.
- `Weather.geometry()` returns the geometry last posted (tests read it).
