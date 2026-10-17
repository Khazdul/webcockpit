// Weather effects, main thread (stage 28, ADR 0091). Import this module
// lazily (`await import('./weather')`) and only when the feature is on: it
// pulls in its CSS and starts a worker.
//
// `createWeather(host)` puts two canvases into the cockpit (back: behind
// text and docked panes; front: above everything) and one into each floating
// pane (see `floatLayers`), transfers them to the weather worker and keeps
// the worker's view of the layout current:
//
// - layout geometry (cockpit size, pane frames, the game pane, cell size)
//   is measured on layout changes only (ResizeObserver, the cockpit's
//   relayout hook, window resize/zoom) and posted only when it differs;
// - the page being hidden pauses the worker;
// - floating panes are see-through (`data-weather-see`) as long as they hold
//   their weather canvas, whose CSS background hides the game text.
// No per-frame work happens on the main thread.
//
// The API is what the signal bridge (stage 28 C) and Options (D) call.

import './weather.css';
import { geometryDiff, measureGeometry } from './geometry';
import { glassBlurCheap, weatherAvailable } from './support';
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
  /** Raw game values (weather, fog, light dwell 3 s); `instant` skips dwell and easing, `settle` only the dwell. */
  setState(partial: Partial<WeatherState>, opts?: { instant?: boolean; settle?: boolean }): void;
  /** Sun / moon / darkness events, 'strike' (lightning), 'gust' (snow test). */
  emit(event: WeatherEvent, data?: unknown): void;
  /** Overrides the measured geometry (tests); normally automatic. */
  setGeometry(geom: Geometry): void;
  setTheme(theme: ThemeColors): void;
  /** Re-reads the theme colours and re-measures the layout in the next frame (after a settings change). */
  refresh(): void;
  setCategories(cats: Partial<Categories>): void;
  setMoonSpeed(speed: number): void;
  /** The demo's time scale (1 = the game's pace): sun moments, the day ↔ night change, cloud cover, fog, rain and snow build-up, blood drying. */
  setSpeed(speed: number): void;
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
  let geom: Geometry = measureGeometry(host, CANVAS_RATIO);
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
      root.toggleAttribute('data-weather-flat', !glassBlurCheap());
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
  // After init: the worker knows the layout when the float canvases arrive.
  const floats = floatLayers(root, post);
  floats.sync();

  // ---- geometry: measured on change, posted on difference
  let measureQueued = false;
  const remeasure = (): void => {
    if (destroyed) return;
    floats.sync();
    const next = measureGeometry(host, CANVAS_RATIO);
    if (geometryDiff(geom, next) === 'none') return;
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
      // Synchronously, before this layout is painted: a new float gets its canvas (opaque CSS background) at once.
      floats.sync();
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
      if (!destroyed) post({ t: 'state', s: partial, instant: !!o?.instant, settle: !!o?.settle });
    },
    emit(event, data) {
      if (!destroyed) post({ t: 'event', name: event, data });
    },
    setGeometry(g) {
      if (destroyed) return;
      geom = g;
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
    setSpeed(speed) {
      if (!destroyed) post({ t: 'speed', speed });
    },
    stats() {
      if (destroyed) return Promise.resolve({ n: 0, avg: 0, p95: 0, max: 0, mods: {}, idle: true, frames: 0, dpr: 1, gaps: { n: 0, p50: 0, p95: 0, max: 0 } });
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
      root.removeAttribute('data-weather-flat');
      floats.clear();
      backEl.remove();
      frontEl.remove();
    },
  };
  return api;
}

/**
 * See-through floating panes (owner feedback 3, 13, 18; ADR 0091 "Engine").
 * Each shown floating pane gets a canvas as its first child
 * (`.wc-weather-float`, weather.css), the size of the pane, transferred to
 * the worker, which copies the back layer's pixels under the pane into it.
 * The canvas element's own CSS background is the terminal background with
 * the pane's tint in the frame box, so it hides the game text under the pane
 * from the first frame on, and it moves with the pane in the same frame (no
 * opaque pause after a move); the weather copy follows at the worker's next
 * frame. It is inside the pane's stacking layer, so an upper float covers a
 * lower one's text where they overlap. A pane holding one is marked
 * `data-weather-see`, which drops its own fill.
 *
 * `sync()` runs on every relayout (synchronously, before it is painted) and
 * before each measure: new floats get a canvas; panes that docked, hid or
 * left the page lose theirs.
 */
export function floatLayers(
  root: HTMLElement,
  post: (m: MainToWorker, transfer?: Transferable[]) => void,
): { sync(): void; clear(): void } {
  const doc = root.ownerDocument;
  let next = 1;
  const layers = new Map<HTMLElement, { key: number; pane: string; el: HTMLCanvasElement }>();
  const drop = (pane: HTMLElement): void => {
    const l = layers.get(pane);
    if (!l) return;
    layers.delete(pane);
    l.el.remove();
    pane.removeAttribute('data-weather-see');
    post({ t: 'floatGone', key: l.key });
  };
  return {
    sync() {
      const shown = new Set<HTMLElement>();
      for (const el of root.querySelectorAll<HTMLElement>(':scope > .wc-pane[data-floating]')) {
        if (el.hidden) continue;
        const pane = el.dataset.pane ?? '';
        const have = layers.get(el);
        if (have && have.pane === pane && have.el.parentElement === el) {
          shown.add(el);
          continue;
        }
        if (have) drop(el);
        const c = doc.createElement('canvas');
        c.className = 'wc-weather-float';
        c.setAttribute('aria-hidden', 'true');
        let canvas: OffscreenCanvas;
        try {
          canvas = c.transferControlToOffscreen();
        } catch {
          continue; // the pane stays opaque
        }
        el.prepend(c);
        const key = next++;
        layers.set(el, { key, pane, el: c });
        el.setAttribute('data-weather-see', '');
        post({ t: 'float', key, pane, canvas }, [canvas]);
        shown.add(el);
      }
      for (const el of [...layers.keys()]) if (!shown.has(el)) drop(el);
    },
    clear() {
      for (const el of [...layers.keys()]) drop(el);
    },
  };
}
