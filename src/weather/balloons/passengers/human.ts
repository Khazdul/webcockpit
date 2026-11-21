// Stage 75 (ADR 0159 round 3): a PORT of the approved mockup's human,
// notes/research/balloons/round5/skins/human.js, on the shared rig
// (../rig.ts). Geometry, markup, CSS and timings are the mockup's; only
// the types and the module shape (no harness: `passenger.spec(ctx)` is the
// mockup's `create(ctx)`) are new. Its own lazy chunk (../passenger.ts).
//
// Round 5: "The Woman", built on the shared rig (rig.js). A rider of the
// North: Bree-land wool on her back, the Mark in her braids and her spear. She
// flies what a village and a hall could make between them: sewn cloth, hemp
// rope, a wicker car, a fire-basket of iron, and an inn sign for the news.
//
// THE VOCABULARY OF MEN (decided before drawing; rule 2 of the brief)
//   Materials  cloth, always cloth: sackcloth, unbleached sailcloth, homespun
//              wool, then dyed and embroidered banner cloth. Hemp rope, wicker,
//              oak boards, leather; iron for the fire, bronze for a brooch,
//              gilding only on the very best.
//   Motifs     woven and painted, round and running: the twined braid border,
//              the sun with rays, the running horse, the white tree under
//              seven stars, round shields, pennons with swallow tails, a
//              scalloped valance. No runes, no gems, no rivets.
//   Colours    dun sacking; straw canvas; ochre and nut brown; the deep blue
//              and silver of the North; the green, white and gold of a king.
//   "The best" means A KING'S BANNER: rich dyed cloth, an embroidered braid
//              border, a great white horse, a gilded finial, long pennons.
//
// THE ENVELOPE LADDER (silhouette and colour both change)
//   poor    patched sackcloth: sagging, lopsided, dented; dun sacking sewn
//           with twine, six odd patches, a rope tied round it, a loose end
//   meh     plain straw-coloured sailcloth, a little slack, one brown tape
//           band, one neat patch
//   good    sound and full: ochre and nut-brown stripes of homespun, a cream
//           band with a single twined braid, a turned knob on top
//   great   fine: deep blue with silver braid borders, the white tree under
//           seven stars, a silver spear-point finial with one pennon
//   superb  a king's banner, brand new: green field, a broad white band with
//           a gold and green braid, the white horse running, a gilded sun on
//           top with two long pennons, a scalloped valance round the mouth
// THE SPECIALS (none can be taken for a rating step)
//   unrated      grey undyed linen still tacked together with red basting
//                thread, a blank shield chalked on it and three dye swatches
//                pinned beside: the device is not chosen yet
//   player kill  the war bag: black cloth, a blood-red band, a shield wall of
//                round shields hung round it that breaks the outline, a spear
//                point with a red horsetail on top
//   level up     crimson with a gold sun rising from a gold band, its rays
//                climbing the gores, lit from within
//   death        slate grey, half let down, a black pall drawn over the crown
//                with tails hanging down both sides; the fire burns low
//   achievement  ivory with a great garland of green leaves and white flowers
//                round a gold star, green and gold braid, green streamers
//
// HER: weathered and warm; honey-brown hair in a braid crown and one long
// plait over the shoulder; a moss wool cloak pinned with a bronze sun brooch
// over a laced leather jerkin and a linen shirt. A spear stands in the car, a
// round shield and a waterskin hang on it. What she holds, she holds from the
// start: a hand shading her eyes (unrated), cheek on her fist (meh), a wooden
// mug (great), a stemmed wine cup raised in a toast (superb), helm and drawn
// sword (player kill), a garland of leaves and white flowers (level up and
// achievement), her hood up (death). Her face climbs with the rating: a smile
// (good), a broad smile with her cheeks and eyes in it (great), laughing
// (superb); nothing is ever in front of her mouth.

import type { Mood } from '../feed';
import { INK, K, kit, type BoardArgs, type EnvGeo, type EnvSpec, type FrameInfo, type PassengerDef, type Part, type RigBalloon, type RigCtx, type RigSpec } from '../rig';

const { n, S, SL, Z, G, ink2, NS, pp } = kit, HP = kit.P, HQ = kit.Q;
const { W, CX, HG, FY, RY, BY } = K;
// the figure is drawn in units of 0.6 px about the point between her eyes
const HS = .6, HY = RY - 56;
const SKIN = '#cfa27f', WOOL = '#4f6243', LINEN = '#d9cdb0', HIDE = '#6f4a2c';

// ---- moods: how the face is held, and what is in her hands ----
/** A pose: CSS variables by name. */
type Pose = Readonly<Record<string, number>>;
const DEF: Pose = { rise: 0, tilt: 0, nod: 0, ny: 0, bly: 0, blr: 0, bry: 0, brr: 0, lid: 1.9, low: 0, px: 0, py: 0, es: 1, m0: 1, m1: 0, m2: 0, m3: 0, m4: 0, ms: 1, ck: 0, hl: 1, hr: 1, helm: 0, hood: 0, shade: 0, chin: 0, mug: 0, cup: 0, sword: 0, garl: 0, pen: 0 };
const M: Readonly<Record<string, Pose>> = {
  calibrating: { shade: 1, hr: 0, px: .5, lid: 1.9, low: .5, bly: .4, bry: .4 },
  poor: { m0: 0, m2: 1, bly: -2.4, blr: -9, bry: .6, brr: -7, lid: 2.5, nod: -3, tilt: -1 },
  meh: { chin: 1, hr: 0, lid: 3.1, nod: 6, ny: 1.5, bly: .5, bry: .5 },
  good: { m0: 0, m1: 1, low: .9, bly: -.8, bry: -.8 },
  great: { m0: 0, m4: 1, ck: .7, low: 1.7, lid: 1.7, bly: -1.6, bry: -1.6, mug: 1, hr: 0, rise: 1 },
  superb: { cup: 1, hr: 0, m0: 0, m3: 1, ms: 1.2, ck: 1, low: 2.5, lid: 2.3, bly: -2.4, bry: -2.6, blr: -5, brr: 5, rise: 2, nod: -2, pen: 1 },
  pvp: { helm: 1, sword: 1, hr: 0, lid: 2.5, low: 1, bly: 1, bry: 1, blr: 10, brr: -10, rise: 1 },
  levelup: { garl: 1, hr: 0, pen: 1, m0: 0, m1: 1, lid: 1.4, low: .5, bly: -1, bry: -1, rise: 1.5 },
  death: { hood: 1, m0: 0, m2: 1, lid: 4.3, py: 1.3, blr: -12, brr: 12, bly: -1, bry: -1, rise: -2, ny: 2, nod: -3 },
  achievement: { garl: 1, hr: 0, m0: 0, m3: 1, ck: .6, low: 1.5, bly: -1.8, bry: -1.8, rise: 1.5 },
};
// what she only does once she has arrived
const AT: Readonly<Record<string, Pose>> = { death: { ny: 3.5, nod: -5, lid: 5 }, levelup: { rise: 2.5 } };
// where the thing she holds is, for her glances (pupil units)
const PROP: Readonly<Record<string, readonly [number, number]>> = { calibrating: [2.3, -.3], poor: [.5, -1.5], meh: [1.6, 1.2], good: [-2.2, -.6], great: [2.2, .9], superb: [2.2, .6], pvp: [2.2, -.8], levelup: [2.2, .8], achievement: [2.2, .8] };
const RANK: Readonly<Record<string, number>> = { poor: 1, meh: 2, good: 3, great: 4, superb: 5 };
const vars = (o: Pose) => Object.keys(o).filter((k) => k in DEF).map((k) => `--${k}:${o[k]}`).join(';');
const show = (...names: string[]) => names.map((nm) => `.human-${nm}{--x:var(--${nm})}`).join('');

const CSS = `
.human-v{${vars(DEF)};--coal:#e8862e;--go:.9}
${Object.keys(M).map((m) => `.human-v[data-mood=${m}]{${vars(M[m]!)}}`).join('\n')}
${Object.keys(AT).map((m) => `.human-v.rig-at[data-mood=${m}]{${vars(AT[m]!)}}`).join('\n')}
.human-v[data-mood=death]{--rig-f1:#b9622a;--rig-f2:#ecd29c;--rig-gl:190,120,70;--coal:#9a5226}
.human-v[data-mood=poor]{--rig-f1:#d5732a;--coal:#b0602c}
.human-v[data-mood=superb]{--rig-gl:255,214,140}
.human-v[data-sky=dusk]{--go:.65}.human-v[data-sky=day]{--go:.25}.human-v[data-sky=overcast]{--go:.38}
.human-v[data-mood=poor] .rig-envb{animation:human-heave 3.6s ease-in-out infinite alternate}
.human-coal{fill:var(--coal)}
.human-coalg{width:34px;height:20px;margin:-6px 0 0 -17px;border-radius:50%;opacity:.3;will-change:opacity;background:radial-gradient(closest-side,rgba(var(--rig-gl),.8),rgba(var(--rig-gl),0))}
.human-sung{width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;background:radial-gradient(closest-side,rgba(255,226,150,.75),rgba(255,190,90,.3) 50%,rgba(255,170,60,0));opacity:calc(.35 + var(--go)*.6);animation:human-pu 1.9s ease-in-out infinite alternate}
.human-lift,.human-br,.human-nw,.human-look,.human-nod{position:absolute;left:0;top:0;width:${W}px;height:0}
.human-lift,.human-br{transform-origin:${CX}px ${RY + 8}px}
.human-nw,.human-look,.human-nod{transform-origin:${CX}px ${HY + 24}px}
.human-lift{transform:translateY(calc(var(--rise)*-1px)) rotate(calc(var(--tilt)*1deg));transition:transform calc(.55s*var(--k)) cubic-bezier(.3,1.25,.5,1)}
.human-br{animation:human-br 4.8s ease-in-out infinite alternate}
.human-nw{transform:translateY(calc(var(--ny)*1px)) rotate(calc(var(--nod)*1deg));transition:transform calc(.9s*var(--k)) ease-in-out}
.human-fig{left:${CX - 70 * HS}px;top:${HY - 60 * HS}px}
.human-bL{transform:translateY(calc(var(--bly)*1px)) rotate(calc(var(--blr)*1deg))}
.human-bR{transform:translateY(calc(var(--bry)*1px)) rotate(calc(var(--brr)*1deg))}
.human-bL,.human-bR,.human-eye,.human-pm,.human-lid,.human-low{transition:transform calc(.4s*var(--k)) ease-out}
.human-eye{transform:scale(var(--es))}
.human-pm{transform:translate(calc(var(--px)*1px),calc(var(--py)*1px))}
.human-lid{transform:translateY(calc(var(--lid)*1px));fill:#bf9473;stroke:${INK};stroke-width:1}
.human-low{transform:translateY(calc(var(--low)*-1px));fill:#cda380;stroke:${INK};stroke-width:.7}
.human-m0,.human-m1,.human-m2,.human-m3,.human-m4,.human-ck,.human-helm,.human-hood,.human-pen{transition:opacity calc(.3s*var(--k))}
.human-m0{opacity:var(--m0)}.human-m1{opacity:var(--m1)}.human-m2{opacity:var(--m2)}.human-m3{opacity:var(--m3)}.human-m4{opacity:var(--m4)}.human-ck{opacity:var(--ck)}.human-msc{transform:scale(var(--ms));transition:transform calc(.3s*var(--k))}
.human-helm{opacity:var(--helm)}.human-hood{opacity:var(--hood)}.human-pen{opacity:var(--pen)}
.human-hL{opacity:var(--hl)}.human-hR{opacity:var(--hr)}
.human-hL,.human-hR{transition:opacity calc(.15s*var(--k))}
.human-p{position:absolute;left:0;top:0;width:${W}px;height:0;opacity:var(--x);transform:translateY(calc((1 - var(--x))*30px));transition:transform calc(.5s*var(--k)) cubic-bezier(.3,1.25,.5,1),opacity calc(.14s*var(--k))}
${show('shade', 'chin', 'mug', 'cup', 'sword', 'garl')}
.human-pw{position:absolute;left:0;top:0;width:${W}px;height:0;transform-origin:${CX + 36}px ${RY}px}
.human-plait{left:${CX + 12.5}px;top:${HY + 14}px;will-change:transform}
.human-skin{left:${CX + 31}px;top:${RY + 2}px;will-change:transform}
.human-tears{display:none}
.human-v[data-mood=death] .human-tears{display:block}
.human-tear{position:absolute;width:5px;height:12px;overflow:hidden}
.human-tear::before{content:"";position:absolute;left:1.9px;top:0;width:1.1px;height:10px;border-radius:1px;background:linear-gradient(rgba(198,216,230,.36),rgba(198,216,230,.05))}
.human-tear i{position:absolute;left:1.2px;top:-3px;width:2.5px;height:3.4px;border-radius:50% 50% 50% 50%/62% 62% 38% 38%;background:radial-gradient(circle at 35% 35%,rgba(238,245,250,.9),rgba(172,200,222,.72) 55%,rgba(116,154,188,.66));box-shadow:0 0 0 .5px rgba(24,34,54,.26);transform:translateY(var(--r));animation:human-tear 5.8s cubic-bezier(.4,0,.7,.7) infinite;animation-delay:var(--dl)}
@keyframes human-tear{0%{transform:translateY(0) scale(.5);opacity:0}12%{transform:translateY(1.2px) scale(1);opacity:.6}75%{opacity:.6}100%{transform:translateY(12px) scale(.9);opacity:0}}
@keyframes human-heave{from{transform:scale(1,1) skewX(0)}to{transform:scale(1.018,.968) skewX(1.1deg)}}
@keyframes human-br{from{transform:translateY(.4px) scale(1,.997)}to{transform:translateY(-.7px) scale(1,1.005)}}
@keyframes human-pu{from{transform:scale(.9)}to{transform:scale(1.06)}}
.human-sign{filter:drop-shadow(0 2px 2.5px rgba(0,0,0,.42));--tx:#efe7d2;--dim:#c6bda6;--fg:#f6eeda;--on:#e6d9b4;--off:rgba(233,223,196,.28);color:var(--tx)}
.human-sign[data-mood=poor]{--tx:#d8cdb8;--fg:#d8cdb8;--on:#c98a4a}
.human-sign[data-mood=good]{--fg:#f6e2a8;--on:#e3bd62}
.human-sign[data-mood=great]{--tx:#e9eef2;--dim:#b9c6d2;--fg:#ffffff;--on:#e9eef2}
.human-sign[data-mood=superb]{--tx:#f6efd6;--dim:#cfd6b0;--fg:#ffe08a;--on:#ffd76a}
.human-sign[data-mood=pvp]{--tx:#f1ddd4;--fg:#ffa283;--on:#e8553c}
.human-sign[data-mood=levelup]{--fg:#ffe7a0}
.human-sign[data-mood=death]{--tx:#c9c6be;--fg:#d6d3cb}
.human-sign[data-mood=achievement]{--tx:#f2ead2;--dim:#cbd0a8;--fg:#f6eeda}
.human-sign .rig-text{padding:8px 12px 8px}
.human-sign .rig-title,.human-sign .rig-fig{text-shadow:0 1px 0 rgba(0,0,0,.55)}
.human-sign .rig-fig{color:var(--fg)}
.human-sign[data-mood=superb] .rig-fig{font-weight:700}
.human-sign .rig-unit,.human-sign .rig-q,.human-sign .rig-more{color:var(--dim)}
.human-on{fill:var(--on);stroke:rgba(0,0,0,.6);stroke-width:.7}.human-of{fill:none;stroke:var(--off);stroke-width:1}
.human-ob{fill:rgba(0,0,0,.55)}
.human-red{fill:none;stroke:#e8553c;stroke-width:2.2;stroke-linecap:round}
.human-sign[data-kind=levelup] .rig-text{padding:13px 8px}
.human-sign[data-kind=levelup] .rig-fig{font:700 21px/1.1 Cinzel,Georgia,serif;letter-spacing:.04em}
.human-sign[data-kind=death] .rig-text{padding:13px 8px}
.human-sign[data-kind=death] .rig-fig{font:italic 500 23px/1.1 "Cormorant Garamond",Georgia,serif;letter-spacing:.03em}
.human-sign[data-kind=achievement] .rig-title{font:italic 600 13.5px/1.1 "Cormorant Garamond",Georgia,serif}
`;

