// Exploratory: what the ?bench page offers in each browser (timer
// resolution, isolation, bus handlers, recorder state).
//   node perf/browser-probe.ts <outDir> <port>
import { chromium, firefox, type Browser } from '@playwright/test';
import { preview } from 'vite';

const outDir = process.argv[2] ?? 'dist';
const port = Number(process.argv[3] ?? 4211);
const server = await preview({ preview: { port, strictPort: true }, build: { outDir }, logLevel: 'warn' });
const base = `http://localhost:${port}`;

async function open(name: string): Promise<Browser> {
  if (name === 'firefox') return firefox.launch({ firefoxUserPrefs: { 'layout.css.devPixelsPerPx': '2' } });
  return chromium.launch();
}

for (const name of ['chromium', 'firefox']) {
  const b = await open(name);
  const ctx = await b.newContext({ viewport: { width: 1728, height: 1050 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`${base}/?bench`);
  await page.waitForFunction(() => window.__wcBench?.app != null);
  const info = await page.evaluate(() => {
    const deltas: number[] = [];
    let last = performance.now();
    for (let i = 0; i < 200000 && deltas.length < 50; i++) {
      const t = performance.now();
      if (t !== last) {
        deltas.push(t - last);
        last = t;
      }
    }
    const p = window.__wcBench!;
    p.connectFake();
    const app = p.app as unknown as { bus: { handlers: Map<string, Array<{ fn: () => void }>> }; session: { state: string } };
    const h: Record<string, string[]> = {};
    for (const [k, v] of app.bus.handlers) h[k] = v.map((e) => String(e.fn).slice(0, 90));
    return {
      ua: navigator.userAgent,
      dpr: devicePixelRatio,
      coi: crossOriginIsolated,
      minDelta: Math.min(...deltas),
      medDelta: deltas.sort((a, b) => a - b)[25],
      state: app.session.state,
      handlers: h,
    };
  });
  console.log(name, b.version(), JSON.stringify(info, null, 1));
  await b.close();
}
await new Promise<void>((r) => server.httpServer.close(() => r()));
