// Area E performance harness: side panes, chrome and frame composition
// during play (WebCockpit perf review 2026-09-30).
//
//   node perf/e-harness.ts <scenario> [options]
//
// Scenarios
//   play    feeds a play log (perf/gen-play.ts: an owner log + synthesized
//           GMCP) through the `?bench` fake socket at `--speed`, typing its
//           `> cmd` lines through the real input (keyToSend); records every
//           animation frame (rAF callbacks, main-thread frame time), every
//           side-pane render, every output flush, ResizeObserver callbacks,
//           clock-strip updates, and per-thread CPU of the browser processes.
//   idle    plays the first `--warm` s of the log (panes filled, timers
//           counting, map located), then measures `--secs` s with nothing
//           arriving: frames with rAF callbacks, per-thread CPU and (with
//           --trace, Chromium) rendering events per second.
//   typing  like idle, but types letters into the input at 10/s.
//
// Options
//   --browsers firefox,chromium   (chromium = headless Chromium; add --gpu
//                                  for ANGLE/Vulkan on the real GPU)
//   --builds base[,exp-x]         dirs under perf/builds/ (built by perf/build.sh)
//   --configs default[,nopanes,nomap,noblink,…]  settings presets (CONFIGS)
//   --runs N (5)  --secs S (60)  --speed X (2)  --warm S (20)
//   --log perf/play-88000-3m.log  --coi 1|0 (COOP/COEP; production is 0)
//   --trace        Chromium: DevTools trace of the measured window, summarised
//   --out file     results JSON (default perf/results/<scenario>-<time>.json)
//
// Runs interleave variants (ABBA per run) in one browser instance each.
// Every run is a fresh context at 1728×1000 CSS px, devicePixelRatio 2.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

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

const { logToFrames } = await import('../src/net/replay-socket.ts');
const { chromium, firefox } = await import('@playwright/test');
const { serveDir } = await import('./serve.ts');
const { snapshot, delta, loadavg } = await import('./procstat.ts');
type Browser = import('@playwright/test').Browser;
type Page = import('@playwright/test').Page;

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// ------------------------------------------------------------------ args
const argv = process.argv.slice(2);
const scenario = argv[0] ?? 'play';
const opt = (name: string, def: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1]!.startsWith('--') ? argv[i + 1]! : def;
};
const flag = (name: string): boolean => argv.includes(`--${name}`);
const browsers = opt('browsers', 'firefox,chromium').split(',');
const builds = opt('builds', 'base').split(',');
const configs = opt('configs', 'default').split(',');
const runs = Number(opt('runs', '5'));
const secs = Number(opt('secs', scenario === 'play' ? '60' : '20'));
const speed = Number(opt('speed', '2'));
const warm = Number(opt('warm', '20'));
const logPath = opt('log', 'perf/play-88000-3m.log');
const coi = opt('coi', '1') !== '0';
const trace = flag('trace');
const gpu = flag('gpu');
const port0 = Number(opt('port', '4241'));
const outPath = opt('out', `perf/results/${scenario}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`);

/** Settings presets (SettingsStore.update patches). */
const CONFIGS: Record<string, unknown> = {
  default: null,
  nopanes: { panes: { character: { on: false }, timers: { on: false }, group: { on: false }, comm: { on: false }, ui: { on: false }, map: { on: false } } },
  nomap: { panes: { map: { on: false } } },
  onlymap: { panes: { character: { on: false }, timers: { on: false }, group: { on: false }, comm: { on: false }, ui: { on: false } } },
  noblink: { appearance: { cursorBlink: false } },
  // The map floating over the right dock (Timers/Group) instead of the game
  // text: 30 × 14 cells at 1728 px (192 × 58 cells; right dock cols 159–191).
  mapright: { layout: { floating: [{ id: 'map', x: 161, y: 12, w: 30, h: 14 }] } },
  noblinknomap: { appearance: { cursorBlink: false }, panes: { map: { on: false } } },
  nopanesnoblink: { appearance: { cursorBlink: false }, panes: { character: { on: false }, timers: { on: false }, group: { on: false }, comm: { on: false }, ui: { on: false }, map: { on: false } } },
};
for (const c of configs) if (!(c in CONFIGS)) throw new Error(`unknown config ${c}`);

