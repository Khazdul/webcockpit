// Fog module (port of the v4 prototype, notes/research/weather-world/modules/fog.js):
// layered, drifting mist banks with structure.
//
// All noise is baked ONCE into small textures (white, density in alpha). Per
// frame the module only draws those textures at moving positions.
//   banks  mist-bank sprites in three depth bands drifting left (parallax),
//          thinning toward the bottom-left (where the player types)
//   haze   dense fog only: a few very large soft sprites
//   wisps  strips that lie on pane top borders and creep along them (front)
//   veil   dense fog only: the cores of the near banks on the front layer
// Textures are pre-tinted per light key; a frame crossfades the two dominant
// tints. Baking starts the first time fog is reported and runs in slices
// between frames, so a session without fog never pays for it.

import { adapt, type ThemeInfo } from '../palette';
import { type Ctx, type Cv, type Env, FPS_SLOW, type Module, clamp, ctx2d, mkCanvas, sst } from './env';

function makeNoise(seed: number): { fbm: (x: number, y: number, oct: number) => number; rnd: () => number } {
  const P = new Uint8Array(512);
  const p = [...Array(256).keys()];
  let s = seed >>> 0 || 1;
  const r = (): number => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 255; i > 0; i--) {
    const j = (r() * (i + 1)) | 0;
    const t = p[i]!;
    p[i] = p[j]!;
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255]!;
  const h = (ix: number, iy: number): number => P[(P[ix & 255]! + (iy & 255)) & 255]! / 255;
  function vn(x: number, y: number): number {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x: number, y: number, oct: number): number {
    let sum = 0, amp = 0.5, norm = 0, f = 1;
    for (let o = 0; o < oct; o++) {
      sum += vn(x * f + o * 3.17, y * f + o * 7.31) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return sum / norm;
  }
  return { fbm, rnd: r };
}

function alphaCanvas(tw: number, th: number, fn: (i: number) => number): Cv {
  const c = mkCanvas(tw, th), g = ctx2d(c), img = g.createImageData(tw, th), d = img.data;
  for (let i = 0; i < tw * th; i++) {
    const a = fn(i);
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255;
    d[i * 4 + 3] = (clamp(a, 0, 1) * 255) | 0;
  }
  g.putImageData(img, 0, 0);
  return c;
}

interface BankTex {
  light: Cv;
  dense: Cv;
  core: Cv;
}
interface WispTex {
  light: Cv;
  dense: Cv;
}

function* bakeBank(seed: number, tw: number, th: number): Generator<void, BankTex> {
  const N = makeNoise(seed);
  const field = new Float32Array(tw * th);
  const ox = N.rnd() * 50, oy = N.rnd() * 50;
  for (let x = 0; x < tw; x++) {
    const u = x / tw;
    const top = 0.18 + 0.34 * N.fbm(ox + u * 2.6, oy + 1.3, 3);
    const bot = 0.82 + 0.1 * N.fbm(ox + u * 2.2, oy + 9.7, 2);
    for (let y = 0; y < th; y++) {
      const v = y / th;
      const tear = (N.fbm(ox + u * 3, oy + v * 5 + 20, 2) - 0.5) * 0.3;
      const ue = u + tear;
      const ex = sst(0.0, 0.38, ue) * (1 - sst(0.62, 1.0, ue));
      const ey = sst(top - 0.1, top + 0.3, v) * (1 - sst(bot - 0.26, bot + 0.06, v));
      const w = N.fbm(ox + u * 2.5, oy + v * 3 + 31, 3);
      const n = N.fbm(ox + u * 5 + (w - 0.5) * 2.2, oy + v * 4.2 + (w - 0.5) * 1.1, 4);
      const st = N.fbm(ox + u * 9, oy + v * 14 + 55, 2);
      field[y * tw + x] = ex * ey * (0.3 + 0.85 * n + 0.45 * (st - 0.5));
    }
    if ((x & 15) === 15) yield;
  }
  return {
    light: alphaCanvas(tw, th, (i) => sst(0.24, 0.9, field[i]!)),
    dense: alphaCanvas(tw, th, (i) => sst(0.08, 0.7, field[i]!) * 0.85 + 0.15 * clamp(field[i]! * 2.5, 0, 1)),
    core: alphaCanvas(tw, th, (i) => Math.pow(sst(0.35, 0.85, field[i]!), 1.5)),
  };
}

