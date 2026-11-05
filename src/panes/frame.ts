// Pane frame (Inv §2.1 "Pane frame", §10.4; ADR 0010, ADR 0091 "Frames",
// ADR 0123 "Lantern pane frame").
//
//   ┏━━━━━━━━━━━━╭─────────╮━━━━━━━━━━━━┓     a thin band of dark iron in the
//   ┃            │ •Title• │            ┃     outer frame cells, riveted corner
//   ┃            ╰─────────╯            ┃     brackets, and a small iron hood
//   ┃          (lamp-lit window)        ┃     centred on the top band holding
//   ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛     the title, lit from behind
//
// The frame owns the outer ring of cells (pane sizes, the content
// rectangle and the layout are as with the old quadrant glyphs). It is drawn
// as boxes and paths, not text (layout.css, pane.ts):
//
// - `.wc-pane-rim`: the iron. A box over the frame box, clipped to the band
//   plus the hood (`frameRimPath`, even-odd: the rounded outer edge and the
//   hole, `frameHolePath`), so band and hood are one piece. The corner
//   brackets are background layers of it (the clip keeps them in the band).
//   An SVG inside it strokes the hole's edge (the inner seam, `frameSeams`).
// - `.wc-pane-frame::before`: the window (the pane's fill and the lamp
//   light), clipped to the hole (the inside of the band less the hood).
// - `.wc-pane-title`: the hood's face and its label, centred on the frame;
//   on a pane too narrow for that and the hover buttons beside it, moved
//   left (down to the fourth cell, `framePlate`).
//
// The inset is the same horizontally and vertically, so the gap between two
// neighbouring frames is the same beside and above (owner feedback 15).
//
// `frameGeometry` puts every edge of the band on a whole device pixel of the
// page, not of the pane: panes sit at `col × cell-w`, which is fractional,
// and the cockpit itself may start at a fractional place (the app padding at
// a fractional pixel ratio), so whole device pixels relative to the pane are
// not enough for an equally thick, sharp band everywhere. `framePlate` does
// the same for the hood's edges.

