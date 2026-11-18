// The start menu's page transitions, frame by frame (stage 74 B, ADR 0164).
//
//   node bench/transition-bench.ts [--no-build] [--dist DIR] [--rounds 5] [--throttle 4,6]
//                                  [--geometries phone,tablet,…] [--scenarios about,scripts,…] [--browser firefox]
//                                  [--settle 2500] [--label TEXT] [--out FILE] [--json FILE]
//                                  [--css CSS] [--trace-dir DIR]
//
// Builds the app (or serves an existing build: `--no-build`, `--dist DIR`
// for another output directory, so a baseline build and a changed one can
// be measured in the same sitting), serves it with `vite preview` and
// drives Chromium through the start menu's transitions:
//
// - `phone`: 360 × 800 CSS px at ratio 3, mobile + touch, `?phone=1`, the
//   CPU throttled (CDP `Emulation.setCPUThrottlingRate`, default 4× and 6×);
// - `tablet`, `tablet-land`: 820 × 1180 and 1180 × 820 at ratio 2, touch,
//   `?tablet=phone`, 4×;
// - `desktop`, `desktop-large`: 1920 × 1080 and 2560 × 1440 at ratio 1, at
//   1× and 4×.
//
// `--browser firefox`: Playwright's Firefox on the desktop geometries,
// frame intervals only (no CDP there: no throttle and no trace).
//
// A scenario is a fresh page (a fresh context: nothing cached, nothing
// warm) and a list of steps; every step is played twice, so each has a
// **first visit after a fresh load** and a **second visit**:
//
// - `about`, `scripts`, `history`, `profile`: the menu's row, then Back;
// - `scripts-warm`: Scripts' first visit after About has been open and
//   closed (the page's own first-visit cost, apart from the first flight's);
// - `privacy`: About → its privacy page (a large → large swap) → Back;
// - `tabs`: inside History, the tabs Spotlights → Diary (the Credits page's chronicle) → Sessions.
//
// (The Community page needs the flags and a server: only the dev server's
// fakes have it, tests/e2e/community.ts. Not measured here.)
//
// Per step, from the tap's `click` event over the step's window (1.4 s; a
// morph's plan is at most 1.3 s):
//
// - animation frame intervals (the page's rAF): count, the ones over 20,
//   34 and 50 ms, p95, the worst, and the same for the frames while the
//   proxy is out (the flight);
// - a DevTools trace of the window: main-thread time by kind (script,
//   style, layout, paint and pre-paint, layerize and commit, GC), the
//   raster and image-decode time on every thread, the GPU process's time,
//   the main-thread tasks over 30 ms with when they ran and what they
//   were, the compositor's drawn frames, and which animations the
//   compositor refused (`compositeFailed`: they run on the main thread).
//
// What this can and cannot see. The CPU throttle slows the renderer's
// main thread only: raster threads, the compositor and the GPU process
// run at this machine's speed, and headless Chromium's GPU (or its
// software GL) is no phone GPU. So the bench sees main-thread work
// (script, style, layout, paint recording) and how much raster a step
// asks for, but not what that raster costs on a phone, nor texture
// upload, thermal limits or a 120 Hz panel. Raster and GPU time are
// reported unthrottled, as a measure of the work asked for.
//
// Every run ends with `RESULT {json}` on stdout; `--json FILE` writes the
// rows. The report goes to `--out` (default bench/results/transitions.md).

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';

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
const { build, preview } = await import('vite');
const { pct, max, median, f1, pause, loadavg } = L;
type Geometry = import('./lib').Geometry;
type Page = import('@playwright/test').Page;
type CDPSession = import('@playwright/test').CDPSession;

// ---------------------------------------------------------------- options

