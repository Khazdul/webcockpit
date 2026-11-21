// Stage 75 (ADR 0159 round 3): a PORT of the approved mockup's numenorean,
// notes/research/balloons/round5/skins/numenorean.js, on the shared rig
// (../rig.ts). Geometry, markup, CSS and timings are the mockup's; only
// the types and the module shape (no harness: `passenger.spec(ctx)` is the
// mockup's `create(ctx)`) are new. Its own lazy chunk (../passenger.ts).
//
// Round 5: "The Black Númenórean", built on the shared rig (rig.js). A King's
// Man of Umbar, tall and cold, in Sauron's service: he flies under the sail of
// a black ship, with a censer of pale fire for a burner, and his sorcery is in
// his hands (a staff with a dim stone, a cold light in the palm, a dark orb).
//
// THE BLACK NÚMENÓREANS' VOCABULARY (decided before drawing; rule 2 of the brief)
//   Materials  sailcloth in narrow gores (they are sea-kings: an envelope is a
//              sail), then dyed silk; blackened and tarnished silver, old gold;
//              black lacquered wood; crimson silk cords and linings.
//   Motifs     the sea-kings' emblems turned dark: the ECLIPSED SUN (a black
//              disc with a thin lit rim and rays), the black ship under sail,
//              curling waves, the tall crown, the serpent, and bands of tall
//              angular letters. Nothing crude: no skulls, no scrap, no spikes
//              of iron. Everything is fine work, however sinister.
//   Colours    salt-grey and tanbark for the worthless; sea-teal; imperial
//              purple with silver; black silk with crimson and gold for the best.
//   "The best" means IMPERIAL: flawless black silk, crimson lining, gold and
//              silver embroidery, a crowned finial and long banners.
//
// THE ENVELOPE LADDER (silhouette and colour both change)
//   poor    the sail of a wrecked ship: sagging, lopsided, dented; salt-faded
//           grey, tide marks, moth holes, a sewn tear, odd patches, the emblem
//           worn to a ghost
//   meh     plain tanbark sailcloth (red-brown), a little slack, one bolt-rope,
//           no ornament
//   good    sound and full: dark sea-teal, a tarnished silver band with a wave
//           line, the black ship in a silver roundel, a silver knob
//   great   fine: imperial purple, a silver band of letters, a black band of
//           silver waves, the eclipsed sun under a crown, a silver spire
//   superb  brand new: black silk with gold seams, a crimson band with a gold
//           serpent-wave, gold letters, a great crowned sun, a dagged skirt of
//           crimson and gold, a tall crown on top and two long banners
// THE SPECIALS (none can be taken for a rating step)
//   unrated      pale unbleached canvas marked up in charcoal as a star chart
//                (a compass rose, dashed meridians, a scale)
//   player kill  blood red with a black band and a silver serpent, blade-like
//                vanes that break the outline, black dags round the mouth
//   level up     midnight indigo with a gold sun rising over a gold band, its
//                rays filling the upper half, the sun's rim lit
//   death        ash grey, half let down, a black crape sash with a hanging
//                black banner, the sun wholly dark; the fire burns pale blue
//   achievement  cloth of old gold with black letter bands and a black seal
//                (the ship) with crimson ribbons
//
// The flame is tinted through the rig's variables (--rig-f1/f2/gl): a pale
// corpse-light green, red for a player kill, pale blue for a death.

import type { Mood } from '../feed';
import { INK, K, kit, type BoardArgs, type EnvGeo, type EnvSpec, type FrameInfo, type PassengerDef, type Pt2, type RigBalloon, type RigCtx, type RigSpec, type Part } from '../rig';

const { n, S, SL, Z, G, ink2, NS, pp } = kit, HP = kit.P, HQ = kit.Q;
const { W, CX, HG, FY, RY, BY } = K;
// the head is drawn in units of half a pixel about the eye line
const HS = .56, HY = 199;
const SK = '#cfc6aa', GOLD = '#c9a85c', SILV = '#b4b8bd', CRIM = '#8a1f26', BLK = '#1b181e';

// ---- moods: how the face, the head-dress and the hands are held ----
/** A pose: CSS variables by name. */
type Pose = Readonly<Record<string, number>>;
const DEF: Pose = { rise: 0, tilt: 0, lid: 2.2, low: 0, bly: 0, blr: 0, bry: 0, brr: 0, sm: 0, dn: 0, gs: 0, lf: 0, lit: 0, hood: 0, crown: 0, sy: 0, sg: .45, orb: 0, ring: 0, palm: 0, fs: 1, sword: 0, scroll: 0, fist: 0, eg: 0 };
const M: Readonly<Record<string, Pose>> = {
  calibrating: { orb: 1, bry: -3, brr: 6, lid: 1.8, sg: .3 },
  poor: { rise: -2, tilt: 1.5, lid: 3.9, dn: 1, bly: 1, bry: 1, blr: 6, brr: -6, sg: .08 },
  meh: { lid: 3.5, ring: 1, bry: -2, sg: .25 },
  good: { sm: 1, palm: 1, fs: .55, sg: .45 },
  great: { rise: 1, gs: 1, palm: 1, fs: 1.3, lit: .5, sg: .75, bly: -1.8, bry: -2.4, lid: 2, low: .8 },
  superb: { rise: 1, tilt: -3, lf: 1, palm: 1, fs: 2.15, lit: 1, sg: 1, crown: 1, bly: -3, bry: -3.6, blr: 4, brr: -4, lid: 2.4, low: 2 },
  pvp: { rise: 1, sword: 1, lid: 3.3, low: 1.2, bly: 1.6, bry: 1.6, blr: 11, brr: -11, sm: 1, sg: .85 },
  levelup: { rise: 2, tilt: -2, fist: 1, sy: 1, sg: 1, lid: 2.7, sm: 1, bly: -1.5, bry: -1.5, eg: .3 },
  death: { rise: -4, tilt: -5, hood: 1, lid: 6.3, dn: 1, sg: 0, bly: -1, bry: -1, blr: -9, brr: 9 },
  achievement: { rise: 1, scroll: 1, sm: 1, sg: .6, lid: 2.6 },
};
// where the thing he holds is, for his glances (pupil units)
const PROP: Readonly<Record<string, readonly [number, number]>> = { calibrating: [2.2, 1.8], poor: [.3, -2], meh: [2.3, 1.6], good: [2.3, 1.6], great: [2.3, .8], superb: [2.4, -.4], pvp: [2.2, -.6], levelup: [-2.4, -1.6], achievement: [2.2, 1.4] };
const RANK: Readonly<Record<string, number>> = { poor: 1, meh: 2, good: 3, great: 4, superb: 5 };
const vars = (o: Pose) => Object.keys(o).filter((k) => k in DEF).map((k) => `--${k}:${o[k]}`).join(';');
const show = (...names: string[]) => names.map((nm) => `.num-${nm}{--x:var(--${nm})}`).join('');

const CSS = `
.num-v{${vars(DEF)};--coal:#7fd596;--go:.9;--nf1:#58b877;--nf2:#efffe0;--sc:#8fd6a6;--scg:150,240,180;--ec:170,255,200;--rig-f1:#58b877;--rig-f2:#efffe0;--rig-gl:150,235,170}
${Object.keys(M).map((m) => `.num-v[data-mood=${m}]{${vars(M[m]!)}}`).join('\n')}
.num-v .rig-f1{stroke:rgba(20,70,44,.7)}
.num-v[data-mood=pvp]{--rig-f1:#c8281e;--rig-f2:#ffd0a8;--rig-gl:255,110,80;--coal:#f0563c;--sc:#e0503c;--scg:255,110,90;--ec:255,120,90}
.num-v[data-mood=pvp] .rig-f1{stroke:rgba(90,10,10,.75)}
.num-v[data-mood=death]{--rig-f1:#7f8fc4;--rig-f2:#e6ecff;--rig-gl:140,160,235;--coal:#8fa0d0;--sc:#59606c}
.num-v[data-mood=death] .rig-f1{stroke:rgba(30,40,90,.7)}
.num-v[data-mood=poor]{--rig-f1:#5f9a6c;--coal:#5f9a6c;--sc:#5d7a68}
.num-v[data-mood=superb],.num-v[data-mood=levelup]{--rig-gl:190,245,170;--sc:#c4f4cc}
.num-v[data-sky=dusk]{--go:.7}.num-v[data-sky=day]{--go:.4}.num-v[data-sky=overcast]{--go:.5}
.num-v[data-mood=poor] .rig-envb{animation:num-heave 3.6s ease-in-out infinite alternate}
.num-slit{fill:var(--coal)}.num-coal{fill:var(--coal)}
.num-coalg{width:36px;height:18px;margin:-9px 0 0 -18px;border-radius:50%;opacity:.3;will-change:opacity;background:radial-gradient(closest-side,rgba(var(--rig-gl),.8),rgba(var(--rig-gl),0))}
.num-lift,.num-br,.num-look,.num-nod{position:absolute;left:0;top:0;width:${W}px;height:0;transform-origin:${CX}px ${RY + 8}px}
.num-lift{transform:translateY(calc(var(--rise)*-1px)) rotate(calc(var(--tilt)*1deg));transition:transform calc(.6s*var(--k)) cubic-bezier(.3,1.1,.5,1)}
.num-br{animation:num-br 5.2s ease-in-out infinite alternate}
.num-head{left:${CX - 100 * HS}px;top:${HY - 75 * HS}px}
.num-bL{transform:translateY(calc(var(--bly)*1px)) rotate(calc(var(--blr)*1deg))}
.num-bR{transform:translateY(calc(var(--bry)*1px)) rotate(calc(var(--brr)*1deg))}
.num-bL,.num-bR,.num-lid,.num-low{transition:transform calc(.4s*var(--k)) ease-out}
.num-lid{transform:translateY(calc(var(--lid)*1px));fill:#a39a86;stroke:${INK};stroke-width:1.1}
.num-low{transform:translateY(calc(var(--low)*-1px));fill:#b3aa93;stroke:${INK};stroke-width:.9}
.num-msm,.num-mfl,.num-mdn,.num-mgs,.num-mlf,.num-lit2,.num-hood,.num-helm,.num-crown{transition:opacity calc(.3s*var(--k))}
.num-msm{opacity:var(--sm)}.num-mdn{opacity:var(--dn)}.num-mfl{opacity:calc(1 - var(--sm) - var(--dn) - var(--gs) - var(--lf))}.num-mgs{opacity:var(--gs)}.num-mlf{opacity:var(--lf)}.num-lit2{opacity:calc(var(--lit)*(.45 + .55*var(--go)));mix-blend-mode:screen}
.num-hood{opacity:var(--hood)}.num-helm{opacity:calc(1 - var(--hood))}.num-crown{opacity:var(--crown)}
.num-eg{width:9px;height:7px;margin:-3.5px 0 0 -4.5px;border-radius:50%;opacity:var(--eg);mix-blend-mode:screen;background:radial-gradient(closest-side,rgba(var(--ec),.95),rgba(var(--ec),.5) 45%,rgba(var(--ec),0))}
.num-p{position:absolute;left:0;top:0;width:${W}px;height:0;opacity:var(--x);transform:translateY(calc((1 - var(--x))*22px));transition:transform calc(.5s*var(--k)) cubic-bezier(.3,1.15,.5,1),opacity calc(.14s*var(--k))}
${show('orb', 'ring', 'palm', 'sword', 'scroll', 'fist')}
.num-staffw{position:absolute;left:0;top:0;width:${W}px;height:0;transform:translateY(calc(var(--sy)*-4px));transition:transform calc(.5s*var(--k)) ease-out}
.num-stone{fill:var(--sc)}
.num-sgl{width:30px;height:30px;margin:-15px 0 0 -15px;opacity:calc(var(--sg)*var(--go)*.8);transition:opacity .5s}
.num-sgl::before{content:"";position:absolute;inset:0;border-radius:50%;background:radial-gradient(closest-side,rgba(var(--scg),.7),rgba(var(--scg),.2) 45%,rgba(var(--scg),0));animation:num-pu 2.6s ease-in-out infinite alternate}
.num-pfs{transform:scale(calc(.35 + var(--fs)*.55),var(--fs));transform-origin:0 0;transition:transform calc(.4s*var(--k))}
.num-pfk{transform-origin:0 0;animation:num-fk .47s ease-in-out infinite alternate}
.num-pfk svg{left:-7px;top:-17px}
.num-pf1{fill:var(--nf1);stroke:rgba(20,70,44,.7);stroke-width:.7}.num-pf2{fill:var(--nf2)}
.num-pgl{position:absolute;left:-17px;top:-22px;width:34px;height:30px;border-radius:50%;opacity:calc(var(--go)*(.35 + var(--fs)*.3));background:radial-gradient(closest-side,rgba(var(--scg),.7),rgba(var(--scg),.25) 50%,rgba(var(--scg),0))}
.num-orbg{width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:radial-gradient(closest-side,rgba(190,255,215,.85),rgba(120,220,170,.3) 55%,rgba(120,220,170,0));animation:num-orb 3.4s ease-in-out infinite}
.num-glint{width:10px;height:10px;margin:-5px 0 0 -5px;animation:num-gl 3.1s ease-in-out infinite}
.num-glint svg{left:0;top:0}
.num-swr{will-change:transform}
.num-tas{will-change:transform}
.num-ban{transform-origin:0 0;animation:num-sway 3.9s ease-in-out infinite alternate}
.num-ban+.num-ban{animation-duration:4.6s;animation-direction:alternate-reverse}
.num-lit{animation:num-pu 1.7s ease-in-out infinite alternate;filter:drop-shadow(0 0 2.5px #ffd670) drop-shadow(0 0 6px rgba(255,200,90,.7))}
.num-tears{display:none}
.num-v[data-mood=death] .num-tears{display:block}
.num-tear{position:absolute;width:5px;height:13px;overflow:hidden}
.num-tear::before{content:"";position:absolute;left:1.9px;top:0;width:1.1px;height:11px;border-radius:1px;background:linear-gradient(rgba(200,216,232,.4),rgba(200,216,232,.06))}
.num-tear i{position:absolute;left:1.2px;top:-3px;width:2.6px;height:3.5px;border-radius:50% 50% 50% 50%/62% 62% 38% 38%;background:radial-gradient(circle at 35% 35%,rgba(238,245,250,.9),rgba(172,198,222,.72) 55%,rgba(116,150,190,.66));box-shadow:0 0 0 .5px rgba(24,30,50,.28);transform:translateY(var(--r));animation:num-tear 5.8s cubic-bezier(.4,0,.7,.7) infinite;animation-delay:var(--dl)}
@keyframes num-tear{0%{transform:translateY(0) scale(.5);opacity:0}12%{transform:translateY(1.5px) scale(1);opacity:.6}75%{opacity:.6}100%{transform:translateY(13px) scale(.9);opacity:0}}
@keyframes num-heave{from{transform:scale(1,1) skewX(0)}to{transform:scale(1.02,.965) skewX(1.2deg)}}
@keyframes num-br{from{transform:translateY(.4px) scale(1,.997)}to{transform:translateY(-.7px) scale(1,1.004)}}
@keyframes num-pu{from{opacity:.6}to{opacity:1}}
@keyframes num-fk{0%{transform:scale(1,1) skewX(0)}45%{transform:scale(.92,1.07) skewX(4deg)}100%{transform:scale(1.05,.94) skewX(-4deg)}}
@keyframes num-orb{0%,100%{opacity:.25;transform:translate(-1px,1px)}50%{opacity:.9;transform:translate(1.5px,-1px)}}
@keyframes num-gl{0%,64%,100%{opacity:0;transform:scale(.4) rotate(0)}76%{opacity:1;transform:scale(1) rotate(20deg)}88%{opacity:0;transform:scale(.5) rotate(40deg)}}
@keyframes num-sway{from{transform:rotate(-2.5deg)}to{transform:rotate(3deg)}}
.num-sign{filter:drop-shadow(0 2px 2.5px rgba(0,0,0,.45));--tx:#e9e3d3;--dim:#b7b0a2;--fg:#f1ead8;--on:#d9d4c6;--off:rgba(220,214,198,.26);color:var(--tx)}
.num-sign[data-mood=poor]{--tx:#cfc6b4;--fg:#cfc6b4;--dim:#a39a88;--on:#b08a66}
.num-sign[data-mood=good]{--fg:#e3f0ec;--on:#c9d6d4}
.num-sign[data-mood=great]{--fg:#efe6fa;--on:#e3dcef;--dim:#bfb4cc}
.num-sign[data-mood=superb]{--tx:#f8e9c4;--dim:#e0c690;--fg:#ffe08a;--on:#ffd76a}
.num-sign[data-mood=pvp]{--tx:#f1ddd4;--fg:#ff9a80;--on:#e8553c}
.num-sign[data-mood=levelup]{--fg:#ffe7a0}
.num-sign[data-mood=death]{--tx:#c5c3c9;--fg:#d0ced6}
.num-sign[data-mood=achievement]{--tx:#f2e8cc;--dim:#d2c49c}
.num-sign .rig-text{padding:9px 11px 7px}
.num-sign .rig-title,.num-sign .rig-fig{text-shadow:0 -1px 0 rgba(0,0,0,.6)}
.num-sign .rig-fig{color:var(--fg)}
.num-sign[data-mood=superb] .rig-fig{font-weight:700}
.num-sign .rig-unit,.num-sign .rig-q,.num-sign .rig-more{color:var(--dim)}
.num-on{fill:var(--on);stroke:rgba(0,0,0,.6);stroke-width:.7}.num-of{fill:none;stroke:var(--off);stroke-width:1}
.num-red{fill:#e8553c;stroke:rgba(0,0,0,.6);stroke-width:.6}
.num-sign[data-kind=levelup] .rig-text{padding:14px 8px 12px}
.num-sign[data-kind=levelup] .rig-fig{font:700 21px/1.1 Cinzel,Georgia,serif;letter-spacing:.04em}
.num-sign[data-kind=death] .rig-text{padding:14px 8px 12px}
.num-sign[data-kind=death] .rig-fig{font:400 21px/1.15 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.17em;margin-right:-.17em;text-transform:lowercase;font-variant:small-caps}
.num-sign[data-kind=achievement] .rig-title{font:italic 600 13.5px/1.1 "Cormorant Garamond",Georgia,serif}
`;

