// Stage 75 (ADR 0159 round 3): a PORT of the approved mockup's goblin,
// notes/research/balloons/round5/skins/goblin.js, on the shared rig
// (../rig.ts). Geometry, markup, CSS and timings are the mockup's; only
// the types and the module shape (no harness: `passenger.spec(ctx)` is the
// mockup's `create(ctx)`) are new. Its own lazy chunk (../passenger.ts).
//
// Round 5: "The Goblin", built on the shared rig (rig.js). The goblin of the
// original (green, big ears, big yellow eyes, a hooked nose over the mouth),
// now a tinted engraving: a small, wiry goblin of the mountains in a stolen
// crate under a bag he stitched and daubed himself. For Orc, Tarkhnarb, and
// the likely default while the race is unknown.
//
// THE GOBLINS' VOCABULARY (decided before drawing; rule 2 of the brief)
//   Materials  stolen and scavenged, put together cleverly: sacking, sailcloth
//              and stolen banners sewn with fat crooked stitches; bent nails,
//              wire, hooks, scrap iron; teeth and rat skulls on strings; a few
//              looted shiny things. Nothing forged fine, nothing symmetrical.
//   Motifs     DAUBED with a rag: jagged teeth in a row, a slit eye, a great
//              grinning face, a skull, fat arrows. Spikes and hooks that break
//              the outline. Swags of skulls and stolen coins.
//   Colours    mud and sackcloth for the worthless; rust; stolen sea-green;
//              scarlet, bone and soot with looted gold for the best.
//   "The best" means HIS PROUDEST LOOT AND HANDIWORK: a taut new bag in scarlet
//              and bone with a great grinning face painted across it, hung
//              with skulls and stolen coins, a looted crown stuck on top.
//              Crooked, but magnificent.
//
// THE ENVELOPE LADDER (silhouette and colour both change)
//   poor    a sack of rags: sagging, lopsided, dented; mud-coloured scraps,
//           seven patches held with bent nails and string, a rag knot on top
//   meh     plain undyed sacking, a little slack, one patch, a rope girdle
//   good    sound: rust-red sailcloth, a soot-black band of daubed teeth, an
//           iron hook on top
//   great   fine: stolen sea-green sailcloth, one great yellow slit eye, a
//           band of bone teeth, iron spikes at the sides, a rat skull on top
//   superb  brand new and taut: scarlet and bone stripes, a great grinning
//           face across it, a swag of skulls and stolen coins, a ring of
//           spikes and a looted gold crown on top
// THE SPECIALS (none can be taken for a rating step)
//   unrated      new chalk-grey canvas, the face only sketched on in charcoal
//                (not painted yet), a paint drip or two
//   player kill  soot black, a white skull over crossed knives, blood-red
//                teeth above and below, iron spikes all round the outline
//   level up     mustard yellow, fat black arrows pointing up, teeth that
//                point up too, a red pennant on top
//   death        ash grey, half let down; the painted face crossed out (X
//                eyes, a drooping mouth), black rags tied on; the fire burns
//                cold blue
//   achievement  a stolen purple banner with gold edging, a great looted gold
//                dish nailed to it, a swag of coins
//
// The burner is a dented cooking pot of coals hung on wires, with a jagged
// grin cut in its side. The basket is a stolen crate mended with a plank and
// sacking. The sign is a banner laced to a pole. Instead of a wand he has a
// goblin's things: a coin he bites (unrated), a crooked knife (good, player
// kill), a sack of loot (great, superb), a looted crown slipping over one ear
// (superb), a little flag (level up), a stolen cup (achievement); his rat
// rides on the rim.

import type { Mood } from '../feed';
import { INK, K, kit, type BoardArgs, type EnvGeo, type EnvSpec, type FrameInfo, type PassengerDef, type Part, type RigBalloon, type RigCtx, type RigSpec } from '../rig';

const { n, S, SL, Z, G, ink2, NS, pp } = kit, HP = kit.P, HQ = kit.Q;
const { W, CX, HG, FY, RY, BY } = K;
// the head: drawn in units, shown at HS; HY is the eye line
const HS = .54, HY = RY - 48;
const FILT = (id: string) => kit.filt(id, { freq: .032, scale: 2.7, grain: .45 });
const HATCH = (id: string, rot: number, gap: number, op: number) => kit.hatch(id, rot, gap * 1.85, op, 1);

// ---- moods: ears first (degrees, positive droops), brows, lids, what he holds ----
/** A pose: CSS variables by name (and `mo`, the mouth shown). */
type Pose = Readonly<Record<string, number | string>>;
const DEF: Pose = { rise: 0, tilt: 0, el: 6, er: 9, bly: 0, blr: 0, bry: 0, brr: 0, lid: 3, sq: 0, low: 0, px: 0, py: 0, es: 1, hl: 1, hrt: 1, coin: 0, chin: 0, knife: 0, kup: 0, sack: 0, gold: 0, crown: 0, flag: 0, fup: 0, cup: 0, paint: 0 };
const M: Readonly<Record<string, Pose>> = {
  calibrating: { el: -18, er: 24, bly: -4, blr: -7, bry: 1.5, brr: -5, lid: 2, sq: 6, mo: 'flat', coin: 1, hrt: 0, tilt: 2 },
  poor: { rise: -3, el: 38, er: 43, blr: 13, brr: 13, lid: 10.5, py: 3, mo: 'frown' },
  meh: { rise: -1, tilt: -5, el: 21, er: 25, bly: 2, bry: 2, lid: 11, mo: 'wavy', chin: 1, hl: 0 },
  good: { el: -5, er: -9, blr: -5, brr: -4, lid: 3, low: 2, mo: 'smirk', knife: 1, hrt: 0 },
  great: { rise: 2, el: -21, er: -25, bly: -3, bry: -3, lid: 0, low: 3, mo: 'grin', sack: 1, hl: 0 },
  superb: { rise: 3, el: -34, er: -30, bly: -5, bry: -5.5, blr: 4, brr: 4, lid: 0, low: 5, es: 1.07, mo: 'grin', sack: 1, gold: 1, crown: 1, hl: 0 },
  pvp: { rise: 2, el: -27, er: -29, bly: 4, bry: 4, blr: -17, brr: -17, lid: 6, low: 4, mo: 'fang', knife: 1, kup: 1, paint: 1, hrt: 0 },
  levelup: { rise: 2, el: -40, er: -44, bly: -6, bry: -6, blr: 5, brr: 5, lid: 0, low: 6.5, es: 1.06, mo: 'grin', flag: 1, fup: 1, hl: 0, hrt: 0 },
  death: { rise: -4, tilt: -3, el: 55, er: 58, bly: -1, bry: -1, blr: 17, brr: 17, lid: 9, py: 2.5, mo: 'frown' },
  achievement: { rise: 2, tilt: 3, el: -14, er: -19, bly: -3.5, bry: -3, lid: 10, low: 2, mo: 'smirk', cup: 1, hrt: 0 },
};
const MOUTHS = ['flat', 'frown', 'wavy', 'smirk', 'grin', 'fang'];
// where the thing he holds is, for his glances (pupil units)
const PROP: Readonly<Record<string, readonly [number, number]>> = { calibrating: [2.5, 4], poor: [.5, -4], meh: [-4, 3], good: [5, 1.5], great: [-5, 1], superb: [-5, 1], pvp: [5, 0], levelup: [4.5, -2.5], achievement: [5, .5] };
const RANK: Readonly<Record<string, number>> = { poor: 1, meh: 2, good: 3, great: 4, superb: 5 };
const vars = (o: Pose) => Object.keys(o).filter((k) => k in DEF).map((k) => `--${k}:${o[k]}`).join(';');
const show = (...names: string[]) => names.map((nm) => `.goblin-${nm}{--x:var(--${nm})}`).join('');

