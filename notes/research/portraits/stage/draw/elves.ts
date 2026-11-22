// The elves' portraits (stage 77's portrait pass, notes/research/portraits/
// style.md), with the half-elf. The base elf is the balloon elf's head
// (src/weather/balloons/passengers/elf.ts: fair hair parted in the middle,
// a silver fillet with the star of Elbereth, the grey-green cloak with a
// leaf clasp, grey-blue eyes) re-drawn in the dwarves' head units and pen,
// with the one mark every elf shares pushed hard: long ears that sweep up
// and back out of the hair. The three kindreds are that figure with one
// mark pushed:
//   noldo    black hair, a tall gold circlet with a great white gem on the
//            brow (the gem-smiths), deep blue robe, a gold star brooch,
//            bright grey eyes
//   sinda    silver-white hair, so long it falls in front of the shoulders,
//            a pale grey mantle with silver clasps, the palest skin
//   silvan   a green hood crowned with leaves, auburn hair, brown leather,
//            a bowstring across the chest and the bow over the shoulder
//   halfelf  a Man's face (broader, squarer, a Man's nose, a short beard on
//            the man), brown hair to the shoulders, ears only a little
//            pointed, a wine-red traveller's cloak with an elven leaf brooch
// Elf men are beardless: they read as men by the jaw's angle, a strong
// brow, a broad neck, no lashes. The women: a narrower, rounder face,
// lips, lashes, slender brows, and two long locks in front of the
// shoulders (where the Sinda men wear them too).

import type { Draw, PortraitSet } from '../../../../../src/panes/portraits/types';
import { dark, light } from '../../../../../src/art/engrave';
import { type BrowO, type Ctx, type EyeO, type HairCols, INK, baseDefs, ctx, eye, brow, lg, mass, mir, mix, n, pen, strands, svg, wx } from '../parts';

type Stops = readonly [string, string, string];

/** One elf: everything a kindred or a sex changes. */
interface Spec {
  skin: Stops;
  hair: HairCols;
  brow: BrowO;
  eye: EyeO;
  /** What sits on the head. */
  head: 'fillet' | 'circlet' | 'none' | 'hood';
  /** The cloak (shadow, mid, light), the tunic between it, the neckline's trim. */
  cloak: Stops;
  tunic: string;
  trim: string;
  brooch: 'leaf' | 'star' | 'clasps' | 'none';
  /** 1 an elf's long ear, 0 a Man's (the half-elf's is between). */
  ear: number;
  /** A Man's face (the half-elf). */
  man: boolean;
  beard: boolean;
  /** Long locks in front of the shoulders (every woman, and the Sinda men). */
  locks: boolean;
  /** Where the back hair ends. */
  len: number;
  bow: boolean;
  /** Fair or silver hair, pale cloth: the soft pen (style.md §2). */
  softHair: boolean;
  paleCloth: boolean;
  /** The face width factor, the shoulders'. */
  jaw: number;
  wide: number;
  /** The eyes' tilt (degrees, the outer corners up). */
  tilt: number;
}

const GOLD = ['#7a5a20', '#c49a3c', '#ecd590'] as const;
const SILVER = '#d6dbde';

const defs = (c: Ctx, s: Spec): string =>
  baseDefs(c) + lg(c, 's', s.skin) + lg(c, 'h', [s.hair[0], s.hair[1]]) + lg(c, 'k', s.cloak, .2) + lg(c, 't', [dark(s.tunic, .3), s.tunic]) +
  lg(c, 'g', GOLD, .2) + lg(c, 'v', ['#9aa2a8', '#e4e8ea']);

