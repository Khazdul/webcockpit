// CodeMirror 6 set-up for the script editor (spec §2.10): Lua 5.4 through
// the legacy Lua stream mode, completion and hover help from one table of
// API docs (lua-api.ts). Lives in the lazy editor chunk with cm.ts.
//
// Keys reach CodeMirror through `handleKey` (cm.ts), as in the profile
// editor: the chrome's frame stack routes every key at window capture
// phase. Completion's keys (↑↓ Enter Escape, Ctrl+Space) are ordinary
// keymap bindings, so they work that way too.

import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
  acceptCompletion,
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  completionStatus,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import {
  HighlightStyle,
  StreamLanguage,
  bracketMatching,
  indentOnInput,
  indentService,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language';
import { lua } from '@codemirror/legacy-modes/mode/lua';
import { EditorSelection, EditorState, type Extension, Prec } from '@codemirror/state';
import { EditorView, type Tooltip, highlightActiveLine, hoverTooltip, keymap, lineNumbers } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import type { BufferStatus, ScrollStatus } from './cm';
import { theme } from './cm';
import { type ApiDoc, completeLua, nameAt } from './lua-api';
import { luaIndent } from './lua-indent';

export interface LuaBufferOptions {
  text: string;
  readOnly: boolean;
  onStatus: (s: BufferStatus) => void;
  onScroll: (s: ScrollStatus) => void;
  onChange: (text: string) => void;
  onFocus: () => void;
}

const luaLanguage = StreamLanguage.define(lua);

/** Lua token colours: the editor's `--c-syn-*` roles, so the light chrome works too (editor.css). */
const luaHighlight = HighlightStyle.define([
  { tag: tags.keyword, class: 'wc-lua-kw' },
  { tag: tags.string, class: 'wc-lua-str' },
  { tag: tags.comment, class: 'wc-lua-comment' },
  { tag: tags.number, class: 'wc-lua-num' },
  { tag: tags.standard(tags.variableName), class: 'wc-lua-std' },
]);

// ------------------------------------------------------------- the docs

/** The hover / completion info box of one API entry. */
export function docDom(d: ApiDoc, doc: Document = document): HTMLElement {
  const el = doc.createElement('div');
  el.className = 'wc-lua-doc';
  const sig = doc.createElement('div');
  sig.className = 'wc-lua-doc-sig';
  sig.textContent = d.sig;
  el.appendChild(sig);
  if (d.doc) {
    const t = doc.createElement('div');
    t.className = 'wc-lua-doc-text';
    t.textContent = d.doc;
    el.appendChild(t);
  }
  return el;
}

const TYPE: Readonly<Record<ApiDoc['kind'], string>> = {
  function: 'function',
  variable: 'variable',
  table: 'namespace',
  tag: 'keyword',
  lua: 'text',
};

function toCompletion(d: ApiDoc): Completion {
  const c: Completion = {
    label: d.name,
    type: TYPE[d.kind],
    detail: d.kind === 'lua' ? 'Lua' : d.kind === 'function' ? d.sig.slice(d.name.length).replace(/ → .*/, '') : '',
    boost: d.kind === 'lua' ? -1 : 0,
  };
  if (d.doc) c.info = () => docDom(d);
  return c;
}

function luaCompletions(ctx: CompletionContext): CompletionResult | null {
  const line = ctx.state.doc.lineAt(ctx.pos);
  const r = completeLua(line.text.slice(0, ctx.pos - line.from), ctx.explicit);
  if (!r) return null;
  return {
    from: line.from + r.from,
    options: r.options.map(toCompletion),
    validFor: /^@?[\w.]*$/,
  };
}

const luaHover = hoverTooltip((view, pos): Tooltip | null => {
  const line = view.state.doc.lineAt(pos);
  const hit = nameAt(line.text, pos - line.from);
  if (!hit) return null;
  return {
    pos: line.from + hit.from,
    end: line.from + hit.to,
    above: true,
    create: () => ({ dom: docDom(hit.doc, view.dom.ownerDocument) }),
  };
});

/** One level per line that opens a block (lua-indent.ts), ahead of the stream mode's own. */
const luaIndentation = Prec.highest(
  indentService.of((cx, pos) => {
    const cur = cx.lineAt(pos, 1);
    let prev: { text: string; indent: number } | null = null;
    for (let p = cur.from; p > 0; ) {
      const l = cx.lineAt(p - 1, -1);
      if (l.text.trim() !== '') {
        prev = { text: l.text, indent: cx.lineIndent(l.from, -1) };
        break;
      }
      p = l.from;
    }
    return luaIndent(prev, cx.textAfterPos(pos, 1), cx.unit);
  }),
);

// ---------------------------------------------------------------- state

function luaTheme(): Extension {
  return EditorView.theme({
    '.cm-tooltip': {
      backgroundColor: 'var(--term-bg)',
      color: 'var(--c-item)',
      border: '1px solid var(--c-section)',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--font-size)',
      lineHeight: 'var(--cell-h)',
      whiteSpace: 'normal',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul': {
      fontFamily: 'var(--font-mono)',
      maxHeight: 'calc(var(--cell-h) * 10)',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
      padding: '0 var(--cell-w)',
      lineHeight: 'var(--cell-h)',
      whiteSpace: 'pre',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      color: 'var(--c-sel-fg)',
      backgroundColor: 'var(--c-focus-bg)',
    },
    '.cm-completionDetail': { color: 'var(--c-hint)', fontStyle: 'normal', marginLeft: 'var(--cell-w)' },
    '.cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionDetail': { color: 'inherit' },
    '.cm-completionMatchedText': { textDecoration: 'none', fontWeight: 'bold' },
    '.cm-completionInfo': { padding: '0 var(--cell-w)', maxWidth: 'calc(var(--cell-w) * 48)' },
    '.cm-tooltip-hover': { padding: '0 var(--cell-w)', maxWidth: 'calc(var(--cell-w) * 60)' },
    '&.cm-focused .cm-matchingBracket': { color: 'var(--c-hover)', backgroundColor: 'var(--c-brace-match-bg)' },
    '.cm-nonmatchingBracket': { color: 'var(--c-err)' },
  });
}

