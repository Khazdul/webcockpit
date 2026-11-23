// The dwarves' portraits (stage 77's portrait pass; the style lead's
// drawings, notes/research/portraits/style.md). The base dwarf is the
// balloon dwarf's head (src/weather/balloons/passengers/dwarf.ts: the helm,
// the brows, the living eyes, the moustache lobes, the beard, the braids,
// the mail and the pauldrons) re-composed as a bust for the round frame.
// The three houses are that same figure with one mark pushed hard:
//   longbeard  a vast grey-white beard plaited down the chest, an old face,
//              Durin's blue hood and mantle, silver
//   firebeard  a flame-red beard flaring like fire, red brows in a scowl,
//              a pointed copper helm, oxblood leather
//   broadbeam  the widest jaw and shoulders, a square black beard, a flat
//              heavy helm with cheek guards, great pauldrons; calm, heavy lids
// The women: the same helm or hood, armour, eyes and palette; no beard
// (the house mark moves to the hair: long braids in front of the shoulders,
// in the house's colour), a shorter, softer face with lips, slender brows,
// lashes, braid rings and a gem.

import type { Draw, PortraitSet } from './types';
import { dark, light } from '../../art/engrave';
import { type BrowO, type Ctx, type EyeO, type HairO, INK, baseDefs, braid, ctx, frontBraids, longHair, mix, temples, eyes, lg, mass, mir, n, pen, strands, svg, wx } from './parts';

/** One dwarf: everything a house or a sex changes. */
interface Spec {
  /** The skin: shadow, mid, light. */
  skin: readonly [string, string, string];
  /** Hair and beard: shadow, light, the sheen strands. */
  hair: readonly [string, string, string];
  brow: BrowO;
  eye: EyeO;
  helm: 'helm' | 'hood' | 'spike' | 'great';
  beard: 'full' | 'long' | 'flame' | 'square';
  bust: 'mail' | 'cloak' | 'leather' | 'plate';
  /** The jaw and face width factor. */
  jaw: number;
  /** The shoulders' width factor. */
  wide: number;
  /** The braid rings' metal. */
  ring: string;
  /** Wrinkles (0 young, 1 old). */
  age: number;
}

// ---- the palette ----
const SKIN = ['#92705a', '#c2a085', '#e2c7a8'] as const;
const IRON = ['#30353a', '#596067', '#8c949a'] as const;
const COPPER = ['#4e2a1a', '#8e5532', '#c98b5c'] as const;
const DARKIRON = ['#22262a', '#464c52', '#7a8288'] as const;
const BLUE = ['#1f2c44', '#344b70', '#5b7299'] as const;
const GOLD = '#d8b45a', SILVER = '#d6dbde', BRONZE = '#c4a868';

const defs = (c: Ctx, s: Spec): string => {
  const metal = s.helm === 'spike' ? COPPER : s.helm === 'great' ? DARKIRON : IRON;
  return baseDefs(c) + lg(c, 's', s.skin) + lg(c, 'h', [s.hair[0], s.hair[1]]) + lg(c, 'k', metal, .25) + lg(c, 'u', BLUE, .2) +
    lg(c, 'l', ['#3a1e16', '#5e2c22', '#84463a']) + lg(c, 'v', ['#c9ced2', '#eef1f2']);
};

// ---- the bust: shoulders, mail or plate or cloth, the pauldrons ----
/** The pauldron's lames on side `s` (the balloon dwarf's, larger and moved out to the shoulders). */
const lames = (c: Ctx, s: number, k: number, fill: string, trim: string, count = 3): string => {
  const L = ([[82, 90, 27, 17], [78, 78, 26, 16], [72, 66, 23, 14], [66, 55, 19, 12]] as const).slice(0, count);
  return L.map(([x, y, rx, ry]) => {
    const X = s * x * k, R = rx * k;
    return `<g transform="rotate(${18 * s} ${n(X)} ${y})"><ellipse cx="${n(X)}" cy="${y + 3.5}" rx="${n(R)}" ry="${ry}" fill="${trim}" stroke-width="1.1"/><ellipse cx="${n(X)}" cy="${y}" rx="${n(R)}" ry="${ry - .5}" fill="${fill}" stroke-width="1.1"/>${s < 0 ? `<ellipse cx="${n(X)}" cy="${y}" rx="${n(R)}" ry="${ry - .5}" fill="${c.url('p')}" stroke="none"/>` : `<path d="M${n(X - R * .5)},${n(y - ry * .72)}Q${n(X + R * .5)},${n(y - ry * .9)} ${n(X + R * .85)},${n(y - ry * .1)}" fill="none" stroke="#fff" stroke-width="1.2" opacity=".45"/>`}${c.fine(`<circle cx="${n(X + s * R * .62)}" cy="${n(y + ry * .3)}" r="1.9" fill="#e6cc92" stroke-width=".6"/>`)}</g>`;
  }).join('');
};

