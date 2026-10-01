// Synthetic colour charts in the layout of MUME's `help 24-bit colours`
// (performance review #3, notes/research/perf-review/A-render.md §5). The
// unit tests, the browser tests and the benchmark use them, so the colour
// page can be tested without the owner's logs. `colour-chart.gen.ts`
// writes them into `colour-chart.log` for `/?fixture=colour-chart.log`.
//
// The layout, from a real session (2026-09-30):
// - One block of three lines per brightness level `v` (37 levels, 6 … 255):
//   25 labels `#rrggbb ` (8 cells each) word-wrapped at 95 columns, so two
//   lines of 95 cells and one of 8.
// - The background sweeps a hue path across the block's 200 cells (red,
//   yellow, green, cyan, white, magenta, blue, red), one colour per cell;
//   equal neighbours share one SGR, so dark blocks change every 2 cells and
//   bright ones every cell. A label names the colour under its `#`.
// - The foreground is white (`38;2;255;255;255`) and turns black for labels
//   on light colours. Each block starts with the foreground and ends with
//   `ESC[0m`; the SGR state carries across its lines.
// - MUME pages the help text: the first screen holds 46 lines, then
//   `*** Return: continue … ***` and a prompt.
//
// MUME's 256-colour page is not in any log; `chart256` keeps the same
// layout with backgrounds from the 240 palette colours 16–255 (`48;5;n`).

const ESC = '\x1b';

/** Cells per block (25 labels of 8 cells), and MUME's wrap width. */
const BLOCK_CELLS = 200;
const WRAP = 95;
const LABEL = 8;

type Rgb = readonly [number, number, number];

/** The hue path at `t` ∈ [0, 1) for brightness `v`. */
function hue(t: number, v: number): Rgb {
  const path: Rgb[] = [
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
    [0, 1, 1],
    [1, 1, 1],
    [1, 0, 1],
    [0, 0, 1],
    [1, 0, 0],
  ];
  const x = t * (path.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = path[i]!;
  const b = path[i + 1]!;
  return [0, 1, 2].map((k) => Math.floor(v * (a[k]! + (b[k]! - a[k]!) * f))) as unknown as Rgb;
}

const hex = (c: Rgb): string => '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('');
const light = (c: Rgb): boolean => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] > 140;

/**
 * One block of labels over `cells` (per cell its background SGR and
 * colour), wrapped into lines. A label names the colour under its `#`;
 * `fg` gives the foreground SGR for a label on that colour.
 */
function block(cells: Array<{ sgr: string; rgb: Rgb }>, fg: (c: Rgb) => string): string[] {
  const labels: string[] = [];
  for (let i = 0; i < cells.length; i += LABEL) labels.push(hex(cells[i]!.rgb) + ' ');
  // Word wrap at WRAP columns: 12 labels per line, the space at the wrap dropped.
  const perLine = Math.floor((WRAP + 1) / LABEL);
  const lines: string[] = [];
  let curFg = '';
  let curBg = '';
  for (let l = 0; l * perLine < labels.length; l++) {
    const first = l * perLine;
    const last = Math.min(labels.length, first + perLine);
    let text = labels.slice(first, last).join('');
    if (last < labels.length) text = text.slice(0, -1);
    let out = '';
    for (let k = 0; k < text.length; k++) {
      const cell = cells[first * LABEL + k]!;
      const params: string[] = [];
      if (k % LABEL === 0) {
        const f = fg(cell.rgb);
        if (f !== curFg) params.push(f);
        curFg = f;
      }
      if (params.length > 0 || cell.sgr !== curBg) params.push(cell.sgr);
      curBg = cell.sgr;
      if (params.length > 0) out += `${ESC}[${params.join(';')}m`;
      out += text[k];
    }
    if (last >= labels.length) out += `${ESC}[0m`;
    lines.push(out);
  }
  return lines;
}

const WHITE = '38;2;255;255;255';
const BLACK = '38;2;0;0;0';

/** The 37 brightness levels of MUME's chart: 6, 13, 20, … 255. */
export const CHART_LEVELS: readonly number[] = Array.from({ length: 37 }, (_, i) => Math.floor((255 * (i + 1)) / 37));

/** The rows of the 24-bit chart (raw text with SGR, no line ends): 3 per level. */
export function chart24Rows(): string[] {
  const rows: string[] = [];
  for (const v of CHART_LEVELS) {
    const cells = Array.from({ length: BLOCK_CELLS }, (_, i) => {
      const rgb = hue(i / BLOCK_CELLS, v);
      return { sgr: `48;2;${rgb[0]};${rgb[1]};${rgb[2]}`, rgb };
    });
    rows.push(...block(cells, (c) => (light(c) ? BLACK : WHITE)));
  }
  return rows;
}

/** The xterm colour of palette index 16–255 (cube and grey ramp). */
function xterm(n: number): Rgb {
  if (n >= 232) {
    const g = 8 + (n - 232) * 10;
    return [g, g, g];
  }
  const i = n - 16;
  const level = (x: number): number => (x === 0 ? 0 : 55 + x * 40);
  return [level(Math.floor(i / 36)), level(Math.floor(i / 6) % 6), level(i % 6)];
}

/** The rows of the 256-colour chart: the same layout, palette backgrounds. */
export function chart256Rows(): string[] {
  const rows: string[] = [];
  CHART_LEVELS.forEach((_, level) => {
    const cells = Array.from({ length: BLOCK_CELLS }, (_, i) => {
      // Two cells per colour, as in the dark 24-bit blocks; each block starts further on.
      const n = 16 + ((level * 37 + Math.floor(i / 2)) % 240);
      return { sgr: `48;5;${n}`, rgb: xterm(n) };
    });
    rows.push(...block(cells, (c) => (light(c) ? '38;5;0' : '38;5;15')));
  });
  return rows;
}

/** MUME's pager line after a screen of help text. */
export function pagerLine(percent: number, first: boolean): string {
  return first
    ? `*** Return: continue, b: back, r: redisplay, q: quit, >: bottom (${percent}%) *** `
    : `*** Return: continue, b: back, r: redisplay, q: quit, <: top (${percent}%) *** `;
}

/**
 * A help page as MUME sends it, split into screens: the heading, the chart
 * rows and the closing line, cut every `screen` lines (46 for the first
 * screen in the owner's session). Each screen but the last ends with an
 * empty line; the pager line follows as a prompt (not included).
 */
export function chartScreens(kind: '24-bit' | '256', screen = 46): string[][] {
  const head =
    kind === '24-bit'
      ? ['24-BIT COLORS, 24-BIT COLOURS', '', 'If your terminal supports 24-bit RGB colours, this should show a colour gradient:', '']
      : ['256 COLORS, 256 COLOURS', '', 'If your terminal supports 256 colours, this should show the palette:', ''];
  const all = [...head, ...(kind === '24-bit' ? chart24Rows() : chart256Rows()), '', 'See help colours for more information.'];
  const screens: string[][] = [];
  for (let i = 0; i < all.length; i += screen) screens.push(all.slice(i, i + screen));
  for (let i = 0; i < screens.length - 1; i++) screens[i]!.push('');
  return screens;
}
