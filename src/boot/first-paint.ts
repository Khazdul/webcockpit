// First paint (ADR 0083, addendum 2026-11-07). Bundled into one IIFE and
// inlined into index.html by vite.config.ts (`firstPaintPlugin`); never
// imported by the app. The script sits in <head> (it defines the loader
// and starts the font preloads before the module tags compete for the
// line); index.html calls `__wcPaint` again right after the start page
// host in <body>, when the box can be laid out.
//
// It decides the device flags (as src/main.ts will), reads the saved
// appearance (the localStorage mirror, as the settings store will) for the
// page colours, preloads the selected terminal font's files and the start
// page's own faces (Cinzel, Cormorant), and defines `window.__wcBoot`.
// Then it paints the start page as the app will show it, in the same box
// (`#wc-first`, placed as the start surface) and by the same rules
// (src/start/geometry.css, inlined here and imported by the surface):
//
// - the sky: the look model's CSS gradients for the current game time and
//   the box's size (`skyCss(startSkyLook(view)).all`, src/start/sky/look.ts):
//   the very pixels the start surface puts on its sky host before the
//   engine's canvases fade in over them; refreshed every 2 s (the sky moves
//   one game minute a second) and on a resize;
// - the wordmark (`src/start/wordmark-svg.ts`, the same markup and light
//   as the app's `Wordmark`) where the surface's `.wc-start-brand` puts it;
// - after 150 ms, a loading panel where the menu panel will appear: an
//   empty outline with a thin mithril line that follows the downloads
//   (`__wcBootSizes`) and the boot's steps, and a small label.
//
// The hand-over (src/app/boot-progress.ts `revealStart`, `bootDone`): in
// one task the start page is shown and this layer's sky and wordmark are
// removed (the page's identical ones are under them), the loading panel
// fades out while the menu fades in; the sky engine then fades its
// canvases in over the sky. The offline modes (`?replay`, `?bench`,
// `?fixture=`) go straight to the cockpit: only the line and its label,
// centred, in an overlay on the terminal background.

import type { BootLoader } from '../app/boot-progress';
import { initDevice } from '../core/device';
import { phoneViewportMeta } from '../layout/phone-viewport';
import { skyCss } from '../start/sky/look';
import { startSkyLook } from '../start/start-look';
import { applyWordmarkLight, markBox, paintWordmark, wordmarkLight } from '../start/wordmark-svg';
import geometryCss from '../start/geometry.css?inline';
import { FONTS, preloadFont, preloadStartFaces } from '../theme/fonts';
import { MIRROR_KEY, firstAppearance, panelTop } from './first-paint-data';

/** The loading panel shows only after this long, so a fast (cached) start never flashes it. */
const LOADER_SHOW_MS = 150;
/** Its fade-out when the app takes over. */
const LOADER_FADE_MS = 250;
/** The line's share for the downloads (the boot's own steps fill the rest). */
const DOWNLOAD_SHARE = 90;
/** How often the sky and the wordmark's light follow the game clock, ms. */
const REFRESH_MS = 2000;

/** Sizes of the files the start page downloads (`__wcBootSizes`). */
interface BootSizes {
  files: Record<string, number>;
  fonts: Record<string, number>;
}

/**
 * Sizes (bytes, gzip for scripts and styles) of the files the start page
 * downloads, by path: `files` are needed whatever the font, `fonts` count
 * when the first paint preloads them. vite.config.ts defines
 * `__wcBootSizes` ahead of this script in a production build; in dev the
 * line follows the boot steps only.
 */
function bootSizes(): BootSizes | null {
  const s = (globalThis as { __wcBootSizes?: BootSizes }).__wcBootSizes;
  return s && typeof s === 'object' && s.files && s.fonts ? s : null;
}

function readMirror(): string | null {
  try {
    return globalThis.localStorage?.getItem(MIRROR_KEY) ?? null;
  } catch {
    return null;
  }
}

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls: string): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  e.className = cls;
  return e;
}

