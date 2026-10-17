// Lit shapes on the glass rim and the nameplate (owner items 45, 49; ADR
// 0091 addendum: glass rim and nameplate). Whatever lights a frame line on
// the front layer (glints, the sun's faint lift, the lightning bands) keeps
// to the glass: the rim's rounded outer corners and the plate's fillets and
// rounded lower corners are followed in columns (rows on the sides) one
// device px wide, so no square corner shows outside the rounded rim. Only
// rects: no paths or clips on the GPU canvas (ADR 0091); the columns meet on
// whole device px, so an additive fill leaves no seam between them.

import { RIM_R } from '../../panes/frame';
import type { PanePlate } from '../protocol';

/** A frame box (env.panes): the rim's outer edge, its thickness, the nameplate. */
export interface RimBox {
  x: number;
  y: number;
  w: number;
  h: number;
  border: number;
  plate?: Pick<PanePlate, 'x' | 'w' | 'y1' | 'r'>;
}

export type RimSide = 't' | 'b' | 'l' | 'r';

/** How far in from the box edge the rounded outer edge lies, `u` px along the line from the corner (0 ≤ u ≤ R). */
function cornerDepth(R: number, u: number): number {
  const v = R - Math.min(R, Math.max(0, u));
  return R - Math.sqrt(Math.max(0, R * R - v * v));
}

/**
 * Pushes (x, y, w, h) rects onto `out` covering the stretch `[a0, a1]` (x
 * on t/b, y on l/r) of the rim's `side`, `th` px deep from its outer edge
 * (no deeper than the rim), the rounded outer corners (frame.ts RIM_R)
 * followed in device-px columns.
 */
export function rimRects(out: number[], p: RimBox, side: RimSide, a0: number, a1: number, th: number, dpr: number): void {
  const d = dpr > 0 ? dpr : 1;
  const R = Math.min(RIM_R, p.border || th);
  const horiz = side === 't' || side === 'b';
  const lo = horiz ? p.x : p.y, hi = horiz ? p.x + p.w : p.y + p.h;
  const b0 = Math.max(a0, lo), b1 = Math.min(a1, hi);
  if (b1 - b0 <= 0 || th <= 0) return;
  const emit = (s0: number, s1: number, e: number): void => {
    s0 = Math.max(s0, b0);
    s1 = Math.min(s1, b1);
    // th deep from the curved outer edge, never past the rim's inner edge
    const dep = Math.min(e + th, Math.max(th, p.border)) - e;
    if (s1 - s0 <= 1e-6 || dep <= 1e-6) return;
    if (side === 't') out.push(s0, p.y + e, s1 - s0, dep);
    else if (side === 'b') out.push(s0, p.y + p.h - e - dep, s1 - s0, dep);
    else if (side === 'l') out.push(p.x + e, s0, dep, s1 - s0);
    else out.push(p.x + p.w - e - dep, s0, dep, s1 - s0);
  };
  const c0 = Math.min(lo + R, (lo + hi) / 2), c1 = Math.max(hi - R, (lo + hi) / 2);
  const n = Math.ceil((c0 - lo) * d - 1e-6);
  if (b0 < c0)
    for (let i = 0; i < n; i++) {
      const s = lo + i / d, s1 = Math.min(c0, lo + (i + 1) / d);
      if (s1 <= b0) continue;
      if (s >= b1) break;
      emit(s, s1, cornerDepth(R, (s + s1) / 2 - lo));
    }
  emit(c0, c1, 0);
  if (b1 > c1)
    for (let i = 0; i < n; i++) {
      const s1 = hi - i / d, s = Math.max(c1, hi - (i + 1) / d);
      if (s >= b1) continue;
      if (s1 <= b0) break;
      emit(s, s1, cornerDepth(R, hi - (s + s1) / 2));
    }
}

/**
 * Pushes rects onto `out` covering the nameplate's glass below the rim
 * within `[a0, a1]` (x): the concave fillets either side, the body, its
 * rounded lower corners (the shape of frame.ts `frameHolePath`), so a light
 * on the top rim lights the plate as part of it (owner item 49).
 */
export function plateRects(out: number[], p: RimBox, a0: number, a1: number, dpr: number): void {
  const g = p.plate;
  if (!g) return;
  const d = dpr > 0 ? dpr : 1;
  const yt = p.y + p.border, H = g.y1 - yt;
  if (H <= 0) return;
  const X0 = Math.round(g.x * d) / d, X1 = Math.round((g.x + g.w) * d) / d;
  const r = g.r, br = Math.max(0, Math.min(r, (X1 - X0) / 2, H - r));
  // columns one device px wide over [from, to], each `hgt(mid)` px down from the rim
  const cols = (from: number, to: number, hgt: (x: number) => number): void => {
    const m = Math.ceil((to - from) * d - 1e-6);
    for (let i = 0; i < m; i++) {
      const s = from + i / d, s1 = Math.min(to, from + (i + 1) / d);
      const x0 = Math.max(s, a0), x1 = Math.min(s1, a1);
      if (x1 - x0 <= 1e-6) continue;
      const h = Math.min(H, hgt((s + s1) / 2));
      if (h > 0) out.push(x0, yt, x1 - x0, h);
    }
  };
  const fillet = (u: number): number => r - Math.sqrt(Math.max(0, r * r - u * u));
  const lower = (u: number): number => H - br + Math.sqrt(Math.max(0, br * br - (br - u) * (br - u)));
  cols(X0 - r, X0, (x) => fillet(x - (X0 - r)));
  cols(X0, X0 + br, (x) => lower(x - X0));
  const m0 = Math.max(a0, X0 + br), m1 = Math.min(a1, X1 - br);
  if (m1 - m0 > 1e-6) out.push(m0, yt, m1 - m0, H);
  cols(X1 - br, X1, (x) => lower(X1 - x));
  cols(X1, X1 + r, (x) => fillet(X1 + r - x));
}
