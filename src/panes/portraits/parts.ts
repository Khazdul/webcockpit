// The portrait parts (stage 77's portrait pass, notes/research/portraits/
// style.md): what every race's drawing shares beyond the engraving kit
// (src/art/engrave.ts). The frame (where a head sits in the 200 square at
// each size), the defs every drawing needs (the pen filter, the two hatch
// directions, the eye clip, mail), the living eye, the brow, strand
// drawing for hair and beards, the line-weight pass (`thick`) and the
// standalone SVG wrapper. The dwarves (dwarves.ts) are the reference
// use. Pure strings, no DOM, no CSS, no animation.
//
// Units: every head is drawn in HEAD UNITS, the balloon dwarf's own: the eye
// line is y=0, the eyes sit at x=±21, the face is about ±47 wide, the brow
// line is y≈-11, the nose ends at y≈33, the mouth is at y≈40. `frame()`
// places that system in the 200 square. Light comes from the viewer's upper
// RIGHT: shade the viewer's left side (hatch `p`, the deeper `q` on the edge),
// put highlights on the right.

import { INK, filt, hatch, mix, n, n2 } from '../../art/engrave';
import type { DrawOpts } from './types';

export { INK, mix, n, n2 };

/** A drawing's context: its id prefix, its size and sex, and the helpers that depend on them. */
export interface Ctx {
  readonly o: DrawOpts;
  /** Medium (about 40 px): thicker lines, no fine strokes, hatch as flat tone. */
  readonly med: boolean;
  readonly fem: boolean;
  /** A unique id in this drawing's defs. */
  id(k: string): string;
  /** `url(#…)` of one. */
  url(k: string): string;
  /** `s` at Large only (fine strands, wrinkles, rivets): Medium drops it. */
  fine(s: string): string;
  /** The pen filter's attribute: `filter="url(#…f)"`. */
  readonly F: string;
  /** The soft pen's (`fs`): the same wobble, calmer ink and grain, for skin and light hair. */
  readonly FS: string;
}

export const ctx = (o: DrawOpts): Ctx => {
  const med = o.size === 'medium';
  const id = (k: string): string => `${o.uid}${k}`;
  return { o, med, fem: o.sex === 'female', id, url: (k) => `url(#${id(k)})`, fine: (s) => (med ? '' : s), F: `filter="url(#${id('f')})"`, FS: `filter="url(#${id('fs')})"` };
};

/**
 * Where the head-unit system sits in the 200 square: `translate(100,ey) scale(s)`.
 * Large: the eye line at y=94, scale .9 (helm top ≈25, mouth ≈130, above
 * the level ring's top at ≈136). Medium: the ring covers the lower half
 * of the centre and the rim vignette eats the edge, so the head is larger
 * and higher (eyes at y=74, scale .98): helm, brows, eyes, nose and
 * moustache above the ring, the rest is silhouette.
 */
export const FRAME = { large: { s: .9, ey: 94 }, medium: { s: .98, ey: 74 } } as const;

/** The line-weight factor applied to every stroke-width (the balloon dwarf's `thick`): Large 1.45, Medium 2.6. */
export const LINE = { large: 1.45, medium: 2.6 } as const;

/** Multiplies every `stroke-width="…"` in `s` by `f` (the balloon dwarf's pass). */
export const thick = (s: string, f: number): string => s.replace(/stroke-width="([\d.]+)"/g, (_, v: string) => `stroke-width="${n2(Number(v) * f)}"`);

/** The pen wobble at each size (shared by both filters, so their outlines line up). */
const WOBBLE = { large: { freq: .03, scale: 2.6, grain: .5 }, medium: { freq: .03, scale: 1.6, grain: .5 } } as const;
/**
 * The ink and grain knobs. `ink` is the balloon dwarf's engraving (blotchy
 * ink, full grain) for metal, cloth, dark hair, hatching. `soft` is for skin
 * and light masses (white or fair hair, pale cloth): the same wobble, the
 * blots and the grain much fainter, so faces do not read as freckled.
 */
export const INKS = {
  large: { ink: { blot: 1.5, bias: -.7, ga: 1.05, gb: -.55 }, soft: { blot: .55, bias: -.42, ga: .5, gb: -.4 } },
  medium: { ink: { blot: 1.5, bias: -.7, ga: .7, gb: -.45 }, soft: { blot: .5, bias: -.4, ga: .4, gb: -.36 } },
} as const;
/** Both filters: `f` (the ink pen) and `fs` (the soft pen). */
export const penFilter = (c: Ctx): string => {
  const w = WOBBLE[c.o.size], k = INKS[c.o.size];
  return filt(c.id('f'), { ...w, ...k.ink }) + filt(c.id('fs'), { ...w, ...k.soft });
};

