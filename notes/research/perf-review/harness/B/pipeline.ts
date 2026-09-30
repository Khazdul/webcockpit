// Area B perf harness: the ingest pipeline built from the real src/ modules,
// wired in the same order as App (src/app/app.ts), without a browser. Only
// the OutputPane needs a DOM for its constructor (happy-dom); its flush is
// never run here (rendering is area A), so only the enqueue side is timed.
//
// Built with Vite in SSR mode (perf/run-node.sh), because Node's type
// stripping cannot load src/capture/store.ts (a constructor parameter
// property) and `?raw` imports.

import { Window } from 'happy-dom';
import { Bus } from '../src/core/bus';
import type { Line } from '../src/core/types';
import { LineAssembler } from '../src/text/assembler';
import { Session } from '../src/net/session';
import { FrameBuilder, logToFrames } from '../src/net/replay-socket';
import { ScriptEngine } from '../src/script/engine';
import { FakeScheduler } from '../src/script/engine/timers';
import { GameState } from '../src/gmcp/state';
import { RunEventDeriver } from '../src/runs/events';
import { Recorder, type LockManagerLike } from '../src/capture/recorder';
import { OutputPane } from '../src/ui/output-pane';
import { AppStatus } from '../src/app/status';
import { attachUiMessages } from '../src/app/ui-messages';
import { MapEventForwarder } from '../src/map/client';
import KHAZDUL from '../src/profiles/khazdul.tin?raw';

export { KHAZDUL, logToFrames };

/** Which parts of the pipeline are on (cumulative in CONFIGS). */
export interface Config {
  name: string;
  /** LineAssembler (else a no-op text sink). */
  asm: boolean;
  /** ScriptEngine attached (processLine / processPartial, text.display). */
  engine: boolean;
  /** OutputPane enqueue (text.display, text.displayPartial, cmd.sent, sys.message). */
  out: boolean;
  /** GameState + TimersHub + RunEventDeriver on the bus and their system rules. */
  sys: boolean;
  /** The bundled khazdul profile loaded. */
  profile: boolean;
  /** Recorder capturing (the session reaches `playing`). */
  rec: boolean;
  /** AppStatus, UI messages, App's own gmcp handler. */
  misc: boolean;
  /** Map pane forwarder (text.line regex, gmcp, cmd.sent, conn.state). */
  map: boolean;
}

const OFF: Omit<Config, 'name'> = { asm: false, engine: false, out: false, sys: false, profile: false, rec: false, misc: false, map: false };

/** Cumulative configurations: each adds one stage to the previous one. */
export const CONFIGS: Config[] = [
  { name: 'telnet', ...OFF },
  { name: '+asm', ...OFF, asm: true },
  { name: '+engine', ...OFF, asm: true, engine: true },
  { name: '+out', ...OFF, asm: true, engine: true, out: true },
  { name: '+sys', ...OFF, asm: true, engine: true, out: true, sys: true },
  { name: '+khazdul', ...OFF, asm: true, engine: true, out: true, sys: true, profile: true },
  { name: '+rec', ...OFF, asm: true, engine: true, out: true, sys: true, profile: true, rec: true },
  { name: '+misc', ...OFF, asm: true, engine: true, out: true, sys: true, profile: true, rec: true, misc: true },
  { name: '+map', asm: true, engine: true, out: true, sys: true, profile: true, rec: true, misc: true, map: true },
];

export const FULL: Config = CONFIGS[CONFIGS.length - 1]!;

class FakeSock {
  readonly forceUtf8 = true as const;
  onOpen: (() => void) | null = null;
  onData: ((b: Uint8Array) => void) | null = null;
  onClose: ((r: string) => void) | null = null;
  sends = 0;
  connect(): void {}
  send(): void {
    this.sends++;
  }
  close(): void {}
}

/** Timers that never fire (keep-alive). */
const noTimers = { setTimeout: (): unknown => 0, clearTimeout: (): void => {}, now: (): number => performance.now() };

/** The RunStore surface the Recorder uses; keeps nothing (IndexedDB is off the per-line path). */
class MemStore {
  chunks = 0;
  chars = 0;
  async listRuns(): Promise<never[]> {
    return [];
  }
  async getRun(): Promise<undefined> {
    return undefined;
  }
  async putRun(): Promise<void> {}
  async append(_id: string, a: { chunk?: { text: string } }): Promise<void> {
    if (a.chunk) {
      this.chunks++;
      this.chars += a.chunk.text.length;
    }
  }
  async sealRun(): Promise<void> {}
  async deleteRun(): Promise<void> {}
  async latestSealedRun(): Promise<undefined> {
    return undefined;
  }
  async sealOrphan(): Promise<void> {}
}

