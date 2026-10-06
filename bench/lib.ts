// Shared helpers for bench/browser-bench.ts and its scenario modules:
// stats and formatting, the load average, browser targets at a geometry
// (viewport and device pixel ratio), opening the `?bench` page with the
// probe's opt-in URL parameters, the rAF / long-frame monitor, and the
// Node ↔ page clock offset.

import { readFileSync } from 'node:fs';
import os from 'node:os';
import { chromium, firefox, type Browser, type Page } from '@playwright/test';

// ------------------------------------------------------------------ stats

export function pct(xs: readonly number[], p: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
}
export const median = (xs: readonly number[]) => pct(xs, 50);
/** Max without spreading (large arrays overflow the stack). */
export function max(xs: readonly number[]): number {
  let m = -Infinity;
  for (const x of xs) if (x > m) m = x;
  return xs.length ? m : NaN;
}
export const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

export interface Dist {
  n: number;
  median: number;
  p95: number;
  p99: number;
  max: number;
}
export function dist(xs: readonly number[]): Dist {
  return { n: xs.length, median: pct(xs, 50), p95: pct(xs, 95), p99: pct(xs, 99), max: max(xs) };
}

export const f1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '—');
export const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—');
export const f3 = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '—');
/** "median / p95 / max" of a Dist. */
export const fd = (d: Dist, f: (n: number) => string = f1) => `${f(d.median)} / ${f(d.p95)} / ${f(d.max)}`;
export const pass = (ok: boolean) => (ok ? '**PASS**' : '**FAIL**');
export const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The 1-, 5- and 15-minute load averages. */
export function loadavg(): string {
  try {
    return readFileSync('/proc/loadavg', 'utf8').trim().split(' ').slice(0, 3).join(' ');
  } catch {
    return os.loadavg().map((x) => x.toFixed(2)).join(' ');
  }
}

/** Node-side wall clock in ms with sub-ms precision (comparable to the page's timeOrigin + now()). */
export const nodeEpoch = () => performance.timeOrigin + performance.now();

// --------------------------------------------------------------- targets

export interface Geometry {
  width: number;
  height: number;
  dpr: number;
}
/** The owner's window: a 1728 × 1000 CSS px viewport at device pixel ratio 2. */
export const OWNER: Geometry = { width: 1728, height: 1000, dpr: 2 };
/** The bench's earlier geometry (stages 1–9). */
export const LEGACY: Geometry = { width: 1280, height: 720, dpr: 1 };
export const geometryText = (g: Geometry) => `${g.width} × ${g.height}, ratio ${g.dpr}`;

export type TargetName = 'firefox' | 'chromium' | 'chromium-gpu';
export interface Target {
  name: TargetName;
  browser: Browser;
  geometry: Geometry;
  isChromium: boolean;
}

export const gpuArgs = () => (process.env.WC_BENCH_GPU_ARGS ?? '--enable-gpu --use-angle=vulkan').split(' ').filter(Boolean);

/**
 * Launches `name` for `geometry`. Firefox drops a context's
 * deviceScaleFactor on the cross-origin isolated app page, so a ratio
 * other than 1 needs the `layout.css.devPixelsPerPx` pref (tests/e2e/dpr.ts).
 */
export async function launchTarget(name: TargetName, geometry: Geometry, extraArgs: string[] = []): Promise<Target> {
  const browser =
    name === 'firefox'
      ? await firefox.launch(geometry.dpr !== 1 ? { firefoxUserPrefs: { 'layout.css.devPixelsPerPx': String(geometry.dpr) } } : {})
      : await chromium.launch({ args: [...(name === 'chromium-gpu' ? gpuArgs() : []), ...extraArgs] });
  return { name, browser, geometry, isChromium: name !== 'firefox' };
}

export interface OpenOptions {
  /** Settings patch applied before the shell is built (`benchSettings`). */
  settings?: unknown;
  /** Log every animation frame and side-pane render (`benchFrames`). */
  frames?: boolean;
  /** Count live timers and window/document listeners (`benchCounters`). */
  counters?: boolean;
}

/**
 * `panes.map.on` as a settings patch: every run sets it explicitly.
 * WC_BENCH_TILESET=<id> also picks a map tileset (ADR 0082).
 */
export const mapSetting = (on: boolean) => ({
  panes: { map: { on } },
  ...(process.env.WC_BENCH_TILESET ? { mapper: { tileset: process.env.WC_BENCH_TILESET } } : {}),
});

