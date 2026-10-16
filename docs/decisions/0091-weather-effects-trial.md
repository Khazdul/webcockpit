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
  darkness sky (dark, slight red).
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

## Consequences

- Settings gain a `weather` section (default off).
- Browsers without worker OffscreenCanvas get no effects.
