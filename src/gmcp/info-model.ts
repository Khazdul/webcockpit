// What the last applied `info` poll answered (stage 77 part C, ADR 0166).
// GameState owns one (`game.info`): reset with the character and on another
// Char.Name.

import type { InfoAnswer } from './info-answer';

export class InfoModel {
  answer: InfoAnswer | null = null;
  /** When `answer` was received (wall clock, ms). */
  at: number | null = null;

  apply(answer: InfoAnswer, now: number): void {
    this.answer = answer;
    this.at = now;
  }

  /** Forgets the answer; true when there was one. */
  reset(): boolean {
    if (this.answer === null) return false;
    this.answer = null;
    this.at = null;
    return true;
  }
}
