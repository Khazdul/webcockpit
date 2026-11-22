// The Men's portraits (stage 77's portrait pass, notes/research/portraits/
// style.md), on the dwarves' parts. The base man is the balloon woman's
// people (src/weather/balloons/passengers/human.ts: the moss wool cloak, the
// leather jerkin over a laced linen shirt, the honey-brown hair, the warm
// skin) as a bust for the round frame: a longer, narrower face than a
// dwarf's, a finer nose, a short trimmed beard. The three kinds and the
// Beorning are that same figure with one mark pushed hard:
//   dunadan     the dark green ranger's hood up, near-black hair, a dark
//               short beard, a weathered face, keen grey eyes in the hood's
//               shadow, the great silver star on the shoulder
//   eriadorian  bare-headed and clean-shaven: a tousled sandy mop, ears, a
//               round ruddy everyday face, russet homespun and an ochre
//               scarf, a wooden toggle; no metal at all
//   rohirrim    gold: a gilded helm with a white horsetail crest, long
//               blond hair in front braids, a long drooping moustache,
//               blue eyes, a green cloak with gold braid, a gold horse brooch
//   beorning    a bear: a bear-pelt hood with round ears and the bear's
//               muzzle over the brow, a huge wild black-brown beard, a fur
//               mantle on the widest shoulders, a fierce brow
// The women keep the people's headgear (the hood, the pelt), cloth, palette
// and eyes; no beard; the dwarf women's face, nose and lips; long hair. The
// bare-headed ones get the people's own headgear: the base woman the balloon
// woman's braid crown, the Eriadorian a russet kerchief, the Rohirrim
// woman (a shieldmaiden, not a rider in a helm) a gold circlet over loose
// golden hair and the two front braids, so the gold reads in Medium.

import type { Draw, PortraitSet } from '../../../../../src/panes/portraits/types';
import { dark, light } from '../../../../../src/art/engrave';
import { type BrowO, type Ctx, type EyeO, type HairO, INK, baseDefs, ctx, frontBraids, longHair, mix, temples, eyes, lg, mass, mir, n, pen, strands, svg, wx } from '../parts';

type Head = 'bare' | 'hood' | 'mop' | 'helm' | 'bear';
type Beard = 'short' | 'ranger' | 'none' | 'rohan' | 'shaggy';
type Bust = 'cloak' | 'ranger' | 'homespun' | 'rohan' | 'fur';

/** One Man: everything a kind or a sex changes. */
interface Spec {
  skin: readonly [string, string, string];
  hair: readonly [string, string, string];
  brow: BrowO;
  eye: EyeO;
  head: Head;
  beard: Beard;
  bust: Bust;
  /** The face width factor. */
  jaw: number;
  /** The shoulders' width factor. */
  wide: number;
  /** The cloak (or tunic, or fur): shadow, mid, light. */
  cloth: readonly [string, string, string];
  /** Wrinkles (0 young, 1 weathered). */
  age: number;
  /** Cheek blush strength. */
  blush: number;
}

const GOLD = '#d8b45a', SILVER = '#d6dbde';
const LEATHER = ['#4a2f1c', '#7a5232', '#9a7046'] as const;
const LINEN = '#e4d8bd';

const defs = (c: Ctx, s: Spec): string =>
  baseDefs(c) + lg(c, 's', s.skin) + lg(c, 'h', [s.hair[0], s.hair[1]]) + lg(c, 'k', s.cloth, .15) + lg(c, 'l', LEATHER) +
  lg(c, 'g', ['#6a4e1e', '#b08a3a', '#e6c878'], .25) + lg(c, 'v', ['#aeb6bc', '#eef1f2']) + lg(c, 'w', ['#b8ad98', '#f2ecde']) +
  lg(c, 'z', s.head === 'bear' ? ['#3e2616', '#7a5232', '#a87a4e'] : ['#2a1a10', '#5a3a24', '#7e5838']);

// ---- the bust ----
const BODY = 'M-120,150L-118,108C-112,88 -94,76 -64,70L-24,62L24,62L64,70C94,76 112,88 118,108L120,150Z';
const BODY_SH = 'M-120,150L-118,108C-112,88 -94,76 -64,70L-24,62L-10,62C-46,74 -62,104 -60,150Z';

/** A brooch on the lit shoulder: what kind of Man it is. */
const brooch = (c: Ctx, s: Spec): string => {
  const x = 58, y = 72;
  if (s.bust === 'ranger') {
    // the star of the Dúnedain: eight silver rays round a white stone, drawn large
    let d = '';
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 - Math.PI / 2, b = a + Math.PI / 8, r = i % 2 ? 9 : 14;
      d += `${i ? 'L' : 'M'}${n(x + r * Math.cos(a))},${n(y + r * Math.sin(a))}L${n(x + 4.6 * Math.cos(b))},${n(y + 4.6 * Math.sin(b))}`;
    }
    return `<path d="${d}Z" fill="${c.url('v')}" stroke-width="1"/><circle cx="${x}" cy="${y}" r="3.6" fill="#f4f7f8" stroke-width=".8"/>${c.fine(`<path d="M${x + 2},${y - 10}L${x + 3},${y - 4}" fill="none" stroke="#fff" stroke-width=".8"/>`)}`;
  }
  if (s.bust === 'rohan') {
    // a gold horse's head on a round gold boss
    return `<circle cx="${x}" cy="${y}" r="10" fill="${c.url('g')}" stroke-width="1.1"/><path d="M${x - 5},${y + 6}C${x - 5},${y} ${x - 3},${y - 5} ${x + 1},${y - 7}L${x + 2},${y - 9}L${x + 3},${y - 6}C${x + 6},${y - 4} ${x + 7},${y - 1} ${x + 6},${y + 1}L${x + 3},${y}C${x + 1},${y + 2} ${x + 1},${y + 4} ${x + 2},${y + 6}Z" fill="#5a4214" stroke-width=".6"/>`;
  }
  if (s.bust === 'homespun') {
    // a wooden toggle on a cord: no metal
    return `<path d="M${x - 9},${y - 4}L${x + 9},${y + 2}" fill="none" stroke="#c9b27e" stroke-width="1.4"/><rect x="${x - 3}" y="${y - 7}" width="6" height="12" rx="2.6" transform="rotate(-25 ${x} ${y})" fill="#8a5a2c" stroke-width=".9"/>`;
  }
  if (s.bust === 'fur') {
    // a bear's claws on a thong
    return [-10, 0, 10].map((d, i) => `<path d="M${x + d - 3},${y - 3 + Math.abs(d) * .2}C${x + d - 3},${y + 6} ${x + d},${y + 10} ${x + d + 3},${y + 12}C${x + d + 2},${y + 6} ${x + d + 3},${y} ${x + d + 3},${y - 3 + Math.abs(d) * .2}Z" fill="${i === 1 ? '#eee4cc' : '#d9cdb0'}" stroke-width=".8"/>`).join('') +
      `<path d="M${x - 18},${y - 6}Q${x},${y + 2} ${x + 18},${y - 6}" fill="none" stroke="#3a2414" stroke-width="1.2"/>`;
  }
  // the base: a bronze ring brooch with its pin
  return `<circle cx="${x}" cy="${y}" r="8" fill="none" stroke="${INK}" stroke-width="5.2"/><circle cx="${x}" cy="${y}" r="8" fill="none" stroke="#b09048" stroke-width="3.2"/><path d="M${x - 11},${y + 6}L${x + 10},${y - 5}" fill="none" stroke="#c4a868" stroke-width="1.6"/>`;
};

