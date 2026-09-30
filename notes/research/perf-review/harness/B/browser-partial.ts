// Area B perf harness: how often the output pane's partial row is touched
// per flush (OutputPane.renderPartial: with a partial = the row is built;
// without = cleared), and how many text.partial events ingest emits, for
// the builds given (e.g. dist-base vs dist-exp5, where a prompt with its GA
// in the same frame no longer becomes a partial).
//
//   node perf/browser-partial.ts --builds dist-base,dist-exp5 --browser chromium --scenario big

import { chromium, firefox } from '@playwright/test';
import { preview } from 'vite';
import { LOGS, loadavg, openPage, runRound } from './browser-common.ts';

const argv = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const BUILDS = (opt('--builds') ?? 'dist-base,dist-exp5').split(',');
const BROWSER = opt('--browser') ?? 'chromium';
const SCEN = opt('--scenario') ?? 'big';
const PORT0 = Number(opt('--port') ?? 4215);

const servers = [];
try {
  const browser = BROWSER === 'firefox' ? await firefox.launch({ firefoxUserPrefs: { 'layout.css.devPixelsPerPx': '2' } }) : await chromium.launch();
  for (let k = 0; k < BUILDS.length; k++) {
    const port = PORT0 + k;
    servers.push(await preview({ preview: { port, strictPort: true }, build: { outDir: BUILDS[k] }, logLevel: 'warn' }));
    const page = await openPage(browser, `http://localhost:${port}`, [SCEN]);
    await page.evaluate(() => {
      type Out = { renderPartial(): void; partial: unknown; flush(): void };
      type App = { output: Out; bus: { on(t: string, f: () => void): void } };
      const app = (window as unknown as { __wcBench: { app: App } }).__wcBench.app;
      const c = { withPartial: 0, cleared: 0, ms: 0, partials: 0, flushes: 0 };
      (window as unknown as { __pc: typeof c }).__pc = c;
      const out = app.output;
      const orig = out.renderPartial.bind(out);
      out.renderPartial = () => {
        const t0 = performance.now();
        if (out.partial) c.withPartial++;
        else c.cleared++;
        orig();
        c.ms += performance.now() - t0;
      };
      const flush = out.flush.bind(out);
      out.flush = () => {
        c.flushes++;
        flush();
      };
      app.bus.on('text.partial', () => c.partials++);
    });
    const r = await runRound(page, SCEN, 8);
    const c = await page.evaluate(() => (window as unknown as { __pc: Record<string, number> }).__pc);
    console.log(
      `${BROWSER} ${BUILDS[k]} ${SCEN} (${LOGS[SCEN]!.lines * LOGS[SCEN]!.repeat} lines): ingest ${r.ingest!.toFixed(1)} ms; flushes ${c.flushes}; ` +
        `text.partial ${c.partials}; renderPartial with a partial ${c.withPartial}, clearing ${c.cleared} (${c.ms!.toFixed(2)} ms in renderPartial); load ${loadavg()}`,
    );
    await page.context().close();
  }
  await browser.close();
} finally {
  for (const s of servers) await new Promise<void>((ok) => s.httpServer.close(() => ok()));
}