// ---- the shared emblems ----
// the eclipsed sun: a dark disc, a thin lit rim, a sliver of light on one side, rays
const sun = (r: number, disc: string, cor: string, rays = 16) => {
  let d = '';
  for (let i = 0; i < rays; i++) { const a = i * 2 * Math.PI / rays, r0 = r + 2.2, r1 = r + (i % 2 ? 4.5 : 7.5); d += `M${n(Math.sin(a) * r0)},${n(-Math.cos(a) * r0)}L${n(Math.sin(a) * r1)},${n(-Math.cos(a) * r1)}`; }
  return `${rays ? `<path d="${d}" fill="none" stroke-width="2.3"/><path d="${d}" fill="none" stroke="${cor}" stroke-width="1.1"/>` : ''}<circle r="${n(r + .6)}" fill="${cor}" stroke-width=".9"/><circle r="${n(r - .7)}" fill="${disc}" stroke-width=".5"/><path d="M${n(r * .42)},${n(-r * .68)}A${n(r * .8)},${n(r * .8)} 0 0 1 ${n(r * .42)},${n(r * .68)}A${n(r * 1.3)},${n(r * 1.3)} 0 0 0 ${n(r * .42)},${n(-r * .68)}Z" fill="${cor}" stroke="none" opacity=".85"/>`;
};
// the black ship: a high-prowed hull, one square sail
const ship = (fill: string, sw = .8) => `<path d="M-11,5Q0,10 10,5L14,-2Q12,3 0,5Q-9,5 -13,1Z" fill="${fill}" stroke-width="${sw}"/><path d="M0,5V-12" fill="none" stroke="${fill}" stroke-width="1.300"/><path d="M-7.500,-10.500Q0,-8 7.500,-10.500L6.500,1Q0,3.500 -6.500,1Z" fill="${fill}" stroke-width="${sw}"/>`;
const crown = (fill: string, sw = .8) => `<path d="M-9,5L-10,-3L-6,0L-4,-8L-1.500,-1L0,-11L1.500,-1L4,-8L6,0L10,-3L9,5Z" fill="${fill}" stroke-width="${sw}"/><path d="M-8.500,2.300H8.500" fill="none" stroke-width=".5"/>`;
// tall angular letters of their own
const LET = ['M0,-5V5M0,-5L3,-2M0,0L-3,3', 'M-2,-5V5M2,-5V5M-2,-5L2,-1', 'M0,-5V5M-3,-5H3M0,1L3,4', 'M-2,5V-5L2,-2V5', 'M0,-5V5M-3,-2L0,-5L3,-2M-2,5H2', 'M-2,-5V5M-2,0L2,-3V5', 'M0,-5V2M-3,-1L0,2L3,-1M0,4.200V5', 'M-2,-5V5M-2,0H2M2,-5V5M-2,-5H0'];

