// Round 4, passenger 6: "The Orc". A snaga posted to the Air Corps, with
// opinions about it. Mordor issue craft: stitched hides, an iron spiked band,
// a brazier that smokes too much, a basket of planks and an old shield.
//
// Build: every moving piece is its own small absolutely placed <svg> (or a
// zero-size <div> that groups some), so motion is transforms on HTML boxes and
// the engraving filter inside each piece is rastered once. All art is written
// in one coordinate system: x -100..100, y 0 at the top of the envelope.
(() => {
  const NS = 'http://www.w3.org/2000/svg', INK = '#1d1510';
  const TOP = 10, B = 8, HY = 178, PY = 197 + B;      // top padding; basket art shift; head centre; pivot (rim)
  const AX = 44, AY = 232 + B, CL = 18, SIGN_W = 186; // chain anchors under the basket, chain length
  const uri = (s) => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
  const f1 = (n) => (+n).toFixed(1);

  // ---- moods ----
  const DEF = { lid: 1.8, low: 0, bl: 4, br: 8, bly: 0, bry: 0, px: 0, py: 0, jaw: 1.2, grin: 0, snr: 0, ear: 0, ra: -96, hr: 2.5, hx: 0, hy: 1.5, sag: 1, ho: 0 };
  const M = {
    calibrating: { ra: -64, bl: -9, bly: -3, br: 5, lid: 1.4, px: -1, py: 1, hr: -3, jaw: 2.4 },
    poor: { ra: 56, snr: 1, lid: 2.6, bl: 13, br: 15, bly: 1, bry: 1, px: 2.4, py: .8, hr: -5, hx: -3, ear: 12, sag: .9, jaw: .8 },
    meh: { ra: -64, lid: 3.7, bl: 2, br: 3, bly: 1.6, bry: 1.6, py: .8, hr: 4, hy: 3, ear: 9 },
    good: { ra: 38, lid: 1.1, bl: 0, br: 2, bly: -1, bry: -1, px: 1.2, grin: .6, jaw: 1.8, hr: 1, hy: 0 },
    great: { lid: .5, bl: -4, br: -2, bly: -1.5, bry: -2, grin: 1, jaw: 4.2, hr: -2, hy: -1, ear: -6, ho: .5 },
    superb: { ra: -42, lid: 0, bl: -10, br: -10, bly: -3, bry: -3, grin: 1, jaw: 3.6, hr: -3, hy: -2, ear: -10, ho: 1 },
    pvp: { ra: 18, lid: .5, low: 1.8, bl: 16, br: 16, jaw: 8.5, hr: 0, hy: -2, ear: -8, ho: .9 },
    levelup: { ra: -15, lid: .8, bl: -3, br: -3, bly: -2, bry: -2, jaw: .4, hr: -1, hy: -3, py: -.8, ho: .5 },
    death: { lid: 2.6, bl: -22, br: -22, bly: -2.5, bry: -2.5, py: 1.7, jaw: .2, ear: 36, hr: 0, hy: 4 },
    achievement: { lid: 2.8, bl: -2, br: -7, bly: -2, bry: -3.5, grin: .7, jaw: 1, hr: -5, hy: -3, py: -.6, ear: -4, ho: .4 },
  };
  const RANK = { poor: 1, meh: 2, good: 3, great: 4, superb: 5 };
  const COL = { calibrating: '#a59b84', poor: '#8d9390', meh: '#b9a676', good: '#c2583c', great: '#9cc3dc', superb: '#f4cf58', pvp: '#d53524', levelup: '#f0c860', death: '#9aa0a6', achievement: '#7a4a18' };
  const vars = (o) => Object.keys(o).filter((k) => k in DEF).map((k) => `--${k}:${o[k]}`).join(';');

  // ---- 9-slice boards ----
  const board = (fill, scorch, seam, light, nail) => uri(`<svg xmlns='${NS}' width='90' height='90'><path d='M3,5L15,2L41,4L63,2L87,4L88,21L86,45L88,70L85,87L60,88L31,86L6,88L2,66L4,41L2,19Z' fill='${fill}' stroke='${INK}' stroke-width='1.4' stroke-linejoin='round'/><path d='M5,7L15,4.500L41,6.500L63,4.500L85,6.500L86,21L84,45L86,70L83,85L60,86L31,84L7.500,86L4.500,66L6.500,41L4.500,19Z' fill='none' stroke='${scorch}' stroke-width='5' opacity='.5'/><path d='M4,31.500H87M5,60.500H86' stroke='${seam}' stroke-width='1.1'/><path d='M8,22H80M10,40H84M6,51H70M12,72H82M20,79H86' stroke='${seam}' stroke-width='.5' opacity='.55'/><path d='M4,6L15,3.300L41,5.300L63,3.300L86,5.300' fill='none' stroke='${light}' stroke-width='1' opacity='.75'/><g fill='${nail}' stroke='${INK}' stroke-width='.6'><circle cx='9' cy='11' r='1.900'/><circle cx='81' cy='10' r='1.900'/><circle cx='9' cy='80' r='1.900'/><circle cx='81' cy='80' r='1.900'/></g></svg>`);
  const WOOD = board('#3e2c1f', '#0c0705', '#20140c', '#9a7d5a', '#8f8a80');
  const CHAR = board('#26221f', '#000', '#0e0c0b', '#6d665c', '#5c5852');
  const HIDE = uri(`<svg xmlns='${NS}' width='90' height='90'><path d='M2,3L12,8L30,5L45,7L60,5L78,8L88,3L84,14L86,30L84,45L86,60L84,76L88,87L78,83L60,85L45,83L30,85L12,83L2,87L6,76L4,60L6,45L4,30L6,14Z' fill='#d9c79c' stroke='${INK}' stroke-width='1.4' stroke-linejoin='round'/><path d='M5,7L12,10.500L30,7.500L45,9.500L60,7.500L78,10.500L85,7L82,14L84,30L82,45L84,60L82,76L85,84L78,80.500L60,82.500L45,80.500L30,82.500L12,80.500L5,84L8,76L6,60L8,45L6,30L8,14Z' fill='none' stroke='#8a6a3c' stroke-width='4' opacity='.35'/><g fill='#3a2616'><circle cx='8' cy='8' r='1.500'/><circle cx='82' cy='8' r='1.500'/><circle cx='8' cy='82' r='1.500'/><circle cx='82' cy='82' r='1.500'/></g></svg>`);

  Harness.css('orc', `
.orc-v{position:relative;width:200px;${vars(DEF)};--k:1;--go:1;--c:#b8ab8b;--hc:255,170,80;--dev:#2b1f1a;--f1:#e8792a;--f2:#ffd97a}
${Object.keys(M).map((m) => `.orc-v[data-mood=${m}]{${vars(M[m])}}`).join('\n')}
.orc-v[data-sky=dusk]{--go:.75}.orc-v[data-sky=day]{--go:.22}.orc-v[data-sky=overcast]{--go:.4}
.orc-v[data-mood=superb]{--dev:#c62d1d;--hc:255,196,90}
.orc-v[data-mood=pvp]{--dev:#b3261a;--hc:230,50,30;--f1:#c81e14;--f2:#ff8a3a}
.orc-v[data-mood=death]{--f1:#3d6fb8;--f2:#cfe6ff;--dev:#201c1a}
.orc-v[data-mood=levelup]{--hc:250,200,110}
.orc-o{position:absolute;left:100px;top:${TOP}px;width:0;height:0}
.orc-g{position:absolute;left:0;top:0;width:0;height:0}
.orc-a{position:absolute;display:block;overflow:visible}
.orc-L{will-change:transform}
.orc-x{display:none}
${Object.keys(M).map((m) => `.orc-v[data-mood=${m}] .orc-x[data-on~=${m}]{display:block;animation:orc-pop calc(.38s*var(--k)) cubic-bezier(.3,1.5,.5,1)}`).join('\n')}
.orc-v[data-sky=night] .orc-rim{filter:drop-shadow(0 0 .7px rgba(255,228,180,.55))}
.orc-v[data-sky=dusk] .orc-rim{filter:drop-shadow(0 0 .6px rgba(255,226,190,.3))}
.orc-v[data-mood=death] .orc-rim{filter:grayscale(.8) brightness(.92)}
.orc-v[data-mood=death][data-sky=night] .orc-rim{filter:grayscale(.8) brightness(.92) drop-shadow(0 0 .7px rgba(220,230,255,.5))}
.orc-halo{position:absolute;left:-150px;top:-10px;width:300px;height:280px;border-radius:50%;background:radial-gradient(closest-side,rgba(var(--hc),.34),rgba(var(--hc),.12) 45%,rgba(var(--hc),0));opacity:calc(var(--ho)*var(--go));transition:opacity .6s;animation:orc-gw 2.3s ease-in-out infinite alternate}
.orc-envb{animation:orc-eb 3.7s ease-in-out infinite alternate}
.orc-dev{fill:var(--dev);stroke:var(--dev);transition:fill .5s,stroke .5s}
.orc-ug{fill:url(#orc-ug)}
.orc-v[data-mood=pvp] .orc-ug{fill:url(#orc-ugr)}
.orc-v[data-mood=death] .orc-ug{fill:url(#orc-ugb)}
.orc-f1{fill:var(--f1)}.orc-f2{fill:var(--f2)}
.orc-fk{animation:orc-fk .9s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:50% 100%}
.orc-fk2{animation:orc-fk 1.3s ease-in-out -.4s infinite alternate-reverse;transform-box:fill-box;transform-origin:50% 100%}
.orc-v[data-mood=death] .orc-fk{animation:orc-gt 2.3s linear infinite}
.orc-sm circle{fill:url(#orc-smk);opacity:0;transform-box:fill-box;transform-origin:50% 50%;animation:orc-sm 3.6s linear infinite}
.orc-v[data-mood=poor] .orc-sm circle{fill:url(#orc-smd);animation-name:orc-sm2;animation-duration:2.6s}
.orc-v[data-mood=death] .orc-sm{display:none}
.orc-crow{animation:orc-crow 5.2s ease-in-out infinite}
.orc-flap{animation:orc-flap 1.5s ease-in-out infinite alternate}
.orc-rag{animation:orc-flap 2.6s ease-in-out infinite alternate}
.orc-shb{animation:orc-sh 3.4s ease-in-out infinite alternate}
.orc-hb{animation:orc-hbb 3.4s ease-in-out -.3s infinite alternate}
.orc-hd{transform:translate(calc(var(--hx)*1px),calc(var(--hy)*1px)) rotate(calc(var(--hr)*1deg));transition:transform calc(.5s*var(--k)) cubic-bezier(.3,1.3,.5,1)}
.orc-arm{transform:rotate(calc(var(--ra)*1deg));transition:transform calc(.5s*var(--k)) cubic-bezier(.3,1.25,.5,1)}
.orc-eL{transform:rotate(calc(var(--ear)*-1deg))}.orc-eR{transform:rotate(calc(var(--ear)*1deg))}
.orc-bL{transform:translateY(calc(var(--bly)*1px)) rotate(calc(var(--bl)*1deg))}
.orc-bR{transform:translateY(calc(var(--bry)*1px)) rotate(calc(var(--br)*-1deg))}
.orc-jw{transform:translateY(calc(var(--jaw)*1px))}
.orc-jb{animation:orc-jb 3.4s ease-in-out infinite alternate}
.orc-v[data-mood=meh] .orc-jb{animation:orc-chew 1.1s ease-in-out infinite}
.orc-v[data-mood=meh] .orc-arm2{animation:orc-gnaw 1.1s ease-in-out infinite}
.orc-v[data-mood=calibrating] .orc-arm2{animation:orc-pick 1.7s ease-in-out infinite}
.orc-eL,.orc-eR,.orc-bL,.orc-bR,.orc-jw,.orc-lid,.orc-low,.orc-pm{transition:transform calc(.4s*var(--k)) ease-out}
.orc-lid{transform:translateY(calc(var(--lid)*1px))}
.orc-low{transform:translateY(calc(var(--low)*-1px))}
.orc-pm{transform:translate(calc(var(--px)*1px),calc(var(--py)*1px))}
.orc-gz{transition:transform .16s ease-out}
.orc-grin{opacity:var(--grin);transition:opacity calc(.3s*var(--k))}
.orc-snr{opacity:var(--snr);transition:opacity calc(.25s*var(--k))}
.orc-v[data-mood=levelup] .orc-arm2{scale:1 1.32}
.orc-fg{animation:orc-drum 5.6s ease-in-out infinite}
.orc-dangle{animation:orc-dg 1.9s ease-in-out infinite alternate}
.orc-snd{opacity:0}
.orc-spit{position:absolute;left:-10px;top:${HY + 12}px;width:4px;height:5px;border-radius:50% 50% 50% 50%/60% 60% 40% 40%;background:#cfd6c2;opacity:0}
.orc-cf{position:absolute;left:0;top:0}
.orc-cf i{position:absolute;top:40px;width:6px;height:4px;opacity:0;animation:orc-cf 3.1s linear infinite}
.orc-ropes line{stroke-linecap:round}
@keyframes orc-pop{from{scale:.5;opacity:0}to{scale:1;opacity:1}}
@keyframes orc-gw{from{scale:.96}to{scale:1.03}}
@keyframes orc-eb{from{transform:scale(1,var(--sag))}to{transform:scale(1.016,calc(var(--sag)*.986))}}
@keyframes orc-fk{0%{transform:scale(1,1) skewX(0)}45%{transform:scale(.86,1.16) skewX(-5deg)}100%{transform:scale(1.08,.88) skewX(4deg)}}
@keyframes orc-gt{0%,30%{opacity:.9}34%{opacity:.3}40%{opacity:.8}46%{opacity:.2}55%,70%{opacity:.6}74%{opacity:.15}80%,100%{opacity:.9}}
@keyframes orc-sm{0%{transform:translate(0,0) scale(.5);opacity:0}12%{opacity:.5}60%{opacity:.3}100%{transform:translate(64px,-66px) scale(2.6);opacity:0}}
@keyframes orc-sm2{0%{transform:translate(0,0) scale(.8);opacity:0}10%{opacity:.92}65%{opacity:.7}100%{transform:translate(78px,-112px) scale(4.2);opacity:0}}
@keyframes orc-crow{0%,58%,74%,100%{transform:none}62%,70%{transform:rotate(14deg)}66%{transform:rotate(9deg)}}
@keyframes orc-flap{from{transform:skewY(-5deg) scaleX(1)}to{transform:skewY(6deg) scaleX(.92)}}
@keyframes orc-sh{from{transform:translateY(.6px)}to{transform:translateY(-1.300px)}}
@keyframes orc-hbb{from{transform:translateY(.5px)}to{transform:translateY(-.9px)}}
@keyframes orc-jb{from{transform:translateY(-.3px)}to{transform:translateY(1.900px)}}
@keyframes orc-chew{0%,100%{transform:translateY(0)}35%{transform:translateY(3.200px)}60%{transform:translateY(.4px)}80%{transform:translateY(2.200px)}}
@keyframes orc-gnaw{0%,100%{transform:rotate(0)}35%{transform:rotate(-4deg)}70%{transform:rotate(3deg)}}
@keyframes orc-pick{0%,100%{transform:rotate(0)}30%{transform:rotate(-5deg)}50%{transform:rotate(1deg)}70%{transform:rotate(-4deg)}}
@keyframes orc-drum{0%,78%,100%{transform:none}81%,87%,93%{transform:rotate(-30deg)}84%,90%,96%{transform:none}}
@keyframes orc-dg{from{transform:rotate(-7deg)}to{transform:rotate(8deg)}}
@keyframes orc-cf{0%{transform:translate(0,-30px) rotate(0);opacity:0}8%{opacity:1}80%{opacity:.9}100%{transform:translate(var(--x),190px) rotate(var(--r));opacity:0}}
.orc-sign{position:absolute;left:${100 - SIGN_W / 2}px;top:${TOP + AY + CL - 6}px;width:${SIGN_W}px;transform-origin:${SIGN_W / 2}px 6px;will-change:transform;text-align:center;color:#f1e8d0;--dim:#cdc1a2;font-family:"Cormorant Garamond",Georgia,serif;filter:drop-shadow(0 3px 3px rgba(0,0,0,.5))}
.orc-v[data-sky=night] .orc-sign,.orc-v[data-sky=dusk] .orc-sign{filter:drop-shadow(0 0 .7px rgba(255,228,180,.5)) drop-shadow(0 3px 3px rgba(0,0,0,.5))}
.orc-bd{position:relative;box-sizing:border-box;width:${SIGN_W}px;border:11px solid transparent;border-image:${WOOD} 16 fill/11px stretch;padding:0 1px}
.orc-bd::before{content:"";position:absolute;left:10px;right:10px;top:-9px;height:15px;background:radial-gradient(ellipse 50% 100% at 50% 0,rgba(0,0,0,.5),transparent);pointer-events:none}
.orc-ring{position:absolute;top:1.500px;width:9px;height:9px;margin-left:-4.500px;border-radius:50%;box-sizing:border-box;border:2px solid #34302c;background:#080605;box-shadow:0 0 0 .6px rgba(255,230,190,.4)}
.orc-in{position:relative;margin:-3px 0 -4px}
.orc-in>div:empty{display:none}
.orc-title{font:italic 600 16px/1.06 "Cormorant Garamond",Georgia,serif;text-wrap:balance;overflow-wrap:anywhere;text-shadow:0 1px 1px rgba(0,0,0,.6)}
.orc-fig{font:600 25px/1 "Cormorant Garamond",Georgia,serif;font-variant-numeric:lining-nums;white-space:nowrap;text-shadow:0 1px 1px rgba(0,0,0,.6)}
.orc-unit{font:italic 500 15px/1 "Cormorant Garamond",Georgia,serif;margin-left:4px;color:var(--dim)}
.orc-rate{display:flex;justify-content:center;align-items:center;gap:6px;margin-top:2px;height:17px}
.orc-marks{display:block;overflow:visible}
.orc-marks path{fill:none;stroke-width:2.300;stroke-linecap:round}
.orc-ck{stroke:var(--c)}.orc-gh{stroke:#f1e8d0;opacity:.16}
.orc-new{stroke-dasharray:16;animation:orc-scr calc(.3s*var(--k)) ease-out backwards}
@keyframes orc-scr{from{stroke-dashoffset:16}to{stroke-dashoffset:0}}
.orc-word{position:relative;isolation:isolate;font:400 13.500px/17px "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.16em;color:#17100a;padding:0 5px 0 8px}
.orc-word::before{content:"";position:absolute;z-index:-1;inset:0 -2px -1px -1px;background:var(--c);border-radius:42% 9% 46% 12%/65% 30% 70% 40%;transform:rotate(-1.300deg) skewX(-8deg)}
.orc-stick{display:block}
.orc-more{font:italic 500 13px/1.08 "Cormorant Garamond",Georgia,serif;color:var(--dim);margin-top:3px;text-wrap:balance}
.orc-tag{font:400 11.500px/1.3 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.24em;margin-right:-.24em;text-transform:uppercase}
.orc-sign[data-mood=superb] .orc-fig{color:#f8dc84}
.orc-sign[data-mood=pvp] .orc-word{color:#fff1dc}
.orc-sign[data-kind=levelup] .orc-fig{font-size:28px;color:#f6d98a;padding:5px 0 3px}
.orc-chev{display:block;margin:2px auto 3px}
.orc-sign[data-kind=death]{color:#d9d6cf}
.orc-sign[data-kind=death] .orc-bd{border-image-source:${CHAR}}
.orc-sign[data-kind=death] .orc-fig{font:400 23px/1.25 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.15em;margin-right:-.15em;text-transform:lowercase;font-variant:small-caps;padding:8px 0 6px}
.orc-sign[data-kind=achievement]{color:#2a190d;filter:drop-shadow(0 3px 3px rgba(0,0,0,.5))}
.orc-sign[data-kind=achievement] .orc-bd{border-image-source:${HIDE}}
.orc-sign[data-kind=achievement] .orc-title{font:italic 600 14px/1.1 "Cormorant Garamond",Georgia,serif;text-shadow:none;padding-bottom:3px}
.orc-sign[data-kind=achievement] .orc-tag{color:#6a2a16;padding-top:5px}
.orc-still{position:relative}
.orc-rm *,.orc-rm *::before{animation:none!important;transition:none!important}
`);

  // ---- shared defs (once): the warden's pen wobble and grain wash, hatching, tints ----
  const lg = (id, a, b, c, v) => `<linearGradient id="orc-${id}" x1="0" ${v ? 'x2="0" y2="1"' : 'x2="1"'}><stop offset="0" stop-color="${a}"/><stop offset=".5" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`;
  const rg = (id, col) => `<radialGradient id="orc-${id}"><stop offset="0" stop-color="rgb(${col})" stop-opacity=".85"/><stop offset=".5" stop-color="rgb(${col})" stop-opacity=".3"/><stop offset="1" stop-color="rgb(${col})" stop-opacity="0"/></radialGradient>`;
  const hatch = (id, rot, gap, op) => `<pattern id="orc-${id}" patternUnits="userSpaceOnUse" width="${gap}" height="${gap}" patternTransform="rotate(${rot})"><path d="M0,.5H${gap}" stroke="${INK}" stroke-width=".55" opacity="${op}"/></pattern>`;
  const ALM = 'M-8.500,0Q0,-8 8.500,0Q0,5.500 -8.500,0Z';
  const ENV = 'M0,8C50,8 85,26 85,52C85,74 42,90 17,106L-17,106C-42,90 -85,74 -85,52C-85,26 -50,8 0,8Z';
  function defs() {
    if (document.getElementById('orc-defs')) return;
    const t = document.createElement('div');
    t.innerHTML = `<svg id="orc-defs" xmlns="${NS}" width="0" height="0" style="position:absolute"><defs>
<filter id="orc-f" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.800" xChannelSelector="R" yChannelSelector="G" result="d"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .13 0 0 0 0 .08 0 0 0 0 .04 1.500 0 0 0 -.7" result="b"/><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="11"/><feColorMatrix type="matrix" values="0 0 0 0 .12 0 0 0 0 .07 0 0 0 0 .04 0 1.200 0 0 -.56" result="g"/><feMerge result="m"><feMergeNode in="b"/><feMergeNode in="g"/></feMerge><feComposite in="m" in2="d" operator="in" result="mc"/><feMerge><feMergeNode in="d"/><feMergeNode in="mc"/></feMerge></filter>
${hatch('h1', 38, 3, .6)}${hatch('h2', -52, 3.4, .5)}
${lg('sk', '#69654f', '#979173', '#b9b28f')}${lg('ir', '#26282b', '#4a4e52', '#82878c')}${lg('wd', '#3f2d20', '#5e4631', '#80623f')}${lg('lt', '#2a2019', '#43342a', '#5c4939')}
${lg('bn', '#a99c78', '#d6cba6', '#efe6c8')}${lg('st', '#6f8798', '#bfd3e0', '#f6fcff')}${lg('gd', '#8a6418', '#d6a936', '#f8e391')}${lg('hn', '#2c2018', '#6b5638', '#c9b587')}
${rg('smk', '125,116,104')}${rg('smd', '26,22,20')}${rg('ug', '255,160,60')}${rg('ugr', '235,50,30')}${rg('ugb', '110,160,235')}
<clipPath id="orc-ec"><path d="${ALM}"/></clipPath><clipPath id="orc-ep"><path d="${ENV}"/></clipPath>
</defs></svg>`;
    document.body.append(t.firstChild);
  }

  // ---- piece builders ----
  // A: one <svg> piece. box in art coordinates [x,y,w,h]; dy shifts it on the rig; o = transform origin (art coords)
  const A = (cls, [x, y, w, h], inner, { dy = 0, o, on, raw } = {}) =>
    `<svg class="orc-a ${cls}${on ? ' orc-x' : ''}" xmlns="${NS}" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}" style="left:${x}px;top:${y + dy}px${o ? `;transform-origin:${o[0] - x}px ${o[1] - y}px` : ''}"${on ? ` data-on="${on}"` : ''}>${raw ? inner : `<g filter="url(#orc-f)" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">${inner}</g>`}</svg>`;
  // G: a zero-size group; o = transform origin on the rig
  const G = (cls, o, kids, on) => `<div class="orc-g ${cls}${on ? ' orc-x' : ''}" style="transform-origin:${o[0]}px ${o[1]}px"${on ? ` data-on="${on}"` : ''}>${kids}</div>`;
  const flame = (x, y, s) => `<g transform="translate(${x},${y}) scale(${s})"><path class="orc-f1 orc-fk" d="M0,0C-9,0 -10,-9 -5,-14C-4,-10 -2,-9 -1,-17C3,-12 4,-9 6,-13C10,-7 9,0 0,0Z" stroke="#7a2a0c" stroke-width=".6"/><path class="orc-f2 orc-fk2" d="M0,-.5C-4.500,-.5 -5,-5 -2,-8C-1,-5 1,-5 1.500,-9C4,-5 4.500,-.5 0,-.5Z"/></g>`;

  // ---- the envelope ----
  const patch = (d, c) => `<path d="${d}" fill="${c}" stroke-width="1"/><path d="${d}" fill="none" stroke="#0e0906" stroke-width="4.400" stroke-dasharray=".9 3.800" stroke-linecap="butt" opacity=".85"/>`;
  const bandY = (x) => 50 + 8 * (1 - (x / 85) ** 2);
  const spikes = [-66, -44, -22, 0, 22, 44, 66].map((x) => { const y = bandY(x) + 7; return `<path d="M${x - 3.6},${f1(y)}L${f1(x + x / 85 * 5)},${f1(y + 11)}L${x + 3.6},${f1(y)}Z" fill="url(#orc-ir)" stroke-width=".9"/>`; }).join('');
  const rivs = [-76, -55, -33, -11, 11, 33, 55, 76].map((x) => `<circle cx="${x}" cy="${f1(bandY(x) + 3.6)}" r="1.300" fill="#9aa0a4" stroke-width=".5"/>`).join('');
  const envelope = A('', [-98, -4, 196, 118], `
<path d="${ENV}" fill="#7b6d5a" stroke-width="1.300"/>
<g clip-path="url(#orc-ep)">
${patch('M-34,6L6,4L12,36L-24,42Z', '#8e7f67')}${patch('M-92,36L-42,18L-24,42L-36,62L-92,66Z', '#5f564b')}${patch('M12,36L54,10L92,30L90,56L46,58L16,52Z', '#9c8c6e')}
${patch('M-36,62L-24,42L12,36L16,52L8,78L-30,80Z', '#6d5d4e')}${patch('M46,58L90,56L62,86L24,94L8,78L16,52Z', '#86725b')}${patch('M-92,66L-36,62L-30,80L-16,108L-54,96Z', '#544c43')}${patch('M-30,80L8,78L24,94L18,108L-16,108Z', '#77664f')}
${patch('M40,74l17,-4l4,15l-18,4Z', '#b29e78')}${patch('M-66,24l14,-5l5,12l-14,5Z', '#8a5e44')}
<path d="M0,8C-50,8 -85,26 -85,52C-85,74 -42,90 -17,106L-6,106C-30,88 -56,74 -56,50C-56,28 -34,13 0,8Z" fill="#170f0a" opacity=".3" stroke="none"/>
<path d="M0,8C-50,8 -85,26 -85,52C-85,74 -42,90 -17,106L-6,106C-30,88 -56,74 -56,50C-56,28 -34,13 0,8Z" fill="url(#orc-h1)" stroke="none"/>
<path d="M0,8C-50,8 -85,26 -85,52C-85,74 -42,90 -17,106L-12,106C-40,88 -72,74 -72,52C-72,30 -44,13 0,8Z" fill="url(#orc-h2)" stroke="none"/>
<path d="M-84,80L84,80L84,110L-84,110Z" fill="url(#orc-h2)" stroke="none" opacity=".6"/>
<ellipse cx="42" cy="26" rx="28" ry="11" transform="rotate(24 42 26)" fill="#fff0cc" opacity=".13" stroke="none"/>
</g>
<path d="${ENV}" fill="none" stroke-width="1.300"/>
<path d="M30,11.500C58,16 80,32 83.500,50" fill="none" stroke="#ffe9bd" stroke-width="1" opacity=".5"/>
<path d="M-85,49L-97,52L-85,57Z" fill="url(#orc-ir)" stroke-width=".9"/><path d="M85,49L97,52L85,57Z" fill="#8a8f93" stroke-width=".9"/>
${spikes}
<path d="M-85,50Q0,66 85,50L85,58Q0,74 -85,58Z" fill="url(#orc-ir)" stroke-width="1.100"/>
<path d="M-85,50Q-30,60 -20,60L-20,68Q-50,65 -85,58Z" fill="url(#orc-h1)" stroke="none"/>
<path d="M-83,51.500Q0,67.500 83,51.500" fill="none" stroke="#c8ced2" stroke-width=".6" opacity=".7"/>${rivs}
<path d="M-17,104Q0,100 17,104L17,108Q0,112 -17,108Z" fill="url(#orc-ir)" stroke-width="1"/><path d="M-13,106.500Q0,104.500 13,106.500Q0,110 -13,106.500Z" fill="#0d0907" stroke="none"/>`);
  const device = A('', [-30, 12, 64, 40], `<g class="orc-dev" stroke-width="3.200" opacity=".86"><path d="M-22,32Q4,13 30,31Q5,47 -22,32Z" fill="none"/><path d="M4,22Q9.500,31 4.500,41Q-1,31 4,22Z" stroke-width="1"/><path d="M-27,24l7,4M35,23l-6,4M3,10v6" stroke-width="2.200" fill="none"/></g>`);
  const drips = A('', [-30, 12, 64, 50], `<path class="orc-dev" d="M-8,40.500v9M12,41v6M22,36v10M-15,36.500v5" fill="none" stroke-width="1.700" opacity=".9"/>`, { on: 'superb' });
  const stripe = A('', [-80, 62, 160, 44], `<path d="M-74,66Q0,88 74,66L66,76Q0,98 -66,76Z" fill="#dba832" stroke-width=".9"/><path d="M-60,74Q0,93 60,74" fill="none" stroke="#fff0b8" stroke-width=".9" opacity=".7"/><path d="M-30,89v6M8,92.500v7M40,87v5" fill="none" stroke="#dba832" stroke-width="1.800"/>`, { on: 'levelup' });
  const folds = A('', [-90, 4, 180, 104], `<path d="M-34,9Q0,25 38,10Q0,13 -34,9Z" fill="#1a110b" opacity=".55" stroke="none"/><path d="M-62,24Q-50,38 -64,50M-22,13Q-10,29 -26,42M42,16Q56,30 46,46M12,74Q20,86 8,99M-46,72Q-36,84 -44,94M64,28Q72,38 68,48" fill="none" stroke-width="1.100"/><path d="M-59,26Q-48,38 -60,49M45,18Q57,30 49,44" fill="none" stroke="#d9c7a0" stroke-width=".7" opacity=".6"/>`, { on: 'poor death' });
  const crow = A('orc-crow', [-54, -8, 40, 26], `<g transform="translate(-32,12)" stroke="#000" stroke-width=".8"><path d="M-2,0v5M3,0v5" stroke-width="1.100" fill="none"/><path d="M-12,-3C-12,-11 -4,-15 3,-12C5,-17 11,-17 13,-13L20,-11L13,-9.500C12,-5 8,-1 2,0L-10,1L-21,6L-14,-1Z" fill="#191613"/><path d="M-8,-6C-3,-9 3,-8 7,-4M-12,-1L-4,-3" fill="none" stroke="#5a554e" stroke-width=".7"/><circle cx="10.500" cy="-13.300" r="1" fill="#e0cf90" stroke="none"/></g>`, { on: 'poor', o: [-32, 12] });
  const pennant = A('', [10, -8, 40, 24], `<path d="M14,11L16,-6" fill="none" stroke-width="1.800"/>`, { on: 'great' }) + A('orc-flap', [14, -8, 36, 16], `<path d="M16,-6L46,-3Q36,0 42,4L16,3Z" fill="#b8281b" stroke-width=".9"/><path d="M20,-3.500L36,-1.500" fill="none" stroke="#f0907a" stroke-width=".7" opacity=".7"/>`, { on: 'great', o: [16, -2] });
  const rag = A('orc-rag', [-100, 48, 24, 60], `<path d="M-93,50C-99,64 -88,78 -96,98L-90,92L-86,100C-82,84 -88,68 -84,52Z" fill="#0d0b0a" stroke="#3d3833" stroke-width=".8"/><path d="M-90,56C-93,68 -88,78 -91,90" fill="none" stroke="#4a443e" stroke-width=".6"/>`, { on: 'death', o: [-90, 52] });
  const brazier = A('', [-20, 104, 40, 28], `<path d="M-15,107L-11,119M15,107L11,119M0,109V118" fill="none" stroke="#17120f" stroke-width="1.500" stroke-dasharray="2 1.200"/><path d="M-14,118.500L14,118.500L10,127.500L-10,127.500Z" fill="url(#orc-ir)" stroke-width="1.100"/><path d="M-9,121.500l2,4M-3,121.500l1,4M3,121.500l-1,4M9,121.500l-2,4" fill="none" stroke="#ff9a3a" stroke-width="1.300" opacity=".85"/><path d="M-15.500,117.500H15.500V120H-15.500Z" fill="#191614" stroke-width=".8"/>`);
  const smoke = A('orc-sm orc-L', [-10, 0, 120, 130], [0, .6, 1.2, 1.8, 2.4, 3].map((d, i) => `<circle cx="${12 + i % 2 * 3}" cy="${114 - i % 2 * 2}" r="${5 + i % 3}" style="animation-delay:-${d}s"/>`).join(''), { raw: 1 });
  const underglow = A('orc-L', [-60, 70, 120, 44], `<g clip-path="url(#orc-ep)"><ellipse class="orc-ug" cx="0" cy="110" rx="56" ry="36"/></g>`, { raw: 1 });

  // ---- the basket ----
  const PLK = [-50, -35, -19, -4, 11, 27, 50], PC = ['#5b4532', '#4a3828', '#685039', '#54402e', '#6b543c', '#4c3a2a'];
  let planks = '';
  for (let i = 0; i < 6; i++) { const a = PLK[i], b = PLK[i + 1], d = [1, -1, 2, 0, -1, 1][i]; planks += `<path d="M${a},199L${b},199L${f1(b * .9)},${227 + d}L${f1(a * .9)},${228 - d}Z" fill="${PC[i]}" stroke-width=".9"/><path d="M${a + 4},203L${f1(a * .9 + 4)},224M${b - 5},204L${f1(b * .9 - 4)},222" fill="none" stroke-width=".45" opacity=".6"/><circle cx="${f1((a + b) / 2)}" cy="204.500" r="1" fill="#8d9195" stroke-width=".4"/><circle cx="${f1((a + b) * .46)}" cy="223.500" r="1" fill="#8d9195" stroke-width=".4"/>`; }
  const ringHook = (s) => `<path d="M${s * 42},226v3M${s * 46},226v3" fill="none" stroke="#17120f" stroke-width="1.600"/><circle cx="${s * AX}" cy="230.500" r="2.800" fill="none" stroke="#17120f" stroke-width="2"/><path d="M${s * AX - 2},229a2.800,2.800 0 0 1 4,0" fill="none" stroke="#9aa0a4" stroke-width=".6"/>`;
  const basket = A('', [-60, 190, 120, 46], `${planks}
<path d="M-50,199L-35,199L-31.500,228L-45,228Z" fill="url(#orc-h1)" stroke="none"/><path d="M-50,199L-19,199L-17,228L-45,228Z" fill="#150d08" opacity=".22" stroke="none"/>
<path d="M-50,199H50V203.500H-50Z" fill="#120b07" opacity=".4" stroke="none"/>
<circle cx="31" cy="214" r="13.500" fill="#3f3d39" stroke-width="1.100"/><circle cx="31" cy="214" r="10.500" fill="none" stroke-width=".6" opacity=".7"/><path d="M19.500,208A13.500,13.500 0 0 0 26,226.500L27.500,224A10.500,10.500 0 0 1 22,209.500Z" fill="url(#orc-h1)" stroke="none"/><path d="M31,200.500L33,208L29.500,213L32.500,219L30.500,227.500" fill="none" stroke-width=".8"/><circle cx="31" cy="214" r="4" fill="url(#orc-ir)" stroke-width=".9"/><path d="M36,203.500A13,13 0 0 1 44,214" fill="none" stroke="#b9bfc3" stroke-width=".7" opacity=".7"/>
<path d="M-48,209.500Q0,213.500 48,209.500" fill="none" stroke-width="3.600"/><path d="M-48,209.500Q0,213.500 48,209.500" fill="none" stroke="#a48d60" stroke-width="2.300"/><path d="M-48,209.500Q0,213.500 48,209.500" fill="none" stroke="#3a2a18" stroke-width="2.300" stroke-dasharray=".8 3.200" stroke-linecap="butt"/>
<text x="-31" y="224" transform="rotate(-4 -31 224)" font-family="Cinzel,serif" font-weight="700" font-size="9.500" fill="#d8ceae" stroke="none" opacity=".78" text-anchor="middle" letter-spacing=".5">N&#xB0; 37</text>
<path d="M-57,193.500C-57,191.500 57,191.500 57,193.500L56,200.500C56,202 -56,202 -56,200.500Z" fill="url(#orc-wd)" stroke-width="1.200"/><path d="M-50,195H50M-40,198.500H44" fill="none" stroke-width=".45" opacity=".55"/><path d="M-54,193.500H54" fill="none" stroke="#c9a877" stroke-width=".8" opacity=".6"/>
<path d="M-57.500,192.500H-47V201.500H-56.500Z" fill="url(#orc-ir)" stroke-width=".9"/><path d="M57.500,192.500H47V201.500H56.500Z" fill="#787d82" stroke-width=".9"/>
${ringHook(-1)}${ringHook(1)}`, { dy: B });
  const shoulders = A('', [-66, 166, 132, 40], `<path d="M-61,204C-64,190 -54,180 -38,182L38,182C54,180 64,190 61,204Z" fill="url(#orc-lt)" stroke-width="1.200"/><path d="M-61,204C-64,190 -54,180 -38,182L-30,182C-46,186 -50,194 -49,204Z" fill="url(#orc-h1)" stroke="none"/>
<path d="M-56,186L-64,170L-46,181Z" fill="url(#orc-ir)" stroke-width=".9"/><path d="M-58,192C-52,184 -44,182 -36,184M58,192C52,184 44,182 36,184" fill="none" stroke-width=".7"/><g fill="#8d9195" stroke-width=".4"><circle cx="-52" cy="191" r="1.200"/><circle cx="-45" cy="187" r="1.200"/><circle cx="52" cy="191" r="1.200"/><circle cx="45" cy="187" r="1.200"/><circle cx="56" cy="197" r="1.200"/></g>
<path d="M46,182C52,178 60,180 62,187" fill="none" stroke="#b7a27a" stroke-width=".8" opacity=".6"/>`, { dy: B });
  const sackBag = A('', [-82, 198, 34, 56], `<path d="M-60,203C-71,205 -77,218 -72,232C-70,238 -74,243 -72,250" fill="none" stroke-width="2.400"/><path d="M-60,203C-71,205 -77,218 -72,232C-70,238 -74,243 -72,250" fill="none" stroke="#5a4433" stroke-width="1.300"/>
<path d="M-56,199L-58,205C-67,209 -70,222 -64,228C-59,232 -51,231 -49,226C-46,218 -50,209 -54,205Z" fill="#8f7d5a" stroke-width="1"/><path d="M-58,205C-67,209 -70,222 -64,228C-66,220 -64,211 -58,206Z" fill="url(#orc-h1)" stroke="none"/><path d="M-59,205.500L-53,205.500" fill="none" stroke-width="1.600"/><path d="M-60,216l5,-1l1,5l-5,1Z" fill="#6b5a40" stroke-width=".6"/><path d="M-53,206l3,-7" fill="none" stroke="#e2d8b6" stroke-width="1.800"/>`, { dy: B });
  const cleaver = A('', [48, 198, 26, 36], `<path d="M56,199.500L58,205" fill="none" stroke-width="1"/><path d="M52,205H66V219C61,222.500 55,222.500 52,219Z" fill="url(#orc-ir)" stroke-width="1"/><path d="M52,214l3,1l-3,2M66,209l-2.500,1.500l2.500,1.500" fill="#0d0907" stroke-width=".6"/><path d="M54,207.500H64" fill="none" stroke="#cfd5d8" stroke-width=".7" opacity=".7"/><circle cx="58" cy="208.500" r="1.100" fill="#0d0907" stroke="none"/><path d="M58,220.500V230" fill="none" stroke-width="3.800"/><path d="M58,221V229.500" fill="none" stroke="#6f5236" stroke-width="2.400"/>`, { dy: B });

  const shield = (cx, cy, r, inner) => `<path d="M${cx - 2},${cy - r - 12}L${cx},${cy - r + 1}" fill="none" stroke-width="1.100"/><circle cx="${cx}" cy="${cy}" r="${r}" stroke-width="1.100" ${inner}`;
  const trophyA = A('', [-24, 198, 32, 32], `${shield(-8, 215, 12, 'fill="#55713f"/>')}<circle cx="-8" cy="215" r="9.500" fill="none" stroke="#e6dcbc" stroke-width="1.100"/><path d="M-8,206V224M-17,215H1M-14.500,208.500L-1.500,221.500M-14.500,221.500L-1.500,208.500" fill="none" stroke="#e6dcbc" stroke-width=".8"/><circle cx="-8" cy="215" r="3.400" fill="url(#orc-gd)" stroke-width=".8"/><path d="M-20,215A12,12 0 0 0 -13,226L-12,223A9,9 0 0 1 -17,215Z" fill="url(#orc-h1)" stroke="none"/><path d="M-3,204l-2.500,6l3.500,1.500M3.500,212l-5,1.500l1.500,3" fill="#0d0907" stroke-width=".7"/>`, { dy: B, on: 'good great' });
  const trophyB = A('', [-48, 198, 30, 32], `${shield(-33, 214, 11.5, 'fill="#27304e"/>')}<circle cx="-33" cy="214" r="9" fill="none" stroke="#cfd8de" stroke-width="1"/><path d="M-33,221.500V211M-33,214.500C-36,213 -38,211 -38,208M-33,214.500C-30,213 -28,211 -28,208M-33,212C-34.500,210 -34.500,208 -33,206.500C-31.500,208 -31.500,210 -33,212" fill="none" stroke="#f3f6f6" stroke-width="1"/><g fill="#f3f6f6" stroke="none"><circle cx="-39" cy="205.500" r=".8"/><circle cx="-33" cy="204.300" r=".8"/><circle cx="-27" cy="205.500" r=".8"/></g><path d="M-41,222l4,-5l1.500,3.500" fill="#0d0907" stroke-width=".7"/>`, { dy: B, on: 'great' });
  const tallyStick = A('', [-50, 200, 100, 30], `<g transform="rotate(-9 0 216)"><path d="M-46,212H34L42,216.500L34,221H-46Z" fill="#d6c79c" stroke-width="1.100"/><path d="M-42,215H30M-40,218.500H26" fill="none" stroke-width=".4" opacity=".5"/><path d="M-46,212H-20L-21,221H-46Z" fill="url(#orc-h1)" stroke="none"/><path d="M-34,208.500L-32,224.500M22,208.500L24,224.500" fill="none" stroke-width="3"/><path d="M-34,208.500L-32,224.500M22,208.500L24,224.500" fill="none" stroke="#5a4433" stroke-width="1.600"/></g>`, { dy: B, on: 'calibrating' });
  let meds = '';
  [-30, -18, -6, 6, 18, 30].forEach((x, i) => { const t = (x + 40) / 80, y = 203 + 2 * 9.5 * 2 * t * (1 - t); meds += i % 2 ? `<path d="M${x - 2.4},${f1(y)}C${x - 3},${f1(y + 5)} ${x - 1},${f1(y + 9)} ${x + .5},${f1(y + 11)}C${x + 2},${f1(y + 8)} ${x + 3},${f1(y + 4)} ${x + 2.4},${f1(y)}Z" fill="url(#orc-bn)" stroke-width=".8"/>` : `<circle cx="${x}" cy="${f1(y + 5)}" r="4.600" fill="${i % 4 ? '#b4babd' : 'url(#orc-gd)'}" stroke-width=".9" stroke-dasharray="1.400 1"/><circle cx="${x}" cy="${f1(y + 5)}" r="2.600" fill="none" stroke-width=".5"/><path d="M${x - 2.5},${f1(y + 3)}q2,-2 4.500,-.5" fill="none" stroke="#fff6d8" stroke-width=".7"/>`; });
  const medals = A('', [-44, 198, 88, 28], `<path d="M-40,203Q0,222 40,203" fill="none" stroke-width="2"/><path d="M-40,203Q0,222 40,203" fill="none" stroke="#8a2f22" stroke-width="1.100"/>${meds}`, { dy: B, on: 'achievement' });
  const torch = (s) => A('', [s > 0 ? 54 : -78, 160, 24, 40], `<path d="M${s * 57},197L${s * 69},173" fill="none" stroke-width="3.800"/><path d="M${s * 57},197L${s * 69},173" fill="none" stroke="#6b4f33" stroke-width="2.300"/><path d="M${s * 66},178L${s * 71},169" fill="none" stroke-width="6.500"/><path d="M${s * 66},178L${s * 71},169" fill="none" stroke="#2c2520" stroke-width="5"/>`, { dy: B, on: 'superb' }) + A('orc-L', [s * 70 - 12, 144, 24, 30], flame(s * 70, 171, 1.15), { dy: B, on: 'superb', raw: 1 });
  const banner = A('', [-96, 122, 50, 78], `<path d="M-50,197L-79,126" fill="none" stroke-width="3.200"/><path d="M-50,197L-79,126" fill="none" stroke="#5c4631" stroke-width="1.900"/><path d="M-94,131L-62,125" fill="none" stroke-width="2.600"/><path d="M-80,127l1,-7" fill="none" stroke="#82878c" stroke-width="2.200"/>`, { dy: B, on: 'pvp' }) + A('orc-rag', [-96, 124, 36, 42], `<path d="M-93,131L-63,125.500L-62,158L-69,153L-76,161L-84,155L-91,162Z" fill="#110d0c" stroke="#4d443c" stroke-width=".9"/><path d="M-89,143Q-78,133 -66,140Q-77,150 -89,143Z" fill="#cf2c1c" stroke="#5a0e08" stroke-width=".6"/><path d="M-77.500,137.500Q-75.500,141.500 -77.500,146Q-79.500,141.500 -77.500,137.500Z" fill="#0a0605" stroke="none"/>`, { dy: B, on: 'pvp', o: [-78, 128] });

  // ---- arms ----
  const armL = A('', [-66, 184, 56, 24], `<path d="M-63,196C-63,188.500 -55,187.500 -48,189.500L-28,193C-23.500,194 -23.500,201 -28,201.500L-52,203.500C-59,204 -63,201 -63,196Z" fill="url(#orc-sk)" stroke-width="1.100"/><path d="M-51,189L-38,191.500L-38.500,202.500L-51.500,203.500Z" fill="url(#orc-lt)" stroke-width=".9"/><g fill="#8d9195" stroke-width=".4"><circle cx="-47" cy="193" r="1.100"/><circle cx="-42" cy="194" r="1.100"/><circle cx="-47" cy="199.500" r="1.100"/><circle cx="-42" cy="199.500" r="1.100"/></g>
<path d="M-63,196C-63,188.500 -55,187.500 -51,189L-51.500,203.500C-59,204 -63,201 -63,196Z" fill="url(#orc-h1)" stroke="none"/>
<path d="M-29,193C-23,191 -13.500,193.500 -13,198C-13,202 -20,203.500 -29,201.500Z" fill="#a39c7d" stroke-width="1"/><path d="M-25,194.500q2,3 .5,6M-20.500,194.500q2,3 .5,6" fill="none" stroke-width=".5" opacity=".7"/>`, { dy: B });
  const fingers = A('orc-L', [-30, 196, 20, 18], [-26, -22.4, -18.8, -15.4].map((x, i) => `<g transform="translate(${x},${199 + (i === 3 ? -.6 : 0)})"><g class="orc-fg" style="animation-delay:${i * .06}s"><path d="M-1.900,-1C-1.900,-2.500 1.900,-2.500 1.900,-1L1.700,6L-1.700,6Z" fill="#9d9677" stroke="${INK}" stroke-width=".8"/><path d="M-1.700,6L.2,11L1.700,6Z" fill="#17110d" stroke="${INK}" stroke-width=".5"/><path d="M-1.300,2.500h2.600" stroke="${INK}" stroke-width=".4" opacity=".7"/></g></g>`).join(''), { dy: B, raw: 1 });
  const ARMBOX = [30, 110, 70, 100], F = '54 164';
  const armR = A('', ARMBOX, `<path d="M47.500,200C46.500,190 48.500,178 50,170L58.500,170C60,178 61.500,190 60.500,200C58.500,204.500 49.500,204.500 47.500,200Z" fill="url(#orc-sk)" stroke-width="1.100"/><path d="M47.300,192L60.800,192L59.500,177L48.800,177Z" fill="url(#orc-lt)" stroke-width=".9"/><g fill="#8d9195" stroke-width=".4"><circle cx="51" cy="181" r="1.100"/><circle cx="57" cy="181" r="1.100"/><circle cx="51" cy="188" r="1.100"/><circle cx="57" cy="188" r="1.100"/></g>
<path d="M47.500,200C46.500,190 48.500,178 50,170L52.500,170C51,180 50,192 51,202C49,202 48,201 47.500,200Z" fill="url(#orc-h1)" stroke="none"/>
<path d="M47,170C44.500,164 46.500,157 52,155.500C57.500,154.500 62.500,157.500 62.500,162.500C63,166 61,170 58.500,171Z" fill="#a39c7d" stroke-width="1.100"/><path d="M47,167.500C43.500,165.500 43.500,160 47,158.500L50.500,161Z" fill="#979173" stroke-width=".9"/><path d="M51,156.500q1.500,3.500 .5,6M55,155.800q1.500,3.500 .8,6.500M58.800,157q1.200,3 .6,5.500" fill="none" stroke-width=".6"/><path d="M47,170C44.500,164 46.500,157 50,156C48.500,161 49,166 50.500,170.500Z" fill="url(#orc-h1)" stroke="none"/>`, { dy: B });
  const prop = (on, ra, inner, o = {}) => A(o.cls || '', ARMBOX, `<g transform="rotate(${-ra} ${F})">${inner}</g>`, { dy: B, on, ...o });
  const pDagger = prop('calibrating', -64, `<path d="M50,160.300L28,164L50,167.800Z" fill="#cfd6da" stroke-width="1"/><path d="M48,164H32" fill="none" stroke-width=".4" opacity=".6"/><path d="M49,157.500h2.600v12.500h-2.600Z" fill="url(#orc-ir)" stroke-width=".8"/><circle cx="62.500" cy="164.300" r="2.300" fill="url(#orc-ir)" stroke-width=".8"/>`);
  const pBone = prop('meh', -64, `<path d="M36,160.500c-3.500,-4.500 -10,0 -6.500,3.800c-3.500,3.800 3,8.300 6.500,3.800L70,168.800c3.500,4.500 10,0 6.500,-3.800c3.500,-3.800 -3,-8.300 -6.500,-3.800Z" fill="url(#orc-bn)" stroke-width="1"/><path d="M39,162.500l2,3.500M43,162l1.500,3.500M66,164.500h-9" fill="none" stroke-width=".5" opacity=".7"/>`);
  const pRat = prop('poor', 56, `<path d="M54,167C57,172 51,176 54,182" fill="none" stroke-width="2"/><path d="M54,167C57,172 51,176 54,182" fill="none" stroke="#c49a8a" stroke-width="1"/><path d="M49.500,188C49.500,181 58.500,181 58.500,188C59,194 57,199.500 54,200.500C51,199.500 49,194 49.500,188Z" fill="#8d7c68" stroke-width=".9"/><circle cx="50.800" cy="197" r="2" fill="#b9988c" stroke-width=".6"/><circle cx="57.200" cy="197" r="2" fill="#b9988c" stroke-width=".6"/><path d="M54,200.500l0,2M52.300,195.300l1.200,1.200m0,-1.200l-1.200,1.200M54.800,195.300l1.200,1.200m0,-1.200l-1.200,1.200M49.500,186l-3,2M58.500,186l3,2M50.500,183l-2.500,-1.500M57.500,183l2.500,-1.500" fill="none" stroke-width=".6"/>`, { cls: 'orc-dangle', o: [54, 164] });
  const pMeat = prop('good', 38, `<path d="M54,182V118" fill="none" stroke-width="2.400"/><path d="M54,182V118" fill="none" stroke="#8d9195" stroke-width="1.100"/><path d="M42,141C40,128 47,120 56,121C65,122 69,131 67,141C66,150 59,155 52.500,154C47,153 43,148 42,141Z" fill="#a73c2b" stroke-width="1.100"/><path d="M56,121C65,122 69,131 67,141C66,150 59,155 52.500,154C60,150 63,142 62,134C61.500,128 59.500,124 56,121Z" fill="#e3c29a" stroke-width=".7"/><path d="M42,141C40,128 47,120 52,121C47,126 46,136 48,146C46,146 43,145 42,141Z" fill="url(#orc-h1)" stroke="none"/><path d="M48,130q4,3 9,1M47,138q5,3 11,1M49,146q4,2 8,1" fill="none" stroke="#6e1f16" stroke-width=".7"/><ellipse cx="53" cy="128" rx="3" ry="1.600" fill="#f2b7a0" opacity=".6" stroke="none"/><path d="M50,153.500q-.8,4 0,6.500M57,153q.5,3 0,4.500" fill="none" stroke="#a73c2b" stroke-width="1.300"/>`);
  const pScim = prop('pvp', 18, `<path d="M51,157C46,138 48,118 61,100C68,117 67,140 58.500,158Z" fill="url(#orc-ir)" stroke-width="1.100"/><path d="M52.500,154C48.500,138 50,120 60,105" fill="none" stroke="#dfe5e8" stroke-width=".9" opacity=".8"/><path d="M61,100C64,108 65.500,116 65.300,124L57,116Z" fill="#8e1e16" opacity=".8" stroke="none"/><path d="M64.500,132l-3.500,1.500l3,2.500M49.200,140l3,1l-2.600,2.200" fill="#0d0907" stroke-width=".6"/><path d="M44.500,156.500H64.500V160.500H44.500Z" fill="#191614" stroke-width=".9"/><circle cx="54.500" cy="174" r="2.600" fill="url(#orc-ir)" stroke-width=".8"/>`);
  const pHorn = prop('superb', -62, `<path d="M32,162L37,161C52,160 67,154 80,134L92,145C78,168 56,173 37,166.500L32,165.500Z" fill="url(#orc-hn)" stroke-width="1.100"/><path d="M40,165C56,170 74,164 88,144" fill="none" stroke-width=".5" opacity=".6"/><path d="M77,131L95,148" fill="none" stroke-width="5.400"/><path d="M77,131L95,148" fill="none" stroke="#e0b440" stroke-width="3.600"/><path d="M68,150l7,9M44,160.500l-1,6.500" fill="none" stroke-width="3"/><path d="M68,150l7,9M44,160.500l-1,6.500" fill="none" stroke="#d6a936" stroke-width="1.600"/><path d="M31,161.500v4.500" fill="none" stroke-width="2"/>`);
  const sound = A('orc-L', ARMBOX, `<g transform="rotate(62 ${F})"><g transform="translate(90,136) rotate(-42) scale(1.5)" fill="none" stroke="#f3ead0" stroke-linecap="round" stroke-linejoin="round"><path class="orc-snd" d="M7,-8Q11.500,0 7,8" stroke-width="1.500"/><path class="orc-snd" d="M14,-13Q21,0 14,13M19,-3l4,-3l-1,5l5,-2" stroke-width="1.500"/><path class="orc-snd" d="M22,-18Q31,0 22,18M28,7l5,3l-4,2l5,3" stroke-width="1.500"/></g></g>`, { dy: B, on: 'superb', raw: 1 });

  // ---- the head (art around 0,0 = the middle of the face) ----
  const H = (cls, box, inner, o = {}) => A(cls, box, inner, { dy: HY, ...o });
  const HBOX = [-50, -48, 100, 90];
  const ear = (s) => H('orc-ef', s > 0 ? [34, -36, 38, 44] : [-72, -36, 38, 44], `<g transform="scale(${s},1)"><path d="M35,-14C44,-22 55,-28 67,-31C63,-25 63,-21 60,-18L64,-17L57,-11L59,-8C53,-1 45,3 37,3Z" fill="${s > 0 ? '#a8a183' : '#827c62'}" stroke-width="1.100"/><path d="M40,-8C46,-15 54,-21 61,-25C57,-18 52,-9 44,-3Z" fill="#5b4a40" stroke-width=".6"/><path d="M38,-2C44,-2 50,-5 55,-10" fill="none" stroke-width=".5" opacity=".7"/>${s < 0 ? `<path d="M35,-14C44,-22 55,-28 67,-31C56,-24 46,-16 40,-6Z" fill="url(#orc-h1)" stroke="none"/>` : ''}</g>${s < 0 ? `<circle cx="-51" cy="2.500" r="4.300" fill="none" stroke-width="2.600"/><circle cx="-51" cy="2.500" r="4.300" fill="none" stroke="#8d9296" stroke-width="1.300"/>` : ''}`, { o: [s * 38, -6] });
  const hair = H('', [-48, -26, 96, 50], `<path d="M-35,-22C-45,-10 -46,6 -41,20L-33,14C-38,4 -36,-8 -31,-18Z" fill="#15110e" stroke-width=".9"/><path d="M35,-22C45,-10 46,6 41,20L33,14C38,4 36,-8 31,-18Z" fill="#1d1814" stroke-width=".9"/><path d="M-40,-10C-43,0 -42,8 -40,15M40,-10C43,0 42,8 40,15" fill="none" stroke="#5e554a" stroke-width=".6"/>`);
  const skull = H('', HBOX, `<path d="M-37,-6C-41,-22 -30,-35 -8,-37C0,-38.500 9,-38.500 14,-36.500C32,-33 41,-20 38,-6C43,-4 44,4 41,10L30,26L-30,26L-41,10C-44,4 -43,-4 -37,-6Z" fill="url(#orc-sk)" stroke-width="1.200"/>
<path d="M-37,-6C-41,-22 -30,-35 -8,-37C-21,-28 -27,-15 -26,-4C-29,4 -29,13 -27,24L-30,26L-41,10C-44,4 -43,-4 -37,-6Z" fill="#221710" opacity=".22" stroke="none"/>
<path d="M-37,-6C-41,-22 -30,-35 -8,-37C-21,-28 -27,-15 -26,-4C-29,4 -29,13 -27,24L-30,26L-41,10C-44,4 -43,-4 -37,-6Z" fill="url(#orc-h1)" stroke="none"/>
<path d="M-37,-6C-41,-22 -30,-35 -20,-36C-30,-27 -34,-15 -33,-4C-36,4 -36,10 -35,16L-41,10C-44,4 -43,-4 -37,-6Z" fill="url(#orc-h2)" stroke="none"/>
<path d="M-36,-18Q0,-10 37,-18L37,-5Q0,1 -36,-5Z" fill="#20140c" opacity=".42" stroke="none"/><path d="M-36,-17Q0,-10 37,-17L36,-8Q0,-3 -36,-8Z" fill="url(#orc-h2)" stroke="none"/>
<path d="M-25,12Q-12,7.500 0,10Q12,7.500 25,12L23,26L-23,26Z" fill="#250d0b" stroke="none"/><ellipse cx="1" cy="23.500" rx="10" ry="5" fill="#8a3830" stroke-width=".7"/><path d="M1,19.500v6" fill="none" stroke-width=".5" opacity=".6"/>
<path d="M-19,10.200l2.300,4.300l2.200,-4.800l2.300,4l2.200,-4.300l2.300,3.800l2,-4l2.500,4.300l2.300,-4.300l2.200,4l2.300,-4.300l2.200,4.500l2.300,-4.500l2.300,4.800l2,-3.700Z" fill="url(#orc-bn)" stroke-width=".6"/>
<path d="M-27,13.500Q-12,7.500 0,10Q12,7.500 27,13.500" fill="none" stroke-width="1.200"/>
<path d="M-12,-1C-20,3 -25,7 -27,12M12,-1C20,3 25,7 27,12M-33,-2C-36,4 -36,9 -34,13M34,-2C37,4 37,9 35,13" fill="none" stroke-width=".7" opacity=".8"/>
<path d="M-24,-29C-10,-33.500 10,-33.500 27,-29M-30,-23.500C-10,-28 12,-28 33,-23.500" fill="none" stroke-width=".5" opacity=".5"/>
<ellipse cx="29" cy="1" rx="8" ry="5" fill="#ece3bb" opacity=".3" stroke="none"/><ellipse cx="18" cy="-29" rx="11" ry="4" fill="#ece3bb" opacity=".25" stroke="none"/><ellipse cx="-30" cy="3" rx="6" ry="4" fill="#7a3a2c" opacity=".18" stroke="none"/>
<path d="M-27,-30L-19,-3" fill="none" stroke="#7a3e33" stroke-width="1.700"/><path d="M-29,-23l5.500,-1.800M-27,-16l5.500,-1.800M-25,-9l5.500,-1.800" fill="none" stroke-width=".7"/>
<path d="M24,3l8,5" fill="none" stroke="#7a3e33" stroke-width="1.300"/><circle cx="-31" cy="8" r="1.300" fill="#7d775c" stroke-width=".5"/><circle cx="22" cy="-31" r="1.100" fill="#7d775c" stroke-width=".5"/>
<path d="M-7,-37l-2,-5.500M1,-38l1,-6.500M8,-37.500l3,-5" fill="none" stroke-width=".8"/>`);
  const eyeG = (s) => `<g transform="translate(${16 * s},-11) rotate(${-12 * s})"><ellipse rx="12" ry="7.800" fill="#1c110a" opacity=".62"/><g clip-path="url(#orc-ec)"><path d="${ALM}" fill="#dccb8c"/><path d="M-10,-9H10V-1.200H-10Z" fill="#3a2414" opacity=".4"/>
<g class="orc-pm"><g class="orc-gz"><circle r="3.500" fill="#ee6c18"/><circle r="3.500" fill="none" stroke="#6a1c06" stroke-width=".9"/><circle r="1.500" fill="#100604"/><circle cx="-1.200" cy="-1.300" r=".85" fill="#fff5d8"/></g></g>
<g class="orc-lid"><g class="orc-bk"><path d="M-11,-20H11V-4.600Q0,-2.800 -11,-4.600Z" fill="#7a7359" stroke="${INK}" stroke-width=".8"/></g></g><path class="orc-low" d="M-11,16H11V3.800Q0,5 -11,3.800Z" fill="#8a8366" stroke="${INK}" stroke-width=".6"/></g>
<path d="${ALM}" fill="none" stroke="${INK}" stroke-width=".9"/><path d="M-8.800,.4Q0,-8.300 8.800,.4" fill="none" stroke="${INK}" stroke-width="1.600" stroke-linecap="round"/><path d="M${-7 * s},6q${7 * s},3.500 ${14 * s},-.5M${-4 * s},9q${5 * s},2 ${9 * s},0" fill="none" stroke="${INK}" stroke-width=".55" stroke-linecap="round" opacity=".8"/></g>`;
  const eyes = H('orc-L', [-32, -24, 64, 28], eyeG(-1) + eyeG(1), { raw: 1 });
  const nose = H('orc-ns', [-14, -16, 28, 28], `<path d="M-3,-12C-5,-6 -9.500,-3 -10.500,2C-11.500,7 -6,9.300 -3,7.500C-1,9 1,9 3,7.500C6,9.300 11.500,7 10.500,2C9.500,-3 5,-6 3,-12Z" fill="#a49d7e" stroke-width="1"/><path d="M-3,-12C-5,-6 -9.500,-3 -10.500,2C-11.500,7 -6,9.300 -3,7.500C-6,4 -5,-3 -1,-9Z" fill="url(#orc-h1)" stroke="none"/><path d="M-8,5q2.500,-3.800 5,-.3Z" fill="#170d0b" stroke-width=".5"/><path d="M3,4.700q2.500,-3.800 5,.3Z" fill="#170d0b" stroke-width=".5"/><path d="M-3,-8.500h6M-3.500,-5.500h7" fill="none" stroke-width=".5" opacity=".7"/><ellipse cx="4" cy="-1" rx="2.500" ry="3.500" fill="#ece3bb" opacity=".35" stroke="none"/>`, { o: [0, 2] });
  const sneer = H('orc-snr', [-30, 0, 24, 18], `<path d="M-26,13Q-21,4.500 -9,6.500Q-12,10 -11,12.500Q-19,10 -26,13Z" fill="#6b2a25" stroke-width=".9"/><path d="M-21,8.500l1.800,5.500l2.400,-5.800Z" fill="url(#orc-bn)" stroke-width=".6"/><path d="M-27,5Q-20,1 -10,3.500M-28,1.500Q-21,-2 -13,0" fill="none" stroke-width=".7"/>`);
  const jaw = H('orc-jx', [-46, -8, 92, 48], `<path d="M-41,3C-42.500,12 -39,21 -31,27.500C-24,33.500 -12,35.500 0,35.500C12,35.500 24,33.500 31,27.500C39,21 42.500,12 41,3L33,8L26,13.500Q12,10.500 0,12.500Q-12,10.500 -26,13.500L-33,8Z" fill="url(#orc-sk)" stroke-width="1.200"/>
<path d="M-41,3C-42.500,12 -39,21 -31,27.500C-24,33.500 -12,35.500 -6,35.500C-18,30 -26,22 -27,13.500L-33,8Z" fill="#221710" opacity=".25" stroke="none"/><path d="M-41,3C-42.500,12 -39,21 -31,27.500C-24,33.500 -12,35.500 -6,35.500C-18,30 -26,22 -27,13.500L-33,8Z" fill="url(#orc-h1)" stroke="none"/>
<path d="M-30,24C-18,31 18,31 30,24L31,27.500C24,33.500 12,35.500 0,35.500C-12,35.500 -24,33.500 -31,27.500Z" fill="url(#orc-h2)" stroke="none"/>
<path d="M-26,13.500Q-12,10.500 0,12.500Q12,10.500 26,13.500Q12,17.500 0,18Q-12,17.500 -26,13.500Z" fill="#6f5a4b" stroke-width=".8"/>
<path d="M-11,12.300l1.600,-3.400l1.900,3.500ZM-4.500,12.600l1.500,-2.800l1.800,2.900ZM3,12.600l1.700,-3.300l1.800,3.100ZM9.500,12l1.400,-2.600l1.800,3Z" fill="url(#orc-bn)" stroke-width=".6"/>
<path d="M-23.500,13.500C-26,6 -26,-.5 -23.500,-6C-19,-1 -16,6 -15.500,12.800Z" fill="url(#orc-bn)" stroke-width="1"/><path d="M-22,10C-23,5 -23,1 -22.300,-2" fill="none" stroke-width=".5" opacity=".6"/>
<path d="M15.500,12.800C16,8 17.500,4.500 19.500,2.500L22,4.800L21,7L24,7.500C24,10 23.500,12 23,13.500Z" fill="url(#orc-bn)" stroke-width="1"/>
<path d="M-5,29.500q5,-3 10,0M-33,17q4,5 8,6M33,17q-4,5 -8,6" fill="none" stroke-width=".7" opacity=".8"/><ellipse cx="14" cy="26" rx="9" ry="4" fill="#ece3bb" opacity=".22" stroke="none"/>
<g fill="${INK}" stroke="none" opacity=".5"><circle cx="-12" cy="24" r=".5"/><circle cx="-6" cy="26.500" r=".5"/><circle cx="6" cy="27" r=".5"/><circle cx="12" cy="24.500" r=".5"/><circle cx="0" cy="23" r=".5"/><circle cx="18" cy="21" r=".5"/><circle cx="-18" cy="21" r=".5"/></g>`);
  const grin = H('orc-grin', [-40, 0, 80, 24], `<path d="M-27,13.500C-31,10 -33,6 -33,1M27,13.500C31,10 33,6 33,1M-30,16C-34,13 -37,9 -37.500,5M30,16C34,13 37,9 37.500,5" fill="none" stroke-width="1"/>`);
  const BROW = `<path d="M-17,2C-15,-6 -1,-8.500 13,-5.500C18,-4.500 19,0 15,1C7,0 -3,2 -9,6.500C-13,8.500 -18,6 -17,2Z" fill="#8e886b" stroke-width="1.100"/><path d="M-17,2C-15,-6 -6,-8 -3,-7.500C-9,-5 -11,0 -9,6.500C-13,8.500 -18,6 -17,2Z" fill="url(#orc-h1)" stroke="none"/><path d="M-12,-3q8,-3.500 22,-1" fill="none" stroke="#d8d0aa" stroke-width=".9" opacity=".7"/><path d="M-6,3l1.500,-4M0,1.300l1.500,-4M6,.5l1.500,-3.500" fill="none" stroke-width=".5" opacity=".7"/>`;
  const brow = (s) => G(s < 0 ? 'orc-bL' : 'orc-bR', [s * 12, HY - 18], H('', s < 0 ? [-40, -30, 40, 22] : [0, -30, 40, 22], `<g transform="translate(${s * 19},-18.500) scale(${s},1)">${BROW}</g>`));
  const cap = (extra) => `<path d="M-36,-19C-38,-35 -22,-44 0,-44C22,-44 38,-35 36,-19Q0,-31 -36,-19Z" fill="url(#orc-lt)" stroke-width="1.200"/><path d="M-36,-19C-38,-35 -22,-44 -6,-44C-20,-38 -26,-30 -25,-22Z" fill="url(#orc-h1)" stroke="none"/><path d="M-12,-43C-10,-36 -10,-30 -11,-26M12,-43C10,-36 10,-30 11,-26" fill="none" stroke-width=".7"/><path d="M-12,-43C-10,-36 -10,-30 -11,-26M12,-43C10,-36 10,-30 11,-26" fill="none" stroke="#0e0906" stroke-width="3.600" stroke-dasharray=".8 3" stroke-linecap="butt"/>
<path d="M-37.500,-22Q0,-34 37.500,-22L37,-16Q0,-28 -37,-16Z" fill="url(#orc-ir)" stroke-width="1.100"/><path d="M-36,-20.500Q0,-32.500 36,-20.500" fill="none" stroke="#c8ced2" stroke-width=".6" opacity=".6"/><g fill="#9aa0a4" stroke-width=".4"><circle cx="-28" cy="-22.500" r="1.200"/><circle cx="-14" cy="-26" r="1.200"/><circle cx="0" cy="-27.300" r="1.200"/><circle cx="14" cy="-26" r="1.200"/><circle cx="28" cy="-22.500" r="1.200"/></g><path d="M20,-39l5,4l-1,4" fill="none" stroke-width=".7"/>${extra || ''}`;
  const capOn = H('', [-42, -64, 84, 52], cap(), { on: 'calibrating poor meh good superb achievement' });
  const crest = H('', [-42, -66, 84, 54], `<path d="M-31,-35C-38,-51 -19,-62 0,-62C19,-62 38,-51 31,-35Q0,-47 -31,-35Z" fill="#aa2a1d" stroke-width="1.200"/><path d="M-31,-35C-38,-51 -19,-62 -4,-62C-18,-55 -24,-46 -22,-39Z" fill="url(#orc-h1)" stroke="none"/><path d="M-22,-41l-6,-12M-12,-44l-5,-15M-3,-46l-1,-16M7,-46l3,-15M16,-43.500l7,-13M24,-40l7,-9" fill="none" stroke-width=".6" opacity=".8"/><path d="M-27,-52l-3,-4M-14,-59.500l-1,-4M0,-62v-4M14,-59.500l2,-4M27,-52l3,-4" fill="none" stroke-width="1.600"/>${cap(`<path d="M-7,-33L7,-33L6,-22.500L0,-19L-6,-22.500Z" fill="url(#orc-gd)" stroke-width=".9"/><path d="M-3.500,-29.500L0,-27L3.500,-29.500M-3.500,-26L0,-23.500L3.500,-26" fill="none" stroke-width="1"/><circle cx="-5" cy="-31.300" r=".7" fill="${INK}" stroke="none"/><circle cx="5" cy="-31.300" r=".7" fill="${INK}" stroke="none"/>`)}`, { on: 'levelup' });
  const stripesHat = [[-4, -12], [-19, -27], [-33, -39]].map(([a, b], i) => { const w = (y) => f1(15 * (y + 43) / 45); return `<path d="M-${w(a)},${a}L${w(a - 3)},${a - 3}L${w(b - 3)},${b - 3}L-${w(b)},${b}Z" fill="${i % 2 ? '#e2b53a' : '#c63a28'}" stroke-width=".6"/>`; }).join('');
  const hat = H('orc-hat', [0, -84, 60, 64], `<g transform="translate(23,-29) rotate(26)"><path d="M-15,2L0,-43L15,2Q0,7 -15,2Z" fill="#ece1c4" stroke-width="1.100"/>${stripesHat}<path d="M-15,2L0,-43L-4,3.500Z" fill="url(#orc-h1)" stroke="none"/><path d="M-15,2L0,-43L15,2Q0,7 -15,2Z" fill="none" stroke-width="1.100"/><path d="M-15.500,1.500Q0,7 15.500,1.500" fill="none" stroke="#c63a28" stroke-width="2.200"/><path d="M0,-49.500l1.800,3.200l3.500,-1.400l-.9,3.600l3.200,1.900l-3.500,1.200l.3,3.700l-3.100,-2l-2.800,2.400l-.3,-3.700l-3.600,-.9l2.800,-2.400l-1.500,-3.400l3.600,.9Z" fill="#d8402c" stroke-width=".8"/><path d="M12,3C16,14 14,24 6,32" fill="none" stroke-width=".6" stroke-dasharray="1.500 1.500"/></g>`, { on: 'superb', o: [23, -29] });
  const helm = H('orc-hat', [-56, -72, 112, 70], `<g transform="translate(3,3.500) rotate(11)"><path d="M-37,-33C-50,-39 -60,-48 -65,-63C-54,-58 -44,-52 -36,-42Z" fill="#f1f5f3" stroke-width="1"/><path d="M37,-33C50,-39 60,-48 65,-63C54,-58 44,-52 36,-42Z" fill="#f1f5f3" stroke-width="1"/><path d="M-42,-37q-8,-5 -14,-13M-40,-42q-8,-5 -13,-11M42,-37q8,-5 14,-13M40,-42q8,-5 13,-11" fill="none" stroke-width=".5" opacity=".7"/>
<path d="M-45,-13C-47,-38 -30,-56 0,-59C30,-56 47,-38 45,-13Q0,-26 -45,-13Z" fill="url(#orc-st)" stroke-width="1.300"/><path d="M-45,-13C-47,-38 -30,-56 -8,-58.500C-24,-50 -32,-36 -30,-18Z" fill="url(#orc-h1)" stroke="none" opacity=".8"/><path d="M-3,-58.500C-1,-46 -1,-34 -2,-23.500L2,-23.500C1,-34 1,-46 3,-58.500Z" fill="#dfeaf0" stroke-width=".8"/>
<path d="M14,-55C28,-51 40,-40 42,-24C36,-36 26,-48 14,-55Z" fill="#fff" opacity=".7" stroke="none"/><path d="M-20,-48C-22,-40 -22,-32 -20,-24M22,-42C24,-36 24,-30 23,-24" fill="none" stroke-width=".5" opacity=".5"/>
<path d="M-46.500,-17Q0,-31 46.500,-17L46,-9.500Q0,-23 -46,-9.500Z" fill="url(#orc-gd)" stroke-width="1.100"/><path d="M-44,-14.500Q0,-28 44,-14.500" fill="none" stroke-width=".45" opacity=".7"/><path d="M0,-26.500L4,-21.500L0,-16.500L-4,-21.500Z" fill="#7fd6e6" stroke-width=".8"/><path d="M-1.500,-23.500l1.500,-1.500" fill="none" stroke="#fff" stroke-width=".7"/></g>`, { on: 'great', o: [0, -20] });
  const warhelm = H('', [-52, -70, 104, 90], `<path d="M-4.500,-49L0,-66L4.500,-49Z" fill="url(#orc-ir)" stroke-width="1"/><path d="M-43,11L-45,-16C-47,-41 -27,-51 0,-51C27,-51 47,-41 45,-16L43,11L34,6L33,-13Q17,-23 4.500,-11L4,7L-4,7L-4.500,-11Q-17,-23 -33,-13L-34,6Z" fill="url(#orc-ir)" stroke-width="1.300"/>
<path d="M-43,11L-45,-16C-47,-41 -27,-51 -8,-51C-24,-44 -32,-32 -32,-14L-34,6Z" fill="url(#orc-h1)" stroke="none"/><path d="M-45,-16C-47,-41 -27,-51 -16,-50.500C-32,-43 -39,-31 -39,-15Z" fill="url(#orc-h2)" stroke="none"/>
<path d="M-33,-13Q-17,-23 -4.500,-11M33,-13Q17,-23 4.500,-11" fill="none" stroke="#000" stroke-width="2.200" opacity=".6"/><path d="M12,-50C30,-47 43,-37 43.500,-20" fill="none" stroke="#d3d9dc" stroke-width=".9" opacity=".7"/>
<path d="M-3,-49C-4,-36 -4,-22 -4.500,-11L4.500,-11C4,-22 4,-36 3,-49Z" fill="#b3261a" stroke-width=".7"/><g fill="#9aa0a4" stroke-width=".4"><circle cx="-38" cy="-12" r="1.300"/><circle cx="-39" cy="2" r="1.300"/><circle cx="38" cy="-12" r="1.300"/><circle cx="39" cy="2" r="1.300"/><circle cx="-24" cy="-22" r="1.300"/><circle cx="24" cy="-22" r="1.300"/></g><path d="M20,-40l6,3l-2,5M-20,-36l-4,5" fill="none" stroke-width=".6" opacity=".8"/>`, { on: 'pvp' });
  const paint = H('', [-44, -8, 88, 22], `<path d="M-37,-2L-15,5M-36,4L-18,10M37,-2L15,5M36,4L18,10" fill="none" stroke="#b3261a" stroke-width="3" opacity=".9"/>`, { on: 'pvp' });

  // ---- things on the rim, in front ----
  const keg = A('', [-64, 150, 40, 50], `<path d="M-57,173C-59.500,180 -59.500,189 -57,196.500L-35,196.500C-32.500,189 -32.500,180 -35,173Z" fill="url(#orc-wd)" stroke-width="1.100"/><path d="M-51,173.500C-52,181 -52,189 -51,196M-45,173.500V196M-40,173.500C-39,181 -39,189 -40,196" fill="none" stroke-width=".5" opacity=".7"/><path d="M-58,177.500H-34V180.500H-58ZM-58.500,189.500H-33.500V192.500H-58.500Z" fill="url(#orc-ir)" stroke-width=".7"/><ellipse cx="-46" cy="173" rx="11" ry="2.800" fill="#6e553a" stroke-width="1"/><path d="M-50,183l8,5M-42,183l-8,5" fill="none" stroke="#d8ceae" stroke-width="1.300" opacity=".85"/><path d="M-35,186h5v2.500h-2" fill="none" stroke-width="1.600"/><path d="M-30.500,190v4" fill="none" stroke="#c9a24a" stroke-width="1.200"/>
<path d="M-53,159.500L-39,159.500C-39,166 -42.500,168.500 -46,168.500C-49.500,168.500 -53,166 -53,159.500Z" fill="url(#orc-gd)" stroke-width="1"/><path d="M-46,168.500V171M-50,171.500H-42" fill="none" stroke-width="2.600"/><path d="M-46,168.500V171M-50,171.500H-42" fill="none" stroke="#d6a936" stroke-width="1.300"/><ellipse cx="-46" cy="159.500" rx="7" ry="1.600" fill="#5a2018" stroke-width=".8"/><circle cx="-46" cy="164" r="1.300" fill="#c63a28" stroke-width=".4"/><path d="M-41.500,161.500q.5,3 -1.500,5" fill="none" stroke="#fff6d8" stroke-width=".8"/>`, { dy: B, on: 'superb' });
  const sack = A('', [-66, 160, 44, 40], `<path d="M-59,196.500C-66,186 -62,174 -52,172L-50,167.500L-40,167.500L-38,172C-29,176 -27,188 -32,196.500Z" fill="#a08c64" stroke-width="1.100"/><path d="M-59,196.500C-66,186 -62,174 -52,172L-47,172C-55,178 -56,188 -52,196.500Z" fill="url(#orc-h1)" stroke="none"/><path d="M-52.500,172L-37.500,172" fill="none" stroke-width="2.200"/><path d="M-52.500,172L-37.500,172" fill="none" stroke="#5a4433" stroke-width="1"/><path d="M-50,180q6,4 14,1M-52,188q8,4 18,1" fill="none" stroke-width=".5" opacity=".6"/>
<g fill="url(#orc-gd)" stroke-width=".7"><circle cx="-48" cy="166" r="2.600"/><circle cx="-42.500" cy="165" r="2.600"/><circle cx="-45.500" cy="162.500" r="2.600"/><circle cx="-30" cy="194" r="2.400"/></g><path d="M-39,166l7,-7l2,2l-6,7" fill="#cfd8de" stroke-width=".8"/><path d="M-44,182l4,3l5,-4" fill="none" stroke="#f3ead0" stroke-width="1"/>`, { dy: B, on: 'great' });
  const bones = A('', [-64, 172, 40, 28], `<g fill="url(#orc-bn)" stroke-width=".9"><path d="M-58,193c-3,-3 -7,1 -4,3.500c-2,3 3,5 5,2l20,-3c3,3 7,-1 4,-3.500c2,-3 -3,-5 -5,-2Z"/><path d="M-54,186c-3.500,-2 -6,2.500 -2.500,4c-1,3.500 4,4 5,1l16,2c2.500,3.500 7,0 4,-3c2.500,-3 -2,-5.500 -4.500,-2.500Z"/><path d="M-50,180C-51,176 -46,173.500 -42,175.500C-38,177.500 -38,183 -41,185L-48,185Z"/></g><path d="M-47,179.500a1.200,1.200 0 1 0 .1,0M-42.500,180a1.200,1.200 0 1 0 .1,0M-46,184v-2M-44,184v-2" fill="#17110d" stroke-width=".5"/>`, { dy: B, on: 'meh' });
  const capOff = A('', [-24, 194, 54, 34], `<path d="M-17,204.500Q3,200 23,204.500C24,218 15,225.500 3,225.500C-9,225.500 -18,218 -17,204.500Z" fill="#6a5443" stroke-width="1.200"/><path d="M-17,204.500Q-6,202 -3,202C-7,213 -5,221 0,225.300C-10,225 -18,218 -17,204.500Z" fill="url(#orc-h1)" stroke="none"/><path d="M-19,203Q3,196 25,203Q3,210 -19,203Z" fill="#17110d" stroke-width="1"/><path d="M-19,203Q3,196 25,203" fill="none" stroke="#a9afb3" stroke-width="2"/><path d="M-4,210C-3,216 -3,221 -4,224.500M10,209.500C9,216 9,220 10,223.500" fill="none" stroke-width=".7" opacity=".8"/><g fill="#b4babd" stroke-width=".4"><circle cx="-11" cy="208.500" r="1.200"/><circle cx="3" cy="210" r="1.200"/><circle cx="17" cy="208.500" r="1.200"/></g>`, { dy: B, on: 'death' });
  const CF = ['#b3261a', '#17110d', '#d8ceae', '#d6a936', '#7a1a12', '#ece1c4'];
  let confetti = '';
  for (let i = 0; i < 14; i++) confetti += `<i style="left:${-86 + (i * 53) % 172}px;top:${30 + (i * 37) % 60}px;background:${CF[i % 6]};width:${4 + i % 4}px;height:${3 + (i * 3) % 4}px;--x:${(i % 5 - 2) * 9}px;--r:${(i % 2 ? 1 : -1) * (300 + i * 40)}deg;animation-delay:-${f1(i * .23)}s;animation-duration:${f1(2.6 + (i % 5) * .3)}s;clip-path:polygon(0 12%,100% 0,86% 100%,10% 84%)"></i>`;

  const rigMarkup = () => `<div class="orc-o"><div class="orc-halo"></div>
${G('orc-env orc-rim orc-L', [0, PY], G('orc-envb orc-L', [0, 106], envelope + device + drips + stripe + folds + underglow + crow + pennant + rag + smoke + brazier + G('orc-fl orc-L', [0, 119], A('', [-14, 96, 28, 26], flame(0, 119.5, 1.25), { raw: 1 }))))}
<svg class="orc-a orc-ropes orc-L" xmlns="${NS}" width="200" height="260" viewBox="-100 0 200 260" style="left:-100px;top:0"><g stroke="${INK}" stroke-width="2.300"><line/><line/></g><g stroke="#9a855a" stroke-width="1.200" stroke-dasharray="3 1"><line/><line/></g><g stroke="#14100d" stroke-width="1.500" stroke-dasharray="2.400 1.300"><line/><line/></g></svg>
${G('orc-bask orc-rim orc-L', [0, PY], banner + G('orc-shb orc-L', [0, PY], shoulders) + basket + trophyB + trophyA + tallyStick + G('orc-bag orc-L', [-56, 199 + B], sackBag) + G('orc-clv orc-L', [56, 199 + B], cleaver) + torch(-1) + torch(1) + armL + fingers
    + G('orc-hd orc-L', [0, PY], G('orc-nod orc-L', [0, PY - 4], G('orc-hb orc-L', [0, PY], hair + G('orc-eL', [-38, HY - 6], ear(-1)) + G('orc-eR', [38, HY - 6], ear(1)) + skull + eyes + paint + nose + sneer + G('orc-jw orc-L', [0, HY], G('orc-jb orc-L', [0, HY], jaw)) + grin + capOn + brow(-1) + brow(1) + crest + hat + helm + warhelm)))
    + G('orc-arm orc-L', [54, 198 + B], G('orc-arm2 orc-L', [54, 198 + B], pDagger + pBone + pRat + pMeat + pScim + pHorn + armR + sound))
    + medals + keg + sack + bones + capOff + '<div class="orc-spit"></div>')}
<svg class="orc-a orc-chains orc-L" xmlns="${NS}" width="200" height="60" viewBox="-100 220 200 60" style="left:-100px;top:220px"><g stroke="#0f0c0a" stroke-width="3.400" stroke-linecap="round" stroke-dasharray="3.600 1.400"><line/><line/></g><g stroke="#8b9094" stroke-width="1" stroke-linecap="round" stroke-dasharray="2.200 2.800" stroke-dashoffset="-.7"><line/><line/></g></svg>
<div class="orc-cf orc-x" data-on="superb">${confetti}</div></div>`;

  const marks = (n, pvp, fresh) => {
    let s = '';
    if (pvp) s = '<path class="orc-ck" d="M4,2.500L17,14M16.500,2L4.500,14.500"/>';
    else for (let i = 0; i < 5; i++) s += `<path class="${i < n ? 'orc-ck' : 'orc-gh'}${fresh && i === n - 1 ? ' orc-new' : ''}" d="M${7 + i * 6.6},2q-.6,6.500 -3.600,12.500"/>`;
    return `<svg class="orc-marks" xmlns="${NS}" width="${pvp ? 21 : 38}" height="16" viewBox="0 0 ${pvp ? 21 : 38} 16">${s}</svg>`;
  };
  const STICK = `<svg class="orc-stick" xmlns="${NS}" width="46" height="12" viewBox="0 0 46 12"><path d="M2,3.500H40L44.500,6L40,8.500H2Z" fill="#cdbd92" stroke="${INK}" stroke-width="1"/><path d="M5,6H38" stroke="${INK}" stroke-width=".4" opacity=".5"/></svg>`;
  const CHEV = `<svg class="orc-chev" xmlns="${NS}" width="60" height="15" viewBox="0 0 60 15"><path d="M8,2.500L30,8L52,2.500M8,8L30,13.500L52,8" fill="none" stroke="#dba832" stroke-width="2.600" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  Harness.register({
    id: 'orc',
    name: 'The Orc',
    blurb: 'A snaga posted to the Air Corps, with opinions about it. Stitched hides, a spiked iron band, a brazier that smokes too much. He reports the day as an orc would: by loot, rations and how badly it went.',
    create(ctx) {
      defs();
      const E = ctx.el, flights = new Set();
      let seed = 7;

      function fill(sign, n, fresh) {
        const mood = M[n.mood] ? n.mood : 'calibrating', box = sign.querySelector('.orc-in');
        sign.dataset.mood = mood; sign.dataset.kind = n.kind; sign.style.setProperty('--c', COL[mood]);
        box.textContent = '';
        const ach = n.kind === 'achievement';
        if (ach) box.append(E('div', 'orc-tag', n.label));
        if (n.kind === 'levelup') box.append(ctx.svg(CHEV));
        box.append(E('div', 'orc-title', n.title));
        const fig = E('div', 'orc-fig', n.big);
        if (n.unit) fig.append(E('span', 'orc-unit', n.unit));
        box.append(fig);
        if (n.kind === 'kill') {
          const r = E('div', 'orc-rate');
          if (n.label) { r.append(ctx.svg(marks(RANK[mood] || 0, mood === 'pvp', fresh)), E('span', 'orc-word', n.label)); } else r.append(ctx.svg(STICK));
          box.append(r);
        } else if (!ach && n.label) box.append(E('div', 'orc-tag', n.label));
        box.append(E('div', 'orc-more', n.more));
      }

      function build(n) {
        const mood = M[n.mood] ? n.mood : 'calibrating';
        const root = E('div', 'orc-v');
        root.dataset.mood = mood; root.dataset.sky = ctx.skyMode();
        root.style.setProperty('--k', 1 / ctx.pace());
        if (ctx.reduced) root.classList.add('orc-rm');
        root.innerHTML = rigMarkup();   // our own markup only; game text goes in through fill()
        const sign = E('div', 'orc-sign'), bd = E('div', 'orc-bd');
        for (const s of [-1, 1]) { const r = E('div', 'orc-ring'); r.style.left = (SIGN_W / 2 + s * AX) + 'px'; sign.append(r); }
        bd.append(E('div', 'orc-in')); sign.prepend(bd); root.append(sign);
        fill(sign, n);
        const q = (s) => root.querySelector(s), qa = (s) => [...root.querySelectorAll(s)];
        const env = q('.orc-env'), bask = q('.orc-bask'), fl = q('.orc-fl'), ug = q('.orc-ug').ownerSVGElement, bag = q('.orc-bag'), clv = q('.orc-clv');
        const ropes = qa('.orc-ropes line'), chains = qa('.orc-chains line');
        const R = ctx.rng(seed += 101), ph = R() * 6.28;
        let th = 0, thv = 0, last = 0, did = false, dead = false, left = false, cur = mood, seen = false;
        const rot = (x, y, a) => { const c = Math.cos(a), s = Math.sin(a), dx = x, dy = y - PY; return [dx * c - dy * s, PY + dx * s + dy * c]; };
        const RP = [[-62, 76, -53, 195 + B], [62, 76, 53, 195 + B]];
        const k = () => 1 / ctx.pace();
        const an = (el, kf, ms, o) => (el && !ctx.reduced ? el.animate(kf, { duration: ms * k(), easing: 'ease-in-out', ...o }) : null);
        const T = (...a) => a.map((t) => (typeof t === 'string' ? { transform: t } : { transform: t[0], offset: t[1] }));

        function frame(s) {
          const now = performance.now(), dt = last ? Math.min(.05, (now - last) / 1000) * ctx.pace() : 0; last = now;
          const tt = now * .001;
          const aE = s.lean * .9 + Math.sin(tt * 1.1 + ph) * .8;
          const aB = s.swing * .5 + Math.sin(tt * 1.1 + ph - 1.1) * .9;
          // the sign: a two-chain pendulum on its own spring, driven by the basket and the air
          const target = Math.max(-34, Math.min(34, s.swing * 4 + Math.sin(tt * 1.9 + ph) * 5 + (s.phase === 'arrive' ? Math.sin(tt * 2.7) * 7 : 0)));
          thv += ((target - th) * 26 - thv * 2.4) * dt; th += thv * dt;
          const ra = aB * Math.PI / 180, rt = (th + aB) * Math.PI / 180;
          env.style.transform = `rotate(${aE.toFixed(2)}deg)`;
          bask.style.transform = `rotate(${aB.toFixed(2)}deg)`;
          const re = aE * Math.PI / 180;
          for (let i = 0; i < 2; i++) {
            const [x1, y1] = rot(RP[i][0], RP[i][1], re), [x2, y2] = rot(RP[i][2], RP[i][3], ra);
            for (const l of [ropes[i], ropes[i + 2]]) { l.setAttribute('x1', x1.toFixed(1)); l.setAttribute('y1', y1.toFixed(1)); l.setAttribute('x2', x2.toFixed(1)); l.setAttribute('y2', y2.toFixed(1)); }
          }
          // inner chains: mouth ring to the rim, behind his ears
          for (let i = 0; i < 2; i++) {
            const sg = i ? 1 : -1, [x1, y1] = rot(sg * 15, 105, re), [x2, y2] = rot(sg * 44, 195 + B, ra), l = ropes[4 + i];
            l.setAttribute('x1', x1.toFixed(1)); l.setAttribute('y1', y1.toFixed(1)); l.setAttribute('x2', x2.toFixed(1)); l.setAttribute('y2', y2.toFixed(1));
          }
          const sx = Math.sin(rt) * CL, sy = Math.cos(rt) * CL;
          let mx = 0, my = 0;
          for (let i = 0; i < 2; i++) {
            const [ax, ay] = rot(i ? AX : -AX, AY, ra), hx = ax + sx, hy = ay + sy; mx += hx / 2; my += hy / 2;
            for (const l of [chains[i], chains[i + 2]]) { l.setAttribute('x1', ax.toFixed(1)); l.setAttribute('y1', (ay - 1).toFixed(1)); l.setAttribute('x2', hx.toFixed(1)); l.setAttribute('y2', hy.toFixed(1)); }
          }
          sign.style.transform = `translate(${mx.toFixed(1)}px,${(my - AY - CL).toFixed(1)}px) rotate(${aB.toFixed(2)}deg)`;
          const trail = (th * .7).toFixed(1);
          bag.style.transform = `rotate(${trail}deg)`; clv.style.transform = `rotate(${(th * .9).toFixed(1)}deg)`;
          const b = cur === 'death' ? .1 : s.burn;
          fl.style.transform = `scale(${(.7 + b * .55).toFixed(2)},${(.5 + b * 1.7).toFixed(2)})`;
          ug.style.opacity = (.2 + b * .8).toFixed(2);
          if (!did && (s.phase === 'read' || s.phase === 'leave')) { did = true; business(); }
          if (!left && s.phase === 'leave') { left = true; puff(); }
        }

        function puff() {
          for (const c of qa('.orc-sm circle')) an(c, [{ transform: 'translate(0,0) scale(1)', opacity: .8 }, { transform: `translate(${30 + R() * 50}px,${-30 - R() * 40}px) scale(4.5)`, opacity: 0 }], 900 + R() * 500, { easing: 'ease-out' });
        }
        function business() {
          const nod = q('.orc-nod'), arm2 = q('.orc-arm2'), jx = q('.orc-jx'), shb = q('.orc-shb');
          const m = cur;
          if (m === 'calibrating') { an(nod, T('none', ['translateY(-3px) rotate(5deg)', .4], ['translateY(-3px) rotate(5deg)', .6], 'none'), 1000); an(shb, T('none', ['translateY(-5px)', .4], ['translateY(-5px)', .6], 'none'), 1000); glance(0, 0, 900); }
          else if (m === 'poor') { an(arm2, T('none', ['rotate(-10deg)', .2], ['rotate(7deg)', .45], ['rotate(-5deg)', .7], 'none'), 1000); an(nod, T('none', ['translate(-4px,-1px) rotate(-5deg)', .35], ['translate(-4px,-1px) rotate(-5deg)', .7], 'none'), 1300); an(q('.orc-ns'), T('none', ['scale(1.18,1.08)', .4], 'none'), 500, { delay: 200 * k() }); glance(3, .5, 1100); }
          else if (m === 'meh') {
            an(nod, T('none', ['translate(-6px,1px) rotate(-10deg)', .3], ['translate(-7px,2px) rotate(-12deg)', .45], ['translate(-5px,1px) rotate(-8deg)', .6], 'none'), 1100);
            an(q('.orc-spit'), [{ transform: 'translate(-8px,0)', opacity: 1 }, { transform: 'translate(-34px,-6px)', opacity: 1, offset: .3 }, { transform: 'translate(-58px,22px)', opacity: 1, offset: .65 }, { transform: 'translate(-74px,80px) scaleY(1.8)', opacity: 0 }], 620, { delay: 440 * k(), easing: 'linear' });
            glance(-3, 1.5, 900);
          } else if (m === 'good') { an(nod, T('none', ['translateY(5px) rotate(3deg)', .3], ['translateY(-1px)', .65], 'none'), 560); an(arm2, T('none', ['rotate(-9deg)', .4], 'none'), 600); an(jx, T('none', ['translateY(2.500px)', .3], 'none'), 400); }
          else if (m === 'great') { an(nod, T('none', ['rotate(-5deg) translateY(-3px)', .3], ['rotate(3deg)', .62], 'none'), 900); an(q('.orc-hat[data-on=great]'), [{ rotate: '0deg' }, { rotate: '9deg', offset: .3 }, { rotate: '-6deg', offset: .6 }, { rotate: '3deg', offset: .82 }, { rotate: '0deg' }], 1100); glance(0, 0, 1200); }
          else if (m === 'superb') {
            an(arm2, T('none', ['rotate(-20deg)', .14], ['rotate(-20deg)', .82], 'none'), 1700); an(nod, T('none', ['rotate(-8deg) translateY(-3px)', .14], ['rotate(-9deg) translateY(-4px)', .5], ['rotate(-8deg) translateY(-3px)', .82], 'none'), 1700);
            an(jx, T('none', ['translateY(-2px)', .14], ['translateY(-2px)', .82], 'none'), 1700); an(q('.orc-hat[data-on=superb]'), [{ rotate: '0deg' }, { rotate: '-8deg', offset: .2 }, { rotate: '5deg', offset: .5 }, { rotate: '-3deg', offset: .8 }, { rotate: '0deg' }], 1700);
            qa('.orc-snd').forEach((e, i) => an(e, [{ opacity: 0, transform: 'translateX(-4px) scale(.7)' }, { opacity: 1, offset: .35 }, { opacity: 0, transform: 'translateX(9px) scale(1.25)' }], 400, { delay: (260 + i * 110) * k(), iterations: 3, easing: 'ease-out' }));
            glance(1, -2.4, 1500);
          } else if (m === 'pvp') { an(jx, T('none', ['translateY(4px)', .25], ['translateY(4.500px)', .7], 'none'), 1200); an(nod, T('none', ['scale(1.08) translateY(-4px) rotate(-4deg)', .25], ['scale(1.07) translateY(-3px) rotate(3deg)', .5], ['scale(1.08) translateY(-4px) rotate(-3deg)', .72], 'none'), 1200); an(arm2, T('none', ['rotate(-16deg)', .18], ['rotate(12deg)', .4], ['rotate(-6deg)', .65], 'none'), 1200); glance(0, 0, 1400); }
          else if (m === 'levelup') { root.style.removeProperty('--ra'); an(nod, T('none', ['translateY(-3px) rotate(-3deg)', .5], 'none'), 700, { delay: 250 * k() }); an(q('.orc-eR'), T('none', ['rotate(-14deg)', .5], 'none'), 300, { delay: 500 * k() }); glance(0, -1.5, 1400); }
          else if (m === 'death') { root.style.removeProperty('--hy'); root.style.removeProperty('--lid'); glance(0, 2, 4000); }
          else if (m === 'achievement') { an(nod, T('none', ['translateY(-4px) rotate(-5deg)', .4], ['translateY(1px) rotate(1deg)', .75], 'none'), 900); glance(0, 0, 1500); }
        }

        // ---- life: blinks, glances, an ear, a nostril, a lip ----
        const gz = qa('.orc-gz'), bk = qa('.orc-bk');
        let hold = 0;
        function glance(x, y, ms) { for (const g of gz) g.style.transform = `translate(${x}px,${y}px)`; hold = performance.now() + (ms || 0) * k(); }
        function blink(twice) { for (const b of bk) an(b, T('none', ['translateY(10px)', twice ? .2 : .4], ...(twice ? [['translateY(1px)', .5], ['translateY(10px)', .7]] : []), 'none'), twice ? 330 : 170, { easing: 'ease-in' }); }
        const next = { blink: 900 + R() * 1800, gaze: 500 + R() * 1200, ear: 1500 + R() * 3000, nose: 2400 + R() * 3000, lip: 3200 + R() * 4000 };
        const LOOK = [[0, 0], [0, 0], [.6, 2.6], [-.4, 2.6], [.8, -2.4], [3, .2], [-3, .2], [1.6, 1.2]];
        function life() {
          if (dead) return;
          if (root.isConnected) seen = true; else if (seen) { dead = true; return; }
          const t = performance.now();
          if (t > next.blink) { blink(R() < .2); next.blink = t + 1700 + R() * 3600; }
          if (t > next.gaze && t > hold) { const l = cur === 'death' ? [R() - .5, 2] : LOOK[(R() * LOOK.length) | 0]; glance(l[0], l[1]); next.gaze = t + (R() < .3 ? 260 : 900 + R() * 2200); }
          if (t > next.ear) { const e = q(R() < .5 ? '.orc-eL .orc-ef' : '.orc-eR .orc-ef'), d = e.parentNode.classList.contains('orc-eL') ? 1 : -1; an(e, T('none', [`rotate(${14 * d}deg)`, .25], [`rotate(${-5 * d}deg)`, .55], [`rotate(${8 * d}deg)`, .75], 'none'), 420); next.ear = t + 2600 + R() * 5200; }
          if (t > next.nose) { an(q('.orc-ns'), T('none', ['scale(1.16,1.07)', .4], 'none'), 420); next.nose = t + 3200 + R() * 5000; }
          if (t > next.lip) { if (!M[cur].snr && cur !== 'death' && cur !== 'pvp') an(q('.orc-snr'), [{ opacity: 0 }, { opacity: 1, offset: .25 }, { opacity: 1, offset: .7 }, { opacity: 0 }], 1100); next.lip = t + 4500 + R() * 6000; }
          setTimeout(life, 140);
        }
        if (!ctx.reduced) setTimeout(life, 300);

        function update(nn) {
          const m2 = M[nn.mood] ? nn.mood : 'calibrating';
          if (ctx.reduced) { fill(sign, nn); cur = root.dataset.mood = m2; return; }
          thv += (R() < .5 ? -1 : 1) * 70;      // the board is yanked: a jolt in the chains
          an(bd, T('none', ['translateY(8px) rotate(-2.500deg)', .22], ['translateY(-3px) rotate(1.500deg)', .55], ['translateY(1px) rotate(-.6deg)', .8], 'none'), 460);
          setTimeout(() => { if (!dead) fill(sign, nn, true); }, 100 * k());
          if (m2 !== cur) { cur = root.dataset.mood = m2; setTimeout(() => { if (!dead) business(); }, 380 * k()); }
          glance(.4, 2.8, 800); blink(false);
        }
        return { root, sign, frame, update, stop() { dead = true; }, pre() { if (mood === 'levelup') root.style.setProperty('--ra', -96); if (mood === 'death') { root.style.setProperty('--hy', 0); root.style.setProperty('--lid', 1.6); } } };
      }

      const height = (r) => TOP + AY + CL - 6 + r.sign.offsetHeight + 2;
      return {
        show(n) {
          const r = build(n);
          ctx.front.append(r.root);
          const h = height(r) + (n.kind === 'kill' && !n.more ? 26 : 0);
          r.root.style.height = h + 'px';
          if (!ctx.reduced) r.pre();
          const f = ctx.fly(r.root, { w: 200, h, frame: r.frame });
          const rec = { r, f }; flights.add(rec);
          f.gone.then(() => { r.stop(); flights.delete(rec); });
          return { update(nn) { r.update(nn); f.extend(700); } };
        },
        still(n) {
          const r = build(n), wrap = E('div', 'orc-still');
          wrap.style.width = '200px';
          r.root.style.height = (TOP + AY + CL + (n.kind === 'achievement' ? 98 : n.more ? 100 : n.kind === 'kill' ? 74 : 62)) + 'px';
          wrap.append(r.root);
          const ph = Math.random() * 6;
          r.frame({ lean: 0, swing: 0, phase: 'arrive', t: 0, vy: 0, burn: .15 });
          if (!ctx.reduced) {
            let seen = false;
            const tick = (now) => {
              if (wrap.isConnected) seen = true; else if (seen) { r.stop(); return; }
              const t = now * .001;
              if (seen) r.frame({ lean: Math.sin(t * .8 + ph) * 1.6, swing: Math.sin(t * .8 + ph - .9) * 2.4, phase: 'arrive', t: 0, vy: 0, burn: .16 + Math.max(0, Math.sin(t * .5 + ph)) ** 8 * .7 });
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }
          return wrap;
        },
        clear() { for (const rec of [...flights]) { rec.r.stop(); rec.f.end(); } flights.clear(); },
      };
    },
  });
})();
