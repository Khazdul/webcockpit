// Round 3, direction 3: "The Shadow Play". Nothing flies: a travelling
// player's shadow theatre lights up low in the sky lane and performs what just
// happened with cut-paper puppets on rods (after Lotte Reiniger and the
// wayang), over a playbill board that carries the text. Then the lamp is
// blown out.
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 224, SW = 216, SH = 128, G = 112, PITCH = 312;
  const OVER = 'cubic-bezier(.3,1.5,.5,1)', IN = 'cubic-bezier(.5,0,.9,.5)', OUT = 'cubic-bezier(.2,.7,.3,1)', DROP = 'cubic-bezier(.4,0,.7,.6)';
  const paper = (a, b, c, d) => `repeating-linear-gradient(0deg,rgba(70,36,6,.065) 0 1px,transparent 1px 3px),repeating-linear-gradient(90deg,rgba(70,36,6,.045) 0 1px,transparent 1px 2.5px),radial-gradient(60px 40px at 24% 30%,rgba(255,255,255,.16),transparent),radial-gradient(46px 30px at 82% 74%,rgba(60,24,0,.12),transparent),radial-gradient(128px 88px at 50% 58%,${a},${b} 36%,${c} 70%,${d} 118%)`;

  Harness.css('shadows', `
.shadows-rig{position:absolute;left:0;width:${W}px;text-align:center;font-family:"Cormorant Garamond",Georgia,serif;--shadows-halo:rgba(255,186,92,.5);--shadows-ink:#140a04}
.shadows-rig[data-still]{position:relative}
.shadows-rig[data-mood=pvp]{--shadows-halo:rgba(255,104,66,.5);--shadows-ink:#190604}
.shadows-rig[data-sky=day],.shadows-rig[data-sky=overcast]{--shadows-halo:rgba(255,226,160,.5)}
.shadows-tilt{position:relative;transform-origin:50% 55%}
.shadows-hood{position:absolute;left:-7px;right:-7px;top:-8px;height:9px;background:linear-gradient(#523520,#23140a);clip-path:polygon(2.5% 0,97.5% 0,100% 100%,0 100%)}
.shadows-hood::after{content:"";position:absolute;left:3%;right:3%;top:1px;height:1px;background:rgba(255,220,170,.22)}
.shadows-box{position:relative;box-sizing:border-box;width:${W}px;height:${SH + 8}px;border:4px solid;border-color:#3d2513 #26170c #1a0f07 #311e10;background:#0d0705;box-shadow:0 0 0 1px #090502,0 6px 14px rgba(0,0,0,.42)}
.shadows-halo{position:absolute;inset:-4px;box-shadow:0 0 28px 4px var(--shadows-halo);opacity:0;transition:opacity .5s}
.shadows-lit .shadows-halo{opacity:1}
.shadows-rig[data-sky=day] .shadows-halo,.shadows-rig[data-sky=overcast] .shadows-halo{box-shadow:0 0 20px 3px var(--shadows-halo)}
.shadows-paper{position:absolute;inset:0;overflow:hidden;background:${paper('#fff8dc', '#ffe3a2', '#f1b45e', '#a9642a')}}
.shadows-rig[data-mood=poor] .shadows-paper{background:${paper('#fff0c8', '#f7d38e', '#dba050', '#8b5222')}}
.shadows-rig[data-mood=pvp] .shadows-paper{background:${paper('#ffeccd', '#ffb682', '#e3633d', '#7a1f11')}}
.shadows-rig[data-mood=levelup] .shadows-paper,.shadows-rig[data-mood=achievement] .shadows-paper,.shadows-rig[data-mood=superb] .shadows-paper{background:${paper('#fffbe6', '#ffe9a8', '#f6bd5c', '#b06a26')}}
.shadows-cold{position:absolute;inset:0;opacity:0;transition:opacity .8s;background:${paper('#fcfeff', '#dfeef8', '#a7c4dc', '#587898')}}
.shadows-chill .shadows-cold{opacity:1}
.shadows-chill{--shadows-halo:rgba(170,208,240,.5);--shadows-ink:#060a12}
.shadows-glow{position:absolute;inset:0;background:radial-gradient(76px 54px at 50% 60%,rgba(255,253,232,.6),rgba(255,253,232,0));animation:shadows-breathe 2.7s ease-in-out infinite alternate,shadows-gutter 5.3s linear infinite}
.shadows-shade{position:absolute;inset:0;box-shadow:inset 0 0 17px rgba(48,20,3,.62),inset 0 13px 12px -8px rgba(24,9,1,.8)}
.shadows-dark{position:absolute;inset:0;background:#0c0705}
.shadows-cut{position:absolute;left:0;top:0;display:block;overflow:hidden;filter:blur(.2px)}
.shadows-cut path{fill:var(--shadows-ink);fill-rule:evenodd}
.shadows-cut .shadows-ln{fill:none;stroke:var(--shadows-ink);stroke-width:.8;stroke-linecap:round;stroke-linejoin:round}
.shadows-rod{stroke:var(--shadows-ink);stroke-opacity:.46;stroke-width:1.1;stroke-linecap:round}
.shadows-thr{stroke:var(--shadows-ink);stroke-opacity:.7;stroke-width:.55}
.shadows-idle{animation:shadows-held 2.3s ease-in-out infinite alternate}
.shadows-spin{animation:shadows-spin 80s linear infinite}
.shadows-sway{animation:shadows-sway 3.1s ease-in-out infinite alternate}
.shadows-smoke{position:absolute;left:50%;top:-44px;margin-left:-10px;overflow:visible;opacity:0}
.shadows-smoke path{fill:none;stroke:rgba(226,222,212,.6);stroke-width:1.3;stroke-linecap:round}
@keyframes shadows-breathe{from{opacity:.35}to{opacity:.85}}
@keyframes shadows-gutter{0%,61%,69%,100%{transform:none}64%{transform:translate(1.5px,.5px) scale(.97)}66%{transform:translate(-1px,0) scale(1.02)}}
@keyframes shadows-held{from{transform:rotate(-.55deg)}to{transform:rotate(.55deg)}}
@keyframes shadows-spin{to{transform:rotate(360deg)}}
@keyframes shadows-sway{from{transform:rotate(-5deg)}to{transform:rotate(5deg)}}
@media (prefers-reduced-motion:reduce){.shadows-idle,.shadows-spin,.shadows-sway,.shadows-glow{animation:none}}
.shadows-bill{position:relative;box-sizing:border-box;width:206px;margin:9px auto 0;padding:8px 11px 9px;color:#f4e5c0;background:linear-gradient(#2e1c10,#1c1009);border:1px solid #0b0603;
  box-shadow:inset 0 0 0 2.5px #25160c,inset 0 0 0 3.3px rgba(214,170,98,.5),0 5px 12px rgba(0,0,0,.4)}
.shadows-bill::before,.shadows-bill::after{content:"";position:absolute;top:-10px;width:1px;height:10px;background:#b79459}
.shadows-bill::before{left:22px}.shadows-bill::after{right:22px}
.shadows-bill>div:empty{display:none}
.shadows-tag{font:400 11px/1.3 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.26em;margin-right:-.26em;color:#d6b77c;padding-bottom:3px}
.shadows-title{font:italic 600 18px/1.12 "Cormorant Garamond",Georgia,serif;text-wrap:balance;overflow-wrap:anywhere}
.shadows-fig{font:600 34px/1 "Cormorant Garamond",Georgia,serif;font-variant-numeric:lining-nums;color:#ffe9b2;margin-top:1px;white-space:nowrap}
.shadows-fig i{font:italic 500 16px/1 "Cormorant Garamond",Georgia,serif;margin-left:5px;color:#cfb486}
.shadows-rate{display:flex;justify-content:center;align-items:center;gap:8px;margin-top:5px}
.shadows-rate svg{display:block;overflow:visible}
.shadows-word{font:400 13px/1.1 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.2em;margin-right:-.2em;color:#f1dba8}
.shadows-on{fill:#ffc75e;filter:drop-shadow(0 0 2.5px rgba(255,166,58,.95))}
.shadows-off{fill:none;stroke:#8a7049;stroke-width:.7}
.shadows-x{fill:none;stroke:#ff9272;stroke-width:1.1;stroke-linecap:round}
.shadows-more{font:italic 500 13.5px/1.15 "Cormorant Garamond",Georgia,serif;color:#cfb486;margin-top:5px;text-wrap:balance}
.shadows-note{font:italic 400 12.5px/1.2 "IM Fell English",Georgia,serif;color:#b89b69;margin-top:5px}
.shadows-rig[data-kind=death] .shadows-fig{font:400 26px/1.1 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.16em;margin-right:-.16em;color:#e8f0f6}
.shadows-rig[data-kind=death] .shadows-note{font:400 11.5px/1.2 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.2em;margin-right:-.2em;color:#a9b9c6}
.shadows-rig[data-kind=levelup] .shadows-fig{font-size:31px}
.shadows-rig[data-kind=achievement] .shadows-title{font-size:15.5px;line-height:1.17;font-weight:500}
`);

  const S = (tag, a, parent) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); if (parent) parent.append(e); return e; };
  const R = (a) => `rotate(${a}deg)`, T = (x, y) => `translate(${x}px,${y}px)`;
  const f = (v) => (Math.round(v * 10) / 10).toString();
  const dot = (x, y, r) => `M${f(x - r)},${f(y)}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0z`;
  const loz = (x, y, r) => `M${f(x)},${f(y - r)}l${r},${r} ${-r},${r} ${-r},${-r}z`;
  const rep = (pts, fn) => pts.map((p) => fn(p[0], p[1])).join('');
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
  // a list of cut shapes; a leading "~" makes a thin stroke (a whisker, a string)
  const cut = (g, list) => { for (const d of list) d[0] === '~' ? S('path', { d: d.slice(1), class: 'shadows-ln' }, g) : S('path', { d }, g); };
  // a joint: everything in .a turns about (x,y); a hand rod hangs from `hand` and stays upright
  const J = (parent, x, y, hand) => {
    const a = S('g', {}, S('g', { transform: `translate(${x},${y})` }, parent));
    let rod = null;
    if (hand) { rod = S('g', {}, S('g', { transform: `translate(${hand[0]},${hand[1]})` }, a)); S('line', { x1: 0, y1: 0, x2: 0, y2: 130, class: 'shadows-rod' }, rod); }
    return { a, rod, ang: 0, tc: 0, dead: 0 };
  };
  const shield = (x, y, r, n) => {
    let d = dot(x, y, r) + dot(x, y, f(r * .36)) + dot(x, y, f(r * .17));
    for (let i = 0; i < n; i++) { const a = (i + .5) / n * 6.2832, c = Math.cos(a), s = Math.sin(a), w = r * .13; d += `M${f(x + c * r * .5)},${f(y + s * r * .5)}L${f(x + c * r * .83 - s * w)},${f(y + s * r * .83 + c * w)} ${f(x + c * r * .83 + s * w)},${f(y + s * r * .83 - c * w)}Z`; }
    return d;
  };

  // ---- the puppets (cut facing right, feet at 0,0; `flip` turns a villain to face the hero) ----
  const LEGS = [
    'M-14,0L-4.5,0Q-7,-2.6 -9.8,-3Q-7.6,-7 -6.4,-10.6L.5,-19-5,-21Q-9,-15.5 -10.2,-11.2Q-11.6,-7 -12.8,-3.4Q-14.2,-2 -14,0Z',
    'M4.6,0L15.6,0Q18.2,-.2 18.8,-2.2Q14.5,-3.5 9,-3.2Q9.6,-7 10.2,-11Q8.5,-16 5,-20.5L-2,-19.5Q3.5,-14.5 5.8,-10.6Q6.2,-6.6 5.6,-3Q4.4,-1.6 4.6,0Z',
    'M-5,-28L5,-28 10,-17.2 7.4,-18.4 6,-15 3.8,-18.4 1.8,-15-.2,-18.4-2.2,-15-4.2,-18.4-6.4,-15.4-8.6,-18Z',
  ];
  const TORSO = 'M-5,-27.6L5,-27.6Q7.4,-33 6.6,-38.6Q4,-42 .5,-42.2Q-4.2,-42 -6.2,-38.6Q-6.8,-32 -5,-27.6Z';
  const ARM = ['M0,-2.3L7.5,-1.9 14.6,-2.6 15,.2 7.8,1.9 0,2.5Z', 'M12.8,-3.3L16.8,-2.9 17,.9 13,1.3Z', dot(0, 0, 3.3)];
  const SWORD = [dot(-3.7, 0, 1.4), 'M-3,-.7L1.6,-.7 1.6,.7-3,.7Z', 'M1.2,-4.6Q2.6,-4.4 3.4,-3.2L2.9,0 3.4,3.2Q2.6,4.4 1.2,4.6L2,0Z', 'M2.8,-1.3L25,-.75 29,0 25,.75 2.8,1.3Z'];
  const AXE = ['M-6,-.65L25,-.55 27.5,0 25,.55-6,.65Z', 'M17,-.5Q16,-6 12,-8.8Q19.4,-11 25.4,-7.2Q22.6,-4 22.8,-.5Z' + dot(19, -5.4, 1.1), 'M18,.5L20,4.4 22,.5Z'];
  const BANNER = ['M-7,-.6L37,-.5 37,.5-7,.6Z', 'M36,0L39,-1.6 43.5,0 39,1.6Z',
    'M34.5,-.5L34.8,-8Q32.6,-13.4 34.6,-19.6Q33,-24 34.4,-28.4L29.6,-25.4 27.2,-30.6 24.8,-25 20.4,-28Q21.6,-22 19.6,-17.4Q18,-11 19.4,-.5Z' + 'M27,-18.4l1.1,2.6 2.6,1.1-2.6,1.1-1.1,2.6-1.1,-2.6-2.6,-1.1 2.6,-1.1z' + dot(27, -6, .9) + dot(27, -22.4, .7)];

  const PUP = {
    hero: { pivot: [-14, 0], rod: [0, -30], draw(g, o) {
      cut(g, ['M-5,-40.5L-13,-33.6-5.2,-28.6-4.4,-30.8-9.4,-33.6-3.6,-38.2Z', ...LEGS,
        TORSO + rep([[-2.6, -31.4], [0, -31.4], [2.6, -31.4], [-3.8, -34.3], [-1.3, -34.3], [1.3, -34.3], [3.8, -34.3], [-2.6, -37.2], [0, -37.2]], (x, y) => loz(x, y, .85)),
        'M-1.4,-45L2,-45 2.2,-41-1.6,-41Z',
        'M-3.8,-44.2Q-4.8,-50 .2,-54.4Q4,-52 4.6,-48.4L6.3,-47.6 5.4,-46.2 4.8,-46 5,-44.6 3.8,-43.6Q.5,-42.6 -2,-43.4Z' + 'M1.5,-48.7L4.2,-48 1.7,-47.2Z',
        'M-3.8,-46L-5.6,-40.6-1,-42Z',
        'M.4,-53.8Q-.6,-58.6 -6,-59.2Q-11.6,-58.6 -13.2,-53Q-10.8,-55.9 -8,-55.5Q-10,-53.6 -10.3,-50.2Q-7.8,-53.7 -4.8,-53.7Q-6,-52 -5.9,-49.4Q-3.8,-52.7 -.8,-52.5Z']);
      const arm = J(g, 1, -39.4, [15.8, -1]);
      cut(arm.a, ARM);
      cut(S('g', { transform: `translate(15.8,-1) rotate(${o.banner ? -13 : -22})` }, arm.a), o.banner ? BANNER : SWORD);
      return { arm };
    } },
    foe: { flip: 1, pivot: [14, 0], rod: [0, -30], draw(g) {
      cut(g, ['M-5.6,-41Q-13,-37 -14.6,-27Q-15,-21 -18.8,-17.4Q-13,-17.2 -11.4,-21Q-10.8,-18 -12.8,-15.2Q-7.4,-17.6 -6.2,-25Z', ...LEGS,
        TORSO + loz(0, -34.6, 2.3) + rep([[0, -38.6], [0, -30.6], [-3.6, -34.6], [3.6, -34.6]], (x, y) => dot(x, y, .65)),
        'M-1.4,-45L2,-45 2.2,-41-1.6,-41Z',
        'M-3.8,-43.4L-4.2,-51Q.4,-54.8 5,-51L5.4,-47.8 6.6,-47.2 5.4,-43.2Z' + 'M.8,-49L5,-48.8 5,-47.9.8,-47.9Z' + dot(3.6, -45.6, .5) + dot(2, -45.2, .5),
        'M-2.8,-51.4Q-7.4,-54 -6.2,-60Q-3.8,-55.4 -.6,-53.2Z', 'M2.4,-52.8Q5,-56.6 10,-57Q6.8,-54.6 5.2,-51Z']);
      const arm = J(g, 1, -39.4, [15.8, -1]); arm.dead = -165;
      cut(arm.a, ARM);
      cut(S('g', { transform: 'translate(15.8,-1) rotate(-22)' }, arm.a), AXE);
      return { arm };
    } },
    mouse: { flip: 1, scale: 1.9, pivot: [0, -9.4], rod: [0, -4], fall: 'roll', draw(g) {
      cut(g, ['M-8,-1.6Q-9,-7.5 -2,-9Q3,-9.6 6.5,-6.5L10.8,-4Q11.4,-3 10.2,-2.6L6.4,-1.8 6.6,-.6 7.8,0 5,0 4.6,-2-2.6,-2-2.4,-.6-1.2,0-4.2,0-4.4,-1.8-5.6,-.6-4.6,0-7.4,0Z' + dot(7.4, -5, .6),
        dot(3, -9.8, 3) + dot(3, -9.8, 1.5), '~M-8,-3Q-14,-2 -15,-7Q-15.5,-11 -12,-11.5Q-10,-11.4 -10.4,-9.6', '~M10.2,-3.4L13.8,-5M10.4,-3L14.2,-3.2']);
      return {};
    } },
    wolf: { flip: 1, pivot: [0, -15], rod: [0, -18], fall: 'roll', draw(g) {
      cut(g, ['M-9,-13L-7.5,-6.5-9.5,-2-10,0-5,0-5.6,-1.8-4.2,-7-5,-13Z', 'M9,-13L12.5,-7 13.2,-2 12.6,0 17,0 16.4,-1.8 15.5,-7.5 12,-14Z',
        'M-19,0L-13.8,0-14.3,-1.8-13.4,-6.6-10,-12.6Q-2,-15.6 5,-11.5L6.2,-5.5 5.6,-1.8 4.4,0 10,0 9.7,-1.6 9.6,-6 11.4,-12Q13.8,-15.5 14.2,-19L18,-20.6 24.4,-21 25,-19 25.8,-21.1 29.4,-21.6 30.2,-23.6 24.4,-26.2 21.6,-28.6 20.8,-34 18.4,-29.8 17,-33.4 15,-28.2 12,-27 12.8,-24.9 9,-26 9.6,-23.9 5.4,-24.6 5.6,-23-3,-22.4Q-10,-22.8 -14.4,-20.6L-17.2,-16.6Q-18.4,-12 -15.4,-9L-17.8,-5.6-17.4,-2Z'
        + 'M20.6,-26L23.6,-25.2 21.2,-24.5Z' + rep([[7.6, 0], [4.3, 0], [1, 0]], (x) => `M${x},-21.6q1.7,3.6-.3,7.6q.8,-3.8-.7,-7.6z`)]);
      const tail = J(g, -15, -19); tail.dead = 28;
      cut(tail.a, ['M.5,-2Q-7,-2 -11,5L-9.4,4.4-12.5,9.5-10,8.4-11.5,13.5-8.4,11-8,14.6Q-4,10 -2.2,3.5Z']);
      const jaw = J(g, 18, -20.8); jaw.ang = 6; jaw.dead = 30;
      cut(jaw.a, ['M-1,.2L5.4,.5 6.2,-1.4 7,.5 10.4,.1 11,1.5 2,3.2-1.6,2Z']);
      return { tail, jaw };
    } },
    orc: { flip: 1, pivot: [10, 0], rod: [0, -30], draw(g) {
      const arm = J(g, -1, -35, [16.4, -1]); arm.ang = -125; arm.dead = -168;
      cut(arm.a, ['M0,-2.8L8,-2.2 15,-3 15.4,1 8,2.4 0,3Z', dot(16.4, -1, 2.3)]);
      cut(S('g', { transform: 'translate(16.4,-1) rotate(60)' }, arm.a), ['M-3.5,-.8L3,-.8 3,.8-3.5,.8Z', 'M2.5,-1.2L6,-2.4Q15,-6 22.5,-2.2L24.6,1.8Q21,-.4 18.4,.2L17.6,-1.2Q12,-1.4 7,1.9L2.5,1.2Z']);
      cut(g, ['M-10,0L-2.5,0-3.5,-2.5-5.8,-3-3.5,-9.5 .5,-17-6,-18-8.5,-10-8.2,-3Z', 'M3,0L12,0Q10,-2.6 7.4,-3L8.2,-10.5 4.8,-18-1,-17 4,-10 4,-3Z',
        'M-6.5,-21L6,-21 7.5,-13 5,-15.5 3.5,-11.5 1.5,-15.5-.5,-12-2.5,-15.5-4.5,-12.5-7.5,-15Z',
        'M-6.5,-20.4L6,-20.6Q10,-27 9.5,-33.5Q7,-38.5 1,-38.8Q-6,-38 -8.6,-32Q-9,-25 -6.5,-20.4Z' + rep([[-4, -34], [-.5, -34], [-5, -30.5], [-1.5, -30.5], [2, -30.5], [-4, -27], [-.5, -27]], (x, y) => `M${x - 1.1},${y}h2.2l-1.1,1.9z`),
        'M6.5,-43L-2,-48.4 5,-39.5Z',
        'M2.5,-36Q1.5,-43 6,-46.4Q10.5,-48 14.2,-45L17.2,-43.8 15.8,-42.2 18.8,-39.8 17.2,-38.6 17.8,-37.2 15.6,-36.6 18.2,-36.2 19.4,-39.4 20,-35.6 19.4,-33 14,-31.2Q7,-31 2.5,-36Z' + 'M11.8,-42.9L15,-42.2 12.5,-41.2Z',
        'M4.4,-44.6Q9.5,-50.6 15.2,-45.2L17,-43.8 4,-43.2Z', 'M8.8,-48.2L10,-54.4 11.6,-48.2Z', shield(13.5, -25.5, 8.6, 8)]);
      return { arm };
    } },
    uruk: { flip: 1, pivot: [15, 0], rod: [0, -38], draw(g) {
      const arm = J(g, -3, -47, [21, -1.2]); arm.ang = -125; arm.dead = -170;
      cut(arm.a, ['M0,-3.6L10,-3 19.5,-3.8 20,1.2 10,3.2 0,3.8Z', dot(21, -1.2, 3), 'M-4,-3L-1.4,-9.6 1,-3.6 4,-8 4.6,-2Z', dot(0, 0, 4.4)]);
      cut(S('g', { transform: 'translate(21,-1.2) rotate(60)' }, arm.a), ['M-5,-1L4,-1 4,1-5,1Z', 'M3,-3.6L5,-3.6 5,3.6 3,3.6Z', 'M5,-1.6L10,-3Q22,-7.8 32,-3.6L35,1.6Q31,-.6 27.4,.4L26.4,-1.4Q20,-1.6 11,2.3L5,1.6Z' + dot(28.6, -2.6, .9)]);
      cut(g, ['M-15,0L-5.5,0-6.5,-3-9.5,-3.4-5.5,-13 1,-24-8,-25-12,-13-13,-3.4Z', 'M4,0L16,0Q13,-3.2 9.5,-3.5L11,-13.5 7,-25-1,-24 5.6,-13 5.2,-3.4Z',
        'M-8.5,-29.5H9L11.5,-17 8,-17.6 7.6,-14.6 4,-15.4 3.6,-13 0,-13.6-3.6,-13-4,-15.4-7.6,-14.6-8,-17.6-11,-17Z' + rep([[-6, 0], [-3, 0], [0, 0], [3, 0], [6, 0]], (x) => dot(x, -27.2, .75)),
        'M-8.5,-29L9,-29Q13.5,-38 12,-47Q8,-51.5 1,-51.6Q-8,-51 -11.5,-46Q-12.5,-37 -8.5,-29Z' + rep([[-7, -42], [-2.5, -42], [2, -42], [-5, -38.6], [-.5, -38.6], [-7, -35.2], [-2.5, -35.2], [2, -35.2], [-5, -31.8], [-.5, -31.8], [4, -31.8]], (x, y) => `M${x - 1.6},${y}h3.2v1.2h-3.2z`),
        'M-3,-51Q-4.5,-58.5 1,-62.5Q7,-64.5 11,-60L12.2,-56.4 14.8,-52.6 12.6,-53 12,-50 13.6,-47.6 8,-46.5Q1,-47 -3,-51Z' + 'M7,-57.2L11.6,-56.3 11.4,-55 7.2,-55.6Z',
        'M0,-61.5L-2.8,-68.4 1.5,-64.8 3,-71 5.6,-65.2 8.8,-69.4 9.4,-62Z', shield(15.5, -37.5, 9.6, 10), 'M24.4,-39.4L30.6,-37.5 24.4,-35.6Z']);
      return { arm };
    } },
    sack: { flip: 1, pivot: [0, -25], rod: [0, -26], fall: 'roll', end: 152, draw(g) {
      cut(g, ['M-8,0L-1.6,0-2.2,-1.6-4,-1.8-3.6,-14-5.6,-14-6,-1.8Z', 'M2,0L9.4,0Q8.4,-1.8 6,-1.8L5.6,-14 3.6,-14 4,-1.8Z']);
      cut(S('g', { transform: 'translate(0,-6)' }, g), [
        'M-11,-7Q-14,-16 -11.5,-25Q-9,-32 -3.5,-34.5L-4.5,-36.5Q-8,-40 -6,-43Q-3.5,-40.5 -1,-42.5Q.5,-45.5 2.6,-42.6Q5,-41 7,-43.4Q8,-39.6 4.4,-36.6L3.6,-34.6Q10,-32 12,-24Q14,-15 11,-7Q0,-4.6 -11,-7Z'
        + 'M1.6,-21h2.6v.9H1.6zM5.6,-21h2.6v.9H5.6zM1.6,-14.6h2.6v.9H1.6zM5.6,-14.6h2.6v.9H5.6zM1.6,-19h.9v2.6h-.9zM7.3,-19h.9v2.6h-.9z',
        '~M3.8,-35.6q4.8,-3.6 6,.2q-2.6,2.6-6,-.2l5.4,4.6M-4.2,-35.6l-4.4,3.4']);
      return {};
    } },
    troll: { flip: 1, scale: 1.05, pivot: [8, 0], rod: [0, -50], fall: 'lean', draw(g) {
      cut(g, ['M-26,0L-3,0Q-3,-4 -8,-5.5L-6,-20-2,-40-24,-40-23,-22-23.5,-6Q-26.5,-4 -26,0Z' + 'M-8.4,-1.4q-2.4,-2.2-4.6,0z',
        'M4,0L30,0Q30,-3.5 26.5,-4Q24.5,-6 21,-5.6L22.5,-22 18,-40-3,-40 6,-21 5.5,-6Q3.5,-3 4,0Z' + 'M28.4,-1.2q-2,-2-4.2,0zM23,-1.2q-2,-2-4,0z',
        'M-25.5,-47L20.5,-47 24,-30 19,-33 17,-26 12,-31 9,-24 4,-30 0,-23-5,-30-9,-24.5-14,-31-18,-26-21,-32.5-27,-30Z' + rep([[-19, 0], [-13, 0], [-7, 0], [-1, 0], [5, 0], [11, 0], [17, 0]], (x) => loz(x, -43.4, 1.5)),
        'M-25,-46L20,-46Q31,-56 31,-70Q30,-76 24,-78L10,-98Q4,-126 -18,-128Q-40,-124 -44,-100Q-46,-74 -36,-58Q-30,-49 -25,-46Z'
        + 'M-31,-102l5.4,5.4-2.6,3.8 5.8,5.6-1.2,1.1-6.6,-6 2.6,-4-4.6,-4.8z' + dot(-21, -113, 1.3) + dot(-12, -107, 1) + dot(-28, -84, 1.1) + dot(-16, -94, .8)
        + 'M8,-58.6q3.4,-1.2 3.6,2.2q-2.4,-1.6-3.6,-2.2z' + 'M-14,-66l3,4-2,3 3.4,4-1,.8-4,-4.6 2,-3.2-2.4,-3.2z',
        'M12,-97L6,-109 10.5,-105.6 11.4,-112 15.8,-100Z', 'M16,-100l-.6,-5.4 3,3.8 1.4,-5.6 1.8,5.2 3.2,-3.8.2,5.6z',
        'M8,-78Q5,-95 13,-101Q21,-105 28,-100L31,-97.6 29.2,-95.4Q35.4,-95 38.8,-91Q40.4,-87 36.4,-86.2L33.2,-86.8 34,-84.2 24,-82.4 12,-74Z' + dot(27, -95.6, 1.25)]);
      const jaw = J(g, 17, -83.6); jaw.dead = 22;
      cut(jaw.a, ['M-4,-.5L9.6,.3 10.6,-3.2 11.8,.4 14.2,.4 15.4,-4.8 17,.6 18.6,2 17.2,6.2Q10,9.8 2,7.6L-5,3Z']);
      const arm = J(g, 16, -78, [18, 39]); arm.lean = 1;
      cut(arm.a, ['M-7,-4Q10,2 15,16L19.6,31 22,35 12,38 6,18Q2,8 -8,6Z', dot(17.6, 38.6, 6.6)]);
      cut(S('g', { transform: 'translate(18,39) rotate(57)' }, arm.a), ['M-10,-2.3L4,-2.9Q18,-5 30,-8.2Q40.5,-9.4 43,-1Q42.6,8 33,8.8Q20,7 4,3L-10,2.5Z' + 'M24,-1.6q3.4,-2.6 5.6,.2q-2.6,2.6-5.6,-.2z' + dot(35.5, 3.4, 1.1) + dot(15, .4, .8),
        '~M26,7.6l5,7', 'M31,14.6q5.6,-2 8.4,2q-5,2.6-8.4,-2z', 'M36,-9l1.6,-4 1.8,4.2zM41.8,-3.6l4,-1.2-3.4,3z']);
      return { jaw, arm };
    } },
    death: { flip: 1, scale: .93, pivot: [0, 0], rod: [0, -50], draw(g) {
      cut(g, ['M-17.6,0L-15.9,0-9.8,-106-11.5,-106.2Z', 'M-11.8,-105.6Q10,-113 29,-93.6Q10,-104.4 -10.2,-100.8Z',
        'M-7,-75L-15.6,-60-12.4,-56.2-9,-59.6-3.6,-69Z',
        'M-13.5,0L-10.5,-1.8-8.6,0-6,-2.2-3.4,0-1,-2.2 1.6,0 4,-2 6.6,0 9,-1.8 12,0Q10.5,-24 9.6,-44Q10.4,-62 8.6,-74L-7.6,-74Q-10,-58 -10,-44Q-11,-22 -13.5,0Z'
        + rep([[-9, 0], [-5, 0], [-1, 0], [3, 0], [7, 0]], (x) => `M${x},-4.6l1.4,-3.2 1.4,3.2z`) + 'M-9.7,-46.8L9.4,-46 9.4,-45.1-9.7,-45.9Z',
        'M-8.4,-72Q-11,-86 -4,-93.6Q3,-99.4 9.6,-96Q13.6,-93.6 14,-89.8L12.8,-87.8 14.2,-86.2 13.6,-83.4 12.2,-83 12.6,-81.2 9.4,-79.2 9.6,-72Z'
        + 'M9.4,-90.6q2.8,-.7 3.2,1.4q-.8,1.7-3,1.3q-.9,-1.3-.2,-2.7z' + 'M6.8,-94Q3.6,-86 7.6,-78.6Q5.6,-86 7.9,-93.8Z',
        'M-6,-90.6Q-12,-93 -14.8,-87Q-11,-89.2 -8,-86Z', '~M4,-45.6q1.6,5 .4,9.6M5.2,-45.6q2.6,4 2.2,7']);
      const arm = J(g, 3, -75, [20, -1]); arm.ang = 78;
      cut(arm.a, ['M-2.6,-3.2L8,-3.6 15,-2.2 17,6.4 9.6,4.6-1,3.6Z', 'M14.6,-2.4L19.6,-2.2 19.6,-.2 15,.4Z', '~M19,-1.9L24,-2.6M19.4,-1.3L25,-1.2M19.4,-.7L24.4,.4M17.4,-.2L20,1.8']);
      return { arm };
    } },
  };
  const KIND = { poor: 'mouse', meh: 'wolf', good: 'orc', great: 'uruk', superb: 'troll', calibrating: 'sack', pvp: 'foe' };
  const ORDER = ['mouse', 'wolf', 'orc', 'uruk'], CAP = { poor: 0, meh: 1, good: 2, great: 3, superb: 3 };
  const capped = (kind, mood) => (mood in CAP ? ORDER[Math.min(ORDER.indexOf(kind), CAP[mood])] : kind);
  const heapKind = (i, mood) => capped(['orc', 'wolf', 'uruk', 'orc', 'wolf'][i % 5], mood);

  // ---- scenery ----
  function ground(g, r, wall) {
    let d = `M-2,${SH + 2}V${G}`;
    if (!wall) for (let x = 2; x < SW; x += 3 + r() * 10) {
      const n = 1 + (r() * 3 | 0);
      for (let i = 0; i < n; i++) { const h = 2 + r() * 4.5, l = (r() - .5) * 3.4, b = x + i * 1.5; d += `L${f(b)},${G}L${f(b + .6 + l)},${f(G - h)}L${f(b + 1.3)},${G}`; }
    }
    d += `L${SW + 2},${G}V${SH + 2}Z`;
    if (wall) for (let x = 14; x < SW; x += 27) d += `M${x - .6},${G + 4}h1.2v6.4h-1.2z` + dot(x, G + 11.4, 1.2) + `M${x + 9},${G + 6}h9v.7h-9z`;
    else for (let x = 12; x < SW; x += 16) d += loz(x, G + 8.2, 2.6) + dot(x + 8, G + 8.2, .9);
    S('path', { d }, g);
  }
  function valance(g) {
    let d = `M-2,-2H${SW}V4.6`;
    for (let x = SW; x > 0; x -= 12) d += 'a6,3.6 0 0 1 -12,0';
    d += 'Z';
    for (let x = 6; x < SW; x += 12) d += dot(x, 4.6, 1.05);
    S('path', { d }, g);
  }
  function bough(g, r, p, n, bare) {
    const [x0, y0, cx, cy, x1, y1] = p;
    S('path', { d: `M${x0},${y0}Q${cx},${cy} ${x1},${y1}`, class: 'shadows-ln', style: 'stroke-width:1.5' }, g);
    for (let i = 1; i <= n; i++) {
      const t = i / n * .94 + .06, u = 1 - t, x = u * u * x0 + 2 * u * t * cx + t * t * x1, y = u * u * y0 + 2 * u * t * cy + t * t * y1;
      const ang = Math.atan2(2 * u * (cy - y0) + 2 * t * (y1 - cy), 2 * u * (cx - x0) + 2 * t * (x1 - cx)) * 57.3 + (i % 2 ? 1 : -1) * (42 + r() * 30) + (i === n ? 0 : 0);
      if (bare) S('path', { d: `M0,0l${f(4 + r() * 4)},-.6l${f(2 + r() * 2)},${f(-2 + r() * 4)}`, class: 'shadows-ln', transform: `translate(${f(x)},${f(y)}) rotate(${f(ang)})` }, g);
      else S('path', { d: 'M0,0l1.6,0q3.4,-3.4 8.4,0q-5,3.4-8.4,0', transform: `translate(${f(x)},${f(y)}) rotate(${f(ang)}) scale(${f(.75 + r() * .5)})` }, g);
    }
  }
  function tree(g, r, o = {}) {
    S('path', { d: `M-4,${G}Q5,${G - 30} 1.5,${G - 56}Q-.5,${G - 76} 4,${G - 100}L8,${G - 100}Q5.5,${G - 76} 7.5,${G - 56}Q12,${G - 28} 10,${G}Z` }, g);
    bough(g, r, [4, G - 80, 26, G - 100, 60, G - 91], o.bare ? 6 : 10, o.bare);
    if (!o.low) bough(g, r, [6, G - 56, 18, G - 72, 31, G - 69], o.bare ? 3 : 5, o.bare);
  }

  // ---- a scene: the cut-paper stage and its cues (times in ms at pace 1) ----
  function scene(n, rest, p, fx) {
    const svg = S('svg', { viewBox: `0 0 ${SW} ${SH}`, width: SW, height: SH, class: 'shadows-cut' });
    const back = S('g', {}, svg), layer = S('g', {}, svg), front = S('g', {}, svg);
    const r = ctx.rng(hash(n.kind + n.mood) + 17);
    const anims = [], timers = [], t0 = performance.now();
    const wait = (t) => Math.max(0, t / p - (performance.now() - t0));
    const sc = { svg, back, layer, front, r, rest };
    sc.now = () => (rest ? 0 : (performance.now() - t0) * p);
    sc.cue = (el, t, dur, frames, ease, offs) => {
      if (rest) { el.style.transform = frames[frames.length - 1]; return; }
      if (!el._c) { el._c = 1; el.style.transform = frames[0]; }
      anims.push(el.animate(frames.map((fr, i) => (offs ? { transform: fr, offset: offs[i] } : { transform: fr })), { delay: wait(t), duration: Math.max(1, dur / p), fill: 'forwards', easing: ease || OVER }));
    };
    sc.set = (j, a) => { j.ang = a; j.a._c = 1; j.a.style.transform = R(a); if (j.rod) { j.rod._c = 1; j.rod.style.transform = R(-a + j.tc); } };
    sc.rot = (j, t, dur, angs, ease, offs) => {
      sc.cue(j.a, t, dur, angs.map(R), ease, offs);
      if (j.rod) sc.cue(j.rod, t, dur, angs.map((a) => R(-a + j.tc)), ease, offs);
      j.ang = angs[angs.length - 1];
    };
    sc.at = (t, fn) => { if (rest) fn(); else timers.push(setTimeout(fn, wait(t))); };
    sc.stop = () => { timers.forEach(clearTimeout); anims.forEach((a) => a.cancel()); };
    sc.actor = (kind, x, y = 0, opt = {}) => {
      const d = PUP[kind], k = d.scale || 1, [px, py] = d.pivot, fl = d.flip ? -1 : 1;
      const pos = S('g', { transform: `translate(${f(x)},${f(G + y)})` }, layer);
      const idle = S('g', opt.firm ? {} : { class: 'shadows-idle', style: `animation-delay:${(-r() * 4).toFixed(2)}s` }, pos);
      const mv = S('g', {}, idle), tip = S('g', {}, S('g', { transform: `translate(${px},${py})` }, mv));
      const rodg = S('g', {}, S('g', { transform: `translate(${f(-px + fl * k * d.rod[0])},${f(-py + k * d.rod[1])})` }, tip));
      S('line', { x1: 0, y1: 0, x2: 0, y2: 150, class: 'shadows-rod' }, rodg);
      const i = S('g', { transform: `translate(${-px},${-py}) scale(${fl * k},${k})` }, tip);
      const a = { kind, d, x, y, mv, tip, rodg, ...d.draw(i, opt) };
      for (const j of [a.arm, a.jaw, a.tail]) if (j) sc.set(j, j.ang);
      return a;
    };
    sc.rise = (a, t, from = 112) => sc.cue(a.mv, t, 420, [T(0, from), T(0, 0)], OVER);
    // a puppet is struck: it tips over on its rod (a beast rolls onto its back, a troll only leans)
    sc.fell = (a, t) => {
      const d = a.d, s = d.flip ? 1 : -1, D = d.fall === 'lean' ? 620 : 560;
      const fr = (d.fall === 'roll' ? [0, -9, (d.end || 178) + 15, (d.end || 178) - 9, d.end || 178] : d.fall === 'lean' ? [0, -3, 14, 9, 11] : [0, -6, (d.end || 90) + 8, (d.end || 90) - 6, d.end || 90]).map((v) => v * s);
      const offs = [0, .16, .66, .84, 1];
      sc.cue(a.tip, t, D, fr.map(R), DROP, offs);
      sc.cue(a.rodg, t, D, fr.map((v) => R(-v)), DROP, offs);
      for (const j of [a.arm, a.jaw, a.tail]) {
        if (!j) continue;
        const from = j.ang;
        if (j.lean) { j.tc = fr[4]; sc.cue(j.a, t + 80, 1000, [0, 32, 2, 17, 11].map(R), 'ease-in-out'); continue; }
        sc.cue(j.a, t + 60, 460, [R(from), R(j.dead)]);
        if (j.rod) { j.tc = d.flip ? fr[4] : -fr[4]; sc.cue(j.rod, t, D, [R(-from), R(-j.dead + j.tc)], 'ease-in'); }
        j.ang = j.dead;
      }
      if (d.fall === 'lean') { sc.cue(a.mv, t + 90, D, [T(0, 0), T(7, 10), T(5, 7), T(6, 8)], DROP); sc.at(t + D * .66, () => fx('quake')); }
    };
    return sc;
  }

  // ---- the plays ----
  const SPOT = { mouse: [60, 106, 8, 60], wolf: [48, 125, 12, 30], orc: [46, 124, 13, 6], uruk: [44, 128, 14, 0], troll: [36, 156, 10, 14], sack: [50, 122, 14, 14], foe: [58, 144, 9, -20] };
  const PLAY = {
    kill(sc, n, fx) {
      if (n.mood === 'pvp') return PLAY.duel(sc, n, fx);
      const joined = n.count > 1, kind = joined ? heapKind(0, n.mood) : KIND[n.mood] || 'sack';
      const [hx, mx, L, strike] = SPOT[kind];
      tree(sc.back, sc.r, { low: kind === 'troll' });
      ground(sc.front, sc.r);
      const h = sc.actor('hero', hx), m = sc.actor(kind, mx);
      sc.set(h.arm, -25);
      sc.rise(h, 300); sc.rise(m, 430, kind === 'troll' ? 150 : 112);
      sc.cue(h.tip, 880, 280, [R(0), R(-8)]); sc.rot(h.arm, 880, 280, [-25, -150]);
      sc.cue(h.mv, 1200, 150, [T(0, 0), T(L, 0)], IN); sc.cue(h.tip, 1200, 150, [R(-8), R(9)], IN); sc.rot(h.arm, 1200, 150, [-150, strike], IN);
      sc.fell(m, 1330);
      sc.cue(h.mv, 1660, 330, [T(L, 0), T(L - 5, 0)]); sc.cue(h.tip, 1660, 330, [R(9), R(0)]); sc.rot(h.arm, 1660, 380, [strike, -62]);
      const quad = PUP[kind].fall === 'roll', low = kind === 'troll';
      const H = { h, n: 1, free: 2060, x: L - 5, y: 0, hx, c: low ? 104 : quad ? mx + 2 : mx + 30, base: low ? -1 : 0 };
      sc.join = (k2) => {
        if (H.n >= 5) return;
        const i = H.n++, lvl = i + H.base, t = Math.max(sc.now() + 40, H.free), q = PUP[k2].fall === 'roll';
        const b = sc.actor(k2, H.c + (q ? 0 : -34 + (k2 === 'uruk' ? -8 : 0)) + [0, -26, 14, -12, 8][i], -(lvl * 5.5), { firm: 1 });
        sc.cue(b.mv, t, 250, [T(0, -175), T(0, 0)], IN);
        sc.fell(b, t + 235);
        const nx = H.c - 4 - H.hx, ny = -(lvl * 5.5 + 17);
        if (H.h.arm.ang !== -25) sc.rot(H.h.arm, t + 120, 300, [H.h.arm.ang, -25]);
        sc.cue(H.h.mv, t + 120, 470, [T(H.x, H.y), T((H.x + nx) / 2, Math.min(H.y, ny) - 30), T(nx, ny)], 'ease-in-out');
        H.x = nx; H.y = ny; H.free = t + 560;
      };
      for (let i = 1; i < n.count; i++) sc.join(heapKind(i, n.mood));
    },
    duel(sc) {
      const [hx, fxx, L] = SPOT.foe;
      S('path', { d: `M-2,${G}V${G - 30}h5v4h4v-4h5v4h4v-4h5V${G}Z` + `M8,${G - 18}h2.4v7H8z` }, sc.back);
      S('path', { d: `M19.6,${G - 30}v-22`, class: 'shadows-ln' }, sc.back);
      S('path', { d: `M20,${G - 52}q5,-2.4 9,.6q4,2.4 8,.2l-2.6,3.4 2.2,3.2q-4,1.4-8,-.8q-4,-2.2-8.6,-.2z` }, sc.back);
      ground(sc.front, sc.r, true);
      const h = sc.actor('hero', hx), e = sc.actor('foe', fxx);
      sc.set(h.arm, -25); sc.set(e.arm, -25);
      sc.rise(h, 300); sc.rise(e, 400);
      for (let k = 0; k < 3; k++) {
        const t = 840 + k * 330, a0 = k ? -20 : -25, o = [0, .58, 1];
        sc.rot(h.arm, t, 290, [a0, -150, -20], 'ease-in', o); sc.cue(h.mv, t, 330, [T(0, 0), T(-3, 0), T(L, 0), T(0, 0)], 'ease-in-out', [0, .5, .86, 1]);
        sc.rot(e.arm, t, 290, [a0, -150, -20], 'ease-in', o);
        if (k < 2) sc.cue(e.mv, t, 330, [T(0, 0), T(3, 0), T(-L, 0), T(0, 0)], 'ease-in-out', [0, .5, .86, 1]);
      }
      sc.fell(e, 1790);
      sc.rot(h.arm, 2000, 360, [-20, -62]);
    },
    levelup(sc) {
      const r = sc.r, star = (rr) => { let d = ''; for (let i = 0; i < 10; i++) { const a = i * .6283 - 1.5708, q = i % 2 ? rr * .42 : rr; d += `${i ? 'L' : 'M'}${f(Math.cos(a) * q)},${f(Math.sin(a) * q)}`; } return d + 'Z'; };
      for (const [x, len, rr] of [[20, 27, 4.6], [40, 16, 3.2], [196, 22, 4], [178, 36, 3]]) {
        const g = S('g', { class: 'shadows-sway', style: `animation-delay:${(-r() * 3).toFixed(2)}s` }, S('g', { transform: `translate(${x},0)` }, sc.back));
        S('line', { x1: 0, y1: 0, x2: 0, y2: len, class: 'shadows-thr' }, g);
        S('path', { d: star(rr), transform: `translate(0,${len + rr})` }, g);
      }
      S('path', { d: `M92,${G}v-8h24v-8h58v8h14v8z` + rep([[122, 0], [132, 0], [142, 0], [152, 0], [162, 0]], (x) => `M${x},${G - 2.5}v-6a2.8,2.8 0 0 1 5.6,0v6z`) + dot(104, G - 4, 1.2) + dot(181, G - 4, 1.2) }, sc.back);
      ground(sc.front, r);
      const h = sc.actor('hero', 50, 0, { firm: 1 });
      sc.set(h.arm, -25);
      sc.rise(h, 300);
      sc.cue(h.mv, 760, 290, [T(0, 0), T(27, -22), T(54, -8)], 'ease-in-out'); sc.cue(h.mv, 1070, 290, [T(54, -8), T(73, -31), T(92, -16)], 'ease-in-out');
      const c = S('g', {}, S('g', { transform: `translate(142.2,${G - 16 - 51.4})` }, sc.layer));
      S('line', { x1: 0, y1: -10, x2: 0, y2: -130, class: 'shadows-thr' }, c);
      S('path', { d: 'M-6.6,0L-7.8,-7.6-3.8,-3.6 0,-9.8 3.8,-3.6 7.8,-7.6 6.6,0Z' + loz(-3.6, -2.6, .9) + loz(0, -2.6, .9) + loz(3.6, -2.6, .9) }, c);
      S('path', { d: dot(-7.8, -8.2, 1.1) + dot(0, -10.6, 1.1) + dot(7.8, -8.2, 1.1) }, c);
      sc.cue(c, 1320, 480, [T(7, -90), T(7, 3.5)], OUT);
      sc.cue(c, 1900, 420, [T(7, 3.5), T(7, -5), T(0, -5), T(0, 0)], 'ease-in-out');
    },
    death(sc, n, fx) {
      tree(sc.back, sc.r, { bare: 1 });
      ground(sc.front, sc.r);
      const h = sc.actor('hero', 90, 0, { firm: 1 }), d = sc.actor('death', 164);
      sc.set(h.arm, -25);
      sc.rise(h, 300);
      const fr = [0, 5, -98, -84, -90], offs = [0, .18, .68, .85, 1];
      sc.cue(h.tip, 900, 600, fr.map(R), DROP, offs); sc.cue(h.rodg, 900, 600, fr.map((v) => R(-v)), DROP, offs);
      h.arm.tc = 90; sc.cue(h.arm.a, 900, 600, [R(-25), R(8)]); sc.cue(h.arm.rod, 900, 600, [R(25), R(82)]);
      sc.at(900, () => fx('chill'));
      sc.cue(d.mv, 1250, 560, [T(0, 126), T(0, 0)], OUT);
      sc.cue(d.tip, 1840, 400, [R(0), R(-6)]); sc.rot(d.arm, 1840, 440, [78, 34]);
    },
    achievement(sc) {
      S('path', { d: `M98,${G}L117,${G - 13} 125,${G - 8} 146,${G - 33} 153,${G - 24} 159,${G - 29} 178,${G - 11} 190,${G - 19} 218,${G - 3}V${G}Z` + `M146,${G - 30}l3.2,4.2-2,-.7-1.3,2.3-1.5,-2.5-2.1,1.1zM159,${G - 26.6}l2.6,3.2-1.8,-.4-1.2,1.6-1.4,-2z` }, sc.front);
      ground(sc.front, sc.r);
      let d = dot(0, 0, 11.6) + dot(0, 0, 9.4) + dot(0, 0, 5.8) + dot(0, 0, 1.4);
      for (let i = 0; i < 8; i++) { const a = i * .7854; d += dot(Math.cos(a) * 3.5, Math.sin(a) * 3.5, .62); }
      for (let i = 0; i < 16; i++) { const a = i * .3927, q = 13.4, t = q + (i % 2 ? 4.4 : 8.8), w = i % 2 ? .085 : .12; d += `M${f(Math.cos(a - w) * q)},${f(Math.sin(a - w) * q)}L${f(Math.cos(a) * t)},${f(Math.sin(a) * t)} ${f(Math.cos(a + w) * q)},${f(Math.sin(a + w) * q)}Z`; }
      const mv = S('g', {}, S('g', { transform: `translate(152,${G - 68})` }, sc.back));
      S('line', { x1: 0, y1: 0, x2: 0, y2: 150, class: 'shadows-rod' }, mv);
      S('path', { d }, S('g', { class: 'shadows-spin' }, mv));
      sc.cue(mv, 520, 1500, [T(0, 74), T(0, 0)], OUT);
      const h = sc.actor('hero', 66, 0, { banner: 1 });
      sc.set(h.arm, -40);
      sc.rise(h, 300);
      sc.rot(h.arm, 1000, 620, [-40, -84, -72]); sc.cue(h.tip, 1000, 500, [R(0), R(-3)]);
    },
  };

  // ---- the playbill board ----
  const NOTE = { poor: 'played to an empty house', meh: 'polite applause, mostly', good: 'a tragedy in one act', great: 'the villain died beautifully', superb: 'encore! (mind the frame)', calibrating: 'the monster was played by a sack', pvp: 'a duel in three strokes', levelup: 'the crown is on loan', death: 'there is no encore', achievement: 'a tableau, with sun' };
  const NUM = ['', '', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  const FLAMES = { poor: 1, meh: 2, good: 3, great: 4, superb: 5, calibrating: 0 };
  const FL = 'M4,0C5.2,2.6 7.6,4.6 7.6,7.6A3.6,3.6 0 0 1 .4,7.6C.4,5.6 1.8,4.8 2.4,3.2C3,4 3.4,4.6 3.6,5.4C4.4,3.8 4.4,1.8 4,0Z';
  function bill(n0) {
    const E = ctx.el, el = E('div', 'shadows-bill'), tag = E('div', 'shadows-tag'), title = E('div', 'shadows-title'), fig = E('div', 'shadows-fig'), rate = E('div', 'shadows-rate'), more = E('div', 'shadows-more'), note = E('div', 'shadows-note');
    el.append(tag, title, fig, rate, more, note);
    const set = (n) => {
      tag.textContent = n.kind === 'achievement' ? n.label : '';
      title.textContent = n.title;
      fig.textContent = '';
      if (n.big) { fig.append(E('span', '', n.big)); if (n.unit) fig.append(E('i', '', n.unit)); }
      rate.textContent = '';
      if (n.kind === 'kill') {
        if (n.mood in FLAMES) {
          const s = S('svg', { width: 58, height: 13, viewBox: '0 0 58 13' }, rate);
          for (let i = 0; i < 5; i++) S('path', { d: FL, transform: `translate(${i * 12 + 1},1)`, class: i < FLAMES[n.mood] ? 'shadows-on' : 'shadows-off' }, s);
        } else S('path', { d: 'M2,12L15,1M15,12L2,1M2.6,7.6l3.4,3.6M14.4,7.6l-3.4,3.6', class: 'shadows-x' }, S('svg', { width: 17, height: 13, viewBox: '0 0 17 13' }, rate));
        if (n.label) rate.append(E('span', 'shadows-word', n.label));
      }
      more.textContent = n.more;
      note.textContent = n.count > 1 ? `a tragedy in ${NUM[n.count] || n.count} acts` : NOTE[n.mood] || '';
    };
    set(n0);
    return { el, set };
  }

  let ctx;
  function build(n, rest) {
    const E = ctx.el, p = rest ? 1 : ctx.pace() || 1;
    const rig = E('div', 'shadows-rig'), tilt = E('div', 'shadows-tilt'), box = E('div', 'shadows-box'), sheet = E('div', 'shadows-paper'), dark = E('div', 'shadows-dark');
    const look = (m) => { rig.dataset.mood = m.mood; rig.dataset.kind = m.kind; };
    look(n); rig.dataset.sky = ctx.skyMode();
    const fx = (what) => {
      if (what === 'chill') rig.classList.add('shadows-chill');
      else if (rest) tilt.style.transform = 'rotate(1.8deg)';
      else tilt.animate(['none', 'translate(3px,1px) rotate(1.3deg)', 'translate(-2px,0) rotate(-.7deg)', 'translate(2px,1px) rotate(2deg)', 'translate(-1px,0) rotate(1.3deg)', 'rotate(1.8deg)'].map((t) => ({ transform: t })), { duration: 520 / p, fill: 'forwards' });
    };
    const sc = scene(n, rest, p, fx);
    valance(sc.front);
    PLAY[n.kind in PLAY ? n.kind : 'kill'](sc, n, fx);
    sheet.append(E('div', 'shadows-cold'), E('div', 'shadows-glow'), sc.svg, E('div', 'shadows-shade'), dark);
    box.append(E('div', 'shadows-halo'), sheet); tilt.append(E('div', 'shadows-hood'), box);
    const b = bill(n);
    rig.append(tilt, b.el);
    return { rig, sc, dark, bill: b, p, look };
  }

  Harness.register({
    id: 'shadows',
    name: 'The Shadow Play',
    blurb: 'A travelling player’s shadow theatre lights up low in the sky and performs what just happened with cut-paper puppets on rods: the better the kill, the bigger the villain. The playbill under it carries the text. Then the lamp is blown out.',
    create(c) {
      ctx = c;
      const live = new Set(), slots = [null, null, null], queue = [];
      let poll = 0;
      const sync = () => { const m = ctx.skyMode(); for (const P of live) P.B.rig.dataset.sky = m; if (!live.size) { clearInterval(poll); poll = 0; } };
      const free = () => {
        const L = ctx.lane(), cols = Math.max(1, Math.min(3, Math.floor((L.w - 8) / (W + 18)))), rows = Math.max(1, Math.floor((L.h - 8) / PITCH));
        const cap = Math.min(3, cols * rows);
        for (let i = 0; i < cap; i++) if (!slots[i]) return { i, col: i % cols, row: Math.floor(i / cols), L };
        return null;
      };
      function start(P, at) {
        const n = P.n, rest = ctx.reduced, B = build(n, rest), { rig, sc, dark, p } = B, L = at.L;
        P.B = B; P.slot = at.i; slots[at.i] = P; live.add(P);
        rig.style.left = Math.max(L.x0 + 7, L.x1 - 9 - W - at.col * (W + 18)) + 'px';
        rig.style.bottom = (ctx.size().h - L.bottom + 10 + at.row * PITCH) + 'px';
        ctx.front.append(rig);
        if (!poll) poll = setInterval(sync, 400);
        const timers = [], later = (fn, ms) => { const t = setTimeout(fn, ms / p); timers.push(t); return t; };
        let read = 6000, leaving = false, leaveT = 0;
        const born = performance.now(), ENTER = rest ? 300 : 700;
        P.end = () => { if (P.gone) return; P.gone = true; timers.forEach(clearTimeout); sc.stop(); live.delete(P); if (slots[P.slot] === P) slots[P.slot] = null; rig.remove(); };
        const done = () => { P.end(); const q = queue.length && free(); if (q) start(queue.shift(), q); };
        const leave = () => {
          if (leaving || P.gone) return; leaving = true;
          if (rest) { rig.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' }).onfinish = done; return; }
          dark.animate([{ opacity: 0 }, { opacity: .55 }, { opacity: .3 }, { opacity: 1 }], { duration: 260 / p, fill: 'forwards' });
          rig.classList.remove('shadows-lit');
          const sm = S('svg', { width: 20, height: 40, viewBox: '0 0 20 40', class: 'shadows-smoke' });
          S('path', { d: 'M10,40q-5,-7 0,-13q5,-6 -1,-13q-3,-5 1,-11', pathLength: 1, 'stroke-dasharray': 1 }, sm);
          rig.prepend(sm);
          sm.animate([{ opacity: 0, transform: 'translateY(6px)', strokeDashoffset: 1 }, { opacity: .9, strokeDashoffset: .3, offset: .4 }, { opacity: 0, transform: 'translateY(-12px)', strokeDashoffset: 0 }], { delay: 180 / p, duration: 800 / p, fill: 'forwards' });
          rig.animate([{ opacity: 1 }, { opacity: 1, offset: .45 }, { opacity: 0 }], { duration: 1050 / p, fill: 'forwards' }).onfinish = done;
        };
        const arm = () => { clearTimeout(leaveT); leaveT = setTimeout(leave, Math.max(0, (ENTER + read) / p - (performance.now() - born))); timers.push(leaveT); };
        if (rest) { dark.style.opacity = 0; rig.classList.add('shadows-lit'); rig.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 }); } else {
          rig.animate([{ opacity: 0, transform: 'translateY(7px)' }, { opacity: 1, transform: 'none' }], { duration: 320 / p, easing: 'ease-out' });
          dark.animate([1, 1, .45, .7, .16, .3, 0].map((o) => ({ opacity: o })), { delay: 240 / p, duration: 520 / p, fill: 'forwards' });
          later(() => rig.classList.add('shadows-lit'), 300);
        }
        P.join = (m, prev) => {
          if (leaving || P.gone) return;
          B.bill.set(m); B.look(m);
          const up = (CAP[m.mood] ?? -1) > (CAP[prev.mood] ?? -1) && KIND[m.mood] !== 'troll';
          if (sc.join) sc.join(up ? KIND[m.mood] : capped(m.count % 2 ? 'uruk' : m.count % 4 ? 'wolf' : 'orc', prev.mood in CAP ? prev.mood : m.mood));
          read = Math.min(9000, read + 1200); arm();
        };
        arm();
      }
      function show(n) {
        const P = { n, gone: false, end() { P.gone = true; } };
        const at = free();
        if (at) start(P, at); else queue.push(P);
        return { update(m) { const prev = P.n; P.n = m; if (P.join) P.join(m, prev); } };
      }
      function still(n) {
        const B = build(n, true);
        B.rig.dataset.still = '1'; B.rig.classList.add('shadows-lit'); B.dark.style.opacity = 0;
        return B.rig;
      }
      function clear() {
        queue.length = 0;
        for (const P of [...live]) P.end();
        slots.fill(null); clearInterval(poll); poll = 0;
      }
      return { show, still, clear };
    },
  });
})();
