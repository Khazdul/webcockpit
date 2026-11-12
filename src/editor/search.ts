// Find and replace in the CodeMirror buffers (stage 10 feedback; the
// script editor and the profile editor's EDITOR view). The browser's own
// find cannot search CodeMirror's text: only the lines in view are in the
// DOM. So Ctrl+F opens this panel instead.
//
// The search state, the match highlighting and the commands are
// `@codemirror/search`; the panel is ours, in one of two looks
// (`SearchOptions.look`):
//
// `tui` (default; today's editors), drawn in the TUI grammar (kit classes:
// `.wc-field`, `.wc-btn`, `.wc-check`, `--c-*` roles, so the light chrome
// works too):
//
//   ──────────────────────────────────────────────────────────────────────
//   Find    › orc▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁   3 of 12   [ ] Case  [ ] Word  [ ] Regex
//   Replace › ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁   REPLACE  ALL     Enter Next · ESC Close
//
// `lantern` (stage 42e, ADR 0127; the new-look pages, 43 and 44), drawn
// with the lantern kit (look-code.css): a Find field, `n of m`, the Case /
// Word / Regex toggles and the previous / next / close icon buttons; a
// Replace row (Replace, All) when the buffer is editable. With `top` it
// sits at the top of the buffer (the script editor's find row slides down
// inside the code well).
//
//   Find     [ orc               ]  3 of 12   (Case|Word|Regex)  ˄ ˅ ✕
//   Replace  [                   ]  (Replace) (All)
//
// The replace row is there whenever the buffer is editable (Ctrl+H moves
// to it). Keys never reach the panel's own listeners: the chrome's frame
// stack routes every key at window capture phase (ADR 0013), so the
// frame calls `searchFrameKey` and the panel's keys are handled here; the
// keys are the same in both looks.

import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  replaceAll,
  replaceNext,
  search,
  searchPanelOpen,
  setSearchQuery,
} from '@codemirror/search';
import { EditorSelection, type Extension } from '@codemirror/state';
import { EditorView, type Panel, type ViewUpdate } from '@codemirror/view';
import { h, render } from 'preact';
import { Field, GlassButton, Seg } from '../chrome/kit/look-controls';
import { ownFieldAttrs } from '../core/own-keyboard';
import { FIND_HINT, RULE, TOGGLES, type Toggle, formatCount } from './manual-search';

export interface SearchOptions {
  /** Something in the panel got focus (the frame's zone follows). */
  onFocus?: () => void;
  /**
   * The panel's look (stage 42e, ADR 0127): `tui` today's, `lantern` a
   * Field, `n of m`, the toggles and icon buttons, a Replace row when
   * editable. Default `tui`.
   */
  look?: 'tui' | 'lantern';
  /** The panel at the top of the buffer (default: at the bottom). */
  top?: boolean;
}

/** Matches counted for "n of m"; more shows as "1000+". */
const COUNT_MAX = 1000;

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** "3 of 12", "12 matches", "No matches" or "Bad regex", with its colour class. */
export function countText(query: SearchQuery, view: EditorView): { text: string; cls: string } {
  if (!query.search) return { text: '', cls: 'wc-c-hint' };
  if (!query.valid) return { text: 'Bad regex', cls: 'wc-c-err' };
  const sel = view.state.selection.main;
  const cur = query.getCursor(view.state);
  let n = 0;
  let at = 0;
  for (let r = cur.next(); !r.done; r = cur.next()) {
    n++;
    if (r.value.from === sel.from && r.value.to === sel.to) at = n;
    if (n >= COUNT_MAX) return { text: `${COUNT_MAX}+ matches`, cls: 'wc-c-body' };
  }
  return formatCount(n, at);
}

/** The panel's query logic and keys, shared by both looks; a look draws the fields. */
abstract class SearchPanel implements Panel {
  abstract readonly dom: HTMLElement;
  readonly top: boolean;
  protected query: SearchQuery;
  /** Where typing in the find field searches from (the cursor when the panel opened). */
  protected origin: number;

  constructor(
    protected readonly view: EditorView,
    protected readonly opts: SearchOptions,
  ) {
    this.top = !!opts.top;
    this.query = getSearchQuery(view.state);
    this.origin = view.state.selection.main.from;
    panels.set(view, this);
  }

