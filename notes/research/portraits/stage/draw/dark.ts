// The Black Númenórean and the neutral figure (stage 77's portrait pass,
// notes/research/portraits/style.md; the dwarves are the worked example).
//
//   numenorean  the balloon numenorean's people (src/weather/balloons/
//               passengers/numenorean.ts): tall, cold and proud, a sorcerer of
//               Umbar. A close black hood with a pointed crown, a high black
//               collar lined in crimson standing up beside the jaw, a silver
//               circlet with a red gem on the brow, black hair, a pale, long,
//               angular face (high cheekbones, hollow cheeks, a long straight
//               nose), cold sea-grey eyes under half-lowered lids, thin straight
//               brows. The man: a thin moustache and a narrow pointed beard.
//               The woman: no beard, long black hair falling in front of the
//               collar, dark red lips, a teardrop gem hanging from the circlet.
//   neutral     no race known (before login, an unknown race): a broad,
//               rounded cowl of undyed grey-brown wool, its opening pure
//               shadow, no face, no eyes, no metal or gem. One drawing for
//               both sexes. Warm mid-tone wool so it reads on the dark disc and
//               on Paper, and never as the Númenórean (black, pointed, silver
//               and red).

import type { Draw, PortraitSet } from '../../../../../src/panes/portraits/types';
import { dark, light } from '../../../../../src/art/engrave';
import { type BrowO, type Ctx, type EyeO, baseDefs, ctx, eyes, lg, mass, mir, mix, pen, strands, svg, wx } from '../parts';

// ---- the palette ----
/** Pale, a little cold (the balloon numenorean's skin). */
const SKIN = ['#958d7b', '#c9c0a5', '#e6dfc7'] as const;
/** Black silk with a cold violet sheen (the balloon's `nmb`). */
const BLACK = ['#121014', '#211e26', '#3a3644'] as const;
const SHEEN = '#7a7e98';
const CRIM = ['#4f1016', '#7a1c22', '#a02e34'] as const;
const HAIR = ['#0e0c10', '#2a2630', '#7d8296'] as const;
const SILVER = ['#5e646b', '#9ea4aa', '#d6dbde'] as const;
const GOLD = '#c9a85c';
const GEM = '#b0222a';
/** Undyed wool for the neutral figure. */
const WOOL = ['#3f3933', '#5f574d', '#877c6d'] as const;

// =====================================================================
// The Black Númenórean
// =====================================================================

const nDefs = (c: Ctx): string =>
  baseDefs(c) + lg(c, 's', SKIN) + lg(c, 'k', BLACK, .2) + lg(c, 'r', CRIM) + lg(c, 'h', [HAIR[0], HAIR[1]]) + lg(c, 'v', SILVER, .3) +
  `<radialGradient id="${c.id('g')}" cx=".38" cy=".35" r=".7"><stop offset="0" stop-color="#ff8a80"/><stop offset=".35" stop-color="${GEM}"/><stop offset="1" stop-color="#4a0a10"/></radialGradient>`;

/** The hood behind the head: close, tall, rising to a point. */
const hoodBack = (c: Ctx): string => {
  const H = 'M-72,74C-80,24 -74,-40 -46,-68C-30,-84 -12,-94 0,-100C12,-94 30,-84 46,-68C74,-40 80,24 72,74Z';
  return mass(H, c.url('k'), 1.3, 'M-72,74C-80,24 -74,-40 -46,-68C-30,-84 -12,-94 0,-100C-30,-76 -54,-36 -54,74Z', c, 'M-72,74C-80,24 -74,-40 -50,-66C-64,-36 -68,14 -62,74Z') +
    c.fine('<path d="M-62,-30C-68,0 -68,34 -66,64M-36,-76C-46,-62 -54,-46 -58,-28M64,-24C70,6 70,36 68,64" fill="none" stroke-width=".6" opacity=".6"/>') +
    `<path d="M26,-84C50,-68 66,-42 72,-6" fill="none" stroke="${SHEEN}" stroke-width="1.5" opacity=".6"/><path d="M8,-94C16,-90 22,-86 28,-81" fill="none" stroke="${SHEEN}" stroke-width="1.1" opacity=".5"/>`;
};