// ---- the bust: a cloak over the shoulders, the tunic between, the trim ----
const bust = (c: Ctx, s: Spec): string => {
  const w = s.wide, fem = c.fem;
  const body = wx('M-114,150L-112,104C-106,82 -88,68 -60,62L-22,54L22,54L60,62C88,68 106,82 112,104L114,150Z', w);
  const cl = wx(s.brooch === 'clasps'
    ? 'M-116,150L-114,100C-108,76 -88,60 -56,54L-8,50C-18,70 -22,104 -20,150Z'
    : 'M-116,150L-114,100C-108,76 -88,62 -58,56L-24,51C-34,70 -40,104 -38,150Z', w);
  const clSh = wx('M-116,150L-114,100C-108,76 -88,62 -58,56L-46,54C-70,66 -82,100 -80,150Z', w);
  const clDeep = wx('M-116,150L-114,100C-108,78 -96,66 -80,60C-94,76 -100,104 -98,150Z', w);
  const neckline = fem ? 'M-20,54Q0,70 20,54' : 'M-23,53Q0,72 23,53';
  let out = `<path d="${body}" fill="${c.url('t')}" stroke-width="1.2"/><path d="${wx('M-60,62L-22,54L-8,56C-24,70 -30,100 -28,150L-60,150Z', w)}" fill="${c.url('p')}" stroke="none"/>` +
    `<path d="${neckline}" fill="none" stroke-width="3.6"/><path d="${neckline}" fill="none" stroke="${s.trim}" stroke-width="2"/>` +
    c.fine(`<path d="M-14,80C-16,100 -15,124 -17,150M14,78C16,100 15,124 17,150" fill="none" stroke-width=".6" opacity=".45"/>`);
  out += mass(cl, c.url('k'), 1.3, clSh, c, clDeep) + `<path d="${mir(cl)}" fill="${c.url('k')}" stroke-width="1.3"/>` +
    c.fine(`<path d="${wx('M-98,84C-96,104 -94,126 -96,150M-76,72C-72,98 -72,124 -74,150M-54,64C-56,90 -58,120 -56,150M98,84C96,104 94,126 96,150M76,72C72,98 72,124 74,150', w)}" fill="none" stroke-width=".6" opacity=".55"/>`) +
    `<path d="${wx('M72,64C88,72 100,88 106,110', w)}" fill="none" stroke="${light(s.cloak[2], .4)}" stroke-width="1.4" opacity=".55"/>`;
  if (s.bow) {
    // the bowstring across the chest from the right shoulder, a leather strap beside it
    out += `<path d="M84,56L-40,150" fill="none" stroke-width="3"/><path d="M84,56L-40,150" fill="none" stroke="#efe4c4" stroke-width="1.5"/>` +
      `<path d="M60,58L-60,150L-76,150L48,54Z" fill="#5a3a20" stroke-width="1"/>${c.fine('<path d="M54,58L-66,150" fill="none" stroke="#c49a5a" stroke-width=".7" stroke-dasharray="2.5 2.5" opacity=".8"/>')}`;
  }
  if (s.brooch === 'leaf') out += leafBrooch(c, 54 * w, 64, s.trim);
  if (s.brooch === 'star') out += starBrooch(c, 54 * w, 64);
  if (s.brooch === 'clasps') {
    out += [-1, 1].map((d) => `<circle cx="${n(d * 50 * w)}" cy="62" r="7.5" fill="${c.url('v')}" stroke-width="1.1"/>${star(n(d * 50 * w), 62, 5.5, '#f6fbff', .5)}`).join('') +
      `<path d="${wx('M-44,62Q0,74 44,62', w)}" fill="none" stroke="${SILVER}" stroke-width="1.6"/>`;
  }
  return out;
};

/** A mallorn leaf, tip up, 16 long at scale 1 (the balloon elf's). */
const leaf = (fill: string, sw = .7, rib: string = INK): string =>
  `<path d="M0,-8C4.5,-4.5 5,2 0,8C-5,2 -4.5,-4.5 0,-8Z" fill="${fill}" stroke-width="${sw}"/><path d="M0,-6V9.5M0,-2.5L2.3,-4.5M0,1L-2.6,-1.2M0,3.5L2.3,1.5" fill="none" stroke="${rib}" stroke-width="${n(sw * .7)}" opacity=".75"/>`;
const leafBrooch = (c: Ctx, x: number, y: number, metal: string): string =>
  `<g transform="translate(${n(x)},${y}) rotate(24)"><g transform="scale(1.5)">${leaf(metal, .9)}</g><g transform="scale(1.05)">${leaf('#3f7a4f', .8, '#e6efe2')}</g></g>${c.fine('')}`;
/** The star of Elbereth: four long rays, four short. */
const star = (x: number, y: number, r: number, fill: string, sw = .5, q = .45): string => {
  let d = '';
  for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, rr = i % 2 ? r * .2 : (i % 4 ? r * q : r); d += (i ? 'L' : 'M') + n(x + rr * Math.sin(a)) + ',' + n(y - rr * Math.cos(a)); }
  return `<path d="${d}Z" fill="${fill}" stroke-width="${sw}"/>`;
};
const starBrooch = (c: Ctx, x: number, y: number): string =>
  star(x, y, 15, c.url('g'), .9, .62) + `<circle cx="${n(x)}" cy="${y}" r="3.4" fill="#eef6ff" stroke-width=".7"/>${c.fine(`<path d="M${n(x - 1.6)},${y - .8}l1.4,-1.2" fill="none" stroke="#fff" stroke-width=".8"/>`)}`;

// ---- the neck ----
const neck = (c: Ctx, s: Spec): string => {
  const k = c.fem ? .72 : s.man ? 1.1 : 1.04;
  const N = wx('M-20,30L-22,60L22,60L20,30Z', k);
  return `<path d="${N}" fill="${dark(s.skin[1], .16)}" stroke-width="1"/><path d="${wx('M-20,30L-22,60L-8,60L-6,44Z', k)}" fill="${c.url('p')}" stroke="none"/>` +
    `<path d="${wx('M-20,38Q0,54 20,38L20,48Q0,60 -20,48Z', k)}" fill="#4e2f20" opacity=".22" stroke="none"/>` +
    (c.fem ? '' : c.fine('<path d="M-2,50q2,3 4,0M-12,46C-10,52 -8,56 -6,60" fill="none" stroke-width=".6" opacity=".5"/>'));
};

