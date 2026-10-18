// Life in the day sky (owner feedback 22, 2026-10-17): what makes a clear
// day feel like being outdoors, kept very discreet and cheap.
//
//  - birds: now and then a flock (or a lone gull) crosses: big ones near,
//    small far-off ones that fade into the distance; slow, flapping in
//    bursts and gliding; dark silhouettes against the sky;
//  - an insect: rarely, a few seconds of a tiny darting dot;
//  - cloud tufts: a few small, soft, almost sky-coloured puffs on a clear
//    day, drifting with the wind (a few px/s);
//  - a sun glimpse: a few soft rays from the sun and a glint on the frame
//    lines they cross; at least once a minute on a clear day, most often,
//    longest and strongest at midday, fewer, shorter and fainter early and
//    late (owner feedback 52; `planGlimpse`). The sun is the day's one sun
//    (beams.ts `sunPsi`): from the top right in the morning, where the
//    sunrise left it, over to the top left where the sunset takes it (owner
//    item 65); none while a sunrise or sunset runs or is about to (item 64).
//
// Rates: tufts move a few px/s, so they are drawn at the still rate
// (FPS_STILL) without asking for more; birds ask for BIRD_FPS, an insect
// and a glimpse for FPS_SLOW, only while they are there. Sprites are built
// once on CPU canvases (paths and gradients there, ADR 0091); per frame it
// is a handful of image copies and, during a glimpse, six convex triangles.

import type { ThemeInfo } from '../palette';
import { type Ctx, type Cv, FPS_SLOW, TAU, clamp, ctx2dCpu, mkCanvas, sst } from './env';
import { BEAM_EXIT, type Beam, type BeamHit, beamHits, sunDrift, sunMid } from './beams';
import type { FrameBox, Glints } from './glint';

/** Frames per second while birds fly (slow, small things: 10 is plenty and cheap). */
export const BIRD_FPS = 10;
/** Seconds between flocks, between insects and between sun glimpses: [min, max]. */
const BIRD_GAP: [number, number] = [90, 220];
const BUG_GAP: [number, number] = [160, 380];
const FLAP_FRAMES = 6;

const rr = (a: number, b: number): number => a + Math.random() * (b - a);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Frames per second while a glimpse shines: it fades over seconds (at most ~3 levels per frame at 6 fps), so 6 is smooth and half of FPS_SLOW. */
export const GLIMPSE_FPS = 6;
/** The sun's height for a glimpse when the time of day is unknown (clock not synced): mid-morning. */
export const GLIMPSE_H_UNKNOWN = 0.6;
/**
 * A glimpse ray's alpha at its brightest (at the sun, peak 1): 0.09 / 0.07
 * before owner feedback 52, then 0.22 / 0.15, a quarter less since item 55
 * (as are the glow and the rim glints). Sunrise rays reach ~0.25, its beams 0.4.
 */
const GLIMPSE_RAY = 0.165;
const GLIMPSE_RAY_LIGHT = 0.11;
/** The glow at the sun (alpha × the glimpse's strength), dark / light pages. */
const GLIMPSE_GLOW = 0.06;
const GLIMPSE_GLOW_LIGHT = 0.045;
/** A rim glint's alpha against its ray's strength (0.5 before item 55). */
const GLIMPSE_GLINT = 0.375;

/**
 * How high the sun stands for the glimpses: 0 at the dawn and dusk hours, 1
 * at midday (`sunU` 0.5); `sunU` < 0 (not synced) counts as GLIMPSE_H_UNKNOWN.
 */
export function sunHeight(sunU: number): number {
  if (sunU < 0) return GLIMPSE_H_UNKNOWN;
  return Math.sin(Math.PI * clamp(sunU, 0, 1));
}

/** One glimpse: seconds from this glimpse's start to the next one's, how long it shines, its peak (0..1). */
export interface GlimpsePlan {
  gap: number;
  dur: number;
  peak: number;
}

/**
 * The next glimpse at the sun's place in the day (owner feedback 52): one
 * random size `q` makes it small (short, faint) or big (longer, stronger),
 * small ones more often; the sun's height `h` scales all of it. Start to
 * start, glimpses come every 50–60 s at the dawn/dusk hours and every 22–40 s
 * at midday, so one is seen at least once a minute; a glimpse lasts 5–8 s
 * early/late, 8–16 s at midday; its peak is 0.35–0.55 early/late, 0.7–1 at
 * midday.
 */
