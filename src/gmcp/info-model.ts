// What the last applied `info` poll answered (stage 77 part C, ADR 0166).
// GameState owns one (`game.info`): reset with the character and on another
// Char.Name.
//
// A read of what the player saw (info-typed.ts, ADR 0166 addendum 18
// point 96) is merged in: only what it read changes, and `at` moves, as a
// read counts as a poll. Each change is a new answer object (the card
// compares them by identity). `complete` says a poll has answered: a
// partial read alone does not make the data fresh for an opened tab.

import { ABILITIES } from './age';
import { type InfoAnswer, emptyAnswer } from './info-answer';
import type { InfoRead } from './info-typed';

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

  /** Forgets the answer; true when there was one. */
  reset(): boolean {
    if (this.answer === null) return false;
    this.answer = null;
    this.at = null;
    this.complete = false;
    return true;
  }
}