// ---- defs shared by all her drawings (the figure's own pen, in its units) ----
// the head's pen: the rig's wobble and grain, but a much fainter ink blotch (it read as dirt on a small face)
// (stage 75: the face's softer filter is the rig's, `kit.filt` with its ink options)
const defs = (u: number) => `${kit.filt('huf' + u, { freq: .036, scale: 1.7, grain: .5 })}${kit.filt('hug' + u, { freq: .036, scale: 1.7, grain: .5, ink: [.2, .1, .05], blot: .7, bias: -.33 })}${kit.hatch('hup' + u, 38, 4.4, .6, .85)}${kit.hatch('huq' + u, -52, 5, .5, .85)}
<clipPath id="huc${u}"><path d="${ALM}"/></clipPath>
<linearGradient id="husk${u}" x1="0" x2="1"><stop offset="0" stop-color="#a87657"/><stop offset=".5" stop-color="#cfa27f"/><stop offset="1" stop-color="#e6c4a0"/></linearGradient>
<linearGradient id="huh${u}" x1="0" x2="1"><stop offset="0" stop-color="#553819"/><stop offset=".55" stop-color="#8a6230"/><stop offset="1" stop-color="#b88d4c"/></linearGradient>
<linearGradient id="hucl${u}" x1="0" x2="1"><stop offset="0" stop-color="#2c3a29"/><stop offset=".55" stop-color="#4f6243"/><stop offset="1" stop-color="#6d805a"/></linearGradient>
<linearGradient id="hulr${u}" x1="0" x2="1"><stop offset="0" stop-color="#4a2f1c"/><stop offset=".55" stop-color="#7a5232"/><stop offset="1" stop-color="#9a7046"/></linearGradient>
<linearGradient id="huir${u}" x1="0" x2="1" y1="0" y2=".25"><stop offset="0" stop-color="#30353a"/><stop offset=".5" stop-color="#5d646b"/><stop offset="1" stop-color="#959da3"/></linearGradient>
<linearGradient id="hubz${u}" x1="0" x2="1"><stop offset="0" stop-color="#5c4724"/><stop offset=".6" stop-color="#94793f"/><stop offset="1" stop-color="#c9ad6c"/></linearGradient>
<linearGradient id="huwk${u}" x1="0" x2="1"><stop offset="0" stop-color="#5d4024"/><stop offset=".55" stop-color="#9a7444"/><stop offset="1" stop-color="#c49d63"/></linearGradient>
<pattern id="huwv${u}" patternUnits="userSpaceOnUse" width="9" height="5.6"><path d="M0,1.4Q2.250,-.2 4.500,1.400Q6.750,3 9,1.400M0,4.200Q2.250,5.800 4.500,4.200Q6.750,2.600 9,4.200" fill="none" stroke="${INK}" stroke-width=".6" opacity=".7"/><path d="M1,.4Q2.250,-.4 3.500,.4M5.500,3.200Q6.750,2.400 8,3.200" fill="none" stroke="#e6cf9c" stroke-width=".6" opacity=".55"/></pattern>
<pattern id="husc${u}" patternUnits="userSpaceOnUse" width="3.2" height="3.2"><path d="M0,1.6H3.200M1.600,0V3.200" stroke="#241a10" stroke-width=".4" opacity=".34"/></pattern>`;

