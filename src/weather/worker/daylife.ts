// Life in the day sky (owner feedback 22, 2026-10-17): what makes a clear
// day feel like being outdoors, kept very discreet and cheap.
//
//  - birds: now and then a flock (or a lone gull) crosses: big ones near,
//    small far-off ones that fade into the distance; slow, flapping in
//    bursts and gliding; dark silhouettes against the sky;
//  - an insect: rarely, a few seconds of a tiny darting dot;
//  - cloud tufts: a few small, soft, almost sky-coloured puffs on a clear
//    day, drifting with the wind (a few px/s);
//  - the sun's rays: a few soft rays from the sun that pulse slowly (about
//    every 20 s) between nothing and only just perceptible, a little more at
//    midday (owner item 73; `pulseStrength`), spread wide round the sun's
//    direction and fading down the screen (item 82); no glints (they would draw the
//    eye). The sun is the day's one sun (beams.ts `sunPsi`): from the top
//    right in the morning, where the sunrise left it, over to the top left
//    where the sunset takes it (owner item 65); none while a sunrise or
//    sunset runs or is about to (item 64).
//
// Rates: tufts move a few px/s, so they are drawn at the still rate
// (FPS_STILL) without asking for more, and so is the pulse: it changes by
// under 0.003 alpha per frame at that rate; birds ask for BIRD_FPS, an
// insect for FPS_SLOW, only while they are there. Sprites are built
// once on CPU canvases (paths and gradients there, ADR 0091); per frame it
// is a handful of image copies and, during a glimpse, nine convex triangles.
//
// The pulse's light is dithered (owner item 84): at its peak a ray adds only
// a few 8-bit levels to the sky (its alpha about 0.026, the glow's 0.01), so
// each level came or went at once over the whole ray or glow, and the last
// step to 0 could be seen. The rays and the glow are now filled from textures
// made once that hold the light at the pulse's peak, randomly rounded and
// varied from pixel to pixel (× 0.5 … 1, fixed on the screen), drawn at
// globalAlpha (the pulse) 0 … 1: each pixel takes its last step at its own
// moment, so the light comes and goes pixel by pixel over seconds. (A
// texture at full alpha under a tiny globalAlpha did not help: that alpha is
// itself 8-bit, and the whole glow stepped with it.)

import type { ThemeInfo } from '../palette';
import { type Ctx, type Cv, FPS_SLOW, TAU, clamp, ctx2dCpu, mkCanvas, sst } from './env';
import { sunDrift, sunMid } from './beams';
import type { FrameBox, Glints } from './glint';

/** Frames per second while birds fly (slow, small things: 10 is plenty and cheap). */
export const BIRD_FPS = 10;
/** Seconds between flocks, between insects and between sun glimpses: [min, max]. */
const BIRD_GAP: [number, number] = [90, 220];
const BUG_GAP: [number, number] = [160, 380];
const FLAP_FRAMES = 6;

const rr = (a: number, b: number): number => a + Math.random() * (b - a);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** The sun's height for the pulse when the time of day is unknown (clock not synced): mid-morning. */
export const GLIMPSE_H_UNKNOWN = 0.6;
/**
 * A ray's alpha at full strength (at the sun, strength 1): the glimpse's
 * since item 55. The pulse reaches only PULSE_HIGH of it at midday.
 */
export const GLIMPSE_RAY = 0.132;
const GLIMPSE_RAY_LIGHT = 0.088;
/** The glow where the light comes in (alpha × the strength), dark / light pages. */
const GLIMPSE_GLOW = 0.048;
const GLIMPSE_GLOW_LIGHT = 0.036;
/** The dither textures' alpha: 0.5 … 1 (mean 0.75), so with the values above the light is 0.6 of before (owner item 84: subtler; was 0.165 / 0.11, 0.06 / 0.045). */
const DITHER_MIN = 0.5;
/** The glow's texture at this share of the screen's size (drawn scaled up, unsmoothed: blocks of 2 px still dither). */
const GLOW_TEX_K = 0.5;
/** The pulse's peak strength: at the dawn and dusk hours, and at midday (only just perceptible; by eye, owner items 73, 82: was 0.14 and 0.3). */
export const PULSE_LOW = 0.1;
export const PULSE_HIGH = 0.2;
/**
 * The day rays' tiers across their fan (owner item 82, as item 80's): S a
 * little stronger, m a little weaker, w much weaker, interleaved; nine
 * (item 84, was six; and six within about ±0.4 rad before item 82).
 */
