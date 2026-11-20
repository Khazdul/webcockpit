// Round 2, direction 2: The Raven. A scruffy old raven of Erebor flaps up
// with the news on a parchment scroll hung from its claws (a mockup).
(() => {
  const ID = 'raven';
  const W = 200;            // the flying element's width, px
  const CROP = 14;          // the bird's viewBox starts here (y)
  const CLAW = 128;         // where the claws hold the cord (bird y)
  const SH = [88, 62];      // the left shoulder
  const WR = [-36, -16];    // the wrist, from the shoulder

  const CSS = `
.raven{position:relative;width:${W}px;padding-bottom:28px;font-family:"IM Fell English",Georgia,serif;color:#2a1c0f;--rv-ink2:#4a3a2c}
.raven-bird{position:absolute;left:0;top:0;width:${W}px;height:${150 - CROP}px;overflow:visible;
  filter:drop-shadow(0 0 .6px rgba(214,224,242,.95)) drop-shadow(0 0 3px rgba(120,150,205,.2))}
.raven-f{fill:#0e1525;stroke:#56719d;stroke-width:.45;stroke-opacity:.6;stroke-linejoin:round}
.raven-f2{fill:#131c31}
.raven-f3{fill:#1c2947;stroke:#7391bf;stroke-opacity:.7}
.raven-sh{fill:none;stroke:#7f9cc8;stroke-width:.4;stroke-opacity:.34;stroke-linecap:round}
.raven-hl{fill:none;stroke:#b4c6e4;stroke-width:.8;stroke-opacity:.85;stroke-linecap:round}
.raven-ht{fill:none;stroke:#7895c2;stroke-width:.5;stroke-opacity:.6;stroke-linecap:round}
.raven-skull{fill:#111a2d;stroke:#6a86b3;stroke-width:.5;stroke-opacity:.8;stroke-linejoin:round}
.raven-bill{fill:#1b212e;stroke:#93a7c8;stroke-width:.5;stroke-opacity:.8;stroke-linejoin:round}
.raven-leg{fill:none;stroke:#3a4253;stroke-width:2;stroke-linecap:round}
.raven-toe{fill:none;stroke:#566076;stroke-width:1.5;stroke-linecap:round}
.raven-eye{fill:#05070b;stroke:#cfd9ea;stroke-width:.6}
.raven-p,.raven-lid{display:none}
.raven[data-mood=superb] .raven-p-ring,.raven[data-mood=levelup] .raven-p-laurel,.raven[data-mood=death] .raven-p-poppy,
.raven[data-mood=achievement] .raven-p-medal,.raven[data-mood=meh] .raven-lid-half,.raven[data-mood=achievement] .raven-lid-shut{display:inline}
.raven[data-mood=pvp] .raven-eye{fill:#d8401f;stroke:#ffd9b0}
.raven-spark{animation:raven-tw 1.7s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}
@keyframes raven-tw{0%,100%{opacity:.15;transform:scale(.5)}50%{opacity:1;transform:scale(1)}}
.raven-moult{position:absolute;left:184px;top:92px;width:10px;height:24px;overflow:visible;display:none;
  filter:drop-shadow(0 0 .6px rgba(206,219,240,.9));animation:raven-fall 5.2s linear infinite}
.raven[data-mood=poor] .raven-moult{display:block}
@keyframes raven-fall{0%{transform:translate(-14px,-10px) rotate(-25deg);opacity:0}8%{opacity:1}
  30%{transform:translate(2px,22px) rotate(22deg)}55%{transform:translate(-9px,58px) rotate(-18deg)}
  80%{transform:translate(1px,96px) rotate(20deg);opacity:1}100%{transform:translate(-6px,124px) rotate(-10deg);opacity:0}}
.raven-hang{position:relative;padding-top:${CLAW - CROP - 2}px;transform-origin:${W / 2}px ${CLAW - CROP}px;will-change:transform}
.raven-cord{display:block;width:${W}px;height:26px;overflow:visible;margin-bottom:-3px;position:relative;z-index:3}
.raven-scroll{position:relative;width:160px;margin:0 auto;
  filter:drop-shadow(0 0 .6px rgba(46,30,10,.95)) drop-shadow(0 0 .6px rgba(46,30,10,.6)) drop-shadow(0 3px 5px rgba(0,0,0,.42))}
.raven[data-kind=achievement] .raven-scroll{width:184px}
.raven-bump{animation:raven-bump .42s ease-out}
@keyframes raven-bump{0%{transform:scale(1)}35%{transform:scale(1.055) translateY(2px)}100%{transform:scale(1)}}
.raven-rod{position:relative;z-index:2;height:12px;margin:0 -4px;border-radius:5px;
  background:linear-gradient(180deg,#f7eecd 0,#ecdfb8 28%,#cdb985 66%,#8d774b 100%)}
.raven-rod::before,.raven-rod::after{content:"";position:absolute;top:-2px;width:7px;height:16px;border-radius:2px;
  background:linear-gradient(180deg,#8a5d33,#5a391b 55%,#2f1c0c)}
.raven-rod::before{left:-6px}.raven-rod::after{right:-6px}
.raven-wrap{display:grid;grid-template-rows:1fr;transition:grid-template-rows .95s cubic-bezier(.3,.7,.3,1)}
.raven-rolled .raven-wrap{grid-template-rows:0fr}
.raven-sheet{min-height:0;overflow:hidden;margin:0 2px;padding:0 9px;
  background:
    radial-gradient(60px 30px at 82% 12%,rgba(150,112,52,.2),transparent 70%),
    radial-gradient(50px 46px at 12% 78%,rgba(140,100,44,.2),transparent 70%),
    radial-gradient(26px 18px at 64% 62%,rgba(150,110,60,.1),transparent 70%),
    linear-gradient(180deg,rgba(84,58,22,.5) 0,rgba(84,58,22,0) 9px),
    linear-gradient(90deg,#c9b584 0,#e6d8ae 9%,#f0e5c3 45%,#eadcb4 82%,#c4ae7c 100%)}
.raven-text{display:flex;flex-direction:column;align-items:center;text-align:center;padding:10px 0 25px}
.raven-text>:empty{display:none}
.raven-title{font-size:15px;line-height:1.18;overflow-wrap:anywhere}
.raven-fig{display:flex;align-items:baseline;justify-content:center;gap:4px;margin-top:2px}
.raven-big{font:600 33px/1 "Cormorant Garamond",Georgia,serif;letter-spacing:.01em;font-variant-numeric:lining-nums}
.raven-unit{font:italic 15px/1 "IM Fell English",Georgia,serif;color:#5a4426}
.raven-unit:empty{display:none}
.raven-label{font:13px/1.2 "IM Fell English SC",Georgia,serif;letter-spacing:.16em;color:var(--rv-ink2);margin-top:5px;display:flex;align-items:center;gap:6px}
.raven-label::before,.raven-label::after{content:"";width:16px;height:1px;background:currentColor;opacity:.6}
.raven-more{font:italic 12.5px/1.25 "IM Fell English",Georgia,serif;color:#4d3a1f;margin-top:5px;border-top:1px solid rgba(74,54,24,.3);padding-top:4px}
.raven-curl{position:relative;z-index:2;height:9px;margin:-1px 0 0;border-radius:2px 2px 5px 5px;
  background:linear-gradient(180deg,#7f6a40 0,#d5c494 22%,#f4eac8 52%,#d6c594 78%,#9a8556 100%)}
.raven-seal{position:absolute;left:50%;bottom:-27px;width:36px;height:48px;margin-left:-18px;z-index:4;overflow:visible;
  filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.55))}
.raven[data-kind=achievement] .raven-label{order:-1;margin:0 0 4px}
.raven[data-kind=achievement] .raven-title{font-style:italic;font-size:13.5px;line-height:1.2}
.raven[data-kind=levelup] .raven-big{font:700 22px/1.25 "Cinzel",Georgia,serif;letter-spacing:.04em;color:#57390a}
.raven[data-kind=levelup] .raven-text{padding-top:13px}
.raven[data-kind=levelup] .raven-fig{border-block:1px solid rgba(110,78,20,.55);padding:3px 4px 1px}
.raven[data-kind=death] .raven-rod,.raven[data-kind=death] .raven-curl{display:none}
.raven[data-kind=death] .raven-sheet{margin:0 12px;border:5px solid #0a0a0c;outline:1px solid rgba(214,222,236,.55);
  background:linear-gradient(135deg,#efebdf,#dcd6c6);box-shadow:inset 0 0 0 2px #efebdf,inset 0 0 0 3px #0a0a0c}
.raven[data-kind=death] .raven-text{padding:20px 0 30px}
.raven[data-kind=death] .raven-big{font:600 25px/1.1 "Cormorant SC","Cormorant Garamond",Georgia,serif;letter-spacing:.14em;color:#0c0c0f}
.raven[data-kind=death] .raven-seal{bottom:-24px}
@media (prefers-reduced-motion:reduce){.raven-spark{animation:none}.raven-moult{animation:none;transform:translate(-6px,34px) rotate(14deg)}.raven-wrap{transition:none}.raven-bump{animation:none}}
`;

  const n1 = (n) => (Math.round(n * 10) / 10).toString();
  // one flight feather, from its base to its tip
  const fpath = (bx, by, tx, ty, hw, k = 0.8) => {
    const dx = tx - bx, dy = ty - by, L = Math.hypot(dx, dy) || 1, nx = (-dy / L) * hw, ny = (dx / L) * hw;
    return `M${n1(bx)} ${n1(by)}C${n1(bx + dx * 0.3 + nx)} ${n1(by + dy * 0.3 + ny)} ${n1(bx + dx * 0.9 + nx)} ${n1(by + dy * 0.9 + ny)} ${n1(tx)} ${n1(ty)}`
      + `C${n1(bx + dx * 0.9 - nx * k)} ${n1(by + dy * 0.9 - ny * k)} ${n1(bx + dx * 0.3 - nx * k)} ${n1(by + dy * 0.3 - ny * k)} ${n1(bx)} ${n1(by)}Z`;
  };
  const feather = (bx, by, tx, ty, hw, cls = '', k) =>
    `<path class="raven-f ${cls}" d="${fpath(bx, by, tx, ty, hw, k)}"/><path class="raven-sh" d="M${n1(bx + (tx - bx) * 0.12)} ${n1(by + (ty - by) * 0.12)}L${n1(bx + (tx - bx) * 0.9)} ${n1(by + (ty - by) * 0.9)}"/>`;
  const rad = (d) => (d * Math.PI) / 180;
  // a feather that leaves (bx,by) at an angle from straight down, toward the wing tip
  const fan = (bx, by, deg, len, hw, cls, k) => feather(bx, by, bx - Math.sin(rad(deg)) * len, by + Math.cos(rad(deg)) * len, hw, cls, k);

  function wingMarkup() {
    const ax = -0.914, ay = -0.406;
    let hand = '', arm = '';
    const PL = [37, 41, 45, 49, 52, 53, 50, 43];
    for (let j = 7; j >= 0; j--) {
      const u = j / 7;
      hand += fan(WR[0] + 3 - 1.5 * j, WR[1] + 3 - 0.1 * j, 27 + u * 58, PL[j], 4.7 - 1.9 * u, j % 2 ? 'raven-f2' : '', 0.75);
    }
    for (let j = 5; j >= 0; j--) hand += fan(WR[0] + 3 - 1.5 * j, WR[1] + 2, 30 + (j / 5) * 52, 17 - j * 0.6, 3.3, 'raven-f3');
    hand += feather(WR[0] - 2, WR[1] - 3.5, WR[0] - 17, WR[1] - 1.5, 2.3, 'raven-f3');
    for (let i = 0; i < 7; i++) arm += fan(ax * (5 + i * 5), ay * (5 + i * 5) + 3, -9 + i * 5.2, 33 + i * 1.3, 5.2, i % 2 ? 'raven-f2' : '');
    for (let i = 0; i < 7; i++) arm += fan(ax * (4 + i * 5.2), ay * (4 + i * 5.2) + 1.5, -8 + i * 5.4, 17 + i * 0.5, 4.5, 'raven-f3');
    let sc = '';
    for (let i = 0; i < 5; i++) { const d = 7 + i * 6.4; sc += `M${n1(ax * d - 2.6)} ${n1(ay * d + 0.5)}q2.4 4 5.2 .6`; }
    for (let i = 0; i < 4; i++) { const d = 11 + i * 6.4; sc += `M${n1(ax * d - 2.4)} ${n1(ay * d - 4.2)}q2.2 3.4 4.8 .5`; }
    arm += `<path class="raven-f raven-f3" d="M5 -6C-8 -17 -24 -23.5 -37 -21.5C-43.5 -20.5 -45.5 -14 -41.5 -10Q-39 -4 -34.5 -6.5Q-31 .5 -26.5 -2.5Q-23 4.5 -18.5 1.5Q-15 8.5 -10.5 5.5Q-7 12 -2 8.5L7 6Z"/>`
      + `<path class="raven-ht" d="${sc}"/><path class="raven-hl" d="M3 -7C-9 -17 -24 -23 -37 -21.2C-41 -20.6 -43.4 -17.6 -43.2 -14.4"/>`;
    return `<g class="raven-hand">${hand}</g>${arm}`;
  }

  function birdMarkup(seed) {
    const r = seed;
    let tail = '';
    for (const k of [-3, 3, -2, 2, -1, 1, 0]) tail += fan(100 + k * 1.7, 99, -k * 8.5, 41 - Math.abs(k) * 4.6, 5.2, Math.abs(k) % 2 ? 'raven-f2' : '');
    let hatch = '';
    for (let y = 60; y < 102; y += 6.5) {
      const half = 17 - Math.abs(y - 76) * 0.28;
      for (let x = 100 - half + 3 + r() * 3; x < 100 + half - 2; x += 5.5 + r() * 2.5) hatch += `M${n1(x)} ${n1(y + r() * 3)}q${n1(1.2 + r())} 3 ${n1(-0.4 + r())} 5.4`;
    }
    const wing = wingMarkup();
    let laurel = '<path d="M-30 -9.5C-38 -12 -45 -18 -49.5 -27" fill="none" stroke="#6f7c3c" stroke-width="1"/>';
    [[-35, -11.2, -41, -6.5], [-37, -12.4, -36, -20], [-40.5, -14.5, -47.5, -11.5], [-42.5, -16.5, -40.5, -24.5], [-45.5, -19.5, -52.5, -18.5], [-47, -22, -45, -30], [-49.5, -27, -52.5, -34]]
      .forEach((l) => { laurel += `<path d="${fpath(l[0], l[1], l[2], l[3], 2.3, 1)}" fill="#8d9c4c" stroke="#e3e9ad" stroke-width=".4"/>`; });
    return `<svg class="raven-bird" viewBox="0 ${CROP} ${W} ${150 - CROP}" aria-hidden="true">
<defs><radialGradient id="raven-gb" cx=".34" cy=".26" r=".85"><stop offset="0" stop-color="#31446c"/><stop offset=".5" stop-color="#172138"/><stop offset="1" stop-color="#0c111e"/></radialGradient></defs>
<g class="raven-all">
<g class="raven-tail">${tail}</g>
<g class="raven-wl">${wing}</g>
<g transform="translate(${W} 0) scale(-1 1)"><g class="raven-wr">${wing}</g></g>
<g class="raven-body">
<path class="raven-skull" style="fill:url(#raven-gb)" d="M100 48C116 48 121.5 62 119.5 78C117.5 94 108 106 100 108.500C92 106 82.500 94 80.500 78C78.500 62 84 48 100 48Z"/>
<path class="raven-ht" d="${hatch}"/>
<path class="raven-f raven-f2" d="M88.500 95C85.500 105 89 113.500 93.500 116.500L95 111.500L97.500 116C99.500 109 99 100 97 95.500Z"/>
<path class="raven-f raven-f2" d="M111.500 95C114.500 105 111 113.500 106.500 116.500L105 111.500L102.500 116C100.500 109 101 100 103 95.500Z"/>
</g>
<path class="raven-leg" d="M94.500 114.500L97 123M105.500 114.500L103 123"/>
<path class="raven-toe" d="M97 123q-3.400 1.600 -2.200 5.400M97 123q-.6 3 1.400 5.600M97.200 123q2.200 1.600 2.600 4.600M103 123q3.400 1.600 2.200 5.400M103 123q.6 3 -1.400 5.600M102.800 123q-2.200 1.600 -2.600 4.600"/>
<g class="raven-p raven-p-medal"><path d="M92.500 57L98.600 81L102 80L96.500 56Z" fill="#2c4f86" stroke="#b9cbe8" stroke-width=".4"/><path d="M107.500 57L101.400 81L98 80L103.500 56Z" fill="#223d6b" stroke="#b9cbe8" stroke-width=".4"/>
<circle cx="100" cy="86" r="6.800" fill="#d6ae38" stroke="#6e4f0e" stroke-width=".8"/><circle cx="100" cy="86" r="4.700" fill="none" stroke="#fff2b6" stroke-width=".6"/><path d="M100 82.600L101 85.200L103.600 85.300L101.600 87L102.300 89.600L100 88.100L97.700 89.600L98.400 87L96.400 85.300L99 85.200Z" fill="#6e4f0e"/></g>
<g class="raven-head">
<g class="raven-p raven-p-ring"><circle cx="-35.500" cy="-2" r="5.200" fill="none" stroke="#6a4c0c" stroke-width="2.800"/><circle cx="-35.500" cy="-2" r="5.200" fill="none" stroke="#ecc95a" stroke-width="1.700"/><path d="M-39.200 -.2A4.600 4.600 0 0 0 -34 2.900" fill="none" stroke="#fff6cf" stroke-width=".7"/>
<path class="raven-spark" d="M-42.500 -9.500L-41.600 -6.400L-38.500 -5.500L-41.600 -4.600L-42.500 -1.500L-43.400 -4.600L-46.500 -5.500L-43.400 -6.400Z" fill="#fff6cf"/></g>
<g class="raven-p raven-p-laurel">${laurel}</g>
<g class="raven-p raven-p-poppy"><path d="M-30 -8.500C-39 -9 -45.500 -4 -47 4.500" fill="none" stroke="#6c7d47" stroke-width="1.100"/><path d="M-41 -6.600q-3.500 1 -4.400 4.200" fill="none" stroke="#6c7d47" stroke-width=".8"/>
<circle cx="-50.600" cy="7.200" r="4.300" fill="#8a1a14"/><circle cx="-43.600" cy="7.400" r="4.300" fill="#971d16"/><path d="M-47 9.500C-52 6.500 -57 10 -55 14.500C-53.500 17.800 -49 18 -47 15.500C-45 18 -40.500 17.800 -39 14.500C-37 10 -42 6.500 -47 9.500Z" fill="#c4321f" stroke="#f3bfa8" stroke-width=".35"/><path d="M-47 10.500V15.500M-50.500 8.500l-2.500 -3M-43.500 8.500l2.500 -3" fill="none" stroke="#6e1410" stroke-width=".5"/><circle cx="-47" cy="9.800" r="2.100" fill="#120707" stroke="#e8c99a" stroke-width=".4" stroke-dasharray=".5 .6"/></g>
<path class="raven-skull" d="M10 4C12.500 -6 10 -19 0 -23C-6 -25 -11 -23.500 -13.500 -20.500L-13 -10L-12 -5L-15.800 -.6L-11.500 -2.500L-14.300 4.600L-9.500 2L-11.200 9.800L-6.500 6.500L-6 13.600L-1.500 9.500L3 13.400L5 8Z"/>
<path class="raven-ht" d="M-8.500 -4.500l-1.500 4M-5 -3.500l-1.300 5M-1.500 -2l-.8 5.500M2.500 -1.500l-.2 5.500M-3.500 3.500l-.8 4.500M.8 5l-.2 4.200M6 -3l.6 5"/>
<path class="raven-hl" d="M8.800 -5C9 -15 5 -20.500 -1 -22.600C-5.500 -24 -9.500 -23.200 -12 -21.300"/>
<g class="raven-jaw"><path class="raven-bill" d="M-12.500 -10.800C-21 -11 -30 -10.300 -36 -8.100C-30 -5.200 -21 -4.500 -12 -5Z"/></g>
<path class="raven-bill" d="M-12.500 -20.800C-22 -22.400 -32.500 -18.500 -38.600 -8.600C-39.300 -7.200 -38.200 -6.500 -37 -7.400C-31 -10.700 -22 -11.200 -12.500 -10.800Z"/>
<path class="raven-hl" d="M-15 -20.200C-23.500 -21 -31.500 -17.500 -37.200 -9.800"/>
<path class="raven-skull" d="M-10.500 -22L-23.500 -19.500L-18.800 -17.600L-24.500 -15.400L-17.500 -14.400L-20.500 -12L-11 -11.200Z"/>
<circle class="raven-eye" cx="-6.800" cy="-15.600" r="2.100"/><circle cx="-7.500" cy="-16.300" r=".7" fill="#fff"/>
<path class="raven-lid raven-lid-half" d="M-9.300 -15.500A2.500 2.500 0 0 1 -4.300 -15.500Z" fill="#0f1626" stroke="#9db2d6" stroke-width=".5"/>
<g class="raven-lid raven-lid-shut"><circle cx="-6.800" cy="-15.600" r="2.600" fill="#0f1626"/><path d="M-9.200 -14.900Q-6.800 -17.400 -4.400 -14.900" fill="none" stroke="#cfd9ea" stroke-width=".8" stroke-linecap="round"/></g>
</g>
</g></svg>`;
  }

  const WAX = {
    calibrating: ['#cdbb8a', '#8f7d50', '#f3e9c6', ''],
    poor: ['#72604d', '#463628', '#c3ae95', ''],
    meh: ['#8c7c50', '#5b4e2e', '#dccf9f', ''],
    good: ['#57733b', '#334620', '#c2d898', ''],
    great: ['#2f5b8e', '#1b385d', '#b3cff2', ''],
    superb: ['#c79c2f', '#7f5d10', '#fff2b6', ''],
    pvp: ['#a3201c', '#5e0e0e', '#f6bcae', ''],
    levelup: ['#bd8e26', '#74530e', '#ffeba6', '#8c1d22'],
    death: ['#1a1a1f', '#000', '#c2c6d0', '#0b0b0d'],
    achievement: ['#5c317c', '#371a4f', '#e0c6f2', '#2c4f86'],
  };
  const EMBLEM = {
    calibrating: 'M13.500 17q4.500 -4 9 0M12.500 20.500q5.500 -4.600 11 0',
    poor: 'M14 22.500L22 14.500M12.300 22.200a1.200 1.200 0 1 0 .1 0M14.300 24.200a1.200 1.200 0 1 0 .1 0M21.700 12.300a1.200 1.200 0 1 0 .1 0M23.700 14.300a1.200 1.200 0 1 0 .1 0',
    meh: 'M11 18.500Q18 11.500 25 18.500Q18 25.500 11 18.500ZM18 16.300a2.200 2.200 0 1 0 .1 0',
    good: 'M18 9.500V27M14 22.500H22M18 9.500l-1.700 3M18 9.500l1.700 3',
    great: 'M18 9.500V27.500M9 18.500H27M12 12.500L24 24.500M24 12.500L12 24.500',
    superb: 'M11.500 24V13.500L15 18L18 11.500L21 18L24.500 13.500V24ZM11.500 26.500H24.500',
    pvp: 'M11 26L24.500 10.500M25 26L11.500 10.500M11 21.500L15.500 25.500M25 21.500L20.500 25.500',
    levelup: 'M11.500 19.500L18 12.500L24.500 19.500M11.500 25.500L18 18.500L24.500 25.500',
    death: 'M12.500 11H23.500L12.500 26H23.500ZM12 11H24M12 26H24',
    achievement: 'M18 10L20 15.800L26 16L21.300 19.700L23 25.500L18 22.100L13 25.500L14.700 19.700L10 16L16 15.800Z',
  };
  function sealMarkup(mood, rnd) {
    const [base, dark, light, rib] = WAX[mood] || WAX.calibrating;
    const pts = [];
    for (let i = 0; i < 11; i++) { const a = (i / 11) * Math.PI * 2, rr = 14.6 + rnd() * 2.6; pts.push([18 + Math.cos(a) * rr, 18.5 + Math.sin(a) * rr]); }
    let d = '';
    pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2; d += i ? `Q${n1(p[0])} ${n1(p[1])} ${n1(mx)} ${n1(my)}` : `M${n1(mx)} ${n1(my)}`; });
    const p0 = pts[0], p1 = pts[1];
    d += `Q${n1(p0[0])} ${n1(p0[1])} ${n1((p0[0] + p1[0]) / 2)} ${n1((p0[1] + p1[1]) / 2)}Z`;
    const tails = rib ? `<path d="M11 24L6.500 46L11.500 42.500L15 47.500L18.500 24Z" fill="${rib}" stroke="rgba(255,255,255,.35)" stroke-width=".4"/><path d="M17.500 24L21 47.500L24.500 42.500L29.500 46L25 24Z" fill="${rib}" stroke="rgba(255,255,255,.35)" stroke-width=".4"/>` : '';
    return `<svg class="raven-seal" viewBox="0 0 36 48" aria-hidden="true">${tails}
<path d="${d}" fill="${base}" stroke="${dark}" stroke-width=".9"/>
<path d="M6.500 13A13.500 13.500 0 0 1 20 4.600" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width="1.300" stroke-linecap="round"/>
<circle cx="18" cy="18.500" r="11.200" fill="${dark}" fill-opacity=".5" stroke="${dark}" stroke-width=".8"/>
<path d="M8.800 23A10.400 10.400 0 0 0 27.200 23" fill="none" stroke="${light}" stroke-opacity=".55" stroke-width=".7"/>
<path d="${EMBLEM[mood] || ''}" fill="none" stroke="${light}" stroke-width="1.350" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  const BASE = { a: 4, h: -11, amp: 1, hr: -5, hy: 0, flip: 1, chest: 1, jaw: 0, f: 1, tilt: 0 };
  const POSE = {
    good: {},
    calibrating: { hr: 21, hy: -1, tilt: -3 },
    poor: { a: -12, h: -20, amp: 0.8, hr: -17, hy: 7.5, f: 0.85, chest: 0.97 },
    meh: { flip: -1, hr: 7, hy: 1.5, amp: 0.85, f: 0.9 },
    great: { hr: 14, hy: -3, chest: 1.1, a: 3, h: 0 },
    superb: { a: -14, h: 26, amp: 0.5, hr: 9, hy: -2.5, chest: 1.08, f: 0.8 },
    pvp: { hr: -9, hy: 1, jaw: 17, a: 5, h: 7, f: 1.15, tilt: -4 },
    levelup: { hr: 11, hy: -2.5, chest: 1.06, a: -5, h: 12, amp: 0.8 },
    death: { hr: -31, hy: 5, a: -7, h: -5, amp: 0.7, f: 0.7 },
    achievement: { hr: 18, hy: -3, chest: 1.13, amp: 0.8, f: 0.9 },
  };
  const KEYS = Object.keys(BASE);

  Harness.register({
    id: ID,
    name: 'The Raven',
    blurb: 'No balloon: a scruffy old raven of Erebor flaps up with the news on a parchment scroll, sealed in wax by rating. Its bearing says the rest: sunk and moulting for a mouse, wings wide and a ring in its beak for a troll, a poppy and a black-edged card when it comes for you.',
    create(ctx) {
      Harness.css(ID, CSS);
      const rigs = new Set();
      let ticking = false, serial = 0;

      function fill(rig, n) {
        const mood = POSE[n.mood] ? n.mood : 'calibrating';
        rig.el.dataset.mood = mood; rig.el.dataset.kind = n.kind;
        rig.el.style.setProperty('--rv-ink2', (WAX[mood] || WAX.calibrating)[mood === 'calibrating' ? 1 : mood === 'death' ? 0 : 1]);
        rig.t.title.textContent = n.title || ''; rig.t.big.textContent = n.big || ''; rig.t.unit.textContent = n.unit || '';
        rig.t.label.textContent = n.label || ''; rig.t.more.textContent = n.more || '';
        rig.t.fig.style.display = n.big ? '' : 'none';
        if (rig.mood !== mood) {
          rig.mood = mood;
          rig.target = { ...BASE, ...POSE[mood] };
          const old = rig.scroll.querySelector('.raven-seal'), neu = ctx.svg(sealMarkup(mood, ctx.rng(rig.seed + mood.length * 7)));
          if (old) old.replaceWith(neu); else rig.scroll.append(neu);
        }
      }

      function make(n) {
        const seed = 11 + (serial++) * 97;
        const root = ctx.el('div', 'raven');
        const bird = ctx.svg(birdMarkup(ctx.rng(5)));
        const hang = ctx.el('div', 'raven-hang');
        const cord = ctx.svg(`<svg class="raven-cord" viewBox="0 0 ${W} 26" aria-hidden="true"><g fill="none" stroke-linecap="round"><path d="M100 2C88 9 72 18 62 27M100 2C112 9 128 18 138 27" stroke="#3b2a12" stroke-width="2.300"/><path d="M100 2C88 9 72 18 62 27M100 2C112 9 128 18 138 27" stroke="#c9b283" stroke-width="1.100" stroke-dasharray="2.200 1.200"/></g><circle cx="100" cy="2.500" r="2.600" fill="#c9b283" stroke="#3b2a12" stroke-width=".9"/></svg>`);
        const scroll = ctx.el('div', 'raven-scroll'), rod = ctx.el('div', 'raven-rod'), wrap = ctx.el('div', 'raven-wrap');
        const sheet = ctx.el('div', 'raven-sheet'), text = ctx.el('div', 'raven-text'), curl = ctx.el('div', 'raven-curl');
        const t = { title: ctx.el('div', 'raven-title'), fig: ctx.el('div', 'raven-fig'), big: ctx.el('span', 'raven-big'), unit: ctx.el('span', 'raven-unit'), label: ctx.el('div', 'raven-label'), more: ctx.el('div', 'raven-more') };
        t.fig.append(t.big, t.unit); text.append(t.title, t.fig, t.label, t.more); sheet.append(text); wrap.append(sheet);
        scroll.append(rod, wrap, curl); hang.append(cord, scroll);
        const moult = ctx.svg(`<svg class="raven-moult" viewBox="0 0 10 24" aria-hidden="true">${feather(5, 1, 5.500, 23, 3.600, 'raven-f2')}</svg>`);
        root.append(hang, bird, moult);
        const q = (s) => bird.querySelector(s);
        const rig = {
          el: root, hang, scroll, t, seed, mood: null, target: { ...BASE }, pose: null,
          g: { all: q('.raven-all'), wl: q('.raven-wl'), wr: q('.raven-wr'), hl: q('.raven-wl .raven-hand'), hr: q('.raven-wr .raven-hand'), head: q('.raven-head'), jaw: q('.raven-jaw'), body: q('.raven-body'), tail: q('.raven-tail') },
          lean: 0, swing: 0, phase: 'read', phi: 0.6 + (seed % 7), w: 1.45, k: 0.72, last: performance.now(), seen: false, born: performance.now(),
        };
        fill(rig, n);
        rig.pose = { ...rig.target };
        apply(rig, 0);
        return rig;
      }

      function apply(rig, time) {
        const p = rig.pose, g = rig.g, ph = rig.phi;
        const s = Math.sin(ph + 0.45 * Math.sin(ph)), s2 = Math.sin(ph - 1.05 + 0.45 * Math.sin(ph - 1.05));
        const arm = p.a + 17 * p.amp * rig.k * s, hand = p.h + 15 * p.amp * rig.k * s2;
        const wt = `translate(${SH[0]} ${SH[1]}) rotate(${n1(arm)})`, ht = `rotate(${n1(hand)} ${WR[0]} ${WR[1]})`;
        g.wl.setAttribute('transform', wt); g.wr.setAttribute('transform', wt);
        g.hl.setAttribute('transform', ht); g.hr.setAttribute('transform', ht);
        const bob = 2.2 * rig.k * Math.sin(ph - 0.7);
        g.all.setAttribute('transform', `translate(0 ${n1(bob)}) rotate(${n1(rig.lean * 0.8 + p.tilt)} 100 84)`);
        g.body.setAttribute('transform', `translate(100 80) scale(${p.chest.toFixed(3)} 1) translate(-100 -80)`);
        g.tail.setAttribute('transform', `rotate(${n1(rig.swing * 0.9 - 2.5 * rig.k * s2)} 100 99)`);
        const nod = Math.sin(time * 0.0011 + rig.seed) * 1.6;
        const fl = Math.abs(p.flip) < 0.08 ? 0.08 : p.flip;
        g.head.setAttribute('transform', `translate(100 ${n1(54 + p.hy - bob * 0.5)}) rotate(${n1((p.hr + nod - rig.lean * 0.6) * Math.sign(fl))}) scale(${(fl * 1.17).toFixed(2)} 1.17)`);
        const croak = p.jaw * (0.55 + 0.45 * Math.sin(time * 0.0052));
        g.jaw.setAttribute('transform', `rotate(${n1(-croak)} -12.500 -10.800)`);
        rig.hang.style.transform = `translateY(${n1(bob)}px) rotate(${n1(rig.swing)}deg)`;
      }

      function tick(now) {
        for (const rig of rigs) {
          if (rig.el.isConnected) rig.seen = true;
          else if (rig.seen || now - rig.born > 3000) { rigs.delete(rig); continue; }
          const dt = Math.min(50, now - rig.last); rig.last = now;
          const e = Math.min(1, dt * 0.005);
          for (const k of KEYS) rig.pose[k] += (rig.target[k] - rig.pose[k]) * e;
          const wT = rig.phase === 'arrive' ? 3.1 : rig.phase === 'leave' ? 2.4 : 1.4;
          const kT = rig.phase === 'arrive' ? 1.25 : rig.phase === 'leave' ? 1 : 0.72;
          rig.w += (wT - rig.w) * Math.min(1, dt * 0.002); rig.k += (kT - rig.k) * Math.min(1, dt * 0.002);
          rig.phi += dt * 0.001 * 6.283 * rig.w * rig.pose.f * (0.5 + 0.5 * ctx.pace());
          apply(rig, now);
        }
        if (rigs.size) requestAnimationFrame(tick); else ticking = false;
      }
      const run = (rig) => {
        if (ctx.reduced) return;
        rigs.add(rig);
        if (!ticking) { ticking = true; requestAnimationFrame(tick); }
      };

      const flights = new Set();
      return {
        show(n) {
          const rig = make(n);
          rig.el.style.visibility = 'hidden';
          ctx.front.append(rig.el);
          let h = rig.el.offsetHeight;
          if (n.kind === 'kill' && !n.more) h += 44; // room for the names when kills join
          rig.el.style.visibility = '';
          const unroll = !ctx.reduced && n.kind !== 'death';
          if (unroll) rig.el.classList.add('raven-rolled');
          rig.phase = 'arrive'; rig.w = 3.1; rig.k = 1.25;
          const fl = ctx.fly(rig.el, { w: W, h, frame(f) { rig.lean = f.lean; rig.swing = f.swing; rig.phase = f.phase; } });
          const timer = unroll ? setTimeout(() => rig.el.classList.remove('raven-rolled'), 1500 / ctx.pace()) : 0;
          const entry = { fl, timer, rig };
          flights.add(entry);
          fl.gone.then(() => { flights.delete(entry); rigs.delete(rig); clearTimeout(timer); });
          run(rig);
          return {
            update(m) {
              fill(rig, m);
              if (ctx.reduced) { rig.pose = { ...rig.target }; apply(rig, 0); }
              rig.scroll.classList.remove('raven-bump'); void rig.scroll.offsetWidth; rig.scroll.classList.add('raven-bump');
              fl.extend(1500);
            },
          };
        },
        still(n) {
          const rig = make(n);
          rig.phi = 0.9; apply(rig, 0);
          run(rig);
          return rig.el;
        },
        clear() {
          for (const e of [...flights]) { clearTimeout(e.timer); e.fl.end(); }
          flights.clear(); rigs.forEach((r) => { if (r.el.closest('#l-front,#l-sky')) rigs.delete(r); });
        },
      };
    },
  });
})();
