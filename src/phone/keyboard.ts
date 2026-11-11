// A keyboard of our own for the phone's game layout (ADR 0138), round 53a:
// a rough one for the device test, behind `?kbd=1`, for the command field
// only. The look, the Swedish layout, digits, symbols and the other fields
// come in later rounds.
//
//   [q][w][e][r][t][y][u][i][o][p]
//    [a][s][d][f][g][h][j][k][l]
//   [shift][z][x][c][v][b][n][m][back]
//   [fold][;][      space      ][.][Enter]
//
// - One block over the full width, in portrait and in landscape; never
//   split. The cockpit's allocator keeps its rows free under the command
//   row (`Cockpit.setPhoneBottom`), the layer gives the block its top edge
//   after each layout (`place`), and the four rows share the height.
// - A key never pretends to be a physical key (ADR 0138 §3): it calls the
//   command line's editing API (`PhoneCommandLine`). No keyboard event is
//   made up: macros match on a physical key's code, and the input pane
//   follows every Enter keydown.
// - A key acts on the press (pointerdown), as the compass's keys do, and
//   the press is prevented from becoming a mouse press: the focus stays in
//   the field, so its caret keeps showing. Each pointer is followed on its
//   own (two thumbs overlap). A click without a pointer (a screen reader's
//   activation) acts too.
// - Backspace repeats while it is held: a timer, stopped when the finger
//   lifts, is cancelled or leaves the key. Nothing runs per frame.
// - Shift: one tap gives one capital (no lock in this round).
// - The fold key acts on the click, not on the press: closing moves the
//   command row down under the finger, and a press that closed at once
//   could end as a tap on what then lies there (the menu key).

/** What the keys do to the command line (the input pane's public editing API, handed in by the shell). */
export interface PhoneCommandLine {
  /** Marks the line's fields so the device's keyboard stays down (`inputmode="none"`), or unmarks them. */
  setOwnKeyboard(on: boolean): void;
  /** Types `text` at the caret, over the selection if there is one. */
  insert(text: string): void;
  /** Deletes the selection, or the character before the caret. */
  deleteBack(): void;
  /** Enter in the line: sends it, with history, as the key does. */
  submit(): void;
  /** Gives the field in place the focus (the tap did, as a rule), and takes it away. */
  focus(): void;
  blur(): void;
}

/** Rows of keys, the gap between keys and rows, and the block's padding, px (phone.css has the same). */
export const OKB_ROWS = 4;
export const OKB_GAP = 4;
export const OKB_PAD = 4;
/** Backspace held: the first repeat, then every repeat, ms. */
export const OKB_REPEAT_DELAY_MS = 400;
export const OKB_REPEAT_MS = 60;

/**
 * A key's height in px. Portrait: a thumb's 44. Landscape is low: the
 * keys are wide there (a tenth of the width), so they can be lower and
 * leave the game its rows; lower still on a screen under 300 px (a phone
 * in landscape outside fullscreen).
 */
export function okbKeyPx(landscape: boolean, height: number): number {
  if (!landscape) return 44;
  return height >= 300 ? 32 : 28;
}

/** The height the block needs from the cockpit's bottom edge, px. */
export function okbHeightPx(landscape: boolean, height: number): number {
  return OKB_ROWS * okbKeyPx(landscape, height) + (OKB_ROWS - 1) * OKB_GAP + 2 * OKB_PAD;
}

type Act = 'shift' | 'back' | 'fold' | 'space' | 'enter';

interface KeySpec {
  /** A character key's character, or a special key. */
  ch?: string;
  act?: Act;
  label: string;
  /** The key's width in letter keys (default 1). */
  w?: number;
}

const letters = (s: string): KeySpec[] => [...s].map((ch) => ({ ch, label: ch }));

/** The rows of round 53a: English QWERTY. */
export const OKB_KEYS: readonly (readonly KeySpec[])[] = [
  letters('qwertyuiop'),
  letters('asdfghjkl'),
  [{ act: 'shift', label: 'Shift', w: 1.5 }, ...letters('zxcvbnm'), { act: 'back', label: 'Backspace', w: 1.5 }],
  [
    { act: 'fold', label: 'Hide keyboard', w: 1.5 },
    { ch: ';', label: 'Semicolon' },
    { act: 'space', label: 'Space', w: 4.5 },
    { ch: '.', label: 'Period' },
    { act: 'enter', label: 'Enter', w: 2 },
  ],
];

const SVG_NS = 'http://www.w3.org/2000/svg';
/** The special keys' icons, 24 × 24, stroked (no font is trusted to have the glyphs). */
const ICONS: Partial<Record<Act, string[]>> = {
  shift: ['M12 4l7 8h-4v7H9v-7H5z'],
  back: ['M9 6h11v12H9l-5-6z', 'M12.5 9.5l4 5M16.5 9.5l-4 5'],
  fold: ['M6 9l6 6 6-6'],
  enter: ['M19 6v7H7', 'M10 9l-4 4 4 4'],
};

