// The script API, version 1 (spec §2.10, ADR 0051), as one table of docs.
// The script editor's completion and hover help both read it. Pure; no
// CodeMirror, unit tested.

export type ApiKind = 'function' | 'variable' | 'table' | 'tag' | 'lua';

export interface ApiDoc {
  /** The name as typed: `send`, `store.get`, `string.format`, `@setting`. */
  name: string;
  kind: ApiKind;
  /** The call form shown in the list and the hover: `send(cmd)`. */
  sig: string;
  /** One or two sentences. Empty for the plain Lua library names. */
  doc: string;
}

const fn = (name: string, sig: string, doc: string): ApiDoc => ({ name, kind: 'function', sig, doc });
const v = (name: string, sig: string, doc: string): ApiDoc => ({ name, kind: 'variable', sig, doc });
const tag = (name: string, sig: string, doc: string): ApiDoc => ({ name, kind: 'tag', sig, doc });

/** WebCockpit's script API (version 1). */
export const SCRIPT_API: readonly ApiDoc[] = [
  // Triggers and aliases.
  fn('tempTrigger', 'tempTrigger(substring, fn) → id', 'Calls fn for every game line that contains substring. In fn, line is the line and matches[1] the match.'),
  fn('tempRegexTrigger', 'tempRegexTrigger(regex, fn) → id', 'Calls fn for every game line the regular expression (JavaScript syntax) matches. matches[1] is the whole match, matches[2] … the groups.'),
  fn('tempAlias', 'tempAlias(regex, fn) → id', 'Calls fn for a typed command the regular expression matches (not anchored: use ^ and $). The command is consumed unless fn returns false.'),
  fn('killTrigger', 'killTrigger(id)', 'Removes a trigger made with tempTrigger or tempRegexTrigger.'),
  fn('killAlias', 'killAlias(id)', 'Removes an alias made with tempAlias.'),
  fn('deleteLine', 'deleteLine()', 'In a trigger: hides the current line (a gag).'),
  fn('replaceLine', 'replaceLine(text)', 'In a trigger: shows text instead of the current line. cecho colour tags work.'),
  fn('highlight', 'highlight(color[, text])', 'In a trigger: colours the whole line, or each occurrence of text. color is a name such as "red" or "#ff8800".'),
  // Keys and timers.
  fn('tempKey', 'tempKey(name, fn) → id', 'Calls fn when the key is pressed. Names as in the profile: "F5", "Alt+a", "Numpad0".'),
  fn('killKey', 'killKey(id)', 'Removes a key binding made with tempKey.'),
  fn('tempTimer', 'tempTimer(seconds, fn[, repeat]) → id', 'Calls fn after seconds; again every seconds when repeat is true (50 ms at least).'),
  fn('killTimer', 'killTimer(id)', 'Stops a timer made with tempTimer.'),
  // Events.
  fn('registerAnonymousEventHandler', 'registerAnonymousEventHandler(event, fn) → id', 'Calls fn(event, …) for an event: "gmcp.Char.Vitals", "sysLoadEvent", "sysConnectionEvent", "sysDisconnectionEvent" or a #event name such as "SESSION CONNECTED".'),
  fn('killAnonymousEventHandler', 'killAnonymousEventHandler(id)', 'Removes an event handler.'),
  // Output.
  fn('send', 'send(cmd)', 'Sends cmd to the game as it is, without aliases.'),
  fn('expandAlias', 'expandAlias(cmd)', 'Runs cmd as if typed: profile and script aliases, ; and # commands.'),
  fn('echo', 'echo(text)', 'Writes plain text to the game output. Triggers do not see it.'),
  fn('cecho', 'cecho(text)', 'Writes coloured text: <red>, <b>, <reset> and tt++ <F88ff00> / <118> codes.'),
  fn('print', 'print(...)', 'Writes its arguments to the game output, separated by tabs.'),
  fn('uiMessage', 'uiMessage(source, text)', 'Writes a line to the UI messages pane: ▶ SOURCE: text.'),
  // Profile bridge.
  fn('getVariable', 'getVariable(name) → value', 'Reads a tt++ variable of the profile ($name). nil when unset.'),
  fn('setVariable', 'setVariable(name, value)', 'Sets a tt++ variable of the profile, as #variable does.'),
  fn('export', 'export(name, fn)', 'Makes fn callable from the profile: #lua {script} {name} {args}.'),
  // Data.
  { name: 'store', kind: 'table', sig: 'store', doc: 'Data this script keeps between sessions: store.get(key) and store.set(key, value).' },
  fn('store.get', 'store.get(key) → value', 'A value saved with store.set, or nil.'),
  fn('store.set', 'store.set(key, value)', 'Saves a string, number, boolean or table under key. nil removes it.'),
  v('settings', 'settings.<name>', 'The values of the header\'s @setting lines (read-only). Change one with #script set <script> <name> <value>.'),
  v('gmcp', 'gmcp.<Package>.<Message>', 'The last GMCP data from MUME, as in Mudlet: gmcp.Char.Vitals.hp, gmcp.Room.Info.name … (read-only).'),
  v('state', 'state.char / state.group / state.room', 'Read-only view of the character (name, vitals, status), the group members and the room.'),
  v('matches', 'matches[1], matches[2] …', 'In a trigger or alias: the whole match, then each group.'),
  v('line', 'line', 'In a trigger: the game line. In an alias: the typed command.'),
  v('command', 'command', 'In an alias: the typed command.'),
];

