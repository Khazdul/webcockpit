// Layout geometry for the weather engine: what the main thread measures and
// posts to the worker, and the diff that keeps it to changes only.
// `measureGeometry` reads the DOM (layout changes only, never per frame);
// the rest is pure.

import type { Geometry, PaneGeom, Rect } from './protocol';

/** Position tolerance (CSS px) below which a geometry counts as unchanged. */
export const GEOM_EPS = 0.5;

const near = (a: number, b: number): boolean => Math.abs(a - b) < GEOM_EPS;
const rectEq = (a: Rect, b: Rect): boolean => near(a.x, b.x) && near(a.y, b.y) && near(a.w, b.w) && near(a.h, b.h);

/** What changed between two geometries: 'none' or 'layout'. */
export function geometryDiff(a: Geometry | null, b: Geometry): 'none' | 'layout' {
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
    if (p.id !== q.id || p.label !== q.label || p.floating !== q.floating || p.z !== q.z || p.bg !== q.bg || p.border !== q.border) return 'layout';
    if (!rectEq(p, q) || !rectEq(p.box, q.box)) return 'layout';
    if (!p.tab !== !q.tab || (p.tab && q.tab && (!near(p.tab[0], q.tab[0]) || !near(p.tab[1], q.tab[1])))) return 'layout';
  }
  return 'none';
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

/** Insets from a pane's edges to the outside of its frame line (src/panes/frame.ts). */
export interface FrameInsets {
  l: number;
  r: number;
  top: number;
  b: number;
}

/**
 * A framed pane's frame box (stage 28 A, src/panes/frame.ts): inset by the
 * frame insets from the pane's edges; the fill stops at it. Unframed: the box.
 */
export function frameRect(box: Rect, framed: boolean, f: FrameInsets): Rect {
  if (!framed) return { ...box };
  return { x: box.x + f.l, y: box.y + f.top, w: box.w - f.l - f.r, h: box.h - f.top - f.b };
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

/** Measures everything the worker needs. Reads layout; call on layout changes only. */
export function measureGeometry(host: MeasureHost, dpr: number, seq = 0): Geometry {
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
    const fx = cell.w / 2 - t / 2, fy = cell.h / 2 - t / 2;
    const ins = { l: v('--frame-l', fx), r: v('--frame-r', fx), top: v('--frame-top', fy), b: v('--frame-b', fy) };
    const lw = framed ? v('--frame-label-w', 0) : 0;
    const tab0 = box.x + ins.l + v('--frame-label-x', 0);
    panes.push({
      ...frameRect(box, framed, ins),
      box,
      id: el.dataset.pane ?? '',
      border: framed ? t : 0,
      label: el.getAttribute('aria-label') ?? '',
      floating: el.hasAttribute('data-floating'),
      z: el.hasAttribute('data-floating') ? Number(el.style.zIndex) || 0 : 0,
      bg: bg && bg !== termBg ? bg : null,
      tab: lw > 0 ? [round(tab0), round(tab0 + lw)] : null,
    });
  }
  const W = round(base.width), H = round(base.height);
  return {
    seq,
    W,
    H,
    dpr,
    out,
    panes,
    protect: protectFor(W, out.y + out.h, cell.h, cell.size),
    cell,
  };
}
