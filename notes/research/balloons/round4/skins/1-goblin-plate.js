// Round 4, skin 1: "Goblin, the plate". The original gloomy goblin in his
// patched balloon, redrawn as a tinted engraving. The plank hangs for real:
// a spreader bar is lashed under the basket and two ropes run from its rings
// to eye-bolts on the plank (a two-rope pendulum, redrawn every frame).
//
// Layers: the envelope, the car (basket, goblin, props) and the plank are
// separate composited elements moved with transforms; the filtered drawings
// inside them change only on events (a blink, a glance, an ear twitch).
(() => {
  const NS = 'http://www.w3.org/2000/svg', INK = '#221a10', PX = 100, PY = 113, DY = -8, L0 = 20, H = 350;
  const uri = (s) => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
  const n1 = (n) => +n.toFixed(1);

  // ---- moods: the pose (CSS vars), the head's place (JS), the props ----
  const DEF = { el: 8, er: 8, lid: 1, low: 0, px: 0, py: 0, sl: 0, byl: 0, byr: 0, br: 0, to: 0, fs: 1 };
  const M = {
    calibrating: { el: 14, er: 0, lid: 1.2, byl: -3.2, byr: .8, br: 3, hy: 0, ht: -5, by: 0, mouth: 'flat', arms: 'rim', acc: '#8d8468' },
    poor: { el: 80, er: 76, lid: 2.5, low: .5, py: 1.2, sl: 11, br: 15, byl: -1.5, byr: -1.5, hy: 11, ht: 0, by: 5, mouth: 'frown', arms: 'hang', acc: '#5d7286', tint: '#33465c', to: .34, fs: .8 },
    meh: { el: 42, er: 34, lid: 3.3, br: 5, hy: 3, ht: 5, by: 2, mouth: 'flat', arms: 'rim', acc: '#7a6680', tint: '#4a4050', to: .16, fs: .9 },
    good: { el: -6, er: -12, lid: .7, br: -3, hy: -3, ht: 0, by: -2, mouth: 'smirk', arms: 'thumb', acc: '#587a3e' },
    great: { el: -36, er: -40, lid: 0, byl: -2.2, byr: -2.2, hy: -6, ht: 0, by: -4, mouth: 'grin', arms: 'fists', acc: '#2f6f7c' },
    superb: { el: -26, er: -34, lid: 0, byl: -3, byr: -3, br: -6, hy: -5, ht: 6, by: -4, mouth: 'blow', arms: 'fists', acc: '#d0a233', tint: '#e8b840', to: .14, fs: 1.25 },
    pvp: { el: -56, er: -56, lid: 1.8, low: 1.3, sl: -11, br: -17, byl: 1.6, byr: 1.6, hy: -2, ht: -5, by: -2, mouth: 'dag', arms: 'fists', acc: '#7d1f1a', tint: '#1a0d0a', to: .36 },
    levelup: { el: -44, er: -48, lid: 0, byl: -3, byr: -3, hy: -12, ht: -3, by: -10, mouth: 'grin', arms: 'star', acc: '#7a4c8e', tint: '#e0b040', to: .08, fs: 1.1 },
    death: { el: 66, er: 70, lid: 4.3, py: 1.3, sl: 8, br: 12, hy: 4, ht: 7, by: 2, mouth: 'frown', arms: 'hat', acc: '#26262a', tint: '#6c7074', to: .55, fs: .45 },
    achievement: { el: -14, er: -18, lid: 2.3, byl: -2.4, byr: -2.4, br: -3, py: -.3, hy: -9, ht: 0, by: -8, mouth: 'smirk', arms: 'fists', acc: '#9c7c36', tint: '#c9a050', to: .1 },
  };
  const RANK = { poor: 1, meh: 2, good: 3, great: 4, superb: 5 };
  const vars = (o) => Object.keys(o).filter((k) => k in DEF).map((k) => `--${k}:${o[k]}`).join(';') + (o.acc ? `;--acc:${o.acc}` : '') + (o.tint ? `;--tint:${o.tint}` : '');
  const on = (key, val) => `data-m="${Object.keys(M).filter((m) => M[m][key] === val).join(' ')}"`;

  // the plank: a 9-slice board with iron corner straps
  const plank = (wood, light, iron, riv) => uri(`<svg xmlns='${NS}' width='60' height='60'><rect x='.8' y='.8' width='58.400' height='58.400' rx='2' fill='${wood}' stroke='${INK}' stroke-width='1.300'/><path d='M3,2.400H57' stroke='${light}' stroke-width='1' opacity='.6'/><path d='M3,57.400H57' stroke='#000' stroke-width='1' opacity='.45'/><path d='M.8,.8H16V6.500H6.500V16H.8ZM59.200,.8H44V6.500H53.500V16H59.200ZM.8,59.200H16V53.500H6.500V44H.8ZM59.200,59.200H44V53.500H53.500V44H59.200Z' fill='${iron}' stroke='${INK}' stroke-width='.9' stroke-linejoin='round'/><g fill='${riv}'><circle cx='3.600' cy='3.600' r='1.100'/><circle cx='12' cy='3.600' r='1.100'/><circle cx='3.600' cy='12' r='1.100'/><circle cx='56.400' cy='3.600' r='1.100'/><circle cx='48' cy='3.600' r='1.100'/><circle cx='56.400' cy='12' r='1.100'/><circle cx='3.600' cy='56.400' r='1.100'/><circle cx='12' cy='56.400' r='1.100'/><circle cx='3.600' cy='48' r='1.100'/><circle cx='56.400' cy='56.400' r='1.100'/><circle cx='48' cy='56.400' r='1.100'/><circle cx='56.400' cy='48' r='1.100'/></g></svg>`);
  const WOOD = plank('#3d2b1d', '#8a6a48', '#4b5056', '#a9afb3');
  const BLACKWOOD = plank('#1d1b1a', '#5d5850', '#2c2e31', '#7d8286');
  const PALE = plank('#c5ad82', '#efe0bc', '#565a5e', '#b9bec1');
  const grain = (c, o) => uri(`<svg xmlns='${NS}' width='190' height='30'><g fill='none' stroke='${c}' stroke-width='.7' opacity='${o}'><path d='M0,4C40,2 70,7 110,4S170,3 190,4M0,11C30,13 60,9 95,11S160,13 190,11M0,18C50,16 80,21 120,18S170,17 190,18M0,25C35,27 75,23 105,25S165,27 190,25M40,7.500c8,-2 16,2 22,0M130,14.500c8,2 14,-2 24,0M70,21.500c10,-2 18,2 26,0'/><ellipse cx='150' cy='7.500' rx='5' ry='1.800'/><ellipse cx='28' cy='21.500' rx='4' ry='1.500'/></g></svg>`);

  Harness.css('goblin-plate', `
.gplate{position:relative;width:200px;height:${H}px;${vars(DEF)};--acc:#8d8468;--tint:#000;--gx:0;--gy:0;--go:1;pointer-events:none}
${Object.keys(M).map((m) => `.gplate[data-mood=${m}]{${vars(M[m])}}`).join('\n')}
.gplate[data-sky=dusk]{--go:.75}.gplate[data-sky=day]{--go:.3}.gplate[data-sky=overcast]{--go:.45}
.gplate-l{position:absolute;left:0;top:0;width:200px;height:256px}
.gplate svg{position:absolute;left:0;top:0;overflow:visible}
.gplate svg *{transform-box:view-box}
.gplate-env,.gplate-car{transform-origin:${PX}px ${PY}px;will-change:transform}
.gplate-hd,.gplate-bd,.gplate-sw,.gplate-fsv{will-change:transform}
.gplate-hd{transform-origin:100px 186px}
.gplate[data-sky=night] .gplate-rim{filter:drop-shadow(0 0 .6px rgba(255,232,190,.5))}
.gplate[data-sky=dusk] .gplate-rim{filter:drop-shadow(0 0 .6px rgba(255,226,190,.3))}
.gplate[data-mood=death] .gplate-gob{filter:grayscale(.9) brightness(1.18) contrast(.86);opacity:.9}
.gplate [data-m]{opacity:0;visibility:hidden;transition:opacity .25s,visibility 0s .25s,transform .42s cubic-bezier(.3,1.5,.5,1)}
${Object.keys(M).map((m) => `.gplate[data-mood=${m}] [data-m~=${m}]`).join(',')}{opacity:1;visibility:visible;transform:none;transition:opacity .25s,transform .42s cubic-bezier(.3,1.5,.5,1)}
.gplate-pop{transform:translateY(-16px)}
.gplate-acc{fill:var(--acc);transition:fill .4s}
.gplate-tint{fill:var(--tint);opacity:var(--to);transition:fill .4s,opacity .4s}
.gplate-ear{transform:rotate(calc(var(--e)*1deg));transition:transform .5s cubic-bezier(.3,1.6,.5,1)}
.gplate-sl{transform:rotate(calc(var(--sl)*1deg));transition:transform .4s}
.gplate-pm{transform:translate(calc((var(--px) + var(--gx))*var(--s)*1px),calc((var(--py) + var(--gy))*1px));transition:transform .15s ease-out}
.gplate-lid{transform:translateY(calc(var(--lid)*1px));transition:transform .4s}
.gplate-bk{transition:transform .06s}
.gplate-shut .gplate-bk{transform:translateY(6.800px)}
.gplate-low{transform:translateY(calc(var(--low)*-1px));transition:transform .4s}
.gplate-bw{transform:translateY(calc(var(--b)*1px)) rotate(calc(var(--br)*1deg));transition:transform .4s cubic-bezier(.3,1.4,.5,1)}
.gplate-yawn{opacity:0}
.gplate-roll{transform:scaleX(.12)}
.gplate-toot{opacity:0}
.gplate-fsv{transform-origin:100px 112px;transform:scale(calc(var(--fs)))}
.gplate-fk{animation:gplate-fk .5s ease-in-out infinite alternate}
.gplate-f1{fill:#e8862c;stroke:#9c4a16;stroke-width:.7}.gplate-f2{fill:#ffe9a0}
.gplate[data-mood=superb] .gplate-f1{fill:#f4c93c;stroke:#b98414}.gplate[data-mood=superb] .gplate-f2{fill:#fffce6}
.gplate[data-mood=death] .gplate-f1{fill:#5f8fb8;stroke:#2f5676}.gplate[data-mood=death] .gplate-f2{fill:#dcefff}
.gplate-glow{position:absolute;left:55px;top:66px;width:90px;height:90px;border-radius:50%;background:radial-gradient(closest-side,rgba(255,200,120,.5),rgba(255,170,80,.16) 45%,rgba(255,160,60,0));opacity:.2;will-change:opacity,transform}
.gplate[data-mood=superb] .gplate-glow{background:radial-gradient(closest-side,rgba(255,226,130,.62),rgba(255,200,80,.2) 45%,rgba(255,190,60,0))}
.gplate[data-mood=death] .gplate-glow{background:radial-gradient(closest-side,rgba(150,200,255,.4),rgba(120,170,255,.12) 45%,rgba(120,170,255,0))}
.gplate-rope{fill:none;stroke:#1c140b;stroke-width:2.600;stroke-linecap:round}
.gplate-rope2{fill:none;stroke:#c9b07c;stroke-width:1.300;stroke-linecap:round;stroke-dasharray:3 1}
.gplate[data-mood=pvp] .gplate-tie{stroke:#4a0d0a}.gplate[data-mood=pvp] .gplate-tie2{stroke:#d8523e}
.gplate-flut{animation:gplate-fl 1.3s ease-in-out infinite alternate}
.gplate-drip{position:absolute;width:1.600px;height:6px;border-radius:1px;background:#a9c6dc;opacity:0;animation:gplate-dr 1s linear infinite}
.gplate-conf{position:absolute;top:0;width:4.500px;height:2.600px;opacity:0;animation:gplate-cf 3s linear infinite}
@keyframes gplate-fk{0%{transform:scale(1,1)}45%{transform:scale(.86,1.14)}100%{transform:scale(1.08,.9)}}
@keyframes gplate-fl{0%{transform:skewY(-5deg) scaleX(1)}100%{transform:skewY(5deg) scaleX(.9)}}
@keyframes gplate-dr{0%{transform:translateY(0);opacity:0}15%{opacity:.9}80%{opacity:.9}100%{transform:translateY(24px);opacity:0}}
@keyframes gplate-cf{0%{transform:translate(0,-6px) rotate(0);opacity:0}8%{opacity:1}80%{opacity:1}100%{transform:translate(var(--dx),262px) rotate(var(--rt));opacity:0}}
.gplate-sign{position:absolute;left:6px;top:0;width:188px;transform-origin:94px -4px;will-change:transform;font-family:"Cormorant Garamond",Georgia,serif;text-align:center;color:#f0e7cf;--dim:#cdbf9f;filter:drop-shadow(0 2px 2.500px rgba(0,0,0,.45))}
.gplate[data-sky=night] .gplate-sign{filter:drop-shadow(0 0 .7px rgba(255,232,190,.55))}
.gplate-board{position:relative;box-sizing:border-box;width:188px;padding:0 1px 1px;border:solid transparent;border-width:9px 12px;border-image:${WOOD} 16 fill/13px stretch}
.gplate-board::before{content:"";position:absolute;inset:-7px -10px;pointer-events:none;background:${grain('#120a05', '.55')},radial-gradient(60% 15px at 50% 0,rgba(0,0,0,.5),transparent)}
.gplate-board>div{position:relative}
.gplate-board>div:empty{display:none}
.gplate-eye{position:absolute;top:-8px;width:12px;height:12px}
.gplate-title{font:italic 600 15.500px/1.05 "Cormorant Garamond",Georgia,serif;text-wrap:balance;overflow-wrap:anywhere}
.gplate-fig{font:600 25px/1 "Cormorant Garamond",Georgia,serif;font-variant-numeric:lining-nums;white-space:nowrap;margin-top:1px}
.gplate-unit{font:italic 500 14px/1 "Cormorant Garamond",Georgia,serif;margin-left:4px;color:var(--dim)}
.gplate-rate{display:flex;justify-content:center;align-items:center;gap:7px;height:15px;margin-top:1px}
.gplate-rate svg{position:static;display:block}
.gplate-word{font:400 13px/1 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.16em;margin-right:-.16em}
.gplate-more{font:italic 500 13px/1.04 "Cormorant Garamond",Georgia,serif;color:var(--dim);margin-top:2px;text-wrap:balance}
.gplate-tag{font:400 11.500px/1.2 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.24em;margin-right:-.24em;text-transform:uppercase}
.gplate[data-mood=superb] .gplate-fig{color:#f4d77c}
.gplate[data-mood=pvp] .gplate-word{color:#f08a72}
.gplate[data-mood=levelup] .gplate-board{padding:8px 1px 9px}
.gplate[data-mood=levelup] .gplate-fig{font:700 22px/1.1 "Cinzel",Georgia,serif;letter-spacing:.04em;color:#f0cf6c}
.gplate[data-mood=death] .gplate-board{border-image-source:${BLACKWOOD};padding:8px 1px 9px}
.gplate[data-mood=death] .gplate-sign{color:#cfd0cc}
.gplate[data-mood=death] .gplate-fig{font:400 23px/1.1 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.16em;margin-right:-.16em;text-transform:lowercase;font-variant:small-caps}
.gplate[data-mood=achievement] .gplate-sign{color:#2b1a0c;--dim:#4f3618}
.gplate[data-mood=achievement] .gplate-board{border-image-source:${PALE};padding:0 0 2px}
.gplate[data-mood=achievement] .gplate-board::before{background:${grain('#5c4120', '.5')},radial-gradient(60% 15px at 50% 0,rgba(60,35,10,.4),transparent)}
.gplate[data-mood=achievement] .gplate-title{font:italic 600 13.500px/1.08 "Cormorant Garamond",Georgia,serif}
.gplate-rm *,.gplate-rm *::before{transition:none!important;animation:none!important}
.gplate-rm .gplate-drip,.gplate-rm .gplate-conf{opacity:.9}
`);

  // ---- the drawing ----
  const FILT = (id) => `<filter id="${id}" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.700" xChannelSelector="R" yChannelSelector="G" result="d"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .14 0 0 0 0 .09 0 0 0 0 .04 1.500 0 0 0 -.7" result="b"/><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="11"/><feColorMatrix type="matrix" values="0 0 0 0 .13 0 0 0 0 .08 0 0 0 0 .04 0 1.200 0 0 -.56" result="g"/><feMerge result="m"><feMergeNode in="b"/><feMergeNode in="g"/></feMerge><feComposite in="m" in2="d" operator="in" result="mc"/><feMerge><feMergeNode in="d"/><feMergeNode in="mc"/></feMerge></filter>`;
  const HATCH = (id, rot, gap, op) => `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${gap}" height="${gap}" patternTransform="rotate(${rot})"><path d="M0,.5H${gap}" stroke="${INK}" stroke-width=".55" opacity="${op}"/></pattern>`;
  const G = (u, body, extra = '') => `<g filter="url(#gf${u})" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round"${extra}>${body}</g>`;
  const SVG = (cls, body) => `<svg class="${cls}" xmlns="${NS}" width="200" height="256" viewBox="0 0 200 256">${body}</svg>`;

  // the envelope: five gores, drawn 2..120 and squashed a little
  const EX = [14, 44, 80, 120, 156, 186], MX = [78, 87, 96, 104, 113, 122];
  const half = (ex, mx, rev) => (rev
    ? `C${n1(mx + (ex - mx) * .3)},103 ${ex},80 ${ex},52C${ex},24 ${n1(100 + (ex - 100) * .6)},2 100,2`
    : `C${n1(100 + (ex - 100) * .6)},2 ${ex},24 ${ex},52C${ex},80 ${n1(mx + (ex - mx) * .3)},103 ${mx},120`);
  const gore = (i) => `M100,2${half(EX[i], MX[i])}L${MX[i + 1]},120M${MX[i + 1]},120${half(EX[i + 1], MX[i + 1], 1)}`;
  const goreFill = (i) => `M100,2${half(EX[i], MX[i])}L${MX[i + 1]},120${half(EX[i + 1], MX[i + 1], 1)}Z`;
  const OUT = `M100,2${half(186, 122)}L78,120${half(14, 78, 1)}Z`;
  const GORE = ['#b29455', '#93503a', '#bfa161', '#9c5740', '#c6aa6c'];
  const patch = (x, y, r, w, h, c) => `<g transform="translate(${x},${y}) rotate(${r})"><rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="${c}" stroke-width=".8"/><rect x="${-w / 2 + 2}" y="${-h / 2 + 2}" width="${w - 4}" height="${h - 4}" fill="none" stroke="#efe3bd" stroke-width=".7" stroke-dasharray="2 1.800"/></g>`;
  const bunting = () => { let s = ''; for (let i = 0; i < 9; i++) { const t = (i + .5) / 9, x = 20 + 160 * t, y = 66 + 4 * 24 * t * (1 - t); s += `<path d="M${n1(x - 6)},${n1(y - 1)}L${n1(x + 6)},${n1(y - 1)}L${n1(x)},${n1(y + 12)}Z" fill="${i % 2 ? '#7a4c8e' : '#e2bb48'}" stroke-width=".7"/>`; } return `<g data-m="levelup"><path d="M18,65Q100,114 182,65" fill="none" stroke-width=".9"/>${s}</g>`; };
  const envArt = (u) => SVG('gplate-rim', `<defs>${FILT('gf' + u)}${HATCH('gp' + u, 38, 3, .55)}${HATCH('gq' + u, -52, 3.4, .45)}
<clipPath id="gc${u}"><path d="${OUT}"/></clipPath><clipPath id="ge${u}"><path d="M-7.500,0Q0,-6.600 7.500,0Q0,4.800 -7.500,0Z"/></clipPath>
<linearGradient id="gs${u}" x1="0" x2="1"><stop offset="0" stop-color="#170d06" stop-opacity=".5"/><stop offset=".5" stop-color="#170d06" stop-opacity="0"/><stop offset=".78" stop-color="#fff2d0" stop-opacity="0"/><stop offset="1" stop-color="#fff2d0" stop-opacity=".3"/></linearGradient>
<linearGradient id="gk${u}" x1="0" x2="1"><stop offset="0" stop-color="#55603f"/><stop offset=".5" stop-color="#818b63"/><stop offset="1" stop-color="#aab087"/></linearGradient>
<linearGradient id="gi${u}" x1="0" x2="1" y1="0" y2=".25"><stop offset="0" stop-color="#2c3035"/><stop offset=".5" stop-color="#555c63"/><stop offset="1" stop-color="#8e969c"/></linearGradient>
<linearGradient id="gw${u}" x1="0" x2="1"><stop offset="0" stop-color="#553c26"/><stop offset=".5" stop-color="#8a6940"/><stop offset="1" stop-color="#b8965f"/></linearGradient>
<linearGradient id="gb${u}" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#f0d890"/><stop offset=".55" stop-color="#c39a3e"/><stop offset="1" stop-color="#7c5a1c"/></linearGradient></defs>
<g transform="translate(0,.2) scale(1,.92)">${G(u, `
${GORE.map((c, i) => `<path d="${goreFill(i)}" fill="${c}" stroke="none"/>`).join('')}
<g clip-path="url(#gc${u})" stroke="none"><path class="gplate-tint" d="${OUT}"/><rect class="gplate-acc" x="0" y="108" width="200" height="14"/><rect x="0" y="108" width="200" height="14" fill="#000" opacity=".12"/>
<rect width="200" height="122" fill="url(#gs${u})"/><path d="${goreFill(0)}" fill="url(#gp${u})"/><path d="${goreFill(0)}" fill="url(#gq${u})"/><path d="${goreFill(1)}" fill="url(#gp${u})"/>
<path d="M8,30Q100,44 192,30M8,76Q100,92 192,76M60,108Q100,113 140,108" fill="none" stroke="${INK}" stroke-width=".6" opacity=".7"/>
<path d="M8,32Q100,46 192,32M8,78Q100,94 192,78" fill="none" stroke="#f3e6c0" stroke-width=".6" opacity=".35"/></g>
<path d="${[0, 1, 2, 3, 4].map(gore).join('')}" fill="none" stroke-width=".8"/>
${patch(48, 54, -8, 18, 16, '#8a7850')}${patch(146, 70, 12, 15, 13, '#a9654c')}${patch(96, 24, 4, 12, 11, '#7d6a48')}
<g data-m="poor"><path d="M123,36l19,2l-2,18l-18,-2Z" fill="#241710" stroke-width=".9"/><path d="M122,54l18,2l5,15l-17,4Z" fill="#a39062" stroke-width=".9"/><path d="M124,57l14,1.500l3.500,11l-12,3Z" fill="none" stroke="#efe3bd" stroke-width=".6" stroke-dasharray="2 1.800"/><path d="M128,75l-1,6M134,73l2,7M142,40l5,-2" fill="none" stroke-width=".6"/></g>
<path d="M152,11C174,22 183,36 182.500,52" fill="none" stroke="#fff2d0" stroke-width="1" opacity=".5"/>
<path d="M78,120${[0, 1, 2, 3].map(() => 'a5.5,5 0 0 0 11,0').join('')}Z" class="gplate-acc" stroke-width=".9"/>
<g data-m="death"><g clip-path="url(#gc${u})"><path d="M8,49Q100,65 192,49L192,62Q100,78 8,62Z" fill="#17161a" stroke-width=".9"/><path d="M10,52Q100,68 190,52" fill="none" stroke="#7b7e86" stroke-width=".6"/></g><g transform="translate(0,-8)"><path d="M146,70C136,62 132,74 146,74C134,78 138,88 148,76L143,104L150,100L154,106L152,77C162,86 166,76 154,73C166,70 160,60 150,69Z" fill="#17161a" stroke-width=".9"/><path d="M148,80l-2,17M139,68q3,-2 6,2M157,68q-3,-1 -5,2" fill="none" stroke="#7b7e86" stroke-width=".6"/></g></g>
${bunting()}
<circle cx="100" cy="2" r="3" fill="#4a3a2a" stroke-width=".9"/>
<g data-m="levelup" class="gplate-pop"><path d="M86,3L83,-14L92,-6L100,-17L108,-6L117,-14L114,3Z" fill="url(#gb${u})" stroke-width="1"/><path d="M86.500,-1H113.500" fill="none" stroke-width=".6"/><g fill="#f4dd96" stroke-width=".6"><circle cx="83" cy="-15" r="2.200"/><circle cx="100" cy="-18.500" r="2.400"/><circle cx="117" cy="-15" r="2.200"/></g><circle cx="100" cy="-4" r="1.800" fill="#8e2f3c" stroke-width=".5"/></g>
<path d="M84,121L92,126M116,121L108,126" fill="none" stroke-width="1"/><path d="M90,122h20l-2,8.500h-16Z" fill="url(#gi${u})" stroke-width="1"/><path d="M93,125.500h14" fill="none" stroke="#b9c0c5" stroke-width=".6" opacity=".7"/>`)}</g>`);
  const flameArt = () => SVG('gplate-fsv', `<g transform="translate(100,112)"><g class="gplate-fl"><g class="gplate-fk"><path class="gplate-f1" d="M0,0C-7.500,-5 -6.500,-13 -2.500,-19C-2.500,-14.500 .5,-14 1,-24C6.500,-17 8.500,-7 0,0Z"/><path class="gplate-f2" d="M0,-1C-3.500,-4.500 -3,-9 0,-14C3,-9 3.500,-4.500 0,-1Z"/></g></g></g>`);
  const streamer = (x, a, c) => `<g transform="translate(${x},104) rotate(${a})"><path d="M0,0q7,5 0,10t0,10t0,10t0,9" fill="none" stroke="${INK}" stroke-width="3.400" stroke-linecap="round"/><path d="M0,0q7,5 0,10t0,10t0,10t0,9" fill="none" stroke="${c}" stroke-width="2.200" stroke-linecap="round"/></g>`;

  // the car: body (behind), basket with the spreader bar, sandbags
  const T = (body) => `<g transform="translate(0,${DY})">${body}</g>`;
  const bodyArt = (u) => SVG('gplate-rim', T(G(u, `<path d="M58,240C55,204 62,187 80,182L120,182C138,187 145,204 142,240Z" fill="#473c30" stroke-width="1.100"/><path d="M58,240C55,204 62,187 80,182L92,182C76,190 72,208 74,240Z" fill="url(#gp${u})" stroke="none"/><path d="M88,183L100,198L112,183M96,194l8,3M95,199l10,3" fill="none" stroke-width=".7"/><path d="M122,184C134,189 140,200 140,214" fill="none" stroke="#b9ad92" stroke-width=".8" opacity=".5"/>`)));
  const weave = () => {
    let s = '', v = '';
    for (let j = 0; j < 6; j++) {
      const y = 208 + j * 6, ins = 52 + (j / 5) ** 2 * 9;
      s += `M${n1(ins + 1)},${y}Q100,${y + 7.5} ${n1(199 - ins)},${y}`;
      for (let x = 60 + (j % 2) * 5; x <= 140; x += 10) if (x > ins + 4 && x < 196 - ins) v += `M${x},${n1(y + 3.75 * (1 - ((x - 100) / 47) ** 2) - 5.4)}v5`;
    }
    return `<path d="${s}" fill="none" stroke-width=".6" opacity=".8"/><path d="${v}" fill="none" stroke-width=".6" opacity=".7"/>`;
  };
  const wreath = () => {
    let s = '';
    for (let i = 0; i < 18; i++) { if (i === 13 || i === 14) continue; const a = i * 20 * Math.PI / 180, x = 100 + 14.5 * Math.cos(a), y = 222 + 13 * Math.sin(a); s += `<g transform="translate(${n1(x)},${n1(y)}) rotate(${i * 20 + 90 + (i % 2 ? 32 : -32)})"><path d="M0,0C2,-3.800 8,-3.800 11,0C8,3.800 2,3.800 0,0Z" fill="${['#627a46', '#8a9a5c', '#4d6540'][i % 3]}" stroke-width=".6"/><path d="M1.500,0H9" fill="none" stroke="#dfe5b8" stroke-width=".5" opacity=".7"/></g>`; }
    return `<g data-m="achievement">${s}<path d="M96,235l-3,7l4,-2l3,4l3,-4l4,2l-3,-7Z" fill="#a3382a" stroke-width=".6"/></g>`;
  };
  const basketArt = (u) => SVG('gplate-rim', T(G(u, `
<path d="M12,246.500C60,243.500 140,244.500 188,246.500L188,251.500C140,249.500 60,248.500 12,251.500Z" fill="#7a5a38" stroke-width="1"/><path d="M16,248.500C60,246.500 140,247 184,248.500M40,250c6,-1.500 12,-1.500 20,0" fill="none" stroke-width=".5" opacity=".7"/><path d="M14,247C60,244.500 140,245 186,247" fill="none" stroke="#d9c092" stroke-width=".7" opacity=".6"/>
<g fill="none" stroke-width="1.400"><circle cx="20" cy="253.500" r="2.500"/><circle cx="180" cy="253.500" r="2.500"/></g>
<path d="M52,203Q100,211 148,203C147,224 141,237 133,240Q100,245 67,240C59,237 53,224 52,203Z" fill="url(#gw${u})" stroke-width="1.200"/>
<path class="gplate-acc" d="M54.500,221.500Q100,229.500 145.500,221.500L143.500,227.500Q100,235.500 56.500,227.500Z" stroke="none" opacity=".8"/>
<path d="M52,203Q72,207.500 86,208.500L86,243Q74,242 67,240C59,237 53,224 52,203Z" fill="url(#gp${u})" stroke="none"/><path d="M52,203Q60,205.500 68,206.500L70,241L67,240C59,237 53,224 52,203Z" fill="url(#gq${u})" stroke="none"/>
${weave()}<path d="M144,208C143.500,222 139,233 133,238" fill="none" stroke="#f0dcae" stroke-width=".9" opacity=".55"/>
${[66, 126].map((x) => `<rect x="${x}" y="238" width="9" height="15" rx="2" fill="#b7a174" stroke-width=".9"/><path d="M${x + .5},242l8,2.500M${x + .5},246l8,2.500" fill="none" stroke-width=".5"/>`).join('')}
<path d="M47,195Q100,202 153,195C156.500,198 156.500,202 153,204.500Q100,212 47,204.500C43.500,202 43.500,198 47,195Z" fill="#a07f4f" stroke-width="1.200"/><path d="M47,195Q100,202 86,201L86,210.500Q64,208 47,204.500C43.500,202 43.500,198 47,195Z" fill="url(#gp${u})" stroke="none"/>
<path d="${Array.from({ length: 16 }, (_, i) => { const x = 52 + i * 6.3, y = 195.5 + 3.3 * (1 - ((x - 99) / 53) ** 2); return `M${n1(x)},${n1(y)}l2.500,8.500`; }).join('')}" fill="none" stroke-width=".6" opacity=".75"/><path d="M104,201.500Q130,200 151,196.500" fill="none" stroke="#f3e0b2" stroke-width=".8" opacity=".6"/>
${wreath()}`)));
  const bagArt = (u, x) => SVG('gplate-rim', T(G(u, `<path d="M${x},201v8" fill="none" stroke-width="1"/><path d="M${x - 4.5},209C${x - 8},215 ${x - 7},224 ${x},225C${x + 7},224 ${x + 8},215 ${x + 4.5},209Z" fill="#a69978" stroke-width="1"/><path d="M${x - 4.5},209C${x - 8},215 ${x - 7},224 ${x - 1},225C${x - 4},219 ${x - 3},213 ${x - 1},209Z" fill="url(#gp${u})" stroke="none"/><path d="M${x - 5},209.500h10" fill="none" stroke-width="1.500"/>`)));

  // the goblin's head (origin: the middle of the face)
  const EYE = 'M-7.500,0Q0,-6.600 7.500,0Q0,4.800 -7.500,0Z';
  const eye = (s, u) => `<g transform="translate(${16.5 * s},-6)${s < 0 ? ' scale(-1,1)' : ''}"><g class="gplate-sl"><ellipse cx="1" cy="-.5" rx="11.500" ry="8" fill="#2a2816" opacity=".36"/><ellipse cx="1" cy="-.5" rx="11.500" ry="8" fill="url(#gp${u})"/>
<g clip-path="url(#ge${u})"><path d="${EYE}" fill="#e8cb4c"/><path d="M-9,-6H9V-1.300H-9Z" fill="#6a4a10" opacity=".42"/>
<g class="gplate-pm" style="--s:${s}"><ellipse rx="1.800" ry="2.300" fill="#140d07"/><circle cx="${-.7 * s}" cy="-.9" r=".65" fill="#fffbe6"/></g>
<g class="gplate-lid"><g class="gplate-bk"><path d="M-10,-22H10V-3.700Q0,-3.200 -10,-3.700Z" fill="#69724f" stroke="${INK}" stroke-width=".8"/></g></g>
<path class="gplate-low" d="M-10,16H10V3.100Q0,5 -10,3.100Z" fill="#7a8460" stroke="${INK}" stroke-width=".6"/></g>
<path d="${EYE}" fill="none" stroke="${INK}" stroke-width=".8"/><path d="M-8.300,.5Q0,-7.300 8.300,.5" fill="none" stroke="${INK}" stroke-width="1.400" stroke-linecap="round"/>
<path d="M-7,4.800q7,4.200 15,.2M-5,7.600q6,3 12,0M9,-2.400l4,-2M9.500,.4l4.400,.6" fill="none" stroke="${INK}" stroke-width=".55" stroke-linecap="round" opacity=".8"/></g></g>`;
  const brow = (s) => `<g transform="translate(${16.5 * s},-14.5)${s < 0 ? ' scale(-1,1)' : ''}"><g class="gplate-bw" style="--b:var(--by${s < 0 ? 'l' : 'r'})"><path d="M-10,1.500C-4,-3.200 5,-3.800 12,.5C5,-1 -3,.4 -9,4.400Z" fill="#2b2515" stroke="${INK}" stroke-width=".6" stroke-linejoin="round"/></g></g>`;
  const EAR = (u) => `<path d="M-5,-8C8,-15.500 27,-13 47,-3C41,0 36,1 32,3L34,7.500C27,8.500 23,9.500 19,11.500C11,13.500 2,12.500 -5,9Z" fill="url(#gk${u})" stroke-width="1.100"/><path d="M2,-4C12,-9.500 25,-8 37,-3C29,0 21,4 13,6C8,7 4,6 2,5Z" fill="#4b3d30" opacity=".55" stroke="none"/><path d="M2,-4C12,-9.500 25,-8 37,-3C29,0 21,4 13,6C8,7 4,6 2,5Z" fill="url(#gp${u})" stroke="none"/><path d="M6,-1C14,-4 24,-4 31,-2M8,3C14,2 20,1 26,-1" fill="none" stroke-width=".55" opacity=".7"/><path d="M2,-10C14,-14 28,-12 41,-5.500" fill="none" stroke="#dfe2c0" stroke-width=".9" opacity=".7"/>`;
  const teeth = (y0, dir, n, w) => { let s = ''; for (let i = 0; i < n; i++) { const x = -w + (2 * w) * (i + .5) / n, y = y0 + 1.75 * (1 - (x / 15) ** 2) * (dir > 0 ? 1 : -.4), h = (2.6 + (i * 7 % 3) * .7) * dir; s += `M${n1(x - 1.5)},${n1(y)}L${n1(x)},${n1(y + h)}L${n1(x + 1.5)},${n1(y)}Z`; } return `<path d="${s}" fill="#ded3a2" stroke-width=".45"/>`; };
  const laurel = () => { let s = ''; for (const d of [-1, 1]) for (let i = 0; i < 6; i++) { const a = (200 + i * 13) * Math.PI / 180, x = d * 41 * Math.cos(a) * -1, y = -6 + 34 * Math.sin(a); s += `<g transform="translate(${n1(x)},${n1(y)}) rotate(${d < 0 ? -(i * 13 + 100) + 180 : i * 13 + 100 - 180})"><path d="M0,0C3,-5.500 11,-5.500 15,0C11,4.500 3,4.500 0,0Z" fill="${['#627a46', '#8a9a5c', '#4d6540'][i % 3]}" stroke-width=".7"/><path d="M2,0H12" fill="none" stroke="#dfe5b8" stroke-width=".5" opacity=".7"/></g>`; } return s; };
  const headArt = (u) => SVG('gplate-rim gplate-hs', T(`<g transform="translate(100,166)">
<g transform="translate(-34,-6) scale(-1,1)"><g class="gplate-ear" style="--e:var(--el)"><g class="gplate-tw">${G(u, EAR(u))}</g></g></g>
<g transform="translate(34,-6)"><g class="gplate-ear" style="--e:var(--er)"><g class="gplate-tw">${G(u, EAR(u))}</g></g></g>
${G(u, `<g ${on('arms', 'rim')}><path d="M-9,-31C-11,-38 -17,-41 -22,-39M-1,-32C-2,-40 2,-45 8,-45M8,-31C12,-37 18,-39 23,-36" fill="none" stroke-width=".9"/></g><g data-m="poor death good levelup"><path d="M-9,-31C-11,-38 -17,-41 -22,-39M-1,-32C-2,-40 2,-45 8,-45M8,-31C12,-37 18,-39 23,-36" fill="none" stroke-width=".9"/></g>
<path d="M-2,-31C16,-33 33,-25 37,-9C39,0 37,8 31,15C25,23 14,33 0,34C-14,33 -25,23 -31,15C-37,8 -39,0 -37,-9C-33,-26 -18,-32 -2,-31Z" fill="url(#gk${u})" stroke-width="1.200"/>
<g stroke="none"><path d="M-2,-31C-18,-32 -33,-26 -37,-9C-39,0 -37,8 -31,15C-25,23 -14,33 -4,34C-16,24 -24,10 -25,-4C-26,-18 -16,-28 -2,-31Z" fill="#2a2c16" opacity=".2"/><path d="M-2,-31C-18,-32 -33,-26 -37,-9C-39,0 -37,8 -31,15C-25,23 -14,33 -4,34C-16,24 -24,10 -25,-4C-26,-18 -16,-28 -2,-31Z" fill="url(#gp${u})"/>
<path d="M-36,-12C-38,0 -36,9 -30,16L-27,13C-32,6 -33,-2 -32,-12Z" fill="url(#gq${u})"/>
<path d="M-35,-13Q0,-7 35,-13L34,-4Q0,3 -34,-4Z" fill="#2a2816" opacity=".22"/><path d="M-35,-13Q0,-7 35,-13L34,-6Q0,0 -34,-6Z" fill="url(#gq${u})"/>
<path d="M-31,7C-24,10 -19,18 -16,28C-24,23 -29,15 -31,7Z" fill="url(#gp${u})"/><path d="M31,7C24,10 19,18 16,28C24,23 29,15 31,7Z" fill="url(#gq${u})" opacity=".7"/></g>
<path d="M-17,-23C-8,-26 8,-26 17,-23M-22,-18C-8,-21.500 8,-21.500 22,-18M-29,6C-23,10 -19,17 -17,25M29,6C23,10 19,17 17,25M-2,-16v4M2.500,-16v3.500" fill="none" stroke-width=".55" opacity=".65"/>
<path d="M31,-20C38,-10 39,2 31,15" fill="none" stroke="#e6e8c8" stroke-width="1" opacity=".55"/><circle cx="25" cy="11" r="1.500" fill="#737c58" stroke-width=".6"/><circle cx="-21" cy="-24" r="1.200" fill="#6a7350" stroke-width=".6"/>
<g class="gplate-mm"><g ${on('mouth', 'flat')}><path d="M-12,27.500Q-2,26 12,28M-13,26l-1.500,3M13,26.500l1.500,3" fill="none" stroke-width="1.100"/></g>
<g ${on('mouth', 'frown')}><path d="M-12,30.500Q0,24 12,30.500" fill="none" stroke-width="1.200"/><path d="M-5,31.500q5,-1.500 10,0M-13,30l-1,2.500M13,30l1,2.500" fill="none" stroke-width=".6"/></g>
<g ${on('mouth', 'smirk')}><path d="M-11,27.500Q3,30 12,24" fill="none" stroke-width="1.200"/><path d="M12,21.500q2.500,2.500 0,5" fill="none" stroke-width=".7"/></g>
<g ${on('mouth', 'grin')}><path d="M-15,23.500Q0,27 15,23.500Q10,33 0,33Q-10,33 -15,23.500Z" fill="#291410" stroke-width="1"/>${teeth(23.5, 1, 7, 12)}<path d="M-3,33l1.500,-3l1.500,3" fill="#ded3a2" stroke-width=".45"/></g>
<g ${on('mouth', 'blow')}><ellipse cx="3" cy="27.500" rx="3.300" ry="2.600" fill="#291410" stroke-width="1"/><path d="M-9,26q4,-2 7,0M10,25q3,1 4,3" fill="none" stroke-width=".6"/></g>
<g ${on('mouth', 'dag')}><path d="M-16,23Q0,26 17,21.500Q12,32 0,32.500Q-11,32 -16,23Z" fill="#291410" stroke-width="1"/>
<path d="M-8,25.500L40,23L48,26.500L40,30L-8,29.500Z" fill="url(#gi${u})" stroke-width=".9"/><path d="M-6,27.300L44,26.300M22,24l2,3l2,-3.200" fill="none" stroke-width=".5"/><path d="M-4,26.300L38,24.500" fill="none" stroke="#e6ecef" stroke-width=".6" opacity=".7"/>
<rect x="-11.500" y="21.500" width="3.500" height="12" rx="1" fill="#8a6a32" stroke-width=".8"/><rect x="-25" y="25" width="14" height="5" rx="1.500" fill="#4a3020" stroke-width=".8"/><path d="M-22,25v5M-18.500,25v5M-15,25v5" fill="none" stroke-width=".5"/><circle cx="-26.500" cy="27.500" r="2.600" fill="#8a6a32" stroke-width=".8"/>
${teeth(23, 1, 8, 13)}${teeth(32, -1, 7, 10)}<path d="M-11,24l1.200,5l1.600,-4.600ZM10.500,23.500l1.200,5l1.600,-5Z" fill="#efe6bd" stroke-width=".5"/></g></g>
<g transform="translate(0,25)"><g class="gplate-yawn"><path d="M-8,-1Q0,-4 8,-1Q10,8 0,9Q-10,8 -8,-1Z" fill="#291410" stroke-width="1"/><ellipse cx="0" cy="6" rx="4" ry="2" fill="#7a4a44" stroke="none"/><path d="M-4,-1.500l1.300,2.800l1.300,-2.800ZM2,-1.800l1.300,2.800l1.300,-2.800Z" fill="#ded3a2" stroke-width=".45"/></g></g>`)}
${G(u, `<path d="M-3,-10C-4,-2 -9,5 -10.500,11C-12,17.500 -6.500,21.500 -1.500,19.500C0,23.500 4.500,23.500 5.500,19.500C10,20.500 13,16 11,10C9,4 4,-2 3,-10Z" fill="#8a9068" stroke-width="1.100"/>
<ellipse cx="0" cy="15" rx="9" ry="6" fill="#9c5a40" opacity=".2" stroke="none"/><ellipse cx="4" cy="8" rx="2.600" ry="6.500" fill="#e3e4c2" opacity=".42" stroke="none"/>
<path d="M-3,-10C-4,-2 -9,5 -10.500,11C-12,17.500 -6.500,21.500 -2.500,19.500C-6,13 -4,2 -1,-6Z" fill="url(#gp${u})" stroke="none"/>
<path d="M-8,16q2.500,3 5.500,1.500M5,17.500q2.500,1.500 4.500,-1.500" fill="none" stroke-width="1"/><path d="M-10.500,11C-14,12 -14,18 -9.500,18.500M11,10C14.500,11 14.500,16.500 10.500,17.500" fill="none" stroke-width=".8"/>`)}
${eye(-1, u)}${eye(1, u)}${brow(-1)}${brow(1)}
<g data-m="meh" class="gplate-pop">${G(u, `<path d="M-30,-30C-48,-42 -62,-32 -59,-8L-53,-9C-53,-22 -44,-27 -32,-22Z" fill="#74607a" stroke-width="1"/><path d="M-37,-33l-4,7M-46,-34l-2,8M-54,-30l3,7M-58,-20l6,2" fill="none" stroke="#c4b5b0" stroke-width="1.300"/>
<circle cx="-56" cy="-4" r="5.500" fill="#c9bcae" stroke-width=".9"/><path d="M-59,-6l2,3M-55,-8l1,4M-53,-3l-3,2" fill="none" stroke-width=".5"/>
<path d="M-36,-20C-36,-42 -12,-49 10,-43C26,-38 36,-30 36,-20Q0,-31 -36,-20Z" fill="#74607a" stroke-width="1.100"/><path d="M-36,-20C-36,-42 -12,-49 -4,-47C-20,-42 -26,-32 -25,-23Z" fill="url(#gp${u})" stroke="none"/>
<path d="M-27,-37Q0,-46 27,-34M-33,-29Q0,-40 33,-27M-14,-44Q2,-48 16,-41" fill="none" stroke="#c4b5b0" stroke-width="1.600"/>
<path d="M-37,-14Q0,-25 37,-14L37,-22Q0,-33 -37,-22Z" fill="#b9aaa4" stroke-width="1"/><path d="M-28,-18.500l1,-7M-18,-21l1,-7M-8,-22.500l.5,-7M2,-23v-7M12,-22l-.5,-7M22,-20l-1,-7M31,-17l-1,-7" fill="none" stroke-width=".5" opacity=".7"/>`)}</g>
<g data-m="great" class="gplate-pop">${G(u, `<path d="M15,-30C16,-48 26,-64 43,-72C43,-58 37,-42 25,-28Z" fill="#dccfa6" stroke-width=".9"/><path d="M19,-32C22,-48 30,-60 41,-69" fill="none" stroke-width=".7"/><path d="M22,-44l8,-3M25,-51l8,-4M29,-58l8,-4M21,-38l7,-1M23,-47l-5,-3M27,-55l-5,-4" fill="none" stroke-width=".5"/><path d="M36,-66C40,-68 42,-70 43,-72C43,-66 41,-60 39,-56Z" fill="#a8452f" stroke-width=".6"/>
<path d="M-37,-18C-35,-41 -9,-47 13,-41C28,-37 36,-28 37,-18Q0,-29 -37,-18Z" fill="#3b6a72" stroke-width="1.100"/><path d="M-37,-18C-35,-41 -9,-47 -3,-45C-20,-40 -26,-30 -26,-21Z" fill="url(#gp${u})" stroke="none"/><path d="M14,-38C24,-35 31,-28 33,-22" fill="none" stroke="#b9d3d4" stroke-width=".9" opacity=".6"/>
<path d="M-41,-13Q0,-26 40,-15L56,-22Q14,-36 -39,-22Z" fill="#274a52" stroke-width="1.100"/><path d="M-36,-19.500Q4,-31 48,-21.500" fill="none" stroke="#9fbcbf" stroke-width=".7" opacity=".7"/>`)}</g>
<g data-m="superb" class="gplate-pop"><g transform="translate(-10,-27) rotate(-24)">${G(u, `<path d="M-23,2L1,-46L23,2Q0,9 -23,2Z" fill="#e3d4a4" stroke-width="1.100"/>
<path d="M-17.500,-9L-12,-20L18,-9L21,-2Q0,-3 -20,-4ZM-7,-30L-2.500,-39L8,-31L12,-22Z" fill="#a8452f" stroke-width=".6"/><path d="M-23,2Q0,9 23,2L21,-2Q0,5 -21,-2Z" fill="#2f6f7c" stroke-width=".6"/>
<path d="M-23,2L1,-46L-6,-28C-10,-16 -12,-6 -12,4Z" fill="url(#gp${u})" stroke="none"/>
<path d="M1,-46m-6.500,-3a3.300,3.300 0 0 1 5,-4.500a3.300,3.300 0 0 1 6,1a3.300,3.300 0 0 1 2.500,5.500a3.300,3.300 0 0 1 -4,4.500a3.300,3.300 0 0 1 -6,-.5a3.300,3.300 0 0 1 -3.500,-6Z" fill="#dcb548" stroke-width=".9"/><path d="M-1,-51l2,3M4,-49l-1,3" fill="none" stroke-width=".5"/>`)}</g></g>
<g data-m="achievement" class="gplate-pop">${G(u, laurel())}</g>
<g data-m="pvp" class="gplate-pop">${G(u, `<path d="M-39,-12C-41,-35 -22,-40 0,-40C22,-40 41,-35 39,-12Q0,-21 -39,-12Z" fill="url(#gi${u})" stroke-width="1.200"/><path d="M-39,-12C-41,-35 -22,-40 -4,-40C-20,-36 -27,-26 -26,-15Z" fill="url(#gp${u})" stroke="none"/><path d="M-39,-12C-41,-35 -22,-40 -14,-40C-28,-35 -33,-26 -32,-14Z" fill="url(#gq${u})" stroke="none"/>
<path d="M-4,-40L0,-49L4,-40Z" fill="#555c63" stroke-width=".9"/><path d="M14,-38C26,-35 35,-27 36,-17" fill="none" stroke="#e9eef0" stroke-width=".9" opacity=".6"/><path d="M18,-30l5,3l-1,4M-12,-33l4,2" fill="none" stroke-width=".6"/>
<path d="M-40,-11Q0,-21 40,-11L39.500,-17Q0,-27 -39.500,-17Z" fill="#3a3f45" stroke-width="1"/><path d="M-4,-20L-3,-1Q0,2 3,-1L4,-20Z" fill="#4b5158" stroke-width="1"/>
<g fill="#aab1b6" stroke-width=".5"><circle cx="-30" cy="-16.500" r="1.300"/><circle cx="-16" cy="-19.500" r="1.300"/><circle cx="16" cy="-19.500" r="1.300"/><circle cx="30" cy="-16.500" r="1.300"/></g>`)}</g>
<g ${on('mouth', 'blow')}><g transform="translate(4,27.5) rotate(14)"><g class="gplate-blow"><rect x="-1" y="-2.200" width="8" height="4.400" rx="1" fill="#e3d4a4" stroke="${INK}" stroke-width=".8"/>
<g transform="translate(6,0)"><g class="gplate-roll"><path d="M0,-3L44,-4.500C48,-4.500 48,4.500 44,4.500L0,3Z" fill="#a8452f" stroke="${INK}" stroke-width=".8"/><path d="M6,-3.200L10,3.300L15,3.500L11,-3.400ZM20,-3.700L24,3.800L29,4L25,-3.900ZM34,-4.200L38,4.300L43,4.500L39,-4.400Z" fill="#e2bb48"/></g></g>
<g transform="translate(13,3)"><g class="gplate-coil"><circle r="5.500" fill="#a8452f" stroke="${INK}" stroke-width=".8"/><path d="M0,0a2,2 0 0 1 2,-2a3.500,3.500 0 0 1 1.500,5.500" fill="none" stroke="#e2bb48" stroke-width="1.300"/></g></g>
<g class="gplate-toot" fill="none" stroke="#f0d78a" stroke-width="1.200" stroke-linecap="round"><path d="M55,-7l5,-4M57,0h7M55,7l5,4"/></g></g></g></g>
</g>`));

  // arms, hands and what they hold (in front of the head)
  const SK = '#838d66';
  const limb = (x1, y1, x2, y2, w) => `<path d="M${x1},${y1}L${x2},${y2}" fill="none" stroke="${INK}" stroke-width="${w + 2}"/><path d="M${x1},${y1}L${x2},${y2}" fill="none" stroke="${SK}" stroke-width="${w}"/><path d="M${x1},${y1 + w * .26}L${x2},${y2 + w * .26}" fill="none" stroke="#353c26" stroke-width="${w * .36}" opacity=".5"/><path d="M${x1},${y1 - w * .28}L${x2},${y2 - w * .28}" fill="none" stroke="#c9cda8" stroke-width="${w * .14}" opacity=".7"/>`;
  const fist = (x, y, r = 6.5) => `<path d="M${x - r},${y}c0,${-r * 1.15} ${2 * r},${-r * 1.15} ${2 * r},0c0,${r * .95} ${-2 * r},${r * .95} ${-2 * r},0Z" fill="#8c9670" stroke-width="1"/><path d="M${x - r * .45},${y - r * .5}v${r * .8}M${x},${y - r * .62}v${r * .95}M${x + r * .45},${y - r * .5}v${r * .8}" fill="none" stroke-width=".6"/>`;
  const drape = (x, y, n, len) => { let s = ''; for (let i = 0; i < n; i++) s += `M${n1(x + i * 4.3)},${y}v${len + (i === 1 ? 1 : 0)}`; return `<path d="${s}" fill="none" stroke="${INK}" stroke-width="5.200"/><path d="${s}" fill="none" stroke="#8c9670" stroke-width="3.400"/>`; };
  const star = (cx, cy, R, r) => { let d = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r : R; d += `${i ? 'L' : 'M'}${n1(cx + q * Math.cos(a))},${n1(cy + q * Math.sin(a))}`; } return d + 'Z'; };
  const armsArt = (u) => SVG('gplate-rim', T(`
<g ${on('arms', 'rim')}>${G(u, `${limb(58, 200, 112, 203.5, 9)}${limb(142, 200, 92, 204.5, 9)}${drape(82.5, 204, 3, 6)}<path d="M112,199q4,-2 6,2M117,199.500q4,-1 5,3" fill="none" stroke-width=".7"/>`)}</g>
<g ${on('arms', 'hang')}>${G(u, `${limb(86, 203, 84, 226, 8.5)}${limb(114, 203, 116, 227, 8.5)}${drape(79.7, 227, 3, 5)}${drape(111.7, 228, 3, 5)}`)}</g>
<g ${on('arms', 'thumb')}>${G(u, `${limb(58, 200, 106, 203.5, 9)}${drape(99, 204, 3, 6)}${limb(135, 199, 151, 185, 8.5)}<g class="gplate-thumb"><path d="M151.500,177L150,164" fill="none" stroke="${INK}" stroke-width="6.600"/><path d="M151.500,177L150,164" fill="none" stroke="#8c9670" stroke-width="4.800"/><path d="M148.300,165.500q2,-1.500 3.600,0" fill="none" stroke-width=".6"/>${fist(152, 181, 7)}</g>`)}</g>
<g ${on('arms', 'fists')}>${G(u, `${limb(50, 182, 64, 195, 8.5)}${fist(66, 196)}${limb(150, 182, 136, 195, 8.5)}${fist(134, 196)}`)}</g>
<g ${on('arms', 'star')}><g class="gplate-pump">${G(u, `${limb(62, 190, 46, 170, 8.5)}${fist(45, 165)}${limb(136, 192, 151, 170, 8.5)}<path d="M150,178L164,104" fill="none" stroke-width="4"/><path d="M150,178L164,104" fill="none" stroke="#9a7848" stroke-width="2.200"/>${fist(151, 168, 6)}
<path d="${star(165, 96, 13, 5.4)}" fill="url(#gb${u})" stroke-width="1"/><path d="${star(165, 96, 6.5, 2.7)}" fill="#f8e7a8" stroke="none" opacity=".8"/><path d="M165,78v-5M181,84l4,-3M149,84l-4,-3M184,100l5,1M146,100l-5,1" fill="none" stroke="#f0d78a" stroke-width="1.200"/>`)}</g></g>
<g ${on('arms', 'hat')}>${G(u, `<g transform="translate(100,216) rotate(-7)"><ellipse cx="0" cy="9" rx="20" ry="4.500" fill="#151416" stroke-width="1"/><path d="M-11.500,-13L-10.500,8Q0,11 10.500,8L11.500,-13Q0,-16.500 -11.500,-13Z" fill="#1d1c1f" stroke-width="1"/><ellipse cx="0" cy="-13.500" rx="11.500" ry="2.600" fill="#2b2a2e" stroke-width=".8"/><path d="M-10.700,2Q0,5 10.700,2L10.500,8Q0,11 -10.500,8Z" fill="#070708" stroke="none"/><path d="M8,4l7,12l-3.500,1l-6,-11Z" fill="#070708" stroke-width=".7"/>
<path d="M7,-11L7.500,1M-19,9.500Q0,14 19,9.500" fill="none" stroke="#8d9097" stroke-width=".8" opacity=".8"/></g>${limb(58, 201, 85, 214, 9)}${limb(142, 201, 115, 213, 9)}${drape(84, 211, 2, 5)}${drape(111.5, 210, 2, 5)}`)}</g>
<g data-m="meh">${G(u, `<path d="M133,183.500h13l-1,13.500h-11Z" fill="#8f979c" stroke-width="1"/><path d="M146,186c5.500,0 5.500,7.500 -.5,7.500" fill="none" stroke-width="1.300"/><ellipse cx="139.500" cy="183.500" rx="6.500" ry="1.700" fill="#4a3524" stroke-width=".8"/><path d="M135,186v9" fill="none" stroke="#dfe5e8" stroke-width=".8" opacity=".7"/><path d="M137,184c-1,6 -5,6 -5,11" fill="none" stroke-width=".5"/><rect x="129.500" y="195" width="4.500" height="5" fill="#d9cba3" stroke-width=".5"/>`)}</g>
<g data-m="achievement">${G(u, `<path d="M85,189L96,209L101,205L92,187Z" fill="#8f2f24" stroke-width=".8"/><path d="M115,189L104,209L99,205L108,187Z" fill="#a84332" stroke-width=".8"/><circle cx="100" cy="216" r="11.500" fill="url(#gb${u})" stroke-width="1"/><circle cx="100" cy="216" r="8.400" fill="none" stroke-width=".6"/><path d="${star(100, 216, 6.5, 2.7)}" fill="#f8e7a8" stroke-width=".5"/><path d="M93.500,210Q97,206.500 102,206.500" fill="none" stroke="#fff6d2" stroke-width=".9" opacity=".8"/>`)}</g>`));

  // things tied to the ropes (each sways on its own)
  const flag = (dir, body) => `<g transform="translate(${dir < 0 ? 51 : 149},${197 + DY})${dir < 0 ? ' scale(-1,1)' : ''}"><path d="M0,0L17,-25" fill="none" stroke="${INK}" stroke-width="3.400" stroke-linecap="round"/><path d="M0,0L17,-25" fill="none" stroke="#a5855a" stroke-width="1.800" stroke-linecap="round"/><g transform="translate(16,-23) rotate(-8)"><g class="gplate-flut">${body}</g></g></g>`;
  const PENN = `<path d="M0,-6.500L34,-1.500L26,1.500L35,5.500L0,8Z" class="gplate-acc" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/><path d="M2,-4L27,-.5M2,5.500L26,3.800" fill="none" stroke="#f1e9c8" stroke-width=".7" opacity=".6"/>`;
  const BLACKFLAG = `<path d="M0,-9L30,-10.500L27,-4L31,0L26,5L30,10.500L0,10Z" fill="#141210" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/><path d="M1,-8.500L29,-10" fill="none" stroke="#9a9da2" stroke-width=".8"/><path d="M8,-4L19,5M19,-4.500L8,5.500" fill="none" stroke="#c23d2e" stroke-width="1.800" stroke-linecap="round"/>`;
  const propsArt = (u) => SVG('gplate-rim', `<g data-m="good great">${flag(-1, PENN)}</g><g data-m="great">${flag(1, PENN)}</g><g data-m="pvp">${flag(-1, BLACKFLAG)}</g>`);
  const tagArt = (u) => SVG('gplate-rim', T(`<g data-m="calibrating">${G(u, `<path d="M124,134l5,8" fill="none" stroke-width=".8"/><g transform="translate(131,141) rotate(9)"><path d="M-8,4L-3.500,-2H5.500L9,4V27H-8Z" fill="#dccfa8" stroke-width=".9"/><circle cx=".5" cy="2.500" r="1.400" fill="${INK}" stroke="none"/><text x=".5" y="22" text-anchor="middle" font-family="'IM Fell English',Georgia,serif" font-size="19" font-style="italic" fill="#3a2a1c" stroke="none">?</text></g>`)}</g>`));
  const cloudArt = (u) => SVG('gplate-rim', T(`<g data-m="poor">${G(u, `<path d="M70,146C62,146 60,137 68,135C68,127 79,124 84,129.500C88,121 102,121 105,130C112,125.500 122,131 118,138C126,139 126,147 118,147Z" fill="#7d8894" stroke-width="1.100"/><path d="M70,146C62,146 60,137 68,135C70,140 80,143 92,143C104,143 114,142 119,139.500C126,140 126,147 118,147Z" fill="#3c4652" opacity=".5" stroke="none"/><path d="M66,140H122V147H66Z" fill="url(#gp${u})" stroke="none"/><path d="M72,133C74,129 80,127 84,130M90,126C95,123 101,125 103,130" fill="none" stroke="#dfe6ec" stroke-width=".9" opacity=".8"/>`)}</g>`));

  const studs = (n, pvp, u) => {
    if (pvp) return `<svg xmlns="${NS}" width="16" height="13" viewBox="0 0 16 13"><path d="M2.500,1.500L13.500,11.500M13.500,1.500L2.500,11.500" fill="none" stroke="#e0624c" stroke-width="2.200" stroke-linecap="round"/></svg>`;
    let s = '';
    for (let i = 0; i < 5; i++) s += i < n ? `<circle cx="${5 + i * 10}" cy="6" r="3.700" fill="#d9b450" stroke="#1a1008" stroke-width=".9"/><circle cx="${4 + i * 10}" cy="5" r="1.300" fill="#fff3c4"/>` : `<circle cx="${5 + i * 10}" cy="6" r="2.300" fill="#150d07" stroke="#8a6a48" stroke-width=".7" opacity=".85"/>`;
    return `<svg xmlns="${NS}" width="50" height="12" viewBox="0 0 50 12">${s}</svg>`;
  };
  const EYEBOLT = `<svg class="gplate-eye" xmlns="${NS}" width="12" height="12" viewBox="-6 -6 12 12"><path d="M0,1v5" stroke="#1c1e21" stroke-width="2.600"/><circle cy="-2" r="2.600" fill="none" stroke="#17191b" stroke-width="2.200"/><circle cy="-2" r="2.600" fill="none" stroke="#8d949a" stroke-width=".8"/></svg>`;
  const CONF = ['#e2bb48', '#a8452f', '#2f8492', '#efe3bd', '#7a4c8e'];

  let uid = 0;
  Harness.register({
    id: 'goblin-plate',
    name: 'Goblin, the plate',
    blurb: 'The original, redrawn as an engraving: the gloomy goblin leans on the rim of his patched balloon, and the news hangs on a plank roped to a bar under the basket. His ears, his hat and whatever he has brought along say how good the kill was.',
    create(ctx) {
      const E = ctx.el, flights = new Set(), stills = new Set();
      let raf = 0;

      function fillSign(r, n) {
        const b = r.board, mood = r.mood;
        b.textContent = '';
        const ach = n.kind === 'achievement';
        if (ach) b.append(E('div', 'gplate-tag', n.label));
        b.append(E('div', 'gplate-title', n.title));
        const fig = E('div', 'gplate-fig', n.big);
        if (n.unit) fig.append(E('span', 'gplate-unit', n.unit));
        b.append(fig);
        if (n.kind === 'kill') {
          const rate = E('div', 'gplate-rate');
          rate.append(ctx.svg(studs(RANK[mood] || 0, mood === 'pvp')));
          rate.append(E('span', 'gplate-word', n.label || '?'));
          b.append(rate);
        } else if (!ach && n.label) b.append(E('div', 'gplate-tag', n.label));
        b.append(E('div', 'gplate-more', n.more));
      }

      function build(n, isStill) {
        const u = ++uid, rnd = ctx.rng(u * 7919 + 13);
        const el = E('div', 'gplate');
        const layer = (cls, ...kids) => { const d = E('div', 'gplate-l ' + cls); d.append(...kids.map((k) => (typeof k === 'string' ? ctx.svg(k) : k))); return d; };
        // envelope (with flame, glow, streamers)
        const glow = E('div', 'gplate-glow');
        const strL = layer('gplate-sw', SVG('', `<g data-m="superb">${streamer(66, 14, '#a8452f')}${streamer(74, -4, '#2f8492')}</g>`));
        const strR = layer('gplate-sw', SVG('', `<g data-m="superb">${streamer(134, -14, '#e2bb48')}${streamer(126, 5, '#a8452f')}</g>`));
        strL.style.transformOrigin = '70px 104px'; strR.style.transformOrigin = '130px 104px';
        const env = layer('gplate-env', glow, envArt(u), flameArt(), strL, strR);
        const ropes = ctx.svg(SVG('', `<path class="gplate-rope"/><path class="gplate-rope2"/><path class="gplate-rope gplate-tie"/><path class="gplate-rope2 gplate-tie2"/>`));
        // car
        const body = layer('gplate-bd gplate-gob', bodyArt(u));
        const nod = layer('gplate-nod', headArt(u));
        const head = layer('gplate-hd gplate-gob', nod);
        const bagL = layer('gplate-sw', bagArt(u, 49)), bagR = layer('gplate-sw', bagArt(u, 151));
        bagL.style.transformOrigin = `49px ${201 + DY}px`; bagR.style.transformOrigin = `151px ${201 + DY}px`;
        const props = layer('gplate-sw', propsArt(u));
        const tag = layer('gplate-sw', tagArt(u)); tag.style.transformOrigin = `124px ${134 + DY}px`;
        const cloud = layer('', cloudArt(u));
        const rain = E('div', 'gplate-l'); rain.dataset.m = 'poor';
        for (let i = 0; i < 5; i++) { const d = E('div', 'gplate-drip'); d.style.left = (72 + i * 10 + (i % 2) * 3) + 'px'; d.style.top = (147 + DY) + 'px'; d.style.animationDelay = (-i * .37) + 's'; d.style.animationDuration = (.85 + (i % 3) * .15) + 's'; rain.append(d); }
        const armsIn = layer('gplate-arm', armsArt(u));
        const arms = layer('gplate-gob', armsIn);
        const car = layer('gplate-car', body, ctx.svg(basketArt(u)), props, bagL, bagR, head, cloud, rain, tag, arms);
        // plank
        const sign = E('div', 'gplate-sign'), board = E('div', 'gplate-board');
        const e1 = ctx.svg(EYEBOLT), e2 = ctx.svg(EYEBOLT); e1.style.left = '8px'; e2.style.left = '168px';
        sign.append(board, e1, e2);
        const conf = E('div', 'gplate-l'); conf.dataset.m = 'superb';
        for (let i = 0; i < 16; i++) { const d = E('div', 'gplate-conf'); d.style.left = (8 + rnd() * 184) + 'px'; d.style.background = CONF[i % 5]; d.style.setProperty('--dx', ((rnd() - .5) * 50).toFixed(0) + 'px'); d.style.setProperty('--rt', (300 + rnd() * 600).toFixed(0) + 'deg'); d.style.animationDuration = (2.4 + rnd() * 1.6).toFixed(2) + 's'; d.style.animationDelay = (-rnd() * 4).toFixed(2) + 's'; conf.append(d); }
        el.append(env, ropes, car, sign, conf);
        if (ctx.reduced) el.classList.add('gplate-rm');

        const q = (s) => el.querySelector(s), qa = (s) => [...el.querySelectorAll(s)];
        const hs = q('.gplate-hs'), fl = q('.gplate-fl'), rp = qa('.gplate-rope,.gplate-rope2');
        const tw = qa('.gplate-tw'), yawnEl = q('.gplate-yawn'), mm = q('.gplate-mm');
        const r = { el, board, mood: 'calibrating', ph: rnd() * 9000, hy: 0, ht: 0, by: 0, th: 0, sv: 0, bump: 0, bv: 0, fs: .3, last: 0, born: performance.now(), arrived: isStill, left: false, lock: 0 };
        const now0 = performance.now();
        r.nb = now0 + 900 + rnd() * 2500; r.nb2 = 0; r.bkEnd = 0; r.ng = now0 + 1200 + rnd() * 1500; r.ne = now0 + 1800 + rnd() * 3000; r.nh = now0 + 3000 + rnd() * 4000; r.nt = now0 + 350; r.ny = now0 + 2500 + rnd() * 3000;

        const anim = (node, kf, dur, opt) => (ctx.reduced || !node ? null : node.animate(kf, { duration: dur, easing: 'ease-in-out', ...opt }));
        const gaze = (x, y) => { hs.style.setProperty('--gx', x); hs.style.setProperty('--gy', y); };
        const shut = (now, ms) => { hs.classList.add('gplate-shut'); r.bkEnd = now + ms; };
        const twitch = (i, deg, dur = 300) => anim(tw[i], [{ transform: 'none' }, { transform: `rotate(${deg}deg)`, offset: .35 }, { transform: `rotate(${-deg * .3}deg)`, offset: .7 }, { transform: 'none' }], dur);
        const toot = () => {
          anim(q('.gplate-roll'), [{ transform: 'scaleX(.12)' }, { transform: 'scaleX(1.06)', offset: .12 }, { transform: 'scaleX(1)', offset: .2 }, { transform: 'scaleX(1)', offset: .82 }, { transform: 'scaleX(.12)' }], 2000);
          anim(q('.gplate-coil'), [{ opacity: 1 }, { opacity: 0, offset: .06 }, { opacity: 0, offset: .9 }, { opacity: 1 }], 2000);
          anim(q('.gplate-toot'), [{ opacity: 0 }, { opacity: 1, offset: .12 }, { opacity: 0, offset: .3 }, { opacity: .9, offset: .4 }, { opacity: 0, offset: .6 }, { opacity: 0 }], 2000);
          anim(nod, [{ transform: 'none' }, { transform: 'translateY(-1.5px) rotate(-1.5deg)', offset: .15 }, { transform: 'none' }], 700);
        };
        const yawn = (now) => {
          shut(now, 1300);
          anim(yawnEl, [{ opacity: 0, transform: 'scale(.5,.1)' }, { opacity: 1, transform: 'none', offset: .3 }, { opacity: 1, transform: 'scale(1.05,1.1)', offset: .7 }, { opacity: 0, transform: 'scale(.5,.1)' }], 1500);
          anim(mm, [{ opacity: 1 }, { opacity: 0, offset: .15 }, { opacity: 0, offset: .85 }, { opacity: 1 }], 1500);
          anim(nod, [{ transform: 'none' }, { transform: 'translateY(-2.5px) rotate(-5deg)', offset: .4 }, { transform: 'translateY(-2px) rotate(-4deg)', offset: .7 }, { transform: 'none' }], 1600);
          twitch(0, 10, 900); twitch(1, 10, 900);
        };
        // one piece of business as he arrives
        function business(now) {
          const m = r.mood;
          r.lock = now + 900; gaze(0, 0);
          if (m === 'calibrating') { gaze(2.4, -1.4); r.lock = now + 1100; anim(nod, [{ transform: 'none' }, { transform: 'rotate(4deg)', offset: .4 }, { transform: 'rotate(4deg)', offset: .75 }, { transform: 'none' }], 1300); twitch(1, -14, 500); }
          else if (m === 'poor') { anim(nod, [{ transform: 'none' }, { transform: 'translateY(-3px)', offset: .3 }, { transform: 'translateY(4px)', offset: .62 }, { transform: 'none' }], 1400); twitch(0, 8, 900); twitch(1, 8, 900); shut(now + 300, 700); }
          else if (m === 'meh') yawn(now);
          else if (m === 'good') { anim(q('.gplate-thumb'), [{ transform: 'translate(-4px,16px)' }, { transform: 'translate(0,-2px)', offset: .6 }, { transform: 'none' }], 380, { easing: 'ease-out' }); anim(nod, [{ transform: 'none' }, { transform: 'translateY(4px) rotate(2deg)', offset: .35 }, { transform: 'translateY(-1px)', offset: .7 }, { transform: 'none' }], 480, { delay: 200 }); }
          else if (m === 'great') { anim(armsIn, [{ transform: 'none' }, { transform: 'translateY(-6px)', offset: .3 }, { transform: 'translateY(1.5px)', offset: .55 }, { transform: 'none' }], 420); anim(nod, [{ transform: 'none' }, { transform: 'translateY(-3px)', offset: .3 }, { transform: 'translateY(2px)', offset: .6 }, { transform: 'none' }], 520); twitch(0, -12); twitch(1, -12); r.bv += 1.6; }
          else if (m === 'superb') { toot(); r.nt = now + 3000; anim(nod, [{ transform: 'none' }, { transform: 'translateY(-7px) rotate(-3deg)', offset: .3 }, { transform: 'translateY(2px) rotate(1deg)', offset: .6 }, { transform: 'none' }], 560); twitch(0, -14); twitch(1, -14); }
          else if (m === 'pvp') { anim(nod, [{ transform: 'none' }, { transform: 'translateY(3px) scale(1.07)', offset: .45 }, { transform: 'translateY(3px) scale(1.07)', offset: .75 }, { transform: 'none' }], 1300); twitch(0, -10, 500); twitch(1, -10, 500); }
          else if (m === 'levelup') { anim(q('.gplate-pump'), [{ transform: 'none' }, { transform: 'translateY(-7px)', offset: .2 }, { transform: 'none', offset: .45 }, { transform: 'translateY(-7px)', offset: .65 }, { transform: 'none' }], 900); anim(nod, [{ transform: 'none' }, { transform: 'translateY(-4px)', offset: .2 }, { transform: 'none', offset: .45 }, { transform: 'translateY(-4px)', offset: .65 }, { transform: 'none' }], 900); }
          else if (m === 'death') { anim(nod, [{ transform: 'none' }, { transform: 'translateY(4px) rotate(4deg)' }], 1000, { fill: 'forwards' }); shut(now + 500, 1500); }
          else if (m === 'achievement') { anim(nod, [{ transform: 'none' }, { transform: 'translateY(-4px) rotate(-2deg)', offset: .4 }, { transform: 'translateY(-3px) rotate(-2deg)', offset: .75 }, { transform: 'none' }], 1400); shut(now + 350, 500); }
        }

        const rot = (x, y, c, s) => [PX + (x - PX) * c - (y - PY) * s, PY + (x - PX) * s + (y - PY) * c];
        const seg = (a, b) => `M${a[0].toFixed(1)},${a[1].toFixed(1)}L${b[0].toFixed(1)},${b[1].toFixed(1)}`;
        const TOP = [[79, 109.7], [92, 111.5], [108, 111.5], [121, 109.7]], RIMP = [[53, 188], [72, 190], [128, 190], [147, 188]];

        r.step = (now, f) => {
          const dt = Math.min(50, r.last ? now - r.last : 16), k16 = dt / 16; r.last = now;
          const t = now + r.ph, m = M[r.mood], e = 1 - Math.exp(-dt * .008);
          r.hy += (m.hy - r.hy) * e; r.ht += (m.ht - r.ht) * e; r.by += (m.by - r.by) * e;
          const breath = Math.sin(t * .0021), lean = f.lean, swing = f.swing;
          const envA = lean * 1.1 + Math.sin(t * .0013) * .5, carA = swing * .55, bw = breath * .004;
          env.style.transform = `rotate(${envA.toFixed(2)}deg) scale(${(1 + bw).toFixed(4)},${(1 - bw).toFixed(4)})`;
          car.style.transform = `rotate(${carA.toFixed(2)}deg)`;
          head.style.transform = `translateY(${(r.hy - breath * .9).toFixed(2)}px) rotate(${(r.ht - swing * .3 + Math.sin(t * .0009) * .8).toFixed(2)}deg)`;
          body.style.transform = `translateY(${(r.by - breath * .5).toFixed(2)}px)`;
          // flame and glow
          const fs = .32 + f.burn * 1.3 + (r.puff > now ? .6 : 0);
          r.fs += (fs - r.fs) * Math.min(1, dt * .012);
          fl.style.transform = `scale(${(.72 + r.fs * .3).toFixed(3)},${r.fs.toFixed(3)})`;
          glow.style.opacity = (Math.min(1, .22 + r.fs * .5) * (r.go || 1)).toFixed(2);
          // ropes: envelope to basket, hinged at both ends
          const ea = envA * Math.PI / 180, ca = carA * Math.PI / 180, ec = Math.cos(ea), es = Math.sin(ea), cc = Math.cos(ca), cs = Math.sin(ca);
          let d = '';
          for (let i = 0; i < 4; i++) d += seg(rot(TOP[i][0], TOP[i][1], ec, es), rot(RIMP[i][0], RIMP[i][1], cc, cs));
          rp[0].setAttribute('d', d); rp[1].setAttribute('d', d);
          // the plank: a two-rope pendulum under the spreader bar
          r.sv += ((swing * 2.6 - r.th) * .022 - r.sv * .15) * k16; r.th += r.sv * k16;
          r.bv += (-r.bump * .22 - r.bv * .22) * k16; r.bump += r.bv * k16;
          const th = r.th * Math.PI / 180, L = L0 + r.bump;
          const a1 = rot(20, 247, cc, cs), a2 = rot(180, 247, cc, cs);
          const ox = L * Math.sin(th), oy = L * Math.cos(th);
          const b1 = [a1[0] + ox, a1[1] + oy], b2 = [a2[0] + ox, a2[1] + oy];
          d = seg(a1, b1) + seg(a2, b2);
          rp[2].setAttribute('d', d); rp[3].setAttribute('d', d);
          sign.style.transform = `translate(${((b1[0] + b2[0]) / 2 - 100).toFixed(2)}px,${((b1[1] + b2[1]) / 2 + 4).toFixed(2)}px) rotate(${carA.toFixed(2)}deg)`;
          // what trails
          const trail = (swing * 1.7 + Math.sin(t * .0023) * 1.5).toFixed(2);
          bagL.style.transform = bagR.style.transform = tag.style.transform = `rotate(${trail}deg)`;
          strL.style.transform = `rotate(${(swing * 2.2 - envA + Math.sin(t * .003) * 3).toFixed(2)}deg)`;
          strR.style.transform = `rotate(${(swing * 2.2 - envA + Math.sin(t * .0027 + 1) * 3).toFixed(2)}deg)`;
          if (ctx.reduced) return;
          // phases
          if (!r.arrived) { if (f.phase === 'read') { r.arrived = true; business(now); } else gaze(.4, -1.7); }
          if (f.phase === 'leave' && !r.left) { r.left = true; r.puff = now + 450; gaze(.3, -1.8); r.lock = now + 1500; }
          // the small life: blinks, glances, ears, hands
          if (r.bkEnd && now > r.bkEnd) { hs.classList.remove('gplate-shut'); r.bkEnd = 0; }
          if (now > r.nb) { shut(now, 110); r.nb = now + 2000 + rnd() * 3600; if (rnd() < .25) r.nb2 = now + 250; }
          if (r.nb2 && now > r.nb2) { shut(now, 100); r.nb2 = 0; }
          if (r.arrived && now > r.ng && now > r.lock) {
            const p = rnd();
            if (p < .38) gaze(0, 0); else if (p < .66) gaze((rnd() - .5) * 1.2, 1.7); else if (p < .8) gaze(.5, -1.7); else gaze(rnd() < .5 ? -2.6 : 2.6, .2);
            r.ng = now + 900 + rnd() * 2200;
          }
          if (now > r.ne) { const i = rnd() < .5 ? 0 : 1; twitch(i, (rnd() < .5 ? -1 : 1) * (6 + rnd() * 6), 280); if (rnd() < .3) twitch(1 - i, 6, 340); r.ne = now + 2200 + rnd() * 4200; }
          if (now > r.nh) { anim(armsIn, [{ transform: 'none' }, { transform: `translate(${rnd() < .5 ? -1.6 : 1.6}px,-.8px)`, offset: .4 }, { transform: 'none' }], 700); r.nh = now + 4000 + rnd() * 5000; }
          if (r.arrived && r.mood === 'superb' && now > r.nt) { toot(); r.nt = now + 3000; }
          if (r.arrived && r.mood === 'meh' && isStill && now > r.ny) { yawn(now); r.ny = now + 7000 + rnd() * 3000; }
        };
        r.set = (nn, joined) => {
          const mood = M[nn.mood] ? nn.mood : 'calibrating', was = r.mood;
          r.mood = mood; el.dataset.mood = mood; el.dataset.kind = nn.kind; el.dataset.sky = ctx.skyMode();
          r.go = { night: 1, dusk: .75, day: .3, overcast: .45 }[ctx.skyMode()] || 1;
          fillSign(r, nn);
          if (joined) {
            r.bv += 2.6; r.sv += (rnd() < .5 ? -1 : 1) * 1.6;
            const now = performance.now();
            if (mood !== was) { twitch(0, -12, 420); twitch(1, -12, 420); if (r.arrived) business(now); } else { gaze(0, 1.7); r.lock = now + 600; }
          }
        };
        r.set(n, false);
        if (isStill && n.more) el.style.height = (H + 28) + 'px';
        if (isStill) { r.hy = M[r.mood].hy; r.ht = M[r.mood].ht; r.by = M[r.mood].by; }
        else { r.hy = M[r.mood].hy + 2; r.by = M[r.mood].by; }
        return r;
      }

      const tick = (now) => {
        raf = 0;
        for (const r of stills) {
          if (!r.el.isConnected) { if (r.seen || now - r.born > 3000) stills.delete(r); continue; }
          r.seen = true;
          r.step(now, { lean: Math.sin(now * .0007 + r.ph) * .9, swing: Math.sin(now * .0011 + r.ph * 2) * 2.4, phase: 'read', burn: .14 + .05 * Math.sin(now * .002 + r.ph) });
        }
        if (stills.size && !ctx.reduced) raf = requestAnimationFrame(tick);
      };

      return {
        show(n) {
          const r = build(n, false);
          const fl = ctx.fly(r.el, { w: 200, h: H + 30, frame: (f) => r.step(performance.now(), f) });
          flights.add(fl); fl.gone.then(() => flights.delete(fl));
          return { update(nn) { r.set(nn, true); fl.extend(700); } };
        },
        still(n) {
          const r = build(n, true);
          r.step(performance.now(), { lean: 0, swing: 0, phase: 'read', burn: .15 });
          stills.add(r);
          if (!raf && !ctx.reduced) raf = requestAnimationFrame(tick);
          return r.el;
        },
        clear() { for (const fl of [...flights]) fl.end(); flights.clear(); },
      };
    },
  });
})();
