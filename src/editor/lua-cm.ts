// CodeMirror 6 set-up for the script editor (spec §2.10): Lua 5.4 through
// the legacy Lua stream mode, completion, hover and signature help from
// the API docs (lua-api.ts) and the plain Lua docs (lua-ref.ts), keyword
// snippets. Lives in the lazy editor chunk with cm.ts.
//
// Keys reach CodeMirror through `handleKey` (cm.ts), as in the profile
// editor: the chrome's frame stack routes every key at window capture
// phase. Completion's keys (↑↓ Enter Escape, Ctrl+Space) are ordinary
// keymap bindings, so they work that way too.
//
// Code-editor keys (stage 10 feedback round 4): Tab accepts an open
// completion, else moves to the next snippet field, else indents (spaces
// to the next indent stop at the cursor; the lines of a selection);
// Shift+Tab goes back a field or dedents. Enter after a block header
// closes the block (lua-blocks.ts). A known name typed in the wrong case
// is corrected when the word is finished (lua-case.ts), as its own undo
// step.

import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
  acceptCompletion,
  autocompletion,
  clearSnippet,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  completionStatus,
  hasNextSnippetField,
  hasPrevSnippetField,
  nextSnippetField,
  prevSnippetField,
  snippetCompletion,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentLess, indentMore, isolateHistory } from '@codemirror/commands';
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
import { EditorSelection, EditorState, type Extension, Prec, StateEffect, StateField, type Text, Transaction } from '@codemirror/state';
import {
  type Command,
  EditorView,
  type PluginValue,
  ViewPlugin,
  type ViewUpdate,
  type Tooltip,
  closeHoverTooltips,
  hasHoverTooltips,
  highlightActiveLine,
  hoverTooltip,
  keymap,
  lineNumbers,
  showTooltip,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { type SettingDecl, parseHeader } from '../scripts/header';
import type { BufferStatus, ScrollStatus } from './cm';
import { theme } from './cm';
import { type ApiDoc, apiDoc, completeLua, nameAt, stillCompletes } from './lua-api';
import { type Signature, callContext, paramLabel, signatureFor } from './lua-sig';
import { autoCloseAt } from './lua-blocks';
import { caseCorrection } from './lua-case';
import { luaHighlightLine } from './lua-highlight';
import { luaIndent } from './lua-indent';
import { REOPEN_EVENT, reopensAfter } from './lua-reopen';
import { type ScriptLintOptions, scriptLint } from './lua-lint';
import { searchExtension } from './search';

export interface LuaBufferOptions {
  text: string;
  readOnly: boolean;
  onStatus: (s: BufferStatus) => void;
  onScroll: (s: ScrollStatus) => void;
  onChange: (text: string) => void;
  onFocus: () => void;
  /** Live error checks (lua-lint.ts). */
  lint?: ScriptLintOptions;
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

/** Lua source as coloured rows (lua-highlight.ts), as in the manual. */
function codeDom(code: string, cls: string, doc: Document): HTMLElement {
  const ex = doc.createElement('div');
  ex.className = cls;
  for (const line of code.split('\n')) {
    const row = doc.createElement('div');
    let at = 0;
    for (const t of luaHighlightLine(line, (n) => apiDoc(n) !== null)) {
      if (t.from > at) row.append(line.slice(at, t.from));
      const span = doc.createElement('span');
      span.className = `wc-syn-${t.cls}`;
      span.textContent = line.slice(t.from, t.to);
      row.append(span);
      at = t.to;
    }
    if (at < line.length) row.append(line.slice(at));
    if (line === '') row.textContent = ' ';
    ex.appendChild(row);
  }
  return ex;
}

/**
 * The hover / completion info box of one entry: signature, description,
 * parameters, return value and example. No F1 hint: the editor's footer
 * says F1 (stage 10 feedback round 5).
 */
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
  if (d.params && d.params.length > 0) {
    const ps = doc.createElement('div');
    ps.className = 'wc-lua-doc-params';
    for (const p of d.params) {
      const row = doc.createElement('div');
      const name = doc.createElement('span');
      name.className = 'wc-lua-doc-pname';
      name.textContent = p.name;
      row.append(name, ` (${p.type}) ${p.doc}`);
      ps.appendChild(row);
    }
    el.appendChild(ps);
  }
  if (d.returns) {
    const r = doc.createElement('div');
    r.className = 'wc-lua-doc-returns';
    const label = doc.createElement('span');
    label.className = 'wc-lua-doc-pname';
    label.textContent = 'Returns';
    r.append(label, ` ${d.returns}`);
    el.appendChild(r);
  }
  if (d.example) el.appendChild(codeDom(d.example, 'wc-lua-doc-example', doc));
  return el;
}

const TYPE: Readonly<Record<ApiDoc['kind'], string>> = {
  function: 'function',
  variable: 'variable',
  table: 'namespace',
  tag: 'keyword',
  keyword: 'keyword',
};

/** `(a, b)` of a signature: the call's parameters (a method's without `s`). */
function paramsDetail(d: ApiDoc, method: boolean): string {
  if (d.params) return `(${(method ? d.params.slice(1) : d.params).map(paramLabel).join(', ')})`;
  return d.sig.slice(d.name.length).replace(/ → .*/, '');
}

/** The completion options of one entry: a keyword gives one per snippet. */
function toCompletions(d: ApiDoc, method: boolean): Completion[] {
  const info = d.doc ? () => docDom(d) : undefined;
  if (d.kind === 'keyword') {
    if (d.snippets) {
      return d.snippets.map((sn, i) =>
        snippetCompletion(sn.template, { label: d.name, type: 'keyword', detail: sn.detail, boost: -1 - i * 0.01, info }),
      );
    }
    return [{ label: d.name, type: 'keyword', detail: '', boost: -1, ...(info ? { info } : {}) }];
  }
  const c: Completion = {
    label: method ? d.name.slice(d.name.indexOf('.') + 1) : d.name,
    type: TYPE[d.kind],
    detail: d.kind === 'function' ? paramsDetail(d, method) : d.lua && d.kind === 'table' ? 'library' : '',
    boost: d.lua ? -2 : 0,
  };
  if (info) c.info = info;
  return [c];
}

/** The @setting lines of a document, parsed once per document. */
const settingsOf = (() => {
  let last: { doc: Text; settings: readonly SettingDecl[] } | null = null;
  return (doc: Text): readonly SettingDecl[] => {
    if (last?.doc !== doc) last = { doc, settings: parseHeader(doc.toString()).header.settings };
    return last.settings;
  };
})();

/**
 * Completion (lua-api.ts `completeLua`). A `.` or `:` typed opens the
 * members at once (any typed character starts completion; the list stays
 * valid only while more word characters are typed after the word it was
 * asked for, so `math` then `.` asks again, and so does Backspace).
 */
function luaCompletions(ctx: CompletionContext): CompletionResult | null {
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);
  const r = completeLua(before, ctx.explicit, settingsOf(ctx.state.doc));
  if (!r) return null;
  const word = before.slice(r.from);
  return {
    from: line.from + r.from,
    options: r.options.flatMap((d) => toCompletions(d, r.method === true)),
    validFor: (text) => stillCompletes(word, text),
  };
}

