// Cell-grid drawing for pane content (ADR 0016: direct DOM, no Preact).
//
// A `CellLine` is one row of `w` cells: a character, a foreground and a
// background per cell. Build it with `put` / `fill`, then `toElement`
// merges equal neighbours into spans:
//
//   <div class="wc-prow"><span style="color:…;background:…">text</span>…</div>
//
// Runs of block and box glyphs get their own span, class `wc-art`.
//
// Colours are hex strings, or '' for the pane's own (inherited) colour.
// Every row is exactly `w` cells (spaces pad), one cell per UTF-16 unit;
// pane text is BMP (names, block glyphs), so that holds.

import './panes.css';

export interface CellStyle {
  fg?: string;
  bg?: string;
  bold?: boolean;
  italic?: boolean;
}

const SPACE = 0;
const ART = 1;
const TEXT = 2;

/**
 * Block and box glyphs (U+2500–259F) are glyph art: they keep the full
 * line-height so they tile, while text sits one pixel higher so its lowest
 * descender row (`_`) stays inside the cell (panes.css, ADR 0042).
 */
function cellKind(ch: string): number {
  if (ch === ' ') return SPACE;
  const c = ch.charCodeAt(0);
  return c >= 0x2500 && c <= 0x259f ? ART : TEXT;
}

export class CellLine {
  readonly w: number;
  readonly ch: string[];
  readonly fg: string[];
  readonly bg: string[];
  readonly flags: number[];

  constructor(w: number) {
    this.w = Math.max(0, w);
    this.ch = new Array<string>(this.w).fill(' ');
    this.fg = new Array<string>(this.w).fill('');
    this.bg = new Array<string>(this.w).fill('');
    this.flags = new Array<number>(this.w).fill(0);
  }

  /** Writes `text` from column `x` (clipped); unset style parts keep the cell's. */
  put(x: number, text: string, st: CellStyle = {}): this {
    for (let i = 0; i < text.length; i++) {
      const c = x + i;
      if (c < 0) continue;
      if (c >= this.w) break;
      this.ch[c] = text[i]!;
      this.style(c, st);
    }
    return this;
  }

  /** Sets the style of columns [x0, x1) without changing the text. */
  fill(x0: number, x1: number, st: CellStyle): this {
    for (let c = Math.max(0, x0); c < Math.min(this.w, x1); c++) this.style(c, st);
    return this;
  }

  private style(c: number, st: CellStyle): void {
    if (st.fg !== undefined) this.fg[c] = st.fg;
    if (st.bg !== undefined) this.bg[c] = st.bg;
    if (st.bold !== undefined) this.flags[c] = st.bold ? this.flags[c]! | 1 : this.flags[c]! & ~1;
    if (st.italic !== undefined) this.flags[c] = st.italic ? this.flags[c]! | 2 : this.flags[c]! & ~2;
  }

  /** The text (for tests). */
  text(): string {
    return this.ch.join('');
  }

  /** The row element: one span per run of equal style. */
  toElement(doc: Document): HTMLDivElement {
    const row = doc.createElement('div');
    row.className = 'wc-prow';
    let i = 0;
    while (i < this.w) {
      // A run: equal style, and glyph art apart from text (spaces go with either).
      let kind = cellKind(this.ch[i]!);
      let j = i + 1;
      while (j < this.w && this.fg[j] === this.fg[i] && this.bg[j] === this.bg[i] && this.flags[j] === this.flags[i]) {
        const k = cellKind(this.ch[j]!);
        if (k !== SPACE) {
          if (kind !== SPACE && k !== kind) break;
          kind = k;
        }
        j++;
      }
      const text = this.ch.slice(i, j).join('');
      const fg = this.fg[i]!;
      const bg = this.bg[i]!;
      const fl = this.flags[i]!;
      if (!fg && !bg && !fl && kind !== ART) {
        row.append(text);
      } else {
        const span = doc.createElement('span');
        if (kind === ART) span.className = 'wc-art';
        if (fg) span.style.color = fg;
        if (bg) span.style.backgroundColor = bg;
        if (fl & 1) span.style.fontWeight = 'bold';
        if (fl & 2) span.style.fontStyle = 'italic';
        span.textContent = text;
        row.append(span);
      }
      i = j;
    }
    return row;
  }
}

/** `text` centred in `w` cells (extra space on the right), clipped to `w`. */
export function centre(text: string, w: number): string {
  if (w <= 0) return '';
  if (text.length >= w) return text.slice(0, w);
  const left = Math.floor((w - text.length) / 2);
  return ' '.repeat(left) + text + ' '.repeat(w - text.length - left);
}

/** The overflow indicator colour (Inv §2.2, §2.3): amber italic. */
export const INDICATOR_FG = '#d4a04e';

/** `↓ N more <what>` as a row of `w` cells. */
export function overflowLine(w: number, n: number, what: string): CellLine {
  return new CellLine(w).put(0, `↓ ${n} more ${what}`, { fg: INDICATOR_FG, italic: true });
}
