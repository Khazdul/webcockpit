// Sky module (port of the v4 prototype, notes/research/weather-world/modules/sky.js):
// everything above the weather, on the back layer.
//  - a muted sky gradient that fades out at ~43 % of the height with a soft
//    glow on one side: the sun by day (owner feedback 1: a plain light sky in
//    which you sense the sun, no clouds unless the weather says so), the moon
//    at night; starry night and darkness sky from env.mix. Outdoors only,
//    except the darkness sky, which shows in any dark room (light 'o').
//    Cached at full resolution and redrawn only when its colours move.
//  - a perspective cloud deck seen from below in the top ~35 % (weather `~`
//    and wetter): big near clouds overhead, small ones toward the horizon,
//    drifting slowly; lit by lightning
//  - stars in the upper sky, and shooting stars that cross the whole screen
//  - a big moon with its real phase that rises, drifts across and sets
//  - sunrise / sunset moments with rays and pane shadow wedges
//  - entering darkness (light 'o' settled) or Event.Darkness start / grow: a
//    red ominous bleed from the top and the corners; leaving it or
//    shrink / end: a brief lightening
// Nothing here follows the text lines (owner feedback 9) or the panes'
// places (feedback 5, 6): stars, moon path and clouds are in coordinates
// relative to the canvas and rebuilt only when its size changes.
// Categories: `sky` gates everything but the darkness sky and the
// darkness bleeds, which `darkness` gates.

import { adapt, adaptCss, type Rgb, type ThemeInfo } from '../palette';
import type { WeatherEvent } from '../protocol';
import { type Ctx, type Cv, type Env, FPS_FAST, FPS_SLOW, FPS_STILL, type Module, TAU, clamp, ctx2d, ease, lerp, mkCanvas, sst } from './env';

/** Real-game moon crossing time, s (one game hour is one real minute; slowed a little, owner feedback 5). */
const MOON_CROSS_S = 800;
const MOON_HOLD = 0.86;
const MOON_START = 0.55;

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface CloudPal {
  lit: Rgb;
  sh: Rgb;
  op: number;
}
const PAL: CloudPal[] = [
  { lit: [214, 216, 218], sh: [118, 122, 130], op: 0.78 }, // 0 day
  { lit: [128, 131, 136], sh: [58, 61, 67], op: 0.86 }, // 1 overcast
  { lit: [250, 196, 136], sh: [112, 78, 86], op: 0.82 }, // 2 gold
  { lit: [236, 112, 92], sh: [74, 34, 56], op: 0.84 }, // 3 crimson
  { lit: [110, 108, 150], sh: [34, 34, 60], op: 0.8 }, // 4 dusk
  { lit: [104, 113, 132], sh: [18, 21, 30], op: 0.86 }, // 5 moon
  { lit: [34, 37, 44], sh: [10, 11, 14], op: 0.84 }, // 6 dark
  { lit: [70, 34, 34], sh: [16, 7, 9], op: 0.88 }, // 7 evil
];
const NP = PAL.length;

interface SkyCol {
  top: Rgb;
  hor: Rgb;
  a: number;
}
const SKY_DARK: Record<'day' | 'grey' | 'moon' | 'night' | 'evil', SkyCol> = {
  day: { top: [128, 170, 214], hor: [150, 176, 200], a: 0.44 },
  grey: { top: [62, 66, 73], hor: [96, 99, 104], a: 0.56 },
  moon: { top: [16, 24, 44], hor: [48, 58, 80], a: 0.66 },
  night: { top: [4, 6, 16], hor: [12, 15, 28], a: 0.75 },
  evil: { top: [72, 8, 14], hor: [92, 16, 18], a: 0.72 },
};
/** The sky colours for a background: as designed on dark; lightness-inverted, fainter on light. */
function skyTable(th: ThemeInfo): typeof SKY_DARK {
  if (!th.light) return SKY_DARK;
  const out = {} as Record<keyof typeof SKY_DARK, SkyCol>;
  for (const k of Object.keys(SKY_DARK) as (keyof typeof SKY_DARK)[]) {
    const c = SKY_DARK[k];
    out[k] = { top: adapt(c.top, th, 0.3, 0.88), hor: adapt(c.hor, th, 0.3, 0.9), a: c.a * 0.55 };
  }
  // a pale blue day sky on paper (inverted it would be a dark one)
  out.day = { top: [150, 188, 230], hor: [196, 214, 232], a: 0.34 };
  // the darkness sky stays a dark red on paper
  out.evil = { top: [90, 20, 26], hor: [150, 60, 60], a: 0.32 };
  return out;
}
/** The glow on the sky's light side: the sun's (warm) by day, a cool lift toward the moon or the horizon colour at night. */
const SUN_GLOW_DARK: Rgb = [255, 226, 172];
const SUN_GLOW_LIGHT: Rgb = [255, 210, 130];
/** Where the sun sits, as a fraction of the width (just above the top edge). */
const SUN_U = 0.8;
/** The text horizon as a fraction of the height: the moon sets behind it, the star field ends above it. */
const HORIZON = 0.3;
/** The star field's depth, fraction of the height. */
const STARS_H = 0.45;
const DS = 4;
/** The cloud deck's opacity: the text in front of it stays readable without per-line protection. */
const DECK_A = 0.62;
const BF = 56;