// ---------------------------------------------------------- the play feed
interface Ev {
  at: number;
  b?: string;
  sent?: string;
}
const logText = readFileSync(logPath, 'utf8');
/** `benchpaint`: the start of the bench's fixture (the owner's biggest log). */
const BENCH_TEXT =
  scenario === 'benchpaint'
    ? readFileSync(opt('benchlog', '/home/ole/MUME/data/runs/Rasta/2026-09-18T18-11-42.log'), 'utf8').split('\n').slice(0, 6000).join('\n')
    : '';
const events: Ev[] = [];
for (const f of logToFrames(logText, { speed: 1, sends: true })) {
  if (f.sent !== undefined) events.push({ at: f.atMs, sent: f.sent });
  else if (f.bytes.length) events.push({ at: f.atMs, b: Buffer.from(f.bytes).toString('base64') });
}

// ------------------------------------------------------ in-page recorder
// Installed before the app runs: wraps requestAnimationFrame (frame
// grouping by the rAF timestamp, callback script time, and a MessageChannel
// message posted from the frame's first callback, which runs after the
// frame's style/layout/paint: the main-thread frame time), and
// ResizeObserver callbacks.
const INSTR = `(() => {
  const W = window;
  const R = W.__perfE = { frames: [], renders: [], ro: [], clock: [], flushTags: 0, on: false, cur: null };
  const raf = W.requestAnimationFrame.bind(W);
  const ch = new MessageChannel();
  let pending = [];
  ch.port1.onmessage = () => { const now = performance.now(); for (const f of pending) f.after = now - f.s; pending = []; };
  W.requestAnimationFrame = (cb) => raf((ts) => {
    const t0 = performance.now();
    let f = R.cur;
    if (!f || f.t !== ts) {
      f = R.cur = { t: ts, s: t0, cb: 0, n: 0, after: -1 };
      if (R.on) { R.frames.push(f); pending.push(f); if (pending.length === 1) ch.port2.postMessage(0); }
    }
    W.__frameT = ts;
    try { cb(ts); } finally { f.cb += performance.now() - t0; f.n++; }
  });
  const RO = W.ResizeObserver;
  if (RO) W.ResizeObserver = class extends RO {
    constructor(cb) { super((entries, obs) => { const t0 = performance.now(); try { cb(entries, obs); } finally { if (R.on) R.ro.push({ s: t0, d: performance.now() - t0, n: entries.length }); } }); }
  };
})();`;

/** After the app is up: pane render wrappers, clock strip, flush tags, the driver. */
function installHooks(): void {
  const W = window as unknown as Record<string, any>;
  const R = W.__perfE;
  const probe = W.__wcBench;
  const app = probe.app;
  for (const id of ['character', 'timers', 'group', 'comm', 'ui', 'map']) {
    const p = app.cockpit.pane(id);
    for (const m of ['render', 'blank']) {
      const orig = p[m];
      p[m] = function (this: unknown) {
        const t0 = performance.now();
        try {
          return orig.call(this);
        } finally {
          const d = performance.now() - t0;
          if (R.on) R.renders.push({ p: id, m, ft: W.__frameT, s: t0, d, el: p.content.getElementsByTagName('*').length });
        }
      };
    }
  }
  const cs = app.clockStrip;
  const upd = cs.update;
  cs.update = function (this: unknown) {
    const t0 = performance.now();
    try {
      return upd.call(this);
    } finally {
      if (R.on) R.clock.push({ s: t0, d: performance.now() - t0 });
    }
  };
  const fl = probe.flushes;
  fl.push = function (this: unknown[], r: Record<string, unknown>) {
    r.ft = W.__frameT;
    return Array.prototype.push.call(this, r);
  };
  R.play = (evs: Array<{ at: number; b?: string; sent?: string }>, spd: number, maxMs: number, fromMs: number) =>
    new Promise((resolve) => {
      const dec = evs.map((e) => (e.b !== undefined ? { at: e.at, bytes: Uint8Array.from(atob(e.b), (c) => c.charCodeAt(0)) } : e));
      const sock = probe.sock;
      let i = 0;
      while (i < dec.length && dec[i].at < fromMs) i++;
      const base = i < dec.length ? dec[i].at : 0;
      const t0 = performance.now();
      const step = (): void => {
        const now = performance.now() - t0;
        while (i < dec.length && (dec[i].at - base) / spd <= now) {
          const e = dec[i++];
          if (e.sent !== undefined) probe.keyToSend(e.sent);
          else sock.onData(e.bytes);
        }
        if (i >= dec.length || now >= maxMs) return resolve({ delivered: i, ms: now, nextAt: i < dec.length ? dec[i].at : -1 });
        setTimeout(step, Math.max(0, Math.min(maxMs - now, (dec[i].at - base) / spd - (performance.now() - t0))));
      };
      step();
    });
}

