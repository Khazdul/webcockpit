// The shared rig every balloon passenger flies (stage 75, ADR 0159 round
// 3): a PORT of the approved round 5 mockup,
// notes/research/balloons/round5/rig.js. Its header comment is the
// contract for the passengers and holds here unchanged: the layout (`K`),
// the layers, the spec a passenger supplies, the height limit and the
// checklist. Read it there; this file only notes where the port differs.
//
// The port keeps the mockup's geometry, markup, CSS values and timings as
// they are: the look must not change. What differs:
//
// - No harness. `createRig(ctx, spec)` returns `make(sign)`, which builds
//   one balloon as a `BalloonSkin` (skin.ts): the product's flight
//   (flight.ts, balloons.ts) moves it and hands it a pose per frame
//   (tilt → lean, swing, burn, the phase: glide and drift are the rig's
//   `leave`). The mockup's `still()` is the reduced-motion form: the
//   flight holds the balloon at its readable spot and the rig gets `rig-rm`.
// - CSS: the mockup's style text, kept as strings (the dwarf's is made from
//   its pose tables), inserted once per document as one `<style>` per id
//   (the rig's, each passenger's) and removed when the last rig using it is
//   destroyed. The mockup's font family names are rewritten to the bundled
//   faces' (fonts.ts `signFonts`); the production CSP allows inline styles.
// - The sign's 85 % (`K.SS`): CSS `zoom` on the inner element, as in the
//   mockup, where the browser has it (Chromium, Safari, Firefox 126+); else
//   `transform: scale(.85)` from the top left, the sign's box sized to the
//   scaled height, so the measurement and the height fit come out the same.
// - The text is measured once per change (at the launch, a joined kill, a
//   font arriving), never per frame. The re-fit when web fonts arrive is
//   per rig (the document's FontFaceSet), not page-wide.
// - Life and cost: `rest()` (skin.ts) stops the passenger's life (its
//   timers, its running Web Animations), pauses every CSS animation in the
//   rig, and stops the per-frame writes: a distant balloon is one moving
//   element (balloons.ts decides when).
//
// Game strings are set with textContent only. Every markup string here and
// in the passengers is the code's own (no game text in it).

import type { Mood, SignContent } from './feed';
import { signFonts } from './fonts';
import type { Phase } from './flight';
import type { BalloonSkin, SkinPose } from './skin';
import { INK, SOFT, type FiltOpts, dark, filt, hatch, ink2, light, mix, n, n2 } from '../../art/engrave';

export { INK, SOFT, type FiltOpts };

export type Pt2 = [number, number];
/** The phase as the rig knows it (the mockup's): glide and drift are `leave`. */
export type RigPhase = 'arrive' | 'read' | 'leave';
/** The backdrop: sets the glow's strength and the night's pen halo (data-sky). */
export type SkyMode = 'night' | 'dusk' | 'day' | 'overcast';

/** A part the life moves: an HTML or SVG element with a style. */
export type Part = Element & ElementCSSInlineStyle;

const NS = 'http://www.w3.org/2000/svg', D = Math.PI / 180;
export const K = Object.freeze({ W: 204, CX: 102, TOP: 8, HG: 112, MRX: 24, MRY: 5.5, ER: 80, FY: 136, RY: 248, RIM: 52, R1: 51, R2: 45, BY: 277, BD: 326, SY: 300, SS: 0.85, CY: 7, MAXH: 363 });
const { W, CX, HG, MRX, MRY, FY, RY, BY, SY, SS } = K;
const pp = (p: readonly number[]): string => `${n(p[0]!)},${n(p[1]!)}`;
let uid = 0, serial = 0;

const defs = (u: number, extra = ''): string => `<svg class="rig-defs" xmlns="${NS}" width="0" height="0" aria-hidden="true"><defs>${filt('rgf' + u)}${hatch('rgp' + u, 38, 3, .6)}${hatch('rgq' + u, -52, 3.4, .5)}${extra}</defs></svg>`;
const P = (u: number): string => `url(#rgp${u})`, Q = (u: number): string => `url(#rgq${u})`;
const S = (cls: string, x: number, y: number, w: number, h: number, body: string): string => `<svg class="rig-s ${cls}" xmlns="${NS}" style="left:${CX + x}px;top:${y}px" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}">${body}</svg>`;
const SL = (cls: string, x: number, y: number, w: number, h: number, body: string): string => `<svg class="rig-s ${cls}" xmlns="${NS}" style="left:${x}px;top:${y}px" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}">${body}</svg>`;
const Z = (cls: string, x: number, y: number, inner = ''): string => `<div class="rig-z ${cls}" style="left:${CX + x}px;top:${y}px">${inner}</div>`;
const G = (u: number, body: string, extra = ''): string => `<g filter="url(#rgf${u})" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round" ${extra}>${body}</g>`;
export interface Clock {
  later(fn: () => void, ms: number): void;
  stop(): void;
  readonly dead: boolean;
}
// timers that die with the notice
const clock = (): Clock => {
  let dead = false; const ts = new Set<ReturnType<typeof setTimeout>>();
  return { later(fn, ms) { const t = setTimeout(() => { ts.delete(t); if (!dead) fn(); }, ms); ts.add(t); }, stop() { dead = true; ts.forEach(clearTimeout); ts.clear(); }, get dead() { return dead; } };
};