function glowSprite(r: number, rgb: string, a0: number): Cv {
  const c = mkCanvas(r * 2, r * 2), g = ctx2d(c);
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, `rgba(${rgb},${a0})`);
  gr.addColorStop(0.25, `rgba(${rgb},${a0 * 0.45})`);
  gr.addColorStop(0.6, `rgba(${rgb},${a0 * 0.12})`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, r * 2, r * 2);
  return c;
}
function starSprite(th: ThemeInfo): Cv {
  const C = (r: number, g: number, b: number, a: number): string => adaptCss(r, g, b, a, th);
  const c = mkCanvas(24, 24), g = ctx2d(c);
  const gr = g.createRadialGradient(12, 12, 0, 12, 12, 7);
  gr.addColorStop(0, C(235, 242, 255, 1));
  gr.addColorStop(0.3, C(200, 215, 255, 0.35));
  gr.addColorStop(1, C(200, 215, 255, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, 24, 24);
  const h = g.createLinearGradient(0, 0, 24, 0);
  h.addColorStop(0, C(210, 225, 255, 0));
  h.addColorStop(0.5, C(225, 235, 255, 0.7));
  h.addColorStop(1, C(210, 225, 255, 0));
  g.fillStyle = h;
  g.fillRect(0, 11.5, 24, 1);
  const v = g.createLinearGradient(0, 0, 0, 24);
  v.addColorStop(0, C(210, 225, 255, 0));
  v.addColorStop(0.5, C(225, 235, 255, 0.7));
  v.addColorStop(1, C(210, 225, 255, 0));
  g.fillStyle = v;
  g.fillRect(11.5, 0, 1, 24);
  return c;
}
function edgeGlint(): Cv {
  const c = mkCanvas(256, 12), g = ctx2d(c);
  const h = g.createLinearGradient(0, 0, 256, 0);
  h.addColorStop(0, 'rgba(255,255,255,0)');
  h.addColorStop(0.5, 'rgba(255,255,255,1)');
  h.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = h;
  g.globalAlpha = 0.22;
  g.fillRect(0, 2, 256, 8);
  g.globalAlpha = 0.5;
  g.fillRect(0, 4, 256, 4);
  g.globalAlpha = 1;
  g.fillRect(0, 5.5, 256, 1.2);
  return c;
}

// The moon: surface (albedo + normals) is computed once; the phase is a cheap relight.
const CRATERS = [-0.18, 0.62, 0.09, 0.42, -0.35, 0.07, -0.55, -0.2, 0.06, 0.12, 0.18, 0.05, 0.6, 0.35, 0.08, -0.3, -0.62, 0.05, 0.25, 0.75, 0.05];
class MoonSurface {
  readonly S = 2;
  readonly w: number;
  readonly alb: Float32Array;
  readonly nx: Float32Array;
  readonly nz: Float32Array;
  readonly cov: Float32Array;
  readonly cv: Cv;
  private readonly g: Ctx;
  private readonly img: ImageData;
  phase = -1;
  constructor(
    readonly R: number,
    noise: (x: number, y: number) => number,
    private readonly light: boolean,
  ) {
    const S = this.S, w = Math.ceil(R * 2 * S + 4), cx = w / 2, r = R * S;
    const n = w * w;
    const alb = new Float32Array(n), nx = new Float32Array(n), nz = new Float32Array(n), cov = new Float32Array(n);
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cx) / r, q = dx * dx + dy * dy;
        if (q > 1.02) continue;
        const i = y * w + x, z = Math.sqrt(Math.max(0, 1 - q));
        const rx = dx * 0.8 - dy * 0.6, ry = dx * 0.6 + dy * 0.8;
        const wx = rx + (noise(rx * 3 + 7, ry * 3 + 2) - 0.5) * 0.35, wy = ry + (noise(rx * 3 + 13, ry * 3 + 5) - 0.5) * 0.35;
        const m = noise(wx * 1.9 + 4, wy * 1.9 + 9) * 0.55 + noise(wx * 4.1 + 1, wy * 4.1 + 3) * 0.3 + noise(wx * 8.3 + 5, wy * 8.3 + 1) * 0.15;
        const mar = sst(0.46, 0.7, m) * 0.24;
        let cr = 0;
        for (let k = 0; k < CRATERS.length; k += 3) {
          const ex = dx - CRATERS[k]!, ey = dy - CRATERS[k + 1]!, cd = Math.sqrt(ex * ex + ey * ey) / CRATERS[k + 2]!;
          if (cd < 1.25) cr += cd < 0.85 ? 0.07 * (1 - cd * 0.5) : -0.1 * sst(1.25, 1.0, cd) * sst(0.85, 0.95, cd);
        }
        const fine = (noise(rx * 22 + 3, ry * 22 + 11) - 0.5) * 0.07;
        alb[i] = clamp(1 - mar - cr + fine, 0, 1);
        nx[i] = dx;
        nz[i] = z;
        cov[i] = clamp((1.02 - q) * 40, 0, 1);
      }
    }
    this.w = w;
    this.alb = alb;
    this.nx = nx;
    this.nz = nz;
    this.cov = cov;
    this.cv = mkCanvas(w, w);
    this.g = ctx2d(this.cv);
    this.img = this.g.createImageData(w, w);
  }
  /** f = illuminated fraction 0..1 (lit side on the right). */
  relight(f: number): void {
    if (Math.abs(f - this.phase) < 0.002) return;
    this.phase = f;
    const cosA = 1 - 2 * f, sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const sx = sinA, sz = -cosA;
    const o = this.img.data, n = this.w * this.w, { alb, nx, nz, cov } = this;
    for (let i = 0; i < n; i++) {
      const c = cov[i]!, j = i * 4;
      if (c <= 0) {
        o[j + 3] = 0;
        continue;
      }
      const d = nx[i]! * sx + nz[i]! * sz;
      const lit = sst(-0.07, 0.11, d);
      const limb = 0.62 + 0.38 * Math.sqrt(nz[i]!);
      const v = alb[i]! * (0.055 + 0.945 * lit * limb * (0.72 + 0.28 * Math.sqrt(Math.max(0, d))));
      if (this.light) {
        // on paper: a slate disc, the lit side darkest, the dark side faint
        const u = 1 - v;
        o[j] = 70 + 100 * u;
        o[j + 1] = 80 + 100 * u;
        o[j + 2] = 104 + 96 * u;
        o[j + 3] = 255 * c * (0.2 + 0.8 * lit);
      } else {
        o[j] = 224 * v + 9;
        o[j + 1] = 229 * v + 11;
        o[j + 2] = 238 * v + 17;
        o[j + 3] = 255 * c;
      }
    }
    this.g.putImageData(this.img, 0, 0);
  }
}

// Sunrise / sunset moment colours.
type Key = [number, number][];
type KeyC = [number, Rgb][];
const RISE_K: Key = [[0, 6], [0.18, 4], [0.34, 3], [0.55, 2], [0.85, 0], [1, 0]];
const SET_K: Key = [[0, 0], [0.16, 2], [0.42, 3], [0.68, 4], [0.92, 6], [1, 6]];
const RISE_C: KeyC = [[0, [90, 60, 150]], [0.2, [230, 110, 140]], [0.4, [255, 170, 80]], [0.7, [255, 222, 160]], [1, [255, 244, 220]]];
const SET_C: KeyC = [[0, [255, 196, 96]], [0.2, [255, 150, 60]], [0.45, [232, 56, 52]], [0.7, [150, 48, 110]], [0.88, [50, 64, 150]], [1, [24, 32, 90]]];
function keyPal(K: Key, p: number, out: Float32Array, m: number): void {
  for (let i = 0; i < K.length - 1; i++) {
    if (p <= K[i + 1]![0]) {
      const k = sst(0, 1, (p - K[i]![0]) / (K[i + 1]![0] - K[i]![0]));
      out[K[i]![1]]! += (1 - k) * m;
      out[K[i + 1]![1]]! += k * m;
      return;
    }
  }
  out[K[K.length - 1]![1]]! += m;
}
function keyCol(K: KeyC, p: number, out: Float32Array): void {
  for (let i = 0; i < K.length - 1; i++) {
    if (p <= K[i + 1]![0]) {
      const k = (p - K[i]![0]) / (K[i + 1]![0] - K[i]![0]);
      for (let c = 0; c < 3; c++) out[c] = lerp(K[i]![1][c]!, K[i + 1]![1][c]!, k);
      return;
    }
  }
  for (let c = 0; c < 3; c++) out[c] = K[K.length - 1]![1][c]!;
}

// convex hull of 8 points (monotone chain), filled — pane shadow wedges
const HI = new Int32Array(8), HU = new Int32Array(17), CX = new Float32Array(4), CY = new Float32Array(4);
function hullFill(g: Ctx, pts: Float32Array): void {
  for (let i = 0; i < 8; i++) HI[i] = i;
  for (let i = 1; i < 8; i++) {
    const v = HI[i]!;
    let j = i - 1;
    while (j >= 0 && (pts[HI[j]! * 2]! > pts[v * 2]! || (pts[HI[j]! * 2] === pts[v * 2] && pts[HI[j]! * 2 + 1]! > pts[v * 2 + 1]!))) {
      HI[j + 1] = HI[j]!;
      j--;
    }
    HI[j + 1] = v;
  }
  const cr = (o: number, a: number, b: number): number =>
    (pts[a * 2]! - pts[o * 2]!) * (pts[b * 2 + 1]! - pts[o * 2 + 1]!) - (pts[a * 2 + 1]! - pts[o * 2 + 1]!) * (pts[b * 2]! - pts[o * 2]!);
  let k = 0;
  for (let i = 0; i < 8; i++) {
    while (k >= 2 && cr(HU[k - 2]!, HU[k - 1]!, HI[i]!) <= 0) k--;
    HU[k++] = HI[i]!;
  }
  for (let i = 6, t = k + 1; i >= 0; i--) {
    while (k >= t && cr(HU[k - 2]!, HU[k - 1]!, HI[i]!) <= 0) k--;
    HU[k++] = HI[i]!;
  }
  g.beginPath();
  g.moveTo(pts[HU[0]! * 2]!, pts[HU[0]! * 2 + 1]!);
  for (let i = 1; i < k - 1; i++) g.lineTo(pts[HU[i]! * 2]!, pts[HU[i]! * 2 + 1]!);
  g.closePath();
  g.fill();
}

interface Moment {
  kind: 'rise' | 'set';
  t0: number;
  dur: number;
}

