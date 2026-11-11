// Text speed at a phone's geometry (stage 51, rule 4: the phone's text
// speed must not drop). Run it before and after a change to the phone
// layout and compare the two tables.
//
//   node bench/phone-bench.ts [--quick] [--out <file.md>] [--no-build]
//
// Builds the app, serves the production bundle with `vite preview` on a
// free port and drives one Chromium page (390 × 844 CSS px, ratio 3,
// mobile + touch, `?bench&phone=1`) through the `?bench` probe
// (src/app/bench-hook.ts), with the same three measures as
// bench/browser-bench.ts at the desktop geometry:
//
// - frame → paint: fixture frames injected at random 20–80 ms intervals;
// - burst:         the biggest fixture replayed at max speed;
// - key → send:    a synthetic Enter in the input to the socket's send().
//
// It reads only the probe and the output pane, never the phone's chrome
// (tab strip, menus), so the same script measures the old and the new
// phone layout. Settings are the defaults of a fresh profile: whatever the
// phone shows a new user is what gets measured.
//
//   --quick      about a quarter of the samples (a smoke run)
//   --out FILE   the report (default bench/results/phone-latest.md)
//   --no-build   serve the existing dist/ (build it yourself first)
//
// Attribution (stage 51g: which part of the phone's layout costs what). A
// run with any of these is NOT the default-settings run; its report says so.
//
//   --set PATH=VALUE   a settings value for this run, repeatable
//                      (`--set phone.lens.show=false`); VALUE is JSON, or a
//                      bare word for a string. Applied before the first
//                      frame (`?benchSettings`).
//   --css CSS          a style sheet added to the page (`--css
//                      '.wc-ph-layer{display:none}'`)
//   --eval JS          run in the page after it has opened (the app is
//                      `window.__wcBench.app`)
//   --after JS         evaluated in the burst's page when the burst is done;
//                      its value goes into the RESULT line (a counter that
//                      `--eval` installed)
//   --block REGEX      abort every request whose URL matches (a feature
//                      without its files), repeatable
//   --threads          the browser threads with the most CPU time over the
//                      burst, ms (Linux; into the RESULT line)
//   --only LIST        only these measures: paint, burst, key (comma list)
//   --rounds N         the burst N times, each on a fresh page; the report
//                      gives every round and the median
//   --label TEXT       a name for the run in its report and its RESULT line
//   --no-settle        measure 300 ms after the page's first frames, as this
//                      script did before stage 51g: the phone layer's chunk
//                      and the lens's map may then still be loading (the
//                      first seconds after Enter MUME). The default waits
//                      for both: the steady state a player is in.
//
// Every run ends with one `RESULT {json}` line on stdout (for a script that
// compares runs).
//
// Fixture: the owner's biggest raw log under $WEBCOCKPIT_FIXTURES (default
// /home/ole/MUME/data/runs), else the biggest log in tests/fixtures. A
// before/after pair must use the same one (the report names it).

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { createServer } from 'node:net';
import { dirname } from 'node:path';

// Extensionless relative imports (the repo's style) resolve to .ts files.
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

const { listFixtures } = await import('../tests/e2e/fixtures');
const L = await import('./lib');
const { build, preview } = await import('vite');
const { pct, median, max, f1, f3, pause, loadavg, startMonitor, stopMonitor, closePage } = L;
type Geometry = import('./lib').Geometry;
type Target = import('./lib').Target;
type Page = import('@playwright/test').Page;

// ---------------------------------------------------------------- options

const argv = process.argv.slice(2);
const QUICK = argv.includes('--quick');
const NO_BUILD = argv.includes('--no-build');
const outAt = argv.indexOf('--out');
const OUT = outAt >= 0 && argv[outAt + 1] ? argv[outAt + 1]! : new URL('./results/phone-latest.md', import.meta.url).pathname;
const flagsText = argv.length ? argv.join(' ') : '(none)';
/** The values of a repeatable `--flag VALUE`. */
const many = (flag: string): string[] => argv.flatMap((a, i) => (a === flag && argv[i + 1] !== undefined ? [argv[i + 1]!] : []));
const one = (flag: string): string | null => many(flag).at(-1) ?? null;
/** `--set a.b.c=value` as one settings patch. */
const SETTINGS: Record<string, unknown> = {};
for (const kv of many('--set')) {
  const eq = kv.indexOf('=');
  if (eq < 1) throw new Error(`--set wants PATH=VALUE, got ${kv}`);
  const raw = kv.slice(eq + 1);
  let value: unknown = raw;
  try {
    value = JSON.parse(raw);
  } catch {
    // a bare word: a string
  }
  const keys = kv.slice(0, eq).split('.');
  let at = SETTINGS;
  for (const k of keys.slice(0, -1)) at = (at[k] ??= {}) as Record<string, unknown>;
  at[keys.at(-1)!] = value;
}
const CSS = many('--css').join('\n');
const EVAL = many('--eval');
/** `--after JS`: evaluated in the burst's page when it is done; its value goes into the RESULT line (counters set up by `--eval`). */
const AFTER = one('--after');
const afters: unknown[] = [];
/** `--threads`: the browser threads with the most CPU time over the burst (Linux, /proc), into the RESULT line. */
const THREADS = argv.includes('--threads');
const threadTops: string[][] = [];
const requests: string[][] = [];

