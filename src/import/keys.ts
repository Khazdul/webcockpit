// Foreign key names and terminal byte sequences → our canonical macro key
// names (ADR 0073; research `tintin.md` §3, `jmc.md` §2, `powwow.md` §4.7).
// What `src/script/keys.ts` already parses is delegated to it.

import { keyBindability, normalizeKey } from '../script/keys';

export type KeyResult = { ok: true; key: string; warning?: string } | { ok: false; reason: string };

function bindable(key: string, warning?: string): KeyResult {
  const b = keyBindability(key);
  if (!b.ok) return { ok: false, reason: `Key ${key} cannot be bound: ${b.reason}` };
  return warning ? { ok: true, key, warning } : { ok: true, key };
}

// ---------------------------------------------------------------------------
// JMC key names: `Ctrl+F1`, `Alt+A`, `NUM5`, `PGUP` …
// ---------------------------------------------------------------------------

const JMC_KEYS: Record<string, string> = {
  num0: 'Numpad0',
  num1: 'Numpad1',
  num2: 'Numpad2',
  num3: 'Numpad3',
  num4: 'Numpad4',
  num5: 'Numpad5',
  num6: 'Numpad6',
  num7: 'Numpad7',
  num8: 'Numpad8',
  num9: 'Numpad9',
  numdel: 'NumpadDecimal',
  add: 'NumpadAdd',
  min: 'NumpadSubtract',
  mul: 'NumpadMultiply',
  div: 'NumpadDivide',
  ins: 'Insert',
  del: 'Delete',
  home: 'Home',
  end: 'End',
  pgup: 'PageUp',
  pgdn: 'PageDown',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  esc: 'Escape',
  tab: 'Tab',
  back: 'Backspace',
  sp: 'Space',
  space: 'Space',
  return: 'Enter',
  enter: 'Enter',
};

/** A JMC hotkey name (`Ctrl+F1`, `Alt+A`, `NUM5`, `Shift+PGUP`) as our key name. */
export function jmcKey(name: string): KeyResult {
  const parts = name.trim().split('+');
  let key = parts.pop() ?? '';
  // `Ctrl++` (the plus key): the split leaves an empty key.
  if (key === '' && parts.length > 0 && parts[parts.length - 1] === '') {
    parts.pop();
    key = '+';
  }
  const mods: string[] = [];
  for (const p of parts) {
    const m = p.trim().toLowerCase();
    if (m === 'ctrl' || m === 'control') mods.push('Ctrl');
    else if (m === 'alt') mods.push('Alt');
    else if (m === 'shift') mods.push('Shift');
    else return { ok: false, reason: `Unknown key ${name}` };
  }
  const mapped = JMC_KEYS[key.trim().toLowerCase()] ?? key.trim();
  const order = ['Ctrl', 'Alt', 'Shift'].filter((m) => mods.includes(m));
  const canonical = normalizeKey([...order, mapped].join('+'));
  if (!canonical) return { ok: false, reason: `Unknown key ${name}` };
  return bindable(canonical);
}

// ---------------------------------------------------------------------------
// Terminal byte sequences (Powwow `#bind`, tt++ `#macro`)
// ---------------------------------------------------------------------------

/**
 * Powwow's sequence notation → raw text: `^[` ESC, `^X` control
 * characters, `^?` DEL, `\ooo` octal, `\x` a literal x.
 */
export function unescapeSequence(seq: string): string {
  let s = '';
  for (let i = 0; i < seq.length; i++) {
    const c = seq[i]!;
    if (c === '^' && i + 1 < seq.length) {
      const d = seq[i + 1]!;
      if (d === '?') s += '\x7f';
      else if (/[@-_a-z]/.test(d)) s += String.fromCharCode(d.toUpperCase().charCodeAt(0) & 0x1f);
      else {
        s += c;
        continue;
      }
      i++;
      continue;
    }
    if (c === '\\' && i + 1 < seq.length) {
      const oct = /^[0-7]{3}/.exec(seq.slice(i + 1));
      if (oct) {
        s += String.fromCharCode(parseInt(oct[0], 8));
        i += 3;
      } else if (seq[i + 1] === 'e') {
        s += '\x1b';
        i++;
      } else {
        s += seq[i + 1];
        i++;
      }
      continue;
    }
    s += c;
  }
  return s;
}

