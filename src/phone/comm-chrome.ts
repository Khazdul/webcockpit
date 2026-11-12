// The resize bands on the phone (ADR 0136 §6, stage 52): the iron band
// along Comm's lower edge and the same band along the pane strip's, each
// dragged to resize its part in whole rows.
//
// Comm itself is the cockpit's Comm pane (`setPhoneComm` places it full
// width above the fight card, leaving its last row to this band); the
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
//
// Landscape (stage 52c): the strip and Comm are one column from the left,
// and the one band is its right edge, dragged sideways in whole columns
// (`axis: 'x'`). The same band turned: where this file says row, top and
// height, read column, left and width. The two bands above are not shown
// there.
//
// The panes' names (round 53j, ADR 0137's addendum of that round): a pane
// has no hood on a row of its own on a phone. Its name stands on its band
// instead, on a small plate cast in one piece with the band (`plates`):
// in the band's middle in portrait, hanging a few px below the band over
// what is under it; in landscape written along the band, one plate centred
// on each pane's stretch of it, with a joint in the band where the strip
// ends and Comm begins. The lit grip marks stand on both sides of a plate.
// A plate takes no press: the grip under it does, so the band is dragged
// from its plate as from anywhere else on it.

/**
 * A pane's name on its band (round 53j: a pane's header takes no row on a
 * phone). `from` and `size`, px along a sideways band: the stretch of the
 * band beside that pane, where its plate is centred; absent on a band that
 * is one pane's. `extra`: what stands at the stretch's start with it (the
 * strip's page dots, in landscape).
 */
export interface BandPlate {
  id: string;
  text: string;
  from?: number;
  size?: number;
  extra?: HTMLElement;
}

/** Sideways: the least length of a stretch, px, that holds a name and what stands with it (the strip's dots). */
const PLATE_ROOMY_PX = 120;

export interface ResizeBandDeps {
  /** The band's class and its grip's (phone.css), and the grip's name. */
  className: string;
  gripClass: string;
  label: string;
  /** `'x'`: the band stands along a right edge and is dragged sideways. Default `'y'`. */
  axis?: 'x' | 'y';
  /** A drag began (true) or ended (false). */
  onDrag(on: boolean): void;
  /** The finger reached another row: lay out at this height now. Not stored. */
  onLive(rows: number): void;
  /** The height in rows a release settled on, when it is not the one the drag began at. */
  onRows(rows: number): void;
}

/** Where the band lies and how far it may go (the allocator's answer), in px and rows. */
export interface BandPlace {
  /** The band's row, px from the layer's top (sideways: its first column, px from the left). */
  bandTop: number;
  /** A row's height, px (sideways: a column's width). */
  rowH: number;
  /** Sideways: the band's width, px (several columns at a small text size). Absent: `rowH`. */
  thick?: number;
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
  private readonly x: boolean;
  private readonly grip: HTMLButtonElement;
  /** The plates' stretches by id (made once, hidden while not listed), and what they show now. */
  private readonly runs = new Map<string, { run: HTMLSpanElement; text: HTMLSpanElement }>();
  private platesKey = '';
  /** Sideways: the joint in the band where one pane's stretch ends and the next begins (made when first needed). */
  private joint: HTMLSpanElement | null = null;
  /** The drag: where it was pressed, the rows it began at, and the rows last asked for. */
  private drag: { id: number; y: number; from: number; rows: number } | null = null;

