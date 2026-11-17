// A balloon's flight (stage 69, ADR 0159): pure functions of the layout, a
// seed and the time since the kill. No DOM; balloons.ts samples `flightAt`
// once per frame and writes the result as a transform and an opacity.
//
//   arrive  ~1 s    from the quiet spot above the prompt (where the body's
//                   z z Z rise, worker/body.ts) up to the readable spot,
//                   growing from far to near: fast, so it reads as the kill's
//   read    ~5.5 s  gentle sway and bob, a slow creep upward; the sign
//                   swings (a kick as it stops, then a lazy swing).
//                   Kills that join the sign lengthen this (`extendRead`).
//   glide   ~2 s    a short glide away and up, shrinking; from here on the
//                   balloon is in the sky layer, behind the game text
//   drift   8–60 s  much slower, by one of three paths, shrinking and
//                   fading at the end:
//                   - top:     rises out over the top fairly soon
//                   - right:   wanders and leaves over the right edge
//                   - meander: a long slow meander that fades out in the sky
//
// The sky lane (owner, 2026-11-17): the balloons keep to the part of the
// screen where the sky shows and the game text is not. The sky comes in
// from the left band (worker/band.ts: none up to 0.4 W, all from 0.7 W);
// MUME's lines are 80 columns, so the text's right edge is the game pane's
// left plus 80-odd cells. On a wide desktop the lane is the strip right of
// both; there the readable spot and every later path stay in it. Where the
// lane is too narrow for a balloon (a narrow window, a phone), the flight
// uses the whole width, and its distant part is behind the text (the sky
// layer), so it never covers text one has to read for long.
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
  start: Pt;
  read0: Pt;
  /** The glide's end, relative to where the read phase ends. */
  glide: Pt;
  /** The drift's end. */
  end: Pt;
  ta: number;
  /** Readable time; `extendRead` lengthens it. */
  read: number;
  tg: number;
  td: number;
  /** Scales at the glide's end and the drift's end. */
  sGlide: number;
  sEnd: number;
  /** When the drift starts fading (share of it). */
  fadeFrom: number;
  sway: { ax: number; fx: number; ay: number; fy: number; p1: number; p2: number };
  wander: { amp: number; k: number; p: number; ampY: number };
}

/** Readable time without joined kills, and its cap. */
export const READ_S = 5.5;
export const READ_MAX = 9;
/** What a joined kill adds to the readable time. */
export const READ_EXTEND = 1.2;
/** Upward creep while readable, px/s. */
const CREEP = 2.5;

