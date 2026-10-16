// Pane frame (Inv §2.1 "Pane frame", §10.4; ADR 0010, ADR 0091 "Frames").
//
//   ┌─── Character ──────────────┐      one thin line, equal on all four
//   │                            │      sides, in the middle of the outer
//   └────────────────────────────┘      frame cells
//
// The frame still owns the outer ring of cells (pane sizes, the content
// rectangle and the layout are as with the old quadrant glyphs), but it is
// drawn as a CSS box, not as text: `.wc-pane-frame` is inset half a cell
// (less half the line) from the pane's edge and has a `t`-px border with a
// slight bevel (layout.css). The half cell outside the line is left
// unpainted, so neighbouring panes have a visible gap. The label is text
// in the top row, three cells in, on a band of the pane background that
// breaks the line as the `▀▀ Label ▀…` run did.
//
// `frameGeometry` snaps the line to device pixels, so it stays crisp at any
// cell size and pixel ratio.

/** Column of the label's first cell (the old `▛▀▀` took columns 0–2). */
export const LABEL_COL = 3;

/** Where the frame line sits in a `w` × `h` px cell at pixel ratio `dpr` (CSS px). */
export interface FrameGeometry {
  /** Line thickness (every side). */
  t: number;
  /** Inset from the pane's left and right edges to the outside of the line. */
  x: number;
  /** Inset from the pane's top and bottom edges to the outside of the line. */
  y: number;
}

/**
 * The frame line for a cell of `w` × `h` CSS px at `dpr`: about a ninth of
 * the cell height (2 px at the default size), at least 2 device px, centred
 * in the cell, all in whole device pixels.
 */
export function frameGeometry(w: number, h: number, dpr = 1): FrameGeometry {
  const d = dpr > 0 ? dpr : 1;
  const tD = Math.max(2, Math.round((h * d) / 9));
  const xD = Math.max(0, Math.round((w * d - tD) / 2));
  const yD = Math.max(0, Math.round((h * d - tD) / 2));
  const px = (v: number): number => Math.round((v / d) * 1e4) / 1e4;
  return { t: px(tD), x: px(xD), y: px(yD) };
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