const bust = (c: Ctx, s: Spec): string => {
  const w = s.wide;
  const body = wx('M-124,150L-122,100C-116,78 -96,64 -68,58L-34,50L34,50L68,58C96,64 116,78 122,100L124,150Z', w);
  const shadow = wx('M-124,150L-122,100C-116,78 -96,64 -68,58L-34,50L-14,50C-50,62 -66,96 -64,150Z', w);
  if (s.bust === 'cloak') {
    // Durin's blue mantle over mail, a silver clasp at each shoulder
    return `<path d="${body}" fill="#7c858b" stroke-width="1.2"/><path d="${body}" fill="${c.url('m')}" stroke="none"/>` +
      mass(wx('M-124,150L-122,98C-116,74 -96,58 -64,52L-36,46C-50,60 -56,90 -54,150Z', w), c.url('u'), 1.2, wx('M-124,150L-122,98C-116,74 -96,58 -64,52L-48,50C-70,64 -80,100 -78,150Z', w), c) +
      mass(wx('M124,150L122,98C116,74 96,58 64,52L36,46C50,60 56,90 54,150Z', w), c.url('u'), 1.2) +
      c.fine(`<path d="${wx('M-100,80C-96,100 -94,124 -96,150M-80,70C-76,96 -76,124 -78,150M100,80C96,100 94,124 96,150M78,70C74,96 74,124 76,150', w)}" fill="none" stroke-width=".6" opacity=".6"/>`) +
      `<path d="${wx('M80,64C90,72 100,90 104,112', w)}" fill="none" stroke="#9fb2cf" stroke-width="1.3" opacity=".5"/>` +
      `<path d="${wx('M-110,82Q-90,64 -60,56M110,82Q90,64 60,56', w)}" fill="none" stroke="${SILVER}" stroke-width="2"/>` +
      [-1, 1].map((d) => `<circle cx="${n(d * 62 * w)}" cy="58" r="7" fill="${c.url('v')}" stroke-width="1.1"/><path d="M${n(d * 62 * w)},52.5v11M${n(d * 62 * w - 5.5)},58h11" fill="none" stroke="${INK}" stroke-width=".6"/>`).join('');
  }
  const cloth = s.bust === 'leather' ? c.url('l') : '#7c858b';
  let out = `<path d="${body}" fill="${cloth}" stroke-width="1.2"/>${s.bust === 'leather' ? '' : `<path d="${body}" fill="${c.url('m')}" stroke="none"/>`}<path d="${shadow}" fill="${c.url('p')}" stroke="none"/>`;
  if (s.bust === 'leather') {
    // oxblood leather, studded, over a mail collar; copper-rimmed leather pauldrons
    out += c.fine([-96, -82, -68, 68, 82, 96].map((x) => `<circle cx="${n(x * w)}" cy="${n(118 - Math.abs(x) * .25)}" r="2" fill="#e0b070" stroke-width=".5"/>`).join('')) +
      lames(c, -1, w, '#6e3426', c.url('k'), 2) + lames(c, 1, w, '#7e3c2c', c.url('k'), 2);
    return out;
  }
  if (s.bust === 'plate') {
    // a breastplate, a gorget, four great lames a side with gold edges
    out += `<path d="${wx('M-70,150L-72,84C-66,66 -48,56 -30,52L30,52C48,56 66,66 72,84L70,150Z', 1)}" fill="${c.url('k')}" stroke-width="1.3"/><path d="M-70,150L-72,84C-66,66 -48,56 -30,52L-14,52C-40,64 -50,92 -48,150Z" fill="${c.url('p')}" stroke="none"/><path d="M-66,150L-68,86C-62,70 -46,60 -30,56M66,150L68,86C62,70 46,60 30,56" fill="none" stroke="${GOLD}" stroke-width="2"/>` +
      lames(c, -1, w * .94, c.url('k'), GOLD, 4) + lames(c, 1, w * .94, c.url('k'), GOLD, 4);
    return out;
  }
  return out + lames(c, -1, w, c.url('i'), c.url('b')) + lames(c, 1, w, c.url('i'), c.url('b'));
};

// ---- hair behind the face (the balloon's side locks, under the helm) ----
const sideHair = (c: Ctx, s: Spec): string => {
  const j = s.jaw, L = wx('M-46,-24C-58,-22 -66,-10 -64,2C-70,8 -70,20 -65,26C-71,34 -68,48 -59,60L-38,60L-42,10Z', j);
  const hi = s.hair[2];
  if (c.fem) return longHair(c, hairOf(c, s));
  return `<path d="${L}" fill="${c.url('h')}" stroke-width="1.1"/><path d="${L}" fill="${c.url('p')}" stroke="none"/><path d="${mir(L)}" fill="${dark(s.hair[1], .08)}" stroke-width="1.1"/>` +
    strands(c, wx('M-56,-12C-60,4 -58,18 -60,30M-51,-10C-55,8 -53,24 -57,44M56,-12C60,4 58,18 60,30M52,-6C55,10 53,26 57,44', j), wx('M-54,-14C-57,2 -55,16 -58,34M53,-14C57,0 55,14 58,30M59,-6C62,6 60,16 62,24', j), hi);
};