/** The header tags (spec §2.10 "Header"). */
export const HEADER_TAGS: readonly ApiDoc[] = [
  tag('@name', '-- @name     coinlooter', 'The script\'s name: a letter, then letters, digits, _ or -.'),
  tag('@summary', '-- @summary  Loots coins from corpses', 'One line shown in the list and the help.'),
  tag('@api', '-- @api      1', 'The API version the script is written for. Must be 1.'),
  tag('@alias', '-- @alias    cl  toggle on/off', 'Documents an alias for the help: the alias, then what it does.'),
  tag('@key', '-- @key      F5  loot now', 'Documents a key for the help.'),
  tag('@setting', '-- @setting  delay number 0.5 "Seconds before looting"', 'A setting: name, type (number, string or boolean), default and label. Read it as settings.delay.'),
  tag('@help', '-- @help     Free text, one line per tag.', 'A line of the help text.'),
];

const LUA_BASE = [
  'assert', 'error', 'getmetatable', 'ipairs', 'next', 'pairs', 'pcall', 'rawequal', 'rawget', 'rawlen',
  'rawset', 'select', 'setmetatable', 'tonumber', 'tostring', 'type', 'xpcall',
];
const LUA_LIBS: Readonly<Record<string, readonly string[]>> = {
  string: ['byte', 'char', 'find', 'format', 'gmatch', 'gsub', 'len', 'lower', 'match', 'rep', 'reverse', 'sub', 'upper'],
  table: ['concat', 'insert', 'move', 'pack', 'remove', 'sort', 'unpack'],
  math: ['abs', 'ceil', 'floor', 'fmod', 'huge', 'max', 'maxinteger', 'min', 'mininteger', 'pi', 'random', 'randomseed', 'sqrt', 'tointeger', 'type'],
  utf8: ['char', 'charpattern', 'codepoint', 'codes', 'len', 'offset'],
  coroutine: ['create', 'isyieldable', 'resume', 'running', 'status', 'wrap', 'yield'],
};

/** The Lua standard names a script can use (the sandbox's whitelist). */
export const LUA_STD: readonly ApiDoc[] = [
  ...LUA_BASE.map((n) => ({ name: n, kind: 'lua' as const, sig: `${n}(…)`, doc: '' })),
  ...Object.entries(LUA_LIBS).flatMap(([lib, names]) => [
    { name: lib, kind: 'lua' as const, sig: lib, doc: '' },
    ...names.map((n) => ({ name: `${lib}.${n}`, kind: 'lua' as const, sig: `${lib}.${n}`, doc: '' })),
  ]),
];

