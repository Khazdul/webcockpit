// A CodeMirror buffer under the phone's own keyboard (ADR 0139 §6, round
// 53h): the profile editor's Editor view (cm.ts) and the script editor
// (lua-cm.ts). Lives in the lazy editor chunk; the phone chunk never
// imports it. What the two share is src/core/own-keyboard.ts.
//
// - `ownKeyboardExtension()` is empty unless our keyboard is the pages'
//   (`pageKeyboard()`: a phone), so a desktop and a tablet
//   get nothing of this: no attribute, no plugin.
// - On a phone it marks the content element (`inputmode="none"`,
//   `virtualkeyboardpolicy="manual"`, `data-okb-kind="editor"`), so the
//   device's keyboard stays down, and registers the view for that element
//   (`registerOwnEditor`), which is how the keyboard's mount
//   (src/phone/keyboard-pages.ts) finds what to type into.
// - Text (`typeText`) goes the way CodeMirror's own typed text goes: first
//   the `EditorView.inputHandler` handlers (bracket closing, the profile
//   editor's `{`), else one transaction with `userEvent: "input.type"` and
//   `scrollIntoView`, so completion opens, `indentOnInput` and the case
//   correction run, and the caret's line is kept in view.
// - The keys (Enter, Backspace, Tab, Shift+Tab, Esc and the caret keys) are
//   not here: the keyboard sends each as a marked `keydown` at the content
//   element (`sendOwnKey`), and the frame stack hands it to the frame's key
//   handler, which runs the buffer's bindings (`handleKey`) exactly as for a
//   physical key: `closeBlock`, indent, `pairDelete`, completion accept and
//   dismiss, snippet fields, the search keys.
// - Selection stays the browser's and CodeMirror's own (touch handles, long
//   press, paste).

import type { Extension } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';
import { type OwnEditor, ownFieldAttrs, pageKeyboard, registerOwnEditor } from '../core/own-keyboard';

/** The air kept above and below the caret's line when it is brought into view, px. */
export const REVEAL_MARGIN_PX = 6;

/**
 * Types `text` at the selection as a typed key would. False when nothing
 * was typed (a read-only buffer, no text).
 */
export function typeText(view: EditorView, text: string): boolean {
  if (text === '' || view.state.readOnly) return false;
  const { from, to } = view.state.selection.main;
  // (Asked for by a handler, or used below: always from the state as it is then.)
  const insert = () => view.state.update(view.state.replaceSelection(text), { userEvent: 'input.type', scrollIntoView: true });
  if (view.state.facet(EditorView.inputHandler).some((h) => h(view, from, to, text, insert))) return true;
  view.dispatch(insert());
  return true;
}

/** Brings the caret's line into view in the buffer's own scroller. */
export function revealCaret(view: EditorView): void {
  view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: 'nearest', yMargin: REVEAL_MARGIN_PX }) });
}

/** The view as our keyboard sees it. */
export function ownEditor(view: EditorView): OwnEditor {
  return {
    editable: () => !view.state.readOnly && view.contentDOM.isContentEditable !== false,
    insert: (text) => void typeText(view, text),
    reveal: () => revealCaret(view),
  };
}

const register = ViewPlugin.define((view) => ({ destroy: registerOwnEditor(view.contentDOM, ownEditor(view)) }));

/** The buffer's part of our keyboard: nothing where the device's keyboard is the pages' (see the file header). */
export function ownKeyboardExtension(): Extension {
  if (!pageKeyboard()) return [];
  return [EditorView.contentAttributes.of(ownFieldAttrs('editor')), register];
}
