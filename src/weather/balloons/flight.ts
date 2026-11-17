// A balloon's flight (stage 69, ADR 0159; round 2 of 2026-11-17): pure
// functions of the layout, a seed and the time since the notice. No DOM;
// balloons.ts samples `flightAt` once per frame and writes the result as a
// transform and an opacity.
//
// It moves like a hot-air balloon (owner, round 2): never fast, and its
// velocity is continuous over the whole flight: every phase hands the next
// its velocity, so nothing ever jumps in speed, a joined kill included.
//
//   arrive  ~5–6 s  rises from below the bottom edge (from behind the
//                   prompt), already rising, and slows gently to rest at
//                   the readable spot in the lower part of the screen
//                   (a cubic Hermite: its velocity at the end is the creep's)
//   read    ~5.5 s  nearly at rest: gentle sway and bob and a slow creep
//                   upward (a constant velocity, so `extendRead` only
//                   lengthens it); the sign swings lazily
//   glide   3–4.5 s it eases into flight: the velocity turns and grows
//                   linearly from the creep's to a cruise somewhat faster
//                   than the arrival; from here on the balloon is in the
//                   sky layer, behind the game text, and shrinks
//   drift   to ~1 min the cruise decays to a slow drift pace, by one of
//                   three paths:
//                   - top:     rises out over the top fairly soon
//                   - right:   wanders and leaves over the right edge
//                   - meander: a long slow meander that fades out in the sky
//
// The glide and the drift are planned once as velocity keyframes (every
// KEY_DT s); between two the velocity is linear, so the position is a
// piecewise quadratic with a continuous velocity, and the speed is never
// above the larger of the two keyframes' (at most V_CRUISE_MAX). The sway
// on top is sums of sines with a smooth envelope; VMAX bounds the whole.
// How much a balloon shrinks varies a lot per seed (to 15–85 % of its size).
//
// The sky lane (owner, 2026-11-17): the balloons keep to the part of the
// screen where the sky shows and the game text is not. The sky comes in
// from the left band (worker/band.ts: none up to 0.4 W, all from 0.7 W);
// MUME's lines are 80 columns, so the text's right edge is the game pane's
// left plus 80-odd cells. On a wide desktop the lane is the strip right of
// both; there the readable spot and every later path stay in it. Where the
// lane is too narrow for a balloon (a narrow window), the flight uses the
// whole width, and its distant part is behind the text (the sky layer), so
// it never covers text one has to read for long.
//
// Never over a pane (owner, round 2): the arriving and readable balloon is
// in a layer between the game text and the panes (balloons.ts), so it
// crosses bare game text only; the panes always cover it.
//
// `prefers-reduced-motion`: no flight at all; it fades in at the readable
// spot, stays, and fades out.

import { LEFT_DARK } from '../worker/band';

export interface LaneGeom {
  W: number;
  H: number;
  /** The game pane. */
  out: { x: number; y: number; w: number; h: number };
  cell: { w: number; h: number };
  /** The masked strip over the prompt: nothing flies below `fadeTop`. */
  protect: { fadeTop: number };
  /** No left band (the phone's layout): the sky is over the whole width. */
  noBand?: boolean;
}

export interface Lane {
  /** Left and right bound of the balloon's centre line's room, px. */
  x0: number;
  x1: number;
  /** True: the sky lane, clear of the game text. False: the whole width (too little sky room). */
  sky: boolean;
}

/** The column MUME wraps at, plus a little air. */
export const TEXT_COLS = 82;
/** The share of the width where the sky is about half in (band.ts: none to 0.4 W, all from LEFT_DARK · W). */
export const SKY_FROM = LEFT_DARK * 0.8;
/** Margin to the screen's edges, px. */
const EDGE = 8;
/** A lane is used when it is at least this many balloon widths wide. */
export const LANE_MIN = 1.25;

/** The room the balloons fly in for a balloon `bw` px wide (see the file header). */
export function skyLane(g: LaneGeom, bw: number): Lane {
  const textRight = g.out.x + Math.min(g.out.w, TEXT_COLS * g.cell.w) + g.cell.w;
  const skyLeft = g.noBand ? 0 : g.W * SKY_FROM;
  const x0 = Math.max(skyLeft, textRight, EDGE), x1 = g.W - EDGE;
  if (x1 - x0 >= bw * LANE_MIN) return { x0, x1, sky: true };
  return { x0: EDGE, x1: g.W - EDGE, sky: false };
}

// ------------------------------------------------------------------ random

