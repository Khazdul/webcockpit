// The goblin skin (stage 69, ADR 0159): a gloomy goblin in a patched hot-air
// balloon with a wooden sign under the basket, ported from the prototype
// the owner saw (notes/research/balloons/prototype-v1.html). A placeholder:
// the owner will have the goblin redrawn; a new look is a new skin
// (skin.ts), the flight and the kill feed stay.
//
// The SVG is rebuilt only when the mood changes (a new best face); the sign
// is the shared HTML sign (sign.ts). Per frame it sets two rotations: the
// rig's lean and the sign's swing. The raster skins the owner will make
// use image-skin.ts instead; this one stays the default.

import './goblin.css';
import type { Mood } from './feed';
import { makeSign } from './sign';
import type { BalloonSkin, SkinPose } from './skin';

const SKIN = '#8f9d63', SKIN_D = '#5d6a38', INK = '#2b3018', EYE = '#e9d46c';

type EyeKind = 'lid' | 'down' | 'heavy' | 'open' | 'wide' | 'happy' | 'glare' | 'x';
interface Expr {
  /** Ear droop, degrees (positive: down). */
  ear: number;
  /** Brow y at the outer and inner ends. */
  brow: [number, number];
  eye: EyeKind;
  mouth?: string;
  mouthFill?: string;
  tooth?: Array<[number, number, number, number]>;
  hands: 'rim' | 'up';
  tear?: boolean;
  sigh?: boolean;
  blush?: boolean;
  stars?: boolean;
  /** Skin colours other than the goblin's green (the ghostly grey of a death). */
  skin?: [string, string];
  /** A level up: confetti round the envelope. */
  confetti?: boolean;
  /** A death: a crooked halo over the head. */
  halo?: boolean;
  /** An achievement: a gold medal on the basket. */
  medal?: boolean;
}

/** One expression per mood (the prototype's six, a fierce one for a player kill, and round 2's level up, death and achievement). */
const EXPR: Readonly<Record<Mood, Expr>> = {
  calibrating: { ear: 12, brow: [221, 221], eye: 'lid', mouth: 'M93 247 L107 247', hands: 'rim' },
  poor: { ear: 30, brow: [222, 214], eye: 'down', mouth: 'M91 251 Q100 242 109 251', hands: 'rim', tear: true },
  meh: { ear: 20, brow: [220, 220], eye: 'heavy', mouth: 'M91 248 q2.5 -2 5 0 t5 0 t5 0', hands: 'rim', sigh: true },
  good: { ear: 6, brow: [219, 218], eye: 'open', mouth: 'M92 247 Q101 250 108 243', hands: 'rim' },
  great: { ear: -6, brow: [214, 214], eye: 'wide', mouthFill: 'M93 245 Q100 255 107 245 Z', tooth: [[99, 245, 3, 3]], hands: 'rim', blush: true },
  superb: { ear: -20, brow: [213, 215], eye: 'happy', mouthFill: 'M88 244 Q100 259 112 244 Z', tooth: [[94, 244, 3, 3.4], [104, 244, 3, 3]], hands: 'up', blush: true, stars: true },
  pvp: { ear: -12, brow: [212, 222], eye: 'glare', mouthFill: 'M89 245 Q100 253 111 245 Z', tooth: [[92, 245, 3, 3.2], [105, 245, 3, 3.2]], hands: 'up' },
  // overjoyed: ears high, eyes squeezed shut, a wide open grin, arms up, stars and confetti
  levelup: { ear: -28, brow: [211, 214], eye: 'happy', mouthFill: 'M86 243 Q100 262 114 243 Z', tooth: [[92, 243, 3, 3.4], [98.5, 243, 3, 3.6], [105, 243, 3, 3.4]], hands: 'up', blush: true, stars: true, confetti: true },
  // gloomy-comic: ghostly grey, X eyes, ears hanging, a wobbly mouth, a crooked halo
  death: { ear: 38, brow: [220, 220], eye: 'x', mouth: 'M90 249 q2.5 -2.5 5 0 t5 0 t5 0 t5 0', hands: 'rim', skin: ['#a9b0ae', '#7d8483'], halo: true },
  // proud: chin up, smug half-shut eyes, a closed smile, a medal on the basket
  achievement: { ear: -10, brow: [214, 217], eye: 'lid', mouth: 'M90 245 Q100 252 110 244', hands: 'rim', blush: true, medal: true },
};

function ear(a: number, [skin, dark]: [string, string]): string {
  return `<g transform="rotate(${-a} 84 228)"><path d="M85 221 Q62 220 44 229 Q63 238 85 237 Z" fill="${skin}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/><path d="M82 225 Q66 225 54 229 Q66 233 82 233 Z" fill="${dark}"/></g>`;
}

