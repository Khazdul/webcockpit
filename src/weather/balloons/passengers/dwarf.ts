// Stage 75 (ADR 0159 round 3): a PORT of the approved mockup's dwarf,
// notes/research/balloons/round5/skins/dwarf.js, on the shared rig
// (../rig.ts). Geometry, markup, CSS and timings are the mockup's; only
// the types and the module shape (no harness: `passenger.spec(ctx)` is the
// mockup's `create(ctx)`) are new. Its own lazy chunk (../passenger.ts).
//
// Round 5: "The Dwarf", built on the shared rig (rig.js). Dwarves do not fly.
// This one was told to, so he made the craft himself and stands in it in his
// mail, under an iron forge-pot of coals.
//
// THE DWARVES' VOCABULARY (decided before drawing; rule 2 of the brief)
//   Materials  stitched hides in gores, riveted iron bands, bronze, then gold;
//              gems in collets; mithril-bright edging on the very best.
//   Motifs     angular only: the key band (a square meander), the lattice
//              (an angular knot), a row of runes; Durin's emblems: hammer and
//              anvil, the seven stars, the crown. Nothing floral, no curves.
//   Colours    dun and grey for the worthless; tan hide; oxblood; deep blue
//              with bronze; cloth of gold and ivory with crimson for the best.
//   "The best" means WROUGHT AND PRECIOUS: gold bands set with gems, a crown
//              for a finial, a dagged skirt of gold lappets, everything new.
//
// THE ENVELOPE LADDER (silhouette and colour both change)
//   poor    a scrap bag: sagging, lopsided, dented; dun mismatched hides, six
//           odd patches (a rusty plate, pale hide, sackcloth), a rope girdle
//   meh     plain tan hide, a little slack, one bare iron band, one neat patch
//   good    sound and full: oxblood hide, a riveted iron band with a key
//           pattern, a bronze hammer-and-anvil boss, an iron knob on top
//   great   fine: deep blue, bronze bands with runes and the key, the seven
//           stars over the anvil in silver, a bronze spire
//   superb  brand new: cloth of gold and ivory, a crimson band with a gold
//           lattice and gems, a crowned shield, a gold crown on top, a skirt
//           of gold and crimson lappets round the mouth
// THE SPECIALS (none can be taken for a rating step)
//   unrated      a chalk-white trial bag marked up with charcoal measuring
//                lines and an empty roundel with the assayer's scales
//   player kill  black hide, a blood-red band with crossed axes, an iron
//                band of spikes that break the outline, iron scales below
//   level up     royal purple with gold chevrons climbing, and a great rune
//                lit from within
//   death        charcoal, half let down, a black crape sash with hanging
//                tails; the fire burns cold blue
//   achievement  emerald with a gold lattice band and a great gold seal with
//                crimson ribbons
//
// The head (helm, brows, living eyes, moustache, braids, loupe, war mask) is
// the round 3/4 warden's drawing at 0.44 instead of 0.72, with its pen line
// thickened to match; he now has shoulders, a breastplate, mail and a belt.

import type { Mood } from '../feed';
import { INK, K, kit, type BoardArgs, type EnvGeo, type EnvSpec, type FrameInfo, type PassengerDef, type Part, type RigBalloon, type RigCtx, type RigSpec } from '../rig';

const { n, S, SL, Z, G, ink2, NS } = kit, HP = kit.P, HQ = kit.Q;
const { W, CX, HG, FY, RY, BY, SY } = K;
// the head's scale and eye line; OS: the scale of the round 4 props that are reused (old px about the old rim, 209)
const HS = .44, HY = RY - 54, OS = .62;
const FILT = (id: string) => kit.filt(id, { freq: .03, scale: 2.6, grain: .5 });
const HATCH = (id: string, rot: number, gap: number, op: number) => kit.hatch(id, rot, gap * 1.6, op, .95);
const thick = (s: string, f: number) => s.replace(/stroke-width="([\d.]+)"/g, (_, v: string) => `stroke-width="${+(Number(v) * f).toFixed(2)}"`);

// ---- moods: how the face, the helm and the hands are held ----
/** A pose: CSS variables by name. */
type Pose = Readonly<Record<string, number>>;
const DEF: Pose = { rise: 0, tilt: 0, bly: 0, blr: 0, bry: 0, brr: 0, lid: 2, low: 0, px: 0, py: 0, es: 1.08, er: 1, hx: 0, hy: 0, hr: 0, hs: 1, ml: 0, grin: 0, arm: 0, paw: 0, hold: 0, mask: 0, loupe: 0, hl: 1, hrt: 1, nug: 0, tank: 0, ty: 0, ovf: 0, hrg: 0, chin: 0, pipe: 0, axe: 0, gem: 0, seal: 0, rings: 0, lg: 1 };
const M: Readonly<Record<string, Pose>> = {
  calibrating: { bly: -5.5, blr: -10, bry: 1, lid: 1.6, loupe: 1, er: 1.18, nug: 1, hrt: 0 },
  poor: { rise: -4, tilt: 2, hy: 9, lid: 3.4, bly: 1.5, bry: 1.5, blr: 9, brr: -9, ml: -5, lg: .55 },
  meh: { rise: -2, tilt: -5, hy: -9, hr: -6, lid: 4.6, bly: 1.5, bry: 1.5, chin: 1, hrg: 1, hl: 0, hrt: 0 },
  good: { blr: 4, brr: -4, lid: 1.4, pipe: 1 },
  great: { rise: 2, bly: -4, bry: -4, lid: .4, tank: 1, ty: 1, hrt: 0, lg: 1.5 },
  superb: { rise: 3, bly: -6, bry: -6.5, blr: -7, brr: 7, lid: -1, es: 1.2, grin: 1, ml: 6, tank: 1, ty: 1, ovf: 1, gem: 1, hl: 0, hrt: 0, lg: 1.6 },
  pvp: { rise: 2, lid: 4.3, low: 2.4, bly: 2, bry: 2, blr: 14, brr: -14, grin: 1, ml: 8, mask: 1, axe: 1, hl: 0, lg: .8 },
  levelup: { hx: -27, hy: 118, hr: -8, hs: .72, hold: 1, hl: 0, bly: -2, bry: -2, lid: 1.6 },
  death: { hx: -27, hy: 118, hr: -8, hs: .72, hold: 1, hl: 0, lg: .5 },
  achievement: { rise: 3, lid: 3.3, bly: -2, bry: -2, blr: 3, brr: -3, seal: 1, rings: 1 },
};
// what he only does once he has arrived
const AT: Readonly<Record<string, Pose>> = {
  levelup: { rise: 1, lid: 1.8 },
  death: { rise: -3, tilt: -4, py: 2.5, lid: 4.5, blr: -10, brr: 10, bly: -1, bry: -1 },
};
// where the thing he holds is, for his glances (pupil units)
const PROP: Readonly<Record<string, readonly [number, number]>> = { calibrating: [3, .2], poor: [.4, -2.2], meh: [2.6, 2], good: [1.4, 2.4], great: [3, 1], superb: [-3, .9], pvp: [-2.6, -1.2], levelup: [-.8, 2.6], achievement: [0, 2.4] };
const RANK: Readonly<Record<string, number>> = { poor: 1, meh: 2, good: 3, great: 4, superb: 5 };
const vars = (o: Pose) => Object.keys(o).filter((k) => k in DEF).map((k) => `--${k}:${o[k]}`).join(';');
const show = (...names: string[]) => names.map((nm) => `.dwarf-${nm}{--x:var(--${nm})}`).join('');

const CSS = `
.dwarf-v{${vars(DEF)};--coal:#e8862e;--go:.9}
${Object.keys(M).map((m) => `.dwarf-v[data-mood=${m}]{${vars(M[m]!)}}`).join('\n')}
.dwarf-v:not(.rig-at){--lid:1.2}
${Object.keys(AT).map((m) => `.rig-at[data-mood=${m}]{${vars(AT[m]!)}}`).join('\n')}
.dwarf-v[data-mood=death]{--rig-f1:#4f8fd0;--rig-f2:#cfe6ff;--rig-gl:120,170,255;--coal:#6f9ccb}
.dwarf-v[data-mood=poor]{--rig-f1:#d5732a;--coal:#b0602c}
.dwarf-v[data-mood=superb]{--rig-gl:255,206,120}
.dwarf-v[data-sky=dusk]{--go:.65}.dwarf-v[data-sky=day]{--go:.25}.dwarf-v[data-sky=overcast]{--go:.38}
.dwarf-v[data-mood=poor] .rig-envb{animation:dwarf-heave 3.3s ease-in-out infinite alternate}
.dwarf-slit{stroke:var(--coal)}.dwarf-coal{fill:var(--coal)}
.dwarf-coalg{width:36px;height:16px;margin:-8px 0 0 -18px;border-radius:50%;opacity:.3;will-change:opacity;background:radial-gradient(closest-side,rgba(var(--rig-gl),.85),rgba(var(--rig-gl),0))}
.dwarf-runeg{opacity:.9;animation:dwarf-pu 1.6s ease-in-out infinite alternate;filter:drop-shadow(0 0 2.5px #ffb84a) drop-shadow(0 0 6px rgba(255,170,60,.7))}
.dwarf-old{position:absolute;left:0;top:0;width:204px;height:0;transform-origin:102px 209px;transform:translateY(${RY - 209}px) scale(${OS})}
.dwarf-lift,.dwarf-br,.dwarf-look,.dwarf-nod{position:absolute;left:0;top:0;width:${W}px;height:0;transform-origin:${CX}px ${RY + 8}px}
.dwarf-lift{transform:translateY(calc(var(--rise)*-1px)) rotate(calc(var(--tilt)*1deg));transition:transform calc(.55s*var(--k)) cubic-bezier(.3,1.25,.5,1)}
.dwarf-br{animation:dwarf-br 4.4s ease-in-out infinite alternate}
.dwarf-head{left:${CX - 125 * HS}px;top:${HY - 100 * HS}px}
.dwarf-helm{transform:translate(calc(var(--hx)*1px),calc(var(--hy)*1px)) rotate(calc(var(--hr)*1deg)) scale(var(--hs));transition:transform calc(.55s*var(--k)) cubic-bezier(.3,1.3,.5,1)}
.dwarf-bL{transform:translateY(calc(var(--bly)*1px)) rotate(calc(var(--blr)*1deg))}
.dwarf-bR{transform:translateY(calc(var(--bry)*1px)) rotate(calc(var(--brr)*1deg))}
.dwarf-bL,.dwarf-bR,.dwarf-mo,.dwarf-eye,.dwarf-pm,.dwarf-lid,.dwarf-low{transition:transform calc(.4s*var(--k)) ease-out}
.dwarf-mo{transform:rotate(calc(var(--ml)*-1deg))}
.dwarf-eye{transform:scale(var(--es))}
.dwarf-eyeR{transform:scale(calc(var(--es)*var(--er)))}
.dwarf-pm{transform:translate(calc(var(--px)*1px),calc(var(--py)*1px))}
.dwarf-lid{transform:translateY(calc(var(--lid)*1px));fill:#a88368;stroke:${INK};stroke-width:1.2}
.dwarf-low{transform:translateY(calc(var(--low)*-1px));fill:#b08b6f;stroke:${INK};stroke-width:1}
.dwarf-grin,.dwarf-mask,.dwarf-loupe{transition:opacity calc(.3s*var(--k))}
.dwarf-grin{opacity:var(--grin)}.dwarf-mask{opacity:var(--mask)}.dwarf-loupe{opacity:var(--loupe)}
.dwarf-arm{opacity:var(--arm);transition:opacity .12s}
.dwarf-paw{opacity:var(--paw);transition:opacity .2s calc(.3s*var(--k))}
.dwarf-p{position:absolute;left:0;top:0;width:${W}px;height:0;opacity:var(--x);transform:translateY(calc((1 - var(--x))*30px));transition:transform calc(.5s*var(--k)) cubic-bezier(.3,1.25,.5,1),opacity calc(.14s*var(--k))}
${show('nug', 'tank', 'hrg', 'chin', 'axe', 'gem', 'hold')}
.dwarf-ty{transform:translateY(calc(var(--ty)*-5px));transition:transform calc(.5s*var(--k)) cubic-bezier(.3,1.3,.5,1);transform-origin:${CX + 40}px ${RY}px}
.dwarf-ovf{opacity:var(--ovf)}
.dwarf-tears{display:none}
.dwarf-v[data-mood=death] .dwarf-tears{display:block}
.dwarf-tear{position:absolute;width:5px;height:15px;overflow:hidden}
.dwarf-tear::before{content:"";position:absolute;left:1.9px;top:0;width:1.2px;height:13px;border-radius:1px;background:linear-gradient(rgba(190,212,228,.38),rgba(190,212,228,.06))}
.dwarf-tear i{position:absolute;left:1.1px;top:-3px;width:2.8px;height:3.8px;border-radius:50% 50% 50% 50%/62% 62% 38% 38%;background:radial-gradient(circle at 35% 35%,rgba(236,244,250,.9),rgba(168,198,220,.75) 55%,rgba(110,150,186,.7));box-shadow:0 0 0 .5px rgba(24,34,54,.3);transform:translateY(var(--r));animation:dwarf-tear 5.6s cubic-bezier(.4,0,.7,.7) infinite;animation-delay:var(--dl)}
@keyframes dwarf-tear{0%{transform:translateY(0) scale(.5);opacity:0}12%{transform:translateY(1.5px) scale(1);opacity:.62}75%{opacity:.62}100%{transform:translateY(16px) scale(.9);opacity:0}}
.dwarf-glint{width:14px;height:14px;margin:-7px 0 0 -7px;animation:dwarf-gl 2.3s ease-in-out infinite}
.dwarf-glint svg{left:0;top:0}
.dwarf-axr{left:${102 - 52}px;top:${209 + 12}px;transform:rotate(-15deg)}
.dwarf-axr svg{transform:scale(1.3);transform-origin:${48 * .62}px ${154 * .62}px}
.dwarf-bd{left:${CX}px;top:${n(HY + 82 * HS)}px;will-change:transform}
.dwarf-rg,.dwarf-xb{opacity:var(--rings)}
.dwarf-hL .dwarf-fg,.dwarf-hR .dwarf-fg{transition:transform calc(.2s*var(--k)) cubic-bezier(.3,1.5,.5,1),opacity calc(.08s*var(--k));transition-delay:calc(var(--i)*.04s*var(--k))}
.dwarf-hL .dwarf-fg{transform:translateY(calc((1 - var(--hl))*9px)) scaleY(calc(.1 + .9*var(--hl)));opacity:var(--hl)}
.dwarf-hR .dwarf-fg{transform:translateY(calc((1 - var(--hrt))*9px)) scaleY(calc(.1 + .9*var(--hrt)));opacity:var(--hrt)}
.dwarf-pipew{position:absolute;left:0;top:0;width:204px;height:0;transform-origin:110px 209px;transform:translate(-4px,${HY + 21 - 209}px) scale(${OS})}
.dwarf-pipe,.dwarf-seal{opacity:0;transition:opacity calc(.3s*var(--k))}
.dwarf-pipe{opacity:var(--pipe)}.dwarf-seal{opacity:var(--seal)}
.dwarf-ring{display:none;left:${102 + 25}px;top:${209 - 17}px}
.dwarf-v[data-mood=good] .dwarf-ring{display:block}
.dwarf-ring i{position:absolute;left:-5px;top:-3px;width:10px;height:6px;border:1.6px solid rgba(238,236,226,.75);border-radius:50%;opacity:0;animation:dwarf-rn 4.5s linear infinite}
.dwarf-ring i+i{animation-delay:-2.2s}
.dwarf-lan,.dwarf-anv{will-change:transform}
.dwarf-lan{left:${102 + 96}px;top:211px}
.dwarf-lan svg{position:absolute;left:-17px;top:-3px;width:34px;height:47.6px;overflow:visible}
.dwarf-lf{transform:translateY(-8px) scale(var(--lg)) translateY(8px)}
.dwarf-lgl{position:absolute;left:-36px;top:-10px;width:72px;height:72px;border-radius:50%;background:radial-gradient(closest-side,rgba(255,206,128,.5),rgba(255,176,88,.16) 45%,rgba(255,160,60,0));opacity:calc(var(--go)*var(--lg)*.7);transition:opacity .5s;animation:dwarf-gw 2.1s ease-in-out infinite alternate}
.dwarf-anv{left:${102 - 96}px;top:211px}
.dwarf-anv svg{transform:scale(1.35);transform-origin:15px 0}
@keyframes dwarf-heave{from{transform:scale(1,1) skewX(0)}to{transform:scale(1.02,.965) skewX(-1.2deg)}}
@keyframes dwarf-br{from{transform:translateY(.5px) scale(1,.997)}to{transform:translateY(-.8px) scale(1,1.005)}}
@keyframes dwarf-pu{from{opacity:.6}to{opacity:1}}
@keyframes dwarf-rn{0%{transform:translate(0,0) scale(.5);opacity:0}8%{opacity:.85}60%{opacity:.4}100%{transform:translate(20px,-52px) scale(2.2);opacity:0}}
@keyframes dwarf-gw{from{transform:scale(.94)}to{transform:scale(1.04)}}
@keyframes dwarf-gl{0%,62%,100%{opacity:0;transform:scale(.4) rotate(0)}74%{opacity:1;transform:scale(1) rotate(20deg)}86%{opacity:0;transform:scale(.5) rotate(40deg)}}
.dwarf-sign{filter:drop-shadow(0 2px 2.5px rgba(0,0,0,.42));--tx:#ece5d2;--dim:#bdb6a3;--fg:#f3ecd9;--on:#e9dfc4;--off:rgba(233,223,196,.24);color:var(--tx)}
.dwarf-sign[data-mood=poor]{--tx:#d9cdb9;--fg:#d9cdb9;--on:#d2793d}
.dwarf-sign[data-mood=good]{--on:#dfbb6a}
.dwarf-sign[data-mood=great]{--fg:#ffe7a0;--on:#ffd76a}
.dwarf-sign[data-mood=superb]{--tx:#f8e9c4;--dim:#dcc391;--fg:#ffe08a;--on:#ffd76a}
.dwarf-sign[data-mood=pvp]{--tx:#f1ddd4;--fg:#ffa283;--on:#e8553c}
.dwarf-sign[data-mood=levelup]{--fg:#ffe7a0}
.dwarf-sign[data-mood=death]{--tx:#c9c5bb;--fg:#d6d2c8}
.dwarf-sign[data-mood=achievement]{--tx:#f2e8cc;--dim:#d2c49c}
.dwarf-sign .rig-text{padding:8px 11px 8px}
.dwarf-sign .rig-title,.dwarf-sign .rig-fig{text-shadow:0 -1px 0 rgba(0,0,0,.6)}
.dwarf-sign .rig-fig{color:var(--fg)}
.dwarf-sign[data-mood=superb] .rig-fig{font-weight:700}
.dwarf-sign .rig-unit,.dwarf-sign .rig-q,.dwarf-sign .rig-more{color:var(--dim)}
.dwarf-on{fill:var(--on);stroke:rgba(0,0,0,.6);stroke-width:.7}.dwarf-of{fill:none;stroke:var(--off);stroke-width:1}
.dwarf-red{fill:none;stroke:#e8553c;stroke-width:2.2;stroke-linecap:round}
.dwarf-sign[data-kind=levelup] .rig-text{padding:13px 8px}
.dwarf-sign[data-kind=levelup] .rig-fig{font:700 21px/1.1 Cinzel,Georgia,serif;letter-spacing:.04em}
.dwarf-sign[data-kind=death] .rig-text{padding:13px 8px}
.dwarf-sign[data-kind=death] .rig-fig{font:400 21px/1.15 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.17em;margin-right:-.17em;text-transform:lowercase;font-variant:small-caps}
.dwarf-sign[data-kind=achievement] .rig-title{font:italic 600 13.5px/1.1 "Cormorant Garamond",Georgia,serif}
`;

