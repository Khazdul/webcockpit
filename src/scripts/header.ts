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
// `@setting <name> <type> <default> ["label"]`: type `number`, `string`
// or `boolean`; a string default may be quoted. A malformed setting is
// skipped with a problem.
//
// Pure TypeScript, no DOM.

/** The API version this client implements. */
export const API_VERSION = 1;

export type SettingType = 'number' | 'string' | 'boolean';
export type SettingValue = number | string | boolean;

export interface SettingDecl {
  name: string;
  type: SettingType;
  default: SettingValue;
  label: string;
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
  /** `@help` lines in order. */
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
      case 'help':
        header.help.push(value);
        break;
      default:
      // Unknown tags are ignored (a later API may add some).
    }
  }
  return { header, problems };
}

/** Parses the value of `@setting`; a string is the problem. */
function parseSetting(value: string): SettingDecl | string {
  const m = /^(\S+)\s+(\S+)\s+("(?:[^"\\]|\\.)*"|\S+)\s*(.*)$/.exec(value);
  if (!m) return 'needs a name, a type and a default.';
  const name = m[1]!;
  const type = m[2]!.toLowerCase();
  if (!SETTING_NAME.test(name)) return `${name}: the name may hold letters, digits and _ only.`;
  if (type !== 'number' && type !== 'string' && type !== 'boolean') return `${name}: the type must be number, string or boolean.`;
  const def = convertSetting(type, unquote(m[3]!));
  if (def === null) return `${name}: the default ${m[3]} is not a ${type}.`;
  const rest = m[4]!.trim();
  const label = rest.startsWith('"') ? unquote(rest) : rest;
  return { name, type, default: def, label };
}

function unquote(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1).replace(/\\(.)/g, '$1');
  return s;
}

/** `text` as a value of `type`, or null when it is not one. */
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