// ---- the man: head, helm or hood, shoulders (units of half a pixel about the eye line) ----
const ALM = 'M-7.5,0Q0,-6 7.5,0Q0,4.4 -7.5,0Z';
const eye = (s: number, u: number) => `<g transform="translate(${13.5 * s},0)"><ellipse cy="-.5" rx="10.5" ry="7" fill="#33242f" opacity=".42"/><ellipse cy="-.5" rx="10.500" ry="7" fill="url(#nmp${u})" opacity=".8"/>
<g clip-path="url(#nmc${u})"><path d="${ALM}" fill="#dcd8c8"/><path d="M-9,-6H9V-1.200H-9Z" fill="#2c2028" opacity=".4"/>
<g class="num-pm"><g class="num-pg"><circle r="3.300" fill="#4d6f66" stroke="#141012" stroke-width="1"/><circle r="2.300" fill="none" stroke="#9cc2b4" stroke-width=".6" opacity=".7"/><circle r="1.500" fill="#0a0808"/><circle cx="-1" cy="-1.100" r=".8" fill="#fff"/></g></g>
<g class="num-bl"><path class="num-lid" d="M-10,-18H10V-4.600Q0,-3 -10,-4.600Z"/></g><path class="num-low" d="M-10,14H10V4.600Q0,3.800 -10,4.600Z"/></g>
<path d="${ALM}" fill="none" stroke="${INK}" stroke-width=".8"/><path d="M-8.200,.5Q0,-6.800 8.200,.3" fill="none" stroke="${INK}" stroke-width="1.700" stroke-linecap="round"/>
<path d="M${7.5 * s},-.5l${3 * s},-2M${-7 * s},4.500q${6 * s},3.500 ${13 * s},0M${-5 * s},7q${5 * s},2.500 ${10 * s},.3" fill="none" stroke="${INK}" stroke-width=".6" stroke-linecap="round" opacity=".75"/></g>`;
const BROW = `<path d="M-10,2.500C-6,-3.500 4,-5.500 11,-1.500C5,-2.800 -3,-1.500 -8.500,3.500C-9.500,4 -10.500,3.500 -10,2.500Z" fill="#17131a" stroke="${INK}" stroke-width=".7" stroke-linejoin="round"/>`;
const head = (u: number) => `<svg class="rig-s num-head rig-rim" xmlns="${NS}" width="${200 * HS}" height="${215 * HS}" viewBox="-100 -75 200 215"><defs>${kit.filt('nmf' + u, { freq: .032, scale: 2.4, grain: .5 })}${kit.hatch('nmp' + u, 38, 4.8, .6, .95)}${kit.hatch('nmq' + u, -52, 5.4, .5, .95)}
<clipPath id="nmc${u}"><path d="${ALM}"/></clipPath>
<linearGradient id="nms${u}" x1="0" x2="1"><stop offset="0" stop-color="#958d7b"/><stop offset=".5" stop-color="#c9c0a5"/><stop offset="1" stop-color="#e6dfc7"/></linearGradient>
<linearGradient id="nmi${u}" x1="0" x2="1" y1="0" y2=".25"><stop offset="0" stop-color="#121116"/><stop offset=".55" stop-color="#2d2c36"/><stop offset="1" stop-color="#5b5c6b"/></linearGradient>
<linearGradient id="nmg${u}" x1="0" x2="1"><stop offset="0" stop-color="#5c4a22"/><stop offset=".6" stop-color="#a08442"/><stop offset="1" stop-color="#d2b56e"/></linearGradient>
<linearGradient id="nmr${u}" x1="0" x2="1"><stop offset="0" stop-color="#4f1016"/><stop offset="1" stop-color="#9a2a30"/></linearGradient>
<linearGradient id="nmb${u}" x1="0" x2="1"><stop offset="0" stop-color="#121014"/><stop offset=".6" stop-color="#211e26"/><stop offset="1" stop-color="#37333f"/></linearGradient>
<radialGradient id="nml${u}" gradientUnits="userSpaceOnUse" cx="62" cy="34" r="74"><stop offset="0" stop-color="#b4ffc8" stop-opacity=".75"/><stop offset=".5" stop-color="#7fe6a0" stop-opacity=".3"/><stop offset="1" stop-color="#7fe6a0" stop-opacity="0"/></radialGradient><clipPath id="nmx${u}"><path d="M0,-70L38,-50L50,72L74,90L74,140L0,140Z"/></clipPath><pattern id="nmm${u}" patternUnits="userSpaceOnUse" width="7" height="5"><path d="M0,2.500Q1.750,5.500 3.500,2.500Q5.250,-.5 7,2.500" fill="none" stroke="#0e0d10" stroke-width=".9" opacity=".8"/></pattern></defs>
<g filter="url(#nmf${u})" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">
<path d="M-27,64L-37,28L-20,44L-12,58ZM27,64L37,28L20,44L12,58Z" fill="url(#nmb${u})" stroke-width="2"/><path d="M-25,58L-33,36L-21,47ZM25,58L33,36L21,47Z" fill="url(#nmr${u})" stroke-width=".8"/>
<g transform="scale(.88,1)"><path d="M-82,140L-79,86C-77,71 -61,63 -39,59L-13,53L13,53L39,59C61,63 77,71 79,86L82,140Z" fill="url(#nmb${u})" stroke-width="2.200"/>
<path d="M-82,140L-79,86C-77,71 -61,63 -39,59L-30,57C-52,70 -58,96 -56,140Z" fill="url(#nmp${u})" stroke="none"/><path d="M-82,140L-79,86C-77,71 -66,65 -56,62C-68,74 -72,100 -71,140Z" fill="url(#nmq${u})" stroke="none"/>
<path d="M42,61C61,65 75,73 77,87L78,112" fill="none" stroke="#8a88a0" stroke-width="1.500" opacity=".75"/>
<path d="M-74,90C-72,76 -58,68 -42,64M74,90C72,76 58,68 42,64" fill="none" stroke="${GOLD}" stroke-width="1.300" stroke-dasharray="2.600 2.200" opacity=".9"/>
<path d="M-58,84C-56,98 -57,116 -60,138M60,84C58,98 58,116 61,138M-44,74C-45,94 -46,116 -48,138" fill="none" stroke-width=".8" opacity=".6"/>
<path d="M-13,55L13,55L22,140L-22,140Z" fill="#4a4d58" stroke-width="1.600"/><path d="M-13,55L13,55L22,140L-22,140Z" fill="url(#nmm${u})" stroke="none"/><path d="M-13,55L-3,55L-6,140L-22,140Z" fill="url(#nmp${u})" stroke="none"/>
<path d="M-13,54L-29,60L-38,140L-21,140Z" fill="url(#nmr${u})" stroke-width="1.600"/><path d="M13,54L29,60L38,140L21,140Z" fill="#9a2a30" stroke-width="1.600"/>
<path d="M-13,54L-29,60L-38,140L-31,140L-24,64Z" fill="url(#nmp${u})" stroke="none"/>
<path d="M-27,62L-35,138M27,62L35,138" fill="none" stroke="${GOLD}" stroke-width="1.600"/><path d="M-16,58L-23,138M16,58L23,138" fill="none" stroke="${GOLD}" stroke-width="1" stroke-dasharray="1.500 2.500"/>
<path d="M-31,66Q0,92 31,66" fill="none" stroke-width="3.400"/><path d="M-31,66Q0,92 31,66" fill="none" stroke="${GOLD}" stroke-width="1.800" stroke-dasharray="2.800 1.600" stroke-linecap="butt"/>
<g transform="translate(0,81)">${sun(5.5, '#121014', '#d6d9de', 0)}</g>
<g stroke-width=".9"><circle cx="-33" cy="65" r="5" fill="${SILV}"/><circle cx="-33" cy="65" r="2.400" fill="#a3262c"/><circle cx="33" cy="65" r="5" fill="#d4d7dc"/><circle cx="33" cy="65" r="2.400" fill="#c2372f"/></g></g>
<path d="M-31,-18C-42,-6 -44,20 -42,44C-41,56 -44,64 -49,72L-27,66C-26,50 -29,30 -28,8Z" fill="#131017" stroke-width="1.800"/>
<path d="M31,-18C42,-6 44,20 42,44C41,56 44,64 49,72L27,66C26,50 29,30 28,8Z" fill="#1e1a24" stroke-width="1.800"/>
<path d="M-37,-4C-40,16 -38,40 -42,62M-33,10C-34,30 -33,48 -36,64M39,2C41,22 39,44 43,64" fill="none" stroke-width=".7" opacity=".7"/>
<path d="M36,-6C40,14 38,38 41,58M33,14C34,32 33,48 35,62M-35,2C-37,22 -36,42 -39,58" fill="none" stroke="#6b6f88" stroke-width="1.300" opacity=".85"/>
<path d="M-11,38L-13,58Q0,66 13,58L11,38Z" fill="#a39a86" stroke-width="1.500"/><path d="M-11,38L-13,58Q-4,63 2,62L0,40Z" fill="url(#nmp${u})" stroke="none"/><path d="M-11,44Q0,54 11,44" fill="#2c2028" opacity=".35" stroke="none"/>
<path d="M-15,53Q0,63 15,53L13.500,59.500Q0,69 -13.500,59.500Z" fill="#6a6d78" stroke-width="1.300"/>
<path d="M-29,-26C-32,-10 -32,2 -30,10C-28,22 -22,34 -12,45Q0,53 12,45C22,34 28,22 30,10C32,2 32,-10 29,-26Z" fill="url(#nms${u})" stroke-width="2"/>
<path d="M-29,-26C-32,-10 -32,2 -30,10C-28,22 -22,34 -12,45L-7,48C-16,34 -20,18 -19,-26Z" fill="#33242f" opacity=".2" stroke="none"/>
<path d="M-29,-26C-32,-10 -32,2 -30,10C-28,22 -22,34 -12,45L-10,46C-19,34 -24,18 -23,-26Z" fill="url(#nmp${u})" stroke="none"/>
<path d="M-30,11C-25,15 -21,25 -16,39L-12,45C-22,34 -28,22 -30,11Z" fill="url(#nmq${u})" stroke="none"/>
<path d="M-28,11C-23,13 -19,18 -17,24M28,11C23,13 19,18 17,24" fill="none" stroke-width="1.100" opacity=".8"/>
<path d="M25,14C22,22 18,31 13,39M22,14C20,20 17,27 13,33M27,18C25,25 21,33 16,40" fill="none" stroke-width=".6" opacity=".6"/>
<ellipse cx="20" cy="9" rx="7" ry="3" fill="#f6efd8" opacity=".45" stroke="none"/>
<path d="M-30,-23Q0,-17 30,-23L30,-13Q0,-6 -30,-13Z" fill="#2c2028" opacity=".3" stroke="none"/>
<path d="M-9,24C-12,28 -13,32 -12,36M9,24C12,28 13,32 12,36M-4,45Q0,47 4,45M-1.500,27.500V31M1.500,27.500V31" fill="none" stroke-width=".7" opacity=".75"/>
<path d="M-2.600,-7C-3,6 -5,15 -6.500,20.500C-5.500,25 -1.500,26 0,25.300C1.500,26 5.500,25 6.500,20.500C5,15 3,6 2.600,-7Z" fill="#cbc2a8" stroke-width="1.300"/>
<path d="M-2.600,-7C-3,6 -5,15 -6.500,20.500C-5.500,25 -2,26 -1,25.300C-3,20 -2,8 -.5,-7Z" fill="url(#nmp${u})" stroke="none"/><path d="M1.500,2Q2.500,12 3.500,19" fill="none" stroke="#f6efd8" stroke-width="1.300" opacity=".7"/>
<path d="M-5.500,23.500q2,1.600 4,.4M5.500,23.500q-2,1.600 -4,.4" fill="none" stroke-width="1"/>
<g class="num-mfl"><path d="M-9,34.500Q-3,33.300 0,34.300Q3,33.300 9,34.300" fill="none" stroke-width="1.700"/><path d="M-5,37.500Q0,39 5,37.500" fill="none" stroke-width=".7" opacity=".7"/></g>
<g class="num-msm"><path d="M-9,35.500Q-3,34.300 0,35Q5,34.500 9.500,32.500Q11.500,31.500 12.500,29.500" fill="none" stroke-width="1.700"/><path d="M-5,38.300Q0,39.500 5,37.500M13.500,27.500Q15.500,30 13.500,33.500" fill="none" stroke-width=".7" opacity=".75"/></g>
<g class="num-mgs"><path d="M-12.500,31Q-10.500,35.500 -4,36.200Q0,36.800 4.500,36Q10.500,35 13,29.500" fill="none" stroke-width="1.900"/><path d="M-5,39.300Q0,40.800 5.500,39M-14.500,27.500Q-16.500,31 -14.800,34.500M15,26Q17.500,30 15.500,34.500" fill="none" stroke-width=".8" opacity=".8"/></g>
<g class="num-mlf"><path d="M-12.500,30.500Q0,33.500 13,29.500Q12,41.500 .5,43Q-10.500,42 -12.500,30.500Z" fill="#2a1016" stroke-width="1.600"/><path d="M-10.800,31.800Q0,34.800 11.500,30.800L10.600,34.200Q0,38 -9.800,35.300Z" fill="#ece7d6" stroke-width=".7"/><path d="M-5.500,33.600v2.900M-1.800,34.200v3M2,34.200v3M5.800,33.600v2.900" fill="none" stroke-width=".5" opacity=".7"/><path d="M-6,41Q0,38.500 6.500,40.800" fill="none" stroke="#8a3a40" stroke-width="1.300"/><path d="M-15,26.500Q-17.500,31 -15.500,36M15.500,25.500Q18.500,30 16,36M-5,46.500Q0,48 5,46.500" fill="none" stroke-width=".8" opacity=".8"/></g>
<g class="num-mdn"><path d="M-9.500,36.500Q-4,33.200 0,33.800Q4,33.200 9.500,36.500" fill="none" stroke-width="1.700"/><path d="M-4.500,37.800Q0,38.800 4.500,37.800M-11,37.500l-1.500,2.500M11,37.500l1.500,2.500" fill="none" stroke-width=".7" opacity=".7"/></g>
</g>
${eye(-1, u)}${eye(1, u)}
<g transform="translate(-14,-9.5)"><g class="num-bL"><g transform="scale(-1,1)">${BROW}</g></g></g><g transform="translate(14,-9.5)"><g class="num-bR">${BROW}</g></g>
<g class="num-helm"><g filter="url(#nmf${u})" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">
<path d="M-34,-16C-37,-42 -24,-55 -7,-60L0,-65L7,-60C24,-55 37,-42 34,-16Z" fill="url(#nmi${u})" stroke-width="2.400"/>
<path d="M-34,-16C-37,-42 -24,-55 -7,-60L-3,-62C-16,-54 -22,-40 -21,-16Z" fill="url(#nmp${u})" stroke="none"/><path d="M-34,-16C-37,-42 -24,-55 -16,-57C-26,-48 -30,-36 -29,-16Z" fill="url(#nmq${u})" stroke="none"/>
<path d="M13,-56C25,-51 32,-42 32,-28" fill="none" stroke="#a3a5ba" stroke-width="1.700" opacity=".7"/><path d="M-19,-26C-19,-44 -13,-55 -6,-61M19,-26C19,-44 13,-55 6,-61" fill="none" stroke-width=".9" opacity=".8"/>
<path d="M-3.600,-18C-4,-44 -2.600,-57 0,-66C2.600,-57 4,-44 3.600,-18Z" fill="#6a6c7c" stroke-width="1.500"/><path d="M1.200,-24C1.500,-42 1,-53 0,-60" fill="none" stroke="#d9dce6" stroke-width="1.100" opacity=".85"/>
<path d="M-35,-17L-37,10C-36,24 -31,34 -26,40L-23,31C-27,20 -28,6 -27,-13Z" fill="url(#nmi${u})" stroke-width="1.800"/><path d="M-35,-17L-37,10C-36,24 -31,34 -26,40L-28,24C-32,12 -32,-2 -31,-15Z" fill="url(#nmp${u})" stroke="none"/>
<path d="M35,-17L37,10C36,24 31,34 26,40L23,31C27,20 28,6 27,-13Z" fill="#4d4e5c" stroke-width="1.800"/><path d="M34,-8C35,8 33,22 28,33" fill="none" stroke="#b9bbcc" stroke-width="1.200" opacity=".7"/>
<g class="num-crown"><path d="M-31,-23L-28,-36L-22,-26L-14,-42L-7,-25L0,-48L7,-25L14,-42L22,-26L28,-36L31,-23Z" fill="url(#nmg${u})" stroke-width="1.600"/><path d="M-13,-30L-14,-38M13,-30L14,-38M0,-32V-43" fill="none" stroke="#fff3c4" stroke-width="1" opacity=".7"/></g>
<path d="M-36.500,-26Q0,-19 36.500,-26L36.500,-15Q0,-7.500 -36.500,-15Z" fill="url(#nmg${u})" stroke-width="2"/><path d="M-36.500,-26Q-20,-23 -14,-22.500L-14,-11Q-26,-12.500 -36.500,-15Z" fill="url(#nmp${u})" stroke="none"/>
<path d="M-30,-21.500v6M-25,-21v3M-21,-20.500v6.500M-16,-20v6M14,-20v6.500M18,-20.500l3,3v3.500M25,-21.500v6.500M30,-22v3" fill="none" stroke-width=".8" opacity=".8"/>
<path d="M0,-23.500L5.500,-15.500L0,-8L-5.500,-15.500Z" fill="#d2b56e" stroke-width="1.200"/><path d="M0,-20.500L3.300,-15.500L0,-11L-3.300,-15.500Z" fill="#a3262c" stroke-width=".7"/><path d="M-1.500,-16.500L0,-19" fill="none" stroke="#fff" stroke-width=".9" opacity=".8"/>
</g></g>
<g class="num-lit2" clip-path="url(#nmx${u})"><path d="M-29,-26C-32,-10 -32,2 -30,10C-28,22 -22,34 -12,45Q0,53 12,45C22,34 28,22 30,10C32,2 32,-10 29,-26ZM-34,-16C-37,-42 -24,-55 -7,-60L0,-65L7,-60C24,-55 37,-42 34,-16ZM31,-18C42,-6 44,20 42,44C41,56 44,64 49,72L27,66ZM-72,140L-70,86C-68,71 -54,63 -34,59L-11,53L11,53L34,59C54,63 68,71 70,86L72,140Z" fill="url(#nml${u})"/></g>
<g class="num-hood"><g filter="url(#nmf${u})" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">
<path d="M-23,-13Q0,-23 23,-13L31,16Q0,4 -31,16Z" fill="#0b090c" opacity=".5" stroke="none"/>
<path d="M-54,86C-58,40 -52,-34 -5,-61Q0,-64 5,-61C52,-34 58,40 54,86L33,72C40,32 35,-2 23,-13Q0,-24 -23,-13C-35,-2 -40,32 -33,72Z" fill="url(#nmb${u})" stroke-width="2.300"/>
<path d="M-54,86C-58,40 -52,-34 -5,-61C-34,-34 -44,20 -42,78Z" fill="url(#nmp${u})" stroke="none"/><path d="M-54,86C-58,40 -52,-34 -22,-50C-44,-24 -50,30 -49,82Z" fill="url(#nmq${u})" stroke="none"/>
<path d="M12,-56C46,-32 54,30 51,78" fill="none" stroke="#8a88a0" stroke-width="1.500" opacity=".7"/>
<path d="M-12,-52C-32,-34 -40,-8 -40,24M30,-34C40,-14 44,14 42,44M-46,30C-47,48 -46,64 -47,78M0,-58C-10,-44 -16,-30 -18,-18" fill="none" stroke-width=".8" opacity=".6"/>
<path d="M-23,-13Q0,-24 23,-13" fill="none" stroke="${CRIM}" stroke-width="1.400" opacity=".9"/>
</g></g>
</svg>`;

