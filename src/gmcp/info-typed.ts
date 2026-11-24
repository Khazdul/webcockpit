// What the player sees: the answers to their own `stat`, `info`/`inf` and
// `info <format>` read into the card's info model (stage 77 F1, ADR 0166
// addendum 18 point 96). Pure TS, no DOM.
//
// - A command arms a reader (`TypedInfoReader.sent`, the sent text after
//   aliases); nothing is read without one. A reader waits `READ_WINDOW_MS`
//   for its answer (a command can be queued behind a cast), then is
//   dropped. While none waits a line costs one length check.
// - The answer is a paragraph: the lines up to an empty line or a prompt
//   (MUME puts an empty line after each answer, and a prompt ends the
//   pulse). A paragraph is joined with spaces, as the answer wraps at the
//   window's width in a space's place, and read from the line where the
//   answer starts (a line from someone else may come before it).
// - `stat`: `OB: 50%, DB: 18%, PB: 60%, Armour: 38%. Wimpy: 204. Mood:
//   wimpy.` then `Needed: … Gold: 82. Alert: normal.` OB, DB, PB, armour,
//   wimpy and the gold coins (silver and copper are not in it).
// - `info`/`inf`: the block from `You are a male|female <race>.` Every
//   sentence the card shows whose form is the poll's own; not the citizen
//   (`You are welcome in Goblin-town.` against `%c`'s `GoblinTown`) nor the
//   war fame (a sentence, not `%K`'s word).
// - `info <format>`: MUME prints the format with the codes filled in. The
//   format's literal text is matched, anchored, against the paragraph, and
//   each code of INFO_FIELDS is read as the poll reads it. Anything else
//   (no match, an unreadable value, two codes with nothing between them)
//   reads nothing.
// - Only `stat`, `info` and `inf` as the first word, any case. `sta` is
//   `stand`, so no abbreviation of `stat` is taken.

import { ABILITIES, type Ability } from './age';
import { stripAnsi } from './comm';
import {
  INFO_FIELDS,
  type InfoAnswer,
  type InfoKey,
  alignmentOf,
  heightOf,
  purseOf,
  readInfoField,
  weightOf,
  wordsToNumber,
} from './info-answer';

/** A reader waits this long for its answer. */
export const READ_WINDOW_MS = 10_000;
/** Readers waiting at once; the oldest goes first. */
export const MAX_READERS = 4;
/** Lines in one paragraph at most (a plain `info` is about 20). */
export const MAX_PARAGRAPH = 60;

type Scalars = Omit<InfoAnswer, 'abilities'>;

/** What one answer gave: only what was read. */
export type InfoRead = Partial<Scalars> & {
  abilities?: Partial<Record<Ability, { current?: number; unaffected?: number }>>;
  /** `stat`'s gold coins: the purse's gold, its silver and copper kept. */
  gold?: number;
};

/** A typed command whose answer is read. */
export type TypedCommand = { kind: 'stat' } | { kind: 'info' } | { kind: 'format'; format: CompiledFormat };

/** The command's kind, or null when its answer is not read. */
export function typedInfoCommand(text: string): TypedCommand | null {
  const t = text.trim();
  const sp = t.search(/\s/);
  const word = (sp < 0 ? t : t.slice(0, sp)).toLowerCase();
  const rest = sp < 0 ? '' : t.slice(sp).trim();
  if (word === 'stat') return rest === '' ? { kind: 'stat' } : null;
  if (word !== 'info' && word !== 'inf') return null;
  if (rest === '') return { kind: 'info' };
  const format = compileFormat(rest);
  return format ? { kind: 'format', format } : null;
}

// ------------------------------------------------------------------ stat

const NUM = '([+-]?\\d+)';
const STAT_RE = new RegExp(
  `^OB: ${NUM}%, DB: ${NUM}%, PB: ${NUM}%, Armour: ${NUM}%\\. Wimpy: (\\d+)\\. Mood: [^.]+\\.` +
    '(?: Needed: [\\d,]+ xp, [\\d,]+ tp\\. Gold: (\\d{1,3}(?:,\\d{3})+|\\d+)\\.)?',
);

/** A `stat` answer from its paragraph, or null. */
export function parseStat(lines: readonly string[]): InfoRead | null {
  const i = lines.findIndex((l) => l.startsWith('OB: '));
  if (i < 0) return null;
  const m = STAT_RE.exec(joined(lines.slice(i)));
  if (!m) return null;
  const out: InfoRead = { ob: Number(m[1]), db: Number(m[2]), pb: Number(m[3]), abs: Number(m[4]), wimpy: Number(m[5]) };
  if (m[6] !== undefined) out.gold = Number(m[6].replaceAll(',', ''));
  return out;
}

// ------------------------------------------------------------ plain info

