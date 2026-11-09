// Comm and Statistics pane cost (stage 49, ADR 0134 "Performance rules").
//
//   npx vite build && npx vite preview --port 5301 --strictPort &
//   node bench/pane-cost.ts --url main=http://localhost:5301[,branch=http://localhost:5302] \
//     [--browsers firefox,chromium] [--runs 3] [--out bench/results/pane-cost.md] [--quick]
//
// Drives the production build through the `?bench` probe at the owner's
// geometry (1728 × 1000, ratio 2; Firefox through the devPixelsPerPx pref,
// Chromium on the real GPU), map and weather off so the panes are what is
// measured. Everything is fed as the game would (GMCP and text through the
// fake socket) and measured from outside the panes, so the same script
// measures the old panes (main) and the new ones (stage 49). Several `--url`
// builds are measured round-robin (interleaved), `--runs` rounds.
//
// Comm (the Comm pane on, Statistics off):
// - seed:      1000 Comm.Channel.Text in one delivery (the history).
// - isolated:  40 messages 250 ms apart (tells, says, narrates, emotes …,
//              twelve talkers, some from you): per message the delivery
//              task (GMCP handlers, microtasks) and the first animation
//              frame after it that rendered the Comm pane: callback start
//              → rendered ("frame after"), and the pane's render script.
// - burst:     50 messages in 1 s (one every 20 ms): frames in the window
//              (median / p95 / max of callback start → rendered), long
//              animation frames; Chromium: main-thread time per message
//              from a trace (window minus an idle window of equal length).
//
// Statistics (the Statistics pane on, Comm off):
// - seed:      499 kills emitted into the live run (the deriver's emit:
//              the probe's only shortcut; 500 real kills would take
//              minutes of fold timers).
// - kills:     15 real kills (a death line, then Char.Vitals with the XP),
//              1.6 s apart (the 500 ms fold, the pane's ≤ 1/s refresh):
//              pass 1 (nothing forced): the app's rAF callback time in the
//              1.6 s after a kill and, Chromium, main-thread time per kill
//              (kill windows minus an idle window); pass 2, 15 more kills
//              with our own rAF loop forcing a frame every vsync (callback
//              start → rendered, so DOM work done outside rAF shows): the
//              longest frame after a kill.
// - tick:      20 s with no events, the pane shown: the app's animation
//              frames with callbacks per second and, Chromium, main-thread
//              time per second (nothing forced); then 20 s with our rAF
//              loop: the worst frame of each second (median over seconds).
//
// The message task is the delivery plus the microtasks it queued.
//
// Writes a Markdown report (default bench/results/pane-cost.md).

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
const { framesOf, loginFrames } = await import('./feeds');
const { pct, median, max, f1, f2, pause, loadavg, launchTarget, openBench, closePage, OWNER } = L;
type Target = import('./lib').Target;
type TargetName = import('./lib').TargetName;
type Page = import('@playwright/test').Page;

// ---------------------------------------------------------------- options

const argv = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : def;
};
const QUICK = argv.includes('--quick');
const URLS = opt('url', '')
  .split(',')
  .filter(Boolean)
  .map((s) => {
    const eq = s.indexOf('=');
    return eq > 0 && !s.startsWith('http') ? { label: s.slice(0, eq), url: s.slice(eq + 1) } : { label: 'build', url: s };
  });
if (URLS.length === 0) throw new Error('--url [label=]http://… of a running production build (vite preview) is required');
const RUNS = Number(opt('runs', QUICK ? '1' : '3'));
const GPU = process.env.WC_BENCH_GPU !== '0';
const BROWSERS = opt('browsers', 'firefox,chromium')
  .split(',')
  .map((b) => (b === 'chromium' && GPU ? 'chromium-gpu' : b) as TargetName);
const OUT = opt('out', new URL('./results/pane-cost.md', import.meta.url).pathname);
const ISOLATED = QUICK ? 15 : 40;
const BURST = 50;
const KILLS = QUICK ? 6 : 15;
const TICK_S = QUICK ? 8 : 20;

