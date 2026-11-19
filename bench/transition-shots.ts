// The morph's proxy mid-flight, as pictures, and two builds compared
// (stage 74 B, ADR 0164: the proxy drawn in transform-only pieces must
// look as the laid-out one did).
//
//   node bench/transition-shots.ts --dist DIR --out DIR                  shoot one build
//   node bench/transition-shots.ts --compare DIR_A DIR_B [--out DIR]     compare two sets
//
// More for shooting: `--base URL` shoots a running server instead of a
// build; `--steps open,close,…` picks the steps (default `open,close`:
// About; `<row>-open,<row>-close` for `profile`, `scripts`, `history`, and
// on a dev server only (`--base`: `?cloudtest`, a guest's answers and the
// flags from the account API) `login`, the owner row to Log in, and
// `community`, whose page then has nothing to list);
// `--geometries phone,tablet,desktop,desktop-odd,desktop-large`;
// `--query '&morph=pieces'` adds to the address; `--at 0,140,…` replaces
// the steps' times (default: ten times over the morph's one clock).
//
// Shooting: serves the build in `--dist` (`vite preview`; build it first:
// `npx vite build --outDir DIR`), opens the start page with a frozen sky
// (`skyFreeze`) at a phone's, a tablet's and two desktop geometries, and
// plays menu → About and About → menu. Right after each tap every
// animation of the document is paused and set to fixed times of the plan
// (`currentTime`), and the page is photographed at each: `<geometry>-
// <step>-<ms>.png`.
//
// (What the pictures cannot show: the page's timers run on while its
// animations stand still. The old frame's hold ends, so pictures before
// about 140 ms may lack the old content; and after a large box closes
// the surface drops `is-from-large` after about a second, which ends the
// wordmark's and the almanac's waiting transitions: in a close's pictures
// they are back too early. Their real timing: the e2e specs' frame
// records, tests/e2e/menu-morph.ts.)
//
// Comparing: for every picture in both sets, the count of pixels that
// differ at all, of those that differ by more than 8 and by more than 32
// of 255 in a channel, the largest difference, and where the differing
// pixels lie (their bounding box); with `--out` a picture of the
// differences (white: more than 8) is written per pair.

import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';

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

const argv = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : def;
};
const OUT = opt('out', '');

const cmp = argv.indexOf('--compare');
if (cmp >= 0) {
  const sharp = (await import('sharp')).default;
  const [a, b] = [resolve(argv[cmp + 1]!), resolve(argv[cmp + 2]!)];
  if (OUT) mkdirSync(OUT, { recursive: true });
  console.log('picture'.padEnd(34), 'size'.padEnd(11), 'differ'.padStart(8), '> 8'.padStart(8), '> 32'.padStart(8), 'max'.padStart(4), ' where (> 8)');
  for (const name of readdirSync(a).filter((n) => n.endsWith('.png')).sort()) {
    const [ia, ib] = await Promise.all([a, b].map((d) => sharp(join(d, name)).removeAlpha().raw().toBuffer({ resolveWithObject: true })));
    const { width, height } = ia!.info;
    if (ib!.info.width !== width || ib!.info.height !== height) {
      console.log(name.padEnd(34), 'sizes differ');
      continue;
    }
    let any = 0;
    let over8 = 0;
    let over32 = 0;
    let worst = 0;
    const box = { x0: width, y0: height, x1: -1, y1: -1 };
    const mask = Buffer.alloc(width * height);
    for (let i = 0, p = 0; i < ia!.data.length; i += 3, p++) {
      const d = Math.max(Math.abs(ia!.data[i]! - ib!.data[i]!), Math.abs(ia!.data[i + 1]! - ib!.data[i + 1]!), Math.abs(ia!.data[i + 2]! - ib!.data[i + 2]!));
      if (d === 0) continue;
      any++;
      if (d > worst) worst = d;
      if (d > 32) over32++;
      if (d > 8) {
        over8++;
        mask[p] = 255;
        const x = p % width;
        const y = (p / width) | 0;
        if (x < box.x0) box.x0 = x;
        if (x > box.x1) box.x1 = x;
        if (y < box.y0) box.y0 = y;
        if (y > box.y1) box.y1 = y;
      } else mask[p] = 60;
    }
    const where = over8 ? `${box.x0},${box.y0} – ${box.x1},${box.y1}` : '—';
    console.log(name.padEnd(34), `${width}×${height}`.padEnd(11), String(any).padStart(8), String(over8).padStart(8), String(over32).padStart(8), String(worst).padStart(4), ` ${where}`);
    if (OUT && any) await sharp(mask, { raw: { width, height, channels: 1 } }).png().toFile(join(OUT, name));
  }
  process.exit(0);
}

const L = await import('./lib');
const { preview } = await import('vite');
const DIST = resolve(opt('dist', 'dist'));
if (!OUT) throw new Error('--out DIR is required');
mkdirSync(OUT, { recursive: true });

