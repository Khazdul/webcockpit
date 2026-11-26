// The bear's portraits: a Beorning who has changed shape (stage 80, ADR
// 0169): the card shows the id `bear` while `Char.StatusVars` says the race
// is "Bear" (src/panes/portrait.ts), by the character's sex. The same
// engraving as the peoples' (notes/research/portraits/style.md), on the same parts: head units, the eye line at y=0,
// light from the viewer's upper right, the ink pen for the coat and the
// soft pen for the muzzle and the eyes.
//
// A brown bear of Wilderland, head and shoulders, facing the viewer: a wide
// low skull, round ears set far apart, small amber eyes on the eye line, a
// pale muzzle with a black nose, cheek fur in rounded tongues, a ruff and a
// shaggy back that leaves the frame. The coat is the Beorning's pelt hood
// (men.ts `pelt`) come alive.
//
//   male    dark umber, the widest skull and muzzle, a heavy brow ridge
//           that drops toward the nose, an old scar through the left brow
//   female  the same bear a size finer: honey-brown, a narrower skull and
//           a slimmer muzzle, ears that look larger for it, an open brow,
//           and what the Beorning woman keeps when she changes: a band of
//           plaited cord and heather round the neck
//
// Medium (about 40 px, and the round tokens below that): the head sits lower
// and smaller than at Large so that both ears stay inside the inscribed circle.

import type { Draw, PortraitSet } from './types';
import { dark, hatch, light } from '../../art/engrave';
import { type Ctx, INK, baseDefs, ctx, lg, mass, mix, n, pen, shade, strands, svg, thick, wx } from './parts';

/** What the she-bear wears: the heather band (the owner chose it over a thong and bead, 2026-11-26). */
type Adorn = 'none' | 'heather';

/** One bear: everything a sex changes. */
interface Spec {
  /** The coat: shadow, mid, light. */
  fur: readonly [string, string, string];
  /** The light strands. */
  sheen: string;
  /** The muzzle: shadow, mid, light. */
  snout: readonly [string, string, string];
  /** The skull's width factor. */
  jaw: number;
  /** The muzzle's width factor. */
  muz: number;
  /** The ruff's and the shoulders' width factors. */
  ruff: number;
  wide: number;
  /** The ears' radius. */
  ear: number;
  /** The brow: a heavy ridge that drops toward the nose, or an open arch. */
  heavy: boolean;
  iris: string;
  /** The upper lid's drop and the eye's scale. */
  lid: number;
  eye: number;
  scar: boolean;
  adorn: Adorn;
}

type P = readonly [number, number];
type Seg = readonly [P, P, P];

/** The viewer's left half of an outline: from `a` on the axis down cubic `segs`, every x widened by `k`. */
const half = (a: P, segs: readonly Seg[], k = 1): string =>
  `M${n(a[0] * k)},${a[1]}` + segs.map((s) => 'C' + s.map(([x, y]) => `${n(x * k)},${y}`).join(' ')).join('');
/** The closed outline, symmetric about x=0, of that half. */
const sym = (a: P, segs: readonly Seg[], k = 1): string => {
  let back = '';
  for (let i = segs.length - 1; i >= 0; i--) {
    const [c1, c2] = segs[i]!, to = i ? segs[i - 1]![2] : a;
    back += `C${n(-c2[0] * k)},${c2[1]} ${n(-c1[0] * k)},${c1[1]} ${n(-to[0] * k)},${to[1]}`;
  }
  return half(a, segs, k) + back + 'Z';
};

/**
 * The bear is drawn in the peoples' head units and then enlarged (`ZOOM`): a
 * bear's skull is low over the eyes, and at the peoples' scale it would fill
 * half the frame they fill. The pen filter stays outside the enlargement,
 * the stroke widths are divided by it, and the hatching gets patterns of its
 * own (`P`, `Q`) with the gap and the line divided too: the same pen.
 */
const ZOOM = { large: { k: 1.22, dy: -3 }, medium: { k: 1.08, dy: 9 } } as const;
const defs = (c: Ctx, s: Spec): string => {
  const k = ZOOM[c.o.size].k;
  return baseDefs(c) + (c.med ? shade(c, 'P', 38, 3, .6) + shade(c, 'Q', -52, 3.4, .5) : hatch(c.id('P'), 38, (3 * 1.6) / k, .6, .95 / k) + hatch(c.id('Q'), -52, (3.4 * 1.6) / k, .5, .95 / k)) + more(c, s);
};
const more = (c: Ctx, s: Spec): string =>
  lg(c, 'z', s.fur, .2) + lg(c, 'u', s.snout) + lg(c, 'y', [dark(s.fur[0], .25), s.fur[1]]);

