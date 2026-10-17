// Pane frame (Inv §2.1 "Pane frame", §10.4; ADR 0010, ADR 0091 "Frames").
//
//   ┌──┐ Character ┌─────────────┐      one thin line, equal on all four
//   │  └───────────┘             │      sides, in the outer frame cells;
//   │                            │      at the title the top line winds
//   └────────────────────────────┘      down under it and back up
//
// The frame still owns the outer ring of cells (pane sizes, the content
// rectangle and the layout are as with the old quadrant glyphs), but it is
// drawn as a box and an SVG path, not as text: `.wc-pane-frame` is inset
// `frameInset` px from every edge of the pane, its `::before` is the fill,
// and `svg.wc-pane-line` strokes the `t`-px line along `framePath` (layout.css:
// a core between two edge bands, the same on every side and every bend). The
// inset is the same horizontally and vertically, so the gap between two
// neighbouring frames is the same beside and above (owner feedback 15). The
// ring outside the line is left unpainted. The label is text in the top row
// from the fourth cell, in the notch (`frameNotch`): the floor runs under it
// on the first content row's top, so it never crosses the letters (owner
// feedback 16).
//
// `frameGeometry` puts every edge of the line on a whole device pixel of the
// page, not of the pane: panes sit at `col × cell-w`, which is fractional,
// and the cockpit itself may start at a fractional place (the app padding at
// a fractional pixel ratio), so whole device pixels relative to the pane are
// not enough for an equally thick, sharp line everywhere.

/** Column of the label's first cell (the old `▛▀▀` took columns 0–2). */
export const LABEL_COL = 3;

/** Where the frame line of one pane sits (CSS px, relative to the pane's box). */
export interface FrameGeometry {
  /** Line thickness (every side). */
  t: number;
  /** Thickness of each edge band of the line (the lighter core is `t - 2e`). */
  e: number;
  /** Insets from the pane's left, right, top and bottom edges to the outside of the line. */
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

/** The first thin frames' line (stage 28 A) in device px: about a ninth of the cell height, at least 2. */
function baseThickness(h: number, d: number): number {
  return Math.max(2, Math.round((h * d) / 9));
}

/**
 * Line thickness in device px for a cell `h` CSS px high: the first thin
 * frames' ninth of the cell height plus one CSS px (owner feedback 14): 3 px
 * at the default size and ratio 1.
 */
export function frameThickness(h: number, dpr = 1): number {
  const d = dpr > 0 ? dpr : 1;
  return baseThickness(h, d) + Math.max(1, Math.round(d));
}

/** Thickness of each edge band of a `tD` device px line, in device px (the core keeps at least a third). */
export function frameEdge(tD: number): number {
  return Math.max(1, Math.floor(tD / 3));
}

/**
 * Inset (CSS px) from every edge of a pane to the outside of its frame line,
 * for a `w` × `h` px cell: the same on all four sides. Two neighbouring
 * frames are `2 × inset` apart: 1.5 px less than the first thin frames' gap
 * beside each other (a cell width less their line), 6–7 px at the default
 * size; above each other the same (owner feedback 15; it was a cell height
 * less the line, 17 px).
 */
export function frameInset(w: number, h: number, dpr = 1): number {
  const d = dpr > 0 ? dpr : 1;
  return Math.max(0.5, (w - baseThickness(h, d) / d - 1.5) / 2);
}

/**
 * The frame line of the pane at `box` (CSS px) for a `w` × `h` px cell at
 * `dpr`: `frameThickness` thick, `frameInset` in from every edge. Every edge
 * of the line is on a whole device pixel of the page (assuming `box` is
 * measured from a device-pixel aligned origin), so the line is equally thick
 * everywhere.
 */
export function frameGeometry(box: PxRect, w: number, h: number, dpr = 1): FrameGeometry {
  const d = dpr > 0 ? dpr : 1;
  const tD = frameThickness(h, d);
  const i = frameInset(w, h, d);
  // Outer edges of the line in device px of the page.
  const x0 = Math.round((box.x + i) * d);
  const x1 = Math.round((box.x + box.w - i) * d);
  const y0 = Math.round((box.y + i) * d);
  const y1 = Math.round((box.y + box.h - i) * d);
  const px = (v: number): number => Math.round(v * 1e4) / 1e4;
  return {
    t: px(tD / d),
    e: px(frameEdge(tD) / d),
    l: px(x0 / d - box.x),
    r: px(box.x + box.w - x1 / d),
    top: px(y0 / d - box.y),
    b: px(box.y + box.h - y1 / d),
  };
}

/** The title's font size relative to the text (layout.css `.wc-pane-title`). */
export const TITLE_SCALE = 0.82;

/**
 * Where the top line winds down under the title (owner feedback 16), in CSS
 * px relative to the frame box (the line's outer edge): the line leaves the
 * top side at `x0 − t` (the left step's outer side), runs down, along the
 * floor `[d, d + t]` and back up at `x1 + t`. `x0`..`x1` is the clear space
 * the title sits in, above `d`.
 */
export interface FrameNotch {
  x0: number;
  x1: number;
  d: number;
}

/**
 * The notch for a title of `chars` characters (` Label `, spaces included)
 * from the fourth cell, at TITLE_SCALE: the floor's lower edge on the first
 * content row's top (the line stays inside the top cell row), the steps on
 * whole device pixels of the page. Null without a title, or when the cell is
 * too small for a floor below the top line.
 */
export function frameNotch(box: PxRect, g: FrameGeometry, w: number, h: number, chars: number, dpr = 1): FrameNotch | null {
  if (chars < 3) return null;
  const d = dpr > 0 ? dpr : 1;
  const tD = Math.round(g.t * d);
  const floorTop = Math.round((box.y + h) * d) - tD;
  if (floorTop - Math.round((box.y + g.top + g.t) * d) < 2) return null;
  const xa = Math.round((box.x + LABEL_COL * w) * d);
  // the right step stays clear of the right side line
  const xMax = Math.round((box.x + box.w - g.r - g.t) * d) - 2 * tD;
  const xb = Math.min(xMax, Math.round((box.x + LABEL_COL * w + chars * w * TITLE_SCALE) * d));
  if (xb - xa < 2 * tD) return null;
  const px = (v: number): number => Math.round(v * 1e4) / 1e4;
  const fx = box.x + g.l, fy = box.y + g.top;
  return { x0: px(xa / d - fx), x1: px(xb / d - fx), d: px(floorTop / d - fy) };
}

/**
 * The SVG path through the middle of the line, in frame-box coordinates
 * (`fw` × `fh`, the line's outer edges), with the notch if any. Stroked
 * `t` wide it covers exactly the line.
 */
export function framePath(fw: number, fh: number, t: number, n: FrameNotch | null): string {
  const c = t / 2;
  const r = (v: number): string => String(Math.round(v * 1e4) / 1e4);
  const top = n ? `H${r(n.x0 - c)}V${r(n.d + c)}H${r(n.x1 + c)}V${r(c)}` : '';
  return `M${r(c)} ${r(fh - c)}V${r(c)}${top}H${r(fw - c)}V${r(fh - c)}Z`;
}

/** The frame fill's clip (CSS `clip-path`): the frame box without the notch above its floor. */
export function notchClip(n: FrameNotch | null): string {
  if (!n) return 'none';
  return `polygon(0 0, ${n.x0}px 0, ${n.x0}px ${n.d}px, ${n.x1}px ${n.d}px, ${n.x1}px 0, 100% 0, 100% 100%, 0 100%)`;
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
