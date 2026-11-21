// Round 4, skin 5: "The Hobbit". A respectable, middle-aged hobbit, airborne
// against his better judgement, in a Shire-made craft: a patchwork-quilt
// envelope, a copper kettle for a burner, a wicker picnic hamper for a basket.
// The rating ladder is told in meals, comfort and parties.
//
// Build: static, pen-wobbled SVG layers (each its own compositor layer) are
// moved by CSS transforms; the live parts (eyes, brows, mouth, ropes, cords)
// are unfiltered and written each frame from one small pose engine.
(() => {
  const NS = 'http://www.w3.org/2000/svg', INK = '#2a1b12', W = 210, VH = 275, CX = 105, HY = 100, RIM = 216, HCY = 161;
  const SKIN = '#cfa585', LINEN = '#d8cdb4';
  const MOODS = ['calibrating', 'poor', 'meh', 'good', 'great', 'superb', 'pvp', 'levelup', 'death', 'achievement'];
  const RANK = { poor: 1, meh: 2, good: 3, great: 4, superb: 5 };

  // ---- poses: face and body targets per mood (eased in tick) ----
  const DEF = { hy: 0, hr: 0, bl: 0, br: 0, bt: 0, lid: .2, low: 0, mw: 8, mc: 1, mo: 0, ma: 0, by: 0, ch: 0 };
  const M = {
    calibrating: { bl: -3.5, br: .5, lid: .3, mw: 5.5, mc: .2, hr: 3, gp: [2.6, 1.7], gw: .5, L: 1, R: 0 },
    poor: { bt: -15, bl: -1, br: -1, lid: .52, mw: 8, mc: -3.4, hr: -3, hy: 2.5, gp: [2.5, 1.2], gw: .25, L: 1, R: 0, tilt: -3 },
    meh: { lid: .45, mw: 9, mc: .7, bl: -.5, br: -.5, gp: [-2.6, 1.5], gw: .2, L: 0, R: 0 },
    good: { lid: .33, low: .3, mw: 10.5, mc: 3.2, bl: -1.5, br: -1.5, gp: [2.7, -.8], gw: .25, L: 1, R: 0 },
    great: { lid: .5, low: .35, mw: 10, mc: 3.2, ma: .9, bl: -2.5, br: -2, hr: -1.5, gp: [2.2, -2], gw: .25, L: 0, R: 1 },
    superb: { lid: .05, low: .85, mw: 13, mc: 4.8, mo: 4.6, bl: -5, br: -5, hy: -2, gp: [-2.5, -2], gw: .25, L: 0, R: 0 },
    pvp: { bt: 17, bl: 1.5, br: 1.5, lid: .4, low: .6, mw: 9.5, mc: -.9, mo: 1.5, gp: [-2.8, 0], gw: .3, L: 0, R: 0 },
    levelup: { bl: -3.5, br: -3.5, lid: .12, low: .3, mw: 10, mc: 3.4, mo: 2, by: 14, gp: [-1.6, -2.3], gw: .3, L: 1, R: 1 },
    death: { bt: -11, lid: .6, mw: 6.5, mc: -1.5, hy: 3.5, hr: 2, gp: [0, 2.3], gw: 1, L: 1, R: 0 },
    achievement: { hr: -2.5, hy: -3, lid: .55, low: .25, bl: -4, br: -4, mw: 10.5, mc: 2.6, ma: .6, ch: .05, gp: [1.6, -1.6], gw: .2, L: 1, R: 0 },
  };
  // one small piece of business on arriving: [from ms, to ms, pose] and [at ms, gaze, dwell ms]
  const BIZ = {
    calibrating: { ov: [[0, 650, { hr: 5, bl: -5, lid: .45 }], [650, 1300, { hy: 2, bl: -4, br: -4, lid: .15 }]], g: [[0, 'prop', 650], [650, 'you', 800]] },
    poor: { ov: [[250, 1050, { hy: 4.5, lid: .88, mc: -4.2, mw: 7 }]], g: [[0, 'prop', 500], [500, 'sign', 450], [1050, 'you', 900]] },
    meh: { ov: [[150, 800, { lid: .92, hr: -4, mo: 0, mw: 5 }]], g: [[0, 'prop', 700], [850, 'you', 900]] },
    good: { ov: [[300, 520, { hy: 5, hr: 2 }], [520, 700, { hy: -1 }]], g: [[0, 'sign', 350], [350, 'you', 1200]] },
    great: { ov: [[100, 800, { lid: .95, hr: -4, hy: -2 }]], g: [[800, 'you', 900]] },
    superb: { ov: [[0, 900, { mo: 0, mw: 4, mc: 0, bl: -6, br: -6 }], [900, 1100, { hy: -6 }], [1100, 1250, { hy: 2 }]], g: [[0, 'you', 1500]] },
    pvp: { ov: [[0, 750, { bt: 22, mo: 2.6, mw: 9.5, mc: -2.6, hr: -4 }]], g: [[0, 'dl', 300], [300, 'dr', 300], [600, 'you', 800]] },
    levelup: { ov: [[450, 950, { bl: -6, br: -6, mo: 3.2 }]], g: [[0, 'prop', 900], [900, 'you', 800]] },
    death: { ov: [[200, 1400, { lid: 1, hy: 5.5 }]], g: [[0, 'sign', 1600]] },
    achievement: { ov: [[0, 650, { ch: .08, hy: -6, lid: .92 }]], g: [[0, 'up', 500], [650, 'you', 900]] },
  };
  const GZ = { sign: [0, 2.1], you: [0, .1], up: [.5, -2.2], dl: [-2.7, 1.5], dr: [2.7, 1.5] };

  // quilt colours (four calicoes), sign border, pip colour
  const PAL = {
    calibrating: ['#e2dccb', '#d3cdbb', '#c9c8bd', '#ebe6d6', '#8d8a7c', '#77746a'],
    poor: ['#6f7a84', '#56616c', '#878f96', '#4d5560', '#5f6b76', '#5f6b76'],
    meh: ['#b39a68', '#96804f', '#c9b588', '#7f6c48', '#94804f', '#94804f'],
    good: ['#6f8a4e', '#c2a54e', '#4f6b3c', '#d8cfae', '#4f6b3c', '#4f6b3c'],
    great: ['#3f5f8a', '#c9a13e', '#2f4a70', '#d9d0b4', '#34527c', '#34527c'],
    superb: ['#b5432f', '#e0b23c', '#e2d8b8', '#3f6a8a', '#b5432f', '#b5432f'],
    pvp: ['#7a1f1a', '#231a17', '#a23a2a', '#3a2a24', '#6a1712', '#8a1f18'],
    levelup: ['#5f93b5', '#e3c765', '#d9d4c0', '#3f7396', '#3f7396', '#3f7396'],
    death: ['#55524e', '#3b3936', '#6e6a64', '#2c2a28', '#0e0c0b', '#0e0c0b'],
    achievement: ['#6b3a5c', '#c9a13e', '#8a4f77', '#e0d6b8', '#a8842e', '#a8842e'],
  };

  const per = (fn) => MOODS.map(fn).join('\n');
  Harness.css('hobbit', `
.hobbit{position:relative;width:${W}px;--go:1;font-family:"Cormorant Garamond",Georgia,serif}
${per((m) => `.hobbit[data-mood=${m}]{--q0:${PAL[m][0]};--q1:${PAL[m][1]};--q2:${PAL[m][2]};--q3:${PAL[m][3]};--bd:${PAL[m][4]};--pc:${PAL[m][5]}}`)}
.hobbit[data-sky=dusk]{--go:.7}.hobbit[data-sky=day]{--go:.22}.hobbit[data-sky=overcast]{--go:.4}
.hobbit-craft{position:relative;width:${W}px;height:${VH}px}
.hobbit-l{position:absolute;left:0;top:0;width:${W}px;height:${VH}px;overflow:visible;pointer-events:none}
.hobbit-st{will-change:transform}
.hobbit[data-sky=night] .hobbit-st{filter:drop-shadow(0 0 .7px rgba(255,232,190,.5))}
.hobbit[data-sky=dusk] .hobbit-st{filter:drop-shadow(0 0 .6px rgba(255,226,190,.3))}
.hobbit-env,.hobbit-car{transform-origin:${CX}px ${HY}px;will-change:transform}
.hobbit-torso{transform-origin:${CX}px 250px;will-change:transform}
.hobbit-head{transform-origin:${CX}px 197px;will-change:transform}
.hobbit-curls{transform-origin:${CX}px 152px;will-change:transform}
.hobbit-q0{fill:var(--q0)}.hobbit-q1{fill:var(--q1)}.hobbit-q2{fill:var(--q2)}.hobbit-q3{fill:var(--q3)}
.hobbit-q0,.hobbit-q1,.hobbit-q2,.hobbit-q3{transition:fill .5s}
.hobbit-glow{position:absolute;left:${CX - 70}px;top:28px;width:140px;height:100px;border-radius:50%;background:radial-gradient(closest-side,rgba(255,210,130,.75),rgba(255,170,80,.28) 45%,rgba(255,150,60,0));opacity:0;will-change:opacity;pointer-events:none}
.hobbit-flame{position:absolute;left:${CX - 20}px;top:48px;width:40px;height:50px;overflow:visible;transform-origin:50% 100%;will-change:transform}
.hobbit-flame path{transform-box:fill-box;transform-origin:50% 100%;animation:hobbit-flk 1.1s ease-in-out infinite alternate}
.hobbit-flame path+path{animation-duration:.7s}
.hobbit-fo{fill:url(#hobFl)}.hobbit-fi{fill:#fff3c4}
.hobbit[data-mood=death] .hobbit-fo{fill:#5d8fd0;opacity:.75}.hobbit[data-mood=death] .hobbit-fi{fill:#cfe4ff}
.hobbit[data-mood=death] .hobbit-glow{background:radial-gradient(closest-side,rgba(140,180,255,.4),rgba(120,160,255,0))}
.hobbit[data-mood=death] .hobbit-cloth{filter:grayscale(1) brightness(.8)}
.hobbit-o{display:none}
${per((m) => `.hobbit[data-mood=${m}] .hobbit-o-${m}{display:inline}`)}
.hobbit-p{transform:translateY(42px);opacity:0;transition:transform .5s cubic-bezier(.3,1.3,.5,1),opacity .18s}
${per((m) => `.hobbit[data-mood=${m}] .hobbit-p-${m}{transform:none;opacity:1}`)}
.hobbit-w{transform:translateY(-16px);opacity:0;transition:transform .4s cubic-bezier(.3,1.5,.5,1),opacity .15s}
${per((m) => `.hobbit[data-mood=${m}] .hobbit-w-${m}{transform:none;opacity:1}`)}
.hobbit-hand{transition:opacity .2s,transform .3s}
${per((m) => (M[m].L ? '' : `.hobbit[data-mood=${m}] .hobbit-hL{opacity:0;transform:translateY(8px)}`) + (M[m].R ? '' : `.hobbit[data-mood=${m}] .hobbit-hR{opacity:0;transform:translateY(8px)}`))}
.hobbit-shift{animation:hobbit-grip 9s ease-in-out infinite}
.hobbit-hR .hobbit-shift{animation-duration:11.5s;animation-delay:-4s}
.hobbit-fg{animation:hobbit-tap 6.4s ease-in-out infinite;animation-delay:calc(var(--i)*.09s - 2s)}
.hobbit-hR .hobbit-fg{animation-duration:8.3s}
.hobbit-flag{transform-origin:35px 152px;animation:hobbit-flag 1.5s ease-in-out infinite alternate}
.hobbit-ring{transform-box:fill-box;transform-origin:50% 50%;opacity:0;animation:hobbit-ring 3.9s linear infinite;animation-delay:var(--d)}
.hobbit-steam{opacity:0;animation:hobbit-steam 2.6s ease-out infinite;animation-delay:var(--d)}
.hobbit-rain{opacity:0;animation:hobbit-rain .9s linear infinite;animation-delay:var(--d)}
.hobbit-cloud{animation:hobbit-cloud 3.1s ease-in-out infinite alternate}
.hobbit-crumb{opacity:0;animation:hobbit-crumb 2.8s ease-in infinite;animation-delay:var(--d)}
.hobbit-cand{transform-box:fill-box;transform-origin:50% 100%;animation:hobbit-flk .6s ease-in-out infinite alternate;animation-delay:var(--d)}
.hobbit-spark{transform-box:fill-box;transform-origin:50% 50%;animation:hobbit-spark .5s steps(4) infinite}
.hobbit-fw{transform-box:fill-box;transform-origin:50% 50%;opacity:0;animation:hobbit-fw 2.6s ease-out infinite;animation-delay:var(--d)}
.hobbit-conf{opacity:0;animation:hobbit-conf var(--t) linear infinite;animation-delay:var(--d)}
.hobbit-halo{opacity:var(--go)}
.hobbit-blow{display:none;transform-origin:0 0}
.hobbit-biz[data-mood=superb] .hobbit-blow{display:inline;animation:hobbit-toot 1s ease-in-out both}
.hobbit-biz[data-mood=poor] .hobbit-b-poor{animation:hobbit-flip .8s ease-in-out both}
.hobbit-b-poor{transform-origin:153px 188px}
.hobbit-biz[data-mood=meh] .hobbit-b-meh{animation:hobbit-sip 1s ease-in-out both}
.hobbit-b-meh{transform-origin:62px 204px}
.hobbit-biz[data-mood=good] .hobbit-b-good{animation:hobbit-toast .9s ease-in-out both}
.hobbit-b-good{transform-origin:146px 220px}
.hobbit-biz[data-mood=great] .hobbit-b-great{animation:hobbit-sip2 1s ease-in-out both}
.hobbit-b-great{transform-origin:66px 222px}
.hobbit-biz[data-mood=pvp] .hobbit-b-pvp{animation:hobbit-bash .8s ease-in-out both}
.hobbit-b-pvp{transform-origin:146px 222px}
.hobbit-biz[data-mood=superb] .hobbit-b-superb{animation:hobbit-wave 1.2s ease-in-out both}
.hobbit-b-superb{transform-origin:66px 222px}
.hobbit-biz[data-mood=death] .hobbit-b-death{animation:hobbit-doff .9s ease-out both}
@keyframes hobbit-flk{0%{transform:scale(1,1)}40%{transform:scale(.88,1.1) skewX(3deg)}100%{transform:scale(1.07,.9) skewX(-3deg)}}
@keyframes hobbit-grip{0%,38%{transform:none}42%{transform:translate(1px,-1.6px)}46%,82%{transform:translateX(2.2px)}86%{transform:translate(1px,-1.4px)}90%,100%{transform:none}}
@keyframes hobbit-tap{0%,90%,100%{transform:none}93%{transform:translateY(-2.2px)}96%{transform:translateY(.3px)}}
@keyframes hobbit-flag{from{transform:skewY(-5deg) scaleX(1)}to{transform:skewY(6deg) scaleX(.93)}}
@keyframes hobbit-ring{0%{transform:scale(.35);opacity:0}8%{opacity:.95}70%{opacity:.6}100%{transform:translate(30px,-92px) scale(2.5);opacity:0}}
@keyframes hobbit-steam{0%{transform:translateY(3px);opacity:0}30%{opacity:.8}100%{transform:translate(2px,-12px);opacity:0}}
@keyframes hobbit-rain{0%{transform:none;opacity:0}15%{opacity:.95}85%{opacity:.9}100%{transform:translate(-3px,17px);opacity:0}}
@keyframes hobbit-cloud{from{transform:translate(-1.5px,0)}to{transform:translate(1.5px,1.2px)}}
@keyframes hobbit-crumb{0%,60%{transform:none;opacity:0}64%{opacity:1}100%{transform:translate(-3px,30px);opacity:0}}
@keyframes hobbit-spark{0%{transform:rotate(0) scale(1)}50%{transform:rotate(40deg) scale(.7)}100%{transform:rotate(80deg) scale(1.1)}}
@keyframes hobbit-fw{0%{transform:scale(.08);opacity:0}6%{opacity:1}45%{transform:scale(1);opacity:1}75%,100%{transform:scale(1.12) translateY(5px);opacity:0}}
@keyframes hobbit-conf{0%{transform:translate(0,0) rotate(0);opacity:0}8%{opacity:1}85%{opacity:1}100%{transform:translate(var(--x),190px) rotate(540deg);opacity:0}}
@keyframes hobbit-toot{0%{transform:scaleX(.15)}18%{transform:scaleX(1)}34%{transform:scaleX(.25)}52%{transform:scaleX(1)}68%{transform:scaleX(.25)}84%{transform:scaleX(1)}100%{transform:scaleX(.1)}}
@keyframes hobbit-flip{0%,25%{transform:scaleY(-1)}45%{transform:translateY(-5px) scaleY(-1)}70%{transform:translateY(-3px) scaleY(1)}100%{transform:none}}
@keyframes hobbit-sip{0%,100%{transform:none}35%,65%{transform:translate(17px,-9px) rotate(17deg)}}
@keyframes hobbit-sip2{0%,100%{transform:none}35%,60%{transform:translate(6px,-9px) rotate(13deg)}}
@keyframes hobbit-toast{0%,100%{transform:none}35%{transform:translateY(-9px) rotate(-7deg)}60%{transform:translateY(-7px) rotate(-4deg)}}
@keyframes hobbit-bash{0%,100%{transform:none}22%{transform:rotate(14deg)}48%{transform:rotate(-12deg)}72%{transform:rotate(8deg)}}
@keyframes hobbit-wave{0%,100%{transform:none}20%,60%{transform:rotate(-9deg)}40%,80%{transform:rotate(7deg)}}
@keyframes hobbit-doff{0%{transform:translate(4px,-42px) rotate(8deg)}100%{transform:none}}
@keyframes hobbit-jolt{0%{transform:none}30%{transform:translateY(5px) rotate(-1.6deg)}60%{transform:translateY(-2px) rotate(1deg)}100%{transform:none}}
.hobbit-sign{position:relative;width:172px;margin:0 auto;transform-origin:50% -5px;will-change:transform;color:${INK};text-align:center;--dim:#5a4a3a}
.hobbit-wide{width:198px}
.hobbit-eyelet{position:absolute;top:-9px;left:calc(50% - 4.5px);width:5px;height:6px;border:2px solid #a8842e;border-radius:50%;box-shadow:0 0 0 .8px ${INK},inset 0 0 0 .6px ${INK};z-index:1}
.hobbit-eyelet::after{content:"";position:absolute;left:1px;top:5.5px;width:3px;height:4px;background:#a8842e;box-shadow:0 0 0 .8px ${INK}}
.hobbit-eyelet:first-child{margin-left:-68px}.hobbit-eyelet:nth-child(2){margin-left:68px}
.hobbit-jolt{animation:hobbit-jolt .34s ease-out}
.hobbit-board{position:relative;box-sizing:border-box;padding:4px 8px 6px;border:3px solid var(--bd);border-radius:3px;
  background:linear-gradient(rgba(42,27,18,.34),rgba(42,27,18,0) 12px),repeating-linear-gradient(2deg,transparent 0 5px,rgba(90,60,30,.07) 5px 6px),repeating-linear-gradient(-1deg,transparent 0 13px,rgba(90,60,30,.05) 13px 14px),#e8ddc2;
  box-shadow:0 0 0 1px ${INK},inset 0 0 0 1px rgba(42,27,18,.6),inset 0 0 0 2.5px rgba(255,248,225,.5),0 3px 5px rgba(0,0,0,.35)}
.hobbit-board>div:empty{display:none}
.hobbit-title{font:italic 400 16px/1.1 "IM Fell English",Georgia,serif;text-wrap:balance;overflow-wrap:anywhere}
.hobbit-fig{font:600 28px/1 "Cormorant Garamond",Georgia,serif;font-variant-numeric:lining-nums;white-space:nowrap;margin-top:1px}
.hobbit-unit{font:italic 500 16px/1 "Cormorant Garamond",Georgia,serif;margin-left:4px;color:var(--dim)}
.hobbit-rate{display:flex;justify-content:center;align-items:center;gap:7px;margin-top:2px;min-height:15px}
.hobbit-rate svg{display:block;overflow:visible}
.hobbit-word{font:400 14px/1 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.14em;margin-right:-.14em;color:var(--pc)}
.hobbit-q{font:italic 400 15px/1 "IM Fell English",Georgia,serif;color:var(--dim)}
.hobbit-more{font:italic 500 13px/1.1 "Cormorant Garamond",Georgia,serif;color:var(--dim);margin-top:3px;text-wrap:balance}
.hobbit-tag{font:400 11.5px/1.3 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.24em;margin-right:-.24em;text-transform:uppercase;color:var(--pc)}
.hobbit[data-mood=achievement] .hobbit-tag{color:#6f5212}
.hobbit[data-mood=calibrating] .hobbit-board{border-style:dashed}
.hobbit[data-mood=superb] .hobbit-board{border:5px double var(--bd);box-shadow:0 0 0 1px ${INK},0 0 0 3px #d2a93f,0 0 0 4px ${INK},inset 0 0 0 1px rgba(42,27,18,.6),0 3px 5px rgba(0,0,0,.35)}
.hobbit[data-mood=superb] .hobbit-fig{color:#8f2f1f}
.hobbit[data-mood=pvp] .hobbit-board{box-shadow:0 0 0 1px ${INK},0 0 0 2.5px #1b1513,inset 0 0 0 1px rgba(42,27,18,.6),0 3px 5px rgba(0,0,0,.35)}
.hobbit[data-mood=pvp] .hobbit-fig{color:#6a1712}
.hobbit[data-mood=levelup] .hobbit-board{padding:8px 8px 9px;box-shadow:0 0 0 1px ${INK},0 0 0 3px #d9bb55,0 0 0 4px ${INK},inset 0 0 0 1px rgba(42,27,18,.6),0 3px 5px rgba(0,0,0,.35)}
.hobbit[data-mood=death] .hobbit-board{background:linear-gradient(rgba(0,0,0,.5),rgba(0,0,0,0) 12px),#262320;color:#ddd5c2;padding:9px 8px 10px;box-shadow:0 0 0 1px #000,inset 0 0 0 1px #6a655c,0 3px 5px rgba(0,0,0,.35)}
.hobbit[data-mood=death] .hobbit-fig{font:400 23px/1.2 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.16em;margin-right:-.16em;text-transform:lowercase;font-variant:small-caps}
.hobbit[data-mood=achievement] .hobbit-board{padding:5px 8px 8px;box-shadow:0 0 0 1px ${INK},inset 0 0 0 1px rgba(42,27,18,.6),inset 0 0 0 3px #e3c56a,inset 0 0 0 4px rgba(42,27,18,.5),0 3px 5px rgba(0,0,0,.35)}
.hobbit[data-mood=achievement] .hobbit-title{font-size:14.5px;line-height:1.12}
.hobbit-rm *,.hobbit-rm *::before{animation:none!important;transition:none!important}
.hobbit-rm .hobbit-ring,.hobbit-rm .hobbit-fw{opacity:.8}.hobbit-rm .hobbit-conf,.hobbit-rm .hobbit-rain{opacity:.9}
`);

  // ---- shared defs: pen wobble + grain wash, hatches, gradients ----
  const FILT = `<filter id="hobF" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.7" xChannelSelector="R" yChannelSelector="G" result="d"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .16 0 0 0 0 .09 0 0 0 0 .04 1.5 0 0 0 -.7" result="b"/><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="11"/><feColorMatrix type="matrix" values="0 0 0 0 .14 0 0 0 0 .08 0 0 0 0 .04 0 1.2 0 0 -.56" result="g"/><feMerge result="m"><feMergeNode in="b"/><feMergeNode in="g"/></feMerge><feComposite in="m" in2="d" operator="in" result="mc"/><feMerge><feMergeNode in="d"/><feMergeNode in="mc"/></feMerge></filter>`;
  const FILT2 = FILT.replace('hobF', 'hobG').replace('0 1.2 0 0 -.56', '0 .7 0 0 -.42').replace('1.5 0 0 0 -.7', '1.1 0 0 0 -.6');
  const HATCH = (id, rot, gap, op) => `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${gap}" height="${gap}" patternTransform="rotate(${rot})"><path d="M0,.5H${gap}" stroke="${INK}" stroke-width=".55" opacity="${op}"/></pattern>`;
  const grad = (id, stops, v) => `<linearGradient id="${id}" x1="0" ${v ? 'x2="0" y1="1" y2="0"' : 'x2="1"'}>${stops.map((s, i) => `<stop offset="${(i / (stops.length - 1)).toFixed(2)}" stop-color="${Array.isArray(s) ? s[0] : s}" ${Array.isArray(s) ? `stop-opacity="${s[1]}"` : ''}/>`).join('')}</linearGradient>`;
  const ALM = 'M-7.5,0Q0,-6.5 7.5,0Q0,4.6 -7.5,0Z';
  const DEFS = `<svg xmlns="${NS}" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${FILT}${FILT2}${HATCH('hobH1', 38, 3, .55)}${HATCH('hobH2', -52, 3.4, .45)}
<pattern id="hobCk" patternUnits="userSpaceOnUse" width="7" height="7"><rect width="7" height="7" fill="#e9dfc6"/><rect width="3.5" height="7" fill="#a3402c" opacity=".55"/><rect width="7" height="3.5" fill="#a3402c" opacity=".55"/></pattern>
<pattern id="hobDt" patternUnits="userSpaceOnUse" width="5" height="5"><circle cx="1.5" cy="1.5" r=".75" fill="#f4ecd6" opacity=".75"/></pattern>
<pattern id="hobSp" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)"><path d="M.6,0V4" stroke="#f4ecd6" stroke-width="1" opacity=".5"/></pattern>
<pattern id="hobWv" patternUnits="userSpaceOnUse" width="8" height="5"><path d="M0,1.5q2,-2 4,0t4,0M-4,4q2,-2 4,0t4,0t4,0" fill="none" stroke="${INK}" stroke-width=".5" opacity=".6"/></pattern>
<clipPath id="hobEc"><path d="${ALM}"/></clipPath>
${grad('hobSk', ['#b98c6e', '#d6ae8c', '#ecd2b2'])}${grad('hobHr', ['#4f3522', '#7a573a', '#9a744e'])}${grad('hobWk', ['#7c5c34', '#a8854f', '#c4a064'])}${grad('hobCu', ['#7a3f22', '#b8693a', '#e0a070'])}${grad('hobIr', ['#34393e', '#5d646b', '#959da3'])}
${grad('hobFl', [['#ff9a2e', 1], ['#ffb84a', .95], ['#ffd27a', .55], ['#ffe6a8', 0]], true)}
<radialGradient id="hobGl"><stop offset="0" stop-color="#ffd27a" stop-opacity=".7"/><stop offset="1" stop-color="#ffb04a" stop-opacity="0"/></radialGradient>
</defs></svg>`;

  const Lyr = (cls, inner) => `<svg class="hobbit-l ${cls}" xmlns="${NS}" width="${W}" height="${VH}" viewBox="0 0 ${W} ${VH}">${inner}</svg>`;
  const F = (inner, extra = '', f = 'hobF') => `<g filter="url(#${f})" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round" ${extra}>${inner}</g>`;
  const H1 = 'fill="url(#hobH1)" stroke="none"', H2 = 'fill="url(#hobH2)" stroke="none"';

  // ---- the envelope: a quilt, gore by band ----
  const hw = (t) => { const tm = .43; if (t < tm) { const a = (tm - t) / tm; return 84 * Math.sqrt(1 - a * a); } const b = (t - tm) / (1 - tm); return 19 + 65 * Math.pow(Math.cos(b * Math.PI / 2), .85); };
  const EP = (u, t) => [CX + hw(t) * Math.sin(u * Math.PI / 2), -6 + 100 * t + 5 * t * Math.cos(u * Math.PI / 2)];
  const RP = [EP(-1, .7), EP(1, .7), EP(-.5, .965), EP(.5, .965)];
  const pt = (u, t) => { const p = EP(u, t); return p[0].toFixed(1) + ',' + p[1].toFixed(1); };
  const region = (u0, u1, t0, t1, n = 4) => {
    const a = [];
    for (let k = 0; k <= n; k++) a.push(pt(u0 + (u1 - u0) * k / n, t0));
    for (let k = 1; k <= n; k++) a.push(pt(u1, t0 + (t1 - t0) * k / n));
    for (let k = 1; k <= n; k++) a.push(pt(u1 + (u0 - u1) * k / n, t1));
    for (let k = 1; k < n; k++) a.push(pt(u0, t1 + (t0 - t1) * k / n));
    return 'M' + a.join('L') + 'Z';
  };
  const ENV = (() => {
    const G = 7, tb = [0, .13, .29, .46, .63, .8, 1];
    let s = '', cal = '', st = '';
    for (let j = 0; j < 6; j++) for (let i = 0; i < G; i++) {
      const d = region(-1 + 2 * i / G, -1 + 2 * (i + 1) / G, tb[j], tb[j + 1], 3);
      s += `<path class="hobbit-q${(i + 2 * j + (j > 2 ? 1 : 0)) % 4}" d="${d}"/>`;
      if ((i * 5 + j * 3) % 7 === 0) cal += `<path d="${d}" fill="url(#hobDt)"/>`; else if ((i + j * 4) % 9 === 3) cal += `<path d="${d}" fill="url(#hobSp)"/>`;
    }
    for (let i = 1; i < G; i++) { const a = []; for (let k = 1; k <= 10; k++) a.push(pt(-1 + 2 * i / G, k / 10)); st += 'M' + a.join('L'); }
    for (let j = 1; j < 6; j++) { const a = []; for (let k = 0; k <= 12; k++) a.push(pt(-1 + 2 * k / 12, tb[j])); st += 'M' + a.join('L'); }
    return Lyr('hobbit-st', F(`<g stroke-width=".6">${s}</g><g stroke="none">${cal}</g>
<path d="${st}" fill="none" stroke="#f4ecd6" stroke-width=".6" stroke-dasharray="1.6 2.2" opacity=".6" transform="translate(.9,.9)"/>
<path d="${region(-1, -.42, 0, 1, 8)}" fill="${INK}" opacity=".17" stroke="none"/><path d="${region(-1, -.42, 0, 1, 8)}" ${H1}/><path d="${region(-1, -.74, .04, 1, 8)}" ${H2}/>
<path d="${region(.3, .66, .1, .58, 6)}" fill="#fff" opacity=".1" stroke="none"/>
<path d="${region(-1, 1, 0, 1, 12)}" fill="none" stroke-width="1.2"/>
<g transform="translate(60,52) rotate(-13)"><rect x="-8" y="-7" width="16" height="14" class="hobbit-q3" stroke-width=".7"/><rect x="-8" y="-7" width="16" height="14" fill="url(#hobSp)" stroke="none"/><path d="M-8,-4l-2.5,0M-8,0l-2.5,0M-8,4l-2.5,0M8,-4l2.5,0M8,0l2.5,0M8,4l2.5,0M-4,-7v-2.5M0,-7v-2.5M4,-7v-2.5M-4,7v2.5M0,7v2.5M4,7v2.5" fill="none" stroke-width=".7"/></g>
<path d="M139,62l7,5M138,65l7,5M137,68l7,5M143,60l-3,10M146,62l-3,10M149,64l-3,9" fill="none" stroke-width=".55" opacity=".85"/>
<circle cx="${CX}" cy="-5.5" r="2.6" fill="#b8693a"/>
<g class="hobbit-o hobbit-o-death"><path d="${region(-1, 1, .56, .66, 12)}" fill="#14110f"/><path d="M105,60C96,52 86,54 88,62C90,69 99,66 105,62C111,66 120,69 122,62C124,54 114,52 105,60Z" fill="#14110f"/><path d="M102,63L96,82L101,79L104,85L106,64L108,85L111,79L115,82L108,63Z" fill="#14110f"/><path d="M92,60q5,2 10,1M118,60q-5,2 -10,1" fill="none" stroke="#6a655c" stroke-width=".6"/></g>
<path d="M89,92l1.5,9l2.6,-.4l-1.5,-9ZM120,92.5l-1.3,9l2.6,.4l1.3,-9Z" fill="#c4a064" stroke-width=".7"/>
<ellipse cx="${CX}" cy="97.5" rx="19" ry="3.6" fill="#3a2418"/>
<path d="M92,98L96,104M118,98L114,104" fill="none" stroke-width=".9" stroke-dasharray="1.5 1.2"/>
<path d="M95,105C95,94 115,94 115,105" fill="none" stroke-width="1.6"/>
<path d="M116,106C122,105 123,101 126,99l2.5,2.5C126,105 124,110 117,111Z" fill="url(#hobCu)"/>
<path d="M92,105C92,100 118,100 118,105C120,111 115,114 105,114C95,114 90,111 92,105Z" fill="url(#hobCu)" stroke-width="1.1"/>
<path d="M92,105C92,100 104,100 100,102C97,105 97,110 100,114C94,113 90,110 92,105Z" ${H1}/>
<path d="M101,96.5h8v4.5h-8Z" fill="#8a4a28"/><path d="M109,103C113,104 115,106 115,109" fill="none" stroke="#ffe0c0" stroke-width="1" opacity=".7"/>`));
  })();
  const FLAME = `<svg class="hobbit-flame" xmlns="${NS}" width="40" height="50" viewBox="0 0 40 50"><path class="hobbit-fo" d="M20,50C7,44 9,27 20,1C31,27 33,44 20,50Z"/><path class="hobbit-fi" d="M20,50C14,46 14,36 20,23C26,36 26,46 20,50Z" opacity=".9"/></svg>`;

  // ---- the hobbit ----
  const HT = `translate(${CX},${HCY})`;
  const ear = (s, fill) => `<g transform="scale(${s},1)"><path d="M-32,-12C-37,-16 -42,-20 -47,-24C-47.5,-15 -45,-5 -40,1C-37,4 -34,3 -32,0Z" fill="${fill}" stroke-width="1"/><path d="M-36,-10C-39,-13 -41,-15 -43.5,-18C-43.5,-12 -42,-7 -39,-3" fill="none" stroke-width=".6"/></g>`;
  const HEAD = Lyr('hobbit-st', F(`<g transform="${HT}">
<path d="M-15,24L-16,42L16,42L15,24Z" fill="#b08265" stroke-width="1"/>
${ear(1, '#b48a6c')}${ear(-1, '#dbb695')}
<path d="M-32,-12C-33,-30 -18,-37 0,-37C18,-37 33,-30 32,-12C37,-2 38,14 30,24C22,34 10,37 0,37C-10,37 -22,34 -30,24C-38,14 -37,-2 -32,-12Z" fill="url(#hobSk)" stroke-width="1.1"/>
<path d="M-32,-12C-33,-30 -18,-37 -6,-37C-20,-30 -24,-14 -24,-4C-27,8 -26,20 -18,32C-24,30 -28,27 -30,24C-38,14 -37,-2 -32,-12Z" fill="#6b3f2a" opacity=".15" stroke="none"/>
<path d="M-32,-12C-33,-30 -18,-37 -6,-37C-20,-30 -24,-14 -24,-4C-27,8 -26,20 -18,32C-24,30 -28,27 -30,24C-38,14 -37,-2 -32,-12Z" ${H1}/>
<path d="M-33,-6C-37,4 -36,16 -30,24C-32,14 -32,4 -30,-6Z" ${H2}/>
<path d="M-26,28C-14,39 14,39 26,28C16,33 -16,33 -26,28Z" fill="#6b3f2a" opacity=".2" stroke="none"/>
<ellipse cx="-21" cy="9" rx="9" ry="6" fill="#b5503a" opacity=".2" stroke="none"/><ellipse cx="21" cy="9" rx="9" ry="6" fill="#b5503a" opacity=".2" stroke="none"/>
<path d="M-21,27C-12,35 12,35 21,27" fill="none" stroke-width=".6" opacity=".5"/><path d="M-7,31Q0,34 7,31" fill="none" stroke-width=".6" opacity=".7"/>
<path d="M-11,11C-17,14 -20,20 -18,27M11,11C17,14 20,20 18,27" fill="none" stroke-width=".75"/>
<path d="M-26,-9l-5,-2.5M-26.5,-6l-5.5,.5M-26,-3l-4.5,3M26,-9l5,-2.5M26.5,-6l5.5,.5M26,-3l4.5,3" fill="none" stroke-width=".55" opacity=".8"/>
<path d="M-22,1q7,3.5 14,.5M22,1q-7,3.5 -14,.5M-20,4q5,2 9,.5M20,4q-5,2 -9,.5" fill="none" stroke-width=".5" opacity=".65"/>
<path d="M-14,-23Q0,-26 14,-23M-9,-20Q0,-22 9,-20" fill="none" stroke-width=".5" opacity=".5"/>
<path d="M-3.5,-7C-4.5,2 -9.5,6 -9.5,11C-9.5,16 -4,17.5 0,16.5C4,17.5 9.5,16 9.5,11C9.5,6 4.5,2 3.5,-7Z" fill="#cc9a7a" stroke="none"/>
<ellipse cx="0" cy="11" rx="8" ry="5" fill="#b5503a" opacity=".18" stroke="none"/><ellipse cx="3" cy="8" rx="2.6" ry="3.6" fill="#f6e2c6" opacity=".5" stroke="none"/>
<path d="M-3.5,-6C-4.5,2 -9.5,6 -9.5,11C-9.5,16 -4,17.5 -1,16.5C-6,13 -6,6 -2,-2Z" ${H1}/>
<path d="M-9.3,9C-10.5,16 -4,18 0,16.6C4,18 10.5,16 9.3,9" fill="none" stroke-width="1"/><path d="M-5,15.5q2,1.5 4,.3M5,15.5q-2,1.5 -4,.3M-3.5,-5C-4.5,1 -7,4 -8.5,7" fill="none" stroke-width=".6"/>
</g>`, '', 'hobG'));
  const CURL = [[-38, -6], [-40, -20], [-34, -31], [-26, -38], [-15, -43], [-3, -45], [9, -44], [21, -41], [30, -34], [36, -23], [35, -8], [-21, -31], [-7, -35], [7, -36], [19, -32], [-30, -22], [28, -24]];
  const CURLS = Lyr('hobbit-st', F(`<g transform="${HT}">
<path d="M-36,5C-43,2 -45,-9 -40,-13C-46,-20 -43,-32 -35,-33C-37,-43 -25,-49 -17,-44C-12,-52 0,-52 4,-46C10,-53 23,-50 25,-43C34,-46 42,-38 38,-31C45,-26 46,-17 40,-13C45,-7 43,3 36,5C32,1 31,-8 32,-14C28,-20 27,-27 20,-26C16,-32 8,-31 5,-26C0,-32 -8,-31 -11,-26C-17,-31 -25,-28 -26,-21C-31,-19 -32,-11 -31,-6C-31,0 -33,4 -36,5Z" fill="url(#hobHr)" stroke-width="1.1"/>
<path d="M-36,5C-43,2 -45,-9 -40,-13C-46,-20 -43,-32 -35,-33C-37,-43 -25,-49 -17,-44C-22,-38 -30,-34 -30,-26C-34,-20 -35,-10 -33,-4C-33,1 -34,4 -36,5Z" ${H1}/>
<path d="${CURL.map(([x, y]) => `M${x},${y}c2.5,-3.5 7,-2 5.5,2c-1,2.5 -4.5,2.5 -4.5,0`).join('')}" fill="none" stroke-width=".6" opacity=".85"/>
<path d="${CURL.map(([x, y]) => `M${x + 1},${y - 2.2}c2,-2 5,-1.5 5.5,.5`).join('')}" fill="none" stroke="#c9a47a" stroke-width=".9"/>
<path d="M-37,-2c2,-3 4,-3 5,-1M-35,2c1.5,-2 3,-2 4,-1M37,-3c-2,-3 -4,-3 -5,-1M35,1c-1.5,-2 -3,-2 -4,-1M-38,-12c2,-3 5,-3 6,0M38,-13c-2,-3 -5,-3 -6,0" fill="none" stroke="#d9d0c0" stroke-width=".9"/>
</g>`));
  const eye = (s) => `<g transform="translate(${15 * s},-6)"><ellipse cy="-1" rx="10" ry="6.5" fill="#7a4a34" opacity=".13"/>
<g clip-path="url(#hobEc)"><path d="${ALM}" fill="#e6dcc6"/><path d="M-9,-6H9V-1.8H-9Z" fill="#3d281b" opacity=".3"/>
<g class="hobbit-ir"><circle r="3.1" fill="#5d4426"/><circle r="1.5" fill="#120b07"/><circle cx="-1" cy="-1.1" r=".75" fill="#fff8e6"/></g>
<path class="hobbit-lid" d="M-10,-18H10V-4.6Q0,-7 -10,-4.6Z" fill="#c69a7a" stroke="${INK}" stroke-width=".8"/>
<path class="hobbit-low" d="M-10,14H10V4.2Q0,5.6 -10,4.2Z" fill="#cfa585" stroke="${INK}" stroke-width=".6"/></g>
<path d="${ALM}" fill="none" stroke="${INK}" stroke-width=".75"/><path d="M-8,.4Q0,-7 8,.4" fill="none" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/></g>`;
  const BROW = `<path d="M-9.5,2.5C-7.5,-3 2,-5.5 10,-2.5C12.5,-1.5 12,2 9,1.5C3.5,.5 -3,1 -7,4.5C-9,6 -10,4.5 -9.5,2.5Z" fill="#5f432c" stroke="${INK}" stroke-width=".8"/><path d="M-6,2l1.8,-4M-2,.6l1.8,-4.2M2,0l1.8,-3.8M6,0l2,-3" fill="none" stroke="#b08a62" stroke-width=".7" stroke-linecap="round"/>`;
  const FACE = Lyr('', `<g transform="${HT}">${eye(-1)}${eye(1)}
<g transform="translate(-15,-17) scale(-1,1)"><g class="hobbit-bw">${BROW}</g></g><g transform="translate(15,-17)"><g class="hobbit-bw">${BROW}</g></g>
<g transform="translate(0,22.5)" stroke-linecap="round" stroke-linejoin="round"><path class="hobbit-mf" fill="#3a1d16" stroke="${INK}" stroke-width=".8"/><path class="hobbit-mt" fill="#ece2cc"/><path class="hobbit-ml" fill="none" stroke="${INK}" stroke-width="1.3"/><path class="hobbit-mu" fill="none" stroke="${INK}" stroke-width=".6" opacity=".6"/>
<g class="hobbit-blow"><g transform="scale(1.5)"><path d="M3,-2.5L34,-5L34,4L3,2.5Z" fill="#d2a93f" stroke="${INK}" stroke-width=".8"/><path d="M9,-3l3,5.7M17,-3.6l3,6.8M25,-4.3l3,8" stroke="#a8452f" stroke-width="2.4" fill="none"/><circle cx="37" cy="-.5" r="4.5" fill="#a8452f" stroke="${INK}" stroke-width=".8"/><path d="M37,-.5m-2,0a2,2 0 1 0 2,-2" fill="none" stroke="${INK}" stroke-width=".6"/></g></g></g></g>`);

  // what he wears on his head, per mood
  const cone = (s) => [-22 + 17 * s, -33 - 50 * s, 22 - 27 * s, -37 - 46 * s];
  const band = (a, b, fill) => { const p = cone(a), q = cone(b); return `<path d="M${p[0]},${p[1]}L${p[2]},${p[3]}L${q[2]},${q[3]}L${q[0]},${q[1]}Z" fill="${fill}" stroke-width=".6"/>`; };
  const WEAR = Lyr('hobbit-st', `<g transform="${HT}">
<g class="hobbit-w hobbit-w-calibrating">${F(`<path d="M-39,-6L-45,-40" fill="none" stroke-width="4.2"/><path d="M-39,-6L-44.3,-36" fill="none" stroke="#c9a13e" stroke-width="2.6"/><path d="M-44.5,-37L-45.2,-41" fill="none" stroke="#e9dfc6" stroke-width="2.2"/>
<g fill="#fff" fill-opacity=".1" stroke="#7c5c22" stroke-width="1.4"><circle cx="-15" cy="-3" r="9"/><circle cx="15" cy="-3" r="9"/></g><path d="M-6.5,-5Q0,-9 6.5,-5M-24,-4L-34,-9M24,-4L34,-9" fill="none" stroke="#7c5c22" stroke-width="1.2"/><path d="M-20,-8q3,-3 7,-3M10,-8q3,-3 7,-3" fill="none" stroke="#fff" stroke-width=".8" opacity=".5"/>`)}</g>
<g class="hobbit-w hobbit-w-poor">${F(`<path d="M-34,-19c-7,-5 -14,-3 -13,3c3,4 9,2 13,-1ZM-36,-15c-6,1 -9,6 -7,10c5,0 8,-4 8,-9ZM34,-19c7,-5 14,-3 13,3c-3,4 -9,2 -13,-1ZM36,-15c6,1 9,6 7,10c-5,0 -8,-4 -8,-9Z" fill="#ddd6c4" stroke-width=".9"/>
<path d="M-36,-15C-39,-35 -26,-51 0,-52C26,-51 39,-35 36,-15C24,-22 12,-18 0,-22C-12,-18 -24,-22 -36,-15Z" fill="#e8e2d2" stroke-width="1.1"/><path d="M-36,-15C-39,-35 -26,-51 0,-52C26,-51 39,-35 36,-15C24,-22 12,-18 0,-22C-12,-18 -24,-22 -36,-15Z" fill="url(#hobCk)" opacity=".28" stroke="none"/>
<path d="M-36,-15C-39,-35 -26,-51 -8,-52C-22,-44 -27,-32 -26,-19Z" ${H1}/><path d="M-22,-46q-4,-5 1,-7q5,1 3,6M22,-46q4,-5 -1,-7q-5,1 -3,6" fill="#ddd6c4" stroke-width=".9"/>
<path d="M-18,-26q6,-10 2,-22M12,-24q-3,-12 3,-24M26,-24q0,-8 -4,-14" fill="none" stroke-width=".5" opacity=".6"/>`)}</g>
<g class="hobbit-w hobbit-w-great">${F(`<g transform="rotate(-6 0 -30)"><ellipse cx="0" cy="-30" rx="45" ry="8" fill="#3f4d2e" stroke-width="1.1"/>
<path d="M22,-38C12,-62 -14,-78 -42,-76C-24,-67 -4,-56 24,-35Z" fill="#b8843e" stroke-width=".9"/><path d="M21,-38C10,-58 -12,-72 -38,-75M12,-48l-7,1M4,-55l-7,0M-5,-62l-7,-1M-15,-67l-6,-2M10,-52l3,-6M0,-59l2,-6M-10,-65l1,-6" fill="none" stroke-width=".55"/>
<path d="M-28,-31C-31,-52 -18,-61 -3,-59C4,-63 30,-56 28,-32Z" fill="#5c6e44" stroke-width="1.1"/><path d="M-28,-31C-31,-52 -18,-61 -8,-60C-18,-52 -20,-42 -18,-31Z" ${H1}/>
<path d="M-28.5,-37Q0,-31 28.5,-38L28.3,-32Q0,-25 -28.3,-31Z" fill="#3a2a1c"/><rect x="-4" y="-33.5" width="7" height="6" fill="#c9a13e" stroke-width=".7"/>
<path d="M-45,-30A45,8 0 0 0 45,-30C30,-25 -30,-25 -45,-30Z" fill="#4f5f3a" stroke-width="1.1"/><path d="M-45,-30A45,8 0 0 0 -8,-22.5C-22,-26 -36,-27 -45,-30Z" ${H1}/></g>
<path d="M9,22C22,23 31,29 35,38" fill="none" stroke-width="3.4"/><path d="M9,22C22,23 31,29 35,38" fill="none" stroke="#6a4226" stroke-width="2"/>
<path d="M31,35L43,35L42,46C40,49.5 34,49.5 32,46Z" fill="#5a3520" stroke-width="1"/><ellipse cx="37" cy="35" rx="6" ry="1.8" fill="#e0843a" stroke-width=".7"/>`)}</g>
<g class="hobbit-w hobbit-w-superb">${F(`<g transform="rotate(-9 0 -34)"><path d="M-22,-33L-5,-83L22,-37Q0,-28 -22,-33Z" fill="#e6dcc0" stroke-width="1.1"/>${band(.12, .3, '#a8452f')}${band(.42, .58, '#c9a13e')}${band(.68, .84, '#a8452f')}
<path d="M-22,-33L-5,-83L-2,-74L-12,-32Z" ${H1}/><path d="M-22,-33q4,4 7.5,0q3.5,4.5 7.5,.8q3.5,4.5 7.5,.5q3.5,4.5 7.5,0q3.5,4 7.5,-1.5q3,3 6.5,-3.8" fill="none" stroke-width=".9"/>
<circle cx="-5" cy="-85" r="6" fill="#d9c36a" stroke-width="1"/><path d="M-9,-88l-3,-3M-5,-91v-4M-1,-88l3,-3M-11,-84h-3.5M1,-84h3.5M-8,-81l-2,3M-2,-81l2,3" fill="none" stroke-width=".6"/></g>`)}</g>
<g class="hobbit-w hobbit-w-achievement">${F(`<path d="M-36,-10C-36,-28 -20,-36 0,-34C20,-36 36,-28 36,-10" fill="none" stroke-width="1.2"/><g transform="translate(-2,-33) rotate(-168)"><path d="M0,0C3,-4.5 10,-4.5 13,0C10,4.5 3,4.5 0,0Z" fill="#5c7044" stroke-width=".6"/><path d="M1,0H11" fill="none" stroke-width=".4" opacity=".7"/></g><g transform="translate(-13,-35) rotate(-150)"><path d="M0,0C3,-4.5 10,-4.5 13,0C10,4.5 3,4.5 0,0Z" fill="#7c8b55" stroke-width=".6"/><path d="M1,0H11" fill="none" stroke-width=".4" opacity=".7"/></g><g transform="translate(-23,-31) rotate(-128)"><path d="M0,0C3,-4.5 10,-4.5 13,0C10,4.5 3,4.5 0,0Z" fill="#4a5f3d" stroke-width=".6"/><path d="M1,0H11" fill="none" stroke-width=".4" opacity=".7"/></g><g transform="translate(-31,-23) rotate(-108)"><path d="M0,0C3,-4.5 10,-4.5 13,0C10,4.5 3,4.5 0,0Z" fill="#7c8b55" stroke-width=".6"/><path d="M1,0H11" fill="none" stroke-width=".4" opacity=".7"/></g><g transform="translate(-35,-13) rotate(-92)"><path d="M0,0C3,-4.5 10,-4.5 13,0C10,4.5 3,4.5 0,0Z" fill="#5c7044" stroke-width=".6"/><path d="M1,0H11" fill="none" stroke-width=".4" opacity=".7"/></g><g transform="translate(2,-33) rotate(-12)"><path d="M0,0C3,-4.5 10,-4.5 13,0C10,4.5 3,4.5 0,0Z" fill="#7c8b55" stroke-width=".6"/><path d="M1,0H11" fill="none" stroke-width=".4" opacity=".7"/></g><g transform="translate(13,-35) rotate(-30)"><path d="M0,0C3,-4.5 10,-4.5 13,0C10,4.5 3,4.5 0,0Z" fill="#5c7044" stroke-width=".6"/><path d="M1,0H11" fill="none" stroke-width=".4" opacity=".7"/></g><g transform="translate(23,-31) rotate(-52)"><path d="M0,0C3,-4.5 10,-4.5 13,0C10,4.5 3,4.5 0,0Z" fill="#7c8b55" stroke-width=".6"/><path d="M1,0H11" fill="none" stroke-width=".4" opacity=".7"/></g><g transform="translate(31,-23) rotate(-72)"><path d="M0,0C3,-4.5 10,-4.5 13,0C10,4.5 3,4.5 0,0Z" fill="#4a5f3d" stroke-width=".6"/><path d="M1,0H11" fill="none" stroke-width=".4" opacity=".7"/></g><g transform="translate(35,-13) rotate(-88)"><path d="M0,0C3,-4.5 10,-4.5 13,0C10,4.5 3,4.5 0,0Z" fill="#7c8b55" stroke-width=".6"/><path d="M1,0H11" fill="none" stroke-width=".4" opacity=".7"/></g><circle cx="0" cy="-34" r="2.6" fill="#c9a13e" stroke-width=".6"/>`)}</g>
<g class="hobbit-w hobbit-w-pvp">${F(`<g transform="translate(0,-4) rotate(7 0 -30)"><path d="M-44,-20C-48,-52 -27,-66 0,-66C27,-66 48,-52 44,-20Z" fill="url(#hobIr)" stroke-width="1.2"/>
<path d="M-44,-20C-48,-52 -27,-66 -4,-66C-22,-56 -28,-42 -27,-20Z" ${H1}/><path d="M-44,-20C-48,-52 -27,-66 -16,-65C-32,-54 -38,-40 -37,-20Z" ${H2}/>
<path d="M20,-60C32,-54 40,-44 41,-33C35,-44 28,-53 20,-60Z" fill="#fff" opacity=".3" stroke="none"/><path d="M0,-66V-28M-22,-58l5,3M28,-46l4,6M12,-52l3,2" fill="none" stroke-width=".7"/>
<path d="M-46.5,-29Q0,-21 46.5,-29L46.5,-19Q0,-11 -46.5,-19Z" fill="#4a5056" stroke-width="1.2"/><path d="M-46.5,-29Q-25,-25.5 -16,-24.5L-16,-14.5Q-32,-16 -46.5,-19Z" ${H1}/>
<g fill="#aab2b8" stroke-width=".6"><circle cx="-36" cy="-22.5" r="1.7"/><circle cx="-20" cy="-20" r="1.7"/><circle cx="20" cy="-20" r="1.7"/><circle cx="36" cy="-22.5" r="1.7"/></g>
<path d="M-4.5,-16L-3.5,3Q0,6.5 3.5,3L4.5,-16Z" fill="#5d646b" stroke-width="1.1"/><path d="M0,-14V2" fill="none" stroke-width=".5" opacity=".7"/></g>`)}</g>
</g>`);

  // body: shirt, waistcoat, brass buttons; the extras per mood
  const rosette = (x, y, a, b) => `<g transform="translate(${x},${y})"><path d="M-3.5,5L-8,22L-3,18.5L-.5,24L1.5,6ZM3,5L8.5,21L3.5,18L1,23L-1,6Z" fill="${a}" stroke-width=".8"/><path d="M0,-10l2.6,2.2l3.4,-.8l.9,3.4l3.1,1.6l-1.6,3.1l1,3.3l-3.3,1l-1.5,3.2l-3.3,-1.2l-3,1.8l-1.9,-2.9l-3.4,-.4l.2,-3.5l-2.5,-2.4l2.3,-2.6l-.5,-3.4l3.4,-.6l1.7,-3Z" fill="${a}" stroke-width=".8"/><circle r="5.4" fill="${b}" stroke-width=".7"/><path d="M-1.2,-2.6L.6,-3.4V3M-1.2,3H2.4" fill="none" stroke-width=".9"/></g>`;
  const BODY = Lyr('hobbit-st', F(`<path d="M56,252L56,214C56,203 66,197 84,194L126,194C144,197 154,203 154,214L154,252Z" fill="${LINEN}" stroke-width="1.1"/>
<path d="M56,252L56,214C56,203 66,197 78,195C68,202 66,214 67,252Z" fill="#6b4a2a" opacity=".16" stroke="none"/><path d="M56,252L56,214C56,203 66,197 78,195C68,202 66,214 67,252Z" ${H1}/>
<path d="M62,206q5,5 10,2M146,205q-5,6 -9,3M60,220q4,3 8,1" fill="none" stroke-width=".5" opacity=".7"/>
<path d="M74,252L74,212C76,202 84,197 93,195L105,208L117,195C126,197 134,202 136,212L136,252Z" fill="#7a3a2e" stroke-width="1.1"/>
<path d="M74,252L74,212C76,202 84,197 93,195L97,200C87,202 83,212 84,252Z" ${H1}/><path d="M74,252L74,212C76,205 79,201 84,198C80,206 79,216 79,252Z" ${H2}/>
<path d="M105,208V252M122,221h9" fill="none" stroke-width=".7"/><path d="M106,223C111,230 122,229 127,222" fill="none" stroke="#c9a13e" stroke-width="1" stroke-dasharray="1.4 1"/>
<g fill="#d9b45a" stroke-width=".7"><circle cx="102" cy="214" r="2.1"/><circle cx="102" cy="223" r="2.1"/><circle cx="102" cy="232" r="2.1"/><circle cx="102" cy="241" r="2.1"/></g>
<path d="M92,196L98,192L105,204L112,192L118,196L110,208L105,204L100,208Z" fill="#efe8d6" stroke-width=".9"/><path d="M101,202.5L109,202.5L107.5,209L102.5,209Z" fill="#b5652f" stroke-width=".8"/>
<g class="hobbit-o hobbit-o-good"><path d="M90,196L120,196L129,252L81,252Z" fill="#efe8d6" stroke-width="1"/><path d="M90,196L96,196L90,252L81,252Z" ${H1}/><path d="M105,198V252M98,198L94,252M113,198L118,252" fill="none" stroke-width=".5" opacity=".5"/><path d="M91,197q14,6 28,0" fill="none" stroke-width=".8"/></g>
<g class="hobbit-o hobbit-o-achievement"><path d="M62,200L78,194L142,252L118,252Z" fill="#8a2f2a" stroke-width="1"/><path d="M65,199L122,252M75,195.5L138,252" fill="none" stroke="#d9b45a" stroke-width="1.2"/>${rosette(86, 207, '#b08a3a', '#8a2f2a')}</g>
<g class="hobbit-o hobbit-o-levelup">${rosette(124, 209, '#3f7396', '#e3c765')}</g>
<g class="hobbit-o hobbit-o-death"><path d="M56.5,204L72,199L74,207L56,213Z" fill="#14110f" stroke-width=".9"/></g>`));

  // raised arms and what the hands hold
  const sleeve = (x1, y1, x2, y2) => { const cx = x1 + (x2 - x1) * .8, cy = y1 + (y2 - y1) * .8; return `<path d="M${x1},${y1}L${x2},${y2}" fill="none" stroke-width="15"/><path d="M${x1},${y1}L${x2},${y2}" fill="none" stroke="${LINEN}" stroke-width="13"/><path d="M${x1 - 4},${y1}L${x2 - 4},${y2}" fill="none" stroke="#a89878" stroke-width="3.5" opacity=".55"/><path d="M${cx},${cy}L${x2},${y2}" fill="none" stroke-width="15.5" stroke-linecap="butt"/><path d="M${cx},${cy}L${x2},${y2}" fill="none" stroke="#efe8d6" stroke-width="13.5" stroke-linecap="butt"/>`; };
  const fist = (x, y, r = 0) => `<g transform="translate(${x},${y}) rotate(${r})"><path d="M-7,-2C-7,-8 7,-8 7,-2L6.5,3C6,8 -6,8 -6.5,3Z" fill="${SKIN}" stroke-width="1"/><path d="M-7,-2C-7,-8 -1,-8 -2,-6C-4,-2 -4,3 -2,7C-5,7 -6.3,5 -6.5,3Z" fill="#6b3f2a" opacity=".25" stroke="none"/><path d="M-3.4,-5.5V1M0,-6V1.5M3.4,-5.5V1" fill="none" stroke-width=".6"/></g>`;
  const arm = (x1, x2, y2) => sleeve(x1, RIM + 12, x2, y2 + 8);
  const P = (m, inner) => `<g class="hobbit-p ${m.split(' ').map((x) => 'hobbit-p-' + x).join(' ')}">${F(inner)}</g>`;
  const B = (m, inner) => `<g class="hobbit-b-${m}">${inner}</g>`;
  const PROPS = Lyr('hobbit-st', `
${P('calibrating poor good levelup death achievement', `<path d="M51,211C45,209 45,204 42,201l-2.5,2.5C42,207 44,214 51,216Z" fill="#6b3a26"/><path d="M50,213C50,203 70,203 70,213L70,224L50,224Z" fill="#6b3a26" stroke-width="1"/><path d="M50,213C50,205 58,203 58,205C54,208 54,216 55,224L50,224Z" ${H1}/><path d="M54,205Q60,200 66,205Z" fill="#7a4630"/><circle cx="60" cy="201" r="1.9" fill="#7a4630"/><path d="M63,207C66,208 68,211 68,214" fill="none" stroke="#e0b090" stroke-width="1" opacity=".7"/>`)}
${P('calibrating', `${arm(140, 150, 199)}<g transform="translate(150,186) rotate(-6)"><path d="M-12,-11L0,-9L12,-11L13,-8L0,-6L-13,-8Z" fill="#efe8d6" stroke-width=".7"/><path d="M-14,-8L0,-6L14,-8L14,9L0,11L-14,9Z" fill="#6b4630" stroke-width="1"/><path d="M-14,-8L0,-6L0,11L-14,9Z" ${H1}/><path d="M0,-6V11M-11,-4.5l4,.6M11,-4.5l-4,.6M-11,6l4,.6M11,6l-4,.6" fill="none" stroke="#c9a13e" stroke-width=".8"/><path d="M4,10.5l1,7l1.5,-2l1.5,2l-1,-7.3Z" fill="#a3402c" stroke-width=".5"/></g>${fist(150, 199)}`)}
${P('poor', `${arm(140, 152, 201)}${B('poor', `<g transform="translate(153,188) rotate(-12)"><ellipse rx="19" ry="5.8" fill="#e4dccb" stroke-width="1"/><ellipse cy="-1.8" rx="9.5" ry="2.6" fill="#cfc6b2" stroke-width=".7"/><path d="M-19,0A19,5.8 0 0 0 0,5.8C-8,4 -14,2 -19,0Z" ${H1}/><path d="M-15,-1.5Q0,-6.5 15,-1.5" fill="none" stroke="#4d6a8a" stroke-width=".7"/></g>`)}${fist(152, 199, 8)}`)}
${P('meh', B('meh', `${arm(72, 60, 203)}<ellipse cx="59" cy="197" rx="15" ry="3.8" fill="#e6e1d2" stroke-width=".9"/><path d="M50,186C44,186 44,193 51,193" fill="none" stroke-width="3.2"/><path d="M50,186C44,186 44,193 51,193" fill="none" stroke="#e6e1d2" stroke-width="1.6"/><path d="M49.5,183H68.5C68.5,192 64,196 59,196C54,196 49.5,192 49.5,183Z" fill="#e6e1d2" stroke-width="1"/><path d="M49.5,183C49.5,192 54,196 57,196C53,192 53,187 54,183Z" ${H1}/><ellipse cx="59" cy="183" rx="9.5" ry="2.2" fill="#8a5a30" stroke-width=".8"/><path d="M50,187Q59,190.5 68,187" fill="none" stroke="#4d6a8a" stroke-width="1.1"/>${fist(61, 204)}`))}
${P('meh', `${arm(140, 150, 203)}<circle cx="151" cy="192" r="7" fill="#c9a468" stroke-width=".9"/><path d="M148,189h.1M152,188h.1M155,192h.1M149,193h.1M152,195.5h.1M146.5,192h.1" fill="none" stroke-width="1.1"/><path d="M145,189a7,7 0 0 1 9,-3" fill="none" stroke="#f0d8a0" stroke-width=".9"/>${fist(150, 201)}`)}
${P('good', B('good', `${arm(140, 156, 187)}<path d="M143,170C143,164 171,164 171,170L169,182C166,186 148,186 145,182Z" fill="#c2924c" stroke-width="1"/><path d="M143,170L145,182C147,185 151,186 153,186L150,172Z" ${H1}/><ellipse cx="157" cy="169" rx="14" ry="4.8" fill="#dab46c" stroke-width="1"/><path d="M145,171.5l1,-2.5M149,173.2l.6,-2.6M153.5,174l.3,-2.7M158,174l0,-2.7M162.5,173.6l-.5,-2.7M166.5,172.5l-.9,-2.5M169.5,171l-1.2,-2.2M148,176v6M158,178v6M166,176l-1,6" fill="none" stroke-width=".55"/><path d="M153,168q4,-3 8,0q-4,3 -8,0M157,166.5v3" fill="#c79a54" stroke-width=".5"/><path d="M163,165.3a4.5,4.5 0 0 0 7.5,4.8L171,171L169.7,176.5C166,176 163,172 163,165.3Z" fill="#b5705a" stroke-width=".8"/>${fist(156, 187)}`))}
${P('great', B('great', `${arm(72, 56, 201)}<path d="M41,178C32,178 32,192 42,192" fill="none" stroke-width="4"/><path d="M41,178C32,178 32,192 42,192" fill="none" stroke="#8a8f92" stroke-width="2.2"/><path d="M40,172H64L63,197C58,199.5 46,199.5 41,197Z" fill="#9a7a52" stroke-width="1"/><path d="M40,172L41,197C43,198 46,199 48,199L46,172Z" ${H1}/><path d="M46,173v25M52,173v26M58,173v25" fill="none" stroke-width=".5" opacity=".7"/><path d="M40.3,177Q52,180 63.8,177M40.8,191Q52,194 63.2,191" fill="none" stroke="#b9bfc2" stroke-width="2.2"/><path d="M40.3,177Q52,180 63.8,177M40.8,191Q52,194 63.2,191" fill="none" stroke-width=".5" transform="translate(0,1.3)"/><path d="M39,173C36,166 44,163 47,167C49,161 58,162 59,167C64,164 68,170 64,174C56,176 46,176 39,173Z" fill="#f1ebda" stroke-width=".9"/><path d="M62,174c2,3 1,6 -.5,8c-1.5,-2 -1.5,-5 -.5,-8Z" fill="#f1ebda" stroke-width=".7"/>${fist(58, 195)}`))}
${P('superb', B('superb', `${arm(72, 54, 196)}<path d="M54,192L41,163" fill="none" stroke-width="1.3"/>${fist(54, 196, -20)}`))}
${P('superb', `<ellipse cx="146" cy="214" rx="23" ry="4.5" fill="#e4dccb" stroke-width=".9"/><g fill="none"><path d="M136,181V193M146,179V192M156,181V193" stroke-width="3.6"/><path d="M136,181V193M146,179V192M156,181V193" stroke="#e9dfc6" stroke-width="2.2"/><path d="M135,184l2,1M135,188l2,1M145,183l2,1M145,187l2,1M155,184l2,1M155,188l2,1" stroke="#a8452f" stroke-width="1"/></g>
<path d="M127,194C127,189 165,189 165,194L165,211C160,216 132,216 127,211Z" fill="#f1e9d4" stroke-width="1"/><path d="M127,194L127,211C129,213 133,214.5 136,215L135,196Z" ${H1}/><ellipse cx="146" cy="193.5" rx="19" ry="4.6" fill="#f7f1e0" stroke-width=".9"/>
<path d="M127,195q3.2,7 6.3,0q3.2,8 6.3,0q3.2,6 6.3,0q3.2,8 6.3,0q3.2,6 6.3,0q3.2,7 6.3,0" fill="#c98a8a" stroke-width=".7"/><path d="M127,206Q146,212 165,206" fill="none" stroke="#a8452f" stroke-width="2.4"/><path d="M131,210.5h.1M138,212.5h.1M146,213.3h.1M154,212.5h.1M161,210.5h.1" fill="none" stroke="#c9a13e" stroke-width="2"/>`)}
${P('pvp', B('pvp', `${arm(140, 158, 197)}<path d="M159,196L170,170" fill="none" stroke-width="5.5"/><path d="M159,196L170,170" fill="none" stroke="#4a4540" stroke-width="3.5"/><ellipse cx="175" cy="153" rx="19" ry="18" fill="#4a4641" stroke-width="1.2"/><ellipse cx="175.5" cy="152.5" rx="14.5" ry="13.5" fill="#2e2c29" stroke-width=".8"/><path d="M158,150A19,18 0 0 1 172,135.5" fill="none" stroke="#b9b2a6" stroke-width="1.2" opacity=".7"/><path d="M168,146q6,-5 13,-2M167,158q3,4 8,5" fill="none" stroke="#6a655c" stroke-width=".7"/>${fist(158, 197, 22)}`))}
${P('pvp', `${arm(72, 56, 203)}<g style="filter:drop-shadow(0 0 2.5px #8cc4f4)"><path d="M53,197L37,163L41,164L58,194Z" fill="#d6e8f2" stroke-width=".9"/><path d="M39,165L55,195" fill="none" stroke-width=".5" opacity=".6"/></g><path d="M47,199L64,191" fill="none" stroke-width="4.2"/><path d="M47,199L64,191" fill="none" stroke="#c9a13e" stroke-width="2.4"/>${fist(57, 202, -24)}`)}
${P('death', B('death', `${sleeve(148, 228, 122, 211)}<g transform="translate(103,207) rotate(-7) scale(1.12)"><ellipse cy="3" rx="25" ry="5.5" fill="#3f4d2e" stroke-width="1.1"/><path d="M-15,3C-17,-11 -9,-17 0,-16C9,-17 17,-11 15,3Z" fill="#5c6e44" stroke-width="1.1"/><path d="M-15,3C-17,-11 -9,-17 -4,-16C-9,-10 -10,-3 -9,3Z" ${H1}/><path d="M-15.5,-2Q0,2 15.5,-2L15,3Q0,7 -15,3Z" fill="#3a2a1c" stroke-width=".8"/><path d="M-25,3A25,5.5 0 0 0 25,3C14,6 -14,6 -25,3Z" fill="#4f5f3a" stroke-width="1"/></g>${fist(124, 209, 70)}`))}
${P('achievement', `<g transform="translate(170,196) rotate(-24)"><path d="M38,-2l8,-4l1.5,5Z" fill="#7a6a3a" stroke-width=".8"/><ellipse rx="40" ry="14.5" fill="#5f7a44" stroke-width="1.1"/><path d="M-38,-3Q0,-16 38,-3M-39.5,2.5Q0,-6 39.5,2.5M-38,8Q0,3 38,8" fill="none" stroke="#b4bb74" stroke-width="2.4" opacity=".85"/><path d="M-40,0A40,14.5 0 0 0 22,12C0,14 -26,10 -40,0Z" ${H1}/><path d="M-32,-7Q0,-17 32,-7" fill="none" stroke="#e4e8b0" stroke-width=".9" opacity=".6"/></g>${fist(160, 192, -24)}${rosette(184, 190, '#a3402c', '#e3c765')}`)}`);

  // the hamper, its cloth, the things strapped to it
  const hamGar = () => {
    let s = '', stem = '';
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, x = 56 + 98 * t, y = 233 + 11 * Math.sin(Math.PI * t), a = (i % 2 ? -50 : 50) + (t < .5 ? 180 : 0) + (i * 37 % 17) - 8;
      stem += (i ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
      s += `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${a})"><path d="M0,0C2.5,-4 8.5,-4 12,0C8.5,4 2.5,4 0,0Z" fill="${['#5c7044', '#7c8b55', '#4a5f3d'][i % 3]}" stroke-width=".6"/></g>`;
      if (i % 3 === 1) s += `<g transform="translate(${x.toFixed(1)},${(y + 2).toFixed(1)})"><path d="M0,-4.2a2,2 0 0 1 3.6,1.8a2,2 0 0 1 .8,4a2,2 0 0 1 -3.2,2.4a2,2 0 0 1 -3.8,-.6a2,2 0 0 1 -1,-4a2,2 0 0 1 3.6,-3.6Z" fill="${['#efe6cf', '#d9a0a0', '#e3c765'][(i / 3 | 0) % 3]}" stroke-width=".6"/><circle r="1.3" fill="#b5652f" stroke-width=".4"/></g>`;
    }
    return `<path d="${stem}" fill="none" stroke-width="1.1"/>${s}`;
  };
  const FRONT = Lyr('hobbit-st', F(`<path d="M46,226V214C46,207 37,207 37,214" fill="none" stroke-width="3.8"/><path d="M46,226V214C46,207 37,207 37,214" fill="none" stroke="#8a6238" stroke-width="2.2"/>
<path d="M42,226C41,238 44,250 46,258C48,250 51,238 50,226Z" fill="#34423c" stroke-width="1"/><path d="M44.5,228C44,238 45,248 46,255M47.5,228C48,238 47,248 46,255" fill="none" stroke-width=".5" opacity=".7"/>
<path d="M52,218L158,218L154,246Q105,251 56,246Z" fill="url(#hobWk)" stroke-width="1.2"/><path d="M52,218L158,218L154,246Q105,251 56,246Z" fill="url(#hobWv)" stroke="none"/>
<path d="M52,218L72,218L72,248Q62,247.5 56,246Z" fill="#4a3018" opacity=".2" stroke="none"/><path d="M52,218L72,218L72,248Q62,247.5 56,246Z" ${H1}/>
<path d="M54,244Q105,249 156,244" fill="none" stroke-width="2.6"/><path d="M54,244Q105,249 156,244" fill="none" stroke="#b8935a" stroke-width="1.4" stroke-dasharray="3 1.5"/>
<path d="M76,226V248M80,226V248M130,226V248M134,226V248" fill="none" stroke="#4a2f1c" stroke-width="2.2"/><rect x="74.5" y="234" width="7" height="6" fill="#d9b45a" stroke-width=".7"/><rect x="128.5" y="234" width="7" height="6" fill="#d9b45a" stroke-width=".7"/>
<path d="M41,234h13M42,250h14" fill="none" stroke="#4a2f1c" stroke-width="2.4"/>
<g class="hobbit-cloth"><path d="M49,214L161,214L162,226L151,235L139,228L124,236L108,229L92,236L78,228L64,235L51,227Z" fill="url(#hobCk)" stroke-width="1.1"/><path d="M49,214L66,214L66,233L64,235L51,227Z" ${H1}/><path d="M49.5,217.5H161" fill="none" stroke-width=".5" opacity=".6"/><path d="M64,235l1,-9M92,236l-1,-10M124,236l1,-10M151,235l-1,-9" fill="none" stroke-width=".5" opacity=".6"/></g>
<g class="hobbit-o hobbit-o-great">${hamGar()}</g>
<path d="M158,221h8v3" fill="none" stroke-width="1.4"/><path d="M161,227L166,222L171,227Z" fill="#8a6a2a" stroke-width=".9"/><rect x="161" y="227" width="10" height="13" fill="#f0c060" stroke-width="1"/><path d="M166,227V240" fill="none" stroke-width=".7"/><rect x="160" y="240" width="12" height="3" fill="#8a6a2a" stroke-width=".8"/>
<circle cx="51" cy="248" r="2.3" fill="#c9a13e" stroke-width=".8"/><circle cx="159" cy="248" r="2.3" fill="#c9a13e" stroke-width=".8"/>`));

  const BACK = Lyr('hobbit-st', F(`<g class="hobbit-o hobbit-o-levelup"><path d="M30,84H36V252H30Z" fill="#c9a86a" stroke-width="1"/><path d="M36,228h18M36,246h20" fill="none" stroke-width="2.2"/><path d="${Array.from({ length: 21 }, (_, i) => `M36,${92 + i * 6}h${i % 5 ? -2.6 : -4.5}`).join('')}" fill="none" stroke-width=".6"/><path d="M29,94H92V98.5H29Z" fill="#8a6a3e" stroke-width="1"/><rect x="27.5" y="92.5" width="11" height="7.5" fill="#d9b45a" stroke-width=".8"/><path d="M38,111h10M38,111l3,-2.5M38,111l3,2.5" fill="none" stroke="#a3402c" stroke-width="1.2"/></g>`));
  const FLAGS = Lyr('', `<g class="hobbit-o hobbit-o-good hobbit-o-pvp" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round"><path d="M53,226L34,144" fill="none" stroke-width="3.4"/><path d="M53,226L34,144" fill="none" stroke="#8a6238" stroke-width="1.8"/><circle cx="33.7" cy="142.5" r="2.4" fill="#c9a13e" stroke-width=".8"/>
<g class="hobbit-flag"><g class="hobbit-o hobbit-o-good"><path d="M35,147L2,151L12,156.5L1,163L37,161Z" fill="#55723f" stroke-width="1"/><path d="M35,151.5L12,153.5M36,157L11,159.5" fill="none" stroke="#d9c36a" stroke-width="1.3"/></g>
<g class="hobbit-o hobbit-o-pvp"><path d="M35,145L3,148L5,170L39,165Z" fill="#8a2a22" stroke-width="1"/><path d="M35,145L3,148L5,170L39,165Z" fill="url(#hobCk)" opacity=".55" stroke="none"/></g></g></g>`);

  const rimHand = (x0, cls) => {
    let s = '';
    for (let i = 0; i < 4; i++) {
      const x = x0 + i * 5.7, len = [9, 10.5, 10, 8.5][i], y = RIM - 3;
      s += `<g class="hobbit-fg" style="--i:${i}"><path d="M${x - 2.7},${y - 2}C${x - 2.7},${y - 6.5} ${x + 2.7},${y - 6.5} ${x + 2.7},${y - 2}L${x + 2.6},${y + len - 3}C${x + 2.6},${y + len} ${x - 2.6},${y + len} ${x - 2.6},${y + len - 3}Z" fill="${SKIN}" stroke="${INK}" stroke-width=".9"/><path d="M${x - 2.7},${y - 2}C${x - 2.7},${y - 6.5} ${x},${y - 6} ${x - .6},${y - 4}L${x - .8},${y + len - 1}C${x - 2.4},${y + len - .5} ${x - 2.6},${y + len - 2} ${x - 2.6},${y + len - 3}Z" fill="#6b3f2a" opacity=".25"/><path d="M${x - 1.7},${y - .5}h3.4M${x - 1.6},${y + len - 3.6}q1.6,-1.5 3.2,0" fill="none" stroke="${INK}" stroke-width=".5"/></g>`;
    }
    return `<g class="hobbit-hand ${cls}"><g class="hobbit-shift"><path d="M${x0 - 4},${RIM - 5}C${x0 - 3},${RIM - 12} ${x0 + 20},${RIM - 12} ${x0 + 21},${RIM - 5}Z" fill="#efe8d6" stroke="${INK}" stroke-width=".8"/>${s}</g></g>`;
  };
  const conf = () => { let s = ''; const c = ['#b5432f', '#e0b23c', '#3f6a8a', '#e2d8b8', '#6f8a4e']; for (let i = 0; i < 14; i++) s += `<rect class="hobbit-conf" x="${18 + (i * 53) % 176}" y="${70 + (i * 29) % 40}" width="3.4" height="2.2" fill="${c[i % 5]}" stroke="${INK}" stroke-width=".3" style="--t:${(2.6 + (i % 5) * .35).toFixed(2)}s;--d:${(-i * .43).toFixed(2)}s;--x:${(i % 3 - 1) * 12}px"/>`; return s; };
  const burst = (x, y, r, col, d) => { let s = ''; for (let i = 0; i < 10; i++) { const a = i * 36 + (x % 20); s += `<g transform="rotate(${a})"><path d="M0,${-r * .35}V${-r}" stroke="${col}" stroke-width="1.3" stroke-dasharray="${r * .22} ${r * .1}"/><path d="M0,${-r}q2.5,-2 1,-4.5" stroke="${i % 2 ? '#fff3c4' : col}" stroke-width="1"/><circle cy="${-r - 5}" r="1" fill="#fff3c4"/></g>`; } return `<g transform="translate(${x},${y})"><g class="hobbit-fw" style="--d:${d}s" fill="none" stroke-linecap="round">${s}</g></g>`; };
  const LIVE = Lyr('', `<circle class="hobbit-halo" cx="166" cy="233" r="15" fill="url(#hobGl)"/><path class="hobbit-cand" style="--d:-.2s" d="M166,238c-2.2,-2 -1.5,-5 0,-7c1.5,2 2.2,5 0,7Z" fill="#fff3c4" stroke="#c9782a" stroke-width=".5"/>
${rimHand(71, 'hobbit-hL')}${rimHand(128, 'hobbit-hR')}
<g class="hobbit-o hobbit-o-poor"><g class="hobbit-cloud"><path d="M50,115C44,106 53,98 61,101C63,92 78,90 83,97C88,90 102,93 102,102C110,101 113,112 106,116Z" fill="#8f979d" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/><path d="M50,115C44,106 53,98 61,101C58,105 58,111 62,116Z" fill="url(#hobH1)"/><path d="M60,104q5,-5 12,-3M80,100q6,-3 12,0" fill="none" stroke="#c9d0d4" stroke-width="1" stroke-linecap="round"/></g>
${[56, 64, 72, 80, 88, 96, 60, 84].map((x, i) => `<path class="hobbit-rain" style="--d:${(-i * .23).toFixed(2)}s" d="M${x},${118 + (i % 3) * 3}l-1.3,6" stroke="#c4d6e2" stroke-width="1.1" stroke-linecap="round"/>`).join('')}
<circle class="hobbit-crumb" style="--d:0s" cx="150" cy="196" r="1" fill="#c9a468"/><circle class="hobbit-crumb" style="--d:-.4s" cx="158" cy="195" r=".8" fill="#c9a468"/></g>
<g class="hobbit-o hobbit-o-meh" fill="none" stroke="#e6e1d6" stroke-width="1" stroke-linecap="round"><path class="hobbit-steam" style="--d:0s" d="M56,179q-2.5,-3 0,-6t0,-6"/><path class="hobbit-steam" style="--d:-1.3s" d="M62,179q2.5,-3 0,-6t0,-6"/></g>
<g class="hobbit-o hobbit-o-great" fill="none" stroke="#ebe7dc" stroke-width="1.5">${[0, -1.3, -2.6].map((d) => `<ellipse class="hobbit-ring" style="--d:${d}s" cx="143" cy="186" rx="6" ry="2.6"/>`).join('')}</g>
<g class="hobbit-o hobbit-o-superb">${[[136, 180, 0], [146, 178, -.2], [156, 180, -.4]].map(([x, y, d]) => `<path class="hobbit-cand" style="--d:${d}s" d="M${x},${y}c-2.6,-2.5 -1.8,-6 0,-8.5c1.8,2.5 2.6,6 0,8.5Z" fill="#ffe9a8" stroke="#c9782a" stroke-width=".6"/>`).join('')}
<g class="hobbit-spark" stroke="#ffe9a8" stroke-width="1.1" stroke-linecap="round"><path d="M41,163m0,-9v5m0,8v5m-9,-9h5m8,0h5m-11.5,-6.5l3.5,3.5m6,6l3.5,3.5m0,-13l-3.5,3.5m-6,6l-3.5,3.5"/><circle cx="41" cy="163" r="2" fill="#fff8e0" stroke="none"/></g></g>`);
  const FXB = Lyr('', `<g class="hobbit-o hobbit-o-superb">${burst(6, 40, 20, '#e8c05a', 0)}${burst(205, 20, 17, '#e07a5a', -1.1)}${burst(197, 96, 12, '#9cc6e8', -1.9)}</g>`);
  const FXF = Lyr('', `<g class="hobbit-o hobbit-o-superb">${conf()}</g>`);
  const lantern = (c) => `<g class="hobbit-o hobbit-o-superb" stroke="${INK}"><path d="M0,0V3" stroke-width=".8"/><rect x="-3" y="2.5" width="6" height="2" fill="#3a2a1c" stroke-width=".5"/><ellipse cy="11" rx="6" ry="7" fill="${c}" stroke-width=".9"/><path d="M-3,5.5Q-5.5,11 -3,16.5M3,5.5Q5.5,11 3,16.5M0,4.5V17.5" fill="none" stroke-width=".5" opacity=".7"/><ellipse cy="11" rx="3" ry="4.5" fill="#fff3c4" opacity=".55" stroke="none"/><rect x="-3" y="17.5" width="6" height="1.8" fill="#3a2a1c" stroke-width=".5"/><path d="M0,19.5v4" stroke="#a8452f" stroke-width="1"/></g>`;
  const bunt = (a, b) => `<g class="hobbit-o hobbit-o-levelup" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"><path d="M-5.5,-1L5.5,-1L0,11Z" fill="${a}"/><path d="M-5.5,-1L5.5,-1L0,11Z" fill="${b}" transform="translate(1.5,13) rotate(8)"/></g>`;
  const ROPES = Lyr('', `<path class="hobbit-rp" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/><path class="hobbit-rp" fill="none" stroke="#b89c6a" stroke-width="1" stroke-linecap="round" stroke-dasharray="3 1.2"/>
${[['#d9a23c', '#3f7396', '#e3c765'], ['#b5432f', '#e3c765', '#d9d4c0'], ['#b5432f', '#d9d4c0', '#3f7396'], ['#d9a23c', '#e3c765', '#3f7396']].map((c) => `<g class="hobbit-dn">${lantern(c[0])}${bunt(c[1], c[2])}</g>`).join('')}`);
  const CORDS = `<svg class="hobbit-l hobbit-cords" xmlns="${NS}" width="${W}" height="${VH}" viewBox="0 0 ${W} ${VH}"><path fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/><path fill="none" stroke="#b89c6a" stroke-width=".9" stroke-linecap="round" stroke-dasharray="2.5 1.2"/></svg>`;

  const pips = (n, pvp) => {
    let s = '';
    if (pvp) return `<svg xmlns="${NS}" width="18" height="14" viewBox="0 0 18 14"><path d="M3,2L15,12M15,2L3,12" fill="none" stroke="#8a1f18" stroke-width="2.2" stroke-linecap="round"/></svg>`;
    for (let i = 0; i < 5; i++) s += i < n ? `<g transform="translate(${6 + i * 11.5},7)"><circle r="4.6" fill="var(--pc)" stroke="${INK}" stroke-width=".8"/><circle r="2.9" fill="none" stroke="#f4ecd6" stroke-width=".6" opacity=".8"/><circle cx="-1.1" r=".7" fill="${INK}"/><circle cx="1.1" r=".7" fill="${INK}"/></g>` : `<circle cx="${6 + i * 11.5}" cy="7" r="4" fill="none" stroke="${INK}" stroke-width=".8" opacity=".3"/>`;
    return `<svg xmlns="${NS}" width="58" height="14" viewBox="0 0 58 14">${s}</svg>`;
  };

  Harness.register({
    id: 'hobbit',
    name: 'The Hobbit',
    blurb: 'A respectable hobbit, airborne against his better judgement, in a quilt balloon with a picnic hamper for a basket. The ratings are told in meals and parties: an empty plate in the drizzle, tea and one biscuit, second breakfast, a pipe and a pint, and the Long-expected Party.',
    create(ctx) {
      const E = ctx.el;
      if (!document.getElementById('hobF')) document.body.append(ctx.svg(DEFS));
      const rad = Math.PI / 180;

      function fill(sign, n) {
        const b = sign.querySelector('.hobbit-board'), ach = n.kind === 'achievement';
        sign.classList.toggle('hobbit-wide', ach || !!n.more);
        b.textContent = '';
        if (ach) b.append(E('div', 'hobbit-tag', n.label));
        b.append(E('div', 'hobbit-title', n.title));
        const fig = E('div', 'hobbit-fig', n.big);
        if (n.unit) fig.append(E('span', 'hobbit-unit', n.unit));
        b.append(fig);
        if (n.kind === 'kill') {
          const r = E('div', 'hobbit-rate');
          r.append(ctx.svg(pips(RANK[n.mood] || 0, n.mood === 'pvp')));
          r.append(n.label ? E('span', 'hobbit-word', n.label) : E('span', 'hobbit-q', '?'));
          b.append(r);
        } else if (!ach && n.label) b.append(E('div', 'hobbit-tag', n.label));
        b.append(E('div', 'hobbit-more', n.more));
      }

      function makeRig(n, flying) {
        let mood = M[n.mood] ? n.mood : 'calibrating';
        const root = E('div', 'hobbit'), craft = E('div', 'hobbit-craft');
        root.dataset.mood = mood; root.dataset.sky = ctx.skyMode();
        if (ctx.reduced) root.classList.add('hobbit-rm');
        const lay = (cls, ...kids) => { const d = E('div', 'hobbit-l ' + cls); d.append(...kids); return d; };
        const S_ = (m) => ctx.svg(m);
        const glow = E('div', 'hobbit-glow'), flame = S_(FLAME), ropes = S_(ROPES), face = S_(FACE), cords = S_(CORDS);
        const env = lay('hobbit-env', S_(ENV), glow, flame);
        const curls = lay('hobbit-curls', S_(CURLS));
        const head = lay('hobbit-head', S_(HEAD), curls, face, S_(WEAR));
        const torso = lay('hobbit-torso', S_(BODY));
        const car = lay('hobbit-car', S_(BACK), S_(FLAGS), torso, head, S_(PROPS), S_(FRONT), S_(LIVE));
        const sign = E('div', 'hobbit-sign'), jolt = E('div');
        jolt.append(E('div', 'hobbit-board')); sign.append(E('i', 'hobbit-eyelet'), E('i', 'hobbit-eyelet'), jolt);
        fill(sign, n);
        craft.append(S_(FXB), env, ropes, car, S_(FXF), cords);
        root.append(craft, sign);

        const q = (r, s) => [...r.querySelectorAll(s)];
        const irs = q(face, '.hobbit-ir'), lids = q(face, '.hobbit-lid'), lows = q(face, '.hobbit-low'), bws = q(face, '.hobbit-bw');
        const mf = face.querySelector('.hobbit-mf'), mt = face.querySelector('.hobbit-mt'), ml = face.querySelector('.hobbit-ml'), mu = face.querySelector('.hobbit-mu');
        const rps = q(ropes, '.hobbit-rp'), dns = q(ropes, '.hobbit-dn'), cps = q(cords, 'path');
        const rnd = ctx.rng((Math.random() * 1e9) | 0);
        const Pz = { ...DEF }; for (const k in DEF) if (M[mood][k] != null) Pz[k] = M[mood][k];
        if (flying && mood === 'levelup') Pz.by = 0;
        const S = { last: 0, phase: flying ? 'arrive' : 'read', ov: [], script: [], gx: 0, gy: 0, ix: 0, iy: 0, gNext: 0, fear: 0, blinks: [], bNext: 0, th: 0, tv: 0, fk: .2, puff: 0, mkey: '', ph: rnd() * 6.28, hb: 0, pl: 0, born: performance.now() };
        if (flying && mood === 'levelup') S.ov.push({ from: 0, until: Infinity, v: { by: 0 }, hold: true });

        const target = (k, now) => { for (let i = S.ov.length - 1; i >= 0; i--) { const o = S.ov[i]; if (o.from <= now && o.until > now && k in o.v) return o.v[k]; } const v = M[mood][k]; return v != null ? v : DEF[k]; };
        const look = (now, g, ms) => { const p = g === 'prop' ? (M[mood].gp || GZ.you) : (GZ[g] || g); S.gx = p[0]; S.gy = p[1]; S.gNext = now + ms; };
        function pick(now) {
          if (S.fear === 1) { S.fear = 0; look(now, rnd() < .6 ? 'up' : 'you', 500 + rnd() * 500); return; }
          const r = rnd(), m = M[mood];
          if (mood === 'death') { look(now, [(rnd() - .5) * 1.6, 2.2], 1500 + rnd() * 1500); return; }
          if (S.phase === 'arrive') { if (r < .55) look(now, 'up', 500 + rnd() * 600); else if (r < .8) fear(now); else look(now, 'you', 400 + rnd() * 400); return; }
          if (r < m.gw) look(now, 'prop', 700 + rnd() * 900);
          else if (r < m.gw + .25) look(now, 'sign', 600 + rnd() * 800);
          else if (r < m.gw + .5) look(now, 'you', 900 + rnd() * 1300);
          else if (r < m.gw + .62) look(now, 'up', 500 + rnd() * 600);
          else if (mood === 'pvp') look(now, rnd() < .5 ? [2.8, 0] : [-2.8, 0], 500 + rnd() * 500);
          else fear(now);
        }
        function fear(now) { // he does not like heights
          look(now, rnd() < .5 ? 'dl' : 'dr', 380 + rnd() * 160); S.fear = 1;
          if (mood !== 'superb') S.ov.push({ from: now + 80, until: now + 600, v: { bl: -4, br: -4, mw: 6, mc: -.6, mo: 0, lid: .05 } });
        }
        const blinkV = (now) => { let v = 0; for (const t0 of S.blinks) { const u = now - t0; if (u >= 0 && u < 230) v = Math.max(v, u < 70 ? u / 70 : u < 110 ? 1 : 1 - (u - 110) / 120); } return v; };
        function arrive(now) {
          S.ov = S.ov.filter((o) => !o.hold);
          const b = BIZ[mood]; if (!b || ctx.reduced) return;
          for (const [a, z, v] of b.ov) S.ov.push({ from: now + a, until: now + z, v });
          S.script = b.g.map(([a, g, ms]) => ({ at: now + a, g, ms }));
          root.classList.remove('hobbit-biz'); void root.offsetWidth; root.classList.add('hobbit-biz');
          setTimeout(() => root.classList.remove('hobbit-biz'), 1400);
        }
        const rot = (x, y, a) => { const c = Math.cos(a), s = Math.sin(a), dx = x - CX, dy = y - HY; return [CX + dx * c - dy * s, HY + dx * s + dy * c]; };
        const f1 = (v) => v.toFixed(1), f2 = (v) => v.toFixed(2);

        function tick(now, f) {
          const dt = Math.min(.05, S.last ? (now - S.last) / 1000 : .016); S.last = now;
          if (f.phase !== S.phase) {
            const was = S.phase; S.phase = f.phase;
            if (f.phase === 'read' && was === 'arrive') arrive(now);
            if (f.phase === 'leave') { S.puff = now + 520; look(now, 'up', 700); S.ov.push({ from: now, until: now + 600, v: { bl: -4, br: -4 } }); }
          }
          while (S.script.length && S.script[0].at <= now) { const s = S.script.shift(); look(now, s.g, s.ms); }
          if (now >= S.gNext) pick(now);
          if (now >= S.bNext) { S.blinks = [now]; if (rnd() < .22) S.blinks.push(now + 270); S.bNext = now + (mood === 'death' ? 3200 : 1700) + rnd() * 3800; }
          if (S.ov.length > 6) S.ov = S.ov.filter((o) => o.until > now);
          const a = 1 - Math.exp(-dt / .13), ag = 1 - Math.exp(-dt / .05);
          for (const k in DEF) Pz[k] += (target(k, now) - Pz[k]) * a;
          S.ix += (S.gx - S.ix) * ag; S.iy += (S.gy - S.iy) * ag;
          const sec = now / 1000, br = Math.sin(sec * 1.43 + S.ph), br2 = Math.sin(sec * 1.43 + S.ph - .7);
          const lean = f.lean, phi = f.swing * .55, pr = phi * rad;
          // burner
          const burn = now < S.puff ? 1 : f.burn;
          S.fk += (burn - S.fk) * (1 - Math.exp(-dt / .12));
          const fk = S.fk * (mood === 'death' ? .45 : 1);
          flame.style.transform = `scale(${f2(.5 + .5 * fk)},${f2(.16 + .9 * fk)})`;
          glow.style.opacity = f2((.12 + .88 * fk) * ({ night: 1, dusk: .7, day: .2, overcast: .38 }[root.dataset.sky] || 1));
          env.style.transform = `rotate(${f2(lean * .8)}deg) scale(${(1 + .005 * br + fk * .008).toFixed(4)},${(1 - .005 * br + fk * .012).toFixed(4)})`;
          car.style.transform = `rotate(${f2(phi)}deg)`;
          torso.style.transform = `translateY(${f2(-Pz.by - br * .7)}px) scale(${(1 + br * .006 + Pz.ch).toFixed(4)},1)`;
          S.hb += (lean - S.hb) * (1 - Math.exp(-dt / .3));
          head.style.transform = `translate(${f2(S.ix * .35)}px,${f2(Pz.hy - Pz.by - br2 * 1.1)}px) rotate(${f2(Pz.hr + S.ix * .7 - phi * .6 + (lean - S.hb) * .5)}deg)`;
          curls.style.transform = `skewX(${f2(-(S.hb * 1.2 + (lean - S.hb) * 2.2) + Math.sin(sec * 2.3 + S.ph) * .5)}deg) translateY(${f2(br2 * .3)}px)`;
          // eyes
          const it = `translate(${f2(S.ix)},${f2(S.iy)})`; irs[0].setAttribute('transform', it); irs[1].setAttribute('transform', it);
          const lidv = Math.max(Pz.lid + Math.max(0, S.iy) * .06 - Math.max(0, -S.iy) * .05, blinkV(now)), lt = `translate(0,${f2(Math.max(0, Math.min(1, lidv)) * 8.6)})`;
          lids[0].setAttribute('transform', lt); lids[1].setAttribute('transform', lt);
          const wt = `translate(0,${f2(-Pz.low * 4 - blinkV(now) * .8)})`; lows[0].setAttribute('transform', wt); lows[1].setAttribute('transform', wt);
          const up = Math.min(0, S.iy) * .5 - blinkV(now) * -.8;
          bws[0].setAttribute('transform', `translate(0,${f2(Pz.bl + up)}) rotate(${f2(-Pz.bt)})`);
          bws[1].setAttribute('transform', `translate(0,${f2(Pz.br + up)}) rotate(${f2(-Pz.bt)})`);
          // mouth
          const w = Pz.mw, c = Pz.mc, o = Math.max(0, Pz.mo), key = f1(w) + f1(c) + f1(o) + f1(Pz.ma);
          if (key !== S.mkey) {
            S.mkey = key;
            const yL = -c + Pz.ma * .8, yR = -c - Pz.ma * 1.4, k = c * 1.15, top = `M${f1(-w)},${f1(yL)}Q0,${f1(k)} ${f1(w)},${f1(yR)}`;
            ml.setAttribute('d', top + `M${f1(-w - 1.2)},${f1(yL - 1.6)}q-1.2,1.6 .2,3.2M${f1(w + 1.2)},${f1(yR - 1.6)}q1.2,1.6 -.2,3.2`);
            mf.setAttribute('d', o > .3 ? `${top}Q0,${f1(k + o * 2.3)} ${f1(-w)},${f1(yL)}Z` : '');
            mt.setAttribute('d', o > 1.2 ? `M${f1(-w * .86)},${f1(yL * .8 + k * .12)}Q0,${f1(k * .98)} ${f1(w * .86)},${f1(yR * .8 + k * .12)}Q0,${f1(k + o * .95)} ${f1(-w * .86)},${f1(yL * .8 + k * .12)}Z` : '');
            const yc = (yL + yR) / 4 + (k + o * 1.15) / 2 + 3.4;
            mu.setAttribute('d', `M${f1(-w * .42)},${f1(yc)}Q0,${f1(yc + 1.5)} ${f1(w * .42)},${f1(yc)}`);
          }
          // ropes, hinged at the envelope and at the hamper
          const ar = lean * .8 * rad, e = RP.map((p) => rot(p[0], p[1], ar)), bq = [rot(54, 219, pr), rot(156, 219, pr)];
          let d = '';
          for (let i = 0; i < 4; i++) d += `M${f1(e[i][0])},${f1(e[i][1])}L${f1(bq[i % 2][0])},${f1(bq[i % 2][1])}`;
          rps[0].setAttribute('d', d); rps[1].setAttribute('d', d);
          if (mood === 'superb' || mood === 'levelup') {
            S.pl += (f.swing - S.pl) * (1 - Math.exp(-dt / .25));
            [[0, .28], [1, .3], [0, .62], [1, .6]].forEach(([i, u], j) => dns[j].setAttribute('transform', `translate(${f1(e[i][0] + (bq[i][0] - e[i][0]) * u)},${f1(e[i][1] + (bq[i][1] - e[i][1]) * u)}) rotate(${f1((f.swing - S.pl) * 5 + S.pl * 1.5 + Math.sin(sec * 1.9 + j) * 2)})`));
          }
          // the sign: a two-rope pendulum under the hamper's corners
          const tgt = Math.max(-28, Math.min(28, f.swing * 2.8));
          S.tv += ((tgt - S.th) * 42 - S.tv * 5.2) * dt; S.th += S.tv * dt;
          const th = S.th * rad, Lc = 22, a1 = rot(51, 248, pr), a2 = rot(159, 248, pr);
          const ex = (a1[0] + a2[0]) / 2 + Lc * Math.sin(th), ey = (a1[1] + a2[1]) / 2 + Lc * Math.cos(th);
          const rho = (phi + (M[mood].tilt || 0)) * rad, cx = 68 * Math.cos(rho), cy = 68 * Math.sin(rho);
          sign.style.transform = `translate(${f2(ex - CX)}px,${f2(ey - 270)}px) rotate(${f2(rho / rad)}deg)`;
          const cd = `M${f1(a1[0])},${f1(a1[1])}L${f1(ex - cx)},${f1(ey - cy - 2)}M${f1(a2[0])},${f1(a2[1])}L${f1(ex + cx)},${f1(ey + cy - 2)}`;
          cps[0].setAttribute('d', cd); cps[1].setAttribute('d', cd);
        }
        function update(nn) {
          const m2 = M[nn.mood] ? nn.mood : 'calibrating', now = performance.now();
          S.tv += (rnd() < .5 ? -1 : 1) * 95;
          if (!ctx.reduced) { jolt.classList.remove('hobbit-jolt'); void jolt.offsetWidth; jolt.classList.add('hobbit-jolt'); }
          look(now, 'sign', 420);
          S.ov.push({ from: now, until: now + 380, v: { bl: -5, br: -5, lid: .05 } });
          setTimeout(() => { fill(sign, nn); if (m2 !== mood) { mood = m2; root.dataset.mood = m2; } }, ctx.reduced ? 0 : 100);
        }
        return { root, sign, tick, update, S };
      }

      // stills idle on one shared loop
      const stills = new Set(); let raf = 0;
      const loop = (now) => {
        raf = 0;
        for (const r of stills) {
          if (!r.root.isConnected) { if (r.seen || now - r.S.born > 5000) stills.delete(r); continue; }
          r.seen = true; const p = r.S.ph;
          r.tick(now, { lean: Math.sin(now * .0007 + p) * 1.8, swing: Math.sin(now * .0011 + p * 1.7) * 2.4 + Math.sin(now * .0017 + p) * .8, phase: 'read', burn: .13 + Math.pow(Math.max(0, Math.sin(now * .0005 + p)), 10) * .7, vy: 0, t: 0 });
        }
        if (stills.size) raf = requestAnimationFrame(loop);
      };
      const flights = new Set();

      return {
        show(n) {
          const rig = makeRig(n, true);
          rig.root.style.visibility = 'hidden'; ctx.front.append(rig.root);
          const h = VH + rig.sign.offsetHeight + (n.kind === 'kill' ? 28 : 4);
          rig.root.style.visibility = '';
          rig.tick(performance.now(), { lean: 0, swing: 0, phase: ctx.reduced ? 'read' : 'arrive', burn: 1, vy: -100, t: 0 });
          const fl = ctx.fly(rig.root, { w: W, h, frame: (f) => rig.tick(performance.now(), f) });
          flights.add(fl); fl.gone.then(() => flights.delete(fl));
          return { update(nn) { rig.update(nn); fl.extend(700); } };
        },
        still(n) {
          const rig = makeRig(n, false);
          rig.tick(performance.now(), { lean: 0, swing: 0, phase: 'read', burn: .14, vy: 0, t: 0 });
          if (!ctx.reduced) { stills.add(rig); if (!raf) raf = requestAnimationFrame(loop); }
          return rig.root;
        },
        clear() { for (const fl of [...flights]) fl.end(); flights.clear(); },
      };
    },
  });
})();
