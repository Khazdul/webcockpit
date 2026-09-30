// Area B perf harness, Node side: interleaved A/B of prototype changes in
// one process (A B A B …, fresh pipeline each run, full configuration).
//
//   perf/run-node.sh node-ab [--rounds 9] [--warm 2] [--scenarios big,repro] [--variants base,exp]
//
// Variants (perf/variants.ts): base, p1, p12, p123, p1234 — explicit
// copies, independent of src/. Paired differences are per round.

import { readFileSync, writeFileSync } from 'node:fs';
import { PerformanceObserver } from 'node:perf_hooks';
import { CONFIGS, FULL, type Config, type Variant, buildPipeline, capFrames, census, serverFrames, withGmcp } from './pipeline';
import { xmlFrames } from './xml-mode';
import { makeRuleProfile } from '../bench/rules';
import { KHAZDUL } from './pipeline';
import { VARIANTS } from './variants';

const argv = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const ROUNDS = Number(opt('--rounds') ?? 9);
const WARM = Number(opt('--warm') ?? 2);
const ONLY = opt('--scenarios')?.split(',') ?? null;
const CFG: Config = CONFIGS.find((c) => c.name === (opt('--config') ?? FULL.name)) ?? FULL;
const OUT = opt('--out') ?? '/tmp/claude-1000/-home-ole-proj-webcockpit/839d0ad2-3f20-4e68-a808-1e236720a92c/scratchpad/perf/B/node-ab.json';

const ALL_VARIANTS: Variant[] = VARIANTS;
const VNAMES = opt('--variants')?.split(',') ?? ALL_VARIANTS.map((v) => v.name);
const variants = ALL_VARIANTS.filter((v) => VNAMES.includes(v.name));

const RUNS = process.env.WEBCOCKPIT_FIXTURES ?? '/home/ole/MUME/data/runs';
const bigLog = readFileSync(`${RUNS}/Rasta/2026-09-18T18-11-42.log`, 'utf8');
const reproLog = readFileSync(`${RUNS}/Rasta/2026-09-30T00-11-08.log`, 'utf8').split('\n').slice(225, 364).join('\n') + '\n';
const fixtures = `${process.cwd()}/tests/fixtures/`;
const gmcpLog = readFileSync(`${fixtures}map-demo.log`, 'utf8') + readFileSync(`${fixtures}gmcp-demo.log`, 'utf8');
const repeat = <T>(xs: T[], n: number): T[] => Array.from({ length: n }, () => xs).flat();

const bigServer = serverFrames(bigLog);
const reproServer = serverFrames(reproLog);
const scenarios = [
  { name: 'big', frames: bigServer },
  { name: 'repro', frames: repeat(reproServer, 40) },
  { name: 'repro-1460', frames: repeat(capFrames(reproServer, 1460), 40) },
  { name: 'big-gmcp', frames: serverFrames(withGmcp(bigLog, gmcpLog, 10).text) },
  { name: 'big-xml', frames: xmlFrames(bigLog) },
  { name: 'big-500', frames: bigServer, profile: 'rules500' },
].filter((s) => !ONLY || ONLY.includes(s.name));

const gcs: Array<{ start: number; dur: number }> = [];
const obs = new PerformanceObserver((list) => {
  for (const e of list.getEntries()) gcs.push({ start: e.startTime, dur: e.duration });
});
obs.observe({ entryTypes: ['gc'] });

const RULES500 = makeRuleProfile(bigLog.split('\n').map((l) => l.slice(l.indexOf(' ') + 1).replace(/\x1b\[[0-9;]*m/g, '')));
function runOnce(v: Variant, frames: Uint8Array[], profile?: string): { total: number; frames: Float64Array; from: number; to: number } {
  const p = buildPipeline(CFG, v, profile === 'rules500' ? RULES500 + KHAZDUL : KHAZDUL);
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

const report: Record<string, unknown> = { node: process.version, config: CFG.name, rounds: ROUNDS, variants: variants.map((v) => v.name), load: [loadavg()], scenarios: [] };
for (const sc of scenarios) {
  const c = census(sc.frames);
  console.log(`\n== ${sc.name}: ${sc.frames.length} frames, ${c.lines} lines, ${(c.bytes / 1e6).toFixed(2)} MB; config ${CFG.name}; load ${loadavg()}`);
  const res = new Map<string, ReturnType<typeof runOnce>[]>(variants.map((v) => [v.name, []]));
  for (let r = 0; r < WARM + ROUNDS; r++) {
    // Alternate the order every round (A B, B A, …).
    const order = r % 2 === 0 ? variants : [...variants].reverse();
    for (const v of order) {
      const x = runOnce(v, sc.frames, (sc as { profile?: string }).profile);
      if (r >= WARM) res.get(v.name)!.push(x);
      await new Promise((ok) => setTimeout(ok, 5));
    }
  }
  await new Promise((ok) => setTimeout(ok, 50));
  const rows = [];
  for (const v of variants) {
    const rs = res.get(v.name)!;
    const totals = rs.map((x) => x.total);
    let gcN = 0;
    let gcMs = 0;
    let gcMax = 0;
    let fMax = 0;
    const all: number[] = [];
    for (const x of rs) {
      for (const g of gcs) if (g.start >= x.from && g.start <= x.to) (gcN++, (gcMs += g.dur), (gcMax = Math.max(gcMax, g.dur)));
      for (const f of x.frames) {
        all.push(f);
        if (f > fMax) fMax = f;
      }
    }
    rows.push({
      variant: v.name,
      msMedian: +pct(totals, 50).toFixed(2),
      msMin: +Math.min(...totals).toFixed(2),
      msMax: +Math.max(...totals).toFixed(2),
      usPerLine: +((pct(totals, 50) / c.lines) * 1000).toFixed(3),
      frameUsP95: +(pct(all, 95) * 1000).toFixed(1),
      frameUsP99: +(pct(all, 99) * 1000).toFixed(1),
      frameMsMax: +fMax.toFixed(2),
      gcPerRun: +(gcN / rs.length).toFixed(1),
      gcMsPerRun: +(gcMs / rs.length).toFixed(2),
      gcMaxMs: +gcMax.toFixed(2),
    });
  }
  console.table(rows);
  // Paired per-round ratios against the first variant.
  const a = res.get(variants[0]!.name)!;
  for (const v of variants.slice(1)) {
    const b = res.get(v.name)!;
    const ratios = a.map((x, i) => b[i]!.total / x.total);
    console.log(`   ${v.name}/${variants[0]!.name}: median ratio ${pct(ratios, 50).toFixed(3)} (min ${Math.min(...ratios).toFixed(3)}, max ${Math.max(...ratios).toFixed(3)})`);
  }
  (report.scenarios as unknown[]).push({ name: sc.name, census: c, rows });
}
(report.load as string[]).push(loadavg());
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`\nwrote ${OUT}; load ${loadavg()}`);
obs.disconnect();
