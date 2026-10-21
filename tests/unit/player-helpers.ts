// Log player test helpers: a fake wall, a recording target and small
// capture logs in the recorder's format.
import type { RunMeta } from '../../src/capture/store';
import { formatGmcpRecord, formatInbound, formatOutbound, formatRecord } from '../../src/capture/format';
import type { ReplayClock } from '../../src/player/clock';
import type { PlayerTarget, Wall } from '../../src/player/engine';
import type { PlayerSocket } from '../../src/player/socket';
import type { ChainRun } from '../../src/player/timeline';

/** A wall clock the test moves by hand; tasks and frames run on `flush`. */
export class FakeWall implements Wall {
  t = 0;
  private seq = 0;
  private tasks: Array<() => void> = [];
  private timers: Array<{ id: number; at: number; fn: () => void }> = [];

  now(): number {
    return this.t;
  }
  after(fn: () => void, ms: number): unknown {
    const id = ++this.seq;
    this.timers.push({ id, at: this.t + ms, fn });
    return id;
  }
  cancel(h: unknown): void {
    this.timers = this.timers.filter((x) => x.id !== h);
  }
  task(fn: () => void): void {
    this.tasks.push(fn);
  }
  frame(fn: () => void): void {
    this.tasks.push(fn);
  }
  /** Runs queued tasks (and the tasks they queue). */
  flush(): void {
    for (let n = 0; this.tasks.length > 0 && n < 1_000_000; n++) this.tasks.shift()!();
  }
  /** Moves the wall `ms` forward, running timers and tasks in order. */
  advance(ms: number): void {
    const end = this.t + ms;
    this.flush();
    for (;;) {
      let best: { id: number; at: number; fn: () => void } | null = null;
      for (const x of this.timers) if (x.at <= end && (!best || x.at < best.at)) best = x;
      if (!best) break;
      this.timers = this.timers.filter((x) => x !== best);
      this.t = Math.max(this.t, best.at);
      best.fn();
      this.flush();
    }
    this.t = end;
    this.flush();
  }
}

export type TargetCall =
  | { t: 'connect'; run: number }
  | { t: 'data'; text: string; clockUs: number }
  | { t: 'sent'; text: string; clockUs: number }
  | { t: 'close'; reason: string }
  | { t: 'view'; json: string }
  | { t: 'size'; cols: number; rows: number }
  | { t: 'paint'; on: boolean }
  | { t: 'comment'; text: string; clockUs: number }
  | { t: 'blank'; lines: number }
  | { t: 'dispose' };

/** A target that records what the engine does, per build. */
export class RecordingTarget {
  builds: TargetCall[][] = [];
  clocks: ReplayClock[] = [];

  get calls(): TargetCall[] {
    return this.builds[this.builds.length - 1] ?? [];
  }

  /** The inbound text delivered to the current build (telnet bytes as latin1, IAC sequences dropped). */
  text(): string {
    return this.calls
      .filter((c): c is Extract<TargetCall, { t: 'data' }> => c.t === 'data')
      .map((c) => c.text)
      .join('');
  }

  readonly build = (clock: ReplayClock): PlayerTarget => {
    const calls: TargetCall[] = [];
    this.builds.push(calls);
    this.clocks.push(clock);
    return {
      connect: (sock: PlayerSocket, run: number) => {
        calls.push({ t: 'connect', run });
        sock.onData = (b) => calls.push({ t: 'data', text: stripIac(b), clockUs: clock.nowUs() });
        sock.onSent = (text) => calls.push({ t: 'sent', text, clockUs: clock.nowUs() });
        sock.onClose = (reason) => calls.push({ t: 'close', reason });
        sock.connect();
      },
      view: (json) => calls.push({ t: 'view', json }),
      size: (cols, rows) => calls.push({ t: 'size', cols, rows }),
      paint: (on) => calls.push({ t: 'paint', on }),
      comment: (text) => calls.push({ t: 'comment', text, clockUs: clock.nowUs() }),
      blank: (lines) => calls.push({ t: 'blank', lines }),
      dispose: () => calls.push({ t: 'dispose' }),
    };
  };
}

