// The lantern kit's cursors (stage 42, ADR 0127): a list cursor, a grid
// cursor and the button zone, modelled on the Profile list (ADR 0125
// addendum). Package 42c owns this file.
//
//   const list = useListCursor({ count: rows.length, onActivate: (i) => open(rows[i]) });
//   const zone = useButtonZone({ ids: ['OPEN', 'DELETE'], enabled: (id) => …, press: run });
//   useKeys((e, nk) => zone.key(e, nk) || (zone.zone === 'list' && list.key(e, nk)));
//   <ul ref={list.scrollRef}>{rows.map((r, i) => <li {...list.rowProps(i)} class={i === list.i ? 'is-on' : ''}>…)}</ul>
//
// The rules (the owner's, README "Baseline"; the Profile list):
//
// - A pointer *move* over a row moves the cursor (never `pointerenter`,
//   which fires when a page reappears under a resting pointer); a touch
//   never hovers.
// - After a key the cursor's row is scrolled into view (`block: nearest`);
//   after a pointer move or a click never (the row is under the pointer).
// - Mouse and pen: with `activateOn: 'click'` (default) a click moves the
//   cursor there and activates; with `'dblclick'` a click moves it and a
//   double click activates.
// - Touch: `touch: 'tap-activates'` (default with `activateOn: 'click'`) a
//   tap activates at once; `'tap-selects'` (default with `'dblclick'`) the
//   first tap moves the cursor (a row's own buttons show) and a tap on the
//   cursor's row activates. A touch double tap never activates twice.
// - The cursor stays inside `count` when the list shrinks; `onChange`
//   tells every move (key, pointer, `set`), `onActivate` Enter / Space and
//   the clicks above.

import type { Ref } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { NavKey } from './nav';

