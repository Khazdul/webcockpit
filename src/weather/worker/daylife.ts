// Life in the day sky (owner feedback 22, 2026-10-17): what makes a clear
// day feel like being outdoors, kept very discreet and cheap.
//
//  - birds: now and then a flock (or a lone gull) crosses: big ones near,
//    small far-off ones that fade into the distance; slow, flapping in
//    bursts and gliding; dark silhouettes against the sky;
//  - an insect: rarely, a few seconds of a tiny darting dot;
//  - cloud tufts: a few small, soft, almost sky-coloured puffs on a clear
//    day, drifting with the wind (a few px/s);
//  - a sun glimpse: now and then, for ~12 s, a few faint rays from the sun
//    (top right) and a faint glint on the frame lines they cross.
//
// Rates: tufts move a few px/s, so they are drawn at the still rate
// (FPS_STILL) without asking for more; birds ask for BIRD_FPS, an insect
// and a glimpse for FPS_SLOW, only while they are there. Sprites are built
// once on CPU canvases (paths and gradients there, ADR 0091); per frame it
// is a handful of image copies and, during a glimpse, six convex triangles.

import type { ThemeInfo } from '../palette';
import { type Ctx, type Cv, FPS_SLOW, TAU, clamp, ctx2dCpu, mkCanvas, sst } from './env';
import type { FrameBox, Glints } from './glint';

/** Frames per second while birds fly (slow, small things: 10 is plenty and cheap). */
export const BIRD_FPS = 10;
/** Seconds between flocks, between insects and between sun glimpses: [min, max]. */
const BIRD_GAP: [number, number] = [90, 220];
const BUG_GAP: [number, number] = [160, 380];
const GLIMPSE_GAP: [number, number] = [100, 260];
const GLIMPSE_S = 12;
const FLAP_FRAMES = 6;

const rr = (a: number, b: number): number => a + Math.random() * (b - a);

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
  /** Where the sun sits (CSS px; above the top edge). */
  sx: number;
  sy: number;
}

export class DayLife {
  private readonly big: Cv;
  private readonly small: Cv;
  private readonly tuftSpr: Cv[];
  private tufts: Tuft[] = [];
  private flocks: Flock[] = [];
  private bug: { x: number; y: number; tx: number; ty: number; age: number; life: number; hold: number } | null = null;
  private glimpse: { t0: number } | null = null;
  private nextBird = rr(20, 60);
  private nextBug = rr(60, 200);
  private nextGlimpse = rr(30, 90);
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
    if (this.bug || this.glimpse) return FPS_SLOW;
    return this.flocks.length ? BIRD_FPS : 0;
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
        const x = W * rr(0.15, 0.85), y = H * rr(0.2, 0.5);
        this.bug = { x, y, tx: x, ty: y, age: 0, life: rr(3, 5), hold: 0 };
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
    // A sun glimpse.
    if (k.sun > 0.4 && !this.glimpse) {
      this.nextGlimpse -= dt;
      if (this.nextGlimpse <= 0) {
        this.nextGlimpse = rr(GLIMPSE_GAP[0], GLIMPSE_GAP[1]);
        this.glimpse = { t0: T };
      }
    }
    if (this.glimpse) {
      const p = (T - this.glimpse.t0) / GLIMPSE_S;
      if (p >= 1) this.glimpse = null;
      else this.drawGlimpse(b, f, panes, T, Math.sin(Math.PI * p) ** 2 * k.sun, k.sx, k.sy, glints);
    }
    b.globalAlpha = 1;
    return this.fps();
  }

  /** Start a glimpse now (dev / tests). */
  glimpseNow(T: number): void {
    this.glimpse = { t0: T };
  }
  /** Send a flock now (dev / tests). */
  birdsNow(): void {
    this.spawnFlock();
  }

  private drawGlimpse(b: Ctx, f: Ctx, panes: readonly FrameBox[], T: number, e: number, sx: number, sy: number, glints: Glints): void {
    if (e < 0.01) return;
    const H = this.H, L = H * 0.9;
    const rgb = this.light ? '255,214,140' : '255,240,205';
    b.globalCompositeOperation = this.comp;
    // soft: strongest at the sun, gone well before the rays' ends
    const gr = b.createRadialGradient(sx, sy, 0, sx, sy, L);
    gr.addColorStop(0, `rgba(${rgb},1)`);
    gr.addColorStop(0.3, `rgba(${rgb},0.55)`);
    gr.addColorStop(0.65, `rgba(${rgb},0.12)`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    b.fillStyle = gr;
    const RAYS = 6;
    f.globalCompositeOperation = glints.comp;
    for (let i = 0; i < RAYS; i++) {
      const j = Math.sin(i * 7.31 + 1.7) * 0.5 + 0.5;
      // down and to the left from the top right sun
      const a = 1.78 + i * 0.12 + (j - 0.5) * 0.05 + Math.sin(T * 0.21 + i) * 0.012;
      const wd = 0.008 + j * 0.012;
      const al = (0.45 + 0.55 * j) * e;
      b.globalAlpha = al * (this.light ? 0.07 : 0.09);
      b.beginPath();
      b.moveTo(sx, sy);
      b.lineTo(sx + Math.cos(a - wd) * L, sy + Math.sin(a - wd) * L);
      b.lineTo(sx + Math.cos(a + wd) * L, sy + Math.sin(a + wd) * L);
      b.closePath();
      b.fill();
      // where the ray's middle crosses a frame's top line: a faint glint
      const s = Math.sin(a), c = Math.cos(a);
      for (const p of panes) {
        if (!p.border || p.y <= sy) continue;
        const x = sx + (c * (p.y - sy)) / s;
        if (x < p.x || x > p.x + p.w) continue;
        glints.line(f, p, 't', x, 70, al * 0.42, al > 0.6 ? 0.5 : 0);
      }
    }
    f.globalAlpha = 1;
    f.globalCompositeOperation = 'source-over';
    b.globalAlpha = 1;
    b.globalCompositeOperation = 'source-over';
  }
}

