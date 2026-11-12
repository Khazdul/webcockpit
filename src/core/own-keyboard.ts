// Our own keyboard on the phone's pages (ADR 0139): what the rest of the
// app needs to know of it. The keyboard itself lives in the phone chunk
// (src/phone/keyboard-pages.ts); this module is the small shared part, so
// the chrome, the input pane and the script engine import nothing of the
// phone.
//
// - `pageKeyboard()`: our keyboard is the one on the pages. Decided once
//   by the shell at start (a phone and a phone-size window);
//   false on a desktop and a tablet, and in unit tests. The
//   shared field components mark their fields by it (`ownFieldAttrs`).
// - `pageKeyboardUp()`: it stands on a page now (the phone chunk's mount
//   tells the shell, which sets it). The start page's too-small guard is
//   off meanwhile, as the cockpit's is under the game layout's keyboard.
// - Marked key events (ADR 0139 §4): on a page, Enter, Esc and Tab (and in
//   a code editor also Backspace and the caret keys, §6) are
//   sent as a synthetic `keydown` + `keyup` aimed at
//   the focused field, because the frame stack and the fields' own handlers
//   take them that way. Such an event is remembered here (`isOwnKey`);
//   the script engine's key handling (macro matching, key label learning,
//   src/script/keys.ts) and the input pane ignore it, and the listeners
//   that take Esc ahead of the page (the Timers pane's herb menu, the log
//   player; the hot key box by the key's target) leave it to the page. A
//   key is sent only to the field that has the focus. Text never goes
//   this way, and nothing of this is used in the game layout (ADR 0138
//   §3).
// - When the keyboard opens is the mount's rule (keyboard-pages.ts): with
//   the tap's click, never before it; this module only says that it is up.
// - The code editors (ADR 0139 §6, round 53h): a CodeMirror buffer's content
//   element is registered here by the editor chunk with the little the
//   keyboard needs of it (`OwnEditor`: typing text, bringing the caret into
//   view). The phone chunk's mount is handed `ownEditorOf` by the shell, so
//   it never imports CodeMirror, and the editor chunk never imports the
//   phone.

let pages = false;
let up = false;
const upSubs = new Set<(up: boolean) => void>();

/** Sets whether our keyboard is the pages' (the shell, once at start; tests). */
export function setPageKeyboard(on: boolean): void {
  pages = on;
  if (!on) setPageKeyboardUp(false);
}

/** True where the pages' text fields use our keyboard (a phone). */
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
 * break, and the caret goes up and down), `editor` (a code editor's content
 * element, registered with `registerOwnEditor`). Absent: a one-line text
 * field, or a text area whose Enter is its owner's.
 */
export const OWN_FIELD_KIND_ATTR = 'data-okb-kind';

/**
 * The attributes that make a field ask the device for no keyboard, where
 * our keyboard is the pages'; nothing elsewhere. Spread into the field
 * (`inputmode` wins over a field's own, so a numeric field passes `digits`
 * and gets our digit row instead).
 */
export function ownFieldAttrs(kind?: 'digits' | 'lines' | 'editor'): Record<string, string> {
  if (!pages) return {};
  return { inputmode: 'none', virtualkeyboardpolicy: 'manual', ...(kind ? { [OWN_FIELD_KIND_ATTR]: kind } : {}) };
}

const marked = new WeakSet<object>();

/** True for a key event our keyboard made (`sendOwnKey`): not a physical key. */
export function isOwnKey(e: object): boolean {
  return marked.has(e);
}

/** Enter, Esc and Tab for any field of a page; Backspace and the caret keys for a code editor only. */
export type OwnKey = 'Enter' | 'Escape' | 'Tab' | 'Backspace' | 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

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

/**
 * A code editor as our keyboard sees it (ADR 0139 §6). Its keys (Enter,
 * Backspace, Tab, Esc, the caret keys) are not here: they are marked key
 * events at its content element, which the frame stack hands to the
 * editor's own key bindings as it does a physical key.
 */
export interface OwnEditor {
  /** Text can be typed (not a read-only buffer). */
  editable(): boolean;
  /** Types `text` at the caret, over the selection, as a typed key would (bracket closing, completion). */
  insert(text: string): void;
  /** Brings the caret's line into view (the editor's own scroll; the room changed under it). */
  reveal(): void;
}

const editors = new WeakMap<Element, OwnEditor>();

/** Registers a code editor's content element (the editor chunk); returns the unregisterer. */
export function registerOwnEditor(content: Element, editor: OwnEditor): () => void {
  editors.set(content, editor);
  return () => {
    if (editors.get(content) === editor) editors.delete(content);
  };
}

/** The code editor whose content element `content` is, or null. */
export function ownEditorOf(content: Element): OwnEditor | null {
  return editors.get(content) ?? null;
}
