// What the last applied `info` poll answered (stage 77 part C, ADR 0166).
// GameState owns one (`game.info`): reset with the character and on another
// Char.Name.
//
// A read of what the player saw (info-typed.ts, ADR 0166 addendum 18
// point 96) is merged in: only what it read changes, and `at` moves, as a
// read counts as a poll. Each change is a new answer object (the card
// compares them by identity). `complete` says a poll has answered: a
// partial read alone does not make the data fresh for an opened tab.
//
// Shields in a log (ADR 0166 addendum 41): the live App writes the four
// shields (OB, DB, PB, ABS) into the run log as a private GMCP record,
// `ESC GMCP WebCockpit.Shields {"ob":…,"db":…,"pb":…,"abs":…}`, whenever
// one of them changed since the run's last such record. A replay applies it
// with `applyShields`: only the shields change, `at` and `complete` stay
// as they were (null and false in a replay), so the Status tab's shields
// show and Stats and Lore keep their quiet text.

import { ABILITIES } from './age';
import { type InfoAnswer, emptyAnswer } from './info-answer';
import type { InfoRead } from './info-typed';

/** The private GMCP package of the shields record in a run log (ADR 0166 addendum 41). */
export const SHIELDS_GMCP = 'WebCockpit.Shields';
/** `SHIELDS_GMCP` in lower case (`gmcpKey`). */
export const SHIELDS_GMCP_KEY = 'webcockpit.shields';

/** The four shields of an answer: OB, DB, PB, ABS (null: not read). */
export interface Shields {
  ob: number | null;
  db: number | null;
  pb: number | null;
  abs: number | null;
}

export const SHIELD_KEYS = ['ob', 'db', 'pb', 'abs'] as const;

/** The shields of `answer`, or null when it has none of them. */
export function shieldsOf(answer: InfoAnswer | null): Shields | null {
  if (!answer) return null;
  const s: Shields = { ob: answer.ob, db: answer.db, pb: answer.pb, abs: answer.abs };
  return SHIELD_KEYS.some((k) => s[k] !== null) ? s : null;
}

/** Most a shield can read in a log record; anything else is taken as not read. */
const SHIELD_LIMIT = 100_000;

/**
 * A shields record's data (a log is someone's file, a shared run anyone's):
 * an object whose four keys are integers or null, or null when it is not
 * one or has no shield at all. Other keys are ignored.
 */
export function parseShields(data: unknown): Shields | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  const o = data as Record<string, unknown>;
  const s: Shields = { ob: null, db: null, pb: null, abs: null };
  for (const k of SHIELD_KEYS) {
    const v = o[k];
    if (typeof v === 'number' && Number.isInteger(v) && Math.abs(v) <= SHIELD_LIMIT) s[k] = v;
  }
  return SHIELD_KEYS.some((k) => s[k] !== null) ? s : null;
}

export class InfoModel {
  answer: InfoAnswer | null = null;
  /** When `answer` was received (wall clock, ms). */
  at: number | null = null;
  /** A whole poll answer is in `answer`. */
  complete = false;

  apply(answer: InfoAnswer, now: number): void {
    this.answer = answer;
    this.at = now;
    this.complete = true;
  }

  /** A partial read, received now. */
  merge(read: InfoRead, now: number): void {
    const base = this.answer ?? emptyAnswer();
    const { abilities: readAbilities, gold, ...scalars } = read;
    const next: InfoAnswer = { ...base, ...scalars, abilities: { ...base.abilities } };
    if (readAbilities) {
      for (const a of ABILITIES) {
        const r = readAbilities[a];
        if (!r) continue;
        const current = r.current ?? base.abilities[a].current;
        const unaffected = r.unaffected ?? base.abilities[a].unaffected;
        next.abilities[a] = { current, unaffected, delta: current !== null && unaffected !== null ? current - unaffected : null };
      }
    }
    // `stat` has the gold coins only: no purse without the silver and copper.
    if (gold !== undefined && scalars.purse === undefined && base.purse) next.purse = { ...base.purse, gold };
    this.answer = next;
    this.at = now;
  }

  /**
   * A log's shields record (addendum 41): the shields change, nothing else
   * does, and `at` / `complete` stay. True when a shield changed.
   */
  applyShields(s: Shields): boolean {
    const base = this.answer ?? emptyAnswer();
    if (SHIELD_KEYS.every((k) => base[k] === s[k])) return false;
    this.answer = { ...base, ob: s.ob, db: s.db, pb: s.pb, abs: s.abs };
    return true;
  }

  /** Forgets the answer; true when there was one. */
  reset(): boolean {
    if (this.answer === null) return false;
    this.answer = null;
    this.at = null;
    this.complete = false;
    return true;
  }
}