// ------------------------------------------------------------------ stats
const pct = (xs: number[], p: number): number => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
};
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const r3 = (n: number): number => (Number.isFinite(n) ? Math.round(n * 1000) / 1000 : n);
const dist = (xs: number[]) => ({ n: xs.length, med: r3(pct(xs, 50)), p95: r3(pct(xs, 95)), max: r3(xs.length ? Math.max(...xs) : NaN), sum: r3(sum(xs)) });
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TRACE_CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.stack', 'disabled-by-default-devtools.timeline.frame', 'toplevel', 'cc', 'viz', 'gpu'];
/** CPU rows: the top 20 plus every process main thread. */
const cpuRows = (rows: Array<{ proc: string; thread: string; ms: number }>) =>
  rows.filter((x, i) => i < 20 || x.thread.endsWith('[main]')).map((x) => ({ ...x, ms: Math.round(x.ms) }));

// --------------------------------------------------------- chromium trace
type TEv = { name: string; cat: string; ph: string; ts: number; dur?: number; pid: number; tid: number; args?: any };
function summariseTrace(buf: Buffer, windowMs: number) {
  const ev = (JSON.parse(buf.toString()) as { traceEvents: TEv[] }).traceEvents;
  const threadNames = new Map<string, string>();
  for (const e of ev) if (e.name === 'thread_name' && e.ph === 'M') threadNames.set(`${e.pid}:${e.tid}`, e.args?.name ?? '');
  const mains = [...threadNames].filter(([, n]) => n === 'CrRendererMain').map(([k]) => k);
  // The page's renderer main thread: the one with the most FireAnimationFrame events.
  const count = new Map<string, number>();
  for (const e of ev) if (e.name === 'FireAnimationFrame' || e.name === 'UpdateLayoutTree') count.set(`${e.pid}:${e.tid}`, (count.get(`${e.pid}:${e.tid}`) ?? 0) + 1);
  const main = mains.sort((a, b) => (count.get(b) ?? 0) - (count.get(a) ?? 0))[0];
  const on = ev.filter((e) => `${e.pid}:${e.tid}` === main);
  const X = (name: string) => on.filter((e) => e.name === name && e.ph === 'X');
  const d = (xs: TEv[]) => xs.map((e) => (e.dur ?? 0) / 1000);
  const tasks = on.filter((e) => e.name === 'RunTask' && e.ph === 'X');
  const script = on.filter((e) => (e.name === 'FunctionCall' || e.name === 'FireAnimationFrame' || e.name === 'TimerFire' || e.name === 'EventDispatch' || e.name === 'v8.callFunction') && e.ph === 'X');
  const recalc = X('UpdateLayoutTree');
  const layout = X('Layout');
  // Forced (synchronous) layouts: a Layout inside a script event.
  const inScript = (e: TEv) => script.some((s) => s.ts <= e.ts && e.ts + (e.dur ?? 0) <= s.ts + (s.dur ?? 0));
  const forced = layout.filter(inScript);
  const forcedRecalc = recalc.filter(inScript);
  // Who forced them: the JS stack (needs disabled-by-default-devtools.timeline.stack).
  const who = new Map<string, { n: number; ms: number }>();
  const stackOf = (e: TEv): string => {
    const st: Array<{ functionName?: string; url?: string; lineNumber?: number }> =
      e.args?.beginData?.stackTrace ?? e.args?.data?.stackTrace ?? e.args?.stackTrace ?? [];
    return st.length ? st.slice(0, 4).map((f) => `${f.functionName || '(anon)'}@${(f.url ?? '').split('/').pop()}:${f.lineNumber ?? '?'}`).join(' < ') : '(no stack)';
  };
  for (const e of [...forced.map((x) => ['L', x] as const), ...forcedRecalc.map((x) => ['S', x] as const)]) {
    const k = `${e[0]} ${stackOf(e[1])}`;
    const w = who.get(k) ?? { n: 0, ms: 0 };
    w.n++;
    w.ms += (e[1].dur ?? 0) / 1000;
    who.set(k, w);
  }
  // Script that ran the forced work: the innermost enclosing script event's name + data.
  const forcedBy = [...who].sort((a, b) => b[1].ms - a[1].ms).slice(0, 12).map(([k, v]) => ({ k, n: v.n, ms: r3(v.ms) }));
  const elementCounts = recalc.map((e) => Number(e.args?.elementCount ?? 0));
  const dirty = layout.map((e) => Number(e.args?.beginData?.dirtyObjects ?? 0));
  const total = layout.map((e) => Number(e.args?.beginData?.totalObjects ?? 0));
  // Main-thread frames: one Commit per frame the main thread produced.
  const frames = on.filter((e) => e.name === 'Commit' && e.ph === 'X');
  // Compositor thread of the same renderer: BeginFrame (every frame it ticks) and DrawFrame (every frame drawn).
  const comp = [...threadNames].find(([k, n]) => n === 'Compositor' && k.split(':')[0] === main?.split(':')[0])?.[0];
  const onComp = ev.filter((e) => `${e.pid}:${e.tid}` === comp);
  const compBegin = onComp.filter((e) => e.name === 'BeginFrame').length;
  const compDraw = onComp.filter((e) => e.name === 'DrawFrame').length;
  const paints = X('Paint');
  const prepaint = X('PrePaint');
  const commit = on.filter((e) => e.name === 'Commit' && e.ph === 'X');
  const layerize = X('Layerize');
  // Whole-renderer: compositor frames.
  const drawFrames = ev.filter((e) => e.name === 'DrawFrame' || e.name === 'Graphics.Pipeline.DrawAndSwap');
  const perS = (n: number) => r3(n / (windowMs / 1000));
  return {
    mainTaskMs: r3(sum(d(tasks))),
    tasks: tasks.length,
    longestTasks: d(tasks).sort((a, b) => b - a).slice(0, 5).map(r3),
    mainFramesPerS: perS(new Set(frames.map((e) => e.ts)).size),
    recalc: { ...dist(d(recalc)), perS: perS(recalc.length), elements: dist(elementCounts), over1000: elementCounts.filter((n) => n > 1000).length, forced: forcedRecalc.length },
    layout: { ...dist(d(layout)), perS: perS(layout.length), dirty: dist(dirty), totalObjects: dist(total), forced: forced.length, forcedMs: r3(sum(d(forced))) },
    forcedBy,
    prepaint: dist(d(prepaint)),
    paint: { ...dist(d(paints)), perS: perS(paints.length) },
    layerize: dist(d(layerize)),
    commit: dist(d(commit)),
    drawFramesPerS: perS(drawFrames.length),
    compBeginFramesPerS: perS(compBegin),
    compDrawFramesPerS: perS(compDraw),
    bigRecalcs: recalc
      .filter((e) => Number(e.args?.elementCount ?? 0) > 1000)
      .slice(0, 10)
      .map((e) => ({ ms: r3((e.dur ?? 0) / 1000), elements: Number(e.args?.elementCount) })),
  };
}