// ---- what he holds: a forearm in a wide black sleeve, crimson-lined, rises from behind the rim ----
const sleeve = (u: number, ex: number, ey: number, hx: number, hy: number, w = 7.5) => {
  const dx = hx - ex, dy = hy - ey, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L, a = w / 2 + 3, b = w / 2;
  const at = (f: number, o: number) => `${n(ex + dx * f + nx * o)},${n(ey + dy * f + ny * o)}`;
  return `<path d="M${at(0, a)}L${at(1, b + 1)}L${at(1, -b - 1)}L${at(0, -a)}Z" fill="#221f27" stroke-width="1"/><path d="M${at(0, -a)}L${at(1, -b - 1)}L${at(1, -b * .1)}L${at(0, -a * .2)}Z" fill="${HP(u)}" stroke="none"/><path d="M${at(.1, a * .85)}L${at(.92, b + .6)}" fill="none" stroke="#7d7b92" stroke-width=".7" opacity=".8"/><path d="M${at(.4, a * .3)}L${at(.85, b * .1)}" fill="none" stroke-width=".5" opacity=".6"/><path d="M${at(.84, b + 1.5)}L${at(1, b + 1.4)}L${at(1, -b - 1.4)}L${at(.84, -b - 1.5)}Z" fill="${CRIM}" stroke-width=".8"/><path d="M${at(.84, b + 1.5)}L${at(.84, -b - 1.5)}" fill="none" stroke="${GOLD}" stroke-width=".9"/>`;
};
const fist = (x: number, y: number, r = 4.4) => `<path d="M${x - r},${y}C${x - r},${n(y - r * 1.15)} ${x + r},${n(y - r * 1.15)} ${x + r},${y}C${x + r},${n(y + r * .9)} ${x - r},${n(y + r * .9)} ${x - r},${y}Z" fill="${SK}" stroke-width="1"/><path d="M${x - r},${y}C${x - r},${n(y - r * 1.15)} ${n(x - r * .2)},${n(y - r)} ${n(x - r * .3)},${n(y - r * .5)}C${n(x - r * .6)},${n(y + r * .5)} ${n(x - r * .7)},${n(y + r * .6)} ${x - r},${y}Z" fill="#33242f" opacity=".28" stroke="none"/><path d="M${n(x - r * .5)},${n(y - r * .78)}v${n(r * .75)}M${x},${n(y - r * .86)}v${n(r * .8)}M${n(x + r * .5)},${n(y - r * .78)}v${n(r * .75)}" fill="none" stroke-width=".5"/>`;
// an open hand, palm up, slightly cupped: long fingers to one side, the thumb to the other
const palmUp = (x: number, y: number) => `<path d="M${x - 6.5},${y - 1.5}C${x - 7.5},${y + 3.5} ${x + 6},${y + 4} ${x + 7.5},${y - 1}C${x + 8.5},${y - 4} ${x + 6},${y - 4.5} ${x + 5},${y - 2}Q${x},${y + .5} ${x - 4},${y - 1.5}C${x - 4.5},${y - 4} ${x - 6.5},${y - 4} ${x - 6.5},${y - 1.500}Z" fill="${SK}" stroke-width="1"/><path d="M${x - 6.5},${y - 1.5}C${x - 7.5},${y + 3.5} ${x},${y + 3.8} ${x + 2},${y + 3.200}Q${x - 3},${y + 1.5} ${x - 4},${y - 1.500}Z" fill="#33242f" opacity=".25" stroke="none"/><path d="M${x + 3},${y - .8}l2.500,2.200M${x + 5},${y - 1.800}l2,1.800M${x + 1},${y - .2}l2,2.400" fill="none" stroke-width=".5" opacity=".8"/>`;
const PR = (cls: string, u: number, x: number, y: number, body: string, more = '') => `<div class="num-p ${cls}">${S('rig-rim', x, y, 50, RY - y + 8, G(u, body))}${more}</div>`;
const props = (u: number) => {
  const E = RY + 4, X = 40;
  // the dark orb he gazes into (unrated)
  return PR('num-orb', u, 20, 204, `${sleeve(u, 36, E, X, 235)}${palmUp(X, 231)}<circle cx="${X}" cy="222" r="7.500" fill="#17131f" stroke-width="1.200"/><path d="M${X - 5.5},222a5.500,5.500 0 0 0 5.500,5.500" fill="none" stroke="#3d3a52" stroke-width="1.200"/><circle cx="${X}" cy="222" r="7.500" fill="${HP(u)}" stroke="none" opacity=".5"/><path d="M${X + 1.5},216.800Q${X + 5},218 ${X + 5.6},221.500" fill="none" stroke="#d6d9ee" stroke-width="1.200" opacity=".85"/>`, Z('num-orbg', X - .5, 222.5))
    // the ring he would rather look at (meh): the back of the hand, long fingers up
    + PR('num-ring', u, 20, 204, `${sleeve(u, 36, E, 39, 236)}<g fill="${SK}" stroke-width=".8"><path d="M32.800,232C31,229 29.500,226 30.200,224.500C31.200,223.200 33,225 34.500,228Z"/><rect x="34" y="216.500" width="2.700" height="11" rx="1.300"/><rect x="36.800" y="214.500" width="2.700" height="13" rx="1.300"/><rect x="39.600" y="215" width="2.700" height="12.500" rx="1.300"/><rect x="42.400" y="217.500" width="2.600" height="10" rx="1.300"/><path d="M33.500,226.500H45.200V231.500Q39.300,235 33.500,231.500Z"/></g><path d="M33.500,226.500V231.500Q36,233.500 38,233.300L37.500,226.500Z" fill="#33242f" opacity=".25" stroke="none"/><path d="M36.700,222.500h2.900M36.700,224.800h2.900M34.100,223.500h2.500M39.700,223h2.500" fill="none" stroke-width=".4" opacity=".7"/>
<rect x="39.300" y="220.200" width="3.300" height="2.300" rx=".6" fill="#d2b56e" stroke-width=".6"/><circle cx="41" cy="221.300" r="1.300" fill="#c2372f" stroke-width=".5"/>`, Z('num-glint', 41.6, 220.4, SL('', 0, 0, 10, 10, '<path d="M5,0L5.900,4.100L10,5L5.900,5.900L5,10L4.100,5.900L0,5L4.100,4.100Z" fill="#fff4f0"/>')))
    // a cold light sitting in his palm (good, great, superb): it grows with the rating
    + PR('num-palm', u, 16, 204, `${sleeve(u, 34, E, 34, 235)}${palmUp(34, 231)}`, `<div class="rig-z" style="left:${CX + 34}px;top:229.5px"><div class="rig-z num-pfs"><div class="num-pgl"></div><div class="rig-z num-pfw"><div class="rig-z num-pfk">${SL('', -7, -17, 14, 18, '<path class="num-pf1" d="M0,0C-4.500,-.5 -5.500,-5 -3,-8.500C-2.500,-6.500 -1.500,-7 -1.500,-10.500C-.5,-13 0,-14.500 1,-16.500C1.500,-13 4,-11 3.800,-7.500C5,-4.500 4,-.5 0,0Z"/><path class="num-pf2" d="M0,-.6C-2.500,-1.200 -2.800,-4 -1,-6.500C0,-8 .3,-9.500 .8,-11C2,-8 2.600,-5.500 2.200,-3.500C1.800,-1.600 1,-.7 0,-.6Z"/>')}</div></div></div></div>`)
    // the black sword, held upright at his shoulder (a player kill)
    + `<div class="num-p num-sword"><div class="rig-z num-swr" style="left:${CX + 41}px;top:231px">${SL('rig-rim', -10, -62, 20, 74, G(u, `<path d="M-2.300,-5L-2.300,-48L0,-56L2.300,-48L2.300,-5Z" fill="#26262e" stroke-width="1"/><path d="M0,-55V-6" fill="none" stroke-width=".5" opacity=".8"/><path d="M1.500,-47V-7" fill="none" stroke="#c9ccd6" stroke-width=".8" opacity=".8"/><path d="M-1,-40l1.800,-2M-1,-33l1.800,-2M-1,-26l1.800,-2" fill="none" stroke="#c8281e" stroke-width=".8"/><path d="M-7.500,-6.500Q0,-3.500 7.500,-6.500L7,-3.500Q0,-.8 -7,-3.500Z" fill="${GOLD}" stroke-width=".9"/><path d="M-1.300,5V9" fill="none" stroke-width="3.600"/><circle cx="0" cy="10.300" r="2.300" fill="${GOLD}" stroke-width=".8"/>`))}</div>${S('rig-rim', 22, 216, 40, 40, G(u, `${sleeve(u, 36, E, 41, 238)}${fist(41, 232.5, 4.6)}`))}</div>`
    // a sealed scroll (an achievement)
    + PR('num-scroll', u, 14, 204, `${sleeve(u, 36, E, 39, 236)}<g transform="rotate(-20 39 228)"><path d="M43,229.500C44,234 43,238 44.500,242L47,239.500L49,242.500C48,238 49,234 47,229.500Z" fill="${CRIM}" stroke-width=".8"/><rect x="25" y="224.500" width="28" height="7.500" rx="1.500" fill="#d9cfae" stroke-width="1"/><path d="M26,230H52" fill="none" stroke="#33242f" stroke-width="1.600" opacity=".25"/><ellipse cx="25.500" cy="228.200" rx="1.800" ry="3.700" fill="#b9ad8a" stroke-width=".8"/><ellipse cx="52.500" cy="228.200" rx="1.800" ry="3.700" fill="#efe6c8" stroke-width=".8"/><path d="M44,224.500V232M47,224.500V232" fill="none" stroke="${CRIM}" stroke-width="1.300"/><circle cx="46.500" cy="243.500" r="3.300" fill="#1b181e" stroke-width=".8"/><circle cx="46.500" cy="243.500" r="1.900" fill="none" stroke="${GOLD}" stroke-width=".7"/></g>${fist(38, 230, 4.5)}`)
    // a fist laid on his chest (level up)
    + PR('num-fist', u, 0, 218, `${sleeve(u, 38, E, 15, 237, 8)}${fist(11.500, 235, 5)}`);
};
// the staff: black wood, silver bands, a claw of tarnished silver about a dim stone
const staff = (u: number) => `<div class="num-staffw">${S('rig-rim', -54, 158, 28, RY - 158 + 12, G(u, `
${ink2(`M-41,${RY + 10}V177`, 2.3, '#2b2630')}<path d="M-40.300,${RY + 8}V179" fill="none" stroke="#77748c" stroke-width=".6" opacity=".9"/>
<path d="M-43,214h4v3h-4ZM-43,190h4v2.500h-4ZM-43.200,177.500h4.400v3h-4.400Z" fill="${SILV}" stroke-width=".7"/>
<path d="M-41,178.500C-47,176 -47.500,168.500 -43.500,165M-41,178.500C-35,176 -34.500,168.500 -38.500,165" fill="none" stroke-width="2.900"/><path d="M-41,178.500C-47,176 -47.500,168.500 -43.500,165M-41,178.500C-35,176 -34.500,168.500 -38.500,165" fill="none" stroke="${SILV}" stroke-width="1.400"/>
<circle class="num-stone" cx="-41" cy="170.500" r="3.900" stroke-width="1"/><path d="M-43.300,169.500Q-42.800,167.500 -40.800,167.800" fill="none" stroke="#fff" stroke-width="1" opacity=".85"/>
${sleeve(u, -35, RY + 4, -40.5, 232)}${fist(-41, 227, 4.600)}`))}${Z('num-sgl', -41, 170.5)}</div>`;
// tears (death): they run slowly from the lowered lids down the hollow cheeks and stay on his face
const tears = () => `<div class="rig-a num-tears">${([[-10.2, 3, '4deg', 0], [5.2, 3, '-4deg', -2.6]] as const).map(([x, y, a, dl]) => `<div class="num-tear" style="left:${CX + x}px;top:${HY + y}px;transform:rotate(${a})"><i style="--r:4px;--dl:${dl}s"></i><i style="--r:9px;--dl:${dl - 2.9}s"></i></div>`).join('')}</div>`;
const eyeglow = () => [-1, 1].map((s) => Z('num-eg', 13.5 * HS * s, HY)).join('');