/** The Eriadorian's ochre wool scarf wound at the neck (drawn over the neck). */
const scarf = (c: Ctx): string =>
  mass('M-38,58C-32,50 -18,50 0,52C18,50 32,50 38,58C41,65 33,72 20,72C8,73 -8,73 -20,72C-33,72 -41,65 -38,58Z', '#94763a', 1.1, 'M-38,58C-32,50 -18,50 -8,51C-20,56 -24,64 -20,72C-33,72 -41,65 -38,58Z', c) +
  `<path d="M-34,62Q0,57 34,62" fill="none" stroke-width=".7" opacity=".6"/><path d="M8,55Q24,55 34,59" fill="none" stroke="#e0c080" stroke-width="1.2" opacity=".5"/>`;

/** The fur's hanging tufts along a line of points. */
const tufts = (pts: readonly (readonly [number, number])[], fill: string): string =>
  pts.map(([x, y], i) => `<path d="M${x - 9},${y}C${x - 9},${y + 9} ${x - 3},${y + 13 + (i % 2) * 4} ${x + 1},${y + 17 + (i % 2) * 4}C${x + 2},${y + 10} ${x + 9},${y + 7} ${x + 8},${y - 2}Z" fill="${fill}" stroke-width=".9"/>`).join('');

const bust = (c: Ctx, s: Spec): string => {
  const w = s.wide, B = wx(BODY, w), SH = wx(BODY_SH, w);
  const lap = (d: number): string => wx(`M${-22 * d},58C${-44 * d},58 ${-82 * d},66 ${-104 * d},82C${-118 * d},94 ${-122 * d},118 ${-122 * d},150L${-44 * d},150C${-44 * d},118 ${-36 * d},86 ${-22 * d},58Z`, w);
  const shirt = `<path d="M-20,58L0,96L20,58Z" fill="${LINEN}" stroke-width="1"/><path d="M-20,58L0,96L-4,72Z" fill="${c.url('p')}" stroke="none"/>${c.fine('<path d="M-4,74L4,78M4,74L-4,78M-3,84L3,88M3,84L-3,88" fill="none" stroke-width=".7"/>')}`;
  if (s.bust === 'fur') {
    // leather under a bear-fur mantle with a shaggy edge
    const M = wx('M-128,150L-126,96C-120,70 -96,56 -60,52L-30,54L30,54L60,52C96,56 120,70 126,96L128,150Z', w);
    const pts = ([[-118, 90], [-106, 74], [-92, 64], [-76, 58], [-60, 54], [-44, 54], [44, 54], [60, 54], [76, 58], [92, 64], [106, 74], [118, 90]] as const).map(([x, y]) => [n(x * w), y] as const);
    return `<path d="${B}" fill="${c.url('l')}" stroke-width="1.2"/>` +
      mass(M, c.url('z'), 1.2, wx('M-128,150L-126,96C-120,70 -96,56 -60,52L-40,53C-70,66 -82,104 -80,150Z', w), c, wx('M-128,150L-126,96C-120,74 -104,60 -84,56C-100,74 -106,110 -104,150Z', w)) +
      tufts(pts, '#6a4a30') +
      strands(c, wx('M-110,100C-104,116 -102,132 -104,150M-90,90C-84,108 -84,130 -86,150M-70,84C-64,104 -64,126 -66,150M110,100C104,116 102,132 104,150M90,90C84,108 84,130 86,150M70,84C64,104 64,126 66,150', w), wx('M-80,94C-76,112 -74,130 -76,148M100,96C96,112 94,130 96,148M80,88C76,108 76,128 78,148M60,80C58,100 58,122 60,146', w), '#b08a64');
  }
  if (s.bust === 'homespun') {
    // a russet wool tunic, an ochre scarf wound at the neck, a patch and stitches
    return mass(B, c.url('k'), 1.2, SH, c) +
      c.fine(`<path d="${wx('M-96,96L-78,94L-76,114L-96,116Z', w)}" fill="${dark(s.cloth[1], .15)}" stroke-width=".8"/><path d="${wx('M-96,96L-78,94L-76,114L-96,116Z', w)}" fill="none" stroke="#d9c090" stroke-width=".7" stroke-dasharray="1.6 2.2"/>`) +
      `<path d="${wx('M70,74C88,80 100,92 106,110', w)}" fill="none" stroke="${light(s.cloth[2], .3)}" stroke-width="1.3" opacity=".5"/>` +
      '';
  }
  // leather jerkin, a linen shirt at the throat, the cloak's laps over the shoulders
  const jerk = `<path d="${B}" fill="${c.url('l')}" stroke-width="1.2"/><path d="${SH}" fill="${c.url('p')}" stroke="none"/>` + shirt;
  const mail = s.bust === 'rohan' ? `<path d="${B}" fill="#7c858b" stroke-width="1.2"/><path d="${B}" fill="${c.url('m')}" stroke="none"/><path d="${SH}" fill="${c.url('p')}" stroke="none"/>` : '';
  const laps = mass(lap(1), c.url('k'), 1.3, wx('M-22,58C-44,58 -82,66 -104,82C-118,94 -122,118 -122,150L-74,150C-74,116 -60,80 -30,60Z', w), c, wx('M-22,58C-44,58 -82,66 -104,82C-118,94 -122,118 -122,150L-104,150C-104,118 -96,90 -70,70Z', w)) +
    mass(mir(lap(1)), light(s.cloth[1], .05), 1.3) +
    `<path d="${wx('M40,62C70,64 96,76 108,98', w)}" fill="none" stroke="${light(s.cloth[2], .35)}" stroke-width="1.3" opacity=".55"/>` +
    c.fine(`<path d="${wx('M-96,96C-94,114 -94,132 -96,150M-76,82C-72,104 -72,128 -74,150M96,96C94,114 94,132 96,150M76,82C72,104 72,128 74,150', w)}" fill="none" stroke-width=".6" opacity=".55"/>`);
  const edge = wx('M-24,60C-38,86 -46,118 -46,150', w);
  const trim = s.bust === 'rohan' ? `<path d="${edge}" fill="none" stroke="${GOLD}" stroke-width="2.6"/><path d="${mir(edge)}" fill="none" stroke="${GOLD}" stroke-width="2.6"/><path d="${wx('M-104,82C-80,66 -50,60 -24,60M104,82C80,66 50,60 24,60', w)}" fill="none" stroke="${GOLD}" stroke-width="1.6"/>` : '';
  return (s.bust === 'rohan' ? mail : jerk) + laps + trim;
};

// ---- hair behind the face ----
const sideHair = (c: Ctx, s: Spec): string => {
  if (c.fem && (s.head === 'bare' || s.head === 'hood' || s.head === 'mop')) return flowHair(c, s);
  if (c.fem || s.head === 'helm' || s.head === 'bear') return longHair(c, hairOf(c, s));
  if (s.head === 'mop') return '';
  const j = s.jaw, L = wx(s.head === 'hood' ? 'M-44,-30C-56,-26 -62,-10 -60,6C-64,16 -62,30 -56,42C-58,48 -54,54 -48,56L-36,56L-40,10Z' : 'M-44,-30C-54,-26 -58,-12 -56,0C-60,8 -58,18 -54,24C-56,30 -52,36 -46,38L-40,30L-42,6Z', j);
  return `<path d="${L}" fill="${c.url('h')}" stroke-width="1.1"/><path d="${L}" fill="${c.url('p')}" stroke="none"/><path d="${mir(L)}" fill="${dark(s.hair[1], .08)}" stroke-width="1.1"/>` +
    strands(c, wx('M-54,-12C-58,6 -56,24 -54,44M-48,-6C-52,12 -50,30 -46,50M54,-12C58,6 56,24 54,44M48,-6C52,12 50,30 46,50', j), wx('M-52,-16C-56,0 -54,20 -52,38M52,-16C56,0 54,20 52,38M57,-4C60,10 58,24 56,34', j), s.hair[2]);
};

