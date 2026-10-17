// Brief glints on the pane frame lines (owner feedback 20, 2026-10-17): a
// short bright stretch of the line itself where a sunrise beam, a
// shooting star, a sun glimpse or the moon passes. Drawn on the front
// layer, exactly on the line (the frame box's x/y/w/h and its `border`
// thickness; nothing outside it), so the line stays sharp: no halo, no
// constant sheen (a soft sheen along the top line made it look blurry
// before). Sprites are made once (1 px wide gradients, stretched); every
// glint is one or two image copies, no paths (ADR 0091).

import { adapt, type ThemeInfo } from '../palette';
import { type Ctx, type Cv, clamp, ctx2d, mkCanvas } from './env';

/** A frame line: the frame box and its line thickness (env.panes). */
export interface FrameBox {
  x: number;
  y: number;
  w: number;
  h: number;
  border: number;
  /** The top line's gap for the title (env.panes): no line there, so never a glint. */
  gap?: { x: number; w: number };
}

export type Side = 't' | 'b' | 'l' | 'r';

interface Live {
  p: FrameBox;
  side: Side;
  /** Centre along the line (x for t/b, y for l/r), its speed along it (px/s). */
  c: number;
  v: number;
  len: number;
  k: number;
  t0: number;
  dur: number;
}

const N = 256;

export class Glints {
  /** Along-the-line profiles: horizontal (N × 1) and vertical (1 × N). */
  private readonly hs: Cv;
  private readonly vs: Cv;
  /** A small sharp sparkle (9 × 9: a 1 px cross with a bright centre). */
  readonly spark: Cv;
  private readonly live: Live[] = [];
  readonly comp: GlobalCompositeOperation;

  constructor(th: ThemeInfo, rgb: [number, number, number] = [255, 248, 232]) {
    const c = th.light ? adapt(rgb, th, 0.2, 0.6) : rgb;
    const col = `${c[0]},${c[1]},${c[2]}`;
    this.comp = th.add;
    this.hs = mkCanvas(N, 1);
    this.vs = mkCanvas(1, N);
    for (const [cv, horiz] of [
      [this.hs, true],
      [this.vs, false],
    ] as [Cv, boolean][]) {
      const g = ctx2d(cv);
      const gr = horiz ? g.createLinearGradient(0, 0, N, 0) : g.createLinearGradient(0, 0, 0, N);
      gr.addColorStop(0, `rgba(${col},0)`);
      gr.addColorStop(0.3, `rgba(${col},0.25)`);
      gr.addColorStop(0.5, `rgba(${col},1)`);
      gr.addColorStop(0.7, `rgba(${col},0.25)`);
      gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr;
      g.fillRect(0, 0, horiz ? N : 1, horiz ? 1 : N);
    }
    this.spark = mkCanvas(9, 9);
    const s = ctx2d(this.spark);
    s.fillStyle = `rgba(${col},0.55)`;
    s.fillRect(0, 4, 9, 1);
    s.fillRect(4, 0, 1, 9);
    s.fillStyle = `rgba(${col},1)`;
    s.fillRect(2, 4, 5, 1);
    s.fillRect(4, 2, 1, 5);
  }

