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

## Addendum 2026-11-07 — no layout read on a look push

Looks arrive inside the sky engine's frame, after its style writes, up to
4 times a second; measuring the mark there (`markBox`,
`getBoundingClientRect`) forced a synchronous layout on that path. The
`Wordmark` now keeps the mark's box and measures it again only when the
mark may have moved: the markup is (re)made, a window resize, a resize of
its host (its own ResizeObserver, which also fires when a hidden host is
shown again), a `transitionend` on an ancestor (the start page's scenery
moves `.wc-start-brand`), and on a change of the new `place` prop (the
surface passes its scenery): at once and again `PLACE_SETTLE_MS`
(850 ms, a little more than the brand's 0.8 s move) later, in case no
transition ran. `applyWordmarkLight` writes only attributes and rivet
variables whose values changed, so a typical push touches a few
attributes. `paintWordmark` (the first paint) is unchanged: it measures
once.

## Addendum 2026-11-07 — the inlay is mithril, subtle

The owner reviewed stage 41 and changed the inlay from tint c "Turkos"
to mithril (tint b), and asked for it subtler if it did not blend in.
Screenshots of the built page (day 13h, dusk 20h, night 23h, desktop and
phone) showed b still reading as a teal enamel against the warm iron and
the brass and parchment panel by day; by night it was already a quiet
silver. So a new tint d, "Mithril, subtle", was made from b: hue about
185° (a touch cooler than the pixel logo's 180°), day saturation about
0.6 of b's, night about 0.8, the same lightness bands, so it stays
banded, brushed and reflective; it reads as silver with a cool cast and
never glows. d is built; b and d are side by side in
`round6/logo-3-cyan-compare.html` (`?all` adds a and c), and
`logo-3-cyan.html?tint=d` is the mockup's default.

| | Day metal (top → bottom bands) | Night metal |
|---|---|---|
| **d Mithril, subtle** | `#d4ecee #7eaeb2 #2c4e51 #4c777b #a2c4c8 #20383a` | `#deedf1 #97b4bc #435a60 #688187 #aec5ca #324448` |

Rivets: day `#eef9fa / #72a7ac / #1b3335`, night `#f5fcfe / #97b2b9 /
#29383d`. The channel's lit lip `rgba(206,232,234,.55)`, COCKPIT's ink
`#cfe2e4`. Band offsets and the light model are unchanged.

Everything that echoed the old cyan follows: the favicons (inlay stops
`#eaf5f6 #9ccbd0 #4a7f84 #8cbfc3 #33595c` in `scripts/build-favicons.ts`,
a little brighter and more saturated than the wordmark so the inlay
still reads at 16 px; the pale steel outline is unchanged), the round 7
mockups' shared base (`WC.INLAY`), and the first
paint's loading panel in `index.html` (ADR 0083's "cyan-steel" line is
now `#4c777b → #a2c4c8 → #deedf1`, its track, label and the panel's
outline the same family). The in-game window kit's thin cyan border
(`src/chrome/kit/window.*`, ADR 0103) is not the logo's colour and is
unchanged for now. Terminal and theme cyan are the game's colours and
are untouched.

## Addendum 2026-11-07 — the sheen only now and then

The owner asked for the sheen to sweep past only occasionally (it ran
continuously and seemed to cost a few fps). It is no longer an infinite
animation: `sweepSheen` runs one pass (`SHEEN_PASS_MS`, 5 s, a soft
ease-in-out, the same band and keyframes) with no fill, after which the
band rests off the letters and nothing animates. The `Wordmark`
schedules the passes while `run` is true and motion is not reduced: the
first `SHEEN_FIRST_MS` (4 s) after the mark shows, then one after each
random quiet of 20–45 s (`sheenGap`) counted from the end of the last
pass. When it shows again (`sheenDelay`) it waits out the rest of the
gap after the last pass, or 4 s if that gap is already over. `run`
false cancels a running pass and the timer (`stopSheen`); the start
surface now passes `run` false while the page is hidden or covered, while
Enter MUME's transition runs (`leaving`, `.wc-start.is-leaving`) and with
`prefers-reduced-motion`. The glint and the light model are unchanged.

*Measured* (headless Chromium, 1440×900 at DPR 2, the start page's
main menu, the sky host hidden with `display: none` so its canvases do
not drown the numbers; CDP `Performance.getMetrics` deltas and a trace
over 10 s windows): with the old infinite sheen running the page drew
60 compositor frames/s (`DrawFrame`) with 6–6.5 ms/s of style recalc
and 7–8 ms/s of pre-paint; with the sheen cancelled, 4.8 frames/s,
0.5 ms/s and 2 ms/s. The new code between passes measures the same as
the cancelled sheen (2.9 frames/s, 0.4–0.8 ms/s style, 2.2–2.4 ms/s
pre-paint) and `document.getAnimations()` holds no wordmark animation.
A 100 s timeline showed passes at 4.3 s, 40.7 s and 83.1 s, each 5 s.
