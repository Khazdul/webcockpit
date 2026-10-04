// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Bus } from '../../src/core/bus';
import type { Sender } from '../../src/core/types';
import {
  BLINK_MS,
  InputPane,
  MAX_HISTORY,
  type ScrollTarget,
  nextSuggestedWord,
  normalizePaste,
  spaceWordStartBefore,
  suggestFrom,
  wordEndAfter,
  wordStartBefore,
} from '../../src/ui/input-pane';
import { AppStatus, formatLink, formatStatus } from '../../src/app/status';

function setup(onCommand?: (t: string) => boolean) {
  document.body.innerHTML = '';
  const bus = new Bus();
  const root = document.createElement('div');
  document.body.appendChild(root);
  const sent: Array<{ text: string; opts?: { secret?: boolean; echo?: boolean } }> = [];
  const sender: Sender = {
    sendCommand: (text, opts) => sent.push(opts ? { text, opts } : { text }),
    sendGmcp: () => {},
  };
  let scrolled = false;
  const output: ScrollTarget & { calls: string[] } = {
    calls: [],
    pageUp() {
      this.calls.push('pageUp');
      scrolled = true;
    },
    pageDown() {
      this.calls.push('pageDown');
    },
    toTail() {
      this.calls.push('toTail');
      scrolled = false;
    },
    isScrolled: () => scrolled,
  };
  const onEscape = vi.fn();
  const pane = new InputPane(bus, root, { sender, output, onEscape, onCommand });
  pane.focus();
  const i = pane.input;
  const type = (s: string) => {
    i.value = s;
    i.setSelectionRange(s.length, s.length);
    i.dispatchEvent(new Event('input'));
  };
  const key = (k: string, init: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
    i.dispatchEvent(e);
    return e;
  };
  const selected = () => [i.selectionStart, i.selectionEnd];
  return { bus, pane, i, sent, sender, output, onEscape, type, key, selected };
}

describe('InputPane Enter semantics', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('sends a non-empty buffer and refills it fully selected', () => {
    const t = setup();
    t.type('look');
    t.key('Enter');
    expect(t.sent).toEqual([{ text: 'look' }]);
    expect(t.i.value).toBe('look');
    expect(t.selected()).toEqual([0, 4]);
    expect(t.pane.isRecallState()).toBe(true);
  });

  it('Enter in recall state sends the same text again', () => {
    const t = setup();
    t.type('kill orc');
    t.key('Enter');
    t.key('Enter');
    expect(t.sent.map((s) => s.text)).toEqual(['kill orc', 'kill orc']);
    expect(t.pane.getHistory()).toEqual(['kill orc']);
  });

  it('empty Enter sends a bare newline and never repeats', () => {
    const t = setup();
    t.type('');
    t.key('Enter');
    expect(t.sent).toEqual([{ text: '' }]);
    expect(t.pane.getHistory()).toEqual([]);
  });

  it('snaps the output to the tail after the send, only when scrolled back', () => {
    const t = setup();
    const order: string[] = [];
    const send = t.sender.sendCommand;
    t.sender.sendCommand = (text, opts) => {
      order.push('send');
      send(text, opts);
    };
    const toTail = t.output.toTail;
    t.output.toTail = function () {
      order.push('toTail');
      toTail.call(this);
    };
    t.type('look');
    t.key('Enter');
    expect(order).toEqual(['send']);
    t.key('PageUp');
    t.key('Enter');
    expect(order).toEqual(['send', 'send', 'toTail']);
    expect(t.output.calls).toEqual(['pageUp', 'toTail']);
    t.key('PageUp');
    t.bus.emit('telnet.echo', { serverEchoes: true });
    t.type('secret');
    t.key('Enter');
    expect(order).toEqual(['send', 'send', 'toTail', 'send', 'toTail']);
  });

  it('routes handled built-in commands away from the sender', () => {
    const t = setup((s) => s.startsWith('#'));
    t.type('#connect');
    t.key('Enter');
    expect(t.sent).toEqual([]);
    expect(t.pane.getHistory()).toEqual(['#connect']);
  });
});

