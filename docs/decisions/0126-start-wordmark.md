# 0126 — Start page wordmark and favicon

- Status: Accepted
- Date: 2026-11-07
- Related: stage 41b (`docs/stages/41-start-page.md`), ADR 0083 (first
  paint, which will draw this mark in 41d), ADR 0123 (the Lykta iron),
  ADR 0124 (the sky model, `SkyLook`).
- Reference: `notes/research/start-menu-mockups/round6/logo-3.html`
  (approved wordmark 3 "Inlagd metall") and its cyan tweak
  `round6/logo-3-cyan.html` (comparison page `logo-3-cyan-compare.html`).

## Context

The owner chose wordmark 3: forged dark iron "MUME" (Cinzel) with a flush,
slightly domed metal inlay in the channels of the thick strokes, that
reflects and never glows; "COCKPIT" widely spaced between thin iron rules
with rivets of the inlay's metal. Later the same day: the inlay is not
brass but a bluish/cyan metal echoing the early pixel logo (MUME
`#00d0d0`, COCKPIT `#0a9a9c`); day brighter cyan steel, night cooler and
more silvery. Favicon: an "M" in the same iron and inlay.

The mark must be crisp at any size and DPR, fit a 320 px phone, follow
`SkyLook.light` and `dayness` (updates a few times per second at most),
cost nothing per frame, and be drawable by the first paint before Preact
and before any web font has loaded.

## Decision

**Tint: c "Turkos".** Three strengths were mocked (`logo-3-cyan.html?tint=a|b|c`,
shots at day, dusk and night):

| | Day metal (top → bottom bands) | Night metal | Verdict |
|---|---|---|---|
| a Stål | `#e3f1f2 #9fbcc0 #4c6266 #6d8689 #aec8cb #3a4a4e` | `#e8eef2 #adb9c2 #59646e #7c8892 #bfcad2 #414a53` | steel with a cyan cast; loses the pixel logo |
| b Mithril | `#c8f4f2 #6cc2c4 #1f5a5e #3c878b #8fd0d1 #183e42` | `#dcf0f3 #93b9c0 #3f5c64 #64848b #aac8ce #2f444b` | clearly cyan by day, nearly neutral silver at night |
| **c Turkos** | `#b8fbf8 #2fd0d0 #0a5c5e #1a9496 #5fe0de #063c3e` | `#cff6f7 #6cc0c6 #245a62 #468b92 #93d3d8 #1b434a` | **chosen**: the pixel logo's hue (180°), still banded, brushed and reflective; silvery cyan at night |

Band offsets 0, .22, .48, .6, .75, 1 (as the brass of logo-3). Rivets of c:
day `#dcfffd / #22c8c8 / #053a3c`, night `#eafeff / #6cbcc2 / #163a40`
(highlight / body / rim). The channel's lit lip `rgba(170,242,240,.55)`.
COCKPIT's ink becomes cold `#bff0ee` with a dark shadow and no warm glow
(the mockup's orange text glow contradicted "never glows"). The iron
itself stays the approved warm dark iron.

**Technique: SVG paths in two stacked SVG layers, no live text, no canvas.**

- *Outlines.* `scripts/build-wordmark-glyphs.py` takes the outlines from
  the Cinzel 2.000 variable font (wght 900 for MUME, as the mockup's
  Cinzel Black; 600 for COCKPIT) into `src/start/wordmark-glyphs.ts`,
  laid out as the mockup (0.045 em between MUME's letters, COCKPIT tracked
  0.95 em), relative path commands in whole font units. The font file is
  not committed or shipped (source URL and sha256 in the script). The
  overlapping contours are kept: the canvas mockup stroked them too, so
  the inlay shapes (the M's diamond-shaped pieces) are the approved ones.
- *The channel* is the letter shrunk by 0.049 em: an SVG mask of the path
  filled white and stroked black at twice that width (round joins). So
  only the thick strokes keep an inlay, exactly as the mockup's
  `destination-out` stroke.
- *Iron layer* (`data-wcw="iron"`): drop shadow (the one blur), stepped
  extrusion, lit top edge, face gradient, the channel's lit lip and dark
  rim. It never changes and is painted once.
- *Inlay layer* (`data-wcw="inlay"`, `will-change: transform`, so its own
  compositing layer): day metal, night metal over it (opacity = night
  blend), a fixed brush texture (two paths of thin lines from a seeded
  random), the channel's inner shadow (three shifted copies of the
  channel band instead of a blur), the glint (a user-space linear
  gradient whose x1/x2 and stop colours move), a dimming rect, and the
  dome: the channel band shifted away from / towards the light (two
  offsets each, for softness) shows inside the channel as a lit edge
  facing the light and a shaded edge opposite. No filter in this layer.
- *Light model* (`wordmarkLight`, pure): the mockup's `light()` against
  the contract fields: direction from the mark's centre to
  `light.x/y × viewport` weighted by `strength`, plus the sky light from
  straight above (`0.45 + 0.35·dayness`); colour mixed from the sky tint
  and `light.color`; night blend `smoothstep(.25, .85, 1 − dayness)`;
  brightness `max(.55 + .45·dayness, .5 + .5·strength)` (a little less
  dimming than the mockup, whose night looked muddy in cyan). Rivet
  colours are quantised to 20 steps, so their CSS variables change only
  during dawn and dusk.
- *Update cost* (`applyWordmarkLight`): about ten `setAttribute` calls and
  three CSS variables; measured 0.15 ms main thread, a repaint of the
  inlay layer only (about 3 ms of raster-thread work in headless
  software raster at DPR 2, 1440 px; less on GPU raster). Nothing runs
  per frame.
- *Motion*: the mockup's very faint sheen across the iron (6 %, one pass
  in 20 s) is a Web Animations transform on a strip inside an element
  masked by the letters: compositor only. `run=false` or
  `prefers-reduced-motion` cancels it; there is no other animation.
