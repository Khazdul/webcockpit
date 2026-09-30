// Area B perf harness, Node side: per-line / per-byte cost of the ingest
// pipeline (telnet → assembler → bus → engine + system rules → recorder →
// output enqueue), stage by stage, from the owner's Cockpit logs.
//
//   perf/run-node.sh node-ingest [--rounds 7] [--scenarios big,repro,...]
//
// Every scenario runs the cumulative configurations of perf/pipeline.ts
// (CONFIGS) interleaved round by round (A B C … A B C …), each round on a
// freshly built pipeline that has reached `playing` (the recorder
// captures). Only `feed(frame)` is timed (process.hrtime per frame); the
// output queue and the recorder buffer are cleared between frames, as a
// frame flush / chunk write would. GC entries are attributed to the run in
// which they started.

import { readFileSync, writeFileSync } from 'node:fs';
import { PerformanceObserver } from 'node:perf_hooks';
import { CONFIGS, FULL, type Config, buildPipeline, capFrames, census, serverFrames, withGmcp } from './pipeline';
import { variant } from './variants';

const argv = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const ROUNDS = Number(opt('--rounds') ?? 7);
const WARM = Number(opt('--warm') ?? 2);
const ONLY = opt('--scenarios')?.split(',') ?? null;
// --variant base (default: the committed code, perf/base) | p1 | p12 | p123 | p1234 (perf/variants.ts)
const VARIANT = variant(opt('--variant'));
const OUT = opt('--out') ?? '/tmp/claude-1000/-home-ole-proj-webcockpit/839d0ad2-3f20-4e68-a808-1e236720a92c/scratchpad/perf/B/node-ingest.json';

const RUNS = process.env.WEBCOCKPIT_FIXTURES ?? '/home/ole/MUME/data/runs';
const bigLog = readFileSync(`${RUNS}/Rasta/2026-09-18T18-11-42.log`, 'utf8');
// The owner's repro: `help 24-bit colours` (log lines 226–364).
const reproLog = readFileSync(`${RUNS}/Rasta/2026-09-30T00-11-08.log`, 'utf8').split('\n').slice(225, 364).join('\n') + '\n';
const fixtures = `${process.cwd()}/tests/fixtures/`;
const gmcpLog = readFileSync(`${fixtures}map-demo.log`, 'utf8') + readFileSync(`${fixtures}gmcp-demo.log`, 'utf8');

const repeat = <T>(xs: T[], n: number): T[] => Array.from({ length: n }, () => xs).flat();

interface Scenario {
  name: string;
  what: string;
  frames: Uint8Array[];
  configs: Config[];
}

const ASM = CONFIGS[1]!;
const bigServer = serverFrames(bigLog);
const reproServer = serverFrames(reproLog);
const bigGmcp = withGmcp(bigLog, gmcpLog, 10);
const scenarios: Scenario[] = [
  { name: 'big', what: 'Rasta 2026-09-18 (4.7 MB), server-write frames', frames: bigServer, configs: CONFIGS },
  { name: 'repro', what: 'help 24-bit colours ×40, server-write frames', frames: repeat(reproServer, 40), configs: CONFIGS },
  { name: 'big-gmcp', what: 'big + a GMCP message after every 10 lines', frames: serverFrames(bigGmcp.text), configs: [ASM, FULL] },
  { name: 'big-1460', what: 'big, frames cut at 1460 bytes (mid-line splits)', frames: capFrames(bigServer, 1460), configs: [ASM, FULL] },
  { name: 'repro-1460', what: 'repro ×40, frames cut at 1460 bytes', frames: repeat(capFrames(reproServer, 1460), 40), configs: [ASM, FULL] },
].filter((s) => !ONLY || ONLY.includes(s.name));

// ------------------------------------------------------------------ GC

interface GcEntry {
  start: number;
  dur: number;
  kind: number;
}
const gcs: GcEntry[] = [];
const obs = new PerformanceObserver((list) => {
  for (const e of list.getEntries()) {
    const d = (e as unknown as { detail?: { kind?: number } }).detail;
    gcs.push({ start: e.startTime, dur: e.duration, kind: d?.kind ?? 0 });
  }
});
obs.observe({ entryTypes: ['gc'] });