// ---- her head (units of 0.6 px about the point between the eyes) ----
const ALM = 'M-6.4,0Q0,-7 6.4,0Q0,4.6 -6.4,0Z';
const FACE = 'M-20,-12C-21,4 -18,18 -9,27Q0,33 9,27C18,18 21,4 20,-12C19,-27 -19,-27 -20,-12Z';
const eye = (s: number, u: number) => `<g transform="translate(${9.6 * s},0)"><g class="human-eye"><ellipse cy="-.8" rx="8.4" ry="5.8" fill="#7a4a34" opacity=".2"/>
<g clip-path="url(#huc${u})"><path d="${ALM}" fill="#efe6d2"/><path d="M-7,-6H7V-1.4H-7Z" fill="#3d281b" opacity=".3"/>
<g class="human-pm"><g class="human-pg"><circle r="3" fill="#5c7f8c"/><circle r="3" fill="none" stroke="#1d2a30" stroke-width=".8"/><circle r="1.4" fill="#0c0705"/><circle cx="-1" cy="-1.1" r=".8" fill="#fff8e6"/></g></g>
<g class="human-bl"><path class="human-lid" d="M-9,-18H9V-3.6Q0,-7.4 -9,-3.6Z"/></g><path class="human-low" d="M-9,13H9V3.5Q0,5.4 -9,3.500Z"/></g>
<path d="${ALM}" fill="none" stroke="${INK}" stroke-width=".7"/><path d="M-6.8,.5Q0,-7.600 6.800,.3" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>
<path d="M${6.4 * s},-.8l${2.4 * s},-1.800M${7.2 * s},1.200l${3 * s},.8M${6.6 * s},2.800l${2.4 * s},1.800M${-4 * s},5.600q${4 * s},1.600 ${8 * s},-.4" fill="none" stroke="${INK}" stroke-width=".55" stroke-linecap="round" opacity=".7"/></g></g>`;
const BROW = `<path d="M-6.8,1.4C-3,-2.400 3,-2.800 8,.8C4,-.6 -2,-.2 -6.800,1.400Z" fill="#5d3e22" stroke="${INK}" stroke-width=".7" stroke-linejoin="round"/>`;
// the braid crown: plaited over the top of the head from temple to temple
const crown = () => { let s = ''; for (let i = 0; i <= 12; i++) { const a = (200 + i * 140 / 12) * Math.PI / 180, x = 23.5 * Math.cos(a), y = -9 + 25.5 * Math.sin(a), r = a * 180 / Math.PI + 90 + (i % 2 ? 38 : -38); s += `<ellipse cx="${n(x)}" cy="${n(y)}" rx="4.1" ry="2.5" transform="rotate(${n(r)} ${n(x)} ${n(y)})" fill="${i % 2 ? '#7c5628' : '#a67c40'}" stroke-width=".9"/>`; } return s; };
const mouths = `
<g class="human-m0"><path d="M-6.2,20.8Q-3,19 0,20.200Q3,19 6.200,20.800Q3,22.500 0,21.900Q-3,22.500 -6.200,20.800Z" fill="#a4553f" stroke-width=".8"/><path d="M-4.500,23Q0,25.400 4.500,23M-6.800,20.300l-1.300,-.8M6.800,20.300l1.300,-.8" fill="none" stroke-width=".7" opacity=".75"/></g>
<g class="human-m1"><path d="M-7.6,19.6Q-3.500,19 0,20Q3.500,19 7.600,19.600Q4,23.800 0,23.800Q-4,23.800 -7.600,19.600Z" fill="#a4553f" stroke-width=".8"/><path d="M-7.600,19.600Q0,22.800 7.600,19.600" fill="none" stroke-width=".9"/><path d="M-9,17.400q-1.500,1.900 -.2,3.600M9,17.400q1.500,1.900 .2,3.600" fill="none" stroke-width=".7"/></g>
<g class="human-m2"><path d="M-5.8,22.4Q-3,20 0,20.800Q3,20 5.800,22.400Q3,22.700 0,22.300Q-3,22.700 -5.800,22.400Z" fill="#96503e" stroke-width=".8"/><path d="M-4,24.600Q0,23.500 4,24.600M-6.300,22.600l-1,1M6.300,22.600l1,1" fill="none" stroke-width=".65" opacity=".75"/></g>
<g class="human-m3"><g transform="translate(0,21)"><g class="human-msc"><g transform="translate(0,-21)"><path d="M-8.2,19Q0,21.200 8.200,19Q5.500,27.400 0,27.400Q-5.500,27.400 -8.200,19Z" fill="#5a241c" stroke-width=".9"/><path d="M-6.800,19.800Q0,21.600 6.800,19.800L5.800,22.400Q0,23.800 -5.800,22.400Z" fill="#f1e7cf" stroke-width=".5"/><path d="M-4.800,26.400Q0,29 4.800,26.400" fill="none" stroke="#a4553f" stroke-width="1.6"/><path d="M-9.600,17q-1.500,1.900 -.2,3.600M9.600,17q1.500,1.900 .2,3.600" fill="none" stroke-width=".7"/></g></g></g></g>
<g class="human-m4"><path d="M-8.6,19Q0,28 8.600,19Q0,22 -8.600,19Z" fill="#a4553f" stroke-width=".9"/><path d="M-7.400,19.500Q0,22.300 7.400,19.500Q4,23.600 0,23.600Q-4,23.600 -7.400,19.500Z" fill="#f1e7cf" stroke-width=".5"/><path d="M-9.800,16.800q-1.600,2 -.2,3.800M9.800,16.800q1.600,2 .2,3.800" fill="none" stroke-width=".7"/></g>
<g class="human-ck"><ellipse cx="-12" cy="11" rx="6" ry="4" fill="#b4553d" opacity=".24" stroke="none"/><ellipse cx="12" cy="11" rx="6" ry="4" fill="#c2634a" opacity=".24" stroke="none"/><path d="M-16,7.200Q-11.500,4.200 -6.500,6.800M16,7.200Q11.500,4.200 6.500,6.800M-8.500,13Q-12,16.500 -11.500,20.500M8.500,13Q12,16.500 11.500,20.500" fill="none" stroke-width=".7" opacity=".8"/></g>`;
// a rider's helm (player kill): iron cap in four plates, bronze brow band, nasal, cheek pieces, a white horsetail
const helm = (u: number) => `<g class="human-helm">
<path d="M1,-45C-5,-52 7,-55 13,-49C22,-42 28,-30 31,-12C25,-22 18,-34 8,-43Z" fill="#e9e2cf" stroke-width="1.2"/><path d="M8,-49C16,-42 22,-32 26,-22M5,-47C13,-41 18,-34 22,-27" fill="none" stroke-width=".55" opacity=".7"/>
<path d="M-25,-10L-25.500,13Q-23,24 -16,19L-17,-9ZM25,-10L25.500,13Q23,24 16,19L17,-9Z" fill="url(#huir${u})" stroke-width="1.3"/><path d="M-25,-10L-25.500,13Q-23,24 -19,21L-21,-9Z" fill="url(#hup${u})" stroke="none"/>
<path d="M-24.500,-13C-26,-35 -12,-45 0,-46C12,-45 26,-35 24.500,-13Z" fill="url(#huir${u})" stroke-width="1.5"/>
<path d="M-24.500,-13C-26,-35 -12,-45 -3,-46C-13,-38 -16,-26 -15,-13Z" fill="url(#hup${u})" stroke="none"/>
<path d="M0,-46V-15M-12.500,-42Q-15.500,-28 -15,-14M12.500,-42Q15.500,-28 15,-14" fill="none" stroke-width="1"/><path d="M11,-41C18,-36 21,-28 22,-20" fill="none" stroke="#fff" stroke-width="1.2" opacity=".4"/>
<path d="M-26,-18Q0,-11 26,-18L26,-10.500Q0,-3.500 -26,-10.500Z" fill="url(#hubz${u})" stroke-width="1.4"/><path d="M-26,-18Q-14,-15 -10,-14.500L-10,-7Q-18,-8 -26,-10.500Z" fill="url(#hup${u})" stroke="none"/>
<g fill="#f0dca8" stroke-width=".5"><circle cx="-19" cy="-12.800" r="1.300"/><circle cx="-9.500" cy="-10.600" r="1.300"/><circle cx="9.500" cy="-10.600" r="1.300"/><circle cx="19" cy="-12.800" r="1.300"/></g>
<path d="M-3.200,-9L-2.400,9.500Q0,12 2.400,9.500L3.200,-9Z" fill="url(#huir${u})" stroke-width="1.2"/><path d="M0,-7V8" fill="none" stroke-width=".5" opacity=".7"/>
<ellipse cx="0" cy="-46.500" rx="3.400" ry="2.300" fill="url(#hubz${u})" stroke-width="1"/></g>`;
// her hood up (death)
const hood = (u: number) => `<g class="human-hood">
<path fill-rule="evenodd" d="M-40,60C-34,44 -37,8 -30,-14C-25,-32 -12,-41 0,-45C12,-41 25,-32 30,-14C37,8 34,44 40,60ZM-18,-9C-18,-25 18,-25 18,-9C19,8 16,21 8,28Q0,32 -8,28C-16,21 -19,8 -18,-9Z" fill="url(#hucl${u})" stroke="none"/>
<path d="M-40,60C-34,44 -37,8 -30,-14C-25,-32 -12,-41 0,-45C12,-41 25,-32 30,-14C37,8 34,44 40,60M-18,-9C-18,-25 18,-25 18,-9C19,8 16,21 8,28Q0,32 -8,28C-16,21 -19,8 -18,-9Z" fill="none" stroke-width="1.5"/>
<path d="M-8,28Q0,32 8,28C12,36 8,46 0,50C-8,46 -12,36 -8,28Z" fill="#141a12" opacity=".35" stroke="none"/>
<path d="M-35,52C-38,10 -30,-32 -6,-43C-22,-28 -27,8 -24,52Z" fill="url(#hup${u})" stroke="none"/><path d="M-35,52C-38,10 -30,-32 -14,-39C-27,-24 -32,8 -30,52Z" fill="url(#huq${u})" stroke="none"/>
<path d="M-18,-9C-18,-25 18,-25 18,-9C14,-17 -14,-17 -18,-9Z" fill="#141a12" opacity=".5" stroke="none"/>
<path d="M-27,6C-28,22 -27,36 -25,50M27,6C28,22 27,36 25,50M-10,-38C-18,-30 -22,-18 -23,-6M12,-37C19,-29 22,-18 23,-6M0,-45C-2,-38 -1,-31 0,-27" fill="none" stroke-width=".65" opacity=".75"/>
<path d="M8,-39C20,-30 28,-12 29,10" fill="none" stroke="#b9c8a4" stroke-width="1.1" opacity=".5"/></g>`;
const head = (u: number) => {
  const F = `filter="url(#hug${u})" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round"`, hp = `url(#hup${u})`, hq = `url(#huq${u})`;
  return `<svg class="rig-s rig-rim human-fig" xmlns="${NS}" width="${140 * HS}" height="${180 * HS}" viewBox="-70 -60 140 180"><g ${F}>
<path d="M-24,-10C-27,-31 -13,-39 0,-39C13,-39 27,-31 24,-10C27,8 25,22 19,36L-19,36C-25,22 -27,8 -24,-10Z" fill="url(#huh${u})" stroke-width="1.5"/>
<path d="M-24,-10C-27,-31 -13,-39 -4,-39C-16,-30 -19,-8 -16,36L-19,36C-25,22 -27,8 -24,-10Z" fill="${hp}" stroke="none"/>
<path d="M-8.500,22L-9.500,47Q0,52 9.500,47L8.500,22Z" fill="url(#husk${u})" stroke-width="1.3"/>
<path d="M-8.500,25Q0,37 8.500,25L8.700,31Q0,42 -8.800,31Z" fill="#5a3524" opacity=".34" stroke="none"/><path d="M-8.800,24L-9.500,47Q-6,49 -3.500,49.500L-3.500,31Z" fill="${hp}" stroke="none"/>
<path d="${FACE}" fill="url(#husk${u})" stroke-width="1.5"/>
<path d="M-20,-12C-21,4 -18,18 -9,27Q-6,29 -3.500,29.800C-11,22 -14,6 -12.500,-12C-12.500,-21 -8,-24.500 -4,-25.500C-12,-25 -19.500,-21 -20,-12Z" fill="#7a4a34" opacity=".2" stroke="none"/>
<path d="M-20,-12C-21,4 -18,18 -9,27Q-7.500,28 -6.500,28.500C-14,20 -16.500,6 -15.500,-12C-15.500,-20 -12,-24 -9,-25C-14,-24 -19.500,-20 -20,-12Z" fill="${hp}" stroke="none"/>
<ellipse cx="-11.500" cy="12" rx="5.600" ry="3.600" fill="#b4553d" opacity=".2" stroke="none"/><ellipse cx="11.500" cy="12" rx="5.600" ry="3.600" fill="#c2634a" opacity=".2" stroke="none"/>
<g fill="#7a4a2e" stroke="none" opacity=".55"><circle cx="-7" cy="8.500" r=".55"/><circle cx="-10" cy="7" r=".5"/><circle cx="-4.500" cy="6.500" r=".5"/><circle cx="-12.500" cy="9.500" r=".5"/><circle cx="6.500" cy="8" r=".55"/><circle cx="9.500" cy="6.800" r=".5"/><circle cx="12" cy="9.500" r=".5"/><circle cx="4" cy="6.200" r=".45"/><circle cx="-8.500" cy="10.800" r=".45"/><circle cx="8.500" cy="10.600" r=".45"/></g>
<path d="M-16,17C-15,21 -12,24.500 -9,26.500M15.500,18C14,21.500 12,24 9.500,26" fill="none" stroke-width=".55" opacity=".5"/>
<path d="M0,-31C-10,-35 -24.500,-28 -24.500,-8C-24.500,0 -23.500,8 -21.500,15C-20.500,2 -17,-10 -6,-19C-3,-22 -1,-26 0,-31Z" fill="url(#huh${u})" stroke-width="1.2"/>
<path d="M0,-31C10,-35 24.500,-28 24.500,-8C24.500,0 23.500,8 21.500,15C20.500,2 17,-10 6,-19C3,-22 1,-26 0,-31Z" fill="#a67c40" stroke-width="1.2"/>
<path d="M0,-31C-10,-35 -24.500,-28 -24.500,-8C-24.500,0 -23.500,8 -21.500,15C-22,0 -20,-14 -12,-24Z" fill="${hq}" stroke="none"/>
<path d="M-3,-27C-10,-23 -17,-15 -20,-3M-8,-29C-15,-25 -20,-17 -22,-7M3,-27C10,-23 17,-15 20,-3M8,-29C15,-25 20,-17 22,-7M-22,2C-22,14 -21,24 -18,33M22,2C22,14 21,24 18,33" fill="none" stroke-width=".55" opacity=".7"/>
<path d="M5,-27C12,-23 18,-15 21,-5M21,6C21,16 20,24 18,30" fill="none" stroke="#e6cf9c" stroke-width="1" opacity=".7"/>
${crown()}
<path d="M-1.500,-5C-2.500,3 -4.600,8.500 -4.600,11.600C-4.400,14.200 -2,14.800 0,14.300C2,14.800 4.200,14.200 4.400,11.800" fill="none" stroke-width="1"/>
<path d="M-1.500,-5C-2.500,3 -4.600,8.500 -4.600,11.600C-3,13.200 -1.500,12 -1,9C-.6,4 -.8,-2 -1.500,-5Z" fill="#7a4a34" opacity=".22" stroke="none"/><ellipse cx="1.600" cy="8" rx="1.300" ry="3.600" fill="#f6e2c6" opacity=".5" stroke="none"/>
<path d="M-2.800,13.300q1.100,.9 2.100,.2M2.800,13.300q-1.100,.9 -2.100,.2" fill="none" stroke-width=".7"/>
${mouths}</g>
${eye(-1, u)}${eye(1, u)}
<g transform="translate(-9.6,-8.8)"><g class="human-bL"><g transform="scale(-1,1)">${BROW}</g></g></g><g transform="translate(9.6,-8.8)"><g class="human-bR">${BROW}</g></g>
<g ${F}>${helm(u)}${hood(u)}</g></svg>`;
};

// ---- her shoulders: a moss wool cloak pinned at the throat over a laced leather jerkin and a linen shirt ----
const body = (u: number) => {
  const F = `filter="url(#huf${u})" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round"`, hp = `url(#hup${u})`, hq = `url(#huq${u})`;
  const lap = (s: number) => `M${-5 * s},48C${-22 * s},40 ${-42 * s},46 ${-48 * s},62C${-52 * s},78 ${-52 * s},98 ${-54 * s},118L${-15 * s},118C${-17 * s},94 ${-13 * s},70 ${-5 * s},48Z`;
  let rays = '';
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; rays += `M${n(2.6 * Math.cos(a))},${n(50 + 2.6 * Math.sin(a))}L${n(4.6 * Math.cos(a))},${n(50 + 4.6 * Math.sin(a))}`; }
  return `<svg class="rig-s rig-rim human-fig" xmlns="${NS}" width="${140 * HS}" height="${180 * HS}" viewBox="-70 -60 140 180"><g ${F}>
<path d="M-33,54C-30,36 -15,31 0,31C15,31 30,36 33,54Z" fill="#3a4a33" stroke-width="1.4"/><path d="M-33,54C-30,36 -15,31 -4,31C-16,36 -22,44 -22,54Z" fill="${hp}" stroke="none"/>
<path d="M-31,118L-32,58C-29,47 -14,43 0,45C14,43 29,47 32,58L31,118Z" fill="url(#hulr${u})" stroke-width="1.4"/>
<path d="M-10,41L0,57L10,41L7.500,39Q0,45 -7.500,39Z" fill="#e4d8bd" stroke-width="1.1"/><path d="M-10,41L0,57L-2,48Z" fill="${hp}" stroke="none"/>
<path d="M0,57V118" fill="none" stroke-width="1"/><path d="M-3.500,63L3.500,68M3.500,63L-3.500,68M-3.500,74L3.500,79M3.500,74L-3.500,79M-3.500,85L3.500,90M3.500,85L-3.500,90" fill="none" stroke="#e4d8bd" stroke-width="1.1"/>
<path d="M-12,60C-13,78 -13,96 -13,118M12,60C13,78 13,96 13,118" fill="none" stroke-width=".55" opacity=".6"/>
<path d="${lap(1)}" fill="url(#hucl${u})" stroke-width="1.5"/><path d="${lap(-1)}" fill="#66795a" stroke-width="1.5"/>
<path d="M-5,48C-22,40 -42,46 -48,62C-52,78 -52,98 -54,118L-38,118C-38,96 -37,72 -30,54Z" fill="${hp}" stroke="none"/><path d="M-5,48C-22,40 -42,46 -48,62C-52,78 -52,98 -54,118L-46,118C-46,96 -45,72 -40,56Z" fill="${hq}" stroke="none"/>
<path d="M-40,58C-42,76 -42,96 -44,116M-28,52C-31,72 -30,94 -31,116M40,58C42,76 42,96 44,116M30,52C32,72 31,94 32,116M-20,48C-23,60 -24,74 -24,86" fill="none" stroke-width=".6" opacity=".7"/>
<path d="M-7.500,51C-13,70 -16.500,94 -18,118M7.500,51C13,70 16.500,94 18,118" fill="none" stroke="#c9a85a" stroke-width="1.5" stroke-dasharray="2.4 1.8"/>
<path d="M34,50C42,56 46,66 48,80" fill="none" stroke="#b9c8a4" stroke-width="1.100" opacity=".55"/>
<circle cx="0" cy="50" r="6.200" fill="url(#hubz${u})" stroke-width="1.2"/><circle cx="0" cy="50" r="2.300" fill="#f0dca8" stroke-width=".6"/><path d="${rays}" fill="none" stroke="#3a2a12" stroke-width=".8"/><path d="M-7,54L8,45" fill="none" stroke-width="1.6"/><path d="M-7,54L8,45" fill="none" stroke="#e6cc92" stroke-width=".7"/></g></svg>`;
};

// the long plait over her shoulder swings on its own
const plait = (u: number) => {
  let s = '';
  for (let i = 0; i < 12; i++) { const y = i * 3.6; s += `<path d="M-3.300,${n(y + .8)}Q-3.800,${n(y + 3.8)} 0,${n(y + 6)}Q3.800,${n(y + 3.800)} 3.300,${n(y + .8)}L0,${n(y + 2.8)}Z" fill="${i % 2 ? '#8a6230' : '#a67c40'}" stroke-width=".8"/>`; }
  return `<div class="rig-z human-plait"><svg class="rig-s rig-rim" xmlns="${NS}" width="12" height="50" viewBox="-6 -2 12 50" style="left:-6px;top:-2px;transform:rotate(-5deg);transform-origin:6px 2px">${G(u, `<path d="M-3,0Q0,-2 3,0L3.300,1H-3.300Z" fill="#8a6230" stroke-width=".8"/>${s}<path d="M-1.600,3V44" fill="none" stroke="#e6cf9c" stroke-width=".6" opacity=".5" stroke-dasharray="1.6 2"/>`)}</svg></div>`;
};
// her hands on the wicker rim
const hands = (u: number) => {
  const fg = (x: number, d: number) => `<path d="M${n(x - 1.8)},${RY - 3}C${n(x - 1.8)},${RY - 6.3} ${n(x + 1.8)},${RY - 6.3} ${n(x + 1.8)},${RY - 3}L${n(x + 1.7)},${n(RY + 1.4 + d)}C${n(x + 1.7)},${n(RY + 3.6 + d)} ${n(x - 1.7)},${n(RY + 3.6 + d)} ${n(x - 1.7)},${n(RY + 1.4 + d)}Z" fill="${SKIN}" stroke-width=".8"/><path d="M${n(x - 1.1)},${RY - 2.6}h2.200" fill="none" stroke-width=".45" opacity=".7"/>`;
  const h = (cls: string, x: number) => `<g class="${cls}">${fg(x - 5.7, -.6)}${fg(x - 1.9, .3)}${fg(x + 1.9, .4)}${fg(x + 5.7, -.4)}<path d="M${x - 7.5},${RY - 3}V${RY + 1}h1.500V${RY - 3}Z" fill="#000" opacity=".2" stroke="none"/></g>`;
  return S('rig-rim', -44, RY - 9, 88, 16, G(u, h('human-hL', -31) + h('human-hR', 31)));
};

