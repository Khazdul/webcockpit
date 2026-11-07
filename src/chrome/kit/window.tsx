// The window kit (stage 30 S8, ADR 0103; the Lykta frame, stage 42d, ADR
// 0127): one frame for every in-game window and every sub-page in it, a
// Lykta pane as a window. A thin iron band (5 px) with small riveted corner
// brackets, a centred iron hood with the title in lamp light and a dim
// note, a small iron X on the band at the right, the opaque lamp-lit
// window (the game text scrolls under it, so no backdrop blur), a bronze
// variant on Paper (`data-light` on `.wc-windows`). Without focus the
// title dims and the content goes to 55 %.
//
//   .wc-win                  outer box, whole cells on the cockpit grid (`data-win`, `data-focused`)
//     i.wc-win-br × 4        the corner brackets
//     .wc-win-bar            the top band: drag to move
//       .wc-win-hood         the hood: .wc-win-t (title) .wc-win-n (note)
//       .wc-win-x            X: the close request (as Esc)
//     .wc-win-body           the lit window
//       .wc-win-content      its content box (below the hood): the window's stack
//     .wc-win-edge × 8       resize bands along the edges and corners
//     .wc-win-grip           the visible grip (resizes as the se corner)
//
// Pointer events, so a pen or a finger moves and resizes as a mouse does.
// A press in the frame never moves the focus by itself and never selects
// text; the window manager (src/chrome/windows.tsx) gives the window its
// focus on any press inside it. Geometry: kit/window-geom.ts.
//
// `WindowStack` is a window's frame stack (the windows and the kit
// gallery): look frames get the place `window`, the `.wc-look` tokens and
// the whole content box; old-look frames get the largest whole-cell grid
// that fits it, centred. The frames set the window's title and note with
// `useWindowChrome` (kit/window-chrome.ts).

import type { ComponentChildren, JSX, VNode } from 'preact';
import { useMemo, useRef } from 'preact/hooks';
import { OWN_KEYS_ATTR } from '../../ui/input-pane';
import { GridCtx } from './hooks';
import { LookPlaceCtx, isLookFrame } from './look';
import { type StackControl, FrameStack } from './stack';
import { WindowChromeCtx, type WindowChromeSink } from './window-chrome';
import {
  type CellGrid,
  type CellRect,
  EDGES,
  type Edge,
  type WindowBody,
  cellDelta,
  moveRect,
  resizeRect,
  sameRect,
} from './window-geom';

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
    // The button came up where no pointerup reached us: the drag is over.
    if (e.pointerType === 'mouse' && e.buttons === 0) return end(e);
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
      <i class="wc-win-br wc-win-b1" />
      <i class="wc-win-br wc-win-b2" />
      <i class="wc-win-br wc-win-b3" />
      <i class="wc-win-br wc-win-b4" />
      <div class="wc-win-body">
        <div class="wc-win-content">{p.children}</div>
      </div>
      <div class="wc-win-bar" {...handlers('move')}>
        <div class="wc-win-hood">
          <span class="wc-win-t">{p.title}</span>
          {p.titleNote && <span class="wc-win-n">{p.titleNote}</span>}
        </div>
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
      {EDGES.map((edge) => (
        <div class="wc-win-edge" data-edge={edge} {...handlers(edge)} />
      ))}
      <div class="wc-win-grip" {...handlers('se')} />
    </div>
  );
}

// ------------------------------------------------------------ the window's stack

export interface WindowStackProps {
  /** The window's body (window-geom.ts `windowBody`). */
  body: WindowBody;
  cellW: number;
  cellH: number;
  root: VNode;
  /** Routes keys (the window has the focus). The stack never traps the focus. */
  active: boolean;
  /** Esc on the root frame: the window closes. */
  onRootBack: () => void;
  /** The stack's control (the window's close request). */
  control?: (c: StackControl | null) => void;
  /** The window's chrome store's sink (`useWindowChrome` in its frames). */
  chrome?: WindowChromeSink | null;
}

/**
 * A window's frame stack in its body: look frames run in the place
 * `window` with the `.wc-look` tokens and fill the content box; old-look
 * frames sit on a whole-cell grid centred in it (`frameAttrs`, as the
 * start surface places them).
 */
export function WindowStack(p: WindowStackProps): VNode {
  const { cols, rows, left, top } = p.body;
  const grid = useMemo(() => ({ cols, rows, surface: 'menu' as const }), [cols, rows]);
  const frameAttrs = (node: VNode): { class: string; style?: JSX.CSSProperties } =>
    isLookFrame(node)
      ? { class: 'wc-look wc-win-look' }
      : { class: 'wc-screen wc-win-grid', style: { left, top, width: cols * p.cellW, height: rows * p.cellH } };
  return (
    <LookPlaceCtx.Provider value="window">
      <WindowChromeCtx.Provider value={p.chrome ?? null}>
        <GridCtx.Provider value={grid}>
          <FrameStack
            root={p.root}
            active={p.active}
            trap={false}
            onRootBack={p.onRootBack}
            {...(p.control ? { control: p.control } : {})}
            frameAttrs={frameAttrs}
          />
        </GridCtx.Provider>
      </WindowChromeCtx.Provider>
    </LookPlaceCtx.Provider>
  );
}
