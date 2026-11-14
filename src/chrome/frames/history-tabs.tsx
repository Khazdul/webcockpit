// History's tab strip (stage 67, ADR 0149 and its addendum; spec §2.5):
// Sessions · Spotlights · Diary over the three pages of stages 45–47,
// which keep their looks (ADR 0130–0132).
//
//   [Back]            ( History )
//          [1] SESSIONS  [2] SPOTLIGHTS  [3] DIARY
//   ───────────────────────────────────────────────
//   the page's own head, body and foot, untouched
//
// Placement P1 of the round 8 mockups: a row of its own under the hood,
// in the band Back stands in, with a rule under it across the window. On
// a narrow page (a phone) it is a row of three equal tabs under Back. The
// digits are drawn as small key caps in the tabs, but not on a touch
// device (`html.wc-phone`).
//
// This module is the leaf the three pages share: the tabs, the context
// the History frame (history.tsx `HistoryFrame`) provides, and
// `useHistoryTabs`, which gives a page its hood title, its window class,
// the strip and the tab keys. A page rendered outside the frame (unit
// tests) has no strip and its own title.
//
// Keys: 1, 2 and 3 change tab. They are free on all three pages (the
// pages' letters and nav keys, ADR 0149's addendum); each page asks
// `key(e)` itself, at the point where its own state allows a tab change
// (not while a run log is opening, the Spotlights viewer plays or a native
// select has the focus).

import { createContext, type VNode } from 'preact';
import { useContext } from 'preact/hooks';
import { inTextField } from '../kit/look-keys';
import './history-tabs.css';

export type HistoryTab = 'sessions' | 'spotlights' | 'diary';

/** The tabs in their order, with their key. */
export const HISTORY_TABS: readonly { tab: HistoryTab; label: string; key: string }[] = [
  { tab: 'sessions', label: 'Sessions', key: '1' },
  { tab: 'spotlights', label: 'Spotlights', key: '2' },
  { tab: 'diary', label: 'Diary', key: '3' },
];

/** The hood's word on every tab. */
export const HISTORY_TITLE = 'History';

/** The tab a key changes to (1, 2, 3 without a modifier), or null. Pure. */
export function tabOfKey(e: { key: string; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean }): HistoryTab | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  return HISTORY_TABS.find((t) => t.key === e.key)?.tab ?? null;
}

export interface HistoryTabsValue {
  tab: HistoryTab;
  go(tab: HistoryTab): void;
}

/** Provided by History's frame around the active tab's page. */
export const HistoryTabsCtx = createContext<HistoryTabsValue | null>(null);

/** The strip (a tablist of three buttons; a click or a tap changes tab). */
export function HistoryTabStrip(p: HistoryTabsValue): VNode {
  return (
    <div class="wc-htabs" role="tablist" aria-label="History">
      {HISTORY_TABS.map((t) => {
        const on = t.tab === p.tab;
        return (
          <button
            key={t.tab}
            type="button"
            role="tab"
            class={'wc-htab' + (on ? ' is-on' : '')}
            aria-selected={on ? 'true' : 'false'}
            aria-keyshortcuts={t.key}
            data-tab={t.tab}
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              if (!on) p.go(t.tab);
            }}
          >
            <span class="wc-htab-k" aria-hidden="true">
              {t.key}
            </span>
            <span class="wc-htab-l">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export interface HistoryTabsUse {
  /** The hood's title: History inside the frame, else the page's own. */
  title: string;
  /** Added to the page's window class (' wc-htabs-win' inside the frame). */
  winClass: string;
  /** The strip, the window's first child (null outside the frame). */
  strip: VNode | null;
  /** A tab key: changes tab and returns true (never in a text field or a select). */
  key(e: KeyboardEvent): boolean;
}

/** What a page needs to stand under History's tabs; `own`: its title outside them. */
export function useHistoryTabs(own: string): HistoryTabsUse {
  const ctx = useContext(HistoryTabsCtx);
  if (!ctx) return { title: own, winClass: '', strip: null, key: () => false };
  return {
    title: HISTORY_TITLE,
    winClass: ' wc-htabs-win',
    strip: <HistoryTabStrip tab={ctx.tab} go={ctx.go} />,
    key(e) {
      if (inTextField(e.target)) return false;
      const to = tabOfKey(e);
      if (!to) return false;
      if (to !== ctx.tab) ctx.go(to);
      return true;
    },
  };
}
