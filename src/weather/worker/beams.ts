// The sunrise / sunset beams (owner feedback 37, 2026-10-17): a few
// well-defined beams spread over the ray fan (owner item 78), on straight
// paths across the screen, moving slowly with the sun; where a beam crosses a pane's
// frame line, that stretch of the line glints. Pure geometry here (unit
// tested); sky.ts draws the beams and the glints (glint.ts).
//
// A beam is a thin wedge from the sun: its middle at angle `a`, half-width
// `hw` (radians), strength `k`. Its hits are the points where its middle
// crosses a frame rim (top, bottom, left, right; the top rim along the
// nameplate is left to Glints.line), with the stretch of the line inside the beam
// (`len`). The first line a beam meets on a pane is where it enters (the
// strong glint); where it leaves it is weaker, as the beam is inside a pane.
// Only the first pane along the beam glints (owner item 86): a pane behind
// it, or a docked pane under a float the beam met first, gets none from it.
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

/**
 * The fan's places, lower edge first, and the light's tier at each (owner
 * item 80): S a beam (a little stronger), m a thin ray a little weaker, w
 * one much weaker; interleaved evenly (S w m w S …), the three beams spread
 * over the whole fan, never side by side.
 */
const SLOTS = 'wmwSwmwSwmwSwmw';
export const FAN_SLOTS = SLOTS.length;
/** The thin rays' places (index into the fan's slots) and their tier: 'm' or 'w'. */
export const RAY_SLOTS: readonly number[] = [...SLOTS].flatMap((c, i) => (c === 'S' ? [] : [i]));
const BEAM_SLOTS: readonly number[] = [...SLOTS].flatMap((c, i) => (c === 'S' ? [i] : []));
/** Thin ray `i`'s tier. */
export const rayTier = (i: number): 'm' | 'w' => SLOTS[RAY_SLOTS[i % RAY_SLOTS.length]!] as 'm' | 'w';
/** A tier's frame glint against a beam's (owner item 80: strongest from the beams, less from the middle rays, least from the weak). */
export const TIER_GLINT: Readonly<Record<'S' | 'm' | 'w', number>> = { S: 1, m: 0.6, w: 0.3 };

/**
 * The beams: half-widths and strengths, at the fan's S places. Three of
 * about one strength (owner item 80: not three much stronger ones, bunched).
 */
const BUNDLE: ReadonlyArray<readonly [number, number]> = [
  [0.006, 0.9],
  [0.0075, 1],
  [0.0065, 0.9],
];
export const BEAMS = BUNDLE.length;

/** Inside a pane a beam is this strong (as the faint rays are in their shadow wedges, ~0.55²). */
export const BEAM_INSIDE = 0.32;
/** A beam leaving a pane: this much of the entry glint (inside a pane the beam is hardly seen, so only a trace). */
export const BEAM_EXIT = 0.15;

/**
 * One sun for the whole day (owner items 65–68, ADR 0093 "One sun"): the
 * sun stands at an angle `psi` on a circle round a point at the screen's
 * middle and the horizon's height: 0 at the horizon to the right (east), π/2
 * straight above, π at the horizon to the left (west). From the screen's
 * middle its light comes in at `psi` from the horizontal (π − psi on the
 * left side). A sunrise climbs from 0 to SUN_RISE_PSI, the day's glimpses
 * go on from there to π − SUN_SET_PSI, a sunset sinks from there to π, so
 * where one ends the next begins.
 */
export const SUN_RISE_PSI = (40 * Math.PI) / 180;
/** The sun's height when a sunset starts: at most ~45° up (owner item 66). */
export const SUN_SET_PSI = (40 * Math.PI) / 180;
/** The middle of the sun's circle by day, a share of H: where its light aims. */
export const SUN_HORIZON = 0.45;
/**
 * The horizon the sun rises from and sets below, a share of H: about a
 * third up from the bottom, above the input line, where the day sky fades
 * out (owner item 75; one line for both, so they mirror).
 */
export const SUN_TURN_HORIZON = 0.65;

/** The sun's angle for a sunrise or sunset `p` (0..1 into it) or the day's `sunU` (0..1). */
export function sunPsi(kind: 'rise' | 'day' | 'set', x: number): number {
  const q = Math.min(1, Math.max(0, x));
  // even all through: no easing that bunches the climb or the descent at an end (owner items 71, 72)
  if (kind === 'rise') return SUN_RISE_PSI * q;
  if (kind === 'set') return Math.PI - SUN_SET_PSI * (1 - q);
  return SUN_RISE_PSI + (Math.PI - SUN_SET_PSI - SUN_RISE_PSI) * q;
}