  /**
   * Draws one glint now: `len` px of `side` centred at `c` (along the line),
   * at alpha `a`; a sparkle at the centre when `spark` > 0. Caller sets the
   * composite (`comp`). On the top line it stops at the title's gap (owner
   * feedback 32: no lit band through the title).
   */
  line(f: Ctx, p: FrameBox, side: Side, c: number, len: number, a: number, spark = 0): void {
    const b = Math.max(1, p.border);
    if (a < 0.01 || len < 2) return;
    const horiz = side === 't' || side === 'b';
    const lo = horiz ? p.x : p.y, hi = horiz ? p.x + p.w : p.y + p.h;
    const s0 = c - len / 2, s1 = c + len / 2;
    const a0 = Math.max(lo, s0), a1 = Math.min(hi, s1);
    if (a1 - a0 < 1) return;
    f.globalAlpha = clamp(a, 0, 1);
    const gap = side === 't' ? p.gap : undefined;
    if (horiz) {
      const y = side === 't' ? p.y : p.y + p.h - b;
      if (gap) {
        this.hspan(f, s0, len, a0, Math.min(a1, gap.x), y, b);
        this.hspan(f, s0, len, Math.max(a0, gap.x + gap.w), a1, y, b);
      } else this.hspan(f, s0, len, a0, a1, y, b);
    } else {
      const u0 = ((a0 - s0) / len) * N, u1 = ((a1 - s0) / len) * N;
      const x = side === 'l' ? p.x : p.x + p.w - b;
      f.drawImage(this.vs, 0, u0, 1, u1 - u0, x, a0, b, a1 - a0);
    }
    // the sparkle is 9 px across: not where it would reach into the gap
    const inGap = gap !== undefined && c > gap.x - 4.5 && c < gap.x + gap.w + 4.5;
    if (spark > 0.02 && c >= lo && c <= hi && !inGap) {
      const x = horiz ? c : side === 'l' ? p.x + b / 2 : p.x + p.w - b / 2;
      const y = horiz ? (side === 't' ? p.y + b / 2 : p.y + p.h - b / 2) : c;
      f.globalAlpha = clamp(a * spark, 0, 1);
      f.drawImage(this.spark, Math.round(x) - 4.5, Math.round(y) - 4.5);
    }
  }

  /** The part `[a0, a1]` of a horizontal glint `len` px long from `s0`, on the line at `y`, `b` thick. */
  private hspan(f: Ctx, s0: number, len: number, a0: number, a1: number, y: number, b: number): void {
    if (a1 - a0 < 1) return;
    const u0 = ((a0 - s0) / len) * N, u1 = ((a1 - s0) / len) * N;
    f.drawImage(this.hs, u0, 0, u1 - u0, 1, a0, y, a1 - a0, b);
  }

  /** A glint that runs on its own for `dur` s (moving at `v` px/s along the line), fading in and out. */
  add(p: FrameBox, side: Side, c: number, len: number, k: number, T: number, dur: number, v = 0): void {
    if (this.live.length > 24) this.live.shift();
    this.live.push({ p, side, c, v, len, k, t0: T, dur });
  }

  /**
   * The point of a frame line nearest (x, y) within `r` px: a glint there
   * (`add`), its strength falling off with the distance. Returns whether one
   * was added.
   */
  near(panes: readonly FrameBox[], x: number, y: number, r: number, k: number, T: number, dur: number, len: number, v = 0): boolean {
    let any = false;
    for (const p of panes) {
      if (!p.border) continue;
      const inX = x >= p.x && x <= p.x + p.w, inY = y >= p.y && y <= p.y + p.h;
      const cand: [Side, number, number][] = [];
      if (inX) cand.push(['t', Math.abs(y - p.y), x], ['b', Math.abs(y - (p.y + p.h)), x]);
      if (inY) cand.push(['l', Math.abs(x - p.x), y], ['r', Math.abs(x - (p.x + p.w)), y]);
      for (const [side, d, c] of cand) {
        if (d > r) continue;
        const s = k * (1 - d / r);
        this.add(p, side, c, len, s, T, dur, side === 't' || side === 'b' ? v : 0);
        any = true;
      }
    }
    return any;
  }

  /** Draws the running glints; returns true while any is left. */
  draw(f: Ctx, T: number): boolean {
    if (!this.live.length) return false;
    f.globalCompositeOperation = this.comp;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const g = this.live[i]!, t = (T - g.t0) / g.dur;
      if (t >= 1 || t < 0) {
        this.live.splice(i, 1);
        continue;
      }
      const a = g.k * Math.min(1, t * 6) * (1 - t) ** 1.5;
      this.line(f, g.p, g.side, g.c + g.v * (T - g.t0), g.len, a, t < 0.4 ? 0.8 : 0);
    }
    f.globalAlpha = 1;
    f.globalCompositeOperation = 'source-over';
    return this.live.length > 0;
  }

  get active(): boolean {
    return this.live.length > 0;
  }

  clear(): void {
    this.live.length = 0;
  }
}