class FakeLocks implements LockManagerLike {
  request(name: string, _o: { ifAvailable: boolean }, cb: (lock: unknown) => Promise<void> | void): Promise<unknown> {
    return Promise.resolve(cb({ name }));
  }
}

let win: Window | null = null;
function domRoot(): HTMLElement {
  win ??= new Window();
  const el = win.document.createElement('div');
  win.document.body.appendChild(el);
  return el as unknown as HTMLElement;
}

export interface Pipeline {
  cfg: Config;
  /** The text sink (the LineAssembler, or a no-op). */
  sink: { text(s: string, ts: number): void; ga(ts: number): void };
  bus: Bus;
  sock: FakeSock;
  engine: ScriptEngine | null;
  out: OutputPane | null;
  rec: Recorder | null;
  /** Delivers one WebSocket frame (the timed call). */
  feed(bytes: Uint8Array): void;
  /** What a frame flush would clear (untimed): the output queue, the recorder buffer. */
  settle(): void;
  dispose(): void;
}

/** GMCP frames that take the session to `playing` and start a run (Char.Name, StatusVars, Vitals). */
export function preamble(): Uint8Array {
  const fb = new FrameBuilder();
  fb.gmcp('Char.Name {"name":"Rasta","fullname":"Rasta Fari the Wanderer"}');
  fb.gmcp('Char.StatusVars {"name":"Rasta","level":25}');
  fb.gmcp('Char.Vitals {"hp":172,"maxhp":172,"mana":40,"maxmana":40,"mp":131,"maxmp":131,"xp":5770000,"tp":41500}');
  return fb.take();
}

/** Swappable implementations for in-process A/B runs (perf/node-ab.ts). */
export interface Variant {
  name: string;
  Assembler?: new (bus: Bus) => { text(s: string, ts: number): void; ga(ts: number): void };
  /** A Session class (perf/base/session.ts uses the committed telnet parser). */
  Session?: typeof Session;
  /** A ScriptEngine class (perf/base/engine.ts is the committed engine). */
  Engine?: typeof ScriptEngine;
  /** Patches applied to the built pipeline (e.g. a recorder or engine prototype). */
  patch?: (p: Pipeline) => void;
}

export function buildPipeline(cfg: Config, variant: Variant | null = null, profileText: string = KHAZDUL): Pipeline {
  const bus = new Bus();
  const sched = new FakeScheduler();
  // App order (src/app/app.ts): status, run events, UI messages, game
  // state, assembler, session, game.attach, recorder, panes, output,
  // input, script engine + system rules, App's gmcp handler.
  if (cfg.misc) new AppStatus(bus);
  const runs = cfg.sys ? new RunEventDeriver({ scheduler: sched }).attach(bus) : null;
  if (cfg.misc) attachUiMessages(bus);
  const game = cfg.sys ? new GameState({ timers: { scheduler: sched } }) : null;
  const Asm = variant?.Assembler ?? LineAssembler;
  const sink = cfg.asm ? new Asm(bus) : { text(): void {}, ga(): void {} };
  const sock = new FakeSock();
  const Sess = variant?.Session ?? Session;
  const session = new Sess({ bus, sink, timers: noTimers, socketFactory: () => sock });
  game?.attach(bus);
  const rec = cfg.rec
    ? new Recorder(bus, {
        ...(runs ? { events: runs } : {}),
        openStore: async () => new MemStore() as never,
        locks: new FakeLocks(),
        win: null,
        flushMs: 1e9,
      })
    : null;
  const out = cfg.out ? new OutputPane(bus, domRoot(), { requestFrame: () => {}, cellSize: () => ({ w: 9, h: 18 }) }) : null;
  let engine: ScriptEngine | null = null;
  if (cfg.engine) {
    const Eng = variant?.Engine ?? ScriptEngine;
    engine = new Eng({ send: (t) => session.sendCommand(t), message: () => {}, scheduler: sched });
    engine.attach(bus);
    if (game && runs) {
      game.installRules(engine.system);
      game.timers.installRules(engine.system);
      runs.installRules(engine.system);
    }
    if (cfg.profile) {
      const r = engine.loadProfile(profileText);
      if (!r.ok) throw new Error(r.reason);
    }
  }
  if (cfg.misc) {
    let charName = '';
    bus.on('gmcp', (m) => {
      if (m.pkg.toLowerCase() !== 'char.name') return;
      const n = (m.data as { name?: unknown } | undefined)?.name;
      if (typeof n === 'string' && n) charName = n;
    });
    void charName;
  }
  if (cfg.map) {
    const f = new MapEventForwarder(() => {}, (cb) => queueMicrotask(cb));
    bus.on('gmcp', f.onGmcp);
    bus.on('cmd.sent', f.onCmd);
    bus.on('text.line', f.onLine);
    bus.on('conn.state', f.onConn);
  }
  session.connect();
  sock.onOpen?.();
  sock.onData?.(Uint8Array.from([255, 251, 201])); // IAC WILL GMCP
  sock.onData?.(preamble());
  const o = out as unknown as { queue: unknown[]; head: number; frameScheduled: boolean; partialDirty: boolean } | null;
  const r = rec as unknown as { run: { buf: string[] } | null } | null;
  const pipe: Pipeline = {
    cfg,
    sink,
    bus,
    sock,
    engine,
    out,
    rec,
    feed: (bytes) => sock.onData!(bytes),
    settle: () => {
      if (o) {
        o.queue.length = 0;
        o.head = 0;
        o.frameScheduled = false;
        o.partialDirty = false;
      }
      if (r?.run && r.run.buf.length > 20000) r.run.buf = [];
    },
    dispose: () => {
      engine?.dispose();
      game?.dispose();
      runs?.dispose();
      rec?.dispose();
      out?.dispose();
      session.dispose();
    },
  };
  variant?.patch?.(pipe);
  return pipe;
}

