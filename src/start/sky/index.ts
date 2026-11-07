// The start page sky engine (stage 41, ADR 0124).
//
// STUB (night pass setup): paints only the gradient of `skyLookAt`. The
// sky-engine work (41a) replaces it; the exported API is the contract the
// start page layout (41c) codes against.

import { startGameMinutes } from '../clock';
import { type SkyLook, skyLookAt } from './look';

export interface StartSkyOptions {
  /** Game minutes now (default: the start page clock). */
  now?: () => number;
}

export interface StartSkyHandle {
  /** The current look; also pushed to `onLook` listeners a few times a second at most, and on change. */
  look(): SkyLook;
  onLook(cb: (look: SkyLook) => void): () => void;
  /** Stops all animation (hidden page, start page hidden, game entered). */
  setPaused(paused: boolean): void;
  dispose(): void;
}

/** Fills `host` (position: relative or absolute, sized by the caller) with the sky. */
export function mountStartSky(host: HTMLElement, opts: StartSkyOptions = {}): StartSkyHandle {
  const now = opts.now ?? (() => startGameMinutes());
  const el = document.createElement('div');
  el.className = 'wc-start-sky';
  el.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
  host.appendChild(el);
  let cur = skyLookAt(now());
  const paint = (): void => {
    el.style.background = `linear-gradient(${cur.top}, ${cur.mid} 40%, ${cur.horizon} 62%, ${cur.below} 62%)`;
  };
  paint();
  const subs = new Set<(look: SkyLook) => void>();
  let timer: ReturnType<typeof setInterval> | null = null;
  const tick = (): void => {
    cur = skyLookAt(now());
    paint();
    for (const s of subs) s(cur);
  };
  const run = (on: boolean): void => {
    if (on && !timer) timer = setInterval(tick, 1000);
    if (!on && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
  run(true);
  return {
    look: () => cur,
    onLook(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    setPaused: (p) => run(!p),
    dispose() {
      run(false);
      subs.clear();
      el.remove();
    },
  };
}