// ---- what she holds: a forearm in a linen sleeve and a leather bracer, from behind the rim ----
const arm = (u: number, ex: number, ey: number, hx: number, hy: number, w = 6.4) => {
  const dx = hx - ex, dy = hy - ey, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L, a = w / 2 + 1, b = w / 2;
  const at = (f: number, o: number) => `${n(ex + dx * f + nx * o)},${n(ey + dy * f + ny * o)}`;
  return `<path d="M${at(0, a)}L${at(1, b)}L${at(1, -b)}L${at(0, -a)}Z" fill="${LINEN}" stroke-width="1"/><path d="M${at(.14, a)}L${at(.2, -a)}M${at(.3, a * .96)}L${at(.36, -a * .96)}" fill="none" stroke-width=".5" opacity=".6"/>
<path d="M${at(.46, a * .95 + .5)}L${at(.92, b + .5)}L${at(.92, -b - .5)}L${at(.46, -a * .95 - .5)}Z" fill="${HIDE}" stroke-width=".9"/><path d="M${at(.46, -a * .95 - .5)}L${at(.92, -b - .5)}L${at(.92, -b * .1)}L${at(.46, -a * .1)}Z" fill="${HP(u)}" stroke="none"/><path d="M${at(.56, 1.6)}L${at(.62, -1.6)}M${at(.68, 1.6)}L${at(.74, -1.600)}M${at(.8, 1.500)}L${at(.86, -1.500)}" fill="none" stroke="#e4d8bd" stroke-width=".6"/>`;
};
const fist = (x: number, y: number, r = 4.2) => `<path d="M${n(x - r)},${n(y)}C${n(x - r)},${n(y - r * 1.15)} ${n(x + r)},${n(y - r * 1.15)} ${n(x + r)},${n(y)}C${n(x + r)},${n(y + r * .9)} ${n(x - r)},${n(y + r * .9)} ${n(x - r)},${n(y)}Z" fill="${SKIN}" stroke-width=".9"/><path d="M${n(x - r * .5)},${n(y - r * .78)}v${n(r * .7)}M${n(x)},${n(y - r * .86)}v${n(r * .76)}M${n(x + r * .5)},${n(y - r * .78)}v${n(r * .7)}" fill="none" stroke-width=".45"/>`;
const PR = (cls: string, u: number, x: number, y: number, w: number, body: string, wrap = '') => `<div class="human-p human-${cls}">${wrap ? `<div class="human-pw ${wrap}">` : ''}${S('rig-rim', x, y, w, RY - y + 8, G(u, body))}${wrap ? '</div>' : ''}</div>`;
const props = (u: number) => {
  const E = RY + 3, y = (v: number) => n(HY + v);
  // a hand shading her eyes (unrated): the elbow out to the side under the cloak
  return PR('shade', u, -14, HY - 14, 54, `<path d="M-12.500,${y(-5)}H13.500V${y(1.2)}H-12.500Z" fill="#3d281b" opacity=".16" stroke="none"/>
<path d="M17.500,${y(33)}L27,${y(9.5)}L35.500,${y(13.5)}L30,${y(36)}Z" fill="#66795a" stroke-width="1"/><path d="M22,${y(30)}L29,${y(14)}M27,${y(33)}L32,${y(18)}" fill="none" stroke-width=".5" opacity=".7"/>
${arm(u, 31, HY + 13, 15, HY - 6.2, 5.8)}
<path d="M.5,${y(-8.2)}C5,${y(-10.6)} 12,${y(-10.4)} 17.500,${y(-8.6)}L17,${y(-4.6)}C12,${y(-5.8)} 5,${y(-6)} 1.200,${y(-5.200)}Z" fill="${SKIN}" stroke-width=".9"/><path d="M1.500,${y(-6.8)}Q7,${y(-8.2)} 13.500,${y(-7.2)}M2,${y(-5.8)}Q7,${y(-7)} 12,${y(-6.2)}" fill="none" stroke-width=".45" opacity=".8"/>`)
    // cheek on her fist (meh)
    + PR('chin', u, 0, HY + 8, 40, `${arm(u, 28, E, 12.5, HY + 23, 6.4)}${fist(11.5, HY + 19.5, 4.5)}`)
    // a turned wooden mug with one bronze band (great)
    + PR('mug', u, 24, HY + 6, 30, `${arm(u, 36, E, 38, HY + 36)}
<path d="M44,${y(20)}C50.500,${y(20)} 50.500,${y(30)} 44,${y(30)}" fill="none" stroke-width="3.2"/><path d="M44,${y(20)}C50.500,${y(20)} 50.500,${y(30)} 44,${y(30)}" fill="none" stroke="#8a6238" stroke-width="1.5"/>
<path d="M31.500,${y(16)}H44.500L43.500,${y(32.5)}Q38,${y(34.5)} 32.500,${y(32.5)}Z" fill="#9a7444" stroke-width="1"/><path d="M31.500,${y(16)}H36L36.500,${y(33.4)}Q34,${y(33)} 32.500,${y(32.500)}Z" fill="${HP(u)}" stroke="none"/>
<path d="M31.800,${y(21)}Q38,${y(23)} 44.200,${y(21)}L44,${y(24)}Q38,${y(26)} 32,${y(24)}Z" fill="#b99a55" stroke-width=".7"/><ellipse cx="38" cy="${y(16)}" rx="6.500" ry="1.800" fill="#3a2414" stroke-width=".9"/><path d="M34,${y(15.6)}Q38,${y(14.6)} 42,${y(15.6)}" fill="none" stroke="#e9dcc0" stroke-width="1"/>
${fist(38.5, HY + 30, 4.2)}`, 'human-mugw')
    // a stemmed wine cup raised in a toast by her shoulder (superb): a shallow silver bowl, a knop, a foot
    + PR('cup', u, 24, HY + 4, 30, `${arm(u, 36, E, 38.5, HY + 38)}
<path d="M34,${y(38)}Q38.500,${y(35.6)} 43,${y(38)}Q38.500,${y(40)} 34,${y(38)}Z" fill="#aab2b8" stroke-width=".9"/>
<path d="M37.400,${y(22)}H39.600V${y(37)}H37.400Z" fill="#aab2b8" stroke-width=".9"/><ellipse cx="38.500" cy="${y(26)}" rx="2.300" ry="1.500" fill="#dfe5e6" stroke-width=".8"/>
<path d="M31,${y(13)}H46C46,${y(19.5)} 43.500,${y(22.6)} 38.500,${y(22.6)}C33.500,${y(22.6)} 31,${y(19.5)} 31,${y(13)}Z" fill="#c9d0d4" stroke-width="1"/><path d="M31,${y(13)}H35C35,${y(18.5)} 35.500,${y(21.5)} 38.500,${y(22.600)}C33.500,${y(22.6)} 31,${y(19.5)} 31,${y(13)}Z" fill="${HP(u)}" stroke="none"/>
<path d="M31.600,${y(16)}Q38.500,${y(18)} 45.400,${y(16)}" fill="none" stroke="#8a6a2e" stroke-width="1.100"/><path d="M42.500,${y(14.5)}Q43.300,${y(17.5)} 41.200,${y(20)}" fill="none" stroke="#fff" stroke-width=".9" opacity=".7"/>
<ellipse cx="38.500" cy="${y(13)}" rx="7.500" ry="1.900" fill="#6a1a24" stroke-width=".9"/><path d="M33,${y(12.6)}Q38.500,${y(11.6)} 44,${y(12.6)}" fill="none" stroke="#c2637a" stroke-width=".7" opacity=".8"/>
${fist(38.5, HY + 31, 4.2)}`, 'human-cupw')
    // helm on, sword drawn and held upright by the shoulder (player kill)
    + PR('sword', u, 28, HY - 30, 24, `${arm(u, 37, E, 40, HY + 44)}
<path d="M38.200,${y(32)}L38.600,${y(-21)}L40.200,${y(-27)}L41.800,${y(-21)}L42.200,${y(32)}Z" fill="#c9d0d4" stroke-width="1"/><path d="M38.200,${y(32)}L38.600,${y(-21)}L40.200,${y(-27)}V${y(32)}Z" fill="#7d858b" opacity=".55" stroke="none"/><path d="M40.200,${y(-18)}V${y(30)}" fill="none" stroke-width=".5" opacity=".7"/>
<path d="M33.500,${y(32)}H47V${y(35)}H33.500Z" fill="#b99a55" stroke-width=".9"/><path d="M38.800,${y(35)}H41.800V${y(44)}H38.800Z" fill="#4a2f1c" stroke-width=".8"/>
${fist(40.2, HY + 39.5, 4.3)}`, 'human-swordw')
    // a garland of leaves and white flowers (level up and achievement)
    + PR('garl', u, 24, HY + 4, 30, `${arm(u, 36, E, 38.5, HY + 36)}
<circle cx="38.500" cy="${y(20)}" r="8" fill="none" stroke-width="5.4"/><circle cx="38.500" cy="${y(20)}" r="8" fill="none" stroke="#4f7a3c" stroke-width="3.800"/><circle cx="38.500" cy="${y(20)}" r="8" fill="none" stroke="#86a85a" stroke-width="1.600" stroke-dasharray="2.400 2.200"/>
${[0, 72, 144, 216, 288].map((a) => { const x = 38.5 + 8 * Math.sin(a * Math.PI / 180), yy = HY + 20 - 8 * Math.cos(a * Math.PI / 180); return `<circle cx="${n(x)}" cy="${n(yy)}" r="2.100" fill="#f6f1e2" stroke-width=".6"/><circle cx="${n(x)}" cy="${n(yy)}" r=".7" fill="#e3bd62" stroke="none"/>`; }).join('')}
${fist(38.5, HY + 29.5, 4.2)}`, 'human-garlw');
};
// the spear that stands in the car, with a pennon for the great days
const spear = (u: number) => `${S('rig-rim', -50, FY + 22, 20, RY - FY - 14, G(u, `${ink2(`M-40,${RY + 5}V${HY - 17}`, 1.9, '#9a7446')}
<path d="M-40,${HY - 33.5}L-37,${HY - 24}Q-37.400,${HY - 19.5} -40,${HY - 17}Q-42.600,${HY - 19.5} -43,${HY - 24}Z" fill="#b9c0c5" stroke-width="1"/><path d="M-40,${HY - 33.5}L-43,${HY - 24}Q-42.600,${HY - 19.5} -40,${HY - 17}Z" fill="#6f777d" opacity=".6" stroke="none"/><path d="M-40,${HY - 31}V${HY - 18}" fill="none" stroke-width=".5"/>
<path d="M-41.800,${HY - 16.5}h3.600M-41.800,${HY - 14.5}h3.600" fill="none" stroke="#e6cc92" stroke-width="1.100"/>`))}
<div class="rig-a human-pen">${S('rig-rim', -62, HY - 16, 24, 14, G(u, `<path d="M-40.500,${HY - 12.5}C-45,${HY - 14.5} -50,${HY - 10.5} -57.500,${HY - 13}L-54,${HY - 9.5}L-58,${HY - 6}C-51,${HY - 4} -46,${HY - 7.5} -40.500,${HY - 5.500}Z" fill="#2f6a45" stroke-width=".9"/><path d="M-40.500,${HY - 9}C-45,${HY - 10.5} -49,${HY - 8} -54,${HY - 9.5}" fill="none" stroke="#f1ead6" stroke-width="1.600"/>`))}</div>`;
// tears (death): two drops a cheek run slowly from the lid to the jaw, over a wet streak; they stay on her face
const tears = () => `<div class="rig-a human-tears">${([[-8.5, 2.2, '4deg', 0], [3.5, 2.2, '-4deg', -2.5]] as const).map(([x, yy, a, dl]) => `<div class="human-tear" style="left:${CX + x}px;top:${HY + yy}px;transform:rotate(${a})"><i style="--r:4px;--dl:${dl}s"></i><i style="--r:8.5px;--dl:${dl - 2.9}s"></i></div>`).join('')}</div>`;

