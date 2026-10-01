// tt++ syntax for the editor view (Inv §5.7): a purely lexical, single-pass
// tokenizer with no whitelist of command names, and the structural brace
// scan behind brace matching and the balance indicator. No DOM; unit tested.
//
// Classes (colours in editor.css, tokens --c-syn-*):
//   cmd    `#word` in command position (line start, after `{` or `;`)
//   brace  `{` `}` not inside `${…}` and not escaped
//   delim  `;`
//   var    `$id`, `${…}` (one line), `&id`, `%<digits>`, `%` + one of .+*?^$|()[]
//   code   `<088>`-style colour codes, `\` escapes (`\n`, `\xFF`, `\u{…}`, `\{`)
// A `cmd` token whose word resolves to an inert or unsupported command
// carries that command's hint.

import { resolveCommand, scriptCommandArgs } from '../script/commands';

export type TokenClass = 'cmd' | 'brace' | 'delim' | 'var' | 'code';

export interface Token {
  from: number;
  to: number;
  cls: TokenClass;
  /** For `cmd`: the hint of an inert or unsupported command. */
  hint?: string;
}

const isIdStart = (c: number): boolean => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
const isIdChar = (c: number): boolean => isIdStart(c) || (c >= 48 && c <= 57);
const isDigit = (c: number): boolean => c >= 48 && c <= 57;
const isHex = (c: number): boolean => isDigit(c) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
const isSpace = (c: number): boolean => c === 32 || c === 9;

const PCT_SPECIAL = '.+*?^$|()[]';
const COLOUR_CODE = /^<(?:[0-9a-zA-Z]{3}|[FB][0-9a-fA-F]{3}|[FB][0-9a-fA-F]{6}|[gG][0-9]{2})>/;

/** Length of a `\` escape at `i` (the backslash included), at least 2 when a char follows. */
function escapeLen(s: string, i: number): number {
  const n = s.charCodeAt(i + 1);
  if (Number.isNaN(n)) return 1;
  const ch = s[i + 1];
  let j = i + 2;
  const hexRun = (max: number): number => {
    let k = 0;
    while (k < max && isHex(s.charCodeAt(j + k))) k++;
    return k;
  };
  if (ch === 'x') {
    const k = hexRun(2);
    return k === 2 ? 4 : 2;
  }
  if (ch === 'u') {
    if (s[j] === '{') {
      const close = s.indexOf('}', j);
      return close > j ? close - i + 1 : 2;
    }
    const k = hexRun(4);
    return k === 4 ? 6 : 2;
  }
  if (ch === 'U') {
    const k = hexRun(6);
    return k === 6 ? 8 : 2;
  }
  return 2;
}

/** End of a `${…}` starting at `i` (the `$`) on this line, or -1. */
function dollarBraceEnd(s: string, i: number): number {
  if (s.charCodeAt(i + 1) !== 0x7b) return -1;
  for (let j = i + 2; j < s.length; j++) {
    const c = s.charCodeAt(j);
    if (c === 0x0a) return -1;
    if (c === 0x7d) return j + 1;
  }
  return -1;
}