function eyes(kind: EyeKind, skin: string): string {
  const one = (cx: number): string => {
    const cy = 227;
    if (kind === 'x') return `<path d="M${cx - 3.4} ${cy - 3.4} L${cx + 3.4} ${cy + 3.4} M${cx + 3.4} ${cy - 3.4} L${cx - 3.4} ${cy + 3.4}" stroke="${INK}" stroke-width="2.1" stroke-linecap="round"/>`;
    if (kind === 'happy') return `<path d="M${cx - 4} ${cy + 1} Q${cx} ${cy - 5} ${cx + 4} ${cy + 1}" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;
    const wide = kind === 'wide';
    const rx = wide ? 4.4 : 3.6, ry = wide ? 4.6 : kind === 'glare' ? 2.4 : 3;
    const py = kind === 'down' ? cy + 1.4 : cy + 0.3;
    let s = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${EYE}" stroke="${INK}" stroke-width="1"/>`;
    s += `<circle cx="${cx + (kind === 'down' ? 0 : 0.4)}" cy="${py}" r="${wide ? 1.9 : 1.4}" fill="${INK}"/>`;
    if (wide) s += `<circle cx="${cx + 1.4}" cy="${cy - 1.6}" r=".9" fill="#fff"/>`;
    const lid = kind === 'heavy' ? 1.2 : kind === 'lid' ? 0.2 : kind === 'down' ? -0.6 : null;
    if (lid !== null) s += `<path d="M${cx - rx - 0.6} ${cy + lid} Q${cx} ${cy - ry - 2.4} ${cx + rx + 0.6} ${cy + lid} Z" fill="${skin}" stroke="${INK}" stroke-width="1.1"/>`;
    return s;
  };
  return one(92) + one(108);
}

function head(e: Expr): string {
  const [outer, inner] = e.brow;
  const sk = e.skin ?? [SKIN, SKIN_D];
  let s = '';
  if (e.halo) s += `<ellipse cx="103" cy="199" rx="15" ry="4" fill="none" stroke="#efe3a0" stroke-width="2.4" opacity=".85" transform="rotate(-9 103 199)"/>`;
  s += ear(e.ear, sk) + `<g transform="translate(200 0) scale(-1 1)">${ear(e.ear, sk)}</g>`;
  s += `<ellipse cx="100" cy="230" rx="19.5" ry="21" fill="${sk[0]}" stroke="${INK}" stroke-width="1.5"/>`;
  s += `<path d="M96 210 q-4 -8 -11 -8 M101 209 q1 -9 7 -12 M105 211 q5 -5 11 -4" fill="none" stroke="${INK}" stroke-width="1.2" stroke-linecap="round"/>`;
  s += `<path d="M85 ${outer} L96 ${inner} M115 ${outer} L104 ${inner}" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
  s += eyes(e.eye, sk[0]);
  if (e.blush) s += `<ellipse cx="87" cy="237" rx="4" ry="2.2" fill="#d88a7a" opacity=".55"/><ellipse cx="113" cy="237" rx="4" ry="2.2" fill="#d88a7a" opacity=".55"/>`;
  if (e.mouth) s += `<path d="${e.mouth}" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;
  if (e.mouthFill) s += `<path d="${e.mouthFill}" fill="#3a1f1a" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`;
  for (const [x, y, w, h] of e.tooth ?? []) s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#efe6c4" stroke="${INK}" stroke-width=".6"/>`;
  // the nose, last: it hangs over the mouth
  s += `<path d="M99 225 C106 229 111 238 104 243 C101 245 97 242 99 239 C100 236 98 231 99 225 Z" fill="${sk[1]}" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>`;
  if (e.tear) s += `<path d="M88 231 q-2.4 4 0 5.6 q2.4 -1.6 0 -5.6 Z" fill="#8fc7e0" stroke="#4a7d95" stroke-width=".6"/>`;
  if (e.sigh) s += `<g fill="#cfcfc2" opacity=".75"><circle cx="116" cy="246" r="1.8"/><circle cx="121" cy="243" r="2.4"/><circle cx="127" cy="240" r="3"/></g>`;
  if (e.stars) s += `<g fill="#f0c35a"><path d="M60 200 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z"/><path d="M142 192 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6 Z"/><path d="M150 222 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2 Z"/></g>`;
  if (e.confetti) {
    const bits: Array<[number, number, string, number]> = [[40, 150, '#e0564a', 20], [160, 140, '#5aa0e0', -30], [30, 205, '#f0c35a', 45], [172, 196, '#7fc96a', 10], [52, 120, '#c77ae0', -15], [150, 238, '#e0564a', 60], [24, 250, '#5aa0e0', -40]];
    for (const [x, y, c, r] of bits) s += `<rect x="${x}" y="${y}" width="6" height="3" rx=".8" fill="${c}" transform="rotate(${r} ${x + 3} ${y + 1.5})"/>`;
  }
  return s;
}

/** A gold medal on its ribbon, on the basket's front. */
const MEDAL =
  '<path d="M95 262 L100 276 L105 262 Z" fill="#b8423a" stroke="#5a1d18" stroke-width=".8"/>' +
  '<circle cx="100" cy="281" r="7" fill="#f0c35a" stroke="#7a5a1a" stroke-width="1.2"/>' +
  '<path d="M100 276.6 l1.3 2.8 3 .3 -2.3 2 .7 3 -2.7 -1.6 -2.7 1.6 .7 -3 -2.3 -2 3 -.3 Z" fill="#fff3c4" opacity=".9"/>';

