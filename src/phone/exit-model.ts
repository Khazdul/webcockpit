// The Exit session confirmation's rating keys (exit-sheet.tsx). Pure.
//
// The same keys as the ESC menu's Exit confirm and the menu bar's Exit
// popup (Inv §4.6; src/chrome/kit/widgets.tsx `ratingKey`, which this
// chunk may not import: kit.ts): 0 to 5 set the rating, ← and → step it.

export const RATING_MAX = 5;

/** The part of a key event read here. */
export interface RatingKey {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}

/** The rating after key `e` at rating `cur`, or null when it is not a rating key. */
export function ratingFromKey(e: RatingKey, cur: number): number | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  if (/^[0-5]$/.test(e.key)) return Number(e.key);
  if (e.key === 'ArrowLeft') return Math.max(0, cur - 1);
  if (e.key === 'ArrowRight') return Math.min(RATING_MAX, cur + 1);
  return null;
}

/** True for the key that confirms the exit (Y, as in the other two dialogs). */
export function isExitKey(e: RatingKey): boolean {
  return (e.key === 'y' || e.key === 'Y') && !e.ctrlKey && !e.altKey && !e.metaKey;
}

/** A star's name for a screen reader: `1 star`, `3 stars`. */
export function starLabel(n: number): string {
  return `${n} star${n === 1 ? '' : 's'}`;
}
