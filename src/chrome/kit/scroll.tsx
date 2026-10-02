// TUI kit: native scrolling with the TUI scrollbar (stage 10 feedback
// round 1). A scroll box is an ordinary `overflow-y: auto` element with
// the browser's scrollbar hidden: the wheel and the touchpad scroll it by
// pixels, as CodeMirror does in EDITOR, never by whole rows. The `░█`
// scrollbar beside it follows the scroll position, and the keys scroll it
// by rows (instant, no smooth scrolling).
//
//   const box = useScrollBox();
//   <div class="wc-scrollbox" ref={box.ref}>…all rows…</div>
//   <TuiScrollbar target={box.ref} rows={visibleRows} />
//   box.by(1); box.page(-1); box.toRow(12); box.show(cursorRow);

import type { RefObject, VNode } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { scrollbar } from './nav';

/** The cell height of `el` in px (its line height; 16 when unknown). */
export function cellHeight(el: Element | null): number {
  if (!el) return 16;
  const lh = parseFloat(getComputedStyle(el).lineHeight);
  return lh > 0 ? lh : 16;
}

export interface ScrollBox {
  ref: RefObject<HTMLDivElement>;
  /** Scrolls by `rows` rows. */
  by(rows: number): void;
  /** Scrolls a page (the visible rows less one) up (-1) or down (1). */
  page(dir: 1 | -1): void;
  /** Puts row `i` on the top row (as far as the box scrolls). */
  toRow(i: number): void;
  /** Scrolls the least so rows `first`..`last` are in view (`first` wins when they do not fit). */
  show(first: number, last?: number): void;
  home(): void;
  end(): void;
  /** The row at the top (rounded). */
  topRow(): number;
  /** Rows in view (whole rows). */
  visibleRows(): number;
  atTop(): boolean;
  atEnd(): boolean;
}

export function useScrollBox(): ScrollBox {
  const ref = useRef<HTMLDivElement>(null);
  return useMemo<ScrollBox>(() => {
    const el = (): HTMLDivElement | null => ref.current;
    const ch = (): number => cellHeight(el());
    const set = (px: number): void => {
      const e = el();
      if (!e) return;
      e.scrollTop = Math.max(0, Math.min(e.scrollHeight - e.clientHeight, px));
    };
    const visible = (): number => {
      const e = el();
      return e ? Math.max(1, Math.floor(e.clientHeight / ch() + 0.01)) : 1;
    };
    return {
      ref,
      by: (rows) => set((el()?.scrollTop ?? 0) + rows * ch()),
      page: (dir) => set((el()?.scrollTop ?? 0) + dir * Math.max(1, visible() - 1) * ch()),
      toRow: (i) => set(i * ch()),
      show: (first, last = first) => {
        const e = el();
        if (!e) return;
        const h = ch();
        // The exact height: clientHeight is rounded, and a fractional cell height
        // would leave the last row a part of a pixel short.
        const view = e.getBoundingClientRect().height || e.clientHeight;
        const top = e.scrollTop;
        if ((last + 1) * h > top + view + 0.01) set((last + 1) * h - view);
        if (first * h < (el()?.scrollTop ?? top)) set(first * h);
      },
      home: () => set(0),
      end: () => set(Number.MAX_SAFE_INTEGER),
      topRow: () => Math.round((el()?.scrollTop ?? 0) / ch()),
      visibleRows: visible,
      atTop: () => (el()?.scrollTop ?? 0) <= 1,
      atEnd: () => {
        const e = el();
        return !e || e.scrollTop + e.clientHeight >= e.scrollHeight - 1;
      },
    };
  }, []);
}

/** Calls `fn` on every scroll and resize of `target` (once per frame), and once at mount. */
export function useScrollWatch(target: RefObject<HTMLElement>, fn: (el: HTMLElement) => void): void {
  const cb = useRef(fn);
  cb.current = fn;
  useEffect(() => {
    const el = target.current;
    if (!el) return;
    let frame = 0;
    const run = (): void => {
      frame = 0;
      cb.current(el);
    };
    const onScroll = (): void => {
      if (!frame) frame = requestAnimationFrame(run);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onScroll) : null;
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    run();
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [target]);
}

export interface TuiScrollbarProps {
  target: RefObject<HTMLElement>;
  /** Cells the bar is tall. */
  rows: number;
  class?: string;
  /** Colour classes and track glyph (default the kit's `░█`). */
  thumbClass?: string;
  trackClass?: string;
  trackChar?: string;
  /** A press on the track jumps there (proportionally) instead of paging. */
  jump?: boolean;
}

/**
 * The `░█` scrollbar of a scroll box, one cell wide and `rows` cells tall
 * (blank when everything fits). A press on the track pages toward it.
 */
export function TuiScrollbar(p: TuiScrollbarProps): VNode {
  const [m, setM] = useState({ top: 0, height: 0, client: 0, cell: 16 });
  const measure = (el: HTMLElement): void => {
    const next = { top: el.scrollTop, height: el.scrollHeight, client: el.clientHeight, cell: cellHeight(el) };
    setM((o) => (o.top === next.top && o.height === next.height && o.client === next.client && o.cell === next.cell ? o : next));
  };
  useScrollWatch(p.target, measure);
  // The content changed size without a scroll (a new layout): measure after each render.
  useLayoutEffect(() => {
    if (p.target.current) measure(p.target.current);
  });
  const total = Math.max(1, Math.round(m.height / m.cell));
  const visible = Math.max(1, Math.round(m.client / m.cell));
  const bar = scrollbar(total, Math.min(visible, p.rows), Math.round(m.top / m.cell));
  const thumbAt = bar.indexOf(true);
  return (
    <div class={'wc-tui-bar' + (p.class ? ' ' + p.class : '')}>
      {Array.from({ length: p.rows }, (_, i) =>
        bar.length > 0 && i < bar.length ? (
          <div
            class={'wc-line ' + (bar[i] ? (p.thumbClass ?? 'wc-scroll-thumb') : (p.trackClass ?? 'wc-scroll-track'))}
            key={i}
            onMouseDown={(e) => {
              e.preventDefault();
              const el = p.target.current;
              if (!el || bar[i]) return;
              if (p.jump) {
                el.scrollTop = Math.round((i / Math.max(1, bar.length - 1)) * ((el.scrollHeight - el.clientHeight) / m.cell)) * m.cell;
                return;
              }
              const step = Math.max(m.cell, el.clientHeight - m.cell);
              el.scrollTop += i < thumbAt ? -step : step;
            }}
          >
            {bar[i] ? '█' : (p.trackChar ?? '░')}
          </div>
        ) : (
          <div class="wc-line" key={i} />
        ),
      )}
    </div>
  );
}