function start(win: Window): void {
  const doc = win.document;
  const root = doc.documentElement;
  const params = new URLSearchParams(win.location.search);
  const flags = initDevice(win);
  if (flags.phone) phoneViewportMeta(doc);
  const offline = params.has('replay') || params.has('bench') || params.has('fixture');
  const a = firstAppearance(params.has('safe') ? null : readMirror(), flags.phone);

  // The page colours (src/theme/apply.ts sets the same and the rest).
  const st = root.style;
  st.setProperty('--term-bg', a.bg);
  st.setProperty('--term-fg', a.fg);
  st.setProperty('--pad', `${a.padding}px`);

  // The fonts: the terminal font (the gate waits for it, the cockpit uses
  // it; a local-only one has nothing to preload) and the start page's.
  if (!FONTS[a.font]?.local) preloadFont(a.font, doc);
  if (!offline) preloadStartFaces(doc);
  const style = doc.createElement('style');
  style.id = 'wc-first-geometry';
  style.textContent = geometryCss;
  doc.head.append(style);

  let pct = -1;
  let label = 'Loading client';
  let gone = false;
  let shown = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let ro: ResizeObserver | null = null;
  let loaderEl: HTMLElement | null = null;

  const host = (): HTMLElement | null => doc.getElementById('wc-first');
  const reduced = (): boolean => win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const drawLine = (): void => {
    if (!loaderEl) return;
    const p = Math.max(0, pct);
    const fill = loaderEl.querySelector<HTMLElement>('.f');
    const text = loaderEl.querySelector<HTMLElement>('.l');
    if (fill) fill.style.transform = `scaleX(${p / 100})`;
    if (text) text.textContent = `${label} · ${p}%`;
    loaderEl.setAttribute('aria-valuenow', String(p));
  };

  /** The sky and the wordmark's light for now (the clock moves a game minute a second). */
  const refresh = (): void => {
    const box = host();
    const sky = box?.querySelector<HTMLElement>('.wcf-sky');
    const mark = box?.querySelector<HTMLElement>('.wc-wordmark-host');
    if (!sky || doc.hidden) return;
    const look = startSkyLook({ w: sky.clientWidth, h: sky.clientHeight });
    sky.style.background = skyCss(look).all;
    if (mark?.firstElementChild) applyWordmarkLight(mark, wordmarkLight(look, markBox(mark, win)));
  };

  /** Paints the sky, the wordmark and the loading panel into the host box (again on a resize). */
  function paint(): void {
    if (gone) return;
    let box = host();
    if (offline && !box?.classList.contains('wcf-overlay')) {
      if (!doc.body) return;
      // No start page: the line alone, over whatever comes.
      doc.getElementById('wc-start-host')?.remove();
      box = el(doc, 'div', 'wcf-overlay');
      box.id = 'wc-first';
      doc.body.append(box);
    }
    if (!box || !(box.clientWidth > 0 && box.clientHeight > 0)) return;

    const loader = el(doc, 'div', shown ? 'wcf-loader on' : 'wcf-loader');
    loader.id = 'wc-boot';
    loader.setAttribute('role', 'progressbar');
    loader.setAttribute('aria-label', 'Loading WebCockpit');
    loader.setAttribute('aria-valuemin', '0');
    loader.setAttribute('aria-valuemax', '100');
    const bar = el(doc, 'div', 'bar');
    bar.append(el(doc, 'i', 'f'));
    loader.append(bar, el(doc, 'div', 'l'));
    loaderEl = loader;

    if (offline) {
      box.replaceChildren(loader);
    } else {
      const sky = el(doc, 'div', 'wcf-sky');
      const brand = el(doc, 'div', 'wc-start-brand wcf-brand');
      brand.setAttribute('aria-hidden', 'true');
      const mark = el(doc, 'div', 'wc-wordmark-host');
      brand.append(mark);
      loader.classList.add('wcf-panel');
      box.replaceChildren(sky, brand, loader);
      const look = startSkyLook({ w: sky.clientWidth, h: sky.clientHeight });
      sky.style.background = skyCss(look).all;
      paintWordmark(mark, look, 'full');
      // The menu panel's top, as the start menu lays it out (src/chrome/start.css .wc-sm-stage).
      loader.style.top = panelTop(getComputedStyle(brand).display !== 'none' ? brand.offsetHeight : null);
      timer ??= setInterval(refresh, REFRESH_MS);
    }
    drawLine();

    if (!ro && typeof ResizeObserver === 'function') {
      let size = `${box.clientWidth}x${box.clientHeight}`;
      ro = new ResizeObserver(() => {
        const b = host();
        const next = b ? `${b.clientWidth}x${b.clientHeight}` : size;
        if (next !== size) {
          size = next;
          paint();
        }
      });
      ro.observe(box);
    }
  }

  const boot: BootLoader = {
    step(p: number, text?: string): void {
      if (gone) return;
      if (text) label = text;
      pct = Math.max(pct, Math.min(100, Math.round(p)));
      drawLine();
    },
    done(): void {
      if (gone) return;
      gone = true;
      if (timer) clearInterval(timer);
      ro?.disconnect();
      const box = host();
      // The start page's own sky and wordmark are under these, at the same place.
      box?.querySelector('.wcf-sky')?.remove();
      box?.querySelector('.wcf-brand')?.remove();
      const end = (): void => box?.remove();
      const o = loaderEl ? parseFloat(getComputedStyle(loaderEl).opacity) || 0 : 0;
      if (loaderEl && o > 0 && loaderEl.animate && !reduced()) {
        loaderEl
          .animate([{ opacity: o }, { opacity: 0 }], { duration: LOADER_FADE_MS, easing: 'ease-in', fill: 'forwards' })
          .finished.then(end, end);
      } else end();
    },
  };
  win.__wcBoot = boot;
  boot.step(0);
  // index.html calls it again right after the host (this script runs in <head>).
  (win as Window & { __wcPaint?: () => void }).__wcPaint = paint;
  paint();
  followDownloads(doc, (share) => boot.step(Math.round(share * DOWNLOAD_SHARE)));
  setTimeout(() => {
    if (gone) return;
    shown = true;
    loaderEl?.classList.add('on');
  }, LOADER_SHOW_MS);
}