class Sky {
  T = 0;
  W = 0;
  H = 0;
  dpr = 0;
  readonly noise: (x: number, y: number) => number;
  readonly th: ThemeInfo;
  readonly SKY: typeof SKY_DARK;
  palW = new Float32Array(NP);
  palT = new Float32Array(NP);
  col = new Float32Array(3);
  cover = 0;
  wet = 0;
  fogK = 1;
  first = true;
  moment: Moment | null = null;
  dark: { t0: number; k: number } | null = null;
  darkG = 0;
  lift: { t0: number; k: number; dur: number } | null = null;
  /** The settled darkness of the room last frame (null before the first frame: no bleed for where we start). */
  darkWas: boolean | null = null;
  shoot = { on: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, next: 5 };
  starSpr: Cv;
  glint: Cv;
  halo: Cv;
  u: number;
  moonSet: { u0: number; t0: number; dur: number } | null = null;
  moonPres: number;
  moonVis = 0;
  mVisNow = 0;
  mx = 0;
  my = 0;
  skyNow = new Float32Array(10);
  skyLast = new Float32Array(10).fill(-1);
  skyTick = 0;
  sideU = SUN_U;
  /** The glow colour on the light side (its strength is skyNow[8]). */
  glowC: Rgb = [0, 0, 0];
  /** Darkness sky pulse, applied when the cached sky is drawn. */
  pulse = 1;
  /** Something moved in the last frame (stars, moon, clouds, a sky redraw); `still` counts frames without. */
  moving = false;
  still = 0;
  ox = 0;
  oz = 0;
  pts = new Float32Array(16);
  S = new Float32Array(2);
  hor0 = 0;
  hor1 = 0;
  hor2 = 0;
  starVis = 0;
  // set by resize
  built = false;
  hz = 0;
  skyH = 0;
  starH = 0;
  starL: Cv[] = [];
  big = new Float32Array(0);
  nBig = 0;
  moon: MoonSurface | null = null;
  mpath = { xR: 0, xL: 0, yR: 0, yL: 0, yTop: 0 };
  gTopRed: CanvasGradient | null = null;
  gRightRed: CanvasGradient | null = null;
  gLeftRed: CanvasGradient | null = null;
  gLift: CanvasGradient | null = null;
  hY = 0;
  dw = 1;
  dh = 1;
  dP!: Cv;
  dN!: Cv;
  dC!: Cv;
  dF!: Cv;
  gP!: Ctx;
  gN!: Ctx;
  gC!: Ctx;
  gF!: Ctx;
  bimg!: ImageData;
  rZ = new Float32Array(0);
  rA = new Float32Array(0);
  rH = new Float32Array(0);
  cX = new Float32Array(0);
  rowD = new Float32Array(0);
  bRow = 0;
  bk = { th: 0.9, a: 0, lit: [0, 0, 0], sh: [0, 0, 0], hz: [0, 0, 0], ox: 0, oz: 0 };
  deckEmpty = true;
  skyCv!: Cv;
  skyCg!: Ctx;

  constructor(env: Env, prev: Sky | null) {
    this.noise = env.noise;
    this.th = env.theme;
    this.SKY = skyTable(env.theme);
    this.starSpr = starSprite(env.theme);
    this.glint = edgeGlint();
    this.halo = glowSprite(130, '170,190,235', 0.22);
    this.u = env.raw.moonUp ? MOON_START : -1;
    this.moonPres = env.raw.moonUp ? 1 : 0;
    if (prev) {
      // a theme change: the sky keeps going where it was (no moon or cloud jump)
      this.T = prev.T;
      this.u = prev.u;
      this.moonPres = prev.moonPres;
      this.moonSet = prev.moonSet;
      this.moonVis = prev.moonVis;
      this.ox = prev.ox;
      this.oz = prev.oz;
      this.sideU = prev.sideU;
      this.darkWas = prev.darkWas;
    }
  }

  /**
   * Builds what depends on the canvas size. Pane moves and other layout
   * changes do not come here with the same size: the sky does not depend on
   * them (owner feedback 6). Everything is placed relative to W × H, so a
   * real size change re-makes the same picture at the new size.
   */
  resize(env: Env): void {
    const W = env.W, H = env.H, d = env.dpr;
    if (this.built && W === this.W && H === this.H && d === this.dpr) return;
    this.built = true;
    this.W = W;
    this.H = H;
    this.dpr = d;
    this.hz = H * HORIZON;
    this.skyH = H * 0.43;
    // Stars: the upper sky, denser toward the top; fixed relative places.
    const sh = (this.starH = Math.ceil(H * STARS_H));
    const n = Math.min(360, Math.round((W * sh) / 2400));
    const R = rng(777);
    this.starL = [mkCanvas(W * d, sh * d), mkCanvas(W * d, sh * d)];
    const starCol = adapt([223, 231, 255], this.th);
    const gl = this.starL.map((c) => {
      const q = ctx2d(c);
      q.setTransform(d, 0, 0, d, 0, 0);
      q.fillStyle = `rgb(${starCol[0]},${starCol[1]},${starCol[2]})`;
      return q;
    });
    const big: number[] = [];
    for (let i = 0; i < n; i++) {
      const k = R();
      const x = Math.round(W * (0.03 + 0.96 * R())) + 0.5, y = Math.round(6 + (sh - 10) * Math.pow(R(), 1.35)) + 0.5;
      const br = (0.4 + Math.pow(R(), 1.8) * 0.6) * (1 - 0.5 * sst(0.5, 1, y / sh)), ph2 = R() * TAU, fr = 0.6 + R() * 2.6;
      if (k > 0.965) {
        big.push(x, y, br, ph2, fr);
        continue;
      }
      const cls = k > 0.7 ? 1 : 0, q = gl[i & 1]!, sz = cls ? 2 : 1.3;
      q.globalAlpha = Math.min(1, br * (cls ? 1.1 : 0.85));
      q.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    }
    this.big = new Float32Array(big);
    this.nBig = big.length / 5;
    const MR = Math.round(clamp(H * 0.05, 30, 56));
    if (!this.moon || this.moon.R !== MR) this.moon = new MoonSurface(MR, env.noise, this.th.light);
    this.moon.phase = -1;
    // The moon rises low on the right, crosses high and sets behind the text horizon on the left.
    this.mpath = { xR: W * 0.86, xL: W * 0.1, yR: H * 0.6, yL: this.hz + MR * 0.6, yTop: Math.max(MR + 14, H * 0.085) };
    const bk = env.back;
    this.gTopRed = bk.createLinearGradient(0, 0, 0, H * 0.45);
    this.gTopRed.addColorStop(0, 'rgba(120,10,18,.85)');
    this.gTopRed.addColorStop(0.45, 'rgba(70,6,12,.4)');
    this.gTopRed.addColorStop(1, 'rgba(40,4,8,0)');
    this.gRightRed = bk.createRadialGradient(W, 0, 0, W, 0, H * 0.95);
    this.gRightRed.addColorStop(0, 'rgba(130,10,18,.8)');
    this.gRightRed.addColorStop(0.45, 'rgba(80,6,12,.35)');
    this.gRightRed.addColorStop(1, 'rgba(40,4,8,0)');
    this.gLeftRed = bk.createRadialGradient(0, 0, 0, 0, 0, H * 0.6);
    this.gLeftRed.addColorStop(0, 'rgba(110,8,14,.7)');
    this.gLeftRed.addColorStop(1, 'rgba(40,4,8,0)');
    this.gLift = bk.createLinearGradient(0, 0, 0, H * 0.3);
    const L = (r: number, g: number, b: number, a: number): string => adaptCss(r, g, b, a, this.th);
    this.gLift.addColorStop(0, L(180, 190, 215, 0.5));
    this.gLift.addColorStop(0.5, L(140, 150, 180, 0.14));
    this.gLift.addColorStop(1, L(120, 130, 160, 0));
    this.skyCv = mkCanvas(W * d, Math.ceil(this.skyH) * d);
    this.skyCg = ctx2d(this.skyCv);
    this.skyCg.setTransform(d, 0, 0, d, 0, 0);
    this.skyLast[0] = -1;
    this.setupDeck(env);
    // The clouds at the new size at once (no empty sky while the deck rebuilds).
    if (!this.first) this.deckNow();
  }

  onEvent(env: Env, name: WeatherEvent | 'position'): void {
    if (name === 'sun.rise' || name === 'sun.set') {
      if (!env.cats.sky) return;
      this.moment = { kind: name === 'sun.rise' ? 'rise' : 'set', t0: this.T, dur: name === 'sun.rise' ? 9 : 10 };
    } else if (name === 'moon.rise') {
      // A moon already up (the almanac predicted the rise first) keeps its place: never a jump.
      this.moonSet = null;
      if (!(this.u >= 0 && this.moonPres > 0.02)) {
        this.u = 0;
        this.moonPres = 1;
      }
    } else if (name === 'moon.set') {
      if (this.u >= 0) this.moonSet = { u0: this.u, t0: this.T, dur: 7 + 16 * (1 - this.u) };
    } else if (name === 'darkness.start' || name === 'darkness.grow') {
      if (!env.cats.darkness) return;
      this.dark = { t0: this.T, k: name === 'darkness.start' ? 1 : 0.85 };
      this.lift = null;
    } else if (name === 'darkness.shrink' || name === 'darkness.end' || name === 'darkness.end-soon') {
      if (!env.cats.darkness) return;
      const k = name === 'darkness.end' ? 1 : name === 'darkness.shrink' ? 0.75 : 0.4;
      if (this.dark) {
        const t = this.T - this.dark.t0;
        if (t < 4.2) this.dark.t0 = this.T - 4.2;
      }
      this.lift = { t0: this.T, k, dur: 2.2 + k * 1.4 };
    }
  }