// ---- the car: honest wickerwork, a rope-bound rim, a round shield slung on it and a waterskin; a plain bound lower band; the sign's two ropes are looped round wooden toggles pushed through the weave just under the rim ----
const basket = (u: number) => {
  // the car is deeper than it looks: the wicker runs on down to K.BD behind the sign (no floor is drawn)
  const BD = K.BD, wv = `url(#huwv${u})`, body = `M-52,${RY + 1}L-46,${BD}H46L52,${RY + 1}Z`;
  let st = '', tw = '', tb = '';
  for (const x of [-42, -33, -24, -15, -6, 3, 12, 21, 30, 39]) st += `M${x},${RY + 3}L${n(x * .885)},${BD}`;
  for (let x = -52; x <= 50; x += 4.2) tw += `M${n(x)},${RY + 3}l2.800,-5.600`;
  for (let x = -46; x <= 44; x += 4.2) tb += `M${n(x)},${n(BY + 3.6 - (x / 47) ** 2 * 1.6)}l2.800,-5.600`;
  const sh = [-9, RY + 16.5] as const;
  let arms = '';
  for (let i = 0; i < 4; i++) arms += `<path transform="rotate(${i * 90})" d="M0,0C1,-4 5,-6 8.500,-4.500C5,-4 3.500,-2 3,0Z" fill="#f1ead6" stroke-width=".6"/>`;
  return S('rig-rim', -60, RY - 6, 120, BD - RY + 8, `${G(u, `
<path d="${body}" fill="url(#huwk${u})" stroke-width="1.2"/><path d="${body}" fill="${wv}" stroke="none"/>
<path d="${st}" fill="none" stroke-width=".7" opacity=".5"/>
<path d="M-52,${RY + 1}L-46,${BD}H-22L-27,${RY + 1}Z" fill="${HP(u)}" stroke="none"/><path d="M-52,${RY + 1}L-46,${BD}H-35L-41,${RY + 1}Z" fill="${HQ(u)}" stroke="none"/>
<path d="M-50.200,${BY - 4}Q0,${BY} 50.200,${BY - 4}L49.600,${BY + 2.6}Q0,${BY + 6.6} -49.600,${BY + 2.6}Z" fill="#7d5a32" stroke-width="1"/><path d="${tb}" fill="none" stroke-width=".6" opacity=".75"/>
<rect x="-54.500" y="${RY - 3.3}" width="109" height="7" rx="3.400" fill="#b08a52" stroke-width="1.2"/><path d="${tw}" fill="none" stroke-width=".65" opacity=".8"/><path d="M-51,${RY - 1.8}H50" fill="none" stroke="#ecd9a8" stroke-width=".9" opacity=".55" stroke-dasharray="2.600 1.600"/>
<path d="M-54.500,${RY - 1}V${RY + 2}Q-54,${RY + 3.7} -51,${RY + 3.7}H-30V${RY - 3.3}H-51Q-54.500,${RY - 3.3} -54.500,${RY - 1}Z" fill="${HP(u)}" stroke="none"/>
${ink2(`M${sh[0] - 5},${RY + 3}L${sh[0] - 2},${sh[1] - 9}M${sh[0] + 7},${RY + 3}L${sh[0] + 3},${sh[1] - 9}`, 1.2, '#6a4526')}
<g transform="translate(${sh[0]},${sh[1]})"><circle r="12.800" fill="#8d949b" stroke-width="1.2"/><circle r="11.300" fill="#8c3b2a" stroke-width=".8"/>${arms}<path d="M-11.300,0A11.300,11.300 0 0 0 0,11.300A14,14 0 0 1 -11.300,0Z" fill="#000" opacity=".25" stroke="none"/><path d="M-9,-6.800A11.300,11.300 0 0 0 -6.800,9A16,16 0 0 1 -9,-6.800Z" fill="${HP(u)}" stroke="none"/>
<circle r="3.600" fill="url(#huir${u})" stroke-width="1"/><circle cx=".9" cy="-1" r="1" fill="#e3e9ec" stroke="none" opacity=".8"/><g fill="#d6dde0" stroke-width=".4"><circle cx="0" cy="-12" r=".8"/><circle cx="8.500" cy="-8.500" r=".8"/><circle cx="12" cy="0" r=".8"/><circle cx="8.500" cy="8.500" r=".8"/><circle cx="0" cy="12" r=".8"/><circle cx="-8.500" cy="8.500" r=".8"/><circle cx="-12" cy="0" r=".8"/><circle cx="-8.500" cy="-8.500" r=".8"/></g></g>`)}
${[-1, 1].map((sd) => { const x = n(sd * HX * K.SS), yy = RY + K.CY; return `<g filter="url(#rgf${u})" stroke="${INK}" stroke-linecap="round"><path d="M${x - 4.2},${yy - .6}H${x + 4.2}" fill="none" stroke-width="3.800"/><path d="M${x - 4.2},${yy - .6}H${x + 4.2}" fill="none" stroke="#b08a52" stroke-width="2.200"/><path d="M${x - 1.6},${yy - 2.4}V${yy + 1.6}M${x + 1.6},${yy - 2.4}V${yy + 1.600}" fill="none" stroke-width="2.200"/><path d="M${x - 1.6},${yy - 2.4}V${yy + 1.6}M${x + 1.6},${yy - 2.4}V${yy + 1.600}" fill="none" stroke="#c9b07c" stroke-width="1"/></g>`; }).join('')}`);
};
const waterskin = (u: number) => `<div class="rig-z human-skin"><svg class="rig-s rig-rim" xmlns="${NS}" width="18" height="26" viewBox="-9 0 18 26" style="left:-9px;top:0">${G(u, `${ink2('M0,0V7', 1, '#c9b07c')}<path d="M-1.600,6.500H1.600V9.500H-1.600Z" fill="#b99a55" stroke-width=".7"/><path d="M-1.800,9.500C-3,13 -7,15 -6.500,19.500C-6,23.500 -2.500,24.500 0,24.500C2.500,24.500 6,23.500 6.500,19.500C7,15 3,13 1.800,9.500Z" fill="#7a5232" stroke-width="1"/><path d="M-1.800,9.500C-3,13 -7,15 -6.500,19.500C-6,23.500 -2.500,24.500 -1.500,24.400C-4,21 -4,15 -1,9.500Z" fill="${HP(u)}" stroke="none"/><path d="M3,14.500Q4.800,17.500 4.200,20.500" fill="none" stroke="#d9b98a" stroke-width=".8" opacity=".6"/><path d="M-5,21Q0,23.500 5,21" fill="none" stroke="#e4d8bd" stroke-width=".7" stroke-dasharray="1.2 1.4"/>`)}</svg></div>`;

// ---- the burner: an iron fire-basket (a cresset) of hooped bars, full of embers, hung on three rods ----
const burner = (u: number) => {
  let bars = '', emb = '';
  for (const x of [-12.5, -7.6, -2.6, 2.6, 7.6, 12.5]) bars += `M${x},${FY + 1.5}Q${n(x * .95)},${FY + 8.5} ${n(x * .34)},${FY + 14}`;
  for (const [x, y, r] of ([[-8, 4.6, 2], [-3.4, 5.6, 2.3], [1.8, 5, 2.2], [6.8, 4.8, 2], [-5.4, 9, 1.9], [-.6, 9.6, 2.1], [4.2, 9, 1.9], [-1.5, 12.4, 1.5], [1.8, 12.2, 1.4]] as const)) emb += `<circle class="human-coal" cx="${x}" cy="${FY + y}" r="${r}" stroke-width=".5"/>`;
  return S('rig-rim', -26, HG, 52, FY - HG + 22, G(u, `
${ink2(`M-19,${HG + 4}L-13,${FY + 1}M19,${HG + 4}L13,${FY + 1}`, 1.2, '#8d949b')}${ink2(`M0,${HG + 5.5}V${HG + 9}`, .9, '#6f777d')}
<path d="M-13,${FY + 1}H13Q12,${FY + 9.5} 4.500,${FY + 14.5}H-4.500Q-12,${FY + 9.5} -13,${FY + 1}Z" fill="#2a1710" stroke-width="1"/>
${emb}<ellipse class="human-coal" cx="0" cy="${FY - .2}" rx="12" ry="2.100" stroke-width=".8"/>
<path d="M-9,${FY - 1.5}L-3,${FY + .8}M4,${FY + .6}L10.500,${FY - 2}" fill="none" stroke-width="2.600"/><path d="M-9,${FY - 1.5}L-3,${FY + .8}M4,${FY + .6}L10.500,${FY - 2}" fill="none" stroke="#5a3a1e" stroke-width="1.400"/>
<path d="${bars}" fill="none" stroke-width="2.500"/><path d="${bars}" fill="none" stroke="#7d858b" stroke-width="1.200"/>
<path d="M-14.500,${FY + .2}Q0,${FY + 4} 14.500,${FY + .2}L14.500,${FY + 2.8}Q0,${FY + 6.6} -14.500,${FY + 2.8}Z" fill="#70787e" stroke-width=".9"/><path d="M-14.500,${FY + .2}Q-9,${FY + 1.8} -6,${FY + 2.2}L-6,${FY + 4.9}Q-10,${FY + 4.4} -14.500,${FY + 2.8}Z" fill="#000" opacity=".3" stroke="none"/>
<path d="M-10.800,${FY + 8}Q0,${FY + 11} 10.800,${FY + 8}" fill="none" stroke-width="2.600"/><path d="M-10.800,${FY + 8}Q0,${FY + 11} 10.800,${FY + 8}" fill="none" stroke="#8d949b" stroke-width="1.300"/>
<path d="M-5.500,${FY + 13.6}H5.500L4,${FY + 16}H-4Z" fill="#596067" stroke-width=".9"/><circle cx="0" cy="${FY + 17.6}" r="1.500" fill="#70787e" stroke-width=".8"/>
<path d="M9,${FY + 1.6}Q11,${FY + 2.4} 13,${FY + 1.2}" fill="none" stroke="#dfe6ea" stroke-width=".8" opacity=".6"/>`))
    + Z('human-coalg', 0, FY + 5);
};

