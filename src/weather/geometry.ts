// Layout geometry for the weather engine: what the main thread measures and
// posts to the worker, and the diff that keeps it to changes only.
// `measureGeometry` reads the DOM (layout changes only, never per frame);
// the rest is pure.

import type { Geometry, PaneGeom, Rect } from './protocol';

/** Position tolerance (CSS px) below which a geometry counts as unchanged. */
export const GEOM_EPS = 0.5;

const near = (a: number, b: number): boolean => Math.abs(a - b) < GEOM_EPS;
const rectEq = (a: Rect, b: Rect): boolean => near(a.x, b.x) && near(a.y, b.y) && near(a.w, b.w) && near(a.h, b.h);

/** True when the text lines differ. */
export function linesChanged(a: readonly Rect[], b: readonly Rect[]): boolean {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) if (!rectEq(a[i]!, b[i]!)) return true;
  return false;
}

/**
 * What changed between two geometries: 'none', 'lines' (only the text
 * lines, a cheap update in the worker) or 'layout' (everything else).
 */
export function geometryDiff(a: Geometry | null, b: Geometry): 'none' | 'lines' | 'layout' {
  if (!a) return 'layout';
  if (!near(a.W, b.W) || !near(a.H, b.H) || a.dpr !== b.dpr) return 'layout';
  if (!rectEq(a.out, b.out)) return 'layout';
  const pa = a.protect, pb = b.protect;
  if (!near(pa.solidTop, pb.solidTop) || !near(pa.fadeTop, pb.fadeTop) || !near(pa.left, pb.left)) return 'layout';
  const ca = a.cell, cb = b.cell;
  if (!near(ca.w, cb.w) || !near(ca.h, cb.h) || ca.size !== cb.size || ca.font !== cb.font) return 'layout';
  if (a.panes.length !== b.panes.length) return 'layout';
  for (let i = 0; i < a.panes.length; i++) {
    const p = a.panes[i]!, q = b.panes[i]!;
    if (p.id !== q.id || p.label !== q.label || p.floating !== q.floating || p.bg !== q.bg || p.border !== q.border) return 'layout';
    if (!rectEq(p, q) || !rectEq(p.box, q.box)) return 'layout';
  }
  return linesChanged(a.lines, b.lines) ? 'lines' : 'none';
}

/**
 * The masked area (prototype `env.protect`): solid over the prompt and
 * input rows (from one row above the game pane's bottom), a 3.5-line fade
 * above it, and a soft fade along the far left.
 */
export function protectFor(W: number, gameBottom: number, cellH: number, fontSize: number): Geometry['protect'] {
  const solidTop = gameBottom - cellH - 2;
  return { solidTop, fadeTop: solidTop - 3.5 * fontSize, left: Math.min(90, W * 0.05) };
}

/**
 * A framed pane's frame box (stage 28 A, src/panes/frame.ts): inset by the
 * frame insets from the pane's edge; the fill stops at it. Unframed: the box.
 */
export function frameRect(box: Rect, framed: boolean, fx: number, fy: number): Rect {
  if (!framed) return { ...box };
  return { x: box.x + fx, y: box.y + fy, w: box.w - 2 * fx, h: box.h - 2 * fy };
}

const round = (v: number): number => Math.round(v * 2) / 2;

export interface MeasureHost {
  /** The element the canvases cover (the cockpit). */
  root: HTMLElement;
  /** The game pane container. */
  game: HTMLElement;
}

/** The cell metrics from the root CSS custom properties. */
function cellOf(root: HTMLElement): Geometry['cell'] {
  const cs = getComputedStyle(root);
  const px = (name: string, d: number): number => {
    const v = parseFloat(cs.getPropertyValue(name));
    return Number.isFinite(v) && v > 0 ? v : d;
  };
  const size = px('--font-size', parseFloat(cs.fontSize) || 15);
  const family = cs.getPropertyValue('--font-mono').trim() || cs.fontFamily || 'monospace';
  return { w: px('--cell-w', size * 0.6), h: px('--cell-h', size * 1.2), size, font: `${size}px ${family}` };
}

/** Text line boxes of the output rows inside the game pane's view (newest first, at most `max`). */
export function measureLines(game: HTMLElement, base: DOMRect, max = 120): Rect[] {
  const out: Rect[] = [];
  const g = game.getBoundingClientRect();
  const rows = game.querySelector('.wc-rows');
  if (!rows) return out;
  const range = game.ownerDocument.createRange();
  for (let chunk = rows.lastElementChild; chunk && out.length < max; chunk = chunk.previousElementSibling) {
    const cr = chunk.getBoundingClientRect();
    if (cr.top > g.bottom) continue;
    if (cr.bottom < g.top) break;
    for (let row = chunk.lastElementChild; row && out.length < max; row = row.previousElementSibling) {
      const rr = row.getBoundingClientRect();
      if (rr.top > g.bottom) continue;
      if (rr.bottom < g.top) break;
      if (!row.textContent || !row.textContent.trim()) continue;
      range.selectNodeContents(row);
      for (const r of range.getClientRects()) {
        if (r.width <= 2 || r.bottom < g.top || r.top > g.bottom) continue;
        out.push({ x: round(r.left - base.left), y: round(r.top - base.top), w: round(r.width), h: round(r.height) });
      }
    }
  }
  // Rects of one row can come split per span; the order is screen order bottom-up.
  return out;
}

/** Measures everything the worker needs. Reads layout; call on layout changes only. */
export function measureGeometry(host: MeasureHost, dpr: number, withLines = true, prevLines: Rect[] = []): Geometry {
  const { root, game } = host;
  const base = root.getBoundingClientRect();
  const rel = (r: DOMRect): Rect => ({ x: round(r.left - base.left), y: round(r.top - base.top), w: round(r.width), h: round(r.height) });
  const cell = cellOf(root);
  const out = rel(game.getBoundingClientRect());
  const panes: PaneGeom[] = [];
  const termBg = getComputedStyle(root).getPropertyValue('--term-bg').trim().toLowerCase();
  for (const el of root.querySelectorAll<HTMLElement>(':scope > .wc-pane')) {
    if (el.hidden || el.offsetParent === null) continue;
    const box = rel(el.getBoundingClientRect());
    if (box.w < 2 || box.h < 2) continue;
    const framed = el.hasAttribute('data-framed');
    const bg = el.style.getPropertyValue('--pane-bg').trim().toLowerCase();
    const v = (name: string, d: number): number => {
      const n = parseFloat(el.style.getPropertyValue(name));
      return Number.isFinite(n) ? n : d;
    };
    const t = v('--frame-t', 2);
    panes.push({
      ...frameRect(box, framed, v('--frame-x', cell.w / 2 - t / 2), v('--frame-y', cell.h / 2 - t / 2)),
      box,
      id: el.dataset.pane ?? '',
      border: framed ? t : 0,
      label: el.getAttribute('aria-label') ?? '',
      floating: el.hasAttribute('data-floating'),
      bg: bg && bg !== termBg ? bg : null,
    });
  }
  const W = round(base.width), H = round(base.height);
  return {
    W,
    H,
    dpr,
    out,
    panes,
    lines: withLines ? measureLines(game, base) : prevLines,
    protect: protectFor(W, out.y + out.h, cell.h, cell.size),
    cell,
  };
}