// ---- the back and the shoulders: a shaggy outline that leaves the frame ----
const BACK: readonly Seg[] = [
  [[-30, 18], [-56, 18], [-72, 26]], [[-82, 22], [-94, 30], [-94, 40]], [[-106, 38], [-116, 48], [-112, 58]],
  [[-124, 60], [-130, 72], [-124, 82]], [[-134, 88], [-136, 100], [-130, 108]], [[-134, 122], [-134, 138], [-134, 150]],
];
const back = (c: Ctx, s: Spec): string => {
  const w = s.wide;
  const B = sym([0, 18], [...BACK, [[-90, 150], [-40, 150], [0, 150]]], w);
  return mass(B, c.url('z'), 1.2, wx('M0,18C-30,18 -56,18 -72,26C-82,22 -94,30 -94,40C-106,38 -116,48 -112,58C-124,60 -130,72 -124,82C-134,88 -136,100 -130,108C-134,122 -134,138 -134,150L-76,150C-80,104 -70,60 -40,24Z', w), c,
    wx('M-72,26C-82,22 -94,30 -94,40C-106,38 -116,48 -112,58C-124,60 -130,72 -124,82C-134,88 -136,100 -130,108C-134,122 -134,138 -134,150L-108,150C-110,110 -102,66 -72,26Z', w)) +
    strands(c, wx('M-116,76C-110,88 -108,100 -110,112M-102,54C-96,70 -96,84 -100,96M-90,44C-84,56 -84,66 -86,74M-106,118C-102,130 -102,140 -104,150M-92,104C-88,120 -88,134 -90,146M116,76C110,88 108,100 110,112M102,54C96,70 96,84 100,96M90,44C84,56 84,66 86,74M106,118C102,130 102,140 104,150M92,104C88,120 88,134 90,146', w),
      wx('M108,62C102,76 100,88 102,98M94,44C90,56 90,64 92,72M122,90C116,102 116,112 118,120M98,108C94,120 94,132 96,142M-96,70C-92,82 -92,92 -94,100', w), s.sheen, .75) +
    `<path d="${wx('M74,27C92,30 110,46 122,74', w)}" fill="none" stroke="${light(s.fur[2], .35)}" stroke-width="1.4" opacity=".5"/>`;
};

// ---- the ruff: the long fur of the neck and the chest, in rounded tongues ----
const RUFF: readonly Seg[] = [
  [[-74, 22], [-84, 34], [-88, 48]], [[-80, 50], [-78, 56], [-84, 66]], [[-76, 70], [-74, 78], [-78, 90]],
  [[-68, 90], [-62, 96], [-64, 108]], [[-52, 104], [-44, 110], [-42, 122]], [[-32, 114], [-20, 120], [-14, 130]], [[-10, 124], [-4, 122], [0, 126]],
];
const ruff = (c: Ctx, s: Spec): string => {
  const w = s.ruff;
  return mass(sym([0, 10], [[[-30, 10], [-52, 8], [-66, 10]], ...RUFF], w), c.url('z'), 1.2,
    half([0, 10], [[[-30, 10], [-52, 8], [-66, 10]], ...RUFF.slice(0, 6)], w) + `C${n(-30 * w)},100 ${n(-40 * w)},60 ${n(-30 * w)},30Z`, c,
    half([-66, 10], RUFF.slice(0, 4), w) + `C${n(-66 * w)},80 ${n(-64 * w)},50 ${n(-56 * w)},22Z`) +
    strands(c, wx('M-58,56C-60,70 -64,80 -70,88M-44,60C-46,78 -50,92 -56,104M-28,66C-28,86 -30,102 -36,116M-10,70C-10,90 -10,108 -12,124M12,70C12,90 14,108 16,124M30,66C32,86 36,102 40,114M46,60C50,78 54,92 58,102M60,54C64,68 68,78 72,86', w),
      wx('M20,70C22,90 24,106 26,120M38,64C42,82 46,96 50,108M54,58C60,72 64,82 68,90M70,40C76,50 80,58 82,64M-36,66C-36,84 -40,100 -44,112', w), s.sheen, .65);
};

