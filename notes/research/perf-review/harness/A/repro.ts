// Q1: the owner's `help 24-bit colours` stall and comparison payloads,
// through the real app path of the production build, at DPR 2 and
// 1728×1000 CSS px, in Firefox and Chromium (headless).
//
//   npm run build && node perf/repro.ts [--browsers firefox,chromium] [--runs 7]
//        [--prefill 2000] [--port 4201] [--dist dist] [--timed] [--only p24a,p24s]
//        [--out /path/result.json]
//
// One-shot: each payload is fed as one socket frame; the flush that renders
// it is timed by the `?bench` probe (script time; rAF start → after
// rendering; receipt → after rendering), LoAF entries overlapping it are
// kept (Chromium). Scenarios are interleaved in a shuffled order per round.
// --timed also replays each payload at the log's own timing (speed 1) and
// reports the longest frame and the time until the page is complete.
import { writeFileSync } from 'node:fs';
import { type BrowserName, f1, f2, launch, loadavg, maxOf, median, mm, openBench, pageFacts, pause, pct, startServer } from './lib.ts';
import { installPerf } from './page-helpers.ts';
import { oneShot, payloads, playLines, timed } from './payloads.ts';

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1]! : d;
};
const has = (k: string) => process.argv.includes(`--${k}`);
const browsers = arg('browsers', 'firefox,chromium').split(',') as BrowserName[];
const RUNS = Number(arg('runs', '7'));
const PREFILL = Number(arg('prefill', '2000'));
const PORT = Number(arg('port', '4201'));
const DIST = arg('dist', 'dist');
const only = arg('only', '');
const out = arg('out', '');

const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
const all = payloads().filter((p) => !only || only.split(',').includes(p.name));
const shots = all.map((p) => ({ name: p.name, what: p.what, b64: b64(oneShot(p.lines)), n: p.lines.length }));
const prefill = playLines(PREFILL);
const prefillChunks: string[] = [];
for (let i = 0; i < prefill.length; i += 200) prefillChunks.push(b64(oneShot(prefill.slice(i, i + 200))));

// --variant <name>: serve perf/dists and open /<name>/?bench (a build from perf/build-variant.sh).
const VARIANT = arg('variant', '');
const server = await startServer(VARIANT ? new URL('./dists/', import.meta.url).pathname : DIST, PORT);
const url = `http://127.0.0.1:${PORT}/${VARIANT ? VARIANT + '/' : ''}?bench`;
const results: Record<string, unknown> = { loadavgStart: loadavg(), runs: RUNS, prefill: PREFILL };

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

try {
  for (const name of browsers) {
    const l = await launch(name);
    try {
      const page = await openBench(l, url);
      await page.evaluate(installPerf);
      await page.evaluate(() => (window as any).__perf.connect());
      for (const c of prefillChunks) {
        await page.evaluate((s) => (window as any).__perf.inject(Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0))), c);
      }
      await page.evaluate(() => (window as any).__perf.drained());
      const facts = await pageFacts(page);
      console.log(`\n[${name} ${l.browser.version()}] ${JSON.stringify(facts)}`);
      const per: Record<string, any[]> = {};
      const counts: Record<string, unknown> = {};
      // Structure of each payload: rows / spans / nodes it adds (one extra run).
      for (const s of shots) {
        const before = await page.evaluate(() => (window as any).__perf.counts());
        await page.evaluate((x) => (window as any).__perf.inject(Uint8Array.from(atob(x), (ch) => ch.charCodeAt(0))), s.b64);
        await page.evaluate(() => (window as any).__perf.drained());
        const after = await page.evaluate(() => (window as any).__perf.counts());
        counts[s.name] = { rows: after.rows - before.rows, spans: after.spans - before.spans, nodes: after.nodes - before.nodes };
        await pause(100);
      }
      console.log('  added per payload:', JSON.stringify(counts));
      const la: string[] = [];
      for (let r = 0; r < RUNS; r++) {
        la.push(loadavg());
        for (const s of shuffle(shots)) {
          const res = await page.evaluate((x) => (window as any).__perf.inject(Uint8Array.from(atob(x), (ch) => ch.charCodeAt(0))), s.b64);
          (per[s.name] ??= []).push(res);
          await pause(250);
        }
      }
      const summary: Record<string, unknown> = {};
      console.log(`  loadavg per round: ${la.join(' | ')}`);
      console.log('  payload        ingest   script (med [min–max])   frame: rAF→painted (med [min–max])   receipt→painted p50/max   LoAF (dur / render→end / style+layout→end)');
      for (const s of shots) {
        const xs = per[s.name]!;
        const lf = xs.flatMap((x) => x.loaf.map((e: any) => ({ d: e.duration, r: e.start + e.duration - e.renderStart, sl: e.start + e.duration - e.styleAndLayoutStart })));
        summary[s.name] = {
          what: s.what,
          ingest: median(xs.map((x) => x.ingest)),
          script: xs.map((x) => x.script),
          frame: xs.map((x) => x.frame),
          toPaint: xs.map((x) => x.toPaint),
          rows: xs[0].rowsAdded,
          loaf: xs.map((x) => x.loaf),
        };
        console.log(
          `  ${s.name.padEnd(8)} ${f2(median(xs.map((x) => x.ingest))).padStart(8)}   ${mm(xs.map((x) => x.script)).padEnd(24)} ${mm(xs.map((x) => x.frame)).padEnd(36)} ${f1(median(xs.map((x) => x.toPaint)))}/${f1(maxOf(xs.map((x) => x.toPaint)))}` +
            (lf.length ? `   ${f1(median(lf.map((e) => e.d)))} / ${f1(median(lf.map((e) => e.r)))} / ${f1(median(lf.map((e) => e.sl)))} (n=${lf.length})` : ''),
        );
      }
      let timedRes: Record<string, unknown> | null = null;
      if (has('timed')) {
        timedRes = {};
        console.log('  timed (speed 1, log timing): payload  frames  longest frame (rAF→painted)  longest rAF gap  first byte→page painted');
        for (const p of all.filter((x) => ['p24a', 'p24b', 'p24s', 'info', 'room'].includes(x.name))) {
          const fr = timed(p.lines).map((f) => ({ atMs: f.atMs, b64: b64(f.bytes) }));
          const reps: any[] = [];
          for (let r = 0; r < Math.max(3, Math.ceil(RUNS / 2)); r++) {
            const res = await page.evaluate(
              (frs) => (window as any).__perf.timed(frs.map((f: any) => ({ atMs: f.atMs, bytes: Uint8Array.from(atob(f.b64), (ch) => ch.charCodeAt(0)) }))),
              fr,
            );
            reps.push(res);
            await pause(250);
          }
          timedRes[p.name] = reps;
          console.log(
            `    ${p.name.padEnd(8)} ${String(fr.length).padStart(3)} socket frames, ${f1(median(reps.map((x) => x.flushes.length)))} flushes   ${mm(reps.map((x) => x.maxFrame)).padEnd(22)} ${mm(reps.map((x) => x.maxGap)).padEnd(22)} ${mm(reps.map((x) => x.total))}`,
          );
        }
      }
      results[name] = { version: l.browser.version(), facts, counts, summary, timed: timedRes, loadavg: la };
      await page.close();
    } finally {
      await l.browser.close();
    }
  }
} finally {
  server.close();
}
results.loadavgEnd = loadavg();
if (out) writeFileSync(out, JSON.stringify(results, null, 1));
console.log(`\nloadavg start ${results.loadavgStart}, end ${results.loadavgEnd}`);
void pct;
