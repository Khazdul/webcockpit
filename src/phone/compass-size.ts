// The compass keys' size (ADR 0136 §7) and what follows from it. Pure.
//
// The keys are 36 px in portrait and 44 px in landscape (stage 52: the
// owner's choice from play, no longer a setting). The compass is three keys and two
// 3 px gaps from the bottom edge with an 8 px margin; the hot key column
// stands 8 px above it with keys of the same size; the command field ends
// 8 px left of the compass. phone.css lays all of it out from `--ph-ck`
// with the same sums; the lens's room and the hot key box's place are
// computed here. Stage 52: a second hot key column stands left of the first,
// one gap apart.

/** A key's side in px: portrait, landscape. */
export const KEY_PX_PORTRAIT = 36;
export const KEY_PX_LANDSCAPE = 44;
/** Between two keys, and the compass's margin to the screen's edges. */
export const KEY_GAP = 3;
export const PAD_MARGIN = 8;
/** Between the compass and the hot key column. */
export const HOT_ABOVE = 8;

/**
 * A key's side in px for the screen's shape. Landscape has the large keys
 * only where the screen is high enough for them (`landscapeFits`): a phone
 * outside fullscreen keeps some 270 to 280 px under its bars, and there
 * three large hot keys would be cut off at the top.
 */
export function compassPx(landscape: boolean, height = Infinity): number {
  return landscape && landscapeFits(KEY_PX_LANDSCAPE, height) ? KEY_PX_LANDSCAPE : KEY_PX_PORTRAIT;
}

/** Air above the hot key column's third key, and the room the lens needs above the compass in landscape (its least size with the air above and below). */
export const HOT_TOP_MARGIN = 8;
export const LAND_LENS_ROOM = 96 + 12 + 12;

/**
 * Whether a landscape screen `height` px high holds keys of `px`: a column
 * of three hot keys with a margin above it, and the lens at its least size
 * above the compass.
 */
export function landscapeFits(px: number, height: number): boolean {
  return height >= hotTop(px, 3) + HOT_TOP_MARGIN && height >= compassHeight(px) + LAND_LENS_ROOM;
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

/**
 * The height from the bottom edge the pane strip, the fight card and Comm
 * stay above (stage 52): the top of the place of three hot keys, whether
 * they are shown or not and however many are in use.
 */
export function topLimit(px: number): number {
  return hotTop(px, 3);
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

/**
 * Landscape (stage 52c): the lens and its key row stand left of the hot
 * key columns, whether the columns are shown or not (so neither jumps when
 * K is tapped). The offset from the right edge of what stands there: the
 * margin, `cols` columns of keys, and `air`.
 */
export function leftOfHot(px: number, cols: number, air: number): number {
  return PAD_MARGIN + hotWidth(px, cols) + air;
}

/**
 * Landscape: the width from the right edge the left column never reaches:
 * the hot key columns, and left of them the wider of the lens at its least
 * size with its overhanging keys and the key row, with `air` on both sides.
 * The compass (three keys) is never wider than that.
 */
export function sideClear(px: number, cols: number, lensMin: number, rowWidth: number, air: number): number {
  return Math.max(leftOfHot(px, cols, air) + Math.max(lensMin, rowWidth) + air, 3 * px + 2 * KEY_GAP + PAD_MARGIN + air);
}