const CSS = `
.goblin-v{${vars(DEF)};--coal:#e8862e;--go:.9}
${Object.keys(M).map((m) => `.goblin-v[data-mood=${m}]{${vars(M[m]!)}}\n.goblin-v[data-mood=${m}] .goblin-mo-${M[m]!.mo}{opacity:1}`).join('\n')}
.goblin-v[data-mood=death]{--rig-f1:#4f8fd0;--rig-f2:#cfe6ff;--rig-gl:120,170,255;--coal:#6f9ccb}
.goblin-v[data-mood=poor]{--rig-f1:#d5732a;--coal:#b0602c}
.goblin-v[data-mood=superb]{--rig-gl:255,196,120}
.goblin-v[data-sky=dusk]{--go:.65}.goblin-v[data-sky=day]{--go:.25}.goblin-v[data-sky=overcast]{--go:.38}
.goblin-v[data-mood=poor] .rig-envb{animation:goblin-heave 3.6s ease-in-out infinite alternate}
.goblin-coal{fill:var(--coal)}
.goblin-coalg{width:34px;height:22px;margin:-6px 0 0 -17px;border-radius:50%;opacity:.3;will-change:opacity;background:radial-gradient(closest-side,rgba(var(--rig-gl),.8),rgba(var(--rig-gl),0))}
.goblin-lift,.goblin-br,.goblin-look,.goblin-nod{position:absolute;left:0;top:0;width:${W}px;height:0;transform-origin:${CX}px ${RY + 8}px}
.goblin-lift{transform:translateY(calc(var(--rise)*-1px)) rotate(calc(var(--tilt)*1deg));transition:transform calc(.55s*var(--k)) cubic-bezier(.3,1.25,.5,1)}
.goblin-br{animation:goblin-br 3.4s ease-in-out infinite alternate}
.goblin-head{left:${n(CX - 100 * HS)}px;top:${n(HY - 75 * HS)}px}
.goblin-eL{transform:rotate(calc(var(--el)*1deg))}
.goblin-eR{transform:rotate(calc(var(--er)*1deg))}
.goblin-bL{transform:translateY(calc(var(--bly)*1px)) rotate(calc(var(--blr)*1deg))}
.goblin-bR{transform:translateY(calc(var(--bry)*1px)) rotate(calc(var(--brr)*1deg))}
.goblin-eL,.goblin-eR{transition:transform calc(.45s*var(--k)) cubic-bezier(.3,1.4,.5,1)}
.goblin-bL,.goblin-bR,.goblin-eye,.goblin-pm,.goblin-lid,.goblin-low{transition:transform calc(.4s*var(--k)) ease-out}
.goblin-eye{transform:scale(var(--es))}
.goblin-pm{transform:translate(calc(var(--px)*1px),calc(var(--py)*1px))}
.goblin-lid{transform:translateY(calc(var(--lid)*1px));fill:#73864f;stroke:${INK};stroke-width:1.8}
.goblin-eyeR .goblin-lid{transform:translateY(calc((var(--lid) + var(--sq))*1px))}
.goblin-low{transform:translateY(calc(var(--low)*-1px));fill:#8a9c61;stroke:${INK};stroke-width:1.4}
.goblin-mo{opacity:0;transition:opacity calc(.25s*var(--k))}
.goblin-v[data-mood=pvp] .goblin-lid{fill:#8a2a1c}.goblin-v[data-mood=pvp] .goblin-low{fill:#93301f}
.goblin-paint{opacity:var(--paint);transition:opacity calc(.3s*var(--k))}
.goblin-p{position:absolute;left:0;top:0;width:${W}px;height:0;opacity:var(--x);transform:translateY(calc((1 - var(--x))*26px));transition:transform calc(.5s*var(--k)) cubic-bezier(.3,1.25,.5,1),opacity calc(.14s*var(--k))}
${show('coin', 'chin', 'knife', 'sack', 'flag', 'fup', 'cup')}
.goblin-kup{position:absolute;left:0;top:0;width:${W}px;height:0;transform-origin:${CX + 40}px ${RY}px;transform:translateY(calc(var(--kup)*-5px)) rotate(calc(var(--kup)*-7deg));transition:transform calc(.4s*var(--k)) cubic-bezier(.3,1.3,.5,1)}
.goblin-gold{opacity:var(--gold)}
.goblin-crown{opacity:var(--crown);transition:opacity calc(.2s*var(--k))}
.goblin-hL{opacity:var(--hl)}.goblin-hR{opacity:var(--hrt)}
.goblin-hL,.goblin-hR{transition:opacity calc(.15s*var(--k))}
.goblin-flw{will-change:transform}
.goblin-pen{transform-origin:0 0;animation:goblin-pen 1.7s ease-in-out infinite alternate}
.goblin-rat{animation:goblin-rat 4.7s ease-in-out infinite}
.goblin-dng{will-change:transform}
.goblin-tears{display:none}
.goblin-v[data-mood=death] .goblin-tears{display:block}
.goblin-tear{position:absolute;width:5px;height:13px;overflow:hidden;transform-origin:50% 0}
.goblin-tear::before{content:"";position:absolute;left:1.9px;top:0;width:1.2px;height:11px;border-radius:1px;background:linear-gradient(rgba(196,216,230,.36),rgba(196,216,230,.05))}
.goblin-tear i{position:absolute;left:1.1px;top:-3px;width:2.8px;height:3.7px;border-radius:50% 50% 50% 50%/62% 62% 38% 38%;background:radial-gradient(circle at 35% 35%,rgba(236,244,250,.9),rgba(170,200,222,.72) 55%,rgba(112,152,188,.66));box-shadow:0 0 0 .5px rgba(24,34,54,.28);transform:translateY(var(--r));animation:goblin-tear 5.8s cubic-bezier(.4,0,.7,.7) infinite;animation-delay:var(--dl)}
@keyframes goblin-tear{0%{transform:translateY(0) scale(.5);opacity:0}12%{transform:translateY(1.5px) scale(1);opacity:.6}75%{opacity:.6}100%{transform:translateY(13px) scale(.9);opacity:0}}
@keyframes goblin-heave{from{transform:scale(1,1) skewX(0)}to{transform:scale(1.02,.962) skewX(1.3deg)}}
@keyframes goblin-br{from{transform:translateY(.5px) scale(1,.996)}to{transform:translateY(-.9px) scale(1,1.006)}}
@keyframes goblin-pen{from{transform:skewY(-5deg) scaleX(1)}to{transform:skewY(6deg) scaleX(.93)}}
@keyframes goblin-rat{0%,78%,100%{transform:none}82%{transform:translate(.8px,-.8px) rotate(-5deg)}88%{transform:translate(.3px,-.3px) rotate(-2deg)}93%{transform:translate(.8px,-.8px) rotate(-5deg)}}
.goblin-sign{filter:drop-shadow(0 2px 2.5px rgba(0,0,0,.42));--tx:#ece4cf;--dim:#bfb69f;--fg:#f3ead2;--on:#ece2c2;--off:rgba(236,226,194,.3);color:var(--tx)}
.goblin-sign[data-mood=poor]{--tx:#d6cab0;--fg:#d6cab0;--dim:#a99e86;--on:#c9b98a}
.goblin-sign[data-mood=good]{--fg:#ffe2b0;--on:#f3e6c0}
.goblin-sign[data-mood=great]{--fg:#ffe07a;--on:#f1d75c}
.goblin-sign[data-mood=superb]{--tx:#f8ecd0;--dim:#e3c9a0;--fg:#ffe08a;--on:#ffe9b0}
.goblin-sign[data-mood=pvp]{--tx:#f1ddd4;--fg:#ff9a7c;--on:#e8553c}
.goblin-sign[data-mood=levelup]{--fg:#ffd95e}
.goblin-sign[data-mood=death]{--tx:#c9c5bb;--fg:#d3cfc5}
.goblin-sign[data-mood=achievement]{--tx:#f2e8cc;--dim:#d2c49c}
.goblin-sign .rig-text{padding:9px 11px 7px}
.goblin-sign .rig-title,.goblin-sign .rig-fig{text-shadow:0 1px 0 rgba(0,0,0,.55)}
.goblin-sign .rig-fig{color:var(--fg)}
.goblin-sign[data-mood=superb] .rig-fig{font-weight:700}
.goblin-sign .rig-unit,.goblin-sign .rig-q,.goblin-sign .rig-more{color:var(--dim)}
.goblin-on{fill:var(--on);stroke:rgba(0,0,0,.65);stroke-width:.7}.goblin-of{fill:none;stroke:var(--off);stroke-width:1}
.goblin-red{fill:none;stroke:#e8553c;stroke-width:2.2;stroke-linecap:round}
.goblin-sign[data-kind=levelup] .rig-text{padding:14px 8px 12px}
.goblin-sign[data-kind=levelup] .rig-fig{font:700 21px/1.1 Cinzel,Georgia,serif;letter-spacing:.04em}
.goblin-sign[data-kind=death] .rig-text{padding:14px 8px 12px}
.goblin-sign[data-kind=death] .rig-fig{font:400 21px/1.15 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.17em;margin-right:-.17em;text-transform:lowercase;font-variant:small-caps}
.goblin-sign[data-kind=achievement] .rig-title{font:italic 600 13.5px/1.1 "Cormorant Garamond",Georgia,serif}
`;

// ---- the drawing: the goblin's head and shoulders (head units about the point between his eyes) ----
const EAR = 'M-5,-12C12,-23 33,-29 52,-25C45,-12 28,6 -3,12Z';
const ear = (u: number, s: number) => `<g transform="translate(${34 * s},-3) scale(${s},1)" filter="url(#gbf${u})" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round"><g class="${s < 0 ? 'goblin-eL' : 'goblin-eR'}">
<path d="${EAR}" fill="url(#gbs${u})" stroke-width="2"/><path d="M1,-9C14,-17 30,-21 43,-20C36,-11 23,0 2,6Z" fill="#55623a" stroke-width="1"/>
<path d="M1,-9C14,-17 30,-21 43,-20C30,-15 16,-9 4,-2Z" fill="url(#gbp${u})" stroke="none"/><path d="M8,-5C17,-10 26,-13 35,-15M9,1C16,-2 22,-6 28,-10" fill="none" stroke-width=".9" opacity=".7"/>
${s > 0 ? `<path d="M30,-8.500L34,-4L37,-10.500" fill="#170f0a" stroke-width="1.2"/>` : `<circle cx="24" cy="3.500" r="4.300" fill="none" stroke-width="3.200"/><circle cx="24" cy="3.500" r="4.300" fill="none" stroke="#b9a25e" stroke-width="1.500"/>`}</g></g>`;
const eye = (s: number, u: number) => `<g transform="translate(${17 * s},0)"><g class="goblin-eye${s > 0 ? ' goblin-eyeR' : ''}"><circle r="14.500" fill="#2f3a1f" opacity=".4"/>
<g clip-path="url(#gbc${u})"><circle r="12.500" fill="url(#gby${u})"/><path d="M-13,-13H13V-3Q0,-7 -13,-3Z" fill="#5a4a12" opacity=".4"/>
<g class="goblin-pm"><g class="goblin-pg"><ellipse rx="3.300" ry="5.600" fill="#15100a"/><circle cx="-1.800" cy="-2.600" r="1.700" fill="#fffbe6"/><circle cx="1.700" cy="2.600" r=".8" fill="#fffbe6" opacity=".6"/></g></g>
<g class="goblin-bl"><path class="goblin-lid" d="M-15,-42H15V-13Q0,-16.500 -15,-13Z"/></g><path class="goblin-low" d="M-15,42H15V13Q0,16.500 -15,13Z"/></g>
<circle r="12" fill="none" stroke="${INK}" stroke-width="1.7"/><path d="M-11.800,-3Q0,-17.500 11.800,-3" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
<path d="M${-9 * s},14.500q${9 * s},5 ${18 * s},-1.500M${-5 * s},18q${6 * s},3 ${12 * s},-.5" fill="none" stroke="${INK}" stroke-width=".9" stroke-linecap="round" opacity=".7"/></g></g>`;
const BROW = `<path d="M-13,2.500C-6,-5 6,-6.500 15,-1.500C16,1 14,3 11,2.500C4,.5 -4,1.500 -10,6C-13,7 -14,5 -13,2.500Z" fill="#2c2a1c" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/><path d="M-8,2l2,-3.500M-3,0l2,-3.500M3,-1l2,-3M8,-.5l2,-2.500" fill="none" stroke="#8a8a5c" stroke-width=".9" stroke-linecap="round"/>`;
const tooth = (x: number, y: number, h: number, w = 2.3) => `M${n(x - w)},${y}L${x},${n(y + h)}L${n(x + w)},${y}Z`;
const mouths = () => {
  const mo = (id: string, body: string) => `<g class="goblin-mo goblin-mo-${id}">${body}</g>`;
  const line = (d: string) => `<path d="${d}" fill="none" stroke-width="2.2"/>`;
  return mo('flat', line('M-13,29Q0,31.500 13,28')) + mo('frown', line('M-14,34Q0,23 14,34') + '<path d="M-5,37.500Q0,35.500 5,37.500" fill="none" stroke-width="1"/>')
    + mo('wavy', line('M-14,30q3.500,-3.500 7,0t7,0t7,0t7,0')) + mo('smirk', line('M-13,28Q4,35 18,22') + '<path d="M17,18q3.500,3 1.500,7" fill="none" stroke-width="1.1"/><path d="M8,30.500l1.800,4.500l2,-5.500Z" fill="#e9dfc2" stroke-width=".8"/>')
    + mo('grin', `<path d="M-23,19Q0,31 23,19Q14,41 0,41Q-14,41 -23,19Z" fill="#2a1410" stroke-width="1.8"/><path d="${[-17, -11.5, -6, 6, 11.5, 17].map((x) => tooth(x, 21.6 + (1 - (x / 23) ** 2) * 5.3, 6)).join('')}" fill="#e9dfc2" stroke-width=".8"/><path d="${[-9, 0, 9].map((x) => tooth(x, 39.6 - (x / 12) ** 2 * 2.6, -5.5)).join('')}" fill="#d9cdaa" stroke-width=".8"/><path d="M-26,16q-2,3 0,6M26,16q2,3 0,6" fill="none" stroke-width="1.1"/>`)
    + mo('fang', `<path d="M-19,26Q0,20 19,26Q10,37 0,37Q-10,37 -19,26Z" fill="#2a1410" stroke-width="1.8"/><path d="${tooth(-11, 35, -9, 2.6)}${tooth(11, 35, -9, 2.6)}${tooth(-4, 23.5, 5, 2)}${tooth(4, 23.5, 5, 2)}" fill="#e9dfc2" stroke-width=".8"/><path d="M-22,22q-2,3 0,7M22,22q2,3 0,7" fill="none" stroke-width="1.1"/>`);
};
const body = (u: number) => {
  const arm = (s: number) => `<path d="M${44 * s},72C${57 * s},78 ${59 * s},100 ${55 * s},134L${41 * s},134L${40 * s},80Z" fill="url(#gbs${u})" stroke-width="1.8"/>${s < 0 ? `<path d="M-44,72C-57,78 -59,100 -55,134L-48,134L-48,80Z" fill="url(#gbp${u})" stroke="none"/>` : ''}<path d="M${49 * s},96q${4 * s},3 ${5 * s},8" fill="none" stroke-width=".9" opacity=".7"/>`;
  const J = 'M-47,134L-45,76C-43,62 -30,56 -15,53L15,53C30,56 43,62 45,76L47,134Z';
  let fur = 'M-33,58';
  [[-29, 70], [-25, 61], [-20, 73], [-14, 64], [-8, 76], [-2, 66], [4, 77], [9, 66], [15, 74], [20, 63], [25, 71], [29, 61], [33, 58]].forEach(([x, y]) => { fur += `L${x},${y}`; });
  let teeth = '';
  ([[-15, 70], [-8, 75.5], [0, 77.5], [8, 75.5], [15, 70]] as const).forEach(([x, y], i) => { teeth += tooth(x, y, i === 2 ? 9 : 7, 2.2); });
  return `${arm(-1)}${arm(1)}<path d="${J}" fill="url(#gbl${u})" stroke-width="2"/><path d="M-47,134L-45,76C-43,62 -30,56 -18,53.500C-32,66 -34,90 -33,134Z" fill="url(#gbp${u})" stroke="none"/>
<path d="M-47,134L-45,76C-43,62 -38,58 -32,56C-40,68 -41,92 -41,134Z" fill="url(#gbq${u})" stroke="none"/>
<path d="M1,78V134" fill="none" stroke-width="1"/><path d="M-4,86l10,5M-4,96l10,5M-4,106l10,5M-4,116l10,5" fill="none" stroke="#d6c59a" stroke-width="1.4"/>
<path d="M22,62L34,66L-22,126L-36,120Z" fill="#3a2a1c" stroke-width="1.3"/><rect x="-2" y="88" width="11" height="10" rx="1.500" transform="rotate(-46 3.500 93)" fill="none" stroke="#b9a25e" stroke-width="2.200"/>
<path d="M24,84l12,3l-1,13l-12,-2Z" fill="#8f7d57" stroke-width="1"/><path d="M26,86.500l2,3M31,87.500l2,3M33.500,94l-2,3M27,95.500l2,2.500" fill="none" stroke="#e6d6a8" stroke-width="1"/>
<path d="${fur}L27,50L-27,50Z" fill="#8a7654" stroke-width="1.5"/><path d="M-24,57l2,7M-15,57l2,9M-6,58l1,10M5,58l0,11M14,57l-2,9M23,56l-2,8" fill="none" stroke-width=".8" opacity=".65"/><path d="M-27,52L-33,58L-27,66Z" fill="url(#gbp${u})" stroke="none"/>
<path d="M-11,34L-13,60Q0,66 13,60L11,34Z" fill="#6f8249" stroke-width="1.6"/><path d="M-11,34L-13,60Q-6,63 -2,63L-3,34Z" fill="url(#gbp${u})" stroke="none"/><path d="M-9,46Q0,51 9,46" fill="none" stroke-width="1" opacity=".6"/>
<path d="M-19,60Q0,84 19,60" fill="none" stroke="#17120e" stroke-width="2.200"/><path d="M-19,60Q0,84 19,60" fill="none" stroke="#b9a57a" stroke-width=".9"/><path d="${teeth}" fill="#e9dfc2" stroke-width=".9"/>`;
};
const SKULL = 'M-38,-8C-41,-33 -24,-45 0,-45C24,-45 41,-33 38,-8C37,10 27,27 10,39Q0,47 -10,39C-27,27 -37,10 -38,-8Z';
const head = (u: number) => `<svg class="rig-s goblin-head rig-rim" xmlns="${NS}" width="${200 * HS}" height="${215 * HS}" viewBox="-100 -75 200 215"><defs>${FILT('gbf' + u)}${HATCH('gbp' + u, 38, 3, .6)}${HATCH('gbq' + u, -52, 3.4, .5)}<clipPath id="gbc${u}"><circle r="12.500"/></clipPath></defs>
<g filter="url(#gbf${u})" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">${body(u)}</g>
${ear(u, -1)}${ear(u, 1)}
<g filter="url(#gbf${u})" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">
<path d="${SKULL}" fill="url(#gbs${u})" stroke-width="2.1"/>
<path d="M-38,-8C-41,-33 -24,-45 -6,-45C-24,-36 -29,-22 -27,-6C-26,12 -18,28 -6,40Q-8,41 -10,39C-27,27 -37,10 -38,-8Z" fill="#2f3a1f" opacity=".22" stroke="none"/>
<path d="M-38,-8C-41,-33 -24,-45 -8,-45C-25,-36 -31,-22 -30,-6C-29,10 -22,26 -10,39C-27,27 -37,10 -38,-8Z" fill="url(#gbp${u})" stroke="none"/>
<path d="M-38,-8C-41,-33 -24,-45 -19,-44C-30,-35 -35,-22 -34,-6C-33,6 -29,18 -22,28C-31,18 -37,6 -38,-8Z" fill="url(#gbq${u})" stroke="none"/>
<path d="M22,-41C32,-35 37,-24 36,-12C32,-24 28,-33 22,-41Z" fill="#fff" opacity=".28" stroke="none"/>
<path d="M-7,-45C-9,-55 -15,-59 -20,-59M0,-45.500C1,-56 5,-62 10,-64M7,-45C11,-51 16,-53 21,-52" fill="none" stroke-width="1.4"/>
<path d="M-17,-34C-6,-37 8,-37 18,-34M-11,-40C-4,-42 6,-42 12,-40M-3,-17v6M3,-17.500v5" fill="none" stroke-width=".9" opacity=".6"/>
<path d="M-27,22C-25,28 -20,33 -15,36M27,22C25,28 20,33 15,36M-33,8q2,7 6,11M33,8q-2,7 -6,11" fill="none" stroke-width=".9" opacity=".65"/>
<circle cx="-26" cy="-27" r="1.800" fill="#5d6a38" stroke-width=".8"/><circle cx="29" cy="15" r="1.500" fill="#5d6a38" stroke-width=".8"/><circle cx="-21" cy="29" r="1.200" fill="#5d6a38" stroke-width=".7"/>
<ellipse cx="-27" cy="16" rx="6" ry="4" fill="#a8684a" opacity=".2" stroke="none"/><ellipse cx="27" cy="16" rx="6" ry="4" fill="#b8704e" opacity=".22" stroke="none"/>
<g class="goblin-paint" stroke="none"><path d="M-37,-11C-20,-16 20,-16 37,-11L36,6C20,2 -20,2 -36,6Z" fill="#9c1f16" opacity=".82"/><path d="M-30,6l-1,7l3,-6ZM-12,3l0,6l2.500,-6ZM16,3l1,7l2,-7ZM31,6l0,5l2,-5Z" fill="#9c1f16" opacity=".8"/></g>
${mouths()}
<path d="M-3,-5C9,1 19,17 8,27C3,31 -6,27 -3,21C-1,15 -5,6 -3,-5Z" fill="#657a43" stroke-width="1.8"/><path d="M-3,-5C2,2 4,14 -1,24C-4,20 -1,15 -5,6Z" fill="url(#gbp${u})" stroke="none"/>
<path d="M9,11q3,6 -1,11" fill="none" stroke="#c6d19a" stroke-width="1.600" opacity=".7"/><path d="M-1,23q3,2.500 6,.5" fill="none" stroke-width="1.2"/><circle cx="6" cy="6" r="1.300" fill="#55623a" stroke-width=".6"/></g>
${eye(-1, u)}${eye(1, u)}
<g transform="translate(-17,-19) scale(-1,1)"><g class="goblin-bL">${BROW}</g></g><g transform="translate(17,-19)"><g class="goblin-bR">${BROW}</g></g>
</svg>`;

