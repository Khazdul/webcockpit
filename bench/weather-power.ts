// Weather effects power bench (stage 28, owner feedback 4 "Heat", ADR 0091):
// what the effects cost the machine, not the page's latency (that is
// bench/weather-bench.ts).
//
//   node bench/weather-power.ts [--browsers chromium,firefox] [--rounds N] [--seconds S]
//                               [--scenes off,calm,heavy] [--headless] [--out file]
//
// Builds the app, serves the production bundle with `vite preview` and opens
// the `?bench` page at the owner's geometry (1728 × 1000, ratio 2), Map pane
// off, in a **headed** browser by default (a headless browser composites
// nothing, so it hides the GPU and compositor work). Scenes:
//
// - off:   weather effects off (the baseline);
// - calm:  a clear day sky (only slow things move);
// - heavy: heavy rain with drips, dense fog, moonlit night.
//
// Per scene and round, after SETTLE_MS to ease in, over S seconds:
// - CPU time of the browser's processes (utime + stime from /proc/<pid>/stat,
//   every process under this Node process except esbuild), as ms of CPU per
//   second (1000 = one core busy), total and per process type;
// - the worker's frame rate and average frame time (`stats()`);
// - RAPL package / core / uncore watts (whole machine: noisy, other load counts);
// - the Intel iGPU's busy share (100 % − RC6 residency) and the NVIDIA dGPU's
//   runtime-PM active time (whole machine as well).
// Off and the scenes rotate per round, so a noisy machine hits all alike;
// cells are medians over the rounds. Browsers of other processes running at
// the same time (another Playwright run) are flagged: they spoil the GPU and
// RAPL columns.
//
// Writes bench/results/weather-power.md.

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
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

const L = await import('./lib');
const { chromium, firefox } = await import('@playwright/test');
const { build, preview } = await import('vite');
type Target = import('./lib').Target;
type Page = import('@playwright/test').Page;
const { median, f1, f2, pause, loadavg, openBench, closePage, OWNER, glRenderer } = L;

const argv = process.argv.slice(2);
const opt = (name: string, env: string, def: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : (process.env[env] ?? def);
};
const ROUNDS = Number(opt('rounds', 'WC_BENCH_ROUNDS', '2'));
const SECONDS = Number(opt('seconds', 'WC_POWER_SECONDS', '15'));
const SETTLE_MS = Number(opt('settle', 'WC_POWER_SETTLE', '10000'));
const PORT = Number(opt('port', 'WC_BENCH_PORT', '4189'));
const HEADLESS = argv.includes('--headless');
const OUT = opt('out', 'WC_BENCH_OUT', new URL('./results/weather-power.md', import.meta.url).pathname);
const BROWSERS = opt('browsers', 'WC_BENCH_BROWSERS', 'chromium,firefox').split(',') as ('chromium' | 'firefox')[];

const SCENES: Record<string, Record<string, unknown> | null> = {
  off: null,
  calm: { weather: ' ', fog: '', position: 'standing', clock: 'day', moonUp: false, light: '' },
  heavy: { weather: '"', fog: '=', position: 'standing', clock: 'night', moonUp: true, light: '' },
};
const SCENE_NAMES = opt('scenes', 'WC_POWER_SCENES', 'off,calm,heavy').split(',').filter((s) => s in SCENES);

// ------------------------------------------------------------- counters

