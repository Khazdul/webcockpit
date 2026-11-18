// The start page's arrival on a page (stage 73 part D, ADR 0155 addendum
// 2026-11-18): the watch page's Back for a run opened from the Community
// page or the Account page is `<base>?community`, `<base>?account` or
// `<base>?account=published` (src/watch/href.ts `backHref`), a full page
// load. The page asked for opens over the menu once its flags and its
// chunk are there; until then the start page holds its menu and its
// scenery hidden (the sky alone is drawn) and the surface's morph and
// hold are off, so the viewer sees the page asked for straight away, not
// the menu first and then the page sliding in over it.
//
// The arrival ends (`endArrival`) when the page has been pushed, when it
// is not allowed or fails (the menu shows as before), or after
// `ARRIVAL_MS` at the latest (a slow link: the menu, and the page morphs
// in over it later as before). It ends two frames after the call, so the
// pushed page's own scenery (the wordmark lifted away, or the sub-page's
// smaller mark) is in place before the scenery shows again, and none of
// its transitions plays.
//
// No imports: the first paint (src/boot/first-paint.ts) uses `arrivalOf`
// to leave the wordmark and the menu's loading panel out on such a load.

export type Arrival = 'community' | 'account';

/** The page a start page address asks for (`?community`, `?account`, `?account=published`), or null. */
export function arrivalOf(search: string): Arrival | null {
  const q = new URLSearchParams(search);
  if (q.has('community')) return 'community';
  if (q.has('account')) return 'account';
  return null;
}

/** The longest the menu stays hidden for an arrival (ms): then it shows as before. */
export const ARRIVAL_MS = 3000;

let on: boolean | null = null;
let ending = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const subs = new Set<(on: boolean) => void>();

function set(next: boolean): void {
  if (timer) clearTimeout(timer);
  timer = null;
  ending = false;
  if (on === next) return;
  on = next;
  for (const fn of [...subs]) fn(next);
}

/**
 * Whether the start page is arriving on a page now. Decided on the first
 * call of a page load, from the address (the start page takes the query
 * out of the address after its first render, start-main.tsx).
 */
export function arriving(): boolean {
  if (on === null) beginArrival(arrivalOf(globalThis.location?.search ?? '') !== null);
  return on === true;
}

/** Starts (or, `false`, rules out) an arrival, with its safety timeout. Tests call it directly. */
export function beginArrival(yes: boolean, ms: number = ARRIVAL_MS): void {
  set(yes);
  if (yes) timer = setTimeout(() => set(false), ms);
}

/** Ends the arrival two frames from now (a no-op without one). */
export function endArrival(): void {
  if (!arriving() || ending) return;
  ending = true;
  const raf = globalThis.requestAnimationFrame;
  if (typeof raf === 'function') raf(() => raf(() => ending && set(false)));
  else setTimeout(() => ending && set(false), 32);
}

/** Calls `fn` when the arrival starts or ends; returns the unsubscribe. */
export function onArrival(fn: (on: boolean) => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}
