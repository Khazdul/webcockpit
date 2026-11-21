// Round 4, skin 3: "Goblin, dressed for it". The original gloomy goblin in his
// patched balloon, redrawn as a clean storybook plate (ink line, flat gouache,
// one shadow tone), and he has a trunk in the basket: a complete costume for
// every outcome. The face stays deadpan; the clothes do the talking.
//
// The rig: the envelope leans about its mouth, the basket hangs from the same
// hinge and lags, the ropes are redrawn between the two, and an inn signboard
// hangs from a yoke lashed under the basket on two chains (a parallelogram
// pendulum: the chains turn about their eye-bolts, the board stays parallel to
// the yoke and moves by L·sin θ, L·(1−cos θ)).
(() => {
  const NS = 'http://www.w3.org/2000/svg', INK = '#2a2219';
  const HX = 100, HY = 163, GX = 100, GY = 108, AX = 36, AY = 264, CL = 17, TOP = 283;
  const CREAM = '#ebe1c5', OCHRE = '#c8983f', BRICK = '#a5483a', SLATE = '#4f5b67', SAGE = '#7c8e69', BLACK = '#2b292f', BRASS = '#b8923f', BLUE = '#34548c';
  const uri = (s) => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
  const GRAIN = uri(`<svg xmlns='${NS}' width='90' height='90'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' seed='3'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1.1 -.42'/></filter><rect width='90' height='90' filter='url(#n)' opacity='.55'/></svg>`);

  // ---- small drawing helpers ----
  const piv = (x, y, cls, inner, style = '') => `<g transform="translate(${x},${y})"><g class="${cls}"${style ? ` style="${style}"` : ''}><g transform="translate(${-x},${-y})">${inner}</g></g></g>`;
  const arm = (d, col, w = 7) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w + 2.2}"/><path d="${d}" fill="none" stroke="${col}" stroke-width="${w}"/>`;
  const fist = (x, y, rot = 0, cls = 'gdress-sk') => `<g transform="translate(${x},${y}) rotate(${rot})"><path class="${cls}" d="M-5,-3.200C-5,-6.200 4,-6.600 5.200,-3.200L5.200,2.800C4.200,6 -4,6 -5,3Z"/><path d="M-5,-.5C-7.600,-.8 -7.800,3.600 -4.600,3.800" class="${cls}"/><path d="M-2.200,-5.400V-1.200M.8,-5.600V-1.400M3.600,-4.800V-1" fill="none" stroke-width=".7"/></g>`;
  const tone = (d, op = .2, col = '#2a1c22') => `<path d="${d}" fill="${col}" opacity="${op}" stroke="none"/>`;
  const lite = (d, w = 1, op = .6, col = '#fff6dc') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" opacity="${op}"/>`;

  // ---- the face ----
  // ear: [left, right] droop in degrees; bl/br: brow [dy, rot] (rot > 0 sad, < 0 fierce); lid: how far the lids hang
  const F = {
    calibrating: { ear: [4, -8], bl: [-2.6, -9], br: [.4, 3], lid: 1, mouth: 'M-8,19.600Q0,18 8,20' },
    poor: { ear: [30, 34], bl: [-.6, 15], br: [-.6, 15], lid: 1.9, mouth: 'M-9,21Q0,16.800 9,21' },
    meh: { ear: [16, 20], bl: [.8, 3], br: [.8, 3], lid: 3, mouth: 'M-7,19.600Q0,18.800 7,19.800' },
    good: { ear: [-2, -4], bl: [0, -2], br: [0, -2], lid: .8, mouth: 'M-8,19.400Q2,20.400 9,17.600' },
    great: { ear: [-8, -10], bl: [-2.4, -6], br: [1.2, -8], lid: 1.7, mouth: 'M-6,19.400Q0,18.600 6,19.200' },
    superb: { ear: [-16, -16], bl: [.4, 0], br: [.4, 0], lid: 1.5, mouth: '' },
    pvp: { ear: [-12, -14], bl: [1.6, -20], br: [1.6, -20], lid: 1.9, mouth: '' },
    levelup: { ear: [-10, -4], bl: [-1.6, 4], br: [-1.6, 4], lid: 1, mouth: 'M-8,19.400Q-2,18.600 2,19' },
    death: { ear: [36, 38], bl: [-.4, 12], br: [-.4, 12], lid: 2.5, mouth: 'M-8,20.600Q0,18.200 8,20.600' },
    achievement: { ear: [-6, -8], bl: [-2.4, 2], br: [-2.4, 2], lid: 2.7, mouth: 'M-8,19Q0,20.800 8,18.400' },
  };
  const RANK = { poor: 1, meh: 2, good: 3, great: 4, superb: 5 };
  const ALM = 'M-6,0Q0,-6 6,0Q0,4.400 -6,0Z';
  const eye = (s, u) => `<g transform="translate(${10.5 * s},-3) rotate(${-7 * s})"><ellipse cx="${-.5 * s}" cy=".4" rx="8.200" ry="6.400" class="gdress-skd" stroke="none"/>
<path d="${ALM}" fill="#e6c84e" stroke-width=".9"/><g clip-path="url(#gdE${u})"><path d="M-6,-4H6V-1.400H-6Z" fill="#7a5c14" opacity=".4" stroke="none"/>
<g class="gdress-pu"><circle r="1.800" fill="#17110b" stroke="none"/><circle cx="-.6" cy="-.7" r=".55" fill="#fff6d8" stroke="none"/></g>
<g class="gdress-lidm"><g class="gdress-lid"><path class="gdress-sk" d="M-8,-14H8V-2.600Q0,-4.200 -8,-2.600Z" stroke-width=".9"/></g></g></g>
<path d="M-6.200,.2Q0,-6.200 6.200,.2" fill="none" stroke-width="1.4"/><path d="M-4.800,4Q0,5.800 5,3.600" fill="none" stroke-width=".55" opacity=".7"/></g>`;
  const BROW = 'M-7.800,1.400C-4,-2.400 3,-3.400 8,-1.200L7.600,1C3,-.8 -3,-.2 -7.800,1.400Z';
  const brow = (s, [dy, r]) => `<g transform="translate(${11 * s},${-10.4 + dy}) scale(${s},1) rotate(${r})"><g class="gdress-brow"><path d="${BROW}" fill="${INK}" stroke-width=".5"/></g></g>`;
  const EAR = 'M21,-10C32,-16.500 47,-20.500 62,-19.500C54,-8 39,2.500 23,7Z';
  const ear = (s, a) => `<g transform="scale(${s},1) translate(23,-2)"><g style="transform:rotate(${a}deg)"><g class="gdress-ear"><g transform="translate(-23,2)"><path class="gdress-sk" d="${EAR}" stroke-width="1.2"/><path class="gdress-skd" d="M25,-7.500C33,-11.500 42,-14.200 52,-15C45,-7.500 35,-1 25,2.800Z" stroke="none"/><path d="M27,-5.500C34,-9 41,-11.500 48,-12.500" fill="none" stroke-width=".6" opacity=".7"/>${s > 0 ? `<path d="M44,-3.800l1.800,-4.400l2.800,2.200Z" fill="var(--bg,#0000)" class="gdress-nick" stroke-width="1"/>` : ''}<path d="M23,7C36,3 48,-6 58,-16" fill="none" stroke-width="1.9" opacity=".85"/></g></g></g></g>`;
  const SKULL = 'M-25,-4C-27,-18 -15,-25 0,-25C15,-25 27,-18 25,-4C24,5 20.500,10 15.500,16C10.500,21.500 5,24.500 0,24.500C-5,24.500 -10.500,21.500 -15.500,16C-20.500,10 -24,5 -25,-4Z';
  function head(u, f, o) {
    return `<g class="gdress-hd"><g class="gdress-nod">${o.hatBack || ''}${ear(-1, f.ear[0])}${ear(1, f.ear[1])}
<path class="gdress-sk" d="M-6.500,20L-7.500,33H7.500L6.500,20Z" stroke-width="1"/>${tone('M-6.500,20L-7.500,33H7.500L6.500,24Q0,29 -6.500,24Z', .28)}
<path class="gdress-sk" d="${SKULL}" stroke-width="1.25"/>
<path class="gdress-skd" d="M-25,-4C-27,-18 -15,-25 -5,-25C-14,-18 -18.500,-9 -17,1C-15.500,10 -10,18.500 -3,24.200C-8,23.500 -12,20.500 -15.500,16C-20.500,10 -24,5 -25,-4Z" stroke="none"/>
<path d="M-15.500,16C-10.500,21.500 -5,24.500 0,24.500C5,24.500 10.500,21.500 15.500,16" fill="none" stroke-width="2"/>
<path d="M-18,6.500C-16.500,10.500 -14.500,13.500 -12,15.500M18,6.500C16.500,10.500 14.500,13.500 12,15.500M-3,-17.500q3,-1.200 6,0M-5,-20.500q5,-1.600 10,0" fill="none" stroke-width=".6" opacity=".75"/>
${o.paint || ''}${eye(-1, u)}${eye(1, u)}${brow(-1, f.bl)}${brow(1, f.br)}
${f.mouth ? `<path d="${f.mouth}" fill="none" stroke-width="1.5"/><path d="M-10.500,18.200q1.200,1.600 .4,3.200M10.500,17.600q-1.200,1.600 -.4,3.200" fill="none" stroke-width=".6" opacity=".7"/>` : ''}${o.mouth || ''}
<circle cx="-9" cy="14.500" r=".9" class="gdress-skd" stroke-width=".5"/>
<path class="gdress-sk" d="M-3.400,-8C-4.600,-1 -8.800,6 -8.400,11.500C-8,16.800 -2.200,19 1.600,16.400C4.200,14.600 3.600,11.600 4.600,8.600C5.800,4.600 4.400,-2 3.400,-8" stroke-width="1.15"/>
<path class="gdress-skd" d="M-3.400,-7C-4.600,-1 -8.800,6 -8.400,11.500C-8,16.800 -2.200,19 0,17.200C-4,14 -4.500,8 -1.500,-2Z" stroke="none"/>
<path d="M-1.600,15.300q2.200,1.700 4.200,-.5" fill="none" stroke-width=".8"/>${lite('M1.300,1C2.800,5.500 2.600,9.500 1.500,12.500', 1.3, .35)}
${o.hat || ''}${o.face || ''}</g></g>`;
  }

  // ---- the wardrobe ----
  // Goblin coordinates: the head's centre is 0,0, the skull runs -25..24.5, the basket rim cuts at y = 46.
  const TORSO = 'M-34,52C-34,38 -28,32 -14,29L-6,27H6L14,29C28,32 34,38 34,52Z';
  const cloth = (u, fill, inner) => `<g class="gdress-cloth"><path d="${TORSO}" fill="${fill}" stroke-width="1.2"/><g clip-path="url(#gdT${u})">${inner}${tone('M-34,52C-34,38 -28,32 -14,29L-9,28C-22,34 -25,42 -24,52Z', .22)}</g><path d="${TORSO}" fill="none" stroke-width="1.2"/></g>`;
  const WARD = {
    // in his vest, a tape measure round his neck, a pair of scales and a pencil
    calibrating: (u) => ({
      cloth: cloth(u, CREAM, `<path d="M-34,52C-34,38 -28,32 -15.500,29.500L-4,52Z" fill="#8c6b3e"/><path d="M34,52C34,38 28,32 15.500,29.500L4,52Z" fill="#8c6b3e"/><path d="M-7,27L-1,34L0,28.500L1,34L7,27" fill="${CREAM}" stroke-width=".9"/><circle cx="0" cy="38.500" r=".9" fill="${INK}"/><circle cx="0" cy="44" r=".9" fill="${INK}"/>
<path d="M-11.500,26.500C-14,34 -13,43 -12,52H-7C-8,43 -9,34 -6.500,27.500Z" fill="#dfc356" stroke-width=".9"/><path d="M11.500,26.500C14,34 13,43 12.500,52H7.500C8.500,43 9,34 6.500,27.500Z" fill="#dfc356" stroke-width=".9"/><path d="M-12.800,32h2.600M-12.900,36h3.400M-12.600,40h2.600M-12.200,44h3.400M9.800,32h2.800M9.200,36h3.600M9.600,40h2.800M8.800,44h3.600" fill="none" stroke-width=".6"/>`),
      hat: `<path d="M-6,-24.500C-8,-31 -13,-32 -15,-29M0,-25C0,-33 5,-36 8,-33M5,-24.500C8,-30 13,-30 14,-27" fill="none" stroke-width="1"/>`,
      front: arm('M-27,41L-47,36L-55,12', CREAM, 6.5) + fist(-55, 8, -8) + piv(-55, 14, 'gdress-rock', `<path d="M-55,6V15" fill="none" stroke-width="1.4"/><path d="M-72,15H-38" fill="none" stroke="${INK}" stroke-width="3.2"/><path d="M-72,15H-38" fill="none" stroke="${BRASS}" stroke-width="1.4"/><path d="M-71,15L-76,30M-71,15L-66,30M-39,15L-44,33M-39,15L-34,33" fill="none" stroke-width=".7"/><path d="M-78,30Q-71,37 -64,30Z" fill="${BRASS}"/><path d="M-46,33Q-39,40 -32,33Z" fill="${BRASS}"/><circle cx="-39" cy="31.500" r="2.300" fill="${CREAM}" stroke-width=".7"/>`)
        + arm('M27,41L45,20L37,-10', CREAM, 6.5) + piv(36, -14, 'gdress-b1', `<path d="M40,-11L22,-24" fill="none" stroke="${INK}" stroke-width="4.400"/><path d="M40,-11L24.500,-22.200" fill="none" stroke="${BRICK}" stroke-width="2.400"/><path d="M24.500,-22.200L22,-24" fill="none" stroke="${CREAM}" stroke-width="2"/>${fist(36, -14, -50)}`),
      hands: [0, 0],
    }),
    // a dripping sou'wester and oilskin under an umbrella, in his own small shower
    poor: (u) => ({
      back: `<g transform="rotate(-6 -27 30)"><g class="gdress-rain" fill="none" stroke="#a9bccb" stroke-width="1.100">${[-70, -58, -46, -34, -22, -10, 2, 14, 26].map((x, i) => `<path d="M${x},-66l-4,${104 + (i % 3) * 5}" style="animation-delay:${-i * .13}s"/>`).join('')}</g>
<path d="M-20,-58V34" fill="none" stroke="${INK}" stroke-width="3.2"/><path d="M-20,-58V34" fill="none" stroke="#8a6a44" stroke-width="1.3"/>
<path d="M-66,-33C-58,-51 -40,-58 -20,-58C0,-58 18,-51 26,-33C20,-37.500 13,-37 7.500,-32C2,-37.500 -7,-37.500 -12.500,-32C-18,-37.500 -27,-37.500 -32.500,-32C-38,-37.500 -47,-37.500 -52.500,-32C-57,-37 -62,-37 -66,-33Z" fill="#3c4651" stroke-width="1.2"/>${tone('M-66,-33C-58,-51 -40,-58 -24,-58C-40,-52 -50,-44 -54,-33.500C-58,-37 -62,-37 -66,-33Z', .3, '#000')}
<path d="M-20,-58C-27,-50 -31,-42 -32.500,-32M-20,-58C-15,-50 -13,-42 -12.500,-32M-20,-58C-6,-52 3,-43 7.500,-32M-20,-58C-38,-52 -48,-43 -52.500,-32" fill="none" stroke-width=".6" opacity=".8"/>${lite('M-14,-56.500C2,-54 16,-47 23,-36', .9, .45, '#c8d4de')}<path d="M-20,-58V-63" fill="none" stroke-width="2"/>
<g class="gdress-cloud"><path d="M-62,-66C-70,-66 -71,-76 -62,-77C-62,-85 -49,-87 -45,-80C-40,-88 -25,-87 -23,-78C-14,-80 -9,-68 -18,-66Z" fill="#8792a0" stroke-width="1.100"/>${tone('M-62,-66C-68,-66 -70,-72 -66,-75C-60,-70 -30,-69 -14,-72C-12,-69 -14,-66 -18,-66Z', .28, '#1c2430')}</g></g>`,
      cloth: cloth(u, '#cfab3f', `<path d="M0,29V52" fill="none" stroke-width="1"/><path d="M-12,25L-17,35L-1,31.500Z" fill="#dcbb52" stroke-width=".9"/><path d="M12,25L17,35L1,31.500Z" fill="#dcbb52" stroke-width=".9"/><path d="M-3,38h6M-3,45h6" fill="none" stroke="#6b4a2a" stroke-width="2.200"/>${lite('M18,33C25,36 28,41 29,50', 1.4, .4)}`),
      hatBack: `<path d="M-38,-6C-40,2 -34,9 -27,11L27,11C34,9 40,2 38,-6Z" fill="#a8872c" stroke-width="1.100"/>`,
      hat: `<path d="M-24.500,-12C-25,-30 -11,-37 0,-37C11,-37 25,-30 24.500,-12Z" fill="#cfab3f" stroke-width="1.2"/>${tone('M-24.500,-12C-25,-30 -11,-37 -3,-37C-12,-30 -15,-22 -14,-12Z', .22)}<path d="M0,-37V-16M-11,-34C-9,-28 -8,-22 -8,-15M11,-34C9,-28 8,-22 8,-15" fill="none" stroke-width=".6" opacity=".7"/>
<path d="M-41,-3C-35,-17 -17,-20.500 0,-20.500C17,-20.500 35,-17 41,-3C29,-10.500 13,-12.500 0,-12.500C-13,-12.500 -29,-10.500 -41,-3Z" fill="#dcbb52" stroke-width="1.2"/>${lite('M6,-18.500C18,-18 30,-14.500 36,-8', 1.2, .5)}
<g fill="#a9c3d6" stroke-width=".6"><path class="gdress-drip" d="M-40,-2q-2.200,4 0,5.400q2.200,-1.400 0,-5.400Z"/><path class="gdress-drip" style="animation-delay:-.7s" d="M40,-2q-2.200,4 0,5.400q2.200,-1.400 0,-5.400Z"/><path class="gdress-drip" style="animation-delay:-1.3s" d="M-66,-32q-2.200,4 0,5.400q2.200,-1.400 0,-5.400Z"/><path class="gdress-drip" style="animation-delay:-.3s" d="M26,-32q-2.200,4 0,5.400q2.200,-1.400 0,-5.400Z"/></g>`,
      front: arm('M-28,43Q-38,38 -29,31', '#cfab3f', 7) + fist(-27, 29, 80),
      hands: [0, 1],
    }),
    // dressing gown and stocking nightcap, a candle, a yawn
    meh: (u) => ({
      cloth: cloth(u, '#76596c', `<path d="M-9,27L0,45L9,27Z" fill="${CREAM}" stroke-width=".8"/><path d="M-6,31h12M-4,35h8M-2,39h4" fill="none" stroke="#6f8196" stroke-width="1.100"/><path d="M-14,28.500C-10,36 -4,45 3,52H-9C-14,46 -18,38 -19.500,30.500Z" fill="#a98b9a" stroke-width="1"/><path d="M14,28.500C10,36 6,43 1,49L-3,52H9C14,46 18,38 19.500,30.500Z" fill="#a98b9a" stroke-width="1"/><path d="M-15,33l5,-2M-12,39l5,-2.500M13,33l-5,-2M11,39l-5,-2.500" fill="none" stroke-width=".5" opacity=".6"/>`),
      hat: `<path d="M-26.500,-10C-27,-30 -10,-40 8,-38C22,-36.500 30,-28 31,-17L20,-13C8,-17.500 -12,-17.500 -26.500,-10Z" fill="${CREAM}" stroke-width="1.2"/><path d="M-22,-24C-12,-30 6,-31 26,-25M-12,-34C-2,-37.500 12,-37 24,-32" fill="none" stroke="#6f8196" stroke-width="2.600"/>
${piv(20, -32, 'gdress-tail', `<path d="M10,-38C28,-42 43,-27 42,0L35,1C35,-15 29,-25 17,-26.500Z" fill="${CREAM}" stroke-width="1.2"/><path d="M24,-36.500L21,-27M33,-29L27,-23M39.500,-18L33,-15.500M42,-8L35,-7.500" fill="none" stroke="#6f8196" stroke-width="2.600"/><path d="M38.500,1l-1,4" fill="none" stroke-width="1"/><circle cx="37.500" cy="8.500" r="4.600" fill="${BRICK}" stroke-width="1"/><path d="M34.500,7.500q1.500,-2.500 4,-2.500M35.500,11q2.500,1 5,-1" fill="none" stroke-width=".5"/>`)}
<path d="M-27.500,-8.500C-13,-17.500 13,-17.500 27.500,-8.500L26.500,-13.500C13,-22 -13,-22 -26.500,-13.500Z" fill="#f3ecd6" stroke-width="1.100"/>`,
      mouth: piv(0, 19.5, 'gdress-yawn', `<ellipse cx="0" cy="20.500" rx="5.200" ry="5.800" fill="#3a1d1a" stroke-width="1.100"/><path d="M-3,24Q0,21 3,24" fill="#a2564a" stroke-width=".6"/><path d="M-3.500,16.500l1,2.200l1.200,-2.400M2,16.300l1,2.300l1.100,-2.200" fill="${CREAM}" stroke-width=".5"/>`),
      front: arm('M-28,43Q-44,44 -47,36', '#76596c', 7) + fist(-47, 33, 0) + `<path d="M-59,29.500Q-47,33 -35,29.500L-37,26.500H-57Z" fill="${BRASS}" stroke-width="1"/><path d="M-36,28C-30,26 -30,33 -36,31" fill="none" stroke-width="1.600"/><path d="M-50,11H-44V27H-50Z" fill="${CREAM}" stroke-width="1"/><path d="M-50,14q2,3 1,6" fill="none" stroke-width=".6"/><path d="M-47,11V8" fill="none" stroke-width=".9"/><circle cx="-47" cy="2" r="9" fill="#f1c768" opacity=".2" stroke="none"/>${piv(-47, 8, 'gdress-cfl', `<path d="M-47,8C-51,4 -49,-1 -47,-5C-45,-1 -43,4 -47,8Z" fill="#f2b243" stroke="#a5561c" stroke-width=".7"/><path d="M-47,7C-48.800,4.500 -48,2 -47,0C-46,2 -45.200,4.500 -47,7Z" fill="#fff2c4" stroke="none"/>`)}`,
      hands: [0, 1],
    }),
    // neat waistcoat, flat cap, arms folded
    good: (u) => ({
      cloth: cloth(u, CREAM, `<path d="M-34,52C-34,38 -28,32 -15,29.500L0,45L15,29.500C28,32 34,38 34,52Z" fill="#6f8462" stroke-width="1"/><path d="M-7,27L-1.500,33L0,29L1.500,33L7,27" fill="${CREAM}" stroke-width=".9"/><path d="M-2,29.500H2L3,40L0,43L-3,40Z" fill="${BRICK}" stroke-width=".8"/>`)
        + `<g class="gdress-fold"><path class="gdress-sk" d="M36,36C24,33.500 4,35 -15,39.500L-13,47.500C4,44 22,44 37,47.500C41,45 41,38.500 36,36Z" stroke-width="1.100"/><path d="M39,35.500C33,34 28,34 23,34.500L25,46C30,46 35,47 39,48.500C43,45 43,38.500 39,35.500Z" fill="${CREAM}" stroke-width="1.100"/><path d="M25.500,37.500l0,6" fill="none" stroke-width=".6"/><path class="gdress-sk" d="M-13,38.500C-19,37.500 -23,40 -23,43.500C-23,47 -18,48.500 -12.500,47.500Z" stroke-width="1"/><path d="M-19,39.500v3.500M-16,39v3.500" fill="none" stroke-width=".6"/>
<path class="gdress-sk" d="M-36,38C-24,35.500 -6,37.500 13,42.500L11.500,50.500C-6,46.500 -22,46.500 -37,49.500C-41,47 -41,40.500 -36,38Z" stroke-width="1.100"/><path d="M-39,37.500C-33,36 -28,36 -23,36.500L-25,48C-30,48 -35,49 -39,50.500C-43,47 -43,40.500 -39,37.500Z" fill="${CREAM}" stroke-width="1.100"/><path d="M-25.500,39.500l0,6" fill="none" stroke-width=".6"/><path class="gdress-sk" d="M12,42C18,41 22.500,43.500 22.500,47C22.500,50 18,51.500 11.500,50.500Z" stroke-width="1"/><path d="M-31,40.500q3,3.500 1,7M30,38.500q-3,3.500 -1,7.500" fill="none" stroke-width=".6" opacity=".7"/>${tone('M-36,45C-22,43 -6,43.500 12,47.500L11.500,50.500C-6,46.500 -22,46.500 -37,49.500Z', .18)}</g>`,
      hat: `<path d="M-27.500,-11C-29,-27 -13,-34.500 4,-33.500C20,-32.500 30,-25 28.500,-12C14,-17.500 -12,-17.500 -27.500,-11Z" fill="#8f7f62" stroke-width="1.2"/>${tone('M-27.500,-11C-29,-27 -13,-34.500 -4,-34C-14,-28 -18,-21 -17,-14.500Z', .25)}<path d="M-18,-26l4,3l4,-3l4,3l4,-3l4,3l4,-3l4,3l4,-3l4,3M-21,-19l4,3l4,-3l4,3l4,-3l4,3l4,-3l4,3l4,-3l4,3l4,-3l4,3" fill="none" stroke-width=".5" opacity=".55"/><ellipse cx="2" cy="-33.200" rx="2.600" ry="1.300" fill="#6f6048" stroke-width=".8"/>
<path d="M-12,-14.500C2,-19 22,-18 35,-8.500C24,-8 8,-10 -10,-9.500Z" fill="#6f6048" stroke-width="1.2"/>${lite('M4,-16C16,-16 26,-13.500 32,-10', 1, .35)}`,
      hands: [0, 0],
    }),
    // top hat, monocle, cravat, a glass raised
    great: (u) => ({
      cloth: cloth(u, BLACK, `<path d="M-9,27L0,52L9,27Z" fill="#f3ecd6" stroke-width=".9"/><path d="M-13,28.500C-12,37 -7,46 -2,52H-12C-17,45 -20,38 -20,31Z" fill="#4c4f5c" stroke-width=".9"/><path d="M13,28.500C12,37 7,46 2,52H12C17,45 20,38 20,31Z" fill="#4c4f5c" stroke-width=".9"/><path d="M-8,26L-10,32L-3,30ZM8,26L10,32L3,30Z" fill="#f3ecd6" stroke-width=".8"/><path d="M-5,29.500C-7,34 -5,39 0,41C5,39 7,34 5,29.500C2,31 -2,31 -5,29.500Z" fill="#8a3040" stroke-width=".9"/><path d="M-2,32q2,4 0,7M2,32q1,3 0,6" fill="none" stroke-width=".5" opacity=".7"/><circle cx="0" cy="34" r="1.200" fill="#e6c36a" stroke-width=".5"/>${lite('M22,34C27,37 29,42 30,50', 1.2, .3, '#aab3c2')}`),
      hat: `<g transform="rotate(-5 0 -16)"><path d="M-18.500,-17C-19.500,-25 -21,-33 -22.500,-40C-10,-44.500 10,-44.500 22.500,-40C21,-33 19.500,-25 18.500,-17Z" fill="${BLACK}" stroke-width="1.2"/><path d="M-19,-24C-8,-21 8,-21 19,-24L18.500,-17.500C8,-14.500 -8,-14.500 -18.500,-17.500Z" fill="#8a3040" stroke-width=".9"/><path d="M-22.500,-40C-10,-36.500 10,-36.500 22.500,-40" fill="none" stroke-width=".8"/>${lite('M12,-38C11.500,-34 10.500,-30 10,-26', 3, .22, '#c9d2e0')}${lite('M16.500,-38.500C16,-35 15.500,-31 15,-27', 1, .35, '#c9d2e0')}
<path d="M-32,-16C-22,-22 22,-22 32,-16C22,-10.500 -22,-10.500 -32,-16Z" fill="${BLACK}" stroke-width="1.2"/>${lite('M-27,-16.500C-14,-20.500 14,-20.500 27,-16.500', .9, .4, '#c9d2e0')}</g>`,
      face: `<path d="M16,2C22,8 21,20 12,29" fill="none" stroke="#e6c36a" stroke-width=".9"/><circle cx="10.500" cy="-2.600" r="7.200" fill="#dfeaf0" fill-opacity=".14" stroke="${INK}" stroke-width="2.400"/><circle cx="10.500" cy="-2.600" r="7.200" fill="none" stroke="#e6c36a" stroke-width="1.200"/>${lite('M6.500,-7C8,-8.500 10,-9 12,-8.600', 1.1, .8)}`,
      front: piv(28, 40, 'gdress-b1', arm('M27,42L45,36L50,17', BLACK, 7) + `<path d="M46,20.500Q50,18 54,20.500" fill="none" stroke="#f3ecd6" stroke-width="2.400"/><path d="M50,12V2" fill="none" stroke="${INK}" stroke-width="2.600"/><path d="M50,12V2" fill="none" stroke="#dfeaf0" stroke-width="1"/><path d="M42.500,-13C42,-4 46,2 50,2C54,2 58,-4 57.500,-13Z" fill="#dfeaf0" fill-opacity=".3" stroke-width="1.100"/><path d="M43,-8C43.500,-2.500 47,1 50,1C53,1 56.500,-2.500 57,-8Z" fill="#8a2f3c" stroke="none"/>${lite('M45,-11C45,-6 46.500,-2.500 48.500,-.5', 1, .7)}<g class="gdress-glint">${lite('M57,-20v8M53,-16h8M54.200,-18.800l5.600,5.600M59.800,-18.800l-5.600,5.600', 1, .95, '#fff3c4')}</g>${fist(50, 14, 10)}`),
      hands: [1, 0],
    }),
    // a striped party hat, a paper garland, a party blower, a sparkler, confetti
    superb: (u) => ({
      cloth: cloth(u, CREAM, `<path d="M-34,52C-34,38 -28,32 -15,29.500L-3,52Z" fill="${BRICK}"/><path d="M34,52C34,38 28,32 15,29.500L3,52Z" fill="${BRICK}"/>`)
        + `<g stroke-width=".8">${[[-17, 29, BRICK], [-15.500, 34.500, OCHRE], [-12, 39.500, SAGE], [-7, 43, CREAM], [-1, 44.500, '#5f7fa8'], [5, 43.500, OCHRE], [10.500, 40.500, BRICK], [14.500, 35.500, SAGE], [16.500, 29.500, OCHRE]].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="3.700" fill="${c}"/><circle cx="${x}" cy="${y}" r="1.300" fill="${INK}" opacity=".35" stroke="none"/>`).join('')}</g>`,
      hat: `<path d="M-13,-21Q0,8 17,-19" fill="none" stroke-width=".6" opacity=".5"/>${piv(1, -22, 'gdress-cone', `<g transform="rotate(-13 1 -22)"><path d="M-15,-21L2,-58L18,-21C8,-25 -6,-25 -15,-21Z" fill="${CREAM}" stroke-width="1.2"/><g clip-path="url(#gdC${u})"><path d="M-20,-28L20,-38L20,-45L-20,-35ZM-20,-42L20,-52L20,-59L-20,-49ZM-20,-14L20,-24L20,-31L-20,-21Z" fill="${BRICK}" stroke="none"/>${tone('M-15,-21L2,-58L-2,-24Z', .2)}</g><path d="M-15,-21L2,-58L18,-21C8,-25 -6,-25 -15,-21Z" fill="none" stroke-width="1.2"/>
<path d="M-16,-20.500q2.500,-3.500 5,-.8q2.500,-3.800 5.200,-.9q2.800,-3.600 5.400,-.5q2.800,-3.600 5.500,-.2q2.700,-3.400 5.300,.4q2.600,-3 5,.9" fill="${OCHRE}" stroke-width=".8"/>
<g class="gdress-pom"><path d="M2,-64.500q3,-2.500 4.500,.8q3.600,.4 2,3.600q1.800,3.400 -2,3.800q-1.600,3 -4.500,.9q-3,2.200 -4.600,-.9q-3.800,-.4 -2,-3.800q-1.600,-3.200 2,-3.600q1.600,-3.300 4.600,-.8Z" fill="${OCHRE}" stroke-width="1"/><path d="M0,-60q2,-1.500 4,0M-.5,-57q2.500,1.200 5,0" fill="none" stroke-width=".5"/></g></g>`)}`,
      face: `<g class="gdress-bw1"><path d="M-1,18.500L-9,20" fill="none" stroke="${INK}" stroke-width="4.200"/><path d="M-1,18.500L-9,20" fill="none" stroke="${OCHRE}" stroke-width="2.200"/><circle cx="-14" cy="21.500" r="5.600" fill="${CREAM}" stroke-width="1.100"/><path d="M-14,21.500m-3.600,0a3.600,3.600 0 1 0 3.600,-3.600M-14,21.500m1.600,0a1.600,1.600 0 1 0 -1.600,1.600" fill="none" stroke="${BRICK}" stroke-width="1.500"/></g>
${piv(-1, 18.5, 'gdress-bw2', `<path d="M-1,18.500L-9,20" fill="none" stroke="${INK}" stroke-width="4.200"/><path d="M-1,18.500L-9,20" fill="none" stroke="${OCHRE}" stroke-width="2.200"/><path d="M-9,17.500L-52,22.500C-58,23.500 -58,30.500 -52,30L-9,22.500Z" fill="${CREAM}" stroke-width="1.100"/><path d="M-15,18.200l0,5.300l-6,1l0,-5.600ZM-27,19.600l0,6.500l-6,1l0,-6.800ZM-39,21l0,7.600l-6,1l0,-7.900Z" fill="${BRICK}" stroke="none"/><path d="M-9,17.500L-52,22.500C-58,23.500 -58,30.500 -52,30L-9,22.500Z" fill="none" stroke-width="1.100"/><path d="M-60,21l-5,-2.500M-61.500,26.500h-6M-60,32l-4.500,3" fill="none" stroke="${CREAM}" stroke-width="1.300"/>`)}`,
      front: arm('M27,42L45,37L50,20', CREAM, 6.5) + `<path d="M51,16L60,-16" fill="none" stroke="${INK}" stroke-width="2.800"/><path d="M51,16L60,-16" fill="none" stroke="#9aa3aa" stroke-width="1.100"/>${piv(60.5, -18, 'gdress-spark', `<g fill="none" stroke="#ffe9a6" stroke-width="1.300"><path d="M60.500,-33V-25M60.500,-11V-3M45.500,-18H53M68,-18H75.500M50,-28.500L55,-23.500M66,-12.500L71,-7.500M71,-28.500L66,-23.500M55,-12.500L50,-7.500"/></g><g fill="none" stroke="${OCHRE}" stroke-width="1"><path d="M54.500,-32.500l2,5M66.500,-32.500l-2,5M46,-24l5,2M75,-24l-5,2M46,-12l5,-2M75,-12l-5,-2M54.500,-3.500l2,-5M66.500,-3.500l-2,-5"/></g><circle cx="60.500" cy="-18" r="3.200" fill="#fff6d8" stroke="none"/>`)}${fist(50, 17, 15)}`
        + `<g class="gdress-cfs" stroke-width=".5">${Array.from({ length: 16 }, (_, i) => { const x = -74 + ((i * 53) % 150), c = [BRICK, OCHRE, SAGE, CREAM, '#5f7fa8'][i % 5]; return `<rect class="gdress-cf" x="-3" y="-1.500" width="${5 + (i % 3)}" height="3" rx=".6" fill="${c}" style="--x:${x}px;--dx:${((i * 7) % 15) - 7}px;--r:${(i % 2 ? 1 : -1) * (200 + i * 30)}deg;animation-delay:${-(i * .37) % 2.6}s;animation-duration:${2.3 + (i % 4) * .3}s"/>`; }).join('')}</g>`,
      hands: [1, 0],
    }),
    // spiked iron helm, patched mail, war paint, a notched cleaver, one tusk
    pvp: (u) => ({
      cloth: cloth(u, '#5d666f', `<path d="M-34,37q3,3 6,0t6,0t6,0t6,0t6,0t6,0t6,0t6,0t6,0t6,0t6,0M-37,41.500q3,3 6,0t6,0t6,0t6,0t6,0t6,0t6,0t6,0t6,0t6,0t6,0t6,0M-34,46q3,3 6,0t6,0t6,0t6,0t6,0t6,0t6,0t6,0t6,0t6,0t6,0M-22,32.500q3,3 6,0t6,0t6,0t6,0t6,0t6,0t6,0t6,0" fill="none" stroke-width=".6" opacity=".8"/><path d="M9,34L21,32.500L22.500,43L10.500,44.500Z" fill="#7b5a3c" stroke-width=".9"/><path d="M10.500,36.500l10,-1.300M11,41.500l10,-1.300" fill="none" stroke="${CREAM}" stroke-width=".7" stroke-dasharray="1.500 1.800"/><path d="M-12,27.500C-5,32 5,32 12,27.500L11,31.500C5,35 -5,35 -11,31.500Z" fill="#6b4a2f" stroke-width=".9"/>
<path d="M-35,44C-36,34 -27,28.500 -17,31L-21,43Z" fill="#454d56" stroke-width="1"/><path d="M-30,33L-38,22L-24,30Z" fill="#8d969d" stroke-width="1"/>`),
      paint: `<path d="M-24.500,-7.500C-12,-5 12,-5 24.500,-7.500L24.800,0C12,2.200 -12,2.200 -24.800,0Z" fill="#9c2f22" opacity=".85" stroke="none"/><path d="M-19,6l4,7M-15.500,5l4,7M15,5l4,7.500" fill="none" stroke="#9c2f22" stroke-width="1.800"/>`,
      mouth: piv(0, 19, 'gdress-grin', `<path d="M-12,16.500C-7,23.500 6,24 12.500,16C6,19 -6,19.500 -12,16.500Z" fill="#3a1d1a" stroke-width="1.100"/><path d="M-8.500,18.600l1.400,2.400l1.500,-2.200l1.500,2.400l1.500,-2.300l1.500,2.300l1.500,-2.300l1.500,2.200" fill="none" stroke="${CREAM}" stroke-width="1"/><path d="M5.500,21.500L7.800,12.500L10.500,20Z" fill="#f3ecd6" stroke-width=".9"/>`),
      hat: `<path d="M-27.500,-9L-30,5L-22.500,1.500L-21.500,-11ZM27.500,-9L30,5L22.500,1.500L21.500,-11Z" fill="#59626b" stroke-width="1"/>
<path d="M-21,-26L-36,-42L-13,-32ZM21,-26L36,-42L13,-32Z" fill="#8d969d" stroke-width="1.100"/><path d="M-4.500,-33L0,-50L4.500,-33Z" fill="#8d969d" stroke-width="1.100"/>
<path d="M-27.500,-8C-30,-28 -14,-35 0,-35C14,-35 30,-28 27.500,-8L22,-11C10,-15 -10,-15 -22,-11Z" fill="#6c757e" stroke-width="1.250"/>${tone('M-27.500,-8C-30,-28 -14,-35 -5,-35C-15,-29 -19,-21 -18,-12.500L-22,-11Z', .3, '#10141a')}${lite('M8,-32.500C17,-30 23,-24 24,-16', 1.6, .4, '#dfe6ec')}
<path d="M-28,-14.500C-12,-21 12,-21 28,-14.500L27.500,-8C12,-15 -12,-15 -27.500,-8Z" fill="#454d56" stroke-width="1"/><g fill="#aab3ba" stroke-width=".5"><circle cx="-20" cy="-14" r="1.300"/><circle cx="-10" cy="-16.800" r="1.300"/><circle cx="0" cy="-17.700" r="1.300"/><circle cx="10" cy="-16.800" r="1.300"/><circle cx="20" cy="-14" r="1.300"/></g><path d="M-12,-30l5,3l-2,4M12,-27l-3,5" fill="none" stroke-width=".6" opacity=".7"/>`,
      front: piv(31, 31, 'gdress-b1', `<path d="M30,34L47,-12" fill="none" stroke="${INK}" stroke-width="5.400"/><path d="M30,34L47,-12" fill="none" stroke="#6b4a2f" stroke-width="3.200"/><path d="M41,-17L70,-42L79,-18L74,-16L76,-11L69,-9.500L70.500,-5L53,-2Z" fill="#9ba4ab" stroke-width="1.250"/><path d="M79,-18L74,-16L76,-11L69,-9.500L70.500,-5L53,-2L55,-6.500L67,-9L66,-13L72,-14.500L70.500,-19Z" fill="#dfe6ec" stroke="none" opacity=".7"/><path d="M67,-9.500L70.500,-5L60,-3.200Z" fill="#9c2f22" stroke="none" opacity=".9"/><circle cx="66" cy="-34" r="1.800" fill="${INK}" opacity=".7" stroke="none"/>${tone('M41,-17L70,-42L72,-37L46,-13Z', .25, '#10141a')}<path d="M41,-17L70,-42L79,-18L74,-16L76,-11L69,-9.500L70.500,-5L53,-2Z" fill="none" stroke-width="1.250"/>${arm('M27,43Q36,42 33,34', '#5d666f', 6)}${fist(32, 31, -20)}`),
      hands: [1, 0],
    }),
    // a herald: plumed cap, quartered tabard, a long trumpet with a banner
    levelup: (u) => ({
      cloth: cloth(u, BLUE, `<path d="M0,26H40V54H0Z" fill="${OCHRE}" stroke="none"/><path d="M0,27V52" fill="none" stroke-width=".8"/><path d="M-22,37l3,6l-6.500,-3.800h7l-6.500,3.800Z" fill="${OCHRE}" stroke-width=".5"/><path d="M14,36q4,2 8,0v5q-4,4 -8,0Z" fill="${BLUE}" stroke-width=".6"/><path d="M-9,27.500Q0,35 9,27.500L8,25Q0,31 -8,25Z" fill="#f3ecd6" stroke-width=".8"/>`)
        + `<path d="M-42,45L-34,31.500L-24,30.500L-30,47Z" fill="${OCHRE}" stroke-width="1"/><path d="M42,45L34,31.500L24,30.500L30,47Z" fill="${BLUE}" stroke-width="1"/>`,
      hat: `<path d="M-14,-27C-30,-34 -44,-46 -50,-62C-36,-56 -22,-46 -9,-31Z" fill="#f3ecd6" stroke-width="1.100"/><path d="M-13,-28.500C-26,-37 -37,-47 -46,-58M-22,-36l-7,-1M-28,-42l-7,-2M-34,-48l-6,-3M-20,-36l-1,-6M-27,-42l-1,-6M-34,-49l0,-5" fill="none" stroke-width=".6" opacity=".7"/>
<path d="M-28.500,-11C-34,-28 -10,-37.500 10,-34.500C27,-32 34,-21 28,-11.500C13,-18 -13,-18 -28.500,-11Z" fill="${BLUE}" stroke-width="1.2"/>${tone('M-28.500,-11C-34,-28 -10,-37.500 -2,-36C-14,-30 -19,-22 -17.500,-14.500Z', .28)}<path d="M-8,-33q3,6 1,13M12,-33q2,7 0,14" fill="none" stroke-width=".5" opacity=".5"/>
<path d="M-28.500,-11C-13,-18 13,-18 28,-11.500L27,-16.500C13,-22.500 -13,-22.500 -27.500,-16Z" fill="${OCHRE}" stroke-width="1"/><circle cx="-13" cy="-25" r="2.600" fill="${BRICK}" stroke-width=".8"/>`,
      front: arm('M27,42L39,31L26,14', '#f3ecd6', 6.5) + piv(4, 19, 'gdress-b1', `<path d="M3,19.500L66,-13" fill="none" stroke="${INK}" stroke-width="4.600"/><path d="M3,19.500L66,-13" fill="none" stroke="${BRASS}" stroke-width="2.400"/><path d="M62,-16L79,-27C83,-23 85,-17 84,-12L66,-7.500Z" fill="${BRASS}" stroke-width="1.150"/><ellipse cx="81.800" cy="-19.500" rx="3" ry="8" transform="rotate(-27 81.800 -19.500)" fill="#7a5c22" stroke-width="1"/>${lite('M10,14.800L60,-11.200', .8, .6)}<path d="M-1,20l5.500,3l1.500,-3.500l-5,-2.500Z" fill="${BRASS}" stroke-width=".8"/>
${piv(44, -2, 'gdress-ban', `<path d="M31,5L57,-8.500L59,18L48,17L46,30L33,29Z" fill="${BLUE}" stroke-width="1.100"/><path d="M44,-1.800L46,30L33,29L31,5Z" fill="${OCHRE}" stroke="none"/><path d="M31,5L57,-8.500L59,18L48,17L46,30L33,29Z" fill="none" stroke-width="1.100"/><path d="M36,12l4.500,-1.500l1,4.500l-4.500,1.500ZM49,5l4.500,-2l.8,5l-4.500,1.500Z" fill="#f3ecd6" stroke-width=".5"/>`)}
<g class="gdress-toot" fill="none" stroke="#ffe9a6" stroke-width="1.500"><path d="M88,-30l7,-5M90,-19h9M88,-8l8,3"/></g>${fist(26, 9, -28)}`),
      hands: [1, 0],
    }),
    // undertaker: tall hat with trailing crepe, black gloves, a wreath
    death: (u) => ({
      cloth: cloth(u, '#26252a', `<path d="M-8,26L0,40L8,26Z" fill="#e9e6de" stroke-width=".8"/><path d="M-4,29.500L0,34L4,29.500L3,38L0,40L-3,38Z" fill="#17161a" stroke-width=".7"/><path d="M-13,28.500C-12,37 -7,46 -2,52H-12C-17,45 -20,38 -20,31ZM13,28.500C12,37 7,46 2,52H12C17,45 20,38 20,31Z" fill="#3c3b42" stroke-width=".9"/>${lite('M22,34C27,37 29,42 30,50', 1.1, .3, '#b9bcc4')}`),
      hat: `<g transform="rotate(-4 0 -16)">${piv(16, -22, 'gdress-crepe', `<path d="M15,-25C30,-25 42,-12 47,8C43,5 40,9 37,4C34,-8 27,-15 16,-17Z" fill="#141317" fill-opacity=".86" stroke-width="1"/><path d="M16,-23C26,-19 31,-8 30,10C27,6 25,10 23,5C24,-5 21,-12 15,-17Z" fill="#232228" fill-opacity=".9" stroke-width=".9"/>${lite('M22,-22C32,-18 39,-8 43,3', .7, .3, '#b9bcc4')}`)}
<path d="M-17.500,-17L-19,-43C-9,-46.500 9,-46.500 19,-43L17.500,-17Z" fill="#232228" stroke-width="1.2"/><path d="M-18,-27C-8,-24 8,-24 18,-27L17.500,-17C8,-14.500 -8,-14.500 -17.500,-17Z" fill="#101013" stroke-width=".8"/><path d="M-19,-43C-9,-39.500 9,-39.500 19,-43" fill="none" stroke-width=".8"/>${lite('M11,-41.500C10.800,-37 10.400,-33 10,-29', 2.6, .2, '#c9ccd4')}${lite('M15,-42C14.800,-38 14.500,-34 14,-29.500', .9, .35, '#c9ccd4')}
<path d="M-31,-16C-21,-21.500 21,-21.500 31,-16C21,-10.500 -21,-10.500 -31,-16Z" fill="#232228" stroke-width="1.2"/>${lite('M-26,-16.500C-13,-20.200 13,-20.200 26,-16.500', .9, .4, '#c9ccd4')}</g>`,
      hands: [0, 0],
      over: `<g class="gdress-b2"><g transform="translate(100,216)"><g stroke-width=".8">${Array.from({ length: 18 }, (_, i) => { const a = i * 20, c = ['#6f8a66', '#8ea283', '#56704f'][i % 3]; return `<g transform="rotate(${a}) translate(0,-14.500) rotate(${62 + (i % 2) * 18})"><path d="M0,0C3,-4 9,-4 12,0C9,4 3,4 0,0Z" fill="${c}"/><path d="M1.500,0H10" fill="none" stroke-width=".4" opacity=".7"/></g>`; }).join('')}</g>
<g fill="#e9e6de" stroke-width=".6"><circle cx="-10" cy="-11" r="2"/><circle cx="12" cy="-8" r="2"/><circle cx="2" cy="-15.500" r="1.700"/><circle cx="-14" cy="5" r="1.700"/><circle cx="14.500" cy="6" r="1.700"/></g>
<path d="M-2,12L-9,29L-4,26L-1,31L2,15ZM2,12L10,28L5,26L3,31L-1,15Z" fill="#17161a" stroke-width=".9"/><path d="M0,14C-9,7 -13,13 -11,17C-8,20 -3,18 0,14C3,18 8,20 11,17C13,13 9,7 0,14Z" fill="#232228" stroke-width=".9"/></g>
${[-1, 1].map((s) => `<g transform="translate(${100 + s * 17},213) scale(${s},1)"><path d="M-3,-7C2,-9 8,-6 8,-1L7,5C5,9 -2,9 -4,5Z" fill="#1c1b20" stroke-width="1"/><path d="M0,-6.500V-2M3,-6.500V-2M6,-5V-1" fill="none" stroke="#6d6f78" stroke-width=".6"/><path d="M4,-11L14,-5L12,3L7,-2Z" fill="#26252a" stroke-width="1"/></g>`).join('')}</g>`,
    }),
    // mayoral: tricorn, ermine, a chain of office and a sash; a rosette on the basket
    achievement: (u) => ({
      cloth: cloth(u, '#a8432f', `<path d="M-30,31L-17,28.500L36,50V56H22Z" fill="#4f6a8a" stroke-width=".8"/><path d="M-34,52C-34,38 -28,32 -14,29L-6,27H6L14,29C28,32 34,38 34,52L27,52C26,43 19,37.500 0,37.500C-19,37.500 -26,43 -27,52Z" fill="#f3ecd6" stroke-width="1"/><path d="M-29,40v3M-22,34v3M-13,32.500v3M13,32.500v3M22,34v3M29,40v3M-30,47v3M30,47v3M0,31v3" fill="none" stroke-width="1.300"/>
<g fill="#e0b84c" stroke-width=".7">${[[-19, 31], [-15.5, 35], [-10.5, 38], [-5, 39.6], [5, 39.6], [10.5, 38], [15.5, 35], [19, 31]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.500"/>`).join('')}<circle cx="0" cy="42" r="4.600"/><circle cx="0" cy="42" r="2.200" fill="${BRICK}"/></g>`),
      hat: `<path d="M-20,-18C-19,-36 19,-36 20,-18Z" fill="${BLACK}" stroke-width="1.200"/>
<path d="M-39,-12C-34,-27 -13,-32 0,-22.500C13,-32 34,-27 39,-12C26,-19 11,-17 0,-10.500C-11,-17 -26,-19 -39,-12Z" fill="${BLACK}" stroke-width="1.250"/><path d="M-37,-14.500C-32,-25.500 -13,-29.500 0,-20C13,-29.500 32,-25.500 37,-14.500" fill="none" stroke="#e0b84c" stroke-width="1.700"/>
<path d="M-27,-26C-31,-36 -27,-45 -20,-50C-20,-41 -19,-34 -22,-25Z" fill="#f3ecd6" stroke-width=".9"/><circle cx="-24" cy="-23.500" r="4" fill="${BRICK}" stroke-width=".9"/><circle cx="-24" cy="-23.500" r="1.600" fill="#e0b84c" stroke-width=".5"/>`,
      hands: [1, 1],
      over: `<g transform="translate(100,229)"><path d="M-5,6L-13,28L-6.500,24.500L-3,31L3,8Z" fill="#8c3526" stroke-width="1"/><path d="M4,6L11,29L5.500,25L1.500,31L-3,8Z" fill="${BRICK}" stroke-width="1"/><path d="M0,-12.500l3.200,2.300l3.900,-.6l1.300,3.700l3.500,1.900l-1,3.800l1.900,3.400l-3,2.600l-.3,3.900l-3.900,.5l-2.400,3.100l-3.600,-1.600l-3.600,1.600l-2.400,-3.100l-3.900,-.5l-.3,-3.900l-3,-2.600l1.900,-3.400l-1,-3.800l3.500,-1.900l1.300,-3.700l3.900,.6Z" fill="${BRICK}" stroke-width="1.100"/><circle r="7.400" fill="#f3ecd6" stroke-width=".9"/><circle r="4.300" fill="#e0b84c" stroke-width=".8"/><path d="M0,-2.600l.8,1.700l1.900,.2l-1.400,1.300l.4,1.900l-1.700,-1l-1.700,1l.4,-1.900l-1.400,-1.300l1.900,-.2Z" fill="${BRICK}" stroke="none"/></g>`,
    }),
  };

  // dressings on the envelope that follow the costume
  const ENVD = {
    superb: () => {
      let s = '', line = '';
      const cols = [BRICK, CREAM, SAGE, OCHRE, '#5f7fa8'];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10, x = 22 + 156 * t, y = 50 + 26 * Math.sin(Math.PI * t);
        line += `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
        if (i < 10) { const x2 = 22 + 156 * (t + .1), y2 = 50 + 26 * Math.sin(Math.PI * (t + .1)); s += `<path d="M${(x + 2).toFixed(1)},${(y + .5).toFixed(1)}L${(x2 - 2).toFixed(1)},${(y2 + .5).toFixed(1)}L${((x + x2) / 2).toFixed(1)},${((y + y2) / 2 + 14).toFixed(1)}Z" fill="${cols[i % 5]}" stroke-width=".9"/>`; }
      }
      return `<path d="${line}" fill="none" stroke-width="1"/>${s}` + [[78, 100, BRICK, 1], [122, 100, OCHRE, -1]].map(([x, y, c, d]) => piv(x, y, 'gdress-strm', `<path d="M${x},${y}q${-7 * d},6 0,12t0,12t0,12t0,10" fill="none" stroke="${INK}" stroke-width="3.400"/><path d="M${x},${y}q${-7 * d},6 0,12t0,12t0,12t0,10" fill="none" stroke="${c}" stroke-width="1.800"/>`, `animation-delay:${d * .6}s`)).join('');
    },
    death: (u) => `<g clip-path="url(#gdV${u})"><path d="M10,50Q100,82 190,50L190,62Q100,95 10,62Z" fill="#141317" stroke-width="1"/></g><path d="M150,71C142,62 136,70 141,76C146,79 150,75 150,71C154,75 160,76 163,71C164,65 156,62 150,71Z" fill="#232228" stroke-width="1"/><path d="M148,74L143,92L148,89L151,94L152,75ZM152,74L159,90L154,88L152,93Z" fill="#141317" stroke-width=".9"/>`,
    pvp: () => `<g fill="none" stroke="#8f2a1e" stroke-linecap="butt"><path d="M72,24C66,38 62,54 61,72" stroke-width="5"/><path d="M90,20C86,36 83,54 83,76" stroke-width="5.500"/><path d="M108,22C106,38 105,54 106,74" stroke-width="4.500"/></g><path d="M61,72l-1,7M83,76l1,8M106,74l0,5" fill="none" stroke="#8f2a1e" stroke-width="2"/>`,
  };

  // ---- the balloon ----
  const ENV = 'M100,3C148,3 183,26 183,55C183,76 146,84 122,98L78,98C54,84 17,76 17,55C17,26 52,3 100,3Z';
  const gore = (f) => `C${(100 + 96 * f).toFixed(1)},7 ${(100 + 104 * f).toFixed(1)},72 ${(100 + 21 * f).toFixed(1)},96`;
  const goreBack = (f) => `L${(100 + 21 * f).toFixed(1)},96C${(100 + 104 * f).toFixed(1)},72 ${(100 + 96 * f).toFixed(1)},7 100,3Z`;
  const GF = [-1.1, -.74, -.44, -.15, .15, .44, .74, 1.1];
  const speck = (() => { let a = 7, s = ''; const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; for (let i = 0; i < 46; i++) { const d = rnd() > .5; s += `<circle cx="${(rnd() * 46).toFixed(1)}" cy="${(rnd() * 46).toFixed(1)}" r="${(.4 + rnd() * .7).toFixed(2)}" fill="${d ? '#2a1c12' : '#fff3d6'}" opacity="${(d ? .1 : .12) + rnd() * .08}"/>`; } return s; })();
  const chain = (barbed) => {
    let s = '';
    for (let i = 0; i < 4; i++) {
      const y = 2.2 + i * 4.2;
      s += i % 2 ? `<path d="M0,${y - 2.6}V${y + 2.6}" fill="none" stroke="${INK}" stroke-width="2.800"/><path d="M0,${y - 2.6}V${y + 2.6}" fill="none" stroke="${barbed ? '#8d4a3a' : '#8b939b'}" stroke-width="1.200"/>` : `<ellipse cx="0" cy="${y}" rx="2.300" ry="3.100" fill="none" stroke="${INK}" stroke-width="2.800"/><ellipse cx="0" cy="${y}" rx="2.300" ry="3.100" fill="none" stroke="${barbed ? '#8d4a3a' : '#8b939b'}" stroke-width="1.200"/>`;
      if (barbed && i % 2) s += `<path d="M0,${y}l-5,-2.500M0,${y}l5,2.500M0,${y}l-4.500,3M0,${y}l4.500,-3" fill="none" stroke="${INK}" stroke-width="1.400"/>`;
    }
    return s;
  };
  const SACK = `<path d="M0,0V9" fill="none" stroke-width=".9"/><path d="M-4.500,10C-7,14 -7.500,21 -4.500,23.500H4.500C7.500,21 7,14 4.500,10Z" fill="#b9a98a" stroke-width="1"/><path d="M-4.500,10C-7,14 -7.500,21 -4.500,23.500H-1C-3.500,19 -3.500,14 -2,10Z" fill="#2a1c22" opacity=".25" stroke="none"/><path d="M-4.500,10.500L-3,8H3L4.500,10.500Z" fill="#8c7a5a" stroke-width=".8"/>`;
  const art = (u) => `<svg class="gdress-art" xmlns="${NS}" width="200" height="290" viewBox="0 0 200 290"><defs>
<clipPath id="gdV${u}"><path d="${ENV}"/></clipPath><clipPath id="gdE${u}"><path d="${ALM}"/></clipPath><clipPath id="gdT${u}"><path d="${TORSO}"/></clipPath><clipPath id="gdC${u}"><path d="M-15,-21L2,-58L18,-21C8,-25 -6,-25 -15,-21Z"/></clipPath>
<clipPath id="gdG${u}"><path d="M-90,-140H90V46H-90Z"/></clipPath><clipPath id="gdF${u}"><path d="M70,98A22,10.500 0 0 1 130,98V124H70Z"/><ellipse cx="100" cy="98" rx="21" ry="10"/></clipPath>
<pattern id="gdP${u}" width="46" height="46" patternUnits="userSpaceOnUse">${speck}</pattern>
<radialGradient id="gdL${u}" cx=".5" cy="1" r=".9"><stop offset="0" stop-color="#ffc45a" stop-opacity=".95"/><stop offset=".5" stop-color="#ff9a3a" stop-opacity=".4"/><stop offset="1" stop-color="#ff8a2a" stop-opacity="0"/></radialGradient></defs>
<g stroke="${INK}" stroke-width="1.100" stroke-linejoin="round" stroke-linecap="round">
<g class="gdress-ropes" fill="none" stroke="#3a2c1c" stroke-width="1.500"><line/><line/><line/><line/></g>
<g class="gdress-env"><g transform="translate(0,-6)">${piv(GX, GY, 'gdress-envb', `<path d="${ENV}" fill="${BRICK}" stroke="none"/><g clip-path="url(#gdV${u})">${[1, 3, 5].map((i) => `<path d="M100,3${gore(GF[i])}${goreBack(GF[i + 1])}" fill="${i === 3 ? '#d9c391' : OCHRE}" stroke="none"/>`).join('')}
<path d="M17,84Q100,102 183,84V110H17Z" fill="${SLATE}" stroke="none" opacity=".9"/><path d="M17,84Q100,102 183,84" fill="none" stroke-width=".9"/>
<path d="M100,3C60,3 26,22 20,52C17,72 50,84 78,98L92,98C60,86 34,72 36,52C38,28 66,8 100,3Z" fill="#2a1622" opacity=".24" stroke="none"/><ellipse cx="132" cy="32" rx="16" ry="20" fill="#fff3d6" opacity=".12" stroke="none" transform="rotate(24 132 32)"/>
<rect width="200" height="110" fill="url(#gdP${u})" stroke="none"/><ellipse class="gdress-glow" cx="100" cy="92" rx="62" ry="50" fill="url(#gdL${u})" stroke="none" opacity=".1"/></g>
<g fill="none" stroke-width=".8" opacity=".85">${GF.slice(1, 7).map((f) => `<path d="M100,3${gore(f)}"/>`).join('')}</g>
<g transform="rotate(10 142 50)"><path d="M132,41H152V59H132Z" fill="${SAGE}" stroke-width="1"/><path d="M134.500,43.500H149.500V56.500H134.500Z" fill="none" stroke="${CREAM}" stroke-width=".8" stroke-dasharray="2 2"/></g>
<g transform="rotate(-14 56 44)"><ellipse cx="56" cy="44" rx="8.500" ry="7" fill="#d9c391" stroke-width="1"/><path d="M50,40l3,3M50,43l3,-3M59,45l3,3M59,48l3,-3" fill="none" stroke-width=".7"/></g>
<g class="gdress-envd"></g>
<path d="${ENV}" fill="none" stroke-width="1.400"/><path d="M78,98C54,84 17,76 17,55C17,44 22,34 30,26" fill="none" stroke-width="2.300"/>
<ellipse cx="100" cy="98" rx="22" ry="10.500" fill="#33221c" stroke-width="1.200"/><ellipse class="gdress-mouth" cx="100" cy="97" rx="19" ry="8" fill="#f09a3a" stroke="none" opacity=".2"/>
<path d="M78,98A22,10.500 0 0 0 122,98" fill="none" stroke="${SLATE}" stroke-width="3.400"/><path d="M78,98A22,10.500 0 0 0 122,98" fill="none" stroke="${CREAM}" stroke-width=".8" stroke-dasharray="1.500 3.500" opacity=".8"/><path d="M76.500,99A23.500,12 0 0 0 123.500,99" fill="none" stroke-width="1"/>`)}
<path d="M81,104L94.500,114M119,104L105.500,114" fill="none" stroke-width="1.400"/><g clip-path="url(#gdF${u})"><g transform="translate(100,114)"><g class="gdress-fl"><g class="gdress-flk"><path d="M0,0C-6,-6 -4,-14 0,-22C4,-14 6,-6 0,0Z" fill="#f2a13a" stroke="#a5561c" stroke-width=".8"/><path d="M0,-1C-3,-5 -2,-9 0,-14C2,-9 3,-5 0,-1Z" fill="#fff2c4" stroke="none"/></g></g></g></g>
<path d="M93.500,113H106.500V120.500H93.500Z" fill="${BRASS}" stroke-width="1.100"/><path d="M93.500,116H106.500" fill="none" stroke-width=".6"/><path d="M96,113V111H104V113" fill="#6b5a3a" stroke-width=".9"/><circle class="gdress-puff" cx="100" cy="106" r="5" fill="#d9d2c2" stroke="none" opacity="0"/></g></g>
<g class="gdress-bk">
<path d="M50,210Q100,200 150,210V214H50Z" fill="#3b2a1c" stroke-width="1"/>
<g transform="translate(${HX},209) scale(1.18) translate(0,-46)"><g clip-path="url(#gdG${u})"><g class="gdress-duck"><g class="gdress-gob"></g></g></g></g>
<path d="M52,211C47,226 51,240 60,248H140C149,240 153,226 148,211Z" fill="#a37c4a" stroke-width="1.300"/><path d="M52,211C47,226 51,240 60,248H76C66,240 62,226 64,211Z" fill="#2a1c22" opacity=".25" stroke="none"/>
<path d="M51,219Q100,225 149,219M50.500,227Q100,233 149.500,227M52.500,235Q100,241 147.500,235" fill="none" stroke-width=".8" opacity=".8"/><g fill="none" stroke-width=".7" opacity=".7">${[60, 70, 80, 90, 100, 110, 120, 130, 140].map((x, i) => `<path d="M${x},213.500Q${x + (x - 100) * .05},230 ${100 + (x - 100) * .9},244"/>`).join('')}</g>
<g fill="none" stroke="#e3c98f" stroke-width="1.300" opacity=".6">${[0, 1, 2, 3].map((r) => [0, 1, 2, 3, 4].map((c) => `<path d="M${84 + c * 11.5 + (r % 2) * 5.5},${216.5 + r * 8}h4.500"/>`).join('')).join('')}</g>
<path d="M58,243.500H142L140,248.500H60Z" fill="#6f5030" stroke-width="1.100"/><rect x="47" y="205.500" width="106" height="8" rx="3.800" fill="#7d5c36" stroke-width="1.300"/><path d="M56,209.500h5M66,209.500h5M76,209.500h5M86,209.500h5M96,209.500h5M106,209.500h5M116,209.500h5M126,209.500h5M136,209.500h5" fill="none" stroke-width=".7" opacity=".6" transform="skewX(-20) translate(76,0)"/>${lite('M52,207.500H148', 1, .3)}
<g class="gdress-over"></g><g class="gdress-hands"></g>
<g transform="translate(49,213)"><g class="gdress-sack">${SACK}</g></g><g transform="translate(151,213)"><g class="gdress-sack">${SACK}</g></g>
<path d="M66,246L60,256M72,246L66,256M134,246L140,256M128,246L134,256" fill="none" stroke="#3a2c1c" stroke-width="1.600"/>
<rect x="27" y="252" width="146" height="8.500" rx="2" fill="#6b4a2c" stroke-width="1.300"/><path d="M31,255H88M96,257.500H169M112,254.500H150" fill="none" stroke-width=".5" opacity=".6"/>${lite('M30,253.500H170', .9, .3)}
<g fill="#cdb88a" stroke-width=".8"><path d="M57,250.500l4,-.5l3,11l-4,.5ZM62,250l4,-.5l3,11l-4,.5ZM67,249.500l4,-.5l3,11l-4,.5ZM143,250.500l-4,-.5l-3,11l4,.5ZM138,250l-4,-.5l-3,11l4,.5ZM133,249.500l-4,-.5l-3,11l4,.5Z"/></g>
<g fill="#4b5158" stroke-width=".9"><rect x="28.500" y="251" width="5" height="10.500" rx="1"/><rect x="166.500" y="251" width="5" height="10.500" rx="1"/><path d="M33.500,260.500h5v2.500h-5ZM161.500,260.500h5v2.500h-5Z"/></g>
<g transform="translate(${AX},${AY})"><g class="gdress-ch"></g></g><g transform="translate(${200 - AX},${AY})"><g class="gdress-ch"></g></g>
</g></g></svg>`;

  const hands = (which, glove) => [-1, 1].map((s, k) => which[k] ? `<g transform="translate(${100 + s * 37},209)"><g class="gdress-hand"><g transform="scale(${s},1)">${[0, 1, 2, 3].map((i) => { const x = -7 + i * 4.7, l = [6.5, 8, 7.6, 6][i]; return `<path class="${glove ? '' : 'gdress-sk'}" d="M${x - 2.2},-3.500C${x - 2.2},-7 ${x + 2.2},-7 ${x + 2.2},-3.500V${l - 2}C${x + 2.2},${l + 1} ${x - 2.2},${l + 1} ${x - 2.2},${l - 2}Z" stroke-width=".95"/><path d="M${x - 1.3},-1.200h2.600" fill="none" stroke-width=".55"/><path d="M${x - 1.1},${l - .6}L${x},${l + 2.6}L${x + 1.1},${l - .6}Z" fill="#3b3a2c" stroke-width=".4"/>`; }).join('')}</g></g></g>` : '').join('');

  // ---- the signboard ----
  const pips = (n, pvp) => {
    if (pvp) return `<svg class="gdress-pips" xmlns="${NS}" width="18" height="12" viewBox="0 0 18 12"><path d="M3,1.500L15,10.500M15,1.500L3,10.500" fill="none" stroke="#b02a1c" stroke-width="2.400" stroke-linecap="round"/></svg>`;
    let s = '';
    for (let i = 0; i < 5; i++) s += `<path class="${i < n ? 'gdress-pon' : 'gdress-poff'}" d="M${5 + i * 9.5},1l3.800,5l-3.800,5l-3.800,-5Z"/>`;
    return `<svg class="gdress-pips" xmlns="${NS}" width="48" height="12" viewBox="0 0 48 12">${s}</svg>`;
  };
  const EYES = `<svg class="gdress-eyes" xmlns="${NS}" width="190" height="16" viewBox="0 0 190 16"><g stroke="${INK}" stroke-width=".9">${[31, 159].map((x) => `<path d="M${x - 3.5},5H${x + 3.5}V14.500L${x},16.500L${x - 3.5},14.500Z" fill="#4b5158"/><circle cx="${x}" cy="3" r="2.700" fill="none" stroke="${INK}" stroke-width="2.800"/><circle cx="${x}" cy="3" r="2.700" fill="none" stroke="#8b939b" stroke-width="1.200"/><circle cx="${x}" cy="10.500" r="1" fill="#aab3ba" stroke-width=".4"/>`).join('')}</g></svg>`;
  const LAUREL = (flip) => `<svg class="gdress-laurel" xmlns="${NS}" width="24" height="30" viewBox="0 0 24 30"${flip ? ' style="transform:scaleX(-1)"' : ''}><path d="M20,28C8,24 4,14 8,2" fill="none" stroke="#e6c36a" stroke-width="1.200"/><g fill="#e6c36a">${[[9, 5, -60], [6.500, 11, -40], [7, 17, -20], [10, 22.500, 5], [15, 26.500, 25]].map(([x, y, a]) => `<path transform="translate(${x},${y}) rotate(${a})" d="M0,0C2,-4 7,-5 10,-3C8,0 3,2 0,0Z"/><path transform="translate(${x},${y}) rotate(${a + 100})" d="M0,0C2,-3 6,-4 8,-2C6,0 3,1.500 0,0Z" opacity=".8"/>`).join('')}</g></svg>`;

  Harness.css('goblin-dressed', `
.gdress-rig{position:relative;width:200px;--sk:#8f9c7e;--skd:#6d7b62;--px:0px;--py:0px;--hr:0deg;--hy:0px;--lid:1px;--lx:0px;--bry:0px}
.gdress-rig[data-mood=death]{--sk:#a3a5a0;--skd:#7d807c}
.gdress-rig[data-mood=pvp]{--sk:#869274;--skd:#606d54}
${Object.keys(F).map((m) => `.gdress-rig[data-mood=${m}]{--lid:${F[m].lid}px}`).join('')}
.gdress-art{position:absolute;left:0;top:0;overflow:visible;display:block}
.gdress-rig[data-sky=night] .gdress-art{filter:drop-shadow(0 0 .7px rgba(255,234,196,.55))}
.gdress-rig[data-sky=dusk] .gdress-art{filter:drop-shadow(0 0 .6px rgba(255,226,190,.35))}
.gdress-rig[data-mood=death] .gdress-art{filter:grayscale(.82) brightness(.94)}
.gdress-rig[data-mood=death][data-sky=night] .gdress-art,.gdress-rig[data-mood=death][data-sky=dusk] .gdress-art{filter:grayscale(.82) brightness(.94) drop-shadow(0 0 .7px rgba(235,235,235,.5))}
.gdress-sk{fill:var(--sk)}.gdress-skd{fill:var(--skd)}
.gdress-nick{fill:none;stroke:none}
.gdress-envb{animation:gdress-env 5.6s ease-in-out infinite}
.gdress-flk{animation:gdress-flk .34s ease-in-out infinite alternate}
.gdress-gob{animation:gdress-br 3.7s ease-in-out infinite alternate}
.gdress-cloth{animation:gdress-chest 3.7s ease-in-out infinite alternate}
.gdress-hd{transform:translateY(var(--hy)) rotate(var(--hr));transition:transform .5s cubic-bezier(.3,1.3,.5,1)}
.gdress-pu{transform:translate(var(--px),var(--py));transition:transform .13s ease-out}
.gdress-lidm{transform:translateY(calc(var(--lid) + var(--lx)));transition:transform .22s ease-out}
.gdress-brow{transform:translateY(var(--bry));transition:transform .25s ease-out}
.gdress-yawn{transform:scale(0)}
.gdress-bw2{transform:scaleX(.12);opacity:0}
.gdress-toot,.gdress-glint{opacity:0}
.gdress-rock{animation:gdress-rock 2.9s ease-in-out infinite alternate}
.gdress-tail{animation:gdress-tail 3.1s ease-in-out infinite alternate}
.gdress-cfl{animation:gdress-flk .5s ease-in-out infinite alternate}
.gdress-rain path{stroke-dasharray:6 11;animation:gdress-rain .62s linear infinite}
.gdress-drip{animation:gdress-drip 1.9s ease-in infinite}
.gdress-cloud{animation:gdress-cloud 4.3s ease-in-out infinite alternate}
.gdress-spark{animation:gdress-spark .5s steps(4) infinite}
.gdress-pom{animation:gdress-rock 1.7s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:50% 100%}
.gdress-cf{animation:gdress-cf 2.6s linear infinite}
.gdress-crepe{animation:gdress-crepe 3.3s ease-in-out infinite alternate}
.gdress-ban{animation:gdress-tail 2.3s ease-in-out infinite alternate}
.gdress-strm{animation:gdress-tail 2.7s ease-in-out infinite alternate}
@keyframes gdress-env{0%,100%{transform:scale(1,1) rotate(-.5deg)}30%{transform:scale(1.012,.992) rotate(.3deg)}62%{transform:scale(.992,1.01) rotate(.6deg)}}
@keyframes gdress-flk{0%{transform:scale(1,1) skewX(-4deg)}50%{transform:scale(.86,1.12) skewX(3deg)}100%{transform:scale(1.1,.9) skewX(5deg)}}
@keyframes gdress-br{from{transform:translateY(.5px)}to{transform:translateY(-1.1px)}}
@keyframes gdress-chest{from{transform:scale(1,1)}to{transform:scale(1.025,1.012)}}
@keyframes gdress-rock{from{transform:rotate(-5deg)}to{transform:rotate(6deg)}}
@keyframes gdress-tail{from{transform:rotate(-4deg)}to{transform:rotate(5deg)}}
@keyframes gdress-crepe{from{transform:rotate(-7deg) scaleY(.96)}to{transform:rotate(6deg) scaleY(1.04)}}
@keyframes gdress-rain{to{stroke-dashoffset:-17}}
@keyframes gdress-drip{0%,35%{transform:translateY(0);opacity:0}40%{opacity:1}100%{transform:translateY(52px);opacity:0}}
@keyframes gdress-cloud{from{transform:translateX(-2px)}to{transform:translateX(2.5px)}}
@keyframes gdress-spark{0%{transform:rotate(0) scale(1)}25%{transform:rotate(23deg) scale(.72)}50%{transform:rotate(41deg) scale(1.12)}75%{transform:rotate(67deg) scale(.84)}100%{transform:rotate(90deg) scale(1)}}
@keyframes gdress-cf{0%{transform:translate(var(--x),-84px) rotate(0);opacity:0}8%{opacity:1}80%{opacity:1}100%{transform:translate(calc(var(--x) + var(--dx)),48px) rotate(var(--r));opacity:0}}
@keyframes gdress-wet{0%{filter:brightness(1.7) saturate(1.3)}100%{filter:none}}
.gdress-under{position:relative;padding-top:${TOP}px;transform-origin:${GX}px ${GY}px;will-change:transform}
.gdress-swing{will-change:transform}
.gdress-sign{position:relative;margin:0 5px;font-family:"Cormorant Garamond",Georgia,serif;text-align:center;color:var(--ink);--ink:#f1e8cf;--gold:#e9c66c;--dim:#d3c9ae;--gr:#46505b;--fr:#7a5c38;--fl:#a8875a;--fd:#4a361f;--gilt:#c9a24e;--sc:#eadfc2;--st:#2a2219;--pon:#8f2f22;filter:drop-shadow(0 2.5px 2px rgba(0,0,0,.42))}
.gdress-board{position:relative;box-sizing:border-box;min-height:50px;border:5px solid;border-color:var(--fl) var(--fr) var(--fd) var(--fr);border-radius:2.5px;padding:3px 6px 10px;background:linear-gradient(180deg,rgba(8,5,2,.46),rgba(8,5,2,0) 15px),${GRAIN},radial-gradient(130% 100% at 50% 40%,transparent 45%,rgba(0,0,0,.3)),var(--gr);box-shadow:0 0 0 1.2px ${INK},inset 0 0 0 1.2px ${INK},inset 0 0 0 2.6px var(--gilt),inset 0 0 0 3.4px rgba(0,0,0,.5)}
.gdress-wet .gdress-board{animation:gdress-wet .7s ease-out}
.gdress-eyes{position:absolute;left:0;top:-5px;overflow:visible;pointer-events:none;z-index:1}
.gdress-board>div:empty{display:none}
.gdress-row{display:flex;flex-direction:column;align-items:center}
.gdress-title{font:italic 600 15.5px/1.08 "Cormorant Garamond",Georgia,serif;text-wrap:balance;overflow-wrap:anywhere;text-shadow:.8px .8px 0 rgba(0,0,0,.5);padding-top:1px}
.gdress-rule{height:5px;width:120px;margin:1px auto -1px;background:linear-gradient(90deg,transparent,var(--gold) 20%,var(--gold) 80%,transparent) 50% 50%/100% 1px no-repeat;position:relative;opacity:.85}
.gdress-rule::after{content:"";position:absolute;left:50%;top:50%;width:5px;height:5px;margin:-2.5px;background:var(--gold);transform:rotate(45deg)}
.gdress-fig{font:400 26px/1.02 "IM Fell English",Georgia,serif;color:var(--gold);font-variant-numeric:lining-nums;white-space:nowrap;text-shadow:1.2px 1.2px 0 rgba(0,0,0,.6)}
.gdress-unit{font:italic 500 15px/1 "Cormorant Garamond",Georgia,serif;margin-left:4px;color:var(--dim)}
.gdress-more{font:italic 500 13px/1.1 "Cormorant Garamond",Georgia,serif;color:var(--dim);text-wrap:balance;margin:1px 0 2px}
.gdress-many .gdress-row{flex-direction:row;justify-content:center;align-items:baseline;gap:12px}
.gdress-many .gdress-rule{display:none}
.gdress-scroll{position:absolute;left:50%;bottom:-9px;transform:translateX(-50%);display:flex;align-items:center;gap:6px;white-space:nowrap;padding:1.5px 9px 2px;background:var(--sc);color:var(--st);box-shadow:0 0 0 1.1px ${INK},0 1.5px 0 1px rgba(0,0,0,.35);border-radius:1px}
.gdress-scroll::before,.gdress-scroll::after{content:"";position:absolute;top:3px;bottom:-3px;width:9px;background:var(--sc);filter:brightness(.72);box-shadow:0 0 0 1.1px ${INK};z-index:-1}
.gdress-scroll::before{left:-6px;clip-path:polygon(0 0,100% 0,100% 100%,0 100%,45% 50%)}.gdress-scroll::after{right:-6px;clip-path:polygon(0 0,100% 0,55% 50%,100% 100%,0 100%)}
.gdress-word{font:400 13px/1.15 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.14em}
.gdress-pips{display:block;overflow:visible}
.gdress-pon{fill:var(--pon);stroke:${INK};stroke-width:.8}.gdress-poff{fill:none;stroke:${INK};stroke-width:.8;opacity:.4}
.gdress-laurel{position:absolute;top:8px;left:8px}.gdress-laurel+.gdress-laurel{left:auto;right:8px}
.gdress-daub{position:absolute;inset:4px 8px 10px;pointer-events:none}
.gdress-board>.gdress-row,.gdress-board>.gdress-more{position:relative}
.gdress-sign[data-mood=poor]{--gr:#2c4159;--fr:#6b6359;--fl:#8f877b;--fd:#45403a;--gilt:#8f9aa3;--gold:#c3d0da}
.gdress-sign[data-mood=meh]{--gr:#57424f;--gilt:#b79aa8;--gold:#e3cfd6}
.gdress-sign[data-mood=good]{--gr:#2b4a36;--fr:#80603a;--fl:#ab8a5c}
.gdress-sign[data-mood=great]{--gr:#5c2233;--fr:#2b2622;--fl:#57504a;--fd:#141210;--gilt:#dcb65c}
.gdress-sign[data-mood=superb]{--gr:#cfa443;--ink:#2a1a0e;--gold:#7d1d14;--dim:#4a3312;--fr:#8f3525;--fl:#b9523c;--fd:#5c1f14;--gilt:#f0d58a;--sc:#8f2f22;--st:#f6ecd0;--pon:#f0d58a}
.gdress-sign[data-mood=superb] .gdress-title,.gdress-sign[data-mood=superb] .gdress-fig,.gdress-sign[data-kind=achievement] .gdress-title{text-shadow:.8px .8px 0 rgba(255,244,205,.5)}
.gdress-sign[data-mood=superb] .gdress-poff{stroke:#f0d58a}.gdress-sign[data-mood=superb] .gdress-pon{stroke:#3a120c}
.gdress-sign[data-mood=pvp]{--gr:#161313;--fr:#3d4147;--fl:#676d75;--fd:#1d2024;--gilt:#7d2419;--gold:#f0e6cc;--sc:#161313;--st:#f0e6cc}
.gdress-sign[data-mood=levelup]{--gr:#254282;--fr:#b58a3a;--fl:#e0bd6c;--fd:#7a5a1f;--gilt:#f0d58a}
.gdress-sign[data-mood=death]{--gr:#131313;--fr:#2c2c2e;--fl:#4a4a4d;--fd:#0c0c0d;--gilt:#8a8a8a;--ink:#d6d6d2;--gold:#d6d6d2;--dim:#a5a5a2}
.gdress-sign[data-mood=achievement]{--gr:#e4d7b2;--ink:#2a1a0e;--dim:#4a3312;--fr:#8f3525;--fl:#b9523c;--fd:#5c1f14;--gilt:#e0b84c}
.gdress-sign[data-kind=levelup] .gdress-board{padding:10px 30px 11px}
.gdress-sign[data-kind=levelup] .gdress-fig{font:700 25px/1.25 "Cinzel",Georgia,serif;letter-spacing:.02em}
.gdress-sign[data-kind=death] .gdress-board{padding:12px 6px 12px}
.gdress-sign[data-kind=death] .gdress-fig{font:400 25px/1.2 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.16em;text-transform:lowercase;font-variant:small-caps;border-block:1px solid #6a6a6a;display:inline-block;padding:1px 10px 2px}
.gdress-sign[data-kind=achievement] .gdress-board{padding:5px 7px 13px}
.gdress-sign[data-kind=achievement] .gdress-title{font-size:14px;line-height:1.1}
.gdress-still{position:relative;width:200px;margin:0 auto}
.gdress-rm *,.gdress-rm *::before{animation:none!important;transition:none!important}
`);

  Harness.register({
    id: 'goblin-dressed',
    name: 'Goblin, dressed for it',
    blurb: 'The original goblin, drawn as a storybook plate, and he keeps a trunk in the basket: oilskins and an umbrella for a poor kill, a nightcap for a dull one, a top hat for a great one, a party hat and blower for a superb one. His face never changes. The inn sign hangs on two chains from a yoke under the basket.',
    create(ctx) {
      const E = ctx.el;
      const live = new Set();
      let uid = 0;
      const parts = (g, markup) => { const t = ctx.svg(`<svg xmlns="${NS}">${markup}</svg>`); g.replaceChildren(...t.childNodes); };

      function paint(sign, n) {
        const mood = F[n.mood] ? n.mood : 'calibrating', b = sign.querySelector('.gdress-board');
        sign.dataset.mood = mood; sign.dataset.kind = n.kind;
        sign.classList.toggle('gdress-many', !!n.more);
        b.textContent = '';
        if (mood === 'pvp') b.append(ctx.svg(`<svg class="gdress-daub" xmlns="${NS}" viewBox="0 0 160 50" preserveAspectRatio="none"><path d="M6,30C30,14 60,36 92,20C116,9 140,24 156,14L154,30C132,40 112,26 90,36C60,48 34,30 8,44Z" fill="#8f2419" opacity=".8"/><path d="M40,42l-1,8M118,34l1,12M150,28l0,9" stroke="#8f2419" stroke-width="2.500" opacity=".8" fill="none"/></svg>`));
        if (n.kind === 'levelup') b.append(ctx.svg(LAUREL(false)), ctx.svg(LAUREL(true)));
        const row = E('div', 'gdress-row');
        row.append(E('div', 'gdress-title', n.title));
        if (n.kind === 'kill') row.append(E('div', 'gdress-rule'));
        const fig = E('div', 'gdress-fig', n.big);
        if (n.unit) fig.append(E('span', 'gdress-unit', n.unit));
        row.append(fig);
        b.append(row, E('div', 'gdress-more', n.more));
        if (n.kind === 'kill' || n.label) {
          const sc = E('div', 'gdress-scroll');
          sc.append(E('span', 'gdress-word', n.label || (n.kind === 'kill' ? '?' : '')));
          if (n.kind === 'kill') sc.append(ctx.svg(pips(RANK[mood] || 0, mood === 'pvp')));
          b.append(sc);
        }
      }

      function dress(R, mood) {
        R.mood = mood;
        const w = WARD[mood](R.u), f = F[mood];
        R.root.dataset.mood = mood;
        parts(R.gob, `${w.back || ''}${w.cloth}${head(R.u, f, w)}${w.front || ''}`);
        parts(R.handsG, hands(w.hands, mood === 'death'));
        parts(R.overG, w.over || '');
        parts(R.envd, ENVD[mood] ? ENVD[mood](R.u) : '');
        for (const c of R.chains) parts(c, chain(mood === 'pvp'));
        R.pre = null;
        if (ctx.reduced) for (const e of R.root.querySelectorAll('.gdress-bw1')) e.style.opacity = 1;
      }

      function build(n) {
        const u = ++uid, mood = F[n.mood] ? n.mood : 'calibrating';
        const root = E('div', 'gdress-rig'), under = E('div', 'gdress-under'), swing = E('div', 'gdress-swing'), sign = E('div', 'gdress-sign');
        root.dataset.sky = ctx.skyMode();
        if (ctx.reduced) root.classList.add('gdress-rm');
        const svg = ctx.svg(art(u));
        sign.append(ctx.svg(EYES), E('div', 'gdress-board'));
        swing.append(sign); under.append(swing); root.append(svg, under);
        const q = (s) => svg.querySelector(s);
        const R = { u, root, svg, under, swing, sign, env: q('.gdress-env'), bk: q('.gdress-bk'), gob: q('.gdress-gob'), duck: q('.gdress-duck'), handsG: q('.gdress-hands'), overG: q('.gdress-over'), envd: q('.gdress-envd'), ropes: [...svg.querySelectorAll('.gdress-ropes line')], chains: [...svg.querySelectorAll('.gdress-ch')], sacks: [...svg.querySelectorAll('.gdress-sack')], fl: q('.gdress-fl'), glow: q('.gdress-glow'), mouth: q('.gdress-mouth'), puff: q('.gdress-puff'), th: 0, thv: 0, sk: 0, skv: 0, burn: .15, last: 0, tm: [], dead: false, did: false, left: false };
        dress(R, mood);
        paint(sign, n);
        pose(R, { lean: 0, swing: 0, phase: 'read', burn: .15 });
        return R;
      }

      // ---- per frame: lean, hinge, ropes, the pendulum, the flame ----
      const RP = [[80, 97, 53, 207], [120, 97, 147, 207], [92, 101, 76, 207], [108, 101, 124, 207]];
      const rot = (x, y, c, s) => [GX + (x - GX) * c - (y - GY) * s, GY + (x - GX) * s + (y - GY) * c];
      const skyK = () => ({ night: 1, dusk: .8, day: .4, overcast: .55 })[ctx.skyMode()] || 1;
      function pose(R, f) {
        const now = performance.now(), dt = R.last ? Math.min(.05, (now - R.last) / 1000) : 0;
        R.last = now;
        const ae = f.lean * .85, ab = f.lean * .8 + f.swing * .55;
        // the board: an underdamped spring after the basket, so it has weight
        const target = -(f.lean + f.swing) * 2.6 + Math.sin(now * .0019 + R.u) * 3.2;
        R.thv += ((target - R.th) * 52 - R.thv * 3.4) * dt; R.th += R.thv * dt;
        R.th = Math.max(-40, Math.min(40, R.th));
        R.skv += ((R.th * .7 - R.sk) * 90 - R.skv * 4) * dt; R.sk += R.skv * dt;
        const loc = R.th - ab, a = loc * Math.PI / 180;
        R.env.setAttribute('transform', `rotate(${ae.toFixed(2)} ${GX} ${GY})`);
        R.bk.setAttribute('transform', `rotate(${ab.toFixed(2)} ${GX} ${GY})`);
        const ce = Math.cos(ae * Math.PI / 180), se = Math.sin(ae * Math.PI / 180), cb = Math.cos(ab * Math.PI / 180), sb = Math.sin(ab * Math.PI / 180);
        for (let i = 0; i < 4; i++) {
          const p = RP[i], t = rot(p[0], p[1], ce, se), b = rot(p[2], p[3], cb, sb), l = R.ropes[i];
          l.setAttribute('x1', t[0].toFixed(1)); l.setAttribute('y1', t[1].toFixed(1)); l.setAttribute('x2', b[0].toFixed(1)); l.setAttribute('y2', b[1].toFixed(1));
        }
        const tr = `rotate(${loc.toFixed(2)})`;
        R.chains[0].setAttribute('transform', tr); R.chains[1].setAttribute('transform', tr);
        const st = `rotate(${(R.sk - ab).toFixed(2)})`;
        R.sacks[0].setAttribute('transform', st); R.sacks[1].setAttribute('transform', st);
        R.under.style.transform = `rotate(${ab.toFixed(2)}deg)`;
        R.swing.style.transform = `translate(${(-CL * Math.sin(a)).toFixed(2)}px,${(CL * Math.cos(a) - CL).toFixed(2)}px)`;
        // the burner
        if (f.phase === 'leave' && !R.left) { R.left = true; R.flare = 1; if (!ctx.reduced) R.puff.animate([{ opacity: .75, transform: 'translate(0,0) scale(.6)' }, { opacity: 0, transform: 'translate(26px,-8px) scale(2.6)' }], { duration: 900, easing: 'ease-out' }); }
        if (R.flare) R.flare = Math.max(0, R.flare - dt * 1.4);
        const want = Math.max(f.burn, R.flare || 0);
        R.burn += (want - R.burn) * Math.min(1, dt * 7 + (dt ? 0 : 1));
        const bn = R.burn;
        R.fl.setAttribute('transform', `scale(${(.55 + bn * .75).toFixed(3)} ${(.34 + bn * 1.25).toFixed(3)})`);
        const k = skyK();
        R.glow.setAttribute('opacity', (bn * .85 * k).toFixed(2)); R.mouth.setAttribute('opacity', (.15 + bn * .8).toFixed(2));
        if (f.phase === 'read' && !R.did && dt) { R.did = true; business(R); }
      }

      // ---- life: blinks, glances, ears, hands ----
      const GAZE = { sign: ['0px', '1.9px', '0deg', '1.3px', '1.1px', '.5px'], you: ['0px', '.2px', '0deg', '0px', '0px', '0px'], up: ['.4px', '-2.1px', '0deg', '-1.2px', '-1px', '-1.3px'], left: ['-2.6px', '.3px', '-3deg', '0px', '0px', '0px'], right: ['2.6px', '.3px', '3deg', '0px', '0px', '0px'] };
      const FAV = { calibrating: 'left', poor: 'up', meh: 'you', good: 'you', great: 'right', superb: 'you', pvp: 'you', levelup: 'right', death: 'sign', achievement: 'you' };
      function gaze(R, to) {
        const g = GAZE[to], s = R.root.style;
        s.setProperty('--px', g[0]); s.setProperty('--py', g[1]); s.setProperty('--hr', g[2]); s.setProperty('--hy', g[3]); s.setProperty('--lx', g[4]); s.setProperty('--bry', g[5]);
      }
      const all = (R, s) => R.root.querySelectorAll(s);
      const anim = (R, sel, kf, o) => { const out = []; for (const e of all(R, sel)) out.push(e.animate(kf, o)); return out; };
      const blink = (R, hold = 0) => anim(R, '.gdress-lid', [{ transform: 'none' }, { transform: 'translateY(7px)', offset: .35 * (1 - hold) }, { transform: 'translateY(7px)', offset: .35 * (1 - hold) + hold }, { transform: 'none' }], { duration: 150 / (1 - hold), easing: 'ease-in-out' });
      function life(R) {
        if (ctx.reduced) return;
        const later = (fn, ms) => R.tm.push(setTimeout(() => { if (!R.dead) fn(); }, ms));
        const loop = (fn, min, max, first) => {
          const go = () => {
            if (R.dead) return;
            if (R.root.isConnected) R.seen = true; else if (R.seen) { R.dead = true; return; }
            fn(); later(go, min + Math.random() * (max - min));
          };
          later(go, first ?? min * Math.random() + 300);
        };
        R.later = later;
        loop(() => { blink(R); if (Math.random() < .22) later(() => blink(R), 260); }, 1300, 4200);
        loop(() => {
          const r = Math.random(), fav = FAV[R.mood];
          gaze(R, r < .3 ? 'sign' : r < .55 ? 'you' : r < .75 ? fav : r < .85 ? 'up' : r < .93 ? 'left' : 'right');
        }, 700, 2300, 1200);
        loop(() => {
          const ears = all(R, '.gdress-ear'), e = ears[(Math.random() * ears.length) | 0];
          if (e) e.animate([{ transform: 'none' }, { transform: 'rotate(-10deg)' }, { transform: 'rotate(3deg)' }, { transform: 'rotate(-7deg)' }, { transform: 'none' }], { duration: 430, easing: 'ease-in-out' });
        }, 1700, 5200);
        loop(() => {
          const hs = all(R, '.gdress-hand'), h = hs[(Math.random() * hs.length) | 0];
          if (h) h.animate([{ transform: 'none' }, { transform: 'translate(0,-2.5px)', offset: .2 }, { transform: 'translate(2.5px,-1px)', offset: .5 }, { transform: 'translate(2.5px,0)', offset: .7 }, { transform: 'none' }], { duration: 900, easing: 'ease-in-out' });
        }, 2400, 6000);
        loop(() => { if (IDLE[R.mood]) IDLE[R.mood](R); }, 2600, 4400, 2200 + Math.random() * 1500);
      }

      // ---- the piece of business on arriving, one per costume ----
      const nod = (R, kf, o) => anim(R, '.gdress-nod', kf, o);
      const toot = (R, ms = 900) => {
        anim(R, '.gdress-bw1', [{ opacity: 1 }, { opacity: 0, offset: .08 }, { opacity: 0, offset: .9 }, { opacity: 1 }], { duration: ms });
        anim(R, '.gdress-bw2', [{ opacity: 1, transform: 'scaleX(.12)' }, { opacity: 1, transform: 'scaleX(1.06)', offset: .22 }, { opacity: 1, transform: 'scaleX(.97) rotate(2deg)', offset: .34 }, { opacity: 1, transform: 'scaleX(1.02) rotate(-2deg)', offset: .5 }, { opacity: 1, transform: 'scaleX(1)', offset: .72 }, { opacity: 1, transform: 'scaleX(.12)' }], { duration: ms, easing: 'ease-out' });
        nod(R, [{ transform: 'none' }, { transform: 'translate(-1.5px,1px) rotate(-2deg)', offset: .2 }, { transform: 'none' }], { duration: ms * .7, easing: 'ease-out' });
        anim(R, '.gdress-cone', [{ transform: 'none' }, { transform: 'rotate(7deg)', offset: .2 }, { transform: 'rotate(-4deg)', offset: .5 }, { transform: 'none' }], { duration: ms, easing: 'ease-in-out' });
      };
      const BIZ = {
        calibrating: (R) => { gaze(R, 'up'); anim(R, '.gdress-b1', [{ transform: 'none' }, { transform: 'rotate(-12deg)' }, { transform: 'rotate(7deg)' }, { transform: 'rotate(-12deg)' }, { transform: 'rotate(7deg)' }, { transform: 'rotate(-9deg)' }, { transform: 'none' }], { duration: 1000, easing: 'ease-in-out' }); nod(R, [{ transform: 'none' }, { transform: 'rotate(-3deg)', offset: .3 }, { transform: 'rotate(-3deg)', offset: .8 }, { transform: 'none' }], { duration: 1200, easing: 'ease-in-out' }); },
        poor: (R) => { gaze(R, 'up'); nod(R, [{ transform: 'none' }, { transform: 'translateY(-1px)', offset: .25 }, { transform: 'translateY(3px) rotate(-2deg)', offset: .6 }, { transform: 'translateY(3px) rotate(-2deg)', offset: .85 }, { transform: 'none' }], { duration: 1700, easing: 'ease-in-out' }); R.later(() => gaze(R, 'sign'), 800); },
        meh: (R) => { anim(R, '.gdress-yawn', [{ transform: 'scale(0)' }, { transform: 'scale(1.05)', offset: .3 }, { transform: 'scale(1)', offset: .7 }, { transform: 'scale(0)' }], { duration: 1500, easing: 'ease-in-out' }); blink(R, .86); nod(R, [{ transform: 'none' }, { transform: 'translateY(-2px) rotate(-5deg)', offset: .35 }, { transform: 'translateY(-2px) rotate(-5deg)', offset: .7 }, { transform: 'none' }], { duration: 1500, easing: 'ease-in-out' }); },
        good: (R) => { gaze(R, 'you'); nod(R, [{ transform: 'none' }, { transform: 'translateY(5px) rotate(2deg)', offset: .35 }, { transform: 'translateY(-1.5px)', offset: .7 }, { transform: 'none' }], { duration: 420, delay: 180, easing: 'ease-in-out' }); anim(R, '.gdress-fold', [{ transform: 'none' }, { transform: 'translateY(-1.5px)', offset: .5 }, { transform: 'none' }], { duration: 500, delay: 180 }); },
        great: (R) => { gaze(R, 'right'); anim(R, '.gdress-b1', [{ transform: 'none' }, { transform: 'rotate(-17deg)', offset: .22 }, { transform: 'rotate(-15deg)', offset: .75 }, { transform: 'none' }], { duration: 1600, easing: 'ease-in-out' }); anim(R, '.gdress-glint', [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'scale(1.1)', offset: .4 }, { opacity: 0, transform: 'scale(.6)' }], { duration: 520, delay: 380 }); nod(R, [{ transform: 'none' }, { transform: 'translateY(-1.5px) rotate(3deg)', offset: .25 }, { transform: 'translateY(-1.5px) rotate(3deg)', offset: .75 }, { transform: 'none' }], { duration: 1600, easing: 'ease-in-out' }); R.later(() => gaze(R, 'you'), 900); },
        superb: (R) => { gaze(R, 'you'); toot(R, 1250); },
        pvp: (R) => { gaze(R, 'you'); anim(R, '.gdress-b1', [{ transform: 'none' }, { transform: 'rotate(-13deg)', offset: .25 }, { transform: 'rotate(5deg)', offset: .5 }, { transform: 'none' }], { duration: 700, easing: 'ease-in-out' }); anim(R, '.gdress-grin', [{ transform: 'scale(.55,.4)' }, { transform: 'scale(1.12,1.15)', offset: .5 }, { transform: 'none' }], { duration: 480, easing: 'ease-out' }); nod(R, [{ transform: 'none' }, { transform: 'translateY(3px) scale(1.04)', offset: .4 }, { transform: 'none' }], { duration: 700, easing: 'ease-in-out' }); },
        levelup: (R) => { gaze(R, 'right'); if (R.pre) { R.pre.forEach((a) => a.cancel()); R.pre = null; } anim(R, '.gdress-b1', [{ transform: 'rotate(26deg)' }, { transform: 'rotate(-5deg)', offset: .3 }, { transform: 'rotate(0deg) scale(1.03)', offset: .42 }, { transform: 'rotate(-3deg) scale(1.05)', offset: .6 }, { transform: 'none' }], { duration: 1100, easing: 'ease-out' }); anim(R, '.gdress-toot', [{ opacity: 0 }, { opacity: 1, offset: .15 }, { opacity: 1, offset: .7 }, { opacity: 0 }], { duration: 700, delay: 380 }); nod(R, [{ transform: 'none' }, { transform: 'rotate(4deg)', offset: .35 }, { transform: 'rotate(4deg)', offset: .75 }, { transform: 'none' }], { duration: 1200, easing: 'ease-in-out' }); },
        death: (R) => { gaze(R, 'sign'); nod(R, [{ transform: 'none' }, { transform: 'translateY(4px) rotate(3deg)', offset: .3 }, { transform: 'translateY(4px) rotate(3deg)', offset: .8 }, { transform: 'none' }], { duration: 2400, easing: 'ease-in-out' }); blink(R, .9); anim(R, '.gdress-b2', [{ transform: 'none' }, { transform: 'translateY(-4px)', offset: .3 }, { transform: 'translateY(-4px)', offset: .8 }, { transform: 'none' }], { duration: 2400, easing: 'ease-in-out' }); },
        achievement: (R) => { gaze(R, 'you'); anim(R, '.gdress-cloth', [{ transform: 'none' }, { transform: 'scale(1.1,1.05) translateY(-1.5px)', offset: .3 }, { transform: 'scale(1.1,1.05) translateY(-1.5px)', offset: .8 }, { transform: 'none' }], { duration: 1900, easing: 'ease-in-out', composite: 'replace' }); nod(R, [{ transform: 'none' }, { transform: 'translateY(-3px) rotate(-3deg)', offset: .3 }, { transform: 'translateY(-3px) rotate(-3deg)', offset: .8 }, { transform: 'none' }], { duration: 1900, easing: 'ease-in-out' }); blink(R, .88); },
      };
      const IDLE = {
        superb: (R) => toot(R, 800),
        calibrating: (R) => anim(R, '.gdress-b1', [{ transform: 'none' }, { transform: 'rotate(-10deg)' }, { transform: 'rotate(6deg)' }, { transform: 'rotate(-10deg)' }, { transform: 'none' }], { duration: 640, easing: 'ease-in-out' }),
        meh: (R) => { if (Math.random() < .5) BIZ.meh(R); },
        great: (R) => anim(R, '.gdress-glint', [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'scale(1.1)', offset: .4 }, { opacity: 0, transform: 'scale(.6)' }], { duration: 520 }),
        good: (R) => { if (Math.random() < .5) nod(R, [{ transform: 'none' }, { transform: 'translateY(3px) rotate(1.5deg)', offset: .4 }, { transform: 'none' }], { duration: 380, easing: 'ease-in-out' }); },
        pvp: (R) => anim(R, '.gdress-b1', [{ transform: 'none' }, { transform: 'rotate(-6deg)', offset: .4 }, { transform: 'none' }], { duration: 600, easing: 'ease-in-out' }),
        levelup: (R) => { anim(R, '.gdress-b1', [{ transform: 'none' }, { transform: 'rotate(-4deg) scale(1.04)', offset: .3 }, { transform: 'none' }], { duration: 500 }); anim(R, '.gdress-toot', [{ opacity: 0 }, { opacity: 1, offset: .2 }, { opacity: 1, offset: .7 }, { opacity: 0 }], { duration: 500 }); },
      };
      function business(R) { if (!ctx.reduced && BIZ[R.mood]) BIZ[R.mood](R); }

      // a new kill joined with a better rating: a quick duck below the rim and up in the new outfit
      function change(R, mood) {
        if (mood === R.mood) return;
        if (ctx.reduced) { dress(R, mood); return; }
        R.mood = mood;
        const dn = [{ transform: 'none' }, { transform: 'translateY(118px)' }];
        R.handsG.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, fill: 'forwards' });
        R.overG.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, fill: 'forwards' });
        R.duck.animate(dn, { duration: 190, easing: 'ease-in', fill: 'forwards' }).onfinish = () => {
          if (R.dead) return;
          dress(R, R.mood);
          R.duck.animate([{ transform: 'translateY(118px)' }, { transform: 'translateY(-6px)', offset: .6 }, { transform: 'translateY(2px)', offset: .82 }, { transform: 'none' }], { duration: 360, easing: 'ease-out', fill: 'forwards' });
          R.handsG.animate([{ opacity: 0 }, { opacity: 0, offset: .6 }, { opacity: 1 }], { duration: 330, fill: 'forwards' });
          R.overG.animate([{ opacity: 0 }, { opacity: 0, offset: .6 }, { opacity: 1 }], { duration: 330, fill: 'forwards' });
          R.later(() => business(R), 380);
        };
      }

      return {
        show(n) {
          const R = build(n);
          // measure the board, so the flight knows how tall the rig is
          R.root.style.visibility = 'hidden'; ctx.front.append(R.root);
          const h = R.root.offsetHeight + 10; R.root.remove(); R.root.style.visibility = '';
          if (R.mood === 'levelup' && !ctx.reduced) R.pre = anim(R, '.gdress-b1', [{ transform: 'rotate(26deg)' }, { transform: 'rotate(26deg)' }], { duration: 1, fill: 'forwards' });
          const flight = ctx.fly(R.root, { w: 200, h, frame: (f) => pose(R, f) });
          R.end = () => { R.dead = true; R.tm.forEach(clearTimeout); flight.end(); live.delete(R); };
          live.add(R); life(R);
          flight.gone.then(() => { R.dead = true; R.tm.forEach(clearTimeout); live.delete(R); });
          return {
            update(m) {
              if (R.dead) return;
              paint(R.sign, m);
              R.sign.classList.remove('gdress-wet'); void R.sign.offsetWidth; R.sign.classList.add('gdress-wet');
              R.thv += (Math.random() < .5 ? -1 : 1) * 190;
              change(R, F[m.mood] ? m.mood : 'calibrating');
              flight.extend(700);
            },
          };
        },
        still(n) {
          const R = build(n), box = E('div', 'gdress-still');
          box.append(R.root);
          if (!ctx.reduced) {
            life(R);
            const t0 = performance.now() - R.u * 900;
            const tick = (now) => {
              if (R.dead) return;
              if (R.root.isConnected) R.seen = true; else if (R.seen) { R.dead = true; return; }
              const t = now - t0;
              pose(R, { lean: Math.sin(t * .0007) * 1.3, swing: Math.sin(t * .0011 + 1) * 2.4, phase: 'still', burn: .15 + .1 * Math.max(0, Math.sin(t * .0004)) });
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }
          return box;
        },
        clear() { for (const R of [...live]) R.end(); },
      };
    },
  });
})();
