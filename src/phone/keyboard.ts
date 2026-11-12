// A keyboard of our own for the phone's game layout (ADR 0138): the view.
// The layout's keyboard unless the address says `?kbd=0`. What the keys are, how shift works and every size
// are the model's (keyboard-model.ts); this file draws them and takes the
// presses.
//
// - A solid band over the full width from under the command row to the
//   bottom edge (the cockpit's allocator keeps its rows free:
//   `Cockpit.setPhoneBottom`), and in it one block of keys, never split.
//   Portrait: the block over the full width (a letter key at most 48 px
//   wide, so a tablet gets no huge keys). Landscape: the block compressed
//   towards the middle, with the hot keys and the compass beside it in the
//   band (the layer places those; `okbBand`).
// - A key never pretends to be a physical key (ADR 0138 §3): it calls the
//   target's editing interface (`OkbTarget`: the command line, or another
//   field of the game layout, keyboard-fields.ts). No
//   keyboard event is made up: macros match on a physical key's code, and
//   the input pane follows every Enter keydown.
// - A key acts on the press (pointerdown), as the compass's keys do, and
//   the press is prevented from becoming a mouse press: the focus stays in
//   the field, so its caret keeps showing. A press with the field blurred
//   (after a tap on the game text) gives it the focus back first. Each
//   pointer is followed on its own (two thumbs overlap). A click without a
//   pointer (a screen reader's activation) acts too.
// - The keys that change what is under the finger act on the click, not on
//   the press: the fold key and the digit row's toggle (the rows move), and
//   the two page keys (the keys are drawn anew). A press that acted at once
//   could end as a tap on what then lies there.
// - Backspace repeats while it is held: a timer, stopped when the finger
//   lifts, is cancelled or leaves the key, and when the page is hidden or
//   the window loses the focus. Nothing runs per frame.
// - A key's element is its whole cell (the touch target has no gaps); the
//   cap drawn in it stands 2 px in from the cell's edges (phone.css). The
//   block has no dead zone: a row that stands in from the edges (English
//   `a` to `l`) gives that room to its first and last key, and a press on
//   the block's rim or on an empty place goes to the nearest key of that
//   row (`nearest`).
// - On a page (ADR 0139, round 53g) the keyboard also has Esc, Tab and the
//   caret keys: a row at the top of the block, or a column at each side of
//   it (`setNav`, `place`'s `sides`). The caret keys move the field's caret
//   through the target and repeat while held, as backspace does; Esc and
//   Tab are the target's `pageKey` (a marked key event, sent by the page's
//   mount) and act on the click, since they may take the keyboard away.
//   Enter in a multi-line field is a line break: its key is drawn as one
//   (`data-enter="newline"`, not lit) and acts on the press.
// - `onPress` (the layer's vibration) is told of a pointer's press on a
//   key, never of a repeat.

import {
  type OkbAct,
  type OkbKey,
  type OkbLayout,
  type OkbNav,
  type OkbPage,
  type OkbShiftState,
  type OkbTarget,
  OKB_REPEAT_DELAY_MS,
  OKB_REPEAT_MS,
  OKB_SHIFT_OFF,
  okbArrowsOnDigitRow,
  okbChar,
  okbNavSides,
  okbRows,
  okbSymbolPages,
  shiftTap,
  shiftUsed,
} from './keyboard-model';

export type { OkbTarget } from './keyboard-model';

