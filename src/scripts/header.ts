// Script header (spec §2.10, ADR 0051 "Storage and files"): the comment
// lines at the top of a `.lua` file that carry its metadata.
//
//   -- @name     coinlooter
//   -- @summary  Loots coins from corpses
//   -- @api      1
//   -- @alias    cl  toggle on/off
//   -- @key      F5  loot now
//   -- @setting  delay number 0.5 "Seconds before looting"
//   -- @help     Free text, one line per tag.
//
// The header is the run of `--` comment lines (and blank lines) before
// the first line of code. A line `-- @<tag> <value>` sets a tag; other
// comment lines are ignored, and so are unknown tags. `@help` may repeat:
// each one is a line of help. `@alias` and `@key` may repeat: the first
// word is the alias or key, the rest describes it.
//
// `@setting <name> <type> <default> [options] ["label"]`: type `number`,
// `string`, `boolean` or `choice`; a string default may be quoted.
// Options (ADR 0121) come after the default, in any order, and the first
// token that is not one starts the label:
//
//   number:  <min>..<max>   step <n>   unit <word>
//   choice:  <opt>|<opt>[|<opt>…]      unit <word>
//
// A choice's values are numbers when every option is a number, else
// strings. A malformed setting is skipped with a problem.
//
// `@help` keeps each line's indentation relative to the least-indented
// `@help` line (help-text.ts typesets it).
//
// Pure TypeScript, no DOM.

/** The API version this client implements. */
export const API_VERSION = 1;

export type SettingType = 'number' | 'string' | 'boolean' | 'choice';
export type SettingValue = number | string | boolean;

export interface SettingDecl {
  name: string;
  type: SettingType;
  default: SettingValue;
  label: string;
  /** `number`: the range (`<min>..<max>`), both or neither. */
  min?: number;
  max?: number;
  /** `number`: the ← → step (default 1). */
  step?: number;
  /** `number`, `choice`: shown after the value. */
  unit?: string;
  /** `choice`: the values to pick from (numbers when every option is one). */
  options?: SettingValue[];
}

export interface ScriptHeader {
  /** `@name`, or null when missing. */
  name: string | null;
  summary: string;
  /** `@api` as a number, or null when missing or not a number. */
  api: number | null;
  aliases: { name: string; text: string }[];
  keys: { key: string; text: string }[];
  settings: SettingDecl[];
  /** `@help` lines in order, indented relative to the least-indented one. */
  help: string[];
}

export interface ParsedHeader {
  header: ScriptHeader;
  /** Header lines that were understood as tags but could not be used. */
  problems: string[];
}

