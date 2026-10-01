// Cell metrics (ADR 0010 "Fonts and cell grid", ADR 0011).
//
// The cell is the unit of every chrome size. `CellMetrics` owns four
// custom properties on <html>: `--font-size`, `--cell-w`, `--cell-h` and
// `--cell-ls` (letter-spacing).
//
// - Font size: the setting nudged so that the glyph advance is a whole
//   number of px (`fontPx`). A fractional advance makes runs of block
//   glyphs show hairline seams (Firefox places glyphs at sub-pixel
//   offsets; Chrome rounds hinted advances past the glyph's ink).
// - Letter-spacing: Firefox lays out in 1/60 px units and its hinted
//   advance can miss the whole px by a unit or two (DejaVu at 10 px cells
//   gives 9.983 or 10.017, never 10). Once the font has loaded, the
//   measured advance is corrected to the whole px with a tiny
//   letter-spacing. Chrome needs none. A `wholePx` family (ADR 0049) is
//   set at a whole px size whose advance is up to 0.45 px over the cell:
//   Chrome rounds it down, Firefox gets that much letter-spacing off.
// - Width: the whole-px advance (the raw measured advance if the font is
//   not a bundled one or has not loaded).
// - Height: the height `█` covers in the font (`FontInfo.blockEm`, read
//   from the font file; ADR 0049) times the font size, rounded DOWN to whole
//   px, less the family's `cellMargin` (ADR 0049) where the block would
//   otherwise fill the cell exactly. The block glyph then always reaches
//   into the next row, so block,
//   half-block and quadrant art tiles without gaps. The browser's line
//   height (ascent and descent rounded separately) and canvas
//   `actualBoundingBox*` (rounded outwards) both leave seams, so the
//   height is computed, not measured. All text uses
//   `line-height: var(--cell-h)`, so rows are exactly one cell.
//
// The family is `fontInfo(a.font)`: a stored Lucida Console that is not
// installed renders, and is measured, as DejaVu Sans Mono (ADR 0049).
//
// `update(appearance)` measures at once (the font may still be loading)
// and again after `document.fonts.load` resolves. Subscribers hear every
// change of the cell size.

import { type AppearanceSettings, defaultSettings } from '../settings/types';
import { fontInfo, fontPx, loadFont } from './fonts';

export interface CellSize {
  /** Cell width in CSS px (whole px once a bundled font has loaded). */
  w: number;
  /** Cell height in CSS px (integer). */
  h: number;
  /** The CSS font size in px that gives this cell. */
  px: number;
  /** Letter-spacing in px that makes the advance exactly `w` (usually 0). */
  ls: number;
}

export type CellMeasure = (a: Readonly<AppearanceSettings>) => CellSize;

/** Length of the measured run of `█`. */
const RUN = 40;
/**
 * Largest advance error corrected with letter-spacing, px: Firefox's
 * 1/60 px rounding, and the up to 0.45 px of a `wholePx` family (fonts.ts).
 */
const MAX_LS = 0.5;

/** Cell height in px for font `a.font` at `px` (see the file header). */
export function cellHeight(a: Readonly<AppearanceSettings>, px = fontPx(a.font, a.size)): number {
  const f = fontInfo(a.font);
  return Math.max(1, Math.floor(px * f.blockEm - (f.cellMargin ?? 0) + 1e-6));
}

/** The cell the bundled font should give for `a` (used when nothing can be measured). */
export function nominalCell(a: Readonly<AppearanceSettings>): CellSize {
  const px = fontPx(a.font, a.size);
  return { w: Math.round(px * fontInfo(a.font).advanceEm), h: cellHeight(a, px), px, ls: 0 };
}

function advanceAt(a: Readonly<AppearanceSettings>, px: number, doc: Document): number {
  const span = doc.createElement('span');
  span.setAttribute('aria-hidden', 'true');
  span.style.cssText =
    'position:absolute;left:-10000px;top:0;visibility:hidden;white-space:pre;' +
    `letter-spacing:0;font-family:${fontInfo(a.font).stack};font-size:${px}px`;
  span.textContent = '█'.repeat(RUN);
  (doc.body ?? doc.documentElement).appendChild(span);
  const w = span.getBoundingClientRect().width / RUN;
  span.remove();
  return w;
}

/** Measures (and calibrates) the cell for `a` in `doc` (see the file header). */
export function measureCell(a: Readonly<AppearanceSettings>, doc: Document = document): CellSize {
  const nominal = nominalCell(a);
  const w = advanceAt(a, nominal.px, doc);
  if (!(w > 0)) return nominal;
  if (Math.abs(w - nominal.w) < 0.002) return nominal;
  const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
  const loaded = fonts?.check?.(`${nominal.px}px "${fontInfo(a.font).family}"`, '█') ?? false;
  const err = nominal.w - w;
  if (loaded && Math.abs(err) <= MAX_LS) return { ...nominal, ls: Math.round(err * 1e4) / 1e4 };
  return { ...nominal, w };
}

export interface CellMetricsOptions {
  doc?: Document;
  /** Element that receives the custom properties (default <html>). */
  root?: HTMLElement;
  /** Measurement override (tests). */
  measure?: CellMeasure;
  /** Font load wait override (tests). */
  loadFont?: (a: Readonly<AppearanceSettings>) => Promise<void>;
}

export class CellMetrics {
  private cell: CellSize;
  private readonly listeners = new Set<(c: CellSize) => void>();
  private readonly doc: Document;
  private readonly root: HTMLElement;
  private readonly measure: CellMeasure;
  private readonly waitFont: (a: Readonly<AppearanceSettings>) => Promise<void>;
  private gen = 0;

  constructor(opts: CellMetricsOptions = {}) {
    this.doc = opts.doc ?? document;
    this.root = opts.root ?? this.doc.documentElement;
    this.measure = opts.measure ?? ((a) => measureCell(a, this.doc));
    this.waitFont = opts.loadFont ?? ((a) => loadFont(a.font, fontPx(a.font, a.size), this.doc));
    this.cell = nominalCell(defaultSettings().appearance);
  }

  /** The current cell size. */
  get(): CellSize {
    return this.cell;
  }

  /** Calls `fn` whenever the cell size changes; returns the unsubscribe function. */
  subscribe(fn: (c: CellSize) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Measures for `a` now and again once its font has loaded. The promise
   * resolves after the second measurement (a newer call supersedes it).
   */
  async update(a: Readonly<AppearanceSettings>): Promise<void> {
    const gen = ++this.gen;
    this.publish(this.measure(a));
    await this.waitFont(a);
    if (gen !== this.gen) return;
    this.publish(this.measure(a));
  }

  private publish(c: CellSize): void {
    const st = this.root.style;
    st.setProperty('--font-size', `${c.px}px`);
    st.setProperty('--cell-w', `${c.w}px`);
    st.setProperty('--cell-h', `${c.h}px`);
    st.setProperty('--cell-ls', `${c.ls}px`);
    const old = this.cell;
    if (c.w === old.w && c.h === old.h && c.px === old.px && c.ls === old.ls) return;
    this.cell = c;
    for (const fn of [...this.listeners]) fn(c);
  }
}