// ---- the face ----
const face = (c: Ctx, s: Spec): string => {
  const j = s.jaw;
  const F = c.fem
    ? wx('M-44,-24C-48,-2 -46,16 -38,29C-30,40 -16,46.5 0,47C16,46.5 30,40 38,29C46,16 48,-2 44,-24Z', j)
    : wx('M-47,-24C-51,-4 -51,22 -44,44L44,44C51,22 51,-4 47,-24Z', j);
  const sh = c.fem ? wx('M-44,-24C-48,-2 -46,16 -38,29C-32,38 -24,43 -16,46C-30,30 -34,0 -33,-24Z', j) : wx('M-47,-24C-51,-4 -51,22 -44,44L-33,44C-41,24 -41,0 -38,-24Z', j);
  const edge = c.fem ? wx('M-44,-24C-48,-2 -46,16 -38,29C-42,14 -43,-4 -40,-24Z', j) : wx('M-47,-24C-51,-4 -51,22 -44,44L-40,44C-46,24 -46,0 -43,-24Z', j);
  const blush = c.fem ? .3 : .16;
  const neck = c.fem ? `<path d="M-16,36L-19,62L19,62L16,36Z" fill="${dark(s.skin[1], .2)}" stroke-width="1"/><path d="M-16,36L-19,62L-6,62L-4,44Z" fill="${c.url('p')}" stroke="none"/><path d="M-34,56Q0,68 34,56L32,64Q0,77 -32,64Z" fill="${c.url('b')}" stroke-width="1.1"/><path d="M-34,56Q-14,63 -8,64L-8,72Q-20,70 -32,64Z" fill="${c.url('p')}" stroke="none"/><circle cx="0" cy="69" r="3.4" fill="#9c2f24" stroke-width=".8"/>` : '';
  // the women's chin and jaw: a soft shadow under the jaw line, the hair framing the temples
  const jawSh = c.fem ? `<path d="${wx('M-30,38C-20,45 -8,47 0,47C10,47 22,44 30,38C22,46 10,50 0,50C-10,50 -22,46 -30,38Z', j)}" fill="#4e2f20" opacity=".25" stroke="none"/><path d="M-8,42Q0,45 8,42" fill="none" stroke-width=".6" opacity=".45"/>` : '';
  const tmp = c.fem ? temples(c, hairOf(c, s)) : '';
  const wr = s.age
    ? `<path d="M-26,-17C-12,-20 12,-20 26,-17M-22,-21C-8,-24 8,-24 22,-21M-34,20C-38,28 -38,34 -36,40M34,20C38,28 38,34 36,40" fill="none" stroke-width=".6" opacity="${n(.4 + .4 * s.age)}"/>`
    : '';
  return neck + `<path d="${F}" fill="${c.url('s')}" stroke-width="1.1"/><path d="${sh}" fill="#4e2f20" opacity=".2" stroke="none"/><path d="${sh}" fill="${c.url('p')}" stroke="none"/><path d="${edge}" fill="${c.url('q')}" stroke="none"/>` +
    `<path d="M${n(-47 * j)},-23Q0,-16 ${n(47 * j)},-23L${n(46.5 * j)},-12Q0,-4 ${n(-46.5 * j)},-12Z" fill="#3d281b" opacity=".3" stroke="none"/>` +
    `<ellipse cx="-30" cy="17" rx="10" ry="7" fill="#9c4a36" opacity="${blush}" stroke="none"/><ellipse cx="31" cy="17" rx="10" ry="7" fill="#b25a44" opacity="${blush}" stroke="none"/>${jawSh}${tmp}` +
    c.fine(`<path d="M-20,20C-27,22 -33,28 -36,36M20,20C27,22 33,28 36,36M-40,2C-43,8 -43,14 -41,20M40,2C43,8 43,14 41,20" fill="none" stroke-width=".6" opacity="${c.fem ? .35 : .75}"/>${wr}`);
};

// ---- the nose (the balloon's; shorter and finer for the women) ----
const nose = (c: Ctx, s: Spec): string => {
  const [sk0, sk1] = s.skin;
  if (c.fem) {
    return `<path d="M-3,-8C-4,4 -9,11 -10,17C-10.5,23 -5,26 0,25.5C5,26 10.5,23 10,17C9,11 4,4 3,-8Z" fill="${mix(sk0, sk1, .7)}" opacity=".55" stroke="none"/><path d="M-3,-8C-4,4 -9,11 -10,17C-10.5,21 -8,23 -6,23.5C-8,16 -6,6 -2,-2Z" fill="${c.url('p')}" stroke="none"/>
<path d="M-3.5,-6C-4.5,4 -8.5,11 -9.5,17" fill="none" stroke-width=".9"/><ellipse cx="3" cy="15" rx="3.5" ry="5" fill="#f3dcc0" opacity=".5" stroke="none"/><ellipse cx="0" cy="21" rx="9" ry="5" fill="#a3402c" opacity=".12" stroke="none"/>
<path d="M-8.5,21.5q2.5,2.8 5.5,1.2M8.5,21.5q-2.5,2.8 -5.5,1.2M-3,24.5q3,1.2 6,0" fill="none" stroke-width=".9"/>`;
  }
  const t = 'scale(1)';
  return `<g transform="${t}"><path d="M-5,-10C-7,2 -15,8 -17,18C-18.5,28 -9,34.5 0,33.5C9,34.5 18.5,28 17,18C15,8 7,2 5,-10Z" fill="${mix(sk0, sk1, .62)}" stroke-width="1.1"/>
<path d="M-17,18.5C-22,19.5 -22,28.5 -15,29M17,18.5C22,19.5 22,28.5 15,29" fill="${dark(sk1, .12)}" stroke-width="1"/>
<ellipse cx="-1" cy="23" rx="13" ry="8.5" fill="#a3402c" opacity="${c.fem ? .1 : .17}" stroke="none"/><ellipse cx="5.5" cy="16" rx="5" ry="7" fill="#f3dcc0" opacity=".42" stroke="none"/>
<path d="M-5,-10C-7,2 -15,8 -17,18C-18.5,28 -9,34.5 -3,33.5C-10,28 -10,16 -3,4Z" fill="${c.url('p')}" stroke="none"/>
<path d="M-11,31q3.5,2.5 7,.5M11,31q-3.5,2.5 -7,.5" fill="none" stroke-width="1.1"/>${c.fine('<path d="M-2,8q3,6 1.5,13M7,24q3,-1 4,-4" fill="none" stroke-width=".5" opacity=".6"/>')}</g>`;
};
// ---- the women's mouth ----
const lips = (c: Ctx): string =>
  `<path d="M-10,34Q-4.5,30.5 0,32.5Q4.5,30.5 10,34Q4.5,35.5 0,35Q-4.5,35.5 -10,34Z" fill="#a04c3e" stroke-width=".8"/><path d="M-8.5,34.8Q0,42 8.5,34.8Q0,36.2 -8.5,34.8Z" fill="#c06a5a" stroke-width=".8"/><path d="M-11,33.5q-1,.8 -.5,1.6M11,33.5q1,.8 .5,1.6" fill="none" stroke-width=".6" opacity=".6"/>${c.fine('<path d="M1,38.5q2.5,.2 4,-.8" fill="none" stroke="#f6d8c2" stroke-width=".9" opacity=".85"/>')}`;

