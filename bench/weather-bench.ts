// Weather effects latency proof (stage 28 E, ADR 0091): the browser bench's
// key → send and frame → paint with the weather effects off and on, plus
// main-thread long tasks and the worker's own frame times.
//
//   node bench/weather-bench.ts [--rounds N] [--browsers firefox,chromium] [--quick] [--out file]
//
// Builds the app, serves the production bundle with `vite preview`, and
// drives the `?bench` probe (src/app/bench-hook.ts) at the owner's geometry
// (1728 × 1000, ratio 2), Map pane off. "On" = Options → Weather effects on
// (`benchSettings`), the state pinned to the heaviest mix: heavy rain,
// dense fog, dying (blood, red pulse), night with the moon up; then 9 s for
// everything to ease in. Off and on alternate (off/on, on/off, …) over N
// rounds, so a noisy machine hits both alike; every number is the median
// over the rounds of each round's statistic.
//
// Per round and variant:
// - key → send: 200 synthetic Enter keydowns → Socketish.send (20 warm-up).
// - frame → paint: 200 telnet frames of the biggest owner log at random
//   20–80 ms intervals; receipt → after the frame painted; rAF gaps, Long
//   Animation Frames and long tasks (Chromium) meanwhile.
// - idle main thread (Chromium): a 5 s DevTools trace with nothing
//   arriving: main-thread tasks, their total and the longest.
// - worker frame times (on): `engine.stats()`.
//
// Writes bench/results/weather.md.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import os from 'node:os';

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (err) {
      if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) return next(specifier + '.ts', context);
      throw err;
    }
  },
});

const { listFixtures } = await import('../tests/e2e/fixtures');
const L = await import('./lib');
const { build, preview } = await import('vite');
type Target = import('./lib').Target;
type TargetName = import('./lib').TargetName;
type Page = import('@playwright/test').Page;
const { pct, median, max, f1, f2, f3, pause, loadavg, openBench, closePage, startMonitor, stopMonitor, launchTarget, OWNER, glRenderer } = L;

const argv = process.argv.slice(2);
const opt = (name: string, env: string, def: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : (process.env[env] ?? def);
};
const QUICK = argv.includes('--quick');
const ROUNDS = Number(opt('rounds', 'WC_BENCH_ROUNDS', QUICK ? '2' : '4'));
const PORT = Number(opt('port', 'WC_BENCH_PORT', '4189'));
const OUT = opt('out', 'WC_BENCH_OUT', new URL('./results/weather.md', import.meta.url).pathname);
const BROWSERS = opt('browsers', 'WC_BENCH_BROWSERS', 'chromium,firefox')
  .split(',')
  .map((b) => (b === 'chromium' && process.env.WC_BENCH_GPU !== '0' ? 'chromium-gpu' : b) as TargetName);
const N = QUICK ? 80 : 200;
/** The pinned state with the effects on (`--state <json>` overrides, e.g. to isolate one effect). */
const HEAVY: Record<string, unknown> = JSON.parse(
  opt('state', 'WC_WEATHER_STATE', JSON.stringify({ weather: '"', fog: '=', position: 'dying', clock: 'night', moonUp: true, light: '' })),
);

const owner = listFixtures();
const fixture =
  owner.at(-1) ??
  (() => {
    const dir = new URL('../tests/fixtures/', import.meta.url).pathname;
    const n = readdirSync(dir).filter((x) => x.endsWith('.log')).sort((a, b) => statSync(dir + a).size - statSync(dir + b).size).at(-1)!;
    return { rel: `tests/fixtures/${n}`, path: dir + n, size: statSync(dir + n).size };
  })();
const logText = readFileSync(fixture.path, 'utf8');

interface Sample {
  key: { median: number; p99: number; max: number };
  paint: { median: number; p95: number; max: number; flush: number };
  gaps: { p95: number; max: number; over50: number };
  long: { loaf: number[]; longtask: number[]; loafOk: boolean; ltOk: boolean };
  idle: { tasks: number; totalMs: number; longest: number; over5: number } | null;
  worker: { avg: number; p95: number; max: number; n: number; fps: number } | null;
  load: string;
}