describe('InputPane history', () => {
  function sendAll(t: ReturnType<typeof setup>, cmds: string[]) {
    for (const c of cmds) {
      t.type(c);
      t.key('Enter');
    }
  }

  it(`keeps the newest ${MAX_HISTORY} entries`, () => {
    const t = setup();
    sendAll(
      t,
      Array.from({ length: MAX_HISTORY + 5 }, (_, n) => `cmd ${n}`),
    );
    const h = t.pane.getHistory();
    expect(h.length).toBe(MAX_HISTORY);
    expect(h[0]).toBe('cmd 5');
    expect(h.at(-1)).toBe(`cmd ${MAX_HISTORY + 4}`);
    // Browsing still walks the kept entries and clamps at the oldest.
    t.type('');
    t.key('ArrowUp');
    expect(t.i.value).toBe(`cmd ${MAX_HISTORY + 4}`);
    for (let n = 0; n < MAX_HISTORY + 3; n++) t.key('ArrowUp');
    expect(t.i.value).toBe('cmd 5');
    t.key('ArrowDown');
    expect(t.i.value).toBe('cmd 6');
  });

  it('dedups only consecutive entries', () => {
    const t = setup();
    sendAll(t, ['look', 'look', 'look', 'north', 'look']);
    expect(t.pane.getHistory()).toEqual(['look', 'north', 'look']);
  });

  it('Up from recall state skips the entry already shown', () => {
    const t = setup();
    sendAll(t, ['a', 'b', 'c']);
    t.key('ArrowUp');
    expect(t.i.value).toBe('b');
    expect(t.selected()).toEqual([0, 1]);
  });

  it('Up from a draft saves it, shows newest, clamps at oldest', () => {
    const t = setup();
    sendAll(t, ['a', 'b']);
    t.type('dra');
    t.key('ArrowUp');
    expect(t.i.value).toBe('b');
    t.key('ArrowUp');
    expect(t.i.value).toBe('a');
    t.key('ArrowUp');
    expect(t.i.value).toBe('a');
    t.key('ArrowDown');
    expect(t.i.value).toBe('b');
    t.key('ArrowDown');
    expect(t.i.value).toBe('dra');
    expect(t.selected()).toEqual([3, 3]);
    t.key('ArrowDown');
    expect(t.i.value).toBe('');
  });

  it('Down when not browsing does nothing', () => {
    const t = setup();
    sendAll(t, ['a']);
    t.type('x');
    t.key('ArrowDown');
    expect(t.i.value).toBe('x');
  });

  it('any edit ends browsing', () => {
    const t = setup();
    sendAll(t, ['a', 'b', 'c']);
    t.type('');
    t.key('ArrowUp');
    t.key('ArrowUp');
    expect(t.i.value).toBe('b');
    t.type('bx');
    t.key('ArrowDown');
    expect(t.i.value).toBe('bx');
    t.key('ArrowUp');
    expect(t.i.value).toBe('c');
  });

  it('Shift+Up/Down select to start/end', () => {
    const t = setup();
    t.type('hello');
    t.i.setSelectionRange(2, 2);
    t.key('ArrowUp', { shiftKey: true });
    expect(t.selected()).toEqual([0, 2]);
    t.i.setSelectionRange(2, 2);
    t.key('ArrowDown', { shiftKey: true });
    expect(t.selected()).toEqual([2, 5]);
  });
});

describe('InputPane password mode', () => {
  it('sends secret, keeps it out of history and clears the buffer', () => {
    const t = setup();
    t.bus.emit('telnet.echo', { serverEchoes: true });
    expect(t.pane.isPasswordMode()).toBe(true);
    t.type('hunter2');
    const mask = t.pane.el.querySelector('.wc-input-mask')!;
    expect(mask.textContent).toBe('•••••••');
    expect(t.i.classList.contains('wc-masked')).toBe(true);
    t.key('Enter');
    expect(t.sent).toEqual([{ text: 'hunter2', opts: { secret: true } }]);
    expect(t.pane.getHistory()).toEqual([]);
    expect(t.i.value).toBe('');
    t.key('ArrowUp');
    expect(t.i.value).toBe('');
    t.bus.emit('telnet.echo', { serverEchoes: false });
    expect(t.pane.isPasswordMode()).toBe(false);
    expect(t.i.classList.contains('wc-masked')).toBe(false);
  });

  it('entering password mode clears a recalled command', () => {
    const t = setup();
    t.type('Ole');
    t.key('Enter');
    t.bus.emit('telnet.echo', { serverEchoes: true });
    expect(t.i.value).toBe('');
  });
});