  frame(env: Env, dt: number): boolean {
    this.T += dt;
    const T = this.T, m = env.mix, skyOn = env.cats.sky;
    const out = m.outdoors;
    const oo = Math.max(out, 0.001);
    this.moving = false;
    // Entering or leaving darkness (settled light 'o'): the bleed and the lift, as Event.Darkness does.
    const darkNow = env.cats.darkness && env.settled.light === 'o';
    if (this.darkWas !== null && darkNow !== this.darkWas) {
      if (darkNow) {
        if (!this.dark) this.dark = { t0: T, k: 1 };
        this.lift = null;
      } else if (!this.lift) {
        if (this.dark && T - this.dark.t0 < 4.2) this.dark.t0 = T - 4.2;
        this.lift = { t0: T, k: 0.75, dur: 2.2 + 0.75 * 1.4 };
      }
    }
    this.darkWas = darkNow;
    let wSun = m.sun, wMoon = m.moon, wNight = m.dark, wEvil = m.evil;
    if (!skyOn) {
      // only the darkness sky remains (its own category)
      wSun = 0;
      wMoon = 0;
      wNight = 0;
    }
    const ws = wSun + wMoon + wNight + wEvil;
    if (ws > 0.001) {
      wSun /= ws;
      wMoon /= ws;
      wNight /= ws;
      wEvil /= ws;
    } else if (skyOn) wNight = 1;
    // The darkness sky shows indoors too (a dark room); the rest of the sky is outdoors only.
    const skyVis = skyOn ? Math.max(out, m.evil) : m.evil;
    const cover = clamp(m.clouds / oo, 0, 1);
    const wet = clamp((m.rain * 0.75 + m.heavy * 0.25 + m.snow * 0.55) / oo + cover * 0.1, 0, 1);
    if (Math.abs(cover - this.cover) > 0.12) this.first = true;
    this.cover = cover;
    this.wet = wet;
    this.fogK = 1 - m.fog * 0.55;

    const t = this.palT;
    t.fill(0);
    t[0]! += wSun * (1 - wet * 0.85);
    t[1]! += wSun * wet * 0.85;
    t[5]! += wMoon * (1 - wet * 0.5);
    t[6]! += wMoon * wet * 0.5 + wNight;
    t[7]! += wEvil;
    let mP = -1, mI = 0;
    const M = this.moment;
    if (M) {
      mP = (T - M.t0) / M.dur;
      if (mP >= 1) {
        this.moment = null;
        mP = -1;
      } else {
        const e1 = sst(0, 0.06, mP) * (1 - sst(0.94, 1, mP)) * out;
        for (let i = 0; i < NP; i++) t[i]! *= 1 - e1;
        keyPal(M.kind === 'rise' ? RISE_K : SET_K, mP, t, e1);
        mI = M.kind === 'rise' ? sst(0.04, 0.3, mP) * (1 - sst(0.62, 1, mP)) : sst(0, 0.14, mP) * (1 - sst(0.6, 1, mP));
        keyCol(M.kind === 'rise' ? RISE_C : SET_C, mP, this.col);
      }
    }
    if (this.first) this.palW.set(t);
    const pTau = M ? 0.35 : 0.6;
    for (let i = 0; i < NP; i++) this.palW[i] = ease(this.palW[i]!, t[i]!, dt, pTau);

    const b = env.back;
    this.skyColour(env, wSun, wMoon, wNight, wEvil, mI, skyVis);
    const rays = mI > 0.002 && out > 0.02;
    if (rays) this.drawRaysBack(env, mP, mI * out);
    if (skyOn) {
      this.drawStars(b, env, wMoon, wNight, out);
      this.drawMoon(b, env, dt, wMoon, wNight, out);
      this.drawDeck(b, env, dt, out);
    } else {
      this.starVis = 0;
      this.mVisNow = 0;
    }
    const dk = Math.max(out, m.evil);
    if (this.dark) this.drawDark(b, env, dk);
    if (this.lift) this.drawLift(b, env, dk);
    this.drawSky(b, env, dt, mI);
    if (skyOn) this.drawShoot(b, env, dt, out);
    if (rays) this.drawRaysFront(env, mP, mI * out);
    if (mI > 0.002 && out < 0.98) this.drawIndoorTint(env, mI * (1 - out));
    this.drawGlints(env.front, env);
    this.first = false;
    this.still = this.moving ? 0 : this.still + 1;
    return skyVis > 0.003 || !!this.moment || !!this.dark || !!this.lift || this.shoot.on || this.moonVis * this.moonPres > 0.01;
  }

  skyColour(env: Env, wSun: number, wMoon: number, wNight: number, wEvil: number, mI: number, out: number): void {
    const s = this.skyNow, wet = this.wet, SKY = this.SKY;
    let tr = 0, tg = 0, tb = 0, hr = 0, hg = 0, hb = 0, a = 0;
    const acc = (P: SkyCol, w: number): void => {
      if (w < 0.0005) return;
      tr += P.top[0] * w;
      tg += P.top[1] * w;
      tb += P.top[2] * w;
      hr += P.hor[0] * w;
      hg += P.hor[1] * w;
      hb += P.hor[2] * w;
      a += P.a * w;
    };
    acc(SKY.day, wSun * (1 - wet * 0.8));
    acc(SKY.grey, wSun * wet * 0.8);
    acc(SKY.moon, wMoon * (1 - wet * 0.45));
    acc(SKY.night, wNight + wMoon * wet * 0.45);
    acc(SKY.evil, wEvil);
    // the darkness sky breathes: applied when the cached sky is drawn, not by redrawing it
    this.pulse = wEvil > 0.01 ? 1 - 0.1 * wEvil * (0.5 + 0.5 * Math.sin(this.T * 0.7)) : 1;
    if (mI > 0.002) {
      const c = this.col, k = mI * 0.75;
      tr = lerp(tr, c[0]! * 0.7, k);
      tg = lerp(tg, c[1]! * 0.7, k);
      tb = lerp(tb, c[2]! * 0.7, k);
      hr = lerp(hr, c[0]!, k);
      hg = lerp(hg, c[1]!, k);
      hb = lerp(hb, c[2]!, k);
      a = lerp(a, this.th.light ? 0.35 : 0.62, k);
    }
    const fl = clamp(env.shared.flash || 0, 0, 1) * out;
    if (fl > 0.01 && !this.th.light) {
      const k = fl * 0.5;
      tr = lerp(tr, 180, k);
      tg = lerp(tg, 188, k);
      tb = lerp(tb, 212, k);
      hr = lerp(hr, 196, k);
      hg = lerp(hg, 204, k);
      hb = lerp(hb, 226, k);
      a = lerp(a, 0.75, k);
    }
    a *= out * this.fogK * (1 - 0.2 * this.cover);
    // The glow on the light side: the sun by day (none under a grey, wet sky
    // or in a sun moment, which has its own light), a cool lift toward the
    // moon or the horizon at night, hardly any in darkness.
    const sun = wSun * (1 - wet * 0.9) * (1 - clamp(mI * 2, 0, 1));
    const cool = wMoon * 0.16 + wNight * 0.07 + wEvil * 0.03;
    const vis = out * this.fogK * (1 - 0.5 * this.cover);
    const light = this.th.light;
    s[8] = (sun * (light ? 0.34 : 0.36) + cool * (1 - sun)) * vis * 100;
    const sc = light ? SUN_GLOW_LIGHT : SUN_GLOW_DARK, gc = this.glowC, ks = clamp(sun / Math.max(0.001, sun + cool), 0, 1);
    // night lift: lighter than the horizon on dark, the horizon colour itself on paper
    for (let c = 0; c < 3; c++) {
      const h = c === 0 ? hr : c === 1 ? hg : hb;
      const nc = light ? h : Math.min(255, h * (1.25 - c * 0.05) + 30 - c * 4);
      gc[c] = lerp(nc, sc[c]!, ks);
    }
    this.hor0 = hr;
    this.hor1 = hg;
    this.hor2 = hb;
    s[0] = tr;
    s[1] = tg;
    s[2] = tb;
    s[3] = hr;
    s[4] = hg;
    s[5] = hb;
    s[6] = a;
  }

