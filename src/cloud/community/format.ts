// The community's figures as words, one set for the Community page, the
// watch page and Published runs (stage 65 review fix CR6): a run's mean
// stars, the whole stars drawn for it, and the age of a comment or a note.
// Pure and free of imports, so any chunk can carry it.

/** A run's stars as the contract has them. */
export interface StarSums {
  sum: number;
  count: number;
}

/** The mean with one decimal, rounded half up ("4.3", "4.4" for 4.35); null without votes. */
export function meanText(s: StarSums | undefined): string | null {
  if (!s || !(s.count > 0) || !Number.isFinite(s.sum)) return null;
  return (Math.round((s.sum / s.count) * 10) / 10).toFixed(1);
}

/** Whole stars to light for a mean (0–5): the mean rounded; 0 without votes. */
export function meanStars(s: StarSums): number {
  return s.count > 0 && Number.isFinite(s.sum) ? Math.max(0, Math.min(5, Math.round(s.sum / s.count))) : 0;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "26 September 2026" (local time); `t` in ms, as the Worker sends every time. */
export function dateText(t: number): string {
  const d = new Date(t);
  if (!Number.isFinite(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * An age: "just now", "5 min", "3 h", "yesterday", "4 days" (with `ago`:
 * "5 min ago", "3 h ago", "4 days ago"), then the date from 30 days.
 */
export function ageText(t: number, now: number, o: { ago?: boolean } = {}): string {
  const min = Math.floor(Math.max(0, now - t) / 60_000);
  const ago = o.ago ? ' ago' : '';
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min${ago}`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h${ago}`;
  const days = Math.floor(h / 24);
  if (days < 2) return 'yesterday';
  if (days < 30) return `${days} days${ago}`;
  return dateText(t);
}
