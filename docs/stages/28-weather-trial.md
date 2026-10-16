# Stage 28 — Weather effects (trial)

Owner request 2026-10-16, after four rounds of prototypes
(`notes/research/weather-atelier/`, `notes/research/weather-world/`, live
demo https://claude.ai/artifact/5bQ8wjratKitNufUn6tZ8j): decorative weather
and body effects over the whole client, driven by GMCP. **A trial:** it is
built on branch `weather-trial` and may be dropped entirely. Everything
stays isolated so that backing out is deleting a module and its hooks.
The owner chose to run the thin pane frames as part of the same trial.
ADR 0091.

## Plan

### A. Thin pane frames

Replace the quadrant-glyph frame (`▛▀▜ ▌▐ ▙▄▟`, ADR 0010) with a thin
frame of equal thickness on all four sides, with a slight bevel (light
top/left edge, dark bottom/right edge) for a hint of 3D. It still sits
on the cell grid: drawn in the middle of the outer frame cells, so pane
sizes, layout, script panes and the pane API do not change. That leaves
half a frame cell of gap between neighbouring panes. The label stays as
text in the top row. Frame colours still per pane (pane theme).

### B. Weather engine

- `src/weather/`: one module, imported lazily only when the feature is on.
- Two full-client canvases with `pointer-events: none`: *back* (behind
  text and panes, seen through pane interiors) and *front* (above
  everything). The prompt and input rows and the far left are masked.
- Rendering runs in a Web Worker on `OffscreenCanvas`
  (`transferControlToOffscreen`). The main thread only posts small
  messages on change: GMCP values, events, pane rectangles and text-line
  rows on resize/layout change, theme colours. No per-frame work on the
  main thread. Fallback without OffscreenCanvas in workers: effects off.
- Port of the v4 prototype modules: sky, weather (rain, drips, snow,
  wind, lightning), fog, body. Same look, same signal mapping (ADR 0091).
- Colours adapt to the client background (dark, mid, light).
- Low frame rate caps; pause when the tab is hidden; budget ≤ 1 ms
  average per frame in the worker.

### C. Signals

- `Char.Vitals`: `weather` (null = indoors), `fog`, `light` (`o` only),
  `position`.
- `Event.Sun`, `Event.Moon`, `Event.Darkness`.
- Moon phase from the almanac (`src/gmcp/clock.ts` / `gametime.ts`).
- Lightning: GMCP has none. Use MUME's XML `<weather>` tag: a weather
  message mentioning lightning fires a strike. To verify live (the log
  export drops tags); fallback to a narrow text match if the tag is not
  there.

### D. Options → Weather effects

Master switch (default off) and categories: Sky, Precipitation, Lightning,
Fog, Darkness, Body. Changes apply at once. Off unloads the worker.

### E. Latency proof

`bench/browser-bench.ts` (or a sibling) with effects off vs. on in heavy
rain + fog: text-to-screen and key-to-send latency must not move.

## Tasks

- [ ] A. Thin frames (all framed panes, script panes, phone layout);
  unit/e2e updated
- [ ] B. Worker engine, canvases, masking, geometry feed, theme colours
- [ ] B. Port sky, weather, fog, body from the prototype
- [ ] C. Signal bridge incl. XML weather tag; unit tests
- [ ] D. Options page and settings (with migration), defaults off
- [ ] E. Latency bench before/after
- [ ] Screenshots on black, dark-grey and light backgrounds
- [ ] ADR 0091, this file, progress table

## Test guide

(Written when the build is ready.)

## Owner feedback

