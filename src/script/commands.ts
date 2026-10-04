// The one command table shared by the profile document model and the script
// engine (ADR 0015 "Two parsers, one language"; spec §3).
//
// Every tt++ command is listed, not only the ones we run, so an abbreviation
// resolves the way tt++ resolves it: `#re` is `#read` (inert), not
// `#reconnect`.
//
// Resolution rule (ADR 0015, P1 notes):
// - Case-insensitive. An exact name always wins.
// - Otherwise the first command in alphabetical order whose name starts with
//   the word, as tt++ walks its alphabetical table. So `#a` → action,
//   `#al` → alias, `#hi` → highlight (not history), `#sub` → substitute,
//   `#show` → showme, `#var` → variable, `#mac` → macro, `#tick` → ticker,
//   `#ses` → session, `#un` → unaction, `#con` → config, `#conn` → connect.
// - One exception: a one-letter word that starts several names is
//   'ambiguous' (tt++ would silently pick the first, e.g. `#s` → #scan).
// - A word longer than a name never matches it: `#macros` is unknown.
// - WebCockpit-only commands in `EXACT_ONLY` (`#menu`) need the full name.
//
// `#script` and `#lua` are inert except in the forms that act on the
// script library (spec §3, §2.10, ADR 0051): see `scriptCommandArgs`.

/** What a command does, for the engine's dispatch and the editor's hints. */
export type CommandKind =
  /** Defines a rule or a variable (`#action`, `#variable`, `#ticker` …). */
  | 'define'
  /** Removes one (`#unaction`, `#unvariable` …). */
  | 'undefine'
  /** `#if`, `#elseif`, `#else`. */
  | 'control'
  /** Any other command the engine runs (`#showme`, `#nop`, `#math` …). */
  | 'command'
  /** WebCockpit's own commands (`#connect`, `#help` …). */
  | 'client'
  /** A tt++ command WebCockpit keeps verbatim and never runs. */
  | 'inert';

/** Where the command sits in spec §3. */
export type CommandTier = 'must' | 'should' | 'client' | 'inert' | 'unsupported';

/** The rule stores a define/undefine command writes to. */
export type RuleKind =
  | 'action'
  | 'alias'
  | 'highlight'
  | 'substitute'
  | 'gag'
  | 'macro'
  | 'variable'
  | 'ticker'
  | 'delay'
  | 'event';

export interface CommandEntry {
  /** Canonical lower-case name without `#`. */
  readonly name: string;
  readonly kind: CommandKind;
  readonly tier: CommandTier;
  /** For define/undefine: the rule store it touches. */
  readonly rule?: RuleKind;
  /** True when the command is kept verbatim and does nothing. */
  readonly inert: boolean;
  /** Shortest word that resolves to this command (see the rule above). */
  readonly minAbbrev: number;
  /** One-line hint shown when an inert command runs or is edited. */
  readonly hint?: string;
}

type Spec = [name: string, kind: CommandKind, tier: CommandTier, rule?: RuleKind];

const HINT_FILE = 'File commands are not available in the browser.';
const HINT_SESSION = 'WebCockpit has one session; session commands do nothing.';
const HINT_SCREEN = 'Screen and terminal commands do nothing in the browser.';
const HINT_SCRIPT = 'Shell commands do nothing in the browser.';
const HINT_LUA = 'Only #lua {script} {function} {args} runs (a function a script exported); other forms do nothing.';
const HINT_SCRIPT_CMD = 'Only #script list, help, set, enable, disable and reload run; other forms do nothing.';
const HINT_LATER = 'Not supported yet; kept in the profile as written.';