// ------------------------------------------------------------------ feeds

const T0 = 1_790_449_300_000_000;
const TALKERS = ['Lindir', 'Haldis', 'Tarnil', 'Morwen', 'Brannoc', 'Ithilwen', 'Ruel', 'Sorcha', 'Gamling', 'Eodwine', 'Fastred', 'Hirgon'];
const WORDS = 'anyone selling a lantern the orcs are gathering at the ford meet at bree gate in five need a cleric for the barrows thanks for the group well fought see you tomorrow'.split(' ');

/** One Comm.Channel.Text payload, deterministic in `i`. */
function commMsg(i: number): Record<string, unknown> {
  const words = 4 + (i * 7) % 14;
  const msg = Array.from({ length: words }, (_, k) => WORDS[(i * 3 + k * 5) % WORDS.length]).join(' ');
  const who = TALKERS[(i * 5) % TALKERS.length]!;
  const mine = i % 9 === 4;
  const kind = i % 10;
  if (kind <= 2) {
    return mine
      ? { channel: 'tells', talker: 'You', 'talker-type': 'player', destination: who, text: `You tell ${who} '${msg}'` }
      : { channel: 'tells', talker: who, 'talker-type': 'player', text: `${who} tells you '${msg}'` };
  }
  if (kind <= 4) return { channel: 'says', talker: mine ? 'You' : who, 'talker-type': 'player', text: mine ? `You say '${msg}'` : `${who} says '${msg}'` };
  if (kind === 5) return { channel: 'tales', talker: who, 'talker-type': 'player', text: `${who} narrates '${msg}'` };
  if (kind === 6) return { channel: 'emotes', talker: who, 'talker-type': 'player', text: `${who} grins at you.` };
  if (kind === 7) return { channel: 'yells', talker: who, 'talker-type': 'player', text: `${who} yells '${msg}'` };
  if (kind === 8) return { channel: 'whispers', talker: who, 'talker-type': 'player', text: `${who} whispers to you '${msg}'` };
  return { channel: 'socials', talker: who, 'talker-type': 'player', text: `${who} smiles happily.` };
}

const gmcpLine = (us: number, pkg: string, data: unknown) => `${us} \x1bGMCP ${pkg} ${JSON.stringify(data)}`;

/** The 1000-message history as one log, delivered as its frames. */
function commSeed(): string[] {
  const lines: string[] = [];
  for (let i = 0; i < 1000; i++) lines.push(gmcpLine(T0 + i * 1000, 'Comm.Channel.Text', commMsg(i)));
  return framesOf(lines.join('\n') + '\n').map((f) => f.b64);
}

/** One message each (its own telnet frame). */
function commOnes(from: number, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const fr = framesOf(gmcpLine(T0 + 2_000_000_000 + i * 1000, 'Comm.Channel.Text', commMsg(from + i)) + '\n');
    out.push(fr.map((f) => f.b64).join(''));
    if (fr.length !== 1) throw new Error('a message spans frames');
  }
  return out;
}

const MOBS = ['a stone troll', 'an orc warrior', 'a black bear', 'a barrow-wight', 'a cave troll', 'a hill giant', 'an orc captain', 'a great spider'];

/** A real kill: the death line, then Char.Vitals with the XP after it. */
function killFrame(i: number, xp: number): string {
  const us = T0 + 3_000_000_000 + i * 1000;
  const mob = MOBS[i % MOBS.length]!;
  const line = `${us} ${mob[0]!.toUpperCase()}${mob.slice(1)} is dead! R.I.P.`;
  const fr = framesOf(`${line}\n${gmcpLine(us + 10, 'Char.Vitals', { xp })}\n`);
  return fr.map((f) => f.b64).join('|');
}

// ---------------------------------------------------------------- browser

