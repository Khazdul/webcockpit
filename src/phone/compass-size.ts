// The compass keys' size (ADR 0136 §7) and what follows from it. Pure.
//
// S, M and L are 36, 40 and 44 px keys. The compass is three keys and two
// 3 px gaps from the bottom edge with an 8 px margin; the hot key column
// stands 8 px above it with keys of the same size; the command field ends
// 8 px left of the compass. phone.css lays all of it out from `--ph-ck`
// with the same sums; the lens's room and the hot key box's place are
// computed here. Stage 52: a second hot key column stands left of the first,
// one gap apart.

import type { PhoneCompassSize } from '../settings/types';

const PX: Readonly<Record<PhoneCompassSize, number>> = { s: 36, m: 40, l: 44 };
/** Between two keys, and the compass's margin to the screen's edges. */
export const KEY_GAP = 3;
export const PAD_MARGIN = 8;
/** Between the compass and the hot key column. */
export const HOT_ABOVE = 8;

/** A key's side in px; an unknown size is the middle one. */
export function compassPx(size: string): number {
  return PX[size as PhoneCompassSize] ?? PX.m;
}

/** What the compass takes from the bottom edge. */
export function compassHeight(px: number): number {
  return 3 * px + 2 * KEY_GAP + PAD_MARGIN;
}

/** The hot key column's foot above the bottom edge. */
export function hotBottom(px: number): number {
  return compassHeight(px) + HOT_ABOVE;
}

/** From one hot key's foot to the next. */
export function hotStep(px: number): number {
  return px + KEY_GAP;
}

/** The column's top above the bottom edge with `n` keys (n ≥ 1). */
export function hotTop(px: number, n: number): number {
  return hotBottom(px) + n * hotStep(px) - KEY_GAP;
}

/** What the hot key columns take sideways from the right margin: `cols` keys and the gaps between them. */
export function hotWidth(px: number, cols: number): number {
  return cols * px + (cols - 1) * KEY_GAP;
}

/**
 * The right offset of the lens's key row (the lens hidden: the row stands
 * at the top right, where the hot key columns are). `rowFoot` is the row's
 * lower edge with its air, from the top of a layer `height` high; `rows`
 * the keys in the first column (along the edge) and in the second (left of
 * it), 0 for a column that is not there. The row is wider than both
 * columns, so it stands left of the leftmost column it would reach into:
 * a column lower than the row's foot is passed over.
 */
export function keyRowRight(rowFoot: number, height: number, px: number, rows: readonly [number, number], air: number): number {
  const reached = (n: number): boolean => n > 0 && rowFoot > height - hotTop(px, n);
  if (reached(rows[1])) return PAD_MARGIN + hotWidth(px, 2) + air;
  if (reached(rows[0])) return PAD_MARGIN + px + air;
  return PAD_MARGIN;
}
