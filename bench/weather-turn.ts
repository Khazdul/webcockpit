// Sunrise / sunset cost bench (stage 28 item 112, ADR 0093 "Firefox turn
// cost"): the weather worker's own frame times through a whole turn, per
// phase, in headed Firefox and Chromium at the owner's geometry.
//
//   node bench/weather-turn.ts [--browsers firefox,chromium] [--turns set,rise]
//                              [--port 5411] [--no-build] [--headless]
//                              [--shots dir] [--out file.json]
//
// Builds the app (unless --no-build), serves the production bundle with
// `vite preview` and opens the `?bench` page at 1728 × 1000, ratio 2, Map
// pane off, weather effects on, in a **headed** browser by default (Firefox
// draws its canvases on the CPU there as it does for the owner). Per turn:
// a clear sky (day for a sunset, a moonless night for a sunrise), 5 s to
// settle, then the clock says the night (day) begins in 65 s, as the demo
// does (`nightAt` / `dayAt`); at the turn's second the clock flips, as the
// game would. Measured until 15 s after it.
//
// The worker keeps its last 600 frame times (engine.ts `stats()`); once a
// second the bench reads that ring from inside the worker (Playwright's
// worker handle: a synchronous `stats` request whose ring and module rings
// it catches), so every frame is seen with its own time. Frames are placed
// in time between two reads (≤ 1 s apart). Reported per phase of the turn
// (s = seconds to the turn's second): frame avg / p95 / max, the sky
// module's avg, and frames per second; "first" is the largest frame in the
// turn's first 3 s (the layers' setup).
//
// `--shots dir` also saves screenshots at s = -50, -30, -15, -5 (a
// screenshot disturbs the frame it lands in: measure without it).
//
// Prints a table and writes the raw per-phase numbers as JSON (`--out`).

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
const { build, preview } = await import('vite');
const { chromium, firefox } = await import('@playwright/test');
type Page = import('@playwright/test').Page;
type Worker = import('@playwright/test').Worker;
const { pct, max, f1, pause, loadavg, OWNER } = L;

const argv = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : def;
};
const PORT = Number(opt('port', process.env.WC_BENCH_PORT ?? '5411'));
const BROWSERS = opt('browsers', 'firefox,chromium').split(',') as ('firefox' | 'chromium')[];
const TURNS = opt('turns', 'set,rise').split(',') as ('set' | 'rise')[];
const HEADLESS = argv.includes('--headless');
const SHOTS = opt('shots', '');
const OUT = opt('out', '');
const LEAD_S = 65;
const AFTER_S = 15;
const PHASES: readonly [number, number][] = [[-60, -45], [-45, -30], [-30, -15], [-15, 0], [0, 15]];
const SHOT_AT = [-50, -30, -15, -5];

const BASE_STATE = { weather: ' ', fog: '', light: '', position: 'standing', dayAt: -1, nightAt: -1, moonRiseAt: -1, moonSetAt: -1, moonUp: false, moonU: -1, moonPhase: 0.5 };
const SCENE: Record<'set' | 'rise', Record<string, unknown>> = {
  set: { ...BASE_STATE, clock: 'day', sunU: 0.93 },
  rise: { ...BASE_STATE, clock: 'night', sunU: -1 },
};

interface Snap {
  n: number;
  wall: number;
  times: number[];
  mods: Record<string, number[]>;
}

/** Reads the engine's frame-time rings from inside the worker (see the header). */
function snapInWorker(): Snap | null {
  const g = self as unknown as { postMessage: (m: unknown) => void; dispatchEvent: (e: Event) => boolean };
  let times: Float32Array | null = null;
  let mods: Map<string, Float32Array> | null = null;
  let st: { frames: number } | null = null;
  const sub = Float32Array.prototype.subarray;
  const it = Map.prototype[Symbol.iterator];
  Float32Array.prototype.subarray = function (this: Float32Array, ...a: [number?, number?]) {
    if (this.length === 600 && !times) times = this;
    return sub.apply(this, a);
  } as typeof sub;
  Map.prototype[Symbol.iterator] = function (this: Map<unknown, unknown>) {
    const v = this.values().next().value;
    if (v instanceof Float32Array && v.length === 600) mods = this as Map<string, Float32Array>;
    return it.call(this);
  } as typeof it;
  g.postMessage = (m: unknown) => {
    if ((m as { t?: string }).t === 'stats') st = (m as { stats: { frames: number } }).stats;
  };
  try {
    g.dispatchEvent(new MessageEvent('message', { data: { t: 'stats' } }));
  } finally {
    Float32Array.prototype.subarray = sub;
    Map.prototype[Symbol.iterator] = it;
    delete (g as { postMessage?: unknown }).postMessage;
  }
  if (!times || !st) return null;
  const m: Record<string, number[]> = {};
  if (mods) for (const [id, arr] of mods as Map<string, Float32Array>) m[id] = Array.from(arr);
  return { n: (st as { frames: number }).frames, wall: Date.now(), times: Array.from(times as Float32Array), mods: m };
}

interface Frame {
  /** Turn time (s to the turn's second). */
  s: number;
  ms: number;
  sky: number;
}

