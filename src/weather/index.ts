// Weather effects, main thread (stage 28, ADR 0091). Import this module
// lazily (`await import('./weather')`) and only when the feature is on: it
// pulls in its CSS and starts a worker.
//
// `createWeather(host)` puts three canvases into the cockpit (back: behind
// text and docked panes; mid: under the floating panes, above the game
// text; front: above everything), transfers them to the weather worker and
// keeps the worker's view of the layout current:
//
// - layout geometry (cockpit size, pane frames, the game pane, cell size)
//   is measured on layout changes only (ResizeObserver, the cockpit's
//   relayout hook, window resize/zoom) and posted only when it differs;
// - the page being hidden pauses the worker;
// - floating panes are see-through (`data-weather-see`) only while the
//   worker has painted their current place on the mid layer (see `floats`).
// No per-frame work happens on the main thread.
//
// The API is what the signal bridge (stage 28 C) and Options (D) call.

import './weather.css';
import { geometryDiff, measureGeometry } from './geometry';
import { weatherAvailable } from './support';
import {
  ALL_CATEGORIES,
  type Categories,
  DEFAULT_STATE,
  type FrameStats,
  type Geometry,
  type MainToWorker,
  type ThemeColors,
  type WeatherEvent,
  type WeatherState,
  type WorkerToMain,
} from './protocol';

export type { Categories, FrameStats, Geometry, ThemeColors, WeatherEvent, WeatherState } from './protocol';

export interface WeatherHost {
  /** The element the canvases cover (the cockpit, `.wc-cockpit`). */
  root: HTMLElement;
  /** The game pane container (`.wc-game`). */
  game: HTMLElement;
  /** The cockpit's relayout hook (Cockpit.onLayout). */
  onLayout?: (fn: () => void) => () => void;
}

export interface WeatherOptions {
  state?: Partial<WeatherState>;
  categories?: Partial<Categories>;
  /** Default: the root's `--term-bg` / `--term-fg`. */
  theme?: ThemeColors;
  /** Moon crossing speed (1 = game pace; the prototype demo ran at 600 / 90). */
  moonSpeed?: number;
  /** Called once if the worker fails (the effects are then off). */
  onError?: (message: string) => void;
}

export interface Weather {
  /** Raw game values (weather, fog, light dwell 3 s); `instant` skips dwell and easing. */
  setState(partial: Partial<WeatherState>, opts?: { instant?: boolean }): void;
  /** Sun / moon / darkness events, 'strike' (lightning), 'gust' (snow test). */
  emit(event: WeatherEvent, data?: unknown): void;
  /** Overrides the measured geometry (tests); normally automatic. */
  setGeometry(geom: Geometry): void;
  setTheme(theme: ThemeColors): void;
  /** Re-reads the theme colours and re-measures the layout in the next frame (after a settings change). */
  refresh(): void;
  setCategories(cats: Partial<Categories>): void;
  setMoonSpeed(speed: number): void;
  /** Worker frame times (ms). */
  stats(): Promise<FrameStats>;
  /** Resolves on the first drawn frame (rejects if the worker fails first). */
  readonly ready: Promise<void>;
  destroy(): void;
}

/** True where a worker can draw on a transferred canvas. */
export function weatherSupported(): boolean {
  return weatherAvailable();
}

/** The terminal colours of `el` (its `--term-bg` / `--term-fg`). */
export function themeOf(el: HTMLElement): ThemeColors {
  const cs = getComputedStyle(el);
  return {
    bg: cs.getPropertyValue('--term-bg').trim() || '#000000',
    fg: cs.getPropertyValue('--term-fg').trim() || '#c0c0c0',
  };
}

/**
 * The canvases' device pixel ratio: always 1 (owner feedback 4, "Heat"). On
 * a HiDPI screen the browser stretches them; soft skies, fog and 1 px rain
 * look the same, and ratio 2 costs four times the pixels on every frame
 * (Firefox draws worker canvases on the CPU: 35–120 ms per frame at ratio 2,
 * stage 28 E).
 */
export const CANVAS_RATIO = 1;

