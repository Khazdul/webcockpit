// Confirmations and listings in the game window (ADR 0039): a `Report`
// from the script engine as output pane rows. No DOM; unit tested.
//
// One form for everything: the command as it would stand in a profile,
// `#word {argument} {argument}`, lower case, with the default priority left
// out; or `#word {key} state` for what is not a definition (removed, not
// found, opened, closed, on, off, none). A definition row is a valid
// profile line, so a listing can be copied.
//
// One row each, never wrapped: a line break in an argument becomes a space
// and the longest argument is cut with `…` (inside its braces) until the
// row fits the pane. Rows of one listing align their second column.
//
// Colours come from the style sheet (`wc-msg`, ui.css): the editor's tt++
// lexer classes (`wc-syn-*`) on the row's own text colour, the state word
// dimmer (amber for not found, not open and off). A highlight's colour argument is shown in that colour.

import { tokenizeLine } from '../editor/syntax';
import type { Report, ReportItem, ReportState, ReportStateRow } from '../script/engine';
import type { StyledRow } from '../ui/output-pane';

type Seg = StyledRow['segs'][number];

/** The width used when the pane has not been measured. */
export const MESSAGE_DEFAULT_W = 80;
/** Keys up to this long are padded to a common column in a listing. */
export const MESSAGE_KEY_PAD = 24;

/** The widest a row may be in a game pane `cols` cells wide. */
export function messageWidth(cols: number): number {
  if (!(cols > 0)) return MESSAGE_DEFAULT_W;
  return Math.max(24, cols - 1);
}

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** The arguments that reproduce the item as `#kind {arg} {arg}…`. */
export function itemArgs(item: ReportItem): string[] {
  const key = oneLine(item.key);
  const body = oneLine(item.body ?? '');
  const secs = String(item.seconds ?? 0);
  switch (item.kind) {
    case 'gag':
      return [key];
    case 'ticker':
      return [key, body, secs];
    case 'delay':
      return key === '' ? [secs, body] : [key, body, secs];
    default:
      return item.priority === undefined ? [key, body] : [key, body, String(item.priority)];
  }
}

/** Cuts the longest argument until `#word {arg}…` plus `extra` cells fits `width`. */
function fit(word: string, args: string[], extra: number, width: number): string[] {
  const out = args.slice();
  for (let guard = 0; guard < 8; guard++) {
    const total = 1 + word.length + out.reduce((n, a) => n + a.length + 3, 0) + extra;
    if (total <= width) break;
    let longest = 0;
    for (let i = 1; i < out.length; i++) if (out[i]!.length > out[longest]!.length) longest = i;
    const a = out[longest]!;
    if (a.length <= 2) break;
    const keep = Math.max(1, a.length - (total - width) - 1);
    out[longest] = a.slice(0, keep) + '…';
  }
  return out;
}

interface Mark {
  from: number;
  to: number;
  seg: Omit<Seg, 'text'>;
}

/** `text` as segments: the lexer's tokens, with `marks` taking precedence. */
function lex(text: string, marks: readonly Mark[] = []): Seg[] {
  const all: Mark[] = [
    ...tokenizeLine(text)
      .filter((t) => !marks.some((m) => t.from < m.to && t.to > m.from))
      .map((t) => ({ from: t.from, to: t.to, seg: { cls: `wc-syn-${t.cls}` } })),
    ...marks,
  ].sort((a, b) => a.from - b.from);
  const segs: Seg[] = [];
  let pos = 0;
  for (const m of all) {
    if (m.to <= m.from) continue;
    if (m.from > pos) segs.push({ text: text.slice(pos, m.from) });
    segs.push({ text: text.slice(m.from, m.to), ...m.seg });
    pos = m.to;
  }
  if (pos < text.length) segs.push({ text: text.slice(pos) });
  return segs;
}

const ROW_CLS = 'wc-msg';
/** States that say nothing was done, or that something is off: set apart. */
const NEGATIVE: ReadonlySet<ReportState> = new Set<ReportState>(['not found', 'not open', 'off']);

/** One definition row; `pad` is the width its first argument is padded to. */
function itemRow(item: ReportItem, width: number, pad = 0): StyledRow {
  const raw = itemArgs(item);
  const gap = raw.length > 1 ? Math.max(0, pad - raw[0]!.length) : 0;
  const args = fit(item.kind, raw, gap, width);
  let text = '#' + item.kind;
  const marks: Mark[] = [];
  args.forEach((a, i) => {
    text += ' {';
    // A highlight's colour, in that colour.
    if (i === 1 && item.kind === 'highlight' && item.style) marks.push({ from: text.length, to: text.length + a.length, seg: { run: item.style } });
    text += a + '}';
    if (i === 0) text += ' '.repeat(gap);
  });
  return { cls: ROW_CLS, segs: lex(text, marks) };
}

function stateText(r: ReportStateRow): string {
  return r.count !== undefined ? `${r.state} (${r.count})` : r.state;
}

function stateRows(rows: readonly ReportStateRow[], width: number): StyledRow[] {
  const heads = rows.map((r) => {
    if (r.key === null) return '#' + r.word;
    const [key] = fit(r.word, [oneLine(r.key)], 1 + stateText(r).length, width);
    return `#${r.word} {${key}}`;
  });
  const col = rows.length > 1 ? Math.max(...heads.map((h) => h.length)) : 0;
  return rows.map((r, i) => ({
    cls: ROW_CLS,
    segs: [...lex(heads[i]!), { text: ' '.repeat(Math.max(0, col - heads[i]!.length) + 1) }, { text: stateText(r), cls: NEGATIVE.has(r.state) ? 'wc-msg-state wc-msg-neg' : 'wc-msg-state' }],
  }));
}

/** The rows for one report, in a game pane `cols` cells wide. */
export function messageRows(report: Report, cols = 0): StyledRow[] {
  const width = messageWidth(cols);
  switch (report.type) {
    case 'set':
      return [itemRow(report.item, width)];
    case 'list': {
      const keys = report.items.map((it) => itemArgs(it)[0]!.length).filter((n) => n <= MESSAGE_KEY_PAD);
      const pad = report.items.length > 1 && keys.length > 0 ? Math.max(...keys) : 0;
      return report.items.map((it) => itemRow(it, width, pad));
    }
    case 'state':
      return stateRows(report.rows, width);
  }
}

/** A row's plain text (tests, and what a copy gives). */
export function messageText(row: StyledRow): string {
  return row.segs.map((s) => s.text).join('');
}
