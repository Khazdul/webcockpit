// Browser benchmark for the spec §1.3 budgets that exist in stage 1.
//
//   node bench/browser-bench.ts        (part of `npm run bench`)
//
// Builds the app, serves it with `vite preview` (the production bundle),
// and drives it in Chromium and Firefox with Playwright through the
// `?bench` probe (src/app/bench-hook.ts):
//
// - key → send:     synthetic Enter keydown → Socketish.send (< 1 ms)
// - frame → paint:  fixture frames injected at random 20–80 ms intervals;
//                   rendered in the next animation frame
// - scrollback:     flush cost with 0 vs 20 000 rows present (no slowdown)
// - burst:          the biggest fixture replayed at max speed; no frame
//                   longer than 50 ms
// - script (stage 3): 500 user rules through the display pipeline
//                   (< 0.2 ms per line); key → send with an alias and a
//                   macro in the path (< 1 ms)
// - map (stage 9, ADR 0020 "Performance gates"): key → send, frame →
//                   paint, scrollback and burst again with the Map pane on
//                   (arda.mm2 loaded) while GMCP moves from
//                   tests/fixtures/map-demo.log are fed every 100 ms (the
//                   burst gets them interleaved into its log); and the
//                   main-thread long tasks / frames while the map turns on
//                   and loads, with the worker's load timing
//
// Writes bench/results/latest.md. Skips gracefully without fixtures.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { registerHooks } from 'node:module';
import os from 'node:os';

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (err) {
      if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) {
        return next(specifier + '.ts', context);
      }
      throw err;
    }
  },
});

const { biggestFixture, FIXTURES_ROOT } = await import('../tests/e2e/fixtures');
const { makeRuleProfile, RULE_COUNT } = await import('./rules');
const { chromium, firefox } = await import('@playwright/test');
const { build, preview } = await import('vite');
type Browser = import('@playwright/test').Browser;
type Page = import('@playwright/test').Page;

const FRAME_BUDGET_MS = 50;
const KEY_BUDGET_MS = 1;
const RULE_BUDGET_US = 200;

const fixture = biggestFixture();
if (!fixture) {
  console.log(`browser-bench: no .log under ${FIXTURES_ROOT}, skipped`);
  process.exit(0);
}
const logText = readFileSync(fixture.path, 'utf8');
const ruleProfile = makeRuleProfile(
  logText.split('\n').map((l) => l.slice(l.indexOf(' ') + 1).replace(/\x1b\[[0-9;]*m/g, '')),
);

// Map: the GMCP lines of the map-demo walk (Room.Info, Event.Moved, Group.*,
// Char.*), fed on a timer; and the burst log with one of them after every
// MAP_EVERY lines (timestamp of the line before), looping over the walk.
const MAP_FEED_MS = 100;
const MAP_EVERY = 50;
const mapGmcp = readFileSync(new URL('../tests/fixtures/map-demo.log', import.meta.url), 'utf8')
  .split('\n')
  .filter((l) => /^\d+ \x1bGMCP /.test(l));
const mapFeedText = mapGmcp.map((l, i) => `${1_790_000_000_000_000 + i * 10_000}${l.slice(l.indexOf(' '))}`).join('\n') + '\n';
const burstMapText = (() => {
  const out: string[] = [];
  let k = 0;
  let n = 0;
  for (const l of logText.split('\n')) {
    out.push(l);
    if (++n % MAP_EVERY !== 0) continue;
    const sp = l.indexOf(' ');
    if (sp <= 0) continue;
    const g = mapGmcp[k++ % mapGmcp.length]!;
    out.push(l.slice(0, sp) + g.slice(g.indexOf(' ')));
  }
  return { text: out.join('\n'), gmcp: k };
})();

// ------------------------------------------------------------------ stats

function pct(xs: number[], p: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
}
const median = (xs: number[]) => pct(xs, 50);
const max = (xs: number[]) => (xs.length ? Math.max(...xs) : NaN);
const f1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '—');
const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—');
const f3 = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '—');
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ pages

async function openBench(browser: Browser, base: string): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  await page.goto(`${base}/?bench`);
  await page.waitForFunction(() => window.__wcBench?.app !== null && window.__wcBench !== undefined);
  // Let the page render its first frames before measuring: Chromium's first
  // frame after load takes ~100+ ms and is not part of any budget.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await pause(300);
  return page;
}

