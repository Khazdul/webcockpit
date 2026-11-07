// The start page wordmark as markup (stage 41b, ADR 0126): forged dark
// iron "MUME" with a flush, slightly domed cyan metal inlay in the
// channels of its thick strokes, "COCKPIT" between thin iron rules whose
// rivets are the inlay's metal. It reflects, never glows: a soft glint
// band sits where the sun or moon would reflect, the lit edge of the
// inlay's dome faces the light, and the inlay dims when there is little
// light. Re-derived from notes/research/start-menu-mockups/round6/
// logo-3-cyan.html (tint c).
//
// Dependency free (the glyph outlines and a type), so the first paint
// (src/boot/first-paint.ts, ADR 0083) can draw the same mark without
// Preact and without any web font: the letters are SVG paths
// (wordmark-glyphs.ts, from Cinzel by scripts/build-wordmark-glyphs.py).
//
// Two stacked SVGs. The iron (`data-wcw="iron"`) holds everything that
// never changes, the drop shadow's blur among it, and is painted once.
// The inlay (`data-wcw="inlay"`, its own compositing layer) holds what the
// light moves: the day and night metal, the glint, the dimming and the
// dome's lit and shaded edges. `applyWordmarkLight` only sets a few
// attributes there (no filters in that layer), so an update repaints a
// small, cheap layer. The only animation, a very faint sheen sweeping
// over the iron now and then, is a compositor-only transform
// (`setWordmarkMotion`).
//
// Geometry: font units (1000 per em), y down, baseline y = 0 (as the
// glyph module). The channel is the letter shrunk by `CORE_IN` (a mask: the
// letter filled white, its outline stroked black twice as wide), so only
// the thick strokes keep an inlay.

import type { SkyLook } from './sky/look';
import { COCKPIT, MUME } from './wordmark-glyphs';

export type WordmarkSize = 'full' | 'small';

/** What the wordmark reads from the sky. */
export type WordmarkLook = Pick<SkyLook, 'dayness' | 'light'>;

/** Where the mark sits: its light centre (px) in a viewport of `vw` x `vh` px. */
export interface MarkBox {
  cx: number;
  cy: number;
  vw: number;
  vh: number;
}

/** The light on the mark, everything `applyWordmarkLight` sets (pure numbers and colours). */
export interface WordmarkLight {
  /** Night metal over the day metal, 0..1. */
  night: number;
  /** Darkening of the inlay, 0..1 (little light to reflect). */
  dim: number;
  /** The glint band's centre, font units along the word. */
  glintX: number;
  /** Its colour (`rgb()`) and peak opacity. */
  glintColor: string;
  glintCore: string;
  glintAlpha: number;
  /** Offset (font units) of the dome's lit edge copies: towards the light is (-dx, -dy). */
  dx: number;
  dy: number;
  /** The lit edge's colour and opacity. */
  edgeColor: string;
  edgeAlpha: number;
  /** The rivets' gradient: highlight, body, rim. */
  rivet: [string, string, string];
}

type Rgb = [number, number, number];

// ---------------------------------------------------------------- the look (tint c, ADR 0126)

/** Day metal: bright cyan steel, banded top to bottom (offset, colour). */
const DAY: ReadonlyArray<[number, string]> = [
  [0, '#b8fbf8'],
  [0.22, '#2fd0d0'],
  [0.48, '#0a5c5e'],
  [0.6, '#1a9496'],
  [0.75, '#5fe0de'],
  [1, '#063c3e'],
];
/** Night metal: cooler, more silvery cyan. */
const NIGHT: ReadonlyArray<[number, string]> = [
  [0, '#cff6f7'],
  [0.22, '#6cc0c6'],
  [0.48, '#245a62'],
  [0.6, '#468b92'],
  [0.75, '#93d3d8'],
  [1, '#1b434a'],
];
/** Rivets by day and by night: highlight, body, rim. */
const RIVET_DAY: [Rgb, Rgb, Rgb] = [hex('#dcfffd'), hex('#22c8c8'), hex('#053a3c')];
const RIVET_NIGHT: [Rgb, Rgb, Rgb] = [hex('#eafeff'), hex('#6cbcc2'), hex('#163a40')];
/** The channel's lit lower lip. */
const LIP = 'rgba(170,242,240,.55)';
/** COCKPIT's ink. */
const INK = '#bff0ee';
/** The iron face, top to bottom. */
const FACE: ReadonlyArray<[number, string]> = [
  [0, '#6a5c4e'],
  [0.18, '#3c332b'],
  [0.6, '#241e19'],
  [1, '#16110e'],
];

