// @vitest-environment happy-dom
// The input pane's public editing API for the phone's own keyboard
// (ADR 0138 §3, stage 53a): insertText, deleteBackward, submitLine and
// setOwnKeyboard. The keys call these; no keyboard event is made up.
import { describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import type { Sender } from '../../src/core/types';
import { InputPane, codePointStartBefore, graphemeStartBefore } from '../../src/ui/input-pane';

function setup(opts: { onCommand?: (t: string) => boolean; phone?: boolean } = {}) {
  document.body.innerHTML = '';
  const bus = new Bus();
  const root = document.createElement('div');
  document.body.appendChild(root);
  const sent: Array<{ text: string; opts?: { secret?: boolean; echo?: boolean } }> = [];
  const sender: Sender = {
    sendCommand: (text, o) => sent.push(o ? { text, opts: o } : { text }),
    sendGmcp: () => {},
  };
  const pane = new InputPane(bus, root, { sender, ...(opts.onCommand ? { onCommand: opts.onCommand } : {}), ...(opts.phone ? { phone: true } : {}) });
  pane.focus();
  const i = pane.input;
  const type = (s: string) => {
    i.value = s;
    i.setSelectionRange(s.length, s.length);
    i.dispatchEvent(new Event('input'));
  };
  const key = (k: string) => i.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const selected = () => [i.selectionStart, i.selectionEnd];
  return { bus, pane, i, sent, type, key, selected };
}

describe('InputPane editing API for the own keyboard (ADR 0138)', () => {
  it('codePointStartBefore steps over a surrogate pair as one', () => {
    expect(codePointStartBefore('ab', 2)).toBe(1);
    expect(codePointStartBefore('a😀', 3)).toBe(1);
    expect(codePointStartBefore('😀', 1)).toBe(0);
    expect(codePointStartBefore('', 0)).toBe(0);
  });

  it('insertText types at the caret and over a selection', () => {
    const t = setup();
    t.pane.insertText('k');
    t.pane.insertText('l');
    expect(t.i.value).toBe('kl');
    expect(t.selected()).toEqual([2, 2]);
    t.i.setSelectionRange(1, 1);
    t.pane.insertText('il');
    expect(t.i.value).toBe('kill');
    // (The caret after a mid-line edit is checked in the browser, tests/e2e/phone-own-keyboard.spec.ts:
    // happy-dom's setRangeText leaves it at the end of the line.)
    t.i.setSelectionRange(1, 4);
    t.pane.insertText('X');
    expect(t.i.value).toBe('kX');
  });

  it('a key after Enter replaces the recalled line, as a typed one does', () => {
    const t = setup();
    t.pane.insertText('look');
    t.pane.submitLine();
    expect(t.pane.isRecallState()).toBe(true);
    t.pane.insertText('n');
    expect(t.i.value).toBe('n');
  });

  it('deleteBackward removes one character, a surrogate pair as one, or the selection', () => {
    const t = setup();
    t.type('ab😀');
    t.pane.deleteBackward();
    expect(t.i.value).toBe('ab');
    t.pane.deleteBackward();
    expect(t.i.value).toBe('a');
    t.type('hello');
    t.i.setSelectionRange(1, 4);
    t.pane.deleteBackward();
    expect(t.i.value).toBe('ho');
    t.i.setSelectionRange(0, 0);
    t.pane.deleteBackward();
    expect(t.i.value).toBe('ho');
  });

  it('submitLine sends as Enter does and records history', () => {
    const t = setup();
    t.pane.insertText('look');
    t.pane.submitLine();
    t.pane.insertText('n');
    t.pane.submitLine();
    expect(t.sent).toEqual([{ text: 'look' }, { text: 'n' }]);
    expect(t.pane.getHistory()).toEqual(['look', 'n']);
    expect(t.i.value).toBe('n');
    expect(t.selected()).toEqual([0, 1]);
  });

  it('submitLine goes through the built-in command hook', () => {
    const seen: string[] = [];
    const t = setup({
      onCommand: (text) => {
        seen.push(text);
        return true;
      },
    });
    t.pane.insertText('#menu');
    t.pane.submitLine();
    expect(seen).toEqual(['#menu']);
    expect(t.sent).toEqual([]);
    expect(t.pane.getHistory()).toEqual(['#menu']);
  });

  it('an edit ends history browsing', () => {
    const t = setup();
    for (const c of ['one', 'two']) {
      t.type(c);
      t.key('Enter');
    }
    t.type('');
    t.key('ArrowUp');
    t.key('ArrowUp');
    expect(t.i.value).toBe('one');
    t.i.setSelectionRange(3, 3);
    t.pane.insertText('s');
    expect(t.i.value).toBe('ones');
    // Not browsing any more: Up starts again from the newest, and the edited line is the draft.
    t.key('ArrowUp');
    expect(t.i.value).toBe('two');
    t.key('ArrowDown');
    expect(t.i.value).toBe('ones');
    // The same for a delete.
    t.key('ArrowUp');
    t.i.setSelectionRange(3, 3);
    t.pane.deleteBackward();
    expect(t.i.value).toBe('tw');
    t.key('ArrowUp');
    expect(t.i.value).toBe('two');
    t.key('ArrowDown');
    expect(t.i.value).toBe('tw');
  });

  it('password mode: the mask follows, the send is secret and nothing is recorded', () => {
    const t = setup();
    t.bus.emit('telnet.echo', { serverEchoes: true });
    const mask = t.pane.el.querySelector('.wc-input-mask')!;
    t.pane.insertText('se');
    t.pane.insertText('x');
    expect(mask.textContent).toBe('•••');
    t.pane.deleteBackward();
    expect(mask.textContent).toBe('••');
    t.pane.insertText('cret');
    t.pane.submitLine();
    expect(t.sent).toEqual([{ text: 'secret', opts: { secret: true } }]);
    expect(t.pane.getHistory()).toEqual([]);
    expect(t.pane.input.value).toBe('');
    expect(mask.textContent).toBe('');
  });

  it('insertText keeps the line one line', () => {
    const t = setup();
    t.pane.insertText('a\nb\n');
    expect(t.i.value).toBe('a b');
  });

  it('setOwnKeyboard marks the field; the password prompt then keeps the textarea, masked, and no password field is made', () => {
    const t = setup({ phone: true });
    const text = t.pane.input;
    expect(text.tagName).toBe('TEXTAREA');
    expect(text.hasAttribute('inputmode')).toBe(false);
    expect(text.hasAttribute('virtualkeyboardpolicy')).toBe(false);
    t.pane.setOwnKeyboard(true);
    expect(text.getAttribute('inputmode')).toBe('none');
    expect(text.getAttribute('virtualkeyboardpolicy')).toBe('manual');
    t.pane.insertText('half a comm');
    t.bus.emit('telnet.echo', { serverEchoes: true });
    // The same field, emptied and masked (the desktop's way), not an <input type="password">.
    expect(t.pane.input).toBe(text);
    expect(text.value).toBe('');
    expect(text.classList.contains('wc-masked')).toBe(true);
    expect(t.pane.el.querySelector('input[type="password"]')).toBeNull();
    const mask = t.pane.el.querySelector<HTMLElement>('.wc-input-mask')!;
    expect(mask.hidden).toBe(false);
    t.pane.insertText('pwx');
    t.pane.deleteBackward();
    expect(text.value).toBe('pw');
    expect(mask.textContent).toBe('••');
    // No history at the prompt.
    t.pane.historyStep('up');
    expect(text.value).toBe('pw');
    // A range is never left selected in the masked line (a phone's selection toolbar would be offered it).
    text.setSelectionRange(0, 2);
    document.dispatchEvent(new Event('selectionchange'));
    expect([text.selectionStart, text.selectionEnd]).toEqual([2, 2]);
    // The prompt goes while a password is half typed: it does not stay in the line, now shown.
    t.bus.emit('telnet.echo', { serverEchoes: false });
    expect(t.pane.input).toBe(text);
    expect(text.value).toBe('');
    expect(text.classList.contains('wc-masked')).toBe(false);
    expect(mask.hidden).toBe(true);
    expect(t.sent).toEqual([]);
    t.pane.dispose();
  });
  it('without it the phone swaps in the password field, as before; turned on or off at the prompt, the field in use changes and keeps what was typed', () => {
    const t = setup({ phone: true });
    const text = t.pane.input;
    t.bus.emit('telnet.echo', { serverEchoes: true });
    const pass = t.pane.input as HTMLInputElement;
    expect(pass).not.toBe(text);
    expect(pass.type).toBe('password');
    t.pane.insertText('pw');
    // Our keyboard comes (the phone layer mounts at the prompt): the textarea, masked, with the text.
    t.pane.setOwnKeyboard(true);
    expect(t.pane.input).toBe(text);
    expect(text.value).toBe('pw');
    expect(pass.value).toBe('');
    expect(text.classList.contains('wc-masked')).toBe(true);
    expect(text.getAttribute('inputmode')).toBe('none');
    expect(t.pane.el.querySelector('.wc-input-mask')!.textContent).toBe('••');
    expect(pass.isConnected).toBe(false);
    // And goes again: the password field is back.
    t.pane.setOwnKeyboard(false);
    expect(t.pane.input).toBe(pass);
    expect(pass.value).toBe('pw');
    expect(text.value).toBe('');
    expect(pass.hasAttribute('inputmode')).toBe(false);
    expect(text.hasAttribute('inputmode')).toBe(false);
    expect(text.hasAttribute('virtualkeyboardpolicy')).toBe(false);
    t.bus.emit('telnet.echo', { serverEchoes: false });
    expect(t.pane.input).toBe(text);
    t.pane.dispose();
  });
  it('graphemeStartBefore steps over a whole cluster, and over a code point without Intl.Segmenter', () => {
    expect(graphemeStartBefore('ab', 2)).toBe(1);
    expect(graphemeStartBefore('', 0)).toBe(0);
    expect(graphemeStartBefore('aå', 2)).toBe(1);
    // A letter with a combining mark, a flag (two regional indicators), an emoji with a skin tone and joiners.
    expect(graphemeStartBefore('aé', 3)).toBe(1);
    expect(graphemeStartBefore('a🇸🇪', 5)).toBe(1);
    expect(graphemeStartBefore('a👍🏽', 5)).toBe(1);
    expect(graphemeStartBefore('x👨‍👩‍👧', 9)).toBe(1);
    // Only what is before the caret counts.
    expect(graphemeStartBefore('éé', 2)).toBe(0);
    const intl = Intl as { Segmenter?: unknown };
    const seg = intl.Segmenter;
    try {
      intl.Segmenter = undefined;
      expect(graphemeStartBefore('aé', 3)).toBe(2);
      expect(graphemeStartBefore('a😀', 3)).toBe(1);
    } finally {
      intl.Segmenter = seg;
    }
  });

  it('deleteBackward removes a whole grapheme cluster', () => {
    const t = setup();
    t.type('gé🇸🇪');
    t.pane.deleteBackward();
    expect(t.i.value).toBe('gé');
    t.pane.deleteBackward();
    expect(t.i.value).toBe('g');
    t.pane.deleteBackward();
    expect(t.i.value).toBe('');
  });

  it('historyStep browses as the Up and Down keys do, and an own-keyboard edit ends it', () => {
    const t = setup();
    for (const c of ['one', 'two']) {
      t.pane.insertText(c);
      t.pane.submitLine();
    }
    // Just sent: `two` is on screen, so Up goes one further.
    t.pane.historyStep('up');
    expect(t.i.value).toBe('one');
    t.pane.historyStep('down');
    expect(t.i.value).toBe('two');
    // Past the newest: the draft (empty), then nothing more.
    t.pane.historyStep('down');
    expect(t.i.value).toBe('');
    t.pane.historyStep('down');
    expect(t.i.value).toBe('');
    // A draft is kept while browsing and comes back.
    t.pane.insertText('dra');
    t.pane.historyStep('up');
    expect(t.i.value).toBe('two');
    t.pane.historyStep('up');
    expect(t.i.value).toBe('one');
    t.pane.historyStep('up');
    expect(t.i.value).toBe('one');
    t.pane.historyStep('down');
    t.pane.historyStep('down');
    expect(t.i.value).toBe('dra');
    // A recalled line is selected: the next key replaces it.
    t.pane.historyStep('up');
    t.pane.insertText('x');
    expect(t.i.value).toBe('x');
    expect(t.pane.getHistory()).toEqual(['one', 'two']);
  });

  it('historyStep does nothing in password mode', () => {
    const t = setup();
    t.pane.insertText('secretcommand');
    t.pane.submitLine();
    t.bus.emit('telnet.echo', { serverEchoes: true });
    expect(t.pane.isPasswordMode()).toBe(true);
    t.pane.insertText('pw');
    t.pane.historyStep('up');
    expect(t.i.value).toBe('pw');
    t.pane.historyStep('down');
    expect(t.i.value).toBe('pw');
  });
});

// Round 53j: on a phone with our own keyboard the sent line is kept without a native selection
// once the field loses the focus (Android shows its selection pop-up for a tapped field that
// holds a range).
describe('InputPane kept line (stage 53, round 53j)', () => {
  function sentAndFolded() {
    const t = setup({ phone: true });
    t.pane.setOwnKeyboard(true);
    t.pane.input.focus();
    t.pane.insertText('look');
    t.pane.submitLine();
    // Focused: the native selection, as ever.
    expect(t.selected()).toEqual([0, 4]);
    expect(t.pane.isKept()).toBe(false);
    t.pane.input.blur();
    return t;
  }

  it('the blur collapses the selection and keeps the line, dimmed', () => {
    const t = sentAndFolded();
    expect(t.pane.input.value).toBe('look');
    expect(t.selected()).toEqual([4, 4]);
    expect(t.pane.isKept()).toBe(true);
    expect(t.pane.isRecallState()).toBe(true);
    expect(t.pane.input.classList.contains('wc-input-kept')).toBe(true);
  });

  it('the tap that brings the focus back leaves it kept, the caret at the end and nothing selected', () => {
    const t = sentAndFolded();
    const i = t.pane.input;
    i.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    i.focus();
    i.setSelectionRange(2, 2);
    i.dispatchEvent(new Event('click', { bubbles: true }));
    expect(t.pane.isKept()).toBe(true);
    expect(t.selected()).toEqual([4, 4]);
  });

  it('Enter sends the kept line again', () => {
    const t = sentAndFolded();
    t.pane.input.focus();
    t.pane.submitLine();
    expect(t.sent.map((s) => s.text)).toEqual(['look', 'look']);
    expect(t.pane.input.value).toBe('look');
    // Focused again: the native selection.
    expect(t.pane.isKept()).toBe(false);
    expect(t.selected()).toEqual([0, 4]);
  });

  it('a typed key replaces the kept line; Backspace clears it', () => {
    const t = sentAndFolded();
    t.pane.input.focus();
    t.pane.insertText('n');
    expect(t.pane.input.value).toBe('n');
    expect(t.pane.isKept()).toBe(false);
    expect(t.pane.input.classList.contains('wc-input-kept')).toBe(false);

    const u = sentAndFolded();
    u.pane.input.focus();
    u.pane.deleteBackward();
    expect(u.pane.input.value).toBe('');
    expect(u.pane.isKept()).toBe(false);
  });

  it('a tap in the focused field, a caret key or a selection of the user makes it ordinary text', () => {
    const t = sentAndFolded();
    const i = t.pane.input;
    i.focus();
    i.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(t.pane.isKept()).toBe(false);
    t.pane.insertText('!');
    expect(i.value).toBe('look!');

    const u = sentAndFolded();
    u.pane.input.focus();
    u.key('ArrowLeft');
    expect(u.pane.isKept()).toBe(false);

    const v = sentAndFolded();
    v.pane.input.focus();
    v.pane.input.setSelectionRange(0, 2);
    v.pane.input.dispatchEvent(new Event('select', { bubbles: true }));
    expect(v.pane.isKept()).toBe(false);
    expect(v.selected()).toEqual([0, 2]);
  });

  // A hardware keyboard at the phone: the line's own keys treat the kept line as the desktop
  // treats the selected sent line.
  describe('the readline keys in a kept line (a hardware keyboard)', () => {
    function keptLine(text = 'kill orc') {
      const t = setup({ phone: true });
      t.pane.setOwnKeyboard(true);
      t.pane.input.focus();
      t.pane.insertText(text);
      t.pane.submitLine();
      t.pane.input.blur();
      expect(t.pane.isKept()).toBe(true);
      const chord = (key: string, code: string, mods: { ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean }) =>
        t.pane.input.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true, ...mods }));
      return { ...t, chord };
    }

    it('Alt+B: the caret at the last word\'s start, ordinary text', () => {
      const t = keptLine();
      t.chord('b', 'KeyB', { altKey: true });
      expect(t.pane.isKept()).toBe(false);
      expect(t.pane.input.classList.contains('wc-input-kept')).toBe(false);
      expect(t.pane.input.value).toBe('kill orc');
      expect(t.selected()).toEqual([5, 5]);
    });

    it('Alt+F: the caret at the end, ordinary text', () => {
      const t = keptLine();
      t.chord('f', 'KeyF', { altKey: true });
      expect(t.pane.isKept()).toBe(false);
      expect(t.pane.input.value).toBe('kill orc');
      expect(t.selected()).toEqual([8, 8]);
      // Typed into, not replaced.
      t.pane.insertText('s');
      expect(t.pane.input.value).toBe('kill orcs');
    });

    it('Ctrl+E: the caret at the end, ordinary text', () => {
      const t = keptLine();
      t.chord('e', 'KeyE', { ctrlKey: true });
      expect(t.pane.isKept()).toBe(false);
      expect(t.pane.input.value).toBe('kill orc');
      expect(t.selected()).toEqual([8, 8]);
      t.pane.insertText('s');
      expect(t.pane.input.value).toBe('kill orcs');
    });

    it('Ctrl+A: the whole line selected natively, no longer "kept"', () => {
      const t = keptLine();
      t.chord('a', 'KeyA', { ctrlKey: true });
      expect(t.pane.isKept()).toBe(false);
      expect(t.pane.input.classList.contains('wc-input-kept')).toBe(false);
      expect(t.selected()).toEqual([0, 8]);
      expect(t.pane.isRecallState()).toBe(true);
    });

    it('Alt+Backspace deletes the whole kept line, as it does the selected one', () => {
      const t = keptLine();
      t.chord('Backspace', 'Backspace', { altKey: true });
      expect(t.pane.isKept()).toBe(false);
      expect(t.pane.input.value).toBe('');
      // The desktop, for comparison: the selected sent line goes whole.
      const d = setup();
      d.pane.insertText('kill orc');
      d.pane.submitLine();
      d.i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', altKey: true, bubbles: true, cancelable: true }));
      expect(d.i.value).toBe('');
    });

    it('Ctrl+W deletes the whole kept line, as it does the selected one', () => {
      const t = keptLine();
      t.chord('w', 'KeyW', { ctrlKey: true });
      expect(t.pane.isKept()).toBe(false);
      expect(t.pane.input.value).toBe('');
      const d = setup();
      d.pane.insertText('kill orc');
      d.pane.submitLine();
      d.i.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', code: 'KeyW', ctrlKey: true, bubbles: true, cancelable: true }));
      expect(d.i.value).toBe('');
    });

    it('Shift+Up selects to the start: the user\'s own selection, no longer "kept"', () => {
      const t = keptLine();
      t.chord('ArrowUp', 'ArrowUp', { shiftKey: true });
      expect(t.pane.isKept()).toBe(false);
      expect(t.selected()).toEqual([0, 8]);
    });
  });

  it('the history from a kept line goes one further back, as from the selected one', () => {
    const t = setup({ phone: true });
    t.pane.setOwnKeyboard(true);
    t.pane.input.focus();
    t.pane.insertText('north');
    t.pane.submitLine();
    t.pane.insertText('look');
    t.pane.submitLine();
    t.pane.input.blur();
    t.pane.input.focus();
    t.pane.historyStep('up');
    expect(t.pane.input.value).toBe('north');
    expect(t.pane.isKept()).toBe(false);
  });

  it('nothing is kept at a password prompt, with auto-clear, on a desktop, or without our keyboard', () => {
    const t = sentAndFolded();
    t.bus.emit('telnet.echo', { serverEchoes: true });
    expect(t.pane.isKept()).toBe(false);
    expect(t.pane.input.value).toBe('');
    t.pane.input.focus();
    t.pane.insertText('secret');
    t.pane.submitLine();
    t.pane.input.blur();
    expect(t.pane.input.value).toBe('');
    expect(t.pane.isKept()).toBe(false);

    const a = setup({ phone: true });
    a.pane.setOwnKeyboard(true);
    a.pane.setAutoClear(true);
    a.pane.input.focus();
    a.pane.insertText('look');
    a.pane.submitLine();
    a.pane.input.blur();
    expect(a.pane.isKept()).toBe(false);

    // Desktop: the native selection stays through a blur.
    const d = setup();
    d.pane.insertText('look');
    d.pane.submitLine();
    d.pane.input.blur();
    expect(d.pane.isKept()).toBe(false);
    expect(d.selected()).toEqual([0, 4]);

    // A phone whose field has the device's keyboard (the old phone layout): as before.
    const p = setup({ phone: true });
    p.pane.input.focus();
    p.pane.insertText('look');
    p.pane.submitLine();
    p.pane.input.blur();
    expect(p.pane.isKept()).toBe(false);
    expect(p.selected()).toEqual([0, 4]);
  });
});