// ---- the envelope's geometry, by condition ----
export interface Dent {
  side: -1 | 1;
  t: number;
  depth: number;
  span: number;
}
/** The envelope's condition (see rig.js "spec.envelope"). */
export interface EnvCond {
  sag?: number;
  lop?: number;
  taut?: number;
  dents?: readonly Dent[];
}
export interface PatchOpts {
  fill?: string;
  rot?: number;
  stitch?: string;
  rivets?: boolean;
  hatch?: string;
  gap?: number;
  sw?: number;
}
export interface EnvGeo {
  cond: EnvCond;
  top: number;
  R: number;
  pt(k: number, t: number): Pt2;
  place(k: number, t: number, s?: number): string;
  along(num: number, k0?: number, k1?: number): number[];
  patch(k: number, t: number, w: number, h: number, o?: PatchOpts): string;
  hw(t: number, sd: number): number;
  out: string;
  outAbs: string;
  seam(k: number, t0?: number, t1?: number): string;
  lat(t: number, k0?: number, k1?: number): string;
  gore(k0: number, k1: number, t0?: number, t1?: number): string;
  band(t0: number, t1: number, k0?: number, k1?: number): string;
  attach: Pt2[];
}

export function envelope(c: EnvCond = {}): EnvGeo {
  const sag = c.sag || 0, lop = c.lop || 0, taut = c.taut || 0, dents = c.dents || [];
  const top = K.TOP + 6 + sag * 20 - taut * 3, H = HG - top;
  const R = K.ER * (.95 - .11 * sag + .05 * taut), m = MRX / R;
  const c0 = .38 + .12 * sag, ex = 2 + .35 * taut - .4 * sag, pw = 1.3 - .2 * sag + .2 * taut;
  // the profile: a dome down to the widest point, then the taper to the mouth
  const f = (t: number): number => {
    if (t <= c0) return Math.pow(Math.max(0, 1 - Math.pow((c0 - t) / c0, ex)), 1 / ex);
    const s = (t - c0) / (1 - c0);
    return m + (1 - m) * (1 - Math.pow(s, pw)) - sag * .1 * Math.sin(Math.PI * s);
  };
  const side = (t: number, sd: number): number => {
    let w = R * f(t) * (1 + sd * lop * .07 * (1 - t * t * t));
    for (const d of dents) if (d.side === sd) w -= d.depth * Math.exp(-(((t - d.t) / d.span) ** 2)) * (1 - t ** 8);
    return Math.max(0, w);
  };
  const cx = (t: number): number => lop * 11 * Math.pow(1 - t, 1.4);
  const bow = (t: number): number => .1 + .13 * t * t;                       // latitudes bow down, most at the mouth
  const pt = (k: number, t: number): Pt2 => {
    const w = side(t, k < 0 ? -1 : 1), wm = (side(t, -1) + side(t, 1)) / 2;
    return [cx(t) + k * w, top + H * t + bow(t) * wm * Math.sqrt(Math.max(0, 1 - k * k))];
  };
  const line = (pts: Pt2[]): string => 'M' + pts.map(pp).join('L');
  const seamPts = (k: number, t0 = 0, t1 = 1, N = 14): Pt2[] => Array.from({ length: N + 1 }, (_, i) => pt(k, t0 + (t1 - t0) * i / N));
  const latPts = (t: number, k0 = -1, k1 = 1, N = 16): Pt2[] => { const a0 = Math.asin(k0), a1 = Math.asin(k1); return Array.from({ length: N + 1 }, (_, i) => pt(Math.sin(a0 + (a1 - a0) * i / N), t)); };
  const smooth = (p: Pt2[], ox = 0): string => {
    let d = `M${n(p[0]![0] + ox)},${n(p[0]![1])}`;
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[Math.max(0, i - 1)]!, b = p[i]!, e = p[i + 1]!, g = p[Math.min(p.length - 1, i + 2)]!;
      d += `C${n(b[0] + (e[0] - a[0]) / 6 + ox)},${n(b[1] + (e[1] - a[1]) / 6)} ${n(e[0] - (g[0] - b[0]) / 6 + ox)},${n(e[1] - (g[1] - b[1]) / 6)} ${n(e[0] + ox)},${n(e[1])}`;
    }
    return d;
  };
  const N = 26, L: Pt2[] = [], Rr: Pt2[] = [];
  for (let i = 0; i <= N; i++) { const t = Math.pow(i / N, 1.8); L.push(pt(-1, t)); Rr.push(pt(1, t)); }
  const ring = L.slice().reverse().concat(Rr.slice(1));
  const close = (ox: number): string => `A${MRX},${MRY} 0 0 1 ${n(ring[0]![0] + ox)},${n(ring[0]![1])}Z`;
  const place = (k: number, t: number, s = 1): string => {
    const [x, y] = pt(k, t), a = pt(k, Math.max(0, t - .03)), b = pt(k, Math.min(1, t + .03));
    return `translate(${n(x)},${n(y)}) rotate(${n(-Math.atan2(b[0] - a[0], b[1] - a[1]) / D)}) scale(${n2(s * Math.max(.3, Math.sqrt(1 - k * k)))},${s})`;
  };
  const along = (num: number, k0 = -.94, k1 = .94): number[] => { const a0 = Math.asin(k0), a1 = Math.asin(k1); return Array.from({ length: num }, (_, i) => Math.sin(a0 + (a1 - a0) * (num === 1 ? .5 : i / (num - 1)))); };
  const patch = (k: number, t: number, w: number, h: number, o: PatchOpts = {}): string => {
    const x = w / 2, y = h / 2, q: Pt2[] = [[-x, -y + 1], [x - 1, -y], [x, y - 1.5], [-x + 1.5, y]];
    let st = '';
    for (let i = 0; i < 4; i++) {
      const a = q[i]!, b = q[(i + 1) % 4]!, len = Math.hypot(b[0] - a[0], b[1] - a[1]), cnt = Math.max(2, Math.round(len / (o.gap || 4.5)));
      const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
      for (let j = 0; j < cnt; j++) {
        const v = (j + .5) / cnt, px = a[0] + (b[0] - a[0]) * v, py = a[1] + (b[1] - a[1]) * v, sk = j % 2 ? .9 : -.7;
        st += o.rivets ? `<circle cx="${n(px + nx * 2.2)}" cy="${n(py + ny * 2.2)}" r="1.1" fill="${o.stitch || '#c9c2b0'}" stroke-width=".5"/>` : `M${n(px + nx * 2.4 + sk)},${n(py + ny * 2.4)}L${n(px - nx * 2.4 - sk)},${n(py - ny * 2.4)}`;
      }
    }
    const dq = `M${q.map(pp).join('L')}Z`;
    return `<g transform="${place(k, t)} rotate(${o.rot || 0})"><path d="${dq}" fill="${o.fill || '#8a7a5c'}" stroke-width="1"/>${o.hatch ? `<path d="M${pp(q[0]!)}L0,${-y}L1,${y}L${pp(q[3]!)}Z" fill="${o.hatch}" stroke="none"/>` : ''}${o.rivets ? st : `<path d="${st}" fill="none" stroke="${o.stitch || INK}" stroke-width="${o.sw || .9}"/>`}</g>`;
  };
  return {
    cond: c, top, R, pt, place, along, patch, hw: side,
    out: smooth(ring) + close(0), outAbs: smooth(ring, CX) + close(CX),
    seam: (k, t0, t1) => line(seamPts(k, t0, t1)),
    lat: (t, k0, k1) => line(latPts(t, k0, k1)),
    gore: (k0, k1, t0 = 0, t1 = 1) => line([...seamPts(k0, t0, t1), ...seamPts(k1, t0, t1).reverse()]) + 'Z',
    band: (t0, t1, k0 = -1, k1 = 1) => line([...latPts(t0, k0, k1), ...latPts(t1, k0, k1).reverse()]) + 'Z',
    // where the four ropes leave the envelope (matching the rim at -R1, -R2, R2, R1)
    attach: [pt(-.95, .7), pt(-.74, .82), pt(.74, .82), pt(.95, .7)],
  };
}

