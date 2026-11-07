// The sharp layer of the start page sky (ADR 0124): stars turning slowly
// about a pole above the top left, sparse shooting stars on clear dark
// nights, the sun (large, warm, a soft glow) and the moon (small, its
// real phase). No Milky Way (round 4: it read as white specks).
//
// This canvas lies over the sky's CSS gradients with plain source-over,
// but the approved look adds the sun's glow and the moon's halo to the sky
// ("lighter"). So each glow is a small sprite (half CSS resolution: it is
// all soft) holding a copy of the back sky round the body with the glow
// added on top, faded out at its rim where the glow is gone: over the real
// sky it gives the additive result with no edge. The sprites are rebuilt
// when the engine rewrites the sky's CSS (twice a second); the discs are
// drawn sharp every paint.

import { clamp, mix, rgba, rng, sstep } from './color';
import { type SkyScene, skyLayers } from './look';
import { paintLayers } from './paint-layers';

/** Glow sprites are this many px per CSS px. */
const GLOW_Q = 0.5;

const MAX_STARS = 1100;
const STAR_COLORS = ['#ffffff', '#bcd0ff', '#ffe2c0'];
const DAY = 1440;

export interface Parallax {
  x: number;
  y: number;
}

interface Shoot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  len: number;
}

/** A soft white dot sprite (stars, snow). */
export function glowSprite(size = 64): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d')!;
  const h = size / 2;
  const g = x.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,.55)');
  g.addColorStop(0.45, 'rgba(255,255,255,.14)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return c;
}

export class Bodies {
  /** Per star (8 floats): radius (0..1 of the field), angle, size, brightness, twinkle rate, phase, colour. */
  private readonly star: Float32Array;
  private shoots: Shoot[] = [];
  private nextShoot = 12;
  private readonly moonC: HTMLCanvasElement;
  private moonKey = '';
  private readonly sunGlow: HTMLCanvasElement;
  private readonly moonHalo: HTMLCanvasElement;
  private sunGlowOn = false;
  private moonHaloOn = false;
  private readonly dot: HTMLCanvasElement;
  /** What was painted last (CSS px), cleared before the next paint. */
  private dirty: [number, number, number, number] | null = null;

  constructor(seed = 1) {
    const R = rng(seed);
    const rows: number[][] = [];
    for (let i = 0; i < MAX_STARS; i++) {
      const rr = Math.sqrt(R());
      const m = R() ** 3;
      const s = 0.5 + m * 1.6;
      const b = 0.25 + 0.75 * R() ** 1.5 * (0.5 + m);
      const f = 0.5 + R() * 2.5;
      const p = R() * 6.28;
      const c = R() < 0.12 ? 1 : R() < 0.2 ? 2 : 0;
      rows.push([rr, R() * Math.PI * 2, s, b, f, p, c, 0]);
    }
    // the first n are drawn (n follows the area); drawn in three passes, one per colour
    this.star = new Float32Array(MAX_STARS * 8);
    rows.forEach((r, i) => this.star.set(r, i * 8));
    this.moonC = document.createElement('canvas');
    this.moonC.width = this.moonC.height = 128;
    this.dot = glowSprite(64);
    this.sunGlow = document.createElement('canvas');
    this.moonHalo = document.createElement('canvas');
  }