// ---- the face ----
const faceShape = (c: Ctx, s: Spec): { F: string; sh: string; edge: string } => {
  const j = s.jaw;
  if (c.fem) {
    return {
      F: wx('M-43,-32C-46,-8 -45,12 -38,28C-30,40 -16,46.5 0,47C16,46.5 30,40 38,28C45,12 46,-8 43,-32Z', j),
      sh: wx('M-43,-32C-46,-8 -45,12 -38,28C-32,38 -24,43 -16,46C-30,30 -33,0 -32,-32Z', j),
      edge: wx('M-43,-32C-46,-8 -45,12 -38,28C-42,14 -43,-4 -40,-32Z', j),
    };
  }
  if (s.man) {
    return {
      F: wx('M-46,-32C-50,-6 -50,20 -44,38C-38,45 -20,47.5 0,47.5C20,47.5 38,45 44,38C50,20 50,-6 46,-32Z', j),
      sh: wx('M-46,-32C-50,-6 -50,20 -44,38C-40,43 -32,46 -24,47C-36,28 -38,0 -36,-32Z', j),
      edge: wx('M-46,-32C-50,-6 -50,20 -44,38L-40,40C-46,22 -46,-4 -42,-32Z', j),
    };
  }
  return {
    F: wx('M-45,-32C-48,-8 -47,10 -44,24C-42,32 -36,39 -24,43.5Q-12,47 0,47Q12,47 24,43.5C36,39 42,32 44,24C47,10 48,-8 45,-32Z', j),
    sh: wx('M-45,-32C-48,-8 -47,10 -44,24C-42,32 -36,39 -24,43.5C-31,26 -34,0 -34,-32Z', j),
    edge: wx('M-45,-32C-48,-8 -47,10 -44,24C-45,10 -45,-6 -42,-32Z', j),
  };
};

const face = (c: Ctx, s: Spec): string => {
  const { F, sh, edge } = faceShape(c, s), j = s.jaw, blush = c.fem ? .26 : s.man ? .18 : .1;
  // the chin's soft shadow, the high cheekbone of an elf (a tone under it, a fine line)
  const chin = c.fem
    ? `<path d="${wx('M-30,38C-20,45 -8,47 0,47C10,47 22,44 30,38C22,46 10,50 0,50C-10,50 -22,46 -30,38Z', j)}" fill="#4e2f20" opacity=".22" stroke="none"/><path d="M-8,42.5Q0,45.5 8,42.5" fill="none" stroke-width=".6" opacity=".4"/>`
     : `<path d="${wx('M-44,20C-42,32 -34,40 -14,46.5C-24,40 -34,32 -38,18Z', j)}" fill="#4e2f20" opacity=".34" stroke="none"/><path d="${wx('M-44,20C-42,32 -34,40 -14,46.5C-24,40 -34,32 -38,18Z', j)}" fill="${c.url('p')}" stroke="none"/><path d="${wx('M44,20C42,32 34,40 16,46.5C26,41 34,34 40,22Z', j)}" fill="#4e2f20" opacity=".16" stroke="none"/>` +
       `<path d="M-36,-6Q-21,-11 -7,-5Q-21,-2 -36,-6ZM36,-6Q21,-11 7,-5Q21,-2 36,-6Z" fill="#4e2f20" opacity=".16" stroke="none"/><path d="M8,-19Q22,-23 36,-18" fill="none" stroke="#f3dcc0" stroke-width="1.2" opacity=".45"/><ellipse cx="4" cy="43" rx="7" ry="2.6" fill="#f3dcc0" opacity=".45" stroke="none"/>` + c.fine(`<path d="${wx('M-43,22C-40,33 -30,41 -14,46', j)}" fill="none" stroke-width=".7" opacity=".6"/>`);
  const cheek = s.man ? '' : `<path d="${wx('M-40,8C-36,18 -32,24 -26,30C-30,22 -34,14 -36,6Z', j)}" fill="#4e2f20" opacity=".16" stroke="none"/>` +
    c.fine(`<path d="${wx('M-39,6C-36,14 -33,20 -28,27M39,6C36,14 33,20 28,27', j)}" fill="none" stroke-width=".55" opacity="${c.fem ? .25 : .45}"/>`);
  const lines = '';
  return `<path d="${F}" fill="${c.url('s')}" stroke-width="1.1"/><path d="${sh}" fill="#4e2f20" opacity=".2" stroke="none"/><path d="${sh}" fill="${c.url('p')}" stroke="none"/><path d="${edge}" fill="${c.url('q')}" stroke="none"/>` +
    `<path d="${wx('M-44,-30Q0,-36 44,-30L44,-20Q0,-26 -44,-20Z', j)}" fill="#3d281b" opacity=".1" stroke="none"/>` +
    `<ellipse cx="-30" cy="18" rx="9" ry="6" fill="#9c4a36" opacity="${blush}" stroke="none"/><ellipse cx="30" cy="18" rx="9" ry="6" fill="#b25a44" opacity="${blush}" stroke="none"/>` +
    cheek + lines + chin;
};