  /**
   * The sky: a vertical gradient (top colour → horizon colour, fading out at
   * skyH) and a soft radial glow on the light side, drawn once into a cached
   * canvas at full resolution whenever the colours have moved enough, then
   * copied under everything already on the back layer. A settled sky is one
   * image copy per frame (Firefox draws these canvases on the CPU).
   */
  drawSky(b: Ctx, env: Env, dt: number, mI: number): void {
    const s = this.skyNow, tr = s[0]!, tg = s[1]!, tb = s[2]!, hr = s[3]!, hg = s[4]!, hb = s[5]!, a = s[6]!;
    if (a < 0.004) return;
    let su = SUN_U;
    if (this.mVisNow > 0.05) su = lerp(su, clamp(this.mx / env.W, 0, 1), clamp(this.mVisNow * 1.5, 0, 1));
    if (mI > 0.002) su = lerp(su, clamp(this.S[0]! / env.W, 0, 1), clamp(mI * 2, 0, 1));
    this.sideU = ease(this.sideU, su, dt, 0.5);
    s[7] = this.sideU * 100;
    s[9] = 0;
    const L = this.skyLast;
    let diff = 0;
    for (let i = 0; i < 10; i++) diff += Math.abs(s[i]! - L[i]!);
    this.skyTick++;
    if ((diff > 0.8 || Math.abs(a - L[6]!) > 0.002) && (this.skyTick >= 4 || diff > 40 || this.first)) {
      L.set(s);
      this.skyTick = 0;
      this.moving = true;
      const C = this.skyCg, W = env.W, sh = this.skyH;
      C.clearRect(0, 0, W, sh + 1);
      const g = C.createLinearGradient(0, 0, 0, sh);
      for (let i = 0; i <= 8; i++) {
        const v = i / 8, k = sst(0, 0.9, v), f = Math.pow(1 - sst(0, 1, v), 1.25);
        g.addColorStop(v, `rgba(${lerp(tr, hr, k) | 0},${lerp(tg, hg, k) | 0},${lerp(tb, hb, k) | 0},${(a * f).toFixed(4)})`);
      }
      C.fillStyle = g;
      C.fillRect(0, 0, W, sh);
      const ga = s[8]! / 100;
      if (ga > 0.003) {
        // just above the top edge; gone before the sky's bottom (no edge)
        const cx = this.sideU * W, cy = -sh * 0.06, R = sh * 0.95;
        const c = this.glowC, rgb = `${c[0] | 0},${c[1] | 0},${c[2] | 0}`;
        const gr = C.createRadialGradient(cx, cy, 0, cx, cy, R);
        gr.addColorStop(0, `rgba(${rgb},${ga.toFixed(4)})`);
        gr.addColorStop(0.07, `rgba(${rgb},${(ga * 0.72).toFixed(4)})`);
        gr.addColorStop(0.22, `rgba(${rgb},${(ga * 0.38).toFixed(4)})`);
        gr.addColorStop(0.5, `rgba(${rgb},${(ga * 0.12).toFixed(4)})`);
        gr.addColorStop(1, `rgba(${rgb},0)`);
        C.fillStyle = gr;
        const x0 = Math.max(0, cx - R), x1 = Math.min(W, cx + R);
        if (x1 > x0) C.fillRect(x0, 0, x1 - x0, sh);
      }
    }
    if (this.pulse < 0.999) this.moving = true;
    b.globalCompositeOperation = 'destination-over';
    b.globalAlpha = this.pulse;
    b.drawImage(this.skyCv, 0, 0, this.skyCv.width, this.skyCv.height, 0, 0, env.W, this.skyCv.height / this.dpr);
    b.globalAlpha = 1;
    b.globalCompositeOperation = 'source-over';
  }

