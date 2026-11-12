// The other text fields of the phone's game layout as targets of our own
// keyboard (ADR 0138 §1, §3; stage 53d): Comm's reply line and search
// field, the hot key box's Label and Command, a script pane's fields. The
// command line has its own target, over the input pane's editing API.
//
// - `fieldTarget` is an adapter over the element. It changes the value at
//   the selection and then dispatches the `input` event a typed key would
//   have brought, so the field's own logic runs as when typed (the hot key
//   label's cleaning, Comm's search, a script pane's change report). It
//   never makes up a keyboard event: Enter is the `submit` it is given,
//   which the layer takes from the field's owner.
// - `maxLength` is kept as the browser keeps it for a typed key: what does
//   not fit is not typed (counted in UTF-16 units, as the attribute is).
// - Backspace removes the selection, or one whole character before the
//   caret (a grapheme cluster where `Intl.Segmenter` exists, else a code
//   point).
// - The caret keys (a page's keyboard, ADR 0139 §5) set the selection:
//   left and right by one whole character, a selection collapsing to that
//   end. A one-line field is scrolled so its caret shows (estimated from the
//   caret's share of the text: a script's selection does not scroll a field).
// - A multi-line field (`lines`; Lite's body): text goes in with its line
//   breaks, Enter is a line break (`newline`), backspace deletes back across
//   one, and the caret also goes up and down. Up and down move by the
//   text's own lines (between line breaks), keeping the column wanted
//   through a run of them; on the first line up goes to its start, on the
//   last down goes to its end. After every edit and caret move the field's
//   own scroll follows the caret's line (`caretLineBox`, measured once in a
//   copy of the field's text: no per-frame work), and `onCaret` tells the
//   owner, which keeps that line above the keyboard.
// - `markField` makes a field ask the device for no keyboard
//   (`inputmode="none"`, `virtualkeyboardpolicy="manual"`).
//
// Pure DOM; nothing of the app is imported (kit.ts).

import type { OkbTarget } from './keyboard-model';

export type TextField = HTMLInputElement | HTMLTextAreaElement;

/** `<input>` types text is typed in and `setRangeText` works on. */
const TEXT_TYPES: ReadonlySet<string> = new Set(['text', 'search', 'url', 'tel', 'password']);

