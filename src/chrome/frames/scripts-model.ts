// The Scripts page's pure parts (spec §2.10, ADR 0051 "P2"): the package
// layout, the list lines and the help panel's rows. No DOM, no Preact;
// unit tested. The script editor (src/editor) uses the state and problem
// texts too.

import { tokenizeLine } from '../../editor/syntax';
import { settingText } from '../../scripts/command-rows';
import type { ScriptInfo } from '../../scripts';
import { cellLen, centreLeft, packRows, truncate, wrapText } from '../kit/nav';

/** One coloured run of a row. */
export interface Seg {
  text: string;
  cls?: string;
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

/** The buttons above the list, in order. */
export const SCRIPT_BUTTONS = ['NEW', 'IMPORT', 'EXPORT', 'RENAME', 'DELETE', 'MANUAL'] as const;
export type ScriptButton = (typeof SCRIPT_BUTTONS)[number];

/** A button is its label with one cell either side. */
export const buttonW = (label: string): number => cellLen(label) + 2;
/** The button row: buttons with one cell between them. */
export const BUTTONS_W = SCRIPT_BUTTONS.reduce((n, b) => n + buttonW(b), 0) + SCRIPT_BUTTONS.length - 1;

/**
 * The buttons per row: one row, or on a phone as many rows as it takes to
 * fit `width` cells (ADR 0075 §3.2).
 */
export function buttonRows(width: number, phone = false): ScriptButton[][] {
  if (!phone || BUTTONS_W <= width) return [[...SCRIPT_BUTTONS]];
  return packRows(SCRIPT_BUTTONS.map(buttonW), width, 1).map((r) => r.map((i) => SCRIPT_BUTTONS[i]!));
}

export const EDIT_LABEL = 'EDIT';
/** `[X]` sp name sp lock sp mark sp ` EDIT `: everything but the name. */
export const ROW_FIXED = 3 + 1 + 1 + 1 + 1 + 1 + 1 + buttonW(EDIT_LABEL);
const NAME_MIN = 12;
const NAME_MAX = 32;
/** Between the list's scrollbar cell and the help panel. */
export const LIST_GAP = 3;
const DETAIL_MIN = 28;
const DETAIL_MAX = 76;

export interface ScriptsLayout {
  /** Left edge of the package (cells). */
  at: number;
  /** Width of the list column (rows and button row), the scrollbar cell not included. */
  listW: number;
  nameW: number;
  /** 0 when the grid is too narrow for the help panel. */
  detailW: number;
}

/**
 * The package `[ buttons / list | scrollbar | gap | help ]`, centred on the
 * grid as one block (the Profile frame's rule). The name column grows with
 * the longest name (12–32 cells) and fills the column under the buttons.
 */
export function scriptsLayout(cols: number, names: readonly string[], phone = false): ScriptsLayout {
  const longest = Math.max(0, ...names.map(cellLen));
  const rowW = Math.min(NAME_MAX, Math.max(NAME_MIN, longest)) + ROW_FIXED;
  if (phone && Math.max(BUTTONS_W, rowW) > cols - 2) {
    // Phone (ADR 0075 §3.2): the list fits the grid (the buttons wrap
    // above it, scripts-model `buttonRows`); no help panel.
    const listW = Math.max(NAME_MIN + ROW_FIXED, Math.min(rowW, cols - 2));
    return { at: centreLeft(cols, listW + 1), listW, nameW: listW - ROW_FIXED, detailW: 0 };
  }
  const listW = Math.max(BUTTONS_W, rowW);
  const nameW = listW - ROW_FIXED;
  const room = cols - 2 - listW - 1 - LIST_GAP;
  const detailW = room >= DETAIL_MIN ? Math.min(DETAIL_MAX, room) : 0;
  const width = listW + 1 + (detailW > 0 ? LIST_GAP + detailW : 0);
  return { at: centreLeft(cols, width), listW, nameW, detailW };
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

// ------------------------------------------------------------------- help

/** `#script set <name> <setting> <value>` with the current value. */
export function setCommand(script: string, setting: string, value: string | number | boolean): string {
  return `#script set ${script} ${setting} ${settingText(value)}`;
}

/** A tt++ line as coloured runs (the editor's lexer, `wc-syn-*` classes). */
export function syntaxSegs(line: string): Seg[] {
  const out: Seg[] = [];
  let at = 0;
  for (const t of tokenizeLine(line)) {
    if (t.from > at) out.push({ text: line.slice(at, t.from), cls: 'wc-c-item' });
    out.push({ text: line.slice(t.from, t.to), cls: `wc-syn-${t.cls}` });
    at = t.to;
  }
  if (at < line.length) out.push({ text: line.slice(at), cls: 'wc-c-item' });
  return out;
}

/** Cuts a row of runs to `w` cells (the last run that does not fit ends in `…`). */
export function cutRow(row: Row, w: number): Row {
  const out: Row = [];
  let left = w;
  for (const s of row) {
    if (left <= 0) break;
    const n = cellLen(s.text);
    if (n <= left) {
      out.push(s);
      left -= n;
    } else {
      out.push({ ...s, text: truncate(s.text, left) });
      left = 0;
    }
  }
  return out;
}

/**
 * The help panel of `s`, `width` cells wide (spec §2.10): name and
 * summary, state and problems, aliases and keys, the `@help` text, and
 * each setting with its value and the `#script set` command.
 */
export function helpRows(s: ScriptInfo, running: boolean | null, width: number, syntax?: SyntaxLookup): Row[] {
  const w = Math.max(10, width);
  const out: Row[] = [];
  const wrap = (text: string, cls: string, indent = 0): void => {
    for (const l of wrapText(text, w - indent)) out.push([{ text: ' '.repeat(indent) + l, cls }]);
  };
  const h = s.header;

  out.push(cutRow([{ text: s.name, cls: 'wc-c-title' }, ...(s.bundled ? [{ text: '  bundled · read-only', cls: 'wc-c-hint' }] : [])], w));
  if (h.summary) wrap(h.summary, 'wc-c-body');
  out.push([]);
  const st = scriptState(s, running);
  out.push([{ text: `${st.glyph} ${st.text}`, cls: st.cls }]);
  if (s.loadProblem) wrap(`Cannot load: ${s.loadProblem}`, 'wc-c-err', 2);
  if (s.lastError) wrap(`Last error: ${s.lastError}`, 'wc-c-err', 2);
  const syn = problemText(s) ? null : syntax?.(s);
  if (syn) wrap(syntaxText(syn), 'wc-c-err', 2);
  for (const p of s.problems) wrap(`Header ${p}`, 'wc-c-danger', 2);

  const pairs = (title: string, items: { key: string; text: string }[]): void => {
    if (items.length === 0) return;
    out.push([], [{ text: title, cls: 'wc-c-section' }]);
    const kw = Math.min(16, Math.max(...items.map((i) => cellLen(i.key))));
    const textAt = 2 + kw + 2;
    for (const it of items) {
      const lines = it.text ? wrapText(it.text, Math.max(8, w - textAt)) : [''];
      if (cellLen(it.key) > kw) {
        out.push(cutRow([{ text: '  ' }, { text: it.key, cls: 'wc-c-active' }], w));
        lines.forEach((l) => out.push([{ text: ' '.repeat(textAt) + l, cls: 'wc-c-body' }]));
        continue;
      }
      lines.forEach((l, i) =>
        out.push(
          i === 0
            ? [{ text: '  ' }, { text: it.key.padEnd(kw), cls: 'wc-c-active' }, { text: '  ' + l, cls: 'wc-c-body' }]
            : [{ text: ' '.repeat(textAt) + l, cls: 'wc-c-body' }],
        ),
      );
    }
  };
  pairs('Aliases', h.aliases.map((a) => ({ key: a.name, text: a.text })));
  pairs('Keys', h.keys.map((k) => ({ key: k.key, text: k.text })));

  if (h.help.length > 0) {
    out.push([], [{ text: 'Help', cls: 'wc-c-section' }]);
    for (const l of h.help) {
      if (l.trim() === '') out.push([]);
      else wrap(l, 'wc-c-item', 2);
    }
  }

  if (h.settings.length > 0) {
    out.push([], [{ text: 'Settings', cls: 'wc-c-section' }]);
    for (const d of h.settings) {
      const v = s.settings[d.name] ?? d.default;
      out.push(
        cutRow(
          [
            { text: '  ' },
            { text: d.name, cls: 'wc-c-active' },
            { text: ' = ', cls: 'wc-c-hint' },
            { text: settingText(v), cls: 'wc-c-accent' },
            { text: `  ${d.type}`, cls: 'wc-c-hint' },
          ],
          w,
        ),
      );
      if (d.label) wrap(d.label, 'wc-c-body', 4);
      out.push(cutRow([{ text: '    ' }, ...syntaxSegs(setCommand(s.name, d.name, v))], w));
    }
  }

  const empty = !h.summary && h.help.length === 0 && h.aliases.length === 0 && h.keys.length === 0 && h.settings.length === 0;
  if (empty) {
    out.push([]);
    wrap('No help yet. Add @summary, @help, @alias, @key and @setting lines to the header.', 'wc-c-hint');
  }
  return out;
}