/** The black robe, crimson lapels with gold edges, a silver clasp at the throat. */
const nBust = (c: Ctx): string => {
  const body = 'M-122,150L-120,102C-114,80 -94,68 -66,62L-30,54L30,54L66,62C94,68 114,80 120,102L122,150Z';
  const sh = 'M-122,150L-120,102C-114,80 -94,68 -66,62L-30,54L-12,54C-48,66 -64,100 -62,150Z';
  const lapL = 'M-16,60L-40,66L-50,150L-26,150Z';
  return `<path d="${body}" fill="${c.url('k')}" stroke-width="1.2"/><path d="${sh}" fill="${c.url('p')}" stroke="none"/>` +
    `<path d="M-122,150L-120,102C-114,80 -100,72 -84,66C-100,84 -106,110 -104,150Z" fill="${c.url('q')}" stroke="none"/>` +
    `<path d="M76,66C98,74 112,86 116,106" fill="none" stroke="${SHEEN}" stroke-width="1.4" opacity=".6"/>` +
    `<path d="M-14,56L14,56L24,150L-24,150Z" fill="#2b2832" stroke-width="1.1"/>` +
    `<path d="${lapL}" fill="${c.url('r')}" stroke-width="1.1"/><path d="${lapL}" fill="${c.url('p')}" stroke="none"/><path d="${mir(lapL)}" fill="${CRIM[2]}" stroke-width="1.1"/>` +
    `<path d="M-38,68L-47,150M38,68L47,150" fill="none" stroke="${GOLD}" stroke-width="1.5"/>` +
    `<path d="M-108,92C-100,80 -86,72 -68,68M108,92C100,80 86,72 68,68" fill="none" stroke="${GOLD}" stroke-width="1.2" stroke-dasharray="2.6 2.2" opacity=".85"/>` +
    c.fine('<path d="M-92,86C-88,104 -88,126 -90,150M-76,78C-74,100 -74,126 -76,150M90,86C86,104 86,126 88,150" fill="none" stroke-width=".6" opacity=".6"/>') +
    `<circle cx="0" cy="70" r="7.5" fill="${c.url('v')}" stroke-width="1.1"/><circle cx="0" cy="70" r="3.6" fill="${c.url('g')}" stroke-width=".8"/>`;
};

/** The high collar: two stiff black wings rising beside the jaw, lined in crimson. */
const collar = (c: Ctx, fem: boolean): string => {
  const t = fem ? 26 : 18;
  const W = `M-14,62L-34,68L-64,${t}C-60,${t + 22} -52,46 -40,60Z`;
  const L = `M-18,58L-58,${t + 6}C-54,${t + 24} -46,46 -36,56Z`;
  return `<path d="${W}" fill="${c.url('k')}" stroke-width="1.3"/><path d="${W}" fill="${c.url('p')}" stroke="none"/><path d="${L}" fill="${c.url('r')}" stroke-width=".9"/><path d="${L}" fill="${c.url('p')}" stroke="none"/>` +
    `<path d="${mir(W)}" fill="${BLACK[2]}" stroke-width="1.3"/><path d="${mir(L)}" fill="${CRIM[2]}" stroke-width=".9"/>` +
    `<path d="M-62,${t + 2}L-36,64M62,${t + 2}L36,64" fill="none" stroke="${GOLD}" stroke-width="1.1" opacity=".85"/>` +
    `<path d="M-34,67L-63,${t + 1}M34,67L63,${t + 1}" fill="none" stroke="${SHEEN}" stroke-width="1.2" opacity=".7"/>` +
    `<path d="M60,${t + 6}C58,${t + 22} 52,40 42,54" fill="none" stroke="#d8707a" stroke-width="1" opacity=".45"/>`;
};

/** The black hair inside the hood's opening, swept back from the brow. */
const hoodHair = (c: Ctx): string => {
  const A = 'M-52,48C-58,2 -46,-40 0,-62C46,-40 58,2 52,48Z';
  return mass(A, c.url('h'), 1, 'M-52,48C-58,2 -46,-40 0,-62C-30,-40 -40,0 -40,48Z', c) +
    strands(c, 'M-6,-56C-24,-46 -36,-34 -42,-16M6,-56C24,-46 36,-34 42,-16M-2,-50C-12,-44 -20,-36 -24,-28M2,-50C12,-44 20,-36 24,-28',
      'M-10,-54C-26,-44 -38,-30 -44,-12M10,-54C26,-44 38,-30 44,-12M18,-46C26,-40 32,-34 35,-28', HAIR[2], .7);
};