/** A field our keyboard can type in: a textarea, or an input of a plain text type that is not read-only or disabled. */
export function isOwnableField(el: Element | null | undefined): el is TextField {
  if (!el) return false;
  const f = el as TextField;
  if (f.readOnly || f.disabled) return false;
  if (el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && TEXT_TYPES.has((el as HTMLInputElement).type);
}

/** A field text is typed in, of any kind (not a checkbox, a button or the like). */
export function isTextField(el: HTMLElement): boolean {
  if (el.tagName === 'TEXTAREA' || el.isContentEditable) return true;
  if (el.tagName !== 'INPUT') return false;
  return !['button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset', 'image', 'hidden'].includes((el as HTMLInputElement).type);
}

/** Marks a field as typed in from our own keyboard: the device's stays down. */
export function markField(f: HTMLElement): void {
  if (f.getAttribute('inputmode') !== 'none') f.setAttribute('inputmode', 'none');
  if (f.getAttribute('virtualkeyboardpolicy') !== 'manual') f.setAttribute('virtualkeyboardpolicy', 'manual');
}

/** Whether a field is marked (`markField`; the command line's are marked by the input pane). */
export function isMarked(f: Element): boolean {
  return f.getAttribute('inputmode') === 'none';
}

/** The field is in the page and shown (a field hidden with its box or its search is no target). */
export function fieldUsable(f: HTMLElement): boolean {
  if (!f.isConnected || (f as TextField).disabled === true || (f as TextField).readOnly === true) return false;
  const r = f.getClientRects()[0];
  if (!r || r.width <= 0 || r.height <= 0) return false;
  // (Hidden by `visibility` it still has a box: asked where the browser can tell.)
  return f.checkVisibility?.({ visibilityProperty: true }) ?? true;
}

type SegmenterCtor = new (locale?: string, opts?: { granularity: 'grapheme' }) => { segment(s: string): Iterable<{ index: number }> };

/** Where the character before `pos` starts: a whole grapheme cluster, else a code point. */
export function charStartBefore(text: string, pos: number): number {
  if (pos <= 0) return 0;
  const before = text.slice(0, pos);
  const Seg = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;
  if (Seg) {
    let start = 0;
    for (const g of new Seg(undefined, { granularity: 'grapheme' }).segment(before)) start = g.index;
    return start;
  }
  const lo = before.charCodeAt(pos - 1);
  const hi = pos >= 2 ? before.charCodeAt(pos - 2) : 0;
  return lo >= 0xdc00 && lo <= 0xdfff && hi >= 0xd800 && hi <= 0xdbff ? pos - 2 : pos - 1;
}

/** `text` cut to `room` UTF-16 units, never in the middle of a surrogate pair. */
function fitUnits(text: string, room: number): string {
  if (text.length <= room) return text;
  let cut = Math.max(0, room);
  const c = text.charCodeAt(cut - 1);
  if (cut > 0 && c >= 0xd800 && c <= 0xdbff) cut--;
  return text.slice(0, cut);
}

/** Where the character at `pos` ends: a whole grapheme cluster, else a code point. */
export function charEndAfter(text: string, pos: number): number {
  if (pos >= text.length) return text.length;
  const Seg = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;
  if (Seg) {
    // (Segmented from the line's start: a cluster never spans a line break, but CR LF.)
    const nl = text.lastIndexOf('\n', pos - 1);
    const from = nl > 0 && text.charCodeAt(nl - 1) === 13 ? nl - 1 : nl + 1;
    let prev = -1;
    for (const g of new Seg(undefined, { granularity: 'grapheme' }).segment(text.slice(from))) {
      if (prev >= 0 && from + g.index > pos) return from + g.index;
      prev = g.index;
    }
    return text.length;
  }
  const hi = text.charCodeAt(pos);
  const lo = pos + 1 < text.length ? text.charCodeAt(pos + 1) : 0;
  return hi >= 0xd800 && hi <= 0xdbff && lo >= 0xdc00 && lo <= 0xdfff ? pos + 2 : pos + 1;
}

/**
 * Where the caret at `pos` goes one line up (`dir` -1) or down (1) in
 * `text`, by the text's own lines, at column `col` (UTF-16 units from the
 * line's start; the caret's own column when absent). On the first line up
 * is the text's start, on the last down is its end.
 */
export function caretLineMove(text: string, pos: number, dir: -1 | 1, col?: number): number {
  const start = pos <= 0 ? 0 : text.lastIndexOf('\n', pos - 1) + 1;
  const want = col ?? pos - start;
  if (dir < 0) {
    if (start === 0) return 0;
    const prevStart = start < 2 ? 0 : text.lastIndexOf('\n', start - 2) + 1;
    return Math.min(prevStart + want, start - 1);
  }
  const end = text.indexOf('\n', pos);
  if (end < 0) return text.length;
  const nextEnd = text.indexOf('\n', end + 1);
  return Math.min(end + 1 + want, nextEnd < 0 ? text.length : nextEnd);
}

/**
 * The scroll position that shows a line from `top` to `bottom` (content
 * px) in a box `view` px high scrolled to `scroll`: as it is when the line
 * shows already, else moved as little as possible, with `margin` px of air.
 */
export function scrollToShow(scroll: number, view: number, top: number, bottom: number, margin = 0): number {
  if (top - margin < scroll) return Math.max(0, top - margin);
  if (bottom + margin > scroll + view) return Math.max(0, bottom + margin - view);
  return scroll;
}

const MIRROR_PROPS = [
  'boxSizing',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fontVariant',
  'fontStretch',
  'lineHeight',
  'letterSpacing',
  'wordSpacing',
  'textIndent',
  'textTransform',
  'tabSize',
  'whiteSpace',
  'wordBreak',
  'overflowWrap',
] as const;

/**
 * The caret's line in a textarea: its top and bottom in the field's
 * content (px from the padding box's top edge, the scroll not counted), or
 * null where nothing can be measured. Measured in a hidden copy of the text
 * with the field's own type and width; made and removed in the call.
 */
export function caretLineBox(el: HTMLTextAreaElement): { top: number; bottom: number } | null {
  const doc = el.ownerDocument;
  const win = doc.defaultView;
  if (!win || !el.isConnected || el.clientWidth <= 0) return null;
  const st = win.getComputedStyle(el);
  const m = doc.createElement('div');
  const ms = m.style;
  for (const p of MIRROR_PROPS) ms[p] = st[p];
  ms.position = 'absolute';
  ms.visibility = 'hidden';
  ms.pointerEvents = 'none';
  ms.top = '0';
  ms.left = '-9999px';
  ms.height = 'auto';
  ms.overflow = 'hidden';
  if (st.whiteSpace === 'normal' || st.whiteSpace === '') ms.whiteSpace = 'pre-wrap';
  // The text's width is the field's without its scrollbar.
  ms.boxSizing = 'border-box';
  ms.width = `${el.clientWidth + (parseFloat(st.borderLeftWidth) || 0) + (parseFloat(st.borderRightWidth) || 0)}px`;
  const pos = el.selectionEnd ?? el.value.length;
  m.textContent = el.value.slice(0, pos);
  const mark = doc.createElement('span');
  mark.textContent = '\u200b';
  m.append(mark);
  m.append(doc.createTextNode(el.value.slice(pos) || ' '));
  doc.body.append(m);
  const top = mark.offsetTop;
  const h = mark.offsetHeight;
  m.remove();
  if (!(h > 0)) return null;
  return { top, bottom: top + h };
}

export interface FieldTargetOptions {
  /** Enter in the field: its owner's own action. Absent: Enter does nothing there. */
  submit?(): void;
  /** A multi-line field (a textarea whose Enter is a line break): line breaks are kept, and the caret goes up and down. */
  lines?: boolean;
  /** Esc and Tab, sent by the owner as marked key events (a page's fields). Absent: the field has no such keys. */
  pageKey?(key: 'Escape' | 'Tab', shift: boolean): void;
  /** The caret moved or the text changed through the target (the owner keeps the caret's line in view). */
  onCaret?(): void;
}

/** The field as a target of the keys (see the file header). */
export function fieldTarget(el: TextField, opts: FieldTargetOptions = {}): OkbTarget {
  const doc = el.ownerDocument;
  const range = (): [number, number] => {
    const n = el.value.length;
    const a = el.selectionStart ?? n;
    const b = el.selectionEnd ?? n;
    return [Math.min(a, b), Math.max(a, b)];
  };
  const area = el.tagName === 'TEXTAREA';
  const lines = opts.lines === true && area;
  /** The column a run of up and down keys keeps, or null. */
  let goal: number | null = null;
  /** The field's own scroll follows its caret (a script's edit or selection does not scroll a field as a key does). */
  const follow = (): void => {
    if (!el.isConnected) return;
    if (area) {
      if (el.scrollHeight > el.clientHeight) {
        const box = caretLineBox(el as HTMLTextAreaElement);
        if (box) {
          const to = scrollToShow(el.scrollTop, el.clientHeight, box.top, box.bottom, 2);
          if (to !== el.scrollTop) el.scrollTop = to;
        }
      }
    } else if (el.scrollWidth > el.clientWidth) {
      const n = el.value.length;
      const pos = el.selectionEnd ?? n;
      if (pos >= n) el.scrollLeft = el.scrollWidth;
      else {
        // Estimated from the caret's share of the text (exact in a fixed-width type).
        const x = (pos / n) * el.scrollWidth;
        const pad = Math.min(24, el.clientWidth / 4);
        const to = scrollToShow(el.scrollLeft, el.clientWidth, x, x, pad);
        if (to !== el.scrollLeft) el.scrollLeft = to;
      }
    }
    opts.onCaret?.();
  };
  const changed = (inputType: string, data: string | null): void => {
    goal = null;
    const Ev = doc.defaultView?.InputEvent;
    // The event a typed key ends with: the field's own listeners run as when typed.
    el.dispatchEvent(Ev ? new Ev('input', { bubbles: true, inputType, data }) : new Event('input', { bubbles: true }));
    follow();
  };
  const caretTo = (pos: number): void => {
    el.setSelectionRange(pos, pos);
    follow();
  };
  const upDown = (dir: -1 | 1): void => {
    const [a, b] = range();
    const pos = dir < 0 ? a : b;
    const v = el.value;
    const keep = goal ?? pos - (pos <= 0 ? 0 : v.lastIndexOf('\n', pos - 1) + 1);
    caretTo(caretLineMove(v, pos, dir, keep));
    goal = keep;
  };
  const insert = (text: string): void => {
    const [a, b] = range();
    // One line: these fields hold no line break. A multi-line field keeps them (as `\n`).
    let t = lines ? text.replace(/\r\n?/g, '\n') : text.replace(/[\r\n]+/g, ' ');
    const max = el.maxLength;
    if (max >= 0) t = fitUnits(t, max - (el.value.length - (b - a)));
    if (t === '' && a === b) return;
    el.setRangeText(t, a, b, 'end');
    // (Said again: the caret stands after what was typed in every engine.)
    el.setSelectionRange(a + t.length, a + t.length);
    changed(t === '\n' ? 'insertLineBreak' : 'insertText', t === '\n' ? null : t);
  };
  return {
    insert,
    deleteBack(): void {
      const [a, b] = range();
      const from = a === b ? charStartBefore(el.value, a) : a;
      if (from === b) return;
      el.setRangeText('', from, b, 'end');
      el.setSelectionRange(from, from);
      changed('deleteContentBackward', null);
    },
    submit(): void {
      opts.submit?.();
    },
    caretLeft(): void {
      const [a, b] = range();
      goal = null;
      caretTo(a === b ? charStartBefore(el.value, a) : a);
    },
    caretRight(): void {
      const [a, b] = range();
      goal = null;
      caretTo(a === b ? charEndAfter(el.value, b) : b);
    },
    ...(lines ? { newline: () => insert('\n'), caretUp: () => upDown(-1), caretDown: () => upDown(1) } : {}),
    ...(opts.pageKey ? { pageKey: opts.pageKey } : {}),
    focus(): void {
      if (doc.activeElement !== el) el.focus({ preventScroll: true });
    },
    blur(): void {
      el.blur();
    },
  };
}
