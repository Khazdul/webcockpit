// Area B perf harness, Node side: the recorder's chunk write on the main
// thread (src/capture/recorder.ts writeChunk: `buf.join('')`, then
// `TextEncoder.encode(text).byteLength` only to count bytes), for the lines
// the base and the prototype assembler produce (their `raw` rope shapes
// differ), for ~2 s of a burst.
//
//   perf/run-node.sh node-chunk [--mb 1]

import { readFileSync } from 'node:fs';
import { FULL, buildPipeline, serverFrames } from './pipeline';
import { variant } from './variants';

const argv = process.argv.slice(2);
const MB = Number(argv[argv.indexOf('--mb') + 1] || 1);
const RUNS = process.env.WEBCOCKPIT_FIXTURES ?? '/home/ole/MUME/data/runs';
const bigLog = readFileSync(`${RUNS}/Rasta/2026-09-18T18-11-42.log`, 'utf8');
const reproLog = readFileSync(`${RUNS}/Rasta/2026-09-30T00-11-08.log`, 'utf8').split('\n').slice(225, 364).join('\n') + '\n';

const pct = (xs: number[], p: number): number => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))]!;

for (const [name, log] of [
  ['repro', reproLog],
  ['big', bigLog],
] as const) {
  const one = serverFrames(log);
  let bytes = 0;
  for (const f of one) bytes += f.length;
  const reps = Math.max(1, Math.round((MB * 1e6) / bytes));
  const frames = Array.from({ length: reps }, () => one).flat();
  const res: Record<string, { join: number[]; encode: number[]; chars: number; lines: number }> = {};
  for (let round = 0; round < 7; round++) {
    for (const v of [variant('base'), variant('p1')]) {
      const p = buildPipeline(FULL, v);
      for (const f of frames) {
        p.feed(f);
        const o = p.out as unknown as { queue: unknown[]; head: number; frameScheduled: boolean };
        o.queue.length = 0;
        o.head = 0;
        o.frameScheduled = false;
      }
      const buf = (p.rec as unknown as { run: { buf: string[] } }).run.buf;
      const t0 = performance.now();
      const text = buf.join('');
      const t1 = performance.now();
      const n = new TextEncoder().encode(text).byteLength;
      const t2 = performance.now();
      const r = (res[v.name] ??= { join: [], encode: [], chars: 0, lines: 0 });
      if (round > 0) {
        r.join.push(t1 - t0);
        r.encode.push(t2 - t1);
      }
      r.chars = text.length;
      r.lines = buf.length;
      void n;
      p.dispose();
    }
  }
  for (const [k, r] of Object.entries(res)) {
    console.log(
      `${name} ${k}: ${r.lines} records, ${(r.chars / 1e6).toFixed(2)} M chars; join median ${pct(r.join, 50).toFixed(1)} ms (max ${Math.max(...r.join).toFixed(1)}), encode median ${pct(r.encode, 50).toFixed(1)} ms (max ${Math.max(...r.encode).toFixed(1)})`,
    );
  }
}