  /** The find field (its value is the query's text). */
  protected abstract get findInput(): HTMLInputElement;
  /** The replace field; null for a read-only buffer. */
  protected abstract get replaceInput(): HTMLInputElement | null;
  /** The fields and toggles to the query: the match count and the toggles. */
  protected abstract sync(): void;

  mount(): void {
    this.focusFind();
  }

  destroy(): void {
    if (panels.get(this.view) === this) panels.delete(this.view);
  }

  update(u: ViewUpdate): void {
    const q = getSearchQuery(u.state);
    if (!q.eq(this.query)) {
      this.query = q;
      if (this.findInput.value !== q.search) this.findInput.value = q.search;
      const r = this.replaceInput;
      if (r && r.value !== q.replace) r.value = q.replace;
      this.sync();
    } else if (u.docChanged || u.selectionSet) this.sync();
  }

  protected spec(over: Partial<Record<Toggle, boolean>> = {}): SearchQuery {
    return new SearchQuery({
      search: this.findInput.value,
      replace: this.replaceInput?.value ?? '',
      caseSensitive: over.caseSensitive ?? this.query.caseSensitive,
      wholeWord: over.wholeWord ?? this.query.wholeWord,
      regexp: over.regexp ?? this.query.regexp,
      literal: this.query.literal,
    });
  }

  /** Sets the query from the fields; typing in Find moves to the first match from where the search began. */
  protected commit(seek: boolean, q = this.spec()): void {
    if (q.eq(this.query)) return;
    this.query = q;
    const effects = setSearchQuery.of(q);
    if (seek && q.valid && q.search) {
      const m = q.getCursor(this.view.state, this.origin).next();
      const hit = m.done ? q.getCursor(this.view.state).next() : m;
      if (!hit.done) {
        this.view.dispatch({
          effects: [effects, EditorView.scrollIntoView(hit.value.from, { y: 'center' })],
          selection: EditorSelection.single(hit.value.from, hit.value.to),
          userEvent: 'select.search',
        });
        this.sync();
        return;
      }
    }
    this.view.dispatch({ effects });
    // No selection change follows: the count ("No matches", "Bad regex") is drawn here.
    this.sync();
  }

  toggle(k: Toggle): void {
    this.commit(true, this.spec({ [k]: !this.query[k] }));
    this.sync();
  }

  go(dir: 1 | -1): void {
    this.commit(false);
    if (dir > 0) findNext(this.view);
    else findPrevious(this.view);
    this.origin = this.view.state.selection.main.from;
  }

  replaceOne(): void {
    this.commit(false);
    replaceNext(this.view);
  }

  replaceEvery(): void {
    this.commit(false);
    replaceAll(this.view);
  }

  focusFind(): void {
    this.findInput.focus();
    this.findInput.select();
  }

  focusReplace(): boolean {
    const r = this.replaceInput;
    if (!r) return false;
    r.focus();
    r.select();
    return true;
  }

  /** A key while focus is in the panel: true consumed, false the field's own (typing). */
  key(e: KeyboardEvent): boolean {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    const replace = this.replaceInput;
    const inReplace = replace !== null && e.target === replace;
    if (e.key === 'Escape' && !mod && !e.altKey) {
      closeSearch(this.view);
      return true;
    }
    if (e.key === 'Enter' && !e.altKey) {
      if (inReplace) {
        if (mod) this.replaceEvery();
        else this.replaceOne();
      } else this.go(e.shiftKey ? -1 : 1);
      return true;
    }
    if (e.key === 'F3' || (mod && k === 'g' && !e.altKey)) {
      this.go(e.shiftKey ? -1 : 1);
      return true;
    }
    if (mod && !e.altKey && k === 'f') {
      this.focusFind();
      return true;
    }
    if (mod && !e.altKey && k === 'h') {
      this.focusReplace();
      return true;
    }
    if (e.altKey && !mod) {
      const t = TOGGLES.find((x) => x.hotkey === k);
      if (t) {
        this.toggle(t.key);
        return true;
      }
    }
    if (!mod && !e.altKey && (e.key === 'Tab' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      if (replace) {
        if (inReplace) this.focusFind();
        else this.focusReplace();
      }
      return true;
    }
    return false;
  }
}

/** The TUI panel: a rule and one or two grid rows. */
class TuiSearchPanel extends SearchPanel {
  readonly dom: HTMLElement;
  private readonly find: HTMLInputElement;
  private readonly replace: HTMLInputElement | null;
  private readonly count: HTMLElement;
  private readonly checks = new Map<Toggle, HTMLElement>();