// ----------------------------------------------------------------- runner
interface RunResult {
  browser: string;
  build: string;
  config: string;
  run: number;
  load: string;
  [k: string]: unknown;
}

async function openRun(browser: Browser, bname: string, base: string, config: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const ctx = await browser.newContext({
    viewport: { width: 1728, height: 1000 },
    ...(bname.startsWith('chromium') ? { deviceScaleFactor: 2 } : {}),
  });
  await ctx.addInitScript(INSTR);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error(`  pageerror: ${e.message}`));
  await page.goto(`${base}/?bench`);
  await page.waitForFunction(() => (window as any).__wcBench?.app != null);
  const dpr = await page.evaluate(() => devicePixelRatio);
  if (dpr !== 2) console.warn(`  warning: devicePixelRatio ${dpr}`);
  const patch = CONFIGS[config];
  if (patch) await page.evaluate((p) => (window as any).__wcBench.settings.update(p), patch);
  await page.evaluate(() => (window as any).__wcBench.connectFake());
  const mapOn = await page.evaluate(() => (window as any).__wcBench.settings.get().panes.map.on as boolean);
  if (mapOn) await page.waitForSelector('.wc-pane-map .wc-pane-content[data-map-drawn-ms]', { state: 'attached', timeout: 60_000 });
  await page.evaluate(installHooks);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await pause(300);
  return { page, close: () => ctx.close() };
}