describe('InputPane keys', () => {
  it('ESC leaves scroll mode first, then calls onEscape', () => {
    const t = setup();
    t.key('PageUp');
    t.key('Escape');
    expect(t.output.calls).toEqual(['pageUp', 'toTail']);
    expect(t.onEscape).not.toHaveBeenCalled();
    t.key('Escape');
    expect(t.onEscape).toHaveBeenCalledTimes(1);
  });

  it('PageDown goes to the output', () => {
    const t = setup();
    const e = t.key('PageDown');
    expect(t.output.calls).toEqual(['pageDown']);
    expect(e.defaultPrevented).toBe(true);
  });

  it('Ctrl+A selects all, Ctrl+E goes to end, Ctrl+D is a no-op', () => {
    const t = setup();
    t.type('abc def');
    t.key('a', { code: 'KeyA', ctrlKey: true });
    expect(t.selected()).toEqual([0, 7]);
    t.key('e', { code: 'KeyE', ctrlKey: true });
    expect(t.selected()).toEqual([7, 7]);
    const e = t.key('d', { code: 'KeyD', ctrlKey: true });
    expect(e.defaultPrevented).toBe(true);
    expect(t.i.value).toBe('abc def');
  });

  it('Ctrl+W and Alt+Backspace delete a word back', () => {
    const t = setup();
    t.type('cast foo.bar ');
    t.key('w', { code: 'KeyW', ctrlKey: true });
    expect(t.i.value).toBe('cast ');
    t.type('cast foo.bar');
    t.key('Backspace', { code: 'Backspace', altKey: true });
    expect(t.i.value).toBe('cast foo.');
  });

  it('Alt+B/F move by word, Alt+D deletes forward', () => {
    const t = setup();
    t.type('kill orc now');
    t.key('b', { code: 'KeyB', altKey: true });
    expect(t.selected()).toEqual([9, 9]);
    t.key('b', { code: 'KeyB', altKey: true });
    expect(t.selected()).toEqual([5, 5]);
    t.key('f', { code: 'KeyF', altKey: true });
    expect(t.selected()).toEqual([8, 8]);
    t.i.setSelectionRange(4, 4);
    t.key('d', { code: 'KeyD', altKey: true });
    expect(t.i.value).toBe('kill now');
  });

  it('a macro runs before the refocus, then the input gets the focus', () => {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.appendChild(root);
    let focusedAtMacro: Element | null = null;
    const pane = new InputPane(new Bus(), root, {
      sender: { sendCommand: () => {}, sendGmcp: () => {} },
      onMacroKey: (k) => {
        if (k !== 'F1') return false;
        focusedAtMacro = document.activeElement;
        return true;
      },
    });
    pane.input.blur();
    const e = new KeyboardEvent('keydown', { key: 'F1', code: 'F1', bubbles: true, cancelable: true });
    document.body.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(focusedAtMacro).not.toBe(pane.input);
    expect(document.activeElement).toBe(pane.input);
    pane.dispose();
  });

  it('a macro that moves the focus keeps it there', () => {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    const other = document.createElement('button');
    document.body.append(root, other);
    const pane = new InputPane(new Bus(), root, {
      sender: { sendCommand: () => {}, sendGmcp: () => {} },
      onMacroKey: () => {
        other.focus();
        return true;
      },
    });
    pane.input.blur();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', code: 'F1', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(other);
    pane.dispose();
  });

  it('keys typed while focus is elsewhere land in the input', () => {
    const t = setup();
    t.i.blur();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(document.activeElement).toBe(t.i);
    expect(t.sent.length).toBe(1);
  });

  it('word helpers', () => {
    expect(wordStartBefore('ab cd', 5)).toBe(3);
    expect(wordStartBefore('ab cd  ', 7)).toBe(3);
    expect(wordEndAfter('ab cd', 0)).toBe(2);
    expect(wordEndAfter('ab cd', 2)).toBe(5);
    expect(spaceWordStartBefore('a b.c', 5)).toBe(2);
  });

  it('paste normalisation', () => {
    expect(normalizePaste('a\r\nb\r\n')).toBe('a b');
    expect(normalizePaste('one\n\ntwo\rthree')).toBe('one two three');
    expect(normalizePaste('plain')).toBe('plain');
  });

  it('leave guard toggles a beforeunload handler', () => {
    const t = setup();
    t.pane.setLeaveGuard(true);
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    t.pane.setLeaveGuard(false);
    const e2 = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e2);
    expect(e2.defaultPrevented).toBe(false);
  });
});

describe('InputPane auto-clear (ADR 0063)', () => {
  it('off by default: the sent text stays, selected', () => {
    const t = setup();
    t.type('look');
    t.key('Enter');
    expect(t.i.value).toBe('look');
    expect(t.selected()).toEqual([0, 4]);
  });

  it('on: Enter empties the line; history and Up/Down are unchanged', () => {
    const t = setup();
    t.pane.setAutoClear(true);
    for (const c of ['look', 'north', 'north']) {
      t.type(c);
      t.key('Enter');
    }
    expect(t.sent.map((x) => x.text)).toEqual(['look', 'north', 'north']);
    expect(t.i.value).toBe('');
    expect(t.pane.getHistory()).toEqual(['look', 'north']);
    t.key('ArrowUp');
    expect(t.i.value).toBe('north');
    expect(t.selected()).toEqual([0, 5]);
    t.key('ArrowUp');
    expect(t.i.value).toBe('look');
    t.key('ArrowDown');
    expect(t.i.value).toBe('north');
    t.key('ArrowDown');
    expect(t.i.value).toBe('');
    // Enter on a recalled entry sends it and clears again.
    t.key('ArrowUp');
    t.key('Enter');
    expect(t.sent.at(-1)!.text).toBe('north');
    expect(t.i.value).toBe('');
    t.pane.setAutoClear(false);
    t.type('west');
    t.key('Enter');
    expect(t.i.value).toBe('west');
  });

  it('password mode still clears and keeps nothing', () => {
    const t = setup();
    t.pane.setAutoClear(true);
    t.bus.emit('telnet.echo', { serverEchoes: true });
    t.type('secret');
    t.key('Enter');
    expect(t.i.value).toBe('');
    expect(t.pane.getHistory()).toEqual([]);
  });
});

