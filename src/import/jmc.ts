// JMC (Jaba Mud Client 3.x `.set` files) → WebCockpit profile (ADR 0073
// "Translation rules", research `jmc.md`).
//
// JMC is a TinTin 1.5 dialect. Per statement:
// - command char from the file; abbreviations resolve to the first
//   command in JMC's table order (`#g` #group, `#h` #highlight); JMC
//   commands we cannot translate are kept;
// - `#action [TEXT|RAW|COLOR] {pat} {cmd} {prio} {group}`: the type word
//   dropped (RAW/COLOR kept: they match colour codes), the priority kept,
//   the group as a `#class` block; a pattern starting with `/` is a regex
//   (closing `/flags` optional) and becomes a tt++ pattern with `{…}`
//   groups;
// - an unbraced last argument (JMC's WITH_SPACES: an action, alias or
//   hotkey body, a highlight or gag pattern, a replacement, a value) runs
//   to the end of the command;
// - argument numbers of action, substitute, highlight and gag patterns
//   and bodies, and of #unaction/#unsubstitute/#ungag/#unhighlight, shift
//   up by one: JMC's `%0` is an ordinary wildcard (or the first regex
//   group), tt++'s is the whole match; JMC wildcards are one digit, so a
//   digit after one is escaped in patterns and warned about in bodies;
// - `#highlight {colours} {pattern}` swapped, colours mapped to names in
//   JMC's abbreviation order (`re` red, `bl` black);
// - `#substitute {x} {.}` → `#gag`; `#hot`/`#hotkey` → `#macro`;
//   first-match-only subs, actions and highlights (`#multisubstitute`/
//   `#multiaction`/`#multihighlight` OFF) are warned about;
// - `%%n` and `$$var` de-nested by brace depth (a `$$var` JMC froze at
//   an outer level is warned about), `$n` → `%n`; a single `%n` inside the
//   arguments of #showme, #output, #if, #math and #N is replaced by JMC
//   too (they substitute again), elsewhere it is warned about; `#wait`
//   (deciseconds) wraps the rest of its command list in `#delay`; the tick
//   timer (`#ticksize` + `#tickon`) becomes a `#ticker`;
// - speedwalks in bodies (`3n2w`) expanded while `#speedwalk` is on;
// - `&x` colour codes converted only in #showme/#output with the
//   `colorcodes` colour, elsewhere kept as text; `#if`/`#math` operators
//   `=`, `&`, `|` → `==`, `&&`, `||`, JMC's precedence warned about, text
//   comparisons quoted; `#N cmd` → `#N {cmd}` (no loop counter),
//   `#N:D cmd` unrolled into `#delay`s; `#beep` → `#bell`;
// - an alias body with a `$var` and no `%n` warned about (typed
//   arguments are appended here);
// - `##` comments → `#nop` (closing an open group first); state commands of the header are skipped;
//   JScript (`#use`, `#scriptlet`) and `#status` are kept.

import { checkBraces } from '../script/doc';
import { Args, type Out, type Resolver, type SourceFile, type Statement, detectCmdChar, nopLine, regexToPattern, scanStatements, splitList } from './common';
import { jmcKey } from './keys';

// In the order of JMC's command table (`cmds.h`): `parse_tintin_command`
// takes the first name the word abbreviates, so `#g` is #group, `#h`
// #highlight and `#nop` #nope. Commands JMC does not have but that
// translate harmlessly (#ungag, #unhighlight, #unvariable) come last.
const COMMANDS = [
  'variable',
  'action',
  'alias',
  'read',
  'if',
  'group',
  'loop',
  'tolower',
  'toupper',
  'antisubstitute',
  'drop',
  'nodrop',
  'cr',
  'echo',
  'highlight',
  'ignore',
  'info',
  'killall',
  'kickall',
  'log',
  'map',
  'mark',
  'math',
  'message',
  'output',
  'path',
  'pathdir',
  'presub',
  'return',
  'scriptlet',
  'savepath',
  'showme',
  'speedwalk',
  'textin',
  'substitute',
  'gag',
  'tick',
  'tickon',
  'tickoff',
  'tickset',
  'ticksize',
  'togglesubs',
  'unaction',
  'unalias',
  'unantisubstitute',
  'unpath',
  'unvar',
  'write',
  'zap',
  'hotkey',
  'unhotkey',
  'connect',
  'bell',
  'char',
  'status',
  'tabadd',
  'tabdel',
  'multiaction',
  'multisubstitute',
  'multihighlight',
  'verbatim',
  'nope',
  'quit',
  'hidewindow',
  'restorewindow',
  'tray',
  'reloadscripts',
  'use',
  'unuse',
  'systemexec',
  'ps',
  'tslist',
  'terminate',
  'tskill',
  'play',
  'woutput',
  'wdock',
  'wshow',
  'wpos',
  'wlog',
  'wname',
  'logadd',
  'logpass',
  'flash',
  'next',
  'daa',
  'whisper',
  'userinput',
  'hide',
  'race',
  'spit',
  'stick',
  'lick',
  'feed',
  'colon',
  'wait',
  'wt',
  'break',
  'abort',
  'pinch',
  'resume',
  'tmlist',
  'llist',
  'unsubstitute',
  'comment',
  'sos',
  'grab',
  'help',
  'clean',
  'prefix',
  'winamp',
  'wamp',
  'autoreconnect',
  'run',
  'clear',
  'wclear',
  'loopback',
  'broadcast',
  'strcmp',
  'match',
  'srandom',
  'random',
  'sync',
  'proxy',
  'telnet',
  'websocket',
  'promptend',
  'wsize',
  'replace',
  'secure',
  'codepage',
  'bar',
  'oob',
  'mapper',
  'base64',
  // Not JMC commands.
  'ungag',
  'unhighlight',
  'unvariable',
] as const;