export interface PlanOpts {
  reduced?: boolean;
  /** The centre x of a balloon still near (readable or gliding): this one's readable spot keeps clear of it. */
  avoidX?: number | null;
}

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** A flight for a balloon `bw` × `bh` px on layout `g` (see the file header). */
export function planFlight(seed: number, g: LaneGeom, bw: number, bh: number, opts: PlanOpts = {}): FlightPlan {
  const r = rng(seed);
  const between = (a: number, b: number): number => a + (b - a) * r();
  const scale = clamp(Math.min(g.W / 640, g.H / 720), 0.62, 1);
  const lane = skyLane(g, bw * scale);
  const half = (bw * scale) / 2;
  const lx0 = lane.x0 + half, lx1 = Math.max(lane.x0 + half, lane.x1 - half);
  const floor = Math.max(bh * scale * 0.4, g.protect.fadeTop);

  // The readable spot: the lane's left part on a wide screen (the empty
  // strip right of the text, before the docked panes), else right of the middle.
  let rx = lane.sky ? lx0 + r() * Math.min(bw * scale * 0.9, lx1 - lx0) : clamp(g.W * 0.62 + (r() - 0.5) * bw * 0.5, lx0, lx1);
  const avoid = opts.avoidX;
  if (avoid != null && Math.abs(rx - avoid) < bw * scale * 0.85) {
    const right = avoid + bw * scale * 0.95, left = avoid - bw * scale * 0.95;
    rx = right <= lx1 ? right : left >= lx0 ? left : rx;
  }
  const ry = clamp(g.H * 0.14 + r() * g.H * 0.12, EDGE, Math.max(EDGE, floor - bh * scale - 12));
  const read0 = { x: rx, y: ry };
  // The quiet spot: above the prompt, toward the game pane's right (the z z Z),
  // in the lane where there is one; it starts small and low and comes near.
  const sx = lane.sky ? clamp(Math.max(g.out.x + g.out.w * 0.78, rx - bw * 0.6), lx0, lx1) : clamp(g.out.x + g.out.w * 0.72, lx0, lx1);
  const start = { x: lerp(sx, rx, 0.25), y: Math.max(ry + 40, floor - bh * scale * 0.5) };

  const pick = r();
  const path: LeavePath = pick < 0.34 ? 'top' : pick < 0.7 ? 'right' : 'meander';
  const laneW = lane.x1 - lane.x0;
  // A glide away: up, and toward the lane's open side.
  const side = lane.sky ? 1 : rx < g.W / 2 ? 1 : r() < 0.5 ? -1 : 1;
  const glide = { x: side * between(30, 110) * scale, y: -between(60, 130) * scale };
  const sGlide = scale * between(0.6, 0.7);
  let end: Pt, td: number, sEnd: number, fadeFrom: number;
  const gx = rx + glide.x;
  if (path === 'top') {
    sEnd = scale * between(0.34, 0.44);
    end = { x: clamp(gx + (r() - 0.5) * Math.min(laneW * 0.5, 300), lx0, lx1), y: -bh * sEnd - 24 };
    td = between(9, 16);
    fadeFrom = 0.8;
  } else if (path === 'right') {
    sEnd = scale * between(0.28, 0.38);
    end = { x: g.W + (bw * sEnd) / 2 + 24, y: Math.max(EDGE, ry + glide.y - between(30, g.H * 0.22)) };
    td = between(22, 40);
    fadeFrom = 0.85;
  } else {
    sEnd = scale * between(0.17, 0.25);
    end = { x: clamp(gx + (r() - 0.5) * laneW * 0.6, lx0, lx1), y: Math.max(EDGE, ry + glide.y - between(50, g.H * 0.3)) };
    td = between(40, 60);
    fadeFrom = 0.6;
  }
  return {
    reduced: !!opts.reduced,
    bw,
    bh,
    lane,
    path,
    scale,
    start,
    read0,
    glide,
    end,
    ta: between(0.9, 1.1),
    read: READ_S + r() * 0.6,
    tg: between(1.6, 2.4),
    td,
    sGlide,
    sEnd,
    fadeFrom,
    sway: { ax: between(8, 15), fx: between(0.6, 0.95), ay: between(2.5, 4.5), fy: between(1.4, 2), p1: r() * 6.283, p2: r() * 6.283 },
    wander: { amp: Math.min(laneW * 0.25, 130) * (path === 'meander' ? 1 : 0.6), k: between(0.6, 1.6), p: r() * 6.283, ampY: between(10, 30) },
  };
}

/** A kill joined the sign at `t`: the readable time grows, capped. */
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
  /** Above the text (arrive, read) or in the sky layer behind it. */
  front: boolean;
}

const easeOut3 = (u: number): number => 1 - (1 - u) ** 3;
const easeInOut = (u: number): number => 0.5 - 0.5 * Math.cos(Math.PI * u);
/** A quadratic ramp into a constant pace (C1): the drift sets off from rest. */
function rampIn(u: number, a = 0.18): number {
  const v = 1 / (1 - a / 2);
  return u < a ? (v * u * u) / (2 * a) : v * (u - a / 2);
}

export function phaseAt(p: FlightPlan, t: number): Phase {
  if (t >= flightTotal(p)) return 'done';
  if (p.reduced) return 'read';
  if (t < p.ta) return 'arrive';
  if (t < p.ta + p.read) return 'read';
  if (t < p.ta + p.read + p.tg) return 'glide';
  return 'drift';
}

/** Where the read phase ends (the creep included). */
function readEnd(p: FlightPlan): Pt {
  return { x: p.read0.x, y: p.read0.y - CREEP * p.read };
}

