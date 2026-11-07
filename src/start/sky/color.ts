// Small colour and easing helpers for the start page sky (ADR 0124). Pure,
// no DOM: `look.ts` (which the first paint may inline) uses them too.

/** An sRGB colour, 0..255 per channel (not rounded). */
export type Rgb = readonly [number, number, number];

export const clamp = (v: number, a = 0, b = 1): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const mod = (a: number, n: number): number => ((a % n) + n) % n;
/** Smoothstep of `x` from `a` to `b` (either order). */
export function sstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

export const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const mix = (a: Rgb, b: Rgb, t: number): Rgb => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const mul = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];

/** `rgba(…)` for a canvas or CSS. */
export const rgba = (c: Rgb, a = 1): string => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${+a.toFixed(4)})`;
/** `#rrggbb`. */
export function toHex(c: Rgb): string {
  let s = '#';
  for (const v of c) s += Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  return s;
}

/** Source-over: `top` with alpha `a` over `under`. */
export const over = (under: Rgb, top: Rgb, a: number): Rgb => mix(under, top, clamp(a));
/** Additive ("lighter"): `top` × `a` added to `under`, clamped. */
export const add = (under: Rgb, top: Rgb, a: number): Rgb => [
  Math.min(255, under[0] + top[0] * a),
  Math.min(255, under[1] + top[1] * a),
  Math.min(255, under[2] + top[2] * a),
];

/**
 * Rec. 709 luma of the gamma-encoded colour, 0..1: what a canvas pixel
 * read gives (the mockup's quote picked its ink with this measure).
 */
export const luma = (c: Rgb): number => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

/** Piecewise-linear colour ramp over sorted stops `[x, colour]`. */
export function ramp(stops: readonly (readonly [number, Rgb])[], x: number): Rgb {
  const first = stops[0]!;
  if (x <= first[0]) return first[1];
  for (let i = 1; i < stops.length; i++) {
    const [x1, c1] = stops[i]!;
    if (x <= x1) {
      const [x0, c0] = stops[i - 1]!;
      return mix(c0, c1, (x - x0) / (x1 - x0));
    }
  }
  return stops[stops.length - 1]![1];
}

/** A colour stop list sampled by a canvas gradient: alpha-premultiplied linear blend between stops. */
export interface Stop {
  at: number;
  c: Rgb;
  a: number;
}

/**
 * The colour and alpha a canvas gradient with `stops` has at `t` (0..1,
 * clamped). Browsers interpolate in premultiplied space; for stops that
 * share a colour (as all ours do but one) that equals this.
 */
export function stopAt(stops: readonly Stop[], t: number): { c: Rgb; a: number } {
  const first = stops[0]!;
  if (t <= first.at) return first;
  for (let i = 1; i < stops.length; i++) {
    const s1 = stops[i]!;
    if (t <= s1.at) {
      const s0 = stops[i - 1]!;
      const k = s1.at > s0.at ? (t - s0.at) / (s1.at - s0.at) : 1;
      const a = lerp(s0.a, s1.a, k);
      // premultiplied interpolation
      const c: Rgb = a > 1e-6 ? mul(mix(mul(s0.c, s0.a), mul(s1.c, s1.a), k), 1 / a) : s1.c;
      return { c, a };
    }
  }
  return stops[stops.length - 1]!;
}

/** Deterministic hash of an integer (and a salt) to [0, 1). */
export function hash01(n: number, salt = 0): number {
  let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul((n / 4294967296) | 0, 0x85ebca77) ^ Math.imul(salt + 0x632be5ab, 0xc2b2ae3d)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** Smooth 1-D value noise in [0, 1] on integer lattice points (seeded by `salt`). */
export function vnoise(x: number, salt = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  return lerp(hash01(i, salt), hash01(i + 1, salt), f * f * (3 - 2 * f));
}

/** A seeded pseudo-random generator (mulberry32) in [0, 1). */
export function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
