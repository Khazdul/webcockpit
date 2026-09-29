// Page wiring of the client notices (ADR 0025, src/app/notices.ts).
//
// - Update check (production builds only; main.ts decides): when the page
//   becomes visible or the window gains focus (throttled to one check a
//   minute by UpdateChecker) and every 10 minutes.
// - Lazy chunk failures: Vite's `vite:preloadError` event and unhandled
//   rejections that are failed dynamic imports. The preload event is NOT
//   `preventDefault`ed: Vite would then resolve the import to `undefined`
//   instead of rejecting it, and every call site already handles the
//   rejection (the chrome retries, the player reports it). A failed import
//   nobody handled is reported here and its rejection marked handled.
//   Either also forces an update check, so the indicator shows the version.
// - A superseded database (src/core/db.ts `onDbSuperseded`).

import { CLIENT_COMMIT, CLIENT_VERSION } from '../core/build-info';
import { onDbSuperseded } from '../core/db';
import type { Notices } from './notices';
import { type FetchLike, UpdateChecker } from './update-check';

/** Periodic check while the page is open. */
export const UPDATE_POLL_MS = 10 * 60_000;

export interface NoticesWiringOptions {
  /** Run the update check (production builds). */
  checkUpdates: boolean;
  /** The manifest's URL (default `<base>release.json`). */
  url?: string;
  fetch?: FetchLike;
  now?: () => number;
}

/** Browser messages of a failed dynamic `import()` / Vite preload. */
const CHUNK_ERROR = /dynamically imported module|Importing a module script failed|Unable to preload CSS/i;

/** True when `reason` is a failed dynamic import of a chunk. */
export function isChunkLoadError(reason: unknown): boolean {
  const msg = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : '';
  return CHUNK_ERROR.test(msg);
}

/** Installs the notice sources on `win`; returns the uninstall function. */
export function installNotices(win: Window, notices: Notices, o: NoticesWiringOptions): () => void {
  const offs: Array<() => void> = [];
  const on = <K extends string>(target: EventTarget, type: K, fn: (e: Event) => void): void => {
    target.addEventListener(type, fn);
    offs.push(() => target.removeEventListener(type, fn));
  };

  offs.push(onDbSuperseded(() => notices.storageSuperseded()));

  const checker = o.checkUpdates
    ? new UpdateChecker({
        current: { version: CLIENT_VERSION, commit: CLIENT_COMMIT },
        fetch: o.fetch ?? ((url, init) => win.fetch(url, init)),
        now: o.now ?? Date.now,
        ...(o.url ? { url: o.url } : {}),
        onNewVersion: (r) => notices.newVersion(r),
      })
    : null;

  const chunkFailed = (): void => {
    notices.chunkFailed();
    void checker?.check(true);
  };
  on(win, 'vite:preloadError', chunkFailed);
  on(win, 'unhandledrejection', (e) => {
    const ev = e as PromiseRejectionEvent;
    if (!isChunkLoadError(ev.reason)) return;
    ev.preventDefault();
    console.warn('WebCockpit: a chunk could not be loaded (a newer version was published)', ev.reason);
    chunkFailed();
  });

  if (checker) {
    const doc = win.document;
    on(doc, 'visibilitychange', () => {
      if (doc.visibilityState === 'visible') void checker.check();
    });
    on(win, 'focus', () => void checker.check());
    const timer = win.setInterval(() => void checker.check(), UPDATE_POLL_MS);
    offs.push(() => win.clearInterval(timer));
  }

  return () => {
    for (const off of offs.splice(0)) off();
  };
}