/** Installs the page helpers: deliver one base64 frame (or `|`-joined frames) and time its task. */
async function installHelpers(page: Page): Promise<void> {
  await page.evaluate(() => {
    const ch = new MessageChannel();
    const q: Array<() => void> = [];
    ch.port1.onmessage = () => q.shift()?.();
    const dec = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    (window as unknown as { __pc: unknown }).__pc = {
      async send(b64: string): Promise<{ t0: number; task: number }> {
        const t0 = performance.now();
        for (const part of b64.split('|')) window.__wcBench!.deliver(dec(part));
        // The delivery and the microtasks it queued (a Preact render runs there).
        for (let i = 0; i < 4; i++) await Promise.resolve();
        return { t0, task: performance.now() - t0 };
      },
      /** Our own rAF loop: every frame's callback start → rendered (a frame is forced each vsync). */
      loop: null as null | { on: boolean; recs: Array<{ s: number; after: number }> },
      loopStart(): void {
        const L = { on: true, recs: [] as Array<{ s: number; after: number }> };
        (this as { loop: typeof L | null }).loop = L;
        const tick = (): void => {
          if (!L.on) return;
          const s = performance.now();
          const rec = { s, after: -1 };
          L.recs.push(rec);
          q.push(() => (rec.after = performance.now() - s));
          ch.port2.postMessage(null);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      loopStop(): Array<{ s: number; after: number }> {
        const L = (this as { loop: { on: boolean; recs: Array<{ s: number; after: number }> } | null }).loop;
        if (!L) return [];
        L.on = false;
        return L.recs.filter((r) => r.after >= 0);
      },
    };
  });
}

type FrameRec = { s: number; cb: number; after: number; panes: string[]; paneMs: number };

const frames = (page: Page) => page.evaluate(() => window.__wcBench!.animFrames.map((f) => ({ s: f.s, cb: f.cb, after: f.after, panes: f.panes, paneMs: f.paneMs })) as FrameRec[]);
const logOn = (page: Page, on: boolean) =>
  page.evaluate((v) => {
    const B = window.__wcBench!;
    if (v) B.animFrames.length = 0;
    B.animLogOn = v;
  }, on);

const loopStart = (page: Page) => page.evaluate(() => (window as unknown as { __pc: { loopStart(): void } }).__pc.loopStart());
const loopStop = (page: Page) => page.evaluate(() => (window as unknown as { __pc: { loopStop(): Array<{ s: number; after: number }> } }).__pc.loopStop());
const send = (page: Page, b64: string) =>
  page.evaluate((s) => (window as unknown as { __pc: { send(s: string): Promise<{ t0: number; task: number }> } }).__pc.send(s), b64);

/** Chromium: the main-thread task time (outermost RunTask on the busiest renderer main) of a trace, ms. */
function traceBusy(buf: Buffer): number {
  type Ev = { name: string; ph: string; ts: number; dur?: number; pid: number; tid: number; args?: { name?: string } };
  const all = (JSON.parse(buf.toString()) as { traceEvents: Ev[] }).traceEvents;
  const names = new Map<string, string>();
  for (const e of all) if (e.name === 'thread_name' && e.ph === 'M') names.set(`${e.pid}:${e.tid}`, e.args?.name ?? '');
  const count = new Map<string, number>();
  for (const e of all) {
    const k = `${e.pid}:${e.tid}`;
    if (names.get(k) === 'CrRendererMain' && e.name === 'RunTask') count.set(k, (count.get(k) ?? 0) + 1);
  }
  const main = [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
  const tasks = all
    .filter((e) => `${e.pid}:${e.tid}` === main && e.ph === 'X' && (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask'))
    .sort((a, b) => a.ts - b.ts || (b.dur ?? 0) - (a.dur ?? 0));
  let end = -Infinity;
  let busy = 0;
  for (const e of tasks) {
    if (e.ts < end) continue;
    busy += (e.dur ?? 0) / 1000;
    end = e.ts + (e.dur ?? 0);
  }
  return busy;
}

async function traced<T>(t: Target, page: Page, fn: () => Promise<T>): Promise<{ r: T; busy: number | null }> {
  if (!t.isChromium) return { r: await fn(), busy: null };
  await t.browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'toplevel'] });
  const r = await fn();
  return { r, busy: traceBusy(await t.browser.stopTracing()) };
}

const settingsFor = (pane: 'comm' | 'statistics') => ({
  panes: { map: { on: false }, comm: { on: pane === 'comm' }, statistics: { on: pane === 'statistics' } },
  weather: { enabled: false },
});

async function login(page: Page): Promise<string> {
  return page.evaluate(async (fr) => {
    const B = window.__wcBench!;
    B.connectFake();
    for (const s of fr) B.deliver(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
    await new Promise((r) => setTimeout(r, 500));
    return B.app!.session.state;
  }, loginFrames());
}

// ------------------------------------------------------------------- comm

interface CommSample {
  isoTask: number[];
  isoFrame: number[];
  isoPane: number[];
  burstFrames: number[];
  burstLong: number;
  /** Chromium: main-thread ms per burst message (burst window − idle window). */
  perMsg: number | null;
}

async function measureComm(t: Target, base: string): Promise<CommSample> {
  const page = await openBench(t, base, { settings: settingsFor('comm'), frames: true });
  await installHelpers(page);
  const st = await login(page);
  if (st !== 'playing') console.warn(`  warning: session ${st}, not playing`);
  for (const b of commSeed()) await send(page, b);
  await pause(1500);
  const iso = commOnes(1000, ISOLATED);
  const burst = commOnes(2000, BURST);
  const isoTask: number[] = [];
  const isoFrame: number[] = [];
  const isoPane: number[] = [];
  await logOn(page, true);
  for (const b of iso) {
    const { t0, task } = await send(page, b);
    await pause(250);
    const fs = (await frames(page)).filter((f) => f.s >= t0 && f.after >= 0);
    const f = fs.find((x) => x.panes.includes('comm')) ?? fs[0];
    isoTask.push(task);
    if (f) {
      isoFrame.push(f.after);
      isoPane.push(f.paneMs);
    }
  }
  await logOn(page, false);
  // Idle window (for the trace baseline), then the burst.
  const idle = await traced(t, page, () => pause(1200));
  await L.startMonitor(page);
  await logOn(page, true);
  const b = await traced(t, page, async () => {
    await page.evaluate(async (list) => {
      const pc = (window as unknown as { __pc: { send(s: string): Promise<unknown> } }).__pc;
      const t0 = performance.now();
      for (let i = 0; i < list.length; i++) {
        const due = t0 + i * 20;
        const wait = due - performance.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        void pc.send(list[i]!);
      }
    }, burst);
    await pause(200);
  });
  await logOn(page, false);
  const mon = await L.stopMonitor(page);
  const bf = (await frames(page)).filter((f) => f.after >= 0).map((f) => f.after);
  await closePage(page);
  return {
    isoTask,
    isoFrame,
    isoPane,
    burstFrames: bf,
    burstLong: mon.loafSupported ? mon.loaf.length : mon.deltas.filter((d) => d > 50).length,
    perMsg: b.busy !== null && idle.busy !== null ? (b.busy - idle.busy) / BURST : null,
  };
}

// ------------------------------------------------------------- statistics

interface StatsSample {
  killMax: number[];
  killCb: number[];
  perKill: number | null;
  tickWorst: number[];
  tickFps: number;
  perSecond: number | null;
  started: boolean;
}

async function measureStats(t: Target, base: string): Promise<StatsSample> {
  const page = await openBench(t, base, { settings: settingsFor('statistics'), frames: true });
  await installHelpers(page);
  await login(page);
  // Seed 499 kills into the live run.
  const seeded = await page.evaluate((mobs) => {
    const app = window.__wcBench!.app! as unknown as { runEvents: { started: boolean; events: readonly { type: string; us: number }[]; emit(e: unknown): void } };
    const d = app.runEvents;
    if (!d.started) return false;
    const start = d.events.find((e) => e.type === 'run_start')?.us ?? Date.now() * 1000;
    for (let i = 0; i < 499; i++) {
      d.emit({ type: 'kill', us: start + (i + 1) * 1000, logUs: start + (i + 1) * 1000, mobName: mobs[i % mobs.length], xpDelta: 1500 + ((i * 7919) % 9000) });
    }
    return true;
  }, MOBS);
  if (!seeded) console.warn('  warning: the run did not start; Statistics shows no run');
  await pause(3000);
  let xp = 5_770_000 + 499 * 6000;
  const killMax: number[] = [];
  const killCb: number[] = [];
  const idle = await traced(t, page, () => pause(1600 * KILLS));
  // Pass 1, nothing forced: the app's own rAF callback time and (Chromium) main-thread time per kill.
  const k = await traced(t, page, async () => {
    for (let i = 0; i < KILLS; i++) {
      xp += 1500 + ((i * 4241) % 9000);
      await logOn(page, true);
      await send(page, killFrame(i, xp));
      await pause(1600);
      await logOn(page, false);
      const fs = (await frames(page)).filter((f) => f.after >= 0);
      killCb.push(fs.reduce((a, f) => a + f.cb, 0));
    }
  });
  // Pass 2, a frame forced every vsync: the longest frame after a kill.
  for (let i = 0; i < KILLS; i++) {
    xp += 1500 + ((i * 4241) % 9000);
    await loopStart(page);
    await send(page, killFrame(KILLS + i, xp));
    await pause(1600);
    killMax.push(max((await loopStop(page)).map((f) => f.after)));
  }
  // Frames the page produces by itself (the tick, the caret), then the
  // per-frame cost with a frame forced every vsync (our rAF loop).
  await logOn(page, true);
  const tick = await traced(t, page, () => pause(TICK_S * 1000));
  await logOn(page, false);
  const tickFps = (await frames(page)).length / TICK_S;
  await loopStart(page);
  await pause(TICK_S * 1000);
  const fs = await loopStop(page);
  const s0 = fs[0]?.s ?? 0;
  const bySec = new Map<number, number>();
  for (const f of fs) {
    const sec = Math.floor((f.s - s0) / 1000);
    bySec.set(sec, Math.max(bySec.get(sec) ?? 0, f.after));
  }
  await closePage(page);
  return {
    killMax,
    killCb,
    perKill: k.busy !== null && idle.busy !== null ? (k.busy - idle.busy) / KILLS : null,
    tickWorst: [...bySec.values()],
    tickFps: tickFps,
    perSecond: tick.busy !== null ? tick.busy / TICK_S : null,
    started: seeded,
  };
}

// ------------------------------------------------------------------- main

const comm = new Map<string, CommSample[]>();
const stats = new Map<string, StatsSample[]>();
const key = (b: string, u: string) => `${b}|${u}`;
const renderers = new Map<string, string>();

for (const name of BROWSERS) {
  const t = await launchTarget(name, OWNER);
  renderers.set(name, t.isChromium ? await L.glRenderer(t.browser) : 'Firefox');
  for (let r = 0; r < RUNS; r++) {
    for (const u of URLS) {
      console.log(`${name} run ${r + 1}/${RUNS} ${u.label}: comm`);
      const c = await measureComm(t, u.url);
      comm.set(key(name, u.label), [...(comm.get(key(name, u.label)) ?? []), c]);
      console.log(`${name} run ${r + 1}/${RUNS} ${u.label}: statistics`);
      const s = await measureStats(t, u.url);
      stats.set(key(name, u.label), [...(stats.get(key(name, u.label)) ?? []), s]);
    }
  }
  await t.browser.close();
}

// ----------------------------------------------------------------- report

const range = (xs: number[], f: (n: number) => string = f2): string => {
  const ok = xs.filter((x) => Number.isFinite(x));
  if (ok.length === 0) return '—';
  const lo = Math.min(...ok);
  const hi = Math.max(...ok);
  return lo === hi ? f(lo) : `${f(lo)}–${f(hi)}`;
};
const per = <T>(xs: T[], fn: (x: T) => number) => xs.map(fn);

const lines: string[] = [];
lines.push('# Comm and Statistics pane cost (bench/pane-cost.ts)');
lines.push('');
lines.push(`${new Date().toISOString()} · ${L.geometryText(OWNER)} · runs ${RUNS} · load ${loadavg()}`);
lines.push(`Builds: ${URLS.map((u) => `${u.label} = ${u.url}`).join(', ')}. Renderers: ${[...renderers].map(([k, v]) => `${k}: ${v}`).join('; ')}.`);
lines.push('');
lines.push('Ranges are over the runs (each run’s median or p95). ms unless named.');
lines.push('');
lines.push('| Measure | ' + BROWSERS.flatMap((b) => URLS.map((u) => `${b} ${u.label}`)).join(' | ') + ' |');
lines.push('|---|' + BROWSERS.flatMap(() => URLS.map(() => '---')).join('|') + '|');
const row = (label: string, fn: (b: string, u: string) => string) =>
  lines.push(`| ${label} | ` + BROWSERS.flatMap((b) => URLS.map((u) => fn(b, u.label))).join(' | ') + ' |');
const C = (b: string, u: string) => comm.get(key(b, u)) ?? [];
const S = (b: string, u: string) => stats.get(key(b, u)) ?? [];
row('Comm: message task, median / p95', (b, u) => `${range(per(C(b, u), (s) => median(s.isoTask)))} / ${range(per(C(b, u), (s) => pct(s.isoTask, 95)))}`);
row('Comm: frame after a message, median / p95', (b, u) => `${range(per(C(b, u), (s) => median(s.isoFrame)))} / ${range(per(C(b, u), (s) => pct(s.isoFrame, 95)))}`);
row('Comm: pane render script, median', (b, u) => range(per(C(b, u), (s) => median(s.isoPane))));
row('Comm burst (50 in 1 s): frames median / p95 / max', (b, u) => `${range(per(C(b, u), (s) => median(s.burstFrames)))} / ${range(per(C(b, u), (s) => pct(s.burstFrames, 95)))} / ${range(per(C(b, u), (s) => max(s.burstFrames)), f1)}`);
row('Comm burst: long frames (LoAF > 50 ms or rAF gap > 50 ms)', (b, u) => range(per(C(b, u), (s) => s.burstLong), (n) => String(n)));
row('Comm burst: main-thread per message (Chromium trace)', (b, u) => range(per(C(b, u), (s) => s.perMsg ?? NaN)));
row('Statistics: longest frame after a kill, median / max', (b, u) => `${range(per(S(b, u), (s) => median(s.killMax)))} / ${range(per(S(b, u), (s) => max(s.killMax)), f1)}`);
row('Statistics: rAF callback time per kill window, median', (b, u) => range(per(S(b, u), (s) => median(s.killCb))));
row('Statistics: main-thread per kill (Chromium trace)', (b, u) => range(per(S(b, u), (s) => s.perKill ?? NaN)));
row(`Statistics tick (${TICK_S} s idle): worst frame per second, median`, (b, u) => range(per(S(b, u), (s) => median(s.tickWorst))));
row('Statistics tick: animation frames with callbacks per second', (b, u) => range(per(S(b, u), (s) => s.tickFps), f1));
row('Statistics tick: main-thread per second (Chromium trace)', (b, u) => range(per(S(b, u), (s) => s.perSecond ?? NaN)));
lines.push('');
if ([...stats.values()].flat().some((s) => !s.started)) lines.push('Warning: in some runs the run did not start (no Statistics data).');
mkdirSync(new URL('./results/', import.meta.url).pathname, { recursive: true });
writeFileSync(OUT, lines.join('\n') + '\n');
console.log(lines.join('\n'));