// ---------------------------------------------------------------- logs

/** Cockpit log → frames as the server would write them (replay grouping at speed 1). */
export function serverFrames(logText: string): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (const f of logToFrames(logText, { speed: 1 })) if (f.bytes.length) out.push(f.bytes);
  return out;
}

/** Re-cuts frames so none is longer than `max` bytes (a gateway forwarding TCP reads). */
export function capFrames(frames: Uint8Array[], max: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (const f of frames) {
    if (f.length <= max) out.push(f);
    else for (let i = 0; i < f.length; i += max) out.push(f.subarray(i, Math.min(f.length, i + max)));
  }
  return out;
}

/** Joins all frames and cuts the stream into `size`-byte frames (a burst read at a fixed size). */
export function streamFrames(frames: Uint8Array[], size: number): Uint8Array[] {
  let n = 0;
  for (const f of frames) n += f.length;
  const all = new Uint8Array(n);
  let o = 0;
  for (const f of frames) {
    all.set(f, o);
    o += f.length;
  }
  const out: Uint8Array[] = [];
  for (let i = 0; i < n; i += size) out.push(all.subarray(i, Math.min(n, i + size)));
  return out;
}

/** Interleaves the GMCP records of `gmcpLog` after every `every` lines of `logText` (looping). */
export function withGmcp(logText: string, gmcpLog: string, every: number): { text: string; gmcp: number } {
  const recs = gmcpLog.split('\n').filter((l) => /^\d+ \x1bGMCP /.test(l));
  const out: string[] = [];
  let k = 0;
  let n = 0;
  for (const l of logText.split('\n')) {
    out.push(l);
    if (++n % every !== 0) continue;
    const sp = l.indexOf(' ');
    if (sp <= 0) continue;
    const g = recs[k++ % recs.length]!;
    out.push(l.slice(0, sp) + g.slice(g.indexOf(' ')));
  }
  return { text: out.join('\n'), gmcp: k };
}

/** Counts what a frame list produces: lines, partials, GMCP messages, bytes. */
export function census(frames: Uint8Array[]): { lines: number; partials: number; gmcp: number; bytes: number; sgr: number; chars: number } {
  const bus = new Bus();
  let lines = 0;
  let partials = 0;
  let gmcp = 0;
  let sgr = 0;
  let chars = 0;
  bus.on('text.line', (l: Line) => {
    lines++;
    chars += l.text.length;
    sgr += l.runs.length;
  });
  bus.on('text.partial', (l: Line) => {
    if (l.text !== '') partials++;
  });
  bus.on('gmcp.raw', () => gmcp++);
  const asm = new LineAssembler(bus);
  const sock = new FakeSock();
  const session = new Session({ bus, sink: asm, timers: noTimers, socketFactory: () => sock });
  session.connect();
  sock.onOpen?.();
  let bytes = 0;
  for (const f of frames) {
    bytes += f.length;
    sock.onData!(f);
  }
  session.dispose();
  return { lines, partials, gmcp, bytes, sgr, chars };
}