/** True where a name completes at the cursor without Ctrl+Space (a single cursor). */
function completesAt(state: EditorState): boolean {
  const sel = state.selection;
  if (sel.ranges.length !== 1 || !sel.main.empty) return false;
  const line = state.doc.lineAt(sel.main.head);
  return completeLua(line.text.slice(0, sel.main.head - line.from), false, settingsOf(state.doc)) !== null;
}

/**
 * The list reopens after an edit that leaves the cursor where a name
 * completes and finds it closed (lua-reopen.ts): Backspace back to
 * `gmcp.`, Delete, Ctrl+Backspace, undo, redo, cut, paste. After the
 * update, in a transaction of its own; an open or pending list is
 * CodeMirror's (its `validFor` asks again for another word).
 */
const reopenCompletion = ViewPlugin.fromClass(
  class implements PluginValue {
    private queued = false;
    private gone = false;

    constructor(private readonly view: EditorView) {}

    destroy(): void {
      this.gone = true;
    }

    update(u: ViewUpdate): void {
      if (!u.docChanged || u.state.readOnly || this.queued) return;
      const edit = u.transactions.some((tr) => reopensAfter(tr, completionStatus(tr.startState) !== null));
      if (!edit) return;
      this.queued = true;
      queueMicrotask(() => {
        this.queued = false;
        const v = this.view;
        if (this.gone || completionStatus(v.state) !== null || !completesAt(v.state)) return;
        v.dispatch({ userEvent: REOPEN_EVENT, annotations: Transaction.addToHistory.of(false) });
      });
    }
  },
);

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