// the looted crown, too big for him, slipping over one ear (superb only)
const crown = (u: number) => S('goblin-crown rig-rim', -18, HY - 42, 44, 28, G(u, `<g transform="translate(4,${HY - 20.5}) rotate(13)"><path d="M-14,1L-15.500,-10L-9.500,-4.500L-5,-13L0,-5L5,-13L9.500,-4.500L15.500,-10L14,1Q0,5 -14,1Z" fill="url(#gbg${u})" stroke-width="1.1"/><path d="M-14,-2.500Q0,1.500 14,-2.500" fill="none" stroke-width=".6"/><path d="M-14,1Q-8,3 -4,3.300L-4,-4L-9.500,-4.500L-15.500,-10Z" fill="${HP(u)}" stroke="none"/><circle cx="0" cy="-.5" r="1.800" fill="#b3261c" stroke-width=".6"/><circle cx="-8" cy="-1.500" r="1.200" fill="#3f8a72" stroke-width=".5"/><circle cx="8" cy="-1.500" r="1.200" fill="#3d6fb5" stroke-width=".5"/><g fill="#fff0bd" stroke-width=".5"><circle cx="-15.500" cy="-10.500" r="1.300"/><circle cx="-5" cy="-13.500" r="1.300"/><circle cx="5" cy="-13.500" r="1.300"/><circle cx="15.500" cy="-10.500" r="1.300"/></g><path d="M7,-9.500L10.500,-5" fill="none" stroke="#fff" stroke-width=".9" opacity=".7"/></g>`));
// tears (death): two drops a cheek run slowly from the lid down the cheek, over a wet streak; they stay on his face
const tears = () => `<div class="rig-a goblin-tears">${([[-12.4, 7.5, '-17deg', 0], [7.4, 7.5, '17deg', -2.5]] as const).map(([x, y, a, dl]) => `<div class="goblin-tear" style="left:${CX + x}px;top:${HY + y}px;transform:rotate(${a})"><i style="--r:4px;--dl:${dl}s"></i><i style="--r:9px;--dl:${dl - 2.9}s"></i></div>`).join('')}</div>`;