const argv = process.argv.slice(2);
const has = (flag: string): boolean => argv.includes(flag);
const opt = (name: string, def: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : def;
};
const ROUNDS = Math.max(1, Number(opt('rounds', '5')) || 5);
const SETTLE = Number(opt('settle', '2500'));
const WINDOW = Number(opt('window', '1400'));
const LABEL = opt('label', '');
const OUT = opt('out', new URL('./results/transitions.md', import.meta.url).pathname);
const JSON_OUT = opt('json', '');
const DIST = opt('dist', '');
const CSS = opt('css', '');
const TRACE_DIR = opt('trace-dir', '');
const SCENE = opt('scene', 'skyMonth=0&skyHour=19.1&skyDay=21&skyYear=3040&skyWeather=fair');
const CHROMIUM = process.env.WC_BENCH_GPU === '0' ? 'chromium' : 'chromium-gpu';

interface Geo {
  name: string;
  g: Geometry;
  q: string;
  mobile: boolean;
  throttles: number[];
}
const list = (name: string, def: string): string[] => opt(name, def).split(',').filter(Boolean);
const PHONE_THROTTLES = list('throttle', '4,6').map(Number);
const DESKTOP_THROTTLES = list('desktop-throttle', '1,4').map(Number);
const TABLET_THROTTLES = list('tablet-throttle', '4').map(Number);
/** `--browser firefox`: frame intervals only (no CDP: no throttle, no trace), on the desktop geometries. */
const BROWSER = opt('browser', 'chromium') as 'chromium' | 'firefox';
const FIREFOX = BROWSER === 'firefox';
const ALL_GEOS: Geo[] = [
  { name: 'phone', g: { width: 360, height: 800, dpr: 3 }, q: '&phone=1', mobile: true, throttles: PHONE_THROTTLES },
  { name: 'tablet', g: { width: 820, height: 1180, dpr: 2 }, q: '&tablet=phone', mobile: true, throttles: TABLET_THROTTLES },
  { name: 'tablet-land', g: { width: 1180, height: 820, dpr: 2 }, q: '&tablet=phone', mobile: true, throttles: TABLET_THROTTLES },
  { name: 'desktop', g: { width: 1920, height: 1080, dpr: 1 }, q: '', mobile: false, throttles: DESKTOP_THROTTLES },
  { name: 'desktop-large', g: { width: 2560, height: 1440, dpr: 1 }, q: '', mobile: false, throttles: DESKTOP_THROTTLES },
];
const GEOS = ALL_GEOS.filter((g) => list('geometries', FIREFOX ? 'desktop,desktop-large' : 'phone,tablet,tablet-land,desktop,desktop-large').includes(g.name)).map((g) =>
  FIREFOX ? { ...g, throttles: [1], mobile: false } : g,
);

// ---------------------------------------------------------------- scenarios

interface Step {
  /** The step's name in the report. */
  name: string;
  /** The transition's plan, as `data-lk-morph` names it (for the report only). */
  kind: string;
  /** Finds the element to tap (in the page). */
  target: string;
}
interface Scenario {
  name: string;
  /** Steps played before the measured ones, unmeasured (the way in). */
  lead?: string[];
  steps: Step[];
}
const row = (key: string): string => `.wc-start .wc-frame:not([hidden]) .wc-sm-item[data-key="${key}"]`;
const BACK = '.wc-start .wc-frame:not([hidden]) .wc-lk-back';
const tab = (t: string): string => `.wc-start .wc-frame:not([hidden]) .wc-htabs [data-tab="${t}"]`;
const menuPage = (key: string, kind = 'open'): Scenario => ({
  name: key,
  steps: [
    { name: `menu → ${key}`, kind, target: row(key) },
    { name: `${key} → menu`, kind: kind === 'open' ? 'close' : kind, target: BACK },
  ],
});
const SCENARIOS: Scenario[] = [
  menuPage('about'),
  menuPage('scripts'),
  menuPage('history'),
  menuPage('profile', 'none'),
  {
    // A page's first visit when another page has been open: what is the page's own, and what the first flight's.
    name: 'scripts-warm',
    lead: [row('about'), BACK],
    steps: [
      { name: 'menu → scripts (after about)', kind: 'open', target: row('scripts') },
      { name: 'scripts → menu (after about)', kind: 'close', target: BACK },
    ],
  },
  {
    name: 'privacy',
    lead: [row('about')],
    steps: [
      { name: 'about → privacy', kind: 'swap', target: '.wc-start .wc-frame:not([hidden]) .wc-about a.wc-about-a[href$="privacy"]' },
      { name: 'privacy → about', kind: 'swap', target: BACK },
    ],
  },
  {
    name: 'tabs',
    lead: [row('history')],
    steps: [
      { name: 'sessions → spotlights (tab)', kind: 'swap', target: tab('spotlights') },
      { name: 'spotlights → diary (tab)', kind: 'swap', target: tab('diary') },
      { name: 'diary → sessions (tab)', kind: 'swap', target: tab('sessions') },
    ],
  },
].filter((s) => opt('scenarios', 'about,scripts,scripts-warm,history,profile,privacy,tabs').split(',').includes(s.name));