/** A fresh editor state over a script's source. */
export function createLuaState(opts: LuaBufferOptions): EditorState {
  const status = EditorView.updateListener.of((u) => {
    if (u.docChanged) opts.onChange(u.state.doc.toString());
    if (u.docChanged || u.selectionSet || u.focusChanged) {
      const head = u.state.selection.main.head;
      const line = u.state.doc.lineAt(head);
      opts.onStatus({ line: line.number, col: head - line.from + 1, unclosed: 0, stray: 0, hint: null });
    }
    if (u.geometryChanged || u.viewportChanged) {
      const s = u.view.scrollDOM;
      opts.onScroll({ top: s.scrollTop, height: s.scrollHeight, client: s.clientHeight });
    }
  });
  return EditorState.create({
    doc: opts.text,
    selection: EditorSelection.cursor(0),
    extensions: [
      history({ minDepth: 200 }),
      lineNumbers(),
      highlightActiveLine(),
      EditorView.lineWrapping,
      EditorState.readOnly.of(opts.readOnly),
      indentUnit.of('  '),
      luaLanguage,
      luaIndentation,
      syntaxHighlighting(luaHighlight),
      bracketMatching(),
      indentOnInput(),
      ...(opts.readOnly ? [] : [closeBrackets(), autocompletion({ override: [luaCompletions], icons: false })]),
      luaHover,
      keymap.of([
        ...closeBracketsKeymap,
        ...completionKeymap,
        { key: 'Tab', run: acceptCompletion },
        ...defaultKeymap,
        ...historyKeymap,
      ]),
      EditorView.contentAttributes.of({
        spellcheck: 'false',
        autocorrect: 'off',
        autocapitalize: 'off',
        'aria-label': 'Script source',
        'data-wc-native-mouse': '',
      }),
      EditorView.domEventObservers({ focus: () => opts.onFocus() }),
      status,
      theme(),
      luaTheme(),
    ],
  });
}

export function createLuaBuffer(parent: HTMLElement, opts: LuaBufferOptions): EditorView {
  const view = new EditorView({ state: createLuaState(opts), parent });
  view.scrollDOM.addEventListener(
    'scroll',
    () => {
      const s = view.scrollDOM;
      opts.onScroll({ top: s.scrollTop, height: s.scrollHeight, client: s.clientHeight });
    },
    { passive: true },
  );
  return view;
}

/** True while the completion list is open (ESC and Tab then belong to it). */
export function completing(view: EditorView): boolean {
  return completionStatus(view.state) === 'active';
}