/** A hatch pattern; at Medium a flat tone of the same weight (lines at 40 px only shimmer). */
export const shade = (c: Ctx, k: string, rot: number, gap: number, op: number): string =>
  c.med
    ? `<pattern id="${c.id(k)}" patternUnits="userSpaceOnUse" width="4" height="4"><rect width="4" height="4" fill="${INK}" opacity="${n2(op * .42)}"/></pattern>`
    : hatch(c.id(k), rot, gap * 1.6, op, .95);

/** A left-to-right gradient (shadow on the left, light on the right). */
export const lg = (c: Ctx, k: string, stops: readonly string[], y2 = 0): string =>
  `<linearGradient id="${c.id(k)}" x1="0" x2="1" y1="0" y2="${y2}">${stops.map((s, i) => `<stop offset="${n2(i / (stops.length - 1))}" stop-color="${s}"/>`).join('')}</linearGradient>`;

/** The eye's almond. */
export const ALM = 'M-8.5,0Q0,-8 8.5,0Q0,6 -8.5,0Z';

/**
 * The defs every head needs: the filter `f`, hatch `p` (38°, the shadow) and
 * `q` (-52°, the deeper edge), the eye clip `c`, mail rings `m`, iron `i`
 * and bronze `b` gradients. A drawing adds its own (skin, hair) beside them.
 */
export const baseDefs = (c: Ctx): string =>
  penFilter(c) + shade(c, 'p', 38, 3, .6) + shade(c, 'q', -52, 3.4, .5) +
  `<clipPath id="${c.id('c')}"><path d="${ALM}"/></clipPath>` +
  `<radialGradient id="${c.id('eg')}" cx=".5" cy=".42" r=".5"><stop offset=".45" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient><mask id="${c.id('e')}" maskContentUnits="objectBoundingBox"><rect width="1" height="1" fill="url(#${c.id('eg')})"/></mask>` +
  (c.med
    ? `<pattern id="${c.id('m')}" patternUnits="userSpaceOnUse" width="4" height="4"><rect width="4" height="4" fill="${INK}" opacity=".16"/></pattern>`
    : `<pattern id="${c.id('m')}" patternUnits="userSpaceOnUse" width="8" height="6"><path d="M0,3Q2,6.5 4,3Q6,-.5 8,3" fill="none" stroke="${INK}" stroke-width="1" opacity=".6"/></pattern>`) +
  lg(c, 'i', ['#30353a', '#596067', '#8c949a'], .25) +
  lg(c, 'b', ['#5c4724', '#94793f', '#c4a868']);

/** How an eye is held and coloured. */
export interface EyeO {
  /** The iris. */
  iris?: string;
  /** The upper lid's drop (head units): 1.2 open and alert (the balloon's rest), 3 calm, 4.5 heavy. */
  lid?: number;
  /** The lower lid's rise: 0 relaxed, 2 a squint (anger, a grin). */
  low?: number;
  /** The lids' tints (a little darker than the face). */
  lidFill?: string;
  lowFill?: string;
  /** The socket's shadow tint. */
  socket?: string;
  /** Lashes: a heavier upper lash line and three flicks at the outer corner (the women). */
  lash?: boolean;
  /** Where the pupil looks (head units, ±2). */
  look?: readonly [number, number];
  /** The eye's scale (the women's are a little larger). */
  size?: number;
  /** Crow's feet and bags under the eye (age). */
  age?: number;
}

/**
 * One living eye, the balloon dwarf's: a hatched socket, the almond white,
 * iris, pupil and catch light, the upper and lower lids clipped to the
 * almond, the lash line, the lines under it. `s` is -1 (viewer's left) or
 * 1; the eye is centred at x=21·s, y=0 (translate it for other faces).
 */
