// The bar popups' shared kit (ADR 0099): a small dark panel in the ghost
// look, anchored above the menu bar, that owns the keys and clicks inside
// it. 30a's Panes and Exit popups use it; 30c's Settings popup and the
// pane gear build on it.
//
// - The panel carries `data-wc-own-keys`, so the input pane's document
//   key and click routing leaves what happens inside it alone
//   (src/ui/input-pane.ts).
// - A mouse down anywhere in it gives it the keys (the panel itself takes
//   the focus; a button inside still gets its click), and never starts a
//   text selection.
// - Placement: its right edge on the bar's right end (the mockups), moved
//   left far enough to cover its icon, kept inside the viewport; above the
//   bar, or squeezed with a scroll when the space above is short.

import { OWN_KEYS_ATTR } from '../ui/input-pane';
import { CLOSE_X, strokeIcon } from './icons';

/** Gap between the popup and the bar, and the least margin to the viewport edge. */
const GAP = 6;
const MARGIN = 4;

/** A bar popup's panel: `div.wc-pop.<cls>`, a focusable dialog. */
export function popupPanel(doc: Document, cls: string, label: string): HTMLDivElement {
  const el = doc.createElement('div');
  el.className = `wc-pop ${cls}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', label);
  el.setAttribute(OWN_KEYS_ATTR, '');
  el.tabIndex = -1;
  el.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (doc.activeElement !== el) el.focus({ preventScroll: true });
  });
  return el;
}

/** A ghost button: `<button class=cls>` with `text`, clicked with `fn`. */
export function ghostButton(doc: Document, cls: string, text: string, fn: () => void, key?: string): HTMLButtonElement {
  const b = doc.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = text;
  if (key) {
    const k = doc.createElement('span');
    k.className = 'wc-pop-k';
    k.textContent = key;
    b.append(k);
  }
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    fn();
  });
  return b;
}

/** The popup's close cross. */
export function closeButton(doc: Document, fn: () => void): HTMLButtonElement {
  const b = ghostButton(doc, 'wc-pop-x', '', fn);
  b.setAttribute('aria-label', 'Close');
  b.append(strokeIcon(doc, CLOSE_X, 'wc-pop-x-svg', 12).svg);
  return b;
}

/** Places `el` (position: fixed) above `bar`, over `icon`, inside the viewport. */
export function placePopup(el: HTMLElement, icon: Element, bar: Element): void {
  const win = el.ownerDocument.defaultView;
  const vw = win?.innerWidth ?? 0;
  const b = bar.getBoundingClientRect();
  const i = icon.getBoundingClientRect();
  el.style.maxHeight = '';
  const w = el.offsetWidth;
  let left = Math.min(b.right - w, i.left);
  left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));
  const room = b.top - GAP - MARGIN;
  if (el.offsetHeight > room) el.style.maxHeight = `${Math.max(0, room)}px`;
  const top = Math.max(MARGIN, b.top - GAP - el.offsetHeight);
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

/** Moves the focus among `items` with ↑/↓ (wrapping); true when it moved. */
export function arrowFocus(e: KeyboardEvent, items: readonly HTMLElement[]): boolean {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return false;
  if (items.length === 0) return true;
  const doc = items[0]!.ownerDocument;
  const at = items.indexOf(doc.activeElement as HTMLElement);
  const n = items.length;
  const next = at < 0 ? (e.key === 'ArrowDown' ? 0 : n - 1) : (at + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
  items[next]!.focus({ preventScroll: true });
  return true;
}

/** True for a key event without Ctrl, Alt or Meta. */
export const plainKey = (e: KeyboardEvent): boolean => !e.ctrlKey && !e.altKey && !e.metaKey;