describe('InputPane autosuggest (ADR 0063)', () => {
  function suggestSetup(history: string[]) {
    const t = setup();
    for (const c of history) {
      t.type(c);
      t.key('Enter');
    }
    t.type('');
    t.pane.setAutosuggest(true);
    return t;
  }

  it('suggestFrom: space gate, newest wins, equal entry skipped, prefix incl. the space', () => {
    const h = ['kill orc', 'killer', 'kill troll', 'kill '];
    expect(suggestFrom(h, 'kill')).toBe('');
    expect(suggestFrom(h, 'kill ')).toBe('troll');
    expect(suggestFrom(h, 'kill o')).toBe('rc');
    expect(suggestFrom(h, 'kill orc')).toBe('');
    expect(suggestFrom(h, 'cast ')).toBe('');
    expect(suggestFrom([], 'kill ')).toBe('');
    expect(nextSuggestedWord('orc the great')).toBe('orc');
    expect(nextSuggestedWord(' the great')).toBe(' the');
    expect(nextSuggestedWord('  ')).toBe('  ');
  });

  it('shows nothing while off, without a space, with a selection, or browsing', () => {
    const t = suggestSetup(['kill orc the great']);
    t.pane.setAutosuggest(false);
    t.type('kill ');
    expect(t.pane.suggestion()).toBe('');
    t.pane.setAutosuggest(true);
    expect(t.pane.suggestion()).toBe('orc the great');
    t.type('kill');
    expect(t.pane.suggestion()).toBe('');
    t.type('kill ');
    t.i.setSelectionRange(0, 2);
    expect(t.pane.suggestion()).toBe('');
    t.i.setSelectionRange(2, 2);
    expect(t.pane.suggestion()).toBe('');
    t.key('ArrowUp');
    t.i.setSelectionRange(t.i.value.length, t.i.value.length);
    expect(t.pane.suggestion()).toBe('');
  });

  it('Right and End accept the whole suggestion; it is never sent', () => {
    const t = suggestSetup(['kill orc the great']);
    t.type('kill ');
    expect(t.key('ArrowRight').defaultPrevented).toBe(true);
    expect(t.i.value).toBe('kill orc the great');
    t.type('kill ');
    expect(t.key('End').defaultPrevented).toBe(true);
    expect(t.i.value).toBe('kill orc the great');
    // Shift+End and an End away from the end keep their native meaning.
    t.type('kill ');
    expect(t.key('End', { shiftKey: true }).defaultPrevented).toBe(false);
    t.type('kill ');
    t.i.setSelectionRange(1, 1);
    expect(t.key('End').defaultPrevented).toBe(false);
    expect(t.i.value).toBe('kill ');
    // Enter sends only the buffer.
    t.type('kill ');
    t.key('Enter');
    expect(t.sent.at(-1)!.text).toBe('kill ');
  });

  it('Tab accepts word by word, then stays put; without a suggestion it is not taken', () => {
    const t = suggestSetup(['kill orc the great']);
    t.type('kill ');
    expect(t.key('Tab').defaultPrevented).toBe(true);
    expect(t.i.value).toBe('kill orc');
    t.key('Tab');
    expect(t.i.value).toBe('kill orc the');
    t.key('Tab');
    expect(t.i.value).toBe('kill orc the great');
    // Filled: a further Tab does nothing (and does not move the focus).
    expect(t.key('Tab').defaultPrevented).toBe(true);
    expect(t.i.value).toBe('kill orc the great');
    // A fresh line with no suggestion: Tab keeps the browser's meaning.
    t.type('look');
    expect(t.key('Tab').defaultPrevented).toBe(false);
    t.pane.setAutosuggest(false);
    t.type('kill ');
    expect(t.key('Tab').defaultPrevented).toBe(false);
    expect(t.i.value).toBe('kill ');
  });

  it('a bound macro wins over the accept keys', () => {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.appendChild(root);
    const fired: string[] = [];
    const pane = new InputPane(new Bus(), root, {
      sender: { sendCommand: () => {}, sendGmcp: () => {} },
      onMacroKey: (k) => (k === 'Tab' ? (fired.push(k), true) : false),
    });
    pane.focus();
    pane.input.value = 'kill orc';
    pane.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    pane.setAutosuggest(true);
    pane.input.value = 'kill ';
    pane.input.setSelectionRange(5, 5);
    pane.input.dispatchEvent(new Event('input'));
    pane.input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', key: 'Tab', bubbles: true, cancelable: true }));
    expect(fired).toEqual(['Tab']);
    expect(pane.input.value).toBe('kill ');
    pane.dispose();
  });

  it('none in password mode', () => {
    const t = suggestSetup(['kill orc']);
    t.bus.emit('telnet.echo', { serverEchoes: true });
    t.type('kill ');
    expect(t.pane.suggestion()).toBe('');
    expect(t.key('ArrowRight').defaultPrevented).toBe(false);
  });
});

describe('AppStatus', () => {
  it('tracks state, name, link, xml and capture', () => {
    const bus = new Bus();
    const s = new AppStatus(bus);
    const seen: string[] = [];
    s.subscribe((st) => seen.push(st.conn));
    expect(formatStatus(s.get())).toBe('idle · Link: — · XML: off');
    bus.emit('conn.state', { state: 'playing', prev: 'login' });
    bus.emit('gmcp', { pkg: 'Char.Name', data: { name: 'Rasta', fullname: 'Rasta Fari' } });
    bus.emit('link.rtt', { ms: 38.4, last: 38.4, ping: 38.4, http: null, suspect: false });
    bus.emit('xml.seen', undefined);
    bus.emit('xml.seen', undefined);
    s.set({ capture: 'capture: recording' });
    expect(s.get()).toMatchObject({ conn: 'playing', character: 'Rasta', linkMs: 38.4, xml: true });
    expect(formatStatus(s.get())).toBe('playing · Rasta · Link: 38ms · XML: on · capture: recording');
    expect(seen).toHaveLength(5);
    bus.emit('conn.state', { state: 'connecting', prev: 'disconnected' });
    expect(s.get()).toMatchObject({ xml: false, linkMs: null });
    s.set({ replay: true });
    expect(formatStatus(s.get()).startsWith('replay ·')).toBe(true);
    expect(Object.isFrozen(s.get())).toBe(true);
    expect(formatLink(40, true)).toBe('Link: 40ms?');
    expect(formatLink(null, true)).toBe('Link: —');
  });
});

