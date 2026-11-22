// The orcs' portraits (stage 77's portrait pass, notes/research/portraits/
// style.md, built on the dwarves' parts). The base orc is the balloon orc's
// head (src/weather/balloons/passengers/orc.ts: the iron cap and nasal, the
// notched ears, the slanting ember eyes under a heavy brow, the broad flat
// nose, the wide mouth of uneven teeth, black scale and hide) with an
// olive-grey skin, lank black hair and two lower tusks. The three houses are
// that figure with one mark pushed hard:
//   tarkhnarb  the balloon goblin: tunnel-born, smaller, bald and pale
//              yellow-green, vast bat ears, great round yellow night eyes,
//              a hooked nose over a fanged mouth, sacking and a ragged collar
//   morruhk    the snuffler: a great pig-like snout, pale ritual scars in
//              rows on the cheeks, a warg's pelt for a hood (its ears, its
//              muzzle and fangs over the brow) and a warg-fur mantle
//   zaugurz    the far north: the balloon orc's sallow skin, the iron cap
//              rimmed in snow-white fur with war spikes, a vast white fur
//              mantle, the red rake of blood daubed across both cheeks,
//              a scar, a mouth of many teeth; the wide fearless stare
// The women: the same headgear, armour, palette and house mark; narrower
// face to a rounded chin, a neck with a necklace, dark full lips (the tusks
// smaller, still there), slender scowling brows, lashes, long black hair in
// braids (the Tarkhnarb's lank and loose).

import type { Draw, PortraitSet } from '../../../../../src/panes/portraits/types';
import { dark, light } from '../../../../../src/art/engrave';
import { type BrowO, type Ctx, type EyeO, type HairCols, type HairO, INK, baseDefs, brow, ctx, eye, frontBraids, longHair, mix, temples, lg, mass, mir, n, pen, strands, svg, wx } from '../parts';

type House = 'orc' | 'tark' | 'morr' | 'zaug';

/** One orc: everything a house or a sex changes. */
interface Spec {
  house: House;
  /** The skin: shadow, mid, light. */
  skin: readonly [string, string, string];
  hair: HairCols;
  /** The clothes' leather: shadow, mid, light. */
  cloth: readonly [string, string, string];
  /** The fur (mantle, hood, collar): shadow, light. */
  fur: readonly [string, string];
  /** The eye whites (never white; an orc's are yellowed). */
  white: string;
  eye: EyeO;
  brow: BrowO;
  jaw: number;
  wide: number;
  /** The braid rings. */
  ring: string;
}

// ---- the palette ----
const IRON = ['#26292c', '#50565b', '#8a9197'] as const;
const BONE = '#e4dabd', RUST = '#8a4a2a', BLOOD = '#8e1c12';
const BLACK: HairCols = ['#161312', '#3a3330', '#8a8f96'];

const defs = (c: Ctx, s: Spec): string =>
  baseDefs(c) + lg(c, 's', s.skin) + lg(c, 'h', [s.hair[0], s.hair[1]]) + lg(c, 'k', IRON, .25) + lg(c, 'l', s.cloth) + lg(c, 'w', s.fur) +
  `<radialGradient id="${c.id('y')}" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#f2e48a"/><stop offset=".6" stop-color="#dcc452"/><stop offset="1" stop-color="#a88a2c"/></radialGradient><clipPath id="${c.id('gc')}"><circle r="12"/></clipPath>` +
  (c.med
    ? `<pattern id="${c.id('sc')}" patternUnits="userSpaceOnUse" width="4" height="4"><rect width="4" height="4" fill="#8a9197" opacity=".12"/></pattern><pattern id="${c.id('wv')}" patternUnits="userSpaceOnUse" width="4" height="4"><rect width="4" height="4" fill="${INK}" opacity=".08"/></pattern>`
    : `<pattern id="${c.id('wv')}" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(8)"><path d="M0,1H5M1.5,0V5M0,3.5H5M4,0V5" fill="none" stroke="${INK}" stroke-width=".5" opacity=".32"/></pattern><pattern id="${c.id('sc')}" patternUnits="userSpaceOnUse" width="9" height="7"><path d="M0,0Q4.5,8 9,0M-4.5,3.5Q0,11.5 4.5,3.5M4.5,3.5Q9,11.5 13.5,3.5" fill="none" stroke="#8a9197" stroke-width=".8" opacity=".5"/></pattern>`);

// ---- fur: tufted edges ----
/** A tufted run through `pts`: each step hooks out to the left of the direction of travel (outward on a clockwise outline). */
const tuft = (pts: readonly (readonly [number, number])[], amp: number): string => {
  let d = '';
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!, [x1, y1] = pts[i]!, dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
    const a = amp * [1, .7, 1.25, .85][i % 4]!, nx = dy / L, ny = -dx / L;
    d += `Q${n(x0 + dx * .2 + nx * a)},${n(y0 + dy * .2 + ny * a)} ${n(x0 + dx * .62 + nx * a * 1.15)},${n(y0 + dy * .62 + ny * a * 1.15)}Q${n(x0 + dx * .8 + nx * a * .2)},${n(y0 + dy * .8 + ny * a * .2)} ${n(x1)},${n(y1)}`;
  }
  return d;
};
/** Points along a function from x0 to x1 in `k` steps. */
const along = (x0: number, x1: number, k: number, y: (x: number) => number): [number, number][] =>
  Array.from({ length: k + 1 }, (_, i) => { const x = x0 + (x1 - x0) * i / k; return [n(x), n(y(x))] as [number, number]; });

/** Short fur tufts (strokes) scattered over a mass: ink at Large, the light ones at both sizes. */
const furStrokes = (c: Ctx, pts: readonly (readonly [number, number])[], hi: string, len = 7): string => {
  let d = '', l = '';
  pts.forEach(([x, y], i) => {
    const a = (i * 47) % 30 - 15, r = (a * Math.PI) / 180, dx = Math.sin(r) * len, dy = Math.cos(r) * len;
    (i % 2 ? l += `M${n(x)},${n(y)}q${n(dx * .3 + 1.5)},${n(dy * .5)} ${n(dx)},${n(dy)}` : d += `M${n(x)},${n(y)}q${n(dx * .3 - 1.5)},${n(dy * .5)} ${n(dx)},${n(dy)}`);
  });
  return strands(c, d, l, hi, .7);
};

// ---- the bust ----
const BODY = 'M-124,150L-122,100C-116,78 -96,64 -68,58L-34,50L34,50L68,58C96,64 116,78 122,100L124,150Z';
const BODYSH = 'M-124,150L-122,100C-116,78 -96,64 -68,58L-34,50L-14,50C-50,62 -66,96 -64,150Z';

/** The balloon orc's iron pauldron with two spikes, on the viewer's left (the shadow side). */
const ironPauldron = (c: Ctx, w: number): string => {
  const X = -84 * w;
  return `<g transform="rotate(-14 ${n(X)} 76)"><path d="M${n(X - 22)},66L${n(X - 30)},36L${n(X - 10)},60Z" fill="${c.url('k')}" stroke-width="1.2"/><path d="M${n(X + 2)},60L${n(X + 2)},30L${n(X + 14)},58Z" fill="${c.url('k')}" stroke-width="1.2"/>
<ellipse cx="${n(X)}" cy="76" rx="34" ry="18" fill="${c.url('k')}" stroke-width="1.3"/><ellipse cx="${n(X)}" cy="76" rx="34" ry="18" fill="${c.url('p')}" stroke="none" opacity=".8"/><ellipse cx="${n(X)}" cy="76" rx="27" ry="12.5" fill="none" stroke-width=".7" opacity=".7"/>
<ellipse cx="${n(X + 10)}" cy="69" rx="11" ry="3.5" fill="${RUST}" opacity=".45" stroke="none"/>${c.fine(`<g fill="#b4babd" stroke-width=".5"><circle cx="${n(X - 22)}" cy="79" r="1.9"/><circle cx="${n(X)}" cy="88" r="1.9"/><circle cx="${n(X + 22)}" cy="80" r="1.9"/></g>`)}</g>`;
};
/** A hide pauldron, laced, on the viewer's right. */
const hidePauldron = (c: Ctx, w: number): string => {
  const P = wx('M46,62C70,54 106,62 116,90L108,96C96,80 76,74 60,78Z', w);
  return `<path d="${P}" fill="#5a4a3a" stroke-width="1.2"/><path d="${wx('M54,62C74,56 100,64 110,82', w)}" fill="none" stroke="#b7a27a" stroke-width="1.1" opacity=".5"/>${c.fine(`<path d="${wx('M62,62L64,70M72,60L74,69M82,61L84,70M92,64L93,73M101,70L101,78', w)}" fill="none" stroke-width=".7" opacity=".8"/>`)}`;
};

