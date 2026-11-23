// The hobbits' portraits (stage 77's portrait pass, notes/research/portraits/
// style.md, built on the dwarves' parts). The base hobbit is the balloon
// hobbit's head (src/weather/balloons/passengers/hobbit.ts: the curly mop
// and its fringe, the leaf ears (smaller, a soft tip), the round face, the button nose, the
// cream shirt, the mustard waistcoat with brass buttons and the green
// neckcloth) re-drawn in the portrait head units. The three breeds are that
// same figure with one mark pushed hard, and their size told by proportion
// (the head's scale against the shoulders' width), never by empty space:
//   fallohide  pale skin, golden curls, a smaller head on a longer neck and
//              broad-set shoulders (the tallest, slimmest), a narrow face,
//              grey-blue eyes, a green coat with a standing collar
//   harfoot    brown skin, near-black curls, a bigger head on narrow
//              shoulders (the smallest), no beard, a russet hooded cloak
//              with the hood down round the neck
//   stoor      the heftiest: the widest round face and shoulders, a thick
//              neck, auburn curls, great curly mutton-chops joined by a chin
//              beard (the only hobbits with facial hair), a river-blue
//              knitted gansey with a roll neck
// The women: the same breed, palette, eyes and light; no facial hair; long
// curls to the shoulders, lips, slender brows, lashes; the base wears a
// green ribbon, the Fallohide a daisy wreath, the Harfoot her russet hood,
// the Stoor a red river-wife's kerchief knotted at the side and a blue
// knitted shawl over her shoulders (her heft and round face kept).

import type { Draw, PortraitSet } from './types';
import { dark, light } from '../../art/engrave';
import { type BrowO, type Ctx, type EyeO, baseDefs, ctx, eyes, lg, mass, mir, mix, n, pen, strands, svg, wx } from './parts';

type Pt = readonly [number, number];
type Bust = 'waistcoat' | 'coat' | 'cloak' | 'gansey';
type Deco = 'ribbon' | 'wreath' | 'band' | 'kerchief';

/** One hobbit: everything a breed or a sex changes. */
interface Spec {
  /** The skin: shadow, mid, light. */
  skin: readonly [string, string, string];
  /** The curls: shadow, light, sheen. */
  hair: readonly [string, string, string];
  /** Fair hair takes the soft pen. */
  fair: boolean;
  brow: BrowO;
  eye: EyeO;
  bust: Bust;
  /** The main cloth: shadow, mid, light. */
  cloth: readonly [string, string, string];
  /** The face's width factor. */
  jaw: number;
  /** The shoulders' width factor. */
  wide: number;
  /** The head's scale about (0,-30): the breed's size told by proportion. */
  head: number;
  /** The shoulders lowered (a longer neck) or raised. */
  drop: number;
  /** The neck's half width. */
  neck: number;
  /** Mutton-chops and a chin beard (the Stoor men). */
  chops: boolean;
  /** The women's mark in the hair. */
  deco: Deco;
}

// ---- path helpers (absolute M L C Q Z only, as parts.ts' px) ----
/** Maps every pair of an absolute path through x·sx+tx, y·sy+ty. */
const aff = (d: string, sx: number, sy: number, tx = 0, ty = 0): string => {
  let i = 0;
  return d.replace(/-?\d*\.?\d+/g, (v) => String(n(i++ % 2 ? Number(v) * sy + ty : Number(v) * sx + tx)));
};
/** The balloon hobbit's head units to the portrait's (its eyes at ±15,-5; ours at ±21,0). */
const B = (d: string): string => aff(d, 1.4, 1.4, 0, 7);
/** The balloon's face, shortened so the chin lands at y=47. */
const FA = (d: string, j: number): string => aff(d, 1.3 * j, 1.093, 0, 5.47);
/** Rounded bumps between the points (a curly outline); the points go clockwise, the bumps bulge outward by `k` of each step. */
const bumpy = (pts: readonly Pt[], k = .55, start = true): string => {
  let d = start ? `M${n(pts[0]![0])},${n(pts[0]![1])}` : '';
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]!, [x1, y1] = pts[i + 1]!, dx = x1 - x0, dy = y1 - y0, ox = dy * k, oy = -dx * k;
    d += `C${n(x0 + ox + dx * .05)},${n(y0 + oy + dy * .05)} ${n(x1 + ox - dx * .05)},${n(y1 + oy - dy * .05)} ${n(x1)},${n(y1)}`;
  }
  return d;
};
/** The left half's points, then its mirror (right half), into one closed curly outline. */
const curlyMass = (left: readonly Pt[], j: number, close: string, k = .55): string => {
  const L = left.map(([x, y]) => [x * j, y] as const), R = [...L].reverse().map(([x, y]) => [-x, y] as const);
  return `${bumpy(L, k)}L${n(R[0]![0])},${n(R[0]![1])}${bumpy(R, k, false)}${close}`;
};
/**
 * Curl clumps: rounded locks, each a gradient mass (dark left, lit right)
 * with its shadow side hatched and strands curving inside it, as the
 * dwarves' beards are made. No outline: the ink is on the outer silhouette
 * only. Drawn top to bottom, so the lower locks overlap the upper.
 */
