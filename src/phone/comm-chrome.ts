// Comm's chrome on the phone (ADR 0136 §6): the iron band along its lower
// edge, dragged to resize Comm in whole rows.
//
// Comm itself is the cockpit's Comm pane (`setPhoneComm` places it full
// width under the fight card, leaving its last row to this band). The band
// is one row high; its grip reaches below it for a thumb-size target.
//
// A drag moves only the band (a transform) to the row under the finger,
// inside the range the allocator allows. Nothing is laid out and nothing
// is sent to MUME while the finger moves: the new height is stored on the
// release, and the cockpit then lays out once (one window size for MUME).

export interface CommBandDeps {
  /** The height in rows a release settled on. */
  onRows(rows: number): void;
}

/** Where the band lies and how far it may go (the allocator's answer), in px and rows. */
export interface CommBandPlace {
  /** Comm's top edge and the band's row, px from the layer's top. */
  commTop: number;
  bandTop: number;
  /** A row's height, px. */
  rowH: number;
  /** Comm's rows now, and the rows a resize may give it. */
  rows: number;
  min: number;
  max: number;
}

/**
 * The height in rows for a finger `dy` px from where it pressed the band
 * of a Comm `rows` high, in `min`…`max` (pure).
 */
export function dragRows(rows: number, dy: number, rowH: number, min: number, max: number): number {
  if (!(rowH > 0) || !Number.isFinite(dy)) return rows;
  return Math.max(min, Math.min(max, rows + Math.round(dy / rowH)));
}

export class CommBand {
  readonly el: HTMLDivElement;
  private readonly grip: HTMLButtonElement;
  private at: CommBandPlace | null = null;
  private placeKey = '';
  private drag: { id: number; y: number; rows: number } | null = null;

  constructor(doc: Document, deps: CommBandDeps) {
    this.el = doc.createElement('div');
    this.el.className = 'wc-ph-comm-band';
    this.el.hidden = true;
    const bar = doc.createElement('i');
    const g = (this.grip = doc.createElement('button'));
    g.type = 'button';
    g.className = 'wc-ph-comm-grip';
    g.tabIndex = -1;
    g.setAttribute('aria-label', 'Drag to resize Comm');
    this.el.append(bar, g);
    g.addEventListener('mousedown', (e) => e.preventDefault());
    g.addEventListener('contextmenu', (e) => e.preventDefault());
    g.addEventListener('pointerdown', (e) => {
      if (!this.at || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      this.drag = { id: e.pointerId, y: e.clientY, rows: this.at.rows };
      this.el.toggleAttribute('data-dragging', true);
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
      const rows = dragRows(a.rows, e.clientY - d.y, a.rowH, a.min, a.max);
      if (rows === d.rows) return;
      d.rows = rows;
      // The band alone follows; Comm keeps its size until the release.
      this.el.style.transform = `translateY(${(rows - a.rows) * a.rowH}px)`;
    });
    const end = (e: PointerEvent, commit: boolean): void => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      this.drag = null;
      this.el.removeAttribute('data-dragging');
      this.el.style.transform = '';
      if (commit && this.at && d.rows !== this.at.rows) deps.onRows(d.rows);
    };
    g.addEventListener('pointerup', (e) => end(e, true));
    g.addEventListener('pointercancel', (e) => end(e, false));
  }

  /** Puts the band on Comm's last row; null hides it. */
  place(at: CommBandPlace | null): void {
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
