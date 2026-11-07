// Soft clouds of the start page sky (ADR 0124): 17 puffy sprites built
// once (white, alpha only), drifting right with the west wind at a speed
// by their size. Their positions are a function of game time, so a reload
// shows the same sky. More cloud cover lets more (and larger) sprites in;
// above 60 % an overcast sheet fills the band. Each frame they are drawn
// into a small buffer (the cloud canvas itself, upscaled by CSS) and lit
// in place: a vertical tint (light top, darker base, warm when the sun is
// low, cool under the moon, dark in a storm, white in a lightning flash)
// and a soft highlight towards the sun or moon.

import { clamp, hex, mix, mul, rgba, rng, sstep } from './color';
import type { SkyScene } from './look';

interface Puff {
  c: HTMLCanvasElement;
  /** Size factor, phase along the drift (0..1), height (fraction of the view), speed (px/s at factor 1), cover threshold. */
  sc: number;
  x0: number;
  y: number;
  v: number;
  th: number;
}

/** The band the clouds live in: the top 62 % of the view. */
export const CLOUD_BAND = 0.62;

export class Clouds {
  private readonly puffs: Puff[] = [];

  constructor(seed = 55) {
    const R = rng(seed);
    for (let i = 0; i < 17; i++) {
      const sc = 0.55 + R() * 1.1;
      const cw = Math.ceil(300 * sc);
      const ch = Math.ceil(110 * sc);
      const c = document.createElement('canvas');
      c.width = cw;
      c.height = ch;
      const x = c.getContext('2d')!;
      for (let k = 0; k < 26; k++) {
        const px = cw * (0.12 + 0.76 * R());
        const py = ch * (0.5 + 0.25 * (R() - 0.3)) - Math.sin((px / cw) * Math.PI) * ch * 0.18;
        const rad = Math.max(1, ch * (0.14 + 0.22 * R()) * Math.sin((px / cw) * Math.PI + 0.3));
        const g = x.createRadialGradient(px, py, 0, px, py, rad);
        g.addColorStop(0, 'rgba(255,255,255,.55)');
        g.addColorStop(0.6, 'rgba(255,255,255,.22)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g;
        x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
      }
      // a darker base
      x.globalCompositeOperation = 'source-atop';
      const sh = x.createLinearGradient(0, 0, 0, ch);
      sh.addColorStop(0, 'rgba(255,255,255,0)');
      sh.addColorStop(1, 'rgba(60,60,70,.55)');
      x.fillStyle = sh;
      x.fillRect(0, 0, cw, ch);
      this.puffs.push({ c, sc, x0: R(), y: 0.03 + 0.4 * R() ** 1.3, v: 4 + 10 * sc, th: R() * 0.85 });
    }
    this.puffs.sort((a, b) => a.sc - b.sc);
  }

  /** True when there is anything to draw. */
  visible(s: SkyScene): boolean {
    return s.weather.cloud >= 0.02;
  }

  /**
   * Paints the clouds into `x`, a buffer covering the band at `q` buffer
   * px per CSS px. `drift` is the time the drift has run (s), `flash` the
   * lightning flash (0..1).
   */
  draw(x: CanvasRenderingContext2D, s: SkyScene, q: number, drift: number, flash: number): void {
    const { w: W, h: H } = s.view;
    const bw = x.canvas.width;
    const bh = x.canvas.height;
    const wx = s.weather;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-over';
    x.clearRect(0, 0, bw, bh);
    if (wx.cloud < 0.02) return;
    for (const p of this.puffs) {
      const a = clamp((wx.cloud - p.th) / 0.18);
      if (a <= 0) continue;
      const cw = p.c.width * (1 + wx.cloud * 0.5);
      const ch = p.c.height * (1 + wx.cloud * 0.4);
      // wraps just off-screen, so most puffs are in view (as at the mockup's start); the span
      // must not change with the cover, or every puff would jump
      const span = W + p.c.width * 1.5 + 120;
      const raw = p.x0 * span + p.v * 0.7 * drift;
      const px = raw - Math.floor(raw / span) * span - p.c.width * 1.5 - 60;
      x.globalAlpha = a;
      x.drawImage(p.c, px * q, p.y * H * q, cw * q, ch * q);
    }
    x.globalAlpha = 1;
    if (wx.cloud > 0.6) {
      const o = (wx.cloud - 0.6) / 0.4;
      const g = x.createLinearGradient(0, 0, 0, bh);
      g.addColorStop(0, `rgba(255,255,255,${(0.9 * o).toFixed(3)})`);
      g.addColorStop(1, `rgba(255,255,255,${(0.25 * o).toFixed(3)})`);
      x.fillStyle = g;
      x.fillRect(0, 0, bw, bh);
    }
    // light them in place
    x.globalCompositeOperation = 'source-atop';
    const p = s.paint;
    const dl = p.daylight;
    const lowS = 1 - sstep(0.05, 0.3, Math.abs(s.elevation));
    let topC = mix(hex('#1a1f2c'), hex('#f4f2ee'), dl);
    let botC = mix(hex('#07090e'), hex('#9ea6b2'), dl);
    topC = mix(topC, hex('#ffb37a'), lowS * 0.6 * (1 - wx.cloud * 0.5));
    botC = mix(botC, hex('#6a3a4a'), lowS * 0.5);
    topC = mix(topC, hex('#3c4660'), p.moonI * 0.5 * (1 - dl));
    const stormK = wx.storm * 0.5 + Math.max(0, wx.cloud - 0.7);
    topC = mul(topC, 1 - stormK * 0.45);
    botC = mul(botC, 1 - stormK * 0.5);
    if (flash > 0.02) {
      topC = mix(topC, hex('#dfe6ff'), flash * 0.8);
      botC = mix(botC, hex('#8a94c0'), flash * 0.7);
    }
    const tg = x.createLinearGradient(0, 0, 0, bh);
    tg.addColorStop(0, rgba(topC, 0.9));
    tg.addColorStop(1, rgba(botC, 0.9));
    x.fillStyle = tg;
    x.fillRect(0, 0, bw, bh);
    if (s.light.kind !== 'none' && p.lightI > 0.05) {
      const lx = s.light.x * W * q;
      const ly = s.light.y * H * q;
      const lg = x.createRadialGradient(lx, ly, 0, lx, ly, bw * 0.5);
      lg.addColorStop(0, rgba(p.light, 0.5 * p.lightI));
      lg.addColorStop(1, rgba(p.light, 0));
      x.fillStyle = lg;
      x.fillRect(0, 0, bw, bh);
    }
    x.globalCompositeOperation = 'source-over';
  }

  /** The cloud canvas's opacity (the mockup drew the buffer at this alpha). */
  static opacity(s: SkyScene): number {
    return 0.55 + 0.45 * s.weather.cloud;
  }

  /** The band's height in CSS px for a view. */
  static bandHeight(H: number): number {
    return H * CLOUD_BAND;
  }
}