  constructor(view: EditorView, opts: SearchOptions) {
    super(view, opts);
    const doc = view.dom.ownerDocument;
    const readOnly = view.state.readOnly;

    this.dom = el(doc, 'div', 'wc-search');
    this.dom.setAttribute('role', 'search');
    this.dom.addEventListener('focusin', () => opts.onFocus?.());
    this.dom.appendChild(el(doc, 'div', 'wc-search-rule wc-c-section', RULE));

    const field = (label: string, aria: string): [HTMLElement, HTMLInputElement] => {
      const row = el(doc, 'div', 'wc-search-row');
      row.appendChild(el(doc, 'span', 'wc-search-label wc-c-section', label));
      row.appendChild(el(doc, 'span', 'wc-c-accent', '› '));
      const input = el(doc, 'input', 'wc-field wc-search-field');
      input.spellcheck = false;
      input.autocomplete = 'off';
      input.setAttribute('aria-label', aria);
      // A phone: typed in from our own keyboard, as the lantern row's fields (nothing elsewhere).
      for (const [k, v] of Object.entries(ownFieldAttrs())) input.setAttribute(k, v);
      row.appendChild(input);
      this.dom.appendChild(row);
      return [row, input];
    };

    const [findRow, find] = field(readOnly ? 'Find' : 'Find   ', 'Find');
    this.find = find;
    find.setAttribute('main-field', 'true');
    find.value = this.query.search;
    find.addEventListener('input', () => this.commit(true));
    this.count = el(doc, 'span', 'wc-search-count');
    findRow.appendChild(this.count);
    const toggles = el(doc, 'span', 'wc-search-toggles');
    for (const t of TOGGLES) {
      const c = el(doc, 'span', 'wc-check wc-search-check');
      c.title = t.title;
      c.dataset.toggle = t.key;
      c.appendChild(el(doc, 'span', 'wc-check-box', '[ ]'));
      c.appendChild(el(doc, 'span', 'wc-c-item', ' ' + t.label));
      c.addEventListener('mousedown', (e) => e.preventDefault());
      c.addEventListener('click', () => this.toggle(t.key));
      toggles.appendChild(c);
      this.checks.set(t.key, c);
    }
    findRow.appendChild(toggles);

    const btn = (label: string, run: () => void): HTMLElement => {
      const b = el(doc, 'span', 'wc-btn wc-search-btn', ` ${label} `);
      b.dataset.btn = label;
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => run());
      return b;
    };

    if (readOnly) {
      this.replace = null;
      const row = el(doc, 'div', 'wc-search-row');
      row.appendChild(btn('PREV', () => this.go(-1)));
      row.appendChild(doc.createTextNode(' '));
      row.appendChild(btn('NEXT', () => this.go(1)));
      row.appendChild(el(doc, 'span', 'wc-search-hint wc-c-hint', FIND_HINT));
      this.dom.appendChild(row);
    } else {
      const [replRow, replace] = field('Replace', 'Replace');
      this.replace = replace;
      replace.value = this.query.replace;
      replace.addEventListener('input', () => this.commit(false));
      replRow.appendChild(doc.createTextNode('  '));
      replRow.appendChild(btn('REPLACE', () => this.replaceOne()));
      replRow.appendChild(doc.createTextNode(' '));
      replRow.appendChild(btn('ALL', () => this.replaceEvery()));
      replRow.appendChild(el(doc, 'span', 'wc-search-hint wc-c-hint', FIND_HINT));
    }
    this.sync();
  }

  protected get findInput(): HTMLInputElement {
    return this.find;
  }

  protected get replaceInput(): HTMLInputElement | null {
    return this.replace;
  }

