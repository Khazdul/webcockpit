// Browser benchmark for the spec §1.3 budgets and the performance review's
// pass criteria (notes/research/performance-review.md §7, report #15).
//
//   node bench/browser-bench.ts [flags]     (part of `npm run bench`;
//                                            `npm run bench -- --quick` passes flags here)
//
// Builds the app, serves it with `vite preview` (the production bundle),
// and drives it with Playwright through the `?bench` probe
// (src/app/bench-hook.ts). Primary geometry: the owner's window, 1728 ×
// 1000 CSS px at device pixel ratio 2, Firefox first (ratio 2 through the
// `layout.css.devPixelsPerPx` pref), then Chromium on the real GPU
// (`--enable-gpu --use-angle=vulkan`). Every run sets the Map pane
// explicitly (`panes.map.on`).
//
// Budgets (spec §1.3), map off and map on, interleaved:
// - key → send:     synthetic Enter keydown → Socketish.send (< 1 ms)
// - frame → paint:  fixture frames injected at random 20–80 ms intervals;
//                   rendered in the next animation frame
// - scrollback:     flush cost with 0 vs 20 000 rows present (no slowdown)
// - burst:          the biggest fixture replayed at max speed; no frame
//                   longer than 50 ms (map on: GMCP moves interleaved)
// - script:         500 user rules through the display pipeline (< 0.2 ms
//                   per line); key → send with an alias and a macro
// - map load:       main-thread tasks while the map turns on (ADR 0020)
// Owner-geometry checks (bench/owner.ts, bench/input-load.ts, bench/soak.ts):
// - caret:          visible blinking caret, isolated lines 150–450 ms apart:
//                   median receipt → rendered ≤ 4 ms; idle ≤ 5 frames/s
// - play:           GMCP play log (playing, all panes): text frames with and
//                   without a pane render
// - colour:         MUME's 24-bit / 256-colour pages: page frame, next 20
// - scroll:         at 20 000 rows: trim frames, scroll mode, width change,
//                   dock drag start / drop
// - rules:          500 rules through the whole ingest path (< 0.2 ms/line)
// - keys:           real key presses under three loads (colour page, burst,
//                   play with GMCP): input delay, key → send, letter → rendered
// - ws:             loopback WebSocket, live-like recording session, paced
//                   by page acknowledgements: key → wire, longest tasks
// - soak:           30× playback with all panes: counters flat, frames
//                   within 1.2× + 1 ms
//
// Flags (or environment variables):
//   --quick            WC_BENCH_QUICK=1   ~¼ of the samples (a smoke run)
//   --browsers a,b     WC_BENCH_BROWSERS  default firefox,chromium
//   --only a,b         WC_BENCH_ONLY      sections: budgets, map, script,
//                                         caret, play, colour, scroll, rules,
//                                         keys, ws, soak (default all)
//   --legacy           WC_BENCH_LEGACY=1  also the stage 1–9 set (budgets and
//                                         map) at 1280 × 720, ratio 1, in
//                                         chromium (SwiftShader),
//                                         chromium-gpu and firefox
//   --soak-long        WC_BENCH_SOAK_LONG=1  the long soak: the owner's three
//                                         biggest logs, each to its end, 30×
//   --soak-s N         WC_BENCH_SOAK_S    short soak length (s, default 60)
//   --port N           WC_BENCH_PORT      preview port (default 4179; the
//                                         WebSocket server uses N + 1)
//   --out file         WC_BENCH_OUT       report path (default
//                                         bench/results/latest.md)
//   WC_BENCH_GPU=0 runs Chromium without the GPU flags; WC_BENCH_GPU_ARGS
//   overrides them.
//
// Default runtime ≈ 15 min on a quiet machine (two browsers); --quick ≈ 5.
// Fixtures: the owner's Cockpit logs under $WEBCOCKPIT_FIXTURES (default
// /home/ole/MUME/data/runs); without them the biggest log in tests/fixtures.
// Writes the report (bench/results/latest.md).

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
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

const { listFixtures, FIXTURES_ROOT } = await import('../tests/e2e/fixtures');
const { makeRuleProfile, RULE_COUNT } = await import('./rules');
const L = await import('./lib');
const O = await import('./owner');
const I = await import('./input-load');
const S = await import('./soak');
const { synthBatch } = await import('./feeds');
const { build, preview } = await import('vite');
type Target = import('./lib').Target;
type TargetName = import('./lib').TargetName;
type Geometry = import('./lib').Geometry;
type Page = import('@playwright/test').Page;
const { pct, median, max, f1, f2, f3, fd, pass, pause, loadavg, openBench, closePage, mapSetting, startMonitor, stopMonitor } = L;

// ---------------------------------------------------------------- options

const argv = process.argv.slice(2);
const flag = (name: string, env: string) => argv.includes(`--${name}`) || process.env[env] === '1';
const opt = (name: string, env: string, def: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : (process.env[env] ?? def);
};
const QUICK = flag('quick', 'WC_BENCH_QUICK');
const LEGACY_RUN = flag('legacy', 'WC_BENCH_LEGACY');
const SOAK_LONG = flag('soak-long', 'WC_BENCH_SOAK_LONG');
const SOAK_S = Number(opt('soak-s', 'WC_BENCH_SOAK_S', QUICK ? '15' : '60'));
const PORT = Number(opt('port', 'WC_BENCH_PORT', '4179'));
const OUT = opt('out', 'WC_BENCH_OUT', new URL('./results/latest.md', import.meta.url).pathname);
const GPU = process.env.WC_BENCH_GPU !== '0';
const BROWSERS = opt('browsers', 'WC_BENCH_BROWSERS', 'firefox,chromium')
  .split(',')
  .map((b) => (b === 'chromium' && GPU ? 'chromium-gpu' : b) as TargetName);
const ONLY = new Set(opt('only', 'WC_BENCH_ONLY', '').split(',').filter(Boolean));
const want = (s: string) => ONLY.size === 0 || ONLY.has(s);
const SCALE = QUICK ? 0.25 : 1;
const scaled = (n: number, min = 20) => Math.max(min, Math.round(n * SCALE));
const flagsText = argv.length ? argv.join(' ') : '(none)';

const FRAME_BUDGET_MS = 50;
const KEY_BUDGET_MS = 1;
const RULE_BUDGET_US = 200;
const CARET_BUDGET_MS = 4;
const IDLE_BUDGET_PER_S = 5;

// ---------------------------------------------------------------- fixture

interface Fix {
  rel: string;
  path: string;
  size: number;
}
/** The tests/fixtures logs, biggest last (the fallback without the owner's logs). */
function repoFixtures(): Fix[] {
  const dir = new URL('../tests/fixtures/', import.meta.url).pathname;
  return readdirSync(dir)
    .filter((n) => n.endsWith('.log'))
    .map((n) => ({ rel: `tests/fixtures/${n}`, path: dir + n, size: statSync(dir + n).size }))
    .sort((a, b) => a.size - b.size);
}
const ownerLogs = listFixtures();
const fixture: Fix = ownerLogs.at(-1) ?? repoFixtures().at(-1)!;
const fixtureNote = ownerLogs.length ? '' : ` (no logs under ${FIXTURES_ROOT}; tests/fixtures fallback)`;
const logText = readFileSync(fixture.path, 'utf8');
const ruleProfile = makeRuleProfile(logText.split('\n').map((l) => l.slice(l.indexOf(' ') + 1).replace(/\x1b\[[0-9;]*m/g, '')));
const soakLogs = (SOAK_LONG ? (ownerLogs.length ? ownerLogs.slice(-3) : repoFixtures().slice(-3)).reverse() : [fixture]).map((f) => ({
  name: f.rel,
  text: f.path === fixture.path ? logText : readFileSync(f.path, 'utf8'),
}));

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

// ------------------------------------------------------------------- map

const MAP_CONTENT = '.wc-pane-map .wc-pane-content';

/** Opens the page with the Map pane explicitly off or on (then waits for its first complete frame). */
async function open(t: Target, map: boolean): Promise<Page> {
  const page = await openBench(t, base, { settings: mapSetting(map) });
  if (map) await O.waitMap(page);
  return page;
}

/** The GMCP feed running (needs connectFake first). */
async function startMapFeed(page: Page): Promise<void> {
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
async function benchMapLoad(t: Target) {
  const page = await open(t, false);
  await page.evaluate(() => window.__wcBench!.connectFake());
  await page.waitForSelector('body'); // Playwright's utility script, injected before the trace
  await startMonitor(page);
  const trace = t.isChromium;
  if (trace) await t.browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] });
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
    const ev = (JSON.parse((await t.browser.stopTracing()).toString()) as { traceEvents: Ev[] }).traceEvents;
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
  await closePage(page);
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

