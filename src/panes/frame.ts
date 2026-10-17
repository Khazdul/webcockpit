// Pane frame (Inv §2.1 "Pane frame", §10.4; ADR 0010, ADR 0091 "Frames",
// addendum "glass rim and nameplate").
//
//   ╭────────────────────────────╮     a frosted glass rim, equal on all
//   │ ╭─╮Character╭──────────────│     four sides, in the outer frame
//   │   ╰─────────╯              │     cells; a nameplate of the same glass
//   │                            │     hangs from the top rim, joined by
//   ╰────────────────────────────╯     concave fillets, and holds the title
//
// The frame still owns the outer ring of cells (pane sizes, the content
// rectangle and the layout are as with the old quadrant glyphs). It is drawn
// as boxes and paths, not text (layout.css, pane.ts):
//
// - `.wc-pane-rim`: the glass. A box over the frame box, clipped to the rim
//   ring plus the plate (`frameRimPath`, even-odd: the rounded outer edge
//   and the hole, `frameHolePath`), so rim and plate are one piece of glass:
//   the same tint, the same backdrop blur, the same colour (owner, item 35).
//   An SVG inside it strokes the hole's edge (the inner seam, `frameSeams`).
// - `.wc-pane-frame::before`: the pane's fill, clipped to the hole (the
//   inside of the rim less the plate), so the plate shows what is behind
//   the pane, as the rim does.
// - `.wc-pane-title`: the label, centred on the plate.
//
// The inset is the same horizontally and vertically, so the gap between two
// neighbouring frames is the same beside and above (owner feedback 15).
//
// `frameGeometry` puts every edge of the rim on a whole device pixel of the
// page, not of the pane: panes sit at `col × cell-w`, which is fractional,
// and the cockpit itself may start at a fractional place (the app padding at
// a fractional pixel ratio), so whole device pixels relative to the pane are
// not enough for an equally thick, sharp rim everywhere. `framePlate` does
// the same for the plate's edges.

/** Column of the label's first cell (the old `▛▀▀` took columns 0–2). */
export const LABEL_COL = 3;

/** Where the frame rim of one pane sits (CSS px, relative to the pane's box). */
export interface FrameGeometry {
  /** Rim thickness (every side). */
  t: number;
  /** Insets from the pane's left, right, top and bottom edges to the outside of the rim. */
  l: number;
  r: number;
  top: number;
  b: number;
}

/** A pane's box in CSS px, relative to the page's device-pixel grid (the cockpit's origin). */
export interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Rim thickness in device px for a cell `h` CSS px high: a third of the cell
 * height, at least 3 (6 px at the default size and ratio 1; the mockup's
 * 6 px rim on an 18 px cell, item 35).
 */
export function frameThickness(h: number, dpr = 1): number {
  const d = dpr > 0 ? dpr : 1;
  return Math.max(3, Math.round((h * d) / 3));
}

/**
 * Inset (CSS px) from every edge of a pane to the outside of its rim, for a
 * `w` × `h` px cell: the same on all four sides, about a fifth of a cell
 * width (2 px at the default size: two neighbouring frames 4–4.5 px apart,
 * as in the mockup), and at least 1 px clear of the content cells inside.
 */
export function frameInset(w: number, h: number, dpr = 1): number {
  const d = dpr > 0 ? dpr : 1;
  const t = frameThickness(h, d) / d;
  return Math.max(0.5, Math.min(Math.max(1, w / 4.5), w - t - 1));
}

const px = (v: number): number => Math.round(v * 1e4) / 1e4;

/**
 * The frame rim of the pane at `box` (CSS px) for a `w` × `h` px cell at
 * `dpr`: `frameThickness` thick, `frameInset` in from every edge. Every edge
 * of the rim is on a whole device pixel of the page (assuming `box` is
 * measured from a device-pixel aligned origin), so the rim is equally thick
 * everywhere.
 */
export function frameGeometry(box: PxRect, w: number, h: number, dpr = 1): FrameGeometry {
  const d = dpr > 0 ? dpr : 1;
  const tD = frameThickness(h, d);
  const i = frameInset(w, h, d);
  // Outer edges of the rim in device px of the page.
  const x0 = Math.round((box.x + i) * d);
  const x1 = Math.round((box.x + box.w - i) * d);
  const y0 = Math.round((box.y + i) * d);
  const y1 = Math.round((box.y + box.h - i) * d);
  return {
    t: px(tD / d),
    l: px(x0 / d - box.x),
    r: px(box.x + box.w - x1 / d),
    top: px(y0 / d - box.y),
    b: px(box.y + box.h - y1 / d),
  };
}