/** What a browser process is, from its command line: `gpu-process`, `renderer`, `utility`, or `browser`. */
function procKind(pid: number): string {
  try {
    return /--type=([a-z-]+)/.exec(readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' '))?.[1] ?? 'browser';
  } catch {
    return '?';
  }
}

/** CPU ticks (user + system) of every thread of every descendant process of this script, keyed `pid/tid name`. */
function threadTicks(): Map<string, number> {
  const out = new Map<string, number>();
  const kids = (pid: number): number[] => {
    try {
      const list = readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim().split(/\s+/).filter(Boolean).map(Number);
      return list.flatMap((k) => [k, ...kids(k)]);
    } catch {
      return [];
    }
  };
  for (const pid of kids(process.pid)) {
    let tids: string[] = [];
    try {
      tids = readdirSync(`/proc/${pid}/task`);
    } catch {
      continue;
    }
    for (const tid of tids) {
      try {
        const stat = readFileSync(`/proc/${pid}/task/${tid}/stat`, 'utf8');
        const name = stat.slice(stat.indexOf('(') + 1, stat.lastIndexOf(')'));
        const f = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
        out.set(`${pid}/${tid} ${name}`, Number(f[11]) + Number(f[12]));
      } catch {
        // the thread ended
      }
    }
  }
  return out;
}
const ONLY = new Set((one('--only') ?? 'paint,burst,key').split(',').map((x) => x.trim()));
const ROUNDS = Math.max(1, Number(one('--rounds') ?? 1) || 1);
const LABEL = one('--label') ?? '';
/** Wait for the phone layer and the lens's map before measuring (`--no-settle`: measure 300 ms after the first frames, while they still load). */
const SETTLE = !argv.includes('--no-settle');
/** Anything that makes this run another than the default-settings one. */
const VARIANT = Object.keys(SETTINGS).length > 0 || CSS !== '' || EVAL.length > 0 || many('--block').length > 0;
const scaled = (n: number, min: number) => Math.max(min, Math.round(n * (QUICK ? 0.25 : 1)));

/** An iPhone 12–14 sized screen: the geometry of the stage 51 mockups. */
const PHONE: Geometry = { width: 390, height: 844, dpr: 3 };
// The real GPU when the machine has one, as browser-bench does (WC_BENCH_GPU=0: software GL).
const TARGET = process.env.WC_BENCH_GPU === '0' ? 'chromium' : 'chromium-gpu';

// ---------------------------------------------------------------- fixture

const fixture = (() => {
  const owner = listFixtures().at(-1);
  if (owner) return { name: owner.rel, path: owner.path, size: owner.size };
  const dir = new URL('../tests/fixtures/', import.meta.url).pathname;
  const repo = readdirSync(dir)
    .filter((n) => n.endsWith('.log'))
    .map((n) => ({ name: `tests/fixtures/${n}`, path: dir + n, size: statSync(dir + n).size }))
    .sort((a, b) => a.size - b.size);
  return repo.at(-1)!;
})();
const logText = readFileSync(fixture.path, 'utf8');

// ------------------------------------------------------------------- page

/**
 * A fresh phone context on the `?bench` page. lib.ts's openBench has no
 * way to add `phone=1` or a mobile context, so this is its phone twin.
 */
