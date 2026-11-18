// The fullscreen-turn diagnostic (stage 73 round 3, ADR 0160 addendum):
// `?fsdebug` on the watch page shows, small in a corner of the page and of
// the replay's frame, what each window says of its size (inner size, the
// visual viewport with its offsets, the screen and its orientation,
// fullscreen or not), the rectangles the layout is built on (the root, the
// cockpit, the control box, the frame) and the last event with its time,
// so the owner can screenshot it on the iPad. Off by default; nothing of
// it runs without the switch.
//
// Built with DOM calls and `textContent` only, styled by a class
// (fs-debug.css): the frame's CSP has a hash in `style-src`, which voids
// style attributes there (as src/replay/poster.ts).

import './fs-debug.css';

export interface FsDebug {
  /** Draws the lines again (`event`: what happened, shown with its time). */
  update(event?: string): void;
  dispose(): void;
}

/** The query switch on the watch page. */
export function fsDebugAsked(search: string): boolean {
  return new URLSearchParams(search).has('fsdebug');
}

/**
 * How a touch tablet's shared run goes fullscreen (stage 73 round 3b, ADR
 * 0160 addendum): `frame` the frame's own document in element fullscreen
 * (the default, as before), `page` the watch page's document in element
 * fullscreen with the frame filling it, `fill` no element fullscreen, the
 * frame filling the window (the iPhone's way). For testing on the iPad.
 */
export const FS_MODES = ['frame', 'page', 'fill'] as const;
export type FsMode = (typeof FS_MODES)[number];
export const FS_MODE_DEFAULT: FsMode = 'frame';

/** `raw` when it is one of the three names exactly, else null. */
export function fsModeOf(raw: unknown): FsMode | null {
  return typeof raw === 'string' && (FS_MODES as readonly string[]).includes(raw) ? (raw as FsMode) : null;
}

/** The watch page's `?fsmode=frame|page|fill` (null: not asked, or not one of the three). */
export function fsModeAsked(search: string): FsMode | null {
  return fsModeOf(new URLSearchParams(search).get('fsmode'));
}

/**
 * Mounts the readout in `doc` (`corner`: where; `title`: which window) and
 * keeps it current: `lines()` at each `update`, and every second while it
 * is shown (a late size that came with no event).
 */
export function mountFsDebug(doc: Document, title: string, corner: 'top-left' | 'bottom-left', lines: () => string[]): FsDebug {
  const el = doc.createElement('pre');
  el.className = `wc-fsdebug wc-fsdebug-${corner}`;
  el.setAttribute('aria-hidden', 'true');
  doc.body.appendChild(el);
  let event = 'start';
  let at = performance.now();
  const draw = (): void => {
    let body: string[];
    try {
      body = lines();
    } catch (err) {
      body = [`error ${err instanceof Error ? err.message : String(err)}`];
    }
    el.textContent = [`${title}  last ${event} @${(at / 1000).toFixed(2)}s  now ${(performance.now() / 1000).toFixed(2)}s`, ...body].join('\n');
  };
  draw();
  const win = doc.defaultView;
  const timer = win ? win.setInterval(draw, 1000) : 0;
  return {
    update: (e) => {
      if (e) {
        event = e;
        at = performance.now();
      }
      draw();
    },
    dispose: () => {
      if (timer && win) win.clearInterval(timer);
      el.remove();
    },
  };
}