export interface ListCursorOptions {
  count: number;
  /** Rows per PgUp / PgDn (default 10; a grid: rounded down to whole rows, at least one). */
  page?: number;
  /** ↑ ↓ (a grid: ← →) wrap around the ends; PgUp / PgDn, Home / End clamp. */
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
  onPointerDown: (e: PointerEvent) => void;
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
  /** Spread on row `i`. */
  rowProps(i: number): RowProps;
  /** The element that holds the rows (`[data-i]`); the cursor's row is scrolled into view inside it after a key. */
  scrollRef: Ref<HTMLElement>;
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/** The move a key makes from `i`, or null when the key is not the cursor's. */
type Move = (nk: NavKey, i: number, count: number, o: ListCursorOptions) => number | null;

function useCursor(o: ListCursorOptions, move: Move): ListCursor {
  const [cur, setCur] = useState(() => clamp(o.initial ?? 0, 0, Math.max(0, o.count - 1)));
  const opts = useRef(o);
  opts.current = o;
  const scrollRef = useRef<HTMLElement>(null);
  const reveal = useRef(false);
  const lastPointer = useRef<string>('mouse');
  const i = o.count > 0 ? clamp(cur, 0, o.count - 1) : 0;
  const now = useRef(i);
  now.current = i;

  const set = (n: number): void => {
    const c = opts.current.count;
    if (c <= 0) return;
    const to = clamp(n, 0, c - 1);
    if (to === now.current) return;
    now.current = to;
    setCur(to);
    opts.current.onChange?.(to);
  };

  // After a key, the cursor's row into view (never after a pointer).
  useLayoutEffect(() => {
    if (!reveal.current) return;
    reveal.current = false;
    const row = scrollRef.current?.querySelector<HTMLElement>(`[data-i="${i}"]`);
    if (row && typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [i]);

  const key = (_e: KeyboardEvent, nk: NavKey | null): boolean => {
    const c = opts.current.count;
    if (!nk || c <= 0) return false;
    if (nk === 'activate') {
      opts.current.onActivate?.(now.current);
      return true;
    }
    const to = move(nk, now.current, c, opts.current);
    if (to === null) return false;
    reveal.current = true;
    set(to);
    return true;
  };

  const touchMode = (): 'tap-activates' | 'tap-selects' =>
    opts.current.touch ?? (opts.current.activateOn === 'dblclick' ? 'tap-selects' : 'tap-activates');

  const rowProps = (n: number): RowProps => ({
    'data-i': n,
    onPointerDown: (e) => {
      lastPointer.current = e.pointerType || 'mouse';
    },
    onPointerMove: (e) => {
      if (e.pointerType !== 'touch' && n !== now.current) set(n);
    },
    onClick: () => {
      const o = opts.current;
      if (lastPointer.current === 'touch') {
        const was = now.current;
        set(n);
        if (touchMode() === 'tap-activates' || was === n) o.onActivate?.(n);
        return;
      }
      set(n);
      if ((o.activateOn ?? 'click') === 'click') o.onActivate?.(n);
    },
    onDblClick: () => {
      // Touch: the taps above decide (a double tap would activate twice).
      if (lastPointer.current === 'touch') return;
      if (opts.current.activateOn === 'dblclick') opts.current.onActivate?.(n);
    },
  });

  return { i, set, key, rowProps, scrollRef };
}

/** ↑ ↓ (wrapping with `wrap`), PgUp / PgDn, Home / End over a list. */
const listMove: Move = (nk, i, count, o) => {
  const page = Math.max(1, o.page ?? 10);
  switch (nk) {
    case 'up':
      return o.wrap ? (i - 1 + count) % count : i - 1;
    case 'down':
      return o.wrap ? (i + 1) % count : i + 1;
    case 'pgup':
      return i - page;
    case 'pgdn':
      return i + page;
    case 'home':
      return 0;
    case 'end':
      return count - 1;
    default:
      return null;
  }
};

/** A cursor over a list of rows: ↑↓, PgUp / PgDn, Home / End, Enter / Space. */
export function useListCursor(o: ListCursorOptions): ListCursor {
  return useCursor(o, listMove);
}

/**
 * A cursor over a wrapping grid (row by row, `columns()` per row): ← →
 * one item (across the row ends; around the ends with `wrap`), ↑ ↓ one row
 * in the same column (↓ onto a shorter last row goes to its last item),
 * PgUp / PgDn `page` items in whole rows, Home / End the first / last.
 */
export function useGridCursor(o: GridCursorOptions): ListCursor {
  return useCursor(o, (nk, i, count, opts) => {
    const cols = Math.max(1, Math.floor(o.columns()));
    const rows = Math.ceil(count / cols);
    const row = Math.floor(i / cols);
    switch (nk) {
      case 'left':
        return opts.wrap ? (i - 1 + count) % count : i - 1;
      case 'right':
        return opts.wrap ? (i + 1) % count : i + 1;
      case 'up':
        return row > 0 ? i - cols : i;
      case 'down':
        return row < rows - 1 ? Math.min(count - 1, i + cols) : i;
      case 'pgup':
      case 'pgdn': {
        const step = Math.max(1, Math.floor((opts.page ?? 10) / cols)) * cols;
        if (nk === 'pgup') return i - step >= 0 ? i - step : i % cols;
        return i + step < count ? i + step : Math.min(count - 1, (rows - 1) * cols + (i % cols));
      }
      case 'home':
        return 0;
      case 'end':
        return count - 1;
      default:
        return null;
    }
  });
}

export interface ButtonZoneOptions {
  /** The buttons in the keyboard's order (`data-btn` ids). */
  ids: readonly string[];
  enabled(id: string): boolean;
  /** ← → (and ↑ ↓) wrap around the ends (Tab always rings back to the list). */
  wrap?: boolean;
  /** Enter / Space in the button zone press the keyboard's button. Without it the page reads `sel`. */
  press?(id: string): void;
}

export interface ButtonZone {
  zone: 'list' | 'buttons';
  /** The keyboard's button (its id), or null in the list zone. */
  sel: string | null;
  key(e: KeyboardEvent, nk: NavKey | null): boolean;
  /** Back to the list zone. */
  reset(): void;
}

/**
 * The button zone: one ring of the list and the enabled buttons. Tab goes
 * from the list to the first button, on through the buttons and back to
 * the list; Shift+Tab the other way. In the buttons, ← → (and ↑ ↓) walk
 * them, skipping disabled ones, and stop at the ends (unless `wrap`);
 * Enter / Space press (`press`). A button that becomes disabled hands the
 * keyboard to the next enabled one (or the one before, or the list).
 */
export function useButtonZone(o: ButtonZoneOptions): ButtonZone {
  const [want, setWant] = useState<string | null>(null);
  const opts = useRef(o);
  opts.current = o;
  const on = (): string[] => opts.current.ids.filter((id) => opts.current.enabled(id));
  /** `want` resolved against the buttons now. */
  const resolve = (w: string | null): string | null => {
    if (w === null) return null;
    const live = on();
    if (live.includes(w)) return w;
    const ids = opts.current.ids;
    const at = ids.indexOf(w);
    if (at < 0) return live[0] ?? null;
    return ids.slice(at + 1).find((id) => live.includes(id)) ?? [...ids.slice(0, at)].reverse().find((id) => live.includes(id)) ?? null;
  };
  const sel = resolve(want);
  const now = useRef(sel);
  now.current = sel;
  const go = (id: string | null): void => {
    now.current = id;
    setWant(id);
  };

  const key = (_e: KeyboardEvent, nk: NavKey | null): boolean => {
    const live = on();
    const cur = now.current;
    if (nk === 'tab' || nk === 'backtab') {
      // The ring: list, buttons…, list.
      const ring: (string | null)[] = [null, ...live];
      const at = Math.max(0, ring.indexOf(cur));
      go(ring[(at + (nk === 'tab' ? 1 : -1) + ring.length) % ring.length]!);
      return true;
    }
    if (cur === null) return false;
    if (nk === 'left' || nk === 'right' || nk === 'up' || nk === 'down') {
      const d = nk === 'left' || nk === 'up' ? -1 : 1;
      const at = live.indexOf(cur);
      const n = live.length;
      const to = opts.current.wrap ? (at + d + n) % n : clamp(at + d, 0, n - 1);
      go(live[to] ?? cur);
      return true;
    }
    if (nk === 'activate' && opts.current.press) {
      opts.current.press(cur);
      return true;
    }
    return false;
  };
  return { zone: sel === null ? 'list' : 'buttons', sel, key, reset: () => go(null) };
}
