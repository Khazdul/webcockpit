// Sky module (port of the v4 prototype, notes/research/weather-world/modules/sky.js):
// everything above the weather, on the back layer.
//  - a sky gradient with a soft glow on one side: by day a bright, saturated
//    sky blue that reaches down to ~30 % above the bottom (owner feedback 1,
//    22), with the sun's warm glow at the top right; at night it fades out at
//    ~43 % with a cool lift toward the moon. Outdoors only. Cached at full
//    resolution and redrawn only when its colours move.
//  - day life (daylife.ts): now and then birds, rarely an insect, small cloud
//    tufts on a clear day, and a sun glimpse with a few faint rays
//  - a perspective cloud deck seen from below in the top ~35 % (weather `~`
//    and wetter): big near clouds overhead, small ones toward the horizon,
//    drifting slowly; lit by lightning. Its cover changes at a slow constant
//    rate, so clouds come and go one by one, from the side the wind brings
//    them (owner feedback 23)
//  - stars in the upper sky (lower on the right, feedback 25), and shooting
//    stars that cross the whole screen on the back layer, behind the panes'
//    frames, glinting on the frame lines they pass (feedback 20, 24)
//  - a big moon with its real phase on an arc from below the right edge
//    (east) to below the left edge (west), like the sun, at the almanac's
//    place and pace (720 s up); by day much fainter (feedback 11, 38)
//  - sunrise / sunset moments: faint thin rays with pane shadow wedges, and
//    three faint beams spread over the same slow fan; the frame lines glint
//    where a ray or beam crosses them (beams.ts, feedback 37, items 78, 79).
//    Both follow the clock over the 60 s before the day or the night
//    begins (`env.rise`, `env.set`; sunturn.ts curves, ADR 0093)
//  - Event.Darkness start / grow (a darkness spell spreading): a red ominous
//    bleed from the top and the corners; shrink / end: a brief lightening.
//    Nothing else is red: no darkness sky (owner feedback 26)
// Glints on the frame lines (glint.ts) are brief and drawn on the line only.
// Nothing here follows the text lines (owner feedback 9) or the panes'
// places (feedback 5, 6): stars, moon path and clouds are in coordinates
// relative to the canvas and rebuilt only when its size changes.
// Categories: `sky` gates everything but the darkness bleeds, which
// `darkness` gates.

import { RIM_R } from '../../panes/frame';
import { adapt, adaptCss, type Rgb, type ThemeInfo } from '../palette';
import type { WeatherEvent } from '../protocol';
import { TURN_RAY_N, type TurnKind, glimpseBlocked, turnBeamOn, turnGlint, turnGlow, turnIntensity, turnOn, turnPalette, turnProgress, turnRayOn, turnRays, turnStars } from '../sunturn';
import { BEAMS, BEAM_EXIT, BEAM_INSIDE, type Beam, type BeamHit, type Box, TIER_GLINT, beamHits, beamPieces, notchPieces, rayHash, rayTier, sunBeams, sunPoint, sunPsi, turnFan, turnRayAngle } from './beams';
import { DayLife } from './daylife';
import { type Ctx, type Cv, type Env, FPS_FAST, FPS_SLOW, FPS_STILL, type Module, TAU, clamp, ctx2d, ease, lerp, mkCanvas, sst } from './env';
import { Glints } from './glint';
import { plateRects, rimRects } from './rimshape';

/** The moon's time up, real s at game pace: 720 game minutes, one real second each (gametime.ts). */
const MOON_UP_S = 720;
/** Without a clock to the minute and its set event the moon waits here on its drawn path, just past the left (west) edge. */
const MOON_HOLD = 0.97;
/** Where a moon of unknown age shows (no synced almanac). */
const MOON_START = 0.5;
/** No moon (`Sky.u`): below any place on its way, the way in before the rise included. */
const NO_MOON = -1;
/** At the game's rise the moon's centre is this many radii inside the right edge (about 80 % of the disc in; owner item 63). */
export const MOON_RISE_IN = 0.6;
/** The moon's pace may change this much (×) to take up a correction of its place (owner item 69): 0.5 … 1.5 of its own. */
export const MOON_PACE_CAP = 0.5;
/** A correction larger than the cap takes up in this long (s) fades the moon out and in at its new place instead. */
export const MOON_GLIDE_S = 20;
/** Frames this far apart (real s: a hidden tab, a paused worker) place the moon anew, fading in. */
const MOON_GAP_S = 2;
/** The moon by day: this much of its night strength (owner feedback 11). */
const DAY_MOON = 0.24;
/** Cloud cover change per second (none → `~` 0.6 in 24 s, owner feedback 23). */
const COVER_RATE = 1 / 40;

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
];
const NP = PAL.length;

interface SkyCol {
  top: Rgb;
  hor: Rgb;
  a: number;
}
const SKY_DARK: Record<'day' | 'grey' | 'moon' | 'night', SkyCol> = {
  day: { top: [112, 184, 255], hor: [92, 152, 232], a: 0.66 },
  grey: { top: [62, 66, 73], hor: [96, 99, 104], a: 0.56 },
  moon: { top: [16, 24, 44], hor: [48, 58, 80], a: 0.66 },
  night: { top: [4, 6, 16], hor: [12, 15, 28], a: 0.75 },
};
/** The sky colours for a background: as designed on dark; lightness-inverted, fainter on light. */
function skyTable(th: ThemeInfo): typeof SKY_DARK {
  if (!th.light) return SKY_DARK;
  const out = {} as Record<keyof typeof SKY_DARK, SkyCol>;
  for (const k of Object.keys(SKY_DARK) as (keyof typeof SKY_DARK)[]) {
    const c = SKY_DARK[k];
    out[k] = { top: adapt(c.top, th, 0.3, 0.88), hor: adapt(c.hor, th, 0.3, 0.9), a: c.a * 0.55 };
  }
  // a clear blue day sky on paper (inverted it would be a dark one)
  out.day = { top: [104, 168, 242], hor: [156, 198, 242], a: 0.44 };
  return out;
}
/** The glow on the sky's light side: the sun's (warm) by day, a cool lift toward the moon or the horizon colour at night. */
const SUN_GLOW_DARK: Rgb = [255, 226, 172];
const SUN_GLOW_LIGHT: Rgb = [255, 210, 130];
/** Where the sun sits, as a fraction of the width (just above the top edge). */
const SUN_U = 0.8;
/** The text horizon as a fraction of the height: the moon sets behind it, the star field ends above it. */
const HORIZON = 0.3;
/** The star field's depth, fraction of the height: on the left, and on the right (lower there, owner feedback 25, 31). */
const STARS_H = 0.55;
const STARS_H_RIGHT = 0.9;
/** The sky gradient's depth, fraction of the height: at night, and by day (a soft start ~30 % above the bottom, feedback 22). */
const SKY_H = 0.43;
const SKY_H_DAY = 0.8;
/** The day sky starts this far in from the left: from the background to the sky over it (owner feedback 28). */
const LEFT_DARK = 0.34;
const DS = 4;
/** The cloud deck's opacity: the text in front of it stays readable without per-line protection. */
const DECK_A = 0.62;
/**
 * Seconds per new key frame of the cloud deck (it is rebuilt row by row over
 * that time while the last two cross-fade): while the clouds drift, and while
 * the cover changes. In time, not in frames (was 56 frames: 4.7 s at 12 fps,
 * so the clouds moved and came in long blurry steps; owner feedback 56).
 */
const DECK_KEY_S = 1.2;
const DECK_KEY_MOVE_S = 0.7;
/**
 * Frames per second while the cloud deck shows (its cross-fade is the motion),
 * above FPS_SLOW's 12; 15 where the canvases draw on the CPU (Firefox: at 20
 * a cloudy day cost ~460 ms of CPU a second against ~280 at 12; owner
 * feedback 56, ADR 0091).
 */