// ------------------------------------------------------ signature help

/** How far back the call scan looks, in characters (lua-sig.ts). */
const SIG_SCAN = 4000;

interface SigState {
  sig: Signature;
  /** Document offset of the callee (the tooltip's anchor) and of the open parenthesis. */
  pos: number;
  open: number;
}

/** Closes the signature help (ESC) until the next `(` or `,` in that call. */
const closeSig = StateEffect.define<null>();
/** Opens it at the cursor (Ctrl+Shift+Space). */
const openSig = StateEffect.define<null>();

function sigAt(state: EditorState): SigState | null {
  const sel = state.selection.main;
  if (!sel.empty) return null;
  const line = state.doc.lineAt(Math.max(0, sel.head - SIG_SCAN));
  const base = line.from;
  const ctx = callContext(state.sliceDoc(base, sel.head));
  if (!ctx) return null;
  const sig = signatureFor(ctx);
  return sig ? { sig, pos: base + ctx.from, open: base + ctx.open } : null;
}

/**
 * The signature help: shown when typing in a call's arguments (`(`, `,`
 * or any input there), kept while the cursor stays in the call, closed
 * by ESC (until the next `(` or `,` in that call) or by leaving it.
 */
const sigField = StateField.define<{ shown: SigState | null; dismissed: number }>({
  create: () => ({ shown: null, dismissed: -1 }),
  update(value, tr) {
    let dismissed = value.dismissed >= 0 && tr.docChanged ? tr.changes.mapPos(value.dismissed, -1) : value.dismissed;
    for (const e of tr.effects) {
      if (e.is(closeSig)) return { shown: null, dismissed: value.shown?.open ?? dismissed };
      if (e.is(openSig)) return { shown: sigAt(tr.state), dismissed: -1 };
    }
    if (!tr.docChanged && !tr.selection) return value;
    let typed = false;
    let trigger = false;
    if (tr.docChanged && (tr.isUserEvent('input') || tr.isUserEvent('delete'))) {
      typed = true;
      tr.changes.iterChanges((_fa, _ta, _fb, _tb, ins) => {
        if (/[(,]/.test(ins.toString())) trigger = true;
      });
    }
    if (!value.shown && !typed) return { shown: null, dismissed };
    const next = sigAt(tr.state);
    if (!next) return { shown: null, dismissed };
    if (trigger) dismissed = -1;
    if (next.open === dismissed) return { shown: null, dismissed };
    return { shown: next, dismissed };
  },
  provide: (f) =>
    showTooltip.compute([f], (state) => {
      const s = state.field(f).shown;
      if (!s) return null;
      return { pos: s.pos, above: true, strictSide: false, arrow: false, create: (view) => ({ dom: sigDom(s.sig, view.dom.ownerDocument) }) };
    }),
});

/** The signature line with the current parameter marked, then that parameter's description. */
export function sigDom(s: Signature, doc: Document = document): HTMLElement {
  const el = doc.createElement('div');
  el.className = 'wc-lua-sig';
  const line = doc.createElement('div');
  line.className = 'wc-lua-doc-sig';
  line.append(`${s.name}(`);
  s.params.forEach((p, i) => {
    if (i > 0) line.append(', ');
    const span = doc.createElement('span');
    span.textContent = paramLabel(p);
    if (i === s.active) span.className = 'wc-lua-sig-active';
    line.append(span);
  });
  line.append(`)${s.returns}`);
  el.appendChild(line);
  const p = s.params[s.active];
  const text = doc.createElement('div');
  text.className = 'wc-lua-doc-text';
  if (p) {
    const name = doc.createElement('span');
    name.className = 'wc-lua-doc-pname';
    name.textContent = p.name;
    text.append(name, ` (${p.type}) ${p.doc}`);
  } else text.textContent = s.doc.doc;
  el.appendChild(text);
  return el;
}

/** True while the signature help is shown. */
export function sigShown(view: EditorView): boolean {
  return view.state.field(sigField, false)?.shown != null;
}

/**
 * ESC for the editor's pop-ups, before the frame's own ESC: closes the
 * signature help, a hover, or ends an active snippet. False when none
 * was open.
 */
export function dismissPopups(view: EditorView): boolean {
  if (sigShown(view)) {
    view.dispatch({ effects: closeSig.of(null) });
    return true;
  }
  if (hasHoverTooltips(view.state)) {
    view.dispatch({ effects: closeHoverTooltips });
    return true;
  }
  return clearSnippet(view);
}

/** Tab / Shift+Tab inside an expanded snippet: the next or previous field. False outside one. */
export function snippetTab(view: EditorView, back: boolean): boolean {
  if (back) return hasPrevSnippetField(view.state) && prevSnippetField(view);
  return hasNextSnippetField(view.state) && nextSnippetField(view);
}

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

// ------------------------------------------------------ code-editor keys

/** Tab: the lines of a selection one level deeper; at a cursor, spaces to the next indent stop. */
const indentTab: Command = (view) => {
  const st = view.state;
  if (st.readOnly) return false;
  if (st.selection.ranges.some((r) => !r.empty)) return indentMore(view);
  const unit = st.facet(indentUnit).length || 2;
  view.dispatch(
    st.changeByRange((r) => {
      const col = r.head - st.doc.lineAt(r.head).from;
      const insert = ' '.repeat(unit - (col % unit));
      return { changes: { from: r.head, insert }, range: EditorSelection.cursor(r.head + insert.length) };
    }),
    { scrollIntoView: true, userEvent: 'input.indent' },
  );
  return true;
};

/** Enter after a block header that is not closed yet: a body line and the closer (lua-blocks.ts). */
const closeBlock: Command = (view) => {
  const st = view.state;
  const sel = st.selection;
  if (st.readOnly || sel.ranges.length > 1 || !sel.main.empty) return false;
  const r = autoCloseAt(st.doc.toString(), sel.main.head, st.facet(indentUnit));
  if (!r) return false;
  view.dispatch({
    changes: { from: r.from, to: r.to, insert: r.insert },
    selection: { anchor: r.cursor },
    scrollIntoView: true,
    userEvent: 'input',
  });
  return true;
};

/** Characters that finish a word for the case correction. */
const WORD_END = /^[(.: \n,)]/;

/**
 * The case correction (lua-case.ts): when a word is finished — a `(`,
 * `.`, `:`, space, comma, `)` or Enter typed right after it, or the cursor
 * leaving a word just typed — a known name in the wrong case gets its
 * canonical spelling in a transaction of its own (one Ctrl+Z undoes it).
 * A spelling the user turns back (undo, or typing it again where it was
 * corrected) is never corrected again in this editor.
 */
const caseFix = ViewPlugin.fromClass(
  class implements PluginValue {
    /** Spellings the user turned back. */
    readonly refused = new Set<string>();
    /** Corrections made: where (mapped through edits) and the spelling they replaced. */
    private spots: { pos: number; typed: string }[] = [];
    /** The end of the word being typed (for "the cursor left it"). */
    private typing: number | null = null;

    constructor(private readonly view: EditorView) {}

    update(u: ViewUpdate): void {
      if (u.state.readOnly) return;
      let end: number | null = null;
      if (u.docChanged) {
        this.spots = this.spots.map((s) => ({ ...s, pos: u.changes.mapPos(s.pos, -1) }));
        if (this.typing !== null) this.typing = u.changes.mapPos(this.typing, -1);
        const doc = u.state.doc;
        this.spots = this.spots.filter((s) => {
          if (doc.sliceString(s.pos, s.pos + s.typed.length) !== s.typed) return true;
          this.refused.add(s.typed);
          return false;
        });
        for (const tr of u.transactions) {
          if (!tr.docChanged || !tr.isUserEvent('input') || tr.isUserEvent('input.complete') || tr.isUserEvent('input.autocorrect')) continue;
          tr.changes.iterChanges((_fa, _ta, fb, tb, ins) => {
            const text = ins.toString();
            if (WORD_END.test(text)) {
              end = fb;
              this.typing = null;
            } else if (/^\w+$/.test(text)) this.typing = tb;
          });
        }
      } else if (u.selectionSet && this.typing !== null) {
        const head = u.state.selection.main.head;
        if (head !== this.typing) {
          end = this.typing;
          this.typing = null;
        }
      }
      if (end === null) return;
      const doc = u.state.doc;
      const at = end;
      const fix = caseCorrection(doc.toString(), at, this.refused);
      if (!fix) return;
      // A transaction of its own, after this update.
      queueMicrotask(() => {
        const v = this.view;
        if (v.state.doc !== doc) return;
        this.spots.push({ pos: fix.from, typed: fix.typed });
        v.dispatch({
          changes: { from: fix.from, to: fix.to, insert: fix.canonical },
          annotations: [isolateHistory.of('full'), Transaction.userEvent.of('input.autocorrect')],
        });
      });
    }
  },
);

// ---------------------------------------------------------------- state

/** Visible rows of the completion list. */
const COMPLETION_ROWS = 10;

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
    // Ten rows, the rest scrolled natively (wheel, touchpad, and the
    // selection kept in view by ↑↓ PgUp PgDn).
    '.cm-tooltip.cm-tooltip-autocomplete > ul': {
      fontFamily: 'var(--font-mono)',
      maxHeight: `calc(var(--cell-h) * ${COMPLETION_ROWS})`,
      overflowY: 'auto',
      overscrollBehavior: 'contain',
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
    // CodeMirror caps the width (inline, 400px or the room beside the
    // list); the height stays inside the window and scrolls natively.
    '.cm-completionInfo': {
      padding: '0 var(--cell-w)',
      maxWidth: 'calc(var(--cell-w) * 48)',
      maxHeight: 'min(calc(var(--cell-h) * 20), 50vh)',
      overflowY: 'auto',
      overscrollBehavior: 'contain',
    },
    '.cm-tooltip-hover': { padding: '0 var(--cell-w)', maxWidth: 'calc(var(--cell-w) * 60)' },
    '.cm-tooltip.cm-tooltip-lint': { padding: '0', maxWidth: 'calc(var(--cell-w) * 60)' },
    '.cm-tooltip-lint .cm-diagnostic': { padding: '0 var(--cell-w)', margin: '0', borderLeft: 'none' },
    '.cm-tooltip-section:not(:first-child)': { borderTop: '1px solid var(--c-section)' },
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
      ...(opts.lint ? [scriptLint(opts.lint)] : []),
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
      // Every option in the DOM (the longest list, Ctrl+Space on an empty
      // word, is under 100), so the wheel reaches all of them.
      ...(opts.readOnly ? [] : [closeBrackets(), autocompletion({ override: [luaCompletions], icons: false, maxRenderedOptions: 1000 }), reopenCompletion, caseFix]),
      luaHover,
      sigField,
      searchExtension({ onFocus: opts.onFocus }),
      // Tab accepts a completion even inside a snippet (whose own Tab
      // keymap is Prec.highest and appended later, so this one wins).
      Prec.highest(keymap.of([{ key: 'Tab', run: acceptCompletion }])),
      keymap.of([
        ...closeBracketsKeymap,
        ...completionKeymap,
        { key: 'Tab', run: indentTab, shift: indentLess },
        { key: 'Enter', run: closeBlock },
        {
          key: 'Mod-Shift-Space',
          run: (v) => {
            v.dispatch({ effects: openSig.of(null) });
            return true;
          },
        },
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