/** A small seeded PRNG (mulberry32): the same seed, the same flight. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------- plan

export type LeavePath = 'top' | 'right' | 'meander';
export type Phase = 'arrive' | 'read' | 'glide' | 'drift' | 'done';

export interface Pt {
  x: number;
  y: number;
}

/** A leave keyframe: seconds since the leave began, the offset from where the read phase ended, the velocity (px/s). */
export interface Key {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Times in seconds. Positions are the balloon's top centre, px in the cockpit. */
export interface FlightPlan {
  reduced: boolean;
  /** The balloon's size at scale 1. */
  bw: number;
  bh: number;
  lane: Lane;
  path: LeavePath;
  /** The scale while readable (smaller on a small screen). */
  scale: number;
  /** Where it starts: below the bottom edge. */
  start: Pt;
  read0: Pt;
  ta: number;
  /** Readable time; `extendRead` lengthens it. */
  read: number;
  /** Upward creep while readable, px/s. */
  creep: number;
  tg: number;
  td: number;
  /** The leave's velocity keyframes (the first at 0 with the creep's velocity, the last at tg + td). */
  keys: Key[];
  /** The scale at the end, and over how many seconds of the leave it shrinks to it. */
  sEnd: number;
  shrinkT: number;
  /** When the leave starts its last fade (share of it; 1: none, it is out of sight by then). */
  fadeFrom: number;
  sway: { ax: number; fx: number; ay: number; fy: number; p1: number; p2: number };
}

/** Readable time without joined kills, and its cap. */
export const READ_S = 5.5;
export const READ_MAX = 9;
/** What a joined kill adds to the readable time. */
export const READ_EXTEND = 1.2;
/** Upward creep while readable, px/s. */
export const CREEP = 2.5;
/** The arrival's peak speed, px/s (a long way up is given more time). */
export const V_ARRIVE = 110;
/**
 * The arrival's speed profile (share of the mean): g(u) = (1 − u)² (A + B u),
 * with the integral 1. It enters already rising (A), peaks early at about
 * 1.7 while the sign is still low, and comes to rest with no deceleration
 * left at the end (g(1) = g'(1) = 0): a soft stop.
 */
const ARR_A = 1.2, ARR_B = 12 - 4 * ARR_A;
/** The profile's peak (at u = (B − 2A) / 3B). */
const ARR_PEAK = (() => {
  const u = (ARR_B - 2 * ARR_A) / (3 * ARR_B);
  return (1 - u) ** 2 * (ARR_A + ARR_B * u);
})();
/** The arrival's progress 0 → 1 at u (the integral of the profile). */
const arrive = (u: number): number => ARR_A * u + ((ARR_B - 2 * ARR_A) * u ** 2) / 2 + ((ARR_A - 2 * ARR_B) * u ** 3) / 3 + (ARR_B * u ** 4) / 4;
/** The leave's gentlest and largest change of velocity, px/s²: the brake toward a bound, and the cap on any turn or change of pace. */
const A_BRAKE = 12;
const A_MAX = 24;
/** The fastest cruise when it leaves, px/s. */
export const V_CRUISE_MAX = 115;
/** No point of a balloon's flight is faster than this, px/s (the cruise plus the sway). */
export const VMAX = 150;
/** The leave's keyframe spacing, s. */
export const KEY_DT = 2.5;
/** The longest leave, s. */
const LEAVE_MAX = 58;

export interface PlanOpts {
  reduced?: boolean;
  /** The centre x of the balloons still near (arriving, readable or gliding): this one's readable spot keeps clear of them. */
  avoidX?: number | readonly number[] | null;
}

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** 0 → 1 with zero slope at both ends (C1). */
const smooth = (u: number): number => {
  const c = clamp(u, 0, 1);
  return c * c * (3 - 2 * c);
};

/** A flight for a balloon `bw` × `bh` px on layout `g` (see the file header). */
export function planFlight(seed: number, g: LaneGeom, bw: number, bh: number, opts: PlanOpts = {}): FlightPlan {
  const r = rng(seed);
  const between = (a: number, b: number): number => a + (b - a) * r();
  const scale = clamp(Math.min(g.W / 640, g.H / 720), 0.62, 1);
  const lane = skyLane(g, bw * scale);
  const half = (bw * scale) / 2;
  const lx0 = lane.x0 + half, lx1 = Math.max(lane.x0 + half, lane.x1 - half);
  const floor = Math.max(bh * scale * 0.4, g.protect.fadeTop);

  // The readable spot: low, just above the prompt's strip. Across: the
  // lane's left part on a wide screen (the empty strip right of the text,
  // before the docked panes), else right of the middle. Always over the
  // game pane: the panes cover the balloons (round 2), so a sign behind a
  // docked pane could not be read. Where the strip right of the text is
  // too narrow for it (docked panes close by, or a second balloon in it),
  // it is readable over the right end of the text instead.
  const readHi = Math.max(EDGE + half, Math.min(lx1, g.out.x + g.out.w - half - 4));
  const readLo = Math.min(lx0, readHi);
  let rx = lane.sky ? clamp(lx0 + r() * Math.min(bw * scale * 0.9, lx1 - lx0), readLo, readHi) : clamp(g.W * 0.62 + (r() - 0.5) * bw * 0.5, EDGE + half, readHi);
  const near = opts.avoidX == null ? [] : typeof opts.avoidX === 'number' ? [opts.avoidX] : opts.avoidX;
  if (near.length) {
    // The first of: its own spot, then right or left of each near balloon,
    // that is clear of all of them; else the one farthest from them.
    const w = bw * scale;
    const gap = (x: number): number => Math.min(...near.map((a) => Math.abs(x - a)));
    const cands = [rx, ...near.flatMap((a) => [a + w * 0.95, a - w * 0.95])].filter((x) => x >= EDGE + half && x <= readHi);
    rx = cands.find((x) => gap(x) >= w * 0.85) ?? cands.reduce((b, x) => (gap(x) > gap(b) ? x : b), rx);
  }
  const ry = Math.max(EDGE, floor - bh * scale - between(8, 24));
  const read0 = { x: rx, y: ry };
  // It comes up from below the bottom edge (behind the prompt), a little aside.
  const start = { x: clamp(rx + (r() - 0.5) * 50, Math.min(rx, readLo), readHi), y: g.H + 4 };
  // Long enough that the arrival's peak stays under V_ARRIVE.
  const dist = Math.hypot(start.x - rx, start.y - ry);
  const ta = Math.max(between(5.5, 6.5), (ARR_PEAK * dist) / V_ARRIVE);
  const read = READ_S + r() * 0.6;

  const pick = r();
  const path: LeavePath = pick < 0.34 ? 'top' : pick < 0.7 ? 'right' : 'meander';
  let tg = between(4, 5);
  const side = lane.sky ? 1 : rx < g.W / 2 ? 1 : r() < 0.5 ? -1 : 1;
  const D2R = Math.PI / 180;
  const p1 = r() * 6.283, p2 = r() * 6.283;
  // Per path: the cruise and the drift pace (px/s), how fast the one decays
  // to the other (s), the heading at keyframe k (radians from straight up,
  // positive to the right) and the scale it shrinks to.
  let cruise: number, drift: number, decay: number, sEnd: number, heading: (k: number) => number;
  if (path === 'top') {
    cruise = between(95, V_CRUISE_MAX);
    drift = between(40, 60);
    decay = between(5, 8);
    sEnd = scale * between(0.3, 0.85);
    const a0 = side * between(5, 25) * D2R;
    heading = (k) => a0 + 0.25 * Math.sin(0.8 * k + p1);
  } else if (path === 'right') {
    cruise = between(85, 110);
    drift = between(18, 30);
    decay = between(5, 8);
    sEnd = scale * between(0.25, 0.8);
    const a0 = between(30, 55) * D2R;
    heading = (k) => lerp(a0, 75 * D2R, Math.min(1, k / 3)) + 0.35 * Math.sin(0.7 * k + p1);
  } else {
    cruise = between(70, 95);
    drift = between(8, 15);
    decay = between(4, 6);
    sEnd = scale * between(0.15, 0.4);
    const a0 = side * between(20, 50) * D2R;
    heading = (k) => a0 + 1.5 * Math.sin(0.33 * k + p1) + 0.7 * Math.sin(0.9 * k + p2);
  }
  // The ease into flight: never more than A_MAX.
  tg = Math.max(tg, cruise / A_MAX);
  const leaveMax = path === 'meander' ? between(40, LEAVE_MAX) : LEAVE_MAX;
  const shrinkT0 = path === 'meander' ? leaveMax : path === 'top' ? 12 : 30;
  const sAt = (tau: number): number => lerp(scale, sEnd, smooth(tau / shrinkT0));

  // The leave, keyframe by keyframe, from where the read phase ends (as
  // planned; a joined kill moves that up by a few px). It keeps to its room:
  // the lane on a wide screen (only the right path leaves over its right
  // edge), below the screen's top (only the top path leaves over it), and
  // never lower than where it was readable.
  const R = { x: rx, y: ry - CREEP * read };
  const keys: Key[] = [{ t: 0, x: 0, y: 0, vx: 0, vy: -CREEP }];
  const gone = (k: Key, s: number): boolean =>
    path === 'top' ? R.y + k.y + bh * s < -8 : path === 'right' ? R.x + k.x - (bw * s) / 2 > g.W + 8 : false;
  let exited = false;
  for (let i = 1; ; i++) {
    const prev = keys[i - 1]!;
    const t = i === 1 ? tg : prev.t + KEY_DT;
    const dt = t - prev.t;
    const speed = t <= tg ? cruise : drift + (cruise - drift) * Math.exp(-(t - tg) / decay);
    const a = heading(i - 1);
    const s = sAt(t);
    const h = (bw * s) / 2 + 6;
    const xmin = lane.x0 + h, xmax = path === 'right' ? Infinity : lane.x1 - h;
    const ymin = path === 'top' ? -Infinity : EDGE, ymax = R.y;
    // The wanted velocity, changed by at most A_MAX · dt (the glide's first
    // keyframe is exempt: its ease-in is `tg`, long enough by itself).
    let vx = speed * Math.sin(a), vy = -speed * Math.cos(a);
    if (i > 1) {
      const dvx = vx - prev.vx, dvy = vy - prev.vy, dv = Math.hypot(dvx, dvy), lim = A_MAX * dt;
      if (dv > lim) {
        vx = prev.vx + (dvx * lim) / dv;
        vy = prev.vy + (dvy * lim) / dv;
      }
    }
    // Toward a bound never faster than it could still stop before it by
    // braking at A_BRAKE after this keyframe: it turns back in good time.
    const brake = (pos: number, v0: number, v: number, lo: number, hi: number): number => {
      if (v > 0 && hi < Infinity) {
        const room = hi - pos - (v0 * dt) / 2;
        const top = -A_BRAKE * dt / 2 + Math.sqrt(Math.max(0, (A_BRAKE * dt) ** 2 / 4 + 2 * A_BRAKE * room));
        return Math.min(v, room > 0 ? top : (2 * (hi - pos)) / dt - v0);
      }
      if (v < 0 && lo > -Infinity) return -brake(-pos, -v0, -v, -hi, -lo);
      return v;
    };
    // (A balloon that was readable outside its room, over the text, has the
    // room widened to where it is: it is never pulled back in a hurry.)
    const px = R.x + prev.x, py = R.y + prev.y;
    vx = brake(px, prev.vx, vx, Math.min(xmin, px), Math.max(xmax, px));
    vy = brake(py, prev.vy, vy, Math.min(ymin, py), Math.max(ymax, py));
    const k: Key = { t, x: prev.x + ((prev.vx + vx) / 2) * dt, y: prev.y + ((prev.vy + vy) / 2) * dt, vx, vy };
    keys.push(k);
    if (gone(k, s)) {
      exited = true;
      break;
    }
    if (t >= leaveMax) break;
  }
  const leave = keys.at(-1)!.t;
  return {
    reduced: !!opts.reduced,
    bw,
    bh,
    lane,
    path,
    scale,
    start,
    read0,
    ta,
    read,
    creep: CREEP,
    tg,
    td: leave - tg,
    keys,
    sEnd,
    shrinkT: Math.min(leave, shrinkT0),
    fadeFrom: exited ? 1 : path === 'meander' ? 0.6 : 0.8,
    sway: { ax: between(5, 10), fx: between(0.5, 0.8), ay: between(2.5, 4), fy: between(1, 1.5), p1: r() * 6.283, p2: r() * 6.283 },
  };
}

/** A kill joined the sign: the readable time grows, capped. */
export function extendRead(p: FlightPlan): void {
  p.read = Math.min(READ_MAX, p.read + READ_EXTEND);
}

/** Whether a kill at `t` joins this balloon's sign (it is arriving or readable and not about to leave). */
export function canJoin(p: FlightPlan, t: number): boolean {
  return t < p.ta + p.read - 0.4;
}

/** The whole flight, s. */
export function flightTotal(p: FlightPlan): number {
  return p.reduced ? REDUCED_IN + p.read + REDUCED_OUT : p.ta + p.read + p.tg + p.td;
}

const REDUCED_IN = 0.4;
const REDUCED_OUT = 0.6;

// ------------------------------------------------------------------ sample

export interface FlightFrame {
  phase: Phase;
  /** The balloon's top centre, px. */
  x: number;
  y: number;
  scale: number;
  opacity: number;
  /** The rig's lean into its motion, degrees. */
  tilt: number;
  /** The sign's swing under it, degrees. */
  swing: number;
  /** Arriving or readable (the layer over the text, under the panes); else in the sky layer behind the text. */
  front: boolean;
}

export function phaseAt(p: FlightPlan, t: number): Phase {
  if (t >= flightTotal(p)) return 'done';
  if (p.reduced) return 'read';
  if (t < p.ta) return 'arrive';
  if (t < p.ta + p.read) return 'read';
  if (t < p.ta + p.read + p.tg) return 'glide';
  return 'drift';
}

/** The position and scale without sway, and the opacity. */
function base(p: FlightPlan, t: number): { x: number; y: number; s: number; o: number } {
  if (t < p.ta) {
    // Straight from the start to the readable spot by the arrival's
    // profile: it enters rising, slows gently and hands on the creep.
    const u = Math.max(0, t / p.ta), f = arrive(u);
    // plus the creep's velocity at the very end (u³ − u²: 0 at both ends, slope 0 then 1)
    const c = (u ** 3 - u ** 2) * -p.creep * p.ta;
    return { x: lerp(p.start.x, p.read0.x, f), y: lerp(p.start.y, p.read0.y, f) + c, s: p.scale, o: 1 };
  }
  if (t < p.ta + p.read) return { x: p.read0.x, y: p.read0.y - p.creep * (t - p.ta), s: p.scale, o: 1 };
  const rx = p.read0.x, ry = p.read0.y - p.creep * p.read;
  const tau = t - p.ta - p.read;
  const keys = p.keys;
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1]!.t <= tau) i++;
  const a = keys[i]!, b = keys[i + 1] ?? a;
  const dt = b.t - a.t || 1;
  const s = clamp(tau - a.t, 0, dt);
  const x = rx + a.x + a.vx * s + ((b.vx - a.vx) * s * s) / (2 * dt);
  const y = ry + a.y + a.vy * s + ((b.vy - a.vy) * s * s) / (2 * dt);
  const u = clamp(tau / (p.tg + p.td), 0, 1);
  const fade = u < p.fadeFrom ? 1 : 1 - (u - p.fadeFrom) / (1 - p.fadeFrom);
  return { x, y, s: lerp(p.scale, p.sEnd, smooth(tau / p.shrinkT)), o: (1 - 0.2 * u) * fade };
}

