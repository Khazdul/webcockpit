// JMC (Jaba Mud Client 3.x `.set` files) → WebCockpit profile (ADR 0073
// "Translation rules", research `jmc.md`).
//
// JMC is a TinTin 1.5 dialect. Per statement:
// - command char from the file, abbreviations expanded (`#act`, `#hot`);
// - `#action [TEXT|RAW|COLOR] {pat} {cmd} {prio} {group}`: the type word
//   dropped (RAW/COLOR kept: they match colour codes), the priority kept,
//   the group as a `#class` block; `/re/flags` patterns become tt++
//   patterns with `{…}` groups, and the body's `%n` shifts up by one
//   (JMC's `%0` is the first group);
// - `#highlight {colours} {pattern}` swapped, colours mapped to names;
// - `#substitute {x} {.}` → `#gag`; `#hot`/`#hotkey` → `#macro`;
// - `%%n` de-nested by brace depth, `$n` → `%n`; `#wait` (deciseconds)
//   wraps the rest of its command list in `#delay`; the tick timer
//   (`#ticksize` + `#tickon`) becomes a `#ticker`;
// - `&x` colour codes in #showme/#output/substitute text → `<abc>`;
//   `#if` text comparisons quoted; `#N cmd` → `#N {cmd}`, `#N:D cmd`
//   unrolled into `#delay`s; `#beep` → `#bell`;
// - `##` comments → `#nop` (closing an open group first); state commands of the header are skipped;
//   JScript (`#use`, `#scriptlet`) and `#status` are kept.

import { checkBraces } from '../script/doc';
import { Args, type Out, type Resolver, type SourceFile, type Statement, detectCmdChar, nopLine, regexToPattern, scanStatements, splitList } from './common';
import { jmcKey } from './keys';

// Alphabetical: the first name a word starts is the command (`is_abrev`).
const COMMANDS = [
  'action',
  'alias',
  'antisubstitute',
  'bell',
  'boss',
  'broadcast',
  'char',
  'codepage',
  'colon',
  'comment',
  'cr',
  'echo',
  'end',
  'flash',
  'gag',
  'group',
  'help',
  'highlight',
  'history',
  'hotkey',
  'if',
  'ignore',
  'info',
  'killall',
  'log',
  'loop',
  'map',
  'mark',
  'math',
  'message',
  'multiaction',
  'multihighlight',
  'nop',
  'oob',
  'output',
  'pathdir',
  'presub',
  'promptend',
  'proxy',
  'race',
  'read',
  'return',
  'savepath',
  'scriptlet',
  'secure',
  'showme',
  'speedwalk',
  'spit',
  'status',
  'strcmp',
  'substitute',
  'system',
  'tabadd',
  'tabdel',
  'telnet',
  'textin',
  'tick',
  'tickoff',
  'tickon',
  'tickset',
  'ticksize',
  'togglesubs',
  'unaction',
  'unalias',
  'unantisubstitute',
  'ungag',
  'unhighlight',
  'unhotkey',
  'unpathdir',
  'unsubstitute',
  'unvariable',
  'use',
  'variable',
  'verbatim',
  'wait',
  'wdock',
  'wname',
  'woutput',
  'wpos',
  'write',
  'wt',
  'zap',
] as const;

/** Resolves a JMC command word (case-insensitive prefix). */
export function jmcCommand(word: string): string | null {
  const w = word.toLowerCase();
  if (w === '') return null;
  if ((COMMANDS as readonly string[]).includes(w)) return w;
  return COMMANDS.find((c) => c.startsWith(w)) ?? null;
}

/** Client state with no meaning in WebCockpit: skipped. */
const STATE = new Set([
  'bell',
  'boss',
  'broadcast',
  'char',
  'codepage',
  'colon',
  'comment',
  'cr',
  'echo',
  'flash',
  'help',
  'history',
  'ignore',
  'info',
  'log',
  'message',
  'multihighlight',
  'oob',
  'pathdir',
  'presub',
  'promptend',
  'proxy',
  'race',
  'savepath',
  'secure',
  'speedwalk',
  'spit',
  'tabadd',
  'tabdel',
  'telnet',
  'togglesubs',
  'unpathdir',
  'verbatim',
  'wdock',
  'wname',
  'wpos',
  'write',
]);

