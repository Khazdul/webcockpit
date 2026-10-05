// Shared pieces of the foreign import translators (ADR 0073): the output
// collector, `#nop` escaping, statement scanning and regex → pattern.
// Pure code, no DOM.

import { checkBraces } from '../script/doc';
import type { ImportItem, ImportOutcome } from './types';

/** One decoded input file. */
export interface SourceFile {
  /** Base name. */
  name: string;
  text: string;
}

/** One top-level statement of a source file. */
export interface Statement {
  file: string;
  /** 1-based line of its first line. */
  line: number;
  /** The text as read, without the final line break. */
  text: string;
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/** Base name of a path (`/`, `\` separators). */
export function baseName(path: string): string {
  const parts = path.trim().split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

/** True when the text ends in an odd run of backslashes (it would escape what follows). */
function endsInEscape(text: string): boolean {
  let n = 0;
  for (let i = text.length - 1; i >= 0 && text[i] === '\\'; i--) n++;
  return n % 2 === 1;
}

/**
 * Text made safe to sit inside `{…}`: unchanged when its braces balance,
 * else every unescaped brace is written `\{` / `\}`. A trailing lone
 * backslash gets a space so it does not escape the closing brace.
 */
export function braceSafe(text: string): string {
  let t = text;
  if (!checkBraces(t).ok) {
    let s = '';
    for (let i = 0; i < t.length; i++) {
      const c = t[i]!;
      if (c === '\\' && i + 1 < t.length) {
        s += c + t[i + 1];
        i++;
      } else if (c === '{' || c === '}') s += '\\' + c;
      else s += c;
    }
    t = s;
  }
  if (endsInEscape(t)) t += ' ';
  return t;
}

/**
 * tt++'s brace rule (src/files.c `read_file`, src/parse.c
 * `get_arg_in_braces`): every `{` and `}` counts, a backslash never
 * escapes one. True when the braces balance that way.
 */
export function ttBraceBalanced(text: string): boolean {
  let depth = 0;
  for (const c of text) {
    if (c === '{') depth++;
    else if (c === '}' && --depth < 0) return false;
  }
  return depth === 0;
}

/**
 * Rewrites tt++ text so it means the same under our brace rule, where `\`
 * escapes the next character: an odd run of backslashes before a brace
 * gets one more backslash (`\}` → `\\}`: a literal backslash, then the
 * brace that closes, as in tt++).
 */
export function ttBracesToOurs(text: string): string {
  return text.replace(/(?<!\\)((?:\\\\)*\\)(?=[{}])/g, '$1\\');
}

/** `#nop {text}` with the text made brace-safe. */
export function nopLine(text: string): string {
  return `#nop {${braceSafe(text)}}`;
}

/** `{text}` (the text is expected to balance). */
export function br(text: string): string {
  return `{${text}}`;
}

/** Index of the `}` matching the `{` at `open` (backslash escapes), or -1. */
export function matchBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') i++;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return -1;
}

/**
 * Splits a command list at top-level `sep` (default `;`), honouring
 * braces and backslash escapes. Parts are trimmed; empty parts dropped.
 */
export function splitList(text: string, sep = ';'): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') i++;
    else if (c === '{') depth++;
    else if (c === '}') {
      if (depth > 0) depth--;
    } else if (c === sep && depth === 0) {
      const part = text.slice(start, i).trim();
      if (part) out.push(part);
      start = i + 1;
    }
  }
  const last = text.slice(start).trim();
  if (last) out.push(last);
  return out;
}

/**
 * Reads brace-or-word arguments: `{…}` (braces removed, `braced` true)
 * or a whitespace-delimited word.
 */
export class Args {
  pos = 0;
  /** Whether the argument `next` returned last was braced. */
  lastBraced = false;
  constructor(readonly text: string) {}

  private skip(): void {
    while (this.pos < this.text.length && /\s/.test(this.text[this.pos]!)) this.pos++;
  }

  get done(): boolean {
    this.skip();
    return this.pos >= this.text.length;
  }

  get nextBraced(): boolean {
    this.skip();
    return this.text[this.pos] === '{';
  }

