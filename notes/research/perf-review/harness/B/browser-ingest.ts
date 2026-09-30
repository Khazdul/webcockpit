// Area B perf harness, browser side: the ingest cost of the real app
// (production build, `?bench` page) in headless Chromium and Firefox at
// DPR 2 and a 1728×1050 viewport, as the owner plays: the session reaches
// `playing` through GMCP Char.Name (the recorder captures), the bundled
// khazdul profile is applied, all panes are on (defaults, map included and
// loaded).
//
//   node perf/browser-ingest.ts [--builds dist-base,dist-exp] [--browsers chromium,firefox]
//        [--scenarios big,repro,big-gmcp] [--rounds 5] [--slice 8]
//
// Each build is served by its own `vite preview` (ports 4211+). Per browser,
// one page per build is opened and the rounds alternate between them
// (A B A B …). A round delivers every frame of the scenario through the
// probe's fake socket (`sock.onData`, exactly what a WebSocket message
// does), in slices of at most `--slice` ms, yielding to the next animation
// frame between slices (as the replay does at max speed), so output flushes
// and timers run in between. Measured in the page: ingest = the time spent
// inside onData (sum of slices), per-frame ingest percentiles, flush script
// time (probe FlushRecords), wall time.

import { writeFileSync } from 'node:fs';
import { chromium, firefox, type Page } from '@playwright/test';
import { preview } from 'vite';
import { LOGS, loadavg, openPage, runRound } from './browser-common.ts';

const argv = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const BUILDS = (opt('--builds') ?? 'dist-base,dist-exp').split(',');
const BROWSERS = (opt('--browsers') ?? 'chromium,firefox').split(',');
const SCENARIOS = (opt('--scenarios') ?? 'big,repro,big-gmcp').split(',');
const ROUNDS = Number(opt('--rounds') ?? 5);
const WARM = Number(opt('--warm') ?? 1);
const SLICE = Number(opt('--slice') ?? 8);
const PORT0 = Number(opt('--port') ?? 4211);
const OUT = opt('--out') ?? '/tmp/claude-1000/-home-ole-proj-webcockpit/839d0ad2-3f20-4e68-a808-1e236720a92c/scratchpad/perf/B/browser-ingest.json';

// ------------------------------------------------------------------- main

const servers = [];
const bases: string[] = [];
for (let k = 0; k < BUILDS.length; k++) {
  const port = PORT0 + k;
  servers.push(await preview({ preview: { port, strictPort: true }, build: { outDir: BUILDS[k] }, logLevel: 'warn' }));
  bases.push(`http://localhost:${port}`);
}

type Res = Record<string, number>;
const runner = (page: Page, sc: string) => () => runRound(page, sc, SLICE);

const report: Record<string, unknown> = { builds: BUILDS, rounds: ROUNDS, slice: SLICE, load: [loadavg()], results: [] };
const pctOf = (xs: number[], q: number): number => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))]!;
try {
  for (const bn of BROWSERS) {
    const browser =
      bn === 'firefox'
        ? await firefox.launch({ firefoxUserPrefs: { 'layout.css.devPixelsPerPx': '2' } })
        : await chromium.launch();
    console.log(`\n[${bn} ${browser.version()}] load ${loadavg()}`);
    const pages: Page[] = [];
    for (const base of bases) pages.push(await openPage(browser, base, SCENARIOS));
    for (const sc of SCENARIOS) {
      const lines = LOGS[sc]!.lines * LOGS[sc]!.repeat;
      const res: Res[][] = BUILDS.map(() => []);
      const loads: string[] = [];
      for (let r = 0; r < WARM + ROUNDS; r++) {
        const order = r % 2 === 0 ? BUILDS.map((_, k) => k) : BUILDS.map((_, k) => BUILDS.length - 1 - k);
        for (const k of order) {
          const x = await runner(pages[k]!, sc)();
          if (r >= WARM) res[k]!.push(x);
        }
        loads.push(loadavg());
      }
      const rows = BUILDS.map((b, k) => {
        const rs = res[k]!;
        const med = (key: string) => pctOf(rs.map((x) => (x as Record<string, number>)[key]!), 0.5);
        const ing = rs.map((x) => (x as Record<string, number>).ingest!);
        return {
          build: b,
          ingestMs: +med('ingest').toFixed(1),
          ingestMin: +Math.min(...ing).toFixed(1),
          ingestMax: +Math.max(...ing).toFixed(1),
          usPerLine: +((med('ingest') / lines) * 1000).toFixed(3),
          frameP50us: +(med('frameP50') * 1000).toFixed(0),
          frameP95us: +(med('frameP95') * 1000).toFixed(0),
          frameP99us: +(med('frameP99') * 1000).toFixed(0),
          frameMaxMs: +Math.max(...rs.map((x) => (x as Record<string, number>).frameMax!)).toFixed(2),
          sliceMaxMs: +Math.max(...rs.map((x) => (x as Record<string, number>).sliceMax!)).toFixed(2),
          flushScriptMs: +med('flushScript').toFixed(1),
          flushScriptMaxMs: +Math.max(...rs.map((x) => (x as Record<string, number>).flushScriptMax!)).toFixed(2),
          wallMs: +med('wall').toFixed(0),
        };
      });
      console.log(`  ${sc} (${lines} lines), load ${loads.at(-1)}`);
      console.table(rows);
      if (BUILDS.length > 1) {
        const a = res[0]!;
        for (let k = 1; k < BUILDS.length; k++) {
          const ratios = a.map((x, i) => (res[k]![i] as Record<string, number>).ingest! / (x as Record<string, number>).ingest!);
          console.log(`   ${BUILDS[k]}/${BUILDS[0]} ingest: median ratio ${pctOf(ratios, 0.5).toFixed(3)} (min ${Math.min(...ratios).toFixed(3)}, max ${Math.max(...ratios).toFixed(3)})`);
        }
      }
      (report.results as unknown[]).push({ browser: bn, version: browser.version(), scenario: sc, lines, rows, raw: res, loads });
    }
    await browser.close();
  }
} finally {
  for (const s of servers) await new Promise<void>((r) => s.httpServer.close(() => r()));
}
(report.load as string[]).push(loadavg());
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`\nwrote ${OUT}; load ${loadavg()}`);
