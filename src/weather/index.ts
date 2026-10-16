// Weather effects, main thread (stage 28, ADR 0091). Import this module
// lazily (`await import('./weather')`) and only when the feature is on: it
// pulls in its CSS and starts a worker.
//
// `createWeather(host)` puts two canvases into the cockpit (back: behind
// text and docked panes; front: above everything), transfers them to the
// weather worker and keeps the worker's view of the layout current:
//
// - layout geometry (cockpit size, pane frames, the game pane, cell size)
//   is measured on layout changes only (ResizeObserver, the cockpit's
//   relayout hook, window resize/zoom) and posted only when it differs;
// - the visible text lines are re-sampled every LINES_MS in an idle
//   callback and posted only when they changed;
// - the page being hidden pauses the worker.
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

/** How often the visible text lines are re-sampled, ms. */
export const LINES_MS = 2500;

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

const dprNow = (): number => Math.min(2, window.devicePixelRatio || 1);

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
  const frontEl = mk('wc-weather-front');
  let back: OffscreenCanvas, front: OffscreenCanvas;
  try {
    back = backEl.transferControlToOffscreen();
    front = frontEl.transferControlToOffscreen();
  } catch {
    return null;
  }
  root.prepend(backEl);
  root.append(frontEl);

  const worker = new Worker(new URL('./worker/weather.worker.ts', import.meta.url), { type: 'module', name: 'weather' });
  const post = (m: MainToWorker, transfer: Transferable[] = []): void => worker.postMessage(m, transfer);
  let destroyed = false;
  let geom: Geometry = measureGeometry(host, dprNow());
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
      front,
      geom,
      theme: opts.theme ?? themeOf(root),
      cats,
      state: { ...DEFAULT_STATE, ...opts.state },
      moonSpeed: opts.moonSpeed ?? 1,
    },
    [back, front],
  );

  // ---- geometry: measured on change, posted on difference
  let measureQueued = false;
  const remeasure = (withLines: boolean): void => {
    if (destroyed) return;
    const next = measureGeometry(host, dprNow(), withLines, geom.lines);
    const d = geometryDiff(geom, next);
    if (d === 'none') return;
    geom = next;
    post({ t: 'geom', g: next, linesOnly: d === 'lines' });
  };
  const queueMeasure = (): void => {
    if (measureQueued || destroyed) return;
    measureQueued = true;
    requestAnimationFrame(() => {
      measureQueued = false;
      remeasure(true);
    });
  };
  const ro = new ResizeObserver(queueMeasure);
  ro.observe(root);
  ro.observe(host.game);
  const offLayout = host.onLayout?.(queueMeasure) ?? (() => {});
  const win = doc.defaultView ?? window;
  win.addEventListener('resize', queueMeasure);

  // ---- text lines: a slow idle sample
  const idle = (fn: () => void): void => {
    if (typeof win.requestIdleCallback === 'function') win.requestIdleCallback(fn, { timeout: 1000 });
    else setTimeout(fn, 0);
  };
  const linesTimer = setInterval(() => {
    if (!doc.hidden) idle(() => remeasure(true));
  }, LINES_MS);

  // ---- visibility
  const onVis = (): void => post({ t: 'visible', on: !doc.hidden });
  doc.addEventListener('visibilitychange', onVis);
  if (doc.hidden) onVis();

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
      geom = g;
      post({ t: 'geom', g, linesOnly: false });
    },
    setTheme(theme) {
      if (!destroyed) post({ t: 'theme', theme });
    },
    refresh() {
      if (destroyed) return;
      requestAnimationFrame(() => {
        if (destroyed) return;
        post({ t: 'theme', theme: themeOf(root) });
        remeasure(false);
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
      if (destroyed) return Promise.resolve({ n: 0, avg: 0, p95: 0, max: 0, mods: {}, idle: true });
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
      clearInterval(linesTimer);
      root.removeAttribute('data-weather');
      backEl.remove();
      frontEl.remove();
    },
  };
  return api;
}