const curls = (c: Ctx, at: readonly (readonly [number, number, number])[], hi: string, op = .9): string => {
  const sorted = [...at].sort((a, b) => a[1] - b[1]);
  let out = '', ink = '', lit = '';
  for (const [x, y, r] of sorted) {
    const P = (a: number, b: number): string => `${n(x + a * r)},${n(y + b * r)}`;
    out += `<path d="M${P(1, 0)}C${P(1, -1.1)} ${P(-.9, -1.2)} ${P(-1, 0)}C${P(-1.05, .55)} ${P(-.6, .95)} ${P(-.1, 1)}C${P(.5, 1)} ${P(1, .6)} ${P(1, 0)}Z" fill="${c.url('h')}" stroke="none"/>` +
      `<path d="M${P(-1, 0)}C${P(-1.05, .55)} ${P(-.6, .95)} ${P(-.1, 1)}C${P(-.6, .6)} ${P(-.72, .1)} ${P(-.45, -.85)}C${P(-.8, -.62)} ${P(-1, -.3)} ${P(-1, 0)}Z" fill="${c.url('p')}" stroke="none"/>`;
    ink += `M${P(-.7, .6)}C${P(-.9, -.4)} ${P(.2, -.95)} ${P(.75, -.3)}M${P(-.3, .85)}C${P(-.42, .1)} ${P(.2, -.32)} ${P(.62, .25)}`;
    lit += `M${P(-.35, .35)}C${P(-.38, -.42)} ${P(.32, -.72)} ${P(.78, -.12)}`;
  }
  return out + strands(c, ink, lit, hi, op);
};

// ---- the palette ----
const BRASS = '#d9b24c', CREAM = '#e6dcc4', NECKCLOTH = '#4f7a3c';
const MUSTARD = ['#6e4f18', '#a8802a', '#d4aa50'] as const;
const GREEN = ['#1e3622', '#34573a', '#5c8458'] as const;
const RUSSET = ['#45231a', '#74382a', '#a25a3e'] as const;
const RIVER = ['#1f2c44', '#36506e', '#5f7c9c'] as const;
const MADDER = ['#5a1c16', '#9a3428', '#c45a44'] as const;

const defs = (c: Ctx, s: Spec): string =>
  baseDefs(c) + lg(c, 's', s.skin) + lg(c, 'h', [s.hair[0], s.hair[1]]) + lg(c, 'w', s.cloth, .2) + lg(c, 'r', MADDER, .2) +
  lg(c, 'cr', [dark(CREAM, .12), CREAM]) +
  (c.med ? '' : `<pattern id="${c.id('dot')}" patternUnits="userSpaceOnUse" width="9" height="8"><circle cx="2" cy="2" r="1.2" fill="#f3ead0" opacity=".75"/><circle cx="6.5" cy="6" r="1.2" fill="#f3ead0" opacity=".75"/></pattern>`);

// ---- the bust ----
const bodyPath = (w: number): string => wx('M-100,150L-98,106C-94,84 -78,70 -54,64L-20,56L20,56L54,64C78,70 94,84 98,106L100,150Z', w);
const bodyShadow = (w: number): string => wx('M-100,150L-98,106C-94,84 -78,70 -54,64L-20,56L-6,56C-44,66 -62,98 -60,150Z', w);
const buttons = (c: Ctx, pts: readonly Pt[], r = 3.2): string =>
  pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${BRASS}" stroke-width="1"/>${c.fine(`<circle cx="${n(x + .9)}" cy="${n(y - .9)}" r=".9" fill="#fffbe6" stroke="none"/>`)}`).join('');

/** The hood lying down round the neck (the Harfoots'): a thick roll of cloth rising behind the neck. */
const hoodRoll = (c: Ctx, w: number): string => {
  const H = wx('M-82,92C-80,66 -50,40 0,40C50,40 80,66 82,92C66,74 40,64 0,64C-40,64 -66,74 -82,92Z', w);
  return mass(H, dark(RUSSET[1], .12), 1.2, wx('M-82,92C-80,66 -50,40 0,40C-36,46 -58,62 -62,80C-70,82 -76,86 -82,92Z', w), c) +
    c.fine(`<path d="${wx('M-60,58C-50,62 -44,66 -40,72M-30,46C-26,52 -24,58 -24,64M60,58C50,62 44,66 40,72M30,46C26,52 24,58 24,64', w)}" fill="none" stroke-width=".6" opacity=".7"/>`) +
    `<path d="${wx('M30,44C54,50 72,62 78,80', w)}" fill="none" stroke="${light(RUSSET[2], .3)}" stroke-width="1.3" opacity=".55"/>`;
};