// ---- beards ----
const beard = (c: Ctx, s: Spec): string => {
  const j = s.jaw, hi = s.hair[2], H = c.url('h');
  if (s.beard === 'long') {
    // the Longbeard's: broad, white, past the frame; a great plait down the middle with silver rings
    const B = 'M-62,18C-74,60 -70,112 -50,160L50,160C70,112 74,60 62,18C32,40 -32,40 -62,18Z';
    return mass(B, H, 1.2, 'M-62,18C-74,60 -70,112 -50,160L-30,160C-50,110 -54,62 -44,34Z', c, 'M-62,18C-74,60 -70,112 -50,160L-44,160C-62,110 -64,62 -56,26Z') +
      strands(c, 'M-50,40C-50,80 -44,120 -34,156M-36,44C-36,80 -32,120 -24,156M36,44C36,80 32,120 24,156M50,40C50,80 44,120 34,156M-58,60C-58,90 -54,120 -46,150M58,60C58,90 54,120 46,150', 'M-44,44C-44,80 -38,120 -30,156M44,44C44,80 38,120 30,156M-56,40C-58,70 -56,110 -46,140M54,40C56,70 54,110 44,140M-26,46C-24,80 -20,120 -16,150M26,46C24,80 20,120 16,150', hi) +
      '';
  }
  if (s.beard === 'flame') {
    // the Firebeard's: flaring out and up at the sides like a fire, tongues of red and orange
    const B = 'M-56,18C-64,28 -78,30 -84,24C-80,38 -72,44 -66,46C-78,54 -88,56 -94,52C-88,70 -76,76 -66,76C-74,90 -80,98 -86,100C-72,108 -60,104 -52,98C-50,112 -40,124 -26,130C-20,140 -8,146 0,150C8,146 20,140 26,130C40,124 50,112 52,98C60,104 72,108 86,100C80,98 74,90 66,76C76,76 88,70 94,52C88,56 78,54 66,46C72,44 80,38 84,24C78,30 64,28 56,18C30,40 -30,40 -56,18Z';
    const sh = 'M-56,18C-64,28 -78,30 -84,24C-80,38 -72,44 -66,46C-78,54 -88,56 -94,52C-88,70 -76,76 -66,76C-74,90 -80,98 -86,100C-72,108 -60,104 -52,98C-50,112 -40,124 -26,130C-38,110 -46,80 -44,34Z';
    return mass(B, H, 1.2, sh, c) +
      strands(c, 'M-50,40C-60,46 -70,48 -80,46M-50,56C-62,66 -74,70 -84,66M-46,74C-54,86 -64,94 -76,98M-34,48C-34,74 -30,100 -20,126M34,48C34,74 30,100 20,126M50,40C60,46 70,48 80,46M50,56C62,66 74,70 84,66M46,74C54,86 64,94 76,98M-14,48C-12,80 -8,110 0,140M14,48C12,80 8,110 4,136',
        'M-48,34C-58,38 -68,38 -76,32M-52,50C-64,58 -76,60 -86,56M-50,68C-58,78 -68,84 -78,86M-26,50C-24,80 -18,106 -10,130M26,50C24,80 18,106 10,130M48,34C58,38 68,38 76,32M52,50C64,58 76,60 86,56M50,68C58,78 68,84 78,86M44,86C42,100 36,112 26,122M-4,50C-2,80 0,110 2,138', hi) +
      c.fine('<path d="M-66,46C-60,50 -56,56 -54,62M-66,76C-60,80 -56,88 -54,94M66,46C60,50 56,56 54,62M66,76C60,80 56,88 54,94" fill="none" stroke-width=".7" opacity=".7"/>');
  }
  if (s.beard === 'square') {
    // the Broadbeam's: black, cut square and broad as a door, a gold clasp band
    const B = wx('M-60,18C-68,50 -68,96 -64,150L64,150C68,96 68,50 60,18C32,40 -32,40 -60,18Z', j);
    return mass(B, H, 1.2, wx('M-60,18C-68,50 -68,96 -64,150L-42,150C-48,100 -48,56 -42,34Z', j), c, wx('M-60,18C-68,50 -68,96 -64,150L-56,150C-60,100 -60,56 -54,26Z', j)) +
      strands(c, wx('M-48,40C-52,66 -48,100 -50,150M-34,46C-38,72 -33,104 -36,140M-18,48C-21,76 -16,104 -19,150M18,48C15,70 20,100 17,146M34,46C38,74 33,106 36,150M48,40C52,68 47,104 50,150M-56,36C-60,60 -57,90 -59,120', j), wx('M-42,50C-45,74 -40,100 -43,124M-26,52C-28,70 -24,92 -27,112M30,52C28,74 32,96 29,118M44,46C47,72 43,98 46,126M56,34C59,58 56,84 58,110', j), hi, .45) +
      `<path d="${wx('M-62,96Q0,104 62,96L62,108Q0,116 -62,108Z', j)}" fill="${c.url('b')}" stroke-width="1.1"/><path d="${wx('M-62,96Q-30,100 -20,101L-20,113Q-40,111 -62,108Z', j)}" fill="${c.url('p')}" stroke="none"/>${c.fine(`<path d="${wx('M-60,102Q0,110 60,102', j)}" fill="none" stroke="#8a6a2a" stroke-width=".8" stroke-dasharray="2 2.5"/>`)}`;
  }
  // the base dwarf's: the balloon's beard, longer, brown
  const B = wx('M-56,22C-62,58 -50,104 0,130C50,104 62,58 56,22C30,42 -30,42 -56,22Z', j);
  return mass(B, H, 1.2, wx('M-56,22C-62,58 -50,104 0,130C-30,100 -44,60 -42,32Z', j), c, wx('M-56,22C-62,58 -54,92 -36,112C-50,86 -54,56 -50,28Z', j)) +
    `<path d="M-10,42C-9,70 -4,100 0,126C4,100 9,70 10,42Z" fill="${light(s.hair[1], .35)}" opacity=".35" stroke="none"/>` +
    strands(c, 'M-46,40C-44,64 -34,88 -14,110M-34,44C-32,66 -24,90 -6,116M-20,46C-20,66 -14,92 0,120M20,46C20,66 14,92 0,120M34,44C32,66 24,88 8,114M46,40C44,64 36,86 18,108', 'M-27,45C-26,64 -20,84 -8,104M27,45C26,64 20,84 8,104M-8,47C-8,66 -4,86 0,106M-41,46C-39,60 -34,76 -26,90M41,46C39,60 34,76 26,90M14,46C13,62 9,82 4,100', hi);
};