/** The command line as the keys' target, and the mark that keeps the device's keyboard down (handed in by the shell). */
export interface PhoneCommandLine extends OkbTarget {
  /** Marks the line's fields so the device's keyboard stays down (`inputmode="none"`), or unmarks them. */
  setOwnKeyboard(on: boolean): void;
  /** The line has a history now (not at a password prompt: the arrows are then dimmed). */
  hasHistory(): boolean;
  /** Calls `fn` when that changes (the password prompt came or went); returns the unsubscriber. */
  onChange(fn: () => void): () => void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** The special keys' icons, 24 × 24, stroked (no font is trusted to have the glyphs). */
const ICONS: Partial<Record<OkbAct | 'lock', string[]>> = {
  shift: ['M12 4l7 8h-4v6H9v-6H5z'],
  // Locked: the same arrow on a bar.
  lock: ['M12 3l7 8h-4v5H9v-5H5z', 'M8 20h8'],
  back: ['M9 6h11v12H9l-5-6z', 'M12.5 9.5l4 5M16.5 9.5l-4 5'],
  // A keyboard going down: its outline, and a chevron under it.
  fold: ['M4 5h16v9H4z', 'M9 18l3 3 3-3'],
  enter: ['M19 6v7H7', 'M10 9l-4 4 4 4'],
  older: ['M12 19V6', 'M6 11l6-6 6 6'],
  newer: ['M12 5v13', 'M6 13l6 6 6-6'],
  space: ['M6 10v4h12v-4'],
  left: ['M19 12H6', 'M11 6l-6 6 6 6'],
  right: ['M5 12h13', 'M13 6l6 6-6 6'],
  up: ['M12 19V6', 'M6 11l6-6 6 6'],
  down: ['M12 5v13', 'M6 13l6 6 6-6'],
};
/** The keys that act on the click (see the file header). */
const ON_CLICK: ReadonlySet<string> = new Set(['fold', 'digits', 'sym', 'alt', 'esc', 'tab']);
/** The keys that repeat while held. */
const REPEATS: ReadonlySet<string> = new Set(['back', 'left', 'right', 'up', 'down']);
/** The caret keys and the target's method each one calls. */
const CARETS = { left: 'caretLeft', right: 'caretRight', up: 'caretUp', down: 'caretDown' } as const;
const isCaret = (a: string | undefined): a is keyof typeof CARETS => a !== undefined && a in CARETS;

export interface OwnKeyboardDeps {
  /** What the keys type into now, or null (no key does anything). */
  target(): OkbTarget | null;
  /** The fold key: the layer closes the keyboard and blurs the field. */
  fold(): void;
  /** The digit row's toggle: the layer stores it and tells the keyboard and the cockpit (`setDigits`). */
  toggleDigits(): void;
  /** A pointer went down on a key (the layer: a short vibration, when that is on). */
  onPress?(): void;
  /**
   * Enter acts on the click, not on the press (a page's keyboard, ADR 0139:
   * Enter may close the dialog and the keyboard under the finger, whose
   * release must not end as a tap on what then lies there).
   */
  enterOnClick?: boolean;
  /** False: the target never has a history, and its arrows are left out (a page's keyboard). Default true. */
  history?: boolean;
  /** The clock for shift's double tap, ms (tests). Default `performance.now()`. */
  now?(): number;
}

interface Down {
  key: HTMLElement;
  /** The repeat's timers (backspace), or null. */
  delay: ReturnType<typeof setTimeout> | null;
  repeat: ReturnType<typeof setInterval> | null;
}

export class OwnKeyboard {
  /** The band: the keyboard's solid ground over the full width. */
  readonly el: HTMLDivElement;
  /** The block of keys in it. */
  readonly blockEl: HTMLDivElement;
  private readonly doc: Document;
  private readonly deps: OwnKeyboardDeps;
  private layout: OkbLayout;
  private page: OkbPage = 'letters';
  private symbolPage = 0;
  private digits = false;
  private arrowsOnDigitRow = false;
  private nav: OkbNav = 'none';
  /** The columns of page keys beside the block (`nav` is `sides`), made when first needed. */
  private sideEls: [HTMLDivElement, HTMLDivElement] | null = null;
  private sidesAt = '';
  private shift: OkbShiftState = OKB_SHIFT_OFF;
  /** What the rows on screen were drawn from, and what their marks (shift, the toggle, the arrows) were set from. */
  private drawn = '';
  private marked = '';
  /** The keys on screen, by element. */
  private readonly specs = new Map<HTMLElement, OkbKey>();
  /** The keys held now, by pointer. */
  private readonly downs = new Map<number, Down>();
  private top = NaN;
  private left = NaN;
  private width = NaN;
  private readonly unsubs: Array<() => void> = [];