/** The position and scale without sway, and the opacity. */
function base(p: FlightPlan, t: number): { x: number; y: number; s: number; o: number } {
  if (t < p.ta) {
    const u = t / p.ta, e = easeOut3(u);
    return { x: lerp(p.start.x, p.read0.x, e), y: lerp(p.start.y, p.read0.y, e), s: p.scale * lerp(0.5, 1, e), o: clamp(t / 0.3, 0, 1) };
  }
  if (t < p.ta + p.read) return { x: p.read0.x, y: p.read0.y - CREEP * (t - p.ta), s: p.scale, o: 1 };
  const re = readEnd(p);
  const g = { x: re.x + p.glide.x, y: re.y + p.glide.y };
  const tg0 = p.ta + p.read;
  if (t < tg0 + p.tg) {
    const e = easeInOut((t - tg0) / p.tg);
    return { x: lerp(re.x, g.x, e), y: lerp(re.y, g.y, e), s: lerp(p.scale, p.sGlide, e), o: 1 };
  }
  const u = clamp((t - tg0 - p.tg) / p.td, 0, 1), e = rampIn(u);
  const env = Math.sin(Math.PI * Math.min(1, e));
  const w = p.wander;
  let x = lerp(g.x, p.end.x, e) + w.amp * env * Math.sin(6.283 * w.k * e + w.p);
  const y = lerp(g.y, p.end.y, e) + w.ampY * env * Math.sin(6.283 * w.k * 0.7 * e + w.p * 1.7);
  const s = lerp(p.sGlide, p.sEnd, e);
  // In the sky lane the drift keeps to it (out over the right edge only on that path).
  if (p.lane.sky) {
    const half = (p.bw * s) / 2;
    x = Math.max(x, p.lane.x0 + half);
    if (p.path !== 'right') x = Math.min(x, p.lane.x1 - half);
  }
  const fade = u < p.fadeFrom ? 1 : 1 - (u - p.fadeFrom) / (1 - p.fadeFrom);
  return { x, y, s, o: (1 - 0.25 * e) * fade };
}

/** The sway's offset at t (all phases; it grows in as the balloon arrives). */
function sway(p: FlightPlan, t: number, s: number): Pt {
  const w = p.sway, k = clamp((t - p.ta * 0.5) / (p.ta * 0.5 + 1), 0, 1) * (s / p.scale);
  return {
    x: k * (w.ax * Math.sin(t * w.fx + w.p1) + w.ax * 0.45 * Math.sin(t * w.fx * 2.3 + w.p2)),
    y: k * w.ay * Math.sin(t * w.fy + w.p2),
  };
}

function posAt(p: FlightPlan, t: number): Pt {
  const b = base(p, t), sw = sway(p, t, b.s);
  return { x: b.x + sw.x, y: b.y + sw.y };
}

/** The balloon at `t` seconds after its kill. */
export function flightAt(p: FlightPlan, t: number): FlightFrame {
  const phase = phaseAt(p, t);
  if (p.reduced) {
    const tot = flightTotal(p);
    const o = clamp(Math.min(t / REDUCED_IN, (tot - t) / REDUCED_OUT), 0, 1);
    return { phase, x: p.read0.x, y: p.read0.y, scale: p.scale, opacity: o, tilt: 0, swing: 0, front: true };
  }
  if (phase === 'done') return { phase, x: p.end.x, y: p.end.y, scale: p.sEnd, opacity: 0, tilt: 0, swing: 0, front: false };
  const b = base(p, t), sw = sway(p, t, b.s);
  const h = 0.05;
  const vx = (posAt(p, t + h).x - posAt(p, t - h).x) / (2 * h);
  const vxBefore = (posAt(p, t - 0.2).x - posAt(p, t - 0.3).x) / 0.1;
  const tilt = clamp(vx * 0.08, -7, 7) + Math.sin(t * 1.3 + p.sway.p1) * 1.2;
  // The sign lags the rig: it swings against a change of pace, gets a kick
  // when the arrival stops, and swings lazily while readable.
  const dt = t - p.ta;
  const kick = dt > 0 ? 8 * Math.exp(-1.6 * dt) * Math.sin(5.2 * dt) : 0;
  const swing = clamp(-(vx - vxBefore) * 0.05 + kick + 2.5 * Math.sin(t * 2.1 + p.sway.p2), -16, 16) - tilt * 0.6;
  return { phase, x: b.x + sw.x, y: b.y + sw.y, scale: b.s, opacity: b.o, tilt, swing, front: phase === 'arrive' || phase === 'read' };
}
