// The Scripts page's pure parts (spec §2.10, ADR 0051 "P2", ADR 0121):
// the package layout, the list lines and the detail frame's rows (status,
// settings with their controls, commands, the typeset help). No DOM, no
// Preact; unit tested. The script editor (src/editor) uses the state and
// problem texts too.

import { type SettingDecl, type SettingValue, formatNumber } from '../../scripts/header';
import { type HelpRole, typesetHelp } from '../../scripts/help-text';
import type { ScriptInfo } from '../../scripts';
import { cellLen, centreLeft, packRows, truncate, wrapText } from '../kit/nav';

/** One coloured run of a row. */
export interface Seg {
  text: string;
  cls?: string;
  /** What a click on it does (scripts.tsx `hit`): `set:<name>:<what>`, `reset`, `fold`. */
  hit?: string;
  /** Drawn as a filled button (`text` is its label, padded); `hit` presses it. */
  button?: { disabled: boolean; cursor: boolean };
  /** Drawn as a text input this many cells wide (the value being typed). */
  field?: number;
}

export type Row = Seg[];

// ------------------------------------------------------------------ state

export interface ScriptState {
  /** One cell: `●` on, `○` off. */
  glyph: string;
  text: string;
  cls: string;
  /** The row's status cell: `●` running, `!` failed, blank otherwise. */
  mark: string;
  markCls: string;
  markTitle: string;
}

/**
 * What a script is doing. `running` is the host's answer (null: no host,
 * so nothing runs in this tab yet).
 */
export function scriptState(s: ScriptInfo, running: boolean | null): ScriptState {
  const failed = !!(s.lastError || s.loadProblem);
  if (!s.enabled) {
    return { glyph: '○', text: 'off', cls: 'wc-c-body', mark: ' ', markCls: '', markTitle: '' };
  }
  if (running === true) {
    return {
      glyph: '●',
      text: 'on · running',
      cls: 'wc-c-ok',
      mark: '●',
      markCls: 'wc-c-ok',
      markTitle: 'Running',
    };
  }
  if (failed) {
    return {
      glyph: '●',
      text: 'on · not running',
      cls: 'wc-c-err',
      mark: '!',
      markCls: 'wc-c-err',
      markTitle: problemText(s) ?? 'Not running',
    };
  }
  if (running === null) {
    return { glyph: '●', text: 'on · runs when you enter MUME', cls: 'wc-c-ok', mark: ' ', markCls: '', markTitle: '' };
  }
  return { glyph: '●', text: 'on · starting', cls: 'wc-c-ok', mark: ' ', markCls: '', markTitle: '' };
}

/** Why the script does not run: the load problem, else the last error; null when neither. */
export function problemText(s: ScriptInfo): string | null {
  if (s.loadProblem) return `Cannot load: ${s.loadProblem}`;
  return s.lastError;
}

// ----------------------------------------------------------------- layout

/** The page's buttons above the list (ADR 0121). */
export const PAGE_BUTTONS = ['NEW', 'IMPORT', 'MANUAL'] as const;
/** The selected script's buttons, in the detail frame's top border. */
export const DETAIL_BUTTONS = ['EDIT', 'EXPORT', 'RENAME', 'DELETE'] as const;
/** Without a detail frame (a phone, ADR 0075 §3.2) every button is above the list. */
export const ALL_BUTTONS = ['NEW', 'IMPORT', 'EDIT', 'EXPORT', 'RENAME', 'DELETE', 'MANUAL'] as const;
export type ScriptButton = (typeof ALL_BUTTONS)[number];

/** A button is its label with one cell either side. */
export const buttonW = (label: string): number => cellLen(label) + 2;
/** A button row: buttons with one cell between them. */
export const rowW = (labels: readonly string[]): number => labels.reduce((n, b) => n + buttonW(b), 0) + labels.length - 1;
export const PAGE_BUTTONS_W = rowW(PAGE_BUTTONS);
export const ALL_BUTTONS_W = rowW(ALL_BUTTONS);

/**
 * The buttons per row: one row, or on a phone as many rows as it takes to
 * fit `width` cells (ADR 0075 §3.2).
 */