// the sign's width and the point on its rod where the cords are tied (the rig shows the sign at K.SS)
const SW = 158, HX = 52;
// ---- the car: black lacquered woodwork like a small ship, two tiers of carved panels, gilt rail and band, serpent prows; two silver cleats under the rim carry the sign's cords ----
const basket = (u: number) => {
  const neck = (s: number) => `M${52 * s},${RY + 5}C${59 * s},${RY + 1} ${62 * s},${RY - 7} ${59 * s},${RY - 13}C${57 * s},${RY - 17} ${52.5 * s},${RY - 16} ${53.5 * s},${RY - 12}`;
  const panel = (x0: number, x1: number) => `<path d="M${x0},${RY + 8}H${x1}L${n(x1 * .95)},${BY - 7}H${n(x0 * .95)}Z" fill="#110d0d" stroke-width=".8"/><path d="M${x0 + 1.5},${RY + 9.5}H${x1 - 1.5}" fill="none" stroke="#000" stroke-width="1.200" opacity=".5"/><path d="M${n(x0 * .95 + 1)},${BY - 8.3}H${n(x1 * .95 - 1)}" fill="none" stroke="${GOLD}" stroke-width=".6" opacity=".7"/>`;
  const wave = (x: number) => `M${x},${RY + 18}q3,-6 6.500,-3.500q1.800,1.700 -.6,2.800M${x + 6.5},${RY + 18}q3,-6 6.500,-3.500q1.800,1.700 -.6,2.800M${x + 13},${RY + 18}q3,-6 6.500,-3.500q1.800,1.700 -.6,2.800M${x - 1},${RY + 19.500}h22`;
  // the car is deeper than it looks: a second tier of carved panels runs on down to K.BD behind the tablet (no floor is drawn)
  const BD = K.BD, FX = HX * K.SS, FYC = RY + K.CY, wx = (y: number) => 52 - 6 * (y - RY - 1) / (BD - RY - 1), bw = n(wx(BY - 4)), bw2 = n(wx(BY + 3));
  const panel2 = (x0: number, x1: number) => `<path d="M${n(x0 * .93)},${BY + 7}H${n(x1 * .93)}L${n(x1 * .885)},${BD - 4}H${n(x0 * .885)}Z" fill="#110d0d" stroke-width=".8"/><path d="M${n(x0 * .93 + 1.5)},${BY + 8.5}H${n(x1 * .93 - 1.5)}" fill="none" stroke="#000" stroke-width="1.200" opacity=".5"/>`;
  const wave2 = (x: number) => `M${x},${BY + 20}q3,-6 6.500,-3.500q1.800,1.700 -.6,2.800M${x + 6.5},${BY + 20}q3,-6 6.500,-3.500q1.800,1.700 -.6,2.800M${x + 13},${BY + 20}q3,-6 6.500,-3.500q1.800,1.700 -.6,2.800M${x - 1},${BY + 21.500}h21`;
  return S('rig-rim', -68, RY - 22, 136, BD - RY + 30, `${G(u, `
${ink2(neck(-1), 3, '#2b2630')}${ink2(neck(1), 3, '#3a3542')}<path d="${neck(-1)}${neck(1)}" fill="none" stroke="${GOLD}" stroke-width=".7" stroke-dasharray="1.200 2.400"/>
<circle cx="-53.500" cy="${RY - 11.5}" r="1.800" fill="${GOLD}" stroke-width=".6"/><circle cx="53.500" cy="${RY - 11.5}" r="1.800" fill="${GOLD}" stroke-width=".6"/>
<path d="M-52,${RY + 1}L-46,${BD}H46L52,${RY + 1}Z" fill="url(#nmw${u})" stroke-width="1.100"/>
<path d="M-52,${RY + 1}L-46,${BD}H-22L-27,${RY + 1}Z" fill="${HP(u)}" stroke="none"/><path d="M-52,${RY + 1}L-46,${BD}H-35L-41,${RY + 1}Z" fill="${HQ(u)}" stroke="none"/>
${panel(-40, -16)}${panel(-12, 12)}${panel(16, 40)}${panel2(-40, -16)}${panel2(-12, 12)}${panel2(16, 40)}
<path d="${wave(-37.5)}${wave(18)}${wave2(-36)}${wave2(-9.5)}${wave2(17)}" fill="none" stroke="#8d8798" stroke-width=".8"/>
<g transform="translate(0,${RY + 15})">${sun(4.6, '#0d0b0d', '#c9ccd4', 12)}</g>
<path d="M${-bw},${BY - 4}H${bw}L${bw2},${BY + 3}H${-bw2}Z" fill="url(#nmk${u})" stroke-width="1"/><path d="M${-bw + 1.5},${BY - 2.2}H${bw - 1.5}" fill="none" stroke="${GOLD}" stroke-width="1.100" stroke-dasharray="3 1.500"/><path d="M${-bw2 + 1.5},${BY + 1.5}H${bw2 - 1.5}" fill="none" stroke="#8d8798" stroke-width=".5" opacity=".7"/>
<rect x="-54" y="${RY - 3}" width="108" height="6.500" rx="2.300" fill="url(#nmk${u})" stroke-width="1.100"/><path d="M-51,${RY - 1.3}H51" fill="none" stroke="${GOLD}" stroke-width=".9"/><path d="M-51,${RY + 1.6}H51" fill="none" stroke="#8d8798" stroke-width=".5" opacity=".7"/>
<path d="M${n(-FX - 3.5)},${FYC - 3.2}h7v5h-7ZM${n(FX - 3.5)},${FYC - 3.2}h7v5h-7Z" fill="${SILV}" stroke-width=".8"/>
<g fill="${GOLD}" stroke-width=".4"><circle cx="-34" cy="${RY + .4}" r="1.100"/><circle cx="-14" cy="${RY + .4}" r="1.100"/><circle cx="14" cy="${RY + .4}" r="1.100"/><circle cx="34" cy="${RY + .4}" r="1.100"/></g>`)}
${[-1, 1].map((d) => `<circle cx="${n(FX * d)}" cy="${FYC}" r="2.500" fill="none" stroke="#17120e" stroke-width="2"/><circle cx="${n(FX * d)}" cy="${FYC}" r="2.500" fill="none" stroke="${SILV}" stroke-width=".8"/>`).join('')}`);
};
// crimson tassels hang from the two prows and swing on their own
const tassel = (s: number) => `<div class="rig-z num-tas" style="left:${CX + 58.5 * s}px;top:${RY - 12}px"><svg class="rig-s rig-rim" xmlns="${NS}" width="10" height="22" viewBox="-5 0 10 22" style="left:-5px;top:0"><g stroke="${INK}" stroke-linejoin="round"><path d="M0,0V9" fill="none" stroke-width="2"/><path d="M0,0V9" fill="none" stroke="${GOLD}" stroke-width=".9"/><circle cx="0" cy="9.500" r="1.800" fill="${GOLD}" stroke-width=".7"/><path d="M-1.500,11L-3,19.500L0,18.300L3,19.500L1.500,11Z" fill="#a3262c" stroke-width=".8"/><path d="M-.8,12.500L-1.200,18M.8,12.500L1.200,18" fill="none" stroke-width=".4" opacity=".7"/></g></svg></div>`;

// ---- the burner: a censer of blackened silver hung on chains under the mouth, pierced, with a gilt rim ----
const burner = (u: number) => S('rig-rim', -24, HG, 48, FY - HG + 20, G(u, `
${ink2(`M-19,${HG + 4}L-11.500,${FY + .5}M19,${HG + 4}L11.500,${FY + .5}`, 1.2, SILV, 'stroke-dasharray="2.200 1.500"')}
<path d="M-12.500,${FY}C-13.500,${FY + 6} -9,${FY + 9} -4.500,${FY + 10}L-2,${FY + 11.5}L0,${FY + 13.5}L2,${FY + 11.5}L4.500,${FY + 10}C9,${FY + 9} 13.500,${FY + 6} 12.500,${FY}Z" fill="#3a3a45" stroke-width="1.100"/>
<path d="M-12.500,${FY}C-13.500,${FY + 6} -9,${FY + 9} -4.500,${FY + 10}L-2,${FY + 11.5}L0,${FY + 13.5}L-1,${FY + 10}C-5,${FY + 8} -6,${FY + 4} -5,${FY}Z" fill="#000" opacity=".35" stroke="none"/>
<path d="M9.500,${FY + 3}Q10,${FY + 6.5} 6,${FY + 8.500}" fill="none" stroke="#c9ccd6" stroke-width=".9" opacity=".75"/>
<g class="num-slit" stroke-width=".6"><path d="M-8,${FY + 8}V${FY + 5.5}L-6.700,${FY + 4}L-5.400,${FY + 5.5}V${FY + 8.600}Z"/><path d="M-1.300,${FY + 9.300}V${FY + 6}L0,${FY + 4.500}L1.300,${FY + 6}V${FY + 9.300}Z"/><path d="M5.400,${FY + 8.600}V${FY + 5.500}L6.700,${FY + 4}L8,${FY + 5.500}V${FY + 8}Z"/></g>
<ellipse class="num-coal" cx="0" cy="${FY - .5}" rx="12" ry="2" stroke-width=".9"/>
<path d="M-14.500,${FY}Q0,${FY + 4} 14.500,${FY}L14.500,${FY + 2.6}Q0,${FY + 6.600} -14.500,${FY + 2.600}Z" fill="${GOLD}" stroke-width=".9"/><path d="M-14.500,${FY}Q-8,${FY + 1.8} -5,${FY + 2.200}L-5,${FY + 4.800}Q-10,${FY + 4} -14.500,${FY + 2.600}Z" fill="#000" opacity=".3" stroke="none"/>
<circle cx="0" cy="${FY + 14.3}" r="1.400" fill="${GOLD}" stroke-width=".7"/>`))
  + Z('num-coalg', 0, FY - 1);

// ---- the envelope: a sail in nine narrow gores; the helpers lay bands and embroidery on the surface ----
const KS = [-1, -.93, -.76, -.5, -.18, .18, .5, .76, .93, 1];
const panels = (g: EnvGeo, cols: readonly string[]) => KS.slice(0, -1).map((k, i) => `<path d="${g.gore(k, KS[i + 1]!)}" fill="${cols[i % cols.length]}" stroke="none"/>`).join('');
const seams = (g: EnvGeo, stitch: string, o: { w?: number; dash?: string; op?: number } = {}) => KS.slice(1, -1).map((k) => `<path d="${g.seam(k)}" fill="none" stroke-width=".8"/>${stitch ? `<path d="${g.seam(k + (k > 0 ? -.025 : .025))}" fill="none" stroke="${stitch}" stroke-width="${o.w || .7}" stroke-dasharray="${o.dash || '1.4 2.2'}" opacity="${o.op || .6}"/>` : ''}`).join('');
const weave = (g: EnvGeo, op = .26) => `<path d="${[.2, .36, .52, .68, .82].map((t) => g.lat(t)).join('')}" fill="none" stroke-width=".5" opacity="${op}"/>`;
const band = (g: EnvGeo, u: number, t0: number, t1: number, fill: string) => `<path d="${g.band(t0, t1)}" fill="${fill}" stroke-width="1"/><path d="${g.band(t0, t1, -1, -.4)}" fill="${HP(u)}" stroke="none"/><path d="${g.lat(t0 + (t1 - t0) * .22, -.9, .93)}" fill="none" stroke="#fff" stroke-width=".7" opacity=".35"/>`;
const studs = (g: EnvGeo, t: number, num: number, fill: string, r = 1.2) => g.along(num).map((k) => { const p = g.pt(k, t); return `<circle cx="${n(p[0])}" cy="${n(p[1])}" r="${r}" fill="${fill}" stroke-width=".5"/>`; }).join('');
const letters = (g: EnvGeo, t: number, num: number, col: string, s = .6, w = 1.2) => g.along(num, -.93, .93).map((k, i) => `<path transform="${g.place(k, t, s)}" d="${LET[(i * 3) % LET.length]}" fill="none" stroke="${col}" stroke-width="${w}"/>`).join('');
// a row of curling waves along a latitude
const waves = (g: EnvGeo, t0: number, t1: number, num: number, col: string, w = 1.1) => {
  const ks = g.along(num + 1, -.985, .985); let d = '';
  for (let i = 0; i < num; i++) {
    const a = g.pt(ks[i]!, t1), b = g.pt(ks[i + 1]!, t1), m = g.pt(ks[i]! * .3 + ks[i + 1]! * .7, t0), c = g.pt(ks[i]! * .25 + ks[i + 1]! * .75, t0 + (t1 - t0) * .62);
    d += `M${pp(a)}Q${n(a[0] * .55 + m[0] * .45)},${n(m[1])} ${pp(m)}Q${n(b[0])},${n(m[1] + 1)} ${pp(c)}`;
  }
  return `<path d="${d}${g.lat(t1)}" fill="none" stroke="${col}" stroke-width="${w}"/>`;
};
// the serpent: one long body winding along a band, the head at the right
const serpent = (g: EnvGeo, t0: number, t1: number, num: number, col: string, w = 2.2) => {
  const ks = g.along(num, -.9, .86), tm = (t0 + t1) / 2; let d = '';
  ks.forEach((k, i) => { const p = g.pt(k, i % 2 ? t0 : t1); if (!i) d = `M${pp(g.pt(k - .06, tm))}Q${pp(p)} `; else { const q = g.pt((ks[i - 1]! + k) / 2, tm); d += `${pp(q)}Q${pp(p)} `; } });
  const e = g.pt(.93, tm), h = g.pt(.97, tm - .012);
  d += `${pp(e)}`;
  return `<path d="${d}" fill="none" stroke-width="${w + 1.6}"/><path d="${d}" fill="none" stroke="${col}" stroke-width="${w}"/><path d="${d}" fill="none" stroke="${INK}" stroke-width=".5" stroke-dasharray=".6 2.400" opacity=".8"/><path d="M${n(e[0] - 2.5)},${n(e[1] - 2.6)}L${n(h[0] + 2.5)},${n(h[1])}L${n(e[0] - 2.5)},${n(e[1] + 2.6)}Z" fill="${col}" stroke-width=".8"/>`;
};
const cap = (c: Pt2, w: number, fill: string) => `<path d="M${n(c[0] - w)},${n(c[1] + 4)}Q${n(c[0])},${n(c[1] - 3.5)} ${n(c[0] + w)},${n(c[1] + 4)}Q${n(c[0])},${n(c[1] + 4 + w * .42)} ${n(c[0] - w)},${n(c[1] + 4)}Z" fill="${fill}" stroke-width="1"/>`;
const spire = (c: Pt2, h: number, fill: string) => `<path d="M${n(c[0] - 2.4)},${n(c[1])}L${n(c[0])},${n(c[1] - h)}L${n(c[0] + 2.4)},${n(c[1])}Z" fill="${fill}" stroke-width=".9"/>`;
const lugs = (g: EnvGeo, t: number, col: string) => [-1, 1].map((s) => { const p = g.pt(s, t); return ink2(`M${n(p[0] - s)},${n(p[1] - 2.5)}h${4 * s}v5.500h${-4 * s}`, 1.3, col); }).join('');
const girdle = (g: EnvGeo, t: number, col: string) => ink2(g.lat(t), 1.3, col, 'stroke-dasharray="3 1.200"');
const creases = (g: EnvGeo, list: ReadonlyArray<readonly [number, number, number]>) => `<path d="${list.map(([k, a, b]) => g.seam(k, a, b)).join('')}" fill="none" stroke-width=".7" opacity=".55"/>`;
// a dagged skirt round the mouth
const dags = (g: EnvGeo, num: number, len: number, cols: readonly string[], bead: string) => { let s = ''; g.along(num, -.96, .96).forEach((k, i) => { const a = g.pt(Math.max(-1, k - .085), .885), b = g.pt(Math.min(1, k + .085), .885), m = g.pt(k, .885); s += `<path d="M${pp(a)}L${n(m[0])},${n(m[1] + len)}L${pp(b)}Z" fill="${cols[i % cols.length]}" stroke-width=".8"/>${bead ? `<circle cx="${n(m[0])}" cy="${n(m[1] + len + 1)}" r="1.100" fill="${bead}" stroke-width=".5"/>` : ''}`; }); return s; };
// a long swallow-tailed banner on its own layer (it sways); hung from a lug on the envelope's side
const banner = (u: number, g: EnvGeo, s: number, t: number, len: number, fill: string, edge: string, mark: boolean) => { const p = g.pt(s, t); return `<div class="rig-z num-ban" style="left:${n(CX + p[0] + 3.5 * s)}px;top:${n(p[1] + 1)}px">${SL('rig-rim', -8, -2, 16, len + 6, G(u, `<path d="M0,-1.500V2" fill="none" stroke-width="2"/><path d="M-5.500,1H5.500" fill="none" stroke-width="2.600"/><path d="M-5.500,1H5.500" fill="none" stroke="${edge}" stroke-width="1.200"/><path d="M-4.500,1.500H4.500L4,${len - 7}L4.800,${len}L0,${len - 6}L-4.800,${len}L-4,${len - 7}Z" fill="${fill}" stroke-width=".9"/><path d="M-4.500,1.500H-1.500L-1.800,${len - 5}L-4.800,${len}L-4,${len - 7}Z" fill="${HP(u)}" stroke="none"/><path d="M-3,4V${len - 8}M3,4V${len - 8}" fill="none" stroke="${edge}" stroke-width=".7"/>${mark ? `<g transform="translate(0,${n(len * .36)}) scale(.5)">${sun(5, '#121014', edge, 8)}</g><path transform="translate(0,${n(len * .66)}) scale(.5)" d="${LET[0]}" fill="none" stroke="${edge}" stroke-width="2"/>` : ''}`))}</div>`; };

