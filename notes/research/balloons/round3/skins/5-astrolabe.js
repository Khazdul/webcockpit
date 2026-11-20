// Round 3, direction 5: "The Astrolabe". An astronomer's brass instrument
// hangs low in the sky and takes the measure of the deed: the rete turns, the
// alidade swings over a five-step scale and settles on the rating, and the
// news is engraved on a silvered plate hung under it by two chains.
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 214, H = 203, CX = 107, CY = 116, R = 85, SLOT = 318;
  const f = (v) => Math.round(v * 100) / 100;
  const rad = (a) => a * Math.PI / 180;
  const pt = (a, r, ox = CX, oy = CY) => f(ox + r * Math.cos(rad(a))) + ',' + f(oy + r * Math.sin(rad(a)));
  const arc = (r, a0, a1, sw = 1) => `M${pt(a0, r)}A${r},${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} ${sw} ${pt(a1, r)}`;
  const range = (a0, a1, st) => { const o = []; for (let a = a0; a <= a1 + 1e-6; a += st) o.push(a); return o; };
  const ticks = (list, r0, r1) => list.map((a) => `M${pt(a, r0)}L${pt(a, r1)}`).join('');
  const circ = (x, y, r) => `M${f(x - r)},${f(y)}a${r},${r} 0 1 0 ${2 * r},0a${r},${r} 0 1 0 ${-2 * r},0`;
  const glint = (L, k) => `M0,${-L}Q${k},${-k} ${L},0Q${k},${k} 0,${L}Q${-k},${k} ${-L},0Q${-k},${-k} 0,${-L}Z`;
  const spiky = (n, Ro, ri) => { let d = ''; for (let i = 0; i < n * 2; i++) { const a = rad(-90 + i * 180 / n), q = i % 2 ? ri : Ro; d += (i ? 'L' : 'M') + f(Math.cos(a) * q) + ',' + f(Math.sin(a) * q); } return d + 'Z'; };

  // ---- the engraving of the mater, drawn once ----
  const S0 = -150, STEP = 24, WORDS = ['Poor', 'Meh', 'Good', 'Great', 'Superb'];
  const deg = range(-180, 178, 2);
  const LIMB = [
    ticks(deg.filter((a) => a % 10), 82.7, 84.4), ticks(deg.filter((a) => !(a % 10)), 81, 84.4),
    ticks(range(S0, -30, 2.4), 67.6, 69.3), ticks(range(S0 + 12, -30, STEP), 67.6, 70.8), ticks(range(S0, -30, STEP), 67.6, 80.4),
    ticks(range(0, 40, 1).map((i) => 16 + 148 * Math.log(1 + 9 * i / 40) / Math.LN10), 67.6, 69.5),
    ticks(range(0, 40, 5).map((i) => 16 + 148 * Math.log(1 + 9 * i / 40) / Math.LN10), 67.6, 71.2),
    arc(80.4, -179.9, 179.9), arc(72.4, -179.9, 179.9), arc(84.5, -179.9, 179.9),
  ].join('');
  const TYMP = [62, 43, 27].map((r) => circ(0, 0, r)).join('') + [0, 1, 2, 3, 4].map((i) => circ(0, -14 - 3.2 * i, 50 - 9.5 * i)).join('')
    + 'M-66,0H66M0,-66V66' + [-3, -2, -1, 1, 2, 3].map((k) => `M0,-30Q${k * 16},0 ${k * 23},62`).join('');
  const RETE_W = circ(0, 0, 62.6) + circ(0, -17, 44);
  const RETE_T = 'M-62,0H62' + circ(0, 0, 8.6) + 'M-39,49C-34,30 -12,34 0,19C12,34 34,30 39,49M0,8.6V19' + circ(0, 39.5, 5) + 'M0,44.5V62';
  const ECL = range(0, 350, 10).map((a) => `M${pt(a, a % 30 ? 44.4 : 42, 0, -17)}L${pt(a, 46, 0, -17)}`).join('');
  const THORNS = [[-38, 5, -53, 17, .28], [38, 5, 51, 20, -.28], [-36, -42, -21, -31, .3], [34, -45, 19, -37, -.3], [-24, 0, -29, -17, .3], [23, 0, 31, -14, -.3], [-47, 40, -33, 33, -.3], [50, 36, 37, 41, .3], [-14.3, 24.6, -21, 39, .25]];
  const RING = range(0, 11, 1).map((i) => { const a = 15 + i * 30; return [61 * Math.cos(rad(a)), 61 * Math.sin(rad(a)), 49 * Math.cos(rad(a + 7)), 49 * Math.sin(rad(a + 7)), .3]; });
  const NOVA = [12.1, -59.3, 19, -27, -.16];
  const thorn = ([bx, by, tx, ty, bend], w = 2.5) => {
    const dx = tx - bx, dy = ty - by, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L, mx = (bx + tx) / 2 + nx * bend * L, my = (by + ty) / 2 + ny * bend * L;
    return `M${f(bx + nx * w)},${f(by + ny * w)}Q${f(mx + nx * w * .5)},${f(my + ny * w * .5)} ${f(tx)},${f(ty)}Q${f(mx - nx * w * .6)},${f(my - ny * w * .6)} ${f(bx - nx * w)},${f(by - ny * w)}Z`;
  };
  const band = (i) => { const a0 = S0 + STEP * i, a1 = a0 + STEP; return `M${pt(a0, 80.4)}A80.4,80.4 0 0 1 ${pt(a1, 80.4)}L${pt(a1, 72.4)}A72.4,72.4 0 0 0 ${pt(a0, 72.4)}Z`; };
  const COG = (() => { let d = ''; for (let i = 0; i < 16; i++) { const a0 = i * 22.5 - 6, a1 = i * 22.5 + 6, r = i % 2 ? 3.3 : 5; d += (i ? 'L' : 'M') + pt(a0, r, 0, 0) + 'L' + pt(a1, r, 0, 0); } return d + 'Z' + circ(0, 0, 1.3); })();
  const STOP_L = -163, STOP_R = -7;
  const TARGET = { poor: -144, meh: -114, good: -90, great: -66, superb: -42, pvp: -19, calibrating: -90, levelup: -90, death: -270, achievement: -90 };
  const SWING = {
    poor: [1250, [0, STOP_L], [.3, -146, 'ease-out'], [.48, -139], [.74, -145.5], [1, -144]],
    meh: [1250, [0, STOP_L], [.42, -103], [.66, -118], [.85, -112.5], [1, -114]],
    good: [1250, [0, STOP_L], [.44, -75], [.68, -96], [.86, -88], [1, -90]],
    great: [1250, [0, STOP_L], [.46, -50], [.7, -72], [.87, -64], [1, -66]],
    superb: [1480, [0, STOP_L, 'cubic-bezier(.45,0,.9,.55)'], [.36, STOP_R, 'ease-out'], [.4, -13], [.44, STOP_R], [.48, -10], [.7, -49], [.86, -39.5], [1, -42]],
    pvp: [900, [0, STOP_L, 'cubic-bezier(.7,0,1,.5)'], [.24, -15, 'ease-out'], [.34, -24], [.46, -17], [.6, -20.5], [1, -19]],
    calibrating: [1500, [0, STOP_L], [.34, -56], [.6, -124], [.82, -70], [1, -108]],
    levelup: [1200, [0, STOP_L], [.5, -78], [.76, -94], [1, -90]],
    achievement: [1200, [0, STOP_L], [.5, -78], [.76, -94], [1, -90]],
    death: [2300, [0, STOP_L], [.2, -118, 'ease-out'], [.36, -127, 'cubic-bezier(.6,0,1,.6)'], [.72, -270, 'ease-out'], [.82, -258], [.9, -270], [.95, -266], [1, -270]],
  };
  const NOTE = { poor: 'hardly worth the brass', meh: 'within tolerance', good: 'a fair reading', great: 'checked twice', superb: 'off the scale', pvp: 'the Eye takes note', calibrating: '? · not yet determined', levelup: 'a new star, duly fixed', death: 'the mechanism has run down', achievement: '' };
  const GL = { poor: .6, meh: .8, good: 1, great: 1.15, superb: 1.25, pvp: .9, calibrating: .75, levelup: 1.1, death: .9, achievement: 1.1 };

  const CART = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='${NS}' width='60' height='60'><defs><linearGradient id='g' x1='0' y1='0' x2='.12' y2='1'><stop offset='0' stop-color='#f3e8c2'/><stop offset='.45' stop-color='#e0cc93'/><stop offset='.62' stop-color='#ebdba9'/><stop offset='1' stop-color='#c2a662'/></linearGradient></defs><path d='M9,1.5H51A7.5,7.5 0 0 0 58.5,9V51A7.5,7.5 0 0 0 51,58.5H9A7.5,7.5 0 0 0 1.5,51V9A7.5,7.5 0 0 0 9,1.5Z' fill='url(#g)' stroke='#2a1905' stroke-width='1.2'/><path d='M11,4.6H49A9,9 0 0 0 55.4,11V49A9,9 0 0 0 49,55.4H11A9,9 0 0 0 4.6,49V11A9,9 0 0 0 11,4.6Z' fill='none' stroke='#4a3009' stroke-opacity='.7' stroke-width='.7'/><path d='M9,2.6H51' stroke='#fffbe6' stroke-opacity='.8' stroke-width='.8'/></svg>`)}")`;
  Harness.css('astrolabe', `
.astrolabe{position:absolute;left:0;top:0;width:${W}px;--af:brightness(1);--ag:1;font-family:"Cormorant Garamond",Georgia,serif}
.astrolabe[data-sky=night]{--af:brightness(.86) saturate(.9)}
.astrolabe[data-sky=dusk]{--af:sepia(.18) saturate(1.12) brightness(.95)}
.astrolabe[data-sky=overcast]{--af:saturate(.82) brightness(.94)}
.astrolabe.astrolabe-dead{--af:grayscale(1) sepia(.5) hue-rotate(172deg) saturate(.75) brightness(.62) contrast(1.08)}
.astrolabe-rig{transform-origin:50% 8px}
.astrolabe-inst{position:relative;width:${W}px;height:${H}px}
.astrolabe-inst svg{position:absolute;left:0;top:0;overflow:visible;display:block}
.astrolabe-m,.astrolabe-limb,.astrolabe-tymp,.astrolabe-back{filter:var(--af);transition:filter 1.7s ease}
.astrolabe-plate{transition:filter 1.7s ease}
.astrolabe-limb,.astrolabe-tymp,.astrolabe-spec{position:absolute;border-radius:50%}
.astrolabe-limb{left:${CX - R}px;top:${CY - R}px;width:${2 * R}px;height:${2 * R}px;
  background:radial-gradient(circle at 20% 84%,rgba(64,150,124,.36),rgba(64,150,124,0) 20%),radial-gradient(circle at 88% 66%,rgba(64,150,124,.34),rgba(64,150,124,0) 13%),
  repeating-conic-gradient(rgba(255,250,220,.07) 0 .8deg,rgba(40,20,0,.07) .8deg 1.6deg),
  conic-gradient(from 205deg,#f7e6ab,#c89a45 11%,#8c6426 23%,#b88b3c 32%,#ecd389 41%,#fff3c6 47%,#d9b25c 55%,#94692a 67%,#6f4c1a 76%,#a97c33 86%,#e2c478 94%,#f7e6ab);
  box-shadow:0 0 0 1px #261704,0 4px 9px rgba(0,0,0,.5),inset 0 0 0 1.3px rgba(255,238,176,.6),inset 0 -2px 3px rgba(60,30,0,.45)}
.astrolabe-spec{left:${CX - R}px;top:${CY - R}px;width:${2 * R}px;height:${2 * R}px;mix-blend-mode:screen;
  background:conic-gradient(from 0deg,rgba(255,250,225,0) 0 292deg,rgba(255,250,225,.5) 326deg,rgba(255,250,225,0) 360deg);transform:rotate(190deg)}
.astrolabe[data-sky=night] .astrolabe-spec{background:conic-gradient(from 0deg,rgba(205,225,255,0) 0 292deg,rgba(205,225,255,.5) 326deg,rgba(205,225,255,0) 360deg)}
.astrolabe-dead .astrolabe-spec{opacity:.35}
.astrolabe-tymp{left:${CX - 67}px;top:${CY - 67}px;width:134px;height:134px;
  background:radial-gradient(circle at 26% 82%,rgba(60,140,118,.4),rgba(60,140,118,0) 24%),repeating-conic-gradient(rgba(255,250,220,.05) 0 1deg,rgba(40,20,0,.06) 1deg 2deg),
  conic-gradient(from 80deg,#93712f,#5c4218 14%,#7f5f25 28%,#b3924c 40%,#6b4f20 55%,#45300e 70%,#755824 85%,#93712f);
  box-shadow:inset 0 3px 6px rgba(20,10,0,.8),inset 0 0 0 1px #261704,0 0 0 .8px rgba(255,238,176,.55)}
.astrolabe-eng{fill:none;stroke:#2c1b05;stroke-width:.55}
.astrolabe-lip{fill:none;stroke:rgba(255,244,200,.55);stroke-width:.55}
.astrolabe-te{fill:none;stroke:#2a1904;stroke-width:.5;opacity:.6}
.astrolabe-w{font:600 6.6px "Cormorant SC","Cormorant Garamond",Georgia,serif;letter-spacing:.5px;fill:#2a1804;text-anchor:middle}
.astrolabe-w.astrolabe-on{fill:#7c1206}
.astrolabe-act{fill:#fbf3d6;opacity:.8}
.astrolabe-abs{font:600 5.6px "Cormorant SC","Cormorant Garamond",Georgia,serif;letter-spacing:1.25px;fill:#2a1804;text-anchor:middle;opacity:.85}
.astrolabe-moon{fill:none;stroke:rgba(200,220,255,.8);stroke-width:1;stroke-linecap:round;display:none}
.astrolabe[data-sky=night] .astrolabe-moon{display:inline}
.astrolabe-cast{filter:drop-shadow(1.2px 2.2px 1.1px rgba(15,7,0,.6))}
.astrolabe-drift{animation:astrolabe-drift 170s linear infinite}
.astrolabe-ali{transform:rotate(-90deg)}
.astrolabe-gl{transition:opacity 1.6s}
.astrolabe-gp{fill:#fffdf2;transform:scale(var(--ag))}
.astrolabe-big .astrolabe-gp{transform:scale(2.1);fill:#fff1b8}
.astrolabe-halo{opacity:0}
.astrolabe .astrolabe-big .astrolabe-halo{opacity:1;transform:scale(1.7)}
.astrolabe[data-sky=night] .astrolabe-halo{opacity:.95}
.astrolabe[data-sky=dusk] .astrolabe-halo{opacity:.6}
.astrolabe[data-sky=day] .astrolabe-gp,.astrolabe[data-sky=overcast] .astrolabe-gp{fill:#fff8dc;stroke:rgba(60,35,0,.5);stroke-width:.35}
.astrolabe[data-sky=night] .astrolabe-gl{animation:astrolabe-tw 3.4s ease-in-out infinite alternate}
.astrolabe.astrolabe-dead .astrolabe-gl{opacity:0;animation:none}
.astrolabe.astrolabe-dead .astrolabe-gl.astrolabe-last{opacity:1}
.astrolabe-dead .astrolabe-last .astrolabe-halo{opacity:.9}
.astrolabe-eyeglow{animation:astrolabe-eye 1.7s ease-in-out infinite alternate}
.astrolabe-arm{opacity:0}
.astrolabe-arm ellipse{vector-effect:non-scaling-stroke;fill:none}
.astrolabe-digit{font:600 8.4px "JetBrains Mono",monospace;fill:#1b1207;text-anchor:middle}
@keyframes astrolabe-drift{to{transform:rotate(360deg)}}
@keyframes astrolabe-tw{from{opacity:.7}to{opacity:1}}
@keyframes astrolabe-eye{from{opacity:.55}to{opacity:1}}
.astrolabe-plate{position:relative;box-sizing:border-box;width:204px;margin:4px auto 0;padding:0 3px;text-align:center;color:#24160a;display:flex;flex-direction:column;align-items:center;
  transform-origin:50% -14px;border:8px solid transparent;border-image:${CART} 20 fill/14px stretch;text-shadow:0 .7px 0 rgba(255,251,228,.75);
  filter:var(--af) drop-shadow(0 3px 3px rgba(0,0,0,.45));
  background:linear-gradient(100deg,rgba(255,255,255,0) 28%,rgba(255,253,240,.5) 44%,rgba(255,255,255,0) 60%) padding-box,repeating-linear-gradient(0deg,rgba(255,250,225,.12) 0 1px,rgba(70,45,10,.05) 1px 2px) padding-box}
.astrolabe[data-sky=night] .astrolabe-plate{filter:var(--af) drop-shadow(-.8px -.8px 0 rgba(200,220,255,.6)) drop-shadow(0 3px 3px rgba(0,0,0,.45))}
.astrolabe-plate i{position:absolute;top:-13px;width:6px;height:8px;box-sizing:border-box;border:1.5px solid #8a6424;border-radius:50%;box-shadow:0 0 0 .7px #261704,inset 0 0 0 .6px #261704;background:none}
.astrolabe-plate i:nth-of-type(1){left:${CX - 56 - 5 - 8 - 3}px}
.astrolabe-plate i:nth-of-type(2){left:${CX + 56 - 5 - 8 - 3}px}
.astrolabe-plate>div:empty,.astrolabe-plate span:empty{display:none}
.astrolabe-t{font:italic 600 18px/1.08 "Cormorant Garamond",Georgia,serif;text-wrap:balance;overflow-wrap:anywhere}
.astrolabe-b{font:600 31px/1 "Cormorant Garamond",Georgia,serif;font-variant-numeric:lining-nums;white-space:nowrap;margin-top:1px}
.astrolabe-u{font:italic 500 15.5px/1 "Cormorant Garamond",Georgia,serif;margin-left:5px;opacity:.78}
.astrolabe-r{display:flex;flex-wrap:wrap;justify-content:center;align-items:baseline;gap:0 6px;margin-top:2px}
.astrolabe-l{font:400 12.5px/1.25 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.22em;margin-right:-.1em;text-transform:uppercase}
.astrolabe-n{font:italic 400 12.5px/1.25 "IM Fell English",Georgia,serif;opacity:.82}
.astrolabe-l:not(:empty)+.astrolabe-n:not(:empty)::before{content:"—";margin-right:5px;opacity:.6}
.astrolabe-o{font:italic 500 13.5px/1.12 "Cormorant Garamond",Georgia,serif;opacity:.86;margin-top:3px;text-wrap:balance}
.astrolabe[data-mood=pvp] .astrolabe-l{color:#8a1608}
.astrolabe[data-kind=death] .astrolabe-b{font:400 22px/1.2 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.2em;margin-right:-.2em;text-transform:uppercase}
.astrolabe[data-kind=death] .astrolabe-n{font:400 10.5px/1.3 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.2em;text-transform:uppercase;font-style:normal}
.astrolabe[data-kind=levelup] .astrolabe-b{font-size:32px}
.astrolabe[data-kind=achievement] .astrolabe-r{order:-1;margin:0 0 2px}
.astrolabe[data-kind=achievement] .astrolabe-t{font:italic 500 15px/1.14 "Cormorant Garamond",Georgia,serif}
`);

  Harness.register({
    id: 'astrolabe',
    name: 'The Astrolabe',
    blurb: 'An astronomer’s brass instrument hangs low in the sky and takes the measure of the deed. Its rete turns, the alidade swings across the scale, overshoots, trembles and settles on the rating; the news is engraved on the plate chained under it. Then it folds flat and is gone. One of its scales has a purpose nobody remembers.',
    create(ctx) {
      let uid = 0;
      const live = new Set(), queue = [], slots = [];
      const D = () => 1 / (ctx.pace() || 1);

      function build(n) {
        const u = ++uid, kind = n.kind, isKill = kind === 'kill';
        const root = ctx.el('div', 'astrolabe');
        root.dataset.sky = ctx.skyMode(); root.dataset.mood = n.mood; root.dataset.kind = kind;
        root.style.setProperty('--ag', GL[n.mood] || 1);
        if (kind === 'death') root.classList.add('astrolabe-dead');
        const rig = ctx.el('div', 'astrolabe-rig'), inst = ctx.el('div', 'astrolabe-inst');
        const grads = `<linearGradient id="ab${u}" gradientUnits="userSpaceOnUse" x1="30" y1="10" x2="185" y2="215"><stop offset="0" stop-color="#fbeeb8"/><stop offset=".26" stop-color="#d9b560"/><stop offset=".5" stop-color="#a87a2e"/><stop offset=".72" stop-color="#e3c476"/><stop offset="1" stop-color="#8a6224"/></linearGradient>
<linearGradient id="ar${u}" gradientUnits="userSpaceOnUse" x1="-55" y1="-60" x2="50" y2="65"><stop offset="0" stop-color="#fff6cf"/><stop offset=".35" stop-color="#eccf80"/><stop offset=".62" stop-color="#c99f48"/><stop offset="1" stop-color="#f0d68e"/></linearGradient>
<linearGradient id="aw${u}" gradientUnits="userSpaceOnUse" x1="0" y1="-5" x2="0" y2="5"><stop offset="0" stop-color="#fff5cc"/><stop offset=".42" stop-color="#dcb963"/><stop offset="1" stop-color="#85601f"/></linearGradient>
<linearGradient id="as${u}" gradientUnits="userSpaceOnUse" x1="0" y1="-3.4" x2="0" y2="3.4"><stop offset="0" stop-color="#8fa6d6"/><stop offset=".45" stop-color="#2b3c66"/><stop offset="1" stop-color="#0d1530"/></linearGradient>
<radialGradient id="ap${u}" cx=".36" cy=".3" r=".8"><stop offset="0" stop-color="#fff8d8"/><stop offset=".45" stop-color="#cfa44c"/><stop offset="1" stop-color="#5a3d12"/></radialGradient>
<radialGradient id="ae${u}"><stop offset="0" stop-color="#ff5a30" stop-opacity=".95"/><stop offset=".3" stop-color="#ff3a1c" stop-opacity=".5"/><stop offset="1" stop-color="#ff3a1c" stop-opacity="0"/></radialGradient>
<radialGradient id="ah${u}"><stop offset="0" stop-color="#eaf1ff" stop-opacity=".9"/><stop offset=".3" stop-color="#cfe0ff" stop-opacity=".32"/><stop offset="1" stop-color="#cfe0ff" stop-opacity="0"/></radialGradient>
<clipPath id="ac${u}"><circle r="66"/></clipPath><clipPath id="ao${u}"><rect x="${CX - 6.5}" y="19.6" width="13" height="9"/></clipPath>`;
        const medal = kind === 'achievement' ? `<g transform="translate(${pt(22, 78)}) rotate(22)"><g class="astrolabe-medal"><rect x="-2" y="-1.7" width="14" height="3.4" rx="1.2" fill="url(#ab${u})" stroke="#261704" stroke-width=".7"/>
<g transform="translate(22,0)"><circle r="14.5" fill="url(#ap${u})" stroke="#261704" stroke-width=".9"/><circle r="12.9" fill="none" stroke="#3a2507" stroke-width="1" stroke-dasharray=".1 2.6" stroke-linecap="round"/><circle r="10.8" fill="none" stroke="#3a2507" stroke-width=".5"/>
<path d="${spiky(8, 8.8, 3.5)}" transform="rotate(-22)" fill="#f6e3a2" stroke="#2c1b05" stroke-width=".7" stroke-linejoin="round"/><circle r="1.5" fill="#8a1608" stroke="#2c1b05" stroke-width=".5"/></g><circle r="2.3" fill="url(#ap${u})" stroke="#261704" stroke-width=".6"/></g></g>` : '';
        const chain = (x) => `<path d="M${x},${CY + 58}V${H + 9}" stroke="#261704" stroke-width="3.3" stroke-dasharray="3.7 1.5" stroke-linecap="round"/><path d="M${x},${CY + 58}V${H + 9}" stroke="#d9b869" stroke-width="1.7" stroke-dasharray="3.7 1.5" stroke-linecap="round"/><path d="M${x - .5},${CY + 58}V${H + 9}" stroke="#fff3c4" stroke-width=".6" stroke-dasharray="1.6 3.6" stroke-linecap="round"/>`;
        const back = ctx.svg(`<svg class="astrolabe-back" xmlns="${NS}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><defs>${grads.replace(/id="a(\w)(\d+)"/g, 'id="a$1b$2"')}</defs>${chain(CX - 56)}${chain(CX + 56)}${medal.replace(/url\(#a(\w)(\d+)\)/g, 'url(#a$1b$2)')}</svg>`);

        const thorns = kind === 'achievement' ? RING : THORNS;
        const lastLit = 2;
        const gl = (t, i, cls = '') => `<g transform="translate(${f(t[2])},${f(t[3])})"><g class="astrolabe-gl${i === lastLit ? ' astrolabe-last' : ''}${cls}" style="animation-delay:-${(i * 1.37 % 3.4).toFixed(2)}s"><circle class="astrolabe-halo" r="${i === lastLit ? 9 : 7}" fill="url(#ah${u})"/><path class="astrolabe-gp" d="${glint(i % 3 ? 4.6 : 6, .75)}"/></g></g>`;
        const strokes = (d, w) => `<path d="${d}" stroke="#241503" stroke-width="${w + 1.3}"/><path d="${d}" stroke="url(#ar${u})" stroke-width="${w}"/><path d="${d}" stroke="#fffbe0" stroke-width=".55" opacity=".7" transform="translate(-.45,-.55)"/>`;
        const window = isKill
          ? `<rect x="${CX - 7.6}" y="18.5" width="15.2" height="11.2" rx="1.4" fill="#1c1206"/><rect x="${CX - 6.5}" y="19.6" width="13" height="9" fill="#efe6c8"/><g clip-path="url(#ao${u})" class="astrolabe-odo"><text class="astrolabe-digit" x="${CX}" y="27.2"></text></g><rect x="${CX - 6.5}" y="19.6" width="13" height="2.6" fill="rgba(30,18,4,.38)"/><rect x="${CX - 6.5}" y="26.4" width="13" height="2.2" fill="rgba(30,18,4,.22)"/>`
          : `<path d="${circ(CX, 21.2, 1.9)}${circ(CX - 3.8, 26.4, 1.9)}${circ(CX + 3.8, 26.4, 1.9)}" fill="#1c1206" stroke="#fff3c4" stroke-width=".35"/>`;
        const moodI = WORDS.findIndex((w) => w.toLowerCase() === n.mood);
        const front = ctx.svg(`<svg xmlns="${NS}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><defs>${grads}
${WORDS.map((w, i) => `<path id="aq${u}_${i}" d="${arc(74.1, S0 + STEP * i + .6, S0 + STEP * (i + 1) - .6)}"/>`).join('')}<path id="al${u}" d="${arc(78.7, 164, 16, 0)}"/></defs>
<g class="astrolabe-m">
 <circle cx="${CX}" cy="8" r="5.8" fill="none" stroke="#241503" stroke-width="3.7"/><circle cx="${CX}" cy="8" r="5.8" fill="none" stroke="url(#ab${u})" stroke-width="2.4"/><path d="${arc(5.8, 180, 300).replace(/M[\d.,-]+A/, `M${pt(180, 5.8, CX, 7.6)}A`).replace(/[\d.]+,[\d.]+$/, pt(300, 5.8, CX, 7.6))}" fill="none" stroke="#fffbe0" stroke-width=".7" opacity=".8"/>
 <path d="M${CX - 27},37.6C${CX - 25},28 ${CX - 15},31 ${CX - 12.5},21.5C${CX - 10.5},15 ${CX - 6},16.5 ${CX - 4.6},13.2A4.9,4.9 0 1 1 ${CX + 4.6},13.2C${CX + 6},16.5 ${CX + 10.5},15 ${CX + 12.5},21.5C${CX + 15},31 ${CX + 25},28 ${CX + 27},37.6A83,83 0 0 0 ${CX - 27},37.6Z" fill="url(#ab${u})" stroke="#241503" stroke-width=".9" stroke-linejoin="round"/>
 <path d="M${CX - 23.5},35.2C${CX - 21},29.5 ${CX - 13.5},31.5 ${CX - 10.5},23M${CX + 23.5},35.2C${CX + 21},29.5 ${CX + 13.5},31.5 ${CX + 10.5},23" fill="none" stroke="#2c1b05" stroke-width=".5" opacity=".75"/>
 <circle cx="${CX}" cy="11.6" r="1.7" fill="#140c02" stroke="#fff3c4" stroke-width=".35"/>${window}
 ${moodI >= 0 ? `<path class="astrolabe-act" d="${band(moodI)}"/>` : '<path class="astrolabe-act" d="" style="display:none"/>'}<path class="astrolabe-lip" d="${LIMB}" transform="translate(.35,.45)"/><path class="astrolabe-eng" d="${LIMB}"/>
 ${WORDS.map((w, i) => `<text class="astrolabe-w${i === moodI ? ' astrolabe-on' : ''}"><textPath href="#aq${u}_${i}" startOffset="50%">${w}</textPath></text>`).join('')}
 <text class="astrolabe-abs"><textPath href="#al${u}" startOffset="50%">scale of uncertain purpose</textPath></text>
 <g transform="translate(${pt(-19, 76.3)}) rotate(71)"><path d="M-4.6,0Q0,-3.6 4.6,0Q0,3.6 -4.6,0Z" fill="#f6e3a2" stroke="#2c1b05" stroke-width=".55"/><circle r="1.5" fill="#a81c0a" stroke="#2c1b05" stroke-width=".4"/></g>
 ${[-171, -11, 3, 177].map((a) => `<circle cx="${pt(a, 76.4).split(',')[0]}" cy="${pt(a, 76.4).split(',')[1]}" r=".75" fill="#2c1b05"/>`).join('')}
 <g transform="translate(${CX},${CY})"><path class="astrolabe-te" d="${TYMP}" clip-path="url(#ac${u})"/></g>
 ${[STOP_L - 2.6, STOP_R + 2.6].map((a) => `<circle cx="${pt(a, 69.9).split(',')[0]}" cy="${pt(a, 69.9).split(',')[1]}" r="2" fill="url(#ap${u})" stroke="#241503" stroke-width=".7"/>`).join('')}
</g>
<path class="astrolabe-moon" d="${arc(R + .3, -176, -104)}"/>
<g transform="translate(${CX},${CY})" class="astrolabe-cast"><g class="astrolabe-spin"><g class="${kind === 'death' ? '' : 'astrolabe-drift'}">
 <g class="astrolabe-m astrolabe-rete" fill="none" stroke-linecap="round">${strokes(RETE_T, 2.3)}${strokes(RETE_W, 3.6)}<path d="${ECL}" stroke="#2c1b05" stroke-width=".5"/>
  <path d="${thorns.map((t) => thorn(t)).join('')}" fill="url(#ar${u})" stroke="#241503" stroke-width=".75" stroke-linejoin="round"/>
  ${kind === 'levelup' ? `<path class="astrolabe-nova" d="${thorn(NOVA, 2.8)}" fill="url(#ar${u})" stroke="#241503" stroke-width=".75" stroke-linejoin="round"/>` : ''}</g>
 <g class="astrolabe-glints">${thorns.map((t, i) => gl(t, i)).join('')}${kind === 'levelup' ? `<g class="astrolabe-novag">${gl(NOVA, 0, ' astrolabe-big')}</g>` : ''}</g>
</g></g></g>
${kind === 'levelup' ? `<g transform="translate(${CX},${CY})" class="astrolabe-arm astrolabe-m">${[8, 68, 128].map((a) => `<g transform="rotate(${a})"><g class="astrolabe-el"><ellipse rx="62" ry="62" stroke="#241503" stroke-width="4.6"/><ellipse rx="62" ry="62" stroke="url(#ar${u})" stroke-width="3.2"/><ellipse rx="62" ry="62" stroke="#fffbe0" stroke-width=".6" opacity=".7"/></g></g>`).join('')}</g>` : ''}
<g transform="translate(${CX},${CY})" class="astrolabe-cast"><g class="astrolabe-ali"><g class="astrolabe-m">
 <path d="M-55,0L-50,-2.5L-9,-4.3A9.6,9.6 0 0 1 9,-4.3L50,-2.7L53.5,0L50,2.7L9,4.3A9.6,9.6 0 0 1 -9,4.3L-50,2.5Z" fill="url(#aw${u})" stroke="#241503" stroke-width=".8" stroke-linejoin="round"/>
 <path d="M50,-2.7L57,-3.9L71.6,0L57,3.9L50,2.7L53.5,0Z" fill="url(#as${u})" stroke="#0a1024" stroke-width=".7" stroke-linejoin="round"/><path d="M57.3,-2.6L68,-.2" stroke="#c9d8ff" stroke-width=".5" opacity=".8"/>
 <path d="M-46,0H-10M10,0H49" stroke="#2c1b05" stroke-width=".5"/><path d="M-46,-.9H-10M10,-.9H49" stroke="#fffbe0" stroke-width=".4" opacity=".6"/>
 ${[-38, 34].map((x) => `<rect x="${x}" y="-6.4" width="3.2" height="12.8" rx=".6" fill="url(#aw${u})" stroke="#241503" stroke-width=".7"/><circle cx="${x + 1.6}" cy="0" r=".85" fill="#140c02"/>`).join('')}
 <circle cx="-57.4" r="2.5" fill="url(#ap${u})" stroke="#241503" stroke-width=".7"/><circle cx="-57.4" r=".8" fill="#140c02"/><circle r="6.3" fill="none" stroke="#2c1b05" stroke-width=".5"/>
</g></g></g>
<g transform="translate(${CX},${CY})">${n.mood === 'pvp'
    ? `<circle class="astrolabe-eyeglow" r="19" fill="url(#ae${u})"/><path d="M-9.5,0Q0,-6.6 9.5,0Q0,6.6 -9.5,0Z" fill="#1d0503" stroke="#ff6a44" stroke-width=".8"/><circle r="4.3" fill="#e2300f"/><circle r="4.3" fill="url(#ae${u})"/><ellipse rx="1" ry="3.7" fill="#140202"/><circle cx="-1.6" cy="-1.7" r=".8" fill="#ffd9c6" opacity=".9"/>`
    : `<g class="astrolabe-m"><circle r="4" fill="url(#ap${u})" stroke="#241503" stroke-width=".8"/><path d="M-6.4,-1.1L3.6,-.7V.7L-6.4,1.1Z" transform="rotate(-38)" fill="#2b3c66" stroke="#0a1024" stroke-width=".5"/><circle r="1.3" fill="#fff8d8" opacity=".85" cx="-1" cy="-1.2"/></g>`}</g>
<g class="astrolabe-fx" transform="translate(${pt(STOP_R + 2, 71)})"></g></svg>`);
        const limb = ctx.el('div', 'astrolabe-limb'), spec = ctx.el('div', 'astrolabe-spec'), tymp = ctx.el('div', 'astrolabe-tymp');
        inst.append(back, limb, spec, tymp, front);
        const plate = ctx.el('div', 'astrolabe-plate');
        const T = ctx.el('div', 'astrolabe-t'), B = ctx.el('div', 'astrolabe-b'), bn = ctx.el('span'), U = ctx.el('span', 'astrolabe-u');
        const Rr = ctx.el('div', 'astrolabe-r'), Lb = ctx.el('span', 'astrolabe-l'), N = ctx.el('span', 'astrolabe-n'), O = ctx.el('div', 'astrolabe-o');
        B.append(bn, U); Rr.append(Lb, N); plate.append(ctx.el('i'), ctx.el('i'), T, B, Rr, O);
        rig.append(inst, plate); root.append(rig);
        const q = (s) => front.querySelector(s);
        const I = { root, rig, inst, plate, front, spec, ali: q('.astrolabe-ali'), spin: q('.astrolabe-spin'), rete: q('.astrolabe-rete'), glints: [...front.querySelectorAll('.astrolabe-glints>g>.astrolabe-gl')],
          nova: q('.astrolabe-nova'), novag: q('.astrolabe-novag'), arm: q('.astrolabe-arm'), fx: q('.astrolabe-fx'), odo: q('.astrolabe-odo'), medal: back.querySelector('.astrolabe-medal'), words: [...front.querySelectorAll('.astrolabe-w')], act: q('.astrolabe-act'),
          count: n.count, angle: TARGET[n.mood] ?? -90, timers: [], anims: [], osc: null,
          text(m) {
            T.textContent = m.title; bn.textContent = m.big; U.textContent = m.unit; Lb.textContent = m.label; O.textContent = m.more;
            N.textContent = m.more ? '' : (NOTE[m.mood] || '');
            B.style.display = m.big ? '' : 'none';
          } };
        I.text(n);
        if (I.odo) I.odo.firstElementChild.textContent = String(n.count);
        I.ali.style.transform = `rotate(${I.angle}deg)`;
        return I;
      }

      const kf = (list) => list.map(([o, a, e]) => ({ offset: o, transform: `rotate(${a}deg)`, easing: e || 'ease-in-out' }));
      const anim = (I, el, frames, opt) => { if (!el) return null; const a = el.animate(frames, opt); I.anims.push(a); return a; };
      const later = (I, ms, fn) => { const t = setTimeout(() => { if (!I.dead) fn(); }, ms); I.timers.push(t); return t; };
      function hunt(I) {
        if (ctx.reduced) { I.ali.style.transform = 'rotate(-97deg)'; return; }
        I.osc = anim(I, I.ali, kf([[0, -108], [1, -72]]), { duration: 2500 * D(), iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
      }
      function flare(I, peak, stagger = 0) {
        I.glints.forEach((g, i) => anim(I, g, [{ transform: 'scale(1)' }, { transform: `scale(${peak})`, offset: .3 }, { transform: 'scale(1)' }], { duration: 900 * D(), delay: i * stagger * D(), easing: 'ease-out' }));
      }
      function impact(I) {
        const d = D();
        anim(I, I.inst, [[0, 0, 0], [2.4, -1.2, 1.5], [-2, .8, -1.2], [1.5, -.6, .9], [-1, .4, -.6], [.6, 0, .3], [0, 0, 0]].map(([x, y, r]) => ({ transform: `translate(${x}px,${y}px) rotate(${r}deg)` })), { duration: 430 * d });
        anim(I, I.plate, [0, -2.6, 2, -1.2, .6, 0].map((r) => ({ transform: `rotate(${r}deg)` })), { duration: 800 * d, delay: 60 * d, easing: 'ease-out' });
        const S = (tag, at) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); I.fx.append(e); return e; };
        const cog = S('path', { d: COG, fill: `#e6c670`, stroke: '#241503', 'stroke-width': '.7', 'fill-rule': 'evenodd' });
        const a = anim(I, cog, [[0, 0, 0, 1], [10, -15, 150, 1], [20, -18, 300, 1], [30, 0, 450, 1], [37, 40, 620, 0]].map(([x, y, r, o]) => ({ transform: `translate(${x}px,${y}px) rotate(${r}deg)`, opacity: o })), { duration: 1150 * d, easing: 'linear', fill: 'forwards' });
        a.onfinish = () => cog.remove();
        const r = ctx.rng(7 + uid);
        for (let i = 0; i < 7; i++) {
          const ang = rad(-110 + r() * 150), L = 10 + r() * 16, s = S('path', { d: glint(2.6 + r() * 2, .5), fill: i % 2 ? '#fff6d0' : '#ffd27a' });
          const b = anim(I, s, [{ transform: 'translate(0,0) scale(.4)', opacity: 1 }, { transform: `translate(${f(Math.cos(ang) * L)}px,${f(Math.sin(ang) * L + 5)}px) scale(1)`, opacity: 0 }], { duration: (380 + r() * 320) * d, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'forwards' });
          b.onfinish = () => s.remove();
        }
        flare(I, 2.1);
      }
      function swing(I, mood, delay) {
        const d = D(), [dur, ...list] = SWING[mood] || SWING.good;
        I.osc?.cancel(); I.osc = null;
        I.angle = TARGET[mood] ?? -90;
        const a = anim(I, I.ali, kf(list), { duration: dur * d, delay, fill: 'both' });
        I.ali.style.transform = `rotate(${mood === 'calibrating' ? -108 : I.angle}deg)`;
        if (mood === 'superb') later(I, delay + dur * d * .36, () => impact(I));
        if (mood === 'calibrating') a.onfinish = () => { if (!I.dead) hunt(I); };
      }

      function play(job, slot) {
        const n = job.n, I = build(n), d = D(), L = ctx.lane();
        const cols = Math.max(1, Math.floor((L.w + 12) / (W + 12))), rowW = cols * W + (cols - 1) * 12;
        const col = cols - 1 - (slot % cols), row = Math.floor(slot / cols);
        I.root.style.left = Math.round(L.x0 + Math.max(0, (L.w - rowW) / 2) + col * (W + 12)) + 'px';
        I.root.style.top = Math.max(4, Math.round(L.bottom - SLOT - 4 - row * SLOT)) + 'px';
        I.slot = slot; slots[slot] = job; job.I = I; live.add(job);
        ctx.front.append(I.root);
        I.readEnd = performance.now() + 7000 * d; I.cap = performance.now() + 10000 * d;
        I.leaveT = later(I, 7000 * d, () => leave(job));
        if (ctx.reduced) { anim(I, I.root, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 }); if (n.mood === 'calibrating') hunt(I); return; }
        anim(I, I.rig, [{ transform: 'translateY(-16px) rotate(-15deg)', opacity: 0 }, { transform: 'translateY(0) rotate(6deg)', opacity: 1, offset: .42 }, { transform: 'rotate(-2.6deg)', offset: .72 }, { transform: 'rotate(0deg)' }], { duration: 1050 * d, easing: 'ease-out' });
        anim(I, I.plate, [8, -5, 2.4, -1, 0].map((r) => ({ transform: `rotate(${r}deg)` })), { duration: 1400 * d, easing: 'ease-in-out' });
        anim(I, I.spec, [{ transform: 'rotate(-40deg)', opacity: 0 }, { transform: 'rotate(80deg)', opacity: 1, offset: .4 }, { transform: 'rotate(190deg)', opacity: 1 }], { duration: 1500 * d, easing: 'ease-out' });
        const dead = n.kind === 'death';
        anim(I, I.spin, [{ transform: `rotate(${dead ? -230 : -115}deg)` }, { transform: 'rotate(0deg)' }], { duration: (dead ? 3000 : 1450) * d, easing: dead ? 'cubic-bezier(.12,.5,.25,1)' : 'cubic-bezier(.2,.7,.2,1)' });
        swing(I, n.mood, 200 * d);
        if (dead) { I.root.classList.remove('astrolabe-dead'); later(I, 850 * d, () => I.root.classList.add('astrolabe-dead')); }
        if (n.mood === 'pvp') later(I, 420 * d, () => { anim(I, I.inst, [0, 1.6, -1, .5, 0].map((r) => ({ transform: `rotate(${r}deg)` })), { duration: 380 * d }); });
        if (n.mood === 'great') later(I, 900 * d, () => flare(I, 1.5));
        if (n.kind === 'levelup') {
          anim(I, I.nova, [{ opacity: 0 }, { opacity: 0, offset: .92 }, { opacity: 1 }], { duration: 2300 * d, fill: 'backwards' });
          anim(I, I.novag, [{ opacity: 0, transform: 'scale(1)' }, { opacity: 0, offset: .86 }, { opacity: 1, offset: .9 }, { opacity: 1 }], { duration: 2400 * d, fill: 'backwards' });
          anim(I, I.rete, [{ opacity: 1 }, { opacity: .1, offset: .2 }, { opacity: .1, offset: .8 }, { opacity: 1 }], { duration: 2000 * d, delay: 320 * d });
          anim(I, I.front.querySelector('.astrolabe-glints'), [{ opacity: 1 }, { opacity: .15, offset: .2 }, { opacity: .15, offset: .8 }, { opacity: 1 }], { duration: 2000 * d, delay: 320 * d });
          anim(I, I.arm, [{ opacity: 0 }, { opacity: 1, offset: .12 }, { opacity: 1, offset: .86 }, { opacity: 0 }], { duration: 2000 * d, delay: 320 * d });
          I.arm.querySelectorAll('.astrolabe-el').forEach((e, i) => anim(I, e, [1, [.2, .46, .7][i], [.62, .18, .34][i], [.3, .7, .16][i], 1].map((s) => ({ transform: `scaleY(${s})` })), { duration: 2000 * d, delay: 320 * d, easing: 'ease-in-out' }));
          later(I, 2250 * d, () => { anim(I, I.novag.querySelector('.astrolabe-gl'), [{ transform: 'scale(.2)' }, { transform: 'scale(1.9)', offset: .35 }, { transform: 'scale(1)' }], { duration: 950 * d, easing: 'ease-out' }); flare(I, 1.5, 30); });
        }
        if (n.kind === 'achievement') {
          anim(I, I.medal, [{ transform: 'rotate(180deg)' }, { transform: 'rotate(-13deg)', offset: .55 }, { transform: 'rotate(6deg)', offset: .78 }, { transform: 'rotate(0deg)' }], { duration: 1150 * d, delay: 450 * d, fill: 'backwards', easing: 'ease-in-out' });
          later(I, 1000 * d, () => flare(I, 1.9, 55));
        }
      }
      function refresh(job, n) {
        const I = job.I, d = D(), now = performance.now();
        I.root.dataset.mood = n.mood; I.root.style.setProperty('--ag', GL[n.mood] || 1);
        I.text(n);
        const mi = WORDS.findIndex((w) => w.toLowerCase() === n.mood);
        I.words.forEach((w, i) => w.classList.toggle('astrolabe-on', i === mi));
        if (mi >= 0) { I.act.setAttribute('d', band(mi)); I.act.style.display = ''; } else I.act.style.display = 'none';
        I.readEnd = Math.min(I.cap, Math.max(I.readEnd, now) + 1200 * d);
        clearTimeout(I.leaveT); I.leaveT = later(I, I.readEnd - now, () => leave(job));
        const to = TARGET[n.mood] ?? -90, from = I.angle, same = to === from;
        if (I.odo && n.count !== I.count) {
          const old = I.odo.lastElementChild, nu = old.cloneNode(); nu.textContent = String(n.count); I.odo.append(nu); I.count = n.count;
          if (ctx.reduced) old.remove();
          else { anim(I, old, [{ transform: 'translateY(0)' }, { transform: 'translateY(-10px)' }], { duration: 320 * d, fill: 'forwards', easing: 'ease-in' }).onfinish = () => old.remove(); anim(I, nu, [{ transform: 'translateY(10px)' }, { transform: 'translateY(0)' }], { duration: 320 * d, easing: 'cubic-bezier(.3,1.5,.6,1)' }); }
        }
        if (ctx.reduced) { I.angle = to; I.ali.style.transform = `rotate(${to}deg)`; return; }
        anim(I, I.plate, [{ opacity: .55 }, { opacity: 1 }], { duration: 450 * d });
        I.osc?.cancel(); I.osc = null; I.angle = to;
        const dir = to >= from ? 1 : -1, kick = same ? 7 : Math.min(12, 4 + Math.abs(to - from) * .3);
        anim(I, I.ali, kf(same ? [[0, from], [.3, from - kick], [.62, from + 3], [.84, from - 1], [1, to]] : [[0, from], [.45, to + dir * kick], [.72, to - dir * kick * .35], [.88, to + dir * 1.2], [1, to]]), { duration: 620 * d, fill: 'both' });
        I.ali.style.transform = `rotate(${to}deg)`;
        anim(I, I.spin, [{ transform: 'rotate(-14deg)' }, { transform: 'rotate(0deg)' }], { duration: 600 * d, easing: 'ease-out' });
      }
      function leave(job) {
        const I = job.I, d = D();
        if (ctx.reduced) { I.root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' }).onfinish = () => end(job); return; }
        I.rig.style.transformOrigin = `50% ${CY}px`;
        anim(I, I.plate, [{ opacity: 1 }, { opacity: 0 }], { duration: 420 * d, fill: 'forwards' });
        anim(I, I.spin, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(70deg)' }], { duration: 800 * d, easing: 'ease-in', fill: 'forwards' });
        const a = anim(I, I.rig, [{ transform: 'perspective(520px) rotateX(0deg)', opacity: 1, filter: 'brightness(1)' }, { transform: 'perspective(520px) rotateX(58deg)', opacity: .8, filter: 'brightness(.75)', offset: .55 }, { transform: 'perspective(520px) rotateX(84deg) translateY(8px)', opacity: 0, filter: 'brightness(.5)' }], { duration: 800 * d, easing: 'ease-in', fill: 'forwards' });
        a.onfinish = () => end(job);
      }
      function end(job) {
        const I = job.I; if (!I || I.dead) return;
        I.dead = true; I.timers.forEach(clearTimeout); I.anims.forEach((a) => { try { a.cancel(); } catch { /* gone */ } });
        I.root.remove(); live.delete(job); if (slots[I.slot] === job) slots[I.slot] = null;
        pump();
      }
      function freeSlot() {
        const L = ctx.lane(), cols = Math.max(1, Math.floor((L.w + 12) / (W + 12))), rows = Math.max(1, Math.min(3, Math.floor((L.h - 4) / SLOT)));
        const cap = Math.min(3, cols * rows);
        for (let i = 0; i < cap; i++) if (!slots[i]) return i;
        return -1;
      }
      function pump() { while (queue.length) { const s = freeSlot(); if (s < 0) return; play(queue.shift(), s); } }

      return {
        show(n) {
          const job = { n, I: null };
          queue.push(job); pump();
          return { update(m) { job.n = m; if (job.I && !job.I.dead) refresh(job, m); } };
        },
        still(n) {
          const I = build(n);
          I.root.style.position = 'relative';
          if (n.mood === 'calibrating') hunt(I);
          return I.root;
        },
        clear() {
          queue.length = 0;
          for (const job of [...live]) { const I = job.I; I.dead = true; I.timers.forEach(clearTimeout); I.anims.forEach((a) => { try { a.cancel(); } catch { /* gone */ } }); I.root.remove(); }
          live.clear(); slots.length = 0;
        },
      };
    },
  });
})();
