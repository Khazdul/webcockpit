// First paint (ADR 0083). Bundled into one IIFE and inlined into
// index.html by vite.config.ts (`firstPaintPlugin`), right after the start
// page host in <body>; never imported by the app. As an inline script
// after the stylesheets it runs once they have loaded, when the page could
// first be painted, so the box is laid out as the app will lay it out.
//
// It decides the device flags (as src/main.ts will), reads the saved
// appearance (the localStorage mirror, as the settings store will), sets
// the colours, preloads the selected font's files (so they download
// beside the scripts instead of after them), registers the banner faces
// (src/boot/banner-faces.ts) and defines `window.__wcBoot`. Then it draws
// the start page banner exactly where the app's banner will be (the same
// cell grid, layout and glyphs) and the loading bar below it, where the
// menu will appear; again on every resize of the box.
//
// The stars twinkle from here on; the app's banner takes over their clock
// (`__wcBoot.banner`, src/chrome/banner.tsx) and the quote the layout was
// made for (`__wcBoot.quote`), so the hand-over in src/app/boot-progress.ts
// `revealStart` (the app's banner shown, this one removed, in one task)
// changes no pixel. The offline modes (`?replay`, `?bench`, `?fixture=`)
// go straight to the cockpit: only the bar, centred in the window.
//
// The cell is `nominalCell` (the app measures the loaded font later; with
// a bundled font in Chromium the two agree). Lucida Console (installed
// fonts only) is looked up first, as the app does, and drawn after.

import type { BootBanner, BootLoader } from '../app/boot-progress';
import { BANNER_W, STARS, type StarAnim, bannerCrop, bannerRows, makeAnims, starLook } from '../chrome/banner-data';
import { centreLeft, tooSmall } from '../chrome/kit/nav';
import { QUOTES } from '../chrome/quotes';
import { START_MENU_ROWS, startLayout } from '../chrome/start-layout';
import { initDevice } from '../core/device';
import { phoneViewportMeta } from '../layout/phone-viewport';
import { themeColors } from '../theme/apply';
import { type CellSize, devicePixelRatioOf, nominalCell, textGridOf } from '../theme/cells';
import { FONTS, detectLocalFonts, effectiveFont, preloadFont } from '../theme/fonts';
import type { FontId } from '../settings/types';
import { defaultSettings } from '../settings/types';
import { BANNER_FACES } from './banner-faces';
import { MIRROR_KEY, bannerFiles, faceName, firstAppearance } from './first-paint-data';

/** Cells of the loading bar (fewer on a narrow grid). */
const LOADER_W = 28;
/** The bar is shown only after this long, so a fast (cached) start never flashes it. */
const LOADER_SHOW_MS = 150;
/** Fade-out of the bar when the app takes over. */
const LOADER_FADE_MS = 250;
/** The bar's share for the downloads (the boot's own steps fill the rest). */
const DOWNLOAD_SHARE = 90;
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
 * bar follows the boot steps only.
 */
function bootSizes(): BootSizes | null {
  const s = (globalThis as { __wcBootSizes?: BootSizes }).__wcBootSizes;
  return s && typeof s === 'object' && s.files && s.fonts ? s : null;
}

/** Twinkle rate, as the start page's banner. */
const HZ = 12;
/** After the banner faces: text the faces lack (the bar's label and percentage). */
const SYSTEM_MONO = 'ui-monospace, Menlo, Consolas, "Liberation Mono", "Courier New", monospace';

function bytes(b64: string): ArrayBuffer {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out.buffer;
}

/** Registers the banner faces of `id`: the CSS font-family value, and when they have loaded. */
function registerFaces(doc: Document, id: FontId): { family: string; loaded: Promise<unknown> } {
  const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
  const Face = (globalThis as { FontFace?: typeof FontFace }).FontFace;
  const names: string[] = [];
  const loads: Promise<unknown>[] = [];
  for (const file of bannerFiles(id)) {
    const name = faceName(file);
    names.push(`"${name}"`);
    if (!fonts || !Face) continue;
    try {
      const local = FONTS[id].local;
      const face = file.startsWith('local:')
        ? new Face(name, local!.map((n) => `local("${n}")`).join(', '))
        : new Face(name, bytes(BANNER_FACES[file]!.woff2));
      fonts.add(face);
      loads.push(face.load().catch(() => undefined));
    } catch {
      /* the banner falls back to the next face */
    }
  }
  return { family: [...names, SYSTEM_MONO].join(', '), loaded: Promise.all(loads) };
}

/**
 * The letter-spacing that corrects the advance of `family` to the cell, as
 * src/theme/cells.ts `measureCell` does for the app's font (Firefox: its
 * 1/60 px layout units; 0 in Chromium).
 */
