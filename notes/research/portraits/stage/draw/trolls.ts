// The trolls' portraits (stage 77's portrait pass, notes/research/portraits/
// style.md). The base troll is the balloon troll's head (src/weather/balloons/
// passengers/troll.ts: the boulder skull with its brow ledge, the stone hide,
// the small amber eyes deep under the ledge, the broad flat nose, the wide
// mouth with an underbite of tusks, the jug ears, the lichen; the brown pelt
// with the hair on over one shoulder) re-composed as a bust: the head sunk
// between huge shoulders, wider than any other people's.
// The three kinds are that same figure with one mark pushed hard:
//   cavetroll      dark green and covered in scales: a scale pattern over the
//                  whole hide, a crest of scales along the crown, pale eyes
//   hilltroll      tan, armoured in hard horny plates on the skull and the
//                  shoulders, a great stone hammer's haft over the shoulder
//   mountaintroll  the tallest skull and the wildest hair: a vast pale mane
//                  flaring round the head, cold blue-grey hide
// The women: the same bulk, hide, pelt and colour; read as women by their
// coarse hair (two thick braids with bone rings, as the dwarf women's),
// a rounder jaw, lips, lashes, smaller tusks and bone ornaments.

import type { Draw, PortraitSet } from '../../../../../src/panes/portraits/types';
import { dark, light } from '../../../../../src/art/engrave';
import { type BrowO, type Ctx, type EyeO, type HairCols, INK, baseDefs, braid, brow, ctx, lg, longHair, mir, mix, n, pen, strands, svg, wx } from '../parts';

/** One troll: everything a kind or a sex changes. */
interface Spec {
  /** The hide: shadow, mid, light. */
  skin: readonly [string, string, string];
  /** The pelt over the shoulder: dark fur, light fur tips. */
  pelt: readonly [string, string];
  /** Hair (the women's braids, the mountain troll's mane): shadow, light, sheen. */
  hair: HairCols;
  /** none: a bald boulder with bristles and moss; mane: the mountain troll's. */
  top: 'bald' | 'scales' | 'plates' | 'mane';
  /** The extra height of the skull (head units). */
  tall: number;
  hammer: boolean;
  /** The hair is pale (soft pen). */
  pale: boolean;
  eye: EyeO;
  brow: BrowO;
  /** The face width factor. */
  jaw: number;
}

const BONE = '#e2dabd', BONE2 = '#c9bf9d', LICHEN = '#b0a85c';

// ---- the palette ----
const STONE = ['#60665a', '#8f937e', '#bdbda4'] as const;
const CAVE = ['#22301d', '#405636', '#6a7f4e'] as const;
const HILL = ['#664a2e', '#9c7a50', '#c6a472'] as const;
const MOUNT = ['#4e5862', '#808c96', '#b2bcc2'] as const;

const rnd = (s: number) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

const defs = (c: Ctx, s: Spec): string =>
  baseDefs(c) + lg(c, 's', s.skin, .15) + lg(c, 'h', [s.hair[0], s.hair[1]]) + lg(c, 'w', ['#3e2a18', '#6e4d2e', '#94704a']) + lg(c, 'g', ['#5a5a52', '#86867a', '#aeae9e'], .3) +
  // the cave troll's scales: overlapping arcs (Large only; Medium shows the colour)
  (c.med
    ? `<pattern id="${c.id('z')}" patternUnits="userSpaceOnUse" width="4" height="4"><rect width="4" height="4" fill="none"/></pattern>`
    : `<pattern id="${c.id('z')}" patternUnits="userSpaceOnUse" width="11" height="8"><path d="M0,8Q5.5,1.5 11,8M-5.5,4Q0,-2.5 5.5,4M5.5,4Q11,-2.5 16.5,4" fill="none" stroke="${INK}" stroke-width=".7" opacity=".5"/><path d="M2,6.5Q5.5,3.5 8,5" fill="none" stroke="#b8cc8a" stroke-width=".6" opacity=".35"/></pattern>`);

// ---- the skull ----
const headPath = (c: Ctx, s: Spec): string => {
  const t = s.tall, top = -64 - t;
  const lower = c.fem
    ? 'L57,-4C59,8 59,20 53,31C45,42 26,47 0,47C-26,47 -45,42 -53,31C-59,20 -59,8 -57,-4'
    : 'L57,-4C60,6 63,16 62,28C61,39 51,45 36,46L0,47L-36,46C-51,45 -61,39 -62,28C-63,16 -60,6 -57,-4';
  return wx(`M-30,${top + 3}C-12,${top - 4} 12,${top - 4} 30,${top + 3}C46,${top + 9} 56,-42 56,-22${lower}L-56,-22C-56,-42 -46,${top + 9} -30,${top + 3}Z`, s.jaw);
};

