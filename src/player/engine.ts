// The log player engine (ADR 0018 "Log player"): turns a timeline (a
// session's runs, src/player/timeline.ts) into timed updates of a target —
// in the app a player App (src/app/player-host.ts), in stage 7 the HTML
// replay's own. It knows nothing about the in-app chrome (src/player/view.ts),
// which drives it through play/pause/seek/speed and reads its position.
//
// Delivery. The engine keeps `next` (the first entry not delivered) and
// `pos` (the playback time delivered up to). `deliverUpTo(p)` moves the
// replay clock (src/player/clock.ts) to each entry's log time, then hands
// the entry to the target: inbound lines and GMCP as telnet bytes on the
// run's PlayerSocket (lines less than 1 ms apart as one frame, like one
// server write), commands as `sent`, VIEW / SIZE records to the target. A
// run's first entry ends the previous run's socket and connects a new one,
// so the session passes through `disconnected` between runs.
//
// Play. Wall time maps to playback time from an anchor:
// `p = anchorPos + (wall − anchorWall) × speed`. The driver delivers up to
// p, then sleeps until the next entry is due (at most 250 ms, so the clock
// and the countdowns keep moving through a quiet stretch). A step that has
// more to deliver than an 8 ms slice continues after the next frame, as
// ReplaySocket does, so a burst at 8× still paints every frame. At the end
// the last run's socket ends and the engine pauses.
//
// Edits (stage 7, ADR 0019). A comment entry goes to `target.comment`, then
// its hold passes at 1× wall rate whatever the speed (`advancePlay`,
// `wallBetween`); seeks treat holds as playback time. A blank entry goes to
// `target.blank`. A run whose first entry is older than the replay clock (a
// spotlight reel) rebases the clock before it connects.
//
// Seek. Forward: fast-forward from `pos` to the target in 50 ms slices
// (a task between slices, so input and the chrome stay alive) with the
// target's painting off; painting resumes when it arrives. Backward: the
// target is disposed, a new one is built on a new clock, and it
// fast-forwards from the chain start (the App's state cannot be rewound).
// A seek during a seek retargets it (or rebuilds when it goes back).

import { FrameBuilder } from '../net/replay-socket';
import { ReplayClock } from './clock';
import { PlayerSocket } from './socket';
import {
  ENTRY_BLANK,
  ENTRY_COMMENT,
  ENTRY_GMCP,
  ENTRY_IN,
  ENTRY_OUT,
  ENTRY_SIZE,
  ENTRY_VIEW,
  type Timeline,
  advancePlay,
  countAt,
  entryText,
  logUsAt,
  runAt,
  wallBetween,
} from './timeline';

/** Playback speeds (keys `1`–`6`). */
export const SPEEDS: readonly number[] = [0.25, 0.5, 1, 2, 4, 8];

/** Entries closer than this (µs) go in one frame. */
const GROUP_US = 1000;
/** Largest frame, bytes. */
const FRAME_BYTES = 16384;
/** Longest delivery per step in play, ms. */
const SLICE_MS = 8;
/** Longest fast-forward slice, ms. */
const FF_SLICE_MS = 50;
/** Longest sleep in play, ms (the clock moves at least this often). */
const TICK_MS = 250;

/** What the engine drives: one per build (a backward seek builds a new one). */
export interface PlayerTarget {
  /** Opens the connection of run `run` on `socket` (App.replayOn). */
  connect(socket: PlayerSocket, run: number): void;
  /** A VIEW record (the ViewSnapshot JSON). */
  view(json: string): void;
  /** A SIZE record. */
  size(cols: number, rows: number): void;
  /** Painting on or off (off while fast-forwarding). */
  paint(on: boolean): void;
  /** A comment: shows its wrapped `## ` lines (stage 7). */
  comment?(text: string): void;
  /** Blank rows before a spotlight window (stage 7). */
  blank?(lines: number): void;
  dispose(): void;
}

/** Builds a target on a clock (the App's now, scheduler and clockUs). */
export type TargetFactory = (clock: ReplayClock) => PlayerTarget;