// ---- the envelope: cloth in eight gores; the helpers lay bands, braid and painted devices on the surface ----
const KS = [-1, -.93, -.72, -.4, 0, .4, .72, .93, 1];
const panels = (g: EnvGeo, cols: readonly string[]) => KS.slice(0, -1).map((k, i) => `<path d="${g.gore(k, KS[i + 1]!)}" fill="${cols[i % cols.length]}" stroke="none"/>`).join('');
const seams = (g: EnvGeo, stitch: string, o: { ink?: number; w?: number; dash?: string; op?: number } = {}) => KS.slice(1, -1).map((k) => `<path d="${g.seam(k)}" fill="none" stroke-width=".8" opacity="${o.ink ?? .8}"/>${stitch ? `<path d="${g.seam(k + (k > 0 ? -.035 : .035))}" fill="none" stroke="${stitch}" stroke-width="${o.w || .8}" stroke-dasharray="${o.dash || '2.2 2.2'}" opacity="${o.op || .6}"/>` : ''}`).join('');
const band = (g: EnvGeo, u: number, t0: number, t1: number, fill: string) => `<path d="${g.band(t0, t1)}" fill="${fill}" stroke-width=".9"/><path d="${g.band(t0, t1, -1, -.4)}" fill="${HP(u)}" stroke="none"/>`;
// the twined braid: two cords crossing over and under along a band
const twine = (g: EnvGeo, t0: number, t1: number, num: number, c1: string, c2: string, w = 1.1) => {
  const ks = g.along(num * 8 + 1, -.985, .985), tm = (t0 + t1) / 2, a = (t1 - t0) / 2;
  const mk = (sg: number) => ks.map((k, j) => (j ? 'L' : 'M') + pp(g.pt(k, tm + sg * a * Math.sin(j * Math.PI / 4)))).join('');
  return `<path d="${mk(1)}${mk(-1)}" fill="none" stroke-width="${n(w + 1.1)}" opacity=".85"/><path d="${mk(1)}" fill="none" stroke="${c1}" stroke-width="${w}"/><path d="${mk(-1)}" fill="none" stroke="${c2 || c1}" stroke-width="${w}"/>`;
};
const edge = (g: EnvGeo, t: number, col: string, w = 1) => `<path d="${g.lat(t)}" fill="none" stroke-width="${n(w + 1)}" opacity=".8"/><path d="${g.lat(t)}" fill="none" stroke="${col}" stroke-width="${w}"/>`;
const creases = (g: EnvGeo, list: ReadonlyArray<readonly [number, number, number]>) => `<path d="${list.map(([k, a, b]) => g.seam(k, a, b)).join('')}" fill="none" stroke-width=".7" opacity=".55"/>`;
const girdle = (g: EnvGeo, t: number, col: string) => ink2(g.lat(t), 1.5, col, 'stroke-dasharray="3 1.200"');
const star = (x: number, y: number, r: number, fill: string, sw = .5) => { let d = ''; for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, q = i % 2 ? r * .42 : (i % 4 ? r * .72 : r); d += (i ? 'L' : 'M') + `${n(x + q * Math.sin(a))},${n(y - q * Math.cos(a))}`; } return `<path d="${d}Z" fill="${fill}" stroke-width="${sw}"/>`; };
const sun = (r: number, fill: string, core: string, cnt = 12, sw = .7) => { let d = ''; for (let i = 0; i < cnt; i++) { const a = i * 2 * Math.PI / cnt, h = Math.PI / cnt * .62, L = i % 2 ? r * 1.5 : r * 1.95; d += `M${n(r * Math.sin(a - h))},${n(-r * Math.cos(a - h))}L${n(L * Math.sin(a))},${n(-L * Math.cos(a))}L${n(r * Math.sin(a + h))},${n(-r * Math.cos(a + h))}Z`; } return `<path d="${d}" fill="${fill}" stroke-width="${sw}"/><circle r="${r}" fill="${core || fill}" stroke-width="${sw}"/>`; };
// the running horse of the Mark (drawn about 0,0, about 40 x 24, running to the left)
const HORSE = 'M-19,-8.500L-15.500,-11.500L-14.600,-13.600L-13.400,-11.200C-10,-10 -7,-7.500 -5,-5.200C0,-6.800 6,-6.800 10,-5.200C13,-6.500 16,-8.500 20.500,-8C17.500,-5.800 15.500,-3.800 13.400,-2.200C14.200,.8 13.800,2.800 15.200,4.800L20,8.300L18.600,10L12.600,6.200C10.800,4.800 9.800,3.600 8.800,2.800L9.300,7L6.600,11.200L5,10.300L6.700,6.700L5,3C1,4 -3,3.600 -6,2.200L-8.800,5.800L-14.500,8L-15.100,6.300L-10.600,4.400L-9.800,1.200L-13,2.400L-16.200,5.200L-17.400,4L-14.400,.5L-10.800,-1.400C-11.500,-3.600 -12.500,-5.400 -14,-6.400L-17.600,-5.800Z';
const horse = (fill: string, sw = .8) => `<path d="${HORSE}" fill="${fill}" stroke-width="${sw}"/><path d="M-12.500,-10.500C-10,-9 -8,-7 -6.500,-5M16,-7C14.500,-5.800 13.500,-4.600 12.600,-3.400" fill="none" stroke-width=".5" opacity=".7"/>`;
// the white tree
const TREE = 'M0,13V-3M0,3C-4,0 -8,-1 -10.500,-6M0,3C4,0 8,-1 10.500,-6M0,-3C-3,-6 -5.500,-8.500 -5.500,-12.500M0,-3C3,-6 5.500,-8.500 5.500,-12.500M0,-3V-14.500M0,13L-4.500,15.500M0,13L4.500,15.500M-6,-1.500C-8,-3 -9.500,-2 -12.500,-2.500M6,-1.500C8,-3 9.500,-2 12.500,-2.500';
const tree = (col: string) => `<path d="${TREE}" fill="none" stroke-width="3.6"/><path d="${TREE}" fill="none" stroke="${col}" stroke-width="2"/>${[[-10.5, -6], [10.5, -6], [-5.5, -12.5], [5.5, -12.5], [0, -14.5], [-12.5, -2.5], [12.5, -2.5]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.700" fill="${col}" stroke-width=".5"/>`).join('')}`;
const stars7 = (r: number, y0: number, sz: number, fill: string) => [-66, -44, -22, 0, 22, 44, 66].map((a) => star(r * Math.sin(a * Math.PI / 180), y0 - r * Math.cos(a * Math.PI / 180), sz, fill)).join('');
// a pennon with a swallow tail, flying to the right from x,y
const pennon = (x: number, y: number, L: number, h: number, fill: string, stripe?: string) => `<path d="M${n(x)},${n(y)}C${n(x + L * .3)},${n(y - 2.5)} ${n(x + L * .62)},${n(y + 2.5)} ${n(x + L)},${n(y - .5)}L${n(x + L * .8)},${n(y + h * .5)}L${n(x + L * .98)},${n(y + h + .5)}C${n(x + L * .62)},${n(y + h + 2.5)} ${n(x + L * .3)},${n(y + h - 2)} ${n(x)},${n(y + h)}Z" fill="${fill}" stroke-width=".9"/>${stripe ? `<path d="M${n(x)},${n(y + h / 2)}C${n(x + L * .3)},${n(y + h / 2 - 2.3)} ${n(x + L * .6)},${n(y + h / 2 + 2.5)} ${n(x + L * .8)},${n(y + h * .5)}" fill="none" stroke="${stripe}" stroke-width="1.3"/>` : ''}`;
// the cap on the crown, and a turned knob
const cap = (c: readonly [number, number], fill: string, r = 8.5) => `<path d="M${n(c[0] - r)},${n(c[1] + 4)}Q${n(c[0])},${n(c[1] - 3.5)} ${n(c[0] + r)},${n(c[1] + 4)}Q${n(c[0])},${n(c[1] + 7.5)} ${n(c[0] - r)},${n(c[1] + 4)}Z" fill="${fill}" stroke-width="1"/>`;
// a scalloped valance hanging from a latitude
const scallops = (g: EnvGeo, t: number, num: number, cols: readonly string[], drop = 8) => {
  const A0 = Math.asin(-.97), st = (Math.asin(.97) - A0) / num; let s = '';
  for (let i = 0; i < num; i++) {
    const a = A0 + st * (i + .5), p0 = g.pt(Math.sin(a - st / 2), t), p1 = g.pt(Math.sin(a + st / 2), t), m = g.pt(Math.sin(a), t);
    s += `<path d="M${pp(p0)}Q${n(p0[0])},${n(m[1] + drop)} ${n(m[0])},${n(m[1] + drop)}Q${n(p1[0])},${n(m[1] + drop)} ${pp(p1)}Z" fill="${cols[i % cols.length]}" stroke-width=".8"/><circle cx="${n(m[0])}" cy="${n(m[1] + drop - 2.6)}" r="1.100" fill="#f0d27a" stroke-width=".4"/>`;
  }
  return s;
};
// a round shield hung on the envelope (the shield wall)
const shield = (g: EnvGeo, k: number, t: number, r: number, f1: string, f2: string, u: number) => `<g transform="${g.place(k, t)}"><circle r="${r}" fill="#9aa2a8" stroke-width="1.1"/><circle r="${n(r - 1.4)}" fill="${f1}" stroke-width=".7"/><path d="M0,${-r + 1.4}A${r - 1.4},${r - 1.4} 0 0 1 0,${r - 1.4}Z" fill="${f2}" stroke-width=".5"/>${k < -.3 ? `<circle r="${n(r - 1.4)}" fill="${HP(u)}" stroke="none"/>` : ''}<circle r="${n(r * .3)}" fill="#c9d0d4" stroke-width=".8"/></g>`;

const ENV: Readonly<Record<string, EnvSpec>> = {
  // patched sackcloth: sagging, lopsided, sewn with twine
  poor: { cond: { sag: 1, lop: .8, dents: [{ side: -1, t: .48, depth: 13, span: .12 }, { side: 1, t: .28, depth: 7, span: .1 }] }, art: (g: EnvGeo, u: number) => { const c = g.pt(0, 0), e = g.pt(1, .8); return {
    base: '#7b705a', lip: '#8a7a5c', ring: '#8a7658',
    inside: `${panels(g, ['#857a62', '#6d6452', '#8f8468', '#746a56', '#82775f', '#665e4e', '#7d7260', '#6f6654'])}<path d="${g.out}" fill="url(#husc${u})" stroke="none"/>${seams(g, '#e0d2a8', { w: 1.2, dash: '3 3.4', op: .85 })}
${creases(g, [[-.8, .34, .7], [-.5, .44, .66], [.42, .68, .98], [-.3, .7, .98], [.8, .58, .9], [-.05, .76, .98], [.3, .04, .2]])}
${g.patch(.46, .42, 24, 18, { fill: '#a39672', rot: 10, stitch: '#2a2018', sw: 1.1, hatch: `url(#husc${u})` })}${g.patch(-.36, .3, 19, 15, { fill: '#56646a', rot: -8, stitch: '#e0d2a8', sw: 1.1 })}${g.patch(-.06, .62, 17, 19, { fill: '#6a4a2e', rot: 7, stitch: '#e0d2a8', sw: 1, hatch: HP(u) })}
${g.patch(.14, .18, 15, 11, { fill: '#b3a88a', rot: -16 })}${g.patch(-.7, .68, 13, 12, { fill: '#8c5a3a', rot: 13, stitch: '#e0d2a8' })}${g.patch(.42, .5, 9, 8, { fill: '#56646a', rot: -20, stitch: '#e0d2a8' })}
<g transform="${g.place(-.2, .46)}" fill="none" stroke="#3a3026" stroke-width="1.2" opacity=".6"><circle r="6"/><path d="M-3.500,-3.500L3.500,3.500M3.500,-3.500L-3.500,3.500"/></g>
${girdle(g, .8, '#b8a273')}`,
    over: `${cap(c, '#6d6452', 6.5)}<path d="M${n(c[0] - 2)},${n(c[1] - 1)}l-3.500,-4.500M${n(c[0] + 1)},${n(c[1] - 1)}l3.500,-5" fill="none" stroke-width="1.100"/>${ink2(`M${n(e[0] - 1)},${n(e[1])}q4,7 1,13q-2,5 2,9`, 1.3, '#b8a273', 'stroke-dasharray="3 1.200"')}`,
  }; } },
  // plain sailcloth, sound enough
  meh: { cond: { sag: .3, lop: -.12 }, art: (g: EnvGeo, u: number) => { const c = g.pt(0, 0); return {
    base: '#c2ae84', lip: '#8a6a45',
    inside: `${panels(g, ['#c8b48a', '#b9a57b'])}${seams(g, '#6a5a3c', { op: .5 })}${creases(g, [[.42, .74, .98], [-.34, .76, .98]])}${g.patch(-.44, .3, 13, 11, { fill: '#ab9870', rot: -6 })}
${band(g, u, .5, .545, '#8a6a45')}${girdle(g, .82, '#a8905e')}`,
    over: cap(c, '#8a6a45', 7.5),
  }; } },
  // sound and full: ochre and nut-brown homespun, a cream band with one braid
  good: { cond: {}, art: (g: EnvGeo, u: number) => { const c = g.pt(0, 0); return {
    base: '#c2933c', lip: '#7a4f2a',
    inside: `${panels(g, ['#c99a3d', '#7f5230'])}${seams(g, '#f3e2b4', { op: .55 })}
${band(g, u, .47, .575, '#ecdfbd')}${twine(g, .49, .555, 9, '#7f5230', '#b0562e', 1.2)}${edge(g, .47, '#7f5230')}${edge(g, .575, '#7f5230')}${band(g, u, .84, .875, '#7f5230')}`,
    over: `${cap(c, '#7f5230')}<path d="M${n(c[0] - 2)},${n(c[1])}v-4h4v4" fill="#9a7444" stroke-width=".9"/><circle cx="${n(c[0])}" cy="${n(c[1] - 6.5)}" r="3.300" fill="#b08a52" stroke-width="1"/>`,
  }; } },
  // fine work: the blue and silver of the North, the white tree under seven stars
  great: { cond: { taut: .5 }, art: (g: EnvGeo, u: number) => { const c = g.pt(0, 0), e = g.pt(0, .2); return {
    base: '#274a78', lip: '#c9d0d4', ring: '#d6dde0',
    inside: `${panels(g, ['#2c5182', '#23426e'])}${seams(g, '#b9c7d8', { op: .5 })}
${band(g, u, .36, .415, '#dfe5e6')}${twine(g, .368, .407, 13, '#274a78', '#274a78', .9)}
${band(g, u, .52, .61, '#dfe5e6')}${twine(g, .535, .595, 11, '#274a78', '#6f8fb5', 1.2)}${edge(g, .52, '#f6f9f9', .8)}${edge(g, .61, '#f6f9f9', .8)}${band(g, u, .845, .88, '#dfe5e6')}
<g transform="translate(${n(e[0])},${n(e[1] + 3)})">${stars7(19, 2, 2.9, '#f6f9f9')}<g transform="scale(.82)">${tree('#f6f9f9')}</g></g>`,
    over: `${cap(c, '#c9d0d4')}${ink2(`M${n(c[0])},${n(c[1] + 1)}V${n(c[1] - 9)}`, 1.1, '#8a6a45')}${pennon(c[0] + .8, c[1] - 7, 19, 5.5, '#dfe5e6', '#274a78')}<path d="M${n(c[0] - 2)},${n(c[1] - 8)}L${n(c[0])},${n(c[1] - 14)}L${n(c[0] + 2)},${n(c[1] - 8)}Z" fill="#dfe5e6" stroke-width=".8"/>`,
  }; } },
  // a king's banner, brand new: the white horse on green, white band, gold braid, sun finial, pennons, valance
  superb: { cond: { taut: 1 }, art: (g: EnvGeo, u: number) => { const c = g.pt(0, 0), e = g.pt(0, .23); return {
    base: '#2f6a45', lip: '#e3bd62', ring: '#f0dca8',
    inside: `${panels(g, ['#2f6f48', '#27603d'])}${seams(g, '#e9c865', { op: .75, dash: '1.4 1.800' })}
<path d="${g.band(0, .09)}" fill="#e3bd62" stroke-width=".8"/>
${band(g, u, .5, .64, '#f4efe0')}${edge(g, .5, '#e9c865', 1.5)}${edge(g, .64, '#e9c865', 1.5)}${twine(g, .525, .615, 11, '#2f6a45', '#d2a843', 1.5)}
${g.along(11, -.94, .94).map((k, i) => { const p = g.pt(k, .43); return i % 2 ? '' : `<g transform="translate(${n(p[0])},${n(p[1])}) scale(${n(Math.max(.4, Math.sqrt(1 - k * k)))},1)">${sun(1.7, '#f0d27a', '#f0d27a', 8, .4)}</g>`; }).join('')}
${band(g, u, .84, .89, '#e3bd62')}${twine(g, .848, .882, 14, '#27603d', '#27603d', .8)}
<g transform="translate(${n(e[0])},${n(e[1])}) scale(1.42)">${horse('#fbf8ee', .7)}</g>`,
    over: `${scallops(g, .89, 12, ['#f4efe0', '#2f6a45'], 8.5)}${cap(c, '#e3bd62', 9.5)}${ink2(`M${n(c[0])},${n(c[1] + 1)}V${n(c[1] - 7)}`, 1.2, '#e3bd62')}
${pennon(c[0] + .8, c[1] - 5.5, 34, 6, '#2f6a45', '#f4efe0')}${pennon(c[0] - .8, c[1] - 1, -27, 5.5, '#f4efe0', '#2f6a45')}<g transform="translate(${n(c[0])},${n(c[1] - 7.5)})">${sun(2.7, '#f0d27a', '#fff3c4', 8, .6)}</g>`,
  }; } },
  // unrated: undyed linen tacked together, a blank shield chalked on it, dye swatches pinned beside
  calibrating: { cond: { sag: .12 }, art: (g: EnvGeo, u: number) => { const c = g.pt(0, 0); return {
    base: '#b9b6aa', lip: '#8d8a7e',
    inside: `${panels(g, ['#c1beb2', '#b0ada1'])}${seams(g, '#b0392c', { w: 1.1, dash: '4 3', op: .8 })}
