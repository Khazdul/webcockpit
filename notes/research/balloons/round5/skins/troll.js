// Round 5: "The Troll", built on the shared rig (rig.js). A stone-troll of the
// hills, far too big for the crate he rides in: hunched, his shoulders bulging
// over the rim, his head sunk between them, well clear of the stolen cooking
// pot of coals that heats the bag above him.
//
// THE TROLLS' VOCABULARY (decided before drawing; rule 2 of the brief)
//   Materials  raw hides with the hair on, sewn with thick sinew in big crude
//              stitches; rope; bones, tusks, horns and skulls; rough logs;
//              plunder from travellers (a cooking pot, shields, a boot, a
//              cup, a crown). Nothing forged by the troll himself, no metal
//              ornament, no gold work.
//   Motifs     daubed with the fingers: stripes, zigzags, dots, handprints;
//              rows of hanging tusks; a horned skull; a plundered shield.
//   Colours    mangy grey-dun for the worthless; bare olive-grey hide; brown
//              fur with yellow ochre; black-brown pelt with white clay and red
//              ochre; a white winter pelt with blood red and soot black for
//              the best. Bone white everywhere.
//   "The best" means THE BIGGEST AND THE MOST TROPHIES: a fine thick pelt,
//              new and well cured, hung with a great horned skull, two rows
//              of tusks and plundered shields, daubed bold. Proud, but
//              troll-made.
//
// THE ENVELOPE LADDER (silhouette and colour both change)
//   poor    scraps of mangy hide barely holding: sagging, lopsided, dented,
//           grey-dun, bald spots, holes, odd patches (sackcloth, a bit of a
//           traveller's red cloak), a torn flap hanging off the side
//   meh     one plain scraped hide, olive-grey, a little slack, sinew seams,
//           one patch, a rope girdle; no ornament at all
//   good    sound and full: brown fur, a yellow ochre zigzag daubed round
//           it, a rope girdle, a knuckle-bone on top
//   great   a fine black-brown pelt, a white clay stripe and a red ochre
//           band with white dots, a row of tusks, a plundered shield, two
//           horns on top
//   superb  brand new: a white winter pelt, red handprints, a soot band
//           with a white zigzag, two rows of tusks, a great horned skull
//           between two plundered shields, a crest of tusks on top, a fringe
//           of tusks round the mouth
// THE SPECIALS (none can be taken for a rating step)
//   unrated      a raw pale hide not yet cured, scrape marks, charcoal
//                tallies and an empty charcoal ring where a trophy will hang
//   player kill  soot-black hide, a blood-red band of teeth, three skulls
//                of Men, a great red handprint, bones sticking out the sides
//   level up     woad blue, yellow ochre zigzags climbing, and the moon
//                (trolls are night folk) daubed and lit from within
//   death        ash-grey, half let down, a soot band with long finger
//                streaks dragged down from it; the fire burns cold blue
//   achievement  moss green with ochre dots and one great trophy: a
//                plundered gilt shield in a sun of tusks
//
// The basket is a crate of lashed logs, the burner a stolen three-legged
// cooking pot on its chains, the sign a dark hide laced into a frame of bones.
(() => {
  const { K, INK, kit } = Rig, { n, n2, S, SL, Z, G, ink2, NS, pp } = kit, HP = kit.P, HQ = kit.Q;
  const { W, CX, HG, FY, RY, BY } = K;
  const HY = 205;                                   // his eye line
  const BONE = '#e2dabd', BONE2 = '#c9bf9d', ROPE = '#b9a57a', DARK = '#1c140c';
  const RED = '#a23a26', OCHRE = '#d9a441', CLAY = '#ebe3ca', SOOT = '#1d1815';
  const rnd = (s) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

  // ---- moods: how the face, the head and the hands are held ----
  const DEF = { rise: 0, tilt: 0, hd: 0, hr: 0, bly: 0, blr: 0, bry: 0, brr: 0, lid: 1, low: 0, px: 0, py: 0, hl: 1, hrt: 1, club: 0, leg: 0, bone: 0, pick: 0, scr: 0, flex: 0, cup: 0, crown: 0, paint: 0 };
  const M = {
    calibrating: { bly: -2.6, blr: -8, bry: .6, brr: 2, lid: .5, px: .8, py: -1, hr: -3, scr: 1, hrt: 0 },
    poor: { rise: -3, hd: 3, hr: 2, bly: .4, bry: .4, blr: -12, brr: 12, lid: 1.9, py: .8, bone: 1, hrt: 0 },
    meh: { rise: -1, hr: -2, bly: 1.2, bry: 1.2, lid: 2.2, pick: 1, hrt: 0 },
    good: { bly: -.6, bry: -.6, lid: .7, low: .5, leg: 1, hrt: 0 },
    great: { rise: 1.5, bly: -1.6, bry: -1.6, blr: -3, brr: 3, lid: .4, low: .9, leg: 1, club: 1, hl: 0, hrt: 0 },
    superb: { rise: 3, bly: -2.8, bry: -3, blr: -6, brr: 6, lid: -.2, low: 1.1, leg: 1, club: 1, crown: 1, hl: 0, hrt: 0 },
    pvp: { rise: 1, hd: 1.5, bly: 1.8, bry: 1.8, blr: 13, brr: -13, lid: 1.7, low: 1.1, club: 1, paint: 1, hl: 0 },
    levelup: { rise: 4, hd: -1.5, hr: -2, bly: -1.6, bry: -1.6, lid: 1.1, low: .9, flex: 1, hrt: 0 },
    death: { rise: -3, hd: 4, hr: 3, bly: -1.2, bry: -1.2, blr: -15, brr: 15, lid: 2.3, py: 1 },
    achievement: { rise: 2, bly: -2, bry: -2, blr: -4, brr: 4, lid: .4, px: 1.3, py: -.3, cup: 1, hrt: 0 },
  };
  const MO = { calibrating: 'mum', poor: 'down', meh: 'flat', good: 'smile', great: 'grin', superb: 'grin', pvp: 'growl', levelup: 'grin', death: 'down', achievement: 'smile' };
  // where the thing he holds is, for his glances (px of pupil travel)
  const PROP = { calibrating: [.9, -1.1], poor: [1.5, .7], meh: [.8, 1], good: [1.6, .1], great: [1.6, .1], superb: [-1.6, -.5], pvp: [-1.6, -.5], levelup: [1.7, -.6], achievement: [1.6, -.5] };
  const RANK = { poor: 1, meh: 2, good: 3, great: 4, superb: 5 };
  const vars = (o) => Object.keys(o).filter((k) => k in DEF).map((k) => `--${k}:${o[k]}`).join(';');
  const show = (...names) => names.map((nm) => `.troll-${nm}{--x:var(--${nm})}`).join('');

  const CSS = `
.troll-v{${vars(DEF)};--coal:#e8862e}
${Object.keys(M).map((m) => `.troll-v[data-mood=${m}]{${vars(M[m])}}`).join('\n')}
.troll-v[data-mood=death]{--rig-f1:#4f8fd0;--rig-f2:#cfe6ff;--rig-gl:120,170,255;--coal:#6f9ccb}
.troll-v[data-mood=poor]{--rig-f1:#d5732a;--coal:#b0602c}
.troll-v[data-mood=poor] .rig-envb{animation:troll-heave 3.4s ease-in-out infinite alternate}
.troll-coal{fill:var(--coal)}
.troll-coalg{width:38px;height:16px;margin:-8px 0 0 -19px;border-radius:50%;opacity:.3;will-change:opacity;background:radial-gradient(closest-side,rgba(var(--rig-gl),.85),rgba(var(--rig-gl),0))}
.troll-moong{opacity:.9;animation:troll-pu 1.8s ease-in-out infinite alternate;filter:drop-shadow(0 0 2.5px #ffd27a) drop-shadow(0 0 6px rgba(255,190,90,.65))}
.troll-lift,.troll-br,.troll-hd,.troll-look,.troll-nod{position:absolute;left:0;top:0;width:${W}px;height:0;transform-origin:${CX}px ${RY + 6}px}
.troll-lift{transform:translateY(calc(var(--rise)*-1px)) rotate(calc(var(--tilt)*1deg));transition:transform calc(.6s*var(--k)) cubic-bezier(.3,1.2,.5,1)}
.troll-br{animation:troll-br 4.9s ease-in-out infinite alternate}
.troll-hd{transform-origin:${CX}px ${HY + 30}px;transform:translateY(calc(var(--hd)*1px)) rotate(calc(var(--hr)*1deg));transition:transform calc(.6s*var(--k)) cubic-bezier(.3,1.2,.5,1)}
.troll-bL{transform:translateY(calc(var(--bly)*1px)) rotate(calc(var(--blr)*1deg))}
.troll-bR{transform:translateY(calc(var(--bry)*1px)) rotate(calc(var(--brr)*1deg))}
.troll-bL,.troll-bR,.troll-pm,.troll-lid,.troll-low{transition:transform calc(.45s*var(--k)) ease-out}
.troll-pm{transform:translate(calc(var(--px)*1px),calc(var(--py)*1px))}
.troll-lid{transform:translateY(calc(var(--lid)*1px));fill:#7f8370;stroke:${INK};stroke-width:.9}
.troll-low{transform:translateY(calc(var(--low)*-1px));fill:#8f927d;stroke:${INK};stroke-width:.7}
.troll-mo{opacity:0;transition:opacity calc(.25s*var(--k))}
${Object.keys(MO).map((m) => `.troll-v[data-mood=${m}] .troll-mo-${MO[m]}`).join(',')}{opacity:1}
.troll-v[data-mood=good] .troll-jaw{animation:troll-chew 1.15s ease-in-out infinite}
.troll-crown{opacity:var(--crown);transition:opacity calc(.3s*var(--k))}
.troll-paint{opacity:var(--paint);transition:opacity calc(.3s*var(--k))}
.troll-p{position:absolute;left:0;top:0;width:${W}px;height:0;opacity:var(--x);transform:translateY(calc((1 - var(--x))*26px));transition:transform calc(.5s*var(--k)) cubic-bezier(.3,1.2,.5,1),opacity calc(.14s*var(--k))}
${show('club', 'leg', 'bone', 'pick', 'scr', 'flex', 'cup')}
.troll-clw,.troll-legw,.troll-scw{will-change:transform}
.troll-v[data-mood=calibrating] .troll-scw{animation:troll-scr .62s ease-in-out infinite alternate}
.troll-v[data-mood=meh] .troll-pkw{animation:troll-pk 2.3s ease-in-out infinite}
.troll-pkw{transform-origin:${CX + 30}px ${RY}px}
.troll-hL .troll-fg,.troll-hR .troll-fg{transition:transform calc(.2s*var(--k)) cubic-bezier(.3,1.5,.5,1),opacity calc(.08s*var(--k));transition-delay:calc(var(--i)*.04s*var(--k))}
.troll-hL .troll-fg{transform:translateY(calc((1 - var(--hl))*9px)) scaleY(calc(.1 + .9*var(--hl)));opacity:var(--hl)}
.troll-hR .troll-fg{transform:translateY(calc((1 - var(--hrt))*9px)) scaleY(calc(.1 + .9*var(--hrt)));opacity:var(--hrt)}
.troll-dg{will-change:transform}
.troll-tears{display:none}
.troll-v[data-mood=death] .troll-tears{display:block}
.troll-tear{position:absolute;width:5px;height:17px;overflow:hidden}
.troll-tear::before{content:"";position:absolute;left:1.9px;top:0;width:1.2px;height:14px;border-radius:1px;background:linear-gradient(rgba(196,216,230,.36),rgba(196,216,230,.05))}
.troll-tear i{position:absolute;left:1.1px;top:-3px;width:2.8px;height:3.8px;border-radius:50% 50% 50% 50%/62% 62% 38% 38%;background:radial-gradient(circle at 35% 35%,rgba(236,244,250,.9),rgba(172,200,222,.75) 55%,rgba(116,154,188,.7));box-shadow:0 0 0 .5px rgba(24,34,54,.3);transform:translateY(var(--r));opacity:.62;animation:troll-tear 5.8s cubic-bezier(.4,0,.7,.7) infinite;animation-delay:var(--dl)}
@keyframes troll-tear{0%{transform:translateY(0) scale(.5);opacity:0}12%{transform:translateY(1.5px) scale(1);opacity:.62}75%{opacity:.62}100%{transform:translateY(17px) scale(.9);opacity:0}}
@keyframes troll-heave{from{transform:scale(1,1) skewX(0)}to{transform:scale(1.02,.965) skewX(1.2deg)}}
@keyframes troll-br{from{transform:translateY(.6px) scale(1,.996)}to{transform:translateY(-.9px) scale(1.004,1.006)}}
@keyframes troll-pu{from{opacity:.6}to{opacity:1}}
@keyframes troll-chew{0%,100%{transform:none}35%{transform:translate(.5px,1.1px)}70%{transform:translate(-.4px,.3px)}}
@keyframes troll-scr{from{transform:rotate(-1.6deg)}to{transform:rotate(2.2deg)}}
@keyframes troll-pk{0%,55%,100%{transform:none}65%{transform:rotate(-1.6deg)}75%{transform:rotate(.8deg)}85%{transform:rotate(-1.2deg)}}
.troll-sign{filter:drop-shadow(0 2px 2.5px rgba(0,0,0,.42));--tx:#ece5d2;--dim:#bdb49d;--fg:#f3ecd9;--on:${BONE};--off:rgba(233,223,196,.3);color:var(--tx)}
.troll-sign[data-mood=poor]{--tx:#d6cdbb;--fg:#d6cdbb;--dim:#a9a08c}
.troll-sign[data-mood=good]{--fg:#f3d48a}
.troll-sign[data-mood=great]{--fg:#ffe3a0}
.troll-sign[data-mood=superb]{--tx:#fbf1d8;--dim:#e2c9a4;--fg:#fff0bd}
.troll-sign[data-mood=pvp]{--tx:#f1ddd4;--fg:#ff9c7c}
.troll-sign[data-mood=levelup]{--fg:#ffe08a}
.troll-sign[data-mood=death]{--tx:#c9c5bb;--fg:#d6d2c8}
.troll-sign[data-mood=achievement]{--tx:#f2ecd0;--dim:#d6cfa6}
.troll-sign .rig-text{padding:8px 13px 8px}
.troll-sign .rig-title,.troll-sign .rig-fig{text-shadow:0 1px 0 rgba(0,0,0,.6)}
.troll-sign .rig-fig{color:var(--fg)}
.troll-sign[data-mood=superb] .rig-fig{font-weight:700}
.troll-sign .rig-unit,.troll-sign .rig-q,.troll-sign .rig-more{color:var(--dim)}
.troll-on{fill:var(--on);stroke:rgba(0,0,0,.65);stroke-width:.7}.troll-of{fill:none;stroke:var(--off);stroke-width:1}
.troll-red{fill:#e2553a;stroke:rgba(0,0,0,.6);stroke-width:.6}
.troll-sign[data-kind=levelup] .rig-text{padding:13px 10px}
.troll-sign[data-kind=levelup] .rig-fig{font:700 21px/1.1 Cinzel,Georgia,serif;letter-spacing:.04em}
.troll-sign[data-kind=death] .rig-text{padding:13px 10px}
.troll-sign[data-kind=death] .rig-fig{font:400 21px/1.15 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.17em;margin-right:-.17em;text-transform:lowercase;font-variant:small-caps}
.troll-sign[data-kind=achievement] .rig-title{font:italic 600 13.5px/1.1 "Cormorant Garamond",Georgia,serif}
`;

  // ---- small parts used all over: stone limbs, bones, tusks, skulls, plunder ----
  const ST = (u) => `url(#trs${u})`;
  const fore = (u, ex, ey, hx, hy, w0 = 15, w1 = 12) => {
    const dx = hx - ex, dy = hy - ey, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L, a = w0 / 2, b = w1 / 2;
    const at = (f, o) => `${n(ex + dx * f + nx * o)},${n(ey + dy * f + ny * o)}`;
    return `<path d="M${at(0, a)}L${at(1, b)}L${at(1, -b)}L${at(0, -a)}Z" fill="${ST(u)}" stroke-width="1.1"/><path d="M${at(0, -a)}L${at(1, -b)}L${at(1, -b * .25)}L${at(0, -a * .25)}Z" fill="${HP(u)}" stroke="none"/><path d="M${at(.3, a * .8)}L${at(.36, a * .1)}L${at(.46, a * .3)}M${at(.62, -b * .7)}L${at(.7, b * .2)}" fill="none" stroke-width=".6" opacity=".75"/>`;
  };
  const fist = (x, y, r = 7) => `<path d="M${n(x - r)},${n(y + r * .1)}C${n(x - r * 1.05)},${n(y - r)} ${n(x + r * 1.05)},${n(y - r)} ${n(x + r)},${n(y + r * .1)}C${n(x + r)},${n(y + r * .95)} ${n(x - r)},${n(y + r * .95)} ${n(x - r)},${n(y + r * .1)}Z" fill="#9b9e88" stroke-width="1.1"/><path d="M${n(x - r)},${n(y + r * .1)}C${n(x - r * 1.05)},${n(y - r)} ${n(x - r * .2)},${n(y - r * .8)} ${n(x - r * .3)},${n(y - r * .6)}C${n(x - r * .6)},${n(y)} ${n(x - r * .5)},${n(y + r * .6)} ${n(x - r * .2)},${n(y + r * .8)}C${n(x - r * .8)},${n(y + r * .7)} ${n(x - r)},${n(y + r * .5)} ${n(x - r)},${n(y + r * .1)}Z" fill="${DARK}" opacity=".26" stroke="none"/><path d="M${n(x - r * .45)},${n(y - r * .62)}v${n(r * .8)}M${n(x + r * .05)},${n(y - r * .7)}v${n(r * .85)}M${n(x + r * .52)},${n(y - r * .6)}v${n(r * .75)}" fill="none" stroke-width=".6"/>`;
  const bone = (x0, y0, x1, y1, w = 3.2, fill = BONE) => {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, k = w * .62;
    const knob = (x, y) => `<circle cx="${n(x - uy * k)}" cy="${n(y + ux * k)}" r="${n(w * .68)}" fill="${fill}" stroke-width=".8"/><circle cx="${n(x + uy * k)}" cy="${n(y - ux * k)}" r="${n(w * .68)}" fill="${fill}" stroke-width=".8"/>`;
    return `${knob(x0, y0)}${knob(x1, y1)}<path d="M${n(x0)},${n(y0)}L${n(x1)},${n(y1)}" fill="none" stroke-width="${n(w + 1.6)}" stroke-linecap="butt"/><path d="M${n(x0 - ux)},${n(y0 - uy)}L${n(x1 + ux)},${n(y1 + uy)}" fill="none" stroke="${fill}" stroke-width="${w}" stroke-linecap="butt"/>`;
  };
  const tusk = (L, fill = BONE, w = 2.3) => `<path d="M${-w},0Q0,-1.2 ${w},0Q${n(w * 1.1)},${n(L * .6)} ${n(-w * .3)},${L}Q${n(-w * .9)},${n(L * .5)} ${-w},0Z" fill="${fill}" stroke-width=".7"/>`;
  // a horned beast's skull, about 0,0 (27 px to each horn tip)
  const skull = () => `<path d="M-7,-9C-14,-9 -21,-13 -24,-22C-25,-25 -28,-24 -27,-21C-25,-10 -17,-3 -8,-3ZM7,-9C14,-9 21,-13 24,-22C25,-25 28,-24 27,-21C25,-10 17,-3 8,-3Z" fill="${BONE2}" stroke-width="1"/><path d="M-12,-8C-16,-10 -20,-14 -23,-19M12,-8C16,-10 20,-14 23,-19" fill="none" stroke-width=".5" opacity=".6"/>
<path d="M-9,-8C-9,-14 9,-14 9,-8C11,-4 9,1 6.5,3L4.5,12C3,15 -3,15 -4.5,12L-6.5,3C-9,1 -11,-4 -9,-8Z" fill="${BONE}" stroke-width="1.1"/><path d="M-9,-8C-9,-12 -5,-13 -3,-13C-6,-8 -6,2 -3.5,13C-4,13 -4.3,12.6 -4.5,12L-6.5,3C-9,1 -11,-4 -9,-8Z" fill="${DARK}" opacity=".2" stroke="none"/>
<ellipse cx="-4.6" cy="-3.4" rx="2.7" ry="3.2" fill="${SOOT}" stroke-width=".7"/><ellipse cx="4.6" cy="-3.4" rx="2.7" ry="3.2" fill="${SOOT}" stroke-width=".7"/><path d="M-1.5,6.5L0,3.5L1.5,6.5L0,10Z" fill="${SOOT}" stroke-width=".6"/><path d="M-3.4,12.6h6.8M-1.8,11v3M0,11.2v3.2M1.8,11v3M-2,-11.5l1,3l2,-2.5" fill="none" stroke-width=".6"/>`;
  // a Man's skull, small (about 0,0, 6 px across)
  const mskull = () => `<path d="M-5.5,-1C-6,-8.5 6,-8.5 5.5,-1C5.5,1.5 4,2.5 3.4,3.4L3,6.5H-3L-3.4,3.4C-4,2.5 -5.5,1.5 -5.500,-1Z" fill="${BONE}" stroke-width=".9"/><ellipse cx="-2.4" cy="-1.2" rx="1.6" ry="1.8" fill="${SOOT}" stroke="none"/><ellipse cx="2.4" cy="-1.2" rx="1.6" ry="1.8" fill="${SOOT}" stroke="none"/><path d="M0,1.5L-.9,3.4H.9ZM-1.6,4.6v1.9M0,4.6v1.9M1.6,4.6v1.9" fill="${SOOT}" stroke-width=".5"/>`;
  // a round shield taken from a traveller: two colours, an iron rim and boss, a cut across it
  const shield = (r, c1, c2, rim = '#7d858c') => `<circle r="${r}" fill="${c1}" stroke-width="1.1"/><path d="M0,${-r}A${r},${r} 0 0 1 ${r},0H0ZM0,${r}A${r},${r} 0 0 1 ${-r},0H0Z" fill="${c2}" stroke="none"/><path d="M0,${-r}V${r}M${-r},0H${r}" fill="none" stroke-width=".6" opacity=".7"/><circle r="${n(r - 1.2)}" fill="none" stroke="${rim}" stroke-width="1.6"/><circle r="${r}" fill="none" stroke-width="1"/><path d="M${n(-r * .8)},${n(-r * .3)}L${n(-r * .15)},${n(r * .55)}M${n(r * .35)},${n(-r * .7)}l${n(r * .2)},${n(r * .3)}" fill="none" stroke-width="1.1"/><circle r="${n(r * .24)}" fill="#4a4f55" stroke-width=".8"/><path d="M${n(-r * .1)},${n(-r * .12)}l${n(r * .1)},${n(-r * .04)}" fill="none" stroke="#c9d0d4" stroke-width=".8"/>`;
  // a hand dipped in paint and slapped on (about 0,0, 14 px tall)
  const hand = (col) => `<g stroke="${col}" fill="${col}" stroke-width="2.3" stroke-linecap="round"><ellipse cx="0" cy="2.5" rx="3.6" ry="4" stroke-width="1.4"/><path d="M-3.2,-.5L-4.8,-6M-1.1,-1.5L-1.5,-8M1.2,-1.5L1.700,-7.6M3.3,-.5L4.9,-5.6M-3.6,3L-7,.6"/></g>`;

  // ---- the troll: shoulders, hide and necklace (behind the head) ----
  const TORSO = 'M-50,254C-57,243 -63.500,228 -62.500,212C-61,198 -50,189.500 -37,189.500C-27,189.500 -21,193 -15,199L15,199C21,193 27,189.500 37,189.500C50,189.500 61,198 62.500,212C63.500,228 57,243 50,254Z';
  const body = (u) => {
    const r = rnd(31); let fur = '', fl = '';
    for (let i = 0; i < 34; i++) { const x = -60 + r() * 38, y = 193 + r() * 46; if (x < -62 + (y > 212 ? (y - 212) * .25 : (212 - y) * .5)) continue; (i % 3 ? (fur += `M${n(x)},${n(y)}l${n(-1.5 + r())},${n(3.5 + r() * 2)}`) : (fl += `M${n(x)},${n(y)}l${n(-1.2 + r())},${n(3 + r() * 2)}`)); }
    const tw = [[-15.5, 238.5, -14], [-8, 243, -7], [0, 244.6, 0], [8, 243, 7], [15.5, 238.5, 14]].map(([x, y, a], i) => `<g transform="translate(${x},${y}) rotate(${-a})">${tusk(i === 2 ? 8 : 6.5, BONE, 2)}</g>`).join('');
    return S('rig-rim', -84, 176, 168, 84, G(u, `
<path d="${TORSO}" fill="${ST(u)}" stroke-width="1.2"/>
<path d="M36,190.500C49,191 59,199 60.500,212C61,220 59.500,228 57,235" fill="none" stroke="#f1ecd4" stroke-width="1.2" opacity=".5"/>
<path d="M42,201l5,5l-2,5M52,216l-4,5l3,4M33,196l3,4M56,226l-4,3" fill="none" stroke-width=".6" opacity=".8"/><ellipse cx="45" cy="197" rx="5.500" ry="2.800" fill="#a8a45c" opacity=".5" stroke="none"/><path d="M43,196.500h1M46.500,197.500h1M49,222h1" fill="none" stroke="#e3dc9a" stroke-width="1"/>
<path d="M-63,213C-62,199 -51,189 -37,189C-27,189 -21,192.500 -14,199L-10,254L-50,254C-57,243 -64,228 -63,213Z" fill="#6b4a2f" stroke-width="1.1"/>
<path d="M-63,213C-62,199 -51,189 -37,189C-50,197 -54,214 -50,232L-46,254L-50,254C-57,243 -64,228 -63,213Z" fill="${DARK}" opacity=".3" stroke="none"/><path d="M-63,213C-62,199 -51,189 -40,189.500C-52,198 -57,214 -54,232L-52,250C-58,240 -64,227 -63,213Z" fill="${HP(u)}" stroke="none"/>
<path d="${fur}" fill="none" stroke-width=".65" opacity=".8"/><path d="${fl}" fill="none" stroke="#c9a877" stroke-width=".8" opacity=".85"/>
<path d="M-62,206l-4.500,2.500l3.500,2l-5,3.500l4.500,2l-4,4l4.500,1.500M-55,193.500l-3.500,-2l1,4M-45,189.500l-2,-3l-1,3.500" fill="#6b4a2f" stroke-width=".9"/>
${bone(-34, 191, -24, 197.5, 2.6)}<ellipse cx="-2" cy="${HY + 9}" rx="35.500" ry="32" fill="${DARK}" opacity=".3" stroke="none"/>
<path d="M-27,207C-21,236 -8,244 0,244C8,244 21,236 27,207" fill="none" stroke-width="2.800"/><path d="M-27,207C-21,236 -8,244 0,244C8,244 21,236 27,207" fill="none" stroke="${ROPE}" stroke-width="1.400" stroke-dasharray="2.6 1.2"/>${tw}`));
  };

  // ---- the head: a boulder with a brow ledge (the still, engraved part) ----
  const HDP = 'M-19,-27L-6,-29.5L8,-28.5L19,-25C25,-22 28,-16 28,-9L29,2C30,8 31.5,13 31.5,18C31.5,25 27,29 20,30L6,31.5L-8,31L-21,30C-28,29 -32,24 -31.5,18C-31.5,12 -30,8 -29,2L-28,-9C-28,-17 -25,-23 -19,-27Z';
  const head = (u) => S('rig-rim', -44, HY - 46, 88, 84, `<g transform="translate(0,${HY})">${G(u, `
<path d="M-27.500,-9C-33,-15 -39,-8 -37,0C-36,6 -31,8 -27,5Z" fill="#74785f" stroke-width="1.1"/><path d="M-32,-6C-35,-3 -34,2 -31,4" fill="none" stroke-width=".7"/>
<path d="M27.500,-9C33,-15 39,-8 37,0C36,6 31,8 27,5Z" fill="#aeb098" stroke-width="1.1"/><path d="M32,-6C35,-3 34,2 31,4" fill="none" stroke-width=".7"/>
<path d="${HDP}" fill="${ST(u)}" stroke-width="1.3"/>
<path d="M-19,-27C-25,-23 -28,-17 -28,-9L-29,2C-30,8 -31.500,12 -31.500,18C-32,24 -28,29 -21,30L-11,30.500C-20,19 -21,-10 -9,-29Z" fill="${DARK}" opacity=".22" stroke="none"/>
<path d="M-19,-27C-25,-23 -28,-17 -28,-9L-29,2C-30,8 -31.500,12 -31.500,18C-32,24 -28,29 -21,30L-18,30.200C-25,19 -26,-10 -15,-28Z" fill="${HP(u)}" stroke="none"/>
<path d="M-6,-29.500L8,-28.500L19,-25C22,-23.500 24,-21.500 25.500,-19L12,-19L0,-21.500Z" fill="#f4eed6" opacity=".2" stroke="none"/>
<path d="M-27.500,-8Q0,-3 27.500,-8L28.500,4Q0,8 -29,4Z" fill="${DARK}" opacity=".2" stroke="none"/><path d="M-27.500,-8Q0,-3 27.500,-8L28.500,3Q0,7 -29,3Z" fill="${HQ(u)}" stroke="none"/>
<ellipse cx="-12" cy="-.5" rx="7.800" ry="5.600" fill="#1e170f" opacity=".42" stroke="none"/><ellipse cx="12" cy="-.5" rx="7.800" ry="5.600" fill="#1e170f" opacity=".34" stroke="none"/>
<path d="M-31,20Q0,27 31.500,19C31.500,25 27,29 20,30L6,31.500L-8,31L-21,30C-28,29 -32,25 -31,20Z" fill="${DARK}" opacity=".16" stroke="none"/>
<path d="M-12,9C-17,11 -20,15 -21,20M12,9C17,11 20,15 21,20" fill="none" stroke-width=".8" opacity=".85"/>
<path d="M-11,-29l2,6l-2,4M13,-28l-2,5l3,4l-1,3M-29,8l5,2l2,5M29,11l-4,3l-1,4M-8,31l2,-3M21,22l-3,4M-23,-16l4,3M24,-14l-3,1.500l-.5,3M-26,19l3,-2" fill="none" stroke-width=".6" opacity=".75"/>
<path d="M20,-24.500C25,-21.500 27.500,-16 28,-9L29,2C29.800,7 30.800,11 31,15" fill="none" stroke="#f6f0d8" stroke-width="1.2" opacity=".55"/>
<ellipse cx="-21" cy="-17" rx="4.500" ry="2.600" fill="#b0a85c" opacity=".55" stroke="none"/><ellipse cx="23" cy="22" rx="4" ry="2.300" fill="#9aa05a" opacity=".5" stroke="none"/><ellipse cx="21" cy="-19" rx="2.600" ry="1.600" fill="#c29a50" opacity=".5" stroke="none"/>
<path d="M-22.500,-17.500h1M-20,-16.300h1M22,21.500h1M24.500,22.800h1" fill="none" stroke="#e3dc9a" stroke-width="1"/>
<path d="M-20,-26.500C-17,-32 -8,-33 -2,-29.500C-5,-26 -15,-24 -20,-26.500Z" fill="#5f7346" stroke-width=".9"/><path d="M-16,-28q2,-2.500 4.500,-1M-10,-29.500q2,-2 4.500,-.3" fill="none" stroke="#a9b77c" stroke-width=".8"/>
<path d="M5,-29C5,-33 7,-35 6,-38M9,-28.500C10,-32 12,-33 12.500,-36.500M13,-27.500C15,-30 17,-30.500 18.500,-33" fill="none" stroke-width=".8"/>
<g class="troll-paint"><path d="M-21,6C-20,10 -20.500,14 -19,18M-16.500,7C-16,11 -16.500,15 -15,19M-12,7.500C-11.500,11 -12,14 -11,17M12,7.500C11.500,11 12,14 11,17M16.500,7C16,11 16.500,15 15,19M21,6C20,10 20.500,14 19,18" fill="none" stroke="${RED}" stroke-width="2.600" opacity=".92"/><path d="M-24,-20Q0,-15 24,-20" fill="none" stroke="${RED}" stroke-width="3" opacity=".9"/></g>
<path d="M-3.500,-6C-4.500,0 -9,4 -9.500,9C-10,14 -5,17 -1,16C0,17 1,17 2,16C6,17 10.500,14 9.500,9C9,4 4.500,0 3.500,-6Z" fill="#a4a68f" stroke-width="1.2"/>
<path d="M-9.500,9C-13,9.500 -13,15 -8.500,15.500M9.500,9C13,9.500 13,15 8.500,15.500" fill="#93967e" stroke-width="1"/>
<path d="M-3.500,-6C-4.500,0 -9,4 -9.500,9C-10,14 -5,17 -2,16C-6,12 -5.500,5 -1,-2Z" fill="${HP(u)}" stroke="none"/>
<ellipse cx="3.500" cy="7" rx="2.600" ry="4" fill="#f3edd4" opacity=".42" stroke="none"/>
<path d="M-6.500,14.500q2.200,1.600 4.500,.2M6.500,14.500q-2.200,1.600 -4.500,.2" fill="none" stroke-width="1.1"/><circle cx="6.200" cy="2.500" r="1.100" fill="#8f917a" stroke-width=".5"/>
<g class="troll-crown" transform="translate(9,-30.500) rotate(11)"><path d="M-8.500,3L-9.500,-5.500L-5.500,-1.500L-2.800,-8L0,-2L2.800,-8L5.500,-1.500L9.500,-5.500L8.500,3Q0,5.500 -8.500,3Z" fill="#d9b24c" stroke-width="1"/><path d="M-8.300,.5Q0,3 8.300,.5" fill="none" stroke-width=".6"/><path d="M-6.500,-3L-4,.5" fill="none" stroke="#fff3c4" stroke-width=".9" opacity=".8"/><circle cx="0" cy="1.800" r="1.300" fill="#b3312a" stroke-width=".5"/><circle cx="-5" cy="1.200" r=".9" fill="#3d6fb5" stroke-width=".4"/><circle cx="5" cy="1.200" r=".9" fill="#3f9a72" stroke-width=".4"/></g>`)}</g>`);

  // ---- the living part of the face, in a layer of its own with no filter: eyes, lids, brows, mouth ----
  const ALM = 'M-4.8,0Q0,-4.4 4.8,0Q0,3.4 -4.8,0Z';
  const eye = (s, u) => `<g transform="translate(${12 * s},-.5)"><g clip-path="url(#trc${u})"><path d="${ALM}" fill="#d6cfae"/><path d="M-6,-5H6V-.9H-6Z" fill="#3d2c1b" opacity=".4"/>
<g class="troll-pm"><g class="troll-pg"><circle r="2.1" fill="#a06a1e"/><circle r="1.1" fill="#0c0705"/><circle cx="-.7" cy="-.8" r=".55" fill="#fff8e6"/></g></g>
<g class="troll-bl"><path class="troll-lid" d="M-7,-12H7V-3Q0,-2.1 -7,-3Z"/></g><path class="troll-low" d="M-7,10H7V2.700Q0,2.100 -7,2.700Z"/></g>
<path d="${ALM}" fill="none" stroke="${INK}" stroke-width=".8"/><path d="M-5.200,.2Q0,-4.800 5.200,.2" fill="none" stroke="${INK}" stroke-width="1.300" stroke-linecap="round"/>
<path d="M${-4 * s},4.200q${4.5 * s},2.200 ${9.5 * s},-.4M${-2 * s},6.200q${3 * s},1.400 ${6 * s},0" fill="none" stroke="${INK}" stroke-width=".55" stroke-linecap="round" opacity=".7"/></g>`;
  const BROW = (c) => `<path d="M-12.500,-.5L-10.500,-4.500L-3,-5.500L6,-5L12,-2.800L13,1.500L7,3.200L-2,3.800L-11.500,3.200Z" fill="${c}" stroke="${INK}" stroke-width="1.100" stroke-linejoin="round"/><path d="M-10,-3.500L-3,-4.500L6,-4L11.500,-2" fill="none" stroke="#eee8cd" stroke-width=".9" opacity=".55"/><path d="M-11.500,3.200L-2,3.800L7,3.200L13,1.500" fill="none" stroke="${INK}" stroke-width="1.700" stroke-linejoin="round"/><path d="M-1,-5.200l1,3.200l-1.500,2.400M7,-4.600l-.5,3M-7,-4.800l.5,2.400" fill="none" stroke="${INK}" stroke-width=".5" opacity=".8"/>`;
  const tooth = (x, y, w, h) => `<path d="M${x},${y}l.5,${-h}q${n(w / 2 - .5)},-1.3 ${w - 1},0l.5,${h}Z" fill="#ddd6b6" stroke-width=".8"/>`;
  const MOUTHS = {
    flat: `<path d="M-15,21.500Q-6,23 0,22.500Q7,22 15,21M-15,21.500l-1.500,-1.300M15,21l1.500,-1.300" fill="none" stroke-width="1.500"/>${tooth(-10.5, 22.8, 4.6, 4.2)}${tooth(6, 22.4, 4.4, 4)}<path d="M-8,26.500Q0,28 9,26.200" fill="none" stroke-width=".6" opacity=".6"/>`,
    smile: `<path d="M-17,18C-15,22 -7,24.500 0,24.500C7,24.500 15,22 17,17.500M-18.500,16q-1.600,1.800 0,3.600M18.500,15.500q1.600,1.800 0,3.600" fill="none" stroke-width="1.500"/>${tooth(-10.5, 24, 4.6, 4.2)}${tooth(6, 24, 4.4, 4)}<path d="M-6,27.500Q0,28.800 6,27.500" fill="none" stroke-width=".6" opacity=".6"/>`,
    down: `<path d="M-14,25.500C-10,21.500 -4,21 0,21.300C4,21 10,21.500 14,25.500" fill="none" stroke-width="1.500"/>${tooth(-9.5, 22.3, 4.2, 3.4)}${tooth(5.5, 22.1, 4, 3.2)}<path d="M-6,26.500Q0,28.500 6,26.500" fill="none" stroke-width="1"/>`,
    grin: `<path d="M-18,17Q0,21.500 18,17C17.500,24 11,28 0,28C-11,28 -17.500,24 -18,17Z" fill="#2e1712" stroke-width="1.300"/><path d="M-5,27.500C-2.500,24.500 4,24.500 6,27.500Z" fill="#8f4a3c" stroke="none"/>${tooth(-14.5, 25.2, 5, 4.2)}${tooth(-8, 27.3, 5.2, 5)}${tooth(3, 27.4, 5.2, 4.8)}${tooth(9.5, 25.6, 5, 4.2)}<path d="M-4,18.700l.4,3.400h4.600l.4,-3.600Z" fill="#ddd6b6" stroke-width=".8"/><path d="M-19.500,14.500q-1.600,1.800 0,3.600M19.500,14.500q1.600,1.800 0,3.600" fill="none" stroke-width="1.100"/>`,
    growl: `<path d="M-16,19.500Q0,16.500 16,19.500C15.500,25.500 9,27.800 0,27.800C-9,27.800 -15.500,25.500 -16,19.500Z" fill="#2e1712" stroke-width="1.300"/>${tooth(-13, 25.6, 4.8, 5)}${tooth(-6.5, 27.3, 5.2, 5.8)}${tooth(1.5, 27.3, 5.2, 5.8)}${tooth(8.2, 25.8, 4.8, 5)}<path d="M-9,18.300l.4,3.200h4l.4,-3.500ZM4.500,17.900l.4,3.500h4l.4,-3.200Z" fill="#ddd6b6" stroke-width=".8"/>`,
    mum: `<path d="M-14,22Q-8,23.500 -4,23M4,23Q8,23.300 14,21.500" fill="none" stroke-width="1.500"/><ellipse cx="0" cy="23" rx="4" ry="2.700" fill="#2e1712" stroke-width="1.100"/>${tooth(-10.5, 23, 4.6, 4)}${tooth(6, 22.8, 4.4, 3.800)}`,
  };
  const face = (u) => `<svg class="rig-s troll-face" xmlns="${NS}" style="left:${CX - 44}px;top:${HY - 46}px" width="88" height="84" viewBox="-44 ${HY - 46} 88 84"><defs><clipPath id="trc${u}"><path d="${ALM}"/></clipPath></defs><g transform="translate(0,${HY})">${eye(-1, u)}${eye(1, u)}
<g transform="translate(-12.5,-7.5)"><g class="troll-bL"><g transform="scale(-1,1)">${BROW('#767a65')}</g></g></g><g transform="translate(12.5,-7.5)"><g class="troll-bR">${BROW('#9a9d86')}</g></g>
<g class="troll-jaw" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">${Object.keys(MOUTHS).map((m) => `<g class="troll-mo troll-mo-${m}">${MOUTHS[m]}</g>`).join('')}</g></g></svg>`;
  // tears (death): two drops a cheek run slowly from the lid down beside the nose; they stay on his face
  const tears = () => `<div class="rig-a troll-tears">${[[-16.6, 2, '4deg', 0], [11.6, 2, '-4deg', -2.5]].map(([x, y, a, dl]) => `<div class="troll-tear" style="left:${CX + x}px;top:${HY + y}px;transform:rotate(${a})"><i style="--r:5px;--dl:${dl}s"></i><i style="--r:11.5px;--dl:${dl - 2.9}s"></i></div>`).join('')}</div>`;

  // ---- what he holds. Every arm is short: a forearm from behind the rim, or from the shoulder ----
  const PR = (cls, u, x, y, w, h, body) => `<div class="troll-p ${cls}">${S('rig-rim', x, y, w, h, G(u, body))}</div>`;
  // the club on his left shoulder (great, superb, player kill): a torn-up tree limb with the stubs still on
  const club = (u) => `<div class="troll-p troll-club"><div class="rig-z troll-clw" style="left:${CX - 41}px;top:${RY + 4}px">${SL('rig-rim', -44, -100, 64, 104, G(u, `<g transform="rotate(-19)">
<path d="M-2.800,0L-3.200,-40C-4.500,-54 -9,-62 -9.500,-74C-10,-86 -5,-92.500 1,-92.500C7.500,-92.500 11,-85 10,-74C9,-62 5,-54 3.600,-40L2.800,0Z" fill="#6f4d2f" stroke-width="1.200"/>
<path d="M-2.800,0L-3.200,-40C-4.500,-54 -9,-62 -9.500,-74C-10,-86 -5,-92.500 -1,-92.500C-5,-84 -5,-66 -1,-52L-.5,0Z" fill="${DARK}" opacity=".3" stroke="none"/><path d="M-3.200,-40C-4.500,-54 -9,-62 -9.500,-74C-10,-86 -5,-92.500 -3,-92C-7,-84 -7,-66 -3,-52Z" fill="${HP(u)}" stroke="none"/>
<path d="M-9,-70l-6,-3l1.500,5ZM9.500,-80l6.500,-4l-2,6.500ZM-7.500,-58l-4.500,-1l2.500,3.500Z" fill="#8a6540" stroke-width=".9"/>
<path d="M1,-88C4,-80 3,-66 1,-50M5,-84C6.500,-76 5.500,-66 3.500,-58M-3,-78C-2,-70 -2,-62 -1,-54M0,-36V-6" fill="none" stroke-width=".55" opacity=".7"/><ellipse cx="3.500" cy="-72" rx="2.200" ry="3" fill="none" stroke-width=".7"/><path d="M6,-86C8,-82 8.500,-76 8,-70" fill="none" stroke="#c9a877" stroke-width="1" opacity=".7"/>
<path d="M-3.600,-44L3.900,-46M-3.800,-41L4,-43M-3.600,-38L3.800,-40" fill="none" stroke-width="2.600"/><path d="M-3.600,-44L3.900,-46M-3.800,-41L4,-43M-3.600,-38L3.800,-40" fill="none" stroke="${ROPE}" stroke-width="1.300"/></g>${fist(-5, -14.5, 7.5)}`))}</div></div>`;
  // a leg of mutton (good, great, superb), and what is left of one (poor)
  const leg = (u) => `<div class="troll-p troll-leg"><div class="rig-z troll-legw" style="left:${CX + 50}px;top:${RY + 6}px">${SL('rig-rim', -18, -66, 40, 70, G(u, `${fore(u, -1, 0, 0, -24, 15, 12.5)}<g transform="translate(0,-31) rotate(17)">${bone(0, 5, 0, 15, 3)}
<path d="M-3,-3C-8,-7 -10.500,-12 -9.500,-17q2.700,-.2 2.900,-2.900q2.900,.4 3.300,-2.700q2.500,.8 3.700,-1.700C6.500,-25 11,-18 10,-11C9.500,-7 6.500,-4.500 3,-3Z" fill="#8d4a30" stroke-width="1.100"/>
<path d="M-3,-3C-8,-7 -10.500,-12 -9.500,-17q2.700,-.2 2.900,-2.900C-6,-14 -5,-8 -1,-3Z" fill="${DARK}" opacity=".3" stroke="none"/><path d="M-9.500,-17q2.700,-.2 2.900,-2.900q2.900,.4 3.300,-2.700q2.500,.8 3.700,-1.700C-1,-21 -5,-17.500 -9.500,-17Z" fill="#d9b9a0" stroke-width=".7"/>
<path d="M5,-21C8,-17 8.500,-12 7,-8" fill="none" stroke="#e3a070" stroke-width="1.200" opacity=".7"/><path d="M1,-18l2,3M3.500,-12l1.500,3M-3,-11l2,2.500" fill="none" stroke-width=".55" opacity=".7"/></g>${fist(0, -30, 7.2)}`))}</div></div>`;
  const gnawed = (u) => PR('troll-bone', u, 34, RY - 44, 44, 52, `${fore(u, 49, RY + 6, 50, RY - 16, 15, 12.5)}<g transform="translate(50,${RY - 23}) rotate(66)">${bone(0, 9, 0, -19, 3)}<path d="M-1.500,-8l3,-1.500M-1.500,-3l3,-1" fill="none" stroke-width=".5" opacity=".7"/></g>${fist(50, RY - 22, 7.2)}`);
  // picking his teeth with a splinter of bone (meh)
  const pick = (u) => `<div class="troll-p troll-pick"><div class="rig-a troll-pkw">${S('rig-rim', 4, HY + 12, 56, RY - HY, G(u, `${fore(u, 46, RY + 6, 25, HY + 31, 15, 12.5)}${ink2(`M22,${HY + 27}L11.500,${HY + 21.5}`, 1.3, BONE)}${fist(23, HY + 28.5, 6.8)}`))}</div></div>`;
  // scratching his head (unrated): the arm rocks a little about the elbow
  const scratch = (u) => `<div class="troll-p troll-scr"><div class="rig-z troll-scw" style="left:${CX + 64}px;top:${HY + 20}px">${SL('rig-rim', -60, -64, 72, 72, G(u, `${fore(u, 0, 3, -40, -44, 16, 12.5)}<g transform="translate(-7,-8)">
<path d="M-43,-37C-47,-37.500 -48.500,-33 -45,-31.500L-40,-31ZM-44,-42C-48,-44 -51,-40 -48,-37.500L-42,-36.500ZM-40.500,-45.500C-43.500,-49 -48,-46.500 -46,-43L-40,-40Z" fill="#9b9e88" stroke-width="1"/>
<path d="M-42,-33C-45,-39 -41,-46 -35,-46C-29,-46 -26,-40 -28.500,-35C-31,-30 -39,-28.500 -42,-33Z" fill="#9b9e88" stroke-width="1.100"/><path d="M-42,-33C-45,-39 -41,-46 -37,-46C-40,-41 -40,-36 -37,-31C-39,-31 -41,-31.500 -42,-33Z" fill="${DARK}" opacity=".26" stroke="none"/><path d="M-37,-41l3,3M-33,-43l2,3.500" fill="none" stroke-width=".6"/></g>`))}</div></div>`;
  // the arm flexed (level up): held so from the start
  const flex = (u) => PR('troll-flex', u, 36, HY - 36, 60, 70, `
<path d="M43,${HY + 16}L43,${HY}C49,${HY - 11} 64,${HY - 11} 67.500,${HY + 1}L84,${HY + 9}C87,${HY + 18} 81,${HY + 25} 72,${HY + 23}Z" fill="${ST(u)}" stroke-width="1.200"/>
<path d="M43,${HY + 16}L72,${HY + 23}C78,${HY + 24} 83,${HY + 21} 84.500,${HY + 16}Q64,${HY + 17} 43,${HY + 9}Z" fill="${DARK}" opacity=".24" stroke="none"/><path d="M48,${HY - 4}C53,${HY - 9} 60,${HY - 9} 64,${HY - 3}" fill="none" stroke="#f6f0d8" stroke-width="1.200" opacity=".55"/><path d="M52,${HY + 3}l4,3l-1.500,4M61,${HY + 8}l3,2" fill="none" stroke-width=".6" opacity=".8"/>
${fore(u, 76, HY + 16, 75.5, HY - 15, 18.5, 13)}<path d="M67.800,${HY + 13}C70,${HY + 20} 80,${HY + 21} 84.300,${HY + 14}" fill="none" stroke-width=".8" opacity=".8"/>${fist(75.5, HY - 21, 8.2)}<path d="M67.500,${HY - 20}c-3,1 -3,5 .5,5.500" fill="#9b9e88" stroke-width="1"/>`);
  // a gold cup from somebody's baggage (achievement)
  const cup = (u) => PR('troll-cup', u, 34, HY - 12, 34, RY - HY + 20, `${fore(u, 49, RY + 6, 50, RY - 16, 15, 12.5)}
<path d="M48.300,${RY - 28}h3.400v6h-3.400Z" fill="#b08a34" stroke-width=".9"/><path d="M42,${RY - 43}H58C58,${RY - 34} 54.500,${RY - 28.5} 50,${RY - 28}C45.500,${RY - 28.5} 42,${RY - 34} 42,${RY - 43}Z" fill="#d9b24c" stroke-width="1.100"/>
<path d="M42,${RY - 43}H46C46,${RY - 35} 47.500,${RY - 30} 50,${RY - 28}C45.500,${RY - 28.5} 42,${RY - 34} 42,${RY - 43}Z" fill="${DARK}" opacity=".28" stroke="none"/><ellipse cx="50" cy="${RY - 43}" rx="8" ry="1.900" fill="#f0d98a" stroke-width=".9"/><path d="M54.500,${RY - 40}C55,${RY - 36} 54,${RY - 33} 52.500,${RY - 31}" fill="none" stroke="#fff6d0" stroke-width="1.100" opacity=".85"/><circle cx="49" cy="${RY - 36.5}" r="1.500" fill="#b3312a" stroke-width=".5"/>${fist(50, RY - 21, 7.2)}`);

  // his fingers over the rim, in front of the crate
  const finger = (x, i, len) => `<g transform="translate(${x},0)"><g class="troll-fg" style="--i:${i}"><path d="M-3.700,-2C-3.700,-7.500 3.700,-7.500 3.700,-2L3.500,${len - 3.5}C3.500,${len + 1} -3.500,${len + 1} -3.500,${len - 3.5}Z" fill="#9b9e88" stroke="${INK}" stroke-width="1.100"/><path d="M-3.700,-2C-3.700,-7.500 0,-7.500 -.6,-6C-1.800,-2 -1.800,${len - 4} -1.200,${len}C-3,${len} -3.500,${len - 1.5} -3.500,${len - 3.5}Z" fill="${DARK}" opacity=".28" stroke="none"/><path d="M-2.300,-1.500Q0,-.3 2.300,-1.500M-2,-3.800Q0,-2.900 2,-3.800" fill="none" stroke="${INK}" stroke-width=".6"/><path d="M-2.100,${len - 3.6}Q0,${len - 5.4} 2.100,${len - 3.600}L2.100,${len - 2.2}Q0,${len + .4} -2.100,${len - 2.2}Z" fill="#c4c2a8" stroke="${INK}" stroke-width=".5"/></g></g>`;
  const hands = (u) => {
    const h = (cls, x) => `<g transform="translate(${x},${RY - 1.5})"><g class="${cls}">${finger(-11.7, 0, 8.5)}${finger(-3.9, 1, 10)}${finger(3.9, 2, 9.6)}${finger(11.7, 3, 8)}</g></g>`;
    return S('rig-rim', -60, RY - 12, 120, 26, `<g filter="url(#rgf${u})">${h('troll-hL', -30)}${h('troll-hR', 30)}</g>`);
  };

  // ---- the cage: rough logs lashed to corner posts. It is deeper than it looks: the logs run on down to K.BD
  // behind the sign (no floor is drawn). A lower rail just above the sign carries the two rope loops for it. ----
  const basket = (u) => {
    const BD = K.BD;
    const log = (y, h, x0, x1, c) => `<path d="M${x0 + 3},${y}H${x1 - 3}Q${x1},${y} ${x1},${n(y + h / 2)}Q${x1},${y + h} ${x1 - 3},${y + h}H${x0 + 3}Q${x0},${y + h} ${x0},${n(y + h / 2)}Q${x0},${y} ${x0 + 3},${y}Z" fill="${c}" stroke-width="1"/><path d="M${x0 + 8},${n(y + h * .35)}h${n((x1 - x0) * .3)}M${n(x0 + (x1 - x0) * .5)},${n(y + h * .6)}h${n((x1 - x0) * .32)}M${x0 + 14},${n(y + h * .72)}h12" fill="none" stroke-width=".5" opacity=".7"/><path d="M${x0 + 5},${n(y + 1.6)}H${x1 - 8}" fill="none" stroke="#d2b384" stroke-width=".8" opacity=".45"/><ellipse cx="${n(x1 - 2.4)}" cy="${n(y + h / 2)}" rx="2" ry="${n(h / 2 - 1.2)}" fill="#c4a678" stroke-width=".6"/>`;
    const rail = (y, c) => `<path d="M-53,${y - 3.8}H53Q57.500,${y - 3.8} 57.500,${y}Q57.500,${y + 3.7} 53,${y + 3.7}H-53Q-57.500,${y + 3.7} -57.500,${y}Q-57.500,${y - 3.8} -53,${y - 3.8}Z" fill="${c}" stroke-width="1.100"/><path d="M-52,${y - 1.9}H50" fill="none" stroke="#e3caa0" stroke-width=".9" opacity=".6"/><path d="M-30,${y + .7}h22M6,${y + 1.3}h26M-48,${y + 1.7}h10" fill="none" stroke-width=".5" opacity=".65"/><ellipse cx="54.500" cy="${y}" rx="2.200" ry="2.900" fill="#c4a678" stroke-width=".6"/><path d="M-57.500,${y}Q-57.500,${y - 3.8} -53,${y - 3.8}H-40V${y + 3.7}H-53Q-57.500,${y + 3.7} -57.500,${y}Z" fill="${HP(u)}" stroke="none"/>`;
    const post = (x) => `<path d="M${x - 3.2},${RY - 6}Q${x},${RY - 8} ${x + 3.2},${RY - 6}L${x + 3},${BD}H${x - 3}Z" fill="url(#trw${u})" stroke-width="1"/><path d="M${x - 1},${RY - 2}V${BD - 2}" fill="none" stroke-width=".5" opacity=".6"/>`;
    const lash = (x, y) => ink2(`M${x - 4.6},${y - 2.6}L${x + 4.6},${y + 2.6}M${x - 4.6},${y + 2.6}L${x + 4.6},${y - 2.600}M${x - 4.6},${y}H${x + 4.6}`, 1.3, ROPE);
    const EXT = [[-53, 55], [-55, 52], [-52, 54], [-54, 53], [-53, 55], [-55, 52], [-52, 54], [-54, 53], [-53, 54]], LH = (BD - RY - 3.5) / EXT.length;
    const logs = EXT.map(([a, b], i) => log(n(RY + 3.5 + i * LH), n(LH), a, b, i % 2 ? '#7a5a3a' : `url(#trw${u})`)).join('');
    const loop = (x) => `<path d="M${x - 3.2},${BY - 3.5}h6.400v8h-6.400Z" fill="${ROPE}" stroke="#17120e" stroke-width=".9"/><path d="M${x - 3.2},${BY - 1}l6.400,-1.500M${x - 3.2},${BY + 1.5}l6.400,-1.500M${x - 3.2},${BY + 4}l6.400,-1.500" fill="none" stroke="#17120e" stroke-width=".6"/>`;
    return S('rig-rim', -62, RY - 10, 124, BD - RY + 18, `${G(u, `
${logs}
<path d="M-55,${RY + 3.5}H-26L-27,${BD}H-55Z" fill="${HP(u)}" stroke="none"/><path d="M-55,${RY + 3.5}H-41L-42,${BD}H-55Z" fill="${HQ(u)}" stroke="none"/>
${post(-45)}${post(45)}
${rail(RY + .3, '#9a7a50')}${rail(BY - .3, '#8f7048')}
${lash(-45, RY + .3)}${lash(45, RY + .3)}${lash(-45, RY + 14.5)}${lash(45, RY + 14.5)}${lash(-45, BY - .3)}${lash(45, BY - .3)}${lash(-45, BY + 24)}${lash(45, BY + 24)}
<g transform="translate(17,${RY + 15}) rotate(-12)">${shield(9.5, '#7d3a2c', '#d9d0b4')}</g>`)}
${loop(-38)}${loop(38)}`);
  };
  // two things tied to the ends of the rim log, which swing: a sheep's skull, and a traveller's boot by its laces
  const danglers = (u) => Z('troll-dg troll-d1', -57, RY + 3, SL('rig-rim', -10, 0, 20, 30, G(u, `<path d="M0,0V11" fill="none" stroke-width="1.100"/><g transform="translate(0,15.500) scale(.86)"><path d="M-5,-5C-9,-5 -11,-1 -9.500,3C-8,1 -7,-1 -4.500,-1.500ZM5,-5C9,-5 11,-1 9.500,3C8,1 7,-1 4.500,-1.500Z" fill="${BONE2}" stroke-width=".8"/><path d="M-5.500,-4C-5.500,-8 5.500,-8 5.500,-4C6,0 4,3 3,5L2.200,11C1.500,13 -1.500,13 -2.200,11L-3,5C-4,3 -6,0 -5.500,-4Z" fill="${BONE}" stroke-width=".9"/><ellipse cx="-2.800" cy="-1" rx="1.700" ry="2" fill="${SOOT}" stroke="none"/><ellipse cx="2.800" cy="-1" rx="1.700" ry="2" fill="${SOOT}" stroke="none"/><path d="M-.9,7.500L0,5.500L.9,7.500L0,9.500Z" fill="${SOOT}" stroke="none"/></g>`)))
    + Z('troll-dg troll-d2', 57, RY + 3, SL('rig-rim', -8, 0, 22, 30, G(u, `<path d="M-1,0L1,9M1,0L-1,9" fill="none" stroke-width=".9"/><path d="M-4,8.500H4L4.500,18C8,18.500 11,20 11.500,23V25.500H-4.500Z" fill="#6a4526" stroke-width="1"/><path d="M-4,8.500H-.5L-1,25.500H-4.500Z" fill="${DARK}" opacity=".3" stroke="none"/><path d="M-4.500,25.500H11.500V27.300H-4.500Z" fill="#2c2019" stroke-width=".7"/><path d="M-4,11.500H4.200M0,13.500l3,1M0,16l3,1" fill="none" stroke-width=".6"/><path d="M5,20.500l4,1.500" fill="none" stroke="#c9a877" stroke-width=".8" opacity=".7"/>`)));

  // ---- the burner: a stolen three-legged cooking pot of coals, hung by its ears on two chains ----
  const burner = (u) => S('rig-rim', -26, HG, 52, FY - HG + 20, G(u, `
${ink2(`M-19,${HG + 4}L-15.500,${FY + 1}M19,${HG + 4}L15.500,${FY + 1}`, 1.2, '#8d949b', 'stroke-dasharray="2.200 1.500"')}
<path d="M-9,${FY + 12}l-2.500,4M9,${FY + 12}l2.500,4M0,${FY + 13.5}v3" fill="none" stroke-width="3.200"/><path d="M-9,${FY + 12}l-2.200,3.500M9,${FY + 12}l2.200,3.500M0,${FY + 13.5}v2.500" fill="none" stroke="#3c3a37" stroke-width="1.600"/>
<path d="M-13,${FY}C-18.500,${FY + 3} -17.500,${FY + 11.5} -9,${FY + 14}H9C17.500,${FY + 11.5} 18.500,${FY + 3} 13,${FY}Z" fill="#34312e" stroke-width="1.100"/>
<path d="M-13,${FY}C-18.500,${FY + 3} -17.500,${FY + 11.5} -9,${FY + 14}H-2C-9,${FY + 10} -9,${FY + 4} -5,${FY}Z" fill="#000" opacity=".35" stroke="none"/><path d="M11.500,${FY + 3.5}C13.500,${FY + 6.5} 12.500,${FY + 10} 9,${FY + 12}" fill="none" stroke="#b9c0c5" stroke-width=".9" opacity=".6"/>
<path d="M-4,${FY + 7}l3,2.500l4,-1.500l2,2" fill="none" stroke-width=".6" opacity=".8"/><path d="M-12,${FY + 9}Q0,${FY + 12.5} 12,${FY + 9}" fill="none" stroke="#6a6f73" stroke-width=".8" opacity=".7"/>
<path class="troll-coal" d="M-11,${FY}q1.500,-3 4,-2.200q1.500,-2.300 4.500,-1.300q2.500,-1.800 5,-.2q3,-1 4.500,1.300q2.500,-.3 4,2.400Z" stroke-width=".8"/><path d="M-6,${FY - 1}l2,1M2,${FY - 2.2}l2,1.200M7,${FY - .8}l1.500,.6" fill="none" stroke="#3a1c10" stroke-width=".6" opacity=".7"/>
<path d="M-14.500,${FY - .4}Q0,${FY + 3.4} 14.500,${FY - .4}L14.500,${FY + 2}Q0,${FY + 5.8} -14.500,${FY + 2}Z" fill="#55524e" stroke-width=".9"/>
<g fill="none"><circle cx="-16" cy="${FY + 2.2}" r="2" stroke-width="2.200"/><circle cx="-16" cy="${FY + 2.2}" r="2" stroke="#8d949b" stroke-width=".9"/><circle cx="16" cy="${FY + 2.2}" r="2" stroke-width="2.200"/><circle cx="16" cy="${FY + 2.2}" r="2" stroke="#8d949b" stroke-width=".9"/></g>`))
    + Z('troll-coalg', 0, FY - 1);

  // ---- the envelope: hides in uneven panels, sewn with sinew; the helpers lay fur, daubs and trophies on the surface ----
  const KS = [-1, -.88, -.56, -.2, .24, .6, .9, 1];
  const panels = (g, cols) => KS.slice(0, -1).map((k, i) => `<path d="${g.gore(k, KS[i + 1])}" fill="${cols[i % cols.length]}" stroke="none"/>`).join('');
  // seams with big slanting sinew stitches
  const seams = (g, col, o = {}) => KS.slice(1, -1).map((k) => {
    const f = Math.max(.4, Math.sqrt(1 - k * k)); let d = '';
    for (let t = .09, i = 0; t < .97; t += o.step || .062, i++) { const p = g.pt(k, t), s = i % 2 ? 1.2 : -1.2; d += `M${n(p[0] - 2.5 * f)},${n(p[1] - s)}L${n(p[0] + 2.5 * f)},${n(p[1] + s)}`; }
    return `<path d="${g.seam(k)}" fill="none" stroke-width=".9"/>${col ? `<path d="${d}" fill="none" stroke="${col}" stroke-width="${o.w || 1.1}" opacity="${o.op || .85}"/>` : ''}`;
  }).join('');
  // hair on the hide: short strokes lying downward
  const fur = (g, seed, col, o = {}) => {
    const r = rnd(seed), rows = o.rows || 12; let d = '';
    for (let i = 0; i < rows; i++) {
      const t = .06 + .88 * (i + .5) / rows, cnt = Math.round((o.dens || 15) * (.45 + .55 * Math.sin(Math.PI * Math.min(1, t * 1.7 + .1))));
      for (let j = 0; j < cnt; j++) { const k = Math.sin(-1.45 + 2.9 * (j + r()) / cnt), p = g.pt(k, Math.min(.97, t + (r() - .5) * .06)), L = (o.len || 4) * (.7 + r() * .6); d += `M${n(p[0])},${n(p[1])}l${n(k * 1.8 + r() - .5)},${n(L)}`; }
    }
    return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${o.w || .7}" opacity="${o.op || .7}"/>`;
  };
  // paint laid on with the fingers: a band with dry edges, a zigzag, a row of dots
  const daub = (g, t0, t1, col) => `<path d="${g.band(t0, t1)}" fill="${col}" stroke="none"/><path d="${g.lat(t0 - .012, -.97, .97)}" fill="none" stroke="${col}" stroke-width="1.300" stroke-dasharray="9 4 3 5"/><path d="${g.lat(t1 + .012, -.97, .97)}" fill="none" stroke="${col}" stroke-width="1.300" stroke-dasharray="4 6 10 3"/>`;
  const zig = (g, t0, t1, num, col, w = 2.6) => { let d = ''; g.along(num * 2 + 1, -.985, .985).forEach((k, i) => { d += (i ? 'L' : 'M') + pp(g.pt(k, i % 2 ? t0 : t1)); }); return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}"/>`; };
  const dots = (g, t, num, col, r = 1.7) => g.along(num).map((k) => { const p = g.pt(k, t); return `<ellipse cx="${n(p[0])}" cy="${n(p[1])}" rx="${n(r * Math.max(.45, Math.sqrt(1 - k * k)))}" ry="${r}" fill="${col}" stroke="none"/>`; }).join('');
  const prints = (g, t, num, col, s = 1, k0 = -.82, k1 = .82) => g.along(num, k0, k1).map((k, i) => `<g transform="${g.place(k, t, s)} rotate(${(i % 2 ? 9 : -12) + k * 20})">${hand(col)}</g>`).join('');
  const tusks = (g, t, num, L, o = {}) => g.along(num, o.k0 ?? -.93, o.k1 ?? .93).map((k, i) => { const p = g.pt(k, t), f = Math.max(.45, Math.sqrt(1 - k * k)); return `<g transform="translate(${n(p[0])},${n(p[1])}) scale(${n2(f * (k < 0 ? -1 : 1))},1)">${tusk(L * (i % 2 ? .78 : 1), o.fill)}</g>`; }).join('');
  const girdle = (g, t, col = ROPE, w = 1.6) => ink2(g.lat(t), w, col, 'stroke-dasharray="3 1.200"');
  const creases = (g, list) => `<path d="${list.map(([k, a, b]) => g.seam(k, a, b)).join('')}" fill="none" stroke-width=".7" opacity=".55"/>`;
  // the gathered neck of the bag on top, tied off with rope
  const knot = (c, fill, w = 8) => `<path d="M${n(c[0] - w)},${n(c[1] + 4)}Q${n(c[0])},${n(c[1] - 4)} ${n(c[0] + w)},${n(c[1] + 4)}Q${n(c[0])},${n(c[1] + 7.5)} ${n(c[0] - w)},${n(c[1] + 4)}Z" fill="${fill}" stroke-width="1"/>${ink2(`M${n(c[0] - w + 1.5)},${n(c[1] + 3.6)}Q${n(c[0])},${n(c[1] + 6.4)} ${n(c[0] + w - 1.5)},${n(c[1] + 3.6)}`, 1.2, ROPE)}`;
  const hole = (g, k, t, s = 1, rot = 0) => `<g transform="${g.place(k, t, s)} rotate(${rot})"><path d="M-5,-1L-2,-4.500L2.500,-3L5.500,-.5L3,3.500L-1,4.500L-4,2.500Z" fill="#150e09" stroke-width=".9"/><path d="M-5,-1l-2.500,-1M5.500,-.5l2.500,.5M-1,4.500l-.5,2.500M-3.500,-1.500L2,2.500" fill="none" stroke-width=".6"/></g>`;

  const ENV = {
    // scraps of mangy hide barely holding together
    poor: { cond: { sag: 1, lop: .8, dents: [{ side: -1, t: .5, depth: 15, span: .13 }, { side: 1, t: .3, depth: 8, span: .1 }] }, art: (g, u) => { const c = g.pt(0, 0), f = g.pt(1, .6), f2 = g.pt(-1, .36); return {
      base: '#6d6a58', lip: '#7a6a4c', ring: '#8a7a5a',
      inside: `${panels(g, ['#7b7865', '#615e4d', '#8a846e', '#585445', '#757059', '#69664f', '#807a66'])}
<g stroke="none" fill="#a59b86" opacity=".75"><ellipse transform="${g.place(-.3, .22)}" rx="10" ry="6.500"/><ellipse transform="${g.place(.56, .5)}" rx="7" ry="9"/><ellipse transform="${g.place(-.66, .66)}" rx="6" ry="5"/></g>
${fur(g, 7, INK, { dens: 7, rows: 9, len: 3.4, op: .6 })}${seams(g, '#d8ccac', { w: 1.4, step: .085, op: .85 })}
${creases(g, [[.78, .34, .72], [.5, .42, .66], [-.42, .68, .98], [.32, .7, .98], [-.78, .58, .9], [.05, .74, .98], [-.3, .04, .2]])}
${g.patch(.4, .27, 21, 16, { fill: '#b3a67c', rot: 10, sw: 1.2, hatch: HQ(u), gap: 5.5 })}${g.patch(-.12, .6, 17, 20, { fill: '#6e3a30', rot: -7, stitch: '#d8ccac', sw: 1.2, gap: 5.5 })}${g.patch(-.52, .36, 16, 13, { fill: '#4a453b', rot: -14, stitch: '#d8ccac', sw: 1.1, gap: 5.5 })}${g.patch(.7, .72, 12, 11, { fill: '#8f8566', rot: 14, gap: 5 })}
${hole(g, .08, .24, 1.1, 20)}${hole(g, .36, .66, .8, -30)}${hole(g, -.34, .8, .7, 60)}
${girdle(g, .84, '#a89468')}`,
      over: `<path d="M${n(f[0] - 1)},${n(f[1] - 5)}l5,2.500l-1.500,8l4,5.500l-5,7l-3.500,-8l1.500,-6Z" fill="#69664f" stroke-width="1"/><path d="M${n(f[0] + 2)},${n(f[1] + 1)}l-.5,7l2,5" fill="none" stroke-width=".5" opacity=".7"/><path d="M${n(f2[0] + 1)},${n(f2[1] - 3)}l-5,3l2,5l-3,4l5,-1Z" fill="#585445" stroke-width=".9"/>
<path d="M${n(c[0] - 6)},${n(c[1] + 3)}Q${n(c[0])},${n(c[1] - 5)} ${n(c[0] + 6)},${n(c[1] + 3)}Q${n(c[0])},${n(c[1] + 6)} ${n(c[0] - 6)},${n(c[1] + 3)}Z" fill="#585445" stroke-width="1"/><path d="M${n(c[0] - 2)},${n(c[1] - 1)}l-4.500,-4M${n(c[0] + 1)},${n(c[1] - 1)}l3.500,-5M${n(c[0])},${n(c[1] - 1)}l-.5,-5" fill="none" stroke-width="1.100"/>`,
    }; } },
    // one plain scraped hide, nothing on it
    meh: { cond: { sag: .3, lop: -.12 }, art: (g, u) => { const c = g.pt(0, 0); return {
      base: '#948f73', lip: '#857c5c', ring: '#a89c78',
      inside: `${panels(g, ['#9b967a', '#8a856a'])}${fur(g, 11, INK, { dens: 5, rows: 8, len: 3, op: .4 })}${seams(g, '#e2d8b6', { step: .075 })}${creases(g, [[-.42, .74, .98], [.34, .76, .98], [.74, .5, .8]])}
${g.patch(-.4, .32, 15, 12, { fill: '#7f7a60', rot: -8, stitch: '#e2d8b6', sw: 1.1, gap: 5 })}${girdle(g, .84)}`,
      over: knot(c, '#7f7a60', 7),
    }; } },
    // sound and full: brown fur, an ochre zigzag
    good: { cond: {}, art: (g, u) => { const c = g.pt(0, 0); return {
      base: '#7a4f2c', lip: '#8f7447', ring: BONE2,
      inside: `${panels(g, ['#855832', '#6f4727'])}${fur(g, 3, '#2a180c', { dens: 17, len: 4.4, op: .75 })}${fur(g, 5, '#c99a62', { dens: 11, len: 3.6, op: .7, w: .8 })}${seams(g, '#ead9ae')}
${zig(g, .46, .58, 9, DARK, 4.2)}${zig(g, .46, .58, 9, OCHRE, 2.6)}${dots(g, .385, 13, OCHRE, 1.6)}${girdle(g, .84)}`,
      over: `${knot(c, '#6f4727', 8.5)}<g transform="translate(${n(c[0])},${n(c[1])})">${bone(0, 1.5, 0, -7.5, 2.6)}</g>`,
    }; } },
    // a fine dark pelt, stripes, tusks, a shield, two horns
    great: { cond: { taut: .5 }, art: (g, u) => { const c = g.pt(0, 0), e = g.pt(0, .2); return {
      base: '#3b281d', lip: BONE2, ring: BONE,
      inside: `${panels(g, ['#442e20', '#33221a'])}${fur(g, 13, '#0f0906', { dens: 16, len: 4.6, op: .8 })}${fur(g, 17, '#a8794c', { dens: 13, len: 3.8, op: .65, w: .8 })}${seams(g, '#d9c9a0', { op: .7 })}
${daub(g, .355, .4, CLAY)}${daub(g, .49, .6, RED)}${dots(g, .545, 15, CLAY, 2)}${girdle(g, .615)}${tusks(g, .62, 13, 9.5)}${daub(g, .845, .885, CLAY)}
<g transform="translate(${n(e[0])},${n(e[1])}) rotate(-8)">${shield(13.5, '#2f5a84', '#e6dcc0')}</g>`,
      over: `<path d="M${n(c[0] - 3)},${n(c[1] + 2)}C${n(c[0] - 10)},${n(c[1] + 2)} ${n(c[0] - 15)},${n(c[1] - 2)} ${n(c[0] - 16)},${n(c[1] - 9)}C${n(c[0] - 12)},${n(c[1] - 5)} ${n(c[0] - 7)},${n(c[1] - 4)} ${n(c[0] - 2)},${n(c[1] - 3)}ZM${n(c[0] + 3)},${n(c[1] + 2)}C${n(c[0] + 10)},${n(c[1] + 2)} ${n(c[0] + 15)},${n(c[1] - 2)} ${n(c[0] + 16)},${n(c[1] - 9)}C${n(c[0] + 12)},${n(c[1] - 5)} ${n(c[0] + 7)},${n(c[1] - 4)} ${n(c[0] + 2)},${n(c[1] - 3)}Z" fill="${BONE2}" stroke-width="1"/>${knot(c, '#33221a', 8)}`,
    }; } },
    // brand new and the most trophies: a white winter pelt, red hands, the horned skull, two shields, tusks everywhere
    superb: { cond: { taut: 1 }, art: (g, u) => {
      const c = g.pt(0, 0), e = g.pt(0, .25), s1 = g.pt(-.7, .26), s2 = g.pt(.7, .26);
      let crest = '';
      [-56, -28, 0, 28, 56].forEach((a, i) => { crest += `<g transform="translate(${n(c[0] + a * .09)},${n(c[1] + 3)}) rotate(${180 + a})">${tusk(i === 2 ? 13 : i % 2 ? 11.5 : 9.5, BONE, 2.5)}</g>`; });
      return {
        base: '#e6dfc8', lip: RED, ring: BONE,
        inside: `${panels(g, ['#efe9d6', '#ddd5bc'])}${fur(g, 19, '#6a5a44', { dens: 15, len: 4.4, op: .55 })}${fur(g, 23, '#fffdf2', { dens: 12, len: 3.8, op: .9, w: .9 })}${seams(g, '#8a7350', { op: .65 })}
${prints(g, .43, 8, RED, .82, -.9, .9)}${daub(g, .5, .6, SOOT)}${zig(g, .517, .583, 11, CLAY, 2)}${ink2(g.lat(.497), 1.3, RED)}${ink2(g.lat(.603), 1.3, RED)}${girdle(g, .615)}${tusks(g, .62, 15, 10.5)}
${daub(g, .78, .82, RED)}${dots(g, .8, 13, CLAY, 1.5)}${daub(g, .86, .9, RED)}
<g transform="translate(${n(s1[0])},${n(s1[1])}) scale(.72,1) rotate(-10)">${shield(11, '#2f5a84', '#e6dcc0')}</g><g transform="translate(${n(s2[0])},${n(s2[1])}) scale(.72,1) rotate(12)">${shield(11, '#3f6a3a', '#d9a441')}</g>`,
        over: `${tusks(g, .9, 11, 8.5, { k0: -.97, k1: .97 })}<g transform="translate(${n(e[0])},${n(e[1])}) scale(1.14)">${skull()}</g>${crest}${knot(c, RED, 8.5)}`,
      };
    } },
    // unrated: a raw hide not yet cured, marked up with charcoal, an empty ring where a trophy will hang
    calibrating: { cond: { sag: .12 }, art: (g, u) => { const c = g.pt(0, 0); const tl = (k, t) => { const p = g.pt(k, t); return `M${n(p[0] - 6)},${n(p[1] - 4)}v8.500M${n(p[0] - 3)},${n(p[1] - 4.5)}v9M${n(p[0])},${n(p[1] - 4)}v8.500M${n(p[0] + 3)},${n(p[1] - 4.5)}v9M${n(p[0] - 8)},${n(p[1] + 3)}L${n(p[0] + 5.5)},${n(p[1] - 3.500)}`; }; const tp = g.pt(.5, .56); return {
      base: '#cdbfa6', lip: '#9c8f72', ring: '#b3a888',
      inside: `${panels(g, ['#d4c6ad', '#c4b69c'])}<g stroke="none" fill="#c9a08a" opacity=".4"><ellipse transform="${g.place(-.5, .3)}" rx="13" ry="9"/><ellipse transform="${g.place(.5, .66)}" rx="10" ry="12"/><ellipse transform="${g.place(.1, .8)}" rx="12" ry="6"/></g>
${seams(g, '#7a6e58', { step: .08, op: .7 })}<path d="${[[-.7, .16, .34], [-.3, .5, .7], [.2, .58, .8], [.68, .2, .42], [-.05, .08, .2], [.45, .1, .22]].map(([k, a, b]) => g.seam(k, a, b)).join('')}" fill="none" stroke="#8a7c64" stroke-width=".6" stroke-dasharray="5 2 2 3" opacity=".8"/>
<g transform="${g.place(0, .29)}"><circle r="14.500" fill="none" stroke="#3a342c" stroke-width="2.400" stroke-dasharray="11 2 6 1.500 14 2.500" opacity=".85"/></g>
<path d="${tl(-.5, .56)}${tl(-.14, .6)}M${n(tp[0] - 4)},${n(tp[1] - 4)}v8.500M${n(tp[0] - 1)},${n(tp[1] - 4.5)}v9" fill="none" stroke="#3a342c" stroke-width="1.500" opacity=".85"/>${girdle(g, .84)}`,
      over: knot(c, '#b3a48a', 7),
    }; } },
    // a player kill: black, blood red, skulls of Men, bones sticking out
    pvp: { cond: { taut: .3 }, art: (g, u) => {
      const c = g.pt(0, 0), e = g.pt(0, .22);
      let fang = '';
      const ks = g.along(21, -.985, .985); for (let i = 0; i < ks.length - 1; i++) { const a = g.pt(ks[i], .46), b = g.pt(ks[i + 1], .46), m = g.pt((ks[i] + ks[i + 1]) / 2, .555); fang += `M${pp(a)}L${pp(m)}L${pp(b)}Z`; }
      const spike = (s, t, L) => { const p = g.pt(s, t); return `<g transform="translate(${n(p[0] - 2 * s)},${n(p[1])}) rotate(${-90 * s - 14 * s})">${tusk(L, BONE2, 3)}</g>`; };
      return {
        base: '#2b2623', lip: RED, ring: BONE2,
        inside: `${panels(g, ['#322c28', '#231f1d'])}${fur(g, 29, '#000', { dens: 14, len: 4.4, op: .7 })}${fur(g, 37, '#6a5c50', { dens: 8, len: 3.4, op: .6 })}${seams(g, '#b3412e', { op: .9 })}
${daub(g, .44, .6, '#8e2a1f')}<path d="${fang}" fill="${BONE}" stroke-width=".8"/>${ink2(g.lat(.44), 1, SOOT)}
<g transform="translate(${n(e[0])},${n(e[1])}) rotate(-6) scale(2.1)">${hand('#b53a26')}</g>
${girdle(g, .7, '#8a7a5a')}${[-.56, 0, .56].map((k) => { const p = g.pt(k, .7); return `<g transform="translate(${n(p[0])},${n(p[1] + 7.5)}) scale(${n2(Math.sqrt(1 - k * k) * 1.25)},1.25)">${mskull()}</g>`; }).join('')}${daub(g, .87, .9, '#8e2a1f')}`,
        over: `${spike(-1, .4, 13)}${spike(1, .4, 13)}${spike(-1, .58, 11)}${spike(1, .58, 11)}<g transform="translate(${n(c[0])},${n(c[1] + 2)}) rotate(180)">${tusk(11, BONE2, 2.8)}</g>${knot(c, '#231f1d', 8)}`,
      };
    } },
    // a level gained: woad blue, ochre zigzags climbing, the moon lit
    levelup: { cond: { taut: .6 }, art: (g, u) => {
      const c = g.pt(0, 0), e = g.pt(0, .23), MOON = 'M5,-13A13.500,13.500 0 1 0 5,13A10.500,10.500 0 1 1 5,-13Z';
      return {
        base: '#2f4f74', lip: OCHRE, ring: BONE,
        inside: `${panels(g, ['#34577e', '#2a476a'])}${fur(g, 41, '#0e1a2c', { dens: 13, len: 4, op: .6 })}${seams(g, '#d9c9a0', { op: .7 })}
${zig(g, .5, .57, 8, DARK, 3.8)}${zig(g, .5, .57, 8, OCHRE, 2.4)}${zig(g, .6, .67, 8, DARK, 3.8)}${zig(g, .6, .67, 8, OCHRE, 2.4)}${zig(g, .7, .77, 8, DARK, 3.8)}${zig(g, .7, .77, 8, OCHRE, 2.4)}${daub(g, .86, .895, OCHRE)}
<path transform="translate(${n(e[0] - 1)},${n(e[1])})" d="${MOON}" fill="#f0dc9a" stroke-width="1.200"/>${dots(g, .1, 5, CLAY, 1.3)}`,
        over: `${knot(c, OCHRE, 8)}<g transform="translate(${n(c[0])},${n(c[1])})">${bone(0, 1.5, 0, -7, 2.6)}</g>`,
        html: `<div class="rig-a troll-moong">${S('', -18, n(e[1]) - 16, 36, 32, `<path transform="translate(${n(e[0] - 1)},${n(e[1])})" d="${MOON}" fill="#fff0bd" opacity=".7"/>`)}</div>`,
      };
    } },
    // a death: ash-grey, let down, soot dragged down it with the fingers
    death: { cond: { sag: .62, lop: -.1 }, art: (g, u) => ({
      base: '#74746e', lip: '#4a4d50', ring: '#8a8a82',
      inside: `${panels(g, ['#7b7b75', '#696963'])}${fur(g, 43, '#2a2a28', { dens: 8, rows: 9, len: 3.4, op: .5 })}${seams(g, '#a9a79c', { op: .5, step: .08 })}${creases(g, [[-.42, .68, .98], [.32, .7, .98], [.72, .4, .7], [-.7, .62, .9], [.06, .76, .98]])}
${daub(g, .34, .42, SOOT)}${[[-.8, .3, 3], [-.62, .46, 3.6], [-.4, .24, 3], [-.22, .52, 4], [0, .36, 3.4], [.2, .5, 4], [.42, .28, 3.2], [.62, .44, 3.6], [.82, .22, 2.6]].map(([k, len, w]) => `<path d="${g.seam(k, .41, .41 + len)}" fill="none" stroke="${SOOT}" stroke-width="${w}" opacity=".9"/><path d="${g.seam(k + .03, .41, .41 + len * .7)}" fill="none" stroke="${SOOT}" stroke-width="${n(w * .5)}" opacity=".6"/>`).join('')}`,
      over: '',
    }) },
    // an achievement: moss green and one great trophy, a gilt shield in a sun of tusks
    achievement: { cond: { taut: .8 }, art: (g, u) => {
      const c = g.pt(0, 0), e = g.pt(0, .31);
      let sun = ''; for (let i = 0; i < 14; i++) sun += `<g transform="rotate(${i * 360 / 14}) translate(0,-15.500) rotate(180)">${tusk(i % 2 ? 9 : 11.5, BONE, 2.6)}</g>`;
      return {
        base: '#4e6a3a', lip: OCHRE, ring: BONE,
        inside: `${panels(g, ['#557340', '#465f33'])}${fur(g, 47, '#1c2a12', { dens: 14, len: 4, op: .6 })}${fur(g, 53, '#a9b77c', { dens: 8, len: 3.4, op: .5 })}${seams(g, '#e2d8a6', { op: .7 })}
${daub(g, .66, .7, OCHRE)}${dots(g, .745, 15, OCHRE, 1.8)}${daub(g, .86, .895, OCHRE)}${dots(g, .08, 5, OCHRE, 1.4)}
<g transform="translate(${n(e[0])},${n(e[1])})">${sun}<g transform="rotate(-10)">${shield(15, '#d9b24c', '#b53a26', '#f0d98a')}</g></g>`,
        over: `${knot(c, OCHRE, 8)}<g transform="translate(${n(c[0])},${n(c[1])})">${bone(0, 1.5, 0, -7, 2.6)}</g>`,
      };
    } },
  };

  // ---- the sign: a dark hide laced with sinew into a frame of two long bones and two sticks, on thick ropes ----
  const SW = 158, HX = 58;
  //            hide       its edge   daub (border paint, '' = none)
  const HIDE = {
    calibrating: ['#4f463c', '#7a6e5c', ''], poor: ['#48433a', '#6e6858', ''], meh: ['#3f382e', '#6e6450', ''],
    good: ['#3b2a1c', '#7a5a38', OCHRE], great: ['#2c1e16', '#6a4a30', CLAY], superb: ['#5e1d16', '#a8402a', CLAY],
    pvp: ['#191514', '#4a3a36', '#b53a26'], levelup: ['#22384f', '#4a6a8a', OCHRE], death: ['#2e2e2b', '#5a5a54', ''], achievement: ['#2f4424', '#5f7a44', OCHRE],
  };
  const board = ({ w, h, mood, u }) => {
    const [hide, edge, paint] = HIDE[mood] || HIDE.meh, poor = mood === 'poor', rich = mood === 'superb' || mood === 'great';
    const xs = Array.from({ length: 8 }, (_, i) => 13 + i * (w - 26) / 7), ys = [15, h / 2, h - 15];
    // the hide, pulled into points where it is laced
    let d = `M${n(xs[0])},6.2`, lace = '';
    for (let i = 1; i < xs.length; i++) d += `Q${n((xs[i - 1] + xs[i]) / 2)},9 ${n(xs[i])},6.2`;
    d += `Q${w - 9.6},9.6 ${w - 6.4},${n(ys[0])}`;
    for (let i = 1; i < ys.length; i++) d += `Q${w - 9},${n((ys[i - 1] + ys[i]) / 2)} ${w - 6.4},${n(ys[i])}`;
    d += `Q${w - 9.6},${h - 9.6} ${n(xs[7])},${h - 6.2}`;
    for (let i = 6; i >= 0; i--) d += `Q${n((xs[i + 1] + xs[i]) / 2)},${h - 9} ${n(xs[i])},${h - 6.2}`;
    d += `Q9.6,${h - 9.6} 6.4,${n(ys[2])}`;
    for (let i = 1; i >= 0; i--) d += `Q9,${n((ys[i + 1] + ys[i]) / 2)} 6.4,${n(ys[i])}`;
    d += `Q9.6,9.6 ${n(xs[0])},6.2Z`;
    xs.forEach((x, i) => { if (!(poor && i === 6)) lace += `M${n(x)},7.5L${n(x + 1)},1`; lace += `M${n(x)},${h - 7.5}L${n(x - 1)},${h - 1}`; });
    ys.forEach((y, i) => { lace += `M7.500,${n(y)}L1.500,${n(y + 1)}`; if (!(poor && i === 2)) lace += `M${w - 7.5},${n(y)}L${w - 1.5},${n(y - 1)}`; });
    const stick = (x) => `<path d="M${x - 1.7},1V${h - 1}H${x + 1.7}V1Z" fill="#6f5234" stroke-width=".9"/>`;
    const wrap = (x, y) => ink2(`M${x - 3.4},${y - 2.6}L${x + 3.4},${y + 2.600}M${x - 3.4},${y + 2.6}L${x + 3.4},${y - 2.600}`, 1.2, ROPE);
    const loop = (x) => `<path d="M${x - 3},-1.500h6v8h-6Z" fill="${ROPE}" stroke-width=".9"/><path d="M${x - 3},1l6,-1.500M${x - 3},3.500l6,-1.500M${x - 3},6l6,-1.500" fill="none" stroke-width=".6"/>`;
    return G(u, `${stick(2.6)}${stick(w - 2.6)}
<path d="${d}${poor ? `M${w - 24},${h - 15}l4,-2.500l4.500,1.500l1,4l-4,2.500l-4.500,-1Z` : ''}" fill="${hide}" fill-rule="evenodd" stroke-width="1.100"/>
<path d="${d}" fill="none" stroke="${edge}" stroke-width="2.200" opacity=".55" transform="translate(${w / 2},${h / 2}) scale(${n2(1 - 5 / w)},${n2(1 - 5 / h)}) translate(${-w / 2},${-h / 2})"/>
<path d="M9,10H22V${h - 10}H9Z" fill="${HP(u)}" stroke="none" opacity=".7"/><path d="M9,${h - 15}H${w * .5}V${h - 9}H9Z" fill="${HQ(u)}" stroke="none" opacity=".6"/>
<path d="M30,${h - 12}l8,-4M${w - 44},12.500l10,3M${w - 36},${h - 12}l7,-2M${w * .32},11.500l5,1.500" fill="none" stroke="${edge}" stroke-width=".6" opacity=".5"/>
${paint && mood !== 'superb' ? `<path d="M11.500,14V${h - 14}M${w - 11.5},14V${h - 14}" fill="none" stroke="${paint}" stroke-width="1.800" stroke-dasharray="${rich ? '1.800 3.200' : '7 3 3 4'}" opacity=".85"/>` : ''}
${mood === 'superb' ? `<g transform="translate(14,${h / 2}) scale(.6) rotate(-14)">${hand(CLAY)}</g><g transform="translate(${w - 14},${h / 2}) scale(.6) rotate(14)">${hand(CLAY)}</g><path d="M11,10V${h / 2 - 9}M11,${h / 2 + 9}V${h - 10}M${w - 11},10V${h / 2 - 9}M${w - 11},${h / 2 + 9}V${h - 10}" fill="none" stroke="${CLAY}" stroke-width="1.800" stroke-dasharray="1.800 3.200" opacity=".85"/>` : ''}
${poor ? `<path d="M${w - 9},${h - 16}l-4,3l1,5M17,9l4,5l-2,3" fill="none" stroke-width=".7"/>` : ''}
<path d="${lace}" fill="none" stroke-width="2"/><path d="${lace}" fill="none" stroke="#d8ccac" stroke-width=".9"/>
${bone(-3.5, 2.4, w + 3.5, 2.4, 3.6)}${bone(-3, h - 2.4, w + 3, h - 2.4, 3.4, BONE2)}
${wrap(2.6, 2.4)}${wrap(w - 2.6, 2.4)}${wrap(2.6, h - 2.4)}${wrap(w - 2.6, h - 2.4)}${loop(w / 2 - HX)}${loop(w / 2 + HX)}
${rich ? `<g transform="translate(9,1) rotate(160)">${tusk(7.5, BONE, 2)}</g><g transform="translate(${w - 9},1) rotate(200) scale(-1,1)">${tusk(7.5, BONE, 2)}</g>` : ''}`);
  };
  // the rating as five tusks; a player kill is a red hand
  const pips = (mood) => {
    let s = '';
    if (mood === 'pvp') s = `<g transform="translate(8,8.200) scale(.82)">${hand('#e2553a')}</g>`;
    else for (let i = 0; i < 5; i++) { const x = 5.5 + i * 11; s += `<path class="${i < (RANK[mood] || 0) ? 'troll-on' : 'troll-of'}" d="M${x - 3.2},2Q${x},.6 ${x + 3.2},2Q${x + 3.4},8.500 ${x - .6},13Q${x - 2.6},7.500 ${x - 3.2},2Z"/>`; }
    return `<svg xmlns="${NS}" width="${mood === 'pvp' ? 16 : 55}" height="14" viewBox="0 0 ${mood === 'pvp' ? 16 : 55} 14">${s}</svg>`;
  };

  let reduced = false, paceOf = () => 1;

  // ---- the small life in him: slow blinks, glances, a brow, a finger; one piece of business per mood ----
  const liven = (R) => {
    const q = R.q, qa = R.qa, ck = kit.clock(), later = ck.later, rnd = Math.random;
    const nod = q('.troll-nod'), look = q('.troll-look'), lids = qa('.troll-bl'), pgs = qa('.troll-pg'), brows = [q('.troll-bL'), q('.troll-bR')];
    const clw = q('.troll-clw'), legw = q('.troll-legw'), coal = q('.troll-coalg'), d1 = q('.troll-d1'), d2 = q('.troll-d2');
    let gaze = [0, 0], ga = [], la = null, hot = true;
    const bob = (el, to, ms, o = {}) => el && el.animate([{ transform: 'none' }, { transform: to, offset: o.at ?? .4 }, { transform: 'none' }], { duration: ms, easing: 'ease-in-out', composite: 'add', ...o });
    // a troll blinks slowly
    const blink = () => {
      const slow = R.mood === 'meh' || R.mood === 'death' || R.mood === 'poor';
      const go = () => lids.forEach((l) => l.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(5.6px)', offset: .42 }, { transform: 'translateY(0)' }], { duration: slow ? 760 : 240, easing: 'ease-in-out' }));
      go(); if (!slow && rnd() < .2) later(go, 380);
      later(blink, (slow ? 2800 : 2000) + rnd() * 3800);
    };
    const lookAt = (x, y, ms = 220) => {
      if (reduced) return;
      const from = gaze; gaze = [x, y];
      const old = ga, oldL = la;
      ga = pgs.map((p) => p.animate([{ transform: `translate(${from[0]}px,${from[1]}px)` }, { transform: `translate(${x}px,${y}px)` }], { duration: ms, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'forwards' }));
      la = look.animate([{ transform: `translate(${from[0] * .5}px,${from[1] * .4}px) rotate(${from[0] * .7}deg)` }, { transform: `translate(${x * .5}px,${y * .4}px) rotate(${x * .7}deg)` }], { duration: 700, delay: 80, easing: 'cubic-bezier(.3,.6,.3,1)', fill: 'both' });
      old.forEach((a) => a.cancel()); if (oldL) oldL.cancel();
    };
    const glance = () => {
      if (R.mood !== 'death' && R.root.classList.contains('rig-at') && !R.root.classList.contains('rig-off')) {
        const r = rnd(), p = PROP[R.mood] || [0, 0];
        if (r < .28) lookAt(rnd() * .6 - .3, 1.2);          // down at the sign
        else if (r < .52) lookAt(0, 0);                     // at you
        else if (r < .64) lookAt(rnd() - .5, -1.2);         // up at the bag
        else if (r < .86) lookAt(p[0], p[1]);               // at what he holds
        else lookAt(rnd() < .5 ? -1.8 : 1.8, -.1);          // out over the land
      }
      later(glance, 1400 + rnd() * 2800);
    };
    const brow = () => {
      const i = rnd() < .5 ? 0 : 1;
      bob(brows[i], 'translateY(-1.5px)', 460);
      if (rnd() < .3) bob(brows[1 - i], 'translateY(-1.2px)', 460, { delay: 90 });
      later(brow, 2600 + rnd() * 3800);
    };
    const tap = () => {
      const m = M[R.mood] || {}, sides = [m.hl === 0 ? null : '.troll-hL .troll-fg', m.hrt === 0 ? null : '.troll-hR .troll-fg'].filter(Boolean);
      if (sides.length && R.mood !== 'death') {
        const f = qa(sides[(rnd() * sides.length) | 0]);
        if (rnd() < .4) f.forEach((e, i) => bob(e, 'translateY(-2.4px)', 300, { delay: i * 90 }));
        else bob(f[(rnd() * f.length) | 0], 'translateY(-2.2px)', 320);
      }
      later(tap, 2200 + rnd() * 3400);
    };
    if (!reduced) { lookAt(.2, -1.2, 1); later(blink, 600 + rnd() * 1800); later(glance, 1000 + rnd() * 1200); later(brow, 1600 + rnd() * 2500); later(tap, 1400 + rnd() * 2500); }
    const once = (el, kf, o) => !reduced && el && el.animate(kf, o);
    // one small, slow piece of business on arriving, by mood
    const biz = (mood) => {
      if (reduced) return;
      const d = 1 / paceOf(), T = (s) => ({ transform: s });
      const nd = (kf, ms, delay = 0, o = {}) => nod.animate(kf, { duration: ms * d, delay: delay * d, easing: 'ease-in-out', ...o });
      const heft = (el, a, ms, delay) => once(el, [T('none'), { ...T(`translateY(-3px) rotate(${a}deg)`), offset: .4 }, { ...T('translateY(.8px)'), offset: .75 }, T('none')], { duration: ms * d, delay: delay * d, easing: 'ease-in-out' });
      if (mood === 'calibrating') { lookAt(.9, -1.1, 400); nd([T('none'), { ...T('rotate(-2deg) translateY(.5px)'), offset: .5 }, T('rotate(-1deg)')], 1400, 400, { fill: 'forwards' }); later(() => lookAt(0, 1.2, 400), 1800 * d); }
      if (mood === 'poor') { lookAt(1.5, .7, 500); nd([T('none'), { ...T('translateY(-1px)'), offset: .3 }, { ...T('translateY(2.4px)'), offset: .75 }, T('translateY(1.4px)')], 1600, 400, { fill: 'forwards' }); later(() => lookAt(0, 1.2, 600), 1900 * d); }
      if (mood === 'meh') { lookAt(-1.6, -.2, 500); nd([T('none'), { ...T('translateY(1.6px) rotate(.8deg)'), offset: .7 }, T('translateY(1px) rotate(.5deg)')], 1600, 500, { fill: 'forwards' }); }
      if (mood === 'good') { lookAt(1.6, .1, 300); heft(legw, -3, 800, 350); nd([T('none'), { ...T('translateY(2px) rotate(1deg)'), offset: .4 }, T('none')], 700, 600); later(() => lookAt(0, 0, 300), 1500 * d); }
      if (mood === 'great') { lookAt(0, 1.2, 300); later(() => lookAt(0, 0, 300), 800 * d); heft(clw, -2, 900, 300); nd([T('none'), { ...T('translateY(-1.6px) rotate(-1deg)'), offset: .4 }, T('none')], 1000, 300); }
      if (mood === 'superb') { lookAt(0, 0, 300); heft(clw, -2.5, 900, 250); heft(legw, 3, 900, 500); nd([T('none'), { ...T('translateY(-2.2px) rotate(-1.5deg)'), offset: .3 }, { ...T('translateY(-1.4px) rotate(1deg)'), offset: .65 }, T('none')], 1500, 200); }
      if (mood === 'pvp') { lookAt(0, 0, 200); heft(clw, -3, 800, 300); nd([T('none'), { ...T('translateY(-1.6px)'), offset: .3 }, { ...T('translateY(1.6px)'), offset: .65 }, T('translateY(1px)')], 900, 300, { fill: 'forwards' }); }
      if (mood === 'levelup') { lookAt(1.7, -.6, 400); nd([T('none'), { ...T('translateY(-1.5px) rotate(-1deg)'), offset: .5 }, T('translateY(-1px)')], 1300, 300, { fill: 'forwards' }); later(() => lookAt(0, 0, 400), 1900 * d); }
      if (mood === 'death') nd([T('none'), T('translateY(1.6px) rotate(1.5deg)')], 1300, 500, { fill: 'forwards' });
      if (mood === 'achievement') { lookAt(1.6, -.5, 300); nd([T('none'), { ...T('translateY(-1.8px) rotate(1deg)'), offset: .45 }, T('translateY(-.6px)')], 1100, 300, { fill: 'forwards' }); later(() => lookAt(0, 0, 300), 1700 * d); }
    };
    const calm = () => nod.getAnimations().forEach((a) => a.cancel());
    return {
      arrive: biz,
      changed(mood) { calm(); biz(mood); },
      struck() { lookAt(0, 1.2, 160); },
      leave() { if (R.mood !== 'death') lookAt(.2, -1.2, 300); },
      // every frame: the coals follow burn; what is tied to the crate dangles
      frame(i) {
        const b = i.burn;
        coal.style.opacity = (.2 + .8 * b).toFixed(2);
        d1.style.transform = `rotate(${(i.hang * 1.2 + Math.sin(i.now * .0019) * 1.6).toFixed(2)}deg)`;
        d2.style.transform = `rotate(${(i.hang + Math.sin(i.now * .0016 + 2) * 1.2).toFixed(2)}deg)`;
        // he looks up at his fire when it roars
        if (b > .62 && !hot) { hot = true; if (R.mood !== 'death') lookAt(.2, -1.2, 260); } else if (b < .35) hot = false;
      },
      stop: ck.stop,
    };
  };

  Harness.register({
    id: 'troll',
    name: 'The Troll',
    blurb: 'A stone-troll of the hills, far too big for his crate of lashed logs: hunched under a stolen cooking pot of coals, his shoulders over the rim. The bag is hide with the hair on, sewn with sinew, and it says how good the kill was: from mangy scraps full of holes to a white winter pelt hung with a horned skull, tusks and plundered shields. The news is daubed on a hide laced into a frame of bones.',
    create(ctx) {
      reduced = ctx.reduced; paceOf = ctx.pace;
      return Rig.create(ctx, {
        id: 'troll', css: CSS,
        defs: (u) => `<linearGradient id="trs${u}" x1="0" x2="1" y1="0" y2=".2"><stop offset="0" stop-color="#60665a"/><stop offset=".55" stop-color="#8f937e"/><stop offset="1" stop-color="#bdbda4"/></linearGradient><linearGradient id="trw${u}" x1="0" x2="1"><stop offset="0" stop-color="#4f3823"/><stop offset=".55" stop-color="#80603e"/><stop offset="1" stop-color="#a88558"/></linearGradient>`,
        envelope: (mood) => ENV[mood] || ENV.calibrating,
        ropes: { kind: 'rope', dark: '#17120e', light: ROPE, w: 2.3 },
        burner,
        basket,
        behind: (u) => `<div class="troll-lift"><div class="troll-br">${body(u)}${club(u)}${flex(u)}
<div class="troll-hd"><div class="troll-look"><div class="troll-nod">${head(u)}${face(u)}${tears()}</div></div></div>
${leg(u)}${gnawed(u)}${pick(u)}${scratch(u)}${cup(u)}</div></div>`,
        front: (u) => `${hands(u)}${danglers(u)}`,
        sign: { w: SW, hx: HX, bx: 38, by: BY + 2, k: 11, c: 1.7, cord: { kind: 'rope', dark: '#17120e', light: ROPE, w: 2.2 }, board, pips },
        life: liven,
      });
    },
  });
})();