const F_RXVT_SHIFT: Record<string, string> = {
  '25': 'F3',
  '26': 'F4',
  '28': 'F5',
  '29': 'F6',
  '31': 'F7',
  '32': 'F8',
  '33': 'F9',
  '34': 'F10',
};
const LINUX_F: Record<string, string> = { A: 'F1', B: 'F2', C: 'F3', D: 'F4', E: 'F5' };
const ARROW: Record<string, string> = { a: 'ArrowUp', b: 'ArrowDown', c: 'ArrowRight', d: 'ArrowLeft', A: 'ArrowUp', B: 'ArrowDown', C: 'ArrowRight', D: 'ArrowLeft' };
const TILDE_KEYS: Record<string, string> = {
  '1': 'Home',
  '2': 'Insert',
  '3': 'Delete',
  '4': 'End',
  '5': 'PageUp',
  '6': 'PageDown',
  '7': 'Home',
  '8': 'End',
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

/** Forms `src/script/keys.ts` does not know: Linux console, rxvt, ESC-prefixed Alt. */
function extraEscape(rest: string): KeyResult | null {
  let m = /^\[\[([A-E])$/.exec(rest);
  if (m) return bindable(LINUX_F[m[1]!]!);
  m = /^\[(\d+)([$^@])$/.exec(rest); // rxvt: $ Shift, ^ Ctrl, @ Ctrl+Shift
  if (m) {
    const k = TILDE_KEYS[m[1]!];
    if (!k) return null;
    const mod = m[2] === '$' ? 'Shift+' : m[2] === '^' ? 'Ctrl+' : 'Ctrl+Shift+';
    return bindable(normalizeKey(mod + k) ?? mod + k);
  }
  m = /^\[([78])~$/.exec(rest);
  if (m) return bindable(m[1] === '7' ? 'Home' : 'End');
  m = /^\[(2[5-9]|3[0-4])~$/.exec(rest);
  if (m && F_RXVT_SHIFT[m[1]!]) return bindable(`Shift+${F_RXVT_SHIFT[m[1]!]!}`, 'Read as an rxvt Shift+F-key.');
  m = /^\[([a-d])$/.exec(rest); // rxvt Shift+arrow
  if (m) return bindable(`Shift+${ARROW[m[1]!]!}`);
  m = /^O([a-d])$/.exec(rest); // rxvt Ctrl+arrow
  if (m) return bindable(`Ctrl+${ARROW[m[1]!]!}`);
  m = /^\x1b(\[|O)([A-D])$/.exec(rest); // ESC-prefixed: Alt+arrow
  if (m) return bindable(`Alt+${ARROW[m[2]!]!}`);
  return null;
}

/**
 * A key written as a terminal sequence (raw bytes, or the `\e`, `^[`,
 * `\033` notations) as our canonical key name. Plain key names are
 * accepted as well.
 */
export function sequenceKey(seq: string): KeyResult {
  const raw = unescapeSequence(seq.replace(/\\x1b/gi, '\x1b'));
  if (raw.startsWith('\x1b')) {
    const rest = raw.slice(1);
    const extra = extraEscape(rest);
    if (extra) {
      if (extra.ok && (rest === '[23~' || rest === '[24~')) return { ...extra, warning: 'Read as xterm F11/F12 (rxvt sends this for Shift+F1/F2).' };
      return extra;
    }
    const k = normalizeKey('\x1b' + rest);
    if (k) {
      if (rest === '[23~' || rest === '[24~') return bindable(k, 'Read as xterm F11/F12 (rxvt sends this for Shift+F1/F2).');
      return bindable(k);
    }
    return { ok: false, reason: `Unknown key sequence ${seq}` };
  }
  if (raw.length === 1) {
    const code = raw.charCodeAt(0);
    if (code === 0x7f) return bindable('Backspace');
    if (code === 9) return bindable('Tab');
    if (code < 0x20) return bindable(`Ctrl+${String.fromCharCode(code + 64)}`);
  }
  const k = normalizeKey(seq);
  if (k) return bindable(k);
  return { ok: false, reason: `Unknown key sequence ${seq}` };
}

// ---------------------------------------------------------------------------
// Qt key codes (Mudlet `keyCode` + `keyModifier`, research `mudlet.md` §5)
// ---------------------------------------------------------------------------

const QT_SHIFT = 0x02000000;
const QT_CTRL = 0x04000000;
const QT_ALT = 0x08000000;
const QT_META = 0x10000000;
const QT_KEYPAD = 0x20000000;

/** Qt::Key values from 0x01000000 (Key_Escape) on. */
const QT_SPECIAL: Record<number, string> = {
  0x00: 'Escape',
  0x01: 'Tab',
  0x03: 'Backspace',
  0x04: 'Enter',
  0x05: 'Enter',
  0x06: 'Insert',
  0x07: 'Delete',
  0x08: 'Pause',
  0x09: 'PrintScreen',
  0x10: 'Home',
  0x11: 'End',
  0x12: 'ArrowLeft',
  0x13: 'ArrowUp',
  0x14: 'ArrowRight',
  0x15: 'ArrowDown',
  0x16: 'PageUp',
  0x17: 'PageDown',
  0x26: 'ScrollLock',
  0x55: 'ContextMenu',
};

/** With the keypad bit: what the key is on the numeric keypad. */
const QT_KEYPAD_KEYS: Record<string, string> = {
  '+': 'NumpadAdd',
  '-': 'NumpadSubtract',
  '*': 'NumpadMultiply',
  '/': 'NumpadDivide',
  '.': 'NumpadDecimal',
  ',': 'NumpadComma',
  '=': 'NumpadEqual',
  Enter: 'NumpadEnter',
  // NumLock off: the keypad sends navigation keys.
  Insert: 'Numpad0',
  End: 'Numpad1',
  ArrowDown: 'Numpad2',
  PageDown: 'Numpad3',
  ArrowLeft: 'Numpad4',
  Clear: 'Numpad5',
  ArrowRight: 'Numpad6',
  Home: 'Numpad7',
  ArrowUp: 'Numpad8',
  PageUp: 'Numpad9',
  Delete: 'NumpadDecimal',
};

/** Unshifted US punctuation keys by character. */
const QT_PUNCT: Record<string, string> = {
  ' ': 'Space',
  '-': 'Minus',
  '=': 'Equal',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '\\': 'Backslash',
  ';': 'Semicolon',
  "'": 'Quote',
  '`': 'Backquote',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
};

/**
 * A Mudlet key (Qt `keyCode` and `keyModifier` bitmask) as our canonical
 * key name: F-keys, navigation keys, `Numpad8` for keypad keys, letters,
 * digits and US punctuation. Other printable characters depend on the
 * keyboard layout and are refused with that reason.
 */
export function qtKey(keyCode: number, modifiers: number): KeyResult {
  let key: string | null = null;
  if (keyCode >= 0x01000000) {
    const off = keyCode - 0x01000000;
    if (off >= 0x30 && off <= 0x47) key = `F${off - 0x30 + 1}`;
    else if (off === 0x0b) key = 'Clear';
    else key = QT_SPECIAL[off] ?? null;
    if (key === null) return { ok: false, reason: `Unknown Qt key code ${keyCode}` };
  } else {
    const ch = String.fromCharCode(keyCode);
    if (/[A-Z0-9]/.test(ch)) key = ch;
    else if (/[a-z]/.test(ch)) key = ch.toUpperCase();
    else if (QT_PUNCT[ch]) key = QT_PUNCT[ch]!;
    else if (!(modifiers & QT_KEYPAD) || !QT_KEYPAD_KEYS[ch]) {
      return { ok: false, reason: `Key ${keyCode > 32 ? `'${ch}' ` : ''}(code ${keyCode}) depends on the keyboard layout` };
    } else key = ch;
  }
  if (modifiers & QT_KEYPAD) {
    if (/^[0-9]$/.test(key)) key = `Numpad${key}`;
    else if (QT_KEYPAD_KEYS[key]) key = QT_KEYPAD_KEYS[key]!;
  }
  if (key === 'Clear') return { ok: false, reason: 'Key Clear (keypad 5 without NumLock) has no name here' };
  let name = '';
  if (modifiers & QT_CTRL) name += 'Ctrl+';
  if (modifiers & QT_ALT) name += 'Alt+';
  if (modifiers & QT_SHIFT) name += 'Shift+';
  if (modifiers & QT_META) name += 'Meta+';
  const canonical = normalizeKey(name + key);
  if (!canonical) return { ok: false, reason: `Unknown key ${name}${key}` };
  return bindable(canonical);
}