const ears = (c: Ctx, s: Spec): string => {
  const E = wx('M-55,-16C-68,-28 -82,-16 -77,0C-74,12 -64,16 -56,8Z', s.jaw), I = wx('M-62,-10C-70,-14 -74,-4 -70,4', s.jaw);
  const ring = c.fem ? `<path d="${wx('M-71,8C-74,14 -72,20 -68,21', s.jaw)}" fill="none" stroke="${BONE2}" stroke-width="1.6"/><g transform="translate(${n(-67 * s.jaw)},21) rotate(8)"><path d="M-2.4,0Q0,-1 2.4,0Q2.6,7 0,11Q-2.6,7 -2.4,0Z" fill="${BONE}" stroke-width=".8"/></g>` : '';
  return `<path d="${E}" fill="${dark(s.skin[1], .1)}" stroke-width="1.2"/><path d="${E}" fill="${c.url('p')}" stroke="none"/><path d="${I}" fill="none" stroke-width=".8"/>${ring}` +
    `<path d="${mir(E)}" fill="${s.skin[2]}" stroke-width="1.2"/><path d="${mir(I)}" fill="none" stroke-width=".8"/>${ring ? mirG(ring) : ''}`;
};
/** A group mirrored left to right. */
const mirG = (s: string): string => `<g transform="scale(-1,1)">${s}</g>`;

const face = (c: Ctx, s: Spec): string => {
  const j = s.jaw, t = s.tall, top = -64 - t, F = headPath(c, s);
  const sh = wx(`M-30,${top + 3}C-46,${top + 9} -56,-42 -56,-22L-57,-4C-60,6 -63,16 -62,28C-61,39 -51,45 -36,46C-24,47 -14,47 -6,46C-28,40 -38,24 -40,4C-42,-20 -36,${top + 18} -12,${top - 1}Z`, j);
  const mid = wx(`M-30,${top + 3}C-46,${top + 9} -56,-42 -56,-22L-57,-4C-60,6 -63,16 -62,28C-61,39 -51,45 -36,46C-30,46 -24,46 -20,45C-40,36 -48,18 -49,0C-50,-22 -44,${top + 14} -22,${top + 1}Z`, j);
  const edge = wx(`M-30,${top + 3}C-46,${top + 9} -56,-42 -56,-22L-57,-4C-60,6 -63,16 -62,28C-61,36 -56,42 -48,44C-57,32 -58,10 -56,-8C-55,-30 -48,${top + 10} -26,${top + 2}Z`, j);
  const scales = s.top === 'scales' ? `<path d="${F}" fill="${c.url('z')}" stroke="none"/>` : '';
  // the brow ledge, a shelf of stone over the eyes, and its shadow
  const ledge = wx('M-58,-26C-44,-36 -14,-34 0,-26C14,-34 44,-36 58,-26L57,-12C44,-19 16,-18 0,-10C-16,-18 -44,-19 -57,-12Z', j);
  const lichen = s.top === 'bald'
    ? `<ellipse cx="-34" cy="${-40 - t * .5}" rx="8" ry="4.5" fill="${LICHEN}" opacity=".55" stroke="none"/><ellipse cx="38" cy="30" rx="7" ry="4" fill="#9aa05a" opacity=".5" stroke="none"/><ellipse cx="30" cy="-46" rx="4.5" ry="2.8" fill="#c29a50" opacity=".5" stroke="none"/>` +
      c.fine('<path d="M-36,-41h1.5M-31,-39h1.5M37,29.5h1.5M41,31.5h1.5" fill="none" stroke="#e3dc9a" stroke-width="1"/>')
    : '';
  const cracks = c.fine(`<path d="${wx(`M-18,${top + 1}l3,9l-3,6M22,${top + 2}l-3,8l5,7l-2,5M-52,10l8,3l3,8M52,16l-7,5l-2,7M-38,44l3,-5M36,40l-4,5M-44,-40l6,5`, j)}" fill="none" stroke-width=".6" opacity=".7"/>`);
  const jaw = c.fem
    ? `<path d="${wx('M-36,38C-24,45 -10,47 0,47C12,47 26,44 36,38C26,46 12,50 0,50C-12,50 -26,46 -36,38Z', j)}" fill="#1e170f" opacity=".22" stroke="none"/>`
    : `<path d="${wx('M-60,22Q0,34 61,21C62,32 54,44 36,46L0,47L-36,46C-54,44 -61,34 -60,22Z', j)}" fill="#1e170f" opacity=".14" stroke="none"/>`;
  return `<path d="${F}" fill="${c.url('s')}" stroke-width="1.3"/>${scales}<path d="${sh}" fill="#1e170f" opacity=".16" stroke="none"/><path d="${mid}" fill="#1e170f" opacity=".1" stroke="none"/><path d="${mid}" fill="${c.url('p')}" stroke="none"/><path d="${edge}" fill="${c.url('q')}" stroke="none"/>` +
    `<path d="${wx(`M-4,${top - 1}C14,${top - 1} 34,${top + 5} 46,${top + 16}C38,${top + 14} 20,${top + 10} 0,${top + 10}Z`, j)}" fill="#f4eed6" opacity=".2" stroke="none"/>` +
    `<path d="${wx(`M34,${top + 6}C48,${top + 14} 55,-40 55,-24L56,-4C58,6 60,14 61,22`, j)}" fill="none" stroke="#f6f0d8" stroke-width="1.3" opacity=".45"/>` +
    jaw + lichen + cracks +
    `<path d="${wx('M-50,-15C-34,-21 -12,-19 0,-13C12,-19 34,-21 50,-15C49,-4 40,7 24,8C14,8.5 7,5 0,4C-7,5 -14,8.5 -24,8C-40,7 -49,-4 -50,-15Z', j)}" fill="#1e170f" opacity=".2" stroke="none"/>` +
    `<path d="${wx('M-42,-12C-30,-17 -12,-15 0,-10C12,-15 30,-17 42,-12C40,-3 32,4 22,4.5C13,5 6,2 0,1C-6,2 -13,5 -22,4.5C-32,4 -40,-3 -42,-12Z', j)}" fill="#1e170f" opacity=".22" stroke="none"/>` +
    `<path d="${ledge}" fill="${dark(s.skin[1], .03)}" opacity=".7" stroke="none"/>${s.top === 'scales' ? `<path d="${ledge}" fill="${c.url('z')}" stroke="none"/>` : ''}<path d="${wx('M-58,-26C-54,-29 -50,-31 -46,-32C-48,-26 -50,-20 -56,-13Z', j)}" fill="${c.url('q')}" stroke="none"/>` +
    `<path d="${wx('M6,-28C18,-33 42,-33 56,-25', j)}" fill="none" stroke="#f6f0d8" stroke-width="1.2" opacity=".5"/>` +
    c.fine(`<path d="${wx('M-20,-24C-10,-27 10,-27 20,-24M-16,-20C-6,-22 6,-22 16,-20', j)}" fill="none" stroke-width=".6" opacity=".55"/><path d="M-30,16C-36,20 -40,28 -42,36M30,16C36,20 40,28 42,36" fill="none" stroke-width=".7" opacity="${c.fem ? .4 : .75}"/>`);
};

