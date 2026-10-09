// `wrapText(text, width[, indent])` (ADR 0089): word-wraps cecho text to a
// script pane's width. Each line is measured as the pane measures it: the
// text is parsed by `parseCecho` (with the shade roles), split at `\n` and
// turned into spans by `splitLines` and `toSpans`, so tags take no cells,
// tabs are one cell and control characters none (src/panes/script-content.ts).
//
// - Breaks at spaces; a word wider than the line is cut. The spaces at a
//   break go; the first line keeps its leading spaces.
// - `indent` cells of spaces start every continuation line and count
//   toward the width (at most width - 1).
// - Each returned line is cecho text on its own: it opens the style its
//   first text has (so colour and background carry across a break) and
//   ends no style it does not need to.
// - A width under 1 splits at `\n` only.

import { cechoColorName, parseCecho } from './colors';
import { type PaneSpan, splitLines, toSpans } from '../panes/script-content';

/** Wraps `text` (cecho tags allowed) to `width` cells; see the file header. */
export function wrapText(text: string, width: number, indent = 0): string[] {
  const lines = splitLines(parseCecho(text.replace(/\r/g, ''), { shades: true }));
  const w = Number.isFinite(width) ? Math.floor(width) : 0;
  const out: string[] = [];
  for (const l of lines) {
    const spans = toSpans(l);
    if (w < 1) {
      out.push(spansToCecho(spans));
      continue;
    }
    const ind = Math.max(0, Math.min(w - 1, Number.isFinite(indent) ? Math.floor(indent) : 0));
    for (const row of wrapSpans(spans, w, ind)) out.push(spansToCecho(row));
  }
  return out;
}

/** Spans cut into rows of at most `width` cells, continuation rows led by `indent` spaces. */
export function wrapSpans(spans: readonly PaneSpan[], width: number, indent: number): PaneSpan[][] {
  // One entry per cell: its character and the span it came from.
  let text = '';
  const owner: number[] = [];
  spans.forEach((s, i) => {
    text += s.text;
    for (let k = 0; k < s.text.length; k++) owner.push(i);
  });
  const piece = (a: number, b: number): PaneSpan[] => {
    const out: PaneSpan[] = [];
    let k = a;
    while (k < b) {
      const i = owner[k]!;
      let e = k;
      while (e < b && owner[e] === i) e++;
      out.push({ ...spans[i]!, text: text.slice(k, e) });
      k = e;
    }
    return out;
  };
  const rows: PaneSpan[][] = [];
  let pos = 0;
  let first = true;
  for (;;) {
    const room = first ? width : width - indent;
    const lead: PaneSpan[] = first || indent === 0 ? [] : [{ text: ' '.repeat(indent) }];
    if (text.length - pos <= room) {
      rows.push([...lead, ...piece(pos, text.length)]);
      return rows;
    }
    // The last space that ends a row with text in it, else a hard cut.
    let start = pos;
    while (start < text.length && text[start] === ' ') start++;
    let brk = -1;
    for (let j = pos + room; j > start; j--) {
      if (text[j] === ' ') {
        brk = j;
        break;
      }
    }
    let end = brk;
    if (brk < 0) end = pos + room;
    else while (end > pos && text[end - 1] === ' ') end--;
    rows.push([...lead, ...piece(pos, end)]);
    pos = brk < 0 ? end : brk;
    while (pos < text.length && text[pos] === ' ') pos++;
    first = false;
    if (pos >= text.length) return rows;
  }
}

function styled(s: PaneSpan): boolean {
  return s.fg !== undefined || s.bg !== undefined || !!s.bold || !!s.italic || !!s.underline;
}

function sameStyle(a: PaneSpan, b: PaneSpan): boolean {
  return a.fg === b.fg && a.bg === b.bg && !a.bold === !b.bold && !a.italic === !b.italic && !a.underline === !b.underline;
}

/** Spans as cecho text that `parseCecho` reads back to the same spans. */
export function spansToCecho(spans: readonly PaneSpan[]): string {
  let out = '';
  let cur: PaneSpan = { text: '' };
  for (const s of spans) {
    if (s.text === '') continue;
    if (!sameStyle(cur, s)) {
      if (styled(cur)) out += '<reset>';
      if (s.fg !== undefined || s.bg !== undefined) {
        out += `<${s.fg !== undefined ? cechoColorName(s.fg) : ''}${s.bg !== undefined ? ':' + cechoColorName(s.bg) : ''}>`;
      }
      if (s.bold) out += '<b>';
      if (s.italic) out += '<i>';
      if (s.underline) out += '<u>';
      cur = s;
    }
    out += s.text;
  }
  return out;
}
