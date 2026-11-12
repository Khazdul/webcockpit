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
export function fieldUsable(f: TextField): boolean {
  return f.isConnected && !f.disabled && !f.readOnly && f.getClientRects().length > 0;
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

export interface FieldTargetOptions {
  /** Enter in the field: its owner's own action. Absent: Enter does nothing there. */
  submit?(): void;
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
  const changed = (inputType: string, data: string | null): void => {
    const Ev = doc.defaultView?.InputEvent;
    // The event a typed key ends with: the field's own listeners run as when typed.
    el.dispatchEvent(Ev ? new Ev('input', { bubbles: true, inputType, data }) : new Event('input', { bubbles: true }));
    // A long line follows its caret when that is at the end (a script does not scroll a field as a key does).
    if (el.isConnected && el.selectionEnd === el.value.length && el.scrollWidth > el.clientWidth) el.scrollLeft = el.scrollWidth;
  };
  return {
    insert(text: string): void {
      const [a, b] = range();
      // One line: these fields hold no line break.
      let t = text.replace(/[\r\n]+/g, ' ');
      const max = el.maxLength;
      if (max >= 0) t = fitUnits(t, max - (el.value.length - (b - a)));
      if (t === '' && a === b) return;
      el.setRangeText(t, a, b, 'end');
      // (Said again: the caret stands after what was typed in every engine.)
      el.setSelectionRange(a + t.length, a + t.length);
      changed('insertText', t);
    },
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
    focus(): void {
      if (doc.activeElement !== el) el.focus({ preventScroll: true });
    },
    blur(): void {
      el.blur();
    },
  };
}