/**
 * The women's loose hair: locks that wave down behind the face and over the
 * shoulders, tapering to points of different lengths; the shadowed side
 * hatched, the lit side lighter, wavy strands.
 */
const flowHair = (c: Ctx, s: Spec): string => {
  const j = s.jaw, [h0, h1, hi] = s.hair;
  const L = wx('M-42,-30C-60,-28 -70,-10 -66,8C-63,22 -72,34 -70,50C-68,62 -77,74 -73,88C-71,98 -76,106 -80,114C-71,110 -67,104 -65,98C-63,106 -61,112 -60,120C-55,110 -55,100 -53,92C-51,98 -47,103 -42,106C-45,92 -40,78 -43,64C-46,46 -40,28 -42,10Z', j);
  const R = wx('M42,-30C60,-28 70,-10 66,8C63,22 72,34 70,50C68,60 76,70 73,82C71,90 74,96 77,104C69,101 66,96 64,92C62,100 60,108 58,114C54,104 55,96 53,88C51,94 47,98 43,100C46,88 40,76 43,62C46,46 40,28 42,10Z', j);
  return `<path d="${L}" fill="${c.url('h')}" stroke-width="1.1"/><path d="${L}" fill="${c.url('p')}" stroke="none"/><path d="${wx('M-42,-30C-60,-28 -70,-10 -66,8C-63,22 -72,34 -70,50C-68,62 -77,74 -73,88C-71,98 -76,106 -80,114C-72,96 -66,80 -64,60C-62,40 -60,10 -50,-20Z', j)}" fill="${c.url('q')}" stroke="none"/>` +
    `<path d="${R}" fill="${mix(h0, h1, .8)}" stroke-width="1.1"/><path d="${wx('M42,10C40,28 46,46 43,62C40,76 46,88 43,100C48,90 50,74 50,60C52,40 48,24 50,6Z', j)}" fill="${c.url('p')}" stroke="none"/>` +
    strands(c, wx('M-56,-14C-62,4 -56,20 -62,38C-66,56 -60,74 -66,92C-68,100 -70,106 -74,110M-48,2C-52,20 -47,36 -53,54C-57,70 -52,84 -56,100M60,-10C64,8 60,24 64,42C67,58 62,74 66,90M52,6C55,22 50,38 55,56C58,70 54,84 57,100', j),
      wx('M56,-14C62,2 58,18 62,34C66,50 62,64 66,80M50,10C52,26 48,40 52,56M64,46C68,60 66,74 70,90M-60,24C-64,40 -60,56 -64,72', j), hi) +
    c.fine(`<path d="${wx('M58,30q4,6 0,12M62,62q4,6 -1,12M-58,44q-4,6 0,12', j)}" fill="none" stroke="${light(hi, .3)}" stroke-width="1" opacity=".7" stroke-linecap="round"/>`);
};

// ---- the face ----
const FACE_M = 'M-44,-34C-47,-8 -46,16 -41,30C-35,41 -20,47.5 0,48C20,47.5 35,41 41,30C46,16 47,-8 44,-34Z';
const FACE_F = 'M-42,-30C-46,-4 -44,16 -37,29C-29,40 -15,46.5 0,47C15,46.5 29,40 37,29C44,16 46,-4 42,-30Z';
const face = (c: Ctx, s: Spec): string => {
  const j = s.jaw, F = wx(c.fem ? FACE_F : FACE_M, j);
  const sh = c.fem ? wx('M-42,-30C-46,-4 -44,16 -37,29C-31,38 -23,43 -15,46C-29,30 -33,0 -32,-30Z', j) : wx('M-44,-34C-47,-8 -46,16 -41,30C-36,38 -28,44 -18,46C-32,28 -36,0 -34,-34Z', j);
  const edge = c.fem ? wx('M-42,-30C-46,-4 -44,16 -37,29C-41,14 -42,-4 -39,-30Z', j) : wx('M-44,-34C-47,-8 -46,16 -41,30C-44,14 -44,-6 -41,-34Z', j);
  const neck = `<path d="M-17,36L-20,68L20,68L17,36Z" fill="${dark(s.skin[1], .2)}" stroke-width="1"/><path d="M-17,36L-20,68L-6,68L-4,46Z" fill="${c.url('p')}" stroke="none"/>` +
    (c.fem ? `<path d="M-30,64Q0,74 30,64" fill="none" stroke="${s.bust === 'rohan' ? GOLD : '#8a6a3a'}" stroke-width="${s.bust === 'rohan' ? 2.6 : 1}"/>${s.bust === 'rohan' ? '' : `<circle cx="0" cy="70" r="3" fill="${s.bust === 'fur' ? '#c98a2c' : s.bust === 'homespun' ? '#7a3a28' : '#5c7f8c'}" stroke-width=".8"/>`}` : '');
  const jawSh = c.fem ? `<path d="${wx('M-30,38C-20,45 -8,47 0,47C10,47 22,44 30,38C22,46 10,50 0,50C-10,50 -22,46 -30,38Z', j)}" fill="#4e2f20" opacity=".25" stroke="none"/>` : `<path d="${wx('M-34,40C-22,47 -10,48 0,48C12,48 24,46 34,40C24,50 10,53 0,53C-10,53 -24,50 -34,40Z', j)}" fill="#4e2f20" opacity=".3" stroke="none"/>`;
  const ears = (s.head === 'mop' || s.head === 'bare') && !c.fem ? [-1, 1].map((d) => `<path d="${px2(d, 'M-43,-6C-52,-12 -57,-2 -55,8C-53,18 -49,23 -42,21Z', j)}" fill="${d < 0 ? mix(s.skin[0], s.skin[1], .5) : s.skin[1]}" stroke-width="1"/><path d="${px2(d, 'M-46,0C-51,0 -51,10 -46,14', j)}" fill="none" stroke-width=".7"/>`).join('') : '';
  const wr = s.age ? `<path d="M-24,-20C-10,-23 10,-23 24,-20M-30,22C-34,30 -34,36 -32,40M30,22C34,30 34,36 32,40M-6,-14l2,6M6,-14l-2,6" fill="none" stroke-width=".6" opacity="${n(.35 + .4 * s.age)}"/>` : '';
  return neck + ears + `<path d="${F}" fill="${c.url('s')}" stroke-width="1.1"/><path d="${sh}" fill="#4e2f20" opacity=".2" stroke="none"/><path d="${sh}" fill="${c.url('p')}" stroke="none"/><path d="${edge}" fill="${c.url('q')}" stroke="none"/>` +
    `<ellipse cx="-30" cy="18" rx="10" ry="7" fill="#9c4a36" opacity="${s.blush}" stroke="none"/><ellipse cx="31" cy="18" rx="10" ry="7" fill="#b25a44" opacity="${s.blush}" stroke="none"/>${jawSh}` +
    c.fine((s.age ? `<path d="M-18,20C-25,22 -31,28 -34,36M18,20C25,22 31,28 34,36" fill="none" stroke-width=".6" opacity=".6"/>` : '') + wr);
};
/** A left-side path for side `d` (-1 as drawn, 1 mirrored), widened by `j`. */
const px2 = (d: number, p: string, j: number): string => wx(d < 0 ? p : mir(p), j);