function bakeHaze(seed: number, tw: number, th: number): Cv {
  const N = makeNoise(seed);
  return alphaCanvas(tw, th, (i) => {
    const x = i % tw, y = (i / tw) | 0, u = x / tw - 0.5, v = y / th - 0.5;
    const e = Math.sqrt(u * u * 4 + v * v * 4);
    return (1 - sst(0.35, 1, e)) * (0.45 + 0.75 * N.fbm(u * 3 + 9, v * 2 + 4, 3));
  });
}

const EDGE_V = 0.66;
function* bakeWisp(seed: number, tw: number, th: number): Generator<void, WispTex> {
  const N = makeNoise(seed);
  const field = new Float32Array(tw * th);
  const ox = N.rnd() * 50;
  for (let x = 0; x < tw; x++) {
    const u = x / tw;
    const crest = EDGE_V - 0.12 - 0.48 * N.fbm(ox + u * 3.5, 1.7, 3) * Math.sin(Math.PI * u);
    const hang = EDGE_V + 0.04 + 0.3 * Math.pow(N.fbm(ox + u * 9, 8.2, 2), 2.4);
    for (let y = 0; y < th; y++) {
      const v = y / th;
      const ue = u + (N.fbm(ox + u * 5, v * 4 + 13, 2) - 0.5) * 0.2;
      const ex = sst(0, 0.32, ue) * (1 - sst(0.68, 1, ue));
      const up = sst(crest - 0.04, crest + 0.24, v);
      const down = 1 - sst(EDGE_V - 0.02, hang + 0.04, v);
      const n = N.fbm(ox + u * 6 + 0.8 * N.fbm(ox + u * 2, v * 2 + 5, 2), v * 2.2, 4);
      field[y * tw + x] = ex * up * down * (0.3 + 0.95 * n);
    }
    if ((x & 15) === 15) yield;
  }
  return {
    light: alphaCanvas(tw, th, (i) => sst(0.32, 0.9, field[i]!)),
    dense: alphaCanvas(tw, th, (i) => sst(0.14, 0.72, field[i]!)),
  };
}

const BANDS = [
  { n: 5, y0: 0.08, y1: 0.3, sc: 0.8, asp: 0.16, speed: 3.2, aL: 0.2, aD: 0.3, veil: 0 },
  { n: 6, y0: 0.32, y1: 0.54, sc: 0.95, asp: 0.18, speed: 6.5, aL: 0.45, aD: 0.34, veil: 0 },
  { n: 6, y0: 0.56, y1: 0.8, sc: 1.15, asp: 0.2, speed: 11, aL: 0.7, aD: 0.38, veil: 0.12 },
];
const N_BANKTEX = 8, N_WISPTEX = 4;

type TintKey = 'day' | 'moon' | 'torch' | 'night';
const TINTS_DARK: Record<TintKey, [number, number, number, number]> = {
  day: [214, 220, 228, 1.0],
  moon: [170, 188, 218, 0.82],
  torch: [226, 178, 122, 0.78],
  night: [96, 104, 122, 0.55],
};

interface TintSet {
  bank: BankTex[];
  wisp: WispTex[];
  haze: Cv[];
}
interface Bank {
  band: number;
  tex: number;
  w: number;
  h: number;
  x: number;
  span: number;
  y: number;
  speed: number;
  ph: number;
  br: number;
}
interface Haze {
  tex: number;
  w: number;
  h: number;
  x: number;
  span: number;
  y: number;
  speed: number;
  ph: number;
}
interface Seg {
  x0: number;
  x1: number;
  y: number;
}
interface Wisp {
  seg: Seg;
  tex: number;
  w: number;
  h: number;
  y: number;
  x: number;
  speed: number;
  ph: number;
}

