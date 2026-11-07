// The Scripts page's pure parts (spec §2.10, ADR 0121; stage 44a): what
// a script is doing, its problems, the panel's keyboard rows, the setting
// steps and the foot's count. No DOM, no Preact; unit tested. The script
// editor (src/editor) uses the state and problem texts too.
//
// Look-neutral: a state has a tone (`ok | err | off`) and a dot, not a
// class of the old cell grid; each page draws them its own way.

import { type SettingDecl, type SettingValue, formatNumber } from '../../scripts/header';
import type { ScriptInfo } from '../../scripts';

// ------------------------------------------------------------------ state

/** The colour role of a state: running or starting (`ok`), failed (`err`), off. */
export type StateTone = 'ok' | 'err' | 'off';

/** The state's dot: `on` running, `wait` on but not running yet, `off`, `bad` failed. */
export type StateDot = 'on' | 'wait' | 'off' | 'bad';

export interface ScriptState {
  /** `●` on, `○` off (a character for a text-only status). */
  glyph: string;
  text: string;
  /** The text's tone (`ok | err | off`). */
  cls: StateTone;
  dot: StateDot;
  /** The list row's mark: `ok` running, `err` failed, null otherwise. */
  mark: 'ok' | 'err' | null;
  /** The mark's tooltip: "Running", or the problem. */
  markTitle: string;
}

/**
 * What a script is doing. `running` is the host's answer (null: no host,
 * so nothing runs in this tab yet: the start page).
 */
export function scriptState(s: ScriptInfo, running: boolean | null): ScriptState {
  const failed = !!(s.lastError || s.loadProblem);
  if (!s.enabled) return { glyph: '○', text: 'off', cls: 'off', dot: 'off', mark: null, markTitle: '' };
  if (running === true) return { glyph: '●', text: 'on · running', cls: 'ok', dot: 'on', mark: 'ok', markTitle: 'Running' };
  if (failed) {
    return { glyph: '●', text: 'on · not running', cls: 'err', dot: 'bad', mark: 'err', markTitle: problemText(s) ?? 'Not running' };
  }
  if (running === null) return { glyph: '●', text: 'on · at login', cls: 'ok', dot: 'wait', mark: null, markTitle: '' };
  return { glyph: '●', text: 'on · starting', cls: 'ok', dot: 'wait', mark: null, markTitle: '' };
}

/** Why the script does not run: the load problem, else the last error; null when neither. */
export function problemText(s: ScriptInfo): string | null {
  if (s.loadProblem) return `Cannot load: ${s.loadProblem}`;
  return s.lastError;
}

/** A compile error found by the page's check (src/scripts/check.ts): `name:line: message`, or null. */
export type SyntaxLookup = (s: ScriptInfo) => string | null | undefined;

/** The text of a compile error the page's check found. */
export const syntaxText = (message: string): string => `Syntax error: ${message}`;

/**
 * The line under a script in the list: its load problem or last error,
 * else a compile error from the page's check (a script that is off is
 * checked nowhere else); null when none.
 */
export function rowProblem(s: ScriptInfo, syntax?: SyntaxLookup): string | null {
  const p = problemText(s);
  if (p) return p;
  const e = syntax?.(s);
  return e ? syntaxText(e) : null;
}

/** One problem in the panel: `err` (the script cannot run) or `header` (a header line it could not use). */
export interface PanelProblem {
  text: string;
  kind: 'err' | 'header';
}

/** The panel's problems: Cannot load, Last error, Syntax error (when neither), each header problem. */
export function panelProblems(s: ScriptInfo, syntax?: SyntaxLookup): PanelProblem[] {
  const out: PanelProblem[] = [];
  if (s.loadProblem) out.push({ text: `Cannot load: ${s.loadProblem}`, kind: 'err' });
  if (s.lastError) out.push({ text: `Last error: ${s.lastError}`, kind: 'err' });
  const syn = problemText(s) ? null : syntax?.(s);
  if (syn) out.push({ text: syntaxText(syn), kind: 'err' });
  for (const p of s.problems) out.push({ text: `Header ${p}`, kind: 'header' });
  return out;
}