/** The face: long and angular, high cheekbones, hollow cheeks; the woman's a little narrower with a rounder chin. */
const nFace = (c: Ctx): string => {
  const fem = c.fem, J = .9;
  const F0 = fem
    ? 'M-40,-24C-43,-6 -43,10 -39,21C-33,35 -18,46 0,47C18,46 33,35 39,21C43,10 43,-6 40,-24Z'
    : 'M-41,-24C-44,-6 -44,10 -41,20L-29,37C-20,44 -9,47 0,47C9,47 20,44 29,37L41,20C44,10 44,-6 41,-24Z';
  const sh0 = fem
    ? 'M-40,-24C-43,-6 -43,10 -39,21C-33,35 -24,42 -14,46C-28,30 -30,0 -29,-24Z'
    : 'M-41,-24C-44,-6 -44,10 -41,20L-29,37C-24,41 -18,44 -13,46C-26,30 -30,0 -29,-24Z';
  const edge0 = fem ? 'M-40,-24C-43,-6 -43,10 -39,21C-40,8 -40,-6 -37,-24Z' : 'M-41,-24C-44,-6 -44,10 -41,20L-36,27C-39,12 -39,-6 -37,-24Z';
  // the hollow under the cheekbone: a shadow wedge each side, hatched on the left
  const hol = wx('M-38,12C-32,15 -27,21 -24,30C-30,27 -35,23 -38,19Z', J);
  const F = wx(F0, J), sh = wx(sh0, J), edge = wx(edge0, J);
  const neck = `<path d="M-13,36L-15,64L15,64L13,36Z" fill="${dark(SKIN[1], .18)}" stroke-width="1"/><path d="M-13,36L-15,64L-4,64L-2,46Z" fill="${c.url('p')}" stroke="none"/><path d="M-13,46Q0,54 13,46L13,52Q0,58 -13,52Z" fill="#33242f" opacity=".3" stroke="none"/>`;
  const jawSh = `<path d="M-28,38C-18,45 -8,47 0,47C10,47 20,44 28,38C20,46 10,50 0,50C-10,50 -20,46 -28,38Z" fill="#33242f" opacity=".28" stroke="none"/>`;
  return neck + `<path d="${F}" fill="${c.url('s')}" stroke-width="1.1"/><path d="${sh}" fill="#33242f" opacity=".2" stroke="none"/><path d="${sh}" fill="${c.url('p')}" stroke="none"/><path d="${edge}" fill="${c.url('q')}" stroke="none"/>` +
    `<path d="M-37,-23Q0,-16 37,-23L36.5,-12Q0,-4 -36.5,-12Z" fill="#2c2028" opacity=".3" stroke="none"/>` +
    `<path d="${hol}" fill="#33242f" opacity=".22" stroke="none"/>${fem ? '' : `<path d="${mir(hol)}" fill="#33242f" opacity=".12" stroke="none"/>`}` +
    `<ellipse cx="27" cy="10" rx="7" ry="3" fill="#f6efd8" opacity=".5" stroke="none"/>` +
    (fem ? `<ellipse cx="-29" cy="16" rx="8" ry="5" fill="#9a4a4a" opacity=".16" stroke="none"/><ellipse cx="29" cy="16" rx="8" ry="5" fill="#b05a5a" opacity=".16" stroke="none"/>` : '') +
    jawSh +
    (fem ? '' : `<path d="M-33,11C-28,14 -25,19 -22,26M33,11C28,14 25,19 22,26" fill="none" stroke-width=".8" opacity=".7"/>`) +
    c.fine(fem ? '' : '<path d="M-4,-15L-3,-8M4,-15L3,-8" fill="none" stroke-width=".55" opacity=".55"/>');
};

