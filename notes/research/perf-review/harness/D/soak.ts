// Soak test (perf review D, long sessions).
//
//   node perf/soak.ts --browser chromium|firefox [--loops 3] [--speed 30]
//        [--port 4231] [--out <file.json>] [--no-build] [--no-map]
//        [--sample 20] [--instrument] [--trace] [--memdump] [--snapshots]
//   node perf/soak-report.ts <out.json>          (the summary tables)
//
// Runs used in the review (≈ 20 min each):
//   Firefox:  node perf/soak.ts --browser firefox --instrument
//   Chromium: node perf/soak.ts --browser chromium --trace --memdump --instrument
//   Chromium heap snapshots (composition only; they slow later GCs, so not
//   for timing): node perf/soak.ts --browser chromium --snapshots
//
// --instrument  perf/instrument.js as init script: live timers, intervals,
//               global listeners, IndexedDB transactions, Web Storage writes
// --trace       Chromium: one DevTools trace window per loop (GC pauses,
//               style/layout/paint; --trace-gc misses unified-heap major GCs)
// --memdump     Chromium: memory-infra dump at each checkpoint (blink_gc,
//               partition_alloc, v8, cc … of the renderer), before/after GC
// --snapshots   Chromium: heap snapshots at the first and last checkpoint
//
// Builds the production bundle (unless --no-build), generates the soak data
// (perf/soak-gen.ts → dist/__soak), serves dist/ with `vite preview`
// (cross-origin isolated, like the bench), and drives `?bench` headless at
// DPR 2 in a 1728 × 1050 window (the owner's full-screen window):
//
// - profile `khazdul` selected, the fake socket connected, `offline` off
//   (so script variables are written back as in live play), all panes on
//   (the new-user default, incl. the map);
// - the owner's three biggest logs are played back to back as one
//   connection (GMCP synthesized, perf/soak-gen.ts), at `speed`× log time;
//   their commands are typed (Enter keydown on the input);
// - every `sample` s: counters (rows, DOM elements, bus handlers, histories,
//   flush and key → send stats, rAF gaps), Chromium Performance.getMetrics
//   (JS heap, nodes, listeners, layout/style counts and time), RSS per
//   process type (/proc);
// - checkpoints (after the scrollback is full, then after each loop):
//   playback paused, drained, forced GC (Chromium), DOM counters, heap
//   usage, IndexedDB counts, the probe (std frames, 24-bit colour block,
//   2000-line burst, key → send, 5 s idle), optional heap snapshots
//   (--snapshots, Chromium: first and last checkpoint);
// - GC pauses: Chromium `--js-flags=--trace-gc`, Firefox JS_GC_PROFILE /
//   JS_GC_PROFILE_NURSERY, parsed from the browser's stdout/stderr.
//
// Writes <out> (JSON) and prints a summary.

import { readFileSync, writeFileSync, createWriteStream, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';

const args = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1]!.startsWith('--') ? args[i + 1]! : def;
};
const flag = (name: string): boolean => args.includes(`--${name}`);
const BROWSER = opt('browser', 'chromium');
const LOOPS = Number(opt('loops', '3'));
const SPEED = Number(opt('speed', '30'));
const PORT = Number(opt('port', '4231'));
const SAMPLE_S = Number(opt('sample', '20'));
const SCRATCH = '/tmp/claude-1000/-home-ole-proj-webcockpit/839d0ad2-3f20-4e68-a808-1e236720a92c/scratchpad/perf/D';
mkdirSync(SCRATCH, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const OUT = opt('out', `${SCRATCH}/soak-${BROWSER}-${stamp}.json`);
const SNAPSHOTS = flag('snapshots');
const MEMDUMP = flag('memdump');
const { memoryDump } = await import('./memdump.ts');
const NO_MAP = flag('no-map');
const root = new URL('..', import.meta.url).pathname;

const loadavg = (): string => readFileSync('/proc/loadavg', 'utf8').trim();
const log = (...a: unknown[]): void => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

if (!flag('no-build')) {
  log('build…');
  execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'ignore' });
}
if (!existsSync(`${root}dist/__soak/loop0.bin`) || !flag('no-build')) {
  log('soak data…');
  execFileSync('node', ['perf/soak-gen.ts'], { cwd: root, stdio: 'inherit' });
}