describe('InputPane custom caret', () => {
  function caretSetup() {
    document.body.innerHTML = '';
    const bus = new Bus();
    const root = document.createElement('div');
    document.body.appendChild(root);
    const sent: string[] = [];
    const frames: Array<() => void> = [];
    const sender: Sender = { sendCommand: (text) => sent.push(text), sendGmcp: () => {} };
    const pane = new InputPane(bus, root, {
      sender,
      cellWidth: () => 10,
      requestFrame: (cb) => frames.push(cb),
    });
    pane.focus();
    const i = pane.input;
    const c = pane.caretEl;
    const run = () => {
      while (frames.length) frames.shift()!();
    };
    const type = (s: string) => {
      i.value = s;
      i.setSelectionRange(s.length, s.length);
      i.dispatchEvent(new Event('input'));
    };
    return { bus, pane, i, c, frames, run, type, sent };
  }

  it('sits at column × cell width and shows the character under it', () => {
    const t = caretSetup();
    t.type('look');
    t.run();
    expect(t.c.hidden).toBe(false);
    expect(t.c.style.transform).toBe('translateX(40px)');
    expect(t.c.textContent).toBe(' ');
    t.i.setSelectionRange(1, 1);
    t.pane.scheduleCaret();
    t.run();
    expect(t.c.style.transform).toBe('translateX(10px)');
    expect(t.c.textContent).toBe('o');
  });

  it('follows horizontal scroll and counts a surrogate pair as one cell', () => {
    const t = caretSetup();
    t.type('a😀b');
    Object.defineProperty(t.i, 'scrollLeft', { configurable: true, get: () => 5 });
    t.pane.updateCaret();
    expect(t.c.style.transform).toBe('translateX(25px)');
  });

  it('hides for a selection, is hollow when blurred', () => {
    const t = caretSetup();
    t.type('look');
    t.i.setSelectionRange(0, 4);
    t.pane.updateCaret();
    expect(t.c.hidden).toBe(true);
    t.i.setSelectionRange(4, 4);
    t.pane.updateCaret();
    expect(t.c.hidden).toBe(false);
    expect(t.c.classList.contains('wc-blurred')).toBe(false);
    t.i.blur();
    t.run();
    expect(t.c.classList.contains('wc-blurred')).toBe(true);
    t.pane.focus();
    t.run();
    expect(t.c.classList.contains('wc-blurred')).toBe(false);
  });

  it('shows a bullet under the caret while masked', () => {
    const t = caretSetup();
    t.pane.setPasswordMode(true);
    t.type('secret');
    t.i.setSelectionRange(2, 2);
    t.pane.updateCaret();
    expect(t.c.textContent).toBe('•');
    expect(t.c.style.transform).toBe('translateX(20px)');
  });

  describe('blink (ADR 0044 rule 1: a timer, no CSS animation)', () => {
    const root = document.documentElement;
    beforeEach(() => {
      vi.useFakeTimers();
      root.dataset.cursorBlink = 'on';
    });
    // Panes of earlier tests would react to the attribute changes here.
    const live: InputPane[] = [];
    afterEach(() => {
      for (const p of live.splice(0)) p.dispose();
      vi.useRealTimers();
      delete root.dataset.cursorBlink;
    });
    const setup = () => {
      const t = caretSetup();
      live.push(t.pane);
      return t;
    };
    const off = (t: ReturnType<typeof caretSetup>) => t.c.classList.contains('wc-caret-off');

    it(`toggles wc-caret-off every ${BLINK_MS} ms while the caret shows`, () => {
      const t = setup();
      t.type('look');
      t.run();
      expect(off(t)).toBe(false);
      vi.advanceTimersByTime(BLINK_MS);
      expect(off(t)).toBe(true);
      vi.advanceTimersByTime(BLINK_MS);
      expect(off(t)).toBe(false);
      vi.advanceTimersByTime(BLINK_MS);
      expect(off(t)).toBe(true);
    });

    it('shows the caret at once on every move or edit and restarts the cycle', () => {
      const t = setup();
      t.type('a');
      t.run();
      vi.advanceTimersByTime(BLINK_MS);
      expect(off(t)).toBe(true);
      t.type('ab');
      t.run();
      expect(off(t)).toBe(false);
      // A full on phase follows the move, not the rest of the old one.
      vi.advanceTimersByTime(BLINK_MS - 1);
      expect(off(t)).toBe(false);
      vi.advanceTimersByTime(1);
      expect(off(t)).toBe(true);
      // An edit that leaves the caret where it is (Delete) shows it too.
      t.i.setSelectionRange(1, 1);
      t.run();
      vi.advanceTimersByTime(BLINK_MS);
      expect(off(t)).toBe(true);
      t.i.value = 'a';
      t.i.setSelectionRange(1, 1);
      t.i.dispatchEvent(new Event('input'));
      t.run();
      expect(off(t)).toBe(false);
    });

    it('follows the setting off → on without a caret move', async () => {
      const t = setup();
      t.type('look');
      t.run();
      vi.advanceTimersByTime(BLINK_MS);
      expect(off(t)).toBe(true);
      root.dataset.cursorBlink = 'off';
      await Promise.resolve(); // MutationObserver callback
      expect(off(t)).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(BLINK_MS * 4);
      expect(off(t)).toBe(false);
      root.dataset.cursorBlink = 'on';
      await Promise.resolve();
      expect(off(t)).toBe(false);
      vi.advanceTimersByTime(BLINK_MS);
      expect(off(t)).toBe(true);
    });

    it('does not blink with the setting off', () => {
      root.dataset.cursorBlink = 'off';
      const t = setup();
      t.type('look');
      t.run();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('stops while blurred, while a range is selected, and on dispose', () => {
      const t = setup();
      t.type('look');
      t.run();
      vi.advanceTimersByTime(BLINK_MS);
      t.i.blur();
      t.run();
      expect(off(t)).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
      t.pane.focus();
      t.run();
      expect(vi.getTimerCount()).toBe(1);
      t.i.setSelectionRange(0, 4);
      t.run();
      expect(t.c.hidden).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      t.i.setSelectionRange(4, 4);
      t.run();
      expect(vi.getTimerCount()).toBe(1);
      t.pane.dispose();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  it('draws the autosuggestion after the line, only when on (ADR 0063)', () => {
    const t = caretSetup();
    const g = t.pane.ghostEl;
    t.type('kill orc');
    t.i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    t.type('kill ');
    t.run();
    expect(g.hidden).toBe(true);
    t.pane.setAutosuggest(true);
    t.run();
    expect(g.hidden).toBe(false);
    expect(g.textContent).toBe('orc');
    expect(g.style.textIndent).toBe('50px');
    // The block caret shows the suggestion's first character.
    expect(t.c.textContent).toBe('o');
    Object.defineProperty(t.i, 'scrollLeft', { configurable: true, get: () => 20 });
    t.type('kill o');
    t.run();
    expect(g.textContent).toBe('rc');
    expect(g.style.textIndent).toBe('40px');
    t.type('kill orc');
    t.run();
    expect(g.hidden).toBe(true);
    t.type('kill ');
    t.run();
    t.pane.setAutosuggest(false);
    t.run();
    expect(g.hidden).toBe(true);
    expect(t.c.textContent).toBe(' ');
  });

  it('does no caret work on the Enter → send path', () => {
    const t = caretSetup();
    t.type('look');
    t.run();
    const before = t.c.style.transform;
    const spy = vi.spyOn(t.pane, 'updateCaret');
    t.i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(t.sent).toEqual(['look']);
    expect(spy).not.toHaveBeenCalled();
    expect(t.c.style.transform).toBe(before);
    expect(t.frames.length).toBe(1);
    t.run();
    expect(spy).toHaveBeenCalledTimes(1);
    // Recall state: the whole line is selected, so the caret hides.
    expect(t.c.hidden).toBe(true);
  });
});

describe('InputPane macros on printable keys (ADR 0026)', () => {
  function macroSetup(bound: string[]) {
    document.body.innerHTML = '';
    const bus = new Bus();
    const root = document.createElement('div');
    document.body.appendChild(root);
    const sender: Sender = { sendCommand: () => {}, sendGmcp: () => {} };
    const fired: string[] = [];
    const pane = new InputPane(bus, root, {
      sender,
      onMacroKey: (k) => {
        if (!bound.includes(k)) return false;
        fired.push(k);
        return true;
      },
    });
    pane.focus();
    const key = (code: string, k: string, init: KeyboardEventInit = {}, target: EventTarget = pane.input) => {
      const e = new KeyboardEvent('keydown', { code, key: k, bubbles: true, cancelable: true, ...init });
      target.dispatchEvent(e);
      return e;
    };
    return { bus, pane, fired, key };
  }

  it('a bound bare key fires and is consumed; an unbound one types', () => {
    const t = macroSetup(['A', 'Backquote', 'Shift+2']);
    expect(t.key('KeyA', 'a').defaultPrevented).toBe(true);
    expect(t.key('Backquote', '§').defaultPrevented).toBe(true);
    expect(t.key('Digit2', '"', { shiftKey: true }).defaultPrevented).toBe(true);
    expect(t.key('KeyB', 'b').defaultPrevented).toBe(false);
    expect(t.key('Digit2', '2').defaultPrevented).toBe(false);
    expect(t.fired).toEqual(['A', 'Backquote', 'Shift+2']);
  });

  it('Shift+letter fires while the bare letter still types', () => {
    const t = macroSetup(['Shift+A']);
    expect(t.key('KeyA', 'a').defaultPrevented).toBe(false);
    expect(t.key('KeyA', 'A', { shiftKey: true }).defaultPrevented).toBe(true);
    expect(t.fired).toEqual(['Shift+A']);
  });

  it('nothing fires in password mode, with AltGr, or in other fields', () => {
    const t = macroSetup(['A', 'Minus']);
    t.bus.emit('telnet.echo', { serverEchoes: true });
    expect(t.key('KeyA', 'a').defaultPrevented).toBe(false);
    t.bus.emit('telnet.echo', { serverEchoes: false });

    const altGr = new KeyboardEvent('keydown', { code: 'Minus', key: '\\', bubbles: true, cancelable: true });
    Object.defineProperty(altGr, 'getModifierState', { value: (k: string) => k === 'AltGraph' });
    t.pane.input.dispatchEvent(altGr);
    expect(altGr.defaultPrevented).toBe(false);

    for (const tag of ['textarea', 'input']) {
      const el = document.createElement(tag);
      document.body.appendChild(el);
      expect(t.key('KeyA', 'a', {}, el).defaultPrevented, tag).toBe(false);
    }
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    document.body.appendChild(editable);
    t.key('KeyA', 'a', {}, editable);
    expect(t.fired).toEqual([]);
    expect(t.key('KeyA', 'a').defaultPrevented).toBe(true);
    expect(t.fired).toEqual(['A']);
  });
});

describe('InputPane dead keys (ADR 0026 "Dead keys")', () => {
  // Replays the owner's Firefox/Linux log (Swedish layout: ´ is Equal, ¨ is
  // BracketRight). The browser's own text changes are simulated by setting
  // the value before each `input` event.
  function deadSetup(bound: string[]) {
    document.body.innerHTML = '';
    const bus = new Bus();
    const root = document.createElement('div');
    document.body.appendChild(root);
    const sender: Sender = { sendCommand: () => {}, sendGmcp: () => {} };
    const fired: string[] = [];
    const pane = new InputPane(bus, root, {
      sender,
      onMacroKey: (k) => {
        if (!bound.includes(k)) return false;
        fired.push(k);
        return true;
      },
    });
    pane.focus();
    const i = pane.input;
    const down = (code: string, key: string, isComposing = false) => {
      const e = new KeyboardEvent('keydown', { code, key, isComposing, bubbles: true, cancelable: true });
      i.dispatchEvent(e);
      return e;
    };
    const up = (code: string, key: string, isComposing = false) =>
      i.dispatchEvent(new KeyboardEvent('keyup', { code, key, isComposing, bubbles: true, cancelable: true }));
    const comp = (type: string, data: string) =>
      i.dispatchEvent(new CompositionEvent(type, { data, bubbles: true }));
    /** The browser replaces the composition range [from, value end) with `text`. */
    let from = 0;
    const startAt = () => {
      from = i.value.length;
    };
    const compText = (text: string, isComposing = true) => {
      i.dispatchEvent(
        new InputEvent('beforeinput', { inputType: 'insertCompositionText', data: text, isComposing, bubbles: true }),
      );
      i.value = i.value.slice(0, from) + text;
      i.setSelectionRange(i.value.length, i.value.length);
      i.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', data: text, isComposing, bubbles: true }));
    };
    const type = (s: string) => {
      i.value = s;
      i.setSelectionRange(s.length, s.length);
      i.dispatchEvent(new Event('input'));
    };
    return { pane, i, fired, down, up, comp, compText, startAt, type };
  }

  /** The owner's log: ´ then ¨, each a dead key, then the composition ends. */
  function ownerSequence(t: ReturnType<typeof deadSetup>) {
    const first = t.down('Equal', 'Dead');
    t.startAt();
    t.comp('compositionstart', '');
    const echo = t.down('Equal', 'Dead', true);
    t.comp('compositionupdate', '´');
    t.compText('´');
    t.up('Equal', 'Dead', true);
    const second = t.down('BracketRight', 'Dead', true);
    t.comp('compositionupdate', '´¨');
    t.compText('´¨');
    t.up('BracketRight', 'Dead', true);
    t.down('', 'Process', true);
    t.comp('compositionupdate', '');
    t.compText('');
    t.comp('compositionend', '');
    t.compText('', false);
    return { first, echo, second };
  }

  it('a bound ´ fires once and leaves the line unchanged', () => {
    const t = deadSetup(['Equal']);
    t.type('kill');
    t.i.setSelectionRange(2, 2);
    const first = t.down('Equal', 'Dead');
    expect(first.defaultPrevented).toBe(true);
    t.startAt();
    t.comp('compositionstart', '');
    expect(t.down('Equal', 'Dead', true).defaultPrevented).toBe(true);
    t.comp('compositionupdate', '´');
    t.compText('´');
    expect(t.i.value).toBe('kill');
    t.up('Equal', 'Dead', true);
    t.comp('compositionend', '´');
    t.compText('´', false);
    expect(t.fired).toEqual(['Equal']);
    expect(t.i.value).toBe('kill');
    expect([t.i.selectionStart, t.i.selectionEnd]).toEqual([2, 2]);
    expect(document.activeElement).toBe(t.i);
  });

  it('´ then ¨ both fire (the owner log)', () => {
    const t = deadSetup(['Equal', 'BracketRight']);
    t.type('abc');
    ownerSequence(t);
    expect(t.fired).toEqual(['Equal', 'BracketRight']);
    expect(t.i.value).toBe('abc');
    // The guard ends with the next plain key; typing works again.
    t.down('KeyE', 'e');
    t.type('abce');
    expect(t.i.value).toBe('abce');
  });

  it('an unbound ´ before a bound ¨ keeps composing', () => {
    const t = deadSetup(['BracketRight']);
    t.type('x');
    ownerSequence(t);
    expect(t.fired).toEqual(['BracketRight']);
    // The ¨ macro snapshots the line with the open ´ composition in it.
    expect(t.i.value).toBe('x´');
  });

  it('an unbound dead key still composes (´ + e → é)', () => {
    const t = deadSetup(['BracketRight']);
    t.type('caf');
    expect(t.down('Equal', 'Dead').defaultPrevented).toBe(false);
    t.startAt();
    t.comp('compositionstart', '');
    expect(t.down('Equal', 'Dead', true).defaultPrevented).toBe(false);
    t.comp('compositionupdate', '´');
    t.compText('´');
    t.up('Equal', 'Dead', true);
    expect(t.down('KeyE', 'e', true).defaultPrevented).toBe(false);
    t.comp('compositionupdate', 'é');
    t.compText('é');
    t.comp('compositionend', 'é');
    t.compText('é', false);
    expect(t.i.value).toBe('café');
    expect(t.fired).toEqual([]);
  });

  it('a bound dead key after a released one lets an unbound one compose', () => {
    const t = deadSetup(['Equal']);
    t.down('Equal', 'Dead');
    t.startAt();
    t.comp('compositionstart', '');
    t.comp('compositionupdate', '´');
    t.compText('´');
    t.up('Equal', 'Dead', true);
    t.comp('compositionend', '');
    t.compText('', false);
    expect(t.i.value).toBe('');
    // ¨ is unbound: its composition is left alone.
    t.down('BracketRight', 'Dead');
    t.startAt();
    t.comp('compositionstart', '');
    t.comp('compositionupdate', '¨');
    t.compText('¨');
    expect(t.i.value).toBe('¨');
    expect(t.fired).toEqual(['Equal']);
  });

  it('non-dead keys during a real IME composition are still ignored', () => {
    const t = deadSetup(['A', 'Minus']);
    expect(t.down('KeyA', 'a', true).defaultPrevented).toBe(false);
    expect(t.down('Minus', '-', true).defaultPrevented).toBe(false);
    expect(t.down('', 'Process', true).defaultPrevented).toBe(false);
    expect(t.fired).toEqual([]);
    expect(t.down('KeyA', 'a').defaultPrevented).toBe(true);
    expect(t.fired).toEqual(['A']);
  });

  it('holding a bound dead key repeats its macro', () => {
    const t = deadSetup(['Equal']);
    t.down('Equal', 'Dead');
    t.i.dispatchEvent(new KeyboardEvent('keydown', { code: 'Equal', key: 'Dead', repeat: true, bubbles: true, cancelable: true }));
    expect(t.fired).toEqual(['Equal', 'Equal']);
  });
});

describe('InputPane on a phone (ADR 0075 §3.2)', () => {
  function phone() {
    document.body.innerHTML = '';
    const bus = new Bus();
    const root = document.createElement('div');
    document.body.appendChild(root);
    const sent: Array<{ text: string; opts?: { secret?: boolean } }> = [];
    const sender: Sender = {
      sendCommand: (text, opts) => sent.push(opts ? { text, opts } : { text }),
      sendGmcp: () => {},
    };
    const pane = new InputPane(bus, root, { sender, phone: true });
    pane.input.focus();
    return { bus, pane, sent, root };
  }

  it('is a one-row textarea with send as the Enter key and no autofill helpers', () => {
    const { pane } = phone();
    const ta = pane.input as HTMLTextAreaElement;
    expect(ta.tagName).toBe('TEXTAREA');
    expect(ta.getAttribute('rows')).toBe('1');
    expect(ta.getAttribute('wrap')).toBe('off');
    expect(ta.getAttribute('enterkeyhint')).toBe('send');
    expect(ta.getAttribute('autocomplete')).toBe('off');
    expect(ta.getAttribute('autocorrect')).toBe('off');
    expect(ta.getAttribute('autocapitalize')).toBe('off');
    expect(ta.spellcheck).toBe(false);
  });

  it('Enter sends and never leaves a newline; a bare line break sends too', () => {
    const { pane, sent } = phone();
    const i = pane.input;
    i.value = 'say hi';
    const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    i.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(sent.map((s) => s.text)).toEqual(['say hi']);
    i.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    // An on-screen keyboard's Enter as a bare line break (no keydown Enter).
    i.value = 'look';
    const bi = new InputEvent('beforeinput', { inputType: 'insertLineBreak', bubbles: true, cancelable: true });
    i.dispatchEvent(bi);
    expect(bi.defaultPrevented).toBe(true);
    expect(sent.map((s) => s.text)).toEqual(['say hi', 'look']);
    expect(i.value).not.toContain('\n');
  });

  it('a newline that got in anyway becomes a space, as a paste', () => {
    const { pane } = phone();
    const i = pane.input;
    i.value = 'say a\nb\n';
    i.setSelectionRange(i.value.length, i.value.length);
    i.dispatchEvent(new Event('input'));
    expect(i.value).toBe('say a b');
  });

  it('a password prompt swaps in a masked <input type=password>, and back', () => {
    const { bus, pane, sent, root } = phone();
    bus.emit('telnet.echo', { serverEchoes: true });
    const pw = pane.input as HTMLInputElement;
    expect(pw.tagName).toBe('INPUT');
    expect(pw.type).toBe('password');
    expect(pw.classList.contains('wc-masked')).toBe(true);
    expect(root.querySelectorAll('.wc-input-field')).toHaveLength(1);
    expect(document.activeElement).toBe(pw);
    pw.value = 'secret';
    pw.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(sent.at(-1)).toEqual({ text: 'secret', opts: { secret: true } });
    bus.emit('telnet.echo', { serverEchoes: false });
    expect(pane.input.tagName).toBe('TEXTAREA');
    expect(pane.input.value).toBe('');
    expect(pw.value).toBe('');
    expect(root.querySelectorAll('.wc-input-field')).toHaveLength(1);
  });

  it('desktop keeps the <input type=text>, also while masked', () => {
    document.body.innerHTML = '';
    const bus = new Bus();
    const root = document.createElement('div');
    document.body.appendChild(root);
    const pane = new InputPane(bus, root, { sender: { sendCommand: () => {}, sendGmcp: () => {} } });
    expect(pane.input.tagName).toBe('INPUT');
    expect((pane.input as HTMLInputElement).type).toBe('text');
    bus.emit('telnet.echo', { serverEchoes: true });
    expect((pane.input as HTMLInputElement).type).toBe('text');
  });
});