/** The help fold's text when the script has no `@help`. */
export function noHelpText(s: ScriptInfo): string {
  const h = s.header;
  return h.summary || h.settings.length > 0 || h.aliases.length > 0
    ? 'No help.'
    : 'No help yet. Add @summary, @help, @alias, @key and @setting lines to the header.';
}

/** The foot's count: "8 scripts", in game "8 scripts · 3 running"; empty without scripts. */
export function countText(list: readonly ScriptInfo[], running: (name: string) => boolean | null): string {
  if (list.length === 0) return '';
  const n = `${list.length} script${list.length === 1 ? '' : 's'}`;
  // No host (the start page): nothing runs, so no count of it.
  if (running(list[0]!.name) === null) return n;
  return `${n} · ${list.filter((s) => running(s.name) === true).length} running`;
}

// ------------------------------------------------------------------ the panel's rows

/** The panel's keyboard rows in order (↑ ↓): the button row, Reset all (with settings), each setting, the help fold. */
export function panelKeys(s: ScriptInfo): string[] {
  const sets = s.header.settings;
  return ['buttons', ...(sets.length > 0 ? ['reset'] : []), ...sets.map((d) => `set:${d.name}`), 'help'];
}

// ------------------------------------------------------------- settings

/** A setting's value as the page shows it (`#script set` braces aside). */
export function valueText(_d: SettingDecl, v: SettingValue): string {
  return typeof v === 'number' ? formatNumber(v) : String(v);
}

/** The setting's value as shown: a change being saved, else the stored value, else the default. */
export function shownValue(s: ScriptInfo, d: SettingDecl, pending?: Readonly<Record<string, SettingValue>>): SettingValue {
  return pending?.[d.name] ?? s.settings[d.name] ?? d.default;
}

/** Whether any setting differs from its default (Reset all has something to do). */
export function anyChanged(s: ScriptInfo, pending?: Readonly<Record<string, SettingValue>>): boolean {
  return s.header.settings.some((d) => shownValue(s, d, pending) !== d.default);
}

/** "default 10 silver", "default on": under a setting that is not its default. */
export function defaultText(d: SettingDecl): string {
  const v = d.type === 'boolean' ? (d.default ? 'on' : 'off') : valueText(d, d.default);
  return `default ${v}${d.unit && d.type !== 'boolean' ? ' ' + d.unit : ''}`;
}

/**
 * The value ← (-1) or → (1) gives a number setting: the next multiple of
 * the step (default 1) that way, clamped to the range.
 */
export function stepSetting(d: SettingDecl, v: number, dir: -1 | 1): number {
  const step = d.step ?? 1;
  const k = v / step;
  const onGrid = Math.abs(k - Math.round(k)) < 1e-9;
  const next = (dir > 0 ? (onGrid ? Math.round(k) + 1 : Math.ceil(k)) : onGrid ? Math.round(k) - 1 : Math.floor(k)) * step;
  return clampSetting(d, Number(next.toPrecision(12)));
}

/** `v` inside the setting's range (unchanged without one). */
export function clampSetting(d: SettingDecl, v: number): number {
  if (d.min !== undefined && v < d.min) return d.min;
  if (d.max !== undefined && v > d.max) return d.max;
  return v;
}

/** The option ← (-1) or → (1) picks from `v` (clamped at the ends). */
export function stepChoice(d: SettingDecl, v: SettingValue, dir: -1 | 1): SettingValue {
  const opts = d.options ?? [];
  const i = opts.indexOf(v);
  return opts[Math.max(0, Math.min(opts.length - 1, (i < 0 ? 0 : i) + dir))] ?? v;
}

/** The option Enter / Space takes from `v`: the next, wrapping. */
export function nextChoice(d: SettingDecl, v: SettingValue): SettingValue {
  const opts = d.options ?? [];
  if (opts.length === 0) return v;
  return opts[(opts.indexOf(v) + 1) % opts.length]!;
}

/** A typed number (clamped to the range), or null when the text is not one. */
export function typedNumber(d: SettingDecl, text: string): number | null {
  const t = text.trim();
  const n = Number(t);
  if (t === '' || !Number.isFinite(n)) return null;
  return clampSetting(d, n);
}