/** Wall-time services (tests pass fakes). */
export interface Wall {
  /** Monotonic ms. */
  now(): number;
  /** Runs `fn` after `ms`. */
  after(fn: () => void, ms: number): unknown;
  cancel(handle: unknown): void;
  /** Runs `fn` in a new task soon (no 4 ms clamp). */
  task(fn: () => void): void;
  /** Runs `fn` after the next frame has rendered. */
  frame(fn: () => void): void;
  /** Releases what the wall holds (the engine calls it once, on dispose). */
  dispose?(): void;
}

/**
 * The browser's wall: performance.now, setTimeout, MessageChannel, rAF.
 * `dispose` closes the channel: an entangled port with a message handler is
 * never collected, so without it every player open would leak one.
 */
export function browserWall(): Wall {
  let channel: MessageChannel | null = null;
  let closed = false;
  const queue: Array<() => void> = [];
  const task = (fn: () => void): void => {
    if (closed) return;
    if (typeof MessageChannel === 'undefined') {
      setTimeout(fn, 0);
      return;
    }
    if (!channel) {
      channel = new MessageChannel();
      channel.port1.onmessage = () => queue.shift()?.();
    }
    queue.push(fn);
    channel.port2.postMessage(null);
  };
  return {
    now: () => performance.now(),
    after: (fn, ms) => setTimeout(fn, ms),
    cancel: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    task,
    frame: (fn) => {
      if (typeof requestAnimationFrame !== 'function') return task(fn);
      // A task posted from the frame callback runs after that frame renders.
      requestAnimationFrame(() => task(fn));
    },
    dispose: () => {
      closed = true;
      queue.length = 0;
      channel?.port1.close();
      channel?.port2.close();
      channel = null;
    },
  };
}

export type PlayerChange = 'state' | 'tick';

export interface PlayerEngineOptions {
  timeline: Timeline;
  build: TargetFactory;
  wall?: Wall;
  /** Initial speed (default 1). */
  speed?: number;
}

export class PlayerEngine {
  readonly timeline: Timeline;
  private readonly build: TargetFactory;
  private readonly wall: Wall;
  private target: PlayerTarget;
  private clockRef: ReplayClock;
  private sock: PlayerSocket | null = null;
  private sockRun = -1;
  private fb = new FrameBuilder();
  /** First entry not delivered. */
  private next = 0;
  /** Playback time delivered up to, ms. */
  private pos = 0;
  private playingFlag = false;
  private speedValue: number;
  private anchorPos = 0;
  private anchorWall = 0;
  /** Fast-forward target, or null. */
  private ffTo: number | null = null;
  private ended = false;
  private builds = 1;
  private timer: unknown = null;
  /** Bumped whenever the driver is rescheduled; stale wakes return. */
  private token = 0;
  private disposed = false;
  private readonly listeners = new Set<(c: PlayerChange) => void>();

  constructor(opts: PlayerEngineOptions) {
    this.timeline = opts.timeline;
    this.build = opts.build;
    this.wall = opts.wall ?? browserWall();
    this.speedValue = opts.speed ?? 1;
    this.clockRef = this.newClock();
    this.target = this.build(this.clockRef);
  }

  // ----------------------------------------------------------------- state

  /** Playback length, ms. */
  get duration(): number {
    return this.timeline.durationMs;
  }

  /** The current playback time, ms (the seek target while seeking). */
  get position(): number {
    if (this.ffTo !== null) return this.ffTo;
    if (this.playingFlag) return this.livePos();
    return this.pos;
  }

  get playing(): boolean {
    return this.playingFlag;
  }

  get speed(): number {
    return this.speedValue;
  }

  get seeking(): boolean {
    return this.ffTo !== null;
  }

  /** True after the end was reached (and nothing was sought since). */
  get atEnd(): boolean {
    return this.ended;
  }

  /** Index of the run at the current position. */
  get run(): number {
    return runAt(this.timeline, this.position);
  }

  /** The replay clock of the current target. */
  get clock(): ReplayClock {
    return this.clockRef;
  }

  /** Targets built so far (1 + backward seeks; tests). */
  get buildCount(): number {
    return this.builds;
  }

  /** Entries delivered to the current target. */
  get delivered(): number {
    return this.next;
  }

