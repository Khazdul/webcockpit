// Round 2, direction 4: "Written in the Stars". No flying object: each event
// is set in the sky as a small constellation with a star-atlas caption, in the
// manner of an engraved celestial chart. By day the same chart is drawn in ink.
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 220, CH = 140;
  const cart = (fill, ink, inner) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='${NS}' width='60' height='60'><path d='M11,1.5H49A9.5,9.5 0 0 0 58.5,11V49A9.5,9.5 0 0 0 49,58.5H11A9.5,9.5 0 0 0 1.5,49V11A9.5,9.5 0 0 0 11,1.5Z' fill='${fill}' stroke='${ink}' stroke-width='1.3'/><path d='M13.5,5.5H46.5A9,9 0 0 0 54.5,13.5V46.5A9,9 0 0 0 46.5,54.5H13.5A9,9 0 0 0 5.5,46.5V13.5A9,9 0 0 0 13.5,5.5Z' fill='none' stroke='${inner}' stroke-width='.7'/></svg>`)}")`;

  Harness.css('stars', `
.stars-plate{position:relative;width:${W}px;font-family:"Cormorant Garamond",Georgia,serif;text-align:center;color:var(--stars-txt);
  --stars-txt:#f0ead8;--stars-dim:rgba(240,234,216,.66);--stars-line:rgba(206,217,255,.6);--stars-fig:rgba(178,194,246,.2);--stars-ink:#15172b;
  --stars-g:#ffe6ad;--stars-core:#fff;--stars-fill:#f6ecd0;--stars-shadow:0 0 4px #050813,0 0 9px rgba(5,8,19,.9),0 1px 1px #050813}
.stars-plate[data-sky=dusk]{--stars-txt:#fdf3de;--stars-dim:rgba(253,243,222,.76);--stars-line:rgba(255,241,216,.7);--stars-fig:rgba(255,234,208,.27);--stars-shadow:0 0 4px #14132a,0 1px 1px #14132a}
.stars-plate[data-sky=day],.stars-plate[data-sky=overcast]{--stars-txt:#251b14;--stars-dim:rgba(37,27,20,.74);--stars-line:rgba(18,20,44,.82);--stars-fig:rgba(18,20,44,.3);--stars-shadow:none}
.stars-plate[data-sky=overcast]{--stars-line:rgba(10,11,26,.88);--stars-fig:rgba(10,11,26,.34)}
.stars-plate[data-mood=poor]{--stars-g:#ff8562;--stars-core:#ffd6c6;--stars-fill:#e8b39c}
.stars-plate[data-mood=meh]{--stars-g:#ffbe74;--stars-core:#fff0dc;--stars-fill:#f1d6a9}
.stars-plate[data-mood=good]{--stars-g:#ffe9b6;--stars-fill:#f8eed2}
.stars-plate[data-mood=great]{--stars-g:#cfe0ff;--stars-fill:#fdfaf0}
.stars-plate[data-mood=superb]{--stars-g:#ffdf85;--stars-fill:#ffd96a}
.stars-plate[data-mood=calibrating]{--stars-g:#aebbe2;--stars-core:#e4e9f8;--stars-fill:#dfe4ec}
.stars-plate[data-mood=pvp]{--stars-g:#c3cdf0;--stars-fill:#ece7da}
.stars-plate[data-mood=levelup]{--stars-g:#ffd66e;--stars-fill:#ffd45c}
.stars-plate[data-mood=death]{--stars-g:#c4cfe8;--stars-core:#e9edf7;--stars-fill:#ecebe6}
.stars-plate[data-mood=achievement]{--stars-g:#f6dc94;--stars-fill:#f7dc8c}
.stars-chart{display:block;overflow:visible}
.stars-ln,.stars-lead{fill:none;stroke:var(--stars-line);stroke-width:.8;stroke-linecap:round}
.stars-ln{stroke-dasharray:1}
.stars-ghost{stroke-dasharray:1.2 3.2;opacity:.75}
.stars-lead{stroke-width:.6;opacity:.8}
.stars-atlas{fill:none;stroke:var(--stars-fig);stroke-width:.75;stroke-linejoin:round;stroke-linecap:round}
.stars-arc{stroke-dasharray:1.4 3.4;stroke-width:.6}
.stars-ticks{stroke-width:4.5;stroke-dasharray:.5 11.5;stroke-linecap:butt}
.stars-glow{animation:stars-tw 3.6s ease-in-out infinite alternate}
.stars-core{fill:var(--stars-core)}
.stars-glint{fill:#fff;opacity:.95}
.stars-hair{fill:none;stroke:#fff;stroke-width:.5;opacity:.5;stroke-linecap:round}
.stars-ink{display:none}
.stars-ink path,.stars-ink circle{fill:var(--stars-fill);stroke:var(--stars-ink);stroke-width:.85;stroke-linejoin:round}
.stars-ink .stars-pip{fill:var(--stars-ink);stroke:none}
.stars-ext{fill:none;stroke:var(--stars-line);stroke-width:.7;opacity:0}
.stars-dead .stars-k{opacity:0}
.stars-dead .stars-ext{opacity:.8}
.stars-ring{fill:none;stroke:var(--stars-line);stroke-width:.7}
.stars-flare{fill:none;stroke:var(--stars-g);stroke-width:.8;opacity:0}
.stars-bayer{font:italic 500 10.5px "Cormorant Garamond",Georgia,serif;fill:var(--stars-dim)}
.stars-fs{fill:var(--stars-core)}
.stars-eye{--stars-core:#ffe1d6;--stars-fill:#c9301c}
.stars-lid{fill:none;stroke:#ff5a3c;stroke-width:.8;opacity:.75}
.stars-flick .stars-lit,.stars-flick .stars-ink{animation:stars-fl 5.2s linear infinite}
.stars-fall{fill:none;stroke:#fff;stroke-width:1.2;stroke-linecap:round;stroke-dasharray:.3 1.3;stroke-dashoffset:.3;opacity:.9}
.stars-plate[data-sky=dusk] .stars-glow{opacity:.85}
.stars-plate[data-sky=day] .stars-lit,.stars-plate[data-sky=overcast] .stars-lit,.stars-plate[data-sky=day] .stars-fall,.stars-plate[data-sky=overcast] .stars-fall{display:none}
.stars-plate[data-sky=day] .stars-ink,.stars-plate[data-sky=overcast] .stars-ink{display:inline}
.stars-plate[data-sky=day] .stars-fs,.stars-plate[data-sky=overcast] .stars-fs{fill:var(--stars-ink)}
.stars-plate[data-sky=day] .stars-lid,.stars-plate[data-sky=overcast] .stars-lid{stroke:#8e1c0e;opacity:.9}
.stars-plate[data-sky=day] .stars-ln,.stars-plate[data-sky=overcast] .stars-ln{stroke-width:.9}
@keyframes stars-tw{from{opacity:.72}to{opacity:1}}
@keyframes stars-fl{0%,38%{opacity:.9}40%{opacity:.25}43%{opacity:.8}47%{opacity:.15}52%{opacity:.6}58%,84%{opacity:.08}88%{opacity:.5}92%,100%{opacity:.9}}
.stars-label{position:relative;box-sizing:border-box;width:max-content;min-width:132px;max-width:${W - 6}px;margin:0 auto;padding:2px 7px 1px;border:11px solid transparent;
  border-image:none 20 fill/13px stretch;text-shadow:var(--stars-shadow);background:radial-gradient(closest-side,rgba(5,8,19,.5),rgba(5,8,19,0))}
.stars-label::after{content:"";position:absolute;left:-6px;right:-6px;top:-11.5px;height:1px;background:linear-gradient(90deg,transparent,var(--stars-line) 22%,var(--stars-line) 44%,transparent 44%,transparent 56%,var(--stars-line) 56%,var(--stars-line) 78%,transparent);opacity:.75}
.stars-plate:not([data-sky=night]) .stars-label{background:none}
.stars-plate:not([data-sky=night]) .stars-label::after{display:none}
.stars-plate[data-sky=day] .stars-chart,.stars-plate[data-sky=overcast] .stars-chart{filter:drop-shadow(0 0 1.3px rgba(246,239,216,.55))}
.stars-plate[data-sky=dusk] .stars-label{border-image-source:${cart('rgba(24,20,48,.5)', 'rgba(255,236,200,.55)', 'rgba(255,236,200,.2)')}}
.stars-plate[data-sky=day] .stars-label{border-image-source:${cart('rgba(241,231,203,.9)', 'rgba(30,24,36,.85)', 'rgba(30,24,36,.4)')}}
.stars-plate[data-sky=overcast] .stars-label{border-image-source:${cart('rgba(236,227,202,.93)', 'rgba(20,16,24,.9)', 'rgba(20,16,24,.42)')}}
.stars-label::before{content:"";position:absolute;z-index:1;left:50%;top:-14px;width:5px;height:5px;margin-left:-3px;transform:rotate(45deg);border:.8px solid var(--stars-line);background:var(--stars-knot,#0a0f22)}
.stars-plate[data-sky=dusk] .stars-label::before{--stars-knot:#2a2244}
.stars-plate[data-sky=day] .stars-label::before,.stars-plate[data-sky=overcast] .stars-label::before{--stars-knot:#f1e7cb}
.stars-label>div:empty{display:none}
.stars-tag{font:400 9.5px/1.3 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.3em;margin-right:-.3em;text-transform:uppercase;color:var(--stars-dim);padding-bottom:2px}
.stars-title{font:italic 600 18.5px/1.1 "Cormorant Garamond",Georgia,serif;text-wrap:balance;overflow-wrap:anywhere}
.stars-figure{font:600 34px/1 "Cormorant Garamond",Georgia,serif;font-variant-numeric:lining-nums;margin-top:1px;white-space:nowrap}
.stars-unit{font:italic 500 16px/1 "Cormorant Garamond",Georgia,serif;margin-left:5px;color:var(--stars-dim)}
.stars-mag{display:flex;justify-content:center;align-items:center;gap:7px;margin-top:3px}
.stars-mag svg{display:block;overflow:visible}
.stars-mag .stars-on{fill:var(--stars-g);stroke:none}
.stars-mag .stars-off{fill:none;stroke:var(--stars-dim);stroke-width:.6;opacity:.7}
.stars-mag .stars-red{fill:#ff5a3c}
.stars-plate[data-sky=day] .stars-on,.stars-plate[data-sky=overcast] .stars-on{fill:var(--stars-fill);stroke:var(--stars-ink);stroke-width:.8;stroke-linejoin:round}
.stars-plate[data-sky=day] .stars-red,.stars-plate[data-sky=overcast] .stars-red{fill:#c9301c}
.stars-abbr{font:italic 400 12px/1 "IM Fell English",Georgia,serif;color:var(--stars-dim)}
.stars-word{font:400 12.5px/1.2 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.22em;margin-right:-.22em}
.stars-more{font:italic 500 13.5px/1.15 "Cormorant Garamond",Georgia,serif;color:var(--stars-dim);margin-top:4px;text-wrap:balance}
.stars-note{font:italic 400 12.5px/1.2 "IM Fell English",Georgia,serif;color:var(--stars-dim);margin-top:3px}
.stars-plate[data-kind=death] .stars-figure{font:400 25px/1.15 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.16em;margin-right:-.16em;text-transform:uppercase}
.stars-plate[data-kind=levelup] .stars-figure{font-size:32px}
.stars-plate[data-kind=achievement] .stars-title{font-size:15.5px;line-height:1.16;max-width:186px;font-weight:500}
.stars-plate[data-kind=achievement] .stars-label{min-width:0}
`);

  const S = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.append(e); return e; };
  const f1 = (v) => (Math.round(v * 10) / 10).toString();
  const spiky = (n, R, r) => { let d = ''; for (let i = 0; i < n * 2; i++) { const a = (-90 + i * 180 / n) * Math.PI / 180, q = i % 2 ? r : R; d += (i ? 'L' : 'M') + f1(Math.cos(a) * q) + ',' + f1(Math.sin(a) * q); } return d + 'Z'; };
  const glint = (L, k) => `M0,${-L}Q${k},${-k} ${L},0Q${k},${k} 0,${L}Q${-k},${k} ${-L},0Q${-k},${-k} 0,${-L}Z`;
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
  const CORE = [0, 2.3, 1.7, 1.3, 1, 0.75], GLOW = [0, 16, 10.5, 7.5, 5.2, 3.6], GAP = [1.5, 8.5, 6.5, 5, 4, 3];
  const INK = [0, [8, 7.2, 3], [6, 5.6, 2.5], [5, 4.4, 1.9], [4, 3.2, 1.2]];
  const BRIGHT = { poor: 0.72, meh: 0.86, good: 1, great: 1.1, superb: 1.3, calibrating: 0.8, pvp: 1, levelup: 1.35, death: 0.85, achievement: 1.1 };
  const POSE = { poor: ['arrow', -30], meh: ['sword', -158], good: ['arrow', -17], great: ['sword', -24], superb: ['sword', -146] };
  const RATING = { poor: 1, meh: 2, good: 3, great: 4, superb: 5 };

  // Weapons in their own coordinates: the length runs along x from 0 to 118.
  const WPN = {
    sword: {
      full: [[0, 0, 3], [23, -17, 4], [23, 17, 4], [23, 0, 3, 'β'], [70, 0, 4], [118, 0, 1, 'α']], fl: [[0, 3], [3, 1], [3, 2], [3, 4], [4, 5]],
      lite: [[0, 0, 4], [23, -17, 4], [23, 17, 4], [118, 0, 2]], ll: [[0, 3], [1, 2]],
      fig: '<circle r="4.8"/><path d="M4.8,-2.1H20M4.8,2.1H20M20,-19Q23.4,-8 22.4,0Q23.4,8 20,19L25.2,19Q28.6,8 27.6,0Q28.6,-8 25.2,-19ZM27.8,-5.2L103,-3.5L121,0L103,3.5L27.8,5.2M32,0H95"/>',
      names: ['Gladius', 'Gladii Decussati', 'Fascis Gladiorum'],
    },
    arrow: {
      full: [[2, 0, 3], [-9, -11, 4], [-9, 11, 4], [58, 0, 4], [118, 0, 1, 'α'], [98, -9.5, 3, 'β'], [98, 9.5, 3]], fl: [[0, 1], [0, 2], [0, 3], [3, 4], [4, 5], [4, 6]],
      lite: [[2, 0, 4], [118, 0, 2], [98, -9.5, 4], [98, 9.5, 4]], ll: [[0, 1], [1, 2], [1, 3]],
      fig: '<path d="M2,-1.2H103M2,1.2H103M121,0L97,-8.2L103,0L97,8.2ZM2,-1.2L-9,-12H13L24,-1.2M2,1.2L-9,12H13L24,1.2M-4,-6.5H18M1,-9.3L8,-2M7,-9.3L14,-2M-4,6.5H18M1,9.3L8,2M7,9.3L14,2"/>',
      names: ['Sagitta', 'Sagittae Decussatae', 'Fascis Sagittarum'],
    },
  };
  const place = (pts, a, cx, cy, px, sc) => { const r = a * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return pts.map((p) => ({ ...p, x: cx + ((p.x - px) * c - p.y * s) * sc, y: cy + ((p.x - px) * s + p.y * c) * sc })); };
  function weapon(type, a, o = {}) {
    const d = WPN[type], { lite = false, bump = 0, sc = 1, px = 52, cx = 110, cy = 68, flick = false, fig = true } = o;
    const pts = (lite ? d.lite : d.full).map(([x, y, m, b]) => ({ x, y, m: Math.max(1, Math.min(5, m + bump)), b }));
    if (flick) pts.push({ x: 70, y: 0, m: 4, flick: true });
    return { stars: place(pts, a, cx, cy, px, sc), lines: lite ? d.ll : d.fl, fig: fig ? `<g transform="translate(${cx},${cy}) rotate(${f1(a)}) scale(${sc}) translate(${-px},0)">${d.fig}</g>` : '' };
  }
  const CROWN = {
    stars: [[66, 104, 3], [54, 52, 2, 'β'], [88, 80, 4], [110, 26, 1, 'α'], [132, 80, 4], [166, 52, 2, 'γ'], [154, 104, 3]].map(([x, y, m, b]) => ({ x, y, m, b })),
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0]],
    fig: '<path d="M61,99L46,44L87,71L110,15L133,71L174,44L159,99M61,99Q110,112 159,99L157.5,111Q110,124 62.5,111ZM104,111.5l6,-4.5l6,4.5l-6,4.5ZM80,108.5l4,-3l4,3l-4,3ZM132,108.5l4,-3l4,3l-4,3Z"/><circle cx="46" cy="44" r="3"/><circle cx="110" cy="15" r="3.4"/><circle cx="174" cy="44" r="3"/>',
  };
  const SCYTHE = {
    stars: [[72, 118, 3], [98, 86, 4], [124, 54, 3], [148, 24, 2, '', 1], [123, 15, 4], [91, 20, 3], [54, 42, 3]].map(([x, y, m, b, live]) => ({ x, y, m, dead: !live, ring: !!live })),
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]],
    fig: '<path d="M151,24Q112,-3 52,44Q108,21 145,34ZM74,119.6L150,25.6M70,116.4L146,22.4M70,116.4L74,119.6M99.5,87.5l9,7.5M96,83l-8,-6.5"/>',
  };
  function wreath() {
    const cx = 110, cy = 64, R = 44, at = (t, q = R) => [cx + q * Math.cos(t * Math.PI / 180), cy + q * Math.sin(t * Math.PI / 180)];
    const stars = [], lines = [[0, 4]];
    [[112, 3], [150, 4], [192, 3], [236, 3]].forEach(([t, m]) => { const [x, y] = at(t); stars.push({ x, y, m }); });
    [[68, 3], [30, 4], [-12, 3], [-56, 3]].forEach(([t, m]) => { const [x, y] = at(t); stars.push({ x, y, m }); });
    for (let i = 0; i < 3; i++) lines.push([i, i + 1], [i + 4, i + 5]);
    stars.push({ x: cx, y: cy, m: 1, b: 'α' });
    let fig = '';
    for (let t = 104; t <= 246; t += 11.8) for (const side of [1, -1]) {
      const th = side > 0 ? t : 180 - t, tan = side > 0 ? th + 90 : th - 90;
      for (const lean of [-34, 34]) { const [x, y] = at(th, R + (lean * side < 0 ? 1.5 : -1.5)); fig += `<path d="M0,0Q5,-3.6 11.5,0Q5,3.6 0,0Z" transform="translate(${f1(x)},${f1(y)}) rotate(${f1(tan + lean)})"/>`; }
    }
    const [ax, ay] = at(98), [bx, by] = at(250), [dx, dy] = at(82), [ex, ey] = at(-70);
    fig += `<path d="M${f1(ax)},${f1(ay)}A${R},${R} 0 0 1 ${f1(bx)},${f1(by)}M${f1(dx)},${f1(dy)}A${R},${R} 0 0 0 ${f1(ex)},${f1(ey)}M104,107l10,9l3,-4M116,107l-10,9l-3,-4"/>`;
    return { stars, lines, fig };
  }

  Harness.register({
    id: 'stars',
    name: 'Written in the Stars',
    blurb: 'No balloon. Each event is kindled as a small constellation and captioned like a plate from an old star atlas; the rating is its magnitude. Then the caption fades and the stars drift off with the turning sky. By day the same chart is engraved on the sky in ink.',
    create(ctx) {
      let uid = 0, shown = 0, poll = 0;
      const live = new Set(), slots = new Map();

      // ---- one chart: the emblem and its caption ----
      function chart(n, seed, isLive) {
        const r = ctx.rng(seed), id = ++uid, B = BRIGHT[n.mood] || 1;
        const root = ctx.el('div', 'stars-plate');
        root.dataset.sky = ctx.skyMode(); root.dataset.mood = n.mood; root.dataset.kind = n.kind;
        const stops = (c) => `<stop offset="0" style="stop-color:${c};stop-opacity:.95"/><stop offset=".2" style="stop-color:${c};stop-opacity:.45"/><stop offset=".52" style="stop-color:${c};stop-opacity:.11"/><stop offset="1" style="stop-color:${c};stop-opacity:0"/>`;
        const svg = ctx.svg(`<svg class="stars-chart" xmlns="${NS}" viewBox="0 0 ${W} ${CH}" width="${W}" height="${CH}" aria-hidden="true"><defs><radialGradient id="stars-g${id}">${stops('var(--stars-g)')}</radialGradient><radialGradient id="stars-e${id}">${stops('#ff3a1c')}</radialGradient></defs><g class="stars-atlas"></g><g class="stars-lines"></g><path class="stars-lead" pathLength="1" stroke-dasharray="1" d="M110,127V${CH + 1}"/><g class="stars-heaven" style="transform-origin:110px 70px"><g class="stars-field"></g><g class="stars-main"></g></g><path class="stars-fall" pathLength="1" d="M226,-26L122,30"/></svg>`);
        const gAtlas = svg.querySelector('.stars-atlas'), gLines = svg.querySelector('.stars-lines'), gMain = svg.querySelector('.stars-main'), gField = svg.querySelector('.stars-field');
        const C = { root, svg, stars: [], lines: [], figs: [], heaven: svg.querySelector('.stars-heaven'), lead: svg.querySelector('.stars-lead'), fall: svg.querySelector('.stars-fall'), field: gField };

        function star(s) {
          const m = s.m, b = s.eye ? 1.15 : B;
          const o = S('g', { class: 'stars-s' + (s.dead ? ' stars-dead' : '') + (s.eye ? ' stars-eye' : ''), transform: `translate(${f1(s.x)},${f1(s.y)})` }, gMain);
          if (s.eye) S('path', { class: 'stars-lid', d: 'M-15,0Q0,-9.5 15,0Q0,9.5 -15,0Z' }, o);
          const k = S('g', { class: 'stars-k' + (s.flick ? ' stars-flick' : '') }, o);
          const lit = S('g', { class: 'stars-lit' }, k);
          S('circle', { class: 'stars-glow', r: f1(GLOW[m] * b), fill: `url(#stars-${s.eye ? 'e' : 'g'}${id})`, style: `animation-delay:-${f1((s.x * 7 + s.y * 3) % 36 / 10)}s` }, lit);
          if (m === 1) { S('path', { class: 'stars-hair', d: `M${f1(-21 * b)},0H${f1(21 * b)}M0,${f1(-21 * b)}V${f1(21 * b)}` }, lit); S('path', { class: 'stars-glint', d: glint(f1(11.5 * b), 1) }, lit); }
          else if (m === 2) S('path', { class: 'stars-glint', d: glint(f1(6.2 * b), 0.8), opacity: '.8' }, lit);
          S('circle', { class: 'stars-core', r: f1(CORE[m] * (0.8 + 0.2 * b)) }, lit);
          const ink = S('g', { class: 'stars-ink' }, k);
          if (m < 5) { S('path', { d: spiky(...INK[m]) }, ink); if (m < 3) S('circle', { class: 'stars-pip', r: m === 1 ? 0.9 : 0.7 }, ink); } else S('circle', { r: 1.2, class: 'stars-pip' }, ink);
          S('circle', { class: 'stars-ext', r: 2.3 }, o);
          if (s.ring) s.ringEl = S('circle', { class: 'stars-ring', r: 12 }, o);
          if (m === 1 && !s.eye) s.flare = S('circle', { class: 'stars-flare', r: 9 }, o);
          if (s.b) { s.txt = S('text', { class: 'stars-bayer', x: s.bx || 7, y: s.by || -6 }, o); s.txt.textContent = s.b; }
          s.el = o; s.k = k;
          return s;
        }
        function add(spec, ghost) {
          const part = { stars: spec.stars.map(star), lines: [], figs: [] };
          for (const [i, j] of spec.lines) {
            const a = spec.stars[i], b = spec.stars[j], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy), ga = GAP[a.m], gb = GAP[b.m];
            if (len < ga + gb + 3) continue;
            const ux = dx / len, uy = dy / len;
            const at = { class: 'stars-ln' + (ghost ? ' stars-ghost' : ''), d: `M${f1(a.x + ux * ga)},${f1(a.y + uy * ga)}L${f1(b.x - ux * gb)},${f1(b.y - uy * gb)}` };
            if (!ghost) at.pathLength = '1';
            part.lines.push(S('path', at, gLines));
          }
          if (spec.fig) { const g = ctx.svg(`<svg xmlns="${NS}"><g>${spec.fig}</g></svg>`).firstElementChild; gAtlas.append(g); part.figs.push(g); }
          C.stars.push(...part.stars); C.lines.push(...part.lines); C.figs.push(...part.figs);
          return part;
        }

        // the chart furniture: a graduated arc and a few field stars
        if (n.mood !== 'calibrating') {
          const y0 = 96 + r() * 20, bow = 22 + r() * 16, flip = r() < 0.5, d = flip ? `M-8,${f1(y0 + 8)}Q110,${f1(y0 - bow)} 228,${f1(y0 - 6)}` : `M-8,${f1(y0 - 6)}Q110,${f1(y0 - bow)} 228,${f1(y0 + 8)}`;
          const g = S('g', {}, gAtlas); S('path', { class: 'stars-arc', d }, g); S('path', { class: 'stars-ticks', d }, g); C.figs.push(g);
        }
        for (let i = 0; i < 9; i++) S('circle', { class: 'stars-fs', cx: f1(4 + r() * 212), cy: f1(2 + r() * 118), r: f1(0.45 + r() * 0.5), opacity: f1(0.3 + r() * 0.5) }, gField);

        // the emblem
        const fan = isLive || n.count > 1, pose = !fan && POSE[n.mood], type = pose ? pose[0] : r() < 0.5 ? 'sword' : 'arrow', base = fan ? -62 : -12 - r() * 30, a0 = pose ? pose[1] : r() < 0.5 ? base : -180 - base;
        const FAN = [a0, -180 - a0, -90, a0 > -90 ? -76 : -104, a0 > -90 ? -104 : -76], geo = fan ? { px: 34, cy: 91 } : { px: 59, cy: 68 };
        let blades = 0;
        const grow = () => (blades === 1 && add({ stars: [], lines: [], fig: `<path d="M100,${geo.cy - 3}q10,5 20,0M100,${geo.cy + 3}q10,5 20,0"/>` }), grow1());
        const grow1 = () => add(weapon(type, FAN[blades], { ...geo, lite: blades > 0, fig: blades === 0, bump: blades > 0 ? 0 : (n.mood === 'superb' ? -1 : 0) }), false, blades++);
        const first = [];
        if (n.kind === 'levelup') first.push(add(CROWN));
        else if (n.kind === 'death') first.push(add(SCYTHE, true));
        else if (n.kind === 'achievement') first.push(add(wreath()));
        else if (n.mood === 'pvp') {
          const eye = { x: 110, y: 68, m: 1, eye: true };
          for (const a of [-38, -142]) { const w = weapon('sword', a, { lite: true, px: 59 }), [p, , , t] = w.stars; w.stars.push(eye); w.lines = [[0, 4], [4, 3], [1, 2]]; if (a === -38) { first.push(add(w)); } else { w.stars.pop(); const part = add({ stars: w.stars, lines: [[1, 2]], fig: w.fig }); for (const [u, v] of [[p, eye], [eye, t]]) part.lines.push(...add({ stars: [u, v].map((q) => ({ ...q, skip: 1 })), lines: [[0, 1]] }, false).lines); first.push(part); } }
        } else if (n.mood === 'calibrating') first.push(add(weapon('sword', a0, { lite: true, sc: 0.62, fig: false, px: 59, cy: 70 })));
        else if (n.mood === 'poor' && n.count < 2) { first.push(add(weapon(type, a0, { ...geo, lite: true, flick: true }))); blades = 1; }
        else { first.push(grow()); while (blades < Math.min(5, n.count)) first.push(grow()); }

        // the caption
        const label = ctx.el('div', 'stars-label');
        const tag = ctx.el('div', 'stars-tag'), title = ctx.el('div', 'stars-title'), figure = ctx.el('div', 'stars-figure'), mag = ctx.el('div', 'stars-mag'), more = ctx.el('div', 'stars-more'), note = ctx.el('div', 'stars-note');
        label.append(tag, title, figure, mag, more, note);
        root.append(svg, label);
        function text(m) {
          root.dataset.mood = m.mood;
          tag.textContent = m.kind === 'levelup' ? 'Corona Durini' : m.kind === 'death' ? 'Falx' : m.kind === 'achievement' ? 'Laurea' : m.mood === 'pvp' ? 'Gladii Adversi' : m.mood === 'calibrating' ? 'Pugio' : WPN[type].names[Math.min(2, blades - 1)];
          title.textContent = m.title;
          figure.textContent = '';
          if (m.big) { figure.append(ctx.el('span', 'stars-big', m.big)); if (m.unit) figure.append(ctx.el('span', 'stars-unit', m.unit)); }
          mag.textContent = '';
          const k = RATING[m.mood] || 0;
          if (k) {
            mag.append(ctx.el('span', 'stars-abbr', 'mag.'));
            const s = S('svg', { viewBox: '0 0 62 12', width: 62, height: 12 }, mag);
            for (let i = 0; i < 5; i++) S('path', { class: i < k ? 'stars-on' : 'stars-off', d: glint(i < k ? 5.6 : 4.2, i < k ? 1.5 : 1.2), transform: `translate(${7 + i * 12},6)` }, s);
          } else if (m.label) {
            const s = S('svg', { viewBox: '0 0 12 12', width: 12, height: 12 }, mag);
            S('path', { class: 'stars-on' + (m.mood === 'pvp' ? ' stars-red' : ''), d: glint(5.6, 1.5), transform: 'translate(6,6)' }, s);
          }
          if (m.label) mag.append(ctx.el('span', 'stars-word', m.label));
          more.textContent = m.more;
          note.textContent = m.kind === 'death' ? 'obiit · observations resume shortly' : m.kind === 'levelup' ? 'stella nova, newly charted' : m.mood === 'calibrating' ? 'magnitude not yet determined' : '';
        }
        text(n);
        Object.assign(C, { first, grow, text, label, figure, blades: () => blades, rnd: r });
        return C;
      }

      // ---- motion ----
      const A = (el, kf, o) => el.animate(kf, { fill: 'both', easing: 'ease-out', ...o });
      function enter(part, t0, p) {
        const step = Math.min(190, 1100 / part.stars.length);
        part.stars.forEach((s, i) => {
          const d = (t0 + i * step) / p;
          A(s.k, [{ opacity: 0, transform: 'scale(.1)' }, { opacity: 1, transform: 'scale(1.75)', offset: 0.45 }, { opacity: 1, transform: 'scale(1)' }], { duration: 480 / p, delay: d });
          if (s.txt) A(s.txt, [{ opacity: 0 }, { opacity: 1 }], { duration: 600 / p, delay: (t0 + 1500) / p });
          if (s.flare && BRIGHT_FLARE.has(part.mood)) A(s.flare, [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 0.9, transform: 'scale(1)', offset: 0.25 }, { opacity: 0, transform: 'scale(3.4)' }], { duration: 1100 / p, delay: (t0 + 1250) / p, fill: 'none' });
          if (s.flare && BRIGHT_FLARE.has(part.mood)) A(s.k, [{ transform: 'scale(1)' }, { transform: 'scale(1.7)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 900 / p, delay: (t0 + 1250) / p, fill: 'none', easing: 'ease-in-out' });
        });
        part.lines.forEach((l, i) => (l.hasAttribute('pathLength')
          ? A(l, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 320 / p, delay: (t0 + 950 + i * 130) / p, easing: 'ease-in-out' })
          : A(l, [{ opacity: 0 }, { opacity: 0.75 }], { duration: 500 / p, delay: (t0 + 950 + i * 110) / p })));
        part.figs.forEach((g) => A(g, [{ opacity: 0 }, { opacity: 1 }], { duration: 1300 / p, delay: (t0 + 1700) / p }));
      }
      const BRIGHT_FLARE = new Set(['superb', 'levelup']);

      function spot(h) {
        const L0 = ctx.lane(), SW = ctx.size().w, xa = Math.min(Math.max(L0.x0, SW * 0.61), Math.max(L0.x0, L0.x1 - W - 8)), L = { ...L0, x0: xa, w: L0.x1 - xa }, cols = Math.max(1, Math.min(3, Math.floor((L.w + 12) / (W + 22)))), pitch = 286;
        const rows = Math.max(1, Math.floor((L.bottom - 20 - h) / pitch) + 1);
        const order = [];
        for (let row = 0; row < rows; row++) for (let i = 0; i < cols; i++) order.push([i, row]);
        let pick = order.find(([c, rw]) => !slots.has(c + ',' + rw));
        if (!pick) { const old = [...live].find((P) => P.key); if (old) { pick = old.key.split(',').map(Number); old.leave(true); } else pick = order[0]; }
        const [c, rw] = pick, span = Math.max(0, L.w - W), fx = cols === 1 ? 0.5 : 0.04 + 0.92 * (cols - 1 - c) / (cols - 1);
        return { key: c + ',' + rw, x: L.x0 + span * fx, y: Math.max(4, L.bottom - 16 - h - rw * pitch) };
      }
      const sync = () => { const m = ctx.skyMode(); for (const P of live) P.c.root.dataset.sky = m; if (!live.size) { clearInterval(poll); poll = 0; } };

      function show(n) {
        const p = ctx.pace() || 1, c = chart(n, hash(n.title + n.big) + ++shown * 7919, true), root = c.root;
        const L = ctx.lane(), narrow = L.x0 < document.getElementById('out').offsetWidth;
        root.style.position = 'absolute'; root.style.visibility = 'hidden';
        (narrow ? ctx.front : ctx.sky).append(root);
        const h = root.offsetHeight + (n.kind === 'kill' && !n.more ? 40 : 0), at = spot(h);
        const jx = (c.rnd() - 0.5) * 12, jy = -c.rnd() * 8;
        Object.assign(root.style, { left: f1(at.x + jx) + 'px', top: f1(at.y + jy) + 'px', visibility: '' });
        const P = { c, key: at.key, timers: [], gone: false };
        slots.set(at.key, P); live.add(P);
        if (!poll) poll = setInterval(sync, 400);
        const later = (fn, ms) => { const t = setTimeout(fn, ms / p); P.timers.push(t); return t; };
        const end = () => { if (P.gone) return; P.gone = true; P.timers.forEach(clearTimeout); if (slots.get(P.key) === P) slots.delete(P.key); live.delete(P); root.remove(); };
        P.end = end;
        let leaving = false, readMs = 8400, leaveT = 0;
        const born = performance.now();

        P.leave = (fast) => {
          if (leaving || P.gone) return; leaving = true; clearTimeout(leaveT);
          if (slots.get(P.key) === P) slots.delete(P.key); P.key = '';
          if (ctx.reduced) { A(root, [{ opacity: 1 }, { opacity: 0 }], { duration: 400 }).onfinish = end; return; }
          const D = (fast === true ? 1500 : 12000) / p;
          A(c.label, [{ opacity: 1 }, { opacity: 0 }], { duration: 1100 / p, delay: 250 / p, easing: 'ease-in' });
          for (const e of [...c.lines, ...c.figs, c.lead]) A(e, [{ opacity: getComputedStyle(e).opacity }, { opacity: 0 }], { duration: 900 / p, easing: 'ease-in' });
          for (const s of c.stars) for (const e of [s.txt, s.ringEl && null].filter(Boolean)) A(e, [{ opacity: 1 }, { opacity: 0 }], { duration: 900 / p });
          for (const e of c.svg.querySelectorAll('.stars-ext,.stars-lid')) A(e, [{ opacity: getComputedStyle(e).opacity }, { opacity: 0 }], { duration: 1400 / p });
          if (n.kind === 'kill') A(c.fall, [{ strokeDashoffset: 0.3 }, { strokeDashoffset: -1 }], { duration: 750 / p, delay: 500 / p, easing: 'ease-in' });
          A(c.heaven, [{ transform: 'translate(0,0) rotate(0deg)' }, { transform: 'translate(-16px,-64px) rotate(-5deg)' }], { duration: D, easing: 'linear' });
          A(c.field, [{ opacity: 1 }, { opacity: 0 }], { duration: D * 0.8 });
          c.stars.forEach((s) => {
            if (s.dead) return;
            const u = s.ring ? 0.96 : 0.52 + c.rnd() * 0.42 + (s.m === 1 ? 0.05 : 0);
            A(s.k, [{ opacity: 1 }, { opacity: 0.6, offset: 0.1 }, { opacity: 0.5, offset: u - 0.035 }, { opacity: 0.85, offset: u - 0.018 }, { opacity: 0, offset: Math.min(0.99, u) }, { opacity: 0 }], { duration: D, easing: 'linear' });
            if (s.ringEl) A(s.ringEl, [{ opacity: 1 }, { opacity: 0, transform: 'scale(1.5)' }], { duration: D * 0.7 });
          });
          later(end, D * p + 100);
        };
        const arm = () => { clearTimeout(leaveT); leaveT = setTimeout(() => P.leave(), Math.max(0, readMs / p - (performance.now() - born))); P.timers.push(leaveT); };

        if (ctx.reduced) { A(root, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 }); readMs = 6500; arm(); }
        else {
          c.first.forEach((part, i) => { part.mood = n.mood; enter(part, i * 260, p); });
          A(c.field, [{ opacity: 0 }, { opacity: 1 }], { duration: 1600 / p });
          A(c.lead, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 400 / p, delay: 1450 / p });
          A(c.label, [{ opacity: 0, transform: 'translateY(-3px)' }, { opacity: 1, transform: 'none' }], { duration: 600 / p, delay: 1600 / p });
          [...c.label.children].forEach((ch, i) => A(ch, [{ clipPath: 'inset(-4px 100% -4px -8px)' }, { clipPath: 'inset(-4px -8px -4px -8px)' }], { duration: 560 / p, delay: (1750 + i * 170) / p, easing: 'ease-in-out', fill: 'backwards' }));
          if (n.kind === 'death') {
            // the stars of the figure go out one by one; one pale star and its ring are left
            const dead = c.stars.filter((s) => s.dead), ext = (s) => s.el.querySelector('.stars-ext');
            dead.forEach((s, i) => {
              s.el.classList.remove('stars-dead'); ext(s).style.opacity = 0;
              const d = (2300 + (dead.length - 1 - i) * 380) / p;
              A(s.k, [{ opacity: 1 }, { opacity: 0.25, offset: 0.3 }, { opacity: 0.85, offset: 0.5 }, { opacity: 0 }], { duration: 520 / p, delay: d, fill: 'forwards' });
              A(ext(s), [{ opacity: 0 }, { opacity: 0.8 }], { duration: 700 / p, delay: d + 300 / p });
            });
            const sv = c.stars.find((s) => s.ring);
            A(sv.ringEl, [{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 900 / p, delay: (2300 + dead.length * 380) / p, easing: 'cubic-bezier(.2,.8,.3,1)' });
          }
          arm();
        }
        return {
          update(m) {
            if (P.gone || leaving) return;
            const q = ctx.pace() || 1;
            while (m.kind === 'kill' && c.blades() && c.blades() < Math.min(5, m.count)) { const part = c.grow(); part.mood = m.mood; if (!ctx.reduced) enter(part, -60, q * 1.6); }
            c.text(m);
            if (!ctx.reduced) {
              A(c.figure, [{ transform: 'scale(1)' }, { transform: 'scale(1.16)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 460 / q, fill: 'none' });
              for (const s of c.stars) if (s.m === 1) A(s.k, [{ transform: 'scale(1)' }, { transform: 'scale(1.5)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 520 / q, fill: 'none', composite: 'replace' });
            }
            readMs = Math.min(8400 + 3000, Math.max(readMs, (performance.now() - born) * q + 5200)); arm();
          },
        };
      }

      function still(n) {
        const c = chart(n, hash(n.title + n.big + n.mood) + 11);
        return c.root;
      }
      function clear() {
        for (const P of [...live]) P.end();
        live.clear(); slots.clear(); clearInterval(poll); poll = 0;
      }
      return { show, still, clear };
    },
  });
})();