export function buttonRows(buttons: readonly ScriptButton[], width: number, phone = false): ScriptButton[][] {
  if (!phone || rowW(buttons) <= width) return [[...buttons]];
  return packRows(buttons.map(buttonW), width, 1).map((r) => r.map((i) => buttons[i]!));
}

/** `[X]` sp name sp lock sp mark sp: everything in a list row but the name. */
export const ROW_FIXED = 3 + 1 + 1 + 1 + 1 + 1 + 1;
const NAME_MIN = 12;
const NAME_MAX = 32;
/** The least width of the detail frame, its edges included. */
export const DETAIL_MIN = 30;

export interface ScriptsLayout {
  /** Left edge of the package (cells). */
  at: number;
  /** Width of the list rows (and the button row), the scrollbar cell not included. */
  listW: number;
  nameW: number;
  /** Width of the detail frame from its left edge to its right edge; 0 when the grid is too narrow for it. */
  detailW: number;
  /** The buttons above the list. */
  buttons: readonly ScriptButton[];
}

/**
 * The package `[ buttons / list | scrollbar | detail frame ]`. The frame
 * takes all the room right of the list (ADR 0115 §1), so the package spans
 * the grid less a one-cell margin each side. Without room for the frame (a
 * phone) the list is centred and every button sits above it. The name
 * column grows with the longest name (12–32 cells) and fills the column
 * under the buttons.
 */
export function scriptsLayout(cols: number, names: readonly string[], phone = false): ScriptsLayout {
  const longest = Math.max(0, ...names.map(cellLen));
  const row = Math.min(NAME_MAX, Math.max(NAME_MIN, longest)) + ROW_FIXED;
  const listW = Math.max(PAGE_BUTTONS_W, row);
  const detailW = cols - 2 - listW - 1;
  if (detailW >= DETAIL_MIN) return { at: 1, listW, nameW: listW - ROW_FIXED, detailW, buttons: PAGE_BUTTONS };
  // No frame: the list alone, centred; on a phone it fits the grid (the
  // buttons wrap above it, `buttonRows`).
  const alone = phone ? Math.max(NAME_MIN + ROW_FIXED, Math.min(row, cols - 2)) : Math.max(ALL_BUTTONS_W, row);
  return { at: centreLeft(cols, alone + 1), listW: alone, nameW: alone - ROW_FIXED, detailW: 0, buttons: ALL_BUTTONS };
}

// ------------------------------------------------------------------- list

/** A row of the list: a script, or the error line under a script that failed. */
export type ListLine = { kind: 'script'; index: number } | { kind: 'error'; index: number; text: string };

/** A compile error found by the page's check (src/scripts/check.ts): `name:line: message`, or null. */
export type SyntaxLookup = (s: ScriptInfo) => string | null | undefined;

/** The text of a compile error the page's check found. */
export const syntaxText = (message: string): string => `Syntax error: ${message}`;

/**
 * What to show under a script: its load problem or last error, else a
 * compile error from the page's check (a script that is off is checked
 * nowhere else).
 */
export function rowProblem(s: ScriptInfo, syntax?: SyntaxLookup): string | null {
  const p = problemText(s);
  if (p) return p;
  const e = syntax?.(s);
  return e ? syntaxText(e) : null;
}

/** The list's lines: each script, and under it its problem when it has one. */
export function listLines(list: readonly ScriptInfo[], syntax?: SyntaxLookup): ListLine[] {
  const out: ListLine[] = [];
  list.forEach((s, index) => {
    out.push({ kind: 'script', index });
    const p = rowProblem(s, syntax);
    if (p) out.push({ kind: 'error', index, text: p });
  });
  return out;
}

/**
 * The frame's left edge beside list line `i` (ADR 0121): open (a blank)
 * at the selected script's line `sel`, so the line runs into the frame,
 * turning away from it on the lines either side; `│` elsewhere.
 */
export function edgeChar(i: number, sel: number): string {
  if (sel < 0) return '│';
  if (i === sel) return ' ';
  if (i === sel - 1) return '┘';
  if (i === sel + 1) return '┐';
  return '│';
}

/** Cuts a row of runs to `w` cells (the last run that does not fit ends in `…`). */
export function cutRow(row: Row, w: number): Row {
  const out: Row = [];
  let left = w;
  for (const s of row) {
    if (left <= 0) break;
    const n = s.field ?? cellLen(s.text);
    if (n <= left) {
      out.push(s);
      left -= n;
    } else if (!s.field && !s.button) {
      out.push({ ...s, text: truncate(s.text, left) });
      left = 0;
    } else left = 0;
  }
  return out;
}