/** Resolves a JMC command word (case-insensitive prefix, first in table order). */
export function jmcCommand(word: string): string | null {
  const w = word.toLowerCase();
  if (w === '') return null;
  return COMMANDS.find((c) => c.startsWith(w)) ?? null;
}

/** Client state with no meaning in WebCockpit: skipped. */
const STATE = new Set([
  'bell',
  'broadcast',
  'char',
  'codepage',
  'colon',
  'comment',
  'cr',
  'echo',
  'flash',
  'help',
  'ignore',
  'info',
  'log',
  'message',
  'oob',
  'pathdir',
  'presub',
  'promptend',
  'proxy',
  'race',
  'savepath',
  'secure',
  'spit',
  'tabadd',
  'tabdel',
  'telnet',
  'togglesubs',
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
  systemexec: 'Shell command (no equivalent)',
  textin: 'File command (no equivalent)',
  return: 'Mapper command (no equivalent)',
  zap: 'Session command (no equivalent)',
};

/** Top-level commands translated as a command line (the rest are kept as unsupported). */
const RUNNABLE = new Set(['showme', 'output', 'if', 'math', 'wait', 'wt', 'unalias', 'unvar', 'unvariable', 'unhotkey']);

/** Removal commands whose pattern is renumbered like the definition's. */
const UNRULE: Record<string, string> = { unaction: 'unaction', unsubstitute: 'unsubstitute', ungag: 'ungag', unhighlight: 'unhighlight' };

/** Commands whose text passes through with only `%`/`$` conversion. */
const PASS = new Set(['unalias', 'unvariable']);

const RENAME: Record<string, string> = { unvar: 'unvariable' };

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

/**
 * JMC colour words in `add_codes` order, with our names (null: no
 * equivalent). A word may abbreviate a name and the first match wins, so
 * `re` is red and `bl` black; numbers 1–32 index the first 32.
 */
const JMC_COLOURS: Array<[string, string | null]> = [
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
const JMC_WORDS: Array<[string, string | null]> = [
  ...JMC_COLOURS,
  ...JMC_COLOURS.map(([j, o]): [string, string | null] => [`b ${j}`, `b ${o}`]),
  ['bold', 'bold'],
  ['faint', null],
  ['blink', 'blink'],
  ['italic', 'italic'],
  ['reverse', 'reverse'],
];

/** A JMC colour list (`light red, b blue, bold`) as our highlight colour names, or null. */
export function jmcColours(list: string): { colours: string; dropped: string[] } | null {
  const out: string[] = [];
  const dropped: string[] = [];
  for (const raw of list.split(',')) {
    const t = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    if (t === '') continue;
    let hit: string | null | undefined;
    if (/^\d+$/.test(t)) hit = JMC_WORDS[Number(t) - 1]?.[1];
    else hit = JMC_WORDS.find(([j]) => j.startsWith(t))?.[1];
    if (hit) out.push(hit);
    else dropped.push(raw.trim());
  }
  if (out.length === 0) return null;
  return { colours: out.join(', '), dropped };
}

/** True when a #showme/#output colour argument abbreviates `colorcodes` (`add_codes`). */
function isColorCodes(colour: string): boolean {
  const t = colour.trim().toLowerCase();
  return t !== '' && 'colorcodes'.startsWith(t);
}

// JMC's `&x` text codes (`convert_colored_to_ansi`): lowercase is
// ESC[0;3Nm, uppercase ESC[1;3Nm, `&&` a literal `&`. JMC converts them
// only in #showme/#output text whose colour is `colorcodes`.
const AMP_CODES = 'drgybpcw';

/**
 * Escapes each `&` that our engine would read as a variable test
 * (`&name`, `&{name}`, a run before one), so text stays literal.
 */
export function escapeAmp(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '\\' && i + 1 < text.length) {
      out += c + text[i + 1];
      i++;
      continue;
    }
    out += c === '&' && /[\w{&]/.test(text[i + 1] ?? '') ? '\\&' : c;
  }
  return out;
}

/**
 * JMC `&x` colour codes in text as our `<abc>` codes: `&r` → `<019>`
 * (reset, red), `&R` → `<118>` (bold red, as JMC's SGR 1;31), `&&` → `&`.
 * Other `&` sequences stay as written (escaped where our engine would
 * read them as a variable).
 */
export function jmcColourCodes(text: string): string {
  const converted = text.replace(/&([&a-zA-Z])/g, (m, c: string) => {
    if (c === '&') return '\u0000';
    const n = AMP_CODES.indexOf(c.toLowerCase());
    if (n < 0) return m;
    return c === c.toLowerCase() ? `<0${n}9>` : `<1${n}8>`;
  });
  return escapeAmp(converted.replace(/\u0000/g, '&'));
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
// Bodies: `%%n` / `$$var` de-nesting, `$n`, nested commands
// ---------------------------------------------------------------------------

interface Level {
  /** Absolute brace depth where this level's text starts. */
  base: number;
  /** Added to argument numbers (1 for regex actions: JMC's %0 is group 1). */
  shift: number;
  /** Set when a `$var` of this level was seen (JMC expands it in this level's pass). */
  vars?: boolean;
}

/**
 * An argument a JMC command substitutes again when it runs (#showme,
 * #output, #if, #math and #N run `substitute_vars` on their own text): a
 * run too short for every level is still replaced there, with the
 * arguments of the level that was running.
 */
interface Resub {
  /** Brace depth where the argument text starts. */
  base: number;
  /** Index of the level whose arguments the command sees. */
  level: number;
  /** #N: JMC sets %0 to the loop counter. */
  counter: boolean;
}

interface Ctx {
  levels: Level[];
  resub: Resub[];
  warnings: Set<string>;
  state: JmcState;
}

interface JmcState {
  cmdChar: string;
  tickSize: number;
  multiAction: boolean;
  multiSub: boolean;
  multiHighlight: boolean;
  /** `#speedwalk` (JMC's default is on). */
  speedwalk: boolean;
  /** Alias names in the files: JMC tries an alias before a speedwalk. */
  aliases: Set<string>;
  /** Actions translated so far (for the first-match warning). */
  actions: number;
  /** Substitutes (not gags) translated so far (for the first-match warning). */
  subs: number;
  /** Highlights translated so far (for the first-match warning). */
  highlights: number;
}

const isDigit = (c: string | undefined): boolean => c !== undefined && c >= '0' && c <= '9';

/**
 * Converts `%n` / `%%n` / `$n` / `$$var` in plain text at brace depth
 * `depth`: a run of k signs belongs to the innermost level where k =
 * (depth − base) + 1 (JMC's rule), and becomes L+1 `%` signs for level L
 * (tt++ strips one per pass); a `$var` run becomes `$var`.
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
      const k = j - i;
      const digit = text[j];
      if (isDigit(digit)) {
        const s = sign(k, Number(digit), d, ctx, c);
        out += s;
        const after = text[j + 1];
        if (isDigit(after)) {
          ctx.warnings.add(`${text.slice(i, j + 2)} is ${c.repeat(k)}${digit} followed by ${after} in JMC; here ${s}${after} reads as one two-digit argument.`);
        }
        i = j;
        continue;
      }
      if (c === '$' && digit !== undefined && /[A-Za-z_]/.test(digit)) {
        let e = j;
        while (e < text.length && /\w/.test(text[e]!)) e++;
        out += varSign(k, text.slice(j, e), d, ctx);
        i = e - 1;
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

/** Index in `ctx.resub` of the argument a run of k signs at `depth` belongs to, or -1. */
function resubIndex(k: number, depth: number, ctx: Ctx): number {
  for (let i = ctx.resub.length - 1; i >= 0; i--) if (k === depth - ctx.resub[i]!.base + 1) return i;
  return -1;
}

function sign(k: number, n: number, depth: number, ctx: Ctx, ch: string): string {
  for (let L = ctx.levels.length - 1; L >= 0; L--) {
    const lv = ctx.levels[L]!;
    if (k === depth - lv.base + 1) return '%'.repeat(L + 1) + String(n + lv.shift);
  }
  const ri = resubIndex(k, depth, ctx);
  if (ri >= 0) {
    const r = ctx.resub[ri]!;
    const lv = ctx.levels[r.level];
    const s = lv ? '%'.repeat(r.level + 1) + String(n + lv.shift) : ch.repeat(k) + n;
    // Inside #N, %0 is the counter for every pass that runs within it.
    const counter = ctx.resub.slice(0, ri + 1).some((x) => x.counter && x.level === r.level);
    if (counter && n === 0) {
      ctx.warnings.add(`JMC's ${ch.repeat(k)}0 in a repeated command (#N) is the loop counter (1..N); WebCockpit has no counter, so it became ${s}.`);
    }
    return s;
  }
  // Too few signs for this depth: JMC leaves it as text, tt++ replaces it.
  const L = ctx.levels.length - 1;
  const lv = ctx.levels[L];
  ctx.warnings.add(`${ch.repeat(k)}${n} inside braces is left as text by JMC (it needs more ${ch} signs there); WebCockpit replaces it.`);
  return lv ? '%'.repeat(L + 1) + String(n + lv.shift) : ch.repeat(k) + n;
}

/**
 * A `$var` run (`substitute_myvars`: replaced where k = nest + 1, like
 * `%n`). Ours reads `$var` when the command holding it runs, so a run of
 * the innermost level is `$var`; one of an outer level was read (frozen)
 * when that level ran, which is warned about. Other runs stay as written.
 */
function varSign(k: number, name: string, depth: number, ctx: Ctx): string {
  const inner = ctx.levels.length - 1;
  let L = -1;
  for (let l = inner; l >= 0 && L < 0; l--) if (k === depth - ctx.levels[l]!.base + 1) L = l;
  if (L >= 0) ctx.levels[L]!.vars = true;
  else {
    const ri = resubIndex(k, depth, ctx);
    if (ri >= 0) L = ctx.resub[ri]!.level;
  }
  if (L < 0) return '$'.repeat(k) + name;
  if (L < inner) {
    ctx.warnings.add(`JMC read ${'$'.repeat(k)}${name} when the outer rule ran (its value was frozen into the inner rule); here $${name} is read when the inner rule runs.`);
  }
  return '$' + name;
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
      if (isDigit(digit)) {
        out += sign(j - i, Number(digit), depth, ctx, '%');
        i = j;
        // JMC wildcards are one digit: `%05` is %0 then a literal 5.
        if (isDigit(pat[i + 1])) {
          out += '\\' + pat[i + 1];
          i++;
        }
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

/** Runs `fn` with an argument at `base` that its command substitutes again. */
function withResub<T>(ctx: Ctx, base: number, counter: boolean, fn: () => T): T {
  ctx.resub.push({ base, level: ctx.levels.length - 1, counter });
  try {
    return fn();
  } finally {
    ctx.resub.pop();
  }
}

/** Longest single step of a speedwalk that is expanded (`99999n` is left alone). */
const SPEEDWALK_MAX = 100;

/**
 * JMC speedwalk (`is_speedwalk_dirs`, `do_speedwalk`): a word of n e s w
 * u d and digits with at least one letter is a walk, a count repeating
 * the letter after it (`3n2w` → n n n w w; a trailing count is dropped).
 * Null when `word` is not one.
 */
export function jmcSpeedwalk(word: string): string[] | null {
  if (!/^[nsewud\d]+$/.test(word) || !/[nsewud]/.test(word)) return null;
  const out: string[] = [];
  for (const m of word.matchAll(/(\d*)([nsewud])/g)) {
    const n = m[1] === '' ? 1 : Number(m[1]);
    if (n > SPEEDWALK_MAX) return null;
    for (let k = 0; k < n; k++) out.push(m[2]!);
  }
  return out;
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
      continue;
    }
    const walk = ctx.state.speedwalk && !ctx.state.aliases.has(p) ? jmcSpeedwalk(p) : null;
    if (walk && !(walk.length === 1 && walk[0] === p)) {
      ctx.warnings.add(`Speedwalk ${p} expanded (JMC speedwalk).`);
      out.push(...walk);
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
    case 'showme':
    case 'output':
      return showLine(name, rest, depth, ctx);
    case 'action':
    case 'alias':
    case 'hotkey':
    case 'highlight':
    case 'substitute':
    case 'gag':
    case 'unaction':
    case 'unsubstitute':
    case 'ungag':
    case 'unhighlight': {
      const r = UNRULE[name] ? unRule(name, rest, inner, ctx) : translateRule(name, rest, inner, ctx);
      if (r.ok) {
        if (r.warning) ctx.warnings.add(r.warning);
        return r.line;
      }
      ctx.warnings.add(`${r.reason}; the nested #${name} was kept as written.`);
      return '#' + cmd;
    }
    case 'unhotkey': {
      const key = new Args(rest).next();
      const k = jmcKey(key);
      if (k.ok) return `#unmacro {${k.key}}`;
      ctx.warnings.add(`${k.reason}; the nested #unhotkey was kept as written.`);
      return '#' + cmd;
    }
    case 'if': {
      // JMC: #if {expr} {then} {else}; then and else are WITH_SPACES.
      const a = new Args(rest);
      const at = () => (a.lastBraced ? inner : depth);
      const c0 = a.next();
      const cAt = at();
      const cond = exprText(withResub(ctx, cAt, false, () => convText(c0, cAt, ctx)), ctx, true);
      const t0 = a.nextOrRest();
      const tAt = at();
      const then = withResub(ctx, tAt, false, () => convBody(t0, tAt, ctx));
      let other: string | null = null;
      if (!a.done) {
        const e0 = a.nextOrRest();
        const eAt = at();
        other = withResub(ctx, eAt, false, () => convBody(e0, eAt, ctx));
      }
      return `#if {${cond}} {${then}}` + (other !== null ? ` {${other}}` : '');
    }
    case 'math': {
      const a = new Args(rest);
      const v = a.next();
      const cv = convText(v, a.lastBraced ? inner : depth, ctx);
      const e0 = a.nextOrRest();
      const eAt = a.lastBraced ? inner : depth;
      const expr = exprText(withResub(ctx, eAt, false, () => convText(e0, eAt, ctx)), ctx, false);
      return `#math {${cv}} {${expr}}`;
    }
    case 'tickon':
    case 'tickset':
      ctx.warnings.add(`The JMC tick timer became a #ticker every ${ctx.state.tickSize} s; it is not synced to the game's tick.`);
      return tickerLine(ctx.state);
    case 'tickoff':
      return '#unticker {tick}';
    case 'nope':
      return '#nop' + rest;
    case 'variable': {
      const a = new Args(rest);
      const v = a.next();
      const cv = convText(v, a.lastBraced ? inner : depth, ctx);
      const val = a.nextOrRest();
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

/**
 * JMC `#showme` / `#output` (`{text}` or `{colour} {text}`, both
 * WITH_SPACES) as our #showme. `&x` codes are converted only when the
 * colour abbreviates `colorcodes` (`add_codes`); otherwise they are text.
 */
function showLine(name: string, rest: string, depth: number, ctx: Ctx): string {
  const a = new Args(rest);
  const text = (t: string) => {
    const at = a.lastBraced ? depth + 1 : depth;
    return withResub(ctx, at, false, () => convText(t, at, ctx));
  };
  const first = a.nextOrRest();
  if (a.done) return `#showme {${escapeAmp(text(first))}}`;
  const t = text(a.nextOrRest());
  if (isColorCodes(first)) return `#showme {${jmcColourCodes(t)}}`;
  const prefix = jmcColourPrefix(first);
  if (prefix === null) ctx.warnings.add(`#${name} colour ${first} not understood and dropped.`);
  return `#showme {${prefix ?? ''}${escapeAmp(t)}}`;
}

/** Most repeats `#N:delay` is unrolled into. */
const UNROLL_MAX = 20;

/**
 * JMC `#N cmd` / `#N:delay cmd` (`do_cycle`): runs cmd N times; with a
 * delay (deciseconds), one run per delay on a timer. Our engine runs
 * `#N {cmd}`; a delayed repeat is unrolled into `#delay`s. JMC's %0 in
 * cmd is the counter, which ours lacks (warned about in `sign`).
 */
function repeat(cmd: string, n: number, ds: number, rest: string, depth: number, ctx: Ctx): string {
  const a = new Args(rest);
  const braced = a.nextBraced;
  const raw = braced ? a.next() : rest.trim();
  const at = braced ? depth + 1 : depth;
  const body = withResub(ctx, at, true, () => convBody(raw, at, ctx));
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
 * JMC expression operators as ours (`conv_to_ints`): a lone `=` is `==`,
 * a lone `&` is `&&`, a lone `|` is `||`. Quoted text is left alone.
 */
export function jmcOperators(expr: string): string {
  let out = '';
  let quoted = false;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i]!;
    if (c === '\\' && i + 1 < expr.length) {
      out += c + expr[i + 1];
      i++;
      continue;
    }
    if (c === '"') quoted = !quoted;
    if (!quoted && (c === '&' || c === '|')) {
      out += c + c;
      if (expr[i + 1] === c) i++;
      continue;
    }
    if (!quoted && c === '=') {
      const prev = expr[i - 1];
      if (expr[i + 1] === '=') {
        out += '==';
        i++;
        continue;
      }
      if (prev === undefined || !'=!<>'.includes(prev)) {
        out += '==';
        continue;
      }
    }
    out += c;
  }
  return out;
}

/**
 * True when JMC's precedence gives another result (`do_one_inside`: at
 * one parenthesis level `*` goes before `/` and `+` before `-`, so
 * `10-2+3` is 5): a `-` followed by a `+`, or a `/` by a `*`, with no
 * comparison or logic operator between them.
 */
export function jmcOrderDiffers(expr: string): boolean {
  const stack = [{ minus: false, div: false }];
  let quoted = false;
  let prev = '';
  for (const c of expr) {
    if (c === '"') quoted = !quoted;
    if (quoted || c === '"' || c === ' ') {
      if (c === '"') prev = c;
      continue;
    }
    const top = stack[stack.length - 1]!;
    if (c === '(') stack.push({ minus: false, div: false });
    else if (c === ')') {
      if (stack.length > 1) stack.pop();
    } else if (c === '-') {
      // A `-` after an operand is a subtraction; otherwise a sign.
      if (/[\w)"%$]/.test(prev)) top.minus = true;
    } else if (c === '+') {
      if (top.minus) return true;
    } else if (c === '/') top.div = true;
    else if (c === '*') {
      if (top.div) return true;
    } else if ('<>=!&|'.includes(c)) {
      top.minus = false;
      top.div = false;
    }
    prev = c;
  }
  return false;
}

/** A converted #if / #math expression: operators mapped, precedence warned, comparisons quoted (#if). */
function exprText(expr: string, ctx: Ctx, quote: boolean): string {
  const e = jmcOperators(expr);
  if (jmcOrderDiffers(e)) {
    ctx.warnings.add(`JMC evaluates * before / and + before - (10-2+3 is 5 there); {${e}} may give another result here, check it.`);
  }
  if (!quote) return e;
  const q = quoteComparisons(e);
  if (q.changed) ctx.warnings.add('JMC\'s #if compares numbers only; text comparisons were quoted ("$a" == "b") so they compare text here.');
  return q.text;
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

/**
 * A JMC regex pattern (`ACTION::SetLeft`): any pattern starting with `/`;
 * trailing flags after a closing `/` are taken off, and without one the
 * rest is the regex. Null when `pat` is not a regex.
 */
export function jmcRegex(pat: string, flagChars = 'img'): { body: string; flags: string } | null {
  if (!pat.startsWith('/')) return null;
  const s = pat.slice(1);
  let i = s.length - 1;
  while (i >= 0 && flagChars.includes(s[i]!)) i--;
  const r = i >= 0 && s[i] === '/' ? { body: s.slice(0, i), flags: s.slice(i + 1) } : i < 0 ? { body: '', flags: '' } : { body: s, flags: '' };
  return r.body === '' ? null : r;
}

/**
 * Added to the argument numbers of action, substitute, highlight and gag
 * patterns and their bodies. JMC's wildcards are %0–%9 and %0 is an
 * ordinary capture; in tt++ %0 is the whole match, so JMC %n becomes %n+1.
 * Alias arguments keep their numbers (%0 is all of them in both).
 */
const WILD_SHIFT = 1;

function groupOf(g: string | undefined): string | null {
  const t = (g ?? '').trim();
  return t === '' || t.toLowerCase() === 'default' ? null : t;
}

/** An action pattern (wildcards or `/regex/flags`) at `depth`. */
function actionPattern(pat: string, depth: number, ctx: Ctx, notes: string[]): { ok: true; pattern: string } | { ok: false; reason: string } {
  const re = jmcRegex(pat);
  if (!re) return { ok: true, pattern: withLevel(ctx, { base: depth, shift: WILD_SHIFT }, () => convPattern(pat, depth, ctx)) };
  const r = regexToPattern(re.body, re.flags);
  if (!r.ok) return { ok: false, reason: r.reason };
  notes.push('Regex pattern rewritten');
  if (/[gm]/.test(re.flags)) notes.push('regex flags g/m dropped');
  return { ok: true, pattern: r.pattern };
}

/**
 * Translates a definition (`rest`: the text after the command word).
 * Braced arguments sit at `depth`; an unbraced one (JMC reads the
 * second, WITH_SPACES, argument to the end) one level out.
 */
function translateRule(name: string, rest: string, depth: number, ctx: Ctx): RuleResult {
  const a = new Args(rest);
  const notes: string[] = [];
  const at = () => (a.lastBraced ? depth : depth - 1);
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
      const patAt = at();
      const body = a.nextOrRest();
      const bodyAt = at();
      let pri = '';
      let group = a.next();
      if (/^\d/.test(group)) {
        pri = group;
        group = a.nextOrRest();
      }
      if (type !== 'TEXT') return { ok: false, reason: `${type} action (matches colour codes)` };
      const p = actionPattern(pat, patAt, ctx, notes);
      if (!p.ok) return p;
      // Regex: JMC's %0 is group 1; wildcards: %0 is renumbered %1. Either way +1.
      const b = withLevel(ctx, { base: bodyAt, shift: WILD_SHIFT }, () => convBody(body, bodyAt, ctx));
      const pr = pri !== '' && Number(pri) !== 5 ? ` {${pri}}` : '';
      ctx.state.actions++;
      return done(`#action {${p.pattern}} {${b}}${pr}`, groupOf(group), notes);
    }
    case 'alias': {
      const key = a.next();
      const body = a.nextOrRest();
      const bodyAt = at();
      const group = a.next();
      if (jmcRegex(key, 'i')) return { ok: false, reason: 'Regex alias (not supported)' };
      const lv: Level = { base: bodyAt, shift: 0 };
      const b = withLevel(ctx, lv, () => convBody(body, bodyAt, ctx));
      // Both append typed arguments to a body they leave unchanged; JMC
      // also counts a variable its own pass expands as a change.
      const warn = !/%\d/.test(b) && lv.vars ? 'JMC appends the typed arguments only when no variable in the body expands; WebCockpit appends them to a body without %n.' : undefined;
      return done(`#alias {${key}} {${b}}`, groupOf(group), notes, warn);
    }
    case 'hotkey': {
      const key = a.next();
      const body = a.nextOrRest();
      const bodyAt = at();
      const group = a.next();
      const k = jmcKey(key);
      if (!k.ok) return { ok: false, reason: k.reason };
      const b = withLevel(ctx, { base: bodyAt, shift: 0 }, () => convBody(body, bodyAt, ctx));
      notes.push(`Hotkey ${key} → macro ${k.key}`);
      return done(`#macro {${k.key}} {${b}}`, groupOf(group), notes, k.warning);
    }
    case 'highlight': {
      const colour = a.next();
      const pat = a.nextOrRest();
      const patAt = at();
      const group = a.next();
      if (/colorcodes/i.test(colour)) return { ok: false, reason: 'Highlight with colorcodes (no equivalent)' };
      const c = jmcColours(colour);
      if (!c) return { ok: false, reason: `Unknown highlight colour ${colour}` };
      const pattern = withLevel(ctx, { base: patAt, shift: WILD_SHIFT }, () => convPattern(pat, patAt, ctx));
      notes.push('Arguments swapped, colour mapped');
      const warn = c.dropped.length > 0 ? `Colour words not understood and dropped: ${c.dropped.join(', ')}` : undefined;
      ctx.state.highlights++;
      return done(`#highlight {${pattern}} {${c.colours}}`, groupOf(group), notes, warn);
    }
    case 'substitute': {
      const pat = a.next();
      const patAt = at();
      const repl = a.nextOrRest();
      const replAt = at();
      const pattern = withLevel(ctx, { base: patAt, shift: WILD_SHIFT }, () => convPattern(pat, patAt, ctx));
      if (repl.trim() === '.') return done(`#gag {${pattern}}`, null, ['Substitute with . is a gag']);
      // JMC shows the replacement as written: `&x` is not a colour code here.
      const r = escapeAmp(withLevel(ctx, { base: replAt, shift: WILD_SHIFT }, () => convText(repl, replAt, ctx)));
      ctx.state.subs++;
      return done(`#substitute {${pattern}} {${r}}`, null, notes);
    }
    case 'gag': {
      // Unbraced, the whole rest is the pattern (`gag_command`).
      const pat = a.nextOrRest();
      const patAt = at();
      const pattern = withLevel(ctx, { base: patAt, shift: WILD_SHIFT }, () => convPattern(pat, patAt, ctx));
      return done(`#gag {${pattern}}`, null, notes);
    }
  }
  return { ok: false, reason: `#${name} is not a rule` };
}

/** `#unaction` / `#unsubstitute` / `#ungag` / `#unhighlight` with the pattern renumbered as its definition's. */
function unRule(name: string, rest: string, depth: number, ctx: Ctx): RuleResult {
  const a = new Args(rest);
  const pat = a.nextOrRest();
  const at = a.lastBraced ? depth : depth - 1;
  const p = name === 'unaction' ? actionPattern(pat, at, ctx, []) : { ok: true as const, pattern: withLevel(ctx, { base: at, shift: WILD_SHIFT }, () => convPattern(pat, at, ctx)) };
  if (!p.ok) return p;
  return done(`#${UNRULE[name]} {${p.pattern}}`, null, []);
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

/** Alias names defined in `texts` (for the speedwalk check). */
function aliasNames(texts: string[], cc: string): Set<string> {
  const esc = cc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|[;{])\\s*${esc}al(?:i(?:as?)?)?(?=[\\s{])\\s*(?:\\{([^{}]*)\\}|(\\S+))`, 'gim');
  const out = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(re)) out.add((m[1] ?? m[2] ?? '').trim());
  return out;
}

/** A JMC on/off switch (`#multiaction`, …): no argument toggles; `other` is what any other word does. */
function onOff(cur: boolean, rest: string, other: (cur: boolean) => boolean): boolean {
  const w = new Args(rest).next().toLowerCase();
  if (w === '') return !cur;
  if (w === 'on') return true;
  if (w === 'off') return false;
  return other(cur);
}

/**
 * Translates a JMC file (and what it `#read`s) into `out`, then each file
 * of `rest` that nothing read (after `before(file)`), with one shared
 * state: a `#tickon` in global.set uses the profile's `#ticksize`.
 */
export function translateJmc(entry: SourceFile, res: Resolver, out: Out, rest: SourceFile[] = [], before: (f: SourceFile) => void = () => {}): void {
  const cmdChar = detectCmdChar(entry.text);
  const state: JmcState = {
    cmdChar,
    tickSize: 60,
    multiAction: false,
    multiSub: false,
    multiHighlight: false,
    speedwalk: true,
    aliases: aliasNames([entry, ...rest].map((f) => f.text), cmdChar),
    actions: 0,
    subs: 0,
    highlights: 0,
  };
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
  if (!state.multiSub && state.subs > 1) {
    out.warnFile('JMC applies only the first matching substitute per line (#multisubstitute OFF); WebCockpit applies every matching one, each on the text the ones before it left.');
  }
  if (!state.multiHighlight && state.highlights > 1) {
    out.warnFile('JMC applies only the first matching highlight per line (#multihighlight OFF); WebCockpit applies every matching one.');
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
  const ctx: Ctx = { levels: [], resub: [], warnings: new Set(), state };
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
    case 'gag':
    case 'unaction':
    case 'unsubstitute':
    case 'ungag':
    case 'unhighlight': {
      const r = UNRULE[name] ? unRule(name, rest, 0, ctx) : translateRule(name, rest, 0, ctx);
      if (!r.ok) out.keep(st, r.reason);
      else finish(r.line, r.group, r.reason, r.warning);
      return;
    }
    case 'nope':
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
    case 'multiaction':
      state.multiAction = onOff(state.multiAction, rest, (c) => c);
      out.skip(st, 'Client setting (WebCockpit fires every matching action)');
      return;
    case 'multisubstitute':
      state.multiSub = onOff(state.multiSub, rest, (c) => !c);
      out.skip(st, 'Client setting (WebCockpit applies every matching substitute)');
      return;
    case 'multihighlight':
      state.multiHighlight = onOff(state.multiHighlight, rest, (c) => c);
      out.skip(st, 'Client setting (WebCockpit applies every matching highlight)');
      return;
    case 'speedwalk': {
      // `speedwalk_command` compares the raw argument: only `on` is on.
      const arg = rest.trim();
      state.speedwalk = arg === '' ? !state.speedwalk : arg.toLowerCase() === 'on';
      out.skip(st, `Speedwalk ${state.speedwalk ? 'on: walks like 3n2w in bodies are expanded' : 'off'}`);
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
      const val = a.nextOrRest();
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
  if (!RUNNABLE.has(name)) {
    out.keep(st, `Unsupported JMC command #${name}`);
    return;
  }
  // Runnable commands (#showme, #math, #if, #wait, #output, #unalias …).
  const line = withLevel(ctx, { base: 0, shift: 0 }, () => convBody(t, 0, ctx));
  if (!checkBraces(line).ok) {
    out.keep(st, 'Unbalanced braces');
    return;
  }
  finish(line, null);
}
