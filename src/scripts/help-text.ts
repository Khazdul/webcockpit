// Help typesetting (ADR 0121 "Help text"): a script's `@help` lines laid
// out for a width, shared by the Scripts page (scripts-model.ts) and
// `#script help` (command-rows.ts), so an author sees one result.
//
// The lines come from the header parser with their indentation relative
// to the least-indented `@help` line. Blocks:
//
// - `## Text` (unindented): a heading.
// - An unindented line starting with `- ` or `• `: a list item, wrapped
//   with a hanging indent; the unindented lines after it continue it.
// - Other unindented lines: a paragraph. Consecutive ones are joined and
//   wrapped to the width. A blank line ends a paragraph (or an item).
// - A run of indented lines in which every line at the run's indentation
//   is an entry `term  description` (two or more spaces between; the term
//   does not end a sentence with `.`, `!` or `?`), and every other line is
//   indented to its entry's description or further: a two-column table.
//   The term is in the active role, the description wraps at its column.
//   When the term column would take more than 40 % of the width, each
//   description goes under its term instead.
// - Any other indented run is preformatted: kept line by line, a line
//   wider than the width wrapped with a hanging indent.
//
// Blank lines are kept (runs of them collapse to one) and a heading gets
// one above it. Pure TypeScript, no DOM.

/** What a run of help text is, for its colour. */
export type HelpRole = 'heading' | 'text' | 'bullet' | 'term' | 'desc' | 'pre';

export interface HelpSeg {
  text: string;
  /** None: spaces. */
  role?: HelpRole;
}

export type HelpLine = HelpSeg[];

/** Indentation of tables and preformatted runs in the output. */
const BLOCK_INDENT = 2;
/** Between a table's term column and its descriptions. */
const TABLE_GAP = 2;
/** A description under its term is indented this much past the term. */
const STACK_INDENT = 4;
/** The term column may take this share of the width before the table stacks. */
const TERM_SHARE = 0.4;

const cps = (s: string): number => [...s].length;
const indentOf = (s: string): number => s.length - s.trimStart().length;
const sp = (n: number): HelpSeg => ({ text: ' '.repeat(Math.max(0, n)) });

/** Word-wraps `text` to lines of at most `w` cells; a word longer than `w` is split. */
export function wrapWords(text: string, w: number): string[] {
  const width = Math.max(1, w);
  const out: string[] = [];
  let line = '';
  for (let word of text.split(/\s+/).filter(Boolean)) {
    while (cps(word) > width) {
      if (line) {
        out.push(line);
        line = '';
      }
      const c = [...word];
      out.push(c.slice(0, width).join(''));
      word = c.slice(width).join('');
    }
    if (!word) continue;
    if (!line) line = word;
    else if (cps(line) + 1 + cps(word) <= width) line += ' ' + word;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  return out.length > 0 ? out : [''];
}

/**
 * A preformatted line in pieces: the first at most `first` cells, the rest
 * at most `rest`, each broken at its last space that fits (the spacing
 * inside a piece is kept), else cut.
 */
function breakPre(s: string, first: number, rest: number): string[] {
  const out: string[] = [];
  let c = [...s];
  let w = Math.max(1, first);
  while (c.length > w) {
    let cut = c.lastIndexOf(' ', w);
    if (cut < w / 3) cut = w;
    out.push(c.slice(0, cut).join('').trimEnd());
    c = c.slice(cut);
    while (c[0] === ' ') c.shift();
    w = Math.max(1, rest);
  }
  if (c.length > 0) out.push(c.join(''));
  return out;
}

/** One block of help. */
type Block =
  | { kind: 'blank' }
  | { kind: 'heading'; text: string }
  | { kind: 'para'; text: string }
  | { kind: 'item'; bullet: string; text: string }
  | { kind: 'table'; rows: { term: string; desc: string }[] }
  | { kind: 'pre'; lines: string[] };

const ITEM = /^([-•])\s+(.*)$/;
const HEADING = /^##\s+(.*)$/;
/** `term  description`: the term up to the first run of two or more spaces. */
const ENTRY = /^(\S(?:.*?\S)?)( {2,})(\S.*)$/;

/** The table of an indented run, or null when it is not one (it is then preformatted). */
function tableOf(lines: readonly string[]): { term: string; desc: string }[] | null {
  const base = Math.min(...lines.map(indentOf));
  const rows: { term: string; desc: string; col: number }[] = [];
  for (const l of lines) {
    const ind = indentOf(l);
    const body = l.slice(ind);
    if (ind === base) {
      const m = ENTRY.exec(body);
      if (!m || /[.!?]$/.test(m[1]!)) return null;
      rows.push({ term: m[1]!, desc: m[3]!, col: ind + m[1]!.length + m[2]!.length });
    } else {
      const last = rows.at(-1);
      if (!last || ind < last.col) return null;
      last.desc += ' ' + body.trim();
    }
  }
  return rows.length > 0 ? rows.map(({ term, desc }) => ({ term, desc })) : null;
}

/** The help lines as blocks. */
function blocks(lines: readonly string[]): Block[] {
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i]!;
    if (l.trim() === '') {
      if (out.length > 0 && out.at(-1)!.kind !== 'blank') out.push({ kind: 'blank' });
      i++;
      continue;
    }
    if (indentOf(l) > 0) {
      const run: string[] = [];
      while (i < lines.length && lines[i]!.trim() !== '' && indentOf(lines[i]!) > 0) run.push(lines[i++]!);
      const rows = tableOf(run);
      if (rows) out.push({ kind: 'table', rows });
      else {
        const base = Math.min(...run.map(indentOf));
        out.push({ kind: 'pre', lines: run.map((r) => r.slice(base)) });
      }
      continue;
    }
    const h = HEADING.exec(l);
    if (h) {
      if (out.length > 0 && out.at(-1)!.kind !== 'blank') out.push({ kind: 'blank' });
      out.push({ kind: 'heading', text: h[1]!.trim() });
      i++;
      continue;
    }
    // A paragraph or a list item: this line and the unindented lines after it.
    const item = ITEM.exec(l);
    let text = item ? item[2]! : l.trim();
    i++;
    while (i < lines.length) {
      const n = lines[i]!;
      if (n.trim() === '' || indentOf(n) > 0 || ITEM.exec(n) || HEADING.exec(n)) break;
      text += ' ' + n.trim();
      i++;
    }
    out.push(item ? { kind: 'item', bullet: item[1]!, text } : { kind: 'para', text });
  }
  while (out.at(-1)?.kind === 'blank') out.pop();
  return out;
}

