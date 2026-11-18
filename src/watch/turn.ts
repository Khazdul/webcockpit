// The watch page through a turn in fullscreen (stage 73 round 3, ADR 0160
// addendum "the iPad fullscreen turn"). On a touch device only, and with
// `?fsdebug` anywhere.
//
// The owner's iPad: turned while the replay's frame was in fullscreen, the
// page kept a size of the old orientation, also after fullscreen ended
// (black where the old size ends). iPadOS reports the turn late and in
// steps, and the page is not shown while the frame is in fullscreen. The
// page's own boxes are sized by CSS from the window (`#app` and `.wc-watch`
// at inset 0, watch.css), not by the measured visual viewport; what is left
// is measured from those boxes:
//
// - `--wc-watch-vh` on `.wc-watch`: its height (the window's, by CSS), for
//   the replay's first view (watch.css `.wc-watch-screen`) in place of
//   `100dvh`, which may still be the old orientation's after a turn.
// - On every change (src/core/viewport-settle.ts: the window's events,
//   fullscreen, the visual viewport, a ResizeObserver of the page) and a
//   few times up to a second after it: the variable again, and the frame
//   is told (`FrameHost.relayout`, `wc-relayout`) so it measures again too.
// - Leaving fullscreen: the window back at its top and the viewport meta
//   written again (once changed and put back: WebKit computes the page's
//   layout size again from the view's size), at once and half a second
//   later.
//
// `?fsdebug`: the page's readout at its bottom left (src/core/fs-debug.ts),
// and its lines posted to the frame, which shows them under its own (in
// fullscreen only the frame shows).

import { isFullscreen } from '../core/fullscreen';
import { type FsDebug, mountFsDebug } from '../core/fs-debug';
import { rectText, viewportLines, watchViewport } from '../core/viewport-settle';
import type { FrameHost } from './frame-host';

/** Writes the viewport meta once changed and back (see the header); no-op without one. */
export function nudgeViewport(doc: Document): void {
  const m = doc.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  const win = doc.defaultView;
  if (!m || !win) return;
  const content = m.content;
  if (/minimum-scale/.test(content)) return;
  m.content = `${content}, minimum-scale=1`;
  win.requestAnimationFrame(() => {
    m.content = content;
  });
}

export interface WatchTurn {
  /** Measures again now and a few times later (tests). */
  kick(why: string): void;
  dispose(): void;
}

/**
 * Follows the window for the watch page whose root box is `page` (the
 * `.wc-watch` element) and whose frame is `host`.
 */
export function installWatchTurn(page: HTMLElement, host: FrameHost, o: { debug?: boolean } = {}): WatchTurn {
  const doc = page.ownerDocument;
  const win = doc.defaultView!;
  let wasFs = isFullscreen(doc);
  let debug: FsDebug | null = null;
  const lines = (): string[] => [
    ...viewportLines(win),
    `#app ${rectText(doc.getElementById('app'))}  watch ${rectText(page)}`,
    `frame ${rectText(host.frame)}  vh ${page.style.getPropertyValue('--wc-watch-vh') || '-'}`,
  ];
  const measure = (): void => {
    const h = page.clientHeight;
    if (h > 0) page.style.setProperty('--wc-watch-vh', `${h}px`);
  };
  let exited = false;
  const watch = watchViewport(win, {
    observe: [doc.documentElement, page],
    onTick: (why, n) => {
      const fs = isFullscreen(doc);
      if (n === 0) {
        exited = wasFs && !fs;
        wasFs = fs;
      }
      if (exited && (n === 0 || n === 3)) {
        if (win.scrollX !== 0 || win.scrollY !== 0) win.scrollTo(0, 0);
        nudgeViewport(doc);
      }
      measure();
      debug?.update(n === 0 ? why : undefined);
      host.relayout(debug ? `last ${watch.last?.why ?? '-'} @${((watch.last?.at ?? 0) / 1000).toFixed(2)}s\n${lines().join('\n')}` : undefined);
    },
  });
  measure();
  if (o.debug) debug = mountFsDebug(doc, 'PAGE', 'bottom-left', lines);
  return {
    kick: (why) => watch.kick(why),
    dispose: () => {
      watch.dispose();
      debug?.dispose();
      page.style.removeProperty('--wc-watch-vh');
    },
  };
}