/** The neck: thick for the men, slender for the women and the Tarkhnarb. */
const neck = (c: Ctx, s: Spec): string => {
  const thin = c.fem || s.house === 'tark';
  const N = thin ? 'M-17,34L-20,66Q0,72 20,66L17,34Z' : wx('M-30,30L-34,64Q0,74 34,64L30,30Z', s.jaw);
  const NS = thin ? 'M-17,34L-20,66Q-12,69 -6,70L-4,44Z' : wx('M-30,30L-34,64Q-24,68 -16,70L-12,40Z', s.jaw);
  return `<path d="${N}" fill="${dark(s.skin[1], .22)}" stroke-width="1"/><path d="${NS}" fill="${c.url('p')}" stroke="none"/>${thin ? '' : c.fine('<path d="M-14,50q2,8 1,16M14,50q-2,8 -1,16" fill="none" stroke-width=".6" opacity=".6"/>')}`;
};

/** The women's necklace: a cord of teeth and claws (bone is the orcs' gold), a red stone for the base. */
const necklace = (c: Ctx, s: Spec): string => {
  const cord = '<path d="M-24,56Q0,72 24,56" fill="none" stroke-width="1.1"/>';
  const xs = [-16, -8, 0, 8, 16];
  const teeth = xs.map((x) => { const y = 56 + 16 * (1 - (x / 24) ** 2) * .5 + .5; const h = x === 0 ? 9 : 6.5; return `M${n(x - 2.2)},${n(y)}L${n(x + (x < 0 ? -1 : 1) * .8)},${n(y + h)}L${n(x + 2.2)},${n(y)}Z`; }).join('');
  if (s.house === 'zaug') return `<path d="M-30,50Q0,70 30,50L33,59Q0,80 -33,59Z" fill="#7a2018" stroke-width="1.2"/><path d="M-26,56Q0,72 26,56" fill="none" stroke="#c0574a" stroke-width=".8" opacity=".6"/>`;
  return cord + `<path d="${teeth}" fill="${BONE}" stroke-width=".7"/>` + (s.house === 'orc' ? `<circle cx="0" cy="66" r="3.2" fill="#9c2f24" stroke-width=".8"/>` : '');
};

const bust = (c: Ctx, s: Spec): string => {
  const w = s.wide, B = wx(BODY, w), BS = wx(BODYSH, w);
  let out = `<path d="${B}" fill="${c.url('l')}" stroke-width="1.2"/><path d="${BS}" fill="${c.url('p')}" stroke="none"/>`;
  const scale = `<path d="M-60,150L-58,84Q0,66 58,84L60,150Z" fill="#2a2b2e" stroke-width="1.2"/><path d="M-60,150L-58,84Q0,66 58,84L60,150Z" fill="${c.url('sc')}" stroke="none"/><path d="M-60,150L-58,84Q-30,74 -20,72C-34,92 -38,120 -36,150Z" fill="${c.url('p')}" stroke="none"/>`;
  const strap = `<path d="M40,72L56,80L-30,150L-54,150Z" fill="#3a2a1c" stroke-width="1.1"/>${c.fine('<g fill="#9aa0a4" stroke-width=".5"><circle cx="40" cy="84" r="1.9"/><circle cx="20" cy="101" r="1.9"/><circle cx="0" cy="118" r="1.9"/><circle cx="-20" cy="135" r="1.9"/></g>')}`;
  if (s.house === 'tark') {
    // stolen sacking with fat crooked stitches, a sewn-on patch, a strap with a looted ring, a ragged fur collar
    out += `<path d="${B}" fill="${c.url('wv')}" stroke="none"/><path d="${wx('M-124,150L-122,100C-116,80 -104,70 -90,64C-100,84 -104,116 -102,150Z', w)}" fill="${c.url('q')}" stroke="none"/>` +
      `<path d="M58,104L88,98L92,128L62,134Z" fill="#6a5a3c" stroke-width="1"/><path d="M58,104L88,98L92,128L62,134Z" fill="${c.url('wv')}" stroke="none"/>${c.fine('<path d="M61,108l3,-2M66,107l2,-3M72,106l2,-3M78,104l2,-3M84,103l2,-3M90,110l-3,1M90,118l-3,1M64,132l2,-3M72,131l2,-3M80,130l2,-3" fill="none" stroke="#d6c59a" stroke-width=".9"/>')}` +
      `<path d="M1,80V150" fill="none" stroke-width=".9"/>${c.fine('<path d="M-4,90l10,5M-4,102l10,5M-4,114l10,5M-4,126l10,5" fill="none" stroke="#d6c59a" stroke-width="1.3"/>')}` +
      `<path d="M30,66L44,72L-26,150L-44,150Z" fill="#2e2216" stroke-width="1.1"/><rect x="-4" y="104" width="13" height="12" rx="2" transform="rotate(-46 2.5 110)" fill="none" stroke="#b9a25e" stroke-width="2"/>` +
      neck(c, s);
    const top = along(-62, 62, 13, (x) => 56 + 9 * (x / 62) ** 2);
    const C = 'M-62,92' + `L${top[0]![0]},${top[0]![1]}` + tuft(top, 5) + 'L62,92' + tuft(along(62, -62, 13, (x) => 82 - 8 * (1 - (x / 62) ** 2)), 6) + 'Z';
    out += mass(C, c.url('w'), 1.1, 'M-62,92L-62,57C-50,60 -36,62 -24,63L-30,82Z', c) + furStrokes(c, along(-54, 54, 12, (x) => 66 + 6 * (x / 54) ** 2), light(s.fur[1], .4), 9);
    return out + (c.fem ? necklace(c, s) : '');
  }
  if (s.house === 'morr') {
    out += neck(c, s) + (c.fem ? necklace(c, s) : '');
    // the warg-fur mantle over both shoulders, its tufted top rising beside the neck; a bone toggle, a cord of claws
    const side = (sg: number): string => {
      const pts = along(-30 * w, -128 * w, 9, (x) => { const t = (x + 30 * w) / (-98 * w); return 50 + 10 * t + 34 * t * t; });
      const M = `M-36,150L-34,96C-32,76 -32,60 -30,50` + `L${pts[0]![0]},${pts[0]![1]}` + tuft(pts, -6) + `L${n(-128 * w)},150Z`;
      const d = sg < 0 ? M : mir(M);
      const sh = sg < 0 ? `<path d="M-128,150L-128,96C-110,74 -86,66 -64,62C-80,80 -86,110 -84,150Z" fill="${c.url('p')}" stroke="none"/>` : '';
      const st = furStrokes(c, along(-44 * w, -116 * w, 9, (x) => 70 + 18 * ((x + 44 * w) / (-72 * w)) ** 2).concat(along(-50 * w, -110 * w, 6, () => 108)).map(([x, y]) => [sg < 0 ? x : -x, y] as [number, number]), light(s.fur[1], .45), 9);
      return `<path d="${d}" fill="${c.url('w')}" stroke-width="1.2"/>${sh}${st}`;
    };
    const claws = c.fem ? '' : `<path d="M-36,66Q0,84 36,66" fill="none" stroke-width="1.1"/><path d="${[-24, -12, 0, 12, 24].map((x) => { const y = 66 + 18 * (1 - (x / 36) ** 2) * .5; return `M${x - 2.4},${n(y)}C${x - 2},${n(y + 6)} ${x + 1},${n(y + 9)} ${x + 4},${n(y + 10)}C${x + 2},${n(y + 6)} ${x + 2.4},${n(y + 3)} ${x + 2.4},${n(y)}Z`; }).join('')}" fill="${BONE}" stroke-width=".7"/>`;
    return out + claws + side(-1) + side(1) + `<rect x="-5" y="88" width="10" height="22" rx="4" fill="${BONE}" stroke-width="1"/>${c.fine('<path d="M-3,94h6M-3,104h6" fill="none" stroke-width=".6"/>')}`;
  }
  out += scale + strap + neck(c, s);
  if (s.house === 'zaug') {
    out += c.fem ? necklace(c, s) : `<path d="M-34,50Q0,72 34,50L37,60Q0,84 -37,60Z" fill="#7a2018" stroke-width="1.2"/><path d="M-30,57Q0,76 30,57" fill="none" stroke="#c0574a" stroke-width=".8" opacity=".6"/>`;
    return out;
  }
  out += c.fem ? necklace(c, s) : `<path d="M-38,52Q0,72 38,52L42,62Q0,84 -42,62Z" fill="${c.url('k')}" stroke-width="1.2"/><path d="M-38,52Q-14,62 -8,63L-8,73Q-24,70 -42,62Z" fill="${c.url('p')}" stroke="none"/><ellipse cx="18" cy="64" rx="8" ry="3" fill="${RUST}" opacity=".45" stroke="none"/>`;
  return out + ironPauldron(c, w) + hidePauldron(c, w);
};