  /** The next argument, or '' at the end. */
  next(): string {
    this.skip();
    const t = this.text;
    this.lastBraced = false;
    if (this.pos >= t.length) return '';
    if (t[this.pos] === '{') {
      this.lastBraced = true;
      const end = matchBrace(t, this.pos);
      const s = end < 0 ? t.slice(this.pos + 1) : t.slice(this.pos + 1, end);
      this.pos = end < 0 ? t.length : end + 1;
      return s;
    }
    const start = this.pos;
    while (this.pos < t.length && !/\s/.test(t[this.pos]!) && t[this.pos] !== '{') {
      if (t[this.pos] === '\\') this.pos++;
      this.pos++;
    }
    return t.slice(start, Math.min(this.pos, t.length));
  }

  /** The unread rest, trimmed. */
  rest(): string {
    const s = this.text.slice(this.pos).trim();
    this.pos = this.text.length;
    return s;
  }

  /** All remaining arguments. */
  all(): string[] {
    const out: string[] = [];
    while (!this.done) out.push(this.next());
    return out;
  }
}

/** Splits `#word rest` (after the command char) into the word and the rest. */
export function splitCommand(text: string, cmdChar: string): { word: string; rest: string } | null {
  const t = text.trimStart();
  if (!t.startsWith(cmdChar)) return null;
  let i = cmdChar.length;
  while (i < t.length && !/[\s{};]/.test(t[i]!)) i++;
  return { word: t.slice(cmdChar.length, i), rest: t.slice(i) };
}

// ---------------------------------------------------------------------------
// Statement scanning (tt++ and JMC layout)
// ---------------------------------------------------------------------------

export interface ScanOptions {
  /** Command character (`#`). */
  cmdChar: string;
  /** Also join a following line that starts with `}` (JMC). */
  joinClose?: boolean;
  /** A line starting with this is a whole statement, braces or not (JMC `##`). */
  lineComment?: string;
}

/**
 * Splits brace-language text into statements: blank lines are left out;
 * a statement runs to the end of the line where its brace depth is back
 * to 0, plus following lines that start with `{` (or `}` with
 * `joinClose`) after blanks.
 */
export function scanStatements(file: SourceFile, opts: ScanOptions): Statement[] {
  const text = file.text;
  const out: Statement[] = [];
  let pos = 0;
  let line = 1;
  const n = text.length;
  while (pos < n) {
    const nl = text.indexOf('\n', pos);
    const le = nl < 0 ? n : nl;
    if (text.slice(pos, le).trim() === '') {
      pos = le + 1;
      line++;
      continue;
    }
    let depth = 0;
    let i = pos;
    let lines = 1;
    if (opts.lineComment && text.slice(pos, le).trimStart().startsWith(opts.lineComment)) {
      out.push({ file: file.name, line, text: text.slice(pos, le).replace(/\s+$/, '') });
      line++;
      pos = le + 1;
      continue;
    }
    for (; i < n; i++) {
      const c = text[i];
      if (c === '\\' && text[i + 1] !== '\n') i++;
      else if (c === '{') depth++;
      else if (c === '}') {
        if (depth > 0) depth--;
      } else if (c === '\n') {
        if (depth === 0) {
          let j = i + 1;
          while (j < n && (text[j] === ' ' || text[j] === '\t')) j++;
          const next = text[j];
          if (next !== '{' && !(opts.joinClose && next === '}')) break;
        }
        lines++;
      }
    }
    out.push({ file: file.name, line, text: text.slice(pos, Math.min(i, n)).replace(/\s+$/, '') });
    line += lines;
    pos = i + 1;
  }
  return out;
}

/**
 * The command character a file uses: the most common first character of
 * lines that look like `<punct><letter>`, `#` when none.
 */
