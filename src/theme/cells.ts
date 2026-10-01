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
  /**
   * Cell width in CSS px: whole device px once a bundled font has loaded
   * (whole CSS px at device pixel ratio 1; ADR 0050).
   */
  w: number;
  /** Cell height in CSS px: whole device px (whole CSS px at ratio 1). */
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

/**
 * How the cell is fitted to the device pixels (ADR 0050):
 *
 * - `device` (Gecko, Firefox): fractional advances and baselines. The cell
 *   is whole device px, with the font size whose advance is exactly the
 *   width.
 * - `css` (Blink, Chrome, and WebKit, at a whole ratio): font metrics are
 *   rounded to whole CSS px and on Linux the font is drawn at the device
 *   size rounded to a whole px. The cell stays whole CSS px (whole device
 *   px at a whole ratio); the font size is nudged in device px where
 *   Chrome would draw a block narrower than the cell.
 * - `blink-device` (Blink at a fractional ratio): whole CSS px would put
 *   column and row edges between device pixels, so the cell is whole
 *   device px, with a font size Chrome draws at least as wide as it.
 */
export type TextGrid = 'device' | 'css' | 'blink-device';

/** The text grid of `doc`'s engine at its device pixel ratio (see `TextGrid`). */
export function textGridOf(doc: Document): TextGrid {
  const css = (doc.defaultView as (Window & typeof globalThis) | null)?.CSS;
  if (css?.supports?.('-moz-appearance', 'none')) return 'device';
  const dpr = devicePixelRatioOf(doc);
  return Math.abs(dpr - Math.round(dpr)) < 1e-6 ? 'css' : 'blink-device';
}

/**
 * The cell the bundled font should give for `a` at device pixel ratio
 * `dpr` on text grid `grid` (used when nothing can be measured). At ratio
 * 1 the CSS px rules above, whatever the grid (ADR 0050).
 */
export function nominalCell(a: Readonly<AppearanceSettings>, dpr = 1, grid: TextGrid = 'css'): CellSize {
  const px = fontPx(a.font, a.size);
  const f = fontInfo(a.font);
  const cell = { w: Math.round(px * f.advanceEm), h: cellHeight(a, px), px, ls: 0 };
  if (!(dpr > 0) || Math.abs(dpr - 1) < 1e-6) return cell;
  if (grid === 'device') return deviceCell(cell, f.advanceEm, f.blockEm, f.cellMargin ?? 0, dpr, false);
  if (grid === 'blink-device') return deviceCell(cell, f.advanceEm, f.blockEm, f.cellMargin ?? 0, dpr, true);
  return cssCell(cell, f.advanceEm, f.blockEm, f.cellMargin ?? 0, dpr, !!(f.wholePx || f.halfUpPx));
}

const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

/** Largest excess of Chrome's drawn advance over the cell, device px, that it rounds away. */
const CHROME_EXCESS = 0.45;

/**
 * The ratio-1 cell `c` taken to whole device px at ratio `dpr`: width `c.w
 * × dpr` rounded, height rounded down from the block height less the
 * margin. The font size gives exactly that width; with `chrome`, it is
 * raised to a whole device px or just over a half (which rounds up) whose
 * rounded size Chrome draws at most CHROME_EXCESS px wider than the cell,
 * trying the next widths when none fits.
 */
export function deviceCell(
  c: CellSize,
  advanceEm: number,
  blockEm: number,
  margin: number,
  dpr: number,
  chrome: boolean,
): CellSize {
  const target = Math.max(1, Math.round(c.w * dpr));
  let wd = target;
  let pd = target / advanceEm;
  if (chrome) {
    search: for (const w of [target, target + 1, target - 1, target + 2, target - 2]) {
      if (w < 1) continue;
      const p0 = w / advanceEm;
      const base = Math.floor(p0 + 1e-6);
      const frac = p0 - base;
      for (const cand of [frac < 1e-3 || frac >= 0.51 ? p0 : NaN, base + 0.51, base + 1, base + 1.51]) {
        if (!(cand >= p0 - 1e-6)) continue;
        const excess = Math.round(cand) * advanceEm - w;
        if (excess > -1e-6 && excess < CHROME_EXCESS) {
          wd = w;
          pd = cand;
          break search;
        }
      }
    }
  }
  // Chrome rounds the metrics to CSS px. Below 150 % that left 1-px gaps
  // in `│` that CSS_GRID_MARGIN more removes; at 150 % and up the margin
  // made seams instead (seam sweep, ADR 0050).
  const m = (margin + (chrome && dpr < 1.5 ? CSS_GRID_MARGIN : 0)) * dpr;
  const hd = Math.max(1, Math.floor(pd * blockEm - m + 1e-6));
  return { w: round6(wd / dpr), h: round6(hd / dpr), px: round6(pd / dpr), ls: 0 };
}