const bust = (c: Ctx, s: Spec): string => {
  const w = s.wide, body = bodyPath(w), shadow = bodyShadow(w), fem = c.fem;
  const base = (fill: string): string => `<path d="${body}" fill="${fill}" stroke-width="1.2"/><path d="${shadow}" fill="${c.url('p')}" stroke="none"/>`;
  if (s.bust === 'waistcoat') {
    if (fem) {
      // a cream blouse with full sleeves and a scooped frill, a mustard laced bodice
      const bod = wx('M-72,150L-74,98C-70,84 -54,76 -32,72L32,72C54,76 70,84 74,98L72,150Z', w);
      return base(c.url('cr')) +
        c.fine(`<path d="${wx('M-92,96C-86,88 -82,84 -76,82M-88,112C-84,104 -80,100 -76,98M92,96C86,88 82,84 76,82M88,112C84,104 80,100 76,98', w)}" fill="none" stroke-width=".6" opacity=".7"/>`) +
        mass(bod, c.url('w'), 1.2, wx('M-72,150L-74,98C-70,84 -54,76 -32,72L-20,72C-46,82 -54,110 -52,150Z', w), c) +
        `<path d="M-32,64Q0,84 32,64" fill="none" stroke-width="1.6"/><path d="M-30,66Q0,86 30,66" fill="none" stroke="#f6f0df" stroke-width="2.6" stroke-dasharray="3 1.6"/>` +
        `<path d="M-6,80L6,92M6,80L-6,92M-6,96L6,108M6,96L-6,108" fill="none" stroke="${NECKCLOTH}" stroke-width="1.4"/>` +
        `<path d="${wx('M40,76C56,80 68,88 72,100', w)}" fill="none" stroke="${light(MUSTARD[2], .4)}" stroke-width="1.3" opacity=".6"/>`;
    }
    // the balloon's: shirt sleeves, a mustard waistcoat in two panels, brass buttons, a green neckcloth
    const P = wx('M-80,150L-82,100C-78,84 -64,72 -42,64L-18,56L-5,98L-3,150Z', w);
    return base(c.url('cr')) +
      c.fine(`<path d="${wx('M-94,100C-90,92 -88,88 -84,86M-96,120C-92,114 -88,110 -84,108M94,100C90,92 88,88 84,86', w)}" fill="none" stroke-width=".6" opacity=".7"/>`) +
      mass(P, c.url('w'), 1.2, wx('M-80,150L-82,100C-78,84 -64,72 -42,64L-30,60C-56,74 -62,110 -60,150Z', w), c, wx('M-80,150L-82,100C-78,84 -70,76 -60,70C-70,84 -72,110 -72,150Z', w)) +
      `<path d="${mir(P)}" fill="${c.url('w')}" stroke-width="1.2"/>` +
      `<path d="${wx('M44,66C60,72 74,84 78,100', w)}" fill="none" stroke="${light(MUSTARD[2], .4)}" stroke-width="1.3" opacity=".6"/>` +
      `<path d="M-18,50L-32,58L-14,70L-3,60ZM18,50L32,58L14,70L3,60Z" fill="#f6f0df" stroke-width="1.1"/>` +
      `<path d="M-7,58Q0,55 7,58L5,70Q0,73 -5,70Z" fill="${NECKCLOTH}" stroke-width="1.1"/>` +
      buttons(c, [[7, 106], [7, 120], [7, 134]]) + c.fine(`<path d="M8,120Q20,130 32,122" fill="none" stroke="${BRASS}" stroke-width="1.2" stroke-dasharray="2 1.2"/>`);
  }
  if (s.bust === 'coat') {
    // the Fallohide's green coat: a standing collar behind the neck, lapels, a cream waistcoat and a white stock; the women a lace collar and a brooch
    const collar = wx('M-34,68C-38,52 -34,40 -26,34L26,34C34,40 38,52 34,68Z', s.jaw);
    const lap = wx('M-20,56L-46,66L-32,82L-5,104Z', w);
    return base(c.url('w')) +
      (fem ? '' : mass(collar, dark(GREEN[1], .2), 1.2, wx('M-34,68C-38,52 -34,40 -26,34L-14,34C-24,44 -26,56 -24,68Z', s.jaw), c)) +
      `<path d="M-18,56L0,102L18,56Z" fill="#e2cf98" stroke-width="1.1"/>` +
      mass(lap, light(GREEN[1], .12), 1.2, lap, c) + `<path d="${mir(lap)}" fill="${light(GREEN[2], .18)}" stroke-width="1.2"/>` +
      (fem
        ? `<path d="M-30,56Q-22,70 -10,66Q0,74 10,66Q22,70 30,56" fill="#f6f0df" stroke-width="1"/><path d="M-26,58Q-20,66 -11,63M26,58Q20,66 11,63" fill="none" stroke-width=".6" opacity=".6"/><ellipse cx="0" cy="66" rx="4.2" ry="5" fill="${BRASS}" stroke-width=".9"/><ellipse cx="0" cy="66" rx="2.4" ry="3" fill="#6a8a5c" stroke-width=".6"/>`
        : `<path d="M-9,54Q0,50 9,54L6,72Q0,76 -6,72Z" fill="#f3ecd9" stroke-width="1"/>`) +
      buttons(c, [[38 * w, 100], [36 * w, 116], [34 * w, 132]], 2.8) +
      `<path d="${wx('M46,66C64,72 82,86 88,104', w)}" fill="none" stroke="${light(GREEN[2], .4)}" stroke-width="1.3" opacity=".55"/>` +
      c.fine(`<path d="${wx('M-88,110C-84,120 -82,134 -82,150M88,110C84,120 82,134 82,150', w)}" fill="none" stroke-width=".6" opacity=".6"/>`);
  }
  if (s.bust === 'cloak') {
    // the Harfoot's russet cloak, a dun homespun shirt, the hood down round the neck, a wooden toggle
    return base(c.url('w')) +
      `<path d="${fem ? 'M-22,58Q0,86 22,58Z' : 'M-16,56L0,86L16,56Z'}" fill="#b8a684" stroke-width="1.1"/>` +
      hoodRoll(c, w) +
      `<path d="M-4,84L4,84L4,98L-4,98Z" fill="#8a6a44" stroke-width="1"/><path d="M-18,80Q-10,84 -4,88M18,80Q10,84 4,88" fill="none" stroke="#5a3e24" stroke-width="1.4"/>` +
      c.fine(`<path d="${wx('M-86,110C-82,124 -80,136 -80,150M-60,100C-58,120 -58,136 -60,150M86,110C82,124 80,136 80,150M60,100C58,120 58,136 60,150', w)}" fill="none" stroke-width=".6" opacity=".6"/>`);
  }
  // the Stoor's gansey: river blue, knitted ribs, a roll neck, brass shoulder buttons; the women a blue knitted shawl over a cream blouse
  const ribs = c.fine(`<path d="${wx('M-88,100C-86,116 -86,134 -86,150M-74,88C-72,110 -72,130 -72,150M-60,80C-58,104 -58,128 -58,150M88,100C86,116 86,134 86,150M74,88C72,110 72,130 72,150M60,80C58,104 58,128 58,150', w)}" fill="none" stroke-width=".55" opacity=".6" stroke-dasharray="2.5 1.5"/>`);
  if (fem) {
    const sh = wx('M-102,150L-100,104C-94,82 -70,66 -36,60L-12,60C-30,82 -40,112 -40,150Z', w);
    return base('#c4b08c') +
      mass(sh, c.url('w'), 1.2, wx('M-102,150L-100,104C-94,82 -70,66 -36,60L-26,60C-54,74 -66,110 -66,150Z', w), c) +
      `<path d="${mir(sh)}" fill="${c.url('w')}" stroke-width="1.2"/>` + ribs +
      c.fine(`<path d="${wx('M-38,66l-3,5M-32,78l-4,4M-30,92l-4,3M-30,106l-4,3M-31,120l-4,3M38,66l3,5M32,78l4,4M30,92l4,3M30,106l4,3M31,120l4,3', w)}" fill="none" stroke-width=".8" opacity=".8"/>`) +
      `<path d="M-24,58Q0,78 24,58" fill="none" stroke-width="1.4"/>` +
      `<path d="${wx('M40,66C64,72 84,86 90,104', w)}" fill="none" stroke="${light(RIVER[2], .4)}" stroke-width="1.3" opacity=".55"/>`;
  }
  const roll = 'M-28,46C-34,54 -32,66 -22,72C-10,76 10,76 22,72C32,66 34,54 28,46C16,52 -16,52 -28,46Z';
  return base(c.url('w')) + ribs +
    mass(roll, light(RIVER[1], .15), 1.2, 'M-28,46C-34,54 -32,66 -22,72C-14,74 -8,75 -4,75C-18,68 -22,58 -20,50Z', c) +
    c.fine('<path d="M-22,52C-24,58 -22,64 -18,68M-12,54C-13,60 -12,66 -9,70M0,55V71M12,54C13,60 12,66 9,70M22,52C24,58 22,64 18,68" fill="none" stroke-width=".55" opacity=".7"/>') +
    buttons(c, [[-56 * w, 68], [-48 * w, 66], [48 * w, 66], [56 * w, 68]], 2.6) +
    `<path d="${wx('M44,64C64,70 84,86 90,104', w)}" fill="none" stroke="${light(RIVER[2], .4)}" stroke-width="1.3" opacity=".55"/>`;
};