  constructor(doc: Document, deps: OwnKeyboardDeps, layout: OkbLayout, digits: boolean) {
    this.doc = doc;
    this.deps = deps;
    this.layout = layout;
    this.digits = digits;
    this.el = doc.createElement('div');
    this.el.className = 'wc-ph-okb';
    this.el.hidden = true;
    this.blockEl = doc.createElement('div');
    this.blockEl.className = 'wc-ph-okb-block';
    this.blockEl.setAttribute('role', 'group');
    this.blockEl.setAttribute('aria-label', 'Keyboard');
    this.el.append(this.blockEl);
    this.el.dataset.layout = layout;

    const keyOf = (e: Event): HTMLElement | null => (e.target as Element | null)?.closest<HTMLElement>('.wc-ph-okb-k') ?? null;
    this.el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // No mouse press follows, on a key or between two: the focus stays in the field.
      e.preventDefault();
      const key = keyOf(e) ?? this.nearest(e);
      if (!key) return;
      this.deps.onPress?.();
      this.release(e.pointerId);
      const d: Down = { key, delay: null, repeat: null };
      this.downs.set(e.pointerId, d);
      key.classList.add('is-down');
      const a = key.dataset.act;
      if (this.onClick(a)) return;
      this.press(key);
      if (a !== undefined && REPEATS.has(a)) {
        d.delay = setTimeout(() => {
          d.delay = null;
          d.repeat = setInterval(() => this.press(key), OKB_REPEAT_MS);
        }, OKB_REPEAT_DELAY_MS);
      }
    });
    const up = (e: PointerEvent): void => this.release(e.pointerId);
    this.el.addEventListener('pointerup', up);
    this.el.addEventListener('pointercancel', up);
    // The finger slid off its key (a touch pointer stays with the key it went down on, so this is the mouse's).
    this.el.addEventListener('pointerout', (e) => {
      const d = this.downs.get(e.pointerId);
      if (d && keyOf(e) === d.key && !d.key.contains(e.relatedTarget as Node | null)) this.release(e.pointerId);
    });
    this.el.addEventListener('lostpointercapture', up);
    // Browsers that still send the mouse press: it must not move the focus either.
    this.el.addEventListener('mousedown', (e) => e.preventDefault());
    this.el.addEventListener('click', (e) => {
      e.stopPropagation();
      // (A pointer's click on the rim or an empty place: the key its press went to.)
      const key = keyOf(e) ?? (e.detail === 0 ? null : this.nearest(e));
      if (!key) return;
      // The keys of `ON_CLICK` act here; the others acted on the press, and `detail` 0 is an
      // activation without a pointer.
      const a = key.dataset.act;
      if (this.onClick(a) || e.detail === 0) this.press(key);
    });
    // A long press on a key is not a text selection or a context menu.
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    // The page went to the background, or the window lost the focus, with a key held: the
    // release may never come, and a held backspace must not go on deleting.
    const drop = (): void => this.releaseAll();
    const win = doc.defaultView;
    doc.addEventListener('visibilitychange', drop);
    win?.addEventListener('blur', drop);
    win?.addEventListener('pagehide', drop);
    this.unsubs.push(() => {
      doc.removeEventListener('visibilitychange', drop);
      win?.removeEventListener('blur', drop);
      win?.removeEventListener('pagehide', drop);
    });
  }

  /** Whether the key of this act acts on the click (`ON_CLICK`; Enter where the owner asks). */
  private onClick(act: string | undefined): boolean {
    if (act === undefined) return false;
    if (ON_CLICK.has(act)) return true;
    // (A line break changes nothing under the finger: it acts on the press, in step with the letters.)
    return act === 'enter' && this.deps.enterOnClick === true && this.deps.target()?.newline === undefined;
  }

  /** Where a page's extra keys stand (the game layout: `none`, the default). */
  setNav(nav: OkbNav): void {
    if (nav === this.nav) return;
    this.nav = nav;
    if (!this.el.hidden) this.draw();
  }

  /** Shift now: off, once (the next letter is a capital) or locked. */
  get shiftMode(): OkbShiftState['mode'] {
    return this.shift.mode;
  }

  /** A pointer is down on a key now (its release, and the click that follows, are still to come). */
  get held(): boolean {
    return this.downs.size > 0;
  }

  /** The digit row is shown or folded away (the caller's stored state). */
  setDigits(on: boolean): void {
    if (on === this.digits) return;
    this.digits = on;
    this.symbolPage = 0;
    if (!this.el.hidden) this.draw();
  }

  /** The target changed (another field; a password prompt): the arrows are dimmed for one without a history. */
  sync(): void {
    if (!this.el.hidden) this.mark();
  }

  /**
   * The key a press that hit none goes to: inside the block (its rim, an
   * empty place of the symbols' page), the nearest key of the row at that
   * height. Outside the block (the band beside it in landscape): none.
   */
  private nearest(e: MouseEvent): HTMLElement | null {
    const t = e.target as Node | null;
    if (!t || !this.blockEl.contains(t)) return null;
    let row: Element | null = null;
    let rowD = Infinity;
    for (const r of this.blockEl.children) {
      const b = r.getBoundingClientRect();
      const d = e.clientY < b.top ? b.top - e.clientY : e.clientY > b.bottom ? e.clientY - b.bottom : 0;
      if (d < rowD) {
        rowD = d;
        row = r;
      }
    }
    let key: HTMLElement | null = null;
    let keyD = Infinity;
    for (const k of row?.children ?? []) {
      if (!this.specs.has(k as HTMLElement)) continue;
      const b = k.getBoundingClientRect();
      const d = e.clientX < b.left ? b.left - e.clientX : e.clientX > b.right ? e.clientX - b.right : 0;
      if (d < keyD) {
        keyD = d;
        key = k as HTMLElement;
      }
    }
    return key;
  }

  /** Another layout (the setting). */
  setLayout(layout: OkbLayout): void {
    if (layout === this.layout) return;
    this.layout = layout;
    this.el.dataset.layout = layout;
    this.symbolPage = 0;
    if (!this.el.hidden) this.draw();
  }

  /**
   * Shows the band from `top` px (the command row's bottom edge, from the
   * layer's top) down to the bottom edge, with the block `width` px wide
   * from `left`; or hides it (null). Hidden, no key is held, shift is off
   * and the page is the letters'.
   */
  place(at: { top: number; left: number; width: number; sides?: { left: number; right: number; width: number } | undefined } | null): void {
    if (at === null) {
      if (this.el.hidden) return;
      this.el.hidden = true;
      this.top = this.left = this.width = NaN;
      this.releaseAll();
      this.shift = OKB_SHIFT_OFF;
      this.page = 'letters';
      this.symbolPage = 0;
      return;
    }
    if (at.top !== this.top) {
      this.top = at.top;
      this.el.style.top = `${at.top}px`;
    }
    if (at.left !== this.left || at.width !== this.width) {
      this.left = at.left;
      this.width = at.width;
      this.blockEl.style.left = `${at.left}px`;
      this.blockEl.style.width = `${at.width}px`;
      this.arrowsOnDigitRow = okbArrowsOnDigitRow(at.width);
    }
    this.draw();
    const sd = this.nav === 'sides' ? at.sides : undefined;
    const sig = sd ? `${sd.left}|${sd.right}|${sd.width}` : '';
    if (this.sideEls && sig !== this.sidesAt) {
      this.sidesAt = sig;
      const [l, r] = this.sideEls;
      l.hidden = r.hidden = !sd;
      if (sd) {
        l.style.left = `${sd.left}px`;
        r.style.left = `${sd.right}px`;
        l.style.width = r.style.width = `${sd.width}px`;
      }
    }
    if (this.el.hidden) this.el.hidden = false;
  }

  dispose(): void {
    this.releaseAll();
    for (const u of this.unsubs.splice(0)) u();
    this.el.remove();
  }

  /** Draws the rows when what they are made from changed, and marks shift and the toggles. */
  private draw(): void {
    const sig = `${this.layout}|${this.page}|${this.symbolPage}|${this.digits}|${this.arrowsOnDigitRow}|${this.nav}`;
    if (sig !== this.drawn) {
      this.drawn = sig;
      // The keys are made anew: none of the old ones is held any more.
      this.releaseAll();
      this.specs.clear();
      const rows = okbRows({
        layout: this.layout,
        page: this.page,
        symbolPage: this.symbolPage,
        digits: this.digits,
        arrowsOnDigitRow: this.arrowsOnDigitRow,
        history: this.deps.history !== false,
        nav: this.nav,
      });
      this.el.dataset.nav = this.nav;
      if (this.nav === 'sides') {
        if (!this.sideEls) {
          const mk = (side: string): HTMLDivElement => {
            const c = this.doc.createElement('div');
            c.className = `wc-ph-okb-side is-${side}`;
            c.hidden = true;
            return c;
          };
          this.sideEls = [mk('left'), mk('right')];
          this.sidesAt = '';
          this.el.append(...this.sideEls);
        }
        const { left, right } = okbNavSides();
        this.sideEls[0].replaceChildren(...left.map((k) => this.key(k)));
        this.sideEls[1].replaceChildren(...right.map((k) => this.key(k)));
      } else if (this.sideEls) {
        for (const c of this.sideEls) c.remove();
        this.sideEls = null;
      }
      this.blockEl.replaceChildren(
        ...rows.map((row) => {
          const r = this.doc.createElement('div');
          r.className = `wc-ph-okb-row is-${row.kind}`;
          const els = row.keys.map((k) => this.key(k));
          // A row with fewer keys than its units stands in from both edges: its caps do, and the
          // room outside them belongs to the first and the last key (no dead zone at the edges).
          const used = row.keys.reduce((n, k) => n + k.w, 0);
          if (used < row.units && els.length > 0) {
            const side = `calc(2px + ${((row.units - used) / 2 / row.units) * 100}%)`;
            els[0]!.style.paddingLeft = side;
            els[els.length - 1]!.style.paddingRight = side;
          }
          r.append(...els);
          return r;
        }),
      );
      this.el.dataset.page = this.page;
    }
    this.mark();
  }

  private key(k: OkbKey): HTMLElement {
    const doc = this.doc;
    if (k.ch === undefined && k.act === undefined) {
      // A place kept empty (no further page of symbols; a short last page).
      const gap = doc.createElement('span');
      gap.className = 'wc-ph-okb-gap';
      gap.style.flexGrow = String(k.w);
      return gap;
    }
    const b = doc.createElement('button');
    b.type = 'button';
    // (A caret key is `is-caret`: `is-down` is the pressed state.)
    b.className = k.act ? `wc-ph-okb-k ${isCaret(k.act) ? 'is-caret' : `is-${k.act}`}` : 'wc-ph-okb-k';
    if (k.ch !== undefined) b.dataset.ch = k.ch;
    if (k.act) b.dataset.act = k.act;
    if (k.letter) b.dataset.letter = '';
    b.setAttribute('aria-label', k.label);
    // Not in the Tab order (ADR 0108): Tab belongs to the command line.
    b.tabIndex = -1;
    b.style.flexGrow = String(k.w);
    const cap = doc.createElement('span');
    cap.className = 'wc-ph-okb-cap';
    const icon = k.act ? ICONS[k.act] : undefined;
    if (icon) cap.append(svg(doc, icon));
    else if (k.ch !== undefined) cap.textContent = k.ch;
    else if (k.act === 'sym') cap.textContent = this.page === 'letters' ? '!#?' : 'abc';
    else if (k.act === 'alt') cap.textContent = `${this.symbolPage + 1}/${okbSymbolPages(this.layout, this.digits)}`;
    else if (k.act === 'digits') cap.textContent = '123';
    else if (k.act === 'esc') cap.textContent = 'esc';
    else if (k.act === 'tab') cap.textContent = 'tab';
    b.append(cap);
    this.specs.set(b, k);
    return b;
  }

  /** Shift's three states, the digit row's toggle, Enter's face, and the keys the target has nothing for (dimmed). */
  private mark(): void {
    const mode = this.shift.mode;
    const t = this.deps.target();
    // (Asked at every layout: nothing is written for the same state.)
    const has = (m: keyof OkbTarget): string => (t?.[m] === undefined ? '0' : '1');
    const sig = `${this.drawn}|${mode}|${t === null}|${has('historyUp')}${has('historyDown')}${has('newline')}${has('caretLeft')}${has('caretRight')}${has('caretUp')}${has('caretDown')}${has('pageKey')}`;
    if (sig === this.marked) return;
    this.marked = sig;
    this.el.dataset.shift = mode;
    for (const [b, k] of this.specs) {
      if (k.act === 'shift') {
        b.setAttribute('aria-pressed', mode === 'off' ? 'false' : 'true');
        b.setAttribute('aria-label', mode === 'lock' ? 'Shift, locked' : 'Shift');
        const want = mode === 'lock' ? 'lock' : 'shift';
        if (b.dataset.icon !== want) {
          b.dataset.icon = want;
          b.firstElementChild?.replaceChildren(svg(this.doc, ICONS[want]!));
        }
      } else if (k.act === 'digits') {
        b.setAttribute('aria-pressed', this.digits ? 'true' : 'false');
      } else if (k.act === 'older' || k.act === 'newer') {
        const none = t !== null && (k.act === 'older' ? t.historyUp : t.historyDown) === undefined;
        if (none) b.setAttribute('aria-disabled', 'true');
        else b.removeAttribute('aria-disabled');
      } else if (isCaret(k.act) || k.act === 'esc' || k.act === 'tab') {
        const none = t !== null && t[isCaret(k.act) ? CARETS[k.act] : 'pageKey'] === undefined;
        if (none) b.setAttribute('aria-disabled', 'true');
        else b.removeAttribute('aria-disabled');
      } else if (k.act === 'enter') {
        // A multi-line field: the key is a line break, and looks like one (not lit).
        const nl = t?.newline !== undefined;
        b.dataset.enter = nl ? 'newline' : 'submit';
        b.setAttribute('aria-label', nl ? 'New line' : 'Enter');
      }
    }
  }

  /** What a key does. */
  private press(key: HTMLElement): void {
    const k = this.specs.get(key);
    if (!k) return;
    switch (k.act) {
      case 'shift':
        this.shift = shiftTap(this.shift, this.deps.now?.() ?? this.doc.defaultView?.performance.now() ?? Date.now());
        this.mark();
        return;
      case 'fold':
        this.deps.fold();
        return;
      case 'digits':
        this.deps.toggleDigits();
        return;
      case 'sym':
        this.page = this.page === 'letters' ? 'symbols' : 'letters';
        this.symbolPage = 0;
        this.draw();
        return;
      case 'alt':
        this.symbolPage = (this.symbolPage + 1) % okbSymbolPages(this.layout, this.digits);
        this.draw();
        return;
      default:
    }
    const t = this.deps.target();
    if (!t) return;
    // The field lost the focus (a tap on the game text): the key gives it back, so the caret shows.
    t.focus();
    switch (k.act) {
      case 'back':
        // (Shift stays: a correction is not the letter it waits for.)
        t.deleteBack();
        return;
      case 'older':
        t.historyUp?.();
        return;
      case 'newer':
        t.historyDown?.();
        return;
      case 'left':
      case 'right':
      case 'up':
      case 'down':
        // (Shift stays, as for backspace.)
        t[CARETS[k.act]]?.();
        return;
      case 'esc':
        t.pageKey?.('Escape', false);
        return;
      case 'tab':
        // Shift and Tab: back the other way.
        t.pageKey?.('Tab', this.shift.mode !== 'off');
        break;
      case 'enter':
        if (t.newline) t.newline();
        else t.submit();
        break;
      case 'space':
        t.insert(' ');
        break;
      default:
        t.insert(okbChar(k, this.shift));
    }
    const next = shiftUsed(this.shift);
    if (next !== this.shift) {
      this.shift = next;
      this.mark();
    }
  }

  /** The pointer let go of its key: the key is up and its repeat stops. */
  private release(pointerId: number): void {
    const d = this.downs.get(pointerId);
    if (!d) return;
    this.downs.delete(pointerId);
    if (d.delay !== null) clearTimeout(d.delay);
    if (d.repeat !== null) clearInterval(d.repeat);
    // Another finger may hold the same key.
    for (const o of this.downs.values()) if (o.key === d.key) return;
    d.key.classList.remove('is-down');
  }

  private releaseAll(): void {
    for (const id of [...this.downs.keys()]) this.release(id);
  }
}

function svg(doc: Document, paths: string[]): SVGSVGElement {
  const s = doc.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'wc-ph-ico');
  s.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const p = doc.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    s.append(p);
  }
  return s;
}
