# Character portraits (raster)

The Character pane's round portrait (stage 77 decision 22, ADR 0166
addendum 10) draws a crude SVG placeholder per race unless that race's
file is here. Which files exist is read at build time, so add them and
rebuild: a deploy is a rebuild. Code: `src/panes/portrait.ts` (which
file), `src/panes/portrait-figures.ts` (the placeholders).

## Files: `public/portraits/<id>.webp`

| File | Shown for |
| --- | --- |
| `human.webp` | Men (Dúnadan and the other kinds of Man) |
| `elf.webp` | Elves (Silvan, Sindarin, Noldorin) |
| `halfelf.webp` | Half-elves |
| `dwarf.webp` | Dwarves |
| `hobbit.webp` | Hobbits |
| `beorning.webp` | Beornings (Bear) |
| `orc.webp` | Orcs (Tarkhnarb and Zaugurz alike) |
| `troll.webp` | Trolls |
| `numenorean.webp` | Black Númenóreans |
| `neutral.webp` | No race yet, or one the client does not know |

Every file: **1024 × 1024, transparent WebP**.

## Framing

- The pane shows the file clipped to a circle: only the inscribed circle
  (centre 512, 512, radius 512) is ever seen. The corners can hold
  anything.
- Head and shoulders, as the placeholders: the head's centre at about
  (512, 480), a little above the middle; the head about 300–340 px wide;
  the shoulders run out of the picture at the circle's bottom (from about
  y 760 down), so no body edge is seen.
- The level ring covers the bottom centre (about the lowest fifth of the
  circle, a third of its width, more in the smaller Medium size): put
  nothing there that must be seen, such as the chin.
- The rim is darkened by the frame's inner shadow (about the outer 10 %
  of the radius): keep the face clear of it.
- Through the transparent parts the frame's own background shows: a dark,
  warm glow in the dark themes and pale parchment in Paper. A figure has to
  read on both; a background of its own is allowed but not needed.

## Size on screen

The circle is about 100 CSS px across in a docked pane at the default font,
up to about 180 px with a large font, and grows with a very wide floating
pane (about 340 px at the most in practice). 1024 px is about 3× that
largest size, so the files stay sharp on high-density screens.

## Fallback

- A race whose file is missing shows its own SVG placeholder. It does not
  fall back to `neutral.webp`, which is used only for the neutral case.
- A file that fails to load keeps the placeholder in place.
- The replays have no portrait files: the exported HTML replay (no files
  beside it) and the shared replay's frame (its policy allows no image
  from the site) always draw the placeholders.
