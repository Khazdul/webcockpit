// Frame-stepped capture (ADR 0133 addendum, 2026-11-22): the page's time
// stands still between frames and moves by exactly 1/60 s per frame, so the
// film has one new picture per frame at the page's real pace, however long
// the machine takes for each.
//
// Why not the screencast (screencast.ts): its frame sampler follows the
// content with the most changed pixels (the sky's canvas at 30 or 12 fps)
// and drops the balloons' 60 fps frames, and its timestamps are arrival
// times, whose jitter turns into doubled and dropped frames at 60 fps.
//
// How, without a change in src/:
//
//   - an init script in the page, and the same script put first in the map's
//     and the weather's workers (their script is routed), own performance.now,
//     Date, setTimeout, setInterval and requestAnimationFrame. Until `freeze`
//     they pass through: setup runs in real time.
//   - after `freeze` a step runs the timers at their own due times, then the
//     animation frame with the frame's time, then moves every CSS and Web
//     animation on by the same 1/60 s (their playback rate is 0 between the
//     steps). The workers step with the page and answer once their canvases
//     are committed; then the frame is taken (Page.captureScreenshot, PNG).
//     A worker born after the freeze (the map switched on on camera) says
//     hello and is stepped from the next frame on, frozen at its first.
//   - the clock is the only driver: a scene says `until(t)` and does its
//     typing, pointer moves and server sends between frames, so a take is
//     the same whatever the machine's load.
//
// Scenes on this clock must not wait with Playwright's waitForFunction (it
// polls in the page's animation frames, which only come with a step) or
// with real sleeps that are meant to be film time.
import { type ChildProcess, spawn } from 'node:child_process';
import type { CDPSession, Page } from '@playwright/test';
import { FPS } from './encode.ts';

const FRAME_MS = 1000 / FPS;
const WORKER_SCRIPT = /\/(weather|map)\.worker\.ts\?/;
const SHIM_URL = '/__film/frame-clock.js';
const SCENE_URL = '/__film/worker-scene.js';