/** The sway's offset at t (all phases; it grows in smoothly as the balloon comes to rest). */
function sway(p: FlightPlan, t: number, s: number): Pt {
  const w = p.sway, k = smooth((t - p.ta * 0.4) / (p.ta * 0.6 + 1)) * (s / p.scale);
  return {
    x: k * (w.ax * Math.sin(t * w.fx + w.p1) + w.ax * 0.35 * Math.sin(t * w.fx * 1.9 + w.p2)),
    y: k * w.ay * Math.sin(t * w.fy + w.p2),
  };
}

/** The balloon's top centre at `t`, the sway included. */
export function posAt(p: FlightPlan, t: number): Pt {
  const b = base(p, t), sw = sway(p, t, b.s);
  return { x: b.x + sw.x, y: b.y + sw.y };
}

/** The balloon at `t` seconds after its notice. */
export function flightAt(p: FlightPlan, t: number): FlightFrame {
  const phase = phaseAt(p, t);
  if (p.reduced) {
    const tot = flightTotal(p);
    const o = clamp(Math.min(t / REDUCED_IN, (tot - t) / REDUCED_OUT), 0, 1);
    return { phase, x: p.read0.x, y: p.read0.y, scale: p.scale, opacity: o, tilt: 0, swing: 0, front: true };
  }
  if (phase === 'done') {
    const e = posAt(p, flightTotal(p));
    return { phase, x: e.x, y: e.y, scale: p.sEnd, opacity: 0, tilt: 0, swing: 0, front: false };
  }
  const b = base(p, t), sw = sway(p, t, b.s);
  const h = 0.05;
  const vx = (posAt(p, t + h).x - posAt(p, t - h).x) / (2 * h);
  const vxBefore = (posAt(p, t - 0.2).x - posAt(p, t - 0.3).x) / 0.1;
  const tilt = clamp(vx * 0.08, -7, 7) + Math.sin(t * 1.3 + p.sway.p1) * 1.2;
  // The sign lags the rig: it swings against a change of pace, gets a small
  // kick as the arrival settles, and swings lazily while readable.
  const dt = t - p.ta;
  const kick = dt > 0 ? 3 * Math.exp(-1.2 * dt) * Math.sin(3.6 * dt) : 0;
  const swing = clamp(-(vx - vxBefore) * 0.05 + kick + 2.5 * Math.sin(t * 2.1 + p.sway.p2), -16, 16) - tilt * 0.6;
  return { phase, x: b.x + sw.x, y: b.y + sw.y, scale: b.s, opacity: b.o, tilt, swing, front: phase === 'arrive' || phase === 'read' };
}