const SETTING_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Parses the header of `source`. Never throws. */
export function parseHeader(source: string): ParsedHeader {
  const header: ScriptHeader = { name: null, summary: '', api: null, aliases: [], keys: [], settings: [], help: [] };
  const problems: string[] = [];
  const lines = source.split(/\r?\n/);
  /** `@help` values with their own leading spaces (made relative at the end). */
  const help: string[] = [];
  let lineNo = 0;
  for (const raw of lines) {
    lineNo++;
    let line = raw.trim();
    if (lineNo === 1 && line.startsWith('#!')) continue;
    if (line === '') continue;
    if (!line.startsWith('--')) break;
    // A block comment `--[[` ends the header: its lines are not tags.
    if (line.startsWith('--[[') || /^--\[=+\[/.test(line)) break;
    line = line.replace(/^-+/, '').trim();
    const m = /^@([A-Za-z]+)\b\s*(.*)$/.exec(line);
    if (!m) continue;
    const tag = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    switch (tag) {
      case 'name':
        header.name = value.split(/\s+/)[0] || null;
        break;
      case 'summary':
        header.summary = value;
        break;
      case 'api': {
        const n = Number(value);
        header.api = value !== '' && Number.isFinite(n) ? n : null;
        break;
      }
      case 'alias':
      case 'key': {
        const sp = value.search(/\s/);
        const first = sp < 0 ? value : value.slice(0, sp);
        const text = sp < 0 ? '' : value.slice(sp).trim();
        if (first === '') problems.push(`line ${lineNo}: @${tag} needs a name.`);
        else if (tag === 'alias') header.aliases.push({ name: first, text });
        else header.keys.push({ key: first, text });
        break;
      }
      case 'setting': {
        const r = parseSetting(value);
        if (typeof r === 'string') problems.push(`line ${lineNo}: @setting ${r}`);
        else if (header.settings.some((s) => s.name === r.name)) problems.push(`line ${lineNo}: @setting ${r.name} is declared twice.`);
        else header.settings.push(r);
        break;
      }
      case 'help': {
        // The text after the tag with its indentation (the trimmed `value` lost it).
        const raw = /@help\b(.*)$/i.exec(line)?.[1] ?? '';
        help.push(raw.replace(/\t/g, '    ').trimEnd());
        break;
      }
      default:
      // Unknown tags are ignored (a later API may add some).
    }
  }
  header.help = relativeIndent(help);
  return { header, problems };
}

/** `lines` less the indentation of the least-indented non-blank line (blank lines become ''). */
function relativeIndent(lines: readonly string[]): string[] {
  const indents = lines.filter((l) => l.trim() !== '').map((l) => l.length - l.trimStart().length);
  const cut = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map((l) => (l.trim() === '' ? '' : l.slice(cut)));
}

const NUM = String.raw`-?(?:\d+\.?\d*|\.\d+)`;
const RANGE = new RegExp(`^(${NUM})\\.\\.(${NUM})$`);

/** The tokens of `s`: words, and "quoted strings" kept whole (quotes and all). */
function tokens(s: string): string[] {
  return s.match(/"(?:[^"\\]|\\.)*"|\S+/g) ?? [];
}

/** Parses the value of `@setting`; a string is the problem. */
export function parseSetting(value: string): SettingDecl | string {
  const m = /^(\S+)\s+(\S+)\s+("(?:[^"\\]|\\.)*"|\S+)\s*(.*)$/.exec(value);
  if (!m) return 'needs a name, a type and a default.';
  const name = m[1]!;
  const type = m[2]!.toLowerCase();
  if (!SETTING_NAME.test(name)) return `${name}: the name may hold letters, digits and _ only.`;
  if (type !== 'number' && type !== 'string' && type !== 'boolean' && type !== 'choice') {
    return `${name}: the type must be number, string, boolean or choice.`;
  }
  // The options, then the label: the rest of the line from the first token that is not an option.
  const rest = m[4]!.trim();
  const toks = tokens(rest);
  const opts: { range?: [number, number]; step?: number; unit?: string; options?: string[] } = {};
  const seen: string[] = [];
  let i = 0;
  for (; i < toks.length; i++) {
    const t = toks[i]!;
    const next = toks[i + 1];
    const r = RANGE.exec(t);
    if (r) {
      opts.range = [Number(r[1]), Number(r[2])];
      seen.push('a range');
    } else if (t === 'step' && next !== undefined && new RegExp(`^${NUM}$`).test(next)) {
      opts.step = Number(next);
      seen.push('step');
      i++;
    } else if (t === 'unit' && next !== undefined && !next.startsWith('"')) {
      opts.unit = next;
      seen.push('unit');
      i++;
    } else if (/^[^"|\s]+(?:\|[^"|\s]+)+$/.test(t)) {
      opts.options = t.split('|');
      seen.push('options');
    } else break;
  }
  // The label: the rest of the line as written, from the first token that is not an option.
  let label = '';
  if (i < toks.length) {
    let at = 0;
    for (let k = 0; k < i; k++) at = rest.indexOf(toks[k]!, at) + toks[k]!.length;
    const tail = rest.slice(at).trim();
    label = tail.startsWith('"') ? unquote(tail) : tail;
  }
  const raw = unquote(m[3]!);
  const decl: SettingDecl = { name, type, default: '', label };

  if (type === 'boolean' || type === 'string') {
    if (seen.length > 0) return `${name}: ${seen[0]} is not an option of a ${type} setting.`;
    const def = convertSetting(type, raw);
    if (def === null) return `${name}: the default ${m[3]} is not a ${type}.`;
    decl.default = def;
    return decl;
  }

  if (type === 'number') {
    if (opts.options) return `${name}: options (a|b) are for a choice setting.`;
    const def = convertSetting('number', raw);
    if (def === null) return `${name}: the default ${m[3]} is not a number.`;
    decl.default = def;
    if (opts.range) {
      const [lo, hi] = opts.range;
      if (lo > hi) return `${name}: the range ${lo}..${hi} is empty.`;
      if ((def as number) < lo || (def as number) > hi) return `${name}: the default ${def} is outside ${lo}..${hi}.`;
      decl.min = lo;
      decl.max = hi;
    }
    if (opts.step !== undefined) {
      if (!(opts.step > 0)) return `${name}: the step must be above 0.`;
      decl.step = opts.step;
    }
    if (opts.unit !== undefined) decl.unit = opts.unit;
    return decl;
  }

  // choice
  if (opts.range || opts.step !== undefined) return `${name}: ${opts.range ? 'a range' : 'step'} is not an option of a choice setting.`;
  if (!opts.options) return `${name}: a choice needs its options, as 10|20 or low|high.`;
  const numeric = opts.options.every((o) => convertSetting('number', o) !== null);
  const options: SettingValue[] = numeric ? opts.options.map(Number) : opts.options;
  if (new Set(options).size !== options.length) return `${name}: an option is listed twice.`;
  const def = numeric ? convertSetting('number', raw) : raw;
  if (def === null || !options.includes(def)) return `${name}: the default ${m[3]} is not one of ${opts.options.join(', ')}.`;
  decl.default = def;
  decl.options = options;
  if (opts.unit !== undefined) decl.unit = opts.unit;
  return decl;
}

