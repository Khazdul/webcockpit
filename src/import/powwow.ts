// Powwow definition files → WebCockpit profile (ADR 0073 "Translation
// rules", research `powwow.md`).
//
// A Powwow file is a list of typed commands, one per line (`\` joins
// lines). Rules map one by one:
// - `#alias n[@g]=t` → `#alias {n} {t}`;
// - `#action >+label[@g] pattern=cmd` → `#action`, captures renumbered in
//   pattern order (`&n` any text, `$n` one word → `%S`), `$0` → `%0`;
//   regexp actions (`%`) → `{…}` groups (Powwow's `$1` is the whole match);
//   Powwow gags the line unless the action runs `#print`, so an action
//   without `#print` also gets a `#gag`; disabled (`-`) actions are kept as
//   `#nop` with their translation; `@group` → `#class`;
// - `#mark` → `#highlight`; `#bind` sequences → `#macro` keys;
// - `#(@x = n, $y = "s")` → `#variable`; `#init` → `#event {SESSION CONNECTED}`;
//   `#in` → `#delay`;
// - client state (`#option`, `#host`, `#setvar`, …) is skipped.

import { checkBraces } from '../script/doc';
import { type Out, type SourceFile, type Statement, braceSafe, nopLine, posixClasses, regexToPattern, splitList } from './common';
import { sequenceKey } from './keys';

const COMMANDS = [
  'action',
  'add',
  'alias',
  'at',
  'beep',
  'bind',
  'capture',
  'connect',
  'cpu',
  'delim',
  'do',
  'else',
  'emulate',
  'exe',
  'file',
  'for',
  'groupdelim',
  'hilite',
  'history',
  'host',
  'identify',
  'if',
  'in',
  'init',
  'isprompt',
  'key',
  'keyedit',
  'load',
  'mark',
  'module',
  'nice',
  'option',
  'prefix',
  'print',
  'prompt',
  'put',
  'quit',
  'rawprint',
  'rawsend',
  'rebind',
  'record',
  'request',
  'reset',
  'retrace',
  'save',
  'savefile-version',
  'send',
  'setvar',
  'snoop',
  'spawn',
  'stop',
  'time',
  'var',
  'ver',
  'while',
  'write',
  'zap',
] as const;

/** Resolves a Powwow command word (case-sensitive prefix, first in order). */
export function powwowCommand(word: string): string | null {
  if (word === '') return null;
  if ((COMMANDS as readonly string[]).includes(word)) return word;
  return COMMANDS.find((c) => c.startsWith(word)) ?? null;
}

const STATE: Record<string, string> = {
  'savefile-version': 'File format version',
  host: 'WebCockpit connects to MUME itself',
  delim: 'Word delimiters setting',
  groupdelim: 'Group delimiter setting',
  setvar: 'Client setting',
  option: 'Client options',
  put: 'Input history',
  add: 'Completion words',
  nice: 'Rule order setting',
  hilite: 'Input line attribute',
  file: 'Save file setting',
  isprompt: 'Prompt setting',
  identify: 'MUME client identification (WebCockpit does its own)',
  request: 'MUME protocol request (WebCockpit does its own)',
  reset: 'Clears definitions',
  connect: 'WebCockpit connects to MUME itself',
  cpu: 'Client command',
  time: 'Client command',
  ver: 'Client command',
  history: 'Client command',
  retrace: 'Client command',
  snoop: 'Client command',
  zap: 'Client command',
  quit: 'Client command',
  save: 'File command',
  load: 'File command',
  write: 'File command',
  record: 'File command',
  capture: 'File command',
  spawn: 'Shell command',
  module: 'Powwow module',
  keyedit: 'Input line editing',
  rebind: 'Input line editing',
  beep: 'Client command',
  stop: 'Client command',
};

interface PwState {
  groupDelim: string;
  autoprint: boolean;
  actions: number;
}

interface Ctx {
  /** Argument maps per escape level (level 0: the rule itself). */
  maps: Array<Map<number, number>>;
  warnings: Set<string>;
  printed: boolean;
}

// ---------------------------------------------------------------------------
// Lexing
// ---------------------------------------------------------------------------