// ---------------------------------------------------------------- geometry (font units)

/** The face's top (where the metal gradient starts): 0.72 em above the baseline. */
const TOP = -720;
/** The channel: the letter shrunk by this much (0.049 em). */
const CORE_IN = 49;
/** The channel's dark rim and its lit lip. */
const RIM_W = 12.5;
const LIP_DY = 8.5;
/** The dome's lit and shaded edges: copies of the channel's outline this far off (two, for softness). */
const EDGE_D = [5, 10];
/** The glint band's half width (0.9 em). */
const GLINT_W = 900;
const PAD = 40;
const VX = MUME.x0 - PAD;
const VY = MUME.top - PAD;
const VW = MUME.x1 - MUME.x0 + 2 * PAD;
const VH = MUME.bottom + 4 * 9 + PAD - VY;
const VIEW = `${VX} ${VY} ${VW} ${VH}`;

// ---------------------------------------------------------------- the light

const clamp = (v: number, a = 0, b = 1): number => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const sstep = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const rgb = (c: Rgb): string => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;

function hex(s: string): Rgb {
  const h = s.length === 4 ? s.replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3') : s;
  const n = parseInt(h.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A CSS colour (`#rgb`, `#rrggbb`, `rgb()`/`rgba()`) as RGB; `fallback` for anything else. */
export function parseColor(s: string, fallback: Rgb = [255, 255, 255]): Rgb {
  const t = s.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t)) return hex(t);
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(t);
  return m ? [+m[1]!, +m[2]!, +m[3]!] : fallback;
}

/**
 * The light on the mark for a sky `look` (as the mockup's `light()`): the
 * dominant light (sun or moon) seen from the mark, mixed with the sky's
 * light from straight above.
 */
export function wordmarkLight(look: WordmarkLook, box: MarkBox): WordmarkLight {
  const L = look.light;
  const day = clamp(look.dayness);
  const I = L.kind === 'none' ? 0 : clamp(L.strength);
  const amb = 0.45 + 0.35 * day;
  const lx = L.x * box.vw - box.cx;
  const ly = L.y * box.vh - box.cy;
  const dd = Math.hypot(lx, ly) || 1;
  let ux = (lx / dd) * I;
  let uy = (ly / dd) * I - amb;
  const n = Math.hypot(ux, uy) || 1;
  ux /= n;
  uy /= n;
  const sky = mix([176, 192, 228], [255, 244, 228], day);
  const col = mix(sky, parseColor(L.color, sky), clamp(I * 1.2));
  const sx = clamp(0.5 + lx / ((box.vw || 1) * 1.1), 0.04, 0.96);
  const night = sstep(0.25, 0.85, 1 - day);
  const bright = clamp(Math.max(0.55 + 0.45 * day, 0.5 + 0.5 * I));
  const rq = Math.round(night * 20) / 20;
  return {
    night,
    dim: (1 - bright) * 0.9,
    glintX: lerp(MUME.x0, MUME.x1, sx),
    glintColor: rgb(col),
    glintCore: rgb(mix(col, [255, 255, 255], 0.5)),
    glintAlpha: 0.18 + 0.3 * I,
    dx: ux,
    dy: uy,
    edgeColor: rgb(mix(col, [255, 250, 240], 0.4)),
    edgeAlpha: 0.4 + 0.3 * I,
    rivet: [0, 1, 2].map((i) => rgb(mix(RIVET_DAY[i]!, RIVET_NIGHT[i]!, rq))) as [string, string, string],
  };
}

// ---------------------------------------------------------------- markup

const stops = (s: ReadonlyArray<[number, string]>): string =>
  s.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('');

/** A deterministic random sequence (the brush lines look the same everywhere). */
function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fine horizontal brush lines over the inlay: light ones and dark ones, as two paths. */
function brush(): string {
  const r = rng(7);
  const light: string[] = [];
  const dark: string[] = [];
  for (let i = 0; i < 220; i++) {
    const w = Math.round(150 + r() * 500);
    const x = Math.round(MUME.x0 - 300 + r() * (MUME.x1 - MUME.x0 + 300));
    const y = Math.round(TOP + r() * -TOP);
    (r() > 0.5 ? light : dark).push(`M${x} ${y}h${w}v3h-${w}z`);
  }
  return `<path fill="#fff" opacity=".045" d="${light.join('')}"/><path fill="#000" opacity=".06" d="${dark.join('')}"/>`;
}
let brushCache: string | null = null;

const SVG = 'xmlns="http://www.w3.org/2000/svg"';
const LAYER = 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible';