/** Cells a row takes. */
export const rowCells = (row: Row): number => row.reduce((n, s) => n + (s.field ?? cellLen(s.text)), 0);

// ------------------------------------------------------------- settings

/** A setting's value as the page shows it (`#script set` braces aside). */
export function valueText(d: SettingDecl, v: SettingValue): string {
  return typeof v === 'number' ? formatNumber(v) : String(v);
}

/** The cells a number's value takes: its range's widest end, at least 2. */
export function numberW(d: SettingDecl, v: SettingValue): number {
  const ends = [d.min, d.max, d.default, v].filter((x): x is number => typeof x === 'number').map((x) => formatNumber(x).length);
  return Math.max(2, ...ends);
}

/** The cells a string setting's field takes on a frame `width` cells wide. */
export const stringW = (width: number): number => Math.max(8, Math.min(24, Math.floor(width * 0.35)));

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

/** The control of setting `d` with value `v` as runs (hits `set:<name>:<what>`). */
export function controlSegs(d: SettingDecl, v: SettingValue, width: number, editing: string | null): Row {
  const h = (what: string): string => `set:${d.name}:${what}`;
  const unit: Row = d.unit ? [{ text: ' ' + d.unit, cls: 'wc-c-body' }] : [];
  switch (d.type) {
    case 'boolean':
      return [
        { text: '[', cls: 'wc-c-hint', hit: h('flip') },
        { text: 'ON', cls: v === true ? 'wc-scr-sw-on' : 'wc-c-hint', hit: h('on') },
        { text: '|', cls: 'wc-c-hint', hit: h('flip') },
        { text: 'OFF', cls: v === false ? 'wc-scr-sw-off' : 'wc-c-hint', hit: h('off') },
        { text: ']', cls: 'wc-c-hint', hit: h('flip') },
      ];
    case 'number': {
      const w = numberW(d, v);
      const value: Seg =
        editing !== null
          ? { text: editing, field: w, hit: h('type') }
          : { text: valueText(d, v).padStart(w), cls: 'wc-c-active', hit: h('type') };
      return [{ text: '◂', cls: 'wc-scr-arrow', hit: h('dec') }, { text: ' ' }, value, { text: ' ' }, { text: '▸', cls: 'wc-scr-arrow', hit: h('inc') }, ...unit];
    }
    case 'choice': {
      const out: Row = [];
      (d.options ?? []).forEach((o, i) => {
        if (i > 0) out.push({ text: '  ' });
        const on = o === v;
        out.push({ text: `(${on ? '•' : ' '}) ${valueText(d, o)}`, cls: on ? 'wc-c-active' : 'wc-c-body', hit: h(`opt:${i}`) });
      });
      return [...out, ...unit];
    }
    default: {
      const w = stringW(width);
      if (editing !== null) return [{ text: '[', cls: 'wc-c-hint' }, { text: editing, field: w, hit: h('edit') }, { text: ']', cls: 'wc-c-hint' }];
      const shown = truncate(String(v), w);
      return [
        { text: '[', cls: 'wc-c-hint', hit: h('edit') },
        { text: shown + ' '.repeat(Math.max(0, w - cellLen(shown))), cls: 'wc-c-active wc-scr-str', hit: h('edit') },
        { text: ']', cls: 'wc-c-hint', hit: h('edit') },
      ];
    }
  }
}

// ----------------------------------------------------------------- detail

/** A row of the frame's top part; `key` marks the first row of a focusable row (`buttons`, `reset`, `set:<name>`, `help`). */
export interface DetailRow {
  segs: Row;
  key?: string;
  /** The script's buttons go here (a frame too narrow for them in its border). */
  buttons?: true;
}

export interface DetailInput {
  s: ScriptInfo;
  running: boolean | null;
  syntax?: SyntaxLookup;
  /** Cells inside the frame's padding. */
  width: number;
  /** The keys' row in the frame, when the detail zone has them. */
  cursor: string | null;
  /** The setting being typed: its name and text. */
  editing: { name: string; text: string } | null;
  helpOpen: boolean;
  /** The script's buttons do not fit the top border: a row of their own first. */
  buttonsInside?: boolean;
  /** Values shown instead of the stored ones (a change being saved). */
  values?: Readonly<Record<string, SettingValue>>;
}

