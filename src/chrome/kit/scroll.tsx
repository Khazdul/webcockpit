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
//
// Every `░█` bar, this one and the hand-rolled ones beside a textarea or a
// CodeMirror buffer, takes its presses through `barPress` (ADR 0106): a
// press on the thumb drags it, a press on the track pages toward it (and
// repeats while held) or jumps there.

import type { RefObject, VNode } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { dragScrollTop, jumpScrollTop, scrollbar } from './nav';

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

/** What a press on a `░█` bar works on. */
export interface BarPressOpts {
  /** The scrolled element: a scroll box, a textarea or CodeMirror's `scrollDOM`. */
  el: HTMLElement | null | undefined;
  /** The bar as drawn (`scrollbar()`; true = thumb). */
  bar: boolean[];
  /** The pressed cell. */
  i: number;
  /** A press on the track jumps there (proportionally) instead of paging. */
  jump?: boolean;
  /** Pages up (-1) or down (1); default the visible height less one row. */
  page?: (dir: 1 | -1) => void;
  /** The content's row height in px (default the line height of `el`). */
  rowPx?: number;
  /** The height of one bar cell in px (default the pressed element's). */
  cellPx?: number;
}

/** Bar cells whose last press dragged the thumb (their click is swallowed). */
const dragged = new WeakSet<Element>();

/** Hold the track this long before the paging repeats, then repeat this often (ms). */
const REPEAT_DELAY = 350;
const REPEAT_EVERY = 60;

/**
 * Event props for one cell of a `░█` bar (ADR 0106). A press on the thumb
 * drags it: the content follows in proportion, under pointer capture so the
 * drag goes on outside the bar and on touch, until the button comes up. A
 * press on the track pages toward it and repeats while held until the thumb
 * reaches the pointer, and the thumb then drags on; a `jump` bar jumps
 * there and drags on at once. The mousedown is prevented, so the press
 * neither moves the focus nor starts a text selection, and the captured
 * mouseup lands on the cell, inside the frame stack, which keeps it from
 * the game input's refocus.
 */
export function barPress(opts: () => BarPressOpts): {
  onPointerDown: (e: PointerEvent) => void;
  onMouseDown: (e: MouseEvent) => void;
  onClick: (e: MouseEvent) => void;
} {
  return {
    onMouseDown: (e) => e.preventDefault(),
    // The click that ends a drag is not a press on what lies under the bar.
    onClick: (e) => {
      if (dragged.delete(e.currentTarget as Element)) e.stopPropagation();
    },
    onPointerDown: (e) => {
      dragged.delete(e.currentTarget as Element);
      const o = opts();
      if (!o.el || e.button !== 0 || o.bar.length === 0) return;
      startBarPress(e, o.el, o);
    },
  };
}

function startBarPress(e: PointerEvent, el: HTMLElement, o: BarPressOpts): void {
  const cellEl = e.currentTarget as HTMLElement;
  const win = cellEl.ownerDocument.defaultView ?? window;
  const cells = o.bar.length;
  const rect = cellEl.getBoundingClientRect();
  const cellPx = o.cellPx || rect.height || cellHeight(el);
  const rowPx = o.rowPx || cellHeight(el);
  const barTop = rect.top - o.i * cellPx;
  const maxTop = (): number => Math.max(0, el.scrollHeight - el.clientHeight);
  const barNow = (): boolean[] =>
    scrollbar(Math.max(1, Math.round(el.scrollHeight / rowPx)), cells, Math.round(el.scrollTop / rowPx));

  let y = e.clientY;
  let drag: { y: number; top: number; thumb: number } | null = null;
  let timer = 0;
  const beginDrag = (): void => {
    drag = { y, top: el.scrollTop, thumb: barNow().filter(Boolean).length || o.bar.filter(Boolean).length };
  };

  if (o.bar[o.i]) {
    beginDrag();
  } else if (o.jump) {
    el.scrollTop = jumpScrollTop(o.i, cells, maxTop(), rowPx);
    beginDrag();
  } else {
    const dir: 1 | -1 = o.i < o.bar.indexOf(true) ? -1 : 1;
    const page = (): void => {
      if (o.page) o.page(dir);
      else el.scrollTop += dir * Math.max(rowPx, el.clientHeight - rowPx);
    };
    // The thumb has reached (or passed) the pointer, or the end: stop paging.
    const reached = (): boolean => {
      const bar = barNow();
      const c = Math.floor((y - barTop) / cellPx);
      const first = bar.indexOf(true);
      const last = bar.lastIndexOf(true);
      if (first < 0) return true;
      if (dir < 0) return first <= c || el.scrollTop <= 0;
      return last >= c || el.scrollTop >= maxTop() - 1;
    };
    const tick = (): void => {
      timer = 0;
      if (reached()) {
        beginDrag();
        return;
      }
      page();
      timer = win.setTimeout(tick, REPEAT_EVERY);
    };
    page();
    timer = win.setTimeout(tick, REPEAT_DELAY);
  }

  try {
    cellEl.setPointerCapture(e.pointerId);
  } catch {
    // A synthetic or already released pointer: the window listeners below still see it.
  }
  const onMove = (ev: PointerEvent): void => {
    if (ev.pointerId !== e.pointerId) return;
    y = ev.clientY;
    if (!drag) return;
    if (Math.abs(y - drag.y) > 2) dragged.add(cellEl);
    const top = dragScrollTop(drag.top, y - drag.y, cells, drag.thumb, cellPx, maxTop());
    if (Math.abs(top - el.scrollTop) >= 0.5) el.scrollTop = top;
  };
  const onEnd = (ev: Event): void => {
    if ((ev as PointerEvent).pointerId !== e.pointerId) return;
    if (timer) win.clearTimeout(timer);
    timer = 0;
    drag = null;
    win.removeEventListener('pointermove', onMove, true);
    win.removeEventListener('pointerup', onEnd, true);
    win.removeEventListener('pointercancel', onEnd, true);
    cellEl.removeEventListener('lostpointercapture', onEnd);
  };
  win.addEventListener('pointermove', onMove, true);
  win.addEventListener('pointerup', onEnd, true);
  win.addEventListener('pointercancel', onEnd, true);
  cellEl.addEventListener('lostpointercapture', onEnd);
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
 * (blank when everything fits). A press on the thumb drags it; one on the
 * track pages toward it, or jumps there (`jump`), see `barPress`.
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
  return (
    <div class={'wc-tui-bar' + (p.class ? ' ' + p.class : '')}>
      {Array.from({ length: p.rows }, (_, i) =>
        bar.length > 0 && i < bar.length ? (
          <div
            class={'wc-line ' + (bar[i] ? (p.thumbClass ?? 'wc-scroll-thumb') : (p.trackClass ?? 'wc-scroll-track'))}
            key={i}
            {...barPress(() => ({ el: p.target.current, bar, i, jump: p.jump, rowPx: m.cell }))}
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
