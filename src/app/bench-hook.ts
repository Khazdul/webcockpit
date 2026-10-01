// Benchmark probe (`?bench`), loaded with a dynamic import only when the
// URL asks for it, so it is a separate chunk that normal pages never fetch.
// It exposes `window.__wcBench` for bench/browser-bench.ts (spec §1.3).
//
// - `requestFrame` wraps the output pane's frame scheduler: every flush is
//   timed (script time), and a MessageChannel message posted from inside the
//   frame callback runs after that frame's style/layout/paint, which gives a
//   "painted" timestamp.
// - A fake socket (`connectFake`) stands in for MUME: `inject` feeds bytes
//   exactly like a WebSocket frame would, and `send` records its call time
//   for the key → send measurement.
// - Map (stage 9): `mapOn` turns the Map pane on; `startFeed` delivers a
//   GMCP-only log (Room.Info, Event.Moved, Group.*) through the fake socket
//   on a timer, looping, while the other measures run.
// - Owner-geometry benchmarks (stage 8, report #15). Opt-in by URL, so the
//   default probe adds nothing to the measured paths:
//   - `?bench&benchSettings=<json>`: a settings patch applied before the
//     shell is built (e.g. the Map pane explicitly off or on).
//   - `?bench&benchFrames`: wraps requestAnimationFrame and every side
//     pane's render(), so each animation frame that runs callbacks is
//     logged with its callback time, its time to "rendered", and whether
//     it carried an output flush and/or pane renders (`animFrames`).
//   - `?bench&benchCounters`: counts live timeouts, intervals and
//     listeners on window / document (`counters()`), for the soak.
//   - `connectWs(url)`: the session on a real WebSocket (the app's
//     WebSocketTransport), timing every message task (`wsTasks`).

import { Bus } from '../core/bus';
import type { Line, Socketish } from '../core/types';
import { PANE_IDS } from '../layout/types';
import { logToFrames } from '../net/replay-socket';
import { WebSocketTransport } from '../net/ws-transport';
import { ScriptEngine } from '../script/engine';
import { LineAssembler } from '../text/assembler';
import type { SettingsStore } from '../settings/store';
import type { App } from './app';

export interface FlushRecord {
  /** performance.now() when the frame callback started. */
  start: number;
  /** Script time of the flush, ms. */
  script: number;
  /** Time from frame callback start until after the frame was rendered, ms. */
  frame: number;
}

class BenchSocket implements Socketish {
  onOpen: (() => void) | null = null;
  onData: ((bytes: Uint8Array) => void) | null = null;
  onClose: ((reason: string) => void) | null = null;
  readonly forceUtf8 = true as const;
  lastSendAt = 0;
  sends = 0;
  connect(): void {}
  send(_bytes: Uint8Array): void {
    if (this.lastSendAt === 0) this.lastSendAt = performance.now();
    this.sends++;
  }
  close(): void {
    this.onClose?.('closed by client');
  }
}

/** One animation frame that ran callbacks (`?benchFrames`). */
export interface FrameRecord {
  /** The rAF timestamp (groups the frame's callbacks). */
  t: number;
  /** performance.now() when its first callback started. */
  s: number;
  /** Script time of all its callbacks, ms. */
  cb: number;
  /** From `s` until after the frame was rendered, ms (-1 until known). */
  after: number;
  /** Output flush script time in this frame, ms (0: no flush). */
  flush: number;
  /** Side panes rendered in this frame, and their script time (ms). */
  panes: string[];
  paneMs: number;
}

/** A WebSocketTransport that times every message task and reads as UTF-8. */
class BenchWsSocket extends WebSocketTransport {
  readonly forceUtf8 = true as const;
  /** [start, duration ms, bytes] per message task. */
  readonly tasks: Array<[number, number, number]> = [];
  constructor(url: string) {
    super(url);
    let handler: ((bytes: Uint8Array) => void) | null = null;
    const tasks = this.tasks;
    Object.defineProperty(this, 'onData', {
      get: () => handler,
      set: (h: ((bytes: Uint8Array) => void) | null) => {
        handler = h
          ? (bytes) => {
              const t = performance.now();
              h(bytes);
              tasks.push([t, performance.now() - t, bytes.length]);
            }
          : null;
      },
    });
  }
  /** Sends text outside the session (e.g. an acknowledgement). */
  sendText(text: string): void {
    super.send(new TextEncoder().encode(text));
  }
}