// ---- the neck ----
const neck = (c: Ctx, s: Spec): string => {
  const k = s.neck, bot = 64 + s.drop;
  return `<path d="M${-k},30L${-k - 2},${bot}L${k + 2},${bot}L${k},30Z" fill="${dark(s.skin[1], .2)}" stroke-width="1"/><path d="M${-k},30L${-k - 2},${bot}L${-k + 10},${bot}L${-k + 12},40Z" fill="${c.url('p')}" stroke="none"/>` +
    `<path d="M${-k + 2},40Q0,50 ${k - 2},40L${k},50Q0,58 ${-k},50Z" fill="#4e2f20" opacity=".25" stroke="none"/>`;
};

// ---- the curls ----
const LEFT_M: readonly Pt[] = [[-50, 16], [-60, 8], [-66, -6], [-66, -22], [-60, -38], [-50, -52], [-36, -63], [-19, -70], [0, -73]];
const LEFT_F: readonly Pt[] = [[-42, 72], [-58, 68], [-68, 56], [-74, 40], [-74, 24], [-72, 8], [-70, -8], [-66, -26], [-58, -42], [-46, -56], [-30, -66], [-14, -71], [0, -73]];
/** The balloon's curl places, in portrait units. */
const CURL: readonly Pt[] = ([[-41, -8], [-43, -22], [-37, -33], [-28, -41], [-16, -47], [-4, -50], [8, -49], [20, -45], [30, -38], [37, -27], [37, -11], [-23, -32], [-9, -36], [5, -37], [18, -33], [-31, -24], [27, -25]] as const).map(([x, y]) => [x * 1.4, y * 1.4 + 7] as const);
const CURL_F: readonly Pt[] = [[-64, 12], [-68, 28], [-66, 44], [-56, 58], [-58, 26], [-60, 40], [64, 12], [68, 28], [66, 44], [56, 58], [58, 26], [60, 40], [-62, -6], [62, -6]];

