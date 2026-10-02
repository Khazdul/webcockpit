// Stage 10 feedback round 6: which edits reopen the script editor's
// completion list (src/editor/lua-reopen.ts).

import { EditorState, type TransactionSpec } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { REOPEN_EVENT, reopensAfter } from '../../src/editor/lua-reopen';

const state = EditorState.create({ doc: 'x = gmcp.Comm', selection: { anchor: 13 } });
const tr = (spec: TransactionSpec) => state.update(spec);
const del = { from: 12, to: 13 };

describe('reopensAfter', () => {
  it('counts typing, deleting, undo, redo, cut and paste', () => {
    for (const userEvent of ['input.type', 'input', 'input.paste', 'delete.backward', 'delete.forward', 'delete.cut', 'delete.selection', 'undo', 'redo']) {
      expect(reopensAfter(tr({ changes: del, userEvent }), false), userEvent).toBe(true);
    }
    expect(reopensAfter(tr({ changes: { from: 13, insert: '.' }, userEvent: 'input.type' }), false)).toBe(true);
  });

  it('ignores cursor moves, the reopen itself, accepted completions and unlabelled changes', () => {
    expect(reopensAfter(tr({ selection: { anchor: 5 }, userEvent: 'select.pointer' }), false)).toBe(false);
    expect(reopensAfter(tr({ selection: { anchor: 5 }, userEvent: 'select' }), true)).toBe(false);
    expect(reopensAfter(tr({ userEvent: REOPEN_EVENT }), false)).toBe(false);
    expect(reopensAfter(tr({ changes: { from: 4, to: 13, insert: 'gmcp.Comm.Channel' }, userEvent: 'input.complete' }), true)).toBe(false);
    expect(reopensAfter(tr({ changes: del }), false)).toBe(false);
  });

  it('counts the case correction only when the list was open before it', () => {
    const fix = tr({ changes: { from: 9, to: 13, insert: 'Comm' }, userEvent: 'input.autocorrect' });
    expect(reopensAfter(fix, true)).toBe(true);
    expect(reopensAfter(fix, false)).toBe(false);
  });

  it('makes CodeMirror take the reopen for typing', () => {
    const t = tr({ userEvent: REOPEN_EVENT });
    expect(t.isUserEvent('input.type')).toBe(true);
    expect(t.docChanged).toBe(false);
  });
});
