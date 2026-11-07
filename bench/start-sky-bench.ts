// Start page sky frame times (stage 41a, ADR 0124).
//
//   node bench/start-sky-bench.ts [--port 5181] [--browsers chromium,firefox] [--seconds 6] [--out file]
//   WC_BENCH_HEADED=1 …   real windows (GPU compositing; needs a display)
//
// Serves the dev harness (src/start/sky/dev/harness.html) with Vite and,
// per browser, geometry and scene, lets the sky run with its automatic
// quality: 2 s to settle, then N seconds measured. Reports the tier it
// chose, its own work per frame (median / p95 / max, from the engine's
// stats), requestAnimationFrame intervals, the longest main-thread tasks
// (Long Animation Frames / long tasks, Chromium) and the mount time.
// Headless browsers composite in software: their frame rates are an upper
// bound for a machine with a GPU; WC_BENCH_HEADED=1 measures real windows.
// Writes bench/results/start-sky.md (start-sky-headed.md when headed).

import { mkdirSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (err) {
      if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) return next(specifier + '.ts', context);
      throw err;
    }
  },
});

const L = await import('./lib');
const { createServer } = await import('vite');
const { pct, max, f1, f2, pause, loadavg, startMonitor, stopMonitor, launchTarget, glRenderer } = L;
type Geometry = import('./lib').Geometry;

const argv = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : def;
};
const PORT = Number(opt('port', process.env.WC_E2E_PORT ?? '5181'));
const SECONDS = Number(opt('seconds', '6'));
const HEADED = process.env.WC_BENCH_HEADED === '1';
const OUT = opt('out', new URL(`./results/start-sky${HEADED ? '-headed' : ''}.md`, import.meta.url).pathname);
const BROWSERS = opt('browsers', 'chromium,firefox').split(',') as ('chromium' | 'firefox')[];

const GEOMETRIES: { name: string; g: Geometry }[] = [
  { name: 'laptop 1728×1000 @2', g: L.OWNER },
  { name: 'phone 390×844 @3', g: { width: 390, height: 844, dpr: 3 } },
];
const SCENES: { name: string; q: string }[] = [
  { name: 'day, fair', q: 'skyMonth=4&skyHour=13&skyWeather=fair' },
  { name: 'clear night (stars, moon)', q: 'skyMonth=7&skyHour=1&skyWeather=clear' },
  { name: 'winter night, snow', q: 'skyMonth=0&skyHour=22&skyWeather=snow' },
  { name: 'autumn storm', q: 'skyMonth=10&skyHour=15&skyWeather=storm' },
];

const server = await createServer({ server: { port: PORT, strictPort: false }, logLevel: 'error' });
await server.listen();
const addr = server.httpServer?.address();
const port = typeof addr === 'object' && addr ? addr.port : PORT;
const base = `http://localhost:${port}/src/start/sky/dev/harness.html`;

interface Row {
  browser: string;
  geometry: string;
  scene: string;
  tier: string;
  work: [number, number, number];
  gaps: [number, number, number];
  fps: number;
  long: string;
  mount: number;
}
const rows: Row[] = [];
const renderers: string[] = [];

for (const bname of BROWSERS) {
  for (const geo of GEOMETRIES) {
    const t = await launchTarget(bname, geo.g);
    if (geo === GEOMETRIES[0]) renderers.push(`${bname}: ${await glRenderer(t.browser)}`);
    for (const sc of SCENES) {
      const ctx = await t.browser.newContext({ viewport: { width: geo.g.width, height: geo.g.height }, deviceScaleFactor: geo.g.dpr });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => console.error('pageerror:', e.message));
      await page.goto(`${base}?${sc.q}`);
      await page.waitForSelector('[data-sky-ready="1"]');
      await pause(2000);
      await startMonitor(page);
      await pause(SECONDS * 1000);
      const mon = await stopMonitor(page);
      const s = await page.evaluate(() => ({ stats: window.__sky!.stats(), mount: window.__skyMountMs ?? NaN }));
      const d = mon.deltas.slice(1);
      const longs = mon.loafSupported ? mon.loaf : mon.longtask;
      const row: Row = {
        browser: bname,
        geometry: geo.name,
        scene: sc.name,
        tier: s.stats.quality,
        work: [s.stats.workP50, s.stats.workP95, s.stats.workMax],
        gaps: [pct(d, 50), pct(d, 95), max(d)],
        fps: d.length / (d.reduce((a, b) => a + b, 0) / 1000),
        long: mon.loafSupported || mon.ltSupported ? `${longs.length}${longs.length ? ` (max ${f1(max(longs))})` : ''}` : 'n/a',
        mount: s.mount,
      };
      rows.push(row);
      console.log(
        `${bname.padEnd(8)} ${geo.name.padEnd(20)} ${sc.name.padEnd(26)} ${row.tier.padEnd(6)} work ${row.work.map(f2).join('/')}  rAF ${row.gaps.map(f1).join('/')} (${f1(row.fps)} fps)  long ${row.long}  mount ${f1(row.mount)}`,
      );
      await ctx.close();
    }
    await t.browser.close();
  }
}
await server.close();

const md = [
  '# Start page sky — frame times',
  '',
  `Date: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · load ${loadavg()} · ${HEADED ? 'headed (real windows)' : 'headless'} · ${SECONDS} s per run after 2 s settling, automatic quality.`,
  '',
  ...renderers.map((r) => `- ${r}`),
  '',
  '| browser | geometry | scene | tier | sky work ms p50 / p95 / max | rAF ms p50 / p95 / max | fps | long frames (> 50 ms) | mount ms |',
  '|---|---|---|---|---|---|---|---|---|',
  ...rows.map(
    (r) =>
      `| ${r.browser} | ${r.geometry} | ${r.scene} | ${r.tier} | ${r.work.map(f2).join(' / ')} | ${r.gaps.map(f1).join(' / ')} | ${f1(r.fps)} | ${r.long} | ${f1(r.mount)} |`,
  ),
  '',
];
mkdirSync(new URL('./results/', import.meta.url).pathname, { recursive: true });
writeFileSync(OUT, md.join('\n'));
console.log(`wrote ${OUT}`);
