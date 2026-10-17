// The sunrise / sunset beams (owner feedback 37, 2026-10-17): a few strong,
// well-defined beams in the middle of the ray fan, on straight paths across
// the screen, sweeping slowly as the sun moves; where a beam crosses a pane's
// frame line, that stretch of the line glints. Pure geometry here (unit
// tested); sky.ts draws the beams and the glints (glint.ts).
//
// A beam is a thin wedge from the sun: its middle at angle `a`, half-width
// `hw` (radians), strength `k`. Its hits are the points where its middle
// crosses a frame line (top, bottom, left, right; the top line's title gap
// is left to Glints.line), with the stretch of the line inside the beam
// (`len`). The first line a beam meets on a pane is where it enters (the
// strong glint); where it leaves it is weaker, as the beam is inside a pane.
// The panes cast no shadow on the beams (the faint rays keep their shadow
// wedges): a beam goes on at full strength after a pane, only weaker inside
// it. To draw that without clips, `beamPieces` cuts the beam's triangle into
// convex pieces inside and outside the pane boxes.

import { sst } from './env';
import type { FrameBox, Side } from './glint';

export interface Beam {
  /** The beam's middle, radians (canvas: 0 = right, π/2 = down). */
  a: number;
  /** Half its width, radians. */
  hw: number;
  /** Strength 0..1. */
  k: number;
}

export interface BeamHit {
  p: FrameBox;
  side: Side;
  /** Where along the line (x for t/b, y for l/r). */
  c: number;
  /** The stretch of the line inside the beam, px. */
  len: number;
  /** Distance from the sun along the beam. */
  t: number;
  /** Entering the pane (the first line it meets) or leaving it. */
  enter: boolean;
  /** How much of the beam is there: 1, less where the hit lies inside another pane (the beam is weaker in there). */
  att: number;
}

/** The beams: offsets from the bundle's middle (radians), half-widths, strengths. The middle one is the strongest. */
const BUNDLE: ReadonlyArray<readonly [number, number, number]> = [
  [-0.064, 0.0075, 0.62],
  [0, 0.0105, 1],
  [0.05, 0.0085, 0.76],
];
export const BEAMS = BUNDLE.length;

/** Inside a pane a beam is this strong (as the faint rays are in their shadow wedges, ~0.55²). */
export const BEAM_INSIDE = 0.32;
/** A beam leaving a pane: this much of the entry glint (inside a pane the beam is hardly seen, so only a trace). */
export const BEAM_EXIT = 0.15;

/**
 * Where the bundle points: a point it crosses on the screen, moving over the
 * moment so the beams sweep across. A sunset (sun at the top left, sinking)
 * starts steep, down toward the bottom middle, and ends flat toward the right
 * edge; a sunrise (sun at the top right, climbing) the other way round:
 * flat toward the left edge first, steep toward the bottom middle at the end.
 */
export function beamAim(kind: 'rise' | 'set', p: number, W: number, H: number, out: Float32Array): void {
  const q = sst(0, 1, p);
  if (kind === 'set') {
    out[0] = W * (0.4 + 0.66 * q);
    out[1] = H * (1.05 - 0.75 * q);
  } else {
    out[0] = W * (-0.06 + 0.66 * q);
    out[1] = H * (0.3 + 0.75 * q);
  }
}

const AIM = new Float32Array(2);

/** The bundle's beams for the sun at (sx, sy), `p` into a moment, at time T (a slow sway). Fills `out` (BEAMS long). */
export function sunBeams(kind: 'rise' | 'set', p: number, T: number, sx: number, sy: number, W: number, H: number, out: Beam[]): void {
  beamAim(kind, p, W, H, AIM);
  const mid = Math.atan2(AIM[1]! - sy, AIM[0]! - sx);
  for (let i = 0; i < BEAMS; i++) {
    const [off, hw, k] = BUNDLE[i]!;
    const b = out[i] ?? (out[i] = { a: 0, hw: 0, k: 0 });
    b.a = mid + off + Math.sin(T * 0.13 + i * 1.7) * 0.004;
    b.hw = hw;
    // a slow, small shimmer in strength
    b.k = k * (0.88 + 0.12 * Math.sin(T * 0.9 + i * 2.3));
  }
}

const inBox = (p: FrameBox, x: number, y: number): boolean => x > p.x && x < p.x + p.w && y > p.y && y < p.y + p.h;

/**
 * Where beam `b` from (sx, sy) crosses the frame lines of `panes`: written
 * to `out` (cleared first), nearest first. Borderless panes are skipped.
 */