// ---- the nose: long and straight, drawn by its shadow side (a Man's on the half-elf) ----
const nose = (c: Ctx, s: Spec): string => {
  const [sk0, sk1] = s.skin;
  const t = c.fem ? 'translate(0,-1) scale(.86,.9)' : s.man ? 'scale(1.22,1.04)' : 'scale(1.1,1.05)';
  return `<g transform="${t}"><path d="M-3,-9C-4,4 -7,14 -9,22C-10,28 -6,31 0,30.5C6,31 10,28 9,22C7,14 4,4 3,-9Z" fill="${mix(sk0, sk1, .7)}" opacity=".5" stroke="none"/>` +
    `<path d="M-3,-9C-4,4 -7,14 -9,22C-10,27 -8,29.5 -5,30C-7,22 -5,8 -1,-4Z" fill="${c.url('p')}" stroke="none"/>` +
    `<path d="M-3.5,-7C-4.5,4 -7.5,14 -9.5,22" fill="none" stroke-width="${c.fem ? .85 : 1}"/><ellipse cx="3" cy="15" rx="3.2" ry="6" fill="#f3dcc0" opacity=".5" stroke="none"/>` +
    `<ellipse cx="0" cy="26" rx="9" ry="4.5" fill="#a3402c" opacity=".1" stroke="none"/>` +
    `<path d="M-9.5,25q2.5,3.2 6,1.6M9.5,25q-2.5,3.2 -6,1.6M-3,29q3,1.4 6,0" fill="none" stroke-width="${c.fem ? .85 : 1}"/>${s.man ? '<path d="M-9.5,22C-13,23 -13,28 -9,29" fill="none" stroke-width=".9"/>' : ''}</g>`;
};

// ---- the mouth ----
const mouth = (c: Ctx, s: Spec): string => {
  if (c.fem) {
    return `<path d="M-9.5,35Q-4.5,32 0,33.8Q4.5,32 9.5,35Q4.5,36.4 0,36Q-4.5,36.4 -9.5,35Z" fill="#a85a4c" stroke-width=".8"/><path d="M-8,35.8Q0,42 8,35.8Q0,37 -8,35.8Z" fill="#c4766a" stroke-width=".8"/>` +
      c.fine('<path d="M-10.5,34.5q-1,.8 -.5,1.6M10.5,34.5q1,.8 .5,1.6" fill="none" stroke-width=".6" opacity=".55"/><path d="M1,39q2.5,.2 4,-.8" fill="none" stroke="#f6d8c2" stroke-width=".9" opacity=".85"/>');
  }
  const y = s.beard ? 38.5 : 37.5;
  return `<path d="M-11,${y - .8}Q-5,${y - .2} 0,${y + .4}Q5,${y - .2} 11,${y - .8}" fill="none" stroke-width="1"/><path d="M-7.5,${y + 2}Q0,${y + 6.2} 7.5,${y + 2}Q0,${y + 3.4} -7.5,${y + 2}Z" fill="${dark(s.skin[1], .3)}" opacity=".65" stroke="none"/>` +
    c.fine(`<path d="M-3,${y + 4.6}Q0,${y + 5.4} 3,${y + 4.6}" fill="none" stroke="#f3dcc0" stroke-width=".8" opacity=".6"/>`);
};

// ---- the half-elf man's short beard and moustache ----
const beard = (c: Ctx, s: Spec): string => {
  const j = s.jaw, [h0, h1, hi] = s.hair;
  const B = wx('M-48,2C-49,26 -42,42 -28,51C-16,57 16,57 28,51C42,42 49,26 48,2C44,18 38,28 18,41Q0,47 -18,41C-38,28 -44,18 -48,2Z', j);
  const M = 'M-15,35.5C-9,31 -4,31.5 0,33C4,31.5 9,31 15,35.5C11,36.2 5,35.4 0,35.6C-5,35.4 -11,36.2 -15,35.5Z';
  return mass(B, c.url('h'), 1.1, wx('M-48,2C-49,26 -42,42 -28,51C-22,54 -16,55 -10,56C-24,44 -34,30 -40,12Z', j), c) +
    strands(c, wx('M-44,14C-42,28 -36,38 -26,46M-32,34C-28,42 -22,48 -14,52M44,14C42,28 36,38 26,46M32,34C28,42 22,48 14,52M-6,48L-4,55M6,48L4,55', j), wx('M-40,22C-36,34 -30,42 -20,48M38,22C34,34 28,42 20,48M0,48L0,55', j), hi, .7) +
    `<path d="${M}" fill="${mix(h0, h1, .5)}" stroke-width=".9"/><path d="M-15,35.5C-9,31 -4,31.5 0,33L0,35.6C-5,35.4 -11,36.2 -15,35.5Z" fill="${c.url('p')}" stroke="none"/>`;
};

