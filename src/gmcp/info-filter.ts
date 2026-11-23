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
//
// The sex probe (stage 77 part E2) is a second kind: three `info`s sent
// with the login poll, answered in the same pulse, each answer between
// blank lines:
//
//   WC<nonce>{                          held, the start: a line of its own
//   You are a male Tarkhnarb Orc.       a plain `info`, about 25 lines
//   …
//   }WC<nonce>                          the end: the first sex line is read
//
// Held, hidden and put back by the same rules as the fields' answer. No
// sex line between the sentinels is a failure.
//
// The login's width commands (Session's PLAYING_COMMANDS) are answered
// `Ok.` each, two stray lines at every login. `expectOk` arms the filter
// for that many when the game is entered:
//
//   Ok.                                 hidden, like a finished answer
//   ␍␊                                  hidden: the blank line after
//   Ok.                                 hidden
//   ␍␊                                  hidden
//   <prompt>o&gt;</prompt> GA           hidden: the pulse showed nothing else
//
// - Only a whole line that is `Ok.` and nothing else, not a prompt; other
//   lines between pass and do not disarm. A partial that can still become
//   `Ok.` waits for its line.
// - Disarmed after the count, on `dropOk` (another `conn.state`), on `reset`
//   and OK_MS after arming: a later `Ok.` is the player's own and shows.

import type { Line } from '../core/types';
import type { Scheduler } from '../script/engine/timers';
import { INFO_FIELDS, INFO_SEPARATOR, type InfoAnswer, parseInfoAnswer } from './info-answer';
import { type Sex, parseSexLine } from './sex';

/** How long lines are held after a start sentinel. */
export const HOLD_MS = 2000;
/** The most lines held. A whole answer at 20 columns is about 30. */
export const MAX_LINES = 80;
/** The most unanswered polls that are still recognised. */
export const MAX_KNOWN = 8;

/** How long after entering the game its width commands' `Ok.`s are hidden. */
export const OK_MS = 5000;
/** The width commands' answer. */
const OK = 'Ok.';

/** Every sentinel has it, in capitals as part A sent it. */
const MARK = 'WC';
const PAGER = /\*\*\* Return: continue\b/;
/** The line editor's place marker, the line over its `:` prompt. */
const EDITOR_MARK = '==>';

/** What a poll asks: the fields (`infoCommand`) or the sex (`sexProbeCommand`). */
export type PollKind = 'fields' | 'sex';

export const startSentinel = (nonce: string, kind: PollKind = 'fields'): string => `${MARK}${nonce}${kind === 'sex' ? '{' : '['}`;
export const endSentinel = (nonce: string, kind: PollKind = 'fields'): string => `${kind === 'sex' ? '}' : ']'}${MARK}${nonce}`;

/** The poll's command. ASCII (ADR 0166 point 1). */
export function infoCommand(nonce: string): string {
  return `info ${startSentinel(nonce)}${INFO_FIELDS.map((f) => f.code).join(INFO_SEPARATOR)}${endSentinel(nonce)}`;
}

