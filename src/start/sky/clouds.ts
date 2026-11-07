// Soft clouds of the start page sky (ADR 0124): 17 puffy sprites built
// once (white, alpha only), drifting right with the west wind at a speed
// by their size. Their positions are a function of game time, so a reload
// shows the same sky. More cloud cover lets more (and larger) sprites in;
// above 60 % an overcast sheet fills the band.
//
// They are lit as in the approved mockup: a vertical tint over the band
// (light top, darker base, warm when the sun is low, cool under the moon,
// dark in a storm) and a soft highlight towards the sun or moon, both laid
// "source-atop" over the clouds. That tint changes slowly, so it is baked
// into a copy of each puff (and of the sheet) when the engine refreshes
// the sky (twice a second): a frame only blits sprites into the cloud
// canvas (small, upscaled by CSS). The tint is linear, so tinting each
// puff apart equals tinting them together. A lightning flash whitens the
// lot for its few frames.
//
// No frame does much: the puffs are drawn (once) and re-lit a few at a
// time within a small time budget per frame (`work`); a puff not ready
// yet is simply not drawn (the clouds fade in on mount anyway). A still
// sky does it all at once.

import { type Rgb, clamp, hex, mix, mul, rgba, rng, sstep } from './color';
import type { SkyScene } from './look';

interface Puff {
  /** The white puff (built on first need), and its lit copy (same size; null until lit). */
  base: HTMLCanvasElement | null;
  lit: HTMLCanvasElement | null;
  w: number;
  h: number;
  /** The soft blobs it is made of (px, py, radius in its own px). */
  blobs: Float32Array;
  /** Size factor, phase along the drift (0..1), height (fraction of the view), speed (px/s at factor 1), cover threshold. */
  sc: number;
  x0: number;
  y: number;
  v: number;
  th: number;
}

/** The band the clouds live in: the top 62 % of the view. */
export const CLOUD_BAND = 0.62;

const canvas = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
};

interface Tint {
  top: Rgb;
  bot: Rgb;
  /** The highlight: centre and radius (CSS px), colour, alpha; null when there is no light. */
  light: { x: number; y: number; r: number; c: Rgb; a: number } | null;
}

export class Clouds {
  private readonly puffs: Puff[] = [];
  private readonly sheet = canvas(1, 1);
  private sheetOn = false;
  /** Re-lighting queue (indices into puffs; -1 = the sheet) and what it lights with. */
  private queue: number[] = [];
  private job: { s: SkyScene; t: Tint; drift: number; q: number } | null = null;

  constructor(seed = 55) {
    const R = rng(seed);
    for (let i = 0; i < 17; i++) {
      const sc = 0.55 + R() * 1.1;
      const w = Math.ceil(300 * sc);
      const h = Math.ceil(110 * sc);
      const blobs = new Float32Array(26 * 3);
      for (let k = 0; k < 26; k++) {
        const px = w * (0.12 + 0.76 * R());
        const py = h * (0.5 + 0.25 * (R() - 0.3)) - Math.sin((px / w) * Math.PI) * h * 0.18;
        const rad = Math.max(1, h * (0.14 + 0.22 * R()) * Math.sin((px / w) * Math.PI + 0.3));
        blobs.set([px, py, rad], k * 3);
      }
      this.puffs.push({ base: null, lit: null, w, h, blobs, sc, x0: R(), y: 0.03 + 0.4 * R() ** 1.3, v: 4 + 10 * sc, th: R() * 0.85 });
    }
    this.puffs.sort((a, b) => a.sc - b.sc);
  }