async function runTurn(browser: import('@playwright/test').Browser, base: string, bname: string, kind: 'set' | 'rise'): Promise<Frame[]> {
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
  const pin = (p: Record<string, unknown>, smooth: boolean) =>
    page.evaluate(([p, smooth]) => window.__wcBench!.app!.weather!.controller!.pin(p as never, { smooth: smooth as boolean }), [p, smooth] as const);
  let state = { ...SCENE[kind] };
  await pin(state, false);
  await pause(5000);
  let worker: Worker | undefined;
  for (let i = 0; i < 50 && !worker; i++) {
    worker = page.workers().find((w) => /weather/i.test(w.url()));
    if (!worker) await pause(100);
  }
  if (!worker) throw new Error(`${bname}: no weather worker (${page.workers().map((w) => w.url()).join(', ')})`);
  const snap = async () => {
    const s = await worker!.evaluate(snapInWorker);
    if (!s) throw new Error(`${bname}: could not read the worker's frame times`);
    return s;
  };
  const turnAt = Date.now() + LEAD_S * 1000;
  state = { ...state, [kind === 'set' ? 'nightAt' : 'dayAt']: turnAt };
  await pin(state, true);
  let last = await snap();
  const frames: Frame[] = [];
  let flipped = false;
  const shots = SHOTS ? [...SHOT_AT] : [];
  while (Date.now() < turnAt + AFTER_S * 1000) {
    const nextShot = shots[0] !== undefined ? turnAt + shots[0] * 1000 : Infinity;
    const wait = Math.min(1000, Math.max(0, nextShot - Date.now()));
    await pause(wait);
    if (Date.now() >= nextShot) {
      const at = shots.shift()!;
      mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: `${SHOTS}/${bname}-${kind}${at}.png` });
    }
    if (!flipped && Date.now() >= turnAt) {
      flipped = true;
      state = { ...state, clock: kind === 'rise' ? 'day' : 'night', sunU: kind === 'rise' ? 0 : -1 };
      await pin(state, true);
    }
    const cur = await snap();
    const k = cur.n - last.n;
    if (k > 600) console.warn(`  ${bname} ${kind}: ${k - 600} frames lost between reads`);
    for (let i = Math.max(last.n, cur.n - 600); i < cur.n; i++) {
      const wall = last.wall + ((cur.wall - last.wall) * (i - last.n + 1)) / Math.max(1, k);
      frames.push({ s: (wall - turnAt) / 1000, ms: cur.times[i % 600]!, sky: cur.mods.sky?.[i % 600] ?? NaN });
    }
    last = cur;
  }
  await ctx.close();
  return frames;
}

interface PhaseRow {
  label: string;
  n: number;
  avg: number;
  p95: number;
  max: number;
  sky: number;
  fps: number;
}

function phases(frames: Frame[]): PhaseRow[] {
  const rows: PhaseRow[] = [];
  const add = (label: string, a: number, b: number) => {
    const xs = frames.filter((f) => f.s >= a && f.s < b);
    const ms = xs.map((f) => f.ms);
    rows.push({
      label,
      n: xs.length,
      avg: ms.reduce((x, y) => x + y, 0) / Math.max(1, ms.length),
      p95: pct(ms, 95),
      max: max(ms),
      sky: xs.reduce((x, f) => x + f.sky, 0) / Math.max(1, xs.length),
      fps: xs.length / (b - a),
    });
  };
  for (const [a, b] of PHASES) add(`${a}…${b}`, a, b);
  add('first 3 s', -60, -57);
  add('before', -65, -60);
  return rows;
}

// ------------------------------------------------------------------ main

if (!argv.includes('--no-build')) {
  console.log('weather-turn: building…');
  await build({ logLevel: 'warn' });
}
const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'warn' });
const base = (server.resolvedUrls?.local[0] ?? `http://localhost:${PORT}/`).replace(/\/$/, '');
console.log(`weather-turn: ${base}, ${HEADLESS ? 'headless' : 'headed'}, ${L.geometryText(OWNER)}, load ${loadavg()}`);
const all: Record<string, PhaseRow[]> = {};
try {
  for (const bname of BROWSERS) {
    const browser =
      bname === 'firefox'
        ? await firefox.launch({ headless: HEADLESS, firefoxUserPrefs: { 'layout.css.devPixelsPerPx': String(OWNER.dpr) } })
        : await chromium.launch({ headless: HEADLESS });
    console.log(`\n${bname} ${browser.version()}`);
    for (const kind of TURNS) {
      const l0 = loadavg();
      const rows = phases(await runTurn(browser, base, bname, kind));
      all[`${bname} ${kind}`] = rows;
      console.log(`  ${kind === 'set' ? 'sunset' : 'sunrise'} (load ${l0} → ${loadavg()})`);
      console.log('    phase (s)      frames   avg    p95    max   sky avg   fps');
      for (const r of rows)
        console.log(`    ${r.label.padEnd(12)} ${String(r.n).padStart(6)} ${f1(r.avg).padStart(6)} ${f1(r.p95).padStart(6)} ${f1(r.max).padStart(6)} ${f1(r.sky).padStart(8)} ${f1(r.fps).padStart(6)}`);
    }
    await browser.close();
  }
} finally {
  await new Promise<void>((res) => server.httpServer.close(() => res()));
}
if (OUT) writeFileSync(OUT, JSON.stringify(all, null, 2));