/** The iron: drop shadow, stepped extrusion, lit top edge, face, the channel's lip and rim. */
function iron(id: string): string {
  const P = `#${id}-p`;
  const box = `maskUnits="userSpaceOnUse" x="${VX}" y="${VY}" width="${VW}" height="${VH}"`;
  const rimStroke = 2 * (CORE_IN - RIM_W);
  let steps = '';
  for (let k = 4; k >= 1; k--) steps += `<use href="${P}" y="${k * 9}" fill="rgb(${14 + k * 3},${11 + k * 2},${9 + k * 2})"/>`;
  return (
    `<svg ${SVG} data-wcw="iron" viewBox="${VIEW}" style="display:block;width:100%;height:100%;overflow:visible" aria-hidden="true">` +
    `<defs><path id="${id}-p" d="${MUME.d}"/>` +
    `<filter id="${id}-sh" filterUnits="userSpaceOnUse" x="${VX - 400}" y="${VY - 300}" width="${VW + 800}" height="${VH + 700}"><feGaussianBlur stdDeviation="80"/></filter>` +
    `<linearGradient id="${id}-face" gradientUnits="userSpaceOnUse" x1="0" y1="${TOP}" x2="0" y2="0">${stops(FACE)}</linearGradient>` +
    `<mask id="${id}-rim" ${box}><use href="${P}" fill="#fff" stroke="#000" stroke-width="${rimStroke}" stroke-linejoin="round"/></mask>` +
    `<mask id="${id}-lip" ${box}><use href="${P}" y="${LIP_DY}" fill="#fff" stroke="#000" stroke-width="${rimStroke}" stroke-linejoin="round"/></mask>` +
    `</defs>` +
    `<use href="${P}" y="50" fill="#000" opacity=".85" filter="url(#${id}-sh)"/>` +
    `<use href="${P}" fill="#0b0807"/>${steps}` +
    `<use href="${P}" y="-11" fill="rgba(255,222,180,.55)"/>` +
    `<use href="${P}" fill="url(#${id}-face)"/>` +
    `<rect mask="url(#${id}-lip)" x="${VX}" y="${VY}" width="${VW}" height="${VH}" fill="${LIP}"/>` +
    `<rect mask="url(#${id}-rim)" x="${VX}" y="${VY}" width="${VW}" height="${VH}" fill="#070403"/>` +
    `</svg>`
  );
}

/** The inlay: metal, brush, the channel's inner shadow, glint, dimming, the dome's edges (the dynamic layer). */
function inlay(id: string): string {
  const P = `#${id}-q`;
  const band = 2 * CORE_IN;
  const area = `x="${VX}" y="${VY}" width="${VW}" height="${VH}"`;
  // the channel's outline as a band; shifted copies of it show inside the channel as an edge facing the shift
  const edge = (w: string, d: number): string =>
    `<use data-wcw="${w}" data-d="${d}" href="${P}" fill="none" stroke="currentColor" stroke-width="${band}" stroke-linejoin="round" opacity=".5"/>`;
  let inner = '';
  for (const dy of [10, 17, 24]) inner += `<use href="${P}" y="${dy}" fill="none" stroke="#0c0805" stroke-width="${band}" stroke-linejoin="round" opacity=".2"/>`;
  return (
    `<svg ${SVG} data-wcw="inlay" viewBox="${VIEW}" style="${LAYER};will-change:transform" aria-hidden="true">` +
    `<defs><path id="${id}-q" d="${MUME.d}"/>` +
    `<mask id="${id}-core" maskUnits="userSpaceOnUse" ${area}><use href="${P}" fill="#fff" stroke="#000" stroke-width="${band}" stroke-linejoin="round"/></mask>` +
    `<linearGradient id="${id}-day" gradientUnits="userSpaceOnUse" x1="0" y1="${TOP}" x2="0" y2="0">${stops(DAY)}</linearGradient>` +
    `<linearGradient id="${id}-night" gradientUnits="userSpaceOnUse" x1="0" y1="${TOP}" x2="0" y2="0">${stops(NIGHT)}</linearGradient>` +
    `<linearGradient data-wcw="glint" id="${id}-glint" gradientUnits="userSpaceOnUse" x1="0" y1="${TOP}" x2="${2 * GLINT_W}" y2="0">` +
    `<stop offset="0" stop-opacity="0"/><stop offset=".43"/><stop offset=".5"/><stop offset=".57"/><stop offset="1" stop-opacity="0"/>` +
    `</linearGradient></defs>` +
    `<g mask="url(#${id}-core)">` +
    `<rect ${area} fill="url(#${id}-day)"/>` +
    `<rect data-wcw="night" ${area} fill="url(#${id}-night)" opacity="0"/>` +
    (brushCache ??= brush()) +
    inner +
    `<rect ${area} fill="url(#${id}-glint)"/>` +
    `<rect data-wcw="dim" ${area} fill="rgb(6,5,8)" opacity="0"/>` +
    `<g data-wcw="lit" color="#fff">${EDGE_D.map((d) => edge('lit-e', d)).join('')}</g>` +
    `<g data-wcw="shade" color="#000" opacity=".35">${EDGE_D.map((d) => edge('shade-e', d)).join('')}</g>` +
    `</g></svg>`
  );
}