/** How far the sun's circle has sunk to the turn horizon at `psi`: 1 at the horizon (0, π), 0 on the day's path (SUN_RISE_PSI … π − SUN_SET_PSI). */
function turnLow(psi: number): number {
  return Math.max(1 - sst(0, SUN_RISE_PSI, psi), sst(Math.PI - SUN_SET_PSI, Math.PI, psi));
}

/**
 * The sun's place at `psi` for a W × H screen: always outside it (beyond
 * the right edge, above the top, beyond the left edge). Through a sunrise
 * and a sunset the circle's middle moves between the day's SUN_HORIZON and
 * the turn horizon SUN_TURN_HORIZON, so a sunrise starts and a sunset ends
 * with the sun at that horizon, its light coming in level with it, above
 * the input line (owner items 72, 75).
 */
export function sunPoint(psi: number, W: number, H: number, out: Float32Array): void {
  const cx = W / 2, D = Math.hypot(cx, H * Math.max(SUN_HORIZON, SUN_TURN_HORIZON)) * 1.05;
  const cy = H * (SUN_HORIZON + (SUN_TURN_HORIZON - SUN_HORIZON) * turnLow(psi));
  out[0] = cx + D * Math.cos(psi);
  out[1] = cy - D * Math.sin(psi);
}

/**
 * Where every ray and beam of a sun points to: the screen's middle at the
 * day's SUN_HORIZON, or level with a sun low at the turn horizon (its light
 * comes in level at a sunrise's start and a sunset's end); its fan is laid
 * round this.
 */
export function sunMid(sx: number, sy: number, W: number, H: number): number {
  const ay = Math.min(H * SUN_TURN_HORIZON, Math.max(H * SUN_HORIZON, sy));
  return Math.atan2(ay - sy, W * 0.5 - sx);
}

/** The slow sway every ray and beam share (radians), so the light moves as one (owner item 68). */
export function sunDrift(T: number): number {
  return Math.sin(T * 0.11) * 0.008 + Math.sin(T * 0.043 + 1.3) * 0.005;
}

/** The turn's ray fan reaches down to the screen's bottom edge (a share of H; owner item 80, was 0.78 above the input line, item 75). */
export const FAN_FLOOR = 1;

/** The direction (radians, round `am`) from the sun at `psi` to (x, y) on a W × H screen. */
/** Scratch for sunToward. */
const TP = new Float32Array(2);
function sunToward(psi: number, x: number, y: number, W: number, H: number, am: number): number {
  sunPoint(psi, W, H, TP);
  const d = Math.atan2(y - TP[1]!, x - TP[0]!) - am;
  return am + Math.atan2(Math.sin(d), Math.cos(d));
}

/**
 * The ray fan of a sunrise or sunset for the sun at `psi` (at sx, sy):
 * `out[0]` its lower edge, `out[1]` its upper (radians). Its edges do not
 * aim at the screen's corners as before: seen from a sun passing close by a
 * corner, that corner's angle swung by up to 90° in seconds and the whole
 * fan with it (owner item 79). The lower edge points nearly straight down
 * (owner items 80, 81): toward the bottom edge FAN_FLOOR_X in from the sun's
 * side as seen from the sun where the turn starts and where it ends, and
 * evenly between the two in between (aimed at the point itself all the way,
 * it swung at up to 1.4°/s while the sun was near it). The upper edge is
 * FAN_UP_LOW above the horizontal under a low sun (owner item 78) and
 * FAN_UP_HIGH as it climbs, but never above the far top corner. So the fan
 * spans from about level to nearly straight down, every edge under 1°/s.
 */
export function turnFan(psi: number, sx: number, sy: number, W: number, H: number, out: Float32Array): void {
  const low = turnLow(psi), right = psi < Math.PI / 2;
  const am = sunMid(sx, sy, W, H);
  // round the sun's middle direction (no wrap at ±π: a sun beyond the right edge looks left)
  const round = (a: number): number => {
    const d = a - am;
    return am + Math.atan2(Math.sin(d), Math.cos(d));
  };
  const toward = (x: number, y: number): number => round(Math.atan2(y - sy, x - sx));
  // the turn's start and end (a sunrise climbs from psi 0, a sunset sinks to π)
  const p0 = right ? 0 : Math.PI - SUN_SET_PSI, p1 = right ? SUN_RISE_PSI : Math.PI;
  const q = Math.min(1, Math.max(0, (psi - p0) / (p1 - p0)));
  const fx = right ? W * (1 - FAN_FLOOR_X) : W * FAN_FLOOR_X, fy = H * FAN_FLOOR;
  out[0] = lerp(sunToward(p0, fx, fy, W, H, am), sunToward(p1, fx, fy, W, H, am), q);
  const e = lerp(FAN_UP_HIGH, FAN_UP_LOW, low), corner = toward(right ? 0 : W, 0);
  // up is a larger angle looking left, a smaller one looking right: the lower of the two
  out[1] = right ? Math.min(round(Math.PI + e), corner) : Math.max(round(-e), corner);
}