/** Kept with a reason (no equivalent, but the user may want them). */
const KEEP: Record<string, string> = {
  use: 'JScript file (scripts are not translated)',
  scriptlet: 'JScript code (scripts are not translated)',
  status: 'Status bar setting (no equivalent)',
  woutput: 'Output window (no equivalent)',
  antisubstitute: 'Antisubstitute has no equivalent',
  unantisubstitute: 'Antisubstitute has no equivalent',
  killall: '#killall has no equivalent',
  loop: '#loop is not supported',
  strcmp: '#strcmp is not supported',
  map: 'Mapper command (no equivalent)',
  mark: 'Mapper command (no equivalent)',
  system: 'Shell command (no equivalent)',
  textin: 'File command (no equivalent)',
  return: 'Mapper command (no equivalent)',
  zap: 'Session command (no equivalent)',
  end: 'Session command (no equivalent)',
};

/** Commands whose text passes through with only `%`/`$` conversion. */
const PASS = new Set(['showme', 'math', 'variable', 'unaction', 'unalias', 'ungag', 'unhighlight', 'unsubstitute', 'unvariable']);

const RENAME: Record<string, string> = { unhotkey: 'unmacro' };

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

/** JMC colour names in JMC's numbering (1–16), with our names. */
const JMC_COLOURS: Array<[string, string]> = [
  ['black', 'black'],
  ['red', 'red'],
  ['green', 'green'],
  ['brown', 'yellow'],
  ['blue', 'blue'],
  ['magenta', 'magenta'],
  ['cyan', 'cyan'],
  ['grey', 'white'],
  ['charcoal', 'light black'],
  ['light red', 'light red'],
  ['light green', 'light green'],
  ['yellow', 'light yellow'],
  ['light blue', 'light blue'],
  ['light magenta', 'light magenta'],
  ['light cyan', 'light cyan'],
  ['white', 'light white'],
];
const ATTRS: Record<string, string> = { bold: 'bold', blink: 'blink', italic: 'italic', reverse: 'reverse' };

/** A JMC colour list (`light red, b blue, bold`) as our highlight colour names, or null. */
export function jmcColours(list: string): { colours: string; dropped: string[] } | null {
  const out: string[] = [];
  const dropped: string[] = [];
  for (const raw of list.split(',')) {
    let t = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    if (t === '') continue;
    let bg = false;
    if (/^\d+$/.test(t)) {
      const n = Number(t);
      if (n >= 1 && n <= 32) {
        const c = JMC_COLOURS[(n - 1) % 16]![1];
        out.push(n > 16 ? `b ${c}` : c);
      } else dropped.push(raw.trim());
      continue;
    }
    if (t.startsWith('b ')) {
      bg = true;
      t = t.slice(2);
    }
    const attr = Object.keys(ATTRS).find((a) => a.startsWith(t) && t.length >= 2);
    if (!bg && attr) {
      out.push(ATTRS[attr]!);
      continue;
    }
    const col = JMC_COLOURS.find(([j]) => j === t) ?? JMC_COLOURS.find(([j]) => j.startsWith(t));
    if (col) out.push(bg ? `b ${col[1]}` : col[1]);
    else dropped.push(raw.trim());
  }
  if (out.length === 0) return null;
  return { colours: out.join(', '), dropped };
}

// JMC's `&x` text codes (`convert_colored_to_ansi`): lowercase is
// ESC[0;3Nm, uppercase ESC[1;3Nm, `&&` a literal `&`.
const AMP_CODES = 'drgybpcw';