// ---- the nose: a Man's, longer and narrower than a dwarf's; the women's as the dwarf women's ----
const nose = (c: Ctx, s: Spec): string => {
  const [sk0, sk1] = s.skin;
  if (c.fem) {
    return `<path d="M-3,-8C-4,4 -8,11 -9,17C-9.5,23 -5,26 0,25.5C5,26 9.5,23 9,17C8,11 4,4 3,-8Z" fill="${mix(sk0, sk1, .7)}" opacity=".55" stroke="none"/><path d="M-3,-8C-4,4 -8,11 -9,17C-9.5,21 -7,23 -5,23.5C-7,16 -5,6 -2,-2Z" fill="${c.url('p')}" stroke="none"/>
<path d="M-3.5,-6C-4.5,4 -8,11 -8.5,17" fill="none" stroke-width=".9"/><ellipse cx="3" cy="15" rx="3.2" ry="5" fill="#f3dcc0" opacity=".5" stroke="none"/>
<path d="M-7.5,21.5q2.3,2.6 5,1.1M7.5,21.5q-2.3,2.6 -5,1.1M-3,24.5q3,1.2 6,0" fill="none" stroke-width=".9"/>`;
  }
  if (s.head === 'mop') {
    // the Eriadorian's: short, round and snub, the nostrils showing, a ruddy ball of a tip
    return `<path d="M-3,6C-5,13 -11,17 -12,23C-12.5,28.5 -6,30.5 0,30C6,30.5 12.5,28.5 12,23C11,17 5,13 3,6Z" fill="${mix(sk0, sk1, .6)}" opacity=".7" stroke="none"/>
<path d="M-3,6C-5,13 -11,17 -12,23C-12.5,27 -9,29.5 -5,30C-8,24 -6,15 -1,9Z" fill="${c.url('p')}" stroke="none"/><ellipse cx="0" cy="24" rx="9" ry="5.5" fill="#a3402c" opacity=".3" stroke="none"/><ellipse cx="3.5" cy="21" rx="4" ry="3.6" fill="#f3dcc0" opacity=".55" stroke="none"/>
<path d="M-11,21.5C-14,24 -12,28.5 -8,29M11,21.5C14,24 12,28.5 8,29" fill="none" stroke-width=".9"/><ellipse cx="-4.5" cy="28" rx="2.4" ry="1.4" fill="#5a2a1c" stroke="none"/><ellipse cx="4.5" cy="28" rx="2.4" ry="1.4" fill="#5a2a1c" stroke="none"/>`;
  }
  // a Man's: long and narrow, drawn by its shade (no outline over the bridge): the shadow side, the alae, the nostrils
  return `<path d="M-4,-4C-5,6 -9,14 -12,21C-14,28 -7,31 0,30.5C7,31 14,28 12,21C9,14 5,6 4,-4Z" fill="${mix(sk0, sk1, .62)}" opacity=".6" stroke="none"/>
<path d="M-4,-4C-5,6 -9,14 -12,21C-14,28 -7,31 -2,30.5C-8,26 -8,14 -2,2Z" fill="${c.url('p')}" stroke="none"/><path d="M-4,-4C-5,6 -9,14 -12,21C-13,25 -10,28 -7,29C-9,22 -6,10 -2,0Z" fill="#4e2f20" opacity=".22" stroke="none"/>
<path d="M-3.5,2C-5,10 -8.5,16 -11,21" fill="none" stroke-width=".9"/>
<ellipse cx="0" cy="24" rx="10" ry="6" fill="#a3402c" opacity=".14" stroke="none"/><ellipse cx="4" cy="17" rx="3.4" ry="6.5" fill="#f3dcc0" opacity=".45" stroke="none"/>
<path d="M-12,21.5C-16,23 -15.5,28.5 -10,29.5M12,21.5C16,23 15.5,28.5 10,29.5" fill="none" stroke-width=".9"/>
<path d="M-8,28.5q2.6,1.8 5.2,.4M8,28.5q-2.6,1.8 -5.2,.4" fill="none" stroke-width="1"/>`;
};

// ---- mouths ----
const lips = (c: Ctx): string =>
  `<path d="M-10,34Q-4.5,30.5 0,32.5Q4.5,30.5 10,34Q4.5,35.5 0,35Q-4.5,35.5 -10,34Z" fill="#a04c3e" stroke-width=".8"/><path d="M-8.5,34.8Q0,42 8.5,34.8Q0,36.2 -8.5,34.8Z" fill="#c06a5a" stroke-width=".8"/>${c.fine('<path d="M1,38.5q2.5,.2 4,-.8" fill="none" stroke="#f6d8c2" stroke-width=".9" opacity=".85"/>')}`;
/** A clean-shaven man's mouth: a firm line, the lower lip, a shadow under it, the furrow above. */
const mouthM = (c: Ctx): string =>
  `<path d="M-12,37Q-5,35.5 0,36.5Q5,35.5 12,37" fill="none" stroke-width="1.2"/><path d="M-8,38.5Q0,43.5 8,38.5Q0,40 -8,38.5Z" fill="#a85a48" stroke-width=".7"/><path d="M-7,44.5Q0,47 7,44.5" fill="none" stroke-width=".6" opacity=".5"/><path d="M-13,36q-1.5,1 -1,2.4M13,36q1.5,1 1,2.4" fill="none" stroke-width=".7" opacity=".7"/>${c.fine('<path d="M-2,31.5l-.8,3M2,31.5l.8,3" fill="none" stroke-width=".5" opacity=".5"/>')}`;
const underlip = '<path d="M-6.5,41Q0,46 6.5,41Q0,43 -6.5,41Z" fill="#8e4a3a" stroke-width=".7"/>';

/** A moustache: the dwarves' two lobes, smaller; `droop` lets the tips fall (the Rohirrim's long one). */
const moustache = (c: Ctx, s: Spec, sc: number, droop: number): string => {
  const [h0, h1, hi] = s.hair;
  const L = `<path d="M0,-3C10,-8 24,-6 34,1C42,${6 + droop * .4} 48,${10 + droop * .7} 52,${16 + droop}C46,${18 + droop} 40,${16 + droop * .6} 34,14C22,15 10,13 0,8Z" fill="${mix(h0, h1, .55)}" stroke-width="1.1"/>` +
    strands(c, `M4,0C14,-3 26,0 38,${6 + droop * .3}M4,3C16,1 28,5 44,${12 + droop * .6}M3,6C14,6 26,9 36,13`, `M8,-1C18,-3 28,0 36,${4 + droop * .3}M8,4.5C20,4.5 30,8 42,${12 + droop * .6}`, hi);
  return `<g transform="translate(0,32.5) scale(${sc})">${L}</g><g transform="translate(0,32.5) scale(${-sc},${sc})">${L}<path d="M0,-3C10,-8 24,-6 34,1C40,5 46,9 50,14C38,11 30,8 22,6C14,3 6,2 0,2Z" fill="${c.url('p')}" stroke="none"/></g>`;
};