async function open(t: Target, base: string): Promise<Page> {
  const ctx = await t.browser.newContext({
    viewport: { width: PHONE.width, height: PHONE.height },
    deviceScaleFactor: PHONE.dpr,
    isMobile: true,
    hasTouch: true,
  });
  // `--block REGEX`: requests whose URL matches are aborted (attribution: a feature without its assets).
  for (const re of many('--block')) await ctx.route(new RegExp(re), (route) => route.abort());
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  const patch = Object.keys(SETTINGS).length ? `&benchSettings=${encodeURIComponent(JSON.stringify(SETTINGS))}` : '';
  await page.goto(`${base}/?bench&phone=1${patch}`);
  await page.waitForFunction(() => window.__wcBench !== undefined && window.__wcBench.app !== null);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // The first frames after load are not part of any measure.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await pause(300);
  // `wc-phone` on <html> is the device flag itself (src/core/device.ts), not
  // layout chrome. Without it the numbers would silently be the desktop's.
  if (!(await page.evaluate(() => document.documentElement.classList.contains('wc-phone'))))
    throw new Error('the page did not start as a phone (no wc-phone on <html>)');
  // Where there is a phone layer (stage 51), it is up before anything is measured: it comes with
  // its own chunk a moment after the cockpit. (Before stage 51 there is none: nothing to wait for.)
  if (SETTLE && (await page.evaluate(() => document.querySelector('.wc-cockpit[data-phone-game]') !== null))) {
    await page.waitForFunction(() => document.querySelector('.wc-cockpit[data-phone-game] > .wc-ph-layer') !== null, undefined, { timeout: 10_000 });
    // The lens's map: loaded and drawn (or not shown) before the measure, as it is for a player a few seconds in.
    await page
      .waitForFunction(
        () => {
          const lens = document.querySelector<HTMLElement>('.wc-ph-lens');
          if (!lens || lens.hidden) return true;
          const st = document.querySelector<HTMLElement>('.wc-pane-map .wc-pane-content')?.dataset.mapState;
          return st === 'loaded' || st === 'error' || st === 'none';
        },
        undefined,
        { timeout: 30_000 },
      )
      .catch(() => {});
    await pause(500);
  }
  if (CSS) await page.addStyleTag({ content: CSS });
  for (const js of EVAL) await page.evaluate(js);
  if (CSS || EVAL.length) await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return page;
}

/** What was measured: the real viewport, ratio, and the output pane's box in CSS px. */
async function describe(page: Page): Promise<string> {
  const d = await page.evaluate(() => {
    const r = window.__wcBench!.app!.output.el.getBoundingClientRect();
    const lens = document.querySelector<HTMLElement>('.wc-ph-lens');
    return {
      w: innerWidth,
      h: innerHeight,
      dpr: devicePixelRatio,
      ow: Math.round(r.width),
      oh: Math.round(r.height),
      game: document.querySelector('.wc-cockpit[data-phone-game]') !== null,
      lens: lens !== null && !lens.hidden,
    };
  });
  const layout = d.game ? `the phone's game layout (lens ${d.lens ? 'shown' : 'not shown'})` : 'the tab-strip layout';
  return `viewport ${d.w} × ${d.h}, ratio ${d.dpr}; output pane ${d.ow} × ${d.oh} CSS px; ${layout}`;
}

// --------------------------------------------------------------- measures

/** Fixture frames through the fake socket at 20–80 ms: receipt → painted. */
async function framePaint(page: Page) {
  await page.evaluate(() => window.__wcBench!.connectFake());
  const WARM = 10; // the first frames pay for JIT and first layout
  const total = await page.evaluate(([text, k]) => window.__wcBench!.loadFrames(text, 1, k), [logText, scaled(400, 80) + WARM] as const);
  const toPaint: number[] = [];
  const script: number[] = [];
  for (let i = 0; i < total; i++) {
    const r = await page.evaluate((k) => window.__wcBench!.inject(k), i);
    if (i >= WARM) {
      toPaint.push(r.toPaint);
      script.push(r.script);
    }
    await pause(i < WARM ? 30 : 20 + Math.random() * 60);
  }
  return { n: toPaint.length, toPaint, script };
}

