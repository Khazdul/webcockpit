// @vitest-environment happy-dom
// ADR 0139 §6 (round 53h): a CodeMirror buffer under the phone's own
// keyboard. The editor's side (src/editor/own-keyboard-cm.ts): the content
// element is marked and registered only where our keyboard is the pages',
// text goes the way typed text goes (the input handlers first, else one
// `input.type` transaction), and the keys run the buffer's own bindings
// when the frame hands them over (`handleKey`). The mount's side is in
// phone-keyboard-pages.test.ts; real taps in
// tests/e2e/phone-own-keyboard-editors.spec.ts.

import { completionStatus } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { isOwnKey, ownEditorOf, sendOwnKey, setPageKeyboard } from '../../src/core/own-keyboard';
import { createBuffer, handleKey } from '../../src/editor/cm';
import { createLuaBuffer } from '../../src/editor/lua-cm';
import { ownEditor, ownKeyboardExtension, typeText } from '../../src/editor/own-keyboard-cm';

let views: EditorView[] = [];

afterEach(() => {
  for (const v of views) v.destroy();
  views = [];
  document.body.innerHTML = '';
  setPageKeyboard(false);
});

function lua(text: string, readOnly = false): EditorView {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const v = createLuaBuffer(host, { text, readOnly, onStatus: () => {}, onChange: () => {}, onFocus: () => {} });
  views.push(v);
  return v;
}

function profile(text: string): EditorView {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const v = createBuffer(host, { text, eol: '\n', look: 'lantern', onStatus: () => {}, onScroll: () => {}, onClipboard: () => {}, onFocus: () => {} });
  views.push(v);
  return v;
}

const end = (v: EditorView): void => v.dispatch({ selection: { anchor: v.state.doc.length } });
const doc = (v: EditorView): string => v.state.doc.toString();
const head = (v: EditorView): number => v.state.selection.main.head;

/** Our key as the frame stack hands it to the buffer: the marked keydown, run through its bindings. */
function key(v: EditorView, k: 'Enter' | 'Backspace' | 'Tab' | 'ArrowLeft' | 'ArrowRight', shift = false): boolean {
  let handled = false;
  const on = (e: Event): void => {
    expect(isOwnKey(e)).toBe(true);
    // (The frame stack stops the key at the window: CodeMirror's own listener never sees it.)
    e.stopPropagation();
    handled = handleKey(v, e as KeyboardEvent);
  };
  v.contentDOM.addEventListener('keydown', on, { once: true, capture: true });
  sendOwnKey(v.contentDOM, k, { shift });
  return handled;
}

describe('ownKeyboardExtension', () => {
  it('is nothing where the device\'s keyboard is the pages\' (a desktop, a tablet, `?kbd=0`): no mark, no editor registered', () => {
    expect(ownKeyboardExtension()).toEqual([]);
    for (const v of [lua('x = 1'), profile('#alias {a} {b}')]) {
      expect(v.contentDOM.hasAttribute('inputmode')).toBe(false);
      expect(v.contentDOM.hasAttribute('virtualkeyboardpolicy')).toBe(false);
      expect(v.contentDOM.hasAttribute('data-okb-kind')).toBe(false);
      expect(ownEditorOf(v.contentDOM)).toBeNull();
      // (What the buffers always say of themselves is still there.)
      expect(v.contentDOM.getAttribute('spellcheck')).toBe('false');
    }
  });

  it('on a phone: the content is marked and registered, in both editors; a destroyed view is forgotten', () => {
    setPageKeyboard(true);
    for (const v of [lua('x = 1'), profile('#alias {a} {b}')]) {
      const c = v.contentDOM;
      expect(c.getAttribute('inputmode')).toBe('none');
      expect(c.getAttribute('virtualkeyboardpolicy')).toBe('manual');
      expect(c.getAttribute('data-okb-kind')).toBe('editor');
      expect(c.getAttribute('aria-label')).toBeTruthy();
      const ed = ownEditorOf(c)!;
      expect(ed.editable()).toBe(true);
      end(v);
      ed.insert('z');
      expect(doc(v).endsWith('z')).toBe(true);
      v.destroy();
      expect(ownEditorOf(c)).toBeNull();
    }
  });

  it('a read-only buffer is marked (no device keyboard) and says it cannot be typed in', () => {
    setPageKeyboard(true);
    const v = lua('x = 1', true);
    expect(v.contentDOM.getAttribute('inputmode')).toBe('none');
    const ed = ownEditorOf(v.contentDOM)!;
    expect(ed.editable()).toBe(false);
    ed.insert('z');
    expect(doc(v)).toBe('x = 1');
  });
});