const backHair = (c: Ctx, s: Spec): string => {
  const j = s.jaw, H = curlyMass(c.fem ? LEFT_F : LEFT_M, j, c.fem ? 'L40,30L-40,30Z' : 'L40,0L-40,0Z');
  const sh = c.fem
    ? wx('M-42,72C-60,70 -74,56 -76,36C-78,10 -72,-30 -50,-56C-38,-66 -20,-72 -4,-73C-30,-58 -44,-30 -46,0C-48,30 -46,56 -42,72Z', j)
    : wx('M-50,16C-62,10 -70,-8 -68,-26C-64,-46 -46,-64 -20,-71C-36,-56 -44,-40 -46,-24C-48,-10 -48,4 -50,16Z', j);
  const deep = c.fem ? wx('M-42,72C-60,70 -74,56 -76,36C-78,10 -74,-14 -68,-28C-70,0 -68,40 -42,72Z', j) : '';
  return mass(H, c.url('h'), 1.2, sh, c, deep) + (c.fem ? curls(c, CURL_F.map(([x, y]) => [x * j, y, 8] as const), s.hair[2]) : '');
};

/** The balloon's fringe: curls tumbling over the forehead, above the brows. */
const fringe = (c: Ctx, s: Spec): string => {
  const j = s.jaw;
  const F = wx(B('M-34,-12C-36,-24 -30,-34 -20,-37C-10,-42 10,-42 20,-37C30,-34 36,-24 34,-12C30,-18 27,-25 21,-23C17,-29 9,-28 6,-23C1,-29 -7,-28 -10,-23C-16,-28 -24,-25 -26,-19C-30,-18 -32,-15 -34,-12Z'), j);
  const sh = wx(B('M-34,-12C-36,-24 -30,-34 -20,-37C-14,-40 -8,-41 -4,-41C-16,-36 -22,-30 -24,-21C-30,-18 -32,-15 -34,-12Z'), j);
  const side = wx(B('M-37,6C-45,2 -47,-8 -42,-14C-49,-20 -46,-33 -37,-35C-39,-45 -27,-52 -18,-47C-23,-40 -31,-36 -31,-27C-35,-21 -36,-12 -34,-5C-34,0 -35,4 -37,6Z'), j);
  // the fringe has no outline at its top (it melts into the mop): only its scalloped lower edge is inked
  const bot = wx(B('M34,-12C30,-18 27,-25 21,-23C17,-29 9,-28 6,-23C1,-29 -7,-28 -10,-23C-16,-28 -24,-25 -26,-19C-30,-18 -32,-15 -34,-12'), j);
  return (c.fem ? '' : `<path d="${side}" fill="${c.url('p')}" stroke="none"/>`) + `<path d="${F}" fill="${c.url('h')}" stroke="none"/><path d="${sh}" fill="${c.url('p')}" stroke="none"/><path d="${bot}" fill="none" stroke-width="1.1"/>` +
    curls(c, CURL.filter(([x, y]) => y < -12 || Math.abs(x) < 44).map(([x, y]) => [x * j, y, 7.4] as const), s.hair[2]);
};

/** The balloon's leaf ears, pointed up and out (the hobbit's mark in every size). */
const ears = (c: Ctx, s: Spec): string => {
  const j = s.jaw, E = wx('M-44,-6C-48,-12 -52,-16 -56,-19C-58,-10 -57,2 -53,10C-50,16 -46,17 -43,13Z', j);
  const inner = wx('M-47,-5C-50,-8 -52,-10 -54,-12.5C-54.5,-6 -53,0 -50,5', j);
  const [s0, s1] = s.skin;
  return `<path d="${E}" fill="${mix(s0, s1, .55)}" stroke-width="1.2"/><path d="${E}" fill="${c.url('p')}" stroke="none"/><path d="${inner}" fill="none" stroke-width=".9"/>` +
    `<path d="${mir(E)}" fill="${mix(s1, s.skin[2], .4)}" stroke-width="1.2"/><path d="${mir(inner)}" fill="none" stroke-width=".9"/>` +
    `<ellipse cx="${n(-51 * j)}" cy="1" rx="3" ry="5" fill="#c2553e" opacity=".22" stroke="none"/><ellipse cx="${n(51 * j)}" cy="1" rx="3" ry="5" fill="#c2553e" opacity=".22" stroke="none"/>`;
};

// ---- the face (the balloon's round face, shortened) ----
const face = (c: Ctx, s: Spec): string => {
  const j = s.jaw * (c.fem ? .96 : 1);
  const F = FA('M-33,-10C-35,-30 -20,-40 0,-40C20,-40 35,-30 33,-10C38,0 38,16 30,26C22,35 10,38 0,38C-10,38 -22,35 -30,26C-38,16 -38,0 -33,-10Z', j);
  const sh = FA('M-33,-10C-35,-30 -20,-40 -6,-40C-20,-32 -25,-14 -25,-4C-28,8 -27,20 -19,33C-25,31 -28,28 -30,26C-38,16 -38,0 -33,-10Z', j);
  const edge = FA('M-34,-4C-38,6 -37,18 -30,26C-33,16 -33,6 -31,-4Z', j);
  const chin = FA('M-26,29C-14,40 14,40 26,29C16,34 -16,34 -26,29Z', j);
  const blush = c.fem ? .32 : .26;
  return `<path d="${F}" fill="${c.url('s')}" stroke-width="1.1"/><path d="${sh}" fill="#4e2f20" opacity=".2" stroke="none"/><path d="${sh}" fill="${c.url('p')}" stroke="none"/><path d="${edge}" fill="${c.url('q')}" stroke="none"/><path d="${chin}" fill="#4e2f20" opacity=".22" stroke="none"/>` +
    `<path d="${wx('M-44,-26Q0,-34 44,-26L45,-15Q0,-22 -45,-15Z', j)}" fill="#3d281b" opacity=".24" stroke="none"/>` +
    `<ellipse cx="${n(-29 * j)}" cy="21" rx="13" ry="9" fill="#b04a36" opacity="${blush}" stroke="none"/><ellipse cx="${n(29 * j)}" cy="21" rx="13" ry="9" fill="#c2553e" opacity="${blush}" stroke="none"/>` +
    c.fine(`<path d="M-17,24C-23,27 -26,33 -25,40M17,24C23,27 26,33 25,40" fill="none" stroke-width=".6" opacity="${c.fem ? .25 : .4}"/><path d="M-6,43.5Q0,45.5 6,43.5" fill="none" stroke-width=".6" opacity=".5"/>`);
};