// ---------------------------------------------------------------- the page's monitor

/** Installed before the app: every animation frame's time, and each `click`'s. */
const MONITOR = `(() => {
  const m = { frames: [], flying: [], clicks: [], on: false };
  window.__tb = m;
  let proxy = null;
  const tick = (t) => {
    if (m.on) {
      m.frames.push(performance.now());
      proxy = proxy && proxy.isConnected ? proxy : document.querySelector('.wc-lk-morph');
      m.flying.push(proxy && !proxy.hidden ? 1 : 0);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.addEventListener('click', () => m.on && m.clicks.push(performance.now()), true);
})()`;

interface FrameStats {
  n: number;
  over20: number;
  over34: number;
  over50: number;
  p95: number;
  worst: number;
  /** ms from the click to the first frame after it (the click's own work). */
  first: number;
  /** The flight (the frames while the proxy is out). */
  fly: { n: number; over20: number; over34: number; worst: number };
}

function frameStats(frames: number[], flying: number[], t0: number, len: number): FrameStats {
  const d: number[] = [];
  const fd: number[] = [];
  let first = NaN;
  for (let i = 1; i < frames.length; i++) {
    const t = frames[i]!;
    if (t <= t0 || t > t0 + len) continue;
    const prev = frames[i - 1]!;
    if (prev <= t0) {
      first = t - t0;
      continue;
    }
    d.push(t - prev);
    if (flying[i] && flying[i - 1]) fd.push(t - prev);
  }
  const over = (xs: number[], ms: number): number => xs.filter((x) => x > ms).length;
  return {
    n: d.length,
    over20: over(d, 20),
    over34: over(d, 34),
    over50: over(d, 50),
    p95: pct(d, 95),
    worst: max(d),
    first,
    fly: { n: fd.length, over20: over(fd, 20), over34: over(fd, 34), worst: max(fd) },
  };
}

// ---------------------------------------------------------------- the trace

interface TraceEv {
  name: string;
  cat?: string;
  ph: string;
  ts: number;
  dur?: number;
  pid: number;
  tid: number;
  args?: { name?: string; data?: Record<string, unknown> & { type?: string; functionName?: string; url?: string } };
}

interface TraceStats {
  /** Main-thread ms by kind over the window (wall time: stretched by the throttle). */
  main: { script: number; style: number; layout: number; paint: number; commit: number; gc: number; total: number };
  /** Every thread's raster ms and image-decode ms; the GPU process's task ms (not throttled). */
  raster: number;
  decode: number;
  gpu: number;
  /** Main-thread tasks over 30 ms: when (ms from the click), how long, what. */
  long: { at: number; ms: number; label: string }[];
  /** The compositor's drawn frames: count and the gaps over 20 / 34 ms. */
  drawn: { n: number; over20: number; over34: number; worst: number };
  /** Animations the compositor refused, as `property: reason bits`. */
  mainAnims: string[];
  /** Animations started in the window. */
  anims: number;
}