// ---- his armour (in the head's units, drawn under the hair and the beard) ----
const armour = (u: number) => {
  const lame = (s: number) => ([[72, 94, 24, 15], [69, 84, 22, 14], [64, 74, 19, 12]] as const).map(([x, y, rx, ry]) => `<g transform="rotate(${16 * s} ${s * x} ${y})"><ellipse cx="${s * x}" cy="${y + 3.5}" rx="${rx}" ry="${ry}" fill="url(#dwb${u})" stroke-width="1.1"/><ellipse cx="${s * x}" cy="${y}" rx="${rx}" ry="${ry - .5}" fill="url(#dwi${u})" stroke-width="1.1"/>${s < 0 ? `<ellipse cx="${s * x}" cy="${y}" rx="${rx}" ry="${ry - .5}" fill="url(#dwp${u})" stroke="none"/>` : `<path d="M${x - rx * .5},${y - ry * .72}Q${x + rx * .5},${y - ry * .9} ${x + rx * .85},${y - ry * .1}" fill="none" stroke="#fff" stroke-width="1.2" opacity=".5"/>`}<circle cx="${s * (x + rx * .62)}" cy="${y + ry * .3}" r="1.9" fill="#e6cc92" stroke-width=".6"/></g>`).join('');
  const sleeve = (s: number) => { const d = `M${s * 56},84C${s * 70},80 ${s * 88},86 ${s * 92},100L${s * 96},150L${s * 64},150L${s * 60},112Z`; return `<path d="${d}" fill="#7c858b" stroke-width="1.1"/><path d="${d}" fill="url(#dwm${u})" stroke="none"/>${s < 0 ? `<path d="${d}" fill="url(#dwp${u})" stroke="none"/>` : ''}<ellipse cx="${s * 80}" cy="121" rx="14" ry="9" fill="url(#dwi${u})" stroke-width="1.1"/><circle cx="${s * 80}" cy="121" r="2.2" fill="#e6cc92" stroke-width=".6"/>`; };
  const body = 'M-60,150L-58,86C-56,72 -44,64 -32,61L32,61C44,64 56,72 58,86L60,150Z';
  return `<path d="${body}" fill="#7c858b" stroke-width="1.2"/><path d="${body}" fill="url(#dwm${u})" stroke="none"/>
<path d="M-60,150L-58,86C-56,72 -44,64 -32,61L-22,61C-42,76 -46,100 -46,150Z" fill="url(#dwp${u})" stroke="none"/>
<path d="M-37,150L-39,98C-37,82 -29,72 -19,66L19,66C29,72 37,82 39,98L37,150Z" fill="url(#dwi${u})" stroke-width="1.2"/>
<path d="M-37,150L-39,98C-37,82 -29,72 -19,66L-10,66C-24,78 -27,100 -26,150Z" fill="url(#dwp${u})" stroke="none"/>
<path d="M-33.500,150L-35.500,99C-33.500,85 -26,76 -17,70M33.500,150L35.500,99C33.500,85 26,76 17,70" fill="none" stroke="#c4a868" stroke-width="1.5"/>
<path d="M25,80C31,88 33,100 32,116" fill="none" stroke="#fff" stroke-width="1.3" opacity=".4"/>
<path d="M25,60L41,66L-41,118L-53,110Z" fill="#6a4526" stroke-width="1"/><g fill="#e6cc92" stroke-width=".5"><circle cx="30" cy="66" r="1.800"/><circle cx="-34" cy="108" r="1.800"/><circle cx="-44" cy="113" r="1.800"/></g>
<path d="M-60,106Q0,116 60,106L60,120Q0,130 -60,120Z" fill="#5a3a22" stroke-width="1.1"/><path d="M-58,109.500Q0,119.500 58,109.500" fill="none" stroke="#b79a5e" stroke-width=".9" stroke-dasharray="2 2.500"/>
<g fill="url(#dwb${u})" stroke-width=".8"><rect x="-49" y="109" width="9" height="11" rx="1"/><rect x="40" y="109" width="9" height="11" rx="1"/><rect x="-30" y="111" width="8" height="11" rx="1"/><rect x="22" y="111" width="8" height="11" rx="1"/></g>
<path d="M-31,61Q0,75 31,61L28,53Q0,65 -28,53Z" fill="url(#dwi${u})" stroke-width="1.1"/>
${sleeve(-1)}${sleeve(1)}${lame(-1)}${lame(1)}`;
};