async function benchKey(t: Target, map: boolean) {
  const page = await open(t, map);
  await page.evaluate(() => window.__wcBench!.connectFake());
  if (map) await startMapFeed(page);
  const times: number[] = [];
  const total = scaled(220, 60);
  for (let i = 0; i < total; i++) {
    const ms = await page.evaluate(() => window.__wcBench!.keyToSend('look'));
    if (i >= 20) times.push(ms); // first 20 warm the JIT
    if (i % 10 === 0) await pause(5);
  }
  const tail = map ? await mapTail(page) : null;
  await closePage(page);
  return {
    tail,
    median: median(times),
    p95: pct(times, 95),
    p99: pct(times, 99),
    max: max(times),
    n: times.length,
    failedSends: times.filter((x) => x < 0).length,
  };
}

async function benchScript(t: Target) {
  const page = await open(t, false);
  await page.evaluate(() => window.__wcBench!.connectFake());
  const loaded = await page.evaluate((p) => window.__wcBench!.applyProfile(p), ruleProfile);
  if (!loaded) throw new Error('benchmark profile did not load');
  const alias: number[] = [];
  const macro: number[] = [];
  const total = scaled(220, 60);
  for (let i = 0; i < total; i++) {
    const a = await page.evaluate(() => window.__wcBench!.keyToSend('bb'));
    const m = await page.evaluate(() => window.__wcBench!.macroToSend('F5', 'F5'));
    if (i >= 20) {
      alias.push(a);
      macro.push(m);
    }
    if (i % 10 === 0) await pause(5);
  }
  await page.evaluate((text) => {
    (window as unknown as { __benchText: string }).__benchText = text;
  }, logText);
  const rules = await page.evaluate((p) => window.__wcBench!.ruleBench((window as unknown as { __benchText: string }).__benchText, p), ruleProfile);
  await closePage(page);
  const stats = (xs: number[]) => ({ median: median(xs), p99: pct(xs, 99), max: max(xs), failed: xs.filter((x) => x < 0).length });
  return { alias: stats(alias), macro: stats(macro), rules };
}

