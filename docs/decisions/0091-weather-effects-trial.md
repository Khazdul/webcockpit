# 0091 — Weather effects (trial)

- Status: Proposed (trial on branch `weather-trial`; may be dropped)
- Date: 2026-10-16
- Changes: ADR 0010 (pane frame glyphs) for the trial

## Context

The owner wants discreet, decorative weather over the whole client, not
only the map as in MMapper. Four prototype rounds
(`notes/research/weather-world/`) settled the look and the signal
mapping. Latency of text and commands must not be affected.

## Decision

### Signal mapping (owner, rounds 3–4)

- Sky: the latest `Event.Sun` / `Event.Moon` decides: sun up → day sky;
  night with the moon up → moonlit sky with a big moon in the almanac's
  phase that rises, crosses and sets; otherwise a starry night with
  shooting stars. `light` matters only as `o`, which overrides with the
  darkness sky (dark, slight red). (Changed 2026-10-17: only a room with
  magical darkness, from its room text; see "Sky, moon, darkness, glints".
  Changed again 2026-10-17, owner feedback 26: no darkness sky at all, only
  the `Event.Darkness` bleed and lift; see "Sky timing, darkness, left
  edge".)
- `weather`: ` ` nothing; `~` few large distant clouds in the top ~35 %;
  `'` light rain with drips along pane edges; `"` heavier rain and more
  drips; `*` snow that falls in from above, builds up gradually, with gusts;
  `null` indoors: no sky effects.
- `fog`: `-` light, `=` dense; little at the bottom-left.
- `Event.Sun` rise/set: sun rays. `Event.Darkness` start/grow: a short red
  ominous bleed; shrink/end: a brief lightening.
- `position`: sleeping → floating z z Z; stunned → corner/edge flare with a
  short shake (no white flash); incapacitated/dying → blood spatters
  landing at once plus a red wash pulsing with a heartbeat.
- Lightning: GMCP has no thunder value (MUME `help weather`; a log on
  2026-10-16 shows `weather: "*"` in a room with lightning). Use the XML
  `<weather>` tag message instead (verify live).
- Weather, fog and light changes only apply after 3 s stable, so running
  through rooms does not flicker; values ease in.

### Latency

Rendering runs in a Web Worker on OffscreenCanvas. The main thread posts
only state changes and layout geometry; no per-frame main-thread work.
The module loads only when enabled; off = no worker, no canvases.

### Isolation

All code in `src/weather/` plus one hook point each in the app, the
layout and Options; the frame change in `src/panes/frame.ts` and CSS.
Dropping the trial = revert the branch.

### Frames

Thin equal-thickness bevelled frames drawn in the middle of the outer
frame cells, keeping the cell grid and pane sizes.

Built (stage 28 A): `.wc-pane-frame` is a CSS box, no glyph text.
`frameGeometry` (`src/panes/frame.ts`) gives the line in whole device
pixels: thickness `max(2, round(cell-h·dpr / 9))` device px (2 CSS px at
the default size), centred in the outer cells; pane.ts sets `--frame-t/x/y`
on the pane when the cell size or ratio changes. Border colours are
`--pane-border` mixed 22 % toward white (top, left) and 30 % toward black
(bottom, right) with `color-mix`. The pane's fill is the frame box; the
ring outside the line is transparent (a floating pane: the terminal
background, so game text does not show around it). The label ` Label `
sits from column 3 on a tab of the pane fill (as the old label cells), so
it stays legible when the tint differs from the page. Borderless panes are
unchanged.

**2026-10-17 (owner feedback 2):**

- Root causes. The bevel was the main "buggy" look: the dark bottom/right
  edge (`--pane-border` 30 % toward black, ~#1d1d1d) all but vanished on a
  black page, so frames looked open. With weather on, the rain's wet sheen
  (1 px rects along the top and sides) and a moving glint sprite were drawn
  over the line, and the label tab was an opaque box of the pane fill.
  "All borders disappeared" was not reproduced on a fresh server (two right
  columns, ratios 1–2, Chromium and Firefox, weather off and on): it matches
  the owner's stale dev server, which served main's `layout.css` (no border
  on `.wc-pane-frame`) with the new `pane.ts`.
- One colour: `--pane-border` 78 % mixed with white (the old lit edge) on
  all four sides. No bevel.
- No CSS border: the sides and the bottom are inset box shadows of the frame
  box, the top is two pieces (`::before`, `::after`, inset shadows too)
  either side of the label, so the label has no box behind it and the
  weather shows through the gap like the rest of the pane.
- `frameGeometry(box, cell w, cell h, dpr)` puts every edge on a whole device
  pixel of the page: the cockpit's origin (`PaneCell.ox/oy`, read once per
  relayout) plus the pane box, insets per side (`--frame-l/r/top/b`), the
  thickness `--frame-t`, the label gap `--frame-label-x/w`. Before, insets
  were whole device pixels relative to a pane at a fractional `col × cell-w`.
  Note: Playwright's emulated `deviceScaleFactor` in Chromium lays out at
  ratio 1 and scales, so lines look soft in its screenshots at 1.25/1.5
  either way; with a real scale factor (`--force-device-scale-factor`) both
  the old and the new frames are sharp in Chromium, as in Firefox.

**2026-10-17 (owner feedback 12, 14–17, 19; second test):**

- Thickness: the first thin frames' `max(2, round(cell-h·dpr / 9))` device
  px plus one CSS px (`round(dpr)` device px): 3 px at the default size
  (Hack 17, a 10 × 19 cell) and ratio 1, 4 device px at 1.25, 6 at 2.
- Look: a small glass tube, the same on all four sides: an edge band
  (`--frame-e`, a third of the line, ≥ 1 device px), a core, an edge band.
  Edges: `--pane-border` 80 % with `--term-fg`; core: 52 % with
  `--term-fg`, so the core has the most contrast with the page on every
  background (lighter on black and dark grey, darker on a light page) and
  no side fades out as the bevel's dark side did. Three inset spread box
  shadows of the frame box; no pseudo-elements.
- Gaps: the line is no longer centred in the outer cells; it is
  `frameInset = (cell-w − first line − 1.5) / 2` px in from every edge, the
  same on all four sides (still inside the outer cell ring; pane sizes, the
  content rectangle and the layout are unchanged). Measured at the default
  size, ratio 1 (Chromium and Firefox), outer edge to outer edge: beside
  each other 8 → 6 px, above each other 17 → 6 px; Firefox 1.25: 6.4 and
  6.4 (were 8 and 17.6), ratio 2: 6.5 and 6.5 (were 8 and 17).
- Title: 0.82 em, its box at the pane's top edge (the highest it can sit:
  the pane clips, and the gap above belongs to the neighbour's line), drawn
  over the unbroken top line (`z-index: 2`, also over a map that fills its
  frame), a step brighter than before (`--pane-border` 60 % with
  `--term-fg`) with a tight 1 px halo in the pane fill so the line does not
  cut the letters. With a 6 px gap there is no room for the letters above
  the line: it runs through their upper part. The label gap is gone
  everywhere (`--frame-label-w`, `PaneGeom.tab`, the snow dusting's skip).
- Close cross on a frame: no background (it was the pane fill from the line
  down, a black square over the line), the title's size, colour and halo;
  the click box stays three cells wide and a row high.
- Map: framed, its content element fills the frame up to the line's inner
  edge on every side (`MapPane.fitFrame`); the map canvas is that size
  (whole device px), not `cols × cell`. The title lies over its top edge.
- Rectangle behind the title at sunrise/sunset (item 19), seen in
  before/after shots: two edges met in the empty label gap. The sky's ray
  glint along each pane's top (`drawRaysFront`: a 5 px rect at alpha
  0.16·a and a 1.2 px rect at 0.6·a over the whole frame width, on the
  front layer) ran on through the gap as a lit band under the dim title,
  and the rays are weaker inside the frame box than outside it
  (`drawRaysBack` cuts each pane's shadow from the frame box), a step in
  brightness that the line hides everywhere but in the gap. With the line
  unbroken under the title both lie on the line. The glint itself (and that
  it is on the front layer, over the title) is left to the sky rework.

**2026-10-17, later (owner feedback 16 redone: the line winds under the title):**

- "The border winds under the title": the top line no longer runs through
  the title. Before the title it steps down, runs under the letters and
  steps back up after them (the notch, `frameNotch`): the left step's
  notch-side edge at the fourth cell, the right one after the label's
  width at 0.82 em, the floor's lower edge on the first content row's top
  (so it stays in the top cell row and covers no content; at the default
  size the top line is at 3–6 px, the floor at 16–19 px), all on whole
  device pixels. No notch without a title or when the cell is too small.
- The line is now an SVG path through the middle of the line
  (`svg.wc-pane-line` in the frame box, `framePath`): an edge stroke
  `--frame-t` wide under a core stroke `--frame-t − 2·--frame-e` wide, mitred
  bends, so every bend, the notch's included, shows the same three bands
  with square corners. The inset box shadows are gone. The fill moved to
  `.wc-pane-frame::before`, clipped (`--notch-clip`) to leave the notch
  above its floor clear, so the title is on the page/pane background.
- Title: 0.82 em, line box ending 1 px above the floor; no halo. Close cross
  on a frame: the same size, just under the top line in the top-right
  corner, no background.
- Map: its content (flush with the line) is clipped around the notch and
  its steps, so the title reads on the page background.
- Engine: `PaneGeom.notch {x, w, depth}` (optional): the steps are
  `[x, x + border]` and `[x + w − border, x + w]`, the floor
  `[y + depth, y + depth + border]`; between the steps above the floor
  there is no line. Passed to the modules as `Pane.notch`; nothing draws
  with it yet (the glints are the sky rework's).

**2026-10-17, third test (owner feedback 32: the notch is out, a title gap):**

- The notch is replaced by a gap in the top line (`frameGap`, `--gap-x0/x1`
  in frame-box px): the line ends from the middle of the label's leading
  space to the middle of its trailing one (at 0.82 em), both ends on whole
  device pixels, at least two line widths clear of the corners. The SVG
  path is open, from the gap's right end round the frame to its left end;
  butt caps give square ends, and the core stroke stops one edge band short,
  so each end is closed by the edge band as the bends are. `frameNotch`,
  `notchClip`, `--notch-*`/`--notch-clip` and the map's clip are gone.
- Title: 0.82 em, no box, centred in the gap (Chromium rounds the glyph
  advances to whole px, so a title placed from the fourth cell ended up to
  2 px off centre) and across the line: its line box centred on the line,
  but not above the pane's top edge (the pane clips; centred exactly, the
  dot of an i and the ascenders were cut in Chromium). At the default size
  the line runs through the upper part of the capitals.
- Fill: `.wc-pane-frame::before` (and a float's `.wc-weather-float`, the
  engine's tint fill) starts at the line's inner edge, so the gap shows
  what is behind the pane, the same as the ring outside the line; a tinted
  pane has no strip of tint in the gap. The map fills its frame up to the
  line again, unclipped; the title lies over its top edge.
- Engine: `PaneGeom.gap {x, w}` (screen px, widened to half px) replaces
  `notch`; `Pane.gap` in the modules. `Glints.line` draws a top-line glint
  in the pieces either side of the gap and no sparkle within 4.5 px of it;
  the lightning rim and the snow dusting skip it. Still crossing it, in
  `sky.ts` (being reworked): `drawRaysFront`'s lit top line (one rect over
  the frame width) and `drawRaysBack`'s shadow cut from the whole frame box.

**Addendum (2026-10-17, owner item 35): glass rim and nameplate.**

The owner picked mockup board 14 "Light hanging plate"
(`notes/research/frame-mockup/V14.dc.html`) with two fixes: the title sat a
little low on the plate, and the plate looked greyish beside the bluish rim.

- **Shape.** A frosted glass rim `frameThickness` = max(3, round(cell-h ·
  dpr / 3)) device px thick (6 px at the default Hack 17, 10 × 19 cell),
  `frameInset` = a fifth of a cell width (2 px; two frames 4–4.5 px apart),
  at least 1 px clear of the content cells; every edge on a whole device
  pixel of the page as before. Outer corner radius 4 px. A nameplate hangs
  from the top rim (`framePlate`): its sides 0.2 title advances outside the
  label's spaces (label from the fourth cell, as before), its bottom at 8/9
  of the top cell row (the mockup's 16 of 18 px), concave fillets and lower
  corners of radius 4 px (less on small cells), all on whole device pixels.
  The old SVG line, `frameGap`, `framePath`, `--frame-e` and `--gap-x0/x1`
  are gone; pane.ts sets `--plate-x0/x1/y0/y1/r`, `--frame-hole`,
  `--frame-hair` (one device px or more).
- **One piece of glass (fix 2).** Cause of the grey plate: in the mockup the
  plate was its own backdrop box over the pane's dark fill, so its 10 px
  blur averaged mostly the fill; the rim averaged the sky. Now rim and plate
  are one element (`.wc-pane-rim`, clipped with `path(evenodd, …)` to the
  rounded outer edge less the hole: `frameRimPath`, `frameHolePath`), placed
  before the fill in the pane, and the fill (`.wc-pane-frame::before`) is
  clipped to the hole (the inside less the plate), so the plate sees what is
  behind the pane, exactly as the rim does: same tint, same sheen, same
  blur. The map's content is clipped around the plate the same way (the
  plate covers its top-left corner, as the title did before). The worker's
  pane tint (`paneTintRects`) and a float canvas's CSS tint leave out the rim
  and the plate. Bevel: `::before` of the rim (a dark hairline edge, a
  specular hairline top/left, a soft one bottom/right); the inner seam is an
  SVG path along the hole's edge stroked twice the hairline (the clip keeps
  the inner half), dark top/left and round the plate, light on the plate's
  bottom, right and bottom.
- **Title (fix 1).** Bold, 0.68 em (≈ the mockup's 0.72 em of 15 px on an 18
  px cell, scaled to the app's 17 px font in a 19 px cell), dark ink with a
  light lip. Its box runs from the rim's outer edge to the plate's bottom,
  the label's box is trimmed to the capitals (`text-box: trim-both cap
  alphabetic`, Chromium and Firefox) and centred, lifted one device px: the
  capitals sit in the middle of the plate as seen, in any font (in the
  mockup the line box was centred on the plate below the lip, so lowercase
  bodies sat low). Checked at 1×, 2×, 3×.
- **Colour rule.** Every shade from the pane colour, `oklch(from
  --pane-border L C h)`: glass L .66, C min(c × 10, .115); highlight L .95, C
  min(c × 1.2, .018); ink L .17, C min(c × 4, .03); close cross L .94, C
  min(c × 3, .028). The mockup's caps (.14, .05, .04) were out of sRGB for
  Teal and Paper Plain (glass) and several presets (ink, cross); the caps are
  the largest that keep every pane colour on every page preset in sRGB
  (`tests/unit/frame-colors.test.ts` parses layout.css and checks). Plain
  has chroma 0 and stays neutral.
- **Density.** Rim and plate are the glass over what is behind: 52 % with
  weather on (the sky tints it, as in the mockup), 64 % with weather off on a
  dark page (52 % over flat black looked dull and the dark title lost
  contrast), 60 % on a light page either way (`:root[data-light]`, with
  softer dark edges, .42/.30 instead of .62/.45: a black hairline on Paper
  looked drawn on). The fixed lightness reads well on Paper: the coloured
  rims are pastel round the dark tinted panes, Plain is tan.
- **Weather off.** No backdrop filter anywhere (behind a pane is only the
  flat page; a float keeps its opaque terminal-background ring over the
  game text): the fill is the opaque pane colour as before, the rim the same
  colours over the page.
- **Weather on (Chromium).** Rim and plate: `blur(9px) saturate(1.35)
  brightness(1.06)`; inside: the pane colour at 55 % over `blur(2.5px)
  saturate(1.25)`, a float 72 % over 3.5 px. The rim's blur is four strip
  elements under the rim (`.wc-pane-blur > i`, `frameStrips`: the top with
  the plate, left, right, bottom), each clipped to the glass in it: a
  backdrop filter costs by the area of its box, not of what its clip leaves,
  and one box round the rim cost as much as blurring the whole inside.
- **Weather on (Firefox): no blur.** `glassBlurCheap` (support.ts, a Gecko
  UA test) sets `data-weather-flat` on the cockpit with `data-weather`: no
  blur strips, the inside at 64 % (a float 78 %), the rim at 60 %. Side by
  side it reads almost the same (the weather behind is sharp, a bit
  fainter).
- **Engine.** `PaneGeom.border` is the rim (6 px); `PaneGeom.gap` is
  replaced by `plate {x, w, y1, lip, r}` (screen px; `plateOf`). Along the
  plate and its fillets only the rim's top `lip` px (2: the dark edge and the
  specular line, above the letters) may be lit: `Glints.line` (beam, moon,
  star glints), the lightning rim band, the rays' faint top lift; no sparkle
  within 4.5 px of the plate. The snow dusting lies along the whole top now
  (the rim runs on over the plate). Checked at sunrise: the beams' glints
  land on the 6 px rims and stay subtle.
- **Measured** (`bench/weather-power.ts`, headed, owner geometry, CPU ms/s
  of all browser processes; the machine drifted ~15 % during the session, so
  the decisions rest on interleaved A/B runs, one round each, two cycles,
  heavy / sunset):

  | Firefox | heavy | sunset |
  |---|---|---|
  | before (no glass) | 680 | 889 |
  | rim strips + inside blur | ~900 (+30 %) | ~1110 (+25 %) |
  | inside blur only | ~812 (+19 %) | ~1029 (+16 %) |
  | inside blur 1 px only | 920 | 1046 |
  | no blur (chosen) | ~700 (±0) | ~873 (±0) |

  Chromium, before → chosen (rim strips + inside blur): heavy 470–478 →
  499–500, sunset 477–492 → 503–507 (+5 %). A first prototype (one rim box
  round the pane + inside blur) cost Chromium +44 % (heavy 515 → 742), the
  rim box alone 680, the inside alone 628. Latency (`bench/weather-bench.ts
  --rounds 2`, heavy scene): with the blur in Firefox, text → painted went
  from median 9 / p95 17 ms to 76 / 230 ms; with the chosen no-blur glass it
  is 9.0–9.6 / 18.4–18.5 ms (baseline re-run at the same time 9.6–9.9 /
  18.0–18.2); Chromium on 10.6–11.3 / 18.9–19.2 ms (before 9.8–11.5 /
  19.9–20.5). Calm and off are unchanged in both. `bench/results/` is not
  rewritten.
- Not changed: the weather demo's caption box still draws the old glass line
  (demo.css). (Restyled 2026-10-17, item 43: see below.)
- **2026-10-17, owner items 39–44 (fifth test).** Ink L .17 → .19 and the
  lip 70 % → 60 % of the highlight (39); glass L .66 → .59, chroma cap .115
  → .105, the largest that keeps Teal on a black page in sRGB at that
  lightness (44). The two pull against each other: the title's ink/plate
  contrast over black went 4.1 → 3.6:1 (Character), at night with weather
  on ~3.4 → ~2.9:1; darker glass would need darker ink, so the glass stops
  at .59. Plate bottom one CSS px higher (`framePlate`), the title box's
  one-device-px bottom padding dropped, so the letters do not move (40).
  Rivulets: drop centre 0.5 px outside the rim's outer edge (was 2), ending
  3 px above the frame box's bottom; corner eaves 2.2 px in (was 1.2) (41).
  Dawn/dusk (42): the plate lay in the pane's shadow wedge (from the rim's
  lower edge) and inside the beams' pane box, and the front top lift was
  limited to the lip along it. The wedge is now the convex hull less the
  plate body, filled as up to four non-overlapping convex pieces
  (`notchPieces`, vertical cuts on whole device px, so no seam and no
  concave path on the GPU canvas); the beams use three boxes per pane (the
  plate counts as outside); the lift covers the top rim and the plate body
  (the fillets are left out; the letters get the same faint lift). The demo
  caption (43) is an opaque box of `--term-bg` mixed 25 % toward #808080,
  no frame. Latency unchanged (`weather-bench --rounds 2`: Chromium on
  median 9.7–10.3 / p95 18.5–18.7 ms, Firefox on 9.1–10.0 / 18.5–18.6 ms).
- **2026-10-17, owner items 45–49 (sixth test).** Lights on the frame keep
  to the glass (45, 49): `worker/rimshape.ts` gives the lit stretch of a rim
  line as rects, the rounded outer corners (RIM_R) cut in columns one device
  px wide (rows on the sides), and the plate's glass below the rim (fillets,
  body, rounded lower corners, the shape of `frameHolePath`) the same way.
  Glints (sprite slices per rect), the rays' top lift and the lightning rim
  bands use it; a top-rim glint now lights the whole plate, not only the
  2 px lip (the letters are lit with it; still no sparkle over the title).
  Rects, not a rounded path or clip: the GPU rule above; columns meet on
  whole device px, so the additive fill has no seams. The shadow wedge's
  lower corners are arcs (three hull points each; `hull` takes any count),
  and the beams count the rounded lower corners as outside (one extra box
  per pane). The plate's drop shadow is a `::after` clipped to below the
  plate: as the title box's shadow it blurred onto the rim beside the
  plate, and a clip at the box's sides still left a device-px line at 2×
  (46). Ink L .19 → .28, lip 60 % → 42 % (47): ink/plate over black ~3.3 →
  2.6:1, over the day sky 6.2 → 4.9, on Paper 8.9 → 7.0 (Character). The
  snow dusting lies on the top rim's upper 4 px inside the corners instead
  of a 5 px band above it (48; none on borderless panes). Latency unchanged
  (`weather-bench --rounds 2`: Chromium on median 10.3–11.0 / p95
  18.5–18.9 ms, worker avg 0.9–1.0 ms; Firefox on 8.4–9.8 / 16.9–17.3 ms).
- **2026-10-17, owner items 50–51 (seventh test).** A floating pane's
  inside now has the docked glass: the pane colour at 55 % over
  `blur(2.5px) saturate(1.25)` (Firefox flat 64 %), was 72 % over 3.5 px
  (78 %). The map floats by default, so with Transparent its empty space
  read darker than the docked panes beside it (measured over the same day
  sky: map 13,23,34 vs Timers 22,38,57; after 21,38,57 vs 22,38,57, the
  same within 1–2 levels in Chromium and Firefox, Plain and Blue, Paper).
  The denser float glass was not needed: the float's own canvas, opaque in
  CSS, already hides the game text. The map draws nothing in its empty
  space (hiding its canvas leaves those pixels unchanged), so nothing in
  the map was changed (50). The bevel's lights are softer (51): the
  specular line 85 % → 58 % of the highlight (Plain over black ~215 → ~171
  grey beside the ~80 rim; Blue #ccd7e8 → #9badc4), the light seam 40 % →
  32 % (plate bottom ~155 → ~145), the dark outer edge on a dark page
  .62 → .56; glass L, highlight colour and the title's lip (42 %) are
  unchanged, so the lip stays the dimmest light. Latency unchanged
  (`weather-bench --rounds 2`: Chromium on median 10.4–10.5 / p95
  19.1–19.3 ms, worker avg 1.1 ms; Firefox on 9.5–9.7 / 17.8 ms).

### Engine (stage 28 B)

- `src/weather/`: `index.ts` (main thread, `createWeather(host)`),
  `worker/` (engine + the four ported modules), pure `director.ts`,
  `palette.ts`, `geometry.ts`, `protocol.ts`. Nothing imports it
  statically; the dev hook (`__wc.weather()`, `?weather`, dev builds only)
  is the only caller until C/D.
- Layering: the back canvas is the cockpit's first child (positioned, no
  z-index), so it paints under the game text and docked panes; the front
  canvas is `z-index: 90` (over floating panes, under drop bars, the drag
  shield and the chrome). Docked panes are opaque, so while the engine runs
  (`data-weather` on the cockpit, set on the worker's first frame) the
  docked `.wc-pane` and its `.wc-pane-frame` get `background: transparent`,
  and the worker paints each docked pane's own background, when it differs
  from the terminal's, under the back layer (`destination-over`, after the
  mask) in the frame box. The page/app background already shows through.
  Floating panes stay opaque. The label tab keeps its fill.
- Geometry is measured only on ResizeObserver / `Cockpit.onLayout` /
  window resize, posted only when `geometryDiff` says it changed (0.5 px
  tolerance). Text lines are re-sampled every 2.5 s in an idle callback
  and posted as a cheap `linesOnly` update. Pane rects are the frame box
  from `--frame-x/y/t` (stage 28 A), so drips and ledges sit on the line.
- Worker loop: `requestAnimationFrame` in the worker (timer fallback),
  capped at 60 fps; when every mix value is at rest and no module reports
  activity it idles at a 4 Hz director tick with cleared canvases. Hidden
  page: paused. A failing worker before its first frame removes the
  canvases (no effects); without worker OffscreenCanvas `createWeather`
  returns null.
- Background adaptation (`palette.ts`): luminance > 0.3 counts as light.
  On light backgrounds "light" effect colours (rain, snow, stars, bolt,
  dust, letters) keep their hue with inverted lightness, additive glows
  become `multiply` tints, the sky table is lightness-inverted at ~55 %
  alpha, fog tints become mid greys; the moon becomes a slate disc. Dark
  grey (#2a2a2e) uses the dark look.
- Real-client adjustments: the text horizon (moon set line, star field
  over the output) is at least 30 % down, since a real output is full of
  text; the moon crosses at game pace (`moonSpeed` 1, the prototype demo
  used 600 / 90); the z z Z letters use the client font stack in the
  worker, falling back to `monospace`.
- Measured (Chromium headless, 1600 × 1000, worker): heavy rain + light
  fog + moon avg 0.38 ms, p95 0.50 ms; snow + dense fog avg 0.41 ms,
  p95 0.53 ms; clear moonlit night avg 0.13 ms. Indoors with nothing
  showing: idle.

**2026-10-17 (owner feedback 2 and 3):**

- See-through floating panes. A third canvas, *mid* (`z-index: 9`, under
  `FLOAT_Z` = 10, over the game text and docked panes). Per floating pane,
  back to front, the worker fills the pane box (1 device px larger) with the
  terminal background, its frame box with the pane's own background, then
  copies the back layer's pixels there (`drawImage` of its own canvas, after
  the mask, before the docked pane backgrounds): three rect operations per
  float, no paths or clips. Main thread: each layout post carries a sequence
  number; the worker answers `painted` one frame after drawing it; only then
  `floatSee` (index.ts) sets `data-weather-see` on the floats, which drops
  their fill (weather.css). Every relayout (Cockpit.onLayout, synchronously,
  before it is painted) takes the mark off a float whose inline box changed,
  so game text never shows through a moving or resizing float; it is back
  after ~60–90 ms. Floats that overlap another float stay opaque (both): a
  see-through upper one would show the lower one's text. Without floats the
  mid canvas is hidden and 1 × 1 (a full-size one cost a 1.5 s GPU stall on
  the next page in the bench).
- Frame lines stay crisp: no wet sheen or glint along pane edges; rivulets
  run 2 px outside the side lines; the snow dusting lies on top of the top
  line and skips the label gap (`PaneGeom.tab`, from `--frame-label-*`).
  Beads still hang under the bottom line. The lightning rim light (a strike
  only) is unchanged.
- Smoother layout changes. Measured: a layout change costs the main thread
  the same with weather on and off and as on main (~5–10 ms of tasks,
  CDP; no rAF gaps or long tasks in Chromium or Firefox during a lane
  drag); `measureGeometry` takes 0.05–0.2 ms. The worker, though, rebuilt
  every module on each geometry post: 10–25 ms (sky star canvases 6–19 ms,
  rain/snow sprites 3–10 ms) and a reset of drips, splashes and rivulets,
  on every cell step of a drag. Now a pane-only change applies the canvas
  size, mask, pane fills and mid layer at once, and the modules' `resize`
  runs once the layout has been still for `RESIZE_SETTLE_MS` (250 ms); a
  canvas size change still rebuilds at once.

**2026-10-17 (owner feedback 13, 18): float canvases replace the mid layer.**

- The mid canvas could not keep two overlapping floats see-through: it lies
  under every float, so an upper see-through float showed the lower one's
  text. And a float that moved was opaque until the worker had painted its
  new place (60–90 ms, longer at the 3–12 fps rates of "Power").
- Now each shown floating pane holds its own canvas as its first child
  (`.wc-weather-float`, `floatLayers` in index.ts), the size of the pane,
  transferred to the worker (`float` / `floatGone` messages, keyed per
  element). The worker copies the back layer's pixels under the pane into
  it each frame (one `drawImage`, clipped to the canvas; no paths or clips).
  The canvas element's CSS background is the pane's old fill (terminal
  background, the tint inside the frame line), so the pane is opaque to the
  game text from the moment the canvas is in and moves with it in the same
  frame; the pane drops its own fill (`data-weather-see`) at once and keeps
  it off while it moves. Each canvas is inside its pane's stacking layer,
  so an upper float covers a lower one's text: overlapping floats stay
  see-through. A geometry post that moves or resizes a float, and a new
  float canvas, get a frame at the next animation frame whatever the rate
  (`frameNow`), so the stale weather copy lasts one frame.
- Gone: the mid canvas, the `painted` answer and the layout sequence
  number. Memory: a pane-sized canvas per float instead of a full-size one
  while any float is shown.

### Signals (stage 28 C)

- `src/weather/signals.ts` (pure) + `controller.ts` (wiring, lazy chunk).
  `Char.Vitals` weather / fog / light / position are read from the
  character model on its change event: it already merges the deltas,
  keeps absent keys and clears on a new connection or character, so the
  bridge only forwards keys whose value changed. Absent = indoors, no fog,
  standing.
- `Event.Sun` / `Event.Moon` / `Event.Darkness {what}` → `emit`. The bus
  handler checks the package's first letter before anything else.
- Almanac (`gmcp/clock.ts`, `gametime.ts`): the start state (sun up, moon
  up) and the moon phase (level / 12, always). Re-read every 30 s; sun or
  moon from the almanac applies only when the almanac's own value changes
  (a predicted rise or set), so an event in between wins until then; a
  clock sync re-applies it. An unsynced clock gives day, no moon.
- Lightning: a `text.line` with a `weather` XML span whose text is a
  flash (`streak|bolt|fork|flash of lightning`, `lightning
  flashes|strikes|…`; not "lit by", "has stopped") → `strike`. Without a
  weather span on the line, exactly `^A bright streak of lightning
  flashes\b` (the Redhorn Pass message in the owner's logs). **The
  `<weather>` tag is unverified live**: the log export drops tags; the
  owner checks it. A weather-tagged "wind coming from" line, or exactly
  `^You can feel a <word> wind coming from`, → `gust` (snow swirl).
- `__wcBench` / dev: `controller.pin(state)` holds values over the game's
  (bench, `__weather.jump`).

### Options and loading (stage 28 D)

- `settings.weather {enabled: false, sky, precipitation, lightning, fog,
  darkness, body: true}`; additive, no version bump; `migrateWeather`.
- Options → Weather effects (`options-weather.tsx`): master switch and
  the six categories, a one-line help for the highlighted row; the
  categories show dimmed while off. Phone: allowed, off by default like
  everywhere (no phone-specific rule).
- The one app hook is `installWeather` (`src/weather/hook.ts`), passed
  by the Shell into `AppOptions.weather`, so the log player and the HTML
  replay bundle never include it. It imports `controller.ts` (engine,
  bridge, CSS; worker separate) only while enabled; off destroys it.
  Main bundle: the hook, `support.ts` and the Options page only (a few
  kB); the controller chunk ~10 kB, the worker ~78 kB, loaded on demand.
- Appearance and pane colour changes call `refresh()` (theme re-read and
  geometry re-measured in the next frame).
- Unsupported browser or a worker failure: a UI-pane warning; the switch
  stays on but nothing runs until it is flipped again.

### Latency (stage 28 E)

`bench/weather-bench.ts` (`bench/results/weather.md`): off vs on, heavy
rain + dense fog + dying + moonlit night, owner geometry, alternating
rounds. The first run found Chromium's text → painted p95 at 83 ms
(off: 20 ms) and rAF gaps of 90 ms: not the main thread (idle ~4 ms/s),
but the GPU thread, where Skia's software path renderer drew stroked
paths with hundreds of subpaths (rain streaks, splashes, sparks), a path
of many rects (snow) and clips of many rects (the bolt behind text) as
full-screen masks, 60–350 ms per flush. Rule for the engine since then:
**no many-subpath paths or clips on the GPU canvases** — rect fills
(sheared or rotated per item, batched), separate convex polygons, and
sprites from big paths or blur filters drawn on CPU canvases
(`ctx2dCpu`, `willReadFrequently`) once, then as images.

Firefox draws worker OffscreenCanvas 2D on the CPU (headless: 35–120 ms
per frame at ratio 2). It does not touch the page's latency (the worker
is its own thread) but the effects stutter, so the engine checks its
frame time every 4 s while drawing and drops to ratio 1 above 12 ms.

Results (3 rounds, `bench/results/weather.md`), off → on:

- Key → send median 0.045 → 0.045 ms (Chromium), 0.040 → 0.040 ms
  (Firefox); text → painted p95 19.7 → 19.9 ms (Chromium), 19.3 → 17.4 ms
  (Firefox); no long tasks or Long Animation Frames, no rAF gaps > 50 ms.
- Chromium idle main thread: 5.6 → 38.9 ms of tasks per 5 s (the canvas
  commits and the 2.5 s line sampling), longest 2.9 ms.
- Worker frame: Chromium 1.4 ms avg / 2.3 ms p95; headless Firefox
  45 ms avg (software canvas): the page's latency is unaffected, but the
  effects themselves run at ~20 fps there. To check in the owner's Firefox.

### Power (2026-10-17, owner feedback 4 "Heat")

The owner's laptop (i7-12700H, Intel iGPU + RTX 3050 Ti, Firefox) ran
warm with the effects on. Measured with `bench/weather-power.ts`
(`bench/results/weather-power.md`): headed browsers, owner geometry, CPU
time of all browser processes per second, RAPL watts, iGPU busy share,
NVIDIA runtime-PM state. Before, Firefox used 0.8 cores for a clear day
sky and 1.1 cores in heavy rain + dense fog + moon (iGPU 50–95 % busy,
package ~20–28 W); Chromium 0.45 / 0.69 cores.

Decisions:

- **Rate by content.** `Module.fps` says how fast each module's current
  content is: `FPS_FAST` 30 while rain, snow, splashes or drips fall, for
  a stun, fresh blood and the heartbeat wash, and for rare sky events
  (shooting star, lightning-lit clouds, sun moments, darkness bleeds);
  `FPS_SLOW` 12 for the drifting sky, clouds, moon, stars, fog and the
  floating z z Z; `FPS_BURST` 60 only while a lightning strike flickers.
  The loop runs at the fastest busy module (≥ 12); between its frames it
  waits on a timer, not on every animation frame.
- **Caches.** A module slower than the loop draws into its own pair of
  cache canvases at its own rate, and the engine copies them onto the
  canvases every loop frame (`source-over` is associative, so the result
  is the same as drawing in place). A cache layer that nothing was drawn
  on is not copied (the engine wraps the cache contexts' draw calls).
- **Resolution.** The canvases are always at ratio 1 (`CANVAS_RATIO`);
  the adaptive drop is gone. On the owner's ratio-2 screen rain, stars
  and snow looked the same in side-by-side shots; it is a quarter of the
  pixels. Fog (`Module.scale` 0.5) always draws through a half-resolution
  cache: soft banks drifting at 2–13 px/s.
- **Focus.** Without window focus the loop runs at `FPS_SLOW`; a hidden
  page still pauses.
- The cloud deck rebuilds a fixed share of rows per frame, so at 12 fps
  its key frames are ~4.7 s apart instead of ~0.9 s (the drift speed is
  unchanged). Accepted; the day sky is reworked next (owner item 1) and
  should stay a cheap, mostly static image.

Results, before → after (medians of 2 rounds, ms of CPU per second over
all browser processes; 1000 = one core):

| | Chromium calm | Chromium heavy | Firefox calm | Firefox heavy |
|---|---|---|---|---|
| CPU ms/s | 452 → 183 | 691 → 491 | 800 → 298 | 1146 → 665 |
| Worker fps | 60 → 12 | 60 → 30 | 60 → 12 | 36 → 30 |
| Worker ms/frame | 0.27 → 0.40 | 1.50 → 1.35 | 9.4 → 16.0 | 28.2 → 17.5 |
| iGPU busy % | 52 → 40 | 69 → 45 | 94 → 36 | 53 → 48 |
| RAPL package W | 7.8 → 6.7 | 8.1 → 7.7 | 20 → 16 | 28 → 18 |

(Off: ~30 ms/s in both. RAPL is the whole machine and noisy; another
agent's browsers ran during the Chromium rounds.) Firefox calm still costs
~16 ms per frame: the day sky draws several full-screen layers in
software; at 12 fps that is 0.2 cores.

NVIDIA dGPU: watched with inotify on `/dev/nvidia*` and the runtime
status while launching the system Firefox 157 (own profile, the owner's
environment, which pins `__EGL_VENDOR_LIBRARY_FILENAMES` to Mesa) with the
effects off, on (heavy) and on `about:blank`: no Firefox process ever
opened an NVIDIA device or mapped an NVIDIA library. Every wake-up
observed was a Chromium GPU process opening `/dev/nvidiactl` at its
start (Playwright's Chromium and headless shell, from this session's and
another agent's test runs; it loads `libGLX_nvidia` while probing GPUs),
whatever the page. So the effects do not wake the dGPU in Firefox; the
heat was CPU (software canvas) and iGPU (compositing two full-screen
canvases at 60 fps). Context options were not changed: Firefox's worker
canvases already draw on the CPU, and `willReadFrequently` in Chromium
would move the raster into the worker and add a texture upload per frame.

### Sky, darkness, fog, text (2026-10-17, owner feedback 1, 5–9)

Root causes found:

- **Moon jumps (5)** — the moon path's left end (`yL`) was the first text
  line's y from the 2.5 s line sample (`buildProtect`, unclamped there,
  clamped in `resize`), the right end hung on the comm pane's box, its fade
  on the output's right edge, and the text protection map erased 72 % of
  the sky (moon included) behind each line at the sampled places. A probe
  (moon tracked in screenshots, text streaming, text hidden) showed jumps of
  600–1200 px before and none after. Also, `Event.Moon rise` after the
  almanac's predicted rise reset a moon already shown at mid-sky to the
  horizon.
- **Clouds vanish on a pane move (6)** — the settled `resize` (250 ms after
  a layout change) ran the sky's `setupDeck`, which emptied both deck
  buffers, so the clouds faded out and were rebuilt over ~10 s; the stars
  were placed inside the pane boxes, so they jumped too. Measured: the top
  third's mean brightness 51 → 33 within 0.7 s of floating a pane before,
  unchanged (52.4 → 52.3) after.
- **No darkness (7)** — `evil` required outdoors (`weather !== null`), but a
  dark room is mostly indoors or underground: MUME sends `light: "o"`
  (Char.Vitals; values `*` sun, `!` lit, `)` moon, `o` dark) and
  `weather: null` there, and the sky gave nothing. The owner's logs show
  `o` prompts in tunnels ("Limestone Tunnel" → "Darkness", `o=`) and on a
  road in a lingering magical darkness by day (`o+`, "A deep, wavering
  darkness lingers here."). The bleed only ran on `Event.Darkness`, which
  is about a darkness spell's life (start / grow / shrink / end), not about
  entering a dark room. No raw GMCP log with `Event.Darkness` exists in the
  reference logs (the Cockpit run logs keep text only), so the event's
  timing stays unverified live.
- **Line backgrounds (9)** — the sky's protection map (soft blobs at the
  sampled line boxes, `destination-out` at 0.72 and 0.88) lagged the
  scrolling text by up to 2.5 s.

Decisions:

- **Signal mapping change:** `light` `o` gives the darkness sky indoors too
  (`mix.evil` no longer needs outdoors); everything else in the sky stays
  outdoors only. The sky watches the settled `light`: becoming `o` (after the
  3 s dwell) plays the red bleed, as `Event.Darkness start` does, and the red
  sky stays while the room is dark; leaving it plays the lift. `o` is every
  dark room (caves at any hour, moonless nights outdoors), not only magical
  darkness: GMCP does not tell them apart. The darkness sky is a clearer
  dark red (top `[72,8,14]`, horizon `[92,16,18]`, alpha 0.72 on dark).
- **Day sky (1):** no cirrus streaks (gone at night too); a plain gradient
  toward a light sky blue (top `[128,170,214]`, alpha 0.44 on dark; a pale
  blue at 0.34 on paper) with a soft warm sun glow (radial, alpha 0.36, at
  80 % of the width just above the top edge; at night the same glow is a
  cool lift toward the moon). `~` and wetter still bring the cloud deck,
  now at 0.62 opacity since nothing protects the text behind it. The sky is
  drawn once into a full-resolution cached canvas when its colours move
  (two gradient fills) and copied per frame; the darkness sky's breathing
  is the copy's alpha, not a redraw.
- **Still rate:** a module whose content does not move reports
  `FPS_STILL` (3); while every busy module is still and the director rests
  (no dwell pending, every mix value at its target, `Director.resting`),
  the loop runs at 3 fps; any message brings it back to 12 at once. A still
  module draws straight on the canvases even when the loop runs faster (one
  image copy, less than copying a full-size cache). The settled day sky is
  the case.
- **Relative sky (5, 6):** stars (upper 45 %, denser toward the top), the
  moon path (rises at 86 % of the width, 60 % down; sets at 10 %, behind the
  text horizon at 30 % down) and the clouds depend only on the canvas size.
  The sky's `resize` returns at once when the size and ratio are unchanged;
  a real size change rebuilds the deck in full at once (no empty sky) at the
  same relative places. A theme change keeps the moon, the cloud drift and
  the time. `Event.Moon rise` keeps a moon already shown; the crossing takes
  800 s at game pace (was 600).
- **Fog (8):** `mix.fog` moves at a constant `FOG_RATE` = 1/40 per second
  instead of easing (tau 0.9 s): none → light, light → dense and back each
  take 20 s, none → dense 40 s; the light and dense layers are smoothsteps
  of it, so it grows and thins gradually. Switching the Fog category off
  still fades at the normal rate.
- **No text tracking (9):** the line sampling is gone (`measureLines`, the
  2.5 s idle sample, `linesOnly` posts, `Geometry.lines`, `Module.lines`).
  Its other users: the lightning bolt no longer dims behind lines (it
  paints straight, a fraction of a second), ground strikes land in the right
  38 % of the output, the z z Z and blood spatters are placed by the panes
  and the output box only.

Measured (same session, old code from a worktree of `ca52995` right after
the new, `bench/weather-power.ts --scenes off,calm --rounds 2`, headed,
owner geometry; the owner's own Firefox was running, so the absolute
numbers are high): clear day sky, CPU of all browser processes per second
Firefox 230 → 121 ms (off: ~50–75), worker 11.5 fps × 17.1 ms → 3 fps ×
7.5 ms; Chromium 148 → 72 ms (off: ~30), 12 → 3 fps. Latency
(`bench/weather-bench.ts --rounds 2`, heavy scene): unchanged, text →
painted p95 Chromium 19.1 → 19.1 ms, Firefox 18.7 off / 18.1 on; Firefox's
rAF gaps with the effects on (p95 ~33 ms) were the same with the old code
under the same load. Chromium idle main thread with the effects on: 25.5 →
16.4 ms per 5 s, longest task 2.7 → 0.6 ms (no line sampling).
`bench/results/weather.md` is not rewritten (no meaningful change).

### Sky, moon, darkness, glints (2026-10-17, owner feedback 10, 11, 20–25)

**Darkness research (10).** Sources: the owner's raw text logs
(`/home/ole/MUME/data/runs/Rasta/2026-09-25T22-03-02.log`,
`2026-09-26T21-00-45.log`; text only, no GMCP or XML), Cockpit's
`docs/gmcp.md`, `notes/research/mume-xml.md`. Findings:

- *Verified (logs):* a room with magical darkness prints "A deep,
  impenetrable darkness lingers here." (185 times; once "A deep, wavering
  darkness lingers here." at its edge, by day) right after the room name,
  before the aura, objects and exits, on every entry and `look`, in brief
  mode too. It runs over neighbouring rooms in a row (the darkness
  spreads). An ordinary dark room never prints it; one you cannot see is
  named "Darkness". The spell taking hold in the room you are in shows
  "The light decreases." after the cast words (4 times).
- *Verified:* the prompt's light cannot tell them apart: `o` both inside
  and outside the darkness at night; `!` inside it with a lantern or by a
  caster's light; `o` for caves and moonless nights.
- *Verified (docs):* no GMCP field says "magical": `Char.Vitals.light` is
  `* ! ) o`, `Room.Info` has no light; `Event.Darkness` carries only
  `{what: start|grow|shrink|end-soon|end}`, no room or zone.
- *Not seen live:* which XML tag wraps the darkness line (likely inside
  `<room>`; the log export drops tags), and `Event.Darkness` itself (only
  the synthetic fixture has it), so what exactly it announces stays open.

Decision (superseded the same day by owner feedback 26: no room-text
trigger and no red sky; see "Sky timing, darkness, left edge"): the room
text is the signal. `signals.ts` `roomLine`: the
darkness line sets `magic` at once and marks the room display; the
display's exits line (XML `exits` tag, or a line starting `Exits:`) ends
it: `magic` = whether the darkness line came. "The light decreases." also
sets it (until the next room display; *suspected* to be the spell, the
only cause seen in the logs). `WeatherState.magic` is dwelled like light
(3 s), and `mix.evil` follows it instead of `light === 'o'`: the bleed on
entering, the red sky while in darkened rooms, the lift on leaving; an
ordinary dark room gives nothing. `Event.Darkness` start/grow and
shrink/end still play the bleed and the lift on their own. Limits: a room
display without an exits line (autoexits off) keeps the last value until
the next one; the `exits` command's output, if it starts with "Exits:",
ends a display too.

**Moon (11).** `Event.Moon` and the almanac decide when it is up, day or
night. By day it is drawn from a second sprite of only the lit part
(pale, no dark side, no halo) at `DAY_MOON` 0.24 of its night strength
and does not keep the loop above the still rate (it moves ~3 px/s). One
arc for every moon: x even from 2.4 R left of the screen to 2.4 R right
of it, y = 0.8 H − (0.8 H − top) · sin(π u), so it climbs from below on
the left and sinks below on the right; low down it is fainter (behind the
text). `u` runs at 1 / 720 per second × `moonSpeed` (720 game minutes up,
one real second each). `gametime.ts` `moonUpFraction(g)` gives the
almanac's place; the bridge sends `moonU` at start and at a clock sync
only (not every 30 s re-read); a change glides (time constant 8 s), never
a jump. Without a set event it waits at u 0.97 (low at the right edge);
`moon.set` lets it go on at its own pace when u > 0.9, else hurries it off
in 8–26 s. The night sky's cool glow and the frame glints follow the night
moon only.

**Glints (20, 24).** `worker/glint.ts`: 1 px gradient sprites (along the
line) stretched over exactly the frame line (`PaneGeom` x/y/w/h and
`border`; not the label gap, which is going away), plus a 9 × 9 sparkle
of 1 px lines; the theme's additive mode. Users: the sunrise/sunset front
(the lit top and sunward side lines as on-line rect fills, no 5 px band
any more, and a glint where the ray front crosses each top and side
line), shooting stars (a glint on lines within 48 px of the head, running
on with it for 0.7 s; the stars were already on the back layer, so they
pass behind the frames), the day sun glimpse, and the moon (its old 12 px
glint sprite with a soft halo is now an on-line glint). Lightning's rim
light now reaches every framed pane (at least 0.3 strength; the bottom
line too near the bolt) and skips borderless ones.

**Mask (21).** The `left` fade (0.85 alpha at the edge over
`protect.left`, ≤ 90 px, meant to keep the first text columns clear of
the effects) is no longer drawn; `protect.left` is still measured (body
spatters keep using it).

**Day sky (22).** Day colours on dark `top [112,184,255] hor
[92,152,232] a 0.66` (was `[128,170,214] / [150,176,200] / 0.44`); on
paper `[104,168,242] / [156,198,242] / 0.44`. By day the gradient reaches
`SKY_H_DAY` 0.8 H (night 0.43 H) and keeps its strength longer at the
top; only the drawn height of the cached sky is copied. `worker/daylife.ts`:
birds (sprites of 6 flap frames, 20 px and 9 px spans, stroked once on a
CPU canvas; a flock every 90–220 s: a loose V or a lone gull crossing at
30–46 px/s, or 3–7 small far ones at 16–26 px/s fading after 24–36 s;
flapping in bursts and gliding), an insect (every 160–380 s, 3–5 s of a
darting 2 px dot), four tufts (flattened soft blobs on CPU canvases, drift
2.4 px/s left, drawn at the still rate) on a clear day, and a sun glimpse
(every 100–260 s, 12 s, six thin convex triangles with one radial gradient
from the top-right sun, a faint glint where each crosses a top line).
Rates: birds `BIRD_FPS` 10, insect and glimpse `FPS_SLOW`, glints
`FPS_FAST`; otherwise a still day sky stays at `FPS_STILL`. Dev events
`birds`, `glimpse`, `shoot` send one at once.

**Clouds (23).** Cause: a cover change of more than 0.12 set `first`,
which rebuilt the whole deck at once, so a clear → `~` walk switched in
~2 s. Now the deck's cover `coverS` moves at `COVER_RATE` 1/40 per second
(clear → `~` 24 s) and is kept while indoors. The deck has the shapes of
`coverShape` (the higher of where it goes and where it comes from), and
each pixel shows once `coverS / coverShape` passes its arrival value: a
low-frequency noise of the deck coordinates (70 %) plus a side ramp
(30 %; on the way in from the right, where the wind brings them; on the
way out the right clears first). So clouds come and go one by one; the
cloud look itself is unchanged.

**Stars (25).** The field reaches 45 % down on the left and 62 % on the
right (a smooth step from 45 % to 95 % of the width); 12 % more stars.

Measured (`bench/weather-power.ts --rounds 2`, headed, owner geometry; the
machine was busy with another agent's Playwright browsers during the
after run, so off and heavy moved too; compare within a column pair):

| CPU ms/s (worker fps; ms/frame) | Chromium | Firefox |
|---|---|---|
| off, before → after | 32 → 17 | 44 → 32 |
| calm day, before → after | 65 (3; 0.49) → 42 (3; 0.34) | 118 (3; 7.5) → 121 (3; 7.5) |
| calm day with a flock flying (new scene `birds`) | 93 (10.1; 0.27) | 199 (9.7; 6.8) |
| heavy, before → after | 481 (30; 1.27) → 346 (30; 0.97) | 886 (29; 23.5) → 636 (30; 15.8) |

A still day sky costs the same as before. While birds fly Firefox draws
~10 frames a second instead of 3 (+~80 ms/s); with a flock about a quarter
of the time that is ~+20 ms/s on average.
Latency (`bench/weather-bench.ts --rounds 2`, heavy scene, off → on):
key → send median 0.040 → 0.045 ms (Chromium), 0.040 → 0.040 ms
(Firefox); text → painted p95 20.1 → 20.1 ms (Chromium), 20.0 → 17.0 ms
(Firefox); one 1.6 s and two 0.7 s Long Animation Frames in Chromium, off
and on alike (page start-up on the busy machine). Unchanged;
`bench/results/weather.md` is not rewritten. `bench/weather-power.ts`
gained the `birds` scene.

### Sky timing, darkness, left edge (2026-10-17, owner feedback 26–31)

- **Darkness (26).** Magical darkness is a spell someone casts; the owner
  wants an effect only on its `Event.Darkness` events. Gone: `roomLine`
  and the room-text trigger, `WeatherState.magic` (and the dev pin), the
  `evil` mix key with its sky colours, cloud palette and fog/rain tints.
  `darkness.start` / `grow` play the bleed, `shrink` / `end-soon` / `end`
  the lift (sky.ts, unchanged), indoors too; the `darkness` category gates
  them.
- **In / out (27).** Causes of the choppy change: `outdoors` eased with
  tau 0.9 s (most of it in the first second), the sky selection (`sun`,
  `moon`, `dark`) was gated by it and eased on its own, and the cached sky
  baked `outdoors` into its alpha, redrawn at most every 4th frame (3 Hz at
  12 fps). Now `outdoors` moves at `OUT_RATE` 1/5 per second (5 s) and the
  sky uses a smoothstep of it; the time of day is no longer gated by it in
  the director (`quiet()` ignores sun / moon / dark; fog and rain tints
  multiply by `outdoors`); the cached sky is copied at that alpha, so the
  fade is per frame without redraws; clouds, stars, moon and day life
  multiply by the same value. Indoors (`weather` null) the sky keeps the
  last cover and wetness, so it fades back in as it went out, and the deck
  stops rebuilding rows. While the fade runs the sky asks for `FPS_FAST`;
  measured 29–30 fps during a fade (Chromium, Firefox headless), then 3 fps
  (still day sky) or idle indoors.
- **Left edge (28).** The cached day sky is erased (`destination-out`, one
  linear gradient rect) from the left edge (strength 1 × day share) to
  `LEFT_DARK` 0.34 of the width, so the page background shows at the top
  left on every background. Only when the day sky is redrawn; night
  untouched.
- **Sunrise / sunset (29).** Moments last `RISE_S` 24 s / `SET_S` 26 s
  (were 9 / 10). The director's sky selection (`sun`, `moon`, `dark`,
  `night`) moves at a constant `SKY_RATE` 1/12 per second, and after a
  clock change only once `SKY_HOLD_S` 11 s have passed, so the day sky goes
  11–23 s into a sunset (the night likewise into a sunrise); a moon rise or
  set moves at the same pace without the hold; `jump` is still instant.
  The moment's colour tints the sky less and late at sunset (k = mI ·
  (0.1 + 0.4 · smoothstep(0.3, 0.75, p))), early at sunrise, mostly at the
  horizon; the day sky keeps its depth through the moment.
- **Rays (30).** 8 rays (were 15), half-widths 0.2–0.8° (were 0.5–2.2°),
  alpha 0.3 (were 0.5 / 0.62 for the cores), the front band 0.06 (0.085).
- **Stars (31).** `STARS_H` 0.55, `STARS_H_RIGHT` 0.9; the count follows
  the mean depth (cap 520).
- **Title gap (19, 32).** `drawRaysFront` lights the top line only left and
  right of `Pane.gap`; the `drawRaysBack` shadow hulls start at the line's
  lower edge (`y + border`), so the step between the brighter rays outside
  a pane and its shadow lies under the line, not across the title.

Measured (`bench/weather-power.ts --rounds 2`, headed, owner geometry,
quieter machine than the previous run; medians, CPU ms/s with worker fps and
ms/frame): Chromium calm day 37 (3; 0.36), heavy 245 (30; 0.65); Firefox
calm 110 (3; 7.8), heavy 610 (30; 15.6); off 16–26 / 29–41. Before (same
bench, busier machine): Chromium 42 / 346, Firefox 121 / 636, so no
regression. Latency (`bench/weather-bench.ts --rounds 2`, heavy scene, off
→ on): key → send median 0.020–0.025 → 0.020 ms (Chromium), 0.040 →
0.040 ms (Firefox); text → painted p95 17.6–17.7 → 16.8 ms (Chromium),
17.2–17.5 → 17.1–17.3 ms (Firefox). Single rAF gaps of 0.4 s (on) and
2.1 s (off) in Chromium came from the busy machine (load ~13, another
agent's browsers). `bench/results/` is not rewritten.

### Demo (2026-10-17, owner feedback 33)

- **Command.** `#weather demo [slow]`, `#weather stop` (also `demo stop`):
  a WebCockpit client command, full name only (`EXACT_ONLY`, so no tt++
  abbreviation changes), left out of the manual like the other trial
  parts; `#help weather` prints one line. `App.runClient` hands it to the
  hook (`WeatherHook.command`), which imports `demo.ts` lazily, so the
  main bundle gains only the dispatch. Scripts can start it with
  `expandAlias("#weather demo")`; the pane API is not extended. Dev:
  `__weather.demo()` / `demoStop()`.
