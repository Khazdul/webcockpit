// The front layer of the start page sky (ADR 0124): rain and snow over
// the whole screen (they settle on nothing), the lightning bolt and its
// flash in a storm. Rain is light, thin and unobtrusive; snow drifts with
// the west wind and sways. A still sky (frozen, reduced motion) shows the
// particles where they stand.

import { type Rgb, hex, lerp, mix, rgba, rng, sstep, vnoise } from './color';
import type { SkyScene } from './look';
import type { Parallax } from './bodies';
import type { Sprite } from './sprite';

const MAX_DROPS = 380;
const MAX_FLAKES = 420;

interface Bolt {
  pts: [number, number][];
  br: [number, number][][];
  t: number;
  p: number;
}

export class Precip {
  /** Per drop: x, y, depth. Per flake: x, y, depth, sway phase. In CSS px of the last view. */
  private readonly drops = new Float32Array(MAX_DROPS * 3);
  private readonly flakes = new Float32Array(MAX_FLAKES * 4);
  private readonly R: () => number;
  private W = 0;
  private H = 0;
  private bolt: Bolt | null = null;
  private nextBolt = 3;
  /** Lightning flash now (0..1). */
  flash = 0;
  private gust = 0;
  private painted = false;

  constructor(
    private readonly dot: Sprite,
    seed = 7,
  ) {
    this.R = rng(seed);
  }

  /** Spreads the particles over a view (on mount and resize). */
  layout(W: number, H: number): void {
    const R = this.R;
    if (this.W > 0 && this.H > 0) {
      // keep them where they are, scaled
      const kx = W / this.W;
      const ky = H / this.H;
      for (let i = 0; i < MAX_DROPS; i++) {
        this.drops[i * 3]! *= kx;
        this.drops[i * 3 + 1]! *= ky;
      }
      for (let i = 0; i < MAX_FLAKES; i++) {
        this.flakes[i * 4]! *= kx;
        this.flakes[i * 4 + 1]! *= ky;
      }
    } else {
      for (let i = 0; i < MAX_DROPS; i++) this.drops.set([R() * W, R() * H, R()], i * 3);
      for (let i = 0; i < MAX_FLAKES; i++) this.flakes.set([R() * W, R() * H, R() ** 1.6, R() * 6.28], i * 4);
    }
    this.W = W;
    this.H = H;
  }

  /** True when the layer has anything to show. */
  active(s: SkyScene): boolean {
    return s.weather.rain > 0.02 || s.weather.snow > 0.02 || this.flash > 0.02 || this.bolt !== null;
  }

  /** True when something was painted last time (so the canvas needs a clear). */
  get dirty(): boolean {
    return this.painted;
  }

  /** The wind's push to the right now (−1..1). */
  private windX(s: SkyScene, t: number): number {
    const base = s.weather.wind;
    const n = (vnoise(t * 0.07, 72) * 2 + vnoise(t * 0.145 + 31.7, 72)) / 3;
    this.gust = sstep(0.5, 0.78, n) * (0.25 + base);
    return base + this.gust * 0.6;
  }