const DAY_TIERS = 'wSmwSwmSw';
const DAY_TIER_K: Readonly<Record<string, number>> = { S: 1, m: 0.7, w: 0.4 };
export const DAY_RAYS = DAY_TIERS.length;
/** Half the day rays' fan, radians (its outer rays a place in): for a sun above the top right of the middle, from about 30° below level at the left to 60° at the right (owner item 82). */
export const DAY_FAN = (55 * Math.PI) / 180;

/** Day ray `i`'s angle at time T round the sun's middle direction `mid` (beams.ts `sunMid`): evenly over ±DAY_FAN, a little off its place, swaying with the sun (item 68). */
export function dayRayAngle(i: number, mid: number, T: number): number {
  const j = Math.sin(i * 7.31 + 1.7) * 0.5 + 0.5;
  const at = (i + 0.5 + (j - 0.5) * 0.3) / DAY_RAYS;
  return mid + DAY_FAN * (2 * at - 1) + sunDrift(T) + Math.sin(T * 0.21 + i) * 0.003;
}
/** The pulse's period, s, and how much it varies from one to the next (± share). */
export const PULSE_S = 20;
const PULSE_VARY = 0.15;

/**
 * How high the sun stands for the pulse: 0 at the dawn and dusk hours, 1
 * at midday (`sunU` 0.5); `sunU` < 0 (not synced) counts as GLIMPSE_H_UNKNOWN.
 */
export function sunHeight(sunU: number): number {
  if (sunU < 0) return GLIMPSE_H_UNKNOWN;
  return Math.sin(Math.PI * clamp(sunU, 0, 1));
}

/**
 * The day sky's rays at phase `ph` (0..1 through one pulse) and the sun's
 * place in the day (owner item 73): a slow swell between nothing and only
 * just perceptible, a little more at midday.
 */
export function pulseStrength(ph: number, sunU: number): number {
  const s = Math.sin(Math.PI * (ph - Math.floor(ph)));
  return lerp(PULSE_LOW, PULSE_HIGH, sunHeight(sunU)) * s * s;
}

interface Bird {
  dx: number;
  dy: number;
  ph: number;
  rate: number;
}
interface Flock {
  big: boolean;
  x: number;
  y: number;
  vx: number;
  age: number;
  /** Seconds it stays (small, far flocks fade into the distance); Infinity: until it leaves the screen. */
  life: number;
  birds: Bird[];
}
interface Tuft {
  u: number;
  v: number;
  spr: number;
  a: number;
}

/** A bird silhouette strip: FLAP_FRAMES frames side by side, wings from up to down. */
function birdStrip(span: number, light: boolean): Cv {
  const fw = Math.ceil(span + 4), fh = Math.ceil(span * 0.8 + 4);
  const c = mkCanvas(fw * FLAP_FRAMES, fh), g = ctx2dCpu(c);
  g.strokeStyle = light ? 'rgb(56,64,80)' : 'rgb(14,20,32)';
  g.fillStyle = g.strokeStyle;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = Math.max(1.1, span / 11);
  for (let i = 0; i < FLAP_FRAMES; i++) {
    const ang = 0.62 - (1.1 * i) / (FLAP_FRAMES - 1); // radians: up … down
    const cx = fw * i + fw / 2, cy = fh / 2, h = span / 2;
    // the tips droop a little below the elbows: a gull's bent wing, also when gliding
    const tipY = cy - Math.sin(ang) * h * 0.7 + h * 0.1, elbowY = cy - Math.sin(ang) * h * 0.38 - h * 0.12;
    g.beginPath();
    g.moveTo(cx - h, tipY);
    g.quadraticCurveTo(cx - h * 0.45, elbowY, cx, cy);
    g.quadraticCurveTo(cx + h * 0.45, elbowY, cx + h, tipY);
    g.stroke();
    g.beginPath();
    g.ellipse(cx, cy + span * 0.03, Math.max(0.8, span * 0.07), Math.max(0.7, span * 0.05), 0, 0, TAU);
    g.fill();
  }
  return c;
}

