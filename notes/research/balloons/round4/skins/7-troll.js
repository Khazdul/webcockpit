// Round 4, skin 7: "The Troll". A stone-troll, far too large for the basket and
// the balloon that carry him. The rig is a stack of small layers (envelope,
// flame, car, head, arms, sign) that one frame() function moves: the car hangs
// from the envelope on hinged ropes, the sign from the car on two more.
(() => {
  const NS = 'http://www.w3.org/2000/svg', INK = '#23170f', W = 210, H = 258;
  const uri = (s) => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
  const r1 = (n) => +n.toFixed(1);
  const P = `stroke="${INK}" stroke-linejoin="round" stroke-linecap="round"`;
  const S = (cls, body) => `<svg class="troll-s ${cls}" xmlns="${NS}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
  const G = (body, tr) => `<g filter="url(#troll-f)" ${P}${tr ? ` transform="${tr}"` : ''}>${body}</g>`;
  const N = (body, tr) => `<g ${P}${tr ? ` transform="${tr}"` : ''}>${body}</g>`;
  const HEADAT = 'translate(105,165)';
  const rope = (d, w = 3.4) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}"/><path d="${d}" fill="none" stroke="#cbbb8e" stroke-width="${r1(w * .52)}" stroke-dasharray="2.8 2.2"/>`;
  const DARK = '#241c12';

  // ---- moods: face, arm, colours ----
  const DEF = { bly: 0, blr: 0, bry: 0, brr: 0, lid: 1.2, low: 0, px: 0, py: 0 };
  const M = {
    calibrating: { bly: -4, blr: -9, bry: 1.5, brr: 3, lid: 1.4, px: -2.4, py: -.8, hr: -2, mo: 'mumble', ar: 6, hrot: 4, f: [1, 1, 0], th: 0, e: ['#cfc3a2', '#c2b592', '#a89a7c'], hc: ['#b9ad90', '#a99c80'], acc: '#5a5346' },
    poor: { bly: 1, blr: -13, bry: 1, brr: 13, lid: 2.6, px: -2, py: 1.3, hd: 7, hr: -3, mo: 'down', ar: 8, hrot: 6, f: [0, 0, .8], th: .9, e: ['#6d7a87', '#5e6b78', '#8d928d'], hc: ['#7c868e', '#7c868e'], acc: '#4d6070', pop: 1 },
    meh: { bly: 2, bry: 2.2, blr: 2, brr: -3, lid: 3.3, px: 1.8, py: -1.2, hd: 1, hr: 3, mo: 'flat', ar: 12, hrot: 64, f: [0, 0, 1], th: 0, e: ['#9c8c5e', '#8b7c51', '#b3a67c'], hc: ['#8d8567', '#968a60'], acc: '#75653a' },
    good: { bly: -1, bry: -1, lid: 1.3, low: 1, mo: 'smile', ar: 2, hrot: 0, f: [0, 0, 0], th: .5, e: ['#6f8b4d', '#5e7a41', '#a9ab72'], hc: ['#8c9c57', '#7d905b'], acc: '#47672a', top: 16 },
    great: { bly: -3.5, bry: -3.5, blr: -4, brr: 4, lid: .6, low: 2.2, mo: 'grin', ar: -8, hrot: -6, f: [0, 0, 0], th: .5, e: ['#d39c3c', '#bd862e', '#e6c888'], hc: ['#c96a3c', '#dcb84e'], acc: '#a4611a' },
    superb: { bly: -5.5, bry: -6, blr: -8, brr: 8, lid: -.6, low: 1, hr: -3, mo: 'grin', ar: 57, hrot: -55, f: [0, 0, 0], th: .5, e: ['#b33c31', '#e2c474', '#d9cdb0'], hc: ['#3f7f86', '#dcb84e'], acc: '#a12b21' },
    pvp: { bly: 3.2, bry: 3.4, blr: 15, brr: -15, lid: 2.4, low: 1.6, hd: 4, mo: 'growl', ar: -4, hrot: -4, f: [0, 0, 0], th: .5, e: ['#3b3c41', '#2d2e32', '#5a2a26'], hc: ['#4b4c51', '#4b4c51'], acc: '#8f1d16', top: 18 },
    levelup: { bly: -3, bry: -2, blr: -5, brr: 3, lid: .8, px: -1.8, py: -1, mo: 'smile', ar: -2, hrot: 0, f: [1, 1, 0], th: 0, e: ['#34497a', '#2b3d69', '#c9a544'], hc: ['#dcb84e', '#dcb84e'], acc: '#8a5d12', top: 12 },
    death: { bly: -5.5, bry: -5.5, blr: -10, brr: 10, lid: -1.5, py: -2, mo: 'o', ar: -10, hrot: -12, f: [1, 1, 1], th: 1, e: ['#9b9b97', '#8b8b87', '#77777a'], hc: ['#8f8f8c', '#8f8f8c'], acc: '#d9d6c8' },
    achievement: { bly: -2, bry: -2, blr: -6, brr: 6, lid: 3, hd: -2, mo: 'flat', ar: 0, hrot: 0, f: [1, 1, 1], th: 1, e: ['#6b406b', '#5b345a', '#b08a45'], hc: ['#b08a45', '#b08a45'], acc: '#6a4a14' },
  };
  const MOS = ['flat', 'smile', 'down', 'grin', 'growl', 'o', 'mumble'];
  const RANK = { poor: 1, meh: 2, good: 3, great: 4, superb: 5 };
  const vars = (o) => Object.keys(DEF).filter((k) => k in o).map((k) => `--${k}:${o[k]}`).join(';');

  const plank = (c, d, l) => uri(`<svg xmlns='${NS}' width='72' height='72'><path d='M3,4L22,2.500L48,4L69,2.500L70.500,22L69,48L70,69L48,70.500L24,69L2.500,70L4,48L2,24Z' fill='${c}' stroke='${INK}' stroke-width='1.5' stroke-linejoin='round'/><path d='M5,7H67M6,11H30M40,10H66M5,61H66M8,65H44M52,66H66' stroke='${d}' stroke-width='.7' opacity='.5'/><path d='M4,5.500L68,4.500' stroke='${l}' stroke-width='1.1' opacity='.8'/><path d='M4,67.500H68' stroke='${d}' stroke-width='1.4' opacity='.6'/><path d='M3,30l7,2l-7,3M69,40l-6,1.500l6,2' fill='none' stroke='${INK}' stroke-width='.7'/></svg>`.replace(/(\d)\.500/g, '$1.5'));
  const PLANK = plank('#cfbd95', '#6b5230', '#f1e6c4'), SLAB = plank('#33363a', '#0b0c0e', '#727880');

  Harness.css('troll', `
.troll-v{position:relative;width:${W}px;padding-top:calc(var(--top,0)*1px);${vars(DEF)};--ar:0;--hrot:0}
${Object.keys(M).map((m) => `.troll-v[data-mood=${m}]{${vars(M[m])}}`).join('\n')}
.troll-pre[data-mood=pvp],.troll-pre[data-mood=death]{--bly:0;--blr:0;--bry:0;--brr:0;--lid:1.2;--low:0}
.troll-box{position:relative;width:${W}px;height:${H}px}
.troll-s{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}
.troll-s *{transform-box:view-box}
.troll-sag,.troll-env,.troll-car,.troll-head,.troll-nod,.troll-arm,.troll-hp,.troll-fx{position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none}
.troll-L{will-change:transform}
.troll-env{transform-origin:105px 112px}
.troll-car{transform-origin:105px 100px}
.troll-head,.troll-nod{transform-origin:105px 202px}
.troll-hpL{transform-origin:55px 205px}.troll-hpR{transform-origin:155px 205px}
.troll-hpL{--h:var(--hl)}.troll-hpR{--h:var(--hr2)}
.troll-armL{transform-origin:28px 213px;transform:rotate(calc(var(--ar)*1deg));transition:transform .9s cubic-bezier(.4,0,.2,1)}
.troll-hand{transform:translate(26px,167px) rotate(calc(var(--hrot)*1deg));transition:transform .9s cubic-bezier(.4,0,.2,1)}
.troll-fg{transform:scaleY(calc(.34 + .66*var(--e,0)));transition:transform .5s cubic-bezier(.3,1.3,.5,1)}
.troll-v[data-sky=night] .troll-env,.troll-v[data-sky=night] .troll-car{filter:drop-shadow(0 0 .7px rgba(255,232,190,.55))}
.troll-v[data-sky=dusk] .troll-env,.troll-v[data-sky=dusk] .troll-car{filter:drop-shadow(0 0 .6px rgba(255,226,190,.3))}
.troll-bL{transform:translateY(calc(var(--bly)*1px)) rotate(calc(var(--blr)*1deg))}
.troll-bR{transform:translateY(calc(var(--bry)*1px)) rotate(calc(var(--brr)*1deg))}
.troll-bw{transition:transform .9s cubic-bezier(.45,0,.3,1) .28s}
.troll-v[data-mood=death] .troll-bw{transition:transform .2s ease-out}
.troll-pm{transform:translate(calc(var(--px)*1px),calc(var(--py)*1px));transition:transform .6s}
.troll-pg{transform:translate(calc(var(--gx,0)*1px),calc(var(--gy,0)*1px));transition:transform .4s ease-out,opacity .2s}
.troll-lid{transform:translateY(calc(var(--lid)*1px));transition:transform .6s;fill:#8b8e79;stroke:${INK};stroke-width:.8}
.troll-low{transform:translateY(calc(var(--low)*-1px));transition:transform .6s;fill:#9a9c86;stroke:${INK};stroke-width:.6}
.troll-mo{opacity:0;transition:opacity .3s}
${MOS.map((m) => `.troll-v[data-mo=${m}] .troll-mo-${m}`).join(',')}{opacity:1}
.troll-mum{animation:troll-mum 1.5s ease-in-out infinite}
.troll-rim{transition:d .7s cubic-bezier(.3,1.4,.5,1)}
.troll-v[data-rim] .troll-rim{d:path("M47,202Q105,222 163,202L163.5,208.5Q105,228.5 46.5,208.5Z")}
.troll-v[data-rim] .troll-rim2{d:path("M48,205.3Q105,225.3 162,205.3")}
.troll-rim2{transition:d .7s cubic-bezier(.3,1.4,.5,1)}
.troll-fl{transform-origin:105px 115px}
.troll-fk{transform-origin:105px 115px;animation:troll-fk .5s ease-in-out infinite alternate}
.troll-f1{fill:#e79a32;opacity:.92}.troll-f2{fill:#fff1c0}
.troll-v[data-sky=day] .troll-glow{opacity:.2}.troll-v[data-sky=overcast] .troll-glow{opacity:.45}
.troll-stone .troll-f1{fill:#5f9bd0}.troll-stone .troll-f2{fill:#dff1ff}.troll-stone .troll-glow{opacity:.12}
.troll-stone .troll-pet{filter:grayscale(1) brightness(1.22) contrast(.8)}
.troll-stone .troll-pg{opacity:0}
.troll-crk{opacity:0}.troll-stone .troll-crk{opacity:1}
.troll-slot>*{animation:troll-in .4s ease-out both}
.troll-bob{transform-origin:var(--o);animation:troll-bob calc(2.3s + var(--d)*.41s) ease-in-out infinite alternate}
.troll-sway{transform-origin:var(--o);animation:troll-bob 3.7s ease-in-out infinite alternate;--d:0}
.troll-wave{transform-origin:105px -8px;animation:troll-wave 1.3s ease-in-out infinite alternate}
.troll-rain{animation:troll-rain .5s linear infinite}
.troll-chew{animation:troll-chew 1.1s ease-in-out infinite}
.troll-blow{transform-origin:-14px -2px;animation:troll-blow 2.8s ease-in-out infinite}
.troll-hop{animation:troll-hop 1.4s ease-in-out infinite}
.troll-peck{animation:troll-peck 3.1s ease-in-out infinite}
.troll-twk{transform-origin:105px -3px;animation:troll-twk 2.4s ease-in-out infinite alternate}
.troll-v[data-mood=meh] .troll-hp svg{transform:translateY(16px) scale(.8);transform-origin:105px 205px}
.troll-v[data-mood=meh] .troll-hw{animation:troll-pick 1.7s ease-in-out infinite}
.troll-v[data-mood=poor] .troll-dangle{transform-origin:25px -9px;animation:troll-bob 1.9s ease-in-out infinite alternate;--d:0}
.troll-conf{position:absolute;left:0;top:-20px;width:${W}px;height:0}
.troll-conf i{position:absolute;top:0;width:4px;height:6px;opacity:0;animation:troll-conf var(--t) linear var(--w) infinite}
.troll-boot{position:absolute;left:164px;top:210px}
.troll-flash{position:absolute;left:-40px;top:60px;width:290px;height:230px;border-radius:50%;background:radial-gradient(closest-side,rgba(255,244,200,.95),rgba(255,226,150,.5) 45%,rgba(255,220,140,0));opacity:0;pointer-events:none}
@keyframes troll-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
@keyframes troll-fk{from{transform:scale(1,1) skewX(-3deg)}to{transform:scale(.9,1.1) skewX(4deg)}}
@keyframes troll-mum{0%,100%{transform:translateY(31px) scale(1,.3) translateY(-31px)}18%{transform:translateY(31px) scale(.8,1.3) translateY(-31px)}36%{transform:translateY(31px) scale(1.1,.5) translateY(-31px)}55%{transform:translateY(31px) scale(.7,1.5) translateY(-31px)}75%{transform:translateY(31px) scale(1,.8) translateY(-31px)}}
@keyframes troll-bob{from{transform:rotate(calc(-5deg - var(--d)*.6deg))}to{transform:rotate(calc(4deg + var(--d)*.5deg))}}
@keyframes troll-wave{from{transform:skewY(-9deg) scaleX(.94)}to{transform:skewY(8deg)}}
@keyframes troll-rain{to{stroke-dashoffset:-11}}
@keyframes troll-chew{0%,100%{transform:none}50%{transform:translate(.6px,1.3px)}}
@keyframes troll-blow{0%,12%,100%{transform:scaleX(.3)}20%,34%{transform:scaleX(1.06)}40%,74%{transform:scaleX(1)}86%{transform:scaleX(.3)}}
@keyframes troll-hop{0%,40%,100%{transform:none}12%{transform:translateY(-5px) rotate(-8deg)}24%{transform:none}32%{transform:translateY(-3px)}}
@keyframes troll-peck{0%,60%,72%,84%,100%{transform:none}66%,78%{transform:rotate(24deg) translateY(1px)}}
@keyframes troll-twk{from{transform:rotate(-7deg) scale(.94)}to{transform:rotate(7deg) scale(1.05)}}
@keyframes troll-pick{0%,100%{transform:none}30%{transform:rotate(-7deg) translateY(-1px)}60%{transform:rotate(5deg)}}
@keyframes troll-conf{0%{transform:translate(0,0) rotate(0);opacity:0}8%{opacity:.95}85%{opacity:.9}100%{transform:translate(var(--dx),300px) rotate(540deg);opacity:0}}
.troll-sign{position:relative;width:156px;margin:2px auto 0;text-align:center;color:#2a1c10;--dim:#5d4a33;filter:drop-shadow(0 3px 3px rgba(0,0,0,.45));will-change:transform}
.troll-plank{position:relative;box-sizing:border-box;min-height:54px;padding:5px 2px 2px;border:9px solid transparent;border-image:${PLANK} 13 fill/9px stretch}
.troll-plank::before{content:"";position:absolute;inset:-6px;pointer-events:none;border-radius:3px;background:repeating-linear-gradient(177deg,transparent 0 5px,rgba(70,45,20,.1) 5px 6px),linear-gradient(rgba(20,12,4,.36),transparent 15px)}
.troll-plank>*{position:relative}
.troll-hole{position:absolute;top:5px;width:7px;height:7px;border-radius:50%;background:#140d07;box-shadow:0 .7px 0 rgba(255,240,200,.55)}
.troll-hole::after{content:"";position:absolute;left:.5px;top:-2px;width:6px;height:6px;border-radius:45%;background:#bfae80;border:1px solid ${INK};box-sizing:border-box}
.troll-title{font:italic 400 15.5px/1.08 "IM Fell English",Georgia,serif;text-wrap:balance;overflow-wrap:anywhere;padding:0 6px}
.troll-rule{display:block;height:0;width:86px;margin:3px auto 0;border-top:1.5px solid var(--acc);opacity:.75;border-radius:50%}
.troll-fig{font:600 28px/1 "Cormorant Garamond",Georgia,serif;font-variant-numeric:lining-nums;white-space:nowrap;margin-top:1px}
.troll-unit{font:italic 500 16px/1 "Cormorant Garamond",Georgia,serif;margin-left:4px;color:var(--dim)}
.troll-rate{display:flex;justify-content:center;align-items:center;gap:6px;margin-top:2px;min-height:16px}
.troll-mk{display:block;overflow:visible}
.troll-on{fill:var(--acc);stroke:${INK};stroke-width:.8}
.troll-off{fill:none;stroke:${INK};stroke-width:.7;opacity:.32;stroke-dasharray:1.5 1.5}
.troll-word{font:400 14px/1 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.14em;margin-right:-.14em;color:var(--acc)}
.troll-q{font:italic 400 17px/1 "IM Fell English",Georgia,serif;color:var(--dim)}
.troll-more{font:italic 500 13px/1.1 "Cormorant Garamond",Georgia,serif;color:var(--dim);margin-top:3px;text-wrap:balance}
.troll-tag{font:400 11.5px/1.3 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.24em;margin-right:-.24em;text-transform:uppercase;color:var(--acc)}
.troll-sign[data-mood=superb] .troll-fig{color:#8e2219}
.troll-sign[data-mood=pvp] .troll-fig{color:#7c1811}
.troll-sign[data-kind=levelup] .troll-plank{padding:13px 2px 11px}
.troll-sign[data-kind=levelup] .troll-fig{font-size:27px;color:#5d3d08}
.troll-sign[data-kind=death]{color:#dedbcd}
.troll-sign[data-kind=death] .troll-plank{border-image-source:${SLAB};padding:14px 2px 12px}
.troll-sign[data-kind=death] .troll-plank::before{background:linear-gradient(rgba(0,0,0,.4),transparent 15px)}
.troll-sign[data-kind=death] .troll-fig{font:400 23px/1.2 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.16em;margin-right:-.16em;text-transform:lowercase;font-variant:small-caps}
.troll-sign[data-kind=achievement] .troll-title{font:italic 600 13.5px/1.1 "Cormorant Garamond",Georgia,serif;padding:0 2px}
.troll-rm *,.troll-rm *::before{animation:none!important;transition:none!important}
`);

  // ---- shared defs: pen wobble + grainy wash, hatching, stone and wicker ----
  const DEFS = `<svg id="troll-defs" xmlns="${NS}" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<filter id="troll-f" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.9" xChannelSelector="R" yChannelSelector="G" result="d"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .16 0 0 0 0 .09 0 0 0 0 .04 1.5 0 0 0 -.7" result="b"/><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="11"/><feColorMatrix type="matrix" values="0 0 0 0 .14 0 0 0 0 .08 0 0 0 0 .04 0 1.2 0 0 -.56" result="g"/><feMerge result="m"><feMergeNode in="b"/><feMergeNode in="g"/></feMerge><feComposite in="m" in2="d" operator="in" result="mc"/><feMerge><feMergeNode in="d"/><feMergeNode in="mc"/></feMerge></filter>
<pattern id="troll-h1" patternUnits="userSpaceOnUse" width="3" height="3" patternTransform="rotate(38)"><path d="M0,.5H3" stroke="${INK}" stroke-width=".55" opacity=".6"/></pattern>
<pattern id="troll-h2" patternUnits="userSpaceOnUse" width="3.4" height="3.4" patternTransform="rotate(-52)"><path d="M0,.5H3.4" stroke="${INK}" stroke-width=".55" opacity=".5"/></pattern>
<pattern id="troll-wv" patternUnits="userSpaceOnUse" width="9" height="8"><path d="M0,2q2.2,-2 4.5,0t4.5,0M0,6q2.2,2 4.5,0t4.5,0" fill="none" stroke="${INK}" stroke-width=".6" opacity=".7"/><path d="M2.2,0v8M6.700,0v8" stroke="${INK}" stroke-width=".5" opacity=".28"/></pattern>
<linearGradient id="troll-st" x1="0" x2="1" y1="0" y2=".2"><stop offset="0" stop-color="#6a6f61"/><stop offset=".55" stop-color="#999c87"/><stop offset="1" stop-color="#c2c1a8"/></linearGradient>
<linearGradient id="troll-wk" x1="0" x2="1"><stop offset="0" stop-color="#6e5130"/><stop offset=".6" stop-color="#a98450"/><stop offset="1" stop-color="#c6a468"/></linearGradient>
<radialGradient id="troll-gl"><stop offset="0" stop-color="#ffd58a" stop-opacity=".8"/><stop offset="1" stop-color="#ffb050" stop-opacity="0"/></radialGradient>
<clipPath id="troll-ec"><path d="M-8,0Q0,-6.500 8,0Q0,5 -8,0Z"/></clipPath></defs></svg>`;

  // ---- the envelope: one patched main balloon, stretched ----
  const mer = (k) => `C${r1(105 + 42 * k)},2 ${r1(105 + 71 * k)},26 ${r1(105 + 71 * k)},54C${r1(105 + 71 * k)},80 ${r1(105 + 33 * k)},96 ${r1(105 + 14 * k)},110`;
  const rem = (k) => `C${r1(105 + 33 * k)},96 ${r1(105 + 71 * k)},80 ${r1(105 + 71 * k)},54C${r1(105 + 71 * k)},26 ${r1(105 + 42 * k)},2 105,2`;
  const gore = (a, b) => `M105,2${mer(b)}L${r1(105 + 14 * a)},110${rem(a)}Z`;
  const KS = [-1, -.9, -.63, -.22, .22, .63, .9, 1];
  const UNDER = 'M38,69Q105,103 172,69C166,87 137,97 119,110L91,110C73,97 44,87 38,69Z';
  const ENV = S('troll-envs', G(
    KS.slice(0, 7).map((k, i) => `<path d="${gore(k, KS[i + 1])}" style="fill:var(--e${i % 2 ? 2 : 1})" stroke-width=".6"/>`).join('')
    + `<path d="${gore(-1, -.5)}" fill="#1c120a" opacity=".24" stroke="none"/><path d="${gore(-1, -.78)}" fill="url(#troll-h1)" stroke="none"/>
<path d="${UNDER}" fill="#1c120a" opacity=".22" stroke="none"/><path d="${UNDER}" fill="url(#troll-h2)" opacity=".6" stroke="none"/>
<path d="M118,28l21,3l-3,18l-20,-4Z" style="fill:var(--e3)" stroke-width=".8"/><path d="M120.5,30.8l15.8,2.3l-2.2,13l-15,-3Z" fill="none" stroke-width=".6" stroke-dasharray="1.6 1.8"/>
<path d="M60,46l16,-4l5,14l-17,5Z" style="fill:var(--e3)" stroke-width=".8"/><path d="M62.6,47.8l11.8,-3l3.6,10l-12.400,3.7Z" fill="none" stroke-width=".6" stroke-dasharray="1.6 1.8"/>
<path d="M88,14l12,1l-1,9l-12,-2Z" fill="#cbbf9f" opacity=".8" stroke-width=".7"/><path d="M146,62l10,-2l2,9l-10,3Z" fill="#8a7a5c" opacity=".7" stroke-width=".7"/>
<path d="${gore(-1, 1)}" fill="none" stroke-width="1.4"/>
<path d="M149,20C162,30 168,43 168,56" fill="none" stroke="#fff" stroke-width="2.2" opacity=".26"/>
${rope('M38,69Q105,103 172,69')}
<path d="M44,61l5,-9M52,69l4,-10M61,76l3,-10M166,61l-5,-9M158,69l-4,-10M149,76l-3,-10M96,105l-3,-9M114,105l3,-9M105,107v-10" fill="none" stroke-width=".6" opacity=".7"/>
<path d="M90,108Q105,113 120,108L119,112.5Q105,117 91,112.500Z" fill="#3a2c1c" stroke-width="1"/>
<path d="M94,113L99,117M116,113L111,117" fill="none" stroke-width="1"/><path d="M98,116h14l-1.5,6h-11Z" fill="#4a4f55" stroke-width="1"/><path d="M100,117.500h8" stroke="#aab3ba" stroke-width=".7" opacity=".7"/>`.replace(/(\d)\.500/g, '$1.5')));
  const FLAME = S('troll-L', `<g class="troll-fl"><circle class="troll-glow" cx="105" cy="92" r="36" fill="url(#troll-gl)"/><g class="troll-fk"><path class="troll-f1" d="M105,116C93,104 98,90 105,76C112,90 117,104 105,116Z"/><path class="troll-f2" d="M105,116C99,108 101,99 105,91C109,99 111,108 105,116Z"/></g></g>`);
  const helper = (cx, cy, ax, ay) => S('', G(`<path d="M${cx},${cy + 23}L${ax},${ay}" fill="none" stroke-width=".9"/>
<path d="M${cx},${cy - 20}C${cx + 17},${cy - 20} ${cx + 21},${cy - 2} ${cx + 12},${cy + 11}C${cx + 7},${cy + 18} ${cx + 3},${cy + 19} ${cx},${cy + 21}C${cx - 3},${cy + 19} ${cx - 7},${cy + 18} ${cx - 12},${cy + 11}C${cx - 21},${cy - 2} ${cx - 17},${cy - 20} ${cx},${cy - 20}Z" style="fill:var(--h)" stroke-width="1.1"/>
<path d="M${cx},${cy - 20}C${cx - 17},${cy - 20} ${cx - 21},${cy - 2} ${cx - 12},${cy + 11}C${cx - 7},${cy + 18} ${cx - 3},${cy + 19} ${cx},${cy + 21}C${cx - 8},${cy + 10} ${cx - 9},${cy - 8} ${cx},${cy - 20}Z" fill="#1c120a" opacity=".24" stroke="none"/>
<path d="M${cx},${cy - 20}C${cx - 17},${cy - 20} ${cx - 21},${cy - 2} ${cx - 12},${cy + 11}C${cx - 16},${cy} ${cx - 13},${cy - 12} ${cx - 5},${cy - 19}Z" fill="url(#troll-h1)" stroke="none"/>
<path d="M${cx + 7},${cy - 13}C${cx + 12},${cy - 8} ${cx + 13},${cy - 2} ${cx + 11},${cy + 4}" fill="none" stroke="#fff" stroke-width="1.6" opacity=".3"/>
<path d="M${cx + 2},${cy - 4}l8,1l-1,7l-8,-1Z" fill="#cbbf9f" opacity=".75" stroke-width=".6"/>
<path d="M${cx - 3},${cy + 20}h6l1.5,4h-9Z" fill="#6b5230" stroke-width=".8"/>`));

  // ---- shoulders and the basket ----
  const BASKET = 'M51,206C44,218 47,235 56,241L154,241C163,235 166,218 159,206Z';
  const BODY = S('', '<g class="troll-pet">' + G(`<path d="M22,210C18,190 32,174 56,170C80,165 130,165 154,170C178,174 192,190 188,210Z" fill="url(#troll-st)" stroke-width="1.2"/>
<path d="M22,210C18,190 32,174 56,170L66,169C46,178 38,192 40,210Z" fill="${DARK}" opacity=".26" stroke="none"/><path d="M22,210C18,190 32,174 56,170C40,180 32,194 32,210Z" fill="url(#troll-h1)" stroke="none"/>
<path d="M160,172C172,177 180,188 181,201" fill="none" stroke="#f1ead2" stroke-width="1.1" opacity=".5"/><path d="M166,182l5,7l-3,6M36,186l6,5M176,196l-5,6" fill="none" stroke-width=".6" opacity=".8"/>`) + '</g>'
    + G(`<path d="${BASKET}" fill="url(#troll-wk)" stroke-width="1.3"/><path d="${BASKET}" fill="url(#troll-wv)" stroke="none"/>
<path d="M51,206C44,218 47,235 56,241L74,241C62,233 60,218 65,206Z" fill="${DARK}" opacity=".3" stroke="none"/>
<path d="M56,241L154,241C158,238 161,234 162,229Q105,238 48,229C50,234 52,238 56,241Z" fill="${DARK}" opacity=".24" stroke="none"/>
<path d="M150,210C155,218 155,230 149,238" fill="none" stroke="#f3e2b8" stroke-width="1.2" opacity=".45"/>
<path d="M161,214l7,-3M162,221l8,0M48,223l-7,-2M49,216l-6,-4M160,229l6,3" fill="none" stroke="#8a6a3c" stroke-width="1.1"/>
<path d="M82,207l14,1.5l-2.500,33l-14,-1.5Z" fill="#c9b283" stroke-width="1"/><path d="M86,210l-2,28M91,211l-2,27" fill="none" stroke-width=".5" opacity=".6"/><circle cx="88.500" cy="213" r="1.2" fill="#3a3d42" stroke="none"/><circle cx="86.500" cy="236" r="1.2" fill="#3a3d42" stroke="none"/><circle cx="92" cy="225" r="1.2" fill="#3a3d42" stroke="none"/>
${rope('M47,218Q105,227 163,218', 3.2)}${rope('M50,232Q105,240 160,232', 3.2)}
<path d="M148,221c5,-3 9,1 6,5c-2,3 -7,2 -6,-5ZM153,226c3,5 0,9 2,14M150,226c-2,4 -1,8 -4,11" fill="#cbbb8e" stroke-width=".9"/>
<path class="troll-rim" d="M47,202Q105,207 163,202L163.500,208.500Q105,213.500 46.500,208.500Z" fill="#b8935a" stroke-width="1.2"/>
<path class="troll-rim2" d="M48,205.3Q105,210.3 162,205.3" fill="none" stroke-width="5" stroke-dasharray=".9 3.6" stroke-linecap="butt" opacity=".45"/>
<path d="M57,241l-2,2.500M153,241l2,2.500" fill="none" stroke-width="1.6"/><circle cx="55" cy="246" r="2.800" fill="none" stroke="#2c2f33" stroke-width="1.8"/><circle cx="155" cy="246" r="2.800" fill="none" stroke="#2c2f33" stroke-width="1.8"/>`).replace(/(\d)\.500/g, '$1.5').replace(/2\.800/g, '2.8'));

  // ---- the head: a boulder with a brow ledge ----
  const HD = 'M-36,-38L-24,-41L-6,-39L10,-42L30,-38C40,-34 46,-26 48,-16L52,-6C54,4 53,12 56,20C58,28 54,34 46,37L28,40L4,39L-24,41L-44,37C-54,34 -58,27 -56,19C-53,11 -55,3 -52,-7L-49,-17C-46,-27 -42,-34 -36,-38Z';
  const HEAD = S('troll-pet', G(`
<path d="M-48,-11C-58,-19 -66,-9 -63,4C-61,12 -54,15 -48,11Z" fill="#7f8270" stroke-width="1.1"/><path d="M-55,-7C-60,-3 -59,5 -54,8" fill="none" stroke-width=".7"/>
<path d="M48,-11C58,-19 66,-9 63,4C61,12 54,15 48,11Z" fill="#b3b39c" stroke-width="1.1"/><path d="M55,-7C60,-3 59,5 54,8" fill="none" stroke-width=".7"/>
<path d="${HD}" fill="url(#troll-st)" stroke-width="1.3"/>
<path d="M-36,-38C-42,-34 -46,-27 -49,-17L-52,-7C-55,3 -53,11 -56,19C-58,27 -54,34 -44,37L-28,40C-40,24 -42,-12 -24,-41Z" fill="${DARK}" opacity=".24" stroke="none"/>
<path d="M-36,-38C-42,-34 -46,-27 -49,-17L-52,-7C-55,3 -53,11 -56,19C-58,27 -54,34 -44,37L-40,38C-48,22 -48,-10 -32,-39Z" fill="url(#troll-h1)" stroke="none"/>
<path d="M-6,-39L10,-42L30,-38C36,-35.5 40,-32 43,-28L24,-27L4,-30Z" fill="#f4eed6" opacity=".2" stroke="none"/>
<path d="M-49,-12Q0,-5 49,-12L50,5Q0,11 -51,5Z" fill="${DARK}" opacity=".2" stroke="none"/><path d="M-49,-12Q0,-5 49,-12L50,3Q0,9 -51,3Z" fill="url(#troll-h2)" stroke="none"/>
<ellipse cx="-21" cy="1" rx="11.500" ry="8" fill="#1e170f" opacity=".38" stroke="none"/><ellipse cx="21" cy="1" rx="11.500" ry="8" fill="#1e170f" opacity=".3" stroke="none"/>
<path d="M-55,24Q0,32 56,22C57,29 53,34.500 46,37L28,40L4,39L-24,41L-44,37C-52,34.500 -57,30 -55,24Z" fill="${DARK}" opacity=".17" stroke="none"/>
<path d="M-20,15C-29,18 -35,23 -37,30M20,15C29,18 35,23 37,30" fill="none" stroke-width=".8" opacity=".85"/>
<path d="M-20,-40l4,9l-3,6M22,-40l-3,8l5,5l-2,5M-50,10l8,3l4,7M50,14l-7,4l-2,7M-12,39l3,-5M34,27l-5,6M-40,-22l6,4M40,-20l-5,2l-1,5M-45,24l5,-3" fill="none" stroke-width=".6" opacity=".75"/>
<path d="M32,-37C41,-33 46,-25.500 48,-16L52,-6C53.500,2 53,10 55,17" fill="none" stroke="#f6f0d8" stroke-width="1.2" opacity=".55"/>
<ellipse cx="-36" cy="-24" rx="7" ry="4" fill="#b0a85c" opacity=".55" stroke="none"/><ellipse cx="38" cy="24" rx="6" ry="3.500" fill="#9aa05a" opacity=".5" stroke="none"/><ellipse cx="34" cy="-30" rx="4" ry="2.500" fill="#c29a50" opacity=".5" stroke="none"/>
<path d="M-38,-25l1,0M-34,-23l1,0M-37,-22l1,0M37,23l1,0M40,25l1,0" fill="none" stroke="#e3dc9a" stroke-width="1"/>
<path d="M-35,-37C-31,-44 -19,-45 -11,-40C-15,-36 -28,-33 -35,-37Z" fill="#5f7346" stroke-width=".9"/><path d="M-30,-39q3,-3 6,-1M-23,-40q3,-2 6,0" fill="none" stroke="#a9b77c" stroke-width=".8"/>
<path d="M13,-39C15,-48 39,-48 41,-39C39,-33 15,-33 13,-39Z" fill="#8a6b3c" stroke-width=".9"/><path d="M11,-40l9,-5M17,-35l11,-10M25,-34l11,-9M35,-35l8,-7M14,-44l-4,-2M40,-44l4,-3M20,-45l12,8M30,-45l9,6" fill="none" stroke-width=".6" opacity=".85"/><path d="M15,-41l8,-4M28,-38l8,-5" fill="none" stroke="#d9c592" stroke-width=".8"/>
<path d="M-6,-10C-8,-2 -16,3 -17,11C-18,19 -10,23 -2,21C0,22.500 2,22.500 3,21C11,23 19,19 17,11C16,3 8,-2 6,-10Z" fill="#a9aa94" stroke-width="1.2"/>
<path d="M-17,11C-22,12 -22,20 -15,20.500M17,11C22,12 22,20 15,20.500" fill="#96987f" stroke-width="1"/>
<path d="M-6,-10C-8,-2 -16,3 -17,11C-18,19 -10,23 -4,21.500C-10,16 -9,6 -2,-4Z" fill="url(#troll-h1)" stroke="none"/>
<ellipse cx="6" cy="8" rx="4" ry="6" fill="#f3edd4" opacity=".4" stroke="none"/>
<path d="M-11,19q3.500,2.200 7,.3M11,19q-3.500,2.200 -7,.3" fill="none" stroke-width="1.2"/><path d="M-3,2q2,5 .5,10M9,14l2,2" fill="none" stroke-width=".5" opacity=".6"/><circle cx="10" cy="3" r="1.300" fill="#8f917a" stroke-width=".5"/>`.replace(/(\d)\.500/g, '$1.5'), HEADAT));

  const ALM = 'M-8,0Q0,-6.5 8,0Q0,5 -8,0Z';
  const eye = (s) => `<g transform="translate(${21 * s},1.500)"><g clip-path="url(#troll-ec)"><path d="${ALM}" fill="#d3ccac"/><path d="M-9,-7H9V-1.5H-9Z" fill="#3d2c1b" opacity=".4"/>
<g class="troll-pm"><g class="troll-pg"><circle r="3.4" fill="#8a5a1e"/><circle r="1.8" fill="#0c0705"/><circle cx="-1.1" cy="-1.2" r=".8" fill="#fff8e6"/></g></g>
<g class="troll-bl"><path class="troll-lid" d="M-10,-18H10V-4.6Q0,-7.4 -10,-4.6Z"/></g><path class="troll-low" d="M-10,16H10V4.6Q0,6.2 -10,4.6Z"/></g>
<path d="${ALM}" fill="none" stroke="${INK}" stroke-width=".8"/><path d="M-8.500,.3Q0,-7 8.500,.3" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>
<path d="M${-7 * s},6.500q${7 * s},3.500 ${15 * s},-.5M${-4 * s},9q${5 * s},2.500 ${10 * s},0" fill="none" stroke="${INK}" stroke-width=".6" stroke-linecap="round" opacity=".7"/></g>`;
  const BROW = (c) => `<path d="M-25,-2L-21,-8L-6,-9.500L12,-8.500L24,-5L26,2L14,5L-4,6L-23,5Z" fill="${c}" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/><path d="M-20,-6.500L-6,-8L12,-7L23,-3.500" fill="none" stroke="#eee8cd" stroke-width="1" opacity=".55"/><path d="M-23,5L-4,6L14,5L26,2" fill="none" stroke="${INK}" stroke-width="1.7" stroke-linejoin="round"/><path d="M-2,-9l2,6l-3,4M14,-8l-1,5M-14,-8l1,4" fill="none" stroke="${INK}" stroke-width=".55" opacity=".8"/>`;
  const tooth = (x, y, w, h) => `<path d="M${x},${y}l.6,${-h}l${w - 1.2},-.4l.6,${h + .4}Z" fill="#dcd5b4" stroke-width=".8"/>`;
  const MOUTHS = {
    flat: `<path d="M-30,29Q-12,32 0,31.500Q14,31 30,28.500M-30,29l-3,-2M30,28.500l3,-2" fill="none" stroke-width="1.6"/>${tooth(-18, 31, 7, 6.5)}${tooth(11, 30.8, 6.5, 6)}<path d="M-18,35.500Q0,38 20,35" fill="none" stroke-width=".6" opacity=".6"/>`,
    smile: `<path d="M-33,25C-30,30 -14,33 0,33C14,33 30,30 33,24M-35,22q-3,3 0,6M35,21q3,3 0,6" fill="none" stroke-width="1.6"/>${tooth(-18, 32.2, 7, 6.5)}${tooth(11, 32, 6.5, 6)}`,
    down: `<path d="M-29,34.500C-20,28.500 -8,28 0,28.500C8,28 20,28.500 29,34.500" fill="none" stroke-width="1.6"/>${tooth(-16, 29.6, 6.5, 5.5)}${tooth(10, 29.4, 6, 5)}<path d="M-13,34.500Q0,37.500 13,34.500" fill="none" stroke-width="1"/>`,
    grin: `<path d="M-34,23Q0,29 34,23C33,33 20,38.500 0,38.500C-20,38.500 -33,33 -34,23Z" fill="#2e1712" stroke-width="1.4"/><path d="M-10,37.500C-5,33 7,33 11,37.500Z" fill="#8f4a3c" stroke="none"/>${tooth(-26, 35, 8, 7)}${tooth(-13, 37.6, 8.5, 8)}${tooth(4, 37.8, 8, 7.5)}${tooth(17, 35.6, 8, 7)}<path d="M-7,26l.5,6h7l.5,-6.200Z" fill="#dcd5b4" stroke-width=".8"/><path d="M-36,20q-3,3 0,6M36,20q3,3 0,6" fill="none" stroke-width="1.2"/>`,
    growl: `<path d="M-31,26Q0,22 31,26C30,34 18,37.500 0,37.500C-18,37.500 -30,34 -31,26Z" fill="#2e1712" stroke-width="1.4"/>${tooth(-24, 35, 7.5, 8)}${tooth(-11, 37, 8, 9)}${tooth(3, 37, 8, 9)}${tooth(16, 35.2, 7.5, 8)}<path d="M-17,24.500l.5,5h6l.5,-5.500ZM9,24l.5,5.500h6l.5,-5Z" fill="#dcd5b4" stroke-width=".8"/>`,
    o: `<ellipse cx="0" cy="31" rx="7.500" ry="6" fill="#2e1712" stroke-width="1.3"/>${tooth(-4, 36.6, 7, 3.5)}<path d="M-22,31q4,-2 8,-1M22,31q-4,-2 -8,-1" fill="none" stroke-width=".9"/>`,
    mumble: `<path d="M-28,29.500Q-12,31.500 -6,31M6,31Q14,31 28,29" fill="none" stroke-width="1.6"/><ellipse class="troll-mum" cx="0" cy="31" rx="6.500" ry="3.200" fill="#2e1712" stroke-width="1.1"/>${tooth(-18, 31, 7, 6)}${tooth(11, 30.8, 6.5, 5.5)}`,
  };
  const FACE = S('troll-L troll-pet troll-face', `<g transform="${HEADAT}">${eye(-1)}${eye(1)}
<g transform="translate(-23,-11)"><g class="troll-bw troll-bL"><g class="troll-bt"><g transform="scale(-1,1)">${BROW('#7b7e6a')}</g></g></g></g><g transform="translate(23,-11)"><g class="troll-bw troll-bR"><g class="troll-bt">${BROW('#9c9e88')}</g></g></g>
<g ${P}>${MOS.map((m) => `<g class="troll-mo troll-mo-${m}">${MOUTHS[m]}</g>`).join('')}
<path class="troll-crk" d="M-8,-40l5,12l-6,9l7,12l-4,10M30,-38l-6,13l8,10l-3,14l7,9M-52,-4l12,6l5,12l10,4M56,20l-12,2l-8,9M-30,41l6,-9l-2,-8M10,39l2,-7" fill="none" stroke-width="1" opacity=".85"/></g></g>`.replace(/(\d)\.500/g, '$1.5').replace(/\.200/g, '.2'));

  // ---- hands: a palm, three fingers and a thumb that stretch and curl ----
  const finger = (x, y, rot, i, w, len) => `<g transform="translate(${x},${y}) rotate(${rot})"><g class="troll-fg troll-f${i}"><path d="M${-w},3L${-w},${-len + w}C${-w},${-len - 1} ${w},${-len - 1} ${w},${-len + w}L${w},3Z" fill="url(#troll-st)" stroke-width="1.1"/><path d="M${-w},3L${-w},${-len + w}C${-w},${-len} ${-w + 2},${-len - 1} -1,${-len - .5}C-2.5,${-len + 5} -2.5,-3 -2,3Z" fill="${DARK}" opacity=".26" stroke="none"/><path d="M${-w + 1.5},${r1(-len * .4)}h${w * 2 - 3}M${-w + 1.5},${r1(-len * .62)}h${w * 2 - 3}" fill="none" stroke-width=".6" opacity=".8"/><path d="M${-w + 1.6},${-len + 4}q${w - 1.6},-3.4 ${2 * w - 3.2},0v2.5h${-2 * w + 3.2}Z" fill="#c9c7ae" stroke-width=".5"/></g></g>`;
  const HAND = `${finger(-10.5, -8, -8, 0, 5, 24)}${finger(0, -9, 0, 1, 5.2, 26)}${finger(10.5, -8, 8, 2, 5, 23)}${finger(13, 3, 50, 3, 5.5, 17)}
<path d="M-15.500,-9C-18.500,1 -14,12 -5,13.500L8,13.500C15,11 18.500,1 15.500,-9C9,-13 -9,-13 -15.500,-9Z" fill="url(#troll-st)" stroke-width="1.2"/>
<path d="M-15.500,-9C-18.500,1 -14,12 -5,13.500L-1,13.500C-8,8 -10,-2 -7,-11.500Z" fill="${DARK}" opacity=".24" stroke="none"/><path d="M-15.500,-9C-18.500,1 -14,12 -5,13.500C-11,8 -13,-2 -11,-11Z" fill="url(#troll-h1)" stroke="none"/>
<path d="M-11,-8q5,2.500 10,.5M1,-8q5,2 9,-.5M-6,4l5,3l-2,4M8,2l-3,5" fill="none" stroke-width=".6" opacity=".8"/>`.replace(/(\d)\.500/g, '$1.5');
  const ARML = S('troll-pet', G(`<path d="M11,212C9,224 22,230 34,227C45,224 47,214 43,204L38,178L14,179Z" fill="url(#troll-st)" stroke-width="1.2"/>
<path d="M11,212C9,224 22,230 30,228C20,222 20,200 22,179L14,179Z" fill="${DARK}" opacity=".25" stroke="none"/><path d="M11,212C9,224 18,229 24,228C16,220 16,200 18,179L14,179Z" fill="url(#troll-h1)" stroke="none"/>
<path d="M15,185Q26,188 38,184M30,200l5,4l-2,6M20,214l5,3" fill="none" stroke-width=".6" opacity=".8"/><ellipse cx="34" cy="216" rx="5" ry="3" fill="#b0a85c" opacity=".5" stroke="none"/>
<g class="troll-hand"><g class="troll-hw"><g class="troll-prop"></g>${HAND}</g></g>`));
  const ARMR = S('troll-pet', G(`<path d="M193,188C198,198 193,211 182,215L152,219C142,216 141,200 150,195L178,182C186,180 190,183 193,188Z" fill="url(#troll-st)" stroke-width="1.2"/>
<path d="M194,200C193,208 189,213 182,215L152,219C146,217 143,212 143,206Q168,212 194,200Z" fill="${DARK}" opacity=".24" stroke="none"/><path d="M190,208L182,215L152,219C148,218 145,215 144,211Q168,216 190,208Z" fill="url(#troll-h2)" stroke="none"/>
<path d="M178,184C184,183 188,186 190,190" fill="none" stroke="#f6f0d8" stroke-width="1.1" opacity=".55"/><path d="M170,190l5,5l-2,5M158,198l4,3M184,198l-4,5" fill="none" stroke-width=".6" opacity=".8"/><ellipse cx="172" cy="204" rx="6" ry="3" fill="#b0a85c" opacity=".45" stroke="none"/>
<g transform="translate(138,216) rotate(176) scale(.84)"><g class="troll-pk">${HAND}</g></g>`));

  // ---- props ----
  const leaf = (x, y, rot, len, fill) => `<path transform="translate(${x},${y}) rotate(${rot})" d="M0,0C${r1(len * .3)},-3 ${r1(len * .75)},-3 ${len},0C${r1(len * .75)},3 ${r1(len * .3)},3 0,0Z" fill="${fill}" stroke-width=".5"/>`;
  const bal = (x, y, r, c, ax, ay, i) => `<g class="troll-bob" style="--o:${ax}px ${ay}px;--d:${i}"><path d="M${x},${y + r + 2}L${ax},${ay}" fill="none" stroke-width=".7"/><path d="M${x},${y - r}C${r1(x + r * .98)},${y - r} ${r1(x + r * 1.08)},${r1(y + r * .35)} ${x},${r1(y + r * 1.15)}C${r1(x - r * 1.08)},${r1(y + r * .35)} ${r1(x - r * .98)},${y - r} ${x},${y - r}Z" fill="${c}" stroke-width=".9"/><path d="M${x - 1.5},${r1(y + r * 1.1)}h3l1,2.5h-5Z" fill="${c}" stroke-width=".6"/><path d="M${r1(x + r * .3)},${r1(y - r * .6)}q${r1(r * .35)},${r1(r * .35)} ${r1(r * .3)},${r1(r * .8)}" fill="none" stroke="#fff" stroke-width="1.1" opacity=".4"/></g>`;
  const bird = (x, y, cls, hat) => `<g transform="translate(${x},${y})"><g class="${cls}"><path d="M-2,2v4M2,2v4" fill="none" stroke-width=".7"/><path d="M-6,-1C-7,-7 1,-10 5,-6L9.5,-6.5L6.5,-3C7,2 -3,4 -6,-1Z" fill="#7b5c3c" stroke-width=".8"/><path d="M-4,0C-1,2.5 4,2 6,-2C3,-1 -1,-1.5 -4,0Z" fill="#d9c9a0" stroke="none"/><path d="M-6,-2L-11.5,-5.5L-7,-.5" fill="#5f452b" stroke-width=".7"/><circle cx="4" cy="-6" r=".8" fill="#0c0705" stroke="none"/>${hat ? '<path d="M1.500,-9L4,-16L6.500,-8.500Z" fill="#3f7f86" stroke-width=".6"/><circle cx="4" cy="-16.500" r="1.200" fill="#e2c474" stroke-width=".4"/>'.replace(/\.[52]00/g, (m) => m.slice(0, 2)) : ''}</g></g>`;
  const MAST = '<path d="M105,4V-17" fill="none" stroke-width="1.4"/><circle cx="105" cy="-18" r="1.500" fill="#b79a5e" stroke-width=".6"/>'.replace('.500', '.5');
  const GARNISH = `<path d="M160,174C164,166 180,165 187,175C182,180 167,180 160,174Z" fill="#5f7346" stroke-width=".9"/><path d="M164,172q3,-3 6,-1M172,170q3,-2 6,0M178,174q3,-2 5,0" fill="none" stroke="#a9b77c" stroke-width=".8"/>
<g class="troll-sway" style="--o:176px 170px"><path d="M176,170C175,160 180,154 178,145" fill="none" stroke="#3f5a2c" stroke-width="1.1"/>${leaf(176, 164, -150, 8, '#7c8f52')}${leaf(177, 159, -25, 8, '#6b8048')}${leaf(178.5, 153, -155, 7, '#7c8f52')}${leaf(178.5, 149, -40, 6, '#6b8048')}<circle cx="178" cy="144" r="2.6" fill="#e3d6a0" stroke-width=".7"/><circle cx="178" cy="144" r=".9" fill="#b9852e" stroke="none"/></g>`;
  const qpt = (t, y1) => { const u = 1 - t; return [u * u * 38 + 2 * u * t * 105 + t * t * 172, u * u * 69 + 2 * u * t * y1 + t * t * 69]; };
  const bunting = () => {
    const C = ['#c9a544', '#3f7f86', '#d9cdb0', '#7c8b55', '#b86a4a'];
    let s = '<path d="M38,69Q105,128 172,69" fill="none" stroke-width=".9"/>';
    for (let i = 1; i < 10; i++) { const [x, y] = qpt(i / 10, 128); s += `<path d="M${r1(x - 5)},${r1(y - 1)}L${r1(x + 5)},${r1(y - 1)}L${r1(x)},${r1(y + 11)}Z" fill="${C[i % 5]}" stroke-width=".7"/>`; }
    return s;
  };
  const garland = () => {
    let s = '';
    for (let i = 1; i < 16; i++) { const [x, y] = qpt(i / 16, 103); s += leaf(r1(x), r1(y + 1), (i % 2 ? 60 : 120) + (i - 8) * 4, 9, i % 3 ? '#5f7a3c' : '#8a9a50'); if (i % 4 === 2) s += `<circle cx="${r1(x)}" cy="${r1(y + 3)}" r="2" fill="#a8452f" stroke-width=".5"/>`; }
    return s;
  };
  const slots = (mood, stone) => {
    const o = { back: '', mid: GARNISH, front: '', hp: bird(27, -46, mood === 'superb' ? 'troll-hop' : 'troll-bird', mood === 'superb'), deco: '', prop: '' };
    if (mood === 'calibrating') o.deco = `<text x="104" y="72" font-family="'IM Fell English',Georgia,serif" font-size="58" text-anchor="middle" fill="#3a2c1c" stroke="none" opacity=".78">?</text>`;
    if (mood === 'poor') {
      o.deco = `<path d="M172,69C177,78 172,86 175,92" fill="none" stroke-width=".9"/><g class="troll-sway" style="--o:175px 90px"><path d="M175,90C168,95 170,107 173,116C175,110 180,113 180,105C183,99 180,93 175,90Z" style="fill:var(--hr2)" stroke-width="1"/><path d="M174,95q-2,6 0,12M177,96q1,5 0,9" fill="none" stroke-width=".5"/></g>`;
      o.mid += `<path class="troll-rain" d="M163,133l-2,9M171,133l-2,9M179,133l-2,9M187,133l-2,9M167,146l-2,9M175,146l-2,9M183,146l-2,9M191,144l-2,9" fill="none" stroke="#c3d0da" stroke-width="1.1" stroke-dasharray="5 6"/><path d="M157,130C152,121 160,114 167,117C169,108 185,107 188,116C197,113 203,123 197,130Z" fill="#7d858c" stroke-width="1.1"/><path d="M157,130C152,121 160,114 167,117C161,120 160,126 163,130Z" fill="${DARK}" opacity=".3" stroke="none"/><path d="M170,115q7,-5 14,-1" fill="none" stroke="#dfe6ea" stroke-width="1" opacity=".6"/>`;
      o.prop = `<g class="troll-dangle"><path d="M25,-9C27,-4 23,0 25,5" fill="none" stroke-width=".9"/><path d="M20.500,10C20,4 29,3 30,10C30.500,16 27,20 25,20C23,20 20.500,16 20.500,10Z" fill="#8a7a66" stroke-width=".9"/><circle cx="21" cy="16" r="2" fill="#a39280" stroke-width=".5"/><circle cx="29" cy="16" r="2" fill="#a39280" stroke-width=".5"/><path d="M25,20v2.500M23,22l-2,2M27,22l2,2" fill="none" stroke-width=".6"/></g>`.replace(/(\d)\.500/g, '$1.5');
    }
    if (mood === 'good') {
      o.back = `<path d="M27,190L34,187L68,128C74,119 66,107 55,110C47,112 45,121 49,128Z" fill="#7a5a36" stroke-width="1.2"/><path d="M49,128C45,121 47,112 55,110C50,116 52,124 56,128L33,188L27,190Z" fill="${DARK}" opacity=".3" stroke="none"/><path d="M36,180L60,130M58,114l4,8M52,118l3,6" fill="none" stroke-width=".55" opacity=".7"/><g fill="#9aa2a8" stroke-width=".6"><circle cx="58" cy="115" r="1.8"/><circle cx="64" cy="122" r="1.8"/><circle cx="54" cy="124" r="1.8"/></g>`;
      o.mid += `<path d="M178,205v20M187,205v18" fill="none" stroke="#3a3028" stroke-width="2.4"/><path d="M163,182C161,174 170,170 176,174C180,167 191,167 194,174C201,172 205,178 202,184C206,190 201,197 194,196C190,201 179,201 176,196C168,199 161,192 163,182Z" fill="#dad3bb" stroke-width="1"/><path d="M170,180q3,-3 6,0M180,176q3,-3 6,0M186,186q3,-3 6,0M172,190q3,-3 6,0" fill="none" stroke-width=".6" opacity=".7"/><g class="troll-chew"><path d="M194,172C200,168 208,173 207,181C206,186 200,188 196,185Z" fill="#3a3028" stroke-width=".9"/><path d="M196,172l-5,-4l2,6" fill="#3a3028" stroke-width=".8"/><circle cx="202" cy="176" r="1" fill="#e9dfc0" stroke="none"/></g>`;
      o.deco = `${MAST}<g class="troll-wave"><path d="M105,-16L128,-10.500L105,-5Z" fill="#5d7a40" stroke-width=".9"/><path d="M105,-12.500L119,-10.500L105,-8.500Z" fill="#d9cdb0" stroke="none"/></g>`.replace(/(\d)\.500/g, '$1.5');
    }
    if (mood === 'great') {
      o.prop = `<path d="M-19,-52C-24,-38 -24,-20 -19,-4L19,-4C24,-20 24,-38 19,-52Z" fill="#8a6238" stroke-width="1.2"/><path d="M-19,-52C-24,-38 -24,-20 -19,-4L-9,-4C-13,-20 -13,-38 -9,-52Z" fill="${DARK}" opacity=".28" stroke="none"/><path d="M-9,-52C-12,-36 -12,-20 -9,-4M1,-52V-4M11,-52C13,-36 13,-20 11,-4" fill="none" stroke-width=".55" opacity=".7"/><path d="M-22,-42Q0,-38 22,-42M-22.500,-15Q0,-11 22.500,-15" fill="none" stroke="#3d4248" stroke-width="3"/><path d="M-22,-43Q0,-39 22,-43" fill="none" stroke="#aab3ba" stroke-width=".7" opacity=".7"/><ellipse cx="0" cy="-52" rx="19" ry="4" fill="#5d4126" stroke-width="1"/><path d="M-15,-53C-16,-60 -6,-62 -3,-57C0,-63 11,-63 12,-56C17,-56 18,-51 13,-50L-12,-50C-18,-50 -18,-53 -15,-53Z" fill="#efe6c8" stroke-width=".9"/><path d="M13,-50c2,5 -1,9 1,12" fill="none" stroke="#efe6c8" stroke-width="2"/>`.replace(/(\d)\.500/g, '$1.5');
      o.hp += `<path d="M55,-8C59,-18 65,-27 72,-35" fill="none" stroke="#3f5a2c" stroke-width="1.2"/>${leaf(58, -15, -20, 9, '#7c8f52')}${leaf(61, -21, -110, 8, '#6b8048')}${leaf(65, -27, -15, 8, '#7c8f52')}<g fill="#ead9a8" stroke-width=".6"><circle cx="72" cy="-36" r="3.2"/><circle cx="66" cy="-33" r="2.6"/><circle cx="75" cy="-29" r="2.4"/></g><g fill="#b9852e" stroke="none"><circle cx="72" cy="-36" r="1"/><circle cx="66" cy="-33" r=".9"/><circle cx="75" cy="-29" r=".8"/></g>`;
      o.deco = garland();
    }
    if (mood === 'superb') {
      o.prop = `<path d="M18,4L-14,-4L-14,-.5L18,8.500Z" fill="#d9cdb0" stroke-width=".8"/><g class="troll-blow"><path d="M-14,-4L-44,-10C-52,-12 -54,-3 -48,-2C-45,-2 -45,-6 -48,-6M-14,-.5L-43,-6.500" fill="#3f7f86" stroke-width=".9"/><path d="M-20,-5.200l-1,3.600M-27,-6.600l-1,3.600M-34,-8l-1,3.600" fill="none" stroke="#e2c474" stroke-width="1.6"/></g>`.replace(/(\d)\.[56]00/g, (m, a) => a + m.slice(1, 3)).replace(/\.200/g, '.2');
      o.hp += `<path d="M-14,-38C8,-36 34,-32 48,-18C53,-6 53,10 56,20C57,29 53,34 47,37M-30,-37C-42,-32 -47,-22 -49,-17L-52,-7C-55,3 -53,11 -56,19C-57,28 -53,34 -45,37" fill="none" stroke="#e6dcc0" stroke-width=".8" opacity=".85"/>
<g transform="translate(-22,-40) rotate(-14)"><path d="M-9,1L0,-25L9,1Z" fill="#b33c31" stroke-width="1"/><path d="M-6.500,-6L-4.200,-13L4.200,-13L6.500,-6ZM-2.200,-19L0,-25L2.200,-19Z" fill="#e2c474" stroke="none"/><path d="M-9,1Q0,4 9,1" fill="none" stroke-width="1"/><circle cx="0" cy="-26.500" r="3.800" fill="#efe6c8" stroke-width=".8"/></g>${bal(78, -36, 9, '#b86a4a', 60, 0, 2)}`.replace(/(\d)\.[258]00/g, (m, a) => a + m.slice(1, 3));
      o.deco = bunting() + bal(15, 44, 9, '#7c8b55', 38, 69, 0) + bal(195, 42, 9, '#c9a544', 172, 69, 3);
      o.mid += bal(12, 134, 8.5, '#d9cdb0', 39, 158, 1) + bal(198, 128, 8.5, '#6f86a8', 171, 156, 4);
    }
    if (mood === 'pvp') {
      o.prop = `<path d="M-7,12L-9,-30C-14,-50 -16,-70 -12,-92L-2,-98L10,-94C16,-72 13,-50 9,-30L7,12Z" fill="#5d4a32" stroke-width="1.3"/><path d="M-7,12L-9,-30C-14,-50 -16,-70 -12,-92L-6,-95C-9,-70 -7,-48 -3,-30L-2,12Z" fill="${DARK}" opacity=".32" stroke="none"/><path d="M-4,-88C-6,-70 -4,-50 0,-34M4,-90C5,-72 5,-54 3,-38M8,-80C9,-66 8,-52 6,-42M-9,-60l5,6M2,-70l4,5" fill="none" stroke-width=".55" opacity=".75"/><path d="M-12,-88l-9,-6l3,9ZM10,-90l10,-5l-4,10Z" fill="#4d3d28" stroke-width="1"/><path d="M-13,-72l-9,-3M12,-62l9,-4M-12,-52l-8,2M12,-80l8,-2M10,-44l8,2" fill="none" stroke="#c3ccd2" stroke-width="1.5"/><g fill="#c3ccd2" stroke-width=".5"><circle cx="-13" cy="-72" r="1.6"/><circle cx="12" cy="-62" r="1.6"/><circle cx="-12" cy="-52" r="1.6"/><circle cx="12" cy="-80" r="1.6"/><circle cx="10" cy="-44" r="1.6"/></g>`;
      o.hp = `<path d="M-43,-28C-45,-45 -31,-53 0,-53C31,-53 45,-45 43,-28Z" fill="#3d4248" stroke-width="1.3"/><path d="M-43,-28C-45,-45 -31,-53 -12,-53C-26,-47 -30,-38 -29,-28Z" fill="url(#troll-h1)" stroke="none"/><path d="M22,-50C33,-46 39,-40 40,-33" fill="none" stroke="#c3ccd2" stroke-width="1.2" opacity=".6"/><path d="M-20,-51l-3,-7l8,1ZM20,-51l3,-7l-8,1ZM-3,-53l0,-7h6l0,7Z" fill="#33373c" stroke-width="1"/><path d="M-46,-33Q0,-26 46,-33L46,-26.500Q0,-19.500 -46,-26.500Z" fill="#555b62" stroke-width="1.2"/><path d="M46,-30C56,-34 58,-22 50,-18" fill="none" stroke="#33373c" stroke-width="2"/><path d="M8,-44l5,3l-3,4" fill="none" stroke-width=".7"/>`.replace(/(\d)\.500/g, '$1.5');
      o.deco = `${MAST}<g class="troll-wave"><path d="M105,-17L132,-15L125,-10L133,-5L105,-4Z" fill="#9c2a20" stroke-width="1"/><path d="M110,-13l12,1M110,-8l13,1" fill="none" stroke-width=".5" opacity=".6"/></g>${rope('M38,69Q105,103 172,69', 1.2).replace(/#cbbb8e/, '#b4372b').replace('stroke-dasharray="2.8 2.2"', '')}`;
    }
    if (mood === 'levelup') {
      o.mid += `<path d="M168,168l4,1.500l4,-1.500l0,5c0,2.500 -4,4 -4,4c0,0 -4,-1.500 -4,-4Z" fill="#dcb84e" stroke-width=".7"/><path d="M172,170v4" fill="none" stroke-width=".5"/><path d="M180,164l2,-3M182,169l3,0" fill="none" stroke="#f6dd8e" stroke-width=".9"/>`.replace(/(\d)\.500/g, '$1.5');
      o.deco = `<g class="troll-twk"><path d="M105,-17L108.300,-7.500L118.300,-7.300L110.300,-1.300L113.200,8.300L105,2.600L96.800,8.300L99.700,-1.300L91.700,-7.300L101.700,-7.500Z" fill="#e2bd4e" stroke-width="1"/><path d="M105,-12L107,-6L112,-5.500" fill="none" stroke="#fff6d2" stroke-width="1" opacity=".8"/></g><path d="M86,-12l-6,-4M124,-12l6,-4M84,2l-7,1M126,2l7,1" fill="none" stroke="#f1d27a" stroke-width="1.1"/>${rope('M38,69Q105,103 172,69', 1.2).replace(/#cbbb8e/, '#e2bd4e').replace('stroke-dasharray="2.8 2.2"', '')}`.replace(/(\d)\.([35268])00/g, '$1.$2');
    }
    if (mood === 'death') {
      o.deco = `<path d="M33,44Q105,80 177,46L176,59Q105,92 35,57Z" fill="#17140f" stroke-width="1"/><path d="M40,52Q105,84 170,54" fill="none" stroke="#5d564b" stroke-width=".7"/><path d="M146,60C140,52 132,56 136,64C138,68 144,66 146,62C148,66 156,68 158,62C160,54 152,52 146,60Z" fill="#17140f" stroke-width="1"/><g class="troll-sway" style="--o:146px 62px"><path d="M144,63C140,76 146,86 142,100L149,97C151,86 147,76 149,64ZM149,63C155,74 152,84 157,94L161,89C158,80 159,72 153,62Z" fill="#17140f" stroke-width=".9"/></g>`;
      o.hp = stone ? `<g transform="translate(-24,-41) scale(1.5)">${bird(0, -4, 'troll-peck')}</g>` : o.hp;
    }
    if (mood === 'achievement') {
      o.front = `<path d="M103,222C92,217 80,210 73,200" fill="none" stroke="#d9cba0" stroke-width="1.1"/><path d="M103,222l-5,-1l1,4" fill="none" stroke="#d9cba0" stroke-width="1.1"/><path d="M139,199C133,212 121,221 110,226L104,218C116,213 126,206 130,196Z" fill="#7a2f3f" stroke-width="1"/><path d="M135,197.500C129,210 118,218 107,222" fill="none" stroke="#d9cdb0" stroke-width="1.6"/><circle cx="107" cy="233" r="9" fill="#d2a944" stroke-width="1.1"/><circle cx="107" cy="233" r="6" fill="#e6c669" stroke-width=".6"/><path d="M107,228.500l1.300,3l3.200,.2l-2.500,2l.9,3.100l-2.900,-1.800l-2.900,1.800l.9,-3.100l-2.500,-2l3.200,-.2Z" fill="#a67c1e" stroke="none"/><path d="M101,228q3,-3.500 7,-3.500" fill="none" stroke="#fff6d2" stroke-width="1" opacity=".7"/><circle cx="107" cy="223.500" r="1.800" fill="none" stroke-width="1"/>`.replace(/(\d)\.([358])00/g, '$1.$2');
      o.deco = `<path d="M99,58L92,84L99,80L103,88L107,60ZM111,58L118,86L112,81L107,87L104,60Z" fill="#8a6a2c" stroke-width=".9"/><circle cx="105" cy="52" r="13" fill="#b08a45" stroke-width="1.1"/><circle cx="105" cy="52" r="8.5" fill="#d6b56a" stroke-width=".7"/><path d="M98,46q5,-5 11,-3" fill="none" stroke="#fff3cf" stroke-width="1.1" opacity=".7"/>${garland()}`;
    }
    return o;
  };
  const marks = (n, mood) => {
    if (mood === 'pvp') return `<svg class="troll-mk" xmlns="${NS}" width="24" height="15" viewBox="0 0 24 15"><g stroke="${INK}" stroke-width=".8" stroke-linejoin="round" fill="#8f1d16"><path d="M3,13L5.500,10.500L17,2C20,0 23,3 20.500,5.500L5.500,13Z"/><path d="M21,13L18.500,10.500L7,2C4,0 1,3 3.500,5.500L18.500,13Z"/></g></svg>`.replace(/(\d)\.500/g, '$1.5');
    let s = '';
    for (let i = 0; i < 5; i++) s += `<path transform="translate(${6.5 + i * 11.5},8)" d="M-4.5,3.5C-6,0 -3,-4 0,-3.8C3.5,-4.2 6,-.5 4.5,3.5Z" class="${i < n ? 'troll-on' : 'troll-off'}"/>`;
    return `<svg class="troll-mk" xmlns="${NS}" width="59" height="13" viewBox="0 0 59 13">${s}</svg>`;
  };
  const BOOT = `<svg class="troll-boot" xmlns="${NS}" width="20" height="22" viewBox="0 0 20 22"><path d="M5,1h8l-1,10c4,1 7,3 7,7v2H4Z" fill="#5a4630" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/><path d="M4,17.5h15" stroke="${INK}" stroke-width="1.6"/><path d="M7,5h4M7,8h4" stroke="#c9b88a" stroke-width=".8"/></svg>`;

  Harness.register({
    id: 'troll',
    name: 'The Troll',
    blurb: 'A stone-troll of the Tom, Bert and William kind, far too large for the basket and for the three balloons that carry him. He thinks slowly, means well, and has thrown out everything he could spare, including a boot.',
    create(ctx) {
      const E = ctx.el, k = () => 1 / ctx.pace();
      if (!document.getElementById('troll-defs')) document.body.append(ctx.svg(DEFS));
      const live = new Set(), stills = new Set();
      let ticking = false;
      const tick = (now) => {
        for (const R of stills) {
          if (R.root.isConnected) R.seen = true; else if (R.seen || now - R.born > 3000) { R.stop(); stills.delete(R); continue; }
          R.frame({ lean: 1.3 * Math.sin(now * .0006 + R.ph), swing: 2.2 * Math.sin(now * .0011 + R.ph), phase: 'read', t: now, vy: 0, burn: .12 });
        }
        if (stills.size) requestAnimationFrame(tick); else ticking = false;
      };

      function fill(sign, n) {
        const mood = M[n.mood] ? n.mood : 'calibrating', p = sign.firstChild;
        sign.dataset.mood = mood; sign.dataset.kind = n.kind;
        sign.style.setProperty('--acc', M[mood].acc);
        p.textContent = '';
        const add = (cls, txt) => { if (!txt) return null; const e = E('div', cls, txt); p.append(e); return e; };
        if (n.kind === 'achievement') add('troll-tag', n.label);
        add('troll-title', n.title);
        if (n.kind === 'kill' && n.title && n.big) p.append(E('i', 'troll-rule'));
        const f = add('troll-fig', n.big);
        if (f && n.unit) f.append(E('span', 'troll-unit', n.unit));
        if (n.kind === 'kill') {
          const r = E('div', 'troll-rate');
          r.append(ctx.svg(marks(RANK[mood] || 0, mood)), n.label ? E('span', 'troll-word', n.label) : E('span', 'troll-q', '?'));
          p.append(r);
        } else if (n.kind !== 'achievement') add('troll-tag', n.label);
        add('troll-more', n.more);
      }

      function make(n, still) {
        const root = E('div', 'troll-v'), box = E('div', 'troll-box'), sag = E('div', 'troll-sag');
        const svg = (m) => ctx.svg(m), slot = () => svg(S('troll-slot troll-L', ''));
        const layer = (cls, ...kids) => { const d = E('div', cls + ' troll-L'); d.append(...kids); return d; };
        const deco = slot(), flame = svg(FLAME), env = layer('troll-env', svg(ENV), flame, deco);
        const hpL = layer('troll-hp troll-hpL', svg(helper(24, 95, 55, 205))), hpR = layer('troll-hp troll-hpR', svg(helper(186, 95, 155, 205)));
        const back = slot(), mid = slot(), front = slot(), hp = slot();
        const mrope = svg(S('troll-L', `<g stroke-linecap="round">${rope('M0,0')}</g>`));
        const face = svg(FACE), nod = E('div', 'troll-nod'), head = layer('troll-head', nod);
        nod.append(svg(HEAD), face, hp);
        const armL = layer('troll-arm troll-armL', svg(ARML)), armR = layer('troll-arm troll-armR', svg(ARMR));
        const car = layer('troll-car', hpL, hpR, back, svg(BODY), mrope, mid, head, armL, armR, front);
        const srope = svg(S('troll-L', `<g stroke-linecap="round">${rope('M0,0', 4.4)}</g>`));
        const fx = E('div', 'troll-fx');
        sag.append(env, car); box.append(sag, srope, fx);
        const sign = E('div', 'troll-sign'); sign.append(E('div', 'troll-plank'));
        for (const s of ['left', 'right']) { const h = E('i', 'troll-hole'); h.style[s] = '8px'; sign.append(h); }
        root.append(box, sign);
        if (ctx.reduced) root.classList.add('troll-rm');
        const flEl = flame.querySelector('.troll-fl'), prop = armL.querySelector('.troll-prop'), pk = armR.querySelector('.troll-pk');
        const fgL = [0, 1, 2, 3].map((i) => armL.querySelector('.troll-f' + i)), fgR = [0, 1, 2, 3].map((i) => armR.querySelector('.troll-f' + i));
        [.95, 1, .9, .6].forEach((e, i) => fgR[i].style.setProperty('--e', e));
        const lids = [...face.querySelectorAll('.troll-bl')], bts = [...face.querySelectorAll('.troll-bt')];
        const mr = mrope.querySelectorAll('path'), sr = srope.querySelectorAll('path');
        const timers = new Set();
        const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (!R.dead) fn(); }, ms * k()); timers.add(t); return t; };
        const R = { root, ph: Math.random() * 6, born: performance.now(), t0: 0, fl: .15, sag: 0, ca: 0, cv: 0, sa: 0, sv: 0, hd: 0, hr: 0, hdT: 0, hrT: 0, stone: false, dead: false, mood: '', last: 'arrive', ci: 0 };
        const setF = (f, th) => { f.forEach((e, i) => fgL[i].style.setProperty('--e', e)); if (th != null) fgL[3].style.setProperty('--e', th); };
        const look = (x, y, ms) => { face.style.setProperty('--gx', x); face.style.setProperty('--gy', y); if (ms) later(() => look(0, 0), ms); };
        const dress = () => {
          const s = slots(R.mood, R.stone);
          back.innerHTML = N(s.back); mid.innerHTML = N(s.mid); front.innerHTML = N(s.front); deco.innerHTML = N(s.deco);
          hp.innerHTML = `<g>${N(s.hp, HEADAT)}</g>`; prop.innerHTML = s.prop;
        };
        function setMood(mood, pre) {
          const m = M[mood];
          R.mood = mood; root.dataset.mood = mood; root.dataset.sky = ctx.skyMode();
          root.classList.toggle('troll-pre', !!pre);
          root.dataset.mo = pre && (mood === 'pvp' || mood === 'death') ? 'flat' : pre && mood === 'great' ? 'smile' : m.mo;
          const st = root.style;
          st.setProperty('--ar', pre && mood === 'pvp' ? 16 : m.ar); st.setProperty('--hrot', m.hrot); st.setProperty('--top', m.top || 0);
          st.setProperty('--e1', m.e[0]); st.setProperty('--e2', m.e[1]); st.setProperty('--e3', m.e[2]);
          st.setProperty('--hl', m.hc[0]); st.setProperty('--hr2', m.hc[1]);
          setF(pre && mood === 'death' ? [0, 0, 0] : m.f, m.th);
          R.hdT = pre && mood === 'poor' ? 0 : (m.hd || 0); R.hrT = m.hr || 0;
          hpR.style.display = m.pop ? 'none' : '';
          root.toggleAttribute('data-rim', mood === 'poor' && !pre);
          dress();
          fx.querySelector('.troll-conf')?.remove();
          if (mood === 'superb' && !ctx.reduced) {
            const c = E('div', 'troll-conf'), r = ctx.rng(7 + (R.ph * 100 | 0)), C = ['#c9a544', '#3f7f86', '#d9cdb0', '#b86a4a', '#7c8b55', '#b33c31'];
            for (let i = 0; i < 16; i++) { const p = E('i'); p.style.cssText = `left:${(r() * 200) | 0}px;background:${C[i % 6]};--t:${(3 + r() * 2.5).toFixed(2)}s;--w:${(-r() * 5).toFixed(2)}s;--dx:${((r() - .5) * 50) | 0}px`; c.append(p); }
            fx.append(c);
          }
          if (mood === 'calibrating' && !ctx.reduced) later(count, 500);
        }
        function count() {
          if (R.mood !== 'calibrating') return;
          const i = R.ci++ % 5;
          setF([[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 1, 1], [0, 0, 0]][i]);
          root.dataset.mo = i === 3 ? 'flat' : 'mumble';
          if (i === 3) { look(2.4, .8, 1100); bts[0].animate([{ transform: 'none' }, { transform: 'translateY(-3px) rotate(-5deg)', offset: .3 }, { transform: 'translateY(-3px) rotate(-5deg)', offset: .75 }, { transform: 'none' }], { duration: 1300 * k(), easing: 'ease-in-out' }); }
          later(count, i === 3 ? 1400 : 760);
        }
        const nodNow = (frames, ms, fwd) => nod.animate(frames, { duration: ms * k(), easing: 'ease-in-out', fill: fwd ? 'forwards' : 'none' });
        function petrify() {
          R.stone = true; root.classList.add('troll-stone'); R.hrT = -1; dress();
        }
        // the one small piece of business on arriving at the readable spot
        function business() {
          const mood = R.mood;
          R.cv += .004; R.sv += .05;
          if (mood === 'poor') { later(() => { root.classList.remove('troll-pre'); R.hdT = 7; root.setAttribute('data-rim', ''); look(0, 0); }, 250); }
          else if (mood === 'meh') later(() => { R.cv -= .009; for (const a of [armL, armR]) a.animate([{ translate: '0 0' }, { translate: '0 -6px', offset: .35 }, { translate: '0 -6px', offset: .6 }, { translate: '0 0' }], { duration: 900 * k(), easing: 'ease-in-out' }); nodNow([{ transform: 'none' }, { transform: 'translateY(4px)', offset: .35 }, { transform: 'translateY(4px)', offset: .6 }, { transform: 'none' }], 900); }, 300);
          else if (mood === 'good') later(() => nodNow([{ transform: 'none' }, { transform: 'translateY(6px) rotate(2deg)', offset: .4 }, { transform: 'translateY(-1px)', offset: .8 }, { transform: 'none' }], 1100), 250);
          else if (mood === 'great') later(() => {
            root.dataset.mo = 'grin'; root.style.setProperty('--ar', 26); root.style.setProperty('--hrot', 24);
            nodNow([{ transform: 'none' }, { transform: 'rotate(-5deg) translateY(-2px)', offset: .4 }, { transform: 'rotate(-5deg) translateY(-2px)', offset: .7 }, { transform: 'none' }], 1700);
            later(() => { root.style.setProperty('--ar', M.great.ar); root.style.setProperty('--hrot', M.great.hrot); }, 1150);
          }, 200);
          else if (mood === 'superb') later(() => { nodNow([{ transform: 'none' }, { transform: 'rotate(-6deg) translateY(-3px)', offset: .3 }, { transform: 'rotate(2deg) translateY(1px)', offset: .7 }, { transform: 'none' }], 800); R.cv += .008; }, 200);
          else if (mood === 'pvp') { later(() => { root.classList.remove('troll-pre'); }, 150); later(() => { root.dataset.mo = 'growl'; root.style.setProperty('--ar', M.pvp.ar); nodNow([{ transform: 'none' }, { transform: 'translateY(3px) rotate(-2deg)', offset: .5 }, { transform: 'none' }], 700); }, 950); }
          else if (mood === 'levelup') { later(() => { setF([1, 1, 1]); look(-2.6, -.6, 900); }, 1000); later(() => setF([1, 0, 1]), 2100); }
          else if (mood === 'death') {
            later(() => { root.classList.remove('troll-pre'); root.dataset.mo = 'o'; setF([1, 1, 1], 1); look(1, -1); }, 200);
            later(() => { const f = E('div', 'troll-flash'); fx.append(f); f.animate([{ opacity: 0 }, { opacity: .95, offset: .35 }, { opacity: 0 }], { duration: 620 * k(), easing: 'ease-out' }).onfinish = () => f.remove(); }, 520);
            later(petrify, 740);
          } else if (mood === 'achievement') later(() => nodNow([{ transform: 'none' }, { transform: 'translateY(-4px) rotate(-2deg)', offset: .3 }, { transform: 'translateY(-4px) rotate(-2deg)', offset: .75 }, { transform: 'none' }], 1900), 250);
        }
        // idle life: slow blinks, glances, a brow that follows, a finger that scratches
        function mind() {
          if (R.stone) { later(mind, 2000); return; }
          const r = Math.random();
          if (r < .42) lids.forEach((l, i) => l.animate([{ transform: 'none' }, { transform: 'translateY(11px)', offset: .4 }, { transform: 'translateY(11px)', offset: .58 }, { transform: 'none' }], { duration: 430 * k(), delay: i * 90 * k(), easing: 'ease-in-out' }));
          else if (r < .78) {
            const m = M[R.mood], g = [[.3 - (m.px || 0), 2.8 - (m.py || 0)], [-(m.px || 0), -(m.py || 0)], [.6, -2.8], [2.8, -2], [-2.8, -.4]][(Math.random() * 5) | 0];
            look(g[0], g[1], 900 + Math.random() * 900);
            if (g[1] < -1) later(() => bts[(Math.random() * 2) | 0].animate([{ transform: 'none' }, { transform: 'translateY(-2.5px)', offset: .3 }, { transform: 'translateY(-2.5px)', offset: .7 }, { transform: 'none' }], { duration: 1500 * k(), easing: 'ease-in-out' }), 420);
          } else {
            const f = fgR[(Math.random() * 3) | 0], a = 'scaleY(.97)';
            f.animate([{ transform: a }, { transform: 'scaleY(.74) rotate(7deg)' }, { transform: a }, { transform: 'scaleY(.78) rotate(5deg)' }, { transform: a }, { transform: 'scaleY(.8) rotate(6deg)' }, { transform: a }], { duration: 1100 * k(), easing: 'ease-in-out' });
          }
          later(mind, 900 + Math.random() * 1700);
        }
        const rot = (x, y, ox, oy, a) => { const c = Math.cos(a), s = Math.sin(a); return [ox + (x - ox) * c - (y - oy) * s, oy + (x - ox) * s + (y - oy) * c]; };
        const f1 = (n) => n.toFixed(1);
        R.frame = (f) => {
          const t = f.t; let dt = t - R.t0; R.t0 = t; if (!(dt > 0)) dt = 16; if (dt > 60) dt = 60;
          if (f.phase !== R.last) { if (f.phase === 'read' && !still && !ctx.reduced) business(); if (f.phase === 'leave') R.tL = t; R.last = f.phase; }
          const stone = R.stone, read = f.phase === 'read';
          // the burner: long hard blasts while climbing, a pilot flame and a cough while hanging
          let want;
          if (stone) want = .1;
          else if (f.phase === 'arrive') want = (t % 900) < 540 ? 1 : .16;
          else if (f.phase === 'leave') want = t - R.tL < 700 ? 1 : f.burn > .14 ? ((t % 1150) < 600 ? .95 : .2) : .14;
          else want = (t % 2900) < 320 ? .8 : .12;
          R.fl += (want - R.fl) * Math.min(1, dt * (want > R.fl ? .02 : .007));
          const fl = R.fl;
          // weight: he sinks between blasts
          const sagT = (stone ? 5 : 0) + (read ? 1.5 + 2.5 * Math.sin(t * .0016) + (1 - fl) * 2 : (1 - fl) * 7);
          R.sag += (sagT - R.sag) * Math.min(1, dt * .0045);
          const br = stone ? 0 : 1.4 * Math.sin(t * .0015);
          // the car: a long slow swing under the envelope
          R.cv += ((f.swing * .8 - R.ca) * 5.5e-6 - R.cv * .0011) * dt; R.ca += R.cv * dt;
          R.ca = Math.max(-9, Math.min(9, R.ca));
          // the sign: a two-rope pendulum under the car, a little behind it
          R.sv += ((f.swing * 4 + R.ca - R.sa) * 1.7e-5 - R.sv * .0017) * dt; R.sa += R.sv * dt;
          R.sa = Math.max(-44, Math.min(44, R.sa));
          const ea = f.lean * .9 + .7 * Math.sin(t * .0011 + 1), sx = 1 - .012 * fl + .006 * Math.sin(t * .0023), sy = 1 + .03 * fl;
          const caR = R.ca * Math.PI / 180, eaR = ea * Math.PI / 180;
          const carP = (x, y) => { const p = rot(x, y, 105, 100, caR); p[1] += br; return p; };
          const envP = (x, y) => rot(105 + (x - 105) * sx, 112 + (y - 112) * sy, 105, 112, eaR);
          const loc = (p) => rot(p[0], p[1] - br, 105, 100, -caR);
          sag.style.transform = `translateY(${f1(R.sag)}px)`;
          env.style.transform = `rotate(${ea.toFixed(2)}deg) scale(${sx.toFixed(3)},${sy.toFixed(3)})`;
          flEl.style.transform = `scale(${(.55 + .55 * fl).toFixed(2)},${(.2 + 1.35 * fl).toFixed(2)})`;
          car.style.transform = `translateY(${f1(br)}px) rotate(${R.ca.toFixed(2)}deg)`;
          const tr = -R.ca * .8 - f.lean * 1.5;
          hpL.style.transform = `rotate(${(tr + 2.2 * Math.sin(t * .0013)).toFixed(2)}deg)`;
          hpR.style.transform = `rotate(${(tr + 2.2 * Math.sin(t * .0012 + 2)).toFixed(2)}deg)`;
          R.hd += (R.hdT - R.hd) * Math.min(1, dt * .0035); R.hr += (R.hrT - R.hr) * Math.min(1, dt * .003);
          head.style.transform = `translateY(${f1(R.hd - (stone ? 0 : 1.1 * Math.sin(t * .0015 - .6)))}px) rotate(${(R.hr - R.ca * .25).toFixed(2)}deg)`;
          const e1 = loc(envP(38, 69)), e2 = loc(envP(172, 69));
          const d1 = `M${f1(e1[0])},${f1(e1[1])}Q29,160 55,204M${f1(e2[0])},${f1(e2[1])}Q181,160 155,204`;
          mr[0].setAttribute('d', d1); mr[1].setAttribute('d', d1);
          const aL = carP(55, 247), aR = carP(155, 247), th = R.sa * Math.PI / 180, L = 21.5;
          const dx = (aL[0] + aR[0]) / 2 - 105 - L * Math.sin(th), dy = (aL[1] + aR[1]) / 2 - 247 + R.sag - L * (1 - Math.cos(th));
          sign.style.transform = `translate(${f1(dx)}px,${f1(dy)}px)`;
          const d2 = `M${f1(aL[0])},${f1(aL[1] + R.sag)}L${f1(38.5 + dx)},${f1(268.5 + dy)}M${f1(aR[0])},${f1(aR[1] + R.sag)}L${f1(171.5 + dx)},${f1(268.5 + dy)}`;
          sr[0].setAttribute('d', d2); sr[1].setAttribute('d', d2);
        };
        R.poke = (n2) => {
          const mood = M[n2.mood] ? n2.mood : 'calibrating';
          if (ctx.reduced) { fill(sign, n2); if (mood !== R.mood) setMood(mood); return; }
          look(.8, 2.8, 800);
          pk.animate([{ transform: 'none' }, { transform: 'translateY(-15px) rotate(-7deg)', offset: .45 }, { transform: 'none' }], { duration: 430 * k(), easing: 'ease-in-out' });
          later(() => { fill(sign, n2); R.sv += (R.sa > 0 ? -1 : 1) * .17; if (mood !== R.mood) setMood(mood); }, 190);
        };
        R.boot = () => later(() => { const b = svg(BOOT); fx.append(b); b.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate(10px,-16px) rotate(-30deg)', opacity: 1, offset: .16, easing: 'cubic-bezier(.5,0,1,.6)' }, { transform: 'translate(38px,230px) rotate(320deg)', opacity: 0 }], { duration: 1500 * k() }).onfinish = () => b.remove(); }, 1250);
        R.stop = () => { R.dead = true; timers.forEach(clearTimeout); timers.clear(); };
        const mood = M[n.mood] ? n.mood : 'calibrating';
        if (still && mood === 'death') { R.stone = true; root.classList.add('troll-stone'); }
        setMood(mood, !still && !ctx.reduced);
        R.hd = R.hdT; R.hr = R.hrT;
        fill(sign, n);
        if (!ctx.reduced) later(mind, 600 + Math.random() * 900);
        return R;
      }

      return {
        show(n) {
          const R = make(n, false);
          R.root.style.visibility = 'hidden'; ctx.front.append(R.root);
          const h = R.root.offsetHeight + (n.kind === 'kill' && !n.more ? 22 : 0); R.root.style.visibility = '';
          if (ctx.reduced && R.mood === 'death') { R.stone = true; R.root.classList.add('troll-stone'); }
          const fl = ctx.fly(R.root, { w: W, h, frame: R.frame });
          R.flight = fl; live.add(R);
          if (ctx.reduced) R.frame({ lean: 0, swing: 0, phase: 'read', t: 0, vy: 0, burn: .12 }); else R.boot();
          fl.gone.then(() => { R.stop(); live.delete(R); });
          return { update(n2) { if (R.dead) return; R.poke(n2); fl.extend(700); } };
        },
        still(n) {
          const R = make(n, true);
          R.frame({ lean: 0, swing: 0, phase: 'read', t: performance.now(), vy: 0, burn: .12 });
          if (!ctx.reduced) { stills.add(R); if (!ticking) { ticking = true; requestAnimationFrame(tick); } }
          return R.root;
        },
        clear() { for (const R of [...live]) { R.stop(); R.flight.end(); } live.clear(); },
      };
    },
  });
})();