// ---- beards ----
const beard = (c: Ctx, s: Spec): string => {
  const j = s.jaw, hi = s.hair[2], H = c.url('h');
  if (s.beard === 'shaggy') {
    // the Beorning's: a huge wild beard in rounded tongues, wider than the face
    const B = 'M-48,6C-56,24 -70,30 -74,44C-66,48 -64,52 -72,62C-64,68 -62,74 -68,86C-58,88 -54,94 -58,106C-46,104 -40,110 -40,122C-30,116 -20,122 -14,132C-8,124 4,124 10,134C14,122 24,118 34,124C34,110 42,104 56,106C52,94 58,86 68,86C62,74 64,68 72,62C64,52 66,48 74,44C70,30 56,24 48,6C40,24 30,32 18,33C10,42 -10,42 -18,33C-30,32 -40,24 -48,6Z';
    const sh = 'M-48,6C-56,24 -70,30 -74,44C-66,48 -64,52 -72,62C-64,68 -62,74 -68,86C-58,88 -54,94 -58,106C-46,104 -40,110 -40,122C-30,116 -20,122 -14,132C-30,100 -40,60 -30,30C-40,24 -44,16 -48,6Z';
    return mass(B, H, 1.2, sh, c, 'M-48,6C-56,24 -70,30 -74,44C-66,48 -64,52 -72,62C-64,68 -62,74 -68,86C-58,88 -54,94 -58,106C-60,80 -58,50 -50,22Z') +
      strands(c, 'M-40,28C-50,40 -56,56 -62,70M-30,38C-36,56 -40,76 -48,98M-16,44C-18,64 -20,90 -28,114M0,46C0,70 -2,96 -4,124M16,44C18,64 22,90 26,116M30,38C36,56 42,78 46,100M40,28C50,40 58,56 62,72M-50,18C-58,28 -64,36 -68,42M50,18C58,28 64,36 68,42',
        'M-24,42C-28,60 -30,84 -36,106M8,46C10,72 10,96 14,122M24,40C30,60 34,82 38,104M44,32C52,46 58,62 62,78M54,20C60,30 66,38 70,44', hi);
  }
  if (s.beard === 'rohan') {
    // the Rohirrim's: a short golden beard under the long moustache
    const B = wx('M-42,12C-46,34 -38,54 -22,66C-12,72 12,72 22,66C38,54 46,34 42,12C38,26 30,34 18,34C12,42 6,45 0,45C-6,45 -12,42 -18,34C-30,34 -38,26 -42,12Z', j);
    return mass(B, H, 1.1, wx('M-42,12C-46,34 -38,54 -22,66C-12,72 -6,72 -2,72C-24,58 -30,40 -28,30C-36,28 -40,22 -42,12Z', j), c) +
      strands(c, wx('M-34,30C-34,44 -28,56 -18,64M-20,40C-18,52 -14,62 -8,68M20,40C18,52 14,62 8,68M34,30C34,44 28,56 18,64', j), wx('M-28,38C-26,50 -22,58 -14,64M28,38C26,50 22,58 14,64M2,48C2,56 2,62 0,68', j), hi);
  }
  // the base and the ranger: short and trimmed along the jaw, the ranger's darker and tighter
  const k = s.beard === 'ranger' ? .9 : 1;
  const B = wx(`M-45,4C-47,28 -40,${46 + 12 * k} -26,${54 + 8 * k}C-14,${60 + 6 * k} 14,${60 + 6 * k} 26,${54 + 8 * k}C40,${46 + 12 * k} 47,28 45,4C42,20 32,30 18,33C13,41 7,45 0,45C-7,45 -13,41 -18,33C-32,30 -42,20 -45,4Z`, j);
  return mass(B, H, 1.1, wx('M-45,4C-47,28 -40,58 -26,62C-16,66 -8,66 -2,66C-24,54 -30,38 -28,30C-36,26 -42,18 -45,4Z', j), c) +
    strands(c, wx('M-42,16C-42,34 -36,48 -24,58M-30,32C-28,44 -22,54 -12,60M30,32C28,44 22,54 12,60M42,16C42,34 36,48 24,58M-4,48C-4,54 -2,58 0,62', j), wx('M-36,26C-36,40 -30,50 -20,56M36,26C36,40 30,50 20,56M8,48C8,54 6,58 4,62', j), hi, .7);
};

// ---- headgear and hair over the face ----
/** The men's cap of hair: the crown, a fringe swept to the side, the locks over the temples. */
const hairCap = (c: Ctx, s: Spec): string => {
  const j = s.jaw;
  const C = wx('M-47,2C-50,-6 -54,-12 -52,-22C-56,-32 -52,-44 -45,-52C-44,-62 -34,-70 -24,-71C-16,-77 -4,-77 3,-73C13,-77 27,-74 33,-67C43,-65 51,-55 50,-45C56,-36 54,-24 51,-16C53,-8 51,-1 47,2C46,-8 43,-18 37,-24C26,-30 12,-30 2,-33C-6,-29 -16,-27 -26,-26C-36,-22 -43,-12 -47,2Z', j);
  return `<path d="${wx('M-2,-32C-9,-28 -12,-22 -11,-15C-7,-20 -3,-25 2,-30Z', j)}" fill="${mix(s.hair[0], s.hair[1], .6)}" stroke-width="1"/>` + mass(C, c.url('h'), 1.2, wx('M-48,6C-54,-28 -40,-70 0,-72C-22,-62 -32,-42 -30,-26C-38,-20 -44,-8 -48,6Z', j), c, wx('M-48,6C-54,-28 -40,-66 -14,-71C-34,-58 -44,-34 -44,-14Z', j)) +
    strands(c, wx('M2,-68C-14,-60 -30,-46 -40,-20M8,-66C-6,-56 -22,-42 -32,-24M14,-66C28,-58 40,-44 44,-20M20,-62C30,-52 38,-40 40,-24M-6,-68C-22,-62 -38,-44 -45,-12', j), wx('M10,-68C26,-62 38,-48 44,-26M4,-60C14,-50 26,-40 34,-28M-2,-64C-12,-56 -22,-44 -28,-30', j), s.hair[2]);
};
/** The Eriadorian's tousled mop: a rounder crown, a fringe of uneven rounded locks. */
const mop = (c: Ctx, s: Spec): string => {
  const j = s.jaw;
  const C = wx('M-49,4C-53,-4 -57,-12 -54,-22C-59,-32 -54,-46 -47,-52C-48,-62 -38,-70 -28,-70C-24,-80 -10,-80 -4,-74C2,-82 18,-80 22,-72C32,-74 44,-66 46,-56C54,-50 58,-36 54,-26C57,-18 55,-6 49,4C47,-6 44,-12 41,-16C37,-12 33,-14 31,-22C27,-17 21,-18 19,-25C15,-20 9,-21 6,-27C2,-22 -4,-22 -8,-28C-12,-22 -18,-22 -21,-27C-24,-21 -30,-20 -33,-24C-37,-16 -42,-14 -45,-16C-47,-8 -48,-2 -49,4Z', j);
  return mass(C, c.url('h'), 1.2, wx('M-49,4C-58,-30 -42,-74 0,-76C-24,-64 -34,-44 -30,-22C-36,-16 -42,-14 -45,-16C-47,-8 -48,-2 -49,4Z', j), c, wx('M-49,4C-58,-30 -42,-70 -16,-75C-38,-58 -46,-34 -46,-12Z', j)) +
    // locks curling out over the ears and the crown
    `<path d="${wx('M-46,-8C-54,-4 -56,4 -52,8C-50,2 -47,-1 -44,-2ZM46,-8C54,-4 56,4 52,8C50,2 47,-1 44,-2Z', j)}" fill="${s.hair[1]}" stroke-width="1"/>` +
    strands(c, wx('M0,-72C-10,-60 -20,-44 -24,-26M10,-70C14,-56 18,-40 18,-26M-20,-66C-32,-54 -40,-36 -42,-18M24,-64C34,-52 40,-36 42,-18', j), wx('M14,-70C24,-60 32,-44 34,-26M4,-66C6,-52 8,-38 6,-28M30,-62C38,-50 44,-34 45,-20', j), s.hair[2]);
};

