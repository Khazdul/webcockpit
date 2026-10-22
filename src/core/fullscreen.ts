// Fullscreen for the whole page: the start and ESC menus' `Fullscreen` row
// and the HTML replay's `F` key and control box button. Uses the standard
// API, falling back to the `webkit` prefix (older Safari, iPadOS). The
// iPhone has neither for the page: `canFullscreen` is false there.

type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => void };

/** Whether this browser can put the page in fullscreen. */
export function canFullscreen(doc: Document = document): boolean {
  const el = doc.documentElement as FsElement;
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

export function toggleFullscreen(doc: Document = document): void {
  if (isFullscreen(doc)) return exitFullscreen(doc);
  const el = doc.documentElement as FsElement;
  if (el.requestFullscreen) void el.requestFullscreen().catch(() => {});
  else el.webkitRequestFullscreen?.();
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