/** The Zaugurz's snow-white mantle: a great fur on both shoulders, rising beside the jaw (soft pen). */
const snowMantle = (c: Ctx, s: Spec): string => {
  const w = s.wide;
  {
    const side = (sg: number): string => {
      const pts: [number, number][] = [[-36, 52], [-50, 30], [-60, 40], [-74, 44], [-88, 54], [-102, 62], [-114, 74], [-124, 88], [-130, 104]];
      const M = 'M-40,150C-44,120 -44,80 -36,52' + tuft(pts.map(([x, y]) => [n(x * w), y] as [number, number]), -7) + `L${n(-130 * w)},150Z`;
      const d = sg < 0 ? M : mir(M);
      const sh = sg < 0 ? `<path d="${wx('M-130,150L-130,104C-118,80 -96,62 -72,52C-86,76 -92,110 -90,150Z', w)}" fill="${c.url('p')}" stroke="none"/><path d="${wx('M-130,150L-130,104C-124,92 -116,82 -108,74C-114,96 -116,124 -114,150Z', w)}" fill="${c.url('q')}" stroke="none"/>` : `<path d="${wx('M60,44C82,48 108,64 124,90', w)}" fill="none" stroke="#fff" stroke-width="1.6" opacity=".5"/>`;
      const st = furStrokes(c, ([[-46, 60], [-58, 52], [-70, 58], [-84, 64], [-96, 72], [-108, 82], [-52, 84], [-66, 80], [-80, 88], [-94, 96], [-110, 104], [-54, 110], [-72, 112], [-90, 120], [-106, 128], [-58, 136], [-80, 140]] as [number, number][]).map(([x, y]) => [(sg < 0 ? x : -x) * w, y] as [number, number]), '#ffffff', 9);
      return `<path d="${d}" fill="${c.url('w')}" stroke-width="1.2"/>${sh}${st}`;
    };
    return side(-1) + side(1);
  }
};

// ---- hair ----
/** The men's lank black hair from under the cap, behind the ears, down to the shoulders. */
const sideHair = (c: Ctx, s: Spec): string => {
  const j = s.jaw, L = wx('M-44,-30C-58,-26 -64,-10 -64,8C-66,26 -68,44 -74,62L-52,60C-50,40 -46,16 -46,-4Z', j);
  return `<path d="${L}" fill="${c.url('h')}" stroke-width="1.1"/><path d="${L}" fill="${c.url('p')}" stroke="none"/><path d="${mir(L)}" fill="${dark(s.hair[1], .08)}" stroke-width="1.1"/>` +
    strands(c, wx('M-56,-18C-60,6 -60,30 -66,56M-50,-10C-54,14 -54,36 -60,58M56,-18C60,6 60,30 66,56M50,-10C54,14 54,36 60,58', j), wx('M-60,-8C-62,16 -63,36 -68,54M60,-12C63,10 63,34 68,54M54,0C57,20 57,40 62,56', j), s.hair[2]);
};
/** The Tarkhnarb woman's hair, as the goblin's: short, thin and wild, a ragged tuft round the head behind the ears. */
const tarkBack = (c: Ctx, s: Spec): string => {
  const pts = ([[-44, -40], [-52, -62], [-38, -84], [-14, -94], [10, -94], [34, -86], [52, -64], [48, -40], [58, -20], [62, 0], [56, 18], [40, 24], [-40, 24], [-56, 18], [-62, 0], [-58, -20], [-44, -40]] as [number, number][]).map(([x, y]) => [n(x * s.jaw), y] as [number, number]);
  const H = `M${pts[0]![0]},${pts[0]![1]}` + tuft(pts, 7) + 'Z';
  return `<path d="${H}" fill="${dark(s.hair[1], .05)}" stroke-width="1.1"/><path d="${wx('M-44,-40C-52,-62 -38,-84 -14,-94C-30,-76 -40,-50 -46,0C-50,10 -54,16 -56,18C-62,0 -62,-20 -44,-40Z', s.jaw)}" fill="${c.url('p')}" stroke="none"/>` +
    strands(c, wx('M-50,-30C-56,-14 -58,2 -56,14M-40,-70C-50,-56 -54,-40 -54,-26M50,-30C56,-14 58,2 56,14M40,-70C50,-56 54,-40 54,-26', s.jaw), wx('M-56,-20C-60,-6 -60,6 -58,14M54,-24C58,-8 60,4 58,14M30,-84C42,-74 48,-60 50,-46', s.jaw), s.hair[2], .7);
};
/** Over the bald crown: thin hair with a ragged fringe of tufts. */
const crownHair = (c: Ctx, s: Spec): string => {
  const fr = along(47, -47, 9, (x) => -40 + 14 * (x / 47) ** 2);
  const H = wx(`M-47,-26C-52,-62 -30,-84 0,-84C30,-84 52,-62 47,-26` + tuft(fr, 5) + 'Z', s.jaw);
  return `<path d="${H}" fill="${c.url('h')}" stroke-width="1.1"/><path d="${wx('M-47,-26C-52,-62 -30,-84 -4,-84C-24,-72 -32,-56 -30,-38C-38,-34 -44,-30 -47,-26Z', s.jaw)}" fill="${c.url('p')}" stroke="none"/>` +
    strands(c, wx('M-2,-82C-12,-74 -24,-60 -30,-44M-4,-72C-10,-64 -14,-54 -16,-44M4,-82C14,-74 26,-60 32,-44M6,-72C12,-64 16,-54 18,-42', s.jaw), wx('M-6,-80C-18,-70 -28,-56 -36,-40M8,-80C20,-70 30,-56 38,-38M2,-70C4,-60 4,-50 2,-42', s.jaw), s.hair[2], .8) +
    `<path d="M-6,-83C-8,-92 -14,-96 -20,-96M4,-84C6,-93 11,-98 17,-99M14,-82C19,-86 24,-87 29,-85" fill="none" stroke-width="${c.med ? .8 : 1}"/>`;
};

