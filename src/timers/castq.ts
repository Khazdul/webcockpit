// The shared cast-attempt queue and the cast feedback lines (Inv §2.6.7).
//
// MUME serialises spellcasting, so the next generic feedback line (`Nothing
// seems to happen.`) is about the oldest cast in flight. Blindness and charm
// casts are queued here from the sent commands; their trackers pop the front
// on their own lines. One owner (`CastFeed`) routes the shared lines and
// tells every subscriber:
//
//   failed     the eight shared failure lines → the queue front is dropped,
//              and the stored-spells tracker drains its own store FIFO too
//              (the accepted "cross-pop", Inv §2.6.7)
//   started    `You start to concentrate...` / `You muster all …` → charm
//              marks its queued cast in flight
//   recalled   `You quickly recall your stored spell...` → stored spells
//              removes the recalled entry; charm marks in flight
//   bad target `Nobody here by that name.` → the queue front is dropped
//   empty Enter (a sent '') → cast aborted: the queue front is dropped
//
// The queue forgets everything 10 s after the last cast was queued, so a
// cast that got no answer cannot mislabel a much later landing. Runtime
// only: never saved (key 'cast', `serialize` → undefined).
//
// Apart from the queue (which holds only blindness and charm), any cast
// sent is pending (`pendingUntil`, the info poll's quiet, ADR 0166
// addendum 18 point 98) until a shared failure line, a bad target, an
// empty Enter, a landing of an affect (`landed`, from the hub) or
// `CAST_PENDING_MS` after it was sent or its concentration started.

import type { TimerCell } from './entry';
import type { LineRouter } from './lines';
import type { Tracker } from './tracker';

/** The queue is dropped this long after the last cast was queued, ms. */
export const CAST_QUEUE_IDLE_MS = 10_000;
/** A cast with no end seen is over this long after it was sent or started, ms. */
export const CAST_PENDING_MS = 8000;

export interface CastAttempt {
  kind: 'blindness' | 'charm';
  /** Blindness: the typed numeric prefix (`2.`), or null. */
  prefix: string | null;
  /** Charm: concentration started (or a stored charm was recalled). */
  inflight: boolean;
}

/** The eight shared failure lines (any cast). */
export const CAST_FAIL_LINES: readonly string[] = [
  'Argh! You cannot concentrate any more...',
  'Nah... You feel too relaxed to do that.',
  'In your dreams, or what?',
  'Alas, not enough mana flows through you...',
  'Your spell backfired!',
  'Nothing seems to happen.',
  'You are too afraid.',
];
/** `You flee %1.` is the eighth. */
const FLEE_PREFIX = 'You flee ';
export const CAST_BAD_TARGET = 'Nobody here by that name.';
export const CAST_RECALL = 'You quickly recall your stored spell...';
export const CAST_STARTED: readonly string[] = [
  'You start to concentrate...',
  'You muster all of your concentration...',
];

/** A parsed outgoing cast: `c[ast] [speed …] 'spell' [target]`. */
export interface ParsedCast {
  /** The text between the quotes, as typed. */
  spell: string;
  /** What follows the closing quote, trimmed. */
  tail: string;
}

/**
 * Parses a sent command as a cast: the first word is a prefix of `cast`
 * (`c` … `cast`, any case), any words may follow (a speed), then a quoted
 * spell. Returns null for anything else.
 */
export function parseCast(text: string): ParsedCast | null {
  const t = text.trimStart();
  // Quick reject: every abbreviation of `cast` starts with c (most sent
  // commands are movement and the like).
  if ((t.charCodeAt(0) | 0x20) !== 0x63) return null;
  let i = 0;
  while (i < t.length && t.charCodeAt(i) > 32) i++;
  const word = t.slice(0, i).toLowerCase();
  if (word.length === 0 || word.length > 4 || !'cast'.startsWith(word)) return null;
  const q = t.indexOf("'", i);
  if (q < 0) return null;
  const q2 = t.indexOf("'", q + 1);
  const spell = q2 < 0 ? t.slice(q + 1) : t.slice(q + 1, q2);
  if (!spell.trim()) return null;
  return { spell: spell.trim(), tail: q2 < 0 ? '' : t.slice(q2 + 1).trim() };
}

/** The spell of MUME's cast echo (`[cast n 'armour']`, `[cast 'shroud' t]`), or null. */
export function parseCastEcho(text: string): string | null {
  if (!text.startsWith('[c')) return null;
  const q = text.indexOf("'");
  if (q < 0) return null;
  const q2 = text.indexOf("'", q + 1);
  const spell = (q2 < 0 ? text.slice(q + 1) : text.slice(q + 1, q2)).trim();
  return spell || null;
}

type Listener = (now: number) => void;

