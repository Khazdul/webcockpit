// Brief glints on the pane frame lines (owner feedback 20, 2026-10-17): a
// short bright stretch of the line itself where a sunrise beam, a
// shooting star, a sun glimpse or the moon passes. Drawn on the front
// layer, exactly on the rim (the frame box's x/y/w/h and its `border`
// thickness, its rounded outer corners followed: nothing outside it, owner
// item 45), so the rim stays sharp: no halo, no constant sheen (a soft sheen
// along the top line made it look blurry before). On the top rim the
// nameplate glints with it, the whole plate (owner item 49). Sprites are
// made once (1 px wide gradients, stretched); every glint is a few image
// copies (rimshape.ts: columns one device px wide at the corners), no paths
// (ADR 0091).

import { adapt, type ThemeInfo } from '../palette';
import type { PanePlate } from '../protocol';
import { type Ctx, type Cv, clamp, ctx2d, mkCanvas } from './env';
import { plateRects, rimRects } from './rimshape';

/** A frame line: the frame box and its line thickness (env.panes). */
export interface FrameBox {
  x: number;
  y: number;
  w: number;
  h: number;
  border: number;
  /** The nameplate (env.panes): a glint on the top rim lights it too (owner item 49); no sparkle over the title. */
  plate?: Pick<PanePlate, 'x' | 'w' | 'y1' | 'lip' | 'r'>;
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
  /** Device pixel ratio (the engine sets it): the corner columns are one device px wide. */
  dpr = 1;
  private readonly rects: number[] = [];

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
   * composite (`comp`). The lit stretch follows the rim's rounded outer
   * corners (owner item 45); on the top rim it takes the nameplate with it,
   * fillets and rounded corners included: the plate is the rim's glass
   * (owner item 49; before, only the rim's 2 px lip above the title, owner
   * feedback 32). No sparkle over the title.
   */
  line(f: Ctx, p: FrameBox, side: Side, c: number, len: number, a: number, spark = 0): void {
    const b = Math.max(1, p.border);
    if (a < 0.01 || len < 2) return;
    const horiz = side === 't' || side === 'b';
    const lo = horiz ? p.x : p.y, hi = horiz ? p.x + p.w : p.y + p.h;
    const s0 = c - len / 2, s1 = c + len / 2;
    if (Math.min(hi, s1) - Math.max(lo, s0) < 1) return;
    f.globalAlpha = clamp(a, 0, 1);
    const R = this.rects;
    R.length = 0;
    rimRects(R, p, side, s0, s1, b, this.dpr);
    const pl = side === 't' ? p.plate : undefined;
    if (pl) plateRects(R, p, s0, s1, this.dpr);
    const k = N / len;
    for (let i = 0; i < R.length; i += 4) {
      const x = R[i]!, y = R[i + 1]!, w = R[i + 2]!, h = R[i + 3]!;
      if (horiz) f.drawImage(this.hs, (x - s0) * k, 0, w * k, 1, x, y, w, h);
      else f.drawImage(this.vs, 0, (y - s0) * k, 1, h * k, x, y, w, h);
    }
    // the sparkle is 9 px across: not where it would reach over the title
    const g0 = pl ? pl.x - pl.r : 0, g1 = pl ? pl.x + pl.w + pl.r : 0;
    const onPlate = pl !== undefined && c > g0 - 4.5 && c < g1 + 4.5;
    if (spark > 0.02 && c >= lo && c <= hi && !onPlate) {
      const x = horiz ? c : side === 'l' ? p.x + b / 2 : p.x + p.w - b / 2;
      const y = horiz ? (side === 't' ? p.y + b / 2 : p.y + p.h - b / 2) : c;
      f.globalAlpha = clamp(a * spark, 0, 1);
      f.drawImage(this.spark, Math.round(x) - 4.5, Math.round(y) - 4.5);
    }
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