/** A hood's back (behind the head) and its front fold over the brow, in the cloak's colour. */
const hoodBack = (c: Ctx, s: Spec): string => {
  const H = 'M-80,90C-90,26 -82,-52 -46,-80C-26,-94 26,-94 46,-80C82,-52 90,26 80,90Z';
  return mass(H, c.url('k'), 1.3, 'M-80,90C-90,26 -82,-52 -46,-80C-32,-90 -16,-93 0,-93C-36,-76 -58,-30 -56,90Z', c, 'M-80,90C-90,26 -82,-52 -52,-78C-70,-44 -74,10 -66,90Z') +
    c.fine('<path d="M-66,-30C-72,0 -72,40 -70,76M68,-30C74,0 74,40 72,76" fill="none" stroke-width=".6" opacity=".6"/>') +
    `<path d="M42,-78C66,-60 78,-30 80,4" fill="none" stroke="${light(s.cloth[2], .35)}" stroke-width="1.4" opacity=".5"/>`;
};
const hoodFront = (c: Ctx, s: Spec): string => {
  const fold = 'M-58,50C-64,-12 -46,-64 0,-66C46,-64 64,-12 58,50L50,46C54,-6 38,-52 0,-54C-38,-52 -54,-6 -50,46Z';
  // the shadow the hood casts on the brow and the eyes (the ranger's keen eyes look out of it)
  return `<path d="M-48,-14C-46,-40 -28,-52 0,-53C28,-52 46,-40 48,-14C40,-26 24,-30 0,-30C-24,-30 -40,-26 -48,-14Z" fill="${s.hair[0]}" stroke-width=".9"/>` +
    strands(c, 'M-40,-20C-32,-36 -16,-44 0,-46M10,-46C24,-42 36,-32 42,-20M-20,-38C-28,-30 -34,-22 -38,-14', 'M14,-44C28,-38 38,-28 44,-18M-6,-46C-16,-42 -26,-34 -32,-26', s.hair[2], .6) +
    `<path d="M-50,-6Q0,-40 50,-6L50,6Q0,-24 -50,6Z" fill="#1a1410" opacity="${c.med ? .18 : .26}" stroke="none"/>` +
    mass(fold, c.url('k'), 1.3, 'M-58,50C-64,-12 -46,-64 0,-66L0,-54C-38,-52 -54,-6 -50,46Z', c) +
    `<path d="M6,-62C40,-58 58,-16 55,36" fill="none" stroke="${light(s.cloth[2], .4)}" stroke-width="1.6" opacity=".55"/>`;
};

/** The Rohirrim's helm: a gilded dome, a gold band set with green, a white horsetail crest. */
const helm = (c: Ctx): string =>
  `<path d="M-50,-26C-54,-60 -30,-78 0,-78C30,-78 54,-60 50,-26Z" fill="${c.url('g')}" stroke-width="1.3"/>
<path d="M-50,-26C-54,-60 -30,-78 -4,-78C-22,-68 -30,-50 -29,-26Z" fill="${c.url('p')}" stroke="none"/><path d="M-50,-26C-54,-60 -32,-77 -18,-77C-36,-64 -44,-48 -43,-26Z" fill="${c.url('q')}" stroke="none"/>
<path d="M22,-72C36,-64 46,-52 47,-40C40,-52 32,-62 22,-72Z" fill="#fff4d0" opacity=".4" stroke="none"/>
<path d="M-26,-34C-25,-54 -16,-70 -4,-77M26,-34C25,-54 16,-70 4,-77M0,-78V-36" fill="none" stroke-width=".9"/>
<path d="M-54,-37Q0,-30 54,-37L54,-24Q0,-17 -54,-24Z" fill="${c.url('g')}" stroke-width="1.3"/><path d="M-54,-37Q-28,-34 -20,-33.5L-20,-19.5Q-40,-21 -54,-24Z" fill="${c.url('p')}" stroke="none"/>
<path d="M-50,-30.5Q0,-24 50,-30.5" fill="none" stroke="#2f5a32" stroke-width="2.6"/>
${[-36, -12, 12, 36].map((x) => `<path d="M${x - 4},${n(-29.5 - 3 * (x / 54) ** 2)}L${x},${n(-33.5 - 3 * (x / 54) ** 2)}L${x + 4},${n(-29.5 - 3 * (x / 54) ** 2)}L${x},${n(-25.5 - 3 * (x / 54) ** 2)}Z" fill="#3e7a44" stroke-width=".7"/>`).join('')}
<path d="M-6,-24L0,-14L6,-24Z" fill="${c.url('g')}" stroke-width="1"/>
<ellipse cx="0" cy="-80" rx="6" ry="4" fill="${c.url('g')}" stroke-width="1"/>`;
/** The white horsetail from the helm's crest, thrown back over the lit side (behind the hair there). */
const horsetail = (c: Ctx): string => {
  const T = 'M-4,-82C8,-98 42,-96 62,-74C80,-52 88,-12 86,40C80,22 74,4 66,-8C72,14 74,36 70,62C62,34 56,6 48,-22C42,-46 22,-68 -4,-82Z';
  return mass(T, c.url('w'), 1.2, 'M-4,-82C8,-98 42,-96 62,-74C40,-84 18,-82 -4,-82Z', c) +
    strands(c, 'M4,-86C28,-88 50,-76 62,-54C72,-34 78,-6 80,24M10,-82C32,-80 50,-64 58,-40C64,-20 68,8 68,40', 'M14,-88C38,-86 56,-70 66,-46C74,-26 78,2 80,20M24,-80C42,-72 52,-54 56,-34', '#fffdf6', .9);
};

