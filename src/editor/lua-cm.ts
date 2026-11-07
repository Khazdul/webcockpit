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
// The look (stage 44b, ADR 0129): stage 42's lantern code theme
// (`lookCodeTheme()`, look-code.ts: the `.wc-code` class, the token
// colours, the gutter, the lint and match marks) and its lantern find panel
// at the top of the buffer; this file adds the pop-ups as small lit plates
// (completion, its info box, hover, signature help, the lint message),
// their structure here (`luaTheme`), their colours and the doc boxes'
// typesetting in script-editor.css. The pop-ups stay inside the box or
// window that holds the editor (`tooltipSpace`).
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
  syntaxTree,
} from '@codemirror/language';
import { lua } from '@codemirror/legacy-modes/mode/lua';
import { searchPanelOpen } from '@codemirror/search';
import {
  EditorSelection,
  EditorState,
  type Extension,
  Prec,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type Text,
  Transaction,
} from '@codemirror/state';
import {
  type Command,
  Decoration,
  type DecorationSet,
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
  tooltips,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { type SettingDecl, parseHeader } from '../scripts/header';
import type { BufferStatus } from './cm';
import { type ApiDoc, apiDoc, completeLua, nameAt, stillCompletes } from './lua-api';
import { type Signature, callContext, paramLabel, signatureFor } from './lua-sig';
import { autoCloseAt } from './lua-blocks';
import { caseCorrection } from './lua-case';
import { type LuaTokenClass, luaHighlightLine } from './lua-highlight';
import { luaIndent } from './lua-indent';
import { REOPEN_EVENT, reopensAfter } from './lua-reopen';
import { type ScriptLintOptions, scriptLint } from './lua-lint';
import { lookCodeTheme } from './look-code';
import { searchExtension } from './search';

export interface LuaBufferOptions {
  text: string;
  readOnly: boolean;
  onStatus: (s: BufferStatus) => void;
  onChange: (text: string) => void;
  onFocus: () => void;
  /** The find panel opened or closed (the frame hides its tools while it is open). */
  onSearch?: (open: boolean) => void;
  /** Live error checks (lua-lint.ts). */
  lint?: ScriptLintOptions;
}

const luaLanguage = StreamLanguage.define(lua);

/** Lua token classes: their colours are the lantern code look's (look-code.css, `.wc-code .wc-lua-*`). */
const luaHighlight = HighlightStyle.define([
  { tag: tags.keyword, class: 'wc-lua-kw' },
  { tag: tags.string, class: 'wc-lua-str' },
  { tag: tags.comment, class: 'wc-lua-comment' },
  { tag: tags.number, class: 'wc-lua-num' },
  { tag: tags.standard(tags.variableName), class: 'wc-lua-std' },
]);

/** True for an API or Lua library name (lua-api.ts). */
const knownName = (name: string): boolean => apiDoc(name) !== null;

const apiMark = Decoration.mark({ class: 'wc-lua-std' });

/**
 * The API names in the lines in view (`send`, `tempTimer`, `store.get`):
 * the stream mode knows only Lua's own builtins, so the editor marks the
 * rest as the manual's examples do (lua-highlight.ts, the longest known
 * dotted prefix), never inside a comment or a string (the syntax tree).
 * Rebuilt on an edit, a scroll or when the parse moves on: a few dozen
 * short lines, a light scan each.
 */
function apiNameMarks(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  const { doc } = view.state;
  const tree = syntaxTree(view.state);
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = doc.lineAt(pos);
      for (const t of luaHighlightLine(line.text, knownName)) {
        if (t.cls !== 'delim') continue;
        const at = line.from + t.from;
        if (/comment|string/.test(tree.resolveInner(at, 1).name)) continue;
        b.add(at, line.from + t.to, apiMark);
      }
      pos = line.to + 1;
    }
  }
  return b.finish();
}

