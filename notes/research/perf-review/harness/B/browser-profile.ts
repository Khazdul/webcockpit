// Area B perf harness, browser side: where the ingest time goes in the real
// app, by source module and function, in Chromium (CDP sampling profiler,
// 100 µs) and Firefox (Gecko profiler via MOZ_PROFILER_STARTUP, 0.1 ms),
// mapped through the source maps of an unminified build.
//
//   npx vite build --outDir dist-prof-base --minify false --sourcemap
//   node perf/browser-profile.ts --build dist-prof-base --browser chromium|firefox --scenario repro|big|big-gmcp
//
// One page (as perf/browser-ingest.ts sets it up), one warm-up round, one
// profiled round. Samples are split into ingest (the stack holds the
// socket's onData, src/net/session.ts), output flush (OutputPane.flush) and
// the rest; ingest samples are attributed to the first src/ frame from the
// leaf (natives called from it count for it).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, firefox } from '@playwright/test';
import { preview } from 'vite';
import { TraceMap } from '@jridgewell/trace-mapping';
import { LOGS, loadavg, openPage, runRound } from './browser-common.ts';
import { type CallFrame, type CpuProfile, type Where, analyzeCpu, makeMapper, stageOf, top } from './analyze.ts';

const argv = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const BUILD = opt('--build') ?? 'dist-prof-base';
const BROWSER = opt('--browser') ?? 'chromium';
const SCEN = opt('--scenario') ?? 'repro';
const PORT = Number(opt('--port') ?? 4213);
const SLICE = Number(opt('--slice') ?? 8);
const DIR = '/tmp/claude-1000/-home-ole-proj-webcockpit/839d0ad2-3f20-4e68-a808-1e236720a92c/scratchpad/perf/B';
const TAG = `${BROWSER}-${SCEN}-${BUILD}`;