// ---- the ears ----
const ears = (c: Ctx, s: Spec): string => {
  const x = n(47 * s.jaw), y = -40, r = s.ear;
  const one = (d: number): string =>
    `<circle cx="${d * x}" cy="${y}" r="${r}" fill="${d < 0 ? mix(s.fur[0], s.fur[1], .3) : mix(s.fur[1], s.fur[2], .45)}" stroke-width="1.2"/>` +
    (d < 0 ? `<circle cx="${d * x}" cy="${y}" r="${r}" fill="${c.url('p')}" stroke="none"/>` : `<path d="M${n(x + r * .2)},${n(y - r * .92)}A${r},${r} 0 0 1 ${n(x + r * .94)},${n(y - r * .1)}" fill="none" stroke="${light(s.fur[2], .4)}" stroke-width="1.3" opacity=".6"/>`) +
    `<ellipse cx="${n(d * (x - 1))}" cy="${y + 2}" rx="${n(r * .56)}" ry="${n(r * .6)}" fill="${dark(s.fur[0], .45)}" stroke-width=".8"/>` +
    c.fine(`<path d="M${n(d * (x - r * .4))},${n(y + r * .5)}q${d * 1.5},${n(-r * .5)} ${d * 4},${n(-r * .8)}M${n(d * x)},${n(y + r * .55)}q${d * 1},${n(-r * .5)} ${d * 3},${n(-r * .85)}" fill="none" stroke="${s.sheen}" stroke-width=".7" opacity=".6"/>`);
  return one(-1) + one(1);
};

// ---- the head: a wide low skull, the cheeks' fur in tongues, the jowls ----
const HEAD: readonly Seg[] = [
  [[-22, -49], [-42, -45], [-53, -31]], [[-61, -20], [-65, -6], [-64, 6]], [[-71, 9], [-75, 18], [-72, 27]],
  [[-68, 26], [-66, 28], [-66, 33]], [[-71, 38], [-70, 47], [-63, 53]], [[-60, 51], [-57, 53], [-55, 57]],
  [[-52, 63], [-44, 67], [-36, 66]], [[-26, 70], [-12, 71], [0, 71]],
];
const head = (c: Ctx, s: Spec): string => {
  const j = s.jaw, H = sym([0, -48], HEAD, j);
  const sh = half([0, -48], HEAD.slice(0, 7), j) + `C${n(-30 * j)},48 ${n(-36 * j)},26 ${n(-31 * j)},8C${n(-30 * j)},-14 ${n(-20 * j)},-36 0,-48Z`;
  const deep = half([-53 * 1, -31], HEAD.slice(1, 6), j) + `C${n(-56 * j)},36 ${n(-58 * j)},16 ${n(-54 * j)},-2C${n(-52 * j)},-14 ${n(-50 * j)},-24 ${n(-53 * j)},-31Z`;
  return `<path d="${H}" fill="${c.url('z')}" stroke-width="1.2"/><path d="${sh}" fill="#2a170c" opacity=".22" stroke="none"/><path d="${sh}" fill="${c.url('p')}" stroke="none"/><path d="${deep}" fill="${c.url('q')}" stroke="none"/>` +
    // the lit cheek and the crown's sheen
    `<path d="${wx('M30,-40C44,-34 54,-20 56,-4C58,10 62,20 64,30C56,22 50,8 46,-6C42,-20 38,-32 30,-40Z', j)}" fill="${light(s.fur[2], .25)}" opacity=".3" stroke="none"/>` +
    strands(c, wx('M-30,-38C-38,-30 -44,-20 -48,-8M-17,-43C-23,-36 -27,-28 -29,-19M-51,6C-57,14 -61,22 -63,30M-41,14C-47,24 -51,34 -53,44M-34,32C-38,42 -41,50 -42,60M30,-38C38,-30 44,-20 48,-8M17,-43C23,-36 27,-28 29,-19M51,6C57,14 61,22 63,30M41,14C47,24 51,34 53,44M34,32C38,42 41,50 42,60M-6,-44C-8,-38 -9,-32 -9,-26M6,-44C8,-38 9,-32 9,-26', j),
      wx('M22,-43C30,-37 36,-29 38,-19M38,-34C46,-26 52,-14 54,-2M47,10C53,20 57,30 59,40M38,28C42,38 45,46 46,56M-24,-40C-31,-33 -36,-25 -38,-16', j), s.sheen) +
    c.fine(`<path d="M0,-44C-1,-36 1,-28 0,-18" fill="none" stroke-width=".6" opacity=".55"/>`);
};