// ---- the ears: the elves' mark, long and swept up and back out of the hair ----
const ear = (c: Ctx, s: Spec, side: number): string => {
  const k = s.ear, j = s.jaw * (s.man ? 1.04 : 1);
  // the ear's tip runs from a Man's (k=0) to an elf's long upswept point (k=1)
  const tx = -54 - 14 * k, ty = -14 - 26 * k;
  const E = wx(`M-42,-6C${n(-48 - 4 * k)},${n(-10 - 4 * k)} ${n(-52 - 6 * k)},${n(-12 - 12 * k)} ${n(tx)},${n(ty)}C${n(tx + 1)},${n(ty + 12 + 8 * k)} ${n(-56 - 2 * k)},${n(-2 - 4 * k)} ${n(-53 - 4 * k)},8C-51,16 -47,22 -42,22Z`, j);
  const helix = wx(`M-46,0C${n(-50 - 3 * k)},-4 ${n(-53 - 4 * k)},${n(-8 - 10 * k)} ${n(tx + 4)},${n(ty + 8)}`, j);
  const bowl = wx(`M-44,2C-49,-2 ${n(-52 - 2 * k)},${n(-6 - 6 * k)} ${n(-54 - 4 * k)},${n(-10 - 10 * k)}C${n(-53 - 3 * k)},0 -50,10 -45,14Z`, j);
  const P = side < 0 ? E : mir(E), H = side < 0 ? helix : mir(helix), Bw = side < 0 ? bowl : mir(bowl);
  return `<path d="${P}" fill="${side < 0 ? mix(s.skin[0], s.skin[1], .5) : s.skin[1]}" stroke-width="1.1"/><path d="${Bw}" fill="#4e2f20" opacity=".22" stroke="none"/>` +
    (side < 0 ? `<path d="${P}" fill="${c.url('p')}" stroke="none"/>` : `<path d="${mir(wx(`M-46,-8C${n(-50 - 3 * k)},${n(-12 - 4 * k)} ${n(-54 - 5 * k)},${n(-16 - 10 * k)} ${n(tx + 1)},${n(ty + 2)}`, j))}" fill="none" stroke="${s.skin[2]}" stroke-width="1.3" opacity=".8"/>`) +
    `<path d="${H}" fill="none" stroke-width=".8" opacity=".75"/>`;
};

// ---- hair: built of locks, never a smooth cap ----
// A lock is a spindle: narrow at its root (hidden under its neighbours at
// the parting or the crown), full in the middle, a point at its tip; `bend`
// (a fraction of its length) bows it outward. The crown's deep tone shows in
// the gaps; the lit (right) locks are lighter and carry the sheen strands.
/** root x, y; tip x, y; full width; bend (+ bows to the lock's left as it runs root→tip). */
type Lock = readonly [number, number, number, number, number, number];
const lockPath = ([x0, y0, x1, y1, w, bend]: Lock, j: number): { d: string; mid: string } => {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  const cx = (x0 + x1) / 2 + nx * bend * L, cy = (y0 + y1) / 2 + ny * bend * L, r = w * .12;
  const X = (v: number): number => n(v * j);
  const d = `M${X(x0 + nx * r)},${n(y0 + ny * r)}Q${X(cx + nx * w)},${n(cy + ny * w)} ${X(x1)},${n(y1)}Q${X(cx - nx * w)},${n(cy - ny * w)} ${X(x0 - nx * r)},${n(y0 - ny * r)}Z`;
  const mid = `M${X(x0 + dx * .12 + nx * bend * L * .2)},${n(y0 + dy * .12 + ny * bend * L * .2)}Q${X(cx)},${n(cy)} ${X(x0 + dx * .86)},${n(y0 + dy * .86)}`;
  return { d, mid };
};
/** A set of locks: each filled by side (shadow on the left), the outer left ones hatched, a strand on each. */
const lockSet = (c: Ctx, s: Spec, set: readonly Lock[], j: number): string => {
  const [h0, h1, hi] = s.hair;
  let body = '', dk = '', lt = '';
  set.forEach((k, i) => {
    const { d, mid } = lockPath(k, j), x = (k[0] + k[2]) / 2;
    const t = Math.max(0, Math.min(1, (x + 40) / 80));
    const fill = mix(mix(h0, h1, .3 + .65 * t), '#1a110b', i % 3 === 1 ? .1 : 0);
    body += `<path d="${d}" fill="${fill}" stroke-width="${c.med ? .8 : .95}"/>` + (x < -30 ? `<path d="${d}" fill="${c.url('p')}" stroke="none"/>` : '');
    dk += mid;
    if (x > -24) lt += mid;
  });
  return body + strands(c, dk, lt, hi, .75) + (s.softHair && c.med ? `<path d="${dk}" fill="none" stroke-width=".5" opacity=".3"/>` : '');
};

