// Shared helpers for the area-A render harnesses (perf/*.ts).
//
// - `startServer(dir, port)`: static server for a built dist with the
//   COOP/COEP headers of `vite preview` (cross-origin isolated, fine timer
//   precision), or without them (`isolated: false`, like GitHub Pages).
// - `launch(name)`: headless Firefox at DPR 2 (layout.css.devPixelsPerPx)
//   or Chromium (deviceScaleFactor 2) with a 1728×1000 CSS px viewport.
// - `openBench(browser, url)`: the `?bench` page, waited until the probe is
//   attached, the font is loaded and a few frames have passed.
// - stats helpers and `loadavg()`.
import { createReadStream, readFileSync, realpathSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const { chromium, firefox } = await import('@playwright/test');
export type Browser = import('@playwright/test').Browser;
export type BrowserContext = import('@playwright/test').BrowserContext;
export type Page = import('@playwright/test').Page;

export const VIEWPORT = { width: Number(process.env.WC_VW ?? 1728), height: Number(process.env.WC_VH ?? 1000) };
export const DPR = Number(process.env.WC_DPR ?? 2);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.mm2': 'application/octet-stream',
};

/**
 * Serves `dir` (a dist, or a directory of dists under sub-paths). Index
 * fallback for directories. COOP/COEP unless `isolated` is false.
 */
export function startServer(dir: string, port: number, isolated = true): Promise<Server> {
  const root = realpathSync(dir);
  const headers: Record<string, string> = isolated
    ? { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cache-Control': 'no-store' }
    : { 'Cache-Control': 'no-store' };
  const server = createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    let full = resolve(root, '.' + path);
    if (!(full === root || full.startsWith(root + sep))) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      if (statSync(full).isDirectory()) full = resolve(full, 'index.html');
      statSync(full);
    } catch {
      res.writeHead(404, headers);
      res.end('not found');
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Type': MIME[extname(full)] ?? 'application/octet-stream' });
    createReadStream(full).pipe(res);
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r(server)));
}

export type BrowserName = 'firefox' | 'chromium' | 'chromium-gpu';

export interface Launched {
  name: BrowserName;
  browser: Browser;
  context: BrowserContext;
}

/** Headless browser + context at DPR 2 and the big viewport. */
export async function launch(name: BrowserName, extra: { env?: Record<string, string>; args?: string[] } = {}): Promise<Launched> {
  let browser: Browser;
  if (name === 'firefox') {
    browser = await firefox.launch({
      firefoxUserPrefs: { 'layout.css.devPixelsPerPx': String(DPR) },
      ...(extra.env ? { env: { ...process.env, ...extra.env } as Record<string, string> } : {}),
      ...(extra.args ? { args: extra.args } : {}),
    });
  } else {
    const args = name === 'chromium-gpu' ? ['--enable-gpu', '--use-angle=vulkan'] : [];
    browser = await chromium.launch({ args: [...args, ...(extra.args ?? [])] });
  }
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DPR });
  return { name, browser, context };
}

/** Opens `url` (a `?bench` page) and waits until it is ready to measure. */
export async function openBench(l: Launched, url: string): Promise<Page> {
  const page = await l.context.newPage();
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__wcBench !== undefined && window.__wcBench.app !== null);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await pause(300);
  return page;
}

export const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function pct(xs: number[], p: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
}
export const median = (xs: number[]) => pct(xs, 50);
export const maxOf = (xs: number[]) => (xs.length ? Math.max(...xs) : NaN);
export const minOf = (xs: number[]) => (xs.length ? Math.min(...xs) : NaN);
export const f1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '—');
export const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—');

export function loadavg(): string {
  try {
    return readFileSync('/proc/loadavg', 'utf8').trim().split(' ').slice(0, 3).join(' ');
  } catch {
    return '?';
  }
}

/** "median [min–max]" of a sample. */
export function mm(xs: number[]): string {
  return `${f1(median(xs))} [${f1(minOf(xs))}–${f1(maxOf(xs))}]`;
}

/** Page facts worth logging next to numbers. */
export async function pageFacts(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const sc = document.querySelector('.wc-scroller') as HTMLElement | null;
    const app = window.__wcBench!.app!;
    return {
      dpr: devicePixelRatio,
      inner: `${innerWidth}x${innerHeight}`,
      coi: crossOriginIsolated,
      cellW: cs.getPropertyValue('--cell-w'),
      cellH: cs.getPropertyValue('--cell-h'),
      cellLs: cs.getPropertyValue('--cell-ls'),
      fontSize: cs.getPropertyValue('--font-size'),
      fontMono: cs.getPropertyValue('--font-mono'),
      scroller: sc ? `${sc.clientWidth}x${sc.clientHeight}` : null,
      cells: app.output.measureCells(),
      ua: navigator.userAgent,
    };
  });
}