// ---- ears ----
/** The orc's ear on side `sg`: a notched lump pointing back and up, a ring in one (the balloon's). */
const ear = (c: Ctx, s: Spec, sg: number): string => {
  if (s.house === 'tark') {
    // the goblin's vast bat ear, out to the rim
    const E = 'M-5,-12C12,-23 33,-29 52,-25C45,-12 28,6 -3,12Z';
    return `<g transform="translate(${n(34 * s.jaw * sg)},-4) scale(${1.32 * sg},1.32)"><path d="${E}" fill="${c.url('s')}" stroke-width="1.3"/><path d="M1,-9C14,-17 30,-21 43,-20C36,-11 23,0 2,6Z" fill="${dark(s.skin[0], .2)}" stroke-width=".8"/>
<path d="M1,-9C14,-17 30,-21 43,-20C30,-15 16,-9 4,-2Z" fill="${c.url('p')}" stroke="none"/><path d="M-3,12C10,8 22,0 30,-6C22,4 10,10 -3,12Z" fill="${c.url('q')}" stroke="none"/>${sg < 0 ? `<path d="${E}" fill="#4a4626" opacity=".3" stroke="none"/><path d="${E}" fill="${c.url('p')}" stroke="none"/>` : `<path d="M14,-20C26,-24 38,-26 48,-24" fill="none" stroke="${light(s.skin[2], .4)}" stroke-width="1" opacity=".6"/>`}${c.fine('<path d="M8,-5C17,-10 26,-13 35,-15M9,1C16,-2 22,-6 28,-10" fill="none" stroke-width=".6" opacity=".7"/>')}
${sg > 0 ? '<path d="M30,-8.5L34,-4L37,-10.5" fill="#170f0a" stroke-width=".9"/>' : `<circle cx="24" cy="3.5" r="3.6" fill="none" stroke-width="2.2"/><circle cx="24" cy="3.5" r="3.6" fill="none" stroke="#b9a25e" stroke-width="1"/>`}</g>`;
  }
  const j = s.jaw, torn = (s.house === 'morr') === (sg < 0);
  const E = wx(torn ? 'M40,-14C48,-22 58,-26 66,-26C66,-20 64,-16 62,-12L56,-10L61,-5L53,-1L57,4C53,10 46,12 40,10Z' : 'M40,-14C48,-22 58,-26 66,-26C66,-16 63,-8 58,-2L62,2L54,5C51,10 46,12 40,10Z', j);
  const I = wx('M44,-10C50,-16 56,-20 62,-22C59,-14 55,-8 50,-4Z', j);
  const ring = (s.house === 'zaug' ? sg > 0 : sg < 0) || c.fem ? `<circle cx="${n(50 * j)}" cy="10" r="4.4" fill="none" stroke-width="2.4"/><circle cx="${n(50 * j)}" cy="10" r="4.4" fill="none" stroke="${s.house === 'morr' ? BONE : '#9aa2a8'}" stroke-width="1.1"/>` : '';
  const body = `<path d="${E}" fill="${sg < 0 ? mix(s.skin[0], s.skin[1], .4) : s.skin[1]}" stroke-width="1.2"/><path d="${I}" fill="${dark(s.skin[0], .35)}" opacity=".6" stroke="none"/>${sg < 0 ? `<path d="${E}" fill="${c.url('p')}" stroke="none"/>` : `<path d="${wx('M46,-18C52,-22 58,-24 64,-24', j)}" fill="none" stroke="${light(s.skin[2], .4)}" stroke-width="1" opacity=".6"/>`}${ring}`;
  return sg < 0 ? `<g transform="scale(-1,1)">${body}</g>` : body;
};

// ---- the face ----
/** The face outline from the left top corner round the chin to the right top; `dome` closes it over a bald crown. */
const faceD = (c: Ctx, s: Spec, dome: boolean): string => {
  const j = s.jaw, taper = c.fem || s.house === 'tark';
  const sides = taper
    ? 'M-43,-28C-48,-8 -47,14 -39,28C-31,40 -16,46.5 0,47C16,46.5 31,40 39,28C47,14 48,-8 43,-28'
    : 'M-44,-28C-50,-10 -52,10 -47,26C-42,38 -24,46 0,46C24,46 42,38 47,26C52,10 50,-10 44,-28';
  return wx(sides + (dome ? 'C48,-60 26,-80 0,-80C-26,-80 -48,-60 -43,-28Z' : 'Z'), j);
};
const face = (c: Ctx, s: Spec): string => {
  const j = s.jaw, taper = c.fem || s.house === 'tark';
  const F = faceD(c, s, s.house === 'tark');
  const sh = wx(taper ? 'M-43,-28C-48,-8 -47,14 -39,28C-33,37 -25,43 -16,46C-30,30 -34,0 -32,-28Z' : 'M-44,-28C-50,-10 -52,10 -47,26C-42,38 -28,44 -16,46C-32,32 -36,4 -34,-28Z', j);
  const edge = wx(taper ? 'M-43,-28C-48,-8 -47,14 -39,28C-43,12 -44,-8 -39,-28Z' : 'M-44,-28C-50,-10 -52,10 -47,26C-48,10 -46,-10 -40,-28Z', j);
  const domeSh = s.house === 'tark' ? `<path d="${wx('M-43,-28C-48,-60 -26,-80 -4,-80C-22,-70 -30,-54 -30,-28Z', j)}" fill="${c.url('p')}" stroke="none"/><path d="${wx('M-43,-28C-48,-60 -26,-80 -16,-79C-32,-68 -38,-52 -37,-28Z', j)}" fill="${c.url('q')}" stroke="none"/><path d="${wx('M18,-76C30,-70 40,-58 42,-44C36,-56 28,-68 18,-76Z', j)}" fill="#fff" opacity=".25" stroke="none"/>` : '';
  const blush = c.fem ? .26 : .14;
  // the brow ridge: a heavy shelf of shadow over the eyes, a furrow between them
  const ridge = `<path d="${wx('M-45,-24Q-22,-28 0,-16Q22,-28 45,-24L45,-8Q22,-14 0,-4Q-22,-14 -45,-8Z', j)}" fill="#2a1a10" opacity="${c.fem ? .22 : .34}" stroke="none"/>` +
    (c.fem ? '' : `<path d="M-38,-14Q-22,-20 -7,-11M38,-14Q22,-20 7,-11" fill="none" stroke-width=".8" opacity=".7"/>`) + c.fine(`<path d="M-3,-15q-1,5 0,9M3,-15q1,5 0,9" fill="none" stroke-width=".6" opacity=".7"/>`);
  const lines = c.fine(c.fem
    ? '<path d="M-18,20C-25,22 -30,27 -33,33M18,20C25,22 30,27 33,33" fill="none" stroke-width=".5" opacity=".35"/>'
    : `<path d="M-18,18C-27,21 -33,27 -36,35M18,18C27,21 33,27 36,35M-40,0C-43,6 -43,12 -41,18M40,0C43,6 43,12 41,18" fill="none" stroke-width=".6" opacity=".75"/><g fill="${INK}" stroke="none" opacity=".45">${[[-16, 43], [-8, 45], [6, 45], [15, 43], [0, 43], [-24, 40], [24, 40], [-30, 36], [30, 36]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".7"/>`).join('')}</g>`);
  const extra = s.house === 'tark'
    ? (c.fem ? '' : c.fine('<path d="M-17,-48C-6,-51 8,-51 18,-48M-11,-55C-4,-57 6,-57 12,-55" fill="none" stroke-width=".6" opacity=".6"/><path d="M-26,-62C-22,-56 -24,-50 -20,-44" fill="none" stroke="#5d6a38" stroke-width=".8" opacity=".7"/>') + `<circle cx="-28" cy="-38" r="1.8" fill="${s.skin[0]}" stroke-width=".7"/><circle cx="32" cy="16" r="1.5" fill="${s.skin[0]}" stroke-width=".6"/>`)
    : s.house === 'orc' && !c.fem ? `<circle cx="-34" cy="22" r="2" fill="${s.skin[0]}" stroke-width=".7"/><circle cx="36" cy="-2" r="1.5" fill="${s.skin[0]}" stroke-width=".6"/>` : '';
  const tmp = c.fem && s.house !== 'tark' ? temples(c, hairOf(c, s)) : '';
  return `<path d="${F}" fill="${c.url('s')}" stroke-width="1.15"/>${domeSh}<path d="${sh}" fill="${s.house === 'tark' ? '#4a4626' : '#3a2a18'}" opacity="${s.house === 'tark' ? .36 : .22}" stroke="none"/>${s.house === 'tark' ? `<path d="${wx('M-43,-28C-48,-8 -47,14 -39,28C-31,40 -16,46.5 0,47C-14,40 -22,24 -24,4C-25,-10 -24,-20 -22,-28Z', j)}" fill="#4a4626" opacity=".16" stroke="none"/><path d="${wx('M-20,30C-12,38 -4,42 6,42C2,46 -6,46 -14,42Z', j)}" fill="${c.url('p')}" stroke="none"/><path d="M-12,-6C-16,4 -16,14 -10,24" fill="none" stroke-width=".6" opacity=".5"/>` : ''}<path d="${sh}" fill="${c.url('p')}" stroke="none"/><path d="${edge}" fill="${c.url('q')}" stroke="none"/>` +
    `<ellipse cx="-30" cy="17" rx="10" ry="7" fill="#7a3a2c" opacity="${blush}" stroke="none"/><ellipse cx="31" cy="15" rx="9" ry="6" fill="${light(s.skin[2], .4)}" opacity=".3" stroke="none"/>` +
    ridge + lines + extra + (c.fem ? `<path d="${wx('M-30,38C-20,45 -8,47 0,47C10,47 22,44 30,38C22,46 10,50 0,50C-10,50 -22,46 -30,38Z', j)}" fill="#2a1a10" opacity=".25" stroke="none"/>` : '') +
    marks(c, s) + tmp;
};

/** The house marks on the face: the Morruhk's ritual scars, the Zaugurz's blood and scar. */
const marks = (c: Ctx, s: Spec): string => {
  if (s.house === 'morr') {
    // raised ritual cuts away from the snout: two chevrons on each outer cheek, a row of beads above each brow, slashes at the temples
    const side = (sg: number): string => {
      const X = (x: number): number => n(sg * x);
      return `M${X(47)},2L${X(37)},8L${X(47)},14M${X(46)},18L${X(37)},23L${X(45)},28M${X(48)},-24L${X(42)},-14M${X(44)},-26L${X(38)},-16`;
    };
    const d = side(-1) + side(1);
    const beads = [-1, 1].map((sg) => [0, 1, 2, 3].map((k) => `<circle cx="${n(sg * (14 + k * 6))}" cy="${n(-21.5 + k * .8)}" r="${c.med ? 1.6 : 1.3}"/>`).join('')).join('');
    const raised = light(s.skin[2], .25);
    return `<path d="${d}" fill="none" stroke="#2a180e" stroke-width="${c.med ? 2.2 : 2.8}" opacity=".7" transform="translate(.5,.9)"/><path d="${d}" fill="none" stroke="${raised}" stroke-width="${c.med ? 1.3 : 1.6}"/>${c.fine(`<path d="${d}" fill="none" stroke="#fff0d8" stroke-width=".45" opacity=".55" transform="translate(.4,-.5)"/>`)}<g fill="${raised}" stroke="#2a180e" stroke-width=".5">${beads}</g>`;
  }
  if (s.house === 'zaug') {
    // the rake in blood across both cheeks, with drips; a stitched scar over the nose
    const w = c.med ? 3.2 : 3.8;
    const L = 'M-48,4C-40,6 -32,10 -23,13M-49,14C-41,16 -33,20 -25,23M-46,24C-40,26 -34,29 -28,32';
    const drip = 'M-23,13q1.2,4 .2,8M-25,23q1,3.5 0,7M-41,26q.8,3 0,6';
    const scar = `<path d="M-14,2L16,14" fill="none" stroke="#7a3e33" stroke-width="1.8"/>${c.fine('<path d="M-9,1l-2,5M-2,3.5l-2,5M5,6.5l-2,5M12,9.5l-2,5" fill="none" stroke-width=".7"/>')}`;
    return `<path d="${L}${mir(L)}" fill="none" stroke="${BLOOD}" stroke-width="${w}" opacity=".88"/><path d="${drip}${mir(drip)}" fill="none" stroke="${BLOOD}" stroke-width="1.4" opacity=".8"/>${c.fine(`<path d="${L}" fill="none" stroke="#c0402a" stroke-width="1" opacity=".5" transform="translate(.5,-.8)"/>`)}` + (c.fem ? '' : scar);
  }
  return '';
};

// ---- the nose ----
const nose = (c: Ctx, s: Spec): string => {
  const [sk0, sk1] = s.skin, mid = mix(sk0, sk1, .62);
  if (s.house === 'tark') {
    // the goblin's hooked nose, hanging over the mouth
    const k = c.fem ? .85 : 1.12;
    return `<g transform="translate(0,${c.fem ? 2 : 0}) scale(${k})"><path d="M-4,-6C10,0 20,16 9,27C3,31 -6,27 -3,21C-1,15 -5,6 -4,-6Z" fill="${mid}" stroke-width="1.15"/><path d="M-4,-6C2,2 4,14 -1,23C-4,19 -1,14 -5,6Z" fill="${c.url('p')}" stroke="none"/>