export function detectCmdChar(text: string): string {
  const counts = new Map<string, number>();
  for (const l of text.split('\n')) {
    const m = /^\s*([!-/:-@[-`~])[A-Za-z]/.exec(l);
    if (m) counts.set(m[1]!, (counts.get(m[1]!) ?? 0) + 1);
  }
  let best = '#';
  let bestN = 0;
  for (const [c, k] of counts) {
    if (k > bestN) {
      best = c;
      bestN = k;
    }
  }
  return best;
}

/**
 * Replaces a non-`#` command character with `#` where a command starts:
 * at the start, and after `;` or `{` (blanks skipped).
 */
export function normaliseCmdChar(text: string, cmdChar: string): string {
  if (cmdChar === '#') return text;
  let out = '';
  let atStart = true;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '\\' && i + 1 < text.length) {
      out += c + text[i + 1];
      i++;
      atStart = false;
      continue;
    }
    if (atStart && c === cmdChar) {
      out += '#';
      atStart = false;
      continue;
    }
    if (c === ';' || c === '{') atStart = true;
    else if (!/\s/.test(c)) atStart = false;
    out += c;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Output collector
// ---------------------------------------------------------------------------

export interface ItemNote {
  reason?: string;
  warning?: string;
}

/** Collects the translated profile text and the report items, in source order. */
export class Out {
  readonly items: ImportItem[] = [];
  /** Translated lines (and tt++ lines kept in place), in source order. */
  readonly lines: string[] = [];
  /** Lines for the `--- Not translated ---` block. */
  readonly kept: string[] = [];
  readonly fileWarnings: string[] = [];
  /** Something was rewritten (tt++: the result differs from the input). */
  changed = false;
  private openClass: string | null = null;

  item(st: Statement, outcome: ImportOutcome, note: ItemNote = {}): void {
    const it: ImportItem = { file: st.file, line: st.line, source: st.text, outcome };
    if (note.reason) it.reason = note.reason;
    if (note.warning) it.warning = note.warning;
    this.items.push(it);
  }

  /**
   * Translated item: its output lines go in place. A line our engine would
   * reject (unbalanced braces) turns the item into a kept one: an import
   * never produces a profile `loadProfile` refuses.
   */
  translated(st: Statement, lines: string | string[], note: ItemNote = {}, group: string | null = null): void {
    const all = Array.isArray(lines) ? lines : [lines];
    if (!all.every((l) => checkBraces(l).ok)) {
      this.keep(st, 'Unbalanced braces after translation');
      return;
    }
    this.setClass(group);
    for (const l of all) this.lines.push(l);
    this.item(st, 'translated', note);
  }

  /** Kept foreign item: a `#nop {reason: text}` line in the not-translated block. */
  keep(st: Statement, reason: string, text = st.text): void {
    this.kept.push(nopLine(`${reason}: ${text}`));
    this.item(st, 'kept', { reason });
    this.changed = true;
  }

  /** Kept in place (tt++): the given text replaces the statement. */
  keepInPlace(st: Statement, reason: string, text = st.text): void {
    this.setClass(null);
    this.lines.push(checkBraces(text).ok ? text : nopLine(`${reason}: ${text}`));
    this.item(st, 'kept', { reason });
    if (text !== st.text) this.changed = true;
  }

  skip(st: Statement, reason: string): void {
    this.item(st, 'skipped', { reason });
    this.changed = true;
  }

  /** A line that is not an item (comment, blank, class markers); made safe if unbalanced. */
  raw(line: string): void {
    if (checkBraces(line).ok) this.lines.push(line);
    else {
      this.lines.push(nopLine(line));
      this.changed = true;
    }
  }

  /** Opens `#class {name}` around the following lines (null closes). */
  setClass(name: string | null): void {
    if (name === this.openClass) return;
    if (this.openClass !== null) this.lines.push(`#class {${this.openClass}} {close}`);
    if (name !== null) this.lines.push(`#class {${name}} {open}`);
    this.openClass = name;
  }

  warnFile(text: string): void {
    if (!this.fileWarnings.includes(text)) this.fileWarnings.push(text);
  }
}

// ---------------------------------------------------------------------------
// Regex → tt++ pattern
// ---------------------------------------------------------------------------

const POSIX: Record<string, string> = {
  alpha: 'A-Za-z',
  digit: '0-9',
  alnum: 'A-Za-z0-9',
  upper: 'A-Z',
  lower: 'a-z',
  space: '\\s',
  blank: ' \\t',
  punct: '!-\\/:-@\\[-`{-~',
  xdigit: '0-9A-Fa-f',
  word: '\\w',
  cntrl: '\\x00-\\x1f',
  print: '\\x20-\\x7e',
  graph: '\\x21-\\x7e',
};

/** POSIX bracket classes (`[[:alpha:]]`) → JavaScript ranges. */
export function posixClasses(re: string): string {
  return re.replace(/\[:([a-z]+):\]/g, (m, name: string) => POSIX[name] ?? m);
}

/** Pure literal text: no regex metacharacters (escaped punctuation allowed). */
function regexLiteral(frag: string): string | null {
  let s = '';
  for (let i = 0; i < frag.length; i++) {
    const c = frag[i]!;
    if (c === '\\') {
      const d = frag[i + 1];
      if (d === undefined || /[A-Za-z0-9]/.test(d)) return null;
      s += d;
      i++;
      continue;
    }
    if (/[.*+?^${}()|[\]]/.test(c)) return null;
    s += c;
  }
  return s;
}

/** Literal text escaped for a tt++ pattern. */
export function patternLiteral(text: string): string {
  return text.replace(/[\\%{}]/g, '\\$&').replace(/\$$/, '\\$');
}

export type RegexPattern = { ok: true; pattern: string; groups: number } | { ok: false; reason: string };

/**
 * A regex fragment (no groups) as literal runs and not-stored `%!{…}`
 * atoms, so `day.` reads `day%!{.}`; null when it has a group or `|`.
 */
function fragmentPattern(frag: string, atStart: boolean): string | null {
  const atoms: Array<{ lit: string } | { re: string }> = [];
  for (let i = 0; i < frag.length; ) {
    const c = frag[i]!;
    if (c === '(' || c === ')' || c === '|') return null;
    if (c === '\\') {
      const d = frag[i + 1];
      if (d === undefined) return null;
      if (!/[A-Za-z0-9]/.test(d)) {
        atoms.push({ lit: d });
        i += 2;
        continue;
      }
      const m = /^\\(?:x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|c[A-Za-z]|[pP]\{[^}]*\}|.)/.exec(frag.slice(i))!;
      atoms.push({ re: m[0] });
      i += m[0].length;
      continue;
    }
    if (c === '[') {
      let j = i + 1;
      if (frag[j] === '^') j++;
      if (frag[j] === ']') j++;
      for (; j < frag.length && frag[j] !== ']'; j++) if (frag[j] === '\\') j++;
      atoms.push({ re: frag.slice(i, j + 1) });
      i = j + 1;
      continue;
    }
    const q = /^(?:[*+?]|\{\d+(?:,\d*)?\})\??/.exec(frag.slice(i));
    if (q) {
      const prev = atoms.pop();
      if (!prev) return null;
      const base = 'lit' in prev ? prev.lit.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') : prev.re;
      atoms.push({ re: base + q[0] });
      i += q[0].length;
      continue;
    }
    atoms.push(c === '.' || c === '^' || c === '$' ? { re: c } : { lit: c });
    i++;
  }
  let out = '';
  for (let k = 0; k < atoms.length; ) {
    const a = atoms[k]!;
    if ('lit' in a) {
      let run = '';
      while (k < atoms.length && 'lit' in atoms[k]!) run += (atoms[k++] as { lit: string }).lit;
      let p = patternLiteral(run);
      if (atStart && out === '' && p.startsWith('^')) p = '\\' + p;
      out += p;
    } else {
      let run = '';
      while (k < atoms.length && 're' in atoms[k]!) run += (atoms[k++] as { re: string }).re;
      out += `%!{${run}}`;
    }
  }
  return out;
}

/**
 * A regular expression as a tt++ pattern: each top-level capture group
 * becomes a stored `{…}` (arguments %1, %2 … in order), the text between
 * them a literal or a not-stored `%!{…}` (with `split`, only the regex
 * parts of it: `day%!{.}`); `^`/`$` at the ends become the pattern's
 * anchors; the `i` flag becomes `%i`. Fails on nested capture groups,
 * top-level alternation and backreferences.
 */
export function regexToPattern(source: string, flags = '', split = false): RegexPattern {
  let re = posixClasses(source);
  try {
    new RegExp(re);
  } catch (err) {
    return { ok: false, reason: `Bad regex: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (/\\[1-9]/.test(re)) return { ok: false, reason: 'Regex with backreferences' };
  let anchored = false;
  let endAnchor = false;
  if (re.startsWith('^')) {
    anchored = true;
    re = re.slice(1);
  }
  if (re.endsWith('$') && !endsInEscape(re.slice(0, -1))) {
    endAnchor = true;
    re = re.slice(0, -1);
  }
  // Split into top-level pieces: fragments and groups.
  const pieces: Array<{ group: boolean; capture: boolean; text: string }> = [];
  let frag = '';
  let i = 0;
  let inClass = false;
  while (i < re.length) {
    const c = re[i]!;
    if (c === '\\') {
      frag += re.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (inClass) {
      if (c === ']') inClass = false;
      frag += c;
      i++;
      continue;
    }
    if (c === '[') {
      inClass = true;
      frag += c;
      i++;
      continue;
    }
    if (c === '|') return { ok: false, reason: 'Regex with top-level alternation' };
    if (c === '(') {
      const end = closeParen(re, i);
      if (end < 0) return { ok: false, reason: 'Bad regex: unclosed group' };
      // A quantifier after the group stays with it.
      let q = end + 1;
      const qm = /^(?:[*+?]|\{\d+(?:,\d*)?\})\??/.exec(re.slice(q));
      if (qm) q += qm[0].length;
      const inner = re.slice(i + 1, end);
      const capture = !inner.startsWith('?') || /^\?<[^=!]/.test(inner);
      if (frag) pieces.push({ group: false, capture: false, text: frag });
      frag = '';
      const body = capture ? inner.replace(/^\?<[^>]+>/, '') : re.slice(i, q);
      if (capture) {
        if (countCaptures(body) > 0) return { ok: false, reason: 'Regex with nested capture groups' };
        pieces.push({ group: true, capture: true, text: qm ? `(?:${body})${qm[0]}` : body });
      } else {
        pieces.push({ group: true, capture: false, text: body });
      }
      i = q;
      continue;
    }
    frag += c;
    i++;
  }
  if (frag) pieces.push({ group: false, capture: false, text: frag });
  let out = anchored ? '^' : '';
  if (flags.includes('i')) out += '%i';
  let groups = 0;
  for (const p of pieces) {
    if (p.capture) {
      out += `{${p.text}}`;
      groups++;
      continue;
    }
    const lit = p.group ? null : regexLiteral(p.text);
    const parts = lit === null && split && !p.group ? fragmentPattern(p.text, out === '' || out === '%i') : null;
    // An unanchored pattern must not start with a literal `^` (it would anchor).
    if (lit !== null) out += (out === '' || out === '%i') && lit.startsWith('^') ? '\\' + patternLiteral(lit) : patternLiteral(lit);
    else out += parts ?? `%!{${p.text}}`;
  }
  if (endAnchor) out += '$';
  else if (out.endsWith('$') && !out.endsWith('\\$')) out = out.slice(0, -1) + '\\$';
  if (!checkBraces(out).ok) return { ok: false, reason: 'Regex with unbalanced braces' };
  return { ok: true, pattern: out, groups };
}

function closeParen(re: string, open: number): number {
  let depth = 0;
  let inClass = false;
  for (let i = open; i < re.length; i++) {
    const c = re[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (inClass) {
      if (c === ']') inClass = false;
      continue;
    }
    if (c === '[') inClass = true;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i;
  }
  return -1;
}

function countCaptures(re: string): number {
  let n = 0;
  let inClass = false;
  for (let i = 0; i < re.length; i++) {
    const c = re[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (inClass) {
      if (c === ']') inClass = false;
      continue;
    }
    if (c === '[') inClass = true;
    else if (c === '(' && (re[i + 1] !== '?' || /^\?<[^=!]/.test(re.slice(i + 1)))) n++;
  }
  return n;
}

/** Today as `YYYY-MM-DD` (local time). */
export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------------------------------------------------------------------------
// Multi-file resolution
// ---------------------------------------------------------------------------

export type ReadResult = { ok: true; file: SourceFile } | { ok: false; reason: string };

/** Resolves `#read` targets among the chosen files (by base name, case-insensitive). */
export class Resolver {
  private readonly byName = new Map<string, SourceFile>();
  private readonly stack: string[] = [];
  readonly used = new Set<string>();
  readonly missing: string[] = [];

  constructor(files: readonly SourceFile[]) {
    for (const f of files) if (!this.byName.has(f.name.toLowerCase())) this.byName.set(f.name.toLowerCase(), f);
  }

  /** Whether a file with that base name was chosen. */
  has(path: string): boolean {
    return this.byName.has(baseName(path).toLowerCase());
  }

  read(path: string): ReadResult {
    const name = baseName(path);
    const f = this.byName.get(name.toLowerCase());
    if (!f) {
      if (!this.missing.some((m) => m.toLowerCase() === name.toLowerCase())) this.missing.push(name);
      return { ok: false, reason: `File ${name} was not among the chosen files` };
    }
    if (this.stack.includes(f.name)) return { ok: false, reason: `File ${f.name} reads itself (a cycle)` };
    this.used.add(f.name);
    return { ok: true, file: f };
  }

  /** Runs `fn` with `file` on the read stack. */
  within(file: SourceFile, fn: () => void): void {
    this.stack.push(file.name);
    this.used.add(file.name);
    try {
      fn();
    } finally {
      this.stack.pop();
    }
  }
}