  subscribe(fn: (c: PlayerChange) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(c: PlayerChange): void {
    for (const fn of [...this.listeners]) fn(c);
  }

  // -------------------------------------------------------------- controls

  play(): void {
    if (this.disposed || this.playingFlag) return;
    if (this.ended || (this.next >= this.timeline.n && this.pos >= this.duration && this.ffTo === null)) {
      this.seek(0);
    }
    this.playingFlag = true;
    this.anchorPos = this.pos;
    this.anchorWall = this.wall.now();
    this.kick();
    this.emit('state');
  }

  pause(): void {
    if (this.disposed || !this.playingFlag) return;
    if (this.ffTo === null) {
      const p = this.livePos();
      this.deliverUpTo(p, Infinity);
      this.cancelWake();
    }
    this.playingFlag = false;
    this.emit('state');
  }

  toggle(): void {
    if (this.playingFlag) this.pause();
    else this.play();
  }

  setSpeed(s: number): void {
    if (this.disposed || !(s > 0) || s === this.speedValue) return;
    if (this.playingFlag && this.ffTo === null) {
      this.anchorPos = this.livePos();
      this.anchorWall = this.wall.now();
    }
    this.speedValue = s;
    if (this.playingFlag) this.kick();
    this.emit('state');
  }

  /** Moves to playback time `p` (ms), keeping play or pause. */
  seek(p: number): void {
    if (this.disposed) return;
    const target = Math.max(0, Math.min(this.duration, p));
    this.ended = false;
    if (this.playingFlag && this.ffTo === null) {
      // Deliver nothing more at the old place; the seek decides from here.
      this.cancelWake();
    }
    const back = target < this.pos;
    if (back) this.rebuild();
    if (this.ffTo === null || back) this.target.paint(false);
    this.ffTo = target;
    this.kick();
    this.emit('state');
  }

  /** Stops everything and disposes the target. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelWake();
    this.target.dispose();
    this.clockRef.dispose();
    this.listeners.clear();
    this.wall.dispose?.();
  }

  // ---------------------------------------------------------------- driver

  private livePos(): number {
    const p = advancePlay(this.timeline, this.anchorPos, this.wall.now() - this.anchorWall, this.speedValue);
    return Math.max(this.pos, Math.min(this.duration, p));
  }

  private cancelWake(): void {
    this.token++;
    if (this.timer !== null) this.wall.cancel(this.timer);
    this.timer = null;
  }

  /** Runs the driver in a new task. */
  private kick(): void {
    this.cancelWake();
    const t = this.token;
    this.wall.task(() => {
      if (t === this.token) this.drive();
    });
  }

  private readonly drive = (): void => {
    if (this.disposed) return;
    const tl = this.timeline;
    if (this.ffTo !== null) {
      const done = this.deliverUpTo(this.ffTo, this.wall.now() + FF_SLICE_MS);
      this.emit('tick');
      if (!done) {
        this.kick();
        return;
      }
      this.ffTo = null;
      this.target.paint(true);
      this.anchorPos = this.pos;
      this.anchorWall = this.wall.now();
      if (this.next >= tl.n && this.pos >= this.duration) {
        this.finish();
        return;
      }
      this.emit('state');
      if (!this.playingFlag) return;
    }
    if (!this.playingFlag) return;
    const now = this.wall.now();
    const p = this.livePos();
    const done = this.deliverUpTo(p, now + SLICE_MS);
    this.emit('tick');
    this.cancelWake();
    const t = this.token;
    if (!done) {
      this.wall.frame(() => {
        if (t === this.token) this.drive();
      });
      return;
    }
    if (p >= this.duration && this.next >= tl.n) {
      this.finish();
      return;
    }
    const nextAt = this.next < tl.n ? tl.play[this.next]! : this.duration;
    // At least 1 ms: a float-sized wait would wake at the same wall time.
    const wait = Math.min(TICK_MS, Math.max(1, wallBetween(tl, p, nextAt, this.speedValue)));
    this.timer = this.wall.after(() => {
      this.timer = null;
      if (t === this.token) this.drive();
    }, wait);
  };

  /** The end: the last run's connection closes, the engine pauses. */
  private finish(): void {
    this.cancelWake();
    this.sock?.end();
    this.ended = true;
    this.playingFlag = false;
    this.emit('state');
  }

  private newClock(): ReplayClock {
    const tl = this.timeline;
    return new ReplayClock(tl.n > 0 ? tl.ts[0]! : 0);
  }

  private rebuild(): void {
    this.target.dispose();
    this.clockRef.dispose();
    this.sock = null;
    this.sockRun = -1;
    this.fb = new FrameBuilder();
    this.next = 0;
    this.pos = 0;
    this.clockRef = this.newClock();
    this.target = this.build(this.clockRef);
    this.builds++;
  }

  // -------------------------------------------------------------- delivery

  /**
   * Delivers every entry with `play ≤ p`; stops early (returns false) once
   * the wall clock passes `deadline`. On completion the clock is at `p`.
   */
  deliverUpTo(p: number, deadline: number): boolean {
    const tl = this.timeline;
    const limit = countAt(tl, p);
    const checkTime = deadline !== Infinity;
    while (this.next < limit) {
      if (checkTime && this.wall.now() >= deadline) {
        this.pos = Math.max(this.pos, tl.play[this.next - 1] ?? 0);
        return false;
      }
      this.deliverGroup(limit);
    }
    if (p > this.pos) this.pos = p;
    this.clockRef.advanceTo(logUsAt(tl, this.pos));
    return true;
  }

  /** Delivers the entry at `next` and the entries that share its frame. */
  private deliverGroup(limit: number): void {
    const tl = this.timeline;
    const i = this.next;
    const r = tl.run[i]!;
    if (r !== this.sockRun) this.openRun(r);
    const sock = this.sock!;
    const ts0 = tl.ts[i]!;
    this.clockRef.advanceTo(ts0);
    const k = tl.kind[i]!;
    if (k === ENTRY_OUT) {
      this.next = i + 1;
      sock.sent(entryText(tl, i));
      return;
    }
    if (k === ENTRY_VIEW) {
      this.next = i + 1;
      this.target.view(entryText(tl, i));
      return;
    }
    if (k === ENTRY_SIZE) {
      this.next = i + 1;
      const s = parseSize(entryText(tl, i));
      if (s) this.target.size(s.cols, s.rows);
      return;
    }
    if (k === ENTRY_COMMENT) {
      this.next = i + 1;
      this.target.comment?.(entryText(tl, i));
      return;
    }
    if (k === ENTRY_BLANK) {
      this.next = i + 1;
      this.target.blank?.(tl.blankLines);
      return;
    }
    const fb = this.fb;
    let j = i;
    while (j < limit) {
      const kj = tl.kind[j]!;
      if ((kj !== ENTRY_IN && kj !== ENTRY_GMCP) || tl.run[j] !== r) break;
      if (j > i && (tl.ts[j]! - ts0 >= GROUP_US || fb.length >= FRAME_BYTES)) break;
      if (kj === ENTRY_GMCP) fb.gmcp(entryText(tl, j));
      else fb.inbound(entryText(tl, j));
      j++;
    }
    this.next = j;
    sock.data(fb.take());
  }

  private openRun(r: number): void {
    this.sock?.end();
    const t0 = this.timeline.ts[this.next]!;
    if (t0 < this.clockRef.nowUs()) this.clockRef.rebase(t0);
    const sock = new PlayerSocket();
    this.sock = sock;
    this.sockRun = r;
    this.fb.resetGmcp();
    this.target.connect(sock, r);
  }
}

/** A SIZE payload, or null when it is not `{"cols":C,"rows":R}` with sane numbers. */
export function parseSize(json: string): { cols: number; rows: number } | null {
  try {
    const v = JSON.parse(json) as { cols?: unknown; rows?: unknown };
    const cols = v.cols;
    const rows = v.rows;
    if (typeof cols !== 'number' || typeof rows !== 'number') return null;
    if (!(cols >= 10 && cols <= 2000 && rows >= 5 && rows <= 1000)) return null;
    return { cols: Math.floor(cols), rows: Math.floor(rows) };
  } catch {
    return null;
  }
}