const ENV: Readonly<Record<string, EnvSpec>> = {
  // the sail of a wrecked black ship: sagging, salt-faded, moth-eaten, mended
  poor: { cond: { sag: 1, lop: .8, dents: [{ side: -1, t: .48, depth: 13, span: .13 }, { side: 1, t: .28, depth: 8, span: .1 }] }, art: (g, u) => {
    const c = g.pt(0, 0), holes = [[-.2, .56, 2.6, 1.7], [.55, .5, 2, 2.6], [.3, .2, 1.6, 1.2], [-.62, .66, 1.8, 1.3], [.1, .8, 2.2, 1.4], [-.36, .22, 1.3, 1.6]] as const;
    const tear = Array.from({ length: 7 }, (_, i) => { const p = g.pt(.36 - i * .012, .38 + i * .05); return `M${n(p[0] - 2.6)},${n(p[1] - 1)}L${n(p[0] + 2.6)},${n(p[1] + 1.2)}`; }).join('');
    return {
      base: '#69655a', lip: '#5d5a52', ring: '#8a8372',
      inside: `${panels(g, ['#716c60', '#5d5a52', '#7b7464', '#565349', '#6e6657'])}${seams(g, '#d6d0bd', { w: 1.1, dash: '2.4 3.4', op: .7 })}${weave(g, .3)}
<path d="${g.lat(.6, -.95, .5)}${g.lat(.73, -.6, .95)}${g.lat(.44, .1, .9)}" fill="none" stroke="#dcd6c2" stroke-width="1.100" stroke-dasharray="7 3 2 4" opacity=".45"/>
<g transform="${g.place(-.08, .33)}" fill="none" opacity=".5"><circle r="11" stroke="#35322d" stroke-width="1.300" stroke-dasharray="6 4 3 5"/><path d="M0,-14v-5M12,-8l4,-3M-13,-7l-4,-3M14,4l4,1" stroke="#35322d" stroke-width="1.100"/></g>
${creases(g, [[.78, .36, .74], [-.5, .44, .68], [.4, .7, .98], [-.3, .72, .98], [.8, .6, .9], [-.05, .76, .98], [.3, .04, .2]])}
${g.patch(.5, .36, 22, 17, { fill: '#b3aa90', rot: 10, sw: 1.1 })}${g.patch(-.42, .3, 18, 14, { fill: '#7a4a3e', rot: -9, stitch: '#d6d0bd', hatch: HP(u) })}${g.patch(-.1, .66, 15, 18, { fill: '#2e2a2a', rot: 6, stitch: '#d6d0bd', sw: 1 })}${g.patch(.14, .16, 13, 10, { fill: '#8f866d', rot: -16, hatch: HQ(u) })}${g.patch(-.72, .56, 11, 11, { fill: '#b3aa90', rot: 14 })}
<path d="${g.seam(.33, .36, .7)}" fill="none" stroke-width="1.200"/><path d="${tear}" fill="none" stroke="#d6d0bd" stroke-width="1"/>
${holes.map(([k, t, rx, ry]) => { const p = g.pt(k, t); return `<ellipse cx="${n(p[0])}" cy="${n(p[1])}" rx="${rx}" ry="${ry}" fill="#17120f" stroke-width=".6"/>`; }).join('')}
${girdle(g, .8, '#a39a80')}`,
      over: `<path d="M${n(c[0] - 6)},${n(c[1] + 3)}Q${n(c[0])},${n(c[1] - 5)} ${n(c[0] + 6)},${n(c[1] + 3)}Q${n(c[0])},${n(c[1] + 6)} ${n(c[0] - 6)},${n(c[1] + 3)}Z" fill="#565349" stroke-width="1"/>${ink2(`M${n(c[0] + 1)},${n(c[1] - 1)}q4,-6 9,-2q2,3 -1,6`, 1.2, '#a39a80')}`,
    };
  } },
  // plain tanbark sailcloth, sound enough
  meh: { cond: { sag: .32, lop: -.12 }, art: (g, u) => { const c = g.pt(0, 0); return {
    base: '#86543c', lip: '#6a4230', ring: '#a39a80',
    inside: `${panels(g, ['#8c583f', '#7d4d37'])}${seams(g, '#e2c9a4')}${weave(g)}${creases(g, [[-.4, .74, .98], [.36, .76, .98]])}${g.patch(-.4, .32, 13, 11, { fill: '#74472f', rot: -6, stitch: '#e2c9a4' })}
${girdle(g, .54, '#c9b58c')}${girdle(g, .82, '#c9b58c')}`,
    over: cap(c, 8, '#6a4230'),
  }; } },
  // sound and full: sea-teal, tarnished silver, the black ship
  good: { cond: {}, art: (g, u) => { const c = g.pt(0, 0); return {
    base: '#1f5158', lip: '#8f989b', ring: '#b4b8bd',
    inside: `${panels(g, ['#22585f', '#1b474e'])}${seams(g, '#a9c9c6')}${weave(g, .2)}
${band(g, u, .47, .57, '#8f989b')}${waves(g, .488, .552, 11, '#17272b', 1)}${band(g, u, .84, .875, '#8f989b')}
<g transform="${g.place(0, .25)}"><circle r="13" fill="#b4b8bd" stroke-width="1.100"/><circle r="10.500" fill="none" stroke-width=".6"/><g transform="translate(-.5,1.500) scale(.72)">${ship('#14181c', .7)}</g></g>`,
    over: `${lugs(g, .52, SILV)}${cap(c, 9, '#8f989b')}<circle cx="${n(c[0])}" cy="${n(c[1] - 3)}" r="3" fill="#b4b8bd" stroke-width="1"/>`,
  }; } },
  // fine: imperial purple, silver letters, silver waves on black, the eclipsed sun under a crown
  great: { cond: { taut: .5 }, art: (g, u) => { const c = g.pt(0, 0), e = g.pt(0, .2); return {
    base: '#4f2460', lip: '#b4b8bd', ring: '#d4d7dc',
    inside: `${panels(g, ['#58296b', '#431d52'])}${seams(g, '#cdbfe0')}${weave(g, .18)}
${band(g, u, .36, .415, '#b9bdc4')}${letters(g, .388, 17, INK, .5, 1.3)}
${band(g, u, .5, .6, '#1b171f')}${ink2(g.lat(.5), 1, '#d4d7dc')}${ink2(g.lat(.6), 1, '#d4d7dc')}${waves(g, .52, .583, 12, '#d4d7dc', 1.1)}
${band(g, u, .84, .88, '#b9bdc4')}
<g transform="translate(${n(e[0])},${n(e[1] + 5)})">${sun(8, '#121014', '#e3e6ea')}<g transform="translate(0,-19) scale(.72)">${crown('#e3e6ea', .9)}</g></g>`,
    over: `${lugs(g, .55, '#d4d7dc')}${cap(c, 9, '#b9bdc4')}${spire(c, 10, '#d4d7dc')}<circle cx="${n(c[0])}" cy="${n(c[1] - 10.5)}" r="1.900" fill="#e3e6ea" stroke-width=".8"/>`,
  }; } },
  // brand new: black silk, crimson and gold, the crowned sun, a crown on top, banners
  superb: { cond: { taut: 1 }, art: (g, u) => {
    const c = g.pt(0, 0), e = g.pt(0, .2);
    return {
      base: '#1d1a22', lip: '#e0bb55', ring: '#f0dca8',
      inside: `${panels(g, ['#25212b', '#17141b'])}${KS.slice(1, -1).map((k) => ink2(g.seam(k), .8, '#e0bb55')).join('')}
${band(g, u, .355, .41, '#e0bb55')}${letters(g, .383, 17, '#3a1014', .5, 1.3)}
${band(g, u, .5, .61, '#8e1f26')}${ink2(g.lat(.5), 1.5, '#e9c865')}${ink2(g.lat(.61), 1.5, '#e9c865')}${serpent(g, .527, .585, 13, '#e9c865', 1.9)}${studs(g, .555, 12, '#f4f0e6', .9)}
${band(g, u, .84, .885, '#e0bb55')}${studs(g, .862, 13, '#fff3c4', .9)}
<path d="${g.lat(.7, -.95, .95)}" fill="none" stroke="#d4d7dc" stroke-width=".8" stroke-dasharray=".5 3"/>
<g transform="translate(${n(e[0])},${n(e[1] + 5)})"><circle r="19" fill="none" stroke="#e9c865" stroke-width=".7" stroke-dasharray=".6 2.200"/>${sun(8.5, '#0d0b0f', '#f0d27a')}<g transform="translate(0,-20) scale(.8)">${crown('#f0d27a', .9)}</g></g>`,
      over: `${dags(g, 11, 10, ['#8e1f26', '#e0bb55'], '#f6e2a6')}${lugs(g, .555, '#e9c865')}
<path d="M${n(c[0] - 10)},${n(c[1] + 4.5)}L${n(c[0] - 11.5)},${n(c[1] - 5)}L${n(c[0] - 7)},${n(c[1] - 1)}L${n(c[0] - 4.5)},${n(c[1] - 10)}L${n(c[0] - 2)},${n(c[1] - 2)}L${n(c[0])},${n(c[1] - 14)}L${n(c[0] + 2)},${n(c[1] - 2)}L${n(c[0] + 4.5)},${n(c[1] - 10)}L${n(c[0] + 7)},${n(c[1] - 1)}L${n(c[0] + 11.5)},${n(c[1] - 5)}L${n(c[0] + 10)},${n(c[1] + 4.5)}Q${n(c[0])},${n(c[1] + 8.5)} ${n(c[0] - 10)},${n(c[1] + 4.5)}Z" fill="#e9c865" stroke-width="1"/><path d="M${n(c[0] - 9.5)},${n(c[1] + 1.5)}Q${n(c[0])},${n(c[1] + 5.5)} ${n(c[0] + 9.5)},${n(c[1] + 1.5)}" fill="none" stroke-width=".6"/><circle cx="${n(c[0])}" cy="${n(c[1] + 4.3)}" r="1.700" fill="#c2372f" stroke-width=".6"/><circle cx="${n(c[0])}" cy="${n(c[1] - 14.5)}" r="1.500" fill="#fff3c4" stroke-width=".6"/>`,
      html: banner(u, g, -1, .52, 44, '#8e1f26', '#e9c865', true) + banner(u, g, 1, .52, 44, '#9a2a30', '#e9c865', true),
    };
  } },
  // unrated: pale unbleached canvas, marked up in charcoal as a star chart
  calibrating: { cond: { sag: .12 }, art: (g, u) => { const c = g.pt(0, 0); return {
    base: '#cbc4b0', lip: '#8f989b',
    inside: `${panels(g, ['#d2cbb8', '#c3bca8'])}${seams(g, '')}${weave(g, .2)}
<path d="${g.lat(.14)}${g.lat(.6)}${g.seam(-.5, .05, .95)}${g.seam(.5, .05, .95)}${g.seam(0, .56, .95)}" fill="none" stroke="#55524b" stroke-width=".8" stroke-dasharray="3 2.600" opacity=".75"/>
<path d="${[.62, .66, .7, .74, .78, .82].map((t, i) => { const p = g.pt(.5, t); return `M${pp(p)}h${i % 2 ? -3 : -5}`; }).join('')}" fill="none" stroke="#55524b" stroke-width=".8"/>
<g transform="${g.place(0, .34)}" fill="none" stroke="#3a3731"><circle r="16" stroke-width="1" stroke-dasharray="2.600 2.200"/><circle r="9" stroke-width=".8"/><path d="M0,-19L2.500,-2.500L19,0L2.500,2.500L0,19L-2.500,2.500L-19,0L-2.500,-2.500Z" stroke-width="1.100"/><path d="M-8,-8L8,8M8,-8L-8,8" stroke-width=".7"/></g>
<g fill="#3a3731" stroke="none">${([[-.6, .3], [.62, .22], [.4, .48], [-.34, .52], [-.7, .5], [.74, .42]] as const).map(([k, t]) => { const p = g.pt(k, t); return `<circle cx="${n(p[0])}" cy="${n(p[1])}" r="1.100"/>`; }).join('')}</g>
${girdle(g, .8, '#b9ad8c')}`,
    over: cap(c, 7, '#b3ab96'),
  }; } },
  // a player kill: blood red, the serpent, blades
  pvp: { cond: { taut: .3 }, art: (g, u) => {
    const c = g.pt(0, 0);
    const vane = (s: number, t: number, len: number) => { const p = g.pt(s, t); return `<path d="M${n(p[0] - s)},${n(p[1] - 3)}L${n(p[0] + len * s)},${n(p[1] - 6)}L${n(p[0] + (len - 4) * s)},${n(p[1] + 1)}L${n(p[0] - s)},${n(p[1] + 3.500)}Z" fill="#2a2a32" stroke-width=".9"/><path d="M${n(p[0] + s)},${n(p[1] - 1.5)}L${n(p[0] + (len - 2) * s)},${n(p[1] - 4.5)}" fill="none" stroke="#c9ccd6" stroke-width=".7" opacity=".8"/>`; };
    return {
      base: '#7e1a1c', lip: '#b4b8bd', ring: '#b4b8bd',
      inside: `${panels(g, ['#8a1e20', '#6e1518'])}${seams(g, '#17120e', { op: .8, w: .9 })}${weave(g, .2)}
${band(g, u, .43, .6, '#18141a')}${ink2(g.lat(.43), 1, '#b4b8bd')}${ink2(g.lat(.6), 1, '#b4b8bd')}${serpent(g, .47, .56, 11, '#c9ccd4', 2.4)}
<g transform="${g.place(0, .22)}">${sun(8, '#120d0f', '#18141a', 12)}</g>
${band(g, u, .84, .885, '#18141a')}`,
      over: `${dags(g, 9, 9, ['#18141a'], '')}${vane(-1, .5, 13)}${vane(1, .5, 13)}${vane(-1, .32, 9)}${vane(1, .32, 9)}${cap(c, 8, '#2a2a32')}<path d="M${n(c[0] - 3)},${n(c[1] + 1)}L${n(c[0] - 2)},${n(c[1] - 7)}L${n(c[0])},${n(c[1] - 13)}L${n(c[0] + 2)},${n(c[1] - 7)}L${n(c[0] + 3)},${n(c[1] + 1)}Z" fill="#3a3a45" stroke-width=".9"/><path d="M${n(c[0] + .8)},${n(c[1] - 10)}V${n(c[1])}" fill="none" stroke="#c9ccd6" stroke-width=".7" opacity=".8"/>`,
    };
  } },
  // a level gained: indigo, a gold sun rising, its rays filling the upper half
  levelup: { cond: { taut: .6 }, art: (g, u) => {
    const c = g.pt(0, 0), s = g.pt(0, .6);
    let rays = '';
    for (let i = 0; i < 11; i++) { const a = (-78 + i * 15.6) * Math.PI / 180, hw = 3.6 * Math.PI / 180, L = 110; rays += `<path d="M${pp(s)}L${n(s[0] + Math.sin(a - hw) * L)},${n(s[1] - Math.cos(a - hw) * L)}L${n(s[0] + Math.sin(a + hw) * L)},${n(s[1] - Math.cos(a + hw) * L)}Z" fill="${i % 2 ? '#c9a24a' : '#ecd07a'}" stroke-width=".6"/>`; }
    return {
      base: '#232c5c', lip: '#d9b24c', ring: '#e9c865',
      inside: `${panels(g, ['#283266', '#1e2650'])}${seams(g, '#aab4e0', { op: .5 })}${rays}
<circle cx="${n(s[0])}" cy="${n(s[1])}" r="20" fill="#232c5c" stroke-width=".9"/><circle cx="${n(s[0])}" cy="${n(s[1])}" r="15" fill="#f0d27a" stroke-width="1.100"/><circle cx="${n(s[0])}" cy="${n(s[1])}" r="11" fill="none" stroke="#8a6a20" stroke-width=".8"/><g transform="translate(${n(s[0])},${n(s[1] - 7)}) scale(.62)">${crown('#232c5c', .8)}</g>
<path d="${g.band(.6, 1)}" fill="#1e2650" stroke="none"/>${band(g, u, .6, .68, '#d9b24c')}${letters(g, .64, 15, '#232c5c', .62, 1.4)}${band(g, u, .84, .88, '#d9b24c')}`,
      over: `${cap(c, 8, '#d9b24c')}<g transform="translate(${n(c[0])},${n(c[1] - 5)}) scale(.75)">${crown('#f0d27a', 1)}</g>`,
      html: `<div class="rig-a num-lit">${S('', -20, n(s[1]) - 20, 40, 21, `<path transform="translate(${n(s[0])},${n(s[1])})" d="M-15,-1A15,15 0 0 1 15,-1" fill="none" stroke="#fff0bd" stroke-width="1.800" stroke-linecap="round"/>`)}</div>`,
    };
  } },
  // a death: ash grey, half let down, in mourning; the sun wholly dark
  death: { cond: { sag: .62, lop: -.1 }, art: (g, u) => { const k0 = g.pt(.56, .53); return {
    base: '#5b5961', lip: '#4a4a52', ring: '#77757f',
    inside: `${panels(g, ['#63616a', '#514f58'])}${seams(g, '#9a98a4', { op: .5 })}${weave(g, .22)}${creases(g, [[.42, .68, .98], [-.32, .7, .98], [-.72, .4, .7], [.7, .62, .9], [-.06, .76, .98]])}
<g transform="${g.place(0, .26)}"><circle r="10" fill="#131116" stroke="#000" stroke-width="1"/><path d="M-6,-5A8,8 0 0 1 3,-7.500" fill="none" stroke="#55535c" stroke-width=".9"/></g>
<path d="${g.band(.46, .6)}" fill="#131116" stroke="#000" stroke-width="1"/><path d="${g.lat(.5, -.95, .95)}${g.lat(.56, -.95, .95)}" fill="none" stroke="#6a6872" stroke-width=".7"/>
<g transform="translate(${n(k0[0])},${n(k0[1])})" stroke="#000"><path d="M-4,2C-3,14 -6,26 -3,42L1,37L5,43C3,28 6,14 4,2Z" fill="#17151a" stroke-width="1"/><circle r="5" fill="#1f1c23" stroke-width="1"/><path d="M-1,10q-1,12 1,24" fill="none" stroke="#6a6872" stroke-width=".7"/></g>`,
    over: '',
  }; } },
  // an achievement: cloth of old gold, black letters, the black seal
  achievement: { cond: { taut: .8 }, art: (g, u) => { const c = g.pt(0, 0), e = g.pt(0, .28); return {
    base: '#b08f42', lip: '#1b171f', ring: '#e9c865',
    inside: `${panels(g, ['#b99848', '#a2823a'])}${seams(g, '#f6e2a6', { op: .8 })}${weave(g, .2)}
${band(g, u, .5, .59, '#1b171f')}${letters(g, .545, 17, '#e9c865', .62, 1.3)}${ink2(g.lat(.5), 1, '#e9c865')}${ink2(g.lat(.59), 1, '#e9c865')}${band(g, u, .84, .88, '#1b171f')}${ink2(g.lat(.1, -.9, .9), .8, '#1b171f')}
<g transform="translate(${n(e[0])},${n(e[1])})"><path d="M-5,12L-10,33L-4,29L0,34L3,20ZM4,13L11,32L13,25L18,27L9,10Z" fill="#8e1f26" stroke-width=".9"/><circle r="16" fill="#1b171f" stroke-width="1.200"/><circle r="13" fill="none" stroke="#e9c865" stroke-width=".9"/><circle r="14.600" fill="none" stroke="#e9c865" stroke-width=".7" stroke-dasharray=".1 2.300"/><g transform="translate(-.5,1.500) scale(.86)">${ship('#e9c865', .7)}</g></g>`,
    over: `${lugs(g, .545, '#1b171f')}${cap(c, 9, '#1b171f')}${spire(c, 8, '#2d2a33')}<circle cx="${n(c[0])}" cy="${n(c[1] - 8.5)}" r="2.600" fill="#e9c865" stroke-width=".9"/>`,
  }; } },
};