/** Bytes as text with telnet IAC sequences removed (GMCP payloads kept as `{GMCP …}`). */
export function stripIac(b: Uint8Array): string {
  let out = '';
  for (let i = 0; i < b.length; i++) {
    const c = b[i]!;
    if (c !== 255) {
      out += String.fromCharCode(c);
      continue;
    }
    const cmd = b[i + 1]!;
    if (cmd === 250) {
      let j = i + 3;
      let body = '';
      while (j < b.length && !(b[j] === 255 && b[j + 1] === 240)) body += String.fromCharCode(b[j++]!);
      out += `{GMCP ${body}}`;
      i = j + 1;
    } else if (cmd === 249) {
      out += '<GA>';
      i += 1;
    } else i += 2;
  }
  return out;
}

export type LogItem =
  | { at: number; in: string }
  | { at: number; out: string }
  | { at: number; gmcp: string; json?: unknown }
  | { at: number; view: unknown }
  | { at: number; size: { cols: number; rows: number } };

/** A capture log from items with times in seconds after `baseUs`. */
export function makeLog(baseUs: number, items: LogItem[]): string {
  let s = '';
  for (const it of items) {
    const ts = baseUs + Math.round(it.at * 1e6);
    if ('in' in it) s += formatInbound(ts, it.in);
    else if ('out' in it) s += formatOutbound(ts, it.out);
    else if ('gmcp' in it) s += formatGmcpRecord(ts, it.gmcp, it.json === undefined ? '' : JSON.stringify(it.json));
    else if ('view' in it) s += formatRecord(ts, 'VIEW', JSON.stringify(it.view));
    else s += formatRecord(ts, 'SIZE', JSON.stringify(it.size));
  }
  return s;
}

export function meta(runId: string, startedUs: number, extra: Partial<RunMeta> = {}): RunMeta {
  const character = runId.split('/')[0]!;
  return { runId, character, startedUs, endedUs: null, sealed: true, bytes: 1, lines: 1, ...extra };
}

/** Two runs of Rasta: 0–30 s (a 60 s gap inside) and, an hour later, 0–5 s. */
export const BASE_US = 1_790_000_000_000_000;
/** A recorded pane set with one tint, so tests can tell recorded colours from the None default. */
const RECORDED_PANES = {
  character: { on: true, color: 'black', border: true, glass: true },
  timers: { on: true, color: 'red', border: true, glass: true },
  group: { on: true, color: 'black', border: true, glass: true },
  comm: { on: true, color: 'black', border: true, glass: true },
  ui: { on: true, color: 'black', border: true, glass: true },
  map: { on: true, color: 'black', border: true, glass: true },
};

export function twoRunChain(): ChainRun[] {
  const r1 = makeLog(BASE_US, [
    { at: 0, gmcp: 'Char.Name', json: { name: 'Rasta', fullname: 'Rasta the Ranger' } },
    { at: 0.0001, size: { cols: 120, rows: 40 } },
    { at: 0.0002, view: { appearance: { size: 14 }, panes: RECORDED_PANES } },
    { at: 1, in: 'Hello.' },
    { at: 1.0002, in: 'World.' },
    { at: 2, in: 'oO>' },
    { at: 2.5, out: 'look' },
    { at: 3, in: 'A room.' },
    { at: 63, in: 'Much later.' },
    { at: 70, in: 'Bye.' },
  ]);
  const b2 = BASE_US + 3600e6;
  const r2 = makeLog(b2, [
    { at: 0, gmcp: 'Char.Name', json: { name: 'Rasta', fullname: 'Rasta the Ranger' } },
    { at: 1, in: 'Again.' },
    { at: 5, in: 'End.' },
  ]);
  return [
    { meta: meta('Rasta/a', BASE_US), text: r1 },
    { meta: meta('Rasta/b', b2), text: r2 },
  ];
}