/**
 * JMC `&x` colour codes in text as our `<abc>` codes: `&r` → `<019>`
 * (reset, red), `&R` → `<118>` (bold red, as JMC's SGR 1;31), `&&` → `&`.
 * Other `&` sequences stay as written.
 */
export function jmcColourCodes(text: string): string {
  return text.replace(/&([&a-zA-Z])/g, (m, c: string) => {
    if (c === '&') return '&';
    const n = AMP_CODES.indexOf(c.toLowerCase());
    if (n < 0) return m;
    return c === c.toLowerCase() ? `<0${n}9>` : `<1${n}8>`;
  });
}

const CODE_NAMES = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
const ATTR_DIGIT: Record<string, string> = { bold: '1', italic: '3', blink: '5', reverse: '7' };

/** A JMC colour list (`light red, b blue`) as `<abc>` codes for text, or null. */
export function jmcColourPrefix(list: string): string | null {
  const c = jmcColours(list);
  if (!c) return null;
  let fg = 9;
  let bg = 9;
  const attrs: string[] = [];
  for (const item of c.colours.split(', ')) {
    if (ATTR_DIGIT[item]) {
      attrs.push(ATTR_DIGIT[item]);
      continue;
    }
    const isBg = item.startsWith('b ');
    const name = isBg ? item.slice(2) : item;
    const light = name.startsWith('light ');
    const idx = CODE_NAMES.indexOf(light ? name.slice(6) : name);
    if (idx < 0) continue;
    if (isBg) bg = idx;
    else {
      fg = idx;
      if (light) attrs.push('1');
    }
  }
  return `<0${fg}${bg}>` + [...new Set(attrs)].map((a) => `<${a}88>`).join('');
}

// ---------------------------------------------------------------------------
// Bodies: `%%n` de-nesting, `$n`, nested commands
// ---------------------------------------------------------------------------

interface Level {
  /** Absolute brace depth where this level's text starts. */
  base: number;
  /** Added to argument numbers (1 for regex actions: JMC's %0 is group 1). */
  shift: number;
}

interface Ctx {
  levels: Level[];
  warnings: Set<string>;
  state: JmcState;
}

interface JmcState {
  cmdChar: string;
  tickSize: number;
  multiAction: boolean;
  /** Actions translated so far (for the first-match warning). */
  actions: number;
}

/**
 * Converts `%n` / `%%n` / `$n` in plain text at brace depth `depth`: a
 * run of k signs belongs to the innermost level where k = (depth − base)
 * + 1 (JMC's rule), and becomes L+1 `%` signs for level L (tt++ strips
 * one per pass).
 */
function convText(text: string, depth: number, ctx: Ctx): string {
  let out = '';
  let d = depth;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '\\' && i + 1 < text.length) {
      out += c + text[i + 1];
      i++;
      continue;
    }
    if (c === '{') d++;
    else if (c === '}') d--;
    if (c === '%' || c === '$') {
      let j = i;
      while (text[j] === c) j++;
      const digit = text[j];
      if (digit !== undefined && digit >= '0' && digit <= '9') {
        const k = j - i;
        out += sign(k, Number(digit), d, ctx, c);
        i = j;
        continue;
      }
      out += text.slice(i, j);
      i = j - 1;
      continue;
    }
    out += c;
  }
  return out;
}

function sign(k: number, n: number, depth: number, ctx: Ctx, ch: string): string {
  for (let L = ctx.levels.length - 1; L >= 0; L--) {
    const lv = ctx.levels[L]!;
    if (k === depth - lv.base + 1) return '%'.repeat(L + 1) + String(n + lv.shift);
  }
  // Too few signs for this depth: JMC leaves it as text, tt++ replaces it.
  const L = ctx.levels.length - 1;
  const lv = ctx.levels[L];
  ctx.warnings.add(`${ch.repeat(k)}${n} inside braces is left as text by JMC (it needs more ${ch} signs there); WebCockpit replaces it.`);
  return lv ? '%'.repeat(L + 1) + String(n + lv.shift) : ch.repeat(k) + n;
}