/** The crown's locks: a fan from a side parting a little right of centre, tips on an uneven hairline and behind the ears. */
const P0 = [10, -79] as const;
const fan = (tips: readonly (readonly [number, number, number, number])[]): Lock[] => tips.map(([x, y, w, b]) => [P0[0] + (x < 10 ? -2 : 2), P0[1] + 2, x, y, w, b] as Lock);
const CROWN_LOCKS: readonly Lock[] = [
  // the outer locks make the crown's outline; draw them first
  ...fan([[-52, 22, 15, .3], [52, 20, 14, -.28], [-48, 6, 14, .24], [48, 4, 13, -.22]]),
  // then inward to the hairline, uneven
  ...fan([[-42, -10, 14, .2], [44, -12, 13, -.17], [-34, -24, 13, .15], [36, -26, 12, -.12], [-22, -32, 12, .1], [24, -34, 10, -.08], [-10, -35, 10, .07]]),
  // a forelock falling over the brow and a lock crossing the others
  [12, -78, -2, -31, 8, .06], [-4, -70, -30, -26, 7, -.08],
];
const cap = (c: Ctx, s: Spec): string => {
  const j = s.jaw * (s.man ? 1.04 : 1);
  return `<path d="${wx('M-40,-30C-40,-50 -22,-60 2,-60C26,-60 42,-50 42,-30Z', j)}" fill="${s.skin[1]}" stroke="none"/><path d="${wx('M-40,-30C-40,-50 -22,-60 2,-60C-14,-56 -24,-46 -26,-30Z', j)}" fill="#4e2f20" opacity=".2" stroke="none"/>` +
    `<path d="${wx('M4,-41C-16,-41 -32,-33 -42,-19C-46,-8 -47,4 -47,16L-50,16C-54,-8 -52,-40 -40,-58C-30,-70 -14,-76 6,-76C24,-76 38,-68 46,-56C54,-40 54,-10 50,16L47,16C47,4 46,-8 42,-18C34,-32 22,-41 4,-41Z', j)}" fill="${mix(s.hair[0], s.hair[1], .2)}" stroke="none"/>` +
    lockSet(c, s, CROWN_LOCKS, j);
};
/** The back of the hair: locks falling behind the shoulders, the women's wider and longer, the men's close to the neck (as if tied back). */
const backHair = (c: Ctx, s: Spec): string => {
  const j = s.jaw * (s.man ? 1.06 : 1), L = s.len, w = c.fem ? 1 : .84;
  const side = (m: number): Lock[] => ([
    [-30, -66, -58 * w, L * .7, 15, .1], [-40, -52, -66 * w, L, 16, .08], [-46, -34, -54 * w, L - 14, 13, .03], [-44, -14, -48, L * .85, 11, .02],
  ] as Lock[]).map(([a, b, x, y, ww, bd]) => [a * m, b, x * m, y, ww, bd * m] as Lock);
  return lockSet(c, s, [...side(1), ...side(-1)], j);
};
/** The women's locks in front of the shoulders: three a side, tapering to points at different lengths, crossing a little. */
const FRONT: readonly Lock[] = [[-46, 4, -62, 150, 10, .03], [-42, 10, -48, 128, 9, -.04], [-48, 14, -68, 108, 8, .05], [46, 4, 58, 146, 9, -.03], [42, 10, 50, 120, 9, .04], [48, 14, 66, 102, 8, -.05]];
const locks = (c: Ctx, s: Spec): string => lockSet(c, s, FRONT, s.jaw);