/** The faint sheen over the iron: a masked strip whose child the motion slides across (compositor only). */
function sheen(): string {
  const mask = `url("data:image/svg+xml,${encodeURIComponent(`<svg ${SVG} viewBox="${VIEW}"><path d="${MUME.d}"/></svg>`)}")`;
  return (
    `<div data-wcw="sheen" aria-hidden="true" style="${LAYER};overflow:hidden;pointer-events:none;` +
    `-webkit-mask:${mask} 0 0/100% 100% no-repeat;mask:${mask} 0 0/100% 100% no-repeat">` +
    `<div data-wcw="sheen-band" style="position:absolute;top:0;bottom:0;left:-30%;width:30%;transform:translateX(-100%);` +
    `background:linear-gradient(90deg,rgba(255,220,180,0),rgba(255,220,180,.06),rgba(255,220,180,0))"></div></div>`
  );
}

/** COCKPIT between two iron rules, their rivets the inlay's metal (`--wcw-rv-*`). */
function cockpit(id: string): string {
  const gap = 1850;
  const x0 = COCKPIT.x0 - gap;
  const w = COCKPIT.x1 - COCKPIT.x0 + 2 * gap;
  const view = `${x0} ${COCKPIT.top - 60} ${w} ${COCKPIT.bottom - COCKPIT.top + 140}`;
  const rule = (flip: boolean): string =>
    `<span style="position:relative;flex:1 1 0;max-width:30cqw;height:max(2px,.62cqw);border-radius:2px;box-shadow:0 1px 0 #000;` +
    `background:linear-gradient(${flip ? 270 : 90}deg,transparent,#4d433a 30%,#6b5d50)">` +
    `<i style="position:absolute;${flip ? 'left' : 'right'}:max(-3px,-.7cqw);top:50%;width:max(5px,1.5cqw);aspect-ratio:1;transform:translateY(-50%);border-radius:50%;` +
    `box-shadow:0 1px 1px #000;background:radial-gradient(circle at 40% 35%,var(--wcw-rv-hi),var(--wcw-rv-mid) 40%,var(--wcw-rv-lo) 80%)"></i></span>`;
  return (
    `<div data-wcw="cockpit" style="display:flex;align-items:center;justify-content:center;width:max(88cqw,250px);margin:1cqw auto 0">` +
    rule(false) +
    `<svg ${SVG} viewBox="${view}" style="display:block;flex:none;width:max(47cqw,150px);height:auto;overflow:visible" aria-hidden="true">` +
    `<defs><path id="${id}-c" d="${COCKPIT.d}"/></defs>` +
    `<use href="#${id}-c" fill="none" stroke="#000" stroke-width="160" stroke-linejoin="round" opacity=".3"/>` +
    `<use href="#${id}-c" y="70" fill="#000" opacity=".8"/>` +
    `<use href="#${id}-c" fill="${INK}"/></svg>` +
    rule(true) +
    `</div>`
  );
}

/**
 * The wordmark's markup. `id` prefixes the SVG ids (unique per document).
 * `full`: MUME and the COCKPIT row, `--wc-wordmark-w` wide (default
 * responsive). `small`: MUME only, `--wc-wordmark-h` tall (default 32 px).
 * The root carries role="img" and its label.
 */
export function wordmarkMarkup(size: WordmarkSize, id: string): string {
  const full = size === 'full';
  const ratio = `${VW} / ${VH}`;
  const root = full
    ? 'width:var(--wc-wordmark-w,clamp(250px,32vw,520px));max-width:100%;container-type:inline-size'
    : 'height:var(--wc-wordmark-h,32px);width:max-content';
  const mark = full
    ? `position:relative;width:100%;aspect-ratio:${ratio}`
    : `position:relative;height:100%;aspect-ratio:${ratio}`;
  const rv = `--wcw-rv-hi:${rgb(RIVET_DAY[0])};--wcw-rv-mid:${rgb(RIVET_DAY[1])};--wcw-rv-lo:${rgb(RIVET_DAY[2])}`;
  return (
    `<div class="wc-wordmark wc-wordmark-${size}" role="img" aria-label="MUME Cockpit" style="${root};${rv};user-select:none;-webkit-user-select:none">` +
    `<div style="${mark}">${iron(id)}${sheen()}${inlay(id)}</div>` +
    (full ? cockpit(id) : '') +
    `</div>`
  );
}