/** What a passenger's envelope art returns (see rig.js "spec.envelope"). */
export interface EnvArt {
  base?: string;
  inside?: string;
  over?: string;
  under?: string;
  html?: string;
  lip?: string;
  ring?: string;
}

// the envelope as one filtered drawing: skin art + the standard shading, outline, rope rings, the dark mouth
function envMarkup(geo: EnvGeo, a: EnvArt, u: number): string {
  const cid = `rgv${u}-${++serial}`;
  const shade = `<g stroke="none"><path d="${geo.gore(-1, -.42)}" fill="url(#rgp${u})"/><path d="${geo.gore(-1, -.76)}" fill="url(#rgq${u})"/><path d="${geo.gore(-1, -.6)}" fill="#000" opacity=".13"/><path d="${geo.band(.8, 1)}" fill="#000" opacity=".2"/><path d="${geo.band(.1, .46, .6, .86)}" fill="#fff" opacity=".2"/></g>`;
  const rings = geo.attach.map((p) => `<circle cx="${n(p[0])}" cy="${n(p[1])}" r="2.3" fill="none" stroke-width="2.2"/><circle cx="${n(p[0])}" cy="${n(p[1])}" r="2.3" fill="none" stroke="${a.ring || '#9aa2a8'}" stroke-width=".9"/>`).join('');
  return S('rig-rim rig-envs', -W / 2, 0, W, HG + 10, `<defs><clipPath id="${cid}"><path d="${geo.out}"/></clipPath></defs>${G(u, `${a.under || ''}<g clip-path="url(#${cid})"><path d="${geo.out}" fill="${a.base || '#8b6b47'}" stroke="none"/>${a.inside || ''}${shade}</g><path d="${geo.out}" fill="none" stroke-width="1.3"/>${a.over || ''}${rings}<ellipse cx="0" cy="${HG}" rx="${MRX}" ry="${MRY}" fill="#170f0a" stroke-width="1.1"/>`)}`);
}

