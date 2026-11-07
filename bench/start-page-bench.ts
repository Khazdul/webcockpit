// The integrated start page's frame times (stage 41, ADR 0125 addendum).
//
//   node bench/start-page-bench.ts [--port 5184] [--browsers chromium,firefox] [--seconds 6] [--out file]
//   WC_BENCH_HEADED=1 …   real windows (GPU compositing; needs a display)
//
// Serves the app with Vite and opens the real start page (`/`, with the sky's
// `?skyStats` so the engine's handle is on `window.__wcSky`) over two
// scenes, at the owner's laptop geometry and a phone's, in two variants:
// `glass` as built (the menu panel's window and the glass buttons blur the
// animated sky behind them with backdrop-filter) and `flat` with every
// backdrop-filter switched off, to see what the blur costs. Waits for the
// reveal and the engine, lets it settle 2 s, then measures N seconds:
// requestAnimationFrame intervals (fps), the sky engine's own work per
// frame, the tier it chose and the longest main-thread frames (Long
// Animation Frames / long tasks, Chromium). Writes
// bench/results/start-page.md (start-page-headed.md when headed).

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
const PORT = Number(opt('port', process.env.WC_E2E_PORT ?? '5184'));
const SECONDS = Number(opt('seconds', '6'));
const HEADED = process.env.WC_BENCH_HEADED === '1';
const OUT = opt('out', new URL(`./results/start-page${HEADED ? '-headed' : ''}.md`, import.meta.url).pathname);
const BROWSERS = opt('browsers', 'chromium,firefox').split(',') as ('chromium' | 'firefox')[];
const VARIANTS = opt('variants', 'glass,flat').split(',');

const GEOMETRIES: { name: string; g: Geometry; q: string }[] = [
  { name: 'laptop 1728×1000 @2', g: L.OWNER, q: '' },
  { name: 'phone 390×844 @3', g: { width: 390, height: 844, dpr: 3 }, q: '&phone=1' },
];
const SCENES: { name: string; q: string }[] = [
  { name: 'day, fair', q: 'skyMonth=4&skyHour=13&skyWeather=fair' },
  { name: 'winter night, snow', q: 'skyMonth=0&skyHour=22&skyWeather=snow' },
];
const FLAT = '*,*::before,*::after{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}';
/** Variants: CSS added and a script run after the reveal (diagnosis: what costs frames). */
const VARIANT: Record<string, { css?: string; js?: string }> = {
  glass: {},
  flat: { css: FLAT },
  nosheen: { js: "document.querySelectorAll('[data-wcw=\"sheen-band\"]').forEach((e) => e.getAnimations().forEach((a) => a.cancel()))" },
  nomark: { css: '.wc-start-brand{display:none!important}' },
  nopage: { css: '.wc-start-brand,.wc-start-main,.wc-start-almanac{display:none!important}' },
};
const EXTRA = opt('extra', '');

// --url http://localhost:4173: measure a running server (e.g. `vite preview` of a production build) instead of the dev server.
const URL_ARG = opt('url', '');
const server = URL_ARG ? null : await createServer({ server: { port: PORT, strictPort: false }, logLevel: 'error' });
await server?.listen();
const addr = server?.httpServer?.address();
const origin = URL_ARG || `http://localhost:${typeof addr === 'object' && addr ? addr.port : PORT}`;

interface Row {
  browser: string;
  geometry: string;
  scene: string;
  variant: string;
  tier: string;
  work: [number, number, number];
  gaps: [number, number, number];
  fps: number;
  long: string;
}
const rows: Row[] = [];
const renderers: string[] = [];