// ---- the eye: small and deep, a glint in the ledge's shadow; no socket ring, no outline round it ----
const tEye = (c: Ctx, side: number, s: Spec): string => {
  const o: EyeO = s.eye, lid = o.lid ?? 2, low = o.low ?? 0, k = (o.size ?? .8) * (c.fem ? 1.06 : 1);
  const lash = c.fem ? `<path d="M${7 * side},-2.5l${3 * side},-3M${8.4 * side},-.6l${3.6 * side},-1.4" fill="none" stroke="${INK}" stroke-width="1"/>` : '';
  return `<g transform="translate(${21 * side},0) scale(${k})"><g clip-path="${c.url('c')}"><path d="M-9,-6H9V6H-9Z" fill="#cbbf9e" stroke="none"/><path d="M-10,-6H10V-.8H-10Z" fill="#3d281b" opacity=".4" stroke="none"/>
<circle r="3.8" fill="${o.iris ?? '#a06a1e'}" stroke="none"/><circle r="1.8" fill="#0c0705" stroke="none"/><circle cx="-1.2" cy="-1.4" r="1" fill="#fff8e6" stroke="none"/>
<path d="M-12,${-22 + lid}H12V${-5.5 + lid}Q0,${-3.5 + lid} -12,${-5.5 + lid}Z" fill="${dark(s.skin[1], .14)}" stroke="none"/><path d="M-12,${18 - low}H12V${5 - low}Q0,${4 - low} -12,${5 - low}Z" fill="${dark(s.skin[1], .06)}" stroke="none"/></g>
<path d="M-9.5,${n(.6 + lid * .5)}Q0,${n(-8.8 + lid)} 9.5,${n(.6 + lid * .5)}" fill="none" stroke="${INK}" stroke-width="${c.fem ? 1.9 : 1.5}"/>${lash}</g>`;
};

// ---- the nose: broad, flat, the balloon's ----
const nose = (c: Ctx, s: Spec): string => {
  const [sk0, sk1] = s.skin;
  const k = c.fem ? .86 : 1;
  return `<g transform="translate(0,${c.fem ? 2 : 0}) scale(${k})"><path d="M0,-12C-6,-8 -8,4 -19,10C-22,14 -22,26 -16,30C-11,33 -4,33 -1,32C0,33 1,33 2,32C4,33 11,33 16,30C22,26 22,14 19,10C8,4 6,-8 0,-12Z" fill="${mix(sk0, sk1, .62)}" opacity=".9" stroke="none"/><path d="M-7,4C-10,8 -19,10 -21,20C-22,29 -11,33 -1,32C0,33 1,33 2,32C11,33 22,29 21,20C19,10 10,8 7,4" fill="none" stroke-width="1.2"/>
<path d="M-21,20C-28,21 -28,30 -19,30.5M21,20C28,21 28,30 19,30.5" fill="${dark(sk1, .12)}" stroke-width="1.1"/>
<path d="M-6,-8C-8,4 -19,10 -21,20C-22,29 -11,33 -4,32C-12,25 -11,12 -2,0Z" fill="${c.url('p')}" stroke="none"/>
<ellipse cx="6" cy="14" rx="5" ry="8" fill="#f3edd4" opacity=".4" stroke="none"/>
<path d="M-13,28.5q4,3 8.5,.5M13,28.5q-4,3 -8.5,.5" fill="none" stroke-width="1.2"/>${c.fine('<path d="M-2,6q3,6 1.5,12" fill="none" stroke-width=".5" opacity=".6"/>')}</g>`;
};

