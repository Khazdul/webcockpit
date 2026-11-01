// Weather motion smoothness bench (stage 31b): how evenly the effects'
// frames sit on the screen's refresh grid, and how far things move per
// frame, per scene, in headed Firefox and Chromium at the owner's geometry.
//
//   node bench/weather-smooth.ts [--browsers firefox,chromium] [--scenes snow,rain,…]
//                                [--seconds 8] [--port 5412] [--no-build] [--headless]
//                                [--no-probe] [--out file.json]
//
// Builds the app (unless --no-build), serves the production bundle with
// `vite preview` and opens the `?bench` page at 1728 × 1000, ratio 2, Map
// pane off, weather effects on, in a **headed** browser by default. Per
// scene: the state pinned at once (no build-up), 6 s to settle, then over
// S seconds:
//
// - the worker's frame trace (`stats({ trace: true })`, engine.ts): per
//   drawn frame the animation frame's time, the callback's start and the end
//   of its drawing. Reported: the frame interval in refresh periods (how
//   many frames are 1, 2, 3 … refreshes apart: the cadence), the callback's
//   delay after its refresh, the drawing time, and how many frames end after
//   the next refresh (likely shown a refresh late);
// - what the page shows (`--no-probe` leaves it out): a main-thread
//   requestAnimationFrame loop copies a 160 × 120 patch of the back canvas
//   (the snow and rain layer) at each of its frames and notes whether it
//   changed since the last one. Each refresh that shows a new picture is a
//   "change"; the run of refreshes between changes is the presented cadence
//   (at 30 fps on a 60 Hz screen: 2, 2, 2 …; a 1 or a 3 is a frame shown a
//   refresh early or late). The copy itself costs the main thread ~0.1 ms.
// - the flakes' motion (snow scenes): the near flakes' fillRect calls on
//   the back canvas, matched frame to frame; per frame, the step in px and
//   the step over the frame's interval (px/s: constant when the motion
//   follows the elapsed time).
//
// The refresh period is taken from the main thread's animation frames
// (median interval). Prints a table and writes the raw numbers as JSON (`--out`).

import { writeFileSync } from 'node:fs';
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
const { build, preview } = await import('vite');
const { chromium, firefox } = await import('@playwright/test');
type Page = import('@playwright/test').Page;
type Worker = import('@playwright/test').Worker;
const { pct, f1, pause, loadavg, OWNER } = L;

const argv = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : def;
};
const PORT = Number(opt('port', process.env.WC_BENCH_PORT ?? '5412'));
const BROWSERS = opt('browsers', 'firefox,chromium').split(',') as ('firefox' | 'chromium')[];
const SECONDS = Number(opt('seconds', '8'));
const HEADLESS = argv.includes('--headless');
const PROBE = !argv.includes('--no-probe');
const OUT = opt('out', '');

const BASE = { weather: ' ', fog: '', light: '', position: 'standing', clock: 'day', moonUp: false, dayAt: -1, nightAt: -1, moonRiseAt: -1, moonSetAt: -1 };
interface Scene {
  state: Record<string, unknown>;
  /** Events sent after the settle, just before measuring. */
  events?: string[];
  /** Sent after the settle with the normal easing (a transition). */
  pin?: Record<string, unknown>;
  /** A sunset: the night begins this many s after the settle. */
  turnIn?: number;
  /** Where the probe's patch sits (fractions of the canvas). */
  at?: [number, number];
}
const SCENES: Record<string, Scene> = {
  snow: { state: { ...BASE, weather: '*' } },
  'snow-night': { state: { ...BASE, weather: '*', clock: 'night', moonUp: true } },
  rain: { state: { ...BASE, weather: '"' } },
  'rain-light': { state: { ...BASE, weather: "'" } },
  clouds: { state: { ...BASE, weather: '~' } },
  fog: { state: { ...BASE, fog: '=' } },
  night: { state: { ...BASE, clock: 'night', moonUp: true }, at: [0.5, 0.15] },
  birds: { state: { ...BASE }, events: ['birds'], at: [0.45, 0.2] },
  storm: { state: { ...BASE, weather: '"' }, events: ['strike'] },
  sunset: { state: { ...BASE, sunU: 0.93 }, turnIn: 20, at: [0.75, 0.3] },
  cover: { state: { ...BASE }, pin: { ...BASE, weather: '~' } },
};
const SCENE_NAMES = opt('scenes', 'snow,rain,clouds,fog,night,birds,storm,sunset,cover').split(',').filter((s) => s in SCENES);