/** The title's font size relative to the text (layout.css `.wc-pane-title`; the mockup's 0.72 em of 15 px on an 18 px cell, item 35). */
export const TITLE_SCALE = 0.68;

/** Room between the label's spaces and the plate's sides, in title advances (TITLE_SCALE cells): ~8 px from the letters. */
export const PLATE_PAD = 0.2;

/** Fillet radius (the concave joins of plate and rim) and the plate's lower corner radius, CSS px. */
export const PLATE_R = 4;

/** The rim's outer corner radius, CSS px. */
export const RIM_R = 4;

/** The plate's top: under the rim's dark edge and its specular lip, CSS px from the rim's outer edge. */
export const PLATE_LIP = 2;

/**
 * The nameplate hanging from the top rim (item 35, design 14), in CSS px
 * relative to the frame box (the rim's outer edge). Its body is
 * `[x0, x1] × [t, y1]` (glass from the rim's inner edge down); the title's
 * box is `[x0, x1] × [y0, y1]`, so the letters may reach up over the rim.
 * Fillets of radius `r` join it to the rim either side.
 */
export interface FramePlate {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  r: number;
}

/**
 * The plate for a title of `chars` characters (` Label `, spaces included)
 * from the fourth cell, at TITLE_SCALE: its sides PLATE_PAD advances outside
 * the label's spaces, its bottom one CSS px above 8/9 of the top cell row
 * (the mockup's 16 px of 18 less one, owner item 40; clear of the first
 * content row), every edge on a whole
 * device pixel of the page; the fillets clear of the rim's inner corners.
 * Null without a title or room for one.
 */
export function framePlate(box: PxRect, g: FrameGeometry, w: number, h: number, chars: number, dpr = 1): FramePlate | null {
  if (chars < 3) return null;
  const d = dpr > 0 ? dpr : 1;
  const tD = Math.round(g.t * d);
  const s = w * TITLE_SCALE;
  const xt = box.x + LABEL_COL * w;
  const fx = box.x + g.l, fy = box.y + g.top;
  // Plate bottom in device px of the page (8/9 of the top row less one CSS
  // px: owner item 40, the letters sit in its middle), and the fillet
  // radius it leaves room for.
  const one = Math.max(1, Math.round(d));
  const yb = Math.round((box.y + (h * 8) / 9) * d) - one;
  const yt = Math.round(fy * d) + tD;
  if (yb - yt < 3) return null;
  const rD = Math.max(1, Math.min(Math.round(PLATE_R * d), Math.floor((yb - yt) / 2)));
  const xMin = Math.round((fx + g.t) * d) + rD + one;
  const xMax = Math.round((box.x + box.w - g.r - g.t) * d) - rD - one;
  const xa = Math.max(xMin, Math.round((xt - PLATE_PAD * s) * d));
  const xb = Math.min(xMax, Math.round((xt + (chars + PLATE_PAD) * s) * d));
  if (xb - xa < 2 * tD) return null;
  const lip = Math.min(tD - 1, Math.max(1, Math.round(PLATE_LIP * d)));
  return { x0: px(xa / d - fx), x1: px(xb / d - fx), y0: px(lip / d), y1: px(yb / d - fy), r: px(rD / d) };
}

const n = (v: number): string => String(Math.round(v * 1e4) / 1e4);

/**
 * The hole in the rim (the pane's inside less the plate and its fillets), a
 * closed path in frame-box coordinates (`fw` × `fh`, the rim's outer edges),
 * moved by (`dx`, `dy`): the fill's clip and, with the outer edge, the rim's.
 */
export function frameHolePath(fw: number, fh: number, t: number, p: FramePlate | null, dx = 0, dy = 0): string {
  const X = (v: number): string => n(v + dx), Y = (v: number): string => n(v + dy);
  const tail = `H${X(fw - t)}V${Y(fh - t)}H${X(t)}Z`;
  if (!p) return `M${X(t)} ${Y(t)}${tail}`;
  const { x0, x1, y1, r } = p;
  const br = Math.min(r, (x1 - x0) / 2, y1 - t - r);
  return (
    `M${X(t)} ${Y(t)}H${X(x0 - r)}A${n(r)} ${n(r)} 0 0 1 ${X(x0)} ${Y(t + r)}` +
    `V${Y(y1 - br)}A${n(br)} ${n(br)} 0 0 0 ${X(x0 + br)} ${Y(y1)}` +
    `H${X(x1 - br)}A${n(br)} ${n(br)} 0 0 0 ${X(x1)} ${Y(y1 - br)}` +
    `V${Y(t + r)}A${n(r)} ${n(r)} 0 0 1 ${X(x1 + r)} ${Y(t)}` +
    tail
  );
}