const SCRIPT = /^(FunctionCall|EvaluateScript|EventDispatch|TimerFire|FireAnimationFrame|RunMicrotasks|v8\.callFunction|FireIdleCallback)$/;
const KIND: [keyof TraceStats['main'], RegExp][] = [
  ['style', /^(UpdateLayoutTree|RecalculateStyles|ParseAuthorStyleSheet|ScheduleStyleRecalculation)$/],
  ['layout', /^(Layout|IntersectionObserverController::computeIntersections|ResizeObserverController::gatherObservations)$/],
  ['paint', /^(Paint|PrePaint|PaintImage)$/],
  ['commit', /^(Layerize|Commit|UpdateLayer|CompositeLayers)$/],
  ['gc', /^(MinorGC|MajorGC|V8\.GC.*|BlinkGC\..*)$/],
];

function traceStats(buf: Buffer, len: number): TraceStats | null {
  const all = (JSON.parse(buf.toString()) as { traceEvents: TraceEv[] }).traceEvents;
  const names = new Map<string, string>();
  const procs = new Map<number, string>();
  for (const e of all) {
    if (e.ph !== 'M') continue;
    if (e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args?.name ?? '');
    if (e.name === 'process_name') procs.set(e.pid, e.args?.name ?? '');
  }
  // The main thread: the renderer main with the click on it.
  const click = all.find((e) => e.name === 'EventDispatch' && e.args?.data?.type === 'click' && names.get(`${e.pid}:${e.tid}`) === 'CrRendererMain');
  if (!click) return null;
  const mainKey = `${click.pid}:${click.tid}`;
  const t0 = click.ts;
  const t1 = t0 + len * 1000;
  const inWin = (e: TraceEv): boolean => e.ts + (e.dur ?? 0) > t0 && e.ts < t1;
  const clip = (e: TraceEv): number => (Math.min(t1, e.ts + (e.dur ?? 0)) - Math.max(t0, e.ts)) / 1000;
  const mainEv = all.filter((e) => `${e.pid}:${e.tid}` === mainKey && e.ph === 'X' && e.dur !== undefined && inWin(e)).sort((a, b) => a.ts - b.ts || (b.dur ?? 0) - (a.dur ?? 0));

  // Outermost events of a set (nested ones are part of their parent).
  const outer = (evs: TraceEv[]): TraceEv[] => {
    const out: TraceEv[] = [];
    let end = -Infinity;
    for (const e of evs) {
      if (e.ts < end) continue;
      out.push(e);
      end = e.ts + (e.dur ?? 0);
    }
    return out;
  };
  const sumOf = (re: RegExp): number => outer(mainEv.filter((e) => re.test(e.name))).reduce((a, e) => a + clip(e), 0);
  const main = { script: 0, style: 0, layout: 0, paint: 0, commit: 0, gc: 0, total: 0 };
  for (const [k, re] of KIND) main[k] = sumOf(re);
  // Script: the outermost script events, less the style, layout and GC inside them.
  const scripts = outer(mainEv.filter((e) => SCRIPT.test(e.name)));
  const inside = (e: TraceEv, re: RegExp): number =>
    outer(mainEv.filter((k) => re.test(k.name) && k.ts >= e.ts && k.ts + (k.dur ?? 0) <= e.ts + (e.dur ?? 0))).reduce((a, k) => a + clip(k), 0);
  for (const s of scripts) main.script += clip(s) - inside(s, KIND[0]![1]) - inside(s, KIND[1]![1]) - inside(s, KIND[4]![1]);
  const tasks = outer(mainEv.filter((e) => e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask'));
  main.total = tasks.reduce((a, e) => a + clip(e), 0);

  const label = (t: TraceEv): string => {
    const by = new Map<string, number>();
    for (const k of mainEv) {
      if (k === t || k.ts < t.ts || k.ts + (k.dur ?? 0) > t.ts + (t.dur ?? 0)) continue;
      if (k.name === 'RunTask' || k.name === 'ThreadControllerImpl::RunTask') continue;
      let n = '';
      if (SCRIPT.test(k.name)) n = k.name === 'EventDispatch' ? `event ${k.args?.data?.type ?? '?'}` : k.name === 'FunctionCall' ? `fn ${k.args?.data?.functionName || '?'}` : k.name;
      else for (const [kind, re] of KIND) if (re.test(k.name)) n = kind;
      if (!n) continue;
      by.set(n, (by.get(n) ?? 0) + (k.dur ?? 0) / 1000);
    }
    return [...by].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ') || '—';
  };
  const long = tasks
    .filter((t) => (t.dur ?? 0) >= 30_000)
    .map((t) => ({ at: (t.ts - t0) / 1000, ms: (t.dur ?? 0) / 1000, label: label(t) }));

  const everywhere = all.filter((e) => e.ph === 'X' && e.dur !== undefined && inWin(e));
  const raster = everywhere.filter((e) => e.name === 'RasterTask' || e.name === 'Rasterize').reduce((a, e) => a + clip(e), 0);
  const decode = everywhere.filter((e) => /^(Decode Image|ImageDecodeTask|Decode LazyPixelRef|Draw LazyPixelRef)$/.test(e.name)).reduce((a, e) => a + clip(e), 0);
  const gpuPids = new Set([...procs].filter(([, n]) => /gpu/i.test(n)).map(([p]) => p));
  const gpu = everywhere.filter((e) => gpuPids.has(e.pid) && (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask' || e.name === 'GPUTask')).reduce((a, e) => a + clip(e), 0);

  // The compositor's drawn frames (the renderer's): one `DrawFrame` each.
  const draws = all
    .filter((e) => e.name === 'DrawFrame' && e.pid === click.pid && e.ts > t0 && e.ts < t1)
    .map((e) => e.ts / 1000)
    .sort((a, b) => a - b);
  const gaps = draws.slice(1).map((t, i) => t - draws[i]!);
  const drawn = { n: draws.length, over20: gaps.filter((g) => g > 20).length, over34: gaps.filter((g) => g > 34).length, worst: max(gaps) };

  // Animations: each start, and the compositor's refusals.
  const animEv = all.filter((e) => e.name === 'Animation' && e.pid === click.pid && e.ts >= t0 && e.ts < t1);
  const refused = new Map<string, number>();
  let anims = 0;
  for (const e of animEv) {
    if (e.ph === 'b') anims++;
    const d = e.args?.data as { compositeFailed?: number; unsupportedProperties?: string[] } | undefined;
    if (!d || !d.compositeFailed) continue;
    const key = `${(d.unsupportedProperties ?? []).join('+') || '(supported props)'}: ${d.compositeFailed}`;
    refused.set(key, (refused.get(key) ?? 0) + 1);
  }
  return { main, raster, decode, gpu, long, drawn, mainAnims: [...refused].map(([k, n]) => `${k} ×${n}`), anims };
}

// ---------------------------------------------------------------- running

interface Sample {
  geo: string;
  throttle: number;
  scenario: string;
  step: string;
  kind: string;
  visit: 1 | 2;
  round: number;
  frames: FrameStats;
  trace: TraceStats | null;
}
const samples: Sample[] = [];

const freePort = () =>
  new Promise<number>((res, rej) => {
    const s = createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => res(port));
    });
  });

const git = (cmd: string): string => {
  try {
    return execSync(`git ${cmd}`, { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};
const commit = `${git('rev-parse --short HEAD')}${git('status --porcelain -- src') ? ' + changes' : ''}`;

const outDir = DIST ? resolve(DIST) : undefined;
if (!has('--no-build')) {
  console.log('transition-bench: building…');
  await build({ logLevel: 'warn', ...(outDir ? { build: { outDir, emptyOutDir: true } } : {}) });
}
const server = await preview({ preview: { port: await freePort(), strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', ...(outDir ? { build: { outDir } } : {}) });
const base = (server.resolvedUrls?.local[0] ?? '').replace(/\/$/, '');
const loadStart = loadavg();
console.log(`transition-bench: ${base}, commit ${commit}${LABEL ? `, ${LABEL}` : ''}, ${ROUNDS} rounds, load ${loadStart}`);

let version = '';
let gl = '';
const CATS = [...L.TRACE_CATEGORIES, 'disabled-by-default-devtools.timeline.frame', 'blink.animations', 'cc', 'gpu'];

async function tap(page: Page, selector: string, mobile: boolean): Promise<void> {
  const el = page.locator(selector).first();
  await el.waitFor({ state: 'visible', timeout: 15_000 });
  if (mobile) await el.tap();
  else await el.click();
}

/** One measured step: the monitor and the trace over the tap and its window. */
async function measure(page: Page, browser: import('@playwright/test').Browser, step: Step, mobile: boolean, tag: string): Promise<{ frames: FrameStats; trace: TraceStats | null }> {
  await page.locator(step.target).first().waitFor({ state: 'visible', timeout: 15_000 });
  if (!FIREFOX) await browser.startTracing(page, { categories: CATS });
  await page.evaluate(() => {
    const m = (window as unknown as { __tb: { frames: number[]; flying: number[]; clicks: number[]; on: boolean } }).__tb;
    m.frames = [];
    m.flying = [];
    m.clicks = [];
    m.on = true;
  });
  await pause(120);
  await tap(page, step.target, mobile);
  await pause(WINDOW + 250);
  const m = await page.evaluate(() => {
    const m = (window as unknown as { __tb: { frames: number[]; flying: number[]; clicks: number[]; on: boolean } }).__tb;
    m.on = false;
    return { frames: m.frames, flying: m.flying, clicks: m.clicks };
  });
  const buf = FIREFOX ? null : await browser.stopTracing();
  if (TRACE_DIR && buf) {
    mkdirSync(TRACE_DIR, { recursive: true });
    writeFileSync(`${TRACE_DIR}/${tag}.json`, buf);
  }
  const t0 = m.clicks[0];
  if (t0 === undefined) throw new Error(`no click seen for ${step.name}`);
  return { frames: frameStats(m.frames, m.flying, t0, WINDOW), trace: buf ? traceStats(buf, WINDOW) : null };
}

try {
  for (const geo of GEOS) {
    const t = await L.launchTarget(FIREFOX ? 'firefox' : CHROMIUM, geo.g);
    version ||= t.browser.version();
    gl ||= await L.glRenderer(t.browser);
    for (const throttle of geo.throttles) {
      for (const sc of SCENARIOS) {
        for (let round = 1; round <= ROUNDS; round++) {
          const ctx = await t.browser.newContext({
            viewport: { width: geo.g.width, height: geo.g.height },
            ...(FIREFOX ? {} : { deviceScaleFactor: geo.g.dpr }),
            ...(geo.mobile ? { isMobile: true, hasTouch: true } : {}),
          });
          await ctx.addInitScript(MONITOR);
          const page = await ctx.newPage();
          page.on('pageerror', (e) => console.error('pageerror:', e.message));
          await page.goto(`${base}/?${SCENE}${geo.q}&skyStats`);
          await page.waitForSelector('html[data-wc-boot="ready"]', { timeout: 60_000 });
          if (geo.mobile && !(await page.evaluate(() => document.documentElement.classList.contains('wc-phone')))) throw new Error('the page did not start as a phone');
          if (CSS) await page.addStyleTag({ content: CSS });
          let cdp: CDPSession | null = null;
          if (throttle > 1) {
            cdp = await ctx.newCDPSession(page);
            await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
          }
          // The first seconds on the page, as a visitor spends them: the sky's engine arrives and fades in.
          await page.waitForFunction(() => (window as { __wcSky?: unknown }).__wcSky !== undefined, null, { timeout: 60_000 });
          await pause(SETTLE);
          for (const sel of sc.lead ?? []) {
            await tap(page, sel, geo.mobile);
            await pause(WINDOW + 400);
          }
          for (const visit of [1, 2] as const) {
            for (const step of sc.steps) {
              const tag = `${geo.name}-${throttle}x-${sc.name}-${step.name.replace(/[^a-z]+/g, '_')}-v${visit}-r${round}`;
              const r = await measure(page, t.browser, step, geo.mobile, tag);
              samples.push({ geo: geo.name, throttle, scenario: sc.name, step: step.name, kind: step.kind, visit, round, ...r });
              await pause(350);
            }
          }
          await cdp?.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {});
          await ctx.close();
        }
        // One line per step and visit: medians over the rounds.
        for (const step of sc.steps) {
          for (const visit of [1, 2] as const) {
            const ss = samples.filter((s) => s.geo === geo.name && s.throttle === throttle && s.scenario === sc.name && s.step === step.name && s.visit === visit);
            console.log(`${geo.name.padEnd(7)} ${String(throttle).padStart(1)}× ${step.name.padEnd(28)} v${visit}  ${line(ss)}`);
          }
        }
      }
    }
    await t.browser.close();
  }
} finally {
  await new Promise<void>((res) => server.httpServer.close(() => res()));
}

// ---------------------------------------------------------------- report

/** "median (min–max)" of a number over the rounds. */
function mm(xs: number[], f: (n: number) => string = (n) => n.toFixed(0)): string {
  const v = xs.filter((x) => Number.isFinite(x));
  if (v.length === 0) return '—';
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  return lo === hi ? f(median(v)) : `${f(median(v))} (${f(lo)}–${f(hi)})`;
}

function line(ss: Sample[]): string {
  const fr = ss.map((s) => s.frames);
  const tr = ss.map((s) => s.trace).filter((x): x is TraceStats => !!x);
  return [
    `first ${mm(fr.map((f) => f.first))}`,
    `>20 ${mm(fr.map((f) => f.over20))}`,
    `>34 ${mm(fr.map((f) => f.over34))}`,
    `>50 ${mm(fr.map((f) => f.over50))}`,
    `worst ${mm(fr.map((f) => f.worst))}`,
    `fly>20 ${mm(fr.map((f) => f.fly.over20))}/${mm(fr.map((f) => f.fly.n))}`,
    `main ${mm(tr.map((t) => t.main.total))} (js ${mm(tr.map((t) => t.main.script))} st ${mm(tr.map((t) => t.main.style))} lay ${mm(tr.map((t) => t.main.layout))} pnt ${mm(tr.map((t) => t.main.paint))})`,
    `raster ${mm(tr.map((t) => t.raster))}`,
  ].join('  ');
}

const md: string[] = [
  `# The start menu's transitions — frame times${LABEL ? ` (${LABEL})` : ''}`,
  '',
  `Commit ${commit}. Date: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · load ${loadStart} → ${loadavg()} · ${FIREFOX ? 'Firefox' : 'Chromium'} ${version}, headless; WebGL: ${gl} · a production build (\`vite preview\`) · ${ROUNDS} rounds, each on a fresh context · the tap comes ${SETTLE} ms after the sky's engine is up · window ${WINDOW} ms from the click.`,
  '',
  'Each cell is the median over the rounds, with (min–max) where they differ. `first`: ms from the click to the first frame after it (the click frame: the new page mounts and is laid out in it). `> 20 / 34 / 50`: animation frame intervals over that many ms after the first frame (a 60 Hz frame is 16.7). `flight`: the same while the proxy is out, of how many frames. `main`: main-thread ms in the window (throttled time), by kind. `raster`, `GPU`: ms on the raster threads and in the GPU process (**not** throttled: a measure of the work asked for, not of a phone\'s time).',
  '',
];
for (const geo of GEOS) {
  for (const throttle of geo.throttles) {
    md.push(`## ${geo.name} ${geo.g.width}×${geo.g.height} @${geo.g.dpr}, CPU ${throttle}×`, '');
    md.push('| transition | visit | first ms | > 20 | > 34 | > 50 | p95 ms | worst ms | flight > 20 / > 34 of n | main ms | script | style | layout | paint | commit | GC | raster | GPU | drawn frames (> 34) |');
    md.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const sc of SCENARIOS) {
      for (const step of sc.steps) {
        for (const visit of [1, 2] as const) {
          const ss = samples.filter((s) => s.geo === geo.name && s.throttle === throttle && s.scenario === sc.name && s.step === step.name && s.visit === visit);
          if (ss.length === 0) continue;
          const fr = ss.map((s) => s.frames);
          const tr = ss.map((s) => s.trace).filter((x): x is TraceStats => !!x);
          const m = (k: keyof TraceStats['main']): string => mm(tr.map((t) => t.main[k]));
          md.push(
            `| ${step.name} | ${visit === 1 ? 'first' : 'second'} | ${mm(fr.map((f) => f.first))} | ${mm(fr.map((f) => f.over20))} | ${mm(fr.map((f) => f.over34))} | ${mm(fr.map((f) => f.over50))} | ${mm(fr.map((f) => f.p95), f1)} | ${mm(fr.map((f) => f.worst))} | ${mm(fr.map((f) => f.fly.over20))} / ${mm(fr.map((f) => f.fly.over34))} of ${mm(fr.map((f) => f.fly.n))} | ${m('total')} | ${m('script')} | ${m('style')} | ${m('layout')} | ${m('paint')} | ${m('commit')} | ${m('gc')} | ${mm(tr.map((t) => t.raster))} | ${mm(tr.map((t) => t.gpu))} | ${mm(tr.map((t) => t.drawn.n))} (${mm(tr.map((t) => t.drawn.over34))}) |`,
          );
        }
      }
    }
    md.push('');
    // The long tasks and the refused animations, per step and visit (every round's, merged).
    md.push('Main-thread tasks over 30 ms (`at` ms from the click, length, what; the worst round), and the animations the compositor refused:', '');
    for (const sc of SCENARIOS) {
      for (const step of sc.steps) {
        for (const visit of [1, 2] as const) {
          const ss = samples.filter((s) => s.geo === geo.name && s.throttle === throttle && s.scenario === sc.name && s.step === step.name && s.visit === visit && s.trace);
          if (ss.length === 0) continue;
          const worst = [...ss].sort((a, b) => b.trace!.long.reduce((x, l) => x + l.ms, 0) - a.trace!.long.reduce((x, l) => x + l.ms, 0))[0]!;
          const longs = worst.trace!.long.map((l) => `at ${l.at.toFixed(0)}: ${l.ms.toFixed(0)} ms (${l.label})`).join('; ') || 'none';
          const refused = [...new Set(ss.flatMap((s) => s.trace!.mainAnims))].join('; ') || 'none';
          md.push(`- **${step.name}**, ${visit === 1 ? 'first' : 'second'}: ${longs}. Animations ${mm(ss.map((s) => s.trace!.anims))}; refused: ${refused}.`);
        }
      }
    }
    md.push('');
  }
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, md.join('\n'));
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ commit, label: LABEL, samples }));
console.log(`wrote ${OUT}`);
console.log(`RESULT ${JSON.stringify({ commit, label: LABEL, rounds: ROUNDS, samples: samples.length })}`);
