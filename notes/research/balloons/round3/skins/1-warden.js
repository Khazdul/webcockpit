// Round 3, direction 1: "The Gatewarden". The top edge of the prompt strip is
// a wall. An old dwarf gatewarden rises behind it just far enough to peer over,
// hoists a slate on a pole with the news, and sinks again. Nothing flies.
//
// One liberty with the harness: the fingertips that grip the edge and the
// braids of the beard that hang over it are drawn in a small layer ABOVE the
// prompt strip (appended to the stage, see OVER_PROMPT), since ctx.front lies
// under the prompt. Set OVER_PROMPT to false to keep everything in ctx.front.
(() => {
  const NS = 'http://www.w3.org/2000/svg', INK = '#23170f', EDGE = 46, OVER_PROMPT = true;
  const uri = (s) => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
  // 9-slice frames: a wooden slate frame and a hammered bronze plate
  const frame = (wood, dark, light, slate, peg) => uri(`<svg xmlns='${NS}' width='72' height='72'><rect x='1' y='1' width='70' height='70' rx='2.5' fill='${wood}' stroke='${INK}' stroke-width='1.4'/><path d='M4,4.4H68M4,7.8H68M4,64.4H68M4,67.6H68M4.4,4V68M7.8,4V68M64.4,4V68M67.6,4V68' stroke='${dark}' stroke-width='.6' opacity='.6'/><path d='M1.5,1.5L11,11M70.5,1.5L61,11M1.5,70.5L11,61M70.5,70.5L61,61' stroke='${INK}' stroke-width='.8'/><path d='M3,2.6H69' stroke='${light}' stroke-width='1' opacity='.7'/><rect x='11' y='11' width='50' height='50' fill='${slate}' stroke='${INK}' stroke-width='1.2'/><path d='M12,61V12H61' stroke='#000' stroke-opacity='.5' stroke-width='1.8' fill='none'/><g fill='${peg}' stroke='${INK}' stroke-width='.5'><circle cx='6' cy='6' r='1.6'/><circle cx='66' cy='6' r='1.6'/><circle cx='6' cy='66' r='1.6'/><circle cx='66' cy='66' r='1.6'/></g></svg>`);
  const SLATE = frame('#7d5c3d', '#4a321f', '#b08c62', '#272c32', '#3a2616');
  const BLACK = frame('#1d1a17', '#000', '#5b554c', '#23272c', '#6a6358');
  const BRONZE = uri(`<svg xmlns='${NS}' width='72' height='72'><rect x='1' y='1' width='70' height='70' rx='3' fill='#8a6733' stroke='${INK}' stroke-width='1.4'/><rect x='3.6' y='3.6' width='64.8' height='64.8' rx='2' fill='#c09a58' stroke='#5f4319' stroke-width='.8'/><path d='M4.5,67V4.5H67' fill='none' stroke='#ecd49c' stroke-width='1' opacity='.8'/><rect x='10' y='10' width='52' height='52' fill='#d2b274' stroke='#7c5c2a' stroke-width='.8'/><g fill='#e6cc92' stroke='#4c3413' stroke-width='.7'><circle cx='7' cy='7' r='2'/><circle cx='65' cy='7' r='2'/><circle cx='7' cy='65' r='2'/><circle cx='65' cy='65' r='2'/></g></svg>`);

  // ---- moods: how the face, the helm and the board are held ----
  const DEF = { rise: 0, bly: 0, blr: 0, bry: 0, brr: 0, lid: 2, low: 0, px: 0, py: 0, es: 1, hx: 0, hy: 0, hr: 0, hs: 1, ml: 0, grin: 0, arm: 0, paw: 0, gl: 1, fl: 1 };
  const M = {
    calibrating: { bly: -5.5, blr: -10, bry: 1, lid: 1.6, top: 128 },
    poor: { rise: -26, py: -2.7, lid: 3.4, bly: 1, bry: 1, sb: 4, tilt: -5, top: 100 },
    meh: { rise: -3, lid: 5, bly: 1.5, bry: 1.5, top: 124 },
    good: { blr: 4, brr: -4, lid: 1.4, top: 128 },
    great: { rise: 8, bly: -4, bry: -4, lid: .4, sb: 36, top: 134 },
    superb: { rise: 14, bly: -6, bry: -6.5, blr: -7, brr: 7, lid: -2, es: 1.22, hr: 11, hx: 4, hy: -9, sb: 60, gl: 1.55, fl: 1.4, top: 150 },
    pvp: { rise: 10, lid: 4.3, low: 2.4, bly: 2, bry: 2, blr: 14, brr: -14, grin: 1, ml: 8, top: 142 },
    levelup: { rise: 6, hx: -4, hy: -30, hr: 12, arm: 1, bly: -3, bry: -3, lid: 1, sb: 30, top: 168 },
    death: { rise: -2, hx: -80, hy: 60, hr: -9, hs: .86, paw: 1, py: 2.5, lid: 4.5, blr: -10, brr: 10, bly: -1, bry: -1, gl: .5, fl: .45, sb: 46, top: 106 },
    achievement: { rise: 20, lid: 3.3, bly: -2, bry: -2, blr: 3, brr: -3, sb: 40, top: 146 },
  };
  const RANK = { poor: 1, meh: 2, good: 3, great: 4, superb: 5 };
  const vars = (o) => Object.keys(o).filter((k) => k in DEF).map((k) => `--${k}:${o[k]}`).join(';');

  Harness.css('warden', `
.warden-v{${vars(DEF)};--k:1;--dn:215;--ld:70;--ad:200;--gx:0;--gy:0;--go:.95}
${Object.keys(M).map((m) => `.warden-v[data-mood=${m}]{${vars(M[m])}}`).join('\n')}
.warden-v[data-sky=dusk]{--go:.7}.warden-v[data-sky=day]{--go:.28}.warden-v[data-sky=overcast]{--go:.4}
.warden-on{--dn:0;--ld:0}
.warden-v[data-mood=pvp]{--ld:70}
.warden-on[data-mood=pvp]{--ad:0}
.warden-rig{position:absolute;left:0;top:0;right:0;overflow:hidden;pointer-events:none}
.warden-over{position:absolute;width:0;height:0;pointer-events:none;z-index:3}
.warden-who,.warden-lamp,.warden-axe{position:absolute;bottom:0;width:0;height:0}
.warden-lift{transform:translateY(calc((var(--dn) - var(--rise))*1px));transition:transform calc(.62s*var(--k)) cubic-bezier(.3,1.22,.5,1)}
.warden-on .warden-lift{transition-delay:calc(.2s*var(--k))}
.warden-br{animation:warden-br 4.4s ease-in-out infinite alternate}
.warden-head{position:absolute;left:-125px;top:${-(EDGE + 100)}px;overflow:visible}
.warden-v[data-sky=night] .warden-head,.warden-v[data-sky=night] .warden-lamp svg,.warden-v[data-sky=night] .warden-axe svg{filter:drop-shadow(0 0 .6px rgba(255,230,186,.45))}
.warden-v[data-sky=dusk] .warden-head{filter:drop-shadow(0 0 .6px rgba(255,226,190,.3))}
.warden-head *{transform-box:view-box}
.warden-helm{transform:translate(calc(var(--hx)*1px),calc(var(--hy)*1px)) rotate(calc(var(--hr)*1deg)) scale(var(--hs));transition:transform calc(.5s*var(--k)) cubic-bezier(.3,1.35,.5,1)}
.warden-bL{transform:translateY(calc(var(--bly)*1px)) rotate(calc(var(--blr)*1deg))}
.warden-bR{transform:translateY(calc(var(--bry)*1px)) rotate(calc(var(--brr)*1deg))}
.warden-bL,.warden-bR,.warden-mo,.warden-eye,.warden-pm,.warden-lid,.warden-low{transition:transform calc(.4s*var(--k)) ease-out}
.warden-mo{transform:rotate(calc(var(--ml)*-1deg))}
.warden-eye{transform:scale(var(--es))}
.warden-pm{transform:translate(calc(var(--px)*1px),calc(var(--py)*1px))}
.warden-pg{animation:warden-gz 7.3s ease-in-out infinite}
.warden-lid{transform:translateY(calc(var(--lid)*1px));fill:#a88368;stroke:${INK};stroke-width:.9}
.warden-low{transform:translateY(calc(var(--low)*-1px));fill:#b08b6f;stroke:${INK};stroke-width:.7}
.warden-bl{animation:warden-bl 4.7s linear infinite}
.warden-v[data-mood=meh] .warden-bl{animation:warden-bz 5.4s ease-in-out infinite}
.warden-grin{opacity:var(--grin);transition:opacity calc(.3s*var(--k))}
.warden-arm{transform:translateY(calc((1 - var(--arm))*150px));opacity:var(--arm);transition:transform calc(.5s*var(--k)) cubic-bezier(.3,1.2,.5,1),opacity .1s}
.warden-paw{opacity:var(--paw)}
.warden-lamp{transform:translateY(calc(var(--ld)*1px));transition:transform calc(.45s*var(--k)) cubic-bezier(.3,1.3,.5,1)}
.warden-on .warden-lamp{transition-delay:calc(.08s*var(--k))}
.warden-lamp svg{position:absolute;left:-20px;top:-54px;overflow:visible}
.warden-fl{transform:translateY(-8px) scale(var(--fl)) translateY(8px);transition:transform .5s}
.warden-fl path{animation:warden-fk 1.7s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:50% 100%}
.warden-v[data-mood=death] .warden-fl path{animation:warden-gt 2.3s linear infinite}
.warden-axe{transform:translateY(calc(var(--ad)*1px));transition:transform calc(.55s*var(--k)) cubic-bezier(.3,1.25,.5,1) calc(.25s*var(--k))}
.warden-axe svg{position:absolute;left:-48px;top:-142px;overflow:visible}
.warden-glow{position:absolute;bottom:-74px;width:190px;height:190px;margin-left:-95px;border-radius:50%;opacity:0;transform:scale(var(--gl));transition:opacity calc(.5s*var(--k)),transform .6s}
.warden-glow::before{content:"";position:absolute;inset:0;border-radius:50%;background:radial-gradient(closest-side,rgba(255,206,128,.42),rgba(255,176,88,.15) 42%,rgba(255,160,60,0));animation:warden-gw 2.1s ease-in-out infinite alternate}
.warden-on .warden-glow{opacity:var(--go)}
.warden-v[data-mood=pvp] .warden-glow{opacity:0}
.warden-v[data-mood=death] .warden-glow::before{animation:warden-gt 2.3s linear infinite}
.warden-osvg{position:absolute;left:-125px;top:-12px;overflow:visible}
.warden-osvg *{transform-box:view-box}
.warden-fg{transform:translateY(9px) scaleY(.1);opacity:0;transition:transform calc(.2s*var(--k)) cubic-bezier(.3,1.5,.5,1),opacity calc(.08s*var(--k));transition-delay:calc(var(--i)*.05s*var(--k))}
.warden-grip .warden-fg{transform:none;opacity:1}
.warden-bdw{transform:scaleY(0);transition:transform calc(.26s*var(--k)) cubic-bezier(.3,1.6,.5,1)}
.warden-bd .warden-bdw{transform:none;transition-delay:calc(.62s*var(--k))}
.warden-sway{animation:warden-sw 3.9s ease-in-out infinite alternate}
@keyframes warden-br{from{transform:translateY(.6px)}to{transform:translateY(-1.5px)}}
@keyframes warden-bl{0%,44%,49.5%,100%{transform:none}46.5%,47.5%{transform:translateY(11px)}}
@keyframes warden-bz{0%,34%,66%,100%{transform:none}43%,55%{transform:translateY(8px)}}
@keyframes warden-gz{0%,13%,33%,60%,76%,100%{transform:none}17%,29%{transform:translate(calc(var(--gx)*1px),calc(var(--gy)*1px))}64%,72%{transform:translate(calc(var(--gx)*1px),calc(var(--gy)*1px))}}
@keyframes warden-fk{0%{transform:scale(1,1)}40%{transform:scale(.9,1.12)}100%{transform:scale(1.06,.92)}}
@keyframes warden-gw{from{opacity:.8}to{opacity:1}}
@keyframes warden-gt{0%,30%{opacity:.9}34%{opacity:.3}40%{opacity:.8}46%{opacity:.2}55%,70%{opacity:.6}74%{opacity:.15}80%,100%{opacity:.9}}
@keyframes warden-sw{from{transform:rotate(-1.4deg)}to{transform:rotate(1.4deg)}}
.warden-sign{position:absolute;width:200px;bottom:calc(var(--sb)*1px);--sb:22;--tilt:0;transform-origin:50% calc(100% + var(--sb)*1px + 50px);rotate:calc(var(--tilt)*1deg);
  font-family:"Cormorant Garamond",Georgia,serif;text-align:center;color:#eee8d6;--dim:#c5beaa;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))}
.warden-pole{position:absolute;left:calc(50% - 4px);top:-9px;width:8px;height:calc(100% + 260px);border-radius:3px 3px 0 0;background:linear-gradient(90deg,#4a3320,#8a6843 35%,#a58157 55%,#5a3f28);box-shadow:inset 0 0 0 1px rgba(35,23,15,.9)}
.warden-board{position:relative;box-sizing:border-box;width:200px;padding:2px 6px 5px;border:11px solid transparent;border-image:${SLATE} 12 fill/11px stretch}
.warden-board::before{content:"";position:absolute;inset:-1px;pointer-events:none;background:radial-gradient(60px 22px at 24% 30%,rgba(255,255,255,.07),transparent),radial-gradient(70px 26px at 74% 72%,rgba(255,255,255,.06),transparent),radial-gradient(40px 14px at 60% 18%,rgba(255,255,255,.04),transparent)}
.warden-board>div{position:relative}
.warden-board>div:empty{display:none}
.warden-title{font:italic 600 19px/1.08 "Cormorant Garamond",Georgia,serif;text-wrap:balance;overflow-wrap:anywhere;text-shadow:0 0 1.5px rgba(255,255,255,.35)}
.warden-rule{display:block;margin:1px auto -2px;overflow:visible}
.warden-rule path{fill:none;stroke:#eee8d6;stroke-width:1.1;stroke-linecap:round;opacity:.5}
.warden-fig{font:600 38px/1 "Cormorant Garamond",Georgia,serif;font-variant-numeric:lining-nums;white-space:nowrap;text-shadow:0 0 2px rgba(255,255,255,.3)}
.warden-unit{font:italic 500 17px/1 "Cormorant Garamond",Georgia,serif;margin-left:5px;color:var(--dim)}
.warden-rate{display:flex;justify-content:center;align-items:center;gap:8px;margin-top:2px;min-height:18px}
.warden-tally{display:block;overflow:visible}
.warden-tally path{fill:none;stroke-width:2.1;stroke-linecap:round}
.warden-ck{stroke:#f1ebd9}.warden-gh{stroke:#f1ebd9;opacity:.17}.warden-red{stroke:#e8755c}
.warden-word{font:400 13.5px/1 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.2em;margin-right:-.2em}
.warden-q{font:italic 400 16px/1 "IM Fell English",Georgia,serif;color:var(--dim)}
.warden-more{font:italic 500 13.5px/1.12 "Cormorant Garamond",Georgia,serif;color:var(--dim);margin-top:4px;text-wrap:balance}
.warden-tag{font:400 11px/1.3 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.28em;margin-right:-.28em;text-transform:uppercase}
.warden-sign[data-mood=superb] .warden-fig{color:#f6dd8e}
.warden-sign[data-mood=superb] .warden-ck{stroke:#f6dd8e}
.warden-sign[data-kind=levelup] .warden-board{padding:17px 6px 9px}
.warden-sign[data-kind=levelup] .warden-fig{font-size:34px}
.warden-sign[data-kind=death] .warden-board{border-image-source:${BLACK};padding:21px 6px 10px}
.warden-sign[data-kind=death] .warden-fig{font:400 25px/1.2 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.17em;margin-right:-.17em;text-transform:lowercase;font-variant:small-caps}
.warden-sign[data-kind=achievement]{color:#2a190b;--dim:#4d3417}
.warden-sign[data-kind=achievement] .warden-board{border-image-source:${BRONZE};padding:4px 5px 7px}
.warden-sign[data-kind=achievement] .warden-board::before{inset:0;background:radial-gradient(circle,rgba(255,244,210,.22) 0 1.4px,transparent 2.6px) 0 0/13px 11px,radial-gradient(circle,rgba(70,40,8,.13) 0 1.6px,transparent 2.8px) 6px 5px/15px 12px}
.warden-sign[data-kind=achievement] .warden-title{font:italic 600 15.5px/1.14 "Cormorant Garamond",Georgia,serif;text-shadow:0 1px 0 rgba(255,240,200,.55)}
.warden-sign[data-kind=achievement] .warden-tag{text-shadow:0 1px 0 rgba(255,240,200,.5);padding-bottom:1px}
.warden-deco{position:absolute;pointer-events:none;overflow:visible}
.warden-gar{left:-3px;top:-8px}
.warden-drape{left:-6px;top:-6px}
.warden-rib{right:8px;bottom:-41px}
.warden-lf0{fill:#5c7044}.warden-lf1{fill:#7c8b55}.warden-lf2{fill:#4a5f3d}
.warden-gar path{stroke:${INK};stroke-width:.6}
.warden-gar .warden-lv{fill:none;stroke-width:.45;opacity:.7}
.warden-still{position:relative;width:230px;display:flex;flex-direction:column}
.warden-still *{transition:none!important}
.warden-still .warden-sign{position:relative;bottom:auto;margin:10px auto 0;transform-origin:50% 200%}
.warden-still .warden-pole{height:calc(100% + 9px)}
.warden-stand{position:relative;overflow:hidden;margin-top:-1px}
.warden-still>.warden-glow{bottom:-42px}
.warden-stand .warden-pole{top:0;height:100%;border-radius:0}
.warden-wall{position:relative;height:32px;background:#0e1014;border-top:1px solid #272c34;box-sizing:border-box}
.warden-wall .warden-over{top:-1px}
.warden-rm *,.warden-rm *::before{transition:none!important;animation:none!important}
`);

  // ---- the drawing ----
  // pen wobble, and a wash that pools and grains like ink on paper
  const FILT = (id) => `<filter id="${id}" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.9" xChannelSelector="R" yChannelSelector="G" result="d"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .16 0 0 0 0 .09 0 0 0 0 .04 1.5 0 0 0 -.7" result="b"/><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="11"/><feColorMatrix type="matrix" values="0 0 0 0 .14 0 0 0 0 .08 0 0 0 0 .04 0 1.2 0 0 -.56" result="g"/><feMerge result="m"><feMergeNode in="b"/><feMergeNode in="g"/></feMerge><feComposite in="m" in2="d" operator="in" result="mc"/><feMerge><feMergeNode in="d"/><feMergeNode in="mc"/></feMerge></filter>`;
  const HATCH = (id, rot, gap, op) => `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${gap}" height="${gap}" patternTransform="rotate(${rot})"><path d="M0,.5H${gap}" stroke="${INK}" stroke-width=".55" opacity="${op}"/></pattern>`;
  const ALM = 'M-8.5,0Q0,-8 8.5,0Q0,6 -8.5,0Z';
  const eye = (s, u) => `<g transform="translate(${21 * s},0)"><g class="warden-eye"><ellipse cy="-1" rx="13.5" ry="9.5" fill="#4e2f20" opacity=".36"/><ellipse cy="-1" rx="13.5" ry="9.5" fill="url(#wp${u})"/>
<g clip-path="url(#wc${u})"><path d="${ALM}" fill="#d9cdb3"/><path d="M-10,-6H10V-.8H-10Z" fill="#3d281b" opacity=".36"/>
<g class="warden-pm"><g class="warden-pg"><circle r="3.5" fill="#3a2414"/><circle r="1.7" fill="#0c0705"/><circle cx="-1.2" cy="-1.3" r=".85" fill="#fff8e6"/></g></g>
<g class="warden-bl"><path class="warden-lid" d="M-12,-22H12V-5.5Q0,-3.5 -12,-5.5Z"/></g><path class="warden-low" d="M-12,18H12V5Q0,4 -12,5Z"/></g>
<path d="${ALM}" fill="none" stroke="${INK}" stroke-width=".8"/><path d="M-9.5,.6Q0,-8.800 9.500,.6" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/>
<path d="M${-8 * s},6.5q${8 * s},5 ${17 * s},-1M${-6 * s},9.5q${7 * s},4 ${14 * s},-.5M${-3 * s},12.5q${5 * s},2.500 ${9 * s},.5M${10 * s},-3l${5.5 * s},-2.500M${10.5 * s},0l${6 * s},.5M${10 * s},3l${5 * s},3" fill="none" stroke="${INK}" stroke-width=".6" stroke-linecap="round" opacity=".8"/></g></g>`;
  const BROW = `<g transform="scale(1.16)"><path d="M-14,4C-13,-5 2,-9 15,-4C19,-2 18,3 13,2C6,0 -3,1 -9,6C-12,8 -14,7 -14,4Z" fill="#7b6c5e" stroke="${INK}" stroke-width=".9"/><path d="M-10,3l2.500,-6M-6,1l2.500,-6.500M-1.500,0l2.500,-6M3,-.5l2.500,-5.500M7.500,-.5l2.500,-4.500M11.500,0l3,-3M14,1l4,-1.500" fill="none" stroke="#e0d7c6" stroke-width=".8" stroke-linecap="round"/><path d="M-12,5l2,-5M-8,2.500l2,-5.500M-4,1.500l2,-5M1,0l2,-5M5.500,-.5l2,-4M9.500,0l2,-3.500M-13,6l-2.500,1.500M-10,7l-1.500,2.500" fill="none" stroke="${INK}" stroke-width=".5" opacity=".8"/></g>`;
  const LOBE = `<path d="M0,-3C10,-9 25,-7 37,1C47,7 57,8 66,14C57,19.500 46,21 38,18C24,18 10,15 0,9Z" fill="#8a6045" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/><path d="M4,0C16,-4 30,0 46,10M4,3C18,0 32,5 52,14M3,6C16,5 30,10 44,16M12,-4C24,-5 36,2 50,9M8,10C20,12 32,15 42,17" fill="none" stroke="${INK}" stroke-width=".55" opacity=".75"/><path d="M8,-2C20,-5 32,-1 42,5.500M10,4.500C22,4.500 34,8.500 48,14.500M6,8C16,9 26,12 36,15.500" fill="none" stroke="#ddd3c0" stroke-width="1.1" stroke-linecap="round" opacity=".9"/>`;
  const rivets = [-46, -31, -16, 16, 31, 46].map((x) => { const y = -25 - 4.5 * (x / 56) ** 2; return `<circle cx="${x}" cy="${y.toFixed(1)}" r="2.200"/><circle cx="${x + .6}" cy="${(y - .7).toFixed(1)}" r=".7" fill="#e9d6a4" stroke="none"/>`; }).join('');
  const head = (u) => `<svg class="warden-head" xmlns="${NS}" width="250" height="260" viewBox="-125 -100 250 260"><defs>${FILT('wf' + u)}${HATCH('wp' + u, 38, 3, .6)}${HATCH('wq' + u, -52, 3.400, .5)}
<clipPath id="wc${u}"><path d="${ALM}"/></clipPath>
<linearGradient id="wi${u}" x1="0" x2="1" y1="0" y2=".25"><stop offset="0" stop-color="#30353a"/><stop offset=".5" stop-color="#596067"/><stop offset="1" stop-color="#8c949a"/></linearGradient>
<linearGradient id="ws${u}" x1="0" x2="1"><stop offset="0" stop-color="#92705a"/><stop offset=".5" stop-color="#c2a085"/><stop offset="1" stop-color="#e2c7a8"/></linearGradient>
<linearGradient id="wh${u}" x1="0" x2="1"><stop offset="0" stop-color="#4a2f23"/><stop offset="1" stop-color="#80543b"/></linearGradient>
<linearGradient id="wb${u}" x1="0" x2="1"><stop offset="0" stop-color="#5c4724"/><stop offset=".6" stop-color="#94793f"/><stop offset="1" stop-color="#c4a868"/></linearGradient></defs>
<g filter="url(#wf${u})" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">
<path d="M-106,160C-106,100 -86,74 -48,63L48,63C86,74 106,100 106,160Z" fill="#453426" stroke-width="1.2"/>
<path d="M-106,160C-106,100 -86,74 -48,63L-30,63C-70,80 -84,110 -84,160Z" fill="url(#wp${u})" stroke="none"/>
<path d="M-46,-24C-58,-22 -66,-10 -64,2C-70,8 -70,20 -65,26C-71,34 -68,48 -59,60L-38,60L-42,10Z" fill="url(#wh${u})" stroke-width="1.1"/>
<path d="M-46,-24C-61,-19 -67,2 -63,20C-69,32 -65,46 -57,60L-48,60C-54,40 -54,6 -46,-24Z" fill="url(#wp${u})" stroke="none"/>
<path d="M46,-24C58,-22 66,-10 64,2C70,8 70,20 65,26C71,34 68,48 59,60L38,60L42,10Z" fill="#7f553c" stroke-width="1.1"/>
<path d="M-56,-12C-60,4 -58,18 -60,30M-51,-10C-55,8 -53,24 -57,44M-49,12C-51,28 -50,40 -52,54M56,-12C60,4 58,18 60,30M52,-6C55,10 53,26 57,44M49,10C51,24 50,38 52,52" fill="none" stroke-width=".55" opacity=".75"/>
<path d="M-54,-14C-57,2 -55,16 -58,34M53,-14C57,0 55,14 58,30M50,14C52,26 52,38 54,50M59,-6C62,6 60,16 62,24" fill="none" stroke="#d6ccb9" stroke-width="1.1" opacity=".9"/>
<path d="M-46,-10C-48,-42 -28,-57 0,-57C28,-57 48,-42 46,-10Z" fill="url(#ws${u})" stroke-width="1.1"/>
<path d="M-46,-10C-48,-42 -28,-57 -6,-57C-26,-50 -36,-34 -34,-10Z" fill="url(#wp${u})" stroke="none"/>
<path d="M-30,-40C-12,-45 14,-45 30,-40M-34,-32C-12,-37 14,-37 34,-32M-20,-47C-8,-50 10,-50 20,-47" fill="none" stroke-width=".55" opacity=".6"/>
<path d="M-36,-25C-12,-29 12,-29 36,-25" fill="none" stroke="#8f4a38" stroke-width="1.1" opacity=".45"/>
<path d="M-16,-56C-13,-63 -5,-61 -8,-55M3,-57C7,-64 13,-61 10,-56M-3,-58C-2,-63 2,-64 3,-60" fill="none" stroke="#c9bfad" stroke-width=".9"/>
<path d="M-47,-24C-51,-4 -51,22 -44,44L44,44C51,22 51,-4 47,-24Z" fill="url(#ws${u})" stroke-width="1.1"/>
<path d="M-47,-24C-51,-4 -51,22 -44,44L-30,44C-39,24 -39,0 -35,-24Z" fill="#4e2f20" opacity=".22" stroke="none"/>
<path d="M-47,-24C-51,-4 -51,22 -44,44L-33,44C-41,24 -41,0 -38,-24Z" fill="url(#wp${u})" stroke="none"/>
<path d="M-47,-24C-51,-4 -51,22 -44,44L-40,44C-46,24 -46,0 -43,-24Z" fill="url(#wq${u})" stroke="none"/>
<path d="M-47,-23Q0,-16 47,-23L46.500,-12Q0,-4 -46.500,-12Z" fill="#3d281b" opacity=".3" stroke="none"/><path d="M-47,-23Q0,-16 47,-23L46.500,-14Q0,-7 -46.500,-14Z" fill="url(#wq${u})" stroke="none"/>
<ellipse cx="-30" cy="18" rx="10" ry="7" fill="#9c4a36" opacity=".16" stroke="none"/><ellipse cx="31" cy="18" rx="10" ry="7" fill="#b25a44" opacity=".16" stroke="none"/>
<path d="M-20,20C-27,22 -33,28 -36,36M20,20C27,22 33,28 36,36M-25,27C-29,29 -32,33 -33,37M25,27C29,29 32,33 33,37M-40,2C-43,8 -43,14 -41,20M40,2C43,8 43,14 41,20M-3,-17v6M3.500,-17v5.500M36,6l5,5M38,12l4,5" fill="none" stroke-width=".6" opacity=".75"/>
<path d="M-56,22C-62,58 -46,100 0,122C46,100 62,58 56,22C30,42 -30,42 -56,22Z" fill="url(#wh${u})" stroke-width="1.2"/>
<path d="M-10,42C-9,70 -4,96 0,120C4,96 9,70 10,42Z" fill="#b9ad9b" opacity=".5" stroke="none"/>
<path d="M-54,30C-22,50 22,50 54,30L50,46C22,62 -22,62 -50,46Z" fill="url(#wp${u})" stroke="none"/>
<path d="M-56,22C-62,58 -46,100 0,122C-30,96 -44,60 -42,32Z" fill="url(#wq${u})" stroke="none"/>
<path d="M-46,40C-44,64 -34,86 -14,104M-34,44C-32,66 -24,86 -6,108M-20,46C-20,66 -14,88 0,112M20,46C20,66 14,88 0,112M34,44C32,66 24,86 8,106M46,40C44,64 36,84 18,102" fill="none" stroke-width=".55" opacity=".7"/>
<path d="M-27,45C-26,64 -20,82 -8,100M27,45C26,64 20,82 8,100M-8,47C-8,66 -4,84 0,100M-41,46C-39,60 -34,74 -26,86M41,46C39,60 34,74 26,86M14,46C13,62 9,80 4,96" fill="none" stroke="#d6ccb9" stroke-width="1.2" opacity=".9"/>
<g class="warden-grin"><path d="M-19,38C-9,50 9,50 19,38C9,42.500 -9,42.500 -19,38Z" fill="#dccfae" stroke-width=".9"/><path d="M-11.500,41.500v4.500M-6,42.300v5.200M0,42.600v5.600M6,42.300v5.200M11.500,41.500v4.500" fill="none" stroke-width=".6"/></g></g>
<g transform="translate(0,31)" filter="url(#wf${u})"><g class="warden-mo">${LOBE}</g></g><g transform="translate(0,31) scale(-1,1)" filter="url(#wf${u})"><g class="warden-mo">${LOBE}<path d="M0,-3C10,-9 25,-7 37,1C47,7 57,8 66,14C52,12 40,8 30,6C18,3 8,2 0,2Z" fill="url(#wp${u})" stroke="none"/></g></g>
<g stroke="${INK}" stroke-linejoin="round" stroke-linecap="round" filter="url(#wf${u})">
<path d="M-5,-10C-7,2 -15,8 -17,18C-18.500,28 -9,34.500 0,33.500C9,34.500 18.500,28 17,18C15,8 7,2 5,-10Z" fill="#bd9174" stroke-width="1.1"/>
<path d="M-17,18.500C-22,19.500 -22,28.500 -15,29M17,18.500C22,19.500 22,28.500 15,29" fill="#ab7f64" stroke-width="1"/>
<ellipse cx="-1" cy="23" rx="13" ry="8.500" fill="#a3402c" opacity=".17" stroke="none"/><ellipse cx="5.500" cy="16" rx="5" ry="7" fill="#f3dcc0" opacity=".42" stroke="none"/>
<path d="M-5,-10C-7,2 -15,8 -17,18C-18.500,28 -9,34.500 -3,33.500C-10,28 -10,16 -3,4Z" fill="url(#wp${u})" stroke="none"/>
<path d="M-11,31q3.500,2.500 7,.5M11,31q-3.500,2.500 -7,.5" fill="none" stroke-width="1.1"/><path d="M-2,8q3,6 1.500,13M7,24q3,-1 4,-4" fill="none" stroke-width=".5" opacity=".6"/></g>
${eye(-1, u)}${eye(1, u)}
<g transform="translate(-22,-10.5)"><g class="warden-bL"><g transform="scale(-1,1)">${BROW}</g></g></g><g transform="translate(22,-10.5)"><g class="warden-bR">${BROW}</g></g>
<g transform="translate(0,-20)"><g class="warden-helm"><g transform="translate(0,20)" filter="url(#wf${u})" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">
<path d="M-53,-24C-56,-58 -32,-74 0,-74C32,-74 56,-58 53,-24Z" fill="url(#wi${u})" stroke-width="1.3"/>
<path d="M-53,-24C-56,-58 -32,-74 -4,-74C-22,-64 -30,-48 -29,-24Z" fill="url(#wp${u})" stroke="none"/><path d="M-53,-24C-56,-58 -32,-74 -18,-73C-36,-62 -44,-46 -43,-24Z" fill="url(#wq${u})" stroke="none"/>
<path d="M30,-33C30,-50 22,-63 10,-71C24,-66 40,-54 44,-33Z" fill="url(#wp${u})" stroke="none" opacity=".55"/>
<path d="M24,-68C38,-61 47,-49 48,-38C41,-50 33,-60 24,-68Z" fill="#fff" opacity=".28" stroke="none"/>
<path d="M-28,-34C-27,-54 -17,-67 -5,-73M28,-34C27,-54 17,-67 5,-73" fill="none" stroke-width=".9"/>
<path d="M-6,-32C-6,-56 -4,-69 0,-75C4,-69 6,-56 6,-32Z" fill="#6c747a" stroke-width="1"/><path d="M-3,-36v-22M3,-36v-22" fill="none" stroke-width=".45" opacity=".6"/>
<path d="M12,-71.500C34,-69 53,-54 50.500,-36" fill="none" stroke="#ffe7b8" stroke-width="1" opacity=".6"/>
<path d="M35,-50l5,3M16,-58l3,4l3,-2M-14,-48l4,2M38,-42l3,5" fill="none" stroke-width=".6" opacity=".7"/>
<ellipse cx="0" cy="-76" rx="5.500" ry="3.600" fill="url(#wb${u})" stroke-width="1"/>
<path d="M-56.500,-35Q0,-29 56.500,-35L56.500,-23Q0,-16 -56.500,-23Z" fill="url(#wb${u})" stroke-width="1.3"/>
<path d="M-56.500,-35Q-28,-32 -20,-31.500L-20,-18.500Q-40,-20 -56.500,-23Z" fill="url(#wp${u})" stroke="none"/>
<path d="M-55,-31.500Q0,-25.500 55,-31.500M-55,-25.500Q0,-18.800 55,-25.500" fill="none" stroke-width=".5" opacity=".75"/>
<path d="M-5.500,-21L-4,-7Q0,-3.500 4,-7L5.500,-21Z" fill="url(#wb${u})" stroke-width="1.1"/><path d="M0,-19v11" fill="none" stroke-width=".55" opacity=".7"/>
<g fill="#7a6232" stroke-width=".7">${rivets}</g>
<g class="warden-paw" fill="#b79479" stroke-width="1"><path d="M-24,-62c-3,-6 4,-11 8,-6l4,7c2,5 -6,8 -9,4Z"/><path d="M-13,-68c-2,-7 6,-10 9,-4l2,8c1,5 -7,7 -9,2Z"/><path d="M-1,-70c-1,-7 8,-8 10,-2l1,8c0,5 -8,6 -10,1Z"/><path d="M11,-69c1,-7 9,-6 10,0l-1,8c-1,5 -8,4 -9,-1Z"/><path d="M-19,-62q3,-2 6,0M-8,-66q3,-2 6,-1M4,-67q3,-1.500 6,0M14,-65q3,-1 5,.5" fill="none" stroke-width=".6"/></g>
</g></g></g>
<g class="warden-arm" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round" filter="url(#wf${u})"><path d="M-100,74C-105,14 -96,-26 -77,-56L-57,-45C-72,-18 -80,24 -78,74Z" fill="#4d4a3b" stroke-width="1.2"/>
<path d="M-100,74C-105,14 -96,-26 -77,-56L-71,-53C-88,-24 -94,16 -90,74Z" fill="url(#wp${u})" stroke="none"/><path d="M-96,20q8,5 17,2M-97,36q9,5 19,2M-92,2q7,5 15,3" fill="none" stroke-width=".55" opacity=".7"/>
<path d="M-90,-36L-64,-21L-56,-45L-78,-58Z" fill="#6a4a30" stroke-width="1.1"/><path d="M-86,-38L-63,-25M-81,-50L-59,-38" fill="none" stroke="#b79a5e" stroke-width="1.100" stroke-dasharray="2 2.500"/>
<path d="M-79,-69C-81,-79 -71,-85 -63,-81L-51,-75C-45,-71 -47,-61 -53,-59L-65,-56C-73,-55 -78,-61 -79,-69Z" fill="#b79479" stroke-width="1.1"/><path d="M-73,-79q4,6 1,12M-66,-79q4,6 2,13M-59,-77q4,6 2,13" fill="none" stroke-width=".65"/><path d="M-70,-58C-66,-64 -56,-66 -51,-61C-50,-57 -54,-55 -58,-56Z" fill="#c2a085" stroke-width="1"/></g>
</svg>`;

  const finger = (x, i, len) => `<g transform="translate(${x},0)"><g class="warden-fg" style="--i:${i}"><path d="M-5.800,-3C-5.800,-11 5.800,-11 5.800,-3L5.500,${len - 5}C5.500,${len + 1.5} -5.500,${len + 1.5} -5.500,${len - 5}Z" fill="#b79479" stroke="${INK}" stroke-width="1.1"/><path d="M-5.800,-3C-5.800,-11 0,-11 -1,-9C-3,-4 -3,${len - 6} -2,${len}C-5,${len} -5.500,${len - 2} -5.500,${len - 5}Z" fill="#4e2f20" opacity=".3"/><path d="M-3.800,-2Q0,-.2 3.800,-2M-3.300,-4.800Q0,-3.600 3.300,-4.800" fill="none" stroke="${INK}" stroke-width=".6"/><path d="M-3.300,${len - 5}Q0,${len - 7.5} 3.300,${len - 5}L3.300,${len - 4}Q0,${len} -3.300,${len - 4}Z" fill="#cdb597" stroke="${INK}" stroke-width=".45"/></g></g>`;
  const braid = (x) => { let s = ''; for (let j = 0; j < 3; j++) { const y = 3 + j * 5.5, m = j % 2 ? -1 : 1; s += `<path d="M${-6.5 * m},${y}C${-7.5 * m},${y + 5} ${0},${y + 8.5} ${6.5 * m},${y + 7}C${7.5 * m},${y + 2} 0,${y - 1.5} ${-6.5 * m},${y}Z" fill="${j % 2 ? '#74492f' : '#8e5f43'}" stroke="${INK}" stroke-width=".9"/><path d="M${-3 * m},${y + 2}Q0,${y + 3.5} ${3.5 * m},${y + 5}" fill="none" stroke="#d6ccb9" stroke-width=".8"/>`; } return `<g transform="translate(${x},0)">${s}<rect x="-5.500" y="20.500" width="11" height="4.500" rx="1" fill="#a88b4c" stroke="${INK}" stroke-width=".8"/><path d="M-4.500,25C-6,29 -2,31.500 0,31.500C2,31.500 6,29 4.500,25Z" fill="#8a6045" stroke="${INK}" stroke-width=".8"/></g>`; };
  const overArt = (u) => `<svg class="warden-osvg" xmlns="${NS}" width="250" height="48" viewBox="-125 -12 250 48"><defs>${FILT('wo' + u)}</defs><g filter="url(#wo${u})"><g class="warden-bdw"><g class="warden-sway">
<path d="M-47,-.5L47,-.5C47,8 35,10 28,5C22,11 8,11 0,6C-8,11 -22,11 -28,5C-35,10 -47,8 -47,-.5Z" fill="#855a40" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
<path d="M-38,1q2,4 6,5M38,1q-2,4 -6,5M-4,1q1,3 4,4M-22,1q1,4 5,5M20,1q-1,4 -5,5" fill="none" stroke="#d6ccb9" stroke-width=".9"/>${braid(-15)}${braid(15)}</g></g>
${finger(-108, 0, 12)}${finger(-95.5, 1, 14)}${finger(-83, 2, 13.5)}${finger(-70.5, 3, 11)}</g></svg>`;

  const lampArt = () => `<svg xmlns="${NS}" width="40" height="56" viewBox="-20 -54 40 56"><g stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">
<circle cx="0" cy="-46" r="4" fill="none" stroke-width="1.3"/><path d="M-12,-31L0,-42L12,-31Z" fill="#4a4f55" stroke-width="1.2"/>
<rect x="-9" y="-31" width="18" height="25" fill="#f3bf62" stroke-width="1.3"/><rect x="-9" y="-31" width="18" height="25" fill="#fff0bd" opacity=".45" stroke="none"/>
<g class="warden-fl"><path d="M0,-25C4.500,-18 4.500,-12 0,-9.500C-4.500,-12 -4.500,-18 0,-25Z" fill="#fffbe6" stroke="#d07a22" stroke-width=".8"/></g>
<path d="M-3,-31V-6M3,-31V-6" fill="none" stroke-width="1" opacity=".8"/><rect x="-11.500" y="-6.500" width="23" height="6" rx="1" fill="#4a4f55" stroke-width="1.2"/><path d="M-9,-33.500l9,-7" fill="none" stroke="#aab3ba" stroke-width=".8" opacity=".7"/></g></svg>`;
  const axeArt = (u) => `<svg xmlns="${NS}" width="64" height="146" viewBox="-48 -142 64 146"><defs><linearGradient id="wx${u}" x1="0" x2="1"><stop offset="0" stop-color="#b9c2c8"/><stop offset=".35" stop-color="#737d86"/><stop offset="1" stop-color="#474f58"/></linearGradient></defs><g stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">
<path d="M-3.500,-140H3.500V4H-3.500Z" fill="#6f4d2f" stroke-width="1.2"/><path d="M-1,-136V0M1.500,-120V-20" fill="none" stroke-width=".5" opacity=".6"/>
<path d="M-3.500,-134C-14,-137 -30,-140 -41,-129C-36,-116 -36,-106 -43,-90C-28,-93 -13,-101 -3.500,-106Z" fill="url(#wx${u})" stroke-width="1.4"/>
<path d="M-38.500,-127C-33.500,-115 -33.500,-106 -39.500,-93" fill="none" stroke="#f2f5f6" stroke-width="1.3" opacity=".85"/>
<path d="M-28,-132l8,8M-30,-124l10,10M-30,-114l10,9M-32,-104l9,7M-12,-128l4,4" fill="none" stroke-width=".55" opacity=".6"/>
<path d="M3.500,-131L13,-126L13,-113L3.500,-109Z" fill="#59626b" stroke-width="1.2"/><path d="M-5.500,-136H5.500V-104H-5.500Z" fill="#8f6c35" stroke-width="1.1"/><circle cx="0" cy="-128" r="1.500" fill="#e6cc92" stroke-width=".5"/><circle cx="0" cy="-112" r="1.500" fill="#e6cc92" stroke-width=".5"/></g></svg>`;

  const garland = () => {
    let s = '', stem = 'M0,2';
    for (let i = 0; i <= 22; i++) {
      const t = i / 22, x = 200 * t, y = 2 + 12 * Math.sin(Math.PI * t), up = i % 2 ? -1 : 1, a = (t < .5 ? 180 - up * 48 : up * 48) + (i * 37 % 17) - 8;
      stem += `L${x.toFixed(1)},${y.toFixed(1)}`;
      s += `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${a})"><path class="warden-lf${i % 3}" d="M0,0C3,-4.500 10,-4.500 14,0C10,4.500 3,4.500 0,0Z"/><path class="warden-lv" d="M1,0H12"/></g>`;
      if (i % 4 === 2) s += `<circle cx="${(x + 3).toFixed(1)}" cy="${(y + 3).toFixed(1)}" r="2.200" fill="#a8452f" stroke="${INK}" stroke-width=".6"/><circle cx="${(x - 2).toFixed(1)}" cy="${(y + 4.500).toFixed(1)}" r="1.800" fill="#c25a3a" stroke="${INK}" stroke-width=".6"/>`;
    }
    for (const [x, d] of [[3, -1], [197, 1]]) for (let j = 0; j < 3; j++) s += `<g transform="translate(${x + d * (j % 2 ? 2 : -1)},${9 + j * 9}) rotate(${90 + d * (j % 2 ? -30 : 26)})"><path class="warden-lf${(j + 1) % 3}" d="M0,0C3,-4.500 10,-4.500 14,0C10,4.500 3,4.500 0,0Z"/><path class="warden-lv" d="M1,0H12"/></g>`;
    return `<svg class="warden-deco warden-gar" xmlns="${NS}" width="206" height="52" viewBox="-3 -8 206 52"><path d="${stem}" fill="none" style="stroke:#3d2c18;stroke-width:1.2"/>${s}</svg>`;
  };
  const DRAPE = `<svg class="warden-deco warden-drape" xmlns="${NS}" width="212" height="64" viewBox="-6 -6 212 64"><g stroke="#000" stroke-width="1" stroke-linejoin="round"><path d="M-1,3C-4,22 1,38 -3,54L10,49C8,32 11,18 12,6Z" fill="#17140f"/><path d="M201,3C204,22 199,38 203,54L190,49C192,32 189,18 188,6Z" fill="#17140f"/><path d="M-3,-4H203V5C150,27 50,27 -3,5Z" fill="#1c1813"/></g><path d="M10,6C60,20 140,20 190,6M30,2C70,11 130,11 170,2M-1,12C0,26 2,38 0,48M201,12C200,26 198,38 200,48" fill="none" stroke="#5d564b" stroke-width=".7" opacity=".9"/></svg>`;
  const RIBBON = `<svg class="warden-deco warden-rib" xmlns="${NS}" width="40" height="48" viewBox="-20 -10 40 48"><g stroke="${INK}" stroke-width=".9" stroke-linejoin="round"><path d="M-4,2L-14,31L-8,27L-4,35L3,4Z" fill="#8a3323"/><path d="M3,2L11,33L5.500,28L1,34L-3,4Z" fill="#a94530"/><circle r="9.500" fill="#9c3324"/><circle r="6.500" fill="#b3412e" stroke-width=".6"/><path d="M-2,-4V4.500M-2,-4L3,-.5L-2,2" fill="none" stroke="#5a170f" stroke-width="1.1" stroke-linecap="round"/></g><path d="M-6,-5.500Q-2,-9 3,-7.500" fill="none" stroke="#f0a08c" stroke-width="1" stroke-linecap="round" opacity=".7"/></svg>`;
  const tally = (n, pvp) => {
    const sl = [.9, -.7, .6, -1];
    let s = '';
    if (pvp) s = '<path class="warden-red" d="M4,3.500L17,15M16.500,3L4.500,15.500"/>';
    else { for (let i = 0; i < 4; i++) s += `<path class="${i < n ? 'warden-ck' : 'warden-gh'}" d="M${5 + i * 6.5 + sl[i]},3L${5 + i * 6.5 - sl[i]},15.500"/>`; s += `<path class="${n >= 5 ? 'warden-ck' : 'warden-gh'}" d="M1,13.500L29,4.500"/>`; }
    return `<svg class="warden-tally" xmlns="${NS}" width="${pvp ? 21 : 31}" height="18" viewBox="0 0 ${pvp ? 21 : 31} 18">${s}</svg>`;
  };

  let uid = 0;
  Harness.register({
    id: 'warden',
    name: 'The Gatewarden',
    blurb: 'The edge of the prompt is a wall. An old dwarf gatewarden looks over it, holds up a slate with the news, and ducks down again. He has seen it all before, and his eyebrows say what he thinks of it.',
    create(ctx) {
      const E = ctx.el, k = () => 1 / ctx.pace();
      const timers = new Set();
      const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };

      // ---- the board ----
      function fill(el, n) {
        const mood = M[n.mood] ? n.mood : 'calibrating', b = el.querySelector('.warden-board');
        el.dataset.mood = mood; el.dataset.kind = n.kind;
        el.style.setProperty('--sb', M[mood].sb ?? 22); el.style.setProperty('--tilt', M[mood].tilt ?? 0);
        b.textContent = '';
        const ach = n.kind === 'achievement';
        if (ach) b.append(E('div', 'warden-tag', n.label));
        b.append(E('div', 'warden-title', n.title));
        if (n.kind === 'kill') b.append(ctx.svg(`<svg class="warden-rule" xmlns="${NS}" width="132" height="5"><path d="M2,3C34,1.300 70,4.200 130,2.200"/></svg>`));
        const fig = E('div', 'warden-fig', n.big);
        if (n.unit) fig.append(E('span', 'warden-unit', n.unit));
        b.append(fig);
        if (n.kind === 'kill') {
          const r = E('div', 'warden-rate');
          r.append(ctx.svg(tally(RANK[mood] || 0, mood === 'pvp')));
          r.append(n.label ? E('span', 'warden-word', n.label) : E('span', 'warden-q', '?'));
          b.append(r);
        } else if (!ach && n.label) b.append(E('div', 'warden-tag', n.label));
        b.append(E('div', 'warden-more', n.more));
        if (n.kind === 'levelup') b.append(ctx.svg(garland()));
        if (n.kind === 'death') b.append(ctx.svg(DRAPE));
        if (ach) b.append(ctx.svg(RIBBON));
      }
      function makeSign(n) {
        const el = E('div', 'warden-sign');
        el.append(E('div', 'warden-pole'), E('div', 'warden-board'));
        fill(el, n);
        return el;
      }
      // ---- the warden: head, lantern, axe, and the bits that hang over the edge ----
      function makeWarden() {
        const u = ++uid;
        const who = E('div', 'warden-who'), lift = E('div', 'warden-lift'), br = E('div', 'warden-br'), nod = E('div', 'warden-nod');
        nod.append(ctx.svg(head(u))); br.append(nod); lift.append(br); who.append(lift);
        const lamp = E('div', 'warden-lamp'); lamp.append(ctx.svg(lampArt()));
        const axe = E('div', 'warden-axe'); axe.append(ctx.svg(axeArt(u)));
        const glow = E('div', 'warden-glow');
        const over = E('div', 'warden-over warden-v'); over.append(ctx.svg(overArt(u)));
        return { who, lamp, axe, glow, over, nod };
      }
      const place = (w, cx) => { w.who.style.left = cx + 'px'; w.lamp.style.left = w.glow.style.left = w.axe.style.left = (cx + 85) + 'px'; };
      const dress = (root, w, mood, on, grip) => {
        const sky = ctx.skyMode();
        for (const e of [root, w.over]) { e.dataset.mood = mood; e.dataset.sky = sky; e.style.setProperty('--k', k()); }
        w.over.classList.toggle('warden-bd', on && mood !== 'poor');
        w.over.classList.toggle('warden-grip', on && grip && mood !== 'levelup' && mood !== 'death');
      };

      // ---- the stage ----
      let rig = null, W = null, geo = null, idle = 0;
      const live = [], queue = [];
      function layout() {
        const L = ctx.lane(), wide = L.w >= 584;
        const cx = wide ? Math.min(L.x1 - 308, Math.max(L.x0 + 274, L.x0 + L.w * .47)) : Math.min(L.x1 - 102, Math.max(L.x0 + 130, L.x0 + L.w / 2 + 14));
        geo = { L, wide, cx };
        rig.style.height = L.bottom + 'px';
        place(W, cx);
        W.over.style.left = cx + 'px'; W.over.style.top = L.bottom + 'px';
      }
      function attach() {
        clearTimeout(idle); timers.delete(idle);
        if (!rig) {
          rig = E('div', 'warden-rig warden-v'); W = makeWarden();
          rig.append(W.who, W.lamp, W.axe, W.glow);
          if (ctx.reduced) { rig.classList.add('warden-rm'); W.over.classList.add('warden-rm'); }
        }
        if (!rig.isConnected) {
          rig.classList.remove('warden-on');
          ctx.front.append(rig);
          (OVER_PROMPT ? ctx.front.parentNode : ctx.front).append(W.over);
          layout();
          rig.getBoundingClientRect();
        }
      }
      function detach() { if (rig) { rig.remove(); W.over.remove(); } }
      const active = () => live.filter((h) => !h.leaving);
      function mind() {
        const a = active(), top = a[a.length - 1];
        if (!top) { rig.classList.remove('warden-on'); dress(rig, W, rig.dataset.mood || 'good', false, false); return; }
        const mood = top.sign.dataset.mood;
        dress(rig, W, mood, true, !a.some((h) => h.slot === 'L'));
        rig.style.setProperty('--gx', top.slot === 'R' ? 3.3 : top.slot === 'L' ? -3.3 : .6);
        rig.style.setProperty('--gy', top.slot === 'T' ? -2.6 : -.4);
        rig.classList.add('warden-on');
      }
      const drop = (h) => h.sign.offsetHeight + parseFloat(h.sign.style.bottom || 0) + (M[h.sign.dataset.mood].sb ?? 22) + 40;
      function seat(h) {
        const s = h.sign, { cx, L } = geo;
        if (h.slot === 'R') { s.style.left = (cx + 106) + 'px'; s.style.bottom = ''; }
        else if (h.slot === 'L') { s.style.left = (cx - 272) + 'px'; s.style.bottom = ''; }
        else {
          let base = 176;
          for (const o of live) if (o !== h && o.slot === 'T') base = Math.max(base, o.base + o.sign.offsetHeight + 12);
          h.base = base;
          s.style.left = Math.min(L.x1 - 202, Math.max(L.x0 + 2, cx - 100)) + 'px';
          s.style.bottom = `calc(${base}px + var(--sb)*.3px)`;
        }
      }
      function nodNow(mood) {
        if (ctx.reduced) return;
        const d = k();
        if (mood === 'good') later(() => W.nod.animate([{ transform: 'none' }, { offset: .35, transform: 'translateY(6px) rotate(1.500deg)' }, { offset: .7, transform: 'translateY(-1px)' }, { transform: 'none' }], { duration: 460 * d, easing: 'ease-in-out' }), 1250 * d);
        if (mood === 'superb') later(() => W.nod.animate([{ transform: 'none' }, { offset: .3, transform: 'translateY(-7px) rotate(-2deg)' }, { offset: .6, transform: 'translateY(2px) rotate(1deg)' }, { transform: 'none' }], { duration: 520 * d, easing: 'ease-out' }), 620 * d);
        if (mood === 'death') later(() => W.nod.animate([{ transform: 'none' }, { transform: 'translateY(3px) rotate(-2deg)' }], { duration: 900 * d, easing: 'ease-in-out', fill: 'forwards' }), 900 * d);
        else W.nod.getAnimations().forEach((a) => a.cancel());
      }
      function start(h) {
        attach();
        const first = active().length === 0, d = k();
        const used = live.map((o) => o.slot);
        h.slot = geo.wide ? (['R', 'L', 'T'].find((s) => !used.includes(s)) || 'T') : 'T';
        h.sign = makeSign(h.n);
        rig.insertBefore(h.sign, h.slot === 'T' ? rig.firstChild : W.who);
        live.push(h); seat(h); mind(); nodNow(h.n.mood);
        const D = drop(h), wait = first ? 380 * d : 0;
        h.read = 6000; h.t0 = performance.now(); h.lead = wait + 900 * d;
        if (ctx.reduced) h.sign.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
        else h.sign.animate([{ transform: `translateY(${D}px)`, easing: 'cubic-bezier(.2,.8,.3,1)' }, { offset: .56, transform: 'translateY(-7px) rotate(1.800deg)', easing: 'ease-in-out' }, { offset: .74, transform: 'translateY(2px) rotate(-1.200deg)', easing: 'ease-in-out' }, { offset: .89, transform: 'translateY(0) rotate(.6deg)', easing: 'ease-in-out' }, { transform: 'none' }], { duration: 1080 * d, delay: wait, fill: 'backwards' });
        arm(h);
      }
      function arm(h) {
        clearTimeout(h.timer); timers.delete(h.timer);
        h.timer = later(() => leave(h), Math.max(0, h.t0 + h.lead + h.read * k() - performance.now()));
      }
      function leave(h) {
        if (h.leaving) return;
        h.leaving = true;
        const last = active().length === 0, d = k(), D = drop(h);
        mind();
        const done = () => {
          h.sign.remove(); live.splice(live.indexOf(h), 1);
          if (queue.length) start(queue.shift());
          else if (!live.length) idle = later(detach, 500 * d);
        };
        if (ctx.reduced) {
          if (last) for (const e of [rig, W.over]) e.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' }).onfinish = (ev) => { if (e === rig) done(); if (!live.length) detach(); ev.target.cancel(); };
          else h.sign.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' }).onfinish = done;
          return;
        }
        h.sign.animate([{ transform: 'none' }, { offset: .2, transform: 'translateY(-4px) rotate(.8deg)' }, { transform: `translateY(${D}px) rotate(-1.500deg)` }], { duration: 620 * d, delay: last ? 520 * d : 0, easing: 'cubic-bezier(.5,0,.85,.5)', fill: 'forwards' }).onfinish = done;
      }
      function rewrite(h) {
        if (h.leaving || !h.sign) return;
        h.read = Math.min(9000, h.read + 1200); arm(h);
        if (ctx.reduced) { fill(h.sign, h.n); mind(); return; }
        if (h.busy) { h.again = true; return; }
        h.busy = true;
        const d = k();
        rig.style.setProperty('--px', h.slot === 'R' ? 3.3 : h.slot === 'L' ? -3.3 : 0);
        h.sign.animate([{ transform: 'none' }, { transform: `translateY(${drop(h)}px) rotate(-1deg)` }], { duration: 230 * d, easing: 'ease-in', fill: 'forwards' }).onfinish = (ev) => {
          fill(h.sign, h.n); mind();
          const up = h.sign.animate([{ transform: `translateY(${drop(h)}px)`, easing: 'cubic-bezier(.2,.8,.3,1)' }, { offset: .6, transform: 'translateY(-5px) rotate(1.400deg)', easing: 'ease-in-out' }, { offset: .82, transform: 'translateY(1px) rotate(-.8deg)', easing: 'ease-in-out' }, { transform: 'none' }], { duration: 380 * d });
          ev.target.cancel();
          up.onfinish = () => { h.busy = false; rig.style.removeProperty('--px'); if (h.again) { h.again = false; h.read -= 1200; rewrite(h); } };
        };
      }

      return {
        show(n) {
          const h = { n, sign: null };
          if (live.length >= 3) queue.push(h); else start(h);
          return { update(nn) { h.n = nn; if (h.sign) rewrite(h); } };
        },
        still(n) {
          const mood = M[n.mood] ? n.mood : 'calibrating';
          const root = E('div', 'warden-still warden-v warden-on'), w = makeWarden();
          const sign = makeSign(n), stand = E('div', 'warden-stand'), wall = E('div', 'warden-wall');
          if (M[mood].tilt) sign.style.setProperty('--tilt', -3.5);
          stand.style.height = M[mood].top + 'px';
          const pole = E('div', 'warden-pole'); pole.style.left = '111px';
          stand.append(pole, w.who, w.lamp, w.axe);
          place(w, 129);
          w.over.style.left = '129px'; wall.append(w.over);
          dress(root, w, mood, true, true);
          root.style.setProperty('--gx', -.5); root.style.setProperty('--gy', -2.6);
          if (ctx.reduced) root.classList.add('warden-rm');
          root.append(sign, stand, wall, w.glow);
          return root;
        },
        clear() {
          timers.forEach(clearTimeout); timers.clear();
          for (const h of live) { h.sign.getAnimations().forEach((a) => a.cancel()); h.sign.remove(); }
          live.length = 0; queue.length = 0;
          if (rig) { W.nod.getAnimations().forEach((a) => a.cancel()); rig.classList.remove('warden-on'); dress(rig, W, 'good', false, false); detach(); }
        },
      };
    },
  });
})();