/** A JMC wildcard pattern as a tt++ pattern. */
function convPattern(pat: string, depth: number, ctx: Ctx): string {
  let out = '';
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i]!;
    if (c === '\\' && i + 1 < pat.length) {
      out += c + pat[i + 1];
      i++;
      continue;
    }
    if (c === '%') {
      let j = i;
      while (pat[j] === '%') j++;
      const digit = pat[j];
      if (digit !== undefined && digit >= '0' && digit <= '9') {
        out += sign(j - i, Number(digit), depth, ctx, '%');
        i = j;
        continue;
      }
      out += '\\%'.repeat(j - i);
      i = j - 1;
      continue;
    }
    if (c === '{' || c === '}') {
      out += '\\' + c;
      continue;
    }
    out += c;
  }
  // JMC has no end anchor: a trailing `$` is literal.
  if (out.endsWith('$') && !out.endsWith('\\$')) out = out.slice(0, -1) + '\\$';
  return out;
}

function withLevel<T>(ctx: Ctx, lv: Level, fn: () => T): T {
  ctx.levels.push(lv);
  try {
    return fn();
  } finally {
    ctx.levels.pop();
  }
}

/** Converts a command list whose text sits at brace depth `depth`. */
function convBody(text: string, depth: number, ctx: Ctx): string {
  const parts = splitList(text);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    const cc = ctx.state.cmdChar;
    if (p.startsWith(cc)) {
      const word = /^\S+?(?=[\s{]|$)/.exec(p.slice(cc.length))?.[0] ?? '';
      const name = jmcCommand(word);
      if (name === 'wait' || name === 'wt') {
        const a = new Args(p.slice(cc.length + word.length));
        const ds = Number(a.next());
        const rest = parts.slice(i + 1).join(';');
        if (!Number.isFinite(ds)) {
          ctx.warnings.add('#wait without a number was kept.');
          out.push('#' + p.slice(cc.length));
          continue;
        }
        ctx.warnings.add('#wait queued all following output in JMC; here only the rest of the command list is delayed.');
        if (rest) out.push(`#delay {${trimNum(ds / 10)}} {${convBody(rest, depth, ctx)}}`);
        break;
      }
      out.push(convCommand(p.slice(cc.length), word, name, depth, ctx));
    } else out.push(convText(p, depth, ctx));
  }
  return out.join(';');
}