/** Starts the effects on `host`; null when the browser cannot run them. */
export function createWeather(host: WeatherHost, opts: WeatherOptions = {}): Weather | null {
  if (!weatherSupported()) return null;
  const { root } = host;
  const doc = root.ownerDocument;
  const mk = (cls: string): HTMLCanvasElement => {
    const c = doc.createElement('canvas');
    c.className = `wc-weather-layer ${cls}`;
    c.setAttribute('aria-hidden', 'true');
    return c;
  };
  const backEl = mk('wc-weather-back');
  const midEl = mk('wc-weather-mid');
  const frontEl = mk('wc-weather-front');
  let back: OffscreenCanvas, mid: OffscreenCanvas, front: OffscreenCanvas;
  try {
    back = backEl.transferControlToOffscreen();
    mid = midEl.transferControlToOffscreen();
    front = frontEl.transferControlToOffscreen();
  } catch {
    return null;
  }
  root.prepend(backEl);
  root.append(midEl, frontEl);

  const worker = new Worker(new URL('./worker/weather.worker.ts', import.meta.url), { type: 'module', name: 'weather' });
  const post = (m: MainToWorker, transfer: Transferable[] = []): void => worker.postMessage(m, transfer);
  let destroyed = false;
  let seq = 1;
  /** The latest layout the worker has painted. */
  let ackSeq = 0;
  let geom: Geometry = measureGeometry(host, CANVAS_RATIO, seq);
  const floats = floatSee(root);
  midEl.hidden = !geom.panes.some((p) => p.floating);
  let cats: Categories = { ...ALL_CATEGORIES, ...opts.categories };
  const statsWaiters: ((s: FrameStats) => void)[] = [];
  let resolveReady!: () => void, rejectReady!: (e: Error) => void;
  const ready = new Promise<void>((res, rej) => {
    resolveReady = res;
    rejectReady = rej;
  });
  ready.catch(() => {});

  worker.onmessage = (e: MessageEvent<WorkerToMain>) => {
    const m = e.data;
    if (m.t === 'ready') {
      // only now let the docked panes go transparent: their backgrounds are on the canvas
      root.setAttribute('data-weather', '');
      resolveReady();
    } else if (m.t === 'painted') {
      ackSeq = m.seq;
      if (m.seq === geom.seq) floats.painted(geom);
    } else if (m.t === 'stats') statsWaiters.splice(0).forEach((fn) => fn(m.stats));
    else if (m.t === 'error') {
      console.warn('weather:', m.message);
      if (!root.hasAttribute('data-weather')) {
        rejectReady(new Error(m.message));
        opts.onError?.(m.message);
        api.destroy();
      }
    }
  };
  worker.onerror = (e) => {
    rejectReady(new Error(e.message));
    opts.onError?.(e.message);
    api.destroy();
  };

  post(
    {
      t: 'init',
      back,
      mid,
      front,
      geom,
      theme: opts.theme ?? themeOf(root),
      cats,
      state: { ...DEFAULT_STATE, ...opts.state },
      moonSpeed: opts.moonSpeed ?? 1,
    },
    [back, mid, front],
  );

  // ---- geometry: measured on change, posted on difference
  let measureQueued = false;
  const remeasure = (): void => {
    if (destroyed) return;
    const next = measureGeometry(host, CANVAS_RATIO, geom.seq);
    const d = geometryDiff(geom, next);
    if (d === 'none') {
      // A relayout that moved nothing (within GEOM_EPS): what the worker painted still holds.
      if (ackSeq === geom.seq) floats.painted(geom);
      return;
    }
    next.seq = ++seq;
    midEl.hidden = !next.panes.some((p) => p.floating);
    geom = next;
    post({ t: 'geom', g: next });
  };
  const queueMeasure = (): void => {
    if (measureQueued || destroyed) return;
    measureQueued = true;
    requestAnimationFrame(() => {
      measureQueued = false;
      remeasure();
    });
  };
  const ro = new ResizeObserver(queueMeasure);
  ro.observe(root);
  ro.observe(host.game);
  const offLayout =
    host.onLayout?.(() => {
      // Synchronously, before this layout is painted: a float that moved is opaque until the worker catches up.
      floats.moved();
      queueMeasure();
    }) ?? (() => {});
  const win = doc.defaultView ?? window;
  win.addEventListener('resize', queueMeasure);

  // ---- visibility and focus (hidden: paused; no focus: the slow rate)
  const onVis = (): void => post({ t: 'visible', on: !doc.hidden });
  doc.addEventListener('visibilitychange', onVis);
  if (doc.hidden) onVis();
  const onFocus = (): void => post({ t: 'focus', on: doc.hasFocus() });
  win.addEventListener('focus', onFocus);
  win.addEventListener('blur', onFocus);
  if (!doc.hasFocus()) onFocus();

  const api: Weather = {
    ready,
    setState(partial, o) {
      if (!destroyed) post({ t: 'state', s: partial, instant: !!o?.instant });
    },
    emit(event, data) {
      if (!destroyed) post({ t: 'event', name: event, data });
    },
    setGeometry(g) {
      if (destroyed) return;
      geom = { ...g, seq: ++seq };
      post({ t: 'geom', g: geom });
    },
    setTheme(theme) {
      if (!destroyed) post({ t: 'theme', theme });
    },
    refresh() {
      if (destroyed) return;
      requestAnimationFrame(() => {
        if (destroyed) return;
        post({ t: 'theme', theme: themeOf(root) });
        remeasure();
      });
    },
    setCategories(c) {
      if (destroyed) return;
      cats = { ...cats, ...c };
      post({ t: 'cats', cats });
    },
    setMoonSpeed(speed) {
      if (!destroyed) post({ t: 'moonSpeed', speed });
    },
    stats() {
      if (destroyed) return Promise.resolve({ n: 0, avg: 0, p95: 0, max: 0, mods: {}, idle: true, frames: 0, dpr: 1 });
      return new Promise((res) => {
        statsWaiters.push(res);
        post({ t: 'stats' });
      });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      worker.terminate();
      ro.disconnect();
      offLayout();
      win.removeEventListener('resize', queueMeasure);
      doc.removeEventListener('visibilitychange', onVis);
      win.removeEventListener('focus', onFocus);
      win.removeEventListener('blur', onFocus);
      root.removeAttribute('data-weather');
      floats.clear();
      backEl.remove();
      midEl.remove();
      frontEl.remove();
    },
  };
  return api;
}