  /**
   * Moves the particles by `dt` real seconds and paints the layer into
   * `x` (cleared first). `t` real seconds; `still`: nothing moves, no
   * lightning; `k` the share of particles drawn.
   */
  draw(x: CanvasRenderingContext2D, s: SkyScene, t: number, dt: number, par: Parallax, still: boolean, k: number): void {
    const W = this.W;
    const H = this.H;
    x.clearRect(0, 0, W, H);
    this.painted = false;
    const wx = s.weather;
    if (!still) this.storm(s, dt);
    else this.flash = 0;
    if (!this.active(s)) return;
    this.painted = true;
    const R = this.R;
    const wnd = this.windX(s, t);
    const lit: Rgb = mix(mix(hex('#3a4458'), hex('#c8d2de'), s.paint.daylight), s.paint.light, 0.2);
    const step = still ? 0 : Math.min(dt, 0.05);
    if (this.flash > 0.02) {
      x.fillStyle = `rgba(195,205,255,${(this.flash * 0.25).toFixed(3)})`;
      x.fillRect(0, 0, W, H);
    }
    if (this.bolt && this.flash > 0.02) this.drawBolt(x, par);
    if (wx.rain > 0.02) {
      const n = Math.floor(MAX_DROPS * k * wx.rain);
      const slant = 0.12 + wnd * 0.5;
      const d = this.drops;
      for (let pass = 0; pass < 2; pass++) {
        x.strokeStyle = rgba(lit, (pass ? 0.22 : 0.11) * (this.flash > 0.1 ? 1.7 : 1));
        x.lineWidth = pass ? 1 : 0.7;
        x.beginPath();
        for (let i = 0; i < n; i++) {
          const o = i * 3;
          const z = d[o + 2]!;
          if (z > 0.6 !== !!pass) continue;
          const sp = 800 * (0.65 + z * 0.6);
          const len = 7 + z * 15;
          let dx = d[o]!;
          let dy = d[o + 1]!;
          dy += sp * step;
          dx += sp * slant * step;
          if (dy > H) {
            dy = -20;
            dx = R() * (W + 200) - 100;
          }
          if (dx > W + 20) dx -= W + 40;
          if (dx < -20) dx += W + 40;
          d[o] = dx;
          d[o + 1] = dy;
          x.moveTo(dx, dy);
          x.lineTo(dx - len * slant, dy - len);
        }
        x.stroke();
      }
    }
    if (wx.snow > 0.02) {
      const n = Math.floor(MAX_FLAKES * k * wx.snow);
      const sl = mix(lit, [255, 255, 255], 0.4 + 0.3 * s.paint.daylight);
      x.fillStyle = rgba(sl, 0.9);
      const f = this.flakes;
      for (let i = 0; i < n; i++) {
        const o = i * 4;
        const z = f[o + 2]!;
        let fx = f[o]!;
        let fy = f[o + 1]!;
        if (step > 0) {
          const sp = 26 + z * 60;
          fy += sp * step;
          f[o + 3]! += step * (0.6 + z);
          fx += (Math.sin(f[o + 3]!) * 12 + 40 * wnd) * step * (0.4 + z);
          if (fy > H + 6) {
            fy = -6;
            fx = R() * W;
          }
          if (fx > W + 6) fx = -6;
          if (fx < -6) fx = W + 6;
          f[o] = fx;
          f[o + 1] = fy;
        }
        const r = 0.7 + z * 2.3;
        const px = fx - par.x * 12 * z;
        const py = fy - par.y * 4 * z;
        if (z > 0.75) {
          x.globalAlpha = 0.5;
          x.drawImage(this.dot.src, px - r * 2.2, py - r * 2.2, r * 4.4, r * 4.4);
        } else {
          x.globalAlpha = 0.38 + z * 0.5;
          x.fillRect(px - r / 2, py - r / 2, r, r);
        }
      }
      x.globalAlpha = 1;
    }
  }

  /** Lightning: in a storm, a bolt every 4–11 s, with a flicker sequence. */
  private storm(s: SkyScene, dt: number): void {
    if (s.weather.storm > 0.5) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = 4 + Math.random() * 7;
        this.strike(s);
      }
    }
    const b = this.bolt;
    if (b) {
      b.t += dt;
      const seq = [1, 0.15, 0.85, 0.05, 0.55, 0];
      const i = Math.floor(b.t / 0.07);
      this.flash = i < seq.length ? seq[i]! * b.p : 0;
      if (i >= seq.length + 2) this.bolt = null;
    } else this.flash = 0;
  }

  private strike(s: SkyScene): void {
    const R = Math.random;
    const W = this.W;
    const H = this.H;
    const bx = W * (0.12 + 0.76 * R());
    const by = s.horizonY * H;
    const sx = bx + (R() - 0.5) * W * 0.15;
    const sy = H * 0.06;
    const n = 16;
    const pts: [number, number][] = [[sx, sy]];
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      pts.push([lerp(sx, bx, t) + (R() - 0.5) * 38 * (1 - t * 0.5), lerp(sy, by, t) + (R() - 0.5) * 10]);
    }
    pts[n] = [bx, by];
    const br: [number, number][][] = [];
    for (let k = 0; k < 3; k++) {
      const p: [number, number] = [...pts[3 + Math.floor(R() * 9)]!];
      const seg: [number, number][] = [[p[0], p[1]]];
      const a = (R() < 0.5 ? -1 : 1) * (0.4 + R() * 0.5);
      for (let i = 0; i < 5; i++) {
        p[0] += Math.sin(a) * 18 + (R() - 0.5) * 10;
        p[1] += 14 + R() * 8;
        seg.push([p[0], p[1]]);
      }
      br.push(seg);
    }
    this.bolt = { pts, br, t: 0, p: 0.7 + R() * 0.3 };
  }

  private drawBolt(x: CanvasRenderingContext2D, par: Parallax): void {
    const b = this.bolt!;
    const ox = -par.x * 1.4;
    const oy = -par.y * 0.5;
    x.save();
    x.globalCompositeOperation = 'lighter';
    x.lineJoin = 'round';
    const line = (pts: [number, number][]): void => {
      x.beginPath();
      pts.forEach((p, i) => (i ? x.lineTo(p[0] + ox, p[1] + oy) : x.moveTo(p[0] + ox, p[1] + oy)));
      x.stroke();
    };
    for (const [lw, a] of [[9, 0.12], [4, 0.35], [1.6, 1]] as const) {
      x.strokeStyle = `rgba(220,228,255,${(a * Math.min(1, this.flash * 1.4)).toFixed(3)})`;
      x.lineWidth = lw;
      line(b.pts);
      if (lw < 5) {
        x.lineWidth = lw * 0.6;
        for (const seg of b.br) line(seg);
      }
    }
    x.restore();
  }
}