export interface OwnKeyboardDeps {
  line: Pick<PhoneCommandLine, 'insert' | 'deleteBack' | 'submit'>;
  /** The fold key: the layer closes the keyboard and blurs the field. */
  fold(): void;
}

interface Down {
  key: HTMLElement;
  /** The repeat's timers (backspace), or null. */
  delay: ReturnType<typeof setTimeout> | null;
  repeat: ReturnType<typeof setInterval> | null;
}

export class OwnKeyboard {
  readonly el: HTMLDivElement;
  private readonly deps: OwnKeyboardDeps;
  private readonly shiftKey: HTMLElement;
  private shift = false;
  /** The keys held now, by pointer. */
  private readonly downs = new Map<number, Down>();
  private top = NaN;

  constructor(doc: Document, deps: OwnKeyboardDeps) {
    this.deps = deps;
    this.el = doc.createElement('div');
    this.el.className = 'wc-ph-okb';
    this.el.setAttribute('role', 'group');
    this.el.setAttribute('aria-label', 'Keyboard');
    this.el.hidden = true;
    let shiftKey: HTMLElement | null = null;
    for (const row of OKB_KEYS) {
      const r = doc.createElement('div');
      r.className = 'wc-ph-okb-row';
      // The row of nine stands half a key in from both edges.
      const units = row.reduce((n, k) => n + (k.w ?? 1), 0);
      if (units < 10) r.style.padding = `0 ${((10 - units) / 2) * 10}%`;
      for (const k of row) {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = k.act ? `wc-ph-okb-k is-${k.act}` : 'wc-ph-okb-k';
        if (k.ch !== undefined) b.dataset.ch = k.ch;
        if (k.act) b.dataset.act = k.act;
        b.setAttribute('aria-label', k.label);
        // Not in the Tab order (ADR 0108): Tab belongs to the command line.
        b.tabIndex = -1;
        b.style.flexGrow = String(k.w ?? 1);
        const icon = k.act ? ICONS[k.act] : undefined;
        if (icon) b.append(svg(doc, icon));
        else if (k.ch !== undefined) b.textContent = k.ch;
        if (k.act === 'shift') {
          b.setAttribute('aria-pressed', 'false');
          shiftKey = b;
        }
        r.append(b);
      }
      this.el.append(r);
    }
    this.shiftKey = shiftKey!;

    const keyOf = (e: Event): HTMLElement | null => (e.target as Element | null)?.closest<HTMLElement>('.wc-ph-okb-k') ?? null;
    this.el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // No mouse press follows, on a key or between two: the focus stays in the field.
      e.preventDefault();
      const key = keyOf(e);
      if (!key) return;
      this.release(e.pointerId);
      const d: Down = { key, delay: null, repeat: null };
      this.downs.set(e.pointerId, d);
      key.classList.add('is-down');
      if (key.dataset.act === 'fold') return;
      this.press(key);
      if (key.dataset.act === 'back') {
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
      const key = keyOf(e);
      if (!key) return;
      // The fold key acts here (see the header); the others acted on the press, and
      // `detail` 0 is an activation without a pointer.
      if (key.dataset.act === 'fold') this.deps.fold();
      else if (e.detail === 0) this.press(key);
    });
    // A long press on a key is not a text selection or a context menu.
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** True while the next letter is a capital. */
  get shifted(): boolean {
    return this.shift;
  }

  /**
   * Shows the block from `top` px (the command row's bottom edge, from the
   * layer's top) down to the bottom edge, or hides it (null). Hidden, no
   * key is held and shift is off.
   */
  place(top: number | null): void {
    if (top === null) {
      if (this.el.hidden) return;
      this.el.hidden = true;
      this.top = NaN;
      this.releaseAll();
      this.setShift(false);
      return;
    }
    if (top !== this.top) {
      this.top = top;
      this.el.style.top = `${top}px`;
    }
    if (this.el.hidden) this.el.hidden = false;
  }

  dispose(): void {
    this.releaseAll();
    this.el.remove();
  }

  /** What a key does. */
  private press(key: HTMLElement): void {
    const { line } = this.deps;
    const ch = key.dataset.ch;
    if (ch !== undefined) {
      line.insert(this.shift ? ch.toUpperCase() : ch);
      this.setShift(false);
      return;
    }
    switch (key.dataset.act as Act) {
      case 'shift':
        this.setShift(!this.shift);
        break;
      case 'back':
        line.deleteBack();
        break;
      case 'space':
        line.insert(' ');
        break;
      case 'enter':
        line.submit();
        break;
      case 'fold':
        this.deps.fold();
        break;
    }
  }

  private setShift(on: boolean): void {
    if (on === this.shift) return;
    this.shift = on;
    this.el.classList.toggle('is-shift', on);
    this.shiftKey.setAttribute('aria-pressed', String(on));
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