function summarisePage(rec: any, windowMs: number) {
  const frames: Array<{ t: number; s: number; cb: number; n: number; after: number }> = rec.frames;
  const renders: Array<{ p: string; m: string; ft: number; s: number; d: number; el: number }> = rec.renders;
  const flushes: Array<{ start: number; script: number; frame: number; ft?: number }> = rec.flushes;
  const byFrame = new Map<number, { panes: string[]; paneMs: number; flush: boolean; flushMs: number }>();
  const slot = (t: number) => {
    let s = byFrame.get(t);
    if (!s) byFrame.set(t, (s = { panes: [], paneMs: 0, flush: false, flushMs: 0 }));
    return s;
  };
  for (const r of renders) {
    const s = slot(r.ft);
    s.panes.push(r.p);
    s.paneMs += r.d;
  }
  for (const f of flushes) {
    if (f.ft === undefined) continue;
    const s = slot(f.ft);
    s.flush = true;
    s.flushMs += f.script;
  }
  const cls = { O: [] as number[], OP: [] as number[], P: [] as number[], other: [] as number[] };
  const opPane: number[] = [];
  const opFlush: number[] = [];
  const oFlush: number[] = [];
  const cbAll: number[] = [];
  for (const f of frames) {
    if (f.after < 0) continue;
    cbAll.push(f.cb);
    const s = byFrame.get(f.t);
    if (s?.flush && s.panes.length) {
      cls.OP.push(f.after);
      opPane.push(s.paneMs);
      opFlush.push(s.flushMs);
    } else if (s?.flush) {
      cls.O.push(f.after);
      oFlush.push(s.flushMs);
    } else if (s?.panes.length) cls.P.push(f.after);
    else cls.other.push(f.after);
  }
  const panes: Record<string, unknown> = {};
  for (const id of ['character', 'timers', 'group', 'comm', 'ui', 'map']) {
    const rs = renders.filter((r) => r.p === id && r.m === 'render');
    if (!rs.length) continue;
    const inFlush = rs.filter((r) => byFrame.get(r.ft)?.flush).length;
    panes[id] = { ...dist(rs.map((r) => r.d)), perS: r3(rs.length / (windowMs / 1000)), inOutputFrame: inFlush, elements: r3(pct(rs.map((r) => r.el), 50)) };
  }
  return {
    frames: frames.length,
    framesPerS: r3(frames.length / (windowMs / 1000)),
    frameMs: { O: dist(cls.O), OP: dist(cls.OP), P: dist(cls.P), other: dist(cls.other) },
    rafScript: dist(cbAll),
    paneScriptInOutputFrames: dist(opPane),
    flushScriptOP: dist(opFlush),
    flushScriptO: dist(oFlush),
    panes,
    paneScriptTotalMs: r3(sum(renders.map((r) => r.d))),
    flush: dist(flushes.map((f) => f.script)),
    ro: { n: rec.ro.length, ms: r3(sum(rec.ro.map((x: { d: number }) => x.d))) },
    clock: { n: rec.clock.length, ms: r3(sum(rec.clock.map((x: { d: number }) => x.d))) },
  };
}

