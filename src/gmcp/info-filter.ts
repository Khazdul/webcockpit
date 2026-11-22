// The hidden info poll's filter (stage 77 part C, ADR 0166 points 1–4, 21,
// 22, 25). It sits between the line assembler and the bus, so no listener
// (display, recorder, actions, scripts, map) sees an answer. Pure TS.
//
//   ␍␊                                  hidden: the answer was queued
//   WC<nonce>[74 | 81 | … wrapped       held, from a known start at a line's start
//   … | 20 | 40]WC<nonce>               the end: dropped and parsed
//   ␍␊                                  hidden: the blank line after
//   <prompt>o&gt;</prompt> GA           hidden: the pulse showed nothing else
//
// - With no poll known a line costs one test (`watching`).
// - No end (HOLD_MS, a prompt, MAX_LINES, `reset`) or an unreadable answer:
//   the held lines go out as they came, the same objects in the same order.
//   Hiding can delay game text and cannot lose it.
// - The end may be cut by the wrap, the start is only taken whole.
// - A blank line that may precede an answer waits no longer than its frame
//   (`frameEnd`).
// - Only a line that is an XML game prompt and nothing else is hidden as
//   the prompt: a question ended by GA is game text.
// - `text.partial` of what is held never shows, and a partial already shown
//   of what is hidden is cleared.

import type { Line } from '../core/types';
import type { Scheduler } from '../script/engine/timers';
import { INFO_FIELDS, INFO_SEPARATOR, type InfoAnswer, parseInfoAnswer } from './info-answer';

/** How long lines are held after a start sentinel. */
export const HOLD_MS = 2000;
/** The most lines held. A whole answer at 20 columns is about 30. */
export const MAX_LINES = 80;
/** The most unanswered polls that are still recognised. */
export const MAX_KNOWN = 8;

/** Every sentinel has it, in capitals as part A sent it. */
const MARK = 'WC';
const PAGER = /\*\*\* Return: continue\b/;
/** The line editor's place marker, the line over its `:` prompt. */
const EDITOR_MARK = '==>';

export const startSentinel = (nonce: string): string => `${MARK}${nonce}[`;
export const endSentinel = (nonce: string): string => `]${MARK}${nonce}`;

/** The poll's command. ASCII (ADR 0166 point 1). */
export function infoCommand(nonce: string): string {
  return `info ${startSentinel(nonce)}${INFO_FIELDS.map((f) => f.code).join(INFO_SEPARATOR)}${endSentinel(nonce)}`;
}

/** An XML prompt with no other text on its line: also one still being received. */
function isPromptTagged(l: Line): boolean {
  for (const t of l.tags) {
    if (t.tag !== 'prompt') continue;
    return t.start === 0 && (t.end < 0 || l.text.slice(t.end).trim() === '');
  }
  return false;
}

/**
 * An XML game prompt with no other text on its line. The tag is not enough:
 * the line editor's `: ` has it too. MUME's game prompts end with `>`
 * (`change prompt` only switches fields), so nothing else is one.
 */
export function isGamePrompt(l: Line): boolean {
  return isPromptTagged(l) && endsAsGamePrompt(l);
}

function endsAsGamePrompt(l: Line): boolean {
  const text = l.text.trim();
  return text.endsWith('>') && text !== EDITOR_MARK && !PAGER.test(text);
}

export interface InfoFilterOptions {
  line(l: Line): void;
  partial(l: Line): void;
  /** An answer was taken out. */
  found(nonce: string, answer: InfoAnswer): void;
  /** Hiding ended without an answer. The held lines go out after this. */
  failed(nonce: string): void;
  scheduler: Scheduler;
}

export class InfoFilter {
  /** The last completed line as MUME sent it, hidden or not. */
  last: Line | null = null;
  /** The last prompt, or the editor's marker over its prompt. */
  private asked: Line | null = null;
  /** Text has begun after `last`. */
  partialOpen = false;

  /** A poll is known or an answer is under way: lines take the slow path. */
  private watching = false;
  /** Sentinels of polls sent and not answered, oldest first. */
  private known: { nonce: string; start: string }[] = [];
  /** The answer being held. */
  private hold: { nonce: string; end: string; lines: Line[]; body: string[]; tail: string; timer: unknown } | null = null;
  /** A blank line that may be the one before an answer. */
  private before: Line | null = null;
  /** What may still follow an answer: its blank line and the prompt, or only the prompt. */
  private after: 'blank' | 'prompt' | null = null;
  /** Something of the current pulse was passed on. */
  private pulseShown = false;
  /** A partial is on the screen. */
  private shown = false;
  /** The partial that was not passed on. */
  private keptPartial: Line | null = null;

  constructor(private readonly o: InfoFilterOptions) {}

  /** A poll was sent: its answer is hidden however late it comes. */
  expect(nonce: string): void {
    if (!this.watching) {
      this.pulseShown = this.last !== null && !this.last.prompt;
      this.shown = this.partialOpen;
    }
    this.known.push({ nonce, start: startSentinel(nonce) });
    if (this.known.length > MAX_KNOWN) this.known.shift();
    this.watching = true;
  }

  line(l: Line): void {
    this.last = l;
    if (l.prompt || isPromptTagged(l) || l.text.trim() === EDITOR_MARK) this.asked = l;
    this.partialOpen = false;
    if (!this.watching) return this.o.line(l);
    this.takeLine(l);
    this.updateWatching();
  }