// ---- the moustache (the balloon's two lobes) ----
const lobe = (c: Ctx, s: Spec, droop: number): string => {
  const [h0, h1, hi] = s.hair;
  const L = `<path d="M0,-3C10,-9 25,-7 37,1C47,7 57,8 66,${14 + droop}C57,${19.5 + droop} 46,${21 + droop * .6} 38,18C24,18 10,15 0,9Z" fill="${mix(h0, h1, .55)}" stroke-width="1.1"/>` +
    strands(c, 'M4,0C16,-4 30,0 46,10M4,3C18,0 32,5 52,14M3,6C16,5 30,10 44,16M12,-4C24,-5 36,2 50,9', 'M8,-2C20,-5 32,-1 42,5.5M10,4.5C22,4.5 34,8.5 48,14.5M6,8C16,9 26,12 36,15.5', hi);
  return `<g transform="translate(0,31)">${L}</g><g transform="translate(0,31) scale(-1,1)">${L}<path d="M0,-3C10,-9 25,-7 37,1C47,7 57,8 66,14C52,12 40,8 30,6C18,3 8,2 0,2Z" fill="${c.url('p')}" stroke="none"/></g>`;
};
const flameLobe = (c: Ctx, s: Spec): string => {
  // the Firebeard's moustache sweeps up into points
  const [h0, h1, hi] = s.hair;
  const L = `<path d="M0,-3C12,-10 26,-8 38,-2C48,2 58,-4 68,-14C66,0 56,12 42,16C28,18 12,15 0,9Z" fill="${mix(h0, h1, .6)}" stroke-width="1.1"/>` +
    strands(c, 'M4,0C18,-4 32,0 48,2M4,4C18,2 34,6 54,0M12,-4C26,-6 40,-2 58,-8', 'M8,-2C22,-5 34,-1 46,0M10,5C24,5 36,7 52,2M6,8C18,9 28,11 38,12', hi);
  return `<g transform="translate(0,31)">${L}</g><g transform="translate(0,31) scale(-1,1)">${L}<path d="M0,-3C12,-10 26,-8 38,-2C48,2 58,-4 68,-14C52,-2 40,4 30,6C18,3 8,2 0,2Z" fill="${c.url('p')}" stroke="none"/></g>`;
};
/** The lower lip under the moustache (the men). */
const underlip = '<path d="M-7,41Q0,47 7,41Q0,43 -7,41Z" fill="#8e4a3a" stroke-width=".7"/>';