export function planGlimpse(sunU: number, rnd: () => number = Math.random): GlimpsePlan {
  const h = sunHeight(sunU), q = rnd() ** 1.4;
  return {
    gap: lerp(50, 22, h) + rnd() * lerp(10, 18, h),
    dur: lerp(5, 8, h) + q * lerp(3, 8, h),
    peak: lerp(0.35, 0.7, h) + q * lerp(0.2, 0.3, h),
  };
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
  /** Sun glimpses: the sun is out (0..1). */
  sun: number;
  /** How far the sun is through the day (protocol `sunU`: 0 dawn … 1 dusk, -1 unknown): how often and how strong the glimpses are. */
  sunU: number;
  /** Where the sun sits (CSS px; outside the screen, beams.ts `sunPoint`). */
  sx: number;
  sy: number;
  /** A sunrise or sunset runs or is about to: no glimpse starts, a running one fades out quickly (owner item 64). */
  block: boolean;
}

/** A running glimpse fades out with this time constant (s) when a sunrise or sunset blocks it. */
const GLIMPSE_BLOCK_TAU = 0.35;

export class DayLife {
  private readonly big: Cv;
  private readonly small: Cv;
  private readonly tuftSpr: Cv[];
  private tufts: Tuft[] = [];
  private flocks: Flock[] = [];
  private bug: { x: number; y: number; tx: number; ty: number; age: number; life: number; hold: number } | null = null;
  private glimpse: { t0: number; dur: number; peak: number; fade: number } | null = null;
  private readonly gRay: Beam = { a: 0, hw: 0, k: 0 };
  private readonly gHits: BeamHit[] = [];
  private nextBird = rr(20, 60);
  private nextBug = rr(60, 200);
  /** Seconds to the next glimpse's start (counted only while the sun is out); the first comes soon. */
  private nextGlimpse = rr(6, 20);
  private W = 0;
  private H = 0;
  private readonly light: boolean;
  private readonly comp: GlobalCompositeOperation;
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

  /** Something that needs more than the still rate is on (flock, insect, glimpse). */
  fps(): number {
    if (this.bug) return FPS_SLOW;
    if (this.flocks.length) return this.glimpse ? Math.max(BIRD_FPS, GLIMPSE_FPS) : BIRD_FPS;
    return this.glimpse ? GLIMPSE_FPS : 0;
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
    // A sun glimpse: the countdown runs start to start while the sun is out.
    if (k.sun > 0.4) {
      this.nextGlimpse -= dt;
      // not while a sunrise or sunset runs or is about to (owner item 64); the next one a little after
      if (k.block) this.nextGlimpse = Math.max(this.nextGlimpse, 6);
      else if (this.nextGlimpse <= 0 && !this.glimpse) {
        const g = planGlimpse(k.sunU);
        this.nextGlimpse = g.gap;
        this.glimpse = { t0: T, dur: g.dur, peak: g.peak, fade: 1 };
      }
    }
    if (this.glimpse) {
      const gl = this.glimpse, p = (T - gl.t0) / gl.dur;
      if (k.block) gl.fade *= Math.exp(-dt / GLIMPSE_BLOCK_TAU);
      if (p >= 1 || gl.fade < 0.01) this.glimpse = null;
      else this.drawGlimpse(b, f, panes, T, Math.sin(Math.PI * p) ** 2 * gl.peak * gl.fade * k.sun, k.sx, k.sy, glints);
    }
    b.globalAlpha = 1;
    return this.fps();
  }