/**
 * The help `lines` (relative indentation, header.ts) typeset for `width`
 * cells: no line is wider than `width`.
 */
export function typesetHelp(lines: readonly string[], width: number): HelpLine[] {
  const w = Math.max(8, width);
  const out: HelpLine[] = [];
  for (const b of blocks(lines)) {
    switch (b.kind) {
      case 'blank':
        out.push([]);
        break;
      case 'heading':
        for (const l of wrapWords(b.text, w)) out.push([{ text: l, role: 'heading' }]);
        break;
      case 'para':
        for (const l of wrapWords(b.text, w)) out.push([{ text: l, role: 'text' }]);
        break;
      case 'item': {
        const lead = cps(b.bullet) + 1;
        wrapWords(b.text, w - lead).forEach((l, i) =>
          out.push(i === 0 ? [{ text: b.bullet, role: 'bullet' }, sp(1), { text: l, role: 'text' }] : [sp(lead), { text: l, role: 'text' }]),
        );
        break;
      }
      case 'table': {
        const termW = Math.max(...b.rows.map((r) => cps(r.term)));
        const descAt = BLOCK_INDENT + termW + TABLE_GAP;
        const stacked = descAt > w * TERM_SHARE || w - descAt < 12;
        for (const r of b.rows) {
          if (stacked) {
            for (const l of wrapWords(r.term, w - BLOCK_INDENT)) out.push([sp(BLOCK_INDENT), { text: l, role: 'term' }]);
            const at = BLOCK_INDENT + STACK_INDENT;
            for (const l of wrapWords(r.desc, w - at)) out.push([sp(at), { text: l, role: 'desc' }]);
            continue;
          }
          wrapWords(r.desc, w - descAt).forEach((l, i) =>
            out.push(
              i === 0
                ? [sp(BLOCK_INDENT), { text: r.term, role: 'term' }, sp(descAt - BLOCK_INDENT - cps(r.term)), { text: l, role: 'desc' }]
                : [sp(descAt), { text: l, role: 'desc' }],
            ),
          );
        }
        break;
      }
      case 'pre':
        for (const l of b.lines) {
          const ind = BLOCK_INDENT + indentOf(l);
          const body = l.trimStart();
          if (ind + cps(body) <= w) {
            out.push([sp(ind), { text: body, role: 'pre' }]);
            continue;
          }
          // Too wide: broken at a space (its own spacing kept), the rest
          // with a hanging indent under the line's start.
          const at = Math.min(ind, Math.floor(w / 2));
          const hang = Math.min(at + 2, w - 8);
          breakPre(body, w - at, w - hang).forEach((p, i) => out.push([sp(i === 0 ? at : hang), { text: p, role: 'pre' }]));
        }
        break;
    }
  }
  return out;
}

/** The cells of a typeset line. */
export const helpLineText = (l: HelpLine): string => l.map((s) => s.text).join('');

// ------------------------------------------------------------ blocks for the DOM (stage 44a)

/**
 * One block of help, for a page that lays the help out itself (the
 * Scripts page's DOM help, stage 44a): the same block decisions as
 * `typesetHelp` (headings, paragraphs, list items, term tables, pre runs,
 * the blank lines between them).
 */
export type HelpBlock = Block;

/** The help `lines` (relative indentation, header.ts) as blocks, as `typesetHelp` sees them. */
export function helpBlocks(lines: readonly string[]): HelpBlock[] {
  return blocks(lines);
}