export function beamHits(panes: readonly FrameBox[], sx: number, sy: number, b: Beam, out: BeamHit[]): BeamHit[] {
  out.length = 0;
  const dx = Math.cos(b.a), dy = Math.sin(b.a), tw = Math.tan(b.hw) * 2;
  const add = (p: FrameBox, side: Side, t: number, c: number, w: number, lo: number, hi: number): void => {
    if (t <= 0 || c < lo - w / 2 || c > hi + w / 2) return;
    out.push({ p, side, c, len: w, t, enter: false, att: 1 });
  };
  for (const p of panes) {
    if (!p.border) continue;
    const n0 = out.length;
    // top and bottom lines (horizontal): along x
    if (Math.abs(dy) > 1e-4) {
      const k = tw / Math.max(0.2, Math.abs(dy));
      let t = (p.y - sy) / dy;
      add(p, 't', t, sx + dx * t, t * k, p.x, p.x + p.w);
      t = (p.y + p.h - sy) / dy;
      add(p, 'b', t, sx + dx * t, t * k, p.x, p.x + p.w);
    }
    // left and right lines (vertical): along y
    if (Math.abs(dx) > 1e-4) {
      const k = tw / Math.max(0.2, Math.abs(dx));
      let t = (p.x - sx) / dx;
      add(p, 'l', t, sy + dy * t, t * k, p.y, p.y + p.h);
      t = (p.x + p.w - sx) / dx;
      add(p, 'r', t, sy + dy * t, t * k, p.y, p.y + p.h);
    }
    if (out.length === n0) continue;
    let first = n0;
    for (let i = n0 + 1; i < out.length; i++) if (out[i]!.t < out[first]!.t) first = i;
    out[first]!.enter = true;
  }
  // a hit inside another pane (a float over a docked pane): the beam is weaker there
  for (const h of out) {
    const x = h.side === 't' || h.side === 'b' ? h.c : h.side === 'l' ? h.p.x : h.p.x + h.p.w;
    const y = h.side === 'l' || h.side === 'r' ? h.c : h.side === 't' ? h.p.y : h.p.y + h.p.h;
    for (const q of panes) if (q !== h.p && inBox(q, x, y)) h.att = BEAM_INSIDE;
  }
  out.sort((x, y) => x.t - y.t);
  return out;
}

/** A box the beams are weaker in: x0, y0, x1, y1. */
export type Box = readonly [number, number, number, number];

/** Sutherland–Hodgman: the part of convex polygon `P` (flat x, y list) where `sign · (coord[axis] − v) ≤ 0`. */
function clipHalf(P: readonly number[], axis: 0 | 1, v: number, sign: 1 | -1): number[] {
  const out: number[] = [], n = P.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = P[i * 2]!, ay = P[i * 2 + 1]!, bx = P[j * 2]!, by = P[j * 2 + 1]!;
    const da = sign * ((axis ? ay : ax) - v), db = sign * ((axis ? by : bx) - v);
    if (da <= 0) out.push(ax, ay);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const f = da / (da - db);
      out.push(ax + (bx - ax) * f, ay + (by - ay) * f);
    }
  }
  return out.length >= 6 ? out : [];
}

/**
 * Cuts the convex polygon `poly` into convex pieces inside the boxes (each
 * piece in the first box it meets) and outside all of them. Each piece is a
 * flat x, y list; the pieces tile `poly` exactly, so filled one by one with
 * an additive mode they leave no seam.
 */
export function beamPieces(poly: readonly number[], boxes: readonly Box[], inside: number[][], outside: number[][]): void {
  inside.length = 0;
  outside.length = 0;
  let todo: number[][] = [poly.slice()];
  for (const [x0, y0, x1, y1] of boxes) {
    const next: number[][] = [];
    for (const P of todo) {
      // quick reject: the piece's bounds miss the box
      let px0 = Infinity, py0 = Infinity, px1 = -Infinity, py1 = -Infinity;
      for (let i = 0; i < P.length; i += 2) {
        px0 = Math.min(px0, P[i]!);
        px1 = Math.max(px1, P[i]!);
        py0 = Math.min(py0, P[i + 1]!);
        py1 = Math.max(py1, P[i + 1]!);
      }
      if (px1 <= x0 || px0 >= x1 || py1 <= y0 || py0 >= y1) {
        next.push(P);
        continue;
      }
      // above, below, then left and right within the box's rows, and the box itself
      const above = clipHalf(P, 1, y0, 1);
      const rest = clipHalf(P, 1, y0, -1);
      const below = clipHalf(rest, 1, y1, -1);
      const band = clipHalf(rest, 1, y1, 1);
      const left = clipHalf(band, 0, x0, 1);
      const mid = clipHalf(band, 0, x0, -1);
      const right = clipHalf(mid, 0, x1, -1);
      const box = clipHalf(mid, 0, x1, 1);
      for (const o of [above, below, left, right]) if (o.length) next.push(o);
      if (box.length) inside.push(box);
    }
    todo = next;
  }
  for (const P of todo) outside.push(P);
}
