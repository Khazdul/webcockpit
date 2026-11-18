// The shared replay's frame follows its window through a turn (stage 73
// round 3, ADR 0160 addendum "the iPad fullscreen turn"). On a touch
// device only (the frame decides it, src/replay/phone.ts); a computer
// never runs it.
//
// iPadOS turned in fullscreen reports the frame's new size late and in
// steps, and the parent's resize may reach the frame's window late or not
// at all. So:
//
// - Every source of a change (src/core/viewport-settle.ts `watchViewport`:
//   the window's events, the visual viewport, fullscreen, a ResizeObserver
//   of `<html>` and the root) and the parent's `wc-relayout` (src/watch/
//   turn.ts) start a few ticks up to a second later. Each tick lays the
//   player out again (`PlayerHost.nudgeLayout`: cells, cockpit, lens, box),
//   so a size that came after the last event is laid out too.
// - The root (`#app`) is sized by CSS (100 % of the frame's window). Where
//   it does not fill the window after a step (laid out at the old size), a
//   tick sizes it to the window by number (`wc-frame-sized` on `<html>`,
//   `--wc-frame-w`/`--wc-frame-h` through CSSOM: no style attribute, the
//   frame's CSP). In fullscreen the window is never larger than the screen
//   (the screen's sides turned by its orientation): once the turn has
//   settled (the last tick), a window still larger than that, the other way
//   round, is the old orientation's, and the root takes the screen's size.
//   Each tick first takes the class away and measures the root as CSS lays
//   it out, so the numbers are used only while CSS is wrong.
// - Leaving fullscreen scrolls the frame's window back to the top.
//
// `?fsdebug` on the watch page (`prefs.fsdebug` in `wc-play`) shows the
// frame's readout (src/core/fs-debug.ts) with the parent's lines under it.

import { isFullscreen } from '../core/fullscreen';
import { type FsDebug, mountFsDebug } from '../core/fs-debug';
import { SETTLE_MS, rectText, viewportLines, watchViewport } from '../core/viewport-settle';
import { screenLandscape } from '../layout/phone-viewport';
import type { PlayerHost } from '../app/player-host';

/** Longest parent readout the frame shows (`wc-relayout`'s `debug`). */
export const PARENT_DEBUG_MAX = 1500;

export interface Size {
  w: number;
  h: number;
}

/** The screen's size the way it is turned now (`screen.width`/`height` do not turn on every iOS), or null where unknown. */
export function turnedScreen(win: Window): Size | null {
  const a = win.screen?.width ?? 0;
  const b = win.screen?.height ?? 0;
  if (!(a > 0 && b > 0)) return null;
  const land = screenLandscape(win);
  if (land === null) return null;
  return land ? { w: Math.max(a, b), h: Math.min(a, b) } : { w: Math.min(a, b), h: Math.max(a, b) };
}

/**
 * The size the frame's root should have: the window's, and in fullscreen
 * once the turn has settled (`settled`) never more than the turned screen
 * where the window lies the other way round (its old orientation's size).
 */
export function frameTarget(inner: Size, screen: Size | null, fullscreen: boolean, settled: boolean): Size {
  if (!fullscreen || !settled || !screen || !(screen.w > 200 && screen.h > 200)) return inner;
  const innerLand = inner.w > inner.h;
  const screenLand = screen.w > screen.h;
  if (innerLand === screenLand) return inner;
  if (inner.w <= screen.w + 2 && inner.h <= screen.h + 2) return inner;
  return { w: Math.min(inner.w, screen.w), h: Math.min(inner.h, screen.h) };
}

/** Whether a root laid out at `r` fails to fill `t` (1 px of rounding allowed). */
export function rootOff(r: { left: number; top: number; width: number; height: number }, t: Size): boolean {
  return Math.abs(r.left) > 1 || Math.abs(r.top) > 1 || Math.abs(r.width - t.w) > 1 || Math.abs(r.height - t.h) > 1;
}

export interface FrameFit {
  /** Measures again (the parent's `wc-relayout`). */
  kick(why: string): void;
  /** The parent's readout lines (`?fsdebug`), plain text. */
  parentText(text: string): void;
  /** Whether the root is sized by number now (tests, the readout). */
  readonly sized: boolean;
  dispose(): void;
}

export function installFrameFit(win: Window, root: HTMLElement, host: PlayerHost, o: { debug?: boolean } = {}): FrameFit {
  const doc = win.document;
  const html = doc.documentElement;
  let sized = false;
  let parent = '';
  let debug: FsDebug | null = null;
  let wasFs = isFullscreen(doc);
  const last = SETTLE_MS.length - 1;
  const fit = (n: number): void => {
    html.classList.remove('wc-frame-sized');
    const fs = isFullscreen(doc);
    const t = frameTarget({ w: win.innerWidth, h: win.innerHeight }, turnedScreen(win), fs, n >= last);
    sized = t.w > 0 && t.h > 0 && rootOff(root.getBoundingClientRect(), t);
    if (sized) {
      html.style.setProperty('--wc-frame-w', `${t.w}px`);
      html.style.setProperty('--wc-frame-h', `${t.h}px`);
      html.classList.add('wc-frame-sized');
    }
  };
  const watch = watchViewport(win, {
    observe: [html, root],
    read: () => `${win.innerWidth}x${win.innerHeight}|${win.visualViewport?.width}x${win.visualViewport?.height}|${turnedScreen(win)?.w}|${isFullscreen(doc)}`,
    onTick: (why, n) => {
      const fs = isFullscreen(doc);
      // Left fullscreen: the window back at its top (iOS may leave it scrolled by the old size).
      if (n === 0 && wasFs && !fs && (win.scrollX !== 0 || win.scrollY !== 0)) win.scrollTo(0, 0);
      wasFs = fs;
      fit(n);
      host.nudgeLayout();
      debug?.update(n === 0 ? why : undefined);
    },
  });
  if (o.debug) {
    debug = mountFsDebug(doc, 'FRAME', 'top-left', () => {
      const ls = viewportLines(win);
      return [
        ...ls,
        `root ${rectText(root)}${sized ? ' (sized)' : ''}`,
        `cockpit ${rectText(doc.querySelector('.wc-cockpit'))}  land ${host.app?.cockpit.phoneGameLayout?.landscape ?? '-'}`,
        `box ${rectText(doc.querySelector('.wc-player-box'))}`,
        ...(parent ? ['— page —', parent] : []),
      ];
    });
  }
  return {
    kick: (why) => watch.kick(why),
    parentText: (text) => {
      parent = text.slice(0, PARENT_DEBUG_MAX);
      debug?.update();
    },
    get sized() {
      return sized;
    },
    dispose: () => {
      watch.dispose();
      debug?.dispose();
      html.classList.remove('wc-frame-sized');
    },
  };
}