/** Where the frame band of one pane sits (CSS px, relative to the pane's box). */
export interface FrameGeometry {
  /** Band thickness (every side). */
  t: number;
  /** Insets from the pane's left, right, top and bottom edges to the outside of the band. */
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
 * The band is the cell height over this, in whole device px (ADR 0123: ≈ 5 px
 * at the default 19 px cell, the mockup's 5 px band on a 17 px cell).
 */
export const BAND_DIV = 3.6;

/** Band thickness in device px for a cell `h` CSS px high: `h / BAND_DIV`, at least 3. */
export function frameThickness(h: number, dpr = 1): number {
  const d = dpr > 0 ? dpr : 1;
  return Math.max(3, Math.round((h * d) / BAND_DIV));
}

/**
 * Inset (CSS px) from every edge of a pane to the outside of its band, for a
 * `w` × `h` px cell: the same on all four sides, about a fifth of a cell
 * width (2 px at the default size: two neighbouring frames 4–4.5 px apart),
 * and at least 1 px clear of the content cells inside. The lamp's outer
 * glow lies in it (the pane's box clips it, ADR 0123 "Glow").
 */
export function frameInset(w: number, h: number, dpr = 1): number {
  const d = dpr > 0 ? dpr : 1;
  const t = frameThickness(h, d) / d;
  return Math.max(0.5, Math.min(Math.max(1, w / 4.5), w - t - 1));
}

const px = (v: number): number => Math.round(v * 1e4) / 1e4;

/**
 * The frame band of the pane at `box` (CSS px) for a `w` × `h` px cell at
 * `dpr`: `frameThickness` thick, `frameInset` in from every edge. Every edge
 * of the band is on a whole device pixel of the page (assuming `box` is
 * measured from a device-pixel aligned origin), so it is equally thick
 * everywhere.
 */
export function frameGeometry(box: PxRect, w: number, h: number, dpr = 1): FrameGeometry {
  const d = dpr > 0 ? dpr : 1;
  const tD = frameThickness(h, d);
  const i = frameInset(w, h, d);
  // Outer edges of the band in device px of the page.
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

/** The band's outer corner radius, CSS px. */
export const RIM_R = 3;

/** The corner brackets' arm length in band thicknesses (the mockup's 13 px on a 5 px band). */
export const BRACKET = 2.6;

/** The corner brackets' arm length in CSS px, whole device px (`BRACKET` bands). */
export function frameArm(g: FrameGeometry, dpr = 1): number {
  const d = dpr > 0 ? dpr : 1;
  return px(Math.round(BRACKET * g.t * d) / d);
}

/** The title's font size relative to the cell height (Cinzel Bold; the mockup's 11.5 px on a 17 px cell, ADR 0123). */
export const TITLE_SCALE = 0.62;

/** The title's letter spacing, em (layout.css `.wc-pane-title`). */
export const TITLE_TRACK = 0.08;

/** The title's font size in CSS px for a cell `h` px high (quarter px). */
export function titlePx(h: number): number {
  return Math.round(h * TITLE_SCALE * 4) / 4;
}

/** Room in the hood either side of the label, in cell widths: a rivet and air either side (the mockup's 14 px). */
export const HOOD_PAD = 1.4;

/** The hood's lower corner radius, CSS px (at most its depth below the band less a device px). */
export const HOOD_R = 6;

/**
 * The hood (ADR 0123 "Geometry"; it replaces the nameplate), in CSS px
 * relative to the frame box (the band's outer edge): `[x0, x1] × [y0, y1]`,
 * from the frame's top edge (`y0` 0) down past the band to `y1`, its lower
 * corners rounded by `r`, no fillets. The title's box is the same.
 */
export interface FramePlate {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  r: number;
}

/**
 * The widest label (CSS px) the hood can hold on this frame: the frame's
 * width less a corner bracket and a cell either side and the hood's
 * padding. Wider labels are shortened (`fitTitle`); with no room, no hood.
 */
export function hoodRoom(box: PxRect, g: FrameGeometry, w: number): number {
  const fw = box.w - g.l - g.r;
  return Math.max(0, fw - 2 * (BRACKET * g.t + w) - 2 * HOOD_PAD * w);
}

/**
 * `label`, or as much of it as fits in `room` px (`measure`: its width in
 * the title font) with an ellipsis, at least `min` characters of it; empty
 * when even that does not fit.
 */
export function fitTitle(label: string, room: number, measure: (s: string) => number, min = 2): string {
  const t = label.trim();
  if (!t || room <= 0) return '';
  if (measure(t) <= room) return t;
  for (let k = t.length - 1; k >= min; k--) {
    const s = `${t.slice(0, k).trimEnd()}…`;
    if (measure(s) <= room) return s;
  }
  return '';
}

/**
 * The hood's leftmost place, in cells from the pane's left edge: its left
 * edge at the start of the fourth cell, where the old nameplate sat (owner
 * feedback 2026-11-05), well clear of the corner bracket.
 */
export const HOOD_MIN_COL = 3;

/**
 * The hood for a label `textW` CSS px wide (measured in the title font):
 * `HOOD_PAD` cells wider than the label either side, from the frame's top
 * edge to one CSS px above 8/9 of the top cell row (the old plate's bottom,
 * owner item 40: clear of the first content row), its lower corners
 * rounded. Centred on the frame box when its right edge is then at or left
 * of `clearFrom` (CSS px from the pane's left edge: where the hover buttons
 * begin, ADR 0123 "Hood position and hover buttons"); otherwise moved left
 * just enough, but its left edge no further left than `HOOD_MIN_COL` cells
 * from the pane's edge (nor nearer the corner bracket than a cell), and
 * never right of centre. Every edge on a whole device pixel of the page;
 * centred, the space either side equal to the device px. Null without a
 * label, or when it does not fit (`hoodRoom`) or the top row leaves no
 * depth for it.
 */
export function framePlate(
  box: PxRect,
  g: FrameGeometry,
  w: number,
  h: number,
  textW: number,
  dpr = 1,
  clearFrom = Infinity,
): FramePlate | null {
  if (!(textW > 0) || textW > hoodRoom(box, g, w) + 1e-6) return null;
  const d = dpr > 0 ? dpr : 1;
  const tD = Math.round(g.t * d);
  const fx = box.x + g.l, fy = box.y + g.top;
  const one = Math.max(1, Math.round(d));
  // The frame box's sides and the hood's bottom in device px of the page.
  const X0 = Math.round(fx * d), X1 = Math.round((box.x + box.w - g.r) * d);
  const yb = Math.round((box.y + (h * 8) / 9) * d) - one;
  const yt = Math.round(fy * d) + tD;
  if (yb - yt < 3) return null;
  let hw = Math.ceil((textW + 2 * HOOD_PAD * w) * d - 1e-6);
  // Centred to the device px: the same space either side.
  if ((X1 - X0 - hw) % 2) hw += 1;
  if (hw > X1 - X0) return null;
  let xa = X0 + (X1 - X0 - hw) / 2;
  // Left of the hover buttons where it can be: moved left just enough, down to the fourth cell.
  const lim = Math.floor((box.x + clearFrom) * d + 1e-6);
  if (xa + hw > lim) {
    const lo = Math.max(Math.round((box.x + HOOD_MIN_COL * w) * d), X0 + Math.ceil((BRACKET * g.t + w) * d - 1e-6));
    xa = Math.min(xa, Math.max(lo, lim - hw));
  }
  const xb = xa + hw;
  const rD = Math.max(1, Math.min(Math.round(HOOD_R * d), yb - yt - one, Math.floor(hw / 2)));
  return { x0: px(xa / d - fx), x1: px(xb / d - fx), y0: 0, y1: px(yb / d - fy), r: px(rD / d) };
}

const n = (v: number): string => String(Math.round(v * 1e4) / 1e4);

/**
 * The hole in the band (the pane's inside less the hood), a closed path in
 * frame-box coordinates (`fw` × `fh`, the band's outer edges), moved by
 * (`dx`, `dy`): the window's clip and, with the outer edge, the band's.
 */
export function frameHolePath(fw: number, fh: number, t: number, p: FramePlate | null, dx = 0, dy = 0): string {
  const X = (v: number): string => n(v + dx), Y = (v: number): string => n(v + dy);
  const tail = `H${X(fw - t)}V${Y(fh - t)}H${X(t)}Z`;
  if (!p) return `M${X(t)} ${Y(t)}${tail}`;
  const { x0, x1, y1 } = p;
  const br = Math.max(0, Math.min(p.r, (x1 - x0) / 2, y1 - t));
  return (
    `M${X(t)} ${Y(t)}H${X(x0)}` +
    `V${Y(y1 - br)}A${n(br)} ${n(br)} 0 0 0 ${X(x0 + br)} ${Y(y1)}` +
    `H${X(x1 - br)}A${n(br)} ${n(br)} 0 0 0 ${X(x1)} ${Y(y1 - br)}` +
    `V${Y(t)}` +
    tail
  );
}

/**
 * The band and hood: the rounded outer edge and the hole, for `clip-path:
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

/**
 * The hole's edge as two open paths for the inner seam (stroked twice the
 * seam width on the edge; the band's clip keeps the half inside the iron):
 * `dark` where the band meets the window in shadow (left, top and round the
 * hood: its sides, lower corners and bottom), `light` where its inner edge
 * catches the lamp (the right and the bottom).
 */
export function frameSeams(fw: number, fh: number, t: number, p: FramePlate | null): { dark: string; light: string } {
  const light = `M${n(fw - t)} ${n(t)}V${n(fh - t)}H${n(t)}`;
  if (!p) return { dark: `M${n(t)} ${n(fh - t)}V${n(t)}H${n(fw - t)}`, light };
  const { x0, x1, y1 } = p;
  const br = Math.max(0, Math.min(p.r, (x1 - x0) / 2, y1 - t));
  const dark =
    `M${n(t)} ${n(fh - t)}V${n(t)}H${n(x0)}` +
    `V${n(y1 - br)}A${n(br)} ${n(br)} 0 0 0 ${n(x0 + br)} ${n(y1)}` +
    `H${n(x1 - br)}A${n(br)} ${n(br)} 0 0 0 ${n(x1)} ${n(y1 - br)}` +
    `V${n(t)}H${n(fw - t)}`;
  return { dark, light };
}