const maps = new Map<string, TraceMap | null>();
const resolver = (url: string): TraceMap | null => {
  const m = /\/assets\/([^/?#]+\.js)/.exec(url);
  if (!m) return null;
  const key = m[1]!;
  if (!maps.has(key)) {
    const file = resolve(BUILD, 'assets', key + '.map');
    maps.set(key, existsSync(file) ? new TraceMap(readFileSync(file, 'utf8'), 'file://' + file) : null);
  }
  return maps.get(key)!;
};
const map = makeMapper(resolver);

const isIngest = (st: Where[]): boolean => st.some((w) => w.file === 'src/net/session.ts' && /onData/.test(w.fn));
const isFlush = (st: Where[]): boolean => st.some((w) => w.file === 'src/ui/output-pane.ts' && /^flush$/.test(w.fn));

const lines = LOGS[SCEN]!.lines * LOGS[SCEN]!.repeat;
const server = await preview({ preview: { port: PORT, strictPort: true }, build: { outDir: BUILD }, logLevel: 'warn' });
const base = `http://localhost:${PORT}`;
console.log(`${TAG}: ${lines} lines per round; load ${loadavg()}`);

function printAgg(label: string, agg: ReturnType<typeof analyzeCpu>, per: number, unit: string): void {
  console.log(`\n${label}: ${(agg.total / 1000).toFixed(1)} ms sampled`);
  console.table(top(agg.byStage, agg.total, 20, 1 / per).map((r) => ({ ...r, [unit]: r.value })).map(({ value: _v, ...r }) => r));
  console.table(top(agg.byFn, agg.total, 30, 1 / per).map((r) => ({ ...r, [unit]: r.value })).map(({ value: _v, ...r }) => r));
}

try {
  if (BROWSER === 'chromium') {
    const browser = await chromium.launch();
    const page = await openPage(browser, base, [SCEN]);
    await runRound(page, SCEN, SLICE);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
    await cdp.send('Profiler.start');
    const r = await runRound(page, SCEN, SLICE);
    const { profile } = (await cdp.send('Profiler.stop')) as unknown as { profile: CpuProfile };
    writeFileSync(`${DIR}/${TAG}.cpuprofile`, JSON.stringify(profile));
    await browser.close();
    console.log(`round: ingest ${r.ingest!.toFixed(1)} ms, flush script ${r.flushScript!.toFixed(1)} ms, wall ${r.wall!.toFixed(0)} ms; load ${loadavg()}`);
    const all = analyzeCpu(profile, map);
    console.log(`all samples: ${(all.total / 1000).toFixed(1)} ms busy; GC ${((all.special.get('(garbage collector)') ?? 0) / 1000).toFixed(1)} ms; program ${((all.special.get('(program)') ?? 0) / 1000).toFixed(1)} ms`);
    printAgg('INGEST (stack holds onData), µs per line', analyzeCpu(profile, map, isIngest), lines, 'usPerLine');
    const fl = analyzeCpu(profile, map, isFlush);
    console.log(`\nFLUSH (OutputPane.flush): ${(fl.total / 1000).toFixed(1)} ms sampled`);
  } else {
    const out = `${DIR}/${TAG}.gecko.json`;
    const browser = await firefox.launch({
      firefoxUserPrefs: { 'layout.css.devPixelsPerPx': '2' },
      env: {
        ...process.env,
        MOZ_PROFILER_STARTUP: '1',
        MOZ_PROFILER_SHUTDOWN: out,
        MOZ_PROFILER_STARTUP_INTERVAL: '0.1',
        MOZ_PROFILER_STARTUP_ENTRIES: '40000000',
        MOZ_PROFILER_STARTUP_FEATURES: process.env.GECKO_FEATURES ?? 'js',
        MOZ_PROFILER_STARTUP_FILTERS: 'GeckoMain',
      } as Record<string, string>,
    });
    const page = await openPage(browser, base, [SCEN]);
    await runRound(page, SCEN, SLICE);
    const r = await runRound(page, SCEN, SLICE);
    console.log(`round: ingest ${r.ingest!.toFixed(1)} ms, flush script ${r.flushScript!.toFixed(1)} ms, wall ${r.wall!.toFixed(0)} ms; load ${loadavg()}`);
    await browser.close();
    for (let k = 0; k < 50 && !existsSync(out); k++) await new Promise((ok) => setTimeout(ok, 200));
    analyzeGecko(JSON.parse(readFileSync(out, 'utf8')), r.epoch0!, r.epoch1!);
  }
} finally {
  await new Promise<void>((ok) => server.httpServer.close(() => ok()));
}

// -------------------------------------------------------------- Gecko

interface GThread {
  name: string;
  processType?: string;
  processName?: string;
  samples: { schema: Record<string, number>; data: unknown[][] };
  stackTable: { schema: Record<string, number>; data: number[][] };
  frameTable: { schema: Record<string, number>; data: unknown[][] };
  stringTable: string[];
}
interface GProfile {
  meta: { startTime: number; categories: Array<{ name: string }>; interval: number };
  threads: GThread[];
  processes?: GProfile[];
}

function analyzeGecko(root: GProfile, t0: number, t1: number): void {
  // Find the content process thread with the most samples inside the window.
  let best: { p: GProfile; t: GThread; n: number } | null = null;
  const page = `(http://localhost:${PORT}/assets/`;
  const visit = (p: GProfile): void => {
    for (const t of p.threads) {
      if (t.name !== 'GeckoMain' || !t.stringTable.some((x) => x.includes(page))) continue;
      const ti = t.samples.schema.time!;
      let n = 0;
      for (const row of t.samples.data) {
        const at = p.meta.startTime + (row[ti] as number);
        if (at >= t0 && at <= t1) n++;
      }
      if (!best || n > best.n) best = { p, t, n };
    }
    for (const c of p.processes ?? []) visit(c);
  };
  visit(root);
  if (!best) {
    console.log('no samples in window');
    return;
  }
  const { p, t } = best as { p: GProfile; t: GThread; n: number };
  const cats = p.meta.categories.map((c) => c.name);
  const S = t.samples.schema;
  const ST = t.stackTable.schema;
  const F = t.frameTable.schema;
  const LOC = /^(.*?) \((https?:\/\/[^)]*?):(\d+):(\d+)\)(?:\[\d+\])?$/;
  const frameWhere = new Map<number, Where | null>();
  const whereOf = (f: number): Where | null => {
    if (frameWhere.has(f)) return frameWhere.get(f)!;
    const loc = t.stringTable[t.frameTable.data[f]![F.location!] as number]!;
    const m = LOC.exec(loc);
    let w: Where | null = null;
    if (m) {
      const cf: CallFrame = { functionName: m[1]!, url: m[2]!, lineNumber: Number(m[3]) - 1, columnNumber: Number(m[4]) - 1 };
      w = map(cf);
    }
    frameWhere.set(f, w);
    return w;
  };
  const byStage = new Map<string, number>();
  const byFn = new Map<string, number>();
  const cls = new Map<string, number>();
  const leafCats = new Map<string, number>();
  let ingest = 0;
  const interval = p.meta.interval;
  for (const row of t.samples.data) {
    const at = p.meta.startTime + (row[S.time!] as number);
    if (at < t0 || at > t1) continue;
    const stack = row[S.stack!] as number | null;
    if (stack === null) continue;
    const frames: number[] = [];
    for (let s: number | null = stack; s !== null && s !== undefined; s = t.stackTable.data[s]![ST.prefix!] as number | null) frames.push(t.stackTable.data[s]![ST.frame!] as number);
    // A frame without a category inherits its caller's (raw Gecko format).
    let leafCat = '?';
    for (const f of frames) {
      const c = t.frameTable.data[f]![F.category!] as number | null | undefined;
      if (c !== null && c !== undefined) {
        leafCat = cats[c] ?? '?';
        break;
      }
    }
    const ws = frames.map(whereOf);
    const known = ws.filter((w): w is Where => w !== null);
    const kind = isIngest(known) ? 'ingest' : isFlush(known) ? 'flush' : leafCat === 'Idle' ? 'idle' : 'other';
    cls.set(kind, (cls.get(kind) ?? 0) + interval);
    if (kind === 'other') leafCats.set(leafCat, (leafCats.get(leafCat) ?? 0) + interval);
    if (kind !== 'ingest') continue;
    ingest += interval;
    const first = known.find((w) => w.file.startsWith('src/'));
    const stage = leafCat === 'GC / CC' ? 'GC / CC' : first ? stageOf(first.file) : `(${leafCat})`;
    const fn = leafCat === 'GC / CC' ? 'GC / CC' : first ? `${first.fn} (${first.file}:${first.line})` : `(${leafCat})`;
    byStage.set(stage, (byStage.get(stage) ?? 0) + interval);
    byFn.set(fn, (byFn.get(fn) ?? 0) + interval);
  }
  console.log(`\nFirefox samples in the round (ms): ${JSON.stringify(Object.fromEntries([...cls].map(([k, v]) => [k, +v.toFixed(1)])))}`);
  console.log(`other, by leaf category (ms): ${JSON.stringify(Object.fromEntries([...leafCats].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +v.toFixed(1)])))}`);
  const per = lines / 1000;
  console.log(`\nINGEST (stack holds onData): ${ingest.toFixed(1)} ms sampled, µs per line:`);
  console.table(top(byStage, ingest, 20, 1 / per).map(({ name, value, pct }) => ({ name, usPerLine: value, pct })));
  console.table(top(byFn, ingest, 30, 1 / per).map(({ name, value, pct }) => ({ name, usPerLine: value, pct })));
}