// ---- the button nose (the balloon's), the mouths ----
const nose = (c: Ctx, s: Spec): string => {
  const [s0, s1] = s.skin;
  const T = c.fem ? (d: string): string => aff(d, 1.15, 1.15, 0, 9.5) : B;
  const fill = T('M-3,-4C-4,3 -8,6 -8,10.5C-8,15 -3.5,16.5 0,15.5C3.5,16.5 8,15 8,10.5C8,6 4,3 3,-4Z');
  const sh = T('M-3,-3C-4,3 -8,6 -8,10.5C-8,15 -3.5,16.5 -1,15.5C-5.5,12 -5.5,6 -1.5,-1Z');
  const nos = T('M-4.5,14.5Q-2.5,16 -.7,14.8M4.5,14.5Q2.5,16 .7,14.8');
  const cy = c.fem ? 21.6 : 21.7, hy = c.fem ? 18.7 : 18.2;
  return `<path d="${fill}" fill="${mix(s0, s1, .66)}" ${c.fem ? 'opacity=".6" ' : ''}stroke="none"/><path d="${sh}" fill="${c.url('p')}" stroke="none"/>` +
    `<ellipse cx="0" cy="${cy}" rx="${c.fem ? 7.5 : 9.5}" ry="${c.fem ? 5 : 6.4}" fill="#c2553e" opacity=".22" stroke="none"/><ellipse cx="3.4" cy="${hy}" rx="${c.fem ? 2.5 : 3}" ry="${c.fem ? 3.6 : 4.5}" fill="#f8e6cc" opacity=".55" stroke="none"/>` +
    (c.fem ? `<path d="${T('M-3,-2C-4,4 -7.5,7 -7.8,10.5')}" fill="none" stroke-width=".8"/>` : `<path d="${B('M-7.8,8.5C-9.5,15 -3.5,17.2 0,15.7C3.5,17.2 9.5,15 7.8,8.5')}" fill="none" stroke-width="1.2"/>`) +
    `<path d="${nos}" fill="none" stroke-width=".9"/>`;
};
/** The men's mouth: a closed, cheerful smile with its corners tucked up. */
const smile = (c: Ctx): string =>
  `<path d="M-12,33.5Q0,41 12,33.5Q0,38 -12,33.5Z" fill="#7a3a2c" stroke-width="1.2"/><path d="M-14.5,31.6q-1.8,1.6 -.8,3.8M14.5,31.6q1.8,1.6 .8,3.8" fill="none" stroke-width=".9"/>` +
  `<path d="M-6,40.2Q0,42.4 6,40.2" fill="none" stroke="#a85a48" stroke-width="1.3" opacity=".6"/>${c.fine('<path d="M-4,39.4Q0,40.6 4,39.4" fill="none" stroke-width=".5" opacity=".5"/>')}`;
/** The women's lips, smiling. */
const lips = (c: Ctx): string =>
  `<path d="M-11,33Q-5,30.6 0,32.6Q5,30.6 11,33Q5,35.4 0,35Q-5,35.4 -11,33Z" fill="#a04c3e" stroke-width=".8"/><path d="M-9,34.4Q0,40.6 9,34.4Q0,36 -9,34.4Z" fill="#c06a5a" stroke-width=".8"/>` +
  `<path d="M-12.6,31.4q-1.4,1.2 -.6,2.8M12.6,31.4q1.4,1.2 .6,2.8" fill="none" stroke-width=".7" opacity=".7"/>${c.fine('<path d="M1,37.6q2.5,.2 4,-.8" fill="none" stroke="#f6d8c2" stroke-width=".9" opacity=".85"/>')}`;

// ---- the Stoor's facial hair: great curly mutton-chops joined by a chin beard ----
const chops = (c: Ctx, s: Spec): string => {
  const j = s.jaw, hi = s.hair[2];
  const C = wx(bumpy([[-44, -16], [-54, -4], [-60, 10], [-62, 26], [-58, 40], [-50, 52], [-38, 60]], .5) + 'L-30,46C-36,36 -40,22 -40,8C-40,-2 -40,-10 -38,-16Z', j);
  const Bd = wx('M-38,42C-26,46 -12,47 0,47C12,47 26,46 38,42' + bumpy([[38, 42], [36, 56], [26, 66], [10, 72], [-10, 72], [-26, 66], [-36, 56], [-38, 42]], .5, false) + 'Z', j);
  const at = ([[-52, 0, 7], [-56, 16, 7.4], [-55, 32, 7.4], [-48, 46, 7], [-36, 56, 7], [-20, 62, 7], [0, 64, 7], [20, 62, 7], [36, 56, 7], [48, 46, 7], [55, 32, 7.4], [56, 16, 7.4], [52, 0, 7]] as const).map(([x, y, r]) => [x * j, y, r] as const);
  return mass(Bd, c.url('h'), 1.2, wx('M-38,42C-26,46 -12,47 -4,47C-14,56 -16,64 -12,72C-24,68 -34,58 -38,42Z', j), c) +
    mass(C, c.url('h'), 1.2, C, c) + `<path d="${mir(C)}" fill="${mix(s.hair[0], s.hair[1], .8)}" stroke-width="1.2"/>` +
    curls(c, at, hi);
};

