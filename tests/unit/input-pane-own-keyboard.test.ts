// @vitest-environment happy-dom
// The input pane's public editing API for the phone's own keyboard
// (ADR 0138 §3, stage 53a): insertText, deleteBackward, submitLine and
// setOwnKeyboard. The keys call these; no keyboard event is made up.
import { describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import type { Sender } from '../../src/core/types';
import { InputPane, codePointStartBefore } from '../../src/ui/input-pane';

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

  it("setOwnKeyboard marks the field, and the phone's password field when it comes", () => {
    const t = setup({ phone: true });
    const text = t.pane.input;
    expect(text.tagName).toBe('TEXTAREA');
    expect(text.hasAttribute('inputmode')).toBe(false);
    expect(text.hasAttribute('virtualkeyboardpolicy')).toBe(false);
    t.pane.setOwnKeyboard(true);
    expect(text.getAttribute('inputmode')).toBe('none');
    expect(text.getAttribute('virtualkeyboardpolicy')).toBe('manual');
    t.bus.emit('telnet.echo', { serverEchoes: true });
    const pass = t.pane.input as HTMLInputElement;
    expect(pass).not.toBe(text);
    expect(pass.type).toBe('password');
    expect(pass.getAttribute('inputmode')).toBe('none');
    expect(pass.getAttribute('virtualkeyboardpolicy')).toBe('manual');
    // Typed through the API into the swapped field.
    t.pane.insertText('pw');
    expect(pass.value).toBe('pw');
    t.pane.setOwnKeyboard(false);
    expect(pass.hasAttribute('inputmode')).toBe(false);
    expect(text.hasAttribute('inputmode')).toBe(false);
    expect(text.hasAttribute('virtualkeyboardpolicy')).toBe(false);
    t.pane.dispose();
  });
});