  protected sync(): void {
    // Before the constructor has drawn the panel (a commit from the base).
    if (!this.count) return;
    const c = countText(this.query, this.view);
    this.count.textContent = c.text ? `  ${c.text}  ` : '  ';
    this.count.className = 'wc-search-count ' + c.cls;
    for (const [k, e] of this.checks) {
      const on = this.query[k];
      e.classList.toggle('is-on', on);
      e.firstElementChild!.textContent = on ? '[X]' : '[ ]';
    }
  }
}

/** The toggles as `Seg` options (data-opt: case, word, regex). */
const LANTERN_TOGGLES = TOGGLES.map((t) => ({
  value: t.key,
  label: t.label,
  title: t.title,
  id: t.key === 'caseSensitive' ? 'case' : t.key === 'wholeWord' ? 'word' : 'regex',
}));

/** Sets an attribute on a field's input once it is drawn (the kit's `Field` has no prop for it). */
const attrs =
  (set: (el: HTMLInputElement) => void, own: (el: HTMLInputElement | null) => void) =>
  (el: HTMLInputElement | null): void => {
    own(el);
    if (el) set(el);
  };

/**
 * The lantern panel: the kit's Field, Seg and glass buttons, drawn with
 * Preact into the panel's element. Hooks: `.wc-lk-search` (also
 * `.wc-search`, so the frames' focus checks hold), `[data-field=find|
 * replace] input`, `.wc-search-count`, `[data-opt=case|word|regex]`,
 * `[data-btn=prev|next|close|replace|all]`.
 */
class LanternSearchPanel extends SearchPanel {
  readonly dom: HTMLElement;
  private find: HTMLInputElement | null = null;
  private replace: HTMLInputElement | null = null;
  private readonly editable: boolean;
  private readonly findRef: (el: HTMLInputElement | null) => void;
  private readonly replaceRef: (el: HTMLInputElement | null) => void;

  constructor(view: EditorView, opts: SearchOptions) {
    super(view, opts);
    this.editable = !view.state.readOnly;
    this.dom = view.dom.ownerDocument.createElement('div');
    this.dom.className = 'wc-search wc-lk-search' + (this.top ? ' is-top' : ' is-bottom');
    this.dom.setAttribute('role', 'search');
    this.dom.addEventListener('focusin', () => opts.onFocus?.());
    this.findRef = attrs(
      (el) => {
        el.setAttribute('aria-label', 'Find');
        el.setAttribute('main-field', 'true');
        el.autocomplete = 'off';
      },
      (el) => (this.find = el),
    );
    this.replaceRef = attrs(
      (el) => {
        el.setAttribute('aria-label', 'Replace');
        el.autocomplete = 'off';
      },
      (el) => (this.replace = el),
    );
    this.sync();
  }

  protected get findInput(): HTMLInputElement {
    return this.find!;
  }

  protected get replaceInput(): HTMLInputElement | null {
    return this.editable ? this.replace : null;
  }

  override destroy(): void {
    render(null, this.dom);
    super.destroy();
  }

  protected sync(): void {
    // Before the subclass has set up (a commit from the base).
    if (!this.dom) return;
    const q = this.query;
    const c = countText(q, this.view);
    const values = TOGGLES.filter((t) => q[t.key]).map((t) => t.key);
    const findRow = h(
      'div',
      { class: 'wc-lk-srow' },
      h('span', { class: 'wc-lk-slbl', 'aria-hidden': 'true' }, 'Find'),
      h(Field, {
        id: 'find',
        mono: true,
        value: this.find?.value ?? q.search,
        placeholder: 'text or pattern',
        inputRef: this.findRef,
        onInput: () => this.commit(true),
      }),
      h('span', { class: 'wc-search-count' + (c.cls === 'wc-c-err' ? ' is-bad' : ''), 'aria-live': 'polite' }, c.text),
      h(Seg, {
        label: 'Find options',
        multi: true,
        options: LANTERN_TOGGLES,
        values,
        onChange: (v: string) => this.toggle(v as Toggle),
      }),
      h(
        'span',
        { class: 'wc-lk-sbtns' },
        h(GlassButton, { icon: 'up', small: true, id: 'prev', title: 'Previous (Shift+Enter)', onClick: () => this.go(-1) }),
        h(GlassButton, { icon: 'down', small: true, id: 'next', title: 'Next (Enter)', onClick: () => this.go(1) }),
        h(GlassButton, { icon: 'close', small: true, id: 'close', title: 'Close (Esc)', onClick: () => closeSearch(this.view) }),
      ),
    );
    const replaceRow = this.editable
      ? h(
          'div',
          { class: 'wc-lk-srow' },
          h('span', { class: 'wc-lk-slbl', 'aria-hidden': 'true' }, 'Replace'),
          h(Field, {
            id: 'replace',
            mono: true,
            value: this.replace?.value ?? q.replace,
            placeholder: 'with',
            inputRef: this.replaceRef,
            onInput: () => this.commit(false),
          }),
          h(
            'span',
            { class: 'wc-lk-sbtns' },
            h(GlassButton, { label: 'Replace', small: true, id: 'replace', title: 'Replace (Enter in Replace)', onClick: () => this.replaceOne() }),
            h(GlassButton, { label: 'All', small: true, id: 'all', title: 'Replace all (Ctrl+Enter in Replace)', onClick: () => this.replaceEvery() }),
          ),
        )
      : null;
    render(h('div', { class: 'wc-lk-sin' }, findRow, replaceRow), this.dom);
  }
}