export function fogModule(): Module {
  let TINTS = TINTS_DARK;
  const S = {
    ready: false,
    t: 0,
    on: 0,
    W: 0,
    H: 0,
    cornerRX: 1,
    cornerRY: 1,
    banks: [] as Bank[],
    hazes: [] as Haze[],
    wisps: [] as Wisp[],
    tinted: {} as Partial<Record<TintKey, TintSet>>,
    bankTex: [] as BankTex[],
    wispTex: [] as WispTex[],
    hazeTex: [] as Cv[],
    k1: 'day' as TintKey,
    k2: 'moon' as TintKey,
    w1: 1,
    w2: 0,
    bright: 1,
    job: null as Generator<void, void> | null,
    env: null as Env | null,
  };

  function tintSet(key: TintKey): TintSet {
    const have = S.tinted[key];
    if (have) return have;
    const [r, g, b] = TINTS[key];
    const col = `rgb(${r},${g},${b})`;
    const tint = (src: Cv): Cv => {
      const c = mkCanvas(src.width, src.height), x = ctx2d(c);
      x.drawImage(src, 0, 0);
      x.globalCompositeOperation = 'source-atop';
      x.fillStyle = col;
      x.fillRect(0, 0, c.width, c.height);
      return c;
    };
    const set: TintSet = {
      bank: S.bankTex.map((t) => ({ light: tint(t.light), dense: tint(t.dense), core: tint(t.core) })),
      wisp: S.wispTex.map((t) => ({ light: tint(t.light), dense: tint(t.dense) })),
      haze: S.hazeTex.map(tint),
    };
    S.tinted[key] = set;
    return set;
  }

  const tw: Record<TintKey, number> = { day: 0, moon: 0, torch: 0, night: 0 };
  function updateTint(env: Env): void {
    const m = env.mix;
    tw.moon = m.moon;
    tw.torch = m.torch * (1 - m.moon);
    tw.night = m.dark;
    tw.day = m.sun;
    const rest = Math.max(0, 1 - tw.moon - tw.torch - tw.night - tw.day);
    tw.day += rest * (1 - m.night);
    tw.night += rest * m.night;
    let k1: TintKey = 'day', k2: TintKey = 'moon', w1 = -1, w2 = -1, sum = 0, br = 0;
    for (const k of Object.keys(tw) as TintKey[]) {
      const w = tw[k];
      sum += w;
      br += w * TINTS[k][3];
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
    S.bright = sum > 0 ? br / sum : 1;
    const w2e = Math.max(0, w2) * sst(0.03, 0.12, w2);
    const n = w1 + w2e;
    S.k1 = k1;
    S.w1 = w1 / n;
    S.k2 = k2;
    S.w2 = w2e / n;
  }

  function layout(env: Env): void {
    const W = env.W, H = env.H, R = makeNoise(31337).rnd;
    S.banks = [];
    for (let bi = 0; bi < BANDS.length; bi++) {
      const b = BANDS[bi]!;
      const w = b.sc * W, span = W + w * 1.25;
      for (let i = 0; i < b.n; i++) {
        const ww = w * (0.8 + R() * 0.45);
        S.banks.push({
          band: bi,
          tex: (bi * 3 + i * 5) % N_BANKTEX,
          w: ww,
          h: ww * b.asp * (0.85 + R() * 0.3),
          x: -w * 0.6 + ((i + R() * 0.55) * span) / b.n,
          span,
          y: H * (b.y0 + (b.y1 - b.y0) * ((i * 0.618 + R() * 0.3) % 1)),
          speed: b.speed * (0.8 + R() * 0.4),
          ph: R() * 6.28,
          br: 0.07 + R() * 0.06,
        });
      }
    }
    S.hazes = [0, 1, 2].map((i) => ({
      tex: i % 2,
      w: W * 1.3,
      h: H * 0.85,
      x: -W * 0.3 + i * W * 0.75,
      span: W * 2.25,
      y: H * (0.12 + i * 0.2),
      speed: 2 + i * 0.6,
      ph: i * 2.1,
    }));
    const tops = env.panes.map((p) => ({ x0: p.x, x1: p.x + p.w, y: p.y })).sort((a, b) => a.y - b.y || a.x0 - b.x0);
    const segs: Seg[] = [];
    for (const p of tops) {
      const s = segs.find((q) => Math.abs(q.y - p.y) < 4 && p.x0 - q.x1 < 40 && q.x0 - p.x1 < 40);
      if (s) {
        s.x0 = Math.min(s.x0, p.x0);
        s.x1 = Math.max(s.x1, p.x1);
      } else segs.push({ ...p });
    }
    const ch = env.cell.h, fadeTop = env.protect.fadeTop;
    S.wisps = [];
    segs
      .filter((s) => s.y < fadeTop - 10)
      .forEach((s, si) => {
        const len = s.x1 - s.x0, n = Math.max(2, Math.round(len / 150));
        for (let i = 0; i < n; i++) {
          const w = Math.min(len * 0.75, 190 + R() * 140), h = ch * (3.6 + R() * 1.6);
          S.wisps.push({
            seg: s,
            tex: (si + i) % N_WISPTEX,
            w,
            h,
            y: s.y + 3 - h * EDGE_V,
            x: s.x0 - w * 0.5 + ((i + R() * 0.6) * (len + w)) / n,
            speed: 5 + R() * 5,
            ph: R() * 6.28,
          });
        }
      });
    S.W = W;
    S.H = H;
    S.cornerRX = W * 0.6;
    S.cornerRY = H * 0.62;
  }

  function cornerFade(x: number, y: number): number {
    const ex = x / S.cornerRX, ey = (S.H - y) / S.cornerRY;
    return sst(0.5, 1.2, Math.sqrt(ex * ex + ey * ey));
  }

  function draw(c: Ctx, set: BankTex[][], kind: keyof BankTex, idx: number, a: number, x: number, y: number, w: number, h: number): void {
    if (a < 0.004) return;
    c.globalAlpha = a * S.w1;
    c.drawImage(set[0]![idx]![kind], x, y, w, h);
    if (S.w2 > 0) {
      c.globalAlpha = a * S.w2;
      c.drawImage(set[1]![idx]![kind], x, y, w, h);
    }
  }

  function* bakeAll(env: Env): Generator<void, void> {
    S.bankTex = [];
    for (let i = 0; i < N_BANKTEX; i++) S.bankTex.push(yield* bakeBank(1000 + i * 7919, 384, 72));
    S.wispTex = [];
    for (let i = 0; i < N_WISPTEX; i++) S.wispTex.push(yield* bakeWisp(50 + i * 104729, 220, 40));
    S.hazeTex = [bakeHaze(4242, 128, 64)];
    yield;
    S.hazeTex.push(bakeHaze(777, 128, 64));
    yield;
    updateTint(env);
    tintSet(S.k1);
    yield;
    for (const k of Object.keys(TINTS) as TintKey[]) {
      tintSet(k);
      yield;
    }
    S.ready = true;
  }

  function startBake(env: Env): void {
    const job = (S.job = bakeAll(env));
    const pump = (): void => {
      if (S.job !== job) return;
      const until = performance.now() + 5;
      while (performance.now() < until) {
        if (job.next().done) {
          if (S.env) layout(S.env);
          return;
        }
      }
      setTimeout(pump, 0);
    };
    setTimeout(pump, 0);
  }

  function themeInit(th: ThemeInfo): void {
    if (!th.light) {
      TINTS = TINTS_DARK;
    } else {
      // on paper the mist is a soft grey haze in the same hue
      const t = {} as typeof TINTS_DARK;
      for (const k of Object.keys(TINTS_DARK) as TintKey[]) {
        const a = adapt([TINTS_DARK[k][0], TINTS_DARK[k][1], TINTS_DARK[k][2]], th, 0.42, 0.62);
        t[k] = [a[0], a[1], a[2], 0.75];
      }
      TINTS = t;
    }
    S.tinted = {};
  }

  const pair: BankTex[][] = [[], []];
  return {
    id: 'fog',
    init(env) {
      S.env = env;
      themeInit(env.theme);
      if (S.ready) for (const k of Object.keys(TINTS) as TintKey[]) tintSet(k);
    },
    resize(env) {
      S.env = env;
      if (S.ready) layout(env);
    },
    frame(env, dt) {
      if (!S.job && !S.ready && env.raw.fog && env.cats.fog) startBake(env);
      if (!S.ready || !S.W) return !!S.job && !S.ready && env.mix.fog > 0.01;
      S.t += dt;
      for (const b of S.banks) {
        b.x -= b.speed * dt;
        if (b.x < -b.w) b.x += b.span;
      }
      for (const h of S.hazes) {
        h.x -= h.speed * dt;
        if (h.x < -h.w) h.x += h.span;
      }
      for (const w of S.wisps) {
        w.x -= w.speed * dt;
        if (w.x < w.seg.x0 - w.w * 0.75) w.x += w.seg.x1 - w.seg.x0 + w.w * 0.9;
      }
      S.on = Math.min(1, S.on + dt / 1.5);
      const fog = env.mix.fog * S.on * S.on;
      if (fog < 0.01) return false;
      const L = sst(0, 0.5, fog);
      const D = sst(0.5, 1, fog);
      updateTint(env);
      const s1 = tintSet(S.k1), s2 = S.w2 > 0 ? tintSet(S.k2) : s1;
      pair[0] = s1.bank;
      pair[1] = s2.bank;
      const t = S.t, bk = env.back, fr = env.front, br = S.bright;

      if (D > 0.01) {
        const h0 = s1.haze, h1 = S.w2 > 0 ? s2.haze : null;
        for (const h of S.hazes) {
          const a = 0.2 * D * br * (0.8 + 0.2 * Math.sin(t * 0.05 + h.ph)) * cornerFade(h.x + h.w * 0.5, h.y + h.h * 0.5);
          bk.globalAlpha = a * S.w1;
          bk.drawImage(h0[h.tex]!, h.x, h.y - h.h * 0.5, h.w, h.h);
          if (h1) {
            bk.globalAlpha = a * S.w2;
            bk.drawImage(h1[h.tex]!, h.x, h.y - h.h * 0.5, h.w, h.h);
          }
        }
      }

      for (const b of S.banks) {
        const band = BANDS[b.band]!;
        const breathe = 1 + b.br * Math.sin(t * 0.09 + b.ph) - b.br;
        const bob = Math.sin(t * 0.05 + b.ph) * (3 + b.band * 2);
        const cx = b.x + b.w * 0.35, cy = b.y;
        if (b.x > S.W || b.x + b.w < 0) continue;
        const fade = cornerFade(cx, cy + b.h * 0.2);
        if (fade < 0.01) continue;
        const base = breathe * fade * br;
        const y = b.y - b.h * 0.5 + bob;
        draw(bk, pair, 'light', b.tex, base * band.aL * L * (1 - D), b.x, y, b.w, b.h);
        draw(bk, pair, 'dense', b.tex, base * band.aD * D, b.x, y, b.w, b.h);
        if (band.veil && D > 0.02) draw(fr, pair, 'core', b.tex, base * band.veil * D * fade, b.x, y, b.w, b.h);
      }

      const ws0 = s1.wisp, ws1 = S.w2 > 0 ? s2.wisp : null;
      const wa = L * br * (0.42 + 0.3 * D);
      for (const w of S.wisps) {
        const s = w.seg, cx = w.x + w.w * 0.5;
        const ends = sst(s.x0 - w.w * 0.2, s.x0 + w.w * 0.35, cx) * (1 - sst(s.x1 - w.w * 0.35, s.x1 + w.w * 0.2, cx));
        const a = wa * ends * (0.75 + 0.25 * Math.sin(t * 0.13 + w.ph)) * cornerFade(cx, s.y);
        if (a < 0.01) continue;
        const y = w.y + Math.sin(t * 0.11 + w.ph) * 1.2;
        for (let k = 0; k < 2; k++) {
          const set = k ? ws1 : ws0;
          if (!set) continue;
          const wk = k ? S.w2 : S.w1, tx = set[w.tex]!;
          const ca = a * wk * 0.8;
          if (ca < 0.004) continue;
          if (D < 0.98) {
            fr.globalAlpha = ca * (1 - D);
            fr.drawImage(tx.light, w.x, y, w.w, w.h);
          }
          if (D > 0.02) {
            fr.globalAlpha = ca * D;
            fr.drawImage(tx.dense, w.x, y, w.w, w.h);
          }
        }
      }
      bk.globalAlpha = 1;
      fr.globalAlpha = 1;
      return true;
    },
    // Soft banks drifting at 2–13 px/s: a slow rate and half resolution look the same.
    fps: () => FPS_SLOW,
    scale: 0.5,
    destroy() {
      S.ready = false;
      S.job = null;
      S.tinted = {};
    },
  };
}
