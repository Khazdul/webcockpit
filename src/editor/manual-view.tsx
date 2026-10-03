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
//
// Ctrl+F opens the find panel under the manual (ADR 0070; manual-find.tsx,
// the logic in manual-search.ts): the frame calls `ctl.findKey` before its
// own keys, as the editors call `searchFrameKey` (search.ts). Matches are
// marked in the rows, the current one like a focused selection; it is
// scrolled into view and the menu's current section follows it.

import type { VNode } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { indent } from '../chrome/kit/widgets';
import { FIND_ROWS, ManualFind } from './manual-find';
import {
  EMPTY_QUERY,
  type FindMatch,
  type FindQuery,
  type FindResult,
  TOGGLES,
  findCountText,
  findInLines,
  firstFrom,
  matchesByLine,
  splitSegs,
  stepMatch,
} from './manual-search';
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
  /**
   * The find keys; call it before the frame's own keys. True consumed,
   * false a key of the find field (typing: leave it to the browser), null
   * not a find key. Ctrl+F opens or focuses the field; Enter, F3 and
   * Ctrl+G next, with Shift previous; Alt+C/W/R toggle case, word,
   * regex; ESC closes the panel first, so a second ESC is the frame's.
   */
  findKey(e: KeyboardEvent): boolean | null;
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
  /** The last find query, kept by the frame while the view is unmounted. */
  findMemory?: { current: FindQuery };
}