// Alphabetical by name (checked by a test); order is the resolution order.
const SPECS: readonly Spec[] = [
  ['action', 'define', 'must', 'action'],
  ['alias', 'define', 'must', 'alias'],
  ['all', 'inert', 'inert'],
  ['banner', 'inert', 'inert'],
  ['bell', 'inert', 'inert'],
  ['break', 'inert', 'unsupported'],
  ['buffer', 'inert', 'inert'],
  ['button', 'inert', 'inert'],
  ['case', 'inert', 'unsupported'],
  ['cat', 'inert', 'unsupported'],
  ['chat', 'inert', 'inert'],
  ['class', 'command', 'should'],
  ['commands', 'inert', 'inert'],
  ['config', 'inert', 'inert'],
  ['connect', 'client', 'client'],
  ['continue', 'inert', 'unsupported'],
  ['cr', 'inert', 'inert'],
  ['cursor', 'inert', 'inert'],
  ['daemon', 'inert', 'inert'],
  ['debug', 'inert', 'inert'],
  ['default', 'inert', 'unsupported'],
  ['delay', 'define', 'must', 'delay'],
  ['dictionary', 'inert', 'inert'],
  ['disconnect', 'client', 'client'],
  ['draw', 'inert', 'inert'],
  ['echo', 'inert', 'unsupported'],
  ['edit', 'inert', 'inert'],
  ['else', 'control', 'must'],
  ['elseif', 'control', 'must'],
  ['end', 'inert', 'inert'],
  ['event', 'define', 'should', 'event'],
  ['foreach', 'inert', 'unsupported'],
  ['format', 'command', 'should'],
  ['function', 'inert', 'unsupported'],
  ['gag', 'define', 'must', 'gag'],
  ['grep', 'inert', 'inert'],
  ['gts', 'inert', 'inert'],
  ['help', 'client', 'client'],
  ['highlight', 'define', 'must', 'highlight'],
  ['history', 'inert', 'inert'],
  ['if', 'control', 'must'],
  ['ignore', 'inert', 'inert'],
  ['info', 'inert', 'inert'],
  ['kill', 'inert', 'unsupported'],
  ['line', 'inert', 'inert'],
  ['list', 'inert', 'unsupported'],
  ['local', 'inert', 'unsupported'],
  ['log', 'inert', 'inert'],
  ['loop', 'inert', 'unsupported'],
  ['lua', 'inert', 'inert'],
  ['macro', 'define', 'must', 'macro'],
  ['map', 'inert', 'inert'],
  ['math', 'command', 'should'],
  ['menu', 'client', 'client'],
  ['message', 'command', 'should'],
  ['nop', 'command', 'must'],
  ['parse', 'inert', 'unsupported'],
  ['path', 'inert', 'inert'],
  ['pathdir', 'inert', 'inert'],
  ['perf', 'client', 'client'],
  ['port', 'inert', 'inert'],
  ['prompt', 'inert', 'unsupported'],
  ['read', 'inert', 'inert'],
  ['reconnect', 'client', 'client'],
  ['regexp', 'inert', 'unsupported'],
  ['replace', 'inert', 'unsupported'],
  ['replay', 'client', 'client'],
  ['return', 'inert', 'unsupported'],
  ['run', 'inert', 'inert'],
  ['runlog', 'client', 'client'],
  ['scan', 'inert', 'inert'],
  ['screen', 'inert', 'inert'],
  ['script', 'inert', 'inert'],
  ['send', 'inert', 'inert'],
  ['session', 'inert', 'inert'],
  ['showme', 'command', 'must'],
  ['snoop', 'inert', 'inert'],
  ['split', 'inert', 'inert'],
  ['ssl', 'inert', 'inert'],
  ['substitute', 'define', 'must', 'substitute'],
  ['switch', 'inert', 'unsupported'],
  ['system', 'inert', 'inert'],
  ['tab', 'inert', 'unsupported'],
  ['test', 'inert', 'inert'],
  ['textin', 'inert', 'inert'],
  ['ticker', 'define', 'must', 'ticker'],
  ['time', 'inert', 'inert'],
  ['unaction', 'undefine', 'must', 'action'],
  ['unalias', 'undefine', 'must', 'alias'],
  ['unbutton', 'inert', 'inert'],
  ['undelay', 'undefine', 'must', 'delay'],
  ['unevent', 'undefine', 'should', 'event'],
  ['unfunction', 'inert', 'unsupported'],
  ['ungag', 'undefine', 'must', 'gag'],
  ['unhighlight', 'undefine', 'must', 'highlight'],
  ['unlocal', 'inert', 'unsupported'],
  ['unmacro', 'undefine', 'must', 'macro'],
  ['unpathdir', 'inert', 'inert'],
  ['unprompt', 'inert', 'unsupported'],
  ['unsplit', 'inert', 'inert'],
  ['unsubstitute', 'undefine', 'must', 'substitute'],
  ['untab', 'inert', 'unsupported'],
  ['unticker', 'undefine', 'must', 'ticker'],
  ['unvariable', 'undefine', 'must', 'variable'],
  ['variable', 'define', 'must', 'variable'],
  ['while', 'inert', 'unsupported'],
  ['write', 'inert', 'inert'],
  ['zap', 'inert', 'inert'],
];

const FILE_CMDS = new Set(['read', 'write', 'log', 'textin', 'scan', 'edit', 'cat']);
const SESSION_CMDS = new Set(['session', 'gts', 'zap', 'all', 'snoop', 'port', 'chat', 'ssl', 'daemon', 'run', 'end']);
const SCRIPT_CMDS = new Set(['lua', 'system', 'script']);