// ---- the mouth: wide, an underbite, two tusks; the women's with lips and small tusks ----
const tusk = (x: number, h: number, w: number): string =>
  `<path d="M${n(x - w)},41C${n(x - w - .5)},${n(41 - h * .55)} ${n(x - w * .4)},${n(41 - h * .9)} ${n(x + w * .5)},${n(41 - h)}C${n(x + w * .6)},${n(41 - h * .6)} ${n(x + w * .9)},${n(41 - h * .3)} ${n(x + w)},41Z" fill="${BONE}" stroke-width=".9"/>`;
const mouth = (c: Ctx, s: Spec): string => {
  const j = s.jaw;
  if (c.fem) {
    return `<path d="${wx('M-22,37C-14,34 -6,34.5 0,35.5C6,34.5 14,34 22,37C14,38.5 6,38.6 0,38.4C-6,38.6 -14,38.5 -22,37Z', j * .9)}" fill="#6a4238" stroke-width=".9"/><path d="${wx('M-18,38.2Q0,44.5 18,38.2Q0,39.6 -18,38.2Z', j * .9)}" fill="#8a5a4c" stroke-width=".8"/>` +
      c.fine('<path d="M2,41.5q3,.3 5,-.8" fill="none" stroke="#d8c2b2" stroke-width=".9" opacity=".7"/>') +
      tusk(-15 * j, 6, 2.4) + mirG(tusk(-15 * j, 6, 2.4));
  }
  return `<path d="${wx('M-32,35C-20,39.5 -8,40.5 0,40C8,40.5 20,39.5 32,34M-32,35l-2.5,-2M32,34l2.5,-2', j)}" fill="none" stroke-width="1.6"/>` +
    `<path d="${wx('M-24,41Q0,46 24,41', j)}" fill="none" stroke-width=".8" opacity=".7"/>` +
    tusk(-22 * j, 13, 3.4) + mirG(tusk(-22 * j, 13, 3.4)) +
    `<path d="M-4,40.2l.4,-3.4h3.6l.4,3.4ZM1.5,40.2l.4,-3.4h3.6l.4,3.4Z" fill="#ddd6b6" stroke-width=".7"/>`;
};

// ---- the bust: huge shoulders of bare hide, a pelt over the viewer's left one ----
const fur = (seed: number, x0: number, x1: number, y0: number, y1: number, inside: (x: number, y: number) => boolean, count: number): [string, string] => {
  const r = rnd(seed); let d = '', l = '';
  for (let i = 0; i < count; i++) {
    const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0);
    if (!inside(x, y)) continue;
    const s = `M${n(x)},${n(y)}l${n(-2 + r() * 1.5)},${n(5 + r() * 3)}`;
    if (i % 3) d += s; else l += s;
  }
  return [d, l];
};
/** A ragged fur edge from (x0,y0) to (x1,y1): tufts of uneven size and lean, pointing out to the right. */
const ragged = (x0: number, y0: number, x1: number, y1: number, seed: number): string => {
  const r = rnd(seed), dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), nx = dy / len, ny = -dx / len;
  let d = '', t = 0;
  while (t < 1) {
    const step = (.035 + r() * .05), t1 = Math.min(1, t + step), tm = (t + t1) / 2 + (r() - .5) * step * .5;
    const amp = 3 + r() * 9, lean = 2 + r() * 5;
    const tip = [x0 + dx * tm + nx * amp + lean * dx / len, y0 + dy * tm + ny * amp + lean * dy / len];
    const e = [x0 + dx * t1 + nx * (r() - .5) * 2, y0 + dy * t1 + ny * (r() - .5) * 2];
    d += `Q${n(x0 + dx * t + nx * amp * .7)},${n(y0 + dy * t + ny * amp * .7)} ${n(tip[0]!)},${n(tip[1]!)}Q${n(tip[0]! - nx * amp * .3)},${n(tip[1]! - ny * amp * .3 + 2)} ${n(e[0]!)},${n(e[1]!)}`;
    t = t1;
  }
  return d;
};
const bust = (c: Ctx, s: Spec): string => {
  const BODY = 'M-132,160L-132,80C-130,50 -110,32 -80,28C-66,26 -56,32 -48,42L48,42C56,32 66,26 80,28C110,32 130,50 132,80L132,160Z';
  const SH = 'M-132,160L-132,80C-130,50 -110,32 -80,28C-66,26 -56,32 -48,42L-30,42C-60,60 -80,100 -78,160Z';
  // the pelt: over the left shoulder and down across the chest, its edge ragged
  const PELT = 'M-132,160L-132,78C-130,48 -110,28 -80,24C-64,22 -52,30 -44,42' + ragged(-44, 42, 34, 160, 17) + 'Z';
  const [fd, fl] = fur(31 + s.tall, -128, 30, 26, 158, (x, y) => x < -10 + (y - 50) * .4 && x > -128, c.med ? 0 : 110);
  const pelt = `<path d="${PELT}" fill="${s.pelt[0]}" stroke-width="1.2"/><path d="M-132,160L-132,78C-130,48 -110,28 -80,24C-100,40 -110,70 -104,160Z" fill="${c.url('p')}" stroke="none"/><path d="M-132,160L-132,78C-130,54 -122,40 -108,30C-120,50 -124,90 -120,160Z" fill="${c.url('q')}" stroke="none"/>` +
    (c.med
      ? `<path d="M-90,40C-70,60 -50,90 -30,130M-110,60C-96,80 -80,110 -70,150" fill="none" stroke="${s.pelt[1]}" stroke-width="1.4" opacity=".4"/>`
      : `<path d="${fd}" fill="none" stroke-width=".7" opacity=".8"/><path d="${fl}" fill="none" stroke="${s.pelt[1]}" stroke-width=".9" opacity=".85"/>`) +
    c.fine('<path d="M-86,26l-4,-4l-1,5M-70,24l-2,-4l-2,4M-104,34l-4,-3l0,5" fill="none" stroke-width=".8"/>');
  // the sinew lacing that holds it, from the pelt's edge to the right armpit
  const lace = `<path d="M-20,50C10,58 50,66 96,92" fill="none" stroke-width="3.6"/><path d="M-20,50C10,58 50,66 96,92" fill="none" stroke="#b9a57a" stroke-width="2" stroke-dasharray="3 1.4"/>`;
  const plates = s.top === 'plates' ? platesBust(c, s) : '';
  const scales = s.top === 'scales' ? `<path d="${BODY}" fill="${c.url('z')}" stroke="none"/>` : '';
  // a necklace of teeth at the sides of the chest (the women's; under the ring at the middle)
  const neck = c.fem
    ? `<path d="M-48,44C-40,72 -16,84 0,84C16,84 40,72 48,44" fill="none" stroke-width="2.4"/><path d="M-48,44C-40,72 -16,84 0,84C16,84 40,72 48,44" fill="none" stroke="#b9a57a" stroke-width="1.2"/>` +
      ([[-45, 56, 22], [-38, 68, 16], [38, 68, -16], [45, 56, -22]] as const).map(([x, y, a]) => `<g transform="translate(${x},${y}) rotate(${a})"><path d="M-2.6,0Q0,-1.2 2.6,0Q2.8,7 0,12Q-2.8,7 -2.6,0Z" fill="${BONE}" stroke-width=".8"/></g>`).join('')
    : '';
  return `<path d="${BODY}" fill="${c.url('s')}" stroke-width="1.3"/>${scales}<path d="${SH}" fill="${c.url('p')}" stroke="none"/>` +
    `<path d="M70,30C96,30 120,44 128,70" fill="none" stroke="#f6f0d8" stroke-width="1.4" opacity=".45"/>` +
    c.fine('<path d="M88,50l6,4l-2,6M108,62l-5,5l3,5M74,40l3,4" fill="none" stroke-width=".6" opacity=".75"/>') +
    plates + pelt + lace + neck;
};

