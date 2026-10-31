// The bar popups' shared kit (ADR 0099): a small dark panel in the ghost
// look, anchored above the menu bar, that owns the keys and clicks inside
// it. 30a's Panes and Exit popups use it; 30c's Settings popup and the
// pane gear build on it.
//
// - The panel carries `data-wc-own-keys`, so the input pane's document
//   key and click routing leaves what happens inside it alone
//   (src/ui/input-pane.ts).
// - Focus and keys (ADR 0108): a popup takes the focus when it opens
//   (`focusPopup`: its first control, or a given one), by a click, a `#`
//   command or a macro. Tab and Shift+Tab wrap inside it; Page Up/Down
//   scroll it when it scrolls and are swallowed otherwise (`popupKey`). A
//   mouse down in it never starts a text selection and gives the focus to
//   the control pressed (or the panel); a text field takes it itself
//   (`pressPopup`). Opened or pressed by the mouse, it hides its focus
//   rings until a key is used (`data-pointer`; `watchInput` tells a press
//   from a key).
// - Placement: its right edge on the bar's right end (the mockups), moved
//   left far enough to cover its icon, kept inside the viewport; above the
//   bar, or squeezed with a scroll when the space above is short. A pane's
//   gear popup goes beside its pane instead (`placeBeside`, ADR 0107).

import { OWN_KEYS_ATTR } from '../ui/input-pane';
import { CLOSE_X, strokeIcon } from './icons';

/** Gap between the popup and the bar, and the least margin to the viewport edge. */
const GAP = 6;
const MARGIN = 4;