// ---- the sign: a black lacquered tablet laced to a rod with spear finials, hung on two crimson silk cords ----
//            lacquer    face       trim       mounts
const TAB: Readonly<Record<string, readonly [string, string, string, string]>> = {
  calibrating: ['#1d1b20', '#2a2c34', '#8c9096', '#aeb2b8'], meh: ['#1d1a1c', '#2b2422', '#8a7460', '#a39a8c'],
  poor: ['#2a2420', '#33291f', '#7a634c', '#85796a'], good: ['#16181c', '#143035', '#9fb6b4', '#c3c8cc'],
  great: ['#18151c', '#31173d', '#c9c2d8', '#d6d9de'], superb: ['#17141a', '#651318', '#e9c865', '#f0d27a'],
  pvp: ['#151214', '#33090b', '#c8281e', '#b4b8bd'], levelup: ['#15141c', '#18204a', '#e0bb55', '#f0d27a'],
  death: ['#121114', '#1c1b20', '#55535c', '#66646e'], achievement: ['#17141a', '#3a2c10', '#e0bb55', '#f0d27a'],
};
const board = ({ w, h, hx, mood, u }: BoardArgs) => {
  const [lac, face, trim, mt] = TAB[mood] || TAB.meh!, poor = mood === 'poor', rich = mood === 'superb' || mood === 'levelup' || mood === 'achievement';
  const spear = (x: number, s: number) => `<path d="M${x},-1.500L${x + 6 * s},-3.500L${x + 12 * s},-.5L${x + 6 * s},2.500L${x},.5Z" fill="${mt}" stroke-width=".8"/>`;
  const ring = (x: number) => `<path d="M${x - 2.6},-3h5.200v5h-5.200Z" fill="${mt}" stroke-width=".8"/>`;
  const mount = (x: number, y: number, sx: number, sy: number) => `<path transform="translate(${x},${y}) scale(${sx},${sy})" d="M0,0H11L8.500,2.500Q4,3.500 3.500,8.500L0,11Z" fill="${mt}" stroke-width=".8"/><circle cx="${x + 3 * sx}" cy="${y + 3 * sy}" r=".9" fill="${lac}" stroke="none"/>`;
  let lace = '';
  for (let x = 12; x < w - 8; x += (w - 24) / 8) lace += `M${n(x - 1.6)},-1.500V4.500M${n(x + 1.6)},-1.500V4.500`;
  return G(u, `${poor ? '' : spear(-3, -1)}${spear(w + 3, 1)}
${ink2(`M${poor ? 2 : -4},-.5H${w + 4}`, 2.4, '#2d2831')}<path d="M${poor ? 2 : -3},-1.200H${w + 3}" fill="none" stroke="#8d8798" stroke-width=".6" opacity=".8"/>
<rect x="1.500" y="3.200" width="${w - 3}" height="${h - 4}" rx="1.800" fill="${lac}" stroke-width="1.300"/>
<path d="M3.200,${h - 2.8}V5H${w - 3.6}" fill="none" stroke="#8d8798" stroke-width=".8" opacity=".6"/>
<rect x="2" y="3.700" width="5" height="${h - 5}" fill="${HP(u)}" stroke="none"/><rect x="2" y="${h - 6.5}" width="${n(w * .45)}" height="5" fill="${HQ(u)}" stroke="none"/>
<rect x="6" y="7.500" width="${w - 12}" height="${h - 12.5}" rx="1" fill="${face}" stroke-width=".8"/>
<path d="M6.800,${h - 6}V8.300H${w - 7}" fill="none" stroke="#000" stroke-width="1.300" opacity=".45"/>
<rect x="8.300" y="9.800" width="${w - 16.6}" height="${h - 17.1}" fill="none" stroke="${trim}" stroke-width="${rich ? .9 : .7}" opacity="${poor ? .45 : .85}"/>
<path d="M${n(w * .62)},10.500l16,5M16,${h - 11}l10,-4M${w - 24},${h - 9}l9,-2.500" fill="none" stroke="#fff" stroke-width=".6" opacity=".12"/>
${poor ? `<g stroke="none" fill="#9a8a70"><path d="M${n(w * .08)},${n(h * .7)}l7,-3l5,4l-3,5l-8,1Z" opacity=".5"/><path d="M${n(w * .86)},${n(h * .22)}l6,-2l4,5l-5,4l-5,-3Z" opacity=".45"/><path d="M${n(w * .66)},${n(h * .86)}l8,-2l3,3l-9,2Z" opacity=".4"/></g><path d="M${w - 30},4L${w - 36},14L${w - 31},20L${w - 34},27" fill="none" stroke-width=".8"/>` : `${mount(1.5, 3.2, 1, 1)}${mount(w - 1.5, 3.2, -1, 1)}`}${mount(1.5, h - .8, 1, -1)}${mount(w - 1.5, h - .8, -1, -1)}
<path d="${lace}" fill="none" stroke-width="2.200"/><path d="${lace}" fill="none" stroke="#b04a40" stroke-width="1"/>
${ring(w / 2 - hx)}${ring(w / 2 + hx)}`);
};
// the rating as five small suns: lit discs for the steps reached, rings for the rest; a player kill is a red blade
const pips = (mood: Mood) => {
  let s = '';
  if (mood === 'pvp') s = '<path class="num-red" d="M9,.5L11,9.500H13.500V11H10V13.500H8V11H4.500V9.500H7Z"/>';
  else for (let i = 0; i < 5; i++) { const x = 5.5 + i * 11, on = i < (RANK[mood] || 0); s += `<circle class="${on ? 'num-on' : 'num-of'}" cx="${x}" cy="7" r="${on ? 3.4 : 3.1}"/>${on ? `<path d="M${x},1.300v1.200M${x},11.500v1.200M${x - 5.2},7h1M${x + 4.2},7h1" fill="none" stroke="var(--on)" stroke-width=".9"/>` : ''}`; }
  return `<svg xmlns="${NS}" width="${mood === 'pvp' ? 18 : 55}" height="14" viewBox="0 0 ${mood === 'pvp' ? 18 : 55} 14">${s}</svg>`;
};