  // A flat cloud layer above the viewer, ray-cast per deck pixel, rebuilt
  // row by row over BF frames while the previous two buffers cross-fade.
  setupDeck(env: Env): void {
    const W = env.W, H = env.H;
    this.hY = Math.round(H * 0.36);
    const dw = Math.ceil(W / DS), dh = Math.ceil(this.hY / DS);
    this.dw = dw;
    this.dh = dh;
    this.dP = mkCanvas(dw, dh);
    this.dN = mkCanvas(dw, dh);
    this.dC = mkCanvas(dw, dh);
    this.dF = mkCanvas(dw, dh);
    this.gP = ctx2d(this.dP);
    this.gN = ctx2d(this.dN);
    this.gC = ctx2d(this.dC);
    this.gF = ctx2d(this.dF);
    this.bimg = this.gN.createImageData(dw, dh);
    const f = W * 0.55, cx = W * 0.5;
    this.rZ = new Float32Array(dh);
    this.rA = new Float32Array(dh);
    this.rH = new Float32Array(dh);
    for (let r = 0; r < dh; r++) {
      const hy = this.hY - (r + 0.5) * DS, q = hy / this.hY;
      this.rZ[r] = f / Math.max(hy, 1);
      this.rA[r] = sst(0.1, 0.5, q);
      this.rH[r] = 1 - sst(0.2, 0.85, q);
    }
    this.cX = new Float32Array(dw);
    this.rowD = new Float32Array(dw);
    for (let c = 0; c < dw; c++) this.cX[c] = ((c + 0.5) * DS - cx) / f;
    this.bRow = 0;
    this.bk = { th: 0.9, a: 0, lit: [0, 0, 0], sh: [0, 0, 0], hz: [0, 0, 0], ox: 0, oz: 0 };
    this.deckEmpty = true;
  }
  /** The whole deck at once, both buffers alike (first frame, a new cover, a new size). */
  deckNow(): void {
    this.deckParams();
    this.buildRows(0, this.dh);
    this.gN.putImageData(this.bimg, 0, 0);
    this.gP.clearRect(0, 0, this.dw, this.dh);
    this.gP.drawImage(this.dN, 0, 0);
    this.bRow = 0;
    this.deckEmpty = this.bk.a < 0.004;
  }
  deckParams(): void {
    const p = this.bk, cov = this.cover;
    p.th = cov < 0.6 ? 0.9 - cov * 0.47 : 0.618 - (cov - 0.6) * 0.85;
    p.a = sst(0.02, 0.3, cov);
    let w = 0;
    const l = p.lit, s = p.sh;
    l[0] = l[1] = l[2] = s[0] = s[1] = s[2] = 0;
    let op = 0;
    for (let i = 0; i < NP; i++) {
      const k = this.palW[i]!;
      if (k < 0.002) continue;
      const P = PAL[i]!;
      w += k;
      op += P.op * k;
      for (let c = 0; c < 3; c++) {
        l[c]! += P.lit[c]! * k;
        s[c]! += P.sh[c]! * k;
      }
    }
    if (w > 0) {
      for (let c = 0; c < 3; c++) {
        l[c]! /= w;
        s[c]! /= w;
      }
      op /= w;
    }
    p.a *= op;
    p.hz[0] = this.hor0 || 0;
    p.hz[1] = this.hor1 || 0;
    p.hz[2] = this.hor2 || 0;
    p.ox = this.ox;
    p.oz = this.oz;
  }
  buildRows(r0: number, r1: number): void {
    const p = this.bk, N = this.noise, o = this.bimg.data, dw = this.dw;
    const th = p.th, A = p.a, l = p.lit, s = p.sh, hz = p.hz, S = 0.62;
    const l0 = l[0]!, l1 = l[1]!, l2 = l[2]!, s0 = s[0]!, s1 = s[1]!, s2 = s[2]!, h0 = hz[0]!, h1 = hz[1]!, h2 = hz[2]!;
    for (let r = r0; r < r1; r++) {
      const Z = this.rZ[r]!, ra = this.rA[r]! * A, hzk = this.rH[r]! * 0.7;
      const base = r * dw * 4;
      if (ra < 0.004) {
        for (let c = 0; c < dw; c++) o[base + c * 4 + 3] = 0;
        continue;
      }
      const w = Z * S + p.oz, detail = clamp(3.2 / Z, 0.2, 1);
      const RB = this.rowD, K = 10, gk = clamp(0.32 / ((K * DS * Z * S) / (this.W * 0.55)), 0.5, 4) * 2.2;
      for (let c = 0; c < dw; c++) {
        const j = base + c * 4;
        const u = this.cX[c]! * Z * S + p.ox;
        const d0 = N(u, w), d2 = RB[c < K ? 0 : c - K]!;
        RB[c] = d0;
        if (d0 * 0.6 + 0.4 < th - 0.02) {
          o[j + 3] = 0;
          continue;
        }
        const d = d0 * 0.6 + N(u * 2.13 + 5.2, w * 2.13 + 1.3) * 0.28 + N(u * 4.7 + 9.1, w * 4.7 + 3.3) * 0.12 * detail + 0.06 * (1 - detail);
        const a = sst(th - 0.01, th + 0.09, d);
        if (a < 0.01) {
          o[j + 3] = 0;
          continue;
        }
        const thick = sst(th, th + 0.32, d);
        let li = 0.92 - 0.8 * thick + (d0 - d2) * gk + (1 - sst(th, th + 0.07, d)) * 0.3;
        li = li < 0 ? 0 : li > 1 ? 1 : li;
        const R = s0 + (l0 - s0) * li, G = s1 + (l1 - s1) * li, B = s2 + (l2 - s2) * li;
        o[j] = R + (h0 - R) * hzk;
        o[j + 1] = G + (h1 - G) * hzk;
        o[j + 2] = B + (h2 - B) * hzk;
        o[j + 3] = 255 * ra * a * (0.82 + 0.18 * thick);
      }
    }
  }
  drawDeck(b: Ctx, env: Env, dt: number, out: number): void {
    const wind = 1 + this.wet * 0.6;
    this.ox += 0.014 * wind * dt;
    this.oz += 0.04 * wind * dt;
    const rows = this.dh;
    if (this.first) this.deckNow();
    else if (!(this.deckEmpty && this.cover < 0.02)) {
      if (this.bRow === 0) this.deckParams();
      const n = Math.ceil(rows / BF), r1 = Math.min(rows, this.bRow + n);
      this.buildRows(this.bRow, r1);
      this.bRow = r1;
      if (this.bRow >= rows) {
        const t = this.dP;
        this.dP = this.dN;
        this.dN = t;
        const g = this.gP;
        this.gP = this.gN;
        this.gN = g;
        this.gN.putImageData(this.bimg, 0, 0);
        this.deckEmpty = this.bk.a < 0.004;
        this.bRow = 0;
      }
    }
    // No text protection behind the clouds any more (owner feedback 9): the deck is fainter instead, everywhere.
    const fA = out * (0.4 + 0.6 * this.fogK) * DECK_A;
    if (fA < 0.01 || (this.deckEmpty && this.cover < 0.02)) return;
    this.moving = true;
    const k = this.bRow / rows, C = this.gC;
    C.globalCompositeOperation = 'copy';
    C.globalAlpha = 1 - k;
    C.drawImage(this.dP, 0, 0);
    C.globalCompositeOperation = 'lighter';
    C.globalAlpha = k;
    C.drawImage(this.dN, 0, 0);
    C.globalCompositeOperation = 'source-over';
    C.globalAlpha = 1;
    const dW = this.dw * DS, dH = this.dh * DS;
    b.globalAlpha = fA;
    b.drawImage(this.dC, 0, 0, dW, dH);
    const fl = clamp(env.shared.flash || 0, 0, 1) * out;
    if (fl > 0.02 && !this.th.light) {
      const F = this.gF, bx = env.shared.boltX;
      F.globalCompositeOperation = 'copy';
      F.globalAlpha = 1;
      F.drawImage(this.dC, 0, 0);
      F.globalCompositeOperation = 'source-in';
      if (bx) {
        const cx = bx / DS, cy = this.dh * 0.8, r = (env.W * 0.42) / DS;
        const gr = F.createRadialGradient(cx, cy, 0, cx, cy, r);
        gr.addColorStop(0, 'rgba(228,234,255,1)');
        gr.addColorStop(0.3, 'rgba(222,230,255,.62)');
        gr.addColorStop(0.65, 'rgba(216,226,255,.3)');
        gr.addColorStop(1, 'rgba(210,222,255,.22)');
        F.fillStyle = gr;
      } else F.fillStyle = 'rgba(222,230,255,.45)';
      F.fillRect(0, 0, this.dw, this.dh);
      F.globalCompositeOperation = 'source-over';
      b.globalCompositeOperation = 'lighter';
      b.globalAlpha = Math.min(1, fl * 1.1);
      b.drawImage(this.dF, 0, 0, dW, dH);
      b.globalCompositeOperation = 'source-over';
    }
    b.globalAlpha = 1;
  }

  drawStars(b: Ctx, env: Env, wMoon: number, wNight: number, out: number): void {
    const vis =
      out *
      (wNight + wMoon * 0.6) *
      (1 - sst(0.4, 0.8, this.cover)) *
      (0.25 + 0.75 * this.fogK) *
      clamp(1 - this.palW[0]! - this.palW[2]! * 0.7 - this.palW[3]! * 0.5 - this.palW[7]!, 0, 1) *
      (1 - 0.85 * this.darkG);
    this.starVis = vis;
    if (vis < 0.01) return;
    this.moving = true;
    const T = this.T, W = env.W, sh = this.starH;
    b.globalAlpha = vis * (0.8 + 0.2 * Math.sin(T * 1.3));
    b.drawImage(this.starL[0]!, 0, 0, W, sh);
    b.globalAlpha = vis * (0.8 + 0.2 * Math.sin(T * 1.9 + 2.1));
    b.drawImage(this.starL[1]!, 0, 0, W, sh);
    const S = this.big;
    for (let i = 0; i < this.nBig; i++) {
      const o = i * 5;
      const tw = (0.72 + 0.28 * Math.sin(T * S[o + 4]! + S[o + 3]!)) * (0.85 + 0.15 * Math.sin(T * S[o + 4]! * 2.7 + S[o + 3]! * 3.1));
      const a = S[o + 2]! * tw * vis;
      if (a < 0.04) continue;
      b.globalAlpha = a;
      b.drawImage(this.starSpr, S[o]! - 12, S[o + 1]! - 12);
    }
    b.globalAlpha = 1;
  }

  launchShoot(env: Env): void {
    const sh = this.shoot, W = env.W, H = env.H, ltr = Math.random() < 0.35;
    const sp = 760 + Math.random() * 380;
    const ang = (0.05 + Math.random() * 0.1) * Math.PI;
    sh.vx = Math.cos(ang) * sp * (ltr ? 1 : -1);
    sh.vy = Math.sin(ang) * sp;
    sh.x = ltr ? W * (-0.05 + Math.random() * 0.35) : W * (0.65 + Math.random() * 0.4);
    sh.y = H * (0.02 + Math.random() * 0.2);
    sh.age = 0;
    sh.on = true;
  }
  drawShoot(b: Ctx, env: Env, dt: number, out: number): void {
    const sh = this.shoot, vis = this.starVis || 0;
    if (!sh.on) {
      sh.next -= dt;
      if (sh.next <= 0) {
        sh.next = 9 + Math.random() * 18;
        if (vis > 0.3 && out > 0.5) this.launchShoot(env);
      }
      return;
    }
    sh.age += dt;
    const hx = sh.x + sh.vx * sh.age, hy = sh.y + sh.vy * sh.age;
    const tl = Math.min(sh.age, 0.2);
    const tx = hx - sh.vx * tl, ty = hy - sh.vy * tl;
    if (tx < -40 || tx > env.W + 40 || ty > env.H * 0.8 || sh.age > 4) {
      sh.on = false;
      return;
    }
    const fade = sst(0, 0.18, sh.age) * (0.75 + 0.25 * Math.sin(Math.min(1, sh.age / 1.6) * Math.PI)) * clamp(vis * 1.2, 0.35, 1);
    const C = (r: number, g: number, bb: number, a: number): string => adaptCss(r, g, bb, a, this.th);
    const gr = b.createLinearGradient(tx, ty, hx, hy);
    gr.addColorStop(0, C(190, 205, 255, 0));
    gr.addColorStop(0.75, C(215, 228, 255, 0.45));
    gr.addColorStop(1, C(255, 255, 255, 1));
    b.strokeStyle = gr;
    b.lineCap = 'round';
    b.beginPath();
    b.moveTo(tx, ty);
    b.lineTo(hx, hy);
    b.globalAlpha = fade * 0.22;
    b.lineWidth = 4;
    b.stroke();
    b.globalAlpha = fade * 0.85;
    b.lineWidth = 1.3;
    b.stroke();
    b.globalAlpha = fade;
    b.drawImage(this.starSpr, hx - 12, hy - 12);
    b.globalAlpha = 1;
  }