/** Opens the `?bench` page in a fresh context at the target's geometry. Close with `page.context().close()`. */
export async function openBench(t: Target, base: string, o: OpenOptions = {}): Promise<Page> {
  const ctx = await t.browser.newContext({
    viewport: { width: t.geometry.width, height: t.geometry.height },
    deviceScaleFactor: t.geometry.dpr,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  let q = '?bench';
  if (o.settings !== undefined) q += `&benchSettings=${encodeURIComponent(JSON.stringify(o.settings))}`;
  if (o.frames) q += '&benchFrames';
  if (o.counters) q += '&benchCounters';
  await page.goto(`${base}/${q}`);
  await page.waitForFunction(() => window.__wcBench !== undefined && window.__wcBench.app !== null);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // Let the page render its first frames before measuring: Chromium's first
  // frame after load takes ~100+ ms and is not part of any budget.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await pause(300);
  const dpr = await page.evaluate(() => devicePixelRatio);
  if (dpr !== t.geometry.dpr) console.warn(`  warning: devicePixelRatio ${dpr}, wanted ${t.geometry.dpr}`);
  return page;
}

export const closePage = (page: Page) => page.context().close();

/** The WebGL renderer string a page of this browser gets (SwiftShader = software GL). */
export async function glRenderer(browser: Browser): Promise<string> {
  const page = await browser.newPage();
  await page.setContent('<canvas></canvas>');
  const r = await page.evaluate(() => {
    const gl = document.querySelector('canvas')!.getContext('webgl2');
    if (!gl) return 'no WebGL2';
    const e = gl.getExtension('WEBGL_debug_renderer_info');
    return String(e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  });
  await page.close();
  return r;
}

// --------------------------------------------------------------- monitor

/** rAF delta monitor plus Long Animation Frame / long task observers. */
export async function startMonitor(page: Page): Promise<void> {
  await page.evaluate(() => {
    const mon = { deltas: [] as number[], loaf: [] as number[], longtask: [] as number[], run: true, loafSupported: false, ltSupported: false };
    (window as unknown as { __mon: typeof mon }).__mon = mon;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      mon.deltas.push(now - last);
      last = now;
      if (mon.run) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const types = PerformanceObserver.supportedEntryTypes ?? [];
    if (types.includes('long-animation-frame')) {
      mon.loafSupported = true;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) mon.loaf.push(e.duration);
      }).observe({ type: 'long-animation-frame' });
    }
    if (types.includes('longtask')) {
      mon.ltSupported = true;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) mon.longtask.push(e.duration);
      }).observe({ type: 'longtask' });
    }
  });
}

export interface MonitorResult {
  deltas: number[];
  loaf: number[];
  longtask: number[];
  loafSupported: boolean;
  ltSupported: boolean;
}

export async function stopMonitor(page: Page): Promise<MonitorResult> {
  return page.evaluate(() => {
    const mon = (window as unknown as { __mon: MonitorResult & { run: boolean } }).__mon;
    mon.run = false;
    return { deltas: mon.deltas, loaf: mon.loaf, longtask: mon.longtask, loafSupported: mon.loafSupported, ltSupported: mon.ltSupported };
  });
}

// ----------------------------------------------------------------- clock

/** Page clock (timeOrigin + now) minus Node's, from the round trip with the smallest RTT. */
export async function clockOffset(page: Page): Promise<{ off: number; rtt: number }> {
  let best = { rtt: Infinity, off: 0 };
  for (let i = 0; i < 30; i++) {
    const t0 = nodeEpoch();
    const tp = await page.evaluate(() => performance.timeOrigin + performance.now());
    const t1 = nodeEpoch();
    if (t1 - t0 < best.rtt) best = { rtt: t1 - t0, off: tp - (t0 + t1) / 2 };
  }
  return best;
}

// ----------------------------------------------------------------- trace

type TraceEv = { name: string; ph: string; ts: number; dur?: number; pid: number; tid: number; args?: { name?: string; data?: { functionName?: string; url?: string; type?: string } } };

/**
 * The longest main-thread tasks of a Chromium DevTools trace (RunTask on
 * the busiest CrRendererMain), each labelled with its biggest children
 * (GC, script, style, layout …), longest first.
 */
export function traceTasks(buf: Buffer): { ms: number; label: string }[] {
  const all = (JSON.parse(buf.toString()) as { traceEvents: TraceEv[] }).traceEvents;
  const names = new Map<string, string>();
  for (const e of all) if (e.name === 'thread_name' && e.ph === 'M') names.set(`${e.pid}:${e.tid}`, e.args?.name ?? '');
  const count = new Map<string, number>();
  for (const e of all) {
    const k = `${e.pid}:${e.tid}`;
    if (names.get(k) === 'CrRendererMain' && e.name === 'RunTask') count.set(k, (count.get(k) ?? 0) + 1);
  }
  const main = [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
  const on = all.filter((e) => `${e.pid}:${e.tid}` === main && e.ph === 'X' && e.dur !== undefined);
  // Tasks may be logged twice (nested RunTask events): keep the outermost.
  const all2 = on.filter((e) => e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask').sort((a, b) => a.ts - b.ts || (b.dur ?? 0) - (a.dur ?? 0));
  const tasks: TraceEv[] = [];
  let end = -Infinity;
  for (const e of all2) {
    if (e.ts < end) continue;
    tasks.push(e);
    end = e.ts + (e.dur ?? 0);
  }
  tasks.sort((a, b) => (b.dur ?? 0) - (a.dur ?? 0));
  const kids = on.filter((e) => e.name !== 'RunTask' && e.name !== 'ThreadControllerImpl::RunTask');
  const KEEP = /^(TimerFire|FireAnimationFrame|UpdateLayoutTree|Layout|Paint|PrePaint|Layerize|Commit|FunctionCall|EventDispatch|RunMicrotasks|ParseHTML|HitTest|v8\.run|.*GC.*|Scavenge.*|.*Mark.*)$/;
  const label = (t: TraceEv): string => {
    const by = new Map<string, number>();
    for (const k of kids) {
      if (k.ts < t.ts || k.ts + (k.dur ?? 0) > t.ts + (t.dur ?? 0) || !KEEP.test(k.name)) continue;
      let n = k.name;
      if (n === 'EventDispatch') n = `EventDispatch ${k.args?.data?.type ?? '?'}`;
      by.set(n, (by.get(n) ?? 0) + (k.dur ?? 0) / 1000);
    }
    return [...by].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ') || '—';
  };
  return tasks.slice(0, 8).map((t) => ({ ms: (t.dur ?? 0) / 1000, label: label(t) }));
}

export const TRACE_CATEGORIES = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'toplevel', 'v8', 'disabled-by-default-v8.gc', 'blink.user_timing'];