async function runOne(browser: Browser, bname: string, base: string, build: string, config: string, run: number): Promise<RunResult> {
  const { page, close } = await openRun(browser, bname, base, config);
  const res: RunResult = { browser: bname, build, config, run, load: loadavg() };
  try {
    await page.evaluate(() => {
      (window as any).__wcBench.flushes.length = 0;
    });
    if (scenario === 'play') {
      // 5 s warm-up (JIT, first renders), then the measured window.
      await page.evaluate(([evs, spd]) => (window as any).__perfE.play(evs, spd, 5000, 0), [events, speed] as const);
      const fromMs = 5000 * speed;
      const c0 = snapshot();
      if (trace && bname.startsWith('chromium')) await browser.startTracing(page, { categories: TRACE_CATS });
      const t0 = Date.now();
      const out = await page.evaluate(
        ([evs, spd, ms, from]) => {
          const R = (window as any).__perfE;
          R.frames.length = 0;
          R.renders.length = 0;
          R.ro.length = 0;
          R.clock.length = 0;
          (window as any).__wcBench.flushes.length = 0;
          R.on = true;
          performance.mark('perfE-start');
          return R.play(evs, spd, ms, from).then((x: unknown) => {
            performance.mark('perfE-end');
            R.on = false;
            return x;
          });
        },
        [events, speed, secs * 1000, fromMs] as const,
      );
      const windowMs = Date.now() - t0;
      await pause(100);
      const c1 = snapshot();
      if (trace && bname.startsWith('chromium')) {
        const tb = await browser.stopTracing();
        if (flag('savetrace')) writeFileSync(`${ROOT}perf/results/trace-${scenario}-${build}-${config}-${run}.json`, tb);
        res.trace = summariseTrace(tb, windowMs);
      }
      const rec = await page.evaluate(() => {
        const R = (window as any).__perfE;
        return { frames: R.frames, renders: R.renders, ro: R.ro, clock: R.clock, flushes: (window as any).__wcBench.flushes };
      });
      res.windowMs = windowMs;
      res.delivered = out;
      res.page = summarisePage(rec, windowMs);
      res.cpu = cpuRows(delta(c0, c1));
    } else {
      // idle / typing / latency: warm up with the play log, then stop
      // feeding. `benchpaint` mirrors bench/browser-bench.ts benchFramePaint
      // instead: no warm-up play (no GMCP, panes inactive, the input empty
      // and focused as the bench leaves it).
      if (scenario !== 'benchpaint') {
        await page.evaluate(([evs, spd, ms]) => (window as any).__perfE.play(evs, spd, ms, 0), [events, speed, warm * 1000] as const);
      } else {
        await page.evaluate((t) => (window as any).__wcBench.loadFrames(t, 1, 410), BENCH_TEXT);
        for (let i = 0; i < 10; i++) {
          await page.evaluate((k) => (window as any).__wcBench.inject(k), i);
          await pause(30);
        }
      }
      // A command leaves its text selected (the caret hides); `--caret` puts
      // a collapsed caret at the end, as while composing a command.
      if (flag('caret')) {
        await page.focus('.wc-input-field');
        await page.keyboard.press('End');
      }
      await pause(2000);
      await page.evaluate(() => {
        const R = (window as any).__perfE;
        R.frames.length = 0;
        R.renders.length = 0;
        R.ro.length = 0;
        R.clock.length = 0;
        (window as any).__wcBench.flushes.length = 0;
        R.on = true;
        performance.mark('perfE-start');
      });
      res.state = await page.evaluate(() => {
        const c = document.querySelector('.wc-caret') as HTMLElement | null;
        const cs = c ? getComputedStyle(c) : null;
        return {
          hasFocus: document.hasFocus(),
          active: (document.activeElement as HTMLElement | null)?.className ?? null,
          caret: c ? { hidden: c.hidden, cls: c.className, anim: cs!.animationName, opacity: cs!.opacity } : null,
          animations: document.getAnimations().map((a) => (a as CSSAnimation).animationName ?? a.constructor.name),
          conn: (window as any).__wcBench.app.session.state,
        };
      });
      const c0 = snapshot();
      if (trace && bname.startsWith('chromium')) await browser.startTracing(page, { categories: TRACE_CATS });
      const t0 = Date.now();
      if (scenario === 'typing') {
        await page.focus('.wc-input-field');
        const end = t0 + secs * 1000;
        let k = 0;
        while (Date.now() < end) {
          await page.keyboard.press(String.fromCharCode(97 + (k++ % 26)));
          if (k % 30 === 0) await page.keyboard.press('Control+a');
          await pause(100);
        }
      } else if (scenario === 'benchpaint') {
        // The bench's frame → paint: fixture frames 10…409 at random
        // 20–80 ms intervals.
        const lat: Array<{ toFlush: number; toPaint: number; script: number }> = [];
        for (let k = 10; k < 410 && Date.now() < t0 + secs * 1000; k++) {
          lat.push(await page.evaluate((n) => (window as any).__wcBench.inject(n), k));
          await pause(20 + Math.random() * 60);
        }
        const wait = lat.map((x) => x.toFlush - x.script);
        res.latency = { n: lat.length, toPaint: dist(lat.map((x) => x.toPaint)), toFlush: dist(lat.map((x) => x.toFlush)), wait: dist(wait), script: dist(lat.map((x) => x.script)) };
      } else if (scenario === 'latency') {
        // One short line at random 150–450 ms intervals (nothing else
        // arriving): receipt → end of flush and → after the frame painted
        // (bench-hook `inject`), e.g. with and without a running caret blink.
        const lat: Array<{ toFlush: number; toPaint: number; script: number }> = [];
        const end = t0 + secs * 1000;
        let k = 0;
        while (Date.now() < end) {
          lat.push(await page.evaluate((n) => (window as any).__wcBench.inject(`A short line of game text number ${n}.\r\n`), k++));
          await pause(150 + Math.random() * 300);
        }
        const wait = lat.map((x) => x.toFlush - x.script);
        res.latency = { n: lat.length, toPaint: dist(lat.map((x) => x.toPaint)), toFlush: dist(lat.map((x) => x.toFlush)), wait: dist(wait), script: dist(lat.map((x) => x.script)) };
      } else {
        await pause(secs * 1000);
      }
      const windowMs = Date.now() - t0;
      if (trace && bname.startsWith('chromium')) res.trace = summariseTrace(await browser.stopTracing(), windowMs);
      const c1 = snapshot();
      const rec = await page.evaluate(() => {
        const R = (window as any).__perfE;
        R.on = false;
        performance.mark('perfE-end');
        return { frames: R.frames, renders: R.renders, ro: R.ro, clock: R.clock, flushes: (window as any).__wcBench.flushes };
      });
      res.windowMs = windowMs;
      res.page = summarisePage(rec, windowMs);
      res.cpu = cpuRows(delta(c0, c1));
    }
  } finally {
    await close();
  }
  return res;
}

