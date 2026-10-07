// Map pane loading overlay (stage 24, ADR 0083 "Map pane"): a centred box
// over the map's grey with a label and a TUI glyph bar, fed by the
// worker's `progress` messages (src/map/progress.ts folds them into one
// weighted fraction and a label):
//
//      Loading map  2.1 / 5.8 MB
//   ███████████░░░░░░░░░░░░░░░░░
//
// - The bar is drawn like the start page loader (index.html, ADR 0083):
//   the fill is one solid box `n ch` wide (no seams between `█` glyphs at
//   fractional pixel ratios), the track is `░` text clipped to its width.
// - A session starts with `begin` ('load': the pane starts or the map
//   changes; 'tiles': a tileset change) and ends with `end` (the worker's
//   `drawn` / `tilesDrawn`) or `abort` (an error, nothing to load).
// - Shown only once a session has lasted SHOW_DELAY_MS, so a cached or
//   fast load never flashes it. It fades out on the end
//   (prefers-reduced-motion: hidden at once).
// - Colours are the pane's tokens (panes.css `.wc-map-loading`); the box
//   has the pane's background so it reads on the map's fixed dark grey in
//   a light theme too.

import { type LoadState, barCells, barFill, loadFraction, loadLabel, type MapProgress } from '../map/progress';

/** A session shorter than this shows nothing, ms. */
export const SHOW_DELAY_MS = 200;
/** The fade-out (panes.css `.wc-map-loading[data-leaving]`), ms. */
export const FADE_MS = 250;

export class MapLoading {
  readonly el: HTMLDivElement;
  private readonly label: HTMLDivElement;
  private readonly fill: HTMLSpanElement;
  private readonly track: HTMLSpanElement;
  private state: LoadState | null = null;
  private shown = false;
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  /** Highest fraction shown in this load session (the bar never goes back). */
  private frac = 0;
  private cols = 0;

  constructor(private readonly doc: Document) {
    const el = doc.createElement('div');
    el.className = 'wc-map-loading';
    el.hidden = true;
    const box = doc.createElement('div');
    box.className = 'wc-map-loading-box';
    this.label = doc.createElement('div');
    this.label.className = 'wc-map-loading-label';
    const bar = doc.createElement('div');
    bar.className = 'wc-map-loading-bar';
    this.fill = doc.createElement('span');
    this.fill.className = 'wc-map-loading-fill';
    this.track = doc.createElement('span');
    this.track.className = 'wc-map-loading-track';
    bar.append(this.fill, this.track);
    box.append(this.label, bar);
    el.append(box);
    this.el = el;
  }

  /** A session is running (shown or still within the delay). */
  get active(): boolean {
    return this.state !== null;
  }

  /**
   * Starts a session. A tile session during a load is part of the load; a
   * load replaces a tile session (and keeps the overlay if it is shown).
   */
  begin(kind: 'load' | 'tiles', withFetch = true): void {
    if (kind === 'tiles' && this.state?.kind === 'load') return;
    this.state = { kind, withFetch, map: null, mapDone: false, tiles: null };
    this.frac = 0;
    this.cancelHide();
    if (this.shown) this.render();
    else if (this.showTimer === null) this.showTimer = setTimeout(this.show, SHOW_DELAY_MS);
  }

  /** The map source is known: `withFetch` false for bytes or parsed data. */
  source(withFetch: boolean): void {
    if (this.state?.kind !== 'load') return;
    this.state.withFetch = withFetch;
    this.render();
  }

  progress(p: MapProgress): void {
    const s = this.state;
    if (!s) return;
    if (p.map && s.kind === 'load' && !s.mapDone) s.map = p.map;
    s.tiles = p.tiles;
    this.render();
  }

  /** The worker posted `loaded`: the map part is done, the first frame is still to come. */
  loaded(): void {
    if (this.state?.kind !== 'load') return;
    this.state.mapDone = true;
    this.render();
  }

  /** The worker drew the first complete frame of a `kind` session. */
  end(kind: 'load' | 'tiles'): void {
    if (!this.state || this.state.kind !== kind) return;
    this.state = null;
    this.finish(true);
  }

  /** Nothing more to wait for (an error, no map): hides at once. */
  abort(): void {
    this.state = null;
    this.finish(false);
  }

  /** The pane's width in cells (the bar narrows in a narrow pane). */
  resize(cols: number): void {
    if (cols === this.cols) return;
    this.cols = cols;
    this.render();
  }

  dispose(): void {
    this.state = null;
    if (this.showTimer !== null) clearTimeout(this.showTimer);
    this.showTimer = null;
    this.cancelHide();
  }

  private readonly show = (): void => {
    this.showTimer = null;
    if (!this.state) return;
    this.shown = true;
    this.el.hidden = false;
    this.render();
  };

  private finish(fade: boolean): void {
    if (this.showTimer !== null) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
    if (!this.shown) return;
    this.shown = false;
    if (fade && !this.reducedMotion()) {
      this.el.dataset.leaving = '';
      this.hideTimer = setTimeout(() => {
        this.hideTimer = null;
        this.hideNow();
      }, FADE_MS);
    } else {
      this.cancelHide();
      this.hideNow();
    }
  }

  private hideNow(): void {
    this.el.hidden = true;
    delete this.el.dataset.leaving;
  }

  /** A fade in progress is called off (a new session): the box stays. */
  private cancelHide(): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
      this.shown = true;
    }
    delete this.el.dataset.leaving;
  }

  private reducedMotion(): boolean {
    try {
      return this.doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    } catch {
      return false;
    }
  }

  private render(): void {
    const s = this.state;
    if (!this.shown || !s) return;
    const f = loadFraction(s);
    this.frac = s.kind === 'load' ? Math.max(this.frac, f) : f;
    const cells = barCells(this.cols > 0 ? this.cols : 32);
    const on = barFill(this.frac, cells);
    const label = loadLabel(s);
    if (this.label.textContent !== label) this.label.textContent = label;
    if (this.fill.dataset.cells !== String(on)) {
      this.fill.dataset.cells = String(on);
      this.fill.style.width = `${on}ch`;
    }
    const track = '░'.repeat(cells - on);
    if (this.track.textContent !== track) {
      this.track.textContent = track;
      this.track.style.width = `${cells - on}ch`;
    }
    this.el.dataset.pct = String(Math.round(this.frac * 100));
    this.el.style.setProperty('--wc-bar-cells', String(cells));
  }
}
