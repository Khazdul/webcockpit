// The phone's hot keys (ADR 0136 §8; stage 52): up to six round,
// see-through keys above the compass, in columns of three from the right
// edge (K1 to K3 along the edge, K4 to K6 in a second column left of it,
// the lowest number lowest), the K key in the compass's free cell that
// shows and hides all of them, and the box a held key opens to change it.
// The rules are in hotkey-model.ts.
//
// - A tap sends on the RELEASE, unlike the compass (which sends on the
//   press): a press may become a hold, and a hold must not send. A press
//   that leaves the key (further than a small slop) is neither.
// - A hold (500 ms) opens the box for that key. One timer per press;
//   nothing runs per frame.
// - A press never moves the focus (no keyboard): the pointer's press is
//   prevented from becoming a mouse press, as on the compass. A click
//   without a pointer (a screen reader's activation) sends too.
// - The box is a small form left of the columns. It owns its keys
//   (`data-wc-own-keys`, the input pane's rule): what is typed in its
//   fields never reaches the command line or a macro. Esc cancels, Enter
//   in a field saves. A press outside it closes it without saving, and
//   that press still does what it would have done (the compass stays live).
// - With the on-screen keyboard up the column and the K key are hidden
//   (phone.css); an open box stays, above the command row.

import type { PhoneHotkey, PhoneHotkeySpecial } from '../settings/types';
import {
  HOTKEY_HOLD_MS,
  HOTKEY_LABEL_MAX,
  HOTKEY_COMMAND_MAX,
  HOTKEY_PICKS,
  HOTKEY_SLOP_PX,
  HOTKEY_SPECIALS,
  checkHotkey,
  cleanCommand,
  hotkeyColumns,
  hotkeyName,
  pickHotkey,
  sendsNow,
  typedLabel,
} from './hotkey-model';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** The braces of a special (the mockups' icon), 24 × 24. */
const BRACES = 'M9 4C7 4 6 5 6 7v2c0 1.5-1 3-2.5 3C5 12 6 13.5 6 15v2c0 2 1 3 3 3M15 4c2 0 3 1 3 3v2c0 1.5 1 3 2.5 3-1.5 0-2.5 1.5-2.5 3v2c0 2-1 3-3 3';
/** The input pane's mark for an element that owns its keys (src/ui/input-pane.ts `OWN_KEYS_ATTR`; not imported: kit.ts). */
const OWN_KEYS = 'data-wc-own-keys';

export interface HotkeysDeps {
  /** A tap on key `index` (0: K1). */
  press(index: number): void;
  /** The box's Save for key `index`. */
  save(index: number, key: PhoneHotkey): void;
  /** The K key with at least one key shown: show or hide the column. */
  toggle(): void;
  /** The current hit points for the box's "Sends now" line; null: unknown. */
  hp(): number | null;
  /**
   * The box opened or closed (the layer makes room: the lens). `by`: the
   * press outside it that closed it, when one did.
   */
  onBox(open: boolean, by?: Event | null): void;
  /** A pointer went down on a hot key (the layer's vibration). */
  onPress?(): void;
  /** A press outside the box that still leaves it open: on what belongs to it (our own keyboard while it types in the box). */
  keepsBox?(target: Node): boolean;
}

export class HotkeysView {
  /** The columns' box: one column element per column that has a key (the second, left, first in it). */
  readonly el: HTMLDivElement;
  /** The K key; the layer puts it in the compass's free cell. */
  readonly kEl: HTMLButtonElement;
  /** The box (hidden until a key is held). */
  readonly boxEl: HTMLDivElement;
  private readonly doc: Document;
  private readonly deps: HotkeysDeps;
  private keys: PhoneHotkey[] = [];
  /** The shown keys' slots per column (hotkey-model.ts `hotkeyColumns`). */
  private columns: number[][] = [[], []];
  private sig = '';
  /** From one key's foot to the next, px (the keys' size and their gap). */
  private step = 43;
  /** The press in progress: its key, pointer and place, and the hold's timer. */
  private down: { index: number; id: number; x: number; y: number; timer: ReturnType<typeof setTimeout> } | null = null;
  /** The key whose box is open, and what the box holds now. */
  private boxIndex: number | null = null;
  private draft: PhoneHotkey = { label: '', command: '', special: null, shown: true };
  /** The press that closed the box: it starts no tap on a hot key. */
  private closedBy: Event | null = null;
  private box: BoxParts | null = null;

  constructor(doc: Document, deps: HotkeysDeps) {
    this.doc = doc;
    this.deps = deps;
    this.el = doc.createElement('div');
    this.el.className = 'wc-ph-hot';
    this.el.setAttribute('role', 'group');
    this.el.setAttribute('aria-label', 'Hot keys');
    this.el.hidden = true;

    this.kEl = doc.createElement('button');
    this.kEl.type = 'button';
    // In the compass's grid (compass.ts): its cell left of N. No `data-cmd`: the compass sends nothing for it.
    this.kEl.className = 'wc-ph-key is-tog';
    this.kEl.tabIndex = -1;
    this.kEl.style.gridColumn = '1';
    this.kEl.style.gridRow = '1';
    const ring = doc.createElement('span');
    ring.className = 'wc-ph-kk';
    ring.textContent = 'K';
    this.kEl.append(ring);
    this.kEl.addEventListener('click', () => this.tapK());

    this.boxEl = doc.createElement('div');
    this.boxEl.className = 'wc-ph-rb';
    this.boxEl.hidden = true;

    this.el.addEventListener('pointerdown', (e) => this.onDown(e));
    this.el.addEventListener('pointermove', (e) => this.onMove(e));
    this.el.addEventListener('pointerup', (e) => this.onUp(e));
    this.el.addEventListener('pointercancel', () => this.dropPress());
    // A pointer that leaves the key, or whose capture ends, is no hold (a mouse or a pen: a
    // finger's press is captured by the browser, and its slide is seen as a move). `pointerleave`
    // does not bubble: it is heard on its way down.
    this.el.addEventListener('lostpointercapture', (e) => this.onGone(e));
    this.el.addEventListener('pointerleave', (e) => this.onGone(e), true);
    // Browsers that still send the mouse press: it must not move the focus either.
    this.el.addEventListener('mousedown', (e) => e.preventDefault());
    this.el.addEventListener('click', (e) => {
      e.stopPropagation();
      // A pointer's click was handled on its release; `detail` 0 is an activation without one.
      if (e.detail !== 0) return;
      const i = this.keyAt(e);
      if (i !== null && this.boxIndex === null) this.deps.press(i);
    });
    // A long press is the hold, not a context menu or a selection.
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** The box is open. */
  get boxOpen(): boolean {
    return this.boxIndex !== null;
  }

  /** How many keys are shown in all (whether or not the columns are open). */
  get count(): number {
    return this.columns[0]!.length + this.columns[1]!.length;
  }

  /** The keys of the tallest column: what the columns take in height. */
  get rows(): number {
    return Math.max(this.columns[0]!.length, this.columns[1]!.length);
  }

  /** How many columns stand side by side from the right edge: 2 when the second one has a key (the first keeps its place also when empty), else 1. */
  get cols(): number {
    return this.columns[1]!.length > 0 ? 2 : 1;
  }

  /** The keys of column `col` (0: along the edge). */
  rowsIn(col: number): number {
    return this.columns[col]?.length ?? 0;
  }

  /** The keys, how many slots are in use, and whether the columns are open. Redraws only on a change. */
  set(keys: readonly PhoneHotkey[], count: number, open: boolean, step = 43): void {
    this.step = step;
    const sig = JSON.stringify([keys, count, open]);
    if (sig === this.sig) return;
    this.sig = sig;
    this.keys = keys.map((k) => ({ ...k }));
    this.columns = hotkeyColumns(this.keys, count);
    this.dropPress();
    // A box for a slot that is no longer in use has nothing to change.
    if (this.boxIndex !== null && this.boxIndex >= count) this.closeBox();
    const column = (slots: number[], second: boolean): HTMLDivElement => {
      const c = this.doc.createElement('div');
      c.className = second ? 'wc-ph-hot-col is-second' : 'wc-ph-hot-col';
      c.append(
        ...slots.map((i) => {
          const k = this.keys[i]!;
          const b = this.doc.createElement('button');
          b.type = 'button';
          b.className = 'wc-ph-hk';
          b.dataset.hk = String(i);
          b.textContent = k.label;
          b.setAttribute('aria-label', hotkeyName(i, k));
          b.setAttribute('aria-haspopup', 'dialog');
          // Not in the Tab order (ADR 0108): Tab belongs to the command line.
          b.tabIndex = -1;
          return b;
        }),
      );
      return c;
    };
    const [first, second] = this.columns as [number[], number[]];
    // Left to right: the second column, then the first. The first keeps its place when it is
    // empty and the second is not, so K4 to K6 never move under a thumb that learned them.
    this.el.replaceChildren(...(second.length > 0 ? [column(second, true)] : []), ...(first.length > 0 || second.length > 0 ? [column(first, false)] : []));
    const any = this.count > 0;
    this.el.hidden = !open || !any;
    const lit = open && any;
    this.kEl.classList.toggle('is-on', lit);
    this.kEl.setAttribute('aria-pressed', lit ? 'true' : 'false');
    this.kEl.setAttribute('aria-label', !any ? 'Set up hot keys' : lit ? 'Hide hot keys' : 'Show hot keys');
    this.markHeld();
  }

  /**
   * The K key. With no key shown there is no column to show: it opens the
   * box for K1 instead, where "Shown" brings a key back, so the K key is
   * never a dead control.
   */
  private tapK(): void {
    if (this.boxIndex !== null) {
      this.closeBox();
      return;
    }
    if (this.count === 0) this.openBox(0);
    else this.deps.toggle();
  }

  private keyAt(e: Event): number | null {
    const n = (e.target as Element | null)?.closest<HTMLElement>('.wc-ph-hk')?.dataset.hk;
    return n === undefined ? null : Number(n);
  }

  private onDown(e: PointerEvent): void {
    const i = this.keyAt(e);
    if (i === null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    // No mouse press follows: the focus (and the keyboard) stays as it is.
    e.preventDefault();
    this.deps.onPress?.();
    this.dropPress();
    // The press that closed the box did its work already; with the box open (another pointer) a key waits.
    if (e === this.closedBy || this.boxIndex !== null) return;
    try {
      // The release comes to the key also when the pointer strays (a mouse, a pen).
      (e.target as Element).closest('.wc-ph-hk')?.setPointerCapture(e.pointerId);
    } catch {
      // No such pointer any more (a synthetic press): the press works without the capture.
    }
    this.down = {
      index: i,
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      timer: setTimeout(() => {
        // Held: the box, and the release sends nothing.
        this.down = null;
        this.openBox(i);
      }, HOTKEY_HOLD_MS),
    };
  }

  private onMove(e: PointerEvent): void {
    const d = this.down;
    if (!d || e.pointerId !== d.id) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > HOTKEY_SLOP_PX) this.dropPress();
  }

  private onUp(e: PointerEvent): void {
    const d = this.down;
    if (!d || e.pointerId !== d.id) return;
    this.dropPress();
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) <= HOTKEY_SLOP_PX) this.deps.press(d.index);
  }

  private onGone(e: PointerEvent): void {
    if (this.down && e.pointerId === this.down.id) this.dropPress();
  }

  /** Forgets the press in progress (no tap and no hold comes of it). */
  private dropPress(): void {
    if (!this.down) return;
    clearTimeout(this.down.timer);
    this.down = null;
  }

  private markHeld(): void {
    for (const b of this.el.querySelectorAll<HTMLElement>('.wc-ph-hk')) {
      const held = this.boxIndex !== null && b.dataset.hk === String(this.boxIndex);
      b.classList.toggle('is-held', held);
      b.setAttribute('aria-expanded', held ? 'true' : 'false');
    }
  }

  // -------------------------------------------------------------------- box

  /** Opens the box for key `index` with what the key is now. */
  openBox(index: number): void {
    const key = this.keys[index];
    if (!key) return;
    const b = this.box ?? (this.box = this.buildBox());
    this.boxIndex = index;
    this.draft = { ...key };
    b.title.textContent = `K${index + 1}`;
    this.boxEl.setAttribute('aria-label', `Change hot key K${index + 1}`);
    b.label.value = key.label;
    b.command.value = key.command;
    b.error.hidden = true;
    // The notch points at the key: its place in its column from the foot.
    // None for a key that is not shown (the K key opened the box), and none
    // for a key of the first column while the second stands between it and
    // the box (the notch would point at the wrong key; the held key is lit).
    const col = this.cols - 1;
    const slots = this.columns[col]!;
    const at = slots.indexOf(index);
    b.notch.hidden = at < 0 || this.el.hidden;
    // (The notch is a 10 px square with a 1 px border, turned 45°, placed from inside the box's
    // own 1 px border: its middle at the key's.)
    b.notch.style.bottom = `${(slots.length - 1 - at) * this.step + (this.step - 3) / 2 - 6.5}px`;
    this.boxEl.hidden = false;
    b.body.scrollTop = 0;
    this.syncBox();
    this.markHeld();
    this.doc.addEventListener('pointerdown', this.onOutside, true);
    // On the window, ahead of the input pane's listener on the document: Esc closes the box, not opens the menu.
    this.doc.defaultView?.addEventListener('keydown', this.onEsc, true);
    this.deps.onBox(true);
  }

  /** Closes the box without saving (Cancel; the layer, when another surface takes its place). */
  closeBox(by: Event | null = null): void {
    if (this.boxIndex === null) return;
    this.boxIndex = null;
    this.doc.removeEventListener('pointerdown', this.onOutside, true);
    this.doc.defaultView?.removeEventListener('keydown', this.onEsc, true);
    // A field of the box had the focus: it leaves with the box (and the keyboard goes down).
    const active = this.doc.activeElement;
    if (active instanceof HTMLElement && this.boxEl.contains(active)) active.blur();
    this.boxEl.hidden = true;
    this.markHeld();
    this.deps.onBox(false, by);
  }

  /** Where the box stands: px from the layer's bottom edge, and the tallest it may be. */
  placeBox(bottom: number, maxHeight: number): void {
    this.boxEl.style.bottom = `${bottom}px`;
    this.boxEl.style.maxHeight = `${Math.max(0, maxHeight)}px`;
  }

  private readonly onOutside = (e: Event): void => {
    const t = e.target as Node | null;
    if (t && (this.boxEl.contains(t) || this.kEl.contains(t) || this.deps.keepsBox?.(t))) return;
    this.closedBy = e;
    this.closeBox(e);
  };

  /** Esc with the box open, wherever the focus is: Cancel. */
  private readonly onEsc = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    this.closeBox();
  };

  /** The box's Save (its key; Enter in a field, also from a keyboard that makes no key events). */
  saveBox(): void {
    this.save();
  }

  /** Whether `el` is one of the box's two text fields. */
  ownsField(el: Element): boolean {
    return this.box !== null && (el === this.box.label || el === this.box.command);
  }

  private save(): void {
    const index = this.boxIndex;
    const b = this.box;
    if (index === null || !b) return;
    const res = checkHotkey({ ...this.draft, label: b.label.value, command: b.command.value });
    if (!res.ok) {
      b.error.textContent = res.error;
      b.error.hidden = false;
      return;
    }
    this.closeBox();
    this.deps.save(index, res.key);
  }

  /** The box's controls follow the draft. */
  private syncBox(): void {
    const b = this.box;
    if (!b) return;
    const d = this.draft;
    b.shown.setAttribute('aria-checked', d.shown ? 'true' : 'false');
    const sp = HOTKEY_SPECIALS.find((s) => s.id === d.special) ?? null;
    b.token.hidden = sp === null;
    b.tokenText.textContent = sp?.text ?? '';
    b.command.hidden = sp !== null;
    const cmd = cleanCommand(b.command.value);
    b.says.textContent = sendsNow({ command: b.command.value, special: d.special }, this.deps.hp());
    const picked = sp === null && (HOTKEY_PICKS as readonly string[]).includes(cmd);
    for (const c of b.picks) {
      const on = sp === null && (c.dataset.pick === 'custom' ? !picked : c.dataset.pick === cmd);
      c.classList.toggle('is-sel', on);
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    for (const c of b.specials) {
      const on = c.dataset.special === d.special;
      c.classList.toggle('is-sel', on);
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  /** A quick pick or a special: the command (and a label that still followed it) change. */
  private pick(pick: { command: string } | { special: PhoneHotkeySpecial }): void {
    const b = this.box!;
    const next = pickHotkey({ ...this.draft, label: b.label.value, command: b.command.value }, pick);
    this.draft = next;
    b.label.value = next.label;
    b.command.value = next.command;
    b.error.hidden = true;
    this.syncBox();
  }

  /** Custom: the Command field as it is (a special gives way), with the cursor in it. */
  private custom(): void {
    const b = this.box!;
    this.draft = { ...this.draft, special: null };
    this.syncBox();
    b.command.focus();
    b.command.setSelectionRange(b.command.value.length, b.command.value.length);
  }

  private buildBox(): BoxParts {
    const doc = this.doc;
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
      const n = doc.createElement(tag);
      if (cls) n.className = cls;
      if (text !== undefined) n.textContent = text;
      return n;
    };
    const button = (cls: string, text: string, act: () => void): HTMLButtonElement => {
      const b = el('button', cls, text);
      b.type = 'button';
      // A tap on a button keeps the focus (a field being typed in keeps the keyboard).
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', act);
      return b;
    };
    const root = this.boxEl;
    root.setAttribute('role', 'dialog');
    root.setAttribute(OWN_KEYS, '');

    const title = el('span', 'wc-ph-rb-k');
    const shown = button('wc-ph-sw', 'Shown', () => {
      this.draft = { ...this.draft, shown: !this.draft.shown };
      this.syncBox();
    });
    shown.setAttribute('role', 'switch');
    shown.append(el('i', ''));
    const head = el('div', 'wc-ph-rb-t');
    head.append(title, shown);

    const field = (cls: string, id: string, name: string, max: number | null): { wrap: HTMLDivElement; input: HTMLInputElement } => {
      const wrap = el('div', cls);
      const lab = el('label', 'wc-ph-rb-h', name);
      lab.htmlFor = id;
      const input = el('input', 'wc-ph-fin');
      input.id = id;
      input.type = 'text';
      if (max !== null) input.maxLength = max;
      input.autocomplete = 'off';
      input.autocapitalize = 'off';
      input.spellcheck = false;
      input.setAttribute('autocorrect', 'off');
      input.enterKeyHint = 'done';
      wrap.append(lab, input);
      return { wrap, input };
    };
    // No `maxlength` on the label: it counts UTF-16 units, the model counts characters (an emoji is
    // one). The field is cleaned as it is typed in, with the model's own rule.
    const label = field('wc-ph-rb-fl', 'wc-ph-rb-label', 'Label', null);
    label.input.addEventListener('input', (e) => {
      // Not in the middle of a composition (an IME): its text is not final yet.
      if ((e as InputEvent).isComposing) return;
      const clean = typedLabel(label.input.value);
      if (clean !== label.input.value) label.input.value = clean;
    });
    label.wrap.append(el('span', 'wc-ph-rb-hint', `${HOTKEY_LABEL_MAX} max`));
    const command = field('wc-ph-rb-fc', 'wc-ph-rb-command', 'Command', HOTKEY_COMMAND_MAX);
    // A special shows as a token in the field's place; a tap on it is Custom.
    const token = button('wc-ph-fin wc-ph-rb-tok', '', () => this.custom());
    const tok = el('span', 'wc-ph-tok');
    const tokenText = el('span', '');
    tok.append(braces(doc), tokenText);
    token.append(tok);
    token.setAttribute('aria-label', 'Special; tap to write a command instead');
    command.wrap.append(token);
    const fields = el('div', 'wc-ph-rb-f');
    fields.append(label.wrap, command.wrap);
    command.input.addEventListener('input', () => {
      this.box!.error.hidden = true;
      this.syncBox();
    });

    const says = el('div', 'wc-ph-rb-say');
    const error = el('div', 'wc-ph-rb-err');
    error.setAttribute('role', 'alert');
    error.hidden = true;

    const chips = el('div', 'wc-ph-chips');
    const picks: HTMLButtonElement[] = [];
    for (const p of HOTKEY_PICKS) {
      const c = button('wc-ph-chip', p, () => this.pick({ command: p }));
      c.dataset.pick = p;
      picks.push(c);
    }
    const custom = button('wc-ph-chip', 'Custom', () => this.custom());
    custom.dataset.pick = 'custom';
    picks.push(custom);
    chips.append(...picks);

    const spec = el('div', 'wc-ph-spec');
    const specials: HTMLButtonElement[] = [];
    for (const s of HOTKEY_SPECIALS) {
      const c = button('wc-ph-chip is-wide', '', () => this.pick({ special: s.id }));
      c.dataset.special = s.id;
      c.append(braces(doc), doc.createTextNode(s.text));
      specials.push(c);
    }
    spec.append(...specials);

    const acts = el('div', 'wc-ph-rb-a');
    acts.append(
      button('wc-ph-bt', 'Cancel', () => this.closeBox()),
      button('wc-ph-bt is-go', 'Save', () => this.save()),
    );

    // The notch lies outside the box's edge, so the scrolling part (a short screen) is a child of its own.
    const notch = el('span', 'wc-ph-rb-n');
    const body = el('div', 'wc-ph-rb-in');
    body.append(head, fields, says, error, el('span', 'wc-ph-rb-h', 'Commands'), chips, el('span', 'wc-ph-rb-h', 'Specials'), spec, acts);
    root.append(notch, body);

    // The box's own keys: Enter in a field saves (Esc: `onEsc`); none of them leaves the box.
    root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
        e.preventDefault();
        this.save();
      }
    });
    // A click in the box is not a click on the game (which gives the command line the focus).
    root.addEventListener('click', (e) => e.stopPropagation());
    root.addEventListener('contextmenu', (e) => {
      if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
    });

    return { notch, body, title, shown, label: label.input, command: command.input, token, tokenText, says, error, picks, specials };
  }

  dispose(): void {
    this.dropPress();
    this.doc.removeEventListener('pointerdown', this.onOutside, true);
    this.doc.defaultView?.removeEventListener('keydown', this.onEsc, true);
    this.el.remove();
    this.kEl.remove();
    this.boxEl.remove();
  }
}

interface BoxParts {
  notch: HTMLElement;
  body: HTMLElement;
  title: HTMLElement;
  shown: HTMLButtonElement;
  label: HTMLInputElement;
  command: HTMLInputElement;
  token: HTMLButtonElement;
  tokenText: HTMLElement;
  says: HTMLElement;
  error: HTMLElement;
  picks: HTMLButtonElement[];
  specials: HTMLButtonElement[];
}

function braces(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'wc-ph-ico');
  svg.setAttribute('aria-hidden', 'true');
  const p = doc.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', BRACES);
  svg.append(p);
  return svg;
}
