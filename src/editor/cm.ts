// CodeMirror 6 set-up for the editor view (Inv §5.7). Only this file and
// frame.tsx import CodeMirror; both live in the lazy editor chunk.
//
// - tt++ highlighting from syntax.ts as mark decorations (classes wc-syn-*)
//   over the visible lines; inert commands get an underline and a title.
// - Structural brace matching and the balance count from `scanBraces`.
// - `{` auto-closes when the next character is the end, whitespace or `}`;
//   the inserted `}` is tentative: typing `}` steps over it and Backspace
//   right after the insert removes both. Any cursor move by the user, an
//   undo or a redo ends the tracking. Paste never auto-closes.
// - History depth 200, line numbers, soft wrap, current-line band, native
//   selection, clipboard and drag selection. Ctrl+C / Ctrl+X without a
//   selection copy / cut the whole line (CodeMirror's line-wise copy).
// - Alt+↑/↓ swap lines (defaultKeymap's moveLineUp/Down).
// - Ctrl+F find and replace (search.ts; the frame routes its keys).
//
// Keys reach CodeMirror through `handleKey` (runScopeHandlers), not through
// its own keydown listener: the chrome's frame stack routes every key at
// window capture phase and stops it there (ADR 0013, ADR 0015 P3 notes).

import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import {
  type ChangeSpec,
  EditorSelection,
  EditorState,
  type Extension,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type Transaction,
} from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  type PluginValue,
  ViewPlugin,
  type ViewUpdate,
  highlightActiveLine,
  keymap,
  lineNumbers,
  runScopeHandlers,
} from '@codemirror/view';
import { searchExtension } from './search';
import { type BraceScan, braceMatchAt, scanBraces, tokenizeLine } from './syntax';

/** What the frame's footer shows about the buffer. */
export interface BufferStatus {
  line: number;
  col: number;
  unclosed: number;
  stray: number;
  /** The hint of the inert command under the cursor, if any. */
  hint: string | null;
}

export interface ScrollStatus {
  top: number;
  height: number;
  client: number;
}

export interface BufferOptions {
  text: string;
  /** The document's line ending, kept byte for byte. */
  eol: '\n' | '\r\n';
  onStatus: (s: BufferStatus) => void;
  onScroll: (s: ScrollStatus) => void;
  onClipboard: (kind: 'copy' | 'cut') => void;
  onFocus: () => void;
}

// ------------------------------------------------------------ highlighting

const markCache = new Map<string, Decoration>();
function mark(cls: string, hint?: string): Decoration {
  const key = cls + '\0' + (hint ?? '');
  let d = markCache.get(key);
  if (!d) {
    d = hint
      ? Decoration.mark({ class: `wc-syn-${cls} wc-syn-inert`, attributes: { title: `${hint} Kept as text.` } })
      : Decoration.mark({ class: `wc-syn-${cls}` });
    markCache.set(key, d);
  }
  return d;
}

function highlight(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  for (const { from, to } of view.visibleRanges) {
    let line = doc.lineAt(from);
    for (;;) {
      for (const t of tokenizeLine(line.text)) b.add(line.from + t.from, line.from + t.to, mark(t.cls, t.hint));
      if (line.to >= to || line.number >= doc.lines) break;
      line = doc.line(line.number + 1);
    }
  }
  return b.finish();
}

