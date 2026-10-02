// A manual on the grid (ADR 0037 HELP view; stage 10 feedback round 1):
// the menu of sections on the left, the text on the right, each with the
// TUI scrollbar. The profile editor's HELP view and the script MANUAL use
// it. Both columns scroll natively (pixels, like EDITOR); the keys scroll
// by rows and jump by section.
//
// Keys come from the frame (`ctl.key`): in the menu ↑↓ move from section
// to section and → / Enter go to the text; in the text ↑↓ scroll a row,
// Enter a page, ← goes to the menu; both: PgUp/PgDn page, Home/End, n/p
// next/previous heading. `'up-out'` asks the frame to move focus up (↑ on
// the first section or at the top of the text).

import type { VNode } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { indent } from '../chrome/kit/widgets';
import { TuiScrollbar, cellHeight, useScrollBox, useScrollWatch } from '../chrome/kit/scroll';
import {
  HELP_MENU_GAP,
  type HelpLayout,
  type HelpLine,
  type HelpMenuRow,
  helpCurrent,
  helpMenuRow,
  helpStep,
} from './help';

export type ManualZone = 'menu' | 'help';

export interface ManualControl {
  /**
   * A key for the manual: true consumed, `'up-out'` leave upward, false not
   * ours. `outside`: focus is elsewhere in the frame (only PgUp/PgDn,
   * Home/End and n/p scroll then).
   */
  key(e: KeyboardEvent, nk: string | null, zone: ManualZone | 'outside'): boolean | 'up-out';
  /** Puts section `i`'s heading on the top row. */
  goto(i: number): void;
  /** The section shown now. */
  section(): number;
}

export interface ManualViewProps {
  layout: HelpLayout;
  /** The menu rows, or null for no menu (a narrow frame). */
  menu: readonly HelpMenuRow[] | null;
  /** The menu's text width in cells. */
  menuW: number;
  /** Cells of the text column, scrollbar included. */
  width: number;
  /** Rows tall. */
  height: number;
  /** Which column has the keyboard (null: neither). */
  focus: ManualZone | null;
  onZone: (z: ManualZone) => void;
  /** Filled in at each render. */
  ctl: { current: ManualControl | null };
  /** The section to show first. */
  initial?: number;
  /** Turns a row's plain text into nodes (links). */
  text?: (text: string) => string | (string | VNode)[];
  /** Section changes (for the frame's state, e.g. to restore it). */
  onSection?: (i: number) => void;
}

/** Colour class of a manual row (kit.css roles). */
export const HELP_CLS: Readonly<Record<HelpLine['kind'], string>> = {
  blank: '',
  group: 'wc-c-section',
  heading: 'wc-c-title',
  syntax: 'wc-c-active',
  text: 'wc-c-body',
  note: 'wc-c-hint',
  code: 'wc-c-item',
};

const pad = (s: string, w: number): string => {
  const n = [...s].length;
  return n >= w ? [...s].slice(0, w).join('') : s + ' '.repeat(w - n);
};
const ellipsis = (s: string, w: number): string => ([...s].length <= w ? s : [...s].slice(0, Math.max(0, w - 1)).join('') + '…');