const CLOUD_FPS = 20;
const CLOUD_FPS_CPU = 15;

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
  /** By day: only the lit part, pale, the rest is sky (owner feedback 11). */
  readonly dayCv: Cv;
  private readonly g: Ctx;
  private readonly dg: Ctx;
  private readonly img: ImageData;
  private readonly dimg: ImageData;
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
    this.dayCv = mkCanvas(w, w);
    this.dg = ctx2d(this.dayCv);
    this.dimg = this.dg.createImageData(w, w);
  }
  /** f = illuminated fraction 0..1 (lit side on the right). */
  relight(f: number): void {
    if (Math.abs(f - this.phase) < 0.002) return;
    this.phase = f;
    const cosA = 1 - 2 * f, sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const sx = sinA, sz = -cosA;
    const o = this.img.data, od = this.dimg.data, n = this.w * this.w, { alb, nx, nz, cov } = this;
    for (let i = 0; i < n; i++) {
      const c = cov[i]!, j = i * 4;
      if (c <= 0) {
        o[j + 3] = 0;
        od[j + 3] = 0;
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
      od[j] = 236;
      od[j + 1] = 242;
      od[j + 2] = 252;
      od[j + 3] = 255 * c * clamp(v * 1.35, 0, 1);
    }
    this.g.putImageData(this.img, 0, 0);
    this.dg.putImageData(this.dimg, 0, 0);
  }
}

// Sunrise / sunset moment colours.
type Key = [number, number][];
type KeyC = [number, Rgb][];
const RISE_K: Key = [[0, 6], [0.18, 4], [0.34, 3], [0.55, 2], [0.85, 0], [1, 0]];
const SET_K: Key = [[0, 0], [0.16, 2], [0.42, 3], [0.68, 4], [0.92, 6], [1, 6]];
const RISE_C: KeyC = [[0, [90, 60, 150]], [0.2, [230, 110, 140]], [0.4, [255, 170, 80]], [0.7, [255, 222, 160]], [1, [255, 244, 220]]];
// a sunset's warm colours last to its last seconds: night blue at 0.88 (-7 s) read as the sun set 10 s early (owner item 83)
const SET_C: KeyC = [[0, [255, 196, 96]], [0.2, [255, 150, 60]], [0.5, [232, 56, 52]], [0.8, [170, 52, 104]], [0.95, [110, 52, 128]], [1, [60, 60, 140]]];
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

