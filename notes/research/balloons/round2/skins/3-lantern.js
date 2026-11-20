// Skin 3, "The Lantern": a paper sky-lantern with the news brushed on its lit
// face. No creature. The rating is in the paper, the paint and the flame.
(() => {
  const W = 196, H = 298, CX = 98, S = 48, F = 220, K = 0.14, RX = 84, DOME = 40;
  const T1 = 51, T2 = 62, B1 = 188, B2 = 199; // the painted bands, at the edge
  const f = (n) => String(Math.round(n * 10) / 10);
  const rad = (d) => (d * Math.PI) / 180;
  // The shade is a round, tapering form seen from a little below: half-width at
  // a height, and a point on its front at an angle round the axis.
  const hw = (y) => RX - 22 * Math.pow((y - S) / (F - S), 1.5);
  const pt = (a, y) => { const h = hw(y); return [CX + h * Math.sin(a), y - K * h * Math.cos(a)]; };
  const dpt = (a, th) => { const h = RX * Math.cos(th); return [CX + h * Math.sin(a), S - DOME * Math.sin(th) - K * h * Math.cos(a)]; };
  const line = (p) => 'M' + p.map((q) => f(q[0]) + ' ' + f(q[1])).join('L');
  const BODY = (() => {
    const p = [];
    for (let i = 0; i <= 12; i++) { const y = F - (i * (F - S)) / 12; p.push([CX - hw(y), y]); }
    for (let i = 1; i < 28; i++) { const th = (Math.PI * i) / 28; p.push([CX - RX * Math.cos(th), S - DOME * Math.sin(th)]); }
    for (let i = 0; i <= 12; i++) { const y = S + (i * (F - S)) / 12; p.push([CX + hw(y), y]); }
    const h = hw(F);
    return `${line(p)}A${f(h)} ${f(K * h)} 0 0 0 ${f(CX - h)} ${F}Z`;
  })();
  const hoop = (y) => { const h = hw(y); return `M${f(CX - h)} ${y}A${f(h)} ${f(K * h)} 0 0 1 ${f(CX + h)} ${y}`; };
  const band = (y1, y2) => { const a = hw(y1), b = hw(y2); return `M${f(CX - a)} ${y1}A${f(a)} ${f(K * a)} 0 0 1 ${f(CX + a)} ${y1}L${f(CX + b)} ${y2}A${f(b)} ${f(K * b)} 0 0 0 ${f(CX - b)} ${y2}Z`; };
  const rib = (deg) => {
    const a = rad(deg), p = [];
    for (let i = 0; i <= 9; i++) p.push(dpt(a, 1.5 * (1 - i / 9)));
    for (let i = 1; i <= 10; i++) p.push(pt(a, S + (i * (F - S)) / 10));
    return line(p);
  };
  // n marks along a hoop: fn(x, y, foreshortening, slope in degrees)
  const along = (y, from, to, n, fn) => {
    let s = '';
    for (let i = 0; i < n; i++) {
      const a = rad(from + ((to - from) * i) / (n - 1)), [x, yy] = pt(a, y);
      s += fn(f(x), f(yy), f(Math.max(0.25, Math.cos(a))), f((Math.atan2(K * Math.sin(a), Math.cos(a)) * 180) / Math.PI), i);
    }
    return s;
  };
  const RIBS = [-67.5, -22.5, 22.5, 67.5];

  const MOOD = {
    calibrating: 'p0:#f6efdd;p1:#e3d8bc;p2:#b5a686;p3:#5f5440;fl:255,228,184;fc:255,250,236;ink:#2b2118;acc:#8a7a5c;lab:#4a3c2a;rib:#5a4630;gl:.7;ha:.7',
    poor: 'p0:#dfb486;p1:#bd8a5c;p2:#8b5d3d;p3:#3a2014;fl:232,108,58;fc:255,176,112;ink:#22120a;acc:#6e3a24;lab:#5a2414;rib:#3a2618;gl:.5;ha:.5',
    meh: 'p0:#f0e2ad;p1:#d8c37e;p2:#a69054;p3:#574a24;fl:242,214,124;fc:255,244,206;ink:#2a2010;acc:#7d6a2e;lab:#51431a;rib:#54421f;gl:.7;ha:.65',
    good: 'p0:#fce6ac;p1:#f0bc66;p2:#c17e36;p3:#6a3a12;fl:255,202,106;fc:255,248,220;ink:#2c1808;acc:#9c4a1c;lab:#8a3a14;rib:#5a3214;gl:.85;ha:.85',
    great: 'p0:#fff2c2;p1:#f7cc5c;p2:#ca9226;p3:#70470c;fl:255,220,122;fc:255,252,232;ink:#2a1905;acc:#a3301c;lab:#9a2a18;rib:#5c3a0e;gl:.95;ha:1',
    superb: 'p0:#fffcec;p1:#fce6a4;p2:#d4ab4e;p3:#7a5918;fl:255,240,188;fc:255,255,250;ink:#241806;acc:#2f4a72;lab:#2f4a72;rib:#5e4412;gl:1;ha:1.15',
    pvp: 'p0:#f4a88c;p1:#d1523a;p2:#8e241a;p3:#340908;fl:255,150,110;fc:255,244,226;ink:#1a0604;acc:#150605;lab:#1a0604;rib:#1c0a08;gl:.8;ha:.85',
    levelup: 'p0:#fff6cf;p1:#f8d470;p2:#d09c32;p3:#72460e;fl:255,226,140;fc:255,254,240;ink:#3a1408;acc:#9e2a22;lab:#9e2a22;rib:#5c360e;gl:1;ha:1.1',
    death: 'p0:#f2f7fa;p1:#c5d5e0;p2:#8195a8;p3:#232e3b;fl:190,222,246;fc:244,251,255;ink:#10151c;acc:#0c0f14;lab:#10151c;rib:#0e1116;gl:.7;ha:.9',
    achievement: 'p0:#fcf3d4;p1:#ecd597;p2:#ba924c;p3:#684818;fl:255,226,160;fc:255,252,236;ink:#2a1c0a;acc:#4f6b3a;lab:#3d5a2c;rib:#5a3e16;gl:.9;ha:.9',
  };
  const moodCss = Object.entries(MOOD).map(([m, v]) => `.lantern-rig[data-mood="${m}"]{${v.split(';').map((d) => '--' + d).join(';')}}`).join('\n');

  Harness.css('lantern', `
${moodCss}
.lantern-rig{position:relative;pointer-events:none}
.lantern-sc{position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}
.lantern-lean,.lantern-wob,.lantern-layer,.lantern-fx{position:absolute;inset:0}
.lantern-lean{transform-origin:${CX}px 120px}
.lantern-wob{transform-origin:${CX}px 60px}
.lantern-layer svg,.lantern-tas svg{display:block;overflow:visible}
.lantern-s0{stop-color:var(--p0);transition:stop-color 1.1s}
.lantern-s1{stop-color:var(--p1);transition:stop-color 1.1s}
.lantern-s2{stop-color:var(--p2);transition:stop-color 1.1s}
.lantern-s3{stop-color:var(--p3);transition:stop-color 1.1s}
.lantern-halo-w{position:absolute;left:${CX - 190}px;top:${150 - 210}px;width:380px;height:420px;opacity:calc(var(--hk,1)*var(--ha,1))}
.lantern-rig[data-mood="superb"] .lantern-halo-w,.lantern-rig[data-mood="levelup"] .lantern-halo-w{transform:scale(1.22)}
.lantern-halo{width:100%;height:100%;border-radius:50%;background:radial-gradient(closest-side,rgba(var(--fl),.44) 0,rgba(var(--fl),.3) 30%,rgba(var(--fl),.12) 56%,rgba(var(--fl),.03) 82%,rgba(var(--fl),0) 100%);animation:lantern-breathe 3.1s ease-in-out infinite}
.lantern-light{position:absolute;inset:0;clip-path:path('${BODY}');opacity:var(--gl,1)}
.lantern-glow{position:absolute;left:${CX - 84}px;top:${202 - 130}px;width:168px;height:260px;border-radius:50%;background:radial-gradient(closest-side,rgba(var(--fc),.95) 0,rgba(var(--fc),.6) 12%,rgba(var(--fl),.42) 34%,rgba(var(--fl),.16) 66%,rgba(var(--fl),0) 100%);animation:lantern-breathe 3.1s ease-in-out infinite}
.lantern-core{position:absolute;left:${CX - 9}px;top:186px;width:18px;height:30px;border-radius:50% 50% 50% 50%/62% 62% 38% 38%;background:radial-gradient(closest-side,rgba(var(--fc),1) 0,rgba(var(--fc),.85) 40%,rgba(var(--fl),0) 100%);transform-origin:50% 90%;animation:lantern-lick 1.7s ease-in-out infinite}
.lantern-flare{position:absolute;left:${CX - 90}px;top:60px;width:180px;height:230px;border-radius:50%;background:radial-gradient(closest-side,rgba(var(--fc),.9) 0,rgba(var(--fc),.4) 45%,rgba(var(--fc),0) 100%);opacity:0}
.lantern-rig[data-mood="poor"] .lantern-glow,.lantern-rig[data-mood="poor"] .lantern-halo{animation:lantern-gutter 2.1s linear infinite}
.lantern-rig[data-mood="poor"] .lantern-core{animation:lantern-gutter 2.1s linear infinite;height:20px;top:196px}
.lantern-rig[data-mood="poor"] .lantern-wob{animation:lantern-wobble 2.6s ease-in-out infinite}
.lantern-rig[data-mood="pvp"] .lantern-glow,.lantern-rig[data-mood="pvp"] .lantern-halo{animation:lantern-hard .62s ease-in-out infinite}
.lantern-rig[data-mood="pvp"] .lantern-core{animation-duration:.5s;height:36px;top:180px;width:14px;left:${CX - 7}px}
.lantern-rig[data-mood="death"] .lantern-glow,.lantern-rig[data-mood="death"] .lantern-core{animation:none}
.lantern-rig[data-mood="death"] .lantern-core{height:18px;width:10px;left:${CX - 5}px;top:197px}
.lantern-rig[data-mood="death"] .lantern-halo{animation:lantern-breathe 8s ease-in-out infinite}
.lantern-rig[data-mood="death"] .lantern-wob{animation:lantern-drift 7s ease-in-out infinite alternate}
.lantern-tas{position:absolute;left:0;top:216px;width:${W}px;height:84px;transform-origin:${CX}px 6px}
.lantern-face{position:absolute;left:28px;top:57px;width:140px;height:119px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:var(--ink);transition:color 1s}
.lantern-face>*{flex:none}
.lantern-dev{line-height:0;margin-bottom:3px}
.lantern-full .lantern-dev{display:none!important}
.lantern-title{font:italic 400 15.5px/1.12 "IM Fell English",Georgia,serif;max-width:138px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;padding:0 1px}
.lantern-big{display:flex;align-items:baseline;justify-content:center;gap:4px;white-space:nowrap;margin-top:1px}
.lantern-num{font:600 41px/.96 "Cormorant Garamond",Georgia,serif}
.lantern-num.lantern-long{font-size:33px}
.lantern-unit{font:italic 400 15px/1 "IM Fell English",Georgia,serif;opacity:.82}
.lantern-label{font:400 13px/1.25 "IM Fell English SC",Georgia,serif;letter-spacing:.14em;color:var(--lab);display:flex;align-items:center;gap:7px;margin-top:1px;transition:color 1s}
.lantern-label::before,.lantern-label::after{content:"";width:13px;height:1px;background:currentColor;opacity:.55}
.lantern-more{font:italic 600 12.5px/1.14 "Cormorant Garamond",Georgia,serif;opacity:.88;max-width:132px;margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.lantern-face[data-kind="levelup"] .lantern-num{font:600 32px/1 "Cormorant Garamond",Georgia,serif;letter-spacing:.01em}
.lantern-face[data-kind="death"] .lantern-num{font:400 25px/1 "IM Fell English SC",Georgia,serif;letter-spacing:.09em}
.lantern-face[data-kind="achievement"] .lantern-label{order:-1;font-size:12.5px;margin:0 0 3px}
.lantern-face[data-kind="achievement"] .lantern-dev{order:-2;margin-bottom:1px}
.lantern-face[data-kind="achievement"] .lantern-full .lantern-dev{display:none!important}
.lantern-title{font:italic 600 14px/1.1 "Cormorant Garamond",Georgia,serif;-webkit-line-clamp:6}
.lantern-spark{position:absolute;width:2.4px;height:2.4px;border-radius:50%;background:#fff3c8;box-shadow:0 0 3px 1px rgba(255,214,120,.7);opacity:0;animation:lantern-rise 3.2s ease-out infinite}
.lantern-moth{position:absolute;left:${CX}px;top:140px;width:0;height:0;animation:lantern-mx 2.7s ease-in-out infinite alternate}
.lantern-moth>i{position:absolute;animation:lantern-my 1.9s ease-in-out infinite alternate}
.lantern-moth svg{display:block;width:8px;height:6px;margin:-3px 0 0 -4px;opacity:.95;animation:lantern-flut .14s linear infinite alternate}
.lantern-fw{position:absolute;width:0;height:0}
.lantern-fw i{position:absolute;left:-.6px;top:-4px;width:1.2px;height:8px;border-radius:1px;opacity:0;transform-origin:.6px 4px}
@keyframes lantern-breathe{0%,100%{opacity:.84}13%{opacity:1}27%{opacity:.88}41%{opacity:.97}58%{opacity:.8}72%{opacity:.95}86%{opacity:.87}}
@keyframes lantern-gutter{0%,100%{opacity:.8}8%{opacity:.35}12%{opacity:.95}30%{opacity:.7}34%{opacity:.25}40%{opacity:.9}60%{opacity:.75}66%{opacity:.4}80%{opacity:1}}
@keyframes lantern-hard{0%,100%{opacity:.9}50%{opacity:1}}
@keyframes lantern-lick{0%,100%{transform:scale(1,1) skewX(0)}22%{transform:scale(.92,1.12) skewX(-3deg)}47%{transform:scale(1.06,.9) skewX(2deg)}71%{transform:scale(.95,1.08) skewX(3deg)}}
@keyframes lantern-wobble{0%,100%{transform:rotate(-1.7deg)}28%{transform:rotate(2.2deg)}52%{transform:rotate(-.7deg)}78%{transform:rotate(1.5deg)}}
@keyframes lantern-drift{from{transform:translate(-4px,1px)}to{transform:translate(4px,-3px)}}
@keyframes lantern-rise{0%{transform:translate(0,0);opacity:0}12%{opacity:.95}70%{opacity:.6}100%{transform:translate(var(--dx,6px),-84px);opacity:0}}
@keyframes lantern-mx{from{transform:translateX(-104px)}to{transform:translateX(104px)}}
@keyframes lantern-my{from{transform:translateY(-52px)}to{transform:translateY(66px)}}
@keyframes lantern-flut{from{transform:scaleX(1)}to{transform:scaleX(.3)}}
@media (prefers-reduced-motion:reduce){.lantern-rig *{animation:none!important;transition:none!important}.lantern-spark{opacity:.7}}
`);

  // ---- the painted parts (trusted markup, no game text) ----
  const svgOpen = (cls, h = H) => `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h}" width="${W}" height="${h}">`;

  const paper = (ctx, u) => {
    const r = ctx.rng(31);
    let wash = '', fib = '';
    for (let i = 0; i < 9; i++) wash += `<ellipse cx="${f(20 + r() * 156)}" cy="${f(20 + r() * 190)}" rx="${f(18 + r() * 30)}" ry="${f(12 + r() * 26)}" transform="rotate(${f(r() * 180)} 98 120)" fill="var(--${r() < 0.5 ? 'p0' : 'p2'})" opacity="${f(0.07 + r() * 0.09)}"/>`;
    for (let i = 0; i < 54; i++) {
      const x = 14 + r() * 168, y = 10 + r() * 208, a = r() * 6.3, l = 4 + r() * 9;
      fib += `<path d="M${f(x)} ${f(y)}q${f(Math.cos(a) * l * 0.5 + r() * 2)} ${f(Math.sin(a) * l * 0.5 - r() * 2)} ${f(Math.cos(a) * l)} ${f(Math.sin(a) * l)}" stroke="${r() < 0.5 ? '#fff' : 'var(--p3)'}" stroke-width=".6" opacity="${f(0.1 + r() * 0.12)}" fill="none"/>`;
    }
    return `${svgOpen('lantern-a')}<defs>
<radialGradient id="lnP${u}" gradientUnits="userSpaceOnUse" cx="98" cy="186" r="210"><stop offset="0" class="lantern-s0"/><stop offset=".52" class="lantern-s1"/><stop offset="1" class="lantern-s2"/></radialGradient>
<linearGradient id="lnC${u}" gradientUnits="userSpaceOnUse" x1="14" y1="0" x2="182" y2="0"><stop offset="0" class="lantern-s3" stop-opacity=".78"/><stop offset=".1" class="lantern-s3" stop-opacity=".36"/><stop offset=".27" class="lantern-s3" stop-opacity="0"/><stop offset=".73" class="lantern-s3" stop-opacity="0"/><stop offset=".9" class="lantern-s3" stop-opacity=".36"/><stop offset="1" class="lantern-s3" stop-opacity=".78"/></linearGradient>
<linearGradient id="lnD${u}" gradientUnits="userSpaceOnUse" x1="0" y1="8" x2="0" y2="74"><stop offset="0" class="lantern-s3" stop-opacity=".46"/><stop offset="1" class="lantern-s3" stop-opacity="0"/></linearGradient>
<clipPath id="lnK${u}"><path d="${BODY}"/></clipPath></defs>
<path d="${BODY}" fill="url(#lnP${u})"/><g clip-path="url(#lnK${u})">${wash}${fib}</g>
<path d="${BODY}" fill="url(#lnC${u})"/><path d="${BODY}" fill="url(#lnD${u})"/></svg>`;
  };

  const GOLD = '#ecd08a';
  const TREE = (() => {
    const half = `<path d="M98.6 152C110 148 123 139 125 125c1-7-6-10-8.500-4M98.600 136C108 132 117 123 117 109c0-7-7-8-7.500-2M98.600 121C104 117 108.500 108 107.500 97c-.5-5-5.500-5-5-.2M102 170c4 2.500 8 2.500 12 4.500"/>
<g stroke="none" fill="currentColor"><circle cx="126.500" cy="131" r="1.700"/><circle cx="121" cy="117.500" r="1.500"/><circle cx="118.500" cy="104" r="1.700"/><circle cx="112.500" cy="111" r="1.400"/><circle cx="109" cy="92" r="1.600"/><circle cx="104" cy="88.500" r="1.400"/><circle cx="113" cy="98" r="1.300"/><circle cx="129" cy="121" r="1.300"/></g>`;
    return `<g stroke="currentColor" stroke-width="2.300" stroke-linecap="round" fill="none">
<path d="M94.500 172C96.500 160 97 138 97.300 100L98 84 98.700 100C99 138 99.500 160 101.500 172Z" fill="currentColor" stroke="none"/><circle cx="98" cy="80.500" r="1.800" fill="currentColor" stroke="none"/>
${half}<g transform="translate(196 0) scale(-1 1)">${half}</g></g>`.replace(/(\.\d)00/g, '$1');
  })();

  const ornament = (mood) => {
    const fillBands = (col, op) => `<path d="${band(T1, T2)}" fill="${col}" opacity="${op}"/><path d="${band(B1, B2)}" fill="${col}" opacity="${op}"/>`;
    const edge = (col, op = 0.8, w = 0.8) => [T1 + 1.4, T2 - 1.4, B1 + 1.4, B2 - 1.4].map((y) => `<path d="${hoop(y)}" stroke="${col}" stroke-width="${w}" fill="none" opacity="${op}"/>`).join('');
    const dots = (y, n, col, r) => along(y, -72, 72, n, (x, yy, c) => `<ellipse cx="${x}" cy="${yy}" rx="${f(r * c)}" ry="${r}" fill="${col}"/>`);
    const mid = (T1 + T2) / 2, bmid = (B1 + B2) / 2;
    switch (mood) {
      case 'good':
        return `<path d="${hoop(mid)}" stroke="var(--acc)" stroke-width="1.1" fill="none" opacity=".5"/><path d="${hoop(bmid)}" stroke="var(--acc)" stroke-width="1.1" fill="none" opacity=".5"/>`;
      case 'great': {
        const dia = (y) => along(y, -72, 72, 13, (x, yy, c, rot) => `<path transform="translate(${x} ${yy}) rotate(${rot}) scale(${c} 1)" d="M0-2.700L2.700 0 0 2.700-2.700 0Z" fill="var(--acc)" opacity=".82"/>`.replace(/(\.\d)00/g, '$1'));
        return edge('var(--acc)', 0.8, 1.1) + dia(mid) + dia(bmid);
      }
      case 'superb': {
        const star = along(mid, -63, 63, 7, (x, yy, c, rot) => `<path transform="translate(${x} ${yy}) rotate(${rot}) scale(${c} 1)" d="M0-4.200L1-1 4.200 0 1 1 0 4.200-1 1-4.200 0-1-1Z" fill="#fbf6e2"/>`.replace(/(\.\d)00/g, '$1'));
        return fillBands('var(--acc)', 0.86) + edge(GOLD, 0.85) + star + dots(bmid, 15, GOLD, 1.3);
      }
      case 'pvp':
        return fillBands('#150605', 0.9) + edge('#d1523a', 0.55, 0.7);
      case 'levelup':
        return fillBands('var(--acc)', 0.88) + edge(GOLD, 0.9) + dots(mid, 15, GOLD, 1.5) + dots(bmid, 15, GOLD, 1.5);
      case 'death':
        return fillBands('#0c0f14', 0.92) + `<path d="${band(F - 8, F)}" fill="#0c0f14" opacity=".8"/>`;
      case 'achievement': {
        const leaf = (y) => along(y, -72, 72, 15, (x, yy, c, rot, i) => `<ellipse transform="translate(${x} ${yy}) rotate(${f(Number(rot) + (i % 2 ? 32 : -32))}) scale(${c} 1)" rx="3.6" ry="1.4" fill="#eee3b4" opacity=".9"/>`);
        return fillBands('var(--acc)', 0.84) + leaf(mid) + leaf(bmid);
      }
      case 'poor':
        return `<g opacity=".9"><path d="M30 78l25-4 3 21-24 5z" fill="var(--p0)" opacity=".55"/><path d="M30 78l25-4 3 21-24 5z" fill="none" stroke="var(--rib)" stroke-width=".8" stroke-dasharray="2 2.200" opacity=".6"/>
<path d="M141 118l22 5-4 25-21-4z" fill="var(--p2)" opacity=".5"/><path d="M141 118l22 5-4 25-21-4z" fill="none" stroke="var(--rib)" stroke-width=".8" stroke-dasharray="2 2.200" opacity=".6"/></g>`.replace(/(\.\d)00/g, '$1');
      default:
        return '';
    }
  };

  const frame = (mood, u) => {
    const hf = hw(F), ry = K * hf;
    const ribs = RIBS.map((d) => { const p = rib(d); return `<path d="${p}" stroke="var(--rib)" stroke-width="3.4" opacity=".1"/><path d="${p}" stroke="var(--rib)" stroke-width="1" opacity=".36"/><path d="${p}" stroke="var(--p0)" stroke-width=".7" opacity=".4" transform="translate(${d < 0 ? 1.6 : -1.6} 0)"/>`; }).join('');
    const scorch = mood === 'poor' ? `<radialGradient id="lnS${u}" gradientUnits="userSpaceOnUse" cx="158" cy="214" r="34"><stop offset="0" stop-color="#0d0705" stop-opacity=".95"/><stop offset=".4" stop-color="#2a140a" stop-opacity=".8"/><stop offset=".72" stop-color="#5a2c12" stop-opacity=".4"/><stop offset="1" stop-color="#5a2c12" stop-opacity="0"/></radialGradient>` : '';
    return `${svgOpen('lantern-b')}<defs><clipPath id="lnB${u}"><path d="${BODY}"/></clipPath>
<radialGradient id="lnO${u}" cx=".5" cy=".42" r=".6"><stop offset="0" style="stop-color:rgb(var(--fc))"/><stop offset=".3" style="stop-color:rgb(var(--fl))"/><stop offset="1" class="lantern-s1"/></radialGradient>${scorch}</defs>
<g clip-path="url(#lnB${u})"><g fill="none" stroke-linecap="round">${ribs}</g>${ornament(mood)}
<path d="${band(F - 8, F)}" fill="var(--p3)" opacity=".34"/>
${mood === 'poor' ? `<path d="${BODY}" fill="url(#lnS${u})"/><path d="M150 221l4-9 3 5 5-11 2 9 6-6-1 14z" fill="#0d0705" opacity=".85"/>` : ''}</g>
<g fill="none" stroke="var(--rib)" stroke-linecap="round"><path d="${hoop(49)}" stroke-width="1.5" opacity=".5"/><path d="${hoop(201)}" stroke-width="1.5" opacity=".5"/>
<path d="${BODY}" stroke-width="1.1" opacity=".72" stroke-linejoin="round"/></g>
<ellipse cx="${CX}" cy="${F}" rx="${f(hf)}" ry="${f(ry)}" fill="url(#lnO${u})"/>
<g fill="none" stroke="var(--rib)" stroke-linecap="round"><path d="M${f(CX - hf)} ${F}A${f(hf)} ${f(ry)} 0 0 0 ${f(CX + hf)} ${F}" stroke-width="1" opacity=".7"/>
<path d="M${f(CX - hf + 3)} ${F + 0.5}H${f(CX + hf - 3)}M${CX - 14} ${f(F - ry + 1.5)}L${CX + 14} ${f(F + ry - 1)}M${CX + 14} ${f(F - ry + 1.5)}L${CX - 14} ${f(F + ry - 1)}" stroke-width=".7" opacity=".75"/>
<path d="M${f(CX - hf)} ${F}A${f(hf)} ${f(ry)} 0 0 1 ${f(CX + hf)} ${F}" stroke-width="3" opacity=".95"/></g>
<ellipse cx="${CX}" cy="${F + 1}" rx="8" ry="2.6" fill="var(--rib)"/><ellipse cx="${CX}" cy="${F - 0.2}" rx="4.5" ry="1.3" style="fill:rgb(var(--fc))" opacity=".9"/></svg>`;
  };

  const tassel = (ctx, mood) => {
    const cord = (to, col = 'var(--rib)') => `<path d="M98 6V${to}" stroke="${col}" stroke-width="1" fill="none"/>`;
    let s;
    if (mood === 'calibrating') {
      s = `${cord(30)}<g transform="rotate(7 98 30)"><path d="M92 29h12l5 6v29H87V35z" fill="var(--p0)" stroke="var(--rib)" stroke-width=".9" stroke-linejoin="round"/><path d="M92 29h12l5 6v29H87V35z" fill="var(--p2)" opacity=".25"/><circle cx="98" cy="35" r="1.7" fill="none" stroke="var(--rib)" stroke-width=".9"/></g>`;
    } else if (mood === 'poor') {
      s = `${cord(27)}<circle cx="98" cy="28" r="1.9" fill="var(--rib)"/><path d="M98 29l-3 11M98 29l-.5 19M98 29l2.500 9M98 29c3 8 2 18 5 27" stroke="var(--acc)" stroke-width="1" fill="none" stroke-linecap="round" opacity=".9"/>`;
    } else if (mood === 'pvp') {
      s = `${cord(40, '#150605')}<path d="M98 74L90.500 49l5.500 3.500V38h4v14.500l5.500-3.500z" fill="#1b1716" stroke="#0a0606" stroke-width=".7" stroke-linejoin="round"/><path d="M98 71V41" stroke="#6a5f5a" stroke-width=".7" opacity=".7"/><path d="M95.500 40h5M95.500 43h5" stroke="#6b2a1c" stroke-width="1.200"/>`;
    } else if (mood === 'death') {
      s = `<path d="M96.500 6L92 62l4.500-5 3 7L99.500 6z" fill="#0c0f14" opacity=".92"/><path d="M98 6l3.500 40 2.500-5 3.500 5.500L99.500 6z" fill="#0c0f14" opacity=".8"/>`;
    } else if (mood === 'achievement') {
      s = `${cord(34)}<path d="M93 46l-7 31 6.500-3.500 4 5.500 3-31z" fill="#7e2219"/><path d="M102 46l8 27-6.500-2-3 6-3.500-29z" fill="#8f2a20"/>
<path d="M98 32.500c5-.6 9 1 11.500 4.500 2.600 3.500 2.800 8.500.3 12-2.300 3.600-6.800 5.800-11.500 5.500-4.800.2-9.500-2.300-11.500-6.300-2-3.800-1.600-9 1.500-12 2.300-2.600 6-3.900 9.700-3.700z" fill="#a2332a" stroke="#6e1a14" stroke-width=".8"/>
<circle cx="98" cy="43.500" r="7.600" fill="none" stroke="#c9645a" stroke-width=".8" opacity=".8"/><path d="M98 38.300l1.500 3.400 3.700.3-2.800 2.400.9 3.600-3.300-2-3.300 2 .9-3.600-2.800-2.400 3.700-.3z" fill="#6e1a14"/><path d="M91 38c1.500-2 3.500-3 6-3.300" stroke="#e39a8e" stroke-width="1" fill="none" stroke-linecap="round" opacity=".7"/>`;
    } else {
      const r = ctx.rng(9);
      let th = '';
      for (let i = 0; i < 12; i++) { const x = 92.6 + i * 0.98, dx = (x - 98) * 0.55 + (r() - 0.5) * 1.6, len = 25 + r() * 6; th += `<path d="M${f(x)} 46q${f(dx * 0.2)} ${f(len * 0.5)} ${f(dx)} ${f(len)}" stroke="var(--acc)" stroke-width="1.3" opacity="${f(0.7 + r() * 0.3)}" fill="none" stroke-linecap="round"/>`; }
      const bead = mood === 'levelup' || mood === 'superb' || mood === 'great' ? GOLD : 'var(--rib)';
      s = `${cord(30)}<circle cx="98" cy="32.500" r="2.700" fill="${bead}" stroke="var(--rib)" stroke-width=".6"/>${th}<path d="M93.500 37.500Q98 33 102.500 37.500l1 8.500h-11z" fill="var(--acc)"/><path d="M92.500 45h11" stroke="${bead}" stroke-width="1.500" opacity=".9"/><path d="M92.700 46.500h10.600" stroke="var(--p3)" stroke-width=".7" opacity=".5"/>`;
    }
    return `${svgOpen('lantern-t', 84)}${s.replace(/(\.\d)00/g, '$1')}</svg>`;
  };

  const device = (mood) => {
    const m = {
      superb: `<svg viewBox="64 76 68 100" width="21" height="31" style="color:#9a7420">${TREE}</svg>`,
      pvp: `<svg viewBox="0 0 44 18" width="44" height="18"><path d="M1 9Q22-5 43 9 22 23 1 9Z" fill="#150605"/><circle cx="22" cy="9" r="6.800" fill="none" stroke="var(--p1)" stroke-width=".9" opacity=".8"/><ellipse cx="22" cy="9" rx="2.100" ry="6.600" fill="var(--p0)"/></svg>`,
      levelup: `<svg viewBox="0 0 60 40" width="60" height="40"><path d="M30 0l1.800 5.200L37 7l-5.200 1.800L30 14l-1.800-5.200L23 7l5.200-1.800z" fill="var(--acc)"/><path d="M13 39L11 21l6 7 5-11 4.500 9L30 15l3.500 11L38 17l5 11 6-7-2 18z" fill="var(--acc)"/><path d="M13.500 35h33" stroke="#ecd08a" stroke-width="1.300"/><g fill="#ecd08a"><circle cx="11" cy="20.500" r="1.600"/><circle cx="22" cy="16.500" r="1.600"/><circle cx="38" cy="16.500" r="1.600"/><circle cx="49" cy="20.500" r="1.600"/><circle cx="30" cy="31" r="1.500"/><circle cx="21" cy="31.500" r="1.100"/><circle cx="39" cy="31.500" r="1.100"/></g></svg>`,
      death: `<svg viewBox="0 0 34 42" width="34" height="42"><path d="M17.500 21C13 16 21 13 16.500 8.500 13.500 5 19 3 17.500 0" fill="none" stroke="var(--ink)" stroke-width="1" stroke-linecap="round" opacity=".55"/><path d="M17 26.500v-4" stroke="var(--ink)" stroke-width="1.100" stroke-linecap="round"/><path d="M12.500 26.500h9.500V38h-9.500z" fill="var(--p0)" stroke="var(--ink)" stroke-width="1" stroke-linejoin="round"/><path d="M19.500 26.500c0 3 2.200 3 2.200 6" fill="none" stroke="var(--ink)" stroke-width=".8"/><path d="M6 38.500h22M9 40.800h16" stroke="var(--ink)" stroke-width="1.100" stroke-linecap="round"/></svg>`,
      achievement: (() => {
        let s = '';
        for (const sd of [-1, 1]) {
          s += `<path d="M${55 + sd * 5} 11Q${55 + sd * 28} 13 ${55 + sd * 50} 4" fill="none" stroke="var(--acc)" stroke-width=".9"/>`;
          for (let i = 0; i < 7; i++) { const t = i / 6, x = 55 + sd * (8 + t * 40), y = 11.6 - t * t * 7; for (const up of [-1, 1]) s += `<ellipse transform="translate(${f(x)} ${f(y + up * 1.8)}) rotate(${f(sd * (up * 30 - 8 - t * 10))})" cx="${2.4 * sd}" rx="4.300" ry="1.600" fill="var(--acc)" opacity="${up < 0 ? 0.95 : 0.8}"/>`; }
        }
        return `<svg viewBox="0 0 110 17" width="110" height="17">${s}<circle cx="55" cy="11" r="2.300" fill="#8f2a20"/></svg>`;
      })(),
    }[mood];
    return m ? m.replace(/(\.\d)00/g, '$1') : '';
  };

  const MOTH = '<svg viewBox="0 0 11 8"><path d="M5.5 4L.5.8Q0 4.500 2.200 7ZM5.500 4L10.500.8Q11 4.500 8.800 7Z" fill="#cdbd9a"/><path d="M5.500 1.800V6.400" stroke="#4a3c2c" stroke-width="1.400"/></svg>'.replace(/(\.\d)00/g, '$1');

  Harness.register({
    id: 'lantern',
    name: 'The Lantern',
    blurb: 'A paper sky-lantern, of the sort sent up at a feast, with the news brushed on its lit face. The paper, the paint and the flame say how good it was; a moth keeps it company after dark.',
    create(ctx) {
      let uid = 0;
      const live = new Set();

      function fill(st, n) {
        const set = (el, v) => { el.textContent = v || ''; el.style.display = v ? '' : 'none'; };
        st.face.dataset.kind = n.kind;
        set(st.title, n.title); set(st.num, n.big); set(st.unit, n.unit); set(st.label, n.label); set(st.more, n.more);
        st.big.style.display = n.big ? '' : 'none';
        st.face.classList.toggle('lantern-full', !!n.more);
        st.num.classList.toggle('lantern-long', n.kind === 'kill' && (n.big || '').length > 6);
      }

      function dye(st, mood) {
        if (st.mood === mood) return;
        st.mood = mood;
        st.rig.dataset.mood = mood;
        st.layerB.replaceChildren(ctx.svg(frame(mood, st.u)));
        st.tas.replaceChildren(ctx.svg(tassel(ctx, mood)));
        const d = device(mood);
        st.dev.replaceChildren(...(d ? [ctx.svg(d)] : []));
        st.dev.style.display = d ? '' : 'none';
        st.amb.replaceChildren();
        if (mood === 'superb' || mood === 'levelup') {
          const r = ctx.rng(17);
          for (let i = 0; i < 6; i++) {
            const s = ctx.el('i', 'lantern-spark');
            s.style.left = f(30 + r() * 136) + 'px'; s.style.top = f(4 + r() * 34) + 'px';
            s.style.setProperty('--dx', f((r() - 0.5) * 30) + 'px');
            s.style.animationDuration = f(2.6 + r() * 1.8) + 's'; s.style.animationDelay = f(-r() * 4) + 's';
            st.amb.append(s);
          }
        }
      }

      function burst(st, loop) {
        const r = ctx.rng(5), cols = ['linear-gradient(#fff6d8,rgba(240,200,110,0))', 'linear-gradient(#f4fbe6,rgba(150,200,140,0))', 'linear-gradient(#fff,rgba(170,200,235,0))', 'linear-gradient(#fff0e0,rgba(230,140,110,0))', 'linear-gradient(#fff6d8,rgba(240,200,110,0))'];
        const spots = [[10, 8, 46, 0], [186, 40, 38, 300], [104, -26, 52, 620], [-6, 96, 30, 2700], [200, 120, 34, 3100]];
        const span = loop ? 0.3 : 1, dur = 1500 / span;
        spots.forEach(([x, y, R, delay], bi) => {
          const g = ctx.el('div', 'lantern-fw');
          g.style.left = x + 'px'; g.style.top = y + 'px';
          const n = 16 + (bi % 2) * 6;
          for (let i = 0; i < n; i++) {
            const s = ctx.el('i'), a = (i * 360) / n + r() * 12, d = R * (0.7 + r() * 0.4);
            s.style.background = cols[(bi + (i % 3 === 0 ? 4 : 0)) % cols.length];
            const at = (k) => `rotate(${f(a)}deg) translateY(${f(-d * k)}px)`;
            if (ctx.reduced) { s.style.transform = at(0.9); s.style.opacity = '.7'; } else {
              s.animate([
                { transform: at(0.05), opacity: 0, offset: 0, easing: 'cubic-bezier(.1,.7,.3,1)' },
                { opacity: 1, offset: 0.1 * span },
                { transform: at(1), opacity: 0.9, offset: 0.62 * span, easing: 'ease-in' },
                { transform: at(1.1) + ' scaleY(.4)', opacity: 0, offset: span },
                ...(loop ? [{ transform: at(1.1), opacity: 0, offset: 1 }] : []),
              ], { duration: dur, delay: loop ? delay * 0.6 : delay, fill: 'both', iterations: loop ? Infinity : 1 });
            }
            g.append(s);
          }
          st.fx.append(g);
        });
      }

      function build(n, sc) {
        const u = ++uid, sky = ctx.skyMode();
        const rig = ctx.el('div', 'lantern-rig');
        rig.style.width = W * sc + 'px'; rig.style.height = H * sc + 'px';
        rig.style.setProperty('--hk', String({ night: 1, dusk: 0.8, day: 0.5, overcast: 0.6 }[sky] ?? 1));
        const scl = ctx.el('div', 'lantern-sc'), lean = ctx.el('div', 'lantern-lean'), wob = ctx.el('div', 'lantern-wob');
        scl.style.transform = `scale(${sc})`;
        const haloW = ctx.el('div', 'lantern-halo-w'); haloW.append(ctx.el('div', 'lantern-halo'));
        const layerA = ctx.el('div', 'lantern-layer'); layerA.append(ctx.svg(paper(ctx, u)));
        const light = ctx.el('div', 'lantern-light'), flare = ctx.el('div', 'lantern-flare');
        light.append(ctx.el('div', 'lantern-glow'), ctx.el('div', 'lantern-core'), flare);
        const layerB = ctx.el('div', 'lantern-layer'), tas = ctx.el('div', 'lantern-tas');
        const face = ctx.el('div', 'lantern-face'), dev = ctx.el('div', 'lantern-dev');
        const title = ctx.el('div', 'lantern-title'), big = ctx.el('div', 'lantern-big'), num = ctx.el('span', 'lantern-num'), unit = ctx.el('span', 'lantern-unit');
        const label = ctx.el('div', 'lantern-label'), more = ctx.el('div', 'lantern-more');
        big.append(num, unit); face.append(dev, title, big, label, more);
        const amb = ctx.el('div', 'lantern-fx'), fx = ctx.el('div', 'lantern-fx');
        wob.append(haloW, layerA, light, layerB, tas, face, amb, fx);
        if (sky === 'night' || sky === 'dusk') {
          const r = ctx.rng(u * 7 + 3), count = sky === 'night' && r() < 0.3 ? 2 : 1;
          for (let i = 0; i < count; i++) {
            const m = ctx.el('div', 'lantern-moth'), inner = ctx.el('i');
            inner.append(ctx.svg(MOTH)); m.append(inner);
            m.style.animationDuration = f(2.3 + r() * 1.4 + i) + 's'; m.style.animationDelay = f(-r() * 5) + 's';
            inner.style.animationDuration = f(1.5 + r() * 1.1 + i * 0.6) + 's'; inner.style.animationDelay = f(-r() * 5) + 's';
            if (i) m.style.top = '176px';
            if (ctx.reduced) m.style.transform = `translate(${i ? -84 : 92}px,${i ? 20 : -30}px)`;
            wob.append(m);
          }
        }
        lean.append(wob); scl.append(lean); rig.append(scl);
        const st = { rig, lean, wob, haloW, flare, layerB, tas, face, dev, title, big, num, unit, label, more, amb, fx, u, mood: null };
        dye(st, n.mood); fill(st, n);
        return st;
      }

      return {
        show(n) {
          const sc = n.kind === 'levelup' ? 1.08 : 1;
          const st = build(n, sc);
          let fired = false;
          const flight = ctx.fly(st.rig, {
            w: W * sc, h: H * sc,
            frame({ lean, swing, phase }) {
              st.lean.style.transform = `rotate(${(lean * 0.7).toFixed(2)}deg)`;
              const s = Math.max(-24, Math.min(24, swing * 2.3 - lean * 0.7));
              st.tas.style.transform = `rotate(${s.toFixed(2)}deg)`;
              if (!fired && phase === 'read' && st.mood === 'levelup') { fired = true; burst(st, false); }
            },
          });
          live.add(flight);
          flight.gone.then(() => live.delete(flight));
          return {
            update(n2) {
              dye(st, n2.mood); fill(st, n2);
              flight.extend(1200);
              if (ctx.reduced) return;
              st.flare.animate([{ opacity: 0 }, { opacity: 0.95, offset: 0.18 }, { opacity: 0 }], { duration: 700, easing: 'ease-out' });
              st.haloW.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.2)', offset: 0.2 }, { transform: 'scale(1)' }], { duration: 800, easing: 'ease-out' });
              st.face.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 420, easing: 'ease-out' });
            },
          };
        },
        still(n) {
          const st = build(n, 1);
          st.tas.style.transform = `rotate(${n.mood === 'poor' ? 7 : 3}deg)`;
          if (n.kind === 'levelup') burst(st, true);
          return st.rig;
        },
        clear() {
          for (const fl of [...live]) fl.end();
          live.clear();
        },
      };
    },
  });
})();