function hintFor(name: string, tier: CommandTier): string | undefined {
  if (tier === 'unsupported') return HINT_LATER;
  if (tier !== 'inert') return undefined;
  if (FILE_CMDS.has(name)) return HINT_FILE;
  if (SESSION_CMDS.has(name)) return HINT_SESSION;
  if (name === 'lua') return HINT_LUA;
  if (name === 'script') return HINT_SCRIPT_CMD;
  if (SCRIPT_CMDS.has(name)) return HINT_SCRIPT;
  return HINT_SCREEN;
}

/**
 * WebCockpit's own commands that are not tt++ commands and resolve only by
 * their full name, so they never take over a tt++ abbreviation (`#me`
 * stays #message, not #menu).
 */
const EXACT_ONLY: ReadonlySet<string> = new Set(['menu']);

/** Shortest prefix of `names[i]` that the resolution rule maps to it. */
function minAbbrevOf(all: readonly string[], i: number): number {
  const name = all[i]!;
  if (EXACT_ONLY.has(name)) return name.length;
  const names = all.filter((m) => !EXACT_ONLY.has(m));
  i = names.indexOf(name);
  for (let n = 1; n <= name.length; n++) {
    const w = name.slice(0, n);
    const first = names.findIndex((m) => m.startsWith(w));
    if (first !== i) continue;
    if (n === 1 && names.filter((m) => m.startsWith(w)).length > 1) continue;
    return n;
  }
  return name.length;
}

const NAMES = SPECS.map((s) => s[0]);

/** Every command, alphabetical (the resolution order). */
export const COMMANDS: readonly CommandEntry[] = SPECS.map(([name, kind, tier, rule], i) => {
  const e: CommandEntry = {
    name,
    kind,
    tier,
    inert: kind === 'inert',
    minAbbrev: minAbbrevOf(NAMES, i),
    ...(rule ? { rule } : {}),
    ...(hintFor(name, tier) ? { hint: hintFor(name, tier)! } : {}),
  };
  return Object.freeze(e);
});

const BY_NAME = new Map(COMMANDS.map((c) => [c.name, c]));

/** The entry for a canonical name (lower-case, no `#`). */
export function commandByName(name: string): CommandEntry | undefined {
  return BY_NAME.get(name);
}

/**
 * Resolves a command word (with or without the leading `#`) to its entry:
 * `null` when nothing matches, `'ambiguous'` for a one-letter word that
 * starts several names. See the rule at the top of this file.
 */
export function resolveCommand(word: string): CommandEntry | null | 'ambiguous' {
  const w = (word.startsWith('#') ? word.slice(1) : word).toLowerCase();
  if (w === '') return null;
  const exact = BY_NAME.get(w);
  if (exact) return exact;
  let first: CommandEntry | null = null;
  let count = 0;
  for (const c of COMMANDS) {
    if (!c.name.startsWith(w) || EXACT_ONLY.has(c.name)) continue;
    if (!first) first = c;
    count++;
    if (w.length > 1) break;
  }
  if (!first) return null;
  if (w.length === 1 && count > 1) return 'ambiguous';
  return first;
}

/** `#script` subcommands that act on the script library (ADR 0051). */
export const SCRIPT_SUBCOMMANDS: readonly string[] = ['list', 'help', 'set', 'enable', 'disable', 'reload'];

/**
 * The arguments of a `#script` or `#lua` command (`name` without `#`,
 * `rest` the text after the word) when it is a form WebCockpit runs, else
 * null (the command stays inert with its hint):
 *
 * - `#script <sub> …` with a subcommand from `SCRIPT_SUBCOMMANDS` (any
 *   case); the first argument comes back lower-cased.
 * - `#lua {script} {function} [args…]`: at least two arguments.
 *
 * Arguments are words or `{…}` groups (braces removed). So a pasted tt++
 * `#script {var} {shell command}` stays inert.
 */
export function scriptCommandArgs(name: string, rest: string): string[] | null {
  if (name !== 'script' && name !== 'lua') return null;
  const args = commandWords(rest);
  if (name === 'lua') return args.length >= 2 ? args : null;
  const sub = args[0]?.toLowerCase();
  if (sub === undefined || !SCRIPT_SUBCOMMANDS.includes(sub)) return null;
  args[0] = sub;
  return args;
}

/** Words and `{…}` groups of `text`, outer braces removed. */
function commandWords(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text.charCodeAt(i);
    if (c === 32 || c === 9 || c === 10 || c === 13) {
      i++;
      continue;
    }
    if (c === 0x7b) {
      let depth = 0;
      let j = i;
      for (; j < n; j++) {
        const d = text.charCodeAt(j);
        if (d === 0x5c) j++;
        else if (d === 0x7b) depth++;
        else if (d === 0x7d && --depth === 0) break;
      }
      out.push(text.slice(i + 1, Math.min(j, n)));
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < n && !/\s/.test(text[j]!)) j++;
    out.push(text.slice(i, j));
    i = j;
  }
  return out;
}