describe('typeText', () => {
  it('types at the selection as one `input.type` transaction, the caret after it', () => {
    const v = lua('ab');
    const events: string[] = [];
    const orig = v.dispatch.bind(v);
    v.dispatch = ((...specs: Parameters<EditorView['dispatch']>) => {
      for (const s of specs as unknown[]) {
        const tr = s as { isUserEvent?: (e: string) => boolean; scrollIntoView?: boolean };
        if (tr.isUserEvent) events.push(`${tr.isUserEvent('input.type') ? 'input.type' : 'other'}${tr.scrollIntoView ? ' scroll' : ''}`);
      }
      return (orig as (...a: unknown[]) => void)(...(specs as unknown[]));
    }) as EditorView['dispatch'];
    v.dispatch({ selection: { anchor: 1 } });
    expect(typeText(v, 'X')).toBe(true);
    expect(doc(v)).toBe('aXb');
    expect(head(v)).toBe(2);
    expect(events).toContain('input.type scroll');
    // Over a selection.
    v.dispatch({ selection: { anchor: 0, head: 2 } });
    typeText(v, 'q');
    expect(doc(v)).toBe('qb');
  });

  it('nothing for no text, and nothing in a read-only buffer', () => {
    const v = lua('ab');
    expect(typeText(v, '')).toBe(false);
    expect(doc(v)).toBe('ab');
    const ro = lua('ab', true);
    expect(typeText(ro, 'x')).toBe(false);
    expect(doc(ro)).toBe('ab');
  });

  it('the input handlers come first: Lua\'s brackets and quotes close once, and the closer typed steps over', () => {
    const v = lua('');
    typeText(v, '(');
    expect(doc(v)).toBe('()');
    expect(head(v)).toBe(1);
    typeText(v, '"');
    expect(doc(v)).toBe('("")');
    typeText(v, 'a');
    typeText(v, '"');
    typeText(v, ')');
    expect(doc(v)).toBe('("a")');
    expect(head(v)).toBe(5);
  });

  it('the profile editor\'s `{` closes, `}` steps over, and Backspace right after the pair deletes both (`pairDelete`)', () => {
    const v = profile('');
    typeText(v, '{');
    expect(doc(v)).toBe('{}');
    expect(key(v, 'Backspace')).toBe(true);
    expect(doc(v)).toBe('');
    typeText(v, '{');
    typeText(v, 'k');
    typeText(v, '}');
    expect(doc(v)).toBe('{k}');
    expect(head(v)).toBe(3);
  });

  it('typing a name opens the completion (an `input.type` event starts it)', () => {
    const v = lua('');
    typeText(v, 's');
    typeText(v, 'e');
    expect(completionStatus(v.state)).not.toBeNull();
  });
});

describe('our keys through the buffer\'s own bindings', () => {
  it('Lua: Backspace deletes a bracket pair, Enter after a block header closes the block, Tab indents and Shift+Tab takes it back', () => {
    const v = lua('');
    typeText(v, '(');
    expect(key(v, 'Backspace')).toBe(true);
    expect(doc(v)).toBe('');
    for (const ch of 'if x then') typeText(v, ch);
    // (The completion list is not open in this buffer: Enter is the block's.)
    v.dispatch({ selection: { anchor: doc(v).length } });
    expect(key(v, 'Enter')).toBe(true);
    expect(doc(v)).toBe('if x then\n  \nend');
    expect(head(v)).toBe('if x then\n  '.length);
    expect(key(v, 'Tab')).toBe(true);
    expect(doc(v)).toBe('if x then\n    \nend');
    expect(key(v, 'Tab', true)).toBe(true);
    expect(doc(v)).toBe('if x then\n  \nend');
  });

  it('the caret keys move the caret by one character', () => {
    const v = lua('abc');
    end(v);
    expect(key(v, 'ArrowLeft')).toBe(true);
    expect(head(v)).toBe(2);
    expect(key(v, 'ArrowRight')).toBe(true);
    expect(head(v)).toBe(3);
  });

  it('`ownEditor` is the view\'s: `insert` types, `editable` follows the buffer', () => {
    const v = lua('');
    const ed = ownEditor(v);
    expect(ed.editable()).toBe(true);
    ed.insert('[');
    expect(doc(v)).toBe('[]');
  });
});