// ---- headgear ----
/** The base elf's: a thin silver fillet with the star of Elbereth (the balloon elf's). */
const fillet = (c: Ctx, j: number): string => {
  const d = wx('M-50,-22Q-24,-36 0,-40Q24,-36 50,-22', j);
  return `<path d="${d}" fill="none" stroke-width="4"/><path d="${d}" fill="none" stroke="#e9eef0" stroke-width="2.2"/>` + star(0, -41, 12, '#f6fbff', .9, .62) + `<circle cx="0" cy="-41" r="3.2" fill="#bfe0f2" stroke-width=".5"/>`;
};
/** The Noldo's: a tall gold circlet with a great white gem on the brow and small gems on the band. */
const circlet = (c: Ctx, j: number): string => {
  const band = wx('M-51,-26Q-26,-42 0,-46Q26,-42 51,-26L50,-19Q26,-35 0,-39Q-26,-35 -50,-19Z', j);
  return `<path d="${band}" fill="${c.url('g')}" stroke-width="1.1"/><path d="${wx('M-51,-26Q-38,-35 -26,-39L-24,-32Q-38,-28 -50,-19Z', j)}" fill="${c.url('p')}" stroke="none"/>` +
    `<path d="${wx('M8,-44Q30,-40 48,-27', j)}" fill="none" stroke="#fff6d8" stroke-width="1" opacity=".7"/>` +
    // the great gem in a pointed setting that rises over the band and hangs onto the forehead
    `<path d="M0,-62L10,-44L0,-24L-10,-44Z" fill="${c.url('g')}" stroke-width="1.1"/><path d="M0,-56L6.5,-44L0,-30L-6.5,-44Z" fill="#e8f4ff" stroke-width=".8"/>` +
    `<path d="M0,-56L-6.5,-44L0,-30Z" fill="#8ab8de" opacity=".55" stroke="none"/><path d="M-1.5,-49L1.5,-52" fill="none" stroke="#fff" stroke-width="1.2"/>` +
    [-1, 1].map((d) => `<circle cx="${n(d * 27 * j)}" cy="-37" r="3" fill="#dff0ff" stroke-width=".7"/>${c.fine(`<circle cx="${n(d * 40 * j)}" cy="-31" r="2" fill="#9fd0f0" stroke-width=".5"/>`)}`).join('');
};
/** The Silvan's green hood (outer shape minus the face's opening), its rim crowned with leaves. */
const HOOD_OUT = 'M-72,72C-80,20 -74,-46 -42,-70C-22,-84 22,-84 42,-70C74,-46 80,20 72,72Z';
const HOOD_IN = 'M-50,46C-58,-6 -44,-52 0,-54C44,-52 58,-6 50,46L34,72L-34,72Z';
const hood = (c: Ctx, s: Spec): string => {
  const sh = 'M-72,72C-80,20 -74,-46 -42,-70C-30,-78 -16,-82 0,-83C-30,-70 -52,-40 -54,72Z';
  const leaves = [[-50, 30, -10], [-55, 10, -16], [-54, -12, -28], [-46, -32, -40], [-32, -46, -60], [-14, -53, -78], [6, -54, 84], [24, -50, 66], [40, -40, 48], [50, -22, 32], [55, 0, 18], [53, 22, 8]] as const;
  return `<path fill-rule="evenodd" d="${HOOD_OUT}${HOOD_IN}" fill="${c.url('k')}" stroke-width="1.3"/><path d="${sh}" fill="${c.url('p')}" stroke="none"/>` +
    `<path d="${HOOD_IN}" fill="none" stroke="${s.cloak[0]}" stroke-width="3" opacity=".6"/>` +
    c.fine('<path d="M-64,-20C-70,6 -70,36 -68,64M66,-20C72,6 72,36 70,64M-40,-68C-52,-56 -60,-40 -62,-24" fill="none" stroke-width=".6" opacity=".6"/>') +
    `<path d="M40,-70C62,-54 74,-28 76,2" fill="none" stroke="${light(s.cloak[2], .4)}" stroke-width="1.4" opacity=".55"/>` +
    leaves.map(([x, y, r], i) => `<g transform="translate(${x},${y}) rotate(${r}) scale(${c.med ? 1.5 : 1.25})">${leaf(i % 3 === 0 ? '#b0a040' : i % 2 ? '#4f8a3c' : '#6fa048', .8, '#203018')}</g>`).join('') +
    `<g transform="translate(0,-58) scale(1.6)">${leaf('#c9a842', .8, '#4a3a10')}</g>`;
};
/** The bow over the right shoulder, behind the hood. */
const bowStave = (c: Ctx): string =>
  `<path d="M84,56C92,30 96,6 90,-16" fill="none" stroke-width="6"/><path d="M84,56C92,30 96,6 90,-16" fill="none" stroke="#8a5a30" stroke-width="4"/>` +
  `<path d="M86,48C92,28 94,8 90,-10" fill="none" stroke="#c4925a" stroke-width="1.2" opacity=".8"/><path d="M90,-16l-3,-5" fill="none" stroke-width="2"/>${c.fine('')}`;

// ---- the whole figure ----
const draw = (s: Spec): Draw => (o) => {
  const c = ctx(o);
  const soft = s.softHair, paleCloth = s.paleCloth;
  const j = s.jaw * (s.man ? 1.04 : 1);
  const eo: EyeO = { lidFill: dark(s.skin[1], .1), lowFill: s.skin[1], ...s.eye, lash: c.fem, size: c.fem ? 1.06 : 1 };
  const under = s.man ? '.2' : '.12';
  const tilted = (side: number): string => `<g transform="rotate(${-side * s.tilt} ${21 * side} 0)">${eye(c, side, eo).replace('opacity=".8"/>', `opacity="${under}"/>`)}</g>`;
  const head = s.head === 'fillet' ? pen(c, fillet(c, j), true) : s.head === 'circlet' ? pen(c, circlet(c, j)) : s.head === 'hood' ? pen(c, hood(c, s)) : '';
  const body =
    (s.bow ? pen(c, bowStave(c)) : '') +
    (s.head === 'hood' ? '' : pen(c, backHair(c, s), soft)) +
    pen(c, ear(c, s, -1) + ear(c, s, 1), true) +
    pen(c, neck(c, s), true) + pen(c, bust(c, s), paleCloth) +
    pen(c, face(c, s), true) +
    (s.beard && !c.fem ? pen(c, beard(c, s), soft) : '') +
    pen(c, nose(c, s) + mouth(c, s) + tilted(-1) + tilted(1) + brow(c, -1, s.brow) + brow(c, 1, s.brow), true) +
    pen(c, cap(c, s), soft) +
    (s.head === 'hood' ? head : '') +
    (s.locks ? pen(c, locks(c, s), soft) : '') +
    (s.head === 'hood' ? pen(c, ear(c, s, -1) + ear(c, s, 1), true) : head);
  return svg(c, defs(c, s), body);
};

