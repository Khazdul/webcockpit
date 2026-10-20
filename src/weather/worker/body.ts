// Body module (port of the v4 prototype, notes/research/weather-world/modules/body.js):
// the character's position shown on the screen (front layer).
//   sleeping       "z z Z" float up from a quiet spot above the prompt, plus a
//                  gentle breathing darkening of the screen edges
//   resting        a very faint, slow edge darkening
//   stunned        the impact hits the corners/edges: a cool and a warm corner
//                  flare that jolt apart (damped shake) and a shaken dark edge
//                  vignette; while stunned a slow, faint pulsing vignette
//   incapacitated  blood spatters landing at once near edges/corners,
//   dying          more of them; a wide reddish wash pulses with the heartbeat
//                  (incapacitated slow and weak, dying faster and stronger).
//                  On recovery the spatters dry (darken) and fade.
// Sprites are built once at init/resize. The letters are drawn with the
// client font if the worker has it, else the generic monospace.

import { adapt, type Rgb } from '../palette';
import { type Cv, type Env, FPS_FAST, FPS_SLOW, type Module, TAU, clamp, ctx2d, ease, mkCanvas, sst } from './env';

interface Spatter {
  fresh: Cv;
  dry: Cv;
  size: number;
  r: number;
}
interface Spl {
  /** Index into the sprites (rebuilt at another dpr). */
  si: number;
  sp: Spatter;
  x: number;
  y: number;
  rot: number;
  sc: number;
  born: number;
  a: number;
  dry: number;
  drying: boolean;
  dryAt: number;
  /**
   * The spatter as it lies once landed (fresh or dry), rotated and scaled
   * into an upright sprite on the device pixel grid: a still spatter is one
   * unscaled copy a frame instead of a rotated, filtered one (Firefox's
   * software canvas: ~1 ms each). Made when it is first needed.
   */
  baked: Cv | null;
  /** What `baked` holds: 0 fresh, 1 dry; -1 nothing. */
  bakedDry: number;
  /** Its top-left corner on the canvas, device px. */
  bx: number;
  by: number;
}
interface Z {
  born: number;
  big: boolean;
  sway: number;
  dx: number;
}
interface Letter {
  c: Cv;
  w: number;
  h: number;
}