export const eye = (c: Ctx, s: number, o: EyeO = {}): string => {
  const lid = o.lid ?? 1.2, low = o.low ?? 0, [px, py] = o.look ?? [0, 0];
  const lash = o.lash ? `<path d="M${7 * s},-2.5l${3.2 * s},-3.2M${8.6 * s},-.8l${3.8 * s},-1.6M${4.5 * s},-4l${2 * s},-3.6" fill="none" stroke="${INK}" stroke-width="1" stroke-linecap="round"/>` : '';
  const age = o.age ? `<path d="M${-7 * s},${8 + low}q${7 * s},4 ${15 * s},-1M${11 * s},-5l${6 * s},-3M${11.5 * s},-1l${7 * s},0M${11 * s},3l${6 * s},3.5" fill="none" stroke="${INK}" stroke-width=".6" stroke-linecap="round" opacity="${n2(.5 + .3 * o.age)}"/>` : '';
  return `<g transform="translate(${21 * s},0)${o.size ? ` scale(${o.size})` : ''}"><ellipse cy="-1" rx="14.5" ry="10.5" fill="${o.socket ?? '#4e2f20'}" opacity=".5" mask="url(#${c.id('e')})"/><path d="M-13.5,-2C-12,-10 -4,-12.5 2,-12.5C9,-12.5 13.5,-8.5 14,-2C8,-7.5 -6,-8.5 -13.5,-2Z" fill="${c.url('p')}"/>
<g clip-path="${c.url('c')}"><path d="${ALM}" fill="#d9cdb3"/><path d="M-10,-6H10V-.8H-10Z" fill="#3d281b" opacity=".36"/>
<g transform="translate(${px},${py})"><circle r="3.6" fill="${o.iris ?? '#3a2414'}"/><circle r="1.7" fill="#0c0705"/><circle cx="-1.2" cy="-1.3" r=".9" fill="#fff8e6"/></g>
<path d="M-12,${-22 + lid}H12V${-5.5 + lid}Q0,${-3.5 + lid} -12,${-5.5 + lid}Z" fill="${o.lidFill ?? '#a88368'}" stroke="${INK}" stroke-width=".7"/><path d="M-12,${18 - low}H12V${5 - low}Q0,${4 - low} -12,${5 - low}Z" fill="${o.lowFill ?? '#b08b6f'}" stroke="${INK}" stroke-width=".6"/></g>
<path d="${ALM}" fill="none" stroke="${INK}" stroke-width=".8"/><path d="M-9.5,${n(.6 + lid * .5)}Q0,${n(-8.8 + lid)} 9.5,${n(.6 + lid * .5)}" fill="none" stroke="${INK}" stroke-width="${o.lash ? 2 : 1.5}" stroke-linecap="round"/>${lash}
${c.fine(o.lash ? `<path d="M${-7 * s},6.5q${7.5 * s},4 ${15 * s},-.5" fill="none" stroke="${INK}" stroke-width=".5" stroke-linecap="round" opacity=".35"/>` : `<path d="M${-8 * s},6.5q${8 * s},5 ${17 * s},-1M${-6 * s},9.5q${7 * s},4 ${14 * s},-.5M${10 * s},-3l${5.5 * s},-2.5" fill="none" stroke="${INK}" stroke-width=".6" stroke-linecap="round" opacity=".8"/>${age}`)}</g>`;
};

/** A brow's look. */
export interface BrowO {
  fill?: string;
  /** The light hairs' colour. */
  hi?: string;
  /** Anger: the inner ends drop (degrees; 14 is a scowl, -8 surprise). */
  rot?: number;
  /** Raise (negative) or lower the brow. */
  dy?: number;
  /** Size (the balloon's 1.16). */
  sc?: number;
  /** The women's: a slender arched brow instead of the bushy one. */
  thin?: boolean;
}

/** The bushy brow (the balloon dwarf's BROW) for the eye on side `s`, above it at y≈-10.5. */
export const brow = (c: Ctx, s: number, o: BrowO = {}): string => {
  const fill = o.fill ?? '#7b6c5e', hi = o.hi ?? '#e0d7c6', sc = o.sc ?? 1.16;
  const body = o.thin
    ? `<path d="M-13,4C-9,-3 4,-6 16,-1.5C17,0 16,1.5 14,1C5,-1.5 -4,0 -11,6C-13,7 -14,6 -13,4Z" fill="${fill}" stroke="${INK}" stroke-width=".8"/>${c.fine(`<path d="M-8,2l2,-4M-3,0l2,-4M2,-1l2,-3.5M7,-1l2,-3M11.5,-.5l2.5,-2" fill="none" stroke="${hi}" stroke-width=".6" stroke-linecap="round"/>`)}`
    : `<path d="M-14,4C-13,-5 2,-9 15,-4C19,-2 18,3 13,2C6,0 -3,1 -9,6C-12,8 -14,7 -14,4Z" fill="${c.med ? mix(fill, hi, .3) : fill}" stroke="${INK}" stroke-width=".9"/>${c.fine(`<path d="M-10,3l2.5,-6M-6,1l2.5,-6.5M-1.5,0l2.5,-6M3,-.5l2.5,-5.5M7.5,-.5l2.5,-4.5M11.5,0l3,-3M14,1l4,-1.5" fill="none" stroke="${hi}" stroke-width=".8" stroke-linecap="round"/>`)}${c.fine(`<path d="M-12,5l2,-5M-8,2.5l2,-5.5M-4,1.5l2,-5M1,0l2,-5M5.5,-.5l2,-4M9.5,0l2,-3.5M-13,6l-2.5,1.5M-10,7l-1.5,2.5" fill="none" stroke="${INK}" stroke-width=".5" opacity=".8"/>`)}`;
  const r = (o.rot ?? 0) * -s;
  return `<g transform="translate(${22 * s},${-10.5 + (o.dy ?? 0)}) rotate(${r})"><g transform="scale(${s * sc},${sc})">${body}</g></g>`;
};

