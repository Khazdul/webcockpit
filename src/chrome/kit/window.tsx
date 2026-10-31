// The window kit (stage 30 S8, ADR 0103): a conventional, sparse window
// frame over the cockpit, set apart from the panes on purpose. A thin cyan
// border with almost square corners, a slim title bar one cell high (title
// left, X right), a small resize grip in the bottom right corner, an
// opaque terminal background. Without focus the border and title dim and
// the content is dimmed.
//
//   .wc-win                  outer box, whole cells on the cockpit grid
//     .wc-win-bar            the title row: drag to move
//       .wc-win-title        `Profile: <name>`
//       .wc-win-x            X: the close request (as Esc)
//     .wc-win-body           the content grid, inset one cell (left, right, bottom)
//     .wc-win-edge × 8       resize bands along the edges and corners
//     .wc-win-grip           the visible grip (resizes as the se corner)
//
// Pointer events, so a pen or a finger moves and resizes as a mouse does.
// A press in the frame never moves the focus by itself and never selects
// text; the window manager (src/chrome/windows.tsx) gives the window its
// focus on any press inside it. Geometry: kit/window-geom.ts.

import type { ComponentChildren, JSX, VNode } from 'preact';
import { useRef } from 'preact/hooks';
import { OWN_KEYS_ATTR } from '../../ui/input-pane';
import { type CellGrid, type CellRect, EDGES, type Edge, cellDelta, moveRect, resizeRect, sameRect } from './window-geom';

export interface WindowFrameProps {
  /** `data-win` (tests, the manager's focus rule). */
  id: string;
  title: string;
  /** A dimmer part after the title (the profile name). */
  titleNote?: string;
  /** The rectangle shown (already fitted to `grid`). */
  rect: CellRect;
  grid: CellGrid;
  cellW: number;
  cellH: number;
  z: number;
  focused: boolean;
  /** A move or resize: every cell step while dragging (`done` false), then once at the end (`done` true). */
  onRect: (r: CellRect, done: boolean) => void;
  /** The X: the close request. */
  onClose: () => void;
  children?: ComponentChildren;
}

interface Drag {
  pointerId: number;
  kind: 'move' | Edge;
  x0: number;
  y0: number;
  start: CellRect;
  last: CellRect;
  el: Element;
}

export function WindowFrame(p: WindowFrameProps): VNode {
  const drag = useRef<Drag | null>(null);
  const propsRef = useRef(p);
  propsRef.current = p;

  const begin = (kind: Drag['kind']) => (e: JSX.TargetedPointerEvent<HTMLElement>): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable (synthetic events) */
    }
    drag.current = { pointerId: e.pointerId, kind, x0: e.clientX, y0: e.clientY, start: p.rect, last: p.rect, el };
  };

  const move = (e: JSX.TargetedPointerEvent<HTMLElement>): void => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const q = propsRef.current;
    const dx = cellDelta(e.clientX - d.x0, q.cellW);
    const dy = cellDelta(e.clientY - d.y0, q.cellH);
    const r = d.kind === 'move' ? moveRect(d.start, dx, dy, q.grid) : resizeRect(d.start, d.kind, dx, dy, q.grid);
    if (sameRect(r, d.last)) return;
    d.last = r;
    q.onRect(r, false);
  };

  const end = (e: JSX.TargetedPointerEvent<HTMLElement>): void => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    try {
      d.el.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (!sameRect(d.last, d.start)) propsRef.current.onRect(d.last, true);
  };

  const handlers = (kind: Drag['kind']) => ({
    onPointerDown: begin(kind),
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
  });

  const { rect, cellW: cw, cellH: ch } = p;
  const own = { [OWN_KEYS_ATTR]: '' };
  return (
    <div
      class="wc-win"
      data-win={p.id}
      data-focused={p.focused ? '' : undefined}
      role="dialog"
      aria-label={p.titleNote ? `${p.title} ${p.titleNote}` : p.title}
      {...own}
      style={{ left: rect.x * cw, top: rect.y * ch, width: rect.w * cw, height: rect.h * ch, zIndex: p.z }}
    >
      <div class="wc-win-bar" style={{ height: ch }} {...handlers('move')}>
        <span class="wc-win-title">
          {p.title}
          {p.titleNote && <span class="wc-win-tn">{p.titleNote}</span>}
        </span>
        <button
          type="button"
          class="wc-win-x"
          aria-label="Close"
          title="Close"
          onPointerDown={(e) => {
            // The window takes its focus from the manager; the X starts no drag.
            e.stopPropagation();
            e.preventDefault();
          }}
          onClick={(e) => {
            e.stopPropagation();
            p.onClose();
          }}
        >
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" />
          </svg>
        </button>
      </div>
      <div class="wc-win-body" style={{ left: cw, top: ch, width: (rect.w - 2) * cw, height: (rect.h - 2) * ch }}>
        {p.children}
      </div>
      {EDGES.map((edge) => (
        <div class="wc-win-edge" data-edge={edge} {...handlers(edge)} />
      ))}
      <div class="wc-win-grip" {...handlers('se')} />
    </div>
  );
}
