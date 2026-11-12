// @vitest-environment happy-dom
// ADR 0139 §4 (round 53f): a key our own keyboard sends to a field of a
// phone's page is a marked synthetic keydown. The frame stack and the
// fields' handlers take it as a key; the script engine's key handling
// (macro matching, key label learning) and the input pane's Enter
// bookkeeping must not.
import { afterEach, describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import {
  OWN_FIELD_KIND_ATTR,
  isOwnKey,
  onPageKeyboardUp,
  ownFieldAttrs,
  pageKeyboard,
  pageKeyboardUp,
  sendOwnKey,
  setPageKeyboard,
  setPageKeyboardUp,
} from '../../src/core/own-keyboard';
import { HerbMenu } from '../../src/panes/timers';
import type { PlayerEngine } from '../../src/player/engine';
import { PlayerView } from '../../src/player/view';
import type { Sender } from '../../src/core/types';
import { bindability, displayKey, keyNameFromEvent, learnKeyLabel, resetKeyLabels } from '../../src/script/keys';
import { InputPane } from '../../src/ui/input-pane';

afterEach(() => {
  document.body.innerHTML = '';
  setPageKeyboard(false);
  resetKeyLabels();
});

function field(): HTMLInputElement {
  const el = document.createElement('input');
  document.body.append(el);
  return el;
}

/** The keydown `sendOwnKey` makes for `key`, as a listener on the field gets it. */
function ownKeydown(el: Element, key: 'Enter' | 'Escape'): KeyboardEvent {
  let got: KeyboardEvent | null = null;
  el.addEventListener('keydown', (e) => (got = e as KeyboardEvent), { once: true });
  sendOwnKey(el, key);
  return got!;
}

describe('sendOwnKey: a marked key event', () => {
  it('sends a bubbling, cancelable keydown and keyup at the field, both marked', () => {
    const el = field();
    const seen: Array<{ type: string; key: string; code: string; own: boolean; target: EventTarget | null }> = [];
    const on = (e: Event): void => {
      seen.push({ type: e.type, key: (e as KeyboardEvent).key, code: (e as KeyboardEvent).code, own: isOwnKey(e), target: e.target });
    };
    window.addEventListener('keydown', on, true);
    window.addEventListener('keyup', on, true);
    expect(sendOwnKey(el, 'Enter')).toBe(true);
    window.removeEventListener('keydown', on, true);
    window.removeEventListener('keyup', on, true);
    expect(seen).toEqual([
      { type: 'keydown', key: 'Enter', code: 'Enter', own: true, target: el },
      { type: 'keyup', key: 'Enter', code: 'Enter', own: true, target: el },
    ]);
  });

  it('says whether a handler took the key', () => {
    const el = field();
    el.addEventListener('keydown', (e) => e.preventDefault());
    expect(sendOwnKey(el, 'Enter')).toBe(false);
  });

  it('a key event of any other origin is not marked', () => {
    expect(isOwnKey(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter' }))).toBe(false);
    expect(isOwnKey({ key: 'Enter', code: 'Enter' })).toBe(false);
  });
});

describe('the script engine ignores a marked key', () => {
  it('it has no key name, so no macro matches it and it cannot be bound', () => {
    const el = field();
    expect(keyNameFromEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter' }))).toBe('Enter');
    const own = ownKeydown(el, 'Enter');
    expect(own.code).toBe('Enter');
    expect(keyNameFromEvent(own)).toBeNull();
    expect(bindability(own).ok).toBe(false);
    expect(keyNameFromEvent(ownKeydown(el, 'Escape'))).toBeNull();
  });

  it('it teaches no key label', () => {
    const own = ownKeydown(field(), 'Enter');
    // Made to look like a punctuation key, which a physical keyboard teaches a label with: only
    // the mark tells it apart.
    Object.defineProperty(own, 'code', { value: 'Minus' });
    Object.defineProperty(own, 'key', { value: '?' });
    expect(isOwnKey(own)).toBe(true);
    expect(learnKeyLabel(own)).toBe(false);
    expect(displayKey('Minus')).not.toBe('?');
    // The same key from a physical keyboard does teach.
    expect(learnKeyLabel({ code: 'Minus', key: '?', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })).toBe(true);
    expect(displayKey('Minus')).toBe('?');
  });
});

describe('the input pane ignores a marked key', () => {
  function setup() {
    const bus = new Bus();
    const root = document.createElement('div');
    document.body.appendChild(root);
    const sent: string[] = [];
    const sender: Sender = { sendCommand: (text) => sent.push(text), sendGmcp: () => {} };
    const pane = new InputPane(bus, root, { sender, phone: true });
    pane.focus();
    return { pane, sent };
  }
  const lineBreak = (el: HTMLElement): void => {
    el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertLineBreak', bubbles: true, cancelable: true }));
  };

  it('a marked Enter sends nothing, whether aimed at a page\'s field or at the line itself', () => {
    const t = setup();
    t.pane.insertText('look');
    sendOwnKey(field(), 'Enter');
    expect(t.sent).toEqual([]);
    sendOwnKey(t.pane.input, 'Enter');
    expect(t.sent).toEqual([]);
    // A real Enter still sends.
    t.pane.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    expect(t.sent).toEqual(['look']);
  });

  it('`enterDown` does not follow it: an on-screen Enter that comes as a bare line break still sends', () => {
    const t = setup();
    t.pane.insertText('north');
    // The marked keydown alone (its keyup is ignored too, so nothing would clear a flag it set).
    const win = document.defaultView!;
    const el = field();
    let down: KeyboardEvent | null = null;
    win.addEventListener('keydown', (e) => (down = e), { capture: true, once: true });
    sendOwnKey(el, 'Enter');
    expect(isOwnKey(down!)).toBe(true);
    lineBreak(t.pane.input);
    expect(t.sent).toEqual(['north']);
  });

  it('a real Enter keydown is still followed: the line break after it is dropped', () => {
    const t = setup();
    // (Aimed at another field, so the line does not send on the keydown itself.)
    const other = field();
    other.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    t.pane.insertText('south');
    lineBreak(t.pane.input);
    expect(t.sent).toEqual([]);
  });
});

describe('the pages\' keyboard flag and the fields\' mark', () => {
  it('is off by default: a field gets no attribute (desktop, tablet, `?kbd=0`)', () => {
    expect(pageKeyboard()).toBe(false);
    expect(ownFieldAttrs()).toEqual({});
    expect(ownFieldAttrs('digits')).toEqual({});
  });

  it('on: a field asks the device for no keyboard; a numeric one says so', () => {
    setPageKeyboard(true);
    expect(ownFieldAttrs()).toEqual({ inputmode: 'none', virtualkeyboardpolicy: 'manual' });
    expect(ownFieldAttrs('digits')).toEqual({ inputmode: 'none', virtualkeyboardpolicy: 'manual', [OWN_FIELD_KIND_ATTR]: 'digits' });
  });

  it('`pageKeyboardUp` follows the mount, and falls with the flag', () => {
    setPageKeyboard(true);
    setPageKeyboardUp(true);
    expect(pageKeyboardUp()).toBe(true);
    setPageKeyboard(false);
    expect(pageKeyboardUp()).toBe(false);
  });
});

// Round 53g: Esc and Tab are sent too; a multi-line field says so; a page can follow the keyboard.
describe('round 53g: Esc, Tab, the multi-line mark, and who hears the keyboard come and go', () => {
  it('Tab is sent with Shift when asked, Escape without; both marked', () => {
    const el = field();
    const seen: string[] = [];
    el.addEventListener('keydown', (e) => seen.push(`${e.key}:${e.shiftKey}:${isOwnKey(e)}`));
    sendOwnKey(el, 'Tab');
    sendOwnKey(el, 'Tab', { shift: true });
    sendOwnKey(el, 'Escape');
    expect(seen).toEqual(['Tab:false:true', 'Tab:true:true', 'Escape:false:true']);
  });

  it('a multi-line field is marked with its kind; nothing where the keyboard is not ours', () => {
    expect(ownFieldAttrs('lines')).toEqual({});
    setPageKeyboard(true);
    expect(ownFieldAttrs('lines')).toEqual({ inputmode: 'none', virtualkeyboardpolicy: 'manual', [OWN_FIELD_KIND_ATTR]: 'lines' });
  });

  it('`onPageKeyboardUp` tells of each change once, and of the fall with the flag', () => {
    setPageKeyboard(true);
    const seen: boolean[] = [];
    const off = onPageKeyboardUp((up) => seen.push(up));
    setPageKeyboardUp(true);
    setPageKeyboardUp(true);
    setPageKeyboardUp(false);
    setPageKeyboardUp(true);
    setPageKeyboard(false);
    expect(seen).toEqual([true, false, true, false]);
    off();
    setPageKeyboard(true);
    setPageKeyboardUp(true);
    expect(seen).toHaveLength(4);
  });

  it('the Timers pane\'s herb menu does not take the Esc our keyboard sends to a page (53f review)', () => {
    const anchor = document.createElement('button');
    document.body.append(anchor);
    let closed = 0;
    const menu = new HerbMenu(document, () => {}, () => closed++);
    menu.show(anchor, [{ key: 'a', name: 'Athelas', active: false }]);
    expect(menu.open).toBe(true);
    const el = field();
    const free = sendOwnKey(el, 'Escape');
    expect(menu.open).toBe(true);
    expect(free).toBe(true);
    // A real Esc closes it, as ever.
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(menu.open).toBe(false);
  });
});

describe('the log player and the keys our keyboard sends to a page (53f review)', () => {
  it('leaves a marked key aimed at a page\'s field to the page; a physical key, and a marked one inside the player, are the player\'s', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const engine = {
      playing: false,
      seeking: false,
      speed: 1,
      duration: 0,
      position: 0,
      run: 0,
      subscribe: () => () => {},
      play: () => {},
      pause: () => {},
      seek: () => {},
      setSpeed: () => {},
    } as unknown as PlayerEngine;
    let escs = 0;
    const view = new PlayerView({
      root,
      engine,
      header: () => ({}) as never,
      marks: [],
      output: () => null,
      cells: () => ({ w: 8, h: 16 }),
      onEsc: () => escs++,
      bare: true,
    });
    try {
      // A field of a page beside the player (not inside its root).
      const el = field();
      let reached = 0;
      el.addEventListener('keydown', () => reached++);
      sendOwnKey(el, 'Escape');
      expect(escs).toBe(0);
      expect(reached).toBe(1);
      // A physical Esc from the same place is the player's, as ever (it owns the keyboard).
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      expect(escs).toBe(1);
      expect(reached).toBe(1);
      // And so is a marked key aimed at something inside the player.
      const inside = document.createElement('input');
      root.append(inside);
      sendOwnKey(inside, 'Escape');
      expect(escs).toBe(2);
    } finally {
      view.dispose();
    }
  });
});