// ------------------------------------------------------------------- main
const servers = await Promise.all(builds.map((b, i) => serveDir(`${ROOT}perf/builds/${b}`, port0 + i, coi)));
const results: RunResult[] = [];
console.log(`e-harness ${scenario}: browsers ${browsers.join(',')}, builds ${builds.join(',')}, configs ${configs.join(',')}, runs ${runs}, ${secs} s, speed ${speed}, coi ${coi}, log ${logPath} (${events.length} events)`);
const ffprof = flag('ffprof');
const { summariseFfProfile } = await import('./ffprof.ts');
async function launch(bname: string, profOut: string | null): Promise<Browser> {
  const type = bname.startsWith('chromium') ? chromium : firefox;
  return type.launch({
    ...(bname === 'firefox' ? { firefoxUserPrefs: { 'layout.css.devPixelsPerPx': '2' } } : {}),
    ...(bname.startsWith('chromium') && gpu ? { args: ['--enable-gpu', '--use-angle=vulkan'] } : {}),
    ...(profOut
      ? {
          env: {
            ...process.env,
            MOZ_PROFILER_STARTUP: '1',
            MOZ_PROFILER_SHUTDOWN: profOut,
            MOZ_PROFILER_STARTUP_FEATURES: 'js,stackwalk,cpu,markersallthreads,nomarkerstacks',
            MOZ_PROFILER_STARTUP_FILTERS: 'GeckoMain,Compositor,Renderer,DOM Worker,SwComposite,WRRenderBackend,WRSceneBuilder,CanvasRenderer',
            MOZ_PROFILER_STARTUP_INTERVAL: '1',
            MOZ_PROFILER_STARTUP_ENTRIES: '16777216',
          } as Record<string, string>,
        }
      : {}),
  });
}
try {
  for (const bname of browsers) {
    const perRun = ffprof && bname === 'firefox';
    let shared: Browser | null = perRun ? null : await launch(bname, null);
    try {
      const variants: Array<[number, string]> = [];
      builds.forEach((b, i) => configs.forEach((c) => variants.push([i, c])));
      for (let run = 0; run < runs; run++) {
        const order = run % 2 === 0 ? variants : [...variants].reverse();
        for (const [bi, config] of order) {
          const profOut = perRun ? `${ROOT}perf/results/ffprof-${scenario}-${builds[bi]}-${config}-${run}.json` : null;
          const browser = shared ?? (await launch(bname, profOut));
          const version = browser.version();
          let r: RunResult;
          try {
            r = await runOne(browser, bname, `http://127.0.0.1:${port0 + bi}`, builds[bi]!, config, run);
          } finally {
            if (!shared) await browser.close();
          }
          r.version = version;
          if (profOut) {
            try {
              r.ffprof = summariseFfProfile(profOut);
            } catch (err) {
              console.error(`  ffprof: ${String(err)}`);
            }
            if (!flag('keepprof')) rmSync(profOut, { force: true });
          }
          results.push(r);
          const p = r.page as ReturnType<typeof summarisePage>;
          const main = (r.cpu as Array<{ proc: string; thread: string; ms: number }>).filter((x) => x.thread.endsWith('[main]'));
          const ff = r.ffprof as { markers: Record<string, { perS: number }>; cpuMs: number | null } | undefined;
          console.log(
            `  ${bname} ${builds[bi]} ${config} #${run}: frames ${p.frames} (${p.framesPerS}/s); frame ms O ${p.frameMs.O.med}/${p.frameMs.O.p95} OP ${p.frameMs.OP.med}/${p.frameMs.OP.p95} P ${p.frameMs.P.med}/${p.frameMs.P.p95}; pane script ${p.paneScriptTotalMs} ms; ` +
              `main CPU ${main.map((x) => `${x.proc}=${x.ms}`).join(' ')}` +
              (ff ? `; ffprof ticks/s ${ff.markers.RefreshDriverTick?.perS ?? 0} cpu ${ff.cpuMs}` : '') +
              (r.latency ? `; toPaint med ${(r.latency as any).toPaint.med} p95 ${(r.latency as any).toPaint.p95} wait med ${(r.latency as any).wait.med}` : '') +
              `; load ${r.load.split(' ').slice(0, 3).join(' ')}`,
          );
        }
      }
    } finally {
      await shared?.close();
      shared = null;
    }
  }
} finally {
  for (const s of servers) s.close();
}
mkdirSync(`${ROOT}perf/results`, { recursive: true });
writeFileSync(`${ROOT}${outPath}`, JSON.stringify({ scenario, browsers, builds, configs, runs, secs, speed, warm, coi, log: logPath, argv, results }, null, 1));
console.log(`wrote ${outPath}`);