const BASKET =
  '<path d="M70 262 L130 262 L126 300 L74 300 Z" fill="#7a5230" stroke="#3a2412" stroke-width="1.5" stroke-linejoin="round"/>' +
  '<path d="M72 274 L128 274 M73 287 L127 287" stroke="#4e3218" stroke-width="1.2"/>' +
  '<path d="M80 262 L79 300 M90 262 L89.5 300 M100 262 L100 300 M110 262 L110.5 300 M120 262 L121 300" stroke="#5e3d20" stroke-width=".8" opacity=".8"/>' +
  '<rect x="65" y="256" width="70" height="8" rx="3" fill="#5e3d22" stroke="#2f1d0c" stroke-width="1.3"/>';

function hands(kind: 'rim' | 'up', skin = SKIN): string {
  const hand = (x: number, y: number): string =>
    `<circle cx="${x}" cy="${y}" r="4.6" fill="${skin}" stroke="${INK}" stroke-width="1.2"/><path d="M${x - 2} ${y + 1.6} l0 2.4 M${x + 1} ${y + 2} l0 2.4" stroke="${INK}" stroke-width=".9" stroke-linecap="round"/>`;
  if (kind === 'up') return `<path d="M86 258 L67 214 M114 258 L133 214" stroke="${skin}" stroke-width="5" stroke-linecap="round"/>` + hand(66, 211) + hand(134, 211);
  return hand(83, 257) + hand(117, 257);
}

const ENV = 'M100 6 C150 6 180 40 178 84 C176 122 140 150 116 176 L84 176 C60 150 24 122 22 84 C20 40 50 6 100 6 Z';

function envelope(clip: string): string {
  return (
    `<defs><clipPath id="${clip}"><path d="${ENV}"/></clipPath></defs>` +
    `<path d="${ENV}" fill="#8e3b2e"/>` +
    `<g clip-path="url(#${clip})"><ellipse cx="100" cy="90" rx="54" ry="96" fill="#c08a3e"/><ellipse cx="100" cy="90" rx="22" ry="96" fill="#8e3b2e"/>` +
    '<path d="M0 150 Q100 132 200 150 L200 200 L0 200 Z" fill="#000" opacity=".18"/><ellipse cx="66" cy="52" rx="14" ry="30" fill="#fff" opacity=".12"/></g>' +
    '<g transform="rotate(9 140 70)"><rect x="131" y="62" width="19" height="17" fill="#6d5a3c" stroke="#3a2c18" stroke-width="1"/>' +
    '<rect x="132.6" y="63.6" width="16" height="14.3" fill="none" stroke="#e6d6a8" stroke-width=".8" stroke-dasharray="2 2"/></g>' +
    `<path d="${ENV}" fill="none" stroke="#3b1a12" stroke-width="2"/>` +
    '<rect x="86" y="174" width="28" height="10" rx="2" fill="#3b2a1a" stroke="#1d130a" stroke-width="1"/>' +
    '<path d="M88 184 L72 258 M112 184 L128 258 M95 184 L88 258 M105 184 L112 258" stroke="#4a3a26" stroke-width="1.3"/>' +
    '<rect x="90" y="186" width="20" height="5" fill="#555" stroke="#222" stroke-width=".8"/>' +
    '<path class="wc-gob-flame" d="M100 205 C94 199 97 194 100 190 C103 194 106 199 100 205 Z" fill="#f2a13a"/>'
  );
}

/** The whole picture for a mood (exported for tests and a face sheet). */
export function goblinSvg(mood: Mood, clip: string): string {
  const e = EXPR[mood];
  return envelope(clip) + head(e) + BASKET + (e.medal ? MEDAL : '') + hands(e.hands, e.skin?.[0]);
}

/** The element's size at scale 1 (goblin.css: 180 px wide; the picture and a two- or three-line sign). */
export const GOBLIN_SIZE = { w: 180, h: 330 } as const;

const SVG_NS = 'http://www.w3.org/2000/svg';
let clips = 0;

export function goblinSkin(doc: Document): BalloonSkin {
  const clip = `wc-gob-clip-${++clips}`;
  const el = doc.createElement('div');
  el.className = 'wc-gob';
  const rig = doc.createElement('div');
  rig.className = 'wc-gob-rig';
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 200 310');
  svg.setAttribute('aria-hidden', 'true');
  const sign = makeSign(doc);
  rig.append(svg, sign.el);
  el.append(rig);
  let mood: Mood | null = null;
  let tilt = NaN;

  return {
    el,
    size: GOBLIN_SIZE,
    setMood(face) {
      if (face === mood) return;
      mood = face;
      svg.innerHTML = goblinSvg(face, clip);
    },
    setSign: (s, joined) => sign.set(s, joined),
    frame(p: SkinPose) {
      // Rounded to a tenth of a degree: no style write when nothing moved.
      const ti = Math.round(p.tilt * 10) / 10;
      if (ti !== tilt) rig.style.transform = `rotate(${(tilt = ti)}deg)`;
      sign.swing(p.swing);
    },
    destroy() {
      el.remove();
    },
  };
}
