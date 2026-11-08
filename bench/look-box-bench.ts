// Layout B's large box over the moving sky (stage 42a, ADR 0127).
//
//   VITE_KIT=1 npx vite build && npx vite preview --port 5302 --strictPort &
//   WC_BENCH_HEADED=1 node bench/look-box-bench.ts --url http://localhost:5302 [--browsers chromium,firefox] [--seconds 6]
//
// Measures a production build with the kit gallery (`VITE_KIT=1`) at the
// owner's laptop geometry (1728×1000 @2) and a phone's (390×844 @3):
//
// - `menu`: the start menu idle (the baseline);
// - `large blur` / `large flat`: the gallery's large box idle, its window
//   with the normal box's blur (`blur(9px)`, 0.68 fill) or without
//   (`none`, 0.84 fill), forced with `--lk-large-blur` / `--lk-large-fill`;
// - `close` / `open`: the morph, large → menu (Esc) and menu → large (`k`
//   on the menu reopens the gallery), each repeated, the frames from the
//   key to the end of the plan (1.3 s).
//
// Per run: rAF intervals (median / p95 / max), fps, the frames over 20 ms,
// the longest frames (Long Animation Frames, Chromium; > 50 ms) and the
// sky's tier and rate. Writes bench/results/look-box.md
// (look-box-headed.md when headed). The blur rule (stage 42 "Performance
// rules"): the large box keeps the blur only if, in both browsers and both
// geometries, it is within 2 fps of the menu and has no long frame.

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
const { pct, max, f1, pause, loadavg, startMonitor, stopMonitor, launchTarget, glRenderer } = L;
type Geometry = import('./lib').Geometry;
type Page = import('@playwright/test').Page;

const argv = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : def;
};
const URL_ARG = opt('url', '');
if (!URL_ARG) throw new Error('--url of a running VITE_KIT=1 production build (vite preview) is required');
const SECONDS = Number(opt('seconds', '6'));
const MORPHS = Number(opt('morphs', '3'));
const HEADED = process.env.WC_BENCH_HEADED === '1';
const OUT = opt('out', new URL(`./results/look-box${HEADED ? '-headed' : ''}.md`, import.meta.url).pathname);
const BROWSERS = opt('browsers', 'chromium,firefox').split(',') as ('chromium' | 'firefox')[];
const SCENE = opt('scene', 'skyMonth=4&skyHour=13&skyWeather=fair');

const GEOMETRIES: { name: string; g: Geometry; q: string }[] = [
  { name: 'laptop 1728×1000 @2', g: L.OWNER, q: '' },
  { name: 'phone 390×844 @3', g: { width: 390, height: 844, dpr: 3 }, q: '&phone=1' },
];
const ONLY_GEO = opt('geometries', '');
/** --only idle|morph: run only those; --css: extra CSS for every page (diagnosis). */
const ONLY = opt('only', '');
const EXTRA_CSS = opt('css', '');

const GLASS: Record<string, string> = {
  blur: '.wc-start{--lk-large-fill:rgba(13,10,8,.68)!important;--lk-large-blur:blur(9px) saturate(1.1)!important}',
  flat: '.wc-start{--lk-large-fill:rgba(13,10,8,.84)!important;--lk-large-blur:none!important}',
};

interface Row {
  browser: string;
  geometry: string;
  variant: string;
  sky: string;
  gaps: [number, number, number];
  fps: number;
  over20: number;
  long: string;
}
const rows: Row[] = [];
const renderers: string[] = [];

async function skyState(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.wc-start-skyhost [data-sky-quality]');
    return el ? `${el.dataset['skyQuality']} ${el.dataset['skyRate'] ?? 'full'}` : 'none';
  });
}

async function measure(page: Page, ms: number, act?: () => Promise<void>) {
  await startMonitor(page);
  if (act) await act();
  await pause(ms);
  const mon = await stopMonitor(page);
  const d = mon.deltas.slice(1);
  const longs = mon.loafSupported ? mon.loaf : mon.longtask;
  return {
    gaps: [pct(d, 50), pct(d, 95), max(d)] as [number, number, number],
    fps: d.length / (d.reduce((a, b) => a + b, 0) / 1000),
    over20: d.filter((x) => x > 20).length,
    long: mon.loafSupported || mon.ltSupported ? `${longs.length}${longs.length ? ` (max ${f1(max(longs))})` : ''}` : 'n/a',
  };
}

