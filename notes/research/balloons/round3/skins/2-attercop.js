// Round 3, direction 2: "Attercop". A Mirkwood orb-weaver lets itself down on
// one silk thread from above the screen, shows what it has caught (the kill,
// wrapped for the larder, with a luggage tag tied on) and hauls it all back up.
// Drawn as a natural-history plate: a solid, shaded spider seen from the back.
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const K = 1.25, SPIN = 56, GRIP = 77, TAGW = 186, TIE = 16;
  const f = (v) => Math.round(v * 10) / 10, rad = Math.PI / 180;
  const card = (p1, p2, edge, ew, inner) => {
    const e = ew / 2 + .3;
    return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='${NS}' width='60' height='60'><defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${p1}'/><stop offset='1' stop-color='${p2}'/></linearGradient></defs><path d='M10.5,${e}H49.5L${60 - e},10.5V${60 - e}H${e}V10.5Z' fill='url(#g)' stroke='${edge}' stroke-width='${ew}' stroke-linejoin='round'/>${inner ? `<path d='M12.2,4.5H47.8L55.5,12.2V55.5H4.5V12.2Z' fill='none' stroke='${inner}' stroke-width='.6'/>` : ''}</svg>`)}")`;
  };

  Harness.css('attercop', `
.attercop-rig{position:absolute;top:0;width:0;height:0;transform-origin:0 0;--attercop-edge:rgba(24,16,10,0);--attercop-ink:#2a1c10;--attercop-dim:rgba(42,28,16,.72)}
.attercop-rig[data-sky=dusk]{--attercop-edge:rgba(24,16,10,.45)}
.attercop-rig[data-sky=day],.attercop-rig[data-sky=overcast]{--attercop-edge:rgba(24,16,10,.8)}
.attercop-sway,.attercop-drop,.attercop-hang,.attercop-tw,.attercop-chain{position:absolute;left:0;top:0;width:0;height:0}
.attercop-sway,.attercop-hang,.attercop-tw{transform-origin:0 0;animation:attercop-sw 2.3s ease-in-out var(--attercop-ph,0s) infinite alternate}
.attercop-sway{--attercop-amp:.8deg}
.attercop-hang{--attercop-amp:1deg;animation-delay:calc(var(--attercop-ph,0s) - .5s)}
.attercop-tw{--attercop-amp:1.5deg;animation-delay:calc(var(--attercop-ph,0s) - 1s);transition:top .4s cubic-bezier(.3,1.5,.5,1)}
@keyframes attercop-sw{from{transform:rotate(calc(var(--attercop-amp)*-1))}to{transform:rotate(var(--attercop-amp))}}
.attercop-svg{position:absolute;left:0;top:0;width:1px;height:1px;overflow:visible}
.attercop-silk{position:absolute;left:-1.1px;width:2.2px;background:linear-gradient(90deg,var(--attercop-edge) 0 26%,#f6f2e4 26% 76%,var(--attercop-edge) 76%);
  -webkit-mask-image:repeating-linear-gradient(180deg,#000 0 19px,rgba(0,0,0,.62) 21px 24px,#000 26px 47px,rgba(0,0,0,.75) 49px 51px,#000 53px 71px);mask-image:repeating-linear-gradient(180deg,#000 0 19px,rgba(0,0,0,.62) 21px 24px,#000 26px 47px,rgba(0,0,0,.75) 49px 51px,#000 53px 71px)}
.attercop-rig[data-sky=night] .attercop-silk{opacity:.86}
.attercop-ln{fill:none;stroke:#f4f0e1;stroke-width:.9;stroke-linecap:round}
.attercop-lines{filter:drop-shadow(0 0 .45px rgba(24,16,10,.95))}
.attercop-rim{filter:url(#attercop-rim)}
.attercop-rig[data-sky=day] .attercop-rim,.attercop-rig[data-sky=overcast] .attercop-rim{filter:url(#attercop-rimd)}
.attercop-hair{fill:none;stroke:#120b06;stroke-width:.36;stroke-linecap:round}
.attercop-j{animation:attercop-j var(--d) ease-in-out var(--dl) infinite alternate}
@keyframes attercop-j{from{transform:rotate(calc(var(--a)*var(--attercop-k,1)*-1))}to{transform:rotate(calc(var(--a)*var(--attercop-k,1)))}}
.attercop-abd{transform-origin:0 5px;animation:attercop-abd 3.1s ease-in-out infinite alternate}
@keyframes attercop-abd{from{transform:rotate(-1.3deg)}to{transform:rotate(1.3deg)}}
.attercop-haul .attercop-spider{--attercop-k:3}
.attercop-haul .attercop-j{animation-duration:.24s}
.attercop-strain .attercop-spider{--attercop-k:.45}
.attercop-strain .attercop-spider>g{animation:attercop-trem .11s linear infinite alternate}
@keyframes attercop-trem{from{transform:translate(-.25px,0)}to{transform:translate(.25px,.3px)}}
.attercop-strain .attercop-drop{animation:attercop-creak 3.3s ease-in-out infinite}
@keyframes attercop-creak{0%,42%,64%,100%{transform:none}46%{transform:translateY(2.2px)}50%{transform:translateY(.6px)}54%{transform:translateY(1.8px)}}
.attercop-turn .attercop-l4{--attercop-k:3.2}
.attercop-turn .attercop-l4 .attercop-j{animation-duration:.42s}
.attercop-wind{animation:attercop-wind .9s linear infinite}
@keyframes attercop-wind{to{transform:translateY(4.6px)}}
.attercop-twitch{transform-origin:0 0;animation:attercop-twitch 2.6s linear infinite}
@keyframes attercop-twitch{0%,30%,52%,100%{transform:none}33%{transform:rotate(5deg)}36%{transform:rotate(-4deg)}39%{transform:rotate(3deg)}42%{transform:rotate(-1deg)}45%{transform:none}80%{transform:rotate(-4deg)}84%{transform:rotate(3deg)}88%{transform:none}}
.attercop-web path{fill:none;stroke:#f1ecdc;stroke-width:.7;stroke-linecap:round;stroke-dasharray:1;opacity:.78}
.attercop-web{filter:drop-shadow(0 0 .5px var(--attercop-edge))}
.attercop-spin path{animation:attercop-draw var(--t,.5s) ease-out var(--w,0s) both}
@keyframes attercop-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
.attercop-calm *{animation-play-state:paused!important}
.attercop-tag{position:absolute;left:${-TAGW / 2}px;top:${TIE - 9}px;width:${TAGW}px;box-sizing:border-box;border:1px solid transparent;border-image:${card('#efe5c6', '#dccb9f', '#3d2c1a', 1, 'rgba(61,44,26,.5)')} 16 fill/16px stretch;
  padding:17px 12px 9px;text-align:center;color:var(--attercop-ink);filter:drop-shadow(0 2px 3px rgba(0,0,0,.42))}
.attercop-rig[data-sky=night] .attercop-tag{filter:brightness(.95) drop-shadow(0 2px 4px rgba(0,0,0,.6))}
.attercop-tag::before{content:"";position:absolute;inset:0;clip-path:polygon(11px 1px,calc(100% - 11px) 1px,calc(100% - 1px) 11px,calc(100% - 1px) calc(100% - 1px),1px calc(100% - 1px),1px 11px);
  background:radial-gradient(40px 26px at 12% 88%,rgba(120,80,30,.16),transparent),radial-gradient(60px 30px at 92% 16%,rgba(120,80,30,.13),transparent),radial-gradient(18px 12px at 70% 70%,rgba(120,80,30,.09),transparent)}
.attercop-tag>div{position:relative}
.attercop-tag>div:empty{display:none}
.attercop-tag[data-kind=levelup]{border-image-source:${card('#f7edc8', '#e7d096', '#b0842a', 2.6, '#8a6418')}}
.attercop-tag[data-kind=death]{border-image-source:${card('#f0ede3', '#dcd8cb', '#15110d', 5, '')};padding-top:20px;padding-bottom:12px}
.attercop-tag[data-kind=achievement]{padding-top:27px;padding-bottom:22px}
.attercop-tag[data-kind=death] .attercop-note{margin-inline:0}
.attercop-eye{position:absolute!important;left:50%;top:5px;width:6px;height:6px;margin-left:-4px;border-radius:50%;background:#1a130d;border:1px solid #8c7648;box-shadow:0 0 0 .6px rgba(30,20,10,.6)}
.attercop-tag[data-kind=death] .attercop-eye{top:8px}
.attercop-kick{font:400 11px/1.3 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.26em;margin-right:-.26em;color:var(--attercop-dim);padding-bottom:3px}
.attercop-title{font:400 17.5px/1.13 "IM Fell English",Georgia,serif;text-wrap:balance;overflow-wrap:anywhere}
.attercop-fig{font:600 38px/1 "Cormorant Garamond",Georgia,serif;font-variant-numeric:lining-nums;white-space:nowrap;margin-top:1px}
.attercop-unit{font:italic 500 17px/1 "Cormorant Garamond",Georgia,serif;margin-left:5px;color:var(--attercop-dim)}
.attercop-rate{display:flex;justify-content:center;align-items:center;gap:8px;margin-top:4px}
.attercop-rate svg{display:block;overflow:visible}
.attercop-rate .attercop-on{fill:var(--attercop-ink)}
.attercop-rate .attercop-off{fill:none;stroke:var(--attercop-ink);stroke-width:.7;opacity:.5}
.attercop-word{font:400 13px/1 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.2em;margin-right:-.2em}
.attercop-word:empty{display:none}
.attercop-tag[data-mood=pvp] .attercop-word{color:#8e1c0e}
.attercop-tag[data-mood=pvp] .attercop-on{fill:#a32313}
.attercop-more{font:italic 500 14px/1.14 "Cormorant Garamond",Georgia,serif;margin-top:5px;text-wrap:balance}
.attercop-note{font:italic 400 12.5px/1.2 "IM Fell English",Georgia,serif;color:var(--attercop-dim);margin:6px 14px 0;padding-top:4px;border-top:1px solid rgba(42,28,16,.3)}
.attercop-tag[data-kind=death] .attercop-fig{font:400 25px/1.15 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.18em;margin-right:-.18em}
.attercop-tag[data-kind=levelup] .attercop-fig{font-size:34px;margin-top:2px}
.attercop-tag[data-kind=achievement] .attercop-title{font:italic 500 16px/1.16 "Cormorant Garamond",Georgia,serif}
.attercop-seal{position:absolute;left:50%;bottom:-13px;width:1px;height:1px;overflow:visible}
.attercop-still{position:relative;width:230px;height:300px}
`);

  // ---- shared paint servers (one hidden <svg> in the page) ----
  const stops = (...s) => s.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ''}/>`).join('');
  const lin = (id, x2, y2, ...s) => `<linearGradient id="attercop-${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops(...s)}</linearGradient>`;
  const radg = (id, cx, cy, r, ...s) => `<radialGradient id="attercop-${id}" cx="${cx}" cy="${cy}" r="${r}">${stops(...s)}</radialGradient>`;
  const rim = (id, col, a, halo) => `<filter id="attercop-${id}" x="-40%" y="-40%" width="180%" height="180%" color-interpolation-filters="sRGB"><feOffset in="SourceAlpha" dx="-.75" dy="-.8" result="o"/><feFlood flood-color="${col}" flood-opacity="${a}"/><feComposite in2="o" operator="in" result="r"/><feMorphology in="SourceAlpha" operator="dilate" radius=".4" result="d"/><feFlood flood-color="${col}" flood-opacity="${halo}"/><feComposite in2="d" operator="in" result="h"/><feMerge><feMergeNode in="h"/><feMergeNode in="r"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  function defs() {
    let d = document.getElementById('attercop-defs');
    if (d) return d;
    const t = document.createElement('template');
    t.innerHTML = `<svg id="attercop-defs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