  /** Start a glimpse now (dev / tests / the demo): a strong midday one, its peak 4 s on (within the demo's 5 s day step). */
  glimpseNow(T: number): void {
    this.glimpse = { t0: T, dur: 8, peak: 1, fade: 1 };
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

  private drawGlimpse(b: Ctx, f: Ctx, panes: readonly FrameBox[], T: number, e: number, sx: number, sy: number, glints: Glints): void {
    if (e < 0.01) return;
    const W = this.W, H = this.H;
    const rgb = this.light ? '255,214,140' : '255,240,205';
    b.globalCompositeOperation = this.comp;
    // The sun is outside the screen (beams.ts `sunPoint`): its light comes in
    // where the line from it to the screen's middle crosses the edge (`gx, gy`).
    const mid = sunMid(sx, sy, W, H), mc = Math.cos(mid), ms = Math.sin(mid);
    let tin = 0;
    if (sy < 0 && ms > 1e-6) tin = Math.max(tin, -sy / ms);
    if (sx > W && mc < -1e-6) tin = Math.max(tin, (W - sx) / mc);
    if (sx < 0 && mc > 1e-6) tin = Math.max(tin, -sx / mc);
    const gx = sx + mc * tin, gy = sy + ms * tin;
    // the sun peeking out: a soft warm glow where its light comes in
    const R0 = H * 0.42;
    const halo = b.createRadialGradient(gx, gy, 0, gx, gy, R0);
    halo.addColorStop(0, `rgba(${rgb},1)`);
    halo.addColorStop(0.35, `rgba(${rgb},0.35)`);
    halo.addColorStop(1, `rgba(${rgb},0)`);
    b.fillStyle = halo;
    b.globalAlpha = e * (this.light ? GLIMPSE_GLOW_LIGHT : GLIMPSE_GLOW);
    const hx0 = Math.max(0, gx - R0), hy0 = Math.max(0, gy - R0);
    b.fillRect(hx0, hy0, Math.min(W, gx + R0) - hx0, Math.min(H, gy + R0) - hy0);
    // the rays: strongest where they come in, reaching about two thirds down the screen
    const L = tin + H * 0.95;
    const gr = b.createRadialGradient(sx, sy, tin, sx, sy, L);
    gr.addColorStop(0, `rgba(${rgb},1)`);
    gr.addColorStop(0.3, `rgba(${rgb},0.8)`);
    gr.addColorStop(0.65, `rgba(${rgb},0.45)`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    b.fillStyle = gr;
    const RAYS = 6;
    f.globalCompositeOperation = glints.comp;
    // fanned round the sun's middle direction over most of the screen, swaying
    // together (one sun, owner item 68)
    // (0.15 rad apart for a sun at the screen's corner, as before; closer for a farther one, so the fan covers about as much)
    const near = (H * 0.6) / (tin + H * 0.6), fan = 0.15 * near;
    const drift = sunDrift(T);
    for (let i = 0; i < RAYS; i++) {
      const j = Math.sin(i * 7.31 + 1.7) * 0.5 + 0.5;
      const a = mid + (i - (RAYS - 1) / 2) * fan + (j - 0.5) * fan * 0.33 + drift + Math.sin(T * 0.21 + i) * 0.003;
      const wd = (0.008 + j * 0.012) * near;
      const al = (0.45 + 0.55 * j) * e;
      b.globalAlpha = al * (this.light ? GLIMPSE_RAY_LIGHT : GLIMPSE_RAY);
      b.beginPath();
      b.moveTo(sx, sy);
      b.lineTo(sx + Math.cos(a - wd) * L, sy + Math.sin(a - wd) * L);
      b.lineTo(sx + Math.cos(a + wd) * L, sy + Math.sin(a + wd) * L);
      b.closePath();
      b.fill();
      // where the ray's middle crosses a framed pane's line: a glint on that
      // stretch of the rim, in the rim's shape (glints.line: rounded corners,
      // the plate with the top rim; owner items 45, 49), fading along the ray
      // as the ray does; where it leaves the pane, a trace (beams.ts)
      const r = this.gRay;
      r.a = a;
      r.hw = wd;
      r.k = 1;
      for (const h of beamHits(panes, sx, sy, r, this.gHits)) {
        const fall = 1 - 0.6 * clamp((h.t - tin) / (L - tin), 0, 1);
        const ga = al * GLIMPSE_GLINT * fall * h.att * (h.enter ? 1 : BEAM_EXIT);
        if (ga < 0.01) continue;
        glints.line(f, h.p, h.side, h.c, h.side === 't' || h.side === 'b' ? 80 : 60, ga, ga > 0.24 ? 0.6 : 0);
      }
    }
    f.globalAlpha = 1;
    f.globalCompositeOperation = 'source-over';
    b.globalAlpha = 1;
    b.globalCompositeOperation = 'source-over';
  }
}