const GO: Readonly<Record<SkyMode, number>> = { night: .9, dusk: .65, day: .3, overcast: .42 };
const BASE = `
.rig{position:relative;width:${W}px;pointer-events:none;--k:1;--rig-f1:#f08a2c;--rig-f2:#ffe9a8;--rig-gl:255,176,96;--rig-lip:#8d949b}
.rig *{box-sizing:border-box}
.rig-defs{position:absolute;left:0;top:0}
.rig-a{position:absolute;left:0;top:0;width:${W}px;height:0}
.rig-z{position:absolute;width:0;height:0}
.rig-s{position:absolute;overflow:visible;display:block}
.rig-s *{transform-box:view-box}
.rig[data-sky=night] .rig-rim{filter:drop-shadow(0 0 .7px rgba(255,230,186,.5))}
.rig[data-sky=dusk] .rig-rim{filter:drop-shadow(0 0 .6px rgba(255,226,190,.3))}
.rig-env,.rig-car{will-change:transform;transform-origin:${CX}px ${HG}px}
.rig-envb{transform-origin:${CX}px ${HG}px;animation:rig-eb 5.2s ease-in-out infinite alternate}
.rig-eglow{position:absolute;left:0;top:0;width:${W}px;height:${HG + 8}px;opacity:0;will-change:opacity;background:radial-gradient(78px 92px at ${CX}px ${HG + 6}px,rgba(var(--rig-gl),.66),rgba(var(--rig-gl),.22) 55%,rgba(var(--rig-gl),0))}
.rig-mglow{position:absolute;left:${CX - MRX + 1}px;top:${HG - MRY + .6}px;width:${2 * MRX - 2}px;height:${2 * MRY - 1.2}px;border-radius:50%;opacity:0;will-change:opacity;background:radial-gradient(closest-side,rgba(255,246,214,.95),rgba(var(--rig-gl),.9) 50%,rgba(var(--rig-gl),.35))}
.rig-flc{position:absolute;left:0;top:0;width:${W}px;height:${RY}px;clip-path:path("M0,${HG + 80}V${HG}H${CX - MRX}A${MRX},${MRY} 0 0 1 ${CX + MRX},${HG}H${W}V${HG + 80}Z")}
.rig-halo{position:absolute;left:-24px;top:-34px;width:48px;height:48px;border-radius:50%;opacity:0;will-change:opacity;background:radial-gradient(closest-side,rgba(var(--rig-gl),.6),rgba(var(--rig-gl),0))}
.rig-fl{will-change:transform,opacity;transform-origin:0 0}
.rig-fk{transform-origin:0 0;animation:rig-fk .41s ease-in-out infinite alternate}
.rig-fk+.rig-fk{animation-duration:.29s}
.rig-fk svg{left:-14px;top:-64px}
.rig-f1{fill:var(--rig-f1);stroke:rgba(150,60,10,.75);stroke-width:.8}.rig-f2{fill:var(--rig-f2)}
.rig-lipc{stroke:var(--rig-lip)}
.rig-lines{left:0;top:0}
.rig-cord use{fill:none;stroke-linecap:round}
.rig-cord-chain .c0{stroke:var(--cl);stroke-width:calc(var(--cw)*.55);opacity:.75}
.rig-cord-chain .c1{stroke:var(--cd);stroke-width:calc(var(--cw)*1.75);stroke-dasharray:2.2 4.6}
.rig-cord-chain .c2{stroke:var(--cl);stroke-width:var(--cw);stroke-dasharray:2.2 4.6}
.rig-cord-chain .c3{stroke:var(--cd);stroke-width:.8px;stroke-dasharray:1.8 5;stroke-dashoffset:-.2}
.rig-cord-rope .c0{stroke:var(--cd);stroke-width:calc(var(--cw) + 1.3px)}
.rig-cord-rope .c1{stroke:var(--cl);stroke-width:var(--cw);stroke-dasharray:3 1;stroke-linecap:butt}
.rig-clip{position:absolute;left:-40px;top:-60px;width:${W + 80}px;height:${RY + 5 + 60}px;overflow:hidden}
.rig-in{position:absolute;left:40px;top:60px;width:${W}px;height:0}
.rig-sign{position:absolute;top:${SY}px;transform-origin:50% 0;will-change:transform;text-align:center;font-family:"Cormorant Garamond",Georgia,serif;color:#ece5d2}
.rig-zoom{position:relative}
.rig-board{position:absolute;inset:0}
.rig-board svg{position:absolute;left:0;top:0;overflow:visible;display:block}
.rig-text{position:relative;padding:8px 10px}
.rig-text>div:empty{display:none}
.rig-tag{font:500 12px/1.3 Cinzel,Georgia,serif;letter-spacing:.24em;margin-right:-.24em;text-transform:uppercase}
.rig-title{font:italic 600 15px/1.07 "Cormorant Garamond",Georgia,serif;text-wrap:balance;overflow-wrap:anywhere}
.rig-fig{font:600 25px/.96 "Cormorant Garamond",Georgia,serif;font-variant-numeric:lining-nums;white-space:nowrap}
.rig-unit{font:italic 500 14px/1 "Cormorant Garamond",Georgia,serif;margin-left:3px}
.rig-rate{display:flex;justify-content:center;align-items:center;gap:6px;min-height:14px;margin-top:1px}
.rig-rate svg{display:block;overflow:visible}
.rig-word{font:400 12.5px/1 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.16em;margin-right:-.16em}
.rig-q{font:italic 400 14px/1 "IM Fell English",Georgia,serif}
.rig-more{font:italic 500 12px/1.1 "Cormorant Garamond",Georgia,serif;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rig-fit1 .rig-title{font-size:14px!important;line-height:1!important}
.rig-fit1 .rig-fig{font-size:22px!important;line-height:.95!important}
.rig-fit1 .rig-unit{font-size:13px!important}
.rig-fit1 .rig-rate{margin-top:0!important;min-height:13px!important}
.rig-fit1 .rig-more{margin-top:1px!important;line-height:1.05!important}
.rig-fit1 .rig-tag{line-height:1.15!important}
.rig-fit1[data-kind=achievement] .rig-title{font-size:12.5px!important;line-height:1.05!important;text-wrap:wrap}
.rig-fit2 .rig-title{font-size:13.5px!important}
.rig-fit2 .rig-fig{font-size:20px!important}
.rig-fit2[data-kind=achievement] .rig-text{padding-left:8px!important;padding-right:8px!important}
.rig-fit2 .rig-tag{line-height:1.1!important}
.rig-fit2[data-kind=achievement] .rig-title{font-size:12px!important;line-height:1.04!important;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden}
.rig-still{margin:0 auto}
.rig-rm *,.rig-rm *::before,.rig-rm *::after{transition:none!important;animation:none!important}
@keyframes rig-eb{from{transform:scale(1,1)}to{transform:scale(1.012,.99)}}
@keyframes rig-fk{0%{transform:scale(1,1) skewX(0)}45%{transform:scale(.9,1.08) skewX(5deg)}100%{transform:scale(1.06,.93) skewX(-5deg)}}
`;
/** The port's own rules (not in the mockup): the zoom fallback and the distant balloon's rest. */
const PORT = `
.rig-zoomx{transform:scale(${SS});transform-origin:0 0}
.rig-far *,.rig-far *::before,.rig-far *::after{animation-play-state:paused!important}
`;
const FLAME = `<div class="rig-z rig-fk">${SL('', -14, -64, 28, 66, '<path class="rig-f1" d="M0,0C-9,-2 -12,-11 -7,-21C-6,-15 -3,-16 -4,-29C-1,-39 -2,-50 2,-62C4,-48 9,-38 8,-24C10,-13 8,-3 0,0Z"/>')}</div><div class="rig-z rig-fk">${SL('', -14, -64, 28, 66, '<path class="rig-f2" d="M0,-1C-5,-3 -6,-10 -2,-19C0,-27 1,-36 2,-45C5,-32 6,-18 5,-9C4,-4 2,-1 0,-1Z"/>')}</div>`;
const LIP = `M${-MRX},${HG}A${MRX},${MRY} 0 0 0 ${MRX},${HG}`;