// ---- headgear ----
const rivets = (c: Ctx, k: number): string => c.fine(`<g fill="#7a6232" stroke-width=".7">${[-46, -31, -16, 16, 31, 46].map((x) => { const y = -25 - 4.5 * (x / 56) ** 2; return `<circle cx="${n(x * k)}" cy="${n(y)}" r="2.2"/><circle cx="${n(x * k + .6)}" cy="${n(y - .7)}" r=".7" fill="#e9d6a4" stroke="none"/>`; }).join('')}</g>`);

/** The balloon dwarf's helm: an iron dome with a ridge, a bronze brow band, rivets, a knob; the men's has the nasal. */
const helm = (c: Ctx, nasal: boolean): string =>
  `<path d="M-53,-24C-56,-58 -32,-74 0,-74C32,-74 56,-58 53,-24Z" fill="${c.url('k')}" stroke-width="1.3"/>
<path d="M-53,-24C-56,-58 -32,-74 -4,-74C-22,-64 -30,-48 -29,-24Z" fill="${c.url('p')}" stroke="none"/><path d="M-53,-24C-56,-58 -32,-74 -18,-73C-36,-62 -44,-46 -43,-24Z" fill="${c.url('q')}" stroke="none"/>
<path d="M24,-68C38,-61 47,-49 48,-38C41,-50 33,-60 24,-68Z" fill="#fff" opacity=".28" stroke="none"/>
<path d="M-28,-34C-27,-54 -17,-67 -5,-73M28,-34C27,-54 17,-67 5,-73" fill="none" stroke-width=".9"/>
<path d="M-6,-32C-6,-56 -4,-69 0,-75C4,-69 6,-56 6,-32Z" fill="#6c747a" stroke-width="1"/>
<path d="M12,-71.5C34,-69 53,-54 50.5,-36" fill="none" stroke="#ffe7b8" stroke-width="1" opacity=".6"/>
${c.fine('<path d="M35,-50l5,3M16,-58l3,4l3,-2M-14,-48l4,2M38,-42l3,5" fill="none" stroke-width=".6" opacity=".7"/>')}
<ellipse cx="0" cy="-76" rx="5.5" ry="3.6" fill="${c.url('b')}" stroke-width="1"/>
<path d="M-56.5,-35Q0,-29 56.5,-35L56.5,-23Q0,-16 -56.5,-23Z" fill="${c.url('b')}" stroke-width="1.3"/>
<path d="M-56.5,-35Q-28,-32 -20,-31.5L-20,-18.5Q-40,-20 -56.5,-23Z" fill="${c.url('p')}" stroke="none"/>
${c.fine('<path d="M-55,-31.5Q0,-25.5 55,-31.5M-55,-25.5Q0,-18.8 55,-25.5" fill="none" stroke-width=".5" opacity=".75"/>')}
${nasal ? `<path d="M-5.5,-21L-4,-7Q0,-3.5 4,-7L5.5,-21Z" fill="${c.url('b')}" stroke-width="1.1"/>` : `<path d="M-5,-25L0,-18L5,-25L0,-31Z" fill="#9c2f24" stroke-width=".9"/><path d="M-1,-27.5L1.5,-28.5" fill="none" stroke="#f5c4b0" stroke-width=".9"/>`}
${rivets(c, 1)}`;

/** The Firebeard's helm: a tall copper cone, bronze-banded, no nasal (the scowl shows). */
const spike = (c: Ctx): string =>
  `<path d="M-54,-24C-56,-50 -34,-80 0,-104C34,-80 56,-50 54,-24Z" fill="${c.url('k')}" stroke-width="1.3"/>
<path d="M-54,-24C-56,-50 -34,-80 0,-104C-20,-78 -30,-52 -28,-24Z" fill="${c.url('p')}" stroke="none"/><path d="M-54,-24C-56,-50 -34,-80 -8,-100C-30,-76 -42,-52 -42,-24Z" fill="${c.url('q')}" stroke="none"/>
<path d="M6,-96C26,-80 44,-58 47,-38C38,-58 24,-78 6,-96Z" fill="#ffd8a8" opacity=".3" stroke="none"/>
<path d="M-26,-30C-24,-56 -14,-78 -2,-98M26,-30C24,-56 14,-78 2,-98" fill="none" stroke-width=".9"/>
<path d="M-50,-52Q0,-62 50,-52L48,-46Q0,-56 -48,-46Z" fill="${c.url('b')}" stroke-width="1"/>
<path d="M-57,-35Q0,-29 57,-35L57,-22Q0,-15 -57,-22Z" fill="${c.url('b')}" stroke-width="1.3"/><path d="M-57,-35Q-28,-32 -20,-31.5L-20,-18Q-40,-19.5 -57,-22Z" fill="${c.url('p')}" stroke="none"/>
${c.fine('<path d="M-55,-31Q0,-25 55,-31M-55,-25.5Q0,-18.5 55,-25.5" fill="none" stroke-width=".5" opacity=".75"/>')}
<path d="M-7,-38L0,-46L7,-38L0,-30Z" fill="#a33a22" stroke-width="1"/>${rivets(c, 1)}`;

