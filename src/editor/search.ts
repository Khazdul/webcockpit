// Find and replace in the CodeMirror buffers (stage 10 feedback; the
// script editor and the profile editor's EDITOR view). The browser's own
// find cannot search CodeMirror's text: only the lines in view are in the
// DOM. So Ctrl+F opens this panel instead.
//
// The search state, the match highlighting and the commands are
// `@codemirror/search`; the panel is ours, drawn in the TUI grammar (kit
// classes: `.wc-field`, `.wc-btn`, `.wc-check`, `--c-*` roles, so the
// light chrome works too):
//
//   ──────────────────────────────────────────────────────────────────────
//   Find    › orc▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁   3 of 12   [ ] Case  [ ] Word  [ ] Regex
//   Replace › ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁   REPLACE  ALL     Enter Next · ESC Close
//
// The replace row is there whenever the buffer is editable (Ctrl+H moves
// to it). Keys never reach the panel's own listeners: the chrome's frame
// stack routes every key at window capture phase (ADR 0013), so the
// frame calls `searchFrameKey` and the panel's keys are handled here.

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
import { FIND_HINT, RULE, TOGGLES, type Toggle, formatCount } from './manual-search';

export interface SearchOptions {
  /** Something in the panel got focus (the frame's zone follows). */
  onFocus?: () => void;
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

class TuiSearchPanel implements Panel {
  readonly dom: HTMLElement;
  readonly top = false;
  private readonly find: HTMLInputElement;
  private readonly replace: HTMLInputElement | null;
  private readonly count: HTMLElement;
  private readonly checks = new Map<Toggle, HTMLElement>();
  private query: SearchQuery;
  /** Where typing in the find field searches from (the cursor when the panel opened). */
  private origin: number;

  constructor(
    private readonly view: EditorView,
    opts: SearchOptions,
  ) {
    const doc = view.dom.ownerDocument;
    this.query = getSearchQuery(view.state);
    this.origin = view.state.selection.main.from;
    const readOnly = view.state.readOnly;
    panels.set(view, this);

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
      if (this.find.value !== q.search) this.find.value = q.search;
      if (this.replace && this.replace.value !== q.replace) this.replace.value = q.replace;
      this.sync();
    } else if (u.docChanged || u.selectionSet) this.sync();
  }

  /** The fields and toggles to the query: the match count and the check boxes. */
  private sync(): void {
    const c = countText(this.query, this.view);
    this.count.textContent = c.text ? `  ${c.text}  ` : '  ';
    this.count.className = 'wc-search-count ' + c.cls;
    for (const [k, e] of this.checks) {
      const on = this.query[k];
      e.classList.toggle('is-on', on);
      e.firstElementChild!.textContent = on ? '[X]' : '[ ]';
    }
  }

  private spec(over: Partial<Record<Toggle, boolean>> = {}): SearchQuery {
    return new SearchQuery({
      search: this.find.value,
      replace: this.replace?.value ?? '',
      caseSensitive: over.caseSensitive ?? this.query.caseSensitive,
      wholeWord: over.wholeWord ?? this.query.wholeWord,
      regexp: over.regexp ?? this.query.regexp,
      literal: this.query.literal,
    });
  }

  /** Sets the query from the fields; typing in Find moves to the first match from where the search began. */
  private commit(seek: boolean, q = this.spec()): void {
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
        return;
      }
    }
    this.view.dispatch({ effects });
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
    this.find.focus();
    this.find.select();
  }

  focusReplace(): boolean {
    if (!this.replace) return false;
    this.replace.focus();
    this.replace.select();
    return true;
  }

  /** A key while focus is in the panel: true consumed, false the field's own (typing). */
  key(e: KeyboardEvent): boolean {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    const inReplace = this.replace !== null && e.target === this.replace;
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
      if (this.replace) {
        if (inReplace) this.focusFind();
        else this.focusReplace();
      }
      return true;
    }
    return false;
  }
}

/** The open panel of each view (the search package keeps its panel constructor private). */
const panels = new WeakMap<EditorView, TuiSearchPanel>();

function panelOf(view: EditorView): TuiSearchPanel | null {
  return panels.get(view) ?? null;
}

/** The search extension: state, highlighting and the TUI panel at the bottom. */
export function searchExtension(opts: SearchOptions = {}): Extension {
  return search({ createPanel: (view) => new TuiSearchPanel(view, opts), scrollToMatch: (r) => EditorView.scrollIntoView(r, { y: 'center' }) });
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