${lin('leg', 0, 1, [0, '#96714a'], [.25, '#4a3220'], [.6, '#1d120a'], [1, '#0a0604'])}
${lin('band', 0, 1, [0, '#e2c998'], [.45, '#a07d4c'], [1, '#4a341e'])}
${radg('ceph', .38, .34, .75, [0, '#b89064'], [.45, '#6a4a2e'], [.85, '#26170d'], [1, '#100905'])}
${radg('abd', .34, .26, .85, [0, '#c79c66'], [.3, '#8a6238'], [.62, '#472e1a'], [.9, '#1c110a'], [1, '#0d0704'])}
${radg('sheen', .5, .5, .5, [0, '#fff', .5], [1, '#fff', 0])}
<linearGradient id="attercop-hat" gradientUnits="userSpaceOnUse" x1="-14" y1="0" x2="14" y2="0">${stops([0, '#0a0604', 0], [.42, '#0a0604', 0], [1, '#0a0604', .85])}</linearGradient>
<linearGradient id="attercop-hat2" gradientUnits="userSpaceOnUse" x1="-14" y1="0" x2="14" y2="0">${stops([0, '#f6e4bc', .5], [.4, '#f6e4bc', 0], [1, '#f6e4bc', 0])}</linearGradient>
${radg('silk', .34, .3, .82, [0, '#fffdf4'], [.45, '#e6e1cf'], [.8, '#b3ac9a'], [1, '#857e6c'])}
${radg('lump', .5, .5, .5, [0, '#2a1d12', .34], [.7, '#2a1d12', .12], [1, '#2a1d12', 0])}
${lin('stl', 1, 0, [0, '#e4e8eb'], [.45, '#7f8890'], [1, '#2e3439'])}
${lin('shade', 1, .15, [0, '#fff', .0], [.5, '#2a2216', 0], [1, '#2a2216', .5])}
${lin('lea', 1, 0, [0, '#9a6f40'], [.5, '#4a2f18'], [1, '#1d1209'])}
${lin('fur', 1, .3, [0, '#b3a48e'], [1, '#463c30'])}
${lin('gold', .9, 1, [0, '#fff0b4'], [.4, '#e3b84e'], [1, '#8f6417'])}
${lin('linen', 0, 1, [0, '#fbf8ee'], [.5, '#d6d0be'], [1, '#8a8474'])}
${radg('wax', .36, .3, .8, [0, '#d5503c'], [.5, '#a3200f'], [1, '#5c0c06'])}
${rim('rim', '#e6e8f2', .9, .3)}${rim('rimd', '#f7ecd0', .75, .22)}
</defs></svg>`;
    d = t.content.firstElementChild; document.body.append(d);
    return d;
  }
  function clip(id, d) {
    if (document.getElementById(id)) return;
    const c = document.createElementNS(NS, 'clipPath'), p = document.createElementNS(NS, 'path');
    c.id = id; p.setAttribute('d', d); c.append(p); defs().firstElementChild.append(c);
  }

  // An egg outline, top at (0,0), bottom at (0,h): p moves the widest part, q rounds the ends.
  function blob(w, h, p, q, lump = 0, ph = 0) {
    const N = 18, R = [];
    for (let i = 0; i <= N; i++) { const t = i / N; R.push([(w / 2) * Math.pow(Math.sin(Math.PI * Math.pow(t, p)), q) * (1 + lump * Math.sin(t * 11 + ph)), t * h]); }
    const P = R.concat(R.slice(1, N).reverse().map(([x, y]) => [-x * (1 + lump * .6 * Math.sin(y * .4 + ph)), y])), n = P.length, mid = (a, b) => `${f((a[0] + b[0]) / 2)},${f((a[1] + b[1]) / 2)}`;
    let d = 'M' + mid(P[n - 1], P[0]);
    for (let i = 0; i < n; i++) d += `Q${f(P[i][0])},${f(P[i][1])} ${mid(P[i], P[(i + 1) % n])}`;
    return { d: d + 'Z', R };
  }

  // ---- the spider (units: about 0.8 px; the head is up, seen from the back) ----
  const seg = (L, a, b, m) => `M0,${-a}Q${f(L * .45)},${-m} ${L},${-b}A${b},${b} 0 0 1 ${L},${b}Q${f(L * .45)},${m} 0,${a}A${a},${a} 0 0 1 0,${-a}Z`;
  const band = (L, a, b, u, v) => { const h0 = (a + (b - a) * u) * .96, h1 = (a + (b - a) * v) * .96; return `<path d="M${f(L * u)},${f(-h0)}L${f(L * v)},${f(-h1)}V${f(h1)}L${f(L * u)},${f(h0)}Z" fill="url(#attercop-band)" opacity=".85"/>`; };
  const spines = (L, a, b, n) => { let d = ''; for (let i = 1; i <= n; i++) { const u = i / (n + 1), x = L * u, h = a + (b - a) * u; d += `M${f(x)},${f(-h)}l1,-1.1M${f(x + 1.4)},${f(h)}l1,1.1`; } return `<path d="${d}" class="attercop-hair"/>`; };
  const part = (L, a, b, m, u, v, n) => `<path d="${seg(L, a, b, m)}" fill="url(#attercop-leg)"/>${band(L, a, b, u, v)}${n ? spines(L, a, b, n) : ''}`;
  const jn = (i, amp) => `class="attercop-j" style="--a:${f(amp)}deg;--d:${f(2.1 + ((i * 7) % 11) * .19)}s;--dl:${-f(((i * 5) % 9) * .37)}s"`;
  const LEGS = [[4, -5.5, [21, 20, 19], 3.4, 1, 1], [5.2, -2, [16, 15, 14], 3.2, -1, 1.6], [6, 1.5, [11, 10.5, 10], 2.6, -1, 1.8], [5, 4.8, [20, 18, 17], 3.1, -1, 1.4]];
  function leg(i, [fa, tx, ty]) {
    const [cx, cy, [L1, L2, L3], w, bend, amp] = LEGS[i % 4], A0 = fa * rad, kx = cx + L1 * Math.cos(A0), ky = cy + L1 * Math.sin(A0);
    const d = Math.max(Math.abs(L2 - L3) + .2, Math.min(L2 + L3 - .2, Math.hypot(tx - kx, ty - ky)));
    const base = Math.atan2(ty - ky, tx - kx), A = Math.acos((L2 * L2 + d * d - L3 * L3) / (2 * L2 * d));
    const ta = base + bend * A, ax = kx + L2 * Math.cos(ta), ay = ky + L2 * Math.sin(ta), ma = Math.atan2(ty - ay, tx - ax), a = w / 2;
    return `<g ${i % 4 === 3 ? 'class="attercop-l4" ' : ''}transform="translate(${cx},${cy}) rotate(${f(fa)})"><g ${jn(i, amp)}>${part(L1, a * .82, a * .8, a * 1.12, .5, .8, 0)}`
      + `<g transform="translate(${L1},0) rotate(${f((ta - A0) / rad)})"><g ${jn(i + 8, amp * 1.5)}><ellipse cx=".6" rx="${f(a * .95)}" ry="${f(a * .92)}" fill="#1c120a"/>${part(L2, a * .8, a * .56, a * .82, .42, .78, 2)}`
      + `<g transform="translate(${L2},0) rotate(${f((ma - ta) / rad)})"><g ${jn(i + 16, amp * 2)}><circle r="${f(a * .6)}" fill="#1c120a"/>${part(L3, a * .52, a * .2, a * .36, .3, .58, 0)}</g></g></g></g></g></g>`;
  }
  // femur angle and where the foot goes, right legs I–IV then left (mirrored) I–IV
  const POSE = {
    rest: [[-68, .3, -61], [-36, 36, -30], [12, 27, 20], [44, 8, 48], [-64, .3, -55], [-29, 37, -24], [6, 29, 15], [41, 10, 45]],
    braced: [[-70, .3, -62], [-18, 38, -12], [2, 31, 12], [50, 9, 52], [-66, .3, -56], [-12, 38, -6], [-3, 32, 9], [48, 10, 51]],
    wrap: [[-68, .3, -61], [-36, 36, -30], [12, 27, 20], [50, 7, 54], [-64, .3, -55], [-29, 37, -24], [6, 29, 15], [47, 6, 52]],
    hold: [[-68, .3, -61], [-32, 37, -27], [14, 27, 21], [40, 16, 51], [-64, .3, -55], [-26, 37, -22], [10, 28, 18], [40, 16, 51]],
    proud: [[-68, .3, -61], [-48, 31, -40], [10, 28, 18], [44, 8, 48], [-64, .3, -55], [-43, 33, -36], [5, 29, 14], [41, 10, 45]],
  };
  const ABD = blob(27.6, 40, .63, .7);
  function spider(pose) {
    clip('attercop-c-abd', ABD.d);
    const P = POSE[pose], side = (o) => [3, 2, 1, 0].map((i) => leg(i + o, P[i + o])).join('');
    let hat = '', hairs = '';
    for (let y = -3; y < 40; y += 1.7) hat += `M-15,${f(y)}Q0,${f(y + 5.5)} 15,${f(y)}`;
    ABD.R.forEach(([x, y], i) => { if (i > 2 && i < 17 && i % 2) { const k = i / 18, dy = (k - .4) * 1.6; hairs += `M${f(x - .4)},${f(y)}l1.3,${f(dy)}M${f(-x + .4)},${f(y)}l-1.3,${f(dy)}`; } });
    const spots = [[0, 6.5, 1, 1.9], [0, 11.2, 1.15, 2.3], [0, 16.2, .9, 1.9], [0, 20.4, .7, 1.4], [3.7, 11, 1.6, .9], [-3.7, 11, 1.6, .9], [6.6, 10.5, 1.1, .75], [-6.6, 10.5, 1.1, .75], [2.7, 19.4, .7, .7], [-2.7, 19.4, .7, .7], [2.3, 24.2, .6, .6], [-2.3, 24.2, .6, .6], [1.8, 28.6, .5, .5], [-1.8, 28.6, .5, .5], [1.3, 32.4, .45, .45], [-1.3, 32.4, .45, .45]]
      .map(([x, y, rx, ry]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"/>`).join('');
    const fol = 'M0,3.6C4,3.6 8.8,6.2 8.8,10C8.8,12 6.7,12.8 6.8,14.6C6.9,16.2 7.7,17 7.3,19C7,20.6 5.3,21 5.4,22.8C5.5,24.2 6.1,25.2 5.5,26.8C5.1,28.2 3.8,28.6 3.8,30.2C3.8,31.6 4,32.4 3.1,34C2.5,35.4 1,36.8 0,37.4';
    return `<g transform="scale(${K})"><g class="attercop-rim"><g transform="scale(-1,1)">${side(4)}</g>${side(0)}</g>
<g class="attercop-rim"><path d="M1.5,-8.6C2.8,-11 2.7,-13.2 1.3,-14.6M-1.5,-8.6C-2.8,-11 -2.7,-13.2 -1.3,-14.6" fill="none" stroke="#3a2616" stroke-width="1.9" stroke-linecap="round"/>
<path d="M0,-10.4C3.4,-10.4 4.5,-8 4.7,-5.4C7.2,-3.2 7.6,2.2 6.2,5.4C4.6,8.2 -4.6,8.2 -6.2,5.4C-7.6,2.2 -7.2,-3.2 -4.7,-5.4C-4.5,-8 -3.4,-10.4 0,-10.4Z" fill="url(#attercop-ceph)" stroke="#0c0705" stroke-width=".4"/>
<path d="M0,-2.4V2.2M-3.9,-5.6Q0,-1.6 3.9,-5.6M0,0L5.6,-3.4M0,0L6.4,.6M0,0L5.4,4.4M0,0L-5.6,-3.4M0,0L-6.4,.6M0,0L-5.4,4.4" fill="none" stroke="#0c0705" stroke-width=".4" opacity=".6"/>
<path d="M-3.4,-7.6C-3.2,-9 -2,-9.7 -.6,-9.8M-5.9,-1.8C-6.1,.6 -5.9,2.6 -5.2,4.2" fill="none" stroke="#f1dfb8" stroke-width=".5" opacity=".6" stroke-linecap="round"/>
<g transform="translate(0,4.6)"><g class="attercop-abd"><path d="${hairs}" class="attercop-hair"/>
<path d="M-1.6,38.6l-.5,2.6M1.6,38.6l.5,2.6M0,39v3" stroke="#2a1a0e" stroke-width="1.6" stroke-linecap="round"/>
<path d="${ABD.d}" fill="url(#attercop-abd)" stroke="#0c0705" stroke-width=".45"/>
<g clip-path="url(#attercop-c-abd)"><path d="${fol}" fill="#150c06" fill-opacity=".5" stroke="#ecd9ae" stroke-width=".45"/><path d="${fol}" transform="scale(-1,1)" fill="#150c06" fill-opacity=".5" stroke="#ecd9ae" stroke-width=".45"/>
<path d="${hat}" fill="none" stroke="url(#attercop-hat)" stroke-width=".4"/><path d="${hat}" fill="none" stroke="url(#attercop-hat2)" stroke-width=".35"/>
<g fill="#f3e4bd">${spots}</g><ellipse cx="-5.6" cy="11.5" rx="4" ry="8.5" transform="rotate(14 -5.6 11.5)" fill="url(#attercop-sheen)"/></g></g></g></g></g>`;
  }

  // ---- what hangs below: bundles and the rest ----
  const boot = (x, y, r, s) => `<g transform="translate(${x},${y}) rotate(${r}) scale(${s})"><path d="M-3.2,-4L3.2,-4L3.4,6.5C6.5,7 10,8.4 10.4,10.6L10.4,12L-3.6,12Z" fill="url(#attercop-lea)" stroke="#120b06" stroke-width=".5"/><path d="M-3.8,12h14.4v1.4h-9.4v1h-5z" fill="#0f0905"/><path d="M-3.1,1.6Q0,2.8 3.3,1.6M-3.2,4Q0,5.2 3.4,4M4.5,7.6Q7,8.3 9,10" fill="none" stroke="#0f0905" stroke-width=".4" opacity=".75"/></g>`;
  const helm = (x, y, r, s) => `<g transform="translate(${x},${y}) rotate(${r}) scale(${s})"><path d="M-7.5,3C-7.8,-6 -3.5,-10.5 -1.1,-11.4L0,-20L1.1,-11.4C3.5,-10.5 7.8,-6 7.5,3Z" fill="url(#attercop-stl)" stroke="#16181b" stroke-width=".5"/><path d="M0,-11V3M-7.5,-1H7.5M-7.6,.6H7.6" fill="none" stroke="#16181b" stroke-width=".4" opacity=".7"/><path d="M-5,-.2h.1M-2.5,-.2h.1M2.5,-.2h.1M5,-.2h.1" stroke="#eef1f3" stroke-width=".8" stroke-linecap="round"/></g>`;
  const blade = (x, y, r, s) => `<g transform="translate(${x},${y}) rotate(${r}) scale(${s})"><path d="M-2.5,3L-2.5,-15L0,-23L2.5,-15L2.5,3Z" fill="url(#attercop-stl)" stroke="#16181b" stroke-width=".5"/><path d="M0,-21V3" fill="none" stroke="#16181b" stroke-width=".35" opacity=".7"/></g>`;
  const tail = (x, y, s) => `<g transform="translate(${x},${y}) scale(${s})" fill="none" stroke-linecap="round"><path d="M0,0C-2,5 4.5,7 3.4,12C2.6,15.6 -2.6,15 -2,11.4" stroke="#241811" stroke-width="1.7"/><path d="M0,0C-2,5 4.5,7 3.4,12C2.6,15.6 -2.6,15 -2,11.4" stroke="#c9a994" stroke-width=".9"/></g>`;
  const brush = (x, y, r, s) => `<g transform="translate(${x},${y}) rotate(${r}) scale(${s})"><path d="M0,0C5,2 11,9 9.5,20C8,16 6.5,17 5.5,13.4C3.8,15.4 2.6,11.4 1,8.8C-.6,7 -1.6,3 0,0Z" fill="url(#attercop-fur)" stroke="#16100a" stroke-width=".5" stroke-linejoin="round"/><path d="M1.4,3.2Q5,7 6.6,13M3.4,3.6Q7.4,8 8.4,15M.8,5.6Q2.6,8 3.6,11" fill="none" stroke="#16100a" stroke-width=".35" opacity=".7"/></g>`;
  function cocoon(key, w, h, p, o = {}) {
    const b = blob(w, h, p, .6, o.lump || 0, key.length * 2.1), id = 'attercop-c-' + key, hw = w / 2 + 1;
    clip(id, b.d);
    let a = '', c = '', fl = '';
    for (let y = -w * .55 - 6; y < h; y += 2.3) a += `M${-hw},${f(y)}Q0,${f(y + w * .36)} ${hw},${f(y + w * .55)}`;
    for (let y = 2; y < h + w * .5; y += 4.3) c += `M${-hw},${f(y)}Q0,${f(y - w * .08)} ${hw},${f(y - w * .46)}`;
    [4, 9, 13].forEach((i, j) => { const [x, y] = b.R[i], s = j % 2 ? -1 : 1; fl += `M${f(s * x)},${f(y)}q${s * 2.5},${j - 1.4} ${s * (3 + j)},${1.5 - j}`; });
    return `<path d="M0,-3L${f(-b.R[2][0] * .8)},${f(b.R[2][1])}M0,-3L${f(b.R[2][0] * .8)},${f(b.R[2][1])}M0,${h - 1}v4" class="attercop-ln"/>
<path d="${b.d}" fill="url(#attercop-silk)" stroke="#2b2318" stroke-width=".7"/><g clip-path="url(#${id})"><ellipse cx="${f(w * .04)}" cy="${f(h * (p > 1 ? .6 : .52))}" rx="${f(w * .4)}" ry="${f(h * .38)}" fill="url(#attercop-lump)"/>
<path d="${a}" fill="none" stroke="#51483a" stroke-width=".5" opacity=".8"${o.wind ? ' class="attercop-wind"' : ''}/><path d="${c}" fill="none" stroke="#51483a" stroke-width=".45" opacity=".5"/><path d="${b.d}" fill="url(#attercop-shade)"/></g><path d="${fl}" class="attercop-ln" stroke-width=".5"/>`;
  }
  const R4 = (m) => `<g class="attercop-rim">${m}</g>`;
  const ITEM = {
    poor: () => ({ h: 19, m: R4(tail(1, 16, .95)) + cocoon('poor', 13, 19, 1) }),
    meh: () => ({ h: 34, m: R4(brush(5, 21, -22, 1.15)) + cocoon('meh', 23, 34, 1.05, { lump: .05 }) }),
    good: () => ({ h: 48, m: R4(boot(8, 36, -30, 1.3)) + cocoon('good', 33, 48, 1.12, { lump: .05 }) }),
    great: () => ({ h: 60, m: R4(helm(9, 9, 30, 1.25) + `<g transform="scale(-1,1)">${boot(10, 46, -26, 1.3)}</g>`) + cocoon('great', 41, 60, 1.15, { lump: .05 }) }),
    superb: () => ({ h: 92, m: R4(boot(16, 72, -24, 1.9) + `<g transform="scale(-1,1)">${helm(15, 20, 36, 1.5)}</g>`) + cocoon('superb', 62, 92, 1.5, { lump: .05 }) + '<path d="M-19,60Q0,69 21,59M-23,70Q0,80 24,69" fill="none" stroke="#4d4536" stroke-width=".8" opacity=".55"/>' }),
    pvp: () => ({ h: 54, cls: 'attercop-twitch', m: R4(blade(8, 14, 34, 1.25) + boot(7, 42, -28, 1.25)) + cocoon('pvp', 36, 54, 1.1, { lump: .06 }) }),
    calibrating: () => ({ h: 38, m: cocoon('cal', 26, 38, 1.05, { lump: .04, wind: 1 }) + '<path d="M-9,7Q-14,2 -8,-4M9,9Q15,3 7,-3" class="attercop-ln" stroke-width=".6"/>' }),
    s0: () => ({ h: 30, m: R4(boot(5, 21, -30, .95)) + cocoon('s0', 23, 30, 1.1, { lump: .05 }) }),
    s1: () => ({ h: 26, m: R4(brush(3, 16, -18, .85)) + cocoon('s1', 19, 26, 1, { lump: .05 }) }),
    s2: () => ({ h: 31, m: R4(helm(6, 6, 34, .85)) + cocoon('s2', 25, 31, 1.12, { lump: .05 }) }),
    s3: () => ({ h: 25, m: R4(`<g transform="scale(-1,1)">${boot(4, 17, -28, .9)}</g>`) + cocoon('s3', 18, 25, 1.05, { lump: .05 }) }),
    dots: () => ({ h: 20, m: '<g fill="#f4f0e1" stroke="#2b2318" stroke-width=".5"><ellipse cy="4" rx="2.6" ry="3.2"/><ellipse cy="11" rx="1.9" ry="2.4"/><ellipse cy="17" rx="1.3" ry="1.7"/></g>' }),
    crown: () => ({ h: 30, m: `<path d="M0,-4V1" class="attercop-ln"/><g class="attercop-rim"><path d="M-17,25L-20,6L-10,14L0,0L10,14L20,6L17,25Z" fill="url(#attercop-gold)" stroke="#3a2608" stroke-width=".7" stroke-linejoin="round"/><path d="M-17.6,24h35.2v5.4h-35.2z" fill="url(#attercop-gold)" stroke="#3a2608" stroke-width=".7" stroke-linejoin="round"/><g fill="url(#attercop-gold)" stroke="#3a2608" stroke-width=".6"><circle cx="-20" cy="5" r="2"/><circle cy="-1" r="2.4"/><circle cx="20" cy="5" r="2"/></g>
<path d="M4,9l9,11M7,8l8,10M12,16l5,6M14.5,14l3.4,4.4" fill="none" stroke="#3a2608" stroke-width=".4" opacity=".55"/><g stroke="#3a2608" stroke-width=".5"><path d="M0,24.8l2.6,1.9l-2.6,1.9l-2.6,-1.9z" fill="#a3200f"/><circle cx="-10" cy="26.7" r="1.3" fill="#2d5a46"/><circle cx="10" cy="26.7" r="1.3" fill="#2d5a46"/></g></g>` }),
    shroud: () => ({ h: 21, m: `<path d="M0,-3L-14,7M0,-3L14,7" class="attercop-ln"/><g class="attercop-rim"><path d="M-25,6.5H24A3.4,7.2 0 0 1 24,21H-25A3.4,7.2 0 0 1 -25,6.5Z" fill="url(#attercop-linen)" stroke="#2b2318" stroke-width=".6"/><ellipse cx="24" cy="13.75" rx="3.4" ry="7.2" fill="#e6e1d1" stroke="#2b2318" stroke-width=".6"/></g>
<path d="M24,9.4c-2.2,.6 -2.2,8 0,8.6c1.6,-.6 1.6,-5.6 .2,-6.2c-1.2,.6 -1,3.2 -.2,3.8M-24,10.6Q0,9.4 21,10.8M-26,16Q-6,17.4 21,16.4" fill="none" stroke="#2b2318" stroke-width=".45" opacity=".7"/>
<g fill="none"><path d="M-14,6.3v15M14,6.3v15" stroke="#2b2318" stroke-width="2.6"/><path d="M-14,6.3v15M14,6.3v15" stroke="#f6f2e4" stroke-width="1.6"/></g>` }),
  };
  const TIES = {
    silk: `<g class="attercop-lines"><path d="M0,-2C-2.4,4 -1.8,10 0,${TIE}M0,-2C2.4,4 1.8,10 0,${TIE}M0,${TIE}c-4.5,-3.4 -7,1 -2.4,1.7M0,${TIE}c4.5,-3.4 7,1 2.4,1.7M0,${TIE}l-2.2,5.4M0,${TIE}l2.6,5" class="attercop-ln"/></g>`,
    red: `<path d="M0,-2C-2.4,4 -1.8,10 0,${TIE}M0,-2C2.4,4 1.8,10 0,${TIE}M0,${TIE}c-5.5,-4.4 -8.4,1.4 -2.6,2M0,${TIE}c5.5,-4.4 8.4,1.4 2.6,2M0,${TIE}l-3,7M0,${TIE}l3.4,6.4" fill="none" stroke="#b3271a" stroke-width="1.4" stroke-linecap="round"/>`,
    gold: `<path d="M0,-1C-2.4,4 -1.8,10 0,${TIE}M0,-1C2.4,4 1.8,10 0,${TIE}M0,${TIE}c-4.5,-3.4 -7,1 -2.4,1.7M0,${TIE}c4.5,-3.4 7,1 2.4,1.7M0,${TIE}l-2.2,5.4M0,${TIE}l2.6,5" fill="none" stroke="#3a2608" stroke-width="1.9" stroke-linecap="round"/><path d="M0,-1C-2.4,4 -1.8,10 0,${TIE}M0,-1C2.4,4 1.8,10 0,${TIE}M0,${TIE}c-4.5,-3.4 -7,1 -2.4,1.7M0,${TIE}c4.5,-3.4 7,1 2.4,1.7M0,${TIE}l-2.2,5.4M0,${TIE}l2.6,5" fill="none" stroke="#e3b84e" stroke-width="1.1" stroke-linecap="round"/>`,
    black: `<path d="M0,-2V${TIE}M0,${TIE}c-4.5,-3.4 -7,1 -2.4,1.7M0,${TIE}c4.5,-3.4 7,1 2.4,1.7M0,${TIE}l-2.2,5.4M0,${TIE}l2.6,5" fill="none" stroke="#15110d" stroke-width="1.3" stroke-linecap="round"/>`,
    ribbon: `<g stroke="#4a0a05" stroke-width=".5" fill="#a3200f"><path d="M-1.9,-3h3.8V${TIE}h-3.8z"/><path d="M0,${TIE}C-5,${TIE - 7} -12,${TIE - 5} -10.5,${TIE}C-12,${TIE + 4} -5,${TIE + 5} 0,${TIE}ZM0,${TIE}C5,${TIE - 7} 12,${TIE - 5} 10.5,${TIE}C12,${TIE + 4} 5,${TIE + 5} 0,${TIE}Z"/><path d="M-1,${TIE}l-5.5,12l2.6,-.6l1.4,2.4l3.6,-12.6zM1,${TIE}l5.5,12l-2.6,-.6l-1.4,2.4l-3.6,-12.6z" fill="#8a160b"/><rect x="-2.2" y="${TIE - 2.2}" width="4.4" height="4.4" rx="1" fill="#b82a18"/></g>`,
  };
  const SEAL = (() => {
    let ray = '', edge = 'M';
    for (let i = 0; i < 8; i++) { const a = i * 45 * rad; ray += `M0,0L${f(Math.cos(a) * 6.4)},${f(Math.sin(a) * 6.4)}`; }
    for (let i = 0; i < 14; i++) { const a = i * (360 / 14) * rad, r = 12.4 + [1, -.5, .8, -.2, 1.2, 0, -.6][i % 7], q = (i + .5) * (360 / 14) * rad; edge += `${i ? 'Q' : ''}${i ? f(Math.cos(a - .22) * (r + 1.2)) + ',' + f(Math.sin(a - .22) * (r + 1.2)) + ' ' : ''}${f(Math.cos(q) * r)},${f(Math.sin(q) * r)}`; }
    return `<svg class="attercop-seal"><g style="filter:drop-shadow(0 1px 1.2px rgba(0,0,0,.5))"><path d="${edge}Z" fill="url(#attercop-wax)" stroke="#4a0a05" stroke-width=".5"/><circle r="8.6" fill="none" stroke="#5c0c06" stroke-width=".8" opacity=".8"/><path d="${ray}" stroke="#5c0c06" stroke-width=".6" opacity=".85"/><path d="M4,0L2.8,2.8L0,4L-2.8,2.8L-4,0L-2.8,-2.8L0,-4L2.8,-2.8ZM6.4,0L4.5,4.5L0,6.4L-4.5,4.5L-6.4,0L-4.5,-4.5L0,-6.4L4.5,-4.5Z" fill="none" stroke="#5c0c06" stroke-width=".5" opacity=".85"/><path d="M-9,-5.4C-7.6,-8.4 -5,-10 -2.4,-10.6" fill="none" stroke="#ffb7a4" stroke-width=".9" stroke-linecap="round" opacity=".7"/></g></svg>`;
  })();
  function web(R, rng, spin, pace) {
    const n = 12, ray = [];
    let m = '', k = 0;
    for (let i = 0; i < n; i++) { const a = (10 + i * (160 / (n - 1)) + (rng() - .5) * 5) * rad, L = R * (.8 + rng() * .2); ray.push([Math.cos(a), Math.sin(a), L]); m += `<path pathLength="1" style="--w:${f(i * .03 / pace)}s;--t:${f(.45 / pace)}s" d="M0,0L${f(ray[i][0] * L)},${f(ray[i][1] * L)}"/>`; }
    for (let r = 13; r < R; r += 7 + r * .035, k++) {
      let d = '';
      for (let i = 0; i < n; i++) {
        const rr = r + i * .5; if (rr > ray[i][2]) { continue; }
        const x = ray[i][0] * rr, y = ray[i][1] * rr;
        if (!d) d = `M${f(x)},${f(y)}`; else { const j = i - 1, mx = (ray[j][0] + ray[i][0]) / 2 * rr * .93, my = (ray[j][1] + ray[i][1]) / 2 * rr * .93; d += `Q${f(mx)},${f(my)} ${f(x)},${f(y)}`; }
      }
      m += `<path pathLength="1" style="--w:${f((.35 + k * .07) / pace)}s;--t:${f(.4 / pace)}s" d="${d}"/>`;
    }
    return `<svg class="attercop-svg attercop-web${spin ? ' attercop-spin' : ''}">${m}</svg>`;
  }

  const NOTE = { poor: 'hardly a mouthful', meh: 'stringy, but it will serve', good: 'for the larder', great: 'a fine fat one', superb: 'will keep till winter', calibrating: 'not yet weighed', pvp: 'still kicking', levelup: 'you have grown. one notices.', death: 'no hurry. the larder can wait.', achievement: 'duly spun' };
  const RATING = { poor: 1, meh: 2, good: 3, great: 4, superb: 5 };
  const pips = (n, m) => { let s = ''; for (let i = 0; i < m; i++) s += `<path transform="translate(${5 + i * 11},5)" d="M0,-4.2L3.4,0L0,4.2L-3.4,0Z" class="${i < n ? 'attercop-on' : 'attercop-off'}"/>`; return `<svg width="${m * 11 - 1}" height="10">${s}</svg>`; };

  // ---- one rig: thread, spider, what it carries, the tag ----
  function build(ctx, n, live) {
    defs();
    const E = ctx.el, root = E('div', 'attercop-rig'), sway = E('div', 'attercop-sway'), drop = E('div', 'attercop-drop'), hang = E('div', 'attercop-hang'), chain = E('div', 'attercop-chain'), tw = E('div', 'attercop-tw');
    const kill = n.kind === 'kill', mood = n.mood;
    root.dataset.sky = ctx.skyMode();
    root.style.setProperty('--attercop-ph', -(performance.now() % 4600) + 'ms');
    const still = !live, pose = mood === 'superb' ? 'braced' : mood === 'calibrating' ? 'wrap' : mood === 'death' ? 'hold' : kill ? 'rest' : 'proud';
    if (mood === 'superb') root.classList.add('attercop-strain');
    if (mood === 'calibrating') root.classList.add('attercop-turn');
    const gap = mood === 'superb' ? 9 : mood === 'calibrating' ? 5 : mood === 'death' ? 5 : mood === 'levelup' ? 16 : 13;
    const thread = E('div', 'attercop-silk'), cont = E('div', 'attercop-silk');
    Object.assign(thread.style, { top: '-1600px', height: '1594px' });
    cont.style.top = '-14px';
    hang.style.top = SPIN + 'px'; chain.style.top = gap + 'px';
    const sp = ctx.svg(`<svg class="attercop-svg attercop-spider">${spider(pose)}</svg>`);
    // the tag
    const tag = E('div', 'attercop-tag'), kick = E('div', 'attercop-kick'), title = E('div', 'attercop-title'), fig = E('div', 'attercop-fig'), rate = E('div', 'attercop-rate'), more = E('div', 'attercop-more'), note = E('div', 'attercop-note');
    const big = E('span'), unit = E('span', 'attercop-unit'), word = E('span', 'attercop-word');
    tag.append(E('div', 'attercop-eye'), kick, title, fig, rate, more, note);
    if (n.kind === 'achievement') tag.append(ctx.svg(SEAL));
    const tie = ctx.svg(`<svg class="attercop-svg">${TIES[mood === 'pvp' ? 'red' : mood === 'levelup' ? 'gold' : mood === 'death' ? 'black' : mood === 'achievement' ? 'ribbon' : 'silk']}</svg>`);
    tw.append(tag, tie);
    const items = [];
    let chainH = 0;
    function add(key, fresh) {
      const it = ITEM[key](), tilt = key[0] === 's' ? [3, -4, 4, -3][items.length % 4] : 0;
      const s = ctx.svg(`<svg class="attercop-svg"><g${it.cls ? ` class="${it.cls}"` : ''} transform="rotate(${tilt})">${it.m}</g></svg>`);
      const y = chainH + (items.length ? (still ? 3 : 6) : 0);
      s.style.top = y + 'px'; chain.append(s); items.push(key); chainH = y + it.h;
      if (fresh && !ctx.reduced) s.animate([{ opacity: 0, transform: 'translateY(-14px) scale(.6)' }, { opacity: 1, transform: 'none' }], { duration: 380 / ctx.pace(), easing: 'cubic-bezier(.3,1.4,.5,1)' });
    }
    function set(nn, fresh) {
      tag.dataset.kind = nn.kind; tag.dataset.mood = nn.mood;
      kick.textContent = nn.kind === 'achievement' ? nn.label : '';
      title.textContent = nn.title;
      fig.textContent = ''; rate.textContent = '';
      if (nn.big) { big.textContent = nn.big; fig.append(big); if (nn.unit) { unit.textContent = nn.unit; fig.append(unit); } }
      if (nn.kind === 'kill') {
        word.textContent = nn.label;
        if (nn.mood === 'pvp') rate.append(ctx.svg(pips(1, 1)), word, ctx.svg(pips(1, 1)));
        else rate.append(ctx.svg(pips(RATING[nn.mood] || 0, 5)), word);
      }
      more.textContent = nn.more;
      note.textContent = nn.kind === 'kill' && nn.count > 1 ? (still ? '' : 'by the string') : NOTE[nn.mood] || '';
      if (nn.kind === 'kill') {
        const want = Math.min(4, nn.count);
        if (!items.length) { if (want > 1) for (let i = 0; i < want; i++) add('s' + i); else add(ITEM[nn.mood] ? nn.mood : 'good'); }
        while (items.length < want) add('s' + items.length, fresh);
        if (nn.count > 4 && items[items.length - 1] !== 'dots') add('dots', fresh);
      } else if (!items.length) { if (nn.kind === 'levelup') add('crown'); else if (nn.kind === 'death') add('shroud'); }
      cont.style.height = (14 + gap + chainH + 1) + 'px';
      tw.style.top = (gap + chainH + (items.length ? 2 : 0)) + 'px';
    }
    set(n);
    hang.append(cont, tw, chain);
    drop.append(thread, hang, sp);
    sway.append(drop); root.append(sway);
    if (n.kind === 'levelup') root.prepend(ctx.svg(web(live ? 150 : 96, ctx.rng(23), live && !ctx.reduced, ctx.pace())));
    return { root, sway, drop, hang, tw, tag, sp, set, mood, below: () => SPIN + gap + chainH + 2 + TIE - 9 + tag.offsetHeight + (n.kind === 'achievement' ? 13 : 0) };
  }

  Harness.register({
    id: 'attercop',
    name: 'Attercop',
    blurb: 'A Mirkwood orb-weaver lets itself down on one thread from above the screen, shows what it has put by for the larder (the bigger the bundle, the better the kill), with a luggage tag tied on, and then hauls the lot back up, hand over hand.',
    create(ctx) {
      const slots = [null, null, null], queue = [], all = new Set();
      const nSlots = () => Math.max(1, Math.min(3, Math.floor(ctx.lane().w / (TAGW + 12))));
      const swing = (el, deg, ms, delay = 0) => el.animate([0, 1, -.62, .36, -.18, .07, 0].map((k) => ({ transform: `rotate(${f(k * deg)}deg)` })), { duration: ms / ctx.pace(), delay: delay / ctx.pace(), easing: 'ease-in-out', composite: 'add' });

      function run(job, slot) {
        const L = ctx.lane(), n = nSlots(), P = ctx.pace(), T = (ms) => ms / P;
        const rig = build(ctx, job.n, true), run = { rig, timer: 0, done: false };
        slots[slot] = run; all.add(run); job.run = run;
        rig.root.style.left = f(L.x0 + (slot + .5) * L.w / n) + 'px';
        ctx.front.append(rig.root);
        let below = rig.below();
        let Y = Math.max(GRIP + 10, Math.min(L.h * (.3 - ((slot + 1) % 3) * .035), L.bottom - below - 12));
        if (Y + below > L.bottom - 4) rig.root.style.transform = `scale(${f((L.bottom - 4) / (Y + below) * 100) / 100})`;
        rig.drop.style.top = f(Y) + 'px';
        const D = () => Y + rig.below() + 30;
        const end = () => { if (run.done) return; run.done = true; clearTimeout(run.timer); rig.root.remove(); all.delete(run); if (slots[slot] === run) slots[slot] = null; pump(); };
        run.end = end;
        let read = 6000, tIn = 0;
        const mood = rig.mood, t0 = performance.now();
        const leave = () => {
          if (run.done) return; run.leaving = true;
          if (ctx.reduced) { rig.root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' }).onfinish = end; return; }
          rig.root.classList.remove('attercop-strain', 'attercop-turn'); rig.root.classList.add('attercop-haul');
          const d = D(), N = mood === 'superb' ? 8 : 6, kf = [];
          for (let i = 0; i <= N; i++) kf.push({ transform: `translateY(${f(-d * Math.pow(i / N, 1.25))}px)`, easing: 'cubic-bezier(.55,0,.25,1)' });
          swing(rig.hang, 2.5, 900); swing(rig.tw, -5, 900);
          rig.root.animate([{ opacity: 1 }, { opacity: 1, offset: .8 }, { opacity: .96 }], { duration: T(1300) });
          rig.drop.animate(kf, { duration: T(mood === 'superb' ? 1500 : 1250), fill: 'forwards' }).onfinish = end;
        };
        const arm = () => { clearTimeout(run.timer); run.timer = setTimeout(leave, Math.max(0, t0 + tIn + T(read) - performance.now())); };
        run.update = (nn) => {
          if (run.done || run.leaving) return;
          rig.set(nn, true); read = Math.min(9000, read + 1200); arm();
          if (!ctx.reduced) { swing(rig.tw, 5, 1100); swing(rig.hang, -1.6, 1100); rig.tag.animate([{ filter: 'brightness(1.12)' }, { filter: 'brightness(1)' }], { duration: 420, composite: 'add' }); }
        };
        if (ctx.reduced) {
          rig.root.classList.add('attercop-calm');
          rig.root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
          tIn = 300; arm(); return;
        }
        const d = D(), y = (k) => `translateY(${f(-d * k)}px)`, px = (v) => `translateY(${v}px)`;
        let kf, dur;
        if (mood === 'death') { dur = 1800; kf = [{ transform: y(1), easing: 'cubic-bezier(.25,.3,.3,1)' }, { transform: 'none' }]; }
        else if (mood === 'superb') {
          dur = 1800;
          kf = [{ transform: y(1), easing: 'ease-in-out' }, { transform: y(.74), offset: .16, easing: 'ease-in-out' }, { transform: y(.72), offset: .22, easing: 'ease-in-out' }, { transform: y(.47), offset: .4, easing: 'ease-in-out' }, { transform: y(.45), offset: .46, easing: 'ease-in-out' },
            { transform: y(.2), offset: .64, easing: 'ease-in-out' }, { transform: y(.18), offset: .7, easing: 'ease-in' }, { transform: px(13), offset: .86, easing: 'ease-out' }, { transform: px(-3), offset: .93, easing: 'ease-in-out' }, { transform: px(4), offset: .97, easing: 'ease-in-out' }, { transform: 'none' }];
        } else {
          dur = 1500;
          kf = [{ transform: y(1), easing: 'cubic-bezier(.3,0,.4,1)' }, { transform: y(.5), offset: .3, easing: 'ease-in-out' }, { transform: y(.485), offset: .37, easing: 'cubic-bezier(.4,0,.4,1)' }, { transform: y(.13), offset: .66, easing: 'ease-in-out' }, { transform: y(.12), offset: .72, easing: 'ease-in' },
            { transform: px(8), offset: .87, easing: 'ease-out' }, { transform: px(-3), offset: .94, easing: 'ease-in-out' }, { transform: 'none' }];
        }
        tIn = T(dur);
        rig.drop.animate(kf, { duration: tIn, fill: 'backwards' });
        if (mood !== 'death') {
          const k = mood === 'superb' ? 1.5 : 1;
          rig.hang.animate([{ transform: 'none' }, { transform: `translateY(${5 * k}px)` }, { transform: 'translateY(-2px)' }, { transform: 'translateY(1px)' }, { transform: 'none' }], { duration: T(700), delay: T(dur * .84), easing: 'ease-in-out', composite: 'add' });
          swing(rig.hang, 2.4 / k, 2200, dur * .8); swing(rig.tw, -6 / k, 2600, dur * .86);
          const abd = rig.sp.querySelector('.attercop-abd').parentNode;
          abd.animate([{ transform: 'translate(0,4.6px)' }, { transform: 'translate(0,7.4px) scale(1.03,.97)' }, { transform: 'translate(0,3.8px)' }, { transform: 'translate(0,5.2px)' }, { transform: 'translate(0,4.6px)' }], { duration: T(800), delay: T(dur * .84), easing: 'ease-in-out' });
        } else swing(rig.tw, -2, 2400, dur * .9);
        arm();
      }
      function pump() {
        const n = nSlots(), order = (n === 3 ? [1, 2, 0] : n === 2 ? [1, 0] : [0]);
        while (queue.length) {
          const s = order.find((i) => !slots[i]);
          if (s == null) return;
          run(queue.shift(), s);
        }
      }
      return {
        show(notice) {
          const job = { n: notice, run: null };
          queue.push(job); pump();
          return { update(nn) { job.n = nn; if (job.run) job.run.update(nn); } };
        },
        still(notice) {
          const box = ctx.el('div', 'attercop-still'), rig = build(ctx, notice, false), Y = GRIP + 3;
          rig.root.style.left = '115px'; rig.drop.style.top = Y + 'px';
          if (ctx.reduced) rig.root.classList.add('attercop-calm');
          box.append(rig.root);
          const fit = () => { const tot = Y + rig.below(); rig.root.style.transform = `scale(${Math.min(1, Math.floor(303 / tot * 1000) / 1000)})`; };
          new ResizeObserver(fit).observe(rig.tag);
          return box;
        },
        clear() { queue.length = 0; for (const r of [...all]) { r.done = true; clearTimeout(r.timer); r.rig.root.remove(); } all.clear(); slots.fill(null); },
      };
    },
  });
})();