// ------------------------------------------------------------------ run

interface RunResult {
  total: number;
  frames: Float64Array;
  from: number;
  to: number;
}

function runOnce(cfg: Config, frames: Uint8Array[]): RunResult {
  const p = buildPipeline(cfg, VARIANT);
  const times = new Float64Array(frames.length);
  const from = performance.now();
  let total = 0;
  for (let i = 0; i < frames.length; i++) {
    const t0 = process.hrtime.bigint();
    p.feed(frames[i]!);
    const dt = Number(process.hrtime.bigint() - t0) / 1e6;
    times[i] = dt;
    total += dt;
    p.settle();
  }
  const to = performance.now();
  p.dispose();
  return { total, frames: times, from, to };
}

const pct = (xs: ArrayLike<number>, p: number): number => {
  const s = Array.from(xs).sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
};

const loadavg = (): string => readFileSync('/proc/loadavg', 'utf8').trim();

console.log(`variant ${VARIANT.name}`);
const report: Record<string, unknown> = { node: process.version, variant: VARIANT.name, rounds: ROUNDS, warm: WARM, loadStart: loadavg(), scenarios: [] };

for (const sc of scenarios) {
  const c = census(sc.frames);
  console.log(
    `\n== ${sc.name}: ${sc.what}\n   ${sc.frames.length} frames, ${c.lines} lines, ${c.partials} partials, ${c.gmcp} GMCP, ${(c.bytes / 1e6).toFixed(2)} MB, ${c.chars} text chars, ${c.sgr} style runs; load ${loadavg()}`,
  );
  const results = new Map<string, RunResult[]>();
  for (const cfg of sc.configs) results.set(cfg.name, []);
  for (let r = 0; r < WARM + ROUNDS; r++) {
    for (const cfg of sc.configs) {
      const res = runOnce(cfg, sc.frames);
      if (r >= WARM) results.get(cfg.name)!.push(res);
      // Let the GC observer deliver (it drops entries when they pile up).
      await new Promise((ok) => setTimeout(ok, 5));
    }
  }
  await new Promise((r) => setTimeout(r, 50)); // let the GC observer deliver
  const rows: Record<string, unknown>[] = [];
  let prev: number | null = null;
  for (const cfg of sc.configs) {
    const rs = results.get(cfg.name)!;
    const totals = rs.map((x) => x.total);
    const med = pct(totals, 50);
    const all = new Float64Array(rs.reduce((n, x) => n + x.frames.length, 0));
    let o = 0;
    for (const x of rs) {
      all.set(x.frames, o);
      o += x.frames.length;
    }
    let gcN = 0;
    let gcMs = 0;
    let gcMax = 0;
    for (const x of rs) {
      for (const g of gcs) {
        if (g.start >= x.from && g.start <= x.to) {
          gcN++;
          gcMs += g.dur;
          if (g.dur > gcMax) gcMax = g.dur;
        }
      }
    }
    const usLine = (med / c.lines) * 1000;
    const row = {
      config: cfg.name,
      totalMsMedian: +med.toFixed(2),
      totalMsMin: +Math.min(...totals).toFixed(2),
      totalMsMax: +Math.max(...totals).toFixed(2),
      usPerLine: +usLine.toFixed(3),
      stageUsPerLine: prev === null ? null : +(usLine - prev).toFixed(3),
      usPerKB: +((med / (c.bytes / 1024)) * 1000).toFixed(2),
      frameUsP50: +(pct(all, 50) * 1000).toFixed(1),
      frameUsP95: +(pct(all, 95) * 1000).toFixed(1),
      frameUsMax: +(all.reduce((m, x) => (x > m ? x : m), 0) * 1000).toFixed(1),
      gcPerRun: +(gcN / rs.length).toFixed(1),
      gcMsPerRun: +(gcMs / rs.length).toFixed(2),
      gcMaxMs: +gcMax.toFixed(2),
    };
    prev = usLine;
    rows.push(row);
  }
  console.table(rows);
  (report.scenarios as unknown[]).push({ ...sc, frames: undefined, configs: sc.configs.map((x) => x.name), census: c, rows });
}
report.loadEnd = loadavg();
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`\nwrote ${OUT}; load ${loadavg()}`);
obs.disconnect();