/** A soft tuft: overlapping flattened blobs along a line, highest in the middle, a flatter bottom. */
function tuftSprite(w: number, h: number, seed: number, light: boolean): Cv {
  const c = mkCanvas(w, h), g = ctx2dCpu(c);
  let s = seed;
  const R = (): number => ((s = (s * 16807) % 2147483647) / 2147483647);
  const rgb = light ? '255,255,255' : '238,244,255';
  const n = 9;
  for (let i = 0; i < n; i++) {
    const q = (i + 0.5) / n, mid = Math.sin(Math.PI * q);
    const cx = w * (0.27 + 0.46 * q) + (R() - 0.5) * w * 0.04;
    const r = h * (0.18 + 0.2 * mid) * (0.8 + 0.4 * R());
    const cy = h * 0.62 - r * 0.35 * mid;
    g.setTransform(1.9, 0, 0, 1, cx * (1 - 1.9), 0);
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, `rgba(${rgb},0.2)`);
    gr.addColorStop(0.5, `rgba(${rgb},0.11)`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr;
    g.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}

export interface DayInput {
  /** Birds and insects: day, outdoors, not in heavy weather (0..1). */
  life: number;
  /** Cloud tufts: a clear day sky (0..1). */
  tufts: number;
  /** The sun's rays: the sun is out (0..1). */
  sun: number;
  /** How far the sun is through the day (protocol `sunU`: 0 dawn … 1 dusk, -1 unknown): how strong the pulse is. */
  sunU: number;
  /** Where the sun sits (CSS px; outside the screen, beams.ts `sunPoint`). */
  sx: number;
  sy: number;
  /** A sunrise or sunset runs or is about to: the pulse fades out quickly and stays out (owner item 64). */
  block: boolean;
}

/** The pulse fades out with this time constant (s) when a sunrise or sunset blocks it, and back in over this much more. */
const GLIMPSE_BLOCK_TAU = 0.35;
const PULSE_BACK_TAU = 4;

export class DayLife {
  private readonly big: Cv;
  private readonly small: Cv;
  private readonly tuftSpr: Cv[];
  private tufts: Tuft[] = [];
  private flocks: Flock[] = [];
  private bug: { x: number; y: number; tx: number; ty: number; age: number; life: number; hold: number } | null = null;
  /** The pulse: its phase (0..1 per pulse), this pulse's length (s) and how much of it is let through (0 while a turn holds it back). */
  private pulsePh = Math.random();
  private pulseLen = PULSE_S;
  private pulseOn = 1;
  private nextBird = rr(20, 60);
  private nextBug = rr(60, 200);
  private W = 0;
  private H = 0;
  private readonly light: boolean;
  private readonly comp: GlobalCompositeOperation;
  /** The dithered textures (owner item 84): the rays' (fading down the screen) and the glow's, for this H. */
  private rayTex: Cv | null = null;
  private glowTex: Cv | null = null;
  private texH = 0;
  /** The wind's drift (px/s, negative: toward the left, as the clouds drift). */
  wind = -2.4;

  constructor(th: ThemeInfo) {
    this.light = th.light;
    this.comp = th.add;
    this.big = birdStrip(20, th.light);
    this.small = birdStrip(9, th.light);
    this.tuftSpr = [
      tuftSprite(150, 32, 11, th.light),
      tuftSprite(110, 26, 23, th.light),
      tuftSprite(180, 36, 37, th.light),
      tuftSprite(90, 22, 41, th.light),
    ];
  }

  resize(W: number, H: number): void {
    this.W = W;
    this.H = H;
    // A few tufts at fixed relative places in the upper sky.
    this.tufts = [
      { u: 0.18, v: 0.1, spr: 0, a: 0.85 },
      { u: 0.47, v: 0.19, spr: 1, a: 0.7 },
      { u: 0.71, v: 0.07, spr: 2, a: 0.75 },
      { u: 0.9, v: 0.24, spr: 3, a: 0.6 },
    ];
  }

  /** Something that needs more than the still rate is on (flock, insect; the pulse does not). */
  fps(): number {
    if (this.bug) return FPS_SLOW;
    if (this.flocks.length) return BIRD_FPS;
    return 0;
  }

  private spawnFlock(): void {
    const W = this.W, H = this.H, big = Math.random() < 0.45, ltr = Math.random() < 0.5;
    const n = big ? (Math.random() < 0.4 ? 1 : 2 + Math.floor(Math.random() * 3)) : 3 + Math.floor(Math.random() * 5);
    const sp = big ? rr(30, 46) : rr(16, 26);
    const birds: Bird[] = [];
    for (let i = 0; i < n; i++) {
      // a loose V behind the leader
      const k = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
      const gap = big ? 22 : 11;
      birds.push({ dx: -Math.abs(k) * gap * rr(0.8, 1.2), dy: k * gap * 0.55 * rr(0.7, 1.3), ph: Math.random() * 10, rate: rr(2.2, 3.4) });
    }
    this.flocks.push({
      big,
      x: big ? (ltr ? -40 : W + 40) : W * rr(0.1, 0.9),
      y: H * (big ? rr(0.08, 0.36) : rr(0.05, 0.24)),
      vx: ltr ? sp : -sp,
      age: 0,
      life: big ? Infinity : rr(24, 36),
      birds,
    });
  }

  /**
   * Draws onto `b` (back: birds, tufts, glimpse rays) and `f` (front: glints
   * on the frames), returns the rate it needs now (0: still).
   */
  frame(b: Ctx, f: Ctx, panes: readonly FrameBox[], T: number, dt: number, k: DayInput, glints: Glints): number {
    const W = this.W, H = this.H;
    // Tufts: drift with the wind, wrap around.
    if (k.tufts > 0.01) {
      for (const t of this.tufts) {
        t.u += (this.wind * dt) / W;
        const spr = this.tuftSpr[t.spr]!;
        if (t.u < -spr.width / W) t.u += 1 + (2 * spr.width) / W;
        b.globalAlpha = k.tufts * t.a * (this.light ? 0.7 : 0.42);
        b.drawImage(spr, t.u * W, t.v * H);
      }
    }
    // Birds.
    if (k.life > 0.3) {
      this.nextBird -= dt;
      if (this.nextBird <= 0) {
        this.nextBird = rr(BIRD_GAP[0], BIRD_GAP[1]);
        this.spawnFlock();
      }
      this.nextBug -= dt;
      if (this.nextBug <= 0) {
        this.nextBug = rr(BUG_GAP[0], BUG_GAP[1]);
        this.insectNow();
      }
    }
    for (let i = this.flocks.length - 1; i >= 0; i--) {
      const fl = this.flocks[i]!;
      fl.age += dt;
      fl.x += fl.vx * dt;
      const strip = fl.big ? this.big : this.small, fw = strip.width / FLAP_FRAMES, fh = strip.height;
      const gone = fl.vx > 0 ? fl.x - 200 > W : fl.x + 200 < 0;
      if (gone || fl.age > fl.life) {
        this.flocks.splice(i, 1);
        continue;
      }
      const fade = Number.isFinite(fl.life) ? sst(0, 4, fl.age) * (1 - sst(fl.life - 6, fl.life, fl.age)) : 1;
      const a = k.life * fade * (fl.big ? 0.55 : 0.38);
      if (a < 0.01) continue;
      const dir = fl.vx > 0 ? 1 : -1;
      for (const bd of fl.birds) {
        // flap in bursts, glide in between
        const cyc = (T * 0.33 + bd.ph) % 1, flap = cyc < 0.45;
        const fi = flap ? Math.floor(((T * bd.rate + bd.ph) % 1) * FLAP_FRAMES) : 1;
        const x = fl.x + bd.dx * dir, y = fl.y + bd.dy + Math.sin(T * 0.7 + bd.ph) * (fl.big ? 3 : 1.5);
        b.globalAlpha = a;
        b.drawImage(strip, fi * fw, 0, fw, fh, Math.round(x - fw / 2), Math.round(y - fh / 2), fw, fh);
      }
    }
    // An insect: hovers, darts to a near spot, hovers again.
    const bug = this.bug;
    if (bug) {
      bug.age += dt;
      if (bug.age > bug.life) this.bug = null;
      else {
        bug.hold -= dt;
        if (bug.hold <= 0) {
          bug.tx = clamp(bug.x + rr(-90, 90), 0, W);
          bug.ty = clamp(bug.y + rr(-50, 50), 0, H * 0.6);
          bug.hold = rr(0.4, 1.1);
        }
        bug.x += (bug.tx - bug.x) * Math.min(1, dt * 7);
        bug.y += (bug.ty - bug.y) * Math.min(1, dt * 7);
        const a = k.life * sst(0, 0.5, bug.age) * (1 - sst(bug.life - 0.6, bug.life, bug.age)) * 0.6;
        b.globalAlpha = a;
        b.fillStyle = this.light ? 'rgb(60,62,70)' : 'rgb(20,24,30)';
        const x = Math.round(bug.x + Math.sin(T * 23) * 1.2), y = Math.round(bug.y + Math.cos(T * 19) * 1.2);
        b.fillRect(x, y, 2, 2);
        b.globalAlpha = a * 0.35;
        b.fillStyle = this.light ? 'rgb(120,124,136)' : 'rgb(200,210,225)';
        b.fillRect(x - 1, y - 1, 1, 1);
        b.fillRect(x + 2, y - 1, 1, 1);
      }
    }
    // The sun's rays pulse slowly (owner item 73), a little irregularly; not
    // while a sunrise or sunset runs or is about to (owner item 64).
    this.pulsePh += dt / this.pulseLen;
    if (this.pulsePh >= 1) {
      this.pulsePh -= 1;
      this.pulseLen = PULSE_S * (1 + (Math.random() * 2 - 1) * PULSE_VARY);
    }
    this.pulseOn = k.block ? this.pulseOn * Math.exp(-dt / GLIMPSE_BLOCK_TAU) : Math.min(1, this.pulseOn + dt / PULSE_BACK_TAU);
    const e = pulseStrength(this.pulsePh, k.sunU) * this.pulseOn * k.sun;
    if (e > 0.003) this.drawGlimpse(b, T, e, k.sx, k.sy);
    b.globalAlpha = 1;
    return this.fps();
  }

  /** The pulse's peak in about 2 s (dev / the demo: the `glimpse` event). */
  glimpseNow(): void {
    this.pulsePh = 0.4;
    this.pulseOn = 1;
  }
  /** Send a flock now (dev / tests). */
  birdsNow(): void {
    this.spawnFlock();
  }
  /** An insect now (dev / the demo). */
  insectNow(): void {
    const x = this.W * rr(0.15, 0.85), y = this.H * rr(0.2, 0.5);
    this.bug = { x, y, tx: x, ty: y, age: 0, life: rr(3, 5), hold: 0 };
  }

  /** Builds the dithered textures for this H (once per size; CPU canvas, ADR 0091). */
  private textures(): void {
    const H = this.H;
    if (this.texH === H && this.rayTex) return;
    this.texH = H;
    const [r, g, bl] = this.light ? [255, 214, 140] : [255, 240, 205];
    const dith = (): number => DITHER_MIN + (1 - DITHER_MIN) * Math.random();
    // the light at the pulse's peak, rounded at random (a share of the pixels one level up)
    const lvl = (v: number): number => Math.min(255, Math.floor(255 * v * dith() + Math.random()));
    const ray = PULSE_HIGH * (this.light ? GLIMPSE_RAY_LIGHT : GLIMPSE_RAY), glow = PULSE_HIGH * (this.light ? GLIMPSE_GLOW_LIGHT : GLIMPSE_GLOW);
    // the rays': strongest at the top, fading down the screen, gone about three
    // quarters down (owner item 82; was by the distance from the sun); repeated across
    const RH = Math.ceil(H * 0.78) + 1, RW = 256;
    const fall = (v: number): number => (v < 0.3 ? 1 - (0.4 * v) / 0.3 : v < 0.65 ? 0.6 - (0.4 * (v - 0.3)) / 0.35 : Math.max(0, 0.2 - (0.2 * (v - 0.65)) / 0.35));
    const rc = mkCanvas(RW, RH), rx = ctx2dCpu(rc), ri = rx.createImageData(RW, RH);
    for (let y = 0; y < RH; y++) {
      const f = fall(y / (H * 0.78));
      for (let x = 0; x < RW; x++) {
        const o = (y * RW + x) * 4;
        ri.data[o] = r;
        ri.data[o + 1] = g;
        ri.data[o + 2] = bl;
        ri.data[o + 3] = lvl(ray * f);
      }
    }
    rx.putImageData(ri, 0, 0);
    this.rayTex = rc;
    // the glow's: 1 at the middle, 0.35 at 0.35 of its radius, 0 at its edge
    const GR = Math.ceil(H * 0.42 * GLOW_TEX_K), GS = GR * 2;
    const gc = mkCanvas(GS, GS), gx = ctx2dCpu(gc), gi = gx.createImageData(GS, GS);
    for (let y = 0; y < GS; y++) {
      for (let x = 0; x < GS; x++) {
        const d = Math.hypot(x + 0.5 - GR, y + 0.5 - GR) / GR;
        const f = d < 0.35 ? 1 - (0.65 * d) / 0.35 : Math.max(0, 0.35 * (1 - (d - 0.35) / 0.65));
        const o = (y * GS + x) * 4;
        gi.data[o] = r;
        gi.data[o + 1] = g;
        gi.data[o + 2] = bl;
        gi.data[o + 3] = lvl(glow * f);
      }
    }
    gx.putImageData(gi, 0, 0);
    this.glowTex = gc;
  }

  private drawGlimpse(b: Ctx, T: number, e: number, sx: number, sy: number): void {
    const W = this.W, H = this.H;
    this.textures();
    b.globalCompositeOperation = this.comp;
    // The sun is outside the screen (beams.ts `sunPoint`): its light comes in
    // where the line from it to the screen's middle crosses the edge (`gx, gy`).
    const mid = sunMid(sx, sy, W, H), mc = Math.cos(mid), ms = Math.sin(mid);
    let tin = 0;
    if (sy < 0 && ms > 1e-6) tin = Math.max(tin, -sy / ms);
    if (sx > W && mc < -1e-6) tin = Math.max(tin, (W - sx) / mc);
    if (sx < 0 && mc > 1e-6) tin = Math.max(tin, -sx / mc);
    const gx = sx + mc * tin, gy = sy + ms * tin;
    // the sun peeking out: a soft warm glow where its light comes in (dithered, item 84)
    const R0 = H * 0.42;
    // the textures hold the peak's light: the pulse is their share, 0 … 1
    const k = Math.min(1, e / PULSE_HIGH);
    b.globalAlpha = k;
    const sm = b.imageSmoothingEnabled;
    b.imageSmoothingEnabled = false;
    b.drawImage(this.glowTex!, gx - R0, gy - R0, R0 * 2, R0 * 2);
    b.imageSmoothingEnabled = sm;
    // the rays: their texture fades down the screen (item 82), dithered (item 84)
    const L = tin + H * 1.6;
    const pat = b.createPattern(this.rayTex!, 'repeat-x');
    if (!pat) return;
    b.fillStyle = pat;
    // spread wide round the sun's middle direction, a few, by tier (owner
    // item 82), swaying together (one sun, owner item 68)
    const near = (H * 0.6) / (tin + H * 0.6);
    for (let i = 0; i < DAY_RAYS; i++) {
      const j = Math.sin(i * 7.31 + 1.7) * 0.5 + 0.5, tier = DAY_TIERS[i]!;
      const a = dayRayAngle(i, mid, T);
      const wd = (tier === 'w' ? 0.008 : 0.012 + j * 0.004) * near;
      b.globalAlpha = DAY_TIER_K[tier]! * k;
      b.beginPath();
      b.moveTo(sx, sy);
      b.lineTo(sx + Math.cos(a - wd) * L, sy + Math.sin(a - wd) * L);
      b.lineTo(sx + Math.cos(a + wd) * L, sy + Math.sin(a + wd) * L);
      b.closePath();
      b.fill();
    }
    b.globalAlpha = 1;
    b.globalCompositeOperation = 'source-over';
  }
}