// ---- what he holds: a thin forearm with a rag at the wrist rises from behind the rim (the elbow stays in the crate) ----
const fore = (u: number, ex: number, ey: number, hx: number, hy: number, w = 5.4) => {
  const dx = hx - ex, dy = hy - ey, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L, a = w / 2 + 1, b = w / 2;
  const at = (f: number, o: number) => `${n(ex + dx * f + nx * o)},${n(ey + dy * f + ny * o)}`;
  return `<path d="M${at(0, a)}L${at(1, b)}L${at(1, -b)}L${at(0, -a)}Z" fill="url(#gbs${u})" stroke-width="1"/><path d="M${at(0, -a)}L${at(1, -b)}L${at(1, 0)}L${at(0, 0)}Z" fill="${HP(u)}" stroke="none"/><path d="M${at(.66, b + 1)}L${at(.88, b + .8)}L${at(.88, -b - .8)}L${at(.66, -b - 1)}Z" fill="#8a7654" stroke-width=".8"/><path d="M${at(.73, b + .9)}L${at(.75, -b - .9)}M${at(.81, b + .8)}L${at(.8, -b - .8)}" fill="none" stroke-width=".45" opacity=".7"/>`;
};
const fist = (u: number, x: number, y: number, r = 4.2) => `<path d="M${n(x - r)},${y}C${n(x - r)},${n(y - r * 1.15)} ${n(x + r)},${n(y - r * 1.15)} ${n(x + r)},${y}C${n(x + r)},${n(y + r * .9)} ${n(x - r)},${n(y + r * .9)} ${n(x - r)},${y}Z" fill="url(#gbs${u})" stroke-width="1"/><path d="M${n(x - r * .4)},${n(y - r * .8)}v${n(r * .8)}M${n(x + r * .35)},${n(y - r * .82)}v${n(r * .8)}" fill="none" stroke-width=".5"/>`;
const PR = (cls: string, u: number, x: number, y: number, w: number, body: string) => `<div class="goblin-p ${cls}">${S('rig-rim', x, y, w, RY - y + 8, G(u, body))}</div>`;
const EY = RY + 3;
const coinArt = (x: number, y: number, r: number) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#d9b24c" stroke-width=".9"/><circle cx="${x}" cy="${y}" r="${n(r * .62)}" fill="none" stroke-width=".5"/><path d="M${n(x - r * .5)},${n(y - r * .45)}Q${x},${n(y - r * .95)} ${n(x + r * .4)},${n(y - r * .6)}" fill="none" stroke="#fff6d0" stroke-width=".9"/>`;
// the sack of loot rides on his left shoulder, behind his head; the fist that holds its neck is drawn with the props
const sack = (u: number) => `<div class="goblin-p goblin-sack">${S('rig-rim', -54, HY - 2, 44, RY - HY + 10, G(u, `
<path d="M-45,${HY + 36}C-53,${HY + 22} -47,${HY + 5} -34,${HY + 4}C-24,${HY + 3} -17,${HY + 12} -19,${HY + 23}L-15,${HY + 27}L-16,${HY + 33}L-23,${HY + 33}C-29,${HY + 40} -40,${HY + 42} -45,${HY + 36}Z" fill="#94825a" stroke-width="1.1"/>
<path d="M-45,${HY + 36}C-53,${HY + 22} -47,${HY + 5} -38,${HY + 4.5}C-44,${HY + 12} -44,${HY + 28} -38,${HY + 39.5}C-41,${HY + 39.5} -43,${HY + 38} -45,${HY + 36}Z" fill="${HP(u)}" stroke="none"/>
<path d="M-40,${HY + 12}q6,3 5,12M-30,${HY + 8}q4,6 2,14M-23,${HY + 31}q-6,-3 -9,-9" fill="none" stroke-width=".6" opacity=".7"/>
<path d="M-43,${HY + 24}l8,-2l2,7l-8,2Z" fill="#6f6348" stroke-width=".8"/><path d="M-42,${HY + 25.5}l1.500,2M-38,${HY + 23.5}l1.500,2M-36,${HY + 28.5}l-1.500,-1.800" fill="none" stroke="#e6d6a8" stroke-width=".8"/>
<g class="goblin-gold"><path d="M-36,${HY + 8}l5,3l-1,6l-5,-2Z" fill="#170f0a" stroke-width=".7"/>${coinArt(-33, HY + 11.5, 2.6)}${coinArt(-29.5, HY + 7, 2.9)}${coinArt(-37.5, HY + 6, 2.4)}<path d="M-33,${HY + 2}l1.200,-3.500l1.300,3.500l3.400,1l-3.400,1.200l-1.300,3.300l-1.200,-3.300l-3.300,-1.200Z" fill="#fffbe6" stroke-width=".4"/></g>`))}</div>`;
const props = (u: number) => {
  const ky = HY + 27, fy = HY + 24, cy = HY + 21;
  // the stolen coin he bites to see if it is real (unrated)
  return PR('goblin-coin', u, 2, HY + 8, 36, `${fore(u, 31, EY, 17, HY + 23)}${coinArt(11, HY + 16.5, 4.6)}${fist(u, 16, HY + 20.5, 4)}`)
    // cheek on his fist (meh)
    + PR('goblin-chin', u, -40, HY + 14, 36, `${fore(u, -24, EY, -15, HY + 26, 5.8)}${fist(u, -14, HY + 22.5, 4.6)}`)
    // the crooked knife (good; held higher for a player kill)
    + `<div class="goblin-p goblin-knife"><div class="goblin-kup">${S('rig-rim', 26, HY - 6, 30, RY - HY + 14, G(u, `${fore(u, 34, EY, 40, ky + 3)}
<path d="M39,${ky - 3}C37,${ky - 11} 38,${ky - 19} 43,${ky - 27}C45,${ky - 22} 46,${ky - 18} 48,${ky - 15.5}L45,${ky - 14}C46,${ky - 10} 45,${ky - 6} 43.500,${ky - 2.5}Z" fill="url(#gbi${u})" stroke-width="1"/>
<path d="M40.500,${ky - 5}C39.500,${ky - 12} 40,${ky - 18} 43,${ky - 24}" fill="none" stroke="#eef2f2" stroke-width=".9" opacity=".8"/><path d="M45,${ky - 14}l-2.200,-.6M45.800,${ky - 10}l-2,-.4" fill="none" stroke-width=".6"/>
<path d="M36,${ky - 3.4}L46.500,${ky - 1.6}L46,${ky + .6}L35.600,${ky - 1.2}Z" fill="#3a2a1c" stroke-width=".8"/>${fist(u, 40.5, ky + 2, 4.2)}<path d="M38.500,${ky + 7}l-1.500,4l3,-1.500Z" fill="#6a4526" stroke-width=".7"/>`))}</div></div>`
    // the fist on the sack's neck (great, superb)
    + PR('goblin-sack', u, -40, HY + 20, 30, `${fore(u, -25, EY, -18, HY + 33, 5.8)}<path d="M-22,${HY + 27}l8,-1l1,4l-8,1.500Z" fill="#6f6348" stroke-width=".8"/>${fist(u, -17, HY + 31, 4.6)}`)
    // the left fist up by his ear (level up)
    + PR('goblin-fup', u, -44, HY + 6, 28, `${fore(u, -25, EY, -30, HY + 20, 5.6)}${fist(u, -30.5, HY + 15.5, 4.6)}`)
    // the little flag: a red rag with a daubed eye, on a stick (level up)
    + `<div class="goblin-p goblin-flag">${S('rig-rim', 26, HY - 26, 30, RY - HY + 34, G(u, `${fore(u, 33, EY, 39, fy + 3)}${ink2(`M39.500,${fy + 6}L42,${HY - 23}`, 1.5, '#8a6a44')}${fist(u, 39.5, fy + 1, 4.4)}`))}
${Z('goblin-flw', 42, HY - 22, `<div class="rig-z goblin-pen">${SL('rig-rim', -2, -3, 24, 20, G(u, `<path d="M0,0L19,2L14.500,6.500L19.500,10L15,12L17,15.500L.6,13Z" fill="#b3261c" stroke-width="1"/><path d="M0,0L6,.6L6,13.300L.6,13Z" fill="${HP(u)}" stroke="none"/><path d="M4,7Q8.500,2.500 13,7Q8.500,10.500 4,7Z" fill="#e9dfc2" stroke-width=".7"/><ellipse cx="8.500" cy="6.900" rx="1" ry="2.200" fill="#170f0a" stroke="none"/>`))}</div>`)}</div>`
    // the stolen cup held up by his shoulder (achievement)
    + PR('goblin-cup', u, 24, HY - 4, 30, `${fore(u, 33, EY, 39, cy + 5)}
<path d="M32.500,${cy - 16}H45.500C45.500,${cy - 8} 43,${cy - 5} 40,${cy - 4.5}L40,${cy - 1}L43.500,${cy + 1}H34.500L38,${cy - 1}L38,${cy - 4.5}C35,${cy - 5} 32.500,${cy - 8} 32.500,${cy - 16}Z" fill="url(#gbg${u})" stroke-width="1"/>
<path d="M32.500,${cy - 16}H36C36,${cy - 9} 37,${cy - 6} 38.500,${cy - 4.500}C35,${cy - 5} 32.500,${cy - 8} 32.500,${cy - 16}Z" fill="${HP(u)}" stroke="none"/><ellipse cx="39" cy="${cy - 16}" rx="6.500" ry="1.700" fill="#7a5a1c" stroke-width=".9"/>
<path d="M33.500,${cy - 12}Q39,${cy - 10} 44.500,${cy - 12}" fill="none" stroke-width=".5"/><circle cx="39" cy="${cy - 8.5}" r="1.300" fill="#b3261c" stroke-width=".5"/><path d="M43,${cy - 14}Q43.500,${cy - 10} 41.500,${cy - 7}" fill="none" stroke="#fff6d0" stroke-width=".9" opacity=".85"/>${fist(u, 39, cy + 3, 4.3)}`);
};

// ---- in front of the crate: his hands on the rim, his rat, a cog on a wire ----
const hands = (u: number) => {
  const hand = (cls: string, x: number) => `<g class="${cls}">${[-4.7, 0, 4.7].map((dx, i) => { const X = x + dx, l = i === 1 ? 8.5 : 7.3; return `<path d="M${n(X - 2.3)},${RY - 3.5}C${n(X - 2.3)},${RY - 6.8} ${n(X + 2.3)},${RY - 6.8} ${n(X + 2.3)},${RY - 3.5}L${n(X + 2)},${n(RY + l - 4.5)}Q${n(X)},${n(RY + l - 2.4)} ${n(X - 2)},${n(RY + l - 4.5)}Z" fill="url(#gbs${u})" stroke-width="1"/><path d="M${n(X - 1.3)},${RY - 2.2}Q${n(X)},${RY - 1.4} ${n(X + 1.3)},${RY - 2.2}" fill="none" stroke-width=".5"/><path d="M${n(X - 1.2)},${n(RY + l - 4.3)}L${n(X)},${n(RY + l - .6)}L${n(X + 1.2)},${n(RY + l - 4.3)}Z" fill="#2b2a22" stroke-width=".4"/>`; }).join('')}</g>`;
  return S('rig-rim', -56, RY - 10, 112, 20, G(u, hand('goblin-hL', -20) + hand('goblin-hR', 27)));
};
const rat = (u: number) => Z('goblin-ratw', -41, RY - 3.2, `<div class="rig-z goblin-rat">${SL('rig-rim', -13, -13, 28, 28, G(u, `
<path d="M-6.500,-1C-11,-.5 -12.500,3 -11.500,6.500C-11,8 -11.500,9 -12.500,10" fill="none" stroke-width="2.200"/><path d="M-6.500,-1C-11,-.5 -12.500,3 -11.500,6.500C-11,8 -11.500,9 -12.500,10" fill="none" stroke="#c49a8a" stroke-width="1"/>
<path d="M-7.500,0C-9,-6.500 -4,-10 1,-9C5,-8.500 7.500,-6.500 9,-4L11.800,-2.300L9,-.6L7.500,0Z" fill="#6f6152" stroke-width=".9"/><path d="M-7.500,0C-9,-6.500 -4,-10 -1,-9.500C-4.500,-7 -5.500,-3.500 -4.500,0Z" fill="${HP(u)}" stroke="none"/>
<circle cx="4" cy="-9" r="2.300" fill="#8a7566" stroke-width=".8"/><circle cx="4.300" cy="-8.800" r="1" fill="#c49a8a" stroke="none"/><circle cx="7.300" cy="-4.800" r=".9" fill="#0c0705" stroke="none"/><circle cx="11.900" cy="-2.300" r=".9" fill="#c49a8a" stroke-width=".4"/>
<path d="M10,-2.500l4,-1.500M10,-1.800l4,.6" fill="none" stroke-width=".35"/><path d="M-2,0l-.5,1.500M2.500,0l.3,1.500M5.500,0l.5,1.500" fill="none" stroke="#c49a8a" stroke-width=".9"/>`))}</div>`);
const dangle = (u: number) => {
  let cog = '';
  for (let i = 0; i < 8; i++) cog += `<rect x="-1.300" y="-6.800" width="2.600" height="3" transform="rotate(${i * 45})"/>`;
  return Z('goblin-dng', 58, RY + 1, SL('rig-rim', -9, -1, 18, 30, `<path d="M-4,-1.500H0V11" fill="none" stroke="#17120e" stroke-width="1.800"/><path d="M-4,-1.500H0V11" fill="none" stroke="#9a8a66" stroke-width=".7"/>${G(u, `<g transform="translate(0,16.5)"><g fill="url(#gbi${u})" stroke-width=".8">${cog}</g><circle r="4.800" fill="url(#gbi${u})" stroke-width=".9"/><circle r="1.800" fill="#170f0a" stroke-width=".6"/><path d="M1.500,-3.800Q3.800,-2.500 3.900,.5" fill="none" stroke="#e3e9ec" stroke-width=".7" opacity=".7"/></g><path d="${tooth(-3, 21, 6.5, 1.8)}${tooth(3.2, 21.5, 5.5, 1.6)}" fill="#e9dfc2" stroke-width=".7"/>`)}`));
};