<path d="M9,10q3,6 -1,11" fill="none" stroke="${light(s.skin[2], .4)}" stroke-width="1.3" opacity=".7"/><path d="M-1,22q3,2.5 6,.5" fill="none" stroke-width="1"/>${c.fine(`<circle cx="6" cy="6" r="1.2" fill="${sk0}" stroke-width=".5"/>`)}</g>`;
  }
  if (s.house === 'morr') {
    // the snuffler's snout: a broad bridge, wrinkled, to a great flat disc with two round nostrils
    const k = c.fem ? .84 : 1;
    return `<g transform="translate(0,${c.fem ? 2 : 0}) scale(${k})"><path d="M-8,-8C-10,2 -20,6 -24,14L24,14C20,6 10,2 8,-8Z" fill="${mid}" stroke-width="1.1"/><path d="M-8,-8C-10,2 -20,6 -24,14L-10,14C-8,6 -6,0 -3,-6Z" fill="${c.url('p')}" stroke="none"/>
<path d="M-7,0Q0,-3 7,0M-9,4Q0,1 9,4M-12,8Q0,5 12,8" fill="none" stroke-width=".8" opacity=".8"/>
<ellipse cx="0" cy="20" rx="24" ry="11" fill="${mix(sk1, '#d09a8e', .6)}" stroke-width="1.2"/><path d="M-24,20C-24,26 -14,31 -2,31C-12,28 -18,24 -18,14C-22,15 -24,17 -24,20Z" fill="${c.url('p')}" stroke="none"/>
<ellipse cx="-9" cy="21" rx="5" ry="4.2" fill="#170d0b" stroke-width=".8" transform="rotate(14 -9 21)"/><ellipse cx="9" cy="21" rx="5" ry="4.2" fill="#170d0b" stroke-width=".8" transform="rotate(-14 9 21)"/>
<ellipse cx="11" cy="14" rx="8" ry="2.6" fill="#f3dcc0" opacity=".4" stroke="none"/>${c.fine('<path d="M0,12v6M-22,24q-3,2 -2,6M22,24q3,2 2,6" fill="none" stroke-width=".6" opacity=".7"/>')}</g>`;
  }
  if (c.fem) {
    return `<path d="M-4,-6C-5,4 -11,10 -12,17C-12.5,23 -6,26 0,25.5C6,26 12.5,23 12,17C11,10 5,4 4,-6Z" fill="${mid}" opacity=".6" stroke="none"/><path d="M-4,-6C-5,4 -11,10 -12,17C-12.5,21 -9,23 -7,23.5C-9,16 -7,6 -3,-2Z" fill="${c.url('p')}" stroke="none"/>
<path d="M-4.5,-4C-5.5,4 -10.5,10 -11.5,17" fill="none" stroke-width=".9"/><ellipse cx="3.5" cy="14" rx="3.5" ry="5" fill="#f3dcc0" opacity=".4" stroke="none"/><path d="M-10,21q3,-3.5 6,-1ZM4,20q3,-2.5 6,1Z" fill="#170d0b" stroke-width=".6"/>`;
  }
  // the balloon orc's: broad, flat, flared, the bridge creased
  return `<path d="M-6,-6C-7,4 -16,10 -18,19C-19,27 -10,31 -4,28Q0,30 4,28C10,31 19,27 18,19C16,10 7,4 6,-6Z" fill="${mid}" stroke-width="1.15"/><path d="M-6,-6C-7,4 -16,10 -18,19C-19,27 -10,31 -4,28C-9,22 -8,8 -2,-3Z" fill="${c.url('p')}" stroke="none"/>