export interface DetailModel {
  /** The fixed part: summary and status, Settings, Commands, the Help heading. */
  rows: DetailRow[];
  /** The focusable rows in order (the keys' ↑↓). */
  keys: string[];
  /** Whether RESET ALL has something to do. */
  changed: boolean;
}

/** Label columns narrower than this put each label under its control (ADR 0121 "Narrow widths"). */
const LABEL_MIN = 20;
/** Cells a section rule needs right of its title before its button. */
const RULE_MIN = 3;

/** `─ Title ─────── [right]` across `w` cells; `lead` is what comes before the rule (default `─ Title`). */
function sectionRule(title: string, w: number, right?: Seg, lead?: Seg): Row {
  const head: Row = lead ? [lead, { text: ' ' }] : [{ text: '─ ', cls: 'wc-c-hint' }, { text: title, cls: 'wc-c-section' }, { text: ' ' }];
  const used = rowCells(head);
  const rw = right ? cellLen(right.text) : 0;
  const fill = Math.max(RULE_MIN, w - used - (right ? rw + 1 : 0));
  return cutRow([...head, { text: '─'.repeat(fill), cls: 'wc-c-hint' }, ...(right ? [{ text: ' ' }, right] : [])], w);
}

/** The setting's value as shown: a pending change, else the stored value. */
function shownValue(s: ScriptInfo, d: SettingDecl, values?: Readonly<Record<string, SettingValue>>): SettingValue {
  return values?.[d.name] ?? s.settings[d.name] ?? d.default;
}

/**
 * The detail frame's top part for `s` (ADR 0121): summary, status and
 * problems; Settings with a control per setting; Commands; the Help
 * heading. The help itself is `helpLines`.
 */