// ---- the hill troll's hard scales: horny plates on the skull and the shoulders ----
const plateRow = (c: Ctx, P: readonly (readonly [number, number, number, number])[], fill: string): string =>
  P.map(([x, y, w, h]) => {
    const d = `M${n(x - w)},${n(y + h * .4)}L${n(x - w * .7)},${n(y - h * .6)}L${n(x + w * .2)},${n(y - h)}L${n(x + w)},${n(y - h * .3)}L${n(x + w * .8)},${n(y + h * .7)}L${n(x - w * .1)},${n(y + h)}Z`;
    return `<path d="${d}" fill="${fill}" stroke-width="1.1"/>${x < 0 ? `<path d="${d}" fill="${c.url('p')}" stroke="none"/>` : `<path d="M${n(x - w * .4)},${n(y - h * .75)}L${n(x + w * .2)},${n(y - h * .92)}L${n(x + w * .85)},${n(y - h * .3)}" fill="none" stroke="#fff6dc" stroke-width="1.1" opacity=".5"/>`}`;
  }).join('');
const platesHead = (c: Ctx, s: Spec): string => {
  const t = s.tall, f = light(s.skin[1], .12);
  return plateRow(c, [[-36, -46 - t * .5, 13, 10], [-12, -55 - t, 13, 10], [14, -55 - t, 13, 10], [38, -46 - t * .5, 13, 10], [-24, -34, 11, 7], [0, -40, 10, 7], [24, -34, 11, 7]], f) +
    plateRow(c, [[-49, -2, 7, 10], [49, -2, 7, 10], [-50, 18, 7, 8], [51, 18, 7, 8]], dark(f, .04));
};
const platesBust = (c: Ctx, s: Spec): string => {
  const f = light(s.skin[1], .08);
  return plateRow(c, [[70, 40, 15, 11], [96, 46, 15, 12], [118, 62, 13, 12], [82, 64, 14, 11], [108, 82, 14, 12], [-70, 38, 15, 11], [-96, 46, 15, 12]], f);
};

