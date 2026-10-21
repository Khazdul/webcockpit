// Layout geometry for the weather engine: what the main thread measures and
// posts to the worker, and the diff that keeps it to changes only.
// `measureGeometry` reads the DOM (layout changes only, never per frame);
// the rest is pure.

import { frameInset, frameThickness } from '../panes/frame';
import type { Geometry, PaneGeom, PanePlate, Rect } from './protocol';

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
    if (p.id !== q.id || p.label !== q.label || p.floating !== q.floating || p.z !== q.z || p.bg !== q.bg || p.border !== q.border || p.clear !== q.clear) return 'layout';
    if (!rectEq(p, q) || !rectEq(p.box, q.box)) return 'layout';
    const ga = p.plate, gb = q.plate;
    if (!ga !== !gb || (ga && gb && (!near(ga.x, gb.x) || !near(ga.w, gb.w) || !near(ga.y1, gb.y1) || ga.lip !== gb.lip || ga.r !== gb.r))) return 'layout';
  }
  return 'none';
}

/**
 * The masked area (prototype `env.protect`): solid over the prompt and
 * input rows (from one row above the game pane's bottom), a 3.5-line fade
 * above it; `left` is the margin the body's spatters keep from the left
 * edge (the far left is no longer masked: owner feedback 21).
 */
export function protectFor(W: number, gameBottom: number, cellH: number, fontSize: number): Geometry['protect'] {
  const solidTop = gameBottom - cellH - 2;
  return { solidTop, fadeTop: solidTop - 3.5 * fontSize, left: Math.min(90, W * 0.05) };
}

/** Insets from a pane's edges to the outside of its frame rim (src/panes/frame.ts). */
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

/**
 * Where a pane's own background is painted under the back layer (engine
 * `paneFills`, floating panes too): framed, inside the rim less the
 * nameplate (a band from the plate's bottom down and a strip either side of
 * the plate, as layout.css's fill), so rim and plate are glass over the page
 * like the ring outside; unframed, the whole box.
 */
export function paneTintRects(p: Pick<PaneGeom, 'x' | 'y' | 'w' | 'h' | 'border' | 'plate'>): Rect[] {
  const t = p.border;
  if (!t) return [{ x: p.x, y: p.y, w: p.w, h: p.h }];
  const x0 = p.x + t, x1 = p.x + p.w - t, y0 = p.y + t, y1 = p.y + p.h - t;
  if (x1 <= x0 || y1 <= y0) return [];
  const pl = p.plate;
  const yb = pl ? Math.min(y1, Math.max(y0, pl.y1)) : y0;
  const out: Rect[] = [{ x: x0, y: yb, w: x1 - x0, h: y1 - yb }];
  if (pl && yb > y0) {
    if (pl.x > x0) out.push({ x: x0, y: y0, w: pl.x - x0, h: yb - y0 });
    const px1 = pl.x + pl.w;
    if (px1 < x1) out.push({ x: px1, y: y0, w: x1 - px1, h: yb - y0 });
  }
  return out.filter((r) => r.w > 0 && r.h > 0);
}

/**
 * The nameplate in screen px from the frame box `fr` and the plate's
 * frame-box values (pane.ts `--plate-*`), its sides widened to whole half
 * px (nothing lit may reach under the title); undefined without a plate.
 */
export function plateOf(fr: Rect, x0: number, x1: number, y0: number, y1: number, r: number): PanePlate | undefined {
  if (!Number.isFinite(x0 + x1 + y0 + y1)) return undefined;
  const a = Math.floor((fr.x + x0) * 2) / 2, b = Math.ceil((fr.x + x1) * 2) / 2;
  return { x: a, w: b - a, y1: fr.y + y1, lip: y0, r };
}

// `cutRects` and `holeClip` moved to src/layout/float-holes.ts (ADR 0095
// addendum: the cockpit cuts the holes, weather on or off).
export { cutRects, holeClip } from '../layout/float-holes';

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
export function measureGeometry(host: MeasureHost, dpr: number): Geometry {
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
    const t = v('--frame-t', frameThickness(cell.h));
    const fi = frameInset(cell.w, cell.h);
    const ins = { l: v('--frame-l', fi), r: v('--frame-r', fi), top: v('--frame-top', fi), b: v('--frame-b', fi) };
    const fr = frameRect(box, framed, ins);
    const plate = framed ? plateOf(fr, v('--plate-x0', NaN), v('--plate-x1', NaN), v('--plate-y0', NaN), v('--plate-y1', NaN), v('--plate-r', 0)) : undefined;
    panes.push({
      ...fr,
      box,
      id: el.dataset.pane ?? '',
      border: framed ? t : 0,
      label: el.getAttribute('aria-label') ?? '',
      floating: el.hasAttribute('data-floating'),
      z: el.hasAttribute('data-floating') ? Number(el.style.zIndex) || 0 : 0,
      bg: bg && bg !== termBg ? bg : null,
      clear: el.hasAttribute('data-clear'),
      ...(plate ? { plate } : {}),
    });
  }
  const W = round(base.width), H = round(base.height);
  return {
    W,
    H,
    dpr,
    out,
    panes,
    protect: protectFor(W, out.y + out.h, cell.h, cell.size),
    cell,
  };
}
