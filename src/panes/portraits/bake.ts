// Bakes a portrait drawing (an SVG string, types.ts) into a raster image
// once, so the card's repaints never re-run its filters (turbulence and
// displacement; ADR 0166 addendum 12, "Cost"). The SVG is loaded as an
// image from a `data:` URL, drawn to a canvas at the wanted pixel size and
// read back as a `data:` PNG URL: allowed by every CSP the card runs under
// (the app's, the exported replay's, the share frame's `img-src data:
// blob:`), and nothing to revoke. One bake per (drawing, pixel size).

/** The SVG as a `data:` URL an <img> can load. */
export const svgUrl = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Loads `svg` and returns a PNG `data:` URL `px` × `px`, or the SVG's own URL where a canvas cannot be read. */
export async function bake(doc: Document, svg: string, px: number): Promise<string> {
  const src = svgUrl(svg);
  const img = new (doc.defaultView ?? window).Image(px, px);
  img.decoding = 'async';
  img.src = src;
  await img.decode();
  const c = doc.createElement('canvas');
  c.width = c.height = Math.max(1, Math.round(px));
  const g = c.getContext('2d');
  if (!g) return src;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, c.width, c.height);
  try {
    return c.toDataURL('image/png');
  } catch {
    return src;
  }
}