function unquote(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1).replace(/\\(.)/g, '$1');
  return s;
}

/** `text` as a value of `type`, or null when it is not one (a choice's options and a range are not checked: `settingValue`). */
export function convertSetting(type: SettingType, text: string): SettingValue | null {
  switch (type) {
    case 'number': {
      const t = text.trim();
      const n = Number(t);
      return t !== '' && Number.isFinite(n) ? n : null;
    }
    case 'boolean': {
      const t = text.trim().toLowerCase();
      if (t === 'true' || t === 'on' || t === 'yes' || t === '1') return true;
      if (t === 'false' || t === 'off' || t === 'no' || t === '0') return false;
      return null;
    }
    default:
      return text;
  }
}

/** A number as a setting shows it (no float noise: 0.1 + 0.2 is 0.3). */
export function formatNumber(n: number): string {
  return String(Number(n.toPrecision(12)));
}

/** Whether `decl`'s values are numbers (a number, or a choice of numbers). */
export const numericSetting = (decl: SettingDecl): boolean =>
  decl.type === 'number' || (decl.type === 'choice' && typeof decl.default === 'number');

/**
 * `text` as a value of `decl` (`#script set`, the Scripts page), or why it
 * is not one: the type, a number's range, a choice's options.
 */
export function settingValue(decl: SettingDecl, text: string): { ok: true; value: SettingValue } | { ok: false; reason: string } {
  const n = decl.name;
  if (decl.type === 'choice') {
    const opts = decl.options ?? [];
    const t = text.trim();
    const v = opts.find((o) => (typeof o === 'number' ? convertSetting('number', t) === o : o === t));
    if (v === undefined) return { ok: false, reason: `${n} must be one of ${opts.map(String).join(', ')}.` };
    return { ok: true, value: v };
  }
  const value = convertSetting(decl.type, text);
  if (value === null) return { ok: false, reason: `${n} must be a ${decl.type}${decl.type === 'boolean' ? ' (true or false)' : ''}.` };
  if (typeof value === 'number' && decl.min !== undefined && decl.max !== undefined && (value < decl.min || value > decl.max)) {
    return { ok: false, reason: `${n} must be between ${formatNumber(decl.min)} and ${formatNumber(decl.max)}.` };
  }
  return { ok: true, value };
}

/**
 * A stored value as `decl` takes it now (the header may have changed
 * since it was stored): a number clamped to the range, a choice that is
 * no longer an option or a value of another type falls back to the default.
 */
export function storedSetting(decl: SettingDecl, v: SettingValue | undefined): SettingValue {
  if (v === undefined || typeof v !== typeof decl.default) return decl.default;
  if (decl.type === 'choice') return (decl.options ?? []).includes(v) ? v : decl.default;
  if (typeof v === 'number' && decl.min !== undefined && decl.max !== undefined) return Math.max(decl.min, Math.min(decl.max, v));
  return v;
}

/**
 * Why a script with this header cannot load, or null when it can: `@api`
 * must be present and equal to `API_VERSION`.
 */
export function apiProblem(header: ScriptHeader): string | null {
  if (header.api === null) return `the header needs "-- @api ${API_VERSION}".`;
  if (header.api !== API_VERSION) return `it was written for @api ${header.api}; this WebCockpit runs @api ${API_VERSION}.`;
  return null;
}

/**
 * `source` with its `@name` tag set to `name`: the existing `-- @name`
 * line is rewritten (keeping its layout), or one is added at the top.
 */
export function withHeaderName(source: string, name: string): string {
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.trim();
    if (t === '' || (i === 0 && t.startsWith('#!'))) continue;
    if (!t.startsWith('--') || t.startsWith('--[[')) break;
    const m = /^(\s*-+\s*@name\b\s*)(\S*)(.*)$/i.exec(lines[i]!);
    if (m) {
      lines[i] = m[1]! + name + m[3]!;
      return lines.join('\n');
    }
  }
  return `-- @name     ${name}\n` + source;
}