/** A long straight nose, narrow at the bridge; the woman's finer, with no outline. */
const nNose = (c: Ctx): string => {
  if (c.fem) {
    return `<path d="M-2.6,-8C-3,4 -6,13 -7.5,20C-7.5,25 -3,27 0,26.5C3,27 7.5,25 7.5,20C6,13 3,4 2.6,-8Z" fill="${mix(SKIN[0], SKIN[1], .72)}" opacity=".5" stroke="none"/><path d="M-2.6,-8C-3,4 -6,13 -7.5,20C-7.5,23 -6,24.5 -4.5,25C-6,17 -4,6 -1.5,-4Z" fill="${c.url('p')}" stroke="none"/>` +
      `<path d="M-3,-6C-3.5,4 -6,12 -7.2,19" fill="none" stroke-width=".9"/><path d="M1.6,2Q2.6,11 3.4,18" fill="none" stroke="#f6efd8" stroke-width="1.2" opacity=".6"/>` +
      `<path d="M-6.5,22.5q2,2.4 4.5,1.1M6.5,22.5q-2,2.4 -4.5,1.1M-2.4,25.5q2.4,1 4.8,0" fill="none" stroke-width=".9"/>`;
  }
  return `<path d="M-2.6,-9C-3,6 -5.5,18 -7,26C-6.5,30.5 -2.5,32 0,31.4C2.5,32 6.5,30.5 7,26C5.5,18 3,6 2.6,-9Z" fill="${mix(SKIN[0], SKIN[1], .66)}" stroke-width="1.1"/>` +
    `<path d="M-2.6,-9C-3,6 -5.5,18 -7,26C-6.5,29.5 -4.5,31 -2.2,31.3C-4.5,24 -3.6,10 -.8,-7Z" fill="${c.url('p')}" stroke="none"/>` +
    `<path d="M1.6,0Q2.8,12 4,22" fill="none" stroke="#f6efd8" stroke-width="1.3" opacity=".7"/>` +
    `<path d="M-7,27.5q2.2,2.4 4.6,1.1M7,27.5q-2.2,2.4 -4.6,1.1" fill="none" stroke-width="1"/>` +
    `<ellipse cx="0" cy="28" rx="9" ry="4.5" fill="#6a3036" opacity=".12" stroke="none"/>`;
};

/** The man's mouth: a thin hard line turned down at the corners, a thin moustache, a narrow pointed beard. */
const nMouth = (c: Ctx): string => {
  const mo = 'M0,33.6C-5,32.6 -11,33.6 -15,38.6C-10,36.6 -5,36 0,36.2Z';
  const B = 'M-11,42C-14,49 -9,58 0,66C9,58 14,49 11,42Q0,46.5 -11,42Z';
  return `<path d="${mo}" fill="${HAIR[1]}" stroke-width=".8"/><path d="${mo}" fill="${c.url('p')}" stroke="none"/><path d="${mir(mo)}" fill="${HAIR[1]}" stroke-width=".8"/>` +
    `<path d="M-11,39.2Q-4,37.4 0,38.2Q4,37.4 11,39.2" fill="none" stroke-width="1.5"/><path d="M-11,39.2l-1.6,1.8M11,39.2l1.6,1.8" fill="none" stroke-width=".8" opacity=".8"/>` +
    `<path d="M-5,41.4Q0,42.6 5,41.4" fill="none" stroke="#6a3036" stroke-width=".8" opacity=".6"/>` +
    `<path d="${B}" fill="${c.url('h')}" stroke-width="1"/><path d="M-11,42C-14,49 -9,58 0,66C-5,56 -6,48 -4,44.5Z" fill="${c.url('p')}" stroke="none"/>` +
    strands(c, 'M-6,45C-6,52 -4,58 0,63M6,45C6,52 4,58 0,63', 'M3,45C3.5,52 2.5,57 1,61', HAIR[2], .7);
};

/** The woman's mouth: narrow, dark red, cool. */
const nLips = (c: Ctx): string =>
  `<path d="M-9,36Q-4,33 0,34.6Q4,33 9,36Q4,37 0,36.8Q-4,37 -9,36Z" fill="#7a2630" stroke-width=".8"/><path d="M-7.6,36.6Q0,42 7.6,36.6Q0,37.8 -7.6,36.6Z" fill="#963440" stroke-width=".8"/>` +
  c.fine('<path d="M1,39.6q2.4,.2 3.8,-.8" fill="none" stroke="#e8c0c0" stroke-width=".8" opacity=".75"/>');

