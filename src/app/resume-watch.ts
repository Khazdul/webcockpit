// Phone resume watch (ADR 0075 §3.4). A phone OS suspends a background
// tab, and the MUME link usually dies meanwhile. When the page becomes
// visible again (`visibilitychange` to visible, or `pageshow` from the
// back/forward cache) `onResume` runs, and the shell has the session check
// the link at once (`Session.checkAlive`), so a dead link shows the ESC
// menu with Reconnect before the player types. Installed only on a phone.

/** The document side: `visibilitychange` and the visibility state. */
export interface VisibilitySource {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: 'visibilitychange', fn: () => void): void;
  removeEventListener(type: 'visibilitychange', fn: () => void): void;
}

/** The window side: `pageshow`. */
export interface PageShowSource {
  addEventListener(type: 'pageshow', fn: (e: PageTransitionEvent) => void): void;
  removeEventListener(type: 'pageshow', fn: (e: PageTransitionEvent) => void): void;
}

/** Calls `onResume` each time the page comes back. Returns the uninstaller. */
export function watchResume(doc: VisibilitySource, win: PageShowSource, onResume: () => void): () => void {
  const onVisibility = (): void => {
    if (doc.visibilityState === 'visible') onResume();
  };
  const onPageShow = (e: PageTransitionEvent): void => {
    if (e.persisted) onResume();
  };
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('pageshow', onPageShow);
  return () => {
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('pageshow', onPageShow);
  };
}
