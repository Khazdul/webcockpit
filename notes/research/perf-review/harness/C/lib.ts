// Shared helpers for the area-C (input latency) harnesses. Not part of the
// app; kept untracked under perf/.
//
// - A static server for dist/ (optionally with COOP/COEP, like `vite
//   preview`; without them it matches GitHub Pages, the production host).
// - Browser launch at a device pixel ratio (Firefox: devPixelsPerPx pref;
//   Chromium: deviceScaleFactor), headless only.
// - Opening the app with `?bench`, waiting for the map pane's first frame.
// - Stats and load-average helpers.

import { createReadStream, readFileSync, realpathSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import os from 'node:os';
import { chromium, firefox, type Browser, type Page } from '@playwright/test';

export const ROOT = resolve(new URL('..', import.meta.url).pathname);
export const RUNS = '/home/ole/MUME/data/runs';

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

/** Serves `dir` at `/` on `port`; `coi` adds COOP/COEP (cross-origin isolated). */
export function startServer(dir: string, port: number, coi: boolean): Promise<Server> {
  const root = realpathSync(dir);
  const headers: Record<string, string> = coi
    ? { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cache-Control': 'no-store' }
    : { 'Cache-Control': 'max-age=600' };
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const full = resolve(root, '.' + p);
    if (!full.startsWith(root + sep) && full !== root) {
      res.writeHead(404);
      res.end();
      return;
    }
    try {
      const st = statSync(full);
      if (!st.isFile()) throw new Error('not a file');
      res.writeHead(200, { ...headers, 'Content-Type': MIME[extname(full)] ?? 'application/octet-stream', 'Content-Length': st.size });
      createReadStream(full).pipe(res);
    } catch {
      res.writeHead(404, headers);
      res.end('not found');
    }
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', () => ok(server));
  });
}

export type BrowserName = 'firefox' | 'chromium';

export interface LaunchOpts {
  dpr?: number;
  /** Chromium: real GPU (ANGLE/Vulkan) like the bench's chromium-gpu. */
  gpu?: boolean;
  env?: Record<string, string>;
}

export async function launch(name: BrowserName, o: LaunchOpts = {}): Promise<Browser> {
  const dpr = o.dpr ?? 2;
  if (name === 'firefox') {
    return firefox.launch({
      headless: true,
      firefoxUserPrefs: { 'layout.css.devPixelsPerPx': String(dpr) },
      ...(o.env ? { env: { ...process.env, ...o.env } as Record<string, string> } : {}),
    });
  }
  const args = o.gpu === false ? [] : ['--enable-gpu', '--use-angle=vulkan'];
  return chromium.launch({ headless: true, args, ...(o.env ? { env: { ...process.env, ...o.env } as Record<string, string> } : {}) });
}

export interface OpenOpts {
  width?: number;
  height?: number;
  dpr?: number;
  /** Extra query (e.g. '&x=1'). */
  query?: string;
  /** Wait for the map pane's first complete frame (default true). */
  waitMap?: boolean;
}

export async function openApp(browser: Browser, name: BrowserName, base: string, o: OpenOpts = {}): Promise<Page> {
  const dpr = o.dpr ?? 2;
  // Firefox: the devPixelsPerPx pref covers the cross-origin isolated page,
  // the context override covers the plain (Pages-like) page; set both.
  const ctx = await browser.newContext({
    viewport: { width: o.width ?? 1728, height: o.height ?? 1000 },
    deviceScaleFactor: dpr,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.error('console:', m.text());
  });
  await page.goto(`${base}/?bench${o.query ?? ''}`);
  await page.waitForFunction(() => window.__wcBench !== undefined && window.__wcBench.app !== null);
  if (o.waitMap !== false) {
    await page
      .waitForSelector('.wc-pane-map .wc-pane-content[data-map-drawn-ms]', { state: 'attached', timeout: 30_000 })
      .catch(() => console.warn('map pane did not draw (continuing)'));
  }
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await pause(500);
  const got = await page.evaluate(() => [devicePixelRatio, innerWidth, innerHeight]);
  if (got[0] !== dpr) console.warn(`devicePixelRatio is ${got[0]}, wanted ${dpr}`);
  return page;
}

/** Max of an array without spreading it (large arrays overflow the stack). */
export function maxOf(xs: readonly number[], ...more: number[]): number {
  let m = -Infinity;
  for (const x of xs) if (x > m) m = x;
  for (const x of more) if (x > m) m = x;
  return xs.length || more.length ? m : NaN;
}

export const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function pct(xs: number[], p: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
}

export interface Stats {
  n: number;
  median: number;
  p95: number;
  p99: number;
  max: number;
  mean: number;
}

export function stats(xs: number[]): Stats {
  const n = xs.length;
  return {
    n,
    median: pct(xs, 50),
    p95: pct(xs, 95),
    p99: pct(xs, 99),
    max: n ? maxOf(xs) : NaN,
    mean: n ? xs.reduce((a, b) => a + b, 0) / n : NaN,
  };
}

export const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
export const fs = (s: Stats, d = 2) => `${f(s.median, d)} / ${f(s.p95, d)} / ${f(s.max, d)} (n=${s.n})`;
export const fs99 = (s: Stats, d = 3) => `${f(s.median, d)} / ${f(s.p99, d)} / ${f(s.max, d)} (n=${s.n})`;

export function loadavg(): string {
  try {
    return readFileSync('/proc/loadavg', 'utf8').trim();
  } catch {
    return os.loadavg().map((x) => x.toFixed(2)).join(' ');
  }
}

/** Node-side wall-clock ms with sub-ms precision (comparable to the page's timeOrigin + now()). */
export const nodeEpoch = () => performance.timeOrigin + performance.now();

/** The bundled khazdul profile, plus a printable-key macro for the tests (ADR 0026). */
export function khazdulProfile(extra = '#macro {Backquote} {sc}\n#macro {Shift+1} {hit $target}\n'): string {
  return readFileSync(resolve(ROOT, 'src/profiles/khazdul.tin'), 'utf8') + '\n' + extra;
}

export function readText(path: string): string {
  return readFileSync(path, 'utf8');
}

/** Lines [from, to] (1-based, inclusive) of a log file. */
export function logSlice(path: string, from: number, to: number): string {
  const lines = readFileSync(path, 'utf8').split('\n');
  return lines.slice(from - 1, to).join('\n') + '\n';
}