  partial(l: Line): void {
    this.partialOpen = l.text !== '';
    if (!this.watching) return this.o.partial(l);
    this.takePartial(l);
  }

  /**
   * MUME reads input of its own (the line editor, the pager, a question):
   * the last prompt is not a game prompt. Text after that prompt (a tell
   * arriving in the editor) does not end it. Without XML the prompt's text
   * alone decides.
   */
  readsInput(): boolean {
    return this.asked !== null && !endsAsGamePrompt(this.asked);
  }

  /** The socket frame is read to its end. */
  frameEnd(): void {
    this.flushBefore();
  }

  /** Another connection, or none: what is held goes out and every poll is forgotten. */
  reset(): void {
    const hold = this.hold;
    const lines = hold ? hold.lines : this.before ? [this.before] : [];
    const partial = this.keptPartial;
    if (hold) this.o.scheduler.clear(hold.timer);
    this.hold = this.before = this.after = this.keptPartial = this.last = this.asked = null;
    this.known = [];
    this.partialOpen = this.watching = false;
    for (const l of lines) this.show(l);
    if (partial) this.showPartial(partial);
  }

  private takeLine(l: Line): void {
    this.keptPartial = null;
    if (this.hold) return this.holdLine(l);
    const poll = this.startOf(l.text);
    if (poll) {
      this.begin(poll.nonce, l.ts);
      return this.holdLine(l);
    }
    this.flushBefore();
    const blank = !l.prompt && l.text.trim() === '';
    const after = this.after;
    if (after) {
      if (blank && after === 'blank') {
        this.after = 'prompt';
        return this.clearShown(l.ts);
      }
      this.after = null;
      if (!this.pulseShown && isGamePrompt(l)) return this.clearShown(l.ts);
    }
    // Only a pulse's first line: one further in is the text's own.
    if (blank && !this.pulseShown && this.known.length > 0) this.before = l;
    else this.show(l);
  }

  private takePartial(l: Line): void {
    if (this.hold) {
      this.keptPartial = l.text === '' ? null : l;
      return;
    }
    if (l.text !== '') {
      const poll = this.startOf(l.text);
      if (poll) this.begin(poll.nonce, l.ts);
      if (poll || this.maybeStart(l.text) || (this.after && !this.pulseShown && isPromptTagged(l))) {
        this.keptPartial = l;
        return;
      }
      this.flushBefore();
    }
    this.keptPartial = null;
    this.showPartial(l);
  }

  private startOf(text: string): { nonce: string; start: string } | null {
    if (!text.startsWith(MARK)) return null;
    return this.known.find((k) => text.startsWith(k.start)) ?? null;
  }

  /** An unfinished line that can still become a start sentinel. */
  private maybeStart(text: string): boolean {
    return this.known.some((k) => k.start.startsWith(text));
  }

  private begin(nonce: string, ts: number): void {
    this.known = this.known.filter((k) => k.nonce !== nonce);
    const lines = this.before ? [this.before] : [];
    this.before = this.after = null;
    this.clearShown(ts);
    const timer = this.o.scheduler.set(() => {
      this.fail();
      this.updateWatching();
    }, HOLD_MS);
    this.hold = { nonce, end: endSentinel(nonce), lines, body: [], tail: '', timer };
  }

  private holdLine(l: Line): void {
    const h = this.hold!;
    h.lines.push(l);
    h.body.push(l.text);
    h.tail = (h.tail + l.text.trimEnd()).slice(-h.end.length);
    if (h.tail === h.end) this.finish();
    else if (l.prompt || h.body.length >= MAX_LINES) this.fail();
  }

  private finish(): void {
    const h = this.hold!;
    const answer = parseInfoAnswer(between(h.body, startSentinel(h.nonce), h.end));
    if (!answer) return this.fail();
    this.o.scheduler.clear(h.timer);
    this.hold = this.keptPartial = null;
    this.after = 'blank';
    this.o.found(h.nonce, answer);
  }

  private fail(): void {
    const h = this.hold;
    if (!h) return;
    const partial = this.keptPartial;
    this.o.scheduler.clear(h.timer);
    this.hold = this.keptPartial = null;
    this.o.failed(h.nonce);
    for (const l of h.lines) this.show(l);
    if (partial) this.showPartial(partial);
  }

  private flushBefore(): void {
    const l = this.before;
    if (!l) return;
    this.before = null;
    this.show(l);
  }

  private show(l: Line): void {
    this.pulseShown = !l.prompt;
    this.shown = false;
    this.o.line(l);
  }

  private showPartial(l: Line): void {
    this.shown = l.text !== '';
    this.o.partial(l);
  }

  private clearShown(ts: number): void {
    if (!this.shown) return;
    this.showPartial({ text: '', runs: [], tags: [], prompt: false, raw: '', ts });
  }

  private updateWatching(): void {
    this.watching = this.known.length > 0 || this.hold !== null || this.after !== null;
  }
}

/** The lines without the sentinels. The end may be cut over several lines. */
function between(body: readonly string[], start: string, end: string): string[] {
  const out = body.slice();
  let cut = end.length;
  while (out.length > 0 && cut > 0) {
    const s = out.pop()!.trimEnd();
    if (s.length > cut) out.push(s.slice(0, -cut));
    cut -= s.length;
  }
  if (out.length > 0) out[0] = out[0]!.slice(start.length);
  return out;
}