/** Lines, with `\`-newline continuations joined. */
export function scanPowwow(file: SourceFile): Statement[] {
  const lines = file.text.split('\n');
  const out: Statement[] = [];
  for (let i = 0; i < lines.length; i++) {
    const start = i;
    let text = lines[i]!;
    while (/(?<!\\)(?:\\\\)*\\$/.test(text) && i + 1 < lines.length) {
      text = text.slice(0, -1) + lines[++i]!;
    }
    if (text.trim() === '') continue;
    out.push({ file: file.name, line: start + 1, text: text.replace(/\s+$/, '') });
  }
  return out;
}

/** Index of the `)` closing the `(` at 0 (quotes and escapes honoured), or -1. */
function closeParen(text: string): number {
  let depth = 0;
  let quote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') i++;
    else if (quote) quote = c !== '"';
    else if (c === '"') quote = true;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i;
  }
  return -1;
}

/** Index of the first unescaped `=` (the rule separator), or -1. */
function findEq(text: string): number {
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') i++;
    else if (text[i] === '=') return i;
  }
  return -1;
}

function unescapeName(s: string): string {
  return s.replace(/\\(.)/g, '$1');
}

/** Splits `name[@group]`. */
function nameGroup(s: string, delim: string): { name: string; group: string | null } {
  const i = s.lastIndexOf(delim);
  if (i <= 0) return { name: s, group: null };
  return { name: s.slice(0, i), group: s.slice(i + delim.length) || null };
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

type PatResult = { ok: true; pattern: string; map: Map<number, number> } | { ok: false; reason: string };

/**
 * A Powwow weak pattern as a tt++ pattern. Captures are numbered in
 * pattern order (`map`: Powwow number → ours). `mark`: unnumbered `$`/`&`.
 */
function convPattern(pat: string, mark = false): PatResult {
  if (pat.trimStart().startsWith('(')) return { ok: false, reason: 'Pattern built from an expression' };
  let out = '';
  const map = new Map<number, number>();
  let next = 1;
  let i = 0;
  if (pat.startsWith('^')) {
    out = '^';
    i = 1;
  }
  for (; i < pat.length; i++) {
    const c = pat[i]!;
    const d = pat[i + 1];
    if (c === '\\' && d !== undefined) {
      out += lit(d);
      i++;
      continue;
    }
    if ((c === '$' || c === '@' || c === '#') && d === '{') return { ok: false, reason: 'Pattern substitutes variables at match time' };
    if ((c === '$' || c === '&') && d !== undefined && /[1-9]/.test(d) && !mark) {
      map.set(Number(d), next++);
      out += c === '&' ? `%${next - 1}` : '%S';
      i++;
      continue;
    }
    if (mark && (c === '$' || c === '&')) {
      out += c === '&' ? '%*' : '%S';
      continue;
    }
    out += lit(c);
  }
  if (out.endsWith('$') && !out.endsWith('\\$')) out = out.slice(0, -1) + '\\$';
  return { ok: true, pattern: out, map };
}

function lit(c: string): string {
  return c === '%' || c === '{' || c === '}' || c === '\\' ? '\\' + c : c;
}

// ---------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------

/** Powwow variables as ours: `@x`/`$x` → `$x`, numbered globals → `pw_n1`/`pw_s1`. */
function varName(sigil: string, name: string): string {
  if (name.startsWith('-')) return (sigil === '@' ? 'pw_n' : 'pw_s') + name.slice(1);
  return name;
}

/** Plain text: parameters and variables. */
function convText(text: string, ctx: Ctx): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '\\') {
      let j = i;
      while (text[j] === '\\') j++;
      const esc = j - i;
      if ((text[j] === '$' || text[j] === '@') && /[0-9]/.test(text[j + 1] ?? '')) {
        out += param(esc, Number(text[j + 1]), ctx);
        i = j + 1;
        continue;
      }
      if (text[j] === ';' || text[j] === '{' || text[j] === '}') {
        out += '\\' + text[j];
        i = j;
        continue;
      }
      out += text.slice(i + 1, j + 1);
      i = j;
      continue;
    }
    if (c === '$' || c === '@') {
      const rest = text.slice(i + 1);
      let m = /^[0-9]/.exec(rest);
      if (m) {
        out += param(0, Number(m[0]), ctx);
        i += 1;
        continue;
      }
      m = /^\{(-?\w+)\}/.exec(rest);
      if (m) {
        out += `\${${varName(c, m[1]!)}}`;
        i += m[0].length;
        continue;
      }
      m = /^(-\d+|[A-Za-z_]\w*)/.exec(rest);
      if (m) {
        out += `$${varName(c, m[1]!)}`;
        i += m[0].length;
        continue;
      }
    }
    if (c === '#' && text[i + 1] === '{') ctx.warnings.add('#{expression} in text is not translated.');
    out += c;
  }
  return out;
}

