// The one key table (ADR 0015 "Key names", ADR 0005; Inv §1.2 "Forwarded
// macro keys", §5.6 "Macro Key cell"). The input line, the engine's macro
// lookup and the editor's key capture all use it, so a macro that can be
// saved is a macro that can fire (Cockpit's ADR 0082 lesson).
//
// Canonical name: modifiers in the order Ctrl+Alt+Shift+Meta, then the key
// from `KeyboardEvent.code` with the `Key`/`Digit` prefix dropped:
// `F5`, `Numpad0`, `NumpadAdd`, `Alt+A`, `Ctrl+Shift+F1`, `Alt+1`.

export interface KeyEventLike {
  code: string;
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export type Bindability = { ok: true; name: string } | { ok: false; name: string | null; reason: string };

// ---------------------------------------------------------------------------
// Key catalogue
// ---------------------------------------------------------------------------

interface KeyInfo {
  /** Canonical key part (`A`, `1`, `F5`, `Numpad0`, `ArrowUp`, `Minus`). */
  name: string;
  /** Display form (Inv §5.6): `Numpad 0`, `Up`, `-`. Letters are special-cased. */
  display: string;
  /** Sort group (see `compareKeys`) and index inside it. */
  group: number;
  order: number;
  /** A printable key: types text without Ctrl/Alt/Meta (ADR 0026: bindable, the editor warns). */
  printable: boolean;
}

const G_FKEY = 0;
const G_NUMPAD = 1;
const G_LETTER = 2;
const G_DIGIT = 3;
const G_NAV = 4;
const G_EDIT = 5;
const G_PUNCT = 6;
const G_OTHER = 7;

const KEYS: KeyInfo[] = [];
const BY_NAME = new Map<string, KeyInfo>();
/** Lower-case alias → canonical key part. */
const ALIASES = new Map<string, string>();

function add(name: string, display: string, group: number, printable: boolean, aliases: string[] = []): void {
  const k: KeyInfo = { name, display, group, order: KEYS.filter((x) => x.group === group).length, printable };
  KEYS.push(k);
  BY_NAME.set(name, k);
  for (const a of [name, display, ...aliases]) ALIASES.set(a.toLowerCase(), name);
}

for (let i = 1; i <= 24; i++) add(`F${i}`, `F${i}`, G_FKEY, false);
for (let i = 0; i <= 9; i++) add(`Numpad${i}`, `Numpad ${i}`, G_NUMPAD, false, [`Numpad${i}`, `kp${i}`]);
add('NumpadDecimal', 'Numpad .', G_NUMPAD, false, ['Numpad.']);
add('NumpadEnter', 'Numpad Enter', G_NUMPAD, false, ['NumpadEnter']);
add('NumpadMultiply', 'Numpad *', G_NUMPAD, false, ['Numpad*']);
add('NumpadAdd', 'Numpad +', G_NUMPAD, false, ['Numpad+']);
add('NumpadSubtract', 'Numpad -', G_NUMPAD, false, ['Numpad-']);
add('NumpadDivide', 'Numpad /', G_NUMPAD, false, ['Numpad/']);
add('NumpadEqual', 'Numpad =', G_NUMPAD, false, ['Numpad=']);
add('NumpadComma', 'Numpad ,', G_NUMPAD, false, ['Numpad,']);
for (let c = 65; c <= 90; c++) {
  const l = String.fromCharCode(c);
  add(l, l, G_LETTER, true, [`Key${l}`]);
}
for (let i = 0; i <= 9; i++) add(`${i}`, `${i}`, G_DIGIT, true, [`Digit${i}`]);
add('ArrowUp', 'Up', G_NAV, false, ['Arrow Up']);
add('ArrowDown', 'Down', G_NAV, false, ['Arrow Down']);
add('ArrowLeft', 'Left', G_NAV, false, ['Arrow Left']);
add('ArrowRight', 'Right', G_NAV, false, ['Arrow Right']);
add('Home', 'Home', G_NAV, false);
add('End', 'End', G_NAV, false);
add('PageUp', 'PgUp', G_NAV, false, ['Page Up']);
add('PageDown', 'PgDn', G_NAV, false, ['Page Down']);
add('Insert', 'Ins', G_NAV, false);
add('Delete', 'Del', G_NAV, false);
add('Tab', 'Tab', G_EDIT, false);
add('Backspace', 'Backspace', G_EDIT, false, ['BS']);
add('Enter', 'Enter', G_EDIT, false, ['Return']);
add('Escape', 'Esc', G_EDIT, false);
add('Space', 'Space', G_EDIT, true);
add('Minus', '-', G_PUNCT, true);
add('Equal', '=', G_PUNCT, true);
add('BracketLeft', '[', G_PUNCT, true);
add('BracketRight', ']', G_PUNCT, true);
add('Backslash', '\\', G_PUNCT, true);
add('Semicolon', ';', G_PUNCT, true);
add('Quote', "'", G_PUNCT, true);
add('Backquote', '`', G_PUNCT, true);
add('Comma', ',', G_PUNCT, true);
add('Period', '.', G_PUNCT, true);
add('Slash', '/', G_PUNCT, true);
add('IntlBackslash', 'IntlBackslash', G_PUNCT, true);
add('IntlRo', 'IntlRo', G_PUNCT, true);
add('IntlYen', 'IntlYen', G_PUNCT, true);
add('Pause', 'Pause', G_OTHER, false);
add('ScrollLock', 'ScrollLock', G_OTHER, false);
add('PrintScreen', 'PrintScreen', G_OTHER, false);
add('ContextMenu', 'Menu', G_OTHER, false);

/** Codes that are only modifiers or locks: never a key on their own. */
const MODIFIER_CODES = new Set([
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
  'OSLeft',
  'OSRight',
  'CapsLock',
  'NumLock',
  'Fn',
  'FnLock',
]);

function keyPartFromCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return BY_NAME.has(code) ? code : null;
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

interface Parsed {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  key: string;
}

function build(p: Parsed): string {
  let s = '';
  if (p.ctrl) s += 'Ctrl+';
  if (p.alt) s += 'Alt+';
  if (p.shift) s += 'Shift+';
  if (p.meta) s += 'Meta+';
  return s + p.key;
}

function parseCanonical(name: string): Parsed | null {
  const parts = name.split('+');
  const key = parts.pop()!;
  if (!BY_NAME.has(key)) return null;
  const set = new Set(parts);
  return { ctrl: set.has('Ctrl'), alt: set.has('Alt'), shift: set.has('Shift'), meta: set.has('Meta'), key };
}

/** The canonical name for a keydown, or null for bare modifiers and unknown codes. */
export function keyNameFromEvent(e: KeyEventLike): string | null {
  if (MODIFIER_CODES.has(e.code)) return null;
  const key = keyPartFromCode(e.code);
  if (!key) return null;
  return build({ ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey, key });
}

const BROWSER_RESERVED = new Set(['Ctrl+W', 'Ctrl+T', 'Ctrl+N', 'Ctrl+Shift+W', 'Ctrl+Shift+T', 'Ctrl+Shift+N', 'Ctrl+Tab', 'Ctrl+Shift+Tab']);

/**
 * Whether a canonical key name can be bound to a macro (ADR 0015, ADR
 * 0026): bare ESC, Enter without Ctrl/Alt/Meta and the keys the browser
 * keeps are not. Printable keys are, bare or with Shift; a bound one no
 * longer types its character (`shadowedInputKey` says so).
 */
export function keyBindability(name: string): Bindability {
  const p = parseCanonical(name);
  if (!p) return { ok: false, name: null, reason: 'Unknown key.' };
  if (p.key === 'Escape' && !p.ctrl && !p.alt && !p.shift && !p.meta) {
    return { ok: false, name, reason: 'ESC opens the menu.' };
  }
  if (p.key === 'Enter' && !p.ctrl && !p.alt && !p.meta) return { ok: false, name, reason: 'Enter sends the input line.' };
  if (BROWSER_RESERVED.has(name)) return { ok: false, name, reason: 'The browser keeps that key.' };
  return { ok: true, name };
}

/** `keyBindability` for a keydown event; bare modifiers and unknown codes are not bindable. */
export function bindability(e: KeyEventLike): Bindability {
  const name = keyNameFromEvent(e);
  if (!name) return { ok: false, name: null, reason: MODIFIER_CODES.has(e.code) ? 'Press a key with the modifier.' : 'Unknown key.' };
  return keyBindability(name);
}

// ---------------------------------------------------------------------------
// tt++ escape forms
// ---------------------------------------------------------------------------

/** `\eO<x>` (SS3): numpad in application mode, PF1–PF4, cursor keys. */
const SS3: Record<string, string> = {
  p: 'Numpad0',
  q: 'Numpad1',
  r: 'Numpad2',
  s: 'Numpad3',
  t: 'Numpad4',
  u: 'Numpad5',
  v: 'Numpad6',
  w: 'Numpad7',
  x: 'Numpad8',
  y: 'Numpad9',
  n: 'NumpadDecimal',
  M: 'NumpadEnter',
  j: 'NumpadMultiply',
  k: 'NumpadAdd',
  l: 'NumpadComma',
  m: 'NumpadSubtract',
  o: 'NumpadDivide',
  X: 'NumpadEqual',
  P: 'F1',
  Q: 'F2',
  R: 'F3',
  S: 'F4',
  A: 'ArrowUp',
  B: 'ArrowDown',
  C: 'ArrowRight',
  D: 'ArrowLeft',
  H: 'Home',
  F: 'End',
};

/** `\e[<n>~` (and `\e[<n>;<mod>~`). */
const TILDE: Record<string, string> = {
  '1': 'Home',
  '2': 'Insert',
  '3': 'Delete',
  '4': 'End',
  '5': 'PageUp',
  '6': 'PageDown',
  '11': 'F1',
  '12': 'F2',
  '13': 'F3',
  '14': 'F4',
  '15': 'F5',
  '17': 'F6',
  '18': 'F7',
  '19': 'F8',
  '20': 'F9',
  '21': 'F10',
  '23': 'F11',
  '24': 'F12',
};

/** `\e[<x>` / `\e[1;<mod><x>` (CSI final letters). */
const CSI_FINAL: Record<string, string> = {
  A: 'ArrowUp',
  B: 'ArrowDown',
  C: 'ArrowRight',
  D: 'ArrowLeft',
  H: 'Home',
  F: 'End',
  P: 'F1',
  Q: 'F2',
  R: 'F3',
  S: 'F4',
  Z: 'Tab', // back-tab: Shift+Tab
};

const ESC_PREFIX = /^(?:\\e|\\x1b|\\033|\u001b)/i;

/** xterm modifier parameter: 1 + Shift(1) + Alt(2) + Ctrl(4) + Meta(8). */
function withXtermMods(key: string, mod: number): Parsed | null {
  const m = mod - 1;
  if (m < 0 || m > 15) return null;
  return { shift: (m & 1) !== 0, alt: (m & 2) !== 0, ctrl: (m & 4) !== 0, meta: (m & 8) !== 0, key };
}

function fromEscape(rest: string): Parsed | null {
  // rest: the text after the ESC.
  const plain = (key: string): Parsed => ({ ctrl: false, alt: false, shift: false, meta: false, key });
  if (rest.length === 2 && rest[0] === 'O') {
    const k = SS3[rest[1]!];
    return k ? plain(k) : null;
  }
  let m = /^\[(\d+)(?:;(\d+))?~$/.exec(rest);
  if (m) {
    const k = TILDE[m[1]!];
    if (!k) return null;
    return m[2] ? withXtermMods(k, Number(m[2])) : plain(k);
  }
  m = /^\[(?:1;(\d+))?([A-Z])$/.exec(rest);
  if (m) {
    const k = CSI_FINAL[m[2]!];
    if (!k) return null;
    if (m[2] === 'Z') return m[1] ? null : { ...plain('Tab'), shift: true };
    return m[1] ? withXtermMods(k, Number(m[1])) : plain(k);
  }
  m = /^O(\d+)([PQRS])$/.exec(rest); // some terminals: \eO2P = Shift+F1
  if (m) return withXtermMods(CSI_FINAL[m[2]!]!, Number(m[1]));
  if (rest.length === 1) {
    const c = rest;
    if (/^[a-z]$/.test(c)) return { ...plain(c.toUpperCase()), alt: true };
    if (/^[A-Z]$/.test(c)) return { ...plain(c), alt: true, shift: true };
    if (/^[0-9]$/.test(c)) return { ...plain(c), alt: true };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Normalise, display, sort
// ---------------------------------------------------------------------------

const MOD_WORDS: Record<string, keyof Omit<Parsed, 'key'>> = {
  ctrl: 'ctrl',
  control: 'ctrl',
  ctl: 'ctrl',
  alt: 'alt',
  option: 'alt',
  shift: 'shift',
  meta: 'meta',
  cmd: 'meta',
  super: 'meta',
  win: 'meta',
};

function parseName(text: string): Parsed | null {
  const p: Parsed = { ctrl: false, alt: false, shift: false, meta: false, key: '' };
  let rest = text.trim();
  for (;;) {
    const m = /^([a-z]+)\s*\+\s*/i.exec(rest);
    if (!m) break;
    const mod = MOD_WORDS[m[1]!.toLowerCase()];
    if (!mod || m[0].length === rest.length) break;
    p[mod] = true;
    rest = rest.slice(m[0].length);
  }
  const key = ALIASES.get(rest.toLowerCase()) ?? ALIASES.get(rest.toLowerCase().replace(/\s+/g, ' '));
  if (!key) return null;
  p.key = key;
  return p;
}

/**
 * Canonical name for a macro key as written in a profile, or null when it
 * is not a key we know. Accepts canonical names case-insensitively
 * (`alt+a`), display names (`Numpad 0`, `Numpad +`, `Alt+a`, `PgUp`),
 * `KeyboardEvent.code` spellings (`Ctrl+KeyA`), and the tt++ escape forms:
 * `\eOp`…`\eOy` numpad, `\eOP`–`\eOS` and `\e[11~`–`\e[14~` F1–F4,
 * `\e[15~`…`\e[24~` F5–F12, xterm modifier forms (`\e[15;5~`, `\e[1;2P`),
 * cursor keys, `\e<letter>` Alt+letter, `^G` Ctrl+letter. `\x1b`, `\033`
 * and a literal ESC byte count as `\e`.
 */
export function normalizeKey(text: string): string | null {
  const esc = ESC_PREFIX.exec(text);
  if (esc) {
    const p = fromEscape(text.slice(esc[0].length));
    return p ? build(p) : null;
  }
  const caret = /^\^([A-Za-z])$/.exec(text);
  if (caret) return build({ ctrl: true, alt: false, shift: false, meta: false, key: caret[1]!.toUpperCase() });
  const p = parseName(text);
  return p ? build(p) : null;
}

// Layout-aware labels (ADR 0026). Canonical names are physical keys
// (`KeyboardEvent.code`), so a profile means the same keys on every
// layout; only the label the UI shows follows the user's keyboard: on a
// Swedish layout `Backquote` shows as `§` and `Minus` as `+`. Filled from
// the Keyboard Map API where the browser has it (Chromium) and learned
// from plain keydowns. Only punctuation keys are relabelled; letters and
// digits keep their names. `normalizeKey` never looks at these labels.

/** Learned label per punctuation key part (`Minus` → `+`). */
const LEARNED = new Map<string, string>();

function learn(code: string, ch: string): boolean {
  const info = BY_NAME.get(code);
  if (!info || info.group !== G_PUNCT) return false;
  if ([...ch].length !== 1 || /[\s\p{C}]/u.test(ch)) return false;
  const label = ch.toLowerCase();
  if (LEARNED.get(code) === label) return false;
  LEARNED.set(code, label);
  return true;
}

/**
 * Learns what a punctuation key prints on this keyboard from a keydown
 * without Ctrl/Alt/Meta/Shift/AltGr whose `key` is one character. Dead
 * keys (`key` = `Dead`) teach nothing. Returns true when a label changed.
 */
export function learnKeyLabel(e: KeyEventLike & { getModifierState?: (k: string) => boolean }): boolean {
  if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return false;
  if (e.getModifierState?.('AltGraph')) return false;
  return learn(e.code, e.key);
}

interface KeyboardLayoutMapLike {
  forEach(cb: (value: string, key: string) => void): void;
}
interface NavigatorKeyboardLike {
  keyboard?: { getLayoutMap?: () => Promise<KeyboardLayoutMapLike> };
}

/**
 * Fills the labels from `navigator.keyboard.getLayoutMap()` when the
 * browser has it. Call once at start; failures are ignored.
 */
export async function initKeyLabels(nav: unknown = globalThis.navigator): Promise<void> {
  try {
    const map = await (nav as NavigatorKeyboardLike | undefined)?.keyboard?.getLayoutMap?.();
    map?.forEach((value, code) => learn(code, value));
  } catch {
    // No layout map (Firefox, Safari, insecure context): keep the defaults.
  }
}

/** Forgets every learned label (tests). */
export function resetKeyLabels(): void {
  LEARNED.clear();
}

/**
 * The name the UI shows for a canonical key (Inv §5.6): `F1`, `Numpad 0`,
 * `Numpad +`, `Alt+a`, `Ctrl+g`, `Ctrl+Shift+A`, `Up`, `PgDn`. A letter is
 * lower-case unless Shift is held. A punctuation key shows what this
 * keyboard prints when that is known (`§`, `Shift+§`, `Ctrl++`). Non-canonical
 * text is returned as is.
 */
export function displayKey(canonical: string): string {
  const p = parseCanonical(canonical);
  if (!p) return canonical;
  const info = BY_NAME.get(p.key)!;
  const key = info.group === G_LETTER && !p.shift ? p.key.toLowerCase() : (LEARNED.get(p.key) ?? info.display);
  return build({ ...p, key });
}

function sortTuple(text: string): [number, number, number] | null {
  const c = normalizeKey(text);
  const p = c ? parseCanonical(c) : null;
  if (!p) return null;
  const info = BY_NAME.get(p.key)!;
  const mods = (p.shift ? 1 : 0) | (p.alt ? 2 : 0) | (p.ctrl ? 4 : 0) | (p.meta ? 8 : 0);
  return [mods, info.group, info.order];
}

/**
 * Sort order for the lite macro list, over keys as written: keys without
 * modifiers first, then by modifier set (Shift, Alt, Alt+Shift, Ctrl,
 * Ctrl+Shift, Ctrl+Alt, …, Meta last); within a set: F-keys by number,
 * numpad (0–9, `.`, Enter, `*`, `+`, `-`, `/`, …), letters, digits,
 * navigation, editing keys, punctuation, others. So the list reads F1…F12,
 * Numpad 0…, then Alt+a…, then Ctrl+g…. Unknown keys go last, by text.
 */
export function compareKeys(a: string, b: string): number {
  const ta = sortTuple(a);
  const tb = sortTuple(b);
  if (!ta || !tb) {
    if (ta) return -1;
    if (tb) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  for (let i = 0; i < ta.length; i++) if (ta[i] !== tb[i]) return ta[i]! - tb[i]!;
  return 0;
}

// ---------------------------------------------------------------------------
// Input-line keys a macro would shadow
// ---------------------------------------------------------------------------

/**
 * Keys the input line uses (src/ui/input-pane.ts plus the native text
 * field's own editing keys), with what they do. A bound macro wins over
 * these (ADR 0015); the editor warns. Keys that are not bindable anyway
 * (Enter, ESC, Ctrl+W) are left out.
 */
export const INPUT_LINE_KEYS: ReadonlyMap<string, string> = new Map([
  ['NumpadEnter', 'sends the input line'],
  ['ArrowUp', 'history back'],
  ['ArrowDown', 'history forward'],
  ['Shift+ArrowUp', 'selects to the start'],
  ['Shift+ArrowDown', 'selects to the end'],
  ['ArrowLeft', 'moves the cursor'],
  ['ArrowRight', 'moves the cursor (takes the autosuggestion)'],
  ['Shift+ArrowLeft', 'extends the selection'],
  ['Shift+ArrowRight', 'extends the selection'],
  ['Ctrl+ArrowLeft', 'moves a word left'],
  ['Ctrl+ArrowRight', 'moves a word right'],
  ['Ctrl+Shift+ArrowLeft', 'selects a word left'],
  ['Ctrl+Shift+ArrowRight', 'selects a word right'],
  ['Home', 'moves to the start'],
  ['End', 'moves to the end (takes the autosuggestion)'],
  ['Shift+Home', 'selects to the start'],
  ['Shift+End', 'selects to the end'],
  ['PageUp', 'scrolls the output up'],
  ['PageDown', 'scrolls the output down'],
  ['Backspace', 'deletes a character'],
  ['Delete', 'deletes a character'],
  ['Ctrl+Backspace', 'deletes a word'],
  ['Ctrl+Delete', 'deletes a word'],
  ['Alt+Backspace', 'deletes a word'],
  ['Tab', 'moves focus (takes a word of the autosuggestion)'],
  ['Shift+Tab', 'moves focus'],
  ['Ctrl+A', 'selects all'],
  ['Ctrl+C', 'copies'],
  ['Ctrl+X', 'cuts'],
  ['Ctrl+V', 'pastes'],
  ['Ctrl+Z', 'undoes'],
  ['Ctrl+Y', 'redoes'],
  ['Ctrl+Shift+Z', 'redoes'],
  ['Ctrl+E', 'moves to the end'],
  ['Ctrl+D', 'does nothing (blocks the bookmark dialog)'],
  ['Alt+B', 'moves a word left'],
  ['Alt+F', 'moves a word right'],
  ['Alt+D', 'deletes a word'],
]);

/**
 * What the input line does with a canonical key a macro would take over,
 * or null. A printable key without Ctrl/Alt/Meta (bare or with Shift)
 * `types text` (ADR 0026).
 */
export function shadowedInputKey(canonical: string): string | null {
  const known = INPUT_LINE_KEYS.get(canonical);
  if (known) return known;
  const p = parseCanonical(canonical);
  if (p && BY_NAME.get(p.key)!.printable && !p.ctrl && !p.alt && !p.meta) return 'types text';
  return null;
}