function vignette(rgb: Rgb, inner: number, power: number): Cv {
  const w = 192, h = 120, c = mkCanvas(w, h), g = ctx2d(c), img = g.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = ((x + 0.5) / w) * 2 - 1, v = ((y + 0.5) / h) * 2 - 1;
      const r = Math.sqrt(u * u * 0.85 + v * v);
      const a = Math.pow(sst(inner, 1.42, r), power);
      const i = (y * w + x) * 4;
      d[i] = rgb[0];
      d[i + 1] = rgb[1];
      d[i + 2] = rgb[2];
      d[i + 3] = (a * 255) | 0;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
function corners(rgb: Rgb): Cv {
  const w = 192, h = 120, c = mkCanvas(w, h), g = ctx2d(c), img = g.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = Math.abs(((x + 0.5) / w) * 2 - 1), v = Math.abs(((y + 0.5) / h) * 2 - 1);
      const edge = Math.max(sst(0.8, 1, u), sst(0.74, 1, v));
      const corner = sst(0.95, 1.41, Math.sqrt(u * u + v * v));
      const a = Math.min(1, corner * 0.95 + edge * edge * 0.45);
      const i = (y * w + x) * 4;
      d[i] = rgb[0];
      d[i + 1] = rgb[1];
      d[i + 2] = rgb[2];
      d[i + 3] = (a * 255) | 0;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
function wash(rgb: Rgb): Cv {
  const w = 160, h = 100, c = mkCanvas(w, h), g = ctx2d(c), img = g.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = ((x + 0.5) / w) * 2 - 1, v = ((y + 0.5) / h) * 2 - 1;
      const r = Math.sqrt(u * u * 0.8 + v * v);
      const a = 0.32 + 0.68 * Math.pow(sst(0.05, 1.35, r), 1.3);
      const i = (y * w + x) * 4;
      d[i] = rgb[0];
      d[i + 1] = rgb[1];
      d[i + 2] = rgb[2];
      d[i + 3] = (a * 255) | 0;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
/** The heartbeat wash's composite (washDeep, washHot, vigRed) before its one upscale: the vignette's size. */
const WASH_W = 192, WASH_H = 120;

function letters(env: Env): { z: Letter; Z: Letter; base: number } {
  const size = Math.round(env.cell.size * 1.6), dpr = env.dpr;
  const font = env.cell.font.replace(/^[\d.]+px/, `${size}px`) + ', monospace';
  const col = adapt([154, 166, 182], env.theme, 0.25, 0.6);
  const mk = (ch: string): Letter => {
    const c = mkCanvas(size * dpr, size * 1.3 * dpr), g = ctx2d(c);
    g.scale(dpr, dpr);
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
    g.fillText(ch, size / 2, size * 0.65);
    return { c, w: size, h: size * 1.3 };
  };
  return { z: mk('z'), Z: mk('Z'), base: size };
}

function spatter(seed: number, dpr: number): Spatter {
  let s = seed;
  const R = (): number => (s = (s * 16807) % 2147483647) / 2147483647;
  const SZ = 190, c = mkCanvas(SZ * dpr, SZ * dpr), g = ctx2d(c);
  g.scale(dpr, dpr);
  const cx = SZ / 2, cy = SZ / 2, r0 = 9 + R() * 9, dir = R() * TAU;
  g.fillStyle = `rgb(${(84 + R() * 26) | 0},${(4 + R() * 6) | 0},${(6 + R() * 6) | 0})`;
  const n = 30, ph1 = R() * TAU, ph2 = R() * TAU;
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const along = Math.max(0, Math.cos(a - dir));
    const rr = r0 * (1 + 0.16 * Math.sin(a * 3 + ph1) + 0.1 * Math.sin(a * 7 + ph2) + 0.35 * along * along);
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.closePath();
  g.fill();
  const spikes = 3 + ((R() * 4) | 0);
  for (let k = 0; k < spikes; k++) {
    const a = dir + (R() - 0.5) * 2.2, len = r0 * (1.4 + R() * 2.2), wdt = r0 * (0.18 + R() * 0.2);
    const bx = cx + Math.cos(a) * r0 * 0.7, by = cy + Math.sin(a) * r0 * 0.7;
    const ex = cx + Math.cos(a) * (r0 + len), ey = cy + Math.sin(a) * (r0 + len);
    const px = -Math.sin(a) * wdt, py = Math.cos(a) * wdt;
    g.beginPath();
    g.moveTo(bx + px, by + py);
    g.quadraticCurveTo((bx + ex) / 2 + px * 0.3, (by + ey) / 2 + py * 0.3, ex, ey);
    g.quadraticCurveTo((bx + ex) / 2 - px * 0.3, (by + ey) / 2 - py * 0.3, bx - px, by - py);
    g.closePath();
    g.fill();
    g.beginPath();
    g.arc(ex + Math.cos(a) * wdt * 0.6, ey + Math.sin(a) * wdt * 0.6, wdt * (0.7 + R() * 0.6), 0, TAU);
    g.fill();
  }
  const drops = 12 + ((R() * 16) | 0);
  for (let k = 0; k < drops; k++) {
    const a = dir + (R() - 0.5) * (R() < 0.75 ? 1.8 : 5.5);
    const d = r0 * (1.3 + Math.pow(R(), 0.8) * 4.2);
    const rad = Math.max(0.5, r0 * 0.24 * (1.25 - d / (r0 * 6)) * (0.4 + R()));
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    g.beginPath();
    if (R() < 0.35) g.ellipse(x, y, rad * 1.9, rad * 0.8, a, 0, TAU);
    else g.arc(x, y, rad, 0, TAU);
    g.fill();
  }
  if (R() < 0.55) {
    const dx = cx + (R() - 0.5) * r0, len = 10 + R() * 32, wd = 1.7 + R() * 1.6;
    g.beginPath();
    g.moveTo(dx - wd, cy);
    g.lineTo(dx - wd * 0.7, cy + len);
    g.arc(dx, cy + len, wd * 1.2, Math.PI, 0, true);
    g.lineTo(dx + wd, cy);
    g.closePath();
    g.fill();
  }
  g.globalCompositeOperation = 'source-atop';
  const rim = g.createRadialGradient(cx, cy, r0 * 0.3, cx, cy, r0 * 1.3);
  rim.addColorStop(0, 'rgba(150,20,20,0.35)');
  rim.addColorStop(1, 'rgba(30,0,0,0.4)');
  g.fillStyle = rim;
  g.fillRect(0, 0, SZ, SZ);
  const hl = g.createRadialGradient(cx - r0 * 0.35, cy - r0 * 0.4, 0, cx - r0 * 0.35, cy - r0 * 0.4, r0 * 0.6);
  hl.addColorStop(0, 'rgba(255,170,170,0.14)');
  hl.addColorStop(1, 'rgba(255,190,190,0)');
  g.fillStyle = hl;
  g.fillRect(0, 0, SZ, SZ);
  const dc = mkCanvas(c.width, c.height), dg = ctx2d(dc);
  dg.drawImage(c, 0, 0);
  dg.globalCompositeOperation = 'source-atop';
  dg.fillStyle = 'rgba(58,26,14,0.82)';
  dg.fillRect(0, 0, dc.width, dc.height);
  return { fresh: c, dry: dc, size: SZ, r: r0 * 3.2 };
}

export function bodyModule(): Module {
  const S = {
    ready: false,
    t: 0,
    sleep: 0,
    rest: 0,
    stun: 0,
    down: 0,
    dying: 0,
    stunAt: -1e9,
    jx: 1,
    jy: 0,
    hb: 0,
    z: [] as Z[],
    zNext: 0,
    zSeq: 0,
    spl: [] as Spl[],
    sprites: [] as Spatter[],
    zx: 0,
    zy: 0,
    zRise: 0,
    L: null as ReturnType<typeof letters> | null,
    vigDark: null as Cv | null,
    vigRed: null as Cv | null,
    cornCool: null as Cv | null,
    cornWarm: null as Cv | null,
    washDeep: null as Cv | null,
    washHot: null as Cv | null,
    /** The heartbeat wash composited small before its one upscale. */
    washCv: null as Cv | null,
    /** The ratio the spatter sprites were drawn at. */
    spriteDpr: 1,
  };

  function placeZ(env: Env): void {
    const out = env.out;
    const ch = env.cell.h, cw = env.cell.w;
    const fadeTop = env.protect.fadeTop;
    const rise = ch * 7;
    let best: { score: number; x: number; y: number } | null = null;
    for (let x = out.x + out.w * 0.45; x < out.x + out.w * 0.9; x += cw * 2) {
      for (let y0 = fadeTop - ch * 0.5; y0 > fadeTop - ch * 8 && y0 - rise > 0; y0 -= ch) {
        const x0 = x - cw, x1 = x + cw * 4, y1 = y0 - rise;
        let overlap = 0;
        for (const p of env.textPanes) {
          const ox = Math.min(x1 + cw * 2, p.x + p.w) - Math.max(x0, p.x), oy = Math.min(y0 + ch, p.y + p.h) - Math.max(y1, p.y);
          if (ox > 0 && oy > 0) overlap += ox * oy * 4;
        }
        const score = overlap + (fadeTop - y0) * cw * 2 + Math.abs(out.x + out.w * 0.8 - x) * cw * 0.6;
        if (!best || score < best.score) best = { score, x, y: y0 };
      }
    }
    S.zx = best ? best.x : out.x + out.w * 0.7;
    S.zy = best ? best.y : fadeTop - ch;
    S.zRise = rise;
  }

  function placeSpatter(env: Env, sp: Spatter): { x: number; y: number } {
    const W = env.W, H = env.H, p = env.protect;
    const r = sp.r;
    let best: { score: number; x: number; y: number } | null = null;
    for (let k = 0; k < 24; k++) {
      const x = p.left + r * 0.6 + Math.random() * (W - p.left - r * 1.2);
      const y = r * 0.4 + Math.random() * (p.fadeTop - r * 1.4);
      const de = Math.min(x - p.left, W - x, y, (p.fadeTop - y) * 1.5);
      let score = (-de / Math.min(W, H)) * 3;
      let dc = 1e9;
      for (const q of env.textPanes) {
        dc = Math.min(dc, Math.hypot(q.x - x, q.y - y), Math.hypot(q.x + q.w - x, q.y - y), Math.hypot(q.x - x, q.y + q.h - y), Math.hypot(q.x + q.w - x, q.y + q.h - y));
      }
      score -= Math.min(1, dc / 160) * 0.5;
      for (const o of S.spl) {
        if (o.a > 0) {
          const d = Math.hypot(o.x - x, o.y - y);
          if (d < r * 2.2) score -= (1 - d / (r * 2.2)) * 2;
        }
      }
      score += Math.random() * 0.25;
      if (!best || score > best.score) best = { score, x, y };
    }
    return best ?? { x: W / 2, y: H / 3 };
  }

  function spawnSpatter(env: Env): void {
    const si = (Math.random() * S.sprites.length) | 0, sp = S.sprites[si]!;
    const pos = placeSpatter(env, sp);
    let slot = S.spl.find((o) => o.a <= 0);
    if (!slot) {
      if (S.spl.length >= 18) return;
      slot = { si, sp, x: 0, y: 0, rot: 0, sc: 1, born: 0, a: 0, dry: 0, drying: false, dryAt: 0, baked: null, bakedDry: -1, bx: 0, by: 0 };
      S.spl.push(slot);
    }
    slot.si = si;
    slot.sp = sp;
    slot.bakedDry = -1;
    slot.x = pos.x;
    slot.y = pos.y;
    slot.rot = Math.random() * TAU;
    slot.sc = 0.85 + Math.random() * 0.5;
    slot.born = S.t + Math.random() * 0.14;
    slot.a = 1;
    slot.dry = 0;
    slot.drying = false;
  }

  /** Bakes spatter `o` at its landed scale and its rotation (`dry`: the dry sprite) for one unscaled copy a frame. */
  function bake(o: Spl, dry: number, dpr: number): void {
    const sp = o.sp, half = (sp.size / 2) * o.sc * Math.SQRT2;
    // the sprite's box on the device pixel grid, so the copy needs no filtering
    const bx = Math.floor((o.x - half) * dpr), by = Math.floor((o.y - half) * dpr);
    const n = Math.ceil(2 * half * dpr) + 2;
    if (!o.baked || o.baked.width !== n) o.baked = mkCanvas(n, n);
    const g = ctx2d(o.baked), c = Math.cos(o.rot) * o.sc, s = Math.sin(o.rot) * o.sc;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, n, n);
    g.setTransform(c * dpr, s * dpr, -s * dpr, c * dpr, o.x * dpr - bx, o.y * dpr - by);
    g.drawImage(dry ? sp.dry : sp.fresh, -sp.size / 2, -sp.size / 2, sp.size, sp.size);
    o.bakedDry = dry;
    o.bx = bx;
    o.by = by;
  }

  function buildSprites(dpr: number): void {
    S.sprites = [];
    for (let i = 0; i < 10; i++) S.sprites.push(spatter(9001 + i * 7717, dpr));
    S.spriteDpr = dpr;
    for (const o of S.spl) {
      o.sp = S.sprites[o.si]!;
      o.bakedDry = -1;
    }
  }

  return {
    id: 'body',
    init(env) {
      const th = env.theme;
      S.vigDark = vignette([0, 0, 0], 0.55, 1.4);
      S.vigRed = vignette([120, 0, 4], 0.62, 1.5);
      S.cornCool = corners(adapt([214, 226, 240], th, 0.3, 0.6));
      S.cornWarm = corners(adapt([240, 214, 196], th, 0.3, 0.6));
      S.washDeep = wash([70, 0, 14]);
      S.washHot = wash([196, 22, 16]);
      buildSprites(env.dpr);
      S.washCv = mkCanvas(WASH_W, WASH_H);
      S.ready = true;
    },
    resize(env) {
      if (!S.ready) return;
      S.L = letters(env);
      placeZ(env);
      // the spatters are drawn at the device's ratio: rebuilt when it changes (they were kept at init's)
      if (env.dpr !== S.spriteDpr) buildSprites(env.dpr);
    },
    onEvent(env, name, data) {
      if (name !== 'position' || !data || !env.cats.body) return;
      const to = (data as { to: string }).to;
      if (to === 'stunned') {
        S.stunAt = S.t;
        const a = Math.random() * TAU;
        S.jx = Math.cos(a);
        S.jy = Math.sin(a) * 0.6;
      }
      if (to === 'sleeping') {
        S.zNext = S.t + 0.6;
        S.zSeq = 0;
      }
    },
    frame(env, dt) {
      if (!S.ready || !S.L) return false;
      S.t += dt;
      const t = S.t, pos = env.cats.body ? env.settled.position : 'standing', m = env.mix;
      S.sleep = m.sleeping;
      S.rest = m.resting;
      S.down = m.down;
      S.stun = ease(S.stun, pos === 'stunned' ? 1 : 0, dt, 0.8);
      S.dying = ease(S.dying, pos === 'dying' ? 1 : 0, dt, 1.2);
      const flashAge = t - S.stunAt;
      let anyBlood = false;
      for (let i = 0; i < S.spl.length; i++) {
        if (S.spl[i]!.a > 0) {
          anyBlood = true;
          break;
        }
      }
      const target = pos === 'dying' ? 12 : pos === 'incapacitated' ? 6 : 0;
      if (S.sleep < 0.01 && S.rest < 0.01 && S.stun < 0.01 && S.down < 0.01 && flashAge > 3 && !anyBlood && !S.z.length && !target) return false;

      const fr = env.front, W = env.W, H = env.H;

      const breathe = 0.5 + 0.5 * Math.sin((t * TAU) / 5.5);
      let vd = S.sleep * (0.3 + 0.08 * breathe) + S.rest * 0.1 * (0.8 + 0.2 * breathe);
      if (S.stun > 0.01) {
        const pulse = Math.pow(0.5 + 0.5 * Math.sin((t * TAU) / 2.6), 2);
        vd += S.stun * (0.12 + 0.16 * pulse) * sst(0.6, 2.2, flashAge);
      }
      if (vd > 0.005) {
        fr.globalAlpha = clamp(vd, 0, 1);
        fr.drawImage(S.vigDark!, 0, 0, W, H);
      }

      if (S.sleep > 0.5 && t >= S.zNext) {
        const k = S.zSeq % 3;
        S.z.push({ born: t, big: k === 2, sway: Math.random() * TAU, dx: (k - 1) * 0.4 });
        S.zSeq++;
        S.zNext = t + (k === 2 ? 3.4 : 1.15);
      }
      if (S.z.length) {
        const L = S.L, life = 5.2;
        for (let i = S.z.length - 1; i >= 0; i--) {
          const z = S.z[i]!, age = t - z.born;
          if (age > life) {
            S.z.splice(i, 1);
            continue;
          }
          const p = age / life;
          const sz = (z.big ? 1.25 : 0.85) * (0.85 + 0.35 * p);
          const x = S.zx + p * 26 + Math.sin(age * 1.3 + z.sway) * 5 + z.dx * 8;
          const y = S.zy - p * S.zRise;
          const a = sst(0, 0.12, p) * (1 - sst(0.55, 1, p)) * 0.7 * Math.max(S.sleep, 0.25);
          if (a < 0.005) continue;
          const sp = z.big ? L.Z : L.z, w = sp.w * sz, h = sp.h * sz;
          fr.globalAlpha = a;
          fr.drawImage(sp.c, x - w / 2, y - h / 2, w, h);
        }
      }

      if (flashAge < 3) {
        const A = flashAge;
        const shake = Math.exp(-A / 0.16) * Math.cos(A * TAU * 9);
        const jdx = S.jx * 16 * shake, jdy = S.jy * 16 * shake;
        const hit = sst(0, 0.025, A);
        const da = 0.42 * hit * Math.exp(-A / 0.55);
        if (da > 0.004) {
          const g = 1.06;
          fr.globalAlpha = da;
          fr.drawImage(S.vigDark!, (-W * (g - 1)) / 2 + jdx, (-H * (g - 1)) / 2 + jdy, W * g, H * g);
        }
        const fa = 0.75 * hit * Math.exp(-A / 0.22) + 0.12 * Math.exp(-A / 0.9) * (0.6 + 0.4 * Math.cos(A * TAU * 2.4));
        if (fa > 0.004) {
          const sep = 1 + 12 * Math.exp(-A / 0.35), g = 1.03;
          const x0 = (-W * (g - 1)) / 2, y0 = (-H * (g - 1)) / 2, w = W * g, h = H * g;
          fr.globalAlpha = fa * 0.62;
          fr.drawImage(S.cornCool!, x0 + jdx + S.jx * sep, y0 + jdy + S.jy * sep, w, h);
          fr.globalAlpha = fa * 0.5;
          fr.drawImage(S.cornWarm!, x0 - jdx * 0.6 - S.jx * sep, y0 - jdy * 0.6 - S.jy * sep, w, h);
        }
      }

      // blood: all spatters land at once (owner v4)
      let fresh = 0;
      for (const o of S.spl) if (o.a > 0 && !o.drying) fresh++;
      while (fresh < target) {
        const before = S.spl.length, free = S.spl.some((o) => o.a <= 0);
        spawnSpatter(env);
        if (!free && S.spl.length === before) break;
        fresh++;
      }
      if (target === 0 || fresh > target) {
        let surplus = fresh - target;
        for (const o of S.spl) {
          if (o.a > 0 && !o.drying && surplus > 0) {
            o.drying = true;
            o.dryAt = t + (Math.random() * 2.5) / env.speed;
            surplus--;
          }
        }
      }
      const dpr = env.dpr;
      for (const o of S.spl) {
        if (o.a <= 0) continue;
        if (o.drying && t > o.dryAt) {
          // a dev time scale runs the drying faster (`env.speed`)
          o.dry = Math.min(1, o.dry + (dt * env.speed) / 3.5);
          if (o.dry >= 1) o.a -= (dt * env.speed) / 5;
        }
        if (o.a <= 0) continue;
        const age = t - o.born;
        const pop = sst(0, 0.16, age);
        const sc = o.sc * (0.8 + 0.2 * pop);
        const a = clamp(o.a, 0, 1) * pop * 0.78;
        const sp = o.sp;
        // landed and fresh or fully dry: its baked sprite, one unscaled copy
        if (pop >= 1 && (o.dry <= 0 || o.dry >= 1)) {
          const dry = o.dry >= 1 ? 1 : 0;
          if (o.bakedDry !== dry) bake(o, dry, dpr);
          fr.setTransform(1, 0, 0, 1, 0, 0);
          fr.globalAlpha = dry ? a * 0.85 : a;
          fr.drawImage(o.baked!, o.bx, o.by);
          continue;
        }
        const c = Math.cos(o.rot) * sc, s = Math.sin(o.rot) * sc;
        fr.setTransform(c * dpr, s * dpr, -s * dpr, c * dpr, o.x * dpr, o.y * dpr);
        if (o.dry < 1) {
          fr.globalAlpha = a * (1 - o.dry);
          fr.drawImage(sp.fresh, -sp.size / 2, -sp.size / 2, sp.size, sp.size);
        }
        if (o.dry > 0) {
          fr.globalAlpha = a * o.dry * 0.85;
          fr.drawImage(sp.dry, -sp.size / 2, -sp.size / 2, sp.size, sp.size);
        }
      }
      fr.setTransform(dpr, 0, 0, dpr, 0, 0);

      const present = clamp(S.down / 0.6, 0, 1);
      if (present > 0.004) {
        const k = S.dying;
        S.hb += dt / (1.75 - 0.7 * k);
        const ph = S.hb % 1;
        const beat = Math.exp(-Math.pow((ph - 0.06) / 0.055, 2)) + 0.55 * Math.exp(-Math.pow((ph - 0.27) / 0.065, 2));
        const glow = Math.min(1, beat);
        const base = present * (0.09 + 0.04 * k);
        const hot = present * (0.05 + 0.1 * k) * glow;
        // The three layers composited at the vignette's size, then one
        // upscale over the screen (three full-screen upscales cost Firefox's
        // software canvas ~15 ms a frame at 30 fps); all three are smooth, so
        // it looks the same.
        const w = S.washCv!, g = ctx2d(w);
        g.globalAlpha = 1;
        g.clearRect(0, 0, WASH_W, WASH_H);
        g.globalAlpha = base * (1 - 0.35 * glow);
        g.drawImage(S.washDeep!, 0, 0, WASH_W, WASH_H);
        if (hot > 0.003) {
          g.globalAlpha = hot;
          g.drawImage(S.washHot!, 0, 0, WASH_W, WASH_H);
        }
        const ra = present * (0.06 + 0.04 * k) + present * (0.06 + 0.16 * k) * glow;
        g.globalAlpha = clamp(ra, 0, 1);
        g.drawImage(S.vigRed!, 0, 0, WASH_W, WASH_H);
        fr.globalAlpha = 1;
        fr.drawImage(w, 0, 0, W, H);
      } else S.hb = 0;
      fr.globalAlpha = 1;
      return true;
    },
    fps() {
      // Floating z z Z and the resting/sleeping vignette are slow; a stun
      // (shake, flare), fresh blood and the heartbeat wash need the fast rate.
      let fresh = false;
      for (const o of S.spl) if (o.a > 0 && S.t - o.born < 0.3) fresh = true;
      return S.t - S.stunAt < 3 || S.stun > 0.01 || S.down > 0.004 || fresh ? FPS_FAST : FPS_SLOW;
    },
    destroy() {
      S.ready = false;
      S.z.length = 0;
      S.spl.length = 0;
    },
  };
}