// ---- the drawing: the warden's head (round 3/4), unchanged but for its size ----
const ALM = 'M-8.5,0Q0,-8 8.5,0Q0,6 -8.5,0Z';
const eye = (s: number, u: number) => `<g transform="translate(${21 * s},0)"><g class="dwarf-eye${s > 0 ? ' dwarf-eyeR' : ''}"><ellipse cy="-1" rx="13.5" ry="9.5" fill="#4e2f20" opacity=".36"/><ellipse cy="-1" rx="13.5" ry="9.5" fill="url(#dwp${u})"/>
<g clip-path="url(#dwc${u})"><path d="${ALM}" fill="#d9cdb3"/><path d="M-10,-6H10V-.8H-10Z" fill="#3d281b" opacity=".36"/>
<g class="dwarf-pm"><g class="dwarf-pg"><circle r="3.5" fill="#3a2414"/><circle r="1.7" fill="#0c0705"/><circle cx="-1.2" cy="-1.3" r=".85" fill="#fff8e6"/></g></g>
<g class="dwarf-bl"><path class="dwarf-lid" d="M-12,-22H12V-5.5Q0,-3.5 -12,-5.5Z"/></g><path class="dwarf-low" d="M-12,18H12V5Q0,4 -12,5Z"/></g>
<path d="${ALM}" fill="none" stroke="${INK}" stroke-width=".8"/><path d="M-9.5,.6Q0,-8.800 9.500,.6" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/>
<path d="M${-8 * s},6.5q${8 * s},5 ${17 * s},-1M${-6 * s},9.5q${7 * s},4 ${14 * s},-.5M${-3 * s},12.5q${5 * s},2.500 ${9 * s},.5M${10 * s},-3l${5.5 * s},-2.500M${10.5 * s},0l${6 * s},.5M${10 * s},3l${5 * s},3" fill="none" stroke="${INK}" stroke-width=".6" stroke-linecap="round" opacity=".8"/></g></g>`;
const BROW = `<g transform="scale(1.16)"><path d="M-14,4C-13,-5 2,-9 15,-4C19,-2 18,3 13,2C6,0 -3,1 -9,6C-12,8 -14,7 -14,4Z" fill="#7b6c5e" stroke="${INK}" stroke-width=".9"/><path d="M-10,3l2.500,-6M-6,1l2.500,-6.500M-1.500,0l2.500,-6M3,-.5l2.500,-5.500M7.500,-.5l2.500,-4.500M11.500,0l3,-3M14,1l4,-1.500" fill="none" stroke="#e0d7c6" stroke-width=".8" stroke-linecap="round"/><path d="M-12,5l2,-5M-8,2.500l2,-5.500M-4,1.500l2,-5M1,0l2,-5M5.500,-.5l2,-4M9.500,0l2,-3.500M-13,6l-2.500,1.500M-10,7l-1.500,2.500" fill="none" stroke="${INK}" stroke-width=".5" opacity=".8"/></g>`;
const LOBE = `<path d="M0,-3C10,-9 25,-7 37,1C47,7 57,8 66,14C57,19.500 46,21 38,18C24,18 10,15 0,9Z" fill="#8a6045" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/><path d="M4,0C16,-4 30,0 46,10M4,3C18,0 32,5 52,14M3,6C16,5 30,10 44,16M12,-4C24,-5 36,2 50,9M8,10C20,12 32,15 42,17" fill="none" stroke="${INK}" stroke-width=".55" opacity=".75"/><path d="M8,-2C20,-5 32,-1 42,5.500M10,4.500C22,4.500 34,8.500 48,14.500M6,8C16,9 26,12 36,15.500" fill="none" stroke="#ddd3c0" stroke-width="1.1" stroke-linecap="round" opacity=".9"/>`;
const rivets = [-46, -31, -16, 16, 31, 46].map((x) => { const y = -25 - 4.5 * (x / 56) ** 2; return `<circle cx="${x}" cy="${y.toFixed(1)}" r="2.200"/><circle cx="${x + .6}" cy="${(y - .7).toFixed(1)}" r=".7" fill="#e9d6a4" stroke="none"/>`; }).join('');
const head0 = (u: number) => `<svg class="rig-s dwarf-head rig-rim" xmlns="${NS}" width="${250 * HS}" height="${260 * HS}" viewBox="-125 -100 250 260"><defs>${FILT('dwf' + u)}${HATCH('dwp' + u, 38, 3, .6)}${HATCH('dwq' + u, -52, 3.400, .5)}
<clipPath id="dwc${u}"><path d="${ALM}"/></clipPath>
<linearGradient id="dwi${u}" x1="0" x2="1" y1="0" y2=".25"><stop offset="0" stop-color="#30353a"/><stop offset=".5" stop-color="#596067"/><stop offset="1" stop-color="#8c949a"/></linearGradient>
<linearGradient id="dws${u}" x1="0" x2="1"><stop offset="0" stop-color="#92705a"/><stop offset=".5" stop-color="#c2a085"/><stop offset="1" stop-color="#e2c7a8"/></linearGradient>
<linearGradient id="dwh${u}" x1="0" x2="1"><stop offset="0" stop-color="#4a2f23"/><stop offset="1" stop-color="#80543b"/></linearGradient>
<linearGradient id="dwb${u}" x1="0" x2="1"><stop offset="0" stop-color="#5c4724"/><stop offset=".6" stop-color="#94793f"/><stop offset="1" stop-color="#c4a868"/></linearGradient></defs>
<g filter="url(#dwf${u})" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">
${armour(u)}
<path d="M-46,-24C-58,-22 -66,-10 -64,2C-70,8 -70,20 -65,26C-71,34 -68,48 -59,60L-38,60L-42,10Z" fill="url(#dwh${u})" stroke-width="1.1"/>
<path d="M-46,-24C-61,-19 -67,2 -63,20C-69,32 -65,46 -57,60L-48,60C-54,40 -54,6 -46,-24Z" fill="url(#dwp${u})" stroke="none"/>
<path d="M46,-24C58,-22 66,-10 64,2C70,8 70,20 65,26C71,34 68,48 59,60L38,60L42,10Z" fill="#7f553c" stroke-width="1.1"/>
<path d="M-56,-12C-60,4 -58,18 -60,30M-51,-10C-55,8 -53,24 -57,44M-49,12C-51,28 -50,40 -52,54M56,-12C60,4 58,18 60,30M52,-6C55,10 53,26 57,44M49,10C51,24 50,38 52,52" fill="none" stroke-width=".55" opacity=".75"/>
<path d="M-54,-14C-57,2 -55,16 -58,34M53,-14C57,0 55,14 58,30M50,14C52,26 52,38 54,50M59,-6C62,6 60,16 62,24" fill="none" stroke="#d6ccb9" stroke-width="1.1" opacity=".9"/>
<path d="M-46,-10C-48,-42 -28,-57 0,-57C28,-57 48,-42 46,-10Z" fill="url(#dws${u})" stroke-width="1.1"/>
<path d="M-46,-10C-48,-42 -28,-57 -6,-57C-26,-50 -36,-34 -34,-10Z" fill="url(#dwp${u})" stroke="none"/>
<path d="M-30,-40C-12,-45 14,-45 30,-40M-34,-32C-12,-37 14,-37 34,-32M-20,-47C-8,-50 10,-50 20,-47" fill="none" stroke-width=".55" opacity=".6"/>
<path d="M-36,-25C-12,-29 12,-29 36,-25" fill="none" stroke="#8f4a38" stroke-width="1.1" opacity=".45"/>
<path d="M-16,-56C-13,-63 -5,-61 -8,-55M3,-57C7,-64 13,-61 10,-56M-3,-58C-2,-63 2,-64 3,-60" fill="none" stroke="#c9bfad" stroke-width=".9"/>
<path d="M-47,-24C-51,-4 -51,22 -44,44L44,44C51,22 51,-4 47,-24Z" fill="url(#dws${u})" stroke-width="1.1"/>
<path d="M-47,-24C-51,-4 -51,22 -44,44L-30,44C-39,24 -39,0 -35,-24Z" fill="#4e2f20" opacity=".22" stroke="none"/>
<path d="M-47,-24C-51,-4 -51,22 -44,44L-33,44C-41,24 -41,0 -38,-24Z" fill="url(#dwp${u})" stroke="none"/>
<path d="M-47,-24C-51,-4 -51,22 -44,44L-40,44C-46,24 -46,0 -43,-24Z" fill="url(#dwq${u})" stroke="none"/>
<path d="M-47,-23Q0,-16 47,-23L46.500,-12Q0,-4 -46.500,-12Z" fill="#3d281b" opacity=".3" stroke="none"/><path d="M-47,-23Q0,-16 47,-23L46.500,-14Q0,-7 -46.500,-14Z" fill="url(#dwq${u})" stroke="none"/>
<ellipse cx="-30" cy="18" rx="10" ry="7" fill="#9c4a36" opacity=".16" stroke="none"/><ellipse cx="31" cy="18" rx="10" ry="7" fill="#b25a44" opacity=".16" stroke="none"/>
<path d="M-20,20C-27,22 -33,28 -36,36M20,20C27,22 33,28 36,36M-25,27C-29,29 -32,33 -33,37M25,27C29,29 32,33 33,37M-40,2C-43,8 -43,14 -41,20M40,2C43,8 43,14 41,20M-3,-17v6M3.500,-17v5.500M36,6l5,5M38,12l4,5" fill="none" stroke-width=".6" opacity=".75"/>
<path d="M-56,22C-62,58 -46,100 0,122C46,100 62,58 56,22C30,42 -30,42 -56,22Z" fill="url(#dwh${u})" stroke-width="1.2"/>
<path d="M-10,42C-9,70 -4,96 0,120C4,96 9,70 10,42Z" fill="#b9ad9b" opacity=".5" stroke="none"/>
<path d="M-54,30C-22,50 22,50 54,30L50,46C22,62 -22,62 -50,46Z" fill="url(#dwp${u})" stroke="none"/>
<path d="M-56,22C-62,58 -46,100 0,122C-30,96 -44,60 -42,32Z" fill="url(#dwq${u})" stroke="none"/>
<path d="M-46,40C-44,64 -34,86 -14,104M-34,44C-32,66 -24,86 -6,108M-20,46C-20,66 -14,88 0,112M20,46C20,66 14,88 0,112M34,44C32,66 24,86 8,106M46,40C44,64 36,84 18,102" fill="none" stroke-width=".55" opacity=".7"/>
<path d="M-27,45C-26,64 -20,82 -8,100M27,45C26,64 20,82 8,100M-8,47C-8,66 -4,84 0,100M-41,46C-39,60 -34,74 -26,86M41,46C39,60 34,74 26,86M14,46C13,62 9,80 4,96" fill="none" stroke="#d6ccb9" stroke-width="1.2" opacity=".9"/>
<g class="dwarf-grin"><path d="M-19,38C-9,50 9,50 19,38C9,42.500 -9,42.500 -19,38Z" fill="#dccfae" stroke-width=".9"/><path d="M-11.500,41.500v4.500M-6,42.300v5.200M0,42.600v5.600M6,42.300v5.200M11.500,41.500v4.500" fill="none" stroke-width=".6"/></g></g>
<g transform="translate(0,31)" filter="url(#dwf${u})"><g class="dwarf-mo">${LOBE}</g></g><g transform="translate(0,31) scale(-1,1)" filter="url(#dwf${u})"><g class="dwarf-mo">${LOBE}<path d="M0,-3C10,-9 25,-7 37,1C47,7 57,8 66,14C52,12 40,8 30,6C18,3 8,2 0,2Z" fill="url(#dwp${u})" stroke="none"/></g></g>
<g stroke="${INK}" stroke-linejoin="round" stroke-linecap="round" filter="url(#dwf${u})">
<path d="M-5,-10C-7,2 -15,8 -17,18C-18.500,28 -9,34.500 0,33.500C9,34.500 18.500,28 17,18C15,8 7,2 5,-10Z" fill="#bd9174" stroke-width="1.1"/>
<path d="M-17,18.500C-22,19.500 -22,28.500 -15,29M17,18.500C22,19.500 22,28.500 15,29" fill="#ab7f64" stroke-width="1"/>
<ellipse cx="-1" cy="23" rx="13" ry="8.500" fill="#a3402c" opacity=".17" stroke="none"/><ellipse cx="5.500" cy="16" rx="5" ry="7" fill="#f3dcc0" opacity=".42" stroke="none"/>
<path d="M-5,-10C-7,2 -15,8 -17,18C-18.500,28 -9,34.500 -3,33.500C-10,28 -10,16 -3,4Z" fill="url(#dwp${u})" stroke="none"/>
<path d="M-11,31q3.500,2.500 7,.5M11,31q-3.500,2.500 -7,.5" fill="none" stroke-width="1.1"/><path d="M-2,8q3,6 1.500,13M7,24q3,-1 4,-4" fill="none" stroke-width=".5" opacity=".6"/></g>
${eye(-1, u)}${eye(1, u)}
<g transform="translate(-22,-10.5)"><g class="dwarf-bL"><g transform="scale(-1,1)">${BROW}</g></g></g><g transform="translate(22,-10.5)"><g class="dwarf-bR">${BROW}</g></g>
${faceX(u)}<g transform="translate(0,-20)"><g class="dwarf-helm"><g transform="translate(0,20)" filter="url(#dwf${u})" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">
<path d="M-53,-24C-56,-58 -32,-74 0,-74C32,-74 56,-58 53,-24Z" fill="url(#dwi${u})" stroke-width="1.3"/>
<path d="M-53,-24C-56,-58 -32,-74 -4,-74C-22,-64 -30,-48 -29,-24Z" fill="url(#dwp${u})" stroke="none"/><path d="M-53,-24C-56,-58 -32,-74 -18,-73C-36,-62 -44,-46 -43,-24Z" fill="url(#dwq${u})" stroke="none"/>
<path d="M30,-33C30,-50 22,-63 10,-71C24,-66 40,-54 44,-33Z" fill="url(#dwp${u})" stroke="none" opacity=".55"/>
<path d="M24,-68C38,-61 47,-49 48,-38C41,-50 33,-60 24,-68Z" fill="#fff" opacity=".28" stroke="none"/>
<path d="M-28,-34C-27,-54 -17,-67 -5,-73M28,-34C27,-54 17,-67 5,-73" fill="none" stroke-width=".9"/>
<path d="M-6,-32C-6,-56 -4,-69 0,-75C4,-69 6,-56 6,-32Z" fill="#6c747a" stroke-width="1"/><path d="M-3,-36v-22M3,-36v-22" fill="none" stroke-width=".45" opacity=".6"/>
<path d="M12,-71.500C34,-69 53,-54 50.500,-36" fill="none" stroke="#ffe7b8" stroke-width="1" opacity=".6"/>
<path d="M35,-50l5,3M16,-58l3,4l3,-2M-14,-48l4,2M38,-42l3,5" fill="none" stroke-width=".6" opacity=".7"/>
<ellipse cx="0" cy="-76" rx="5.500" ry="3.600" fill="url(#dwb${u})" stroke-width="1"/>
<path d="M-56.500,-35Q0,-29 56.500,-35L56.500,-23Q0,-16 -56.500,-23Z" fill="url(#dwb${u})" stroke-width="1.3"/>
<path d="M-56.500,-35Q-28,-32 -20,-31.500L-20,-18.500Q-40,-20 -56.500,-23Z" fill="url(#dwp${u})" stroke="none"/>
<path d="M-55,-31.500Q0,-25.500 55,-31.500M-55,-25.500Q0,-18.800 55,-25.500" fill="none" stroke-width=".5" opacity=".75"/>
<path d="M-5.500,-21L-4,-7Q0,-3.500 4,-7L5.500,-21Z" fill="url(#dwb${u})" stroke-width="1.1"/><path d="M0,-19v11" fill="none" stroke-width=".55" opacity=".7"/>
<g fill="#7a6232" stroke-width=".7">${rivets}</g>
${helmX(u)}<g class="dwarf-paw" fill="#b79479" stroke-width="1"><path d="M-24,-62c-3,-6 4,-11 8,-6l4,7c2,5 -6,8 -9,4Z"/><path d="M-13,-68c-2,-7 6,-10 9,-4l2,8c1,5 -7,7 -9,2Z"/><path d="M-1,-70c-1,-7 8,-8 10,-2l1,8c0,5 -8,6 -10,1Z"/><path d="M11,-69c1,-7 9,-6 10,0l-1,8c-1,5 -8,4 -9,-1Z"/><path d="M-19,-62q3,-2 6,0M-8,-66q3,-2 6,-1M4,-67q3,-1.500 6,0M14,-65q3,-1 5,.5" fill="none" stroke-width=".6"/></g>
</g></g></g>
</svg>`;
const finger = (x: number, i: number, len: number) => `<g transform="translate(${x},0)"><g class="dwarf-fg" style="--i:${i}"><path d="M-5.800,-3C-5.800,-11 5.800,-11 5.800,-3L5.500,${len - 5}C5.500,${len + 1.5} -5.500,${len + 1.5} -5.500,${len - 5}Z" fill="#b79479" stroke="${INK}" stroke-width="1.1"/><path d="M-5.800,-3C-5.800,-11 0,-11 -1,-9C-3,-4 -3,${len - 6} -2,${len}C-5,${len} -5.500,${len - 2} -5.500,${len - 5}Z" fill="#4e2f20" opacity=".3"/><path d="M-3.800,-2Q0,-.2 3.800,-2M-3.300,-4.800Q0,-3.600 3.300,-4.800" fill="none" stroke="${INK}" stroke-width=".6"/><path d="M-3.300,${len - 5}Q0,${len - 7.5} 3.300,${len - 5}L3.300,${len - 4}Q0,${len} -3.300,${len - 4}Z" fill="#cdb597" stroke="${INK}" stroke-width=".45"/></g></g>`;
const braid = (x: number) => { let s = ''; for (let j = 0; j < 3; j++) { const y = 3 + j * 5.5, m = j % 2 ? -1 : 1; s += `<path d="M${-6.5 * m},${y}C${-7.5 * m},${y + 5} ${0},${y + 8.5} ${6.5 * m},${y + 7}C${7.5 * m},${y + 2} 0,${y - 1.5} ${-6.5 * m},${y}Z" fill="${j % 2 ? '#74492f' : '#8e5f43'}" stroke="${INK}" stroke-width=".9"/><path d="M${-3 * m},${y + 2}Q0,${y + 3.5} ${3.5 * m},${y + 5}" fill="none" stroke="#d6ccb9" stroke-width=".8"/>`; } return `<g transform="translate(${x},0)">${s}<rect x="-5.500" y="20.500" width="11" height="4.500" rx="1" fill="#a88b4c" stroke="${INK}" stroke-width=".8"/><path d="M-4.500,25C-6,29 -2,31.500 0,31.500C2,31.500 6,29 4.500,25Z" fill="#8a6045" stroke="${INK}" stroke-width=".8"/></g>`; };
// on the face, under the helm: the jeweller's loupe. On the helm: the war mask, the saluting arm.
const faceX = (u: number) => `<g class="dwarf-loupe" stroke="${INK}" stroke-linejoin="round" filter="url(#dwf${u})"><path d="M19,-11L23,-27M26,-10L33,-25" fill="none" stroke="#3a2616" stroke-width="2.4"/><circle cx="21" cy="-1" r="12.5" fill="url(#dwb${u})" stroke-width="1.2"/><circle cx="21" cy="-1" r="9" fill="#17110c" stroke-width="1"/></g><g class="dwarf-loupe"><circle cx="21" cy="-1" r="8.4" fill="#a9cbd6" opacity=".3"/><path d="M14.500,-5Q17.500,-9.500 23,-8.500" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity=".85"/></g>`;
const helmX = (u: number) => `<g class="dwarf-mask"><path fill-rule="evenodd" d="M-56,-24L56,-24L55,28Q48,37 40,27L34,12L8,10L6,29Q0,35 -6,29L-8,10L-34,12L-40,27Q-48,37 -55,28ZM-34,0Q-21,-12 -8,0Q-21,8 -34,0ZM8,0Q21,-12 34,0Q21,8 8,0Z" fill="url(#dwi${u})" stroke-width="1.3"/><path d="M-56,-24L56,-24L55,28Q48,37 40,27L34,12L8,10L6,29Q0,35 -6,29L-8,10L-34,12L-40,27Q-48,37 -55,28Z" fill="#14161a" opacity=".3" stroke="none"/><path d="M36,-22L50,-22L49,24Q46,28 42,24L37,10Z" fill="#fff" opacity=".14" stroke="none"/><path d="M-40,14L-44,26M40,14L44,26M-3,12V27M3,12V27" fill="none" stroke-width=".6" opacity=".7"/>
<path d="M-56,-24L-20,-24L-20,-10Q-34,-8 -40,27Q-48,37 -55,28Z" fill="url(#dwp${u})" stroke="none"/><path d="M-36,-5Q-21,-17 -6,-7M6,-7Q21,-17 36,-5" fill="none" stroke-width="1.8"/><path d="M47,-16L46,16" fill="none" stroke="#dfe6ea" stroke-width="1" opacity=".5"/><path d="M0,10V27" fill="none" stroke-width=".6" opacity=".7"/>
<g fill="#8e2a1f" stroke-width=".6"><circle cx="-46" cy="-8" r="1.900"/><circle cx="-46" cy="8" r="1.900"/><circle cx="46" cy="-8" r="1.900"/><circle cx="46" cy="8" r="1.900"/><circle cx="0" cy="-16" r="1.900"/></g></g>
<g class="dwarf-arm"><g transform="rotate(14 4 -27)"><path d="M-6,-8L-11,112H19L13,-8Z" fill="#737b81" stroke-width="1.2"/><path d="M-6,-8L-11,112H-2L0,-8Z" fill="url(#dwp${u})" stroke="none"/><path d="M-7.500,22h22M-7.700,42h22.500M-7.800,62h23" fill="none" stroke-width=".6" opacity=".7"/>
<path d="M-10,-4L-8,-17H15L17,-4Z" fill="url(#dwb${u})" stroke-width="1.1"/><path d="M-9,-10H16" fill="none" stroke="#b79a5e" stroke-width="1.100" stroke-dasharray="2 2.500"/>
<path d="M-11,-22C-14,-34 -8,-40 3.500,-40C15,-40 21,-34 18,-22C16,-15 -9,-15 -11,-22Z" fill="#b79479" stroke-width="1.1"/><path d="M-11,-22C-14,-34 -8,-40 -3,-40C-7,-34 -7,-26 -5,-17C-9,-18 -10,-20 -11,-22Z" fill="#4e2f20" opacity=".3" stroke="none"/><path d="M-4,-39.500v13M3.500,-40v13.500M11,-39.500v13M-9,-27q12.500,3 25.500,0" fill="none" stroke-width=".7"/>
<path d="M12,-22C20,-27 26,-21 23,-16C20,-12 13,-14 12,-18Z" fill="#c2a085" stroke-width="1"/></g></g>`;

