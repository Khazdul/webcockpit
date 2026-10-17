// The module environment inside the weather worker (the prototype's `env`).

import type { Mix } from '../director';
import type { ThemeInfo } from '../palette';
import type { Categories, Rect, WeatherEvent, WeatherState } from '../protocol';

export type Ctx = OffscreenCanvasRenderingContext2D;
export type Cv = OffscreenCanvas;

export interface Pane extends Rect {
  id: string;
  border: number;
  label: string;
  floating: boolean;
  /** The top line's gap for the title, `[x, x + w]` (protocol `PaneGeom.gap`): no line there. */
  gap?: { x: number; w: number };
}

export interface Env {
  W: number;
  H: number;
  dpr: number;
  /** Behind text and panes. */
  back: Ctx;
  /** Above everything. */
  front: Ctx;
  panes: Pane[];
  out: Rect;
  protect: { solidTop: number; fadeTop: number; left: number };
  cell: { w: number; h: number; size: number; font: string };
  raw: WeatherState;
  settled: WeatherState;
  mix: Mix;
  cats: Categories;
  theme: ThemeInfo;
  /** Cross-module signals: weather writes the lightning flash (0..1) and the bolt's x. */
  shared: { flash: number; boltX: number };
  /** Moon crossing speed factor (1 = game pace; the prototype demo used 600 / 90). */
  moonSpeed: number;
  noise(x: number, y: number): number;
  fbm(x: number, y: number): number;
  now: number;
}

export interface Module {
  id: string;
  init(env: Env): void;
  resize(env: Env): void;
  /** Draws one frame; returns true while it has anything to show or animate. */
  frame(env: Env, dt: number, t: number): boolean;
  onEvent?(env: Env, name: WeatherEvent | 'position', data?: unknown): void;
  destroy?(env: Env): void;
  /**
   * Frames per second the module's current content needs, asked after each
   * of its frames: FPS_FAST while things fall, flash or shake, FPS_SLOW for
   * drifting skies, fog and floating letters, FPS_BURST for a lightning
   * strike, FPS_STILL for content that does not move at all (a settled day
   * sky). Default FPS_FAST. A module slower than the loop draws into a
   * cache that the engine copies onto the canvases in between.
   */
  fps?(env: Env): number;
  /**
   * Resolution of the module's cache relative to the canvases (soft
   * content: fog draws at half). Default 1; below 1 the module always draws
   * through its cache, and must not call setTransform on env.back / front.
   */
  scale?: number;
}

/** Frame rates (owner feedback 4, "Heat"): a decorative effect needs far less than the screen's rate. */
export const FPS_BURST = 60;
export const FPS_FAST = 30;
export const FPS_SLOW = 12;
/** Content that does not move (a settled day sky): the loop runs this slowly while nothing else asks for more and the mix is at rest. */
export const FPS_STILL = 3;

export function mkCanvas(w: number, h: number): Cv {
  return new OffscreenCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)));
}

export function ctx2d(c: Cv): Ctx {
  const g = c.getContext('2d');
  if (!g) throw new Error('weather: no 2d context');
  return g;
}

/**
 * A 2d context drawn by the CPU (`willReadFrequently`), for sprites built
 * from big stroked paths or blur filters: on a GPU canvas those run on the
 * browser's GPU thread for tens of ms and delay the page's frames (stage
 * 28 E). Use it from the first `getContext` of that canvas on.
 */
export function ctx2dCpu(c: Cv): Ctx {
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('weather: no 2d context');
  return g;
}

// Value noise (prototype harness): one fixed permutation.
const P = new Uint8Array(512);
{
  const p = [...Array(256).keys()];
  let s = 1234567;
  const r = (): number => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 255; i > 0; i--) {
    const j = (r() * (i + 1)) | 0;
    const t = p[i]!;
    p[i] = p[j]!;
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255]!;
}
const sm = (t: number): number => t * t * (3 - 2 * t);
const h2 = (a: number, b: number): number => P[(P[a & 255]! + b) & 255]! / 255;
export function noise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1);
  const u = sm(xf), v = sm(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x: number, y: number): number => noise(x, y) * 0.65 + noise(x * 2.03 + 17, y * 2.03 + 5) * 0.35;

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const sst = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const ease = (cur: number, tgt: number, dt: number, tau: number): number => cur + (tgt - cur) * (1 - Math.exp(-dt / tau));
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
export const TAU = Math.PI * 2;