const TCK = 100; // CLK_TCK on Linux
const rd = (p: string): string | null => {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return null;
  }
};
interface Proc {
  pid: number;
  ppid: number;
  comm: string;
  ticks: number;
  cmd: string;
}
function procs(): Map<number, Proc> {
  const m = new Map<number, Proc>();
  for (const d of readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    const st = rd(`/proc/${d}/stat`);
    if (!st) continue;
    const r = st.lastIndexOf(')');
    const comm = st.slice(st.indexOf('(') + 1, r);
    const f = st.slice(r + 2).split(' ');
    m.set(Number(d), { pid: Number(d), ppid: Number(f[1]), comm, ticks: Number(f[11]) + Number(f[12]), cmd: '' });
  }
  return m;
}
/** Processes below this Node process (the browsers), with their type. */
function ours(all: Map<number, Proc>): Proc[] {
  const kids = new Map<number, number[]>();
  for (const p of all.values()) kids.set(p.ppid, [...(kids.get(p.ppid) ?? []), p.pid]);
  const out: Proc[] = [];
  const walk = (pid: number): void => {
    for (const k of kids.get(pid) ?? []) {
      const p = all.get(k)!;
      if (p.comm !== 'esbuild') {
        p.cmd = (rd(`/proc/${k}/cmdline`) ?? '').replace(/\0/g, ' ');
        out.push(p);
      }
      walk(k);
    }
  };
  walk(process.pid);
  return out;
}
function kind(p: Proc): string {
  const t = /--type=([\w-]+)/.exec(p.cmd)?.[1];
  if (t) return t === 'utility' ? 'utility' : t;
  const ff = /-contentproc .* (tab|gpu|rdd|socket|utility|forkserver)\s*$/.exec(p.cmd.trim() + ' ');
  if (ff) return ff[1]!;
  if (/-contentproc/.test(p.cmd)) return /-isForBrowser/.test(p.cmd) ? 'tab' : 'child';
  return 'main';
}
/** Browser processes on the machine that are not ours (another agent's Playwright run, the owner's own browser excluded). */
function foreign(all: Map<number, Proc>, mine: Set<number>): number {
  let n = 0;
  for (const p of all.values()) {
    if (mine.has(p.pid) || !/chrom|firefox|headless/i.test(p.comm)) continue;
    const cmd = rd(`/proc/${p.pid}/cmdline`) ?? '';
    if (cmd.includes('ms-playwright')) n++;
  }
  return n;
}
const num = (p: string): number => Number(rd(p)?.trim() ?? NaN);
const NV = '/sys/bus/pci/devices/0000:01:00.0/power/';
const IGPU_RC6 = '/sys/class/drm/card1/gt/gt0/rc6_residency_ms';
const RAPL = { pkg: '/sys/class/powercap/intel-rapl:0/energy_uj', core: '/sys/class/powercap/intel-rapl:0:0/energy_uj', uncore: '/sys/class/powercap/intel-rapl:0:1/energy_uj' };

interface Snap {
  t: number;
  byPid: Map<number, { ticks: number; kind: string }>;
  rapl: Record<keyof typeof RAPL, number>;
  rc6: number;
  nvActive: number;
}
function snap(): Snap {
  const all = procs();
  const byPid = new Map<number, { ticks: number; kind: string }>();
  for (const p of ours(all)) byPid.set(p.pid, { ticks: p.ticks, kind: kind(p) });
  return {
    t: performance.now(),
    byPid,
    rapl: { pkg: num(RAPL.pkg), core: num(RAPL.core), uncore: num(RAPL.uncore) },
    rc6: num(IGPU_RC6),
    nvActive: num(NV + 'runtime_active_time'),
  };
}

interface Sample {
  cpu: number; // ms CPU per s
  byKind: Record<string, number>;
  fps: number;
  frameMs: number;
  dpr: number;
  mods: Record<string, number>;
  watts: Record<keyof typeof RAPL, number>;
  igpuBusy: number; // %
  nvActive: number; // % of the window
  nvStates: string;
  foreign: number;
}