const head = (u: number) => thick(head0(u), 1.45);
const pp = kit.pp;

// the braids hang from the beard and swing on their own
const braids = (u: number) => {
  const rg = (x: number) => `<rect class="dwarf-rg" x="${x - 6.5}" y="9" width="13" height="5" rx="1.5" fill="#e0bb55" stroke="${INK}" stroke-width=".8"/>`;
  return `<div class="rig-z dwarf-bd"><svg class="rig-s rig-rim" xmlns="${NS}" width="${120 * HS}" height="${48 * HS}" viewBox="-60 -6 120 48" style="left:${-60 * HS}px;top:${-6 * HS}px"><g filter="url(#dwf${u})">${thick(`<g class="dwarf-xb">${braid(-38)}${braid(38)}${rg(-38)}${rg(38)}</g>${braid(-19)}${braid(19)}${rg(-19)}${rg(19)}`, 1.4)}</g></svg></div>`;
};
const hands = (u: number) => {
  const h = (cls: string, x: number) => `<g transform="translate(${x},${RY - 2}) scale(.42)"><g class="${cls}">${finger(-18.5, 0, 12)}${finger(-6.2, 1, 14)}${finger(6.2, 2, 13.5)}${finger(18.5, 3, 11)}</g></g>`;
  return S('rig-rim', -56, RY - 10, 112, 20, `<g filter="url(#rgf${u})">${thick(h('dwarf-hL', -37) + h('dwarf-hR', 37), 1.5)}</g>`);
};

// ---- what he holds: a forearm in a vambrace rises from behind the rim (the elbow stays in the bucket) ----
const fore = (u: number, ex: number, ey: number, hx: number, hy: number, w = 8) => {
  const dx = hx - ex, dy = hy - ey, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L, a = w / 2 + 1.2, b = w / 2;
  const at = (f: number, o: number) => `${n(ex + dx * f + nx * o)},${n(ey + dy * f + ny * o)}`;
  return `<path d="M${at(0, a)}L${at(1, b)}L${at(1, -b)}L${at(0, -a)}Z" fill="#737b81" stroke-width="1"/><path d="M${at(0, -a)}L${at(1, -b)}L${at(1, -b * .2)}L${at(0, -a * .2)}Z" fill="${HP(u)}" stroke="none"/><path d="M${at(.3, a * .9)}L${at(.3, -a * .9)}M${at(.52, a * .8)}L${at(.52, -a * .8)}" fill="none" stroke-width=".5" opacity=".7"/><path d="M${at(.78, b + 1.2)}L${at(.93, b + 1)}L${at(.93, -b - 1)}L${at(.78, -b - 1.2)}Z" fill="#b79a5e" stroke-width=".8"/>`;
};
const fist = (x: number, y: number, r = 5) => `<path d="M${x - r},${y}C${x - r},${n(y - r * 1.15)} ${x + r},${n(y - r * 1.15)} ${x + r},${y}C${x + r},${n(y + r * .9)} ${x - r},${n(y + r * .9)} ${x - r},${y}Z" fill="#b79479" stroke-width="1"/><path d="M${n(x - r * .5)},${n(y - r * .78)}v${n(r * .75)}M${x},${n(y - r * .86)}v${n(r * .8)}M${n(x + r * .5)},${n(y - r * .78)}v${n(r * .75)}" fill="none" stroke-width=".5"/>`;
// the helm held to his chest (level up, death): a bent forearm across the breastplate, the hand on the brim
const hold = (u: number) => `<div class="dwarf-p dwarf-hold">${S('rig-rim', -44, HY + 30, 50, 26, G(u, `${fore(u, -37, RY - 1, -8, HY + 45, 8.5)}${fist(-6, HY + 43.5, 5.2)}`))}</div>`;
// tears (death): two drops a cheek run from the lid down into the moustache, over a wet streak; they stay on his face
const tears = () => `<div class="rig-a dwarf-tears">${([[-12.6, 4, '-3deg', 0], [7.6, 4, '3deg', -2.4]] as const).map(([x, y, a, dl]) => `<div class="dwarf-tear" style="left:${CX + x}px;top:${HY + y}px;transform:rotate(${a})"><i style="--r:5px;--dl:${dl}s"></i><i style="--r:11px;--dl:${dl - 2.8}s"></i></div>`).join('')}</div>`;
const PR = (cls: string, u: number, x: number, y: number, body: string) => `<div class="dwarf-p ${cls}">${S('rig-rim', x, y, 44, RY - y + 8, G(u, body))}</div>`;
const props = (u: number) => {
  const E = RY + 3, t = HY + 22, hg = RY - 27, gy = HY + 11;
  // the nugget he assays (unrated)
  return PR('dwarf-nug', u, 18, HY - 12, `${fore(u, 38, E, 39, HY + 17)}${fist(39, HY + 13, 5)}<g transform="translate(39,${HY + 4})"><g class="dwarf-ng"><path d="M-5,3.500L-3.500,-3L1,-5.500L5.500,-2L4.500,3.500Z" fill="#d9b24c" stroke-width=".9"/><path d="M-3.500,-3L0,-.5L1,-5.500M0,-.5L4.500,3.500M0,-.5L-5,3.500" fill="none" stroke-width=".5"/><path d="M-2.500,-2.500L.5,-4" fill="none" stroke="#fff6d0" stroke-width="1"/></g></g>`)
    // the tankard (great, superb)
    + `<div class="dwarf-p dwarf-tank"><div class="rig-a dwarf-ty">${S('rig-rim', 22, HY, 30, RY - HY + 8, G(u, `${fore(u, 38, E, 44, t + 6)}
<path d="M40,${t - 6}C47,${t - 6} 47,${t + 6} 40,${t + 6}" fill="none" stroke-width="3.400"/><path d="M40,${t - 6}C47,${t - 6} 47,${t + 6} 40,${t + 6}" fill="none" stroke="#8d949b" stroke-width="1.700"/>
<path d="M28,${t - 9}H40L39.400,${t + 8.5}H28.600Z" fill="#84603d" stroke-width="1"/><path d="M28,${t - 9}H32.500L32.800,${t + 8.5}H28.600Z" fill="${HP(u)}" stroke="none"/><path d="M32,${t - 8}V${t + 8}M36,${t - 8}V${t + 8}" fill="none" stroke-width=".45" opacity=".7"/>
<path d="M28.100,${t - 6}h11.800v2.400h-11.700ZM28.400,${t + 4}h11.100v2.400h-11Z" fill="#6c747a" stroke-width=".7"/>
<path d="M27,${t - 8.5}C24.500,${t - 12.5} 29,${t - 15} 31.500,${t - 13}C33,${t - 17} 38.500,${t - 16} 39,${t - 13}C43,${t - 14} 44,${t - 9.5} 41,${t - 8.5}Z" fill="#f1e9d4" stroke-width=".9"/>
<g class="dwarf-ovf"><path d="M27.600,${t - 9}C26,${t - 4} 27,${t + 1} 29,${t + 3}C30.200,${t} 29.800,${t - 5} 30.800,${t - 9}ZM35.500,${t - 9}c1.200,4 0,7 1.200,9.500c1.200,-2 1.200,-6 1.800,-9.500Z" fill="#f1e9d4" stroke-width=".8"/><circle cx="27.500" cy="${t + 7}" r="1.100" fill="#f1e9d4" stroke-width=".6"/></g>${fist(44, t + 1, 4.4)}`))}</div></div>`
    // the hourglass (meh)
    + PR('dwarf-hrg', u, 24, RY - 40, `${fore(u, 38, E, 41, RY - 11)}<path d="M35,${hg - 9}H47V${hg - 7}H35ZM35,${hg + 7}H47V${hg + 9}H35Z" fill="#84603d" stroke-width=".9"/><path d="M36.800,${hg - 7}H45.200L41.900,${hg}L45.200,${hg + 7}H36.800L40.100,${hg}Z" fill="#cfe2e8" fill-opacity=".55" stroke-width=".9"/><path d="M38.300,${hg - 5}H43.700L41,${hg - 1}ZM37.600,${hg + 6.6}Q41,${hg + 2} 44.400,${hg + 6.6}Z" fill="#d9b24c" stroke-width=".4"/><path d="M35.800,${hg - 7}V${hg + 7}M46.200,${hg - 7}V${hg + 7}" fill="none" stroke-width=".9"/>${fist(41, RY - 14, 4.6)}`)
    // cheek on his fist (meh)
    + PR('dwarf-chin', u, -44, HY + 20, `${fore(u, -36, E, -18, HY + 36, 9)}${fist(-17, HY + 32, 5.6)}`)
    // the gem held up to the light (superb)
    + `<div class="dwarf-p dwarf-gem"><div class="rig-a dwarf-gemw">${S('rig-rim', -56, HY - 24, 30, RY - HY + 32, G(u, `${fore(u, -38, E, -45, HY + 27)}
<g transform="translate(-45,${gy})"><path d="M0,-8.500L6.500,-3.500L4.500,6H-4.500L-6.500,-3.500Z" fill="#e3f1f2" stroke-width="1"/><path d="M-6.500,-3.500H6.500M-3,-3.500L0,-8.500L3,-3.500L0,6L-3,-3.500M-4.500,6L-3,-3.500M4.500,6L3,-3.500" fill="none" stroke-width=".5"/><path d="M-6.500,-3.500L-3,-3.500L0,6H-4.500Z" fill="#7fb6c9" opacity=".5" stroke="none"/><path d="M-2,-6L-4,-4" fill="none" stroke="#fff" stroke-width="1.100"/></g>${fist(-45, HY + 23, 5)}`))}
${Z('dwarf-glint', -49, gy - 5, SL('', 0, 0, 14, 14, '<path d="M7,0L8.200,5.800L14,7L8.200,8.200L7,14L5.800,8.200L0,7L5.800,5.800Z" fill="#fffbe8"/>'))}</div></div>`;
};