export function detailRows(p: DetailInput): DetailModel {
  const { s } = p;
  const h = s.header;
  const w = Math.max(16, p.width);
  const rows: DetailRow[] = [];
  const keys: string[] = [];
  const push = (segs: Row, key?: string): void => {
    rows.push({ segs: cutRow(segs, w), key });
    if (key && !keys.includes(key)) keys.push(key);
  };
  const wrap = (text: string, cls: string, indentBy = 0): void => {
    for (const l of wrapText(text, w - indentBy)) push([{ text: ' '.repeat(indentBy) + l, cls }]);
  };

  if (p.buttonsInside) {
    rows.push({ segs: [], key: 'buttons', buttons: true });
    keys.push('buttons');
  } else keys.push('buttons');
  if (h.summary) wrap(h.summary, 'wc-c-item');
  const st = scriptState(s, p.running);
  push([{ text: `${st.glyph} ${st.text}`, cls: st.cls }, ...(s.bundled ? [{ text: '   bundled · read-only', cls: 'wc-c-hint' }] : [])]);
  if (s.loadProblem) wrap(`Cannot load: ${s.loadProblem}`, 'wc-c-err', 2);
  if (s.lastError) wrap(`Last error: ${s.lastError}`, 'wc-c-err', 2);
  const syn = problemText(s) ? null : p.syntax?.(s);
  if (syn) wrap(syntaxText(syn), 'wc-c-err', 2);
  for (const pr of s.problems) wrap(`Header ${pr}`, 'wc-c-danger', 2);

  // Settings.
  const changed = h.settings.some((d) => shownValue(s, d, p.values) !== d.default);
  push([]);
  push(
    sectionRule('Settings', w, {
      text: ' RESET ALL ',
      hit: 'reset',
      button: { disabled: !changed, cursor: p.cursor === 'reset' },
    }),
    h.settings.length > 0 ? 'reset' : undefined,
  );
  if (h.settings.length === 0) push([{ text: '  No settings.', cls: 'wc-c-hint' }]);
  const nameW = Math.min(16, Math.max(0, ...h.settings.map((d) => cellLen(d.name) + 1)));
  const controls = h.settings.map((d) => {
    const ed = p.editing?.name === d.name ? p.editing.text : null;
    return controlSegs(d, shownValue(s, d, p.values), w, ed);
  });
  const ctrlW = Math.max(0, ...controls.map(rowCells));
  const ctrlAt = 2 + nameW + 2;
  const labelAt = ctrlAt + ctrlW + 2;
  const narrow = w - labelAt < LABEL_MIN;
  h.settings.forEach((d, i) => {
    const key = `set:${d.name}`;
    const v = shownValue(s, d, p.values);
    const mark: Seg = { text: p.cursor === key ? '▸' : ' ', cls: 'wc-scr-cursor' };
    const name = truncate(d.name, nameW - 1);
    const lead: Row = [
      mark,
      { text: ' ' },
      { text: name, cls: 'wc-c-active', hit: `${key}:focus` },
      { text: v !== d.default ? '*' : ' ', cls: 'wc-c-accent' },
      { text: ' '.repeat(Math.max(0, nameW - cellLen(name) - 1) + 2) },
    ];
    const ctl = controls[i]!;
    const label = d.label ? wrapText(d.label, narrow ? w - 4 : w - labelAt) : [];
    if (narrow) {
      push([...lead, ...ctl], key);
      for (const l of label) push([{ text: '    ' + l, cls: 'wc-c-body' }]);
      return;
    }
    const pad = ' '.repeat(Math.max(0, labelAt - ctrlAt - rowCells(ctl)));
    push([...lead, ...ctl, { text: pad }, ...(label[0] ? [{ text: label[0], cls: 'wc-c-body' }] : [])], key);
    for (const l of label.slice(1)) push([{ text: ' '.repeat(labelAt) + l, cls: 'wc-c-body' }]);
  });

  // Commands: aliases and keys.
  const items = [...h.aliases.map((a) => ({ key: a.name, text: a.text })), ...h.keys.map((k) => ({ key: k.key, text: k.text }))];
  if (items.length > 0) {
    push([]);
    push(sectionRule('Commands', w));
    const kw = Math.min(16, Math.max(...items.map((it) => cellLen(it.key))));
    const textAt = 2 + kw + 2;
    for (const it of items) {
      const lines = it.text ? wrapText(it.text, Math.max(8, w - textAt)) : [''];
      if (cellLen(it.key) > kw) {
        push([{ text: '  ' }, { text: it.key, cls: 'wc-c-active' }]);
        lines.forEach((l) => push([{ text: ' '.repeat(textAt) + l, cls: 'wc-c-body' }]));
        continue;
      }
      lines.forEach((l, i) =>
        push(
          i === 0
            ? [{ text: '  ' }, { text: it.key.padEnd(kw), cls: 'wc-c-active' }, { text: '  ' + l, cls: 'wc-c-body' }]
            : [{ text: ' '.repeat(textAt) + l, cls: 'wc-c-body' }],
        ),
      );
    }
  }

  // The Help heading (the help is in its own box under it).
  push([]);
  const fold: Seg = { text: `${p.helpOpen ? '▾' : '▸'} Help`, cls: p.cursor === 'help' ? 'wc-scr-fold is-cursor' : 'wc-scr-fold', hit: 'fold' };
  push(sectionRule('Help', w, p.helpOpen && h.help.length > 0 ? { text: 'PgUp/PgDn', cls: 'wc-c-hint' } : undefined, fold), 'help');
  return { rows, keys, changed };
}

/** The colour of each help role in the help box. */
const HELP_CLS: Record<HelpRole, string> = {
  heading: 'wc-c-section',
  text: 'wc-c-item',
  bullet: 'wc-c-body',
  term: 'wc-c-active',
  desc: 'wc-c-body',
  pre: 'wc-c-body',
};

/** The script's help typeset for the help box, `width` cells wide; a hint when it has none. */
export function helpLines(s: ScriptInfo, width: number): Row[] {
  if (s.header.help.length === 0) {
    const none = s.header.summary || s.header.settings.length > 0 || s.header.aliases.length > 0 ? 'No help.' : 'No help yet. Add @summary, @help, @alias, @key and @setting lines to the header.';
    return wrapText(none, Math.max(8, width)).map((l) => [{ text: l, cls: 'wc-c-hint' }]);
  }
  return typesetHelp(s.header.help, width).map((l) => l.map((seg) => (seg.role ? { text: seg.text, cls: HELP_CLS[seg.role] } : { text: seg.text })));
}