/** The Beorning's bear-pelt hood: round ears, the bear's brow and muzzle over the forehead, fur falling at the sides. */
const pelt = (c: Ctx): string => {
  const P = 'M-74,88C-88,30 -84,-30 -60,-62C-48,-80 -26,-90 0,-90C26,-90 48,-80 60,-62C84,-30 88,30 74,88Z';
  const ear = (d: number): string => `<circle cx="${d * 46}" cy="-80" r="15" fill="${d < 0 ? '#3e2818' : '#5e4028'}" stroke-width="1.2"/><circle cx="${d * 46}" cy="-79" r="8" fill="#2a1a10" stroke-width=".8"/>`;
  return ear(-1) + ear(1) + mass(P, c.url('z'), 1.3, 'M-74,88C-88,30 -84,-30 -60,-62C-48,-80 -26,-90 0,-90C-40,-76 -58,-30 -54,88Z', c, 'M-74,88C-88,30 -84,-30 -62,-60C-74,-24 -76,30 -64,88Z') +
    strands(c, 'M-66,-30C-72,0 -72,40 -68,80M-58,-50C-66,-20 -66,20 -62,60M66,-30C72,0 72,40 68,80M58,-50C66,-20 66,20 62,60', 'M62,-40C70,-10 72,30 70,70M54,-56C62,-30 64,0 62,30', '#b08a64');
};
const peltFront = (c: Ctx): string =>
  // the bear's brow: a fur ridge across the forehead, the muzzle with its black nose over the centre
  mass('M-54,-16C-58,-50 -34,-70 0,-70C34,-70 58,-50 54,-16C46,-28 26,-34 0,-34C-26,-34 -46,-28 -54,-16Z', c.url('z'), 1.3, 'M-54,-16C-58,-50 -34,-70 0,-70C-26,-60 -34,-44 -32,-30C-42,-28 -48,-24 -54,-16Z', c) +
  mass('M-16,-64C-18,-50 -14,-38 0,-34C14,-38 18,-50 16,-64C10,-68 -10,-68 -16,-64Z', '#b89470', 1.1, 'M-16,-64C-18,-50 -14,-38 0,-34C-6,-44 -8,-56 -6,-67C-10,-67 -14,-66 -16,-64Z', c) +
  `<ellipse cx="0" cy="-40" rx="7" ry="4.6" fill="#120c08" stroke-width=".9"/><circle cx="2" cy="-41.5" r="1.2" fill="#8a8f96" stroke="none"/>` +
  [-1, 1].map((d) => `<path d="M${d * 26},-52q${d * 4},-3 ${d * 8},0q${-d * 4},2.5 ${-d * 8},0Z" fill="#0c0806" stroke-width=".6"/>`).join('') +
  strands(c, 'M-46,-34C-40,-50 -26,-60 -18,-62M46,-34C40,-50 26,-60 18,-62', 'M30,-60C40,-54 48,-44 50,-30M22,-64C30,-62 36,-58 40,-52', '#b08a64');

