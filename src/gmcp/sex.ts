// The character's sex (stage 77 part E2). GMCP has none and `info`'s
// format has no code for it: only a plain `info` prints it, as its first
// line, `You are a male Tarkhnarb Orc.` (the race text is GMCP's subrace).
// Pure TS but for the injected storage.
//
// - `parseSexLine`: that line, ANSI or not. With the GMCP race given, the
//   race in the line must be the character's own (a passive read of game
//   text: a say or an emote cannot forge it unless it is exactly that).
// - `SexMemory`: the last sex seen per character name, in `localStorage`
//   `wc.charSex.v1` (a JSON object, lower-case name → sex), the most
//   recently written last, at most `SEX_MEMORY_CAP` names. Every read and
//   write is guarded: blocked storage or a broken value remembers nothing.
//   A name can also hold `unknown`: its probe failed (MUME's pager, say),
//   so it is never probed again; a typed `info` still sets the sex.

import { stripAnsi } from './comm';

/** The character's sex. */
export type Sex = 'male' | 'female';

export const SEX_KEY = 'wc.charSex.v1';
/** The most names remembered: the oldest written goes first. */
export const SEX_MEMORY_CAP = 64;

/** The start every such line has: a cheap test before `parseSexLine`. */
export const SEX_LINE_START = 'You are a ';

const SEX_LINE = /^You are a (male|female) (.+?)\.\s*$/;

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase();

/**
 * The sex in `You are a male|female <race>.`, or null. With `race`, the
 * line's race must be its subrace or race (case and diacritics aside).
 */
export function parseSexLine(text: string, race?: { race: string | null; subrace: string | null } | null): Sex | null {
  const m = SEX_LINE.exec(stripAnsi(text));
  if (!m) return null;
  if (race) {
    const said = fold(m[2]!);
    const own = [race.subrace, race.race].filter((r): r is string => typeof r === 'string' && r.trim() !== '').map(fold);
    if (!own.includes(said)) return null;
  }
  return m[1] as Sex;
}

/** No prototype: a stored `__proto__` is a name like any other. */
const empty = (): Record<string, Kept> => Object.create(null) as Record<string, Kept>;

const isSex = (v: unknown): v is Sex => v === 'male' || v === 'female';

/** What a name holds: a sex, or `unknown` after a failed probe. */
type Kept = Sex | 'unknown';
const isKept = (v: unknown): v is Kept => isSex(v) || v === 'unknown';

export class SexMemory {
  constructor(private readonly storage: Storage | null) {}

  /** The sex remembered for `name`, or null. */
  get(name: string): Sex | null {
    const v = this.read()[name.toLowerCase()];
    return isSex(v) ? v : null;
  }

  /** The probe failed for `name` and no sex is known: it is not probed again. */
  failed(name: string): boolean {
    return this.read()[name.toLowerCase()] === 'unknown';
  }

  /** Remembers that `name`'s probe failed, unless its sex is known. */
  setFailed(name: string): void {
    if (this.get(name) === null) this.write(name, 'unknown');
  }

  /** Remembers `sex` for `name`, as the most recent. */
  set(name: string, sex: Sex): void {
    this.write(name, sex);
  }

  private write(name: string, sex: Kept): void {
    if (!this.storage) return;
    const all = this.read();
    const key = name.toLowerCase();
    delete all[key];
    all[key] = sex;
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - SEX_MEMORY_CAP))) delete all[k];
    try {
      this.storage.setItem(SEX_KEY, JSON.stringify(all));
    } catch {
      // Full or blocked: the sex is known for this page only.
    }
  }

  private read(): Record<string, Kept> {
    let raw: string | null = null;
    try {
      raw = this.storage?.getItem(SEX_KEY) ?? null;
    } catch {
      return empty();
    }
    if (!raw) return empty();
    try {
      const v: unknown = JSON.parse(raw);
      if (!v || typeof v !== 'object' || Array.isArray(v)) return empty();
      const out: Record<string, Kept> = empty();
      for (const [k, s] of Object.entries(v)) if (isKept(s)) out[k] = s;
      return out;
    } catch {
      return empty();
    }
  }
}