// convex hull of 8 points (monotone chain), as a flat x, y list — pane shadow wedges
/** The wedge's box points (CX, CY: the rim's lower edge on top, its rounded lower corners as arcs) and their far projections. */
const NB = 8;
const HI = new Int32Array(2 * NB), HU = new Int32Array(4 * NB + 1), CX = new Float32Array(NB), CY = new Float32Array(NB);
function hull(pts: Float32Array): number[] {
  const n = pts.length >> 1;
  for (let i = 0; i < n; i++) HI[i] = i;
  for (let i = 1; i < n; i++) {
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
  for (let i = 0; i < n; i++) {
    while (k >= 2 && cr(HU[k - 2]!, HU[k - 1]!, HI[i]!) <= 0) k--;
    HU[k++] = HI[i]!;
  }
  for (let i = n - 2, t = k + 1; i >= 0; i--) {
    while (k >= t && cr(HU[k - 2]!, HU[k - 1]!, HI[i]!) <= 0) k--;
    HU[k++] = HI[i]!;
  }
  const out: number[] = [];
  for (let i = 0; i < k - 1; i++) out.push(pts[HU[i]! * 2]!, pts[HU[i]! * 2 + 1]!);
  return out;
}

export interface MoonPath {
  x0: number;
  x1: number;
  yBase: number;
  yTop: number;
}
/**
 * The moon's arc for a W × H canvas and a moon of radius R: it comes up from
 * below the right edge (east), crosses high and goes down below the left
 * edge (west), as the sun does and as the game says ("The moon disappears in
 * the west."; owner feedback 11, 38).
 */
export function moonPath(W: number, H: number, R: number): MoonPath {
  return { x0: W + R * 2.4, x1: -R * 2.4, yBase: H * 0.8, yTop: Math.max(R + 14, H * 0.1) };
}
/**
 * How far in on its path the moon is drawn at its rise and set, as a share
 * of the path (owner items 63, 69): at the game's rise (u = 0) the centre is
 * MOON_RISE_IN · R inside the right edge, at its set (u = 1) as far inside
 * the left one. The game's u maps onto the drawn path as `moonVisU`: 0 … 1
 * onto `lead` … 1 − `lead`; the way in before the rise and out after the set
 * are the path's first and last `lead`.
 */
export function moonLead(P: MoonPath, W: number, R: number): number {
  return clamp((P.x0 - (W - MOON_RISE_IN * R)) / (P.x0 - P.x1), 0, 0.4);
}
/** The drawn place (0 … 1 along `moonPath`) for the game's u (`-moonPreU(lead)` … 1 + `moonPreU(lead)`). */
export function moonVisU(u: number, lead: number): number {
  return lead + (1 - 2 * lead) * u;
}
/** How long before its rise the moon comes in (and after its set goes on), in game u. */
export function moonPreU(lead: number): number {
  return lead / (1 - 2 * lead);
}
/** The game's u at `nowMs` for a time up from `riseAt` to `setAt` (unix ms): negative before the rise, above 1 after the set. */
export function moonClockU(nowMs: number, riseAt: number, setAt: number): number {
  return (nowMs - riseAt) / (setAt - riseAt);
}
/**
 * One step of the moon toward its place `tu` (both game u; `tu` already for
 * the step's end) at its pace `n` (u per s) over `dt` s: never slower than
 * 1 − MOON_PACE_CAP of its pace, never faster than 1 + it, so a correction is
 * taken up by a gentle change of pace, never a rush (owner item 69). Null
 * when it is too far to take up within MOON_GLIDE_S: fade and place instead.
 */
export function moonGlide(u: number, tu: number, n: number, dt: number): number | null {
  if (Math.abs(tu - u - n * dt) > MOON_PACE_CAP * n * MOON_GLIDE_S) return null;
  return clamp(tu, u + (1 - MOON_PACE_CAP) * n * dt, u + (1 + MOON_PACE_CAP) * n * dt);
}

/** Without a clock the moon waits for its set event at MOON_HOLD on its drawn path: that place in game u. */
function moonHoldU(lead: number): number {
  return (MOON_HOLD - lead) / (1 - 2 * lead);
}

/** The moon's place at `u` (0 rise … 1 set) on `P`: x even along it, y on a sine arc. */
export function moonAt(P: MoonPath, u: number, out: Float32Array): void {
  out[0] = lerp(P.x0, P.x1, u);
  out[1] = P.yBase - (P.yBase - P.yTop) * Math.sin(Math.PI * clamp(u, 0, 1));
}

/**
 * The sun in a sunrise (from the horizon at the right, climbing to where the
 * day's glimpses start) or a sunset (from ~40° up at the left, sinking to the
 * horizon) at `p` (0..1): the one sun of beams.ts `sunPsi` / `sunPoint`
 * (owner items 66, 67).
 */
export function sunPos(kind: 'rise' | 'set', p: number, W: number, H: number, out: Float32Array): void {
  sunPoint(sunPsi(kind, p), W, H, out);
}

/**
 * A glint's core at full strength (a beam's; a thin ray's by its tier,
 * beams.ts TIER_GLINT): under 1, so the glints fade from the first moment
 * the rays do (owner item 81: they were drawn at 1.1–1.3 and clipped at 1,
 * so a fading glint stayed).
 */
const GLINT_CORE = 0.95;
/** A thin ray's strength by tier (owner item 80: a little weaker than the beams, or much weaker). */
const RAY_TIER: Readonly<Record<'m' | 'w', number>> = { m: 1, w: 0.4 };
/** A thin ray's alpha (its body and its core; was 0.2, then 0.085): subtle, not a spotlight (owner items 78, 83; by eye from headless screenshots). Their glints go by `turnGlint`, not by this. */
const RAY_ALPHA = 0.0425;

/** A beam's layers: width (× its half-width) and alpha: a soft wide glow, the body, a thin core (about a third as strong as before owner item 78, which found them spotlights; half that, item 83). */
const BEAM_LAYERS: ReadonlyArray<readonly [number, number]> = [
  [2.2, 0.011],
  [1, 0.025],
  [0.3, 0.0325],
];

/** The sun's own light (its hot spot, its hazy glow, the ray front's band) by turn: half of before (owner item 83; said of the sunset, the sunrise's is the same drawing). */
const SUN_LIGHT: Readonly<Record<TurnKind, number>> = { rise: 0.5, set: 0.5 };

/**
 * A faint alpha with its 8-bit step dithered in time (owner item 88): a
 * turn's ray adds only a few colour levels, and globalAlpha is itself 8-bit,
 * so as a ray came in each level arrived at once over the whole ray and it
 * popped up. Now each frame (30 a second in a turn) takes the level below or
 * above at random, by how near it is, so the light comes in smoothly.
 */
function dith8(a: number): number {
  const v = a * 255, f = Math.floor(v);
  return (f + (Math.random() < v - f ? 1 : 0)) / 255;
}

/** Fills one convex polygon (flat x, y list): one path, one subpath. */
function polyFill(g: Ctx, P: readonly number[]): void {
  g.beginPath();
  g.moveTo(P[0]!, P[1]!);
  for (let i = 2; i < P.length; i += 2) g.lineTo(P[i]!, P[i + 1]!);
  g.closePath();
  g.fill();
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
  /** The deck's cover now: follows the weather's at COVER_RATE (-1 before the first frame). */
  coverS = -1;
  coverT = 0;
  coverShape = 0;
  wet = 0;
  fogK = 1;
  first = true;
  dark: { t0: number; k: number } | null = null;
  darkG = 0;
  lift: { t0: number; k: number; dur: number } | null = null;
  shoot = { on: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, next: 5 };
  starSpr: Cv;
  halo: Cv;
  readonly glints: Glints;
  readonly life: DayLife;
  /** The rate the day life needs now (0: still). */
  lifeFps = 0;
  lastShootGlint = 0;
  u: number;
  /** The almanac's moon place last seen. */
  moonUWas: number;
  moonSet: { u0: number; t0: number; dur: number } | null = null;
  moonPres: number;
  /** The moon's lead on its path at the rise and set (`moonLead`, from the size) and its way in and out (`moonPreU`). */
  moonLd = 0;
  moonPre = 0;
  /** Without a clock to the minute: where the moon should be (game u; NaN unknown), moved on at its pace. */
  fbU = NaN;
  /** The moon fades out to be placed anew (a correction too big to glide out). */
  relocate = false;
  /** Wall ms of the last moon step (a gap: a hidden tab). */
  moonWall = 0;
  /** The clock places the moon (its rise and set are known). */
  moonClock = false;
  moonVis = 0;
  mVisNow = 0;
  mx = 0;
  my = 0;
  /** The cached sky's inputs: top rgb, horizon rgb, alpha, glow side, glow, day depth, left fade (×100 where noted). */
  skyNow = new Float32Array(11);
  skyLast = new Float32Array(11).fill(-1);
  skyTick = 0;
  sideU = SUN_U;
  /** The glow colour on the light side (its strength is skyNow[8]). */
  glowC: Rgb = [0, 0, 0];
  /** How far the sun moment is (0..1; -1 without one), and which it is (the clock's sunrise or sunset, or none). */
  momentP = -1;
  mKind: TurnKind | null = null;
  /** The blue day sky's share (0..1, eased toward the `daySky` switch), and whether it moved. */
  dayK = 1;
  dayMoving = false;
  /** The outdoors crossfade (0..1, eased) last frame, and whether it moved. */
  outWas = 0;
  outMoving = false;
  /** The cloud cover or the sky's palette is on its way somewhere (a transition: the fast rate). */
  trans = false;
  /** The cloud deck was drawn last frame. */
  deckOn = false;
  /** Something moved in the last frame (stars, moon, clouds, a sky redraw); `still` counts frames without. */
  moving = false;
  still = 0;
  ox = 0;
  oz = 0;
  pts = new Float32Array(4 * NB);
  S = new Float32Array(2);
  /** The sun moment's strong beams this frame (owner feedback 37), their strength (0: none) and frame-line hits. */
  beams: Beam[] = [];
  beamK = 0;
  /** The frame glints' strength this frame (sunturn.ts `turnGlint`, owner items 80, 81). */
  glintK = 0;
  /** The day's sun for the glimpses: `sunU` eased (-1 before the first frame), and its place. */
  sunUs = -1;
  daySun = new Float32Array(2);
  /** A turn's stars are coming or going (sunturn.ts `turnStars`). */
  starsIn = false;
  /** The turn's `s` this frame (sunturn.ts: which rays and beams are there yet). */
  turnS = 0;
  /** The turn's ray fan this frame: its lower and upper edge (beams.ts turnFan). */
  fan = new Float32Array(2);
  /** The thin rays this frame (`k` their glint by tier, 0..1): they glint where they cross a frame line too (owner items 68, 78, 80). */
  rays: Beam[] = [];
  hits: BeamHit[] = [];
  boxes: Box[] = [];
  /** The faint top lift's rects (rimshape.ts), reused every frame. */
  private readonly liftRects: number[] = [];
  tri = [0, 0, 0, 0, 0, 0];
  pIn: number[][] = [];
  pOut: number[][] = [];
  S2 = new Float32Array(2);
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
  mpath: MoonPath = { x0: 0, x1: 0, yBase: 0, yTop: 0 };
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
  /** How far the deck's next key frame is (0..1): its rows built so far and the cross-fade's weight. */
  bPh = 0;
  bk = { th: 0.9, a: 0, lit: [0, 0, 0], sh: [0, 0, 0], hz: [0, 0, 0], ox: 0, oz: 0, f: 1, rising: true };
  deckEmpty = true;
  skyCv!: Cv;
  skyCg!: Ctx;
  /** The cached sky's drawn height (CSS px): only that much is copied. */
  skyDrawH = 0;

  constructor(env: Env, prev: Sky | null) {
    this.noise = env.noise;
    this.th = env.theme;
    this.SKY = skyTable(env.theme);
    this.starSpr = starSprite(env.theme);
    this.halo = glowSprite(130, '170,190,235', 0.22);
    this.glints = new Glints(env.theme);
    this.life = new DayLife(env.theme);
    const mu = env.raw.moonU;
    this.u = env.raw.moonUp ? (mu >= 0 ? mu : MOON_START) : NO_MOON;
    this.moonUWas = mu;
    this.moonPres = env.raw.moonUp ? 1 : 0;
    if (prev) {
      // a theme change: the sky keeps going where it was (no moon or cloud jump)
      this.T = prev.T;
      this.u = prev.u;
      this.moonUWas = prev.moonUWas;
      this.fbU = prev.fbU;
      this.relocate = prev.relocate;
      this.moonWall = prev.moonWall;
      this.coverS = prev.coverS;
      this.coverShape = prev.coverShape;
      this.moonPres = prev.moonPres;
      this.moonSet = prev.moonSet;
      this.moonVis = prev.moonVis;
      this.ox = prev.ox;
      this.oz = prev.oz;
      this.sideU = prev.sideU;
      this.dayK = prev.dayK;
    } else this.dayK = env.cats.daySky ? 1 : 0;
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
    this.skyH = H * SKY_H_DAY;
    // Stars: the upper sky, denser toward the top, reaching lower on the right; fixed relative places.
    const sh0 = H * STARS_H;
    const sh = (this.starH = Math.ceil(H * STARS_H_RIGHT));
    // about as dense as before over the deeper field
    const n = Math.min(520, Math.round((W * (sh0 + sh) * 0.62) / 2400));
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
      const xr = R(), x = Math.round(W * (0.01 + 0.98 * xr)) + 0.5;
      const lim = sh0 + (sh - sh0) * sst(0.45, 0.95, xr);
      const y = Math.round(6 + (lim - 10) * Math.pow(R(), 1.35)) + 0.5;
      const br = (0.4 + Math.pow(R(), 1.8) * 0.6) * (1 - 0.5 * sst(0.5, 1, y / lim)), ph2 = R() * TAU, fr = 0.6 + R() * 2.6;
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
    this.mpath = moonPath(W, H, MR);
    this.moonLd = moonLead(this.mpath, W, MR);
    this.moonPre = moonPreU(this.moonLd);
    this.life.resize(W, H);
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
    if (name === 'moon.rise') {
      // A moon already up or on its way in keeps its place: never a jump. The
      // clock places it on its own (owner item 69); without one it fades in
      // at its rise place, its centre just inside the right edge.
      this.moonSet = null;
      if (!this.moonClock) {
        if (!(this.u > NO_MOON && this.moonPres > 0.02)) {
          this.u = 0;
          this.moonPres = 0;
        }
        this.fbU = Math.max(0, this.u);
      }
    } else if (name === 'moon.set') {
      // With the clock it goes out on its own at its pace. Without: near its
      // end it goes on at its own pace; a moon far from it hurries off.
      const u = this.u;
      if (u > NO_MOON && !this.moonClock) this.moonSet = { u0: u, t0: this.T, dur: u > 0.9 ? Math.max(4, ((1 + this.moonPre - u) * MOON_UP_S) / Math.max(0.01, env.moonSpeed)) : 8 + 18 * (1 - u) };
    } else if (name === 'birds') {
      this.life.birdsNow();
    } else if (name === 'glimpse') {
      this.life.glimpseNow();
    } else if (name === 'insect') {
      this.life.insectNow();
    } else if (name === 'shoot') {
      if (env.cats.sky) this.launchShoot(env);
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
    this.glints.dpr = env.dpr;
    const T = this.T, m = env.mix, skyOn = env.cats.sky;
    // Going in or out: one even crossfade of the whole sky (gradient, clouds,
    // stars, moon, day life), the director's linear 5 s with soft ends; the
    // cached sky is copied at this alpha, not redrawn (owner feedback 27).
    const out = sst(0, 1, m.outdoors);
    this.outMoving = Math.abs(out - this.outWas) > 1e-4;
    this.outWas = out;
    this.moving = this.outMoving;
    this.deckOn = false;
    // The blue day sky switched on or off: it fades (~3 s), no jump.
    const dkT = env.cats.daySky ? 1 : 0, dk0 = this.dayK;
    this.dayK = Math.abs(dkT - dk0) < 0.002 ? dkT : ease(dk0, dkT, dt, 0.8);
    this.dayMoving = this.dayK !== dk0;
    let wSun = m.sun, wMoon = m.moon, wNight = m.dark;
    const ws = wSun + wMoon + wNight;
    if (ws > 0.001) {
      wSun /= ws;
      wMoon /= ws;
      wNight /= ws;
    } else wNight = 1;
    const skyVis = skyOn ? out : 0;
    // The cloud cover moves at a slow constant rate (owner feedback 23): the
    // deck's threshold relaxes from the noise's peaks, so clouds come one by
    // one, and the upwind side first (see buildRows). Indoors (no weather
    // value) the cover and the wetness of the last outdoor room are kept, so
    // the sky fades out and back in as it was.
    const inside = env.settled.weather === null;
    const coverT = inside ? this.coverT : clamp(m.clouds, 0, 1);
    if (this.coverS < 0) this.coverS = coverT;
    else if (!inside) {
      const st = dt * env.speed * COVER_RATE, d = coverT - this.coverS;
      this.coverS += d > st ? st : d < -st ? -st : d;
    }
    this.coverT = coverT;
    // the deck's shapes: those of a higher cover at once, a lower one once the cover has come down to it
    if (coverT >= this.coverShape - 1e-3 || this.coverS <= coverT + 0.01) this.coverShape = coverT;
    const cover = this.coverS;
    const wet = inside ? this.wet : clamp(m.rain * 0.75 + m.heavy * 0.25 + m.snow * 0.55 + cover * 0.1, 0, 1);
    this.cover = cover;
    this.wet = wet;
    this.fogK = 1 - m.fog * 0.55;

    const t = this.palT;
    t.fill(0);
    t[0]! += wSun * (1 - wet * 0.85);
    t[1]! += wSun * wet * 0.85;
    t[5]! += wMoon * (1 - wet * 0.5);
    t[6]! += wMoon * wet * 0.5 + wNight;
    // mI: the turn's strength (tint, palette, glow); rI: its rays and beams (from its first second, owner item 62)
    let mP = -1, mI = 0, e1 = 0, rI = 0, gI = 0;
    // Sunrise and sunset: the clock's last 60 s of the night or the day, until
    // the day or night begins (the director's `riseS` / `setS`); strength,
    // glow, palette and colours by time (sunturn.ts, owner items 71, 72, 76, 77).
    const on = (x: number): boolean => skyOn && turnOn(x);
    const kind = on(env.rise) ? 'rise' : on(env.set) ? 'set' : null;
    if (kind) {
      const ts = kind === 'rise' ? env.rise : env.set;
      this.turnS = ts;
      mP = turnProgress(ts);
      e1 = turnPalette(ts, kind);
      mI = turnIntensity(ts, kind);
      rI = turnRays(kind, ts);
      gI = turnGlow(kind, ts);
      this.glintK = turnGlint(kind, ts) * out;
      e1 *= out;
      for (let i = 0; i < NP; i++) t[i]! *= 1 - e1;
      keyPal(kind === 'rise' ? RISE_K : SET_K, mP, t, e1);
      keyCol(kind === 'rise' ? RISE_C : SET_C, mP, this.col);
    }
    this.momentP = mP;
    this.mKind = kind;
    if (this.first) this.palW.set(t);
    const pTau = kind ? 0.35 : 0.6;
    let palD = 0;
    for (let i = 0; i < NP; i++) {
      this.palW[i] = ease(this.palW[i]!, t[i]!, dt, pTau);
      palD = Math.max(palD, Math.abs(this.palW[i]! - t[i]!));
    }
    this.trans = palD > 0.003 || (!inside && Math.abs(this.coverS - coverT) > 1e-3);

    const b = env.back;
    this.skyColour(env, wSun, wMoon, wNight, mI, skyVis);
    const rays = (rI > 0.002 || gI > 0.002) && out > 0.02;
    if (rays) this.drawRaysBack(env, mP, rI * out, gI * out);
    if (skyOn) {
      // a sunrise's stars fade as its light comes, a sunset's come after its last rays (owner items 76, 77)
      const st = turnStars(env.rise, env.set);
      // a sunset's stars still fill in for 5 s into the night: at the fast rate, as before it (owner item 83)
      this.starsIn = st > 0 && st < 1 && this.starVis > 0.003;
      this.drawStars(b, env, wMoon, wNight, out * st);
      this.drawMoon(b, env, dt, wSun, wMoon, wNight, out);
      this.drawDeck(b, env, dt, out);
      // Day life: birds, an insect, tufts on a clear day, a sun glimpse (owner feedback 22).
      const day = out * wSun * (1 - clamp(mI * 2, 0, 1));
      // The glimpses' sun follows the day (owner item 65): `sunU` comes in steps
      // of SUN_U_STEP, so it glides; unknown counts as mid-morning.
      const su = env.settled.sunU < 0 ? 0.3 : env.settled.sunU;
      this.sunUs = this.sunUs < 0 || Math.abs(su - this.sunUs) > 0.2 ? su : ease(this.sunUs, su, dt, 8);
      sunPoint(sunPsi('day', this.sunUs), env.W, env.H, this.daySun);
      this.lifeFps = this.life.frame(
        b,
        env.front,
        env.panes,
        T,
        dt,
        {
          life: day * (1 - wet * 0.8) * (1 - this.darkG),
          tufts: day * (1 - sst(0, 0.15, cover)) * (1 - wet) * this.fogK,
          sun: day * (1 - wet) * (1 - cover) * this.fogK,
          sunU: env.settled.sunU,
          sx: this.daySun[0]!,
          sy: this.daySun[1]!,
          block: glimpseBlocked(Date.now(), env.rise, env.set, env.settled.dayAt, env.settled.nightAt),
        },
        this.glints,
      );
    } else {
      this.starsIn = false;
      this.starVis = 0;
      this.mVisNow = 0;
      this.lifeFps = 0;
    }
    if (this.dark) this.drawDark(b, env, out);
    if (this.lift) this.drawLift(b, env, out);
    this.drawSky(b, env, dt, mI);
    if (skyOn) this.drawShoot(b, env, dt, out);
    if (rays) this.drawRaysFront(env, mP, rI * out, gI * out);
    if (mI > 0.002 && out < 0.98) this.drawIndoorTint(env, mI * (1 - out));
    this.drawGlints(env.front, env);
    const glinting = this.glints.draw(env.front, T);
    this.first = false;
    this.still = this.moving ? 0 : this.still + 1;
    return skyVis > 0.003 || !!this.mKind || !!this.dark || !!this.lift || this.shoot.on || glinting || this.lifeFps > 0 || this.moonVis * this.moonPres > 0.01;
  }

  skyColour(env: Env, wSun: number, wMoon: number, wNight: number, mI: number, out: number): void {
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
    acc(SKY.grey, wSun * wet * 0.8);
    acc(SKY.moon, wMoon * (1 - wet * 0.45));
    acc(SKY.night, wNight + wMoon * wet * 0.45);
    // The blue day sky, unless switched off on its own (owner feedback 36):
    // then its share is see-through, in the colours of the rest of the sky,
    // so the night (or grey) sky fades in from the page background as
    // smoothly as it would from the blue.
    const wDay = wSun * (1 - wet * 0.8), dk = this.dayK;
    if (wDay > 0.0005) {
      const wo = 1 - wDay;
      const D = SKY.day;
      if (dk < 0.999) {
        const n = wo > 0.002 ? 1 / wo : 0, N = SKY.night;
        const ot = n ? [tr * n, tg * n, tb * n] : N.top, oh = n ? [hr * n, hg * n, hb * n] : N.hor;
        const k = wDay;
        tr += lerp(ot[0]!, D.top[0], dk) * k;
        tg += lerp(ot[1]!, D.top[1], dk) * k;
        tb += lerp(ot[2]!, D.top[2], dk) * k;
        hr += lerp(oh[0]!, D.hor[0], dk) * k;
        hg += lerp(oh[1]!, D.hor[1], dk) * k;
        hb += lerp(oh[2]!, D.hor[2], dk) * k;
        a += D.a * dk * k;
      } else acc(D, wDay);
    }
    if (mI > 0.002) {
      // A tint of the moment's colour, mostly toward the horizon. A sunset
      // keeps the blue day sky until late (owner feedback 29): its tint grows
      // as the director's slow change to night starts; a sunrise tints the
      // night early and lets the day come through.
      const c = this.col, p = this.momentP;
      const k = mI * (this.mKind === 'set' ? 0.1 + 0.4 * sst(0.3, 0.75, p) : 0.5 - 0.3 * sst(0.4, 0.85, p));
      tr = lerp(tr, c[0]! * 0.7, k * 0.6);
      tg = lerp(tg, c[1]! * 0.7, k * 0.6);
      tb = lerp(tb, c[2]! * 0.7, k * 0.6);
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
    // not times `out`: the cached sky is copied at that alpha (a smooth fade without redraws)
    a *= this.fogK * (1 - 0.2 * this.cover);
    // The glow on the light side: the sun by day (none under a grey, wet sky
    // or in a sun moment, which has its own light), a cool lift toward the
    // moon or the horizon at night, hardly any in darkness.
    // (the warm glow belongs to the blue day sky: not with it switched off)
    const sun = wSun * (1 - wet * 0.9) * (1 - clamp(mI * 2, 0, 1)) * dk;
    const cool = wMoon * 0.16 + wNight * 0.07;
    const vis = this.fogK * (1 - 0.5 * this.cover);
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
    // How far down the sky reaches: by day to ~30 % above the bottom, at night less (feedback 22).
    s[9] = wDay * dk * 100;
    // The bright day sky keeps the top left dark for the text there (owner feedback 28).
    s[10] = wSun * (1 - wet * 0.6) * 100;
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
    const out = this.outWas;
    if (a * out < 0.004) return;
    let su = SUN_U;
    // The cool glow follows the moon, but not into the top-left corner as it
    // sets in the west (owner feedback 28, 38): it stops a third of the way in.
    if (this.mVisNow > 0.05) su = lerp(su, clamp(this.mx / env.W, LEFT_DARK, 1), clamp(this.mVisNow * 1.5, 0, 1));
    if (mI > 0.002) su = lerp(su, clamp(this.S[0]! / env.W, 0, 1), clamp(mI * 2, 0, 1));
    this.sideU = ease(this.sideU, su, dt, 0.5);
    s[7] = this.sideU * 100;
    const L = this.skyLast;
    let diff = 0;
    for (let i = 0; i < 11; i++) diff += Math.abs(s[i]! - L[i]!);
    this.skyTick++;
    // every frame it has moved enough (it was every other frame: a 6 Hz
    // stepping at 12 fps; transitions now run at the fast rate, owner feedback 56)
    if ((diff > 0.8 || Math.abs(a - L[6]!) > 0.002) && (this.skyTick >= 1 || diff > 40 || this.first)) {
      L.set(s);
      this.skyTick = 0;
      this.moving = true;
      const C = this.skyCg, W = env.W, sh = env.H * lerp(SKY_H, SKY_H_DAY, s[9]! / 100);
      C.clearRect(0, 0, W, this.skyH + 1);
      this.skyDrawH = Math.min(this.skyH, Math.ceil(sh) + 1);
      const g = C.createLinearGradient(0, 0, 0, sh);
      const day = s[9]! / 100;
      for (let i = 0; i <= 8; i++) {
        // by day the top stays bright longer before it fades (a soft start low down)
        const v = i / 8, k = sst(0, 0.9, v), f = lerp(Math.pow(1 - sst(0, 1, v), 1.25), 1 - sst(0.12, 1, v), day);
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
      const lk = s[10]! / 100;
      if (lk > 0.003) {
        // Left to right from the page background to the sky over the first
        // 30 % of the width; with the vertical fade the top-left corner stays
        // the background (dark, grey or paper alike).
        const lw = W * LEFT_DARK;
        const gl = C.createLinearGradient(0, 0, lw, 0);
        gl.addColorStop(0, `rgba(0,0,0,${lk.toFixed(4)})`);
        gl.addColorStop(0.45, `rgba(0,0,0,${(lk * 0.9).toFixed(4)})`);
        gl.addColorStop(0.8, `rgba(0,0,0,${(lk * 0.38).toFixed(4)})`);
        gl.addColorStop(1, 'rgba(0,0,0,0)');
        C.globalCompositeOperation = 'destination-out';
        C.fillStyle = gl;
        C.fillRect(0, 0, lw, sh);
        C.globalCompositeOperation = 'source-over';
      }
    }
    b.globalCompositeOperation = 'destination-over';
    b.globalAlpha = out;
    const dh = this.skyDrawH;
    if (dh > 0) b.drawImage(this.skyCv, 0, 0, this.skyCv.width, Math.min(this.skyCv.height, Math.ceil(dh * this.dpr)), 0, 0, env.W, Math.min(this.skyCv.height, Math.ceil(dh * this.dpr)) / this.dpr);
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
    this.bPh = 0;
    this.bk = { th: 0.9, a: 0, lit: [0, 0, 0], sh: [0, 0, 0], hz: [0, 0, 0], ox: 0, oz: 0, f: 1, rising: true };
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
    this.bPh = 0;
    this.deckEmpty = this.bk.a < 0.004;
  }
  deckParams(): void {
    const p = this.bk, cov = this.coverShape;
    p.th = cov < 0.6 ? 0.9 - cov * 0.47 : 0.618 - (cov - 0.6) * 0.85;
    p.a = sst(0.02, 0.3, cov);
    // Not all at once (owner feedback 23): the deck has the shapes of the
    // cover it goes to (or comes from), and each cloud shows once the cover
    // has come far enough for its own arrival value; on the way in the
    // upwind (right) side first, on the way out the right side clears first
    // and the rest drifts off to the left.
    p.f = cov > 0.001 ? clamp(this.coverS / cov, 0, 1) : 0;
    p.rising = this.coverS < this.coverT;
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
    const th = p.th, A = p.a, l = p.lit, s = p.sh, hz = p.hz, S = 0.62, f = p.f * 1.15, rising = p.rising;
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
        let a = sst(th - 0.01, th + 0.09, d);
        if (a < 0.01) {
          o[j + 3] = 0;
          continue;
        }
        if (f < 1.149) {
          const xr = c / dw, side = rising ? 1 - xr : xr;
          const arr = clamp((N(u * 0.6 + 31.7, w * 0.6 + 7.3) - 0.25) * 2, 0, 1) * 0.7 + side * 0.3;
          a *= sst(arr - 0.12, arr, f);
          if (a < 0.01) {
            o[j + 3] = 0;
            continue;
          }
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
    // Indoors: nothing to show, the deck waits as it is.
    if (out < 0.002 && !this.first) return;
    if (this.first) this.deckNow();
    else if (!(this.deckEmpty && this.cover < 0.02)) {
      if (this.bRow === 0) this.deckParams();
      this.bPh = Math.min(1, this.bPh + dt / (this.trans ? DECK_KEY_MOVE_S : DECK_KEY_S));
      const r1 = Math.min(rows, Math.ceil(this.bPh * rows));
      if (r1 > this.bRow) this.buildRows(this.bRow, r1);
      this.bRow = r1;
      if (this.bPh >= 1) {
        const t = this.dP;
        this.dP = this.dN;
        this.dN = t;
        const g = this.gP;
        this.gP = this.gN;
        this.gN = g;
        this.gN.putImageData(this.bimg, 0, 0);
        this.deckEmpty = this.bk.a < 0.004;
        this.bRow = 0;
        this.bPh = 0;
      }
    }
    // No text protection behind the clouds any more (owner feedback 9): the deck is fainter instead, everywhere.
    const fA = out * (0.4 + 0.6 * this.fogK) * DECK_A;
    if (fA < 0.01 || (this.deckEmpty && this.cover < 0.02)) return;
    this.moving = true;
    this.deckOn = true;
    const k = this.bPh, C = this.gC;
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
      clamp(1 - this.palW[0]! - this.palW[2]! * 0.7 - this.palW[3]! * 0.5, 0, 1) *
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
    // On the back layer it passes behind the frames; where it passes close to
    // a frame line, the line glints there and the glint runs on with it a
    // little (owner feedback 20, 24).
    if (this.T - this.lastShootGlint > 0.06 && this.glints.near(env.panes, hx, hy, 48, fade * 0.95, this.T, 0.7, 70, sh.vx * 0.25)) this.lastShootGlint = this.T;
  }

  stepMoon(env: Env, dt: number): void {
    const st = env.settled, pre = this.moonPre, wall = Date.now();
    // real seconds since the last step (frames stop in a hidden tab)
    const gap = this.moonWall ? Math.max(0, (wall - this.moonWall) / 1000) : 0;
    this.moonWall = wall;
    const ra = st.moonRiseAt, sa = st.moonSetAt;
    const cu = ra >= 0 && sa > ra ? moonClockU(wall, ra, sa) : NaN;
    const inside = cu >= -pre && cu <= 1 + pre;
    // The clock places the moon at every frame (owner item 69), unless the
    // game says it is up where the clock does not (then the event wins).
    this.moonClock = cu === cu && (inside || !st.moonUp);
    let want: boolean, tu: number, n: number;
    if (this.moonClock) {
      this.moonSet = null;
      this.fbU = NaN;
      want = inside;
      tu = cu;
      n = 1000 / (sa - ra);
    } else {
      n = env.moonSpeed / MOON_UP_S;
      const mu = st.moonU;
      if (mu !== this.moonUWas) {
        // the almanac says where the moon is (a sync): the moon goes there gently (below)
        this.moonUWas = mu;
        if (st.moonUp && mu >= 0) this.fbU = mu;
      }
      // Up without a place (start, a clock not even to the hour): already in the sky, it fades in there.
      if (st.moonUp && this.fbU !== this.fbU) this.fbU = this.u > NO_MOON ? this.u : MOON_START;
      if (this.fbU === this.fbU) this.fbU = Math.min(this.fbU + n * Math.max(dt, gap), moonHoldU(this.moonLd));
      want = st.moonUp;
      tu = this.fbU;
    }
    if (this.moonSet) {
      const s = this.moonSet, p = (this.T - s.t0) / s.dur;
      if (p >= 1) {
        this.moonSet = null;
        this.u = NO_MOON;
        this.fbU = NaN;
      } else this.u = lerp(s.u0, 1 + pre, p);
      want = true;
    } else if (want && tu === tu) {
      if (this.u <= NO_MOON || gap > MOON_GAP_S) {
        // placed at once, fading in: a page load, a sync, coming back to a hidden tab (never a rush across)
        this.u = tu;
        this.moonPres = 0;
        this.relocate = false;
      } else if (this.relocate) {
        // fading out to be placed anew; it goes on at its pace meanwhile
        this.u += n * dt;
        if (this.moonPres < 0.02) {
          this.u = tu;
          this.relocate = false;
        }
      } else {
        const g = moonGlide(this.u, tu, n, dt);
        if (g === null) this.relocate = true;
        else this.u = this.moonClock ? g : Math.min(g, moonHoldU(this.moonLd));
      }
    }
    const on = this.u > NO_MOON && want && !this.relocate ? 1 : 0;
    this.moonPres = ease(this.moonPres, on, dt, this.relocate ? 0.5 : 1.5);
    if (!on && !this.relocate && this.moonPres < 0.01) {
      this.u = NO_MOON;
      if (!want) this.fbU = NaN;
    }
  }
  /** The moon's place at the game's `u`: an even arc from below the right edge (east), high in the middle, to below the left edge (west), drawn ahead by `moonLd` (`moonVisU`). */
  moonPos(u: number): void {
    moonAt(this.mpath, moonVisU(u, this.moonLd), this.S2);
    this.mx = this.S2[0]!;
    this.my = this.S2[1]!;
  }
  drawMoon(b: Ctx, env: Env, dt: number, wSun: number, wMoon: number, wNight: number, out: number): void {
    this.stepMoon(env, dt);
    // By day it is still there when it is up, much fainter (owner feedback 11).
    const day = clamp(wSun, 0, 1);
    const light = out * clamp(wMoon + wNight * 0.65 + day * DAY_MOON, 0, 1) * (1 - this.palW[2]! * 0.8 - this.palW[3]! * 0.5);
    const tgt = Math.max(0, light) * (1 - 0.8 * sst(0.75, 1, this.cover)) * (0.35 + 0.65 * this.fogK) * (1 - 0.7 * (this.darkG || 0));
    this.moonVis = ease(this.moonVis, tgt, dt, 1.2);
    const u = this.u, mo = this.moon;
    if (u <= NO_MOON || !mo || this.moonVis * this.moonPres < 0.01) {
      this.mVisNow = 0;
      return;
    }
    this.moonPos(u);
    const x = this.mx, y = this.my;
    if (x < -mo.R * 2 || x > env.W + mo.R * 2) {
      this.mVisNow = 0;
      return;
    }
    // low down (behind the text) it is fainter, but not on its way in or out
    // at the edges: there it is at full strength through the game's rise and
    // set, taking the low rule over a tenth of its way (owner items 63, 69)
    const vu = moonVisU(u, this.moonLd);
    const L = this.moonLd;
    const low = Math.max(0.45 + 0.55 * sst(env.H * 0.8, env.H * 0.42, y), 1 - sst(L, L + 0.1, vu), sst(1 - L - 0.1, 1 - L, vu));
    const a = this.moonVis * this.moonPres * low;
    const dayK = clamp(day * 1.3, 0, 1);
    // the glow side and the frame glints follow the night moon only
    this.mVisNow = a * (1 - dayK);
    if (a < 0.01) return;
    // By day it moves ~3 px/s: not a reason to leave the still rate.
    if (dayK < 0.9) this.moving = true;
    const phase = clamp(env.settled.moonPhase, 0, 1);
    mo.relight(phase);
    const ph = 0.25 + 0.75 * phase;
    const hs = mo.R / 24;
    if (!this.th.light && dayK < 0.99) {
      b.globalAlpha = a * ph * (1 - dayK);
      b.drawImage(this.halo, x - 130 * hs, y - 130 * hs, 260 * hs, 260 * hs);
      b.globalAlpha = a * 0.55 * ph * (1 - dayK);
      b.drawImage(this.halo, x - 300 * hs, y - 300 * hs, 600 * hs, 600 * hs);
    }
    const s = mo.w / mo.S;
    if (dayK < 0.99) {
      b.globalAlpha = a * (1 - dayK);
      b.drawImage(mo.cv, x - s / 2, y - s / 2, s, s);
    }
    if (dayK > 0.01) {
      b.globalAlpha = a * dayK;
      b.drawImage(mo.dayCv, x - s / 2, y - s / 2, s, s);
    }
    b.globalAlpha = 1;
  }
  /** The moon's light on the top frame lines near it: a sharp stretch of the line (no halo), night only. */
  drawGlints(f: Ctx, env: Env): void {
    const v = this.mVisNow || 0;
    if (v < 0.02 || !this.moon || this.th.light) return;
    const R = this.moon.R * 0.6, x = this.mx, y = this.my;
    const pk = 0.3 + 0.7 * clamp(env.settled.moonPhase, 0, 1);
    f.globalCompositeOperation = this.glints.comp;
    for (const p of env.panes) {
      if (!p.border) continue;
      const dyEdge = p.y - y;
      const dx = x < p.x ? p.x - x : x > p.x + p.w ? x - (p.x + p.w) : 0;
      const near = Math.exp(-(dyEdge * dyEdge) / (R * R * 2.2)) * Math.exp(-(dx * dx) / (R * R * 5));
      const wide = 0.35 * sst(-10, 120, dyEdge) * Math.exp(-(dx * dx) / 40000);
      const a = v * pk * Math.min(1, near * 1.2 + wide) * 0.6;
      if (a < 0.02) continue;
      const cx = clamp(x, p.x + 10, p.x + p.w - 10);
      this.glints.line(f, p, 't', cx, 90 + near * 160 + wide * 200, a, near > 0.25 ? near : 0);
    }
    f.globalAlpha = 1;
    f.globalCompositeOperation = 'source-over';
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
  drawRaysFront(env: Env, p: number, I: number, G: number): void {
    const W = env.W, H = env.H, kind = this.mKind!, S = this.S, f = env.front;
    const c = this.col, rgb = `${c[0]! | 0},${c[1]! | 0},${c[2]! | 0}`;
    const wetK = 1 - 0.65 * this.wet;
    const sx = S[0]!, sy = S[1]!;
    const far = Math.hypot(Math.max(sx, W - sx), H - sy);
    const near = Math.max(0, -sy);
    const front = kind === 'rise' ? lerp(near, far * 1.05, sst(0.08, 0.75, p)) : lerp(far * 1.05, near, sst(0.1, 0.85, p));
    const bw = far * 0.28;
    const gr = f.createRadialGradient(sx, sy, Math.max(0, front - bw), sx, sy, front + bw);
    gr.addColorStop(0, `rgba(${rgb},0)`);
    gr.addColorStop(0.5, `rgba(${rgb},1)`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    // the ray front: a soft band sweeping over the screen (fainter: the beams carry the light now)
    f.globalAlpha = dith8(0.045 * G * wetK * SUN_LIGHT[kind]);
    f.fillStyle = gr;
    f.fillRect(0, 0, W, H);
    f.globalCompositeOperation = this.th.add;
    // Every framed pane: at most a faint lift of its top line (no more lit
    // lines by nearness to the sun or the ray front; owner feedback 37).
    const lift = I * wetK * this.fogK * 0.1;
    if (lift > 0.01) {
      f.fillStyle = `rgb(${rgb})`;
      f.globalAlpha = lift;
      const R = this.liftRects;
      for (const q of env.panes) {
        if (!q.border) continue;
        // the whole top rim and the nameplate with it: the plate is the
        // rim's glass and takes the same tint (owner item 42; before, only
        // the rim's lip above the title, feedback 19, 32); the rim's rounded
        // corners and the plate's fillets and lower corners followed, no
        // square corner outside the glass (owner item 45)
        R.length = 0;
        rimRects(R, q, 't', q.x, q.x + q.w, q.border, env.dpr);
        plateRects(R, q, q.x, q.x + q.w, env.dpr);
        for (let i = 0; i < R.length; i += 4) f.fillRect(R[i]!, R[i + 1]!, R[i + 2]!, R[i + 3]!);
      }
    }
    // Where a strong beam crosses a frame line, that stretch of the line
    // glints: a soft wider glow of the line and a bright core within the
    // beam's width, a sparkle where it enters the pane (owner feedback 37).
    // One strength for every glint (sunturn.ts turnGlint), so they fade in
    // and out with the rays (owner items 80, 81), each by its ray's tier.
    const gk = this.glintK * wetK * this.fogK * GLINT_CORE;
    if (gk > 0.01) {
      f.globalCompositeOperation = this.glints.comp;
      // Every thin ray glints too where it crosses a frame line (owner item
      // 68): a soft glow of the line and a brighter core, as a beam's.
      for (const r of this.rays) {
        for (const h of beamHits(env.panes, sx, sy, r, this.hits)) {
          const a = gk * r.k * h.att * (h.enter ? 1 : BEAM_EXIT);
          if (a < 0.02) continue;
          const len = clamp(h.len * 3, 36, 140);
          this.glints.line(f, h.p, h.side, h.c, len * 2, a * 0.35);
          this.glints.line(f, h.p, h.side, h.c, len, a, h.enter && a > 0.3 ? 0.6 : 0);
        }
      }
      for (let i = 0; i < this.beams.length; i++) {
        const b = this.beams[i]!;
        for (const h of beamHits(env.panes, sx, sy, b, this.hits)) {
          const a = gk * TIER_GLINT.S * b.k * h.att * (h.enter ? 1 : BEAM_EXIT) * (0.9 + 0.1 * Math.sin(this.T * 5.3 + i * 2 + h.c * 0.01));
          if (a < 0.02) continue;
          // the sprite is bright over its middle ~40 %: the core's bright part is the beam's width on the line
          const len = clamp(h.len * 1.8, 24, 220);
          this.glints.line(f, h.p, h.side, h.c, len * 2.2, a * 0.3);
          this.glints.line(f, h.p, h.side, h.c, len, a, h.enter && a > 0.2 ? 1 : 0);
        }
      }
    }
    f.globalAlpha = 1;
    f.globalCompositeOperation = 'source-over';
  }
  /**
   * The strong beams in the middle of the fan (owner feedback 37): each a
   * soft wide wedge, its body and a bright thin core, all convex triangles
   * with one gradient that fades slowly along the beam, so each reads as a
   * defined path across the screen. Drawn before the panes' shadow wedges
   * are cut, so inside and behind a pane a beam is weaker like the rays.
   */
  drawBeams(g: Ctx, env: Env, sx: number, sy: number, far: number, I: number): void {
    const bk = (this.beamK = I * (1 - 0.65 * this.wet) * this.fogK);
    if (this.beams.length !== BEAMS) this.beams = [];
    sunBeams(this.T, this.fan[0]!, this.fan[1]!, this.beams);
    // the beams come one by one as the turn builds (owner item 71)
    for (let i = 0; i < this.beams.length; i++) this.beams[i]!.k *= turnBeamOn(this.mKind ?? 'rise', i, this.turnS);
    if (bk < 0.01) return;
    const c = this.col;
    const rgb = `${(c[0]! + (255 - c[0]!) * 0.5) | 0},${(c[1]! + (255 - c[1]!) * 0.5) | 0},${(c[2]! + (255 - c[2]!) * 0.45) | 0}`;
    const L = far * 1.25;
    const gr = g.createRadialGradient(sx, sy, 0, sx, sy, L);
    gr.addColorStop(0, `rgba(${rgb},1)`);
    gr.addColorStop(0.5, `rgba(${rgb},.8)`);
    gr.addColorStop(1, `rgba(${rgb},.3)`);
    g.fillStyle = gr;
    // the pane boxes from the top line's lower edge, as the shadow wedges
    const boxes = this.boxes;
    boxes.length = 0;
    for (const q of env.panes) {
      const gp = q.plate, yt = q.y + q.border, x2 = q.x + q.w, y2 = q.y + q.h;
      // the rim's rounded lower corners count as outside: no square corner
      // of the weaker inside beam shows beyond the glass (owner item 45)
      const R = q.border && q.h - q.border > RIM_R ? Math.min(RIM_R, q.border) : 0, yb = y2 - R;
      if (R) boxes.push([q.x + R, yb, x2 - R, y2]);
      if (!gp || gp.y1 >= yb) {
        boxes.push([q.x, yt, x2, yb]);
        continue;
      }
      // less the nameplate (the rim's glass: a beam on it is as strong as on the rim; owner item 42)
      const a = Math.max(q.x, gp.x), b = Math.min(x2, gp.x + gp.w);
      boxes.push([q.x, yt, a, yb], [b, yt, x2, yb], [a, gp.y1, b, yb]);
    }
    const light = this.th.light ? 0.7 : 1, tri = this.tri, inside = this.pIn, outside = this.pOut;
    for (const b of this.beams) {
      for (const [w, al] of BEAM_LAYERS) {
        const hw = b.hw * w, a = bk * b.k * al * light;
        tri[0] = sx;
        tri[1] = sy;
        tri[2] = sx + Math.cos(b.a - hw) * L;
        tri[3] = sy + Math.sin(b.a - hw) * L;
        tri[4] = sx + Math.cos(b.a + hw) * L;
        tri[5] = sy + Math.sin(b.a + hw) * L;
        beamPieces(tri, boxes, inside, outside);
        g.globalAlpha = dith8(a);
        for (const P of outside) polyFill(g, P);
        g.globalAlpha = dith8(a * BEAM_INSIDE);
        for (const P of inside) polyFill(g, P);
      }
    }
  }
  drawRaysBack(env: Env, p: number, I: number, G: number): void {
    const W = env.W, H = env.H, kind = this.mKind!, g = env.back, S = this.S;
    const psi = sunPsi(kind, p);
    sunPoint(psi, W, H, S);
    const c = this.col;
    const rgb = `${(c[0]! + (255 - c[0]!) * 0.35) | 0},${(c[1]! + (255 - c[1]!) * 0.35) | 0},${(c[2]! + (255 - c[2]!) * 0.3) | 0}`;
    const kk = (1 - 0.65 * this.wet) * this.fogK * (kind === 'set' ? 0.75 : 1.25), k = I * kk;
    g.globalCompositeOperation = this.th.add;
    const sx = S[0]!, sy = S[1]!;
    const far = Math.hypot(Math.max(sx, W - sx), H - sy);
    const gl = g.createRadialGradient(sx, sy, 0, sx, sy, far * 0.75);
    gl.addColorStop(0, `rgba(${rgb},.5)`);
    gl.addColorStop(0.3, `rgba(${rgb},.16)`);
    gl.addColorStop(0.6, `rgba(${rgb},.06)`);
    gl.addColorStop(1, `rgba(${rgb},0)`);
    // the sun's hazy light has a curve of its own (a sunrise's comes slowly, owner item 77)
    g.globalAlpha = dith8(G * kk * SUN_LIGHT[kind]);
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
    // the fan: sideways and down from a low sun, its edges moving slowly (beams.ts turnFan, owner items 78, 79)
    turnFan(psi, sx, sy, W, H, this.fan);
    const a0 = this.fan[0]!, a1 = this.fan[1]!;
    // Few, thin, faint rays (owner feedback 30: were 15, half-widths 0.5–2.2°,
    // now 0.2–0.8°; feedback 37: fainter still, the beams below carry the light).
    // Every ray sways with the beams (one sun, owner item 68), each a little on its own.
    const T = this.T, N = TURN_RAY_N, L = far * 1.2, rays = this.rays;
    // Each ray (and its core) is its own convex triangle: Skia fills those on
    // the GPU; one path of many triangles goes to its software path renderer
    // on the GPU thread (tens of ms per frame, stage 28 E).
    const cores: number[] = [];
    for (let i = 0; i < N; i++) {
      const j = rayHash(i), a = turnRayAngle(i, a0, a1, T), tier = rayTier(i);
      // by tier (owner item 80): the middle rays a little wider than the weak ones
      const wd = (tier === 'm' ? 0.0065 : 0.0045) + j * 0.003;
      // a sunset's few rays from the start, the others fading in one by one (owner item 71); a sunrise's all with its glow (item 80)
      const on = turnRayOn(kind, i, this.turnS);
      const al = RAY_TIER[tier] * (0.85 + 0.15 * Math.sin(T * (0.5 + j) + i * 2.1)) * on;
      // kept for its glints on the frame lines (drawRaysFront), by tier
      const r = rays[i] ?? (rays[i] = { a: 0, hw: 0, k: 0 });
      r.a = a;
      r.hw = wd;
      r.k = TIER_GLINT[tier] * on;
      g.globalAlpha = dith8(k * al * RAY_ALPHA);
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(sx + Math.cos(a - wd) * L, sy + Math.sin(a - wd) * L);
      g.lineTo(sx + Math.cos(a + wd) * L, sy + Math.sin(a + wd) * L);
      g.closePath();
      g.fill();
      const ww = wd * 0.35;
      cores.push(a - ww, a + ww, on * RAY_TIER[tier]);
    }
    for (let i = 0; i < cores.length; i += 3) {
      if (cores[i + 2]! < 0.005) continue;
      g.globalAlpha = dith8(k * RAY_ALPHA * cores[i + 2]!);
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
        // From the rim's lower edge: the step between the brighter rays
        // outside and the shadow inside lies under the rim (owner feedback
        // 19, 32). The lower corners follow the rim's rounding (three points
        // on each arc), so no square corner of shadow shows outside the
        // glass (owner item 45).
        const x2 = q.x + q.w, yt = q.y + q.border, y2 = q.y + q.h;
        const R = q.border ? Math.min(RIM_R, q.border) : 0, c = R * (1 - Math.SQRT1_2);
        CX[0] = q.x;
        CY[0] = yt;
        CX[1] = x2;
        CY[1] = yt;
        CX[2] = x2;
        CY[2] = y2 - R;
        CX[3] = x2 - c;
        CY[3] = y2 - c;
        CX[4] = x2 - R;
        CY[4] = y2;
        CX[5] = q.x + R;
        CY[5] = y2;
        CX[6] = q.x + c;
        CY[6] = y2 - c;
        CX[7] = q.x;
        CY[7] = y2 - R;
        for (let i = 0; i < NB; i++) {
          const dx = CX[i]! - (sx + ox), dy = CY[i]! - sy, dl = Math.hypot(dx, dy) || 1;
          pts[i * 2] = CX[i]!;
          pts[i * 2 + 1] = CY[i]!;
          pts[2 * NB + i * 2] = CX[i]! + (dx / dl) * 4000;
          pts[2 * NB + i * 2 + 1] = CY[i]! + (dy / dl) * 4000;
        }
        const P = hull(pts);
        // The nameplate is the rim's glass: no shadow over it, so it takes
        // the sun's colour as the top rim does (owner item 42).
        const gp = q.plate;
        if (gp && P.length >= 6) {
          const d = env.dpr || 1;
          for (const Q of notchPieces(P, Math.round(gp.x * d) / d, q.y + q.border, Math.round((gp.x + gp.w) * d) / d, gp.y1)) polyFill(g, Q);
        } else if (P.length >= 6) polyFill(g, P);
      }
    }
    // The beams after the shadows: no pane hides them (owner feedback 37).
    g.globalCompositeOperation = this.th.add;
    this.drawBeams(g, env, sx, sy, far, I);
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
      // Clouds, moon and stars drift slowly; a shooting star,
      // a lightning-lit sky, sun moments and darkness bleeds move fast (and are
      // rare); a settled day sky does not move at all.
      // Day life asks for its own rate only while a flock, an insect or a glimpse is there.
      if (!sky) return FPS_SLOW;
      // Going in or out: the whole sky crossfades, smoothly at the fast rate (owner feedback 27).
      // So do the cloud cover and the palette on their way (clouds coming, day to night, rain greying the sky; owner feedback 56).
      if (sky.shoot.on || env.shared.flash > 0.01 || sky.mKind || sky.starsIn || sky.dark || sky.lift || sky.glints.active || sky.outMoving || sky.dayMoving || sky.trans) return FPS_FAST;
      const lf = sky.lifeFps;
      return sky.still > 2 ? lf || FPS_STILL : Math.max(sky.deckOn ? (env.cpu ? CLOUD_FPS_CPU : CLOUD_FPS) : FPS_SLOW, lf);
    },
    destroy() {
      sky = null;
    },
  };
}