const GEOS = [
  { name: 'phone', g: { width: 360, height: 800, dpr: 3 }, q: '&phone=1', mobile: true },
  { name: 'tablet', g: { width: 820, height: 1180, dpr: 2 }, q: '&tablet=phone', mobile: true },
  { name: 'desktop', g: { width: 1920, height: 1080, dpr: 1 }, q: '', mobile: false },
  { name: 'desktop-odd', g: { width: 1367, height: 771, dpr: 1 }, q: '', mobile: false },
  { name: 'desktop-large', g: { width: 2560, height: 1440, dpr: 1 }, q: '', mobile: false },
].filter((g) => opt('geometries', 'phone,tablet,desktop,desktop-odd').split(',').includes(g.name));
const ITEM = (key: string): string => `.wc-start .wc-frame:not([hidden]) .wc-sm-item[data-key="${key}"]`;
const BACK = '.wc-start .wc-frame:not([hidden]) .wc-lk-back';
// Every morph runs on one clock (ADR 0165 addendum): 140 ms out, 380 ms of flight, 220 ms in.
const CLOCK_AT = [60, 139, 200, 270, 330, 400, 519, 560, 640, 740];
const AT = opt('at', '');
// `<row>-open` taps the menu's row, `<row>-close` the page's Back; `open` and `close` are About's.
const ROWS: Record<string, string> = { about: 'about', profile: 'profile', login: 'owner', scripts: 'scripts', history: 'history', community: 'community' };
const STEPS = opt('steps', 'open,close')
  .split(',')
  .map((name) => {
    const m = /^(?:(\w+)-)?(open|close)$/.exec(name);
    const key = m && ROWS[m[1] ?? 'about'];
    if (!m || !key) throw new Error(`no such step: ${name}`);
    return { name, target: m[2] === 'open' ? ITEM(key) : BACK, at: AT ? AT.split(',').map(Number) : CLOCK_AT };
  });

const port = await new Promise<number>((res, rej) => {
  const s = createServer();
  s.once('error', rej);
  s.listen(0, '127.0.0.1', () => {
    const { port } = s.address() as { port: number };
    s.close(() => res(port));
  });
});
const BASE = opt('base', '');
const server = BASE ? null : await preview({ preview: { port, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', build: { outDir: DIST } });
const base = (BASE || (server!.resolvedUrls?.local[0] ?? '')).replace(/\/$/, '');
try {
  for (const geo of GEOS) {
    const t = await L.launchTarget('chromium', geo.g);
    const ctx = await t.browser.newContext({
      viewport: { width: geo.g.width, height: geo.g.height },
      deviceScaleFactor: geo.g.dpr,
      ...(geo.mobile ? { isMobile: true, hasTouch: true } : {}),
    });
    const page = await ctx.newPage();
    // The owner row needs the account API's flags (and `?cloudtest`, a dev server's hook): a guest's answers.
    const login = STEPS.some((s) => /^(login|community)-/.test(s.name));
    if (login) {
      const { DEFAULT_ACCOUNT_LIMITS } = await import('../shared/cloud/api');
      await page.route('**/api/**', (route) => {
        const config = new URL(route.request().url()).pathname === '/api/config';
        const body = config ? { flags: { accounts: true, share: true, gallery: true }, turnstileSiteKey: 'bench', limits: DEFAULT_ACCOUNT_LIMITS, time: Date.now() } : { error: 'not_found' };
        return route.fulfill({ status: config ? 200 : 404, contentType: 'application/json', body: JSON.stringify(body) });
      });
    }
    await page.goto(`${base}/?skyHour=19.1&skyMonth=0&skyDay=21&skyYear=3040&skyFreeze${login ? '&cloudtest' : ''}${geo.q}${opt('query', '')}`);
    await page.waitForSelector('html[data-wc-boot="ready"]', { timeout: 60_000 });
    await L.pause(3000);
    for (const step of STEPS) {
      const el = page.locator(step.target).first();
      await el.waitFor({ state: 'visible' });
      // The tap and the freeze in one task of the page: no frame of the plan runs free. (The
      // scenery's CSS transitions start with the frame's style, after its callbacks: they are
      // caught at the next frame's, a frame old; every time is set below.)
      await el.evaluate((node) => {
        (node as HTMLElement).click();
        const root = document.querySelector<HTMLElement>('.wc-start');
        const t0 = performance.now();
        return new Promise<void>((done) => {
          const freeze = (): void => {
            // (A page that opens a moment after its tap, as the account's: wait for its plan.)
            if (root && !root.dataset['lkMorph'] && performance.now() - t0 < 1000) return void requestAnimationFrame(freeze);
            for (const a of document.getAnimations()) a.pause();
            requestAnimationFrame(() => {
              for (const a of document.getAnimations()) a.pause();
              done();
            });
          };
          requestAnimationFrame(freeze);
        });
      });
      for (const ms of step.at) {
        await page.evaluate((ms) => {
          for (const a of document.getAnimations()) a.currentTime = ms;
          return new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
        }, ms);
        await page.screenshot({ path: join(OUT, `${geo.name}-${step.name}-${String(ms).padStart(4, '0')}.png`) });
      }
      // Let the plan run out before the next step.
      await page.evaluate(() => {
        for (const a of document.getAnimations()) a.play();
      });
      await L.pause(2500);
    }
    await t.browser.close();
    console.log(`${geo.name}: shot`);
  }
} finally {
  if (server) await new Promise<void>((res) => server.httpServer.close(() => res()));
}
writeFileSync(join(OUT, 'README.txt'), `transition-shots of ${BASE || DIST}\n`);
