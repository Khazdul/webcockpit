// Fullscreen for the whole page: the start and ESC menus' `Fullscreen` row
// and the HTML replay's `F` key and control box button. Uses the standard
// API, falling back to the `webkit` prefix (older Safari, iPadOS). The
// iPhone has neither for the page: `canFullscreen` is false there.
// Firefox on iPad offers the API but never enters fullscreen: a request
// that has not taken effect within `SETTLE_MS` marks fullscreen refused
// for the rest of the page's life, and `canFullscreen` turns false.

const SETTLE_MS = 2000;
let refused = false;
const refusedFns = new Set<() => void>();

type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => void;
};
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => void };

/**
 * Whether this browser can put the page in fullscreen. An iPadOS app may
 * turn fullscreen off for its web view (Firefox on iPad): `fullscreenEnabled`
 * is then false even where the request method exists.
 */
export function canFullscreen(doc: Document = document): boolean {
  const d = doc as FsDocument;
  const el = doc.documentElement as FsElement;
  const enabled = d.fullscreenEnabled ?? d.webkitFullscreenEnabled;
  if (refused || enabled === false) return false;
  return typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function';
}

export function isFullscreen(doc: Document = document): boolean {
  const d = doc as FsDocument;
  return !!(d.fullscreenElement ?? d.webkitFullscreenElement);
}

export function exitFullscreen(doc: Document = document): void {
  if (!isFullscreen(doc)) return;
  const d = doc as FsDocument;
  if (d.exitFullscreen) void d.exitFullscreen().catch(() => {});
  else d.webkitExitFullscreen?.();
}

/**
 * Leaves fullscreen, or asks for it. Resolves false when the browser
 * refused (or ignored) the request; `canFullscreen` is false from then on.
 */
export function toggleFullscreen(doc: Document = document): Promise<boolean> {
  if (isFullscreen(doc)) {
    exitFullscreen(doc);
    return Promise.resolve(true);
  }
  const el = doc.documentElement as FsElement;
  return new Promise<boolean>((resolve) => {
    let done = false;
    const finish = (ok: boolean): void => {
      if (done) return;
      done = true;
      off();
      clearTimeout(timer);
      if (!ok) {
        refused = true;
        for (const fn of refusedFns) fn();
      }
      resolve(ok);
    };
    const off = onFullscreenChange(() => finish(isFullscreen(doc)), doc);
    const timer = setTimeout(() => finish(isFullscreen(doc)), SETTLE_MS);
    try {
      if (el.requestFullscreen) void el.requestFullscreen().catch(() => finish(false));
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      else finish(false);
    } catch {
      finish(false);
    }
  });
}

/** Calls `fn` when the page enters or leaves fullscreen; returns the unsubscribe. */
export function onFullscreenChange(fn: () => void, doc: Document = document): () => void {
  doc.addEventListener('fullscreenchange', fn);
  doc.addEventListener('webkitfullscreenchange', fn);
  return () => {
    doc.removeEventListener('fullscreenchange', fn);
    doc.removeEventListener('webkitfullscreenchange', fn);
  };
}

/** Calls `fn` when a request is refused (`canFullscreen` turned false); returns the unsubscribe. */
export function onFullscreenRefused(fn: () => void): () => void {
  refusedFns.add(fn);
  return () => refusedFns.delete(fn);
}

/** Tests: forget a refusal. */
export function resetFullscreenRefusal(): void {
  refused = false;
}
