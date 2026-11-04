// Affects tracker (Inv §2.6.5): spells, buffs and debuffs on the character,
// from the game lines in data/affects.ts.
//
//   start/refresh line   inactive → up (`◆ SPELL: bless up.`); active →
//                        refreshed (timer restarts; an untracked entry
//                        graduates). Indefinite affects refresh silently.
//   drop line            down; a tracked timed entry records its observed
//                        duration as a sample (damage-droppable affects
//                        only when not shorter than the table duration)
//   learned duration     floor(mean) of the last 3 samples, else the table
//   expiry               the drop line is the truth: past `expiresAt` the
//                        entry stays (overrun, empty bar) until the drop
//                        line; a safety net removes it silently at 2.5 ×
//                        expected without a sample. Affects without a drop
//                        line end at `expiresAt` (down). Checked every 10 s.
//   reconcile            `stat`/`info` lists (reconcile.ts): seen but not
//                        active → added (timed ones untracked); active but
//                        not seen → removed silently
//
// Saved: the timed entries and the learned samples (indefinite and
// untracked entries are re-seen in game, Inv §2.6.5).

import { AFFECTS, type AffectDef, type GameLine, affectName, hasDropLine } from './data/affects';
import type { TimerCell } from './entry';
import type { LineRouter } from './lines';
import type { StateTag, Tracker, TrackerHost } from './tracker';

/** Prune cadence, ms. */
export const AFFECTS_PRUNE_MS = 10_000;
/** Learned samples kept per affect. */
export const LEARN_SAMPLES = 3;
/** The safety net: an overrun entry goes at this multiple of its expected duration. */
export const OVERRUN_LIMIT = 2.5;

interface Active {
  name: string;
  /** ms; null = untracked (seen in stat only). */
  startedAt: number | null;
  /** ms; null = indefinite or untracked. */
  expected: number | null;
  expiresAt: number | null;
  tracked: boolean;
}

interface Saved {
  active?: Array<{ name: string; startedAt: number; expected: number; expiresAt: number }>;
  learned?: Record<string, number[]>;
}

const TAG: Record<AffectDef['type'], StateTag> = { spell: 'SPELL', buff: 'BUFF', debuff: 'DEBUFF' };

