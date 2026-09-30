// Prints the tables of a perf/lab.ts or perf/ab.ts result JSON.
//   node perf/lab-report.ts <result.json> [--keys build,scroll,post,frame,nextFrame] [--browser firefox]
import { readFileSync } from 'node:fs';
import { f2, maxOf, median, minOf, pct } from './lib.ts';

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1]! : d;
};
const j = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
const keys = arg('keys', 'build,append,scroll,read,script,post,frame,nextFrame').split(',');
const labels: string[] = (j.configs ?? j.variants).map((c: any) => c.label);
for (const [bname, byC] of Object.entries(j.data as Record<string, Record<string, Record<string, any[]>>>)) {
  if (arg('browser', '') && arg('browser', '') !== bname) continue;
  console.log(`\n== ${bname}: medians (ms); frame [min–p90]; Δ = frame median vs first`);
  const payloads = [...new Set(Object.values(byC).flatMap((m) => Object.keys(m)))];
  for (const s of payloads) {
    console.log(`  ${s}`);
    const bm = median((byC[labels[0]!]?.[s] ?? []).map((x) => x.frame));
    for (const lab of labels) {
      const xs = byC[lab]?.[s] ?? [];
      if (!xs.length) continue;
      const fr = xs.map((x) => x.frame);
      const cols = keys.filter((k) => xs[0][k] !== undefined).map((k) => `${k} ${f2(median(xs.map((x) => x[k])))}`);
      console.log(`    ${lab.padEnd(20)} ${cols.join('  ')}  [${f2(minOf(fr))}–${f2(pct(fr, 90))}] n=${xs.length}${lab === labels[0] ? '' : `  Δ ${((median(fr) / bm - 1) * 100).toFixed(0)}%`}`);
    }
  }
}
if (j.loads) console.log('\nloadavg:', j.loads.join(' | '));
void maxOf;
