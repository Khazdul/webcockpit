# Tileset picker mockup (2026-11-04)

The owner's idea: replace the Tileset dropdown in Settings → Mapper with a
3×3 grid of checkable previews, each a 6×6 scene in that set's real tiles.
Shimrod (alternating) shows all four seasons; the mockup offers three
looks for it (A quadrants, B diagonal bands, C cycling).

- `gen.mjs` builds `mockup.html` from `template.html`, embedding the
  tiles from `public/map/` downscaled to 40 px (needs ImageMagick).
  Run from the repository root: `node notes/research/tileset-picker-mockup/gen.mjs`.
- `mockup.html` is a plain page; open it in a browser.

Reference material, not code to copy into `src/`.