const SEX_START = /^You are an? (?:male|female) [^.]+\.$/;
/** A sentence's start: the text's or after a sentence's end. */
const S = '(?:^|[.!] )';

const PLAIN = {
  bonus: new RegExp(`${S}Offensive Bonus: ${NUM}%, Dodging Bonus: ${NUM}%, Parrying Bonus: ${NUM}%\\.`),
  armour: new RegExp(`${S}Your armour provides an average protection of ${NUM}%\\.`),
  level: new RegExp(`${S}This ranks you as [^.!]+? \\(level ${NUM}\\)\\.`),
  age: new RegExp(`${S}You are (\\d+) years?(?:, (\\d+) months?)?(?:,? and (\\d+) days?)? old\\.`),
  body: new RegExp(`${S}You are ([^.!]+?) and weigh ([^.!]+?)\\.`),
  senses: new RegExp(`${S}Perception: vision ${NUM}, hearing ${NUM}, smell ${NUM}\\.`),
  // The sentence after the perception's is the alignment (`%q`'s text).
  alignment: /Perception: [^.]+\. Alertness: [^.]+\. (You are [^.!]+[.!])/,
  load: new RegExp(`${S}Your equipment weighs ([^.!]+?) pounds?\\. (.+?) Your base abilities are: `),
  abilities: new RegExp(`${S}Your base abilities are: ([^.]+)\\.`),
  wimpy: new RegExp(`${S}Your mood is [^.]+\\. You will flee if your hit points go below (\\d+)\\.`),
  have: /(?:^|[.!] )You have ([^.!]+)\./g,
} as const;

const ABILITY = /^(Str|Int|Wis|Dex|Con|Wil|Per):(\d+)(?:\((\d+)\))?$/;

/** A plain `info` answer from its paragraph, or null. */
export function parsePlainInfo(lines: readonly string[]): InfoRead | null {
  const i = lines.findIndex((l) => SEX_START.test(l));
  if (i < 0) return null;
  const t = joined(lines.slice(i));
  const bonus = PLAIN.bonus.exec(t);
  if (!bonus) return null;
  const out: InfoRead = { ob: Number(bonus[1]), db: Number(bonus[2]), pb: Number(bonus[3]) };
  let m: RegExpExecArray | null;
  if ((m = PLAIN.armour.exec(t))) out.abs = Number(m[1]);
  if ((m = PLAIN.level.exec(t))) out.level = Number(m[1]);
  if ((m = PLAIN.age.exec(t))) {
    out.years = Number(m[1]);
    out.months = m[2] === undefined ? 0 : Number(m[2]);
    out.days = m[3] === undefined ? 0 : Number(m[3]);
  }
  if ((m = PLAIN.body.exec(t))) {
    const height = heightOf(m[1]!);
    const weight = weightOf(m[2]!);
    if (height) out.height = height;
    if (weight) out.weight = weight;
  }
  if ((m = PLAIN.senses.exec(t))) {
    out.vision = Number(m[1]);
    out.hearing = Number(m[2]);
    out.smell = Number(m[3]);
  }
  if ((m = PLAIN.alignment.exec(t)) && !/^You are welcome /.test(m[1]!)) {
    const a = alignmentOf(m[1]!);
    if (a) out.alignment = a;
  }
  if ((m = PLAIN.load.exec(t))) {
    const pounds = wordsToNumber(m[1]!);
    if (pounds !== null) out.carrying = pounds;
    out.load = m[2]!.trim();
  }
  if ((m = PLAIN.abilities.exec(t))) {
    const abilities = abilitiesOf(m[1]!);
    if (abilities) out.abilities = abilities;
  }
  if ((m = PLAIN.wimpy.exec(t))) out.wimpy = Number(m[1]);
  for (const h of t.matchAll(PLAIN.have)) {
    const purse = purseOf(h[1]!);
    if (purse) {
      out.purse = purse;
      break;
    }
  }
  return out;
}

/** `Str:18(16) Int:16 …`: current, then unaffected when it differs. All seven or null. */
function abilitiesOf(s: string): InfoRead['abilities'] | null {
  const out: NonNullable<InfoRead['abilities']> = {};
  for (const part of s.trim().split(' ')) {
    const m = ABILITY.exec(part);
    if (!m) return null;
    const current = Number(m[2]);
    out[m[1]!.toLowerCase() as Ability] = { current, unaffected: m[3] === undefined ? current : Number(m[3]) };
  }
  return ABILITIES.every((a) => out[a] !== undefined) ? out : null;
}

// ---------------------------------------------------------------- format

export interface CompiledFormat {
  re: RegExp;
  /** Each capture's field, or null for a code the card does not use. */
  keys: (InfoKey | null)[];
}

const CODES: ReadonlyMap<string, InfoKey> = new Map(INFO_FIELDS.map((f) => [f.code.slice(1), f.key]));