export interface BenchCounters {
  timeouts: number;
  intervals: number;
  listeners: number;
}

export class BenchProbe {
  app: App | null = null;
  flushes: FlushRecord[] = [];
  /** Animation frames (`?benchFrames`), logged while `animLogOn`. */
  animFrames: FrameRecord[] = [];
  animLogOn = false;
  private frameLog = false;
  private curFrame: FrameRecord | null = null;
  private live: BenchCounters | null = null;
  private sock: BenchSocket | null = null;
  private ws: BenchWsSocket | null = null;
  private playEvents: Array<{ at: number; bytes?: Uint8Array; sent?: string }> = [];
  private playPos = 0;
  private playEnd: (() => void) | null = null;
  private waiters: Array<(r: FlushRecord) => void> = [];
  private readonly channel = new MessageChannel();
  private postQueue: Array<() => void> = [];
  private frames: Uint8Array[] = [];
  private feedFrames: Uint8Array[] = [];
  private feedTimer = 0;
  /** Frames delivered by the running feed. */
  fed = 0;

  constructor(readonly settings: SettingsStore | null = null) {
    this.channel.port1.onmessage = () => {
      const q = this.postQueue;
      this.postQueue = [];
      for (const f of q) f();
    };
  }

  /**
   * `?benchFrames`: wraps requestAnimationFrame so every frame that runs
   * callbacks is logged (FrameRecord). Runs before the app is built.
   */
  logFrames(): void {
    if (this.frameLog) return;
    this.frameLog = true;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb: FrameRequestCallback): number =>
      raf((ts) => {
        const t0 = performance.now();
        let f = this.curFrame;
        if (!f || f.t !== ts) {
          const rec: FrameRecord = { t: ts, s: t0, cb: 0, after: -1, flush: 0, panes: [], paneMs: 0 };
          f = this.curFrame = rec;
          if (this.animLogOn) {
            this.animFrames.push(rec);
            this.afterPaint(() => (rec.after = performance.now() - rec.s));
          }
        }
        try {
          cb(ts);
        } finally {
          f.cb += performance.now() - t0;
        }
      });
  }

  /** Wraps every side pane's render() so it is logged in its frame. */
  private trackPanes(app: App): void {
    for (const id of PANE_IDS) {
      const pane = app.cockpit.pane(id) as unknown as { render: () => void };
      const orig = pane.render;
      pane.render = () => {
        const t0 = performance.now();
        try {
          orig.call(pane);
        } finally {
          const f = this.curFrame;
          if (f) {
            f.panes.push(id);
            f.paneMs += performance.now() - t0;
          }
        }
      };
    }
  }

  /** Frame scheduler for the output pane. */
  readonly requestFrame = (cb: () => void): void => {
    requestAnimationFrame(() => {
      const start = performance.now();
      cb();
      const script = performance.now() - start;
      const rec: FlushRecord = { start, script, frame: script };
      if (this.curFrame) this.curFrame.flush += script;
      this.flushes.push(rec);
      const waiters = this.waiters;
      this.waiters = [];
      this.afterPaint(() => {
        rec.frame = performance.now() - start;
        for (const w of waiters) w(rec);
      });
    });
  };

  private afterPaint(fn: () => void): void {
    this.postQueue.push(fn);
    if (this.postQueue.length === 1) this.channel.port2.postMessage(null);
  }

  attach(app: App): void {
    this.app = app;
    if (this.frameLog) this.trackPanes(app);
  }

  /** Delivers bytes as the current socket's data, without waiting for a flush. */
  deliver(bytes: Uint8Array): void {
    (this.ws ?? this.sock)?.onData?.(bytes);
  }

  /** Delivers frame `i` of `loadFrames` without waiting; returns its synchronous time (ms). */
  deliverFrame(i: number): number {
    const t0 = performance.now();
    this.deliver(this.frames[i]!);
    return performance.now() - t0;
  }

  /**
   * Splits a log for `play`: telnet frames at log time (speed 1, gaps
   * capped as ReplaySocket does) and its recorded commands, which `play`
   * types. Returns the number of entries and the log time (ms).
   */
  loadPlay(logText: string): { entries: number; logMs: number } {
    this.playEvents = [];
    for (const f of logToFrames(logText, { speed: 1, sends: true })) {
      if (f.sent !== undefined) this.playEvents.push({ at: f.atMs, sent: f.sent });
      else if (f.bytes.length) this.playEvents.push({ at: f.atMs, bytes: f.bytes });
    }
    this.playPos = 0;
    return { entries: this.playEvents.length, logMs: this.playEvents.at(-1)?.at ?? 0 };
  }

  /**
   * Plays the loaded log on from where it stopped at `speed`× log time
   * through the fake socket, typing its commands (keyToSend), for at most
   * `maxMs` of wall time. Delivers for at most 8 ms per task. Resolves with
   * the entries delivered, the wall time and whether the log ended.
   */
  play(speed: number, maxMs = Infinity): Promise<{ delivered: number; ms: number; done: boolean; keys: number[] }> {
    const evs = this.playEvents;
    const from = this.playPos;
    const base = from < evs.length ? evs[from]!.at : 0;
    const t0 = performance.now();
    const keys: number[] = [];
    return new Promise((resolve) => {
      let timer = 0;
      const finish = (): void => {
        window.clearTimeout(timer);
        this.playEnd = null;
        resolve({ delivered: this.playPos - from, ms: performance.now() - t0, done: this.playPos >= evs.length, keys });
      };
      this.playEnd = finish;
      const step = (): void => {
        const now = performance.now() - t0;
        const stop = performance.now() + 8;
        let i = this.playPos;
        while (i < evs.length && (evs[i]!.at - base) / speed <= now && performance.now() < stop) {
          const e = evs[i++]!;
          if (e.sent !== undefined) keys.push(this.keyToSend(e.sent));
          else this.deliver(e.bytes!);
        }
        this.playPos = i;
        if (i >= evs.length || now >= maxMs) return finish();
        const due = (evs[i]!.at - base) / speed - (performance.now() - t0);
        timer = window.setTimeout(step, Math.max(0, Math.min(due, maxMs - now)));
      };
      step();
    });
  }

  /** Ends a running `play` now (it resolves). */
  stopPlay(): void {
    this.playEnd?.();
  }

  /** Resolves with the next output flush, after its frame was rendered. */
  waitFlush(): Promise<FlushRecord> {
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  /** Connects the session to a real WebSocket at `url` (WebSocketTransport, UTF-8). */
  connectWs(url: string): void {
    const ws = new BenchWsSocket(url);
    this.ws = ws;
    this.sock = null;
    this.app!.session.connect(ws);
  }

  /** The WebSocket's message tasks since connectWs: [start, ms, bytes]. */
  get wsTasks(): Array<[number, number, number]> {
    return this.ws?.tasks ?? [];
  }

  /** Sends text on the WebSocket outside the session (acknowledgements). */
  wsSendText(text: string): void {
    this.ws?.sendText(text);
  }

  /** The output queue is empty and no flush is pending. */
  get idle(): boolean {
    const out = this.app!.output as unknown as { queue: unknown[]; head: number; frameScheduled: boolean };
    return out.queue.length === out.head && !out.frameScheduled;
  }

  /** Live timers and window/document listeners (`?benchCounters`), else null. */
  counters(): BenchCounters | null {
    return this.live ? { ...this.live } : null;
  }

  /**
   * `?benchCounters`: counts live timeouts, intervals and listeners on the
   * long-lived targets (window, document, <html>, <body>) from now on.
   * Runs before the app is built.
   */
  countLive(): void {
    if (this.live) return;
    const c: BenchCounters = { timeouts: 0, intervals: 0, listeners: 0 };
    this.live = c;
    const timeouts = new Set<number>();
    const intervals = new Set<number>();
    const st = window.setTimeout.bind(window);
    const ct = window.clearTimeout.bind(window);
    const si = window.setInterval.bind(window);
    const ci = window.clearInterval.bind(window);
    const w = window as unknown as Record<string, unknown>;
    w.setTimeout = (fn: TimerHandler, ms?: number, ...a: unknown[]): number => {
      const run =
        typeof fn === 'function'
          ? (...x: unknown[]) => {
              timeouts.delete(id);
              c.timeouts = timeouts.size;
              (fn as (...y: unknown[]) => void)(...x);
            }
          : fn;
      const id: number = st(run, ms, ...a);
      timeouts.add(id);
      c.timeouts = timeouts.size;
      return id;
    };
    w.clearTimeout = (id?: number): void => {
      if (id !== undefined) timeouts.delete(id);
      c.timeouts = timeouts.size;
      ct(id);
    };
    w.setInterval = (fn: TimerHandler, ms?: number, ...a: unknown[]): number => {
      const id = si(fn, ms, ...a);
      intervals.add(id);
      c.intervals = intervals.size;
      return id;
    };
    w.clearInterval = (id?: number): void => {
      if (id !== undefined) intervals.delete(id);
      c.intervals = intervals.size;
      ci(id);
    };
    const keys = new Map<EventTarget, Set<string>>();
    const ids = new WeakMap<object, number>();
    let next = 1;
    const keyOf = (type: string, l: unknown, opts: unknown): string => {
      const capture = typeof opts === 'boolean' ? opts : !!(opts as { capture?: boolean } | undefined)?.capture;
      let id = 0;
      if (l && (typeof l === 'object' || typeof l === 'function')) {
        id = ids.get(l) ?? 0;
        if (!id) ids.set(l, (id = next++));
      }
      return `${type}|${id}|${capture}`;
    };
    const watched = (t: EventTarget): boolean =>
      t === window || t === document || t === document.documentElement || t === document.body;
    const count = (): void => {
      let n = 0;
      for (const s of keys.values()) n += s.size;
      c.listeners = n;
    };
    const proto = EventTarget.prototype;
    const add = proto.addEventListener;
    const remove = proto.removeEventListener;
    proto.addEventListener = function (this: EventTarget, type: string, l: EventListenerOrEventListenerObject | null, opts?: boolean | AddEventListenerOptions): void {
      if (watched(this)) {
        let s = keys.get(this);
        if (!s) keys.set(this, (s = new Set()));
        s.add(keyOf(type, l, opts));
        count();
      }
      add.call(this, type, l, opts);
    };
    proto.removeEventListener = function (this: EventTarget, type: string, l: EventListenerOrEventListenerObject | null, opts?: boolean | EventListenerOptions): void {
      if (watched(this)) {
        keys.get(this)?.delete(keyOf(type, l, opts));
        count();
      }
      remove.call(this, type, l, opts);
    };
  }

  /** Connects the session to a fake socket that is open at once. */
  connectFake(): void {
    const app = this.app!;
    const sock = new BenchSocket();
    this.sock = sock;
    app.session.connect(sock);
    sock.onOpen?.();
  }

  /** Splits a log into telnet frames (as ReplaySocket would at `speed`). */
  loadFrames(logText: string, speed = 1, max = Infinity): number {
    this.frames = [];
    for (const f of logToFrames(logText, { speed })) {
      this.frames.push(f.bytes);
      if (this.frames.length >= max) break;
    }
    return this.frames.length;
  }

  /**
   * Delivers frame `i` (or raw bytes/text) through the fake socket. Resolves
   * with the latency from delivery to the end of the flush that rendered it
   * and to after that frame was painted.
   */
  inject(what: number | string): Promise<{ toFlush: number; toPaint: number; script: number }> {
    const bytes =
      typeof what === 'number' ? this.frames[what]! : new TextEncoder().encode(what);
    return new Promise((resolve) => {
      let t0 = 0;
      this.waiters.push((rec) => {
        resolve({
          toFlush: rec.start + rec.script - t0,
          toPaint: rec.start + rec.frame - t0,
          script: rec.script,
        });
      });
      t0 = performance.now();
      this.sock!.onData?.(bytes);
    });
  }

  /** Turns the Map pane on (Settings → panes.map.on). */
  mapOn(): void {
    this.settings!.update({ panes: { map: { on: true } } });
  }

  /** Splits a log into frames for `startFeed` (all its timestamps as one frame each). */
  loadFeed(logText: string): number {
    this.feedFrames = [...logToFrames(logText, { speed: 1 })].map((f) => f.bytes);
    return this.feedFrames.length;
  }

  /** Delivers the next feed frame every `ms` through the fake socket, looping. */
  startFeed(ms: number): void {
    this.stopFeed();
    let i = 0;
    this.feedTimer = window.setInterval(() => {
      if (!this.sock || this.feedFrames.length === 0) return;
      this.sock.onData?.(this.feedFrames[i++ % this.feedFrames.length]!);
      this.fed++;
    }, ms);
  }

  stopFeed(): number {
    window.clearInterval(this.feedTimer);
    this.feedTimer = 0;
    return this.fed;
  }

  /** Enter in the input with `text`; returns ms from keydown dispatch to socket send. */
  keyToSend(text: string): number {
    const app = this.app!;
    const sock = this.sock!;
    const field = app.input.input;
    field.focus();
    field.value = text;
    field.setSelectionRange(text.length, text.length);
    sock.lastSendAt = 0;
    const ev = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
    const t0 = performance.now();
    field.dispatchEvent(ev);
    const sentAt = sock.lastSendAt;
    return sentAt === 0 ? -1 : sentAt - t0;
  }

  /** Loads a profile into the app's script engine (App.applyProfile). */
  applyProfile(text: string): boolean {
    return this.app!.applyProfile(text).ok;
  }

  /** Keydown `code` on the input (a macro key); returns ms from dispatch to socket send. */
  macroToSend(code: string, key: string): number {
    const app = this.app!;
    const sock = this.sock!;
    const field = app.input.input;
    field.focus();
    sock.lastSendAt = 0;
    const ev = new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true });
    const t0 = performance.now();
    field.dispatchEvent(ev);
    const sentAt = sock.lastSendAt;
    return sentAt === 0 ? -1 : sentAt - t0;
  }

  /**
   * The 500-rule budget (spec §1.3): the log's lines (assembled once) go
   * through a separate ScriptEngine's display pipeline with no rules and
   * with `profile`. Returns µs per line (median of 5 runs after a warm-up).
   */
  ruleBench(logText: string, profile: string): { lines: number; baseUs: number; rulesUs: number; shown: number } {
    const lines: Line[] = [];
    const bus = new Bus();
    bus.on('text.line', (l) => lines.push(l));
    const asm = new LineAssembler(bus);
    for (const raw of logText.split('\n')) {
      const sp = raw.indexOf(' ');
      if (sp < 0) continue;
      const rest = raw.slice(sp + 1);
      if (rest.startsWith('> ') || rest === '>') continue;
      asm.text(rest + '\r\n', 0);
    }
    const run = (text: string | null): { us: number; shown: number } => {
      const b = new Bus();
      let shown = 0;
      b.on('text.display', () => shown++);
      const e = new ScriptEngine({ send: () => {}, message: () => {} });
      e.attach(b);
      if (text !== null && !e.loadProfile(text).ok) throw new Error('bench profile did not load');
      const once = (): number => {
        const t0 = performance.now();
        for (let i = 0; i < lines.length; i++) e.processLine(lines[i]!);
        return performance.now() - t0;
      };
      once();
      const times: number[] = [];
      for (let i = 0; i < 5; i++) times.push(once());
      times.sort((a, x) => a - x);
      e.dispose();
      return { us: (times[2]! / lines.length) * 1000, shown: shown / 6 };
    };
    const base = run(null);
    const rules = run(profile);
    return { lines: lines.length, baseUs: base.us, rulesUs: rules.us, shown: rules.shown };
  }

  /** Starts a replay at `speed`; resolves when it finished and the output drained. */
  replay(logText: string, speed: number): Promise<{ ms: number; lines: number }> {
    const app = this.app!;
    let lines = 0;
    const offLine = app.bus.on('text.line', () => lines++);
    return new Promise((resolve) => {
      const t0 = performance.now();
      const off = app.bus.on('conn.state', (s) => {
        if (s.state !== 'disconnected') return;
        off();
        offLine();
        void this.drained().then(() => resolve({ ms: performance.now() - t0, lines }));
      });
      app.startReplay(logText, 'bench', speed);
    });
  }

  /** Resolves after two animation frames pass without a flush. */
  drained(): Promise<void> {
    return new Promise((resolve) => {
      let quiet = 0;
      let seen = this.flushes.length;
      const tick = (): void => {
        if (this.flushes.length === seen) quiet++;
        else {
          quiet = 0;
          seen = this.flushes.length;
        }
        if (quiet >= 2) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  /** Number of rows in the output scrollback. */
  get rows(): number {
    return this.app!.output.rows;
  }
}

declare global {
  interface Window {
    __wcBench?: BenchProbe;
  }
}

/**
 * Installs the probe as `window.__wcBench`. Runs after the settings loaded
 * and before the shell is built; the opt-in URL parameters (see the
 * header) take effect here.
 */
export function installBenchProbe(settings: SettingsStore | null = null): BenchProbe {
  const p = new BenchProbe(settings);
  window.__wcBench = p;
  const params = new URLSearchParams(location.search);
  const patch = params.get('benchSettings');
  if (patch && settings) settings.update(JSON.parse(patch) as Parameters<SettingsStore['update']>[0]);
  if (params.has('benchFrames')) p.logFrames();
  if (params.has('benchCounters')) p.countLive();
  return p;
}