/** A cord: a rope or a chain (see rig.js "spec.ropes"). */
export interface Cord {
  kind?: 'rope' | 'chain';
  dark?: string;
  light?: string;
  w?: number;
}
const cordG = (pid: string, c: Cord = {}): string => {
  const kind = c.kind === 'chain' ? 'chain' : 'rope', cnt = kind === 'chain' ? 4 : 2;
  let s = ''; for (let i = 0; i < cnt; i++) s += `<use href="#${pid}" class="c${i}"/>`;
  return `<g class="rig-cord rig-cord-${kind}" style="--cd:${c.dark || '#17120e'};--cl:${c.light || '#c9b07c'};--cw:${c.w || 1.5}px"><defs><path id="${pid}"/></defs>${s}</g>`;
};

// ---- the spec a passenger supplies (rig.js header, "spec") ----

/** What the frame callback hands the passenger's life (no layout reads there). */
export interface FrameInfo {
  burn: number;
  lean: number;
  swing: number;
  hang: number;
  d: number;
  dt: number;
  now: number;
  phase: RigPhase;
  pe(x: number, y: number): Pt2;
  pc(x: number, y: number): Pt2;
}

export interface BoardArgs {
  w: number;
  h: number;
  hx: number;
  mood: Mood;
  kind: SignContent['kind'];
  u: number;
}

export interface SignSpec {
  w?: number;
  hx?: number;
  k?: number;
  c?: number;
  below?: number;
  cord?: Cord;
  bx?: number;
  by?: number;
  board?(o: BoardArgs): string;
  pips?(mood: Mood, notice: SignContent): string;
}

/** The passenger's life (all optional). */
export interface Life {
  arrive?(mood: Mood): void;
  leave?(): void;
  changed?(mood: Mood, was: Mood): void;
  struck?(): void;
  frame?(info: FrameInfo): void;
  stop?(): void;
}

/** One balloon as the passenger's life sees it. */
export interface RigBalloon {
  readonly root: HTMLElement;
  readonly u: number;
  mood: Mood;
  notice: SignContent;
  /** A part of the passenger's own markup (it is there: the code wrote it). */
  q(sel: string): Part;
  qa(sel: string): Part[];
  readonly sign: HTMLElement;
  /** prefers-reduced-motion as it was when this balloon was made: its still form, no life. */
  readonly reduced: boolean;
}

export interface RigLine {
  cord?: Cord;
  a(info: FrameInfo, R: RigBalloon): Pt2;
  b(info: FrameInfo, R: RigBalloon): Pt2;
}

export interface EnvSpec {
  cond?: EnvCond;
  art?(geo: EnvGeo, u: number): EnvArt;
}

export interface RigSpec {
  id: string;
  css?: string;
  moods?: readonly Mood[];
  defs?(u: number): string;
  envelope(mood: Mood): EnvSpec | undefined;
  ropes?: Cord;
  burner?(u: number): string;
  lines?: readonly RigLine[];
  basket?(u: number): string;
  behind?(u: number): string;
  front?(u: number): string;
  sign?: SignSpec;
  life?(R: RigBalloon): Life | undefined;
}

/** What a rig knows of its page (the mockup's `ctx`). */
export interface RigCtx {
  doc: Document;
  /**
   * prefers-reduced-motion: the still form, no life, no transitions. Read
   * once per balloon, when it is made (`make` may also be told), so a
   * change of the setting mid-session reaches the next balloon and never
   * splits one between its flight and its rig. (A plain boolean: fixed.)
   */
  reduced: boolean | (() => boolean);
  /** The backdrop, read when a balloon is made. */
  skyMode(): SkyMode;
  /** The mockup's time multiplier for the passenger's own timings: 1 in the product. */
  pace(): number;
}

/** A passenger module's export (passengers/<id>.ts). */
export interface PassengerDef {
  id: string;
  name: string;
  spec(ctx: RigCtx): RigSpec;
}

export const kit = { INK, NS, n, n2, pp, S, SL, Z, G, P, Q, filt, SOFT, hatch, ink2, mix, dark, light, clock };

// ---- styles: one <style> per id and document, removed with its last rig ----
const styles = new WeakMap<Document, Map<string, { el: HTMLStyleElement; refs: number }>>();
function addCss(doc: Document, id: string, text: string): () => void {
  let m = styles.get(doc);
  if (!m) styles.set(doc, (m = new Map()));
  let s = m.get(id);
  if (!s) {
    const el = doc.createElement('style');
    el.dataset.wcRig = id;
    el.textContent = signFonts(text);
    doc.head.append(el);
    m.set(id, (s = { el, refs: 0 }));
  }
  s.refs++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    if (--s.refs > 0) return;
    s.el.remove();
    m.delete(id);
  };
}

/** Whether the browser has CSS `zoom` (checked once per document). */
const zoomOk = new WeakMap<Document, boolean>();
function hasZoom(doc: Document): boolean {
  let ok = zoomOk.get(doc);
  if (ok === undefined) {
    const css = (doc.defaultView as (Window & { CSS?: typeof CSS }) | null)?.CSS;
    ok = !!css?.supports?.('zoom', '0.85');
    zoomOk.set(doc, ok);
  }
  return ok;
}

/** The rig's internal state per balloon. */
interface RigState extends RigBalloon {
  board: HTMLElement;
  text: HTMLElement;
  zoom: HTMLElement;
  h: number;
  lift: number;
  fitKey: string;
  warned: number;
  geo: EnvGeo;
  envl: HTMLElement | null;
  env: HTMLElement;
  envh: HTMLElement;
  car: HTMLElement;
  eglow: HTMLElement;
  mglow: HTMLElement;
  halo: HTMLElement;
  fl: HTMLElement;
  ropeP: SVGPathElement;
  extraP: SVGPathElement[];
  hangP: SVGPathElement;
  life: Life;
  kick(v: number): void;
}