/**
 * Extra px off the cell height on the `css` grid at a ratio other than 1:
 * the glyph is drawn on device pixels but its baseline comes from metrics
 * rounded to CSS px, up to half a CSS px off (ADR 0050).
 */
export const CSS_GRID_MARGIN = 0.5;

/**
 * The ratio-1 cell `c` on the `css` grid at ratio `dpr`: the same width;
 * for a family that Chrome draws at whole px (`wholePx`, `halfUpPx`) a
 * font size whose device size is whole or just over a half (which rounds
 * up), so the block is at least as wide as the cell; the height less
 * CSS_GRID_MARGIN.
 */
export function cssCell(
  c: CellSize,
  advanceEm: number,
  blockEm: number,
  margin: number,
  dpr: number,
  wholeDevice: boolean,
): CellSize {
  let px = c.px;
  if (wholeDevice) {
    const pd = px * dpr;
    const frac = pd - Math.floor(pd + 1e-6);
    if (frac > 1e-3 && frac < 0.51) px = (Math.floor(pd) + 0.51) / dpr;
  }
  const h = Math.max(1, Math.floor(px * blockEm - margin - CSS_GRID_MARGIN + 1e-6));
  return { w: c.w, h, px: round6(px), ls: 0 };
}

/** The document's device pixel ratio (1 where unknown). */
export function devicePixelRatioOf(doc: Document): number {
  const r = doc.defaultView?.devicePixelRatio;
  return typeof r === 'number' && r > 0 ? r : 1;
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
  const nominal = nominalCell(a, devicePixelRatioOf(doc), textGridOf(doc));
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
  private last: Readonly<AppearanceSettings> | null = null;
  private unwatch: (() => void) | null = null;
  /** Held so that the query (and its listener) is not collected. */
  private ratioQuery: MediaQueryList | null = null;

  constructor(opts: CellMetricsOptions = {}) {
    this.doc = opts.doc ?? document;
    this.root = opts.root ?? this.doc.documentElement;
    this.measure = opts.measure ?? ((a) => measureCell(a, this.doc));
    this.waitFont = opts.loadFont ?? ((a) => loadFont(a.font, fontPx(a.font, a.size), this.doc));
    this.cell = nominalCell(defaultSettings().appearance);
    this.watchRatio();
  }

  /**
   * Re-measures when the device pixel ratio changes (browser zoom, a
   * window moved to another screen; ADR 0050): a `(resolution: Xdppx)`
   * query for the current ratio fires once it no longer matches.
   */
  private watchRatio(): void {
    const win = this.doc.defaultView;
    if (!win?.matchMedia) return;
    const ratio = devicePixelRatioOf(this.doc);
    const mq = win.matchMedia(`(resolution: ${ratio}dppx)`);
    const check = (): void => {
      if (devicePixelRatioOf(this.doc) === ratio) return;
      this.unwatch?.();
      this.watchRatio();
      if (this.last) void this.update(this.last);
    };
    // The query's change event, and a resize as a fallback (a zoom resizes
    // the viewport; Chrome does not always fire the query's event).
    mq.addEventListener?.('change', check);
    win.addEventListener('resize', check);
    this.ratioQuery = mq;
    this.unwatch = () => {
      mq.removeEventListener?.('change', check);
      win.removeEventListener('resize', check);
      this.ratioQuery = null;
    };
  }

  /** Stops following the device pixel ratio. */
  dispose(): void {
    this.unwatch?.();
    this.unwatch = null;
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
    this.last = a;
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
