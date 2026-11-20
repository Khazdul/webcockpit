// Direction 1, "The Auditor": the goblin in the hot-air balloon, grown up.
// An old goblin clerk of the Guild of Accountants keeps the ledger of the
// slain from a patched balloon; each notice is an entry on parchment hung
// under his basket. Pen and wash: thin sepia ink, hatching, muted pigments.
(() => {
  const INK = '#33241a', SKIN = '#8f8e72', SKIN_D = '#69685a', SKIN_L = '#b0ad90', COAT = '#3f3833', CREAM = '#e9e0c8';
  const HEMP = '#cdb27c', NS = 'http://www.w3.org/2000/svg';

  // ---------- the envelope: gores between meridians ----------
  const mer = (f) => `C${100 + 36 * f},5 ${100 + 58 * f},20 ${100 + 58 * f},42C${100 + 58 * f},64 ${100 + 24 * f},76 ${100 + 10 * f},86`;
  const merR = (f) => `C${100 + 24 * f},76 ${100 + 58 * f},64 ${100 + 58 * f},42C${100 + 58 * f},20 ${100 + 36 * f},5 100,5`;
  const gore = (a, b) => `M100,5${mer(a)}L${100 + 10 * b},86${merR(b)}Z`;
  const F = [-1, -0.9, -0.63, -0.23, 0.23, 0.63, 0.9, 1];
  const PIG = ['#a45a43', '#c6a25c', '#7f9a88', '#d9c9a3', '#b06e4c', '#c9a660', '#8b6c4a'];
  const PIG2 = ['#8b6c4a', '#7f9a88', '#d2bf96', '#b4674a', '#c6a25c', '#86705a', '#a45a43'];
  const rope = (d, w = 1) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${0.9 + w * 0.8}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${HEMP}" stroke-width="${w * 0.8}" stroke-linecap="round"/>`;

  const DEFS = `<svg xmlns="${NS}" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<filter id="auditor-ink" x="-6%" y="-6%" width="112%" height="112%" color-interpolation-filters="sRGB">
<feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="2" seed="4" result="n"/>
<feDisplacementMap in="SourceGraphic" in2="n" scale="1.5" xChannelSelector="R" yChannelSelector="G" result="d"/>
<feTurbulence type="fractalNoise" baseFrequency=".045 .06" numOctaves="3" seed="12" result="b"/>
<feColorMatrix in="b" type="matrix" values="0 0 0 0 .32  0 0 0 0 .2  0 0 0 0 .1  1.5 0 0 0 -.52" result="blot"/>
<feComposite in="blot" in2="d" operator="in" result="bl"/>
<feBlend in="bl" in2="d" mode="multiply"/>
</filter>
<clipPath id="auditor-env"><path d="${gore(-1, 1)}"/></clipPath>
<clipPath id="auditor-low"><path d="M30,44Q100,60 170,44V100H30Z"/></clipPath>
<clipPath id="auditor-shc"><path d="${gore(0.5, 1)}"/></clipPath>
<clipPath id="auditor-bk"><path d="M68,169H132L128,196Q100,200 72,196Z"/></clipPath>
<radialGradient id="auditor-sh" cx=".33" cy=".25" r=".85"><stop offset="0" stop-color="#fff3d0" stop-opacity=".42"/><stop offset=".42" stop-color="#fff3d0" stop-opacity="0"/><stop offset=".74" stop-color="#3a2212" stop-opacity=".24"/><stop offset="1" stop-color="#24140a" stop-opacity=".58"/></radialGradient>
<radialGradient id="auditor-glow" cx=".5" cy="1" r=".42"><stop offset="0" stop-color="#ffb24a" stop-opacity=".7"/><stop offset="1" stop-color="#ffb24a" stop-opacity="0"/></radialGradient>
<linearGradient id="auditor-bsh" x1="0" x2="1"><stop offset="0" stop-color="#fff0c0" stop-opacity=".25"/><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#22140a" stop-opacity=".5"/></linearGradient>
<radialGradient id="auditor-wx-red" cx=".36" cy=".32" r=".8"><stop offset="0" stop-color="#d9523f"/><stop offset=".55" stop-color="#a3241b"/><stop offset="1" stop-color="#5e0f0c"/></radialGradient>
<radialGradient id="auditor-wx-gold" cx=".36" cy=".32" r=".8"><stop offset="0" stop-color="#f0d27a"/><stop offset=".55" stop-color="#c0932f"/><stop offset="1" stop-color="#76541a"/></radialGradient>
<radialGradient id="auditor-wx-black" cx=".36" cy=".32" r=".8"><stop offset="0" stop-color="#5a5550"/><stop offset=".55" stop-color="#262220"/><stop offset="1" stop-color="#0c0a09"/></radialGradient>
</defs></svg>`;

  function envelope(mood) {
    let s = '';
    for (let i = 0; i < 7; i++) s += `<path d="${gore(F[i], F[i + 1])}" fill="${PIG[i]}"/>`;
    s += '<g clip-path="url(#auditor-low)">';
    for (let i = 0; i < 7; i++) s += `<path d="${gore(F[i], F[i + 1])}" fill="${PIG2[i]}"/>`;
    s += '</g>';
    // patches
    s += `<path d="M58,24L71,20.5L74,33L61,37Z" fill="#cdbb93" stroke="${INK}" stroke-width=".5" stroke-dasharray="1.6 1.3"/>`;
    s += `<path d="M121,60L134,57L137,68.5L125,72Z" fill="#9c5a44" stroke="${INK}" stroke-width=".5" stroke-dasharray="1.6 1.3"/>`;
    s += `<path d="M84,66L93,65L94,74L85,75Z" fill="#7f9a88" stroke="${INK}" stroke-width=".5" stroke-dasharray="1.6 1.3"/>`;
    // wash and warm light from the brazier
    s += `<path d="${gore(-1, 1)}" fill="url(#auditor-sh)"/><path d="${gore(-1, 1)}" fill="url(#auditor-glow)"/>`;
    // hatching in the shade
    s += `<g clip-path="url(#auditor-shc)" stroke="${INK}" stroke-width=".42" opacity=".6" fill="none">`;
    for (let x = 118; x < 200; x += 3.1) s += `<path d="M${x},0l-34,96"/>`;
    s += '</g>';
    s += `<g clip-path="url(#auditor-env)" stroke="${INK}" fill="none">`;
    for (const [y, sag, o] of [[70, 7, 0.45], [74, 6.5, 0.4], [78, 6, 0.35], [82, 5, 0.3]]) s += `<path d="M52,${y}Q100,${y + sag * 2} 150,${y}" stroke-width=".4" opacity="${o}" stroke-dasharray="9 2 5 2"/>`;
    // seams along the latitudes, with stitches
    s += `<path d="M36,22Q100,32 164,22" stroke-width=".6" opacity=".8"/><path d="M36,23.6Q100,33.6 164,23.6" stroke-width=".45" stroke-dasharray="1.2 1.8" opacity=".7"/>`;
    s += `<path d="M36,66Q100,80 164,66" stroke-width=".6" opacity=".8"/><path d="M36,67.6Q100,81.6 164,67.6" stroke-width=".45" stroke-dasharray="1.2 1.8" opacity=".7"/>`;
    s += '</g>';
    // gore seams, the outline heavier in the shade
    for (let i = 1; i < 7; i++) s += `<path d="M100,5${mer(F[i])}" fill="none" stroke="${INK}" stroke-width="${i === 3 || i === 4 ? 0.75 : 0.6}"/>`;
    s += `<path d="M100,5${mer(-1)}" fill="none" stroke="${INK}" stroke-width=".95" stroke-linecap="round"/><path d="M100,5${mer(1)}" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/>`;
    // the girdle rope and its knots
    if (mood === 'death') {
      s += `<g clip-path="url(#auditor-env)"><path d="M36,45Q100,61 164,45" fill="none" stroke="#15110e" stroke-width="5"/><path d="M36,42.4Q100,58.4 164,42.4" fill="none" stroke="#8a7f70" stroke-width=".4"/></g>`;
      s += `<g fill="#15110e" stroke="#8a7f70" stroke-width=".4" stroke-linejoin="round"><path d="M99,54C96,62 97,69 92,77l4,-1.5l1.5,3.5C101,71 100,63 101.5,55Z"/><path d="M101,54C105,61 104,67 108,74l-3.6,-.6l-.6,3.4C100.5,70 100,62 99,55Z"/><path d="M100,53.5C94,48 87,49 87.5,53.5C88,58 95,57.5 100,53.5Z"/><path d="M100,53.5C106,48 113,49 112.5,53.5C112,58 105,57.5 100,53.5Z"/><circle cx="100" cy="53.5" r="2.1"/></g>`;
    } else {
      s += `<g clip-path="url(#auditor-env)">${rope('M36,44Q100,60 164,44', 1.9)}</g>`;
      s += `<path d="M38,45.5Q100,61.5 162,45.5" fill="none" stroke="${INK}" stroke-width=".5" stroke-dasharray=".8 2.2" clip-path="url(#auditor-env)"/>`;
    }
    // the cap
    s += `<path d="M87,9.5Q100,14 113,9.5" fill="none" stroke="${INK}" stroke-width=".7"/><path d="M96.5,5.4Q100,1.6 103.5,5.4Q100,7 96.5,5.4Z" fill="#8b6c4a" stroke="${INK}" stroke-width=".7"/>`;
    return s;
  }

  function rigging() {
    let s = '';
    const top = [[50.4, 46.9], [71.5, 50.3], [90.1, 51.8], [109.9, 51.8], [128.5, 50.3], [149.6, 46.9]], hoop = [71, 80, 93, 107, 120, 129];
    top.forEach(([x, y], i) => { s += rope(`M${x},${y}L${hoop[i]},${i === 0 || i === 5 ? 101.5 : 103.6}`, 0.8); s += `<circle cx="${x}" cy="${y}" r="1.25" fill="${HEMP}" stroke="${INK}" stroke-width=".5"/>`; });
    return s;
  }

  const brazier = () => `<ellipse cx="100" cy="86" rx="10" ry="2.3" fill="#4a2413" stroke="${INK}" stroke-width=".7"/><ellipse cx="100" cy="86.3" rx="6.5" ry="1.2" fill="#e08a35" opacity=".8"/>`
    + `<path d="M70,101.5A30,3.3 0 0 1 130,101.5" fill="none" stroke="${INK}" stroke-width="1.5"/><path d="M70,101.5A30,3.3 0 0 1 130,101.5" fill="none" stroke="#8b6c4a" stroke-width=".7"/>`
    + `<path d="M93,103L91.6,97.4H108.4L107,103" fill="none" stroke="${INK}" stroke-width=".6"/>`
    + `<path d="M91.2,96.2H108.8Q108,101.8 100,101.8Q92,101.8 91.2,96.2Z" fill="#514840" stroke="${INK}" stroke-width=".8"/><path d="M92,96.3H108" stroke="#c9b48a" stroke-width=".5"/><path d="M93.5,95.9q1.6,-1.6 3.2,0q1.6,-1.8 3.3,0q1.6,-1.6 3.2,0q1.6,-1.4 3,0" fill="#d9622b" stroke="${INK}" stroke-width=".35"/>`;

  function basket(mood) {
    let s = `<path d="M68,169H132L128,196Q100,200 72,196Z" fill="#b08d55" stroke="none"/><g clip-path="url(#auditor-bk)" fill="none" stroke="${INK}">`;
    for (let y = 174, r = 0; y < 198; y += 4.4, r++) {
      s += `<path d="M66,${y}Q100,${y + 3.5} 134,${y}" stroke-width=".5" opacity=".75"/>`;
      for (let x = 70 + (r % 2) * 3.2; x < 132; x += 6.4) s += `<path d="M${x},${y - 3.6 + Math.abs(x - 100) * -0.02}v3.4" stroke-width=".45" opacity=".7"/>`;
    }
    s += `</g><path d="M68,169H132L128,196Q100,200 72,196Z" fill="url(#auditor-bsh)"/>`;
    s += `<g clip-path="url(#auditor-bk)" stroke="${INK}" stroke-width=".4" opacity=".55">`;
    for (let x = 118; x < 150; x += 2.6) s += `<path d="M${x},166l-9,36"/>`;
    s += `</g><path d="M68,169L72,196Q100,200 128,196L132,169" fill="none" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>`;
    // the rolled rim
    s += `<rect x="64.5" y="165.4" width="71" height="6" rx="3" fill="#96743f" stroke="${INK}" stroke-width=".9"/><path d="M66,166.6H132" stroke="#e2c88c" stroke-width=".6" opacity=".8"/>`;
    for (let x = 68; x < 134; x += 3.6) s += `<path d="M${x},166l1.6,4.8" stroke="${INK}" stroke-width=".4" opacity=".7"/>`;
    // sandbags
    const bag = (x, y) => rope(`M${x > 100 ? 133 : 67},170L${x},${y - 7}`, 0.7) + `<path d="M${x},${y - 7.5}c-2.2,2.2 -5.4,6.4 -4.8,10.6c.6,3.6 9,3.6 9.6,0c.6,-4.2 -2.6,-8.4 -4.8,-10.6z" fill="#b7a27a" stroke="${INK}" stroke-width=".8"/><path d="M${x - 1.8},${y - 5.2}h3.6M${x - 2.6},${y + 1}q1,-2 0,-3.4M${x + 2},${y + 2.6}l1.5,-2.4M${x + .4},${y + 3.6}l1.4,-2.4" fill="none" stroke="${INK}" stroke-width=".45"/>`;
    s += bag(61.5, 183) + bag(139, 186);
    if (mood === 'achievement') {
      s += `<g stroke="${INK}" stroke-width=".5" stroke-linejoin="round"><path d="M97,186l-3.4,10.5l3.2,-1.8l1.6,3.3l2.2,-10.5Z" fill="#35557a"/><path d="M103,186l3.4,10.5l-3.2,-1.8l-1.6,3.3l-2.2,-10.5Z" fill="#2b466a"/>`
        + `<path d="M100,177.4l1.9,1.3l2.3,-.3l.9,2.1l2.1,.9l-.3,2.3l1.3,1.9l-1.3,1.9l.3,2.3l-2.1,.9l-.9,2.1l-2.3,-.3l-1.9,1.3l-1.9,-1.3l-2.3,.3l-.9,-2.1l-2.1,-.9l.3,-2.3l-1.3,-1.9l1.3,-1.9l-.3,-2.3l2.1,-.9l.9,-2.1l2.3,.3Z" fill="#a4402e"/><circle cx="100" cy="185.6" r="3.6" fill="#d2ab4e"/></g>`;
    }
    return s;
  }

  const adornment = (mood) => mood === 'levelup'
    ? `<path d="M130.6,104C141,98.5 149,108.5 163,102l-5,6.4l8,3C152,117.5 143,107 131,113Z" fill="#a53c2b" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/><path d="M132,108.4C142,103.6 150,112.6 160,108.6" fill="none" stroke="#e2c070" stroke-width="1.1"/><path d="M139,104.2q1,3.4 .2,6M148,105.4q1.2,3.2 .6,6.2" fill="none" stroke="${INK}" stroke-width=".4" opacity=".7"/>`
    : '';

  // ---------- the clerk ----------
  const MOODS = {
    calibrating: { head: 0, ear: 2, brow: [0, 0], lid: 0.38, mouth: 'flat', pose: 'write', quill: 'hand' },
    poor: { head: -6, ear: 27, brow: [15, 0.2], lid: 0.5, mouth: 'frown', pose: 'rim', quill: 'ear' },
    meh: { head: -8, ear: 15, brow: [-3, 1], lid: 0.68, mouth: 'flat', pose: 'chin', quill: 'ear' },
    good: { head: -4, ear: -3, brow: [4, -0.4], lid: 0.32, mouth: 'smirk', pose: 'rim', quill: 'ear' },
    great: { head: 3, ear: -19, brow: [9, -3], lid: 0, mouth: 'o', pose: 'rim', quill: 'ear' },
    superb: { head: 6, ear: -29, brow: [13, -3.4], lid: 0, mouth: 'agape', pose: 'up', quill: 'fly' },
    pvp: { head: -3, ear: -15, brow: [-17, 1.2], lid: 0.3, mouth: 'grin', pose: 'rim', quill: 'ear' },
    levelup: { head: 4, ear: -12, brow: [6, -1.6], lid: 0.2, mouth: 'smile', pose: 'toast', quill: 'ear' },
    death: { head: -12, ear: 31, brow: [13, 0.6], lid: 1, mouth: 'sad', pose: 'hat', quill: '', hat: false },
    achievement: { head: 13, ear: -8, brow: [7, -2], lid: 2, mouth: 'smug', pose: 'lapel', quill: 'ear' },
  };
  const QUILL = (tf) => `<g transform="${tf}"><path d="M8,0C12,-4.2 20,-4.8 27.5,-1.2C22,2.6 13,3 8,0Z" fill="${CREAM}" stroke="${INK}" stroke-width=".55" stroke-linejoin="round"/><path d="M0,0L26.5,-.8" stroke="${INK}" stroke-width=".6" stroke-linecap="round"/><path d="M12.5,-2.6l2,2.3M16.5,-3.5l2.2,3M20.5,-3.3l1.8,2.7M13,1.8l1.6,-1.9M18,2l1.6,-2.2" stroke="${INK}" stroke-width=".35" opacity=".7"/></g>`;
  const HAT = (band = '#7a3a2e') => `<path d="M-12.5,-49.6C-12.5,-52.4 18.5,-53.4 18.5,-50.2C18.5,-47.4 -12.5,-46.8 -12.5,-49.6Z" fill="#2f2a27" stroke="${INK}" stroke-width=".8"/><path d="M-7.6,-50.6C-8,-53 -8.8,-56.4 -8.2,-59C-3,-61 9,-61.6 13.8,-60C14.4,-56.4 13.6,-53.4 13.6,-51.2C8,-52.7 -2,-52.5 -7.6,-50.6Z" fill="#3a3430" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/><path d="M-7.9,-53.3C-2,-55 8,-55.2 13.7,-53.8L13.6,-51.2C8,-52.7 -2,-52.5 -7.6,-50.6Z" fill="${band}" stroke="${INK}" stroke-width=".4"/><path d="M-7.2,-58.4C-2,-60.2 8,-60.8 13,-59.4M-11.6,-50.3C-6,-52 12,-52.6 17.6,-50.8" fill="none" stroke="#a89878" stroke-width=".5" opacity=".9"/><path d="M-1,-60.2q3,1.6 7,.2" fill="none" stroke="${INK}" stroke-width=".4"/>`;
  const limb = (pts, w = 5) => `<polyline points="${pts}" fill="none" stroke="${INK}" stroke-width="${w + 1.4}" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${pts}" fill="none" stroke="${COAT}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${pts}" fill="none" stroke="#8d7f6c" stroke-width=".45" stroke-linecap="round" stroke-linejoin="round" transform="translate(-1.6 -1.2)" opacity=".7"/>`;
  const cuff = (x, y, a) => `<rect x="-3.4" y="-1.5" width="6.8" height="3" rx="1" fill="${CREAM}" stroke="${INK}" stroke-width=".5" transform="translate(${x} ${y}) rotate(${a})"/>`;
  const fist = (x, y, r = 3.1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${SKIN}" stroke="${INK}" stroke-width=".7"/><path d="M${x - 1.6},${y - .6}q1.4,-1.4 2.6,0M${x - 1},${y + 1.2}q1.2,-1 2.2,0" fill="none" stroke="${INK}" stroke-width=".4"/>`;
  const open = (x, y, rot) => {
    let s = '';
    for (const a of [-50, -18, 12, 44]) { const r = (rot + a) * Math.PI / 180, ex = x + Math.cos(r) * 6.2, ey = y + Math.sin(r) * 6.2; s += `<path d="M${x},${y}L${ex.toFixed(1)},${ey.toFixed(1)}" stroke="${INK}" stroke-width="2.3" stroke-linecap="round"/><path d="M${x},${y}L${ex.toFixed(1)},${ey.toFixed(1)}" stroke="${SKIN}" stroke-width="1.2" stroke-linecap="round"/><circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r=".75" fill="#2a2c44"/>`; }
    return s + `<circle cx="${x}" cy="${y}" r="2.7" fill="${SKIN}" stroke="${INK}" stroke-width=".7"/>`;
  };
  const rimHand = (x) => {
    let s = `<path d="M${x - 5},-1.6Q${x - 5},-6 ${x},-6Q${x + 5},-6 ${x + 5},-1.6Z" fill="${SKIN}" stroke="${INK}" stroke-width=".7"/><path d="M${x - 2},-4.6q2,-.8 3.6,0" fill="none" stroke="${INK}" stroke-width=".35"/>`;
    for (let i = 0; i < 4; i++) { const fx = x - 4.9 + i * 2.5; s += `<rect x="${fx}" y="-2.6" width="2.2" height="${7.4 - (i % 3 === 0 ? 1 : 0)}" rx="1.1" fill="${SKIN}" stroke="${INK}" stroke-width=".5"/><rect x="${fx + .3}" y="${2.2 - (i % 3 === 0 ? 1 : 0)}" width="1.6" height="2.2" rx=".8" fill="#2a2c44" opacity=".8"/>`; }
    return s;
  };

  function head(p) {
    const o = `stroke="${INK}" stroke-linejoin="round" stroke-linecap="round"`;
    const ear = `M1.5,-37.5C9,-42 24,-43 40,-38.5C29,-32 13,-27.5 4,-27.5C1.5,-30 1,-34.5 1.5,-37.5Z`;
    let s = `<g transform="rotate(${p.head} 2 -8)">`;
    // skull and profile
    s += `<path d="M3,-51C-5,-52.5 -11,-48 -13.5,-41C-14.5,-39.2 -16.6,-38.6 -17,-37C-17,-35.6 -16,-35 -16.6,-34C-20,-31 -27.6,-24.4 -29.2,-19.6C-30,-16.4 -27,-15.3 -24.5,-16.8C-22,-18.3 -19.5,-20.4 -17.5,-21C-17.5,-19.6 -18.6,-18.5 -18.6,-17L-16,-16C-18,-15.5 -18.6,-14 -17.6,-13C-17,-11.6 -18.6,-10 -18.1,-8C-17.6,-5 -13,-3.8 -9,-5C-3,-6.5 3,-9 6,-13C9,-17 13,-22 14.5,-30C16,-41 11,-50 3,-51Z" fill="${SKIN}" ${o} stroke-width=".95"/>`;
    // washes: pate light, socket, cheek hollow, under the jaw
    s += `<ellipse cx="-1" cy="-44.5" rx="7.5" ry="4" fill="${SKIN_L}" opacity=".6"/><ellipse cx="-10.6" cy="-34" rx="4.6" ry="3.4" fill="${SKIN_D}" opacity=".75"/><path d="M-9,-27C-5,-28 0,-26 1,-21C0,-16 -4,-13 -8,-14C-10,-18 -10.5,-23 -9,-27Z" fill="${SKIN_D}" opacity=".5"/><path d="M-17.6,-8C-13,-5.2 -3,-7.6 5.6,-13.4C2,-9 -4,-6.2 -9.4,-5.2C-13,-4.2 -17,-5.2 -17.6,-8Z" fill="${SKIN_D}" opacity=".8"/><path d="M-27.5,-20.6C-26,-17.2 -22,-19.4 -18.4,-21.4L-19.6,-23.4Z" fill="${SKIN_D}" opacity=".6"/><path d="M-18.5,-33.4C-21,-30.6 -25,-26.6 -27,-22.6" fill="none" stroke="${SKIN_L}" stroke-width="1" opacity=".8"/>`;
    if (p.hat === false) s += `<path d="M-6,-48.6q4,-2 8,-1.4M-9.5,-45.4q2.4,-1.6 5,-1.8" fill="none" stroke="${INK}" stroke-width=".4" opacity=".7"/><circle cx="5" cy="-46.6" r=".7" fill="${SKIN_D}"/><circle cx="8.6" cy="-43.4" r=".5" fill="${SKIN_D}"/>`;
    // hatching: cheek, temple, nape
    s += `<path d="M-7.6,-25.6l1.9,6.6M-5.4,-26l1.9,6.8M-3.2,-25.4l1.7,6.2M-1,-24.2l1.4,5M9,-25l2.8,-5.4M7.4,-21.6l3.6,-5.6M5.4,-18.4l3.6,-4.8" fill="none" stroke="${INK}" stroke-width=".4" opacity=".65"/>`;
    s += `<path d="M-17.2,-22C-13.6,-20.6 -12.2,-18.6 -12,-16.4M-22.6,-18.6q1.4,-1.8 2.8,-.6M-10.4,-45q4,-1.8 8,-.6M-11.6,-42.4q3.6,-1.5 7,-.5" fill="none" ${o} stroke-width=".5" opacity=".85"/><circle cx="-23.6" cy="-24.6" r=".65" fill="${SKIN_D}" stroke="${INK}" stroke-width=".3"/>`;
    // wisps of hair at the nape
    s += `<path d="M13.6,-28q5,1.6 6.6,6.4M13,-24.6q4.4,2.4 4.6,7.6M11.4,-21.4q3,2.6 2.6,6.4" fill="none" stroke="${INK}" stroke-width="1.2" stroke-linecap="round" opacity=".8"/><path d="M13.6,-28q5,1.6 6.6,6.4M13,-24.6q4.4,2.4 4.6,7.6M11.4,-21.4q3,2.6 2.6,6.4" fill="none" stroke="#d9d3c0" stroke-width=".6" stroke-linecap="round"/>`;
    // the eye under its lid
    if (p.lid === 2) s += `<path d="M-13.6,-32.4Q-10.5,-35.6 -7.4,-32.6" fill="none" ${o} stroke-width=".9"/>`;
    else {
      const c = -36 + p.lid * 4.6;
      s += `<ellipse cx="-10.5" cy="-33.2" rx="2.6" ry="1.8" fill="#e9dfae" stroke="${INK}" stroke-width=".4"/><circle cx="${-11.3 - (p.lid < 0.1 ? 0 : 0.2)}" cy="${-33.3 + p.lid * 0.7}" r=".95" fill="#1d130d"/>`;
      s += `<path d="M-13.6,-33.3Q-10.5,-37.6 -7.4,-33.3Q-10.5,${c} -13.6,-33.3Z" fill="${SKIN_L}"/><path d="M-13.8,-33.3Q-10.5,${c} -7.2,-33.3" fill="none" ${o} stroke-width=".85"/>`;
    }
    s += `<path d="M-13.2,-31Q-10.5,-29.6 -7.8,-31.2M-6.6,-34.2l1.9,-.9M-6.5,-32.8l2,.3" fill="none" ${o} stroke-width=".4" opacity=".8"/>`;
    // the brow, a grey tuft
    s += `<g transform="translate(0 ${p.brow[1]}) rotate(${p.brow[0]} -11 -39.4)"><path d="M-18,-37.4Q-12.5,-43 -4.6,-39.4L-3.4,-40.4L-4.2,-38.2Q-11.5,-39.4 -18,-37.4Z" fill="#ddd6c2" ${o} stroke-width=".55"/></g>`;
    // half-moon spectacles
    s += `<path d="M-16.8,-30L-9.2,-30A3.8,3.7 0 0 1 -16.8,-30Z" fill="#dfeaea" fill-opacity=".45" stroke="#2a1c10" stroke-width=".8" stroke-linejoin="round"/><path d="M-16.8,-30Q-19,-31.6 -21,-30.2L-23.8,-29.8A2.2,3 0 0 0 -22,-27" fill="none" stroke="#2a1c10" stroke-width=".7" stroke-linecap="round"/><path d="M-9.2,-30.1L4.5,-33" stroke="#2a1c10" stroke-width=".55"/><path d="M-15.4,-29.2l1.5,1.7" stroke="#fff" stroke-width=".6" opacity=".9" stroke-linecap="round"/>`;
    // the mouth
    const m = p.mouth, line = (d) => `<path d="${d}" fill="none" ${o} stroke-width=".85"/>`;
    if (m === 'flat') s += line('M-16,-16Q-12,-15.3 -8,-15.7');
    else if (m === 'frown') s += line('M-16,-16Q-11.5,-17.4 -8,-13.4M-7.4,-14.6q1.2,1.2 .4,2.6');
    else if (m === 'sad') s += line('M-16,-16Q-12,-16.8 -8.6,-14.4');
    else if (m === 'smirk') s += line('M-16,-16Q-11.5,-14.8 -7.4,-17.6M-7.4,-19q1.5,1.2 .3,2.8');
    else if (m === 'smug') s += line('M-16,-16Q-11,-13.4 -6.6,-18.2M-6.4,-19.8q1.6,1.3 .2,3');
    else if (m === 'smile') s += `<path d="M-16.6,-16.4Q-11,-15.4 -6.2,-19Q-9,-12.6 -16.6,-16.4Z" fill="#2a1712" ${o} stroke-width=".7"/><path d="M-15,-16.2l1.6,.3l-.2,1.3z" fill="${CREAM}"/>` + line('M-6,-20.4q1.5,1.2 .2,2.8');
    else if (m === 'o') s += `<ellipse cx="-15.2" cy="-15.2" rx="1.9" ry="1.7" fill="#2a1712" stroke="${INK}" stroke-width=".6"/>`;
    else if (m === 'agape') s += `<path d="M-17.4,-17Q-11.5,-17 -5.6,-20.6Q-8,-10.6 -17,-12.4Z" fill="#2a1712" ${o} stroke-width=".7"/><path d="M-15.6,-16.9l2,.1l-.3,2.1l-1.5,-.2zM-12,-13l1.6,-.4l.4,1.4z" fill="${CREAM}"/>`;
    else if (m === 'grin') s += `<path d="M-17.6,-17.4Q-11,-16.8 -4.6,-21Q-6.6,-12.4 -17,-13.2Z" fill="#2a1712" ${o} stroke-width=".7"/><path d="M-17,-17.2l1.1,2.2l1.2,-2l1.2,2.3l1.3,-2.2l1.3,2.4l1.4,-2.6l1.4,2.5l1.4,-3.2l1.2,2.2l1.4,-3.4Q-11,-16.9 -17,-17.2Z" fill="${CREAM}" stroke="${INK}" stroke-width=".25"/>` + line('M-4.2,-22.6q1.6,1.4 .2,3.2');
    if (p.hat !== false) s += `<g transform="rotate(${p.pose === 'up' ? 13 : 6} 3 -50)">${HAT()}</g>`;
    if (p.quill === 'ear') s += QUILL('translate(7 -29) rotate(-64)');
    // near ear
    s += `<g transform="rotate(${p.ear} 4 -33)"><path d="${ear}" fill="${SKIN}" ${o} stroke-width=".9"/><path d="M5.4,-35.2C13,-38.4 24,-39.2 35,-37.6C25.6,-34.6 14,-31.2 6.4,-31Z" fill="#8a6f5c" opacity=".55"/><path d="M6,-34.4C14,-37 24,-38 34,-37.4M22,-31.2l1.4,-2.2M17.5,-29.8l1.3,-2" fill="none" ${o} stroke-width=".45"/></g>`;
    return s + '</g>';
  }

  // back: behind the basket; front: over its rim
  function goblin(mood) {
    const p = MOODS[mood] || MOODS.calibrating;
    let back = '', front = '';
    if (p.pose === 'up') back += limb('12,-5 27,-9 36,-29') + cuff(35.4, -27.6, -66) + open(37, -32.6, -70);
    back += `<path d="M-7.5,-13L-6,-3H9L10.5,-19Z" fill="${SKIN_D}" stroke="${INK}" stroke-width=".7"/>`;
    back += `<path d="M-15.5,3C-16.5,-5 -11,-9.4 -5,-10.2L8,-11.4C15,-10.4 20,-6 21,3Z" fill="${COAT}" stroke="${INK}" stroke-width=".9"/><path d="M-14,1C-14.6,-4.6 -10.6,-8 -5,-9" fill="none" stroke="#8d7f6c" stroke-width=".5" opacity=".8"/>`;
    back += `<path d="M-8.4,-11.4L-11.6,-4.6L-5.4,-7.4Z" fill="${CREAM}" stroke="${INK}" stroke-width=".55" stroke-linejoin="round"/><path d="M-6.6,-8.4q-1.6,3.6 -.6,7.4l-3,-.6q-.6,-3.2 1.4,-6Z" fill="#8e3b2c" stroke="${INK}" stroke-width=".45"/>`;
    back += head(p);
    if (p.pose === 'rim') front += rimHand(-22) + rimHand(22);
    else if (p.pose === 'write') {
      front += rimHand(22) + `<path d="M-33,-3.4L-14.5,-4L-13.5,-1.6H-32Z" fill="${CREAM}" stroke="${INK}" stroke-width=".6" stroke-linejoin="round"/><path d="M-32,-1.3H-13.2" stroke="#6a2f22" stroke-width="1.3"/><path d="M-29,-3l10,-.3" stroke="${INK}" stroke-width=".3" opacity=".7"/>`;
      front += limb('-13,1 -20,-1 -25,-8', 4.4) + QUILL('translate(-22 -5) rotate(-124)') + fist(-25.6, -9.6, 2.8);
    } else if (p.pose === 'chin') {
      front += rimHand(23) + limb('-3,3 -8,-4', 4.6) + fist(-9.4, -8.6, 3.5);
      front += `<g fill="none" stroke-linecap="round"><path d="M-33,-10.6q-4.6,-1.6 -6,1.6q-1,3 2.4,3.4M-37,-15q-2.4,-.8 -3.4,.8" stroke="${INK}" stroke-width="1.5"/><path d="M-33,-10.6q-4.6,-1.6 -6,1.6q-1,3 2.4,3.4M-37,-15q-2.4,-.8 -3.4,.8" stroke="${CREAM}" stroke-width=".7"/></g>`;
    } else if (p.pose === 'up') {
      front += limb('-10,0 -26,-5 -40,-21') + cuff(-38.6, -19.6, 48) + open(-42, -24, -128);
      front += QUILL('translate(17 -62) rotate(-24)') + `<path d="M13,-55l-2.4,3.4M17.6,-53.4l-1.4,3.6M9.4,-58.4l-3.4,2.2" fill="none" stroke="${CREAM}" stroke-width=".7" stroke-linecap="round" opacity=".9"/>`;
    } else if (p.pose === 'toast') {
      front += rimHand(22) + limb('-11,1 -23,-3 -34,-18') + cuff(-32.8, -16.4, 52);
      front += `<g transform="translate(-38.5 -25) rotate(-9)" stroke="${INK}" stroke-linejoin="round"><path d="M4.6,-3.4q4.6,.4 4.4,4q-.2,3.2 -4.4,3.2" fill="none" stroke-width="2.6"/><path d="M4.6,-3.4q4.6,.4 4.4,4q-.2,3.2 -4.4,3.2" fill="none" stroke="#a9a493" stroke-width="1.3"/><path d="M-5,-6H5L4.4,6.6H-4.4Z" fill="#a9a493" stroke-width=".8"/><path d="M-4.9,-3.2H4.9M-4.5,4H4.5" stroke-width=".5"/><path d="M-3.2,-5v10" stroke="#e6e2d2" stroke-width=".8" opacity=".7"/><path d="M-5.6,-6.2q-.6,-2.6 2,-2.6q.8,-2 3,-1.2q2,-1.4 3.4,.4q2.8,-.2 2.6,2.6q.6,1.8 -1.4,1.6H-4.4Q-5.8,-5 -5.6,-6.2Z" fill="#f1ead6" stroke-width=".6"/></g>` + fist(-35.6, -21.4, 3);
    } else if (p.pose === 'hat') {
      front += rimHand(-21) + `<g transform="translate(14 39) rotate(9) scale(.94)">${HAT('#15110e')}</g>` + fist(8, -5.4, 3);
    } else if (p.pose === 'lapel') {
      front += rimHand(22) + limb('-17,2 -9,-4', 4.6) + fist(-7.6, -6, 3) + `<path d="M-7.4,-8.6q.8,-2.6 2.4,-2.2q1,1 -.4,3.2" fill="${SKIN}" stroke="${INK}" stroke-width=".55"/>`;
    }
    return { back, front };
  }

  function balloonSvg(mood) {
    const g = goblin(mood);
    return `<svg xmlns="${NS}" class="auditor-svg" viewBox="28 0 144 202" width="154" height="216" aria-hidden="true"><g filter="url(#auditor-ink)">`
      + `${rope('M74.5,103.6L72.5,167', 0.7)}${rope('M125.5,103.6L127.5,167', 0.7)}`
      + `<g class="auditor-env">${envelope(mood)}</g>${rigging()}${brazier()}${adornment(mood)}`
      + `<g transform="translate(100 168)" class="auditor-gb">${g.back}</g>`
      + basket(mood)
      + `<path d="M70,101.5A30,3.3 0 0 0 130,101.5" fill="none" stroke="${INK}" stroke-width="2"/><path d="M70,101.5A30,3.3 0 0 0 130,101.5" fill="none" stroke="#a98652" stroke-width="1"/>`
      + `${rope('M70.4,102.4L68,167', 1)}${rope('M129.6,102.4L132,167', 1)}`
      + `<g transform="translate(100 168)" class="auditor-gf">${g.front}</g>`
      + `<path d="M100,197.4v3" stroke="${INK}" stroke-width="1.4"/></g></svg>`;
  }

  const FLAME = `<svg xmlns="${NS}" class="auditor-flame" viewBox="0 0 16 20" width="12" height="15" aria-hidden="true"><path d="M8,18.5C3,18.5 2.4,12 5.4,9C6,11 7,11 7,9C7,5.5 8.6,3 9,1C9.6,5 13.6,8 13,13C12.8,16.4 11,18.5 8,18.5Z" fill="#dd7a2a" stroke="#7a2e12" stroke-width=".35"/><path d="M8,18C5.6,18 5.4,14 7.4,11.4C8,13.4 9,12.4 9,10.4C10.6,13 11.2,18 8,18Z" fill="#f8dc84"/></svg>`;

  // ---------- seals ----------
  const SEAL = {
    superb: ['gold', '#8e2a1f', '<path d="M0,-6.2L1.7,-2L6,-1.9L2.6,.9L3.8,5.2L0,2.7L-3.8,5.2L-2.6,.9L-6,-1.9L-1.7,-2Z"/>'],
    pvp: ['red', '#2a2422', '<path d="M-5.4,-5.4L4,4M5.4,-5.4L-4,4M-5.6,2.4l3.2,3.2M5.6,2.4l-3.2,3.2" fill="none" stroke-width="1.5" stroke-linecap="round"/>'],
    levelup: ['gold', '#35557a', '<path d="M0,-6L5.4,0H2.2V5.4H-2.2V0H-5.4Z"/>'],
    achievement: ['red', '#35557a', '<path d="M0,-6.2L1.7,-2L6,-1.9L2.6,.9L3.8,5.2L0,2.7L-3.8,5.2L-2.6,.9L-6,-1.9L-1.7,-2Z"/>'],
    death: ['black', '#15110e', '<path d="M-3.4,-5.6H3.4M-3.4,5.6H3.4M-2.8,-5.4C-2.8,-1.6 2.8,1.6 2.8,5.4M2.8,-5.4C2.8,-1.6 -2.8,1.6 -2.8,5.4" fill="none" stroke-width="1.1" stroke-linecap="round"/>'],
  };
  function seal(mood) {
    const [wax, rib, motif] = SEAL[mood];
    const emb = wax === 'gold' ? ['#7a5616', '#fbe9a8'] : wax === 'red' ? ['#5a0d0a', '#f08a72'] : ['#000', '#8a847c'];
    return `<svg xmlns="${NS}" class="auditor-seal" viewBox="-17 -15 34 46" width="34" height="46" aria-hidden="true">`
      + `<path d="M-6,4L-10.5,27l4.4,-3l2.6,5L1,6Z" fill="${rib}" stroke="${INK}" stroke-width=".7" stroke-linejoin="round"/><path d="M5,4L10.5,26l-4.6,-2.4l-2,5L-1,6Z" fill="${rib}" stroke="${INK}" stroke-width=".7" stroke-linejoin="round" opacity=".92"/>`
      + `<path d="M-1,-13.4C4,-14.6 9,-12 11.6,-8C14.6,-4.6 14,1 12,4.6C10.6,9.4 5.6,12.6 1,12.6C-4,13.6 -9.6,11 -11.6,6.6C-14.4,2.6 -13.6,-3.4 -11,-7C-9,-11 -5,-13 -1,-13.4Z" fill="url(#auditor-wx-${wax})" stroke="${emb[0]}" stroke-width=".8"/>`
      + `<circle r="8.6" fill="none" stroke="${emb[0]}" stroke-width=".9" opacity=".7"/><circle r="8.6" fill="none" stroke="${emb[1]}" stroke-width=".5" opacity=".7" transform="translate(-.5 -.5)"/>`
      + `<g fill="${emb[0]}" stroke="${emb[0]}" stroke-width="0" opacity=".85">${motif}</g><g fill="${emb[1]}" stroke="${emb[1]}" stroke-width="0" opacity=".5" transform="translate(-.6 -.6)">${motif}</g></svg>`;
  }

  // ---------- CSS ----------
  const noise = (freq, m) => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='${m}'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E")`;
  const GRAIN = noise('.75', '0 0 0 0 .36 0 0 0 0 .22 0 0 0 0 .08 0 0 0 .9 -.3');
  const WORN = noise('.5', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -3.6 2.75');
  Harness.css('auditor', `
.auditor-root{position:relative;width:180px;font-family:"IM Fell English",Georgia,serif;color:#2c1e13;line-height:1.15}
.auditor-root[data-kind=achievement]{width:206px}
.auditor-rig{position:relative;transform-origin:50% 22%;will-change:transform}
.auditor-top{position:relative;width:154px;height:216px;margin:0 auto}
.auditor-svg{display:block;overflow:visible;filter:drop-shadow(0 0 .7px rgba(240,226,192,.95)) drop-shadow(0 0 3px rgba(240,226,192,.3))}
.auditor-day .auditor-svg{filter:drop-shadow(0 0 .6px rgba(246,236,210,.9)) drop-shadow(0 2px 3px rgba(30,24,20,.3))}
.auditor-flame{position:absolute;left:71px;top:89.5px;transform-origin:50% 92%;animation:auditor-flick 1.1s ease-in-out infinite alternate}
.auditor-glow{position:absolute;left:54px;top:75px;width:46px;height:46px;border-radius:50%;background:radial-gradient(closest-side,rgba(255,176,84,.5),rgba(255,176,84,0));animation:auditor-pulse 1.7s ease-in-out infinite alternate}
@keyframes auditor-flick{0%{transform:scale(1,1) skewX(0)}35%{transform:scale(.9,1.12) skewX(-5deg)}70%{transform:scale(1.06,.92) skewX(4deg)}100%{transform:scale(.95,1.08) skewX(-2deg)}}
@keyframes auditor-pulse{from{opacity:.65}to{opacity:1}}
.auditor-note{position:relative;margin:-5px auto 0;width:168px;transform-origin:50% 2px;will-change:transform;filter:drop-shadow(0 0 .7px rgba(240,226,192,.9)) drop-shadow(0 2px 4px rgba(0,0,0,.4))}
.auditor-root[data-kind=achievement] .auditor-note{width:204px}
.auditor-cords{display:block;width:100%;height:17px;overflow:visible}
.auditor-rod{position:relative;height:6px;margin:-2px -3px 0;border-radius:3px;background:linear-gradient(#b89562,#7b5a34 55%,#4c351d);box-shadow:inset 0 0 0 .8px ${INK};z-index:1}
.auditor-rod::before,.auditor-rod::after{content:"";position:absolute;top:-1.5px;width:6px;height:9px;border-radius:3px;background:linear-gradient(#a6834f,#59401f);box-shadow:inset 0 0 0 .8px ${INK}}
.auditor-rod::before{left:-4px}.auditor-rod::after{right:-4px}
.auditor-sheet{position:relative;margin:-2px 4px 0}
.auditor-bump{animation:auditor-bump .5s cubic-bezier(.3,1.6,.5,1)}
@keyframes auditor-bump{0%{transform:translateY(0) rotate(0)}30%{transform:translateY(5px) rotate(-2.4deg) scale(1.03)}100%{transform:none}}
.auditor-paper{position:relative;padding:8px 8px 9px 17px;background:${GRAIN},radial-gradient(130% 90% at 28% 12%,rgba(255,248,222,.75),rgba(255,248,222,0) 62%),radial-gradient(70% 60% at 92% 96%,rgba(128,88,40,.34),rgba(128,88,40,0) 70%),linear-gradient(175deg,#ead9ae,#dcc592 70%,#d0b47e);box-shadow:inset 0 0 12px rgba(112,74,28,.5),inset 0 5px 5px -3px rgba(60,36,14,.55)}
.auditor-paper::before{content:"";position:absolute;left:10px;top:0;bottom:0;width:2px;border-left:1px solid rgba(150,52,38,.6);border-right:1px solid rgba(150,52,38,.4)}
.auditor-pre{font-style:italic;font-size:11px;color:#70502e;letter-spacing:.01em;margin-bottom:1px}
.auditor-title{font-size:14.5px;line-height:1.12;color:#24170e;overflow-wrap:anywhere;font-variant-ligatures:none;font-kerning:none}
.auditor-sum{margin-top:1px}
.auditor-fig{display:inline-flex;align-items:baseline;gap:4px;border-bottom:3px double rgba(51,36,26,.75);padding:0 2px 0 0;line-height:1.08}
.auditor-big{font:600 31px/1 "Cormorant Garamond",Georgia,serif;font-variant-numeric:lining-nums;color:#1f140c;letter-spacing:0}
.auditor-unit{font-style:italic;font-size:14px;color:#5a4028}
.auditor-stamp{display:inline-block;font:700 10.5px/1 "Cinzel",Georgia,serif;letter-spacing:.13em;text-transform:uppercase;padding:3.5px 5px 2.5px 6px;border:1.6px solid currentColor;border-radius:2px;box-shadow:inset 0 0 0 1.4px #e2cf9f,inset 0 0 0 2.1px currentColor;transform:rotate(-6deg);float:right;-webkit-mask-image:${WORN};mask-image:${WORN};margin:-8px 3px 0 6px;color:#6d6257}
.auditor-stamp:empty{border-style:dashed;border-width:1px;box-shadow:none;width:40px;height:8px;opacity:.6;-webkit-mask-image:none;mask-image:none}
.auditor-stamp[data-mood=poor]{color:#77695c}.auditor-stamp[data-mood=meh]{color:#5c6672}.auditor-stamp[data-mood=good]{color:#33684a}.auditor-stamp[data-mood=great]{color:#27508a}
.auditor-stamp[data-mood=superb]{color:#a1281c;font-size:11.5px}.auditor-stamp[data-mood=pvp]{color:#8a1a17;font-size:11.5px}
.auditor-more{font:italic 500 13px/1.12 "Cormorant Garamond",Georgia,serif;color:#3a2716;clear:both;padding-top:3px;overflow-wrap:anywhere}
.auditor-rem{font-style:italic;font-size:11px;color:#70502e;margin-top:4px}
.auditor-paper::after{content:"";display:block;clear:both}
.auditor-seal{position:absolute;right:-7px;bottom:-25px;filter:drop-shadow(0 1px 1px rgba(0,0,0,.45))}
.auditor-paper[data-seal]{padding-bottom:10px}
.auditor-root[data-seal]{padding-bottom:24px}
/* the mourning card */
.auditor-paper[data-kind=death]{padding:15px 12px 14px;text-align:center;background:${GRAIN},linear-gradient(175deg,#efe9d9,#e2dac6);box-shadow:inset 0 0 0 5px #14110e,inset 0 0 0 6.5px #efe9d9,inset 0 0 0 7.3px #14110e,inset 0 0 14px rgba(60,50,40,.4)}
.auditor-paper[data-kind=death]::before,.auditor-paper[data-kind=levelup]::before,.auditor-paper[data-kind=achievement]::before{display:none}
.auditor-paper[data-kind=death] .auditor-pre{color:#3c3630;letter-spacing:.04em}
.auditor-paper[data-kind=death] .auditor-big{display:block;font:400 27px/1.1 "IM Fell English SC","IM Fell English",serif;letter-spacing:.07em;color:#0f0c0a;margin:1px 0 2px}
.auditor-paper[data-kind=death] .auditor-rem{color:#3c3630;margin-top:3px}
.auditor-orn{display:block;margin:0 auto 2px}
/* the warrant of promotion */
.auditor-paper[data-kind=levelup]{padding:9px 12px 12px;text-align:center;box-shadow:inset 0 0 0 3px #dcc592,inset 0 0 0 4px rgba(142,59,44,.75),inset 0 0 12px rgba(112,74,28,.5)}
.auditor-paper[data-kind=levelup] .auditor-big{display:block;font-size:29px;line-height:1.1;color:#8a2a1c;margin:1px 0}
.auditor-paper[data-kind=levelup] .auditor-pre{font:500 9px/1.4 "Cinzel",serif;font-style:normal;letter-spacing:.07em;text-transform:uppercase;color:#5a4028;white-space:nowrap}
.auditor-paper[data-kind=levelup] .auditor-rem{margin-top:2px;padding:0 14px}
/* the certificate */
.auditor-paper[data-kind=achievement]{padding:10px 15px 14px;text-align:center;box-shadow:inset 0 0 0 3px #dcc592,inset 0 0 0 4px rgba(53,85,122,.8),inset 0 0 0 5.5px #dcc592,inset 0 0 0 6px rgba(53,85,122,.5),inset 0 0 14px rgba(112,74,28,.5)}
.auditor-paper[data-kind=achievement] .auditor-head{font:700 10.5px/1.2 "Cinzel",serif;letter-spacing:.24em;text-transform:uppercase;color:#8a2a1c;display:flex;align-items:center;gap:6px}
.auditor-paper[data-kind=achievement] .auditor-head::before,.auditor-paper[data-kind=achievement] .auditor-head::after{content:"";flex:1;height:3px;border-top:1px solid rgba(138,42,28,.7);border-bottom:1px solid rgba(138,42,28,.4)}
.auditor-paper[data-kind=achievement] .auditor-pre{margin:2px 0 1px}
.auditor-paper[data-kind=achievement] .auditor-title{font-size:13.5px;line-height:1.17;padding:0 2px}
@media (prefers-reduced-motion: reduce){.auditor-flame,.auditor-glow,.auditor-bump{animation:none}}
`);

  const PRE = { kill: 'Item, slain:', many: 'Items, sundry, slain:', pvp: 'Item, slain (with malice):' };
  const REMARK = {
    poor: 'Petty cash.', meh: 'Noted.', good: 'In order.', great: 'Satisfactory.',
    superb: 'It stands.', pvp: 'Settled in full.', calibrating: 'To be assessed.',
  };

  Harness.register({
    id: 'auditor',
    name: 'The Auditor',
    blurb: 'The goblin and his balloon, grown up: an old clerk of the Guild keeps the ledger of the slain in pen and wash, and hangs each entry under his basket, stamped with his verdict.',
    create(ctx) {
      if (!document.getElementById('auditor-defs')) { const d = ctx.svg(DEFS); d.id = 'auditor-defs'; document.body.append(d); }
      const live = new Set();
      let seed = 11;

      function deckle(paper) {
        const r = ctx.rng(seed++), pts = ['0 0', '100% 0'];
        const j = () => (r() * 1.9).toFixed(1);
        for (let i = 1; i <= 8; i++) pts.push(`calc(100% - ${j()}px) ${(i * 12.5 - r() * 5).toFixed(1)}%`);
        for (let i = 10; i >= 0; i--) pts.push(`${Math.max(0, i * 10 - r() * 4).toFixed(1)}% calc(100% - ${j()}px)`);
        for (let i = 7; i >= 1; i--) pts.push(`${j()}px ${(i * 12.5 + r() * 5).toFixed(1)}%`);
        paper.style.clipPath = `polygon(${pts.join(',')})`;
      }

      function fill(sheet, n) {
        sheet.textContent = '';
        const paper = ctx.el('div', 'auditor-paper');
        paper.dataset.kind = n.kind;
        const add = (cls, text) => { const e = ctx.el('div', cls, text); paper.append(e); return e; };
        let sealed = null;
        if (n.kind === 'death') {
          paper.append(ctx.svg(`<svg xmlns="${NS}" class="auditor-orn" viewBox="0 0 60 12" width="60" height="12"><g fill="none" stroke="#14110e" stroke-width="1" stroke-linecap="round"><path d="M0,6H21M39,6H60"/><path d="M26.4,1.4H33.6M26.4,10.6H33.6M27,1.6C27,5 33,7 33,10.4M33,1.6C33,5 27,7 27,10.4"/></g><path d="M28.2,9.8L30,7.2L31.8,9.8Z" fill="#14110e"/></svg>`));
          add('auditor-pre', 'In memoriam');
          add('auditor-big', n.big);
          if (n.title) add('auditor-title', n.title);
          add('auditor-rem', 'Account suspended, pro tem.');
          sealed = 'death';
        } else if (n.kind === 'levelup') {
          add('auditor-pre', 'Entered in the Rolls');
          add('auditor-big', n.big);
          if (n.title) add('auditor-title', n.title);
          add('auditor-rem', 'No increase in salary is implied.');
          sealed = 'levelup';
        } else if (n.kind === 'achievement') {
          add('auditor-head', n.label);
          add('auditor-pre', 'Be it known, and duly witnessed:');
          add('auditor-title', n.title);
          if (n.big) add('auditor-big', n.big);
          sealed = 'achievement';
        } else {
          add('auditor-pre', n.mood === 'pvp' ? PRE.pvp : n.count > 1 ? PRE.many : PRE.kill);
          add('auditor-title', n.title);
          const sum = add('auditor-sum'), fig = ctx.el('span', 'auditor-fig');
          fig.append(ctx.el('span', 'auditor-big', n.big), ctx.el('span', 'auditor-unit', n.unit));
          const stamp = ctx.el('span', 'auditor-stamp', n.label);
          stamp.dataset.mood = n.mood;
          sum.append(fig);
          paper.append(stamp);
          if (n.more) add('auditor-more', n.more);
          else if (REMARK[n.mood]) add('auditor-rem', REMARK[n.mood]);
          if (n.mood === 'superb' || n.mood === 'pvp') sealed = n.mood;
        }
        deckle(paper);
        sheet.append(paper);
        if (sealed) { paper.dataset.seal = sealed; sheet.append(ctx.svg(seal(sealed))); }
        const root = sheet.closest('.auditor-root'); if (root) root.toggleAttribute('data-seal', !!sealed);
      }

      function build(n) {
        const root = ctx.el('div', 'auditor-root'), rig = ctx.el('div', 'auditor-rig'), top = ctx.el('div', 'auditor-top');
        const sky = ctx.skyMode();
        if (sky === 'day' || sky === 'overcast') root.classList.add('auditor-day');
        root.dataset.kind = n.kind;
        const paint = (mood) => { top.textContent = ''; top.append(ctx.el('div', 'auditor-glow'), ctx.svg(balloonSvg(mood)), ctx.svg(FLAME)); };
        paint(n.mood);
        const note = ctx.el('div', 'auditor-note'), sheet = ctx.el('div', 'auditor-sheet');
        const dark = n.kind === 'death';
        const makeCords = (w) => ctx.svg(`<svg xmlns="${NS}" class="auditor-cords" viewBox="0 0 ${w} 17" preserveAspectRatio="none" aria-hidden="true">${dark
          ? `<path d="M${w / 2},2L9,16M${w / 2},2L${w - 9},16" fill="none" stroke="#8a7f70" stroke-width="2"/><path d="M${w / 2},2L9,16M${w / 2},2L${w - 9},16" fill="none" stroke="#15110e" stroke-width="1.2"/>`
          : rope(`M${w / 2},2L9,16M${w / 2},2L${w - 9},16`, 1.2)}<circle cx="${w / 2}" cy="2.4" r="2.6" fill="none" stroke="${INK}" stroke-width="2"/><circle cx="${w / 2}" cy="2.4" r="2.6" fill="none" stroke="#c9a660" stroke-width=".9"/></svg>`);
        note.append(makeCords(n.kind === 'achievement' ? 204 : 168), ctx.el('div', 'auditor-rod'), sheet);
        rig.append(top, note);
        root.append(rig);
        fill(sheet, n);
        return { root, rig, note, sheet, paint };
      }

      return {
        show(n) {
          const b = build(n);
          // measure, so the flight parks the whole rig above the prompt
          b.root.style.cssText = 'position:absolute;visibility:hidden;left:0;top:0';
          ctx.front.append(b.root);
          const w = b.root.offsetWidth, h = b.root.offsetHeight + (n.kind === 'kill' && !n.more ? 26 : 0); // room for joined names
          b.root.remove(); b.root.style.cssText = '';
          const handle = ctx.fly(b.root, {
            w, h,
            frame({ lean, swing }) {
              const l = lean * 0.7;
              b.rig.style.transform = `rotate(${l.toFixed(2)}deg)`;
              b.note.style.transform = `rotate(${(swing * 0.9 - l).toFixed(2)}deg)`;
            },
          });
          live.add(handle);
          handle.gone.then(() => live.delete(handle));
          let mood = n.mood;
          return {
            update(m) {
              fill(b.sheet, m);
              if (m.mood !== mood) { mood = m.mood; b.paint(mood); }
              if (!ctx.reduced) { b.sheet.classList.remove('auditor-bump'); void b.sheet.offsetWidth; b.sheet.classList.add('auditor-bump'); }
              handle.extend(1800);
            },
          };
        },
        still(n) { return build(n).root; },
        clear() { for (const h of [...live]) h.end(); live.clear(); },
      };
    },
  });
})();