<path d="${g.lat(.66)}" fill="none" stroke="#b0392c" stroke-width="1.1" stroke-dasharray="4 3" opacity=".8"/>
<g transform="${g.place(-.1, .31)}"><path d="M-12,-13H12V1C12,9 6,13.500 0,16C-6,13.500 -12,9 -12,1Z" fill="#cdcabe" stroke="#3a3731" stroke-width="1.2" stroke-dasharray="3 2.200"/><path d="M0,-13V16M-12,-1H12" fill="none" stroke="#3a3731" stroke-width=".7" stroke-dasharray="1.5 2.500" opacity=".7"/></g>
${([['#c99a3d', .24], ['#274a78', .34], ['#2f6a45', .44]] as const).map(([col, t]) => `<g transform="${g.place(.46, t)}"><rect x="-4.500" y="-3.500" width="9" height="7" fill="${col}" stroke-width=".8"/><circle cx="0" cy="-3.500" r="1" fill="#e6e2d6" stroke-width=".5"/></g>`).join('')}
${girdle(g, .82, '#a8905e')}`,
    over: cap(c, '#9a978b', 7),
  }; } },
  // a player kill: the war bag with its shield wall
  pvp: { cond: { taut: .3 }, art: (g: EnvGeo, u: number) => {
    const c = g.pt(0, 0);
    const sh = g.along(9, -.985, .985).map((k, i) => shield(g, k, .64, 8.4, i % 2 ? '#1c1818' : '#9c2a20', i % 2 ? '#e6dcc6' : '#9c2a20', u)).join('');
    return {
      base: '#2c2726', lip: '#9c2a20', ring: '#aab2b8',
      inside: `${panels(g, ['#332d2b', '#262120'])}${seams(g, '#b3412e', { op: .8 })}
${band(g, u, .3, .5, '#9c2a20')}${edge(g, .3, '#17120e', 1.2)}${edge(g, .5, '#17120e', 1.2)}
<g transform="${g.place(0, .4)}"><g transform="rotate(38)"><path d="M-1.200,13V-11L0,-15L1.200,-11V13Z" fill="#dfe5e6" stroke-width=".7"/><path d="M-4.500,8H4.500" fill="none" stroke="#17120e" stroke-width="2.200"/></g><g transform="rotate(-38)"><path d="M-1.200,13V-11L0,-15L1.200,-11V13Z" fill="#dfe5e6" stroke-width=".7"/><path d="M-4.500,8H4.500" fill="none" stroke="#17120e" stroke-width="2.200"/></g></g>
${band(g, u, .86, .9, '#9c2a20')}`,
      over: `${ink2(g.lat(.575), 1.2, '#8a7a5c')}${sh}${cap(c, '#4a4f55')}<path d="M${n(c[0] + 1)},${n(c[1] - 3)}C${n(c[0] + 7)},${n(c[1] - 9)} ${n(c[0] + 15)},${n(c[1] - 6)} ${n(c[0] + 19)},${n(c[1] + 3)}C${n(c[0] + 13)},${n(c[1] - 1)} ${n(c[0] + 8)},${n(c[1] - 2)} ${n(c[0] + 2)},${n(c[1] + 1)}Z" fill="#9c2a20" stroke-width=".9"/><path d="M${n(c[0] - 2.6)},${n(c[1])}L${n(c[0])},${n(c[1] - 13)}L${n(c[0] + 2.6)},${n(c[1])}Z" fill="#b9c0c5" stroke-width=".9"/>`,
    };
  } },
  // a level gained: the sun rising, its rays climbing the gores
  levelup: { cond: { taut: .6 }, art: (g: EnvGeo, u: number) => {
    const c = g.pt(0, 0), e = g.pt(0, .66);
    let rays = '';
    for (let i = 0; i < 13; i++) { const a = (-84 + i * 14) * Math.PI / 180, L = i % 2 ? 44 : 66, h = .05; rays += `M${n(17 * Math.sin(a - h))},${n(-17 * Math.cos(a - h))}L${n(L * Math.sin(a))},${n(-L * Math.cos(a))}L${n(17 * Math.sin(a + h))},${n(-17 * Math.cos(a + h))}Z`; }
    return {
      base: '#8c2430', lip: '#e3bd62', ring: '#e9c865',
      inside: `${panels(g, ['#96283a', '#7d1f2b'])}${seams(g, '#e9c865', { op: .5 })}
<g transform="translate(${n(e[0])},${n(e[1])})"><path d="${rays}" fill="#e9c865" stroke-width=".7"/><path d="M-15,0A15,15 0 0 1 15,0Z" fill="#f6dc8a" stroke-width="1"/><path d="M-10.500,0A10.500,10.500 0 0 1 10.500,0" fill="none" stroke="#b9862e" stroke-width=".8"/></g>
${band(g, u, .66, .73, '#e3bd62')}${twine(g, .672, .718, 12, '#8c2430', '#8c2430', .9)}${band(g, u, .85, .885, '#e3bd62')}`,
      over: `${cap(c, '#e3bd62')}${ink2(`M${n(c[0])},${n(c[1] + 1)}V${n(c[1] - 6)}`, 1.1, '#e3bd62')}<g transform="translate(${n(c[0])},${n(c[1] - 6.5)})">${sun(2.5, '#f0d27a', '#fff3c4', 8, .6)}</g>`,
      html: Z('human-sung', e[0], e[1] - 6),
    };
  } },
  // a death: let down, a black pall over the crown
  death: { cond: { sag: .62, lop: -.1 }, art: (g: EnvGeo, u: number) => {
    const tail = (s: number) => { const p = g.pt(s * .93, .2); return `<path d="M${n(p[0] - s * 5)},${n(p[1] - 2)}C${n(p[0] + s * 3)},${n(p[1] + 12)} ${n(p[0] - s * 2)},${n(p[1] + 26)} ${n(p[0] + s * 4)},${n(p[1] + 42)}L${n(p[0] - s * 5)},${n(p[1] + 37)}L${n(p[0] - s * 9)},${n(p[1] + 44)}C${n(p[0] - s * 12)},${n(p[1] + 26)} ${n(p[0] - s * 8)},${n(p[1] + 12)} ${n(p[0] - s * 14)},${n(p[1] - 1)}Z" fill="#15120f" stroke="#000" stroke-width="1"/><path d="M${n(p[0] - s * 5)},${n(p[1] + 8)}q${s * 3},12 ${-s * 1},24" fill="none" stroke="#6a6257" stroke-width=".7"/>`; };
    return {
      base: '#4a4c4e', lip: '#4a4d50', ring: '#6a6358',
      inside: `${panels(g, ['#52555a', '#42454a'])}${seams(g, '#8a8a86', { op: .45 })}${creases(g, [[.42, .68, .98], [-.32, .7, .98], [-.72, .4, .7], [.7, .62, .9], [-.06, .76, .98]])}
<path d="${g.band(0, .22)}" fill="#15120f" stroke="#000" stroke-width="1"/><path d="${g.lat(.1, -.9, .9)}${g.lat(.17, -.95, .95)}" fill="none" stroke="#6a6257" stroke-width=".7"/>${tail(-1)}${tail(1)}
${girdle(g, .82, '#77705f')}`,
      over: '',
    };
  } },
  // an achievement: ivory, a great garland round a gold star
  achievement: { cond: { taut: .8 }, art: (g: EnvGeo, u: number) => {
    const c = g.pt(0, 0), e = g.pt(0, .27);
    let lv = '', fl = '';
    for (let i = 0; i < 22; i++) { const a = i * 2 * Math.PI / 22, x = 17.5 * Math.sin(a), y = -17.5 * Math.cos(a), r = a * 180 / Math.PI + (i % 2 ? 50 : 130); lv += `<ellipse cx="${n(x)}" cy="${n(y)}" rx="4.6" ry="2.1" transform="rotate(${n(r)} ${n(x)} ${n(y)})" fill="${i % 2 ? '#3f7a45' : '#2f6238'}" stroke-width=".6"/>`; }
    for (let i = 0; i < 6; i++) { const a = (i * 60 + 30) * Math.PI / 180, x = 17.5 * Math.sin(a), y = -17.5 * Math.cos(a); fl += `<circle cx="${n(x)}" cy="${n(y)}" r="2.900" fill="#fbf8ee" stroke-width=".6"/><circle cx="${n(x)}" cy="${n(y)}" r="1" fill="#e3bd62" stroke="none"/>`; }
    return {
      base: '#ece3c8', lip: '#e3bd62', ring: '#e9c865',
      inside: `${panels(g, ['#f1e9d0', '#e4dabd'])}${seams(g, '#b99a55', { op: .6 })}
${band(g, u, .54, .63, '#2f6a45')}${edge(g, .54, '#e9c865', 1.2)}${edge(g, .63, '#e9c865', 1.2)}${twine(g, .556, .614, 12, '#e9c865', '#f4efe0', 1.2)}${band(g, u, .845, .885, '#e3bd62')}
<path d="${g.band(0, .08)}" fill="#2f6a45" stroke-width=".8"/>
<g transform="translate(${n(e[0])},${n(e[1])})"><path d="M-4,17L-9,33L-3,29L0,34L3,22ZM4,17L10,32L12,26L17,28L9,15Z" fill="#2f6a45" stroke-width=".8"/>${lv}${fl}${star(0, 0, 11, '#e3bd62', .8)}<circle r="3.400" fill="#fff3c4" stroke-width=".6"/></g>`,
      over: `${cap(c, '#e3bd62')}${ink2(`M${n(c[0])},${n(c[1] + 1)}V${n(c[1] - 5)}`, 1.1, '#e3bd62')}<circle cx="${n(c[0])}" cy="${n(c[1] - 7)}" r="3" fill="#f0d27a" stroke-width=".9"/>${pennon(c[0] + 1, c[1] - 5, 22, 4.5, '#2f6a45')}${pennon(c[0] - 1, c[1] - 2, -18, 4.5, '#3f7a45')}`,
    };
  } },
};

// ---- the sign: a painted inn board of three planks, lashed to a pole that hangs on two ropes ----
const SW = 158, HX = 56;   // the ropes are tied to the pole inboard of its ends, so they fall straight from the car's wall
// [wood, wood in light, painted field, border]
const PAINT: Readonly<Record<string, readonly [string, string, string, string]>> = {
  calibrating: ['#8f8a7c', '#c9c4b4', '#3a3936', '#8f8a7c'], meh: ['#8a6a45', '#c9a878', '#35302a', '#a89468'],
  poor: ['#857c6a', '#b8ae98', '#3d362e', ''], good: ['#8a6238', '#d2a86a', '#3a2a1c', '#d2a23f'],
  great: ['#7d5a36', '#c9a878', '#1e3352', '#dfe5e6'], superb: ['#8a6238', '#e9c865', '#1f4a30', '#e9c865'],
  pvp: ['#3a302c', '#7a6a60', '#191415', '#b3312a'], levelup: ['#8a6238', '#e9c865', '#641a24', '#e9c865'],
  death: ['#38352f', '#6a655c', '#1b1c1e', '#5b5c5e'], achievement: ['#8a6238', '#e9c865', '#262a22', '#e3bd62'],
};
const board = ({ w, h, hx = HX, mood, kind, u }: BoardArgs) => {
  const [wood, hi, field, rim] = PAINT[mood] || PAINT.meh!, poor = mood === 'poor', rich = mood === 'superb', gilt = rich || mood === 'levelup' || mood === 'achievement';
  const a = w / 2 - hx, b = w / 2 + hx, ri = kind === 'achievement' ? 6.8 : 8, y1 = n(h / 3), y2 = n(h * 2 / 3);
  const lash = (x: number) => `<path d="M${x - 2.6},-7.800L${x - 2.6},3.500M${x},-8L${x},4M${x + 2.6},-7.800L${x + 2.6},3.500" fill="none" stroke-width="2.800"/><path d="M${x - 2.6},-7.800L${x - 2.6},3.500M${x},-8L${x},4M${x + 2.6},-7.800L${x + 2.6},3.500" fill="none" stroke="#c9b07c" stroke-width="1.500" stroke-dasharray="2.200 .8"/><circle cx="${x}" cy="5" r="1.300" fill="#170f0a" stroke-width=".5"/>`;
  const knob = (x: number) => `<circle cx="${x}" cy="-4.300" r="3.500" fill="${gilt ? '#e3bd62' : wood}" stroke-width="1"/><circle cx="${n(x + .8)}" cy="-5.200" r="1" fill="#fff" opacity=".4" stroke="none"/>`;
  return G(u, `<rect x="-9" y="-6.800" width="${w + 18}" height="5" rx="2.500" fill="${wood}" stroke-width="1.1"/><path d="M-6,-5.400H${w + 6}" fill="none" stroke="${hi}" stroke-width=".8" opacity=".6"/>${knob(-9)}${knob(w + 9)}