<path d="M-13,24q4,-6 8,-1.5ZM5,22.5q4,-4.5 8,1.5Z" fill="#170d0b" stroke-width=".7"/><ellipse cx="6" cy="13" rx="3.5" ry="5.5" fill="#f0e3c0" opacity=".35" stroke="none"/>${c.fine('<path d="M-5,-1h10M-6,3h12" fill="none" stroke-width=".6" opacity=".7"/>')}`;
};

// ---- the mouth ----
/** Uneven teeth hanging from (or rising to) a curve: `y(x)` the gum line, `h` their lengths, `dir` 1 down, -1 up. */
const teeth = (xs: readonly number[], hs: readonly number[], y: (x: number) => number, dir: number): string => {
  let d = '';
  for (let i = 0; i < xs.length - 1; i++) {
    const h = hs[i % hs.length]!;
    if (!h) continue;
    const a = xs[i]!, b = xs[i + 1]!, m = (a + b) / 2 + (i % 2 ? .6 : -.5);
    d += `M${a},${n(y(a))}L${n(m)},${n(y(m) + dir * h)}L${b},${n(y(b))}Z`;
  }
  return d;
};
/** A lower tusk rising at x to tip height `h`, curving outward. */
const tusk = (x: number, h: number, base = 41): string => {
  const o = x < 0 ? -1 : 1, w = h * .24;
  return `M${n(x - w)},${base}C${n(x - w)},${n(base - h * .55)} ${n(x - o * .5)},${n(base - h * .9)} ${n(x + o * 1.6)},${n(base - h)}C${n(x + w * .5)},${n(base - h * .6)} ${n(x + w)},${n(base - h * .3)} ${n(x + w)},${base}Z`;
};
const mouth = (c: Ctx, s: Spec): string => {
  if (c.fem) {
    // dark full lips, set hard, the tusks smaller (the Tarkhnarb's two fangs over the lip)
    const lips = `<path d="M-12,34Q-5,30 0,32Q5,30 12,34Q5,35.6 0,35Q-5,35.6 -12,34Z" fill="#6e3a34" stroke-width=".8"/><path d="M-10,34.8Q0,42 10,34.8Q0,36.4 -10,34.8Z" fill="#8a4a42" stroke-width=".8"/><path d="M-13,33q-1.4,1 -.8,2.2M13,33q1.4,1 .8,2.2" fill="none" stroke-width=".7" opacity=".7"/>${c.fine('<path d="M1,38.5q2.5,.2 4,-.8" fill="none" stroke="#e8c8b0" stroke-width=".8" opacity=".7"/>')}`;
    const t = s.house === 'tark' ? `<path d="M-6.5,34L-5,39.5L-3.5,34.6ZM3.5,34.6L5,39.5L6.5,34Z" fill="${BONE}" stroke-width=".6"/>`
      : s.house === 'zaug' ? `<path d="M-6,34.7L-4.5,37.6L-3,34.9ZM-1.5,35L0,37.8L1.5,35ZM3,34.9L4.5,37.6L6,34.7Z" fill="${BONE}" stroke-width=".5"/>`
        : `<path d="${tusk(-11, 8, 40) + tusk(11, 8, 40)}" fill="${BONE}" stroke-width=".7"/>`;
    return lips + t;
  }
  if (s.house === 'tark') {
    // the goblin's fanged mouth
    return `<path d="M-18,32Q0,27 18,32Q10,41 0,41Q-10,41 -18,32Z" fill="#2a1410" stroke-width="1.3"/><path d="M-11,30.2L-9,39L-7,30ZM7,30L9,39L11,30.2ZM-3.5,29.6L-2,33L-.5,29.5ZM.5,29.5L2,33L3.5,29.6Z" fill="${BONE}" stroke-width=".7"/><path d="M-21,28q-2,3 0,7M21,28q2,3 0,7" fill="none" stroke-width=".9"/>`;
  }
  const w = s.house === 'zaug' ? 24 : 21;
  const top = (x: number): number => 31.6 + 3.4 * (x / w) ** 2, bot = (x: number): number => 40 - 4.4 * (x / w) ** 2;
  const xs = Array.from({ length: 11 }, (_, i) => n(-w * .86 + (w * 1.72 * i) / 10));
  const up = teeth(xs, s.house === 'zaug' ? [3.4, 4.6, 3, 4.2, 2.4, 4.6, 3, 4.2, 3.4, 4] : [3, 4.2, 0, 3.6, 0, 3.8, 3, 0, 3.4, 3], top, 1);
  const lo = teeth(xs.slice(1, -1), s.house === 'zaug' ? [2.6, 3.2, 2.4, 3, 2.8, 2.2, 3.2, 2.4] : [2.4, 0, 2.8, 2.2, 0, 2.6, 0, 2.4], bot, -1);
  const D = `M${-w},34C${-w * .5},29.5 ${w * .5},29.5 ${w},34C${w * .6},41.5 ${-w * .6},41.5 ${-w},34Z`;
  const tusks = s.house === 'zaug' ? '' : `<path d="${tusk(-w * .64, s.house === 'morr' ? 13 : 11, 42) + tusk(w * .64, s.house === 'morr' ? 13 : 11, 42)}" fill="${BONE}" stroke-width=".9"/><path d="M${n(w * .64 + 1)},39q.6,-4 .4,-7" fill="none" stroke="#fff8e6" stroke-width=".7" opacity=".7"/>`;
  return `<path d="${D}" fill="#2a1210" stroke-width="1.4"/><path d="M-8,38Q0,35.5 8,38Q0,40 -8,38Z" fill="#6a2a24" stroke="none"/><path d="${up}" fill="#e2d6b2" stroke-width=".7"/><path d="${lo}" fill="#cfc29c" stroke-width=".6"/>` +
    `<path d="M${-w - 2},32.5Q0,27.5 ${w + 2},32.5" fill="none" stroke-width="1.5"/><path d="M${-w - 2},31q-2,3 -1,6M${w + 2},31q2,3 1,6" fill="none" stroke-width=".9"/><path d="M-9,43.5Q0,46 9,43.5" fill="none" stroke-width=".7" opacity=".6"/>` + tusks;
};

// ---- the eyes ----
/** The orc's eye: the shared living eye, slanted, its white yellowed. */
const orcEye = (c: Ctx, s: Spec, sg: number, o: EyeO): string => `<g transform="rotate(${-8 * sg} ${21 * sg} 0)">${eye(c, sg, o).replace('#d9cdb3', s.white)}</g>`;
/** The Tarkhnarb's great round night eye (the balloon goblin's): yellow, a tall pupil, two catch lights, lids. */
const nightEye = (c: Ctx, s: Spec, sg: number, o: EyeO): string => {
  const lid = o.lid ?? 3, low = o.low ?? 1, sz = o.size ?? 1, [px, py] = o.look ?? [0, 0];
  const lash = o.lash ? `<path d="M${9 * sg},-7.5l${3.6 * sg},-3.4M${11 * sg},-4.5l${4 * sg},-1.6M${5.5 * sg},-9.5l${2.2 * sg},-3.8" fill="none" stroke="${INK}" stroke-width="1"/>` : '';
  return `<g transform="translate(${20 * sg},0) scale(${sz})"><circle r="16" fill="${o.socket ?? '#2f3a1f'}" opacity=".5" mask="url(#${c.id('e')})"/>