/** The Broadbeam's helm: low, flat-crowned, wide, heavy cheek guards, a gold-edged brim. */
const great = (c: Ctx, k: number, fem: boolean): string => {
  const D = wx('M-60,-22C-62,-56 -46,-70 0,-71C46,-70 62,-56 60,-22Z', k);
  const cheek = wx(fem ? 'M-62,-24L-48,-24L-48,8Q-54,14 -62,10Z' : 'M-62,-24L-47,-24L-46,22Q-54,30 -63,24Z', k);
  return `<path d="${cheek}" fill="${c.url('k')}" stroke-width="1.3"/><path d="${cheek}" fill="${c.url('p')}" stroke="none"/><path d="${mir(cheek)}" fill="${c.url('k')}" stroke-width="1.3"/>
<path d="${D}" fill="${c.url('k')}" stroke-width="1.4"/><path d="${wx('M-60,-22C-62,-56 -46,-70 -4,-71C-26,-62 -34,-46 -32,-22Z', k)}" fill="${c.url('p')}" stroke="none"/>
<path d="${wx('M-48,-58Q0,-66 48,-58', k)}" fill="none" stroke="${GOLD}" stroke-width="1.6"/><path d="${wx('M20,-68C40,-64 52,-54 54,-40', k)}" fill="none" stroke="#fff" stroke-width="1.2" opacity=".35"/>
<path d="M-7,-70L-7,-34L7,-34L7,-70Z" fill="${c.url('k')}" stroke-width="1"/>
<path d="${wx('M-64,-38Q0,-31 64,-38L64,-22Q0,-14 -64,-22Z', k)}" fill="${c.url('k')}" stroke-width="1.4"/><path d="${wx('M-64,-38Q0,-31 64,-38', k)}" fill="none" stroke="${GOLD}" stroke-width="1.8"/><path d="${wx('M-64,-22Q0,-14 64,-22', k)}" fill="none" stroke="${GOLD}" stroke-width="1.8"/>
<path d="${wx('M-64,-38Q-30,-34 -20,-33.5L-20,-17Q-40,-19 -64,-22Z', k)}" fill="${c.url('p')}" stroke="none"/>
${c.fine(`<g fill="${GOLD}" stroke-width=".6">${[-52, -36, -20, 20, 36, 52].map((x) => `<circle cx="${n(x * k)}" cy="${n(-29 - 3 * (x / 60) ** 2)}" r="2"/>`).join('')}</g>`)}`;
};

/** Durin's blue hood: the back behind the head, the rim over the brow, a silver circlet with a white gem. */
const hoodBack = (c: Ctx): string => {
  const H = 'M-76,70C-84,20 -78,-46 -44,-72C-24,-86 24,-86 44,-72C78,-46 84,20 76,70Z';
  return mass(H, c.url('u'), 1.3, 'M-76,70C-84,20 -78,-46 -44,-72C-30,-82 -14,-85 0,-85C-34,-70 -56,-30 -54,70Z', c, 'M-76,70C-84,20 -78,-46 -50,-70C-66,-40 -70,10 -64,70Z') +
    c.fine('<path d="M-64,-30C-70,0 -70,30 -68,60M66,-30C72,0 72,30 70,60M-40,-70C-50,-56 -56,-40 -58,-24" fill="none" stroke-width=".6" opacity=".6"/>') +
    '<path d="M40,-72C62,-56 74,-30 76,0" fill="none" stroke="#9fb2cf" stroke-width="1.4" opacity=".5"/>';
};
const hoodRim = (c: Ctx): string =>
  `<path d="M-58,40C-64,-14 -46,-58 0,-60C46,-58 64,-14 58,40" fill="none" stroke-width="2.2"/><path d="M-53,34C-58,-14 -40,-53 0,-55" fill="none" stroke="${BLUE[0]}" stroke-width="3" opacity=".7"/><path d="M8,-56C40,-52 58,-14 54,30" fill="none" stroke="#9fb2cf" stroke-width="1.6" opacity=".55"/>
<path d="M-48,-24Q0,-34 48,-24L47,-18Q0,-28 -47,-18Z" fill="${c.url('v')}" stroke-width=".9"/><path d="M-5,-30L0,-37L5,-30L0,-23Z" fill="#eef4f8" stroke-width=".9"/><path d="M-1.5,-31.5L1,-33" fill="none" stroke="#fff" stroke-width="1"/>
${c.fine('<g fill="#eef4f8" stroke="none">' + [-36, -24, -12, 12, 24, 36].map((x) => `<circle cx="${x}" cy="${n(-22 - 8 * (1 - (x / 48) ** 2))}" r="1.1"/>`).join('') + '</g>')}`;

// ---- the whole figure ----
const draw = (s: Spec): Draw => (o) => {
  const c = ctx(o);
  const back = s.helm === 'hood' ? pen(c, hoodBack(c)) : '';
  const head = s.helm === 'helm' ? helm(c, !c.fem) : s.helm === 'spike' ? spike(c) : s.helm === 'great' ? great(c, s.jaw * 1.04, c.fem) : hoodRim(c);
  const fore = c.fem ? frontBraids(c, hairOf(c, s)) : menBraids(c, s);
  const mo = c.fem ? lips(c) : (s.beard === 'flame' ? flameLobe(c, s) : lobe(c, s, s.beard === 'long' ? 10 : 0));
  const pale = s.beard === 'long'; // white hair takes the soft pen too
  const body = back + pen(c, bust(c, s)) + pen(c, sideHair(c, s), pale) + pen(c, face(c, s), true) +
    (c.fem ? '' : pen(c, beard(c, s), pale) + pen(c, underlip, true)) +
    (c.fem ? '' : pen(c, mo, pale)) + pen(c, nose(c, s) + (c.fem ? mo : ''), true) +
    pen(c, eyes(c, { lidFill: dark(s.skin[1], .1), lowFill: s.skin[1], ...s.eye, lash: c.fem, age: s.age, size: c.fem ? 1.06 : 1 }, s.brow), true) +
    pen(c, head) + pen(c, fore, pale);
  return svg(c, defs(c, s), body);
};