let paceOf = () => 1;

// ---- the small life in him: slow blinks, cold glances, a brow; one piece of business per mood ----
const liven = (R: RigBalloon) => {
  // reduced motion as it was when this balloon was made (stage 75 review: per balloon, not per module)
  const reduced = R.reduced;
  const q = R.q, qa = R.qa, ck = kit.clock(), later = ck.later, rnd = Math.random;
  const nod = q('.num-nod'), look = q('.num-look'), lids = qa('.num-bl'), pgs = qa('.num-pg'), brows = [q('.num-bL'), q('.num-bR')];
  const egs = qa('.num-eg'), pfw = q('.num-pfw'), swr = q('.num-swr'), stw = q('.num-staffw'), coal = q('.num-coalg'), tas = qa('.num-tas');
  let gaze: readonly [number, number] = [0, 0], ga: Animation[] = [], la: Animation | null = null, hot = true;
  const bob = (el: Part | null, to: string, ms: number, o: KeyframeAnimationOptions & { at?: number } = {}) => el && el.animate([{ transform: 'none' }, { transform: to, offset: o.at ?? .4 }, { transform: 'none' }], { duration: ms, easing: 'ease-in-out', composite: 'add', ...o });
  const blink = () => {
    const slow = R.mood === 'meh' || R.mood === 'death' || R.mood === 'poor';
    lids.forEach((l) => l.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(9px)', offset: .42 }, { transform: 'translateY(0)' }], { duration: slow ? 620 : 170, easing: 'ease-in-out' }));
    later(blink, (slow ? 2800 : 2200) + rnd() * 4200);
  };
  const lookAt = (x: number, y: number, ms = 200) => {
    if (reduced) return;
    const from = gaze; gaze = [x, y];
    const old = ga, oldL = la;
    ga = pgs.map((p) => p.animate([{ transform: `translate(${from[0]}px,${from[1]}px)` }, { transform: `translate(${x}px,${y}px)` }], { duration: ms, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'forwards' }));
    la = look.animate([{ transform: `translate(${from[0] * .25}px,${from[1] * .15}px) rotate(${from[0] * .35}deg)` }, { transform: `translate(${x * .25}px,${y * .15}px) rotate(${x * .35}deg)` }], { duration: 620, delay: 60, easing: 'cubic-bezier(.3,.6,.3,1)', fill: 'both' });
    old.forEach((a) => a.cancel()); if (oldL) oldL.cancel();
  };
  const glance = () => {
    if (R.mood !== 'death' && R.root.classList.contains('rig-at') && !R.root.classList.contains('rig-off')) {
      const r = rnd(), p = PROP[R.mood] || [0, 0];
      if (r < .3) lookAt(0, 0);                          // at you, coldly
      else if (r < .5) lookAt(rnd() - .5, 2.2);          // down at the tablet
      else if (r < .58) lookAt(rnd() * 1.4 - .7, -2.2);  // up at the sail
      else if (r < .82) lookAt(p[0], p[1]);              // at what he holds
      else if (r < .9) lookAt(-2.4, -1.6);               // at the stone on his staff
      else lookAt(rnd() < .5 ? -2.6 : 2.6, -.2);         // out over the land
    }
    later(glance, 1500 + rnd() * 2800);
  };
  const brow = () => {
    bob(brows[1]!, 'translateY(-2.2px) rotate(3deg)', 520);
    if (rnd() < .25) bob(brows[0]!, 'translateY(-1.4px)', 520, { delay: 80 });
    later(brow, 3200 + rnd() * 4200);
  };
  if (!reduced) { lookAt(.2, -2, 1); later(blink, 600 + rnd() * 1800); later(glance, 900 + rnd() * 1200); later(brow, 1800 + rnd() * 2500); }
  const once = (el: Part | null, kf: Keyframe[], o: KeyframeAnimationOptions) => !reduced && el && el.animate(kf, o);
  // his eyes take light for a moment, then it is gone
  const eyes = (peak: number, ms: number, delay: number) => egs.forEach((e) => once(e, [{ opacity: 0 }, { opacity: peak, offset: .3 }, { opacity: peak * .7, offset: .65 }, { opacity: 0 }], { duration: ms, delay, easing: 'ease-in-out' }));
  const T = (s: string): Keyframe => ({ transform: s });
  const flare = (d: number, delay = 300) => once(pfw, [T('none'), { ...T('scale(1.25,1.4)'), offset: .3 }, { ...T('scale(1.1,1.15)'), offset: .65 }, T('none')], { duration: 1100 * d, delay: delay * d, easing: 'ease-in-out' });
  // one small piece of business on arriving, by mood
  const biz = (mood: Mood) => {
    if (reduced) return;
    const d = 1 / paceOf();
    const nd = (kf: Keyframe[], ms: number, delay = 0, o: KeyframeAnimationOptions = {}) => nod.animate(kf, { duration: ms * d, delay: delay * d, easing: 'ease-in-out', ...o });
    if (mood === 'calibrating') { lookAt(2.2, 1.8, 300); nd([T('none'), T('rotate(1.6deg) translateY(.6px)')], 900, 300, { fill: 'forwards' }); later(() => lookAt(0, 0, 300), 2200 * d); }
    if (mood === 'poor') { lookAt(.3, -2, 400); later(() => lookAt(2.4, 1, 500), 1100 * d); nd([T('none'), { ...T('rotate(-1.2deg)'), offset: .25 }, { ...T('rotate(1.2deg)'), offset: .55 }, { ...T('rotate(-.8deg)'), offset: .8 }, T('none')], 1500, 900); }
    if (mood === 'meh') { lookAt(2.3, 1.6, 300); nd([T('none'), { ...T('translateY(-.8px)'), offset: .35 }, T('translateY(1.2px) rotate(.8deg)')], 1500, 500, { fill: 'forwards' }); }
    if (mood === 'good') { lookAt(2.3, 1.4); flare(d); nd([T('none'), { ...T('translateY(2px) rotate(.8deg)'), offset: .4 }, T('none')], 700, 500); later(() => lookAt(0, 0), 1300 * d); }
    if (mood === 'great') { lookAt(2.3, .8); flare(d); nd([T('none'), T('translateY(-1.2px) rotate(-1.2deg)')], 900, 300, { fill: 'forwards' }); later(() => lookAt(0, 0), 1200 * d); }
    if (mood === 'superb') {
      lookAt(0, -.6); eyes(.85, 1900 * d, 350 * d); flare(d, 500);
      // a dark laugh: held, the shoulders shake a little, twice
      const shake = (delay: number) => nd([T('none'), T('translateY(-1.1px)'), T('translateY(.5px)'), T('translateY(-1px)'), T('translateY(.4px)'), T('translateY(-.8px)'), T('none')], 900, delay, { composite: 'add' });
      shake(300); later(() => { if (R.mood === 'superb') shake(0); }, 2300 * d);
    }
    if (mood === 'pvp') { lookAt(0, 0); eyes(.8, 1700 * d, 300 * d); once(swr, [T('none'), { ...T('translateY(-3px) rotate(-3deg)'), offset: .35 }, T('none')], { duration: 800 * d, delay: 250 * d, easing: 'ease-in-out' }); nd([T('none'), { ...T('translateY(1.2px)'), offset: .4 }, T('none')], 700, 250); }
    if (mood === 'levelup') { lookAt(.2, -1.2, 300); later(() => lookAt(0, 0, 400), 1800 * d); }
    if (mood === 'death') nd([T('none'), T('translateY(1.5px) rotate(-1.5deg)')], 1300, 500, { fill: 'forwards' });
    if (mood === 'achievement') { lookAt(2.2, 1.4); nd([T('none'), { ...T('translateY(2px) rotate(.8deg)'), offset: .4 }, T('translateY(.4px)')], 900, 400, { fill: 'forwards' }); later(() => lookAt(0, 0), 1400 * d); }
  };
  const calm = () => nod.getAnimations().forEach((a) => a.cancel());
  return {
    arrive: biz,
    changed(mood: Mood) { calm(); biz(mood); },
    struck() { lookAt(0, 2.2, 160); },
    leave() { if (R.mood !== 'death') lookAt(.2, -2.2, 300); },
    // every frame: the censer's light follows burn; the tassels dangle; the sword and staff barely lag
    frame(i: FrameInfo) {
      const b = i.burn;
      coal.style.opacity = (.2 + .8 * b).toFixed(2);
      tas[0]!.style.transform = `rotate(${(i.hang * 1.2 + Math.sin(i.now * .0019) * 2).toFixed(2)}deg)`;
      tas[1]!.style.transform = `rotate(${(i.hang * 1.2 + Math.sin(i.now * .0016 + 2) * 2).toFixed(2)}deg)`;
      // he looks up at his fire when it roars
      if (b > .62 && !hot) { hot = true; if (R.mood !== 'death') lookAt(.2, -2.3, 260); } else if (b < .35) hot = false;
    },
    stop: ck.stop,
  };
};

export const passenger: PassengerDef = {
  id: 'numenorean',
  name: 'The Black Númenórean',
  // blurb: 'A King’s Man of Umbar, tall and cold, under the sail of a black ship: a censer of pale fire for a burner, a lacquered car with serpent prows, and his sorcery in his hands (a staff with a dim stone, a cold light in the palm, a dark orb). The sail says how good the kill was, from a moth-eaten wreck to black silk under a crown with banners; the news hangs below on a lacquered tablet.',
  spec(ctx: RigCtx): RigSpec {
    paceOf = ctx.pace;
    return {
      id: 'num', css: CSS,
      defs: (u) => `<linearGradient id="nmw${u}" x1="0" x2="1"><stop offset="0" stop-color="#16110f"/><stop offset=".55" stop-color="#2c2422"/><stop offset="1" stop-color="#4a3e3a"/></linearGradient><linearGradient id="nmk${u}" x1="0" x2="1"><stop offset="0" stop-color="#121014"/><stop offset=".6" stop-color="#26232b"/><stop offset="1" stop-color="#45414e"/></linearGradient>`,
      envelope: (mood) => ENV[mood] || ENV.calibrating,
      ropes: { kind: 'rope', dark: '#120e0c', light: '#9b927f', w: 1.3 },
      burner,
      basket,
      behind: (u) => `<div class="num-lift"><div class="num-br"><div class="num-look"><div class="num-nod">${head(u)}${eyeglow()}${tears()}</div></div></div></div>
${staff(u)}${props(u)}`,
      front: () => tassel(-1) + tassel(1),
      sign: { w: SW, hx: HX, k: 12.5, c: 1.8, cord: { kind: 'rope', dark: '#1a0d0c', light: '#b04a40', w: 1.5 }, board, pips },
      life: liven,
    };
  },
};