function trimNum(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** One command inside a body (`word` after the command char). */
function convCommand(cmd: string, word: string, name: string | null, depth: number, ctx: Ctx): string {
  const rest = cmd.slice(word.length);
  const inner = depth + 1;
  const rep = /^(\d+)(?::(\d+))?$/.exec(word);
  if (rep) return repeat(cmd, Number(rep[1]), rep[2] === undefined ? 0 : Number(rep[2]), rest, depth, ctx);
  if (name === null && /^beep$/i.test(word)) name = 'bell';
  switch (name) {
    case 'bell':
      ctx.warnings.add('#bell (JMC: #beep) makes no sound in WebCockpit.');
      return '#bell';
    case 'showme': {
      // JMC: #showme {text} or #showme {colour} {text}; an unbraced first
      // argument runs to the end (WITH_SPACES).
      const a = new Args(rest);
      if (!a.nextBraced) return `#showme {${jmcColourCodes(convText(rest.trim(), depth, ctx))}}`;
      const first = a.next();
      if (a.done) return `#showme {${jmcColourCodes(convText(first, inner, ctx))}}`;
      const text = a.next();
      const prefix = /colorcodes/i.test(first) ? '' : jmcColourPrefix(first);
      if (prefix === null) ctx.warnings.add(`#showme colour ${first} not understood and dropped.`);
      return `#showme {${prefix ?? ''}${jmcColourCodes(convText(text, a.lastBraced ? inner : depth, ctx))}}`;
    }
    case 'action':
    case 'alias':
    case 'hotkey':
    case 'highlight':
    case 'substitute':
    case 'gag': {
      const r = translateRule(name, rest, inner, ctx);
      if (r.ok) {
        if (r.warning) ctx.warnings.add(r.warning);
        return r.line;
      }
      ctx.warnings.add(`${r.reason}; the nested #${name} was kept as written.`);
      return '#' + cmd;
    }
    case 'if': {
      const a = new Args(rest);
      const at = () => (a.lastBraced ? inner : depth);
      const c0 = a.next();
      const q = quoteComparisons(convText(c0, at(), ctx));
      if (q.changed) ctx.warnings.add('JMC\'s #if compares numbers only; text comparisons were quoted ("$a" == "b") so they compare text here.');
      const cond = q.text;
      const t0 = a.next();
      const then = convBody(t0, at(), ctx);
      let other: string | null = null;
      if (!a.done) {
        const e0 = a.next();
        other = convBody(e0, at(), ctx);
      }
      return `#if {${cond}} {${then}}` + (other !== null ? ` {${other}}` : '');
    }
    case 'tickon':
    case 'tickset':
      ctx.warnings.add(`The JMC tick timer became a #ticker every ${ctx.state.tickSize} s; it is not synced to the game's tick.`);
      return tickerLine(ctx.state);
    case 'tickoff':
      return '#unticker {tick}';
    case 'output': {
      // JMC: #output [colour] {text}.
      const a = new Args(rest);
      const args = a.all();
      const colour = args.length > 1 ? args[0]! : '';
      const prefix = colour === '' || /colorcodes/i.test(colour) ? '' : jmcColourPrefix(colour);
      if (prefix === null) ctx.warnings.add(`#output colour ${colour} not understood and dropped.`);
      return `#showme {${prefix ?? ''}${jmcColourCodes(convText(args[args.length - 1] ?? '', inner, ctx))}}`;
    }
    case 'nop':
      return '#nop' + rest;
    case 'variable': {
      const a = new Args(rest);
      const v = a.next();
      const cv = convText(v, a.lastBraced ? inner : depth, ctx);
      const val = a.next();
      const cval = convText(val, a.lastBraced ? inner : depth, ctx);
      return `#variable {${cv}} {${cval}}`;
    }
    case null:
      ctx.warnings.add(`Unknown command #${word} kept as written.`);
      return '#' + cmd;
  }
  if (PASS.has(name)) return '#' + name + convText(rest, depth, ctx);
  if (RENAME[name]) return '#' + RENAME[name] + convText(rest, depth, ctx);
  ctx.warnings.add(`#${name} has no equivalent; kept as written.`);
  return '#' + cmd;
}

/** Most repeats `#N:delay` is unrolled into. */
const UNROLL_MAX = 20;

/**
 * JMC `#N cmd` / `#N:delay cmd` (`do_cycle`): runs cmd N times; with a
 * delay (deciseconds), one run per delay on a timer. Our engine runs
 * `#N {cmd}`; a delayed repeat is unrolled into `#delay`s.
 */
function repeat(cmd: string, n: number, ds: number, rest: string, depth: number, ctx: Ctx): string {
  const a = new Args(rest);
  const braced = a.nextBraced;
  const raw = braced ? a.next() : rest.trim();
  const body = convBody(raw, braced ? depth + 1 : depth, ctx);
  if (ds === 0) return `#${n} {${body}}`;
  if (n > UNROLL_MAX) {
    ctx.warnings.add(`#${n}:${ds} (repeat every ${trimNum(ds / 10)} s) is too long to unroll; kept as written.`);
    return '#' + cmd;
  }
  ctx.warnings.add(`#${n}:${ds} (repeat every ${trimNum(ds / 10)} s) became ${n} delayed commands.`);
  const out: string[] = [];
  for (let k = 0; k < n; k++) out.push(k === 0 ? body : `#delay {${trimNum((k * ds) / 10)}} {${body}}`);
  return out.join(';');
}

/**
 * Quotes both sides of `==` / `!=` comparisons where one side is literal
 * text (`$target == orc` → `"$target" == "orc"`). Our engine compares
 * barewords as strings too, but a value with spaces or operators breaks
 * a bare comparison. Numeric comparisons (`%1 == 1`) stay as they are.
 */
export function quoteComparisons(cond: string): { text: string; changed: boolean } {
  let changed = false;
  const parts = cond.split(/(&&|\|\|)/);
  for (let i = 0; i < parts.length; i += 2) {
    const m = /^(\s*)(.*?)\s*(==|!=)\s*(.*?)(\s*)$/s.exec(parts[i]!);
    if (!m) continue;
    const [, pre, l, op, r, post] = m as unknown as [string, string, string, string, string, string];
    const plain = (x: string) => x !== '' && !/["(){}!<>=]/.test(x);
    const literal = (x: string) => /[^\s\d.+-]/.test(x.replace(/\$[A-Za-z_][\w]*|%+\d/g, ''));
    if (plain(l) && plain(r) && (literal(l) || literal(r))) {
      parts[i] = `${pre}"${l}" ${op} "${r}"${post}`;
      changed = true;
    }
  }
  return { text: parts.join(''), changed };
}

function tickerLine(state: JmcState): string {
  return `#ticker {tick} {#showme {TICK!!!}} {${state.tickSize}}`;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

type RuleResult = { ok: true; line: string; group: string | null; reason?: string; warning?: string } | { ok: false; reason: string };

const REGEX = /^\/(.*)\/([a-z]*)$/s;

function groupOf(g: string | undefined): string | null {
  const t = (g ?? '').trim();
  return t === '' || t.toLowerCase() === 'default' ? null : t;
}

/** Translates a definition (`rest`: the text after the command word; args at `depth`). */
function translateRule(name: string, rest: string, depth: number, ctx: Ctx): RuleResult {
  const a = new Args(rest);
  const notes: string[] = [];
  switch (name) {
    case 'action': {
      let type = 'TEXT';
      if (!a.nextBraced) {
        const save = a.pos;
        const w = a.next();
        if (/^(?:text|raw|color)$/i.test(w)) type = w.toUpperCase();
        else a.pos = save;
      }
      const pat = a.next();
      const body = a.next();
      let pri = '';
      let group: string | undefined;
      const extra = a.all();
      if (extra[0] !== undefined && /^\d/.test(extra[0])) {
        pri = extra[0];
        group = extra[1];
      } else group = extra[0];
      if (type !== 'TEXT') return { ok: false, reason: `${type} action (matches colour codes)` };
      const m = REGEX.exec(pat);
      let pattern: string;
      let shift = 0;
      if (m) {
        const r = regexToPattern(m[1]!, m[2]!);
        if (!r.ok) return { ok: false, reason: r.reason };
        pattern = r.pattern;
        shift = 1;
        notes.push('Regex pattern rewritten');
        if (/[gm]/.test(m[2]!)) notes.push('regex flags g/m dropped');
      } else pattern = withLevel(ctx, { base: depth, shift: 0 }, () => convPattern(pat, depth, ctx));
      const b = withLevel(ctx, { base: depth, shift }, () => convBody(body, depth, ctx));
      const p = pri !== '' && Number(pri) !== 5 ? ` {${pri}}` : '';
      ctx.state.actions++;
      return done(`#action {${pattern}} {${b}}${p}`, groupOf(group), notes);
    }
    case 'alias': {
      const key = a.next();
      const body = a.next();
      const group = a.next();
      if (REGEX.test(key)) return { ok: false, reason: 'Regex alias (not supported)' };
      const b = withLevel(ctx, { base: depth, shift: 0 }, () => convBody(body, depth, ctx));
      return done(`#alias {${key}} {${b}}`, groupOf(group), notes);
    }
    case 'hotkey': {
      const key = a.next();
      const body = a.next();
      const group = a.next();
      const k = jmcKey(key);
      if (!k.ok) return { ok: false, reason: k.reason };
      const b = withLevel(ctx, { base: depth, shift: 0 }, () => convBody(body, depth, ctx));
      notes.push(`Hotkey ${key} → macro ${k.key}`);
      return done(`#macro {${k.key}} {${b}}`, groupOf(group), notes, k.warning);
    }
    case 'highlight': {
      const colour = a.next();
      const pat = a.next();
      const group = a.next();
      if (/colorcodes/i.test(colour)) return { ok: false, reason: 'Highlight with colorcodes (no equivalent)' };
      const c = jmcColours(colour);
      if (!c) return { ok: false, reason: `Unknown highlight colour ${colour}` };
      const pattern = withLevel(ctx, { base: depth, shift: 0 }, () => convPattern(pat, depth, ctx));
      notes.push('Arguments swapped, colour mapped');
      const warn = c.dropped.length > 0 ? `Colour words not understood and dropped: ${c.dropped.join(', ')}` : undefined;
      return done(`#highlight {${pattern}} {${c.colours}}`, groupOf(group), notes, warn);
    }
    case 'substitute': {
      const pat = a.next();
      const repl = a.next();
      const pattern = withLevel(ctx, { base: depth, shift: 0 }, () => convPattern(pat, depth, ctx));
      if (repl.trim() === '.') return done(`#gag {${pattern}}`, null, ['Substitute with . is a gag']);
      const r = jmcColourCodes(withLevel(ctx, { base: depth, shift: 0 }, () => convText(repl, depth, ctx)));
      return done(`#substitute {${pattern}} {${r}}`, null, notes);
    }
    case 'gag': {
      const pat = a.next();
      const pattern = withLevel(ctx, { base: depth, shift: 0 }, () => convPattern(pat, depth, ctx));
      return done(`#gag {${pattern}}`, null, notes);
    }
  }
  return { ok: false, reason: `#${name} is not a rule` };
}

function done(line: string, group: string | null, notes: string[], warning?: string): RuleResult {
  if (!checkBraces(line).ok) return { ok: false, reason: 'Unbalanced braces after translation' };
  const r: RuleResult = { ok: true, line, group };
  if (notes.length > 0) r.reason = notes.join('; ');
  if (warning) r.warning = warning;
  return r;
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

/**
 * Translates a JMC file (and what it `#read`s) into `out`, then each file
 * of `rest` that nothing read (after `before(file)`), with one shared
 * state: a `#tickon` in global.set uses the profile's `#ticksize`.
 */
export function translateJmc(entry: SourceFile, res: Resolver, out: Out, rest: SourceFile[] = [], before: (f: SourceFile) => void = () => {}): void {
  const state: JmcState = { cmdChar: detectCmdChar(entry.text), tickSize: 60, multiAction: false, actions: 0 };
  if (state.cmdChar !== '#') out.warnFile(`The file uses ${state.cmdChar} as the command character; it was changed to #.`);
  translateFile(entry, res, out, state);
  for (const f of rest) {
    if (res.used.has(f.name)) continue;
    before(f);
    translateFile(f, res, out, state);
  }
  if (!state.multiAction && state.actions > 0) {
    out.warnFile('JMC fires only the first matching action (#multiaction OFF); WebCockpit fires every matching action, in priority order.');
  }
  out.setClass(null);
}

function translateFile(file: SourceFile, res: Resolver, out: Out, state: JmcState): void {
  res.within(file, () => {
    for (const st of scanStatements(file, { cmdChar: state.cmdChar, joinClose: true, lineComment: state.cmdChar + state.cmdChar })) statement(st, res, out, state);
  });
}

function statement(st: Statement, res: Resolver, out: Out, state: JmcState): void {
  const cc = state.cmdChar;
  const t = st.text.trim();
  if (t.startsWith(cc + cc)) {
    // A section comment closes the open group, so it never sits inside one.
    out.setClass(null);
    out.raw(nopLine(t.slice(2).trim()));
    return;
  }
  if (!t.startsWith(cc)) {
    out.keep(st, 'Text line (JMC sends it to the game when the file is read)');
    return;
  }
  const word = /^\S+?(?=[\s{]|$)/.exec(t.slice(cc.length))?.[0] ?? '';
  const rest = t.slice(cc.length + word.length);
  const name = jmcCommand(word);
  const ctx: Ctx = { levels: [], warnings: new Set(), state };
  const finish = (line: string, group: string | null, reason?: string, warning?: string) => {
    const warns = [...(warning ? [warning] : []), ...ctx.warnings];
    const note: { reason?: string; warning?: string } = {};
    if (reason) note.reason = reason;
    if (warns.length > 0) note.warning = warns.join(' ');
    out.translated(st, line, note, group);
  };
  if (name === null) {
    if (/^\d+(?::\d+)?$/.test(word)) {
      const line = withLevel(ctx, { base: 0, shift: 0 }, () => convBody(t, 0, ctx));
      finish(line, null);
      return;
    }
    out.keep(st, `Unknown JMC command #${word}`);
    return;
  }
  switch (name) {
    case 'action':
    case 'alias':
    case 'hotkey':
    case 'highlight':
    case 'substitute':
    case 'gag': {
      const r = translateRule(name, rest, 0, ctx);
      if (!r.ok) out.keep(st, r.reason);
      else finish(r.line, r.group, r.reason, r.warning);
      return;
    }
    case 'nop':
      out.setClass(null);
      out.raw(nopLine(rest.trim()));
      return;
    case 'read': {
      const path = new Args(rest).next();
      const got = res.read(path);
      if (!got.ok) {
        out.keep(st, got.reason);
        return;
      }
      out.item(st, 'translated', { reason: `Inlined ${got.file.name}` });
      out.setClass(null);
      out.raw(nopLine(`--- ${got.file.name} ---`));
      translateFile(got.file, res, out, state);
      out.setClass(null);
      out.raw(nopLine(`--- end of ${got.file.name} ---`));
      return;
    }
    case 'group': {
      const a = new Args(rest);
      const op = a.next().toLowerCase();
      if (op === 'local' || op === 'global') out.skip(st, 'Group scope (local/global) has no meaning here');
      else if (op === 'disable' || op === 'enable') out.keep(st, `Groups cannot be switched ${op === 'disable' ? 'off' : 'on'} here; the group's rules are active`);
      else out.keep(st, `#group ${op} is not supported`);
      return;
    }
    case 'multiaction': {
      state.multiAction = /^\s*\{?\s*on/i.test(rest);
      out.skip(st, 'Client setting (WebCockpit fires every matching action)');
      return;
    }
    case 'ticksize': {
      const n = Number(new Args(rest).next());
      if (Number.isFinite(n) && n > 0) state.tickSize = n;
      out.skip(st, 'Tick size noted; used if #tickon follows');
      return;
    }
    case 'tickon':
    case 'tickset':
      out.translated(st, tickerLine(state), {
        reason: 'Tick timer → #ticker',
        warning: `The ticker runs every ${state.tickSize} s and is not synced to the game's tick.`,
      });
      return;
    case 'tickoff':
    case 'tick':
      out.skip(st, 'Tick timer state');
      return;
    case 'variable': {
      const a = new Args(rest);
      const v = a.next();
      const val = a.next();
      const scope = a.next();
      finish(`#variable {${v}} {${val}}`, null, scope ? `Scope ${scope} dropped` : undefined);
      return;
    }
  }
  if (STATE.has(name)) {
    out.skip(st, 'Client setting with no meaning here');
    return;
  }
  if (KEEP[name]) {
    out.keep(st, KEEP[name]);
    return;
  }
  // Runnable commands (#showme, #math, #if, #wait, #un…, #output …).
  const line = withLevel(ctx, { base: 0, shift: 0 }, () => convBody(t, 0, ctx));
  if (!checkBraces(line).ok) {
    out.keep(st, 'Unbalanced braces');
    return;
  }
  finish(line, null);
}