// ---- the women's marks in the hair ----
const daisy = (c: Ctx, x: number, y: number, r: number): string => {
  let p = '';
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    p += `<ellipse cx="${n(x + Math.cos(a) * r * .62)}" cy="${n(y + Math.sin(a) * r * .62)}" rx="${n(r * .5)}" ry="${n(r * .24)}" transform="rotate(${n(a * 180 / Math.PI)} ${n(x + Math.cos(a) * r * .62)} ${n(y + Math.sin(a) * r * .62)})" fill="#f8f3e4" stroke-width=".6"/>`;
  }
  return p + `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * .3)}" fill="${BRASS}" stroke-width=".6"/>`;
};
const deco = (c: Ctx, s: Spec): string => {
  const j = s.jaw;
  if (s.deco === 'ribbon') {
    // a green ribbon tied in a bow above the right temple
    return `<path d="${wx('M-52,-40C-34,-60 34,-60 52,-40', j)}" fill="none" stroke-width="5.2"/><path d="${wx('M-52,-40C-34,-60 34,-60 52,-40', j)}" fill="none" stroke="${NECKCLOTH}" stroke-width="3"/>` +
      `<g transform="translate(${n(40 * j)},-52) rotate(-24)"><path d="M0,0C-6,-12 -18,-12 -18,-2C-18,6 -8,6 0,0ZM0,0C6,-12 18,-12 18,-2C18,6 8,6 0,0Z" fill="${NECKCLOTH}" stroke-width="1.1"/><path d="M0,0C-4,8 -8,14 -12,18M0,0C3,8 5,14 9,19" fill="none" stroke-width="3.6"/><path d="M0,0C-4,8 -8,14 -12,18M0,0C3,8 5,14 9,19" fill="none" stroke="${NECKCLOTH}" stroke-width="2"/><ellipse rx="3.6" ry="3" fill="${light(NECKCLOTH, .2)}" stroke-width=".9"/>${c.fine('<path d="M-14,-4C-12,-8 -8,-8 -5,-5M5,-5C8,-8 12,-8 14,-4" fill="none" stroke="#b4d29a" stroke-width=".8"/>')}</g>`;
  }
  if (s.deco === 'wreath') {
    // a daisy wreath round the crown (the Fallohides, friends of the woods)
    const at: readonly Pt[] = [[-52, -32], [-42, -46], [-27, -56], [-9, -61], [9, -61], [27, -56], [42, -46], [52, -32]];
    return `<path d="${wx('M-56,-24C-50,-50 -26,-63 0,-64C26,-63 50,-50 56,-24', j)}" fill="none" stroke="#3e6a34" stroke-width="2.6"/>` +
      at.map(([x, y], i) => `<path d="M${n(x * j)},${y}q${i % 2 ? 6 : -6},-5 ${i % 2 ? 11 : -11},-1q${i % 2 ? -5 : 5},5 ${i % 2 ? -11 : 11},1Z" fill="#6a9a4c" stroke-width=".7"/>`).join('') +
      at.map(([x, y]) => daisy(c, x * j, y, c.med ? 6.4 : 5.6)).join('');
  }
  if (s.deco === 'band') {
    // a russet band across the curls
    const d = wx('M-60,-30C-48,-58 -24,-66 0,-66C24,-66 48,-58 60,-30', j);
    return `<path d="${d}" fill="none" stroke-width="6.4"/><path d="${d}" fill="none" stroke="${RUSSET[2]}" stroke-width="4.2"/>${c.fine(`<path d="${d}" fill="none" stroke="${light(RUSSET[2], .5)}" stroke-width=".8" stroke-dasharray="2.5 2.5"/>`)}`;
  }
  // the Stoor river-wife's kerchief: madder red, cream dots, knotted at the side
  const K = wx('M-58,-6C-66,-40 -44,-76 0,-78C44,-76 66,-40 58,-6C44,-22 22,-30 0,-31C-22,-30 -44,-22 -58,-6Z', j);
  const knot = `<g transform="translate(${n(50 * j)},-50)"><path d="M0,0C4,-14 18,-18 24,-8C20,-2 10,2 0,0Z" fill="${MADDER[1]}" stroke-width="1.1"/><path d="M0,0C10,2 18,12 14,24C8,18 2,10 0,0Z" fill="${MADDER[2]}" stroke-width="1.1"/><circle r="5.4" fill="${MADDER[1]}" stroke-width="1.1"/></g>`;
  return mass(K, c.url('r'), 1.3, wx('M-58,-6C-66,-40 -44,-76 0,-78C-30,-66 -44,-40 -44,-17C-50,-14 -54,-10 -58,-6Z', j), c) +
    (c.med ? '' : `<path d="${K}" fill="${c.url('dot')}" stroke="none"/>`) +
    `<path d="${wx('M-50,-14C-38,-30 -20,-36 0,-37C20,-36 38,-30 50,-14', j)}" fill="none" stroke-width=".8" opacity=".55"/>` +
    `<path d="${wx('M10,-74C34,-70 52,-52 56,-28', j)}" fill="none" stroke="#f0a080" stroke-width="1.3" opacity=".5"/>` + knot;
};

