// Round 5: "The Elf", built on the shared rig (rig.js). An elf woman of the
// woodland realm, tall and grave, in a grey-green cloak clasped with a leaf,
// a silver circlet on her brow. Her craft is light: grey cloth, a swan-prowed
// car of pale wood, a silver lamp shaped like a flower under the mouth.
//
// THE ELVES' VOCABULARY (decided before drawing; rule 2 of the brief)
//   Materials  fine woven cloth in slender gores (grey, silver-white), pale
//              wood, silver, white gems, grey elven rope; gold only as leaf.
//   Motifs     flowing curves only: the vine (a wave with leaves), the mallorn
//              leaf, a calyx of leaves round the crown, the many-rayed star of
//              Elbereth, the swan-ship. Nothing angular, no rivets, no iron.
//   Colours    faded drab for the worthless; plain cloak-grey; leaf green and
//              silver; twilight blue with silver stars; silver-white and
//              leaf-gold for the best.
//   "The best" means STARLIGHT: silver-white and luminous, gold leaves, a
//              great star set with a white gem, everything new and unworn.
//
// THE ENVELOPE LADDER (silhouette and colour both change)
//   poor    faded drab cloth, sagging, lopsided and dented; two open rents,
//           mends in plain unbleached cloth, a slack garland of withered leaves
//   meh     plain cloak-grey cloth, a little slack, one grey cord, one neat mend
//   good    sound and full: leaf green, a calyx of leaves at the crown, a
//           silver vine with gold leaves, a gold mallorn leaf in a silver ring
//   great   fine: twilight blue sown with silver stars, the swan-ship under a
//           star, a silver vine band, a star on a silver spire
//   superb  brand new: silver-white, a blue band of stars edged with gold, the
//           great star with a white gem (it shines), a calyx and a hanging
//           skirt of gold and silver leaves, a star for a finial
// THE SPECIALS (none can be taken for a rating step)
//   unrated      pale mist-blue cloth with the design only drawn on in dashes:
//                an empty star, empty leaves
//   player kill  wine-black with a crimson band, the eight-rayed star over
//                crossed arrows, silver blades that break the outline
//   level up     the sky at dawn (indigo down to rose and gold), the swan-ship
//                sailing up to a star that shines
//   death        ash grey, half let down, a dark veil bound round it with long
//                tails, pale leaves falling; the lamp burns cold blue
//   achievement  mallorn gold with a green band and a wreath of green leaves
//                round a white star, silver ribbons
//
// HER: a held pose per mood, no large gestures. What she holds is at her
// chest, on a short forearm from under the cloak. Unrated: nothing, both hands
// on the rail, a searching look. Poor: a wilted flower. Good: a white flower. Great: a small
// harp at her shoulder. Superb: a star-glass held up. Player kill: her hood up, a faint
// light in her eyes, her bow strung. Level up: a hand to her heart, head a little bowed. Death: her hood
// drawn up, head bowed, eyes closed, weeping. Achievement: a silver cup.
(() => {
  const { K, INK, kit } = Rig, { n, S, SL, Z, G, ink2, NS, pp } = kit, HP = kit.P, HQ = kit.Q;
  const { W, CX, HG, FY, RY, BY } = K;
  // the figure is drawn in "head units" (2 units = 1 px) about the eye line
  const HS = .5, HY = RY - 60, PIV = 40;
  const SKIN = '#ecd6bd', GOWN = '#dfe3dc', SILVER = '#cfd6d8', GOLD = '#d2ad4a', LEAFG = '#3f7a4f';

  // ---- moods: how she holds her head, her face and her hands ----
  const DEF = { rise: 0, hy: 0, hr: 0, bly: 0, blr: 0, bry: 0, brr: 0, lid: .5, px: 0, py: 0, sm: 0, sd: 0, hood: 0, mag: 0, hl: 1, hrt: 1, wilt: 0, flower: 0, harp: 0, glass: 0, bow: 0, heart: 0, cup: 0 };
  const M = {
    calibrating: { hr: 2.5, bly: -1.8, blr: -5, bry: -.6, lid: .2 },
    poor: { rise: -2, hr: -4, hy: 1.5, lid: 2.4, bly: .5, bry: .5, blr: 8, brr: 8, sd: 1, wilt: 1, hrt: 0 },
    meh: { hr: -2, lid: 2 },
    good: { sm: 1, lid: .4, flower: 1, hrt: 0 },
    great: { rise: 1, hr: 2.5, sm: 1, bly: -1, bry: -1, harp: 1, hrt: 0 },
    superb: { rise: 3, sm: 1, bly: -2, bry: -2, lid: 0, glass: 1, hrt: 0 },
    pvp: { rise: 1, lid: 1.7, bly: 1.2, bry: 1.2, blr: -10, brr: -10, bow: 1, hl: 0, hood: 1, mag: 1 },
    levelup: { hr: -3, hy: 1, lid: 3, sm: 1, heart: 1, hl: 0 },
    death: { rise: -3, hr: -7, hy: 3, lid: 7.4, blr: 9, brr: 9, sd: 1, hood: 1 },
    achievement: { rise: 2, sm: 1, bly: -1.5, bry: -1.5, cup: 1, hrt: 0 },
  };
  // where the thing she holds is, for her glances (pupil units)
  const PROP = { calibrating: [-2.4, -.3], poor: [1.4, 1.1], meh: [-2.2, .2], good: [1.4, 1], great: [2, 1], superb: [1.4, .9], pvp: [0, 0], levelup: [0, 1], achievement: [1.4, 1] };
  const RANK = { poor: 1, meh: 2, good: 3, great: 4, superb: 5 };
  const vars = (o) => Object.keys(o).filter((k) => k in DEF).map((k) => `--${k}:${o[k]}`).join(';');
  const show = (...names) => names.map((nm) => `.elf-${nm}{--x:var(--${nm})}`).join('');

  const CSS = `
.elf-v{${vars(DEF)};--lamp:#f6c263;--go:.9;--rig-f1:#f2a440;--rig-f2:#fff0b8;--rig-gl:255,206,130}
${Object.keys(M).map((m) => `.elf-v[data-mood=${m}]{${vars(M[m])}}`).join('\n')}
.elf-v[data-mood=death]{--rig-f1:#4f8fd0;--rig-f2:#cfe6ff;--rig-gl:120,170,255;--lamp:#7fa8d6}
.elf-v[data-mood=poor]{--rig-f1:#d5852f;--lamp:#c08a48}
.elf-v[data-mood=superb]{--rig-f1:#f4c56a;--rig-f2:#fffbe8;--rig-gl:255,236,190;--lamp:#fff0c0}
.elf-v[data-sky=dusk]{--go:.65}.elf-v[data-sky=day]{--go:.28}.elf-v[data-sky=overcast]{--go:.4}
.elf-v[data-mood=poor] .rig-envb{animation:elf-heave 3.6s ease-in-out infinite alternate}
.elf-lamp{fill:var(--lamp)}
.elf-lampg{width:40px;height:18px;margin:-9px 0 0 -20px;border-radius:50%;opacity:.3;will-change:opacity;background:radial-gradient(closest-side,rgba(var(--rig-gl),.85),rgba(var(--rig-gl),0))}
.elf-starg{animation:elf-pu 2.2s ease-in-out infinite alternate;filter:drop-shadow(0 0 2px #fff) drop-shadow(0 0 6px rgba(226,240,255,.85))}
.elf-lift,.elf-br,.elf-look,.elf-nod{position:absolute;left:0;top:0;width:${W}px;height:0;transform-origin:${CX}px ${RY + 8}px}
.elf-lift{transform:translateY(calc(var(--rise)*-1px));transition:transform calc(.55s*var(--k)) cubic-bezier(.3,1.2,.5,1)}
.elf-br{animation:elf-br 4.8s ease-in-out infinite alternate}
.elf-hd{transform:translateY(calc(var(--hy)*1px)) rotate(calc(var(--hr)*1deg));transition:transform calc(.5s*var(--k)) ease-out}
.elf-bL{transform:translateY(calc(var(--bly)*1px)) rotate(calc(var(--blr)*1deg))}
.elf-bR{transform:translateY(calc(var(--bry)*1px)) rotate(calc(var(--brr)*1deg))}
.elf-bL,.elf-bR,.elf-pm,.elf-lid{transition:transform calc(.4s*var(--k)) ease-out}
.elf-pm{transform:translate(calc(var(--px)*1px),calc(var(--py)*1px))}
.elf-lid{transform:translateY(calc(var(--lid)*1px));fill:#d6b99b;stroke:${INK};stroke-width:1.3}
.elf-m0,.elf-m1,.elf-m2,.elf-hood,.elf-hL,.elf-hR{transition:opacity calc(.3s*var(--k))}
.elf-m0{opacity:calc(1 - var(--sm) - var(--sd))}.elf-m1{opacity:var(--sm)}.elf-m2{opacity:var(--sd)}
.elf-hood{opacity:var(--hood)}
.elf-shade{opacity:calc(var(--mag)*.34)}.elf-mi{opacity:calc(var(--mag)*.6)}
.elf-mag{position:absolute;left:0;top:0;width:${W}px;height:0;opacity:var(--mag);transition:opacity calc(.4s*var(--k));transform-origin:${CX}px ${HY + PIV * HS}px;transform:translateY(calc(var(--hy)*${HS}px)) rotate(calc(var(--hr)*1deg))}
.elf-mag i{position:absolute;top:${HY - 5.5}px;width:11px;height:11px;border-radius:50%;background:radial-gradient(closest-side,rgba(214,244,255,.5),rgba(150,214,255,.2) 45%,rgba(140,200,255,0));animation:elf-pu 2.8s ease-in-out infinite alternate}
.elf-hL{opacity:var(--hl)}.elf-hR{opacity:var(--hrt)}
.elf-p{position:absolute;left:0;top:0;width:${W}px;height:0;opacity:var(--x);transform:translateY(calc((1 - var(--x))*14px));transition:transform calc(.45s*var(--k)) cubic-bezier(.3,1.15,.5,1),opacity calc(.16s*var(--k))}
${show('wilt', 'flower', 'harp', 'glass', 'bow', 'heart', 'cup')}
.elf-lk{left:${CX}px;top:${HY + 8}px;will-change:transform}
.elf-lk svg{left:-20px;top:-3px}
.elf-gl{width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:radial-gradient(closest-side,rgba(240,248,255,.75),rgba(206,226,255,.22) 45%,rgba(200,220,255,0));opacity:calc(.35 + var(--go)*.6);animation:elf-gw 2.6s ease-in-out infinite alternate}
.elf-glint{width:12px;height:12px;margin:-6px 0 0 -6px;animation:elf-gli 3.1s ease-in-out infinite}
.elf-glint svg{left:0;top:0}
.elf-tears{display:none;position:absolute;left:0;top:0;width:${W}px;height:0;transform-origin:${CX}px ${HY + PIV * HS}px;transform:translateY(calc(var(--hy)*${HS}px)) rotate(calc(var(--hr)*1deg))}
.elf-v[data-mood=death] .elf-tears{display:block}
.elf-tear{position:absolute;width:5px;height:14px;overflow:hidden}
.elf-tear::before{content:"";position:absolute;left:1.9px;top:0;width:1.1px;height:11px;border-radius:1px;background:linear-gradient(rgba(196,216,232,.4),rgba(196,216,232,.06))}
.elf-tear i{position:absolute;left:1.4px;top:-3px;width:2.2px;height:3.1px;border-radius:50% 50% 50% 50%/62% 62% 38% 38%;background:radial-gradient(circle at 35% 35%,rgba(240,247,252,.9),rgba(172,202,224,.75) 55%,rgba(116,156,190,.7));box-shadow:0 0 0 .5px rgba(24,34,54,.28);transform:translateY(var(--r));animation:elf-tear 5.8s cubic-bezier(.4,0,.7,.7) infinite;animation-delay:var(--dl)}
@keyframes elf-tear{0%{transform:translateY(0) scale(.5);opacity:0}12%{transform:translateY(1.5px) scale(1);opacity:.5}75%{opacity:.5}100%{transform:translateY(12.5px) scale(.9);opacity:0}}
@keyframes elf-heave{from{transform:scale(1,1) skewX(0)}to{transform:scale(1.02,.965) skewX(1.2deg)}}
@keyframes elf-br{from{transform:translateY(.4px) scale(1,.998)}to{transform:translateY(-.7px) scale(1,1.004)}}
@keyframes elf-pu{from{opacity:.55}to{opacity:1}}
@keyframes elf-gw{from{transform:scale(.92)}to{transform:scale(1.05)}}
@keyframes elf-gli{0%,58%,100%{opacity:0;transform:scale(.4) rotate(0)}72%{opacity:1;transform:scale(1) rotate(20deg)}86%{opacity:0;transform:scale(.5) rotate(40deg)}}
.elf-sign{filter:drop-shadow(0 2px 2.5px rgba(0,0,0,.4));--tx:#2a2119;--dim:#5b5143;--fg:#20261f;--on:#3f7a4f;--off:rgba(42,33,25,.5);color:var(--tx)}
.elf-sign[data-mood=poor]{--tx:#3a3128;--fg:#3a3128;--on:#8a5a2c}
.elf-sign[data-mood=meh]{--on:#5d6b5a}
.elf-sign[data-mood=good]{--fg:#234a2f}
.elf-sign[data-mood=great]{--fg:#1f3566;--on:#2b4678}
.elf-sign[data-mood=superb]{--fg:#6a4a08;--on:#b88a1e;--dim:#6a5a3a}
.elf-sign[data-mood=pvp]{--tx:#f1ddd4;--dim:#cbb0a8;--fg:#ffb09a;--on:#f0604a;--off:rgba(241,221,212,.3)}
.elf-sign[data-mood=levelup]{--fg:#4a2f6e}
.elf-sign[data-mood=death]{--tx:#d5d3da;--dim:#a9a7b2;--fg:#e2e0e8}
.elf-sign[data-mood=achievement]{--fg:#234a2f;--tx:#2b2a17}
.elf-sign .rig-text{padding:8px 14px 8px}
.elf-sign .rig-fig{color:var(--fg)}
.elf-sign[data-mood=superb] .rig-fig{font-weight:700}
.elf-sign .rig-unit,.elf-sign .rig-q,.elf-sign .rig-more{color:var(--dim)}
.elf-on{fill:var(--on);stroke:rgba(0,0,0,.55);stroke-width:.7}.elf-of{fill:none;stroke:var(--off);stroke-width:1}
.elf-red{fill:none;stroke:var(--on);stroke-width:2.2;stroke-linecap:round}
.elf-sign[data-kind=levelup] .rig-text{padding:13px 12px}
.elf-sign[data-kind=levelup] .rig-fig{font:700 21px/1.1 Cinzel,Georgia,serif;letter-spacing:.04em}
.elf-sign[data-kind=death] .rig-text{padding:13px 12px}
.elf-sign[data-kind=death] .rig-fig{font:400 21px/1.15 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.17em;margin-right:-.17em;text-transform:lowercase;font-variant:small-caps}
.elf-sign[data-kind=achievement] .rig-title{font:italic 600 13.5px/1.1 "Cormorant Garamond",Georgia,serif}
`;

  // ---- shared motifs (drawn about 0,0) ----
  // a mallorn leaf, tip up, 16 long at scale 1
  const leaf = (fill, sw = .7, rib = INK) => `<path d="M0,-8C4.500,-4.500 5,2 0,8C-5,2 -4.500,-4.500 0,-8Z" fill="${fill}" stroke-width="${sw}"/><path d="M0,-6V9.500M0,-2.500L2.300,-4.500M0,1L-2.600,-1.200M0,3.500L2.300,1.500" fill="none" stroke="${rib}" stroke-width="${n(sw * .7)}" opacity=".75"/>`;
  // the star of Elbereth: four long rays, four short
  const star = (x, y, r, fill, sw = .5, q = .45) => {
    let d = '';
    for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, rr = i % 2 ? r * .2 : (i % 4 ? r * q : r); d += (i ? 'L' : 'M') + kit.n2(x + rr * Math.sin(a)) + ',' + kit.n2(y - rr * Math.cos(a)); }
    return `<path d="${d}Z" fill="${fill}" stroke-width="${sw}"/>`;
  };
  const gem = (x, y, r) => `<circle cx="${n(x)}" cy="${n(y)}" r="${r}" fill="#f6fbff" stroke-width=".5"/><path d="M${n(x - r * .5)},${n(y - r * .1)}Q${n(x - r * .3)},${n(y - r * .6)} ${n(x + r * .1)},${n(y - r * .6)}" fill="none" stroke="#9fc4dc" stroke-width=".5"/>`;
  // the swan-ship, about 26 wide, sailing right
  const ship = (fill, sw = .8) => `<path d="M-12,1C-7,4 3,4.200 8,1.500C10.500,-.5 11.300,-4 10,-7.500C9.300,-9.300 6.800,-9.200 6.400,-7.400L3.800,-6.200L6.800,-5.600C7.800,-3.500 6.500,-1 4.500,.2C1,-1 -8,-1 -12,1Z" fill="${fill}" stroke-width="${sw}"/><path d="M-12,1C-8,7.500 4,8 8,1.500C3,4.200 -7,4 -12,1Z" fill="${fill}" stroke-width="${sw}"/><path d="M-2.500,-.8V-14" fill="none" stroke-width="${sw}"/><path d="M-2.500,-13.500C4,-11 4.500,-5.500 -1.500,-2Z" fill="${fill}" stroke-width="${sw}"/><path d="M-2.500,-13.500C-6.500,-10 -7.500,-6 -4.500,-2.500Z" fill="${fill}" stroke-width="${sw}"/>`;

  // ---- her face and shoulders (head units; light from the right, as on the envelope) ----
  const alm = (s) => `M${-6.5 * s},.8Q${-2 * s},-4.400 ${3 * s},-3.200Q${5.6 * s},-2.600 ${7.2 * s},-1.800Q${3.5 * s},3 ${-1.5 * s},2.800Q${-4.5 * s},2.400 ${-6.5 * s},.8Z`;
  const eye = (s, u) => `<g transform="translate(${10.5 * s},0)"><g clip-path="url(#elc${s < 0 ? 'l' : 'r'}${u})"><path d="${alm(s)}" fill="#f3eee2"/><path d="M-9,-6H9V-1.800H-9Z" fill="#5a4636" opacity=".22"/>
<g class="elf-pm"><g class="elf-pg"><circle r="3.100" fill="#5f8494"/><circle r="3.100" fill="none" stroke="#2c4350" stroke-width=".7"/><circle r="1.500" fill="#0d1216"/><circle class="elf-mi" r="3.100" fill="#c6efff"/><circle class="elf-mi" r="1.100" fill="#ffffff"/><circle cx="-1" cy="-1.300" r=".85" fill="#fff"/></g></g>
<g class="elf-bl"><path class="elf-lid" d="M-10,-18H10V-4.800H-10Z"/></g></g>
<path d="${alm(s)}" fill="none" stroke="${INK}" stroke-width=".6"/>
<path d="M${-6.5 * s},.8Q${-2 * s},-4.600 ${3 * s},-3.400Q${5.6 * s},-2.800 ${8.8 * s},-3.200" fill="none" stroke="${INK}" stroke-width="1.500" stroke-linecap="round"/>
<path d="M${-4.5 * s},-6.500Q${.5 * s},-8.400 ${6 * s},-6.200" fill="none" stroke="${INK}" stroke-width=".5" opacity=".45"/></g>`;
  const BROW = `<path d="M-7.500,1.600Q-1,-2.600 8,-.4" fill="none" stroke="#7a5f36" stroke-width="1.700" stroke-linecap="round"/><path d="M-7.500,1.600Q-1,-2.600 8,-.4" fill="none" stroke="${INK}" stroke-width=".5" stroke-linecap="round" opacity=".7"/>`;
  // the rig's pen and grain, with the ink blotches held back: they muddy pale skin and a pale board
  const soft = (id, o = {}) => `<filter id="${id}" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="${o.freq ?? .06}" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="${o.scale ?? 1.5}" xChannelSelector="R" yChannelSelector="G" result="d"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .16 0 0 0 0 .09 0 0 0 0 .04 ${o.blot ?? .8} 0 0 0 ${o.bias ?? -.46}" result="b"/><feTurbulence type="fractalNoise" baseFrequency="${o.grain ?? .8}" numOctaves="2" seed="11"/><feColorMatrix type="matrix" values="0 0 0 0 .14 0 0 0 0 .08 0 0 0 0 .04 0 ${o.ga ?? 1} 0 0 ${o.gb ?? -.5}" result="g"/><feMerge result="m"><feMergeNode in="b"/><feMergeNode in="g"/></feMerge><feComposite in="m" in2="d" operator="in" result="mc"/><feMerge><feMergeNode in="d"/><feMergeNode in="mc"/></feMerge></filter>`;
  const FG = (u, body) => `<g filter="url(#elff${u})" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">${body}</g>`;
  const cloak = (s, u) => `<path d="M${-11 * s},57C${-30 * s},60 ${-47 * s},68 ${-51 * s},84L${-58 * s},135H${-21 * s}C${-19 * s},110 ${-12 * s},86 ${-2 * s},72L${-4 * s},64Z" fill="url(#elfk${u})" stroke-width="2"/>${s < 0 ? `<path d="M-11,57C-30,60 -47,68 -51,84L-58,135H-40C-40,110 -38,84 -26,66Z" fill="url(#elfp${u})" stroke="none"/>` : '<path d="M30,66C42,72 46,84 47,100" fill="none" stroke="#dfe8dc" stroke-width="1.600" opacity=".5"/>'}
<path d="M${-40 * s},77C${-44 * s},96 ${-46 * s},116 ${-47 * s},135M${-29 * s},72C${-32 * s},96 ${-32 * s},116 ${-33 * s},135" fill="none" stroke-width="1" opacity=".6"/>
<path d="M${-4 * s},64L${-2 * s},72C${-12 * s},86 ${-19 * s},110 ${-21 * s},135" fill="none" stroke="#c6d0c2" stroke-width="1.300"/>`;
  const figure = (u) => `<svg class="rig-s rig-rim" xmlns="${NS}" width="80" height="100" viewBox="-80 -70 160 200" style="left:${CX - 40}px;top:${HY - 35}px"><defs><clipPath id="elcl${u}"><path d="${alm(-1)}"/></clipPath><clipPath id="elcr${u}"><path d="${alm(1)}"/></clipPath></defs>
${FG(u, `<path d="M-25,-10C-34,10 -38,44 -42,80L-44,135H44L42,80C38,44 34,10 25,-10Z" fill="#a8925c" stroke-width="2"/><path d="M-25,-10C-34,10 -38,44 -42,80L-44,135H-30C-30,90 -26,40 -18,-6Z" fill="url(#elfp${u})" stroke="none"/>
<path d="M-33,30C-36,60 -38,90 -39,130M33,30C36,60 38,90 39,130M-28,40C-30,70 -32,96 -33,130M29,44C31,70 32,96 33,130" fill="none" stroke-width=".9" opacity=".6"/>
<path d="M-8.500,26L-10,62H10L8.500,26Z" fill="url(#elfs${u})" stroke-width="1.600"/><path d="M-8.500,26L-9.200,46Q0,52 9,45L8.500,26Z" fill="#6a4a38" opacity=".3" stroke="none"/><path d="M-8.500,26L-9.200,46Q-4,49 0,49L-2,26Z" fill="url(#elfp${u})" stroke="none"/>
<path d="M-40,135L-30,70Q0,58 30,70L40,135Z" fill="${GOWN}" stroke-width="1.600"/><path d="M-10,58H10L13,61Q0,75 -13,61Z" fill="url(#elfs${u})" stroke-width="1.200"/>
<path d="M-13,61Q0,75 13,61" fill="none" stroke-width="3.200"/><path d="M-13,61Q0,75 13,61" fill="none" stroke="${GOLD}" stroke-width="1.700"/>
<path d="M-7,86C-9,102 -8,120 -10,135M8,84C10,102 9,120 11,135M0,92V135" fill="none" stroke-width=".9" opacity=".45"/><path d="M-20,135C-18,112 -12,92 -4,76L-3,135Z" fill="url(#elfq${u})" stroke="none" opacity=".7"/>
${cloak(-1, u)}${cloak(1, u)}
<g transform="translate(.5,70) rotate(24)"><g transform="scale(1.02)">${leaf(SILVER, 1.2)}</g><g transform="scale(.72)">${leaf(LEAFG, .9, '#e6efe2')}</g></g>`)}
<g transform="translate(0,${PIV})"><g class="elf-hd"><g transform="translate(0,${-PIV})">
${FG(u, `<path d="M-26,14C-33,-18 -29,-50 0,-52C29,-50 33,-18 26,14L20,24H-20Z" fill="url(#elfh${u})" stroke-width="2"/>
<path d="M-21,-10C-22,-32 -12,-42 0,-42C12,-42 22,-32 21,-10C21,8 16,26 7,36Q0,42 -7,36C-16,26 -21,8 -21,-10Z" fill="url(#elfs${u})" stroke-width="1.700"/>
<path d="M-21,-10C-21,8 -16,26 -7,36C-12,24 -15.500,8 -15,-8C-15,-22 -13,-32 -9,-39C-18,-35 -22,-24 -21,-10Z" fill="#7a5340" opacity=".2" stroke="none"/><path d="M-21,-10C-21,8 -16,26 -7,36C-11,26 -17,8 -17.500,-8C-17.500,-22 -15,-32 -11,-38C-19,-34 -22,-24 -21,-10Z" fill="url(#elfp${u})" stroke="none"/>
<ellipse cx="-12" cy="14" rx="5" ry="3.500" fill="#c9766a" opacity=".16" stroke="none"/><ellipse cx="13" cy="14" rx="5" ry="3.500" fill="#d98a7a" opacity=".18" stroke="none"/>
<path d="M-1.600,-3C-2,6 -4,12 -3.600,15.500Q-1,18.800 2.800,17" fill="none" stroke-width=".9" opacity=".8"/><path d="M-4,17.500Q-5.500,16 -4.500,14" fill="none" stroke-width=".7" opacity=".6"/><path d="M-1.600,-3C-2,6 -4,12 -3.600,15.500L-1,16.500C-1.200,10 -.4,4 -.2,-3Z" fill="#7a5340" opacity=".08" stroke="none"/>
<path d="M-3,35.500Q0,37 3,35.500" fill="none" stroke-width=".6" opacity=".45"/><path class="elf-shade" d="M-21,-10C-22,-32 -12,-42 0,-42C12,-42 22,-32 21,-10C21,2 19,12 16,20Q0,10 -16,20C-19,12 -21,2 -21,-10Z" fill="#141c2a" stroke="none"/>`)}
<g transform="translate(-10.500,-9.200) scale(-1,1)"><g class="elf-bL">${BROW}</g></g><g transform="translate(10.500,-9.200)"><g class="elf-bR">${BROW}</g></g>
${eye(-1, u)}${eye(1, u)}
<g stroke="${INK}" stroke-linecap="round" stroke-linejoin="round"><g class="elf-m0"><path d="M-4.600,26.300Q0,30.200 4.600,26.300Q0,27.300 -4.600,26.300Z" fill="#b9776a" stroke="none"/><path d="M-6,25.800Q-3,24.500 0,25.500Q3,24.500 6,25.800" fill="none" stroke-width="1"/></g>
<g class="elf-m1"><path d="M-5.400,26.300Q0,31.200 5.400,26.300Q0,28.300 -5.400,26.300Z" fill="#b9776a" stroke="none"/><path d="M-7.200,24.400Q-3.500,26.300 0,26.200Q3.500,26.300 7.200,24.400" fill="none" stroke-width="1"/><path d="M-8.300,23.300q-.8,1.200 0,2.400M8.300,23.300q.8,1.200 0,2.400" fill="none" stroke-width=".5" opacity=".6"/></g>
<g class="elf-m2"><path d="M-4.200,26.600Q0,29.800 4.200,26.600Q0,27 -4.200,26.600Z" fill="#a9695e" stroke="none"/><path d="M-6,27.300Q-3,24.800 0,25.600Q3,24.800 6,27.300" fill="none" stroke-width="1"/></g></g>
${FG(u, `<path d="M1,-45C-12,-47 -25,-40 -27,-22C-29,-4 -27,12 -23,26L-18.500,20C-21.500,6 -22,-10 -19.500,-21C-16,-32 -8,-39 1,-41Z" fill="url(#elfh${u})" stroke-width="1.600"/>
<path d="M-1,-45C12,-47 25,-40 27,-22C29,-4 27,12 23,26L18.500,20C21.500,6 22,-10 19.500,-21C16,-32 8,-39 -1,-41Z" fill="#e6d8a6" stroke-width="1.600"/>
<path d="M1,-45C-12,-47 -25,-40 -27,-22C-29,-4 -27,12 -23,26L-22,10C-25,-8 -24,-28 -12,-40Z" fill="url(#elfp${u})" stroke="none" opacity=".8"/>
<path d="M-4,-43.500C-15,-42 -22.500,-33 -23.500,-18M-23.500,-8C-24.500,2 -23.500,12 -21,21M4,-43.500C15,-42 22.500,-33 23.500,-18M23.500,-8C24.500,2 23.500,12 21,21M0,-45V-41" fill="none" stroke-width=".8" opacity=".65"/>
<path d="M6,-42C15,-39 20.500,-31 21.500,-20M25,-14C26,-4 25,6 23,14" fill="none" stroke="#fbf3d2" stroke-width="1.300" opacity=".9"/>
<path d="M-25,-25.500Q-11,-23 0,-16Q11,-23 25,-25.500" fill="none" stroke-width="3.400"/><path d="M-25,-25.500Q-11,-23 0,-16Q11,-23 25,-25.500" fill="none" stroke="#e9eef0" stroke-width="1.800"/>
${star(0, -14.5, 5, '#f6fbff', .8, .5)}<circle cx="0" cy="-14.500" r="1.300" fill="#bfe0f2" stroke-width=".4"/>
<g class="elf-hood"><path fill-rule="evenodd" d="M-37,66C-46,10 -38,-55 0,-59C38,-55 46,10 37,66ZM-22,42C-27.500,10 -25,-36 0,-38.500C25,-36 27.500,10 22,42Q18,50 14,56H-14Q-18,50 -22,42Z" fill="url(#elfk${u})" stroke-width="2"/>
<path d="M-37,66C-46,10 -38,-55 0,-59C-22,-52 -34,-20 -31,20C-30,40 -28,56 -26,66Z" fill="url(#elfp${u})" stroke="none"/>
<path d="M-22,42C-27.500,10 -25,-36 0,-38.500C25,-36 27.500,10 22,42" fill="none" stroke="#39453d" stroke-width="3" opacity=".55"/>
<path d="M-31,-20C-33,6 -32,34 -29,60M31,-22C33,6 32,34 29,60M-14,-52C-24,-44 -29,-34 -30,-22" fill="none" stroke-width=".9" opacity=".6"/><path d="M16,-52C27,-44 33,-30 34,-10" fill="none" stroke="#dfe8dc" stroke-width="1.400" opacity=".5"/></g>`)}
</g></g></g></svg>`;
  // two long locks fall forward over her shoulders; they are their own layer and sway
  const locks = (u) => {
    const lock = (s) => `<path d="M${-25 * s},16C${-30 * s},36 ${-25 * s},54 ${-29 * s},74C${-32 * s},94 ${-27 * s},108 ${-30 * s},130H${-19 * s}C${-17 * s},108 ${-21 * s},94 ${-19 * s},76C${-17 * s},56 ${-20 * s},36 ${-17 * s},18Z" fill="${s < 0 ? `url(#elfh${u})` : '#e6d8a6'}" stroke-width="1.700"/>${s < 0 ? `<path d="M-25,16C-30,36 -25,54 -29,74C-32,94 -27,108 -30,130H-25C-23,108 -27,94 -25,76C-23,56 -25,36 -22,17Z" fill="url(#elfp${u})" stroke="none"/>` : ''}
<path d="M${-22 * s},24C${-25 * s},40 ${-22 * s},56 ${-25 * s},76C${-27 * s},94 ${-23 * s},108 ${-25 * s},126" fill="none" stroke-width=".8" opacity=".65"/><path d="M${-19.5 * s},30C${-21 * s},44 ${-19 * s},58 ${-21.5 * s},78C${-23 * s},92 ${-20.500 * s},106 ${-21.500 * s},120" fill="none" stroke="#fbf3d2" stroke-width="1.200" opacity=".85"/>`;
    return `<div class="rig-z elf-lk"><svg class="rig-s rig-rim" xmlns="${NS}" width="40" height="62.5" viewBox="-40 10 80 125"><g filter="url(#elff${u})" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">${lock(-1)}${lock(1)}</g></svg></div>`;
  };
  // tears (death): they run slowly from the closed lids down her cheeks and stay on her face
  const magic = () => `<div class="elf-mag"><i style="left:${CX - 10.75}px"></i><i style="left:${CX - .25}px"></i></div>`;
  const tears = () => `<div class="elf-tears">${[[-6.3, 0], [5.3, -2.6]].map(([x, dl]) => `<div class="elf-tear" style="left:${CX + x - 2.5}px;top:${HY + 2}px"><i style="--r:4px;--dl:${dl}s"></i><i style="--r:9px;--dl:${dl - 2.9}s"></i></div>`).join('')}</div>`;

  // ---- her arms and what she holds (rig px). The elbow stays down in the car; the hand is near the shoulder. ----
  const arm = (u, ex, ey, hx, hy, w = 6) => {
    const dx = hx - ex, dy = hy - ey, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L, a = w / 2 + 1, b = w / 2 - .4;
    const at = (f, o) => `${n(ex + dx * f + nx * o)},${n(ey + dy * f + ny * o)}`;
    return `<path d="M${at(0, a)}L${at(1, b)}L${at(1, -b)}L${at(0, -a)}Z" fill="#869787" stroke-width="1"/><path d="M${at(0, -a)}L${at(1, -b)}L${at(1, -b * .1)}L${at(0, -a * .1)}Z" fill="${HP(u)}" stroke="none" opacity=".8"/><path d="M${at(.3, a * .7)}L${at(.62, -a * .5)}" fill="none" stroke-width=".5" opacity=".6"/><path d="M${at(.82, b + .7)}L${at(.95, b + .6)}L${at(.95, -b - .6)}L${at(.82, -b - .7)}Z" fill="${SILVER}" stroke-width=".7"/>`;
  };
  const hand = (x, y, r = 3.5, rot = 0) => `<g transform="translate(${x},${y}) rotate(${rot})"><path d="M${-r},0C${-r},${n(-r * 1.25)} ${r},${n(-r * 1.25)} ${r},0C${r},${n(r * .95)} ${-r},${n(r * .95)} ${-r},0Z" fill="${SKIN}" stroke-width=".9"/><path d="M${n(-r * .45)},${n(-r * .85)}v${n(r * .8)}M${n(r * .05)},${n(-r * .92)}v${n(r * .85)}M${n(r * .5)},${n(-r * .85)}v${n(r * .8)}" fill="none" stroke-width=".45"/></g>`;
  const PR = (cls, u, x, y, w, body, extra = '') => `<div class="elf-p elf-${cls}">${S('rig-rim', x, y, w, RY - y + 10, G(u, body))}${extra}</div>`;
  const props = (u) => {
    const E = RY + 3;
    // The holding arm: only a short forearm shows. It comes out from under the cloak in front of her
    // body and the hand is at her chest; what she holds stands beside her neck, never out at the side.
    const AX = 15.5, AY = HY + 42, held = (body, y = AY) => `${arm(u, 22, E, AX + .6, y + 1.5, 6.6)}${body}${hand(AX, y, 3.5, -8)}`;
    // poor: a wilted flower
    return PR('wilt', u, 4, HY + 20, 34, held(`<g transform="translate(${AX - 34},15)">${ink2(`M34,${HY + 26}C34,${HY + 19} 35,${HY + 14} 39,${HY + 13.5}C42,${HY + 13.500} 43,${HY + 16} 43,${HY + 18}`, .8, '#6f6a45')}<path d="M43,${HY + 17.5}C40.500,${HY + 19} 40,${HY + 22} 41.500,${HY + 24.5}L43,${HY + 22}L44.500,${HY + 25}C46,${HY + 22} 45.500,${HY + 19} 43,${HY + 17.5}Z" fill="#9a8a68" stroke-width=".8"/><path d="M35,${HY + 19}C37.500,${HY + 20} 38.500,${HY + 22.5} 37.500,${HY + 25}C35.500,${HY + 24} 34.500,${HY + 21.5} 35,${HY + 19}Z" fill="#8a6f3c" stroke-width=".7"/></g>`))
      // good: a white flower of the woods
      + PR('flower', u, 4, HY + 14, 34, held(`<g transform="translate(${AX - 34},16)">${ink2(`M34,${HY + 25}C33.500,${HY + 20} 34.500,${HY + 16} 34,${HY + 12}`, .8, '#4f7d58')}<path d="M34,${HY + 20}C37,${HY + 19} 38.500,${HY + 16.5} 38.500,${HY + 15}C36,${HY + 15.5} 34.500,${HY + 17.5} 34,${HY + 20}Z" fill="#5c8a62" stroke-width=".7"/>
<g transform="translate(34,${HY + 9.5})">${[0, 60, 120, 180, 240, 300].map((a) => `<path transform="rotate(${a})" d="M0,0C2.200,-1.800 2.200,-4.800 0,-6.600C-2.200,-4.800 -2.200,-1.800 0,0Z" fill="#fbfaf2" stroke-width=".7"/>`).join('')}<circle r="1.500" fill="#e2b93f" stroke-width=".5"/></g></g>`))
      // great: a small harp leaning at her shoulder, her fingers on the strings
      + PR('harp', u, 20, HY + 6, 36, `<path d="M${[31.5, 34, 36.5, 39, 41.5, 44].map((x) => `${x},${n(HY + 17.5 - (x - 30) * .12)}V${n(Math.min(RY + 6, HY + 18 + (x - 27.5) * 2.75))}`).join('M')}" fill="none" stroke="${INK}" stroke-width="1.100" opacity=".55"/><path d="M${[31.5, 34, 36.5, 39, 41.5, 44].map((x) => `${x},${n(HY + 17.5 - (x - 30) * .12)}V${n(Math.min(RY + 6, HY + 18 + (x - 27.5) * 2.75))}`).join('M')}" fill="none" stroke="#f1f4f2" stroke-width=".5"/>
<path d="M25.500,${HY + 18.5}L30.500,${HY + 16}L49,${RY + 8}H43.500Z" fill="url(#elfw${u})" stroke-width="1"/><path d="M25.500,${HY + 18.5}L27.800,${HY + 17.3}L46,${RY + 8}H43.500Z" fill="${HP(u)}" stroke="none"/>
${ink2(`M27.500,${HY + 18}C31,${HY + 10} 39,${HY + 19} 47,${HY + 13.5}C49.500,${HY + 11.500} 48.500,${HY + 8.5} 46.500,${HY + 9.5}`, 2.2, '#d6cfb6')}${ink2(`M47.500,${HY + 14}C50.500,${HY + 30} 49.500,${HY + 46} 46.500,${RY + 8}`, 1.9, '#cfc8b0')}
${arm(u, 33, E, 37.5, HY + 41, 5.6)}${hand(37.5, HY + 39, 3.3, 12)}`)
      // superb: a star-glass, the light of Elbereth's stars caught in crystal
      + PR('glass', u, 4, HY + 18, 34, held(`<g transform="translate(${AX},${HY + 30})"><path d="M-1.800,4H1.800V9.500H-1.800Z" fill="${SILVER}" stroke-width=".7"/><circle cx="0" cy="0" r="5.200" fill="#eaf5fb" stroke-width=".9"/><path d="M-5.200,0A5.200,5.200 0 0 0 0,5.200A7,7 0 0 1 -5.200,0Z" fill="#9fc4dc" opacity=".6" stroke="none"/>${star(0, 0, 4.2, '#ffffff', .4, .5)}<path d="M-1.500,-6.300h3" fill="none" stroke-width="2.200"/><path d="M-1.500,-6.300h3" fill="none" stroke="${SILVER}" stroke-width="1"/></g>`),
        `${Z('elf-gl', AX, HY + 30)}${Z('elf-glint', AX + 2.5, HY + 27.5, SL('', 0, 0, 12, 12, '<path d="M6,0L7,5L12,6L7,7L6,12L5,7L0,6L5,5Z" fill="#fffef4"/>'))}`)
      // a player kill: her bow, strung
      + PR('bow', u, -52, HY - 24, 26, `<g transform="translate(6.5,0)"><path d="M-38.500,${HY - 19}L-39.500,${RY + 8}" fill="none" stroke="#e9eee8" stroke-width=".7"/>${ink2(`M-38.500,${HY - 20}C-50.500,${HY + 4} -50.500,${HY + 44} -39.500,${RY + 8}`, 2, '#8a6a42')}<path d="M-38.500,${HY - 20}l-1.600,3.400l2.600,.4Z" fill="${SILVER}" stroke-width=".7"/>
${ink2(`M-47.200,${HY + 20}V${HY + 29}`, 2.6, '#cfd6d8')}${arm(u, -34, E, -46.6, HY + 27)}${hand(-47, HY + 25, 3.5, -8)}</g>`)
      // level up: a hand to her heart
      + PR('heart', u, -44, HY + 30, 46, `${arm(u, -21, E, -6.5, HY + 47, 7)}${hand(-4, HY + 45, 4.2, -52)}`)
      // achievement: a silver cup raised a little
      + PR('cup', u, 4, HY + 20, 34, held(`<g transform="translate(${AX},${HY + 40.5})"><path d="M0,-3V2" fill="none" stroke-width="3"/><path d="M0,-3V2" fill="none" stroke="${SILVER}" stroke-width="1.500"/><path d="M-3.800,3.500Q0,.5 3.800,3.500Z" fill="${SILVER}" stroke-width=".7"/><path d="M-5.200,-13H5.200C5.200,-7 3.200,-3.500 0,-3.500C-3.200,-3.500 -5.200,-7 -5.200,-13Z" fill="url(#elfi${u})" stroke-width=".9"/><ellipse cx="0" cy="-13" rx="5.200" ry="1.400" fill="#7a2f3a" stroke-width=".7"/><path d="M-4.600,-9.500Q0,-7.500 4.600,-9.500" fill="none" stroke="${GOLD}" stroke-width=".8"/></g>`));
  };
  // her hands at rest on the rail (in front of the car)
  const hands = (u) => {
    const fing = (x, len) => `<path d="M${n(x - 1.5)},${RY - 3.5}C${n(x - 1.5)},${RY - 6.6} ${n(x + 1.5)},${RY - 6.6} ${n(x + 1.5)},${RY - 3.5}L${n(x + 1.4)},${n(RY - 5 + len)}C${n(x + 1.4)},${n(RY - 3 + len)} ${n(x - 1.4)},${n(RY - 3 + len)} ${n(x - 1.4)},${n(RY - 5 + len)}Z" fill="${SKIN}" stroke-width=".8"/>`;
    const h = (cls, x, s) => `<g class="${cls}">${[0, 1, 2, 3].map((i) => fing(x + s * (i * 3.1 - 4.6), [7.6, 9, 8.8, 7.2][i])).join('')}</g>`;
    return S('rig-rim', -56, RY - 10, 112, 20, G(u, h('elf-hL', -31, 1) + h('elf-hR', 31, -1)));
  };

  // ---- the car: a deep hull of pale wood in flowing strakes, a swan's neck at the prow, a leaf-scroll at the stern ----
  const basket = (u) => {
    // the hull is deeper than it looks: its sides run on down to K.BD behind the sign (no keel is drawn)
    const BD = K.BD, wx = (y) => 52 - 6 * Math.pow((y - RY - 1) / (BD - RY - 1), .8);
    let ribs = '', strakes = '';
    for (const x of [-40, -27, -13.5, 0, 13.5, 27, 40]) ribs += `M${x},${RY + 3}Q${n(x * .96)},${RY + 30} ${n(x * .885)},${BD}`;
    for (const y of [RY + 9, RY + 17, RY + 24, RY + 39, RY + 47, RY + 55, RY + 63, RY + 70]) { const a = n(wx(y) - .8); strakes += `M${-a},${y}Q0,${y + 5} ${a},${y}`; }
    const side = (x) => `C${n(x * 51 / 52)},${RY + 22} ${n(x * 47.5 / 52)},${RY + 48} ${n(x * 46 / 52)},${BD}`;
    const hull = `M-52,${RY + 1}${side(-52)}H46${side(52).replace(/^C(\S+) (\S+) (\S+)$/, (_, a, b, c) => `C${b} ${a} 52,${RY + 1}`)}Z`;
    const by = BY + 1, bw = n(wx(BY) + 1.2);
    const ring = (x) => `<path d="M${x - 3},${BY - 3.4}h6v3.400h-6Z" fill="${SILVER}" stroke="${INK}" stroke-width=".7"/><circle cx="${x}" cy="${by}" r="2.300" fill="none" stroke="#17120e" stroke-width="2"/><circle cx="${x}" cy="${by}" r="2.300" fill="none" stroke="${SILVER}" stroke-width=".8"/>`;
    return S('rig-rim', -76, RY - 30, 152, BD - RY + 38, `${G(u, `
${ink2(`M-51,${RY + 2}C-61,${RY + 1} -64,${RY - 8} -60,${RY - 14}C-57,${RY - 18.500} -58,${RY - 23} -62.500,${RY - 23}`, 3.2, '#e2dcc6')}
<path d="M-64.500,${RY - 24.2}L-71,${RY - 21.3}L-64.500,${RY - 20.3}Z" fill="${GOLD}" stroke-width=".8"/><ellipse cx="-62.500" cy="${RY - 22.6}" rx="3.600" ry="2.800" fill="#ece6d2" stroke-width=".9"/><circle cx="-63.600" cy="${RY - 23.2}" r=".6" fill="${INK}" stroke="none"/>
<path d="M-57,${RY - 2}C-61,${RY - 6} -61,${RY - 11} -58.500,${RY - 14}" fill="none" stroke-width=".5" opacity=".6"/>
${ink2(`M51,${RY + 2}C60,${RY + 1} 63,${RY - 6} 60,${RY - 12}C58,${RY - 15.500} 53.500,${RY - 14} 55,${RY - 10.500}C55.800,${RY - 9} 57.500,${RY - 9.500} 57.500,${RY - 11}`, 2.4, '#e2dcc6')}
<path d="${hull}" fill="url(#elfw${u})" stroke-width="1.1"/>
<path d="M-52,${RY + 1}${side(-52)}H-24L-29,${RY + 1}Z" fill="${HP(u)}" stroke="none"/><path d="M-52,${RY + 1}${side(-52)}H-36L-41,${RY + 1}Z" fill="${HQ(u)}" stroke="none"/>
<path d="${ribs}" fill="none" stroke-width=".55" opacity=".6"/>
<path d="${strakes}" fill="none" stroke-width=".7" opacity=".7"/>
<path d="M-46,${RY + 13.5}${[-34.5, -23, -11.5, 0, 11.5, 23, 34.5, 46].map((x, i) => `Q${n(x - 5.75)},${n(RY + 14.4 + (i % 2 ? 3.6 : -2.6) - (x / 46) ** 2)} ${x},${n(RY + 14.4 - (x / 46) ** 2 * .9)}`).join('')}" fill="none" stroke="#f6f8f4" stroke-width="1" opacity=".85"/>
${[-28.7, -5.7, 17.3, 40.3].map((x) => `<g transform="translate(${x},${RY + 11}) rotate(-52) scale(.36)">${leaf('#f1f3ee', 1.4)}</g>`).join('')}${[-40.3, -17.3, 5.7, 28.7].map((x) => `<g transform="translate(${x},${RY + 18.5}) rotate(128) scale(.36)">${leaf('#f1f3ee', 1.4)}</g>`).join('')}
<path d="M${-bw},${BY - 3.6}Q0,${BY + .2} ${bw},${BY - 3.6}L${bw - .3},${BY + .6}Q0,${BY + 4.4} ${-bw + .3},${BY + .6}Z" fill="url(#elfi${u})" stroke-width="1"/><path d="M${-bw},${BY - 3.6}Q-34,${BY - 1.6} -24,${BY - 1.2}L-24,${BY + 3}Q-36,${BY + 2.4} ${-bw + .3},${BY + .6}Z" fill="${HP(u)}" stroke="none"/><path d="M${-bw + 4},${BY - 2}Q0,${BY + 1.4} ${bw - 4},${BY - 2}" fill="none" stroke="#fff" stroke-width=".7" opacity=".55"/>
<rect x="-54" y="${RY - 3}" width="108" height="6.200" rx="3" fill="url(#elfi${u})" stroke-width="1.1"/><path d="M-51,${RY - 1.3}H51" fill="none" stroke="#fff" stroke-width=".8" opacity=".6"/><rect x="-54" y="${RY - 3}" width="26" height="6.200" rx="3" fill="${HP(u)}" stroke="none"/>`)}
<g>${ring(-40)}${ring(40)}</g>`);
  };

  // ---- the burner: a silver lamp shaped like an open flower, hung on two slender stems under the mouth ----
  const burner = (u) => S('rig-rim', -26, HG, 52, FY - HG + 20, G(u, `
${ink2(`M-19,${HG + 4}C-19,${HG + 13} -15,${FY - 5} -11.500,${FY + 1.5}M19,${HG + 4}C19,${HG + 13} 15,${FY - 5} 11.500,${FY + 1.5}`, 1, '#dfe5e6')}
<circle cx="-18.300" cy="${HG + 12}" r="1.100" fill="${SILVER}" stroke-width=".5"/><circle cx="18.300" cy="${HG + 12}" r="1.100" fill="${SILVER}" stroke-width=".5"/>
<path d="M-11.500,${FY}C-14.500,${FY - 1} -17,${FY - 4.500} -16,${FY - 8}C-12.500,${FY - 6} -10,${FY - 3} -8.500,${FY + 1}Z" fill="url(#elfi${u})" stroke-width=".9"/><path d="M11.500,${FY}C14.500,${FY - 1} 17,${FY - 4.500} 16,${FY - 8}C12.500,${FY - 6} 10,${FY - 3} 8.500,${FY + 1}Z" fill="#e9eef0" stroke-width=".9"/>
<path d="M-12.500,${FY}C-13,${FY + 6.500} -7,${FY + 11} 0,${FY + 11}C7,${FY + 11} 13,${FY + 6.500} 12.500,${FY}Z" fill="url(#elfi${u})" stroke-width="1.1"/>
<path d="M-12.500,${FY}C-13,${FY + 6.500} -7,${FY + 11} -2,${FY + 11}C-6,${FY + 8} -7,${FY + 4} -6,${FY}Z" fill="${HP(u)}" stroke="none"/>
<path d="M-4.500,${FY + 1.5}C-5.500,${FY + 6} -3,${FY + 9.500} 0,${FY + 11}C3,${FY + 9.500} 5.500,${FY + 6} 4.500,${FY + 1.5}" fill="none" stroke-width=".7" opacity=".75"/><path d="M8.500,${FY + 2.5}Q9.500,${FY + 6} 6,${FY + 9}" fill="none" stroke="#fff" stroke-width=".9" opacity=".7"/>
<ellipse class="elf-lamp" cx="0" cy="${FY - .3}" rx="12" ry="2" stroke-width=".9"/>
<circle cx="0" cy="${FY + 12.2}" r="1.600" fill="${SILVER}" stroke-width=".7"/><path d="M0,${FY + 13.6}C2,${FY + 15} 1.600,${FY + 17} 0,${FY + 18.2}C-1.600,${FY + 17} -2,${FY + 15} 0,${FY + 13.6}Z" fill="#f4fbff" stroke-width=".7"/>`))
    + Z('elf-lampg', 0, FY - 1);

  // ---- the envelope: fine cloth in nine slender gores; the helpers lay flowing ornament on the surface ----
  const KS = [-1, -.93, -.74, -.45, -.15, .15, .45, .74, .93, 1];
  const panels = (g, cols, op = 1) => KS.slice(0, -1).map((k, i) => `<path d="${g.gore(k, KS[i + 1])}" fill="${cols[i % cols.length]}" stroke="none"${op < 1 ? ` opacity="${op}"` : ''}/>`).join('');
  const seams = (g, col, op = .6) => KS.slice(1, -1).map((k) => `<path d="${g.seam(k)}" fill="none" stroke-width=".8"/>${col ? `<path d="${g.seam(k + (k > 0 ? -.025 : .025))}" fill="none" stroke="${col}" stroke-width=".7" opacity="${op}"/>` : ''}`).join('');
  const band = (g, u, t0, t1, fill) => `<path d="${g.band(t0, t1)}" fill="${fill}" stroke-width=".9"/><path d="${g.band(t0, t1, -1, -.4)}" fill="${HP(u)}" stroke="none"/><path d="${g.lat(t0 + (t1 - t0) * .25, -.9, .93)}" fill="none" stroke="#fff" stroke-width=".7" opacity=".35"/>`;
  const creases = (g, list) => `<path d="${list.map(([k, a, b]) => g.seam(k, a, b)).join('')}" fill="none" stroke-width=".7" opacity=".55"/>`;
  // the vine: a wave round the balloon, a leaf at each crest
  const vine = (g, t, amp, waves, col, lf, o = {}) => {
    const N = waves * 8, a0 = Math.asin(-.975), a1 = Math.asin(.975), s = o.s || .5;
    let d = '', lv = '';
    for (let i = 0; i <= N; i++) {
      const k = Math.sin(a0 + (a1 - a0) * i / N), w = Math.sin(i / 8 * 2 * Math.PI);
      d += (i ? 'L' : 'M') + pp(g.pt(k, t + amp * w));
      if (lf && i % 4 === 2) { const dn = i % 8 === 2; lv += `<g transform="${g.place(k, t + (dn ? 1 : -1) * amp * (o.out || 2.1), s)} rotate(${dn ? (o.droop ? 172 : 140) : (o.droop ? 196 : -40)})">${leaf(Array.isArray(lf) ? lf[(i >> 2) % lf.length] : lf, .7 / s * .6)}</g>`; }
    }
    return (o.dash ? `<path d="${d}" fill="none" stroke="${col}" stroke-width="${o.w || 1}" stroke-dasharray="${o.dash}"/>` : ink2(d, o.w || 1, col)) + lv;
  };
  // leaves in a ring, tips toward the mouth (a calyx at the crown) or the crown
  const ring = (g, t, num, fills, s, o = {}) => g.along(num, o.k0 ?? -.9, o.k1 ?? .9).map((k, i) => `<g transform="${g.place(k, t, s)} rotate(${o.rot ?? 180})">${leaf(fills[i % fills.length], n(.7 / s), o.rib)}</g>`).join('');
  const stars = (g, list, fill) => list.map(([k, t, r]) => { const p = g.pt(k, t); return star(p[0], p[1], r, fill, .45); }).join('');
  const cap = (c, fill, w = 8) => `<path d="M${n(c[0] - w)},${n(c[1] + 4)}Q${n(c[0])},${n(c[1] - 4)} ${n(c[0] + w)},${n(c[1] + 4)}Q${n(c[0])},${n(c[1] + 7.5)} ${n(c[0] - w)},${n(c[1] + 4)}Z" fill="${fill}" stroke-width="1"/>`;
  const bud = (c, fill, h = 9) => `<path d="M${n(c[0])},${n(c[1] - h)}C${n(c[0] + 3.8)},${n(c[1] - h * .5)} ${n(c[0] + 3)},${n(c[1] - 1)} ${n(c[0])},${n(c[1] + 1)}C${n(c[0] - 3)},${n(c[1] - 1)} ${n(c[0] - 3.8)},${n(c[1] - h * .5)} ${n(c[0])},${n(c[1] - h)}Z" fill="${fill}" stroke-width=".9"/>`;
  const rent = (g, k, t, rot, s = 1) => `<g transform="${g.place(k, t, s)} rotate(${rot})"><path d="M-8,0Q-3,-3.200 -.5,-.8Q3,-4 8,.3Q3.500,2.600 .5,1.200Q-3,3.400 -8,0Z" fill="#231a15" stroke-width=".8"/><path d="M-.5,-.8Q3,-4 8,.3L5,-3.600Q2,-5 -.5,-.8Z" fill="#a39c84" stroke-width=".7"/></g>`;
  const glow = (p, r, d) => `<div class="rig-a elf-starg">${S('', n(p[0]) - r - 2, n(p[1]) - r - 2, 2 * r + 4, 2 * r + 4, d)}</div>`;

  const ENV = {
    // faded and worn out: slack, lopsided, torn, mended with whatever plain cloth there was
    poor: { cond: { sag: 1, lop: .8, dents: [{ side: -1, t: .48, depth: 13, span: .13 }, { side: 1, t: .3, depth: 6, span: .1 }] }, art: (g, u) => { const c = g.pt(0, 0); return {
      base: '#7f7a66', lip: '#8f8a78', ring: '#8a8474',
      inside: `${panels(g, ['#89836d', '#75715f', '#938a70', '#6d6a5c', '#827b66'])}${seams(g, '#b9b29a', .5)}
${creases(g, [[-.8, .34, .72], [-.5, .42, .68], [.42, .68, .98], [-.3, .7, .98], [.8, .56, .9], [-.05, .74, .98], [.3, .04, .2]])}
${g.patch(.42, .36, 24, 18, { fill: '#cbc4ad', rot: 10, sw: 1 })}${g.patch(-.3, .26, 18, 14, { fill: '#a9a696', rot: -12, sw: 1, hatch: HQ(u) })}${g.patch(-.12, .68, 15, 18, { fill: '#bdb499', rot: 7, sw: 1 })}${g.patch(.72, .66, 12, 11, { fill: '#d2ccb8', rot: -16 })}
${rent(g, .08, .44, -24, 1.1)}${rent(g, -.62, .6, 38, .85)}
${vine(g, .615, .022, 3, '#5f5238', ['#8a6a3c', '#6f5632', '#9a7a48'], { droop: 1, s: .55, out: 2.3 })}`,
      over: `<path d="M${n(c[0] - 5)},${n(c[1] + 3)}Q${n(c[0])},${n(c[1] - 4)} ${n(c[0] + 5)},${n(c[1] + 3)}Q${n(c[0])},${n(c[1] + 6)} ${n(c[0] - 5)},${n(c[1] + 3)}Z" fill="#6d6a5c" stroke-width="1"/><path d="M${n(c[0] + 1)},${n(c[1])}q5,-2 6,4" fill="none" stroke-width="1"/>`,
    }; } },
    // plain cloak-grey cloth, sound enough
    meh: { cond: { sag: .3, lop: -.12 }, art: (g, u) => { const c = g.pt(0, 0); return {
      base: '#7f8b7d', lip: '#a2a89c',
      inside: `${panels(g, ['#869283', '#778375'])}${seams(g, '#c6cdbf', .5)}${creases(g, [[.42, .74, .98], [-.34, .76, .98]])}${g.patch(-.42, .32, 13, 11, { fill: '#a3ac9f', rot: -6 })}
${ink2(g.lat(.53), 1.1, '#c9cfc2')}${ink2(g.lat(.84), .8, '#c9cfc2')}`,
      over: cap(c, '#7f8a7d', 7),
    }; } },
    // sound and full: leaf green and silver
    good: { cond: {}, art: (g, u) => { const c = g.pt(0, 0), e = g.pt(0, .31); return {
      base: '#4f7d58', lip: SILVER, ring: SILVER,
      inside: `${panels(g, ['#568660', '#467350'])}${seams(g, '#cfe0c8', .55)}
${ring(g, .115, 9, ['#3c6a48', '#629468'], .95, { rib: '#dfeada' })}
${vine(g, .57, .026, 5, '#e9eef0', ['#dcc05a', '#f1f3ee'], { s: .5 })}${ink2(g.lat(.85), 1, '#dfe5e6')}
<g transform="translate(${n(e[0])},${n(e[1])})"><circle r="12" fill="#3c6a48" stroke-width="1"/><circle r="12" fill="none" stroke="#e9eef0" stroke-width="1.300"/><circle r="9.800" fill="none" stroke-width=".5"/><g transform="rotate(18) scale(1.05)">${leaf('#dcc05a', .8)}</g></g>`,
      over: `${cap(c, '#bcc6ca', 8)}${bud(c, '#e9eef0', 8)}`,
    }; } },
    // fine work: the twilight sky sown with stars, the swan-ship under the star
    great: { cond: { taut: .5 }, art: (g, u) => { const c = g.pt(0, 0), e = g.pt(0, .33), st = g.pt(.02, .15); return {
      base: '#27406f', lip: '#e9eef0', ring: '#e9eef0',
      inside: `${panels(g, ['#2b4678', '#223a66'])}${seams(g, '#aebbd6', .55)}
${stars(g, [[-.62, .2, 2.6], [-.36, .1, 2], [.4, .12, 2.4], [.66, .26, 3], [-.72, .4, 2.2], [.3, .4, 1.8], [-.2, .44, 1.6], [.74, .44, 2], [-.44, .3, 3.2], [.5, .3, 1.6], [.16, .05, 1.6], [-.1, .7, 2], [.5, .72, 2.4], [-.56, .74, 2.2]], '#eef2f4')}
${band(g, u, .5, .63, '#1d3158')}${ink2(g.lat(.5), .9, '#e9eef0')}${ink2(g.lat(.63), .9, '#e9eef0')}${vine(g, .565, .022, 6, '#e9eef0', ['#f1f3ee', '#dcc05a'], { s: .42, out: 1.9 })}
${ink2(g.lat(.86), 1, '#e9eef0')}
${star(st[0], st[1], 7.5, '#f6f8f4', .7)}<g transform="translate(${n(e[0])},${n(e[1] + 2)}) scale(1.05)">${ship('#eef2f4', .8)}</g><path d="M${n(e[0] - 16)},${n(e[1] + 11)}q4,-2.500 8,0t8,0t8,0t8,0" fill="none" stroke="#aebbd6" stroke-width=".9"/>`,
      over: `${cap(c, '#bcc6ca', 9)}<path d="M${n(c[0])},${n(c[1] + 1)}V${n(c[1] - 5)}" fill="none" stroke-width="2.400"/><path d="M${n(c[0])},${n(c[1] + 1)}V${n(c[1] - 5)}" fill="none" stroke="#e9eef0" stroke-width="1.100"/>${star(c[0], c[1] - 6.5, 5, '#f6f8f4', .7)}`,
    }; } },
    // brand new: starlight. Silver-white, leaf-gold, the great star set with a white gem.
    superb: { cond: { taut: 1 }, art: (g, u) => {
      const c = g.pt(0, 0), e = g.pt(0, .29);
      let skirt = '';
      g.along(11, -.96, .96).forEach((k, i) => { const m = g.pt(k, .885); skirt += `<g transform="translate(${n(m[0])},${n(m[1] + 5.2)}) rotate(${n(180 - k * 16)}) scale(.62,.72)">${leaf(i % 2 ? '#f4f6f2' : '#dcc05a', 1.1)}</g>`; });
      const big = star(e[0], e[1], 14, '#e6c65e', .9, .5);
      return {
        base: '#eef0e8', lip: '#e6c65e', ring: '#f6e9b8',
        inside: `${panels(g, ['#f6f7f1', '#dde5e8'])}${seams(g, '#d2ad4a', .9)}
${ring(g, .115, 9, ['#dcc05a', '#f1e3a6'], 1, { rib: '#8a6a1c' })}
${band(g, u, .49, .62, '#2b4678')}${ink2(g.lat(.49), 1.4, '#e6c65e')}${ink2(g.lat(.62), 1.4, '#e6c65e')}
${stars(g, g.along(9, -.9, .9).map((k) => [k, .555, 3.4]), '#fbfcf8')}${g.along(8, -.82, .82).map((k) => { const p = g.pt(k, .555); return `<circle cx="${n(p[0])}" cy="${n(p[1])}" r=".9" fill="#e6c65e" stroke-width=".3"/>`; }).join('')}
${vine(g, .73, .02, 6, '#d2ad4a', ['#dcc05a', '#c9d2d6'], { s: .42, out: 1.9 })}${band(g, u, .84, .885, '#e6c65e')}
<circle cx="${n(e[0])}" cy="${n(e[1])}" r="17" fill="none" stroke="#d2ad4a" stroke-width=".8" stroke-dasharray=".1 2.600"/>${big}${star(e[0], e[1], 8, '#fbfcf8', .6, .5)}${gem(e[0], e[1], 2.6)}`,
        over: `${skirt}${cap(c, '#e6c65e', 10)}${star(c[0], c[1] - 3.5, 7, '#f1dc8a', .8, .5)}${gem(c[0], c[1] - 3.5, 1.9)}`,
        html: glow(e, 9, star(e[0], e[1], 8, '#ffffff', 0, .5)),
      };
    } },
    // unrated: the cloth as it came from the loom, the design only drawn on
    calibrating: { cond: { sag: .12 }, art: (g, u) => { const c = g.pt(0, 0), e = g.pt(0, .3); return {
      base: '#b7c3ca', lip: '#9aa6ad',
      inside: `${panels(g, ['#bfcad1', '#aebbc3'])}${seams(g, '')}
<g fill="none" stroke="#3d4a56" stroke-width="1.200" stroke-dasharray="3 2.200"><path d="${g.lat(.5)}${g.lat(.63)}"/>${star(e[0], e[1], 13, 'none', .9, .5)}<circle cx="${n(e[0])}" cy="${n(e[1])}" r="16.500"/></g>
${vine(g, .565, .022, 5, '#4d5a66', null, { dash: '2.6 2.2', w: .9 })}
<g opacity=".8">${ring(g, .12, 7, ['none'], .9, { rib: 'none' }).replace(/stroke-width="[\d.]+"/g, 'stroke-width=".9" stroke="#4d5a66" stroke-dasharray="2 1.8"')}</g>`,
      over: cap(c, '#9eabb3', 7),
    }; } },
    // a player kill: the war banner
    pvp: { cond: { taut: .3 }, art: (g, u) => {
      const c = g.pt(0, 0), e = g.pt(0, .5);
      const blade = (s, t) => { const p = g.pt(s, t); return `<path d="M${n(p[0] - s)},${n(p[1] + 3)}C${n(p[0] + 4 * s)},${n(p[1] + 2)} ${n(p[0] + 8 * s)},${n(p[1] - 3)} ${n(p[0] + 10 * s)},${n(p[1] - 9)}C${n(p[0] + 5 * s)},${n(p[1] - 7)} ${n(p[0] + s)},${n(p[1] - 5)} ${n(p[0] - s)},${n(p[1] - 3)}Z" fill="#d5dcde" stroke-width=".9"/>`; };
      const arrow = (rot) => `<g transform="rotate(${rot})"><path d="M0,-17V17" fill="none" stroke-width="2.600"/><path d="M0,-17V17" fill="none" stroke="#d9cdb0" stroke-width="1.200"/><path d="M0,-21L3,-14.500H-3Z" fill="#d5dcde" stroke-width=".7"/><path d="M0,10L3.200,13V19L0,16L-3.200,19V13Z" fill="#e9e4d6" stroke-width=".6"/></g>`;
      return {
        base: '#3b2029', lip: '#b3303a', ring: '#d5dcde',
        inside: `${panels(g, ['#43242e', '#2f1a22'])}${seams(g, '#b3303a', .8)}
${band(g, u, .4, .6, '#9a2630')}${ink2(g.lat(.4), 1.1, '#d5dcde')}${ink2(g.lat(.6), 1.1, '#d5dcde')}
${stars(g, [[-.8, .5, 2.6], [-.52, .5, 3.2], [.52, .5, 3.2], [.8, .5, 2.6]], '#e9d9c0')}
<g transform="translate(${n(e[0])},${n(e[1])})">${arrow(38)}${arrow(-38)}${star(0, 0, 10.5, '#f1e3c0', .8, .62)}<circle r="2.200" fill="#9a2630" stroke-width=".6"/></g>
${ink2(g.lat(.86), 1, '#b3303a')}${ring(g, .2, 7, ['#5a2a36'], .9, { rib: '#b3303a', rot: 0 })}`,
        over: `${blade(-1, .42)}${blade(1, .42)}${blade(-1, .6)}${blade(1, .6)}${cap(c, '#6a3440', 8)}<path d="M${n(c[0] - 3)},${n(c[1] + 1)}C${n(c[0] - 3.5)},${n(c[1] - 5)} ${n(c[0] - 1)},${n(c[1] - 9)} ${n(c[0])},${n(c[1] - 11.5)}C${n(c[0] + 1)},${n(c[1] - 9)} ${n(c[0] + 3.5)},${n(c[1] - 5)} ${n(c[0] + 3)},${n(c[1] + 1)}Z" fill="#d5dcde" stroke-width=".9"/>`,
      };
    } },
    // a level gained: the sky at dawn, the swan-ship sailing up to its star
    levelup: { cond: { taut: .6 }, art: (g, u) => {
      const c = g.pt(0, 0), st = g.pt(.2, .2), sh = g.pt(-.16, .5);
      const flow = (k0, t0, k1, t1, bend) => { let d = ''; for (let i = 0; i <= 12; i++) { const f = i / 12; d += (i ? 'L' : 'M') + pp(g.pt(k0 + (k1 - k0) * f + bend * Math.sin(Math.PI * f), t0 + (t1 - t0) * f * f)); } return d; };
      return {
        base: `url(#elg${u})`, lip: '#f1dc8a', ring: '#f1dc8a',
        inside: `${panels(g, ['#ffffff', '#000000'], .06)}${seams(g, '#f6e9c8', .45)}
<path d="${flow(-.9, .86, .14, .26, -.1)}${flow(-.6, .9, .1, .3, .12)}${flow(-.2, .92, .2, .34, .3)}" fill="none" stroke="#fff3d0" stroke-width="1" opacity=".7"/>
${stars(g, [[-.5, .14, 2.4], [-.2, .08, 1.8], [.6, .1, 2], [-.72, .3, 2], [.7, .36, 2.4], [-.34, .26, 1.6], [.46, .46, 1.6]], '#f6f1e0')}
<g transform="translate(${n(sh[0])},${n(sh[1])}) rotate(-20) scale(1.25)">${ship('#f6f1e0', .7)}</g>
${star(st[0], st[1], 11, '#fff3d0', .8, .5)}${ink2(g.lat(.86), 1, '#f6e9c8')}`,
        over: `${cap(c, '#d9c078', 8)}${star(c[0], c[1] - 4, 5.5, '#f6e9b8', .7, .5)}`,
        html: glow(st, 12, star(st[0], st[1], 11, '#ffffff', 0, .5)),
      };
    } },
    // a death: let down and veiled, the leaves falling
    death: { cond: { sag: .62, lop: -.1 }, art: (g, u) => { const k0 = g.pt(.5, .5); return {
      base: '#56575f', lip: '#5e6068', ring: '#7c7d86',
      inside: `${panels(g, ['#5d5e67', '#4b4c54'])}${seams(g, '#9a9ba6', .4)}${creases(g, [[.42, .68, .98], [-.32, .7, .98], [-.72, .4, .7], [.7, .62, .9], [-.06, .76, .98]])}
${[[-.5, .24, 30], [-.1, .16, -50], [.36, .28, 110], [.62, .34, 60], [-.66, .38, 150], [.06, .34, 200], [-.3, .72, 100], [.3, .76, 20], [.66, .7, 160]].map(([k, t, r], i) => `<g transform="${g.place(k, t, .55)} rotate(${r})">${leaf(i % 3 ? '#b9b9c0' : '#9c9a94', 1)}</g>`).join('')}
<path d="${g.band(.44, .57)}" fill="#1b1a22" stroke="#000" stroke-width="1"/><path d="${g.lat(.475, -.95, .95)}${g.lat(.53, -.95, .95)}" fill="none" stroke="#6c6c7a" stroke-width=".7"/>
<g transform="translate(${n(k0[0])},${n(k0[1])})" stroke="#000"><path d="M-3,2C-9,14 -1,24 -7,40L3,35C4,24 1,13 4,3Z" fill="#211f29" stroke-width="1"/><path d="M2,2C7,13 3,22 10,34L15,27C11,18 12,10 9,3Z" fill="#17161d" stroke-width="1"/><path d="M-5,-3C-8,2 -4,6 0,5C5,6 8,1 5,-3C2,-6 -2,-6 -5,-3Z" fill="#26242e" stroke-width="1"/><path d="M-4,11q3,10 -1,22M6,10q0,8 4,16" fill="none" stroke="#6c6c7a" stroke-width=".7"/></g>`,
      over: '',
    }; } },
    // an achievement: the golden wood in flower, a wreath round a white star
    achievement: { cond: { taut: .8 }, art: (g, u) => { const c = g.pt(0, 0), e = g.pt(0, .29); return {
      base: '#d9ae3f', lip: '#3f7a4f', ring: '#f1f3ee',
      inside: `${panels(g, ['#e0b848', '#cfa238'])}${seams(g, '#fff3c4', .7)}
${ring(g, .115, 9, ['#3f7a4f', '#5c9462'], .95, { rib: '#dfeada' })}
${band(g, u, .51, .62, '#2f6442')}${ink2(g.lat(.51), 1, '#f1f3ee')}${ink2(g.lat(.62), 1, '#f1f3ee')}${vine(g, .565, .02, 6, '#f1f3ee', ['#f1f3ee', '#e6c65e'], { s: .4, out: 1.8 })}${band(g, u, .84, .885, '#2f6442')}
<g transform="translate(${n(e[0])},${n(e[1])})"><path d="M-4,15C-8,22 -5,28 -9,35L-3,32L-1,36C1,28 0,22 2,16ZM5,15C9,21 8,27 13,32L13,26L18,26C13,22 12,18 10,13Z" fill="#eef2f0" stroke-width=".8"/>
<circle r="11" fill="#f6e9b8" stroke-width=".8"/>${[...Array(12)].map((_, i) => `<g transform="rotate(${i * 30 + 15}) translate(0,-14.5) rotate(78) scale(.52)">${leaf(i % 2 ? '#3f7a4f' : '#5c9462', 1.2, '#dfeada')}</g>`).join('')}${star(0, 0, 9.5, '#fbfcf8', .7, .5)}${gem(0, 0, 1.8)}</g>`,
      over: `${cap(c, '#3f7a4f', 9)}${bud(c, '#f1f3ee', 9)}`,
    }; } },
  };

  // ---- the sign: a board of pale wood with rounded ends, an incised border with a leaf at each end, hung by two silver loops on grey cords ----
  const SW = 164, HX = 60;
  // [face, edge shade, incised line, accent]
  const WOOD = {
    calibrating: ['#d6d3c4', '#a9a696', '#7d7a6c', '#8a94a0'], meh: ['#d3cfbd', '#a6a290', '#7d7a6c', '#6f7b6c'],
    poor: ['#b3ac98', '#888270', '#6a6455', '#8a6a3c'], good: ['#e0dbc6', '#aeaa94', '#5c8a62', '#3f7a4f'],
    great: ['#e3e2d8', '#aeb1b0', '#5f76a6', '#2b4678'], superb: ['#f6f4e8', '#c9c4a8', '#c9a23a', '#d9b548'],
    pvp: ['#4a2630', '#2a141b', '#b3303a', '#d5dcde'], levelup: ['#ebe3da', '#b9aca6', '#9a7ab0', '#6b4a8a'],
    death: ['#4c4c56', '#2c2c34', '#7c7c8a', '#8a8a96'], achievement: ['#efe5bf', '#bfb184', '#5c8a62', '#3f7a4f'],
  };
  const board = ({ w, h, mood, u }) => {
    const [face, edge, line, acc] = WOOD[mood] || WOOD.meh, poor = mood === 'poor', rich = mood === 'superb', darkb = mood === 'pvp' || mood === 'death';
    const shape = (i) => `M11,${i}H${w - 11}Q${w - i},${i} ${w - i},${h / 2}Q${w - i},${h - i} ${w - 11},${h - i}H11Q${i},${h - i} ${i},${h / 2}Q${i},${i} 11,${i}Z`;
    const loop = (x) => `${ink2(`M${x - 3.2},3.500C${x - 4.2},-3.500 ${x + 4.2},-3.500 ${x + 3.2},3.500`, 1.2, '#dfe5e6')}<circle cx="${x - 3.2}" cy="3.600" r="1" fill="${SILVER}" stroke-width=".4"/><circle cx="${x + 3.2}" cy="3.600" r="1" fill="${SILVER}" stroke-width=".4"/>`;
    const end = (x, rot) => rich ? `${star(x, h / 2, 4.6, '#e6c65e', .6, .5)}${gem(x, h / 2, 1.3)}` : `<g transform="translate(${x},${h / 2}) rotate(${rot}) scale(.5)">${leaf(acc, 1.2, darkb ? '#2a141b' : '#f3f1e6')}</g>`;
    return `<g filter="url(#elfb${u})" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round"><path d="${shape(.7)}" fill="${face}" stroke-width="1.3"/>
<path d="M11,.7Q.7,.7 .7,${h / 2}Q.7,${h - .7} 11,${h - .7}H${w * .5}L${w * .5 - 6},${h - 5}H12Q6,${h - 6} 6,${h / 2}Q6,6 11,5Z" fill="${edge}" stroke="none" opacity=".55"/><path d="M11,.7Q.7,.7 .7,${h / 2}Q.7,${h - .7} 11,${h - .7}L12,${h - 4}Q4.500,${h - 5} 4.500,${h / 2}Q4.500,5 11,4Z" fill="${HP(u)}" stroke="none"/>
<path d="M14,2.600H${w - 14}" fill="none" stroke="#fff" stroke-width="1" opacity="${darkb ? .18 : .6}"/>
<path d="M22,${n(h * .3)}C${w * .3},${n(h * .22)} ${w * .55},${n(h * .36)} ${w - 24},${n(h * .26)}M18,${n(h * .7)}C${w * .35},${n(h * .78)} ${w * .6},${n(h * .64)} ${w - 20},${n(h * .74)}M${w * .3},${n(h * .5)}C${w * .45},${n(h * .46)} ${w * .6},${n(h * .54)} ${w * .76},${n(h * .5)}" fill="none" stroke="${edge}" stroke-width=".7" opacity=".4"/>
<path d="${shape(4.2)}" fill="none" stroke="${line}" stroke-width="${rich ? 1.2 : .9}" opacity=".85"/>
${poor ? `<g stroke="none" fill="#6f7a5a"><ellipse cx="${w * .12}" cy="${h * .84}" rx="13" ry="5" opacity=".4"/><ellipse cx="${w * .9}" cy="${h * .2}" rx="10" ry="6" opacity=".35"/><ellipse cx="${w * .68}" cy="${h * .92}" rx="8" ry="3.500" opacity=".35"/></g><path d="M${w - 30},1L${w - 36},9L${w - 33},15L${w - 37},22" fill="none" stroke-width=".8"/><path d="M${w * .36},${h - 1}l3,-6l-2,-4" fill="none" stroke-width=".7"/>` : ''}
${rich ? `<path d="${shape(6.6)}" fill="none" stroke="#e6c65e" stroke-width=".6" opacity=".9"/>` : ''}${poor ? '' : end(8.5, -90)}${end(w - 8.5, 90)}${loop(w / 2 - HX)}${loop(w / 2 + HX)}</g>`;
  };
  // the rating as five leaves; a player kill is two crossed strokes
  const pips = (mood) => {
    let s = '';
    if (mood === 'pvp') s = '<path class="elf-red" d="M3,2L15,12M15,2L3,12"/>';
    else for (let i = 0; i < 5; i++) s += `<path class="${i < (RANK[mood] || 0) ? 'elf-on' : 'elf-of'}" transform="translate(${5.5 + i * 11},7) rotate(24)" d="M0,-6C3.400,-3.300 3.600,1.600 0,6C-3.600,1.600 -3.400,-3.300 0,-6Z"/>`;
    return `<svg xmlns="${NS}" width="${mood === 'pvp' ? 18 : 55}" height="14" viewBox="0 0 ${mood === 'pvp' ? 18 : 55} 14">${s}</svg>`;
  };

  let reduced = false, paceOf = () => 1;

  // ---- the small life in her: blinks, glances, a brow; one quiet piece of business per mood ----
  const liven = (R) => {
    const q = R.q, qa = R.qa, ck = kit.clock(), later = ck.later, rnd = Math.random;
    const nod = q('.elf-nod'), look = q('.elf-look'), lids = qa('.elf-bl'), pgs = qa('.elf-pg'), brows = [q('.elf-bL'), q('.elf-bR')];
    const lamp = q('.elf-lampg'), lk = q('.elf-lk'), glass = q('.elf-glass'), cup = q('.elf-cup');
    let gaze = [0, 0], ga = [], la = null, hot = true;
    const bob = (el, to, ms, o = {}) => el && el.animate([{ transform: 'none' }, { transform: to, offset: o.at ?? .4 }, { transform: 'none' }], { duration: ms, easing: 'ease-in-out', composite: 'add', ...o });
    const closed = () => R.mood === 'death';
    const blink = () => {
      const slow = R.mood === 'meh' || R.mood === 'levelup' || R.mood === 'poor';
      const go = () => lids.forEach((l) => l.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(8px)', offset: .42 }, { transform: 'translateY(0)' }], { duration: slow ? 520 : 170, easing: 'ease-in-out' }));
      if (!closed()) { go(); if (!slow && rnd() < .2) later(go, 280); }
      later(blink, (slow ? 2800 : 2000) + rnd() * 3800);
    };
    const lookAt = (x, y, ms = 190) => {
      if (reduced) return;
      const from = gaze; gaze = [x, y];
      const old = ga, oldL = la;
      ga = pgs.map((p) => p.animate([{ transform: `translate(${from[0]}px,${from[1]}px)` }, { transform: `translate(${x}px,${y}px)` }], { duration: ms, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'forwards' }));
      la = look.animate([{ transform: `translate(${from[0] * .2}px,${from[1] * .2}px) rotate(${from[0] * .3}deg)` }, { transform: `translate(${x * .2}px,${y * .2}px) rotate(${x * .3}deg)` }], { duration: 620, delay: 60, easing: 'cubic-bezier(.3,.6,.3,1)', fill: 'both' });
      old.forEach((a) => a.cancel()); if (oldL) oldL.cancel();
    };
    const glance = () => {
      if (!closed() && R.root.classList.contains('rig-at') && !R.root.classList.contains('rig-off')) {
        const r = rnd(), p = PROP[R.mood] || [0, 0];
        if (r < .26) lookAt(rnd() * .8 - .4, 1.2);          // down at the sign
        else if (r < .52) lookAt(0, 0);                      // at you
        else if (r < .62) lookAt(rnd() * 1.2 - .6, -1.1);    // up at the lamp
        else if (r < .84) lookAt(p[0], p[1]);                // at what she holds
        else lookAt(rnd() < .5 ? -2.6 : 2.6, -.2);           // out over the land
      }
      later(glance, 1400 + rnd() * 2800);
    };
    const brow = () => {
      if (!closed()) { const i = rnd() < .5 ? 0 : 1; bob(brows[i], 'translateY(-1.3px)', 420); if (rnd() < .4) bob(brows[1 - i], 'translateY(-1px)', 420, { delay: 70 }); }
      later(brow, 3000 + rnd() * 4000);
    };
    if (!reduced) { lookAt(.2, -1, 1); later(blink, 600 + rnd() * 1800); later(glance, 900 + rnd() * 1200); later(brow, 1800 + rnd() * 2500); }
    // one small thing on arriving, by mood; nothing larger than a nod
    const biz = (mood) => {
      if (reduced) return;
      const d = 1 / paceOf(), T = (s) => ({ transform: s });
      const nd = (kf, ms, delay = 0, o = {}) => nod.animate(kf, { duration: ms * d, delay: delay * d, easing: 'ease-in-out', ...o });
      const lift = (el, px, ms, delay) => el && el.animate([T('none'), { ...T(`translateY(${-px}px)`), offset: .4 }, { ...T(`translateY(${-px * .8}px)`), offset: .7 }, T('none')], { duration: ms * d, delay: delay * d, easing: 'ease-in-out', composite: 'add' });
      if (mood === 'calibrating') { lookAt(-2.5, -.3, 320); nd([T('none'), { ...T('rotate(-1deg)'), offset: .3 }, { ...T('rotate(1deg)'), offset: .75 }, T('none')], 2400, 300); later(() => lookAt(2.5, -.2, 420), 1100 * d); later(() => lookAt(0, 0, 320), 2300 * d); }
      if (mood === 'poor') { lookAt(1.4, 1.1, 400); nd([T('none'), { ...T('translateY(-.8px)'), offset: .3 }, T('translateY(1.2px)')], 1500, 350, { fill: 'forwards' }); later(() => lookAt(0, 1.2, 500), 1800 * d); }
      if (mood === 'meh') { lookAt(-2.2, .2, 400); nd([T('none'), { ...T('rotate(-.8deg)'), offset: .5 }, T('rotate(-.4deg)')], 1500, 500, { fill: 'forwards' }); later(() => lookAt(0, 0, 400), 1900 * d); }
      if (mood === 'good') { lookAt(0, 0); nd([T('none'), { ...T('translateY(1.6px) rotate(.6deg)'), offset: .4 }, T('none')], 700, 450); later(() => lookAt(1.4, 1), 1300 * d); }
      if (mood === 'great') { lookAt(2, 1); nd([T('none'), { ...T('rotate(1deg)'), offset: .35 }, { ...T('rotate(-.6deg)'), offset: .7 }, T('none')], 2200, 300); later(() => lookAt(0, 0), 1500 * d); }
      if (mood === 'superb') { lookAt(1.4, .9); lift(glass, 2.5, 1400, 200); nd([T('none'), { ...T('translateY(-1.2px)'), offset: .4 }, T('none')], 1300, 200); later(() => lookAt(0, 0), 1500 * d); }
      if (mood === 'pvp') { lookAt(0, 0); nd([T('none'), { ...T('translateY(-1.2px)'), offset: .4 }, T('translateY(-.5px)')], 800, 250, { fill: 'forwards' }); }
      if (mood === 'levelup') { lookAt(0, 1, 300); nd([T('none'), T('translateY(.8px) rotate(-.8deg)')], 1300, 300, { fill: 'forwards' }); later(() => lookAt(0, 0, 400), 2000 * d); }
      if (mood === 'death') nd([T('none'), T('translateY(1px) rotate(-1deg)')], 1400, 500, { fill: 'forwards' });
      if (mood === 'achievement') { lookAt(0, 0); lift(cup, 2.5, 1300, 250); nd([T('none'), { ...T('translateY(-1px)'), offset: .4 }, T('none')], 1200, 250); }
    };
    const calm = () => nod.getAnimations().forEach((a) => a.cancel());
    return {
      arrive: biz,
      changed(mood) { calm(); biz(mood); },
      struck() { if (!closed()) lookAt(0, 1.2, 150); },
      leave() { if (!closed()) lookAt(.2, -1.1, 280); },
      // every frame: the lamp's light follows burn; her locks sway with the car
      frame(i) {
        const b = i.burn;
        lamp.style.opacity = (.2 + .8 * b).toFixed(2);
        lk.style.transform = `rotate(${(i.hang * .45).toFixed(2)}deg)`;
        // she looks up at the lamp when it roars
        if (b > .62 && !hot) { hot = true; if (!closed()) lookAt(.2, -1.1, 240); } else if (b < .35) hot = false;
      },
      stop: ck.stop,
    };
  };

  const grad = (id, stops, extra = 'x1="0" x2="1"') => `<linearGradient id="${id}" ${extra}>${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;

  Harness.register({
    id: 'elf',
    name: 'The Elf',
    blurb: 'An elf woman of the woodland realm, grave and fair, in a grey-green cloak clasped with a leaf. Her craft is light: fine cloth in slender gores, grey elven rope, a swan-prowed car of pale wood, and a silver lamp shaped like a flower under the mouth. The envelope says how good the kill was, from faded cloth torn and mended to silver-white starlight with leaves of gold; the news hangs below on a board of pale wood.',
    create(ctx) {
      reduced = ctx.reduced; paceOf = ctx.pace;
      return Rig.create(ctx, {
        id: 'elf', css: CSS,
        defs: (u) => `${soft('elff' + u, { freq: .032, scale: 2.3, grain: .5 })}${soft('elfb' + u, { blot: .7, bias: -.42, ga: .9, gb: -.48 })}${kit.hatch('elfp' + u, 38, 4.8, .55, .95)}${kit.hatch('elfq' + u, -52, 5.4, .45, .95)}
${grad('elfs' + u, [[0, '#cba88d'], [.5, '#ecd5ba'], [1, '#f7e9d4']])}${grad('elfh' + u, [[0, '#a68c54'], [.55, '#d8c48c'], [1, '#f0e3b6']])}
${grad('elfk' + u, [[0, '#4d5b52'], [.5, '#6f7f72'], [1, '#93a393']])}${grad('elfi' + u, [[0, '#7f8a90'], [.5, '#b9c3c8'], [1, '#eef2f2']])}
${grad('elfw' + u, [[0, '#9c9480'], [.55, '#cfc8b0'], [1, '#ece6d2']])}
${grad('elg' + u, [[0, '#262a66'], [.38, '#5b4486'], [.68, '#c97a84'], [1, '#f2c877']], `gradientUnits="userSpaceOnUse" x1="0" y1="10" x2="0" y2="${HG + 2}"`)}`,
        envelope: (mood) => ENV[mood] || ENV.calibrating,
        ropes: { kind: 'rope', dark: '#2e302b', light: '#cfd4c8', w: 1.3 },
        burner,
        basket,
        behind: (u) => `<div class="elf-lift"><div class="elf-br"><div class="elf-look"><div class="elf-nod">${figure(u)}${locks(u)}${tears()}${magic()}</div></div></div></div>${props(u)}`,
        front: (u) => hands(u),
        sign: { w: SW, hx: HX, bx: 40, by: BY + 1, k: 14, c: 1.9, cord: { kind: 'rope', dark: '#2e302b', light: '#d9dcd2', w: 1.1 }, board, pips },
        life: liven,
      });
    },
  });
})();