/** Both eyes and both brows. */
export const eyes = (c: Ctx, e: EyeO = {}, b: BrowO = {}): string => eye(c, -1, e) + eye(c, 1, e) + brow(c, -1, b) + brow(c, 1, b);

/**
 * Strands on a mass of hair or beard: ink lines (`d` dark) and light lines
 * (`l`, the sheen, in `hi`). Medium keeps a few light strands, thicker,
 * and drops the ink ones.
 */
export const strands = (c: Ctx, d: string, l: string, hi: string, op = .9): string =>
  c.med
    ? `<path d="${l}" fill="none" stroke="${hi}" stroke-width="1.4" stroke-linecap="round" opacity="${n2(op * .55)}"/>`
    : `<path d="${d}" fill="none" stroke="${INK}" stroke-width=".55" opacity=".72"/><path d="${l}" fill="none" stroke="${hi}" stroke-width="1.1" stroke-linecap="round" opacity="${op}"/>`;

/** A shape filled, then shaded: its base fill, and the hatch over a shadow part (`sh`, a path in the same units). */
export const mass = (d: string, fill: string, sw = 1.1, sh = '', c?: Ctx, deep = ''): string =>
  `<path d="${d}" fill="${fill}" stroke-width="${sw}"/>${sh && c ? `<path d="${sh}" fill="${c.url('p')}" stroke="none"/>` : ''}${deep && c ? `<path d="${deep}" fill="${c.url('q')}" stroke="none"/>` : ''}`;

/**
 * A pen group: the filter, the ink stroke and round joins. Everything a head
 * draws goes in one or more. `soft`: the soft pen (`fs`): use it for the
 * face, nose, mouth, eyes, and for white, grey or fair hair and beards.
 */
export const pen = (c: Ctx, body: string, soft = false): string => `<g ${soft ? c.FS : c.F} stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">${body}</g>`;

/** Hair colours: shadow, light, the sheen of the light strands. */
export type HairCols = readonly [string, string, string];

/** A braid of `links` links hanging from (x,y) at scale `sc`: alternating links, a sheen tick each (Large), a metal `ring` and a tuft. */
export const braid = (c: Ctx, x: number, y: number, links: number, sc: number, hair: HairCols, ring: string): string => {
  const [h0, h1, hi] = hair;
  let out = '';
  for (let j = 0; j < links; j++) {
    const yy = 3 + j * 5.5, m = j % 2 ? -1 : 1;
    out += `<path d="M${-6.5 * m},${yy}C${-7.5 * m},${yy + 5} 0,${yy + 8.5} ${6.5 * m},${yy + 7}C${7.5 * m},${yy + 2} 0,${yy - 1.5} ${-6.5 * m},${yy}Z" fill="${j % 2 ? mix(h1, '#1a110b', .1) : h1}" stroke-width=".9"/>${c.fine(`<path d="M${-3 * m},${yy + 2}Q0,${yy + 3.5} ${3.5 * m},${yy + 5}" fill="none" stroke="${hi}" stroke-width=".8"/>`)}`;
  }
  const ry = 3 + links * 5.5;
  return `<g transform="translate(${x},${y}) scale(${sc})"><path d="M-6,0L6,0L6,${ry}L-6,${ry}Z" fill="${h0}" stroke="none"/>${out}<rect x="-5.5" y="${n(ry - 1.5)}" width="11" height="5" rx="1" fill="${ring}" stroke-width=".8"/><path d="M-4.5,${n(ry + 3.5)}C-6,${n(ry + 8)} -2,${n(ry + 10)} 0,${n(ry + 10)}C2,${n(ry + 10)} 6,${n(ry + 8)} 4.5,${n(ry + 3.5)}Z" fill="${h1}" stroke-width=".8"/></g>`;
};