  constructor(doc: Document, deps: ResizeBandDeps) {
    const x = deps.axis === 'x';
    this.x = x;
    const at = (e: PointerEvent): number => (x ? e.clientX : e.clientY);
    this.el = doc.createElement('div');
    this.el.className = deps.className;
    this.el.hidden = true;
    const g = doc.createElement('button');
    g.type = 'button';
    g.className = deps.gripClass;
    g.tabIndex = -1;
    g.setAttribute('aria-label', deps.label);
    this.grip = g;
    this.el.append(g);
    g.addEventListener('mousedown', (e) => e.preventDefault());
    g.addEventListener('contextmenu', (e) => e.preventDefault());
    g.addEventListener('pointerdown', (e) => {
      if (!this.at || this.drag || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      this.drag = { id: e.pointerId, y: at(e), from: this.at.rows, rows: this.at.rows };
      this.el.toggleAttribute('data-dragging', true);
      deps.onDrag(true);
      try {
        g.setPointerCapture(e.pointerId);
      } catch {
        /* a synthetic event has no active pointer */
      }
    });
    // A quick drag must not become a browser fling: nothing scrolls under the grip
    // (`touch-action: none`), but Chromium still starts one after a fast move, and then swallows
    // the next tap within a few hundred ms ("tap stops the fling"): a key tapped right after a
    // drag would do nothing (as strip.ts `holdFling`). The grip's own listener: no other touch waits for it.
    g.addEventListener(
      'touchmove',
      (e) => {
        if (this.drag && e.cancelable) e.preventDefault();
      },
      { passive: false },
    );
    g.addEventListener('pointermove', (e) => {
      const d = this.drag;
      const a = this.at;
      if (!d || !a || e.pointerId !== d.id) return;
      // From the rows the drag began at (the band has moved since); the range is the layout's now.
      const rows = dragRows(d.from, at(e) - d.y, a.rowH, a.min, a.max);
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
    // Should the release and the cancel both be lost (the capture taken away, the element
    // re-laid under the finger): the drag still ends, as a cancel. Without this the band would
    // stay dead and the window size held until a reload. After a normal release this fires too,
    // and finds no drag.
    g.addEventListener('lostpointercapture', (e) => end(e, false));
  }

  /** True while the band is dragged. */
  get dragging(): boolean {
    return this.drag !== null;
  }

  /**
   * The names on the band (see the file header), in order along it. Written
   * only when something changed; a plate not listed any more is hidden.
   */
  plates(list: readonly BandPlate[]): void {
    // (What stands with a plate may have been put elsewhere since: the dots, on a rotation.)
    for (const p of list) {
      const run = this.runs.get(p.id)?.run;
      if (p.extra && run && p.extra.parentElement !== run) run.append(p.extra);
    }
    const key = list.map((p) => `${p.id}=${p.text}@${p.from ?? ''}+${p.size ?? ''}`).join('|');
    if (key === this.platesKey) return;
    this.platesKey = key;
    const doc = this.el.ownerDocument;
    const shown = new Set<string>();
    let first = true;
    let jointed = false;
    for (const p of list) {
      shown.add(p.id);
      let r = this.runs.get(p.id);
      if (!r) {
        const run = doc.createElement('span');
        run.className = 'wc-ph-plate-run';
        run.dataset.plate = p.id;
        // The name is the grip's to tell (its label says what the band resizes); the plate is for the eye.
        run.setAttribute('aria-hidden', 'true');
        const plate = doc.createElement('span');
        plate.className = 'wc-ph-plate';
        const text = doc.createElement('span');
        text.className = 'wc-ph-plate-t';
        // A rivet each side of the name (elements of their own: the plate's ground stays one plain gradient).
        const rivet = (): HTMLElement => {
          const i = doc.createElement('i');
          i.className = 'wc-ph-plate-rv';
          return i;
        };
        plate.append(rivet(), text, rivet());
        run.append(plate);
        r = { run, text };
        this.runs.set(p.id, r);
      }
      if (r.text.textContent !== p.text) r.text.textContent = p.text;
      const st = r.run.style;
      st[this.x ? 'top' : 'left'] = p.from === undefined ? '' : `${p.from}px`;
      st[this.x ? 'height' : 'width'] = p.size === undefined ? '' : `${p.size}px`;
      // A stretch too low for more than the name: what stands with it gives way (phone.css).
      r.run.toggleAttribute('data-tight', p.size !== undefined && p.size < PLATE_ROOMY_PX);
      // A stretch that follows another begins with a joint in the band.
      if (!first && p.from !== undefined) {
        if (!this.joint) {
          this.joint = doc.createElement('span');
          this.joint.className = 'wc-ph-plate-joint';
          this.joint.setAttribute('aria-hidden', 'true');
          this.el.insertBefore(this.joint, this.grip);
        }
        this.joint.style[this.x ? 'top' : 'left'] = `${p.from}px`;
        jointed = true;
      }
      first = false;
      if (p.extra && p.extra.parentElement !== r.run) r.run.append(p.extra);
      r.run.hidden = false;
      // In the order given, under the grip (which takes the presses).
      this.el.insertBefore(r.run, this.grip);
    }
    for (const [id, r] of this.runs) if (!shown.has(id)) r.run.hidden = true;
    if (this.joint) this.joint.hidden = !jointed;
  }

  /** Puts the band on its part's last row; null hides it. */
  place(at: BandPlace | null): void {
    this.at = at;
    const size = at?.thick ?? at?.rowH;
    const key = at ? `${at.bandTop},${size}` : '';
    if (key === this.placeKey) return;
    this.placeKey = key;
    if (at) {
      this.el.style[this.x ? 'left' : 'top'] = `${at.bandTop}px`;
      this.el.style[this.x ? 'width' : 'height'] = `${size}px`;
    }
    this.el.hidden = !at;
  }
}
