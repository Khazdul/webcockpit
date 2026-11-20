// Skin 5, "The Chronicle": each event is an entry on a small leaf of vellum,
// written while you watch and then carried off by the wind. No balloon.
(() => {
  const ID = 'chronicle';
  const uri = (s) => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;

  // Vellum grain: brown cloudy stains plus a fine tooth, rasterised once as an image.
  const GRAIN = uri("<svg xmlns='http://www.w3.org/2000/svg' width='260' height='340'><filter id='a' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.011 .017' numOctaves='3' seed='11'/><feColorMatrix values='0 0 0 0 .47 0 0 0 0 .3 0 0 0 0 .1 1.25 0 0 0 -.5'/></filter><filter id='b' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' seed='3'/><feColorMatrix values='0 0 0 0 .32 0 0 0 0 .2 0 0 0 0 .08 1.1 0 0 0 -.4'/></filter><rect width='100%' height='100%' filter='url(#a)'/><rect width='100%' height='100%' filter='url(#b)'/></svg>");
  // A bar border of ivy: a stem with red and blue leaves and gold bezants.
  const VINE = uri("<svg xmlns='http://www.w3.org/2000/svg' width='14' height='32' viewBox='0 0 14 32'><path d='M7 0C12.5 8 1.5 8 7 16C12.5 24 1.5 24 7 32' fill='none' stroke='%23c79a34' stroke-width='1.7'/><path d='M7 0C12.5 8 1.5 8 7 16C12.5 24 1.5 24 7 32' fill='none' stroke='%235a3c0c' stroke-width='.5'/><path d='M9.4 4.6c2.6-2.4 4.6-.6 3.6 1.8-.9 2.2-3 1.6-3.6-1.8Z' fill='%23a3261a' stroke='%23531008' stroke-width='.4'/><path d='M4.6 20.6c-2.6-2.4-4.6-.6-3.6 1.8.9 2.2 3 1.6 3.6-1.8Z' fill='%2327458a' stroke='%23122552' stroke-width='.4'/><circle cx='2.6' cy='8.6' r='1.7' fill='%23e3b548' stroke='%235c3b08' stroke-width='.5'/><circle cx='11.4' cy='24.6' r='1.7' fill='%23e3b548' stroke='%235c3b08' stroke-width='.5'/></svg>").replace(/%2523/g, '%23');

  const GOLD = 'linear-gradient(140deg,#fff2b8 0%,#e9c25a 22%,#b8811f 46%,#f4d97e 62%,#a06f17 82%,#e7c15c 100%)';

  Harness.css(ID, `
.chronicle-leaf{position:absolute;left:0;bottom:0;width:214px;will-change:transform,opacity;pointer-events:none}
.chronicle-leaf.chronicle-still{position:relative;left:auto;bottom:auto}
.chronicle-leaf.chronicle-m-poor{width:184px}
.chronicle-leaf.chronicle-pended{padding-bottom:44px}
.chronicle-tilt{position:relative;transform:rotate(var(--tilt,0deg));filter:drop-shadow(0 1px 1px rgba(0,0,0,.5)) drop-shadow(0 7px 9px rgba(0,0,0,.42))}
.chronicle-s-night .chronicle-tilt{filter:drop-shadow(0 0 1px rgba(255,220,160,.25)) drop-shadow(0 8px 12px rgba(0,0,0,.7))}
.chronicle-page{position:relative;box-sizing:border-box;padding:12px 16px 14px 19px;color:var(--ink);--ink:#2b1c0f;--rub:#a3261a;--blue:#27458a;
 font:16.5px/20px "IM Fell English",Georgia,serif;font-kerning:normal;
 background:${GRAIN} var(--gx,0) var(--gy,0),
  radial-gradient(70px 46px at 86% 82%,rgba(140,96,40,.22),transparent 72%),
  radial-gradient(80px 60px at 16% 26%,rgba(255,250,228,.55),transparent 72%),
  radial-gradient(130% 105% at 40% 34%,#f4e8c8 0%,#ecdcb2 40%,#dcc590 74%,#bd9e66 100%);
 box-shadow:inset 0 0 16px rgba(118,78,26,.5),inset 0 0 3px rgba(84,50,12,.55)}
.chronicle-page::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(115deg,rgba(255,255,255,.16),transparent 38%,rgba(70,40,10,.12))}
.chronicle-s-night .chronicle-page::after{background:linear-gradient(115deg,rgba(40,44,90,.10),rgba(18,20,52,.26))}
.chronicle-s-dusk .chronicle-page::after{background:linear-gradient(115deg,rgba(255,170,110,.12),rgba(60,30,60,.2))}
.chronicle-s-overcast .chronicle-page::after{background:linear-gradient(115deg,rgba(120,130,140,.10),rgba(50,56,64,.18))}
.chronicle-rule{position:absolute;inset:0;pointer-events:none;background:
 linear-gradient(90deg,transparent 12px,rgba(140,70,50,.26) 12px,rgba(140,70,50,.26) 12.7px,transparent 12.7px),
 linear-gradient(270deg,transparent 10px,rgba(140,70,50,.2) 10px,rgba(140,70,50,.2) 10.7px,transparent 10.7px),
 radial-gradient(circle at 50% 50%,rgba(50,28,10,.55) .7px,transparent 1.1px) right 3px top 24px/5px 20px repeat-y,
 repeating-linear-gradient(180deg,transparent 0 19.3px,rgba(120,74,40,.17) 19.3px 20px) 0 9px}
.chronicle-vine{display:none;position:absolute;top:7px;bottom:7px;width:14px;background:${VINE} repeat-y 0 0}
.chronicle-vine.chronicle-l{left:2px}.chronicle-vine.chronicle-r{right:2px;transform:scaleX(-1)}
.chronicle-m-superb .chronicle-vine.chronicle-l,.chronicle-m-levelup .chronicle-vine{display:block}
.chronicle-m-superb .chronicle-page{padding-left:25px}
.chronicle-m-superb .chronicle-rule,.chronicle-m-levelup .chronicle-rule{background-position:9px 0,0 0,right 3px top 24px,0 9px}
.chronicle-m-superb .chronicle-page,.chronicle-m-levelup .chronicle-page{background:${GRAIN} var(--gx,0) var(--gy,0),radial-gradient(90px 60px at 20% 24%,rgba(255,252,236,.6),transparent 72%),radial-gradient(130% 105% at 42% 36%,#f8eed2 0%,#f0e2bc 44%,#e0cb98 78%,#c4a66e 100%)}
.chronicle-w{display:inline-block;white-space:pre}
.chronicle-rub{font:12.5px/20px "IM Fell English SC","IM Fell English",serif;letter-spacing:.09em;color:var(--rub);white-space:nowrap}
.chronicle-rub i{font-style:normal;color:var(--blue);margin-right:5px;letter-spacing:0}
.chronicle-body::after{content:"";display:block;clear:both}
.chronicle-versal{float:left;font:700 60px/60px "Cinzel",serif;height:54px;margin:-3px 5px 2px -3px;color:#3a2614}
.chronicle-versal[hidden]{display:none}
.chronicle-vl{display:block}
.chronicle-title{overflow-wrap:anywhere}
.chronicle-fig{line-height:40px;white-space:nowrap}
.chronicle-big{font-size:31px;position:relative;top:5px;letter-spacing:.01em}
.chronicle-unit{font-style:italic;font-size:16px;margin-left:5px;position:relative;top:5px;color:#4d361f}
.chronicle-struck{font-size:14px;color:#4a341f}
.chronicle-struck:empty,.chronicle-more:empty,.chronicle-label:empty,.chronicle-title:empty,.chronicle-fig:empty{display:none}
.chronicle-struck s{position:relative;text-decoration:none;margin-right:7px;display:inline-block}
.chronicle-struck s::after{content:"";position:absolute;left:-3px;right:-3px;top:52%;height:1.3px;background:#1c1009;border-radius:1px;transform:rotate(-5deg);transform-origin:0 50%;animation:chronicle-strike .32s ease-out backwards}
@keyframes chronicle-strike{from{transform:rotate(-5deg) scaleX(0)}}
.chronicle-more{clear:both;font-style:italic;font-size:14px;color:#3d2a17}
.chronicle-more b{font:normal 12.5px "IM Fell English SC",serif;color:var(--rub);letter-spacing:.06em;margin-right:5px}
.chronicle-foot{clear:both;display:flex;align-items:flex-end;gap:4px;min-height:40px}
.chronicle-say{flex:1;min-width:0}
.chronicle-label{font:14px/20px "IM Fell English SC","IM Fell English",serif;letter-spacing:.1em;color:var(--rub)}
.chronicle-label::before{content:"";display:inline-block;width:5px;height:5px;margin-right:6px;background:currentColor;transform:rotate(45deg) translateY(-2px)}
.chronicle-verdict{font-style:italic;font-size:14px;color:#4a3420}
.chronicle-droll{flex:none;line-height:0;margin:0 -4px -3px 0}
.chronicle-droll:empty{display:none}
.chronicle-ink{color:#4b3019;overflow:visible}
.chronicle-ink path,.chronicle-ink circle{fill:none;stroke:currentColor;stroke-width:1.05;stroke-linecap:round;stroke-linejoin:round}
.chronicle-ink .chronicle-f{fill:currentColor;stroke:none}
.chronicle-ink .chronicle-g{fill:#e0b244}
.chronicle-ink .chronicle-h{stroke-width:.6}
.chronicle-flo{display:none;position:absolute;left:0;top:28px;overflow:visible}
.chronicle-flo path{fill:none;stroke-width:.9;stroke-linecap:round}
.chronicle-m-great .chronicle-flo,.chronicle-m-achievement .chronicle-flo{display:block}
.chronicle-blot{position:absolute;overflow:visible;pointer-events:none}
.chronicle-quill{position:absolute;left:0;top:0;width:0;height:0;opacity:0;pointer-events:none;z-index:3}
.chronicle-quill svg{position:absolute;left:-2px;top:-30px;transform-origin:2px 30px;animation:chronicle-scratch .23s ease-in-out infinite alternate}
@keyframes chronicle-scratch{from{transform:rotate(-5deg)}to{transform:rotate(6deg) translateY(-1.2px)}}
.chronicle-pend{position:absolute;left:28px;top:calc(100% - 9px);line-height:0}
.chronicle-m-superb .chronicle-pend{left:auto;right:64px}

/* moods */
.chronicle-m-poor .chronicle-page{padding:10px 13px 11px 16px;--ink:#5b4024;--rub:#8d3a26;font-size:14.5px;
 background:${GRAIN} var(--gx,0) var(--gy,0),radial-gradient(60px 40px at 24% 80%,rgba(120,84,40,.3),transparent 70%),radial-gradient(130% 105% at 46% 40%,#e6d6ae 0%,#d9c493 44%,#c4a771 78%,#a18250 100%)}
.chronicle-m-poor .chronicle-rule{background-position:0 0,0 0,right 3px top 22px,0 7px}
.chronicle-m-poor .chronicle-big{font-size:25px;letter-spacing:-.01em;top:2px}
.chronicle-m-poor .chronicle-unit{top:2px}
.chronicle-m-poor .chronicle-fig{line-height:30px}
.chronicle-fig[hidden]{display:none}
.chronicle-m-poor .chronicle-label,.chronicle-m-poor .chronicle-verdict{font-size:13px}
.chronicle-m-poor .chronicle-verdict{color:#644a2c}
.chronicle-m-meh .chronicle-versal,.chronicle-m-calibrating .chronicle-versal{font-weight:500}
.chronicle-m-good .chronicle-versal,.chronicle-m-great .chronicle-versal{color:#a82a1b;text-shadow:0 0 .5px #6d140a}
.chronicle-m-achievement .chronicle-versal{color:#27458a;text-shadow:0 0 .5px #122552}
.chronicle-m-pvp .chronicle-page{--ink:#b02a12;--rub:#7c1309}
.chronicle-m-pvp .chronicle-title{font-size:17px}
.chronicle-m-pvp .chronicle-unit,.chronicle-m-pvp .chronicle-verdict{color:#8a2714}
.chronicle-m-pvp .chronicle-ink{color:#a32712}
.chronicle-m-pvp .chronicle-versal{color:#b02a12}
.chronicle-gilt{position:relative;overflow:hidden;background:
 repeating-linear-gradient(45deg,rgba(255,255,255,.16) 0 .8px,transparent .8px 6px),
 repeating-linear-gradient(-45deg,rgba(255,255,255,.16) 0 .8px,transparent .8px 6px),
 radial-gradient(circle at 50% 50%,rgba(255,226,140,.85) .7px,transparent 1.1px) 0 0/8.49px 8.49px,
 radial-gradient(circle at 50% 45%,#2a4a96,#162a60);
 border:2.2px solid #c8982f;border-image:${GOLD} 1;box-shadow:0 0 0 .8px #3a2408,inset 0 0 0 .8px #3a2408,inset 0 0 6px rgba(0,0,0,.45)}
.chronicle-gilt::after{content:"";position:absolute;top:-20%;bottom:-20%;left:0;width:45%;background:linear-gradient(100deg,transparent,rgba(255,255,240,.75),transparent);transform:translateX(-140%) skewX(-18deg);animation:chronicle-shine 4.6s ease-in-out 1.2s infinite}
@keyframes chronicle-shine{0%{transform:translateX(-140%) skewX(-18deg)}26%,100%{transform:translateX(330%) skewX(-18deg)}}
.chronicle-gold{background:linear-gradient(172deg,#fffbe0 8%,#f6da7c 38%,#d9a436 58%,#f8e59a 80%,#c9942c 100%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 .8px 0 #2a1804) drop-shadow(0 0 .7px #2a1804) drop-shadow(0 1.5px 1.5px rgba(0,0,0,.5))}
.chronicle-m-superb .chronicle-versal{width:48px;height:48px;line-height:46px;font-size:36px;text-align:center;margin:6px 9px 4px -1px;box-sizing:border-box}
.chronicle-m-superb .chronicle-label{color:#8a5a0c}

/* level up */
.chronicle-k-levelup .chronicle-page{padding:12px 24px 16px;text-align:center}
.chronicle-k-levelup .chronicle-fig{line-height:20px;white-space:normal}
.chronicle-k-levelup .chronicle-big{display:block;font:15px/20px "IM Fell English SC",serif;letter-spacing:.3em;top:0;margin-left:.3em}
.chronicle-panel.chronicle-gilt{background:repeating-linear-gradient(45deg,rgba(255,220,150,.16) 0 .8px,transparent .8px 6px),repeating-linear-gradient(-45deg,rgba(255,220,150,.16) 0 .8px,transparent .8px 6px),radial-gradient(circle at 50% 50%,rgba(255,226,140,.8) .7px,transparent 1.1px) 0 0/8.49px 8.49px,radial-gradient(circle at 50% 45%,#8f1f18,#4e0c0a)}
.chronicle-panel{display:inline-block;margin:6px 0 8px;padding:0 15px 0 17px;height:66px;font:700 50px/64px "Cinzel",serif;letter-spacing:.02em}
.chronicle-bang{font-size:30px;margin-left:3px}
.chronicle-k-levelup .chronicle-droll{display:block;margin:2px 0 -2px}
.chronicle-k-levelup .chronicle-foot{display:block;min-height:0}

/* death */
.chronicle-k-death .chronicle-page{padding:17px 20px 18px 22px;--ink:#130d08;--rub:#7e1a12;
 background:${GRAIN} var(--gx,0) var(--gy,0),radial-gradient(130% 105% at 44% 36%,#ebe3cc 0%,#e0d5b6 44%,#cbbb93 78%,#a8946a 100%);
 box-shadow:inset 0 0 0 5.5px #17110c,inset 0 0 0 7px rgba(235,225,200,.9),inset 0 0 0 7.8px #17110c,inset 0 0 18px 6px rgba(70,50,20,.4)}
.chronicle-k-death .chronicle-rule{inset:9px;background-position:6px 0,0 0,right 3px top 20px,0 8px}
.chronicle-k-death .chronicle-fig{white-space:normal;margin-top:4px}
.chronicle-k-death .chronicle-big{font:29px/40px "IM Fell English SC",serif;letter-spacing:.09em;top:4px}
.chronicle-k-death .chronicle-blot{right:26px;top:66px}
.chronicle-k-death .chronicle-foot{margin-top:14px}
.chronicle-k-death .chronicle-ink{color:#1d140c}

/* achievement */
.chronicle-k-achievement .chronicle-title{font-style:italic;font-size:15.5px}
.chronicle-k-achievement .chronicle-label{font-size:13px}
.chronicle-k-achievement .chronicle-foot{margin-top:4px}
@media (prefers-reduced-motion:reduce){.chronicle-gilt::after,.chronicle-quill svg,.chronicle-struck s::after{animation:none}}
`);

  // ---- drolleries (thin brown ink, our own markup, no game text) ----
  const ink = (w, h, vb, body) => `<svg class="chronicle-ink" xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}">${body}</svg>`;
  const GRASS = (x) => `<path d="M${x} 0l-1.6-4.6M${x + 1.4} 0l.5-5.6M${x + 2.8} 0l2.3-3.9"/>`;
  const laurel = () => {
    let s = '';
    for (const sd of [-1, 1]) {
      const P = [[24, 42], [24 + sd * 15, 39], [24 + sd * 20, 24], [24 + sd * 10, 6]];
      const at = (t, k) => { const u = 1 - t; return u * u * u * P[0][k] + 3 * u * u * t * P[1][k] + 3 * u * t * t * P[2][k] + t * t * t * P[3][k]; };
      s += `<path d="M${P[0]}C${P[1]} ${P[2]} ${P[3]}"/>`;
      for (let i = 1; i <= 7; i++) {
        const t = i / 7.4, x = at(t, 0), y = at(t, 1);
        const a = Math.atan2(at(t + 0.02, 1) - y, at(t + 0.02, 0) - x) * 180 / Math.PI;
        for (const o of [-34, 34]) s += `<path transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(a + o * sd).toFixed(0)})" d="M0 0C2.4-2.5 6-2.4 8.4 0C6 2.2 2.4 2.3 0 0Z"/>`;
      }
    }
    return ink(46, 44, '0 0 48 46', s + '<path d="M19.5 41.5q4.5 2.6 9 0M22 43l-3.4 3.4M26 43l3.4 3.4"/>');
  };
  const SWORD = '<path d="M22.6 33V9L24 4.5 25.4 9V33"/><path class="chronicle-h" d="M24 10V31"/><path d="M16.5 33H31.5V35.2H16.5Z"/><path d="M23 35.2V41.5H25V35.2M23 37.3h2M23 39.4h2"/><circle cx="24" cy="43.6" r="2.1"/>';
  const DROLL = {
    snail: () => ink(50, 36, '0 0 52 38',
      '<path d="M30 17.5c2-1.2 4.4.6 3.4 3.4-1.2 3.2-5.8 3.8-8.4 1.2-3.4-3.4-2.4-9.4 2-11.6 5.6-2.8 12.6.4 13.8 7.2.9 5.2-1.6 9.6-6 11.6"/>'
      + '<path class="chronicle-h" d="M27.5 12.4c-1.6 2-2 4.6-.9 7M35.6 11.6c1.8 2.6 2.4 5.6 1.6 8.8M40.4 20.4c-1.2 2.4-3 4.4-5.4 5.6"/>'
      + '<path d="M46 31.2c-5 1.6-25 1.8-32.4.4C10 30.9 7.4 28.4 7.2 25c-.2-2.8 1.8-4.6 4.2-4 2.6.7 3.6 3.6 5 6.2 1.2 2.2 3.6 3.2 6.6 3.2"/>'
      + '<path d="M9.4 21.2L6.2 13.6M12.4 21L12.8 13"/><circle class="chronicle-f" cx="6" cy="13" r="1.1"/><circle class="chronicle-f" cx="12.8" cy="12.4" r="1.1"/>'
      + '<path class="chronicle-h" d="M9 26.4q1.4.9 2.8.2"/><path d="M2 34.4H50"/><path class="chronicle-h" d="M40 36.4h7M30 36.6h5"/>'),
    arrow: () => ink(48, 38, '0 0 50 40',
      '<path d="M6 29.5L25 16.6"/><path d="M27.4 19.4L41.4 30.2"/><path class="chronicle-h" d="M25 16.6l1.2 2.6M25 16.6l2.8.2M27.4 19.4l-2.4-.2"/>'
      + '<path class="chronicle-f" d="M45.4 33.3L39 32.4 42.4 28Z"/>'
      + '<path d="M6 29.5l-4.4-1.9M8.6 27.7l-4.4-1.9M11.2 25.9l-4.4-1.9M13.8 24.1l-4.4-1.9M6 29.5l.2 4.8M8.6 27.7l.2 4.8M11.2 25.9l.2 4.8M13.8 24.1l.2 4.8"/>'
      + `<path d="M3 36.4H47"/><g transform="translate(20 36.4)">${GRASS(0)}</g><g transform="translate(33 36.4)">${GRASS(0)}</g>`),
    helm: (arrow) => ink(50, 42, '0 0 52 44',
      '<g transform="translate(22 25.6) rotate(-24)"><path d="M-11 0C-11-13-6.4-20.6 0-24 6.4-20.6 11-13 11 0"/><path d="M-12.6 0H12.6V3.6H-12.6Z"/><path d="M-1.1-23.4V0M1.1-23.4V0"/>'
      + '<path d="M-2.1 3.6V12Q0 14.6 2.1 12V3.6"/><path class="chronicle-h" d="M-6.8-16Q-5.2-8-5.4 0M6.8-16Q5.2-8 5.4 0M5.6-19l-1.6 3.6 2.6 1.8-1.4 3.4"/>'
      + '<circle class="chronicle-f" cx="-9" cy="1.8" r=".8"/><circle class="chronicle-f" cx="-4.6" cy="1.8" r=".8"/><circle class="chronicle-f" cx="4.6" cy="1.8" r=".8"/><circle class="chronicle-f" cx="9" cy="1.8" r=".8"/></g>'
      + `<path d="M2 40H50"/><g transform="translate(4 40)">${GRASS(0)}</g><g transform="translate(36 40)">${GRASS(0)}</g>`
      + (arrow ? '<path d="M45.6 40L43.4 13"/><path d="M43.4 13l-3.2 3.6M43.7 16.4l-3.2 3.6M44 19.8l-3.2 3.6M43.4 13l3.6 2.8M43.7 16.4l3.6 2.8M44 19.8l3.6 2.8"/>' : '')),
    hand: () => ink(54, 32, '0 0 58 34',
      '<path d="M45 7.4C39.6 5.4 34 5.6 29.6 7L8.6 10.2C5 10.8 5 15.2 8.6 15L27 14.8"/><path class="chronicle-h" d="M9.4 10.4c2 .4 3.2 1.8 3.4 4.2"/>'
      + '<path d="M38.6 9.4C34.4 9.8 30.2 11.6 27 14.8c-3.6.2-4 5-.2 5.2h4.4"/><path d="M28 20c-3.4.2-3.4 4.6.4 4.8h4.4"/><path d="M30 24.8c-2.8.4-2.6 4.2 1 4.2 5.2.2 9.8-.8 14-2.6"/>'
      + '<path d="M45 5L53.6 3.4V29.6L45 27.6Z"/><path class="chronicle-h" d="M47.6 5v22.4M50.6 4.4v24"/><circle class="chronicle-f" cx="49.1" cy="10" r=".8"/><circle class="chronicle-f" cx="49.1" cy="16.4" r=".8"/><circle class="chronicle-f" cx="49.1" cy="22.8" r=".8"/>'),
    blades: () => ink(46, 46, '0 0 48 48', `<g transform="rotate(40 24 25)">${SWORD}</g><g transform="rotate(-40 24 25)">${SWORD}</g>`),
    crown: () => ink(52, 36, '0 0 52 36',
      '<path class="chronicle-g" d="M9 24L6.4 9.4 16.6 18 26 5.4 35.4 18 45.6 9.4 43 24Z"/><path class="chronicle-g" d="M8.4 24H43.6V30.6H8.4Z"/>'
      + '<path d="M9 24L6.4 9.4 16.6 18 26 5.4 35.4 18 45.6 9.4 43 24"/><path d="M8.4 24H43.6V30.6H8.4Z"/>'
      + '<circle class="chronicle-g" cx="6.2" cy="7.4" r="2.1"/><circle class="chronicle-g" cx="26" cy="3.4" r="2.3"/><circle class="chronicle-g" cx="45.8" cy="7.4" r="2.1"/>'
      + '<path style="fill:#a3261a" d="M26 25.2l2.4 2.1-2.4 2.1-2.4-2.1Z"/><circle style="fill:#27458a" cx="15.6" cy="27.3" r="1.6"/><circle style="fill:#27458a" cx="36.4" cy="27.3" r="1.6"/>'
      + '<path class="chronicle-h" d="M12 33.6h28"/>'),
    glass: () => ink(34, 44, '0 0 36 48',
      '<path d="M5.4 3H30.6V6.4H5.4ZM5.4 41.6H30.6V45H5.4Z"/><path d="M8 6.4V41.6M28 6.4V41.6"/>'
      + '<path d="M11 6.4C11 15.6 16.2 20 17.2 24 16.2 28 11 32.4 11 41.6M25 6.4C25 15.6 19.8 20 18.8 24 19.8 28 25 32.4 25 41.6"/>'
      + '<path class="chronicle-f" d="M11.4 41.4C11.8 36.4 14.8 33.2 18 32 21.2 33.2 24.2 36.4 24.6 41.4Z"/><path class="chronicle-h" d="M12.4 9.6h11.2"/>'),
    laurel,
  };
  const DROLL_OF = { poor: 'snail', meh: 'arrow', calibrating: 'arrow', good: 'helm', great: 'helm2', superb: 'hand', pvp: 'blades', levelup: 'crown', death: 'glass', achievement: 'laurel' };
  const FLO = '<svg class="chronicle-flo" xmlns="http://www.w3.org/2000/svg" width="24" height="112" viewBox="0 0 24 112">'
    + '<path stroke="#27458a" d="M16 6C9 7 6.6 15 8.6 25 11 37 5.6 45 6.6 57 7.4 67 13 69 13 63 13 58.4 8.4 59 8.4 63.4"/>'
    + '<path stroke="#a3261a" d="M18 3C12.4.6 5.6 3.4 5.6 9.6 5.6 14.6 11 14.6 11 10.4"/>'
    + '<path stroke="#a3261a" d="M10.4 31C4 35 3 45 4.6 53M9.4 70C5 80 9 92 5.4 104c-.8 2.6-4 2-3-.6"/>'
    + '<path stroke="#27458a" d="M6.6 74C3.6 82 6 90 3.6 97M11.6 44c2.6-1 3.6 2 1.4 3"/>'
    + '<circle fill="#a3261a" cx="8.6" cy="67" r="1"/><circle fill="#27458a" cx="4.6" cy="107.6" r="1"/><circle fill="#a3261a" cx="13.6" cy="20" r=".9"/></svg>';
  const QUILL = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="30" viewBox="0 0 22 30"><path d="M2 30L9 17.4" stroke="#2d2014" stroke-width="1.2" stroke-linecap="round"/><path d="M9 17.4C7.4 10 11.6 2.6 20 .8 20.6 9 16.6 15.6 9 17.4Z" fill="#f2ead8" stroke="#5f4f3b" stroke-width=".6"/><path d="M9 17.4L18 3.4M11 12.6l3 .4M12.6 9l3.2.2" stroke="#8d7c64" stroke-width=".5" fill="none"/></svg>';

  const star = (cx, cy, R, r, n) => { let d = ''; for (let i = 0; i < n * 2; i++) { const a = Math.PI * i / n - Math.PI / 2, q = i % 2 ? r : R; d += (i ? 'L' : 'M') + (cx + Math.cos(a) * q).toFixed(1) + ' ' + (cy + Math.sin(a) * q).toFixed(1); } return d + 'Z'; };
  const blob = (rnd, cx, cy, R, n, wob) => {
    const p = []; for (let i = 0; i < n; i++) { const a = Math.PI * 2 * i / n, q = R * (1 - wob + rnd() * wob * 2); p.push([cx + Math.cos(a) * q, cy + Math.sin(a) * q]); }
    let d = ''; for (let i = 0; i < n; i++) { const a = p[i], b = p[(i + 1) % n], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; d += (i ? '' : `M${((p[n - 1][0] + a[0]) / 2).toFixed(1)} ${((p[n - 1][1] + a[1]) / 2).toFixed(1)}`) + `Q${a[0].toFixed(1)} ${a[1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`; }
    return d + 'Z';
  };
  const scallop = (cx, cy, R, n) => { let d = ''; for (let i = 0; i <= n; i++) { const a = Math.PI * 2 * i / n, am = a - Math.PI / n; const x = cx + Math.cos(a) * R * 0.93, y = cy + Math.sin(a) * R * 0.93; d += i ? `Q${(cx + Math.cos(am) * R * 1.09).toFixed(1)} ${(cy + Math.sin(am) * R * 1.09).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}` : `M${x.toFixed(1)} ${y.toFixed(1)}`; } return d + 'Z'; };
  // A pendant seal on two ribbons: gold for a superb kill, red wax for an achievement.
  const pendant = (gold, rnd) => {
    const c1 = gold ? '#a3261a' : '#27458a', c2 = gold ? '#7d1710' : '#a3261a';
    const body = gold
      ? `<path d="${scallop(21, 32, 14.5, 16)}" fill="url(#chronicle-gg)" stroke="#5c3b08" stroke-width=".7"/><circle cx="21" cy="32" r="10.6" fill="none" stroke="#7a520e" stroke-width=".7"/><circle cx="21" cy="32" r="9.8" fill="none" stroke="#fff3c4" stroke-width=".5" opacity=".7"/><path d="${star(21, 32, 8, 3.1, 8)}" fill="#c8962c" stroke="#6e470b" stroke-width=".6"/><path d="${star(20.6, 31.6, 7.4, 2.9, 8)}" fill="none" stroke="#fff3c4" stroke-width=".4" opacity=".65"/>`
      : `<path d="${blob(rnd, 21, 32, 14.6, 11, 0.09)}" fill="url(#chronicle-wx)" stroke="#4d0906" stroke-width=".6"/><circle cx="21" cy="32" r="9.8" fill="#9c1e17" stroke="#5a0c08" stroke-width=".9"/><circle cx="20.6" cy="31.6" r="9.8" fill="none" stroke="#f08a78" stroke-width=".5" opacity=".55"/><path d="${star(21, 32, 7.2, 2.8, 8)}" fill="#7e130e" stroke="#4d0906" stroke-width=".5"/><path d="${star(20.5, 31.5, 7.2, 2.8, 8)}" fill="none" stroke="#f39a88" stroke-width=".45" opacity=".6"/><ellipse cx="15" cy="24.4" rx="4.6" ry="2" transform="rotate(-38 15 24.4)" fill="#fff" opacity=".22"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="56" viewBox="0 0 42 56"><defs><radialGradient id="chronicle-gg" cx=".34" cy=".28" r=".85"><stop offset="0" stop-color="#fff6c8"/><stop offset=".32" stop-color="#e8bd50"/><stop offset=".72" stop-color="#ac7818"/><stop offset="1" stop-color="#6e470b"/></radialGradient><radialGradient id="chronicle-wx" cx=".34" cy=".28" r=".9"><stop offset="0" stop-color="#e2594a"/><stop offset=".45" stop-color="#ab2018"/><stop offset="1" stop-color="#5e0d0a"/></radialGradient></defs>`
      + `<path d="M15 0h6.4L19 30 13.4 55l-3-5.4-5 2.6L13 30Z" fill="${c1}" stroke="rgba(0,0,0,.45)" stroke-width=".5"/><path d="M20.6 0H27L30 30l6.6 22.6-5.6-2-2.6 5.4L23 30Z" fill="${c2}" stroke="rgba(0,0,0,.45)" stroke-width=".5"/>${body}</svg>`;
  };
  const blot = (rnd, R) => {
    let s = `<path d="${blob(rnd, 0, 0, R, 12, 0.3)}"/>`;
    for (let i = 0; i < 5; i++) { const a = rnd() * 6.3, q = R * (1.45 + rnd() * 1.1); s += `<circle cx="${(Math.cos(a) * q).toFixed(1)}" cy="${(Math.sin(a) * q * 0.8).toFixed(1)}" r="${(0.5 + rnd() * R * 0.16).toFixed(1)}"/>`; }
    return `<svg class="chronicle-blot" xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1" fill="#150d07">${s}<path d="${blob(rnd, -R * 0.25, -R * 0.3, R * 0.3, 6, 0.3)}" fill="#fff" opacity=".1"/></svg>`;
  };

  // The deckled edge: a clip polygon, a slow wave plus tooth. A scrap loses its top right corner.
  const deckle = (rnd, torn) => {
    const ph = rnd() * 6, j = (i) => (0.7 + Math.sin(i * 0.7 + ph) * 0.45 + rnd() * 0.8).toFixed(1), nx = 19, ny = 14, pts = [];
    const tw = 36, th = 27;
    for (let i = 0; i <= nx; i++) pts.push(torn ? `calc((100% - ${tw}px) * ${(i / nx).toFixed(3)}) ${j(i)}px` : `${(i / nx * 100).toFixed(1)}% ${j(i)}px`);
    if (torn) for (let i = 1; i <= 7; i++) { const u = i / 7; pts.push(`calc(100% - ${(tw * (1 - u) + rnd() * 5 - 1).toFixed(1)}px) ${(th * u + rnd() * 4 - 2 + 2).toFixed(1)}px`); }
    for (let i = 1; i <= ny; i++) pts.push(torn ? `calc(100% - ${j(i + 30)}px) calc(${th + 2}px + (100% - ${th + 2}px) * ${(i / ny).toFixed(3)})` : `calc(100% - ${j(i + 30)}px) ${(i / ny * 100).toFixed(1)}%`);
    for (let i = nx - 1; i >= 0; i--) pts.push(`${(i / nx * 100).toFixed(1)}% calc(100% - ${j(i + 60)}px)`);
    for (let i = ny - 1; i >= 1; i--) pts.push(`${j(i + 90)}px ${(i / ny * 100).toFixed(1)}%`);
    return `polygon(${pts.join(',')})`;
  };

  // ---- the chronicler's own words ----
  const VERDICT = {
    poor: 'hardly worth the ink', meh: 'it is noted', good: 'a fair day’s work', great: 'well struck', superb: 'let it be sung',
    calibrating: 'the chronicler reserves judgement', pvp: 'there will be a reckoning',
    levelup: 'and not before time', death: 'the chronicler lays down his pen', achievement: 'witnessed and sealed',
  };
  const rubricOf = (n) => n.kind === 'levelup' ? 'Here the tale turns' : n.kind === 'death' ? 'Here the tale pauses' : n.kind === 'achievement' ? 'Be it known'
    : n.count > 1 ? 'Here fell, in short order' : n.mood === 'pvp' ? 'Here was slain' : (n.mood === 'good' || n.mood === 'great' || n.mood === 'superb') ? 'Here fell' : 'Item';

  Harness.register({
    id: ID,
    name: 'The Chronicle',
    blurb: 'Somebody is keeping the annals. Each event is entered on a small leaf of vellum, written as you watch by a chronicler who has opinions, and the wind takes the leaf when the ink is dry.',
    create(ctx) {
      const { el, svg } = ctx;
      const all = new Set();

      // Game text goes in word by word (textContent), so a line can be written left to right.
      const setWords = (node, text) => {
        node.textContent = '';
        for (const tok of String(text).split(/(\s+)/)) {
          if (!tok) continue;
          if (/^\s+$/.test(tok)) node.append(' '); else node.append(el('span', 'chronicle-w', tok));
        }
      };

      function build(n, seed) {
        const rnd = ctx.rng(seed);
        const L = { rnd, cur: null, timers: new Set(), ink: [], stamp: [], hist: [] };
        L.root = el('div', 'chronicle-leaf'); L.root.setAttribute('role', 'status');
        L.tilt = el('div', 'chronicle-tilt'); L.page = el('div', 'chronicle-page');
        const torn = n.mood === 'poor';
        L.page.style.clipPath = deckle(rnd, torn);
        L.page.style.setProperty('--gx', -Math.floor(rnd() * 40) + 'px'); L.page.style.setProperty('--gy', -Math.floor(rnd() * 30) + 'px');
        L.tilt.style.setProperty('--tilt', ((rnd() * 2 - 1) * (torn ? 3.6 : 2.2) + (rnd() < 0.5 ? -0.8 : 0.8)).toFixed(2) + 'deg');
        L.rub = el('div', 'chronicle-rub'); L.rubT = el('span');
        L.rub.append(el('i', '', '¶'), L.rubT);
        L.body = el('div', 'chronicle-body');
        L.versal = el('span', 'chronicle-versal'); L.vl = el('span', 'chronicle-vl'); L.versal.append(L.vl); L.versal.hidden = true; L.versal.setAttribute('aria-hidden', 'true');
        L.title = el('div', 'chronicle-title');
        L.fig = el('div', 'chronicle-fig'); L.big = el('span', 'chronicle-big'); L.unit = el('span', 'chronicle-unit');
        L.struck = el('div', 'chronicle-struck');
        L.more = el('div', 'chronicle-more');
        L.foot = el('div', 'chronicle-foot'); L.say = el('div', 'chronicle-say');
        L.label = el('div', 'chronicle-label'); L.verdict = el('div', 'chronicle-verdict'); L.droll = el('div', 'chronicle-droll');
        L.say.append(L.label, L.verdict);
        if (n.kind === 'levelup') {
          L.panel = el('span', 'chronicle-panel chronicle-gilt'); L.num = el('span', 'chronicle-gold'); L.bang = el('span', 'chronicle-gold chronicle-bang');
          L.panel.append(L.num, L.bang);
          L.fig.append(L.big, L.panel);
          L.body.append(L.droll, L.fig); L.foot.append(L.say);
        } else {
          L.fig.append(L.big, L.unit); L.fig.hidden = true;
          L.body.append(L.versal, L.title, L.fig, L.struck); L.foot.append(L.say, L.droll);
        }
        L.page.append(el('div', 'chronicle-rule'), el('div', 'chronicle-vine chronicle-l'), el('div', 'chronicle-vine chronicle-r'), svg(FLO), L.rub, L.body, L.more, L.foot);
        if (torn) { const b = svg(blot(rnd, 3.6)); b.style.cssText = 'right:30px;top:62px'; L.page.append(b); L.stamp.push(b); }
        if (n.kind === 'death') { const b = svg(blot(rnd, 8.5)); L.page.append(b); L.stamp.push(b); }
        L.quill = el('div', 'chronicle-quill'); L.quill.append(svg(QUILL));
        L.tilt.append(L.page, L.quill); L.root.append(L.tilt);
        L.steps = apply(L, n);
        return L;
      }

      // Puts a notice on the leaf; returns what changed, in writing order.
      function apply(L, n) {
        const c = L.cur || {}, steps = [];
        const pend = n.mood === 'superb' || n.mood === 'achievement';
        L.root.className = `chronicle-leaf chronicle-k-${n.kind} chronicle-m-${n.mood} chronicle-s-${ctx.skyMode()}${pend ? ' chronicle-pended' : ''}${L.still ? ' chronicle-still' : ''}`;
        // "An orc scout" under a versal read "A / n orc scout": the article joins the rubric, the versal is the noun's.
        const art = n.kind === 'kill' && n.mood !== 'poor' ? /^(an?|the)\s+(\S.*)$/i.exec(n.title) : null;
        const shown = art ? art[2] : n.title;
        const rb = rubricOf(n) + (art ? ' ' + art[1].toLowerCase() : ''), vd = VERDICT[n.mood] || '';
        L.root.setAttribute('aria-label', [rb + ':', n.title, n.big, n.unit, n.label, n.more, vd].filter(Boolean).join(' '));
        if (rb !== c.rb) { setWords(L.rubT, rb); steps.push({ el: L.rubT }); }
        if (n.kind !== 'levelup') {
          const useV = n.mood !== 'poor' && /^[A-Za-z0-9]/.test(n.title);
          if (n.title !== c.title || useV !== c.useV || n.mood !== c.mood) {
            const gilt = n.mood === 'superb';
            L.versal.className = 'chronicle-versal' + (gilt ? ' chronicle-gilt' : ''); L.vl.className = 'chronicle-vl' + (gilt ? ' chronicle-gold' : '');
          }
          if (n.title !== c.title || useV !== c.useV) {
            L.versal.hidden = !useV; L.vl.textContent = useV ? shown.charAt(0).toUpperCase() : '';
            setWords(L.title, useV ? shown.slice(1).replace(/^\s+/, '') : shown);
            if (useV) steps.push({ appear: L.versal });
            steps.push({ el: L.title, rate: n.kind === 'achievement' ? 1.9 : 3 });
          }
        }
        if (n.big !== c.big || n.unit !== c.unit) {
          const m = n.kind === 'levelup' && /^(\D*?)\s*(\d+)(.*)$/.exec(n.big);
          if (m) {
            setWords(L.big, m[1]); L.num.textContent = m[2]; L.bang.textContent = m[3];
            steps.push({ el: L.big }, { appear: L.panel });
          } else {
            if (c.big && n.kind === 'kill') { L.struck.append(el('s', '', c.big)); while (L.struck.children.length > 3) L.struck.firstChild.remove(); }
            setWords(L.big, n.big); setWords(L.unit, n.unit);
            steps.push({ el: L.big, rate: n.kind === 'death' ? 5 : 2.2 }, { el: L.unit });
            L.fig.hidden = !n.big && !n.unit;
          }
        }
        if (n.more !== c.more) {
          L.more.textContent = '';
          if (n.more) { const t = el('span'); setWords(t, n.more); L.more.append(el('b', '', 'viz.'), t); steps.push({ el: t, rate: 1.6 }); }
        }
        if (n.label !== c.label) { setWords(L.label, n.label); steps.push({ el: L.label }); }
        if (vd !== c.vd) { setWords(L.verdict, vd); steps.push({ el: L.verdict }); }
        const dk = DROLL_OF[n.mood];
        if (dk !== c.dk) {
          const d = svg(dk === 'helm2' ? DROLL.helm(true) : DROLL[dk] ? DROLL[dk]() : DROLL.arrow());
          d.querySelectorAll('path,circle').forEach((p) => p.setAttribute('pathLength', '1'));
          L.droll.replaceChildren(d); L.ink.push(d);
        }
        if (pend && !L.pend) {
          L.pend = el('div', 'chronicle-pend'); L.pend.append(svg(pendant(n.mood === 'superb', L.rnd)));
          L.tilt.append(L.pend); L.stamp.push(L.pend);
        } else if (!pend && L.pend) { L.pend.remove(); L.pend = null; }
        if ((n.mood === 'great' || n.mood === 'achievement') && !L.flo) { L.flo = L.page.querySelector('.chronicle-flo'); L.flo.querySelectorAll('path').forEach((p) => p.setAttribute('pathLength', '1')); L.ink.push(L.flo); }
        L.cur = { rb, vd, dk, title: n.title, big: n.big, unit: n.unit, label: n.label, more: n.more, mood: n.mood, useV: n.kind !== 'levelup' && n.mood !== 'poor' && /^[A-Za-z0-9]/.test(n.title) };
        return steps;
      }

      const later = (L, fn, ms) => { const t = setTimeout(() => { L.timers.delete(t); if (!L.dead) fn(); }, ms); L.timers.add(t); return t; };
      const drop = (L, t) => { clearTimeout(t); L.timers.delete(t); };
      const pos = (node, root) => { let x = 0, y = 0; for (let e = node; e && e !== root; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; } return { x, y }; };
      const kill = (L) => { if (L.dead) return; L.dead = true; L.timers.forEach(clearTimeout); L.timers.clear(); L.root.remove(); all.delete(L); };

      // Writes the changed lines one after another from t0 (ms); the quill rides the edge.
      function run(L, steps, t0) {
        let t = t0; const kf = [];
        for (const s of steps) {
          if (s.appear) {
            s.appear.animate([{ opacity: 0, transform: 'scale(.55)' }, { opacity: 1, transform: 'scale(1.06)', offset: 0.7 }, { opacity: 1, transform: 'none' }], { duration: 460, delay: t, fill: 'backwards', easing: 'ease-out' });
            t += 300; continue;
          }
          const gold = getComputedStyle(s.el).color;
          for (const w of s.el.querySelectorAll('.chronicle-w')) {
            const p = pos(w, L.page), ww = w.offsetWidth, d = Math.max(70, ww * (s.rate || 3));
            w.animate([{ clipPath: 'inset(-5px 104% -5px -5px)' }, { clipPath: 'inset(-5px -7px -5px -5px)' }], { duration: d, delay: t, fill: 'backwards', easing: 'linear' });
            w.animate([{ color: `color-mix(in srgb, ${gold} 40%, #000)` }, { color: gold }], { duration: 2400, delay: t + d, fill: 'backwards', easing: 'ease-in' });
            const y = p.y + w.offsetHeight * 0.78;
            kf.push([t, p.x, y], [t + d, p.x + ww, y]);
            t += d + 26;
          }
          t += 110;
        }
        L.quillA?.cancel();
        if (kf.length) {
          const total = t - t0 + 260, last = kf[kf.length - 1];
          const frames = kf.map(([tt, x, y], i) => ({ offset: (tt - t0) / total, opacity: 1, transform: `translate(${x.toFixed(1)}px,${(y - (i % 2 ? 0 : 0.8)).toFixed(1)}px)` }));
          frames.push({ offset: 1, opacity: 0, transform: `translate(${(last[1] + 16).toFixed(1)}px,${(last[2] - 22).toFixed(1)}px)` });
          L.quillA = L.quill.animate(frames, { duration: total, delay: t0, easing: 'linear' });
        }
        return t;
      }

      // After the writing: the marginal drawing is inked, the seal is set, the leaf rests.
      function settle(L, t) {
        const t1 = t;
        for (const d of L.ink.splice(0)) {
          const parts = [...d.querySelectorAll('path,circle')];
          const per = Math.min(110, 1300 / parts.length);
          parts.forEach((p, i) => {
            const filled = p.classList.contains('chronicle-f') || p.classList.contains('chronicle-g') || p.hasAttribute('fill') || p.style.fill;
            if (filled) p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: t + i * per + 200, fill: 'backwards' });
            else p.animate([{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }], { duration: 520, delay: t + i * per, fill: 'backwards', easing: 'ease-in-out' });
          });
          t += parts.length * per + 300;
        }
        for (const s of L.stamp.splice(0)) {
          const isBlot = s.classList.contains('chronicle-blot');
          s.animate(isBlot ? [{ opacity: 0, transform: 'scale(.2)' }, { opacity: 1, transform: 'none' }] : [{ opacity: 0, transform: 'translateY(-10px) scale(1.25)' }, { opacity: 1, transform: 'none' }],
            { duration: isBlot ? 260 : 380, delay: isBlot ? Math.max(0, t1 - 900) : t1 + 250, fill: 'backwards', easing: 'cubic-bezier(.3,1.5,.5,1)' });
        }
        if (L.restT) drop(L, L.restT);
        L.restT = later(L, () => leave(L), t + 500 + 6000 / ctx.pace());
      }

      // Low in the lane; a newer leaf goes beside or above those still resting.
      function place(L) {
        const lane = ctx.lane(), S = ctx.size(), W = L.root.offsetWidth, H = L.root.offsetHeight;
        const cols = Math.max(1, Math.floor((lane.w + 8) / 232));
        let best = null;
        for (let k = 0; k < cols; k++) {
          const i = cols - 1 - k;
          const x = cols === 1 ? lane.x0 + (lane.w - W) * 0.62 : lane.x0 + 8 + (lane.w - W - 16) * (i / (cols - 1));
          let b = 16, moved = true;
          const mine = [...all].filter((o) => o !== L && !o.leaving && o.col === i);
          while (moved) { moved = false; for (const o of mine) if (b < o.b + o.h + 14 && b + H + 14 > o.b) { b = o.b + o.h + 14; moved = true; } }
          if (!best || b < best.b - 1) best = { i, x, b };
        }
        L.col = best.i; L.b = best.b; L.h = H; L.x = best.x;
        L.root.style.left = Math.round(best.x) + 'px';
        L.root.style.bottom = Math.round(S.h - lane.bottom + best.b) + 'px';
      }

      function leave(L) {
        if (L.leaving || L.dead) return; L.leaving = true;
        if (ctx.reduced) { L.root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, fill: 'forwards' }).onfinish = () => kill(L); return; }
        const lane = ctx.lane(), dur = 12000 / ctx.pace(), r = L.rnd;
        const room = [lane.x0 - L.x, lane.x1 - L.root.offsetWidth - L.x];
        let dx = (r() < 0.5 ? -1 : 1) * (70 + r() * 110);
        dx = Math.max(room[0] + 10, Math.min(room[1] - 10, dx)); if (Math.abs(dx) < 40) dx = room[1] - room[0] > 80 ? (Math.abs(room[0]) > room[1] ? room[0] * 0.6 : room[1] * 0.6) : dx;
        const up = Math.max(180, lane.bottom - L.b - L.h - lane.h * 0.06), sg = dx < 0 ? -1 : 1;
        L.root.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${(dx * 0.3).toFixed(0)}px,${(-up * 0.22).toFixed(0)}px) scale(.94)`, opacity: 1, offset: 0.3 }, { transform: `translate(${(dx * 0.8).toFixed(0)}px,${(-up * 0.74).toFixed(0)}px) scale(.62)`, opacity: 0.85, offset: 0.76 }, { transform: `translate(${dx.toFixed(0)}px,${(-up).toFixed(0)}px) scale(.4)`, opacity: 0 }],
          { duration: dur, easing: 'cubic-bezier(.3,0,.7,1)', fill: 'forwards' }).onfinish = () => kill(L);
        // the sway and the turn of a leaf on the wind, each coming to rest at its ends
        L.root.animate([{ translate: '0px 0px' }, { translate: `${-12 * sg}px -4px` }, { translate: `${18 * sg}px 3px` }, { translate: `${-16 * sg}px -3px` }, { translate: `${14 * sg}px 2px` }, { translate: '0px 0px' }], { duration: dur, easing: 'ease-in-out' });
        const base = getComputedStyle(L.tilt).getPropertyValue('--tilt') || '0deg';
        const tw = (a, y, x) => `perspective(520px) rotate(${a}deg) rotateY(${y}deg) rotateX(${x}deg)`;
        L.tilt.animate([{ transform: `perspective(520px) rotate(${base}) rotateY(0deg) rotateX(0deg)`, easing: 'ease-in-out' }, { transform: tw(-7 * sg, -14 * sg, 16), easing: 'ease-in-out', offset: 0.1 }, { transform: tw(9 * sg, 26 * sg, -8), easing: 'ease-in-out', offset: 0.32 }, { transform: tw(-11 * sg, -30 * sg, 12), easing: 'ease-in-out', offset: 0.55 }, { transform: tw(13 * sg, 34 * sg, -14), easing: 'ease-in-out', offset: 0.78 }, { transform: tw(-6 * sg, -20 * sg, 10) }],
          { duration: dur, fill: 'forwards' });
        later(L, () => ctx.sky.append(L.root), dur * 0.14);
      }

      function show(n) {
        const L = build(n, (Math.random() * 1e9) | 0);
        ctx.front.append(L.root); all.add(L); place(L);
        if (ctx.reduced) {
          L.ink.length = 0; L.stamp.length = 0;
          L.root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
          L.restT = later(L, () => leave(L), 6000 / ctx.pace());
          return { update(m) { if (L.dead || L.leaving) return; apply(L, m); L.ink.length = 0; L.stamp.length = 0; drop(L, L.restT); L.restT = later(L, () => leave(L), 6000 / ctx.pace()); } };
        }
        const sg = L.col % 2 ? -1 : 1;
        L.root.animate([{ transform: `translate(${34 * sg}px,-92px)`, opacity: 0 }, { opacity: 1, offset: 0.35 }, { transform: 'none', opacity: 1 }], { duration: 950, easing: 'cubic-bezier(.2,.7,.25,1)' });
        const base = getComputedStyle(L.tilt).getPropertyValue('--tilt') || '0deg';
        L.tilt.animate([{ transform: `perspective(520px) rotate(${-11 * sg}deg) rotateX(58deg) rotateY(${18 * sg}deg)`, easing: 'ease-in-out' }, { transform: `perspective(520px) rotate(${5 * sg}deg) rotateX(-12deg) rotateY(${-8 * sg}deg)`, easing: 'ease-in-out', offset: 0.62 }, { transform: `perspective(520px) rotate(${base}) rotateX(0deg) rotateY(0deg)` }], { duration: 1150 });
        settle(L, run(L, L.steps, 620));
        return {
          update(m) {
            if (L.dead || L.leaving) return;
            const steps = apply(L, m);
            L.page.animate([{ transform: 'none' }, { transform: 'translateY(-4px) scale(1.035) rotate(-.8deg)' }, { transform: 'none' }], { duration: 300, easing: 'ease-out' });
            settle(L, run(L, steps, 80));
          },
        };
      }

      function still(n) {
        const seed = 1000 + [...(n.mood + n.title)].reduce((a, ch) => a * 31 + ch.charCodeAt(0) | 0, 7);
        const L = build({ ...n }, seed >>> 0);
        L.still = true; L.root.classList.add('chronicle-still');
        return L.root;
      }

      function clear() { for (const L of [...all]) kill(L); }

      return { show, still, clear };
    },
  });
})();