/**
 * A player's format as a matcher of its answer, or null when it reads
 * nothing: no code the card uses, or two codes with no text between them.
 * `%%` is a `%`, `%.` a line break, `%(`, `%)` and `%,` print nothing.
 */
export function compileFormat(format: string): CompiledFormat | null {
  let re = '';
  let literal = '';
  const keys: (InfoKey | null)[] = [];
  /** A capture with no literal after it yet. */
  let open = false;
  const flush = (): void => {
    const text = literal.replace(/\s+/g, ' ');
    if (text !== '') {
      re += escapeRe(text);
      open = false;
    }
    literal = '';
  };
  for (let i = 0; i < format.length; i++) {
    const c = format[i]!;
    if (c !== '%' || i === format.length - 1) {
      literal += c;
      continue;
    }
    const code = format[++i]!;
    if (code === '%') literal += '%';
    else if (code === '.') literal += ' ';
    else if (code === '(' || code === ')' || code === ',') continue;
    else {
      flush();
      if (open) return null;
      re += '(.*?)';
      keys.push(CODES.get(code) ?? null);
      open = true;
    }
  }
  flush();
  if (!keys.some((k) => k !== null)) return null;
  // The answer is read trimmed, so is the format.
  return { re: new RegExp(`^${re.trim()}$`), keys };
}

/** An `info <format>` answer from its paragraph, or null. */
export function parseFormatAnswer(f: CompiledFormat, lines: readonly string[]): InfoRead | null {
  for (let i = 0; i < lines.length; i++) {
    const m = f.re.exec(joined(lines.slice(i)));
    if (!m) continue;
    const out: Record<string, unknown> = {};
    const abilities: NonNullable<InfoRead['abilities']> = {};
    for (let k = 0; k < f.keys.length; k++) {
      const key = f.keys[k];
      if (!key) continue;
      const v = readInfoField(key, m[k + 1]!.trim());
      if (v === null) return null;
      if (key === 'unaffected') {
        for (const a of ABILITIES) abilities[a] = { ...abilities[a], unaffected: (v as Record<Ability, number>)[a] };
      } else if ((ABILITIES as readonly string[]).includes(key)) {
        abilities[key as Ability] = { ...abilities[key as Ability], current: v as number };
      } else out[key] = v;
    }
    if (Object.keys(abilities).length > 0) out.abilities = abilities;
    return out as InfoRead;
  }
  return null;
}

// ---------------------------------------------------------------- reader

/** The paragraph's text: SGR stripped, joined at the wraps, one space each. */
function joined(lines: readonly string[]): string {
  return stripAnsi(lines.join(' ')).replace(/\s+/g, ' ').trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A command's answer read, or null. */
export function readAnswer(c: TypedCommand, lines: readonly string[]): InfoRead | null {
  if (c.kind === 'stat') return parseStat(lines);
  if (c.kind === 'info') return parsePlainInfo(lines);
  return parseFormatAnswer(c.format, lines);
}

export interface TypedInfoReaderOptions {
  /** Wall clock in ms. */
  now(): number;
  /** An answer was read. */
  read(r: InfoRead): void;
}

/** Ties the player's commands to their answers (see the file header). */
export class TypedInfoReader {
  private waiting: { cmd: TypedCommand; at: number }[] = [];
  private paragraph: string[] = [];

  constructor(private readonly o: TypedInfoReaderOptions) {}

  /** A command the player sent (after aliases). */
  sent(text: string): void {
    const cmd = typedInfoCommand(text);
    if (!cmd) return;
    if (this.waiting.length === 0) this.paragraph = [];
    this.waiting.push({ cmd, at: this.o.now() });
    if (this.waiting.length > MAX_READERS) this.waiting.shift();
  }

  /** A completed game line (plain text), shown to the player. */
  line(l: { text: string; prompt: boolean }): void {
    if (this.waiting.length === 0) return;
    if (l.prompt || l.text.trim() === '') return this.end();
    if (this.paragraph.length >= MAX_PARAGRAPH) this.paragraph.shift();
    this.paragraph.push(l.text);
  }

  /** Forgets every reader (a new connection, another character). */
  reset(): void {
    this.waiting = [];
    this.paragraph = [];
  }

  /** Readers waiting (tests). */
  get pending(): number {
    return this.waiting.length;
  }

  private end(): void {
    const lines = this.paragraph;
    this.paragraph = [];
    const now = this.o.now();
    this.waiting = this.waiting.filter((w) => now - w.at <= READ_WINDOW_MS);
    if (lines.length === 0) return;
    for (let i = 0; i < this.waiting.length; i++) {
      const r = readAnswer(this.waiting[i]!.cmd, lines);
      if (r === null) continue;
      this.waiting.splice(i, 1);
      this.o.read(r);
      return;
    }
  }
}