// --geometries laptop|phone and --scenes day|winter narrow the runs; --repeat n repeats each.
const ONLY_GEO = opt('geometries', '');
const ONLY_SCENE = opt('scenes', '');
const REPEAT = Number(opt('repeat', '1'));
for (const bname of BROWSERS) {
  for (const geo of GEOMETRIES.filter((g) => !ONLY_GEO || g.name.startsWith(ONLY_GEO))) {
    const t = await launchTarget(bname, geo.g);
    if (!renderers.some((r) => r.startsWith(bname))) renderers.push(`${bname}: ${await glRenderer(t.browser)}`);
    for (const sc of SCENES.filter((c) => !ONLY_SCENE || c.name.startsWith(ONLY_SCENE))) {
      for (const variant of Array.from({ length: REPEAT }, () => VARIANTS).flat()) {
        const ctx = await t.browser.newContext({ viewport: { width: geo.g.width, height: geo.g.height }, deviceScaleFactor: geo.g.dpr });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => console.error('pageerror:', e.message));
        await page.goto(`${origin}/?${sc.q}${geo.q}&skyStats${EXTRA ? `&${EXTRA}` : ''}`);
        await page.waitForSelector('html[data-wc-boot="ready"]', { timeout: 60_000 });
        await page.waitForFunction(() => (window as { __wcSky?: unknown }).__wcSky !== undefined, null, { timeout: 30_000 });
        const v = VARIANT[variant] ?? {};
        if (v.css) await page.addStyleTag({ content: v.css });
        if (v.js) await page.evaluate(v.js);
        await pause(2000);
        await startMonitor(page);
        await pause(SECONDS * 1000);
        const mon = await stopMonitor(page);
        const s = await page.evaluate(() => (window as unknown as { __wcSky: { stats(): { quality: string; workP50: number; workP95: number; workMax: number } } }).__wcSky.stats());
        const d = mon.deltas.slice(1);
        const longs = mon.loafSupported ? mon.loaf : mon.longtask;
        const row: Row = {
          browser: bname,
          geometry: geo.name,
          scene: sc.name,
          variant,
          tier: s.quality,
          work: [s.workP50, s.workP95, s.workMax],
          gaps: [pct(d, 50), pct(d, 95), max(d)],
          fps: d.length / (d.reduce((a, b) => a + b, 0) / 1000),
          long: mon.loafSupported || mon.ltSupported ? `${longs.length}${longs.length ? ` (max ${f1(max(longs))})` : ''}` : 'n/a',
        };
        rows.push(row);
        console.log(
          `${bname.padEnd(8)} ${geo.name.padEnd(20)} ${sc.name.padEnd(20)} ${variant.padEnd(5)} ${row.tier.padEnd(6)} work ${row.work.map(f2).join('/')}  rAF ${row.gaps.map(f1).join('/')} (${f1(row.fps)} fps)  long ${row.long}`,
        );
        await ctx.close();
      }
    }
    await t.browser.close();
  }
}
await server?.close();

const md = [
  '# Start page (integrated) — frame times',
  '',
  `${URL_ARG ? `Server: ${URL_ARG}. ` : 'Dev server. '}Date: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · load ${loadavg()} · ${HEADED ? 'headed (real windows)' : 'headless'} · ${SECONDS} s per run after the reveal and 2 s settling, automatic quality. \`glass\`: as built (backdrop-filter on the panel and the buttons); \`flat\`: every backdrop-filter off.`,
  '',
  ...renderers.map((r) => `- ${r}`),
  '',
  '| browser | geometry | scene | variant | tier | sky work ms p50 / p95 / max | rAF ms p50 / p95 / max | fps | long frames (> 50 ms) |',
  '|---|---|---|---|---|---|---|---|---|',
  ...rows.map(
    (r) =>
      `| ${r.browser} | ${r.geometry} | ${r.scene} | ${r.variant} | ${r.tier} | ${r.work.map(f2).join(' / ')} | ${r.gaps.map(f1).join(' / ')} | ${f1(r.fps)} | ${r.long} |`,
  ),
  '',
];
mkdirSync(new URL('./results/', import.meta.url).pathname, { recursive: true });
writeFileSync(OUT, md.join('\n'));
console.log(`wrote ${OUT}`);