  stepMoon(env: Env, dt: number): void {
    const up = env.settled.moonUp;
    if (this.moonSet) {
      const s = this.moonSet, p = (this.T - s.t0) / s.dur;
      if (p >= 1) {
        this.moonSet = null;
        this.u = -1;
      } else this.u = lerp(s.u0, 1, sst(0, 1, p) * 0.6 + p * 0.4);
    } else if (up) {
      // Up without an Event.Moon rise (start, a clock sync, the almanac): already in the sky, it fades in there.
      if (this.u < 0) {
        this.u = MOON_START;
        this.moonPres = 0;
      }
      const slow = this.u < MOON_HOLD - 0.1 ? 1 : clamp((MOON_HOLD - this.u) / 0.1, 0, 1);
      this.u += ((dt * env.moonSpeed) / MOON_CROSS_S) * slow;
    }
    const want = this.u >= 0 && (up || this.moonSet) ? 1 : 0;
    this.moonPres = ease(this.moonPres, want, dt, 1.5);
    if (!want && this.moonPres < 0.01) this.u = -1;
  }
  moonPos(u: number): void {
    const P = this.mpath, th = Math.PI * u;
    const cx = (P.xR + P.xL) / 2, rx = (P.xR - P.xL) / 2;
    const yb = lerp(P.yR, P.yL, u), ry = (P.yR + P.yL) / 2 - P.yTop;
    this.mx = cx + rx * Math.cos(th);
    this.my = yb - ry * Math.sin(th);
  }
  drawMoon(b: Ctx, env: Env, dt: number, wMoon: number, wNight: number, out: number): void {
    this.stepMoon(env, dt);
    const light = out * clamp(wMoon + wNight * 0.65, 0, 1) * (1 - this.palW[0]! - this.palW[2]! * 0.8 - this.palW[3]! * 0.5 - this.palW[7]!);
    const tgt = Math.max(0, light) * (1 - 0.8 * sst(0.75, 1, this.cover)) * (0.35 + 0.65 * this.fogK) * (1 - 0.7 * (this.darkG || 0));
    this.moonVis = ease(this.moonVis, tgt, dt, 1.2);
    const u = this.u, mo = this.moon;
    if (u < 0 || !mo || this.moonVis * this.moonPres < 0.01) {
      this.mVisNow = 0;
      return;
    }
    this.moonPos(u);
    const x = this.mx, y = this.my;
    let a = this.moonVis * this.moonPres * sst(0, 0.05, u);
    // It sets behind the text horizon on the left; on the right (where it rises) it shows lower down.
    a *= lerp(1 - sst(this.hz - mo.R * 2.4, this.hz + mo.R * 0.2, y), 1, sst(0.6, 0.75, x / this.W));
    this.mVisNow = a;
    if (a < 0.01) return;
    this.moving = true;
    const phase = clamp(env.settled.moonPhase, 0, 1);
    mo.relight(phase);
    const ph = 0.25 + 0.75 * phase;
    const hs = mo.R / 24;
    if (!this.th.light) {
      b.globalAlpha = a * ph;
      b.drawImage(this.halo, x - 130 * hs, y - 130 * hs, 260 * hs, 260 * hs);
      b.globalAlpha = a * 0.55 * ph;
      b.drawImage(this.halo, x - 300 * hs, y - 300 * hs, 600 * hs, 600 * hs);
    }
    b.globalAlpha = a;
    const s = mo.w / mo.S;
    b.drawImage(mo.cv, x - s / 2, y - s / 2, s, s);
    b.globalAlpha = 1;
  }
  drawGlints(f: Ctx, env: Env): void {
    const v = this.mVisNow || 0;
    if (v < 0.02 || !this.moon || this.th.light) return;
    const R = this.moon.R * 0.6, x = this.mx, y = this.my;
    const pk = 0.3 + 0.7 * clamp(env.settled.moonPhase, 0, 1);
    f.globalCompositeOperation = 'lighter';
    for (const p of env.panes) {
      const dyEdge = p.y - y;
      const dx = x < p.x ? p.x - x : x > p.x + p.w ? x - (p.x + p.w) : 0;
      const near = Math.exp(-(dyEdge * dyEdge) / (R * R * 2.2)) * Math.exp(-(dx * dx) / (R * R * 5));
      const wide = 0.35 * sst(-10, 120, dyEdge) * Math.exp(-(dx * dx) / 40000);
      const a = v * pk * Math.min(1, near * 1.2 + wide) * 0.9;
      if (a < 0.02) continue;
      const cx = clamp(x, p.x + 10, p.x + p.w - 10);
      const gw = 90 + near * 160 + wide * 200;
      const x0 = Math.max(p.x, cx - gw / 2), x1 = Math.min(p.x + p.w, cx + gw / 2);
      if (x1 - x0 < 2) continue;
      const sx0 = ((x0 - (cx - gw / 2)) / gw) * 256, sx1 = ((x1 - (cx - gw / 2)) / gw) * 256;
      f.globalAlpha = a * 0.75;
      f.drawImage(this.glint, sx0, 0, sx1 - sx0, 12, x0, p.y - 5.5, x1 - x0, 12);
      if (near > 0.25) {
        f.globalAlpha = (near - 0.25) * v * pk;
        f.drawImage(this.starSpr, cx - 12, p.y - 11.5);
      }
    }
    f.globalAlpha = 1;
    f.globalCompositeOperation = 'source-over';
  }

