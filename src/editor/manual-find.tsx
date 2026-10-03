// The find panel of the manuals (ADR 0070): the read-only variant of the
// buffer search's panel (search.ts), in the same TUI grammar and kit
// classes, so the two look alike and the light chrome works:
//
//   ──────────────────────────────────────────────────────────────────────
//   Find    › orc▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁   3 of 12   [ ] Case  [ ] Word  [ ] Regex
//    PREV   NEXT                           Enter Next · Shift+Enter Prev · ESC Close
//
// Three grid rows under the manual. It only draws: the keys come from the
// frame through the manual (`ManualControl.findKey`, manual-view.tsx).

import type { RefObject, VNode } from 'preact';
import { FIND_HINT, type FindQuery, RULE, TOGGLES } from './manual-search';

/** Rows the panel takes from the manual. */
export const FIND_ROWS = 3;

export interface ManualFindProps {
  query: FindQuery;
  count: { text: string; cls: string };
  /** Cells wide. */
  width: number;
  inputRef: RefObject<HTMLInputElement>;
  onQuery: (q: FindQuery) => void;
  onGo: (dir: 1 | -1) => void;
  onFieldFocus: (on: boolean) => void;
}

export function ManualFind(p: ManualFindProps): VNode {
  const q = p.query;
  const btn = (label: string, dir: 1 | -1): VNode => (
    <span class="wc-btn wc-search-btn" data-btn={label} onMouseDown={(e) => e.preventDefault()} onClick={() => p.onGo(dir)}>
      {` ${label} `}
    </span>
  );
  return (
    <div
      class="wc-search wc-msearch"
      role="search"
      style={{ width: `calc(var(--cell-w) * ${p.width})`, height: `calc(var(--cell-h) * ${FIND_ROWS})` }}
    >
      <div class="wc-search-rule wc-c-section">{RULE}</div>
      <div class="wc-search-row">
        <span class="wc-search-label wc-c-section">Find</span>
        <span class="wc-c-accent">› </span>
        <input
          ref={p.inputRef}
          class="wc-field wc-search-field"
          spellcheck={false}
          autocomplete="off"
          aria-label="Find"
          value={q.search}
          onInput={(e) => p.onQuery({ ...q, search: e.currentTarget.value })}
          onFocus={() => p.onFieldFocus(true)}
          onBlur={() => p.onFieldFocus(false)}
        />
        <span class={'wc-search-count ' + p.count.cls}>{p.count.text ? `  ${p.count.text}  ` : '  '}</span>
        <span class="wc-search-toggles">
          {TOGGLES.map((t) => (
            <span
              key={t.key}
              class={'wc-check wc-search-check' + (q[t.key] ? ' is-on' : '')}
              title={t.title}
              data-toggle={t.key}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => p.onQuery({ ...q, [t.key]: !q[t.key] })}
            >
              <span class="wc-check-box">{q[t.key] ? '[X]' : '[ ]'}</span>
              <span class="wc-c-item">{' ' + t.label}</span>
            </span>
          ))}
        </span>
      </div>
      <div class="wc-search-row">
        {btn('PREV', -1)}
        {' '}
        {btn('NEXT', 1)}
        <span class="wc-search-hint wc-c-hint">{FIND_HINT}</span>
      </div>
    </div>
  );
}