// ---- round 4 gear reused as drawn (old px about the old rim, 209; shown at OS inside a .dwarf-old box) ----
const OLD = (() => {
  const CX = 102, RY = 209;
  const S = (cls: string, x: number, y: number, w: number, h: number, body: string) => `<svg class="rig-s ${cls}" xmlns="${NS}" style="left:${CX + x}px;top:${y}px" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}">${body}</svg>`;
  const G = (u: number, body: string, extra = '') => kit.G(u, body, extra);
  const lampArt = () => `<svg xmlns="${NS}" width="40" height="56" viewBox="-20 -54 40 56"><g stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">
<circle cx="0" cy="-46" r="4" fill="none" stroke-width="1.3"/><path d="M-12,-31L0,-42L12,-31Z" fill="#4a4f55" stroke-width="1.2"/>
<rect x="-9" y="-31" width="18" height="25" fill="#f3bf62" stroke-width="1.3"/><rect x="-9" y="-31" width="18" height="25" fill="#fff0bd" opacity=".45" stroke="none"/>
<g class="dwarf-lf"><path d="M0,-25C4.500,-18 4.500,-12 0,-9.500C-4.500,-12 -4.500,-18 0,-25Z" fill="#fffbe6" stroke="#d07a22" stroke-width=".8"/></g>
<path d="M-3,-31V-6M3,-31V-6" fill="none" stroke-width="1" opacity=".8"/><rect x="-11.500" y="-6.500" width="23" height="6" rx="1" fill="#4a4f55" stroke-width="1.2"/><path d="M-9,-33.500l9,-7" fill="none" stroke="#aab3ba" stroke-width=".8" opacity=".7"/></g></svg>`;
  const axe = (u: number) => `<div class="dwarf-p dwarf-axe"><div class="rig-z dwarf-axr"><svg class="rig-s rig-rim" xmlns="${NS}" width="${96 * .62}" height="${160 * .62}" viewBox="-48 -154 96 160" style="left:${-48 * .62}px;top:${-154 * .62}px">${G(u, `<path d="M-3.500,-140H3.500V4H-3.500Z" fill="#6f4d2f" stroke-width="1.2"/><path d="M-1,-136V0M1.500,-120V-20" fill="none" stroke-width=".5" opacity=".6"/>
${[1, -1].map((s) => `<g transform="scale(${s},1)"><path d="M-3.500,-134C-14,-137 -30,-140 -41,-129C-36,-116 -36,-106 -43,-90C-28,-93 -13,-101 -3.500,-106Z" fill="url(#dwi${u})" stroke-width="1.4"/><path d="M-38.500,-127C-33.500,-115 -33.500,-106 -39.500,-93" fill="none" stroke="#f2f5f6" stroke-width="1.3" opacity=".85"/><path d="M-28,-132l8,8M-30,-124l10,10M-30,-114l10,9M-32,-104l9,7M-12,-128l4,4" fill="none" stroke-width=".55" opacity=".6"/></g>`).join('')}
<path d="M-5.500,-136H5.500V-104H-5.500Z" fill="url(#dwb${u})" stroke-width="1.1"/><path d="M-3,-136L0,-150L3,-136Z" fill="#8d949b" stroke-width="1"/><circle cx="0" cy="-128" r="1.500" fill="#e6cc92" stroke-width=".5"/><circle cx="0" cy="-112" r="1.500" fill="#e6cc92" stroke-width=".5"/>`)}</svg></div></div>`;
  const pipe = (u: number) => S('dwarf-pipe rig-rim', -4, RY - 20, 44, 34, G(u, `<path d="M8,${RY}C12,${RY + 8} 21,${RY + 8} 25,${RY - 1}" fill="none" stroke-width="4"/><path d="M8,${RY}C12,${RY + 8} 21,${RY + 8} 25,${RY - 1}" fill="none" stroke="#6a4526" stroke-width="2.200"/><path d="M19,${RY - 14}H31.500L30,${RY - 2}Q25.200,${RY + 2.5} 20.500,${RY - 2}Z" fill="#7a4d2a" stroke-width="1.1"/><path d="M19,${RY - 14}H23L23.500,${RY}Q21,${RY - .5} 20.500,${RY - 2}Z" fill="#000" opacity=".3" stroke="none"/><ellipse cx="25.200" cy="${RY - 14}" rx="6.300" ry="1.900" fill="#e8862e" stroke-width=".9"/>`));
  const seal = (u: number) => { const c = `M-40,${RY + 3}Q-34,${RY + 21} -9,${RY + 25}M40,${RY + 3}Q34,${RY + 21} 9,${RY + 25}`; return S('dwarf-seal rig-rim', -46, RY, 92, 52, G(u, `<path d="${c}" fill="none" stroke-width="5"/><path d="${c}" fill="none" stroke="#e0bb55" stroke-width="3" stroke-dasharray="3.400 1.800" stroke-linecap="butt"/>
<path d="M-4.500,${RY + 34}L-8,${RY + 47}L-3,${RY + 43.5}L0,${RY + 48}L3,${RY + 43.5}L8,${RY + 47}L4.500,${RY + 34}Z" fill="#8a3323" stroke-width=".9"/>
<circle cx="0" cy="${RY + 27}" r="10.500" fill="#d9b24c" stroke-width="1.2"/><circle cx="0" cy="${RY + 27}" r="7.500" fill="#ecd07a" stroke-width=".7"/><path d="M0,${RY + 21.5}V${RY + 32.5}M0,${RY + 22.5}L4,${RY + 25.5}L0,${RY + 28.500}M0,${RY + 26}L-3.500,${RY + 29.5}" fill="none" stroke="#5a3a10" stroke-width="1.300"/><path d="M-7,${RY + 21}Q-3,${RY + 17.5} 2,${RY + 18}" fill="none" stroke="#fff6d0" stroke-width="1.100" opacity=".8"/>`)); };
  const anvil = (u: number) => `<div class="rig-z dwarf-anv"><svg class="rig-s rig-rim" xmlns="${NS}" width="30" height="26" viewBox="-15 0 30 26" style="left:-15px;top:0"><path d="M0,2V10" fill="none" stroke="#17120e" stroke-width="2.800" stroke-dasharray="2.200 1.400"/><path d="M0,2V10" fill="none" stroke="#8d949b" stroke-width="1.300" stroke-dasharray="2.200 1.400"/><g filter="url(#rgf${u})" stroke="${INK}" stroke-linejoin="round"><path d="M-13,11Q-9,9.500 -5,9.500H9V13H4.500Q2.500,16 4.500,19H8V22.500H-8V19H-4.500Q-2.500,16 -4.500,13Q-10,13.500 -13,11Z" fill="url(#dwi${u})" stroke-width="1.1"/><path d="M-4,10.800H8" fill="none" stroke="#e3e9ec" stroke-width=".8" opacity=".6"/></g></svg></div>`;
  return { lampArt, axe, pipe, seal, anvil };
})();

// ---- the ore bucket: oak staves, two iron hoops, an iron rim, eye-bolts under the rim for the sign's chains ----
const basket = (u: number) => {
  // the bucket is deeper than it looks: the staves run on down to K.BD behind the sign (no floor is drawn)
  const LX = n(HX * K.SS), LY = RY + K.CY;   // the two eye-bolts for the sign's chains, on plates just under the rim
  const BD = K.BD, wx = (y: number) => 52 - 6 * (y - RY - 1) / (BD - RY - 1), y1 = RY + 8, y2 = RY + 18.5, y3 = RY + 27.5; let st = '', rv = '';
  for (const x of [-39, -26, -13, 0, 13, 26, 39]) st += `M${x},${RY + 3}L${n(x * .885)},${BD}`;
  for (const x of [-36, -18, 0, 18, 36]) rv += `<circle cx="${x}" cy="${n(y1 + 4.3 - (x / 36) ** 2 * 1.6)}" r="1.100"/><circle cx="${n(x * .95)}" cy="${n(y2 + 4.3 - (x / 36) ** 2 * 1.6)}" r="1.100"/>`;
  const hoop = (y: number) => { const a = n(wx(y)), b = n(wx(y + 4.6)); return `<path d="M${-a},${y}Q0,${y + 4} ${a},${y}L${b},${y + 4.6}Q0,${y + 8.6} ${-b},${y + 4.6}Z" fill="url(#dwi${u})" stroke-width=".9"/>`; };
  return S('rig-rim', -60, RY - 6, 120, BD - RY + 8, `${G(u, `
<path d="M-52,${RY + 1}L-46,${BD}H46L52,${RY + 1}Z" fill="url(#dww${u})" stroke-width="1.1"/>
<path d="M-52,${RY + 1}L-46,${BD}H-22L-27,${RY + 1}Z" fill="${HP(u)}" stroke="none"/><path d="M-52,${RY + 1}L-46,${BD}H-35L-40,${RY + 1}Z" fill="${HQ(u)}" stroke="none"/>
<path d="${st}" fill="none" stroke-width=".6" opacity=".75"/><path d="M-30,${RY + 15}v9M-5,${RY + 13}v7M19,${RY + 14}v9M32,${RY + 21}v5M-18,${RY + 38}v9M9,${RY + 36}v8" fill="none" stroke="#d2b384" stroke-width=".8" opacity=".6"/>
${hoop(y1)}${hoop(y2)}${hoop(y3)}${hoop(RY + 52)}
<g fill="#b9c0c5" stroke-width=".45">${rv}</g>
${ink2(`M-42,${RY + 9}L-19,${RY + 26}`, 1.8, '#9a744a')}${ink2(`M-49,${RY + 17}Q-46,${RY + 8} -35,${RY + 5}`, 2, '#9aa2a8')}
<g fill="none"><ellipse cx="29" cy="${RY + 17}" rx="6.500" ry="7.200" stroke-width="3.400"/><ellipse cx="29" cy="${RY + 17}" rx="6.500" ry="7.200" stroke="#bda26b" stroke-width="2"/><ellipse cx="29" cy="${RY + 17}" rx="3.200" ry="3.900" stroke-width="2.800"/><ellipse cx="29" cy="${RY + 17}" rx="3.200" ry="3.900" stroke="#a88d58" stroke-width="1.500"/></g>
<rect x="-54" y="${RY - 3}" width="108" height="6.500" rx="2.300" fill="url(#dwi${u})" stroke-width="1.1"/><path d="M-51,${RY - 1.5}H51" fill="none" stroke="#e3e9ec" stroke-width=".8" opacity=".55"/>
<g fill="#30353a" stroke-width=".4"><circle cx="-45" cy="${RY + .8}" r="1.100"/><circle cx="-22" cy="${RY + .8}" r="1.100"/><circle cx="22" cy="${RY + .8}" r="1.100"/><circle cx="45" cy="${RY + .8}" r="1.100"/></g>
<path d="M${-LX - 4},${RY + 6}h8v6.500h-8ZM${LX - 4},${RY + 6}h8v6.500h-8Z" fill="#70787e" stroke-width=".8"/><g fill="#c9d0d4" stroke-width=".4"><circle cx="${-LX}" cy="${RY + 7.5}" r=".9"/><circle cx="${LX}" cy="${RY + 7.5}" r=".9"/></g>`)}
<g fill="none">${[-LX, LX].map((x) => `<circle cx="${x}" cy="${LY}" r="2.600" stroke="#17120e" stroke-width="2"/><circle cx="${x}" cy="${LY}" r="2.600" stroke="#9aa2a8" stroke-width=".8"/>`).join('')}</g>`);
};

// ---- the burner: an iron forge-pot of coals hung on chains under the mouth ----
const burner = (u: number) => S('rig-rim', -24, HG, 48, FY - HG + 18, G(u, `
${ink2(`M-19,${HG + 4}L-12.500,${FY}M19,${HG + 4}L12.500,${FY}`, 1.2, '#8d949b', 'stroke-dasharray="2.200 1.500"')}
<path d="M-14,${FY}H14Q13.500,${FY + 10} 0,${FY + 12.5}Q-13.500,${FY + 10} -14,${FY}Z" fill="#4a4f55" stroke-width="1.1"/>
<path d="M-14,${FY}H-5Q-6,${FY + 9} 0,${FY + 12.5}Q-13.500,${FY + 10} -14,${FY}Z" fill="#000" opacity=".3" stroke="none"/><path d="M9,${FY + 3}Q10,${FY + 7} 6,${FY + 10}" fill="none" stroke="#c9d0d4" stroke-width=".8" opacity=".6"/>
<path class="dwarf-slit" d="M-7.500,${FY + 4.5}v3.600M-2.500,${FY + 5}v4.200M2.500,${FY + 5}v4.200M7.500,${FY + 4.5}v3.600" fill="none" stroke-width="1.500"/>
<ellipse class="dwarf-coal" cx="0" cy="${FY - .5}" rx="13" ry="2.100" stroke-width=".9"/>
<path d="M-15.500,${FY + .2}Q0,${FY + 4.2} 15.500,${FY + .2}L15.500,${FY + 2.8}Q0,${FY + 6.8} -15.500,${FY + 2.8}Z" fill="#70787e" stroke-width=".9"/>
<g fill="#c9d0d4" stroke-width=".4"><circle cx="-10" cy="${FY + 3.4}" r=".9"/><circle cx="0" cy="${FY + 4.8}" r=".9"/><circle cx="10" cy="${FY + 3.4}" r=".9"/></g>
<circle cx="0" cy="${FY + 13.6}" r="1.500" fill="#70787e" stroke-width=".8"/>`))
  + Z('dwarf-coalg', 0, FY - 1);