const { chromium, firefox } = await import('@playwright/test');
const { preview } = await import('vite');
const server = await preview({ root, preview: { port: PORT, strictPort: true }, logLevel: 'warn' });
const base = `http://localhost:${PORT}`;

// ------------------------------------------------------------ processes

function procTree(rootPid: number): Array<{ pid: number; cmd: string }> {
  const kids = new Map<number, number[]>();
  for (const d of readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const st = readFileSync(`/proc/${d}/stat`, 'utf8');
      const ppid = Number(st.slice(st.lastIndexOf(')') + 2).split(' ')[1]);
      (kids.get(ppid) ?? kids.set(ppid, []).get(ppid)!).push(Number(d));
    } catch {
      /* gone */
    }
  }
  const out: Array<{ pid: number; cmd: string }> = [];
  const walk = (p: number): void => {
    let cmd = '';
    try {
      cmd = readFileSync(`/proc/${p}/cmdline`, 'utf8').replace(/\0/g, ' ');
    } catch {
      return;
    }
    out.push({ pid: p, cmd });
    for (const k of kids.get(p) ?? []) walk(k);
  };
  walk(rootPid);
  return out;
}

function rssKb(pid: number): number {
  try {
    const m = /VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`, 'utf8'));
    return m ? Number(m[1]) : 0;
  } catch {
    return 0;
  }
}

function kindOf(cmd: string): string {
  if (BROWSER === 'chromium') {
    const m = /--type=([a-z-]+)/.exec(cmd);
    if (!m) return 'browser';
    if (m[1] === 'utility') return /NetworkService/.test(cmd) ? 'network' : 'utility';
    return m[1]!;
  }
  if (!/-contentproc/.test(cmd)) return 'parent';
  if (/webIsolated=http:\/\/localhost/.test(cmd) || / tab$/.test(cmd.trim())) return 'content';
  const m = / (\w+)$/.exec(cmd.trim());
  return m ? m[1]! : 'child';
}

// ------------------------------------------------------------- browser

const isChromium = BROWSER === 'chromium';
const gcLines: Array<{ t: number; phase: string; line: string }> = [];
let phase = 'setup';
const serverB = isChromium
  ? await chromium.launchServer({
      args: ['--enable-precise-memory-info', '--js-flags=--trace-gc', '--enable-gpu', '--use-angle=vulkan'],
    })
  : await firefox.launchServer({
      firefoxUserPrefs: { 'layout.css.devPixelsPerPx': '2' },
      env: { ...process.env, JS_GC_PROFILE: '0', JS_GC_PROFILE_NURSERY: '1' },
    });
const bproc = serverB.process();
const t0 = Date.now();
const carry: Record<string, string> = { out: '', err: '' };
const onOutOf = (which: 'out' | 'err') => (d: Buffer): void => {
  const parts = (carry[which] + d.toString()).split('\n');
  carry[which] = parts.pop() ?? '';
  onLines(parts);
};
const onLines = (lines: string[]): void => {
  for (const line of lines) {
    if (isChromium ? /ms: (Scavenge|Mark-Compact|Minor|Mark-Sweep)/.test(line) : /^(MajorGC|MinorGC):/.test(line)) {
      gcLines.push({ t: Date.now() - t0, phase, line });
    }
  }
};
bproc.stdout?.on('data', onOutOf('out'));
bproc.stderr?.on('data', onOutOf('err'));
const browser = await (isChromium ? chromium : firefox).connect(serverB.wsEndpoint());
const version = browser.version();
const ctx = await browser.newContext({ viewport: { width: 1728, height: 1050 }, ...(isChromium ? { deviceScaleFactor: 2 } : {}) });
const INSTRUMENT = flag('instrument');
if (INSTRUMENT) await ctx.addInitScript({ path: new URL('./instrument.js', import.meta.url).pathname });
const page = await ctx.newPage();
page.on('pageerror', (e) => log('pageerror:', e.message));
page.on('console', (m) => {
  if ((m.type() === 'error' || m.type() === 'warning') && !/downloadable font/.test(m.text())) log(`console.${m.type()}:`, m.text().slice(0, 300));
});
const cdp = isChromium ? await ctx.newCDPSession(page) : null;
if (cdp) {
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.enable');
}

await page.goto(`${base}/?bench`);
await page.waitForFunction(() => (window as any).__wcBench?.app != null);
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
log(`${BROWSER} ${version}; loadavg ${loadavg()}`);
for (const p of procTree(bproc.pid!)) log(`  proc ${p.pid} ${kindOf(p.cmd)}: ${p.cmd.slice(0, 60)} … ${p.cmd.slice(-80)}`);

// Profile khazdul (seeded on the first run), all panes on unless --no-map.
await page.waitForFunction(async () => {
  const B = (window as any).__wcBench;
  return B.app.profiles ? (await B.app.profiles.get('khazdul')) != null : false;
});
await page.evaluate((noMap) => {
  const B = (window as any).__wcBench;
  B.settings.update({ profile: 'khazdul' });
  if (noMap) B.settings.update({ panes: { map: { on: false } } });
}, NO_MAP);
await page.evaluate(readFileSync(new URL('./soak-page.js', import.meta.url), 'utf8'));
const loopInfo = [];
for (let k = 0; k < LOOPS; k++) loopInfo.push(await page.evaluate((k) => (window as any).__soak.load(k), k));
log('loops', JSON.stringify(loopInfo));
await page.evaluate(() => {
  const B = (window as any).__wcBench;
  B.connectFake();
  B.app.offline = false;
});
await page.waitForFunction(() => (window as any).__wcBench.app.writeBack?.target === 'khazdul', undefined, { timeout: 10000 });
if (!NO_MAP) {
  await page.waitForSelector('.wc-pane-map .wc-pane-content[data-map-state="loaded"]', { state: 'attached', timeout: 60000 }).catch(() => log('map did not load'));
}

// ------------------------------------------------------------- sampling

type Json = Record<string, unknown>;
const samples: Json[] = [];
const checkpoints: Json[] = [];

async function cdpMetrics(): Promise<Json | null> {
  if (!cdp) return null;
  const m = (await cdp.send('Performance.getMetrics')) as { metrics: Array<{ name: string; value: number }> };
  const o: Json = {};
  for (const x of m.metrics) {
    if (
      ['JSHeapUsedSize', 'JSHeapTotalSize', 'Nodes', 'JSEventListeners', 'Documents', 'LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration', 'Frames', 'LayoutObjects'].includes(x.name)
    )
      o[x.name] = x.value;
  }
  return o;
}

function rss(): Json {
  const o: Record<string, number> = {};
  for (const p of procTree(bproc.pid!)) {
    const k = kindOf(p.cmd);
    o[k] = (o[k] ?? 0) + rssKb(p.pid);
  }
  return o;
}

let sampling = true;
async function sampleOnce(tag: string): Promise<void> {
  const s = (await page.evaluate(() => (window as any).__soak.sample())) as Json;
  const pos = await page.evaluate(() => (window as any).__soak.pos ?? null);
  const inst = INSTRUMENT ? await page.evaluate(() => ({ counts: (window as any).__inst.counts(), io: (window as any).__inst.io() })) : null;
  samples.push({ tag, tS: (Date.now() - t0) / 1000, pos, load: loadavg(), cdp: await cdpMetrics(), rss: rss(), inst, ...s });
}
const sampler = (async () => {
  while (sampling) {
    await new Promise((r) => setTimeout(r, SAMPLE_S * 1000));
    if (!sampling) break;
    if (phase.startsWith('play')) await sampleOnce(phase).catch((e) => log('sample failed', String(e)));
  }
})();

async function snapshot(name: string): Promise<string | null> {
  if (!cdp) return null;
  const file = `${SCRATCH}/${name}.heapsnapshot`;
  const ws = createWriteStream(file);
  const onChunk = (p: { chunk: string }): void => void ws.write(p.chunk);
  cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false } as never);
  cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
  await new Promise<void>((r) => ws.end(r));
  return file;
}

// Firefox has no forced GC or heap breakdown reachable from Playwright
// (about:memory does not load in Playwright's Firefox): RSS of the content
// process, DOM counts and JS_GC_PROFILE are what it gets.

async function checkpoint(name: string, snap: boolean): Promise<void> {
  const was = phase;
  phase = 'probe:' + name;
  const c: Json = { name, tS: (Date.now() - t0) / 1000, load: loadavg() };
  await page.evaluate(() => (window as any).__wcBench.drained());
  c.pre = await page.evaluate(() => (window as any).__soak.sample());
  if (cdp) {
    c.cdpBeforeGc = await cdpMetrics();
    if (MEMDUMP) c.memBeforeGc = await memoryDump(cdp);
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('HeapProfiler.collectGarbage');
    c.heap = await cdp.send('Runtime.getHeapUsage');
    c.dom = await cdp.send('Memory.getDOMCounters');
    c.cdp = await cdpMetrics();
    if (MEMDUMP) c.mem = await memoryDump(cdp);
  }
  c.rss = rss();
  if (INSTRUMENT) c.inst = await page.evaluate(() => ({ counts: (window as any).__inst.counts(), io: (window as any).__inst.io() }));
  c.idb = await page.evaluate(() => (window as any).__soak.idb());
  c.probe = await page.evaluate(() => (window as any).__soak.probe({ idleMs: 5000 }));
  if (snap) c.snapshot = await snapshot(`${BROWSER}-${stamp}-${name}`);
  c.post = await page.evaluate(() => (window as any).__soak.sample());
  checkpoints.push(c);
  const p = c.probe as any;
  log(
    `checkpoint ${name}: rows ${(c.pre as any).rows}, elements ${(c.pre as any).elements}, bus ${(c.pre as any).bus}, history ${(c.pre as any).history}` +
      (cdp ? `, heap used ${((c.heap as any).usedSize / 1e6).toFixed(1)} MB, nodes ${(c.dom as any).nodes}, listeners ${(c.dom as any).jsEventListeners}` : '') +
      `, rss ${JSON.stringify(c.rss)}` +
      `; std flush med ${p.std.script.med.toFixed(2)} p95 ${p.std.script.p95.toFixed(2)}, frame med ${p.std.frame.med.toFixed(2)} p95 ${p.std.frame.p95.toFixed(2)}; rgb flush med ${p.rgb.script.med.toFixed(1)} frame ${p.rgb.frame.med.toFixed(1)}; burst ${p.burst.ms.toFixed(0)} ms gapMax ${p.burst.gapMax.toFixed(1)}; key med ${p.key.med.toFixed(3)} p99 ${p.key.p99.toFixed(3)}; idle gap max ${p.idle.max.toFixed(1)}; load ${c.load}`,
  );
  phase = was;
}

// ----------------------------------------------------------------- run

const runStart = Date.now();
// --trace (Chromium): one DevTools trace window per loop (40–55 % of it),
// summarised: GC pauses on the page's main thread (MajorGC, V8.GCFinalizeMC,
// CppGC.AtomicMark, MinorGC, CppGC sweeping steps), long tasks, and the
// style / layout / paint / rAF time. `--trace-gc` misses most of Chromium's
// unified-heap major GCs (they drop DOM garbage without a Mark-Compact line),
// so the traces are the authoritative GC source.
const TRACE = flag('trace') && isChromium;
const traces: Json[] = [];
async function summarizeTrace(buf: Buffer, name: string): Promise<Json> {
  const ev = (JSON.parse(buf.toString()) as { traceEvents: any[] }).traceEvents;
  const mains = ev.filter((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain').map((e) => `${e.pid}:${e.tid}`);
  // The page's main thread: the CrRendererMain with the most events.
  const count = new Map<string, number>();
  for (const e of ev) {
    const k = `${e.pid}:${e.tid}`;
    if (mains.includes(k)) count.set(k, (count.get(k) ?? 0) + 1);
  }
  const main = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const by = new Map<string, number[]>();
  let t0 = Infinity;
  let t1 = 0;
  for (const e of ev) {
    if (e.ph !== 'X' || `${e.pid}:${e.tid}` !== main) continue;
    t0 = Math.min(t0, e.ts);
    t1 = Math.max(t1, e.ts + (e.dur ?? 0));
    (by.get(e.name) ?? by.set(e.name, []).get(e.name)!).push((e.dur ?? 0) / 1000);
  }
  const st = (name: string): Json | null => {
    const v = by.get(name);
    if (!v?.length) return null;
    v.sort((a, b) => a - b);
    return { n: v.length, sum: +v.reduce((a, b) => a + b, 0).toFixed(1), p95: +v[Math.floor(v.length * 0.95)]!.toFixed(2), max: +v[v.length - 1]!.toFixed(2) };
  };
  const tasks = by.get('RunTask') ?? [];
  const out: Json = {
    name,
    seconds: +((t1 - t0) / 1e6).toFixed(1),
    majorGC: st('MajorGC'),
    finalizeMC: st('V8.GCFinalizeMC'),
    cppAtomicMark: st('CppGC.AtomicMark'),
    incrementalMark: st('V8.GC_MC_INCREMENTAL'),
    minorGC: st('MinorGC'),
    scavenger: st('V8.GCScavenger'),
    sweepStep: st('CppGC.IncrementalSweep'),
    sweepFinalize: st('CppGC.SweepFinalizeSweptPages'),
    style: st('UpdateLayoutTree'),
    layout: st('Layout'),
    paint: st('Paint'),
    prePaint: st('PrePaint'),
    raf: st('FireAnimationFrame'),
    tasks: { n: tasks.length, over16: tasks.filter((d) => d > 16).length, over33: tasks.filter((d) => d > 33).length, over50: tasks.filter((d) => d > 50).length, max: +Math.max(0, ...tasks).toFixed(1) },
  };
  return out;
}
async function playRange(k: number, from: number, to: number): Promise<void> {
  await page.evaluate(([k, s, f, t]) => (window as any).__soak.play(k, s, f, t), [k, SPEED, from, to]);
}
async function playLoop(k: number, from: number, n: number, fa = 0.4, fb = 0.55): Promise<void> {
  if (!TRACE) return playRange(k, from, n);
  const a = Math.max(from, Math.floor(n * fa));
  const b = Math.floor(n * fb);
  await playRange(k, from, a);
  await browser.startTracing(page, {
    categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8.gc', 'disabled-by-default-v8.gc', 'cppgc', 'blink_gc', 'toplevel'],
  });
  await playRange(k, a, b);
  const buf = await browser.stopTracing();
  const s = await summarizeTrace(buf, `loop${k} ${a}–${b}`);
  traces.push(s);
  log(`trace ${s.name}: ${JSON.stringify(s)}`);
  await playRange(k, b, n);
}

await sampleOnce('start');
await checkpoint('cp0-empty', false);
for (let k = 0; k < LOOPS; k++) {
  const n = (loopInfo[k] as { n: number }).n;
  phase = 'play' + k;
  if (k === 0) {
    // Fill the scrollback (~25 000 lines) first, then the first checkpoint.
    const cut = Math.floor(n * 0.3);
    log(`loop 0 to frame ${cut}…`);
    // (traced while the scrollback fills: frames 5–15 %, ~4 000–13 000 rows)
    await playLoop(0, 0, cut, 0.05 * (n / cut), 0.15 * (n / cut));
    await sampleOnce('cp');
    await checkpoint('cp1-full', SNAPSHOTS);
    log(`loop 0 rest…`);
    await playLoop(0, cut, n);
  } else {
    log(`loop ${k}…`);
    await playLoop(k, 0, n);
  }
  await sampleOnce('cp');
  await checkpoint(`cp${k + 2}-loop${k}`, SNAPSHOTS && k === LOOPS - 1);
}
sampling = false;
phase = 'done';
await sampler;
const runMs = Date.now() - runStart;

// Firefox: which PID is the page's content process (the one with the most
// major GC slices besides the parent)?
const result = {
  browser: BROWSER,
  version,
  speed: SPEED,
  loops: LOOPS,
  loopInfo,
  noMap: NO_MAP,
  machine: { cpu: os.cpus()[0]?.model, threads: os.cpus().length },
  runMs,
  samples,
  checkpoints,
  traces,
  gcLines,
};
writeFileSync(OUT, JSON.stringify(result));
log(`wrote ${OUT} (${samples.length} samples, ${checkpoints.length} checkpoints, ${gcLines.length} gc lines); run ${(runMs / 60000).toFixed(1)} min`);
await browser.close();
await serverB.close();
await new Promise<void>((r) => server.httpServer.close(() => r()));