- **Script.** `demo-script.ts`: 21 steps, each a caption (title, what to
  look at, the game signal) and timed actions: pins of `WeatherState` and
  engine events, the same inputs the game gives. Only the first pin jumps;
  the others go through `pin(…, { smooth: true })`: the bridge sends them
  with `setState(…, { settle: true })`, which settles the dwelled values at
  once (no 3 s dwell) but leaves the easing, the sky's hold and the fog's
  pace alone. The release at the end is the same smooth unpin, so the
  effects ease back to the game's values. A test-only `xN` argument runs
  the wall clock N times faster (e2e).
- **Time scale.** `setSpeed(n)` (message `speed`): `Director.speed`
  multiplies the sky selection's hold and rate and the fog rate;
  `Env.speed` divides the sun moments' length and multiplies the cloud
  cover rate, the rain and snow build-up and the blood's drying. The demo
  uses 3 (`DEMO_SPEED`; sunrise 8 s, sunset 8.7 s) and `slow` 1, and sets
  it back to 1 when it ends. 1:36 in all, 2:58 slow. A new `insect` event
  sends an insect at once, like `birds` and `glimpse`.
- **Runner.** `demo.ts`: one timer to the next due action (no per-frame
  work). Effects off: it turns `weather.enabled` on and off again at the end
  (this is saved, so a reload mid-demo leaves them on). Categories: the
  engine gets all six for the demo and the user's again at the end; the
  settings are not touched. The effects being switched off, or the
  controller going away, ends it without further changes.