  /** Draws puff `p`'s white sprite. */
  private build(p: Puff): HTMLCanvasElement {
    const c = canvas(p.w, p.h);
    const x = c.getContext('2d')!;
    for (let k = 0; k < 26; k++) {
      const px = p.blobs[k * 3]!;
      const py = p.blobs[k * 3 + 1]!;
      const rad = p.blobs[k * 3 + 2]!;
      const g = x.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, 'rgba(255,255,255,.55)');
      g.addColorStop(0.6, 'rgba(255,255,255,.22)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    }
    // a darker base
    x.globalCompositeOperation = 'source-atop';
    const sh = x.createLinearGradient(0, 0, 0, p.h);
    sh.addColorStop(0, 'rgba(255,255,255,0)');
    sh.addColorStop(1, 'rgba(60,60,70,.55)');
    x.fillStyle = sh;
    x.fillRect(0, 0, p.w, p.h);
    p.base = c;
    return c;
  }

  /** True when there is anything to draw. */
  visible(s: SkyScene): boolean {
    return s.weather.cloud >= 0.02;
  }

  /** The cloud canvas's opacity (the mockup drew its buffer at this alpha). */
  static opacity(s: SkyScene): number {
    return 0.55 + 0.45 * s.weather.cloud;
  }

  private tint(s: SkyScene): Tint {
    const wx = s.weather;
    const p = s.paint;
    const dl = p.daylight;
    const lowS = 1 - sstep(0.05, 0.3, Math.abs(s.elevation));
    let top = mix(hex('#1a1f2c'), hex('#f4f2ee'), dl);
    let bot = mix(hex('#07090e'), hex('#9ea6b2'), dl);
    top = mix(top, hex('#ffb37a'), lowS * 0.6 * (1 - wx.cloud * 0.5));
    bot = mix(bot, hex('#6a3a4a'), lowS * 0.5);
    top = mix(top, hex('#3c4660'), p.moonI * 0.5 * (1 - dl));
    const stormK = wx.storm * 0.5 + Math.max(0, wx.cloud - 0.7);
    top = mul(top, 1 - stormK * 0.45);
    bot = mul(bot, 1 - stormK * 0.5);
    const { w: W, h: H } = s.view;
    const light = s.light.kind !== 'none' && p.lightI > 0.05 ? { x: s.light.x * W, y: s.light.y * H, r: W * 0.5, c: p.light, a: 0.5 * p.lightI } : null;
    return { top, bot, light };
  }

  /** Where puff `p` is drawn (CSS px) at drift time `drift`. */
  private place(p: Puff, s: SkyScene, drift: number): { x: number; y: number; w: number; h: number } {
    const { w: W, h: H } = s.view;
    const cover = s.weather.cloud;
    // wraps just off-screen, so most puffs are in view (as at the mockup's start); the span
    // must not change with the cover, or every puff would jump
    const span = W + p.w * 1.5 + 120;
    const raw = p.x0 * span + p.v * 0.7 * drift;
    return {
      x: raw - Math.floor(raw / span) * span - p.w * 1.5 - 60,
      y: p.y * H,
      w: p.w * (1 + cover * 0.5),
      h: p.h * (1 + cover * 0.4),
    };
  }

  /**
   * Lays the tint `t` over what `c` holds (after copying `src` into it, if
   * given), as the mockup's pass over the whole band did: `c` is drawn at
   * (bx, by, bw, bh) CSS px in a band `band` px high.
   */
  private light(c: HTMLCanvasElement, src: HTMLCanvasElement | null, t: Tint, bx: number, by: number, bw: number, bh: number, band: number): void {
    const x = c.getContext('2d');
    if (!x) return;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-over';
    if (src) {
      x.clearRect(0, 0, c.width, c.height);
      x.drawImage(src, 0, 0);
    }
    // CSS px → canvas px
    x.setTransform(c.width / bw, 0, 0, c.height / bh, (-bx * c.width) / bw, (-by * c.height) / bh);
    x.globalCompositeOperation = 'source-atop';
    const g = x.createLinearGradient(0, 0, 0, band);
    g.addColorStop(0, rgba(t.top, 0.9));
    g.addColorStop(1, rgba(t.bot, 0.9));
    x.fillStyle = g;
    x.fillRect(bx, by, bw, bh);
    if (t.light) {
      const L = t.light;
      const lg = x.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
      lg.addColorStop(0, rgba(L.c, L.a));
      lg.addColorStop(1, rgba(L.c, 0));
      x.fillStyle = lg;
      x.fillRect(bx, by, bw, bh);
    }
    x.globalCompositeOperation = 'source-over';
    x.setTransform(1, 0, 0, 1, 0, 0);
  }

  /**
   * Queues re-lighting the puffs and the overcast sheet for `s` (twice a
   * second); `work` does it.
   */
  refresh(s: SkyScene, drift: number, q: number): void {
    if (s.weather.cloud < 0.02) {
      this.queue = [];
      this.job = null;
      return;
    }
    this.job = { s, t: this.tint(s), drift, q };
    this.queue = [-1];
    for (let i = 0; i < this.puffs.length; i++) if (s.weather.cloud > this.puffs[i]!.th) this.queue.push(i);
  }

  /** Builds and re-lights queued puffs for up to `budget` ms (at least one; Infinity: all). */
  work(budget: number): void {
    const job = this.job;
    if (!job || !this.queue.length) return;
    const t0 = performance.now();
    const band = job.s.view.h * CLOUD_BAND;
    while (this.queue.length) {
      const i = this.queue.shift()!;
      if (i < 0) this.lightSheet(job.s, job.t, job.q);
      else {
        const p = this.puffs[i]!;
        const base = p.base ?? this.build(p);
        p.lit ??= canvas(p.w, p.h);
        const at = this.place(p, job.s, job.drift);
        this.light(p.lit, base, job.t, at.x, at.y, at.w, at.h, band);
      }
      if (performance.now() - t0 >= budget) break;
    }
  }

  private lightSheet(s: SkyScene, t: Tint, q: number): void {
    const wx = s.weather;
    this.sheetOn = wx.cloud > 0.6;
    if (!this.sheetOn) return;
    const { w: W, h: H } = s.view;
    const band = H * CLOUD_BAND;
    // the overcast sheet: white, thicker at the top (soft, so at half the buffer's resolution)
    const o = (wx.cloud - 0.6) / 0.4;
    const sw = Math.max(1, Math.ceil(W * q * 0.5));
    const sh = Math.max(1, Math.ceil(band * q * 0.5));
    if (this.sheet.width !== sw || this.sheet.height !== sh) {
      this.sheet.width = sw;
      this.sheet.height = sh;
    }
    const x = this.sheet.getContext('2d');
    if (!x) return;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-over';
    x.clearRect(0, 0, sw, sh);
    const g = x.createLinearGradient(0, 0, 0, sh);
    g.addColorStop(0, `rgba(255,255,255,${(0.9 * o).toFixed(3)})`);
    g.addColorStop(1, `rgba(255,255,255,${(0.25 * o).toFixed(3)})`);
    x.fillStyle = g;
    x.fillRect(0, 0, sw, sh);
    this.light(this.sheet, null, t, 0, 0, W, band, band);
  }

  /**
   * Paints the clouds into `x`, a buffer covering the band at `q` buffer
   * px per CSS px. `drift` is the time the drift has run (s), `flash` the
   * lightning flash (0..1).
   */
  draw(x: CanvasRenderingContext2D, s: SkyScene, q: number, drift: number, flash: number): void {
    const bw = x.canvas.width;
    const bh = x.canvas.height;
    const wx = s.weather;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-over';
    x.clearRect(0, 0, bw, bh);
    if (wx.cloud < 0.02) return;
    let drawn = 0;
    for (const p of this.puffs) {
      const a = clamp((wx.cloud - p.th) / 0.18);
      if (a <= 0) continue;
      if (!p.lit) continue;
      const at = this.place(p, s, drift);
      if (at.x > s.view.w || at.x + at.w < 0) continue;
      x.globalAlpha = a;
      x.drawImage(p.lit, at.x * q, at.y * q, at.w * q, at.h * q);
      drawn++;
    }
    x.globalAlpha = 1;
    if (this.sheetOn && wx.cloud > 0.6) {
      x.drawImage(this.sheet, 0, 0, bw, bh);
      drawn++;
    }
    if (flash > 0.02 && drawn) {
      x.globalCompositeOperation = 'source-atop';
      x.fillStyle = `rgba(223,230,255,${(flash * 0.7).toFixed(3)})`;
      x.fillRect(0, 0, bw, bh);
      x.globalCompositeOperation = 'source-over';
    }
  }
}