function spacing(doc: Document, family: string, cell: CellSize): number {
  const RUN = 40;
  const span = doc.createElement('span');
  span.style.cssText =
    'position:absolute;left:-10000px;top:0;visibility:hidden;white-space:pre;letter-spacing:0;' +
    `font-family:${family};font-size:${cell.px}px`;
  span.textContent = '█'.repeat(RUN);
  (doc.body ?? doc.documentElement).append(span);
  const w = span.getBoundingClientRect().width / RUN;
  span.remove();
  const err = cell.w - w;
  return w > 0 && Math.abs(err) >= 0.002 && Math.abs(err) <= 0.5 ? Math.round(err * 1e4) / 1e4 : 0;
}

function readMirror(): string | null {
  try {
    return globalThis.localStorage?.getItem(MIRROR_KEY) ?? null;
  } catch {
    return null;
  }
}

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls: string, css = ''): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  e.className = cls;
  if (css) e.style.cssText = css;
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

  // Colours (src/theme/apply.ts sets the same and the rest).
  const st = root.style;
  st.setProperty('--term-bg', a.bg);
  st.setProperty('--term-fg', a.fg);
  st.setProperty('--pad', `${a.padding}px`);
  const colors = themeColors(a.bg);
  for (const [k, v] of Object.entries(colors.banner)) st.setProperty(`--${k}`, v);
  st.setProperty('--wcf-fill', colors.ui['accent'] ?? '#ffaf00');
  st.setProperty('--wcf-track', colors.ui['hint'] ?? '#585858');
  st.setProperty('--wcf-text', colors.ui['body'] ?? '#8a8a8a');

  // The selected font: preloaded now; a local-only one is looked up first.
  const local = !!FONTS[a.font]?.local;
  if (!local) preloadFont(a.font, doc);
  let font: { cell: CellSize; family: string; ls: number } | null = null;
  const useFont = (): void => {
    const id = effectiveFont(a.font);
    const cell = nominalCell({ ...defaultSettings().appearance, ...a }, devicePixelRatioOf(doc), textGridOf(doc));
    const faces = registerFaces(doc, id);
    const f = (font = { cell, family: faces.family, ls: 0 });
    void faces.loaded.then(() => {
      f.ls = spacing(doc, f.family, cell);
      const box = host();
      if (box && f === font) box.style.letterSpacing = `${f.ls}px`;
    });
  };
  if (local) void detectLocalFonts().then(() => (useFont(), paint()));
  else useFont();

  const quote = Math.floor(Math.random() * QUOTES.length) % QUOTES.length;
  let pct = -1;
  let label = 'Loading client';
  let gone = false;
  let shown = false;
  let anims: StarAnim[] | null = null;
  let t0 = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let ro: ResizeObserver | null = null;
  let loaderEl: HTMLElement | null = null;

  const host = (): HTMLElement | null => doc.getElementById('wc-first');
  const reduced = (): boolean => win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  /** The bar's cells on a grid `cols` wide. */
  const barCells = (cols: number): number => Math.max(4, Math.min(LOADER_W, cols - 6));

  const drawBar = (): void => {
    const bar = loaderEl?.querySelector<HTMLElement>('.bar');
    const text = loaderEl?.querySelector<HTMLElement>('.l');
    if (!loaderEl || !bar || !text || !font) return;
    const n = Number(bar.dataset.cells);
    const w = font.cell.w;
    const on = Math.round((Math.max(0, pct) / 100) * n);
    const s = String(Math.max(0, pct));
    // The fill is one box (no seams between cells at any pixel ratio); the
    // track is `░` cells, clipped to their width whatever face draws them.
    bar.innerHTML =
      `<i class="f" style="width:${on * w}px"></i>` +
      `<i class="t" style="width:${(n - on) * w}px">${'░'.repeat(n - on)}</i>` +
      `<span class="p">${'     '.slice(s.length)}${s}%</span>`;
    text.textContent = label;
    loaderEl.setAttribute('aria-valuenow', s);
  };

  const tick = (): void => {
    const h = host();
    if (!anims || !h || doc.hidden) return;
    const t = (win.performance.now() - t0) / 1000;
    for (const span of h.querySelectorAll<HTMLElement>('[data-star]')) {
      const i = Number(span.dataset.star);
      const look = starLook(STARS[i]!, anims[i]!, t);
      const cls = `wcf-s${look.tier}`;
      if (span.className !== cls) span.className = cls;
      if (span.textContent !== look.glyph) span.textContent = look.glyph;
    }
  };

  /** Draws the banner and the bar into the host box (again on a resize). */
  function paint(): void {
    if (gone || !font) return;
    let box = host();
    if (offline && !box?.classList.contains('wcf-overlay')) {
      if (!doc.body) return;
      // No start page: the bar alone, over whatever comes.
      doc.getElementById('wc-start-host')?.remove();
      box = el(doc, 'div', 'wcf-overlay');
      box.id = 'wc-first';
      doc.body.append(box);
    }
    if (!box) return;
    const { cell, family } = font;
    const W = box.clientWidth;
    const H = box.clientHeight;
    if (!(W > 0 && H > 0)) return;
    // The app's grid (src/chrome/kit/hooks.ts useHostGrid).
    const cols = Math.floor(W / cell.w + 1e-6);
    const rows = Math.floor(H / cell.h + 1e-6);
    const dpr = devicePixelRatioOf(doc);
    const left = Math.floor(((W - cols * cell.w) / 2) * dpr + 1e-6) / dpr;
    const top = Math.floor(((H - rows * cell.h) / 2) * dpr + 1e-6) / dpr;
    const layout = offline || tooSmall(cols, rows) ? null : startLayout(cols, rows, QUOTES[quote]!.text, START_MENU_ROWS);

    box.style.setProperty('--wcf-w', `${cell.w}px`);
    box.style.setProperty('--wcf-h', `${cell.h}px`);
    box.style.fontFamily = family;
    box.style.fontSize = `${cell.px}px`;
    box.style.letterSpacing = `${font.ls}px`;
    box.style.lineHeight = `${cell.h}px`;
    const screen = el(
      doc,
      'div',
      'wcf-screen',
      `left:${left}px;top:${top}px;width:${cols * cell.w}px;height:${rows * cell.h}px`,
    );

    if (layout?.showBanner) {
      // As src/chrome/banner.tsx, one blank row down (start-main.tsx).
      const crop = bannerCrop(cols) ?? { c0: 0, width: BANNER_W };
      const at = centreLeft(cols, crop.width);
      const banner = el(doc, 'div', 'wcf-banner', `top:${cell.h}px`);
      banner.setAttribute('aria-hidden', 'true');
      for (const segs of bannerRows(STARS, crop.c0, crop.width)) {
        const line = el(doc, 'div', 'wcf-line', `padding-left:${at * cell.w}px`);
        for (const s of segs) {
          if (s.cls === 'space') {
            line.append(s.text);
            continue;
          }
          const span = el(doc, 'span', s.cls === 'star' ? `wcf-s${STARS[s.star!]!.tier}` : `wcf-${s.cls}`);
          if (s.cls === 'star') span.dataset.star = String(s.star);
          span.textContent = s.text;
          line.append(span);
        }
        banner.append(line);
      }
      screen.append(banner);
      if (!anims) {
        anims = makeAnims();
        t0 = win.performance.now();
        boot.banner = { anims, t0 } satisfies BootBanner;
        timer = setInterval(tick, Math.round(1000 / HZ));
      }
    }

    // The bar where the menu will appear (the third menu row), its label two rows down.
    const n = barCells(cols);
    const barRow = layout ? layout.menuRow + 2 : Math.max(0, Math.floor(rows / 2) - 1);
    const loader = el(doc, 'div', shown ? 'wcf-loader on' : 'wcf-loader');
    loader.id = 'wc-boot';
    loader.setAttribute('role', 'progressbar');
    loader.setAttribute('aria-label', 'Loading WebCockpit');
    loader.setAttribute('aria-valuemin', '0');
    loader.setAttribute('aria-valuemax', '100');
    const bar = el(doc, 'div', 'bar', `top:${barRow * cell.h}px;left:${centreLeft(cols, n + 5) * cell.w}px;height:${cell.h}px`);
    bar.dataset.cells = String(n);
    loader.append(bar, el(doc, 'div', 'l', `top:${(barRow + 2) * cell.h}px;height:${cell.h}px`));
    screen.append(loader);
    loaderEl = loader;
    drawBar();

    box.replaceChildren(screen);
    tick();
    if (!ro && typeof ResizeObserver === 'function') {
      let size = `${W}x${H}`;
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
    quote,
    banner: null,
    step(p: number, text?: string): void {
      if (gone) return;
      const next = Math.max(pct, Math.min(100, Math.round(p)));
      if (text) label = text;
      pct = next;
      drawBar();
    },
    done(): void {
      if (gone) return;
      gone = true;
      if (timer) clearInterval(timer);
      ro?.disconnect();
      const box = host();
      box?.querySelector('.wcf-banner')?.remove();
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