/** rAF delta monitor plus Long Animation Frame / long task observers. */
async function startMonitor(page: Page): Promise<void> {
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

interface MonitorResult {
  deltas: number[];
  loaf: number[];
  longtask: number[];
  loafSupported: boolean;
  ltSupported: boolean;
}

async function stopMonitor(page: Page): Promise<MonitorResult> {
  return page.evaluate(() => {
    const mon = (window as unknown as { __mon: MonitorResult & { run: boolean } }).__mon;
    mon.run = false;
    return { deltas: mon.deltas, loaf: mon.loaf, longtask: mon.longtask, loafSupported: mon.loafSupported, ltSupported: mon.ltSupported };
  });
}

// -------------------------------------------------------------------- map

const MAP_CONTENT = '.wc-pane-map .wc-pane-content';

/** Turns the Map pane on and waits for its first complete frame (arda.mm2, tiles, font). */
async function mapOn(page: Page): Promise<void> {
  await page.evaluate(() => window.__wcBench!.mapOn());
  await page.waitForSelector(`${MAP_CONTENT}[data-map-drawn-ms]`, { state: 'attached', timeout: 60_000 });
}

/** Map on and the GMCP feed running (needs connectFake first). */
async function mapOnWithFeed(page: Page): Promise<void> {
  await mapOn(page);
  await page.evaluate((t) => window.__wcBench!.loadFeed(t), mapFeedText);
  await page.evaluate((ms) => window.__wcBench!.startFeed(ms), MAP_FEED_MS);
  await pause(500);
}

interface MapTail {
  fed: number;
  located: string | null;
  room: string | null;
}

async function mapTail(page: Page): Promise<MapTail> {
  const fed = await page.evaluate(() => window.__wcBench!.stopFeed());
  const c = page.locator(MAP_CONTENT);
  return { fed, located: await c.getAttribute('data-map-located'), room: await c.getAttribute('data-map-room') };
}

/**
 * The map turning on: from the settings change until the first complete
 * frame (arda.mm2, tiles, font) plus 1 s. Chromium: every main-thread task
 * from a DevTools trace (the `longtask` API only reports tasks ≥ 50 ms, the
 * gate is 5 ms). Both: Long Animation Frames where supported and rAF gaps.
 * One in-page evaluate drives it, so no Playwright script runs in between.
 */
async function benchMapLoad(browser: Browser, base: string, trace: boolean) {
  const page = await openBench(browser, base);
  await page.evaluate(() => window.__wcBench!.connectFake());
  await page.waitForSelector('body'); // Playwright's utility script, injected before the trace
  await startMonitor(page);
  if (trace) await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] });
  const [t0, t1] = await page.evaluate(
    (sel) =>
      new Promise<[number, number]>((resolve) => {
        const start = performance.now();
        window.__wcBench!.mapOn();
        const check = (): void => {
          if (document.querySelector<HTMLElement>(sel)?.dataset.mapDrawnMs !== undefined) resolve([start, performance.now()]);
          else requestAnimationFrame(check);
        };
        check();
      }),
    MAP_CONTENT,
  );
  await pause(1000);
  let tasks: number[] | null = null;
  if (trace) {
    type Ev = { name: string; ph: string; ts: number; dur?: number; pid: number; tid: number; args?: { name?: string } };
    const ev = (JSON.parse((await browser.stopTracing()).toString()) as { traceEvents: Ev[] }).traceEvents;
    const main = new Set(ev.filter((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain').map((e) => `${e.pid}:${e.tid}`));
    tasks = ev
      .filter((e) => e.name === 'RunTask' && e.ph === 'X' && main.has(`${e.pid}:${e.tid}`))
      .map((e) => (e.dur ?? 0) / 1000)
      .sort((x, y) => y - x);
  }
  const mon = await stopMonitor(page);
  const c = page.locator(MAP_CONTENT);
  const load = JSON.parse((await c.getAttribute('data-map-load')) ?? '{}') as Record<string, number>;
  const drawnMs = Number(await c.getAttribute('data-map-drawn-ms'));
  await page.close();
  return {
    onToDrawn: t1 - t0,
    workerDrawn: drawnMs,
    load,
    /** Main-thread task durations, longest first (Chromium trace); null elsewhere. */
    tasks,
    loaf: mon.loaf,
    loafSupported: mon.loafSupported,
    maxDelta: max(mon.deltas),
    over50: mon.deltas.filter((d) => d > FRAME_BUDGET_MS).length,
  };
}

// -------------------------------------------------------------- scenarios

async function benchKey(browser: Browser, base: string, map = false) {
  const page = await openBench(browser, base);
  await page.evaluate(() => window.__wcBench!.connectFake());
  if (map) await mapOnWithFeed(page);
  const times: number[] = [];
  for (let i = 0; i < 220; i++) {
    const ms = await page.evaluate(() => window.__wcBench!.keyToSend('look'));
    if (i >= 20) times.push(ms); // first 20 warm the JIT
    if (i % 10 === 0) await pause(5);
  }
  const tail = map ? await mapTail(page) : null;
  await page.close();
  return {
    tail,
    median: median(times),
    p95: pct(times, 95),
    p99: pct(times, 99),
    max: max(times),
    n: times.length,
    failedSends: times.filter((t) => t < 0).length,
  };
}

async function benchScript(browser: Browser, base: string) {
  const page = await openBench(browser, base);
  await page.evaluate(() => window.__wcBench!.connectFake());
  const loaded = await page.evaluate((t) => window.__wcBench!.applyProfile(t), ruleProfile);
  if (!loaded) throw new Error('benchmark profile did not load');
  const alias: number[] = [];
  const macro: number[] = [];
  for (let i = 0; i < 220; i++) {
    const a = await page.evaluate(() => window.__wcBench!.keyToSend('bb'));
    const m = await page.evaluate(() => window.__wcBench!.macroToSend('F5', 'F5'));
    if (i >= 20) {
      alias.push(a);
      macro.push(m);
    }
    if (i % 10 === 0) await pause(5);
  }
  await page.evaluate((t) => {
    (window as unknown as { __benchText: string }).__benchText = t;
  }, logText);
  const rules = await page.evaluate(
    (p) => window.__wcBench!.ruleBench((window as unknown as { __benchText: string }).__benchText, p),
    ruleProfile,
  );
  await page.close();
  const stats = (xs: number[]) => ({ median: median(xs), p99: pct(xs, 99), max: max(xs), failed: xs.filter((x) => x < 0).length });
  return { alias: stats(alias), macro: stats(macro), rules };
}

async function benchFramePaint(browser: Browser, base: string, map = false) {
  const page = await openBench(browser, base);
  await page.evaluate(() => window.__wcBench!.connectFake());
  if (map) await mapOnWithFeed(page);
  const WARM = 10;
  const total = await page.evaluate((t) => window.__wcBench!.loadFrames(t, 1, 400 + 10), logText);
  // Warm-up: the first frames after page load pay for JIT and first layout.
  for (let i = 0; i < WARM; i++) {
    await page.evaluate((k) => window.__wcBench!.inject(k), i);
    await pause(30);
  }
  const n = total - WARM;
  await startMonitor(page);
  const toFlush: number[] = [];
  const toPaint: number[] = [];
  const script: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = await page.evaluate((k) => window.__wcBench!.inject(k), WARM + i);
    toFlush.push(r.toFlush);
    toPaint.push(r.toPaint);
    script.push(r.script);
    await pause(20 + Math.random() * 60);
  }
  const mon = await stopMonitor(page);
  const tail = map ? await mapTail(page) : null;
  await page.close();
  const interval = median(mon.deltas);
  // Flush start relative to receipt: must fall within one frame interval.
  const waits = toFlush.map((t, i) => t - script[i]!);
  const lateIdx = waits.flatMap((w, i) => (w > interval * 1.5 ? [i] : []));
  const late = lateIdx.length;
  // A late frame our own flush caused (script longer than a frame interval).
  const lateOurs = lateIdx.filter((i) => script[i]! > interval).length;
  if (late) console.log(`  late frames: ${lateIdx.map((i) => `#${i} wait ${f1(waits[i]!)} ms script ${f1(script[i]!)} ms`).join(', ')}`);
  return {
    tail,
    frames: n,
    interval,
    toPaintMedian: median(toPaint),
    toPaintP95: pct(toPaint, 95),
    toPaintMax: max(toPaint),
    scriptMedian: median(script),
    scriptMax: max(script),
    late,
    lateOurs,
  };
}

function synthBatch(lines: number, seed: number): string {
  let s = '';
  for (let i = 0; i < lines; i++) {
    const k = seed * lines + i;
    if (i % 10 === 0) s += `\x1b[32mA Room Called Number ${k}\x1b[0m\r\n`;
    else if (i % 7 === 0) s += `\x1b[33mSomeone narrates 'message ${k} with a bit of text to wrap the line'\x1b[0m\r\n`;
    else s += `A line of plain description text, number ${k}, about seventy characters.\r\n`;
  }
  return s;
}

async function benchScrollback(browser: Browser, base: string, map = false) {
  const page = await openBench(browser, base);
  await page.evaluate(() => window.__wcBench!.connectFake());
  if (map) await mapOnWithFeed(page);
  const measure = async (seed0: number) => {
    const script: number[] = [];
    const frame: number[] = [];
    for (let i = 0; i < 40; i++) {
      const r = await page.evaluate((t) => window.__wcBench!.inject(t), synthBatch(50, seed0 + i));
      script.push(r.script);
      frame.push(r.toPaint - (r.toFlush - r.script));
      await pause(10);
    }
    return { script, frame };
  };
  const empty = await measure(0);
  const rowsEmptyEnd = await page.evaluate(() => window.__wcBench!.rows);
  // Fill to the 20 000-row cap (and past it, so trimming is in steady state).
  for (let i = 0; i < 22; i++) {
    await page.evaluate((t) => window.__wcBench!.inject(t), synthBatch(1000, 1000 + i));
  }
  await page.evaluate(() => window.__wcBench!.drained());
  const rowsFull = await page.evaluate(() => window.__wcBench!.rows);
  const full = await measure(5000);
  const tail = map ? await mapTail(page) : null;
  await page.close();
  return {
    tail,
    rowsEmptyEnd,
    rowsFull,
    emptyScript: median(empty.script),
    emptyFrame: median(empty.frame),
    emptyFrameP95: pct(empty.frame, 95),
    fullScript: median(full.script),
    fullFrame: median(full.frame),
    fullFrameP95: pct(full.frame, 95),
  };
}

async function benchBurst(browser: Browser, base: string, map = false, text = map ? burstMapText.text : logText) {
  const page = await openBench(browser, base);
  if (map) await mapOn(page);
  // Hand the 4.7 MB text over first: deserialising the argument blocks the
  // page for ~100 ms, which is the harness, not the app.
  await page.evaluate((t) => {
    (window as unknown as { __benchText: string }).__benchText = t;
  }, text);
  await pause(300);
  await startMonitor(page);
  const r = await page.evaluate(() =>
    window.__wcBench!.replay((window as unknown as { __benchText: string }).__benchText, 0),
  );
  const mon = await stopMonitor(page);
  const rows = await page.evaluate(() => window.__wcBench!.rows);
  const tail: MapTail | null = map
    ? { fed: burstMapText.gmcp, located: await page.locator(MAP_CONTENT).getAttribute('data-map-located'), room: await page.locator(MAP_CONTENT).getAttribute('data-map-room') }
    : null;
  await page.close();
  return {
    tail,
    ms: r.ms,
    lines: r.lines,
    rows,
    linesPerSec: r.lines / (r.ms / 1000),
    mbPerSec: fixture!.size / 1e6 / (r.ms / 1000),
    maxDelta: max(mon.deltas),
    p95Delta: pct(mon.deltas, 95),
    over50: mon.deltas.filter((d) => d > FRAME_BUDGET_MS).length,
    frames: mon.deltas.length,
    loafMax: mon.loafSupported ? max(mon.loaf) : NaN,
    loafSupported: mon.loafSupported,
    longtaskMax: mon.ltSupported ? (mon.longtask.length ? max(mon.longtask) : 0) : NaN,
    ltSupported: mon.ltSupported,
  };
}

// ------------------------------------------------------------------- main

console.log('browser-bench: building…');
await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: 4179, strictPort: true }, logLevel: 'warn' });
const base = (server.resolvedUrls?.local[0] ?? 'http://localhost:4179/').replace(/\/$/, '');
console.log(`browser-bench: ${base}, fixture ${fixture.rel} (${(fixture.size / 1e6).toFixed(2)} MB)`);