<g clip-path="url(#${c.id('gc')})"><circle r="12" fill="url(#${c.id('y')})"/><path d="M-13,-13H13V-3Q0,-7 -13,-3Z" fill="#5a4a12" opacity=".35"/>
<g transform="translate(${px},${py})"><ellipse rx="2.9" ry="5.4" fill="#15100a"/><circle cx="-2" cy="-2.8" r="1.6" fill="#fffbe6"/><circle cx="1.6" cy="2.6" r=".7" fill="#fffbe6" opacity=".6"/></g>
<path d="M-14,-30H14V${n(-12 + lid)}Q0,${n(-15.5 + lid)} -14,${n(-12 + lid)}Z" fill="${o.lidFill}" stroke="${INK}" stroke-width=".8"/><path d="M-14,30H14V${n(12 - low)}Q0,${n(15 - low)} -14,${n(12 - low)}Z" fill="${o.lowFill}" stroke="${INK}" stroke-width=".7"/></g>
<circle r="12" fill="none" stroke-width="1.1"/><path d="M-11.6,${n(-4 + lid * .45)}Q0,${n(-16 + lid * 1.1)} 11.6,${n(-4 + lid * .45)}" fill="none" stroke-width="${o.lash ? 2.1 : 1.8}"/>${lash}
${c.fine(`<path d="M${-9 * sg},15q${9 * sg},4.5 ${18 * sg},-1.5${o.lash ? '' : `M${-5 * sg},18.5q${6 * sg},3 ${12 * sg},-.5`}" fill="none" stroke-width=".6" opacity=".6"/>`)}</g>`;
};
const eyesOf = (c: Ctx, s: Spec): string => {
  const o: EyeO = { lidFill: dark(s.skin[1], .14), lowFill: s.skin[1], socket: '#2a1a10', ...s.eye, lash: c.fem, size: c.fem ? 1.06 : 1 };
  const one = s.house === 'tark' ? nightEye : orcEye;
  const b: BrowO = { ...s.brow, ...(c.fem ? { thin: true, sc: 1.1, rot: (s.brow.rot ?? 14) * .8 } : {}) };
  return one(c, s, -1, o) + one(c, s, 1, o) + brow(c, -1, b) + brow(c, 1, b);
};

// ---- headgear ----
/** The balloon orc's iron cap: a dome low over the brow, plates, rust, a riveted band, a top spike; the men's nasal; the Zaugurz's fur rim and war spikes. */
const cap = (c: Ctx, s: Spec): string => {
  const zaug = s.house === 'zaug';
  const bt = (x: number): number => -30 - 8 * (1 - (x / 56) ** 2), bb = (x: number): number => -18 - 8 * (1 - (x / 56) ** 2);
  const spikes = zaug ? `<path d="M-22,-74L-36,-100L-12,-78ZM22,-74L36,-100L12,-78Z" fill="${c.url('k')}" stroke-width="1.2"/><path d="M-22,-74L-36,-100L-28,-80Z" fill="${c.url('p')}" stroke="none"/>` : '';
  let out = spikes + `<path d="M-5,-78L0,-96L5,-78Z" fill="${c.url('k')}" stroke-width="1.2"/>
