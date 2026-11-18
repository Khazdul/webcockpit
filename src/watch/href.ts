// The way to a run's watch page and back (stage 65, ADR 0155 C1 and W1;
// review fix 2 CR9: one place for the addresses and the dev server's e2e
// hook `?cloudtest`). Tiny and without imports, so the Community page, the
// Account page's Published runs and the watch page share it without
// pulling each other's chunks.
//
// Since stage 74 A (ADR 0163) a run opened from those pages is a frame on
// the start surface: `watchHref` is the address it shows by
// `history.pushState` (src/watch/embed.tsx), and its Back is the browser's.
// `backHref` is the standalone page's Back (a bare link, a reload on a
// run's address): a page load.

/** Where a run's watch page was opened from: its Back goes there again. */
export type WatchFrom = 'community' | 'account' | 'published';

/** The dev server's e2e hook `?cloudtest`, kept on the way to a run and back (never in a build). */
export function keepCloudtest(search: string = globalThis.location?.search ?? ''): boolean {
  return import.meta.env?.DEV === true && new URLSearchParams(search).has('cloudtest');
}

const siteBase = (): string => (import.meta.env?.BASE_URL as string | undefined) ?? '/';

/**
 * A run's watch page opened from `from`: `<base>r/<id>?from=<from>` (the
 * Community page, the Account page, Published runs; review fix 2 CR9: the
 * one way there, with `backHref` the one way back).
 */
export function watchHref(id: string, from: WatchFrom, base: string = siteBase(), cloudtest: boolean = keepCloudtest()): string {
  return `${base}r/${encodeURIComponent(id)}?from=${from}${cloudtest ? '&cloudtest' : ''}`;
}

/**
 * The standalone watch page's Back for a run opened from `view`: `<base>?community`,
 * `<base>?account` or `<base>?account=published`, which the start page
 * takes once (start-main.tsx `takeStartQuery`).
 */
export function backHref(view: WatchFrom, base: string = siteBase(), cloudtest: boolean = keepCloudtest()): string {
  const q = view === 'community' ? 'community' : view === 'published' ? 'account=published' : 'account';
  return `${base}?${q}${cloudtest ? '&cloudtest' : ''}`;
}