function param(level: number, n: number, ctx: Ctx): string {
  const map = ctx.maps[level];
  if (!map) {
    ctx.warnings.add(`Parameter $${n} escaped ${level} times has no rule to belong to; kept as written.`);
    return '\\'.repeat(level) + '$' + n;
  }
  const m = n === 0 ? 0 : (map.get(n) ?? n);
  return '%'.repeat(level + 1) + m;
}

/** Converts a simple Powwow expression; null when it uses operators we lack. */
function convExpr(expr: string, ctx: Ctx): string | null {
  const e = convText(expr.trim(), ctx);
  if (!/^[\w\s$%{}+\-*/()<>=!&|"']*$/.test(e)) return null;
  if (/["']/.test(e) && !/^\s*"[^"]*"\s*$/.test(e)) {
    // String comparisons: only a plain == / != of quoted text.
    if (!/^[^"]*"[^"]*"[^"]*$/.test(e)) return null;
  }
  return e;
}

/** Strips one pair of outer braces that wrap the whole text. */
function unwrap(text: string): string {
  const t = text.trim();
  if (t.startsWith('{') && t.endsWith('}') && checkBraces(t.slice(1, -1)).ok) {
    let depth = 0;
    for (let i = 0; i < t.length; i++) {
      if (t[i] === '\\') i++;
      else if (t[i] === '{') depth++;
      else if (t[i] === '}' && --depth === 0 && i < t.length - 1) return t;
    }
    return t.slice(1, -1);
  }
  return t;
}

function convBody(text: string, ctx: Ctx, top: boolean): string {
  const parts = splitList(unwrap(text));
  const out: string[] = [];
  for (const p of parts) {
    if (!p.startsWith('#')) {
      out.push(convText(p, ctx));
      continue;
    }
    if (p.startsWith('#(')) {
      const r = convAssign(p, ctx);
      if (r !== null) out.push(...r);
      else {
        ctx.warnings.add(`Expression ${p} was not translated.`);
        out.push(p);
      }
      continue;
    }
    const m = /^#(\S+?)(?=[\s({]|$)/.exec(p);
    const word = m?.[1] ?? '';
    const rest = p.slice(1 + word.length).trim();
    if (/^\d+$/.test(word)) {
      out.push(`#${word} {${convBody(rest, ctx, false)}}`);
      continue;
    }
    const name = powwowCommand(word);
    switch (name) {
      case 'print':
        if (rest === '') {
          // Shows the matched line: the action no longer gags it.
          if (top) ctx.printed = true;
          else ctx.warnings.add('#print outside an action was dropped.');
        } else if (rest.startsWith('(')) {
          ctx.warnings.add(`#print with an expression was not translated.`);
          out.push(p);
        } else {
          // `#print text` shows other text instead of the line.
          out.push(`#showme {${braceSafe(convText(rest, ctx))}}`);
        }
        continue;
      case 'in':
      case 'at': {
        const tm = /^(\S+)\s*\(([^)]*)\)\s*(.*)$/s.exec(rest);
        const ms = tm ? Number(tm[2]) : NaN;
        if (name === 'in' && tm && Number.isFinite(ms)) {
          if (ms <= 0) out.push(`#undelay {${tm[1]}}`);
          else out.push(`#delay {${tm[1]}} {${convBody(tm[3]!, ctx, false)}} {${trimNum(ms / 1000)}}`);
        } else {
          ctx.warnings.add(`#${name} ${rest} was not translated.`);
          out.push(p);
        }
        continue;
      }
      case 'if': {
        const close = rest.startsWith('(') ? closeParen(rest) : -1;
        const cond = close > 0 ? convExpr(rest.slice(1, close), ctx) : null;
        if (cond === null) {
          ctx.warnings.add(`#if ${rest} was not translated.`);
          out.push(p);
          continue;
        }
        out.push(`#if {${cond}} {${convBody(rest.slice(close + 1), ctx, false)}}`);
        continue;
      }
      case 'else':
        out.push(`#else {${convBody(rest, ctx, false)}}`);
        continue;
      case 'var': {
        const vm = /^([$@])(-?\w+)\s*=\s*(.*)$/s.exec(rest);
        if (vm) out.push(`#variable {${varName(vm[1]!, vm[2]!)}} {${convText(vm[3]!, ctx)}}`);
        else {
          ctx.warnings.add(`#var ${rest} was not translated.`);
          out.push(p);
        }
        continue;
      }
      case 'alias': {
        const eq = findEq(rest);
        if (eq > 0) {
          // `\$n` in the nested body is the inner alias's `$n` (escape level 1).
          const { name: an } = nameGroup(rest.slice(0, eq).trim(), '@');
          ctx.maps.push(new Map());
          try {
            out.push(`#alias {${unescapeName(an)}} {${convBody(rest.slice(eq + 1), ctx, false)}}`);
          } finally {
            ctx.maps.pop();
          }
        } else {
          ctx.warnings.add(`#alias ${rest} was not translated.`);
          out.push(p);
        }
        continue;
      }
      case 'identify':
      case 'request':
        ctx.warnings.add(`#${name} dropped (WebCockpit talks to MUME itself).`);
        continue;
      default:
        ctx.warnings.add(`#${word} was not translated; kept as written.`);
        out.push(p);
    }
  }
  return out.join(';');
}

function trimNum(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** `#(@x = 5, $y = "s")` → `#variable` lines; `#("comment")` → `#nop`; else null. */
function convAssign(text: string, ctx: Ctx): string[] | null {
  const t = text.trim();
  if (!t.startsWith('#(') || !t.endsWith(')')) return null;
  const inner = t.slice(2, -1).trim();
  const str = /^"((?:[^"\\]|\\.)*)"$/.exec(inner);
  if (str) return [nopLine(str[1]!.replace(/\\(.)/g, '$1'))];
  const out: string[] = [];
  for (const part of splitList(inner, ',')) {
    const m = /^([@$])(-?\w+)\s*(=|\+=|-=|\+\+|--)\s*(.*)$/s.exec(part.trim());
    if (!m) return null;
    const name = varName(m[1]!, m[2]!);
    const op = m[3]!;
    const rhs = m[4]!.trim();
    if (op === '++' || op === '--') {
      out.push(`#math {${name}} {$${name} ${op[0]} 1}`);
      continue;
    }
    if (m[1] === '$') {
      const s = /^"((?:[^"\\]|\\.)*)"$/.exec(rhs);
      if (!s || op !== '=') return null;
      out.push(`#variable {${name}} {${braceSafe(s[1]!.replace(/\\(.)/g, '$1'))}}`);
      continue;
    }
    if (/^-?\d+$/.test(rhs) && op === '=') {
      out.push(`#variable {${name}} {${rhs}}`);
      continue;
    }
    const e = convExpr(rhs, ctx);
    if (e === null) return null;
    out.push(op === '=' ? `#math {${name}} {${e}}` : `#math {${name}} {$${name} ${op[0]} (${e})}`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------

const PW_COLOURS = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];

/** Powwow mark attributes (`bold yellow on red`) as our highlight names, or null. */
export function powwowAttrs(attr: string): string | null {
  const words = attr.trim().split(/\s+/);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const lw = w.toLowerCase();
    if (lw === 'none') continue;
    if (lw === 'bold' || lw === 'blink') out.push(lw);
    else if (lw === 'underline') out.push('underline');
    else if (lw === 'inverse' || lw === 'reverse') out.push('reverse');
    else if (lw === 'on') {
      const c = words[++i];
      if (!c || !PW_COLOURS.includes(c.toLowerCase())) return null;
      out.push(`b ${c !== c.toLowerCase() ? 'light ' : ''}${c.toLowerCase()}`);
    } else if (PW_COLOURS.includes(lw)) out.push(`${w !== lw ? 'light ' : ''}${lw}`);
    else return null;
  }
  return out.length > 0 ? out.join(', ') : null;
}

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

/** Translates a Powwow definition file into `out`. */
export function translatePowwow(file: SourceFile, out: Out): void {
  const state: PwState = { groupDelim: '@', autoprint: false, actions: 0 };
  const statements = scanPowwow(file);
  for (const st of statements) {
    if (/^#option\b.*\+autoprint\b/.test(st.text)) state.autoprint = true;
    const gd = /^#groupdelim\s+(\S+)/.exec(st.text);
    if (gd) state.groupDelim = gd[1]!;
  }
  for (const st of statements) statement(st, out, state);
  out.setClass(null);
  if (state.actions > 1) {
    out.warnFile('Powwow fires only the first matching action; WebCockpit fires every matching action. Overlapping actions may now all fire.');
  }
}

function newCtx(): Ctx {
  return { maps: [new Map()], warnings: new Set(), printed: false };
}

function statement(st: Statement, out: Out, state: PwState): void {
  const t = st.text.trim();
  if (!t.startsWith('#')) {
    out.keep(st, 'Text line (Powwow sends it to the game when the file is loaded)');
    return;
  }
  if (t.startsWith('#(')) {
    const ctx = newCtx();
    const r = convAssign(t, ctx);
    if (r === null) out.keep(st, 'Expression not translated');
    else if (r.length === 1 && r[0]!.startsWith('#nop')) out.raw(r[0]!);
    else out.translated(st, r, note('Variables', ctx));
    return;
  }
  const m = /^#(\S+?)(?=\s|=|$)/.exec(t);
  const word = m?.[1] ?? '';
  const rest = t.slice(1 + word.length);
  const name = powwowCommand(word);
  if (name === null) {
    out.keep(st, `Unknown Powwow command #${word}`);
    return;
  }
  if (STATE[name]) {
    out.skip(st, STATE[name]);
    return;
  }
  switch (name) {
    case 'alias':
      return alias(st, rest.trim(), out, state);
    case 'action':
      return action(st, rest.trim(), out, state);
    case 'mark':
      return mark(st, rest.trim(), out);
    case 'bind':
      return bind(st, rest.trim(), out);
    case 'init': {
      const eq = findEq(rest);
      const body = eq >= 0 ? rest.slice(eq + 1).trim() : rest.trim();
      const ctx = newCtx();
      const b = convBody(body, ctx, false);
      if (b === '') {
        out.skip(st, ctx.warnings.size > 0 ? 'Only MUME protocol commands WebCockpit does itself' : 'Empty #init');
        return;
      }
      out.translated(st, `#event {SESSION CONNECTED} {${b}}`, note('#init → #event {SESSION CONNECTED}', ctx));
      return;
    }
    case 'var': {
      const ctx = newCtx();
      const vm = /^([$@])(-?\w+)\s*=\s*(.*)$/s.exec(rest.trim());
      if (!vm) {
        out.keep(st, '#var form not understood');
        return;
      }
      out.translated(st, `#variable {${varName(vm[1]!, vm[2]!)}} {${braceSafe(convText(vm[3]!, ctx))}}`, note('', ctx));
      return;
    }
    case 'prompt':
      out.keep(st, 'Prompt rules have no equivalent');
      return;
  }
  out.keep(st, `#${name} is not translated at the top level`);
}

function note(reason: string, ctx: Ctx, extra?: string): { reason?: string; warning?: string } {
  const n: { reason?: string; warning?: string } = {};
  if (reason) n.reason = reason;
  const w = [...(extra ? [extra] : []), ...ctx.warnings];
  if (w.length > 0) n.warning = w.join(' ');
  return n;
}

function alias(st: Statement, rest: string, out: Out, state: PwState): void {
  const eq = findEq(rest);
  if (eq <= 0) {
    out.keep(st, '#alias without name=text');
    return;
  }
  const { name, group } = nameGroup(rest.slice(0, eq).trim(), state.groupDelim);
  const ctx = newCtx();
  const body = convBody(rest.slice(eq + 1), ctx, false);
  const line = `#alias {${unescapeName(name)}} {${body}}`;
  if (!checkBraces(line).ok) {
    out.keep(st, 'Unbalanced braces after translation');
    return;
  }
  out.translated(st, line, note('', ctx), group);
}

function action(st: Statement, rest: string, out: Out, state: PwState): void {
  let kind = '>';
  let enabled = true;
  let group: string | null = null;
  let label = '';
  let def = rest;
  const lm = /^([<>=+%-])([+-]?)(\S*)\s+(.*)$/s.exec(rest);
  if (lm) {
    kind = lm[1]!;
    if (kind === '<' || kind === '=' || (kind === '+' && !lm[4]) || (kind === '-' && !lm[4])) {
      out.keep(st, 'Action edit command, not a definition');
      return;
    }
    if (kind === '+' || kind === '-') {
      enabled = kind === '+';
      kind = '>';
    }
    if (lm[2] === '-') enabled = false;
    const ng = nameGroup(lm[3]!, state.groupDelim);
    label = ng.name;
    group = ng.group;
    def = lm[4]!;
  }
  const eq = findEq(def);
  if (eq < 0) {
    out.keep(st, 'Action without pattern=command');
    return;
  }
  const rawPat = def.slice(0, eq);
  const cmd = def.slice(eq + 1);
  const ctx = newCtx();
  let pattern: string;
  const notes: string[] = [];
  if (kind === '%') {
    // Regexp actions: the pattern is unescaped once; $1 is the whole match.
    const re = posixClasses(rawPat.replace(/\\(.)/g, '$1'));
    const r = regexToPattern(re);
    if (!r.ok) {
      out.keep(st, r.reason);
      return;
    }
    pattern = r.pattern;
    const map = new Map<number, number>();
    for (let n = 1; n <= 9; n++) map.set(n, n - 1);
    ctx.maps[0] = map;
    notes.push('Regexp pattern rewritten');
  } else {
    const p = convPattern(rawPat);
    if (!p.ok) {
      out.keep(st, p.reason);
      return;
    }
    pattern = p.pattern;
    ctx.maps[0] = p.map;
  }
  const body = convBody(cmd, ctx, true);
  const lines: string[] = [];
  const gags = !ctx.printed && !state.autoprint;
  if (body !== '') lines.push(`#action {${pattern}} {${body}}`);
  if (gags) {
    lines.push(`#gag {${pattern}}`);
    notes.push(body === '' ? 'Action without commands → #gag' : 'No #print: the line is also gagged');
  }
  if (lines.length === 0) {
    out.skip(st, 'Action that neither runs nor gags anything');
    return;
  }
  for (const l of lines) {
    if (!checkBraces(l).ok) {
      out.keep(st, 'Unbalanced braces after translation');
      return;
    }
  }
  state.actions++;
  if (!enabled) {
    out.keep(st, `Disabled in Powwow${label ? ` (${label})` : ''}; translation`, lines.join('; '));
    return;
  }
  out.translated(st, lines, note(notes.join('; '), ctx), group);
}

function mark(st: Statement, rest: string, out: Out): void {
  const eq = rest.lastIndexOf('=');
  if (eq <= 0) {
    out.keep(st, '#mark without pattern=attribute');
    return;
  }
  const attrs = powwowAttrs(rest.slice(eq + 1));
  if (!attrs) {
    out.keep(st, `Unknown mark attribute ${rest.slice(eq + 1).trim()}`);
    return;
  }
  const p = convPattern(rest.slice(0, eq).trim(), true);
  if (!p.ok) {
    out.keep(st, p.reason);
    return;
  }
  out.translated(st, `#highlight {${p.pattern}} {${attrs}}`, { reason: '#mark → #highlight' });
}

function bind(st: Statement, rest: string, out: Out): void {
  const m = /^(\S+)\s+(\S+?)=(.*)$/s.exec(rest);
  if (!m) {
    out.keep(st, '#bind without a key sequence');
    return;
  }
  const cmd = m[3]!;
  if (cmd.startsWith('&')) {
    out.skip(st, 'Input line editing key');
    return;
  }
  const k = sequenceKey(m[2]!);
  if (!k.ok) {
    out.keep(st, k.reason);
    return;
  }
  const ctx = newCtx();
  const body = convBody(cmd, ctx, false);
  out.translated(st, `#macro {${k.key}} {${body}}`, note(`Key ${m[1]} (${m[2]}) → ${k.key}`, ctx, k.warning));
}