async function open(t: Target, on: boolean): Promise<Page> {
  const page = await openBench(t, base, { settings: { panes: { map: { on: false } }, weather: { enabled: on } } });
  if (on) {
    const ok = await page.evaluate(async (heavy) => {
      const hook = window.__wcBench!.app!.weather;
      const ctl = await hook?.settled();
      if (!ctl) return false;
      await ctl.engine.ready;
      ctl.pin(heavy as never);
      return true;
    }, HEAVY);
    if (!ok) throw new Error(`${t.name}: the weather effects did not start`);
    // Ease-in.
    await pause(9000);
  }
  await page.evaluate(() => window.__wcBench!.connectFake());
  return page;
}

async function idleTrace(t: Target, page: Page): Promise<Sample['idle']> {
  if (!t.isChromium) return null;
  await page.waitForSelector('body');
  await t.browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'toplevel'] });
  await pause(5000);
  type Ev = { name: string; ph: string; dur?: number; pid: number; tid: number; args?: { name?: string } };
  const ev = (JSON.parse((await t.browser.stopTracing()).toString()) as { traceEvents: Ev[] }).traceEvents;
  const main = new Set(ev.filter((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain').map((e) => `${e.pid}:${e.tid}`));
  const tasks = ev.filter((e) => e.name === 'RunTask' && e.ph === 'X' && main.has(`${e.pid}:${e.tid}`)).map((e) => (e.dur ?? 0) / 1000);
  return { tasks: tasks.length, totalMs: tasks.reduce((a, b) => a + b, 0), longest: max(tasks), over5: tasks.filter((x) => x > 5).length };
}

async function measure(t: Target, on: boolean): Promise<Sample> {
  const load = loadavg();
  const page = await open(t, on);
  const workerFrames = () => page.evaluate(async () => [(await window.__wcBench!.app!.weather!.controller!.engine.stats()).frames, performance.now()] as const);
  const w0 = on ? await workerFrames() : null;
  // key → send
  const keys: number[] = [];
  for (let i = 0; i < N + 20; i++) {
    const ms = await page.evaluate(() => window.__wcBench!.keyToSend('look'));
    if (i >= 20) keys.push(ms);
    if (i % 10 === 0) await pause(5);
  }
  // frame → paint
  const WARM = 10;
  const total = await page.evaluate(([text, k]) => window.__wcBench!.loadFrames(text!, 1, k!), [logText, N + WARM] as const);
  for (let i = 0; i < WARM; i++) {
    await page.evaluate((k) => window.__wcBench!.inject(k), i);
    await pause(30);
  }
  await startMonitor(page);
  const toPaint: number[] = [];
  const script: number[] = [];
  for (let i = WARM; i < total; i++) {
    const r = await page.evaluate((k) => window.__wcBench!.inject(k), i);
    toPaint.push(r.toPaint);
    script.push(r.script);
    await pause(20 + Math.random() * 60);
  }
  const mon = await stopMonitor(page);
  const idle = await idleTrace(t, page);
  const w1 = on ? await workerFrames() : null;
  const worker = on
    ? await page.evaluate(async (fps) => {
        const s = await window.__wcBench!.app!.weather!.controller!.engine.stats();
        return { avg: s.avg, p95: s.p95, max: s.max, n: s.n, fps };
      }, w0 && w1 ? ((w1[0] - w0[0]) * 1000) / (w1[1] - w0[1]) : 0)
    : null;
  if (on && !(await page.evaluate(() => document.querySelector('.wc-cockpit[data-weather]') !== null))) throw new Error('weather not running');
  await closePage(page);
  return {
    key: { median: median(keys), p99: pct(keys, 99), max: max(keys) },
    paint: { median: median(toPaint), p95: pct(toPaint, 95), max: max(toPaint), flush: median(script) },
    gaps: { p95: pct(mon.deltas, 95), max: max(mon.deltas), over50: mon.deltas.filter((d) => d > 50).length },
    long: { loaf: mon.loaf, longtask: mon.longtask, loafOk: mon.loafSupported, ltOk: mon.ltSupported },
    idle,
    worker,
    load,
  };
}

// ------------------------------------------------------------------ main

console.log('weather-bench: building…');
await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'warn' });
const base = (server.resolvedUrls?.local[0] ?? `http://localhost:${PORT}/`).replace(/\/$/, '');
const started = Date.now();
const loadStart = loadavg();
console.log(`weather-bench: ${base}, fixture ${fixture.rel}, ${ROUNDS} rounds, load ${loadStart}`);