  /** Rebuilds the glow sprites for `s` (the sky round the sun and the moon, with their glows added). */
  refresh(s: SkyScene): void {
    const { back } = skyLayers(s);
    const { w: W, h: H } = s.view;
    const vis = 1 - s.weather.cloud * 0.8;
    this.sunGlowOn = false;
    this.moonHaloOn = false;
    if (s.sun.drawn) {
      const r = s.sun.r;
      const col = s.paint.sunColor;
      this.sunGlowOn = this.sprite(this.sunGlow, back, s.sun.x * W, s.sun.y * H, r * 9, (x, cx, cy) => {
        let g = x.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 9);
        g.addColorStop(0, rgba(col, 0.42 * vis));
        g.addColorStop(0.18, rgba(col, 0.13 * vis));
        g.addColorStop(1, rgba(col, 0));
        x.fillStyle = g;
        x.fillRect(cx - r * 9, cy - r * 9, r * 18, r * 18);
        g = x.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.9);
        g.addColorStop(0, rgba(mix(col, [255, 255, 255], 0.4), 0.5 * vis));
        g.addColorStop(1, rgba(col, 0));
        x.fillStyle = g;
        x.beginPath();
        x.arc(cx, cy, r * 1.9, 0, 7);
        x.fill();
      });
    }
    const m = s.moon;
    const ha = 0.3 * (m.level / 12) * vis * (1 - s.paint.daylight * 0.85);
    if (m.drawn && ha > 0.005) {
      const r = m.r;
      this.moonHaloOn = this.sprite(this.moonHalo, back, m.x * W, m.y * H, r * 8, (x, cx, cy) => {
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, r * 8);
        g.addColorStop(0, `rgba(200,215,255,${ha.toFixed(4)})`);
        g.addColorStop(1, 'rgba(200,215,255,0)');
        x.fillStyle = g;
        x.fillRect(cx - r * 8, cy - r * 8, r * 16, r * 16);
      });
    }
  }

  /**
   * Builds a glow sprite of radius `rad` round (cx, cy) (CSS px): the back
   * sky there, `glow` added, faded to nothing over the outer quarter.
   */
  private sprite(
    c: HTMLCanvasElement,
    back: ReturnType<typeof skyLayers>['back'],
    cx: number,
    cy: number,
    rad: number,
    glow: (x: CanvasRenderingContext2D, cx: number, cy: number) => void,
  ): boolean {
    const n = Math.max(8, Math.ceil(rad * 2 * GLOW_Q));
    if (c.width !== n) c.width = c.height = n;
    const x = c.getContext('2d');
    if (!x) return false;
    const k = n / (rad * 2);
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-over';
    x.clearRect(0, 0, n, n);
    // sprite px = (view px - (cx - rad)) * k
    x.setTransform(k, 0, 0, k, -(cx - rad) * k, -(cy - rad) * k);
    paintLayers(x, back, cx - rad, cy - rad, rad * 2, rad * 2);
    x.globalCompositeOperation = 'lighter';
    glow(x, cx, cy);
    x.globalCompositeOperation = 'destination-in';
    const m = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    m.addColorStop(0, '#000');
    m.addColorStop(0.72, '#000');
    m.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = m;
    x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    x.globalCompositeOperation = 'source-over';
    x.setTransform(1, 0, 0, 1, 0, 0);
    return true;
  }

  /** Clears what the last paint touched. */
  clear(x: CanvasRenderingContext2D): void {
    if (!this.dirty) return;
    const [x0, y0, x1, y1] = this.dirty;
    x.clearRect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4);
    this.dirty = null;
  }

  private mark(x0: number, y0: number, x1: number, y1: number): void {
    const d = this.dirty;
    this.dirty = d ? [Math.min(d[0], x0), Math.min(d[1], y0), Math.max(d[2], x1), Math.max(d[3], y1)] : [x0, y0, x1, y1];
  }

  /** True when the layer changes from frame to frame (stars twinkle or turn, a shooting star flies). */
  busy(s: SkyScene): boolean {
    return this.starVis(s) > 0.01 || this.shoots.length > 0;
  }

  private starVis(s: SkyScene): number {
    return clamp((s.paint.dark - 0.15) / 0.85) * (1 - s.weather.cloud * 0.92) * (1 - s.weather.fog * 0.6);
  }

  /** Advances the shooting stars by `dt` real seconds. */
  update(s: SkyScene, dt: number, allowShoot: boolean): void {
    const { w: W, h: H } = s.view;
    const wx = s.weather;
    if (allowShoot && s.paint.dark > 0.6 && wx.cloud < 0.25 && wx.fog < 0.3) {
      this.nextShoot -= dt;
      if (this.nextShoot <= 0) {
        const R = Math.random;
        this.nextShoot = 25 + R() * 50;
        const ang = 0.35 + R() * 0.5;
        const dir = R() < 0.5 ? 1 : -1;
        const sp = 550 + R() * 450;
        this.shoots.push({ x: W * (0.1 + 0.8 * R()), y: R() * H * 0.3, vx: Math.cos(ang) * sp * dir, vy: Math.sin(ang) * sp, life: 0, max: 0.5 + R() * 0.6, len: 70 + R() * 110 });
      }
    }
    for (const sh of this.shoots) {
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
      sh.life += dt;
    }
    if (this.shoots.length) this.shoots = this.shoots.filter((sh) => sh.life < sh.max);
  }

  /**
   * Paints the layer (after `clear`). `t` real seconds (twinkle; null =
   * still), `par` the parallax offset, `starK` the share of stars drawn.
   */
  draw(x: CanvasRenderingContext2D, s: SkyScene, t: number | null, par: Parallax, starK: number): void {
    const { w: W, h: H } = s.view;
    const hy = s.horizonY * H;
    const starV = this.starVis(s);
    if (s.moon.drawn && this.moonHaloOn) this.blit(x, this.moonHalo, s.moon.x * W - par.x * 3, s.moon.y * H - par.y * 2, s.moon.r * 8);
    if (s.sun.drawn && this.sunGlowOn) this.blit(x, this.sunGlow, s.sun.x * W - par.x * 3, s.sun.y * H - par.y * 2, s.sun.r * 9);
    if (starV > 0.01) {
      const pole = { x: W * 0.28, y: -H * 0.55 };
      const rmax = Math.hypot(W - pole.x, H - pole.y);
      const rot = ((s.g * 0.35) / DAY - Math.floor((s.g * 0.35) / DAY)) * Math.PI * 2;
      const n = Math.round(Math.min(MAX_STARS, (W * H) / 1400) * starK);
      const st = this.star;
      const fadeA = H * 0.45;
      const fadeB = H * 0.72;
      const ox = -par.x * 4;
      const oy = -par.y * 2;
      for (let cls = 0; cls < 3; cls++) {
        x.fillStyle = STAR_COLORS[cls]!;
        for (let i = 0; i < n; i++) {
          const o = i * 8;
          if (st[o + 6] !== cls) continue;
          const a = st[o + 1]! + rot;
          const r = st[o]! * rmax;
          const sx = pole.x + Math.cos(a) * r + ox;
          const sy = pole.y + Math.sin(a) * r + oy;
          if (sx < -2 || sx > W + 2 || sy < -2 || sy > hy) continue;
          const tw = t === null ? 1 : 0.65 + 0.35 * Math.sin(t * st[o + 4]! + st[o + 5]!);
          const al = st[o + 3]! * tw * starV * (1 - sstep(fadeA, fadeB, sy) * 0.7);
          if (al < 0.02) continue;
          const sz = st[o + 2]!;
          x.globalAlpha = Math.min(1, al);
          x.fillRect(sx - sz / 2, sy - sz / 2, sz, sz);
          if (sz > 1.6 && al > 0.5) {
            x.globalAlpha = al * 0.25;
            x.drawImage(this.dot, sx - 6, sy - 6, 12, 12);
          }
        }
      }
      x.globalAlpha = 1;
      this.mark(0, 0, W, hy);
      for (const sh of this.shoots) {
        const k = 1 - sh.life / sh.max;
        const d = Math.hypot(sh.vx, sh.vy);
        const tx = sh.x - (sh.vx / d) * sh.len;
        const ty = sh.y - (sh.vy / d) * sh.len;
        const g = x.createLinearGradient(sh.x, sh.y, tx, ty);
        g.addColorStop(0, `rgba(255,255,255,${(k * starV * 0.8).toFixed(3)})`);
        g.addColorStop(1, 'rgba(180,200,255,0)');
        x.strokeStyle = g;
        x.lineWidth = 1.3;
        x.beginPath();
        x.moveTo(sh.x, sh.y);
        x.lineTo(tx, ty);
        x.stroke();
        this.mark(Math.min(sh.x, tx), Math.min(sh.y, ty), Math.max(sh.x, tx), Math.max(sh.y, ty));
      }
    }
    if (s.sun.drawn) this.drawSun(x, s, par);
    if (s.moon.drawn) this.drawMoon(x, s, par);
  }

  private blit(x: CanvasRenderingContext2D, c: HTMLCanvasElement, cx: number, cy: number, rad: number): void {
    x.drawImage(c, cx - rad, cy - rad, rad * 2, rad * 2);
    this.mark(cx - rad, cy - rad, cx + rad, cy + rad);
  }

  private drawSun(x: CanvasRenderingContext2D, s: SkyScene, par: Parallax): void {
    const { w: W, h: H } = s.view;
    const r = s.sun.r;
    const sx = s.sun.x * W - par.x * 3;
    const sy = s.sun.y * H - par.y * 2;
    const vis = 1 - s.weather.cloud * 0.8;
    const col = s.paint.sunColor;
    const g = x.createRadialGradient(sx, sy - r * 0.2, 0, sx, sy, r);
    g.addColorStop(0, rgba([255, 252, 242], vis));
    g.addColorStop(0.7, rgba(mix(col, [255, 255, 255], 0.55), vis));
    g.addColorStop(1, rgba(mix(col, [255, 255, 255], 0.2), vis));
    x.fillStyle = g;
    x.beginPath();
    x.arc(sx, sy, r, 0, 7);
    x.fill();
    this.mark(sx - r, sy - r, sx + r, sy + r);
  }

  private moonSprite(s: SkyScene): HTMLCanvasElement {
    const m = s.moon;
    const day = s.paint.daylight;
    const key = `${m.level}|${m.waxing}|${Math.round(day * 20)}`;
    if (key === this.moonKey) return this.moonC;
    this.moonKey = key;
    const c = this.moonC.getContext('2d')!;
    const R0 = 56;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, 128, 128);
    c.translate(64, 64);
    // the unlit part, faintly (night only)
    c.fillStyle = `rgba(60,70,100,${(0.25 * (1 - day)).toFixed(3)})`;
    c.beginPath();
    c.arc(0, 0, R0, 0, 7);
    c.fill();
    const k = m.level / 12;
    c.save();
    c.beginPath();
    c.arc(0, 0, R0, 0, 7);
    c.clip();
    c.fillStyle = '#f2f0e6';
    const sgn = m.waxing ? 1 : -1;
    const ex = R0 * Math.abs(1 - 2 * k);
    c.beginPath();
    c.arc(0, 0, R0, -Math.PI / 2, Math.PI / 2, sgn < 0);
    c.ellipse(0, 0, ex, R0, 0, Math.PI / 2, -Math.PI / 2, k > 0.5 === sgn < 0);
    c.fill();
    // a few soft maria
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = 'rgba(130,135,150,.14)';
    for (const [a, b, rr] of [[-14, -18, 14], [10, -6, 18], [-6, 18, 12], [22, 20, 8], [-26, 4, 9]] as const) {
      c.beginPath();
      c.arc(a, b, rr, 0, 7);
      c.fill();
    }
    c.restore();
    return this.moonC;
  }

  private drawMoon(x: CanvasRenderingContext2D, s: SkyScene, par: Parallax): void {
    const { w: W, h: H } = s.view;
    const m = s.moon;
    const mx = m.x * W - par.x * 3;
    const my = m.y * H - par.y * 2;
    const vis = 1 - s.weather.cloud * 0.8;
    const sprite = this.moonSprite(s);
    x.globalAlpha = vis * (1 - s.paint.daylight * 0.55);
    const sz = (m.r * 128) / 56;
    x.drawImage(sprite, mx - sz / 2, my - sz / 2, sz, sz);
    x.globalAlpha = 1;
    this.mark(mx - sz / 2, my - sz / 2, mx + sz / 2, my + sz / 2);
  }
}