/** The browser's side (serialized: no references to this module). */
function clockShim(): void {
  type Fn = (...a: unknown[]) => void;
  interface Timer {
    due: number;
    every: number | null;
    fn: Fn;
    args: unknown[];
    native?: number;
  }
  const g = globalThis as unknown as Record<string, unknown> & typeof globalThis;
  if (g.__frames) return;
  const inWorker = typeof document === 'undefined';
  const perf = performance;
  const origin = perf.timeOrigin;
  const realNow = perf.now.bind(perf);
  const RealDate = Date;
  const realDateNow = Date.now.bind(Date);
  const nativeSet = g.setTimeout.bind(g) as unknown as (fn: () => void, ms: number) => number;
  const nativeClear = g.clearTimeout.bind(g) as unknown as (id?: number) => void;
  const nativeRaf = g.requestAnimationFrame.bind(g);

  let manual = false;
  let v = 0;
  let dateOff = 0;
  // Work sliced by the clock (`while (performance.now() < until)`, the sky's and the fog's textures) must
  // end: each reading inside one callback is a hair later (0.005 ms), never a frame's worth.
  let reads = 0;
  const now = (): number => (manual ? v + ++reads * 0.005 : realNow());
  perf.now = now;

  const dateNow = (): number => (manual ? Math.floor(origin + v + dateOff) : realDateNow());
  const ShimDate = function (this: unknown, ...a: unknown[]) {
    if (!new.target) return new RealDate(dateNow()).toString();
    return a.length === 0 ? new RealDate(dateNow()) : new (RealDate as unknown as new (...b: unknown[]) => Date)(...a);
  } as unknown as DateConstructor;
  Object.setPrototypeOf(ShimDate, RealDate);
  Object.defineProperty(ShimDate, 'prototype', { value: RealDate.prototype });
  ShimDate.now = dateNow;
  g.Date = ShimDate;

  // ---- timers
  const timers = new Map<number, Timer>();
  let nextId = 1;
  const arm = (id: number, t: Timer): void => {
    // frozen: only what is already due runs by itself (a 0 ms hand-over, no time passes)
    if (manual && t.due > v) return;
    t.native = nativeSet(() => fire(id), manual ? 0 : Math.max(0, t.due - now()));
  };
  const fire = (id: number): void => {
    const t = timers.get(id);
    if (!t || (manual && t.due > v)) return;
    nativeClear(t.native);
    if (t.every === null) timers.delete(id);
    else {
      t.due = Math.max(t.due + t.every, manual ? t.due + 1 : realNow());
      arm(id, t);
    }
    reads = 0;
    t.fn(...t.args);
  };
  const add = (fn: unknown, ms: unknown, repeat: boolean, args: unknown[]): number => {
    const wait = Math.max(0, Number(ms) || 0);
    const id = nextId++;
    const t: Timer = { due: (manual ? v : realNow()) + wait, every: repeat ? Math.max(1, wait) : null, fn: fn as Fn, args };
    timers.set(id, t);
    arm(id, t);
    return id;
  };
  const clear = (id?: number): void => {
    if (id === undefined) return;
    const t = timers.get(id);
    if (t) nativeClear(t.native);
    timers.delete(id);
  };
  Object.assign(g, {
    setTimeout: (fn: unknown, ms?: unknown, ...a: unknown[]) => add(fn, ms, false, a),
    setInterval: (fn: unknown, ms?: unknown, ...a: unknown[]) => add(fn, ms, true, a),
    clearTimeout: clear,
    clearInterval: clear,
  });

  // ---- animation frames
  let rafId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  Object.assign(g, {
    requestAnimationFrame: (fn: FrameRequestCallback): number => {
      const id = ++rafId;
      frames.set(id, fn);
      if (!manual)
        nativeRaf((t) => {
          if (manual || !frames.delete(id)) return;
          fn(t);
        });
      return id;
    },
    cancelAnimationFrame: (id: number): void => void frames.delete(id),
  });
  const report = (e: unknown): void => console.error(e);
  const runTo = async (to: number): Promise<void> => {
    for (let n = 0; n < 5000; n++) {
      let id = -1;
      let due = Infinity;
      for (const [k, t] of timers)
        if (t.due <= to && t.due < due) {
          id = k;
          due = t.due;
        }
      if (id < 0) break;
      v = Math.max(v, due);
      try {
        fire(id);
      } catch (e) {
        report(e);
      }
      await null; // its microtasks, as between two tasks
    }
    v = to;
    const run = [...frames];
    for (const [id, fn] of run) {
      if (!frames.delete(id)) continue; // cancelled by a callback before it
      reads = 0;
      try {
        fn(to);
      } catch (e) {
        report(e);
      }
    }
    await null;
    reads = 0;
  };
  const freezeAt = (abs: number): void => {
    v = abs - origin;
    dateOff = realDateNow() - abs;
    manual = true;
  };
  const painted = (): Promise<void> => new Promise((r) => nativeRaf(() => r()));
  const bus = new BroadcastChannel('wc-film-frames');

  if (inWorker) {
    const me = `${g.name}-${realNow()}-${Math.random()}`;
    bus.onmessage = async (e: MessageEvent<{ k: string; abs: number; seq: number }>) => {
      const { k, abs, seq } = e.data;
      if (k === 'freeze') freezeAt(abs);
      else if (k === 'step') {
        // born after the freeze (a pane switched on on camera): it joins the clock at its first step
        if (!manual) freezeAt(abs - 1000 / 60);
        await runTo(abs - origin);
        await painted(); // an OffscreenCanvas commits with the worker's own frame
      } else if (k !== 'who') return;
      bus.postMessage({ k: 'done', seq, from: me });
    };
    g.__frames = {};
    // the page counts it from its next step when it comes after the freeze
    bus.postMessage({ k: 'hello', from: me });
    return;
  }

  // ---- the page: animations, and the workers' lead
  const rates = new WeakMap<Animation, number>();
  const hold = (a: Animation, fresh: boolean): void => {
    rates.set(a, a.playbackRate);
    const t = fresh ? 0 : Number(a.currentTime ?? 0);
    a.playbackRate = 0;
    a.currentTime = t;
  };
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (...args: Parameters<Element['animate']>): Animation {
    const a = animate.apply(this, args);
    if (manual) hold(a, true);
    return a;
  };
  const moveAnimations = (dt: number): void => {
    for (const a of document.getAnimations()) {
      if (a.playState !== 'running') continue;
      const rate = rates.get(a);
      if (rate === undefined) {
        hold(a, true); // born in this frame: it starts at 0
        continue;
      }
      if (a.playbackRate !== 0) hold(a, false); // played again
      const t = Number(a.currentTime ?? 0) + dt * (rates.get(a) ?? 1);
      const end = Number(a.effect?.getComputedTiming().endTime ?? Infinity);
      if (t >= end) {
        a.playbackRate = rate || 1; // finishes: its events, promise and fill as in real time
        a.currentTime = end;
      } else a.currentTime = t;
    }
  };

  let seq = 0;
  let waiting: ((from: string) => void) | null = null;
  let workers = new Set<string>();
  bus.onmessage = (e: MessageEvent<{ k: string; seq: number; from: string }>) => {
    if (e.data.k === 'done' && e.data.seq === seq) waiting?.(e.data.from);
    // a worker born after the freeze: waited for from the next step on
    else if (e.data.k === 'hello' && manual) workers.add(e.data.from);
  };
  const tell = (k: string, abs: number): Promise<Set<string>> =>
    new Promise((resolve, reject) => {
      const got = new Set<string>();
      seq++;
      const late = nativeSet(
        () => {
          waiting = null;
          if (k === 'who') resolve(got);
          else reject(new Error(`frame clock: ${got.size} of ${workers.size} workers answered`));
        },
        // a worker born after the freeze may be busy for a while (the map reading its file)
        k === 'who' ? 400 : 60_000,
      );
      waiting = (from) => {
        got.add(from);
        if (k === 'who' || got.size < workers.size) return;
        nativeClear(late);
        waiting = null;
        resolve(got);
      };
      bus.postMessage({ k, abs, seq });
    });

  g.__frames = {
    /** Time stands still from here; returns its epoch ms and how many workers follow. */
    async freeze() {
      workers = await tell('who', 0);
      const abs = origin + realNow();
      for (const a of document.getAnimations()) hold(a, false);
      freezeAt(abs);
      if (workers.size) await tell('freeze', abs);
      return { abs, workers: workers.size };
    },
    /** One frame: everything up to `abs`, committed. */
    async step(abs: number) {
      const to = abs - origin;
      const dt = to - v;
      await runTo(to);
      moveAnimations(dt);
      if (workers.size) await tell('step', abs);
      await painted();
    },
  };
}