// ---- the cave troll's crest: a row of scales along the crown ----
const crest = (c: Ctx, s: Spec): string => {
  const t = s.tall, top = -64 - t, out: string[] = [];
  const R = [[-40, top + 14, -30], [-22, top + 4, -14], [-4, top + 1, -3], [14, top + 2, 8], [32, top + 8, 22], [46, top + 20, 36]] as const;
  for (const [x, y, a] of R) {
    const fill = x < 0 ? dark(s.skin[1], .08) : light(s.skin[1], .1);
    out.push(`<g transform="translate(${x},${y}) rotate(${a})"><path d="M-8,4C-7,-4 -3,-12 1,-17C4,-10 8,-3 8,4Z" fill="${fill}" stroke-width="1.1"/>${x < 0 ? `<path d="M-8,4C-7,-4 -3,-12 1,-17C0,-8 -1,-2 0,4Z" fill="${c.url('p')}" stroke="none"/>` : '<path d="M2,-12C4,-7 6,-2 6.5,3" fill="none" stroke="#e4f0c4" stroke-width="1" opacity=".5"/>'}</g>`);
  }
  // big scales over the brow and the cheeks: the mark, drawn out at Large
  const big = c.fine(`<g fill="none" stroke-width=".8" opacity=".75">${([[-40, -44], [-22, -50], [0, -52], [22, -50], [40, -44], [-31, -38], [-11, -42], [11, -42], [31, -38], [-50, 8], [-52, 22], [50, 8], [52, 22], [-46, 34], [46, 34]] as const).map(([x, y]) => `<path d="M${x - 7},${y + 3}Q${x},${y - 5} ${x + 7},${y + 3}"/>`).join('')}</g>`);
  return out.join('') + big;
};

// ---- the bald troll's bristles and moss (the balloon's) ----
const bristles = (c: Ctx, s: Spec): string => {
  const top = -64 - s.tall;
  return `<path d="M-34,${top + 6}C-28,${top - 4} -12,${top - 6} -4,${top - 1}C-8,${top + 4} -26,${top + 8} -34,${top + 6}Z" fill="#5f7346" stroke-width=".9"/>` +
    c.fine(`<path d="M-28,${top + 3}q3,-3 7,-1.5M-18,${top}q3,-2.5 7,-.5" fill="none" stroke="#a9b77c" stroke-width=".8"/>`) +
    `<path d="M8,${top - 1}C8,${top - 6} 11,${top - 8} 9,${top - 12}M14,${top}C15,${top - 5} 18,${top - 6} 19,${top - 11}M20,${top + 1}C23,${top - 3} 26,${top - 4} 28,${top - 8}" fill="none" stroke-width="1"/>`;
};

