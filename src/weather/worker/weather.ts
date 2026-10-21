// Weather module (port of the v4 prototype, notes/research/weather-world/modules/weather.js):
// precipitation and lightning.
//   rain    streaks that stop on pane top borders: splashes, beads under
//           pane bottoms and corners that drip, rivulets down the outside of
//           the sides (nothing is drawn over a frame line, so it stays crisp);
//           keeps dripping a while after the rain and then dries. Drops enter
//           at the top and thicken over ~6 s; when it stops they fall out.
//   bolt    stepped leader, branches, return stroke, re-strikes, afterglow, rim
//           light on every frame's lines (strongest near the bolt). ONLY on
//           the 'strike' event. Writes
//           env.shared.flash / boltX.
//   snow    flakes as particles plus far tiles of dots. Snow enters from the
//           top and builds up over ~25 s; gusts swirl the flakes; a faint
//           dusting gathers along the top rims (on the glass) and melts afterwards.
//           When it stops, flakes, far tiles and dusting fade out over
//           SNOW_FADE_S while they fall on (owner item 91), then are cleared.
// Everything is tinted from env.mix (day neutral, moon silver, torch amber,
// dark night dim) and adapted to the background (palette.ts).
// Categories: `precipitation` (rain, drips, snow), `lightning` (the bolt).

import { RIM_R } from '../../panes/frame';
import { adapt, adaptCss, type Rgb, type ThemeInfo } from '../palette';
import { type Ctx, type Cv, type Env, FPS_BURST, FPS_FAST, FPS_SLOW, type Module, type Pane, TAU, clamp, ctx2d, ctx2dCpu, mkCanvas, rr } from './env';
import { LEFT_SOLID, bandEnd, bandGradient, bandK, bandSolid, leftDark } from './band';
import { plateRects, rimRects } from './rimshape';

/**
 * Snow that begins starts at this much of its build-up at once (owner item
 * 93): many flakes and the first far layers falling in from the top (item
 * 98), not a few flakes that take half a minute to show. It grows on from
 * there.
 */
export const SNOW_START = 0.5;
/** The left band's ramp is drawn in this many steps for the far snow (pattern fills; owner item 99). */
const BAND_STRIPS = 12;
/** Each step's share (the sky's curve at its middle, band.ts). */
const bandStrip = Array.from({ length: BAND_STRIPS }, (_, q) => 1 - leftDark(LEFT_SOLID + ((q + 0.5) / BAND_STRIPS) * (1 - LEFT_SOLID)));
/** Snow that stops fades out over this long, s (owner item 91: it lingered a minute or more). */
export const SNOW_FADE_S = 10;
/** Snow that comes back mid-fade returns this fast, s (from nothing). */
export const SNOW_BACK_S = 1.5;

/** The snow's fade, linear 0..1: down over SNOW_FADE_S while it does not snow, up over SNOW_BACK_S while it does. */
export function snowFadeStep(v: number, snowing: boolean, dt: number): number {
  return snowing ? Math.min(1, v + dt / SNOW_BACK_S) : Math.max(0, v - dt / SNOW_FADE_S);
}
/** The snow's visibility for a fade value: eased (smoothstep), so it starts and ends softly. */
export function snowFadeAlpha(v: number): number {
  const x = clamp(v, 0, 1);
  return x * x * (3 - 2 * x);
}

const R = Math.random;

type TintKey = 'sun' | 'moon' | 'torch' | 'dark' | 'neutral';
const TKEYS: TintKey[] = ['sun', 'moon', 'torch', 'dark', 'neutral'];
// [r, g, b, lum]
const TINT_DARK: Record<TintKey, [number, number, number, number]> = {
  sun: [178, 196, 216, 1.0],
  moon: [150, 186, 240, 0.92],
  torch: [246, 170, 96, 0.9],
  dark: [104, 124, 156, 0.62],
  neutral: [168, 184, 206, 0.9],
};

interface WPane extends Pane {
  x2: number;
  y2: number;
  bw: number;
  wet: number;
  wetIn: number;
  eaves: Float32Array;
  bead: Float32Array;
  rate: Float32Array;
  dust: number;
  eavesOk: boolean;
  /** The width (px) of fresh rain started just below it, in the dry lee under it (0: none). */
  shelter: number;
  dustRow: number;
}

interface Tile {
  S: number;
  /**
   * The tile's dots, x, y, r per dot (CSS px in its S × S cell), sorted by
   * `style`; `cuts[k]` is where style k starts. Drawn as small rects at their
   * place in every cell on screen (it was a full-screen pattern fill per tile:
   * 6 of them cost Firefox's software canvas ~24 ms a frame in snow, so the
   * snow ran late; owner feedback 56).
   */
  dots: Float32Array;
  cuts: number[];
  styles: string[];
  /** The same as a repeating pattern (GPU canvases: one fill per tile is cheaper there than the many rects). */
  pat: CanvasPattern | null;
  speed: number;
  ox: number;
  oy: number;
  ph: number;
  on: number;
  front: number;
  tail: number;
  th: number;
  lay: number;
}

interface Bucket {
  p: Path2D;
  w: number;
  lev: number;
  inten: number;
}
interface Strike {
  segs: number[];
  nseg: number;
  mainLen: number;
  tLead: number;
  sweep: number;
  el: number;
  strokes: number[];
  end: number;
  bx0: number;
  by0: number;
  sw: number;
  sh: number;
  q: number;
  x0: number;
  tx: number;
  ty: number;
  ledge: boolean;
  fog: number;
  /** Rim light on pane borders: axis-aligned rects [x, y, w, h, …] (fills, not stroked paths). */
  rims: { rim: number[]; band: number[]; gr: CanvasGradient; k: number }[];
  leadStep: number;
  ls1: string;
  ls2: string;
  /** The sprites and rim lights still being made (`prepStrike`); null when done. */
  prep: Generator<void, void> | null;
}