// ---- the muzzle: pale, long, the black nose, the mouth's calm line ----
const muzzle = (c: Ctx, s: Spec): string => {
  const m = s.muz, [u0, u1, u2] = s.snout;
  const M = wx('M-9,-9C-13,2 -24,10 -27,22C-30,33 -26,43 -16,47C-8,51 8,51 16,47C26,43 30,33 27,22C24,10 13,2 9,-9C4,-12 -4,-12 -9,-9Z', m);
  const sh = wx('M-9,-9C-13,2 -24,10 -27,22C-30,33 -26,43 -16,47C-12,49 -8,50 -4,50C-15,40 -16,22 -6,0Z', m);
  // the bridge fades into the brow: the fill has no line over the top, only down the sides and round the chin
  const side = wx('M-12,0C-17,8 -25,13 -27,22C-30,33 -26,43 -16,47C-8,51 8,51 16,47C26,43 30,33 27,22C25,13 17,8 12,0', m);
  const nose = wx('M-13,16C-13,11 -6,9.5 0,9.5C6,9.5 13,11 13,16C13,22 8,27 2.5,28.5L0,32L-2.5,28.5C-8,27 -13,22 -13,16Z', Math.max(m, .9));
  return `<path d="${M}" fill="${c.url('u')}" stroke="none"/><path d="${sh}" fill="${u0}" opacity=".35" stroke="none"/><path d="${sh}" fill="${c.url('p')}" stroke="none"/><path d="${side}" fill="none" stroke-width="1"/>` +
    `<ellipse cx="${n(4 * m)}" cy="0" rx="${n(4 * m)}" ry="9" fill="${light(u2, .5)}" opacity=".5" stroke="none"/>` +
    // the lower jaw under the mouth, in shadow
    `<path d="${wx('M-11,41C-6,40 -2,39.6 0,40.2C2,39.6 6,40 11,41C8,45.6 4,46.8 0,46.8C-4,46.8 -8,45.6 -11,41Z', m)}" fill="${mix(u0, '#3a2014', .18)}" stroke-width=".7"/>` +
    // the upper lips: two heavy flews that close over the jaw and hang at the corners
    `<path d="${wx('M0,36.5C-5,39.5 -12,39 -17,41.5C-20,43 -21,46 -20,48', m)}" fill="none" stroke-width="1.4"/><path d="${wx('M0,36.5C5,39.5 12,39 17,41.5C20,43 21,46 20,48', m)}" fill="none" stroke-width="1.4"/><path d="M0,31V36.5" fill="none" stroke-width="1.1"/>` +
    `<path d="${nose}" fill="#17100c" stroke-width="1.1"/><path d="${wx('M-9.5,19.5C-8,16 -4,16.5 -3,20C-5,22.5 -8.5,22.5 -9.5,19.5ZM9.5,19.5C8,16 4,16.5 3,20C5,22.5 8.5,22.5 9.5,19.5Z', Math.max(m, .9))}" fill="#050302" stroke="none"/>` +
    `<path d="M${n(2 * m)},12.4Q${n(8 * m)},12.6 ${n(10.5 * m)},16" fill="none" stroke="#9aa0a6" stroke-width="1.3" opacity=".75"/>` +
    c.fine(`<path d="${wx('M-20,27l.6,.6M-17,31l.6,.6M-21,33l.6,.6M-16,36l.6,.6M20,27l.6,.6M17,31l.6,.6M21,33l.6,.6M16,36l.6,.6', m)}" fill="none" stroke-width="1" opacity=".6"/><path d="${wx('M-5,-4C-7,4 -10,9 -14,13', m)}" fill="none" stroke-width=".6" opacity=".5"/>`);
};