// ---- hair: the cap over the skull, the women's braids, the mountain troll's mane ----
const cap = (c: Ctx, s: Spec, wild: boolean): string => {
  const t = s.tall, top = -66 - t, j = s.jaw, [, h1, hi] = s.hair;
  const C = wild
    ? ''
    : wx(`M-62,-4C-66,-48 -44,${top - 2} 0,${top - 2}C44,${top - 2} 66,-48 62,-4C58,-24 44,-38 6,-42L0,-37L-6,-42C-44,-38 -58,-24 -62,-4Z`, j);
  const S = wx(`M-58,-20C-62,-48 -44,${top - 2} 0,${top - 2}C-30,${top + 6} -46,-46 -48,-28Z`, j);
  if (wild) {
    const D = wx(`M-58,-20C-64,-48 -44,${top - 4} 0,${top - 4}C44,${top - 4} 64,-48 58,-20C48,-40 28,-48 0,-48C-28,-48 -48,-40 -58,-20Z`, j);
    // locks standing up off the dome, so its outline breaks like a thicket
    const crown = ([[-48, -46, -58, 22], [-32, top + 6, -34, 20], [-10, top + 1, -12, 16], [12, top + 1, 14, 16], [34, top + 7, 36, 20], [50, -46, 60, 22]] as const)
      .map(([x, y, a, L]) => lock(c, x * j, y, a, L, 20, x < 0 ? mix(s.hair[0], h1, .6) : h1, hi)).join('');
    const fringe = ([[-38, -46, 206, 24], [-12, -52, 190, 22], [14, -52, 170, 24], [40, -46, 154, 22]] as const)
      .map(([x, y, a, L]) => lock(c, x * j, y, a, L, 22, x < 0 ? mix(s.hair[0], h1, .55) : h1, hi)).join('');
    return `<path d="${D}" fill="${c.url('h')}" stroke-width="1.2"/><path d="${S}" fill="${c.url('p')}" stroke="none"/>` +
      strands(c, wx(`M-36,${top + 10}C-44,${top + 18} -50,-50 -52,-36M-14,${top + 1}C-22,${top + 10} -26,-56 -28,-48M14,${top + 1}C22,${top + 10} 26,-56 28,-48`, j),
        wx(`M2,${top - 2}C12,${top + 6} 20,-58 22,-50M30,${top + 8}C40,${top + 16} 48,-52 50,-38`, j), hi) + crown + fringe;
  }
  return `<path d="${C}" fill="${c.url('h')}" stroke-width="1.2"/><path d="${S}" fill="${c.url('p')}" stroke="none"/>` +
    strands(c, wx(`M-3,${top + 2}C-24,${top + 4} -48,-50 -58,-12M-2,${top + 10}C-18,${top + 14} -40,-44 -50,-22M-2,-46C-14,-46 -30,-40 -40,-32M3,${top + 2}C24,${top + 4} 48,-50 58,-12M2,${top + 10}C18,${top + 14} 40,-44 50,-22`, j),
      wx(`M3,${top + 4}C20,${top + 8} 40,-48 52,-16M-3,${top + 6}C-20,${top + 10} -38,-48 -48,-26M4,-44C16,-44 30,-38 40,-30`, j), hi) +
    `<path d="${wx(`M10,${top - 1}C30,${top + 2} 48,-52 54,-30`, j)}" fill="none" stroke="${light(h1, .3)}" stroke-width="1.2" opacity=".4"/>`;
};
/** One lock of hair: a wavy tapering lock from its root at (x,y), pointing `a` degrees from up, `L` long, `w` wide. */
const lock = (c: Ctx, x: number, y: number, a: number, L: number, w: number, fill: string, hi: string, wave = 1): string => {
  const h = w / 2, K = 8, sw = L * .09 * wave;
  const mid = (t: number) => [sw * Math.sin(t * Math.PI * 1.6) + L * .12 * t * t, -L * t] as const;
  const half = (t: number) => h * (1 - Math.pow(t, 1.8) * .78);
  const left: string[] = [], right: string[] = [], c1: string[] = [], c2: string[] = [];
  for (let i = 0; i <= K; i++) {
    const t = i / K, [mx, my] = mid(t), hw = half(t);
    left.push(`${n(mx - hw)},${n(my)}`); right.unshift(`${n(mx + hw)},${n(my)}`);
    if (i < K) { c1.push(`${n(mx - hw * .35)},${n(my)}`); c2.push(`${n(mx + hw * .4)},${n(my)}`); }
  }
  const [tx, ty] = mid(1), tw = half(1);
  const d = `M${left.join('L')}Q${n(tx)},${n(ty - tw * 2.2)} ${right.join('L')}Z`;
  const dark = Math.sin(a * Math.PI / 180) < -.2;
  return `<g transform="translate(${n(x)},${n(y)}) rotate(${n(a)})"><path d="${d}" fill="${fill}" stroke-width="1"/>${dark ? `<path d="M${left.join('L')}L${c1.slice().reverse().join('L')}Z" fill="${c.url('p')}" stroke="none"/>` : ''}` +
    strands(c, `M${c1.join('L')}`, `M${c2.slice(0, -1).join('L')}`, hi, .7) + '</g>';
};
/** The mountain troll's mane: locks flaring out all round the skull, longest at the sides, swept by the wind. */
const mane = (c: Ctx, s: Spec): string => {
  const [h0, h1, hi] = s.hair, out: string[] = [];
  const r = rnd(7);
  for (let k = 0; k < 2; k++) {
    for (let phi = -156; phi <= 156; phi += 24) {
      const a = phi + (k ? 12 : 0) + (r() - .5) * 14, rad = a * Math.PI / 180, sa = Math.sin(rad);
      const bx = sa * (k ? 50 : 56), by = -10 - Math.cos(rad) * (k ? 52 : 60);
      const L = (k ? 24 : 32) + 30 * Math.abs(sa) + r() * 12, w = 26 + r() * 8;
      const fill = a < 0 ? mix(h0, h1, k ? .5 : .3) : mix(h0, h1, k ? 1 : .8);
      out.push(lock(c, bx, by, a + (a < 0 ? -10 : 10), Math.min(L, 6 + Math.abs(sa) * 90), w, fill, hi));
    }
  }
  return out.join('');
};
/** The mane's shag over the cheeks, beside the face (over the ears). */
const shag = (c: Ctx, s: Spec): string => {
  const [h0, h1, hi] = s.hair, j = s.jaw;
  return ([[-58, -26, 186, 46, 14], [-62, -6, 196, 46, 13], [58, -26, 174, 46, 14], [62, -6, 164, 46, 13]] as const)
    .map(([x, y, a, L, w]) => lock(c, x * j, y, a, L, w, x < 0 ? mix(h0, h1, .5) : h1, hi)).join('');
};
const braids = (c: Ctx, s: Spec): string => {
  const x = 64 * s.jaw, ring = s.top === 'plates' ? BONE : s.top === 'scales' ? BONE2 : BONE;
  return braid(c, -x, -8, 11, 1.5, s.hair, ring) + braid(c, x, -8, 11, 1.5, s.hair, ring);
};

// ---- the hill troll's hammer: a stone maul lashed to a log, the haft over the shoulder ----
const hammer = (c: Ctx): string => {
  const HAFT = 'M48,160L70,-58L80,-57L60,161Z';
  // the maul: a blunt, roughly square stone, lashed on with crossed thongs
  const HEAD = 'M58,-58L88,-61L91,-29L60,-26Z';
  return `<path d="${HAFT}" fill="${c.url('w')}" stroke-width="1.3"/><path d="M48,160L70,-58L73,-57.7L52,160.5Z" fill="${c.url('p')}" stroke="none"/>` +
    c.fine('<path d="M66,40l2,-9M62,100l2,-9" fill="none" stroke-width=".6" opacity=".7"/>') +
    `<path d="${HEAD}" fill="${c.url('g')}" stroke-width="1.5"/><path d="M58,-58L66,-58.8L67,-26.7L60,-26Z" fill="${c.url('p')}" stroke="none"/><path d="M66,-59L88,-61L90,-40" fill="none" stroke="#fff6dc" stroke-width="1.3" opacity=".45"/>` +
    c.fine('<path d="M63,-50l4,3l-1,5M84,-36l-3,-4" fill="none" stroke-width=".6" opacity=".75"/>') +
    `<path d="M60,-54L89,-31M60,-31L88,-56M73,-61L75,-26" fill="none" stroke-width="3.4"/><path d="M60,-54L89,-31M60,-31L88,-56M73,-61L75,-26" fill="none" stroke="#b9a57a" stroke-width="1.8" stroke-dasharray="2.6 1.2"/>` +
    '<path d="M70,-26C66,-20 64,-14 66,-8M76,-26C78,-20 80,-16 78,-10" fill="none" stroke="#b9a57a" stroke-width="1.4"/>';
};