const q = (root: ParentNode, k: string): Element | null => root.querySelector(`[data-wcw="${k}"]`);
const set = (el: Element | null | undefined, k: string, v: string | number): void => {
  el?.setAttribute(k, typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : v);
};

/** Sets the light on a wordmark made by `wordmarkMarkup` (a few attributes in the inlay layer, the rivet colours). */
export function applyWordmarkLight(root: ParentNode, w: WordmarkLight): void {
  set(q(root, 'night'), 'opacity', w.night);
  set(q(root, 'dim'), 'opacity', w.dim);
  const g = q(root, 'glint');
  if (g) {
    set(g, 'x1', w.glintX - GLINT_W);
    set(g, 'x2', w.glintX + GLINT_W);
    const s = g.children;
    const a = [0, 0.25, 1, 0.25, 0];
    for (let i = 0; i < 5; i++) {
      set(s[i], 'stop-color', i === 2 ? w.glintCore : w.glintColor);
      set(s[i], 'stop-opacity', a[i]! * w.glintAlpha);
    }
  }
  const lit = q(root, 'lit');
  set(lit, 'color', w.edgeColor);
  set(lit, 'opacity', w.edgeAlpha);
  // the lit edge faces the light: its copies are shifted away from it
  for (const e of root.querySelectorAll('[data-wcw="lit-e"]')) {
    const d = Number(e.getAttribute('data-d'));
    set(e, 'transform', `translate(${(-w.dx * d).toFixed(2)} ${(-w.dy * d).toFixed(2)})`);
  }
  for (const e of root.querySelectorAll('[data-wcw="shade-e"]')) {
    const d = Number(e.getAttribute('data-d'));
    set(e, 'transform', `translate(${(w.dx * d).toFixed(2)} ${(w.dy * d).toFixed(2)})`);
  }
  const host = (root as Element).classList?.contains('wc-wordmark') ? root : root.querySelector('.wc-wordmark');
  const st = (host as HTMLElement | null)?.style;
  if (st) {
    st.setProperty('--wcw-rv-hi', w.rivet[0]);
    st.setProperty('--wcw-rv-mid', w.rivet[1]);
    st.setProperty('--wcw-rv-lo', w.rivet[2]);
  }
}

/** The mark's light centre in the viewport (60 % down the letters, as the mockup). */
export function markBox(el: Element, view: { innerWidth: number; innerHeight: number }): MarkBox {
  const mark = el.querySelector('[data-wcw="iron"]') ?? el;
  const r = mark.getBoundingClientRect();
  return { cx: r.left + r.width / 2, cy: r.top + r.height * 0.6, vw: view.innerWidth, vh: view.innerHeight };
}

/** The sheen's period (s): it crosses the word once in it, mostly off the letters. */
const SHEEN_S = 20;

/** Starts (`run`) or stops the sheen. Stopped: no animation at all (reduced motion, hidden page). */
export function setWordmarkMotion(root: ParentNode, run: boolean): void {
  const band = q(root, 'sheen-band') as (HTMLElement & { __wcw?: Animation }) | null;
  if (!band || typeof band.animate !== 'function') return;
  if (!run) {
    band.__wcw?.cancel();
    band.__wcw = undefined;
    return;
  }
  if (band.__wcw) return;
  const anim = band.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(560%)' }], {
    duration: SHEEN_S * 1000,
    iterations: Infinity,
    easing: 'linear',
  });
  // cancel() rejects `finished`; nobody waits on it
  anim.finished?.catch(() => {});
  band.__wcw = anim;
}

/**
 * Draws the wordmark into `host` for `look` (the first paint and anything
 * else without Preact): the markup, then the light for where it landed.
 */
export function paintWordmark(host: HTMLElement, look: WordmarkLook, size: WordmarkSize = 'full', id = 'wcw0'): void {
  host.innerHTML = wordmarkMarkup(size, id);
  const view = host.ownerDocument.defaultView;
  applyWordmarkLight(host, wordmarkLight(look, markBox(host, view ?? { innerWidth: 1, innerHeight: 1 })));
}