interface Result {
  name: string;
  version: string;
  gl: string;
  off: Sample[];
  on: Sample[];
}
const results: Result[] = [];
for (const name of BROWSERS) {
  const t = await launchTarget(name, OWNER);
  const r: Result = { name, version: t.browser.version(), gl: await glRenderer(t.browser), off: [], on: [] };
  for (let i = 0; i < ROUNDS; i++) {
    const order = i % 2 === 0 ? [false, true] : [true, false];
    for (const on of order) {
      const s = await measure(t, on);
      (on ? r.on : r.off).push(s);
      console.log(
        `  ${name} round ${i + 1} ${on ? 'on ' : 'off'}: key ${f3(s.key.median)}/${f3(s.key.p99)} ms, paint ${f1(s.paint.median)}/${f1(s.paint.p95)}/${f1(s.paint.max)} ms, gaps max ${f1(s.gaps.max)}` +
          (s.idle ? `, idle main ${s.idle.tasks} tasks ${f1(s.idle.totalMs)} ms longest ${f2(s.idle.longest)}` : '') +
          (s.worker ? `, worker avg ${f2(s.worker.avg)} p95 ${f2(s.worker.p95)} ms` : ''),
      );
    }
  }
  await t.browser.close();
  results.push(r);
}
await new Promise<void>((res) => server.httpServer.close(() => res()));

// ---------------------------------------------------------------- report