/** The sex probe's command: a plain `info` between two sentinel `info`s, three lines. ASCII. */
export function sexProbeCommand(nonce: string): string {
  return [`info ${startSentinel(nonce, 'sex')}`, 'info', `info ${endSentinel(nonce, 'sex')}`].join('\r\n');
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
  /** A sex probe's answer was taken out. */
  foundSex(nonce: string, sex: Sex): void;
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
  private known: { nonce: string; kind: PollKind; start: string }[] = [];
  /** The answer being held. */
  private hold: { nonce: string; kind: PollKind; end: string; lines: Line[]; body: string[]; tail: string; timer: unknown } | null = null;
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
  /** `Ok.` lines still to hide, until `okUntil` (scheduler time). */
  private okLeft = 0;
  private okUntil = 0;

  constructor(private readonly o: InfoFilterOptions) {}

  /** A poll was sent: its answer is hidden however late it comes. */
  expect(nonce: string, kind: PollKind = 'fields'): void {
    this.watch();
    this.known.push({ nonce, kind, start: startSentinel(nonce, kind) });
    if (this.known.length > MAX_KNOWN) this.known.shift();
  }

  /** The game was entered: the next `count` lines of `Ok.` in OK_MS are hidden. */
  expectOk(count: number): void {
    if (count <= 0) return this.dropOk();
    this.watch();
    this.okLeft = count;
    this.okUntil = this.o.scheduler.now() + OK_MS;
  }

  /** No more `Ok.` is hidden. */
  dropOk(): void {
    if (this.okLeft === 0) return;
    this.okLeft = 0;
    const partial = this.hold ? null : this.keptPartial;
    if (partial) this.takePartial(partial);
    this.updateWatching();
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
    this.okLeft = 0;
    this.partialOpen = this.watching = false;
    for (const l of lines) this.show(l);
    if (partial) this.showPartial(partial);
  }

  private takeLine(l: Line): void {
    this.keptPartial = null;
    if (this.hold) return this.holdLine(l);
    const poll = this.startOf(l.text);
    if (poll) {
      this.begin(poll, l.ts);
      return this.holdLine(l);
    }
    if (this.isOk(l)) {
      // A blank line before it would have been its own (the one before an answer).
      this.before = null;
      if (--this.okLeft === 0) this.updateWatching();
      this.after = 'blank';
      return this.clearShown(l.ts);
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
      if (poll) this.begin(poll, l.ts);
      if (poll || this.maybeStart(l.text) || this.maybeOk(l) || (this.after && !this.pulseShown && isPromptTagged(l))) {
        this.keptPartial = l;
        return;
      }
      this.flushBefore();
    }
    this.keptPartial = null;
    this.showPartial(l);
  }

  private startOf(text: string): { nonce: string; kind: PollKind; start: string } | null {
    if (!text.startsWith(MARK)) return null;
    return this.known.find((k) => text.startsWith(k.start)) ?? null;
  }

  /** An unfinished line that can still become a start sentinel. */
  private maybeStart(text: string): boolean {
    return this.known.some((k) => k.start.startsWith(text));
  }

  /** Armed for the width commands' `Ok.` and still in time. */
  private okArmed(): boolean {
    if (this.okLeft > 0 && this.o.scheduler.now() >= this.okUntil) this.okLeft = 0;
    return this.okLeft > 0;
  }

  private isOk(l: Line): boolean {
    return this.okArmed() && !l.prompt && !isPromptTagged(l) && l.text.trim() === OK;
  }

  /** An unfinished line that can still become `Ok.`. */
  private maybeOk(l: Line): boolean {
    const text = l.text.trim();
    return text !== '' && OK.startsWith(text) && !isPromptTagged(l) && this.okArmed();
  }

  private begin(poll: { nonce: string; kind: PollKind }, ts: number): void {
    const { nonce, kind } = poll;
    this.known = this.known.filter((k) => k.nonce !== nonce || k.kind !== kind);
    const lines = this.before ? [this.before] : [];
    this.before = this.after = null;
    this.clearShown(ts);
    const timer = this.o.scheduler.set(() => {
      this.fail();
      this.updateWatching();
    }, HOLD_MS);
    this.hold = { nonce, kind, end: endSentinel(nonce, kind), lines, body: [], tail: '', timer };
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
    const body = between(h.body, startSentinel(h.nonce, h.kind), h.end);
    let done: (() => void) | null = null;
    if (h.kind === 'sex') {
      const sex = firstSex(body);
      if (sex !== null) done = () => this.o.foundSex(h.nonce, sex);
    } else {
      const answer = parseInfoAnswer(body);
      if (answer) done = () => this.o.found(h.nonce, answer);
    }
    if (!done) return this.fail();
    this.o.scheduler.clear(h.timer);
    this.hold = this.keptPartial = null;
    this.after = 'blank';
    done();
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

  private watch(): void {
    if (!this.watching) {
      this.pulseShown = this.last !== null && !this.last.prompt;
      this.shown = this.partialOpen;
    }
    this.watching = true;
  }

  private updateWatching(): void {
    this.watching = this.known.length > 0 || this.hold !== null || this.after !== null || this.okArmed();
  }
}

/** The sex of a plain `info`'s first sex line, or null. It is bracketed: no race check. */
function firstSex(lines: readonly string[]): Sex | null {
  for (const l of lines) {
    const sex = parseSexLine(l);
    if (sex !== null) return sex;
  }
  return null;
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