// ---- the stolen crate: uneven planks, battens, a plank nailed across a hole, a sacking patch, a pole lashed on for a rim.
// It is a tall crate: the planks run on down to K.BD behind the banner (no floor is drawn); the banner's cords hang from two bent nails in the upper batten, just under the rim ----
const basket = (u: number) => {
  // FX, FYC: where the banner's two cords are tied, on bent nails in the upper batten just under the rim
  const BD = K.BD, FX = HX * K.SS, FYC = RY + K.CY;
  const nail = (x: number, y: number, a = 0) => `<g transform="translate(${x},${y}) rotate(${a})"><circle r="1" fill="#b9c0c5" stroke-width=".45"/><path d="M.8,.4l2.200,1.200" fill="none" stroke="#b9c0c5" stroke-width=".7"/></g>`;
  let pl = '';
  ([[-36, 1], [-19, -.6], [-2, .8], [15, -1], [32, .5]] as const).forEach(([x, k]) => { pl += `M${x},${RY + 3}L${n(x * .9 + k)},${BD}`; });
  const lash = (x: number) => `<path d="M${x - 3},${RY - 3.6}l2,7M${x},${RY - 3.6}l2,7M${x + 3},${RY - 3.6}l2,7" fill="none" stroke="#17120e" stroke-width="2"/><path d="M${x - 3},${RY - 3.6}l2,7M${x},${RY - 3.6}l2,7M${x + 3},${RY - 3.6}l2,7" fill="none" stroke="#c9b88c" stroke-width=".9"/>`;
  return S('rig-rim', -62, RY - 6, 124, BD - RY + 8, `${G(u, `
<path d="M-51,${RY + 1}L-46,${BD}H46L51,${RY + 1}Z" fill="url(#gbw${u})" stroke-width="1.1"/>
<path d="M-51,${RY + 1}L-46,${BD}H-23L-27,${RY + 1}Z" fill="${HP(u)}" stroke="none"/><path d="M-51,${RY + 1}L-46,${BD}H-36L-40,${RY + 1}Z" fill="${HQ(u)}" stroke="none"/>
<path d="${pl}" fill="none" stroke-width=".7" opacity=".8"/><path d="M-28,${RY + 14}v8M-10,${RY + 6}v6M7,${RY + 15}v9M24,${RY + 8}v5M40,${RY + 16}v7M-27,${RY + 36}v9M-9,${RY + 44}v8M9,${RY + 35}v7M25,${RY + 47}v9M39,${RY + 38}v6M-40,${RY + 52}v8" fill="none" stroke="#c9a878" stroke-width=".7" opacity=".55"/>
<path d="M-50,${RY + 7}L50,${RY + 6}L49.500,${RY + 10.5}L-49.500,${RY + 11.5}Z" fill="#6a4c30" stroke-width=".9"/><path d="M-49.500,${BY - 4.5}L49.500,${BY - 3.5}L49,${BY + 2}L-49,${BY + 1.5}Z" fill="#5c4028" stroke-width=".9"/><path d="M-46,${BY - 2.8}L46,${BY - 1.9}" fill="none" stroke="#c9a878" stroke-width=".6" opacity=".45"/>
<path d="M-47.500,${RY + 62}L47.500,${RY + 63}L47.200,${RY + 67.5}L-47.200,${RY + 67}Z" fill="#6a4c30" stroke-width=".9"/><path d="M-30,${RY + 37}l22,4l-1,5l-22,-4Z" fill="#a98a5c" stroke-width=".9"/>${nail(-27, RY + 40, 20)}${nail(-11, RY + 43.5, 190)}
<path d="M-12,${RY + 13}l9,-1l1,8l-8,2Z" fill="#170f0a" stroke-width=".8"/>
<path d="M-43,${RY + 22.5}L-3,${RY + 9}L-1,${RY + 14}L-41,${RY + 27.5}Z" fill="#a98a5c" stroke-width="1"/><path d="M-38,${RY + 23.5}L-8,${RY + 13.500}" fill="none" stroke-width=".5" opacity=".6"/>
${nail(-39, RY + 24, 30)}${nail(-34.5, RY + 22.6, -50)}${nail(-6, RY + 12.6, 10)}${nail(-10.5, RY + 14.5, 200)}
<path d="M17,${RY + 12}l20,-1.500l1.500,13l-20,2Z" fill="#94825a" stroke-width=".9"/><path d="M17,${RY + 12}l7,-.5l1.500,14.600l-7,.6Z" fill="${HP(u)}" stroke="none"/>
<path d="M19,${RY + 14}l2.500,2.500M25,${RY + 13.4}l2.500,2.500M31,${RY + 13}l2.500,2.500M36,${RY + 15.5}l-2.500,2.500M36.500,${RY + 21}l-2.500,2M31.500,${RY + 22.5}l-2.500,2M25.500,${RY + 23}l-2.500,2M19.500,${RY + 18}l2,2.500" fill="none" stroke="#e6d6a8" stroke-width=".9"/>
<path d="M2,${RY + 15}Q7,${RY + 11} 12,${RY + 15}Q7,${RY + 18.5} 2,${RY + 15}Z" fill="#b3261c" stroke="none" opacity=".85"/><ellipse cx="7" cy="${RY + 15}" rx=".9" ry="2" fill="#170f0a" stroke="none"/>
<rect x="-55" y="${RY - 3.2}" width="110" height="6.400" rx="3" fill="#7a5c3a" stroke-width="1.1"/><path d="M-55,${RY - 1}Q-55,${RY - 3.2} -52,${RY - 3.2}H-22V${RY + 3.2}H-52Q-55,${RY + 3.2} -55,${RY + 1}Z" fill="${HP(u)}" stroke="none"/><path d="M-50,${RY - 1.3}H50" fill="none" stroke="#d9c095" stroke-width=".8" opacity=".5"/>
${lash(-41)}${lash(-11)}${lash(13)}${lash(38)}`)}
${[-1, 1].map((sd) => `${ink2(`M${n(sd * FX)},${FYC - 3}v2.800q0,2.400 ${-2.4 * sd},2.400`, 1.2, '#9aa2a8')}<circle cx="${n(sd * FX)}" cy="${FYC - 3.2}" r="1.300" fill="#b9c0c5" stroke="#17120e" stroke-width=".5"/>`).join('')}`);
};

// ---- the burner: a dented cooking pot of coals hung on wires, a jagged grin cut in its side ----
const burner = (u: number) => S('rig-rim', -24, HG, 48, FY - HG + 18, G(u, `
${ink2(`M-19,${HG + 4}L-11.500,${FY + 1}M19,${HG + 4}L11.500,${FY + 1}`, .9, '#a39472')}${ink2(`M-17,${HG + 14}l-3,2.500M16.500,${HG + 12}l3,3`, .7, '#a39472')}
<path d="M-6.500,${FY + 12}l-1.500,3.800M6.500,${FY + 12}l1.500,3.800M0,${FY + 13}v3" fill="none" stroke-width="2.600"/>
<path d="M-12.500,${FY}C-15.500,${FY + 4} -14.500,${FY + 10.5} -8.500,${FY + 13}Q0,${FY + 14.5} 8.500,${FY + 13}C14.500,${FY + 10.5} 15.500,${FY + 4} 12.500,${FY}Z" fill="#3a3937" stroke-width="1.1"/>
<path d="M-12.500,${FY}C-15.500,${FY + 4} -14.500,${FY + 10.5} -8.500,${FY + 13}Q-5,${FY + 13.700} -3,${FY + 13.900}C-8,${FY + 10} -8.500,${FY + 4} -6,${FY}Z" fill="#000" opacity=".32" stroke="none"/>
<path d="M10.500,${FY + 4}Q11.800,${FY + 7.500} 9,${FY + 10.500}" fill="none" stroke="#c9d0d4" stroke-width=".8" opacity=".55"/>
<path class="goblin-coal" d="M-8,${FY + 6.5}L-5.700,${FY + 8.300}L-3.400,${FY + 6.700}L-1.100,${FY + 8.600}L1.200,${FY + 6.800}L3.500,${FY + 8.500}L5.800,${FY + 6.700}L8,${FY + 6.500}Q0,${FY + 12.800} -8,${FY + 6.500}Z" stroke-width=".7"/>
<ellipse class="goblin-coal" cx="0" cy="${FY - .4}" rx="11.500" ry="2" stroke-width=".9"/>
<path d="M-14,${FY - .6}Q0,${FY + 3.200} 14,${FY - .6}L14,${FY + 1.800}Q0,${FY + 5.600} -14,${FY + 1.800}Z" fill="#6a6c69" stroke-width=".9"/><path d="M-13,${FY + 1}l-3.500,1.500M13,${FY + 1}l3.500,1.500" fill="none" stroke-width="1.600"/>`))
  + Z('goblin-coalg', 0, FY + 3);

// ---- the envelope: scraps sewn into seven uneven gores; the helpers daub and hang things on the surface ----
const KS = [-1, -.88, -.52, -.1, .34, .7, .92, 1];
const panels = (g: EnvGeo, cols: readonly string[]) => KS.slice(0, -1).map((k, i) => `<path d="${g.gore(k, KS[i + 1]!)}" fill="${cols[i % cols.length]}" stroke="none"/>`).join('');
const seams = (g: EnvGeo, stitch: string, o: { w?: number; dash?: string; op?: number } = {}) => KS.slice(1, -1).map((k) => `<path d="${g.seam(k)}" fill="none" stroke-width=".9"/>${stitch ? `<path d="${g.seam(k + (k > 0 ? -.035 : .035))}" fill="none" stroke="${stitch}" stroke-width="${o.w || 1.1}" stroke-dasharray="${o.dash || '2.4 3.2'}" opacity="${o.op || .65}"/>` : ''}`).join('');
const band = (g: EnvGeo, u: number, t0: number, t1: number, fill: string) => `<path d="${g.band(t0, t1)}" fill="${fill}" stroke-width="1"/><path d="${g.band(t0, t1, -1, -.4)}" fill="${HP(u)}" stroke="none"/>`;
const girdle = (g: EnvGeo, t: number, col: string) => ink2(g.lat(t), 1.4, col, 'stroke-dasharray="3 1.200"');
const creases = (g: EnvGeo, list: ReadonlyArray<readonly [number, number, number]>) => `<path d="${list.map(([k, a, b]) => g.seam(k, a, b)).join('')}" fill="none" stroke-width=".7" opacity=".55"/>`;
// a row of daubed teeth: bases on t0, points at t1
const teeth = (g: EnvGeo, t0: number, t1: number, num: number, fill: string, sw = .8) => { const ks = g.along(num + 1, -.985, .985); let d = ''; for (let i = 0; i < num; i++) d += `M${pp(g.pt(ks[i]!, t0))}L${pp(g.pt((ks[i]! + ks[i + 1]!) / 2 + (i % 2 ? .012 : -.012), t1))}L${pp(g.pt(ks[i + 1]!, t0))}Z`; return `<path d="${d}" fill="${fill}" stroke-width="${sw}"/>`; };
// a daubed slit eye, about 0,0 (26 wide), with a drip or two
const dEye = (white: string, iris: string, o: { rim?: string; drip?: boolean } = {}) => `<path d="M-14.500,.5Q0,-13 14.500,-.5Q0,10.500 -14.500,.5Z" fill="${o.rim || '#170f0a'}" stroke="none"/><path d="M-12,.3Q0,-10 12,-.4Q0,8 -12,.3Z" fill="${white}" stroke-width=".7"/><circle cy="-.5" r="5" fill="${iris}" stroke-width=".6"/><path d="M0,-5.500Q2.200,-.5 0,4.500Q-2.200,-.5 0,-5.500Z" fill="#170f0a" stroke="none"/>${o.drip === false ? '' : `<path d="M-6,6.500v5.500M3,7.500v8M8,5v4" fill="none" stroke="${o.rim || '#170f0a'}" stroke-width="1.300"/>`}`;
// a crude skull, about 0,0 (r is the half-width)
const skull = (r: number, fill = '#e9dfc2', sw = .7) => `<g transform="scale(${n(r / 8)})"><path d="M-8,1C-10,-10 10,-10 8,1L6,4L5,8.500H-5L-6,4Z" fill="${fill}" stroke-width="${sw}"/><circle cx="-3.300" cy="-1.500" r="2.300" fill="#170f0a" stroke="none"/><circle cx="3.300" cy="-1.500" r="2.300" fill="#170f0a" stroke="none"/><path d="M0,1.500l-1.200,2.500h2.400ZM-2.500,6v2.500M0,6v2.500M2.500,6v2.500" fill="#170f0a" stroke-width=".6"/></g>`;
const knives = (steel: string) => [1, -1].map((s) => `<g transform="rotate(${40 * s})"><path d="M-1.200,13L-1.800,-6C-1,-12 1,-16 3.500,-19C4.500,-13 3.500,-8 2,-5L1.800,13Z" transform="scale(${s},1)" fill="${steel}" stroke-width=".8"/><path d="M-4,4H4" fill="none" stroke-width="2"/><path d="M-4,4H4" fill="none" stroke="#6a4526" stroke-width=".9"/></g>`).join('');
// a spike through the outline
const spike = (g: EnvGeo, s: number, t: number, len = 9, fill = '#9aa2a8') => { const p = g.pt(s, t); return `<path d="M${n(p[0] - s * 1.5)},${n(p[1] - 2.8)}L${n(p[0] + len * s)},${n(p[1] - 1.8)}L${n(p[0] - s * 1.5)},${n(p[1] + 3)}Z" fill="${fill}" stroke-width=".9"/>`; };
// a swag hung round the envelope: things on a slack string
const swag = (g: EnvGeo, t: number, num: number, item: (i: number) => string, cord = '#c9b88c') => {
  const ks = g.along(num + 1, -.97, .97); let d = '', it = '';
  for (let i = 0; i < num; i++) { const a = g.pt(ks[i]!, t), b = g.pt(ks[i + 1]!, t), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 + 5; d += `M${pp(a)}Q${n(mx)},${n(my + 2.5)} ${pp(b)}`; it += `<g transform="translate(${n(mx)},${n(my + 2.5)})">${item(i)}</g>`; }
  return ink2(d, .9, cord) + it;
};
const coin = (r: number) => `<circle r="${r}" fill="#e0bb55" stroke-width=".7"/><path d="M${n(-r * .5)},${n(-r * .4)}Q0,${n(-r * .9)} ${n(r * .4)},${n(-r * .5)}" fill="none" stroke="#fff6d0" stroke-width=".7"/>`;
const cap = (c: readonly [number, number], fill: string, rx = 8) => `<path d="M${n(c[0] - rx)},${n(c[1] + 4)}Q${n(c[0])},${n(c[1] - 4)} ${n(c[0] + rx)},${n(c[1] + 4)}Q${n(c[0])},${n(c[1] + 7.5)} ${n(c[0] - rx)},${n(c[1] + 4)}Z" fill="${fill}" stroke-width="1"/>`;
// the great grin: a crescent across the bag, with teeth (or only its outline, for the sketch)
const grin = (g: EnvGeo, k1: number, o: { sketch?: string; tooth?: string } = {}) => {
  const ks = g.along(13, -k1, k1), q = (k: number) => (k / k1) ** 2, top = (k: number) => .5 - .07 * q(k), bot = (k: number) => .685 - .255 * q(k);
  const up = ks.map((k) => g.pt(k, top(k))), dn = ks.map((k) => g.pt(k, bot(k)));
  const d = `M${up.map(pp).join('L')}L${dn.slice().reverse().map(pp).join('L')}Z`;
  if (o.sketch) return `<path d="${d}" fill="none" stroke="${o.sketch}" stroke-width="1.100" stroke-dasharray="3.200 2.400"/>`;
  let th = '';
  for (let i = 1; i < ks.length - 2; i++) { const km = (ks[i]! + ks[i + 1]!) / 2, dp = .075 * (1 - q(km) * .8); th += `M${pp(up[i]!)}L${pp(g.pt(km, top(km) + dp))}L${pp(up[i + 1]!)}Z`; }
  for (let i = 2; i < ks.length - 3; i++) { const km = ks[i + 1]! - (ks[i + 1]! - ks[i]!) * .02, dp = .06 * (1 - q(km)); th += `M${pp(g.pt((ks[i]! + ks[i + 1]!) / 2, bot((ks[i]! + ks[i + 1]!) / 2)))}L${pp(g.pt(km, bot(km) - dp - .012))}L${pp(g.pt((ks[i + 1]! + ks[i + 2]!) / 2, bot((ks[i + 1]! + ks[i + 2]!) / 2)))}Z`; }
  return `<path d="${d}" fill="#1c1210" stroke-width="1.400"/><path d="${th}" fill="${o.tooth || '#f1e9d4'}" stroke-width=".7"/>`;
};
const arrow = 'M0,-12L9,-1H4V11H-4V-1H-9Z';