const NO_RESULT: FindResult = { valid: true, matches: [], capped: false };

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

  // Find (ADR 0070).
  const ownMemory = useRef<FindQuery>(EMPTY_QUERY);
  const memory = p.findMemory ?? ownMemory;
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState<FindQuery>(memory.current);
  const [hit, setHit] = useState(-1);
  const [fieldFocus, setFieldFocus] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Where typing searches from: the top row when the panel opened, then the current match. */
  const origin = useRef({ line: 0, ch: 0 });
  const seek = useRef(false);
  const wantFocus = useRef(false);
  const texts = useMemo(() => lines.map((l) => l.segs.map((s) => s.text).join('')), [lines]);
  const result = useMemo(() => (findOpen ? findInLines(texts, query) : NO_RESULT), [texts, query, findOpen]);
  const byLine = useMemo(() => matchesByLine(result.matches), [result]);
  const current: FindMatch | null = result.matches[hit] ?? null;
  const viewH = findOpen ? Math.max(1, p.height - FIND_ROWS) : p.height;

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
  }, [menuRow, p.menu, viewH]);

  /** Scrolls match `m` into view (centred when it is out of view); the section follows it. */
  const reveal = (m: FindMatch): void => {
    const vis = body.visibleRows();
    const top = body.topRow();
    if (m.line < top || m.line >= top + vis) body.toRow(Math.max(0, m.line - Math.floor(vis / 2)));
    setSel(helpCurrent(headings, m.line));
    expected.current = body.ref.current?.scrollTop ?? null;
    setCur(helpCurrent(headings, body.topRow()));
  };

  // A new query (typing, a toggle) moves to its first match from the origin;
  // a new layout (another width) only drops the current match.
  useLayoutEffect(() => {
    if (!seek.current) {
      setHit(-1);
      return;
    }
    seek.current = false;
    const i = firstFrom(result.matches, origin.current.line, origin.current.ch);
    setHit(i);
    if (i >= 0) reveal(result.matches[i]!);
  }, [result]);

  // The field takes the focus once it is drawn.
  useLayoutEffect(() => {
    if (!wantFocus.current || !inputRef.current) return;
    wantFocus.current = false;
    inputRef.current.focus({ preventScroll: true });
    inputRef.current.select();
  });

  const onQuery = (q: FindQuery): void => {
    memory.current = q;
    seek.current = true;
    setQuery(q);
  };

  const go = (dir: 1 | -1): void => {
    const ms = result.matches;
    if (ms.length === 0) return;
    let i: number;
    if (hit >= 0) i = stepMatch(hit, ms.length, dir);
    else {
      const f = firstFrom(ms, origin.current.line, origin.current.ch);
      i = dir > 0 ? f : stepMatch(f, ms.length, -1);
    }
    const m = ms[i]!;
    setHit(i);
    origin.current = { line: m.line, ch: m.from };
    reveal(m);
  };

  const fieldFocused = (): boolean => !!inputRef.current && inputRef.current.ownerDocument.activeElement === inputRef.current;

  const openFind = (): void => {
    if (findOpen && inputRef.current) {
      inputRef.current.focus({ preventScroll: true });
      inputRef.current.select();
      return;
    }
    origin.current = { line: body.topRow(), ch: 0 };
    wantFocus.current = true;
    setHit(-1);
    setFindOpen(true);
  };

  /** The frame's root (it holds the keyboard when no field does). */
  const frameRoot = (): HTMLElement | null => body.ref.current?.closest<HTMLElement>('[tabindex]') ?? null;

  const closeFind = (): void => {
    const had = fieldFocused();
    setFindOpen(false);
    setHit(-1);
    setFieldFocus(false);
    p.onZone('help');
    if (had) frameRoot()?.focus({ preventScroll: true });
  };

  /** A press in the manual or the menu takes the keyboard from the find field. */
  const leaveField = (): void => {
    if (fieldFocused()) frameRoot()?.focus({ preventScroll: true });
  };

  const findKey = (e: KeyboardEvent): boolean | null => {
    if (e.isComposing) return null;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    const plainKey = !mod && !e.altKey;
    const next = e.key === 'F3' || (mod && !e.altKey && k === 'g');
    if (findOpen && fieldFocused()) {
      if (e.key === 'Escape' && plainKey) closeFind();
      else if ((e.key === 'Enter' && !e.altKey) || next) go(e.shiftKey ? -1 : 1);
      else if (mod && !e.altKey && k === 'f') openFind();
      else if (e.altKey && !mod) {
        const t = TOGGLES.find((x) => x.hotkey === k);
        if (!t) return false;
        onQuery({ ...query, [t.key]: !query[t.key] });
      } else if (plainKey && (e.key === 'Tab' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) return true;
      else return false;
      return true;
    }
    if (mod && !e.altKey && !e.shiftKey && k === 'f') {
      openFind();
      return true;
    }
    if (!findOpen) return null;
    if (e.key === 'Escape' && plainKey && !e.shiftKey) {
      closeFind();
      return true;
    }
    if (next) {
      go(e.shiftKey ? -1 : 1);
      return true;
    }
    return null;
  };

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
    findKey,
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
  const rowStyle = (l: HelpLine) => ({ width: `calc(var(--cell-w) * ${textW})`, ...indent(l.indent) });
  // The rows do not change while scrolling: built once per layout.
  const plainRows = useMemo(
    () =>
      lines.map((l, i) => (
        <div class="wc-line" key={i} data-kind={l.kind}>
          <span class={'wc-ped-help-text ' + HELP_CLS[l.kind]} style={rowStyle(l)}>
            {l.segs.map((s) => (s.cls ? <span class={`wc-syn-${s.cls}`}>{s.text}</span> : p.text ? p.text(s.text) : s.text))}
          </span>
        </div>
      )),
    [lines, textW],
  );
  // Rows with matches are drawn again with the matches marked (links left out).
  const rows = useMemo(() => {
    if (byLine.size === 0) return plainRows;
    return plainRows.map((r, i) => {
      const hits = byLine.get(i);
      if (!hits) return r;
      const l = lines[i]!;
      const pieces = splitSegs(
        l.segs.map((s) => s.text),
        hits,
        current,
      );
      return (
        <div class="wc-line" key={i} data-kind={l.kind}>
          <span class={'wc-ped-help-text ' + HELP_CLS[l.kind]} style={rowStyle(l)}>
            {l.segs.map((s, si) => {
              const inner = pieces[si]!.map((pc) =>
                pc.hit ? <span class={pc.hit === 2 ? 'wc-msearch-cur' : 'wc-msearch-hit'}>{pc.text}</span> : pc.text,
              );
              return s.cls ? <span class={`wc-syn-${s.cls}`}>{inner}</span> : inner;
            })}
          </span>
        </div>
      );
    });
  }, [plainRows, byLine, current]);

  const height = `calc(var(--cell-h) * ${viewH})`;
  const menuFocus = p.focus === 'menu' && !fieldFocus;
  const textFocus = p.focus === 'help' && !fieldFocus;
  const fullW = p.menu ? p.menuW + 1 + HELP_MENU_GAP + p.width : p.width;
  return (
    <>
    <div class="wc-ped-help" style={{ height }}>
      {p.menu && (
        <>
          <div class="wc-ped-menu" style={{ width: `calc(var(--cell-w) * ${p.menuW + 1})`, height }}>
            <div class="wc-scrollbox wc-ped-menu-rows" ref={menuBox.ref} style={{ width: `calc(var(--cell-w) * ${p.menuW})` }}
              onMouseDown={(e) => {
                e.preventDefault();
                leaveField();
              }}
            >
              {p.menu.map((r, vi) => {
                const text = pad(' ' + ellipsis(r.label, p.menuW - 2), p.menuW);
                const isCur = r.kind === 'entry' && r.section === section;
                return (
                  <div class="wc-line" key={vi}>
                    {r.kind === 'entry' ? (
                      <span
                        class={'wc-tr' + (isCur ? (menuFocus ? ' is-cur-focus' : ' is-cur') : '')}
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
            <TuiScrollbar target={menuBox.ref} rows={viewH} />
          </div>
          <div style={{ width: `calc(var(--cell-w) * ${HELP_MENU_GAP})`, flex: '0 0 auto' }} />
        </>
      )}
      <div
        class={'wc-ped-manual' + (textFocus ? ' is-focus' : '')}
        style={{ height }}
        onMouseDown={(e) => {
          if (!(e.target as Element).closest('a')) e.preventDefault();
          leaveField();
          p.onZone('help');
        }}
      >
        <div class="wc-scrollbox wc-ped-manual-rows" ref={body.ref} style={{ width: `calc(var(--cell-w) * ${textW})` }}>
          {rows}
        </div>
        <TuiScrollbar target={body.ref} rows={viewH} />
      </div>
    </div>
    {findOpen && (
      <ManualFind
        query={query}
        count={findCountText(query, result, hit)}
        width={fullW}
        inputRef={inputRef}
        onQuery={onQuery}
        onGo={go}
        onFieldFocus={setFieldFocus}
      />
    )}
    </>
  );
}
