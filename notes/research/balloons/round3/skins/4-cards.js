// Round 3, direction 4: "The Cards". An unseen hand deals a card from an old
// fortune-teller's deck: it slides in face down from the right, turns over and
// lies there. Hand-coloured woodcut faces in the Marseille manner; a slip of
// paper tucked under the card carries the reading.
(() => {
  const W = 154, H = 250;
  const enc = (s) => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
  const f = (n) => +n.toFixed(1);

  // ---- printed matter that is the same on every card (data URIs) ----
  const BACK = enc(`<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}'><defs>
<filter id='w' x='-5%' y='-5%' width='110%' height='110%'><feTurbulence type='fractalNoise' baseFrequency='.11' numOctaves='2' seed='5' result='n'/><feDisplacementMap in='SourceGraphic' in2='n' scale='1.5' xChannelSelector='R' yChannelSelector='G'/></filter>
<pattern id='p' width='13' height='13' patternUnits='userSpaceOnUse' x='12' y='14.5'><path d='M0,6.5L6.5,0L13,6.5L6.5,13Z' fill='none' stroke='#2b3c5c' stroke-width='1.15'/><path d='M6.5,2.9L7.5,5.5L10.1,6.5L7.5,7.5L6.5,10.1L5.5,7.5L2.9,6.5L5.5,5.5Z' fill='#9a3a2a'/><circle r='1.5' fill='#2b3c5c'/><circle cx='13' r='1.5' fill='#2b3c5c'/><circle cy='13' r='1.5' fill='#2b3c5c'/><circle cx='13' cy='13' r='1.5' fill='#2b3c5c'/></pattern></defs>
<g filter='url(#w)'><rect x='4.6' y='4.6' width='144.8' height='240.8' rx='5.5' fill='none' stroke='#2b3c5c' stroke-width='1.7'/><rect x='8' y='8' width='138' height='234' rx='3' fill='none' stroke='#9a3a2a' stroke-width='1'/>
<rect x='12' y='14.5' width='130' height='221' fill='url(#p)' stroke='#2b3c5c' stroke-width='1.2'/>
<circle cx='77' cy='125' r='24' fill='#dccb9d' stroke='#2b3c5c' stroke-width='1.4'/><circle cx='77' cy='125' r='20.4' fill='none' stroke='#9a3a2a' stroke-width='.9'/><circle cx='77' cy='125' r='22.2' fill='none' stroke='#2b3c5c' stroke-width='1.3' stroke-dasharray='.1 3.4' stroke-linecap='round'/>
<path d='M77,107L80.4,117L89.7,112.3L85,121.6L95,125L85,128.4L89.7,137.7L80.4,133L77,143L73.6,133L64.3,137.7L69,128.4L59,125L69,121.6L64.3,112.3L73.6,117Z' fill='#9a3a2a' stroke='#2b3c5c' stroke-width='1'/><path d='M77,107V143M59,125H95M64.3,112.3L89.7,137.7M89.7,112.3L64.3,137.7' stroke='#2b3c5c' stroke-width='.6'/><circle cx='77' cy='125' r='3.4' fill='#dccb9d' stroke='#2b3c5c' stroke-width='1'/></g></svg>`);
  // foxing and stains on the stock
  const PAPER = enc(`<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'><filter id='s' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.014 .022' numOctaves='3' seed='11'/><feColorMatrix values='0 0 0 0 .42 0 0 0 0 .27 0 0 0 0 .1 1.4 0 0 0 -.72'/></filter><filter id='g' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2' seed='4'/><feColorMatrix values='0 0 0 0 .3 0 0 0 0 .2 0 0 0 0 .1 .6 0 0 0 -.27'/></filter><rect width='100%' height='100%' filter='url(#s)'/><rect width='100%' height='100%' filter='url(#g)'/></svg>`);
  // ink that did not take: paper-coloured specks over the print
  const WEAR = enc(`<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'><filter id='s' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.4' numOctaves='2' seed='23'/><feColorMatrix values='0 0 0 0 .9 0 0 0 0 .83 0 0 0 0 .66 14 0 0 0 -10.5'/></filter><rect width='100%' height='100%' filter='url(#s)'/></svg>`);

  Harness.css('cards', `
.cards-root{position:absolute;width:${W}px;--cards-paper:#e8d7aa;--cards-lite:#f1e4c0;--cards-slip:#e9dfc4;--cards-ink:#221a12;--cards-shade:rgba(0,0,0,.62);
  --cards-vig:radial-gradient(ellipse 85% 75% at 46% 40%,rgba(255,206,120,.14),rgba(110,58,14,.12) 55%,rgba(52,24,6,.36) 100%);--cards-r:#a8412d;--cards-o:#cb9a37;--cards-b:#5f8d83;--cards-gold:#d2a233}
.cards-root[data-sky=dusk]{--cards-paper:#e2cd9d;--cards-slip:#e8d9bb;--cards-shade:rgba(14,8,20,.6);--cards-vig:radial-gradient(ellipse 85% 75% at 46% 40%,rgba(255,190,130,.12),rgba(120,50,30,.1) 55%,rgba(70,26,24,.4) 100%)}
.cards-root[data-sky=day]{--cards-paper:#d9c89c;--cards-lite:#e4d6ae;--cards-slip:#ddd3b6;--cards-shade:rgba(8,24,44,.42);--cards-vig:radial-gradient(ellipse 90% 80% at 50% 45%,rgba(90,70,40,.05),rgba(60,50,40,.1) 60%,rgba(40,40,50,.26) 100%)}
.cards-root[data-sky=overcast]{--cards-paper:#d3c59e;--cards-lite:#ded2ae;--cards-slip:#d6ceb4;--cards-shade:rgba(10,14,20,.46);--cards-vig:radial-gradient(ellipse 90% 80% at 50% 45%,rgba(70,70,70,.06),rgba(50,52,58,.12) 60%,rgba(34,38,46,.3) 100%)}
.cards-still{position:relative;width:226px;padding:8px 0 4px}
.cards-still .cards-root{position:relative;margin:0 auto}
.cards-stack{position:relative;z-index:1;width:${W}px;height:${H}px}
.cards-card{position:absolute;inset:0;transform-origin:50% 88%;will-change:transform}
.cards-sh{position:absolute;inset:4px 3px 0;border-radius:10px;box-shadow:1px 4px 7px var(--cards-shade),0 1px 2px var(--cards-shade)}
.cards-flip{position:absolute;inset:0;transform-style:preserve-3d}
.cards-face,.cards-back{position:absolute;inset:0;border-radius:8px 9px 8px 10px;overflow:hidden;backface-visibility:hidden;-webkit-backface-visibility:hidden;background-color:var(--cards-paper);box-shadow:inset 0 0 0 .6px rgba(60,38,12,.55)}
.cards-back{transform:rotateY(180deg);background-image:${BACK}}
.cards-face::before{content:"";position:absolute;inset:0;background:${PAPER}}
.cards-face::after,.cards-back::after{content:"";position:absolute;inset:0;z-index:5;border-radius:inherit;
  background:radial-gradient(circle at 0 0,rgba(244,232,200,.85),transparent 13px),radial-gradient(circle at 100% 0,rgba(244,232,200,.7),transparent 10px),radial-gradient(circle at 100% 100%,rgba(244,232,200,.85),transparent 14px),radial-gradient(circle at 0 100%,rgba(244,232,200,.7),transparent 11px),${WEAR},var(--cards-vig);
  box-shadow:inset 0 0 9px rgba(96,58,16,.4),inset 0 0 2px rgba(60,34,8,.5)}
.cards-face svg{position:absolute;display:block;overflow:visible}
.cards-frame{left:0;top:0}
.cards-pic{left:10px;top:32px}
.cards-i{fill:none;stroke:var(--cards-ink);stroke-width:1.35;stroke-linejoin:round;stroke-linecap:round}
.cards-h{fill:none;stroke:var(--cards-ink);stroke-width:.7;stroke-linecap:round}
.cards-k{fill:var(--cards-ink)}
.cards-f{fill:var(--cards-paper)}
.cards-fl{fill:var(--cards-lite)}
.cards-cr{fill:var(--cards-r);opacity:.86}.cards-co{fill:var(--cards-o);opacity:.86}.cards-cb{fill:var(--cards-b);opacity:.82}
.cards-tb{fill:none;stroke:var(--cards-ink);stroke-linecap:round;stroke-linejoin:round}
.cards-tf{fill:none;stroke:var(--cards-paper);stroke-linecap:round;stroke-linejoin:round}
.cards-tf.cards-to{stroke:var(--cards-o)}
.cards-pk{fill:var(--cards-paper)}
.cards-gilt .cards-co{fill:var(--cards-gold);opacity:.95}
.cards-gl{fill:#fff4c6;opacity:0;animation:cards-glint 4.4s ease-in-out infinite}
@keyframes cards-glint{0%,58%{opacity:0}70%{opacity:.9}84%,100%{opacity:0}}
.cards-proof{font:italic 9.5px "IM Fell English",Georgia,serif;fill:var(--cards-ink);opacity:.75}
.cards-top,.cards-xp,.cards-name{position:absolute;color:var(--cards-ink);font-family:"IM Fell English",Georgia,serif;text-align:center}
.cards-top{left:10px;top:10px;width:134px;height:19px;display:flex;align-items:center;justify-content:center;font-size:14.5px;line-height:19px;white-space:nowrap}
.cards-num{letter-spacing:.07em}
.cards-word{font:400 13.5px/19px "IM Fell English SC",Georgia,serif;letter-spacing:.17em;margin-right:-.17em}
.cards-num:not(:empty)+.cards-word::before{content:"\\00b7";margin:0 5px 0 4px;letter-spacing:0}
.cards-xp{left:15px;top:146px;width:124px;height:25px;font:600 26px/24px "Cormorant Garamond",Georgia,serif;font-variant-numeric:lining-nums;white-space:nowrap}
.cards-xp i{font:italic 13px/1 "IM Fell English",Georgia,serif;margin-left:4px}
.cards-xp.cards-long{font-size:20px}
.cards-name{left:14px;top:179px;width:126px;height:59px;display:flex;align-items:center;justify-content:center;font-size:16px;line-height:17.5px}
.cards-name span{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;overflow-wrap:anywhere}
.cards-name.cards-tall{top:167px;height:71px}
.cards-name.cards-small{font-size:14px;line-height:15.5px}
.cards-name.cards-bigt{font-size:23px;line-height:26px}
.cards-name.cards-caps{font:400 21px/26px "IM Fell English SC",Georgia,serif;letter-spacing:.1em}
.cards-name.cards-capl{font:400 15.5px/20px "IM Fell English SC",Georgia,serif;letter-spacing:.14em}
.cards-slipw{position:relative;z-index:0;left:50%;width:max-content;max-width:186px;margin-top:-10px;filter:drop-shadow(0 2px 2.5px var(--cards-shade))}
.cards-slip{box-sizing:border-box;padding:14px 12px 5px;background:linear-gradient(180deg,rgba(60,36,10,.34),rgba(60,36,10,0) 15px),var(--cards-slip);color:#2a2016;font:italic 400 12.5px/15px "IM Fell English",Georgia,serif;text-align:center;text-wrap:balance;
  clip-path:polygon(0 0,100% 0,99.2% 22%,100% 48%,98.8% 74%,100% 100%,62% 97.5%,30% 100%,0 98%,1% 70%,0 44%,.9% 20%)}
.cards-slipw:has(.cards-read){max-width:222px}
.cards-slipw:has(.cards-game){margin-top:-3px}
.cards-slip.cards-game{font-size:13.5px;line-height:16px}
.cards-slip.cards-read{font-style:normal;font-size:13.5px;line-height:16.5px;padding:15px 9px 6px}
`);

  // ---- woodcut vocabulary ----
  // a shape: paper underneath, a stencil colour a little out of register, the cut line on top
  const S = (d, col, o = '1.3 -.9') => `<path class="cards-f" d="${d}"/>${col ? `<path class="cards-c${col}" transform="translate(${o})" d="${d}"/>` : ''}<path class="cards-i" d="${d}"/>`;
  const C = (x, y, r, col) => `<circle class="cards-f" cx="${x}" cy="${y}" r="${r}"/>${col ? `<circle class="cards-c${col}" cx="${x + 1.1}" cy="${y - 0.8}" r="${r}"/>` : ''}<circle class="cards-i" cx="${x}" cy="${y}" r="${r}"/>`;
  // a bone or a staff: a black stroke with a lighter one inside it
  const T = (d, w = 3.4, cls = '') => `<path class="cards-tb" stroke-width="${w}" d="${d}"/><path class="cards-tf ${cls}" stroke-width="${f(w - 1.9)}" d="${d}"/>`;
  const GUARD = 'M-10.5,-1.8Q-5,2 0,.3Q5,2 10.5,-1.8L10.8,1.7Q5,5.4 0,3.9Q-5,5.4-10.8,1.7Z';
  const hilt = (x, y, a) => `<g transform="translate(${x} ${y}) rotate(${a}) scale(1.18)">${S(GUARD, 'o', '.9 -.9')}<rect class="cards-f" x="-2.1" y="3.8" width="4.2" height="9.4"/><rect class="cards-cr" x="-1.4" y="3.4" width="4.2" height="9.4"/><path class="cards-i" d="M-2.1,4.2V12.8M2.1,4.2V12.8"/><path class="cards-h" d="M-2.1,6.6L2.1,5M-2.1,9L2.1,7.4M-2.1,11.4L2.1,9.8"/>${C(0, 15.8, 3.2, 'o')}<circle class="cards-k" cy="15.8" r="1"/></g>`;
  const sword = (x, y, a, len) => {
    let h = '';
    for (let k = 6; k < len - 14; k += 3.3) h += `M.8,${f(-k)}L3.3,${f(-k - 2.2)}`;
    const b = `M-4.3,0L-3.5,${-(len - 12)}L0,${-len}L3.5,${-(len - 12)}L4.3,0Z`;
    return `<g transform="translate(${x} ${y}) rotate(${a})"><path class="cards-f" d="${b}"/><path class="cards-cb" transform="translate(-.9 -.5)" d="M-4.3,0L-3.5,${-(len - 12)}L0,${-len}L0,0Z"/><path class="cards-i" d="${b}"/><path class="cards-h" d="M0,-1V${-(len - 5)}${h}"/></g>${hilt(x, y, a)}`;
  };
  const YOD = 'M0,-3.6Q2.8,.5 0,2.8Q-2.8,.5 0,-3.6Z';
  const yod = (x, y, col, a = 0) => `<g transform="translate(${x} ${y}) rotate(${a})"><path class="cards-c${col}" transform="translate(.9 -.7)" d="${YOD}"/><path class="cards-h" d="${YOD}"/></g>`;
  const flower = (x, y) => {
    let s = '';
    for (let i = 0; i < 5; i++) { const a = (i * 72 - 90) * Math.PI / 180; s += C(f(x + Math.cos(a) * 4.3), f(y + Math.sin(a) * 4.3), 2.9, 'r'); }
    return s + C(x, y, 2.3, 'o') + `<circle class="cards-k" cx="${x}" cy="${y}" r=".8"/>`;
  };
  const LEAF = 'M0,0Q5,-3.6 11,0Q5,3.6 0,0Z';
  const leaf = (x, y, a, col, s = 1) => `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(a)}) scale(${s})">${S(LEAF, col, '.8 -.8')}<path class="cards-h" d="M1.5,0H8.5"/></g>`;
  const sprig = (x, y, a) => `<g transform="translate(${x} ${y}) rotate(${a})"><path class="cards-i" d="M0,12Q1.5,4 0,-6"/>${leaf(0.6, 6, -38, 'b', 0.85)}${leaf(0.4, 1, -142, 'b', 0.85)}${leaf(0.4, -4, -50, 'b', 0.75)}${C(0, -8.5, 2, 'r')}</g>`;
  // a faceted star: every point half colour, half hatched
  const star = (cx, cy, R, r, n, col, glint, R2) => {
    const P = [];
    for (let i = 0; i < n * 2; i++) {
      const a = (i * 180 / n - 90) * Math.PI / 180, q = i % 2 ? r : (R2 && (i / 2) % 2 ? R2 : R);
      P.push([f(cx + Math.cos(a) * q), f(cy + Math.sin(a) * q)]);
    }
    const out = 'M' + P.map((p) => p.join(',')).join('L') + 'Z';
    let fac = '', spokes = '', gl = '';
    for (let i = 0; i < n * 2; i += 2) {
      const t = P[i], b = P[(i + 1) % (n * 2)], d = `M${cx},${cy}L${t}L${b}Z`;
      fac += `<path class="cards-c${col}" transform="translate(.9 -.7)" d="${d}"/>`;
      if (glint) gl += `<path class="cards-gl" style="animation-delay:${f(i * 0.11)}s" d="${d}"/>`;
      const a0 = P[(i + n * 2 - 1) % (n * 2)];
      // hatch the other half
      for (let k = 1; k <= (R > 12 ? 4 : 0); k++) { const u = k / 5; spokes += `M${f(cx + (t[0] - cx) * u)},${f(cy + (t[1] - cy) * u)}L${f(cx + (a0[0] - cx) * u)},${f(cy + (a0[1] - cy) * u)}`; }
      spokes += `M${cx},${cy}L${t}`;
    }
    return `<path class="cards-f" d="${out}"/>${fac}${gl}<path class="cards-h" d="${spokes}"/><path class="cards-i" d="${out}"/>`;
  };
  const SKULL = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">${S('M-15,-2Q-16,-21 0,-21Q16,-21 15,-2Q15,4 11,6L11,12Q11,15.5 8,15.5L-8,15.5Q-11,15.5 -11,12L-11,6Q-15,4 -15,-2Z', '')}
<path class="cards-k" d="M-10.6,-3.5Q-10.6,-8 -6.4,-8Q-2.4,-8 -2.4,-3.6Q-2.4,.9 -6.4,.9Q-10.6,.9 -10.6,-3.5ZM2.4,-3.6Q2.4,-8 6.4,-8Q10.6,-8 10.6,-3.5Q10.6,.9 6.4,.9Q2.4,.9 2.4,-3.6ZM0,2L-2.4,7.6L2.4,7.6Z"/>
<path class="cards-h" d="M-8.6,10.6H8.6M-5.8,8.4V15M-2.9,8.6V15.4M0,8.8V15.4M2.9,8.6V15.4M5.8,8.4V15M11.6,-9L13.6,-7M11.2,-12.4L14,-9.8M10.2,-15.4L13.6,-12.6M8.4,-18L12.4,-15.2M-13.6,-1L-11.8,1.6M-13,2.4L-11.4,4.4"/></g>`;
  const fan = (cx, y, angs, len, step) => angs.map((a, i) => [a, i]).sort((p, q) => Math.abs(q[0]) - Math.abs(p[0])).map(([a, i]) => sword(f(cx + (i - (angs.length - 1) / 2) * step), f(y - Math.abs(a) * 0.12), a, len - Math.abs(a) * 0.18)).join('');

  const SPAN = (() => {
    let h = '';
    for (let i = 1; i < 6; i++) { const a = i * 15 * Math.PI / 180; h += `M${f(Math.cos(a) * 6)},${f(Math.sin(a) * 6)}L${f(Math.cos(a) * 15)},${f(Math.sin(a) * 15)}`; }
    const one = `<path class="cards-cr" transform="translate(.8 .8)" d="M0,0H16.5A16.5,16.5 0 0 1 0,16.5Z"/><path class="cards-co" d="M0,0H6A6,6 0 0 1 0,6Z"/><path class="cards-i" d="M16.5,0A16.5,16.5 0 0 1 0,16.5M6,0A6,6 0 0 1 0,6"/><path class="cards-h" d="${h}"/>`;
    return `<g>${one}</g><g transform="translate(134 0) scale(-1 1)">${one}</g>`;
  })();
  const PIC = {
    poor: () => {
      const b = 'M55.2,92L55.5,73.4L58,71.4L55.7,69.2L56,50L66.4,17L70.4,9.6L71.2,18.6L61.4,52L61,92Z';
      return `${SPAN}${yod(30, 26, 'r', 8)}${yod(22, 48, 'o', -6)}${yod(36, 64, 'r', 4)}${yod(18, 72, 'o', 10)}${yod(42, 14, 'o', -8)}${yod(94, 16, 'r', 6)}${yod(104, 40, 'o', -4)}${yod(88, 58, 'r', 8)}${yod(112, 64, 'o', 0)}${yod(40, 40, 'o', 4)}${yod(90, 34, 'o', -8)}
<path class="cards-f" d="${b}"/><path class="cards-cb" transform="translate(-.9 -.4)" d="M55.2,92L55.5,73.4L58,71.4L55.7,69.2L56,50L66.4,17L70.4,9.6L67.6,24L58.4,52L58.2,92Z"/><path class="cards-i" d="${b}"/>
<path class="cards-h" d="M58.2,90L58.4,52L67.6,24M59,86L60.6,84.2M59,82L60.6,80.2M59,78L60.6,76.2M59,74L60.6,72.2M59,70L60.6,68.2M59,66L60.6,64.2M59,62L60.6,60.2M59,58L60.6,56.2M59.4,53.4L61,52M60.6,49.4L62.4,48.4M61.8,45.4L63.6,44.4M63,41.4L64.8,40.4M64.2,37.4L66,36.4M65.4,33.4L67.2,32.4M66.6,29.4L68.4,28.4M67.8,25.4L69.6,24.4"/>
${hilt(58.2, 92, -3)}
<path class="cards-h" d="M78,107.6H126M82,110H96M104,110.2H122M80,105.4L78.6,102.6M82.4,105.6L82.6,102M124,105.6L125.4,102.6"/>
<path class="cards-i" d="M92.6,105.6Q84,106.4 82.4,100.4Q81.4,96 85.6,94.6"/>
${S('M92,106.4Q91.4,97.6 100.6,96.2Q110,95 113.4,100.6Q115.2,103.4 118,104.8L114,106.6Z', 'o', '.8 -.8')}${C(107.6, 96.4, 2.7, '')}
<circle class="cards-k" cx="112.6" cy="101.4" r=".85"/><path class="cards-h" d="M117,104.2L121.4,102.4M117.2,105.4L121.6,106.2M95,99.6L96.6,103M98,98L99.6,101.6M101,97.2L102.6,100.8M96,106.4V108M110,106.6V108"/>`;
    },
    meh: () => `${SPAN}${flower(67, 15)}${sprig(15, 54, -8)}${sprig(119, 54, 8)}${sword(35, 90, 33, 78)}${sword(99, 90, -33, 78)}${yod(67, 84, 'o')}${yod(67, 97, 'r')}`,
    good: () => `${SPAN}${sprig(13, 50, -10)}${sprig(121, 50, 10)}${sword(34, 88, 35, 76)}${sword(100, 88, -35, 76)}${sword(67, 94, 0, 84)}${yod(44, 22, 'o', -10)}${yod(90, 22, 'r', 10)}`,
    great: () => `${SPAN}${flower(67, 13)}${fan(67, 95, [-33, -11, 11, 33], 80, 13)}${yod(14, 84, 'o', -8)}${yod(120, 84, 'r', 8)}`,
    superb: () => {
      let rays = '';
      for (let i = -8; i <= 8; i++) { if (!i) continue; const a = (i * 10.5 - 90) * Math.PI / 180, r0 = 19, r1 = i % 2 ? 31 : 39; rays += `M${f(67 + Math.cos(a) * r0)},${f(33 + Math.sin(a) * r0)}L${f(67 + Math.cos(a) * r1)},${f(33 + Math.sin(a) * r1)}`; }
      const crown = 'M53.6,40L52,27.6L59,33.6L62,24.4L67,31.6L72,24.4L75,33.6L82,27.6L80.4,40Z', band = 'M53.4,40H80.6V45H53.4Z';
      return `<path class="cards-h" style="stroke:var(--cards-gold);stroke-width:1.5" transform="translate(.8 -.6)" d="${rays}"/><path class="cards-h" d="${rays}"/>
${fan(67, 96, [-35, -17, 0, 17, 35], 82, 11.5)}
${S(crown, 'o', '.9 -.8')}<path class="cards-gl" d="${crown}"/>${S(band, 'r', '.9 -.8')}<path class="cards-h" d="M57,42.5h.1M62,42.5h.1M67,42.5h.1M72,42.5h.1M77,42.5h.1" style="stroke-width:1.6"/>
${C(52, 26.6, 1.7, 'o')}${C(62, 23.2, 1.7, 'o')}${C(72, 23.2, 1.7, 'o')}${C(82, 26.6, 1.7, 'o')}
<path class="cards-f" d="M64.4,31L67,13L69.6,31Z"/><path class="cards-cb" d="M64,30.6L66.4,13L67,30.6Z"/><path class="cards-i" d="M64.6,30L67,13L69.4,30"/><path class="cards-h" d="M67,16V30"/>`;
    },
    calibrating: () => `<path class="cards-h" d="M67,43V71M53,57H81" opacity=".8"/><circle class="cards-h" cx="67" cy="57" r="7" opacity=".8"/><path class="cards-h" opacity=".6" d="M6,6h7M6,6v7M128,6h-7M128,6v7M6,108h7M6,108v-7M128,108h-7M128,108v-7"/><text class="cards-proof" x="67" y="88" text-anchor="middle">proof</text>`,
    pvp: () => `<path class="cards-cr" d="M4.6,3.4H130.6V112H4.6Z"/><path class="cards-h" style="stroke:var(--cards-paper);stroke-width:.9" d="M10,10H38M96,10H124M8,16H30M104,16H126M10,22H24M110,22H124M8,28H18M116,28H126"/>
${SKULL(67, 36, 1.14)}${sword(38, 99, 45, 80)}${sword(96, 99, -45, 80)}${yod(67, 100, 'o')}`,
    levelup: () => {
      let rays = '';
      for (let i = 0; i < 16; i++) { const a = (i * 22.5 + 11.25) * Math.PI / 180; rays += `M${f(67 + Math.cos(a) * 23)},${f(47 + Math.sin(a) * 23)}L${f(67 + Math.cos(a) * 31)},${f(47 + Math.sin(a) * 31)}`; }
      return `<path class="cards-h" d="${rays}"/>${star(67, 47, 33, 9.5, 8, 'o', true, 23)}
${star(21, 15, 7.5, 3, 6, 'r')}${star(113, 15, 7.5, 3, 6, 'b')}${star(13, 50, 6.5, 2.7, 6, 'b')}${star(121, 50, 6.5, 2.7, 6, 'r')}${star(30, 80, 6.5, 2.7, 6, 'o')}${star(104, 80, 6.5, 2.7, 6, 'o')}${star(67, 90, 5.5, 2.3, 6, 'r')}
${S('M-2,112Q20,98 44,108Q68,117 92,105Q114,96 136,108V128H-2Z', 'b', '0 1.2')}
<path class="cards-h" d="M4,114Q18,106 30,108M6,119Q22,110 40,113M50,115Q66,120 84,113M58,120Q74,123 92,115M100,108Q116,104 130,110M104,113Q118,110 130,115M12,124H40M70,125H104"/>
${S('M17.6,107V91H16V86.4H19.2V88.6H21.6V86.4H24.4V88.6H26.8V86.4H30V91H28.4V108.6Z', 'r', '.9 -.8')}<path class="cards-k" d="M22,95h2v5h-2z"/><path class="cards-h" d="M16,91H30M25.6,93V107M27,93V108"/>
<path class="cards-i" d="M108,106V95"/>${S('M100.6,90Q98.6,84.6 103.4,83Q104.6,78.4 109.4,80Q114.4,78.6 115,83.6Q119,86.4 115.6,90.4Q114.6,94.6 109.6,93.4Q103.6,95.4 100.6,90Z', 'b', '.9 -.8')}<path class="cards-h" d="M104,87Q106,85 108,87M109,90Q111,88 113,90M108,84Q110,82.4 112,84"/>
<path class="cards-k" d="M106.4,79.6Q107,76.6 109.6,76.8L111.6,75.6L111,77.6Q112,79.6 109.6,80.2Z"/>`;
    },
    death: () => {
      let ribs = '', vert = '';
      for (let i = 0; i < 5; i++) { const y = 47.5 + i * 5.2, w = 12.5 - i * 0.9; ribs += T(`M57.6,${f(y)}Q${f(58 - w)},${f(y - 1.6)} ${f(58 - w - 0.6)},${f(y + 4)}`, 3) + T(`M59.4,${f(y)}Q${f(59 + w)},${f(y - 1.6)} ${f(59 + w + 0.6)},${f(y + 4)}`, 3); }
      for (let y = 45; y < 75; y += 3.6) vert += `M57,${f(y)}h3`;
      return `<path class="cards-h" d="M84,62H128M90,66H126M96,70H130M88,74H120M4,78H22M2,82H18M6,86H20M100,58H124" opacity=".75"/>
${T('M23,119L36.4,8', 3.8, 'cards-to')}
${S('M35.4,5.4Q72,-5.6 108,15Q72,5 36.6,12.6Z', 'b', '.9 .9')}<path class="cards-h" d="M44,6.4L45,9.6M52,4.8L53,8M60,4L61,7M68,4L69,6.8M76,5L76.8,7.6M84,6.8L84.6,9M92,9.4L92.4,11"/>
${T('M59.6,35L58.6,43', 3.6)}${T('M58.6,43L58.2,76', 4)}<path class="cards-h" d="${vert}"/>
${T('M45.6,43.6Q58.6,40 71.6,43.6', 3.4)}${ribs}
${S('M48.4,76.4Q58,72 68,76.4Q69.4,84.4 62.4,86.6L58.2,82.2L54,86.6Q47,84.4 48.4,76.4Z', '')}<path class="cards-k" d="M52,78.4Q54.6,77.4 55.6,79.6Q54.4,82 52.4,81ZM64.4,78.4Q61.8,77.4 60.8,79.6Q62,82 64,81Z"/>
${T('M53,86L49,101.6')}${T('M49,101.6L46.4,116')}${T('M46.4,116.4L38.6,118', 3)}${T('M63.4,86L68,101.6')}${T('M68,101.6L70,116')}${T('M70,116.4L78,118', 3)}
${C(49, 101.6, 2.3, '')}${C(68, 101.6, 2.3, '')}
${T('M45.6,43.6L37.6,56')}${T('M37.6,56L30.6,65.4')}${T('M71.6,43.6L83.6,54.6')}${T('M83.6,54.6L92.4,46.4')}
${C(37.6, 56, 2.1, '')}${C(83.6, 54.6, 2.1, '')}
<path class="cards-i" d="M27.4,63.4L32.8,62.4M27,66L32.6,65M26.8,68.6L32.2,67.6"/>
<g transform="translate(60.6 24)">${S('M-11.6,-.4Q-12,-12.6 0,-12.6Q11.6,-12.6 11.6,-1Q11.6,3.4 9.4,5.2L9.4,9.6Q9.4,12 7,12L-3.4,12Q-6,12 -6,9.4L-6,7Q-11.6,5.6 -11.6,-.4Z', '')}
<path class="cards-k" d="M-3.4,-.6Q-3.4,-4 -.4,-4Q2.4,-4 2.4,-.6Q2.4,2.6 -.4,2.6Q-3.4,2.6 -3.4,-.6ZM4.6,-.8Q4.6,-3.8 7,-3.8Q9.4,-3.8 9.4,-.8Q9.4,2.2 7,2.2Q4.6,2.2 4.6,-.8ZM4,3.4L2.2,7L5.6,7Z"/>
<path class="cards-h" d="M-4,8.8H9M-1.6,7.6V11.8M1,7.8V12M3.6,7.8V12M6.2,7.6V11.8M-9.6,-5L-7.4,-2.6M-9,-8.4L-6,-5.2M-7,-10.6L-4,-7.6"/></g>
<path class="cards-i" d="M91,46.4H105M91,23.6H105M92.4,23.6V46.4M103.6,23.6V46.4" style="stroke-width:1.7"/><path class="cards-co" d="M91.6,22.4H106V25H91.6ZM91.6,45.2H106V47.8H91.6Z"/>
${S('M94,24.6H102L98.7,35L102,45.4H94L97.3,35Z', '')}<path class="cards-k" d="M95,45L98,39.4L101,45ZM95.4,25.6H100.6L98,29Z"/><path class="cards-h" d="M98,30.6V38" stroke-dasharray=".4 1.6"/>
<path class="cards-i" d="M90.4,44.6L94.6,43M90,47.4L94.4,46.4"/>
<path class="cards-k" d="M-2,119.4Q18,116.4 40,118.6T82,118.2T136,117.2V130H-2Z"/>
<path class="cards-tf" style="stroke-width:.9" d="M8,122.6L9.4,125M12,122L12.4,125M56,122.4L57,125M60,122L60.2,124.6M126,121.6L125,124.4M88,123H96M24,124.6H34"/>
<path class="cards-k" d="M97.6,119Q94.4,107 100.6,101.4L99.8,94.6L103.2,97.8L107.2,97.8L110.6,94.6L109.8,101.4Q114.6,107 112.4,119Z"/><path class="cards-tb" style="stroke-width:2.4" d="M112,116.6Q122.6,116.6 121.4,108"/>
<circle class="cards-pk" cx="103" cy="101" r=".95"/><circle class="cards-pk" cx="107" cy="101" r=".95"/>`;
    },
    achievement: () => {
      let lv = '';
      const N = 13, cx = 67, cy = 60, rx = 43, ry = 47;
      for (const side of [-1, 1]) for (let i = 0; i < N; i++) {
        const t = (12 + i * (158 / (N - 1))) * Math.PI / 180;
        const ex = cx + side * rx * Math.sin(t), ey = cy + ry * Math.cos(t);
        const tang = Math.atan2(-ry * Math.sin(t), side * rx * Math.cos(t)) * 180 / Math.PI;
        lv += leaf(ex, ey, tang + side * 30, i % 2 ? 'b' : 'o', 1.02) + leaf(ex, ey, tang - side * 32, i % 2 ? 'o' : 'b', 0.9);
        if (i % 3 === 1) lv += C(f(ex), f(ey), 1.7, 'r');
      }
      return `${star(13, 12, 6.5, 2.7, 6, 'r')}${star(121, 12, 6.5, 2.7, 6, 'r')}${star(11, 114, 6, 2.5, 6, 'o')}${star(123, 114, 6, 2.5, 6, 'o')}
${lv}
${S('M67,108Q58,100 52.6,106.4Q50,111.6 56,113Q62,113.4 67,108Q72,113.4 78,113Q84,111.6 81.4,106.4Q76,100 67,108Z', 'r', '.9 -.8')}${S('M64.6,109.6L58,123.4L62.4,121L64,125.4L67.6,110Z', 'r', '.9 -.8')}${S('M69.4,109.6L76,123.4L71.6,121L70,125.4L66.4,110Z', 'r', '.9 -.8')}${C(67, 108.4, 2.4, 'o')}
${T('M67,47V28', 4.4, 'cards-to')}${T('M60.4,34H73.6', 4.4, 'cards-to')}
${C(67, 64, 17, '')}<path class="cards-cb" d="M50.6,66.6H85.4Q84.6,81.6 68,82Q51.6,81.6 50.6,66.6Z"/><circle class="cards-gl" cx="67" cy="64" r="17" style="opacity:0"/>
<path class="cards-f" d="M50.2,61.4H83.8V66.6H50.2ZM64.4,47.2H69.6V61.4H64.4Z"/><path class="cards-co" d="M51,60.8H85V66H51ZM65.2,46.6H70.4V61H65.2Z"/>
<path class="cards-i" d="M50.2,61.4H83.8M50.2,66.6H83.8M64.4,47.4V61.4M69.6,47.4V61.4"/><circle class="cards-i" cx="67" cy="64" r="17"/>
<path class="cards-h" d="M76,70Q79.4,69 81.6,69.6M74,73.4Q78.6,72.4 80.6,73M71,76.8Q76,76 78.4,76.4M67.6,79.6Q72,79.6 74.4,79M73,50.6Q78,53 80.6,58M74.6,54Q77.6,56 79,59.6"/>`;
    },
  };

  const NUM = { poor: 'I', meh: 'II', good: 'III', great: 'IIII', superb: 'V', calibrating: '', pvp: 'VII', levelup: 'XVII', death: 'XIII', achievement: 'XXI' };
  const LINE = {
    poor: 'the cards are seldom wrong about mice', meh: 'the cards decline to comment', good: 'a fair hand, fairly played',
    great: 'the fortune-teller sits up', superb: 'even the fortune-teller did not see that coming',
    calibrating: 'the printer has not got to this one yet', pvp: 'somebody else’s cards were worse',
    levelup: 'the stars approve, for once', death: 'you will meet a tall dark stranger; you already have',
  };
  const ORN = (x, y) => `<path class="cards-k" d="M${x},${y - 3.4}L${x + 0.9},${y - 0.9}L${x + 3.4},${y}L${x + 0.9},${y + 0.9}L${x},${y + 3.4}L${x - 0.9},${y + 0.9}L${x - 3.4},${y}L${x - 0.9},${y - 0.9}Z"/>`;
  const FLOUR = (y, s) => `<path class="cards-h" d="M52,${y}H68M86,${y}H102M30,${y}Q38,${y - 3 * s} 46,${y}M108,${y}Q116,${y - 3 * s} 124,${y}"/><path class="cards-k" d="M77,${y - 2.6}L79.6,${y}L77,${y + 2.6}L74.4,${y}Z"/>`;
  const frame = (n) => {
    const kill = n.kind === 'kill', tint = n.mood === 'pvp' ? 'r' : n.mood === 'death' ? '' : n.mood === 'calibrating' ? '' : 'o';
    return `<g filter="url(#cards-w)">${tint ? `<rect class="cards-c${tint}" x="11.4" y="9" width="134" height="19"/>` : ''}
<rect class="cards-i" x="4.4" y="4.4" width="145.2" height="241.2" rx="5.5" style="stroke-width:1.7"/><rect class="cards-h" x="7.3" y="7.3" width="139.4" height="235.4" rx="3"/>
<rect class="cards-i" x="10" y="10" width="134" height="19" style="stroke-width:1.15"/><rect class="cards-i" x="10" y="32" width="134" height="128" style="stroke-width:1.25"/>
<rect class="cards-i" x="10" y="${kill ? 177 : 165}" width="134" height="${kill ? 63 : 75}" style="stroke-width:1.15"/><rect class="cards-h" x="12.6" y="${kill ? 179.6 : 167.6}" width="128.8" height="${kill ? 57.8 : 69.8}"/>
${ORN(18.5, 19.5)}${ORN(135.5, 19.5)}
${kill ? `${S('M17,151.6L5.4,153.4L10.6,162.4L5.4,173.4L17,174.6Z', 'o', '.6 -.6')}${S('M137,151.6L148.6,153.4L143.4,162.4L148.6,173.4L137,174.6Z', 'o', '.6 -.6')}
<path class="cards-h" d="M8.6,155.4L15.6,154.4M10.6,158.4L15.6,157.6M11,166.6L15.6,166M9.2,169.8L15.6,169M145.4,155.4L138.4,154.4M143.4,158.4L138.4,157.6M143,166.6L138.4,166M144.8,169.8L138.4,169"/>
<path class="cards-k" d="M17,171.2V174.8L12.6,171.8ZM137,171.2V174.8L141.4,171.8Z"/>
<path class="cards-fl" d="M13.4,146.4Q77,143.4 140.6,146.4V171.4Q77,168.4 13.4,171.4Z"/><path class="cards-i" d="M13.4,146.4Q77,143.4 140.6,146.4V171.4Q77,168.4 13.4,171.4Z"/>
<path class="cards-h" d="M15.6,149.4V169M17.6,150V168.4M138.4,149.4V169M136.4,150V168.4"/>` : `${FLOUR(178, 1)}${FLOUR(227.5, -1)}`}</g>`;
  };

  Harness.register({
    id: 'cards',
    name: 'The Cards',
    blurb: 'Fate deals you a card. It slides in face down, turns over and lies there: a hand-coloured woodcut from an old fortune-teller’s deck, swords for kills, with the reading on a slip tucked under it. The fortune-teller is as surprised as you are.',
    create(ctx) {
      const el = ctx.el;
      if (!document.getElementById('cards-defs')) {
        const d = ctx.svg(`<svg id="cards-defs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs><filter id="cards-w" x="-6%" y="-6%" width="112%" height="112%"><feTurbulence type="fractalNoise" baseFrequency=".085" numOctaves="2" seed="9" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.7" xChannelSelector="R" yChannelSelector="G"/></filter></defs></svg>`);
        document.body.append(d);
      }

      function face(n) {
        const mood = PIC[n.mood] ? n.mood : 'calibrating';
        const fc = el('div', 'cards-face'); fc.dataset.mood = mood;
        const pic = ctx.svg(`<svg class="cards-pic${mood === 'superb' || mood === 'levelup' || mood === 'achievement' ? ' cards-gilt' : ''}" width="134" height="128" viewBox="0 0 134 128"><clipPath id="cards-clip-${mood}"><rect x="-1" y="-1" width="136" height="130"/></clipPath><g clip-path="url(#cards-clip-${mood})"><g filter="url(#cards-w)">${PIC[mood]()}</g></g></svg>`);
        const fr = ctx.svg(`<svg class="cards-frame" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${frame(n)}</svg>`);
        const top = el('div', 'cards-top');
        top.append(el('span', 'cards-num', NUM[mood]));
        if (n.kind === 'kill' && n.label) top.append(el('span', 'cards-word', n.label));
        fc.append(pic, fr, top);
        const name = el('div', 'cards-name' + (n.kind === 'kill' ? '' : ' cards-tall'));
        if (n.kind === 'kill') {
          const xp = el('div', 'cards-xp' + (n.big.length > 7 ? ' cards-long' : ''));
          xp.append(document.createTextNode(n.big));
          if (n.unit) xp.append(el('i', '', n.unit));
          fc.append(xp);
          name.append(el('span', '', n.title));
          if (n.title.length > 34) name.classList.add('cards-small');
        } else if (n.kind === 'achievement') {
          name.classList.add('cards-capl'); name.append(el('span', '', n.label));
        } else {
          name.classList.add(n.kind === 'death' ? 'cards-caps' : 'cards-bigt'); name.append(el('span', '', n.big));
        }
        fc.append(name);
        return fc;
      }
      function card(n) {
        const c = el('div', 'cards-card'), flip = el('div', 'cards-flip'), sh = el('div', 'cards-sh');
        flip.append(el('div', 'cards-back'), face(n)); c.append(sh, flip);
        return { el: c, flip, sh, t: 'translate(0px,0px) rotate(0deg)' };
      }
      // what the slip says: the achievement, the joined names, or a dry word of the deck's own
      function slipText(n) {
        if (n.kind === 'achievement') return [n.title, 'cards-read'];
        if (n.more) return [n.more, 'cards-game'];
        return [LINE[n.mood] || '', ''];
      }
      const slipT = (n, seed) => `translateX(${n.kind === 'achievement' || n.more ? -50 : -47 - (seed % 3) * 3}%) rotate(${n.kind === 'achievement' ? -1.4 : 1.2 + (seed % 4) * 0.5}deg)`;
      function setSlip(P, n) {
        const [text, cls] = slipText(n);
        P.slip.className = 'cards-slip ' + cls; P.slip.textContent = text;
        P.slipw.style.display = text ? '' : 'none';
        P.slipT = slipT(n, P.seed); P.slipw.style.transform = P.slipT;
      }
      function pile(n, seed) {
        const root = el('div', 'cards-root'), stack = el('div', 'cards-stack'), slipw = el('div', 'cards-slipw'), slip = el('div', 'cards-slip');
        root.dataset.sky = ctx.skyMode(); slipw.append(slip); root.append(stack, slipw);
        const P = { root, stack, slipw, slip, cards: [], seed, timers: [] };
        setSlip(P, n);
        return P;
      }
      const fanT = (d) => `translate(${-6 * d}px,${-1 * d}px) rotate(${-3.1 * d}deg)`;

      function still(n) {
        const box = el('div', 'cards-still'), P = pile(n, n.title.length + n.big.length);
        const k = Math.min(4, n.count || 1);
        for (let d = k - 1; d >= 0; d--) { const c = card(n); c.el.style.transform = fanT(d); P.stack.append(c.el); }
        P.root.style.transform = `rotate(${k > 1 ? 2.5 : n.kind === 'death' ? 1.6 : -1.8}deg)`;
        if (k > 1) { P.root.style.left = '22px'; P.slipw.style.marginLeft = '-22px'; }
        box.append(P.root);
        return box;
      }

      // ---- the table: up to three piles in a loose row low in the lane ----
      const live = new Set(), queue = [];
      let slots = [], poll = 0, dealt = 0;
      const sync = () => { const m = ctx.skyMode(); for (const P of live) P.root.dataset.sky = m; if (!live.size) { clearInterval(poll); poll = 0; } };
      const SLIDE = 440, FLIP = 560, READ = 6000;
      const flipKF = (from, to) => [
        { transform: `perspective(900px) translateY(0px) translateZ(0px) rotateY(${from}deg)`, easing: 'cubic-bezier(.4,0,.7,.6)' },
        { transform: `perspective(900px) translateY(-12px) translateZ(60px) rotateY(${(from + to) / 2}deg)`, offset: 0.46, easing: 'cubic-bezier(.2,.5,.4,1)' },
        { transform: `perspective(900px) translateY(-5px) translateZ(22px) rotateY(${to}deg)`, offset: 0.82, easing: 'ease-in' },
        { transform: `perspective(900px) translateY(0px) translateZ(0px) rotateY(${to}deg)` },
      ];
      const shKF = [{ transform: 'none', opacity: 1 }, { transform: 'translate(9px,17px) scaleX(.12)', opacity: 0.4, offset: 0.46 }, { transform: 'translate(4px,7px) scaleX(1.02)', opacity: 0.7, offset: 0.82 }, { transform: 'none', opacity: 1 }];

      function start(Hd, slot) {
        const p = ctx.pace() || 1, L = ctx.lane(), n = Hd.n, seed = ++dealt;
        const cnt = slots.length, step = Math.min(204, (L.w - 16) / cnt);
        const x = L.x0 + (L.w - cnt * step) / 2 + (step - W) / 2 + slot * step;
        const y = Math.max(6, L.bottom - H - 84 - [0, 16, 5][slot % 3]);
        const ang = [-3.2, 2.4, -1.4][slot % 3] + ((seed * 37) % 5 - 2) * 0.45;
        const P = pile(n, seed); Hd.P = P; P.slot = slot; slots[slot] = P; live.add(P);
        Object.assign(P.root.style, { left: x.toFixed(1) + 'px', top: y.toFixed(1) + 'px', transform: `rotate(${ang}deg)` });
        const dx = L.x1 - x + 40;
        ctx.front.append(P.root);
        if (!poll) poll = setInterval(sync, 400);
        const later = (fn, ms) => { const t = setTimeout(fn, ms / p); P.timers.push(t); return t; };
        const born = performance.now();
        let read = READ, leaveT = 0, leaving = false;
        const end = () => {
          if (P.gone) return; P.gone = true; P.timers.forEach(clearTimeout); P.root.remove(); live.delete(P);
          if (slots[P.slot] === P) slots[P.slot] = null;
          pump();
        };
        P.end = end;
        const deal = (m, first) => {
          const c = card(m);
          P.cards.forEach((k, i) => {
            const to = fanT(i + 1);
            if (!ctx.reduced) k.el.animate([{ transform: k.t }, { transform: to }], { duration: 380 / p, easing: 'cubic-bezier(.3,.7,.3,1)' });
            k.el.style.transform = to; k.t = to;
          });
          P.cards.unshift(c);
          for (const old of P.cards.splice(4)) later(() => old.el.remove(), 420);
          P.stack.append(c.el);
          if (ctx.reduced) { setSlip(P, m); return; }
          const sl = first ? SLIDE : 360, fl = first ? FLIP : 460;
          c.el.animate([{ transform: `translate(${dx}px,${first ? 30 : 16}px) rotate(${first ? 15 : 10}deg)` }, { transform: c.t }], { duration: sl / p, easing: 'cubic-bezier(.22,.6,.3,1)' });
          const o = { duration: fl / p, delay: (sl - 50) / p, fill: 'backwards' };
          c.flip.animate(flipKF(180, 0), o); c.sh.animate(shKF, o);
          if (first) {
            P.slipw.animate([{ transform: P.slipT + ' translateY(-100%)', opacity: 0 }, { transform: P.slipT + ' translateY(-70%)', opacity: 1, offset: 0.3 }, { transform: P.slipT, opacity: 1 }], { duration: 400 / p, delay: (sl + fl - 290) / p, fill: 'backwards', easing: 'cubic-bezier(.2,.7,.3,1)' });
          } else {
            later(() => {
              setSlip(P, m);
              P.slipw.animate([{ transform: P.slipT + ' translateY(-100%)', opacity: 0 }, { transform: P.slipT + ' translateY(-70%)', opacity: 1, offset: 0.3 }, { transform: P.slipT, opacity: 1 }], { duration: 300 / p, easing: 'cubic-bezier(.2,.7,.3,1)' });
            }, sl + fl * 0.45);
          }
        };
        const leave = () => {
          if (leaving || P.gone) return; leaving = true;
          if (ctx.reduced) { P.root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' }).onfinish = end; return; }
          P.slipw.animate([{ transform: P.slipT, opacity: 1 }, { transform: P.slipT + ' translateY(-70%)', opacity: 1, offset: 0.7 }, { transform: P.slipT + ' translateY(-100%)', opacity: 0 }], { duration: 240 / p, fill: 'forwards', easing: 'ease-in' });
          const c = P.cards[0], o = { duration: 380 / p, delay: 60 / p, fill: 'forwards' };
          c.flip.animate(flipKF(0, -180), o); c.sh.animate(shKF, o);
          const a = P.root.animate([{ transform: `rotate(${ang}deg)` }, { transform: `translate(${dx}px,18px) rotate(${ang + 11}deg)` }], { duration: 460 / p, delay: 400 / p, fill: 'forwards', easing: 'cubic-bezier(.55,0,.85,.45)' });
          a.onfinish = end; later(end, 1000);
        };
        const arm = () => { clearTimeout(leaveT); leaveT = setTimeout(leave, Math.max(0, ((ctx.reduced ? 300 : SLIDE + FLIP) + read) / p - (performance.now() - born))); P.timers.push(leaveT); };
        P.join = (m) => { if (leaving || P.gone) return; read = Math.min(9000, read + 1200); deal(m, false); arm(); };
        deal(n, true);
        if (ctx.reduced) P.root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
        arm();
      }
      function pump() {
        while (queue.length) { const s = slots.indexOf(null); if (s < 0) return; start(queue.shift(), s); }
      }
      function show(n) {
        const L = ctx.lane(), want = Math.max(1, Math.min(3, Math.floor((L.w - 16) / 176)));
        if (!live.size && slots.length !== want) slots = Array(want).fill(null);
        const Hd = { n, P: null };
        queue.push(Hd); pump();
        return { update(m) { Hd.n = m; if (Hd.P) Hd.P.join(m); } };
      }
      function clear() {
        for (const P of [...live]) { P.gone = true; P.timers.forEach(clearTimeout); P.root.remove(); }
        live.clear(); queue.length = 0; slots = slots.map(() => null); clearInterval(poll); poll = 0;
      }
      return { show, still, clear };
    },
  });
})();