/**
 * The rim and plate: the rounded outer edge and the hole, for `clip-path:
 * path(evenodd, …)`, moved by (`dx`, `dy`) from the frame box.
 */
export function frameRimPath(fw: number, fh: number, t: number, p: FramePlate | null, dx = 0, dy = 0): string {
  const R = Math.min(RIM_R, t);
  const X = (v: number): string => n(v + dx), Y = (v: number): string => n(v + dy);
  const outer =
    `M${X(R)} ${Y(0)}H${X(fw - R)}A${n(R)} ${n(R)} 0 0 1 ${X(fw)} ${Y(R)}V${Y(fh - R)}A${n(R)} ${n(R)} 0 0 1 ${X(fw - R)} ${Y(fh)}` +
    `H${X(R)}A${n(R)} ${n(R)} 0 0 1 ${X(0)} ${Y(fh - R)}V${Y(R)}A${n(R)} ${n(R)} 0 0 1 ${X(R)} ${Y(0)}Z`;
  return outer + frameHolePath(fw, fh, t, p, dx, dy);
}

/** A strip of the frame box (frame-box px). */
export interface FrameStrip {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The rim's glass in four strips (top with the plate, left, right, bottom),
 * each a small box: a backdrop blur costs by the area of its box, not of
 * what its clip leaves, and one box round the whole rim cost as much as the
 * pane's whole inside (ADR 0091 addendum: glass rim and nameplate).
 */
export function frameStrips(fw: number, fh: number, t: number, p: FramePlate | null): FrameStrip[] {
  const th = Math.min(fh, Math.max(t, p ? p.y1 : 0));
  return [
    { x: 0, y: 0, w: fw, h: th },
    { x: 0, y: th, w: t, h: Math.max(0, fh - t - th) },
    { x: fw - t, y: th, w: t, h: Math.max(0, fh - t - th) },
    { x: 0, y: fh - t, w: fw, h: t },
  ];
}

/**
 * The hole's edge as two open paths for the inner seam (stroked twice the
 * seam width on the edge; the rim's clip keeps the half inside the glass):
 * `dark` where the thick glass meets the pane in shadow (left, top, the
 * fillets and the plate's sides and lower corners), `light` where it catches
 * the light (the plate's bottom, the right and the bottom).
 */
export function frameSeams(fw: number, fh: number, t: number, p: FramePlate | null): { dark: string; light: string } {
  if (!p) return { dark: `M${n(t)} ${n(fh - t)}V${n(t)}H${n(fw - t)}`, light: `M${n(fw - t)} ${n(t)}V${n(fh - t)}H${n(t)}` };
  const { x0, x1, y1, r } = p;
  const br = Math.min(r, (x1 - x0) / 2, y1 - t - r);
  const dark =
    `M${n(t)} ${n(fh - t)}V${n(t)}H${n(x0 - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x0)} ${n(t + r)}` +
    `V${n(y1 - br)}A${n(br)} ${n(br)} 0 0 0 ${n(x0 + br)} ${n(y1)}` +
    `M${n(x1 - br)} ${n(y1)}A${n(br)} ${n(br)} 0 0 0 ${n(x1)} ${n(y1 - br)}` +
    `V${n(t + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x1 + r)} ${n(t)}H${n(fw - t)}`;
  const light = `M${n(x0 + br)} ${n(y1)}H${n(x1 - br)}M${n(fw - t)} ${n(t)}V${n(fh - t)}H${n(t)}`;
  return { dark, light };
}

/**
 * The top-row label for a pane `w` cells wide: ` Label ` from the fourth
 * cell (column 3), chopped so the top-right corner stays (empty when there is no
 * room). The old glyph row was `▛▀▀ Label ▀…▀▜`.
 */
export function frameLabel(w: number, label: string): string {
  if (!label || w < 5) return '';
  return ` ${label} `.slice(0, w - 4);
}