// ---- the eyes: small, amber, deep under the brow; the parts' living eye with a bear's dark white ----
const eyeOf = (c: Ctx, s: Spec, d: number): string => {
  const lid = s.lid, x = n(21.5 * (s.jaw > .96 ? 1 : .97));
  return `<g transform="translate(${d * x},0) rotate(${d * 5}) scale(${s.eye})"><ellipse cy="0" rx="13.5" ry="10.5" fill="#1c100a" opacity=".62" mask="${c.url('e')}"/>` +
    `<g clip-path="${c.url('c')}"><path d="M-8.5,0Q0,-8 8.5,0Q0,6 -8.5,0Z" fill="#4a3424"/><circle r="5.2" fill="${s.iris}"/><circle r="5.2" fill="none" stroke="#2a180c" stroke-width=".9"/><circle r="2.4" fill="#0c0705"/><circle cx="-1.7" cy="-1.8" r="1.3" fill="#fff8e6"/>` +
    `<path d="M-12,${-22 + lid}H12V${-5.5 + lid}Q0,${-3.5 + lid} -12,${-5.5 + lid}Z" fill="${dark(s.fur[1], .3)}" stroke="${INK}" stroke-width=".7"/><path d="M-12,18H12V4.6Q0,3.8 -12,4.6Z" fill="${dark(s.fur[1], .2)}" stroke="${INK}" stroke-width=".6"/></g>` +
    `<path d="M-8.5,0Q0,-8 8.5,0Q0,6 -8.5,0Z" fill="none" stroke="${INK}" stroke-width="1.1"/><path d="M-9.5,${n(.6 + lid * .5)}Q0,${n(-8.8 + lid)} 9.5,${n(.6 + lid * .5)}" fill="none" stroke="${INK}" stroke-width="1.7" stroke-linecap="round"/>` +
    // the dark tear line toward the muzzle
    `<path d="M${-8.5 * d},.5q${-3 * d},2.5 ${-4 * d},6" fill="none" stroke="${INK}" stroke-width="1" opacity=".7"/>` +
    c.fine(`<path d="M${-6 * d},7q${6 * d},3.5 ${13 * d},-.5" fill="none" stroke="${INK}" stroke-width=".55" stroke-linecap="round" opacity=".5"/>`) + '</g>';
};
/** The brow over the eye on side `d`: the boar's heavy ridge, hatched, dropping toward the nose; the sow's an open arch of lighter fur. */
const browOf = (c: Ctx, s: Spec, d: number): string => {
  const g = (body: string): string => `<g transform="scale(${d},1)">${body}</g>`;
  if (s.heavy) {
    const R = 'M-38,-9C-33,-18 -19,-19 -9,-9C-7,-7 -7,-4 -9,-3.5C-16,-9 -28,-10 -36,-4C-38,-4 -39,-7 -38,-9Z';
    return g(`<path d="${R}" fill="${d < 0 ? dark(s.fur[0], .2) : mix(s.fur[0], s.fur[1], .5)}" stroke-width=".9"/>${d < 0 ? `<path d="${R}" fill="${c.url('p')}" stroke="none"/>` : ''}` +
      c.fine(`<path d="M-33,-8l2,-5M-28,-10l2,-5M-23,-11l1.5,-5M-18,-10l1,-4.5M-13,-8l.5,-4" fill="none" stroke="${s.sheen}" stroke-width=".7" opacity=".7"/>`));
  }
  const R = 'M-35,-9C-30,-15.5 -18,-16 -10,-10.5C-9,-9 -10,-8 -11.5,-8.5C-18,-12.5 -28,-12 -33.5,-7C-35,-7 -36,-7.5 -35,-9Z';
  return g(`<path d="${R}" fill="${d < 0 ? dark(s.fur[0], .1) : mix(s.fur[0], s.fur[1], .35)}" stroke-width=".7"/>` +
    c.fine(`<path d="M-31,-9.5l1.5,-4M-26,-11.5l1.5,-4M-21,-12.5l1,-4M-16,-12l.5,-3.5" fill="none" stroke="${s.sheen}" stroke-width=".6" opacity=".7"/>`));
};
const eyesOf = (c: Ctx, s: Spec): string => eyeOf(c, s, -1) + eyeOf(c, s, 1);
const brows = (c: Ctx, s: Spec): string =>
  browOf(c, s, -1) + browOf(c, s, 1) +
  // an old scar through the viewer's left brow and down the cheek
  (s.scar ? c.fine(`<path d="M-33,-27C-30,-20 -28,-15 -27,-10M-27,6C-26,11 -24,15 -21,19" fill="none" stroke="${INK}" stroke-width="2.4" opacity=".7"/><path d="M-33,-27C-30,-20 -28,-15 -27,-10M-27,6C-26,11 -24,15 -21,19" fill="none" stroke="#d2ab8c" stroke-width="1.2"/>`) : '');