/** Long hair (the women's, or any long-haired figure). */
export interface HairO {
  /** The fill of the shadowed (viewer's left) side, usually the `h` gradient's url. */
  near: string;
  /** Shadow, light and sheen colours (the far side is the light, slightly darkened). */
  cols: HairCols;
  /** Where the hair ends (head units; 112 falls past the frame). */
  len?: number;
  /** The face width factor (the jaw). */
  jaw?: number;
  /** 0 smooth; 1 a flaring mane of rounded tongues (the Firebeard woman). */
  wild?: number;
  /** Two braids in front of the shoulders: their links, scale, x, top and ring. Omit for loose hair. */
  braids?: { links: number; sc?: number; x?: number; top?: number; ring: string };
}

/** The back of long hair: parted under the headgear, behind the face, down behind the shoulders. Draw it under the face. */
export const longHair = (c: Ctx, o: HairO): string => {
  const j = o.jaw ?? 1, L = o.len ?? 112, [, h1, hi] = o.cols;
  const F = wx(o.wild
    ? `M-44,-30C-60,-34 -70,-26 -80,-30C-80,-18 -72,-10 -80,-4C-90,-2 -86,10 -82,16C-90,22 -86,34 -78,38C-86,46 -82,58 -76,62C-82,72 -78,84 -72,88C-74,98 -70,${L - 8} -68,${L}L-44,${L}C-48,80 -44,40 -44,10Z`
    : `M-44,-30C-62,-26 -72,-6 -72,20C-74,50 -78,80 -76,${L}L-44,${L}C-48,80 -44,40 -44,10Z`, j);
  return `<path d="${F}" fill="${o.near}" stroke-width="1.1"/><path d="${F}" fill="${c.url('p')}" stroke="none"/><path d="${mir(F)}" fill="${mix(h1, '#1a110b', .08)}" stroke-width="1.1"/>` +
    strands(c, wx(`M-58,-14C-62,10 -62,50 -64,${L - 12}M-50,0C-54,30 -54,70 -56,${L - 4}M58,-14C62,10 62,50 64,${L - 12}M50,0C54,30 54,70 56,${L - 4}`, j), wx(`M-66,0C-68,30 -68,70 -70,${L - 8}M64,-6C68,20 68,60 68,${L - 12}`, j), hi);
};

/** The hair over the temples, from a centre parting under the headgear down beside the cheeks. Draw it over the face. */
export const temples = (c: Ctx, o: HairO): string => {
  const j = o.jaw ?? 1, [, h1, hi] = o.cols;
  const T = wx('M-2,-23C-16,-20 -34,-15 -41,-5C-45,8 -45,22 -42,34L-52,34C-55,10 -53,-14 -45,-25Z', j);
  return `<path d="${T}" fill="${o.near}" stroke-width="1"/><path d="${T}" fill="${c.url('p')}" stroke="none"/><path d="${mir(T)}" fill="${h1}" stroke-width="1"/>` +
    strands(c, wx('M-10,-21C-24,-17 -36,-10 -42,2M-44,8C-46,18 -46,26 -45,32M10,-21C24,-17 36,-10 42,2', j), wx('M-14,-20C-28,-16 -38,-8 -43,4M14,-20C28,-16 38,-8 43,4M46,8C48,18 48,26 47,32', j), hi, .8);
};

/** The two front braids of `o.braids` (nothing for loose hair). Draw them last, over the shoulders and the headgear's rim. */
export const frontBraids = (c: Ctx, o: HairO): string => {
  const b = o.braids;
  if (!b) return '';
  const x = b.x ?? 54, top = b.top ?? -16, sc = b.sc ?? 1.35;
  return braid(c, -x, top, b.links, sc, o.cols, b.ring) + braid(c, x, top, b.links, sc, o.cols, b.ring);
};

/**
 * The standalone SVG: the defs, then the body placed by `FRAME` (head units)
 * and thickened by `LINE`. `back` (in the 200 square, unthickened) goes under
 * the figure: none for the dwarves (the disc's own gradient shows through).
 */
export const svg = (c: Ctx, defs: string, body: string, back = ''): string => {
  const f = FRAME[c.o.size];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200"><defs>${defs}</defs>${back}<g transform="translate(100,${f.ey}) scale(${f.s})">${thick(body, LINE[c.o.size])}</g></svg>`;
};

/** Maps every x of an absolute path (M L C Q S T Z only: pairs, no H/V/A) through `f`. */
export const px = (d: string, f: (x: number) => number): string => {
  let i = 0;
  return d.replace(/-?\d*\.?\d+/g, (v) => (i++ % 2 ? v : String(n(f(Number(v))))));
};
/** The path mirrored left to right (about x=0). */
export const mir = (d: string): string => px(d, (x) => -x);
/** The path widened about x=0 by `k`. */
export const wx = (d: string, k: number): string => (k === 1 ? d : px(d, (x) => x * k));
