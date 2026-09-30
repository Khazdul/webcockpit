// The run recorder's chunk write as a main-thread task (src/capture/
// recorder.ts writeChunk: buf.join, TextEncoder only to count bytes,
// RunStore.append → IndexedDB put, which serialises the string on the main
// thread). In a live burst the 2 s chunk holds everything received in 2 s.
// Measures, per chunk size, the synchronous cost of each step.
//
//   node perf/c-recorder.ts [--browsers chromium,firefox]
import { f, launch, loadavg, openApp, pct, ROOT, startServer, type BrowserName } from './lib.ts';
import { burstText } from './c-feeds.ts';
import { resolve } from 'node:path';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i]!.replace(/^--/, ''), process.argv[i + 1] ?? '');
const browsers = (args.get('browsers') ?? 'chromium,firefox').split(',') as BrowserName[];
const server = await startServer(resolve(ROOT, 'dist'), 4221, true);
const lines = burstText()
  .split('\n')
  .filter((l) => /^\d{16} /.test(l))
  .map((l) => l + '\n');
console.log(`# recorder chunk write cost, ${new Date().toISOString()}, loadavg ${loadavg()}`);
try {
  for (const name of browsers) {
    const browser = await launch(name);
    const page = await openApp(browser, name, 'http://127.0.0.1:4221');
    await page.evaluate((ls) => ((window as unknown as Record<string, unknown>).__lines = ls), lines);
    console.log(`\n## ${name} ${browser.version()}`);
    for (const mb of [0.1, 0.5, 1, 2, 4]) {
      const r = await page.evaluate(async (mb) => {
        const w = window as unknown as Record<string, any>;
        const all = w.__lines as string[];
        const store = await w.__wcBench.app.recorder.getStore();
        const out: { join: number; encode: number; append: number; done: number; bytes: number }[] = [];
        for (let rep = 0; rep < 6; rep++) {
          const buf: string[] = [];
          let n = 0;
          for (let i = (rep * 7919) % all.length; n < mb * 1e6; i = (i + 1) % all.length) {
            buf.push(all[i]!);
            n += all[i]!.length;
          }
          await new Promise((res) => setTimeout(res, 50));
          const t0 = performance.now();
          const text = buf.join('');
          const t1 = performance.now();
          const bytes = new TextEncoder().encode(text).byteLength;
          const t2 = performance.now();
          const p = store.append(`perf-run-${mb}`, { chunk: { runId: `perf-run-${mb}`, seq: rep, firstUs: 0, lastUs: 0, text }, bytes, lines: buf.length });
          const t3 = performance.now();
          await p;
          const t4 = performance.now();
          out.push({ join: t1 - t0, encode: t2 - t1, append: t3 - t2, done: t4 - t3, bytes });
        }
        return out.slice(1);
      }, mb);
      const m = (k: 'join' | 'encode' | 'append' | 'done') => f(pct(r.map((x) => x[k]), 50));
      const tot = r.map((x) => x.join + x.encode + x.append);
      console.log(
        `- ${mb} MB chunk: join ${m('join')} ms, TextEncoder (byte count) ${m('encode')} ms, append() sync part (IDB put, clone) ${m('append')} ms → one task ≈ ${f(pct(tot, 50))} ms (max ${f(Math.max(...tot))}); transaction done after ${m('done')} ms more`,
      );
    }
    await browser.close();
  }
} finally {
  server.close();
}