- **Caption box.** Main-thread DOM in the cockpit (z 95, above the front
  layer, below the drop bars), made at the start and removed at the end,
  `pointer-events: none`. The panes' glass line with the title in a gap,
  the terminal background (opaque: at 90–95 % the game text ghosted
  through), theme tokens for every colour. A few DOM writes per step; the
  fade between steps and the progress bar are CSS transitions (opacity,
  `transform: scaleX`), an exception to "no CSS animations" (ui.css) for
  this trial-only box: they run on the compositor and nothing runs while
  the demo is not.
- **`?weather` after login.** `Shell.onApp(fn)` calls back once the cockpit
  is built; `weatherFromUrl` (dev.ts) uses it, so `?weather` also applies
  when the cockpit comes from the start page's Enter MUME.

### Moon side, day sky switch, sun beams (2026-10-17, owner feedback 36–38)

- **Moon direction (38).** The game says "The moon disappears in the
  west."; the sun already rose on the right (east) and set on the left
  (west). The moon's arc (`moonPath`, `moonAt` in sky.ts, now exported and
  unit tested) runs from 2.4 R right of the screen to 2.4 R left of it,
  same sine height. `MOON_HOLD` (0.97, waiting for a late set event) is now
  just past the left edge. The cool night glow follows the moon's x but no
  further left than `LEFT_DARK` (a third of the width), so the moon setting
  low on the left does not light the top-left corner (owner feedback 28).
  Moonlight glints follow the moon's place, unchanged.