const ENV: Readonly<Record<string, EnvSpec>> = {
  // a sack of rags: sagging, lopsided, dented, held together with bent nails and string
  poor: { cond: { sag: 1, lop: .8, dents: [{ side: -1, t: .5, depth: 13, span: .13 }, { side: 1, t: .28, depth: 8, span: .1 }, { side: 1, t: .66, depth: 5, span: .08 }] }, art: (g, u) => { const c = g.pt(0, 0); return {
    base: '#5f5a45', lip: '#6f6348', ring: '#7d6f52',
    inside: `${panels(g, ['#666048', '#57523f', '#74664a', '#4f4c3d', '#6b5d42', '#5d5743', '#70634a'])}${seams(g, '#cdbf98', { w: 1.4, dash: '2.8 3.4', op: .8 })}
${creases(g, [[-.78, .34, .72], [-.5, .42, .66], [.42, .68, .98], [-.32, .7, .98], [.78, .58, .9], [-.05, .74, .98], [.3, .04, .2]])}
${g.patch(.46, .4, 22, 17, { fill: '#8f7d57', rot: 11, rivets: true, stitch: '#c9c2b0', hatch: HP(u) })}${g.patch(-.38, .3, 19, 15, { fill: '#3d3a33', rot: -8, stitch: '#cdbf98', sw: 1.1 })}${g.patch(-.06, .63, 16, 18, { fill: '#7a4a2e', rot: 7, rivets: true, stitch: '#c9a27a' })}
${g.patch(.1, .18, 15, 11, { fill: '#a39472', rot: -17, hatch: HQ(u) })}${g.patch(-.7, .68, 13, 12, { fill: '#4d5a4a', rot: 14, rivets: true })}${g.patch(.4, .47, 9, 8, { fill: '#a39472', rot: -20 })}${g.patch(.74, .22, 10, 9, { fill: '#3d3a33', rot: 22, stitch: '#cdbf98' })}
${girdle(g, .8, '#9a8a66')}`,
    over: `<path d="M${n(c[0] - 6)},${n(c[1] + 3)}Q${n(c[0])},${n(c[1] - 5)} ${n(c[0] + 6)},${n(c[1] + 3)}Q${n(c[0])},${n(c[1] + 6)} ${n(c[0] - 6)},${n(c[1] + 3)}Z" fill="#4f4c3d" stroke-width="1"/><path d="M${n(c[0] - 1)},${n(c[1] - 1)}l-5,-3l1,5M${n(c[0] + 1)},${n(c[1] - 1)}l4,-5l1,5" fill="#74664a" stroke-width="1"/>`,
  }; } },
  // plain undyed sacking, sound enough
  meh: { cond: { sag: .3, lop: -.12 }, art: (g, u) => { const c = g.pt(0, 0); return {
    base: '#a39472', lip: '#8a7a55',
    inside: `${panels(g, ['#a99a76', '#9b8c69'])}${seams(g, '#4a4334', { op: .55 })}${creases(g, [[.42, .74, .98], [-.34, .76, .98]])}
<path d="${[.2, .34, .48, .62].map((t) => g.lat(t, -.96, .96)).join('')}" fill="none" stroke="#6f6348" stroke-width=".6" opacity=".4" stroke-dasharray="5 3"/>
${g.patch(-.4, .32, 14, 11, { fill: '#8a7a55', rot: -7 })}${girdle(g, .82, '#6f6348')}`,
    over: cap(c, '#8a7a55', 7) + `<path d="M${n(c[0])},${n(c[1] + 1)}l-4,-5M${n(c[0])},${n(c[1] + 1)}l4,-4" fill="none" stroke-width="1.200"/>`,
  }; } },
  // sound: rust-red sailcloth, a band of daubed teeth
  good: { cond: {}, art: (g, u) => { const c = g.pt(0, 0); return {
    base: '#a8532a', lip: '#3a3937', ring: '#9aa2a8',
    inside: `${panels(g, ['#b05a2c', '#9c4a26'])}${seams(g, '#e9c79a')}
${band(g, u, .46, .5, '#211a17')}${teeth(g, .5, .615, 11, '#211a17', .6)}${band(g, u, .84, .875, '#211a17')}
<path d="${g.lat(.445, -.97, .97)}" fill="none" stroke="#e9c79a" stroke-width=".8" stroke-dasharray="2.400 2.800" opacity=".7"/>`,
    over: `${cap(c, '#3a3937', 8.5)}${ink2(`M${n(c[0])},${n(c[1] + 1)}v-6q0,-4.500 4,-4.500q3.500,0 3.500,3.500`, 1.5, '#9aa2a8')}`,
  }; } },
  // fine: stolen sea-green sailcloth, the great eye, bone teeth, spikes
  great: { cond: { taut: .5 }, art: (g, u) => { const c = g.pt(0, 0); return {
    base: '#1f4f4a', lip: '#d8c26a', ring: '#c9b88c',
    inside: `${panels(g, ['#22564f', '#1a443f'])}${seams(g, '#bcd2c4')}
<g transform="${g.place(0, .26, 1.85)}">${dEye('#f1d75c', '#b3261c')}</g>
${band(g, u, .5, .535, '#170f0a')}${teeth(g, .535, .64, 13, '#e9dfc2', .7)}${band(g, u, .84, .88, '#b3261c')}${ink2(g.lat(.495, -.97, .97), .8, '#d8c26a')}`,
    over: `${spike(g, -1, .4)}${spike(g, 1, .4)}${spike(g, -1, .56, 7)}${spike(g, 1, .56, 7)}${cap(c, '#3a3937', 9)}<g transform="translate(${n(c[0])},${n(c[1] - 5)})">${skull(5.5)}</g>`,
  }; } },
  // brand new: scarlet and bone, the great grinning face, skulls and stolen gold
  superb: { cond: { taut: 1 }, art: (g, u) => {
    const c = g.pt(0, 0);
    let sp = '';
    for (const a of [-52, -28, 28, 52]) sp += `<path transform="translate(${n(c[0])},${n(c[1] + 5)}) rotate(${a})" d="M-2.600,-3L0,-17L2.600,-3Z" fill="url(#gbg${u})" stroke-width=".8"/>`;
    return {
      base: '#c2311f', lip: '#e0bb55', ring: '#f0dca8',
      inside: `${panels(g, ['#c93522', '#eee4c8'])}${seams(g, '#fff3d0', { op: .85 })}
${band(g, u, .08, .115, '#e0bb55')}${grin(g, .78)}
<g transform="${g.place(-.4, .29, 1.2)} rotate(14)">${dEye('#f6d94a', '#f6d94a', { drip: false })}</g><g transform="${g.place(.4, .29, 1.2)} rotate(-14)">${dEye('#f6d94a', '#f6d94a', { drip: false })}</g>
${band(g, u, .845, .885, '#e0bb55')}${teeth(g, .845, .79, 15, '#1c1210', .5)}`,
      over: `${swag(g, .74, 8, (i) => (i % 2 ? coin(2.7) : skull(3.3)), '#f0dca8')}${spike(g, -1, .34, 8, '#e0bb55')}${spike(g, 1, .34, 8, '#e0bb55')}${sp}${cap(c, '#1c1210', 10)}
<g transform="translate(${n(c[0] + 1)},${n(c[1] - 1)}) rotate(-9)"><path d="M-9,3L-10.500,-6L-6,-2L-3,-9L0,-2.500L3,-9L6,-2L10.500,-6L9,3Q0,6 -9,3Z" fill="url(#gbg${u})" stroke-width=".9"/><path d="M-9,.5Q0,3.500 9,.5" fill="none" stroke-width=".5"/><circle cy="1" r="1.500" fill="#b3261c" stroke-width=".5"/></g>`,
    };
  } },
  // unrated: new chalk-grey canvas, the face sketched in charcoal and not painted yet
  calibrating: { cond: { sag: .12 }, art: (g, u) => { const c = g.pt(0, 0), d = g.pt(.52, .5); return {
    base: '#c4c6bd', lip: '#8d949b',
    inside: `${panels(g, ['#cbcdc4', '#bbbdb3'])}${seams(g, '#77796f', { op: .5 })}
${grin(g, .7, { sketch: '#45443e' })}
<g fill="none" stroke="#45443e" stroke-width="1.100" stroke-dasharray="3 2.400"><path transform="${g.place(-.38, .3, 1.15)} rotate(12)" d="M-12,.3Q0,-10 12,-.4Q0,8 -12,.3Z"/><path transform="${g.place(.38, .3, 1.15)} rotate(-12)" d="M-12,.3Q0,-10 12,-.4Q0,8 -12,.3Z"/></g>
<path d="${g.seam(0, .12, .46)}${g.lat(.3, -.72, .72)}" fill="none" stroke="#6a6a62" stroke-width=".6" stroke-dasharray="1.500 3" opacity=".8"/>
<path d="M${n(d[0])},${n(d[1])}q5,-2.500 9,.5q1,3 -3,3.500l-.5,7q-1,1.500 -2,0l-.3,-6.500q-4,-.5 -3.200,-4.500Z" fill="#b3261c" stroke="none" opacity=".85"/>
${girdle(g, .8, '#a39472')}`,
    over: cap(c, '#a9aba2', 7),
  }; } },
  // a player kill: soot black, the skull over crossed knives, spikes all round
  pvp: { cond: { taut: .3 }, art: (g, u) => {
    const c = g.pt(0, 0), e = g.pt(0, .44);
    let sp = '';
    for (const t of [.2, .34, .48, .62]) sp += spike(g, -1, t, t > .55 ? 7 : 9.5) + spike(g, 1, t, t > .55 ? 7 : 9.5);
    return {
      base: '#262323', lip: '#b3261c', ring: '#aab2b8',
      inside: `${panels(g, ['#2c2828', '#1f1c1c'])}${seams(g, '#b3412e', { op: .8 })}
${teeth(g, .1, .22, 9, '#b3261c', .6)}${band(g, u, .76, .8, '#b3261c')}${teeth(g, .76, .655, 13, '#b3261c', .6)}${band(g, u, .86, 1, '#3a3937')}
<g transform="translate(${n(e[0])},${n(e[1] + 3)}) scale(1.25)">${knives('#c9d0d4')}</g><g transform="translate(${n(e[0])},${n(e[1] - 3)})">${skull(14, '#efe7d2', .6)}</g>`,
      over: `${sp}${cap(c, '#3a3937', 8.5)}<path d="M${n(c[0] - 3)},${n(c[1] + 1)}L${n(c[0] + .5)},${n(c[1] - 13)}L${n(c[0] + 3)},${n(c[1] + 1)}Z" fill="#aab2b8" stroke-width=".9"/>`,
    };
  } },
  // a level gained: mustard yellow, fat arrows and teeth that point up, a red pennant on top
  levelup: { cond: { taut: .6 }, art: (g, u) => { const c = g.pt(0, 0); return {
    base: '#d2a52e', lip: '#211a17', ring: '#c9b88c',
    inside: `${panels(g, ['#d8ab30', '#c59728'])}${seams(g, '#5a4410', { op: .7 })}
<g fill="#211a17" stroke-width=".6"><path transform="${g.place(0, .27, 1.55)}" d="${arrow}"/><path transform="${g.place(-.5, .36, 1.15)}" d="${arrow}"/><path transform="${g.place(.5, .36, 1.15)}" d="${arrow}"/></g>
${band(g, u, .66, .7, '#211a17')}${teeth(g, .66, .555, 13, '#211a17', .6)}${band(g, u, .84, .88, '#b3261c')}`,
    over: `${cap(c, '#211a17', 8.5)}${ink2(`M${n(c[0])},${n(c[1] + 1)}V${n(c[1] - 15)}`, 1.3, '#8a6a44')}<path d="M${n(c[0] + .8)},${n(c[1] - 15)}l13,2.500l-4,2.500l3.500,3l-12.500,1Z" fill="#b3261c" stroke-width=".9"/>`,
  }; } },
  // a death: let down, the painted face crossed out, black rags tied on
  death: { cond: { sag: .62, lop: -.1 }, art: (g, u) => {
    const k0 = g.pt(.6, .5), X = (k: number, t: number) => `<path transform="${g.place(k, t, 1.25)}" d="M-7,-7L7,7M7,-7L-7,7" fill="none" stroke="#17120e" stroke-width="4.600"/><path transform="${g.place(k, t, 1.25)}" d="M-7,-7L7,7M7,-7L-7,7" fill="none" stroke="#b9b5a8" stroke-width="2.600"/>`;
    const ks = g.along(9, -.5, .5), fr = 'M' + ks.map((k) => pp(g.pt(k, .56 + .1 * (k / .5) ** 2))).join('L');
    return {
      base: '#4a4944', lip: '#4a4d50', ring: '#6a6358',
      inside: `${panels(g, ['#52514b', '#42413c'])}${seams(g, '#8a857a', { op: .5 })}${creases(g, [[.42, .68, .98], [-.32, .7, .98], [-.72, .4, .7], [.7, .62, .9], [-.06, .76, .98]])}
${X(-.38, .3)}${X(.38, .3)}${ink2(fr, 2.4, '#b9b5a8')}<path d="M${pp(g.pt(-.2, .6))}v9M${pp(g.pt(.26, .61))}v6" fill="none" stroke="#b9b5a8" stroke-width="1.500" opacity=".8"/>
<g transform="translate(${n(k0[0])},${n(k0[1])})" stroke="#000"><path d="M-3,2C-9,13 -2,21 -8,34L1,30C2,21 0,12 3,3Z" fill="#1c1813" stroke-width="1"/><path d="M2,2C6,12 2,20 8,29L13,24C10,16 11,10 9,3Z" fill="#14110d" stroke-width="1"/><circle r="5" fill="#221d17" stroke-width="1"/><path d="M-4,10q2,9 -2,18M5,10q0,7 4,13" fill="none" stroke="#6a6257" stroke-width=".7"/></g>`,
      over: '',
    };
  } },
  // an achievement: a stolen purple banner, a great looted dish nailed to it, a swag of coins
  achievement: { cond: { taut: .8 }, art: (g, u) => {
    const c = g.pt(0, 0), e = g.pt(0, .3);
    let nails = '';
    for (let i = 0; i < 10; i++) { const a = i * 36 * Math.PI / 180; nails += `<circle cx="${n(14 * Math.sin(a))}" cy="${n(-14 * Math.cos(a))}" r="1" fill="#7a5a1c" stroke="none"/>`; }
    return {
      base: '#55346e', lip: '#e0bb55', ring: '#e9c865',
      inside: `${panels(g, ['#5c3976', '#4a2b61'])}${seams(g, '#d9c7e6', { op: .6 })}
${band(g, u, .54, .58, '#e0bb55')}${band(g, u, .845, .885, '#e0bb55')}${ink2(g.lat(.1, -.9, .9), .9, '#e0bb55')}
<g transform="translate(${n(e[0])},${n(e[1])})"><circle r="17" fill="url(#gbg${u})" stroke-width="1.2"/><circle r="11.500" fill="#f0d27a" stroke-width=".7"/><circle r="11.500" fill="${HP(u)}" stroke="none" opacity=".5"/>${nails}<g transform="translate(0,.5) scale(.85)"><path d="M-6.500,-8H6.500C6.500,-1 4,2 1,2.500V6L4.500,8H-4.500L-1,6V2.500C-4,2 -6.500,-1 -6.500,-8Z" fill="#7a5a1c" stroke-width=".8"/></g><path d="M-12,-9Q-6,-15 2,-14.500" fill="none" stroke="#fff6d0" stroke-width="1.200" opacity=".8"/></g>`,
      over: `${swag(g, .7, 8, () => coin(2.6), '#e9c865')}${cap(c, '#e0bb55', 9)}${ink2(`M${n(c[0])},${n(c[1] + 1)}v-6q0,-4.500 4,-4.500q3.500,0 3.500,3.500`, 1.5, '#e9c865')}`,
    };
  } },
};