interface RigFrame {
  lean: number;
  swing: number;
  phase: RigPhase;
  burn: number;
}

export interface Rig {
  /** One balloon with its first sign, as a skin for the flight. */
  make(sign: SignContent, opts?: { reduced?: boolean }): BalloonSkin;
  /** Its styles and listeners (the balloons it made are destroyed by their flights). */
  destroy(): void;
}

const rigPhase = (p: Phase): RigPhase => (p === 'arrive' ? 'arrive' : p === 'read' ? 'read' : 'leave');

export function createRig(ctx: RigCtx, spec: RigSpec): Rig {
  const doc = ctx.doc, id = spec.id;
  const win = doc.defaultView ?? window;
  const perf = win.performance;
  const unCss = [addCss(doc, 'rig', BASE + PORT)];
  if (spec.css) unCss.push(addCss(doc, id, spec.css));
  const zoomed = hasZoom(doc);
  const MOODS = spec.moods || ['calibrating', 'poor', 'meh', 'good', 'great', 'superb', 'pvp', 'levelup', 'death', 'achievement'];
  const norm = (m: Mood): Mood => (MOODS.includes(m) ? m : 'calibrating');
  const sg = { w: 158, hx: 58, k: 13, c: 1.9, below: 4, cord: {}, ...spec.sign } as Required<Pick<SignSpec, 'w' | 'hx' | 'k' | 'c' | 'below' | 'cord'>> & SignSpec;
  // the sign is shown at K.SS; its cords run near vertical from just under the rim
  const SWZ = sg.w * SS, HXZ = sg.hx * SS;
  const bx0 = sg.bx ?? HXZ, by0 = sg.by ?? RY + K.CY;
  const extra = spec.lines || [];

  const E = (tag: string, cls: string, text?: string): HTMLElement => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  /** Parses the code's own trusted markup (never game text) into an element. */
  const svg = (markup: string): HTMLElement => {
    const t = doc.createElement('template');
    t.innerHTML = markup.trim();
    return t.content.firstElementChild as HTMLElement;
  };

  // signs whose text was measured before the web fonts arrived are fitted again
  const REFIT = new Set<() => void>();
  const refit = (): void => REFIT.forEach((f) => f());
  const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
  let alive = true;
  fonts?.ready.then(() => { if (alive) refit(); }).catch(() => {});
  fonts?.addEventListener?.('loadingdone', refit);

  let host: HTMLElement | null = null;
  const measure = (R: RigState): number => {
    if (R.root.isConnected) return R.sign.offsetHeight;
    if (!host) { host = doc.createElement('div'); host.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none'; }
    // (put back where it was: a balloon's wrapper not yet in the page)
    const parent = R.root.parentNode, next = R.root.nextSibling;
    doc.body.append(host); host.append(R.root);
    const h = R.sign.offsetHeight;
    R.root.remove(); host.remove();
    if (parent) parent.insertBefore(R.root, next);
    return h;
  };

  function setEnv(R: RigState, mood: Mood, fade: boolean): void {
    const e = spec.envelope(mood) || {}, geo = envelope(e.cond), art = e.art ? e.art(geo, R.u) : {};
    const layer = svg(`<div class="rig-a rig-envl">${envMarkup(geo, art, R.u)}${art.html || ''}</div>`);
    const old = R.envl;
    R.envh.append(layer); R.envl = layer; R.geo = geo;
    R.eglow.style.clipPath = `path("${geo.outAbs}")`;
    R.root.style.setProperty('--rig-lip', art.lip || '#8d949b');
    if (!old) return;
    if (fade && !R.reduced) {
      layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320 });
      old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, fill: 'forwards' }).onfinish = () => old.remove();
    } else old.remove();
  }

  // the sign's text: every string is the game's, so textContent only
  function fill(R: RigState, nt: SignContent): Mood {
    const mood = norm(nt.mood), b = R.text, ach = nt.kind === 'achievement';
    R.notice = nt;
    for (const el of [R.root, R.sign]) { el.dataset.mood = mood; el.dataset.kind = nt.kind; }
    b.textContent = '';
    if (ach) b.append(E('div', 'rig-tag', nt.label));
    b.append(E('div', 'rig-title', nt.title));
    const fig = E('div', 'rig-fig', nt.big);
    if (nt.unit) fig.append(E('span', 'rig-unit', nt.unit));
    b.append(fig);
    if (nt.kind === 'kill') {
      const r = E('div', 'rig-rate'), pips = sg.pips && sg.pips(mood, nt);
      if (pips) r.append(svg(pips));
      r.append(nt.label ? E('span', 'rig-word', nt.label) : E('span', 'rig-q', '?'));
      b.append(r);
    } else if (!ach && nt.label) b.append(E('div', 'rig-tag', nt.label));
    b.append(E('div', 'rig-more', nt.more));
    return mood;
  }
  // the board is drawn to the measured text (never called from the frame callback)
  function fit(R: RigState): void {
    // the height limit: tighten the text in two steps until the sign ends at or above MAXH
    R.sign.classList.remove('rig-fit1', 'rig-fit2');
    const real = (): number => {
      if (zoomed) return measure(R);
      // no zoom: the inner box is scaled by a transform, so the sign takes its scaled height
      R.sign.style.height = '';
      const h = measure(R) * SS;
      R.sign.style.height = h + 'px';
      return h;
    };
    let h = Math.ceil(real());                      // real px, after the zoom
    for (const cls of ['rig-fit1', 'rig-fit2']) { if (SY + h < K.MAXH) break; R.sign.classList.add(cls); h = Math.ceil(real()); }
    // last resort: the sign hangs up to 5 px higher
    R.lift = Math.max(0, Math.min(5, SY + h - K.MAXH + 1));
    R.sign.style.top = SY - R.lift + 'px';
    if (SY - R.lift + h >= K.MAXH && R.warned !== h) { R.warned = h; console.warn(`Rig: the ${id} sign for "${R.notice.kind}/${R.mood}" ends at y ${SY - R.lift + h}, below MAXH ${K.MAXH}. Reduce the sign's padding or type in the skin.`); }
    const bh = Math.round(h / SS), key = `${bh}|${R.mood}|${R.notice.kind}`;   // the board's height in the skin's own (unscaled) px
    if (key !== R.fitKey) {
      R.fitKey = key;
      const art = sg.board ? sg.board({ w: sg.w, h: bh, hx: sg.hx, mood: R.mood, kind: R.notice.kind, u: R.u }) : `<rect width="${sg.w}" height="${bh}" fill="#2a2420" stroke="${INK}"/>`;
      R.board.replaceChildren(svg(`<svg class="rig-rim" xmlns="${NS}" width="${sg.w}" height="${bh}" viewBox="0 0 ${sg.w} ${bh}">${art}</svg>`));
    }
    R.h = SY - R.lift + h + sg.below;
    R.root.style.height = R.h + 'px';
  }

  function build(nt: SignContent, reduced: boolean): RigState {
    const u = ++uid;
    const lines = [spec.ropes || {}, ...extra.map((l) => l.cord || {})].map((c, i) => cordG(`rgl${u}-${i}`, c)).join('');
    const root = svg(`<div class="rig ${id}-v">${defs(u, spec.defs ? spec.defs(u) : '')}
<div class="rig-a rig-env"><div class="rig-a rig-envb"><div class="rig-a rig-envh"></div></div><div class="rig-eglow"></div><div class="rig-mglow"></div>
<div class="rig-flc"><div class="rig-z" style="left:${CX}px;top:${FY}px"><div class="rig-halo"></div><div class="rig-z rig-fl">${FLAME}</div></div></div>
${S('rig-lip', -MRX - 3, HG - 2, 2 * MRX + 6, MRY + 6, `<path d="${LIP}" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/><path class="rig-lipc" d="${LIP}" fill="none" stroke-width="1.9" stroke-linecap="round"/>`)}
<div class="rig-a rig-burner">${spec.burner ? spec.burner(u) : ''}</div></div>
<svg class="rig-s rig-lines" xmlns="${NS}" width="${W}" height="10">${lines}</svg>
<div class="rig-a rig-car"><div class="rig-clip"><div class="rig-in">${spec.behind ? spec.behind(u) : ''}</div></div>${spec.basket ? spec.basket(u) : ''}${spec.front ? spec.front(u) : ''}</div>
<svg class="rig-s rig-lines" xmlns="${NS}" width="${W}" height="10">${cordG(`rgl${u}-s`, sg.cord)}</svg>
</div>`);
    const q = <T extends Element = Part>(s: string): T => root.querySelector(s) as T, qa = (s: string): Part[] => [...root.querySelectorAll<Part & Element>(s)];
    const sign = E('div', `rig-sign ${id}-sign`), zoom = E('div', 'rig-zoom'), board = E('div', 'rig-board'), text = E('div', 'rig-text');
    sign.style.width = SWZ + 'px'; sign.style.left = (W - SWZ) / 2 + 'px';
    zoom.style.width = sg.w + 'px';
    if (zoomed) zoom.style.setProperty('zoom', String(SS));
    else zoom.classList.add('rig-zoomx');
    zoom.append(board, text); sign.append(zoom); root.append(sign);
    const R: RigState = {
      root, u, q, qa, sign, board, text, zoom, mood: norm(nt.mood), notice: nt, h: 0, lift: 0, fitKey: '', warned: NaN, geo: envelope(), envl: null,
      env: q('.rig-env'), envh: q('.rig-envh'), car: q('.rig-car'), eglow: q('.rig-eglow'), mglow: q('.rig-mglow'), halo: q('.rig-halo'), fl: q('.rig-fl'),
      ropeP: q<SVGPathElement>(`#rgl${u}-0`), extraP: extra.map((_, i) => q<SVGPathElement>(`#rgl${u}-${i + 1}`)), hangP: q<SVGPathElement>(`#rgl${u}-s`),
      life: {}, kick: () => {}, reduced,
    };
    R.mood = fill(R, nt);
    setEnv(R, R.mood, false);
    root.dataset.sky = ctx.skyMode();
    root.style.setProperty('--k', String(1 / ctx.pace()));
    if (R.reduced) root.classList.add('rig-rm');
    fit(R);
    R.life = (spec.life && spec.life(R)) || {};
    return R;
  }

  // ---- every frame: the lean, the car swinging late, the ropes, the sign on its two cords, the flame ----
  function animator(R: RigState, quiet: boolean): (f: RigFrame) => void {
    let last = 0, sx = 0, sv = 0, ph: RigPhase | '' = quiet ? 'read' : '';
    const go = GO[ctx.skyMode()] ?? .5, AR = BY - HG, life = R.life;
    const att = R.geo.attach.map((p) => p.slice() as Pt2), rim = [-K.R1, -K.R2, K.R2, K.R1];
    let ce = 1, se = 0, c = 1, s = 0;
    const pe = (x: number, y: number): Pt2 => [CX + x * ce - (y - HG) * se, HG + x * se + (y - HG) * ce];
    const pc = (x: number, y: number): Pt2 => [CX + x * c - (y - HG) * s, HG + x * s + (y - HG) * c];
    const info: FrameInfo = { burn: .15, lean: 0, swing: 0, hang: 0, d: 0, dt: .016, now: 0, phase: 'read', pe, pc };
    R.kick = (v) => { sv += v; };
    return (f) => {
      const now = perf.now(), dt = last ? Math.min(.05, (now - last) / 1000) : .016; last = now;
      const ea = f.lean * .8, phi = f.swing;
      ce = Math.cos(ea * D); se = Math.sin(ea * D); c = Math.cos(phi * D); s = Math.sin(phi * D);
      R.env.style.transform = `rotate(${ea.toFixed(2)}deg)`;
      R.car.style.transform = `rotate(${phi.toFixed(2)}deg)`;
      // the ropes, hinged at both ends (their upper ends follow a changed envelope)
      const tg = R.geo.attach, e = Math.min(1, dt * 7);
      let d = '';
      for (let i = 0; i < 4; i++) {
        const a = att[i]!, t = tg[i]!;
        a[0] += (t[0] - a[0]) * e; a[1] += (t[1] - a[1]) * e;
        d += `M${pp(pe(a[0], a[1]))}L${pp(pc(rim[i]!, RY - 1))}`;
      }
      R.ropeP.setAttribute('d', d);
      // the sign: a heavy thing on two cords, following the basket late
      const bx = -AR * s, SYe = SY - R.lift, LC = Math.max(3, SYe - by0), DM = Math.min(LC * .65, 3.5);
      sv += ((bx + f.swing * .7 - f.lean * .6 - sx) * sg.k * 1.6 - sv * sg.c * 1.9) * dt; sx += sv * dt;
      const dd = Math.max(-DM, Math.min(DM, sx - bx)), th = Math.asin(dd / LC), dy = -LC * (1 - Math.cos(th)) + AR * (c - 1), X = bx + dd;
      const rot = phi * .4 + dd * .35, cr = Math.cos(rot * D), sr = Math.sin(rot * D), lo = 2 * SS;
      R.sign.style.transform = `translate(${X.toFixed(1)}px,${dy.toFixed(1)}px) rotate(${rot.toFixed(2)}deg)`;
      const h1 = [CX + X - HXZ * cr - lo * sr, SYe + dy - HXZ * sr - lo * cr], h2 = [CX + X + HXZ * cr - lo * sr, SYe + dy + HXZ * sr - lo * cr];
      R.hangP.setAttribute('d', `M${pp(pc(-bx0, by0))}L${pp(h1)}M${pp(pc(bx0, by0))}L${pp(h2)}`);
      // the flame and its light: from burn alone
      const b = Math.max(0, Math.min(1, f.burn));
      R.fl.style.transform = `scale(${(.5 + .55 * b).toFixed(2)},${(.15 + .85 * b).toFixed(2)})`;
      R.fl.style.opacity = (.72 + .28 * b).toFixed(2);
      R.halo.style.opacity = (b * b * go).toFixed(2);
      R.mglow.style.opacity = (.12 + .88 * b).toFixed(2);
      R.eglow.style.opacity = (Math.pow(b, 1.3) * go).toFixed(2);
      info.burn = b; info.lean = ea; info.swing = phi; info.hang = -phi + dd * 2.4; info.d = dd; info.dt = dt; info.now = now; info.phase = f.phase;
      if (life.frame) life.frame(info);
      for (let i = 0; i < extra.length; i++) R.extraP[i]!.setAttribute('d', `M${pp(extra[i]!.a(info, R))}L${pp(extra[i]!.b(info, R))}`);
      if (f.phase !== ph) {
        ph = f.phase;
        if (ph === 'read') { R.root.classList.add('rig-at'); if (life.arrive) life.arrive(R.mood); }
        if (ph === 'leave' && !R.reduced) { R.root.classList.add('rig-off'); if (life.leave) life.leave(); }
      }
    };
  }

  return {
    make(first, opts) {
      const R = build(first, opts?.reduced ?? (typeof ctx.reduced === 'function' ? ctx.reduced() : ctx.reduced));
      const REST: RigFrame = { lean: 0, swing: 0, phase: 'read', burn: .15 };
      const fr = animator(R, R.reduced);
      const refitMe = (): void => { if (R.root.isConnected) fit(R); };
      REFIT.add(refitMe);
      let stopped = false, frozen = false, shown = first;
      const stop = (): void => {
        if (stopped) return;
        stopped = true;
        R.life.stop?.();
        REFIT.delete(refitMe);
      };
      // The flight moves this wrapper (absolute, its origin the top centre); the rig inside keeps its own relative box.
      const el = doc.createElement('div');
      el.style.width = W + 'px';
      el.append(R.root);
      if (R.reduced) {
        // the still form (the mockup's still(): at rest, arrived)
        R.root.classList.add('rig-at', 'rig-still');
        fr(REST);
      }
      return {
        el,
        size: { w: W, h: K.MAXH },
        setMood() { /* the mood comes with the sign */ },
        setSign(nn, joined) {
          if (nn === shown && !joined) return;
          shown = nn;
          const was = R.mood;
          R.mood = fill(R, nn); fit(R);
          if (was !== R.mood) setEnv(R, R.mood, !frozen);
          if (!joined || R.reduced || frozen) return;
          // struck like a bell
          R.sign.animate([0, 1.3, -1.1, .8, -.6, .4, -.2, 0].map((x, i) => ({ transform: `translate(${x}px,${i === 1 ? .8 : 0}px) rotate(${x * .3}deg)` })), { duration: 430, easing: 'linear', composite: 'add' });
          if (R.life.struck) R.life.struck();
          if (was !== R.mood && R.root.classList.contains('rig-at') && R.life.changed) R.life.changed(R.mood, was);
        },
        frame(p: SkinPose) {
          if (frozen || R.reduced) return;
          fr({ lean: p.tilt, swing: p.swing, phase: rigPhase(p.phase), burn: p.burn });
        },
        rest() {
          if (frozen) return;
          frozen = true;
          stop();
          // every animation in it, the life's Web Animations and the CSS ones alike, paused where it is (no jump)
          for (const a of R.root.getAnimations?.({ subtree: true }) ?? []) a.pause();
          R.root.classList.add('rig-far');
        },
        destroy() {
          stop();
          el.remove();
        },
      };
    },
    destroy() {
      alive = false;
      fonts?.removeEventListener?.('loadingdone', refit);
      REFIT.clear();
      for (const u of unCss.splice(0)) u();
    },
  };
}