export function weatherModule(): Module {
  let th: ThemeInfo;
  let TINT = TINT_DARK;
  /** Lighter = toward this channel value (white on dark, black on light). */
  let LIFT = 255;
  const tw: Record<TintKey, number> = { sun: 0, moon: 0, torch: 0, dark: 0, neutral: 0 };
  const tint = { r: 168, g: 184, b: 206, lum: 0.9, k1: 'neutral' as TintKey, w1: 1, k2: 'neutral' as TintKey, w2: 0 };
  function stepTint(mix: Env['mix']): void {
    // the time of day tints only outdoors (the director's sun / moon / dark are not gated)
    tw.sun = mix.sun * mix.outdoors;
    tw.moon = mix.moon * mix.outdoors;
    tw.dark = mix.dark * mix.outdoors;
    tw.torch = mix.torch * (1 - 0.3 * mix.outdoors * mix.night);
    let s = tw.sun + tw.moon + tw.torch + tw.dark;
    tw.neutral = Math.max(0, 1 - s);
    s += tw.neutral;
    let r = 0, g = 0, b = 0, l = 0, k1: TintKey = 'neutral', w1 = -1, k2: TintKey = 'neutral', w2 = -1;
    for (let i = 0; i < TKEYS.length; i++) {
      const k = TKEYS[i]!, w = tw[k] / s, T = TINT[k];
      r += T[0] * w;
      g += T[1] * w;
      b += T[2] * w;
      l += T[3] * w;
      if (w > w1) {
        k2 = k1;
        w2 = w1;
        k1 = k;
        w1 = w;
      } else if (w > w2) {
        k2 = k;
        w2 = w;
      }
    }
    tint.r = r;
    tint.g = g;
    tint.b = b;
    tint.lum = l;
    tint.k1 = k1;
    tint.w1 = w1;
    tint.k2 = k2;
    tint.w2 = Math.max(0, w2);
  }
  const lift = (c: number, k: number): number => (c + (LIFT - c) * k) | 0;
  const rgbStr = (k: number, a: number): string => `rgba(${lift(tint.r, k)},${lift(tint.g, k)},${lift(tint.b, k)},${a.toFixed(3)})`;

  const ST = { key: -1, rain: [] as string[], splash: '', tail: '' };
  function rebuildStyles(): void {
    const key = ((tint.r / 3) | 0) * 1e6 + ((tint.g / 3) | 0) * 1e3 + ((tint.b / 3) | 0);
    if (key === ST.key) return;
    ST.key = key;
    ST.rain.length = 0;
    for (let k = 0; k <= 20; k++) ST.rain.push(rgbStr(0.02 + k * 0.03, 0.04 + k * 0.03));
    ST.splash = rgbStr(0.45, 1);
    ST.tail = rgbStr(0.3, 1);
  }

  // ---- water drop sprites
  function dropSprite(S: number, rgb: readonly number[]): Cv {
    const c = mkCanvas(S, S), x = ctx2d(c), Rr = S * 0.41, h = S / 2;
    const r = rgb[0]! | 0, g = rgb[1]! | 0, b = rgb[2]! | 0;
    const lr = (r + LIFT) >> 1, lg = (g + LIFT) >> 1, lb = (b + LIFT) >> 1;
    x.translate(h, h);
    let gr = x.createRadialGradient(0, Rr * 0.2, Rr * 0.1, 0, 0, Rr);
    gr.addColorStop(0, `rgba(${r},${g},${b},0.02)`);
    gr.addColorStop(0.7, `rgba(${r},${g},${b},0.07)`);
    gr.addColorStop(0.93, `rgba(${r},${g},${b},0.26)`);
    gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = gr;
    x.beginPath();
    x.arc(0, 0, Rr, 0, TAU);
    x.fill();
    const t = mkCanvas(S, S), y = ctx2d(t);
    y.translate(h, h);
    gr = y.createLinearGradient(0, -Rr, 0, Rr);
    gr.addColorStop(0, `rgba(${lr},${lg},${lb},0)`);
    gr.addColorStop(0.5, `rgba(${lr},${lg},${lb},0.05)`);
    gr.addColorStop(1, `rgba(${lr},${lg},${lb},0.85)`);
    y.fillStyle = gr;
    y.beginPath();
    y.arc(0, 0, Rr * 0.92, 0, TAU);
    y.fill();
    y.globalCompositeOperation = 'destination-out';
    gr = y.createRadialGradient(0, -Rr * 0.2, Rr * 0.55, 0, -Rr * 0.2, Rr * 0.86);
    gr.addColorStop(0, 'rgba(0,0,0,1)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    y.fillStyle = gr;
    y.beginPath();
    y.arc(0, -Rr * 0.2, Rr * 0.9, 0, TAU);
    y.fill();
    x.drawImage(t, -h, -h);
    x.strokeStyle = `rgba(${lr},${lg},${lb},0.1)`;
    x.lineWidth = Math.max(0.6, S / 40);
    x.beginPath();
    x.arc(0, 0, Rr * 0.97, Math.PI * 1.05, Math.PI * 1.95);
    x.stroke();
    gr = x.createRadialGradient(-Rr * 0.36, -Rr * 0.4, 0, -Rr * 0.36, -Rr * 0.4, Rr * 0.3);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr;
    x.beginPath();
    x.arc(-Rr * 0.36, -Rr * 0.4, Rr * 0.3, 0, TAU);
    x.fill();
    gr = x.createRadialGradient(Rr * 0.28, Rr * 0.5, 0, Rr * 0.28, Rr * 0.5, Rr * 0.14);
    gr.addColorStop(0, `rgba(${lr},${lg},${lb},0.5)`);
    gr.addColorStop(1, `rgba(${lr},${lg},${lb},0)`);
    x.fillStyle = gr;
    x.beginPath();
    x.arc(Rr * 0.28, Rr * 0.5, Rr * 0.14, 0, TAU);
    x.fill();
    return c;
  }
  /**
   * The drop sprites in the mixed tint (quantised like `rebuildStyles`):
   * one set drawn once per drop, not the two strongest tints' sets drawn
   * one over the other (performance review, item 111). The last two
   * colours are kept (a crossfade goes back and forth over a step).
   */
  const dropSets = new Map<number, Cv[]>();
  const DROP_Q = 6;
  function dropSet(): Cv[] {
    const r = Math.round(tint.r / DROP_Q), g = Math.round(tint.g / DROP_Q), b = Math.round(tint.b / DROP_Q);
    const key = r * 65536 + g * 256 + b;
    let set = dropSets.get(key);
    if (!set) {
      const rgb = [r * DROP_Q, g * DROP_Q, b * DROP_Q];
      set = [dropSprite(12, rgb), dropSprite(28, rgb), dropSprite(72, rgb)];
      if (dropSets.size >= 2) dropSets.delete(dropSets.keys().next().value!);
    } else dropSets.delete(key);
    dropSets.set(key, set);
    return set;
  }
  /** The left band (owner item 99): how much of an element at x shows (0 in the solid band, 1 right of it; band.ts). */
  let bS = 0, bE = 0;
  const bk = (x: number): number => (x >= bE ? 1 : x <= bS ? 0 : bandK(x, W));
  /** The band's fade for `cutBand` (0 … bE in user space; made per context, as a gradient belongs to the canvas it came from). */
  const bandGr = new Map<Ctx, { gr: CanvasGradient; bE: number }>();
  /** Takes the left band out of what was drawn on `c` (its user space in screen px) from x0, y0, h high: once per strike sprite. */
  function cutBand(c: Ctx, x0: number, y0: number, h: number): void {
    if (x0 >= bE) return;
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.globalAlpha = 1;
    let g = bandGr.get(c);
    if (!g || g.bE !== bE) bandGr.set(c, (g = { gr: bandGradient(c, bE), bE }));
    c.fillStyle = g.gr;
    c.fillRect(x0, y0, bE - x0, h);
    c.restore();
  }
  /** The drop sprites for this frame (`dropSet`, once per frame). */
  let drops: Cv[] = [];
  function drawDrop(c: Ctx, x: number, y: number, r: number, stretch: number, a: number): void {
    a *= bk(x);
    if (a < 0.004) return;
    const i = r < 2.4 ? 0 : r < 6 ? 1 : 2;
    const s = r / 0.41, sh = s * stretch, dx = x - s / 2, dy = y - sh / 2 - (sh - s) * 0.25;
    // (the strongest tint alone was drawn at its own share when the second was weak)
    c.globalAlpha = tint.w2 > 0.06 ? a : a * tint.w1;
    c.drawImage(drops[i]!, dx, dy, s, sh);
  }

  // ---- state
  /** Rivulets: the drop's centre this far outside the rim's outer edge; they end this far above the frame box's bottom (the rim's 4 px corner rounds off below). */
  const RIV_OUT = 0.5, RIV_CORNER = 3;
  /** The corner eaves this far in from the frame box's sides (under the rounded corner's flat part). */
  const EAVE_IN = 2.2;
  let W = 0, H = 0, fadeTop = 0;
  const RN = 340;
  const rx = new Float32Array(RN), ry = new Float32Array(RN), rs = new Float32Array(RN), rl = new Float32Array(RN);
  const PN = 360;
  const px = new Float32Array(PN), py = new Float32Array(PN), pvx = new Float32Array(PN), pvy = new Float32Array(PN), pl = new Float32Array(PN), pfloor = new Float32Array(PN);
  let pHead = 0, splashBudget = 0;
  const DN = 60;
  const fx = new Float32Array(DN), fy = new Float32Array(DN), fv = new Float32Array(DN), fr = new Float32Array(DN), fa = new Uint8Array(DN);
  const VN = 12;
  const vx = new Float32Array(VN), vy = new Float32Array(VN), vv = new Float32Array(VN), vp = new Int16Array(VN), vside = new Int8Array(VN), va = new Uint8Array(VN), vseed = new Float32Array(VN), vy0 = new Float32Array(VN);
  let panes: WPane[] = [];
  let wind = 0.05, rainT = 0;
  const ra = new Uint8Array(RN);
  let rainAmt = 0;
  const SN = 300;
  const snx = new Float32Array(SN), sny = new Float32Array(SN), snz = new Float32Array(SN), snv = new Float32Array(SN), snph = new Float32Array(SN), sns = new Uint8Array(SN), sna = new Uint8Array(SN);
  let tiles: Tile[] | null = null, snCount = 0, snowAmt = 0, snowFills: string[] | null = null, snowCol: Rgb = [0, 0, 0], snowColAge = 1;
  let dustCv: Cv | null = null, snowWind = 0, snowT = 0, snowFade = 1;
  let gNext = 9, gAge = -1, gDur = 5, gDir = 1, gPow = 1, gShift = 0, gE = 0;
  let prevW: string | null | undefined = undefined, prevSnowMix = 0, prevRainMix = 0;

  // ---- rain helpers
  function splash(x: number, y: number, big: boolean): void {
    const n = big ? 6 : 2 + ((R() * 2.2) | 0);
    for (let k = 0; k < n; k++) {
      const i = pHead;
      pHead = (pHead + 1) % PN;
      px[i] = x + (R() - 0.5) * 2;
      py[i] = y - 0.5;
      const a = (R() - 0.5) * 2.4, sp = (big ? 70 : 45) + R() * (big ? 90 : 60);
      pvx[i] = Math.sin(a) * sp * 0.9 + wind * 120;
      pvy[i] = -Math.cos(a) * sp - 20;
      pl[i] = 0.22 + R() * (big ? 0.35 : 0.2);
      pfloor[i] = y;
    }
  }
  let shelterW = 0;
  function respawn(i: number): void {
    const u = R() * (W + shelterW);
    if (u > W) {
      let v = u - W;
      for (let k = 0; k < panes.length; k++) {
        const p = panes[k]!;
        if (!p.shelter) continue;
        if (v < p.shelter) {
          rx[i] = rr(p.x + 2, p.x2 - 2);
          ry[i] = p.y2 + rr(0, 30);
          return;
        }
        v -= p.shelter;
      }
    }
    ry[i] = -rr(0, 90) - 30;
    rx[i] = rr(-wind * H - 40, W + 20);
  }
  function hitPane(x: number, y: number): number {
    for (let k = 0; k < panes.length; k++) {
      const p = panes[k]!;
      if (x >= p.x && x <= p.x2 && y >= p.y && y <= p.y2) return k;
    }
    return -1;
  }
  function seedRain(fill: boolean): void {
    for (let i = 0; i < RN; i++) {
      rs[i] = rr(0.75, 1.3);
      rl[i] = rr(0.6, 1.35);
      if (!fill && !ra[i]) continue;
      rx[i] = R() * W;
      ry[i] = R() * H;
      ra[i] = fill ? 1 : ra[i]!;
      if (hitPane(rx[i]!, ry[i]!) >= 0) ry[i]! -= H + 60;
    }
  }
  function buildPanes(env: Env): void {
    panes = env.panes.map((p) => {
      // the corner eaves under the rim's rounded lower corners, where they still touch the bottom edge
      const ce = p.border ? EAVE_IN : 1.2;
      const eaves = [p.x + ce, p.x + p.w - ce];
      const n = Math.max(1, Math.round(p.w / 95));
      for (let k = 0; k < n; k++) eaves.push(p.x + p.w * (0.12 + 0.76 * ((k + R() * 0.8) / n)));
      return {
        ...p,
        x2: p.x + p.w,
        y2: p.y + p.h,
        bw: p.border,
        wet: 0,
        wetIn: 0,
        eaves: Float32Array.from(eaves),
        bead: Float32Array.from(eaves, () => R()),
        rate: Float32Array.from(eaves, () => 0.5 + R()),
        dust: 0,
        eavesOk: p.y + p.h < env.protect.fadeTop - 4,
        shelter: 0,
        dustRow: 0,
      };
    });
    shelterW = 0;
    const yEnd = env.protect.fadeTop + 30;
    for (const p of panes) {
      p.shelter = p.y2 < yEnd - 40 ? (p.w * (yEnd - p.y2)) / (yEnd + 60) : 0;
      shelterW += p.shelter;
    }
  }
  function drip(x: number, y: number, r: number): void {
    for (let i = 0; i < DN; i++) {
      if (!fa[i]) {
        fa[i] = 1;
        fx[i] = x;
        fy[i] = y;
        fv[i] = 30;
        fr[i] = r;
        return;
      }
    }
  }
  // ---- snow helpers
  const SR = [0.75, 1.0, 1.3, 1.65], SA = [0.3, 0.52, 0.8];
  const CLW = [0, 1, 0, 2, 1, 0, 3, 4, 5, 3, 4, 3, 6, 7, 8, 7, 9, 10, 11, 10];
  function makeSnowFills(col: Rgb): string[] {
    const out: string[] = [];
    for (let i = 0; i < SR.length; i++) for (let j = 0; j < SA.length; j++) out.push(`rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${SA[j]})`);
    return out;
  }
  const TK = 3, TON = [0.04, 0.3, 0.62, 0.16, 0.46, 0.8];
  /** Alpha levels of the far dots (each dot's alpha is rounded to one). */
  const DOT_LEVELS = 8;
  function makeTiles(env: Env, col: Rgb): Tile[] {
    const out: Tile[] = [], d = env.dpr;
    const spec: [number, number, number, number, number, number][] = [
      [300, 70, 0.7, 1.15, 0.55, 21],
      [420, 55, 1.0, 1.7, 0.8, 30],
    ];
    let seed = 99;
    const sr = (): number => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const rgb = `${col[0] | 0},${col[1] | 0},${col[2] | 0}`;
    for (const [S, n, r0, r1, a1, speed] of spec) {
      const per: [number, number, number, number][][] = Array.from({ length: TK }, () => []);
      for (let i = 0; i < n; i++) {
        const x = sr() * S, y = sr() * S, r = r0 + sr() * (r1 - r0), a = (0.35 + sr() * 0.65) * a1;
        const lv = Math.max(1, Math.min(DOT_LEVELS, Math.round((a / a1) * DOT_LEVELS)));
        per[i % TK]!.push([x, y, r, lv]);
      }
      for (let k = 0; k < TK; k++) {
        const ds = per[k]!.sort((p, q) => p[3] - q[3]);
        const dots = new Float32Array(ds.length * 3), cuts: number[] = [], styles: string[] = [];
        ds.forEach(([x, y, r, lv], d) => {
          dots.set([x, y, r], d * 3);
          if (!d || ds[d - 1]![3] !== lv) {
            cuts.push(d);
            styles.push(`rgba(${rgb},${((lv / DOT_LEVELS) * a1).toFixed(3)})`);
          }
        });
        cuts.push(ds.length);
        let pat: CanvasPattern | null = null;
        if (!env.cpu) {
          const c = mkCanvas(S * d, S * d), g = ctx2d(c);
          g.setTransform(d, 0, 0, d, 0, 0);
          for (let k2 = 0; k2 < cuts.length - 1; k2++) {
            g.fillStyle = styles[k2]!;
            for (let q = cuts[k2]!; q < cuts[k2 + 1]!; q++) {
              const x = dots[q * 3]!, y = dots[q * 3 + 1]!, r = dots[q * 3 + 2]!;
              for (let ox = -S; ox <= S; ox += S) {
                for (let oy = -S; oy <= S; oy += S) {
                  const gx = x + ox, gy = y + oy;
                  if (gx < -3 || gx > S + 3 || gy < -3 || gy > S + 3) continue;
                  g.beginPath();
                  g.arc(gx, gy, r, 0, TAU);
                  g.fill();
                }
              }
            }
          }
          pat = env.back.createPattern(c, 'repeat')!;
          pat.setTransform(new DOMMatrix([1 / d, 0, 0, 1 / d, 0, 0]));
        }
        const j = out.length, old = tiles ? tiles[j] : undefined;
        out.push({
          S,
          dots,
          cuts,
          styles,
          pat,
          speed,
          ox: old ? old.ox : R() * S,
          oy: old ? old.oy : R() * S,
          ph: old ? old.ph : R() * TAU,
          on: old ? old.on : 0,
          front: old ? old.front : 0,
          tail: old ? old.tail : 0,
          th: TON[j]!,
          lay: j < TK ? 0 : 1,
        });
      }
    }
    return out;
  }
  for (let i = 0; i < SN; i++) sns[i] = CLW[i % CLW.length]!;
  const byClass: Int16Array[] = [];
  for (let c = 0; c < 12; c++) {
    const l: number[] = [];
    for (let i = 0; i < SN; i++) if (sns[i] === c) l.push(i);
    byClass.push(Int16Array.from(l));
  }
  const ZB = [0.2, 0.38, 0.58, 0.8], ZR = [0.18, 0.2, 0.22, 0.2];
  function newFlake(i: number, top: boolean): void {
    const ri = (sns[i]! / 3) | 0, z = ZB[ri]! + R() * ZR[ri]!;
    snz[i] = z;
    snv[i] = 24 + 30 * z + rr(-3, 3);
    snph[i] = R() * TAU;
    if (top) {
      snx[i] = rr(-60, W + 60) - snowWind * 4;
      sny[i] = -rr(4, 26);
    } else {
      snx[i] = R() * W;
      sny[i] = R() * (fadeTop + 40);
    }
    if (!sna[i]) {
      sna[i] = 1;
      snCount++;
    }
  }
  const SLN = 4096, SLT = new Float32Array(SLN);
  for (let i = 0; i < SLN; i++) SLT[i] = Math.sin((i / SLN) * TAU);
  const fsin = (a: number): number => SLT[((a * (SLN / TAU)) | 0) & (SLN - 1)]!;
  const fcos = (a: number): number => SLT[((a * (SLN / TAU) + SLN / 4) | 0) & (SLN - 1)]!;
  const snowTarget = (amt: number): number => Math.round(SN * Math.pow(amt, 1.7));
  function makeDust(env: Env): void {
    const d = env.dpr, Hs = 5;
    dustCv = mkCanvas(W * d, (panes.length || 1) * Hs * d);
    const g = ctx2d(dustCv);
    g.setTransform(d, 0, 0, d, 0, 0);
    const dc = adapt([240, 244, 252], th);
    const dcs = `${dc[0]},${dc[1]},${dc[2]}`;
    // Top-anchored: the row along the rim's top edge first, drifts reaching
    // down into the glass (drawn inside the rim: nothing speckled above the
    // frame, owner item 48).
    // the top row's alphas in steps of 0.01 (as the strings had them), a
    // style set only when it changes; the drifts below in a second pass with
    // one style (they lie under the row, so the order does not matter)
    const rowStyle: string[] = [];
    for (let i = 0; i <= 40; i++) rowStyle.push(`rgba(${dcs},${((45 + i) / 100).toFixed(2)})`);
    panes.forEach((p, k) => {
      const y0 = k * Hs;
      let cur = -1;
      for (let x = p.x + 1; x < p.x2 - 1; x += 1) {
        const n = env.fbm(x * 0.05, k * 3.1 + 0.5);
        if (n < 0.22) continue;
        const i = Math.round(40 * clamp((n - 0.22) * 3, 0, 1));
        if (i !== cur) {
          cur = i;
          g.fillStyle = rowStyle[i]!;
        }
        g.fillRect(x, y0, 1, 1);
      }
      g.fillStyle = `rgba(${dcs},0.4)`;
      for (let x = p.x + 1; x < p.x2 - 1; x += 1) {
        const n = env.fbm(x * 0.05, k * 3.1 + 0.5);
        if (n < 0.22) continue;
        const hgt = clamp((n - 0.42) * 6, 0, 2.2);
        if (hgt > 0.2) g.fillRect(x, y0 + 1, 1, hgt);
      }
      g.fillStyle = `rgba(${dcs},0.85)`;
      for (let i = 0; i < p.w / 6; i++) {
        const x = rr(p.x + 1, p.x2 - 1);
        g.fillRect(x, y0 + 1, 1, 1);
      }
      p.dustRow = k * Hs;
    });
  }

  // ================================================================= lightning
  let sky: Cv | null = null, flare: Cv | null = null, strike: Strike | null = null;
  let glowCv: Cv | null = null, washCv: Cv | null = null;
  let spCv: Cv | null = null, lowA: Cv | null = null, lowB: Cv | null = null, lowC: Cv | null = null;
  const sparks = { n: 28, x: new Float32Array(28), y: new Float32Array(28), vx: new Float32Array(28), vy: new Float32Array(28), age: 0, on: false };
  const C = (r: number, g: number, b: number, a: number): string => adaptCss(r, g, b, a, th);

  function fbm4(env: Env, x: number, y: number): number {
    return (
      env.noise(x, y) * 0.5 +
      env.noise(x * 2.1 + 3.7, y * 2.1 + 9.1) * 0.27 +
      env.noise(x * 4.3 + 11, y * 4.3 + 2) * 0.15 +
      env.noise(x * 8.7 + 5, y * 8.7 + 21) * 0.08
    );
  }
  function cloudSprite(env: Env, w: number, h: number, seed: number, core: Rgb, edge: Rgb): Cv {
    const c = mkCanvas(w, h), g = ctx2d(c), id = g.createImageData(w, h), d = id.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = (x / w) * 2 - 1;
        const fall = clamp(1 - y / h, 0, 1) ** 1.6 * clamp(1 - Math.abs(nx) ** 2.2, 0, 1);
        const n = fbm4(env, x * 0.045 + seed, y * 0.07 + seed * 0.61);
        const dens = clamp((n - 0.3) * 2.2, 0, 1);
        const lit = fall * (0.25 + 0.75 * dens), hot = clamp(lit * lit * 1.6, 0, 1);
        const i = (y * w + x) * 4;
        d[i] = edge[0] + (core[0] - edge[0]) * hot;
        d[i + 1] = edge[1] + (core[1] - edge[1]) * hot;
        d[i + 2] = edge[2] + (core[2] - edge[2]) * hot;
        d[i + 3] = 255 * clamp(lit, 0, 1);
      }
    }
    g.putImageData(id, 0, 0);
    return c;
  }
  function radialSprite(size: number, stops: [number, string][]): Cv {
    const c = mkCanvas(size, size), g = ctx2d(c), r = size / 2;
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    for (const [o, col] of stops) gr.addColorStop(o, col);
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    return c;
  }
  function subdiv(ax: number, ay: number, bx: number, by: number, rough: number, minLen: number, out: number[]): void {
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    if (len < minLen) {
      out.push(bx, by);
      return;
    }
    const off = (R() - 0.5) * rough * len;
    const mx = (ax + bx) / 2 - (dy / len) * off, my = (ay + by) / 2 + (dx / len) * off;
    subdiv(ax, ay, mx, my, rough, minLen, out);
    subdiv(mx, my, bx, by, rough, minLen, out);
  }
  const gauss = (): number => (R() + R() + R() - 1.5) * 1.15;
  function tortuous(ax: number, ay: number, bx: number, by: number, spread: number, stepMin: number, stepMax: number, out: number[]): void {
    let x = ax, y = ay, guard = 0;
    out.push(x, y);
    for (;;) {
      const dx = bx - x, dy = by - y, dist = Math.hypot(dx, dy);
      const st = rr(stepMin, stepMax);
      if (dist < st * 1.4 || ++guard > 400) {
        subdiv(x, y, bx, by, 0.3, 4, out);
        return;
      }
      const ang = Math.atan2(dy, dx) + gauss() * spread;
      const nx = x + Math.cos(ang) * st, ny = y + Math.sin(ang) * st;
      subdiv(x, y, nx, ny, 0.32, 4, out);
      x = nx;
      y = ny;
    }
  }
  function channel(segs: number[], ax: number, ay: number, bx: number, by: number, w0: number, depth: number, d0: number, inten: number, budget: { n: number }): number {
    const pts: number[] = [];
    tortuous(ax, ay, bx, by, depth ? 0.75 : 0.62, depth ? 5 : 7, depth ? 16 : 24, pts);
    const n = pts.length / 2 - 1;
    let d = d0;
    const base = Math.atan2(by - ay, bx - ax);
    for (let i = 0; i < n; i++) {
      const ax2 = pts[i * 2]!, ay2 = pts[i * 2 + 1]!, qx = pts[i * 2 + 2]!, qy = pts[i * 2 + 3]!;
      const f = i / n;
      const w = depth === 0 ? w0 * (1 - 0.5 * f) : w0 * Math.pow(1 - f, 0.85);
      segs.push(ax2, ay2, qx, qy, w, d, inten, depth);
      d += Math.hypot(qx - ax2, qy - ay2);
      const pb = depth === 0 ? 0.045 * (1.35 - f) : depth === 1 ? 0.04 * (1 - f) : 0.03 * (1 - f);
      if (depth < 3 && budget.n > 0 && i > 2 && f < 0.88 && R() < pb) {
        budget.n--;
        const side = R() < 0.5 ? -1 : 1;
        const ang = clamp(base + side * rr(0.35, 1.0), 0.25, Math.PI - 0.25);
        const remain = Math.hypot(bx - ax2, by - ay2);
        const L = Math.max(18, remain * rr(0.18, 0.55) * (depth ? 0.75 : 1));
        channel(segs, qx, qy, qx + Math.cos(ang) * L, qy + Math.sin(ang) * L, Math.max(0.7, w * 0.62), depth + 1, d, inten * 0.5, budget);
      }
    }
    return d;
  }
  function pickTarget(env: Env): { x: number; y: number; ledge: boolean } {
    const p = env.protect;
    // (nothing lands in the left band, owner item 99)
    const ledges = env.panes.filter((q) => q.y > 60 && q.id !== 'map' && q.x + q.w / 2 > bE + 40);
    const comm0 = env.panes.find((q) => q.id === 'comm');
    const comm = comm0 && comm0.x + comm0.w / 2 > bE + 40 ? comm0 : undefined;
    // Ground strikes land in the right part of the output, where lines tend to end (no text tracking, owner feedback 9).
    const gx0 = Math.max(env.out.x + env.out.w * 0.62, bE + 60), gx1 = env.out.x + env.out.w - 30;
    const u = R();
    if (u < 0.34 && ledges.length) {
      const q = ledges[(R() * ledges.length) | 0]!;
      return { x: q.x + q.border + R() * (q.w - 2 * q.border), y: q.y + q.border * 0.5, ledge: true };
    }
    if (u < 0.55 && comm) return { x: comm.x + comm.w * rr(0.25, 0.75), y: comm.y + comm.h - comm.border - 1, ledge: false };
    if (gx1 - gx0 > 60) return { x: rr(gx0, gx1), y: p.fadeTop + rr(10, 40), ledge: false };
    return { x: Math.min(W - 30, Math.max(W * rr(0.45, 0.7), bE + 60)), y: p.fadeTop + 20, ledge: false };
  }
  const nightK = (mix: Env['mix']): number => clamp(1 - 0.58 * mix.sun * mix.outdoors - 0.25 * mix.torch * (1 - mix.outdoors * mix.night), 0.3, 1);

  /**
   * The strike's sprites (the bolt with its glow, the afterglow) and the rim
   * lights, in steps: one step per frame of the stepped leader (85–140 ms,
   * which draws none of them), the rest at once when the return stroke
   * comes. They were all made in the strike's first frame (performance
   * review, item 109).
   */
  function* prepStrike(env: Env, s: Strike, buckets: Map<number, Bucket>, dpr: number): Generator<void, void> {
    const { bx0, by0, sw, sh, fog, segs } = s;
    if (!spCv) {
      spCv = mkCanvas(1, 1);
      lowA = mkCanvas(1, 1);
      lowB = mkCanvas(1, 1);
      lowC = mkCanvas(1, 1);
    }
    const LA = lowA!, LB = lowB!, LC = lowC!;
    spCv.width = Math.ceil(sw * dpr);
    spCv.height = Math.ceil(sh * dpr);
    // The strike's sprites are drawn once per strike on CPU canvases
    // (willReadFrequently): big stroked paths and blur filters on a GPU
    // canvas run on the GPU thread for tens of ms and hold up the page's
    // frames (stage 28 E). Drawing the finished sprites is a texture upload.
    const g = ctx2dCpu(spCv);
    g.setTransform(dpr, 0, 0, dpr, -bx0 * dpr, -by0 * dpr);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const q = s.q;
    LA.width = Math.ceil(sw / q) + 2;
    LA.height = Math.ceil(sh / q) + 2;
    LB.width = LA.width;
    LB.height = LA.height;
    LC.width = LA.width;
    LC.height = LA.height;
    const ga = ctx2dCpu(LA);
    ga.setTransform(1 / q, 0, 0, 1 / q, -bx0 / q, -by0 / q);
    ga.lineCap = 'round';
    ga.lineJoin = 'round';
    for (const b of buckets.values()) {
      ga.strokeStyle = C(b.lev ? 150 : 175, b.lev ? 120 : 160, 255, b.lev ? 0.5 * b.inten : 1);
      ga.lineWidth = b.w * 5 + 6;
      ga.stroke(b.p);
    }
    yield;
    const gb = ctx2dCpu(LB);
    gb.filter = 'blur(2.5px)';
    gb.drawImage(LA, 0, 0);
    gb.filter = 'none';
    yield;
    const gc = ctx2dCpu(LC);
    gc.filter = 'blur(9px)';
    gc.drawImage(LA, 0, 0);
    gc.filter = 'none';
    yield;
    // on a light background the glow layers stack normally (they are dark)
    g.globalCompositeOperation = th.light ? 'source-over' : 'lighter';
    g.save();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 0.9 * fog * (th.light ? 0.5 : 1);
    g.drawImage(LC, 0, 0, LC.width * q, LC.height * q);
    g.globalAlpha = th.light ? 0.45 : 0.8;
    g.drawImage(LB, 0, 0, LB.width * q, LB.height * q);
    g.restore();
    yield;
    for (const b of buckets.values()) {
      g.strokeStyle = C(165, 185, 255, 0.42 * (b.lev ? b.inten * 1.4 : 1));
      g.lineWidth = b.w * 2.6 + 1.5;
      g.stroke(b.p);
    }
    yield;
    g.globalCompositeOperation = 'source-over';
    for (const b of buckets.values()) {
      g.strokeStyle = b.lev === 0 ? C(255, 255, 255, 1) : C(235, 240, 255, clamp(b.inten * 1.7, 0.25, 1));
      g.lineWidth = Math.max(0.6, b.w * (b.lev ? 0.85 : 1));
      g.stroke(b.p);
    }
    cutBand(g, bx0, by0, sh);
    yield;
    const ag = ctx2dCpu(LA);
    ag.setTransform(1, 0, 0, 1, 0, 0);
    ag.clearRect(0, 0, LA.width, LA.height);
    ag.setTransform(1 / q, 0, 0, 1 / q, -bx0 / q, -by0 / q);
    for (const b of buckets.values()) {
      if (b.lev !== 0) continue;
      ag.strokeStyle = C(170, 110, 255, 1);
      ag.lineWidth = b.w * 3 + 4;
      ag.stroke(b.p);
    }
    for (const b of buckets.values()) {
      if (b.lev !== 0) continue;
      ag.strokeStyle = C(235, 215, 255, 1);
      ag.lineWidth = b.w * 0.9;
      ag.stroke(b.p);
    }

    cutBand(ag, bx0, by0, sh);
    yield;
    // Every rim, a clear pane's too (ADR 0095 round 3).
    for (const p of env.rims) {
      let best = 1e9, nx = 0, ny = 0;
      for (let i = 0; i < segs.length; i += 32) {
        if (segs[i + 7] !== 0) continue;
        const x = segs[i]!, y = segs[i + 1]!;
        const dx = x < p.x ? p.x - x : x > p.x + p.w ? x - p.x - p.w : 0;
        const dy = y < p.y ? p.y - y : y > p.y + p.h ? y - p.y - p.h : 0;
        const dd = Math.hypot(dx, dy);
        if (dd < best) {
          best = dd;
          nx = x;
          ny = y;
        }
      }
      // Every frame line lights up briefly (owner feedback 20); the ones near the bolt most.
      if (!p.border) continue;
      const k = Math.max(0.3, 1 / (1 + best / 160));
      const behind = best === 0;
      // The lines along the left / right / top edge, as the rects a 1.5 px
      // (rim) or b px (band) butt-capped stroke covers, following the rim's
      // rounded corners (rimshape.ts: no square corner outside the glass,
      // owner item 45).
      const rim: number[] = [], band: number[] = [], b = Math.max(p.border, 2), d = env.dpr;
      const L = nx < p.x + p.w / 2;
      if (behind || L) {
        rimRects(rim, p, 'l', p.y + 0.75, p.y + p.h, 1.5, d);
        rimRects(band, p, 'l', p.y + b / 2, p.y + p.h, b, d);
      }
      if (behind || !L) {
        rimRects(rim, p, 'r', p.y + 0.75, p.y + p.h, 1.5, d);
        rimRects(band, p, 'r', p.y + b / 2, p.y + p.h, b, d);
      }
      // the top rim and the nameplate with it, its whole glass (owner item 49)
      rimRects(rim, p, 't', p.x, p.x + p.w, 1.5, d);
      rimRects(band, p, 't', p.x, p.x + p.w, b, d);
      plateRects(band, p, p.x, p.x + p.w, d);
      if (behind || k > 0.5) rimRects(band, p, 'b', p.x, p.x + p.w, b, d);
      const gr = env.front.createRadialGradient(nx, ny, 0, nx, ny, Math.max(260, p.h * 0.9));
      gr.addColorStop(0, C(235, 240, 255, 1));
      gr.addColorStop(0.45, C(170, 175, 255, 0.75));
      gr.addColorStop(1, C(120, 110, 255, 0.08));
      // a frame in the left band lights up as much as the sky shows there (owner item 99)
      s.rims.push({ rim, band, gr, k: k * (behind ? 1.15 : 1) * bk(p.x + p.w / 2) });
    }
  }

  function startStrike(env: Env): void {
    const tg = pickTarget(env);
    const map = env.panes.find((q) => q.id === 'map');
    let x0 = 0;
    for (let k = 0; k < 8; k++) {
      // the bolt comes down right of the left band (owner item 99)
      x0 = clamp(tg.x + (tg.ledge ? rr(-110, 110) : rr(-260, 220)), Math.min(bE + 60, W - 20), W - 20);
      if (!map || x0 < map.x - 30 || x0 > map.x + map.w + 30 || (!tg.ledge && R() < 0.08)) break;
    }
    const y0 = -8, segs: number[] = [];
    const mainLen = channel(segs, x0, y0, tg.x, tg.y, rr(2.4, 3.1), 0, 0, 1, { n: 22 });
    const fog = 1 - 0.3 * env.mix.fog;
    let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
    for (let i = 0; i < segs.length; i += 8) {
      bx0 = Math.min(bx0, segs[i]!, segs[i + 2]!);
      bx1 = Math.max(bx1, segs[i]!, segs[i + 2]!);
      by0 = Math.min(by0, segs[i + 1]!, segs[i + 3]!);
      by1 = Math.max(by1, segs[i + 1]!, segs[i + 3]!);
    }
    const pad = 70;
    bx0 = Math.floor(bx0 - pad);
    by0 = Math.floor(Math.max(-pad, by0 - pad));
    bx1 = Math.ceil(bx1 + pad);
    by1 = Math.ceil(by1 + pad);
    const sw = bx1 - bx0, sh = by1 - by0, dpr = env.dpr;
    const nseg = segs.length / 8;
    const buckets = new Map<number, Bucket>();
    for (let i = 0; i < segs.length; i += 8) {
      const lev = segs[i + 7]! | 0, wq = Math.round(segs[i + 4]! * 3), key = lev * 64 + wq;
      let b = buckets.get(key);
      if (!b) {
        b = { p: new Path2D(), w: wq / 3, lev, inten: segs[i + 6]! };
        buckets.set(key, b);
      }
      b.p.moveTo(segs[i]!, segs[i + 1]!);
      b.p.lineTo(segs[i + 2]!, segs[i + 3]!);
    }
    // the glow over the sky, with the band taken out (once per strike)
    if (sky) {
      const gw = 1120, gh = H * 0.62, gx = x0 - 560, gy = -40;
      if (!glowCv) glowCv = mkCanvas(1, 1);
      glowCv.width = 280;
      glowCv.height = Math.max(1, Math.ceil(gh / 4));
      const gg = ctx2dCpu(glowCv);
      gg.setTransform(1, 0, 0, 1, 0, 0);
      gg.clearRect(0, 0, glowCv.width, glowCv.height);
      gg.setTransform(280 / gw, 0, 0, glowCv.height / gh, -gx * (280 / gw), -gy * (glowCv.height / gh));
      gg.drawImage(sky, gx, gy, gw, gh);
      cutBand(gg, gx, gy, gh);
    }
    const strokes = [0, 1];
    const nre = 1 + ((R() * 3) | 0);
    let t = 0;
    for (let k = 0; k < nre; k++) {
      t += rr(0.06, 0.14);
      strokes.push(t, rr(0.6, 0.95));
    }
    /** The low-resolution glow layers' factor. */
    const q = 4;
    const nk0 = nightK(env.mix);
    strike = {
      segs,
      nseg,
      mainLen,
      tLead: rr(0.085, 0.14),
      sweep: 12,
      el: 0,
      strokes,
      end: t + rr(0.7, 1.0),
      bx0,
      by0,
      sw,
      sh,
      q,
      x0,
      tx: tg.x,
      ty: tg.y,
      ledge: tg.ledge,
      fog,
      rims: [],
      leadStep: -1,
      ls1: C(130, 120, 255, 0.16 * nk0),
      ls2: C(190, 200, 255, 0.38 + 0.2 * nk0),
      prep: null,
    };
    strike.prep = prepStrike(env, strike, buckets, dpr);
    sparks.on = false;
  }

  function bright(s: Strike, t: number): number {
    let b = 0;
    const st = s.strokes;
    for (let i = 0; i < st.length; i += 2) {
      const d = t - st[i]!;
      if (d >= 0) b = Math.max(b, st[i + 1]! * (d < 0.012 ? 1 : Math.exp(-(d - 0.012) / 0.045)));
    }
    return b;
  }
  /** A strike's setup runs this long per leader frame at most (ms; one step at least, `prepStrike`). */
  const PREP_MS = 6;
  /** The stepped leader, redrawn per step on a CPU canvas (see the strike sprites) and drawn as an image. */
  let leadCv: Cv | null = null;
  function drawLeader(c: Ctx, s: Strike, dpr: number): void {
    const prog = clamp(s.el / s.tLead, 0, 1);
    const step = Math.ceil(prog * s.sweep);
    const op: GlobalCompositeOperation = th.light ? 'source-over' : 'lighter';
    leadCv ??= mkCanvas(1, 1);
    if (step !== s.leadStep) {
      s.leadStep = step;
      const reach = (step / s.sweep) * s.mainLen, segs = s.segs;
      const lead = new Path2D(), tip = new Path2D();
      for (let n = 0, i = 0; n < s.nseg; n++, i += 8) {
        const d = segs[i + 5]!;
        if (d > reach) continue;
        lead.moveTo(segs[i]!, segs[i + 1]!);
        lead.lineTo(segs[i + 2]!, segs[i + 3]!);
        if (d > reach - (s.mainLen / s.sweep) * 1.3) {
          tip.moveTo(segs[i]!, segs[i + 1]!);
          tip.lineTo(segs[i + 2]!, segs[i + 3]!);
        }
      }
      const w = Math.ceil(s.sw * dpr), h = Math.ceil(s.sh * dpr);
      if (leadCv.width !== w || leadCv.height !== h) {
        leadCv.width = w;
        leadCv.height = h;
      }
      const g = ctx2dCpu(leadCv);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, w, h);
      g.setTransform(dpr, 0, 0, dpr, -s.bx0 * dpr, -s.by0 * dpr);
      g.lineCap = 'round';
      g.globalCompositeOperation = op;
      g.strokeStyle = s.ls1;
      g.lineWidth = 5;
      g.stroke(lead);
      g.strokeStyle = s.ls2;
      g.lineWidth = 1;
      g.stroke(lead);
      g.strokeStyle = C(235, 240, 255, 0.95);
      g.lineWidth = 1.6;
      g.stroke(tip);
      g.globalCompositeOperation = 'source-over';
      cutBand(g, s.bx0, s.by0, s.sh);
    }
    c.globalCompositeOperation = op;
    c.drawImage(leadCv, s.bx0, s.by0, s.sw, s.sh);
    c.globalCompositeOperation = 'source-over';
  }
  const PS = { lead: false, fl: 0, B: 0, A: 0, V: 0, flashK: 0, nk: 1 };
  function paintBack(b: Ctx, s: Strike, P: typeof PS, dpr: number): void {
    // glows add on dark; on light they tint (multiply) and the bolt draws over
    const add = th.add, over: GlobalCompositeOperation = th.light ? 'source-over' : 'lighter';
    if (P.lead) {
      drawLeader(b, s, dpr);
      if (glowCv) {
        b.globalCompositeOperation = add;
        b.globalAlpha = P.fl * 0.6;
        b.drawImage(glowCv, s.x0 - 560, -40, 1120, H * 0.62);
      }
    } else {
      b.globalCompositeOperation = add;
      if (glowCv && P.B > 0.03) {
        b.globalAlpha = clamp(P.B * P.flashK * 0.4, 0, 1);
        b.drawImage(glowCv, s.x0 - 560, -40, 1120, H * 0.62);
      }
      if (P.B > 0.05 && washCv) {
        b.globalAlpha = clamp(P.B * P.B * P.flashK * 0.06, 0, 1);
        b.drawImage(washCv, 0, 0, W, H * 0.85);
      }
      b.globalCompositeOperation = over;
      if (P.A > 0.01 && lowA) {
        b.globalAlpha = P.A * 0.6;
        b.drawImage(lowA, s.bx0, s.by0, lowA.width * s.q, lowA.height * s.q);
      }
      if (P.V > 0.02 && spCv) {
        b.globalAlpha = clamp(P.V * (0.8 + 0.35 * P.nk) * s.fog, 0, 1);
        b.drawImage(spCv, s.bx0, s.by0, s.sw, s.sh);
      }
    }
    b.globalAlpha = 1;
    b.globalCompositeOperation = 'source-over';
  }
  function drawStrike(env: Env, dt: number, nk: number): number {
    const s = strike!, f = env.front, b = env.back, P = PS;
    s.el += dt;
    if (s.prep) {
      // steps for up to PREP_MS per leader frame; all that is left once the return stroke comes
      if (s.el < s.tLead) {
        const until = performance.now() + PREP_MS;
        do {
          if (s.prep.next().done) {
            s.prep = null;
            break;
          }
        } while (performance.now() < until);
      } else {
        while (!s.prep.next().done);
        s.prep = null;
      }
    }
    P.nk = nk;
    let flash = 0;
    if (s.el < s.tLead) {
      P.lead = true;
      P.fl = (0.05 + 0.05 * R()) * nk;
      flash = P.fl;
    } else {
      const t = s.el - s.tLead;
      if (t > s.end) {
        strike = null;
        return 0;
      }
      const B = bright(s, t);
      const last = s.strokes[s.strokes.length - 2]!;
      P.lead = false;
      P.B = flash = B;
      P.A = t < last ? 0.22 : 0.22 * Math.exp(-(t - last) / 0.28);
      P.V = Math.max(B, P.A);
      P.flashK = (0.35 + 0.55 * nk) * (2 - s.fog);
      if (B > 0.04) {
        for (const r of s.rims) {
          f.fillStyle = r.gr;
          f.globalAlpha = clamp(B * r.k * 0.35, 0, 1);
          for (let i = 0; i < r.band.length; i += 4) f.fillRect(r.band[i]!, r.band[i + 1]!, r.band[i + 2]!, r.band[i + 3]!);
          f.globalAlpha = clamp(B * r.k * 1.1, 0, 1);
          for (let i = 0; i < r.rim.length; i += 4) f.fillRect(r.rim[i]!, r.rim[i + 1]!, r.rim[i + 2]!, r.rim[i + 3]!);
        }
        f.globalAlpha = 1;
      }
      if (s.ledge) {
        if (!sparks.on && t < 0.05) {
          sparks.on = true;
          sparks.age = 0;
          for (let i = 0; i < sparks.n; i++) {
            const a = rr(-Math.PI * 0.95, -Math.PI * 0.05), v = rr(60, 340);
            sparks.x[i] = s.tx;
            sparks.y[i] = s.ty;
            sparks.vx[i] = Math.cos(a) * v;
            sparks.vy[i] = Math.sin(a) * v;
          }
        }
        if (B > 0.03 && flare) {
          f.globalCompositeOperation = th.add;
          f.globalAlpha = clamp(B, 0, 1);
          f.drawImage(flare, s.tx - 48, s.ty - 48, 96, 96);
          f.globalAlpha = 1;
          f.globalCompositeOperation = 'source-over';
        }
      }
    }
    paintBack(b, s, P, env.dpr);
    return flash;
  }
  function drawSparks(f: Ctx, dt: number, dpr: number): void {
    sparks.age += dt;
    const life = 0.65;
    if (sparks.age > life) {
      sparks.on = false;
      return;
    }
    const a = 1 - sparks.age / life;
    // One rotated 1.3 px rect per spark (a stroked many-subpath path costs
    // tens to hundreds of ms on the GPU thread; see the rain streaks).
    f.fillStyle = C((220 + 35 * a) | 0, (200 + 50 * a) | 0, 255, a * 0.95);
    for (let i = 0; i < sparks.n; i++) {
      const x = sparks.x[i]!, y = sparks.y[i]!;
      sparks.vy[i]! += 700 * dt;
      sparks.x[i]! += sparks.vx[i]! * dt;
      sparks.y[i]! += sparks.vy[i]! * dt;
      const dx = sparks.x[i]! - x, dy = sparks.y[i]! - y, len = Math.hypot(dx, dy);
      if (len < 0.01) continue;
      const cs = dx / len, sn = dy / len;
      f.setTransform(dpr * cs, dpr * sn, -dpr * sn, dpr * cs, dpr * sparks.x[i]!, dpr * sparks.y[i]!);
      f.fillRect(-len - 0.65, -0.65, len + 1.3, 1.3);
    }
    f.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function themeInit(env: Env): void {
    th = env.theme;
    LIFT = th.light ? 0 : 255;
    if (th.light) {
      const t = {} as typeof TINT_DARK;
      for (const k of TKEYS) {
        const a = adapt([TINT_DARK[k][0], TINT_DARK[k][1], TINT_DARK[k][2]], th, 0.18, 0.6);
        t[k] = [a[0], a[1], a[2], TINT_DARK[k][3]];
      }
      TINT = t;
    } else TINT = TINT_DARK;
    dropSets.clear();
    ST.key = -1;
  }

  return {
    id: 'weather',
    init(env) {
      themeInit(env);
      sky = cloudSprite(env, 220, 90, 7.3, [235, 238, 255], [110, 100, 200]);
      flare = radialSprite(96, [
        [0, C(255, 255, 255, 1)],
        [0.12, C(225, 230, 255, 0.9)],
        [0.4, C(150, 140, 255, 0.3)],
        [1, C(110, 90, 255, 0)],
      ]);
      stepTint(env.mix);
      rebuildStyles();
      pl.fill(0);
      fa.fill(0);
      va.fill(0);
      strike = null;
      sparks.on = false;
      env.shared.flash = 0;
      env.shared.boltX = 0;
    },
    resize(env) {
      W = env.W;
      H = env.H;
      bS = bandSolid(W);
      bE = bandEnd(W);
      fadeTop = env.protect.fadeTop;
      buildPanes(env);
      seedRain(false);
      const m = env.mix;
      for (const p of panes) {
        p.wet = m.rain * (0.5 + 0.5 * m.heavy);
        p.dust = m.snow * 0.6;
      }
      // the flash's wash over the screen, with the left band taken out, at an eighth of the size (owner item 99)
      if (!washCv) washCv = mkCanvas(1, 1);
      const wh = H * 0.85;
      washCv.width = Math.max(1, Math.ceil(W / 8));
      washCv.height = Math.max(1, Math.ceil(wh / 8));
      const wg = ctx2dCpu(washCv);
      wg.setTransform(washCv.width / W, 0, 0, washCv.height / wh, 0, 0);
      const wash = wg.createLinearGradient(0, 0, 0, wh);
      wash.addColorStop(0, 'rgba(205,210,255,1)');
      wash.addColorStop(0.5, 'rgba(150,150,240,0.45)');
      wash.addColorStop(1, 'rgba(120,110,230,0)');
      wg.fillStyle = wash;
      wg.fillRect(0, 0, W, wh);
      cutBand(wg, 0, 0, wh);
      stepTint(m);
      snowCol = [lift(tint.r, 0.55), lift(tint.g, 0.55), lift(tint.b, 0.55)];
      snowFills = makeSnowFills(snowCol);
      tiles = makeTiles(env, snowCol);
      for (let i = 0; i < SN; i++) {
        if (sna[i]) {
          snx[i] = Math.min(snx[i]!, W);
          sny[i] = Math.min(sny[i]!, fadeTop + 40);
        }
      }
      makeDust(env);
      strike = null;
      sparks.on = false;
      pl.fill(0);
      fa.fill(0);
      va.fill(0);
    },
    onEvent(env, name) {
      if (name === 'strike' && W && env.cats.lightning) startStrike(env);
      if (name === 'gust') gNext = 0;
    },
    frame(env, dt) {
      if (!W) return false;
      const m = env.mix, b = env.back, f = env.front;
      stepTint(m);
      rebuildStyles();
      drops = dropSet();
      const out = m.outdoors, rain = m.rain, heavy = m.heavy, lum = tint.lum;
      const lumA = 0.55 + 0.45 * lum;
      const nk = nightK(m);
      rainT += dt;
      let busy = false;

      // Snow begins with the raw value, without the dwell (owner item 98); it stops only once settled (then fades, item 91).
      const wx = env.cats.precipitation ? (env.raw.weather === '*' ? '*' : env.settled.weather) : null;
      const isRain = wx === "'" || wx === '"', isSnow = wx === '*';
      const jumpR = rain > 0.97 && prevRainMix < 0.5, jumpS = m.snow > 0.97 && prevSnowMix < 0.5;
      if (isRain && (jumpR || (prevW === null && wx !== prevW))) {
        rainAmt = 1;
        seedRain(true);
      }
      if (isSnow && (jumpS || prevW === undefined)) {
        snowAmt = 1;
        snowFade = 1;
        for (let i = 0; i < SN; i++) newFlake(i, false);
        if (tiles) {
          for (const T of tiles) {
            T.on = 1;
            T.tail = 0;
            T.front = 1e5;
          }
        }
      } else if (isSnow && prevW !== wx) {
        // snow begins: at once and dense (item 93), but falling in from the top (item 98)
        if (snCount === 0) snowFade = 1;
        snowAmt = Math.max(snowAmt, SNOW_START);
        // spread over a screen's height above the top: a steady stream that fills the screen from the top down
        const n = snowTarget(snowAmt);
        for (let i = 0; i < SN && snCount < n; i++) {
          if (sna[i]) continue;
          newFlake(i, true);
          sny[i] = -rr(4, fadeTop + 40);
        }
        if (tiles) {
          for (const T of tiles) {
            if (T.on || T.th > snowAmt) continue;
            T.on = 1;
            T.tail = 0;
            T.front = 0;
          }
        }
      }
      prevW = wx;
      prevRainMix = rain;
      prevSnowMix = m.snow;
      // the build-ups run at the dev time scale (`env.speed`, 1 in the game and the demo)
      rainAmt = isRain ? Math.min(1, rainAmt + (dt * env.speed) / 6) : Math.max(0, rainAmt - dt / 3);
      snowAmt = isSnow ? Math.min(1, snowAmt + (dt * env.speed) / 26) : Math.max(0, snowAmt - dt / 10);
      // Snow that stopped fades out over SNOW_FADE_S (item 91), then is gone.
      const fade0 = snowFade;
      snowFade = snowFadeStep(snowFade, isSnow, dt);
      if (!isSnow && snowFade <= 0 && fade0 > 0) {
        sna.fill(0);
        snCount = 0;
        snowAmt = 0;
        if (tiles) for (const T of tiles) {
          T.on = 0;
          T.tail = T.front = 0;
        }
        for (const p of panes) p.dust = 0;
      }
      const snowVis = snowFadeAlpha(snowFade);
      if (rainAmt > 0 || snowAmt > 0) busy = true;

      let lit = 0;
      if (strike && strike.el >= strike.tLead) lit = bright(strike, strike.el - strike.tLead);

      const gust = Math.max(0, env.noise(rainT * 0.32, 3.7) - 0.42) * 2.4;
      const wantWind = 0.06 + 0.1 * heavy + heavy * gust * 0.16;
      wind += (wantWind - wind) * Math.min(1, dt * 2);

      // ---- rain streaks, stopping on pane tops
      const ramp = Math.pow(rainAmt, 1.3);
      const cnt = isRain ? Math.min(RN, Math.round(ramp * (95 + 245 * heavy))) : 0;
      splashBudget = Math.ceil(dt * Math.max(rain, ramp) * (22 + 100 * heavy));
      {
        const sp = (900 + 300 * heavy) * dt, Lb = 9 + 15 * (0.4 + 0.6 * heavy), yEnd = fadeTop + 30, sl = wind;
        const glow = (0.16 + 0.14 * m.sun) * (0.55 + 0.45 * lum) * (1 - 0.35 * m.fog) * (0.75 + 0.25 * rain) + lit * 0.55 * nk;
        // Streaks as sheared 1 px rects, not one stroked path: a stroked path
        // with hundreds of subpaths across the screen goes to Skia's software
        // path renderer on the GPU thread (a full-screen mask per frame, tens
        // of ms), which delays the page's own frames (ADR 0091, stage 28 E).
        const lw = th.light ? 1.1 : 1;
        b.setTransform(env.dpr, 0, sl * env.dpr, env.dpr, 0, 0);
        const rainA = 0.25 + 0.75 * out;
        b.globalAlpha = rainA;
        b.fillStyle = ST.rain[clamp(Math.round(glow * 20), 0, 20)]!;
        for (let i = 0; i < RN; i++) {
          if (!ra[i]) {
            if (i >= cnt) continue;
            ra[i] = 1;
            ry[i] = -rr(20, 220);
            rx[i] = rr(-wind * H - 40, W + 20);
          }
          busy = true;
          const oy = ry[i]!;
          const y = oy + sp * rs[i]!;
          let x = rx[i]! + sp * rs[i]! * sl;
          if (y > yEnd) {
            if (i >= cnt) ra[i] = 0;
            else respawn(i);
            continue;
          }
          let hit = false;
          for (let k = 0; k < panes.length; k++) {
            const p = panes[k]!;
            if (x < p.x || x > p.x2 || y < p.y || y > p.y2) continue;
            if (oy <= p.y + 1) {
              p.wetIn += 1;
              if (splashBudget > 0 && R() < 0.55) {
                splashBudget--;
                splash(x, p.y, false);
              }
            }
            hit = true;
            break;
          }
          if (hit) {
            if (i >= cnt) ra[i] = 0;
            else respawn(i);
            continue;
          }
          if (x > W + 30) x -= W + 60;
          rx[i] = x;
          ry[i] = y;
          if (y < -40) continue;
          const L = Lb * rl[i]!;
          // none in the left band, fading in along the sky's curve (owner item 99)
          if (x < bE) {
            const k = bk(x);
            if (k < 0.004) continue;
            b.globalAlpha = rainA * k;
            b.fillRect(x - sl * y - lw / 2, y - L, lw, L);
            b.globalAlpha = rainA;
            continue;
          }
          // (x, y) → (x - L·sl, y - L) under x' = u + sl·v
          b.fillRect(x - sl * y - lw / 2, y - L, lw, L);
        }
        b.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
        b.globalAlpha = 1;
      }

      // ---- wetness, eaves, rivulets
      const dryK = 0.012 + 0.02 * (1 - rain) + 0.12 * (1 - out);
      for (let k = 0; k < panes.length; k++) {
        const p = panes[k]!;
        const inflow = (p.wetIn / Math.max(40, p.w)) * 1.4;
        p.wetIn = 0;
        p.wet = Math.min(1, p.wet + inflow * 0.06 + rain * dt * 0.03) * (1 - dt * dryK);
        if (p.wet < 0.003) p.wet = 0;
        else busy = true;
        if (p.eavesOk && p.wet > 0.02) {
          for (let e = 0; e < p.eaves.length; e++) {
            p.bead[e]! += dt * p.wet * p.rate[e]! * (0.12 + 0.75 * heavy) * (e < 2 ? 1.5 : 1) * out;
            if (p.bead[e]! >= 1) {
              p.bead[e] = R() * 0.15;
              drip(p.eaves[e]!, p.y2 + 3, 1.6 + R() * 0.8);
            }
          }
        }
        if (R() < dt * p.wet * (0.08 + 0.6 * heavy) * out) {
          for (let i = 0; i < VN; i++) {
            if (!va[i]) {
              va[i] = 1;
              vp[i] = k;
              vside[i] = R() < 0.5 ? 0 : 1;
              vy0[i] = vy[i] = p.y + 1;
              vv[i] = 0;
              vseed[i] = R() * 50;
              // Down the rim's outer edge: the drop's centre half a px
              // outside it, so it straddles the dark edge (owner item 41;
              // 2 px out, tuned for the old thin line, it hung in the air).
              vx[i] = vside[i] ? p.x2 + RIV_OUT : p.x - RIV_OUT;
              break;
            }
          }
        }
      }

      // ---- splashes
      // Each segment a rotated rect (not one stroked path: see the rain streaks).
      f.fillStyle = ST.splash;
      const splA = Math.min(1, 0.62 * lumA * (1 + lit));
      f.globalAlpha = splA;
      const dp = env.dpr;
      let anyS = false, splCur = splA;
      for (let i = 0; i < PN; i++) {
        if (pl[i]! <= 0) continue;
        pl[i]! -= dt;
        pvy[i]! += 620 * dt;
        px[i]! += pvx[i]! * dt;
        py[i]! += pvy[i]! * dt;
        if (py[i]! > pfloor[i]! + 1) {
          pl[i] = 0;
          continue;
        }
        const vx0 = pvx[i]!, vy0s = pvy[i]!, len = Math.sqrt(vx0 * vx0 + vy0s * vy0s) * 0.014;
        if (len < 0.01) continue;
        const cs = vx0 * 0.014 / len, sn = vy0s * 0.014 / len, sk = bk(px[i]!);
        if (sk < 0.004) continue;
        // (set only when it changes: the same right of the band)
        const sa = splA * sk;
        if (sa !== splCur) {
          splCur = sa;
          f.globalAlpha = sa;
        }
        f.setTransform(dp * cs, dp * sn, -dp * sn, dp * cs, dp * px[i]!, dp * py[i]!);
        f.fillRect(-len - 0.55, -0.55, len + 1.1, 1.1);
        anyS = true;
      }
      f.setTransform(dp, 0, 0, dp, 0, 0);
      if (anyS) busy = true;
      f.globalAlpha = 1;

      // ---- rivulets crawling down pane sides
      for (let i = 0; i < VN; i++) {
        if (!va[i]) continue;
        const p = panes[vp[i]!];
        if (!p) {
          va[i] = 0;
          continue;
        }
        busy = true;
        const go = env.noise(vy[i]! * 0.04, vseed[i]!) > 0.35 ? 1 : 0.08;
        vv[i]! += ((25 + 60 * heavy) * go - vv[i]!) * Math.min(1, dt * 5);
        vy[i]! += vv[i]! * dt;
        // to where the rim's lower corner starts to round off (its bead hangs under the corner)
        const yEnd = Math.min(p.y2 - (p.bw ? RIV_CORNER : 0), fadeTop);
        if (vy[i]! >= yEnd) {
          va[i] = 0;
          if (p.eavesOk) p.bead[vside[i]!] = Math.min(1.2, p.bead[vside[i]!]! + 0.45);
          continue;
        }
        const tl = Math.min(vy[i]! - vy0[i]!, 40), vk = bk(vx[i]!);
        if (vk < 0.004) continue;
        f.fillStyle = ST.tail;
        f.globalAlpha = 0.1 * lumA * vk;
        f.fillRect(vx[i]! - 0.6, vy[i]! - tl, 1.2, tl * 0.6);
        f.globalAlpha = 0.3 * lumA * vk;
        f.fillRect(vx[i]! - 0.6, vy[i]! - tl * 0.4, 1.2, tl * 0.4);
        drawDrop(f, vx[i]!, vy[i]!, 1.6, 1.2, 1);
      }

      // ---- hanging beads under the eaves
      const beadA = Math.min(1, 0.9 * lumA + lit * 0.3);
      for (let k = 0; k < panes.length; k++) {
        const p = panes[k]!;
        if (!p.eavesOk || p.wet < 0.02) continue;
        for (let e = 0; e < p.eaves.length; e++) {
          const bb = Math.min(1, p.bead[e]!);
          if (bb < 0.15) continue;
          const r = 0.8 + 2.1 * bb, st = 1 + Math.max(0, bb - 0.6) * 1.4;
          drawDrop(f, p.eaves[e]!, p.y2 + r * st * 0.8, r, st, beadA * Math.min(1, p.wet * 8) * (0.3 + 0.7 * out));
        }
      }

      // ---- falling drips
      f.fillStyle = ST.tail;
      for (let i = 0; i < DN; i++) {
        if (!fa[i]) continue;
        busy = true;
        const oy = fy[i]!;
        fv[i]! += 1150 * dt;
        fy[i]! += fv[i]! * dt;
        fx[i]! += wind * fv[i]! * dt * 0.25;
        if (fy[i]! > fadeTop + 20) {
          fa[i] = 0;
          continue;
        }
        let hit = false;
        for (let k = 0; k < panes.length; k++) {
          const p = panes[k]!;
          if (fx[i]! >= p.x && fx[i]! <= p.x2 && oy <= p.y && fy[i]! > p.y) {
            splash(fx[i]!, p.y, true);
            p.wet = Math.min(1, p.wet + 0.01);
            hit = true;
            break;
          }
        }
        if (hit) {
          fa[i] = 0;
          continue;
        }
        const tl = Math.min(fv[i]! * 0.03, 22);
        f.globalAlpha = 0.22 * lumA * bk(fx[i]!);
        f.fillRect(fx[i]! - 0.5, fy[i]! - tl, 1, tl);
        drawDrop(f, fx[i]!, fy[i]!, fr[i]!, 1 + Math.min(0.8, fv[i]! / 500), beadA);
      }
      f.globalAlpha = 1;

      // ---- snow
      const snow = m.snow;
      snowT += dt;
      snowWind = (env.noise(snowT * 0.08, 9.1) - 0.5) * 40 + 6;
      const nTarget = isSnow ? snowTarget(snowAmt) : 0;
      if (gAge < 0) {
        if (snowAmt > 0.25 && (gNext -= dt) <= 0) {
          gAge = 0;
          gDur = rr(4, 7);
          gPow = rr(0.7, 1.15) * (0.6 + 0.4 * snowAmt);
          gDir = R() < 0.62 ? (snowWind >= 6 ? 1 : -1) : snowWind >= 6 ? -1 : 1;
        }
        gE = 0;
      } else {
        gAge += dt;
        const p = gAge / gDur;
        if (p >= 1) {
          gAge = -1;
          gNext = rr(10, 24);
          gE = 0;
        } else {
          const e = p < 0.25 ? Math.sin(((p / 0.25) * Math.PI) / 2) : Math.cos((((p - 0.25) / 0.75) * Math.PI) / 2);
          gE = e * e * gPow;
        }
      }
      const gx = gDir * 150 * gE;
      gShift += gx * 0.55 * dt;
      snowColAge += dt;
      let tileOn = false;
      if (tiles) for (let i = 0; i < tiles.length; i++) if (tiles[i]!.on || tiles[i]!.tail < tiles[i]!.front) tileOn = true;
      if (snowFills && tiles && (snCount > 0 || isSnow || snowAmt > 0 || tileOn)) {
        const cr = lift(tint.r, 0.55), cg = lift(tint.g, 0.55), cbb = lift(tint.b, 0.55);
        if (snowColAge > 0.3 && Math.abs(cr - snowCol[0]) + Math.abs(cg - snowCol[1]) + Math.abs(cbb - snowCol[2]) > 9) {
          snowCol = [cr, cg, cbb];
          snowFills = makeSnowFills(snowCol);
          tiles = makeTiles(env, snowCol);
          snowColAge = 0;
        }
        const yEnd = fadeTop + 40, tt = snowT, eddy = gE > 0.02;
        const A1 = 75 * gE, A2 = 48 * gE, k1 = TAU / 330, k2 = TAU / 210;
        // (a higher floor at night: the dim night tint made the first flakes all but invisible, item 93)
        const ga = (0.6 + 0.4 * lum) * 0.9 * (1 - 0.3 * m.fog) * out * snowVis;
        b.globalAlpha = ga;
        for (let i = 0; i < tiles.length; i++) {
          const T = tiles[i]!, v = T.speed * dt;
          T.oy = (T.oy + v) % T.S;
          T.ox = ((((T.ox + ((snowWind + gx * 0.9) * dt * T.speed) / 40) % T.S) + T.S) % T.S);
          T.front = Math.min(T.front + v, yEnd + 20);
          if (T.on) {
            if (!isSnow) {
              T.on = 0;
              T.tail = 0;
            }
          } else {
            T.tail += v;
            if (isSnow && snowAmt >= T.th && T.tail >= T.front) {
              T.on = 1;
              T.tail = 0;
              T.front = 0;
            }
          }
          const y0 = T.on ? 0 : T.tail, y1 = Math.min(T.front, yEnd);
          if (y1 - y0 < 1 || ga < 0.01) continue;
          busy = true;
          const sway = Math.sin(tt * (0.5 + T.lay * 0.23) + T.ph) * (3 + T.lay * 3);
          const ox = T.ox + sway, S = T.S, D = T.dots;
          if (T.pat) {
            b.save();
            b.translate(ox, T.oy);
            b.fillStyle = T.pat;
            // none in the left band; across its ramp in BAND_STRIPS steps (owner item 99)
            const sw = (bE - bS) / BAND_STRIPS;
            for (let q = 0; q < BAND_STRIPS; q++) {
              b.globalAlpha = ga * bandStrip[q]!;
              b.fillRect(bS + q * sw - ox, y0 - T.oy, sw, y1 - y0);
            }
            b.globalAlpha = ga;
            b.fillRect(bE - ox, y0 - T.oy, W - bE, y1 - y0);
            b.restore();
            continue;
          }
          // Every cell of the tile on screen (its origin at ox, oy), rows
          // y0..y1: first right of the band at full alpha (set once), then
          // across the band's ramp in steps (owner item 99), the alpha set
          // only when the step changes. The dots of a tile share one colour,
          // so the order of overlapping dots does not change the result.
          const j0 = Math.floor((y0 - T.oy) / S) - 1, j1 = Math.ceil((y1 - T.oy) / S);
          const sw = (bE - bS) / BAND_STRIPS;
          let cur = -2;
          for (let pass = 0; pass < 2; pass++) {
            const xa = pass ? bS : bE, xb = pass ? bE : W + 3;
            if (!pass) {
              cur = BAND_STRIPS;
              b.globalAlpha = ga;
            }
            for (let k = 0; k < T.styles.length; k++) {
              b.fillStyle = T.styles[k]!;
              for (let d = T.cuts[k]!; d < T.cuts[k + 1]!; d++) {
                const dx = D[d * 3]!, dy = D[d * 3 + 1]!, r = D[d * 3 + 2]!, w = r * 1.8, plus = r > 1.1;
                // the cells whose dot lies in [xa, xb) (the band) or [xa, xb] (the rest)
                const ia = Math.ceil((xa - ox - dx) / S), ib = Math.floor((xb - ox - dx) / S);
                for (let jj = j0; jj <= j1; jj++) {
                  const y = T.oy + dy + jj * S;
                  if (y < y0 || y > y1) continue;
                  for (let ii = ia; ii <= ib; ii++) {
                    const x = ox + dx + ii * S;
                    if (pass) {
                      if (x >= bE) break;
                      const q = Math.min(BAND_STRIPS - 1, ((x - bS) / sw) | 0);
                      if (q !== cur) {
                        cur = q;
                        b.globalAlpha = ga * bandStrip[q]!;
                      }
                    }
                    // a soft round dot: a square, and for the bigger ones a plus of two bars
                    if (plus) {
                      b.fillRect(x - r, y - r * 0.55, 2 * r, r * 1.1);
                      b.fillRect(x - r * 0.55, y - r, r * 1.1, 2 * r);
                    } else b.fillRect(x - w / 2, y - w / 2, w, w);
                  }
                }
              }
            }
          }
          b.globalAlpha = ga;
        }
        let spawn = Math.min(nTarget - snCount, 6);
        for (let i = 0; i < SN; i++) {
          if (!sna[i]) {
            if (spawn > 0) {
              spawn--;
              newFlake(i, true);
            } else continue;
          }
          const z = snz[i]!, depth = 0.45 + 0.55 * z;
          let x = snx[i]!, y = sny[i]!;
          let svx = (snowWind + gx) * depth + Math.sin(tt * (0.6 + 0.5 * z) + snph[i]!) * (4 + 6 * z);
          let svy = snv[i]!;
          if (eddy) {
            const X1 = (x - gShift) * k1, Y1 = (y + tt * 6) * k1;
            const X2 = (x - gShift * 1.3 + 77) * k2, Y2 = (y - 140) * k2;
            const s1 = fsin(X1), c1 = fcos(X1), s2 = fsin(Y1), c2 = fcos(Y1);
            const s3 = fsin(X2), c3 = fcos(X2), s4 = fsin(Y2), c4 = fcos(Y2);
            svx += (A1 * s1 * c2 + A2 * c3 * s4) * depth;
            svy += (-A1 * c1 * s2 + A2 * s3 * c4) * depth;
          }
          x += svx * dt;
          y += svy * dt;
          if (y > yEnd) {
            if (snCount <= nTarget) newFlake(i, true);
            else {
              sna[i] = 0;
              snCount--;
            }
            continue;
          }
          if (x > W + 70) x -= W + 140;
          else if (x < -70) x += W + 140;
          snx[i] = x;
          sny[i] = y;
        }
        if (snCount > 0) busy = true;
        if (ga > 0.01 && snCount > 0) {
          for (let c = 0; c < 12; c++) {
            const L = byClass[c]!, r = SR[(c / 3) | 0]!, d = r * 2, plus = r > 1.1;
            // fillRect per flake, not one path of rects: a path spread over
            // the screen goes to Skia's software path renderer on the GPU
            // thread (see the rain streaks).
            b.fillStyle = snowFills[c]!;
            let flk = 1;
            b.globalAlpha = ga;
            for (let j = 0; j < L.length; j++) {
              const i = L[j]!;
              if (!sna[i]) continue;
              const x = snx[i]!, y = sny[i]!;
              if (y < -4 || x < bS) continue;
              // fading in across the left band's ramp (owner item 99)
              const fk = x < bE ? bk(x) : 1;
              if (fk !== flk) {
                flk = fk;
                b.globalAlpha = ga * fk;
              }
              if (plus) {
                b.fillRect(x - r, y - r + 0.7, d, d - 1.4);
                b.fillRect(x - r + 0.7, y - r, d - 1.4, 0.7);
                b.fillRect(x - r + 0.7, y + r - 0.7, d - 1.4, 0.7);
              } else b.fillRect(x - r, y - r, d, d);
            }
          }
        }
        b.globalAlpha = 1;
      }
      // dusting on pane tops
      if (dustCv) {
        const d = env.dpr;
        for (let k = 0; k < panes.length; k++) {
          const p = panes[k]!;
          const want = snow * out;
          p.dust += (want - p.dust) * Math.min(1, dt * (want > p.dust ? 0.035 : 0.12));
          // (by the pane's middle: the left band keeps none, owner item 99)
          const dk = p.dust * snowVis * bk(p.x + p.w / 2);
          if (dk < 0.02 || !p.border) continue;
          busy = true;
          f.globalAlpha = dk * (0.4 + 0.5 * lum);
          // On the top rim's glass, inside its rounded corners (it was a
          // band above the rim, read as speckled artifacts outside the
          // frame: owner item 48); the rim runs on above the nameplate.
          const rad = Math.min(RIM_R, p.border), h = Math.min(4, p.border), w = p.w - 2 * rad;
          if (w > 0) f.drawImage(dustCv, (p.x + rad) * d, p.dustRow * d, w * d, h * d, p.x + rad, p.y, w, h);
        }
        f.globalAlpha = 1;
      }

      // ---- lightning
      let flash = 0;
      if (strike) {
        flash = drawStrike(env, dt, nk);
        busy = true;
      }
      if (sparks.on) {
        drawSparks(f, dt, env.dpr);
        busy = true;
      }
      env.shared.flash = clamp(flash, 0, 1);
      env.shared.boltX = strike ? strike.x0 : 0;
      return busy;
    },
    fps() {
      // A strike flickers in tens of ms; rain, snow, splashes and drips fall
      // fast; what remains (drying sheen, snow dust on pane tops) is slow.
      if (strike || sparks.on) return FPS_BURST;
      if (rainAmt > 0 || snowAmt > 0 || (snowFade > 0 && snowFade < 1)) return FPS_FAST;
      for (let i = 0; i < DN; i++) if (fa[i]) return FPS_FAST;
      for (let i = 0; i < PN; i++) if (pl[i]! > 0) return FPS_FAST;
      for (let i = 0; i < VN; i++) if (va[i]) return FPS_FAST;
      return FPS_SLOW;
    },
    destroy(env) {
      strike = null;
      sparks.on = false;
      pl.fill(0);
      fa.fill(0);
      va.fill(0);
      sna.fill(0);
      snCount = 0;
      ra.fill(0);
      env.shared.flash = 0;
      env.shared.boltX = 0;
    },
  };
}