/** The shared queue, the shared lines' owner, and a Tracker for the hub's calls. */
export class CastQueue implements Tracker {
  readonly key = 'cast';
  private items: CastAttempt[] = [];
  private lastPush = 0;
  /** When a cast (any spell) was sent or started, and is not seen over. */
  private castAt: number | null = null;
  private readonly now: () => number;
  private readonly failed: Listener[] = [];
  private readonly started: Listener[] = [];
  private readonly recalled: Listener[] = [];
  private readonly aborted: Listener[] = [];

  constructor(now: () => number) {
    this.now = now;
  }

  // ------------------------------------------------------------- events

  /** A shared failure line (after the queue front is dropped). */
  onFailed(fn: Listener): void {
    this.failed.push(fn);
  }
  /** Concentration started. */
  onStarted(fn: Listener): void {
    this.started.push(fn);
  }
  /** A stored spell was recalled. */
  onRecalled(fn: Listener): void {
    this.recalled.push(fn);
  }
  /** An empty Enter was sent (cast aborted), after the queue front is dropped. */
  onAborted(fn: Listener): void {
    this.aborted.push(fn);
  }

  /** Registers the shared lines. */
  route(router: LineRouter): void {
    const fail = (): void => {
      const now = this.now();
      this.castAt = null;
      this.failFront(now);
      for (const fn of this.failed) fn(now);
    };
    for (const l of CAST_FAIL_LINES) router.onLine(l, fail);
    router.onPrefix(FLEE_PREFIX, (text) => {
      if (text.endsWith('.')) fail();
    });
    router.onLine(CAST_BAD_TARGET, () => {
      this.castAt = null;
      this.failFront(this.now());
    });
    router.onLine(CAST_RECALL, () => {
      const now = this.now();
      for (const fn of this.recalled) fn(now);
    });
    for (const l of CAST_STARTED) {
      router.onLine(l, () => {
        const now = this.now();
        if (this.castAt !== null) this.castAt = now;
        for (const fn of this.started) fn(now);
      });
    }
  }

  // -------------------------------------------------------------- queue

  /** Queues a cast (and restarts the 10 s idle window). */
  enqueue(kind: CastAttempt['kind'], prefix: string | null, now: number): void {
    this.expire(now);
    this.items.push({ kind, prefix, inflight: false });
    this.lastPush = now;
  }

  /** The front entry (after the idle flush), or undefined. */
  front(now: number): CastAttempt | undefined {
    this.expire(now);
    return this.items[0];
  }

  /** Pops the front when it is of `kind`. */
  popIfFrontKind(kind: CastAttempt['kind'], now: number): CastAttempt | null {
    const f = this.front(now);
    if (!f || f.kind !== kind) return null;
    return this.items.shift()!;
  }

  /** Marks the front in flight when it is of `kind`. */
  markFrontInflight(kind: CastAttempt['kind'], now: number): void {
    const f = this.front(now);
    if (f && f.kind === kind) f.inflight = true;
  }

  /** Pops the front when it is of `kind` and in flight. */
  popIfFrontInflight(kind: CastAttempt['kind'], now: number): CastAttempt | null {
    const f = this.front(now);
    if (!f || f.kind !== kind || !f.inflight) return null;
    return this.items.shift()!;
  }

  /** Drops the front (a no-op on an empty queue). */
  failFront(now: number): void {
    this.expire(now);
    this.items.shift();
  }

  /** Until when a cast is pending, or null when none is. */
  pendingUntil(now: number): number | null {
    if (this.castAt === null) return null;
    const until = this.castAt + CAST_PENDING_MS;
    if (now < until) return until;
    this.castAt = null;
    return null;
  }

  /** An affect landed (or was refreshed): the cast is over. */
  landed(): void {
    this.castAt = null;
  }

  /** Queued casts (tests). */
  get length(): number {
    return this.items.length;
  }

  private expire(now: number): void {
    if (this.items.length > 0 && now - this.lastPush >= CAST_QUEUE_IDLE_MS) this.items = [];
  }

  // ------------------------------------------------------------ Tracker

  onSent(text: string, now: number): void {
    if (text === '') {
      this.castAt = null;
      this.failFront(now);
      for (const fn of this.aborted) fn(now);
      return;
    }
    const c = parseCast(text);
    if (!c) return;
    this.castAt = now;
    const spell = c.spell.toLowerCase();
    if (spell.length >= 3 && 'blindness'.startsWith(spell)) {
      const m = /^(\d+\.)/.exec(c.tail);
      this.enqueue('blindness', m ? m[1]! : null, now);
    } else if (spell.length >= 2 && 'charm'.startsWith(spell)) {
      this.enqueue('charm', null, now);
    }
  }

  tick(now: number): void {
    this.expire(now);
  }

  cells(): TimerCell[] {
    return [];
  }

  serialize(): undefined {
    return undefined;
  }

  restore(): void {}

  reset(): void {
    this.items = [];
    this.castAt = null;
  }
}