/** The hobbits are young and cheerful: the eye's lines under it (parts.ts eye(), opacity .8) drawn at .28. */
const young = (e: string): string => e.replace(/(stroke-width="\.6" stroke-linecap="round" opacity=")\.8"/g, '$1.28"');

// ---- the whole figure ----
const draw = (s: Spec): Draw => (o) => {
  const c = ctx(o), fem = c.fem;
  const k = s.head, headT = k === 1 ? '' : ` transform="translate(0,${n(-30 * (1 - k))}) scale(${k})"`;
  const kerchief = fem && s.deco === 'kerchief';
  const head = pen(c, neck(c, s), true) + pen(c, backHair(c, s), s.fair) + (kerchief || s.chops ? '' : pen(c, ears(c, s), true)) + pen(c, face(c, s), true) +
    (s.chops && !fem ? pen(c, chops(c, s), s.fair) : '') + (s.chops && !kerchief ? pen(c, ears(c, s), true) : '') + pen(c, fringe(c, s), s.fair) +
    pen(c, nose(c, s) + (fem ? lips(c) : smile(c)), true) +
    pen(c, young(eyes(c, { lidFill: dark(s.skin[1], .1), lowFill: s.skin[1], ...s.eye, lash: fem, size: fem ? 1.06 : 1 }, s.brow)), true) +
    (fem ? pen(c, deco(c, s)) : '') + (kerchief ? pen(c, ears(c, s), true) : '');
  const body = `<g transform="translate(0,${s.drop})">${pen(c, bust(c, s))}</g><g${headT}>${head}</g>`;
  return svg(c, defs(c, s), body);
};

// ---- the four, the men and the women ----
const BASE: Spec = {
  skin: ['#9c7258', '#cfa486', '#ebc9a8'], hair: ['#4a2f20', '#8a5a36', '#d8b48a'], fair: false,
  brow: { fill: '#5f3f26', hi: '#c49a6c', sc: 1.02, dy: -2, rot: -5 }, eye: { iris: '#5a3e20', lid: 2, low: 1.5 },
  bust: 'waistcoat', cloth: MUSTARD, jaw: 1, wide: 1, head: 1, drop: 0, neck: 15, chops: false, deco: 'ribbon',
};
const FALLO: Spec = {
  ...BASE, skin: ['#a88a78', '#dcc0aa', '#f3e2ce'], hair: ['#a07a3a', '#e6c674', '#fdf2c8'], fair: true,
  brow: { fill: '#b88e4a', hi: '#f6e6b4', sc: 1, dy: -2.5, rot: -4 }, eye: { iris: '#4a6474', lid: 2.4, low: 1 },
  bust: 'coat', cloth: GREEN, jaw: .9, wide: 1.02, head: .94, drop: 8, neck: 13, deco: 'wreath',
};
const HARFOOT: Spec = {
  ...BASE, skin: ['#6a4630', '#9a6c4e', '#bf8f6e'], hair: ['#17110e', '#3e2c24', '#9a8a80'],
  brow: { fill: '#241a14', hi: '#8a7a70', sc: 1.06, dy: -1.5, rot: -6 }, eye: { iris: '#2a1a0e', lid: 1.8, low: 1.8 },
  bust: 'cloak', cloth: RUSSET, jaw: 1.03, wide: .84, head: 1.06, drop: -4, neck: 14, deco: 'band',
};
const STOOR: Spec = {
  ...BASE, skin: ['#9a6a52', '#c9957a', '#e8b896'], hair: ['#6a2a10', '#b45a22', '#f2b26c'],
  brow: { fill: '#6a3418', hi: '#e09a5c', sc: 1.22, dy: -1, rot: -3 }, eye: { iris: '#4a2e16', lid: 2.4, low: 2 },
  bust: 'gansey', cloth: RIVER, jaw: 1.13, wide: 1.24, head: 1, drop: -2, neck: 19, chops: true, deco: 'kerchief',
};
/** The women: the same breed, slender brows, no facial hair. */
const fem = (s: Spec, brow: BrowO = {}): Spec => ({ ...s, brow: { ...s.brow, thin: true, sc: 1.06, rot: -3, ...brow }, chops: false });
const FEM: Readonly<Record<string, Spec>> = {
  hobbit: fem(BASE, { fill: '#6a4630' }),
  fallohide: fem(FALLO, { fill: '#b0884a' }),
  harfoot: fem(HARFOOT, { fill: '#2e221a' }),
  stoor: fem({ ...STOOR, wide: 1.2 }, { fill: '#7a3e1e' }),
};

const pair = (id: string, m: Spec): Draw => { const dm = draw(m), df = draw(FEM[id]!); return (o) => (o.sex === 'female' ? df(o) : dm(o)); };

export const portraits: PortraitSet = {
  hobbit: pair('hobbit', BASE),
  fallohide: pair('fallohide', FALLO),
  harfoot: pair('harfoot', HARFOOT),
  stoor: pair('stoor', STOOR),
};