async function measure(t: Target, scene: string): Promise<Sample> {
  const state = SCENES[scene];
  const page: Page = await openBench(t, base, { settings: { panes: { map: { on: false } }, weather: { enabled: !!state } } });
  if (state) {
    const ok = await page.evaluate(async (s) => {
      const ctl = await window.__wcBench!.app!.weather?.settled();
      if (!ctl) return false;
      await ctl.engine.ready;
      ctl.pin(s as never);
      return true;
    }, state);
    if (!ok) throw new Error(`${t.name}: the weather effects did not start`);
  }
  await page.evaluate(() => window.__wcBench!.connectFake());
  await pause(SETTLE_MS);
  const stats = () => page.evaluate(() => window.__wcBench!.app!.weather?.controller?.engine.stats() ?? null);
  const s0 = state ? await stats() : null;
  const a = snap();
  const states = new Set<string>();
  let foreignMax = 0;
  const end = Date.now() + SECONDS * 1000;
  while (Date.now() < end) {
    states.add(rd(NV + 'runtime_status')?.trim() ?? '?');
    if (states.size < 4) foreignMax = Math.max(foreignMax, foreign(procs(), new Set(a.byPid.keys())));
    await pause(500);
  }
  const b = snap();
  const s1 = state ? await stats() : null;
  await closePage(page);
  const secs = (b.t - a.t) / 1000;
  const byKind: Record<string, number> = {};
  let cpu = 0;
  for (const [pid, v] of b.byPid) {
    const d = ((v.ticks - (a.byPid.get(pid)?.ticks ?? 0)) * (1000 / TCK)) / secs;
    byKind[v.kind] = (byKind[v.kind] ?? 0) + d;
    cpu += d;
  }
  const w = (k: keyof typeof RAPL) => (b.rapl[k] - a.rapl[k]) / 1e6 / secs;
  const frames = s0 && s1 ? s1.frames - s0.frames : 0;
  return {
    cpu,
    byKind,
    fps: frames / secs,
    frameMs: s1?.avg ?? 0,
    dpr: s1?.dpr ?? 0,
    mods: s1?.mods ?? {},
    watts: { pkg: w('pkg'), core: w('core'), uncore: w('uncore') },
    igpuBusy: 100 - ((b.rc6 - a.rc6) / (secs * 1000)) * 100,
    nvActive: ((b.nvActive - a.nvActive) / (secs * 1000)) * 100,
    nvStates: [...states].join('/'),
    foreign: foreignMax,
  };
}

async function launch(name: 'chromium' | 'firefox'): Promise<Target> {
  const g = OWNER;
  const browser =
    name === 'firefox'
      ? await firefox.launch({ headless: HEADLESS, firefoxUserPrefs: g.dpr !== 1 ? { 'layout.css.devPixelsPerPx': String(g.dpr) } : {} })
      : await chromium.launch({ headless: HEADLESS });
  return { name, browser, geometry: g, isChromium: name === 'chromium' };
}

// ------------------------------------------------------------------ main

console.log('weather-power: building…');
await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'warn' });
const base = (server.resolvedUrls?.local[0] ?? `http://localhost:${PORT}/`).replace(/\/$/, '');
const started = Date.now();
const loadStart = loadavg();
console.log(`weather-power: ${base}, ${HEADLESS ? 'headless' : 'headed'}, ${ROUNDS} rounds × ${SECONDS} s, scenes ${SCENE_NAMES.join(',')}, load ${loadStart}`);

interface Result {
  name: string;
  version: string;
  gl: string;
  scenes: Record<string, Sample[]>;
}
const results: Result[] = [];
for (const name of BROWSERS) {
  const t = await launch(name);
  const r: Result = { name, version: t.browser.version(), gl: await glRenderer(t.browser), scenes: {} };
  for (let i = 0; i < ROUNDS; i++) {
    const order = SCENE_NAMES.map((_, k) => SCENE_NAMES[(k + i) % SCENE_NAMES.length]!);
    for (const scene of order) {
      const s = await measure(t, scene);
      (r.scenes[scene] ??= []).push(s);
      console.log(
        `  ${name} round ${i + 1} ${scene.padEnd(5)}: cpu ${f1(s.cpu)} ms/s (${Object.entries(s.byKind)
          .filter(([, v]) => v >= 5)
          .map(([k, v]) => `${k} ${v.toFixed(0)}`)
          .join(', ')}), fps ${f1(s.fps)}, frame ${f2(s.frameMs)} ms @${s.dpr} (${Object.entries(s.mods).map(([k, v]) => `${k} ${f2(v)}`).join(' ')}), pkg ${f1(s.watts.pkg)} W, igpu ${f1(s.igpuBusy)} %, nv ${f1(s.nvActive)} % (${s.nvStates})` +
          (s.foreign ? `, ${s.foreign} foreign browser procs` : ''),
      );
    }
  }
  await t.browser.close();
  results.push(r);
}
await new Promise<void>((res) => server.httpServer.close(() => res()));

