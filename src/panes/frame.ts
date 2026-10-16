// Pane frame (Inv §2.1 "Pane frame", §10.4; ADR 0010, ADR 0091 "Frames").
//
//   ┌─── Character ──────────────┐      one thin line, equal on all four
//   │                            │      sides, in the middle of the outer
//   └────────────────────────────┘      frame cells
//
// The frame still owns the outer ring of cells (pane sizes, the content
// rectangle and the layout are as with the old quadrant glyphs), but it is
// drawn as a CSS box, not as text: `.wc-pane-frame` is inset about half a
// cell (less half the line) from the pane's edges and draws a `t`-px line
// in the pane's border colour, a little lifted (layout.css). The half cell outside the line
// is left unpainted, so neighbouring panes have a visible gap. The label is
// text in the top row, three cells in; the top line is drawn as two pieces
// either side of it (no box behind the label), as the `▀▀ Label ▀…` run did.
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

/** Line thickness in device px for a cell `h` CSS px high: about a ninth of it, at least 2. */
export function frameThickness(h: number, dpr = 1): number {
  const d = dpr > 0 ? dpr : 1;
  return Math.max(2, Math.round((h * d) / 9));
}

/**
 * The frame line of the pane at `box` (CSS px) for a `w` × `h` px cell at
 * `dpr`: about a ninth of the cell height (2 px at the default size), at
 * least 2 device px, centred in the outer cells. Every edge of the line is on
 * a whole device pixel of the page (assuming `box` is measured from a
 * device-pixel aligned origin), so the line is equally thick everywhere.
 */
export function frameGeometry(box: PxRect, w: number, h: number, dpr = 1): FrameGeometry {
  const d = dpr > 0 ? dpr : 1;
  const tD = frameThickness(h, d);
  // Outer edges of the line in device px of the page.
  const x0 = Math.round((box.x + w / 2) * d - tD / 2);
  const x1 = Math.round((box.x + box.w - w / 2) * d + tD / 2);
  const y0 = Math.round((box.y + h / 2) * d - tD / 2);
  const y1 = Math.round((box.y + box.h - h / 2) * d + tD / 2);
  const px = (v: number): number => Math.round(v * 1e4) / 1e4;
  return {
    t: px(tD / d),
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