/** The open panel of each view (the search package keeps its panel constructor private). */
const panels = new WeakMap<EditorView, SearchPanel>();

function panelOf(view: EditorView): SearchPanel | null {
  return panels.get(view) ?? null;
}

/** The search extension: state, highlighting and the panel (TUI at the bottom, or the lantern look). */
export function searchExtension(opts: SearchOptions = {}): Extension {
  const make = opts.look === 'lantern' ? (v: EditorView) => new LanternSearchPanel(v, opts) : (v: EditorView) => new TuiSearchPanel(v, opts);
  return search({
    top: !!opts.top,
    createPanel: make,
    scrollToMatch: (r) => EditorView.scrollIntoView(r, { y: 'center' }),
  });
}

/** True while the panel is open. */
export function searchOpen(view: EditorView): boolean {
  return searchPanelOpen(view.state);
}

/** True when keyboard focus is in the panel (one of its fields). */
export function searchFocused(view: EditorView): boolean {
  const panel = view.dom.querySelector('.wc-search');
  return !!panel && panel.contains(view.dom.ownerDocument.activeElement);
}

/** Opens the panel (or focuses it), with the selection as the query when it is one line. */
export function openSearch(view: EditorView, replace = false): void {
  openSearchPanel(view);
  const p = panelOf(view);
  if (!p) return;
  if (replace && p.focusReplace()) return;
  p.focusFind();
}

/** Closes the panel; the buffer gets the focus back. */
export function closeSearch(view: EditorView): void {
  const had = searchFocused(view);
  closeSearchPanel(view);
  if (had || !view.hasFocus) view.focus();
}

/**
 * The search keys of a frame that holds `view`; call it before the
 * frame's own keys (ESC, Tab). True: consumed (prevent the default).
 * False: focus is in a search field and the key is the field's own
 * (typing, ←→, Ctrl+Z): leave it to the browser. Null: not a search key.
 *
 * Ctrl+F opens or focuses Find; Ctrl+H Replace (editable buffers); Enter
 * and F3 next, Shift+Enter and Shift+F3 previous; Enter in Replace
 * replaces (Ctrl+Enter all); Alt+C/W/R toggle case, word, regex; Tab and
 * ↑↓ move between the fields; ESC closes the panel first, so a second
 * ESC is the frame's.
 */
export function searchFrameKey(view: EditorView, e: KeyboardEvent): boolean | null {
  if (e.isComposing) return null;
  const p = searchOpen(view) ? panelOf(view) : null;
  if (p && searchFocused(view)) return p.key(e);
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (mod && !e.altKey && !e.shiftKey && k === 'f') {
    openSearch(view);
    return true;
  }
  if (mod && !e.altKey && !e.shiftKey && k === 'h' && !view.state.readOnly) {
    openSearch(view, true);
    return true;
  }
  if (!p) return null;
  if (e.key === 'Escape' && !mod && !e.altKey && !e.shiftKey) {
    closeSearch(view);
    return true;
  }
  if (e.key === 'F3' || (mod && !e.altKey && k === 'g')) {
    p.go(e.shiftKey ? -1 : 1);
    return true;
  }
  return null;
}