<path d="M-52,-24C-56,-62 -32,-82 0,-82C32,-82 56,-62 52,-24Q0,-40 -52,-24Z" fill="${c.url('k')}" stroke-width="1.3"/>
<path d="M-52,-24C-56,-62 -32,-82 -4,-82C-22,-72 -30,-54 -29,-34Q-40,-30 -52,-24Z" fill="${c.url('p')}" stroke="none"/><path d="M-52,-24C-56,-62 -32,-82 -18,-81C-36,-70 -44,-52 -43,-28Z" fill="${c.url('q')}" stroke="none"/>
<path d="M14,-78C34,-72 50,-56 50,-38" fill="none" stroke="#e3e9ec" stroke-width="1.1" opacity=".55"/><path d="M-16,-80C-14,-66 -14,-50 -15,-38M16,-80C14,-66 14,-50 15,-38" fill="none" stroke-width=".9"/>
<ellipse cx="30" cy="-58" rx="8" ry="4.5" fill="${RUST}" opacity=".5" stroke="none"/><ellipse cx="-26" cy="-62" rx="6" ry="3.5" fill="${RUST}" opacity=".4" stroke="none"/>${c.fine('<path d="M26,-70l6,5l-2,6M-34,-46l5,4M4,-60l3,4" fill="none" stroke-width=".6" opacity=".8"/>')}`;
  if (!zaug) {
    out += `<path d="M-56,-30Q0,-46 56,-30L55,-18Q0,-34 -55,-18Z" fill="#3c4146" stroke-width="1.3"/><path d="M-56,-30Q-30,-38 -20,-39L-20,-27Q-40,-24 -55,-18Z" fill="${c.url('p')}" stroke="none"/><path d="M-54,-27.5Q0,-43.5 54,-27.5" fill="none" stroke="#c8ced2" stroke-width=".8" opacity=".55"/>` +
      c.fine(`<g fill="#9aa0a4" stroke-width=".5">${[-44, -30, -15, 15, 30, 44].map((x) => `<circle cx="${x}" cy="${n((bt(x) + bb(x)) / 2)}" r="1.8"/>`).join('')}</g>`);
  }
  return out;
};
/** The cap's front: the men's nasal, the women's stone. */
const capFront = (c: Ctx, s: Spec): string =>
  c.fem
    ? `<path d="M-5,-30L0,-24L5,-30L0,-36Z" fill="${s.house === 'zaug' ? BONE : '#9c2f24'}" stroke-width=".9"/>`
    : `<path d="M-5,-30L-4,-3Q0,0 4,-3L5,-30Z" fill="#4a4f55" stroke-width="1.1"/><path d="M0,-28v24" fill="none" stroke-width=".6" opacity=".7"/>`;

/** The Zaugurz's roll of snow-white fur instead of the iron band (soft pen). */
const furRoll = (c: Ctx): string => {
  const bt = (x: number): number => -30 - 8 * (1 - (x / 56) ** 2), bb = (x: number): number => -18 - 8 * (1 - (x / 56) ** 2);
    // a roll of snow-white fur instead of the iron band
    const top = along(-60, 60, 12, (x) => bt(x) - 3), bot = along(60, -60, 12, (x) => bb(x) + 3);
    const R = `M-60,${n(bt(-60) - 3)}` + tuft(top, 4.5) + `L60,${n(bb(60) + 3)}` + tuft(bot, 4) + 'Z';
    return `<path d="${R}" fill="${c.url('w')}" stroke-width="1.1"/><path d="M-60,${n(bt(-60) - 3)}${tuft(along(-60, -26, 4, (x) => bt(x) - 3), 4.5)}L-26,${n(bb(-26) + 3)}${tuft(along(-26, -60, 4, (x) => bb(x) + 3), 4)}Z" fill="${c.url('p')}" stroke="none"/>` +
      furStrokes(c, along(-50, 50, 10, (x) => (bt(x) + bb(x)) / 2 - 4), '#ffffff', 6);
};

/** The warg's pelt worn as a hood: its back and ears behind the head (under everything). */
const wargBack = (c: Ctx, s: Spec): string => {
  const arc = Array.from({ length: 15 }, (_, i) => { const t = Math.PI * (1 - i / 14); return [n(82 * Math.cos(t)), n(14 - 96 * Math.sin(t))] as [number, number]; });
  const H = 'M-84,80L-82,14' + tuft(arc, 5) + 'L84,80Z';
  const ear = 'M-54,-60C-62,-74 -62,-88 -56,-100C-44,-92 -32,-82 -24,-72Z', inner = 'M-50,-66C-55,-76 -55,-86 -52,-94C-45,-87 -38,-80 -32,-74Z';
  return `<path d="${ear}" fill="${c.url('w')}" stroke-width="1.2"/><path d="${inner}" fill="#2a1e18" stroke-width=".7"/><path d="${mir(ear)}" fill="${s.fur[1]}" stroke-width="1.2"/><path d="${mir(inner)}" fill="#3a2a20" stroke-width=".7"/>` +
    `<path d="${H}" fill="${c.url('w')}" stroke-width="1.2"/><path d="M-84,80L-82,14C-80,-30 -60,-66 -30,-80C-54,-56 -64,-10 -62,80Z" fill="${c.url('p')}" stroke="none"/><path d="M-84,80L-82,14C-80,-20 -70,-46 -56,-64C-68,-36 -72,10 -72,80Z" fill="${c.url('q')}" stroke="none"/>` +
    furStrokes(c, [[-70, -20], [-74, 10], [-72, 40], [-66, 64], [70, -20], [74, 10], [72, 40], [66, 64], [-50, -60], [50, -60]], light(s.fur[1], .45), 9);
};
/** The warg's head over the brow: its crown and muzzle down the forehead, dead eyes, the black nose, the upper fangs over the orc's brow. */
const wargFace = (c: Ctx, s: Spec): string => {
  const top = Array.from({ length: 9 }, (_, i) => { const t = Math.PI * (1 - i / 8); return [n(54 * Math.cos(t)), n(-34 - 50 * Math.sin(t))] as [number, number]; });
  const M = 'M-54,-34' + tuft(top, 3.5).replace(/^M[^QL]*/, '') + 'C46,-28 26,-30 14,-28L0,-26L-14,-28C-26,-30 -46,-28 -54,-34Z';
  const fang = 'M-15,-28C-15,-22 -13,-17 -11,-14C-10,-18 -9,-23 -9,-27Z';
  return `<path d="${M}" fill="${c.url('w')}" stroke-width="1.2"/><path d="M-54,-34C-56,-60 -36,-80 -8,-84C-28,-70 -34,-50 -30,-30C-40,-30 -48,-31 -54,-34Z" fill="${c.url('p')}" stroke="none"/>` +
    `<path d="M-12,-80C-14,-62 -14,-46 -10,-32L10,-32C14,-46 14,-62 12,-80Z" fill="${light(s.fur[1], .25)}" stroke="none" opacity=".7"/>` +
    `<path d="M-30,-60L-18,-56L-30,-54ZM30,-60L18,-56L30,-54Z" fill="#120c0a" stroke-width=".8"/>${c.fine('<circle cx="-24" cy="-57" r=".8" fill="#d8a040" stroke="none"/><circle cx="24" cy="-57" r=".8" fill="#d8a040" stroke="none"/>')}` +
    `<path d="M-8,-40Q0,-44 8,-40Q8,-33 0,-31Q-8,-33 -8,-40Z" fill="#1a1210" stroke-width=".9"/><path d="M2,-40.5q3,0 4,1.5" fill="none" stroke="#8a8f96" stroke-width=".8"/>` +
    `<path d="${fang}${mir(fang)}" fill="${BONE}" stroke-width=".8"/><path d="M-6,-27L-4.5,-23L-3,-26.5ZM3,-26.5L4.5,-23L6,-27Z" fill="${BONE}" stroke-width=".6"/>` +
    furStrokes(c, [[-40, -48], [-30, -70], [-20, -44], [40, -48], [30, -70], [20, -44], [0, -72], [-44, -38], [44, -38]], light(s.fur[1], .45), 7);
};

/** The bald Tarkhnarb's few wisps of hair. */
const wisps = (c: Ctx): string => `<path d="M-8,-79C-10,-88 -16,-92 -22,-92M2,-80C3,-90 8,-96 14,-98M10,-79C14,-84 20,-86 26,-84" fill="none" stroke-width="${c.med ? .8 : 1}"/>`;

// ---- the whole figure ----
const hairOf = (c: Ctx, s: Spec): HairO => ({
  near: c.url('h'), cols: s.hair, jaw: s.jaw, len: 112, wild: 0,
  braids: s.house === 'tark' ? undefined : { links: 12, sc: 1.3, x: 54 * s.jaw, top: s.house === 'morr' ? -10 : -16, ring: s.ring },
});

/** The women's ornament above the level ring: two broad rings high on each braid (copper for the base, bone for the Morruhk and Zaugurz). */
const braidRings = (c: Ctx, s: Spec): string => {
  const b = hairOf(c, s).braids;
  if (!b) return '';
  const X = b.x ?? 54, metal = s.house === 'orc' ? ['#8e5532', '#d8a070'] : [mix(BONE, '#8a7a5a', .4), BONE];
  return [-1, 1].map((sg) => [6, 20].map((y) => `<rect x="${n(sg * X - 8.5)}" y="${y}" width="17" height="6.5" rx="1.6" fill="${metal[0]}" stroke-width="1"/><path d="M${n(sg * X - 6)},${y + 1.8}H${n(sg * X + 6)}" fill="none" stroke="${metal[1]}" stroke-width="1.3" opacity=".85"/>`).join('')).join('');
};

const draw = (s: Spec): Draw => (o) => {
  const c = ctx(o);
  const back = s.house === 'morr' ? pen(c, wargBack(c, s), false) : '';
  const hair = c.fem ? (s.house === 'tark' ? tarkBack(c, s) : longHair(c, hairOf(c, s))) : s.house === 'orc' || s.house === 'zaug' ? sideHair(c, s) : '';
  const ears = pen(c, ear(c, s, -1) + ear(c, s, 1), true);
  const head = s.house === 'morr' ? pen(c, wargFace(c, s)) : s.house === 'tark' ? (c.fem ? pen(c, crownHair(c, s)) : pen(c, wisps(c))) : pen(c, cap(c, s)) + (s.house === 'zaug' ? pen(c, furRoll(c), true) : '') + pen(c, capFront(c, s));
  const body = back + pen(c, hair) + pen(c, bust(c, s), false) + (s.house === 'zaug' ? pen(c, snowMantle(c, s), true) : '') +
    (c.fem ? '' : ears) + pen(c, face(c, s), true) + (c.fem ? ears : '') +
    pen(c, mouth(c, s), true) + pen(c, nose(c, s), true) + pen(c, eyesOf(c, s), true) + head +
    (c.fem ? pen(c, frontBraids(c, hairOf(c, s)) + braidRings(c, s)) : '');
  return svg(c, defs(c, s), body);
};

// ---- the four, the men and the women ----
const BASE: Spec = {
  house: 'orc', skin: ['#575a42', '#83845e', '#aba984'], hair: BLACK, cloth: ['#221a15', '#3a2d24', '#57463a'], fur: ['#4a3c2c', '#7a6a52'], white: '#cbbd7a',
  eye: { iris: '#c4501a', lid: 2.6, low: 1.6 }, brow: { fill: '#2a2a1c', hi: '#7c7c58', rot: 16, dy: 1, sc: 1.22 }, jaw: 1, wide: 1, ring: '#70777d',
};
const TARK: Spec = {
  ...BASE, house: 'tark', skin: ['#7f8456', '#aaae7e', '#cfd0a2'], hair: ['#1e1a14', '#3e3628', '#8a8468'], cloth: ['#3a2e20', '#5e4c34', '#7e6a4a'], fur: ['#5e4c34', '#8a7654'],
  eye: { lid: 3.4, low: 1.4, look: [.6, 0] }, brow: { fill: '#2c2a1c', hi: '#8a8a5c', rot: 18, dy: -8, sc: 1.02 }, jaw: .9, wide: .84, ring: '#b9a25e',
};
const MORR: Spec = {
  ...BASE, house: 'morr', skin: ['#4e3a2e', '#7a5c48', '#a07e66'], hair: ['#1c1612', '#3e3028', '#8a7e70'], cloth: ['#2a1e16', '#46342a', '#62503e'], fur: ['#3e4042', '#86888a'], white: '#c8b884',
  eye: { iris: '#a8601a', lid: 3, low: 1.6 }, brow: { fill: '#241c16', hi: '#7a6a5a', rot: 14, dy: 1.5, sc: 1.2 }, jaw: 1.04, wide: 1.06, ring: BONE,
};
const ZAUG: Spec = {
  ...BASE, house: 'zaug', skin: ['#6b563e', '#98805e', '#bfa784'], fur: ['#a8a296', '#ece8de'], white: '#d4c690',
  eye: { iris: '#d0581a', lid: 1.4, low: 1.2, look: [0, -.4] }, brow: { fill: '#2a241c', hi: '#8a7e66', rot: 20, dy: 2, sc: 1.28 }, jaw: 1.06, wide: 1.08, ring: BONE,
};
/** The women: the same house; brows and lids a little softer, the jaw narrower. */
const fem = (s: Spec, eye: EyeO = {}): Spec => ({ ...s, eye: { ...s.eye, ...eye }, jaw: s.jaw * .96 });
const FEM: Readonly<Record<House, Spec>> = {
  orc: { ...fem(BASE, { lid: 2.4, low: 1.2 }), jaw: .92 },
  tark: fem({ ...TARK, jaw: .94 }, { lid: 3 }),
  morr: { ...fem(MORR, { lid: 3, low: 1.4 }), jaw: .96 },
  zaug: fem(ZAUG, { lid: 1.6, low: 1 }),
};
const pair = (m: Spec): Draw => { const dm = draw(m), df = draw(FEM[m.house]); return (o) => (o.sex === 'female' ? df(o) : dm(o)); };

export const portraits: PortraitSet = {
  orc: pair(BASE),
  tarkhnarb: pair(TARK),
  morruhk: pair(MORR),
  zaugurz: pair(ZAUG),
};