const ALL: readonly ApiDoc[] = [...SCRIPT_API, ...LUA_STD];
const BY_NAME = new Map(ALL.map((d) => [d.name, d]));
const TAG_BY_NAME = new Map(HEADER_TAGS.map((d) => [d.name, d]));

/** The doc of an API or Lua name, or a header tag (`@setting`). */
export function apiDoc(name: string): ApiDoc | null {
  return BY_NAME.get(name) ?? TAG_BY_NAME.get(name) ?? null;
}

// ------------------------------------------------------------ completion

export interface Completion {
  /** Offset in the line where the replaced text starts. */
  from: number;
  options: readonly ApiDoc[];
}

/**
 * Where the text before the cursor stands: in a comment (`--` outside a
 * string), in a string, or in code. A light scan of one line; a long
 * string or comment from an earlier line is not seen.
 */
export function lineContext(before: string): 'code' | 'string' | 'comment' {
  let quote = '';
  for (let i = 0; i < before.length; i++) {
    const c = before[i]!;
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '-' && before[i + 1] === '-') return 'comment';
  }
  return quote ? 'string' : 'code';
}

/**
 * The completions for the text before the cursor on its line: header tags
 * after `-- @`, members after `store.` / `string.` …, else global names.
 * Null where nothing completes (strings, comments, after a number).
 * `explicit`: asked for with Ctrl+Space (an empty word completes too).
 */
export function completeLua(before: string, explicit = false): Completion | null {
  const tagM = /^\s*--\s*(@\w*)$/.exec(before);
  if (tagM) {
    const word = tagM[1]!;
    const options = HEADER_TAGS.filter((t) => t.name.startsWith(word));
    return options.length ? { from: before.length - word.length, options } : null;
  }
  if (lineContext(before) !== 'code') return null;
  const m = /(?:^|[^\w.])((?:[A-Za-z_]\w*\.)?[A-Za-z_]?\w*)$/.exec(before);
  if (!m) return null;
  const word = m[1]!;
  if (/^\d/.test(word)) return null;
  if (word === '' && !explicit) return null;
  const dot = word.indexOf('.');
  let options: ApiDoc[];
  if (dot >= 0) {
    const prefix = word.slice(0, dot + 1);
    options = ALL.filter((d) => d.name.startsWith(prefix) && d.name.startsWith(word));
  } else {
    options = ALL.filter((d) => !d.name.includes('.') && d.name.toLowerCase().startsWith(word.toLowerCase()));
  }
  if (options.length === 0) return null;
  // API names first, then Lua's.
  options.sort((a, b) => Number(a.kind === 'lua') - Number(b.kind === 'lua'));
  return { from: before.length - word.length, options };
}

// ----------------------------------------------------------------- hover

/** The API name under `col` in `line` (a dotted name such as `store.set`, or a header tag), with its span. */
export function nameAt(line: string, col: number): { from: number; to: number; doc: ApiDoc } | null {
  const re = /@?[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/g;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    const from = m.index;
    const to = from + m[0].length;
    if (col < from || col > to) continue;
    const text = m[0];
    if (text.startsWith('@')) {
      const d = TAG_BY_NAME.get(text);
      return d && /^\s*--\s*$/.test(line.slice(0, from)) ? { from, to, doc: d } : null;
    }
    if (lineContext(line.slice(0, from)) !== 'code') return null;
    // `store.set` over `set`, `store` over `store`; `gmcp.Char.Vitals` → `gmcp`.
    const parts = text.split('.');
    let best: { from: number; to: number; doc: ApiDoc } | null = null;
    for (let k = 1; k <= parts.length; k++) {
      const name = parts.slice(0, k).join('.');
      const d = BY_NAME.get(name);
      if (d) best = { from, to: from + name.length, doc: d };
      if (col <= from + name.length) break;
    }
    return best;
  }
  return null;
}