// ---- the women's headgear over their hair ----
/** The braid crown (the balloon woman's): plaited over the top of the head from temple to temple. */
const crown = (c: Ctx, s: Spec): string => {
  let out = '';
  for (let i = 0; i <= 12; i++) {
    const a = ((200 + (i * 140) / 12) * Math.PI) / 180, x = 45 * Math.cos(a), y = -30 + 42 * Math.sin(a), r = (a * 180) / Math.PI + 90 + (i % 2 ? 38 : -38);
    out += `<ellipse cx="${n(x)}" cy="${n(y)}" rx="8" ry="5" transform="rotate(${n(r)} ${n(x)} ${n(y)})" fill="${i % 2 ? s.hair[0] : s.hair[1]}" stroke-width=".9"/>${c.fine(`<path d="M${n(x - 3)},${n(y - 1)}l5,1" fill="none" stroke="${s.hair[2]}" stroke-width=".7" transform="rotate(${n(r)} ${n(x)} ${n(y)})"/>`)}`;
  }
  return out;
};
/** The women's cap of hair: a centre parting, smooth over the crown. */
const femCap = (c: Ctx, s: Spec): string => {
  const C = 'M-47,0C-50,-8 -54,-14 -52,-24C-55,-34 -50,-46 -42,-54C-38,-62 -26,-67 -14,-66C-8,-69 8,-69 14,-66C26,-67 38,-62 42,-54C50,-46 55,-34 52,-24C54,-14 50,-8 47,0C44,-14 38,-22 30,-26C18,-30 6,-30 0,-27C-6,-30 -18,-30 -30,-26C-38,-22 -44,-14 -47,0Z';
  return mass(C, c.url('h'), 1.2, 'M-47,0C-54,-30 -40,-64 0,-66C-20,-60 -28,-44 -26,-27C-36,-22 -42,-14 -47,0Z', c) +
    `<path d="M0,-65C-1,-50 0,-36 0,-27" fill="none" stroke="${s.hair[0]}" stroke-width="1.4"/>` +
    strands(c, 'M-2,-64C-12,-56 -22,-42 -26,-28M2,-64C12,-56 22,-42 26,-28M-8,-64C-26,-54 -38,-36 -42,-16M8,-64C26,-54 38,-36 42,-16M-4,-62C-16,-50 -30,-36 -36,-22M4,-62C16,-50 30,-36 36,-22M-14,-60C-32,-48 -44,-30 -46,-10M14,-60C32,-48 44,-30 46,-10', 'M6,-62C18,-54 30,-42 34,-28M12,-62C28,-52 40,-36 44,-16M-6,-60C-14,-52 -20,-42 -22,-32', s.hair[2]);
};
/** The Eriadorian woman's russet kerchief, knotted at the nape, spotted with cream. */
const kerchief = (c: Ctx, s: Spec): string => {
  const K = 'M-52,-4C-58,-40 -40,-76 0,-78C40,-76 58,-40 52,-4C46,-20 30,-31 0,-33C-30,-31 -46,-20 -52,-4Z';
  return `<path d="M-50,-8C-62,-2 -70,8 -72,20C-64,14 -58,12 -52,12C-60,22 -62,32 -58,42C-52,30 -48,20 -46,8Z" fill="${s.cloth[0]}" stroke-width="1.1"/>` +
    mass(K, c.url('k'), 1.3, 'M-52,-4C-58,-40 -40,-76 0,-78C-28,-66 -38,-44 -34,-28C-44,-22 -48,-14 -52,-4Z', c) +
    `<path d="M-46,-12C-36,-28 -18,-32 0,-33C18,-32 36,-28 46,-12" fill="none" stroke="${s.cloth[0]}" stroke-width="2"/>` +
    `<g fill="#efe2c2" stroke="none" opacity=".85">${[[-24, -60], [0, -66], [24, -60], [-38, -40], [-12, -48], [12, -48], [38, -40], [-24, -40], [24, -40], [0, -40]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${c.med ? 2.6 : 2}"/>`).join('')}</g>` +
    `<path d="M10,-74C34,-68 50,-46 50,-18" fill="none" stroke="${light(s.cloth[2], .4)}" stroke-width="1.4" opacity=".5"/>`;
};
/** The Rohirrim woman's gold circlet with a green stone. */
const circlet = (c: Ctx): string =>
  `<path d="M-44,-20Q0,-34 44,-20L45,-14Q0,-28 -45,-14Z" fill="${c.url('g')}" stroke-width="1"/><path d="M-5,-28L0,-35L5,-28L0,-21Z" fill="#3e7a44" stroke-width=".9"/>${c.fine('<path d="M-1.5,-29.5L1,-31" fill="none" stroke="#cfe8c4" stroke-width=".9"/>')}`;

/**
 * The shared eye draws three lines under each eye (and one at the outer
 * corner) on every unlashed eye: with the long nose they read as spectacles
 * and age a young face. The unweathered men keep one faint line instead.
 */
const UNDER = /<path d="M-?8,6\.5q-?8,5 -?17,-1M-?6,9\.5q-?7,4 -?14,-\.5M-?10,-3l-?5\.5,-2\.5" fill="none" stroke="#[0-9a-f]+" stroke-width="[\d.]+" stroke-linecap="round" opacity="\.8"\/>/g;
const calm = (c: Ctx, s: Spec, e: string): string =>
  c.fem || s.age ? e : e.replace(UNDER, (m) => { const sg = m.startsWith('<path d="M-8') ? 1 : -1; return `<path d="M${-7 * sg},7q${7.5 * sg},4 ${15 * sg},-.5" fill="none" stroke="${INK}" stroke-width=".5" stroke-linecap="round" opacity=".35"/>`; });

// ---- the whole figure ----
const draw = (s: Spec): Draw => (o) => {
  const c = ctx(o), fem = c.fem;
  const fair = s.head === 'helm'; // blond hair takes the soft pen
  const back = s.head === 'hood' ? pen(c, hoodBack(c, s)) : s.head === 'bear' ? pen(c, pelt(c)) : '';
  const hair = pen(c, sideHair(c, s), fair);
  const skin = pen(c, face(c, s), true);
  const chin = fem ? '' : s.beard === 'none' ? pen(c, mouthM(c), true)
    : pen(c, beard(c, s), fair) + pen(c, underlip, true) + pen(c, s.beard === 'rohan' ? moustache(c, s, .78, 14) : s.beard === 'shaggy' ? moustache(c, s, .86, 6) : moustache(c, s, .62, s.beard === 'ranger' ? 4 : 0), fair);
  const mid = pen(c, nose(c, s) + (fem ? lips(c) : ''), true) +
    pen(c, calm(c, s, eyes(c, { lidFill: dark(s.skin[1], .1), lowFill: s.skin[1], ...s.eye, lash: fem, age: fem ? 0 : s.age, size: fem ? 1.06 : 1 }, s.brow)), true);
  let top = '';
  if (s.head === 'hood') top = pen(c, hoodFront(c, s));
  else if (s.head === 'bear') top = pen(c, (fem ? temples(c, hairOf(c, s)) : '') + peltFront(c));
  else if (s.head === 'helm') top = fem ? pen(c, temples(c, hairOf(c, s)) + femCap(c, s), true) + pen(c, circlet(c)) : pen(c, temples(c, hairOf(c, s)), true) + pen(c, helm(c)) + pen(c, horsetail(c), true);
  else if (s.head === 'mop') top = fem ? pen(c, temples(c, hairOf(c, s))) + pen(c, kerchief(c, s)) : pen(c, mop(c, s));
  else top = fem ? pen(c, temples(c, hairOf(c, s)) + femCap(c, s) + crown(c, s)) : pen(c, hairCap(c, s));
  const fore = (s.bust === 'homespun' ? pen(c, scarf(c)) : '') + (fem || s.head === 'helm' ? pen(c, frontBraids(c, hairOf(c, s)), fair) : '') + pen(c, brooch(c, s));
  return svg(c, defs(c, s), back + pen(c, bust(c, s)) + hair + skin + chin + mid + top + fore);
};

/** Long hair (the women, the Rohirrim and the Beorning men): the parts.ts helpers' options. */
const hairOf = (c: Ctx, s: Spec): HairO => {
  const bear = s.head === 'bear', rohan = s.head === 'helm';
  return {
    near: c.url('h'), cols: s.hair, jaw: s.jaw * (c.fem ? 1 : 1.04), wild: bear || (rohan && c.fem) ? 1 : 0, len: c.fem || bear ? 112 : 96,
    braids: rohan ? { links: c.fem ? 12 : 10, sc: c.fem ? 1.25 : 1.15, x: c.fem ? 52 : 52, top: -18, ring: GOLD }
      : undefined,
  };
};

// ---- the five, the men and the women ----
const BASE: Spec = {
  skin: ['#a87657', '#cfa27f', '#e6c4a0'], hair: ['#3e2a1c', '#74502f', '#d4b98e'], brow: { fill: '#4a3222', hi: '#b09070', sc: .98 }, eye: { iris: '#4a3420', lid: 2.2 },
  head: 'bare', beard: 'short', bust: 'cloak', jaw: 1, wide: 1, cloth: ['#2c3a29', '#4f6243', '#6d805a'], age: 0, blush: .16,
};
const DUNADAN: Spec = {
  ...BASE, skin: ['#8c6650', '#b88e70', '#d8b494'], hair: ['#121010', '#2e2a28', '#8a8f96'], brow: { fill: '#1e1a18', hi: '#6a6e74', sc: 1.1, rot: 6, dy: 1 }, eye: { iris: '#8a98a2', lid: 2.6, low: 1 },
  head: 'hood', beard: 'ranger', bust: 'ranger', jaw: .97, cloth: ['#141d14', '#26362a', '#3e5442'], age: 1, blush: .1,
};
const ERIADORIAN: Spec = {
  ...BASE, skin: ['#a8654e', '#d29a7c', '#eec2a2'], hair: ['#6a4426', '#a8763e', '#ead0a0'], brow: { fill: '#7a5430', hi: '#d8b888', sc: 1.02, rot: -4 }, eye: { iris: '#5a4524', lid: 1.6 },
  head: 'mop', beard: 'none', bust: 'homespun', jaw: 1.06, cloth: ['#5a2a1a', '#8a4428', '#a85e3a'], blush: .42,
};
const ROHIRRIM: Spec = {
  ...BASE, skin: ['#a8806a', '#d6b096', '#f0d4b8'], hair: ['#9a7428', '#e2bf62', '#fff2c0'], brow: { fill: '#c29a48', hi: '#fff0c0', sc: 1.08, rot: 8, dy: 1 }, eye: { iris: '#3f6a8c', lid: 2.4 },
  head: 'helm', beard: 'rohan', bust: 'rohan', cloth: ['#1e3a22', '#2f5a32', '#4a7a48'], blush: .18,
};
const BEORNING: Spec = {
  ...BASE, skin: ['#8e6248', '#bd8c6a', '#dcb08c'], hair: ['#1e140e', '#4a3222', '#a08470'], brow: { fill: '#2a1c14', hi: '#8a6a50', sc: 1.36, rot: 14, dy: 2 }, eye: { iris: '#5a3410', lid: 3, low: 1.6 },
  head: 'bear', beard: 'shaggy', bust: 'fur', jaw: 1.1, wide: 1.3, cloth: ['#2a1a10', '#5a3a24', '#7e5838'], blush: .2,
};
/** The women: the same people, slender brows, younger, no beard. */
const fem = (s: Spec, hair: Spec['hair'], brow: BrowO, eye: EyeO = {}): Spec => ({ ...s, hair, brow: { ...s.brow, thin: true, sc: 1.08, rot: 0, ...brow }, eye: { ...s.eye, ...eye }, age: 0, jaw: s.jaw > 1 ? s.jaw * .94 : .98, wide: s.wide > 1 ? s.wide * .9 : .94, blush: Math.max(.3, s.blush) });
const FEM: Readonly<Record<string, Spec>> = {
  human: fem(BASE, ['#3e2414', '#7a4a2a', '#d8b08a'], { fill: '#5d3e22', hi: '#c8a478' }, { iris: '#5c7f8c' }),
  dunadan: fem(DUNADAN, DUNADAN.hair, { fill: '#1e1a18', rot: 4 }, { low: .6, lid: 2.4 }),
  eriadorian: fem(ERIADORIAN, ['#5e2e18', '#9a5230', '#e8a878'], { fill: '#6a3a20' }, { lid: 1.8 }),
  rohirrim: fem(ROHIRRIM, ROHIRRIM.hair, { fill: '#c29a48', rot: 2 }),
  beorning: fem(BEORNING, ['#24180f', '#563a26', '#b0907a'], { fill: '#2a1c14', thin: false, sc: 1.12, rot: 10 }, { lid: 2.6, low: 1.2 }),
};

const pair = (id: string, m: Spec): Draw => { const dm = draw(m), df = draw(FEM[id]!); return (o) => (o.sex === 'female' ? df(o) : dm(o)); };

export const portraits: PortraitSet = {
  human: pair('human', BASE),
  dunadan: pair('dunadan', DUNADAN),
  eriadorian: pair('eriadorian', ERIADORIAN),
  rohirrim: pair('rohirrim', ROHIRRIM),
  beorning: pair('beorning', BEORNING),
};
