// The resize bands on the phone (ADR 0136 §6, stage 52): the iron band
// along Comm's lower edge and the same band along the pane strip's, each
// dragged to resize its part in whole rows.
//
// Comm itself is the cockpit's Comm pane (`setPhoneComm` places it full
// width under the fight card, leaving its last row to this band); the
// strip's pane likewise (`setPhoneStrip`). A band is one row high; its grip
// reaches above and below it for a thumb-size target. The strip's band
// also carries the page dots, at its right end (strip.ts puts them there).
//
// A drag is live (stage 52): each time the finger reaches another whole
// row, inside the range the allocator allows, `onLive` is called and the
// caller lays out (the cockpit does so at most once per frame); the band
// is then placed again like everything else. Between two rows nothing
// happens. `onDrag` brackets the drag, so the caller can hold the window
// size for MUME back until the release; `onRows` gives the height to store,
// once, on the release; after `onDrag(false)` the caller lays out from the
// stored heights again (so a cancelled drag goes back to where it began).

export interface ResizeBandDeps {
  /** The band's class and its grip's (phone.css), and the grip's name. */
  className: string;
  gripClass: string;
  label: string;
  /** A drag began (true) or ended (false). */
  onDrag(on: boolean): void;
  /** The finger reached another row: lay out at this height now. Not stored. */
  onLive(rows: number): void;
  /** The height in rows a release settled on, when it is not the one the drag began at. */
  onRows(rows: number): void;
}

/** Where the band lies and how far it may go (the allocator's answer), in px and rows. */
export interface BandPlace {
  /** The band's row, px from the layer's top. */
  bandTop: number;
  /** A row's height, px. */
  rowH: number;
  /** The part's rows now, and the rows a resize may give it. */
  rows: number;
  min: number;
  max: number;
}

/**
 * The height in rows for a finger `dy` px from where it pressed the band
 * of a part `rows` high, in `min`…`max` (pure).
 */
export function dragRows(rows: number, dy: number, rowH: number, min: number, max: number): number {
  if (!(rowH > 0) || !Number.isFinite(dy)) return rows;
  return Math.max(min, Math.min(max, rows + Math.round(dy / rowH)));
}

export class ResizeBand {
  readonly el: HTMLDivElement;
  private at: BandPlace | null = null;
  private placeKey = '';
  /** The drag: where it was pressed, the rows it began at, and the rows last asked for. */
  private drag: { id: number; y: number; from: number; rows: number } | null = null;

  constructor(doc: Document, deps: ResizeBandDeps) {
    this.el = doc.createElement('div');
    this.el.className = deps.className;
    this.el.hidden = true;
    const bar = doc.createElement('i');
    const g = doc.createElement('button');
    g.type = 'button';
    g.className = deps.gripClass;
    g.tabIndex = -1;
    g.setAttribute('aria-label', deps.label);
    this.el.append(bar, g);
    g.addEventListener('mousedown', (e) => e.preventDefault());
    g.addEventListener('contextmenu', (e) => e.preventDefault());
    g.addEventListener('pointerdown', (e) => {
      if (!this.at || this.drag || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      this.drag = { id: e.pointerId, y: e.clientY, from: this.at.rows, rows: this.at.rows };
      this.el.toggleAttribute('data-dragging', true);
      deps.onDrag(true);
      try {
        g.setPointerCapture(e.pointerId);
      } catch {
        /* a synthetic event has no active pointer */
      }
    });
    g.addEventListener('pointermove', (e) => {
      const d = this.drag;
      const a = this.at;
      if (!d || !a || e.pointerId !== d.id) return;
      // From the rows the drag began at (the band has moved since); the range is the layout's now.
      const rows = dragRows(d.from, e.clientY - d.y, a.rowH, a.min, a.max);
      if (rows === d.rows) return;
      d.rows = rows;
      deps.onLive(rows);
    });
    const end = (e: PointerEvent, commit: boolean): void => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      this.drag = null;
      this.el.removeAttribute('data-dragging');
      if (commit && d.rows !== d.from) deps.onRows(d.rows);
      deps.onDrag(false);
    };
    g.addEventListener('pointerup', (e) => end(e, true));
    g.addEventListener('pointercancel', (e) => end(e, false));
  }

  /** True while the band is dragged. */
  get dragging(): boolean {
    return this.drag !== null;
  }

  /** Puts the band on its part's last row; null hides it. */
  place(at: BandPlace | null): void {
    this.at = at;
    const key = at ? `${at.bandTop},${at.rowH}` : '';
    if (key === this.placeKey) return;
    this.placeKey = key;
    if (at) {
      this.el.style.top = `${at.bandTop}px`;
      this.el.style.height = `${at.rowH}px`;
    }
    this.el.hidden = !at;
  }
}