/** The woman's long black hair: two falls from under the hood, in front of the collar. */
const nLocks = (c: Ctx): string => {
  const L = 'M-40,-16C-48,2 -50,30 -52,56C-54,80 -58,100 -60,124L-36,124C-36,98 -32,74 -34,52C-36,30 -38,10 -36,-6Z';
  return `<path d="${L}" fill="${c.url('h')}" stroke-width="1.1"/><path d="${L}" fill="${c.url('p')}" stroke="none"/><path d="${mir(L)}" fill="${dark(HAIR[1], .05)}" stroke-width="1.1"/>` +
    strands(c, 'M-42,4C-44,30 -46,70 -52,118M-38,20C-40,50 -42,84 -44,118M42,4C44,30 46,70 52,118M38,20C40,50 42,84 44,118',
      'M-46,10C-48,40 -50,80 -54,116M46,0C48,36 50,76 54,116M40,30C41,60 42,90 42,114', HAIR[2], .8);
};

/** The hood's rim over the opening, a pointed arch, and the silver circlet with its red gem. */
const nRim = (c: Ctx): string => {
  const pend = c.fem
    ? `<path d="M0,-25L0,-21" fill="none" stroke="${SILVER[1]}" stroke-width="1"/><path d="M0,-21C-3,-18 -3,-15 0,-13C3,-15 3,-18 0,-21Z" fill="url(#${c.id('g')})" stroke-width=".7"/>`
    : '';
  return `<path d="M-50,46C-56,0 -46,-40 0,-62C46,-40 56,0 50,46" fill="none" stroke-width="2.4"/>` +
    `<path d="M-47,40C-52,0 -42,-36 -2,-57" fill="none" stroke="${BLACK[0]}" stroke-width="3.2" opacity=".75"/>` +
    `<path d="M6,-58C40,-38 52,0 49,38" fill="none" stroke="${SHEEN}" stroke-width="1.6" opacity=".6"/>` +
    `<path d="M-41,-24Q0,-32 41,-24L40.5,-20.5Q0,-28.5 -40.5,-20.5Z" fill="${c.url('v')}" stroke-width=".9"/>` +
    `<path d="M-6,-29L0,-38L6,-29L0,-24Z" fill="${c.url('v')}" stroke-width=".9"/><circle cx="0" cy="-30" r="3.4" fill="url(#${c.id('g')})" stroke-width=".8"/>` +
    c.fine('<circle cx="-1.1" cy="-31.2" r=".9" fill="#ffd8d0" stroke="none"/>') + pend +
    `<path d="M14,-27Q28,-26 38,-23.5" fill="none" stroke="#fff" stroke-width=".9" opacity=".6"/>`;
};

const numenorean: Draw = (o) => {
  const c = ctx(o);
  const eye: EyeO = { iris: '#56786f', lid: c.fem ? 2.6 : 3, low: .8, lidFill: dark(SKIN[1], .14), lowFill: SKIN[1], socket: '#33242f', lash: c.fem, size: c.fem ? 1.06 : 1 };
  const brow: BrowO = { fill: '#17131a', hi: '#2e2a34', thin: true, rot: c.fem ? 6 : 10, sc: c.fem ? 1.04 : 1.08, dy: c.fem ? -1 : .5 };
  const body = pen(c, hoodBack(c)) + pen(c, nBust(c)) + pen(c, hoodHair(c)) + pen(c, nFace(c), true) +
    (c.fem ? pen(c, nLocks(c)) : '') + pen(c, collar(c, c.fem)) +
    pen(c, nNose(c) + (c.fem ? nLips(c) : ''), true) + (c.fem ? '' : pen(c, nMouth(c))) +
    pen(c, eyes(c, eye, brow), true) + pen(c, nRim(c));
  return svg(c, nDefs(c), body);
};

// =====================================================================
// The neutral figure: a cowl with no face
// =====================================================================

const uDefs = (c: Ctx): string =>
  baseDefs(c) + lg(c, 'w', WOOL, .15) +
  `<radialGradient id="${c.id('d')}" cx=".5" cy=".7" r=".75"><stop offset="0" stop-color="#1e1a17"/><stop offset=".7" stop-color="#0d0b0a"/><stop offset="1" stop-color="#050404"/></radialGradient>`;

