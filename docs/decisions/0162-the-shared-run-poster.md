# 0162 — The shared run's poster

Date: 2026-11-18. Status: accepted (built on `stage-73c-poster`, stage 73
part C). Related: ADR 0019 (the HTML replay), ADR 0154 (the watch page's
frame and its CSP), ADR 0155 W1 (the paused start), ADR 0160 (the lens),
ADR 0126 (the wordmark), ADR 0123 (the title face).

Numbering note: parts A and B of stage 73 were built in parallel and add
addenda to existing ADRs only; if a number collides at the merge, the main
session renumbers.

## Context

The owner's point 11 of stage 73: a shared run (a share link, a log opened
from the community) opens with a presentation layer over the log window:
a large play button in the middle, a glass effect "a little like a TV
screen", the log's title in large title text at the top centre, the MUME
Cockpit logo at the bottom right, and something more if it looks good. A
click starts the run; the layer goes and the log shows as usual. The
session decided it is shown wherever `openReplay` plays a shared run: the
watch page's frame and the exported HTML file, on every device, and it
holds the run paused at the start.

## Decision

- **Where.** `openReplay(…, { poster: true })` (src/replay/page.ts): the
  frame (src/replay/frame.ts, always) and the exported file
  (`startReplay`). The in-app run log player and Spotlights never get one;
  unit tests that call `openReplay` without `poster` play as before. The
  frame no longer reads `prefs.paused` (the watch page sends `true`
  anyway): the poster holds every run paused at its start, and a seek to 0
  draws the run's first screen under it.
- **What** (src/replay/poster.ts, poster.css). A fixed layer, the last
  child of `<body>`, `z-index` above everything of the player and the phone
  layer. A rounded "tube face" with a vignette (inset shadow, radial
  gradient), faint scanlines (a repeating gradient), a glare at the top left
  and a softer reflection at the bottom right; the paused log shows dimly
  through a 1.5 px backdrop blur. The title in Cinzel Bold (the pane title
  face, already registered in the frame and embedded in the file), amber
  with a soft phosphor glow, three lines at most, a smaller size for long
  titles. Under it, the "something more": the character, the date and the
  played length (each a span, gaps, no separators; the character only when
  the run has a title of its own, the length once the player knows it,
  `Poster.setLength`). In the middle the play key: an amber ring with a
  triangle and the word "Play". At the bottom right the wordmark.
- **Colours** are fixed, not the exporter's theme: the app's amber
  (`#ffb000`, the player's `--pc-gold`) on near-black, iron and mithril for
  the mark. The poster is the app's face, whatever theme the run carries.
- **The logo** is drawn from the start page's glyph outlines
  (src/start/wordmark-glyphs.ts, ADR 0126): MUME in iron with the
  mithril inlay (`INLAY_TOKENS.day`), COCKPIT between two rules, as one
  small SVG made with DOM calls. `wordmarkMarkup` was not used: it is a
  markup string full of `style` attributes, and the frame's `style-src`
  has a hash, which voids `'unsafe-inline'` for style attributes. No image
  file, no fetch: it works in the file and under the frame's CSP.
- **No markup, no style attributes** anywhere in the poster: elements,
  `textContent` and SVG presentation attributes only (the title is the
  payload's text, shown as text). A unit test checks there is no `[style]`.
- **Start.** A click or tap anywhere on the layer, or Enter or Space,
  removes it (a 260 ms fade, none with reduced motion) and plays. The play
  key has the focus when the frame has it.
- **Keys while it is up.** A capture `keydown` listener on the window,
  registered before the player's own (src/player/view.ts registers its
  own capture listener on the window later), swallows every key but Tab
  (`stopImmediatePropagation`); Enter and Space start. So F, the arrows,
  1–6 and the rest do nothing until the run starts.
- **Pointer.** The layer stops `pointerdown`, `click`, `wheel`, touch and
  friends from bubbling, so the player's stage (and the phone layer's
  handlers on the document) never see them; the wheel does not scroll.
- **Motion.** Only the ring's slow glow (a fill change, 3.6 s) and the
  fade; both off with `prefers-reduced-motion: reduce`. Everything else is
  painted once.
- **Fullscreen.** The layer is `position: fixed` over the document, so it
  covers the frame's document in fullscreen and the "fill the window"
  fallback alike; F is swallowed while it is up, so normally it is gone
  before fullscreen.

## Consequences

- Every e2e spec that drives a shared run starts it first: the helper
  `startRun` (tests/e2e/watch-page.ts) clicks the poster away; the exported
  file's spec checks the poster, then clicks it.
- The replay runtime grows by the poster's code, its CSS and the glyph
  outlines (about 5 KB of path data); see the stage file for the measured
  size.
- The watch page's own `prefs.paused` stays in the protocol (an older
  frame reads it) but changes nothing in a frame of this build.

## Alternatives considered

- **An image of the logo (PNG/SVG file as a data URI).** Works under
  `img-src data:`, but would duplicate the mark and drift from ADR 0126's;
  the glyph outlines are already in the bundle's reach.
- **The poster inside the player's root.** Its events would bubble into the
  player's stage handlers (`pointerdown`, `click`, `wheel` on the root);
  outside it, and with the events stopped, nothing leaks.
- **A canvas or WebGL CRT effect (barrel distortion).** Not cheap, not
  needed for a still screen; CSS gradients give the look.