// ---- the envelope: hides in seven gores; the helpers lay bands, rivets and angular ornament on the surface ----
const KS = [-1, -.9, -.62, -.22, .22, .62, .9, 1];
const panels = (g: EnvGeo, cols: readonly string[]) => KS.slice(0, -1).map((k, i) => `<path d="${g.gore(k, KS[i + 1]!)}" fill="${cols[i % cols.length]}" stroke="none"/>`).join('');
const seams = (g: EnvGeo, stitch: string, o: { w?: number; dash?: string; op?: number } = {}) => KS.slice(1, -1).map((k) => `<path d="${g.seam(k)}" fill="none" stroke-width=".9"/>${stitch ? `<path d="${g.seam(k + (k > 0 ? -.03 : .03))}" fill="none" stroke="${stitch}" stroke-width="${o.w || .8}" stroke-dasharray="${o.dash || '1.6 2.6'}" opacity="${o.op || .6}"/>` : ''}`).join('');
const band = (g: EnvGeo, u: number, t0: number, t1: number, fill: string) => `<path d="${g.band(t0, t1)}" fill="${fill}" stroke-width="1"/><path d="${g.band(t0, t1, -1, -.4)}" fill="${HP(u)}" stroke="none"/><path d="${g.lat(t0 + (t1 - t0) * .24, -.9, .93)}" fill="none" stroke="#fff" stroke-width=".8" opacity=".4"/>`;
const studs = (g: EnvGeo, t: number, num: number, fill: string, r = 1.5) => g.along(num).map((k) => { const p = g.pt(k, t); return `<circle cx="${n(p[0])}" cy="${n(p[1])}" r="${r}" fill="${fill}" stroke-width=".5"/>`; }).join('');
// the key band: a square meander
const key = (g: EnvGeo, t0: number, t1: number, num: number, col: string, w = 1.1) => { const ks = g.along(num * 2 + 1, -.985, .985); let d = '', up = false; ks.forEach((k, i) => { d += (i ? 'L' : 'M') + pp(g.pt(k, up ? t0 : t1)); up = !up; d += 'L' + pp(g.pt(k, up ? t0 : t1)); }); return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}"/>`; };
// the lattice: two crossing zigzags, an angular knot
const lattice = (g: EnvGeo, t0: number, t1: number, num: number, col: string, w = 1.1) => { const ks = g.along(num + 1, -.985, .985); let a = '', b = ''; ks.forEach((k, i) => { a += (i ? 'L' : 'M') + pp(g.pt(k, i % 2 ? t0 : t1)); b += (i ? 'L' : 'M') + pp(g.pt(k, i % 2 ? t1 : t0)); }); return `<path d="${a}${b}" fill="none" stroke="${col}" stroke-width="${w}"/>`; };
const RUNES = ['M-2,-4V4M-2,-3L2.500,-.5L-2,2', 'M-2,-4V4M-2,0L2.500,-4M-2,0L2.500,4', 'M-2.500,-4L2,0L-2.500,4M2,-4V4', 'M-2,-4V4M2,-4V4M-2,-1.500L2,1.500', 'M0,-4V4M-2.500,-1L0,-4L2.500,-1', 'M-2,-4V4L2.500,0Z', 'M-2.500,4L0,-4L2.500,4M-1.500,1H1.500', 'M0,-4V4M-2.500,-4L0,-1L2.500,-4'];
const runes = (g: EnvGeo, t: number, num: number, col: string, s = .9) => g.along(num, -.92, .92).map((k, i) => `<path transform="${g.place(k, t, s)}" d="${RUNES[i % RUNES.length]}" fill="none" stroke="${col}" stroke-width="1.100"/>`).join('');
const RUNE = 'M0,-13V13M0,-11L9.500,-3.500L0,4M0,-1.500L-8.500,7';
// Durin's emblems
const anvil = (fill: string, sw = .8) => `<path d="M-10,0H7Q10,0 12,2Q9,3.500 6,3.500Q4,6 5,8.500H8V11H-8V8.500H-5Q-4,6 -6,3.500H-10Z" fill="${fill}" stroke-width="${sw}"/><g transform="translate(0,-6.500) rotate(-24)"><rect x="-1" y="-5" width="2" height="11" fill="${fill}" stroke-width="${n(sw * .8)}"/><rect x="-4.500" y="-7.500" width="9" height="4.500" rx=".6" fill="${fill}" stroke-width="${sw}"/></g>`;
const star = (x: number, y: number, r: number, fill: string) => `<path transform="translate(${n(x)},${n(y)})" d="M0,${-r}L${n(r * .28)},${n(-r * .28)}L${r},0L${n(r * .28)},${n(r * .28)}L0,${r}L${n(-r * .28)},${n(r * .28)}L${-r},0L${n(-r * .28)},${n(-r * .28)}Z" fill="${fill}" stroke-width=".5"/>`;
const stars7 = (r: number, y0: number, sz: number, fill: string) => [-72, -48, -24, 0, 24, 48, 72].map((a) => star(r * Math.sin(a * Math.PI / 180), y0 - r * Math.cos(a * Math.PI / 180), sz, fill)).join('');
const crown = (fill: string) => `<path d="M-9,4L-10.500,-4L-6,0L-3.500,-6.500L0,-1L3.500,-6.500L6,0L10.500,-4L9,4Z" fill="${fill}" stroke-width=".8"/><path d="M-8.500,1.500H8.500" fill="none" stroke-width=".5"/>`;
const gem = (x: number, y: number, r: number, fill: string) => `<g transform="translate(${n(x)},${n(y)})"><path d="M0,${-r - 1.2}L${r + .6},0L0,${r + 1.2}L${-r - .6},0Z" fill="#e0bb55" stroke-width=".7"/><path d="M0,${-r}L${n(r * .72)},0L0,${r}L${n(-r * .72)},0Z" fill="${fill}" stroke-width=".5"/><path d="M${n(-r * .3)},${n(-r * .35)}L0,${n(-r * .75)}" fill="none" stroke="#fff" stroke-width=".8" opacity=".85"/></g>`;
const gems = (g: EnvGeo, t: number, num: number, cols: readonly string[], r = 2.2) => g.along(num, -.9, .9).map((k, i) => { const p = g.pt(k, t); return gem(p[0], p[1], r, cols[i % cols.length]!); }).join('');
const axes = (steel: string) => [1, -1].map((s) => `<g transform="rotate(${32 * s})"><path d="M0,-14V14" fill="none" stroke-width="3"/><path d="M0,-14V14" fill="none" stroke="#7a5a38" stroke-width="1.600"/><path transform="scale(${s},1)" d="M.8,-13C7,-15.500 11,-11 10,-4.500C7,-7 3.500,-7.500 .8,-6.500Z" fill="${steel}" stroke-width=".8"/></g>`).join('');
const lugs = (g: EnvGeo, t: number, col: string) => [-1, 1].map((s) => { const p = g.pt(s, t); return ink2(`M${n(p[0] - s)},${n(p[1] - 2.5)}h${4.5 * s}v5.500h${-4.5 * s}`, 1.4, col); }).join('');
const girdle = (g: EnvGeo, t: number, col: string) => ink2(g.lat(t), 1.4, col, 'stroke-dasharray="3 1.200"');
const creases = (g: EnvGeo, list: ReadonlyArray<readonly [number, number, number]>) => `<path d="${list.map(([k, a, b]) => g.seam(k, a, b)).join('')}" fill="none" stroke-width=".7" opacity=".55"/>`;

