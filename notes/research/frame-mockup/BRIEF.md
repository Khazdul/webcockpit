# Pane frame mockup — brief for design agents

## Goal

WebCockpit (`/home/ole/proj/webcockpit`) is a browser MUD client with a
TUI look: a monospace text grid, panes with thin frames, and (on branch
`weather-trial`) decorative weather drawn on canvases behind the panes
(sky, clouds, rain, stars, sunrise rays). The owner is not happy with the
pane frames and titles. Their feedback (stage file
`docs/stages/28-weather-trial.md`, item 35):

1. Frames should look better: thicker (about 2–4 px more than today's 3 px)
   and/or built from several shades so the frame "pops": e.g. a fairly dark
   outer stroke, a much lighter second stroke, then the normal frame colour,
   and the two innermost strokes in their own shades.
2. The title floats in the air (it sits in a gap in the top line, with no
   backing); over an unlucky background (bright cloud, sunrise, busy rain)
   it cannot be read. Bake the title into the frame: a backing that blends
   into the frame, a text colour that always shows, two-colour text with a
   very thin black outline around each letter, or something cleverer.
3. A very light glass blur inside panes: the weather behind should still be
   glimpsed (CSS `backdrop-filter: blur(...)` on the pane fill, which is
   semi-transparent).
4. The frame should clearly take the colour chosen for the pane (today
   frames look about the same whatever the pane colour).

The deliverable is a canvas of artboards, one per design, so the owner can
compare ten directions side by side and pick. **Every design must answer
all four points**, each with its own distinct strategy. Make each one
genuinely good, not a strawman.

## Today's frame (for reference)

`src/layout/layout.css` (`.wc-pane-frame`, `.wc-pane-line`,
`.wc-pane-title`), `src/panes/frame.ts`, `src/panes/pane.ts`. A 3 px line
(SVG path, a 1 px edge band each side and a 1 px core) in the middle of the
outer frame cells, ~6 px gaps between neighbouring panes; edge colour
`color-mix(--pane-border 80%, --term-fg)`, core `color-mix(--pane-border
52%, --term-fg)`. The title (0.82 em) sits centred in a gap in the top
line, about half a space of line cut away each side, transparent behind.
Close cross at the top right. Pane fill = `--pane-bg`, panes are
see-through to the weather canvas behind.

The real app's constraints a design must respect (so it can be built):
- The frame lives inside the pane's outer cell ring (one character cell
  ≈ 8–9 px wide, ~17–18 px tall at 14–15 px font). A frame up to ~7 px
  thick fits; the title row is one cell tall.
- Pane sizes and the text grid must not change.
- Built with CSS/SVG on DOM elements (no per-frame JS).
- `backdrop-filter` is allowed (we will measure its cost later).

## The canvas format (Design artifact, `.dc.html` files)

Each artboard is ONE self-contained file `project/<Name>.dc.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Two to four words</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<style>
body{margin:0}
/* page basics, @keyframes, class rules, pseudo-elements live here */
</style>
</helmet>
<div style="width: 1280px; height: 760px; position: relative; overflow: hidden; ...">
  ... all markup, written out literally ...
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":1280,"height":760}}'>
class Component extends DCLogic {
renderVals() { return {}; }
}
</script>
</body>
</html>
```

Rules that fail silently if broken:
- Keep `<script src="./support.js"></script>` exactly as is.
- Close every non-void element; quote every attribute.
- Root fixed at 1280×760 px.
- ALL UI is literal markup inside `<x-dc>`. No script-built DOM
  (`innerHTML`, `appendChild`, canvas drawing). Animation only by CSS
  `@keyframes` in the `<helmet><style>`.
- `{{hole}}` is a plain dotted lookup into `renderVals()`, never an
  expression. You likely need no holes at all.
- The `<script type="text/x-dc" data-dc-script>` block is required, classic
  JS, `class Component extends DCLogic`.
- No network except a Google Fonts `css2` `<link>` inside `<helmet>`; no
  images or data: URIs; inline SVG is fine (decor `aria-hidden="true"`).
- No `<iframe>`, `<object>`, `<embed>`, no emoji.
- Class rules in `<helmet><style>` are fine and expected here (frame
  styling is the whole point); inline `style` for placement.
- Font: monospace for the pane text, e.g. Google Fonts "JetBrains Mono" or
  "IBM Plex Mono" (pick one and keep it the same across all artboards: the
  scene file decides).

## The shared scene

`project/Main.dc.html` ("00 Today") is the baseline: today's frames over
the shared scene. Every design artboard copies its scene markup exactly
(sky, clouds, rain, sun rays, the pane layout, pane contents, pane
colours) and changes ONLY the frame/title/pane-glass styling, so the
comparison is fair. Keep your design CSS scoped to your artboard.

## For design agents (after the scene exists)

- Start from `project/Main.dc.html`: copy it to your `project/Vnn.dc.html`,
  change the `<title>`, and replace ONLY the CSS between `FRAME DESIGN` and
  `end FRAME DESIGN` (read the contract comment at the top of the file). You
  may add the same few elements inside every pane (e.g. extra frame layers)
  and change `.fill` (glass blur). Do not change the scene.
- The real pane colour presets are very dark (`--pane-border` e.g.
  `#222830` blue, `#2e2222` red). Point 4 needs the frame to show the
  colour clearly, so each design must define a rule that derives its frame
  colours from the preset (e.g. `oklch(from var(--pane-border) ...)` raising
  lightness/chroma, or `color-mix` with a hue accent), applied the same way
  to every pane, including the uncoloured one (which should stay neutral
  grey). State the rule in a short CSS comment.
- Glass blur: light, e.g. `backdrop-filter: blur(2px–6px)` with some
  saturation, the rain and clouds still glimpsed through.
- Render your artboard and look at it: a quick way is a tiny HTML wrapper
  or Playwright `page.setContent` with the file (the `support.js` script
  will 404 outside the canvas; the `<x-dc>`/`<helmet>` tags then render
  as unknown elements, which is fine for a visual check — check how
  `shots/gen.py` or the scene agent rendered it, files are in `shots/`).
  Screenshot to `shots/Vnn.png` and a zoom on the Character title (the
  unlucky bright cloud) and the floating Group pane to `shots/Vnn-zoom.png`.
  Iterate until it is genuinely good. Your two designs must look clearly
  different from each other and from today.
- Do not publish, do not touch other agents' files or the repo.
- Report: file paths, a name for each design (2–4 words), and 3–5 lines
  per design on how it answers points 1–4 and its colour rule, plus any
  build cost/risk in the real app.