// ---- the elf, the three kindreds, the half-elf; the men and the women ----
const BASE: Spec = {
  skin: ['#9c7e6a', '#d4b49a', '#eed8c0'], hair: ['#9a7a3a', '#dcc078', '#fbf0c8'],
  brow: { thin: true, sc: 1.2, rot: 8, fill: '#8a6a32', hi: '#f0dca0', dy: .5 }, eye: { iris: '#4f7088', lid: 2.4 },
  head: 'fillet', cloak: ['#3c473c', '#5f6d5a', '#8f9c86'], tunic: '#cfd4c6', trim: SILVER, brooch: 'leaf',
  ear: 1, man: false, beard: false, locks: false, len: 96, bow: false, softHair: true, paleCloth: false, jaw: .98, wide: 1.06, tilt: 5,
};
const NOLDO: Spec = {
  ...BASE, skin: ['#94786a', '#ccae98', '#ead2bc'], hair: ['#0e0f14', '#30323c', '#8a90a4'], softHair: false,
  brow: { ...BASE.brow, fill: '#1c1c22', hi: '#6a7080', rot: 7 }, eye: { iris: '#8c9ca8', lid: 2 },
  head: 'circlet', cloak: ['#111a38', '#22356c', '#4a66a6'], tunic: '#2a3460', trim: '#d8b45a', brooch: 'star',
};
const SINDA: Spec = {
  ...BASE, skin: ['#a2928c', '#dccbbe', '#f6ece2'], hair: ['#868d94', '#e8ecee', '#ffffff'],
  brow: { ...BASE.brow, fill: '#c4c8cc', hi: '#ffffff' }, eye: { iris: '#5c6f80', lid: 3 },
  head: 'none', cloak: ['#454c54', '#737c86', '#a4acb4'], tunic: '#c8ccd0', trim: SILVER, brooch: 'clasps', len: 110,
};
const SILVAN: Spec = {
  ...BASE, skin: ['#90705a', '#c8a084', '#e6c6a6'], hair: ['#5a2010', '#a84a22', '#f0a060'], softHair: false,
  brow: { ...BASE.brow, fill: '#7a3018', hi: '#e8904c' }, eye: { iris: '#5e6a30', lid: 2.2 },
  head: 'hood', cloak: ['#1c3a1e', '#356236', '#6a985a'], tunic: '#6a4628', trim: '#a07a40', brooch: 'none', bow: true,
};
const HALF: Spec = {
  ...BASE, skin: ['#8e6c56', '#c09a80', '#e0c0a2'], hair: ['#2e1c12', '#5e3c26', '#b89a7c'], softHair: false,
  brow: { thin: true, fill: '#3a2618', hi: '#9a7a5c', sc: 1.26, rot: 4, dy: .5 }, eye: { iris: '#4a5862', lid: 2.6 },
  head: 'none', cloak: ['#3a1a1a', '#66302a', '#985040'], tunic: '#5a4430', trim: '#c4a868', brooch: 'leaf',
  ear: .3, man: true, beard: true, len: 66, jaw: 1.02, wide: 1.08, tilt: 0,
};
/** The women: the same kindred, a narrower face, slender brows, the long locks in front. */
const fem = (s: Spec, brow: BrowO = {}): Spec => ({ ...s, brow: { ...s.brow, thin: true, sc: 1.08, rot: 3, dy: -1.5, ...brow }, jaw: s.man ? .94 : .9, locks: true, len: Math.max(s.len, 112), beard: false, wide: s.wide * .9 });
const FEM: Readonly<Record<string, Spec>> = {
  elf: fem(BASE),
  noldo: fem(NOLDO),
  sinda: fem(SINDA),
  silvan: fem(SILVAN),
  halfelf: fem(HALF, { fill: '#4a3020' }),
};

const pair = (id: string, m: Spec): Draw => { const dm = draw(m), df = draw(FEM[id]!); return (o) => (o.sex === 'female' ? df(o) : dm(o)); };

export const portraits: PortraitSet = {
  elf: pair('elf', BASE),
  noldo: pair('noldo', NOLDO),
  sinda: pair('sinda', SINDA),
  silvan: pair('silvan', SILVAN),
  halfelf: pair('halfelf', HALF),
};
