// Round 5: "The Hobbit", built on the shared rig (rig.js). A respectable Shire
// hobbit in shirt-sleeves and his best waistcoat, airborne against his better
// judgement in a craft made at home: cloth from the linen press, a wicker
// picnic hamper, and a brass kettle-stove hung under the mouth.
//
// THE HOBBITS' VOCABULARY (decided before drawing; rule 2 of the brief)
//   Materials  what a hobbit hole holds: patchwork quilt and bed-linen, sacking,
//              good Shire wool cloth, gingham, ribbon, wicker, hemp rope, and
//              brass (buttons, eyelets, the kettle, door knobs).
//   Motifs     round only: the round door with its knob in the middle, the
//              scalloped pavilion edge, buttons, dots, flowers (daisies and
//              garlands), bunting sewn onto the cloth. Nothing angular or grim.
//   Colours    washed-out greys and duns for the worthless; sacking; Shire
//              green; buttercup yellow; and for the best, scarlet and cream.
//   "The best" means A PARTY, in the sense of Bilbo's: a pavilion in bright new
//              stripes, flower garlands, bunting, brass, a scalloped valance
//              and a pennon on top.
//
// THE ENVELOPE LADDER (silhouette and colour both change)
//   poor    an old patchwork quilt: sagging, lopsided, dented; faded grey
//           squares, mended with a gingham dishcloth, flannel and a sock
//   meh     plain sacking, a little slack, one row of ticking, one neat patch
//   good    sound and full: Shire green, a gingham band, a yellow round door
//           for an emblem, a brass knob on top
//   great   fine: buttercup yellow, a green band with a scalloped edge and
//           daisies, a flower garland, a green door in a daisy wreath
//   superb  the Party pavilion, brand new: scarlet and cream stripes, bunting,
//           a gold band of flowers, garlands, a scalloped valance round the
//           mouth, a brass finial with a pennon
// THE SPECIALS (none can be taken for a rating step)
//   unrated      a white calico toile, still tacked together with blue basting
//                thread, pins in it, and an empty embroidery hoop for a roundel
//   player kill  the Shire-muster: black-green cloth, a scarlet band with a
//                crossed pitchfork and axe, a bramble girdle, hedge-stakes that
//                break the outline, a woven hurdle below
//   level up     cornflower blue with rows of gold arches climbing and a
//                painted firework burst lit from within
//   death        charcoal, half let down, a black crape sash tied in a bow
//                with hanging tails; the fire burns cold blue
//   achievement  plum with gold, and a great prize rosette from the Free Fair
//
// HIM. Curly brown mop, round face, cream shirt, mustard waistcoat with brass
// buttons and a watch chain, a green neckcloth. By mood he holds a mushroom
// (unrated), a mug of tea (meh), his long pipe (good, great, achievement), a
// pie (great), a tankard and a lit taper beside a few rockets in the hamper
// (superb, level up: one rocket goes up past the envelope's side on arrival),
// a short sword (player kill), a pocket handkerchief (death).
(() => {
  const { K, INK, kit } = Rig, { n, S, SL, Z, G, ink2, NS, pp } = kit, HP = kit.P, HQ = kit.Q;
  const { W, CX, HG, FY, RY, BY } = K;
  // the head: drawn in its own units about the middle of the face, shown at HS
  const HS = .5, HCY = RY - 45;
  const BRASS = '#d9b24c', GRN = '#4f7a3c', YEL = '#e0b23c', RED = '#c23b2a', CRM = '#f3ead0', BLU = '#3f73b0', SKIN = '#dbb391';

  // ---- moods: how the face is held and what is in his hands ----
  const DEF = { rise: 0, tilt: 0, bly: 0, blr: 0, bry: 0, brr: 0, lid: 1.6, low: 0, px: 0, py: 0, es: 1, msm: 0, mgr: 0, mfl: 0, mfr: 0, mst: 0, hl: 1, hr: 1, pipe: 0, mush: 0, tea: 0, pie: 0, ale: 0, tap: 0, rk: 0, swd: 0, hank: 0, ros: 0, bfl: 0 };
  const M = {
    calibrating: { tilt: 2, bly: -4.5, blr: -7, bry: .5, lid: 1.8, mfl: 1, mush: 1, hr: 0 },
    poor: { rise: -2, tilt: -2, lid: 4, bly: -1, bry: -1, blr: -10, brr: 10, mfr: 1 },
    meh: { lid: 3.7, bly: 1.2, bry: 1.2, mfl: 1, tea: 1, hr: 0 },
    good: { lid: 2, low: 1.6, bly: -1, bry: -1, msm: 1, pipe: 1 },
    great: { rise: 1.5, lid: 1.8, low: 2, bly: -3, bry: -3, msm: 1, pipe: 1, pie: 1, hr: 0, bfl: 1 },
    superb: { rise: 3, lid: 1, low: 2.6, bly: -5, bry: -5, blr: -5, brr: 5, es: 1.08, mgr: 1, ale: 1, tap: 1, rk: 1, hl: 0, hr: 0, bfl: 1 },
    pvp: { rise: 1, lid: 3.8, low: 2, bly: 2.2, bry: 2.2, blr: 14, brr: -14, mst: 1, swd: 1, hl: 0 },
    levelup: { rise: 2, lid: 1.6, low: 2, bly: -3.5, bry: -3.5, msm: 1, tap: 1, rk: 1, hl: 0, bfl: 1 },
    death: { rise: -2, tilt: -2, lid: 4.6, py: 1.4, blr: -12, brr: 12, bly: -1.5, bry: -1.5, mfr: 1, hank: 1, hl: 0 },
    achievement: { rise: 2.5, tilt: 1.5, lid: 3.8, low: 1.6, bly: -3.5, bry: -3.5, msm: 1, pipe: 1, ros: 1 },
  };
  // what he only does once he has arrived
  const AT = { death: { rise: -4, tilt: -4, py: 2.2, lid: 5.4 } };
  // where the thing he holds is, for his glances (pupil units)
  const PROP = { calibrating: [3, -.4], poor: [.4, -2.3], meh: [2.8, 1.8], good: [1.6, 2.2], great: [3, 1.6], superb: [-3, -1.6], pvp: [-2.8, -1], levelup: [-3, -1.6], achievement: [-1.6, 2.2] };
  const RANK = { poor: 1, meh: 2, good: 3, great: 4, superb: 5 };
  const vars = (o) => Object.keys(o).filter((k) => k in DEF).map((k) => `--${k}:${o[k]}`).join(';');
  const show = (...names) => names.map((nm) => `.hobbit-${nm}{--x:var(--${nm})}`).join('');

  const CSS = `
.hobbit-v{${vars(DEF)};--coal:#f09a3a}
${Object.keys(M).map((m) => `.hobbit-v[data-mood=${m}]{${vars(M[m])}}`).join('\n')}
.hobbit-v:not(.rig-at){--lid:1.4}
${Object.keys(AT).map((m) => `.hobbit-v.rig-at[data-mood=${m}]{${vars(AT[m])}}`).join('\n')}
.hobbit-v[data-mood=death]{--rig-f1:#4f8fd0;--rig-f2:#cfe6ff;--rig-gl:120,170,255;--coal:#6f9ccb}
.hobbit-v[data-mood=poor]{--rig-f1:#d5732a;--coal:#b0602c}
.hobbit-v[data-mood=superb]{--rig-gl:255,206,120}
.hobbit-v[data-mood=poor] .rig-envb{animation:hobbit-heave 3.6s ease-in-out infinite alternate}
.hobbit-slit{stroke:var(--coal)}.hobbit-coal{fill:var(--coal)}
.hobbit-coalg{width:34px;height:14px;margin:-7px 0 0 -17px;border-radius:50%;opacity:.3;will-change:opacity;background:radial-gradient(closest-side,rgba(var(--rig-gl),.85),rgba(var(--rig-gl),0))}
.hobbit-burstg{opacity:.9;animation:hobbit-pu 1.7s ease-in-out infinite alternate;filter:drop-shadow(0 0 2.5px #ffcf5a) drop-shadow(0 0 6px rgba(255,190,70,.7))}
.hobbit-lift,.hobbit-br,.hobbit-look,.hobbit-nod{position:absolute;left:0;top:0;width:${W}px;height:0;transform-origin:${CX}px ${RY + 6}px}
.hobbit-lift{transform:translateY(calc(var(--rise)*-1px)) rotate(calc(var(--tilt)*1deg));transition:transform calc(.55s*var(--k)) cubic-bezier(.3,1.25,.5,1)}
.hobbit-br{animation:hobbit-br 4.1s ease-in-out infinite alternate}
.hobbit-head{left:${CX - 70 * HS}px;top:${HCY - 64 * HS}px}
.hobbit-bL{transform:translateY(calc(var(--bly)*1px)) rotate(calc(var(--blr)*1deg))}
.hobbit-bR{transform:translateY(calc(var(--bry)*1px)) rotate(calc(var(--brr)*1deg))}
.hobbit-bL,.hobbit-bR,.hobbit-eye,.hobbit-pm,.hobbit-lid,.hobbit-low{transition:transform calc(.4s*var(--k)) ease-out}
.hobbit-eye{transform:scale(var(--es))}
.hobbit-pm{transform:translate(calc(var(--px)*1px),calc(var(--py)*1px))}
.hobbit-lid{transform:translateY(calc(var(--lid)*1px));fill:#d3a686;stroke:${INK};stroke-width:1.4}
.hobbit-low{transform:translateY(calc(var(--low)*-1px));fill:#dfb693;stroke:${INK};stroke-width:1.1}
.hobbit-mo,.hobbit-pipe,.hobbit-ros,.hobbit-bfl{transition:opacity calc(.25s*var(--k))}
.hobbit-m-sm{opacity:var(--msm)}.hobbit-m-gr{opacity:var(--mgr)}.hobbit-m-fl{opacity:var(--mfl)}.hobbit-m-fr{opacity:var(--mfr)}.hobbit-m-st{opacity:var(--mst)}
.hobbit-pipe{opacity:var(--pipe)}.hobbit-ros{opacity:var(--ros)}.hobbit-bfl{opacity:var(--bfl)}
.hobbit-wisp{opacity:var(--pipe);transition:opacity calc(.25s*var(--k))}
.hobbit-wisp b{position:absolute;left:-5px;top:-3px;width:10px;height:6px;border-radius:50%;background:radial-gradient(closest-side,rgba(255,176,80,.95),rgba(255,150,60,0));animation:hobbit-puff 3.4s ease-in-out infinite}
.hobbit-wisp i{position:absolute;left:-2px;top:-7px;width:3.5px;height:5px;border-radius:50%;border-left:1.2px solid rgba(238,234,222,.8);opacity:0;animation:hobbit-wisp 3.4s ease-out infinite}
.hobbit-wisp i+i{left:0;animation-delay:-1.7s}
.hobbit-p{position:absolute;left:0;top:0;width:${W}px;height:0;opacity:var(--x);transform:translateY(calc((1 - var(--x))*30px));transition:transform calc(.5s*var(--k)) cubic-bezier(.3,1.25,.5,1),opacity calc(.14s*var(--k))}
${show('mush', 'tea', 'pie', 'ale', 'tap', 'rk', 'swd', 'hank')}
.hobbit-ty{transform-origin:${CX + 38}px ${RY}px}
.hobbit-tf{transform-origin:0 0;animation:hobbit-fk .37s ease-in-out infinite alternate}
.hobbit-rkt{transform:rotate(-14deg);will-change:transform,opacity}
.hobbit-tail{opacity:0}
.hobbit-burst{opacity:0;will-change:transform,opacity}
.hobbit-hL,.hobbit-hR{transition:transform calc(.25s*var(--k)),opacity calc(.12s*var(--k))}
.hobbit-hL{opacity:var(--hl);transform:translateY(calc((1 - var(--hl))*7px))}
.hobbit-hR{opacity:var(--hr);transform:translateY(calc((1 - var(--hr))*7px))}
.hobbit-on{will-change:transform}
.hobbit-tears{display:none}
.hobbit-v[data-mood=death] .hobbit-tears{display:block}
.hobbit-tear{position:absolute;width:5px;height:14px;overflow:hidden}
.hobbit-tear::before{content:"";position:absolute;left:1.9px;top:0;width:1.2px;height:11px;border-radius:1px;background:linear-gradient(rgba(190,212,228,.4),rgba(190,212,228,.06))}
.hobbit-tear i{position:absolute;left:1.1px;top:-3px;width:2.8px;height:3.8px;border-radius:50% 50% 50% 50%/62% 62% 38% 38%;background:radial-gradient(circle at 35% 35%,rgba(236,244,250,.9),rgba(168,198,220,.75) 55%,rgba(110,150,186,.7));box-shadow:0 0 0 .5px rgba(24,34,54,.3);opacity:.62;transform:translateY(var(--r));animation:hobbit-tear 5.6s cubic-bezier(.4,0,.7,.7) infinite;animation-delay:var(--dl)}
@keyframes hobbit-tear{0%{transform:translateY(0) scale(.5);opacity:0}12%{transform:translateY(1.5px) scale(1);opacity:.62}75%{opacity:.62}100%{transform:translateY(14px) scale(.9);opacity:0}}
@keyframes hobbit-heave{from{transform:scale(1,1) skewX(0)}to{transform:scale(1.02,.965) skewX(1.2deg)}}
@keyframes hobbit-br{from{transform:translateY(.5px) scale(1,.997)}to{transform:translateY(-.8px) scale(1,1.006)}}
@keyframes hobbit-pu{from{opacity:.55}to{opacity:1}}
@keyframes hobbit-puff{0%,100%{opacity:.3}50%{opacity:.95}}
@keyframes hobbit-wisp{0%{transform:translate(0,2px) scale(.6);opacity:0}25%{opacity:.8}100%{transform:translate(1.5px,-6px) scale(1.25);opacity:0}}
@keyframes hobbit-fk{0%{transform:scale(1,1)}45%{transform:scale(.86,1.12) skewX(6deg)}100%{transform:scale(1.08,.9) skewX(-6deg)}}
.hobbit-sign{filter:drop-shadow(0 2px 2.5px rgba(0,0,0,.42));--tx:#2a1b12;--dim:#6a5540;--fg:#2a1b12;--on:#c9972a;color:var(--tx)}
.hobbit-sign[data-mood=poor]{--tx:#3d3128;--fg:#3d3128;--on:#8a7f6a}
.hobbit-sign[data-mood=meh]{--on:#a8894a}
.hobbit-sign[data-mood=good]{--fg:#35592a}
.hobbit-sign[data-mood=great]{--fg:#7a4a0c;--on:#d9a52c}
.hobbit-sign[data-mood=superb]{--fg:#a52a1c;--on:#e0ae2c}
.hobbit-sign[data-mood=pvp]{--fg:#8a1f18}
.hobbit-sign[data-mood=levelup]{--fg:#2c558a}
.hobbit-sign[data-mood=death]{--tx:#ddd5c2;--dim:#a8a093;--fg:#ddd5c2}
.hobbit-sign[data-mood=achievement]{--fg:#5a2f4d}
.hobbit-sign .rig-text{padding:8px 12px}
.hobbit-sign .rig-title{font:italic 400 15px/1.07 "IM Fell English",Georgia,serif}
.hobbit-sign .rig-fig,.hobbit-sign .rig-word,.hobbit-sign .rig-tag{color:var(--fg)}
.hobbit-sign[data-mood=superb] .rig-fig{font-weight:700}
.hobbit-sign .rig-unit,.hobbit-sign .rig-q,.hobbit-sign .rig-more{color:var(--dim)}
.hobbit-pon{fill:var(--on);stroke:${INK};stroke-width:.8}.hobbit-ponr{fill:none;stroke:#fff6d6;stroke-width:.6;opacity:.75}.hobbit-pof{fill:none;stroke:${INK};stroke-width:.8;opacity:.3}
.hobbit-pred{fill:none;stroke:#8a1f18;stroke-width:2.2;stroke-linecap:round}
.hobbit-sign[data-kind=levelup] .rig-text{padding:13px 8px}
.hobbit-sign[data-kind=levelup] .rig-fig{font:400 23px/1.1 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.05em}
.hobbit-sign[data-kind=death] .rig-text{padding:13px 8px}
.hobbit-sign[data-kind=death] .rig-fig{font:400 21px/1.15 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.17em;margin-right:-.17em;text-transform:lowercase;font-variant:small-caps}
.hobbit-sign[data-kind=achievement] .rig-title{font:italic 400 13.5px/1.1 "IM Fell English",Georgia,serif}
`;

  // ---- small shared drawings ----
  const flower = (x, y, r, pet, cen = YEL, np = 6) => {
    let s = '';
    for (let i = 0; i < np; i++) { const a = i * 2 * Math.PI / np + .3; s += `<circle cx="${n(Math.cos(a) * r * .62)}" cy="${n(Math.sin(a) * r * .62)}" r="${n(r * .42)}"/>`; }
    return `<g transform="translate(${n(x)},${n(y)})"><g fill="${pet}" stroke-width=".5">${s}</g><circle r="${n(r * .36)}" fill="${cen}" stroke-width=".5"/></g>`;
  };
  // a prize rosette: pleats round a button, two ribbon tails
  const rosette = (r, ring, face, heart, tail) => {
    let s = '';
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; s += `<circle cx="${n(Math.cos(a) * r)}" cy="${n(Math.sin(a) * r)}" r="${n(r * .3)}"/>`; }
    return `<path d="M${n(-r * .45)},${n(r * .6)}L${n(-r * .95)},${n(r * 2.5)}L${n(-r * .35)},${n(r * 2.1)}L0,${n(r * 2.6)}L${n(r * .2)},${n(r * .8)}ZM${n(r * .25)},${n(r * .7)}L${n(r * .95)},${n(r * 2.4)}L${n(r * 1.15)},${n(r * 1.8)}L${n(r * 1.6)},${n(r * 2)}L${n(r * .8)},${n(r * .45)}Z" fill="${tail}" stroke-width=".9"/><g fill="${ring}" stroke-width=".7">${s}</g><circle r="${n(r * .98)}" fill="${ring}" stroke-width=".9"/><circle r="${n(r * .66)}" fill="${face}" stroke-width=".7"/><circle r="${n(r * .3)}" fill="${heart}" stroke-width=".6"/>`;
  };

  // ---- the hobbit: head and upper body in one drawing (head units) ----
  const ALM = 'M-9,0Q0,-11 9,0Q0,8.500 -9,0Z';
  const hp = (u) => `url(#hbp${u})`, hq = (u) => `url(#hbq${u})`;
  const eye = (s, u) => `<g transform="translate(${15 * s},-5)"><g class="hobbit-eye"><ellipse cy="-.5" rx="12" ry="9.500" fill="#7a4a34" opacity=".15"/>
<g clip-path="url(#hbc${u})"><path d="${ALM}" fill="#efe6d0"/><path d="M-10,-8H10V-2.800H-10Z" fill="#3d281b" opacity=".24"/>
<g class="hobbit-pm"><g class="hobbit-pg"><circle r="4.800" fill="#6a4a26"/><circle r="2.400" fill="#120b07"/><circle cx="-1.600" cy="-1.700" r="1.200" fill="#fff8e6"/></g></g>
<g class="hobbit-bl"><path class="hobbit-lid" d="M-12,-26H12V-5.600Q0,-8 -12,-5.600Z"/></g><path class="hobbit-low" d="M-12,20H12V6.500Q0,4.500 -12,6.500Z"/></g>
<path d="${ALM}" fill="none" stroke="${INK}" stroke-width="1.100"/><path d="M-9,.3Q0,-10.700 9,.3" fill="none" stroke="${INK}" stroke-width="2.100" stroke-linecap="round"/>
<path d="M${9 * s},-1.500l${3.5 * s},-2M${9.5 * s},1l${3.5 * s},.5" fill="none" stroke="${INK}" stroke-width=".8" stroke-linecap="round" opacity=".7"/></g></g>`;
  const BROW = `<path d="M-9,2.500C-6,-3 3,-5 10,-1.500C11.500,-.5 11,2 9,1.500C3,0 -3,1 -7,4C-8.500,5 -9.500,4 -9,2.500Z" fill="#5f3f26" stroke="${INK}" stroke-width="1.200" stroke-linejoin="round"/><path d="M-5.500,2l1.800,-3.800M-1.500,.6l1.800,-4M2.500,0l1.800,-3.600M6.500,0l2,-2.800" fill="none" stroke="#b08a62" stroke-width=".9" stroke-linecap="round"/>`;
  const CURL = [[-41, -8], [-43, -22], [-37, -33], [-28, -41], [-16, -47], [-4, -50], [8, -49], [20, -45], [30, -38], [37, -27], [37, -11], [-23, -32], [-9, -36], [5, -37], [18, -33], [-31, -24], [27, -25]];
  const mouths = `<g transform="translate(0,23)" fill="none" stroke="${INK}" stroke-linecap="round" stroke-linejoin="round">
<g class="hobbit-mo hobbit-m-sm"><path d="M-10,-1.500Q0,7 10,-1.500" stroke-width="2.100"/><path d="M-12,-3.500q-1.500,1.500 -.5,3.500M12,-3.500q1.500,1.500 .5,3.500" stroke-width="1.100"/><path d="M-4,7.800Q0,9.300 4,7.800" stroke-width=".9" opacity=".5"/></g>
<g class="hobbit-mo hobbit-m-gr"><path d="M-12,-2Q0,2.500 12,-2Q10,11 0,11.500Q-10,11 -12,-2Z" fill="#4a1f18" stroke-width="1.700"/><path d="M-10.500,-1.200Q0,3 10.500,-1.200L9.500,2.600Q0,6.200 -9.500,2.600Z" fill="#f3ecd9" stroke-width=".7"/><path d="M-5,9.800Q0,6.800 5,9.800Q0,11.300 -5,9.800Z" fill="#c2604e" stroke="none"/><path d="M-14,-4.500q-1.500,1.500 -.5,3.500M14,-4.500q1.500,1.500 .5,3.500" stroke-width="1.100"/></g>
<g class="hobbit-mo hobbit-m-fl"><path d="M-7,2.500Q0,3.500 7,1.500" stroke-width="2.100"/><path d="M-3,7.500Q0,8.500 3,7.500" stroke-width=".9" opacity=".5"/></g>
<g class="hobbit-mo hobbit-m-fr"><path d="M-8.500,5Q0,-2.500 8.500,5" stroke-width="2.100"/><path d="M-3.500,8.800Q0,7.300 3.500,8.800" stroke-width="1" opacity=".6"/></g>
<g class="hobbit-mo hobbit-m-st"><path d="M-9.500,4.500L-7,2Q0,1 7,2L9.500,4.500" stroke-width="2.100"/><path d="M-3,7.500H3" stroke-width=".9" opacity=".5"/></g></g>`;
  const body = (u) => `<path d="M-52,116L-54,74C-54,58 -42,50 -24,46L24,46C42,50 54,58 54,74L52,116Z" fill="#ebe3cf" stroke-width="2.200"/>
<path d="M-52,116L-54,74C-54,58 -42,50 -30,47C-42,58 -44,76 -43,116Z" fill="${hp(u)}" stroke="none"/>
<path d="M-45,68q3,8 1,18M46,70q-3,8 -1,16M-49,94q4,3 7,1M40,60q5,4 7,10" fill="none" stroke-width="1.100" opacity=".7"/>
<path d="M-31,116L-34,70C-33,57 -25,50 -16,46L-5,60L0,57L5,60L16,46C25,50 33,57 34,70L31,116Z" fill="url(#hbv${u})" stroke-width="2"/>
<path d="M-31,116L-34,70C-33,57 -25,50 -16,46L-12,51C-22,60 -24,76 -22,116Z" fill="${hp(u)}" stroke="none"/>
<path d="M-31,116L-34,70C-33,60 -29,54 -24,50C-29,60 -30,76 -28,116Z" fill="${hq(u)}" stroke="none"/>
<path d="M0,57V116M17,77h13M-28,77h11" fill="none" stroke-width="1.300"/>
<path d="M4,75Q14,86 25,77.500" fill="none" stroke-width="2.800"/><path d="M4,75Q14,86 25,77.500" fill="none" stroke="#f0d98a" stroke-width="1.400" stroke-dasharray="2 1.400"/>
<g fill="#f0d98a" stroke-width="1.100"><circle cx="4" cy="65" r="3.300"/><circle cx="4" cy="75.500" r="3.300"/><circle cx="4" cy="86" r="3.300"/></g>
<g fill="#fffbe6" stroke="none"><circle cx="5" cy="64" r=".9"/><circle cx="5" cy="74.500" r=".9"/><circle cx="5" cy="85" r=".9"/></g>
<g class="hobbit-ros" transform="translate(-19,70)">${rosette(7.5, YEL, CRM, RED, RED)}</g>
<g class="hobbit-bfl">${flower(22, 59, 6.5, '#f8f3e4')}<path d="M19,64q-3,2 -5,1" fill="none" stroke="${GRN}" stroke-width="1.600"/></g>`;
  const head = (u) => `<svg class="rig-s hobbit-head rig-rim" xmlns="${NS}" width="${140 * HS}" height="${180 * HS}" viewBox="-70 -64 140 180"><defs><clipPath id="hbc${u}"><path d="${ALM}"/></clipPath></defs>
<g filter="url(#hbf${u})" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">
${body(u)}
<path d="M-12,26L-13.500,49Q0,56 13.500,49L12,26Z" fill="#b98c6e" stroke-width="1.800"/><path d="M-12.500,30Q0,45 12.500,30L13,42Q0,52 -13,42Z" fill="#6b3f2a" opacity=".3" stroke="none"/>
<path d="M-14,43L-24,49L-10,59L-2,50ZM14,43L24,49L10,59L2,50Z" fill="#f6f0df" stroke-width="1.600"/>
<path d="M-7,49Q0,46 7,49L5.500,58.500Q0,62 -5.500,58.500Z" fill="${GRN}" stroke-width="1.500"/><path d="M-3,50.500q1,4 0,7.500" fill="none" stroke-width=".8" opacity=".7"/>
<path d="M-37,6C-45,2 -47,-8 -42,-14C-49,-20 -46,-33 -37,-35C-39,-45 -27,-52 -18,-47C-13,-55 0,-56 5,-49C11,-56 25,-53 27,-45C36,-48 44,-40 40,-32C47,-27 48,-17 42,-13C47,-7 45,3 37,6L33,-10L-33,-10Z" fill="url(#hbh${u})" stroke-width="2.200"/>
<path d="M-33,-8C-38,-13 -44,-19 -49,-25C-50,-14 -47,-3 -42,3C-39,6 -35,5 -33,1Z" fill="#c2937a" stroke-width="1.800"/><path d="M-37,-9C-40,-12 -43,-15 -45.500,-18.500C-45.500,-12 -44,-7 -41,-3" fill="none" stroke-width="1"/>
<path d="M33,-8C38,-13 44,-19 49,-25C50,-14 47,-3 42,3C39,6 35,5 33,1Z" fill="#e6c2a0" stroke-width="1.800"/><path d="M37,-9C40,-12 43,-15 45.500,-18.500C45.500,-12 44,-7 41,-3" fill="none" stroke-width="1"/>
<path d="M-33,-10C-35,-30 -20,-40 0,-40C20,-40 35,-30 33,-10C38,0 38,16 30,26C22,35 10,38 0,38C-10,38 -22,35 -30,26C-38,16 -38,0 -33,-10Z" fill="url(#hbs${u})" stroke-width="2.200"/>
<path d="M-33,-10C-35,-30 -20,-40 -6,-40C-20,-32 -25,-14 -25,-4C-28,8 -27,20 -19,33C-25,31 -28,28 -30,26C-38,16 -38,0 -33,-10Z" fill="#6b3f2a" opacity=".14" stroke="none"/>
<path d="M-33,-10C-35,-30 -20,-40 -6,-40C-20,-32 -25,-14 -25,-4C-28,8 -27,20 -19,33C-25,31 -28,28 -30,26C-38,16 -38,0 -33,-10Z" fill="${hp(u)}" stroke="none"/>
<path d="M-34,-4C-38,6 -37,18 -30,26C-33,16 -33,6 -31,-4Z" fill="${hq(u)}" stroke="none"/>
<path d="M-26,29C-14,40 14,40 26,29C16,34 -16,34 -26,29Z" fill="#6b3f2a" opacity=".2" stroke="none"/>
<ellipse cx="-21" cy="10" rx="9.500" ry="6.500" fill="#c2553e" opacity=".27" stroke="none"/><ellipse cx="21" cy="10" rx="9.500" ry="6.500" fill="#c2553e" opacity=".27" stroke="none"/>
<path d="M-12,12C-17,15 -19,20 -18,26M12,12C17,15 19,20 18,26" fill="none" stroke-width="1" opacity=".7"/><path d="M-6,32.500Q0,35.500 6,32.500" fill="none" stroke-width=".9" opacity=".6"/>
<g fill="#8a5a3c" stroke="none" opacity=".7"><circle cx="-24" cy="6" r=".9"/><circle cx="-19" cy="4.500" r=".9"/><circle cx="-21.500" cy="9" r=".8"/><circle cx="20" cy="5" r=".9"/><circle cx="24.500" cy="7" r=".9"/><circle cx="22" cy="10" r=".8"/></g>
<path d="M-3,-4C-4,3 -8,6 -8,10.500C-8,15 -3.500,16.500 0,15.500C3.500,16.500 8,15 8,10.500C8,6 4,3 3,-4Z" fill="#d9a886" stroke="none"/>
<ellipse cx="0" cy="10.500" rx="6.800" ry="4.600" fill="#c2553e" opacity=".22" stroke="none"/><ellipse cx="2.600" cy="8" rx="2.200" ry="3.200" fill="#f8e6cc" opacity=".6" stroke="none"/>
<path d="M-3,-3C-4,3 -8,6 -8,10.500C-8,15 -3.500,16.500 -1,15.500C-5.500,12 -5.500,6 -1.500,-1Z" fill="${hp(u)}" stroke="none"/>
<path d="M-7.800,8.500C-9.500,15 -3.500,17.200 0,15.700C3.500,17.200 9.500,15 7.800,8.500" fill="none" stroke-width="1.600"/><path d="M-4.500,14.500q2,1.500 3.800,.3M4.500,14.500q-2,1.500 -3.800,.3" fill="none" stroke-width=".9"/>
<path d="M-34,-12C-36,-24 -30,-34 -20,-37C-10,-42 10,-42 20,-37C30,-34 36,-24 34,-12C30,-18 27,-25 21,-23C17,-29 9,-28 6,-23C1,-29 -7,-28 -10,-23C-16,-28 -24,-25 -26,-19C-30,-18 -32,-15 -34,-12Z" fill="url(#hbh${u})" stroke-width="1.900"/>
<path d="M-37,6C-45,2 -47,-8 -42,-14C-49,-20 -46,-33 -37,-35C-39,-45 -27,-52 -18,-47C-23,-40 -31,-36 -31,-27C-35,-21 -36,-12 -34,-5C-34,0 -35,4 -37,6Z" fill="${hp(u)}" stroke="none"/>
<path d="${CURL.map(([x, y]) => `M${x},${y}c2.500,-3.500 7,-2 5.500,2c-1,2.500 -4.500,2.500 -4.500,0`).join('')}" fill="none" stroke-width="1" opacity=".85"/>
<path d="${CURL.map(([x, y]) => `M${x + 1},${y - 2.2}c2,-2 5,-1.500 5.500,.5`).join('')}" fill="none" stroke="#c9a47a" stroke-width="1.300"/>
</g>
${eye(-1, u)}${eye(1, u)}
<g transform="translate(-14.5,-18.5)"><g class="hobbit-bL"><g transform="scale(-1,1)">${BROW}</g></g></g><g transform="translate(14.5,-18.5)"><g class="hobbit-bR">${BROW}</g></g>
${mouths}
<g class="hobbit-pipe" filter="url(#hbf${u})" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round"><path d="M6,25C18,27 27,34 33,46" fill="none" stroke-width="4.400"/><path d="M6,25C18,27 27,34 33,46" fill="none" stroke="#6a4526" stroke-width="2.200"/>
<path d="M27,42H43L41.500,56Q35,61.500 28.500,56Z" fill="#7a4d2a" stroke-width="1.900"/><path d="M27,42H32L32.500,58.500Q29.500,57.500 28.500,56Z" fill="#000" opacity=".3" stroke="none"/><path d="M39.500,46q.5,5 -1.500,9" fill="none" stroke="#d9b08a" stroke-width="1" opacity=".7"/>
<ellipse cx="35" cy="42" rx="8" ry="2.500" fill="#e8862e" stroke-width="1.400"/></g>
</svg>`;
  // the pipe's ember and a small wisp at the bowl (their own layer: they never stop)
  const wisp = () => Z('hobbit-wisp', 17.5, HCY + 20.5, '<b></b><i></i><i></i>');
  // tears (death): they run down his cheeks over a wet streak and stay on his face
  const tears = () => `<div class="rig-a hobbit-tears">${[[-10.2, 1, '5deg', 0], [5.2, 1, '-5deg', -2.4]].map(([x, y, a, dl]) => `<div class="hobbit-tear" style="left:${CX + x}px;top:${HCY + y}px;transform:rotate(${a})"><i style="--r:4px;--dl:${dl}s"></i><i style="--r:9px;--dl:${dl - 2.8}s"></i></div>`).join('')}</div>`;

  // ---- what he holds: a shirt-sleeved forearm rises from behind the rim (the elbow stays in the hamper) ----
  const arm = (u, ex, ey, hx, hy, w = 7.5) => {
    const dx = hx - ex, dy = hy - ey, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L, a = w / 2 + 1.4, b = w / 2;
    const at = (f, o) => `${n(ex + dx * f + nx * o)},${n(ey + dy * f + ny * o)}`;
    return `<path d="M${at(0, a)}L${at(.84, b + .8)}L${at(.84, -b - .8)}L${at(0, -a)}Z" fill="#ebe3cf" stroke-width="1"/><path d="M${at(0, -a)}L${at(.84, -b - .8)}L${at(.84, -b * .1)}L${at(0, -a * .2)}Z" fill="${HP(u)}" stroke="none"/><path d="M${at(.3, a * .8)}L${at(.42, -a * .3)}M${at(.55, a * .7)}L${at(.62, -a * .5)}" fill="none" stroke-width=".5" opacity=".7"/><path d="M${at(.8, b + 1.3)}L${at(1, b + .6)}L${at(1, -b - .6)}L${at(.8, -b - 1.3)}Z" fill="#f8f3e4" stroke-width=".8"/>`;
  };
  const fist = (x, y, r = 4.4) => `<path d="M${x - r},${y}C${x - r},${n(y - r * 1.15)} ${x + r},${n(y - r * 1.15)} ${x + r},${y}C${x + r},${n(y + r * .9)} ${x - r},${n(y + r * .9)} ${x - r},${y}Z" fill="${SKIN}" stroke-width="1"/><path d="M${n(x - r * .5)},${n(y - r * .78)}v${n(r * .7)}M${x},${n(y - r * .86)}v${n(r * .75)}M${n(x + r * .5)},${n(y - r * .78)}v${n(r * .7)}" fill="none" stroke-width=".5"/>`;
  const PR = (cls, u, x, y, w, body, more = '') => `<div class="hobbit-p ${cls}">${S('rig-rim', x, y, w, RY - y + 8, G(u, body))}${more}</div>`;
  const E = RY + 3;
  const rocket = (u, x, drop, c1, c2) => `<div class="rig-z hobbit-rkt" style="left:${CX + x}px;top:${RY + 2 + drop}px">${SL('rig-rim', -7, -38, 14, 46, G(u, `<path d="M0,6V-10" fill="none" stroke-width="2.400"/><path d="M0,6V-10" fill="none" stroke="#c9a468" stroke-width="1.100"/>
<path d="M-3,-27H3V-9H-3Z" fill="${c1}" stroke-width="1"/><path d="M-3,-27H-.8V-9H-3Z" fill="#000" opacity=".25" stroke="none"/><path d="M-3,-21H3V-18H-3ZM-3,-14.500H3V-12.500H-3Z" fill="${c2}" stroke-width=".5"/>
<path d="M-4,-27L0,-36L4,-27Z" fill="${c2}" stroke-width="1"/><path d="M1.500,-10q1.500,2 .5,4" fill="none" stroke-width=".7"/>`))}${SL('hobbit-tail', -6, 4, 12, 30, `<g fill="none" stroke-linecap="round"><path d="M0,6V26" stroke="#ffd98a" stroke-width="2.200" stroke-dasharray="3 2.500"/><path d="M-2.500,7L-4,20M2.500,7L4,18" stroke="#ffb04a" stroke-width="1.200" stroke-dasharray="2 3"/><path d="M0,5V12" stroke="#fff6d6" stroke-width="2.600"/></g>`)}</div>`;
  const burstArt = () => {
    let s = '';
    for (let i = 0; i < 10; i++) s += `<g transform="rotate(${i * 36 + 8})"><path d="M0,-4V-11" stroke="${i % 2 ? '#ffd76a' : '#ff9a6a'}" stroke-width="1.300" stroke-dasharray="2.600 1.200"/><path d="M0,-11q2,-1.500 1,-3.500" stroke="#fff3c4" stroke-width="1"/><circle cy="-15" r=".9" fill="#fff3c4"/></g>`;
    return Z('hobbit-burst', -99, 40, SL('', -17, -17, 34, 34, `<g fill="none" stroke-linecap="round">${s}</g><circle r="1.800" fill="#fff8e0"/>`));
  };
  // the rockets stand in the corner of the hamper, leaning out; the burst is where the first one ends
  const rockets = (u) => `<div class="hobbit-p hobbit-rk">${rocket(u, -45.5, 13, '#4f7a3c', YEL)}${rocket(u, -42, 7, BLU, CRM)}${rocket(u, -48, 0, RED, YEL)}${burstArt()}</div>`;
  const props = (u) => {
    // the mushroom he is not sure about (unrated)
    return PR('hobbit-mush', u, 24, HCY - 2, 32, `${arm(u, 38, E, 39, 229)}<g transform="translate(39,224)"><g class="hobbit-mu"><path d="M-2,1L-2.500,-9H2.500L2,1Z" fill="#efe6d0" stroke-width=".9"/><path d="M-10,-9C-10,-19 10,-19 10,-9Q0,-6 -10,-9Z" fill="#a8452f" stroke-width="1"/><path d="M-10,-9C-10,-19 -1,-18.500 -3,-16C-6,-14 -7,-11 -6,-8.200Q-8,-8.500 -10,-9Z" fill="#000" opacity=".25" stroke="none"/><g fill="#f3ead0" stroke-width=".4"><circle cx="-3.500" cy="-13" r="1.400"/><circle cx="2.500" cy="-14.500" r="1.200"/><circle cx="5.500" cy="-11" r="1.100"/></g><path d="M-6,-8q6,1.500 12,0" fill="none" stroke-width=".5" opacity=".7"/></g></g>${fist(39, 227)}`)
      // a mug of tea (meh)
      + PR('hobbit-tea', u, 24, HCY + 8, 32, `${arm(u, 38, E, 39, 233)}<path d="M41,220C47.500,220 47.500,229 41,229" fill="none" stroke-width="3.200"/><path d="M41,220C47.500,220 47.500,229 41,229" fill="none" stroke="#8fa3ad" stroke-width="1.500"/>
<path d="M29.500,217H41.500L40.500,231H30.500Z" fill="#8fa3ad" stroke-width="1"/><path d="M29.500,217H33L33.500,231H30.500Z" fill="${HP(u)}" stroke="none"/><path d="M30,221.500H41M30.300,224H40.800" fill="none" stroke="#e6e2d2" stroke-width=".9"/>
<ellipse cx="35.500" cy="217" rx="6" ry="1.700" fill="#7a4a26" stroke-width=".9"/>${fist(40.5, 229.5, 4.2)}`)
      // a pie from the oven (great)
      + PR('hobbit-pie', u, 22, HCY + 6, 36, `${arm(u, 38, E, 40, 235)}${fist(40, 233, 4.6)}<g class="hobbit-pg2"><path d="M27,225Q39,229.500 51,225L48.500,230.500Q39,233 29.500,230.500Z" fill="#8d949b" stroke-width="1"/>
<path d="M27,225C28,215 50,215 51,225Q39,228.500 27,225Z" fill="#d9a655" stroke-width="1"/><path d="M27,225C28,215 38,215.500 35,217.500C31,219.500 30,222.500 31,226Q29,225.600 27,225Z" fill="#7a4a1c" opacity=".3" stroke="none"/>
<path d="M27,225q2,-2 4,.6q2,-2 4,.7q2,-1.800 4,.6q2,-2 4,-.4q2,-2.200 4,-.6q2,-2 4,-1" fill="none" stroke-width=".7"/><path d="M36,219.500l-1,3M39.500,218.800v3M43,219.500l1,3" fill="none" stroke-width=".9"/><path d="M42,217.500q4,.6 6,3.500" fill="none" stroke="#fff3c4" stroke-width=".9" opacity=".8"/></g>`)
      // a tankard of the Green Dragon's best (superb)
      + `<div class="hobbit-p hobbit-ale"><div class="rig-a hobbit-ty">${S('rig-rim', 24, HCY, 32, RY - HCY + 8, G(u, `${arm(u, 38, E, 40.5, 231)}
<path d="M43,214C49.500,214 49.500,226 43,226" fill="none" stroke-width="3.400"/><path d="M43,214C49.500,214 49.500,226 43,226" fill="none" stroke="${BRASS}" stroke-width="1.700"/>
<path d="M31,212H43L42.400,229H31.600Z" fill="#8a6238" stroke-width="1"/><path d="M31,212H35L35.300,229H31.600Z" fill="${HP(u)}" stroke="none"/><path d="M35,213V228.500M39,213V228.500" fill="none" stroke-width=".45" opacity=".7"/>
<path d="M31.100,215.500h11.800v2.200h-11.700ZM31.400,224.500h11.100v2.200h-11Z" fill="${BRASS}" stroke-width=".7"/>
<path d="M30,212.500C27.500,208.500 32,206 34.500,208C36,204 41.500,205 42,208C46,207 47,211.500 44,212.500Z" fill="#f6f0df" stroke-width=".9"/><path d="M31,212.500c-.6,3 .2,5 1.200,6.500c.8,-2 .4,-4.500 1,-6.500Z" fill="#f6f0df" stroke-width=".7"/>${fist(44, 222, 4.3)}`))}</div></div>`
      // a lit taper for the rockets (superb, level up)
      + PR('hobbit-tap', u, -44, HCY, 22, `${arm(u, -35, E, -33, 234)}<path d="M-33,232L-31.500,213" fill="none" stroke-width="2.600"/><path d="M-33,232L-31.500,213" fill="none" stroke="#efe6cc" stroke-width="1.300"/>${fist(-33, 232, 4.3)}`,
        Z('hobbit-tf', -31.5, 213, SL('', -3.5, -9, 7, 10, '<path d="M0,0C-2.800,-2 -2.200,-5.500 0,-8.500C2.200,-5.500 2.800,-2 0,0Z" fill="#ffe9a8" stroke="#d07a22" stroke-width=".7"/><path d="M0,-.6C-1,-1.500 -1,-3 0,-4.500C1,-3 1,-1.500 0,-.6Z" fill="#fffbe6"/>')))
      // a short sword, held upright (player kill)
      + PR('hobbit-swd', u, -52, HCY - 22, 30, `${arm(u, -36, E, -37, 234)}<g transform="translate(-37,231) rotate(-9)"><g class="hobbit-sw"><path d="M-2.300,-5C-3.600,-15 -3.300,-29 0,-41C3.300,-29 3.600,-15 2.300,-5Z" fill="#cfd6da" stroke-width="1"/><path d="M-2.300,-5C-3.600,-15 -3.300,-29 0,-41L0,-5Z" fill="#000" opacity=".2" stroke="none"/><path d="M0,-7V-34" fill="none" stroke-width=".5" opacity=".7"/><path d="M1.300,-10C2,-18 1.800,-26 .8,-33" fill="none" stroke="#fff" stroke-width=".8" opacity=".8"/>
<path d="M-6.500,-5.500H6.500V-2.800H-6.500Z" fill="${BRASS}" stroke-width=".9"/><path d="M-1.300,-2.800H1.300V6H-1.300Z" fill="#5a3a22" stroke-width=".8"/><circle cx="0" cy="7.500" r="2" fill="${BRASS}" stroke-width=".8"/></g></g>${fist(-37, 232, 4.5)}`)
      // his pocket handkerchief (death)
      + PR('hobbit-hank', u, -48, HCY + 8, 34, `${arm(u, -37, E, -24, 232)}<path d="M-29,224C-27,219 -19,219 -17,223C-15.500,227 -17,231 -18,238L-21,233L-23.500,240L-26,232C-29,230 -30,227 -29,224Z" fill="#f3eee0" stroke-width="1"/><path d="M-26,223q3,4 2,9M-21,222q2,5 0,10M-27,227q-1,2 0,4" fill="none" stroke-width=".5" opacity=".7"/><path d="M-29,224C-27,219 -23,219.500 -24,221.500C-26,224 -26.500,228 -26,232C-29,230 -30,227 -29,224Z" fill="${HP(u)}" stroke="none"/>${fist(-24, 231, 4.4)}`);
  };
  // his hands on the rim when they are free
  const hands = (u) => {
    const h = (cls, x) => `<g class="${cls}">${[-5.4, -1.8, 1.8, 5.4].map((o, i) => { const fx = x + o, t = RY - 4.6 + (i % 3 ? 0 : .8); return `<path d="M${n(fx - 1.7)},${n(t + 1.5)}C${n(fx - 1.7)},${n(t - 1)} ${n(fx + 1.7)},${n(t - 1)} ${n(fx + 1.7)},${n(t + 1.5)}V${RY + 2.2}C${n(fx + 1.7)},${RY + 4.4} ${n(fx - 1.7)},${RY + 4.4} ${n(fx - 1.7)},${RY + 2.2}Z" fill="${SKIN}" stroke-width=".9"/><path d="M${n(fx - 1)},${n(t + 2.6)}h2" fill="none" stroke-width=".45"/>`; }).join('')}</g>`;
    return S('rig-rim', -56, RY - 10, 112, 20, G(u, h('hobbit-hL', -31) + h('hobbit-hR', 31)));
  };

  // ---- the picnic hamper: wicker, a braided rim, a leather strap, a gingham cloth over the edge ----
  const basket = (u) => {
    let st = '';
    for (const x of [-42, -31, -20, -9, 2, 13, 24, 35, 45]) st += `M${x},${RY + 3}L${n(x * .915)},${BY - 1}`;
    let br = '';
    for (let x = -51; x < 52; x += 4.2) br += `M${n(x)},${RY + 3}l2.600,-5.500`;
    return S('rig-rim', -62, RY - 6, 124, BY - RY + 14, `${G(u, `
<path d="M-52,${RY + 1}L-47,${BY - 2}Q0,${BY + 2} 47,${BY - 2}L52,${RY + 1}Z" fill="url(#hbw${u})" stroke-width="1.1"/>
<path d="M-52,${RY + 1}L-47,${BY - 2}Q0,${BY + 2} 47,${BY - 2}L52,${RY + 1}Z" fill="url(#hbk${u})" stroke="none"/>
<path d="M-52,${RY + 1}L-47,${BY - 2}Q-35,${BY - .5} -25,${BY}L-28,${RY + 1}Z" fill="${HP(u)}" stroke="none"/><path d="M-52,${RY + 1}L-47,${BY - 2}Q-42,${BY - 1.3} -38,${BY - 1}L-41,${RY + 1}Z" fill="${HQ(u)}" stroke="none"/>
<path d="${st}" fill="none" stroke-width=".7" opacity=".6"/>
<path d="M-48.500,${BY - 7}Q0,${BY - 3} 48.500,${BY - 7}L47.500,${BY - 2}Q0,${BY + 2} -47.500,${BY - 2}Z" fill="#8a6a3c" stroke-width=".9"/>
<path d="M-27,${RY + 2}L-25.500,${BY - 1}H-19.500L-21,${RY + 2}Z" fill="#6a4526" stroke-width=".9"/><rect x="-27.600" y="${RY + 11}" width="8" height="6.500" rx="1" fill="none" stroke-width="2.600"/><rect x="-27.600" y="${RY + 11}" width="8" height="6.500" rx="1" fill="none" stroke="#f0d98a" stroke-width="1.300"/><path d="M-23.600,${RY + 12}v5" fill="none" stroke-width=".8"/>
<path d="M13,${RY - 1}H45L45.500,${RY + 10}L39,${RY + 17}L31,${RY + 11.5}L22.500,${RY + 16}L12.500,${RY + 9}Z" fill="#f3ead0" stroke-width="1"/><path d="M13,${RY - 1}H45L45.500,${RY + 10}L39,${RY + 17}L31,${RY + 11.5}L22.500,${RY + 16}L12.500,${RY + 9}Z" fill="url(#hbg${u})" stroke="none"/>
<path d="M24,${RY + 3}q-1,6 -1.500,12M33,${RY + 3}q-1,4 -2,8M40,${RY + 3}q0,7 -1,13" fill="none" stroke-width=".5" opacity=".6"/>
<rect x="-54" y="${RY - 3}" width="108" height="6.500" rx="3.200" fill="#b8935a" stroke-width="1.1"/><path d="${br}" fill="none" stroke-width=".7" opacity=".8"/><path d="M-50,${RY - 1.6}H50" fill="none" stroke="#f0dcae" stroke-width=".8" opacity=".6"/>
<rect x="12" y="${RY - 3.5}" width="34" height="7.500" rx="3" fill="#f3ead0" stroke-width="1"/><rect x="12" y="${RY - 3.5}" width="34" height="7.500" rx="3" fill="url(#hbg${u})" stroke="none"/>`)}
<g fill="none"><circle cx="-44" cy="${BY + 1}" r="2.600" stroke="#17120e" stroke-width="2"/><circle cx="-44" cy="${BY + 1}" r="2.600" stroke="#e3c268" stroke-width=".8"/><circle cx="44" cy="${BY + 1}" r="2.600" stroke="#17120e" stroke-width="2"/><circle cx="44" cy="${BY + 1}" r="2.600" stroke="#e3c268" stroke-width=".8"/></g>`);
  };
  // a string of onions hung on the hamper's side (it dangles)
  const onions = (u) => {
    const on = (x, y, r, f) => `<path d="M${x},${n(y - r - 1.6)}q.8,1 .3,2" fill="none" stroke-width=".8"/><path d="M${x - r},${y}C${x - r},${n(y - r * 1.2)} ${x + r},${n(y - r * 1.2)} ${x + r},${y}C${x + r},${n(y + r * 1.1)} ${x - r},${n(y + r * 1.1)} ${x - r},${y}Z" fill="${f}" stroke-width=".9"/><path d="M${n(x - r * .4)},${n(y - r * .7)}Q${n(x - r * .8)},${y} ${n(x - r * .3)},${n(y + r * .7)}M${n(x + r * .2)},${n(y - r * .8)}Q${n(x + r * .7)},${y} ${n(x + r * .2)},${n(y + r * .8)}" fill="none" stroke-width=".45" opacity=".7"/>`;
    return Z('hobbit-on', -53, RY + 1, SL('rig-rim', -9, -2, 18, 30, G(u, `${ink2('M0,0V17', 1, '#c9b07c', 'stroke-dasharray="2 1.200"')}${on(-2.5, 8, 3.6, '#c98a4a')}${on(2.6, 13.5, 3.8, '#b9743a')}${on(-2, 19.5, 4, '#d09a58')}`)));
  };

  // ---- the burner: a brass kettle-stove hung on two little chains under the mouth; the fire comes out of its top ----
  const burner = (u) => S('rig-rim', -28, HG, 58, FY - HG + 18, G(u, `
${ink2(`M-19,${HG + 4}L-12.500,${FY + 2.5}M19,${HG + 4}L12.500,${FY + 2.5}`, 1.1, '#c9a45c', 'stroke-dasharray="2.200 1.500"')}
<path d="M14,${FY + 5.5}C20,${FY + 4.5} 20,${FY - .5} 24,${FY - 2.5}L26.500,${FY}C23,${FY + 3.5} 23,${FY + 10} 14,${FY + 11}Z" fill="url(#hbb${u})" stroke-width="1"/>
<path d="M-12,${FY}C-18.500,${FY + 3} -18.500,${FY + 11} -10,${FY + 14}H10C18.500,${FY + 11} 18.500,${FY + 3} 12,${FY}Z" fill="url(#hbb${u})" stroke-width="1.1"/>
<path d="M-12,${FY}C-18.500,${FY + 3} -18.500,${FY + 11} -10,${FY + 14}H-5C-11,${FY + 10} -11,${FY + 4} -7,${FY}Z" fill="${HP(u)}" stroke="none"/>
<path d="M10.500,${FY + 5}Q13.500,${FY + 8} 10,${FY + 12}" fill="none" stroke="#fff6d6" stroke-width="1" opacity=".75"/>
<circle cx="0" cy="${FY + 9.3}" r="3.600" fill="#3a2414" stroke-width=".9"/><path class="hobbit-slit" d="M-1.800,${FY + 7.8}v3M0,${FY + 7.3}v4M1.800,${FY + 7.8}v3" fill="none" stroke-width="1.100"/>
<ellipse class="hobbit-coal" cx="0" cy="${FY - .4}" rx="11.500" ry="2" stroke-width=".9"/>
<path d="M-13.500,${FY + .2}Q0,${FY + 3.8} 13.500,${FY + .2}L13.500,${FY + 2.6}Q0,${FY + 6.2} -13.500,${FY + 2.6}Z" fill="#e9cc74" stroke-width=".9"/>
<path d="M-7.500,${FY + 14}l-1.500,2.300M7.500,${FY + 14}l1.500,2.300" fill="none" stroke-width="1.800"/><circle cx="0" cy="${FY + 14.8}" r="1.400" fill="#e9cc74" stroke-width=".8"/>`))
    + Z('hobbit-coalg', 0, FY - 1);

  // ---- the envelope: cloth in nine gores; the helpers lay bands, scallops, garlands and bunting on the surface ----
  const KS = [-1, -.93, -.74, -.45, -.15, .15, .45, .74, .93, 1];
  const mid = (a, b) => Math.sin((Math.asin(a) + Math.asin(b)) / 2);
  const panels = (g, cols) => KS.slice(0, -1).map((k, i) => `<path d="${g.gore(k, KS[i + 1])}" fill="${cols[i % cols.length]}" stroke="none"/>`).join('');
  const seams = (g, stitch, o = {}) => KS.slice(1, -1).map((k) => `<path d="${g.seam(k)}" fill="none" stroke-width="${o.ink ?? .8}"/>${stitch ? `<path d="${g.seam(k + (k > 0 ? -.03 : .03))}" fill="none" stroke="${stitch}" stroke-width="${o.w || .8}" stroke-dasharray="${o.dash || '1.6 2.6'}" opacity="${o.op || .6}"/>` : ''}`).join('');
  const band = (g, u, t0, t1, fill, pat) => `<path d="${g.band(t0, t1)}" fill="${fill}" stroke-width="1"/>${pat ? `<path d="${g.band(t0, t1)}" fill="${pat}" stroke="none"/>` : ''}<path d="${g.band(t0, t1, -1, -.4)}" fill="${HP(u)}" stroke="none"/><path d="${g.lat(t0 + (t1 - t0) * .24, -.9, .93)}" fill="none" stroke="#fff" stroke-width=".8" opacity=".4"/>`;
  // the pavilion edge: a row of round lappets hanging from a latitude
  const scal = (g, t, num, depth, fills) => {
    const ks = g.along(num + 1, -.985, .985); let s = '';
    for (let i = 0; i < num; i++) { const a = g.pt(ks[i], t), b = g.pt(ks[i + 1], t), y = Math.max(a[1], b[1]) + depth * 1.33; s += `<path d="M${pp(a)}C${n(a[0])},${n(y)} ${n(b[0])},${n(y)} ${pp(b)}Z" fill="${fills[i % fills.length]}" stroke-width=".8"/>`; }
    return s;
  };
  // rows of arches (climbing, for a level gained)
  const arches = (g, t, num, dt, col) => { const ks = g.along(num + 1, -.985, .985); let d = ''; for (let i = 0; i < num; i++) d += `M${pp(g.pt(ks[i], t))}Q${pp(g.pt(mid(ks[i], ks[i + 1]), t - dt * 2))} ${pp(g.pt(ks[i + 1], t))}`; return ink2(d, 1.4, col); };
  const posies = (g, t, num, cols, r = 2.6, cen = YEL) => g.along(num, -.9, .9).map((k, i) => { const p = g.pt(k, t); return flower(p[0], p[1], r * (.6 + .4 * Math.sqrt(1 - k * k)), cols[i % cols.length], cen); }).join('');
  // a garland: green swags pinned up with flowers
  const garland = (g, t, num, dt, cols, r = 2.7) => {
    const ks = g.along(num + 1, -.97, .97); let d = '', fl = '';
    ks.forEach((k, i) => {
      const a = g.pt(k, t), f = .6 + .4 * Math.sqrt(1 - k * k);
      if (i < num) { const km = mid(k, ks[i + 1]), m = g.pt(km, t + dt); d += `M${pp(a)}Q${pp(g.pt(km, t + dt * 2))} ${pp(g.pt(ks[i + 1], t))}`; fl += flower(m[0], m[1], r * .75 * f, cols[(i + 1) % cols.length]); }
      fl += flower(a[0], a[1], r * f, cols[i % cols.length]);
    });
    return `${ink2(d, 1.7, '#5f8a3f')}${fl}`;
  };
  // bunting sewn on along a latitude
  const bunting = (g, t, num, cols, dt = .08) => {
    const a0 = Math.asin(-.94), a1 = Math.asin(.94); let s = '';
    for (let i = 0; i < num; i++) { const a = a0 + (a1 - a0) * i / (num - 1), w = (a1 - a0) / (num - 1) * .46; s += `<path d="M${pp(g.pt(Math.sin(Math.max(-1.57, a - w)), t))}L${pp(g.pt(Math.sin(a), t + dt))}L${pp(g.pt(Math.sin(Math.min(1.57, a + w)), t))}Z" fill="${cols[i % cols.length]}" stroke-width=".7"/>`; }
    return `${s}${ink2(g.lat(t), .8, '#f6f0df')}`;
  };
  // the round door, its knob in the exact middle
  const door = (r, fill, frame = '#3a2a18') => {
    let pl = '';
    for (const x of [-.5, 0, .5]) { const h = Math.sqrt(1 - x * x) * (r - 1.8); pl += `M${n(x * r)},${n(-h)}V${n(h)}`; }
    return `<circle r="${r}" fill="${frame}" stroke-width="1"/><circle r="${n(r - 1.8)}" fill="${fill}" stroke-width=".7"/><path d="${pl}" fill="none" stroke-width=".5" opacity=".65"/><path d="M${n(-r + 1.8)},${n(-r * .4)}h${n(r * .55)}M${n(-r + 1.8)},${n(r * .4)}h${n(r * .55)}" fill="none" stroke-width="1.400"/><circle r="${n(r * .19)}" fill="#f6e2a0" stroke-width=".7"/><path d="M${n(r * .35)},${n(-r * .6)}Q${n(r * .68)},${n(-r * .2)} ${n(r * .6)},${n(r * .3)}" fill="none" stroke="#fff" stroke-width=".8" opacity=".45"/>`;
  };
  const wreath = (r, num, cols, fr = 2.3) => { let s = ''; for (let i = 0; i < num; i++) { const a = i * 2 * Math.PI / num; s += flower(Math.cos(a) * r, Math.sin(a) * r, fr, cols[i % cols.length]); } return `<circle r="${r}" fill="none" stroke-width="2.800"/><circle r="${r}" fill="none" stroke="#5f8a3f" stroke-width="1.600"/>${s}`; };
  const cap = (c, fill, r = 8) => `<path d="M${n(c[0] - r)},${n(c[1] + 4)}Q${n(c[0])},${n(c[1] - r * .45)} ${n(c[0] + r)},${n(c[1] + 4)}Q${n(c[0])},${n(c[1] + r * .9)} ${n(c[0] - r)},${n(c[1] + 4)}Z" fill="${fill}" stroke-width="1"/>`;
  const ball = (c, fill, r = 3, neck = 3) => `<path d="M${n(c[0])},${n(c[1] + 1)}v${-neck - 1}" fill="none" stroke-width="2.600"/><circle cx="${n(c[0])}" cy="${n(c[1] - neck - r)}" r="${r}" fill="${fill}" stroke-width="1"/><circle cx="${n(c[0] + r * .35)}" cy="${n(c[1] - neck - r * 1.35)}" r="${n(r * .28)}" fill="#fffbe6" stroke="none"/>`;
  const girdle = (g, t, col) => ink2(g.lat(t), 1.4, col, 'stroke-dasharray="3 1.200"');
  const creases = (g, list) => `<path d="${list.map(([k, a, b]) => g.seam(k, a, b)).join('')}" fill="none" stroke-width=".7" opacity=".55"/>`;
  // the quilt: squares between the seams and six rows, some of them printed
  const TB = [0, .15, .31, .48, .65, .82, 1];
  const quilt = (g, u, cols) => {
    let s = '', ov = '';
    for (let j = 0; j < 6; j++) for (let i = 0; i < 9; i++) {
      const d = g.gore(KS[i], KS[i + 1], TB[j], TB[j + 1]);
      s += `<path d="${d}" fill="${cols[(i * 2 + j * 3 + (j > 2 ? 1 : 0)) % cols.length]}" stroke="none"/>`;
      if ((i * 5 + j * 3) % 7 === 0) ov += `<path d="${d}" fill="url(#hbd${u})" stroke="none"/>`; else if ((i + j * 4) % 9 === 3) ov += `<path d="${d}" fill="url(#hbt${u})" stroke="none"/>`;
    }
    return s + ov + TB.slice(1, -1).map((t) => `<path d="${g.lat(t)}" fill="none" stroke-width=".7"/><path d="${g.lat(t + .012)}" fill="none" stroke="#e2dccb" stroke-width=".8" stroke-dasharray="1.600 2.600" opacity=".7"/>`).join('');
  };
  const rays = (r0, r1, num) => { let d = ''; for (let i = 0; i < num; i++) { const a = i * 2 * Math.PI / num, f = i % 2 ? .72 : 1; d += `M${n(Math.sin(a) * r0)},${n(-Math.cos(a) * r0)}L${n(Math.sin(a) * r1 * f)},${n(-Math.cos(a) * r1 * f)}`; } return d; };
  const BURST = rays(4.5, 15, 14);

  const ENV = {
    // the old quilt off the spare bed: sagging, lopsided, dented, mended with what was in the rag bag
    poor: { cond: { sag: 1, lop: .8, dents: [{ side: -1, t: .5, depth: 14, span: .13 }, { side: 1, t: .3, depth: 7, span: .1 }] }, art: (g, u) => { const c = g.pt(0, 0); return {
      base: '#737a80', lip: '#8a7f6a', ring: '#8a7a5c',
      inside: `${quilt(g, u, ['#7a848d', '#8a8272', '#667069', '#94897e', '#6c6874', '#9a927c'])}${seams(g, '#e2dccb', { w: 1.2, dash: '2.4 3.4', op: .75 })}
${creases(g, [[-.8, .34, .72], [-.5, .42, .66], [.42, .68, .98], [-.32, .7, .98], [.78, .58, .9], [-.05, .74, .98], [.3, .04, .2]])}
${g.patch(.46, .4, 23, 18, { fill: `url(#hbg${u})`, rot: 11, sw: 1.1 })}${g.patch(-.36, .3, 19, 15, { fill: '#a55a44', rot: -9, stitch: '#eadfc3', sw: 1.1, hatch: HP(u) })}${g.patch(-.06, .63, 15, 19, { fill: '#d6cbb0', rot: 7, sw: 1 })}
${g.patch(.12, .17, 15, 11, { fill: '#5c6e58', rot: -16, stitch: '#eadfc3', hatch: HQ(u) })}${g.patch(-.7, .68, 13, 12, { fill: '#c9b98f', rot: 13 })}${g.patch(.4, .47, 9, 8, { fill: '#56616c', rot: -20, stitch: '#eadfc3' })}
${girdle(g, .82, '#b9a57a')}`,
      over: `${cap(c, '#6c6874', 6.5)}<path d="M${n(c[0] - 2)},${n(c[1] - 1)}l-3,-4.500M${n(c[0] + 1)},${n(c[1] - 1)}l3.500,-4" fill="none" stroke-width="1.100"/>`,
    }; } },
    // plain sacking, sound enough
    meh: { cond: { sag: .3, lop: -.12 }, art: (g, u) => { const c = g.pt(0, 0); return {
      base: '#b39a68', lip: '#96804f', ring: '#a08a5c',
      inside: `${panels(g, ['#b9a06c', '#ab9260'])}<path d="${g.out}" fill="url(#hbx${u})" stroke="none"/>${seams(g, '#efe6cc')}${creases(g, [[-.42, .74, .98], [.34, .76, .98]])}
${g.patch(.44, .3, 13, 11, { fill: '#9c8454', rot: 6 })}
<path d="${g.band(.5, .56)}" fill="#e6dcc0" stroke-width=".9"/><path d="${g.lat(.515)}${g.lat(.53)}${g.lat(.545)}" fill="none" stroke="#56718f" stroke-width="1"/>${girdle(g, .83, '#cdbb8e')}`,
      over: cap(c, '#8f7a4c'),
    }; } },
    // sound and full: good Shire green, a gingham band, the round door
    good: { cond: {}, art: (g, u) => { const c = g.pt(0, 0); return {
      base: GRN, lip: '#c9a45c', ring: '#c9a45c',
      inside: `${panels(g, ['#55843f', '#487336'])}${seams(g, '#e9e6c0')}
${band(g, u, .47, .575, CRM, `url(#hbg${u})`)}${ink2(g.lat(.47), .9, CRM)}${ink2(g.lat(.575), .9, CRM)}${band(g, u, .84, .875, BRASS)}
<g transform="${g.place(0, .25)}">${door(12.5, '#e3b53e')}</g>`,
      over: `${cap(c, '#3f6a30', 9)}${ball(c, BRASS, 3, 1)}`,
    }; } },
    // fine: buttercup yellow, a green scalloped band with daisies, a garland, the green door in a wreath
    great: { cond: { taut: .5 }, art: (g, u) => { const c = g.pt(0, 0), e = g.pt(0, .2); return {
      base: '#e0b23c', lip: BRASS, ring: '#f0d98a',
      inside: `${panels(g, ['#e6ba42', '#d5a534'])}${seams(g, '#fff3c4', { op: .8 })}
${garland(g, .37, 7, .05, ['#f8f3e4', '#d9573f', '#f8f3e4', '#6f8fc9'])}
${scal(g, .585, 13, 6.5, ['#487336'])}${band(g, u, .5, .59, GRN)}${ink2(g.lat(.5), .9, '#f6e9b8')}${posies(g, .547, 9, ['#f8f3e4'], 3)}
${band(g, u, .84, .88, GRN)}
<g transform="translate(${n(e[0])},${n(e[1])})">${wreath(15.5, 12, ['#f8f3e4', '#f8f3e4', '#d9573f'])}${door(11, '#4f8a3c')}</g>`,
      over: `${cap(c, BRASS, 9)}${ball(c, '#f0d98a', 3.4, 4)}`,
    }; } },
    // the Party pavilion, brand new
    superb: { cond: { taut: 1 }, art: (g, u) => {
      const c = g.pt(0, 0), e = g.pt(0, .185);
      let bob = '';
      g.along(12, -.985, .985).forEach((k, i, ks) => { if (i < ks.length - 1) { const a = g.pt(k, .885), b = g.pt(ks[i + 1], .885); bob += `<circle cx="${n((a[0] + b[0]) / 2)}" cy="${n(Math.max(a[1], b[1]) + 10)}" r="1.300" fill="#fff3c4" stroke-width=".5"/>`; } });
      return {
        base: RED, lip: YEL, ring: '#f6e2a0',
        inside: `${panels(g, ['#c8402c', '#f5ecd2'])}${seams(g, '#f0d27a', { op: .9 })}
${bunting(g, .345, 13, [YEL, '#4f8a3c', BLU, '#f8f3e4'])}
${band(g, u, .5, .605, YEL)}${ink2(g.lat(.5), 1.3, '#fff6d6')}${ink2(g.lat(.605), 1.3, '#fff6d6')}${posies(g, .553, 9, [RED, '#f8f3e4', BLU], 3.3, '#fff3c4')}
${garland(g, .64, 8, .055, ['#f8f3e4', '#e8c24a', '#f8f3e4', '#6f8fc9'])}
${band(g, u, .84, .885, YEL)}
<g transform="translate(${n(e[0])},${n(e[1])})"><circle r="17.500" fill="${CRM}" stroke-width="1.1"/>${wreath(14.2, 12, [RED, '#f8f3e4', BLU, '#e8c24a'], 2.4)}${door(10, '#4f8a3c')}</g>`,
        over: `${scal(g, .885, 11, 8.5, [YEL, '#4f8a3c'])}${bob}${cap(c, YEL, 10)}
<path d="M${n(c[0])},${n(c[1] + 1)}V${n(c[1] - 10.5)}" fill="none" stroke-width="2.400"/><path d="M${n(c[0])},${n(c[1] + 1)}V${n(c[1] - 10.5)}" fill="none" stroke="#f0d98a" stroke-width="1.100"/>
<path d="M${n(c[0] + .6)},${n(c[1] - 10.5)}L${n(c[0] + 12)},${n(c[1] - 9)}L${n(c[0] + 8)},${n(c[1] - 6.8)}L${n(c[0] + 12)},${n(c[1] - 4.2)}L${n(c[0] + .6)},${n(c[1] - 3.6)}Z" fill="${RED}" stroke-width=".9"/><circle cx="${n(c[0])}" cy="${n(c[1] - 11)}" r="1.700" fill="#f6e2a0" stroke-width=".7"/>`,
      };
    } },
    // unrated: a toile in white calico, tacked together and not yet judged
    calibrating: { cond: { sag: .12 }, art: (g, u) => { const c = g.pt(0, 0); const pin = (k, t, a) => { const p = g.pt(k, t); return `<g transform="translate(${n(p[0])},${n(p[1])}) rotate(${a})"><path d="M0,0V8" fill="none" stroke="#5a554c" stroke-width=".8"/><circle r="1.500" fill="${RED}" stroke-width=".5"/></g>`; }; return {
      base: '#e6e0d0', lip: '#b9b3a2',
      inside: `${panels(g, ['#ebe5d6', '#dfd8c6'])}${seams(g, BLU, { ink: .5, w: 1.2, dash: '4 3', op: .9 })}
<path d="${g.lat(.62)}${g.lat(.86)}" fill="none" stroke="${BLU}" stroke-width="1.200" stroke-dasharray="4 3" opacity=".9"/>
<g transform="${g.place(0, .3)}"><circle r="14.500" fill="#f3eee0" stroke-width="1"/><circle r="14.500" fill="none" stroke="#b08a55" stroke-width="2.600"/><circle r="14.500" fill="none" stroke="#e0c08a" stroke-width=".8"/><circle r="12.600" fill="none" stroke-width=".7"/><circle r="16.200" fill="none" stroke-width=".7"/>
<rect x="-2.500" y="-19.500" width="5" height="4" rx=".8" fill="#e3c268" stroke-width=".8"/><g fill="none" stroke="${BLU}" stroke-width=".9" stroke-dasharray="1.800 1.500">${[0, 1, 2, 3, 4, 5].map((i) => `<circle cx="${n(Math.cos(i * Math.PI / 3) * 5)}" cy="${n(Math.sin(i * Math.PI / 3) * 5)}" r="2.800"/>`).join('')}<circle r="2"/></g></g>
${pin(-.6, .2, 30)}${pin(.58, .44, -40)}${pin(-.34, .72, 60)}${pin(.7, .74, 20)}`,
      over: cap(c, '#cfc8b6', 7),
    }; } },
    // a player kill: the Shire-muster
    pvp: { cond: { taut: .3 }, art: (g, u) => {
      const c = g.pt(0, 0), e = g.pt(0, .5);
      let th = '', hd = '';
      g.along(21, -.97, .97).forEach((k, i) => { const p = g.pt(k, .7); th += `M${pp(p)}l${i % 2 ? 2 : -2},${i % 2 ? -3.6 : 3.6}`; });
      for (const t of [.8, .86, .92, .98]) hd += g.lat(t);
      const stake = (s, t) => { const p = g.pt(s, t); return `<path d="M${n(p[0] - s * 2)},${n(p[1] - 2.6)}L${n(p[0] + 10 * s)},${n(p[1] - 1.5)}L${n(p[0] - s * 2)},${n(p[1] + 3)}Z" fill="#c2a06a" stroke-width=".9"/><path d="M${n(p[0])},${n(p[1])}h${4 * s}" fill="none" stroke-width=".5"/>`; };
      return {
        base: '#263029', lip: '#a5281e', ring: '#b9a57a',
        inside: `${panels(g, ['#2b352d', '#202823'])}${seams(g, '#b3412e', { op: .85 })}
${band(g, u, .42, .58, '#a5281e')}${ink2(g.lat(.42), 1, '#17120e')}${ink2(g.lat(.58), 1, '#17120e')}
<path d="${g.band(.78, 1)}" fill="#6a5434" stroke-width="1"/><path d="${hd}" fill="none" stroke-width=".8"/><path d="${KS.slice(1, -1).map((k) => g.seam(k, .78, 1)).join('')}${[-.6, -.3, 0, .3, .6].map((k) => g.seam(k, .78, 1)).join('')}" fill="none" stroke-width=".8" opacity=".8"/>
${ink2(g.lat(.7), 1.5, '#7a5a34')}<path d="${th}" fill="none" stroke-width="2"/><path d="${th}" fill="none" stroke="#c2a06a" stroke-width=".9"/>
<g transform="translate(${n(e[0])},${n(e[1] - 1)})"><g transform="rotate(-32)">${ink2('M0,-10V15', 1.5, '#c2a06a')}<path d="M-4.500,-16V-9.500Q0,-8 4.500,-9.500V-16M0,-16V-9" fill="none" stroke-width="2.800"/><path d="M-4.500,-16V-9.500Q0,-8 4.500,-9.500V-16M0,-16V-9" fill="none" stroke="#dfe6ea" stroke-width="1.300"/></g>
<g transform="rotate(32)">${ink2('M0,-14V15', 1.5, '#c2a06a')}<path d="M.8,-14C8,-16.500 11.500,-11.500 10.500,-5C7.500,-7.500 4,-8 .8,-7Z" fill="#dfe6ea" stroke-width=".8"/></g></g>`,
        over: `${stake(-1, .68)}${stake(1, .68)}${stake(-1, .5)}${stake(1, .5)}${cap(c, '#6a5434')}<path d="M${n(c[0] - 2.6)},${n(c[1])}L${n(c[0])},${n(c[1] - 11)}L${n(c[0] + 2.6)},${n(c[1])}Z" fill="#c2a06a" stroke-width=".9"/>`,
      };
    } },
    // a level gained: cornflower blue, gold arches climbing, the firework lit
    levelup: { cond: { taut: .6 }, art: (g, u) => { const c = g.pt(0, 0), e = g.pt(0, .22), tr = `transform="translate(${n(e[0])},${n(e[1])})"`; return {
      base: BLU, lip: BRASS, ring: '#f0d98a',
      inside: `${panels(g, ['#447bba', '#376ba6'])}${seams(g, '#f0d27a', { op: .7 })}
${arches(g, .54, 9, .035, '#f0cf6a')}${arches(g, .63, 9, .035, '#f0cf6a')}${arches(g, .72, 9, .035, '#f0cf6a')}${band(g, u, .84, .88, BRASS)}
<path ${tr} d="${BURST}" fill="none" stroke="#1d2f4d" stroke-width="4.200"/><path ${tr} d="${BURST}" fill="none" stroke="#f3d47a" stroke-width="2"/><circle ${tr} r="2.600" fill="#f3d47a" stroke-width=".8"/>`,
      over: `${cap(c, BRASS)}${ball(c, '#f6e2a0', 3.2, 3)}`,
      html: `<div class="rig-a hobbit-burstg">${S('', -18, n(e[1]) - 18, 36, 36, `<path ${tr} d="${BURST}" fill="none" stroke="#ffe9a8" stroke-width="2" stroke-linecap="round"/>`)}</div>`,
    }; } },
    // a death: let down, in mourning
    death: { cond: { sag: .62, lop: -.1 }, art: (g, u) => { const k0 = g.pt(.5, .53); return {
      base: '#484541', lip: '#4a4d50', ring: '#6a6358',
      inside: `${panels(g, ['#504d48', '#413e3a'])}${seams(g, '#8a857a', { op: .5 })}${creases(g, [[.42, .68, .98], [-.32, .7, .98], [-.72, .4, .7], [.7, .62, .9], [-.06, .76, .98]])}
<path d="${g.band(.46, .6)}" fill="#15120e" stroke="#000" stroke-width="1"/><path d="${g.lat(.5, -.95, .95)}${g.lat(.56, -.95, .95)}" fill="none" stroke="#6a6257" stroke-width=".7"/>
<g transform="translate(${n(k0[0])},${n(k0[1])})" stroke="#000"><path d="M-3,3C-9,14 -4,24 -10,37L0,33C1,23 -1,13 2,4Z" fill="#1c1813" stroke-width="1"/><path d="M2,3C7,13 4,22 10,32L15,25C11,17 11,10 8,3Z" fill="#14110d" stroke-width="1"/>
<path d="M0,0C-6,-9 -17,-8 -16,0C-17,8 -6,8 0,0Z" fill="#221d17" stroke-width="1"/><path d="M0,0C6,-9 17,-8 16,0C17,8 6,8 0,0Z" fill="#1c1813" stroke-width="1"/><circle r="3.600" fill="#2a241d" stroke-width="1"/><path d="M-12,-2q4,2 8,1M12,-2q-4,2 -8,1M-4,12q2,10 -2,20M6,11q0,8 4,14" fill="none" stroke="#6a6257" stroke-width=".7"/></g>`,
      over: '',
    }; } },
    // an achievement: plum and gold, and first prize at the Free Fair
    achievement: { cond: { taut: .8 }, art: (g, u) => { const c = g.pt(0, 0), e = g.pt(0, .25); return {
      base: '#6b3a5c', lip: BRASS, ring: '#f0d98a',
      inside: `${panels(g, ['#734162', '#5e3351'])}${seams(g, '#e2c676', { op: .75 })}
${scal(g, .6, 13, 6, ['#c9a23c'])}${band(g, u, .53, .605, BRASS)}${posies(g, .567, 11, ['#f3ead0'], 2.3, '#6b3a5c')}${band(g, u, .84, .88, BRASS)}${ink2(g.lat(.1, -.9, .9), .9, '#e2c676')}
<g transform="translate(${n(e[0])},${n(e[1])})">${rosette(13.5, '#e9c865', CRM, '#c9a23c', CRM)}<path d="M0,-5L1.500,-1.600L5,-1.500L2.300,.9L3.200,4.500L0,2.600L-3.200,4.500L-2.300,.9L-5,-1.500L-1.500,-1.600Z" fill="#6b3a5c" stroke-width=".6"/><path d="M-9,-8Q-4,-12.500 2,-12" fill="none" stroke="#fff6d0" stroke-width="1.100" opacity=".8"/></g>`,
      over: `${cap(c, BRASS, 9)}${ball(c, '#f6e2a0', 3.3, 3)}`,
    }; } },
  };

  // ---- the sign: a painted board with brass eyelets, tied up on two hemp cords ----
  const SW = 158, HX = 58;
  // face, painted border, second colour
  const BRD = {
    calibrating: ['#ebe4cf', '#8d8a7c', ''], poor: ['#cfc5ab', '#857e70', ''], meh: ['#e4d9bc', '#96804f', ''],
    good: ['#ece2c4', '#4f7a3c', BRASS], great: ['#f1e7c6', '#d39f28', '#4f7a3c'], superb: ['#f6eed4', RED, YEL],
    pvp: ['#e6dcc0', '#8a1f18', '#1b1513'], levelup: ['#f0e8cc', BLU, YEL], death: ['#2a2622', '#6a655c', ''], achievement: ['#f1e7c9', '#6b3a5c', BRASS],
  };
  const LG = (u, body) => `<g filter="url(#hbl${u})" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">${body}</g>`;
  const board = ({ w, h, mood, u }) => {
    const [face, edge, two] = BRD[mood] || BRD.meh, poor = mood === 'poor', dark = mood === 'death', rich = mood === 'superb';
    const fl = { good: ['#f8f3e4', YEL], great: ['#f8f3e4', YEL], superb: [RED, '#fff3c4'], levelup: [YEL, '#fff3c4'], achievement: [YEL, '#6b3a5c'] }[mood];
    const eyelet = (x) => `${ink2(`M${x},-2.500V4.500`, 1.3, '#c9b07c')}<circle cx="${x}" cy="5.200" r="2.700" fill="#170f0a" stroke-width="2.400"/><circle cx="${x}" cy="5.200" r="2.700" fill="none" stroke="#e3c268" stroke-width="1.100"/><path d="M${x - 2.4},-1.500q2.400,2.600 4.800,0" fill="none" stroke-width="2.200"/><path d="M${x - 2.4},-1.500q2.400,2.600 4.800,0" fill="none" stroke="#c9b07c" stroke-width="1"/>`;
    return LG(u, `<rect x=".7" y=".7" width="${w - 1.4}" height="${h - 1.4}" rx="4" fill="${face}" stroke-width="1.3"/>
<rect x="1.200" y="1.200" width="5" height="${h - 2.4}" rx="2" fill="${HP(u)}" stroke="none"/><rect x="1.200" y="${h - 6}" width="${w * .45}" height="4.800" rx="2" fill="${HQ(u)}" stroke="none"/>
<path d="M12,${n(h * .3)}q${n(w * .2)},-2.500 ${n(w * .42)},0M${n(w * .5)},${n(h * .72)}q${n(w * .2)},2.500 ${n(w * .4)},-.5M18,${n(h * .56)}q${n(w * .12)},1.800 ${n(w * .24)},0M${n(w * .62)},${n(h * .2)}q12,-1.500 26,.5" fill="none" stroke="${dark ? '#8a857a' : '#8a6a3c'}" stroke-width=".6" opacity=".3"/>
<rect x="4" y="4" width="${w - 8}" height="${h - 8}" rx="2.500" fill="none" stroke="${edge}" stroke-width="${rich ? 2.6 : 2.1}" ${mood === 'calibrating' ? 'stroke-dasharray="5 3.500"' : ''} ${poor ? 'stroke-dasharray="14 2 7 3 22 2" opacity=".75"' : ''}/>
${two ? `<rect x="6.800" y="6.800" width="${w - 13.6}" height="${h - 13.6}" rx="1.500" fill="none" stroke="${two}" stroke-width=".9"/>` : ''}
${poor ? `<path d="M${w - 26},1L${w - 31},9L${w - 27},15L${w - 30},22" fill="none" stroke-width=".8"/><ellipse cx="${n(w * .16)}" cy="${h - 9}" rx="3.200" ry="2" fill="#8a7a5c" stroke-width=".7"/><path d="M1,${h - 12}L7,${h - 1}" fill="none" stroke-width=".8"/>` : ''}
${fl ? [[5.5, 5.5], [w - 5.5, 5.5], [5.5, h - 5.5], [w - 5.5, h - 5.5]].map(([x, y]) => flower(x, y, rich ? 4.4 : 3.6, fl[0], fl[1])).join('') : ''}
${rich ? `${flower(w / 2, 4.6, 3.4, '#f8f3e4', YEL)}${flower(w / 2, h - 4.6, 3.4, '#f8f3e4', YEL)}` : ''}
${eyelet(w / 2 - HX)}${eyelet(w / 2 + HX)}`);
  };
  // the rating as five brass buttons; a player kill is two red strokes
  const pips = (mood) => {
    let s = '';
    if (mood === 'pvp') s = '<path class="hobbit-pred" d="M3,2L15,12M15,2L3,12"/>';
    else for (let i = 0; i < 5; i++) { const x = 6 + i * 11.5; s += i < (RANK[mood] || 0) ? `<g transform="translate(${x},7)"><circle r="4.600" class="hobbit-pon"/><circle r="3" class="hobbit-ponr"/><circle cx="-1.100" r=".7" fill="${INK}"/><circle cx="1.100" r=".7" fill="${INK}"/></g>` : `<circle cx="${x}" cy="7" r="4" class="hobbit-pof"/>`; }
    return `<svg xmlns="${NS}" width="${mood === 'pvp' ? 18 : 58}" height="14" viewBox="0 0 ${mood === 'pvp' ? 18 : 58} 14">${s}</svg>`;
  };

  let reduced = false, paceOf = () => 1;

  // ---- the small life in him: blinks, glances, a brow, a shift of weight; one piece of business per mood ----
  const liven = (R) => {
    const q = R.q, qa = R.qa, ck = kit.clock(), later = ck.later, rnd = Math.random;
    const nod = q('.hobbit-nod'), look = q('.hobbit-look'), lids = qa('.hobbit-bl'), pgs = qa('.hobbit-pg'), brows = [q('.hobbit-bL'), q('.hobbit-bR')];
    const ty = q('.hobbit-ty'), mu = q('.hobbit-mu'), pie = q('.hobbit-pg2'), sw = q('.hobbit-sw'), rks = qa('.hobbit-rkt').reverse(), burst = q('.hobbit-burst');
    const coal = q('.hobbit-coalg'), on = q('.hobbit-on');
    let gaze = [0, 0], ga = [], la = null, hot = true, shot = 0;
    const T = (s) => ({ transform: s });
    const bob = (el, to, ms, o = {}) => el && el.animate([T('none'), { transform: to, offset: o.at ?? .4 }, T('none')], { duration: ms, easing: 'ease-in-out', composite: 'add', ...o });
    const blink = () => {
      const slow = R.mood === 'meh' || R.mood === 'death';
      const go = () => lids.forEach((l) => l.animate([T('translateY(0)'), { transform: 'translateY(14px)', offset: .42 }, T('translateY(0)')], { duration: slow ? 650 : 150, easing: 'ease-in-out' }));
      go(); if (!slow && rnd() < .25) later(go, 250);
      later(blink, (slow ? 2600 : 1600) + rnd() * 3600);
    };
    const lookAt = (x, y, ms = 170) => {
      if (reduced) return;
      const from = gaze; gaze = [x, y];
      const old = ga, oldL = la;
      ga = pgs.map((p) => p.animate([T(`translate(${from[0]}px,${from[1]}px)`), T(`translate(${x}px,${y}px)`)], { duration: ms, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'forwards' }));
      la = look.animate([T(`translate(${from[0] * .3}px,${from[1] * .2}px) rotate(${from[0] * .45}deg)`), T(`translate(${x * .3}px,${y * .2}px) rotate(${x * .45}deg)`)], { duration: 520, delay: 50, easing: 'cubic-bezier(.3,.6,.3,1)', fill: 'both' });
      old.forEach((a) => a.cancel()); if (oldL) oldL.cancel();
    };
    const glance = () => {
      if (R.mood !== 'death' && R.root.classList.contains('rig-at') && !R.root.classList.contains('rig-off')) {
        const r = rnd(), p = PROP[R.mood] || [0, 0];
        if (r < .28) lookAt(rnd() - .5, 2.4);               // down at the board
        else if (r < .52) lookAt(0, 0);                     // at you
        else if (r < .64) lookAt(rnd() * 1.6 - .8, -2.4);   // up at the envelope
        else if (r < .84) lookAt(p[0], p[1]);               // at what he holds
        else lookAt(rnd() < .5 ? -3.2 : 3.2, -.3);          // out over the Shire
      }
      later(glance, 1100 + rnd() * 2600);
    };
    const brow = () => {
      const i = rnd() < .5 ? 0 : 1;
      bob(brows[i], 'translateY(-2.4px)', 340);
      if (rnd() < .4) bob(brows[1 - i], 'translateY(-2px)', 340, { delay: 60 });
      later(brow, 2400 + rnd() * 3600);
    };
    // he shifts his weight, as one does who would rather be on the ground
    const shift = () => {
      if (R.mood !== 'death') bob(nod, `translateX(${rnd() < .5 ? -1.2 : 1.2}px) rotate(${(rnd() - .5) * 1.6}deg)`, 1500, { at: .5 });
      later(shift, 3200 + rnd() * 4200);
    };
    if (!reduced) { lookAt(.3, -2.4, 1); later(blink, 500 + rnd() * 1800); later(glance, 900 + rnd() * 1200); later(brow, 1500 + rnd() * 2500); later(shift, 2600 + rnd() * 3000); }
    const once = (el, kf, o) => !reduced && el && el.animate(kf, o);
    // a rocket he has lit: up out of the hamper, past the envelope's side, one small burst, gone
    const launch = (delay) => {
      const r = rks[shot], d = 1 / paceOf();
      if (reduced || !r) return;
      shot++;
      const A = 'rotate(-14deg) ';
      r.animate([{ transform: A + 'translateY(0)', opacity: 1 }, { transform: A + 'translateY(1.5px)', opacity: 1, offset: .14, easing: 'cubic-bezier(.5,0,.9,.55)' }, { transform: A + 'translateY(-166px)', opacity: 1, offset: .93 }, { transform: A + 'translateY(-180px)', opacity: 0 }], { duration: 820 * d, delay: delay * d, fill: 'forwards' });
      r.querySelector('.hobbit-tail').animate([{ opacity: 0 }, { opacity: 1, offset: .14 }, { opacity: 1 }], { duration: 820 * d, delay: delay * d, fill: 'forwards' });
      if (shot === 1) burst.animate([{ transform: 'scale(.15)', opacity: 0 }, { transform: 'scale(.75)', opacity: 1, offset: .22 }, { transform: 'scale(1)', opacity: .9, offset: .6 }, { transform: 'scale(1.06) translateY(3px)', opacity: 0 }], { duration: 900 * d, delay: (delay + 760) * d, easing: 'ease-out' });
      later(() => lookAt(-3, -2.2, 260), (delay + 250) * d);
    };
    // one small piece of business on arriving, by mood
    const biz = (mood) => {
      if (reduced) return;
      const d = 1 / paceOf();
      const nd = (kf, ms, delay = 0, o = {}) => nod.animate(kf, { duration: ms * d, delay: delay * d, easing: 'ease-in-out', ...o });
      if (mood === 'calibrating') { lookAt(3, -.4); once(mu, [T('rotate(0)'), { ...T('rotate(-14deg)'), offset: .3 }, { ...T('rotate(12deg)'), offset: .65 }, T('rotate(0)')], { duration: 1100 * d, delay: 250 * d, easing: 'ease-in-out' }); nd([T('none'), T('rotate(2deg) translateY(.6px)'), T('none')], 800, 500); later(() => lookAt(0, 0), 1500 * d); }
      if (mood === 'poor') { lookAt(.4, -2.3, 400); nd([T('none'), { ...T('translateY(-1.2px)'), offset: .3 }, { ...T('translateY(2.6px)'), offset: .7 }, T('translateY(1.4px)')], 1400, 350, { fill: 'forwards' }); later(() => lookAt(0, 1.4, 500), 1700 * d); }
      if (mood === 'meh') { lookAt(2.8, 1.8, 300); nd([T('none'), { ...T('translateY(-1px) rotate(-.6deg)'), offset: .35 }, { ...T('translateY(1.8px) rotate(1deg)'), offset: .75 }, T('translateY(.9px) rotate(.6deg)')], 1500, 500, { fill: 'forwards' }); later(() => lookAt(0, 0, 300), 1600 * d); }
      if (mood === 'good') { lookAt(0, 2.2); nd([T('none'), { ...T('translateY(2.6px) rotate(1deg)'), offset: .35 }, { ...T('translateY(-.6px)'), offset: .7 }, T('none')], 520, 450); later(() => lookAt(0, 0), 1000 * d); }
      if (mood === 'great') { lookAt(3, 1.6); once(pie, [T('none'), { ...T('translateY(-3px)'), offset: .4 }, { ...T('translateY(-2.4px)'), offset: .7 }, T('none')], { duration: 900 * d, delay: 300 * d, easing: 'ease-in-out' }); nd([T('none'), { ...T('translateY(-1.6px) rotate(1.2deg)'), offset: .4 }, T('none')], 900, 300); later(() => lookAt(0, 0), 1100 * d); }
      if (mood === 'superb') {
        lookAt(-3, 1); launch(450);
        nd([T('none'), { ...T('translateY(-2px) rotate(-2deg)'), offset: .3 }, { ...T('translateY(-1.6px) rotate(-1.5deg)'), offset: .7 }, T('none')], 1400, 500);
        later(() => { lookAt(0, 0); once(ty, [T('none'), { ...T('translateY(-5px) rotate(-6deg)'), offset: .4 }, { ...T('translateY(-4px) rotate(-5deg)'), offset: .7 }, T('none')], { duration: 900 * d, easing: 'ease-in-out' }); }, 2000 * d);
      }
      if (mood === 'pvp') { lookAt(0, 0); once(sw, [T('none'), { ...T('translateY(-3px) rotate(-3deg)'), offset: .35 }, { ...T('translateY(.6px)'), offset: .7 }, T('none')], { duration: 700 * d, delay: 250 * d, easing: 'ease-in-out' }); nd([T('none'), { ...T('translateY(-1.8px) rotate(-1deg)'), offset: .3 }, { ...T('translateY(.8px)'), offset: .6 }, T('none')], 650, 250); }
      if (mood === 'levelup') { lookAt(-3, 1); launch(450); nd([T('none'), { ...T('translateY(-1.6px) rotate(-1.5deg)'), offset: .4 }, T('none')], 1300, 500); later(() => lookAt(0, 0, 300), 2100 * d); }
      if (mood === 'death') nd([T('none'), T('translateY(1.5px) rotate(-1.5deg)')], 1100, 500, { fill: 'forwards' });
      if (mood === 'achievement') { lookAt(0, 0); nd([T('none'), { ...T('translateY(-2.2px) scale(1.02)'), offset: .4 }, T('translateY(-.6px)')], 900, 250, { fill: 'forwards' }); }
    };
    const calm = () => nod.getAnimations().forEach((a) => a.cancel());
    return {
      arrive: biz,
      changed(mood) { calm(); biz(mood); },
      struck() { lookAt(0, 2.4, 140); },
      leave() { if (R.mood !== 'death') lookAt(.4, -2.4, 260); },
      // every frame: the stove's glow follows burn; the onions dangle
      frame(i) {
        const b = i.burn;
        coal.style.opacity = (.2 + .8 * b).toFixed(2);
        on.style.transform = `rotate(${(i.hang * 1.1 + Math.sin(i.now * .0019) * 1.4).toFixed(2)}deg)`;
        // he looks up at his fire when it roars
        if (b > .62 && !hot) { hot = true; if (R.mood !== 'death') lookAt(.3, -2.5, 220); } else if (b < .35) hot = false;
      },
      stop: ck.stop,
    };
  };

  const grad = (id, stops, extra = 'x1="0" x2="1"') => `<linearGradient id="${id}" ${extra}>${stops.map((c, i) => `<stop offset="${n(i / (stops.length - 1))}" stop-color="${c}"/>`).join('')}</linearGradient>`;

  Harness.register({
    id: 'hobbit',
    name: 'The Hobbit',
    blurb: 'A respectable hobbit, airborne against his better judgement, in shirt-sleeves and his best waistcoat: cloth from the linen press, a wicker picnic hamper with onions on its side, and a brass kettle-stove hung under the mouth. The envelope says how good the kill was, from the old patched quilt to the Party pavilion in scarlet and cream with garlands and bunting; the news hangs below on a painted board tied up with cord.',
    create(ctx) {
      reduced = ctx.reduced; paceOf = ctx.pace;
      return Rig.create(ctx, {
        id: 'hobbit', css: CSS,
        defs: (u) => `${kit.filt('hbf' + u, { freq: .03, scale: 2.4, grain: .45 }).replace('1.5 0 0 0 -.7', '.9 0 0 0 -.5')}${kit.filt('hbl' + u).replace('1.5 0 0 0 -.7', '.45 0 0 0 -.25').replace('0 1.2 0 0 -.56', '0 .8 0 0 -.42')}${kit.hatch('hbp' + u, 38, 5, .6, .95)}${kit.hatch('hbq' + u, -52, 5.6, .5, .95)}
${grad('hbs' + u, ['#c2937a', '#e0b896', '#f2d8b8'])}${grad('hbh' + u, ['#4a2f1c', '#74502f', '#96693f'])}${grad('hbv' + u, ['#b0832a', '#d6aa40', '#ecca6a'])}${grad('hbb' + u, ['#7c5a22', '#c9a04b', '#f3dc8e'])}${grad('hbw' + u, ['#7c5c34', '#a8854f', '#c9a66a'])}
<pattern id="hbg${u}" patternUnits="userSpaceOnUse" width="6" height="6"><rect width="3" height="6" fill="#b5432f" opacity=".5"/><rect width="6" height="3" fill="#b5432f" opacity=".5"/></pattern>
<pattern id="hbd${u}" patternUnits="userSpaceOnUse" width="5" height="5"><circle cx="1.500" cy="1.500" r=".8" fill="#f4ecd6" opacity=".6"/></pattern>
<pattern id="hbt${u}" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)"><path d="M.6,0V4" stroke="#f4ecd6" stroke-width="1" opacity=".4"/></pattern>
<pattern id="hbx${u}" patternUnits="userSpaceOnUse" width="3" height="3"><path d="M0,.5H3M.5,0V3" stroke="#5a4526" stroke-width=".4" opacity=".28"/></pattern>
<pattern id="hbk${u}" patternUnits="userSpaceOnUse" width="11" height="6"><path d="M0,1.500Q2.750,-.5 5.500,1.500T11,1.500M-5.500,4.500Q-2.750,2.500 0,4.500T5.500,4.500T11,4.500" fill="none" stroke="${INK}" stroke-width=".6" opacity=".55"/></pattern>`,
        envelope: (mood) => ENV[mood] || ENV.calibrating,
        ropes: { kind: 'rope', dark: '#2a1b10', light: '#c9b07c', w: 1.5 },
        burner,
        basket,
        behind: (u) => `${rockets(u)}
<div class="hobbit-lift"><div class="hobbit-br"><div class="hobbit-look"><div class="hobbit-nod">${head(u)}${wisp()}${tears()}</div></div></div></div>
${props(u)}`,
        front: (u) => `${hands(u)}${onions(u)}`,
        sign: { w: SW, hx: HX, bx: 44, k: 12.5, c: 1.8, cord: { kind: 'rope', dark: '#2a1b10', light: '#c9b07c', w: 1.4 }, board, pips },
        life: liven,
      });
    },
  });
})();
