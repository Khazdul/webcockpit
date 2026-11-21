// Round 4, skin 2: "Goblin, the balloon says it". The gloomy goblin of the
// original, drawn as a tinted engraving (the round 3 warden's finish), arms
// folded on the basket rim. The ENVELOPE carries the rating (shape, colour
// and dressing all change), so it still reads when the balloon is far away.
// The notice is a canvas banner laced to a pole under the basket: it unrolls
// on arrival and rolls up again as the balloon leaves.
(() => {
  const NS = 'http://www.w3.org/2000/svg', INK = '#23170f', MY = 130;
  const n1 = (v) => +v.toFixed(1);

  // ---- moods: the face (ears first), and how the head is held ----
  const DEF = { el: 8, er: 10, bly: 0, blr: 0, bry: 0, brr: 0, lid: 1.6, low: 0, px: 0, py: 0, hy: 0, hr: 0, hat: 0 };
  const M = {
    calibrating: { el: -16, er: 20, bly: -4, blr: -9, bry: 1.2, lid: 1.8, hr: -4, mo: 'flat' },
    poor: { el: 40, er: 44, bly: -1, bry: -1, blr: -13, brr: 13, lid: 3.4, py: 1.4, hy: 3, mo: 'frown' },
    meh: { el: 20, er: 22, bly: 1.4, bry: 1.4, lid: 3.9, mo: 'wavy' },
    good: { el: -2, er: -4, blr: 3, brr: -3, lid: 1.2, mo: 'smirk' },
    great: { el: -22, er: -25, bly: -3, bry: -3.4, lid: .1, hy: -2, mo: 'grin' },
    superb: { el: -44, er: -40, bly: -4.6, bry: -4.6, blr: -7, brr: 7, lid: 2.9, hy: -1, hat: 1, mo: 'o' },
    pvp: { el: -30, er: -30, bly: 2.6, bry: 2.6, blr: 17, brr: -17, lid: 2.5, low: 2.2, hy: 2, mo: 'fang' },
    levelup: { el: -36, er: -42, bly: -5, bry: -5.4, lid: -1.2, py: -1.2, hy: -3, mo: 'grin' },
    death: { el: 52, er: 55, bly: -1, bry: -1, blr: -11, brr: 11, lid: 5.6, py: 2, hy: 4, hr: 3, mo: 'frown' },
    achievement: { el: -12, er: -15, bly: -3, bry: -3, lid: 4.1, hy: -3, hr: -3, mo: 'smirk' },
  };
  const RANK = { poor: 1, meh: 2, good: 3, great: 4, superb: 5 };
  const vars = (o) => Object.keys(o).filter((k) => k in DEF).map((k) => `--${k}:${o[k]}`).join(';');

  Harness.css('goblin-envelope', `
.genv{${vars(DEF)};--sk:#7d8a5b;--skd:#55623d;--skl:#aab383;--f1:#e58a2c;--f2:#ffeeb0;--gl:255,176,88;--go:.9;--gx:0;--gy:0;position:relative;width:200px;pointer-events:none}
${Object.keys(M).map((m) => `.genv[data-mood=${m}]{${vars(M[m])}}`).join('\n')}
.genv[data-mood=death]{--sk:#9a9f97;--skd:#6c716b;--skl:#c3c7bf;--f1:#4f86bd;--f2:#dcefff;--gl:120,170,230}
.genv[data-mood=superb]{--f1:#e2ad2f;--f2:#fff8cf;--gl:255,214,110}
.genv[data-mood=pvp]{--f1:#b8261a;--f2:#ff9d70;--gl:255,80,50}
.genv[data-sky=dusk]{--go:.7}.genv[data-sky=day]{--go:.3}.genv[data-sky=overcast]{--go:.42}
.genv svg{position:absolute;overflow:visible;display:block}
.genv svg *{transform-box:view-box}
.genv[data-sky=night] .genv-rim{filter:drop-shadow(0 0 .7px rgba(255,232,190,.6))}
.genv[data-sky=dusk] .genv-rim{filter:drop-shadow(0 0 .6px rgba(255,226,190,.35))}
.genv-env{position:absolute;left:0;top:0;width:200px;height:0;transform-origin:100px ${MY}px;will-change:transform;z-index:8}
.genv-ebr{position:absolute;left:0;top:0;width:200px;height:0;transform-origin:100px ${MY}px;animation:genv-ebr 4.6s ease-in-out infinite alternate}
.genv[data-mood=poor] .genv-ebr{animation:genv-sink 3.8s ease-in-out infinite}
.genv[data-mood=death] .genv-ebr{animation:genv-ghost 6.4s ease-in-out infinite alternate}
.genv-eh{position:absolute;left:0;top:0;transition:opacity .55s ease-in-out}
.genv-eh.genv-out{opacity:0}
.genv-esvg{left:0;top:-30px}
.genv-pen{position:absolute;width:0;height:0;transform-origin:0 0;animation:genv-pen 1.9s ease-in-out infinite alternate}
.genv-pen svg{left:0;top:-10px}
.genv-pen path{animation:genv-flut 1.3s ease-in-out infinite alternate;transform-origin:0 0}
.genv-puff{position:absolute;width:9px;height:9px;margin:-4px;border-radius:50%;background:rgba(214,208,196,.75);box-shadow:inset 0 0 0 .8px rgba(35,23,15,.5);opacity:0;animation:genv-puff 3.8s ease-out infinite}
.genv-glow{position:absolute;left:55px;top:${MY - 62}px;width:90px;height:84px;border-radius:50%;background:radial-gradient(closest-side,rgba(var(--gl),.6),rgba(var(--gl),.2) 50%,rgba(var(--gl),0));opacity:.2;z-index:9;will-change:opacity}
.genv-fl{position:absolute;left:100px;top:${MY + 9}px;width:0;height:0;z-index:10;transform-origin:0 0;will-change:transform}
.genv-fl svg{left:-10px;top:-30px;animation:genv-fk .23s steps(3) infinite alternate;transform-origin:10px 30px}
.genv-f1{fill:var(--f1)}.genv-f2{fill:var(--f2)}
.genv-car{position:relative;padding:256px 0 9px;transform-origin:100px ${MY}px;will-change:transform}
.genv-l{position:absolute;left:0;top:0;width:200px;height:0}
.genv-head{position:absolute;left:100px;top:174px;width:0;height:0;z-index:5}
.genv-pose{transform:translateY(calc(var(--hy)*1px)) rotate(calc(var(--hr)*1deg));transition:transform .5s cubic-bezier(.3,1.3,.5,1);transform-origin:0 30px}
.genv-nod{transform-origin:0 30px}
.genv-hbr{animation:genv-hbr 3.7s ease-in-out infinite alternate;transform-origin:0 30px}
.genv-hsvg{left:-96px;top:-74px}
.genv-sk{fill:var(--sk)}.genv-skd{fill:var(--skd)}.genv-skl{fill:var(--skl)}
.genv-sk,.genv-skd,.genv-skl,.genv-lid,.genv-low{transition:fill .6s}
.genv-eL{transform:rotate(calc(var(--el)*1deg))}.genv-eR{transform:rotate(calc(var(--er)*1deg))}
.genv-eL,.genv-eR{transition:transform .45s cubic-bezier(.3,1.5,.5,1)}
.genv-bL{transform:translateY(calc(var(--bly)*1px)) rotate(calc(var(--blr)*1deg))}
.genv-bR{transform:translateY(calc(var(--bry)*1px)) rotate(calc(var(--brr)*1deg))}
.genv-bL,.genv-bR,.genv-pm,.genv-lid,.genv-low{transition:transform .35s ease-out}
.genv-pm{transform:translate(calc(var(--px)*1px),calc(var(--py)*1px))}
.genv-pg{transform:translate(calc(var(--gx)*1px),calc(var(--gy)*1px));transition:transform .17s ease-out}
.genv-lid{transform:translateY(calc(var(--lid)*1px));fill:var(--skd);stroke:${INK};stroke-width:.8}
.genv-low{transform:translateY(calc(var(--low)*-1px));fill:var(--sk);stroke:${INK};stroke-width:.6}
.genv-mo{opacity:0;transition:opacity .25s}
${Object.keys(M).map((m) => `.genv[data-mood=${m}] .genv-mo-${M[m].mo}`).join(',')}{opacity:1}
.genv-hat{opacity:var(--hat);transform:translateY(calc((1 - var(--hat))*-14px)) rotate(calc((1 - var(--hat))*-30deg));transition:opacity .25s,transform .5s cubic-bezier(.3,1.5,.5,1)}
.genv-hatw{animation:genv-hatw 2.6s ease-in-out infinite alternate}
.genv-blow{opacity:var(--hat)}
.genv-tube{animation:genv-tube 2.9s ease-in-out infinite}
.genv-curl{animation:genv-curl 2.9s ease-in-out infinite}
.genv-arms{z-index:6;top:2px}
.genv-hand{position:absolute;left:0;top:0;width:200px;height:0;transition:transform .5s ease-in-out}
.genv[data-mood=meh] .genv-fg{animation:genv-drum 2.4s ease-in-out infinite;animation-delay:calc(var(--i)*.09s)}
.genv-x{z-index:7}
.genv-trail{position:absolute;width:0;height:0;transform-origin:0 0;will-change:transform}
.genv-sway{animation:genv-sway 2.7s ease-in-out infinite alternate;transform-origin:0 0}
.genv-conf{position:absolute;left:0;top:0;width:200px;height:0;z-index:11}
.genv-conf i{position:absolute;top:0;width:5px;height:3px;border-radius:.6px;opacity:0;animation:genv-conf 3.4s linear infinite}
.genv-fz{animation:genv-fz .3s steps(2) infinite}
.genv-rk,.genv-bst{position:absolute;width:0;height:0;z-index:12}
.genv-ban{position:relative;z-index:3;width:150px;margin:0 auto;transform-origin:50% 0;will-change:transform;text-align:center;color:#2a1b0f;--dim:#5b4630;--k1:#8d8266;--k2:#cdc1a0;font-family:"Cormorant Garamond",Georgia,serif}
.genv-cloth{position:relative;box-sizing:border-box;min-height:44px;padding:13px 7px 12px;border:solid var(--k1);border-width:0 3px 5px;background:linear-gradient(90deg,rgba(50,32,14,.2),rgba(50,32,14,0) 14%,rgba(255,250,230,.12) 60%,rgba(50,32,14,.14)),repeating-linear-gradient(0deg,rgba(90,66,36,.08) 0 1px,transparent 1px 3px),#e3d7b6;box-shadow:inset 0 -2px 0 var(--k2),inset 0 5px 5px -3px rgba(35,23,15,.55),inset 2px 0 0 -1px rgba(35,23,15,.35),inset -2px 0 0 -1px rgba(35,23,15,.35),0 0 0 .8px rgba(35,23,15,.75)}
.genv-rolled .genv-cloth{clip-path:inset(0 0 calc(100% - 9px) 0)}
.genv-cloth>div:empty{display:none}
.genv-run{position:absolute;inset:0;pointer-events:none}
.genv-rolled .genv-run{transform:translateY(calc(-100% + 13px))}
.genv-rodx{position:absolute;left:-7px;right:-7px;bottom:-5px;height:9px;will-change:transform}
.genv-rod{position:absolute;inset:1.5px 0;border-radius:3px;background:linear-gradient(#b99668,#7c5c39 55%,#4c3420);box-shadow:inset 0 0 0 1px rgba(35,23,15,.9)}
.genv-rod::before,.genv-rod::after{content:"";position:absolute;top:-2px;width:5px;height:10px;border-radius:2.5px;background:#6b4c2d;box-shadow:inset 0 0 0 1px rgba(35,23,15,.9)}
.genv-rod::before{left:-3px}.genv-rod::after{right:-3px}
.genv-roll{position:absolute;left:5px;right:5px;top:-2.5px;bottom:-2.5px;border-radius:6px/7px;background:linear-gradient(#f0e6c8,#d6c9a5 40%,#9c8e6c 85%,#7b6e52);border:solid var(--k1);border-width:0 3px;box-shadow:0 0 0 .9px rgba(35,23,15,.85),inset 0 -3px 0 -1px rgba(35,23,15,.25);transform:scaleY(.6)}
.genv-rolled .genv-roll{transform:none}
.genv-title{font:italic 600 16px/1.05 "Cormorant Garamond",Georgia,serif;text-wrap:balance;overflow-wrap:anywhere}
.genv-fig{font:600 25px/1 "Cormorant Garamond",Georgia,serif;font-variant-numeric:lining-nums;white-space:nowrap;margin-top:1px}
.genv-unit{font:italic 500 15px/1 "Cormorant Garamond",Georgia,serif;margin-left:4px;color:var(--dim)}
.genv-rate{display:flex;justify-content:center;align-items:center;gap:6px;margin-top:3px;min-height:13px}
.genv-rate svg{position:static;flex:none}
.genv-word{font:400 12.5px/1 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.16em;margin-right:-.16em}
.genv-q{font:italic 400 15px/.8 "IM Fell English",Georgia,serif;color:var(--dim)}
.genv-more{font:italic 500 13px/1.08 "Cormorant Garamond",Georgia,serif;color:var(--dim);margin-top:3px;text-wrap:balance}
.genv-tag{font:400 11px/1.3 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.24em;margin-right:-.24em;text-transform:uppercase;color:#7a2a1f}
.genv-ban[data-kind=levelup] .genv-fig{font:700 22px/1.25 "Cinzel",Georgia,serif;letter-spacing:.03em;color:#6b4a12;padding:5px 0 2px}
.genv-ban[data-kind=death] .genv-cloth{background-color:#cfcbc0}
.genv-ban[data-kind=death] .genv-fig{font:400 22px/1.3 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.14em;margin-right:-.14em;text-transform:lowercase;font-variant:small-caps;padding:6px 0 3px}
.genv-ban[data-kind=achievement]{width:164px}
.genv-ban[data-kind=achievement] .genv-title{font:italic 600 13.5px/1.1 "Cormorant Garamond",Georgia,serif}
.genv-ban[data-mood=pvp] .genv-word,.genv-ban[data-mood=pvp] .genv-title{color:#7c1d14}
.genv-still{margin-top:14px}
.genv-rm *,.genv-rm *::before{animation:none!important;transition:none!important}
@keyframes genv-ebr{from{transform:scale(1,1)}to{transform:scale(1.014,.988) rotate(.5deg)}}
@keyframes genv-sink{0%,52%,100%{transform:none}60%{transform:translateY(4.5px) scale(.985,.97) rotate(-1.2deg)}72%{transform:translateY(5px) scale(.98,.972) rotate(-.6deg)}}
@keyframes genv-ghost{from{transform:rotate(-2.6deg) scale(1,1.01)}to{transform:rotate(2.6deg) scale(1.012,.99)}}
@keyframes genv-pen{from{transform:rotate(-7deg)}to{transform:rotate(9deg)}}
@keyframes genv-flut{from{transform:skewY(-5deg) scaleX(1)}to{transform:skewY(7deg) scaleX(.93)}}
@keyframes genv-puff{0%,50%{opacity:0;transform:none}54%{opacity:.9;transform:translate(-3px,-1px) scale(.5)}100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(2.3)}}
@keyframes genv-fk{from{transform:scale(1,1) skewX(-3deg)}to{transform:scale(.86,1.1) skewX(4deg)}}
@keyframes genv-hbr{from{transform:translateY(.5px) rotate(-.5deg)}to{transform:translateY(-1.3px) rotate(.6deg)}}
@keyframes genv-hatw{from{transform:rotate(-3deg)}to{transform:rotate(4deg)}}
@keyframes genv-tube{0%,48%,92%,100%{transform:scaleX(.26)}56%{transform:scaleX(1.06)}62%,82%{transform:scaleX(1)}}
@keyframes genv-curl{0%,48%,92%,100%{transform:translateX(-25px) scale(1)}56%{transform:translateX(2px) scale(.5)}62%,82%{transform:translateX(0) scale(.45)}}
@keyframes genv-drum{0%,40%,70%,100%{transform:none}47%{transform:rotate(-13deg)}54%{transform:rotate(2deg)}}
@keyframes genv-sway{from{transform:rotate(-5deg) scaleY(1)}to{transform:rotate(6deg) scaleY(.96)}}
@keyframes genv-conf{0%{opacity:0;transform:translate(0,40px) rotate(0)}8%{opacity:.95}85%{opacity:.9}100%{opacity:0;transform:translate(var(--dx),300px) rotate(var(--r))}}
@keyframes genv-fz{from{opacity:1;transform:scale(1)}to{opacity:.5;transform:scale(.6) rotate(40deg)}}
`);

  // ---- the engraver's kit (the warden's): pen wobble + a grainy wash, and hatching ----
  const FILT = (id) => `<filter id="${id}" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.7" xChannelSelector="R" yChannelSelector="G" result="d"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .16 0 0 0 0 .09 0 0 0 0 .04 1.5 0 0 0 -.7" result="b"/><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="11"/><feColorMatrix type="matrix" values="0 0 0 0 .14 0 0 0 0 .08 0 0 0 0 .04 0 1.2 0 0 -.56" result="g"/><feMerge result="m"><feMergeNode in="b"/><feMergeNode in="g"/></feMerge><feComposite in="m" in2="d" operator="in" result="mc"/><feMerge><feMergeNode in="d"/><feMergeNode in="mc"/></feMerge></filter>`;
  const HATCH = (id, rot, gap, op) => `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${gap}" height="${gap}" patternTransform="rotate(${rot})"><path d="M0,.5H${gap}" stroke="${INK}" stroke-width=".55" opacity="${op}"/></pattern>`;
  // SVG: placed at its own origin; RIG: placed in the rig's coordinates (x from the centre line)
  const SVG = (cls, x, y, w, h, inner, ox = 0) => `<svg class="${cls}" xmlns="${NS}" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}" style="left:${x + ox}px;top:${y}px">${inner}</svg>`;
  const RIG = (cls, x, y, w, h, inner) => SVG(cls, x, y, w, h, inner, 100);
  const G = 'stroke="' + INK + '" stroke-linejoin="round" stroke-linecap="round"';

  // ---- the envelope: a profile, swept into an outline, gores and dressing ----
  function prof(P) {
    const N = 40, pts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      let r;
      if (t <= P.tm) { const a = (P.tm - t) / P.tm; r = P.R * Math.sqrt(1 - a * a); } else { const u = (t - P.tm) / (1 - P.tm); r = P.m + (P.R - P.m) * Math.pow(Math.cos(u * Math.PI / 2), P.p); }
      let rr = r, l = r;
      if (P.dent) { rr = r * (1 - P.dent[2] * Math.exp(-(((t - P.dent[0]) / P.dent[1]) ** 2))); l = r * (1 + .1 * Math.exp(-(((t - .5) / .2) ** 2))); }
      pts.push({ y: MY - P.H * (1 - t), c: (P.sh || 0) * Math.pow(1 - t, 1.4), l, r: rr });
    }
    return pts;
  }
  const X = (p, f) => p.c + (f < 0 ? f * p.l : f * p.r);
  const line = (pts, f, cmd = 'M') => pts.map((p, i) => (i ? 'L' : cmd) + n1(X(p, f)) + ',' + n1(p.y)).join('');
  const gore = (pts, a, b) => line(pts, a) + line(pts.slice().reverse(), b, 'L') + 'Z';
  const F = [-1, -.9, -.62, -.22, .22, .62, .9, 1];
  const bow = (y, d = 13) => `M-100,${n1(y)}Q0,${n1(y + d)} 100,${n1(y)}`;
  const bowY = (x, y, d = 13) => y + d * .5 * (1 - (x / 100) ** 2);
  const patch = (x, y, w, h, rot, col) => `<g transform="translate(${x},${y}) rotate(${rot})"><rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="${col}" stroke="${INK}" stroke-width=".8"/><rect x="${-w / 2 + 2}" y="${-h / 2 + 2}" width="${w - 4}" height="${h - 4}" fill="none" stroke="#e9dfc2" stroke-width=".8" stroke-dasharray="2.2 2" opacity=".85"/></g>`;
  const star = (x, y, r) => `<path d="M${n1(x)},${n1(y - r)}L${n1(x + r * .28)},${n1(y - r * .28)}L${n1(x + r)},${n1(y)}L${n1(x + r * .28)},${n1(y + r * .28)}L${n1(x)},${n1(y + r)}L${n1(x - r * .28)},${n1(y + r * .28)}L${n1(x - r)},${n1(y)}L${n1(x - r * .28)},${n1(y - r * .28)}Z"/>`;
  const leaf = (x, y, a, c) => `<path transform="translate(${n1(x)},${n1(y)}) rotate(${n1(a)})" d="M0,0C3,-4 9,-4 13,0C9,4 3,4 0,0Z" fill="${c}" stroke="${INK}" stroke-width=".5"/>`;
  const pen = (x, y, len, col, o = {}) => `<div class="genv-pen" style="left:${n1(100 + x)}px;top:${n1(y)}px;animation-delay:${o.d || 0}s"><svg xmlns="${NS}" width="${len + 4}" height="24" viewBox="-2 -10 ${len + 4} 24"><path d="${o.rag ? `M0,-6C${len * .3},-9 ${len * .6},-2 ${len},-5L${len * .86},-2L${len * .97},1L${len * .8},3L${len * .9},7C${len * .6},9 ${len * .3},3 0,6Z` : o.sw ? `M0,-4C${len * .3},-8 ${len * .6},0 ${len},-5L${len * .84},0L${len},5C${len * .6},8 ${len * .3},0 0,4Z` : `M0,-5C${len * .3},-8 ${len * .6},1 ${len},-1C${len * .6},6 ${len * .3},1 0,5Z`}" fill="${col}" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/><path d="M${len * .15},0Q${len * .4},-3 ${len * .7},0" fill="none" stroke="${o.hi || '#fff'}" stroke-width=".7" opacity=".4"/></svg></div>`;
  const staff = (x, top, h = 11) => `<path d="M${n1(x)},${n1(top + 2)}V${n1(top - h)}" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/>`;

  const ENV = {
    calibrating: {
      P: { R: 80, H: 118, tm: .42, p: .88, m: 15 }, c: '#cfc3a2', k: ['#8d8266', '#cfc3a2'],
      paint: (g) => `<g fill="none" stroke="#f6f2e6" stroke-width="1.1" stroke-linecap="round" opacity=".9"><path d="M-58,${g.eq - 22}L-30,${g.eq - 34}" stroke-dasharray="4 3"/><path d="M-62,${g.eq + 18}q10,-5 18,2M-60,${g.eq + 12}l4,8" /><path d="M42,${g.eq - 30}l8,8M50,${g.eq - 30}l-8,8"/><path d="M36,${g.eq + 22}L62,${g.eq + 12}" stroke-dasharray="4 3"/><path d="M48,${g.eq + 6}l5,5l-7,2"/><path d="M-20,${g.top + 14}h14" stroke-dasharray="2 3"/></g>
<g transform="translate(0,${g.eq + 4}) rotate(-5)"><rect x="-23" y="-27" width="46" height="54" fill="#a3966f" stroke="${INK}" stroke-width=".9"/><rect x="-20" y="-24" width="40" height="48" fill="none" stroke="#f1e8cd" stroke-width="1.1" stroke-dasharray="3 2.4"/><text x="0" y="17" text-anchor="middle" font-family="Cormorant Garamond,Georgia,serif" font-weight="600" font-size="50" fill="#33261a">?</text></g>`,
    },
    poor: {
      P: { R: 64, H: 96, tm: .52, p: .7, m: 14, sh: -17, dent: [.2, .2, .5] }, c: '#817e75', k: ['#5d5a53', '#8f8b80'], weave: 1, seam: .4,
      paint: (g) => patch(-36, g.eq - 12, 22, 18, 12, '#5d6a49') + patch(-4, g.eq + 14, 18, 24, -8, '#8d6a48') + patch(-30, g.eq + 30, 16, 13, 24, '#655a70') + patch(-14, g.top + 22, 20, 14, -16, '#a39a80') + patch(18, g.eq + 34, 14, 14, 6, '#4f4a45') + patch(-52, g.eq + 10, 13, 16, -4, '#9a7a44')
        + `<path d="M${n1(g.cx + 4)},${g.top + 6}C${n1(g.cx + 26)},${g.top + 20} ${n1(g.cx + 30)},${g.top + 34} ${n1(g.cx + 44)},${g.top + 46}M${n1(g.cx + 14)},${g.top + 26}q10,2 14,12M${n1(g.cx + 30)},${g.top + 50}q8,6 6,16" fill="none" stroke="${INK}" stroke-width=".8" opacity=".75"/>`,
      html: (g) => [0, 1, 2].map((i) => `<i class="genv-puff" style="left:${n1(100 + X(g.pts[26], -1) - 1)}px;top:${n1(g.pts[26].y)}px;--dx:${-16 - i * 5}px;--dy:${-10 + i * 7}px;animation-delay:${i * .13}s"></i>`).join(''),
    },
    meh: {
      P: { R: 70, H: 112, tm: .46, p: 1.05, m: 14 }, c: '#a59046', k: ['#77682f', '#a59046'],
      paint: (g) => patch(26, g.eq + 6, 20, 17, 8, '#7f7446'),
    },
    good: {
      P: { R: 85, H: 122, tm: .4, p: .84, m: 15 }, c: '#c2964c', c2: '#9a4a3b', k: ['#9a4a3b', '#c2964c'], rope: 1,
      back: (g) => staff(0, g.top),
      html: (g) => pen(0, g.top - 9, 34, '#5f7d4a'),
    },
    great: {
      P: { R: 79, H: 134, tm: .36, p: .9, m: 14 }, c: '#2a4476', c2: '#213864', k: ['#27406f', '#b9c2cf'], rimc: '#c8d6f0',
      paint: (g) => `<path d="${bow(g.eq + 4)}" fill="none" stroke="#14233f" stroke-width="22"/><path d="${bow(g.eq - 7)}M-100,${g.eq + 15}Q0,${g.eq + 28} 100,${g.eq + 15}" fill="none" stroke="#c4ccd8" stroke-width="1.2"/><g fill="#dde3ec" stroke="${INK}" stroke-width=".4">${[-64, -44, -22, 0, 22, 44, 64].map((x, i) => star(x, bowY(x, g.eq + 4), i % 2 ? 4.2 : 6.4)).join('')}</g><g fill="#dde3ec" opacity=".8">${[[-30, g.top + 22], [24, g.top + 30], [-8, g.top + 40], [44, g.eq + 34], [-40, g.eq + 38], [6, g.eq + 46]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.1"/>`).join('')}</g>`,
      over: (g) => `<g fill="#c9b36a" stroke="${INK}" stroke-width=".6">${[-70, -50, -28, -6, 16, 38, 58, 73].map((x) => { const y = bowY(x, g.eq + 15); return `<path d="M${x},${n1(y)}v3.500l-2.200,7h4.400l-2.200,-7"/><circle cx="${x}" cy="${n1(y + 3)}" r="1.700"/>`; }).join('')}</g>`,
      back: (g) => staff(-4, g.top, 13) + staff(5, g.top, 9),
      html: (g) => pen(-4, g.top - 11, 58, '#b9c2cf', { sw: 1 }) + pen(5, g.top - 7, 44, '#3b5a93', { sw: 1, d: -.7 }),
    },
    superb: {
      P: { R: 86, H: 120, tm: .4, p: .8, m: 15 }, c: '#a5332b', c2: '#d1a344', k: ['#a5332b', '#d1a344'], rimc: '#ffe9b0',
      paint: (g) => { let r = ''; for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, r1 = 16, r2 = i % 2 ? 23 : 28; r += `M${n1(Math.cos(a - .13) * r1)},${n1(Math.sin(a - .13) * r1)}L${n1(Math.cos(a) * r2)},${n1(Math.sin(a) * r2)}L${n1(Math.cos(a + .13) * r1)},${n1(Math.sin(a + .13) * r1)}Z`; } return `<g transform="translate(0,${g.eq - 14})"><circle r="32" fill="#7c2019" stroke="${INK}" stroke-width=".9"/><path d="${r}" fill="#e2b950" stroke="${INK}" stroke-width=".5"/><circle r="14.500" fill="#e9c35c" stroke="${INK}" stroke-width=".8"/><path d="M-6,-3q2,-2.500 4,0M2,-3q2,-2.500 4,0M-5,4q5,4 10,0" fill="none" stroke="${INK}" stroke-width=".8" stroke-linecap="round"/></g>`; },
      over: (g) => { let s = '', k = 0; for (const [a, b] of [[-84, -30], [-30, 30], [30, 84]]) { s += `<path d="M${a},${n1(bowY(a, g.eq + 20))}Q${(a + b) / 2},${n1(bowY((a + b) / 2, g.eq + 20) + 17)} ${b},${n1(bowY(b, g.eq + 20))}" fill="none" stroke="${INK}" stroke-width=".9"/>`; for (let j = 0; j < 5; j++) { const t = (j + .5) / 5, x = a + (b - a) * t, y = bowY(a, g.eq + 20) * (1 - t) ** 2 + 2 * t * (1 - t) * (bowY((a + b) / 2, g.eq + 20) + 17) + bowY(b, g.eq + 20) * t * t; s += `<path d="M${n1(x - 4.5)},${n1(y - .5)}L${n1(x + 4.5)},${n1(y - .5)}L${n1(x)},${n1(y + 10)}Z" fill="${['#e9dfc2', '#5f7d4a', '#e2b950'][k++ % 3]}" stroke="${INK}" stroke-width=".6"/>`; } } return s + [-84, -30, 30, 84].map((x) => `<circle cx="${x}" cy="${n1(bowY(x, g.eq + 20))}" r="2.600" fill="#e2b950" stroke="${INK}" stroke-width=".6"/>`).join(''); },
      back: (g) => `<path d="M0,${g.top + 3}V${g.top - 6}" stroke="${INK}" stroke-width="3.400"/><path d="M0,${g.top + 3}V${g.top - 6}" stroke="#d9b250" stroke-width="1.800"/><circle cx="0" cy="${g.top - 9}" r="5" fill="#e2b950" stroke="${INK}" stroke-width="1"/><path d="M-1.800,${g.top - 13}L0,${g.top - 24}L1.800,${g.top - 13}Z" fill="#e2b950" stroke="${INK}" stroke-width=".8"/><circle cx="1.500" cy="${g.top - 10.5}" r="1.400" fill="#fff6d0"/>`,
      html: (g) => pen(1, g.top - 20, 40, '#a5332b', { sw: 1 }) + pen(1, g.top - 16, 30, '#e2b950', { d: -.9 }),
    },
    pvp: {
      P: { R: 78, H: 120, tm: .4, p: 1.08, m: 13 }, c: '#1c1b1d', k: ['#141214', '#8e2118'], rimc: '#c7b9a6', seam: .0, dark: 1,
      paint: (g) => `<path d="${[-.78, -.45, .1, .5, .8].map((f) => line(g.pts.slice(3, 30), f)).join('')}" fill="none" stroke="#5c5650" stroke-width=".7" opacity=".7"/><path d="M-30,${g.top + 16}q14,-8 30,-6M34,${g.top + 22}q12,6 18,18M-60,${g.eq + 30}q6,14 20,22" fill="none" stroke="#77706a" stroke-width="1.2" opacity=".55" stroke-linecap="round"/>
<g transform="translate(0,${g.eq - 2})"><path d="M-46,0Q0,-34 46,0Q0,30 -46,0Z" fill="#7d1a12" stroke="#000" stroke-width="1"/><path d="M-40,0Q0,-27 40,0Q0,24 -40,0Z" fill="#c2371f"/><path d="M-30,0Q0,-19 30,0Q0,17 -30,0Z" fill="#e6862c"/><path d="M-18,0Q0,-12 18,0Q0,11 -18,0Z" fill="#f3c657"/><path d="M0,-17C5,-7 5,7 0,16C-5,7 -5,-7 0,-17Z" fill="#0b0707"/><path d="M-46,0q-9,-1 -14,-6M46,0q9,-1 14,-6M-40,-8q-6,-5 -8,-11M40,-8q6,-5 8,-11M-28,-16q-2,-6 -1,-11M28,-16q2,-6 1,-11" fill="none" stroke="#a82a1a" stroke-width="1.300" stroke-linecap="round"/></g>`,
      back: (g) => [-.86, -.52, .52, .86].map((f) => { const p = g.pts[f * f > .5 ? 9 : 4], x = X(p, f), a = Math.atan2(p.y - g.eq, x) * 180 / Math.PI + 90; return `<path transform="translate(${n1(x)},${n1(p.y)}) rotate(${n1(a)})" d="M-4.500,4L0,-17L4.500,4Z" fill="#4a4d52" stroke="${INK}" stroke-width="1"/><path transform="translate(${n1(x)},${n1(p.y)}) rotate(${n1(a)})" d="M1,-12V2" stroke="#aab1b8" stroke-width=".7" opacity=".7"/>`; }).join('') + `<path d="M-5,${g.top + 4}L0,${g.top - 20}L5,${g.top + 4}Z" fill="#4a4d52" stroke="${INK}" stroke-width="1"/>`,
      html: (g) => pen(0, g.top - 14, 44, '#8e2118', { rag: 1, hi: '#f0a08c' }),
    },
    levelup: {
      P: { R: 76, H: 98, tm: .42, p: .86, m: 15 }, c: '#ebe5d3', c2: '#cfa648', k: ['#cfa648', '#ebe5d3'], rimc: '#fff3cc', rope: 1,
      back: (g) => { const q = prof({ R: 33, H: 36, tm: .46, p: .8, m: 13 }).map((p) => ({ ...p, y: p.y - 98 + 5 })), t = q[0].y; return `<path d="${gore(q, -1, 1)}" fill="#cfa648" stroke="${INK}" stroke-width="1.200"/>${[0, 2, 4, 6].map((i) => `<path d="${gore(q, F[i], F[i + 1])}" fill="#ebe5d3"/>`).join('')}<path d="${gore(q, -1, -.6)}" fill="#1a120a" opacity=".2"/><path d="${F.slice(1, -1).map((f) => line(q, f)).join('')}${gore(q, -1, 1)}" fill="none" stroke="${INK}" stroke-width=".6"/><path d="M-17,${g.top + 9}L-17,${g.top - 2}L-11,${g.top + 3}L-6,${g.top - 4}L0,${g.top + 3}L6,${g.top - 4}L11,${g.top + 3}L17,${g.top - 2}L17,${g.top + 9}Z" fill="#e2b950" stroke="${INK}" stroke-width=".9"/><path d="M0,${t + 1}V${t - 8}" stroke="${INK}" stroke-width="1.400"/>${star(0, t - 13, 7).replace('/>', ` fill="#e9c35c" stroke="${INK}" stroke-width=".7"/>`)}`; },
      paint: (g) => `<path d="${bow(g.eq + 2, 12)}" fill="none" stroke="#cfa648" stroke-width="9"/><path d="${bow(g.eq - 2.5, 12)}${bow(g.eq + 6.5, 12)}" fill="none" stroke="${INK}" stroke-width=".6"/><g fill="#8a2a22" stroke="${INK}" stroke-width=".4">${[-52, -26, 0, 26, 52].map((x) => `<circle cx="${x}" cy="${n1(bowY(x, g.eq + 2, 12))}" r="2.300"/>`).join('')}</g>`,
    },
    death: {
      P: { R: 76, H: 118, tm: .42, p: .92, m: 16 }, c: '#c5cdcd', k: ['#17140f', '#6f6a62'], rimc: '#e8f2ff', ghost: 1, seam: .35,
      holes: (g) => `<ellipse cx="-34" cy="${g.eq - 26}" rx="11" ry="15" transform="rotate(20 -34 ${g.eq - 26})"/><ellipse cx="38" cy="${g.eq + 34}" rx="9" ry="13"/><ellipse cx="22" cy="${g.top + 20}" rx="13" ry="7"/><path d="M-58,${g.eq + 26}l14,-6l-4,14l10,6l-16,6Z"/><path d="M-40,${MY + 2}L-30,${MY - 24}L-22,${MY - 6}L-15,${MY - 30}L-8,${MY - 8}L0,${MY - 26}L7,${MY - 6}L15,${MY - 32}L22,${MY - 8}L30,${MY - 22}L40,${MY + 2}Z"/>`,
      over: (g) => `<path d="${bow(g.eq + 2, 12)}" fill="none" stroke="#141110" stroke-width="10" opacity="1"/><path d="${bow(g.eq - 2, 12)}" fill="none" stroke="#5d564b" stroke-width=".7"/><g transform="translate(-22,${n1(bowY(-22, g.eq + 2, 12))})" fill="#17140f" stroke="#000" stroke-width=".8" stroke-linejoin="round"><path d="M0,0C-10,-12 -20,-8 -17,0C-20,8 -10,10 0,0Z"/><path d="M0,0C10,-12 20,-8 17,0C20,8 10,10 0,0Z"/><path d="M-3,2C-8,16 -6,30 -12,44L-4,40C-2,28 -1,14 2,3Z"/><path d="M2,2C8,14 7,26 12,36L5,34C3,24 0,14 -1,3Z"/><circle r="4"/></g>`,
    },
    achievement: {
      P: { R: 82, H: 118, tm: .4, p: .88, m: 15 }, c: '#d9c696', c2: '#cdb884', k: ['#9c2f25', '#5c7044'], rope: 0,
      paint: (g) => { let s = ''; for (let i = 0; i < 22; i++) { if (i === 5 || i === 6) continue; const a = (i / 22) * Math.PI * 2 + Math.PI / 2, x = Math.cos(a) * 33, y = Math.sin(a) * 33, d = a * 180 / Math.PI + (i < 11 ? 118 : 62); s += leaf(x, y, d, i % 2 ? '#5c7044' : '#7c8b55') + leaf(x * .86, y * .86, d + (i < 11 ? 40 : -40), '#4a5f3d'); } let sc = ''; for (let i = 0; i < 14; i++) { const a = i * Math.PI / 7, r = 21 + (i * 7 % 3); sc += (i ? 'L' : 'M') + n1(Math.cos(a) * r) + ',' + n1(Math.sin(a) * r) + 'Q' + n1(Math.cos(a + .22) * (r + 4)) + ',' + n1(Math.sin(a + .22) * (r + 4)) + ' ' + n1(Math.cos(a + .44) * r) + ',' + n1(Math.sin(a + .44) * r); } return `<g transform="translate(0,${g.eq - 4})"><path d="M-7,14L-17,54L-9,49L-4,58L3,16Z" fill="#8a2a20" stroke="${INK}" stroke-width=".8"/><path d="M7,14L15,56L9,50L3,57L-2,16Z" fill="#a93c2c" stroke="${INK}" stroke-width=".8"/>${s}<path d="${sc}Z" fill="#9c2f25" stroke="${INK}" stroke-width=".9"/><circle r="15.500" fill="#b23c2c" stroke="#5a170f" stroke-width=".9"/><path d="M0,-10L2.600,-3.400L9.600,-3L4.200,1.400L6,8.200L0,4.400L-6,8.200L-4.200,1.400L-9.600,-3L-2.600,-3.400Z" fill="#8a2a20" stroke="#5a170f" stroke-width=".7"/><path d="M-13,-9Q-6,-17 5,-15" fill="none" stroke="#f0a08c" stroke-width="1.300" stroke-linecap="round" opacity=".7"/></g>`; },
      back: (g) => staff(0, g.top, 9),
      html: (g) => pen(0, g.top - 8, 46, '#9c2f25', { sw: 1 }) + pen(0, g.top - 4, 30, '#5c7044', { d: -.6 }),
    },
  };

  function envArt(mood, u) {
    const D = ENV[mood], P = D.P, pts = prof(P), o = gore(pts, -1, 1), g = { pts, eq: n1(MY - P.H * (1 - P.tm)), top: n1(MY - P.H), cx: pts[0].c };
    let a = 44; for (const p of pts) if (Math.abs(p.y - (MY - 13)) < 2) a = Math.max(30, Math.min(48, Math.min(p.l, p.r) - 3));
    let s = `<path d="${o}" fill="${D.c}"/><g clip-path="url(#gc${u})">`;
    if (D.c2) for (const i of [1, 3, 5]) s += `<path d="${gore(pts, F[i], F[i + 1])}" fill="${D.c2}"/>`;
    if (D.weave) s += `<path d="${o}" fill="url(#gw${u})"/><path d="${o}" fill="url(#gv${u})"/>`;
    s += D.paint ? D.paint(g) : '';
    if (D.seam !== 0) s += `<path d="${F.slice(1, -1).map((f) => line(pts, f)).join('')}" fill="none" stroke="${INK}" stroke-width=".6" opacity="${D.seam || .6}"/>`;
    if (D.rope) s += `<path d="${bow(g.eq + 3)}" fill="none" stroke="${INK}" stroke-width="1.700" opacity=".8"/><path d="${bow(g.eq + 3)}" fill="none" stroke="#d8c9a0" stroke-width=".7" stroke-dasharray="2 2"/>`;
    s += `<path d="${gore(pts, -1, -.6)}" fill="${D.dark ? '#000' : '#1a120a'}" opacity=".24"/><path d="${gore(pts, -1, -.8)}" fill="url(#gh${u})"/><rect x="-100" y="${MY - 46}" width="200" height="50" fill="url(#gb${u})"/>`;
    s += `<path d="${gore(pts.slice(2, 22), .3, .6)}" fill="#fff" opacity="${D.dark ? .07 : .12}"/></g>`;
    s += `<path d="${o}" fill="none" stroke-width="1.300"/><path d="${line(pts.slice(1, 26), .975)}" fill="none" stroke="${D.rimc || '#ffe9c0'}" stroke-width=".9" opacity="${D.dark ? .5 : .4}"/>`;
    s += D.over ? D.over(g) : '';
    const collar = D.ghost ? '' : `<path d="M-16,${MY - 4}L16,${MY - 4}L14,${MY + 4}L-14,${MY + 4}Z" fill="#3b2a1a" stroke-width="1"/><ellipse cx="0" cy="${MY + 3.5}" rx="13.500" ry="2.600" fill="#120b06" stroke-width=".7"/><path d="M-9,${MY - 3}v6M-3,${MY - 3}v6M3,${MY - 3}v6M9,${MY - 3}v6" stroke-width=".5" opacity=".6"/>`;
    const body = `<g filter="url(#gf${u})" ${G}>${D.back ? D.back(g) : ''}<g${D.ghost ? ` mask="url(#gm${u})" opacity=".66"` : ''}>${s}</g>${collar}</g>`;
    const defs = `<defs>${FILT('gf' + u)}${HATCH('gh' + u, 38, 3, .55)}${D.weave ? HATCH('gw' + u, 0, 2.6, .3) + HATCH('gv' + u, 90, 2.6, .22) : ''}<clipPath id="gc${u}"><path d="${o}"/></clipPath><linearGradient id="gb${u}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#140c06" stop-opacity="0"/><stop offset="1" stop-color="#140c06" stop-opacity=".42"/></linearGradient>${D.ghost ? `<mask id="gm${u}" maskUnits="userSpaceOnUse" x="-100" y="-30" width="200" height="170"><path d="${o}" fill="#fff" stroke="#fff" stroke-width="2"/><g fill="#000">${D.holes(g)}</g></mask>` : ''}</defs>`;
    return { a, html: RIG('genv-esvg genv-rim', -100, -30, 200, 170, defs + body) + (D.html ? D.html(g) : '') };
  }

  // ---- the goblin ----
  const ALM = 'M-7.5,0Q0,-6.800 7.500,0Q0,4.600 -7.500,0Z';
  const eye = (s, u) => `<g transform="translate(${16.5 * s},-5) rotate(${7 * s})"><ellipse cy="-.5" rx="12" ry="8.500" fill="#1c2413" opacity=".5"/><ellipse cy="-.5" rx="12" ry="8.500" fill="url(#hp${u})"/>
<g clip-path="url(#hc${u})"><path d="${ALM}" fill="#dcc44a"/><path d="M-9,-7H9V-1.500H-9Z" fill="#5a4410" opacity=".4"/>
<g class="genv-pm"><g class="genv-pg"><circle r="3" fill="#a9801a"/><ellipse rx="1.300" ry="2.300" fill="#0c0705"/><circle cx="-1" cy="-1.200" r=".7" fill="#fffbe6"/></g></g>
<g class="genv-bl"><path class="genv-lid" d="M-10,-18H10V-5Q0,-3.300 -10,-5Z"/></g><path class="genv-low" d="M-10,16H10V4.600Q0,3.600 -10,4.600Z"/></g>
<path d="${ALM}" fill="none" stroke="${INK}" stroke-width=".8"/><path d="M-8.300,.5Q0,-7.600 8.300,.5" fill="none" stroke="${INK}" stroke-width="1.500" stroke-linecap="round"/>
<path d="M${-6 * s},6q${7 * s},4 ${14 * s},-1M${-4 * s},9q${6 * s},3 ${11 * s},-.5M${9 * s},-2l${4 * s},-1.500M${9 * s},1.500l${4.5 * s},1" fill="none" stroke="${INK}" stroke-width=".6" stroke-linecap="round" opacity=".8"/></g>`;
  const BROW = `<path d="M-11,3C-8,-3 3,-5.500 12,-2C14,-.5 12,2.500 8,1.500C3,.5 -3,1.500 -8,5C-10,6 -12,5 -11,3Z" class="genv-skd" stroke="${INK}" stroke-width="1"/><path d="M-7,1.500q5,-3 11,-2.500M5,-2l5,1.500" fill="none" stroke="${INK}" stroke-width=".5" opacity=".8"/><path d="M-8,-.5Q0,-4.500 9,-2.500" fill="none" class="genv-lt" stroke="#c7cf9c" stroke-width=".8" opacity=".6"/>`;
  const EAR = (u, notch) => `<path d="M-3,-9C9,-15 30,-14 52,-7C${notch ? '44,-4 41,-5 39,-2C40,1 36,2 32,3' : '40,-3 34,1 30,4'}C24,8 16,11 9,11C2,11 -3,8 -3,4Z" class="genv-sk" stroke="${INK}" stroke-width="1.100" stroke-linejoin="round"/><path d="M2,-5C12,-10 28,-9 43,-6C33,-3 24,2 12,6C6,7 2,4 2,0Z" class="genv-skd"/><path d="M2,-5C12,-10 28,-9 43,-6C33,-3 24,2 12,6C6,7 2,4 2,0Z" fill="url(#hp${u})"/><path d="M6,-2C14,-5 24,-5 34,-5M8,2C14,1 20,-1 26,-3" fill="none" stroke="${INK}" stroke-width=".55" opacity=".7"/><path d="M0,-8.500C12,-13.500 30,-12.500 47,-7.500" fill="none" stroke="#c7cf9c" stroke-width=".9" opacity=".55"/>`;
  const headArt = (u) => SVG('genv-hsvg genv-rim', -96, -74, 192, 114, `<defs>${FILT('hf' + u)}${HATCH('hp' + u, 38, 2.6, .6)}${HATCH('hq' + u, -52, 3, .5)}<clipPath id="hc${u}"><path d="${ALM}"/></clipPath><clipPath id="hh${u}"><path d="M-13,0L0,-33L13,0Q0,4 -13,0Z"/></clipPath></defs>
<g transform="translate(-33,-7) scale(-1,1)"><g class="genv-eL"><g class="genv-et" filter="url(#hf${u})">${EAR(u, 1)}<circle cx="27" cy="6.500" r="3" fill="none" stroke="${INK}" stroke-width="1.700"/><circle cx="27" cy="6.500" r="3" fill="none" stroke="#b9a25c" stroke-width=".8"/></g></g></g>
<g transform="translate(33,-7)"><g class="genv-eR"><g class="genv-et" filter="url(#hf${u})">${EAR(u, 0)}</g></g></g>
<g filter="url(#hf${u})" ${G}>
<path d="M-12,-29q-4,-9 -11,-10M-3,-31q-1,-10 4,-14M6,-30q5,-8 12,-8M-7,-30q-1,-6 -5,-9" fill="none" stroke-width=".8"/>
<path d="M-37,-8C-40,-24 -24,-31 0,-31C24,-31 40,-24 37,-8C36,4 31,13 22,22C15,29 8,33 0,33C-8,33 -15,29 -22,22C-31,13 -36,4 -37,-8Z" class="genv-sk" stroke-width="1.200"/>
<path d="M-37,-8C-40,-24 -24,-31 -6,-31C-22,-24 -27,-10 -25,2C-23,14 -16,24 -8,32C-14,30 -18,26 -22,22C-31,13 -36,4 -37,-8Z" fill="#1a1f10" opacity=".22" stroke="none"/>
<path d="M-37,-8C-40,-24 -24,-31 -10,-31C-25,-24 -30,-10 -28,2C-26,12 -21,20 -15,27C-18,25 -20,24 -22,22C-31,13 -36,4 -37,-8Z" fill="url(#hp${u})" stroke="none"/>
<path d="M-37,-8C-39,-20 -32,-27 -22,-29C-31,-22 -34,-10 -32,0C-31,8 -28,14 -24,19C-31,12 -36,4 -37,-8Z" fill="url(#hq${u})" stroke="none"/>
<path d="M12,-29C26,-27 35,-20 35,-9C34,2 30,11 23,19C29,9 31,-2 29,-12C27,-20 21,-26 12,-29Z" class="genv-skl" opacity=".5" stroke="none"/>
<path d="M-22,-21C-10,-24 10,-24 22,-21M-17,-25.500C-8,-27.500 8,-27.500 17,-25.500M-26,-16C-22,-17.500 -18,-18 -14,-18M14,-18C18,-18 22,-17.500 26,-16" fill="none" stroke-width=".55" opacity=".7"/>
<path d="M-12,6C-18,10 -22,16 -21,23M12,6C18,10 22,16 21,23M-27,6C-29,10 -28,15 -26,18M27,6C29,10 28,15 26,18M-3,-13v5M3,-13v4.500" fill="none" stroke-width=".6" opacity=".75"/>
<circle cx="-25" cy="11" r="1.600" class="genv-skd" stroke-width=".6"/><circle cx="23" cy="-22" r="1.200" class="genv-skd" stroke-width=".5"/>
<g class="genv-mo genv-mo-flat"><path d="M-15,24.500Q0,26.500 15,24.500" fill="none" stroke-width="1.400"/><path d="M-11,25L-9.500,20.500L-7.500,25.200Z" fill="#e6dcb6" stroke-width=".6"/></g>
<g class="genv-mo genv-mo-frown"><path d="M-15,28.500Q0,21.500 15,28.500" fill="none" stroke-width="1.400"/><path d="M-16.500,26.500l2,3M16.500,26.500l-2,3M-6,30q6,-2 12,0" fill="none" stroke-width=".6"/><path d="M9,25.800L10.500,21.500L12.500,26.800Z" fill="#e6dcb6" stroke-width=".6"/></g>
<g class="genv-mo genv-mo-wavy"><path d="M-15,25q3.700,-2.200 7.500,0t7.500,0t7.500,0t7.500,0" fill="none" stroke-width="1.400"/><path d="M-11,24.300L-9.500,20.500L-7.800,24.200Z" fill="#e6dcb6" stroke-width=".6"/></g>
<g class="genv-mo genv-mo-smirk"><path d="M-14,25.500Q3,29 16,21.500" fill="none" stroke-width="1.400"/><path d="M15,19.500q3,1.500 2,4" fill="none" stroke-width=".7"/><path d="M-10,26.200L-8.500,21.500L-6.500,26.800Z" fill="#e6dcb6" stroke-width=".6"/></g>
<g class="genv-mo genv-mo-grin"><path d="M-17,21.500Q0,26 17,21.500Q0,37 -17,21.500Z" fill="#2c1510" stroke-width="1.100"/><path d="M-13,23.300L-11,27.500L-8.500,24.300L-6,28L-3.500,24.800M4,24.800L6.500,28L9,24.200L11.500,27.300L13.500,23.200" fill="#e6dcb6" stroke-width=".6"/><path d="M-19,19.500q-2,2 -.5,4.500M19,19.500q2,2 .5,4.500" fill="none" stroke-width=".7"/></g>
<g class="genv-mo genv-mo-fang"><path d="M-18,22Q0,27 18,22Q0,34 -18,22Z" fill="#1a0b08" stroke-width="1.100"/><path d="M-13,27.300L-10.500,18.500L-8,28.300ZM13,27.300L10.500,18.500L8,28.300Z" fill="#efe6c4" stroke-width=".6"/><path d="M-5.500,29.500L-4,26L-2.500,29.800M2.500,29.800L4,26L5.500,29.500" fill="#efe6c4" stroke-width=".5"/></g>
<g class="genv-mo genv-mo-o"><path d="M-13,25q5,2 9,1M13,25q-3,1.500 -6,1.500" fill="none" stroke-width="1.100"/><ellipse cx="3" cy="26.500" rx="4" ry="3.400" fill="#2c1510" stroke-width="1"/></g>
<path d="M-3,-11C-4,-3 -6,3 -9,8.500C-11,12.500 -8,15.500 -5,14.500C-4,18.500 -1,22.500 1,22.500C3,22.500 5,18.500 5,14.500C8,15.500 11,12.500 9,8.500C6,3 4,-3 3,-11Z" class="genv-sk" stroke-width="1.100"/>
<path d="M-3,-11C-4,-3 -6,3 -9,8.500C-11,12.500 -8,15.500 -5,14.500C-4,18.500 -1,22.500 0,22.500C-3,16 -3,6 -1,-4Z" fill="url(#hp${u})" stroke="none"/><path d="M-3,-11C-4,-3 -6,3 -9,8.500C-11,12.500 -8,15.500 -5,14.500C-4,10 -3,2 -2,-6Z" fill="#1a1f10" opacity=".22" stroke="none"/>
<path d="M1.500,-6C3.500,2 5,8 4,16" fill="none" class="genv-lt" stroke="#d3d9ab" stroke-width="1.400" opacity=".55"/>
<path d="M-6.500,13.500q1.500,1.500 3,.3M6.500,13.500q-1.500,1.500 -3,.3M-1,4q2,3 1.500,7" fill="none" stroke-width=".7"/><circle cx="5.500" cy="5" r="1.300" class="genv-skd" stroke-width=".5"/>
</g>
${eye(-1, u)}${eye(1, u)}
<g transform="translate(-17,-14)" filter="url(#hf${u})"><g class="genv-bL"><g transform="scale(-1,1)">${BROW}</g></g></g><g transform="translate(17,-14)" filter="url(#hf${u})"><g class="genv-bR">${BROW}</g></g>
<g class="genv-blow" transform="translate(6,26.500) rotate(-14)" ${G}><path d="M-3,-1.800H5V1.800H-3Z" fill="#33261a" stroke-width=".7"/><g transform="translate(5,0)"><g class="genv-tube"><path d="M0,-2.800H36V2.800H0Z" fill="#d9c9a0" stroke-width=".8"/><path d="M5,-2.800l3,5.600M13,-2.800l3,5.600M21,-2.800l3,5.600M29,-2.800l3,5.600" stroke="#a5332b" stroke-width="2.200"/></g><g transform="translate(36,0)"><g class="genv-curl"><circle cy="-3" r="6.500" fill="#d9c9a0" stroke-width=".8"/><path d="M0,-3m-3.500,0a3.500,3.500 0 1 1 3.500,3.500a2,2 0 1 1 1.500,-3" fill="none" stroke="#a5332b" stroke-width="1.300"/></g></g></g></g>
<g transform="translate(21,-23) rotate(36) scale(1.15)"><g class="genv-hat"><g class="genv-hatw" filter="url(#hf${u})" ${G}><path d="M-13,0L0,-33L13,0Q0,4 -13,0Z" fill="#d9c9a0" stroke-width="1.100"/><g clip-path="url(#hh${u})" stroke="none"><path d="M-16,-6L16,-13L16,-19L-16,-12ZM-16,-19L16,-26L16,-33L-16,-25ZM-16,6L16,-1L16,-6L-16,1Z" fill="#a5332b"/><path d="M-13,0L0,-33L-3,-33L-9,2Z" fill="#1a120a" opacity=".3"/></g><path d="M-13,0L0,-33L13,0Q0,4 -13,0Z" fill="none" stroke-width="1.100"/><circle cy="-35" r="4.200" fill="#e2b950" stroke-width=".9"/><path d="M-2,-36l-3,-2M0,-38v-3.500M2,-36l3,-2.500" fill="none" stroke-width=".6"/><path d="M-12,1C-22,10 -28,24 -27,36" fill="none" stroke-width=".5" opacity=".7"/></g></g></g>`);

  const finger = (x, len, i) => `<g transform="translate(${x},212)"><g class="genv-fg" style="--i:${i}"><path d="M-2.700,-1C-2.700,-5 2.700,-5 2.700,-1L2.400,${len - 3}C2,${len} .6,${len + 2} 0,${len + 2.5}C-.6,${len + 2} -2,${len} -2.400,${len - 3}Z" class="genv-sk" stroke="${INK}" stroke-width=".9"/><path d="M-1.600,1.500Q0,2.500 1.600,1.500M-1.500,${len * .5}Q0,${len * .5 + 1} 1.500,${len * .5}" fill="none" stroke="${INK}" stroke-width=".5"/><path d="M-1.300,${len - 1}L0,${len + 4.5}L1.300,${len - 1}Z" fill="#26210f" stroke="${INK}" stroke-width=".4"/></g></g>`;
  const arm = (u, s) => RIG('genv-rim', -100, 190, 200, 50, `<defs>${s < 0 ? FILT('af' + u) + HATCH('ap' + u, 38, 2.6, .55) : ''}</defs><g transform="scale(${-s},1)${s > 0 ? ' translate(0,-1.5)' : ''}"><g filter="url(#af${u})" ${G}><path d="M-52,205.500C-40,203.500 -26,204 -15,206L-14,215C-26,217 -40,218 -52,217Z" class="genv-sk" stroke-width="1.100"/><path d="M-52,212C-40,213 -26,213 -15,211.500L-14,215C-26,217 -40,218 -52,217Z" fill="url(#ap${u})" stroke="none"/><path d="M-40,206q-1,4 0,8M-30,206q-1,3 0,6" fill="none" stroke-width=".5" opacity=".7"/>
<path d="M-62,214C-63,206 -56,201 -47,202.500L-45,206L-46,210L-44,214L-46,218C-53,220 -61,219 -62,214Z" class="genv-skd" stroke-width="1.100"/><path d="M-62,214C-63,206 -56,201 -52,202C-58,206 -58,214 -55,219C-59,218 -62,217 -62,214Z" fill="url(#ap${u})" stroke="none"/>
<path d="M-18,206C-13,202.500 -3,203 -1.500,208L-2,214L-17,215Z" class="genv-sk" stroke-width="1.100"/></g>${finger(-14, 9, 0)}${finger(-9, 11, 1)}${finger(-4, 10, 2)}</g>`);

  const basket = (u) => RIG('genv-rim', -100, 150, 200, 112, `<defs>${FILT('bf' + u)}${HATCH('bp' + u, 38, 2.8, .6)}${HATCH('bq' + u, -52, 3.2, .45)}<linearGradient id="bw${u}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#b08d60"/><stop offset=".55" stop-color="#7c5c39"/><stop offset="1" stop-color="#4c3420"/></linearGradient></defs><g filter="url(#bf${u})" ${G}>
<path d="M-46,222C-48,203 -36,194 -18,192L18,192C36,194 48,203 46,222Z" fill="#4b3e2c" stroke-width="1.100"/><path d="M-46,222C-48,203 -36,194 -22,192C-32,200 -34,210 -33,222Z" fill="url(#bp${u})" stroke="none"/><path d="M-10,193l4,6l5,-5l5,6l5,-6" fill="none" stroke-width=".6" opacity=".8"/>
<path d="M-50,219L50,219L45,250L-45,250Z" fill="#84623b" stroke-width="1.200"/>
<path d="M-50,219L-28,219L-26,250L-45,250Z" fill="#1a120a" opacity=".25" stroke="none"/><path d="M-50,219L-32,219L-31,250L-45,250Z" fill="url(#bp${u})" stroke="none"/><path d="M-47,240L47,240L45,250L-45,250Z" fill="url(#bq${u})" stroke="none"/>
<path d="M-49,227Q0,229.500 49,227M-48,234.500Q0,237 48,234.500M-46.500,242.500Q0,245 46.500,242.500" fill="none" stroke-width=".7" opacity=".85"/>
<path d="${[-40, -30, -20, -10, 0, 10, 20, 30, 40].map((x, i) => `M${x},${i % 2 ? 221 : 228}v6.500M${x},${i % 2 ? 236 : 243.5}v5.500`).join('')}" fill="none" stroke-width=".6" opacity=".8"/>
<path d="${[-35, -25, -15, -5, 5, 15, 25, 35].map((x, i) => `M${x},${i % 2 ? 222 : 229}q2,3 0,5.500`).join('')}" fill="none" stroke="#c9ab78" stroke-width=".8" opacity=".6"/>
<rect x="-54" y="215" width="108" height="8" rx="4" fill="#5f4226" stroke-width="1.200"/><path d="${[-46, -36, -26, -16, -6, 4, 14, 24, 34, 44].map((x) => `M${x},216l3,6`).join('')}" fill="none" stroke-width=".6" opacity=".8"/><path d="M-50,216.500H50" stroke="#c9ab78" stroke-width=".8" opacity=".5"/>
<path d="M-40,250V255M40,250V255M-36,250V255M36,250V255" stroke-width="1"/></g>`);
  const pole = (u) => RIG('genv-rim', -100, 240, 200, 26, `<defs><linearGradient id="pw${u}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#b99668"/><stop offset=".55" stop-color="#7c5c39"/><stop offset="1" stop-color="#4c3420"/></linearGradient></defs><g ${G}>
<rect x="-86" y="253" width="172" height="6.500" rx="3" fill="url(#pw${u})" stroke-width="1.100"/>
${[-1, 1].map((s) => `<path d="M${s * 86},252.500h${s * 3}v7.500h${-s * 3}Z" fill="#5f4226" stroke-width=".9"/><circle cx="${s * 92.5}" cy="256.300" r="3.800" fill="#8a6843" stroke-width="1"/><circle cx="${s * 93.5}" cy="255" r="1" fill="#e0c79a" stroke="none"/>`).join('')}
<path d="${[-66, -52, -24, -10, 4, 18, 52, 66].map((x) => `M${x},252.200l2.500,8.200`).join('')}" fill="none" stroke-width="2.200"/><path d="${[-66, -52, -24, -10, 4, 18, 52, 66].map((x) => `M${x},252.200l2.500,8.200`).join('')}" fill="none" stroke="#d6c59a" stroke-width="1.100"/>
${[-38, 38].map((x) => `<path d="M${x - 5},246L${x + 5},261M${x + 5},246L${x - 5},261M${x - 1.5},245.500V261M${x + 2},245.500V261" fill="none" stroke-width="2.800"/><path d="M${x - 5},246L${x + 5},261M${x + 5},246L${x - 5},261M${x - 1.5},245.500V261M${x + 2},245.500V261" fill="none" stroke="#cdbb8e" stroke-width="1.500"/><path d="M${x + 4},261q3,4 1,8" fill="none" stroke-width="1"/>`).join('')}</g>`);
  const ropes = (a) => RIG('genv-ropes', -100, 100, 200, 124, `<g fill="none" stroke-linecap="round"><path class="genv-rp" d="M${-a},${MY - 14}L-49,218M${a},${MY - 14}L49,218M${-a + 12},${MY - 8}L-41,218M${a - 12},${MY - 8}L41,218" stroke="${INK}" stroke-width="2.200"/><path class="genv-rp" d="M${-a},${MY - 14}L-49,218M${a},${MY - 14}L49,218M${-a + 12},${MY - 8}L-41,218M${a - 12},${MY - 8}L41,218" stroke="#a8946c" stroke-width="1" stroke-dasharray="3 1.500"/>
<path d="M-45,${MY + 15}L-8,${MY + 11}M45,${MY + 15}L8,${MY + 11}" stroke="${INK}" stroke-width="1.600"/></g><g stroke="${INK}" stroke-linejoin="round"><rect x="-9" y="${MY + 8}" width="18" height="7" rx="1.500" fill="#4a4f55" stroke-width="1.100"/><path d="M-6,${MY + 8}v-2.500h12v2.500" fill="#6c747a" stroke-width=".9"/><path d="M-6,${MY + 11.5}h12" stroke="#aab3ba" stroke-width=".7" opacity=".7"/></g>`);
  const FLAME = SVG('', -10, -30, 20, 32, `<path class="genv-f1" d="M0,0C-8,-6 -6,-15 0,-28C6,-15 8,-6 0,0Z" stroke="${INK}" stroke-width=".5" stroke-opacity=".5"/><path class="genv-f2" d="M0,-1C-3.800,-5 -3,-10 0,-18C3,-10 3.800,-5 0,-1Z"/>`);

  // ---- what hangs on the basket ----
  const BAG = SVG('genv-rim', -8, 0, 16, 34, `<g ${G} transform="scale(.82)"><path d="M0,0V12" stroke-width="1.100"/><path d="M-3,12.500C-8,17 -8.500,27 -5,30.500C-2,32.500 2,32.500 5,30.500C8.500,27 8,17 3,12.500Z" fill="#8f7d5a" stroke-width="1.100"/><path d="M-3,12.500C-8,17 -8.500,27 -5,30.500C-4.500,24 -4,18 -1,12.500Z" fill="#1a120a" opacity=".3" stroke="none"/><path d="M-3.500,12.500h7l1.500,-3h-10Z" fill="#b7a67e" stroke-width=".8"/><path d="M-2,20q2,2 4,0M-3,25q3,2 6,0" fill="none" stroke-width=".5" opacity=".7"/></g>`);
  const streamer = (c, len, k) => SVG('genv-rim', -20, 0, 40, len + 6, `<path d="M0,0C${10 * k},${len * .16} ${-12 * k},${len * .32} ${-2 * k},${len * .5}C${10 * k},${len * .68} ${-10 * k},${len * .84} ${2 * k},${len}" fill="none" stroke="${INK}" stroke-width="4.600" stroke-linecap="round"/><path d="M0,0C${10 * k},${len * .16} ${-12 * k},${len * .32} ${-2 * k},${len * .5}C${10 * k},${len * .68} ${-10 * k},${len * .84} ${2 * k},${len}" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`);
  const ROCKET = SVG('', -8, -24, 16, 50, `<g ${G}><path d="M0,-4V24" stroke="#8a6843" stroke-width="1.600"/><path d="M-3.500,-14H3.500V2H-3.500Z" fill="#a5332b" stroke-width=".9"/><path d="M-3.500,-9H3.500M-3.500,-4H3.500" stroke="#e9dfc2" stroke-width="1.400"/><path d="M-4.500,-14L0,-23L4.500,-14Z" fill="#e2b950" stroke-width=".9"/><path d="M0,2q3,3 1,7" fill="none" stroke-width=".7"/></g><g class="genv-fz" transform="translate(1,10)"><path d="M0,-3.500L1,-1L3.500,0L1,1L0,3.500L-1,1L-3.500,0L-1,-1Z" fill="#ffe9a8"/></g>`);
  const SPIKE = (x, a, l = 15) => `<path transform="translate(${x},217) rotate(${a})" d="M-4,2L0,${-l}L4,2Z" fill="#50545a" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/><path transform="translate(${x},217) rotate(${a})" d="M1,${-l + 4}V0" stroke="#b5bcc3" stroke-width=".7" opacity=".7"/>`;
  const trail = (x, y, inner, cls = '') => `<div class="genv-trail" style="left:${100 + x}px;top:${y}px"><div class="${cls}">${inner}</div></div>`;
  const XTRA = {
    calibrating: () => trail(-55, 221, BAG) + trail(55, 221, BAG),
    poor: () => trail(55, 221, BAG),
    meh: () => trail(-55, 221, BAG) + trail(55, 221, BAG),
    good: () => trail(-55, 221, BAG) + trail(55, 221, BAG),
    great: () => trail(-55, 221, BAG) + trail(55, 221, BAG) + RIG('genv-rim', -100, 210, 200, 40, `<g ${G}><path d="M-50,222Q-25,238 0,224Q25,238 50,222L50,219L-50,219Z" fill="#27406f" stroke-width="1"/><path d="M-44,224Q-25,234 -6,225M6,225Q25,234 44,224" fill="none" stroke="#b9c2cf" stroke-width=".9"/><g fill="#dde3ec" stroke-width=".4">${star(-25, 226, 3.4)}${star(25, 226, 3.4)}</g></g>`),
    superb: () => trail(-92, 258, streamer('#a5332b', 74, 1), 'genv-sway') + trail(92, 258, streamer('#d1a344', 80, -1), 'genv-sway') + trail(-55, 222, streamer('#d1a344', 46, -1), 'genv-sway') + trail(55, 222, streamer('#5f7d4a', 50, 1), 'genv-sway')
      + RIG('genv-rim', -100, 210, 200, 40, `<g ${G}>${[-40, -24, -8, 8, 24, 40].map((x, i) => `<path d="M${x - 7},222L${x + 7},222L${x},235Z" fill="${['#a5332b', '#e2b950', '#e9dfc2'][i % 3]}" stroke-width=".8"/>`).join('')}</g>`),
    pvp: () => RIG('genv-rim', -100, 190, 200, 60, SPIKE(-52, -34, 17) + SPIKE(-44, -12) + SPIKE(-22, -4, 13) + SPIKE(22, 4, 13) + SPIKE(44, 12) + SPIKE(52, 34, 17) + `<g ${G}>${[-36, -18, 0, 18, 36].map((x) => `<path d="M${x - 3.5},232L${x},240L${x + 3.5},232Z" fill="#50545a" stroke-width=".8"/><circle cx="${x}" cy="231" r="2.400" fill="#6c747a" stroke-width=".7"/>`).join('')}</g>`),
    levelup: () => `<div class="genv-rk genv-rk0" style="left:40px;top:226px;transform:rotate(-9deg)">${ROCKET}</div><div class="genv-rk genv-rk1" style="left:160px;top:226px;transform:rotate(9deg)">${ROCKET}</div>` + RIG('genv-rim', -100, 210, 200, 40, `<g ${G}><path d="M-50,220Q0,234 50,220L50,225Q0,239 -50,225Z" fill="#cfa648" stroke-width=".9"/></g>`),
    death: () => trail(55, 221, BAG) + RIG('genv-rim', -100, 190, 200, 50, `<defs>${HATCH('dh', 38, 2.4, .7)}</defs><g ${G}><path d="M-17,214C-19,203 -10,197 0,198C11,197 19,204 17,214C10,218 -10,218 -17,214Z" fill="#2b2622" stroke-width="1.100"/><path d="M-17,214C-19,203 -10,197 -4,198C-10,204 -11,210 -9,216Z" fill="url(#dh)" stroke="none"/><path d="M-21,213C-12,219 12,219 21,213C20,217 12,221 0,221C-12,221 -20,217 -21,213Z" fill="#1b1714" stroke-width="1"/><path d="M-9,203q9,-3 18,1" fill="none" stroke="#6f6a62" stroke-width=".7"/></g>`),
    achievement: () => trail(-55, 221, BAG) + trail(55, 221, BAG) + RIG('genv-rim', -100, 210, 200, 46, `<g ${G}><path d="M-4,232L-9,250L-3,246L0,252L3,246L9,250L4,232Z" fill="#9c2f25" stroke-width=".8"/>${Array.from({ length: 10 }, (_, i) => leaf(Math.cos(i * .628) * 9, 231 + Math.sin(i * .628) * 9, i * 36 + 60, i % 2 ? '#5c7044' : '#7c8b55')).join('')}<circle cy="231" r="6.500" fill="#b23c2c" stroke-width=".8"/><circle cx="-1.500" cy="229.500" r="1.500" fill="#f0a08c" stroke="none" opacity=".7"/></g>`),
  };
  const CONF = ['#c9a13f', '#a5332b', '#e9dfc2', '#5f7d4a', '#d1a344'];
  const pips = (n, pvp) => {
    if (pvp) return SVG('', 0, 0, 16, 12, `<path d="M2,1.500L14,10.500M14,1.500L2,10.500" fill="none" stroke="#8e2118" stroke-width="2" stroke-linecap="round"/><path d="M1,4.500l3.500,-3.500M15,4.500l-3.500,-3.500" fill="none" stroke="#3a2416" stroke-width="1.300" stroke-linecap="round"/>`);
    let s = ''; for (let i = 0; i < 5; i++) s += `<path d="M${4.5 + i * 9.5},.8L${8.5 + i * 9.5},6L${4.5 + i * 9.5},11.200L${.5 + i * 9.5},6Z" fill="${i < n ? 'var(--k1)' : 'none'}" stroke="${INK}" stroke-width="${i < n ? .9 : .7}" opacity="${i < n ? 1 : .45}"/>`;
    return SVG('', 0, 0, 48, 12, s);
  };

  let uid = 0;
  Harness.register({
    id: 'goblin-envelope',
    name: 'Goblin: the balloon says it',
    blurb: 'The gloomy goblin, arms folded on the rim. The envelope itself is the rating, from leaking sackcloth to crimson and gold with bunting, so it still reads far off in the sky. The news is a canvas banner laced to a pole under the basket: it unrolls on arrival and rolls up again before he leaves.',
    create(ctx) {
      const E = ctx.el, K = () => 1 / ctx.pace();
      const H = (cls, html) => { const d = E('div', cls); d.innerHTML = html; return d; }; // trusted markup of our own only
      const flights = new Set();

      function fill(rig, n) {
        const mood = M[n.mood] ? n.mood : 'calibrating', c = rig.cloth, kc = ENV[mood].k;
        rig.ban.dataset.mood = mood; rig.ban.dataset.kind = n.kind;
        rig.ban.style.setProperty('--k1', kc[0]); rig.ban.style.setProperty('--k2', kc[1]);
        c.textContent = '';
        const ach = n.kind === 'achievement';
        if (ach) c.append(E('div', 'genv-tag', n.label));
        c.append(E('div', 'genv-title', n.title));
        const fig = E('div', 'genv-fig', n.big);
        if (n.unit) fig.append(E('span', 'genv-unit', n.unit));
        c.append(fig);
        if (n.kind === 'kill') {
          const r = E('div', 'genv-rate');
          r.append(ctx.svg(pips(RANK[mood] || 0, mood === 'pvp')));
          r.append(n.label ? E('span', 'genv-word', n.label) : E('span', 'genv-q', '?'));
          c.append(r);
        } else if (!ach && n.label) c.append(E('div', 'genv-tag', n.label));
        c.append(E('div', 'genv-more', n.more));
      }

      function dress(rig, mood, first) {
        rig.mood = mood;
        rig.root.dataset.mood = mood; rig.root.dataset.sky = ctx.skyMode();
        const art = envArt(mood, ++uid), eh = H('genv-eh', art.html);
        for (const old of rig.ebr.querySelectorAll('.genv-eh')) { if (first) old.remove(); else { old.classList.add('genv-out'); setTimeout(() => old.remove(), 600); } }
        if (!first && !ctx.reduced) eh.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 550, easing: 'ease-in-out' });
        rig.ebr.append(eh);
        const a = art.a, d = `M${-a},${MY - 14}L-49,218M${a},${MY - 14}L49,218M${-a + 12},${MY - 8}L-41,218M${a - 12},${MY - 8}L41,218`;
        for (const p of rig.root.querySelectorAll('.genv-rp')) p.setAttribute('d', d);
        rig.x.innerHTML = XTRA[mood]();
        rig.trail = [...rig.x.querySelectorAll('.genv-trail')];
        rig.conf.textContent = '';
        if (mood === 'superb') {
          const r = ctx.rng(uid * 7 + 3);
          for (let i = 0; i < 14; i++) { const c = E('i'); c.style.cssText = `left:${(8 + r() * 184).toFixed(0)}px;background:${CONF[i % 5]};--dx:${(r() * 50 - 25).toFixed(0)}px;--r:${(r() * 900 - 450).toFixed(0)}deg;animation-delay:${(-r() * 3.4).toFixed(2)}s;animation-duration:${(2.8 + r() * 1.6).toFixed(2)}s`; rig.conf.append(c); }
        }
      }

      function build(n, still) {
        const u = ++uid, mood = M[n.mood] ? n.mood : 'calibrating';
        const root = E('div', 'genv' + (still ? ' genv-still' : '') + (ctx.reduced ? ' genv-rm' : ''));
        const env = E('div', 'genv-env'), ebr = E('div', 'genv-ebr'); env.append(ebr);
        const glow = E('div', 'genv-glow'), fl = H('genv-fl', FLAME), conf = E('div', 'genv-conf');
        const car = E('div', 'genv-car');
        const head = E('div', 'genv-head'), pose = E('div', 'genv-pose'), nod = E('div', 'genv-nod'), hbr = H("genv-hbr", headArt(u));
        nod.append(hbr); pose.append(nod); head.append(pose);
        const arms = E('div', 'genv-l genv-arms'), hl = H('genv-hand', arm(u, -1)), hr = H('genv-hand', arm(u, 1)); arms.append(hl, hr);
        const x = E('div', 'genv-l genv-x');
        const ban = E('div', 'genv-ban'), cloth = E('div', 'genv-cloth'), run = E('div', 'genv-run'), rodx = E('div', 'genv-rodx');
        rodx.append(E('div', 'genv-rod'), E('div', 'genv-roll')); run.append(rodx); ban.append(cloth, run);
        const pl = H('genv-l', pole(u)); pl.style.zIndex = 4;
        car.append(H('genv-l', ropes(44)), H('genv-l', basket(u)), ban, pl, head, arms, x);
        root.append(car, env, glow, fl, conf);
        const rig = { root, env, ebr, glow, fl, conf, car, head, nod, hl, hr, x, ban, cloth, run, rodx, roll: rodx.lastChild, trail: [], dead: false };
        fill(rig, n); dress(rig, mood, true);
        return rig;
      }

      // ---- alive: blinks, glances, ear twitches, shifting hands ----
      function alive(rig) {
        if (ctx.reduced) return;
        const r = ctx.rng((Math.random() * 1e9) | 0), S = rig.head.style;
        const lids = rig.head.querySelectorAll('.genv-bl'), ears = rig.head.querySelectorAll('.genv-et');
        const blink = (delay = 0, hold = 0) => lids.forEach((l) => l.animate([{ transform: 'none' }, { transform: 'translateY(11px)', offset: .38 }, { transform: 'translateY(11px)', offset: .56 }, { transform: 'none' }], { duration: 170 + hold, delay, easing: 'ease-in-out' }));
        const gaze = (x, y) => { S.setProperty('--gx', x.toFixed(1)); S.setProperty('--gy', y.toFixed(1)); };
        const twitch = (e, amp = 9) => e.animate([{ transform: 'none' }, { transform: `rotate(${-amp}deg)`, offset: .25 }, { transform: `rotate(${amp * .4}deg)`, offset: .5 }, { transform: `rotate(${-amp * .5}deg)`, offset: .72 }, { transform: 'none' }], { duration: 430, easing: 'ease-in-out' });
        rig.act = { blink, gaze, twitch, ears };
        const tick = () => {
          if (rig.dead || !rig.root.isConnected) return;
          const q = r();
          if (!rig.busy) {
            if (q < .3) blink(); else if (q < .4) { blink(); blink(250); } else if (q < .54) gaze(r() - .5, 1.9);
            else if (q < .66) gaze(0, 0); else if (q < .75) { gaze(r() * 1.6 - .8, -2); blink(90); } else if (q < .8) gaze(r() < .5 ? -2.3 : 2.3, .3);
            else if (q < .9) twitch(ears[r() < .5 ? 0 : 1], 6 + r() * 6);
            else { const h = r() < .5 ? rig.hl : rig.hr; h.style.transform = `translate(${(r() * 4 - 2).toFixed(1)}px,${(r() * 1.2 - .4).toFixed(1)}px) rotate(${(r() * 2 - 1).toFixed(1)}deg)`; }
          }
          rig.timer = setTimeout(tick, 550 + r() * 1700);
        };
        rig.timer = setTimeout(tick, 300 + r() * 900);
      }
      // one small piece of business on arrival, by mood
      function business(rig) {
        const A = rig.act; if (!A) return;
        const d = K(), nod = (kf, ms, o = {}) => rig.nod.animate(kf, { duration: ms * d, easing: 'ease-in-out', ...o });
        const T = (fn, ms) => setTimeout(() => { if (!rig.dead) fn(); }, ms * d);
        rig.busy = true; T(() => { rig.busy = false; }, 1500);
        const m = rig.mood;
        if (m === 'poor') { A.gaze(-1.4, -2.2); nod([{ transform: 'none' }, { transform: 'translateY(-1px) rotate(-3deg)', offset: .3 }, { transform: 'translateY(4px) rotate(1deg)', offset: .75 }, { transform: 'none' }], 1300); T(() => { A.blink(0, 260); A.gaze(0, 2); A.ears.forEach((e) => A.twitch(e, -7)); }, 620); }
        else if (m === 'meh') { A.gaze(0, 1.9); T(() => A.gaze(-2, -1.6), 300); T(() => A.gaze(2, -1.8), 560); T(() => { A.gaze(.4, .2); A.blink(0, 200); A.twitch(A.ears[1], 8); }, 860); }
        else if (m === 'good') { A.gaze(0, 1.9); nod([{ transform: 'none' }, { transform: 'translateY(4px) rotate(1.500deg)', offset: .4 }, { transform: 'translateY(-1px)', offset: .75 }, { transform: 'none' }], 520, { delay: 300 * d }); T(() => A.gaze(0, 0), 900); }
        else if (m === 'great') { A.gaze(0, 1.9); A.ears.forEach((e) => A.twitch(e, 12)); nod([{ transform: 'none' }, { transform: 'translateY(-4px) rotate(-2deg)', offset: .3 }, { transform: 'translateY(2px) rotate(1deg)', offset: .65 }, { transform: 'none' }], 620, { delay: 150 * d }); T(() => { A.gaze(0, 0); A.blink(); }, 800); }
        else if (m === 'superb') { A.gaze(0, 0); A.ears.forEach((e) => A.twitch(e, 14)); nod([{ transform: 'none' }, { transform: 'translateY(-5px) rotate(-3deg)', offset: .25 }, { transform: 'translateY(2px) rotate(2deg)', offset: .55 }, { transform: 'translateY(-2px) rotate(-1deg)', offset: .8 }, { transform: 'none' }], 760); T(() => A.blink(0, 120), 700); }
        else if (m === 'pvp') { A.gaze(0, 1.6); nod([{ transform: 'none' }, { transform: 'translateY(3px) rotate(-2deg)' }], 600, { fill: 'forwards', delay: 200 * d }); T(() => A.gaze(0, .4), 700); T(() => A.twitch(A.ears[0], 7), 950); }
        else if (m === 'levelup') { A.gaze(-1.6, -2); A.ears.forEach((e) => A.twitch(e, 13)); nod([{ transform: 'none' }, { transform: 'translateY(-3px) rotate(-4deg)', offset: .3 }, { transform: 'translateY(-2px) rotate(4deg)', offset: .7 }, { transform: 'none' }], 1400); T(() => A.gaze(1.6, -2), 700); }
        else if (m === 'death') { A.gaze(0, 2); nod([{ transform: 'none' }, { transform: 'translateY(4px) rotate(-3deg)' }], 1000, { fill: 'forwards', delay: 150 * d }); T(() => A.blink(0, 500), 500); }
        else if (m === 'achievement') { A.gaze(0, 1.9); T(() => { A.gaze(.6, -.6); A.blink(0, 300); }, 450); nod([{ transform: 'none' }, { transform: 'translateY(-3px) rotate(-3deg)', offset: .5 }, { transform: 'translateY(-2px) rotate(-2deg)' }], 800, { fill: 'forwards', delay: 350 * d }); A.twitch(A.ears[1], 8); }
        else { A.gaze(0, 1.9); nod([{ transform: 'none' }, { transform: 'rotate(-5deg)', offset: .4 }, { transform: 'rotate(-4deg)', offset: .8 }, { transform: 'none' }], 1200); T(() => { A.gaze(-.4, 2.1); A.twitch(A.ears[0], 10); }, 500); }
      }

      // ---- the banner: unroll, roll up, half a roll for a rewrite ----
      const UP = 'translateY(calc(-100% + 13px))', CLIP = 'inset(0 0 calc(100% - 9px) 0)';
      function unroll(rig) {
        rig.ban.classList.remove('genv-rolled');
        if (ctx.reduced) return;
        const o = { duration: 640 * K() }, e1 = 'cubic-bezier(.45,0,.85,.65)', e2 = 'ease-in-out';
        rig.cloth.animate([{ clipPath: CLIP, easing: e1 }, { clipPath: 'inset(0 0 -6px 0)', offset: .62 }, { clipPath: 'inset(0 0 -6px 0)' }], o);
        rig.run.animate([{ transform: UP, easing: e1 }, { transform: 'translateY(5px)', offset: .62, easing: e2 }, { transform: 'translateY(-2.5px)', offset: .8, easing: e2 }, { transform: 'translateY(1px)', offset: .92, easing: e2 }, { transform: 'none' }], o);
        rig.roll.animate([{ transform: 'none' }, { transform: 'scaleY(.6)', offset: .62 }, { transform: 'scaleY(.6)' }], o);
      }
      function rollup(rig) {
        rig.ban.classList.add('genv-rolled');
        if (ctx.reduced) return;
        const o = { duration: 560 * K(), easing: 'cubic-bezier(.5,0,.4,1)' };
        rig.cloth.animate([{ clipPath: 'inset(0 0 -6px 0)' }, { clipPath: CLIP }], o);
        rig.run.animate([{ transform: 'none' }, { transform: 'translateY(3px)', offset: .12 }, { transform: UP }], o);
        rig.roll.animate([{ transform: 'scaleY(.6)' }, { transform: 'none' }], o);
      }
      function halfroll(rig, then) {
        const d = K(), half = 'translateY(-52%)', hc = 'inset(0 0 52% 0)';
        const a = rig.run.animate([{ transform: 'none' }, { transform: half }], { duration: 200 * d, easing: 'ease-in', fill: 'forwards' });
        const c = rig.cloth.animate([{ clipPath: 'inset(0 0 -6px 0)' }, { clipPath: hc }], { duration: 200 * d, easing: 'ease-in', fill: 'forwards' });
        a.onfinish = () => {
          then();
          rig.cloth.animate([{ clipPath: hc }, { clipPath: 'inset(0 0 -6px 0)', offset: .6 }, { clipPath: 'inset(0 0 -6px 0)' }], { duration: 420 * d });
          rig.run.animate([{ transform: half, easing: 'cubic-bezier(.45,0,.85,.65)' }, { transform: 'translateY(4px)', offset: .6 }, { transform: 'translateY(-2px)', offset: .82 }, { transform: 'none' }], { duration: 420 * d });
          a.cancel(); c.cancel();
        };
      }

      function rocket(rig, side, strapped) {
        const d = K();
        if (strapped) strapped.style.visibility = 'hidden';
        const el = H('genv-rk', ROCKET), x0 = 100 + side * 60, y0 = 226;
        el.style.left = x0 + 'px'; el.style.top = y0 + 'px';
        rig.root.append(el);
        const dx = side * (36 + Math.random() * 46), dy = -(150 + Math.random() * 80);
        el.animate([{ transform: `rotate(${side * 9}deg)`, easing: 'cubic-bezier(.5,0,.6,1)' }, { transform: `translate(${dx}px,${dy}px) rotate(${side * 20}deg)` }], { duration: 620 * d, fill: 'forwards' }).onfinish = () => {
          el.remove(); if (rig.dead) return;
          let s = ''; for (let i = 0; i < 14; i++) { const a = i * Math.PI / 7, r1 = 7, r2 = i % 2 ? 22 : 30; s += `<path d="M${n1(Math.cos(a) * r1)},${n1(Math.sin(a) * r1)}L${n1(Math.cos(a) * r2)},${n1(Math.sin(a) * r2)}" stroke="${i % 3 ? '#f0cf74' : '#f6eedb'}"/><circle cx="${n1(Math.cos(a + .2) * (r2 + 5))}" cy="${n1(Math.sin(a + .2) * (r2 + 5))}" r="1.200" fill="${i % 2 ? '#d0604c' : '#f0cf74'}"/>`; }
          const b = H('genv-bst', SVG('', -40, -40, 80, 80, `<g fill="none" stroke-width="1.500" stroke-linecap="round">${s}</g>`));
          b.firstChild.style.cssText = 'left:-40px;top:-40px';
          b.style.left = (x0 + dx) + 'px'; b.style.top = (y0 + dy - 20) + 'px';
          rig.root.append(b);
          b.animate([{ transform: 'scale(.15)', opacity: 1, easing: 'cubic-bezier(.1,.7,.3,1)' }, { transform: 'scale(1)', opacity: 1, offset: .45 }, { transform: 'scale(1.15) translateY(8px)', opacity: 0 }], { duration: 900 * d }).onfinish = () => b.remove();
        };
      }

      return {
        show(n) {
          const rig = build(n, false);
          rig.ban.classList.add('genv-rolled');
          const st = { roll: 'rolled', leaveAt: 6200, lag: 0, lv: 0, b: .3, puff: 0, last: 0, biz: false, n };
          const f = ctx.fly(rig.root, {
            w: 200, h: n.kind === 'achievement' ? 378 : n.kind === 'kill' ? 366 : 344,
            frame(o) {
              const dt = Math.min(3, Math.max(.2, (o.t - st.last) / 16.7 / Math.max(.3, ctx.pace()))); st.last = o.t;
              st.lv += ((o.swing - st.lag) * .03 - st.lv * .16) * dt; st.lag += st.lv * dt;
              const rel = st.lag - o.swing;
              rig.env.style.transform = `rotate(${(o.lean * 1.15).toFixed(2)}deg)`;
              rig.car.style.transform = `rotate(${(o.swing * .6).toFixed(2)}deg)`;
              rig.ban.style.transform = `skewX(${(-rel * 1.6 - o.swing * .5 + Math.sin(o.t * .0034) * .7).toFixed(2)}deg)`;
              rig.rodx.style.transform = `translateX(${(rel * 1.1 + Math.sin(o.t * .0034 - .9) * .8).toFixed(1)}px)`;
              const ba = (st.lag * 1.3 + rel * 2.2).toFixed(1);
              for (const t of rig.trail) t.style.transform = `rotate(${ba}deg)`;
              if (st.puff > 0) st.puff = Math.max(0, st.puff - .03 * dt);
              st.b += (Math.min(1, o.burn + st.puff) - st.b) * Math.min(1, .14 * dt);
              rig.fl.style.transform = `scale(${(.62 + st.b * .5).toFixed(2)},${(.42 + st.b * 1.05).toFixed(2)})`;
              rig.glow.style.opacity = (st.b * .95).toFixed(2);
              if (st.roll === 'rolled' && (o.phase !== 'arrive' || o.t > 2500)) { st.roll = 'down'; unroll(rig); }
              if (!st.biz && o.phase === 'read') {
                st.biz = true; business(rig);
                if (rig.mood === 'levelup' && !ctx.reduced) [[-1, 350], [1, 900], [-1, 1700]].forEach(([s, ms], i) => setTimeout(() => { if (!rig.dead) rocket(rig, s, i < 2 ? rig.x.querySelector('.genv-rk' + i) : null); }, ms * K()));
              }
              if (st.roll === 'down' && !ctx.reduced && (o.phase === 'leave' || o.t > st.leaveAt - 260)) { st.roll = 'up'; st.puff = 1; rollup(rig); }
            },
          });
          rig.fl.style.transform = 'scale(.9,1)';
          alive(rig);
          const h = { rig, f };
          flights.add(h);
          f.gone.then(() => { rig.dead = true; clearTimeout(rig.timer); flights.delete(h); });
          return {
            update(nn) {
              if (rig.dead) return;
              f.extend(700); st.leaveAt = Math.min(8200, st.leaveAt + 700);
              const mood = M[nn.mood] ? nn.mood : 'calibrating';
              const apply = () => { fill(rig, nn); if (mood !== rig.mood) dress(rig, mood, false); };
              if (st.roll === 'down' && !ctx.reduced && !st.half) { st.half = true; halfroll(rig, () => { apply(); st.half = false; }); } else apply();
              if (rig.act) { rig.act.ears.forEach((e) => rig.act.twitch(e, 8)); rig.act.gaze(0, 1.9); }
            },
          };
        },
        still(n) {
          const rig = build(n, true);
          rig.fl.style.transform = 'scale(.72,.6)'; rig.glow.style.opacity = '.3';
          rig.head.style.setProperty('--gy', 1.2);
          alive(rig);
          return rig.root;
        },
        clear() {
          for (const h of [...flights]) { h.rig.dead = true; clearTimeout(h.rig.timer); h.f.end(); }
          flights.clear();
        },
      };
    },
  });
})();
