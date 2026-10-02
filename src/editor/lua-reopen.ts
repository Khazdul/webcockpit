// When the script editor's completion list reopens by itself (stage 10
// feedback round 6). CodeMirror's autocompletion starts on typed input
// only: Backspace keeps an open list but never opens a closed one, and
// Delete, Ctrl+Backspace, undo, redo, cut and paste close it. After any
// edit that leaves the cursor where a name completes (lua-cm.ts asks
// `completeLua`), a closed list opens again, as in VS Code. Pure; unit
// tested.
//
// Not edits: cursor moves and clicks (an ESC-closed list stays closed
// until the next edit), accepting a completion or a snippet (CodeMirror's
// own), and the case correction, unless the list was open before it.

import type { Transaction } from '@codemirror/state';

/**
 * The user event of the transaction that reopens the list: no change, and
 * CodeMirror's autocompletion takes it for typing, so the list starts as
 * if a character had been typed (not as Ctrl+Space, which also lists
 * every name on an empty word).
 */
export const REOPEN_EVENT = 'input.type.reopen';

/**
 * Whether `tr` is an edit after which the list should be open where the
 * cursor ends: typing, deleting, undo, redo, cut or paste. `wasOpen`: the
 * list was open or pending before it (the case correction then counts,
 * since it closes a list it touches).
 */
export function reopensAfter(tr: Transaction, wasOpen: boolean): boolean {
  if (!tr.docChanged) return false;
  if (tr.isUserEvent('input.complete')) return false;
  if (tr.isUserEvent('input.autocorrect')) return wasOpen;
  return tr.isUserEvent('input') || tr.isUserEvent('delete') || tr.isUserEvent('undo') || tr.isUserEvent('redo');
}