/** A bar popup's panel: `div.wc-pop.<cls>`, a focusable dialog with the popup key rules. */
export function popupPanel(doc: Document, cls: string, label: string): HTMLDivElement {
  const el = doc.createElement('div');
  el.className = `wc-pop ${cls}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', label);
  el.setAttribute(OWN_KEYS_ATTR, '');
  el.tabIndex = -1;
  el.addEventListener('mousedown', (e) => pressPopup(e, el));
  el.addEventListener('keydown', (e) => {
    if (popupKey(e, el)) e.preventDefault();
  });
  return el;
}

// ------------------------------------------------------- focus (ADR 0108)

const FOCUSABLE = 'button, input, select, textarea, [tabindex]';

/** A popup's tabbable controls, in document order (visible ones only). */
export function popupTabbables(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if (el.tabIndex < 0 || (el as HTMLButtonElement).disabled) return false;
    if (el.closest('[aria-hidden="true"], [hidden]')) return false;
    return (el as HTMLInputElement).type !== 'hidden' && (el as HTMLInputElement).type !== 'file';
  });
}

/** Per document: the last input was a press (true) or a key (false). */
const lastPress = new WeakMap<Document, { pointer: boolean }>();

/**
 * Follows whether the last input in `doc` was a press or a key (window
 * listeners in the capture phase, ahead of everything that stops a key),
 * so a popup opened by a click hides its focus ring. Once per document.
 */
export function watchInput(doc: Document): void {
  const win = doc.defaultView;
  if (!win || lastPress.has(doc)) return;
  const st = { pointer: false };
  lastPress.set(doc, st);
  const press = (): void => void (st.pointer = true);
  win.addEventListener('pointerdown', press, true);
  win.addEventListener('mousedown', press, true);
  win.addEventListener('keydown', () => void (st.pointer = false), true);
}

/** True when the last input in `doc` was a press (see `watchInput`). */
export const pressedLast = (doc: Document): boolean => lastPress.get(doc)?.pointer ?? false;

/**
 * Gives an opening popup the focus: `first` when given, else its first
 * tabbable control that is not the close cross, else the panel. Opened by
 * a press, its focus rings stay hidden until a key is used.
 */
export function focusPopup(panel: HTMLElement, first?: HTMLElement | null): void {
  const doc = panel.ownerDocument;
  panel.toggleAttribute('data-pointer', pressedLast(doc));
  const to = first ?? popupTabbables(panel).find((el) => !el.classList.contains('wc-pop-x')) ?? panel;
  to.focus({ preventScroll: true });
  if (!panel.contains(doc.activeElement)) panel.focus({ preventScroll: true });
}

/**
 * A mouse down in a popup: no text selection and no native focus move;
 * the control pressed (or the panel) takes the focus, so the keyboard
 * goes on from there. A text field takes the focus (and its caret) itself.
 * Focus rings hide until a key is used.
 */
export function pressPopup(e: MouseEvent, panel: HTMLElement): void {
  const t = e.target as Element | null;
  if (t?.closest?.('input, textarea, select')) return;
  e.preventDefault();
  panel.setAttribute('data-pointer', '');
  const doc = panel.ownerDocument;
  const f = t?.closest?.<HTMLElement>(FOCUSABLE);
  const to = f && panel.contains(f) ? f : panel;
  if (doc.activeElement !== to) to.focus({ preventScroll: true });
  if (!panel.contains(doc.activeElement)) panel.focus({ preventScroll: true });
}

/** The element that scrolls a popup's content (its body, or the panel), or null when nothing scrolls. */
function scroller(panel: HTMLElement): HTMLElement | null {
  const body = panel.querySelector<HTMLElement>('.wc-sp-body');
  for (const el of [body, panel]) if (el && el.scrollHeight > el.clientHeight + 1) return el;
  return null;
}

/**
 * The key rules every popup shares (ADR 0108), for a keydown in `panel`;
 * true when it took the key (the caller prevents its default). A key shows
 * the focus rings again. Tab and Shift+Tab wrap inside the popup and
 * never leave it; Page Up and Page Down scroll it when it scrolls and are
 * swallowed otherwise (never the game behind); Space on the panel itself
 * does nothing. A key a control already took is left alone.
 */
export function popupKey(e: KeyboardEvent, panel: HTMLElement): boolean {
  panel.removeAttribute('data-pointer');
  if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return false;
  const doc = panel.ownerDocument;
  if (e.key === 'Tab') {
    const items = popupTabbables(panel);
    if (items.length === 0) return true;
    const at = items.indexOf(doc.activeElement as HTMLElement);
    const n = items.length;
    const next = at < 0 ? (e.shiftKey ? n - 1 : 0) : (at + (e.shiftKey ? n - 1 : 1)) % n;
    items[next]!.focus({ preventScroll: true });
    return true;
  }
  if (e.key === 'PageUp' || e.key === 'PageDown') {
    const sc = scroller(panel);
    if (sc) sc.scrollTop += (e.key === 'PageDown' ? 1 : -1) * Math.max(1, Math.round(sc.clientHeight * 0.9));
    return true;
  }
  return e.key === ' ' && e.target === panel;
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

/** A box on screen (px, viewport coordinates). */
export interface ScreenBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Where `besidePlace` puts a popup: its top-left corner, and a height cap (null: none). */
export interface BesidePos {
  left: number;
  top: number;
  maxHeight: number | null;
  /** Beside the pane, or over it (no room on either side). */
  side: 'left' | 'right' | 'over';
}

/**
 * A pane's gear popup (ADR 0107): `w` × `h` px beside `pane`, top-aligned
 * with it, on the side toward the game column (`game`) when it fits there,
 * else on the other side; with room on neither side (a wide pane) over the
 * pane's box near its top edge (`inset` px below it, the title row), on the
 * game side. Always inside the `vw` × `vh` viewport; taller than it, the
 * height is capped (the popup's body scrolls).
 */
export function besidePlace(pane: ScreenBox, game: ScreenBox, w: number, h: number, vw: number, vh: number, inset = 0): BesidePos {
  const gameLeft = (game.left + game.right) / 2 <= (pane.left + pane.right) / 2;
  const fitsLeft = pane.left - GAP - w >= MARGIN;
  const fitsRight = pane.right + GAP + w <= vw - MARGIN;
  const order: Array<'left' | 'right'> = gameLeft ? ['left', 'right'] : ['right', 'left'];
  const side = order.find((s) => (s === 'left' ? fitsLeft : fitsRight)) ?? 'over';
  let left: number;
  let top = pane.top;
  if (side === 'left') left = pane.left - GAP - w;
  else if (side === 'right') left = pane.right + GAP;
  else {
    left = gameLeft ? pane.left + GAP : pane.right - GAP - w;
    top = pane.top + inset;
  }
  left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));
  const room = vh - 2 * MARGIN;
  const maxHeight = h > room ? Math.max(0, room) : null;
  top = Math.max(MARGIN, Math.min(top, vh - MARGIN - Math.min(h, room)));
  return { left: Math.round(left), top: Math.round(top), maxHeight, side };
}

/** Places a gear popup `el` beside the pane element `pane` (see `besidePlace`). */
export function placeBeside(el: HTMLElement, pane: Element, game: Element, inset = 0): void {
  const win = el.ownerDocument.defaultView;
  el.style.maxHeight = '';
  const p = besidePlace(
    pane.getBoundingClientRect(),
    game.getBoundingClientRect(),
    el.offsetWidth,
    el.offsetHeight,
    win?.innerWidth ?? 0,
    win?.innerHeight ?? 0,
    inset,
  );
  if (p.maxHeight !== null) el.style.maxHeight = `${p.maxHeight}px`;
  el.style.left = `${p.left}px`;
  el.style.top = `${p.top}px`;
  el.dataset.side = p.side;
}

/** The pane of a gear popup's key (`pane:comm` → `comm`), or null for another popup. */
export const gearPaneOf = (key: string | null | undefined): string | null => (key?.startsWith('pane:') ? key.slice(5) : null);

/**
 * After a cockpit layout: an open gear popup follows its pane (placed
 * again) while the pane is `shown`, and closes when it is not (hidden by
 * its cross, the Panes popup, a setting or Reset layout; removed; the
 * window too small). Other popups are left alone.
 */
export function followPane(p: { readonly openKey: string | null; place(): void; close(): boolean }, shown: (id: string) => boolean): void {
  const id = gearPaneOf(p.openKey);
  if (id === null) return;
  if (shown(id)) p.place();
  else p.close();
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