// ---- the sign: a banner laced to a pole, the pole hung on two cords from hooks under the crate ----
const SW = 156, HX = 54;
const CLOTH = {
  calibrating: ['#55544d', '#b9b9ac'], poor: ['#4a4334', '#8f7d57'], meh: ['#5c523d', '#b3a37c'], good: ['#73361a', '#e0a468'],
  great: ['#16403b', '#d8c26a'], superb: ['#8e1f16', '#f0cf6e'], pvp: ['#1c1818', '#b3261c'], levelup: ['#2b2512', '#e0b638'],
  death: ['#1c1b1a', '#5b5750'], achievement: ['#3f2556', '#e9c865'],
};
const board = ({ w, h, hx = HX, mood, u }: BoardArgs) => {
  const [cloth, hem] = CLOTH[mood] || CLOTH.meh!, poor = mood === 'poor', rich = mood === 'superb';
  // the cloth: a little skew at the sides, a ragged lower edge
  const N = 13, top = 2.5; let d = `M1.500,${top}H${w - 1.5}L${w - .8},${h - 4}`, hd = '';
  for (let i = 0; i <= N; i++) { const x = w - 2 - (w - 4) * i / N, deep = poor && (i === 4 || i === 9); d += `L${n(x)},${n(h - (i % 2 ? .6 : 2.8) - (deep ? 5 : 0))}`; }
  d += `L.8,${h - 4}Z`;
  for (let i = 0; i <= N; i++) { const x = w - 5 - (w - 10) * i / N; hd += `${i ? 'L' : 'M'}${n(x)},${n(h - (i % 2 ? 4.2 : 5.6))}`; }
  let lace = '', eyes = '';
  for (let i = 0; i < 9; i++) { const x = 12 + (w - 24) * i / 8; lace += `M${n(x - 3.5)},-3.800L${n(x)},5.200`; eyes += `<circle cx="${n(x)}" cy="5.600" r="1.300"/>`; }
  const pole = `<rect x="-8" y="-3.800" width="${w + 16}" height="5.400" rx="2.400" fill="url(#gbw${u})" stroke-width="1.1"/><path d="M-5,-2.200H${w + 5}" fill="none" stroke="#e3cfa2" stroke-width=".8" opacity=".5"/><path d="M${w * .3},-3.500l2,4.800M${w * .72},-3.600l-1.500,2.500" fill="none" stroke-width=".5" opacity=".7"/>`;
  const wrap = (x: number) => `<path d="M${x - 2.5},-4.400l1.500,6.600M${x},-4.400l1.500,6.600M${x + 2.5},-4.400l1.500,6.600" fill="none" stroke="#17120e" stroke-width="1.900"/><path d="M${x - 2.5},-4.400l1.500,6.600M${x},-4.400l1.500,6.600M${x + 2.5},-4.400l1.500,6.600" fill="none" stroke="#c9b88c" stroke-width=".85"/>`;
  return G(u, `<path d="${d}" fill="${cloth}" stroke-width="1.2"/>
<path d="M1.500,${top}H9L8,${h - 3}L.8,${h - 4}Z" fill="${HP(u)}" stroke="none"/><path d="M2,${h - 9}H${n(w * .5)}V${h - 3}H2Z" fill="${HQ(u)}" stroke="none" opacity=".7"/>
<path d="M${w - 9},${top + 1}L${w - 8},${h - 5}" fill="none" stroke="#fff" stroke-width="1" opacity=".1"/>
<path d="M4.500,${top + 6}V${h - 5.5}M${w - 4.5},${top + 6}V${h - 5.5}" fill="none" stroke="${hem}" stroke-width=".9" stroke-dasharray="2.400 2.600" opacity=".8"/><path d="${hd}" fill="none" stroke="${hem}" stroke-width=".9" stroke-dasharray="2.400 2.600" opacity=".8"/>
${poor ? `<path d="M${w - 21},${h - 16}l13,-1.500l1,9l-13,2Z" fill="#8f7d57" stroke-width=".8"/><path d="M${w - 19},${h - 14.5}l2,2M${w - 13},${h - 15.5}l2,2M${w - 9.5},${h - 11}l-2,2M${w - 16},${h - 8.5}l2,-2" fill="none" stroke="#e6d6a8" stroke-width=".8"/><path d="M9,${top + 9}l4,3l-3,4" fill="none" stroke-width=".8"/>` : ''}
${rich ? `<path d="M7,${top + 5.5}H${w - 7}" fill="none" stroke="${hem}" stroke-width=".8" opacity=".9"/>${[9, w - 9].map((x) => `<g transform="translate(${x},${h - 9.5})">${skull(2.8, '#f1e9d4', .6)}</g>`).join('')}` : ''}
${mood === 'pvp' ? `<path d="M7,${top + 5.5}H${w - 7}" fill="none" stroke="${hem}" stroke-width="1" opacity=".9"/>` : ''}
<g fill="#170f0a" stroke="${hem}" stroke-width=".6">${eyes}</g>${pole}
<path d="${lace}" fill="none" stroke="#17120e" stroke-width="1.900"/><path d="${lace}" fill="none" stroke="#c9b88c" stroke-width=".85"/>${wrap(w / 2 - hx)}${wrap(w / 2 + hx)}
<g fill="url(#gbi${u})" stroke-width=".7"><circle cx="-8" cy="-1.100" r="2.300"/><circle cx="${w + 8}" cy="-1.100" r="2.300"/></g>`);
};
// the rating as five teeth on a row; a player kill is two red strokes
const pips = (mood: Mood) => {
  let s = '';
  if (mood === 'pvp') s = '<path class="goblin-red" d="M3,2L15,12M15,2L3,12"/>';
  else for (let i = 0; i < 5; i++) { const x = 5.5 + i * 11; s += `<path class="${i < (RANK[mood] || 0) ? 'goblin-on' : 'goblin-of'}" d="M${x - 3.8},1.500Q${x},3.200 ${x + 3.8},1.500Q${x + 2.6},8 ${x},13Q${x - 2.6},8 ${x - 3.8},1.500Z"/>`; }
  return `<svg xmlns="${NS}" width="${mood === 'pvp' ? 18 : 55}" height="14" viewBox="0 0 ${mood === 'pvp' ? 18 : 55} 14">${s}</svg>`;
};