/** Where the ray fan's lower edge meets the bottom edge, a share of W in from the sun's side (owner item 80: the steepest arrow ends there). */
const FAN_FLOOR_X = 0.1;
/** The ray fan's upper edge above the horizontal: under a sun low at the turn horizon, and as it climbs (radians). */
const FAN_UP_LOW = (2 * Math.PI) / 180;
const FAN_UP_HIGH = (12 * Math.PI) / 180;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Thin ray `i`'s own fixed random value 0..1 (its place off the even spread, width, strength). */
export function rayHash(i: number): number {
  const r = Math.sin(i * 12.9898 + 3) * 43758.5453;
  return r - Math.floor(r);
}

/** Thin ray `i` at time T in the fan `a0` … `a1`: at its place among the beams (RAY_SLOTS, owner item 80), a little off it (was ±0.35 of a place: bunched, owner item 78), swaying with the beams (one sun, item 68) and a little on its own. */
export function turnRayAngle(i: number, a0: number, a1: number, T: number): number {
  const at = RAY_SLOTS[i % RAY_SLOTS.length]! + 0.5 + (rayHash(i) - 0.5) * 0.2;
  return a0 + ((a1 - a0) * at) / FAN_SLOTS + sunDrift(T) + Math.sin(T * 0.15 + i) * 0.0015;
}

/** The beams at time T: spread over the sun's ray fan `a0` … `a1` (turnFan), with the rays' common sway. Fills `out` (BEAMS long). */
export function sunBeams(T: number, a0: number, a1: number, out: Beam[]): void {
  const drift = sunDrift(T);
  for (let i = 0; i < BEAMS; i++) {
    const [hw, k] = BUNDLE[i]!, f = (BEAM_SLOTS[i]! + 0.5) / FAN_SLOTS;
    const b = out[i] ?? (out[i] = { a: 0, hw: 0, k: 0 });
    b.a = a0 + (a1 - a0) * f + drift + Math.sin(T * 0.13 + i * 1.7) * 0.0015;
    b.hw = hw;
    // a slow, small shimmer in strength
    b.k = k * (0.88 + 0.12 * Math.sin(T * 0.9 + i * 2.3));
  }
}

const inBox = (p: FrameBox, x: number, y: number): boolean => x > p.x && x < p.x + p.w && y > p.y && y < p.y + p.h;

/**
 * Where beam `b` from (sx, sy) crosses the frame lines of the first pane it
 * meets (owner item 86): written to `out` (cleared first), nearest first.
 * Borderless panes are skipped.
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
  // only the first pane the beam meets glints (owner item 86): its entry and its exit; none behind it
  if (out.length > 1) {
    let first = out[0]!;
    for (const h of out) if (h.t < first.t) first = h;
    let n = 0;
    for (const h of out) if (h.p === first.p) out[n++] = h;
    out.length = n;
  }
  // a hit inside another pane (a float over a docked pane): the beam is weaker there
  for (const h of out) {
    const x = h.side === 't' || h.side === 'b' ? h.c : h.side === 'l' ? h.p.x : h.p.x + h.p.w;
    const y = h.side === 'l' || h.side === 'r' ? h.c : h.side === 't' ? h.p.y : h.p.y + h.p.h;
    for (const q of panes) if (q !== h.p && q.border && inBox(q, x, y)) h.att = BEAM_INSIDE;
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
 * The convex polygon `poly` less the rectangle `[x0, x1] × [y0, y1]`, as up
 * to four convex pieces that tile it without overlap (left of the rectangle,
 * right of it, above and below it between its sides): a pane's shadow wedge
 * with the nameplate left out, so the plate gets the light the rim gets
 * (owner item 42). The cuts are whole lines, so with whole-pixel `x0`/`x1`
 * the pieces meet without a seam.
 */
export function notchPieces(poly: readonly number[], x0: number, y0: number, x1: number, y1: number): number[][] {
  const out: number[][] = [];
  const left = clipHalf(poly, 0, x0, 1);
  const rest = clipHalf(poly, 0, x0, -1);
  const right = clipHalf(rest, 0, x1, -1);
  const mid = clipHalf(rest, 0, x1, 1);
  const above = clipHalf(mid, 1, y0, 1);
  const below = clipHalf(mid, 1, y1, -1);
  for (const P of [left, right, above, below]) if (P.length) out.push(P);
  return out;
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