/** The men's braids: two from the beard's flanks (the balloon's), more for the houses that boast them. */
const menBraids = (c: Ctx, s: Spec): string => {
  if (s.beard === 'long') return braid(c, -50, 66, 8, 1.15, s.hair, s.ring) + braid(c, 50, 66, 8, 1.15, s.hair, s.ring);
  if (s.beard === 'flame') return braid(c, -44, 74, 5, 1.1, s.hair, s.ring) + braid(c, 44, 74, 5, 1.1, s.hair, s.ring) + braid(c, -66, 40, 4, .95, s.hair, s.ring) + braid(c, 66, 40, 4, .95, s.hair, s.ring);
  if (s.beard === 'square') return braid(c, -58 * s.jaw, 46, 6, 1.1, s.hair, s.ring) + braid(c, 58 * s.jaw, 46, 6, 1.1, s.hair, s.ring);
  return braid(c, -42, 64, 5, 1.15, s.hair, s.ring) + braid(c, 42, 64, 5, 1.15, s.hair, s.ring);
};
/** The women's hair: long, parted, two thick braids from under the headgear down the front of the shoulders (where the men's beard falls). */
const hairOf = (c: Ctx, s: Spec): HairO => ({
  near: c.url('h'), cols: s.hair, jaw: s.jaw, wild: s.beard === 'flame' ? 1 : 0,
  braids: { links: s.beard === 'long' ? 15 : s.beard === 'square' ? 11 : 12, x: s.beard === 'square' ? 56 * s.jaw : 54, sc: s.beard === 'square' ? 1.5 : 1.35, top: s.helm === 'hood' ? -6 : -16, ring: s.ring },
});

// ---- the four houses, the men and the women ----
const BASE: Spec = {
  skin: SKIN, hair: ['#4a2f23', '#80543b', '#d6ccb9'], brow: {}, eye: {}, helm: 'helm', beard: 'full', bust: 'mail', jaw: 1, wide: 1, ring: '#e0bb55', age: 0,
};
const LONG: Spec = {
  ...BASE, skin: ['#94776a', '#c6a892', '#e6d0b8'], hair: ['#9d978c', '#e2ddd2', '#fbf8f0'], brow: { fill: '#d8d2c6', hi: '#fbf8f0', sc: 1.3, dy: 1 }, eye: { iris: '#3c5270', lid: 2.8 },
  helm: 'hood', beard: 'long', bust: 'cloak', ring: SILVER, age: 1,
};
const FIRE: Spec = {
  ...BASE, skin: ['#9a6a52', '#c8967a', '#e8bc9c'], hair: ['#7a2410', '#c4501e', '#f3a24c'], brow: { fill: '#b8461c', hi: '#f6b060', rot: 16, dy: 2, sc: 1.3 }, eye: { lid: 3.6, low: 2.2, iris: '#4a2a12' },
  helm: 'spike', beard: 'flame', bust: 'leather', ring: BRONZE,
};
const BROAD: Spec = {
  ...BASE, skin: ['#86644e', '#b38f74', '#d6b394'], hair: ['#161312', '#3a3330', '#8a8f96'], brow: { fill: '#2a2422', hi: '#8a8f96', sc: 1.22, dy: 1.5 }, eye: { lid: 4, iris: '#2a1c12' },
  helm: 'great', beard: 'square', bust: 'plate', jaw: 1.16, wide: 1.32, ring: GOLD,
};
/** The women: the same house, a finer brow (the Firebeard keeps a fierce one), younger, no beard. */
const fem = (s: Spec, brow: BrowO, eye: EyeO = {}): Spec => ({ ...s, brow: { ...s.brow, thin: true, sc: 1.1, ...brow }, eye: { ...s.eye, ...eye }, age: s.age ? .3 : 0, jaw: s.jaw === 1 ? .98 : s.jaw * .96 });
const FEM: Readonly<Record<string, Spec>> = {
  dwarf: fem({ ...BASE, hair: ['#5a3624', '#8e5c3e', '#e0c9a8'] }, { fill: '#6e4a34', hi: '#d9b894' }),
  longbeard: fem(LONG, { fill: '#cfc8ba', dy: 0, sc: 1.12 }, { lid: 2 }),
  firebeard: fem(FIRE, { fill: '#b8461c', thin: false, sc: 1.08, rot: 12 }, { lid: 3, low: 1.6 }),
  broadbeam: fem(BROAD, { fill: '#2a2422', dy: 1 }, { lid: 3.4 }),
};

const pair = (id: string, m: Spec): Draw => { const dm = draw(m), df = draw(FEM[id]!); return (o) => (o.sex === 'female' ? df(o) : dm(o)); };

export const portraits: PortraitSet = {
  dwarf: pair('dwarf', BASE),
  longbeard: pair('longbeard', LONG),
  firebeard: pair('firebeard', FIRE),
  broadbeam: pair('broadbeam', BROAD),
};