// ---------------------------------------------------------------- report

const med = (xs: Sample[], f: (s: Sample) => number) => median(xs.map(f));
const out: string[] = [];
out.push('# Weather effects: power', '');
out.push(
  `Generated by \`node bench/weather-power.ts${argv.length ? ' ' + argv.join(' ') : ''}\` on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC (${((Date.now() - started) / 60000).toFixed(1)} min). Stage 28, owner feedback 4, ADR 0091.`,
  '',
);
out.push('## Machine', '');
out.push(
  `- CPU: ${os.cpus()[0]?.model ?? '?'} (${os.cpus().length} threads); OS: ${os.type()} ${os.release()}`,
  `- Load average at the start / end: ${loadStart} / ${loadavg()}`,
  ...results.map((r) => `- ${r.name}: ${r.version}; WebGL: ${r.gl}`),
  `- ${HEADLESS ? 'Headless' : 'Headed'}, ${L.geometryText(OWNER)}, production bundle, Map pane off, fake connection idle`,
  `- Scenes: ${SCENE_NAMES.map((s) => `${s} ${SCENES[s] ? JSON.stringify(SCENES[s]) : '(effects off)'}`).join('; ')}`,
  `- ${ROUNDS} rounds, ${SECONDS} s per scene after ${SETTLE_MS / 1000} s to settle; cells are medians over the rounds`,
  '',
);
out.push('## Results', '');
const cols = results.flatMap((r) => SCENE_NAMES.map((s) => ({ r, s, xs: r.scenes[s] ?? [] })));
out.push(`| Measure | ${cols.map((c) => `${c.r.name} ${c.s}`).join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`);
const row = (label: string, f: (xs: Sample[], scene: string) => string) => out.push(`| ${label} | ${cols.map((c) => f(c.xs, c.s)).join(' | ')} |`);
row('Browser CPU, ms per s', (xs) => f1(med(xs, (s) => s.cpu)));
const kinds = [...new Set(results.flatMap((r) => Object.values(r.scenes).flatMap((xs) => xs.flatMap((s) => Object.keys(s.byKind)))))].sort();
for (const k of kinds) row(`… ${k}`, (xs) => f1(med(xs, (s) => s.byKind[k] ?? 0)));
row('Worker fps', (xs, sc) => (SCENES[sc] ? f1(med(xs, (s) => s.fps)) : '—'));
row('Worker frame avg (ms); ratio', (xs, sc) => (SCENES[sc] ? `${f2(med(xs, (s) => s.frameMs))}; ${xs[0]?.dpr ?? '—'}` : '—'));
row('RAPL package / core / uncore (W)', (xs) => `${f1(med(xs, (s) => s.watts.pkg))} / ${f1(med(xs, (s) => s.watts.core))} / ${f1(med(xs, (s) => s.watts.uncore))}`);
row('Intel iGPU busy (%)', (xs) => f1(med(xs, (s) => s.igpuBusy)));
row('NVIDIA active (% of window); states', (xs) => `${f1(med(xs, (s) => s.nvActive))}; ${[...new Set(xs.map((s) => s.nvStates))].join(', ')}`);
row('Foreign Playwright browser processes (max)', (xs) => String(Math.max(0, ...xs.map((s) => s.foreign))));
out.push('');
out.push('## Per round', '');
for (const r of results)
  for (const sc of SCENE_NAMES)
    (r.scenes[sc] ?? []).forEach((s, i) =>
      out.push(
        `- ${r.name} ${sc} #${i + 1}: cpu ${f1(s.cpu)} ms/s; fps ${f1(s.fps)}; frame ${f2(s.frameMs)} ms (${Object.entries(s.mods).map(([k, v]) => `${k} ${f2(v)}`).join(', ')}); pkg ${f1(s.watts.pkg)} W; igpu ${f1(s.igpuBusy)} %; nv ${f1(s.nvActive)} % (${s.nvStates})${s.foreign ? `; ${s.foreign} foreign` : ''}`,
      ),
    );
out.push('');
mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
writeFileSync(OUT, out.join('\n'));
console.log(`\nweather-power: wrote ${OUT}`);