export function ManualView(p: ManualViewProps): VNode {
  const body = useScrollBox();
  const menuBox = useScrollBox();
  const { headings, lines } = p.layout;
  /** The section a jump selected (the last ones cannot reach the top row), until the user scrolls. */
  const [sel, setSel] = useState<number | null>(p.initial ?? null);
  const [cur, setCur] = useState(0);
  const expected = useRef<number | null>(null);
  const section = sel ?? cur;

  const goto = (i: number): void => {
    const j = Math.max(0, Math.min(headings.length - 1, i));
    setSel(j);
    body.toRow(headings[j] ?? 0);
    expected.current = body.ref.current?.scrollTop ?? null;
    setCur(helpCurrent(headings, body.topRow()));
  };

  // The text scrolled: the current section follows unless it was our jump.
  useScrollWatch(body.ref, (el) => {
    const top = Math.round(el.scrollTop / cellHeight(el));
    setCur(helpCurrent(headings, top));
    if (expected.current !== null && Math.abs(el.scrollTop - expected.current) > 2) {
      expected.current = null;
      setSel(null);
    }
  });

  // First show, and a new layout (another width): back to the section.
  useLayoutEffect(() => {
    goto(section);
  }, [p.layout]);

  useEffect(() => p.onSection?.(section), [section]);

  // The menu keeps the current section (and its group label) in view.
  const menuRow = p.menu ? helpMenuRow(p.menu, section) : 0;
  useLayoutEffect(() => {
    if (!p.menu) return;
    const first = p.menu[menuRow - 1]?.kind === 'group' ? menuRow - 1 : menuRow;
    menuBox.show(menuRow);
    menuBox.show(first, menuRow);
  }, [menuRow, p.menu, p.height]);

  const bodyKey = (e: KeyboardEvent, nk: string | null, inBody: boolean): boolean | 'up-out' => {
    if (!e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && (e.key === 'n' || e.key === 'p')) {
      // The last section stays where it is on `n`.
      if (e.key === 'p' || section < headings.length - 1) goto(helpStep(headings, body.topRow(), section, e.key === 'n' ? 1 : -1));
      return true;
    }
    const scroll = (f: () => void): true => {
      f();
      return true;
    };
    switch (nk) {
      case 'pgup':
        return scroll(() => body.page(-1));
      case 'pgdn':
        return scroll(() => body.page(1));
      case 'home':
        return scroll(() => body.home());
      case 'end':
        return scroll(() => body.end());
    }
    if (!inBody) return false;
    switch (nk) {
      case 'up':
        if (body.atTop()) return 'up-out';
        return scroll(() => body.by(-1));
      case 'down':
        return scroll(() => body.by(1));
      case 'activate':
        return scroll(() => body.page(1));
    }
    return false;
  };

  p.ctl.current = {
    goto,
    section: () => section,
    key(e, nk, zone) {
      if (zone === 'outside') return bodyKey(e, nk, false);
      if (zone === 'menu' && p.menu) {
        switch (nk) {
          case 'up':
            if (section === 0) return 'up-out';
            goto(section - 1);
            return true;
          case 'down':
            goto(section + 1);
            return true;
          case 'right':
          case 'activate':
            p.onZone('help');
            return true;
        }
        return bodyKey(e, nk, false);
      }
      if (nk === 'left' && p.menu) {
        p.onZone('menu');
        return true;
      }
      return bodyKey(e, nk, true);
    },
  };

  const textW = p.width - 1;
  // The rows do not change while scrolling: built once per layout.
  const rows = useMemo(
    () =>
      lines.map((l, i) => (
        <div class="wc-line" key={i} data-kind={l.kind}>
          <span class={'wc-ped-help-text ' + HELP_CLS[l.kind]} style={{ width: `calc(var(--cell-w) * ${textW})`, ...indent(l.indent) }}>
            {l.segs.map((s) => (s.cls ? <span class={`wc-syn-${s.cls}`}>{s.text}</span> : p.text ? p.text(s.text) : s.text))}
          </span>
        </div>
      )),
    [lines, textW],
  );

  const height = `calc(var(--cell-h) * ${p.height})`;
  return (
    <div class="wc-ped-help" style={{ height }}>
      {p.menu && (
        <>
          <div class="wc-ped-menu" style={{ width: `calc(var(--cell-w) * ${p.menuW + 1})`, height }}>
            <div class="wc-scrollbox wc-ped-menu-rows" ref={menuBox.ref} style={{ width: `calc(var(--cell-w) * ${p.menuW})` }} onMouseDown={(e) => e.preventDefault()}>
              {p.menu.map((r, vi) => {
                const text = pad(' ' + ellipsis(r.label, p.menuW - 2), p.menuW);
                const isCur = r.kind === 'entry' && r.section === section;
                return (
                  <div class="wc-line" key={vi}>
                    {r.kind === 'entry' ? (
                      <span
                        class={'wc-tr' + (isCur ? (p.focus === 'menu' ? ' is-cur-focus' : ' is-cur') : '')}
                        data-section={r.label}
                        onClick={() => {
                          goto(r.section);
                          p.onZone('menu');
                        }}
                      >
                        {text}
                      </span>
                    ) : (
                      <span class="wc-ped-menu-label wc-c-hint">{pad(text, p.menuW)}</span>
                    )}
                  </div>
                );
              })}
            </div>
            <TuiScrollbar target={menuBox.ref} rows={p.height} />
          </div>
          <div style={{ width: `calc(var(--cell-w) * ${HELP_MENU_GAP})`, flex: '0 0 auto' }} />
        </>
      )}
      <div
        class={'wc-ped-manual' + (p.focus === 'help' ? ' is-focus' : '')}
        style={{ height }}
        onMouseDown={(e) => {
          if (!(e.target as Element).closest('a')) e.preventDefault();
          p.onZone('help');
        }}
      >
        <div class="wc-scrollbox wc-ped-manual-rows" ref={body.ref} style={{ width: `calc(var(--cell-w) * ${textW})` }}>
          {rows}
        </div>
        <TuiScrollbar target={body.ref} rows={p.height} />
      </div>
    </div>
  );
}
