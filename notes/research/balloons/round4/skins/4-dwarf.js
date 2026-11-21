// Round 4, skin 4: "The Dwarf". The gatewarden of round 3 takes to the air,
// grudgingly, in a craft he has built himself: stitched leather, iron bands,
// chains instead of ropes, an ore bucket for a basket and a brazier with a
// bellows for a burner. The news hangs under the bucket on two chains, as a
// riveted plate.
//
// The head (helm, brows, eyes, moustache, braids, pen-wobble filter) is the
// round 3 warden's drawing. Everything that moves every frame is an HTML
// layer of its own (envelope, car, beard, gear, plate), so the filtered
// drawings are painted once; the frame callback only writes transforms and
// the two chain paths.
(() => {
  const NS = 'http://www.w3.org/2000/svg', INK = '#23170f';
  // the rig, in px: centre line, envelope mouth (the hinge), eye line, rim, bucket bottom, plate top
  const W = 204, CX = 102, HG = 100, HY = 174, RY = 209, BY = 250, SY = 270, HS = 0.72, LC = 21;
  const uri = (s) => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
  const plate = (edge, hi, face, fe, rivet) => uri(`<svg xmlns='${NS}' width='60' height='60'><rect x='.7' y='.7' width='58.6' height='58.6' rx='3' fill='${edge}' stroke='${INK}' stroke-width='1.3'/><path d='M2.6,57V2.6H57' fill='none' stroke='${hi}' stroke-width='1' opacity='.75'/><path d='M57.4,3V57.4H3' fill='none' stroke='#000' stroke-width='1' opacity='.35'/><rect x='7.5' y='7.5' width='45' height='45' rx='1' fill='${face}' stroke='${fe}' stroke-width='.9'/><path d='M8.2,52V8.2H52' fill='none' stroke='#000' stroke-opacity='.45' stroke-width='1.4'/><g fill='${rivet}' stroke='${INK}' stroke-width='.6'><circle cx='4.2' cy='4.2' r='1.8'/><circle cx='55.8' cy='4.2' r='1.8'/><circle cx='4.2' cy='55.8' r='1.8'/><circle cx='55.8' cy='55.8' r='1.8'/></g></svg>`);
  const IRON = plate('#666d74', '#aab2b8', '#24282c', '#111', '#9aa2a8');
  const RUST = plate('#8a5231', '#c08a5a', '#2c2622', '#170f0a', '#5a3018');
  const BRONZE = plate('#9c7738', '#e0c283', '#23272b', '#111', '#e6cc92');
  const BRASS = plate('#c9a04b', '#f6e2a6', '#1c2530', '#0c1218', '#fff0bd');
  const GOLD = plate('#b98f35', '#fff0b8', '#dcb95a', '#8a6a22', '#fff3c4');
  const HOT = plate('#2b2727', '#6a6260', '#171314', '#000', '#ff7a45');
  const BLACK = plate('#1d1a17', '#5b554c', '#1b1d20', '#000', '#6a6358');
  const ACH = plate('#8a6733', '#ecd49c', '#cdac6c', '#7c5c2a', '#e6cc92');

  // ---- moods: how the face, the helm, the hands and the craft are held ----
  const DEF = { rise: 0, tilt: 0, bly: 0, blr: 0, bry: 0, brr: 0, lid: 2, low: 0, px: 0, py: 0, es: 1, er: 1, hx: 0, hy: 0, hr: 0, hs: 1, ml: 0, grin: 0, arm: 0, paw: 0, hat: 0, mask: 0, loupe: 0, hl: 1, hrt: 1, bd: 1, nug: 0, tank: 0, ty: 0, ovf: 0, hrg: 0, chin: 0, pipe: 0, horn: 0, axe: 0, b1: 0, b2: 0, war: 0, strm: 0, cloud: 0, crepe: 0, seal: 0, rings: 0, patch: 0, rune: 0, smoke: 0, fl: 1, lg: 1, sag: 0 };
  const M = {
    calibrating: { bly: -5.5, blr: -10, bry: 1, lid: 1.6, loupe: 1, er: 1.18, nug: 1, hrt: 0 },
    poor: { rise: -15, hy: 9, lid: 3.4, bly: 1, bry: 1, bd: 0, cloud: 1, patch: 1, sag: 1, fl: 0, smoke: 1, lg: .55 },
    meh: { rise: -3, tilt: -6, hy: -9, hr: -6, lid: 4.6, bly: 1.5, bry: 1.5, chin: 1, hrg: 1, hl: 0, hrt: 0 },
    good: { blr: 4, brr: -4, lid: 1.4, pipe: 1, b1: 1 },
    great: { rise: 4, bly: -4, bry: -4, lid: .4, tank: 1, ty: 1, hrt: 0, b1: 1, b2: 1, lg: 1.7 },
    superb: { rise: 5, bly: -6, bry: -6.5, blr: -7, brr: 7, lid: -1, es: 1.15, hat: 1, horn: 1, tank: 1, ovf: 1, hl: 0, hrt: 0, strm: 1, fl: 1.3, lg: 1.5 },
    pvp: { rise: 4, lid: 4.3, low: 2.4, bly: 2, bry: 2, blr: 14, brr: -14, grin: 1, ml: 8, mask: 1, axe: 1, war: 1, hl: 0, lg: .8 },
    levelup: { rune: 1 },
    death: { fl: .45, lg: .5, crepe: 1 },
    achievement: { rise: 7, lid: 3.3, bly: -2, bry: -2, blr: 3, brr: -3, seal: 1, rings: 1 },
  };
  // what he only does once he has arrived
  const AT = {
    levelup: { rise: 3, hx: -80, hy: -32, hr: -14, arm: 1, bly: -3, bry: -3, lid: 1, hl: 0 },
    death: { rise: -4, tilt: -4, hx: -66, hy: 50, hr: -8, hs: .72, paw: 1, py: 2.5, lid: 4.5, blr: -10, brr: 10, bly: -1, bry: -1, hl: 0 },
  };
  // where the thing he holds is, for his glances (pupil px)
  const PROP = { calibrating: [3, -1], poor: [.4, -1.7], meh: [3, -1.6], good: [2, 2.2], great: [3.2, -1.6], superb: [-3, -.6], pvp: [-2.6, -1.6], levelup: [-3, -2.4], achievement: [0, 2.4] };
  const RANK = { poor: 1, meh: 2, good: 3, great: 4, superb: 5 };
  const vars = (o) => Object.keys(o).filter((k) => k in DEF).map((k) => `--${k}:${o[k]}`).join(';');
  const show = (...names) => names.map((n) => `.dwarf-${n}{--x:var(--${n})}`).join('');

  Harness.css('dwarf', `
.dwarf-v{position:relative;width:${W}px;padding-top:${SY}px;box-sizing:content-box;pointer-events:none;${vars(DEF)};--k:1;--go:.9;
  --p1:#8b6b47;--p2:#775a3b;--band:#6f7479;--bc:#3f6a45;--f1:#f08a2c;--f2:#ffe9a8;--coal:#e8862e}
.dwarf-v *{box-sizing:border-box}
${Object.keys(M).map((m) => `.dwarf-v[data-mood=${m}]{${vars(M[m])}}`).join('\n')}
.dwarf-v:not(.dwarf-at){--lid:1.2}
${Object.keys(AT).map((m) => `.dwarf-at[data-mood=${m}]{${vars(AT[m])}}`).join('\n')}
.dwarf-v[data-mood=poor]{--p1:#75705f;--p2:#656152;--band:#8a5231;--coal:#4c4039}
.dwarf-v[data-mood=meh]{--p1:#a69c84;--p2:#948a73;--band:#7d7f7c}
.dwarf-v[data-mood=good]{--band:#47683f}
.dwarf-v[data-mood=great]{--band:#2f5a7a;--bc:#2f5a7a}
.dwarf-v[data-mood=superb]{--p1:#94432f;--p2:#c79a4a;--band:#e0bb55}
.dwarf-v[data-mood=pvp]{--p1:#3d3533;--p2:#2e2827;--band:#8e2a1f}
.dwarf-v[data-mood=levelup]{--band:#b08a45}
.dwarf-v[data-mood=death]{--p1:#58544c;--p2:#4b4741;--band:#4a4d50;--f1:#4f8fd0;--f2:#cfe6ff;--coal:#39506a}
.dwarf-v[data-mood=achievement]{--band:#cfa94a}
.dwarf-v[data-sky=dusk]{--go:.65}.dwarf-v[data-sky=day]{--go:.25}.dwarf-v[data-sky=overcast]{--go:.38}
.dwarf-a{position:absolute;left:0;top:0;width:${W}px;height:0}
.dwarf-z{position:absolute;width:0;height:0}
.dwarf-s{position:absolute;overflow:visible;display:block}
.dwarf-s *{transform-box:view-box}
.dwarf-v[data-sky=night] .dwarf-rim{filter:drop-shadow(0 0 .7px rgba(255,230,186,.5))}
.dwarf-v[data-sky=dusk] .dwarf-rim{filter:drop-shadow(0 0 .6px rgba(255,226,190,.3))}
.dwarf-env,.dwarf-car{will-change:transform;transform-origin:${CX}px ${HG}px}
.dwarf-envb{transform-origin:${CX}px ${HG}px;animation:dwarf-eb 5.2s ease-in-out infinite alternate}
.dwarf-sag{transform-origin:${CX}px ${HG}px;transform:scale(calc(1 - var(--sag)*.05),calc(1 - var(--sag)*.1)) skewX(calc(var(--sag)*-2deg));transition:transform calc(.6s*var(--k))}
.dwarf-p1{fill:var(--p1)}.dwarf-p2{fill:var(--p2)}.dwarf-band{fill:var(--band)}.dwarf-bc{fill:var(--bc)}
.dwarf-p1,.dwarf-p2,.dwarf-band{transition:fill calc(.5s*var(--k))}
.dwarf-patch{opacity:var(--patch)}.dwarf-crepe{opacity:var(--crepe)}
.dwarf-runeg{opacity:var(--rune);transition:opacity calc(.6s*var(--k));filter:drop-shadow(0 0 3px #ffb84a) drop-shadow(0 0 7px rgba(255,170,60,.7))}
.dwarf-runeg svg{animation:dwarf-pu 1.6s ease-in-out infinite alternate}
.dwarf-coal{fill:var(--coal)}.dwarf-slit{stroke:var(--coal)}
.dwarf-bel{transform:scaleY(.9)}
.dwarf-pump .dwarf-bel{animation:dwarf-bw .46s ease-in-out infinite alternate}
.dwarf-glow{position:absolute;left:${CX - 62}px;top:${HG - 56}px;width:124px;height:124px;border-radius:50%;opacity:0;background:radial-gradient(closest-side,rgba(255,196,116,.5),rgba(255,160,70,.15) 46%,rgba(255,150,50,0))}
.dwarf-v[data-mood=death] .dwarf-glow{background:radial-gradient(closest-side,rgba(120,170,255,.3),rgba(90,140,255,0) 60%)}
.dwarf-v[data-mood=poor] .dwarf-glow{display:none}
.dwarf-fm{transform:scale(var(--fl));transition:transform calc(.5s*var(--k))}
.dwarf-fl{will-change:transform;transform:scale(.8,.6)}
.dwarf-fl svg{left:-14px;top:-44px}
.dwarf-fl path{transform-box:fill-box;transform-origin:50% 100%;animation:dwarf-fk .43s ease-in-out infinite alternate}
.dwarf-fl path+path{animation-duration:.31s}
.dwarf-f1{fill:var(--f1)}.dwarf-f2{fill:var(--f2)}
.dwarf-smoke{opacity:var(--smoke);transition:opacity .5s}
.dwarf-smoke svg{animation:dwarf-sm 3.1s ease-in-out infinite}
.dwarf-puff{position:absolute;left:-9px;top:-16px;width:18px;height:14px;border-radius:50%;background:radial-gradient(closest-side,rgba(214,208,196,.8),rgba(214,208,196,0));opacity:0}
.dwarf-ban{will-change:transform}
.dwarf-ban svg{transform:scale(1.25);transform-origin:15px 2px}
.dwarf-ban>div{transform-origin:0 6px;animation:dwarf-fu 2.7s ease-in-out infinite alternate}
.dwarf-b1,.dwarf-b2,.dwarf-war,.dwarf-strm{opacity:var(--x);transition:opacity calc(.3s*var(--k))}
${show('b1', 'b2', 'war', 'strm', 'nug', 'tank', 'hrg', 'chin', 'horn', 'axe')}
.dwarf-clip{position:absolute;left:-40px;top:-60px;width:${W + 80}px;height:${RY + 5 + 60}px;overflow:hidden}
.dwarf-in{position:absolute;left:40px;top:60px;width:${W}px;height:0}
.dwarf-lift,.dwarf-br,.dwarf-look,.dwarf-nod{position:absolute;left:0;top:0;width:${W}px;height:0;transform-origin:${CX}px ${RY + 8}px}
.dwarf-lift{transform:translateY(calc(var(--rise)*-1px)) rotate(calc(var(--tilt)*1deg));transition:transform calc(.55s*var(--k)) cubic-bezier(.3,1.25,.5,1)}
.dwarf-br{animation:dwarf-br 4.4s ease-in-out infinite alternate}
.dwarf-head{left:${CX - 125 * HS}px;top:${HY - 100 * HS}px}
.dwarf-helm{transform:translate(calc(var(--hx)*1px),calc(var(--hy)*1px)) rotate(calc(var(--hr)*1deg)) scale(var(--hs));transition:transform calc(.55s*var(--k)) cubic-bezier(.3,1.3,.5,1)}
.dwarf-bL{transform:translateY(calc(var(--bly)*1px)) rotate(calc(var(--blr)*1deg))}
.dwarf-bR{transform:translateY(calc(var(--bry)*1px)) rotate(calc(var(--brr)*1deg))}
.dwarf-bL,.dwarf-bR,.dwarf-mo,.dwarf-eye,.dwarf-pm,.dwarf-lid,.dwarf-low{transition:transform calc(.4s*var(--k)) ease-out}
.dwarf-mo{transform:rotate(calc(var(--ml)*-1deg))}
.dwarf-eye{transform:scale(var(--es))}
.dwarf-eyeR{transform:scale(calc(var(--es)*var(--er)))}
.dwarf-pm{transform:translate(calc(var(--px)*1px),calc(var(--py)*1px))}
.dwarf-lid{transform:translateY(calc(var(--lid)*1px));fill:#a88368;stroke:${INK};stroke-width:.9}
.dwarf-low{transform:translateY(calc(var(--low)*-1px));fill:#b08b6f;stroke:${INK};stroke-width:.7}
.dwarf-grin,.dwarf-mask,.dwarf-loupe,.dwarf-strap{transition:opacity calc(.3s*var(--k))}
.dwarf-grin{opacity:var(--grin)}.dwarf-mask{opacity:var(--mask)}.dwarf-loupe{opacity:var(--loupe)}.dwarf-strap{opacity:var(--hat)}
.dwarf-arm{opacity:var(--arm);transition:opacity .12s}
.dwarf-paw{opacity:var(--paw);transition:opacity .2s calc(.3s*var(--k))}
.dwarf-hat{opacity:var(--hat);transform:scale(calc(.3 + .7*var(--hat)));transition:transform calc(.45s*var(--k)) cubic-bezier(.3,1.7,.5,1) calc(.15s*var(--k)),opacity .15s}
.dwarf-p{position:absolute;left:0;top:0;width:${W}px;height:0;opacity:var(--x);transform:translateY(calc((1 - var(--x))*44px));transition:transform calc(.5s*var(--k)) cubic-bezier(.3,1.25,.5,1),opacity calc(.14s*var(--k))}
.dwarf-ty{transform:translateY(calc(var(--ty)*-9px));transition:transform calc(.5s*var(--k)) cubic-bezier(.3,1.3,.5,1);transform-origin:${CX + 80}px ${RY}px}
.dwarf-ovf{opacity:var(--ovf)}
.dwarf-hornr{transform-origin:${CX - 30}px ${RY}px;transform:translate(-4px,5px) rotate(-8deg);transition:transform calc(.4s*var(--k)) cubic-bezier(.3,1.3,.5,1)}
.dwarf-blow .dwarf-hornr{transform:translate(0,-3px) rotate(5deg)}
.dwarf-toot{opacity:0}
.dwarf-blow .dwarf-toot{animation:dwarf-to .38s ease-out 3}
.dwarf-axr{left:${CX - 38}px;top:${RY + 12}px;transform:rotate(-17deg)}
.dwarf-bd{left:${CX}px;top:${RY - 2}px;will-change:transform}
.dwarf-bd>div{transform-origin:0 0;transform:scaleY(var(--bd));transition:transform calc(.3s*var(--k)) cubic-bezier(.3,1.5,.5,1)}
.dwarf-rg,.dwarf-xb{opacity:var(--rings)}
.dwarf-hL .dwarf-fg,.dwarf-hR .dwarf-fg{transition:transform calc(.2s*var(--k)) cubic-bezier(.3,1.5,.5,1),opacity calc(.08s*var(--k));transition-delay:calc(var(--i)*.04s*var(--k))}
.dwarf-hL .dwarf-fg{transform:translateY(calc((1 - var(--hl))*9px)) scaleY(calc(.1 + .9*var(--hl)));opacity:var(--hl)}
.dwarf-hR .dwarf-fg{transform:translateY(calc((1 - var(--hrt))*9px)) scaleY(calc(.1 + .9*var(--hrt)));opacity:var(--hrt)}
.dwarf-pipe,.dwarf-seal{opacity:0;transition:opacity calc(.3s*var(--k))}
.dwarf-pipe{opacity:var(--pipe)}.dwarf-seal{opacity:var(--seal)}
.dwarf-ring{display:none;left:${CX + 25}px;top:${RY - 17}px}
.dwarf-v[data-mood=good] .dwarf-ring{display:block}
.dwarf-ring i{position:absolute;left:-5px;top:-3px;width:10px;height:6px;border:1.4px solid rgba(238,236,226,.8);border-radius:50%;opacity:0;animation:dwarf-rn 4.5s linear infinite}
.dwarf-ring i+i{animation-delay:-2.2s}
.dwarf-lan,.dwarf-anv{will-change:transform}
.dwarf-lan{left:${CX + 63}px;top:${RY + 1}px}
.dwarf-lan svg{position:absolute;left:-12px;top:-2px;width:24px;height:33.6px;overflow:visible}
.dwarf-lf{transform:translateY(-8px) scale(var(--lg)) translateY(8px)}
.dwarf-lgl{position:absolute;left:-36px;top:-16px;width:72px;height:72px;border-radius:50%;background:radial-gradient(closest-side,rgba(255,206,128,.5),rgba(255,176,88,.16) 45%,rgba(255,160,60,0));opacity:calc(var(--go)*var(--lg)*.75);transition:opacity .5s;animation:dwarf-gw 2.1s ease-in-out infinite alternate}
.dwarf-anv{left:${CX - 63}px;top:${RY + 1}px}
.dwarf-cloud{display:none}
.dwarf-v[data-mood=poor] .dwarf-cloud{display:block;animation:dwarf-cl 3.6s ease-in-out infinite alternate}
.dwarf-rain path{stroke-dasharray:5 8;animation:dwarf-ra .5s linear infinite}
.dwarf-conf{display:none;left:${CX}px;top:${HG + 12}px}
.dwarf-v[data-mood=superb] .dwarf-conf,.dwarf-conf.dwarf-once{display:block}
.dwarf-conf i{position:absolute;left:-3px;top:-3px;width:5px;height:6.5px;opacity:0;animation:dwarf-cf 2.7s linear infinite}
.dwarf-conf.dwarf-once i{width:4px;height:4px;border-radius:50%;animation-duration:1.1s;animation-iteration-count:2;box-shadow:0 0 4px #ffb84a}
.dwarf-ch{left:0;top:0}
.dwarf-ch use{fill:none;stroke-linecap:round}
.dwarf-c0{stroke:#454a50;stroke-width:1.2}
.dwarf-c0{stroke:#5a6067;stroke-width:1.5}
.dwarf-c1{stroke:#17120e;stroke-width:4.3;stroke-dasharray:2.4 5.6}
.dwarf-c2{stroke:#8d949b;stroke-width:2.5;stroke-dasharray:2.4 5.6}
.dwarf-c3{stroke:#17120e;stroke-width:.9;stroke-dasharray:2 6;stroke-dashoffset:-.2}
.dwarf-v[data-sky=night] .dwarf-c2{stroke:#a4abb1}
@keyframes dwarf-eb{from{transform:scale(1,1)}to{transform:scale(1.014,.988)}}
@keyframes dwarf-br{from{transform:translateY(.7px) scale(1,.996)}to{transform:translateY(-1.2px) scale(1,1.006)}}
@keyframes dwarf-pu{from{opacity:.65}to{opacity:1}}
@keyframes dwarf-bw{from{transform:scaleY(1.1)}to{transform:scaleY(.35)}}
@keyframes dwarf-fk{0%{transform:scale(1,1) skewX(0)}45%{transform:scale(.88,1.13) skewX(4deg)}100%{transform:scale(1.07,.9) skewX(-4deg)}}
@keyframes dwarf-sm{0%{transform:translateY(5px);opacity:0}30%{opacity:.8}100%{transform:translateY(-7px) scaleX(1.3);opacity:0}}
@keyframes dwarf-fu{from{transform:skewX(-4deg) scaleX(.94)}to{transform:skewX(5deg) scaleX(1.03)}}
@keyframes dwarf-to{0%{opacity:0;transform:scale(.6)}30%{opacity:1}100%{opacity:0;transform:scale(1.25)}}
@keyframes dwarf-rn{0%{transform:translate(0,0) scale(.5);opacity:0}8%{opacity:.9}60%{opacity:.5}100%{transform:translate(24px,-70px) scale(2.3);opacity:0}}
@keyframes dwarf-gw{from{transform:scale(.94)}to{transform:scale(1.04)}}
@keyframes dwarf-cl{from{transform:translate(-2px,0)}to{transform:translate(2.5px,1px)}}
@keyframes dwarf-ra{to{stroke-dashoffset:-13}}
@keyframes dwarf-cf{0%{transform:translate(0,0) scale(.3);opacity:0;animation-timing-function:cubic-bezier(.1,.7,.4,1)}7%{opacity:1}32%{transform:translate(calc(var(--dx)*.8),var(--up)) rotate(calc(var(--r)*.4));opacity:1;animation-timing-function:cubic-bezier(.5,0,.9,.6)}100%{transform:translate(var(--dx),96px) rotate(var(--r));opacity:0}}
@keyframes dwarf-hot{from{opacity:.55}to{opacity:1}}
.dwarf-sign{position:relative;width:176px;margin:0 auto;will-change:transform;font-family:"Cormorant Garamond",Georgia,serif;text-align:center;filter:drop-shadow(0 2px 3px rgba(0,0,0,.42));
  --pl:${IRON};--tx:#ece5d2;--dim:#bdb6a3;--fg:#f3ecd9;--on:#e9dfc4;--off:rgba(233,223,196,.2);color:var(--tx)}
.dwarf-sign[data-mood=poor]{--pl:${RUST};--tx:#d9cdb9;--fg:#d9cdb9;--on:#d2793d}
.dwarf-sign[data-mood=good]{--pl:${BRONZE};--on:#dfbb6a}
.dwarf-sign[data-mood=great]{--pl:${BRASS};--fg:#ffe7a0;--on:#ffd76a}
.dwarf-sign[data-mood=superb]{--pl:${GOLD};--tx:#2a190b;--dim:#59401a;--fg:#2a190b;--on:#4a230c;--off:rgba(60,35,8,.22)}
.dwarf-sign[data-mood=pvp]{--pl:${HOT};--tx:#f1ddd4;--fg:#ffa283;--on:#e8553c}
.dwarf-sign[data-mood=levelup]{--pl:${BRONZE};--fg:#ffe7a0}
.dwarf-sign[data-mood=death]{--pl:${BLACK};--tx:#c9c5bb;--fg:#d6d2c8}
.dwarf-sign[data-mood=achievement]{--pl:${ACH};--tx:#2a190b;--dim:#4d3417}
.dwarf-plate{position:relative;width:176px;padding:1px 5px 4px;border:8px solid transparent;border-image:var(--pl) 8 fill/8px stretch}
.dwarf-plate::before{content:"";position:absolute;inset:-1px;pointer-events:none;background:radial-gradient(70px 16px at 50% -2px,rgba(0,0,0,.5),transparent),radial-gradient(circle,rgba(255,255,255,.05) 0 1.3px,transparent 2.4px) 0 0/13px 11px,radial-gradient(circle,rgba(0,0,0,.2) 0 1.5px,transparent 2.6px) 6px 5px/15px 12px}
.dwarf-sign[data-mood=poor] .dwarf-plate::before{background:radial-gradient(70px 16px at 50% -2px,rgba(0,0,0,.5),transparent),radial-gradient(46px 20px at 8% 92%,rgba(176,92,40,.5),transparent),radial-gradient(34px 22px at 96% 12%,rgba(176,92,40,.42),transparent),radial-gradient(22px 12px at 70% 96%,rgba(150,80,36,.4),transparent)}
.dwarf-sign[data-mood=superb] .dwarf-plate::before,.dwarf-sign[data-mood=achievement] .dwarf-plate::before{background:radial-gradient(70px 14px at 50% -2px,rgba(60,30,0,.4),transparent),linear-gradient(115deg,transparent 30%,rgba(255,250,220,.4) 44%,transparent 58%),radial-gradient(circle,rgba(255,244,210,.25) 0 1.4px,transparent 2.6px) 0 0/13px 11px,radial-gradient(circle,rgba(70,40,8,.13) 0 1.6px,transparent 2.8px) 6px 5px/15px 12px}
.dwarf-sign[data-mood=pvp] .dwarf-plate::after{content:"";position:absolute;inset:-9px;pointer-events:none;animation:dwarf-hot 1.3s ease-in-out infinite alternate;background:radial-gradient(circle at 5px 5px,rgba(255,120,60,.85),transparent 9px),radial-gradient(circle at calc(100% - 5px) 5px,rgba(255,120,60,.85),transparent 9px),radial-gradient(circle at 5px calc(100% - 5px),rgba(255,120,60,.85),transparent 9px),radial-gradient(circle at calc(100% - 5px) calc(100% - 5px),rgba(255,120,60,.85),transparent 9px)}
.dwarf-plate>div{position:relative}
.dwarf-plate>div:empty{display:none}
.dwarf-title{font:italic 600 16px/1.08 "Cormorant Garamond",Georgia,serif;text-wrap:balance;overflow-wrap:anywhere;text-shadow:0 -1px 0 rgba(0,0,0,.6)}
.dwarf-rule{height:1px;margin:2px 18px 1px;background:linear-gradient(90deg,transparent,var(--dim) 20%,var(--dim) 80%,transparent);opacity:.55}
.dwarf-fig{font:600 27px/1 "Cormorant Garamond",Georgia,serif;font-variant-numeric:lining-nums;white-space:nowrap;color:var(--fg);text-shadow:0 -1px 0 rgba(0,0,0,.6)}
.dwarf-unit{font:italic 500 15px/1 "Cormorant Garamond",Georgia,serif;margin-left:4px;color:var(--dim)}
.dwarf-rate{display:flex;justify-content:center;align-items:center;gap:7px;margin-top:2px;min-height:15px}
.dwarf-studs{display:block;overflow:visible}
.dwarf-on{fill:var(--on);stroke:rgba(0,0,0,.6);stroke-width:.7}.dwarf-of{fill:none;stroke:var(--off);stroke-width:1}
.dwarf-red{fill:none;stroke:#e8553c;stroke-width:2.2;stroke-linecap:round}
.dwarf-word{font:400 13.5px/1 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.18em;margin-right:-.18em}
.dwarf-q{font:italic 400 15px/1 "IM Fell English",Georgia,serif;color:var(--dim)}
.dwarf-more{font:italic 500 13px/1.1 "Cormorant Garamond",Georgia,serif;color:var(--dim);margin-top:3px;text-wrap:balance}
.dwarf-tag{font:500 10px/1.5 Cinzel,Georgia,serif;letter-spacing:.3em;margin-right:-.3em;text-transform:uppercase}
.dwarf-sign[data-mood=superb] .dwarf-title,.dwarf-sign[data-mood=superb] .dwarf-fig,.dwarf-sign[data-mood=achievement] .dwarf-title,.dwarf-sign[data-mood=achievement] .dwarf-tag{text-shadow:0 1px 0 rgba(255,244,205,.6)}
.dwarf-sign[data-mood=superb] .dwarf-fig{font-weight:700}
.dwarf-sign[data-kind=levelup] .dwarf-plate{padding:7px 5px 8px}
.dwarf-sign[data-kind=levelup] .dwarf-fig{font:700 22px/1.1 Cinzel,Georgia,serif;letter-spacing:.04em}
.dwarf-sign[data-kind=death] .dwarf-plate{padding:8px 5px 9px}
.dwarf-sign[data-kind=death] .dwarf-fig{font:400 21px/1.15 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.17em;margin-right:-.17em;text-transform:lowercase;font-variant:small-caps}
.dwarf-sign[data-kind=achievement] .dwarf-plate{padding:2px 3px 5px}
.dwarf-sign[data-kind=achievement] .dwarf-title{font:italic 600 14px/1.1 "Cormorant Garamond",Georgia,serif}
.dwarf-rb{position:absolute;top:-4px;overflow:visible}
.dwarf-still{margin:0 auto}
.dwarf-rm *,.dwarf-rm *::before,.dwarf-rm *::after{transition:none!important;animation:none!important}
`);

  // ---- the drawing: the warden's head, ported ----
  const FILT = (id) => `<filter id="${id}" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.9" xChannelSelector="R" yChannelSelector="G" result="d"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .16 0 0 0 0 .09 0 0 0 0 .04 1.5 0 0 0 -.7" result="b"/><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="11"/><feColorMatrix type="matrix" values="0 0 0 0 .14 0 0 0 0 .08 0 0 0 0 .04 0 1.2 0 0 -.56" result="g"/><feMerge result="m"><feMergeNode in="b"/><feMergeNode in="g"/></feMerge><feComposite in="m" in2="d" operator="in" result="mc"/><feMerge><feMergeNode in="d"/><feMergeNode in="mc"/></feMerge></filter>`;
  const HATCH = (id, rot, gap, op) => `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${gap}" height="${gap}" patternTransform="rotate(${rot})"><path d="M0,.5H${gap}" stroke="${INK}" stroke-width=".55" opacity="${op}"/></pattern>`;
  const ALM = 'M-8.5,0Q0,-8 8.5,0Q0,6 -8.5,0Z';
  const eye = (s, u) => `<g transform="translate(${21 * s},0)"><g class="dwarf-eye${s > 0 ? ' dwarf-eyeR' : ''}"><ellipse cy="-1" rx="13.5" ry="9.5" fill="#4e2f20" opacity=".36"/><ellipse cy="-1" rx="13.5" ry="9.5" fill="url(#dwp${u})"/>
<g clip-path="url(#dwc${u})"><path d="${ALM}" fill="#d9cdb3"/><path d="M-10,-6H10V-.8H-10Z" fill="#3d281b" opacity=".36"/>
<g class="dwarf-pm"><g class="dwarf-pg"><circle r="3.5" fill="#3a2414"/><circle r="1.7" fill="#0c0705"/><circle cx="-1.2" cy="-1.3" r=".85" fill="#fff8e6"/></g></g>
<g class="dwarf-bl"><path class="dwarf-lid" d="M-12,-22H12V-5.5Q0,-3.5 -12,-5.5Z"/></g><path class="dwarf-low" d="M-12,18H12V5Q0,4 -12,5Z"/></g>
<path d="${ALM}" fill="none" stroke="${INK}" stroke-width=".8"/><path d="M-9.5,.6Q0,-8.800 9.500,.6" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/>
<path d="M${-8 * s},6.5q${8 * s},5 ${17 * s},-1M${-6 * s},9.5q${7 * s},4 ${14 * s},-.5M${-3 * s},12.5q${5 * s},2.500 ${9 * s},.5M${10 * s},-3l${5.5 * s},-2.500M${10.5 * s},0l${6 * s},.5M${10 * s},3l${5 * s},3" fill="none" stroke="${INK}" stroke-width=".6" stroke-linecap="round" opacity=".8"/></g></g>`;
  const BROW = `<g transform="scale(1.16)"><path d="M-14,4C-13,-5 2,-9 15,-4C19,-2 18,3 13,2C6,0 -3,1 -9,6C-12,8 -14,7 -14,4Z" fill="#7b6c5e" stroke="${INK}" stroke-width=".9"/><path d="M-10,3l2.500,-6M-6,1l2.500,-6.500M-1.500,0l2.500,-6M3,-.5l2.500,-5.500M7.500,-.5l2.500,-4.500M11.500,0l3,-3M14,1l4,-1.500" fill="none" stroke="#e0d7c6" stroke-width=".8" stroke-linecap="round"/><path d="M-12,5l2,-5M-8,2.500l2,-5.500M-4,1.500l2,-5M1,0l2,-5M5.500,-.5l2,-4M9.500,0l2,-3.500M-13,6l-2.500,1.500M-10,7l-1.500,2.500" fill="none" stroke="${INK}" stroke-width=".5" opacity=".8"/></g>`;
  const LOBE = `<path d="M0,-3C10,-9 25,-7 37,1C47,7 57,8 66,14C57,19.500 46,21 38,18C24,18 10,15 0,9Z" fill="#8a6045" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/><path d="M4,0C16,-4 30,0 46,10M4,3C18,0 32,5 52,14M3,6C16,5 30,10 44,16M12,-4C24,-5 36,2 50,9M8,10C20,12 32,15 42,17" fill="none" stroke="${INK}" stroke-width=".55" opacity=".75"/><path d="M8,-2C20,-5 32,-1 42,5.500M10,4.500C22,4.500 34,8.500 48,14.500M6,8C16,9 26,12 36,15.500" fill="none" stroke="#ddd3c0" stroke-width="1.1" stroke-linecap="round" opacity=".9"/>`;
  const rivets = [-46, -31, -16, 16, 31, 46].map((x) => { const y = -25 - 4.5 * (x / 56) ** 2; return `<circle cx="${x}" cy="${y.toFixed(1)}" r="2.200"/><circle cx="${x + .6}" cy="${(y - .7).toFixed(1)}" r=".7" fill="#e9d6a4" stroke="none"/>`; }).join('');
  const head = (u) => `<svg class="dwarf-s dwarf-head dwarf-rim" xmlns="${NS}" width="${250 * HS}" height="${260 * HS}" viewBox="-125 -100 250 260"><defs>${FILT('dwf' + u)}${HATCH('dwp' + u, 38, 3, .6)}${HATCH('dwq' + u, -52, 3.400, .5)}
<clipPath id="dwc${u}"><path d="${ALM}"/></clipPath>
<linearGradient id="dwi${u}" x1="0" x2="1" y1="0" y2=".25"><stop offset="0" stop-color="#30353a"/><stop offset=".5" stop-color="#596067"/><stop offset="1" stop-color="#8c949a"/></linearGradient>
<linearGradient id="dws${u}" x1="0" x2="1"><stop offset="0" stop-color="#92705a"/><stop offset=".5" stop-color="#c2a085"/><stop offset="1" stop-color="#e2c7a8"/></linearGradient>
<linearGradient id="dwh${u}" x1="0" x2="1"><stop offset="0" stop-color="#4a2f23"/><stop offset="1" stop-color="#80543b"/></linearGradient>
<linearGradient id="dwb${u}" x1="0" x2="1"><stop offset="0" stop-color="#5c4724"/><stop offset=".6" stop-color="#94793f"/><stop offset="1" stop-color="#c4a868"/></linearGradient></defs>
<g filter="url(#dwf${u})" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">
<path d="M-72,160C-72,100 -64,74 -44,63L44,63C64,74 72,100 72,160Z" fill="#453426" stroke-width="1.2"/>
<path d="M-72,160C-72,100 -64,74 -44,63L-28,63C-50,80 -56,110 -56,160Z" fill="url(#dwp${u})" stroke="none"/>
<path d="M-46,-24C-58,-22 -66,-10 -64,2C-70,8 -70,20 -65,26C-71,34 -68,48 -59,60L-38,60L-42,10Z" fill="url(#dwh${u})" stroke-width="1.1"/>
<path d="M-46,-24C-61,-19 -67,2 -63,20C-69,32 -65,46 -57,60L-48,60C-54,40 -54,6 -46,-24Z" fill="url(#dwp${u})" stroke="none"/>
<path d="M46,-24C58,-22 66,-10 64,2C70,8 70,20 65,26C71,34 68,48 59,60L38,60L42,10Z" fill="#7f553c" stroke-width="1.1"/>
<path d="M-56,-12C-60,4 -58,18 -60,30M-51,-10C-55,8 -53,24 -57,44M-49,12C-51,28 -50,40 -52,54M56,-12C60,4 58,18 60,30M52,-6C55,10 53,26 57,44M49,10C51,24 50,38 52,52" fill="none" stroke-width=".55" opacity=".75"/>
<path d="M-54,-14C-57,2 -55,16 -58,34M53,-14C57,0 55,14 58,30M50,14C52,26 52,38 54,50M59,-6C62,6 60,16 62,24" fill="none" stroke="#d6ccb9" stroke-width="1.1" opacity=".9"/>
<path d="M-46,-10C-48,-42 -28,-57 0,-57C28,-57 48,-42 46,-10Z" fill="url(#dws${u})" stroke-width="1.1"/>
<path d="M-46,-10C-48,-42 -28,-57 -6,-57C-26,-50 -36,-34 -34,-10Z" fill="url(#dwp${u})" stroke="none"/>
<path d="M-30,-40C-12,-45 14,-45 30,-40M-34,-32C-12,-37 14,-37 34,-32M-20,-47C-8,-50 10,-50 20,-47" fill="none" stroke-width=".55" opacity=".6"/>
<path d="M-36,-25C-12,-29 12,-29 36,-25" fill="none" stroke="#8f4a38" stroke-width="1.1" opacity=".45"/>
<path d="M-16,-56C-13,-63 -5,-61 -8,-55M3,-57C7,-64 13,-61 10,-56M-3,-58C-2,-63 2,-64 3,-60" fill="none" stroke="#c9bfad" stroke-width=".9"/>
<path d="M-47,-24C-51,-4 -51,22 -44,44L44,44C51,22 51,-4 47,-24Z" fill="url(#dws${u})" stroke-width="1.1"/>
<path d="M-47,-24C-51,-4 -51,22 -44,44L-30,44C-39,24 -39,0 -35,-24Z" fill="#4e2f20" opacity=".22" stroke="none"/>
<path d="M-47,-24C-51,-4 -51,22 -44,44L-33,44C-41,24 -41,0 -38,-24Z" fill="url(#dwp${u})" stroke="none"/>
<path d="M-47,-24C-51,-4 -51,22 -44,44L-40,44C-46,24 -46,0 -43,-24Z" fill="url(#dwq${u})" stroke="none"/>
<path d="M-47,-23Q0,-16 47,-23L46.500,-12Q0,-4 -46.500,-12Z" fill="#3d281b" opacity=".3" stroke="none"/><path d="M-47,-23Q0,-16 47,-23L46.500,-14Q0,-7 -46.500,-14Z" fill="url(#dwq${u})" stroke="none"/>
<ellipse cx="-30" cy="18" rx="10" ry="7" fill="#9c4a36" opacity=".16" stroke="none"/><ellipse cx="31" cy="18" rx="10" ry="7" fill="#b25a44" opacity=".16" stroke="none"/>
<path d="M-20,20C-27,22 -33,28 -36,36M20,20C27,22 33,28 36,36M-25,27C-29,29 -32,33 -33,37M25,27C29,29 32,33 33,37M-40,2C-43,8 -43,14 -41,20M40,2C43,8 43,14 41,20M-3,-17v6M3.500,-17v5.500M36,6l5,5M38,12l4,5" fill="none" stroke-width=".6" opacity=".75"/>
<path d="M-56,22C-62,58 -46,100 0,122C46,100 62,58 56,22C30,42 -30,42 -56,22Z" fill="url(#dwh${u})" stroke-width="1.2"/>
<path d="M-10,42C-9,70 -4,96 0,120C4,96 9,70 10,42Z" fill="#b9ad9b" opacity=".5" stroke="none"/>
<path d="M-54,30C-22,50 22,50 54,30L50,46C22,62 -22,62 -50,46Z" fill="url(#dwp${u})" stroke="none"/>
<path d="M-56,22C-62,58 -46,100 0,122C-30,96 -44,60 -42,32Z" fill="url(#dwq${u})" stroke="none"/>
<path d="M-46,40C-44,64 -34,86 -14,104M-34,44C-32,66 -24,86 -6,108M-20,46C-20,66 -14,88 0,112M20,46C20,66 14,88 0,112M34,44C32,66 24,86 8,106M46,40C44,64 36,84 18,102" fill="none" stroke-width=".55" opacity=".7"/>
<path d="M-27,45C-26,64 -20,82 -8,100M27,45C26,64 20,82 8,100M-8,47C-8,66 -4,84 0,100M-41,46C-39,60 -34,74 -26,86M41,46C39,60 34,74 26,86M14,46C13,62 9,80 4,96" fill="none" stroke="#d6ccb9" stroke-width="1.2" opacity=".9"/>
<g class="dwarf-grin"><path d="M-19,38C-9,50 9,50 19,38C9,42.500 -9,42.500 -19,38Z" fill="#dccfae" stroke-width=".9"/><path d="M-11.500,41.500v4.500M-6,42.300v5.200M0,42.600v5.600M6,42.300v5.200M11.500,41.500v4.500" fill="none" stroke-width=".6"/></g></g>
<g transform="translate(0,31)" filter="url(#dwf${u})"><g class="dwarf-mo">${LOBE}</g></g><g transform="translate(0,31) scale(-1,1)" filter="url(#dwf${u})"><g class="dwarf-mo">${LOBE}<path d="M0,-3C10,-9 25,-7 37,1C47,7 57,8 66,14C52,12 40,8 30,6C18,3 8,2 0,2Z" fill="url(#dwp${u})" stroke="none"/></g></g>
<g stroke="${INK}" stroke-linejoin="round" stroke-linecap="round" filter="url(#dwf${u})">
<path d="M-5,-10C-7,2 -15,8 -17,18C-18.500,28 -9,34.500 0,33.500C9,34.500 18.500,28 17,18C15,8 7,2 5,-10Z" fill="#bd9174" stroke-width="1.1"/>
<path d="M-17,18.500C-22,19.500 -22,28.500 -15,29M17,18.500C22,19.500 22,28.500 15,29" fill="#ab7f64" stroke-width="1"/>
<ellipse cx="-1" cy="23" rx="13" ry="8.500" fill="#a3402c" opacity=".17" stroke="none"/><ellipse cx="5.500" cy="16" rx="5" ry="7" fill="#f3dcc0" opacity=".42" stroke="none"/>
<path d="M-5,-10C-7,2 -15,8 -17,18C-18.500,28 -9,34.500 -3,33.500C-10,28 -10,16 -3,4Z" fill="url(#dwp${u})" stroke="none"/>
<path d="M-11,31q3.500,2.500 7,.5M11,31q-3.500,2.500 -7,.5" fill="none" stroke-width="1.1"/><path d="M-2,8q3,6 1.500,13M7,24q3,-1 4,-4" fill="none" stroke-width=".5" opacity=".6"/></g>
${eye(-1, u)}${eye(1, u)}
<g transform="translate(-22,-10.5)"><g class="dwarf-bL"><g transform="scale(-1,1)">${BROW}</g></g></g><g transform="translate(22,-10.5)"><g class="dwarf-bR">${BROW}</g></g>
${faceX(u)}<g transform="translate(0,-20)"><g class="dwarf-helm"><g transform="translate(0,20)" filter="url(#dwf${u})" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">
<path d="M-53,-24C-56,-58 -32,-74 0,-74C32,-74 56,-58 53,-24Z" fill="url(#dwi${u})" stroke-width="1.3"/>
<path d="M-53,-24C-56,-58 -32,-74 -4,-74C-22,-64 -30,-48 -29,-24Z" fill="url(#dwp${u})" stroke="none"/><path d="M-53,-24C-56,-58 -32,-74 -18,-73C-36,-62 -44,-46 -43,-24Z" fill="url(#dwq${u})" stroke="none"/>
<path d="M30,-33C30,-50 22,-63 10,-71C24,-66 40,-54 44,-33Z" fill="url(#dwp${u})" stroke="none" opacity=".55"/>
<path d="M24,-68C38,-61 47,-49 48,-38C41,-50 33,-60 24,-68Z" fill="#fff" opacity=".28" stroke="none"/>
<path d="M-28,-34C-27,-54 -17,-67 -5,-73M28,-34C27,-54 17,-67 5,-73" fill="none" stroke-width=".9"/>
<path d="M-6,-32C-6,-56 -4,-69 0,-75C4,-69 6,-56 6,-32Z" fill="#6c747a" stroke-width="1"/><path d="M-3,-36v-22M3,-36v-22" fill="none" stroke-width=".45" opacity=".6"/>
<path d="M12,-71.500C34,-69 53,-54 50.500,-36" fill="none" stroke="#ffe7b8" stroke-width="1" opacity=".6"/>
<path d="M35,-50l5,3M16,-58l3,4l3,-2M-14,-48l4,2M38,-42l3,5" fill="none" stroke-width=".6" opacity=".7"/>
<ellipse cx="0" cy="-76" rx="5.500" ry="3.600" fill="url(#dwb${u})" stroke-width="1"/>
<path d="M-56.500,-35Q0,-29 56.500,-35L56.500,-23Q0,-16 -56.500,-23Z" fill="url(#dwb${u})" stroke-width="1.3"/>
<path d="M-56.500,-35Q-28,-32 -20,-31.500L-20,-18.500Q-40,-20 -56.500,-23Z" fill="url(#dwp${u})" stroke="none"/>
<path d="M-55,-31.500Q0,-25.500 55,-31.500M-55,-25.500Q0,-18.800 55,-25.500" fill="none" stroke-width=".5" opacity=".75"/>
<path d="M-5.500,-21L-4,-7Q0,-3.500 4,-7L5.500,-21Z" fill="url(#dwb${u})" stroke-width="1.1"/><path d="M0,-19v11" fill="none" stroke-width=".55" opacity=".7"/>
<g fill="#7a6232" stroke-width=".7">${rivets}</g>
${helmX(u)}<g class="dwarf-paw" fill="#b79479" stroke-width="1"><path d="M-24,-62c-3,-6 4,-11 8,-6l4,7c2,5 -6,8 -9,4Z"/><path d="M-13,-68c-2,-7 6,-10 9,-4l2,8c1,5 -7,7 -9,2Z"/><path d="M-1,-70c-1,-7 8,-8 10,-2l1,8c0,5 -8,6 -10,1Z"/><path d="M11,-69c1,-7 9,-6 10,0l-1,8c-1,5 -8,4 -9,-1Z"/><path d="M-19,-62q3,-2 6,0M-8,-66q3,-2 6,-1M4,-67q3,-1.500 6,0M14,-65q3,-1 5,.5" fill="none" stroke-width=".6"/></g>
</g></g></g>
</svg>`;
  const finger = (x, i, len) => `<g transform="translate(${x},0)"><g class="dwarf-fg" style="--i:${i}"><path d="M-5.800,-3C-5.800,-11 5.800,-11 5.800,-3L5.500,${len - 5}C5.500,${len + 1.5} -5.500,${len + 1.5} -5.500,${len - 5}Z" fill="#b79479" stroke="${INK}" stroke-width="1.1"/><path d="M-5.800,-3C-5.800,-11 0,-11 -1,-9C-3,-4 -3,${len - 6} -2,${len}C-5,${len} -5.500,${len - 2} -5.500,${len - 5}Z" fill="#4e2f20" opacity=".3"/><path d="M-3.800,-2Q0,-.2 3.800,-2M-3.300,-4.800Q0,-3.600 3.300,-4.800" fill="none" stroke="${INK}" stroke-width=".6"/><path d="M-3.300,${len - 5}Q0,${len - 7.5} 3.300,${len - 5}L3.300,${len - 4}Q0,${len} -3.300,${len - 4}Z" fill="#cdb597" stroke="${INK}" stroke-width=".45"/></g></g>`;
  const braid = (x) => { let s = ''; for (let j = 0; j < 3; j++) { const y = 3 + j * 5.5, m = j % 2 ? -1 : 1; s += `<path d="M${-6.5 * m},${y}C${-7.5 * m},${y + 5} ${0},${y + 8.5} ${6.5 * m},${y + 7}C${7.5 * m},${y + 2} 0,${y - 1.5} ${-6.5 * m},${y}Z" fill="${j % 2 ? '#74492f' : '#8e5f43'}" stroke="${INK}" stroke-width=".9"/><path d="M${-3 * m},${y + 2}Q0,${y + 3.5} ${3.5 * m},${y + 5}" fill="none" stroke="#d6ccb9" stroke-width=".8"/>`; } return `<g transform="translate(${x},0)">${s}<rect x="-5.500" y="20.500" width="11" height="4.500" rx="1" fill="#a88b4c" stroke="${INK}" stroke-width=".8"/><path d="M-4.500,25C-6,29 -2,31.500 0,31.500C2,31.500 6,29 4.500,25Z" fill="#8a6045" stroke="${INK}" stroke-width=".8"/></g>`; };
  const lampArt = () => `<svg xmlns="${NS}" width="40" height="56" viewBox="-20 -54 40 56"><g stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">
<circle cx="0" cy="-46" r="4" fill="none" stroke-width="1.3"/><path d="M-12,-31L0,-42L12,-31Z" fill="#4a4f55" stroke-width="1.2"/>
<rect x="-9" y="-31" width="18" height="25" fill="#f3bf62" stroke-width="1.3"/><rect x="-9" y="-31" width="18" height="25" fill="#fff0bd" opacity=".45" stroke="none"/>
<g class="dwarf-lf"><path d="M0,-25C4.500,-18 4.500,-12 0,-9.500C-4.500,-12 -4.500,-18 0,-25Z" fill="#fffbe6" stroke="#d07a22" stroke-width=".8"/></g>
<path d="M-3,-31V-6M3,-31V-6" fill="none" stroke-width="1" opacity=".8"/><rect x="-11.500" y="-6.500" width="23" height="6" rx="1" fill="#4a4f55" stroke-width="1.2"/><path d="M-9,-33.500l9,-7" fill="none" stroke="#aab3ba" stroke-width=".8" opacity=".7"/></g></svg>`;

  const S = (cls, x, y, w, h, body) => `<svg class="dwarf-s ${cls}" xmlns="${NS}" style="left:${CX + x}px;top:${y}px" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}">${body}</svg>`;
  const G = (u, body, extra = '') => `<g filter="url(#dwf${u})" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round" ${extra}>${body}</g>`;

  // on the face, under the helm: the jeweller's loupe
  const faceX = (u) => `<g class="dwarf-loupe" stroke="${INK}" stroke-linejoin="round" filter="url(#dwf${u})"><path d="M19,-11L23,-27M26,-10L33,-25" fill="none" stroke="#3a2616" stroke-width="2.4"/><circle cx="21" cy="-1" r="12.5" fill="url(#dwb${u})" stroke-width="1.2"/><circle cx="21" cy="-1" r="9" fill="#17110c" stroke-width="1"/></g><g class="dwarf-loupe"><circle cx="21" cy="-1" r="8.4" fill="#a9cbd6" opacity=".3"/><path d="M14.500,-5Q17.500,-9.500 23,-8.500" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity=".85"/></g>`;
  // on the helm: the war mask, the party hat, the saluting arm
  const stripe = (a, b) => { const l = (h) => (-20 + 23 * h / 58).toFixed(1), r = (h) => (20 - 17 * h / 58).toFixed(1); return `<path d="M${l(a)},${2 - a}Q0,${7 - a} ${r(a)},${2 - a}L${r(b)},${2 - b}Q0,${6 - b} ${l(b)},${2 - b}Z" fill="#94432f" stroke-width=".6"/>`; };
  const helmX = (u) => `<g class="dwarf-mask"><path fill-rule="evenodd" d="M-56,-24L56,-24L55,28Q48,37 40,27L34,12L8,10L6,29Q0,35 -6,29L-8,10L-34,12L-40,27Q-48,37 -55,28ZM-34,0Q-21,-12 -8,0Q-21,8 -34,0ZM8,0Q21,-12 34,0Q21,8 8,0Z" fill="url(#dwi${u})" stroke-width="1.3"/><path d="M-56,-24L56,-24L55,28Q48,37 40,27L34,12L8,10L6,29Q0,35 -6,29L-8,10L-34,12L-40,27Q-48,37 -55,28Z" fill="#14161a" opacity=".3" stroke="none"/><path d="M36,-22L50,-22L49,24Q46,28 42,24L37,10Z" fill="#fff" opacity=".14" stroke="none"/><path d="M-40,14L-44,26M40,14L44,26M-3,12V27M3,12V27" fill="none" stroke-width=".6" opacity=".7"/>
<path d="M-56,-24L-20,-24L-20,-10Q-34,-8 -40,27Q-48,37 -55,28Z" fill="url(#dwp${u})" stroke="none"/><path d="M-36,-5Q-21,-17 -6,-7M6,-7Q21,-17 36,-5" fill="none" stroke-width="1.8"/><path d="M47,-16L46,16" fill="none" stroke="#dfe6ea" stroke-width="1" opacity=".5"/><path d="M0,10V27" fill="none" stroke-width=".6" opacity=".7"/>
<g fill="#8e2a1f" stroke-width=".6"><circle cx="-46" cy="-8" r="1.900"/><circle cx="-46" cy="8" r="1.900"/><circle cx="46" cy="-8" r="1.900"/><circle cx="46" cy="8" r="1.900"/><circle cx="0" cy="-16" r="1.900"/></g></g>
<path class="dwarf-strap" d="M-36,-58C-62,-36 -60,10 -49,36M14,-70C44,-58 58,-22 50,30" fill="none" stroke="#e9dfc4" stroke-width="1.100"/>
<g transform="rotate(-21 0 -40)"><g transform="translate(-3,-62) scale(1.4)"><g class="dwarf-hat"><path d="M-20,2Q0,8 20,2L3,-56Z" fill="#efe6cf" stroke-width="1.1"/>${stripe(6, 15)}${stripe(24, 33)}${stripe(42, 50)}<path d="M-20,2Q0,8 20,2L3,-56Z" fill="url(#dwp${u})" stroke="none" opacity=".5" clip-path="inset(0 50% 0 0)"/><path d="M-21,2Q0,9 21,2" fill="none" stroke="${INK}" stroke-width="4"/><path d="M-21,2Q0,9 21,2" fill="none" stroke="#d9b24c" stroke-width="2.400"/>
<circle cx="3" cy="-59" r="6.500" fill="#d9b24c" stroke-width="1"/><path d="M3,-59l-5,-4M3,-59l5,-3M3,-59l-6,2M3,-59l5,4M3,-59l0,-6M3,-59l-1,6" fill="none" stroke-width=".6"/></g></g></g>
<g class="dwarf-arm"><g transform="rotate(14 4 -27)"><path d="M-6,-8L-11,112H19L13,-8Z" fill="#4d4a3b" stroke-width="1.2"/><path d="M-6,-8L-11,112H-2L0,-8Z" fill="url(#dwp${u})" stroke="none"/><path d="M-7.500,22h22M-7.700,42h22.500M-7.800,62h23" fill="none" stroke-width=".6" opacity=".7"/>
<path d="M-10,-4L-8,-17H15L17,-4Z" fill="url(#dwb${u})" stroke-width="1.1"/><path d="M-9,-10H16" fill="none" stroke="#b79a5e" stroke-width="1.100" stroke-dasharray="2 2.500"/>
<path d="M-11,-22C-14,-34 -8,-40 3.500,-40C15,-40 21,-34 18,-22C16,-15 -9,-15 -11,-22Z" fill="#b79479" stroke-width="1.1"/><path d="M-11,-22C-14,-34 -8,-40 -3,-40C-7,-34 -7,-26 -5,-17C-9,-18 -10,-20 -11,-22Z" fill="#4e2f20" opacity=".3" stroke="none"/><path d="M-4,-39.500v13M3.500,-40v13.500M11,-39.500v13M-9,-27q12.500,3 25.500,0" fill="none" stroke-width=".7"/>
<path d="M12,-22C20,-27 26,-21 23,-16C20,-12 13,-14 12,-18Z" fill="#c2a085" stroke-width="1"/></g></g>`;

  // ---- the craft ----
  const OUT = 'M-24,104C-54,96 -86,76 -86,48C-86,20 -52,6 0,6C52,6 86,20 86,48C86,76 54,96 24,104Z';
  const RUNE = 'M0,17V43M0,19L9.500,26.500L0,34M0,28.500L-8.500,37';
  const KS = [-1.4, -.72, -.3, .3, .72, 1.4];
  const seam = (k) => `C${110 * k},14 ${112 * k},80 ${24 * k},104`;
  const back = (k) => `C${112 * k},80 ${110 * k},14 0,6`;
  const envArt = (u) => {
    let pan = '', sm = '', rv = '';
    for (let i = 0; i < 5; i++) pan += `<path class="dwarf-p${i % 2 ? 2 : 1}" d="M0,6${seam(KS[i])}L${24 * KS[i + 1]},104${back(KS[i + 1])}Z"/>`;
    for (const k of KS.slice(1, 5)) sm += `<path d="M0,6${seam(k)}" stroke-width=".9"/><path d="M0,6${seam(k)}" transform="translate(${k > 0 ? -2 : 2},0)" stroke="#e6d6ae" stroke-width=".8" stroke-dasharray="1.600 2.600" opacity=".55"/>`;
    for (let x = -72; x <= 72; x += 18) { const y = 48 + 9 * (1 - (x / 86.5) ** 2); rv += `<circle cx="${x}" cy="${y.toFixed(1)}" r="1.900"/>`; }
    return S('dwarf-rim', -100, HG - 118, 200, 126, `<defs><clipPath id="dwv${u}"><path d="${OUT}"/></clipPath><linearGradient id="dwl${u}" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".42"/><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset=".75" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".2"/></linearGradient></defs>
<g transform="translate(0,${HG - 104})">${G(u, `<g clip-path="url(#dwv${u})"><g stroke="none">${pan}<rect x="-90" y="0" width="180" height="110" fill="url(#dwl${u})"/>
<path d="M-86,48C-86,20 -52,6 0,6C-30,14 -52,30 -52,58C-52,82 -40,96 -24,104C-54,96 -86,76 -86,48Z" fill="url(#dwp${u})"/><path d="M-86,48C-86,20 -52,6 -20,6C-50,14 -70,30 -70,54C-70,80 -50,96 -24,104C-54,96 -86,76 -86,48Z" fill="url(#dwq${u})"/>
<path d="M-74,78Q0,100 74,78L24,106H-24Z" fill="#000" opacity=".25"/><path d="M40,16C62,22 76,34 79,50C70,34 56,24 40,16Z" fill="#fff" opacity=".22"/></g>
<g fill="none">${sm}</g><g class="dwarf-patch" fill="none" stroke-width=".7" opacity=".8"><path d="M-60,30q8,6 4,14M-44,70q10,-2 14,6M50,66q-8,4 -6,12M20,12q6,6 2,12M-20,84q8,-4 14,2"/></g></g>
<path d="${OUT}" fill="none" stroke-width="1.3"/>
<path class="dwarf-band" d="M-86.500,44Q0,62 86.500,44L86.500,52Q0,70 -86.500,52Z" stroke-width="1.1"/><path d="M-86.500,44Q-40,53.500 -30,54.500L-30,62.500Q-60,59 -86.500,52Z" fill="url(#dwp${u})" stroke="none"/><path d="M-84,46.300Q0,64 84,46.300" fill="none" stroke="#fff" stroke-width=".8" opacity=".3"/>
<g fill="#b39a5c" stroke-width=".6">${rv}</g>
<path d="M-66,82Q0,96 66,82L63,87.500Q0,101.500 -63,87.500Z" fill="url(#dwi${u})" stroke-width="1"/>
<path d="M-87,47h-5v5M87,47h5v5" fill="none" stroke-width="1.8"/>
<ellipse cx="0" cy="104" rx="24.500" ry="4.800" fill="#170f0a" stroke-width="1.2"/><path d="M-24.500,104Q0,110.500 24.500,104" fill="none" stroke="#8d949b" stroke-width="1.6"/>
<g fill="none" stroke-width="1.3"><circle cx="-66" cy="86.500" r="2.300"/><circle cx="66" cy="86.500" r="2.300"/><circle cx="-44" cy="97.500" r="2.300"/><circle cx="44" cy="97.500" r="2.300"/></g>
<path d="M-19,13Q-12,3 0,3Q12,3 19,13Q0,19 -19,13Z" fill="url(#dwb${u})" stroke-width="1.1"/><path d="M-12,9l3,4M-4,6l2,6M5,6l-1,6M12,8l-2,5" fill="none" stroke-width=".5" opacity=".7"/><path d="M-3,3V-2H3V3" fill="#94793f" stroke-width="1"/><circle cx="0" cy="-5" r="4.500" fill="url(#dwb${u})" stroke-width="1.1"/><circle cx="1.500" cy="-6.500" r="1.200" fill="#fff3c4" stroke="none"/>
<path d="${RUNE}" fill="none" stroke-width="2" opacity=".5"/>
<g class="dwarf-patch"><g transform="rotate(13 36 30)"><path d="M24,20H48L49,34L44,38H23Z" fill="#70767b" stroke-width="1.1"/><path d="M49,34L44,38L44.500,33.500Z" fill="#3b3f44" stroke-width=".8"/><path d="M24,20H34L33,38H23Z" fill="url(#dwp${u})" stroke="none"/><g fill="#c9c2b0" stroke-width=".5"><circle cx="27" cy="23" r="1.300"/><circle cx="45" cy="23" r="1.300"/><circle cx="26.500" cy="35" r="1.300"/><circle cx="40" cy="35.500" r="1.300"/></g><path d="M20,24l5,2M20,31l4,1M50,25l4,-2M36,16l1,5M32,39l-1,5" fill="none" stroke-width=".7"/></g></g>
<g class="dwarf-crepe" stroke="#000"><path d="M-87.500,42Q0,61 87.500,42L87.500,54Q0,73 -87.500,54Z" fill="#17140f" stroke-width="1"/><path d="M-62,57C-70,72 -60,84 -70,100L-57,96C-55,84 -55,72 -53,60Z" fill="#1c1813" stroke-width="1"/><path d="M-52,58C-48,72 -52,82 -45,94L-37,88C-41,78 -41,68 -43,60Z" fill="#14110d" stroke-width="1"/><circle cx="-53" cy="58" r="5.500" fill="#221d17" stroke-width="1"/><path d="M-80,48Q0,66 80,48M-62,68q3,12 -2,24M-47,68q0,10 4,18" fill="none" stroke="#6a6257" stroke-width=".7"/></g>`)}</g>`);
  };
  const runeArt = () => `<div class="dwarf-a dwarf-runeg">${S('', -12, HG - 90, 24, 32, `<path transform="translate(0,${HG - 104})" d="${RUNE}" fill="none" stroke="#ffe6a8" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round"/>`)}</div>`;
  const brazier = () => S('', -40, HG - 2, 80, 28, `<g transform="translate(0,-5)" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round"><path d="M-14,${HG + 1}V${HG + 9}M14,${HG + 1}V${HG + 9}M0,${HG + 4}V${HG + 9}" fill="none" stroke="#3a3f45" stroke-width="1.2" stroke-dasharray="2 1.2"/>
<path d="M-16,${HG + 8}H16Q14,${HG + 20} 0,${HG + 20}Q-14,${HG + 20} -16,${HG + 8}Z" fill="#3f444a" stroke-width="1.1"/><path d="M-16,${HG + 8}H-6Q-7,${HG + 17} 0,${HG + 20}Q-14,${HG + 20} -16,${HG + 8}Z" fill="#000" opacity=".3" stroke="none"/>
<path class="dwarf-slit" d="M-9,${HG + 12}v4M-3,${HG + 12.5}v5M3,${HG + 12.5}v5M9,${HG + 12}v4" fill="none" stroke-width="1.500"/>
<ellipse class="dwarf-coal" cx="0" cy="${HG + 8}" rx="16" ry="2.700" stroke-width="1"/>
<g transform="translate(17,${HG + 14})"><path d="M0,0h3" fill="none" stroke-width="2.200"/><g transform="translate(3,0)"><g class="dwarf-bel"><path d="M0,0L16,-6.500L16,6.500Z" fill="#8a5d38" stroke-width="1"/><path d="M5,-2V2M10,-4V4" fill="none" stroke-width=".5"/><path d="M16,-6.500h5M16,6.500h5" fill="none" stroke="${INK}" stroke-width="2.600"/><path d="M16,-6.500h5M16,6.500h5" fill="none" stroke="#a07a50" stroke-width="1.300"/></g></g></g></g>`);
  const flame = () => `<div class="dwarf-z dwarf-flw" style="left:${CX}px;top:${HG + 4}px"><div class="dwarf-z dwarf-fm"><div class="dwarf-z dwarf-fl"><svg class="dwarf-s" xmlns="${NS}" width="28" height="46" viewBox="-14 -44 28 46"><path class="dwarf-f1" d="M0,0C-10,-3 -10,-14 -5,-21C-4,-15 -1,-15 -2,-27C2,-34 1,-38 3,-42C5,-32 10,-26 9,-14C9,-6 6,-1 0,0Z"/><path class="dwarf-f2" d="M0,-1C-5,-3 -5,-10 -1,-17C2,-22 2,-25 3,-28C5,-20 6,-12 5,-7C4,-3 2,-1 0,-1Z"/></svg></div></div>
<div class="dwarf-z dwarf-smoke"><svg class="dwarf-s" xmlns="${NS}" width="20" height="40" viewBox="-10 -38 20 40" style="left:-10px;top:-38px"><path d="M0,0C-6,-7 6,-12 0,-20C-5,-27 4,-30 1,-37" fill="none" stroke="#a9adb0" stroke-width="2.200" stroke-linecap="round" opacity=".75"/></svg></div><div class="dwarf-puff"></div></div>`;
  const pennant = (cls, x, body) => `<div class="dwarf-z dwarf-ban ${cls}" style="left:${CX + x}px;top:${HG - 54}px"><div class="dwarf-z"><svg class="dwarf-s" xmlns="${NS}" width="30" height="62" viewBox="-15 -2 30 62" style="left:-15px;top:-2px"><g stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg></div></div>`;
  const FLAG = `<path d="M0,0V6" fill="none" stroke="#6f767c" stroke-width="1.600"/><path d="M-11,6.500H11" fill="none" stroke-width="2.800"/><path class="dwarf-bc" d="M-10,7.500H10V40L0,32L-10,40Z" stroke-width="1"/><path d="M-10,7.500H-3V34.500L-10,40Z" fill="#000" opacity=".22" stroke="none"/><path d="M-7,10.500H7V33.500L0,28L-7,33.500Z" fill="none" stroke="#e0c283" stroke-width=".8"/><path d="M0,14V25M-4.500,14H4.500V18.500H-4.500Z" fill="#e6cc92" stroke="#e6cc92" stroke-width="1.300"/>`;
  const WARF = `<path d="M0,0V6" fill="none" stroke="#6f767c" stroke-width="1.600"/><path d="M-13,6.500H13" fill="none" stroke-width="3"/><path d="M-12,7.500H12V52L7,45L3,56L-2,46L-7,57L-12,47Z" fill="#8e2a1f" stroke-width="1"/><path d="M-12,7.500H-4V46L-7,57L-12,47Z" fill="#000" opacity=".28" stroke="none"/><path d="M0,14V40M0,17C-9,13 -10,28 0,26M0,17C9,13 10,28 0,26" fill="none" stroke="#17110d" stroke-width="2.200"/>`;
  const STRM = `<path d="M0,0V5" fill="none" stroke="#6f767c" stroke-width="1.600"/>${[['#d9b24c', -5, 1], ['#b3412e', 0, -1], ['#efe6cf', 5, 1]].map(([c, x, s], i) => { const d = `M${x * .3},5C${x - 8 * s},12 ${x + 8 * s},18 ${x},25C${x - 8 * s},32 ${x + 7 * s},38 ${x - s},${46 + i * 4}`; return `<path d="${d}" fill="none" stroke-width="3.600"/><path d="${d}" fill="none" stroke="${c}" stroke-width="2.200"/>`; }).join('')}`;

  const basket = (u) => {
    const y1 = RY + 10, y2 = RY + 26; let st = '', rv = '';
    for (const x of [-42, -28, -14, 0, 14, 28, 42]) st += `M${x},${RY + 4}L${(x * .92).toFixed(1)},${BY - 1}`;
    for (const x of [-40, -20, 0, 20, 40]) rv += `<circle cx="${x}" cy="${(y1 + 5.6 - (x / 40) ** 2 * 2).toFixed(1)}" r="1.400"/><circle cx="${x * .96}" cy="${(y2 + 5.6 - (x / 40) ** 2 * 2).toFixed(1)}" r="1.400"/>`;
    return S('dwarf-rim', -72, RY - 8, 144, BY - RY + 20, `<defs><linearGradient id="dww${u}" x1="0" x2="1"><stop offset="0" stop-color="#4a3220"/><stop offset=".55" stop-color="#7d5c3d"/><stop offset="1" stop-color="#a58157"/></linearGradient></defs>${G(u, `
<path d="M56,${RY + 1}H65V${RY + 4}M-56,${RY + 1}H-65V${RY + 4}" fill="none" stroke-width="3.400"/><path d="M56,${RY + 1}H65V${RY + 4}M-56,${RY + 1}H-65V${RY + 4}" fill="none" stroke="#7b838a" stroke-width="1.600"/>
<path d="M-57,${RY + 2}L-52,${BY - 3}Q0,${BY + 3} 52,${BY - 3}L57,${RY + 2}Z" fill="url(#dww${u})" stroke-width="1.2"/>
<path d="M-57,${RY + 2}L-52,${BY - 3}Q-36,${BY - 1} -26,${BY}L-30,${RY + 2}Z" fill="url(#dwp${u})" stroke="none"/><path d="M-57,${RY + 2}L-52,${BY - 3}Q-46,${BY - 2} -42,${BY - 1.5}L-45,${RY + 2}Z" fill="url(#dwq${u})" stroke="none"/>
<path d="${st}" fill="none" stroke-width=".65" opacity=".75"/><path d="M-35,${RY + 20}v14M-7,${RY + 18}v10M21,${RY + 19}v12M36,${RY + 30}v8M7,${RY + 32}v7" fill="none" stroke="#d2b384" stroke-width=".9" opacity=".6"/>
<path d="M-56,${y1}Q0,${y1 + 5} 56,${y1}L55.300,${y1 + 6}Q0,${y1 + 11} -55.300,${y1 + 6}Z" fill="url(#dwi${u})" stroke-width="1"/>
<path d="M-54.300,${y2}Q0,${y2 + 5} 54.300,${y2}L53.600,${y2 + 6}Q0,${y2 + 11} -53.600,${y2 + 6}Z" fill="url(#dwi${u})" stroke-width="1"/>
<g fill="#b9c0c5" stroke-width=".5">${rv}</g>
<path d="M-47,${RY + 13}L-19,${RY + 37}" fill="none" stroke-width="4.400"/><path d="M-47,${RY + 13}L-19,${RY + 37}" fill="none" stroke="#9a744a" stroke-width="2.400"/>
<path d="M-55,${RY + 23}Q-52,${RY + 11} -38,${RY + 7}" fill="none" stroke-width="4.600"/><path d="M-55,${RY + 23}Q-52,${RY + 11} -38,${RY + 7}" fill="none" stroke="#9aa2a8" stroke-width="2.600"/>
<g fill="none"><ellipse cx="31" cy="${RY + 24}" rx="8.500" ry="9.500" stroke-width="4.200"/><ellipse cx="31" cy="${RY + 24}" rx="8.500" ry="9.500" stroke="#bda26b" stroke-width="2.600"/><ellipse cx="31" cy="${RY + 24}" rx="4.300" ry="5.200" stroke-width="3.400"/><ellipse cx="31" cy="${RY + 24}" rx="4.300" ry="5.200" stroke="#a88d58" stroke-width="2"/><path d="M24,${RY + 19}l3,2M37,${RY + 20}l-3,2M25,${RY + 30}l3,-2M38,${RY + 29}l-3,-2M31,${RY + 13}v3" stroke-width=".5"/></g>
<rect x="-60" y="${RY - 3}" width="120" height="7.500" rx="2.600" fill="url(#dwi${u})" stroke-width="1.2"/><path d="M-57,${RY - 1.3}H57" fill="none" stroke="#e3e9ec" stroke-width=".8" opacity=".55"/>
<g fill="#30353a" stroke-width=".4"><circle cx="-50" cy="${RY + 1.4}" r="1.200"/><circle cx="-24" cy="${RY + 1.4}" r="1.200"/><circle cx="24" cy="${RY + 1.4}" r="1.200"/><circle cx="50" cy="${RY + 1.4}" r="1.200"/></g>
<path d="M-55,${BY - 5}h10v3.500h-10ZM45,${BY - 5}h10v3.500h-10Z" fill="url(#dwi${u})" stroke-width=".9"/>`)}
<g fill="none"><circle cx="-50" cy="${BY + 1.5}" r="3" stroke="#17120e" stroke-width="2.200"/><circle cx="-50" cy="${BY + 1.5}" r="3" stroke="#9aa2a8" stroke-width=".9"/><circle cx="50" cy="${BY + 1.5}" r="3" stroke="#17120e" stroke-width="2.200"/><circle cx="50" cy="${BY + 1.5}" r="3" stroke="#9aa2a8" stroke-width=".9"/></g>`);
  };
  const beard = (u) => { const rg = (x) => `<rect class="dwarf-rg" x="${x - 6.5}" y="9" width="13" height="5" rx="1.500" fill="#e0bb55" stroke="${INK}" stroke-width=".8"/>`; return `<div class="dwarf-z dwarf-bd"><div class="dwarf-z"><svg class="dwarf-s dwarf-rim" xmlns="${NS}" width="${120 * HS}" height="${48 * HS}" viewBox="-60 -6 120 48" style="left:${-60 * HS}px;top:${-6 * HS}px"><g filter="url(#dwf${u})">
<path d="M-47,-.5L47,-.5C47,8 35,10 28,5C22,11 8,11 0,6C-8,11 -22,11 -28,5C-35,10 -47,8 -47,-.5Z" fill="#855a40" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
<path d="M-38,1q2,4 6,5M38,1q-2,4 -6,5M-4,1q1,3 4,4M-22,1q1,4 5,5M20,1q-1,4 -5,5" fill="none" stroke="#d6ccb9" stroke-width=".9"/><g class="dwarf-xb">${braid(-36)}${braid(36)}${rg(-36)}${rg(36)}</g>${braid(-15)}${braid(15)}${rg(-15)}${rg(15)}</g></svg></div></div>`; };
  const hands = (u) => { const h = (cls, x) => `<g transform="translate(${x},${RY - 3}) scale(.62)"><g class="${cls}">${finger(-18.5, 0, 12)}${finger(-6.2, 1, 14)}${finger(6.2, 2, 13.5)}${finger(18.5, 3, 11)}</g></g>`; return S('dwarf-rim', -66, RY - 14, 132, 28, `<g filter="url(#dwf${u})">${h('dwarf-hL', -44)}${h('dwarf-hR', 44)}</g>`); };
  const anvil = (u) => `<div class="dwarf-z dwarf-anv"><svg class="dwarf-s dwarf-rim" xmlns="${NS}" width="30" height="26" viewBox="-15 0 30 26" style="left:-15px;top:0"><path d="M0,2V10" fill="none" stroke="#17120e" stroke-width="2.800" stroke-dasharray="2.200 1.400"/><path d="M0,2V10" fill="none" stroke="#8d949b" stroke-width="1.300" stroke-dasharray="2.200 1.400"/><g filter="url(#dwf${u})" stroke="${INK}" stroke-linejoin="round"><path d="M-13,11Q-9,9.500 -5,9.500H9V13H4.500Q2.500,16 4.500,19H8V22.500H-8V19H-4.500Q-2.500,16 -4.500,13Q-10,13.500 -13,11Z" fill="url(#dwi${u})" stroke-width="1.1"/><path d="M-4,10.800H8" fill="none" stroke="#e3e9ec" stroke-width=".8" opacity=".6"/></g></svg></div>`;
  const cloud = (u) => `<div class="dwarf-a dwarf-cloud">${S('', -40, HG + 2, 80, 30, G(u, `<path d="M-27,${HG + 27}C-37,${HG + 27} -38,${HG + 15} -28,${HG + 14}C-28,${HG + 5} -15,${HG + 3} -10,${HG + 9}C-5,${HG + 1} 10,${HG + 1} 13,${HG + 9}C22,${HG + 5} 31,${HG + 11} 27,${HG + 17}C36,${HG + 18} 35,${HG + 27} 27,${HG + 27}Z" fill="#8b9197" stroke-width="1.1"/><path d="M-27,${HG + 27}C-37,${HG + 27} -38,${HG + 15} -28,${HG + 14}C-24,${HG + 20} -10,${HG + 22} 27,${HG + 27}Z" fill="url(#dwp${u})" stroke="none"/><path d="M-9,${HG + 10}q5,-4 10,-1M14,${HG + 10}q6,-1 8,3" fill="none" stroke="#dfe3e6" stroke-width="1" opacity=".8"/>`))}
${S('dwarf-rain', -40, HG + 28, 80, RY - HG - 30, `<g fill="none" stroke="#b9cfdc" stroke-width="1.200" stroke-linecap="round" opacity=".8">${[-22, -13, -4, 5, 14, 23].map((x, i) => `<path d="M${x},${HG + 29}L${x - 5},${RY - 6}" style="animation-delay:${-i * .13}s"/>`).join('')}</g>`)}</div>`;

  // ---- what he holds (forearms rise from behind the rim; the elbow stays in the bucket) ----
  const fore = (u, x, yt, w = 14, bx = 49) => `<path d="M${bx - w / 2 - 2},${RY + 12}L${x - w / 2},${yt + 5}H${x + w / 2}L${bx + w / 2 + 2},${RY + 12}Z" fill="#4d4a3b" stroke-width="1.1"/><path d="M${bx - w / 2 - 2},${RY + 12}L${x - w / 2},${yt + 5}h${w * .36}L${bx - w * .1},${RY + 12}Z" fill="url(#dwp${u})" stroke="none"/><path d="M${x - w / 2 - 1},${yt + 3}h${w + 2}l-.5,6.500h${-w - 1}Z" fill="url(#dwb${u})" stroke-width=".9"/>`;
  const fist = (x, y, r = 8) => `<path d="M${x - r},${y}C${x - r},${y - r * 1.15} ${x + r},${y - r * 1.15} ${x + r},${y}C${x + r},${y + r * .9} ${x - r},${y + r * .9} ${x - r},${y}Z" fill="#b79479" stroke-width="1.1"/><path d="M${x - r * .5},${y - r * .78}v${r * .75}M${x},${y - r * .86}v${r * .8}M${x + r * .5},${y - r * .78}v${r * .75}" fill="none" stroke-width=".6"/>`;
  const P = (cls, u, body) => `<div class="dwarf-p ${cls}">${S('dwarf-rim', -102, HG, 204, RY - HG + 44, G(u, body))}</div>`;
  const props = (u) => {
    const y = RY;
    return P('dwarf-nug', u, `${fore(u, 70, y - 26)}<path d="M58,${y - 26}C57,${y - 33} 63,${y - 31} 70,${y - 30}C77,${y - 31} 83,${y - 33} 82,${y - 26}C81,${y - 19} 59,${y - 19} 58,${y - 26}Z" fill="#b79479" stroke-width="1.1"/><path d="M61,${y - 24}q9,3 18,0" fill="none" stroke-width=".6"/><g class="dwarf-ng"><path d="M63,${y - 31}L65,${y - 40}L71.500,${y - 43}L77.500,${y - 38}L76,${y - 31}Z" fill="#d9b24c" stroke-width="1"/><path d="M65,${y - 40}L70,${y - 36.5}L71.500,${y - 43}M70,${y - 36.5}L76,${y - 31}M70,${y - 36.5}L63,${y - 31}" fill="none" stroke-width=".55"/><path d="M66.500,${y - 39}L70.500,${y - 41}" fill="none" stroke="#fff6d0" stroke-width="1.200"/></g>`)
      + `<div class="dwarf-p dwarf-tank"><div class="dwarf-a dwarf-ty">${S('dwarf-rim', -102, HG, 204, RY - HG + 44, G(u, `${fore(u, 81, y - 28, 13)}<path d="M79,${y - 46}C90,${y - 46} 90,${y - 27} 79,${y - 27}" fill="none" stroke-width="5"/><path d="M79,${y - 46}C90,${y - 46} 90,${y - 27} 79,${y - 27}" fill="none" stroke="#8d949b" stroke-width="2.600"/>
<path d="M59,${y - 51}H79L78,${y - 23}H60Z" fill="#84603d" stroke-width="1.1"/><path d="M59,${y - 51}H66L66.500,${y - 23}H60Z" fill="url(#dwp${u})" stroke="none"/><path d="M65.500,${y - 50}V${y - 24}M72,${y - 50}V${y - 24}" fill="none" stroke-width=".55" opacity=".7"/><path d="M59.200,${y - 46}h19.600v3.500h-19.500ZM59.700,${y - 30}h18.500v3.500h-18.400Z" fill="url(#dwi${u})" stroke-width=".8"/>
<path d="M57,${y - 50}C53,${y - 56} 60,${y - 60} 64,${y - 57}C66,${y - 63} 75,${y - 62} 76,${y - 57}C82,${y - 59} 85,${y - 52} 80,${y - 50}Z" fill="#f1e9d4" stroke-width="1"/><path d="M61,${y - 55}q3,-2 5,0M70,${y - 58}q3,-1 4,1" fill="none" stroke-width=".5" opacity=".6"/>
<g class="dwarf-ovf"><path d="M58,${y - 51}C55,${y - 44} 57,${y - 36} 60,${y - 33}C62,${y - 38} 61,${y - 45} 63,${y - 51}ZM71,${y - 51}c2,6 0,11 2,15c2,-3 2,-9 3,-15ZM64,${y - 62}c2,-5 8,-5 9,0Z" fill="#f1e9d4" stroke-width=".9"/><circle cx="58" cy="${y - 27}" r="1.600" fill="#f1e9d4" stroke-width=".7"/></g>${fist(82, y - 35, 6.5)}`))}</div></div>`
      + P('dwarf-hrg', u, `${fore(u, 71, y - 22)}<path d="M62,${y - 55}H80V${y - 51.5}H62ZM62,${y - 33}H80V${y - 29.5}H62Z" fill="#84603d" stroke-width="1"/><path d="M64.500,${y - 51.5}H77.500L72.200,${y - 42.3}L77.500,${y - 33}H64.500L69.800,${y - 42.3}Z" fill="#cfe2e8" fill-opacity=".5" stroke-width="1"/><path d="M67,${y - 48}H75L71,${y - 43}ZM66,${y - 33.4}Q71,${y - 39.5} 76,${y - 33.4}Z" fill="#d9b24c" stroke-width=".5"/><path d="M71,${y - 43}V${y - 37}" fill="none" stroke="#d9b24c" stroke-width=".8"/><path d="M63.200,${y - 51}V${y - 33}M78.800,${y - 51}V${y - 33}" fill="none" stroke-width="1.100"/>${fist(71, y - 23, 8)}`)
      + P('dwarf-chin', u, `<path d="M-62,${y + 14}L-45,${y - 12}L-31,${y - 7}L-44,${y + 14}Z" fill="#4d4a3b" stroke-width="1.1"/><path d="M-62,${y + 14}L-45,${y - 12}L-40,${y - 10}L-55,${y + 14}Z" fill="url(#dwp${u})" stroke="none"/><path d="M-47.500,${y - 9}L-33,${y - 4}L-36,${y + 1}L-50.500,${y - 4}Z" fill="url(#dwb${u})" stroke-width=".9"/>${fist(-37, y - 18, 9.5)}`)
      + `<div class="dwarf-p dwarf-horn"><div class="dwarf-a dwarf-hornr">${S('dwarf-rim', -102, HG, 204, RY - HG + 44, `<defs><linearGradient id="dwo${u}" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#8f7d5c"/><stop offset=".5" stop-color="#d8c9a4"/><stop offset="1" stop-color="#f1e7cc"/></linearGradient></defs>${G(u, `<path d="M-3,${y - 3}C-30,${y + 14} -72,${y + 10} -91,${y - 40}L-66,${y - 47}C-58,${y - 14} -32,${y - 6} -4,${y - 7}Z" fill="url(#dwo${u})" stroke-width="1.2"/>
<path d="M-20,${y + 2}C-40,${y + 8} -66,${y + 2} -80,${y - 22}M-30,${y - 5}C-46,${y - 6} -58,${y - 14} -64,${y - 30}" fill="none" stroke-width=".55" opacity=".6"/>
<path d="M-13,${y - 7.5}L-15,${y + 3.5}M-41,${y - 9}L-47,${y + 9}M-62,${y - 30}L-85,${y - 22}" fill="none" stroke-width="5"/><path d="M-13,${y - 7.5}L-15,${y + 3.5}M-41,${y - 9}L-47,${y + 9}M-62,${y - 30}L-85,${y - 22}" fill="none" stroke="#b08a45" stroke-width="3"/>
<ellipse cx="-78.500" cy="${y - 43.5}" rx="13" ry="4.500" transform="rotate(-16 -78.5 ${y - 43.5})" fill="#33251a" stroke-width="1.2"/>${fist(-28, y - 1, 8.5)}`)}`)}
${S('dwarf-toot', -102, HG, 60, 80, `<g transform="translate(-80,${y - 48})"><g class="dwarf-toot"><path d="M-6,-8L-11,-20M2,-10L3,-23M-13,-3L-24,-9" fill="none" stroke="#ffe6a8" stroke-width="2.200" stroke-linecap="round"/></g></g>`)}</div></div>`;
  };
  const axe = (u) => `<div class="dwarf-p dwarf-axe"><div class="dwarf-z dwarf-axr"><svg class="dwarf-s dwarf-rim" xmlns="${NS}" width="${96 * .62}" height="${160 * .62}" viewBox="-48 -154 96 160" style="left:${-48 * .62}px;top:${-154 * .62}px">${G(u, `<path d="M-3.500,-140H3.500V4H-3.500Z" fill="#6f4d2f" stroke-width="1.2"/><path d="M-1,-136V0M1.500,-120V-20" fill="none" stroke-width=".5" opacity=".6"/>
${[1, -1].map((s) => `<g transform="scale(${s},1)"><path d="M-3.500,-134C-14,-137 -30,-140 -41,-129C-36,-116 -36,-106 -43,-90C-28,-93 -13,-101 -3.500,-106Z" fill="url(#dwi${u})" stroke-width="1.4"/><path d="M-38.500,-127C-33.500,-115 -33.500,-106 -39.500,-93" fill="none" stroke="#f2f5f6" stroke-width="1.3" opacity=".85"/><path d="M-28,-132l8,8M-30,-124l10,10M-30,-114l10,9M-32,-104l9,7M-12,-128l4,4" fill="none" stroke-width=".55" opacity=".6"/></g>`).join('')}
<path d="M-5.500,-136H5.500V-104H-5.500Z" fill="url(#dwb${u})" stroke-width="1.1"/><path d="M-3,-136L0,-150L3,-136Z" fill="#8d949b" stroke-width="1"/><circle cx="0" cy="-128" r="1.500" fill="#e6cc92" stroke-width=".5"/><circle cx="0" cy="-112" r="1.500" fill="#e6cc92" stroke-width=".5"/>`)}</svg></div></div>`;
  const pipe = (u) => S('dwarf-pipe dwarf-rim', -4, RY - 20, 44, 34, G(u, `<path d="M8,${RY}C12,${RY + 8} 21,${RY + 8} 25,${RY - 1}" fill="none" stroke-width="4"/><path d="M8,${RY}C12,${RY + 8} 21,${RY + 8} 25,${RY - 1}" fill="none" stroke="#6a4526" stroke-width="2.200"/><path d="M19,${RY - 14}H31.500L30,${RY - 2}Q25.200,${RY + 2.5} 20.500,${RY - 2}Z" fill="#7a4d2a" stroke-width="1.1"/><path d="M19,${RY - 14}H23L23.500,${RY}Q21,${RY - .5} 20.500,${RY - 2}Z" fill="#000" opacity=".3" stroke="none"/><ellipse cx="25.200" cy="${RY - 14}" rx="6.300" ry="1.900" fill="#e8862e" stroke-width=".9"/>`));
  const seal = (u) => { const c = `M-40,${RY + 3}Q-34,${RY + 21} -9,${RY + 25}M40,${RY + 3}Q34,${RY + 21} 9,${RY + 25}`; return S('dwarf-seal dwarf-rim', -46, RY, 92, 52, G(u, `<path d="${c}" fill="none" stroke-width="5"/><path d="${c}" fill="none" stroke="#e0bb55" stroke-width="3" stroke-dasharray="3.400 1.800" stroke-linecap="butt"/>
<path d="M-4.500,${RY + 34}L-8,${RY + 47}L-3,${RY + 43.5}L0,${RY + 48}L3,${RY + 43.5}L8,${RY + 47}L4.500,${RY + 34}Z" fill="#8a3323" stroke-width=".9"/>
<circle cx="0" cy="${RY + 27}" r="10.500" fill="#d9b24c" stroke-width="1.2"/><circle cx="0" cy="${RY + 27}" r="7.500" fill="#ecd07a" stroke-width=".7"/><path d="M0,${RY + 21.5}V${RY + 32.5}M0,${RY + 22.5}L4,${RY + 25.5}L0,${RY + 28.500}M0,${RY + 26}L-3.500,${RY + 29.5}" fill="none" stroke="#5a3a10" stroke-width="1.300"/><path d="M-7,${RY + 21}Q-3,${RY + 17.5} 2,${RY + 18}" fill="none" stroke="#fff6d0" stroke-width="1.100" opacity=".8"/>`)); };
  const bits = (n, cols) => { let s = ''; for (let i = 0; i < n; i++) s += `<i style="--dx:${(i % 2 ? 1 : -1) * (22 + (i * 37) % 70)}px;--up:${-(4 + (i * 53) % 20)}px;--r:${(i * 97) % 540 - 270}deg;animation-delay:${(-(i * .31) % 2.7).toFixed(2)}s;background:${cols[i % cols.length]}"></i>`; return s; };
  const studs = (n, pvp) => {
    let s = '';
    if (pvp) s = '<path class="dwarf-red" d="M3,2L15,12M15,2L3,12"/>';
    else for (let i = 0; i < 5; i++) { const x = 5.5 + i * 11; s += `<path class="${i < n ? 'dwarf-on' : 'dwarf-of'}" d="M${x},1.500L${x + 4.5},7L${x},12.500L${x - 4.5},7Z"/>`; }
    return `<svg class="dwarf-studs" xmlns="${NS}" width="${pvp ? 18 : 55}" height="14" viewBox="0 0 ${pvp ? 18 : 55} 14">${s}</svg>`;
  };
  const RINGB = (x) => `<svg class="dwarf-rb" style="left:${x - 5}px" xmlns="${NS}" width="10" height="10" viewBox="-5 -5 10 10"><rect x="-4.500" y="1" width="9" height="3.600" rx="1" fill="#666d74" stroke="${INK}" stroke-width=".8"/><circle cy="-.5" r="3" fill="none" stroke="#17120e" stroke-width="2.200"/><circle cy="-.5" r="3" fill="none" stroke="#9aa2a8" stroke-width=".9"/></svg>`;

  const rig = (u) => `<div class="dwarf-v">
<div class="dwarf-a dwarf-env"><div class="dwarf-a dwarf-envb"><div class="dwarf-a dwarf-sag">${envArt(u)}${runeArt()}</div></div>${brazier()}${flame()}
${pennant('dwarf-b1', -92, FLAG)}${pennant('dwarf-b2', 92, FLAG)}${pennant('dwarf-war', 92, WARF)}${pennant('dwarf-strm', -92, STRM)}${pennant('dwarf-strm', 92, STRM)}</div>
<div class="dwarf-glow"></div>
<svg class="dwarf-s dwarf-ch" xmlns="${NS}" width="${W}" height="10"><defs><path id="dwa${u}"/><path id="dwz${u}"/></defs>${['a', 'z'].map((c) => [0, 1, 2, 3].map((i) => `<use href="#dw${c}${u}" class="dwarf-c${i}"/>`).join('')).join('')}</svg>
<div class="dwarf-a dwarf-car"><div class="dwarf-clip"><div class="dwarf-in">${axe(u)}
<div class="dwarf-lift"><div class="dwarf-br"><div class="dwarf-look"><div class="dwarf-nod">${head(u)}</div></div></div></div>${props(u)}</div></div>
${basket(u)}${beard(u)}${hands(u)}${pipe(u)}<div class="dwarf-z dwarf-ring"><i></i><i></i></div>${seal(u)}
<div class="dwarf-z dwarf-lan"><div class="dwarf-lgl"></div>${lampArt()}</div>${anvil(u)}</div>
${cloud(u)}<div class="dwarf-z dwarf-conf">${bits(24, ['#d9b24c', '#efe6cf', '#b3412e', '#f3d47a'])}</div>
</div>`;

  let uid = 0;
  Harness.register({
    id: 'dwarf',
    name: 'The Dwarf',
    blurb: 'Dwarves do not fly. This one was told to, so he built the thing himself: stitched leather, iron bands, chains for ropes, an ore bucket for a basket. The news hangs under it on a riveted plate, and his eyebrows, his hat and what he holds say what he thinks of your kill.',
    create(ctx) {
      const E = ctx.el, D = Math.PI / 180;
      const live = new Set();

      // ---- the plate ----
      function fill(sign, n) {
        const mood = M[n.mood] ? n.mood : 'calibrating', b = sign.firstChild;
        sign.dataset.mood = mood; sign.dataset.kind = n.kind;
        b.textContent = '';
        const ach = n.kind === 'achievement';
        if (ach) b.append(E('div', 'dwarf-tag', n.label));
        b.append(E('div', 'dwarf-title', n.title));
        if (n.kind === 'kill') b.append(E('div', 'dwarf-rule'));
        const fig = E('div', 'dwarf-fig', n.big);
        if (n.unit) fig.append(E('span', 'dwarf-unit', n.unit));
        b.append(fig);
        if (n.kind === 'kill') {
          const r = E('div', 'dwarf-rate');
          r.append(ctx.svg(studs(RANK[mood] || 0, mood === 'pvp')));
          r.append(n.label ? E('span', 'dwarf-word', n.label) : E('span', 'dwarf-q', '?'));
          b.append(r);
        } else if (!ach && n.label) b.append(E('div', 'dwarf-tag', n.label));
        b.append(E('div', 'dwarf-more', n.more));
        return mood;
      }

      function build(n) {
        const u = ++uid, root = ctx.svg(rig(u)), q = (s) => root.querySelector(s), qa = (s) => [...root.querySelectorAll(s)];
        const sign = E('div', 'dwarf-sign');
        sign.append(E('div', 'dwarf-plate'), ctx.svg(RINGB(88 - 64)), ctx.svg(RINGB(88 + 64)));
        root.append(sign);
        const mood = fill(sign, n);
        root.dataset.mood = mood; root.dataset.sky = ctx.skyMode();
        root.style.setProperty('--k', 1 / ctx.pace());
        if (ctx.reduced) root.classList.add('dwarf-rm', 'dwarf-at');
        return {
          root, sign, mood, plate: sign.firstChild, env: q('.dwarf-env'), car: q('.dwarf-car'), bd: q('.dwarf-bd'), lan: q('.dwarf-lan'), anv: q('.dwarf-anv'),
          bans: qa('.dwarf-ban'), fl: q('.dwarf-fl'), fm: q('.dwarf-fm'), glow: q('.dwarf-glow'), puff: q('.dwarf-puff'), ca: q(`#dwa${u}`), cz: q(`#dwz${u}`),
          nod: q('.dwarf-nod'), look: q('.dwarf-look'), lids: qa('.dwarf-bl'), pgs: qa('.dwarf-pg'), brows: [q('.dwarf-bL'), q('.dwarf-bR')], mos: qa('.dwarf-mo'),
          helm: q('.dwarf-helm'), hat: q('.dwarf-hat'), ty: q('.dwarf-ty'), ng: q('.dwarf-ng'), axr: q('.dwarf-axr'), conf: q('.dwarf-conf'), hornr: q('.dwarf-hornr'),
        };
      }

      // ---- the small life in him: blinks, glances, a brow, a finger ----
      function liven(R) {
        let dead = false, gaze = [0, 0], ga = [], la = null;
        const ts = new Set(), rnd = Math.random;
        const later = (fn, ms) => { const t = setTimeout(() => { ts.delete(t); if (!dead) fn(); }, ms); ts.add(t); };
        const bob = (el, to, ms, o = {}) => el && el.animate([{ transform: 'none' }, { transform: to, offset: o.at ?? .4 }, { transform: 'none' }], { duration: ms, easing: 'ease-in-out', composite: 'add', ...o });
        const blink = () => {
          const slow = R.mood === 'meh' || R.mood === 'death';
          const go = () => R.lids.forEach((l) => l.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(11px)', offset: .42 }, { transform: 'translateY(0)' }], { duration: slow ? 700 : 150, easing: 'ease-in-out' }));
          go(); if (!slow && rnd() < .25) later(go, 250);
          later(blink, (slow ? 2600 : 1700) + rnd() * 3800);
        };
        const lookAt = (x, y, ms = 170) => {
          const from = gaze; gaze = [x, y];
          const old = ga, oldL = la;
          ga = R.pgs.map((p) => p.animate([{ transform: `translate(${from[0]}px,${from[1]}px)` }, { transform: `translate(${x}px,${y}px)` }], { duration: ms, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'forwards' }));
          la = R.look.animate([{ transform: `translate(${from[0] * .5}px,${from[1] * .3}px) rotate(${from[0] * .5}deg)` }, { transform: `translate(${x * .5}px,${y * .3}px) rotate(${x * .5}deg)` }], { duration: 520, delay: 50, easing: 'cubic-bezier(.3,.6,.3,1)', fill: 'both' });
          old.forEach((a) => a.cancel()); if (oldL) oldL.cancel();
        };
        const glance = () => {
          if (R.mood !== 'death' && R.root.classList.contains('dwarf-at') && !R.root.classList.contains('dwarf-off')) {
            const r = rnd(), p = PROP[R.mood] || [0, 0];
            if (r < .3) lookAt(rnd() - .5, 2.5);            // down at the plate
            else if (r < .52) lookAt(0, 0);                  // at you
            else if (r < .64) lookAt(rnd() * 1.6 - .8, -2.5); // up at the envelope
            else if (r < .84) lookAt(p[0], p[1]);            // at what he holds
            else lookAt(rnd() < .5 ? -3.1 : 3.1, -.3);       // out over the land
          }
          later(glance, 1100 + rnd() * 2600);
        };
        const brow = () => {
          const i = rnd() < .5 ? 0 : 1;
          bob(R.brows[i], 'translateY(-2.6px)', 340);
          if (rnd() < .3) bob(R.brows[1 - i], 'translateY(-2px)', 340, { delay: 60 });
          if (rnd() < .35) R.mos.forEach((m) => bob(m, 'rotate(3deg)', 300, { delay: 120 }));
          later(brow, 2400 + rnd() * 3600);
        };
        const tap = () => {
          const f = [...R.root.querySelectorAll(R.mood && M[R.mood].hrt === 0 ? '.dwarf-hL .dwarf-fg' : rnd() < .5 ? '.dwarf-hL .dwarf-fg' : '.dwarf-hR .dwarf-fg')];
          if (rnd() < .4) f.forEach((e, i) => bob(e, 'translateY(-3.5px)', 230, { delay: i * 70 }));
          else bob(f[(rnd() * f.length) | 0], 'translateY(-3px)', 260);
          later(tap, 1800 + rnd() * 3200);
        };
        if (!ctx.reduced) { lookAt(0, -2.4, 1);
          later(blink, 500 + rnd() * 1800); later(glance, 900 + rnd() * 1200); later(brow, 1500 + rnd() * 2500); later(tap, 1200 + rnd() * 2500); }
        const once = (el, kf, o) => !ctx.reduced && el && el.animate(kf, o);
        // one small piece of business on arriving, by mood
        const biz = (mood) => {
          if (ctx.reduced) return;
          const d = 1 / ctx.pace(), T = (s) => ({ transform: s });
          const nod = (kf, ms, delay = 0, o = {}) => R.nod.animate(kf, { duration: ms * d, delay: delay * d, easing: 'ease-in-out', ...o });
          if (mood === 'calibrating') { lookAt(3, -1); once(R.ng, [T('translateY(0)'), { ...T('translateY(-13px) rotate(40deg)'), offset: .25, easing: 'ease-in' }, { ...T('translateY(0) rotate(90deg)'), offset: .5 }, { ...T('translateY(-7px) rotate(130deg)'), offset: .72, easing: 'ease-in' }, T('translateY(0) rotate(180deg)')], { duration: 900 * d, delay: 250 * d, easing: 'ease-out' }); nod([T('none'), T('rotate(2.5deg) translateY(1px)'), T('none')], 700, 900); }
          if (mood === 'poor') { lookAt(.4, -1.7, 400); nod([T('none'), { ...T('translateY(-2px)'), offset: .3 }, { ...T('translateY(4px)'), offset: .7 }, T('translateY(2px)')], 1400, 350, { fill: 'forwards' }); }
          if (mood === 'meh') { lookAt(3, -1.6, 300); nod([T('none'), { ...T('translateY(-1.5px) rotate(-1deg)'), offset: .35 }, { ...T('translateY(3px) rotate(1.5deg)'), offset: .75 }, T('translateY(1.5px) rotate(1deg)')], 1500, 500, { fill: 'forwards' }); }
          if (mood === 'good') { lookAt(0, 2.4); nod([T('none'), { ...T('translateY(6px) rotate(1.500deg)'), offset: .35 }, { ...T('translateY(-1px)'), offset: .7 }, T('none')], 480, 450); later(() => lookAt(0, 0), 1000 * d); }
          if (mood === 'great') { lookAt(0, 2.4); later(() => lookAt(0, 0), 600 * d); once(R.ty, [T('translateY(-9px)'), { ...T('translateY(-21px) rotate(-9deg)'), offset: .4 }, { ...T('translateY(-19px) rotate(-7deg)'), offset: .7 }, T('translateY(-9px)')], { duration: 950 * d, delay: 300 * d, easing: 'cubic-bezier(.3,1.2,.5,1)' }); nod([T('none'), { ...T('translateY(-3px) rotate(-2deg)'), offset: .4 }, T('none')], 900, 300); }
          if (mood === 'superb') {
            R.root.classList.add('dwarf-blow'); lookAt(-2, -1.5);
            nod([T('none'), { ...T('translateY(-4px) rotate(-3.500deg)'), offset: .2 }, { ...T('translateY(-3px) rotate(-3deg) scale(1.03,1)'), offset: .5 }, { ...T('translateY(-4px) rotate(-3.500deg)'), offset: .8 }, T('none')], 1250, 100);
            once(R.hat, [T('rotate(0)'), T('rotate(-9deg)'), T('rotate(7deg)'), T('rotate(-4deg)'), T('rotate(0)')], { duration: 900 * d, delay: 250 * d, composite: 'add' });
            later(() => { R.root.classList.remove('dwarf-blow'); lookAt(0, 0); once(R.ty, [T('none'), { ...T('translateY(-10px) rotate(-8deg)'), offset: .4 }, T('none')], { duration: 800 * d, delay: 200 * d, easing: 'ease-in-out' }); }, 1350 * d);
          }
          if (mood === 'pvp') { lookAt(0, 0); once(R.axr, [T('rotate(-17deg)'), { ...T('rotate(-25deg) translateY(-7px)'), offset: .35 }, { ...T('rotate(-14deg) translateY(2px)'), offset: .7 }, T('rotate(-17deg)')], { duration: 700 * d, delay: 250 * d, easing: 'ease-in-out' }); nod([T('none'), { ...T('translateY(-4px) rotate(-1.500deg)'), offset: .3 }, { ...T('translateY(2px)'), offset: .6 }, T('none')], 650, 250); }
          if (mood === 'levelup') {
            lookAt(-1.5, -2.2);
            const a = 'translate(-80px,-32px) rotate(-14deg)';
            once(R.helm, [T(a), { ...T('translate(-80px,-46px) rotate(-19deg)'), offset: .25 }, { ...T(a), offset: .5 }, { ...T('translate(-80px,-42px) rotate(-17deg)'), offset: .75 }, T(a)], { duration: 900 * d, delay: 620 * d, easing: 'ease-in-out' });
            nod([T('none'), { ...T('translateY(-3px)'), offset: .4 }, T('none')], 800, 500);
            later(() => { const c = ctx.svg(`<div class="dwarf-z dwarf-conf dwarf-once" style="top:${HG - 76}px">${bits(22, ['#ffd98a', '#ffb84a', '#fff3c4'])}</div>`); R.root.append(c); later(() => c.remove(), 2300); lookAt(0, 0); }, 700 * d);
          }
          if (mood === 'death') nod([T('none'), T('translateY(3px) rotate(-2.500deg)')], 1100, 500, { fill: 'forwards' });
          if (mood === 'achievement') { lookAt(0, 0); nod([T('none'), { ...T('translateY(-4px) scale(1.02)'), offset: .4 }, T('translateY(-1px)')], 900, 250, { fill: 'forwards' }); }
        };
        const calm = () => R.nod.getAnimations().forEach((a) => a.cancel());
        return { biz, calm, lookAt, later, stop() { dead = true; ts.forEach(clearTimeout); ts.clear(); } };
      }

      // ---- every frame: lean, the lagging car, the plate on its two chains, the flame ----
      function animator(R, life, quiet) {
        let last = 0, sx = 0, sv = 0, ph = quiet ? 'read' : '', pump = null;
        const go = { night: .9, dusk: .65, day: .25, overcast: .38 }[ctx.skyMode()] || .5, AR = BY - HG;
        const pt = (x, y, c, s) => `${(CX + x * c - (y - HG) * s).toFixed(1)},${(HG + x * s + (y - HG) * c).toFixed(1)}`;
        return (f) => {
          const now = performance.now(), dt = last ? Math.min(.05, (now - last) / 1000) : .016; last = now;
          const ea = f.lean * .8, phi = f.swing, c = Math.cos(phi * D), s = Math.sin(phi * D), ce = Math.cos(ea * D), se = Math.sin(ea * D);
          const bx = -AR * s;
          // the plate: a heavy thing on two chains, following the bucket late
          sv += ((bx + f.swing * 1.5 - f.lean * 1.3 - sx) * 20 - sv * 3) * dt; sx += sv * dt;
          const d = Math.max(-13, Math.min(13, sx - bx)), th = Math.asin(d / LC), dy = -LC * (1 - Math.cos(th)) + AR * (c - 1), X = bx + d;
          R.env.style.transform = `rotate(${ea.toFixed(2)}deg)`;
          R.car.style.transform = `rotate(${phi.toFixed(2)}deg)`;
          R.sign.style.transform = `translate(${X.toFixed(1)}px,${dy.toFixed(1)}px)`;
          R.ca.setAttribute('d', `M${pt(-66, 82.5, ce, se)}L${pt(-58, RY - 2, c, s)}M${pt(66, 82.5, ce, se)}L${pt(58, RY - 2, c, s)}M${pt(-44, 93.5, ce, se)}L${pt(-51, RY - 2, c, s)}M${pt(44, 93.5, ce, se)}L${pt(51, RY - 2, c, s)}`);
          R.cz.setAttribute('d', `M${pt(-50, BY + 2, c, s)}L${(CX - 64 + X).toFixed(1)},${(SY + dy).toFixed(1)}M${pt(50, BY + 2, c, s)}L${(CX + 64 + X).toFixed(1)},${(SY + dy).toFixed(1)}`);
          const hang = -phi + d * 1.7;
          R.bd.style.transform = `rotate(${(hang * .8).toFixed(2)}deg)`;
          R.lan.style.transform = `rotate(${(hang * 1.3 + Math.sin(now * .0021) * 1.6).toFixed(2)}deg)`;
          R.anv.style.transform = `rotate(${(hang + Math.sin(now * .0017 + 2)).toFixed(2)}deg)`;
          const bn = -ea + d * 1.6 - f.lean * 2.2;
          for (let i = 0; i < R.bans.length; i++) R.bans[i].style.transform = `rotate(${(bn + Math.sin(now * .0031 + i * 1.7) * 2.6).toFixed(2)}deg)`;
          const b = f.burn;
          R.fl.style.transform = `scale(${(.74 + .4 * b).toFixed(2)},${(.42 + .72 * b).toFixed(2)})`;
          R.glow.style.opacity = ((.25 + .75 * b) * go).toFixed(2);
          if ((b > .45) !== pump) { pump = b > .45; R.root.classList.toggle('dwarf-pump', pump); }
          if (f.phase !== ph) {
            ph = f.phase;
            if (ph === 'read') { R.root.classList.add('dwarf-at'); life.biz(R.mood); }
            if (ph === 'leave' && !ctx.reduced) {
              R.root.classList.add('dwarf-off'); if (R.mood !== 'death') life.lookAt(.5, -2.3, 260);
              R.fm.animate([{ transform: 'scale(var(--fl))' }, { transform: 'scale(1.5,2.3)', offset: .3 }, { transform: 'scale(var(--fl))' }], { duration: 900, easing: 'ease-out' });
              R.puff.animate([{ opacity: 0, transform: 'translateY(0) scale(.4)' }, { opacity: .8, offset: .25 }, { opacity: 0, transform: 'translate(8px,-34px) scale(2.2)' }], { duration: 1500, delay: 250, easing: 'ease-out' });
            }
          }
        };
      }
      const REST = { lean: 0, swing: 0, phase: 'read', t: 0, vy: 0, burn: .15 };

      return {
        show(n) {
          const R = build(n), life = liven(R);
          R.root.style.visibility = 'hidden'; ctx.front.append(R.root);
          const h = SY + R.sign.offsetHeight + (n.kind === 'kill' ? 20 : 4);
          R.root.remove(); R.root.style.visibility = '';
          const fl = ctx.fly(R.root, { w: W, h, frame: animator(R, life, false) });
          const rec = { fl, life }; live.add(rec);
          fl.gone.then(() => { life.stop(); live.delete(rec); });
          return {
            update(nn) {
              if (!R.root.isConnected) return;
              const was = R.mood;
              R.mood = fill(R.sign, nn); R.root.dataset.mood = R.mood;
              fl.extend(700);
              if (ctx.reduced) return;
              // struck like a bell
              R.plate.animate([0, 2.4, -2, 1.5, -1.1, .7, -.4, 0].map((x, i) => ({ transform: `translate(${x}px,${i === 1 ? 1.5 : 0}px) rotate(${x * .25}deg)` })), { duration: 430, easing: 'linear' });
              life.lookAt(0, 2.5, 140);
              if (was !== R.mood && R.root.classList.contains('dwarf-at')) { life.calm(); life.biz(R.mood); }
            },
          };
        },
        still(n) {
          const R = build(n), life = liven(R), fr = animator(R, life, true);
          R.root.classList.add('dwarf-at', 'dwarf-still');
          fr(REST);
          if (!ctx.reduced) {
            const t0 = performance.now(), ph = Math.random() * 6;
            let seen = false;
            const loop = (now) => {
              if (R.root.isConnected) seen = true; else if (seen || now - t0 > 3000) return life.stop();
              const t = now - t0;
              fr({ lean: Math.sin(t * .0007 + ph) * .9, swing: Math.sin(t * .0011 + ph) * 1.5 + Math.sin(t * .0023) * .5, phase: 'read', t, vy: 0, burn: .15 + .05 * Math.sin(t * .003) });
              requestAnimationFrame(loop);
            };
            requestAnimationFrame(loop);
          }
          return R.root;
        },
        clear() {
          for (const r of [...live]) { r.life.stop(); r.fl.end(); }
          live.clear();
        },
      };
    },
  });
})();