- *Sizes.* `full`: MUME and the COCKPIT row, width
  `var(--wc-wordmark-w, clamp(250px, 32vw, 520px))`, max 100 % (fits
  320 px phones); the COCKPIT row and rivets are sized in container query
  units of that width, with px minimums so COCKPIT stays legible on a
  phone. `small`: MUME only, height `var(--wc-wordmark-h, 32px)`.

**First-paint reuse.** `src/start/wordmark-svg.ts` imports only the glyph
module and a type: `wordmarkMarkup(size, idPrefix)` returns the HTML (all
styles inline), `wordmarkLight(look, box)` / `applyWordmarkLight(root, w)`
light it, `markBox(el, window)` measures where it sits, and
`paintWordmark(host, look, size?, id?)` does all three for the first
paint. About 13.5 KB minified, 5.7 KB gzip (the outlines are 4.2 KB of
it). The Preact `Wordmark` (`src/start/wordmark.tsx`) sets the markup once
per size and re-applies the light on `look` changes and window resizes.
Props: `look`, `size?: 'full' | 'small'`, `run?`, `class?`. The root
carries `role="img"` and `aria-label="MUME Cockpit"`.

**Favicon.** `scripts/build-favicons.ts` writes `public/favicon.svg` (the
Cinzel Black M squeezed to 78 % width, iron face, a wider and brighter
inlay — the channel shrunk by 0.042 em, no brush, glint or bevel — and a
thin pale steel outline, a little darker under `prefers-color-scheme:
light`), `public/favicon.ico` (16, 32, 48 px PNG entries rasterised by
Chromium) and `public/apple-touch-icon.png` (180 px on an opaque night-sky
tile). The outline separates the dark iron from a dark tab; the iron
carries it on a light one. `index.html` links all three with root paths,
which Vite prefixes with the base; `public/` is copied to the site root,
so `npm run build:pages` needs no change.

**Preview.** `src/start/wordmark-preview.html` (dev server only; Vite
builds index.html alone) mounts the component over day, dawn, dusk, night
and lightless skies.

## Alternatives considered

- *Canvas, as the mockup.* Per-DPR rasterisation, a full redraw per light
  update, and the bevel built from `getImageData` normals; the first
  paint would need the font loaded. Rejected.
- *One SVG.* Any update would re-run the drop shadow's blur. Two layers
  keep that blur out of the update path.
- *SVG lighting filters (`feSpecularLighting`) for the dome.* Re-rasterised
  on every update; the shifted-band trick gives the same thin lit edge
  without a filter.
- *Eroded outlines precomputed as paths.* Needs a polygon offset library
  at build time and doubles the path data; the stroke mask is exact
  enough and free.
- *Live Cinzel text.* Depends on font loading, which the first paint
  cannot wait for.

## Consequences

- The first paint (41d) can show the new mark with `paintWordmark` and
  the sky model's look for the current game hour; the app's component
  then takes over with identical markup.
- Changing the letters means re-running the glyph script with the same
  font file; changing the tint means editing the constants at the top of
  `wordmark-svg.ts` (and re-running the favicon script).