const apiNames = ViewPlugin.fromClass(
  class implements PluginValue {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = apiNameMarks(view);
    }
    update(u: ViewUpdate): void {
      if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) this.decorations = apiNameMarks(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

// ------------------------------------------------------------- the docs

/** lua-highlight.ts's roles as the editor's own token classes (the manual's `codeLine` maps them alike). */
const LUA_CLASS: Readonly<Record<LuaTokenClass, string>> = {
  cmd: 'wc-lua-kw',
  var: 'wc-lua-str',
  code: 'wc-lua-num',
  delim: 'wc-lua-std',
  comment: 'wc-lua-comment',
  brace: '',
};

/** Lua source as coloured rows (lua-highlight.ts), as in the manual. */
function codeDom(code: string, cls: string, doc: Document): HTMLElement {
  const ex = doc.createElement('div');
  ex.className = cls;
  for (const line of code.split('\n')) {
    const row = doc.createElement('div');
    let at = 0;
    for (const t of luaHighlightLine(line, knownName)) {
      if (t.from > at) row.append(line.slice(at, t.from));
      const span = doc.createElement('span');
      span.className = LUA_CLASS[t.cls];
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

/** `name (type) text`: one parameter, the name in the terminal font, the type in italics. */
function paramDom(doc: Document, p: { name: string; type: string; doc: string }, cls: string): HTMLElement {
  const row = doc.createElement('div');
  row.className = cls;
  const name = doc.createElement('span');
  name.className = 'wc-lua-doc-pname';
  name.textContent = p.name;
  const type = doc.createElement('i');
  type.className = 'wc-lua-doc-ptype';
  type.textContent = `(${p.type})`;
  row.append(name, ' ', type, ` ${p.doc}`);
  return row;
}

/** A small-caps label over a part of a doc box ("Parameters", "Returns"). */
function labelDom(doc: Document, text: string): HTMLElement {
  const l = doc.createElement('div');
  l.className = 'wc-lua-doc-label';
  l.textContent = text;
  return l;
}

/**
 * The hover / completion info box of one entry: signature, description,
 * parameters, return value and example. No F1 hint: the editor's tools
 * say F1 in their tooltips (stage 10 feedback round 5; stage 44).
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
    ps.appendChild(labelDom(doc, 'Parameters'));
    for (const p of d.params) ps.appendChild(paramDom(doc, p, 'wc-lua-doc-p'));
    el.appendChild(ps);
  }
  if (d.returns) {
    const r = doc.createElement('div');
    r.className = 'wc-lua-doc-returns';
    const text = doc.createElement('div');
    text.className = 'wc-lua-doc-p';
    text.textContent = d.returns;
    r.append(labelDom(doc, 'Returns'), text);
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
    label: method ? d.name.slice(Math.max(d.name.indexOf('.'), d.name.indexOf(':')) + 1) : d.name,
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
  if (p) el.appendChild(paramDom(doc, p, 'wc-lua-doc-text'));
  else {
    const text = doc.createElement('div');
    text.className = 'wc-lua-doc-text';
    text.textContent = s.doc.doc;
    el.appendChild(text);
  }
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

/** Visible rows of the completion list, and the px of one. */
const COMPLETION_ROWS = 10;
const COMPLETION_ROW_PX = 25;
/** A touch screen: rows of a finger's height (40 px), six of them in about the same room. */
const TOUCH_ROWS = 6;
const TOUCH_ROW_PX = 40;

/**
 * The pop-ups as small lit plates of the Lykta family (round 7, editor C):
 * an iron edge, a lit top lip and a dark glass fill (Paper: parchment). The
 * structure is here; the colours are `--lk-pop-*` (script-editor.css), so
 * one theme serves the dark and the Paper look. The doc boxes' own parts
 * (`.wc-lua-doc-*`, `.wc-diag-*`) are typeset there too.
 */
function luaTheme(): Extension {
  const rows = COMPLETION_ROWS * COMPLETION_ROW_PX;
  return EditorView.theme({
    '.cm-tooltip': {
      border: '1px solid var(--lk-pop-edge)',
      borderRadius: '5px',
      backgroundColor: 'var(--lk-pop-bg)',
      backgroundImage: 'var(--lk-pop-lit)',
      boxShadow: 'var(--lk-pop-sh)',
      color: 'var(--lk-pop-text)',
      font: '500 15px/1.4 var(--lk-serif, Georgia, serif)',
      letterSpacing: 'normal',
      whiteSpace: 'normal',
    },
    // Ten rows, the rest scrolled natively (wheel, touchpad, and the
    // selection kept in view by ↑↓ PgUp PgDn).
    '.cm-tooltip.cm-tooltip-autocomplete > ul': {
      boxSizing: 'border-box',
      minWidth: '250px',
      maxHeight: `${rows + 4}px`,
      padding: '2px 4px',
      font: '400 13px/1 var(--lk-mono, var(--font-mono, monospace))',
      overflowY: 'auto',
      overscrollBehavior: 'contain',
      scrollbarWidth: 'thin',
      scrollbarColor: 'var(--lk-pop-thumb) transparent',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
      display: 'flex',
      alignItems: 'center',
      boxSizing: 'border-box',
      height: `${COMPLETION_ROW_PX}px`,
      padding: '0 10px',
      borderRadius: '3px',
      lineHeight: `${COMPLETION_ROW_PX}px`,
      color: 'var(--lk-pop-item)',
      whiteSpace: 'pre',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      color: 'var(--lk-pop-on)',
      backgroundColor: 'var(--lk-pop-sel)',
    },
    '.cm-completionLabel': { flex: '0 1 auto', overflow: 'hidden', textOverflow: 'ellipsis' },
    '.cm-completionMatchedText': { textDecoration: 'none', fontWeight: '600', color: 'var(--lk-pop-head)' },
    '.cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionMatchedText': { color: 'inherit' },
    '.cm-completionDetail': {
      flex: 'none',
      marginLeft: 'auto',
      paddingLeft: '14px',
      fontSize: '12px',
      fontStyle: 'normal',
      color: 'var(--lk-pop-faint)',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionDetail': { color: 'var(--lk-pop-dim)' },
    // A plate of its own beside the list. CodeMirror caps the width (inline,
    // the room beside the list); the height stays inside the box or window
    // and scrolls natively.
    '.cm-tooltip.cm-completionInfo': {
      boxSizing: 'border-box',
      padding: '10px 14px 11px',
      width: 'max-content',
      maxWidth: '380px',
      maxHeight: `min(${rows + 40}px, 50vh)`,
      overflowY: 'auto',
      overscrollBehavior: 'contain',
      scrollbarWidth: 'thin',
      scrollbarColor: 'var(--lk-pop-thumb) transparent',
    },
    '.cm-completionInfo.cm-completionInfo-right': { marginLeft: '4px' },
    '.cm-completionInfo.cm-completionInfo-left': { marginRight: '4px' },
    '.cm-tooltip.cm-tooltip-hover': { padding: '10px 14px 11px', maxWidth: '420px' },
    '.cm-tooltip.wc-lua-sig': { padding: '9px 14px 10px', maxWidth: '460px' },
    '.cm-tooltip.cm-tooltip-lint': { padding: '0', maxWidth: '460px' },
    '.cm-tooltip-lint .cm-diagnostic': { padding: '8px 14px 9px', margin: '0', border: 'none' },
    '.cm-tooltip-section:not(:first-child)': { borderTop: '1px solid var(--lk-pop-rule)' },
    '.cm-snippetField': { backgroundColor: 'var(--lk-pop-snip)', borderRadius: '2px' },
    // A finger: rows tall enough to hit, and the plates kept inside a phone's
    // frame (the box's edge is about 15 px in on either side, and its border stays clear).
    '@media (pointer: coarse)': {
      '.cm-tooltip.cm-tooltip-autocomplete > ul': { maxHeight: `${TOUCH_ROWS * TOUCH_ROW_PX + 4}px` },
      '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { height: `${TOUCH_ROW_PX}px`, lineHeight: `${TOUCH_ROW_PX}px` },
      '.cm-tooltip.wc-lua-sig, .cm-tooltip.cm-tooltip-lint': { maxWidth: 'min(460px, calc(100vw - 40px))' },
      '.cm-tooltip.cm-tooltip-hover': { maxWidth: 'min(420px, calc(100vw - 40px))' },
    },
  });
}

/** The pop-ups' room: the box or window that holds the editor (its lit content box), else the browser window. */
function tooltipRoom(view: EditorView): DOMRect {
  const host = view.dom.closest('.wc-lk-win');
  if (host) return host.getBoundingClientRect();
  const win = view.dom.ownerDocument.defaultView;
  return new DOMRect(0, 0, win?.innerWidth ?? 0, win?.innerHeight ?? 0);
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
    if (opts.onSearch) {
      const open = searchPanelOpen(u.state);
      if (open !== searchPanelOpen(u.startState)) opts.onSearch(open);
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
      apiNames,
      bracketMatching(),
      indentOnInput(),
      // Every option in the DOM (the longest list, Ctrl+Space on an empty
      // word, is under 100), so the wheel reaches all of them.
      ...(opts.readOnly ? [] : [closeBrackets(), autocompletion({ override: [luaCompletions], icons: false, maxRenderedOptions: 1000 }), reopenCompletion, caseFix]),
      luaHover,
      sigField,
      tooltips({ tooltipSpace: tooltipRoom }),
      // Stage 42's lantern find panel, at the top of the well (it slides down).
      searchExtension({ onFocus: opts.onFocus, look: 'lantern', top: true }),
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
      lookCodeTheme(),
      luaTheme(),
    ],
  });
}

export function createLuaBuffer(parent: HTMLElement, opts: LuaBufferOptions): EditorView {
  return new EditorView({ state: createLuaState(opts), parent });
}

/** True while the completion list is open (ESC and Tab then belong to it). */
export function completing(view: EditorView): boolean {
  return completionStatus(view.state) === 'active';
}