const ENV: Readonly<Record<string, EnvSpec>> = {
  // a scrap bag: sagging, lopsided, dented, mended with whatever was lying about
  poor: { cond: { sag: 1, lop: -.85, dents: [{ side: 1, t: .5, depth: 14, span: .13 }, { side: -1, t: .3, depth: 7, span: .1 }] }, art: (g, u) => { const c = g.pt(0, 0); return {
    base: '#6d6758', lip: '#8a5231', ring: '#8a6a4a',
    inside: `${panels(g, ['#77705f', '#625d51', '#857a62', '#5c584e', '#7d7059', '#696357', '#746a5a'])}${seams(g, '#d8ccac', { w: 1.3, dash: '2.6 3.6', op: .8 })}
${creases(g, [[.78, .34, .72], [.5, .42, .66], [-.42, .68, .98], [.32, .7, .98], [-.78, .58, .9], [.05, .74, .98], [-.3, .04, .2]])}
${g.patch(-.48, .4, 23, 18, { fill: '#8a5231', rot: -12, rivets: true, stitch: '#c9a27a', hatch: HP(u) })}${g.patch(.36, .3, 20, 15, { fill: '#b8ab8c', rot: 9, sw: 1.1 })}${g.patch(.08, .64, 16, 19, { fill: '#3f3a35', rot: -6, stitch: '#d8ccac', sw: 1 })}
${g.patch(-.12, .17, 15, 11, { fill: '#9a8f6a', rot: 18, hatch: HQ(u) })}${g.patch(.7, .7, 13, 12, { fill: '#5f7a6c', rot: -14, rivets: true })}${g.patch(-.4, .46, 9, 8, { fill: '#b8ab8c', rot: 20 })}
${girdle(g, .8, '#a89468')}`,
    over: `<path d="M${n(c[0] - 6)},${n(c[1] + 3)}Q${n(c[0])},${n(c[1] - 5)} ${n(c[0] + 6)},${n(c[1] + 3)}Q${n(c[0])},${n(c[1] + 6)} ${n(c[0] - 6)},${n(c[1] + 3)}Z" fill="#5c584e" stroke-width="1"/><path d="M${n(c[0] - 2)},${n(c[1] - 1)}l-4,-4M${n(c[0] + 1)},${n(c[1] - 1)}l3,-5" fill="none" stroke-width="1.100"/>`,
  }; } },
  // plain hide, sound enough
  meh: { cond: { sag: .3, lop: .12 }, art: (g, u) => { const c = g.pt(0, 0); return {
    base: '#a08462', lip: '#7d7f7c',
    inside: `${panels(g, ['#a88a63', '#9b7d58'])}${seams(g, '#e6d6ae')}${creases(g, [[-.42, .74, .98], [.34, .76, .98]])}${g.patch(.42, .3, 13, 11, { fill: '#8f7350', rot: 6 })}
${band(g, u, .5, .555, '#7d7f7c')}${studs(g, .527, 9, '#b9b9b0', 1.2)}${girdle(g, .82, '#b9a57a')}`,
    over: `<path d="M${n(c[0] - 8)},${n(c[1] + 4)}Q${n(c[0])},${n(c[1] - 4)} ${n(c[0] + 8)},${n(c[1] + 4)}Q${n(c[0])},${n(c[1] + 7.5)} ${n(c[0] - 8)},${n(c[1] + 4)}Z" fill="#7a5f40" stroke-width="1"/>`,
  }; } },
  // sound and full: oxblood hide and good iron
  good: { cond: {}, art: (g, u) => { const c = g.pt(0, 0); return {
    base: '#84402f', lip: '#70777d',
    inside: `${panels(g, ['#8c4431', '#783829'])}${seams(g, '#e2b98a')}
${band(g, u, .47, .565, '#6f767c')}${key(g, .49, .545, 9, '#d3d9dd', 1)}${studs(g, .478, 13, '#c9d0d4', .9)}${band(g, u, .83, .87, '#6f767c')}
<g transform="${g.place(0, .25)}"><circle r="12.500" fill="#a8843f" stroke-width="1.1"/><circle r="10" fill="none" stroke-width=".6"/><g transform="translate(-.5,1.500) scale(.72)">${anvil('#3a2a18', .7)}</g></g>`,
    over: `${lugs(g, .517, '#8d949b')}<path d="M${n(c[0] - 9)},${n(c[1] + 4)}Q${n(c[0])},${n(c[1] - 3)} ${n(c[0] + 9)},${n(c[1] + 4)}Q${n(c[0])},${n(c[1] + 8)} ${n(c[0] - 9)},${n(c[1] + 4)}Z" fill="#6f767c" stroke-width="1"/><circle cx="${n(c[0])}" cy="${n(c[1] - 3)}" r="3.200" fill="#8d949b" stroke-width="1"/>`,
  }; } },
  // fine work: deep blue, bronze, runes, the seven stars over the anvil
  great: { cond: { taut: .5 }, art: (g, u) => { const c = g.pt(0, 0), e = g.pt(0, .17); return {
    base: '#2c4a76', lip: '#b08a45', ring: '#c9a45c',
    inside: `${panels(g, ['#30517f', '#27436d'])}${seams(g, '#b9c7d8')}
${band(g, u, .35, .41, '#b08a45')}${runes(g, .38, 15, INK, .62)}${band(g, u, .5, .6, '#b08a45')}${key(g, .52, .58, 10, '#3a2a18', 1.1)}${studs(g, .508, 15, '#f0dca8', .8)}${studs(g, .592, 15, '#f0dca8', .8)}${band(g, u, .84, .88, '#b08a45')}
<g transform="translate(${n(e[0])},${n(e[1])})">${stars7(15, 3, 2.9, '#eef2f0')}<g transform="translate(-.5,1) scale(.8)">${anvil('#dfe6e6', .8)}</g></g>`,
    over: `${lugs(g, .55, '#c9a45c')}<path d="M${n(c[0] - 9)},${n(c[1] + 4)}Q${n(c[0])},${n(c[1] - 3)} ${n(c[0] + 9)},${n(c[1] + 4)}Q${n(c[0])},${n(c[1] + 8)} ${n(c[0] - 9)},${n(c[1] + 4)}Z" fill="#b08a45" stroke-width="1"/><path d="M${n(c[0] - 2.5)},${n(c[1])}L${n(c[0])},${n(c[1] - 10)}L${n(c[0] + 2.5)},${n(c[1])}Z" fill="#c9a45c" stroke-width=".9"/><circle cx="${n(c[0])}" cy="${n(c[1] - 10.5)}" r="2" fill="#f0dca8" stroke-width=".8"/>`,
  }; } },
  // brand new: cloth of gold and ivory, crimson, gems, the crown
  superb: { cond: { taut: 1 }, art: (g, u) => {
    const c = g.pt(0, 0), e = g.pt(0, .17);
    let tabs = '';
    g.along(11, -.96, .96).forEach((k, i) => { const a = g.pt(Math.max(-1, k - .085), .885), b = g.pt(Math.min(1, k + .085), .885), m = g.pt(k, .885); tabs += `<path d="M${pp(a)}L${n(m[0])},${n(m[1] + 9.5)}L${pp(b)}Z" fill="${i % 2 ? '#e0bb55' : '#8e2a22'}" stroke-width=".8"/><circle cx="${n(m[0])}" cy="${n(m[1] + 10.5)}" r="1.200" fill="#f6e2a6" stroke-width=".5"/>`; });
    return {
      base: '#d2a843', lip: '#e0bb55', ring: '#f0dca8',
      inside: `${panels(g, ['#d8ae45', '#f0e4c4'])}${seams(g, '#fff6d6', { op: .9 })}
${band(g, u, .35, .41, '#e0bb55')}${runes(g, .38, 15, '#6a2018', .62)}${ink2(g.lat(.345), .7, '#f4f8f8')}${ink2(g.lat(.415), .7, '#f4f8f8')}
${band(g, u, .5, .61, '#8e2a22')}${ink2(g.lat(.5), 1.5, '#e9c865')}${ink2(g.lat(.61), 1.5, '#e9c865')}${lattice(g, .515, .595, 12, '#e9c865', 1.2)}${gems(g, .555, 7, ['#3f9a72', '#eef4f6', '#3d6fb5'], 2.4)}
${band(g, u, .84, .885, '#e0bb55')}${studs(g, .862, 13, '#fff3c4', .9)}
<g transform="translate(${n(e[0])},${n(e[1])})"><path d="M-15,-15H15L19,-7V8L0,19L-19,8V-7Z" fill="#8e2a22" stroke-width="1.1"/><path d="M-13,-12.500H13L16.500,-6V6.500L0,16L-16.500,6.500V-6Z" fill="none" stroke="#e9c865" stroke-width="1.100"/><g transform="translate(0,-5.500) scale(.8)">${crown('#f0d27a')}</g><g transform="translate(-.5,4.500) scale(.66)">${anvil('#f0d27a', .8)}</g></g>${stars7(24, e[1] + 6, 2.3, '#fffbe6')}`,
      over: `${tabs}${lugs(g, .555, '#e9c865')}<path d="M${n(c[0] - 11)},${n(c[1] + 4.5)}L${n(c[0] - 13)},${n(c[1] - 6)}L${n(c[0] - 7.5)},${n(c[1] - 1)}L${n(c[0] - 4)},${n(c[1] - 8.5)}L${n(c[0])},${n(c[1] - 2)}L${n(c[0] + 4)},${n(c[1] - 8.5)}L${n(c[0] + 7.5)},${n(c[1] - 1)}L${n(c[0] + 13)},${n(c[1] - 6)}L${n(c[0] + 11)},${n(c[1] + 4.5)}Q${n(c[0])},${n(c[1] + 8.5)} ${n(c[0] - 11)},${n(c[1] + 4.5)}Z" fill="#e9c865" stroke-width="1"/><path d="M${n(c[0] - 10.5)},${n(c[1] + 1.5)}Q${n(c[0])},${n(c[1] + 5.5)} ${n(c[0] + 10.5)},${n(c[1] + 1.5)}" fill="none" stroke-width=".6"/>${gem(c[0], c[1] + 4, 1.8, '#c2372f')}${gem(c[0] - 6.5, c[1] + 3, 1.3, '#3d6fb5')}${gem(c[0] + 6.5, c[1] + 3, 1.3, '#3f9a72')}`,
    };
  } },
  // unrated: the trial bag, chalk-white, marked up for the assay
  calibrating: { cond: { sag: .12 }, art: (g, u) => { const c = g.pt(0, 0); return {
    base: '#cbc3ae', lip: '#8d949b',
    inside: `${panels(g, ['#d3cbb7', '#c3bba6'])}${seams(g, '')}
<path d="${g.lat(.22)}${g.lat(.62)}${g.seam(-.42, .05, .95)}${g.seam(.42, .05, .95)}${g.seam(0, .5, .95)}" fill="none" stroke="#5a554c" stroke-width=".8" stroke-dasharray="3 2.600" opacity=".75"/>
<path d="${[.3, .34, .38, .42, .46, .5, .54].map((t, i) => { const p = g.pt(-.42, t); return `M${pp(p)}h${i % 2 ? 3 : 5}`; }).join('')}" fill="none" stroke="#5a554c" stroke-width=".8"/>
<g transform="${g.place(0, .29)}"><circle r="14" fill="none" stroke="#4a463f" stroke-width="1" stroke-dasharray="2.600 2.200"/><path d="M0,-8.500V7.500M-9,-5.500H9M-9,-5.500l-3.200,7h6.400ZM9,-5.500l-3.200,7h6.400ZM-4,8H4" fill="none" stroke="#3a3731" stroke-width="1.100"/></g>
${girdle(g, .8, '#b9a57a')}`,
    over: `<path d="M${n(c[0] - 7)},${n(c[1] + 4)}Q${n(c[0])},${n(c[1] - 4)} ${n(c[0] + 7)},${n(c[1] + 4)}Q${n(c[0])},${n(c[1] + 7)} ${n(c[0] - 7)},${n(c[1] + 4)}Z" fill="#b3ab96" stroke-width="1"/>`,
  }; } },
  // a player kill: the war bag
  pvp: { cond: { taut: .3 }, art: (g, u) => {
    const c = g.pt(0, 0), e = g.pt(0, .5);
    let sp = '', sc = '';
    g.along(9, -.86, .86).forEach((k) => { const a = g.pt(k - .06, .7), b = g.pt(k + .06, .7), m = g.pt(k, .7); sp += `<path d="M${pp(a)}L${n(m[0] + k * 3)},${n(m[1] + 8.5)}L${pp(b)}Z" fill="#aab2b8" stroke-width=".8"/>`; });
    for (const t of [.82, .89, .96]) { const ks = g.along(t < .9 ? 12 : 9, -.99, .99); for (let i = 0; i < ks.length - 1; i++) { const a = g.pt(ks[i]!, t), b = g.pt(ks[i + 1]!, t); sc += `M${pp(a)}Q${n((a[0] + b[0]) / 2)},${n((a[1] + b[1]) / 2 + 5)} ${pp(b)}`; } }
    const horn = (s: number, t: number) => { const p = g.pt(s, t); return `<path d="M${n(p[0] - s)},${n(p[1] - 3.5)}L${n(p[0] + 10 * s)},${n(p[1] + 1)}L${n(p[0] - s)},${n(p[1] + 3.5)}Z" fill="#aab2b8" stroke-width=".9"/>`; };
    return {
      base: '#332d2b', lip: '#8e2a1f', ring: '#aab2b8',
      inside: `${panels(g, ['#3a3331', '#2a2524'])}${seams(g, '#b3412e', { op: .85 })}
${band(g, u, .42, .58, '#8e2a1f')}${ink2(g.lat(.42), 1, '#17120e')}${ink2(g.lat(.58), 1, '#17120e')}
<path d="${g.band(.78, 1)}" fill="#4a4f55" stroke-width="1"/><path d="${sc}" fill="none" stroke-width=".8"/>
${band(g, u, .655, .705, '#70787e')}${sp}
<g transform="translate(${n(e[0])},${n(e[1] - 1)}) scale(1.05)">${axes('#c9d0d4')}</g>`,
      over: `${horn(-1, .68)}${horn(1, .68)}${horn(-1, .5)}${horn(1, .5)}<path d="M${n(c[0] - 8)},${n(c[1] + 4)}Q${n(c[0])},${n(c[1] - 3)} ${n(c[0] + 8)},${n(c[1] + 4)}Q${n(c[0])},${n(c[1] + 7.5)} ${n(c[0] - 8)},${n(c[1] + 4)}Z" fill="#4a4f55" stroke-width="1"/><path d="M${n(c[0] - 3)},${n(c[1])}L${n(c[0])},${n(c[1] - 12)}L${n(c[0] + 3)},${n(c[1])}Z" fill="#aab2b8" stroke-width=".9"/>`,
    };
  } },
  // a level gained: purple, gold chevrons climbing, the rune lit
  levelup: { cond: { taut: .6 }, art: (g, u) => {
    const c = g.pt(0, 0), e = g.pt(0, .22);
    const chev = (t0: number, t1: number) => { const ks = g.along(15, -.985, .985); let d = ''; ks.forEach((k, i) => { d += (i ? 'L' : 'M') + pp(g.pt(k, i % 2 ? t0 : t1)); }); return ink2(d, 1.5, '#e9c865'); };
    return {
      base: '#4d3566', lip: '#d9b24c', ring: '#e9c865',
      inside: `${panels(g, ['#573b70', '#45305e'])}${seams(g, '#e9c865', { op: .7 })}
${chev(.47, .54)}${chev(.55, .62)}${chev(.63, .7)}${band(g, u, .84, .88, '#d9b24c')}
<path transform="translate(${n(e[0])},${n(e[1])})" d="${RUNE}" fill="none" stroke="#2a1a3a" stroke-width="4.500"/><path transform="translate(${n(e[0])},${n(e[1])})" d="${RUNE}" fill="none" stroke="#f3d47a" stroke-width="2.200"/>`,
      over: `<path d="M${n(c[0] - 8)},${n(c[1] + 4)}Q${n(c[0])},${n(c[1] - 3)} ${n(c[0] + 8)},${n(c[1] + 4)}Q${n(c[0])},${n(c[1] + 7.5)} ${n(c[0] - 8)},${n(c[1] + 4)}Z" fill="#d9b24c" stroke-width="1"/>${star(c[0], c[1] - 5, 5.5, '#f3d47a')}`,
      html: `<div class="rig-a dwarf-runeg">${S('', -14, n(e[1]) - 16, 28, 32, `<path transform="translate(${n(e[0])},${n(e[1])})" d="${RUNE}" fill="none" stroke="#ffe6a8" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round"/>`)}</div>`,
    };
  } },
  // a death: let down, in mourning
  death: { cond: { sag: .62, lop: .1 }, art: (g, u) => { const k0 = g.pt(-.56, .53); return {
    base: '#45423d', lip: '#4a4d50', ring: '#6a6358',
    inside: `${panels(g, ['#4d4a45', '#3e3b37'])}${seams(g, '#8a857a', { op: .5 })}${creases(g, [[-.42, .68, .98], [.32, .7, .98], [.72, .4, .7], [-.7, .62, .9], [.06, .76, .98]])}
<path d="${g.band(.46, .6)}" fill="#15120e" stroke="#000" stroke-width="1"/><path d="${g.lat(.5, -.95, .95)}${g.lat(.56, -.95, .95)}" fill="none" stroke="#6a6257" stroke-width=".7"/>
<g transform="translate(${n(k0[0])},${n(k0[1])})" stroke="#000"><path d="M-3,2C-10,14 -2,22 -9,36L1,32C2,22 0,12 3,3Z" fill="#1c1813" stroke-width="1"/><path d="M2,2C6,13 2,21 8,31L14,25C10,17 11,10 9,3Z" fill="#14110d" stroke-width="1"/><circle r="5.500" fill="#221d17" stroke-width="1"/><path d="M-4,10q2,10 -2,20M5,10q0,8 4,15" fill="none" stroke="#6a6257" stroke-width=".7"/></g>`,
    over: '',
  }; } },
  // an achievement: emerald and the great seal
  achievement: { cond: { taut: .8 }, art: (g, u) => { const c = g.pt(0, 0), e = g.pt(0, .3); return {
    base: '#2c6347', lip: '#d9b24c', ring: '#e9c865',
    inside: `${panels(g, ['#2f6b4f', '#265a40'])}${seams(g, '#e2c676', { op: .75 })}
${band(g, u, .5, .59, '#d9b24c')}${lattice(g, .512, .578, 14, '#3a2a18', 1)}${band(g, u, .84, .88, '#d9b24c')}${ink2(g.lat(.12, -.9, .9), .9, '#e2c676')}
<g transform="translate(${n(e[0])},${n(e[1])})"><path d="M-5,12L-10,34L-4,30L0,35L3,20ZM4,13L11,33L13,26L18,28L9,10Z" fill="#8e2a22" stroke-width=".9"/><circle r="16" fill="#d9b24c" stroke-width="1.2"/><circle r="12.500" fill="#ecd07a" stroke-width=".7"/><circle r="14.200" fill="none" stroke="#7a5a1c" stroke-width=".9" stroke-dasharray=".1 2.400"/>${star(0, 0, 10.5, '#d9b24c')}<path transform="scale(.42)" d="${RUNE}" fill="none" stroke="#5a3a10" stroke-width="3"/><path d="M-10.500,-8.500Q-5,-13.500 2,-13" fill="none" stroke="#fff6d0" stroke-width="1.100" opacity=".8"/></g>`,
    over: `${lugs(g, .545, '#e9c865')}<path d="M${n(c[0] - 9)},${n(c[1] + 4)}Q${n(c[0])},${n(c[1] - 3)} ${n(c[0] + 9)},${n(c[1] + 4)}Q${n(c[0])},${n(c[1] + 8)} ${n(c[0] - 9)},${n(c[1] + 4)}Z" fill="#d9b24c" stroke-width="1"/><path d="M${n(c[0])},${n(c[1])}v-5" fill="none" stroke-width="2.600"/><circle cx="${n(c[0])}" cy="${n(c[1] - 7.5)}" r="3.400" fill="#ecd07a" stroke-width="1"/>`,
  }; } },
};

// ---- the sign: a forged plate with a raised frame, riveted lugs and two chains to the bucket's eye-bolts ----
const SW = 158, HX = 58;
const PLATE: Readonly<Record<string, readonly [string, string, string, string]>> = {
  calibrating: ['#666d74', '#aab2b8', '#24282c', '#9aa2a8'], meh: ['#666d74', '#aab2b8', '#24282c', '#9aa2a8'],
  poor: ['#8a5231', '#c08a5a', '#2c2622', '#5a3018'], good: ['#9c7738', '#e0c283', '#23272b', '#e6cc92'],
  great: ['#c9a04b', '#f6e2a6', '#1c2530', '#fff0bd'], superb: ['#d9b24c', '#fff0b8', '#5a1b15', '#fff3c4'],
  pvp: ['#2b2727', '#6a6260', '#171314', '#ff7a45'], levelup: ['#b08a45', '#f6e2a6', '#2b2038', '#fff0bd'],
  death: ['#1d1a17', '#5b554c', '#1b1d20', '#6a6358'], achievement: ['#c9a04b', '#fff0b8', '#1f4534', '#fff0bd'],
};
const board = ({ w, h, hx: HX, mood, u }: BoardArgs) => {
  const [edge, hi, face, riv] = PLATE[mood] || PLATE.meh!, poor = mood === 'poor', rich = mood === 'superb';
  const lug = (x: number) => `<path d="M${x - 4},6.500V-2Q${x},-5 ${x + 4},-2V6.500Z" fill="${edge}" stroke-width="1"/><circle cx="${x}" cy="3.300" r="1.300" fill="${riv}" stroke-width=".5"/><circle cx="${x}" cy="-2.200" r="1.500" fill="#170f0a" stroke-width=".6"/>`;
  const rv = ([[3.8, 3.8], [w - 3.8, 3.8], [3.8, h - 3.8], [w - 3.8, h - 3.8], [w / 2, 3.6], [w / 2, h - 3.6]] as Array<[number, number]>).filter((_, i) => !(poor && i === 1))
    .map(([x, y], i) => (rich && i < 4 ? gem(x, y, 1.7, ['#c2372f', '#3d6fb5', '#3f9a72', '#c2372f'][i]!) : `<circle cx="${n(x)}" cy="${n(y)}" r="1.700" fill="${riv}" stroke-width=".6"/><circle cx="${n(x + .5)}" cy="${n(y - .5)}" r=".5" fill="#fff" opacity=".5" stroke="none"/>`)).join('');
  return G(u, `${lug(w / 2 - HX)}${lug(w / 2 + HX)}
<rect x=".7" y=".7" width="${w - 1.4}" height="${h - 1.4}" rx="2.500" fill="${edge}" stroke-width="1.3"/>
<path d="M2.600,${h - 3}V2.600H${w - 3}" fill="none" stroke="${hi}" stroke-width="1" opacity=".75"/><path d="M${w - 2.4},3V${h - 2.4}H3" fill="none" stroke="#000" stroke-width="1" opacity=".35"/>
<rect x="1.200" y="1.200" width="5.500" height="${h - 2.4}" fill="${HP(u)}" stroke="none"/><rect x="1.200" y="${h - 6.5}" width="${w * .45}" height="5.300" fill="${HQ(u)}" stroke="none"/>
<rect x="6.500" y="6.500" width="${w - 13}" height="${h - 13}" rx="1" fill="${face}" stroke-width=".9"/>
<path d="M7.300,${h - 7.5}V7.300H${w - 7.5}" fill="none" stroke="#000" stroke-width="1.400" opacity=".45"/>
<path d="M14,${h - 12}l9,-5M${w - 30},11l12,4M${w - 20},${h - 11}l7,-3M${w * .3},9.500l5,1.500" fill="none" stroke="${hi}" stroke-width=".6" opacity=".22"/>
${poor ? `<g stroke="none" fill="#b05c28"><ellipse cx="${w * .1}" cy="${h * .86}" rx="15" ry="6" opacity=".5"/><ellipse cx="${w * .93}" cy="${h * .16}" rx="11" ry="7" opacity=".45"/><ellipse cx="${w * .7}" cy="${h * .93}" rx="9" ry="4" opacity=".4"/></g><path d="M${w - 9},1L${w - 15},9L${w - 11},13" fill="none" stroke-width=".8"/>` : ''}
${rich ? `<rect x="8.500" y="8.500" width="${w - 17}" height="${h - 17}" fill="none" stroke="#e9c865" stroke-width=".8"/>` : ''}${rv}`)
    + [w / 2 - HX, w / 2 + HX].map((x) => `<circle cx="${x}" cy="-3.500" r="3" fill="none" stroke="#17120e" stroke-width="2.200"/><circle cx="${x}" cy="-3.500" r="3" fill="none" stroke="#9aa2a8" stroke-width=".9"/>`).join('');
};
// the rating as five cut studs; a player kill is two red strokes
const pips = (mood: Mood) => {
  let s = '';
  if (mood === 'pvp') s = '<path class="dwarf-red" d="M3,2L15,12M15,2L3,12"/>';
  else for (let i = 0; i < 5; i++) { const x = 5.5 + i * 11; s += `<path class="${i < (RANK[mood] || 0) ? 'dwarf-on' : 'dwarf-of'}" d="M${x},1.500L${x + 4.5},7L${x},12.500L${x - 4.5},7Z"/>`; }
  return `<svg xmlns="${NS}" width="${mood === 'pvp' ? 18 : 55}" height="14" viewBox="0 0 ${mood === 'pvp' ? 18 : 55} 14">${s}</svg>`;
};