interface FramesWindow {
  __frames: { freeze(): Promise<{ abs: number; workers: number }>; step(abs: number): Promise<void> };
}

/** How a stepped take's frame lies in the recording's. */
export interface SteppedOutput {
  file: string;
  width: number;
  height: number;
  /** The page's left edge in the recording, px (the rest is black). */
  x: number;
}

export class FrameClock {
  /** Frames since `freeze`. */
  private n = 0;
  private start = 0;
  private sink: { proc: ChildProcess; done: Promise<void> } | null = null;
  private due: { at: number; run: () => Promise<void> | void }[] = [];
  private readonly page: Page;
  private cdp: CDPSession | null = null;
  /** The first recorded frame's time, epoch ms. */
  t0 = 0;
  /** Frames recorded. */
  recorded = 0;
  /** Called for every recorded frame, after it is taken. */
  onFrame: ((index: number) => Promise<void>) | null = null;

  private constructor(page: Page) {
    this.page = page;
  }

  /** Before the page's first navigation. `workerScript`: the scene's own, run in those workers before their code. */
  static async install(page: Page, workerScript = ''): Promise<FrameClock> {
    const body = `(${clockShim.toString()})();`;
    await page.context().addInitScript(`${body}`);
    await page.route(`**${SHIM_URL}`, (r) => r.fulfill({ body, contentType: 'text/javascript' }));
    await page.route(`**${SCENE_URL}`, (r) => r.fulfill({ body: workerScript, contentType: 'text/javascript' }));
    await page.route(WORKER_SCRIPT, async (r) => {
      const response = await r.fetch();
      await r.fulfill({ response, body: `import '${SHIM_URL}';import '${SCENE_URL}';${await response.text()}` });
    });
    return new FrameClock(page);
  }

