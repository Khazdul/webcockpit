// The lantern CodeMirror look (stage 42, ADR 0127): the base theme of the
// code wells on the new-look pages (the profile editor, 43; the script
// editor, 44). Package 42e owns this file (and look-code.css).
//
// `lookCodeTheme()`: `--lk-mono`, the line height in px, the gutter, a soft
// current line, the selection, the caret, match marks and lint marks, on
// dark and Paper from the host's `--lk-*` tokens. The token colours (tt++
// `wc-syn-*`, Lua `wc-lua-kw|str|comment|num|std`) and the lint / match
// rules are keyed on the buffer host's class, `LOOK_CODE_CLASS`.
//
// Picked through `BufferOptions.look = 'lantern'` (cm.ts); today's editors
// keep the TUI look ('tui', the default) until stages 43 and 44.
//
// 42-0 stub: no theme yet.

import type { Extension } from '@codemirror/state';

/** The buffer host's class on the lantern pages. */
export const LOOK_CODE_CLASS = 'wc-code';

/** The lantern base theme of a code buffer. 42-0 stub: empty. */
export function lookCodeTheme(): Extension {
  return [];
}