const neutral: Draw = (o) => {
  const c = ctx(o), W = c.url('w'), hi = light(WOOL[2], .45);
  // the cloak over the shoulders
  const body = 'M-124,150L-122,104C-116,82 -98,70 -70,64L-40,58L40,58L70,64C98,70 116,82 122,104L124,150Z';
  const cloak = `<path d="${body}" fill="${W}" stroke-width="1.2"/><path d="M-124,150L-122,104C-116,82 -98,70 -70,64L-50,60C-74,78 -82,110 -80,150Z" fill="${c.url('p')}" stroke="none"/><path d="M-124,150L-122,104C-116,86 -104,76 -90,70C-102,90 -106,116 -104,150Z" fill="${c.url('q')}" stroke="none"/>` +
    `<path d="M-6,92L-4,150M4,96L8,150" fill="none" stroke-width=".9" opacity=".7"/>` +
    c.fine('<path d="M-96,86C-92,106 -92,128 -94,150M-64,80C-62,104 -62,128 -64,150M66,80C64,104 64,128 66,150M96,86C92,106 92,128 94,150" fill="none" stroke-width=".6" opacity=".55"/>') +
    `<path d="M78,70C100,78 114,90 118,110" fill="none" stroke="${hi}" stroke-width="1.4" opacity=".5"/>`;
  // the cowl: a broad rounded hood, a soft peak
  const H = 'M-80,76C-90,20 -82,-48 -46,-72C-28,-84 -10,-90 0,-92C10,-90 28,-84 46,-72C82,-48 90,20 80,76Z';
  const hood = mass(H, W, 1.3, 'M-80,76C-90,20 -82,-48 -46,-72C-34,-80 -18,-87 -4,-90C-40,-70 -60,-30 -58,76Z', c, 'M-80,76C-90,20 -82,-48 -52,-68C-68,-38 -74,14 -68,76Z') +
    `<path d="M30,-80C60,-62 78,-30 82,8" fill="none" stroke="${hi}" stroke-width="1.5" opacity=".55"/>` +
    c.fine('<path d="M-68,-30C-74,0 -74,34 -72,66M-40,-74C-50,-60 -58,-44 -62,-26M70,-26C76,4 76,36 74,66M8,-88C18,-84 28,-80 36,-76M-58,-16C-62,10 -62,36 -58,58M60,-12C64,12 64,36 60,58" fill="none" stroke-width=".6" opacity=".55"/>');
  // the opening: shadow, no face; the hood's lit inner side on the right gives it depth
  const O = 'M-42,56C-52,10 -40,-40 0,-52C40,-40 52,10 42,56C26,64 -26,64 -42,56Z';
  const hole = `<path d="${O}" fill="url(#${c.id('d')})" stroke-width="1.2"/>` +
    `<path d="M22,-44C40,-28 50,10 42,56Q37,58 31,59C38,14 36,-18 18,-42Z" fill="${WOOL[0]}" opacity=".55" stroke="none"/>` +
    `<path d="M-42,56C-52,10 -40,-40 0,-52C-28,-38 -36,0 -30,60Z" fill="#000" opacity=".3" stroke="none"/>`;
  // the cowl's drape across the chest, closing the opening at the bottom, then the rim
  const drape = 'M-72,48C-44,62 -22,66 0,66C22,66 44,62 72,48C78,56 80,64 78,72C50,92 24,102 0,102C-24,102 -50,92 -78,72C-80,64 -78,56 -72,48Z';
  const R = 'M-42,56C-52,10 -40,-40 0,-52C40,-40 52,10 42,56L50,54C60,8 48,-50 0,-57C-48,-50 -60,8 -50,54Z';
  const edge = mass(drape, W, 1.1, 'M-72,48C-50,58 -34,63 -20,65L-22,101C-40,98 -60,88 -78,72C-80,64 -78,56 -72,48Z', c) +
    `<path d="M-52,70C-30,82 30,82 52,70M-30,86C-12,92 12,92 30,86" fill="none" stroke-width=".8" opacity=".5"/><path d="M14,64C36,62 52,56 64,52" fill="none" stroke="${hi}" stroke-width="1.2" opacity=".5"/>` +
    mass(R, W, 1, 'M-42,56C-52,10 -40,-40 0,-52L0,-57C-48,-50 -60,8 -50,54Z', c) +
    `<path d="M8,-55C40,-46 56,-6 48,48" fill="none" stroke="${hi}" stroke-width="1.3" opacity=".6"/>`;
  return svg(c, uDefs(c), pen(c, cloak, true) + pen(c, hood, true) + pen(c, hole, true) + pen(c, edge, true));
};

export const portraits: PortraitSet = { numenorean, neutral };