const syntaxPlugin = ViewPlugin.fromClass(
  class implements PluginValue {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = highlight(view);
    }
    update(u: ViewUpdate): void {
      if (u.docChanged || u.viewportChanged) this.decorations = highlight(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

// ---------------------------------------------------- braces and the footer

const matchMark = Decoration.mark({ class: 'wc-brace-match' });

function statusPlugin(opts: BufferOptions): Extension {
  return ViewPlugin.fromClass(
    class implements PluginValue {
      decorations: DecorationSet = Decoration.none;
      scan: BraceScan;
      text: string;
      constructor(view: EditorView) {
        this.text = view.state.doc.toString();
        this.scan = scanBraces(this.text);
        this.refresh(view);
      }
      update(u: ViewUpdate): void {
        if (u.docChanged) {
          this.text = u.state.doc.toString();
          this.scan = scanBraces(this.text);
        }
        if (u.docChanged || u.selectionSet || u.focusChanged) this.refresh(u.view);
      }
      refresh(view: EditorView): void {
        const head = view.state.selection.main.head;
        const m = braceMatchAt(this.scan, this.text, head);
        if (m) {
          const [a, c] = m[0] < m[1] ? m : [m[1], m[0]];
          this.decorations = Decoration.set([matchMark.range(a, a + 1), matchMark.range(c, c + 1)]);
        } else {
          this.decorations = Decoration.none;
        }
        const line = view.state.doc.lineAt(head);
        let hint: string | null = null;
        for (const t of tokenizeLine(line.text)) if (t.hint) hint ??= `#${line.text.slice(t.from + 1, t.to)}: ${t.hint}`;
        opts.onStatus({
          line: line.number,
          col: head - line.from + 1,
          unclosed: this.scan.unclosed,
          stray: this.scan.stray,
          hint,
        });
      }
    },
    { decorations: (v) => v.decorations },
  );
}

// ---------------------------------------------------------- auto-close {

const pushClose = StateEffect.define<number>();

/** Positions of tentative `}` inserted by auto-close, innermost last. */
const pendingClose = StateField.define<readonly number[]>({
  create: () => [],
  update(value, tr: Transaction) {
    for (const e of tr.effects) if (e.is(pushClose)) return [...value.map((p) => tr.changes.mapPos(p, 1)), e.value];
    if (tr.isUserEvent('select') || tr.isUserEvent('undo') || tr.isUserEvent('redo')) return [];
    if (!tr.docChanged && !tr.selection) return value;
    if (value.length === 0) return value;
    const mapped = value.map((p) => tr.changes.mapPos(p, 1));
    const head = tr.newSelection.main.head;
    // The cursor left the innermost pair: stop tracking.
    return mapped.filter((p) => p >= head && tr.newDoc.sliceString(p, p + 1) === '}');
  },
});

const autoClose = EditorView.inputHandler.of((view, from, to, text) => {
  if (view.composing) return false;
  const sel = view.state.selection;
  if (sel.ranges.length !== 1) return false;
  const pend = view.state.field(pendingClose);
  if (text === '}' && from === to && pend[pend.length - 1] === from) {
    view.dispatch({ selection: { anchor: from + 1 }, userEvent: 'input.type' });
    return true;
  }
  if (text !== '{') return false;
  const next = view.state.doc.sliceString(to, to + 1);
  if (next !== '' && !/\s|\}/.test(next)) return false;
  const changes: ChangeSpec = { from, to, insert: '{}' };
  view.dispatch({
    changes,
    selection: EditorSelection.cursor(from + 1),
    effects: pushClose.of(from + 1),
    userEvent: 'input.type',
  });
  return true;
});

/** Backspace right after an auto-insert removes both braces. */
function pairDelete(view: EditorView): boolean {
  const sel = view.state.selection;
  if (sel.ranges.length !== 1 || !sel.main.empty) return false;
  const head = sel.main.head;
  const pend = view.state.field(pendingClose);
  if (pend[pend.length - 1] !== head || view.state.doc.sliceString(head - 1, head + 1) !== '{}') return false;
  view.dispatch({ changes: { from: head - 1, to: head + 1 }, userEvent: 'delete.backward' });
  return true;
}

// ------------------------------------------------------------------- state

export function theme(): Extension {
  return EditorView.theme({
    '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--c-item)' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--font-size)',
      lineHeight: 'var(--cell-h)',
      letterSpacing: 'var(--cell-ls)',
      fontVariantLigatures: 'none',
    },
    '.cm-content': { padding: '0', caretColor: 'var(--c-cursor)' },
    '.cm-line': { padding: '0' },
    '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'var(--c-hint)' },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 var(--cell-w) 0 0',
      minWidth: 'calc(var(--cell-w) * 3)',
    },
    '.cm-activeLine': { backgroundColor: 'var(--c-line-hl)' },
    '&:not(.cm-focused) .cm-activeLine': { backgroundColor: 'transparent' },
  });
}

/** A fresh editor state (fresh undo history) over `opts.text`. */
export function createBufferState(opts: BufferOptions): EditorState {
  return EditorState.create({
    doc: opts.text,
    selection: EditorSelection.cursor(0),
    extensions: [
      EditorState.lineSeparator.of(opts.eol),
      history({ minDepth: 200 }),
      lineNumbers(),
      highlightActiveLine(),
      EditorView.lineWrapping,
      pendingClose,
      autoClose,
      keymap.of([{ key: 'Backspace', run: pairDelete }, ...defaultKeymap, ...historyKeymap]),
      syntaxPlugin,
      statusPlugin(opts),
      searchExtension({ onFocus: opts.onFocus }),
      EditorView.contentAttributes.of({
        spellcheck: 'false',
        autocorrect: 'off',
        autocapitalize: 'off',
        'aria-label': 'Profile text',
        'data-wc-native-mouse': '',
      }),
      EditorView.domEventObservers({
        copy: () => opts.onClipboard('copy'),
        cut: () => opts.onClipboard('cut'),
        focus: () => opts.onFocus(),
      }),
      EditorView.updateListener.of((u) => {
        if (u.geometryChanged || u.viewportChanged) reportScroll(u.view, opts);
      }),
      theme(),
    ],
  });
}

function reportScroll(view: EditorView, opts: BufferOptions): void {
  const s = view.scrollDOM;
  opts.onScroll({ top: s.scrollTop, height: s.scrollHeight, client: s.clientHeight });
}

export function createBuffer(parent: HTMLElement, opts: BufferOptions): EditorView {
  const view = new EditorView({ state: createBufferState(opts), parent });
  view.scrollDOM.addEventListener('scroll', () => reportScroll(view, opts), { passive: true });
  return view;
}

/**
 * Runs a keydown through the buffer's key bindings (the frame stack has
 * already stopped the event, so CodeMirror's own listener never sees it).
 * True when a binding handled it; the caller prevents the default then.
 */
export function handleKey(view: EditorView, e: KeyboardEvent): boolean {
  return runScopeHandlers(view, e, 'editor');
}

/** True when the cursor is on the buffer's first line (↑ then leaves the buffer). */
export function onFirstLine(view: EditorView): boolean {
  const sel = view.state.selection.main;
  if (!sel.empty) return false;
  const line = view.state.doc.lineAt(sel.head);
  if (line.number !== 1) return false;
  // With soft wrap, only the first visual row counts.
  const first = view.lineBlockAt(sel.head);
  const coords = view.coordsAtPos(sel.head);
  const top = view.coordsAtPos(first.from);
  return !coords || !top || Math.abs(coords.top - top.top) < 1;
}

/** Scrolls by `pages` screens (the scrollbar track). */
export function pageScroll(view: EditorView, pages: number): void {
  const s = view.scrollDOM;
  s.scrollTop += pages * s.clientHeight;
}
