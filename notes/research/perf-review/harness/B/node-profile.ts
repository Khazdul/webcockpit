// Area B perf harness, Node side: where the time and the allocations of the
// full ingest pipeline go, by source module and function (V8 CPU profile
// and sampling heap profile through the inspector, mapped with the
// bundle's source map).
//
//   perf/run-node.sh node-profile [--scenario big|repro|big-gmcp] [--passes 3] [--interval 50]

import { Session } from 'node:inspector/promises';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TraceMap } from '@jridgewell/trace-mapping';
import { FULL, type Config, CONFIGS, buildPipeline, census, serverFrames, withGmcp, capFrames } from './pipeline';
import { type CpuProfile, type HeapNode, analyzeCpu, analyzeHeap, makeMapper, top } from './analyze';
import { variant } from './variants';

const argv = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const SCEN = opt('--scenario') ?? 'big';
const PASSES = Number(opt('--passes') ?? 3);
const INTERVAL = Number(opt('--interval') ?? 50);
const CFG: Config = CONFIGS.find((c) => c.name === (opt('--config') ?? FULL.name)) ?? FULL;
// --variant base (default: the committed code) | p1 | p12 | p123 | p1234 (perf/variants.ts)
const VARIANT = variant(opt('--variant'));
const OUTDIR = opt('--outdir') ?? '/tmp/claude-1000/-home-ole-proj-webcockpit/839d0ad2-3f20-4e68-a808-1e236720a92c/scratchpad/perf/B';

const RUNS = process.env.WEBCOCKPIT_FIXTURES ?? '/home/ole/MUME/data/runs';
const bigLog = readFileSync(`${RUNS}/Rasta/2026-09-18T18-11-42.log`, 'utf8');
const reproLog = readFileSync(`${RUNS}/Rasta/2026-09-30T00-11-08.log`, 'utf8').split('\n').slice(225, 364).join('\n') + '\n';
const fixtures = `${process.cwd()}/tests/fixtures/`;
const gmcpLog = readFileSync(`${fixtures}map-demo.log`, 'utf8') + readFileSync(`${fixtures}gmcp-demo.log`, 'utf8');
const repeat = <T>(xs: T[], n: number): T[] => Array.from({ length: n }, () => xs).flat();

const frames: Uint8Array[] =
  SCEN === 'repro'
    ? repeat(serverFrames(reproLog), 40)
    : SCEN === 'repro-1460'
      ? repeat(capFrames(serverFrames(reproLog), 1460), 40)
      : SCEN === 'big-gmcp'
        ? serverFrames(withGmcp(bigLog, gmcpLog, 10).text)
        : serverFrames(bigLog);
const c = census(frames);

function pass(): number {
  const p = buildPipeline(CFG, VARIANT);
  let t = 0;
  for (const f of frames) {
    const t0 = performance.now();
    p.feed(f);
    t += performance.now() - t0;
    p.settle();
  }
  p.dispose();
  return t;
}

const self = fileURLToPath(import.meta.url);
const tm = new TraceMap(readFileSync(self + '.map', 'utf8'), 'file://' + self);
const map = makeMapper((url) => (url.endsWith('.mjs') && url.includes('/perf/out/') ? tm : null));

const s = new Session();
s.connect();
pass(); // warm up
pass();

// ---------------------------------------------------------------- CPU
await s.post('Profiler.enable');
await s.post('Profiler.setSamplingInterval', { interval: INTERVAL });
await s.post('Profiler.start');
let ms = 0;
for (let i = 0; i < PASSES; i++) ms += pass();
const { profile } = (await s.post('Profiler.stop')) as unknown as { profile: CpuProfile };
writeFileSync(`${OUTDIR}/node-${SCEN}-${CFG.name.replace('+', '')}-${VARIANT.name}.cpuprofile`, JSON.stringify(profile));

// Only samples inside a pipeline pass: the stack contains Session / feed code.
const cpu = analyzeCpu(profile, map, (st) => st.some((w) => w.file.startsWith('src/')) || st.some((w) => w.fn === '(garbage collector)'));
const lines = c.lines * PASSES;
console.log(
  `node ${process.version}, variant ${VARIANT.name}, scenario ${SCEN} (${c.lines} lines, ${c.gmcp} GMCP, ${(c.bytes / 1e6).toFixed(2)} MB per pass), config ${CFG.name}, ${PASSES} passes, ${INTERVAL} µs sampling`,
);
console.log(`timed ${ms.toFixed(1)} ms (${((ms / lines) * 1000).toFixed(3)} µs/line); sampled in-pipeline ${(cpu.total / 1000).toFixed(1)} ms; GC ${((cpu.special.get('(garbage collector)') ?? 0) / 1000).toFixed(1)} ms`);
console.log('\nself time by stage (µs per line, share of sampled pipeline time):');
console.table(top(cpu.byStage, cpu.total, 30, 1 / lines));
console.log('\nself time by function (µs per line):');
console.table(top(cpu.byFn, cpu.total, 45, 1 / lines));

// --------------------------------------------------------------- heap
await s.post('HeapProfiler.enable');
await s.post('HeapProfiler.startSampling', {
  samplingInterval: 256,
  includeObjectsCollectedByMajorGC: true,
  includeObjectsCollectedByMinorGC: true,
});
pass();
const heap = (await s.post('HeapProfiler.stopSampling')) as unknown as { profile: { head: HeapNode } };
writeFileSync(`${OUTDIR}/node-${SCEN}-${CFG.name.replace('+', '')}-${VARIANT.name}.heapprofile`, JSON.stringify(heap.profile));
const h = analyzeHeap(heap.profile.head, map);
console.log(`\nallocated (sampled, incl. collected): ${(h.total / 1e6).toFixed(1)} MB per pass, ${(h.total / c.lines).toFixed(0)} B per line, ${(h.total / c.bytes).toFixed(2)} B per wire byte`);
console.log('\nallocation by stage (bytes per line):');
console.table(top(h.byStage, h.total, 25, 1 / c.lines));
console.log('\nallocation by function (bytes per line):');
console.table(top(h.byFn, h.total, 40, 1 / c.lines));
s.disconnect();