let paceOf = () => 1;

// ---- the small life in him: blinks, glances, a brow, a finger; one piece of business per mood ----
const liven = (R: RigBalloon) => {
  // reduced motion as it was when this balloon was made (stage 75 review: per balloon, not per module)
  const reduced = R.reduced;
  const q = R.q, qa = R.qa, ck = kit.clock(), later = ck.later, rnd = Math.random;
  const nod = q('.dwarf-nod'), look = q('.dwarf-look'), lids = qa('.dwarf-bl'), pgs = qa('.dwarf-pg'), brows = [q('.dwarf-bL'), q('.dwarf-bR')], mos = qa('.dwarf-mo');
  const helm = q('.dwarf-helm'), ty = q('.dwarf-ty'), ng = q('.dwarf-ng'), axr = q('.dwarf-axr'), gemw = q('.dwarf-gemw');
  const coal = q('.dwarf-coalg'), bd = q('.dwarf-bd'), lan = q('.dwarf-lan'), anv = q('.dwarf-anv');
  let gaze: readonly [number, number] = [0, 0], ga: Animation[] = [], la: Animation | null = null, hot = true;
  const bob = (el: Part | null, to: string, ms: number, o: KeyframeAnimationOptions & { at?: number } = {}) => el && el.animate([{ transform: 'none' }, { transform: to, offset: o.at ?? .4 }, { transform: 'none' }], { duration: ms, easing: 'ease-in-out', composite: 'add', ...o });
  const blink = () => {
    const slow = R.mood === 'meh' || R.mood === 'death';
    const go = () => lids.forEach((l) => l.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(11px)', offset: .42 }, { transform: 'translateY(0)' }], { duration: slow ? 700 : 150, easing: 'ease-in-out' }));
    go(); if (!slow && rnd() < .25) later(go, 250);
    later(blink, (slow ? 2600 : 1700) + rnd() * 3800);
  };
  const lookAt = (x: number, y: number, ms = 170) => {
    if (reduced) return;
    const from = gaze; gaze = [x, y];
    const old = ga, oldL = la;
    ga = pgs.map((p) => p.animate([{ transform: `translate(${from[0]}px,${from[1]}px)` }, { transform: `translate(${x}px,${y}px)` }], { duration: ms, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'forwards' }));
    la = look.animate([{ transform: `translate(${from[0] * .3}px,${from[1] * .2}px) rotate(${from[0] * .4}deg)` }, { transform: `translate(${x * .3}px,${y * .2}px) rotate(${x * .4}deg)` }], { duration: 520, delay: 50, easing: 'cubic-bezier(.3,.6,.3,1)', fill: 'both' });
    old.forEach((a) => a.cancel()); if (oldL) oldL.cancel();
  };
  const glance = () => {
    if (R.mood !== 'death' && R.root.classList.contains('rig-at') && !R.root.classList.contains('rig-off')) {
      const r = rnd(), p = PROP[R.mood] || [0, 0];
      if (r < .3) lookAt(rnd() - .5, 2.5);             // down at the plate
      else if (r < .52) lookAt(0, 0);                   // at you
      else if (r < .64) lookAt(rnd() * 1.6 - .8, -2.5); // up at the envelope
      else if (r < .84) lookAt(p[0], p[1]);             // at what he holds
      else lookAt(rnd() < .5 ? -3.1 : 3.1, -.3);        // out over the land
    }
    later(glance, 1100 + rnd() * 2600);
  };
  const brow = () => {
    const i = rnd() < .5 ? 0 : 1;
    bob(brows[i]!, 'translateY(-2.6px)', 340);
    if (rnd() < .3) bob(brows[1 - i]!, 'translateY(-2px)', 340, { delay: 60 });
    if (rnd() < .35) mos.forEach((m) => bob(m, 'rotate(3deg)', 300, { delay: 120 }));
    later(brow, 2400 + rnd() * 3600);
  };
  const tap = () => {
    const f = qa(M[R.mood]?.hrt === 0 ? '.dwarf-hL .dwarf-fg' : rnd() < .5 ? '.dwarf-hL .dwarf-fg' : '.dwarf-hR .dwarf-fg');
    if (rnd() < .4) f.forEach((e, i) => bob(e, 'translateY(-3.5px)', 230, { delay: i * 70 }));
    else bob(f[(rnd() * f.length) | 0] ?? null, 'translateY(-3px)', 260);
    later(tap, 1800 + rnd() * 3200);
  };
  if (!reduced) { lookAt(.3, -2.5, 1); later(blink, 500 + rnd() * 1800); later(glance, 900 + rnd() * 1200); later(brow, 1500 + rnd() * 2500); later(tap, 1200 + rnd() * 2500); }
  const once = (el: Part | null, kf: Keyframe[], o: KeyframeAnimationOptions) => !reduced && el && el.animate(kf, o);
  // one small piece of business on arriving, by mood
  const biz = (mood: Mood) => {
    if (reduced) return;
    const d = 1 / paceOf(), T = (s: string): Keyframe => ({ transform: s });
    const nd = (kf: Keyframe[], ms: number, delay = 0, o: KeyframeAnimationOptions = {}) => nod.animate(kf, { duration: ms * d, delay: delay * d, easing: 'ease-in-out', ...o });
    if (mood === 'calibrating') { lookAt(3, .2); once(ng, [T('translateY(0)'), { ...T('translateY(-9px) rotate(40deg)'), offset: .25, easing: 'ease-in' }, { ...T('translateY(0) rotate(90deg)'), offset: .5 }, { ...T('translateY(-5px) rotate(130deg)'), offset: .72, easing: 'ease-in' }, T('translateY(0) rotate(180deg)')], { duration: 900 * d, delay: 250 * d, easing: 'ease-out' }); nd([T('none'), T('rotate(2deg) translateY(.6px)'), T('none')], 700, 900); }
    if (mood === 'poor') { lookAt(.4, -2.4, 400); nd([T('none'), { ...T('translateY(-1.5px)'), offset: .3 }, { ...T('translateY(3px)'), offset: .7 }, T('translateY(1.5px)')], 1400, 350, { fill: 'forwards' }); later(() => lookAt(0, 1.5, 500), 1700 * d); }
    if (mood === 'meh') { lookAt(2.6, 2, 300); nd([T('none'), { ...T('translateY(-1px) rotate(-.6deg)'), offset: .35 }, { ...T('translateY(2px) rotate(1deg)'), offset: .75 }, T('translateY(1px) rotate(.6deg)')], 1500, 500, { fill: 'forwards' }); }
    if (mood === 'good') { lookAt(0, 2.4); nd([T('none'), { ...T('translateY(3.5px) rotate(1deg)'), offset: .35 }, { ...T('translateY(-.6px)'), offset: .7 }, T('none')], 480, 450); later(() => lookAt(0, 0), 1000 * d); }
    if (mood === 'great') { lookAt(0, 2.4); later(() => lookAt(0, 0), 600 * d); once(ty, [T('translateY(-5px)'), { ...T('translateY(-14px) rotate(-8deg)'), offset: .4 }, { ...T('translateY(-13px) rotate(-6deg)'), offset: .7 }, T('translateY(-5px)')], { duration: 950 * d, delay: 300 * d, easing: 'cubic-bezier(.3,1.2,.5,1)' }); nd([T('none'), { ...T('translateY(-2px) rotate(-1.5deg)'), offset: .4 }, T('none')], 900, 300); }
    if (mood === 'superb') {
      lookAt(-3, .9);
      once(gemw, [T('none'), { ...T('translateY(-3.5px) rotate(-1.5deg)'), offset: .3 }, { ...T('translateY(-2.5px) rotate(1.5deg)'), offset: .6 }, T('none')], { duration: 1200 * d, delay: 150 * d, easing: 'ease-in-out' });
      nd([T('none'), { ...T('translateY(-2.5px) rotate(-2.5deg)'), offset: .25 }, { ...T('translateY(-2px) rotate(-2deg)'), offset: .6 }, T('none')], 1250, 100);
      later(() => { lookAt(0, 0); once(ty, [T('translateY(-5px)'), { ...T('translateY(-14px) rotate(-8deg)'), offset: .4 }, T('translateY(-5px)')], { duration: 850 * d, delay: 150 * d, easing: 'ease-in-out' }); }, 1350 * d);
    }
    if (mood === 'pvp') { lookAt(0, 0); once(axr, [T('rotate(-15deg)'), { ...T('rotate(-22deg) translateY(-7px)'), offset: .35 }, { ...T('rotate(-12deg) translateY(2px)'), offset: .7 }, T('rotate(-15deg)')], { duration: 700 * d, delay: 250 * d, easing: 'ease-in-out' }); nd([T('none'), { ...T('translateY(-2.5px) rotate(-1deg)'), offset: .3 }, { ...T('translateY(1.2px)'), offset: .6 }, T('none')], 650, 250); }
    if (mood === 'levelup') { lookAt(0, .8, 300); nd([T('none'), { ...T('translateY(2.5px) rotate(1.2deg)'), offset: .45 }, T('translateY(.8px)')], 1300, 300, { fill: 'forwards' }); later(() => lookAt(0, 0, 300), 1900 * d); }
    if (mood === 'death') nd([T('none'), T('translateY(2px) rotate(-2deg)')], 1100, 500, { fill: 'forwards' });
    if (mood === 'achievement') { lookAt(0, 0); nd([T('none'), { ...T('translateY(-2.5px) scale(1.02)'), offset: .4 }, T('translateY(-.6px)')], 900, 250, { fill: 'forwards' }); }
  };
  const calm = () => nod.getAnimations().forEach((a) => a.cancel());
  return {
    arrive: biz,
    changed(mood: Mood) { calm(); biz(mood); },
    struck() { lookAt(0, 2.5, 140); },
    leave() { if (R.mood !== 'death') lookAt(.4, -2.5, 260); },
    // every frame: the coals follow burn; his gear dangles
    frame(i: FrameInfo) {
      const b = i.burn;
      coal.style.opacity = (.2 + .8 * b).toFixed(2);
      bd.style.transform = `rotate(${(i.hang * .8).toFixed(2)}deg)`;
      lan.style.transform = `rotate(${(i.hang * 1.3 + Math.sin(i.now * .0021) * 1.6).toFixed(2)}deg)`;
      anv.style.transform = `rotate(${(i.hang + Math.sin(i.now * .0017 + 2)).toFixed(2)}deg)`;
      // he looks up at his fire when it roars
      if (b > .62 && !hot) { hot = true; if (R.mood !== 'death') lookAt(.3, -2.6, 220); } else if (b < .35) hot = false;
    },
    stop: ck.stop,
  };
};

export const passenger: PassengerDef = {
  id: 'dwarf',
  name: 'The Dwarf',
  // blurb: 'Dwarves do not fly. This one was told to, so he built the thing himself and stands in it in mail and pauldrons: hides stitched in gores, chains for ropes, an ore bucket, and an iron forge-pot of coals hung under the mouth. The envelope says how good the kill was, from a patched scrap bag to cloth of gold under a crown; the news hangs below on a forged plate.',
  spec(ctx: RigCtx): RigSpec {
    paceOf = ctx.pace;
    return {
      id: 'dwarf', css: CSS,
      defs: (u) => `<linearGradient id="dww${u}" x1="0" x2="1"><stop offset="0" stop-color="#4a3220"/><stop offset=".55" stop-color="#7d5c3d"/><stop offset="1" stop-color="#a58157"/></linearGradient><pattern id="dwm${u}" patternUnits="userSpaceOnUse" width="8" height="6"><path d="M0,3Q2,6.500 4,3Q6,-.5 8,3" fill="none" stroke="${INK}" stroke-width="1" opacity=".6"/></pattern>`,
      envelope: (mood) => ENV[mood] || ENV.calibrating,
      ropes: { kind: 'chain', dark: '#17120e', light: '#8d949b', w: 2 },
      burner,
      basket,
      behind: (u) => `<div class="dwarf-old">${OLD.axe(u)}</div>
<div class="dwarf-lift"><div class="dwarf-br"><div class="dwarf-look"><div class="dwarf-nod">${head(u)}${braids(u)}<div class="dwarf-pipew">${OLD.pipe(u)}<div class="rig-z dwarf-ring"><i></i><i></i></div></div>${hold(u)}${tears()}</div></div></div></div>
${props(u)}`,
      front: (u) => `${hands(u)}<div class="dwarf-old">${OLD.seal(u)}<div class="rig-z dwarf-lan"><div class="dwarf-lgl"></div>${OLD.lampArt()}</div>${OLD.anvil(u)}</div>`,
      sign: { w: SW, hx: HX, k: 12, c: 1.7, cord: { kind: 'chain', dark: '#17120e', light: '#8d949b', w: 1.9 }, board, pips },
      life: liven,
    };
  },
};