// ------------------------------------------------------------------ in the page

/** Starts the main-thread probe: a rAF loop that copies a patch of the back canvas and notes when it changes. */
function startProbe(at: [number, number]): void {
  const w = window as unknown as { __smooth?: { t: number[]; ch: number[]; stop: boolean } };
  const src = document.querySelector<HTMLCanvasElement>('canvas.wc-weather-back');
  const PW = 160, PH = 120;
  const c = document.createElement('canvas');
  c.width = PW;
  c.height = PH;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const rec = { t: [] as number[], ch: [] as number[], stop: false };
  w.__smooth = rec;
  let prev: Uint32Array | null = null;
  const loop = (t: number): void => {
    if (rec.stop) return;
    let changed = -1;
    if (src) {
      const sx = Math.floor(src.width * at[0]) - PW / 2, sy = Math.floor(src.height * at[1]);
      g.clearRect(0, 0, PW, PH);
      g.drawImage(src, sx, sy, PW, PH, 0, 0, PW, PH);
      const d = new Uint32Array(g.getImageData(0, 0, PW, PH).data.buffer);
      if (prev) {
        changed = 0;
        for (let i = 0; i < d.length; i++)
          if (d[i] !== prev[i]) {
            changed = 1;
            break;
          }
      }
      prev = d;
    }
    rec.t.push(t);
    rec.ch.push(changed);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function stopProbe(): { t: number[]; ch: number[] } {
  const w = window as unknown as { __smooth?: { t: number[]; ch: number[]; stop: boolean } };
  const r = w.__smooth!;
  r.stop = true;
  return { t: r.t, ch: r.ch };
}

/** In the worker: records the near flakes (r 1.65: a 3.3 × 1.9 bar first) drawn on the back canvas, per frame. */
function startFlakes(): void {
  const g = self as unknown as { __flakes?: { frames: { t: number; p: number[] }[]; stop: boolean } };
  const P = OffscreenCanvasRenderingContext2D.prototype;
  const fr = P.fillRect, cr = P.clearRect;
  const rec = { frames: [] as { t: number; p: number[] }[], stop: false };
  g.__flakes = rec;
  let backCtx: OffscreenCanvasRenderingContext2D | null = null, open = false;
  let cur: { t: number; p: number[] } | null = null;
  P.clearRect = function (this: OffscreenCanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    // the first clear of a task is the back canvas's, at the start of a frame
    if (!open && !rec.stop) {
      open = true;
      backCtx ??= this;
      if (this === backCtx) {
        cur = { t: performance.now(), p: [] };
        rec.frames.push(cur);
      }
      queueMicrotask(() => (open = false));
    }
    if (rec.stop) {
      P.clearRect = cr;
      P.fillRect = fr;
    }
    return cr.call(this, x, y, w, h);
  };
  P.fillRect = function (this: OffscreenCanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    if (cur && this === backCtx && Math.abs(w - 3.3) < 1e-6 && Math.abs(h - 1.9) < 1e-6) cur.p.push(x + 1.65, y + 1.65 - 0.7);
    return fr.call(this, x, y, w, h);
  };
}

function stopFlakes(): { t: number; p: number[] }[] {
  const g = self as unknown as { __flakes?: { frames: { t: number; p: number[] }[]; stop: boolean } };
  g.__flakes!.stop = true;
  return g.__flakes!.frames;
}

// ------------------------------------------------------------------ analysis

interface Result {
  scene: string;
  vsync: number;
  frames: number;
  fps: number;
  /** Share of drawn-frame intervals of 1, 2, 3, 4, 5+ refreshes. */
  cadence: number[];
  /** Callback start after its animation frame's time, ms: p50, p95. */
  delay: [number, number];
  /** Drawing time, ms: avg, p95, max. */
  draw: [number, number, number];
  /** Frames whose drawing ends after the next refresh (share). */
  late: number;
  /** The presented cadence: share of runs of 1, 2, 3, 4, 5+ refreshes between changes of the probe's patch. */
  shown: number[] | null;
  /** Changes of the probe's patch per s. */
  shownFps: number;
  /** The page's own animation frames per s while measuring (a throttled window shows here). */
  pageHz: number;
  /** Flakes: per-frame step (px) p50 and the spread of px/s within each flake (coefficient of variation, %). */
  flake: { n: number; step: number; cv: number; cvStep: number } | null;
  /** Average per module over the last read, ms. */
  mods?: Record<string, number>;
}

function hist(xs: number[]): number[] {
  const h = [0, 0, 0, 0, 0];
  for (const x of xs) h[Math.min(5, Math.max(1, x)) - 1]!++;
  return h.map((v) => v / Math.max(1, xs.length));
}

function analyse(scene: string, trace: number[], probe: { t: number[]; ch: number[] } | null, flakes: { t: number; p: number[] }[] | null): Result {
  // the refresh period: the main thread's median rAF interval (60 Hz without a probe)
  let vsync = 1000 / 60;
  if (probe && probe.t.length > 20) {
    const d: number[] = [];
    for (let i = 1; i < probe.t.length; i++) d.push(probe.t[i]! - probe.t[i - 1]!);
    vsync = pct(d, 50);
  }
  const fr: { raf: number; now: number; at: number; end: number }[] = [];
  for (let i = 0; i + 3 < trace.length; i += 4) fr.push({ raf: trace[i]!, now: trace[i + 1]!, at: trace[i + 2]!, end: trace[i + 3]! });
  const ivs: number[] = [], delay: number[] = [], draw: number[] = [];
  let late = 0;
  for (let i = 0; i < fr.length; i++) {
    const f = fr[i]!;
    if (i) ivs.push(Math.round((f.now - fr[i - 1]!.now) / vsync));
    const base = Number.isFinite(f.raf) ? f.raf : f.at;
    delay.push(f.at - base);
    draw.push(f.end - f.at);
    if (f.end - base > vsync) late++;
  }
  const span = fr.length > 1 ? (fr[fr.length - 1]!.now - fr[0]!.now) / 1000 : 1;
  let shown: number[] | null = null, shownFps = NaN, pageHz = NaN;
  if (probe) {
    pageHz = (probe.t.length - 1) / Math.max(0.001, (probe.t[probe.t.length - 1]! - probe.t[0]!) / 1000);
    const runs: number[] = [];
    let last = -1, n = 0;
    for (let i = 0; i < probe.ch.length; i++) {
      if (probe.ch[i] !== 1) continue;
      n++;
      if (last >= 0) runs.push(Math.round((probe.t[i]! - probe.t[last]!) / vsync));
      last = i;
    }
    shown = hist(runs);
    shownFps = n / Math.max(0.001, (probe.t[probe.t.length - 1]! - probe.t[0]!) / 1000);
  }
  let flake: Result['flake'] = null;
  if (flakes && flakes.length > 10) {
    // nearest neighbour within 6 px, frame to frame; chains of the same flake
    const steps: number[] = [], cvs: number[] = [], cvSteps: number[] = [];
    const chains = new Map<number, { v: number[]; s: number[] }>();
    let prevIds: number[] = [], nextId = 0;
    for (let k = 1; k < flakes.length; k++) {
      const A = flakes[k - 1]!, B = flakes[k]!, dt = (B.t - A.t) / 1000;
      const ids: number[] = [];
      for (let j = 0; j < B.p.length; j += 2) {
        let best = -1, bd = 36;
        for (let i = 0; i < A.p.length; i += 2) {
          const dx = B.p[j]! - A.p[i]!, dy = B.p[j + 1]! - A.p[i + 1]!, d = dx * dx + dy * dy;
          if (dy >= -0.5 && d < bd) {
            bd = d;
            best = i;
          }
        }
        if (best < 0 || dt <= 0) {
          ids.push(nextId++);
          continue;
        }
        const id = prevIds[best / 2] ?? nextId++;
        ids.push(id);
        const dy = B.p[j + 1]! - A.p[best + 1]!;
        steps.push(Math.hypot(B.p[j]! - A.p[best]!, dy));
        let ch = chains.get(id);
        if (!ch) chains.set(id, (ch = { v: [], s: [] }));
        ch.v.push(dy / dt);
        ch.s.push(dy);
      }
      prevIds = ids;
    }
    const cv = (xs: number[]) => {
      const m = xs.reduce((a, b) => a + b, 0) / xs.length;
      const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length);
      return m ? (sd / Math.abs(m)) * 100 : NaN;
    };
    for (const ch of chains.values())
      if (ch.v.length >= 10) {
        cvs.push(cv(ch.v));
        cvSteps.push(cv(ch.s));
      }
    flake = { n: chains.size, step: pct(steps, 50), cv: pct(cvs, 50), cvStep: pct(cvSteps, 50) };
  }
  const avg = draw.reduce((a, b) => a + b, 0) / Math.max(1, draw.length);
  return {
    scene,
    vsync,
    frames: fr.length,
    fps: (fr.length - 1) / span,
    cadence: hist(ivs),
    delay: [pct(delay, 50), pct(delay, 95)],
    draw: [avg, pct(draw, 95), Math.max(...draw)],
    late: late / Math.max(1, fr.length),
    shown,
    shownFps,
    pageHz,
    flake,
  };
}

// ------------------------------------------------------------------ run

async function runScene(browser: import('@playwright/test').Browser, base: string, bname: string, name: string): Promise<Result> {
  const sc = SCENES[name]!;
  const ctx = await browser.newContext({ viewport: { width: OWNER.width, height: OWNER.height }, deviceScaleFactor: OWNER.dpr });
  const page: Page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  const q = '?bench&benchSettings=' + encodeURIComponent(JSON.stringify({ panes: { map: { on: false } }, weather: { enabled: true } }));
  await page.goto(`${base}/${q}`);
  await page.waitForFunction(() => window.__wcBench !== undefined && window.__wcBench.app !== null);
  const ok = await page.evaluate(async () => {
    const ctl = await window.__wcBench!.app!.weather?.settled();
    if (!ctl) return false;
    await ctl.engine.ready;
    return true;
  });
  if (!ok) throw new Error(`${bname}: the weather effects did not start`);
  await page.evaluate(() => window.__wcBench!.connectFake());
  // a hidden or throttled window spoils every number: check the page's frame rate first
  let hz = 0;
  for (let i = 0; i < 5 && hz < 55; i++) hz = await L.rafRate(page);
  const dpr = await page.evaluate(() => devicePixelRatio);
  if (hz < 50) throw new Error(`${bname}: the page runs at ${f1(hz)} animation frames per second (a hidden window? set WC_BENCH_WM_CLASS)`);
  console.log(`    ${name}: page ${f1(hz)} Hz, devicePixelRatio ${dpr}`);
  const pin = (p: Record<string, unknown>, smooth: boolean) =>
    page.evaluate(([p, smooth]) => window.__wcBench!.app!.weather!.controller!.pin(p as never, { smooth: smooth as boolean }), [p, smooth] as const);
  let state = { ...sc.state };
  if (sc.turnIn) state = { ...state, nightAt: Date.now() + (6 + sc.turnIn) * 1000 };
  await pin(state, false);
  await pause(6000);
  let worker: Worker | undefined;
  for (let i = 0; i < 50 && !worker; i++) {
    worker = page.workers().find((w) => /weather/i.test(w.url()));
    if (!worker) await pause(100);
  }
  for (const e of sc.events ?? []) await page.evaluate((e) => window.__wcBench!.app!.weather?.controller?.engine.emit(e as never), e);
  if (sc.pin) await pin(sc.pin, true);
  const stats = (trace: boolean) => page.evaluate((trace) => window.__wcBench!.app!.weather!.controller!.engine.stats({ reset: true, trace }), trace);
  await stats(false);
  const flakesOn = name.startsWith('snow') && worker;
  if (flakesOn) await worker!.evaluate(startFlakes);
  if (PROBE) await page.evaluate(startProbe, (sc.at ?? [0.5, 0.25]) as [number, number]);
  // the trace ring holds 600 frames: read it every 4 s
  const trace: number[] = [];
  const end = Date.now() + SECONDS * 1000;
  let lastNow = -Infinity;
  let mods: Record<string, number> = {};
  const take = async () => {
    const s = await stats(true);
    mods = s.mods;
    const tr = s.trace ?? [];
    for (let i = 0; i + 3 < tr.length; i += 4) if (tr[i + 1]! > lastNow) trace.push(tr[i]!, tr[i + 1]!, tr[i + 2]!, tr[i + 3]!);
    if (trace.length) lastNow = trace[trace.length - 3]!;
  };
  while (Date.now() < end) {
    await pause(Math.min(4000, end - Date.now()));
    await take();
  }
  const probe = PROBE ? await page.evaluate(stopProbe) : null;
  const flakes = flakesOn ? await worker!.evaluate(stopFlakes) : null;
  await ctx.close();
  return { ...analyse(name, trace, probe, flakes), mods };
}

const pc = (x: number) => `${Math.round(x * 100)}`.padStart(3);
const histText = (h: number[] | null) => (h ? h.map(pc).join(' ') : '      —      ');

if (!argv.includes('--no-build')) {
  console.log('weather-smooth: building…');
  await build({ logLevel: 'warn' });
}
const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'warn' });
const base = (server.resolvedUrls?.local[0] ?? `http://localhost:${PORT}/`).replace(/\/$/, '');
console.log(`weather-smooth: ${base}, ${HEADLESS ? 'headless' : 'headed'}, ${L.geometryText(OWNER)}, ${SECONDS} s per scene, load ${loadavg()}`);
const all: Record<string, Result[]> = {};
try {
  for (const bname of BROWSERS) {
    const browser =
      bname === 'firefox'
        ? await firefox.launch({ headless: HEADLESS, args: HEADLESS ? [] : L.wmClassArgs('firefox'), firefoxUserPrefs: { 'layout.css.devPixelsPerPx': String(OWNER.dpr) } })
        : await chromium.launch({ headless: HEADLESS, args: HEADLESS ? [] : L.wmClassArgs('chromium') });
    console.log(`\n${bname} ${browser.version()}`);
    console.log('  scene        fps  frames 1/2/3/4/5+ refr (%)  shown 1/2/3/4/5+ (%)  shown/s  delay p50/p95  draw avg/p95/max  late%  flake step px, cv px/s %, cv step %');
    const rows: Result[] = [];
    for (const name of SCENE_NAMES) {
      // a window that was hidden or throttled while measuring (the page's own rate fell): measured again, twice at most
      let r = await runScene(browser, base, bname, name);
      for (let k = 0; k < 2 && PROBE && !(r.pageHz > 55); k++) {
        console.log(`    ${name}: the page ran at ${f1(r.pageHz)} Hz while measuring; again`);
        r = await runScene(browser, base, bname, name);
      }
      rows.push(r);
      const fl = r.flake ? `${f1(r.flake.step)}, ${f1(r.flake.cv)}, ${f1(r.flake.cvStep)} (${r.flake.n})` : '';
      console.log(
        `  ${name.padEnd(11)} ${f1(r.fps).padStart(5)}  ${histText(r.cadence)}     ${histText(r.shown)}   ${f1(r.shownFps).padStart(6)}   ${f1(r.delay[0]).padStart(4)}/${f1(r.delay[1]).padEnd(5)}  ${f1(r.draw[0]).padStart(5)}/${f1(r.draw[1])}/${f1(r.draw[2]).padEnd(5)}  ${pc(r.late)}   ${fl}`,
      );
      console.log(`      modules (ms/frame): ${Object.entries(r.mods ?? {}).map(([k, v]) => `${k} ${f1(v)}`).join(', ')}; ${r.frames} frames, refresh ${f1(r.vsync)} ms, page ${f1(r.pageHz)} Hz while measuring`);
    }
    all[bname] = rows;
    await browser.close();
  }
} finally {
  await new Promise<void>((res) => server.httpServer.close(() => res()));
}
if (OUT) writeFileSync(OUT, JSON.stringify(all, null, 2));