/** The whole fixture replayed at speed 0 through the real session, until the output drained. */
async function burst(page: Page) {
  // Hand the text over first: deserialising a multi-MB argument blocks the
  // page, which is the harness, not the app.
  await page.evaluate((s) => {
    (window as unknown as { __benchText: string }).__benchText = s;
  }, logText);
  await pause(300);
  await startMonitor(page);
  const before = THREADS ? threadTicks() : null;
  // With the threads: what the page (and its workers) asked the network for during the burst.
  const asked: string[] = [];
  const onRequest = (q: { url(): string }): void => void asked.push(q.url().replace(/^https?:\/\/[^/]+/, ''));
  if (THREADS) page.context().on('request', onRequest);
  const r = await page.evaluate(() => window.__wcBench!.replay((window as unknown as { __benchText: string }).__benchText, 0));
  if (before) {
    const after = threadTicks();
    // Ticks are 10 ms on Linux: the busiest threads, by name (several of one name are summed, but not the workers).
    const byName = new Map<string, number>();
    for (const [k, v] of after) {
      const d = v - (before.get(k) ?? 0);
      // (Workers one by one: which worker it is matters.)
      // The processes' main threads (all named alike) one by one too, with what the process is.
      const main = k.split(' ')[0]!.split('/')[0] === k.split(' ')[0]!.split('/')[1];
      const name = k.includes('DedicatedWorker') ? k : main ? `${k.slice(k.indexOf(' ') + 1)}[${procKind(Number(k.split('/')[0]))}]` : k.slice(k.indexOf(' ') + 1);
      if (d > 0) byName.set(name, (byName.get(name) ?? 0) + d * 10);
    }
    page.context().off('request', onRequest);
    requests.push(asked.length > 12 ? [...asked.slice(0, 12), `… ${asked.length} in all`] : asked);
    threadTops.push([...byName].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, ms]) => `${n} ${ms}`));
  }
  const mon = await stopMonitor(page);
  if (AFTER) afters.push(await page.evaluate(AFTER));
  return {
    ms: r.ms,
    lines: r.lines,
    linesPerSec: r.lines / (r.ms / 1000),
    // The longest gap between two animation frames, and Chromium's own
    // Long Animation Frame record (0 when there was none over 50 ms).
    maxGap: max(mon.deltas),
    p95Gap: pct(mon.deltas, 95),
    loafMax: mon.loafSupported ? (mon.loaf.length ? max(mon.loaf) : 0) : NaN,
  };
}

/** Enter in the input with a command typed: keydown dispatch → socket send. */
async function keySend(page: Page) {
  await page.evaluate(() => window.__wcBench!.connectFake());
  const times: number[] = [];
  const total = scaled(220, 60);
  for (let i = 0; i < total; i++) {
    const ms = await page.evaluate(() => window.__wcBench!.keyToSend('look'));
    if (i >= 20) times.push(ms); // the first 20 warm the JIT
    if (i % 10 === 0) await pause(5);
  }
  // -1 is the probe's "nothing was sent": never let it pass as a fast key.
  const failed = times.filter((x) => x < 0).length;
  return { n: times.length, times: times.filter((x) => x >= 0), failed };
}

// ------------------------------------------------------------------- main

/** A port nothing listens on (other jobs use the usual ones). */
const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });

const git = (cmd: string) => {
  try {
    return execSync(`git ${cmd}`, { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};
// Uncommitted changes to tracked files make the hash a lie: say so.
const commit = (git('rev-parse --short HEAD') || 'unknown') + (git('status --porcelain --untracked-files=no') ? ' (with uncommitted changes)' : '');

if (!NO_BUILD) {
  console.log('phone-bench: building…');
  await build({ logLevel: 'warn' });
}
const server = await preview({ preview: { port: await freePort(), strictPort: true, host: '127.0.0.1' }, logLevel: 'warn' });
const base = (server.resolvedUrls?.local[0] ?? '').replace(/\/$/, '');
const loadStart = loadavg();
console.log(`phone-bench: ${base}, commit ${commit}, fixture ${fixture.name} (${(fixture.size / 1e6).toFixed(2)} MB), load ${loadStart}, flags ${flagsText}`);

let version = '';
let gl = '';
let what = '';
let paint: Awaited<ReturnType<typeof framePaint>> | null = null;
const bigs: Awaited<ReturnType<typeof burst>>[] = [];
let key: Awaited<ReturnType<typeof keySend>> | null = null;
try {
  const t = await L.launchTarget(TARGET, PHONE);
  try {
    version = t.browser.version();
    gl = await L.glRenderer(t.browser);
    // One fresh page per measure, so none inherits the other's scrollback.
    const run = async <T>(label: string, fn: (page: Page) => Promise<T>): Promise<T> => {
      console.log(`  ${label}…`);
      const page = await open(t, base);
      try {
        what ||= await describe(page);
        return await fn(page);
      } finally {
        await closePage(page);
      }
    };
    if (ONLY.has('paint')) paint = await run('frame → paint', framePaint);
    if (ONLY.has('burst')) for (let i = 0; i < ROUNDS; i++) bigs.push(await run(ROUNDS > 1 ? `burst ${i + 1}/${ROUNDS}` : 'burst', burst));
    if (ONLY.has('key')) key = await run('key → send', keySend);
  } finally {
    await t.browser.close();
  }
} finally {
  await new Promise<void>((r) => server.httpServer.close(() => r()));
}

// ----------------------------------------------------------------- report

/** The burst to report: the round with the median total time (every round is listed too). */
const big = bigs.length ? [...bigs].sort((a, b) => a.ms - b.ms)[Math.floor((bigs.length - 1) / 2)]! : null;
const rows: string[] = [];
if (paint) {
  rows.push(`| frame → paint, ms (median / p95 / max; ${paint.n} frames at 20–80 ms) | ${f1(median(paint.toPaint))} / ${f1(pct(paint.toPaint, 95))} / ${f1(max(paint.toPaint))} |`);
  rows.push(`| … its flush script, ms (median / p95 / max) | ${f1(median(paint.script))} / ${f1(pct(paint.script, 95))} / ${f1(max(paint.script))} |`);
}
if (big) {
  rows.push(`| burst: longest frame, ms (rAF gap max; p95) | ${f1(big.maxGap)}; ${f1(big.p95Gap)} |`);
  rows.push(`| burst: longest Long Animation Frame, ms | ${f1(big.loafMax)} |`);
  rows.push(`| burst: total time, ms (${big.lines} lines) | ${big.ms.toFixed(0)} |`);
  rows.push(`| burst: lines/s | ${big.linesPerSec.toFixed(0)} |`);
  if (bigs.length > 1) rows.push(`| burst: every round, total ms (longest frame) | ${bigs.map((b) => `${b.ms.toFixed(0)} (${f1(b.maxGap)})`).join(', ')} |`);
}
if (key) rows.push(`| key → send, ms (median / p95 / max; n = ${key.n}${key.failed ? `, **${key.failed} not sent**` : ''}) | ${f3(median(key.times))} / ${f3(pct(key.times, 95))} / ${f3(max(key.times))} |`);

const md = [
  `# Phone text speed${LABEL ? `: ${LABEL}` : ''}`,
  '',
  `- Date: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
  `- Commit: ${commit}`,
  `- Flags: ${flagsText}${QUICK ? ' — a quick run: a smoke test, not numbers to compare' : ''}`,
  `- Browser: Chromium ${version}, headless${TARGET === 'chromium-gpu' ? ` (\`${L.gpuArgs().join(' ')}\`)` : ''}; WebGL: ${gl}`,
  `- Page: \`?bench&phone=1\`, mobile + touch, ${what}${SETTLE ? '' : '; measured while the page still loads (--no-settle)'}; ${VARIANT ? '**a variant, not the default settings** (see the flags)' : 'default settings'}`,
  `- Fixture: \`${fixture.name}\` (${(fixture.size / 1e6).toFixed(2)} MB)`,
  `- Load average: ${loadStart} at the start, ${loadavg()} at the end`,
  '',
  '| measure | result |',
  '|---|---|',
  ...rows,
  '',
  'Frame → paint includes the wait for the next animation frame (about half a frame at the median); the flush script row is the app\'s own part of it. Key → send is a synthetic Enter keydown on the input (the probe\'s `keyToSend`), not a tap on a soft keyboard.',
  '',
].join('\n');

console.log('\n' + md);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, md);
console.log(`wrote ${OUT}`);
console.log(
  `RESULT ${JSON.stringify({
    label: LABEL,
    commit,
    variant: VARIANT,
    load: loadStart,
    what,
    paint: paint ? { median: median(paint.toPaint), p95: pct(paint.toPaint, 95), scriptMedian: median(paint.script), scriptP95: pct(paint.script, 95) } : null,
    burst: bigs.map((b) => ({ ms: b.ms, maxGap: b.maxGap, p95Gap: b.p95Gap, loaf: b.loafMax, lines: b.lines })),
    key: key ? { median: median(key.times), p95: pct(key.times, 95), failed: key.failed } : null,
    ...(afters.length ? { after: afters } : {}),
    ...(threadTops.length ? { threads: threadTops, requests } : {}),
  })}`,
);
