// Area B perf harness: GC events on the renderer main thread (Chromium
// trace: MinorGC / MajorGC and V8 GC phases) during one round of a scenario,
// per build (one page per build, a warm-up round first).
//
//   node perf/browser-gc.ts --builds dist-base,dist-exp5 --scenario repro [--rounds 3]

import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { loadavg, openPage, runRound } from './browser-common.ts';

const argv = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const BUILDS = (opt('--builds') ?? 'dist-base,dist-exp5').split(',');
const SCEN = opt('--scenario') ?? 'repro';
const ROUNDS = Number(opt('--rounds') ?? 3);
const PORT0 = Number(opt('--port') ?? 4217);

type Ev = { name: string; ph: string; ts: number; dur?: number; pid: number; tid: number; cat: string; args?: { name?: string } };

const servers = [];
try {
  const browser = await chromium.launch();
  const pages = [];
  for (let k = 0; k < BUILDS.length; k++) {
    const port = PORT0 + k;
    servers.push(await preview({ preview: { port, strictPort: true }, build: { outDir: BUILDS[k] }, logLevel: 'warn' }));
    const page = await openPage(browser, `http://localhost:${port}`, [SCEN]);
    await runRound(page, SCEN, 8);
    pages.push(page);
  }
  for (let r = 0; r < ROUNDS; r++) {
    for (let k = 0; k < BUILDS.length; k++) {
      const page = pages[k]!;
      await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-v8.gc', 'v8'] });
      const res = await runRound(page, SCEN, 8);
      const ev = (JSON.parse((await browser.stopTracing()).toString()) as { traceEvents: Ev[] }).traceEvents;
      const main = new Set(ev.filter((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain').map((e) => `${e.pid}:${e.tid}`));
      const on = (e: Ev): boolean => main.has(`${e.pid}:${e.tid}`) && e.ph === 'X';
      const pick = (re: RegExp) => ev.filter((e) => on(e) && re.test(e.name)).map((e) => (e.dur ?? 0) / 1000);
      const minor = pick(/^MinorGC$/);
      const major = pick(/^MajorGC$/);
      const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
      console.log(
        `${BUILDS[k]} ${SCEN} round ${r}: ingest ${res.ingest!.toFixed(1)} ms, frame max ${res.frameMax!.toFixed(2)} ms; ` +
          `MinorGC ${minor.length}× ${sum(minor).toFixed(1)} ms (max ${Math.max(0, ...minor).toFixed(2)}), ` +
          `MajorGC ${major.length}× ${sum(major).toFixed(1)} ms (max ${Math.max(0, ...major).toFixed(2)}); load ${loadavg()}`,
      );
    }
  }
  await browser.close();
} finally {
  for (const s of servers) await new Promise<void>((ok) => s.httpServer.close(() => ok()));
}