/** Tokens of one line (no line breaks inside). Plain text makes no token. */
export function tokenizeLine(s: string): Token[] {
  const out: Token[] = [];
  let cmdPos = true;
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s.charCodeAt(i);
    if (isSpace(c)) {
      i++;
      continue;
    }
    const wasCmdPos = cmdPos;
    cmdPos = false;
    if (c === 0x23 /* # */ && wasCmdPos && isIdStart(s.charCodeAt(i + 1))) {
      let j = i + 1;
      while (j < n && isIdChar(s.charCodeAt(j))) j++;
      const tok: Token = { from: i, to: j, cls: 'cmd' };
      const res = resolveCommand(s.slice(i + 1, j));
      if (res && res !== 'ambiguous' && res.inert && res.hint && !scriptCommandArgs(res.name, restOfCommand(s, j))) tok.hint = res.hint;
      out.push(tok);
      i = j;
      continue;
    }
    if (c === 0x7b /* { */ || c === 0x7d /* } */) {
      out.push({ from: i, to: i + 1, cls: 'brace' });
      if (c === 0x7b) cmdPos = true;
      i++;
      continue;
    }
    if (c === 0x3b /* ; */) {
      out.push({ from: i, to: i + 1, cls: 'delim' });
      cmdPos = true;
      i++;
      continue;
    }
    if (c === 0x5c /* \ */) {
      const len = escapeLen(s, i);
      out.push({ from: i, to: i + len, cls: 'code' });
      i += len;
      continue;
    }
    if (c === 0x24 /* $ */) {
      const end = dollarBraceEnd(s, i);
      if (end > 0) {
        out.push({ from: i, to: end, cls: 'var' });
        i = end;
        continue;
      }
      if (isIdStart(s.charCodeAt(i + 1))) {
        let j = i + 1;
        while (j < n && isIdChar(s.charCodeAt(j))) j++;
        out.push({ from: i, to: j, cls: 'var' });
        i = j;
        continue;
      }
    }
    if (c === 0x26 /* & */ && isIdStart(s.charCodeAt(i + 1))) {
      let j = i + 1;
      while (j < n && isIdChar(s.charCodeAt(j))) j++;
      out.push({ from: i, to: j, cls: 'var' });
      i = j;
      continue;
    }
    if (c === 0x25 /* % */) {
      if (isDigit(s.charCodeAt(i + 1))) {
        let j = i + 1;
        while (j < n && isDigit(s.charCodeAt(j))) j++;
        out.push({ from: i, to: j, cls: 'var' });
        i = j;
        continue;
      }
      if (i + 1 < n && PCT_SPECIAL.includes(s[i + 1]!)) {
        out.push({ from: i, to: i + 2, cls: 'var' });
        i += 2;
        continue;
      }
    }
    if (c === 0x3c /* < */) {
      const m = COLOUR_CODE.exec(s.slice(i, i + 9));
      if (m) {
        out.push({ from: i, to: i + m[0].length, cls: 'code' });
        i += m[0].length;
        continue;
      }
    }
    i++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Structural braces
// ---------------------------------------------------------------------------

export interface BraceScan {
  /** Every structural brace that has a partner, both ways. */
  pairs: Map<number, number>;
  /** `{` left open at the end. */
  unclosed: number;
  /** `}` without an opener. */
  stray: number;
}

/**
 * Scans the structural braces of a whole text: `\` escapes the next
 * character (except a line break) and `${…}` on one line is a variable,
 * as in the tokenizer.
 */
export function scanBraces(text: string): BraceScan {
  const pairs = new Map<number, number>();
  const open: number[] = [];
  let stray = 0;
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x5c) {
      const d = text.charCodeAt(i + 1);
      if (d !== 0x0a && d !== 0x0d) i++;
    } else if (c === 0x24) {
      const end = dollarBraceEnd(text, i);
      if (end > 0) i = end - 1;
    } else if (c === 0x7b) {
      open.push(i);
    } else if (c === 0x7d) {
      const o = open.pop();
      if (o === undefined) stray++;
      else {
        pairs.set(o, i);
        pairs.set(i, o);
      }
    }
  }
  return { pairs, unclosed: open.length, stray };
}

/**
 * The brace next to the cursor and its partner (the one after the cursor
 * first, then the one before), or null when neither is a matched
 * structural brace.
 */
export function braceMatchAt(scan: BraceScan, text: string, pos: number): [number, number] | null {
  for (const p of [pos, pos - 1]) {
    if (p < 0 || p >= text.length) continue;
    const c = text.charCodeAt(p);
    if (c !== 0x7b && c !== 0x7d) continue;
    const q = scan.pairs.get(p);
    if (q !== undefined) return [p, q];
  }
  return null;
}

/** The footer's balance segment: `3 unclosed {`, `2 stray }`, both, or ''. */
export function balanceText(scan: Pick<BraceScan, 'unclosed' | 'stray'>): string {
  const parts: string[] = [];
  if (scan.unclosed > 0) parts.push(`${scan.unclosed} unclosed {`);
  if (scan.stray > 0) parts.push(`${scan.stray} stray }`);
  return parts.join('  ·  ');
}

/** The text of the command from `from` up to a `;` outside braces (or the end of the line). */
function restOfCommand(s: string, from: number): string {
  let depth = 0;
  for (let i = from; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x5c) i++;
    else if (c === 0x7b) depth++;
    else if (c === 0x7d) depth--;
    else if (c === 0x3b && depth <= 0) return s.slice(from, i);
  }
  return s.slice(from);
}