const med = (xs: Sample[], f: (s: Sample) => number) => median(xs.map(f));
const mx = (xs: Sample[], f: (s: Sample) => number) => max(xs.map(f));
const out: string[] = [];
out.push('# Weather effects: latency off vs on', '');
out.push(
  `Generated by \`node bench/weather-bench.ts${argv.length ? ' ' + argv.join(' ') : ''}\` on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC (${((Date.now() - started) / 60000).toFixed(1)} min). Stage 28 E, ADR 0091.`,
  '',
);
out.push('## Machine', '');
out.push(
  `- CPU: ${os.cpus()[0]?.model ?? '?'} (${os.cpus().length} threads); OS: ${os.type()} ${os.release()}`,
  `- Load average at the start / end: ${loadStart} / ${loadavg()}`,
  ...results.map((r) => `- ${r.name}: ${r.version}; WebGL: ${r.gl}`),
  `- Geometry: ${L.geometryText(OWNER)}, production bundle, Map pane off`,
  `- Fixture: \`${fixture.rel}\` (${(fixture.size / 1e6).toFixed(2)} MB)`,
  `- On: weather pinned to ${JSON.stringify(HEAVY)} (heavy rain with drips, dense fog, dying: blood and the red heartbeat wash, moonlit night), 9 s to ease in; canvases at ratio 1, the worker at its own rates (30 fps while rain falls, ADR 0091 Power)`,
  `- ${ROUNDS} rounds per browser, off and on alternating; each cell is the median over the rounds of that round's statistic (max: the largest of any round)`,
  '',
);
out.push('## Results', '');
const head = ['Measure', ...results.flatMap((r) => [`${r.name} off`, `${r.name} on`])];
out.push(`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`);
const row = (label: string, f: (xs: Sample[]) => string) => out.push(`| ${label} | ${results.flatMap((r) => [f(r.off), f(r.on)]).join(' | ')} |`);
row('Key → send, median / p99 (ms)', (xs) => `${f3(med(xs, (s) => s.key.median))} / ${f3(med(xs, (s) => s.key.p99))}`);
row('Key → send, max (ms)', (xs) => f3(mx(xs, (s) => s.key.max)));
row('Text → painted, median / p95 (ms)', (xs) => `${f1(med(xs, (s) => s.paint.median))} / ${f1(med(xs, (s) => s.paint.p95))}`);
row('Text → painted, max (ms)', (xs) => f1(mx(xs, (s) => s.paint.max)));
row('Output flush script, median (ms)', (xs) => f2(med(xs, (s) => s.paint.flush)));
row('rAF gap p95 / max (ms); gaps > 50 ms', (xs) => `${f1(med(xs, (s) => s.gaps.p95))} / ${f1(mx(xs, (s) => s.gaps.max))}; ${xs.reduce((a, s) => a + s.gaps.over50, 0)}`);
row('Long tasks ≥ 50 ms during paint (all rounds)', (xs) => (xs[0]?.long.ltOk ? String(xs.reduce((a, s) => a + s.long.longtask.length, 0)) : 'n/a'));
row('Long Animation Frames, count; longest (ms)', (xs) =>
  xs[0]?.long.loafOk ? `${xs.reduce((a, s) => a + s.long.loaf.length, 0)}; ${xs.some((s) => s.long.loaf.length) ? f1(mx(xs, (s) => max(s.long.loaf))) : '—'}` : 'n/a',
);
row('Idle 5 s, main-thread tasks; total (ms)', (xs) => (xs[0]?.idle ? `${f1(med(xs, (s) => s.idle!.tasks))}; ${f1(med(xs, (s) => s.idle!.totalMs))}` : 'n/a'));
row('Idle 5 s, longest main-thread task (ms); tasks > 5 ms', (xs) => (xs[0]?.idle ? `${f2(mx(xs, (s) => s.idle!.longest))}; ${xs.reduce((a, s) => a + s.idle!.over5, 0)}` : 'n/a'));
row('Worker frame avg / p95 / max (ms)', (xs) => (xs[0]?.worker ? `${f2(med(xs, (s) => s.worker!.avg))} / ${f2(med(xs, (s) => s.worker!.p95))} / ${f1(mx(xs, (s) => s.worker!.max))}` : '—'));
row('Worker frames per second', (xs) => (xs[0]?.worker ? f1(med(xs, (s) => s.worker!.fps)) : '—'));
out.push('');
out.push('## Per round', '');
for (const r of results) {
  for (const [v, xs] of [['off', r.off], ['on', r.on]] as const) {
    xs.forEach((s, i) =>
      out.push(
        `- ${r.name} ${v} #${i + 1} (load ${s.load}): key ${f3(s.key.median)} / ${f3(s.key.p99)} / ${f3(s.key.max)}; painted ${f1(s.paint.median)} / ${f1(s.paint.p95)} / ${f1(s.paint.max)}; gaps max ${f1(s.gaps.max)}` +
          (s.idle ? `; idle ${s.idle.tasks} tasks, ${f1(s.idle.totalMs)} ms, longest ${f2(s.idle.longest)}` : '') +
          (s.worker ? `; worker ${f2(s.worker.avg)} / ${f2(s.worker.p95)} / ${f1(s.worker.max)} (${s.worker.n} frames, ${f1(s.worker.fps)} fps)` : ''),
      ),
    );
  }
}
out.push('');
out.push('## Method', '');
out.push(
  '- **Key → send:** the `?bench` probe sets the input to `look`, dispatches a synthetic Enter keydown and reads when `Socketish.send` ran (same as `browser-bench.ts`).',
  '- **Text → painted:** a telnet frame of the fixture is delivered through the fake socket; the time until a MessageChannel message posted from the output pane\'s frame callback arrives, i.e. after that frame rendered. The medians include the wait for the next vsync.',
  '- **Idle main thread:** a Chromium DevTools trace over 5 s with nothing arriving; `RunTask` events on the renderer main thread. With the effects on, the main thread only samples the text lines every 2.5 s in an idle callback; the drawing is in the worker.',
  '- **Worker:** the engine\'s own frame times over its last ≤ 600 frames (`stats()`); fps over the whole measurement.',
  '',
);
mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
writeFileSync(OUT, out.join('\n'));
console.log(`\nweather-bench: wrote ${OUT}`);