// ---- the whole figure ----
const draw = (s: Spec): Draw => (o) => {
  const c = ctx(o);
  const hairCols = s.hair;
  const back = (s.top === 'mane' ? pen(c, mane(c, s), s.pale) : '') +
    (c.fem && s.top !== 'mane' ? pen(c, longHair(c, { near: c.url('h'), cols: hairCols, len: 120, jaw: 1.32 }), s.pale) : '');
  const top = s.top === 'scales' ? crest(c, s) : s.top === 'plates' ? platesHead(c, s) : s.top === 'bald' && !c.fem ? bristles(c, s) : '';
  const hairTop = s.top === 'mane' ? cap(c, s, true) : c.fem ? cap(c, s, false) : '';
  const body = back + pen(c, bust(c, s)) + (s.hammer ? pen(c, hammer(c)) : '') +
    pen(c, ears(c, s)) + pen(c, face(c, s), true) + pen(c, top) +
    (hairTop ? pen(c, hairTop, s.pale) : '') + (s.top === 'mane' ? pen(c, shag(c, s), s.pale) : '') +
    pen(c, nose(c, s) + mouth(c, s), true) +
    pen(c, tEye(c, -1, s) + tEye(c, 1, s) + brow(c, -1, s.brow) + brow(c, 1, s.brow), true) +
    (c.fem ? pen(c, braids(c, s), s.pale) : '');
  return svg(c, defs(c, s), body);
};

// ---- the four kinds, the men and the women ----
const BASE: Spec = {
  skin: STONE, pelt: ['#6b4a2f', '#c9a877'], hair: ['#211c18', '#4a4038', '#9a9080'], top: 'bald', tall: 0, hammer: false, pale: false,
  eye: { iris: '#a06a1e', lid: 2.6, size: .8, socket: '#1e170f' }, brow: { fill: '#5e6252', hi: '#c8c8b0', sc: 1.05, dy: -4, rot: 8 }, jaw: 1,
};
const CAVETROLL: Spec = {
  ...BASE, skin: CAVE, pelt: ['#3a3028', '#8a7a62'], hair: ['#121a10', '#2c3626', '#7a8a6a'], top: 'scales',
  eye: { ...BASE.eye, iris: '#c8b84a', lid: 1.8 }, brow: { ...BASE.brow, fill: '#2c3a24', hi: '#9aac7a', rot: 12 },
};
const HILLTROLL: Spec = {
  ...BASE, skin: HILL, pelt: ['#4a3420', '#b08a50'], hair: ['#3e2214', '#6e4228', '#c08a60'], top: 'plates', hammer: true, jaw: 1.03,
  eye: { ...BASE.eye, iris: '#8a4a16', lid: 3.2, low: 1 }, brow: { ...BASE.brow, fill: '#5a4632', hi: '#d8c09a', rot: 14 },
};
const MOUNTAINTROLL: Spec = {
  ...BASE, skin: MOUNT, pelt: ['#4a3626', '#a88a66'], hair: ['#76726a', '#cfcac0', '#f8f5ee'], top: 'mane', tall: 8, pale: true,
  eye: { ...BASE.eye, iris: '#7a8ea0', lid: 1.4, low: 1.6 }, brow: { ...BASE.brow, fill: '#c8c4bc', hi: '#fbf8f0', sc: 1.25, rot: 18 },
};
/** The women: a rounder jaw, slender brows, lashes; the hair carries the kind's colour. */
const fem = (s: Spec, hair?: HairCols): Spec => ({ ...s, hair: hair ?? s.hair, jaw: s.jaw * .97, brow: { ...s.brow, thin: true, sc: 1.05, rot: (s.brow.rot ?? 0) * .5, dy: -3 }, eye: { ...s.eye, lid: Math.min(s.eye.lid ?? 2, 2.2) } });
const FEM: Readonly<Record<string, Spec>> = {
  troll: fem(BASE),
  cavetroll: fem(CAVETROLL),
  hilltroll: fem(HILLTROLL),
  mountaintroll: fem(MOUNTAINTROLL),
};

const pair = (id: string, m: Spec): Draw => { const dm = draw(m), df = draw(FEM[id]!); return (o) => (o.sex === 'female' ? df(o) : dm(o)); };

export const portraits: PortraitSet = {
  troll: pair('troll', BASE),
  cavetroll: pair('cavetroll', CAVETROLL),
  hilltroll: pair('hilltroll', HILLTROLL),
  mountaintroll: pair('mountaintroll', MOUNTAINTROLL),
};