/** The affect shown in the Sanctuary group (ADR 0122). */
export const SANCTUARY = 'sanctuary';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export class AffectsTracker implements Tracker {
  readonly key = 'affects';
  private readonly host: TrackerHost;
  private readonly active = new Map<string, Active>();
  /** Learned durations, seconds, oldest first. */
  private learned = new Map<string, number[]>();
  private lastPrune = -Infinity;

  constructor(host: TrackerHost) {
    this.host = host;
  }

  /** Registers every affect line; per line the drops run before the starts. */
  route(router: LineRouter): void {
    const drops = new Map<string, string[]>();
    const starts = new Map<string, string[]>();
    const prefixDrops: Array<[string, string]> = [];
    const prefixStarts: Array<[string, string]> = [];
    const add = (lines: readonly GameLine[] | undefined, name: string, exact: Map<string, string[]>, pre: Array<[string, string]>): void => {
      for (const l of lines ?? []) {
        if (typeof l === 'string') {
          const list = exact.get(l) ?? [];
          if (!list.includes(name)) list.push(name);
          exact.set(l, list);
        } else pre.push([l.prefix, name]);
      }
    };
    for (const [name, def] of Object.entries(AFFECTS)) {
      add(def.drop, name, drops, prefixDrops);
      add(def.start, name, starts, prefixStarts);
      add(def.refresh, name, starts, prefixStarts);
    }
    for (const line of new Set([...drops.keys(), ...starts.keys()])) {
      const d = drops.get(line) ?? [];
      const s = starts.get(line) ?? [];
      router.onLine(line, () => {
        const now = this.host.now();
        for (const n of d) this.drop(n, now);
        for (const n of s) this.start(n, now);
      });
    }
    for (const [p, n] of prefixDrops) router.onPrefix(p, () => this.drop(n, this.host.now()));
    for (const [p, n] of prefixStarts) router.onPrefix(p, () => this.start(n, this.host.now()));
  }

  // ------------------------------------------------------------- events

  /** Expected duration of an affect, ms (learned mean, else the table); null = indefinite. */
  expectedMs(name: string): number | null {
    const def = AFFECTS[name];
    if (!def || def.duration === undefined) return null;
    const s = this.learned.get(name);
    if (s && s.length > 0) return Math.floor(s.reduce((a, b) => a + b, 0) / s.length) * 1000;
    return def.duration * 1000;
  }

  /** A start or refresh line: up, or refreshed. */
  start(name: string, now: number): void {
    const def = AFFECTS[name];
    if (!def) return;
    const expected = this.expectedMs(name);
    const e = this.active.get(name);
    const next: Active = {
      name,
      startedAt: now,
      expected,
      expiresAt: expected === null ? null : now + expected,
      tracked: true,
    };
    this.active.set(name, next);
    this.host.changed();
    if (!e) this.host.announce(TAG[def.type], name, 'up');
    else if (expected !== null) this.host.announce(TAG[def.type], name, 'refreshed');
  }

  /** A drop line: down, with a learned sample when the entry was timed. */
  drop(name: string, now: number): void {
    const e = this.active.get(name);
    if (!e) return;
    const def = AFFECTS[name];
    if (def && def.duration !== undefined && e.tracked && e.startedAt !== null) {
      const observed = Math.floor((now - e.startedAt) / 1000);
      if (!(def.damageDroppable && observed < def.duration) && observed > 0) this.learn(name, observed);
    }
    this.active.delete(name);
    this.host.changed();
    if (def) this.host.announce(TAG[def.type], name, 'down');
  }

  private learn(name: string, secs: number): void {
    const s = this.learned.get(name) ?? [];
    s.push(secs);
    while (s.length > LEARN_SAMPLES) s.shift();
    this.learned.set(name, s);
  }

  /**
   * The affects a `stat`/`info` block listed (names as printed; unknown
   * ones are ignored). Silent.
   */
  reconcile(observed: readonly string[], now: number): void {
    const seen = new Set<string>();
    for (const o of observed) {
      const name = affectName(o);
      if (name) seen.add(name);
    }
    let changed = false;
    for (const name of [...this.active.keys()]) {
      if (!seen.has(name)) {
        this.active.delete(name);
        changed = true;
      }
    }
    for (const name of seen) {
      if (this.active.has(name)) continue;
      const def = AFFECTS[name]!;
      this.active.set(
        name,
        def.duration !== undefined
          ? { name, startedAt: null, expected: null, expiresAt: null, tracked: false }
          : { name, startedAt: now, expected: null, expiresAt: null, tracked: true },
      );
      changed = true;
    }
    if (changed) this.host.changed();
  }

  // ------------------------------------------------------------ Tracker

  tick(now: number): void {
    if (now - this.lastPrune < AFFECTS_PRUNE_MS) return;
    this.lastPrune = now;
    let changed = false;
    for (const e of [...this.active.values()]) {
      if (e.expiresAt === null || e.expiresAt > now) continue;
      const def = AFFECTS[e.name];
      if (!def) {
        this.active.delete(e.name);
        changed = true;
      } else if (hasDropLine(def)) {
        if (e.startedAt !== null && e.expected !== null && now - e.startedAt >= Math.floor(OVERRUN_LIMIT * e.expected)) {
          this.active.delete(e.name); // safety net: silent, no sample
          changed = true;
        }
      } else {
        this.active.delete(e.name);
        changed = true;
        this.host.announce(TAG[def.type], e.name, 'down');
      }
    }
    if (changed) this.host.changed();
  }

  cells(): TimerCell[] {
    const out: TimerCell[] = [];
    for (const e of this.active.values()) {
      const def = AFFECTS[e.name];
      if (!def) continue;
      out.push({
        id: `affect:${e.name}`,
        name: e.name,
        // Your sanctuary has a group of its own (ADR 0122).
        group: e.name === SANCTUARY ? 'sanct' : def.type,
        startedAt: e.startedAt,
        expiresAt: e.expiresAt,
        expected: e.expected,
        tracked: e.tracked,
      });
    }
    return out;
  }

  serialize(): Saved {
    const active: NonNullable<Saved['active']> = [];
    for (const e of this.active.values()) {
      if (!e.tracked || e.startedAt === null || e.expected === null || e.expiresAt === null) continue;
      active.push({ name: e.name, startedAt: e.startedAt, expected: e.expected, expiresAt: e.expiresAt });
    }
    const learned: Record<string, number[]> = {};
    for (const [k, v] of this.learned) if (v.length > 0) learned[k] = [...v];
    return { active, learned };
  }

  restore(saved: unknown, now: number): void {
    if (typeof saved !== 'object' || saved === null) return;
    const s = saved as Saved;
    if (s.learned && typeof s.learned === 'object') {
      for (const [name, v] of Object.entries(s.learned)) {
        if (AFFECTS[name]?.duration === undefined || !Array.isArray(v)) continue;
        const old = v.filter((x): x is number => isNum(x) && x > 0).map(Math.floor);
        const live = this.learned.get(name) ?? [];
        const merged = [...old, ...live].slice(-LEARN_SAMPLES);
        if (merged.length > 0) this.learned.set(name, merged);
      }
    }
    if (Array.isArray(s.active)) {
      for (const e of s.active) {
        if (!e || typeof e.name !== 'string' || AFFECTS[e.name]?.duration === undefined) continue;
        if (!isNum(e.startedAt) || !isNum(e.expected) || !isNum(e.expiresAt)) continue;
        if (this.active.has(e.name) || e.expiresAt <= now) continue;
        this.active.set(e.name, { name: e.name, startedAt: e.startedAt, expected: e.expected, expiresAt: e.expiresAt, tracked: true });
      }
    }
  }

  reset(): void {
    this.active.clear();
    this.learned.clear();
    this.lastPrune = -Infinity;
  }

  /** Learned samples of an affect, seconds (tests). */
  samples(name: string): number[] {
    return [...(this.learned.get(name) ?? [])];
  }
}
