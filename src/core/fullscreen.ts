// Fullscreen for the whole page: the touch fullscreen button (ADR 0097)
// and the HTML replay's `F` key and control box button. Uses the standard
// API, falling back to the `webkit` prefix (older Safari, iPadOS). The
// iPhone has neither for the page: `canFullscreen` is false there.
// Firefox on iPad offers the API but never enters fullscreen: a request
// that has not taken effect within `SETTLE_MS` marks fullscreen refused
// for the rest of the page's life, and `canFullscreen` turns false.
//
// `isFullscreen` and `toggleFullscreen` take an element: the run log
// player puts only itself in fullscreen (stage 45 owner feedback, ADR
// 0130), so the browser's own way out (Esc, F11) also puts it back in its
// box, and closing it (its element leaves the page) leaves fullscreen.

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

/** Whether the page is in fullscreen; with `el`, whether `el` is the fullscreen element. */
export function isFullscreen(doc: Document = document, el?: Element): boolean {
  const d = doc as FsDocument;
  const fs = d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
  return el ? fs === el : fs !== null;
}

export function exitFullscreen(doc: Document = document): void {
  if (!isFullscreen(doc)) return;
  const d = doc as FsDocument;
  if (d.exitFullscreen) void d.exitFullscreen().catch(() => {});
  else d.webkitExitFullscreen?.();
}

/**
 * Leaves fullscreen, or asks for it: for the whole page, or with `target`
 * for that element (left again when it is the fullscreen element; asked
 * for while the page or another element is fullscreen). Resolves false
 * when the browser refused (or ignored) the request; `canFullscreen` is
 * false from then on.
 */
export function toggleFullscreen(doc: Document = document, target?: HTMLElement): Promise<boolean> {
  if (isFullscreen(doc, target)) {
    exitFullscreen(doc);
    return Promise.resolve(true);
  }
  const el = (target ?? doc.documentElement) as FsElement;
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
    const off = onFullscreenChange(() => finish(isFullscreen(doc, target)), doc);
    const timer = setTimeout(() => finish(isFullscreen(doc, target)), SETTLE_MS);
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

// Keyboard Lock (stage 30b, ADR 0103): in the cockpit's page fullscreen the
// menu bar asks the browser to deliver Esc to the page instead of leaving
// fullscreen, so Esc can open the Exit popup. Chromium only (Chrome, Edge,
// Opera); elsewhere there is no API and Esc leaves fullscreen as before.
// A press and hold of Esc still leaves fullscreen (the browser says so).

interface KeyboardLockApi {
  lock(keys?: string[]): Promise<void>;
  unlock(): void;
}

type NavigatorWithKeyboard = Navigator & { keyboard?: Partial<KeyboardLockApi> };

function keyboardApi(nav: Navigator | undefined): Partial<KeyboardLockApi> | null {
  const k = (nav as NavigatorWithKeyboard | undefined)?.keyboard;
  return k && typeof k.lock === 'function' && typeof k.unlock === 'function' ? k : null;
}

/** Whether this browser has the Keyboard Lock API. */
export function canLockEscape(nav: Navigator | undefined = globalThis.navigator): boolean {
  return keyboardApi(nav) !== null;
}

/** Asks the browser for the Esc key while in fullscreen; false when there is no API. Rejections are ignored. */
export function lockEscape(nav: Navigator | undefined = globalThis.navigator): boolean {
  const k = keyboardApi(nav);
  if (!k) return false;
  try {
    void Promise.resolve(k.lock!(['Escape'])).catch(() => {});
  } catch {
    /* refused */
  }
  return true;
}

/** Gives the keys back to the browser (no-op without the API). */
export function unlockEscape(nav: Navigator | undefined = globalThis.navigator): void {
  const k = keyboardApi(nav);
  if (!k) return;
  try {
    k.unlock!();
  } catch {
    /* nothing locked */
  }
}