let paceOf = () => 1;

// ---- the small life in him: blinks, quick glances, an ear that twitches; one piece of business per mood ----
const liven = (R: RigBalloon) => {
  // reduced motion as it was when this balloon was made (stage 75 review: per balloon, not per module)
  const reduced = R.reduced;
  const q = R.q, qa = R.qa, ck = kit.clock(), later = ck.later, rnd = Math.random;
  const nod = q('.goblin-nod'), look = q('.goblin-look'), lids = qa('.goblin-bl'), pgs = qa('.goblin-pg'), brows = [q('.goblin-bL'), q('.goblin-bR')], ears = [q('.goblin-eL'), q('.goblin-eR')];
  const coal = q('.goblin-coalg'), dng = q('.goblin-dng'), flw = q('.goblin-flw'), kup = q('.goblin-kup');
  let gaze: readonly [number, number] = [0, 0], ga: Animation[] = [], la: Animation | null = null, hot = true;
  const bob = (el: Part | null, to: string, ms: number, o: KeyframeAnimationOptions & { at?: number } = {}) => el && el.animate([{ transform: 'none' }, { transform: to, offset: o.at ?? .4 }, { transform: 'none' }], { duration: ms, easing: 'ease-in-out', composite: 'add', ...o });
  const sad = () => R.mood === 'death' || R.mood === 'poor';
  const blink = () => {
    const slow = R.mood === 'meh' || R.mood === 'death';
    const go = () => lids.forEach((l) => l.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(27px)', offset: .42 }, { transform: 'translateY(0)' }], { duration: slow ? 650 : 130, easing: 'ease-in-out' }));
    go(); if (!slow && rnd() < .3) later(go, 230);
    later(blink, (slow ? 2600 : 1500) + rnd() * 3400);
  };
  const lookAt = (x: number, y: number, ms = 140) => {
    if (reduced) return;
    const from = gaze; gaze = [x, y];
    const old = ga, oldL = la;
    ga = pgs.map((p) => p.animate([{ transform: `translate(${from[0]}px,${from[1]}px)` }, { transform: `translate(${x}px,${y}px)` }], { duration: ms, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'forwards' }));
    la = look.animate([{ transform: `translate(${from[0] * .22}px,${from[1] * .12}px) rotate(${from[0] * .3}deg)` }, { transform: `translate(${x * .22}px,${y * .12}px) rotate(${x * .3}deg)` }], { duration: 420, delay: 40, easing: 'cubic-bezier(.3,.6,.3,1)', fill: 'both' });
    old.forEach((a) => a.cancel()); if (oldL) oldL.cancel();
  };
  const glance = () => {
    if (R.mood !== 'death' && R.root.classList.contains('rig-at') && !R.root.classList.contains('rig-off')) {
      const r = rnd(), p = PROP[R.mood] || [0, 0];
      if (r < .26) lookAt(rnd() * 2 - 1, 4.5);               // down at the banner
      else if (r < .5) lookAt(0, 0);                          // at you
      else if (r < .6) lookAt(rnd() * 3 - 1.5, -4.5);         // up at his bag
      else if (r < .8) lookAt(p[0], p[1]);                    // at what he holds
      else if (r < .9) lookAt(-5.5, 3);                       // at the rat
      else lookAt(rnd() < .5 ? -5.8 : 5.8, -.5);              // out over the land, quick
    }
    later(glance, 800 + rnd() * 2200);
  };
  const twitch = () => {
    const i = rnd() < .5 ? 0 : 1, a = sad() ? 5 : -9;
    bob(ears[i]!, `rotate(${a}deg)`, 260);
    if (rnd() < .4) bob(ears[i]!, `rotate(${a * .7}deg)`, 220, { delay: 300 });
    if (rnd() < .3) bob(ears[1 - i]!, `rotate(${a * .6}deg)`, 260, { delay: 90 });
    if (rnd() < .35) bob(brows[i]!, 'translateY(-2.5px)', 320, { delay: 60 });
    later(twitch, 1700 + rnd() * 3300);
  };
  if (!reduced) { lookAt(.5, -4.5, 1); later(blink, 400 + rnd() * 1600); later(glance, 800 + rnd() * 1000); later(twitch, 1100 + rnd() * 2200); }
  const once = (el: Part | null, kf: Keyframe[], o: KeyframeAnimationOptions) => !reduced && el && el.animate(kf, o);
  const perk = (deg = -12, delay = 0) => ears.forEach((e, i) => bob(e, `rotate(${deg}deg)`, 420, { delay: delay + i * 50, at: .3 }));
  // one small piece of business on arriving, by mood
  const biz = (mood: Mood) => {
    if (reduced) return;
    const d = 1 / paceOf(), T = (s: string): Keyframe => ({ transform: s });
    const nd = (kf: Keyframe[], ms: number, delay = 0, o: KeyframeAnimationOptions = {}) => nod.animate(kf, { duration: ms * d, delay: delay * d, easing: 'ease-in-out', ...o });
    if (mood === 'calibrating') { lookAt(2.5, 4); nd([T('none'), { ...T('rotate(2.5deg) translateY(.8px)'), offset: .3 }, { ...T('rotate(1.5deg)'), offset: .5 }, { ...T('rotate(2.5deg) translateY(.8px)'), offset: .7 }, T('none')], 900, 350); later(() => { lookAt(0, 0); perk(-8); }, 1500 * d); }
    if (mood === 'poor') { lookAt(.5, -4.2, 350); nd([T('none'), { ...T('translateY(-1.2px)'), offset: .3 }, { ...T('translateY(3px)'), offset: .7 }, T('translateY(1.6px)')], 1300, 350, { fill: 'forwards' }); later(() => lookAt(0, 3, 450), 1600 * d); }
    if (mood === 'meh') { lookAt(-3, 3, 300); nd([T('none'), { ...T('translateY(-1px) rotate(-.6deg)'), offset: .35 }, { ...T('translateY(2px) rotate(1deg)'), offset: .75 }, T('translateY(1px) rotate(.6deg)')], 1400, 450, { fill: 'forwards' }); }
    if (mood === 'good') { lookAt(5, 1.5); perk(-8, 200 * d); nd([T('none'), { ...T('translateY(2.5px) rotate(1deg)'), offset: .35 }, { ...T('translateY(-.6px)'), offset: .7 }, T('none')], 460, 500); later(() => lookAt(0, 0), 1000 * d); }
    if (mood === 'great') { lookAt(-5, 1); perk(-10, 150 * d); nd([T('none'), { ...T('translateY(-2px) rotate(-1.5deg)'), offset: .4 }, T('none')], 800, 300); later(() => lookAt(0, 0), 900 * d); }
    if (mood === 'superb') { lookAt(-5, 1); perk(-10, 100 * d); nd([T('none'), { ...T('translateY(-2.5px) rotate(-2deg)'), offset: .25 }, { ...T('translateY(-1px) rotate(1.5deg)'), offset: .55 }, { ...T('translateY(-2px) rotate(-1deg)'), offset: .8 }, T('none')], 1300, 150); later(() => lookAt(1, -4.5), 900 * d); later(() => lookAt(0, 0), 1700 * d); }
    if (mood === 'pvp') { lookAt(0, 0); once(kup, [T('translateY(-5px) rotate(-7deg)'), { ...T('translateY(-8px) rotate(-12deg)'), offset: .35 }, { ...T('translateY(-4px) rotate(-5deg)'), offset: .7 }, T('translateY(-5px) rotate(-7deg)')], { duration: 620 * d, delay: 250 * d, easing: 'ease-in-out' }); nd([T('none'), { ...T('translateY(-2px) rotate(-1deg)'), offset: .3 }, { ...T('translateY(1px)'), offset: .6 }, T('none')], 600, 250); }
    if (mood === 'levelup') { lookAt(4.5, -2.5, 250); nd([T('none'), { ...T('translateY(-2.5px)'), offset: .3 }, { ...T('translateY(.5px)'), offset: .6 }, T('translateY(-1px)')], 800, 200, { fill: 'forwards' }); later(() => lookAt(0, 0, 250), 1200 * d); }
    if (mood === 'death') nd([T('none'), T('translateY(2px) rotate(-2deg)')], 1100, 500, { fill: 'forwards' });
    if (mood === 'achievement') { lookAt(5, .5); nd([T('none'), { ...T('translateY(-2px) scale(1.015)'), offset: .4 }, T('translateY(-.6px)')], 900, 250, { fill: 'forwards' }); later(() => lookAt(0, 0), 1100 * d); }
  };
  const calm = () => nod.getAnimations().forEach((a) => a.cancel());
  return {
    arrive: biz,
    changed(mood: Mood) { calm(); biz(mood); },
    struck() { lookAt(0, 4.5, 120); if (!reduced) perk(-7); },
    leave() { if (R.mood !== 'death') lookAt(.5, -4.5, 240); },
    // every frame: the coals follow burn; the cog and the flag hang and sway
    frame(i: FrameInfo) {
      const b = i.burn;
      coal.style.opacity = (.15 + .85 * b).toFixed(2);
      dng.style.transform = `rotate(${(i.hang * 1.2 + Math.sin(i.now * .0019) * 1.5).toFixed(2)}deg)`;
      flw.style.transform = `rotate(${(-i.lean * .8 + Math.sin(i.now * .0031) * 2).toFixed(2)}deg)`;
      // his ears go up and he looks at his fire when it roars
      if (b > .62 && !hot) { hot = true; if (R.mood !== 'death' && !reduced) { lookAt(.4, -4.6, 200); perk(-10); } } else if (b < .35) hot = false;
    },
    stop: ck.stop,
  };
};

export const passenger: PassengerDef = {
  id: 'goblin',
  name: 'The Goblin',
  // blurb: 'The goblin of the original, as a tinted engraving: small, wiry, all ears and yellow eyes, in a stolen crate under a bag he stitched and daubed himself, over a dented pot of coals. The bag says how good the kill was, from a sack of rags held with bent nails to scarlet and bone with a great grinning face, skulls, stolen coins and a looted crown. The news is a banner laced to a pole.',
  spec(ctx: RigCtx): RigSpec {
    paceOf = ctx.pace;
    return {
      id: 'goblin', css: CSS,
      defs: (u) => `<linearGradient id="gbs${u}" x1="0" x2="1"><stop offset="0" stop-color="#5c7040"/><stop offset=".5" stop-color="#84985a"/><stop offset="1" stop-color="#aebb80"/></linearGradient>
<radialGradient id="gby${u}" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#f6e98a"/><stop offset=".6" stop-color="#e6cf52"/><stop offset="1" stop-color="#b8962c"/></radialGradient>
<linearGradient id="gbl${u}" x1="0" x2="1"><stop offset="0" stop-color="#4a3422"/><stop offset=".6" stop-color="#6e4f32"/><stop offset="1" stop-color="#8a6642"/></linearGradient>
<linearGradient id="gbw${u}" x1="0" x2="1"><stop offset="0" stop-color="#4c3622"/><stop offset=".55" stop-color="#80603e"/><stop offset="1" stop-color="#a58458"/></linearGradient>
<linearGradient id="gbi${u}" x1="0" x2="1" y1="0" y2=".3"><stop offset="0" stop-color="#3a3f44"/><stop offset=".55" stop-color="#6c747a"/><stop offset="1" stop-color="#a3abb1"/></linearGradient>
<linearGradient id="gbg${u}" x1="0" x2="1"><stop offset="0" stop-color="#9c7a2c"/><stop offset=".55" stop-color="#dcb64e"/><stop offset="1" stop-color="#f6e2a0"/></linearGradient>`,
      envelope: (mood) => ENV[mood] || ENV.calibrating,
      ropes: { kind: 'rope', dark: '#17120e', light: '#b9a57a', w: 1.4 },
      burner,
      basket,
      behind: (u) => `${sack(u)}<div class="goblin-lift"><div class="goblin-br"><div class="goblin-look"><div class="goblin-nod">${head(u)}${crown(u)}${tears()}</div></div></div></div>
${props(u)}`,
      front: (u) => `${hands(u)}${rat(u)}${dangle(u)}`,
      sign: { w: SW, hx: HX, k: 15, c: 1.9, cord: { kind: 'rope', dark: '#17120e', light: '#b9a57a', w: 1.3 }, board, pips },
      life: liven,
    };
  },
};