/** A floating pane's place from its inline style (no layout read). */
interface FloatBox {
  el: HTMLElement;
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function floatBoxes(root: HTMLElement): FloatBox[] {
  const out: FloatBox[] = [];
  for (const el of root.querySelectorAll<HTMLElement>(':scope > .wc-pane[data-floating]')) {
    if (el.hidden) continue;
    const st = el.style;
    const n = (v: string): number => parseFloat(v) || 0;
    out.push({ el, key: `${st.left},${st.top},${st.width},${st.height}`, x: n(st.left), y: n(st.top), w: n(st.width), h: n(st.height) });
  }
  return out;
}

const overlaps = (a: FloatBox, b: FloatBox): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * See-through floating panes (stage 28 owner feedback 3). A float sits over
 * the game text, so it may only drop its fill (`data-weather-see`, weather.css)
 * where the worker has painted the mid layer under it: the pane's fill plus
 * the back layer's pixels, which hides the text. `painted(geom)` (the
 * worker's answer for the current layout) marks the floats it covered;
 * `moved()` (every relayout, before it is painted) takes the mark off any
 * float whose place changed since. Floats that overlap another float stay
 * opaque: a see-through upper one would show the lower one's text.
 */
export function floatSee(root: HTMLElement): { painted(geom: Geometry): void; moved(): void; clear(): void } {
  /** The place each marked float was painted at. */
  const marked = new Map<HTMLElement, string>();
  const unmark = (el: HTMLElement): void => {
    el.removeAttribute('data-weather-see');
    marked.delete(el);
  };
  const free = (boxes: FloatBox[], b: FloatBox): boolean => !boxes.some((o) => o !== b && overlaps(o, b));
  return {
    painted(geom) {
      const ids = new Set(geom.panes.filter((p) => p.floating).map((p) => p.id));
      const boxes = floatBoxes(root);
      for (const b of boxes) {
        if (ids.has(b.el.dataset.pane ?? '') && free(boxes, b)) {
          b.el.setAttribute('data-weather-see', '');
          marked.set(b.el, b.key);
        } else if (marked.has(b.el)) unmark(b.el);
      }
      for (const el of [...marked.keys()]) if (!el.isConnected || el.hidden || !el.hasAttribute('data-floating')) unmark(el);
    },
    moved() {
      if (!marked.size) return;
      const boxes = floatBoxes(root);
      const seen = new Set<HTMLElement>();
      for (const b of boxes) {
        seen.add(b.el);
        if (marked.has(b.el) && (marked.get(b.el) !== b.key || !free(boxes, b))) unmark(b.el);
      }
      for (const el of [...marked.keys()]) if (!seen.has(el)) unmark(el);
    },
    clear() {
      for (const el of [...marked.keys()]) unmark(el);
    },
  };
}