  /** Time stands still from here on; `workers`: how many must follow. */
  async freeze(workers: number): Promise<void> {
    const r = await this.page.evaluate(() => (window as unknown as FramesWindow).__frames.freeze());
    if (r.workers !== workers) throw new Error(`frame clock: ${r.workers} workers follow, ${workers} expected`);
    this.start = r.abs;
    this.n = 0;
    this.cdp = await this.page.context().newCDPSession(this.page);
  }

  /** Film time now, epoch ms (the page's). */
  now = (): number => this.start + this.n * FRAME_MS;

  /** `run` before the frame at `at` (epoch ms), whatever the scene is doing then. */
  schedule(at: number, run: () => Promise<void> | void): void {
    this.due.push({ at, run });
    this.due.sort((a, b) => a.at - b.at);
  }

  /** Records from the next frame into `out` (lossless RGB, as encode.ts). */
  async record(out: SteppedOutput): Promise<void> {
    const proc = spawn(
      'ffmpeg',
      [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(FPS), '-i', '-',
        '-vf', `format=bgr0,crop=w='min(iw,${out.width - out.x})':h='min(ih,${out.height})':x=0:y=0,pad=width=${out.width}:height=${out.height}:x=${out.x}:y=0:color=black`,
        '-c:v', 'libx264rgb', '-qp', '0', '-preset', 'faster',
        '-g', '30', '-keyint_min', '30', '-sc_threshold', '0',
        '-color_primaries', 'bt709', '-color_trc', 'iec61966-2-1',
        '-movflags', '+faststart',
        out.file,
      ],
      { stdio: ['pipe', 'ignore', 'inherit'] },
    );
    const done = new Promise<void>((resolve, reject) => {
      proc.on('error', reject);
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
    });
    this.sink = { proc, done };
    this.recorded = 0;
    this.t0 = this.now() + FRAME_MS;
  }

  /** Ends the recording; returns its frame count. */
  async finish(): Promise<number> {
    if (this.sink) {
      this.sink.proc.stdin!.end();
      await this.sink.done;
      this.sink = null;
    }
    return this.recorded;
  }

  /** The next frame. */
  frame = async (): Promise<void> => {
    this.n++;
    const t = this.now();
    while (this.due.length && this.due[0]!.at <= t) await this.due.shift()!.run();
    await this.page.evaluate((abs) => (window as unknown as FramesWindow).__frames.step(abs), t);
    if (!this.sink) return;
    const shot = await this.cdp!.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, captureBeyondViewport: false });
    const stdin = this.sink.proc.stdin!;
    if (!stdin.write(Buffer.from(shot.data, 'base64'))) await new Promise<void>((r) => stdin.once('drain', () => r()));
    this.recorded++;
    await this.onFrame?.(this.recorded - 1);
  };

  /** Frames up to `at` (epoch ms): the first frame at or after it is the last. */
  until = async (at: number): Promise<void> => {
    while (this.now() < at - 0.01) await this.frame();
  };

  sleep = (ms: number): Promise<void> => this.until(this.now() + ms);
}
