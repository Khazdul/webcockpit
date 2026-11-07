// The lantern kit's cursors (stage 42, ADR 0127): a list cursor, a grid
// cursor and the button zone, modelled on the Profile list (ADR 0125
// addendum). Package 42c owns this file.
//
// 42-0 stub: the API's names and shapes, with a plain working core (keys
// move the cursor, Enter activates, a pointer move selects), so pages and
// gallery sections can code against it. 42c adds the rules: a key scrolls
// the cursor into view, a pointer never does; the touch options; Tab
// between the list and the buttons.

import type { Ref } from 'preact';
import { useRef, useState } from 'preact/hooks';
import type { NavKey } from './nav';

export interface ListCursorOptions {
  count: number;
  /** Rows per PgUp / PgDn (default 10). */
  page?: number;
  wrap?: boolean;
  initial?: number;
  activateOn?: 'click' | 'dblclick';
  touch?: 'tap-activates' | 'tap-selects';
  onChange?(i: number): void;
  onActivate?(i: number): void;
}

export interface GridCursorOptions extends ListCursorOptions {
  /** The grid's column count now (it wraps with the width). */
  columns(): number;
}

export interface RowProps {
  onPointerMove: (e: PointerEvent) => void;
  onClick: (e: MouseEvent) => void;
  onDblClick: (e: MouseEvent) => void;
  'data-i': number;
}

export interface ListCursor {
  i: number;
  set(i: number): void;
  /** Handles a key (true = consumed). */
  key(e: KeyboardEvent, nk: NavKey | null): boolean;
  rowProps(i: number): RowProps;
  /** The scrolling element that holds the rows. */
  scrollRef: Ref<HTMLElement>;
}

function useCursor(o: ListCursorOptions, delta: (nk: NavKey) => number | null): ListCursor {
  const [cur, setCur] = useState(() => Math.max(0, Math.min(o.count - 1, o.initial ?? 0)));
  const opts = useRef(o);
  opts.current = o;
  const scrollRef = useRef<HTMLElement>(null);
  const i = o.count > 0 ? Math.min(cur, o.count - 1) : 0;
  const set = (n: number): void => {
    const c = opts.current.count;
    if (c <= 0) return;
    const to = opts.current.wrap ? ((n % c) + c) % c : Math.max(0, Math.min(c - 1, n));
    if (to === i) return;
    setCur(to);
    opts.current.onChange?.(to);
  };
  const key = (_e: KeyboardEvent, nk: NavKey | null): boolean => {
    if (!nk || o.count <= 0) return false;
    if (nk === 'activate') {
      o.onActivate?.(i);
      return true;
    }
    const page = o.page ?? 10;
    if (nk === 'home') return set(0), true;
    if (nk === 'end') return set(o.count - 1), true;
    if (nk === 'pgup') return set(Math.max(0, i - page)), true;
    if (nk === 'pgdn') return set(Math.min(o.count - 1, i + page)), true;
    const d = delta(nk);
    if (d === null) return false;
    set(i + d);
    return true;
  };
  const rowProps = (n: number): RowProps => ({
    'data-i': n,
    onPointerMove: (e) => {
      if (e.pointerType !== 'touch' && n !== i) set(n);
    },
    onClick: () => {
      set(n);
      if ((opts.current.activateOn ?? 'click') === 'click') opts.current.onActivate?.(n);
    },
    onDblClick: () => {
      if (opts.current.activateOn === 'dblclick') opts.current.onActivate?.(n);
    },
  });
  return { i, set, key, rowProps, scrollRef };
}

/** A cursor over a list of rows: ↑↓, PgUp / PgDn, Home / End, Enter. 42-0 stub. */
export function useListCursor(o: ListCursorOptions): ListCursor {
  return useCursor(o, (nk) => (nk === 'up' ? -1 : nk === 'down' ? 1 : null));
}

/** A cursor over a wrapping grid: the arrows in two dimensions. 42-0 stub. */
export function useGridCursor(o: GridCursorOptions): ListCursor {
  return useCursor(o, (nk) => {
    const cols = Math.max(1, o.columns());
    return nk === 'left' ? -1 : nk === 'right' ? 1 : nk === 'up' ? -cols : nk === 'down' ? cols : null;
  });
}

export interface ButtonZone {
  zone: 'list' | 'buttons';
  /** The keyboard's button (its id), or null in the list zone. */
  sel: string | null;
  key(e: KeyboardEvent, nk: NavKey | null): boolean;
  reset(): void;
}

/**
 * The button zone: Tab / Shift+Tab move between the list and the buttons,
 * ← → (and ↑ ↓) walk the buttons, skipping disabled ones; Enter presses
 * the page's `sel`. 42-0 stub (the zones and the walk; 42c builds the rest).
 */
export function useButtonZone(o: { ids: readonly string[]; enabled(id: string): boolean; wrap?: boolean }): ButtonZone {
  const [sel, setSel] = useState<string | null>(null);
  const first = (): string | null => o.ids.find((id) => o.enabled(id)) ?? null;
  const walk = (d: 1 | -1): void => {
    const n = o.ids.length;
    let at = sel ? o.ids.indexOf(sel) : -1;
    for (let k = 0; k < n; k++) {
      at += d;
      if (at < 0 || at >= n) {
        if (!o.wrap) return;
        at = (at + n) % n;
      }
      if (o.enabled(o.ids[at]!)) return setSel(o.ids[at]!);
    }
  };
  const key = (_e: KeyboardEvent, nk: NavKey | null): boolean => {
    if (nk === 'tab' || nk === 'backtab') {
      setSel(sel === null ? first() : null);
      return true;
    }
    if (sel === null) return false;
    if (nk === 'left' || nk === 'up') return walk(-1), true;
    if (nk === 'right' || nk === 'down') return walk(1), true;
    return false;
  };
  return { zone: sel === null ? 'list' : 'buttons', sel, key, reset: () => setSel(null) };
}