- **Day sky switch (36).** Setting `weather.daySky` (default true;
  `migrateWeather` reads it, absent = true) and `Categories.daySky`, so it
  reaches the worker with the other categories (`setCategories`, live) and
  the demo's all-on / restore covers it. It is not one of the six
  `WEATHER_CATEGORIES` (rows and migration loop): Options shows it as its
  own row under Sky, dimmed while Sky or the effects are off. In the worker
  `Sky.dayK` eases toward it (tau 0.8 s); `skyColour` gives the day share
  the colours of the rest of the sky (night, moon, grey; night alone at full
  day) at alpha `day.a · dayK`, so the cached gradient's alpha, not its
  colour, carries a day↔night change and the night fades in from the page
  background. The warm sun glow and the day depth (`skyNow[9]`) scale by
  `dayK` too. The grey wet-day sky stays: it belongs to the weather, not
  to the blue sky. While `dayK` moves the sky asks for `FPS_FAST`.
- **Sun beams and where frames glint (37).** `worker/beams.ts` (pure,
  unit tested): `sunBeams` gives three beams (offsets −0.064, 0, +0.05 rad
  from the bundle's middle; half-widths 0.0075–0.0105 rad; strengths
  0.62–1 with a slow ±12 % shimmer). The middle aims at `beamAim`, a point
  that sweeps over the moment (sunset: (0.4 W, 1.05 H) → (1.06 W, 0.3 H);
  sunrise: (−0.06 W, 0.3 H) → (0.6 W, 1.05 H)), so the beams sweep as the
  sun moves. Each beam is three convex triangles (a soft wide glow, the
  body, a thin core; alpha 0.07 / 0.16 / 0.2 × strength) with one radial
  gradient that fades only to 0.3 at 1.25 × the far corner, so the path
  stays defined across the screen. The beams are drawn after the shadow
  wedges are cut, so panes do not hide them; inside a pane box (from the
  top line's lower edge, as the wedges) they are drawn at `BEAM_INSIDE`
  0.32. That without clips: `beamPieces` cuts each triangle into convex
  pieces inside and outside the pane boxes (Sutherland–Hodgman against the
  box's four half-planes, at most ~5 pieces per box crossed), each filled
  as its own one-subpath path; additive fills of pieces that tile the
  triangle leave no seam (on paper, multiply, a faint seam is possible).
  About 9 triangle decompositions and 10–30 small fills per frame during a
  moment. `beamHits` gives where each beam's middle crosses each framed
  pane's top, bottom, left and right line (ray–line intersection), the
  beam's width on the line (2 t tan(hw) / |sin| of the crossing angle), and
  which crossing is the entry (nearest). `drawRaysFront` draws per hit two
  on-line glints (`Glints.line`, so the title's gap is skipped): a soft one
  2.2 × as long at 0.4 and a core 1.8 × the beam's width on the line
  (24–220 px) at 1.3 × strength, with a sparkle on entry; the exit is
  `BEAM_EXIT` 0.15 of it; a hit lying inside another pane gets
  `BEAM_INSIDE`. Gone: the whole lit top line and sun-side line by
  "proximity" and the glints running with the ray front; left: a faint
  lift of every top line (0.1 × strength) and the front band at 0.045
  (was 0.06). The faint rays: alpha 0.2 (was 0.3) for rays and cores.

Measured (`bench/weather-power.ts --rounds 2 --scenes off,calm,sunset`,
headed, owner geometry; new scene `sunset`: the calm day sky, then
`sun.set` sent after the settle, so the 15 s cover the first ~60 % of the
moment with the beams; before = c6dc691 with the same bench, run just
before; per-round values, CPU ms/s and worker ms/frame): Chromium sunset
441 / 268 (0.71 / 0.57) → 438 / 492 (0.87 / 0.93); Firefox sunset 644 / 653
(16.4 / 16.4) → 690 / 695 (17.8 / 17.7); calm unchanged (Chromium 64–71 →
41–57, Firefox 112–126 → 115–122). So a sunrise or sunset costs ~1.3 ms
more per frame in Firefox (+7 % CPU for its ~25 s, twice a game day) and
~0.25 ms in Chromium; Chromium's round-to-round CPU spread (another
agent's browsers were running) is larger than the change. Latency
(`bench/weather-bench.ts --rounds 2`, heavy scene, off → on): key → send
median 0.035–0.045 → 0.040–0.045 ms (Chromium), 0.060 → 0.040–0.060 ms
(Firefox); text → painted p95 17.4–17.7 → 17.9–18.1 ms (Chromium),
18.3–19.4 → 17.0–17.5 ms (Firefox); unchanged. `bench/results/` is not
rewritten.

### Sun glimpses, borderless panes (2026-10-17, owner feedback 52–53)

- **Time of day in the worker (52).** `WeatherState.sunU`: how far the sun
  is from the dawn hour (0) to the dusk hour (1) of the month (clock.ts
  `DAWN`/`DUSK`, `signals.ts sunUpFraction`); -1 at night or with the clock
  unsynced. Sent at start, on a sync (`force`), when the almanac's day/night
  flips and whenever it has moved by `SUN_U_STEP` 0.05 (~30–40 game min,
  every ~40 real s; one cheap state message), not on every 30 s re-read.
  `Event.Sun` rise/light sets 0, set/dark -1 (`eventState`), so an unsynced
  clock still gets a dawn value; unknown counts as sun height 0.6.
- **Glimpse schedule (52).** `daylife.ts planGlimpse(sunU)`, pure and
  unit tested: sun height h = sin(π·sunU); one random size q = rnd^1.4
  (small ones more often); start-to-start gap lerp(50, 22, h) + rnd ·
  lerp(10, 18, h) s, duration lerp(5, 8, h) + q · lerp(3, 8, h) s, peak
  lerp(0.35, 0.7, h) + q · lerp(0.2, 0.3, h). So: dawn/dusk hours a glimpse
  every 50–60 s (~1.1/min), 5–8 s, peak 0.35–0.55; two game hours in (h ≈
  0.5) every 36–50 s; midday every 22–40 s (~1.9/min), 8–16 s, peak 0.7–1.
  The max gap 60 s is the owner's "at least once a minute"; every duration
  is shorter than every gap. The countdown runs only while the glimpse input
  (`sun`) is above 0.4: day × (1 − wet) × (1 − cover) × fogK, so cloud
  cover ≥ ~0.6 ('~'), rain, snow, dense fog, indoors and sun moments stop
  it, light fog dims it. The blue day sky switch (36) does not: glimpses,
  like birds and tufts, belong to the day, not to the blue gradient. The
  first glimpse comes 6–20 s after start (was 30–90).
- **Look (52).** Ray alpha at the sun 0.22 dark / 0.15 light (was 0.09 /
  0.07) × the size; the radial fade holds 0.45 at 0.65 of the length (was
  0.12), reaching 0.95 H; a soft warm glow (alpha 0.08 × e, radius 0.42 H)
  at the sun. The fan is 1.9–2.65 rad (was 1.78–2.38): from the sun at
  0.8 W the steep rays fell behind the right dock's panes, which is why the
  owner hardly saw them. Glints: where a ray's middle enters a framed pane
  (its top line, or its right line if nearer), `Glints.line` (the rim's
  shape and the plate, items 45/49), alpha 0.5 × the ray's, fading to 0.4
  along the ray, a sparkle above 0.32. Sunrise/sunset rays stay ~0.25 with
  beams to 0.4, so a glimpse stays well below them. The dev/demo glimpse
  (`glimpseNow`) is peak 1, 8 s; the demo's day step pins `sunU` 0.5.
- **Rate (52).** A glimpse asks `GLIMPSE_FPS` 6 (was FPS_SLOW 12): at most
  ~3 levels of change per frame. Measured (`weather-power.ts`, new scene
  `glimpse`: the calm day, a glimpse sent after the settle, 11 s of the
  15 s window; headed, owner geometry, 2 rounds, CPU ms/s of all browser
  processes): before (12 fps) Chromium calm 75–76 / glimpse 180–185,
  Firefox 119–123 / 239–251; after (6 fps) Chromium 96–106 / 114–115,
  Firefox 150–159 / 172–184 (the calm windows now catch a natural glimpse:
  worker 4.3–5.0 fps against 3.0). Per glimpse second that is ~+50 ms/s
  in Chromium and ~+80 in Firefox over the still sky (was ~+135 / ~+155).
  Long-run, with the duty cycle (midday ~12 s per ~31 s): Chromium ~+20
  ms/s, Firefox ~+30 ms/s at midday (2–3 % of a core), ~+6 / ~+9 at the
  dawn/dusk hours; the old schedule (12 s per ~180 s at 12 fps) averaged
  ~+9 / ~+10. Accepted: the owner asked for once a minute.
- **Borderless panes are no glass (53).** The modules got every pane box
  as `env.panes`, so a pane without a frame cast the sunrise/sunset shadow
  wedge, held the beams' weaker inside pieces, stopped rain at its top
  (dripping from its bottom; in a lightning flash the lit rain stopped
  there) and grew fog wisps along its top. The engine now gives the modules
  only framed panes (`env.panes`, border > 0); `env.textPanes` keeps every
  pane for placing the floating z z Z and blood away from pane text.
  `beamHits` also skips a borderless pane as the "inside another pane"
  attenuator. The glass CSS already left borderless panes alone (no
  `.wc-pane-frame` box: display none). Measured across the top edge of a
  large borderless float (outside / inside, Chromium): sunset 26 / 13 →
  26 / 26; lightning 34 / 30 → 31 / 29; the day/night and indoor fades
  showed no step before or after, in Chromium and Firefox.
- **Not fixed (53): float presentation lag.** A floating pane hides the
  game text with its own canvas, into which the worker copies the back
  layer each frame. The browser presents each OffscreenCanvas on its own,
  and the copy sometimes appears a frame earlier or later than the back
  canvas: with a frame-parity probe (a square drawn red/green per frame in
  and out of a float, 15 screenshots in rain) 1 of 15 differed in
  Chromium, 3 of 15 in Firefox. Invisible for slow changes; during the
  flicker of a lightning flash a borderless float can flash a frame off.
  Docked panes and the game text never show it; framed glass hides most of
  it. A fix would hide the game text under floats another way (a CSS mask
  with holes on the output, which then needs the docked panes and stacked
  floats handled as well): left open for the owner.

### Plate edge, glimpse strength, frame rates (2026-10-17, owner feedback 54–56)

- **Plate's bottom edge (54).** `frameSeams` puts the plate's bottom on the
  dark seam with its sides and lower corners (one path fillet to fillet); the
  light seam is only the rim's right and bottom inner edge. The plate's bottom
  is a lower edge of the glass, like the rim's outer bottom edge. Over black
  at 2× the line under the plate went 147 → 56 grey (plate glass 104).
- **Glimpse strength (55).** Ray alpha 0.165 dark / 0.11 light (was 0.22 /
  0.15), the glow 0.06 / 0.045 (0.08 / 0.06), rim glints 0.375 × the ray's
  strength (0.5), the sparkle above 0.24 (0.32) so it comes on the same
  glimpses. Schedule unchanged. Sunrise/sunset rays and beams unchanged.
- **Cadence (56).** The loop drew a frame when `1000/rate − 2 ms` had passed,
  measured with `performance.now()` in the callback; an animation frame that
  ran a little early was put off a whole vsync (33/50 ms at 30 fps under
  jitter; reproduced in a unit test with late callbacks). Now the tick uses
  the animation frame's own timestamp (vsync grid, clamped to the clock and
  monotonic) for the frame decision and the time step, with a slack of
  `min(6 ms, interval/3)` (`SLACK_MS`).
- **Transitions at 30 fps (56).** `Director.moving()`: a mix value is not at
  its target (the dwell before a change does not count; the sky keys do not
  while the sky holds after a clock change). While it is true every module's
  rate is at least `FPS_FAST` 30, cached ones (fog at half resolution)
  included. The sky asks for `FPS_FAST` also while its own easing runs
  (`Sky.trans`: the cloud cover on its way at `COVER_RATE`, or the palette
  weights more than 0.003 off their targets), and redraws its cached gradient
  on every frame it moved enough (was every other frame: 6 Hz steps at 12 fps).
  Before, a cloud cover change ran at 12 fps with the gradient redrawn at 6 Hz.
- **Cloud deck (56).** Key frames are timed, not counted: one per
  `DECK_KEY_S` 1.2 s while drifting, `DECK_KEY_MOVE_S` 0.7 s while the cover
  or palette moves (was 56 frames: 4.7 s at 12 fps, so clouds came and moved
  in long blurred steps); the cross-fade weight is the key frame's time phase.
  The row work per second is then fixed (a key frame is ~90 × 432 noise
  samples at the owner geometry, a few ms). While the deck shows the sky runs
  at `CLOUD_FPS` 20, `CLOUD_FPS_CPU` 15 where the canvases draw on the CPU
  (`Env.cpu`, from the worker's user agent with `glassBlurCheap`: Firefox):
  at 20 Firefox's cloudy day cost ~460 ms/s against ~360 at 15.
- **Snow on CPU canvases (56).** The far snow was six full-screen pattern
  fills per frame (two layers × three tiles): Firefox spent ~25 ms of its
  ~28 ms frame there, so snow ran on the edge of 30 fps and slipped frames.
  With `Env.cpu` the same dots are drawn as small rects (a square, or a plus of
  two bars for the bigger ones; alpha in 8 levels, one fill style per level),
  ~1900 rects a frame, ~1.5 ms. GPU canvases keep the pattern fills (0.7 ms;
  the rects cost Chromium ~3 ms of worker time). Side by side the far snow
  looks the same, a touch crisper.
- **Kept.** `FPS_FAST` 30 for rain and snow (60 would roughly double
  Chromium's ~490 ms/s in snow); `FPS_SLOW` 12 for fog, moon, stars and the
  floating letters (slow drifts, ≤ 1 px a frame); `GLIMPSE_FPS` 6;
  `FPS_STILL` 3 for a still day sky; the 60 fps burst for a strike.
- **Bench.** `weather-power.ts` reports frame intervals (`FrameStats.gaps`:
  p50 / p95 / max between drawn frames since the previous `stats` call) and
  has new scenes: `clouds` and `snow` (steady, after 36 s), `cover` (a clear
  day, then `~` with the normal easing: the cover change), `indoor` (a clear
  day, then indoors: the 5 s fade); `heavy` now settles 45 s (it measured the
  40 s fog and cover change before).

Measured (`weather-power.ts --rounds 2`, headed, owner geometry, medians;
CPU ms/s of all browser processes; fps; frame intervals p50 / p95 / max ms):

| Scene | Chromium before → after | Firefox before → after |
|---|---|---|
| calm day | 111 → 100 (5.2 → 4.4 fps) | 170 → 163 (5.0 → 4.9) |
| clouds, steady | 198 → 309 (12 → 20) | 281 → 367 (11.4 → 15.1) |
| cover change | 212 → 480 (12 → 30; 83/84/94 → 33/33/33) | 314 → 528 (11.5 → 30; 87/91/170 → 33/34/34) |
| snow, steady | 491 → 484 (30; 33/34/34 → 33/33/33) | 964 → 515 (30; 33/34/36–48 → 33/34/34; frame 28 → 9.5 ms) |
| heavy, steady | 521 → 497 (30) | 574 → 604 (30) |
| sunset | 518 → 532 (30) | 723 → 741 (30) |
| glimpse | 115 → 103 | 182 → 174 |
| indoor fade | 153 → 158 | 200 → 218 |

Off: 30–39 ms/s. The cover change costs ~+270 ms/s in Chromium and ~+210 in
Firefox for its 24–40 s; a steady cloudy day ~+110 / ~+85 for smoother
clouds; Firefox snow about half what it was. Latency (`weather-bench.ts
--rounds 2`, heavy, off → on): key → send median 0.045–0.050 → 0.050 ms
(Chromium), 0.040 → 0.040 ms (Firefox); text → painted p95 19.8–20.2 →
18.7–18.9 ms (Chromium), 19.5–19.7 → 17.3–18.0 ms (Firefox); Firefox's
worker 23 → 30 fps, 36.9 → 29.2 ms a frame against the last results file.
`bench/results/` is not rewritten.

### Floats show the back canvas itself (2026-10-17, owner item 57)

- **Cause.** A floating pane hid the game text with a canvas of its own
  (`.wc-weather-float`, opaque CSS background) into which the worker copied
  the back layer each frame. The copy was of the same frame, but each
  transferred OffscreenCanvas is presented on its own (Chromium: its own
  compositor frame sink; Gecko: its own async image), so now and then the
  page showed the float's copy a frame earlier or later than the back
  canvas round it ("Not fixed (53)" above). Measured across the top edge of
  a borderless float during lightning (consecutive compositor frames from a
  CDP screencast in Chromium, back-to-back screenshots in Firefox): inside /
  outside brightness ratio 0.31–1.90 in Chromium and 0.52–1.38 in Firefox
  over the lit frames, e.g. 27 outside against 43 inside.
- **Fix: one surface.** No float canvases any more. A float has no fill of
  its own while weather is on (`data-weather-see`, as a docked pane) and the
  back canvas shows through it; what lies under it is clipped out instead
  (index.ts `floatHoles`, geometry.ts `holeClip`): `clip-path: path(evenodd,
  …)` on the game text, the input line, each docked pane and each lower
  float, the element's box less the union of the floats in front of it
  (made disjoint, `cutRects`, so overlapping floats stay holes). It runs on
  each relayout, synchronously before paint, so a moved float and its holes
  move in the same frame (before, the copy was a frame stale after a move).
  The worker paints every pane's tint under the back layer, floats too,
  less the boxes of the floats in front (`paneFills`); a tinted float that
  moves gets a frame at once (`frameNow`). Gone: the `float` / `floatGone`
  messages, `paintFloats` and one image copy per float per frame.
- **Backdrop roots.** A clip makes its element a backdrop root, so a
  docked pane or lower float with a hole would blur nothing behind its
  glass (checked in Chromium). Such a pane is marked `data-weather-under`
  and gets the glass without blur (the Firefox look: 64 %, rim 60 %) while a
  float lies over it. A float over the game text only keeps its full glass.
- **Rejected.** (1) Presenting every canvas through the main thread
  (`transferToImageBitmap` per frame, `transferFromImageBitmap` in one task):
  in step, but heavy rain cost Chromium 482 → 1829 ms/s and Firefox 593 →
  1259 ms/s (`weather-power.ts`, map off). (2) Gecko covers showing the back
  canvas through `-moz-element()`: views of the same canvas were still
  painted a frame apart at times. (3) A mask (`mask-image` with gradient
  layers) instead of the clip: the same cost as the clip in headless Firefox.
- **Firefox and the clip.** In *headless* Firefox (software rendering) a
  complex clip or mask on the game text cost 11–23 main-thread gaps over
  50 ms per `weather-bench.ts` run while text arrived with the map floating
  (a plain rect clip none). Headed, as users run it, there are none: rAF gap
  p95 / max 17.2 / 28.4 → 17.2 / 30.0 ms, text → painted median / p95
  9.9 / 17.8 → 9.8 / 17.9 ms (weather on, map floating, 2 rounds).
- **Measured after.** Inside / outside ratio over the lit frames: Chromium
  0.81–1.07 (68 frames), Firefox 0.88–1.14 (26); the remaining spread is the
  flash's own gradient (the same in frames before and after it). Framed
  floats unchanged (glass ratio 0.36–0.50 → 0.33–0.47 Chromium, 0.23–0.29 →
  0.22–0.30 Firefox). A day → night fade: no step in 500 / 146 frames.
  CPU (`weather-power.ts --rounds 2`, headed, ms/s, map off): Chromium calm
  90 → 104, heavy 483 → 502; Firefox calm 155 → 157, heavy 593 → 591 (the
  code path without floats is unchanged: run-to-run noise). With the map
  floating, heavy: Chromium 568 → 516 (worker frame 1.88 → 1.65 ms, no copy),
  Firefox 621 → 623.

### Sunrise and sunset timed by the clock (2026-10-18, owner items 59–61)

Superseded for sunrise and sunset by ADR 0093: the day begins at dawn + 1
and the night at dusk + 1 (MUME's rooms follow `light` and `dark`, an hour
after `rise` and `set`); sunrise and sunset run over the 60 s before those
seconds, timed by the synced clock (`WeatherState.dayAt` / `nightAt`, the
director's turn, `src/weather/sunturn.ts`), not by `Event.Sun rise` / `set`.
`RISE_S`, `SET_S` and `SKY_HOLD_S` are gone. The moon comes in before the
game's rise on the same path (`moonRiseAt`, owner item 63): ADR 0093, "The
moonrise". One sun for sunrise, day glimpses and sunset, all rays glinting
(owner items 64–68): ADR 0093, "One sun".

## Consequences

- Settings gain a `weather` section (default off).
- Browsers without worker OffscreenCanvas get no effects.