<path d="M${poor ? 8 : 1.5},.7H${w - 1.5}Q${w - .7},.7 ${w - .7},2V${h - 2}Q${w - .7},${h - .7} ${w - 1.5},${h - .7}H1.500Q.7,${h - .7} .7,${h - 2}V${poor ? 7 : 2}${poor ? 'L8,.7' : 'Q.7,.7 1.500,.7'}Z" fill="${wood}" stroke-width="1.3"/>
<path d="M2.400,${h - 3}V${poor ? 9 : 2.6}M${poor ? 10 : 3},2.400H${w - 3}" fill="none" stroke="${hi}" stroke-width="1" opacity=".7"/><path d="M${w - 2.3},3V${h - 2.3}H3" fill="none" stroke="#000" stroke-width="1" opacity=".35"/>
<rect x="1.200" y="${poor ? 8 : 1.2}" width="5" height="${h - (poor ? 9.2 : 2.4)}" fill="${HP(u)}" stroke="none"/><rect x="1.200" y="${h - 6}" width="${w * .45}" height="4.800" fill="${HQ(u)}" stroke="none"/>
<rect x="5.500" y="5.500" width="${w - 11}" height="${h - 11}" rx="1" fill="${field}" stroke-width=".9"/>
<path d="M.7,${y1}H${w - .7}M.7,${y2}H${w - .7}" fill="none" stroke="#000" stroke-width=".8" opacity=".5"/><path d="M6,${n(y1 + .9)}H${w - 6}M6,${n(y2 + .9)}H${w - 6}" fill="none" stroke="#fff" stroke-width=".5" opacity=".12"/>
<path d="M12,${n(y1 - 6)}q14,-2.500 30,0M${w - 50},${n(y2 + 6)}q16,2.500 36,-.5M${w * .4},${n(y1 + 7)}q10,1.500 22,0M16,${h - 9.5}q10,-1.500 24,0" fill="none" stroke="${hi}" stroke-width=".55" opacity=".2"/>
${rim ? `<rect x="${ri}" y="${ri}" width="${w - 2 * ri}" height="${h - 2 * ri}" fill="none" stroke="${rim}" stroke-width="${rich ? 1.2 : .9}" opacity="${rich || gilt ? 1 : .8}"/>` : ''}
${rich ? `<rect x="10.200" y="10.200" width="${w - 20.4}" height="${h - 20.4}" fill="none" stroke="#f4efe0" stroke-width=".6" opacity=".8"/>${[[8, 8], [w - 8, 8], [8, h - 8], [w - 8, h - 8]].map(([x, y]) => `<g transform="translate(${x},${y})">${sun(1.9, '#f0d27a', '#fff3c4', 8, .4)}</g>`).join('')}` : ''}
${poor ? `<g stroke="none" fill="${wood}"><path d="M5.500,${h - 5.5}h22q-4,-5 -12,-4q-6,-4 -10,-1Z"/><path d="M${w - 5.5},5.500h-19q3,5 9,4q5,5 10,2Z"/><path d="M${w - 5.5},${h - 5.5}h-12q3,-4 7,-3.500q2,-3 5,-2.500Z"/></g><path d="M${w - 30},${y1}l8,-2.500l9,3l12,-1.500" fill="none" stroke-width=".8"/><ellipse cx="${n(w * .27)}" cy="${n(h - 3.2)}" rx="2.600" ry="1.300" fill="#2a2018" stroke-width=".5"/>` : ''}
<g fill="#2a2018" stroke="none" opacity=".75"><circle cx="3.200" cy="${n(y1 / 2)}" r=".8"/><circle cx="3.200" cy="${n((y1 + y2) / 2)}" r=".8"/><circle cx="3.200" cy="${n((y2 + h) / 2)}" r=".8"/><circle cx="${w - 3.2}" cy="${n(y1 / 2)}" r=".8"/><circle cx="${w - 3.2}" cy="${n((y1 + y2) / 2)}" r=".8"/><circle cx="${w - 3.2}" cy="${n((y2 + h) / 2)}" r=".8"/></g>
${lash(a)}${lash(b)}${lash(n(w / 2 - 22))}${lash(n(w / 2 + 22))}`);
};
// the rating as five little round shields; a player kill is two red strokes
const pips = (mood: Mood) => {
  let s = '';
  if (mood === 'pvp') s = '<path class="human-red" d="M3,2L15,12M15,2L3,12"/>';
  else for (let i = 0; i < 5; i++) { const x = 5.5 + i * 11, on = i < (RANK[mood] || 0); s += `<circle class="${on ? 'human-on' : 'human-of'}" cx="${x}" cy="7" r="4.200"/>${on ? `<circle class="human-ob" cx="${x}" cy="7" r="1.300"/>` : ''}`; }
  return `<svg xmlns="${NS}" width="${mood === 'pvp' ? 18 : 55}" height="14" viewBox="0 0 ${mood === 'pvp' ? 18 : 55} 14">${s}</svg>`;
};

let reduced = false, paceOf = () => 1;

// ---- the small life in her: blinks, glances, a brow; one piece of business per mood ----
const liven = (R: RigBalloon) => {
  const q = R.q, qa = R.qa, ck = kit.clock(), later = ck.later, rnd = Math.random;
  const nod = q('.human-nod'), look = q('.human-look'), lids = qa('.human-bl'), pgs = qa('.human-pg'), brows = [q('.human-bL'), q('.human-bR')];
  const coal = q('.human-coalg'), pl = q('.human-plait'), sk = q('.human-skin');
  const pw = { great: q('.human-mugw'), superb: q('.human-cupw'), pvp: q('.human-swordw'), achievement: q('.human-garlw') };
  let gaze: readonly [number, number] = [0, 0], ga: Animation[] = [], la: Animation | null = null, hot = true;
  const bob = (el: Part | null, to: string, ms: number, o: KeyframeAnimationOptions & { at?: number } = {}) => el && el.animate([{ transform: 'none' }, { transform: to, offset: o.at ?? .4 }, { transform: 'none' }], { duration: ms, easing: 'ease-in-out', composite: 'add', ...o });
  const blink = () => {
    const slow = R.mood === 'meh' || R.mood === 'death';
    const go = () => lids.forEach((l) => l.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(8.5px)', offset: .42 }, { transform: 'translateY(0)' }], { duration: slow ? 650 : 150, easing: 'ease-in-out' }));
    go(); if (!slow && rnd() < .25) later(go, 260);
    later(blink, (slow ? 2800 : 1700) + rnd() * 3600);
  };
  const lookAt = (x: number, y: number, ms = 170) => {
    if (reduced) return;
    const from = gaze; gaze = [x, y];
    const old = ga, oldL = la;
    ga = pgs.map((p) => p.animate([{ transform: `translate(${from[0]}px,${from[1]}px)` }, { transform: `translate(${x}px,${y}px)` }], { duration: ms, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'forwards' }));
    la = look.animate([{ transform: `translate(${from[0] * .25}px,${from[1] * .2}px) rotate(${from[0] * .5}deg)` }, { transform: `translate(${x * .25}px,${y * .2}px) rotate(${x * .5}deg)` }], { duration: 520, delay: 50, easing: 'cubic-bezier(.3,.6,.3,1)', fill: 'both' });
    old.forEach((a) => a.cancel()); if (oldL) oldL.cancel();
  };
  const glance = () => {
    if (R.mood !== 'death' && R.root.classList.contains('rig-at') && !R.root.classList.contains('rig-off')) {
      const r = rnd(), p = PROP[R.mood] || [0, 0];
      if (R.mood === 'calibrating') lookAt(r < .5 ? 2.3 : r < .8 ? -2.3 : 1, r < .8 ? -.3 : .3, 260);  // she scans the land
      else if (r < .3) lookAt(rnd() - .5, 1.7);          // down at the board
      else if (r < .55) lookAt(0, 0);                    // at you
      else if (r < .66) lookAt(rnd() * 1.4 - .7, -1.7);  // up at the envelope
      else if (r < .84) lookAt(p[0], p[1]);              // at what she holds
      else lookAt(rnd() < .5 ? -2.4 : 2.4, -.2);         // out over the land
    }
    later(glance, 1100 + rnd() * 2600);
  };
  const brow = () => {
    if (R.mood !== 'death') { const i = rnd() < .5 ? 0 : 1; bob(brows[i]!, 'translateY(-1.6px)', 340); if (rnd() < .4) bob(brows[1 - i]!, 'translateY(-1.3px)', 340, { delay: 60 }); }
    later(brow, 2400 + rnd() * 3600);
  };
  if (!reduced) { lookAt(.3, -1.7, 1); later(blink, 500 + rnd() * 1800); later(glance, 900 + rnd() * 1200); later(brow, 1500 + rnd() * 2500); }
  // one small piece of business on arriving, by mood
  const biz = (mood: Mood) => {
    if (reduced) return;
    const d = 1 / paceOf(), T = (s: string): Keyframe => ({ transform: s });
    const nd = (kf: Keyframe[], ms: number, delay = 0, o: KeyframeAnimationOptions = {}) => nod.animate(kf, { duration: ms * d, delay: delay * d, easing: 'ease-in-out', ...o });
    const lift = (el: Part | null, ms = 900, delay = 300) => el && el.animate([T('none'), { ...T('translateY(-3px) rotate(-3deg)'), offset: .4 }, { ...T('translateY(-2.4px) rotate(-2deg)'), offset: .7 }, T('none')], { duration: ms * d, delay: delay * d, easing: 'ease-in-out' });
    if (mood === 'calibrating') { lookAt(2.3, -.3, 300); nd([T('none'), { ...T('rotate(2.5deg)'), offset: .3 }, { ...T('rotate(2deg)'), offset: .7 }, T('none')], 2200, 300); }
    if (mood === 'poor') { lookAt(.5, -1.7, 400); nd([T('none'), { ...T('translateY(-.8px)'), offset: .3 }, { ...T('translateY(1.6px) rotate(1deg)'), offset: .7 }, T('translateY(1px)')], 1400, 400, { fill: 'forwards' }); later(() => lookAt(0, 1.2, 500), 1800 * d); }
    if (mood === 'meh') { lookAt(-1.6, .2, 300); nd([T('none'), { ...T('translateY(-.6px)'), offset: .35 }, T('translateY(.8px) rotate(.8deg)')], 1500, 500, { fill: 'forwards' }); }
    if (mood === 'good') { lookAt(0, 1.7); nd([T('none'), { ...T('translateY(2px) rotate(1deg)'), offset: .35 }, { ...T('translateY(-.4px)'), offset: .7 }, T('none')], 520, 450); later(() => lookAt(0, 0), 1000 * d); }
    if (mood === 'great') { lookAt(0, 1.7); later(() => lookAt(0, 0), 600 * d); lift(pw.great); nd([T('none'), { ...T('translateY(-1px) rotate(-1.5deg)'), offset: .4 }, T('none')], 900, 300); }
    if (mood === 'superb') { lookAt(0, 0); lift(pw.superb, 1100, 250); nd([T('none'), { ...T('translateY(-1.4px) rotate(-2deg)'), offset: .25 }, { ...T('translateY(.4px) rotate(1deg)'), offset: .5 }, { ...T('translateY(-1px) rotate(-1.5deg)'), offset: .75 }, T('none')], 1400, 200); }
    if (mood === 'pvp') { lookAt(0, 0); pw.pvp && pw.pvp.animate([T('none'), { ...T('translateY(-2.5px) rotate(-2deg)'), offset: .35 }, { ...T('translateY(.6px)'), offset: .7 }, T('none')], { duration: 700 * d, delay: 250 * d, easing: 'ease-in-out' }); nd([T('none'), { ...T('translateY(1px) rotate(1deg)'), offset: .4 }, T('none')], 650, 250); }
    if (mood === 'levelup') { lookAt(0, .6, 300); nd([T('none'), { ...T('translateY(1.6px) rotate(1deg)'), offset: .45 }, T('translateY(.4px)')], 1300, 300, { fill: 'forwards' }); later(() => lookAt(0, 0, 300), 1900 * d); }
    if (mood === 'achievement') { lookAt(0, 0); lift(pw.achievement, 1000, 250); nd([T('none'), { ...T('translateY(-1.4px)'), offset: .4 }, T('translateY(-.4px)')], 900, 250, { fill: 'forwards' }); }
  };
  const calm = () => nod.getAnimations().forEach((a) => a.cancel());
  return {
    arrive: biz,
    changed(mood: Mood) { calm(); biz(mood); },
    struck() { lookAt(0, 1.7, 140); },
    leave() { if (R.mood !== 'death') lookAt(.3, -1.7, 260); },
    // every frame: the embers follow burn; her plait and the waterskin dangle
    frame(i: FrameInfo) {
      const b = i.burn;
      coal.style.opacity = (.2 + .8 * b).toFixed(2);
      pl.style.transform = `rotate(${(i.hang * .5).toFixed(2)}deg)`;
      sk.style.transform = `rotate(${(i.hang * 1.2 + Math.sin(i.now * .0019) * 1.4).toFixed(2)}deg)`;
      // she looks up at her fire when it roars
      if (b > .62 && !hot) { hot = true; if (R.mood !== 'death') lookAt(.3, -1.8, 220); } else if (b < .35) hot = false;
    },
    stop: ck.stop,
  };
};

export const passenger: PassengerDef = {
  id: 'human',
  name: 'The Woman',
  // blurb: 'A rider of the North in a moss wool cloak and a leather jerkin, her hair in braids, a spear beside her and a shield slung on the wicker. Men make their balloons of cloth: the envelope says how good the kill was, from patched sackcloth sewn with twine to a king’s banner with the white horse, gold braid and pennons. An iron fire-basket burns under the mouth, and the news hangs below on a painted inn board.',
  spec(ctx: RigCtx): RigSpec {
    reduced = ctx.reduced; paceOf = ctx.pace;
    return {
      id: 'human', css: CSS, defs,
      envelope: (mood) => ENV[mood] || ENV.calibrating,
      ropes: { kind: 'rope', dark: '#2a1d12', light: '#c9b07c', w: 1.6 },
      burner,
      basket,
      behind: (u) => `${spear(u)}
<div class="human-lift"><div class="human-br">${body(u)}<div class="human-nw"><div class="human-look"><div class="human-nod">${head(u)}${tears()}</div></div></div>${plait(u)}${props(u)}</div></div>`,
      front: (u) => `${hands(u)}${waterskin(u)}`,
      sign: { w: SW, hx: HX, k: 12, c: 1.8, cord: { kind: 'rope', dark: '#2a1d12', light: '#c9b07c', w: 1.5 }, board, pips },
      life: liven,
    };
  },
};
