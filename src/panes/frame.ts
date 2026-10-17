// Pane frame (Inv §2.1 "Pane frame", §10.4; ADR 0010, ADR 0091 "Frames").
//
//   ┌── Character ──────────────┐      one thin line, equal on all four
//   │                           │      sides, in the outer frame cells;
//   │                           │      the top line ends either side of
//   └───────────────────────────┘      the title (a gap, no box)
//
// The frame still owns the outer ring of cells (pane sizes, the content
// rectangle and the layout are as with the old quadrant glyphs), but it is
// drawn as a box and an SVG path, not as text: `.wc-pane-frame` is inset
// `frameInset` px from every edge of the pane, its `::before` is the fill
// (from the line's inner edge down), and `svg.wc-pane-line` strokes the
// `t`-px line along `framePath` (layout.css: a core between two edge bands,
// the same on every side and every bend). The inset is the same horizontally
// and vertically, so the gap between two neighbouring frames is the same
// beside and above (owner feedback 15). The ring outside the line is left
// unpainted. The label is text from the fourth cell, centred on the top
// line, which ends a little before it and resumes after it (`frameGap`,
// owner feedback 32): nothing behind the letters but what is behind the pane.
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
 * The stretch of the top line left out for the title (owner feedback 32; it
 * wound down under the title in a notch before), in CSS px relative to the
 * frame box (the line's outer edge): the line ends at `x0` and resumes at
 * `x1`, square cut. The title is centred between them (layout.css).
 */
export interface FrameGap {
  x0: number;
  x1: number;
}

/** Room between the label's outer letters and each end of the line, in title spaces (TITLE_SCALE cells). */
export const GAP_PAD = 0.5;

/**
 * The gap for a title of `chars` characters (` Label `, spaces included)
 * from the fourth cell, at TITLE_SCALE: from the middle of its leading space
 * to the middle of its trailing one, so the line ends the same distance from
 * the first and the last letter; both ends on whole device pixels of the
 * page and clear of the corners. Null without a title or room for one.
 */
export function frameGap(box: PxRect, g: FrameGeometry, w: number, chars: number, dpr = 1): FrameGap | null {
  if (chars < 3) return null;
  const d = dpr > 0 ? dpr : 1;
  const tD = Math.round(g.t * d);
  const s = w * TITLE_SCALE;
  const xt = box.x + LABEL_COL * w;
  // a stub of at least a line's thickness past each corner
  const xMin = Math.round((box.x + g.l) * d) + 2 * tD;
  const xMax = Math.round((box.x + box.w - g.r) * d) - 2 * tD;
  const xa = Math.max(xMin, Math.round((xt + GAP_PAD * s) * d));
  const xb = Math.min(xMax, Math.round((xt + (chars - GAP_PAD) * s) * d));
  if (xb - xa < 2 * tD) return null;
  const px = (v: number): number => Math.round(v * 1e4) / 1e4;
  const fx = box.x + g.l;
  return { x0: px(xa / d - fx), x1: px(xb / d - fx) };
}

/**
 * The SVG path through the middle of the line, in frame-box coordinates
 * (`fw` × `fh`, the line's outer edges). Stroked `t` wide with butt caps it
 * covers exactly the line. With a gap it is open: from the gap's right end
 * round the frame to its left end, each end `cut` px short of the gap (the
 * core stroke stops short, so the edge band closes the tube's ends).
 */
export function framePath(fw: number, fh: number, t: number, gap: FrameGap | null, cut = 0): string {
  const c = t / 2;
  const r = (v: number): string => String(Math.round(v * 1e4) / 1e4);
  if (!gap) return `M${r(c)} ${r(fh - c)}V${r(c)}H${r(fw - c)}V${r(fh - c)}Z`;
  return `M${r(gap.x1 + cut)} ${r(c)}H${r(fw - c)}V${r(fh - c)}H${r(c)}V${r(c)}H${r(gap.x0 - cut)}`;
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
