// Our own keyboard on the phone's pages (ADR 0139): what the rest of the
// app needs to know of it. The keyboard itself lives in the phone chunk
// (src/phone/keyboard-pages.ts); this module is the small shared part, so
// the chrome, the input pane and the script engine import nothing of the
// phone.
//
// - `pageKeyboard()`: our keyboard is the one on the pages. Decided once
//   by the shell at start (a phone, a phone-size window, and not
//   `?kbd=0`); false on a desktop and a tablet, and in unit tests. The
//   shared field components mark their fields by it (`ownFieldAttrs`).
// - `pageKeyboardUp()`: it stands on a page now (the phone chunk's mount
//   tells the shell, which sets it). The start page's too-small guard is
//   off meanwhile, as the cockpit's is under the game layout's keyboard.
// - Marked key events (ADR 0139 §4): on a page, Enter, Esc and Tab are
//   sent as a synthetic `keydown` + `keyup` aimed at
//   the focused field, because the frame stack and the fields' own handlers
//   take them that way. Such an event is remembered here; the script
//   engine's key handling (macro matching, key label learning,
//   src/script/keys.ts) and the input pane ignore it (`isOwnKey`). Text
//   never goes this way, and nothing of this is used in the game layout
//   (ADR 0138 §3).

let pages = false;
let up = false;
const upSubs = new Set<(up: boolean) => void>();

/** Sets whether our keyboard is the pages' (the shell, once at start; tests). */
export function setPageKeyboard(on: boolean): void {
  pages = on;
  if (!on) setPageKeyboardUp(false);
}

/** True where the pages' text fields use our keyboard (a phone, `?kbd=0` not asked). */
export function pageKeyboard(): boolean {
  return pages;
}

/** Sets whether our keyboard stands on a page now (the shell, told by the mount). */
export function setPageKeyboardUp(on: boolean): void {
  if (on === up) return;
  up = on;
  for (const fn of [...upSubs]) fn(on);
}

/** Calls `fn` when our keyboard comes up on a page or goes; returns the unsubscriber. */
export function onPageKeyboardUp(fn: (up: boolean) => void): () => void {
  upSubs.add(fn);
  return () => void upSubs.delete(fn);
}

/** True while our keyboard stands on a page. */
export function pageKeyboardUp(): boolean {
  return up;
}

/**
 * What kind of field our keyboard types in: `digits` (a one-line numeric
 * field: the digit row is up), `lines` (a multi-line field: Enter is a line
 * break, and the caret goes up and down). Absent: a one-line text field,
 * or a text area whose Enter is its owner's.
 */
export const OWN_FIELD_KIND_ATTR = 'data-okb-kind';

/**
 * The attributes that make a field ask the device for no keyboard, where
 * our keyboard is the pages'; nothing elsewhere. Spread into the field
 * (`inputmode` wins over a field's own, so a numeric field passes `digits`
 * and gets our digit row instead).
 */
export function ownFieldAttrs(kind?: 'digits' | 'lines'): Record<string, string> {
  if (!pages) return {};
  return { inputmode: 'none', virtualkeyboardpolicy: 'manual', ...(kind ? { [OWN_FIELD_KIND_ATTR]: kind } : {}) };
}

const marked = new WeakSet<object>();

/** True for a key event our keyboard made (`sendOwnKey`): not a physical key. */
export function isOwnKey(e: object): boolean {
  return marked.has(e);
}

export type OwnKey = 'Enter' | 'Escape' | 'Tab';

/**
 * Sends `key` to `target` as a marked `keydown` and `keyup`, bubbling, as
 * the keyboard would (the frame stack's window capture listener sees it
 * first). Returns false when a handler prevented the keydown's default
 * (the key was taken), true when nothing did.
 */
export function sendOwnKey(target: Element, key: OwnKey, mods: { shift?: boolean } = {}): boolean {
  const win = target.ownerDocument.defaultView;
  if (!win) return true;
  const init: KeyboardEventInit = { key, code: key, bubbles: true, cancelable: true, composed: true, shiftKey: mods.shift === true };
  const down = new win.KeyboardEvent('keydown', init);
  const upEv = new win.KeyboardEvent('keyup', init);
  marked.add(down);
  marked.add(upEv);
  const free = target.dispatchEvent(down);
  // (The field may be gone by now: the keyup still ends what followed the keydown.)
  target.dispatchEvent(upEv);
  return free;
}