  sunPos(kind: 'rise' | 'set', p: number, W: number, H: number, out: Float32Array): void {
    const q = sst(0, 1, p);
    if (kind === 'rise') {
      out[0] = W * (1.07 - 0.2 * q);
      out[1] = H * (0.06 - 0.5 * q);
    } else {
      out[0] = W * (0.22 - 0.3 * q);
      out[1] = H * (-0.42 + 0.5 * q);
    }
  }
  drawIndoorTint(env: Env, k: number): void {
    const f = env.back, c = this.col, H = env.H * 0.13;
    const g = f.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgba(${c[0]! | 0},${c[1]! | 0},${c[2]! | 0},.5)`);
    g.addColorStop(1, `rgba(${c[0]! | 0},${c[1]! | 0},${c[2]! | 0},0)`);
    f.globalAlpha = k * 0.32;
    f.fillStyle = g;
    f.fillRect(0, 0, env.W, H);
    f.globalAlpha = 1;
  }
  drawRaysFront(env: Env, p: number, I: number): void {
    const W = env.W, H = env.H, M = this.moment!, S = this.S, f = env.front;
    const c = this.col, rgb = `${c[0]! | 0},${c[1]! | 0},${c[2]! | 0}`;
    const wetK = 1 - 0.65 * this.wet;
    const sx = S[0]!, sy = S[1]!;
    const far = Math.hypot(Math.max(sx, W - sx), H - sy);
    const near = Math.max(0, -sy);
    const front = M.kind === 'rise' ? lerp(near, far * 1.05, sst(0.08, 0.75, p)) : lerp(far * 1.05, near, sst(0.1, 0.85, p));
    const bw = far * 0.28;
    const gr = f.createRadialGradient(sx, sy, Math.max(0, front - bw), sx, sy, front + bw);
    gr.addColorStop(0, `rgba(${rgb},0)`);
    gr.addColorStop(0.5, `rgba(${rgb},1)`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    f.globalAlpha = 0.085 * I * wetK;
    f.fillStyle = gr;
    f.fillRect(0, 0, W, H);
    f.globalCompositeOperation = this.th.add;
    const col = `rgb(${rgb})`;
    for (const q of env.panes) {
      const cx = q.x + q.w / 2, cy = q.y + q.h / 2;
      const d = Math.hypot(cx - sx, cy - sy);
      const prox = 0.35 + 0.65 * Math.exp(-((d - front) * (d - front)) / (bw * bw * 0.8));
      const a = I * prox * wetK * this.fogK;
      if (a < 0.02) continue;
      const side = sx > cx ? q.x + q.w - 0.75 : q.x + 0.75;
      // Rects, the area the butt-capped strokes covered (no stroked paths
      // on the GPU canvases, ADR 0091 stage 28 E).
      f.fillStyle = col;
      f.globalAlpha = a * 0.16;
      f.fillRect(q.x, q.y - 1, q.w, 5);
      f.globalAlpha = a * 0.6;
      f.fillRect(q.x, q.y, q.w, 1.2);
      f.globalAlpha = a * 0.35;
      f.fillRect(side - 0.6, q.y, 1.2, q.h * 0.6);
    }
    f.globalAlpha = 1;
    f.globalCompositeOperation = 'source-over';
  }
  drawRaysBack(env: Env, p: number, I: number): void {
    const W = env.W, H = env.H, M = this.moment!, g = env.back, S = this.S;
    this.sunPos(M.kind, p, W, H, S);
    const c = this.col;
    const rgb = `${(c[0]! + (255 - c[0]!) * 0.35) | 0},${(c[1]! + (255 - c[1]!) * 0.35) | 0},${(c[2]! + (255 - c[2]!) * 0.3) | 0}`;
    const k = I * (1 - 0.65 * this.wet) * this.fogK * (M.kind === 'set' ? 0.62 : 1.25);
    g.globalCompositeOperation = this.th.add;
    const sx = S[0]!, sy = S[1]!;
    const far = Math.hypot(Math.max(sx, W - sx), H - sy);
    const gl = g.createRadialGradient(sx, sy, 0, sx, sy, far * 0.75);
    gl.addColorStop(0, `rgba(${rgb},.5)`);
    gl.addColorStop(0.3, `rgba(${rgb},.16)`);
    gl.addColorStop(0.6, `rgba(${rgb},.06)`);
    gl.addColorStop(1, `rgba(${rgb},0)`);
    g.globalAlpha = k;
    g.fillStyle = gl;
    g.fillRect(0, 0, W, H);
    const hs = g.createRadialGradient(sx, sy, 0, sx, sy, H * 0.45);
    hs.addColorStop(0, 'rgba(255,250,235,.9)');
    hs.addColorStop(0.12, `rgba(${rgb},.55)`);
    hs.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = hs;
    g.fillRect(Math.max(0, sx - H * 0.45), Math.max(0, sy - H * 0.45), H * 0.9, H * 0.9);
    const rg = g.createRadialGradient(sx, sy, 0, sx, sy, far * 1.05);
    rg.addColorStop(0, `rgba(${rgb},1)`);
    rg.addColorStop(0.55, `rgba(${rgb},.62)`);
    rg.addColorStop(1, `rgba(${rgb},.05)`);
    g.fillStyle = rg;
    let a0 = 1e9, a1 = -1e9;
    for (let i = 0; i < 4; i++) {
      const a = Math.atan2((i > 1 ? H : 0) - sy, (i & 1 ? W : 0) - sx);
      a0 = Math.min(a0, a);
      a1 = Math.max(a1, a);
    }
    const T = this.T, N = 15, L = far * 1.2;
    // Each ray (and its core) is its own convex triangle: Skia fills those on
    // the GPU; one path of many triangles goes to its software path renderer
    // on the GPU thread (tens of ms per frame, stage 28 E).
    const cores: number[] = [];
    for (let i = 0; i < N; i++) {
      const r1 = Math.sin(i * 12.9898 + 3) * 43758.5453, j = r1 - Math.floor(r1);
      const a = a0 + ((a1 - a0) * (i + 0.5 + (j - 0.5) * 0.7)) / N + Math.sin(T * 0.15 + i) * 0.006;
      const wd = 0.008 + j * 0.03;
      const al = (0.3 + 0.7 * ((j * 7.3) % 1)) * (0.7 + 0.3 * Math.sin(T * (0.5 + j) + i * 2.1));
      g.globalAlpha = k * al * 0.5;
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(sx + Math.cos(a - wd) * L, sy + Math.sin(a - wd) * L);
      g.lineTo(sx + Math.cos(a + wd) * L, sy + Math.sin(a + wd) * L);
      g.closePath();
      g.fill();
      const ww = wd * 0.4;
      cores.push(a - ww, a + ww);
    }
    g.globalAlpha = k * 0.62;
    for (let i = 0; i < cores.length; i += 2) {
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(sx + Math.cos(cores[i]!) * L, sy + Math.sin(cores[i]!) * L);
      g.lineTo(sx + Math.cos(cores[i + 1]!) * L, sy + Math.sin(cores[i + 1]!) * L);
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';
    const pts = this.pts;
    for (let pass = 0; pass < 2; pass++) {
      const ox = pass ? -18 : 18;
      g.globalAlpha = 0.45;
      for (const q of env.panes) {
        CX[0] = CX[3] = q.x;
        CX[1] = CX[2] = q.x + q.w;
        CY[0] = CY[1] = q.y;
        CY[2] = CY[3] = q.y + q.h;
        for (let i = 0; i < 4; i++) {
          const dx = CX[i]! - (sx + ox), dy = CY[i]! - sy, dl = Math.hypot(dx, dy) || 1;
          pts[i * 2] = CX[i]!;
          pts[i * 2 + 1] = CY[i]!;
          pts[8 + i * 2] = CX[i]! + (dx / dl) * 4000;
          pts[8 + i * 2 + 1] = CY[i]! + (dy / dl) * 4000;
        }
        hullFill(g, pts);
      }
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }

  drawDark(b: Ctx, env: Env, out: number): void {
    const d = this.dark!, t = this.T - d.t0;
    const grow = sst(0, 2.2, t), recede = sst(4.2, 6.6, t);
    if (t > 6.8) {
      this.dark = null;
      this.darkG = 0;
      return;
    }
    const g = grow * (1 - recede) * d.k;
    this.darkG = g * (0.4 + 0.6 * out);
    const k = g * (0.55 + 0.45 * out);
    const W = env.W, H = env.H;
    const pulse = 0.88 + 0.12 * Math.sin(t * 2.6);
    b.globalAlpha = k * pulse;
    b.fillStyle = this.gTopRed!;
    b.fillRect(0, 0, W, H * 0.45);
    b.globalAlpha = k * 0.9 * pulse;
    b.fillStyle = this.gRightRed!;
    b.fillRect(W - H * 0.95, 0, H * 0.95, H * 0.95);
    b.globalAlpha = k * 0.6;
    b.fillStyle = this.gLeftRed!;
    b.fillRect(0, 0, H * 0.6, H * 0.6);
    b.globalAlpha = 1;
  }
  drawLift(b: Ctx, env: Env, out: number): void {
    const L = this.lift!, p = (this.T - L.t0) / L.dur;
    if (p >= 1) {
      this.lift = null;
      return;
    }
    const W = env.W, H = env.H, k = L.k * (0.5 + 0.5 * out);
    const red = (1 - sst(0, 0.55, p)) * k;
    if (red > 0.01) {
      b.save();
      b.globalAlpha = red * 0.8;
      b.fillStyle = this.gTopRed!;
      b.scale(1, Math.max(0.05, 1 - sst(0, 0.7, p)));
      b.fillRect(0, 0, W, H * 0.45);
      b.restore();
    }
    const lit = Math.sin(Math.PI * sst(0.1, 1, p)) * k;
    if (lit > 0.01) {
      b.globalAlpha = lit * 0.7;
      b.fillStyle = this.gLift!;
      b.fillRect(0, 0, W, H * 0.3);
    }
    b.globalAlpha = 1;
  }
}

export function skyModule(): Module {
  let sky: Sky | null = null;
  return {
    id: 'sky',
    init(env) {
      sky = new Sky(env, sky);
    },
    resize(env) {
      sky?.resize(env);
    },
    frame(env, dt) {
      return sky && sky.built ? sky.frame(env, dt) : false;
    },
    onEvent(env, name) {
      sky?.onEvent(env, name);
    },
    fps(env) {
      // Clouds, moon, stars and the darkness sky drift slowly; a shooting star,
      // a lightning-lit sky, sun moments and darkness bleeds move fast (and are
      // rare); a settled day sky does not move at all.
      if (!sky) return FPS_SLOW;
      if (sky.shoot.on || env.shared.flash > 0.01 || sky.moment || sky.dark || sky.lift) return FPS_FAST;
      return sky.still > 2 ? FPS_STILL : FPS_SLOW;
    },
    destroy() {
      sky = null;
    },
  };
}
