// Pane frame (Inv §2.1 "Pane frame", §10.4; ADR 0010, ADR 0091 "Frames").
//
//   ┌── Character ───────────────┐      one thin line, equal on all four
//   │                            │      sides, in the outer frame cells,
//   └────────────────────────────┘      the title on top of it
//
// The frame still owns the outer ring of cells (pane sizes, the content
// rectangle and the layout are as with the old quadrant glyphs), but it is
// drawn as a CSS box, not as text: `.wc-pane-frame` is inset `frameInset` px
// from every edge of the pane and draws a `t`-px line in the pane's border
// colour (layout.css: a lighter core between two edge bands, the same on
// every side). The inset is the same horizontally and vertically, so the gap
// between two neighbouring frames is the same beside and above (owner
// feedback 15). The ring outside the line is left unpainted. The label is
// text in the top row, three cells in, drawn over the unbroken top line.
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

/**
 * The top-row label for a pane `w` cells wide: ` Label ` from the fourth
 * cell (column 3), chopped so the top-right corner stays (empty when there is no
 * room). The old glyph row was `▛▀▀ Label ▀…▀▜`.
 */
export function frameLabel(w: number, label: string): string {
  if (!label || w < 5) return '';
  return ` ${label} `.slice(0, w - 4);
}