const push = (bname: string, geo: string, variant: string, sky: string, m: Awaited<ReturnType<typeof measure>>): void => {
  const row: Row = { browser: bname, geometry: geo, variant, sky, ...m };
  rows.push(row);
  console.log(
    `${bname.padEnd(8)} ${geo.padEnd(20)} ${variant.padEnd(10)} ${sky.padEnd(12)} rAF ${row.gaps.map(f1).join('/')} (${f1(row.fps)} fps) >20ms ${row.over20} long ${row.long}`,
  );
};

const ready = async (page: Page): Promise<void> => {
  await page.waitForSelector('html[data-wc-boot="ready"]', { timeout: 60_000 });
  await page.waitForFunction(() => (window as { __wcSky?: unknown }).__wcSky !== undefined, null, { timeout: 30_000 });
};

for (const bname of BROWSERS) {
  for (const geo of GEOMETRIES.filter((g) => !ONLY_GEO || g.name.startsWith(ONLY_GEO))) {
    const t = await launchTarget(bname, geo.g);
    if (!renderers.some((r) => r.startsWith(bname))) renderers.push(`${bname}: ${await glRenderer(t.browser)}`);
    const open = async (q: string, css?: string): Promise<Page> => {
      const ctx = await t.browser.newContext({ viewport: { width: geo.g.width, height: geo.g.height }, deviceScaleFactor: geo.g.dpr });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => console.error('pageerror:', e.message));
      await page.goto(`${URL_ARG}/?${q}&${SCENE}${geo.q}&skyStats`);
      await ready(page);
      if (css || EXTRA_CSS) await page.addStyleTag({ content: `${css ?? ''}${EXTRA_CSS}` });
      return page;
    };

    // The menu, idle.
    if (ONLY !== 'morph') {
      const page = await open('');
      await pause(2000);
      push(bname, geo.name, 'menu', await skyState(page), await measure(page, SECONDS * 1000));
      await page.context().close();
    }
    // The large box, idle, with and without the blur.
    for (const glass of ONLY === 'morph' ? [] : ['blur', 'flat']) {
      const page = await open('kit=box', GLASS[glass]);
      await page.waitForSelector('.wc-kit-section[data-section="box"]');
      await pause(2500);
      push(bname, geo.name, `large ${glass}`, await skyState(page), await measure(page, SECONDS * 1000));
      await page.context().close();
    }
    // The morph, both ways, as built.
    if (ONLY !== 'idle') {
      const page = await open('kit=box');
      await page.waitForSelector('.wc-kit-section[data-section="box"]');
      await pause(2500);
      for (let i = 0; i < MORPHS; i++) {
        push(bname, geo.name, 'close', await skyState(page), await measure(page, 1400, () => page.keyboard.press('Escape')));
        await pause(600);
        push(bname, geo.name, 'open', await skyState(page), await measure(page, 1400, () => page.keyboard.press('k')));
        await pause(800);
      }
      await page.context().close();
    }
    await t.browser.close();
  }
}

const md = [
  '# Layout B: the large box over the sky — frame times',
  '',
  `Server: ${URL_ARG} (a \`VITE_KIT=1\` production build). Date: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · load ${loadavg()} · ${HEADED ? 'headed (real windows)' : 'headless'} · scene \`${SCENE}\` · idle runs ${SECONDS} s after 2–2.5 s settling; morphs ${MORPHS}× each way, 1.4 s from the key. \`large blur\`: the large window with \`blur(9px)\` and a 0.68 fill; \`large flat\`: no backdrop-filter, a 0.84 fill. Sky: quality tier and rate (\`calm\` behind a large box).`,
  '',
  ...renderers.map((r) => `- ${r}`),
  '',
  '| browser | geometry | variant | sky | rAF ms p50 / p95 / max | fps | frames > 20 ms | long frames (> 50 ms) |',
  '|---|---|---|---|---|---|---|---|',
  ...rows.map(
    (r) => `| ${r.browser} | ${r.geometry} | ${r.variant} | ${r.sky} | ${r.gaps.map(f1).join(' / ')} | ${f1(r.fps)} | ${r.over20} | ${r.long} |`,
  ),
  '',
];
mkdirSync(new URL('./results/', import.meta.url).pathname, { recursive: true });
writeFileSync(OUT, md.join('\n'));
console.log(`wrote ${OUT}`);