async function benchFramePaint(t: Target, map: boolean) {
  const page = await open(t, map);
  await page.evaluate(() => window.__wcBench!.connectFake());
  if (map) await startMapFeed(page);
  const WARM = 10;
  const total = await page.evaluate(([text, k]) => window.__wcBench!.loadFrames(text!, 1, k!), [logText, scaled(400, 80) + WARM] as const);
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
  await closePage(page);
  const interval = median(mon.deltas);
  // Flush start relative to receipt: must fall within one frame interval.
  const waits = toFlush.map((x, i) => x - script[i]!);
  const lateIdx = waits.flatMap((w, i) => (w > interval * 1.5 ? [i] : []));
  // A late frame our own flush caused (script longer than a frame interval).
  const lateOurs = lateIdx.filter((i) => script[i]! > interval).length;
  if (lateIdx.length) console.log(`    late frames: ${lateIdx.map((i) => `#${i} wait ${f1(waits[i]!)} ms script ${f1(script[i]!)} ms`).join(', ')}`);
  return {
    tail,
    frames: n,
    interval,
    toPaintMedian: median(toPaint),
    toPaintP95: pct(toPaint, 95),
    toPaintMax: max(toPaint),
    scriptMedian: median(script),
    scriptMax: max(script),
    late: lateIdx.length,
    lateOurs,
  };
}

async function benchScrollback(t: Target, map: boolean) {
  const page = await open(t, map);
  await page.evaluate(() => window.__wcBench!.connectFake());
  if (map) await startMapFeed(page);
  const measure = async (seed0: number) => {
    const script: number[] = [];
    const frame: number[] = [];
    for (let i = 0; i < 40; i++) {
      const r = await page.evaluate((s) => window.__wcBench!.inject(s), synthBatch(50, seed0 + i));
      script.push(r.script);
      frame.push(r.toPaint - (r.toFlush - r.script));
      await pause(10);
    }
    return { script, frame };
  };
  const empty = await measure(0);
  const rowsEmptyEnd = await page.evaluate(() => window.__wcBench!.rows);
  // Fill to the 20 000-row cap (and past it, so trimming is in steady state).
  for (let i = 0; i < 22; i++) await page.evaluate((s) => window.__wcBench!.inject(s), synthBatch(1000, 1000 + i));
  await page.evaluate(() => window.__wcBench!.drained());
  const rowsFull = await page.evaluate(() => window.__wcBench!.rows);
  const full = await measure(5000);
  const tail = map ? await mapTail(page) : null;
  await closePage(page);
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

async function benchBurst(t: Target, map: boolean, text: string) {
  const page = await open(t, map);
  // Hand the 4.7 MB text over first: deserialising the argument blocks the
  // page for ~100 ms, which is the harness, not the app.
  await page.evaluate((s) => {
    (window as unknown as { __benchText: string }).__benchText = s;
  }, text);
  await pause(300);
  await startMonitor(page);
  const r = await page.evaluate(() => window.__wcBench!.replay((window as unknown as { __benchText: string }).__benchText, 0));
  const mon = await stopMonitor(page);
  const rows = await page.evaluate(() => window.__wcBench!.rows);
  const tail: MapTail | null = map
    ? { fed: burstMapText.gmcp, located: await page.locator(MAP_CONTENT).getAttribute('data-map-located'), room: await page.locator(MAP_CONTENT).getAttribute('data-map-room') }
    : null;
  await closePage(page);
  return {
    tail,
    ms: r.ms,
    lines: r.lines,
    rows,
    linesPerSec: r.lines / (r.ms / 1000),
    mbPerSec: fixture.size / 1e6 / (r.ms / 1000),
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
const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'warn' });
const base = (server.resolvedUrls?.local[0] ?? `http://localhost:${PORT}/`).replace(/\/$/, '');
const loadStart = loadavg();
console.log(`browser-bench: ${base}, fixture ${fixture.rel} (${(fixture.size / 1e6).toFixed(2)} MB)${fixtureNote}; load average ${loadStart}; flags ${flagsText}`);
const ctx: import('./owner').Ctx = { base, scale: SCALE, logText, ruleProfile };
const startedAt = Date.now();

type Key = Awaited<ReturnType<typeof benchKey>>;
type Paint = Awaited<ReturnType<typeof benchFramePaint>>;
type Scroll = Awaited<ReturnType<typeof benchScrollback>>;
type Burst = Awaited<ReturnType<typeof benchBurst>>;
interface Row {
  browser: string;
  version: string;
  gl: string;
  geometry: Geometry;
  load: string;
  key?: Key;
  paint?: Paint;
  scroll?: Scroll;
  burst?: Burst;
  script?: Awaited<ReturnType<typeof benchScript>>;
  map?: { key?: Key; paint?: Paint; scroll?: Scroll; burst?: Burst; burstOff?: Burst; load?: Awaited<ReturnType<typeof benchMapLoad>> };
  caret?: import('./owner').CaretResult;
  play?: import('./owner').PlayResult;
  colour?: import('./owner').ColourResult;
  scrollActions?: import('./owner').ScrollActionsResult;
  rulesIngest?: import('./owner').RulesIngestResult;
  keys?: Partial<Record<import('./input-load').KeyLoad, import('./input-load').KeysLoadResult>>;
  ws?: Partial<Record<import('./input-load').WsLoad, import('./input-load').WsResult>>;
  soak?: import('./soak').SoakResult;
}
const results: Row[] = [];
const legacy: Row[] = [];

/** Runs `fn` with a log line (and the load average) around it. */
async function step<T>(label: string, fn: () => Promise<T>, show: (r: T) => string): Promise<T> {
  const la = loadavg();
  const t0 = Date.now();
  const r = await fn();
  console.log(`  ${label} [${((Date.now() - t0) / 1000).toFixed(0)} s, load ${la}]: ${show(r)}`);
  return r;
}

/** The budgets with the map off and on, interleaved (off/on, on/off, …). */
async function budgetsAndMap(t: Target, row: Row, withMap: boolean): Promise<void> {
  const keyShow = (k: Key) => `median ${f3(k.median)} ms, p99 ${f3(k.p99)}, max ${f3(k.max)}${k.tail ? `; ${JSON.stringify(k.tail)}` : ''}`;
  const paintShow = (p: Paint) => `${p.frames} frames, painted median ${f1(p.toPaintMedian)} ms, p95 ${f1(p.toPaintP95)}, max ${f1(p.toPaintMax)}; late ${p.late}`;
  const scrollShow = (s: Scroll) => `frame median ${f2(s.emptyFrame)} ms at ~0 rows vs ${f2(s.fullFrame)} ms at ${s.rowsFull} rows`;
  const burstShow = (b: Burst) => `${b.lines} lines in ${f1(b.ms)} ms (${b.linesPerSec.toFixed(0)} lines/s), max frame ${f1(b.maxDelta)} ms, >50 ms: ${b.over50}, LoAF max ${f1(b.loafMax)}`;
  const m: NonNullable<Row['map']> = (row.map = {});
  const pair = async <T>(name: string, off: () => Promise<T>, on: () => Promise<T>, show: (r: T) => string, flip: boolean): Promise<[T, T | undefined]> => {
    if (!withMap) return [await step(`${name} (map off)`, off, show), undefined];
    if (flip) {
      const b = await step(`${name} (map on)`, on, show);
      return [await step(`${name} (map off)`, off, show), b];
    }
    const a = await step(`${name} (map off)`, off, show);
    return [a, await step(`${name} (map on)`, on, show)];
  };
  [row.key, m.key] = await pair('key → send', () => benchKey(t, false), () => benchKey(t, true), keyShow, false);
  [row.paint, m.paint] = await pair('frame → paint', () => benchFramePaint(t, false), () => benchFramePaint(t, true), paintShow, true);
  [row.scroll, m.scroll] = await pair('scrollback', () => benchScrollback(t, false), () => benchScrollback(t, true), scrollShow, false);
  row.burst = await step('burst (map off)', () => benchBurst(t, false, logText), burstShow);
  if (withMap) {
    [m.burstOff, m.burst] = await pair('burst + GMCP lines', () => benchBurst(t, false, burstMapText.text), () => benchBurst(t, true, burstMapText.text), burstShow, true);
    m.load = await step(
      'map load',
      () => benchMapLoad(t),
      (l) =>
        `on → first complete frame ${f1(l.onToDrawn)} ms (worker ${l.workerDrawn} ms); main-thread tasks (longest) ${l.tasks ? JSON.stringify(l.tasks.slice(0, 5).map((x) => +x.toFixed(1))) : 'n/a'}, max frame ${f1(l.maxDelta)} ms`,
    );
  }
}

let ws: import('./input-load').WsBench | null = null;
try {
  for (const name of BROWSERS) {
    const t = await L.launchTarget(name, L.OWNER);
    try {
      const gl = await L.glRenderer(t.browser);
      const row: Row = { browser: name, version: t.browser.version(), gl, geometry: L.OWNER, load: loadavg() };
      results.push(row);
      console.log(`\n[${name} ${row.version}; ${L.geometryText(L.OWNER)}; WebGL: ${gl}; load ${row.load}]`);
      if (want('budgets')) await budgetsAndMap(t, row, want('map'));
      else if (want('map')) row.map = { load: await benchMapLoad(t) };
      if (want('script'))
        row.script = await step('script', () => benchScript(t), (s) => `${RULE_COUNT} rules ${f2(s.rules.rulesUs)} µs/line (none ${f2(s.rules.baseUs)}); alias p99 ${f3(s.alias.p99)} ms, macro p99 ${f3(s.macro.p99)} ms`);
      if (want('caret'))
        row.caret = await step('caret', () => O.benchCaret(t, ctx), (c) => `${c.lines} lines, receipt → rendered ${fd(c.toPaint)} ms; blink ${f1(c.blinkPerS)}/s; idle ${f1(c.idleFramesPerS)} frames/s (rAF ${f1(c.idleRafPerS)}, caret ${f1(c.idleTogglesPerS)})${c.trace ? `; trace commit ${f1(c.trace.commit)}/s, BeginFrame ${f1(c.trace.begin)}/s` : ''}; ${c.state}`);
      if (want('play'))
        row.play = await step('play', () => O.benchPlay(t, ctx), (p) => `${p.state}; frames O ${fd(p.O)} (n ${p.O.n}), O+P ${fd(p.OP)} (n ${p.OP.n}), P ${fd(p.P)} (n ${p.P.n}); panes/s ${JSON.stringify(Object.fromEntries(Object.entries(p.panesPerS).map(([k, v]) => [k, +v.toFixed(1)])))}`);
      if (want('colour'))
        row.colour = await step('colour', () => O.benchColour(t, ctx), (c) => `24-bit page ${fd(c.c24.pageFrame)} ms, next 20 ${fd(c.c24.next)}; 256 page ${fd(c.c256.pageFrame)}, next 20 ${fd(c.c256.next)}`);
      if (want('scroll'))
        row.scrollActions = await step('scroll actions', () => O.benchScrollActions(t, ctx), (s) => `rows ${s.rows}; normal ${fd(s.normal)}, trim ${fd(s.trim)} (n ${s.trim.n}); enter ${fd(s.enter)}, leave ${fd(s.leave)}; width ${fd(s.widthFrame)}; drag down ${fd(s.dragDown)}, up ${fd(s.dragUp)}`);
      if (want('rules'))
        row.rulesIngest = await step('rules ingest', () => O.benchRulesIngest(t, ctx), (r) => `${r.lines} lines; ${f2(r.rulesUs)} µs/line with rules (none ${f2(r.noneUs)}); wall ${f1(r.rulesWall)} / ${f1(r.noneWall)} ms; ${r.state}, ${r.recorder}`);
      if (want('keys')) {
        row.keys = {};
        for (const load of ['colour', 'burst', 'play'] as const)
          row.keys[load] = await step(`keys / ${load}`, () => I.benchKeysLoad(t, ctx, load), (k) => `${k.keys} keys; input delay ${fd(k.inputDelay)}; ET ≥16 ms ${k.etEntries}; key → send ${fd(k.keyToSend)}; letter → rendered ${fd(k.letterToRendered)}; ${k.state}`);
      }
      if (want('ws')) {
        ws ??= await I.startWsBench(PORT + 1, ctx);
        row.ws = {};
        for (const load of ['burst', 'play'] as const)
          row.ws[load] = await step(`ws / ${load}`, () => ws!.run(t, ctx, load), (w) => `${w.keys} keys; key → wire ${fd(w.keyToWire)}; ws task max ${f1(w.wsTaskMax)}; rAF max ${f1(w.rafMax)}; ${w.tasks ? `tasks ${w.tasks.slice(0, 3).map((x) => `${f1(x.ms)} [${x.label}]`).join('; ')}` : ''}; ${w.state}, ${w.recorder}; bursts ${w.bursts}`);
      }
      if (want('soak'))
        row.soak = await step(`soak (${SOAK_LONG ? 'long' : `${SOAK_S} s`})`, () => S.benchSoak(t, ctx, soakLogs, SOAK_LONG, SOAK_S), (s) => `${s.delivered} frames, ${s.typed} commands in ${f1(s.wallS)} s; ${s.checkpoints.map((c) => `${c.label}: ${c.elements} el, frame ${f2(c.frame.median)}`).join(' → ')}; ${JSON.stringify(S.soakPass(s))}`);
    } finally {
      await t.browser.close();
    }
  }
  if (LEGACY_RUN) {
    const names: TargetName[] = ['chromium', ...(GPU ? (['chromium-gpu'] as const) : []), 'firefox'];
    for (const name of names) {
      const t = await L.launchTarget(name, L.LEGACY);
      try {
        const gl = await L.glRenderer(t.browser);
        const row: Row = { browser: name, version: t.browser.version(), gl, geometry: L.LEGACY, load: loadavg() };
        legacy.push(row);
        console.log(`\n[legacy: ${name} ${row.version}; ${L.geometryText(L.LEGACY)}; WebGL: ${gl}; load ${row.load}]`);
        await budgetsAndMap(t, row, true);
        row.script = await step('script', () => benchScript(t), (s) => `${f2(s.rules.rulesUs)} µs/line`);
      } finally {
        await t.browser.close();
      }
    }
  }
} finally {
  await ws?.close();
  await new Promise<void>((r) => server.httpServer.close(() => r()));
}
const loadEnd = loadavg();
const runMin = (Date.now() - startedAt) / 60_000;

// ----------------------------------------------------------------- report

const out: string[] = [];
const now = new Date();
out.push('# Benchmark results', '');
out.push(`Generated by \`npm run bench\` on ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC (browser part: ${runMin.toFixed(1)} min; flags: ${flagsText}).`, '');
out.push('## Machine', '');
out.push(`- CPU: ${os.cpus()[0]?.model ?? '?'} (${os.cpus().length} threads)`);
out.push(`- Memory: ${(os.totalmem() / 2 ** 30).toFixed(0)} GiB`);
out.push(`- OS: ${os.type()} ${os.release()} ${os.arch()}`);
out.push(`- Node: ${process.version}`);
out.push(`- Load average (1 / 5 / 15 min): ${loadStart} at the start, ${loadEnd} at the end`);
const gpuText = L.gpuArgs().join(' ');
for (const r of [...results, ...legacy])
  out.push(`- ${r.browser}${r.geometry === L.LEGACY ? ' (legacy geometry)' : ''}: ${r.version} (headless, Playwright${r.browser === 'chromium-gpu' ? `, \`${gpuText}\`` : ''}); WebGL: ${r.gl}`);
out.push(`- Geometry: ${L.geometryText(L.OWNER)} (the owner's window)${legacy.length ? `; legacy section ${L.geometryText(L.LEGACY)}` : ''}`);
out.push(`- Build: production bundle via \`vite preview\``);
out.push(`- Fixture: \`${fixture.rel}\` (${(fixture.size / 1e6).toFixed(2)} MB)${fixtureNote}`, '');

/** A table with one column per row of `rs`; `cell` returns '' for a missing measure. */
function table(rs: Row[], head: string, lines: Array<[string, string, (r: Row) => string | undefined]>): void {
  const used = lines.filter(([, , cell]) => rs.some((r) => cell(r) !== undefined));
  if (used.length === 0) return;
  out.push(`| ${head} | Measure | ${rs.map((r) => r.browser).join(' | ')} |`);
  out.push('|---|---|' + rs.map(() => '---|').join(''));
  for (const [a, b, cell] of used) out.push(`| ${a} | ${b} | ${rs.map((r) => cell(r) ?? '—').join(' | ')} |`);
  out.push('');
}
/** A longest-LoAF cell: n/a (unsupported), none (no frame ≥ 50 ms) or ms. */
const loafText = (ms: number) => (!Number.isFinite(ms) ? 'n/a' : ms === 0 ? 'none' : f1(ms));
const opt1 = <T, U>(x: T | undefined, f: (x: T) => U): U | undefined => (x === undefined ? undefined : f(x));

function budgetsTable(rs: Row[]): void {
  table(rs, 'Budget', [
    ['Load average', 'at the browser\'s start (1 / 5 / 15 min)', (r) => r.load],
    ['Key → send < 1 ms', 'Enter keydown → `send()`, median / p99 / max (ms); pass on p99', (r) =>
      opt1(r.key, (k) => `${f3(k.median)} / ${f3(k.p99)} / ${f3(k.max)} ${pass(k.p99 < KEY_BUDGET_MS && k.failedSends === 0)}`)],
    ['Frame → paint: next frame', 'frames that missed the next frame (of them caused by our flush)', (r) =>
      opt1(r.paint, (p) => `${p.late} of ${p.frames} (${p.lateOurs}) ${pass(p.late <= p.frames / 100 && p.lateOurs === 0)}`)],
    ['', 'receipt → painted, median / p95 / max (ms)', (r) => opt1(r.paint, (p) => `${f1(p.toPaintMedian)} / ${f1(p.toPaintP95)} / ${f1(p.toPaintMax)}`)],
    ['', 'flush script time, median / max (ms); frame interval (ms)', (r) => opt1(r.paint, (p) => `${f2(p.scriptMedian)} / ${f2(p.scriptMax)}; ${f1(p.interval)}`)],
    ['Scrollback 20 000: no slowdown', '50-line flush, frame time median (p95) at ~0 rows → at full (ms)', (r) =>
      opt1(r.scroll, (s) => `${f2(s.emptyFrame)} (${f2(s.emptyFrameP95)}) → ${f2(s.fullFrame)} (${f2(s.fullFrameP95)}) ${pass(s.fullFrame <= s.emptyFrame * 1.5 + 0.5)}`)],
    ['', 'flush script time median at ~0 → at full (ms); rows at full', (r) => opt1(r.scroll, (s) => `${f2(s.emptyScript)} → ${f2(s.fullScript)}; ${s.rowsFull}`)],
    ['Burst: no frame > 50 ms', 'longest rAF gap (ms); gaps > 50 ms', (r) => opt1(r.burst, (b) => `${f1(b.maxDelta)}; ${b.over50} of ${b.frames} ${pass(b.over50 === 0)}`)],
    ['', 'longest LoAF / long task (ms)', (r) =>
      opt1(r.burst, (b) => `${b.loafSupported ? (Number.isFinite(b.loafMax) ? f1(b.loafMax) : 'none') : 'n/a'} / ${b.ltSupported ? (b.longtaskMax > 0 ? f1(b.longtaskMax) : 'none') : 'n/a'}`)],
    ['', 'drain: lines, total ms, lines/s, MB/s', (r) => opt1(r.burst, (b) => `${b.lines}, ${f1(b.ms)}, ${b.linesPerSec.toFixed(0)}, ${f1(b.mbPerSec)}`)],
    [`${RULE_COUNT} user rules < 0.2 ms per line`, 'display pipeline µs per line with the rules (with none); lines', (r) =>
      opt1(r.script, (s) => `${f2(s.rules.rulesUs)} (${f2(s.rules.baseUs)}); ${s.rules.lines} ${pass(s.rules.rulesUs < RULE_BUDGET_US)}`)],
    [`${RULE_COUNT} user rules, whole ingest path`, 'socket → telnet → assembler → engine → recorder → output queue, µs per line with the rules (with none), median of the runs; pass on the rules', (r) =>
      opt1(r.rulesIngest, (x) => `${f2(x.rulesUs)} (${f2(x.noneUs)}) ${pass(x.rulesUs < RULE_BUDGET_US)}`)],
    ['', 'wall time per pass with / without the rules (ms); lines; longest single delivery (ms); session, capture', (r) =>
      opt1(r.rulesIngest, (x) => `${f1(x.rulesWall)} / ${f1(x.noneWall)}; ${x.lines}; ${f1(x.maxSync)}; ${x.state}, ${x.recorder.replace('capture: ', '')}`)],
    ['Key → send < 1 ms, script in the path', 'Enter on alias `bb`, median / p99 / max (ms)', (r) =>
      opt1(r.script, (s) => `${f3(s.alias.median)} / ${f3(s.alias.p99)} / ${f3(s.alias.max)} ${pass(s.alias.p99 < KEY_BUDGET_MS && s.alias.failed === 0)}`)],
    ['', 'F5 macro → alias → send, median / p99 / max (ms)', (r) =>
      opt1(r.script, (s) => `${f3(s.macro.median)} / ${f3(s.macro.p99)} / ${f3(s.macro.max)} ${pass(s.macro.p99 < KEY_BUDGET_MS && s.macro.failed === 0)}`)],
  ]);
}

function mapTables(rs: Row[]): void {
  const withMap = rs.filter((r) => r.map?.key || r.map?.load);
  if (withMap.length === 0) return;
  out.push('## Map pane off vs on', '');
  out.push(
    `Every run sets \`panes.map.on\` explicitly. Map on: arda.mm2 loaded in the Map pane and ${mapGmcp.length} GMCP lines of \`tests/fixtures/map-demo.log\` fed every ${MAP_FEED_MS} ms, looping; the burst log has one of them after every ${MAP_EVERY} lines (${burstMapText.gmcp} in all). "Off" is the budgets table, except for the burst, where "off" replays the same log with the GMCP lines. Off and on runs alternate in order (off/on, on/off, …).`,
    '',
  );
  type Side = { key?: Key; paint?: Paint; scroll?: Scroll };
  const heads = withMap.flatMap((r) => [`${r.browser} off`, `${r.browser} on`]);
  const lines: string[] = [];
  const mrow = (budget: string, measure: string, cell: (x: Side) => string | undefined) => {
    const cells = withMap.flatMap((r) => [cell(r), cell(r.map ?? {})]);
    if (cells.every((c) => c === undefined)) return;
    lines.push(`| ${budget} | ${measure} | ${cells.map((c) => c ?? '—').join(' | ')} |`);
  };
  const brow = (budget: string, measure: string, cell: (b: Burst) => string) => {
    const cells = withMap.flatMap((r) => [opt1(r.map?.burstOff, cell), opt1(r.map?.burst, cell)]);
    if (cells.every((c) => c === undefined)) return;
    lines.push(`| ${budget} | ${measure} | ${cells.map((c) => c ?? '—').join(' | ')} |`);
  };
  mrow('Key → send < 1 ms', 'median / p99 / max (ms)', (x) => opt1(x.key, (k) => `${f3(k.median)} / ${f3(k.p99)} / ${f3(k.max)} ${pass(k.p99 < KEY_BUDGET_MS && k.failedSends === 0)}`));
  mrow('Frame → paint', 'late frames (ours); painted median / p95 / max (ms)', (x) =>
    opt1(x.paint, (p) => `${p.late} (${p.lateOurs}); ${f1(p.toPaintMedian)} / ${f1(p.toPaintP95)} / ${f1(p.toPaintMax)} ${pass(p.late <= p.frames / 100 && p.lateOurs === 0)}`));
  mrow('', 'flush script median / max (ms)', (x) => opt1(x.paint, (p) => `${f2(p.scriptMedian)} / ${f2(p.scriptMax)}`));
  mrow('Scrollback 20 000', 'frame median at ~0 → full (ms)', (x) => opt1(x.scroll, (s) => `${f2(s.emptyFrame)} → ${f2(s.fullFrame)} ${pass(s.fullFrame <= s.emptyFrame * 1.5 + 0.5)}`));
  brow('Burst: no frame > 50 ms', 'burst log + GMCP lines: longest rAF gap (ms); gaps > 50 ms', (b) => `${f1(b.maxDelta)}; ${b.over50} of ${b.frames} ${pass(b.over50 === 0)}`);
  brow('', 'p95 rAF gap (ms); longest LoAF (ms)', (b) => `${f1(b.p95Delta)}; ${b.loafSupported ? f1(b.loafMax) : 'n/a'}`);
  brow('', 'drain total ms, lines/s', (b) => `${f1(b.ms)}, ${b.linesPerSec.toFixed(0)}`);
  if (lines.length) {
    out.push('| Budget | Measure | ' + heads.join(' | ') + ' |');
    out.push('|---|---|' + heads.map(() => '---|').join(''));
    out.push(...lines, '');
  }
  table(withMap, 'Map on', [
    ['Tracking', 'feed frames delivered in key / paint / scroll; map located at the end', (r) =>
      r.map?.key ? `${r.map.key.tail?.fed} / ${r.map.paint?.tail?.fed} / ${r.map.scroll?.tail?.fed}; ${[r.map.key, r.map.paint, r.map.scroll, r.map.burst].every((x) => x?.tail?.located === '1') ? 'yes' : 'no'}` : undefined],
    ['Map load', 'turn on → first frame with tiles and font, main thread (ms)', (r) => opt1(r.map?.load, (l) => f1(l.onToDrawn))],
    ['', 'worker: load start → that frame (ms); stages fetch / inflate / parse+indexes / hash / meshes+upload (ms)', (r) =>
      opt1(r.map?.load, (m) => `${m.workerDrawn}; ${m.load.fetch} / ${m.load.inflate} / ${m.load.parse} / ${m.load.hash} / ${m.load.meshes}`)],
    ['No main-thread task > 5 ms from the map', 'longest main-thread tasks, turn-on → 1 s after that frame (ms; Chromium trace)', (r) =>
      opt1(r.map?.load, (m) => (m.tasks ? `${m.tasks.slice(0, 3).map((x) => f1(x)).join(', ')} ${pass((m.tasks[0] ?? 0) <= 5)}` : 'n/a'))],
    ['', 'LoAF durations (ms); longest rAF gap (ms)', (r) =>
      opt1(r.map?.load, (m) => `${m.loafSupported ? (m.loaf.length ? m.loaf.map((x) => f1(x)).join(', ') : 'none') : 'n/a'}; ${f1(m.maxDelta)}`)],
  ]);
}

out.push(`## Budgets (spec §1.3), ${L.geometryText(L.OWNER)}`, '');
budgetsTable(results);
mapTables(results);

out.push(`## Owner-geometry checks (performance review §7)`, '');
const keyCells = (load: import('./input-load').KeyLoad): Array<[string, string, (r: Row) => string | undefined]> => [
  [`Real keys, load: ${load}`, 'input delay p95 / max (ms; Chromium event.timeStamp → listener, Firefox Node press → listener); Event Timing keydowns ≥ 16 ms: count, input delay p95 / max', (r) =>
    opt1(r.keys?.[load], (k) => `${f1(k.inputDelay.p95)} / ${f1(k.inputDelay.max)}; ${k.etEntries} of ${k.keys}, ${f1(k.etDelay.p95)} / ${f1(k.etDelay.max)}`)],
  ['', 'key → send, typed letter → rendered, Enter → echo rendered: median / p95 / max (ms)', (r) =>
    opt1(r.keys?.[load], (k) => `${fd(k.keyToSend)}; ${fd(k.letterToRendered)}; ${fd(k.enterToEcho)}`)],
  ['', `longest rAF gap (ms)${load === 'burst' ? ', pass ≤ 50 ms' : ''}; longest LoAF (ms); session`, (r) =>
    opt1(r.keys?.[load], (k) => `${f1(k.rafMax)}${load === 'burst' ? ` ${pass(k.rafMax <= FRAME_BUDGET_MS)}` : ''}; ${loafText(k.loafMax)}; ${k.state}`)],
];
const wsCells = (load: import('./input-load').WsLoad): Array<[string, string, (r: Row) => string | undefined]> => [
  [`Loopback WebSocket, load: ${load}`, 'key → wire (Node press → server receive) median / p95 / max (ms); socket.send → wire median', (r) =>
    opt1(r.ws?.[load], (w) => `${fd(w.keyToWire)}; ${f2(w.sendToWire.median)}`)],
  ['', 'input delay p95 / max; letter → rendered median / p95 / max (ms)', (r) => opt1(r.ws?.[load], (w) => `${f1(w.inputDelay.p95)} / ${f1(w.inputDelay.max)}; ${fd(w.letterToRendered)}`)],
  ['', 'longest main-thread tasks (ms, what ran; Chromium trace)', (r) =>
    opt1(r.ws?.[load], (w) => (w.tasks ? w.tasks.slice(0, 3).map((x) => `${f1(x.ms)} (${x.label})`).join('; ') : 'n/a (Firefox: Gecko profiler needed)'))],
  ['', `longest WebSocket message task; longest rAF gap${load === 'burst' ? ', pass ≤ 50 ms' : ''}; longest LoAF (ms); session, capture${load === 'burst' ? '; bursts' : ''}`, (r) =>
    opt1(r.ws?.[load], (w) => `${f1(w.wsTaskMax)}; ${f1(w.rafMax)}${load === 'burst' ? ` ${pass(w.rafMax <= FRAME_BUDGET_MS)}` : ''}; ${loafText(w.loafMax)}; ${w.state}, ${w.recorder.replace('capture: ', '')}${load === 'burst' ? `; ${w.bursts}` : ''}`)],
];
table(results, 'Check', [
  ['Visible caret: receipt → rendered ≤ 4 ms', 'isolated lines 150–450 ms apart, caret visible and blinking: median / p95 / max (ms); pass on the median', (r) =>
    opt1(r.caret, (c) => `${fd(c.toPaint)} ${pass(c.toPaint.median <= CARET_BUDGET_MS)}`)],
  ['', 'wait for the frame median / p95 (ms); lines; caret toggles/s while measuring; session', (r) =>
    opt1(r.caret, (c) => `${f1(c.wait.median)} / ${f1(c.wait.p95)}; ${c.lines}; ${f1(c.blinkPerS)}; ${c.state}`)],
  ['Idle: ≤ 5 frames/s', 'nothing arriving, caret blinking: frames/s (frames with rAF callbacks + caret toggles); CSS animations running', (r) =>
    opt1(r.caret, (c) => `${f1(c.idleFramesPerS)} (${f1(c.idleRafPerS)} + ${f1(c.idleTogglesPerS)}); ${c.caret.animations} ${pass(c.idleFramesPerS <= IDLE_BUDGET_PER_S && c.caret.animations === 0)}`)],
  ['', 'Chromium trace: main-thread frames (Commit) / compositor BeginFrame / DrawFrame per s', (r) =>
    opt1(r.caret, (c) => (c.trace ? `${f1(c.trace.commit)} / ${f1(c.trace.begin)} / ${f1(c.trace.draw)}` : 'n/a'))],
  ['Play with GMCP (all panes, map on)', 'text frames without / with a pane render: callback → rendered median / p95 / max (ms)', (r) =>
    opt1(r.play, (p) => `without: ${fd(p.O)} (n ${p.O.n}); with: ${fd(p.OP)} (n ${p.OP.n})`)],
  ['', 'pane-only frames median / p95 / max (ms); pane script in text frames median / max (ms); flush script without / with panes (ms)', (r) =>
    opt1(r.play, (p) => `${fd(p.P)} (n ${p.P.n}); ${f2(p.paneOP.median)} / ${f2(p.paneOP.max)}; ${f2(p.flushO)} / ${f2(p.flushOP)}`)],
  ['', 'pane renders per s; window (s); session', (r) =>
    opt1(r.play, (p) => `${Object.entries(p.panesPerS).map(([k, v]) => `${k} ${f1(v)}`).join(', ')}; ${f1(p.windowS)}; ${p.state}`)],
  ['Colour page, 24-bit', 'page frame (callback → rendered) / script / receipt → painted, median / max (ms)', (r) =>
    opt1(r.colour, (c) => `${f1(c.c24.pageFrame.median)} / ${f1(c.c24.pageFrame.max)}; ${f1(c.c24.pageScript.median)} / ${f1(c.c24.pageScript.max)}; ${f1(c.c24.pagePaint.median)} / ${f1(c.c24.pagePaint.max)}`)],
  ['', 'the next 20 frames (4 rows each): median / p95 / max (ms)', (r) => opt1(r.colour, (c) => fd(c.c24.next))],
  ['Colour page, 256', 'page frame / script / receipt → painted, median / max (ms)', (r) =>
    opt1(r.colour, (c) => `${f1(c.c256.pageFrame.median)} / ${f1(c.c256.pageFrame.max)}; ${f1(c.c256.pageScript.median)} / ${f1(c.c256.pageScript.max)}; ${f1(c.c256.pagePaint.median)} / ${f1(c.c256.pagePaint.max)}`)],
  ['', 'the next 20 frames: median / p95 / max (ms)', (r) => opt1(r.colour, (c) => fd(c.c256.next))],
  ['Full scrollback (20 000 rows)', '10-row flushes: normal frames / trim frames (a chunk dropped), median / p95 / max (ms)', (r) =>
    opt1(r.scrollActions, (s) => `${fd(s.normal)} (n ${s.normal.n}) / ${fd(s.trim)} (n ${s.trim.n})`)],
  ['', 'enter / leave scroll mode: call → rendered, median / max (ms)', (r) =>
    opt1(r.scrollActions, (s) => `${f1(s.enter.median)} / ${f1(s.enter.max)}; ${f1(s.leave.median)} / ${f1(s.leave.max)}`)],
  ['', 'width change ±9 px: forced layout / frame, median / max (ms)', (r) =>
    opt1(r.scrollActions, (s) => `${f1(s.widthLayout.median)} / ${f1(s.widthLayout.max)}; ${f1(s.widthFrame.median)} / ${f1(s.widthFrame.max)}`)],
  ['', 'right dock drag: press / moves / drop → rendered, median / max (ms); rows, elements', (r) =>
    opt1(r.scrollActions, (s) =>
      s.dragFound ? `${f1(s.dragDown.median)} / ${f1(s.dragDown.max)}; ${f1(s.dragMove.median)} / ${f1(s.dragMove.max)}; ${f1(s.dragUp.median)} / ${f1(s.dragUp.max)}; ${s.rows}, ${s.elements}` : 'no dock handle')],
  ...keyCells('colour'),
  ...keyCells('burst'),
  ...keyCells('play'),
  ...wsCells('burst'),
  ...wsCells('play'),
]);

const soaked = results.filter((r) => r.soak);
if (soaked.length) {
  const mode = soaked[0]!.soak!.mode;
  out.push(`## Soak (${mode === 'long' ? `long: ${soaked[0]!.soak!.logs.join(', ')}` : `short: ${SOAK_S} s of \`${fixture.rel}\``}, ${S.SOAK_SPEED}×)`, '');
  table(soaked, 'Soak', [
    ['Run', 'wall time (s); log time covered (min); frames delivered; commands typed; session, capture', (r) =>
      opt1(r.soak, (s) => `${f1(s.wallS)}; ${f1(s.logMs / 60_000)}; ${s.delivered}; ${s.typed}; ${s.state}, ${s.recorder.replace('capture: ', '')}`)],
    ['Counters flat', 'first checkpoint (full scrollback) → last: DOM elements; bus handlers; timeouts / intervals / window+document listeners; JS heap after GC (MB) / listeners (Chromium); pass: each ≤ 1.1 × start + slack', (r) =>
      opt1(r.soak, (s) => {
        const a = s.checkpoints[0]!;
        const b = s.checkpoints.at(-1)!;
        const x = (v: number | null, f = (n: number) => String(n)) => (v === null || !Number.isFinite(v) ? 'n/a' : f(v));
        return `${a.elements} → ${b.elements}; ${a.bus} → ${b.bus}; ${x(a.timeouts)}/${x(a.intervals)}/${x(a.listeners)} → ${x(b.timeouts)}/${x(b.intervals)}/${x(b.listeners)}; ${x(a.heapMb, f1)}/${x(a.jsListeners)} → ${x(b.heapMb, f1)}/${x(b.jsListeners)} ${pass(S.soakPass(s).counters)}`;
      })],
    ['Frames within 1.2× + 1 ms', '60 small frames per checkpoint: callback → rendered median (p95) at the first → last checkpoint (ms)', (r) =>
      opt1(r.soak, (s) => `${s.checkpoints.map((c) => `${f2(c.frame.median)} (${f2(c.frame.p95)})`).join(' → ')} ${pass(S.soakPass(s).frames)}`)],
    ['', 'checkpoints', (r) => opt1(r.soak, (s) => s.checkpoints.map((c) => `${c.label}: ${c.rows} rows`).join('; '))],
  ]);
}

if (legacy.length) {
  out.push(`## Legacy geometry (${L.geometryText(L.LEGACY)}, the stage 1–9 set)`, '');
  budgetsTable(legacy);
  mapTables(legacy);
}

out.push('## Method', '');
out.push(
  `- **Geometry and runs:** ${L.geometryText(L.OWNER)} (the owner's window): Firefox at ratio 2 through the \`layout.css.devPixelsPerPx\` pref (a context's deviceScaleFactor does not reach the cross-origin isolated page), Chromium with \`deviceScaleFactor\` 2 and the GPU flags. Every page is a fresh context with \`panes.map.on\` set explicitly (\`?bench&benchSettings=…\`, applied before the shell is built). A/B pairs (map off / on, rules none / 500) alternate their order. The load average is logged per browser and per step (console).`,
  `- **Key → send:** \`?bench\` probe sets the input to \`look\`, dispatches a synthetic Enter \`keydown\` on it and reads the time \`Socketish.send\` was called on a fake socket. ${scaled(220, 60) - 20} samples after 20 warm-up runs. Pass is judged on p99, so a single GC pause does not decide it; the max is reported.`,
  `- **Frame → paint:** ${scaled(400, 80)} telnet frames of the fixture (as the replay socket groups them at speed 1), after 10 warm-up frames, are fed through the fake socket at random 20–80 ms intervals. "Painted" is a MessageChannel message posted from the output pane's frame callback, which runs after that frame's rendering. A frame is late when its flush started more than 1.5 frame intervals after receipt, i.e. it missed the next frame. Pass: at most 1 % of frames late and none because our flush script ran longer than a frame. The input is focused and empty and the caret blinks, so the medians include the wait for the next vsync (see the visible-caret check for isolated lines).`,
  '- **Scrollback:** 40 flushes of 50 synthetic lines (some coloured) on an empty pane, then 22 000 more lines, then 40 more flushes with the pane at its 20 000-row cap. Frame time = frame callback start → after rendering. Pass: median at full ≤ 1.5 × median at empty + 0.5 ms.',
  `- **${RULE_COUNT} user rules:** \`bench/rules.ts\` builds a seeded profile from the fixture's words: 250 actions, 125 substitutes and 125 highlights. Display pipeline: the fixture's lines, assembled once, through a separate ScriptEngine's \`processLine\`; median of 5 passes after a warm-up, divided by the line count. **Whole ingest path:** the session logged in with GMCP on the fake socket (playing, so the run recorder captures), the profile applied to the app, then the fixture's 16 KB telnet frames delivered for 8 ms per animation frame; the synchronous time of each delivery (telnet, assembler, engine, recorder capture, output queue, and any GC inside) is summed and divided by the lines. Runs alternate none / rules / rules / none; median per variant. The wall time per pass also holds the output flushes and the recorder's chunk writes.`,
  '- **Key → send with script:** the same profile is applied to the app. `bb` + Enter runs the alias `bb` → `bash $target`; F5 runs the macro `bb` → the alias. Timed like Key → send.',
  `- **Map on:** the same key → send, frame → paint, scrollback and burst runs with the Map pane on (waiting for the worker's first frame with every tile and the font). While key, paint and scrollback run, the ${mapGmcp.length} GMCP lines of \`tests/fixtures/map-demo.log\` go through the fake socket one frame every ${MAP_FEED_MS} ms, looping. **Map load:** one in-page evaluate turns the map on and waits for the first complete frame; Chromium records a DevTools trace of every main-thread task from the settings change until 1 s after that frame.`,
  '- **Burst:** the whole fixture replayed at speed 0 (16 KB frames, delivered in slices of at most 8 ms, then the replay waits for the next animation frame) through the real Session, telnet parser, line assembler and output pane. rAF gaps are measured for the whole replay until the output has drained; Chromium also reports Long Animation Frames. A replay is never recorded; the loopback WebSocket check covers a recorded session.',
  '- **Visible caret / idle:** GMCP login (playing, panes active, clock strip counting), the input focused, End pressed (a collapsed, visible caret that blinks: a 500 ms timer toggles a class, ADR 0044). Then short lines at random 150–450 ms intervals; receipt → after the frame painted (`inject`). Idle: nothing arrives; `?benchFrames` wraps requestAnimationFrame and counts frames that ran callbacks; a MutationObserver counts caret toggles (each renders a frame without a rAF callback). Their sum is an upper bound of rendered frames; Chromium adds DevTools trace counts (main-thread Commit, compositor BeginFrame / DrawFrame). Pass: median ≤ 4 ms; idle ≤ 5 frames/s and no CSS animation running.',
  '- **Play with GMCP:** a busy window (90th percentile by lines per 90 s) of the fixture with synthesized GMCP (`bench/feeds.ts`: Char.Vitals on every prompt, Group.Update on most fight prompts, Comm.Channel.Text before comm lines, Room.Info + Event.Moved after moves), played at 2× through the fake socket with its commands typed (synthetic Enter), all panes on, map on. After 5 s of warm-up, every animation frame is logged (`?benchFrames`): its callbacks\' start → after rendering, its output flush and its side-pane renders.',
  '- **Colour page:** `tests/fixtures/colour-chart.ts` (MUME\'s `help 24-bit colours` layout; the 256-colour page in the same layout), the first screen (46 lines + the pager line) as one frame on a pane with 2 000 rows, then 20 small 4-row frames at 25–60 ms; repeated, 24-bit and 256 alternating.',
  '- **Real keys under load:** Playwright key presses at random 40–250 ms gaps (letters, Enter, F1 macro, the printable-key macro `` ` ``) with the khazdul profile, under three loads: the colour pages every 150–450 ms, the fixture burst replayed again 300 ms after each drain, and the play window (GMCP, speed 1) after a GMCP login. Chromium\'s `event.timeStamp` is set in the browser process, so listener − timeStamp is the input delay; Playwright\'s Firefox creates the event in the content process, so there the delay is from Node\'s clock before the press (min-RTT sync), an upper bound with ~1–2 ms of protocol. Event Timing (both) reports keydowns ≥ 16 ms. Firefox\'s full view (GC, cycle collector) needs the Gecko profiler; not run by default.',
  `- **Loopback WebSocket:** a WebSocket server in the bench process (port ${PORT + 1}, subprotocol \`binary\`) plays MUME through the app's own WebSocketTransport: GMCP login (playing, not a replay: the run recorder captures to IndexedDB), then either the whole fixture in 16 KB messages (the next burst only after the page acknowledged the end marker, then 1 s) or the play window at speed 1. Key → wire = Node press → server receive (one clock). Chromium records a DevTools trace of the key window: the longest main-thread tasks with their biggest children (GC, script, style, layout). Firefox: the longest WebSocket message task and rAF gap only (the recorder's chunk write, GC and CC need the Gecko profiler).`,
  '- **Full scrollback:** 22 000 synthetic lines, then 10-row flushes every ~30 ms (a 200-row chunk is dropped every 20th: "trim frames", reported apart); `pageUp()` / `toTail()` timed from the call to after the next frame; a ±9 px width change of the game pane (style write + forced layout, then the frame); real pointer drags of the right dock\'s handle (press, 5 moves, drop; each timed from the event to after the next frame).',
  `- **Soak:** \`bench/soak.ts\`. Map on, all panes, GMCP login, the scrollback filled to its cap, then the log${SOAK_LONG ? 's' : ''} with synthesized GMCP at ${S.SOAK_SPEED}× log time, commands typed. Checkpoints with playback paused and the output drained (Chromium: a forced GC first): DOM elements, bus handlers, live timeouts / intervals / window+document listeners (\`?benchCounters\`), Chromium JS heap and listeners (CDP \`Performance.getMetrics\`; Firefox gives no heap figure without about:memory), and 60 small frames. Pass: counters ≤ 1.1 × the first checkpoint + a small slack; median frame ≤ 1.2 × + 1 ms. GC pauses are not traced here (use trace windows, not \`--trace-gc\`, which misses unified-heap major GCs; keep heap snapshots out of timing runs).`,
  '',
);
out.push('## Flags', '');
out.push(
  '`npm run bench` runs the Node benchmarks and `node bench/browser-bench.ts`; flags after `npm run bench --` reach the browser part (or set the environment variables).',
  '',
  '| Flag | Environment | Effect |',
  '|---|---|---|',
  '| `--quick` | `WC_BENCH_QUICK=1` | about a quarter of the samples (smoke run, ~5 min) |',
  '| `--browsers firefox,chromium` | `WC_BENCH_BROWSERS` | browsers, in order (chromium = with the GPU flags unless `WC_BENCH_GPU=0`) |',
  '| `--only a,b` | `WC_BENCH_ONLY` | sections: budgets, map, script, caret, play, colour, scroll, rules, keys, ws, soak |',
  '| `--legacy` | `WC_BENCH_LEGACY=1` | also the stage 1–9 set (budgets, map) at 1280 × 720, ratio 1, in chromium, chromium-gpu and firefox (~8 min more) |',
  '| `--soak-long` | `WC_BENCH_SOAK_LONG=1` | the long soak: the owner\'s three biggest logs to their ends at 30× (tests/fixtures without them) |',
  '| `--soak-s N` | `WC_BENCH_SOAK_S` | the short soak\'s length in s (default 60) |',
  '| `--port N` | `WC_BENCH_PORT` | preview port (default 4179; the WebSocket server uses N + 1) |',
  '| `--out file` | `WC_BENCH_OUT` | report path (default bench/results/latest.md) |',
  '| | `WC_BENCH_GPU=0`, `WC_BENCH_GPU_ARGS` | Chromium without / with other GPU flags |',
  '',
);
out.push('## Fixes made because of this benchmark (stage 1)', '');
out.push(
  '- **Scrollback slowdown (Chromium).** With 20 000 flat rows trimmed row by row on every flush, a 50-line flush took 3.8 ms per frame on an empty pane and 21.3 ms at 20 000 rows (Firefox: 4.3 → 9.8 ms). Rows now live in contained chunks of 200 rows (at full: ~5 ms, still trimmed row by row), and old rows are dropped a whole chunk at a time (at full: within noise of an empty pane). The pane keeps at least 20 000 rows and fewer than 20 000 + one chunk.',
  "- **Burst replay scheduling.** The replay socket delivered 16 KB frames as an unbroken chain of message tasks at speed 0. It now delivers for at most 8 ms and waits for the next animation frame: Firefox's longest frame went from ~35 ms to ~20 ms; Chromium stayed at ~19 ms.",
  "- **Harness artefacts found on the way (not app changes):** Chromium's first frame after load (~120 ms) and handing a 4.7 MB string to the page (~120 ms) showed up as long frames until the benchmark waited for the first frames and transferred the text before measuring.",
  '',
);
out.push('## Stage 2 notes', '');
out.push(
  "- **Package A (theme, web fonts, cell grid, custom caret), 2026-09-27.** Burst drain times and longest frames were ~2× the stage-1 figures on this day, but the stage-1 commit (c815295) run back to back on the same machine measured the same (Chromium: 1152 ms drain, 46.4 ms longest frame; Firefox: 1097 ms, 37.0 ms), so the difference is the machine's state, not the change. Scrollback medians are noisy run to run (one of four runs missed the Chromium ratio at 3.30 → 6.53 ms; the others passed, as does the stage-1 commit).",
  '',
);
out.push('## Stage 3 notes', '');
out.push(
  '- **P2 (script engine), 2026-09-27.** The output pane now shows `text.display` copies from the engine; with no rules a line passes through untouched (the same object). The burst, paint and scrollback rows include that step. Rules are pre-filtered with an `indexOf` on the longest literal of each pattern, so a rule that cannot match costs one string search.',
  '',
);
out.push('## Stage 9 notes', '');
out.push(
  "- **P4 (map), 2026-09-28.** Headless Chromium draws WebGL with SwiftShader (CPU). There, with the map on, a few map frames take ~0.4–0.7 s in the GPU process (most likely SwiftShader compiling a pipeline the first time a draw state is used); the page's frames wait on the same GPU thread, which shows as rare 0.2–0.6 s frame gaps although the main thread is idle. With the real GPU (`chromium-gpu`) and in Firefox there are none. Users either have a GPU or get the map's \"not supported\" notice, so the owner-geometry runs use Chromium with the GPU flags; the SwiftShader column survives in the `--legacy` set.",
  '',
);
out.push('## Stage 8 notes', '');
out.push(
  '- **Report #15 (bench gaps), 2026-10-01.** The bench moved to the owner\'s geometry (ratio 2, 1728 × 1000; Firefox first) and gained the review\'s checks: visible-caret latency and idle frames, play with GMCP (active panes), the colour page, real keys under three loads, a loopback WebSocket with a recording session, full-scrollback actions, the 500 rules through the whole ingest path and a soak. "Map off" runs now set `panes.map.on` to false (since 9c0cf8e the map is on by default, so the earlier "off" columns had it on). Owner-geometry numbers are not comparable with the stage 1–9 figures above (`--legacy` reruns those).',
  '',
);
mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
writeFileSync(OUT, out.join('\n'));
console.log(`\nbrowser-bench: wrote ${OUT} (${runMin.toFixed(1)} min)`);
