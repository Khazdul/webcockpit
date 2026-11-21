// Round 5: "The Orc", built on the shared rig (rig.js). For players of the
// Zaugurz: an orc soldier of the northern mountains, broad and sallow, in an
// iron cap and black scale, flying a hide bag under a cage of coals.
//
// THE ORCS' VOCABULARY (decided before drawing; rule 2 of the brief)
//   Materials  hides, raw or tarred black, laced with thongs and mended with
//              rusty staples; iron plates, bands, spikes, hooks and chains;
//              BONE where other peoples use gold: skulls, horns, teeth.
//   Motifs     jagged only: fangs painted in rows, spikes, claw strokes. The
//              clan mark is THE RAKE: three red claw strokes, daubed by hand.
//              Trophies of war: skulls, looted shields, a looted helm.
//   Colours    mud and rust for the worthless; raw brown hide; tar black with
//              rust; black with blood red and bone; red and black with much
//              bone for the best. No gold, no blue of their own.
//   "The best" means FEARSOME AND FRESH: a war-chief's bag, taut, newly
//              painted, crowned with spikes, a great horned skull on its brow.
//
// THE ENVELOPE LADDER (silhouette and colour both change)
//   poor    a sagging lopsided lump of mismatched scraps (mud grey, rust, dun,
//           sackcloth): staples, rag patches, a stuffed hole; nothing on it
//   meh     plain raw brown hide, a little slack, thong lacing, one bare iron
//           band; no paint, no trophies
//   good    sound and full: tarred brown-black, a rust band between iron
//           hoops, the rake chalked in bone white (no red yet), two short
//           spikes, an iron spike on top
//   great   black with a broad blood-red band of bone fangs, the rake fresh
//           and bright, six spikes that break the outline, a skull on top,
//           one war pennant
//   superb  the war-chief's: taut red and black gores, a black fanged band, a
//           great horned skull on the brow, a crown of spikes, eight side
//           spikes, two banner poles with skulls, a fringe of teeth and skulls
// THE SPECIALS (none can be taken for a rating step)
//   unrated      an untried bag of pale raw hide, laced, the rake only
//                sketched in charcoal inside an empty ring
//   player kill  the bag is a FACE: blood red, two slanting black eyes and a
//                wide black maw full of bone fangs, iron spikes for a mane
//   level up     rust-ochre hide with black mountain peaks round it (the
//                northern mountains) and the rake lit from within
//   death        ash grey, half let down, a black shroud over the crown with
//                hanging tails, the rake faded; the fire burns cold blue
//   achievement  a trophy bag: dark hide hung with a row of looted shields
//                under the rake, a captured blue pennant on a pole
//
// The face is a new drawing (not the dwarf's, not the round 4 orc's): no
// pointed ears (one notched lump with a ring, one torn), no tusks (a wide
// mouth of small uneven teeth), slanting ember eyes under an iron cap.
(() => {
  const { K, INK, kit } = Rig, { n, S, SL, Z, G, ink2, NS, pp } = kit, HP = kit.P, HQ = kit.Q;
  const { W, CX, HG, FY, RY, BY } = K;
  const HS = .5, HY = RY - 50;                       // the head's scale and eye line
  const SKIN = '#98805e', BONE = '#e4dabd', IRON = '#70777d', RED = '#b02a1c', TAR = '#2b2624';

  // ---- moods: how the face is held and what is in his hands ----
  const DEF = { rise: 0, tilt: 0, bly: 0, blr: 5, bry: 0, brr: -5, lid: 1.6, low: 0, px: 0, py: 0, teeth: 0, my: 1, hl: 1, hr: 1, tal: 0, rat: 0, bon: 0, mea: 0, hor: 0, whi: 0, hel: 0, sci: 0, ban: 0, war: 0 };
  const M = {
    calibrating: { bly: -4, blr: -8, bry: 1, lid: 2.2, tal: 1, hr: 0, px: 2.4 },
    poor: { rise: -3, tilt: 2, lid: 3.3, bly: 1.5, bry: 1.5, blr: 11, brr: -11, rat: 1, hr: 0 },
    meh: { rise: -1.5, tilt: -3, lid: 3.8, bly: 1, bry: 1, blr: 2, brr: -2, bon: 1, hr: 0 },
    good: { lid: 1.5, blr: 6, brr: -6, mea: 1, hr: 0, teeth: 1, my: -.7 },
    great: { rise: 2, lid: 1, bly: -1.5, bry: -1.5, blr: 4, brr: -4, hor: 1, hr: 0, teeth: 1, my: -1 },
    superb: { rise: 3, lid: .3, bly: -2.5, bry: -2.5, blr: 7, brr: -7, hor: 1, sci: 1, hl: 0, hr: 0, teeth: 1, my: -1.2 },
    pvp: { rise: 2, lid: 2.6, low: 1.6, bly: 2, bry: 2, blr: 16, brr: -16, teeth: 1, my: 1.15, war: 1, sci: 1, whi: 1, hl: 0, hr: 0 },
    levelup: { rise: 3, tilt: -1, lid: 1.8, bly: 0, bry: 0, blr: 9, brr: -9, py: -.6, ban: 1, hl: 0 },
    death: { rise: -5, tilt: -7, lid: 4.6, bly: -1.5, bry: -1.5, blr: -13, brr: 13, py: 2 },
    achievement: { rise: 2, lid: 1.4, blr: 5, brr: -5, hel: 1, hr: 0, teeth: 1, my: -1 },
  };
  // where the thing he holds is, for his glances (pupil units)
  const PROP = { calibrating: [2.6, .3], poor: [2.6, 1.2], meh: [1.6, 1.8], good: [2.6, .4], great: [2.6, .2], superb: [-2.6, -.6], pvp: [0, 0], levelup: [0, -.6], achievement: [2.6, -.3] };
  const RANK = { poor: 1, meh: 2, good: 3, great: 4, superb: 5 };
  const vars = (o) => Object.keys(o).filter((k) => k in DEF).map((k) => `--${k}:${o[k]}`).join(';');
  const show = (...names) => names.map((nm) => `.orc-${nm}{--x:var(--${nm})}`).join('');

  const CSS = `
.orc-v{${vars(DEF)};--coal:#e07a28}
${Object.keys(M).map((m) => `.orc-v[data-mood=${m}]{${vars(M[m])}}`).join('\n')}
.orc-v[data-mood=death]{--rig-f1:#4f8fd0;--rig-f2:#cfe6ff;--rig-gl:120,170,255;--coal:#6f9ccb}
.orc-v[data-mood=poor]{--rig-f1:#cf6a26;--coal:#a85a2a}
.orc-v[data-mood=pvp]{--rig-f1:#e2501c;--rig-gl:255,130,80}
.orc-v[data-mood=poor] .rig-envb{animation:orc-heave 3.3s ease-in-out infinite alternate}
.orc-coal{fill:var(--coal)}
.orc-coalg{width:36px;height:18px;margin:-6px 0 0 -18px;border-radius:50%;opacity:.3;will-change:opacity;background:radial-gradient(closest-side,rgba(var(--rig-gl),.8),rgba(var(--rig-gl),0))}
.orc-markg{opacity:.9;animation:orc-pu 1.7s ease-in-out infinite alternate;filter:drop-shadow(0 0 2.5px #ff9a3a) drop-shadow(0 0 6px rgba(255,130,40,.7))}
.orc-lift,.orc-br,.orc-look,.orc-nod{position:absolute;left:0;top:0;width:${W}px;height:0;transform-origin:${CX}px ${RY + 8}px}
.orc-lift{transform:translateY(calc(var(--rise)*-1px)) rotate(calc(var(--tilt)*1deg));transition:transform calc(.55s*var(--k)) cubic-bezier(.3,1.25,.5,1)}
.orc-br{animation:orc-br 3.9s ease-in-out infinite alternate}
.orc-head{left:${CX - 100 * HS}px;top:${HY - 70 * HS}px}
.orc-bL{transform:translateY(calc(var(--bly)*1px)) rotate(calc(var(--blr)*1deg))}
.orc-bR{transform:translateY(calc(var(--bry)*1px)) rotate(calc(var(--brr)*1deg))}
.orc-bL,.orc-bR,.orc-pm,.orc-lid,.orc-low,.orc-mo{transition:transform calc(.4s*var(--k)) ease-out,opacity calc(.3s*var(--k))}
.orc-pm{transform:translate(calc(var(--px)*1px),calc(var(--py)*1px))}
.orc-lid{transform:translateY(calc(var(--lid)*1px))}
.orc-low{transform:translateY(calc(var(--low)*-1px))}
.orc-mo{transform:scaleY(var(--my));opacity:var(--teeth)}
.orc-scowl{opacity:calc(1 - var(--teeth));transition:opacity calc(.3s*var(--k))}
.orc-war{opacity:var(--war);transition:opacity calc(.3s*var(--k))}
.orc-hL{opacity:var(--hl)}.orc-hR{opacity:var(--hr)}
.orc-hL,.orc-hR{transition:opacity calc(.15s*var(--k))}
.orc-p{position:absolute;left:0;top:0;width:${W}px;height:0;opacity:var(--x);transform:translateY(calc((1 - var(--x))*30px));transition:transform calc(.5s*var(--k)) cubic-bezier(.3,1.25,.5,1),opacity calc(.14s*var(--k))}
${show('tal', 'rat', 'bon', 'mea', 'hor', 'whi', 'hel', 'sci', 'ban')}
.orc-pw{position:absolute;left:0;top:0;width:${W}px;height:0;transform-origin:${CX + 40}px ${RY}px}
.orc-pwl{transform-origin:${CX - 40}px ${RY}px}
.orc-v[data-mood=meh].rig-at .orc-gnaw{animation:orc-gnaw 1.5s ease-in-out infinite}
.orc-ratd,.orc-dgl,.orc-dgr{will-change:transform}
.orc-tears{display:none}
.orc-v[data-mood=death] .orc-tears{display:block}
.orc-tear{position:absolute;width:5px;height:13px;overflow:hidden}
.orc-tear::before{content:"";position:absolute;left:1.9px;top:0;width:1.2px;height:11px;border-radius:1px;background:linear-gradient(rgba(196,214,226,.36),rgba(196,214,226,.05))}
.orc-tear i{position:absolute;left:1.1px;top:-3px;width:2.8px;height:3.8px;border-radius:50% 50% 50% 50%/62% 62% 38% 38%;background:radial-gradient(circle at 35% 35%,rgba(236,244,250,.9),rgba(170,198,218,.75) 55%,rgba(112,150,184,.7));box-shadow:0 0 0 .5px rgba(24,34,54,.3);transform:translateY(var(--r));opacity:.6;animation:orc-tear 5.8s cubic-bezier(.4,0,.7,.7) infinite;animation-delay:var(--dl)}
@keyframes orc-tear{0%{transform:translateY(0) scale(.5);opacity:0}12%{transform:translateY(1.5px) scale(1);opacity:.6}75%{opacity:.6}100%{transform:translateY(13px) scale(.9);opacity:0}}
@keyframes orc-heave{from{transform:scale(1,1) skewX(0)}to{transform:scale(1.02,.965) skewX(1.2deg)}}
@keyframes orc-br{from{transform:translateY(.5px) scale(1,.997)}to{transform:translateY(-.9px) scale(1,1.006)}}
@keyframes orc-pu{from{opacity:.55}to{opacity:1}}
@keyframes orc-gnaw{0%,100%{transform:none}30%{transform:translate(-.6px,1.2px) rotate(-2deg)}60%{transform:translate(.3px,-.4px) rotate(1deg)}}
.orc-sign{filter:drop-shadow(0 2px 2.5px rgba(0,0,0,.45));--tx:#e9dfc6;--dim:#b9ad92;--fg:#f1e7cc;--on:#e4dabd;--off:rgba(228,218,189,.22);color:var(--tx)}
.orc-sign[data-mood=poor]{--tx:#d6ccb8;--fg:#d6ccb8;--on:#c98a52}
.orc-sign[data-mood=great]{--fg:#ffd9b0;--on:#ff8a6a}
.orc-sign[data-mood=superb]{--tx:#f6e9cc;--fg:#ffe2b4;--on:#ff7a58}
.orc-sign[data-mood=pvp]{--tx:#f3ddd2;--fg:#ffa283;--on:#ff6a4c}
.orc-sign[data-mood=levelup]{--fg:#ffc98a}
.orc-sign[data-mood=death]{--tx:#c6c2b8;--fg:#d3cfc5;--dim:#9a968c}
.orc-sign[data-mood=achievement]{--tx:#1c1008;--fg:#1c1008;--dim:#4a2e1a;text-shadow:none}
.orc-sign .rig-text{padding:8px 12px 8px}
.orc-sign .rig-title,.orc-sign .rig-fig{text-shadow:0 1px 0 rgba(0,0,0,.65)}
.orc-sign[data-mood=achievement] .rig-title,.orc-sign[data-mood=achievement] .rig-tag{text-shadow:none}
.orc-sign .rig-fig{color:var(--fg)}
.orc-sign[data-mood=superb] .rig-fig{font-weight:700}
.orc-sign .rig-unit,.orc-sign .rig-q,.orc-sign .rig-more{color:var(--dim)}
.orc-on{fill:none;stroke:var(--on);stroke-width:2.3;stroke-linecap:round}.orc-of{fill:none;stroke:var(--off);stroke-width:2;stroke-linecap:round}
.orc-red{fill:none;stroke:#ff5a3c;stroke-width:2.4;stroke-linecap:round}
.orc-sign[data-kind=levelup] .rig-text{padding:13px 8px}
.orc-sign[data-kind=levelup] .rig-fig{font:700 21px/1.1 Cinzel,Georgia,serif;letter-spacing:.04em}
.orc-sign[data-kind=death] .rig-text{padding:13px 8px}
.orc-sign[data-kind=death] .rig-fig{font:400 21px/1.15 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.17em;margin-right:-.17em;text-transform:lowercase;font-variant:small-caps}
.orc-sign[data-kind=achievement] .rig-text{padding:8px 13px}
.orc-sign[data-kind=achievement] .rig-title{font:italic 600 13.5px/1.1 "Cormorant Garamond",Georgia,serif}
.orc-sign[data-kind=achievement] .rig-tag{color:#6e120c;font-weight:700}
.orc-sign[data-kind=achievement] .rig-title{font-weight:700}
`;

  // ---- shared small drawings ----
  // a skull about 0,0 (about 18 wide, 25 tall); horned: a great pair of horns
  const skull = (u, horned) => `${horned ? [1, -1].map((s) => `<g transform="scale(${s},1)"><path d="M6,-9C13,-9 19,-14 21,-25C23,-15 20,-6 9,-3Z" fill="${s > 0 ? '#d2c6a4' : '#a99d7c'}" stroke-width=".8"/><path d="M12,-8l2,3M16,-12l2.500,2M18.500,-17l2.500,1" fill="none" stroke-width=".5" opacity=".7"/></g>`).join('') : ''}
<path d="M-9,-2C-10,-12 -4,-14 0,-14C4,-14 10,-12 9,-2C9,3 7,5 6,6L5,11H-5L-6,6C-7,5 -9,3 -9,-2Z" fill="url(#orB${u})" stroke-width=".9"/>
<path d="M-7,-3q2.700,-3.800 5.400,0q-2.200,3.600 -5.400,0ZM1.600,-3q2.700,-3.800 5.400,0q-3.200,3.600 -5.400,0ZM0,2l-1.600,3.400h3.200Z" fill="#1c130d" stroke-width=".5"/>
<path d="M-5,7.500H5M-3,7.500v3.500M0,7.500v3.500M3,7.500v3.500" fill="none" stroke-width=".6"/><path d="M-9,-2C-10,-12 -4,-14 -2,-14C-6,-10 -7,-4 -6,6C-7,5 -9,3 -9,-2Z" fill="#000" opacity=".22" stroke="none"/>`;
  // the clan mark: three claw strokes, daubed (drawn about 0,0, about 22 tall)
  const RAKE = 'M-7.500,-10Q-10,0 -6.500,10M0,-12Q-1.500,0 1,12M7.500,-10Q8.500,0 5.500,10';
  const rake = (col, w = 3.2, drips) => `<path d="${RAKE}" fill="none" stroke="${col}" stroke-width="${w}"/>${drips ? `<path d="M-6.500,10v5M1,12v7M5.500,10v3.500" fill="none" stroke="${col}" stroke-width="${n(w * .45)}"/>` : ''}`;

  // ---- the orc himself: shoulders in scale and hide, the head, drawn at twice the size ----
  const ALM = 'M-7.500,0Q0,-6.200 7.500,0Q0,4.600 -7.500,0Z';
  const eye = (s, u) => `<g transform="translate(${15 * s},-1) rotate(${-9 * s})"><ellipse rx="11.500" ry="7.500" fill="#1d130c" opacity=".6"/><ellipse rx="11.500" ry="7.500" fill="url(#orp${u})"/>
<g clip-path="url(#orc${u})"><path d="${ALM}" fill="#d9c67a"/><path d="M-9,-7H9V-1.200H-9Z" fill="#3a2414" opacity=".42"/>
<g class="orc-pm"><g class="orc-pg"><circle r="3.100" fill="#c4501a"/><circle r="3.100" fill="none" stroke="#5a1a08" stroke-width=".8"/><circle r="1.400" fill="#0e0604"/><circle cx="-1" cy="-1.100" r=".75" fill="#fff5d8"/></g></g>
<g class="orc-lid"><g class="orc-bl"><path d="M-10,-18H10V-4.400Q0,-2.800 -10,-4.400Z" fill="#7b674c" stroke="${INK}" stroke-width="1"/></g></g><path class="orc-low" d="M-10,15H10V4Q0,5 -10,4Z" fill="#8b765a" stroke="${INK}" stroke-width=".8"/></g>
<path d="${ALM}" fill="none" stroke="${INK}" stroke-width="1"/><path d="M-8,.4Q0,-6.800 8,.4" fill="none" stroke="${INK}" stroke-width="1.900" stroke-linecap="round"/>
<path d="M${-6 * s},5.500q${6 * s},3 ${12 * s},-.5M${-4 * s},8q${5 * s},2 ${9 * s},0" fill="none" stroke="${INK}" stroke-width=".7" stroke-linecap="round" opacity=".8"/></g>`;
  const BROW = `<path d="M-14,2C-12,-5 0,-7.500 12,-4.500C16,-3.500 16,1 12,2C5,1 -3,2.500 -8,5.500C-11,7.500 -15,5 -14,2Z" fill="#6c5943" stroke="${INK}" stroke-width="1.500" stroke-linejoin="round"/><path d="M-10,-2q8,-3.500 20,-1.500" fill="none" stroke="#b9ac88" stroke-width="1.100" opacity=".7"/><path d="M-6,3l1.500,-4M0,1.300l1.500,-4M6,.5l1.500,-3.500" fill="none" stroke="${INK}" stroke-width=".7" opacity=".7"/>`;
  // small uneven teeth in a wide mouth (no tusks); scaleY turns the snarl into a grim grin
  const mouth = (() => {
    const top = (x) => -5 + 6 * (x / 21) ** 2, bot = (x) => 6.2 - 5.2 * (x / 21) ** 2;
    const xs = [-17.5, -13.5, -10, -5.5, -2, 2.5, 6, 10.5, 14, 17.5], ln = [3.6, 5, 3.2, 4.6, 0, 4.8, 3, 4.4, 3.4];
    let up = '', lo = '';
    for (let i = 0; i < 9; i++) if (ln[i]) up += `M${xs[i]},${n(top(xs[i]))}L${n((xs[i] + xs[i + 1]) / 2 + (i % 2 ? .6 : -.5))},${n(top((xs[i] + xs[i + 1]) / 2) + ln[i])}L${xs[i + 1]},${n(top(xs[i + 1]))}Z`;
    const xl = [-15, -11, -7.5, -3, 1, 4.5, 8.5, 12, 15.5], ll = [2.6, 3.4, 2.4, 3.2, 2.8, 0, 3.4, 2.4];
    for (let i = 0; i < 8; i++) if (ll[i]) lo += `M${xl[i]},${n(bot(xl[i]))}L${n((xl[i] + xl[i + 1]) / 2)},${n(bot((xl[i] + xl[i + 1]) / 2) - ll[i])}L${xl[i + 1]},${n(bot(xl[i + 1]))}Z`;
    return `<path d="M-21,1C-14,-7 14,-7 21,1C14,8 -14,8 -21,1Z" fill="#2a1210" stroke-width="1.700"/><path d="M-8,5Q0,2 8,5Q0,7.500 -8,5Z" fill="#7a3028" stroke="none"/><path d="${up}" fill="#e2d6b2" stroke-width=".8"/><path d="${lo}" fill="#cfc29c" stroke-width=".7"/><path d="M-23,-1q-2,2 -1.500,5M23,-1q2,2 1.500,5" fill="none" stroke-width="1.100"/>`;
  })();
  const head = (u) => {
    let neck = '';
    for (let i = -3; i <= 3; i++) { const x = i * 11, y = 77 - 15 * (x / 40) ** 2; neck += `<path d="M${x - 2.6},${n(y)}L${x + (i % 2 ? .6 : -.4)},${n(y + 8.5)}L${x + 2.6},${n(y)}Z" fill="url(#orB${u})" stroke-width=".9"/>`; }
    const body = `
<path d="M-28,30C-46,38 -80,42 -92,64L-96,112H96L92,64C80,42 46,38 28,30Z" fill="url(#orL${u})" stroke-width="2.200"/>
<path d="M44,44C62,40 88,48 92,66L62,74Z" fill="#5a4a3a" stroke-width="1.400"/><path d="M52,48l3,7M61,48l3,8M70,50l3,8M79,54l2,7M86,60l1,6" fill="none" stroke-width=".9" opacity=".8"/><path d="M50,45C64,42 82,48 89,60" fill="none" stroke="#b7a27a" stroke-width="1.100" opacity=".5"/>
<path d="M-58,112L-56,66Q0,50 56,66L58,112Z" fill="#26272a" stroke-width="1.800"/><path d="M-58,112L-56,66Q0,50 56,66L58,112Z" fill="url(#orm${u})" stroke="none"/>
<path d="M-28,30C-46,38 -80,42 -92,64L-96,112H-40L-42,64C-40,50 -34,40 -28,36Z" fill="url(#orp${u})" stroke="none"/>
<path d="M30,44L46,52L-28,112L-50,112Z" fill="#2a1f18" stroke-width="1.400"/><g fill="#9aa0a4" stroke-width=".6"><circle cx="34" cy="51" r="2"/><circle cx="14" cy="67" r="2"/><circle cx="-6" cy="83" r="2"/><circle cx="-26" cy="99" r="2"/></g>
<path d="M-24,24L-27,50Q0,62 27,50L24,24Z" fill="#7e694e" stroke-width="1.800"/><path d="M-24,24L-27,50Q0,62 27,50L24,24Q0,46 -24,24Z" fill="#1d130c" opacity=".4" stroke="none"/>
<path d="M-31,46Q0,64 31,46L34,55Q0,75 -34,55Z" fill="#7a2018" stroke-width="1.500"/><path d="M-26,53Q0,68 26,53" fill="none" stroke="#c0574a" stroke-width=".9" opacity=".6"/>
<path d="M-40,62Q0,92 40,62" fill="none" stroke-width="1.600"/>${neck}
<g transform="rotate(-14 -70 60)"><path d="M-90,52L-97,27L-80,47Z" fill="url(#orI${u})" stroke-width="1.400"/><path d="M-72,46L-72,21L-60,46Z" fill="url(#orI${u})" stroke-width="1.400"/><ellipse cx="-70" cy="62" rx="27" ry="15" fill="url(#orI${u})" stroke-width="2"/><ellipse cx="-70" cy="62" rx="27" ry="15" fill="url(#orp${u})" stroke="none" opacity=".8"/><ellipse cx="-70" cy="62" rx="21" ry="10.500" fill="none" stroke-width=".8" opacity=".7"/><ellipse cx="-62" cy="56" rx="9" ry="3" fill="#8a4a2a" opacity=".45" stroke="none"/><g fill="#b4babd" stroke-width=".6"><circle cx="-88" cy="64" r="1.900"/><circle cx="-70" cy="72" r="1.900"/><circle cx="-52" cy="65" r="1.900"/></g></g>`;
    // ears: lumps, not points. His right is notched and ringed, his left is torn ragged.
    const earL = `<g class="orc-ear"><path d="M-35,-12C-44,-21 -56,-16 -56,-5L-49,-3.500L-55,2C-54,10 -45,13.500 -35,9Z" fill="#7e694e" stroke-width="1.800"/><path d="M-39,-8C-45,-13 -51,-10 -51,-5M-40,5C-44,7 -48,6 -50,3" fill="none" stroke-width="1"/><path d="M-37,-9C-42,-10 -45,-6 -44,0C-43,4 -40,5 -37,4Z" fill="#3d2a22" opacity=".6" stroke="none"/><circle cx="-50" cy="11" r="4.200" fill="none" stroke-width="2.800"/><circle cx="-50" cy="11" r="4.200" fill="none" stroke="#9aa2a8" stroke-width="1.300"/></g>`;
    const earR = `<g class="orc-ear"><path d="M35,-12C43,-20 53,-17 55,-9L48,-7.500L53,-2L46,.5L50,6C46,12 40,11.500 35,9Z" fill="#a58c69" stroke-width="1.800"/><path d="M39,-8C44,-12 49,-11 50,-8M40,5C43,7 45,6 46,4" fill="none" stroke-width="1"/><path d="M37,-8C42,-9 44,-5 43,0C42,3 40,4 37,4Z" fill="#3d2a22" opacity=".5" stroke="none"/></g>`;
    const face = `
<path d="M-36,-8C-40,-26 -28,-38 0,-38C28,-38 40,-26 36,-8C41,-2 41,10 37,19L29,38Q0,49 -29,38L-37,19C-41,10 -41,-2 -36,-8Z" fill="url(#orS${u})" stroke-width="2.200"/>
<path d="M-36,-8C-40,-26 -28,-38 -6,-38C-22,-30 -27,-16 -25,-6C-29,4 -28,16 -24,30L-29,38L-37,19C-41,10 -41,-2 -36,-8Z" fill="#1d130c" opacity=".24" stroke="none"/>
<path d="M-36,-8C-40,-26 -28,-38 -6,-38C-22,-30 -27,-16 -25,-6C-29,4 -28,16 -24,30L-29,38L-37,19C-41,10 -41,-2 -36,-8Z" fill="url(#orp${u})" stroke="none"/>
<path d="M-36,-8C-40,-20 -34,-32 -22,-36C-31,-27 -33,-16 -32,-6C-35,2 -35,10 -33,18L-37,19C-41,10 -41,-2 -36,-8Z" fill="url(#orq${u})" stroke="none"/>
<path d="M-37,-14Q0,-6 37,-14L37,-3Q0,3 -37,-3Z" fill="#1d130c" opacity=".4" stroke="none"/>
<path d="M-12,6C-20,10 -26,15 -28,22M12,6C20,10 26,15 28,22M-33,2C-36,8 -36,13 -34,18M33,2C36,8 36,13 34,18M-10,40q10,4 20,0M-3,-11v5M3,-11v5" fill="none" stroke-width="1" opacity=".8"/>
<ellipse cx="27" cy="12" rx="7" ry="5" fill="#e6dcb6" opacity=".3" stroke="none"/><ellipse cx="-27" cy="13" rx="6" ry="4" fill="#7a3a2c" opacity=".2" stroke="none"/>
<path d="M21,-8L29,24" fill="none" stroke="#7a3e33" stroke-width="2"/><path d="M19,2l7,-2M21,10l7,-2M23,18l7,-2" fill="none" stroke-width="1"/>
<g fill="${INK}" stroke="none" opacity=".5"><circle cx="-14" cy="40" r=".7"/><circle cx="-7" cy="43" r=".7"/><circle cx="6" cy="43.500" r=".7"/><circle cx="14" cy="40.500" r=".7"/><circle cx="0" cy="39" r=".7"/><circle cx="-20" cy="35" r=".7"/><circle cx="21" cy="35" r=".7"/></g>`;
    const nose = `<path d="M-4,-5C-5,4 -11.500,8 -11.500,13.500C-11.500,18.500 -5,19.500 -2,17.500Q0,19 2,17.500C5,19.500 11.500,18.500 11.500,13.500C11.500,8 5,4 4,-5Z" fill="#a88f6c" stroke-width="1.500"/><path d="M-4,-5C-5,4 -11.500,8 -11.500,13.500C-11.500,18.500 -5,19.500 -2,17.500C-6,13 -5,4 -1,-3Z" fill="url(#orp${u})" stroke="none"/><path d="M-8.500,16q2.700,-4.500 5.400,-1ZM3.100,15q2.700,-3.500 5.400,1Z" fill="#170d0b" stroke-width=".7"/><path d="M-3.500,-1h7M-4,2.500h8" fill="none" stroke-width=".7" opacity=".7"/><ellipse cx="4.500" cy="9" rx="2.600" ry="4" fill="#ece3bb" opacity=".35" stroke="none"/>`;
    const lips = `<g class="orc-scowl"><path d="M-21,31.500Q-10,24.500 0,25.500Q10,24.500 21,31.500" fill="none" stroke-width="2.200"/><path d="M-11,31.500Q0,28.500 11,31.500M-23,29q-2,3 -1,6M23,29q2,3 1,6" fill="none" stroke-width="1.100"/><path d="M-9,26.200l1.500,2.600l1.600,-2.800ZM6,26l1.400,2.400l1.600,-2.200Z" fill="#e2d6b2" stroke-width=".7"/></g><g transform="translate(0,29)"><g class="orc-mo">${mouth}</g></g>`;
    const riv = [-32, -19, -6.5, 6.5, 19, 32].map((x) => `<circle cx="${x}" cy="${n(-20.5 + 7.5 * (x / 40) ** 2)}" r="1.800"/>`).join('');
    const cap = `<path d="M-4.500,-46L0,-61L4.500,-46Z" fill="url(#orI${u})" stroke-width="1.600"/>
<path d="M-39,-12C-42,-36 -24,-48 0,-48C24,-48 42,-36 39,-12Q0,-23 -39,-12Z" fill="url(#orI${u})" stroke-width="2.200"/>
<path d="M-39,-12C-42,-36 -24,-48 -4,-48C-20,-42 -27,-30 -26,-15Z" fill="url(#orp${u})" stroke="none"/><path d="M-39,-12C-42,-36 -24,-48 -16,-47C-30,-40 -35,-28 -34,-13Z" fill="url(#orq${u})" stroke="none"/>
<path d="M12,-46C28,-42 38,-32 38,-18" fill="none" stroke="#e3e9ec" stroke-width="1.200" opacity=".6"/><path d="M-13,-46C-11,-38 -11,-30 -12,-21M13,-46C11,-38 11,-30 12,-21" fill="none" stroke-width="1"/>
<ellipse cx="22" cy="-32" rx="7" ry="4" fill="#8a4a2a" opacity=".5" stroke="none"/><ellipse cx="-20" cy="-36" rx="5" ry="3" fill="#8a4a2a" opacity=".4" stroke="none"/><path d="M20,-42l5,4l-2,5M-26,-30l4,3" fill="none" stroke-width=".9" opacity=".8"/>
<path d="M-41.500,-15Q0,-27 41.500,-15L40.500,-6Q0,-18 -40.500,-6Z" fill="#3c4146" stroke-width="1.900"/><path d="M-40,-12.500Q0,-24.500 40,-12.500" fill="none" stroke="#c8ced2" stroke-width=".9" opacity=".6"/><g fill="#9aa0a4" stroke-width=".6">${riv}</g>
<path d="M-4.500,-18L-3.500,3Q0,5.500 3.500,3L4.500,-18Z" fill="#4a4f55" stroke-width="1.600"/><path d="M0,-16v17" fill="none" stroke-width=".7" opacity=".7"/>
<g class="orc-war"><path d="M-22,-45L-27,-60L-15,-47ZM22,-45L27,-60L15,-47Z" fill="url(#orI${u})" stroke-width="1.500"/><path d="M-33,2L-16,8M-34,9L-18,15M-32,16L-20,21M33,2L16,8M34,9L18,15" fill="none" stroke="${RED}" stroke-width="3.400" opacity=".92"/></g>`;
    const F = (body) => `<g filter="url(#orf${u})" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">${body}</g>`;
    return `<svg class="rig-s orc-head rig-rim" xmlns="${NS}" width="${200 * HS}" height="${180 * HS}" viewBox="-100 -70 200 180">
${F(body)}${F(earL)}${F(earR)}${F(face)}${eye(-1, u)}${eye(1, u)}
<g transform="translate(-15,-9.500)"><g class="orc-bL"><g transform="scale(-1,1)">${BROW}</g></g></g><g transform="translate(15,-9.500)"><g class="orc-bR">${BROW}</g></g>
${F(nose + lips + cap)}</svg>`;
  };
  // tears (death): two a cheek, slow, pale, staying on his face
  const tears = () => `<div class="rig-a orc-tears">${[[-10.6, 2.5, '-4deg', 0], [5.6, 2.5, '4deg', -2.5]].map(([x, y, a, dl]) => `<div class="orc-tear" style="left:${CX + x}px;top:${HY + y}px;transform:rotate(${a})"><i style="--r:4px;--dl:${dl}s"></i><i style="--r:9px;--dl:${dl - 2.9}s"></i></div>`).join('')}</div>`;

  // ---- hands and what they hold ----
  const hands = (u) => {
    const h = (cls, x) => `<g transform="translate(${x},${RY - 1})"><g class="${cls}"><path d="M-8.500,1C-9,-4.500 -5.500,-5.500 -4.300,-2.500C-4,-6.500 0,-6.800 .2,-2.800C.8,-6.500 4.600,-6 4.500,-2.300C5.500,-5 8.800,-4 8.500,1L8,4.500H-8Z" fill="${SKIN}" stroke-width="1"/><path d="M-8.500,1C-9,-4.500 -5.500,-5.500 -4.800,-3L-5,4.500H-8Z" fill="#1d130c" opacity=".3" stroke="none"/><path d="M-4.300,-2v4.500M.2,-2.500v5M4.500,-2v4.500" fill="none" stroke-width=".6"/><path d="M-7.800,4.300l1.300,3.400l1.600,-3.400ZM-3.200,4.500l1.300,3.600l1.500,-3.600ZM1.300,4.500l1.300,3.600l1.500,-3.600ZM5.600,4.300l1.200,3.200l1.300,-3.200Z" fill="#1a130e" stroke-width=".5"/></g></g>`;
    return S('rig-rim', -56, RY - 10, 112, 22, G(u, h('orc-hL', -31) + h('orc-hR', 31)));
  };
  // a bare forearm in a studded bracer, rising from behind the rim (the elbow stays in the basket)
  const fore = (u, ex, ey, hx, hy, w = 9) => {
    const dx = hx - ex, dy = hy - ey, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L, a = w / 2 + 1.2, b = w / 2;
    const at = (f, o) => `${n(ex + dx * f + nx * o)},${n(ey + dy * f + ny * o)}`;
    return `<path d="M${at(0, a)}L${at(1, b)}L${at(1, -b)}L${at(0, -a)}Z" fill="${SKIN}" stroke-width="1"/><path d="M${at(0, -a)}L${at(1, -b)}L${at(1, -b * .15)}L${at(0, -a * .15)}Z" fill="${HP(u)}" stroke="none"/><path d="M${at(.3, a + .8)}L${at(.72, b + 1.3)}L${at(.72, -b - 1.3)}L${at(.3, -a - .8)}Z" fill="#33261d" stroke-width=".9"/><g fill="#9aa0a4" stroke-width=".4"><circle cx="${n(ex + dx * .4)}" cy="${n(ey + dy * .4)}" r="1"/><circle cx="${n(ex + dx * .62)}" cy="${n(ey + dy * .62)}" r="1"/></g>`;
  };
  const fist = (x, y, r = 5.2) => `<path d="M${x - r},${y}C${x - r},${n(y - r * 1.15)} ${x + r},${n(y - r * 1.15)} ${x + r},${y}C${x + r},${n(y + r * .9)} ${x - r},${n(y + r * .9)} ${x - r},${y}Z" fill="${SKIN}" stroke-width="1"/><path d="M${n(x - r * .5)},${n(y - r * .78)}v${n(r * .75)}M${x},${n(y - r * .86)}v${n(r * .8)}M${n(x + r * .5)},${n(y - r * .78)}v${n(r * .75)}" fill="none" stroke-width=".5"/><path d="M${x - r},${y}C${x - r},${n(y - r * 1.15)} ${x},${n(y - r * 1.15)} ${n(x - r * .3)},${n(y - r * .7)}C${n(x - r * .6)},${y} ${n(x - r * .5)},${n(y + r * .6)} ${n(x - r * .7)},${n(y + r * .5)}Z" fill="#1d130c" opacity=".28" stroke="none"/>`;
  const PR = (cls, u, x, y, body, wrap = '') => `<div class="orc-p ${cls}"><div class="orc-pw ${wrap}">${S('rig-rim', x, y, 50, RY - y + 8, G(u, body))}</div></div>`;
  const props = (u) => {
    const E = RY + 3, y = HY;
    return ''
      // the tally stick he reads the kill off (unrated)
      + PR('orc-tal', u, 20, y - 12, `${fore(u, 38, E, 40, y + 27)}${ink2(`M40.500,${y + 30}L44,${y - 5}`, 3.4, '#d6c79c')}<path d="M40,${y + 14}l5,.6M40.600,${y + 9}l5,.6M41.200,${y + 4}l5,.6M41.800,${y - 1}l4,.5" fill="none" stroke-width="1"/>${fist(40.5, y + 24)}`)
      // a rat by the tail (poor): the day's whole bag
      + `<div class="orc-p orc-rat">${S('rig-rim', 20, y, 50, RY - y + 8, G(u, `${fore(u, 38, E, 42, y + 19)}${fist(42, y + 16)}`))}${Z('orc-ratd', 42, y + 19, SL('rig-rim', -8, 0, 16, 28, G(u, `<path d="M0,0C2,4 -2,6 0,10" fill="none" stroke-width="2"/><path d="M0,0C2,4 -2,6 0,10" fill="none" stroke="#c49a8a" stroke-width="1"/><path d="M-4.500,15C-4.500,8.500 4.500,8.500 4.500,15C5,20.500 3,25 0,26C-3,25 -5,20.500 -4.500,15Z" fill="#7d6e5c" stroke-width=".9"/><path d="M-4.500,15C-4.500,8.500 0,8.500 -1,11C-2.500,16 -2,22 0,26C-3,25 -5,20.500 -4.500,15Z" fill="#000" opacity=".3" stroke="none"/><circle cx="-3" cy="22.500" r="1.800" fill="#b9988c" stroke-width=".6"/><circle cx="3" cy="22.500" r="1.800" fill="#b9988c" stroke-width=".6"/><path d="M-4.500,13l-3,1.500M4.500,13l3,1.500M0,26v1.500" fill="none" stroke-width=".6"/>`)))}</div>`
      // a bone to gnaw (meh)
      + PR('orc-bon', u, 4, y, `${fore(u, 38, E, 31, y + 25)}<path d="M33,${y + 20}c2,-3.500 6.500,-.5 4.500,2c2.500,2.500 -1.500,6 -4.300,3.200L14,${y + 19.5}c-1.500,2 -5,1.500 -4.500,-1.300c-2.500,-2 0,-5 3.200,-3.600Z" fill="url(#orB${u})" stroke-width="1"/><path d="M17,${y + 17.5}l10,2.800" fill="none" stroke-width=".5" opacity=".6"/>${fist(30, y + 23)}`, 'orc-gnaw')
      // a haunch of meat (good)
      + PR('orc-mea', u, 22, y - 14, `${fore(u, 38, E, 41, y + 27)}${ink2(`M41,${y + 18}V${y + 31}`, 2.6, '#e4dabd')}<path d="M32.500,${y + 7}C30.500,${y - 3} 37,${y - 10} 44,${y - 9}C51.500,${y - 8} 54,${y} 52,${y + 9}C51,${y + 16} 45.500,${y + 20} 41,${y + 20}C36.500,${y + 19} 33.500,${y + 14} 32.500,${y + 7}Z" fill="#8f3526" stroke-width="1.100"/><path d="M44,${y - 9}C51.500,${y - 8} 54,${y} 52,${y + 9}C51,${y + 16} 45.500,${y + 20} 41,${y + 20}C47,${y + 15} 49,${y + 8} 48,${y + 1}C47.500,${y - 4} 46,${y - 7} 44,${y - 9}Z" fill="#dcc09a" stroke-width=".7"/><path d="M32.500,${y + 7}C30.500,${y - 3} 37,${y - 10} 40,${y - 9}C36,${y - 4} 35.500,${y + 5} 37.500,${y + 14}C35,${y + 13} 33,${y + 11} 32.500,${y + 7}Z" fill="${HP(u)}" stroke="none"/><path d="M37,${y - 1}q4,3 8,1M36.500,${y + 6}q5,3 9.500,1M38,${y + 13}q3.500,2 7,1" fill="none" stroke="#5e1c14" stroke-width=".7"/>${fist(41, y + 25)}`)
      // a drinking horn (great, superb)
      + PR('orc-hor', u, 22, y - 4, `${fore(u, 38, E, 43, y + 25)}<path d="M30,${y + 5}C32,${y + 1} 41,${y + 2} 42,${y + 7}C45,${y + 16} 50,${y + 24} 57,${y + 28}C49,${y + 30} 39,${y + 24} 34,${y + 15}C32,${y + 11} 30,${y + 8} 30,${y + 5}Z" fill="url(#orH${u})" stroke-width="1.100"/><path d="M34,${y + 15}C39,${y + 24} 49,${y + 30} 57,${y + 28}C50,${y + 27} 42,${y + 22} 38,${y + 14}Z" fill="${HP(u)}" stroke="none"/><path d="M33.500,${y + 13.5}L43,${y + 10}M40,${y + 22}L47.500,${y + 17.5}" fill="none" stroke-width="2.600"/><path d="M33.500,${y + 13.5}L43,${y + 10}M40,${y + 22}L47.500,${y + 17.5}" fill="none" stroke="#9aa2a8" stroke-width="1.300"/><ellipse cx="36" cy="${y + 5.5}" rx="6.300" ry="2.600" transform="rotate(12 36 ${y + 5.5})" fill="#3a1512" stroke-width="1"/>${fist(44, y + 21, 5)}`, 'orc-horw')
      // a coiled whip (player kill)
      + PR('orc-whi', u, 22, y, `${fore(u, 38, E, 42, y + 22)}<g fill="none"><circle cx="45" cy="${y + 33}" r="7.500" stroke-width="2.800"/><circle cx="45" cy="${y + 33}" r="7.500" stroke="#3a2a1f" stroke-width="1.500"/><circle cx="44" cy="${y + 34}" r="5" stroke-width="2.600"/><circle cx="44" cy="${y + 34}" r="5" stroke="#4a3626" stroke-width="1.300"/></g>${ink2(`M42,${y + 26}L44,${y + 7}`, 2.6, '#2a1f18')}<path d="M44,${y + 7}l-1.500,-4l3,1Z" fill="#9aa2a8" stroke-width=".7"/>${fist(42, y + 19)}`)
      // a looted helm, hacked (achievement)
      + PR('orc-hel', u, 22, y - 16, `${fore(u, 38, E, 41, y + 27)}${fist(41, y + 23)}<path d="M30,${y + 19}C30,${y + 5} 35,${y - 5} 41,${y - 10}C47,${y - 5} 52,${y + 5} 52,${y + 19}Z" fill="url(#orT${u})" stroke-width="1.100"/><path d="M30,${y + 19}C30,${y + 5} 35,${y - 5} 39,${y - 8}C36,${y} 35,${y + 9} 36,${y + 19}Z" fill="${HP(u)}" stroke="none"/><path d="M41,${y - 10}V${y + 14}" fill="none" stroke-width=".6" opacity=".6"/><path d="M28.500,${y + 16.5}H53.500V${y + 20.5}H28.500Z" fill="#b99a4e" stroke-width=".9"/><path d="M45,${y - 3}l4,7l-3,1l3,6" fill="none" stroke-width="1.300"/><path d="M41,${y - 10}C38,${y - 15} 33,${y - 15} 30,${y - 11}C34,${y - 12} 37,${y - 11} 39.500,${y - 8.500}Z" fill="#3d5f8f" stroke-width=".8"/>`, 'orc-helw')
      // the scimitar at his shoulder (superb, player kill)
      + PR('orc-sci', u, -64, y - 30, `${fore(u, -38, E, -42, y + 28)}<path d="M-45,${y + 21}C-50,${y + 6} -53,${y - 10} -50.500,${y - 27}C-42.500,${y - 17} -39.500,${y + 2} -39.500,${y + 21}Z" fill="url(#orI${u})" stroke-width="1.100"/><path d="M-45,${y + 21}C-50,${y + 6} -53,${y - 10} -50.500,${y - 27}C-49,${y - 12} -47,${y + 4} -43.500,${y + 21}Z" fill="${HP(u)}" stroke="none"/><path d="M-41.500,${y + 17}C-41.500,${y + 2} -44,${y - 12} -48.500,${y - 21}" fill="none" stroke="#eef2f3" stroke-width=".9" opacity=".8"/><path d="M-40,${y + 6}l-2.500,1.200l2.300,1.800M-41.500,${y - 6}l-2.200,.6l1.700,1.800" fill="#170f0a" stroke-width=".6"/><path d="M-48.500,${y + 20.5}H-36.500V${y + 23.5}H-48.500Z" fill="#1d1916" stroke-width=".9"/>${fist(-42, y + 27)}`, 'orc-pwl orc-sciw')
      // the clan's standard (level up): held upright the whole time
      + PR('orc-ban', u, -70, y - 44, `${fore(u, -38, E, -41, y + 28)}${ink2(`M-41,${RY + 4}L-45,${y - 33}`, 2, '#6b5237')}${ink2(`M-57,${y - 27}L-35,${y - 29.5}`, 1.6, '#6b5237')}<path d="M-56.500,${y - 26.5}L-36,${y - 28.500}L-35,${y + 1}L-40.500,${y - 4}L-45.500,${y + 3}L-51,${y - 3}L-56.500,${y + 2}Z" fill="${TAR}" stroke-width="1"/><path d="M-56.500,${y - 26.5}L-50,${y - 27}L-50.500,${y - 3.500}L-56.500,${y + 2}Z" fill="${HP(u)}" stroke="none"/><g transform="translate(-45.800,${y - 14}) scale(.7)">${rake('#d2382a', 3.4)}</g><g transform="translate(-45,${y - 34}) scale(.38)">${skull(u)}</g>${fist(-41, y + 27)}`, 'orc-pwl');
  };

  const SW = 158, HX = 56;   // the sign's width and half the distance between its two chains (full size; the rig shows it at K.SS)

  // ---- the war basket: an iron-bound crate hung with two shields. It is deeper than it looks: the planks run on
  // down to K.BD behind the sign (no floor is drawn); the sign's chains hang from two eye-bolts on plates just under the rim ----
  const basket = (u) => {
    const sh1 = `<g transform="translate(-14,${RY + 16})"><circle r="11" fill="#211d1c" stroke-width="1.100"/><circle r="11" fill="none" stroke="#6f767c" stroke-width="1.800"/><circle r="11.800" fill="none" stroke-width=".7"/><path d="M-11,0A11,11 0 0 0 -4,10.200L-3,7.500A8,8 0 0 1 -8,0Z" fill="${HP(u)}" stroke="none"/><g transform="scale(.62)">${rake('#c2301f', 3.6)}</g><path d="M4,-9l3,5l-2,2" fill="none" stroke-width=".7"/></g>`;
    const sh2 = `<g transform="translate(17,${RY + 15.5})"><circle r="10" fill="#6b5338" stroke-width="1.100"/><path d="M-9.500,-3H9.500M-9.500,3.500H9.500" fill="none" stroke-width=".5" opacity=".7"/><circle r="10" fill="none" stroke="#5a5f63" stroke-width="1.500"/><circle r="10.700" fill="none" stroke-width=".7"/><path d="M-10,0A10,10 0 0 0 -3.500,9.300L-2.500,7A7.500,7.500 0 0 1 -7.500,0Z" fill="${HP(u)}" stroke="none"/><circle r="3.400" fill="url(#orI${u})" stroke-width=".9"/><path d="M3,-8.500l2,6l-2.500,1M-7,4l4,2" fill="none" stroke-width=".9"/></g>`;
    const LX = n(HX * K.SS), LY = RY + K.CY, BD = K.BD, wx = (y) => 51 - 4 * (y - RY - 1) / 28;
    let low = ''; for (let y = RY + 28.5; y < BD; y += 9) low += `M${n(-wx(y) + .5)},${y}H${n(wx(y) - .5)}`;
    const strap = (s) => `<path d="M${s * 43},${RY + 2}L${s * n(wx(BD) - 4)},${BD}H${s * n(wx(BD) - 11)}L${s * 35},${RY + 2}Z" fill="url(#orI${u})" stroke-width=".9"/><g fill="#b4babd" stroke-width=".4"><circle cx="${s * 39}" cy="${RY + 8}" r="1.100"/><circle cx="${s * 38}" cy="${RY + 16}" r="1.100"/><circle cx="${s * 37}" cy="${RY + 24}" r="1.100"/></g>`;
    const b = n(wx(BD));
    return S('rig-rim', -64, RY - 8, 128, BD - RY + 8, `${G(u, `
<path d="M-51,${RY + 1}L${-b},${BD}H${b}L51,${RY + 1}Z" fill="url(#orW${u})" stroke-width="1.100"/>
<path d="M-51,${RY + 1}L${-b},${BD}H${n(-b + 22)}L-25,${RY + 1}Z" fill="${HP(u)}" stroke="none"/><path d="M-51,${RY + 1}L${-b},${BD}H${n(-b + 10)}L-39,${RY + 1}Z" fill="${HQ(u)}" stroke="none"/>
<path d="${low}" fill="none" stroke-width=".8" opacity=".8"/>
<path d="M-50,${RY + 10.5}H50M-48.500,${RY + 19.5}H48.500" fill="none" stroke-width=".8" opacity=".8"/><path d="M-28,${RY + 6}h9M2,${RY + 24}h12M26,${RY + 6.5}h8M-30,${RY + 23.5}h7" fill="none" stroke="#b79a6e" stroke-width=".7" opacity=".5"/>
${strap(-1)}${strap(1)}${sh1}${sh2}
<path d="M-61,${RY}L-54,${RY - 2.5}V${RY + 3}ZM61,${RY}L54,${RY - 2.5}V${RY + 3}Z" fill="url(#orI${u})" stroke-width=".9"/>
<rect x="-54" y="${RY - 3}" width="108" height="6.500" rx="1.300" fill="url(#orI${u})" stroke-width="1.100"/><path d="M-51,${RY - 1.5}H51" fill="none" stroke="#e3e9ec" stroke-width=".8" opacity=".5"/><ellipse cx="30" cy="${RY + .5}" rx="9" ry="2" fill="#8a4a2a" opacity=".5" stroke="none"/>
<g fill="#26292c" stroke-width=".4"><circle cx="-46" cy="${RY + .6}" r="1.100"/><circle cx="-23" cy="${RY + .6}" r="1.100"/><circle cx="0" cy="${RY + .6}" r="1.100"/><circle cx="23" cy="${RY + .6}" r="1.100"/><circle cx="46" cy="${RY + .6}" r="1.100"/></g>
<path d="M${n(-wx(BY - 4) - 1)},${BY - 4}H${n(wx(BY - 4) + 1)}L${n(wx(BY + 3) + 1)},${BY + 3}H${n(-wx(BY + 3) - 1)}Z" fill="#3c4146" stroke-width=".9"/><path d="M-46,${BY - 2.5}H46" fill="none" stroke="#c9d0d4" stroke-width=".7" opacity=".45"/>
${[-1, 1].map((q) => `<path d="M${q * LX - 3.6},${LY - 3.5}h7.200v8h-7.200Z" fill="url(#orI${u})" stroke-width=".8"/>`).join('')}`)}
<g fill="none">${[-1, 1].map((q) => `<circle cx="${q * LX}" cy="${LY}" r="2.400" stroke="#17120e" stroke-width="2"/><circle cx="${q * LX}" cy="${LY}" r="2.400" stroke="#9aa2a8" stroke-width=".8"/>`).join('')}</g>`);
  };
  // what hangs off the basket's corners and swings: a skull on a thong, a hook on a chain
  const dangles = (u) => Z('orc-dgl', -57, RY + 2, SL('rig-rim', -8, 0, 16, 26, G(u, `${ink2('M0,0V10', 1, '#8a7858')}<g transform="translate(0,16.500) scale(.62)">${skull(u)}</g>`)))
    + Z('orc-dgr', 57, RY + 2, SL('rig-rim', -8, 0, 16, 26, G(u, `${ink2('M0,0V11', 1.2, '#8d949b', 'stroke-dasharray="2.200 1.500"')}<path d="M0,11V17C0,22.500 -6,22.500 -6,17.500" fill="none" stroke-width="3"/><path d="M0,11V17C0,22.500 -6,22.500 -6,17.500" fill="none" stroke="#8d949b" stroke-width="1.500"/><path d="M-6,17.500l-1.500,-4l3,1.500Z" fill="#8d949b" stroke-width=".6"/>`)));

  // ---- the burner: an iron fire-cage of coals hung on chains under the mouth ----
  const burner = (u) => S('rig-rim', -24, HG, 48, FY - HG + 18, G(u, `
${ink2(`M-19,${HG + 4}L-12.500,${FY}M19,${HG + 4}L12.500,${FY}`, 1.2, '#8d949b', 'stroke-dasharray="2.200 1.500"')}
<path d="M-13,${FY}H13Q12.500,${FY + 10} 0,${FY + 13}Q-12.500,${FY + 10} -13,${FY}Z" fill="#1c1512" stroke-width="1"/>
<g class="orc-coal" stroke-width=".5"><circle cx="-7" cy="${FY + 3.5}" r="2.600"/><circle cx="-1.500" cy="${FY + 4.5}" r="3"/><circle cx="5" cy="${FY + 3.8}" r="2.800"/><circle cx="-3.500" cy="${FY + 8.5}" r="2.400"/><circle cx="2.500" cy="${FY + 8.800}" r="2.500"/></g>
<path d="M-13,${FY}Q-12.500,${FY + 10} 0,${FY + 13}M-6.500,${FY + 1}Q-6.500,${FY + 10} 0,${FY + 13}M0,${FY + 1}V${FY + 13}M6.500,${FY + 1}Q6.500,${FY + 10} 0,${FY + 13}M13,${FY}Q12.500,${FY + 10} 0,${FY + 13}" fill="none" stroke-width="2.600"/>
<path d="M-13,${FY}Q-12.500,${FY + 10} 0,${FY + 13}M-6.500,${FY + 1}Q-6.500,${FY + 10} 0,${FY + 13}M0,${FY + 1}V${FY + 13}M6.500,${FY + 1}Q6.500,${FY + 10} 0,${FY + 13}M13,${FY}Q12.500,${FY + 10} 0,${FY + 13}" fill="none" stroke="#7d848a" stroke-width="1.200"/>
${ink2(`M-11.500,${FY + 6}Q0,${FY + 9.5} 11.500,${FY + 6}`, 1.2, '#7d848a')}
<path d="M-15,${FY - 1}L-20.500,${FY - 4.500}L-15,${FY + 2.500}ZM15,${FY - 1}L20.500,${FY - 4.500}L15,${FY + 2.500}Z" fill="#8d949b" stroke-width=".8"/>
<path d="M-15.500,${FY - .8}Q0,${FY + 3.200} 15.500,${FY - .8}L15.500,${FY + 2}Q0,${FY + 6} -15.500,${FY + 2}Z" fill="#5c6369" stroke-width=".9"/><path d="M-13,${FY + .6}Q0,${FY + 4.200} 13,${FY + .6}" fill="none" stroke="#c9d0d4" stroke-width=".6" opacity=".6"/>
<path d="M-2,${FY + 13.5}L0,${FY + 17}L2,${FY + 13.500}Z" fill="#8d949b" stroke-width=".8"/>`))
    + Z('orc-coalg', 0, FY + 4);

  // ---- the envelope: hides in uneven gores, laced with thongs; iron, paint and bone laid on the surface ----
  const KS = [-1, -.88, -.56, -.2, .18, .58, .9, 1];
  const panels = (g, cols) => KS.slice(0, -1).map((k, i) => `<path d="${g.gore(k, KS[i + 1])}" fill="${cols[i % cols.length]}" stroke="none"/>`).join('');
  const seams = (g, col, o = {}) => KS.slice(1, -1).map((k) => `<path d="${g.seam(k)}" fill="none" stroke-width=".9"/>${col ? `<path d="${g.seam(k)}" fill="none" stroke="${col}" stroke-width="${o.w || 3.2}" stroke-dasharray="${o.dash || '.9 3.6'}" stroke-linecap="butt" opacity="${o.op || .7}"/>` : ''}`).join('');
  const band = (g, u, t0, t1, fill) => `<path d="${g.band(t0, t1)}" fill="${fill}" stroke-width="1"/><path d="${g.band(t0, t1, -1, -.4)}" fill="${HP(u)}" stroke="none"/><path d="${g.lat(t0 + (t1 - t0) * .22, -.9, .93)}" fill="none" stroke="#fff" stroke-width=".8" opacity=".3"/>`;
  const studs = (g, t, num, fill, r = 1.3) => g.along(num).map((k) => { const p = g.pt(k, t); return `<circle cx="${n(p[0])}" cy="${n(p[1])}" r="${r}" fill="${fill}" stroke-width=".5"/>`; }).join('');
  // a row of painted or bone fangs: bases on t0, points on t1
  const fangs = (g, t0, t1, num, fill, k0 = -.97, k1 = .97) => { const ks = g.along(num * 2 + 1, k0, k1); let d = ''; for (let i = 0; i < num; i++) d += `M${pp(g.pt(ks[2 * i], t0))}L${pp(g.pt(ks[2 * i + 1], t1))}L${pp(g.pt(ks[2 * i + 2], t0))}Z`; return `<path d="${d}" fill="${fill}" stroke-width=".7"/>`; };
  // rusty staples across a seam
  const staples = (g, k, ts, col = '#a05a30') => ts.map((t, i) => { const p = g.pt(k, t); return ink2(`M${n(p[0] - 3.4)},${n(p[1] + (i % 2 ? .8 : -.6))}L${n(p[0] + 3.4)},${n(p[1] + (i % 2 ? -.7 : .9))}`, 1.1, col); }).join('');
  // an iron spike standing out of the silhouette
  const horn = (g, s, t, len, fill = s > 0 ? '#aab2b8' : '#6f767c') => { const p = g.pt(s, t), a = g.pt(s, t - .04), b = g.pt(s, t + .04); return `<path d="M${n(a[0] - s * 1.5)},${n(a[1])}L${n(p[0] + s * len)},${n(p[1] - len * .22)}L${n(b[0] - s * 1.5)},${n(b[1])}Z" fill="${fill}" stroke-width=".9"/>`; };
  const horns = (g, ts, len) => ts.map((t) => horn(g, -1, t, len) + horn(g, 1, t, len)).join('');
  const knot = (c, fill, w = 8) => `<path d="M${n(c[0] - w)},${n(c[1] + 4)}Q${n(c[0])},${n(c[1] - 3.5)} ${n(c[0] + w)},${n(c[1] + 4)}Q${n(c[0])},${n(c[1] + 7.5)} ${n(c[0] - w)},${n(c[1] + 4)}Z" fill="${fill}" stroke-width="1"/>`;
  const spike = (c, len, fill = '#aab2b8', a = 0) => `<path transform="rotate(${a} ${n(c[0])} ${n(c[1] + 3)})" d="M${n(c[0] - 2.8)},${n(c[1] + 1)}L${n(c[0])},${n(c[1] - len)}L${n(c[0] + 2.8)},${n(c[1] + 1)}Z" fill="${fill}" stroke-width=".9"/>`;
  const creases = (g, list) => `<path d="${list.map(([k, a, b]) => g.seam(k, a, b)).join('')}" fill="none" stroke-width=".7" opacity=".55"/>`;
  const edge = (g) => `<path d="${g.seam(.965, .06, .8)}" fill="none" stroke="#f0e2c0" stroke-width="1.100" opacity=".4"/>`;
  // a banner pole standing out from the envelope's shoulder (drawn behind it), a pennant, a skull on the tip
  const pole = (g, u, s, col, withSkull) => { const p = g.pt(s * .8, .17), x = n(p[0] + s * 23), y = n(Math.max(10, p[1] - 23)); return `${ink2(`M${n(p[0] - s * 5)},${n(p[1] + 6)}L${x},${y}`, 1.6, '#6b5237')}<path d="M${x},${y + 2}L${x + s * 17},${y + 5}L${x + s * 11},${y + 9}L${x + s * 16},${y + 14}L${x - s},${y + 12}Z" fill="${col}" stroke-width=".8"/><path d="M${x + s * 2},${y + 6.5}L${x + s * 11},${y + 7.500}" fill="none" stroke="#fff" stroke-width=".6" opacity=".35"/>${withSkull ? `<g transform="translate(${x},${y - 1}) scale(.4)">${skull(u)}</g>` : ''}`; };

  const ENV = {
    // a sagging lump of mismatched scraps
    poor: { cond: { sag: 1, lop: .85, dents: [{ side: -1, t: .5, depth: 15, span: .13 }, { side: 1, t: .28, depth: 8, span: .1 }] }, art: (g, u) => { const c = g.pt(0, 0), h = g.pt(.3, .5); return {
      base: '#6a6455', lip: '#7a4a2c', ring: '#7a5a3c',
      inside: `${panels(g, ['#77705f', '#8c6748', '#565047', '#a0957a', '#4b443d', '#7f755f', '#66594a'])}${seams(g, '#17110d', { w: 3.6, dash: '1 4.6', op: .75 })}
${creases(g, [[-.76, .34, .72], [-.45, .42, .66], [.42, .68, .98], [-.32, .7, .98], [.78, .58, .9], [.02, .74, .98], [.3, .04, .2]])}
${staples(g, -.56, [.2, .29, .38, .62, .7])}${staples(g, .18, [.14, .22, .3, .74, .82])}${staples(g, .58, [.36, .44])}
${g.patch(-.46, .36, 22, 17, { fill: '#b8ab8c', rot: 11, sw: 1.1, hatch: HQ(u) })}${g.patch(.5, .26, 19, 15, { fill: '#8a4f2e', rot: -9, rivets: true, stitch: '#c9a27a', hatch: HP(u) })}${g.patch(-.1, .66, 16, 18, { fill: '#3d3833', rot: 7, stitch: '#d8ccac', sw: 1 })}
${g.patch(.02, .2, 14, 11, { fill: '#9a8a62', rot: -16 })}${g.patch(-.7, .68, 12, 12, { fill: '#7a2c20', rot: 13 })}
<g transform="translate(${n(h[0])},${n(h[1])})"><ellipse rx="6" ry="4.500" fill="#120c09" stroke-width=".9"/><path d="M-3,-1C-1,-5 3,-4 4,-1C7,2 4,7 2,11L-1,7L-3,12C-5,7 -6,3 -3,-1Z" fill="#b8ab8c" stroke-width=".8"/></g>
${ink2(g.lat(.8), 1.4, '#8a7858', 'stroke-dasharray="3 1.200"')}`,
      over: `${knot(c, '#565047', 6)}<path d="M${n(c[0] + 1)},${n(c[1] + 1)}C${n(c[0] + 8)},${n(c[1] - 6)} ${n(c[0] + 13)},${n(c[1] + 2)} ${n(c[0] + 10)},${n(c[1] + 12)}L${n(c[0] + 7)},${n(c[1] + 8)}L${n(c[0] + 5)},${n(c[1] + 13)}Z" fill="#8c6748" stroke-width=".8"/>`,
    }; } },
    // plain raw hide, laced, one bare band
    meh: { cond: { sag: .32, lop: -.12 }, art: (g, u) => { const c = g.pt(0, 0); return {
      base: '#86694a', lip: '#5c5f5f', ring: '#8a8a82',
      inside: `${panels(g, ['#8f7150', '#7d6245'])}${seams(g, '#1d140d')}${creases(g, [[.42, .74, .98], [-.34, .76, .98]])}${g.patch(-.4, .28, 14, 11, { fill: '#6d5338', rot: -6 })}
${band(g, u, .5, .55, '#5c5f5f')}${studs(g, .525, 9, '#a9aba6', 1.1)}${ink2(g.lat(.82), 1.4, '#8a7858', 'stroke-dasharray="3 1.200"')}`,
      over: knot(c, '#6d5338'),
    }; } },
    // sound: tarred black, a rust band, the rake in a ring
    good: { cond: {}, art: (g, u) => { const c = g.pt(0, 0); return {
      base: '#43362d', lip: IRON, ring: '#9aa2a8',
      inside: `${panels(g, ['#4a3c32', '#3a2f28'])}${seams(g, '#8a7a62', { op: .5 })}${edge(g)}
${band(g, u, .46, .57, '#9a5526')}${band(g, u, .45, .475, IRON)}${band(g, u, .555, .58, IRON)}${studs(g, .462, 13, '#c9d0d4', .9)}${studs(g, .568, 13, '#c9d0d4', .9)}${band(g, u, .84, .875, IRON)}
<g transform="${g.place(0, .245)}"><circle r="13.500" fill="none" stroke="#cfc3a0" stroke-width="1.800"/>${rake('#cfc3a0', 2.8)}</g>`,
      over: `${horns(g, [.515], 7)}${knot(c, IRON, 9)}${spike(c, 8)}`,
    }; } },
    // fine: black, a broad blood-red band of bone fangs, spikes, a skull, a pennant
    great: { cond: { taut: .5 }, art: (g, u) => { const c = g.pt(0, 0); return {
      base: '#272220', lip: '#b02a1c', ring: BONE,
      under: pole(g, u, 1, RED, false),
      inside: `${panels(g, ['#302a28', '#221e1d'])}${seams(g, '#b02a1c', { op: .65 })}${edge(g)}
${band(g, u, .43, .62, '#a3261b')}${fangs(g, .43, .5, 11, BONE)}${fangs(g, .62, .555, 11, BONE)}${ink2(g.lat(.43), 1, '#17120e')}${ink2(g.lat(.62), 1, '#17120e')}
${band(g, u, .84, .88, IRON)}${studs(g, .86, 11, '#c9d0d4', .9)}
<g transform="${g.place(0, .23, 1.15)}"><circle r="13.500" fill="none" stroke="${BONE}" stroke-width="1.300" stroke-dasharray="2.600 2"/>${rake('#d2382a', 3.4, true)}</g>`,
      over: `${horns(g, [.3, .525, .7], 9)}${knot(c, IRON, 9)}<g transform="translate(${n(c[0])},${n(c[1] - 2.5)}) scale(.56)">${skull(u)}</g>`,
    }; } },
    // the war-chief's bag: red and black, fangs, a great horned skull, a crown of spikes, banners, a fringe of bone
    superb: { cond: { taut: 1 }, art: (g, u) => {
      const c = g.pt(0, 0), e = g.pt(0, .27);
      let fr = '';
      g.along(11, -.95, .95).forEach((k, i) => { const m = g.pt(k, .9); fr += i % 3 === 1 ? `${ink2(`M${n(m[0])},${n(m[1])}v4`, .8, '#8a7858')}<g transform="translate(${n(m[0])},${n(m[1] + 8)}) scale(.36)">${skull(u)}</g>` : `<path d="M${n(m[0] - 2.2)},${n(m[1])}L${n(m[0] + k * 1.5)},${n(m[1] + 9)}L${n(m[0] + 2.2)},${n(m[1])}Z" fill="url(#orB${u})" stroke-width=".7"/>`; });
      return {
        base: '#b52a1c', lip: BONE, ring: BONE,
        under: pole(g, u, -1, '#d2382a', true) + pole(g, u, 1, '#d2382a', true),
        inside: `${panels(g, ['#1f1b1a', '#c2301f', '#231f1e', '#b52a1c', '#231f1e', '#c2301f', '#1f1b1a'])}${seams(g, BONE, { op: .6, w: 2.6 })}${edge(g)}
${band(g, u, .49, .64, '#1d1918')}${fangs(g, .49, .555, 12, BONE)}${fangs(g, .64, .585, 12, BONE)}${ink2(g.lat(.49), 1.3, '#8d949b')}${ink2(g.lat(.64), 1.3, '#8d949b')}
${band(g, u, .84, .9, '#1d1918')}${studs(g, .87, 13, BONE, 1.1)}
<g transform="translate(${n(e[0])},${n(e[1])}) scale(1.7)">${skull(u, true)}</g>`,
        over: `${fr}${horns(g, [.2, .35, .565, .72], 11)}${[-64, -34, 34, 64].map((a) => spike([c[0] + Math.sin(a * Math.PI / 180) * 5, c[1] + 2], 11, '#aab2b8', a)).join('')}${knot(c, '#3c4146', 11)}${spike(c, 10)}<path d="M${n(c[0] - 10)},${n(c[1] + 2.5)}Q${n(c[0])},${n(c[1] + 6)} ${n(c[0] + 10)},${n(c[1] + 2.500)}" fill="none" stroke="#c9d0d4" stroke-width=".7" opacity=".7"/>`,
      };
    } },
    // unrated: an untried bag of pale raw hide, the rake only sketched
    calibrating: { cond: { sag: .12 }, art: (g, u) => { const c = g.pt(0, 0); return {
      base: '#c9b596', lip: '#8a7858', ring: '#8a7858',
      inside: `${panels(g, ['#d0bd9e', '#bfab8b'])}${seams(g, '#3a2c20', { w: 3, dash: '.9 4.4', op: .6 })}
<g transform="${g.place(0, .29, 1.15)}" fill="none" stroke="#3a332b"><circle r="14" stroke-width="1" stroke-dasharray="2.600 2.200"/><path d="${RAKE}" stroke-width="1" stroke-dasharray="2.200 1.800"/></g>
<path d="${g.lat(.62, -.9, .9)}" fill="none" stroke="#5a5046" stroke-width=".8" stroke-dasharray="3 2.600" opacity=".7"/>${ink2(g.lat(.82), 1.4, '#8a7858', 'stroke-dasharray="3 1.200"')}`,
      over: knot(c, '#a8946e', 7),
    }; } },
    // a player kill: the bag is a face
    pvp: { cond: { taut: .35 }, art: (g, u) => {
      const c = g.pt(0, 0);
      const eyeP = (s) => `<g transform="${g.place(s * .4, .33, 1.1)} scale(${s},1)"><path d="M-12,5L11,-7C14,-2 12,6 6,9C0,11 -8,9 -12,5Z" fill="#120d0b" stroke-width="1"/><path d="M-3,3.500L7,-1.500C8,2 6,5 3,6C0,6.500 -2,5.500 -3,3.500Z" fill="#f0b23a" stroke-width=".6"/><path d="M2.500,.5L3.500,5.500" fill="none" stroke-width="1.300"/></g>`;
      return {
        base: '#9c2118', lip: '#1d1918', ring: '#aab2b8',
        inside: `${panels(g, ['#a3261b', '#8e1e16'])}${seams(g, '#17110d', { op: .6 })}
${eyeP(-1)}${eyeP(1)}
<path d="${g.band(.54, .78, -.93, .93)}" fill="#140e0c" stroke-width="1.200"/>${fangs(g, .54, .65, 9, BONE, -.9, .9)}${fangs(g, .78, .68, 8, '#d2c6a4', -.86, .86)}
${band(g, u, .87, .91, '#3c4146')}`,
        over: `${horns(g, [.16, .3, .44], 10)}${[-40, 40].map((a) => spike([c[0] + Math.sin(a * Math.PI / 180) * 5, c[1] + 2], 10, '#aab2b8', a)).join('')}${knot(c, '#3c4146', 9)}${spike(c, 11)}`,
      };
    } },
    // a level gained: ochre hide, the black mountains, the rake lit
    levelup: { cond: { taut: .6 }, art: (g, u) => {
      const c = g.pt(0, 0), e = g.pt(0, .25);
      const ks = g.along(15, -1, 1); let d = `M${pp(g.pt(-1, .9))}`;
      ks.forEach((k, i) => { d += `L${pp(g.pt(k, i % 2 ? .5 + (i % 4 === 1 ? 0 : .07) : .68))}`; });
      d += `L${pp(g.pt(1, .9))}${g.lat(.9, 1, -1).replace('M', 'L')}Z`;
      const M2 = `translate(${n(e[0])},${n(e[1])}) scale(1.25)`;
      return {
        base: '#a85f24', lip: '#1d1918', ring: BONE,
        inside: `${panels(g, ['#b0662a', '#9a5520'])}${seams(g, '#2a1a10', { op: .6 })}
<path d="${d}" fill="#1d1918" stroke-width="1"/><path d="${g.lat(.9)}" fill="none" stroke="${BONE}" stroke-width="1"/>${studs(g, .945, 11, BONE, 1)}
<path transform="${M2}" d="${RAKE}" fill="none" stroke="#2a1408" stroke-width="5.400"/><path transform="${M2}" d="${RAKE}" fill="none" stroke="#f0a03c" stroke-width="2.800"/>`,
        over: `${knot(c, '#3c4146', 9)}${spike(c, 10)}${spike([c[0] - 4, c[1] + 2], 8, '#8d949b', -36)}${spike([c[0] + 4, c[1] + 2], 8, '#aab2b8', 36)}`,
        html: `<div class="rig-a orc-markg">${S('', -16, n(e[1]) - 18, 32, 36, `<path transform="${M2}" d="${RAKE}" fill="none" stroke="#ffd08a" stroke-width="2.400" stroke-linecap="round"/>`)}</div>`,
      };
    } },
    // a death: let down, shrouded
    death: { cond: { sag: .64, lop: -.14 }, art: (g, u) => {
      const e = g.pt(0, .5);
      const ks = g.along(13, -1, 1); let d = `M${pp(g.pt(-1, 0))}`;
      ks.forEach((k, i) => { d += `L${pp(g.pt(k, .27 + (i % 2 ? .075 : 0) + (i % 3 ? 0 : .03)))}`; });
      d += `L${pp(g.pt(1, 0))}Z`;
      const tail = (s, t, len) => { const p = g.pt(s, t); return `<path d="M${n(p[0] - s * 3)},${n(p[1] - 4)}C${n(p[0] + s * 5)},${n(p[1] + len * .3)} ${n(p[0] - s * 2)},${n(p[1] + len * .6)} ${n(p[0] + s * 3)},${n(p[1] + len)}L${n(p[0] - s * 2)},${n(p[1] + len - 5)}L${n(p[0] - s * 6)},${n(p[1] + len - 1)}C${n(p[0] - s * 4)},${n(p[1] + len * .5)} ${n(p[0] - s * 7)},${n(p[1] + len * .3)} ${n(p[0] - s * 6)},${n(p[1])}Z" fill="#151210" stroke="#000" stroke-width=".9"/>`; };
      return {
        base: '#55524d', lip: '#4a4d50', ring: '#6a6358',
        inside: `${panels(g, ['#5c5954', '#4a4743'])}${seams(g, '#1d1a17', { op: .5 })}${creases(g, [[-.42, .68, .98], [.32, .7, .98], [.72, .44, .7], [-.7, .62, .9], [.06, .78, .98]])}
<g transform="translate(${n(e[0])},${n(e[1] + 3)}) scale(1.1)" opacity=".7">${rake('#6a3028', 3)}</g>
<path d="${d}" fill="#171411" stroke="#000" stroke-width="1"/><path d="${g.lat(.12, -.9, .9)}${g.lat(.21, -.93, .93)}" fill="none" stroke="#5e574d" stroke-width=".7"/>`,
        over: tail(-1, .26, 30) + tail(1, .3, 22),
      };
    } },
    // an achievement: the trophy bag, hung with looted shields
    achievement: { cond: { taut: .8 }, art: (g, u) => {
      const c = g.pt(0, 0);
      const SH = [['#2f4f86', '<path d="M0,-6L1.600,-1.600L6,0L1.600,1.600L0,6L-1.600,1.600L-6,0L-1.600,-1.600Z" fill="#eef2f0" stroke-width=".5"/>'], ['#3f6b3a', '<circle r="3.600" fill="#e0bb55" stroke-width=".6"/><path d="M0,-7.500V7.500M-7.500,0H7.500" fill="none" stroke="#e0bb55" stroke-width=".9"/>'], ['#d9d2bc', '<path d="M-8,-2.500H8V2.500H-8Z" fill="#8e2a22" stroke-width=".5"/>'], ['#7a5a38', '<circle r="3.200" fill="#aab2b8" stroke-width=".7"/><path d="M-8,-4H8M-8,4H8" fill="none" stroke-width=".5" opacity=".7"/>'], ['#5a3f7a', '<path d="M-5,4L0,-6L5,4Z" fill="#e6dcc0" stroke-width=".5"/>']];
      const shields = g.along(5, -.84, .84).map((k, i) => `<g transform="${g.place(k, .56, 1.05)}"><path d="M0,-13V-9.500" fill="none" stroke-width="1"/><circle r="9.500" fill="${SH[i][0]}" stroke-width="1"/>${SH[i][1]}<circle r="9.500" fill="none" stroke="#c9d0d4" stroke-width="1.100" opacity=".8"/><path d="M-9.500,0A9.500,9.500 0 0 0 -3,9L-2.200,6.800A7,7 0 0 1 -7,0Z" fill="${HP(u)}" stroke="none"/><path d="M${i % 2 ? -5 : 3},-7l${i % 2 ? 3 : -2},6l2.500,1.500" fill="none" stroke-width=".9"/></g>`).join('');
      return {
        base: '#3a2f29', lip: IRON, ring: BONE,
        under: pole(g, u, 1, '#3d5f8f', false),
        inside: `${panels(g, ['#43362e', '#332a25'])}${seams(g, '#b79a6e', { op: .55 })}${edge(g)}
${ink2(g.lat(.44), 1.6, '#8a7858', 'stroke-dasharray="3 1.200"')}${shields}${band(g, u, .85, .89, IRON)}
<g transform="${g.place(0, .22, 1.15)}">${rake('#d2382a', 3.4, true)}</g>`,
        over: `${knot(c, IRON, 9)}${spike(c, 9)}`,
      };
    } },
  };

  // ---- the sign: rough tarred planks with iron clamps, on two chains (an achievement is a stretched hide) ----
  
  const PLANK = {
    calibrating: ['#4a3a2b', '#2a1f16', ''], meh: ['#45362a', '#261c14', ''], poor: ['#5b564c', '#35312b', ''],
    good: ['#33261c', '#1a120c', '#9a5526'], great: ['#2b211c', '#150f0b', '#b02a1c'], superb: ['#1f1a19', '#0c0908', '#d2382a'],
    pvp: ['#3a1512', '#1a0907', '#d2382a'], levelup: ['#2b211c', '#150f0b', '#c9772e'], death: ['#1c1917', '#0a0908', ''],
  };
  const board = ({ w, h, hx: HX, mood, u }) => {
    const rings = [w / 2 - HX, w / 2 + HX].map((x) => `<circle cx="${x}" cy="-3.500" r="3" fill="none" stroke="#17120e" stroke-width="2.200"/><circle cx="${x}" cy="-3.500" r="3" fill="none" stroke="#9aa2a8" stroke-width=".9"/>`).join('');
    const clamp = (x) => `<path d="M${x - 4.5},9V-2Q${x},-5 ${x + 4.5},-2V9Z" fill="url(#orI${u})" stroke-width="1"/><circle cx="${x}" cy="5" r="1.300" fill="#c9d0d4" stroke-width=".5"/><circle cx="${x}" cy="-2.200" r="1.500" fill="#170f0a" stroke-width=".6"/>`;
    if (mood === 'achievement') {
      // a hide stretched by thongs
      const out = `M2,3L${w * .2},5L${w * .5},3.500L${w * .8},5L${w - 2},3L${w - 4.5},${h * .3}L${w - 3},${h * .5}L${w - 4.5},${h * .72}L${w - 2},${h - 3}L${w * .78},${h - 4.5}L${w * .5},${h - 3}L${w * .22},${h - 4.5}L2,${h - 3}L4.500,${h * .7}L3,${h * .5}L4.500,${h * .28}Z`;
      return G(u, `<path d="${out}" fill="#dccba2" stroke-width="1.300"/><path d="${out}" fill="none" stroke="#8a6a3c" stroke-width="4" opacity=".22"/><path d="M2,3L${w * .2},5L${w * .22},${h - 4.5}L2,${h - 3}L4.500,${h * .7}L3,${h * .5}L4.500,${h * .28}Z" fill="${HQ(u)}" stroke="none" opacity=".6"/>
<g fill="#3a2616" stroke-width=".4"><circle cx="7" cy="7" r="1.400"/><circle cx="${w - 7}" cy="7" r="1.400"/><circle cx="7" cy="${h - 7}" r="1.400"/><circle cx="${w - 7}" cy="${h - 7}" r="1.400"/></g>${clamp(w / 2 - HX)}${clamp(w / 2 + HX)}`) + rings;
    }
    const [wood, seam, paint] = PLANK[mood] || PLANK.meh, poor = mood === 'poor', a = n(h * .34), b = n(h * .67);
    const out = `M2,1L${w - 1},.8L${w - 3},${a}L${w - .8},${a + 1}L${w - 2},${b}L${w - 3.5},${b + 1}L${w - 1},${h - 1}L1,${h - .8}L3,${b + 1}L.8,${b}L2.500,${a + 1}L1,${a}Z`;
    let teeth = '';
    if (paint) for (let x = 26; x < w - 30; x += 9) teeth += `M${x},1.500l4.500,4.200l4.500,-4.200ZM${x},${h - 1.5}l4.500,-4.200l4.500,4.200Z`;
    return G(u, `<path d="${out}" fill="${wood}" stroke-width="1.300"/>
<path d="M2.500,${a + .5}H${w - 2.5}M2,${b + .5}H${w - 3}" fill="none" stroke="${seam}" stroke-width="1.300"/><path d="M3,${a - .6}H${w - 3}M3,${b - .6}H${w - 3}" fill="none" stroke="#fff" stroke-width=".6" opacity=".12"/>
<path d="M10,${h * .2}h40M${w * .5},${h * .14}h50M22,${h * .52}h60M${w * .6},${h * .5}h44M14,${h * .84}h52M${w * .55},${h * .86}h56" fill="none" stroke="${seam}" stroke-width=".6" opacity=".6"/>
<path d="M2,1L1,${a}L2.500,${a + 1}L.8,${b}L3,${b + 1}L1,${h - .8}L8,${h - 1}V1Z" fill="${HP(u)}" stroke="none"/><path d="M2,${h - 6}H${w * .5}V${h - 1}H1Z" fill="${HQ(u)}" stroke="none" opacity=".7"/>
<path d="M3,2.200H${w - 3}" fill="none" stroke="#c9b08a" stroke-width=".8" opacity=".4"/>
${teeth ? `<path d="${teeth}" fill="${paint}" stroke="none" opacity=".9"/>` : ''}
${poor ? `<path d="M${w - 30},1L${w - 24},${a - 3}L${w - 28},${a}M30,${h - 1}l4,-7" fill="none" stroke-width=".9"/><path d="M${w - 1},.8L${w - 12},1L${w - 3},9Z" fill="#170f0a" stroke-width=".8"/><g stroke="none" fill="#8a4a2a"><ellipse cx="${w * .12}" cy="${h * .8}" rx="12" ry="5" opacity=".35"/><ellipse cx="${w * .8}" cy="${h * .5}" rx="10" ry="4" opacity=".3"/></g>` : ''}
${mood === 'superb' ? `<g transform="translate(${w / 2},1.500) scale(.42)">${skull(u)}</g>` : ''}
<g fill="#8d949b" stroke-width=".5"><circle cx="6" cy="${n(h * .17)}" r="1.300"/><circle cx="${w - 7}" cy="${n(h * .17)}" r="1.300"/><circle cx="6.500" cy="${n(h * .84)}" r="1.300"/><circle cx="${w - 6}" cy="${n(h * .84)}" r="1.300"/></g>
${clamp(w / 2 - HX)}${clamp(w / 2 + HX)}`) + rings;
  };
  // the rating as claw strokes on a tally; a player kill is a red cross
  const pips = (mood) => {
    let s = '';
    if (mood === 'pvp') s = '<path class="orc-red" d="M3,2L15,12M15,2L3,12"/>';
    else for (let i = 0; i < 5; i++) s += `<path class="${i < (RANK[mood] || 0) ? 'orc-on' : 'orc-of'}" d="M${8 + i * 8.5},1.500q-.8,6 -3.600,11"/>`;
    return `<svg xmlns="${NS}" width="${mood === 'pvp' ? 18 : 48}" height="14" viewBox="0 0 ${mood === 'pvp' ? 18 : 48} 14">${s}</svg>`;
  };

  let reduced = false, paceOf = () => 1;

  // ---- the small life in him: blinks, glances, a brow, an ear; one piece of business per mood ----
  const liven = (R) => {
    const q = R.q, qa = R.qa, ck = kit.clock(), later = ck.later, rnd = Math.random;
    const nod = q('.orc-nod'), look = q('.orc-look'), lids = qa('.orc-bl'), pgs = qa('.orc-pg'), brows = [q('.orc-bL'), q('.orc-bR')], ears = qa('.orc-ear');
    const coal = q('.orc-coalg'), ratd = q('.orc-ratd'), dgl = q('.orc-dgl'), dgr = q('.orc-dgr');
    const pw = (cls) => q(`.${cls} .orc-pw`);
    let gaze = [0, 0], ga = [], la = null, hot = true;
    const bob = (el, to, ms, o = {}) => el && el.animate([{ transform: 'none' }, { transform: to, offset: o.at ?? .4 }, { transform: 'none' }], { duration: ms, easing: 'ease-in-out', composite: 'add', ...o });
    const blink = () => {
      const slow = R.mood === 'meh' || R.mood === 'death';
      const go = () => lids.forEach((l) => l.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(9px)', offset: .42 }, { transform: 'translateY(0)' }], { duration: slow ? 650 : 140, easing: 'ease-in-out' }));
      go(); if (!slow && rnd() < .2) later(go, 240);
      later(blink, (slow ? 2600 : 1600) + rnd() * 3600);
    };
    const lookAt = (x, y, ms = 160) => {
      if (reduced) return;
      const from = gaze; gaze = [x, y];
      const old = ga, oldL = la;
      ga = pgs.map((p) => p.animate([{ transform: `translate(${from[0]}px,${from[1]}px)` }, { transform: `translate(${x}px,${y}px)` }], { duration: ms, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'forwards' }));
      la = look.animate([{ transform: `translate(${from[0] * .3}px,${from[1] * .2}px) rotate(${from[0] * .45}deg)` }, { transform: `translate(${x * .3}px,${y * .2}px) rotate(${x * .45}deg)` }], { duration: 480, delay: 40, easing: 'cubic-bezier(.3,.6,.3,1)', fill: 'both' });
      old.forEach((a) => a.cancel()); if (oldL) oldL.cancel();
    };
    const glance = () => {
      if (R.mood !== 'death' && R.root.classList.contains('rig-at') && !R.root.classList.contains('rig-off')) {
        const r = rnd(), p = PROP[R.mood] || [0, 0];
        if (r < .25) lookAt(rnd() - .5, 2);                // down at the sign
        else if (r < .5) lookAt(0, 0);                      // at you
        else if (r < .6) lookAt(rnd() * 1.6 - .8, -2);      // up at the bag
        else if (r < .8) lookAt(p[0], p[1]);                // at what he holds
        else lookAt(rnd() < .5 ? -2.8 : 2.8, -.2);          // a wary look to the side
      }
      later(glance, 900 + rnd() * 2300);
    };
    const twitch = () => {
      const r = rnd();
      if (r < .45) { const i = rnd() < .5 ? 0 : 1; bob(brows[i], 'translateY(-2px)', 320); if (rnd() < .3) bob(brows[1 - i], 'translateY(-1.6px)', 320, { delay: 60 }); }
      else if (r < .75) bob(ears[rnd() < .5 ? 0 : 1], 'rotate(5deg)', 260);
      else bob(nod, 'rotate(1.2deg) translateY(.5px)', 520);     // a grunt
      later(twitch, 2200 + rnd() * 3400);
    };
    if (!reduced) { lookAt(.3, -2, 1); later(blink, 500 + rnd() * 1700); later(glance, 900 + rnd() * 1200); later(twitch, 1500 + rnd() * 2400); }
    const once = (el, kf, o) => !reduced && el && el.animate(kf, o);
    // one small piece of business on arriving, by mood
    const biz = (mood) => {
      if (reduced) return;
      const d = 1 / paceOf(), T = (s) => ({ transform: s });
      const nd = (kf, ms, delay = 0, o = {}) => nod.animate(kf, { duration: ms * d, delay: delay * d, easing: 'ease-in-out', ...o });
      const lift = (cls, to, ms, delay) => once(pw(cls), [T('none'), { ...T(to), offset: .4 }, T('none')], { duration: ms * d, delay: delay * d, easing: 'ease-in-out' });
      if (mood === 'calibrating') { lookAt(2.6, .3); lift('orc-tal', 'translateY(-2.5px) rotate(-3deg)', 800, 300); nd([T('none'), T('rotate(2deg) translateY(.6px)'), T('none')], 700, 700); }
      if (mood === 'poor') { lookAt(2.6, 1.2, 300); nd([T('none'), { ...T('translateY(-1px)'), offset: .3 }, { ...T('translateY(2.5px)'), offset: .7 }, T('translateY(1.5px)')], 1300, 400, { fill: 'forwards' }); later(() => lookAt(0, 1.2, 400), 1700 * d); }
      if (mood === 'meh') { lookAt(1.6, 1.8, 300); nd([T('none'), { ...T('translateY(1.5px) rotate(1deg)'), offset: .6 }, T('translateY(1px) rotate(.6deg)')], 1300, 400, { fill: 'forwards' }); }
      if (mood === 'good') { lookAt(2.6, .4); lift('orc-mea', 'translateY(-3px) rotate(-3deg)', 700, 300); nd([T('none'), { ...T('translateY(2.5px) rotate(1deg)'), offset: .35 }, T('none')], 500, 900); later(() => lookAt(0, 0), 1400 * d); }
      if (mood === 'great') { lookAt(0, 0); lift('orc-hor', 'translateY(-5px) rotate(-7deg)', 950, 300); nd([T('none'), { ...T('translateY(-1.5px) rotate(-1.5deg)'), offset: .4 }, T('none')], 900, 300); }
      if (mood === 'superb') { lookAt(0, 0); lift('orc-sci', 'translateY(-3px) rotate(-2.5deg)', 800, 200); nd([T('none'), { ...T('translateY(-2px) rotate(-1.5deg)'), offset: .3 }, T('none')], 900, 150); later(() => lift('orc-hor', 'translateY(-5px) rotate(-7deg)', 900, 0), 1300 * d); }
      if (mood === 'pvp') { lookAt(0, 0); lift('orc-sci', 'translateY(-2.5px) rotate(3deg)', 600, 250); nd([T('none'), { ...T('translateY(1.5px) scale(1.02)'), offset: .35 }, T('translateY(.6px)')], 700, 250, { fill: 'forwards' }); }
      if (mood === 'levelup') lookAt(0, -.6, 300);
      if (mood === 'achievement') { lookAt(2.6, -.3); lift('orc-hel', 'translateY(-3.5px) rotate(4deg)', 900, 300); later(() => lookAt(0, 0), 1300 * d); }
    };
    const calm = () => nod.getAnimations().forEach((a) => a.cancel());
    return {
      arrive: biz,
      changed(mood) { calm(); biz(mood); },
      struck() { lookAt(0, 2, 140); },
      leave() { if (R.mood !== 'death') lookAt(.3, -2, 260); },
      // every frame: the coals follow burn; what hangs, swings
      frame(i) {
        const b = i.burn;
        coal.style.opacity = (.2 + .8 * b).toFixed(2);
        dgl.style.transform = `rotate(${(i.hang * 1.2 + Math.sin(i.now * .0019) * 1.5).toFixed(2)}deg)`;
        dgr.style.transform = `rotate(${(i.hang + Math.sin(i.now * .0023 + 2) * 1.2).toFixed(2)}deg)`;
        ratd.style.transform = `rotate(${(i.hang * 1.4 + Math.sin(i.now * .0026) * 3).toFixed(2)}deg)`;
        // he looks up at his fire when it roars
        if (b > .62 && !hot) { hot = true; if (R.mood !== 'death') lookAt(.3, -2.2, 220); } else if (b < .35) hot = false;
      },
      stop: ck.stop,
    };
  };

  const lg = (id, a, b, c, v) => `<linearGradient id="${id}" x1="0" ${v ? 'x2="0" y2="1"' : 'x2="1"'}><stop offset="0" stop-color="${a}"/><stop offset=".5" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`;

  Harness.register({
    id: 'orc',
    name: 'The Orc',
    blurb: 'A soldier of the Zaugurz, the orcs of the northern mountains: iron cap, black scale, a notched ear and a mouthful of small bad teeth. His craft is hide, iron and bone, under a cage of coals. The bag says how good the kill was: from a sagging lump of stapled scraps to a war-chief\'s red and black, crowned with spikes under a great horned skull. The news hangs below on tarred planks.',
    create(ctx) {
      reduced = ctx.reduced; paceOf = ctx.pace;
      return Rig.create(ctx, {
        id: 'orc', css: CSS,
        defs: (u) => `${kit.filt('orf' + u, { freq: .03, scale: 2.8, grain: .45 })}${kit.hatch('orp' + u, 38, 5, .6, 1)}${kit.hatch('orq' + u, -52, 5.6, .5, 1)}
<clipPath id="orc${u}"><path d="${ALM}"/></clipPath>
${lg('orS' + u, '#6b563e', '#98805e', '#bfa784')}${lg('orI' + u, '#26292c', '#50565b', '#8a9197')}${lg('orL' + u, '#221a15', '#3a2d24', '#57463a')}${lg('orB' + u, '#a99d7c', '#d8ceac', '#f0e8cc')}
${lg('orW' + u, '#2a1e15', '#4a3828', '#6b5338')}${lg('orH' + u, '#e2d6b2', '#8a7350', '#2c2018')}${lg('orT' + u, '#7f8e9a', '#c3cfd8', '#f2f7f9')}
<pattern id="orm${u}" patternUnits="userSpaceOnUse" width="12" height="9"><path d="M0,1Q0,8 6,8Q12,8 12,1M-6,-3.500Q-6,3.500 0,3.500Q6,3.500 6,-3.500M6,-3.500Q6,3.500 12,3.500Q18,3.500 18,-3.500" fill="none" stroke="#7d848a" stroke-width="1.200" opacity=".75"/></pattern>`,
        envelope: (mood) => ENV[mood] || ENV.calibrating,
        ropes: { kind: 'rope', dark: '#120e0b', light: '#8a7858', w: 1.5 },
        burner,
        basket,
        behind: (u) => `<div class="orc-lift"><div class="orc-br"><div class="orc-look"><div class="orc-nod">${head(u)}${tears()}</div></div></div></div>${props(u)}`,
        front: (u) => `${hands(u)}${dangles(u)}`,
        sign: { w: SW, hx: HX, k: 12, c: 1.7, cord: { kind: 'chain', dark: '#17120e', light: '#8d949b', w: 1.9 }, board, pips },
        life: liven,
      });
    },
  });
})();