/**
 * Calls `progress` with the share (0–1) of the start page's bytes that
 * have arrived, from the resource timing entries (each file counts once
 * it has fully arrived). Nothing without the size table (dev).
 */
function followDownloads(doc: Document, progress: (share: number) => void): void {
  const SIZES = bootSizes();
  if (!SIZES || typeof PerformanceObserver !== 'function') return;
  const want = new Map(Object.entries(SIZES.files));
  for (const link of doc.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="font"]')) {
    const path = new URL(link.href, doc.baseURI).pathname;
    const n = SIZES.fonts[path];
    if (n) want.set(path, n);
  }
  let total = 0;
  for (const n of want.values()) total += n;
  if (!(total > 0)) return;
  let got = 0;
  const seen = (entries: PerformanceEntryList): void => {
    for (const e of entries) {
      const path = new URL(e.name, doc.baseURI).pathname;
      const n = want.get(path);
      if (n === undefined) continue;
      want.delete(path);
      got += n;
    }
    progress(Math.min(1, got / total));
    if (want.size === 0) obs.disconnect();
  };
  const obs = new PerformanceObserver((list) => seen(list.getEntries()));
  try {
    obs.observe({ type: 'resource', buffered: true });
  } catch {
    /* no resource timing: the boot steps only */
  }
}

try {
  start(window);
} catch {
  /* the first paint is cosmetic: the app starts without it */
}