/** The WebGL renderer string a page of this browser gets (SwiftShader = software GL). */
async function glRenderer(browser: Browser): Promise<string> {
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

type Row = { browser: string; version: string; gl: string } & {
  key: Awaited<ReturnType<typeof benchKey>>;
  paint: Awaited<ReturnType<typeof benchFramePaint>>;
  scroll: Awaited<ReturnType<typeof benchScrollback>>;
  burst: Awaited<ReturnType<typeof benchBurst>>;
  script: Awaited<ReturnType<typeof benchScript>>;
  map: {
    key: Awaited<ReturnType<typeof benchKey>>;
    paint: Awaited<ReturnType<typeof benchFramePaint>>;
    scroll: Awaited<ReturnType<typeof benchScrollback>>;
    burst: Awaited<ReturnType<typeof benchBurst>>;
    /** The map-on burst log (with the GMCP lines), map off. */
    burstOff: Awaited<ReturnType<typeof benchBurst>>;
    load: Awaited<ReturnType<typeof benchMapLoad>>;
  };
};
const results: Row[] = [];

try {
  // Headless Chromium draws WebGL with SwiftShader (CPU); `chromium-gpu`
  // asks for the real GPU (ANGLE on Vulkan; WC_BENCH_GPU_ARGS overrides the
  // flags, WC_BENCH_GPU=0 skips it). The map's numbers on SwiftShader are
  // reported too, but users do not get WebGL through SwiftShader.
  const gpuArgs = (process.env.WC_BENCH_GPU_ARGS ?? '--enable-gpu --use-angle=vulkan').split(' ').filter(Boolean);
  const configs = [
    ['chromium', chromium, [] as string[]],
    ...(process.env.WC_BENCH_GPU === '0' ? [] : [['chromium-gpu', chromium, gpuArgs] as const]),
    ['firefox', firefox, [] as string[]],
  ] as const;
  for (const [name, type, args] of configs) {
    const browser = await type.launch({ args: [...args] });
    try {
      const gl = await glRenderer(browser);
      console.log(`\n[${name} ${browser.version()}; WebGL: ${gl}]`);
      const key = await benchKey(browser, base);
      console.log(`  key → send: median ${f3(key.median)} ms, p99 ${f3(key.p99)}, max ${f3(key.max)}`);
      const paint = await benchFramePaint(browser, base);
      console.log(
        `  frame → paint: ${paint.frames} frames, painted median ${f1(paint.toPaintMedian)} ms, p95 ${f1(paint.toPaintP95)}, max ${f1(paint.toPaintMax)}; late ${paint.late}`,
      );
      const scroll = await benchScrollback(browser, base);
      console.log(
        `  scrollback: frame median ${f2(scroll.emptyFrame)} ms at ~0 rows vs ${f2(scroll.fullFrame)} ms at ${scroll.rowsFull} rows`,
      );
      const burst = await benchBurst(browser, base);
      console.log(
        `  burst: ${burst.lines} lines in ${f1(burst.ms)} ms (${burst.linesPerSec.toFixed(0)} lines/s), max frame ${f1(burst.maxDelta)} ms, >50 ms: ${burst.over50}, LoAF max ${f1(burst.loafMax)}`,
      );
      const script = await benchScript(browser, base);
      console.log(
        `  script: ${RULE_COUNT} rules ${f2(script.rules.rulesUs)} µs/line (none ${f2(script.rules.baseUs)}); ` +
          `alias Enter p99 ${f3(script.alias.p99)} ms, macro p99 ${f3(script.macro.p99)} ms`,
      );
      console.log('  map on:');
      const mload = await benchMapLoad(browser, base, name.startsWith('chromium'));
      console.log(
        `  map load: on → first complete frame ${f1(mload.onToDrawn)} ms (worker ${mload.workerDrawn} ms, ${JSON.stringify(mload.load)}); ` +
          `main-thread tasks (longest) ${mload.tasks ? JSON.stringify(mload.tasks.slice(0, 5).map((x) => +x.toFixed(1))) : 'n/a'}, ` +
          `LoAF ${mload.loafSupported ? JSON.stringify(mload.loaf.map((x) => Math.round(x))) : 'n/a'}, max frame ${f1(mload.maxDelta)} ms`,
      );
      const mkey = await benchKey(browser, base, true);
      console.log(`  key → send: median ${f3(mkey.median)} ms, p99 ${f3(mkey.p99)}, max ${f3(mkey.max)}; ${JSON.stringify(mkey.tail)}`);
      const mpaint = await benchFramePaint(browser, base, true);
      console.log(
        `  frame → paint: painted median ${f1(mpaint.toPaintMedian)} ms, p95 ${f1(mpaint.toPaintP95)}, max ${f1(mpaint.toPaintMax)}; late ${mpaint.late}; ${JSON.stringify(mpaint.tail)}`,
      );
      const mscroll = await benchScrollback(browser, base, true);
      console.log(
        `  scrollback: frame median ${f2(mscroll.emptyFrame)} ms at ~0 rows vs ${f2(mscroll.fullFrame)} ms at ${mscroll.rowsFull} rows; ${JSON.stringify(mscroll.tail)}`,
      );
      const gburst = await benchBurst(browser, base, false, burstMapText.text);
      console.log(`  burst with the GMCP lines, map off: ${f1(gburst.ms)} ms, max frame ${f1(gburst.maxDelta)} ms, >50 ms: ${gburst.over50}`);
      const mburst = await benchBurst(browser, base, true);
      console.log(
        `  burst: ${mburst.lines} lines in ${f1(mburst.ms)} ms, max frame ${f1(mburst.maxDelta)} ms, >50 ms: ${mburst.over50}, LoAF max ${f1(mburst.loafMax)}; ${JSON.stringify(mburst.tail)}`,
      );
      results.push({
        browser: name,
        version: browser.version(),
        gl,
        key,
        paint,
        scroll,
        burst,
        script,
        map: { key: mkey, paint: mpaint, scroll: mscroll, burst: mburst, burstOff: gburst, load: mload },
      });
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise<void>((r) => server.httpServer.close(() => r()));
}

// ----------------------------------------------------------------- report

const pass = (ok: boolean) => (ok ? '**PASS**' : '**FAIL**');
const gpuArgsText = process.env.WC_BENCH_GPU_ARGS ?? '--enable-gpu --use-angle=vulkan';
const lines: string[] = [];
const now = new Date();
lines.push('# Benchmark results', '');
lines.push(`Generated by \`npm run bench\` on ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC.`, '');
lines.push('## Machine', '');
lines.push(`- CPU: ${os.cpus()[0]?.model ?? '?'} (${os.cpus().length} threads)`);
lines.push(`- Memory: ${(os.totalmem() / 2 ** 30).toFixed(0)} GiB`);
lines.push(`- OS: ${os.type()} ${os.release()} ${os.arch()}`);
lines.push(`- Node: ${process.version}`);
for (const r of results) lines.push(`- ${r.browser}: ${r.version} (headless, Playwright${r.browser === 'chromium-gpu' ? `, \`${gpuArgsText}\`` : ''}); WebGL: ${r.gl}`);
lines.push(`- Build: production bundle via \`vite preview\``);
lines.push(`- Fixture: \`${fixture.rel}\` (${(fixture.size / 1e6).toFixed(2)} MB)`, '');

lines.push('## Budgets (spec §1.3)', '');
lines.push('| Budget | Measure | ' + results.map((r) => r.browser).join(' | ') + ' |');
lines.push('|---|---|' + results.map(() => '---|').join(''));
const row = (budget: string, measure: string, cell: (r: Row) => string) =>
  lines.push(`| ${budget} | ${measure} | ${results.map(cell).join(' | ')} |`);
row('Key → send < 1 ms', 'Enter keydown → `send()`, median / p99 / max (ms); pass on p99', (r) =>
  `${f3(r.key.median)} / ${f3(r.key.p99)} / ${f3(r.key.max)} ${pass(r.key.p99 < KEY_BUDGET_MS && r.key.failedSends === 0)}`,
);
row('Frame → paint: next frame', 'frames that missed the next frame (of them caused by our flush)', (r) =>
  `${r.paint.late} of ${r.paint.frames} (${r.paint.lateOurs}) ${pass(r.paint.late <= r.paint.frames / 100 && r.paint.lateOurs === 0)}`,
);
row('', 'receipt → painted, median / p95 / max (ms)', (r) =>
  `${f1(r.paint.toPaintMedian)} / ${f1(r.paint.toPaintP95)} / ${f1(r.paint.toPaintMax)}`,
);
row('', 'flush script time, median / max (ms); frame interval (ms)', (r) =>
  `${f2(r.paint.scriptMedian)} / ${f2(r.paint.scriptMax)}; ${f1(r.paint.interval)}`,
);
const scrollOk = (r: Row) => r.scroll.fullFrame <= r.scroll.emptyFrame * 1.5 + 0.5;
row('Scrollback 20 000: no slowdown', '50-line flush, frame time median (p95) at ~0 rows → at full (ms)', (r) =>
  `${f2(r.scroll.emptyFrame)} (${f2(r.scroll.emptyFrameP95)}) → ${f2(r.scroll.fullFrame)} (${f2(r.scroll.fullFrameP95)}) ${pass(scrollOk(r))}`,
);
row('', 'flush script time median at ~0 → at full (ms); rows at full', (r) =>
  `${f2(r.scroll.emptyScript)} → ${f2(r.scroll.fullScript)}; ${r.scroll.rowsFull}`,
);
row('Burst: no frame > 50 ms', 'longest rAF gap (ms); gaps > 50 ms', (r) =>
  `${f1(r.burst.maxDelta)}; ${r.burst.over50} of ${r.burst.frames} ${pass(r.burst.over50 === 0)}`,
);
row('', 'longest LoAF / long task (ms)', (r) =>
  `${r.burst.loafSupported ? (Number.isFinite(r.burst.loafMax) ? f1(r.burst.loafMax) : 'none') : 'n/a'} / ${r.burst.ltSupported ? (r.burst.longtaskMax > 0 ? f1(r.burst.longtaskMax) : 'none') : 'n/a'}`,
);
row('', 'drain: lines, total ms, lines/s, MB/s', (r) =>
  `${r.burst.lines}, ${f1(r.burst.ms)}, ${r.burst.linesPerSec.toFixed(0)}, ${f1(r.burst.mbPerSec)}`,
);
row(`${RULE_COUNT} user rules < 0.2 ms per line`, 'display pipeline µs per line with the rules (with none); lines', (r) =>
  `${f2(r.script.rules.rulesUs)} (${f2(r.script.rules.baseUs)}); ${r.script.rules.lines} ${pass(r.script.rules.rulesUs < RULE_BUDGET_US)}`,
);
row('Key → send < 1 ms, script in the path', 'Enter on alias `bb`, median / p99 / max (ms)', (r) =>
  `${f3(r.script.alias.median)} / ${f3(r.script.alias.p99)} / ${f3(r.script.alias.max)} ${pass(r.script.alias.p99 < KEY_BUDGET_MS && r.script.alias.failed === 0)}`,
);
row('', 'F5 macro → alias → send, median / p99 / max (ms)', (r) =>
  `${f3(r.script.macro.median)} / ${f3(r.script.macro.p99)} / ${f3(r.script.macro.max)} ${pass(r.script.macro.p99 < KEY_BUDGET_MS && r.script.macro.failed === 0)}`,
);
lines.push('');

// Map off vs on (stage 9, ADR 0020 "Performance gates").
lines.push('## Map pane off vs on (stage 9)', '');
lines.push(
  `Map on: arda.mm2 loaded in the Map pane (floating, 50 % × 35 % of the window) and ${mapGmcp.length} GMCP lines of \`tests/fixtures/map-demo.log\` fed every ${MAP_FEED_MS} ms, looping; the burst log has one of them after every ${MAP_EVERY} lines (${burstMapText.gmcp} in all). "Off" is the table above, except for the burst, where "off" replays the same log with the GMCP lines.`,
  '',
);
const heads = results.flatMap((r) => [`${r.browser} off`, `${r.browser} on`]);
lines.push('| Budget | Measure | ' + heads.join(' | ') + ' |');
lines.push('|---|---|' + heads.map(() => '---|').join(''));
type Side = Pick<Row, 'key' | 'paint' | 'scroll' | 'burst'>;
const mrow = (budget: string, measure: string, cell: (x: Side) => string) =>
  lines.push(`| ${budget} | ${measure} | ${results.flatMap((r) => [cell(r), cell(r.map)]).join(' | ')} |`);
// Burst: "off" replays the same log as "on" (with the GMCP lines), so only the map differs.
const brow = (budget: string, measure: string, cell: (b: Row['burst']) => string) =>
  lines.push(`| ${budget} | ${measure} | ${results.flatMap((r) => [cell(r.map.burstOff), cell(r.map.burst)]).join(' | ')} |`);
mrow('Key → send < 1 ms', 'median / p99 / max (ms)', (x) =>
  `${f3(x.key.median)} / ${f3(x.key.p99)} / ${f3(x.key.max)} ${pass(x.key.p99 < KEY_BUDGET_MS && x.key.failedSends === 0)}`,
);
mrow('Frame → paint', 'late frames (ours); painted median / p95 / max (ms)', (x) =>
  `${x.paint.late} (${x.paint.lateOurs}); ${f1(x.paint.toPaintMedian)} / ${f1(x.paint.toPaintP95)} / ${f1(x.paint.toPaintMax)} ${pass(x.paint.late <= x.paint.frames / 100 && x.paint.lateOurs === 0)}`,
);
mrow('', 'flush script median / max (ms)', (x) => `${f2(x.paint.scriptMedian)} / ${f2(x.paint.scriptMax)}`);
mrow('Scrollback 20 000', 'frame median at ~0 → full (ms)', (x) =>
  `${f2(x.scroll.emptyFrame)} → ${f2(x.scroll.fullFrame)} ${pass(x.scroll.fullFrame <= x.scroll.emptyFrame * 1.5 + 0.5)}`,
);
brow('Burst: no frame > 50 ms', 'burst log + GMCP lines: longest rAF gap (ms); gaps > 50 ms', (b) =>
  `${f1(b.maxDelta)}; ${b.over50} of ${b.frames} ${pass(b.over50 === 0)}`,
);
brow('', 'p95 rAF gap (ms); longest LoAF (ms)', (b) => `${f1(b.p95Delta)}; ${b.loafSupported ? f1(b.loafMax) : 'n/a'}`);
brow('', 'drain total ms, lines/s', (b) => `${f1(b.ms)}, ${b.linesPerSec.toFixed(0)}`);
lines.push('');
lines.push('| Map on | Measure | ' + results.map((r) => r.browser).join(' | ') + ' |');
lines.push('|---|---|' + results.map(() => '---|').join(''));
row('Tracking', 'feed frames delivered in key / paint / scroll; map located at the end', (r) =>
  `${r.map.key.tail?.fed} / ${r.map.paint.tail?.fed} / ${r.map.scroll.tail?.fed}; ${[r.map.key, r.map.paint, r.map.scroll, r.map.burst].every((x) => x.tail?.located === '1') ? 'yes' : 'no'}`,
);
row('Map load', 'turn on → first frame with tiles and font, main thread (ms)', (r) => f1(r.map.load.onToDrawn));
row('', 'worker: load start → that frame (ms); stages fetch / inflate / parse+indexes / hash / meshes+upload (ms)', (r) => {
  const l = r.map.load.load;
  return `${r.map.load.workerDrawn}; ${l.fetch} / ${l.inflate} / ${l.parse} / ${l.hash} / ${l.meshes}`;
});
row('No main-thread task > 5 ms from the map', 'longest main-thread tasks, turn-on → 1 s after that frame (ms; Chromium trace)', (r) =>
  r.map.load.tasks ? `${r.map.load.tasks.slice(0, 3).map((x) => f1(x)).join(', ')} ${pass((r.map.load.tasks[0] ?? 0) <= 5)}` : 'n/a',
);
row('', 'LoAF durations (ms); longest rAF gap (ms)', (r) =>
  `${r.map.load.loafSupported ? (r.map.load.loaf.length ? r.map.load.loaf.map((x) => f1(x)).join(', ') : 'none') : 'n/a'}; ${f1(r.map.load.maxDelta)}`,
);
lines.push('');
lines.push('## Method', '');
lines.push(
  '- **Key → send:** `?bench` probe sets the input to `look`, dispatches a synthetic Enter `keydown` on it and reads the time `Socketish.send` was called on a fake socket. 200 samples after 20 warm-up runs. Pass is judged on p99, so a single GC pause does not decide it; the max is reported.',
  '- **Frame → paint:** 400 telnet frames of the fixture (as the replay socket groups them at speed 1), after 10 warm-up frames, are fed through the fake socket at random 20–80 ms intervals. "Painted" is a MessageChannel message posted from the output pane\'s frame callback, which runs after that frame\'s rendering. A frame is late when its flush started more than 1.5 frame intervals after receipt, i.e. it missed the next frame (vsync jitter of a few ms is not a missed frame). Pass: at most 1 % of frames late and none because our flush script ran longer than a frame; a headless browser occasionally skips a frame on its own (GC, compositor), and the count is reported as measured.',
  '- **Scrollback:** 40 flushes of 50 synthetic lines (some coloured) on an empty pane, then 22 000 more lines, then 40 more flushes with the pane at its 20 000-row cap (a 200-row chunk is dropped from the top every fourth flush). Frame time = frame callback start → after rendering. Pass: median at full ≤ 1.5 × median at empty + 0.5 ms.',
  `- **${RULE_COUNT} user rules:** \`bench/rules.ts\` builds a seeded profile from the fixture's words: 250 actions (anchored and unanchored, %N captures, bodies that set a variable), 125 substitutes (colour codes around %0) and 125 highlights. In the page, the fixture's lines are assembled once, then run through a separate ScriptEngine's \`processLine\` (actions, substitutes, gags, highlights, \`text.display\`); median of 5 passes after a warm-up, divided by the line count. \`node bench/script-bench.ts\` prints the same measure for Node.`,
  '- **Key → send with script:** the same profile is applied to the app. `bb` + Enter runs the alias `bb` → `bash $target`; F5 runs the macro `bb` → the alias. Timed like Key → send, 200 samples each.',
  `- **Map on (stage 9):** the same key → send, frame → paint, scrollback and burst runs with the Map pane turned on first (Settings \`panes.map.on\`, waiting for the worker's first frame with every tile and the font). While key, paint and scrollback run, the ${mapGmcp.length} GMCP lines of \`tests/fixtures/map-demo.log\` (Room.Info, Event.Moved, Group.*, Char.*) go through the fake socket one frame every ${MAP_FEED_MS} ms, looping, so the map re-centres and redraws all the time; the burst log has one of them after every ${MAP_EVERY} lines. "Located" checks the map found the player at the end. **Map load:** one in-page evaluate turns the map on and waits for the first complete frame (arda.mm2 fetched, inflated, parsed and indexed, meshes built and uploaded, tiles and font loaded); Chromium records a DevTools trace of every main-thread task (\`RunTask\` on CrRendererMain) from the settings change until 1 s after that frame, since the \`longtask\` API only reports tasks ≥ 50 ms and the ADR 0020 gate is 5 ms. The worker's stage times come from its \`loaded\` message.`,
  '- **Burst:** the whole fixture replayed at speed 0 (16 KB frames, delivered in slices of at most 8 ms, then the replay waits for the next animation frame) through the real Session, telnet parser, line assembler and output pane. rAF gaps are measured for the whole replay until the output has drained; Chromium also reports Long Animation Frames.',
  '',
);
lines.push('## Fixes made because of this benchmark (stage 1)', '');
lines.push(
  '- **Scrollback slowdown (Chromium).** With 20 000 flat rows trimmed row by row on every flush, a 50-line flush took 3.8 ms per frame on an empty pane and 21.3 ms at 20 000 rows (Firefox: 4.3 → 9.8 ms). Rows now live in contained chunks of 200 rows (at full: ~5 ms, still trimmed row by row), and old rows are dropped a whole chunk at a time (at full: within noise of an empty pane). The pane keeps at least 20 000 rows and fewer than 20 000 + one chunk.',
  '- **Burst replay scheduling.** The replay socket delivered 16 KB frames as an unbroken chain of message tasks at speed 0. It now delivers for at most 8 ms and waits for the next animation frame: Firefox\'s longest frame went from ~35 ms to ~20 ms; Chromium stayed at ~19 ms.',
  '- **Harness artefacts found on the way (not app changes):** Chromium\'s first frame after load (~120 ms) and handing a 4.7 MB string to the page (~120 ms) showed up as long frames until the benchmark waited for the first frames and transferred the text before measuring.',
  '',
);
lines.push('## Stage 2 notes', '');
lines.push(
  '- **Package A (theme, web fonts, cell grid, custom caret), 2026-09-27.** Burst drain times and longest frames were ~2× the stage-1 figures on this day, but the stage-1 commit (c815295) run back to back on the same machine measured the same (Chromium: 1152 ms drain, 46.4 ms longest frame; Firefox: 1097 ms, 37.0 ms), so the difference is the machine\'s state, not the change. Scrollback medians are noisy run to run (one of four runs missed the Chromium ratio at 3.30 → 6.53 ms; the others passed, as does the stage-1 commit).',
  '',
);
lines.push('## Stage 3 notes', '');
lines.push(
  '- **P2 (script engine), 2026-09-27.** The output pane now shows `text.display` copies from the engine; with no rules a line passes through untouched (the same object). The burst, paint and scrollback rows include that step. Rules are pre-filtered with an `indexOf` on the longest literal of each pattern, so a rule that cannot match costs one string search.',
  '',
);
lines.push('## Stage 9 notes', '');
lines.push(
  '- **P4 (map), 2026-09-28.** Headless Chromium draws WebGL with SwiftShader (CPU). There, with the map on, a few map frames take ~0.4–0.7 s in the GPU process (a single WebGL flush; most likely SwiftShader compiling a pipeline the first time a draw state is used, since they are rare and early); the worker waits in its canvas readback (`ReadPixels`, software compositing) and the page\'s own frames wait on the same GPU thread, which shows as rare 0.2–0.6 s frame gaps and late paints in the `chromium` column although the main thread is idle (flush script time stays below 1 ms). With the real GPU (`chromium-gpu`) and in Firefox there are none. Chrome no longer offers WebGL through SwiftShader by default, so users either have a GPU or get the map\'s "not supported" notice; the `chromium` map-on column is kept for comparison with earlier runs, and `chromium-gpu` is the one to judge the map by.',
  '',
);
mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
writeFileSync(new URL('./results/latest.md', import.meta.url), lines.join('\n'));
console.log('\nbrowser-bench: wrote bench/results/latest.md');