// ---- what the she-bear wears ----
/** A point of the band round the neck: under the jowls at the sides, down over the ruff in the middle. */
const band = (t: number, w: number): P => [n(62 * w * t), n(86 - 30 * t * t)];
const HEATHER = ['#8e4f86', '#b06aa0', '#cf97c4'] as const;
/** A band of plaited cord and heather in flower. */
const heather = (c: Ctx, s: Spec): string => {
  const w = s.ruff, N = 13;
  const [x0, y0] = band(-1, w), [x1, y1] = band(1, w);
  const cord = `M${x0},${y0}Q0,${n(86 + 30)} ${x1},${y1}`;
  let out = `<path d="${cord}" fill="none" stroke="${INK}" stroke-width="${c.med ? 5 : 6.6}"/><path d="${cord}" fill="none" stroke="#7d6a3c" stroke-width="${c.med ? 3.4 : 4.6}"/>` +
    c.fine(`<path d="${cord}" fill="none" stroke="#c9b27e" stroke-width="1.1" stroke-dasharray="2.2 3.4" opacity=".8"/>`);
  for (let i = 0; i < N; i++) {
    const t = -1 + (2 * i + 1) / N, [x, y] = band(t, w), up = i % 2 ? -1 : 1, lit = t > .1;
    // two leaves and a spike of bells that leans along the band
    out += c.fine(`<path d="M${n(x - 5)},${n(y + 2 * up)}q-4,${-3 * up} -8,${-1 * up}q3,${3.6 * up} 8,${1 * up}ZM${n(x + 5)},${n(y - 2 * up)}q4,${3 * up} 8,${1 * up}q-3,${-3.6 * up} -8,${-1 * up}Z" fill="${lit ? '#6f8a52' : '#4c6540'}" stroke-width=".6"/>`);
    const bells: readonly (readonly [number, number, number])[] = c.med
      ? [[0, 0, 5.2], [-3.4, -4.4 * up, 3.8]]
      : [[-3.2, 1.6 * up, 3.3], [3, .6 * up, 3.5], [-.4, -3.6 * up, 3.2], [2.6, -6.6 * up, 2.5], [-3.6, -6.2 * up, 2.2]];
    out += bells.map(([dx, dy, r], k) => `<circle cx="${n(x + dx)}" cy="${n(y + dy)}" r="${r}" fill="${HEATHER[(k + (lit ? 1 : 0)) % 3 === 0 ? 0 : lit ? 1 + (k % 2) : k % 2]}" stroke-width=".6"/>`).join('') +
      c.fine(`<circle cx="${n(x + 3.6)}" cy="${n(y - .6 * up)}" r=".9" fill="#f3dcec" stroke="none"/>`);
  }
  return out;
};
// ---- the whole bear ----
const draw = (s: Spec): Draw => (o) => {
  const c = ctx(o), z = ZOOM[o.size];
  const big = (body: string, soft = false): string => pen(c, `<g transform="translate(0,${z.dy}) scale(${z.k})">${body}</g>`, soft);
  const body = big(back(c, s)) + big(ruff(c, s)) + (s.adorn === 'heather' ? big(heather(c, s), true) : '') +
    big(ears(c, s)) + big(head(c, s)) + big(muzzle(c, s), true) + big(brows(c, s)) + big(eyesOf(c, s), true);
  return svg(c, defs(c, s), thick(body, 1 / z.k).replaceAll(c.url('p'), c.url('P')).replaceAll(c.url('q'), c.url('Q')));
};

const BOAR: Spec = {
  fur: ['#2e1c11', '#5e3c24', '#916840'], sheen: '#d0a674', snout: ['#8c6a46', '#bf9c6e', '#dcc296'],
  jaw: 1, muz: 1, ruff: 1, wide: 1, ear: 15, heavy: true, iris: '#b07a28', lid: 3.6, eye: .98, scar: true, adorn: 'none',
};
const SOW: Spec = {
  fur: ['#6a3a1a', '#a8682e', '#d8a058'], sheen: '#f6d49a', snout: ['#b08a5c', '#dcbe8e', '#f0deb8'],
  jaw: .9, muz: .8, ruff: .84, wide: .88, ear: 15.5, heavy: false, iris: '#b8842e', lid: 2.8, eye: 1.02, scar: false, adorn: 'heather',
};

const pair = (m: Spec, f: Spec): Draw => { const dm = draw(m), df = draw(f); return (o) => (o.sex === 'female' ? df(o) : dm(o)); };

/** The bear's drawings (both sexes behind the one id), the form a Beorning takes (stage 80, ADR 0169). */
export const portraits: PortraitSet = {
  bear: pair(BOAR, SOW),
};
