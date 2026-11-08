// The lantern CodeMirror look (stage 42, ADR 0127): the base theme of the
// code wells on the new-look pages (the profile editor, 43; the script
// editor, 44). Package 42e owns this file (and look-code.css).
//
// `lookCodeTheme()`: the user's terminal font (`--lk-mono`), a whole-pixel
// line height, the gutter, a soft current line (only while focused), the
// caret, the search matches, the matching bracket and the lint marks. It
// sets the structure only; every colour is a `--lk-code-*` custom
// property of look-code.css, defined on `.wc-code` for dark and again
// under `[data-light]` for Paper, so one theme serves both and follows the
// host (a window on the Paper background carries `data-light`).
//
// The theme also puts `LOOK_CODE_CLASS` on the editor, so the token
// colours keyed on it (tt++ `wc-syn-*`, Lua `wc-lua-kw|str|comment|num|
// std`), the selection and the match rules apply without the host doing
// anything. The manual's examples (look-manual.tsx) carry the same class
// and get the same colours.
//
// Picked through `BufferOptions.look = 'lantern'` (cm.ts); today's editors
// keep the TUI look ('tui', the default) until stages 43 and 44. The Lua
// editor's pop-up plates (completion, hover, signature, the lint tooltip)
// stay with lua-cm.ts (44b).

import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import './look-code.css';

/** The buffer host's class on the lantern pages (and the manual's code wells). */
export const LOOK_CODE_CLASS = 'wc-code';

/** The underline of a lint range: a dashed line in the mark's colour. */
const dashes = (colour: string): Record<string, string> => ({
  backgroundImage: `linear-gradient(90deg, ${colour} 0 3px, transparent 3px 5px)`,
  backgroundRepeat: 'repeat-x',
  backgroundSize: '5px 2px',
  backgroundPosition: 'left bottom',
  paddingBottom: '1px',
});

/** The marker in the lint gutter: a small lit dot (a ring for a warning). */
const dot = (fill: string, ring: boolean): Record<string, string> => ({
  content: 'none',
  width: '7px',
  height: '7px',
  margin: '0 auto',
  borderRadius: '50%',
  background: ring ? 'transparent' : fill,
  boxShadow: ring ? `inset 0 0 0 1.5px ${fill}` : `0 0 5px ${fill}`,
});

const THEME = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--lk-code-text)',
    backgroundColor: 'var(--lk-code-bg)',
    border: '1px solid var(--lk-code-edge)',
    borderRadius: '5px',
    boxShadow: 'var(--lk-code-in)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--lk-mono, var(--font-mono, ui-monospace, monospace))',
    fontSize: 'var(--lk-code-fs)',
    lineHeight: 'var(--lk-code-lh)',
    letterSpacing: '0',
    fontVariantLigatures: 'none',
    overscrollBehavior: 'contain',
    scrollbarWidth: 'thin',
    scrollbarColor: 'var(--lk-code-thumb) transparent',
    borderRadius: 'inherit',
  },
  '.cm-content': { padding: '10px 0', caretColor: 'var(--lk-code-caret)' },
  '.cm-line': { padding: '0 24px 0 14px' },
  '.cm-gutters': {
    backgroundColor: 'var(--lk-code-gutter-bg)',
    color: 'var(--lk-code-gutter)',
    border: 'none',
    borderRight: '1px solid var(--lk-code-gutter-edge)',
    borderRadius: '5px 0 0 5px',
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 18px', minWidth: '2ch' },
  '.cm-activeLine': { backgroundColor: 'var(--lk-code-line)', boxShadow: 'inset 2px 0 0 var(--lk-code-line-edge)' },
  '&:not(.cm-focused) .cm-activeLine': { backgroundColor: 'transparent', boxShadow: 'none' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--lk-code-gutter-on)' },
  '&:not(.cm-focused) .cm-activeLineGutter': { color: 'inherit' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--lk-code-caret)' },
  '.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: 'var(--lk-code-sel)',
  },
  '.cm-searchMatch': {
    backgroundColor: 'var(--lk-code-match)',
    boxShadow: 'inset 0 0 0 1px var(--lk-code-match-edge)',
    borderRadius: '2px',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'var(--lk-code-match-now)',
    boxShadow: 'inset 0 0 0 1px var(--lk-code-match-now-edge)',
  },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    color: 'inherit',
    backgroundColor: 'transparent',
    boxShadow: 'inset 0 0 0 1px var(--lk-code-brace)',
    borderRadius: '2px',
  },
  '.cm-nonmatchingBracket, &.cm-focused .cm-nonmatchingBracket': { color: 'var(--lk-code-bad)', backgroundColor: 'transparent' },
  '.cm-panels': { backgroundColor: 'transparent', color: 'inherit', zIndex: '3' },
  '.cm-panels.cm-panels-top': { borderBottom: 'none' },
  '.cm-panels.cm-panels-bottom': { borderTop: 'none' },
  '.cm-lintRange-error': dashes('var(--lk-code-bad)'),
  '.cm-lintRange-warning': dashes('var(--lk-code-warn)'),
  '.cm-lintRange-info, .cm-lintRange-hint': dashes('var(--lk-code-gutter-on)'),
  '.cm-gutter-lint': { width: '14px' },
  '.cm-gutter-lint .cm-gutterElement': { padding: '0', display: 'flex', alignItems: 'center' },
  '.cm-lint-marker': { width: '7px', height: '7px' },
  '.cm-lint-marker-error': dot('var(--lk-code-bad)', false),
  '.cm-lint-marker-warning': dot('var(--lk-code-warn)', true),
  '.cm-lint-marker-info': dot('var(--lk-code-gutter-on)', true),
});

const CLASS = EditorView.editorAttributes.of({ class: LOOK_CODE_CLASS });

/** The lantern base theme of a code buffer (dark and Paper from the host's tokens). */
export function lookCodeTheme(): Extension {
  return [THEME, CLASS];
}
