/* =====================================================================================================
   WebCockpit start-menu mockups · round 7 · shared base (JS) → window.WC
   -----------------------------------------------------------------------------------------------------
   Throwaway mockup code. The sky, the weather director, the game clock and the wordmark are round 6's
   logo-3.html (the agreed baseline) moved into a module; the wordmark's inlay is mithril (WC.INLAY,
   one constant; a page may define window.WC_INLAY before loading this file to try another tint).
   API: README.md in this folder. Summary:
     WC.sky.start()              the sky canvas, vignette, grain, almanac, demo panel; runs the frame loop
     WC.startMenu({onActivate})  the start stage: wordmark, the Lykta menu panel, quote A
     WC.Wordmark(el)             a wordmark instance (full or .small) that follows the sky's light
     WC.decorate(root)           builds brackets / hood / Back for every .lp[data-hood][data-back]
     WC.keys.push(layer)         keyboard layers {key(e) → true if handled, back()}; Esc/Backspace → back
     WC.list(root, opts)         ↑↓ Home End PgUp PgDn Enter selection over rows (restrained .on)
     WC.shortcut(e, map)         letter shortcuts ({n: fn, …}); WC.flash(el, msg)
     WC.ingame({bg})             the in-game backdrop (real screenshots, dark / paper); WC.window(el)
     WC.dur(ms) / WC.wait(ms)    durations scaled by ?slow=N and reduced motion; WC.rect / WC.flyTo
   URL params: t= m= s= w= p= (sky, as round 6) · fast · rm (reduced motion) · slow=N · nointro · demo · bg=paper
   ===================================================================================================== */
(() => {
'use strict';
const WC = (window.WC = window.WC || {});
const BASE_URL = new URL('.', document.currentScript ? document.currentScript.src : location.href).href;
WC.BASE_URL = BASE_URL;

/** The inlay of the wordmark and its rivets: subtle mithril (round 6 logo-3-cyan.html tint d, the owner's
    choice of 2026-11-07, as built in the app: src/start/wordmark-svg.ts). Silver with a faint cool cast that
    still echoes the old pixel logo's cyan. Banded like brushed metal (bright top lip, dark core, a second
    lit band, dark foot), so it reads as metal, never as neon. Night: cooler, nearly neutral silver.
    Swap here (or window.WC_INLAY) to try another tint; lip and ink are the channel's lit lip and COCKPIT. */
const INLAY = window.WC_INLAY || {
  day:   [[0, '#d4ecee'], [.22, '#7eaeb2'], [.48, '#2c4e51'], [.6, '#4c777b'], [.75, '#a2c4c8'], [1, '#20383a']],
  night: [[0, '#deedf1'], [.22, '#97b4bc'], [.48, '#435a60'], [.6, '#688187'], [.75, '#aec5ca'], [1, '#324448']],
  rivet: { day: ['#eef9fa', '#72a7ac', '#1b3335'], night: ['#f5fcfe', '#97b2b9', '#29383d'] },
  lip: 'rgba(206,232,234,.55)',
  ink: '#cfe2e4',
};
WC.INLAY = INLAY;
if (INLAY.ink) document.documentElement.style.setProperty('--wm-ink', INLAY.ink);
/* ======================================================================================= CORE
   Small helpers shared by every module: math, colour, seeded random, noise, canvases. */
const $ = (s) => document.querySelector(s);
const qs = new URLSearchParams(location.search);
const RM = qs.has('rm') || matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const mod = (a, n) => ((a % n) + n) % n;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(Date.now() & 0xffff);
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
function ramp(stops, x) {
  if (x <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) if (x <= stops[i][0]) { const [x0, c0] = stops[i - 1], [x1, c1] = stops[i]; return mix(c0, c1, (x - x0) / (x1 - x0)); }
  return stops[stops.length - 1][1];
}
/** 1-D value noise in [0,1]. */
function vnoise(r) { const v = new Float32Array(1024); for (let i = 0; i < 1024; i++) v[i] = r(); return (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(v[i & 1023], v[(i + 1) & 1023], u); }; }
function fbm(n, x, oct) { let s = 0, a = .5, f = 1, t = 0; for (let o = 0; o < oct; o++) { s += a * n(x * f + o * 31.7); t += a; a *= .5; f *= 2.07; } return s / t; }
function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
function glowSprite(col, size = 64) { const c = mk(size, size), x = c.getContext('2d'), g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, rgb(col, 1)); g.addColorStop(.18, rgb(col, .55)); g.addColorStop(.45, rgb(col, .14)); g.addColorStop(1, rgb(col, 0)); x.fillStyle = g; x.fillRect(0, 0, size, size); return c; }
const SPR = { white: glowSprite([255, 255, 255], 64) };

let cv = null, ctx = null;
let W = 0, H = 0, DPR = 1;

/* ======================================================================================= TIME
   MUME's game clock, offline (BRIEF.md). 1 real second = 1 game minute. The season names follow
   src/gmcp/gametime.ts seasonOf: Afteryule–Rethe = winter, Astron–Forelithe = spring,
   Afterlithe–Halimath = summer, Winterfilth–Foreyule = autumn. */
const YEAR = 518400, MONTH = 43200, DAY = 1440;
const DAWN = [8, 9, 8, 7, 7, 6, 5, 4, 5, 6, 7, 7], DUSK = [18, 17, 18, 19, 20, 20, 21, 22, 21, 20, 20, 19];
const MONTHS = ['Afteryule', 'Solmath', 'Rethe', 'Astron', 'Thrimidge', 'Forelithe', 'Afterlithe', 'Wedmath', 'Halimath', 'Winterfilth', 'Blotmath', 'Foreyule'];
const WEEKDAYS = ['Sterday', 'Sunday', 'Monday', 'Trewsday', 'Hevensday', 'Mersday', 'Highday'];
const SEASONS = ['winter', 'spring', 'summer', 'autumn'];
const seasonOf = (m) => SEASONS[Math.floor(m / 3)];
const SEED_EPOCH = 1696118400 - 2850 * YEAR;
const MOON_CYCLE = (29 * 24 + 12) * 60 + 44, MOON_ORIGIN = 2850 * YEAR;
const PHASES = ['new', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full', 'waning gibbous', 'third quarter', 'waning crescent'];
function savedEpoch() {
  try { const s = JSON.parse(localStorage.getItem('wc.clock') || 'null'); if (s && typeof s.epoch === 'number' && isFinite(s.epoch)) return s.epoch; } catch (e) { /* none */ }
  return SEED_EPOCH;
}
function moonModel(g) {
  const zc = Math.floor(((g - MOON_ORIGIN) * DAY) / MOON_CYCLE), z = mod(zc, DAY);
  const level = Math.abs(12 - Math.floor((z + 30) / 60)), waxing = z >= 720, i = Math.min(4, Math.floor(level / 3));
  const phase = i === 0 ? 'new' : i === 4 ? 'full' : waxing ? PHASES[i] : PHASES[8 - i];
  const ha = mod(g - MOON_ORIGIN - zc - 1080, DAY);
  return { level, waxing, phase, up: ha < 720, frac: ha / 720 };
}
const clk = { epoch: savedEpoch(), g0: 0, r0: 0, speed: 1, phase: 'auto', weather: 'auto' };
const realG = () => Date.now() / 1000 - clk.epoch;
function rebase(g) { clk.g0 = g; clk.r0 = performance.now() / 1000; }
const gameG = () => clk.g0 + (performance.now() / 1000 - clk.r0) * clk.speed;
rebase(realG());
function setHour(h) { const g = gameG(); rebase(Math.floor(g / DAY) * DAY + h * 60); }
function setMonth(m) { const g = gameG(); rebase(Math.floor(g / YEAR) * YEAR + m * MONTH + mod(g, MONTH)); }
if (qs.has('s')) setMonth(+qs.get('s') * 3 + 1);
if (qs.has('m')) setMonth(+qs.get('m'));
if (qs.has('t')) setHour(+qs.get('t'));
if (qs.has('w')) clk.weather = qs.get('w');
if (qs.has('p')) clk.phase = qs.get('p');
if (qs.has('fast')) clk.speed = 600;

/* ======================================================================================= ENV
   The one object every module reads each frame (updated by updateEnv before anything draws).
     t, dt            real seconds since load / since last frame (dt capped at .05)
     W, H, DPR, RM    viewport in CSS px, canvas pixel ratio, reduced motion
     g                absolute game minute;  month (0-11), monthName, day (1-30), h (hour, float)
     season           'winter' | 'spring' | 'summer' | 'autumn' (gametime.ts seasonOf)
     period           'dawn' | 'day' | 'dusk' | 'night'
     e                sun elevation -1 (deep night) … 0 (horizon) … 1 (high noon in summer)
     daylight, dark   0..1 blends;  dawn 0..1 (peaks around sunrise)
     horizonY         y of the old horizon line: sun/moon arcs end here, the plain lower surface starts here
     sun  {x,y,r,up,drawn}        moon {x,y,r,level 0-12,phase,waxing,visible,drawn,frac}
     light {x,y,I,col,kind}       the dominant light (sun or moon): position, intensity 0..1, rgb
     sunI, moonI      their separate intensities;  sky {top,mid,hor} rgb arrays of the sky gradient
     weather {cloud,rain,snow,storm,fog: 0..1, state, auto, left}   (the director's state)
     wind {dir ±1, dirS smoothed dir, s strength 0..1, gust 0..1, x signed total}
     flash            lightning flash 0..1
     par {x,y}        smoothed mouse parallax -1..1 (plus a slow idle drift)
     enter, journey   "Enter MUME" is selected / was activated */
const env = {
  t: 0, dt: 0, W: 0, H: 0, DPR: 1, RM,
  g: 0, month: 0, monthName: '', day: 1, h: 0, season: 'winter', period: 'day',
  e: 0, daylight: 0, dark: 0, dawn: 0, horizonY: 0,
  sun: {}, moon: {}, light: {}, sunI: 0, moonI: 0, sky: { top: [0, 0, 0], mid: [0, 0, 0], hor: [0, 0, 0] },
  weather: null, wind: null, flash: 0,
  par: { x: 0, y: 0 }, enter: false, journey: false,
};
const mouse = { x: .5, y: .5, sx: .5, sy: .5 };
addEventListener('pointermove', (e) => { if (!W || !H) return; mouse.x = e.clientX / W; mouse.y = e.clientY / H; }, { passive: true });

const SKYRAMP = [
  [-1.0, ['#020309', '#050816', '#0a1022']],
  [-0.5, ['#03050f', '#0a0f24', '#1a1c36']],
  [-0.2, ['#0b1130', '#2a2650', '#6b3a4a']],
  [-0.04, ['#1b2550', '#5a3e66', '#e0703c']],
  [0.06, ['#2b4579', '#8f6a83', '#ffaa5a']],
  [0.2, ['#3a64a0', '#8fa4c4', '#ffd2a0']],
  [0.42, ['#3a70b6', '#7eaad6', '#d6e4ec']],
  [1.0, ['#2a62ae', '#6a9fd6', '#bfd8ec']],
].map(([x, cs]) => [x, cs.map(hex)]);
const skyAt = (e) => { const out = []; for (let k = 0; k < 3; k++) out.push(ramp(SKYRAMP.map(([x, cs]) => [x, cs[k]]), e)); return out; };

/** The sky path shared by the sun and the moon (f: 0 rise … 1 set). It starts and ends just off-screen
    (x0 < 0, x1 > 1) and lifts slowly off the horizon (p > 1: a shallow start), so a rising sun slides
    in from the left a little above the trees, and a setting one sinks out to the right. */
const ARC = { x0: -.08, x1: 1.08, p: 1.35 };
const arcX = (f) => lerp(ARC.x0, ARC.x1, f) * W;
const arcLift = (f) => Math.sin(Math.PI * clamp(f)) ** ARC.p;
function updateEnv(dt, t) {
  const g = gameG(), month = mod(Math.floor(g / MONTH), 12), h = mod(g, DAY) / 60;
  Object.assign(env, { t, dt, W, H, DPR, g, month, monthName: MONTHS[month], h, season: seasonOf(month) });
  env.day = (Math.floor(Math.max(0, g) / DAY) % 30) + 1;
  const hh = Math.floor(h), rise = DAWN[month], set = DUSK[month] + 1;
  env.period = hh === rise ? 'dawn' : hh === DUSK[month] ? 'dusk' : hh > rise && hh < DUSK[month] ? 'day' : 'night';
  const tt = (h - rise) / (set - rise), summer = 1 - Math.abs(month - 6.5) / 6, maxAlt = .5 + .5 * summer;
  let e;
  if (tt >= 0 && tt <= 1) e = Math.sin(Math.PI * tt) * maxAlt;
  else { const d = h < rise ? Math.min(rise - h, h + 24 - set) : Math.min(h - set, rise + 24 - h); e = -Math.min(1, d / 2.4); }
  env.e = e; env.daylight = sstep(-.22, .2, e); env.dark = 1 - sstep(-.45, -.05, e);
  env.dawn = 1 - sstep(.5, 1.8, Math.abs(h - rise - .4));
  // the old horizon line (a little lower on tall screens); the arcs scale to the sky above it
  env.horizonY = (W / H < .75 ? .655 : .6) * H;
  const span = env.horizonY - H * .05;
  WEATHER.update(env, dt);
  const wx = env.weather;
  // --- sun: clearly larger than the moon
  const tc = clamp(tt, -.08, 1.08);
  // the path (sun and moon alike): it rises at the horizon just off-screen left and glides into view as
  // it climbs (a low, shallow, slow start), and mirrors that at the end: sinking out to the right
  const sun = { x: arcX(tc), y: env.horizonY - arcLift(tt) * (.55 + .45 * maxAlt) * span + (tt < 0 || tt > 1 ? H * .08 : 0),
    r: Math.max(21, Math.min(W, H) * .04), up: tt > -.02 && tt < 1.02 };
  sun.drawn = sun.up && e > -.08;
  // --- moon: real model (or the demo's phase override)
  let mm = moonModel(g);
  if (clk.phase !== 'auto') {
    const i = +clk.phase, lv = [0, 3, 6, 9, 12, 9, 6, 3][i];
    let frac;
    if (e < 0) { const night = rise + 24 - set, since = mod(h - set, 24); frac = clamp(since / night, .1, .9); } else frac = clamp(1 - tt, .12, .88);
    mm = { level: lv, waxing: i > 0 && i < 4, phase: PHASES[i], up: true, frac };
  }
  const moon = { ...mm, x: arcX(mm.frac), y: env.horizonY - arcLift(mm.frac) * span * .95, r: Math.max(9, Math.min(W, H) * .018) };
  // MMapper's rule: a new moon is never visible, a dim one (level ≤ 4) not by day
  moon.visible = mm.up && mm.level > 0 && (mm.level > 4 || e < -.05);
  moon.drawn = moon.visible;
  // never in the same spot: nudge the moon's drawn position away from the sun
  if (sun.drawn && moon.drawn) {
    const minD = sun.r * 3.6 + moon.r * 2;
    let dx = moon.x - sun.x, dy = moon.y - sun.y, d = Math.hypot(dx, dy);
    if (d < minD) {
      if (d < 1e-3) { dx = mm.frac < .5 ? -1 : 1; dy = -.35; d = Math.hypot(dx, dy); }
      moon.x = sun.x + (dx / d) * minD; moon.y = sun.y + (dy / d) * minD;
      const maxY = env.horizonY - moon.r * 3;
      if (moon.y > maxY) { moon.y = maxY; const ry = moon.y - sun.y; moon.x = sun.x + (dx >= 0 ? 1 : -1) * Math.sqrt(Math.max(0, minD * minD - ry * ry)); }
      moon.nudged = true;
    }
  }
  env.sun = sun; env.moon = moon;
  // --- the dominant light
  const moonI = (moon.visible ? 1 : 0) * (mm.level / 12) * (1 - sstep(-.18, .02, e)) * (1 - .75 * wx.cloud);
  const sunI = sstep(-.1, .04, e) * (1 - .8 * wx.cloud);
  env.moonI = moonI; env.sunI = sunI;
  if (sunI >= moonI * .8) {
    const low = 1 - sstep(.05, .35, e);
    env.light = { x: sun.x, y: sun.y, I: sunI * (.75 + .45 * low), col: mix(hex('#fff1d6'), hex('#ff9a48'), low), kind: 'sun' };
  } else env.light = { x: moon.x, y: moon.y, I: moonI * .85, col: hex('#b9c8f2'), kind: 'moon' };
  // --- sky colours (weather greys them)
  let [top, mid, hor] = skyAt(e);
  const grey = mix(hex('#07090d'), hex('#7c838c'), env.daylight), greyH = mix(hex('#0d1016'), hex('#9ba3ab'), env.daylight);
  const cvv = wx.cloud * .85 + wx.storm * .1;
  top = mix(top, mul(grey, .7 - .25 * wx.storm), cvv * .9); mid = mix(mid, grey, cvv * .85); hor = mix(hor, greyH, cvv * .8);
  if (wx.fog > .3) { const f = (wx.fog - .3) * .6; mid = mix(mid, hor, f); top = mix(top, mid, f * .6); }
  env.sky = { top, mid, hor };
  // --- parallax
  const pk = RM ? 0 : 1 - Math.exp(-dt * 3);
  mouse.sx = lerp(mouse.sx, mouse.x, pk); mouse.sy = lerp(mouse.sy, mouse.y, pk);
  env.par = { x: (mouse.sx - .5) * 2 + (RM ? 0 : Math.sin(t * .05) * .25), y: (mouse.sy - .5) * 2 };
}

/* ======================================================================================= WEATHER
   The director: ONE weather state at a time, long calm stretches, slow cross-fades.
     winter         always snow, drifting gently between light and steady
     spring/autumn  mostly clear or fair; light rain now and then (well under 20 % of the time);
                    autumn may get a rare, short storm
     summer         clear or fair, never rain
     fog            only sometimes, around dawn (any season but winter)
   Also owns the wind, the particles (rain, snow) and lightning. */
const WEATHER = (() => {
  const STATES = {
    clear:  { cloud: .03, rain: 0, snow: 0, storm: 0, fog: .03, wind: .16, dur: [150, 360] },
    fair:   { cloud: .30, rain: 0, snow: 0, storm: 0, fog: .05, wind: .26, dur: [120, 300] },
    clouds: { cloud: .64, rain: 0, snow: 0, storm: 0, fog: .10, wind: .36, dur: [70, 160] },
    rain:   { cloud: .76, rain: .45, snow: 0, storm: 0, fog: .16, wind: .40, dur: [45, 100] },
    storm:  { cloud: .96, rain: .85, snow: 0, storm: 1, fog: .14, wind: .85, dur: [25, 45] },
    fog:    { cloud: .12, rain: 0, snow: 0, storm: 0, fog: .85, wind: .04, dur: [60, 140] },
    snow:   { cloud: .55, rain: 0, snow: .55, storm: 0, fog: .08, wind: .30, dur: [1e9, 1e9] },
  };
  const NEXT = {
    spring: { clear: 4, fair: 4, clouds: 1.6, rain: 1.5 },
    summer: { clear: 5, fair: 3.5 },
    autumn: { clear: 3, fair: 3, clouds: 2, rain: 1.7, storm: .3 },
  };
  const wx = { cloud: .03, rain: 0, snow: 0, storm: 0, fog: .03, state: 'clear', auto: true, left: 0 };
  const wind = { dir: 1, dirS: 1, s: .2, gust: 0, x: .2 };
  const nSnow = vnoise(rng(71)), nGust = vnoise(rng(72));
  const P = { drops: [], flakes: [], bolt: null, nextBolt: 3 };
  let cur = null, init = false;

  function build() {
    const area = W * H / (1440 * 900);
    P.drops = Array.from({ length: Math.round(380 * area) }, () => ({ x: R() * W, y: R() * H, z: R() }));
    P.flakes = Array.from({ length: Math.round(420 * area) }, () => ({ x: R() * W, y: R() * H, z: R() ** 1.6, p: R() * 6.28 }));
  }
  function pick(e) {
    if (e.season === 'winter') return 'snow';
    if (e.dawn > .4 && cur !== 'fog' && R() < .4) return 'fog';
    const w = { ...NEXT[e.season] };
    if (cur === 'rain' || cur === 'storm') { delete w.rain; delete w.storm; }
    let sum = 0; for (const k in w) sum += w[k];
    let r = R() * sum; for (const k in w) { r -= w[k]; if (r <= 0) return k; }
    return 'clear';
  }
  function update(e, dt) {
    let name = clk.weather;
    wx.auto = name === 'auto';
    if (wx.auto) {
      wx.left -= dt * (clk.speed > 1 ? 10 : 1);
      const winter = e.season === 'winter';
      const fogOver = cur === 'fog' && e.dawn < .02 && e.daylight > .9;
      if (!cur || wx.left <= 0 || winter !== (cur === 'snow') || fogOver) {
        const prev = cur;
        cur = pick(e);
        if (!prev && cur === 'fog' && R() < .5) cur = 'fair';
        const d = STATES[cur].dur; wx.left = d[0] + R() * (d[1] - d[0]);
        if (prev && R() < .2) wind.dir = -wind.dir;
      }
      name = cur;
    }
    const tg = { ...(STATES[name] || STATES.clear) };
    if (name === 'snow') { const v = sstep(.3, .7, fbm(nSnow, e.t / 60 + 3, 2)); tg.snow = .3 + .5 * v; tg.cloud = .42 + .32 * v; tg.wind = .16 + .3 * v; }
    const k = init ? 1 - Math.exp(-dt / (wx.auto ? 9 : 2.5)) : 1;
    for (const key of ['cloud', 'rain', 'snow', 'storm', 'fog']) wx[key] = lerp(wx[key], tg[key], k);
    wx.state = name;
    wind.s = init ? lerp(wind.s, tg.wind, 1 - Math.exp(-dt / 6)) : tg.wind;
    wind.dirS = lerp(wind.dirS, wind.dir, 1 - Math.exp(-dt / 5));
    wind.gust = sstep(.5, .78, fbm(nGust, e.t * .07, 3)) * (.25 + wind.s);
    wind.x = wind.dirS * (wind.s + wind.gust * .6);
    init = true;
    e.weather = wx; e.wind = wind;
    // lightning (storms only)
    if (wx.storm > .5 && !RM) { P.nextBolt -= dt; if (P.nextBolt <= 0) { P.nextBolt = 4 + R() * 7; strike(e); } }
    if (qs.has('bolt') && !P.bolt) strike(e, true);
    if (P.bolt) { P.bolt.t += dt; const seq = [1, .15, .85, .05, .55, 0], i = Math.floor(P.bolt.t / .07); e.flash = P.bolt.hold ? .7 : i < seq.length ? seq[i] * P.bolt.p : 0; if (!P.bolt.hold && i >= seq.length + 2) P.bolt = null; }
    else e.flash = 0;
  }
  function strike(e, hold) {
    const bx = W * (.12 + .76 * R()), by = e.horizonY, sx = bx + (R() - .5) * W * .15, sy = H * .06;
    const pts = [[sx, sy]], n = 16;
    for (let i = 1; i <= n; i++) { const t = i / n; pts.push([lerp(sx, bx, t) + (R() - .5) * 38 * (1 - t * .5), lerp(sy, by, t) + (R() - .5) * 10]); }
    pts[n] = [bx, by];
    const br = []; for (let k = 0; k < 3; k++) { const s = 3 + Math.floor(R() * 9), p = pts[s].slice(), seg = [p.slice()]; const a = (R() < .5 ? -1 : 1) * (.4 + R() * .5); for (let i = 0; i < 5; i++) { p[0] += Math.sin(a) * 18 + (R() - .5) * 10; p[1] += 14 + R() * 8; seg.push(p.slice()); } br.push(seg); }
    P.bolt = { pts, br, t: 0, p: .7 + R() * .3, hold: !!hold };
  }
  /** Behind the air and the lower surface: the bolt itself. */
  function drawBack(x, e) {
    if (!P.bolt || e.flash < .02) return;
    x.fillStyle = `rgba(190,200,255,${e.flash * .22})`; x.fillRect(0, 0, W, H);
    x.save(); x.globalCompositeOperation = 'lighter'; x.lineJoin = 'round';
    const ox = -e.par.x * 28 * .05, oy = -e.par.y * 10 * .05;
    for (const [lw, a] of [[9, .12], [4, .35], [1.6, 1]]) {
      x.strokeStyle = `rgba(220,228,255,${a * Math.min(1, e.flash * 1.4)})`; x.lineWidth = lw; x.beginPath();
      P.bolt.pts.forEach((p, i) => (i ? x.lineTo(p[0] + ox, p[1] + oy) : x.moveTo(p[0] + ox, p[1] + oy))); x.stroke();
      if (lw < 5) for (const b of P.bolt.br) { x.lineWidth = lw * .6; x.beginPath(); b.forEach((p, i) => (i ? x.lineTo(p[0] + ox, p[1] + oy) : x.moveTo(p[0] + ox, p[1] + oy))); x.stroke(); }
    }
    x.restore();
  }
  /** In front of everything: rain, snow, fog veil, flash. */
  function drawFront(x, e) {
    const dt = Math.min(e.dt, .05), wnd = e.wind.x;
    const lit = mix(mix(hex('#3a4458'), hex('#c8d2de'), e.daylight), e.light.col, .2);
    if (wx.rain > .02) { // light, thin, unobtrusive
      const n = Math.floor(P.drops.length * wx.rain), slant = .12 + wnd * .5;
      for (let pass = 0; pass < 2; pass++) {
        x.strokeStyle = rgb(lit, (pass ? .22 : .11) * (e.flash > .1 ? 1.7 : 1)); x.lineWidth = pass ? 1 : .7; x.beginPath();
        for (let i = 0; i < n; i++) { const d = P.drops[i]; if ((d.z > .6) !== !!pass) continue; const sp = (RM ? 280 : 800) * (.65 + d.z * .6), len = 7 + d.z * 15;
          d.y += sp * dt; d.x += sp * slant * dt; if (d.y > H) { d.y = -20; d.x = R() * (W + 200) - 100; } if (d.x > W + 20) d.x -= W + 40; if (d.x < -20) d.x += W + 40;
          x.moveTo(d.x, d.y); x.lineTo(d.x - len * slant, d.y - len); }
        x.stroke();
      }
    }
    if (wx.snow > .02) {
      const n = Math.floor(P.flakes.length * wx.snow), sl = mix(lit, [255, 255, 255], .4 + .3 * e.daylight);
      x.fillStyle = rgb(sl, .9);
      for (let i = 0; i < n; i++) { const f = P.flakes[i], sp = (RM ? 16 : 26) + f.z * (RM ? 34 : 60);
        f.y += sp * dt; f.p += dt * (.6 + f.z); f.x += (Math.sin(f.p) * 12 + 40 * wnd) * dt * (.4 + f.z);
        if (f.y > H + 6) { f.y = -6; f.x = R() * W; } if (f.x > W + 6) f.x = -6; if (f.x < -6) f.x = W + 6;
        const r = .7 + f.z * 2.3, fx = f.x - e.par.x * 12 * f.z, fy = f.y - e.par.y * 4 * f.z;
        if (f.z > .75) { x.globalAlpha = .5; x.drawImage(SPR.white, fx - r * 2.2, fy - r * 2.2, r * 4.4, r * 4.4); }
        else { x.globalAlpha = .38 + f.z * .5; x.fillRect(fx - r / 2, fy - r / 2, r, r); }
      }
      x.globalAlpha = 1;
    }
    if (wx.fog > .05) { const fg = x.createLinearGradient(0, H * .4, 0, H), fc = mix(e.sky.hor, e.sky.mid, .3); fg.addColorStop(0, rgb(fc, 0)); fg.addColorStop(.6, rgb(fc, wx.fog * .3)); fg.addColorStop(1, rgb(fc, wx.fog * .4)); x.fillStyle = fg; x.fillRect(0, 0, W, H); }
    if (e.flash > .02) { x.fillStyle = `rgba(210,220,255,${e.flash * .07})`; x.fillRect(0, 0, W, H); }
  }
  return { build, update, drawBack, drawFront, wx, wind, STATES };
})();

/* ======================================================================================= SKY
   Sky gradient, horizon glow, stars (rotating about a pole; no milky way since round 4), sparse shooting
   stars, the sun (large) and the moon (small, real phase), clouds; then the air low in the sky
   (afterglow, twilight belt, haze band, the veil round a low sun or bright moon) and, below the old
   horizon line, the plain lower surface that ends them all (drawBelow). */
const SKY = (() => {
  const S = { stars: [], clouds: [], shoot: [], nextShoot: 12 };
  const moonC = mk(128, 128);
  function build() {
    S.pole = { x: W * .28, y: -H * .55 };
    S.Rmax = Math.hypot(W - S.pole.x, H - S.pole.y);
    const ns = Math.min(1100, Math.round(W * H / 1400));
    S.stars = [];
    for (let i = 0; i < ns; i++) { const rr = Math.sqrt(R()) * S.Rmax, m = R() ** 3;
      S.stars.push({ r: rr, a: R() * Math.PI * 2, s: .5 + m * 1.6, b: .25 + .75 * R() ** 1.5 * (.5 + m), f: .5 + R() * 2.5, p: R() * 6.28, c: R() < .12 ? 1 : R() < .2 ? 2 : 0 }); }
    // cloud sprites
    S.clouds = []; const rc = rng(55);
    for (let i = 0; i < 17; i++) {
      const sc = .55 + rc() * 1.1, cw = 300 * sc, ch = 110 * sc, cc = mk(cw, ch), cx = cc.getContext('2d');
      for (let k = 0; k < 26; k++) { const px = cw * (.12 + .76 * rc()), py = ch * (.5 + .25 * (rc() - .3)) - Math.sin((px / cw) * Math.PI) * ch * .18, rad = ch * (.14 + .22 * rc()) * Math.sin((px / cw) * Math.PI + .3);
        const g = cx.createRadialGradient(px, py, 0, px, py, rad); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(.6, 'rgba(255,255,255,.22)'); g.addColorStop(1, 'rgba(255,255,255,0)'); cx.fillStyle = g; cx.fillRect(px - rad, py - rad, rad * 2, rad * 2); }
      cx.globalCompositeOperation = 'source-atop'; const sh = cx.createLinearGradient(0, 0, 0, ch); sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(60,60,70,.55)'); cx.fillStyle = sh; cx.fillRect(0, 0, cw, ch);
      S.clouds.push({ c: cc, x: rc() * (W + 600) - 300, y: H * (.03 + .4 * rc() ** 1.3), sc, v: 4 + 10 * sc, th: rc() * .85 });
    }
    S.clouds.sort((a, b) => a.sc - b.sc);
    S.cloudC = mk(W / 2, H * .62 / 2);
  }
  function update(e, dt) {
    const wx = e.weather;
    // shooting stars: sparse, only on clear dark nights
    if (!RM && e.dark > .6 && wx.cloud < .25 && wx.fog < .3) {
      S.nextShoot -= dt;
      if (S.nextShoot <= 0) { S.nextShoot = 25 + R() * 50; const ang = .35 + R() * .5, dir = R() < .5 ? 1 : -1, sp = 550 + R() * 450;
        S.shoot.push({ x: W * (.1 + .8 * R()), y: R() * H * .3, vx: Math.cos(ang) * sp * dir, vy: Math.sin(ang) * sp, life: 0, max: .5 + R() * .6, len: 70 + R() * 110 }); }
    }
    for (const s of S.shoot) { s.x += s.vx * dt; s.y += s.vy * dt; s.life += dt; }
    S.shoot = S.shoot.filter((s) => s.life < s.max);
    const drift = (RM ? .3 : 1) * (.35 + Math.abs(e.wind.x) * 1.2) * Math.sign(e.wind.dirS || 1);
    for (const cl of S.clouds) { cl.x += cl.v * drift * dt; if (cl.x > W + 320) cl.x = -cl.c.width - 300; if (cl.x < -cl.c.width - 320) cl.x = W + 300; }
  }
  function draw(x, e) {
    const wx = e.weather, px = e.par.x, py = e.par.y, t = e.t;
    const sg = x.createLinearGradient(0, 0, 0, e.horizonY + H * .1);
    sg.addColorStop(0, rgb(e.sky.top)); sg.addColorStop(.55, rgb(e.sky.mid)); sg.addColorStop(1, rgb(e.sky.hor));
    x.fillStyle = sg; x.fillRect(0, 0, W, H);
    const low = (1 - sstep(.05, .3, Math.abs(e.e))) * (1 - wx.cloud * .7);
    if (low > .01) { const hx = e.sun.x, hy = e.horizonY, hg = x.createRadialGradient(hx, hy, 0, hx, hy, W * .55); hg.addColorStop(0, `rgba(255,150,70,${.5 * low})`); hg.addColorStop(.4, `rgba(255,110,60,${.16 * low})`); hg.addColorStop(1, 'rgba(255,110,60,0)'); x.fillStyle = hg; x.fillRect(0, 0, W, H); }
    // stars
    const starV = clamp((e.dark - .15) / .85) * (1 - wx.cloud * .92) * (1 - wx.fog * .6);
    const rot = (e.g / DAY) * Math.PI * 2 * .35;
    if (starV > .01) {
      x.globalCompositeOperation = 'lighter';
      const cs = ['#ffffff', '#bcd0ff', '#ffe2c0'];
      for (const s of S.stars) {
        const a = s.a + rot, sx = S.pole.x + Math.cos(a) * s.r - px * 4, sy = S.pole.y + Math.sin(a) * s.r - py * 2;
        if (sx < -2 || sx > W + 2 || sy < -2 || sy > e.horizonY) continue;
        const tw = RM ? 1 : .65 + .35 * Math.sin(t * s.f + s.p);
        const al = s.b * tw * starV * (1 - sstep(H * .45, H * .72, sy) * .7);
        if (al < .02) continue;
        x.fillStyle = cs[s.c]; x.globalAlpha = Math.min(1, al); x.fillRect(sx - s.s / 2, sy - s.s / 2, s.s, s.s);
        if (s.s > 1.6 && al > .5) { x.globalAlpha = al * .25; x.drawImage(SPR.white, sx - 6, sy - 6, 12, 12); }
      }
      x.globalAlpha = 1;
      for (const s of S.shoot) { const k = 1 - s.life / s.max, d = Math.hypot(s.vx, s.vy), tx = s.x - s.vx / d * s.len, ty = s.y - s.vy / d * s.len; const g = x.createLinearGradient(s.x, s.y, tx, ty); g.addColorStop(0, `rgba(255,255,255,${k * starV * .8})`); g.addColorStop(1, 'rgba(180,200,255,0)'); x.strokeStyle = g; x.lineWidth = 1.3; x.beginPath(); x.moveTo(s.x, s.y); x.lineTo(tx, ty); x.stroke(); }
      x.globalCompositeOperation = 'source-over';
    }
    drawSun(x, e);
    if (e.moon.drawn) drawMoon(x, e);
    drawClouds(x, e);
  }
  function drawSun(x, e) {
    const s = e.sun; if (!s.drawn) return;
    const wx = e.weather, sx = s.x - e.par.x * 3, sy = s.y - e.par.y * 2, r = s.r, lowS = 1 - sstep(.05, .35, e.e), vis = 1 - wx.cloud * .8;
    const col = mix(hex('#fff2d8'), hex('#ff9440'), lowS);
    x.globalCompositeOperation = 'lighter';
    let g = x.createRadialGradient(sx, sy, r * .8, sx, sy, r * 9); g.addColorStop(0, rgb(col, .42 * vis)); g.addColorStop(.18, rgb(col, .13 * vis)); g.addColorStop(1, rgb(col, 0)); x.fillStyle = g; x.fillRect(sx - r * 9, sy - r * 9, r * 18, r * 18);
    g = x.createRadialGradient(sx, sy, r * .9, sx, sy, r * 1.9); g.addColorStop(0, rgb(mix(col, [255, 255, 255], .4), .5 * vis)); g.addColorStop(1, rgb(col, 0)); x.fillStyle = g; x.beginPath(); x.arc(sx, sy, r * 1.9, 0, 7); x.fill();
    x.globalCompositeOperation = 'source-over';
    g = x.createRadialGradient(sx, sy - r * .2, 0, sx, sy, r); g.addColorStop(0, rgb([255, 252, 242], vis)); g.addColorStop(.7, rgb(mix(col, [255, 255, 255], .55), vis)); g.addColorStop(1, rgb(mix(col, [255, 255, 255], .2), vis));
    x.fillStyle = g; x.beginPath(); x.arc(sx, sy, r, 0, 7); x.fill();
  }
  function drawMoon(x, e) {
    const m = e.moon, mx = m.x - e.par.x * 3, my = m.y - e.par.y * 2, r = m.r, vis = 1 - e.weather.cloud * .8, day = e.daylight;
    const c = moonC.getContext('2d'), R0 = 56; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 128, 128); c.translate(64, 64);
    c.fillStyle = `rgba(60,70,100,${.25 * (1 - day)})`; c.beginPath(); c.arc(0, 0, R0, 0, 7); c.fill();
    const k = m.level / 12;
    c.save(); c.beginPath(); c.arc(0, 0, R0, 0, 7); c.clip();
    c.fillStyle = '#f2f0e6';
    const s = m.waxing ? 1 : -1, ex = R0 * Math.abs(1 - 2 * k);
    c.beginPath(); c.arc(0, 0, R0, -Math.PI / 2, Math.PI / 2, s < 0);
    c.ellipse(0, 0, ex, R0, 0, Math.PI / 2, -Math.PI / 2, (k > .5) === (s < 0)); c.fill();
    c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(130,135,150,.14)';
    for (const [a, b, rr] of [[-14, -18, 14], [10, -6, 18], [-6, 18, 12], [22, 20, 8], [-26, 4, 9]]) { c.beginPath(); c.arc(a, b, rr, 0, 7); c.fill(); }
    c.restore();
    x.save(); x.globalCompositeOperation = 'lighter';
    const hg = x.createRadialGradient(mx, my, 0, mx, my, r * 8); hg.addColorStop(0, `rgba(200,215,255,${.3 * k * vis * (1 - day * .85)})`); hg.addColorStop(1, 'rgba(200,215,255,0)'); x.fillStyle = hg; x.fillRect(mx - r * 8, my - r * 8, r * 16, r * 16);
    x.restore();
    x.globalAlpha = vis * (1 - day * .55); x.drawImage(moonC, mx - r * 64 / R0, my - r * 64 / R0, r * 128 / R0, r * 128 / R0); x.globalAlpha = 1;
  }
  function drawClouds(x, e) {
    const wx = e.weather; if (wx.cloud < .02) return;
    const c = S.cloudC, cx = c.getContext('2d'), cw = c.width, ch = c.height, sc = .5;
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.globalCompositeOperation = 'source-over'; cx.clearRect(0, 0, cw, ch);
    for (const cl of S.clouds) {
      const a = clamp((wx.cloud - cl.th) / .18); if (a <= 0) continue;
      cx.globalAlpha = a; cx.drawImage(cl.c, cl.x * sc, cl.y * sc, cl.c.width * sc * (1 + wx.cloud * .5), cl.c.height * sc * (1 + wx.cloud * .4));
    }
    cx.globalAlpha = 1;
    if (wx.cloud > .6) { const o = (wx.cloud - .6) / .4, g = cx.createLinearGradient(0, 0, 0, ch); g.addColorStop(0, `rgba(255,255,255,${.9 * o})`); g.addColorStop(1, `rgba(255,255,255,${.25 * o})`); cx.fillStyle = g; cx.fillRect(0, 0, cw, ch); }
    cx.globalCompositeOperation = 'source-atop';
    const dl = e.daylight, lowS = 1 - sstep(.05, .3, Math.abs(e.e));
    let topC = mix(hex('#1a1f2c'), hex('#f4f2ee'), dl), botC = mix(hex('#07090e'), hex('#9ea6b2'), dl);
    topC = mix(topC, hex('#ffb37a'), lowS * .6 * (1 - wx.cloud * .5)); botC = mix(botC, hex('#6a3a4a'), lowS * .5);
    topC = mix(topC, hex('#3c4660'), e.moonI * .5 * (1 - dl));
    const stormK = wx.storm * .5 + Math.max(0, wx.cloud - .7);
    topC = mul(topC, 1 - stormK * .45); botC = mul(botC, 1 - stormK * .5);
    if (e.flash > .02) { topC = mix(topC, hex('#dfe6ff'), e.flash * .8); botC = mix(botC, hex('#8a94c0'), e.flash * .7); }
    const tg = cx.createLinearGradient(0, 0, 0, ch); tg.addColorStop(0, rgb(topC, .9)); tg.addColorStop(1, rgb(botC, .9)); cx.fillStyle = tg; cx.fillRect(0, 0, cw, ch);
    const L = e.light; if (L.I > .05) { const lg = cx.createRadialGradient(L.x * sc, L.y * sc, 0, L.x * sc, L.y * sc, cw * .5); lg.addColorStop(0, rgb(L.col, .5 * L.I)); lg.addColorStop(1, rgb(L.col, 0)); cx.fillStyle = lg; cx.fillRect(0, 0, cw, ch); }
    x.globalAlpha = .55 + .45 * wx.cloud; x.drawImage(c, 0, 0, W, H * .62); x.globalAlpha = 1;
  }
  /** Low in the sky, over the clouds: a broad afterglow on the sun's side (dawn / dusk), the rose
      twilight belt with the earth's blue shadow under it, a wide soft haze band down to the line. */
  function drawAir(x, e) {
    const hy = e.horizonY, wx = e.weather, clear = 1 - wx.cloud * .7, hz = mix(e.sky.hor, e.sky.mid, .35);
    const low = (1 - sstep(.02, .35, Math.abs(e.e + .03))) * clear;
    if (low > .01) {
      const sx = e.sun.x, g = x.createRadialGradient(sx, hy, 0, sx, hy, W * .8);
      g.addColorStop(0, `rgba(255,170,110,${.22 * low})`); g.addColorStop(.35, `rgba(240,140,120,${.1 * low})`); g.addColorStop(1, 'rgba(200,120,140,0)');
      x.fillStyle = g; x.fillRect(0, 0, W, hy + 2);
    }
    const tw = (1 - sstep(.0, .16, Math.abs(e.e + .05))) * clear;
    S.tw = tw;
    if (tw > .01) {
      const bh = H * .2, bg = x.createLinearGradient(0, hy - bh, 0, hy);
      bg.addColorStop(0, 'rgba(236,150,170,0)'); bg.addColorStop(.45, `rgba(236,160,175,${.2 * tw})`); bg.addColorStop(.78, `rgba(150,130,170,${.14 * tw})`); bg.addColorStop(1, `rgba(70,80,130,${.22 * tw})`);
      x.fillStyle = bg; x.fillRect(0, hy - bh, W, bh);
    }
    const night = e.moonI * (1 - e.daylight), hk = clamp(.4 + .45 * wx.fog + .25 * e.dawn + .15 * wx.rain + .1 * wx.snow + .2 * night + .15 * low);
    const hzc = mix(hz, mix(e.light.col, [30, 38, 62], .72), clamp(night * 1.2));
    S.haze = [hzc, clamp(hk * .55)];   // the colour the haze reaches at the line: the lower surface starts from it
    const hg = x.createLinearGradient(0, hy - H * .09, 0, hy);
    hg.addColorStop(0, rgb(hzc, 0)); hg.addColorStop(.7, rgb(hzc, clamp(hk * .32))); hg.addColorStop(1, rgb(hzc, clamp(hk * .55)));
    x.fillStyle = hg; x.fillRect(0, hy - H * .09, W, H * .09 + 1);
  }
  /** A faint haze in the air around a low sun or a bright moon (under the lower surface, so it ends with the sky). */
  function drawVeil(x, e) {
    const L = e.light, low = 1 - sstep(.08, .45, e.e), hy = e.horizonY;
    const a = L.kind === 'sun' ? .2 * L.I * low : .1 * L.I;
    if (a < .01) return;
    const rad = Math.max(W, H) * .6, cy = Math.min(L.y, hy), g = x.createRadialGradient(L.x, cy, 0, L.x, cy, rad);
    g.addColorStop(0, rgb(mix(L.col, [255, 255, 255], .3), a)); g.addColorStop(.4, rgb(L.col, a * .35)); g.addColorStop(1, rgb(L.col, 0));
    const x0 = Math.max(0, L.x - rad), x1 = Math.min(W, L.x + rad);
    if (x1 <= x0) return;
    x.fillStyle = g; x.fillRect(x0, 0, x1 - x0, hy + 2);
  }
  /** Below the old horizon line the sky just goes on as a plain, calm surface: nothing is drawn in it.
      A band straddling the line fades in the sky's own colour there (so stars, clouds, glows and a
      setting sun or moon dissolve into it without a seam), then it eases into the surface colour: the
      sky's upper blue by day, near-black at night, the dawn / dusk tints in between. */
  function drawBelow(x, e) {
    const hy = e.horizonY, { top, mid, hor } = e.sky, fade = H * .035;
    // the sky's colour right at the line: the base gradient there, under the twilight belt's foot and the haze band
    const f = hy / (hy + H * .1);
    let line = f <= .55 ? mix(top, mid, f / .55) : mix(mid, hor, (f - .55) / .45);
    line = mix(line, [70, 80, 130], .22 * (S.tw || 0));
    if (S.haze) line = mix(line, S.haze[0], S.haze[1]);
    const body = mul(mix(top, mid, .45), lerp(.6, 1, e.daylight));
    const y0 = hy - fade, span = H - y0, g = x.createLinearGradient(0, y0, 0, H), at = (y) => clamp((y - y0) / span);
    g.addColorStop(0, rgb(line, 0)); g.addColorStop(at(hy - fade * .45), rgb(line, .6)); g.addColorStop(at(hy + fade * .3), rgb(line, 1));
    const ease = H - hy;
    for (let i = 1; i <= 4; i++) { const k = i / 4; g.addColorStop(at(hy + fade * .3 + ease * .5 * k), rgb(mix(line, body, sstep(0, 1, k)))); }
    g.addColorStop(1, rgb(mul(body, .92)));
    x.fillStyle = g; x.fillRect(0, y0, W, span);
  }
  return { build, update, draw, drawAir, drawVeil, drawBelow };
})();


/* ======================================================================================= MOTION
   Durations: every base / layout duration goes through WC.dur (×4 with ?slow=4, short with reduced motion). */
const TS = RM ? .2 : qs.has('slow') ? (+qs.get('slow') || 4) : 1;
document.documentElement.style.setProperty('--ts', String(TS));
if (qs.has('nointro')) document.documentElement.classList.add('nointro');
Object.assign(WC, {
  qs, RM, TS,
  dur: (ms) => ms * TS,
  wait: (ms) => new Promise((r) => setTimeout(r, ms * TS)),
  util: { clamp, lerp, mod, sstep, rng, hex, mix, mul, rgb, mk, $ },
  /** The element's layout box without its transform (for FLIP flights). */
  rect(el) { let left = 0, top = 0; for (let e = el; e; e = e.offsetParent) { left += e.offsetLeft + (e !== el ? e.clientLeft : 0); top += e.offsetTop + (e !== el ? e.clientTop : 0); }
    return { left, top, width: el.offsetWidth, height: el.offsetHeight, right: left + el.offsetWidth, bottom: top + el.offsetHeight }; },
  /** The transform that puts box `from` onto box `to` (uniform scale by width, origin top left). */
  flyTo(from, to) { const s = to.width / from.width; return `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${s})`; },
});

/* ======================================================================================= WORDMARK
   Forged iron MUME (round 5) with a flush, slightly domed metal inlay in the channels (round 6 logo 3),
   now subtle mithril: silver with a faint cool cast by day, cooler silver by night (cross-faded through twilight). Reflective, never
   glowing: a bevel lit from the sun or moon and a glint band that drifts with the light; dims when there
   is little light. Any number of instances (full mark, a small corner mark, a plate); each redraws per
   frame while visible. el = a .wm element (the canvas and the COCKPIT line are made if missing). */
const WORDMARKS = [];
function Wordmark(root) {
  if (!root.querySelector('.wm-c')) root.insertAdjacentHTML('afterbegin', '<canvas class="wm-c" aria-hidden="true"></canvas>');
  if (!root.querySelector('.cockpit')) root.insertAdjacentHTML('beforeend', '<div class="cockpit"><span class="rule"></span><span>COCKPIT</span><span class="rule r"></span></div>');
  const wm = root.querySelector('.wm-c'), c = wm.getContext('2d');
  const WM = { ready: false };
  const text = (k, method) => { k.font = `900 ${WM.fs}px Cinzel`; WM.chars.forEach((ch, i) => k[method](ch, WM.pos[i], WM.base)); };
  function mask(inset, dy = 0) {
    const m = mk(WM.cssW * WM.d, WM.cssH * WM.d), k = m.getContext('2d');
    k.setTransform(WM.d, 0, 0, WM.d, 0, dy * WM.d); k.fillStyle = '#fff'; text(k, 'fillText');
    if (inset > 0) { k.globalCompositeOperation = 'destination-out'; k.lineJoin = 'round'; k.lineWidth = inset * 2; k.strokeStyle = '#000'; text(k, 'strokeText'); }
    return m;
  }
  function tint(src, col) { const m = mk(src.width, src.height), k = m.getContext('2d'); k.drawImage(src, 0, 0); k.globalCompositeOperation = 'source-in'; k.fillStyle = col; k.fillRect(0, 0, m.width, m.height); return m; }
  function bevel(m, r) {
    const w = m.width, h = m.height, b = mk(w, h), bx = b.getContext('2d', { willReadFrequently: true });
    bx.filter = `blur(${r}px)`; bx.drawImage(m, 0, 0); bx.filter = 'none';
    const A = bx.getImageData(0, 0, w, h).data, O = m.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const Hf = new Float32Array(w * h); for (let i = 0; i < w * h; i++) Hf[i] = clamp((A[i * 4 + 3] / 255 - .5) * 2.2);
    const out = [0, 1, 2, 3].map(() => new ImageData(w, h));
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, a = O[i * 4 + 3]; if (!a) continue;
      const gx = (Hf[i + 1] - Hf[i - 1]) * r, gy = (Hf[i + w] - Hf[i - w]) * r, n = 1 / Math.hypot(gx, gy, 1);
      const v = [Math.max(0, -gx * n), Math.max(0, gx * n), Math.max(0, gy * n), Math.max(0, -gy * n)];
      for (let k = 0; k < 4; k++) { const dd = out[k].data, j = i * 4; dd[j] = dd[j + 1] = dd[j + 2] = 255; dd[j + 3] = v[k] * a; }
    }
    return out.map((id) => { const cc = mk(w, h); cc.getContext('2d').putImageData(id, 0, 0); return cc; });
  }
  function lit(layers, ux, uy, col, a, op = 'source-over') {
    if (a <= .005) return;
    const tmp = WM.tmp, k = tmp.getContext('2d'), wts = [Math.max(0, ux), Math.max(0, -ux), Math.max(0, -uy), Math.max(0, uy)];
    k.setTransform(1, 0, 0, 1, 0, 0); k.globalCompositeOperation = 'source-over'; k.globalAlpha = 1; k.clearRect(0, 0, tmp.width, tmp.height);
    for (let i = 0; i < 4; i++) if (wts[i] > .01) { k.globalAlpha = Math.min(1, wts[i]); k.drawImage(layers[i], 0, 0); }
    k.globalAlpha = 1; k.globalCompositeOperation = 'source-in'; k.fillStyle = rgb(col); k.fillRect(0, 0, tmp.width, tmp.height);
    c.save(); c.globalCompositeOperation = op; c.globalAlpha = a; c.drawImage(tmp, 0, 0, WM.cssW, WM.cssH); c.restore();
  }
  function light() {
    const L = env.light || {}, I = clamp(L.I || 0), amb = .45 + .35 * env.daylight;
    const r = WM.rect || { cx: WM.cssW / 2, cy: 0 };
    const dx = (L.x ?? r.cx) - r.cx, dy = (L.y ?? 0) - r.cy, dd = Math.hypot(dx, dy) || 1;
    let ux = dx / dd * I, uy = dy / dd * I - amb; const n = Math.hypot(ux, uy) || 1; ux /= n; uy /= n;
    const skyCol = mix([176, 192, 228], [255, 244, 228], env.daylight);
    const col = mix(skyCol, L.col || skyCol, clamp(I * 1.2));
    const sx = clamp(.5 + dx / ((env.W || 1440) * 1.1) + (env.par ? env.par.x : 0) * .06, .04, .96);
    return { ux, uy, I, col, sx };
  }
  function ironBody(t) {
    const { fs, cssW, cssH } = WM;
    c.save(); c.shadowColor = 'rgba(0,0,0,.85)'; c.shadowBlur = fs * .18; c.shadowOffsetY = fs * .05; c.fillStyle = '#0b0807'; text(c, 'fillText'); c.restore();
    for (let k = 4; k >= 1; k--) { c.fillStyle = `rgb(${14 + k * 3},${11 + k * 2},${9 + k * 2})`; c.save(); c.translate(0, k * fs * .009); text(c, 'fillText'); c.restore(); }
    const top = WM.base - fs * .72, g = c.createLinearGradient(0, top, 0, WM.base);
    [[0, '#635e58'], [.18, '#38342f'], [.6, '#221f1c'], [1, '#141210']].forEach(([o, col]) => g.addColorStop(o, col));
    c.save(); c.translate(0, -Math.max(1, fs * .011)); c.fillStyle = WM.cssW < 220 ? 'rgba(236,240,236,.8)' : 'rgba(232,236,232,.5)'; text(c, 'fillText'); c.restore();
    c.fillStyle = g; text(c, 'fillText');
    c.save(); c.globalCompositeOperation = 'source-atop'; const sh = c.createLinearGradient(WM.x0, 0, WM.x1, 0), spp = RM ? .5 : (t * .05) % 1;
    sh.addColorStop(0, 'rgba(230,240,240,0)'); sh.addColorStop(clamp(spp - .08), 'rgba(230,240,240,0)'); sh.addColorStop(clamp(spp), 'rgba(230,240,240,.06)'); sh.addColorStop(clamp(spp + .08), 'rgba(230,240,240,0)'); sh.addColorStop(1, 'rgba(230,240,240,0)');
    c.fillStyle = sh; c.fillRect(0, 0, cssW, cssH); c.restore();
    return top;
  }
  function layout() {
    const cssW = wm.clientWidth || 600, cssH = Math.round(cssW * .34), d = Math.min(devicePixelRatio || 1, 2) * (cssW < 220 ? 1.5 : 1);
    wm.width = Math.round(cssW * d); wm.height = Math.round(cssH * d);
    const fs = cssW * .215;
    c.font = `900 ${fs}px Cinzel`;
    const chars = ['M', 'U', 'M', 'E'], sp = fs * .045, ws = chars.map((ch) => c.measureText(ch).width);
    const total = ws.reduce((a, b) => a + b, 0) + sp * 3;
    let cx = (cssW - total) / 2; const pos = chars.map((ch, i) => { const p = cx; cx += ws[i] + sp; return p; });
    Object.assign(WM, { cssW, cssH, d, fs, chars, pos, base: cssH * .84, x0: (cssW - total) / 2, x1: (cssW + total) / 2, core: mk(cssW * d, cssH * d), tmp: mk(cssW * d, cssH * d) });
    WM.coreIn = fs * .049; WM.rimW = Math.max(.9, fs * .0125); WM.lip = Math.max(.8, fs * .0085);
    measure();
  }
  function measure() { const r = wm.getBoundingClientRect(); WM.rect = { cx: r.left + r.width / 2, cy: r.top + r.height * .6 }; }
  function innerShadow(col, dy) {
    const { cssW, cssH, d, fs } = WM, sh = mk(cssW * d, cssH * d), sx = sh.getContext('2d');
    sx.fillStyle = col; sx.fillRect(0, 0, sh.width, sh.height); sx.globalCompositeOperation = 'destination-out'; sx.drawImage(mask(WM.coreIn, dy), 0, 0);
    const sh2 = mk(cssW * d, cssH * d), s2 = sh2.getContext('2d'); s2.filter = `blur(${fs * .012 * d}px)`; s2.drawImage(sh, 0, 0); s2.filter = 'none';
    return sh2;
  }
  function metal(stops, seed) {
    const { cssW, cssH, d, fs } = WM, m = mk(cssW * d, cssH * d), k = m.getContext('2d'), top = WM.base - fs * .72;
    k.drawImage(WM.coreM, 0, 0); k.globalCompositeOperation = 'source-in';
    const g = k.createLinearGradient(0, top * d, 0, WM.base * d); stops.forEach(([o, col]) => g.addColorStop(o, col));
    k.fillStyle = g; k.fillRect(0, 0, m.width, m.height);
    k.globalCompositeOperation = 'source-atop'; const r = rng(seed);
    for (let i = 0; i < m.height * 3; i++) { const v = r(), y = r() * m.height, x = r() * m.width; k.fillStyle = v > .5 ? `rgba(255,255,255,${.015 + r() * .035})` : `rgba(0,0,0,${.02 + r() * .04})`; k.fillRect(x - fs * d * .3, y, fs * d * (.15 + r() * .5), .6); }
    k.globalAlpha = .45; k.drawImage(WM.innerC, 0, 0); k.globalAlpha = 1;
    return m;
  }
  function build() {
    if (!wm.clientWidth) return; // not laid out (hidden): built when shown
    layout();
    const { fs, d, coreIn, rimW, lip } = WM;
    WM.coreM = mask(coreIn);
    WM.rimC = tint(mask(coreIn - rimW), '#040405');
    WM.lipC = tint(mask(coreIn - rimW, lip), INLAY.lip || 'rgba(206,232,234,.55)');
    WM.innerC = innerShadow('#05080a', fs * .022);
    WM.day = metal(INLAY.day, 7); WM.night = metal(INLAY.night, 7);
    WM.bv = bevel(WM.coreM, Math.max(1, fs * .009 * d));
    WM.builtW = wm.clientWidth; WM.ready = true; lastRivet = -1;
  }
  let lastRivet = -1, visT = 0, vis = true;
  function draw(t) {
    // skip when invisible (checked a few times a second), rebuild when the size changed
    if (t - visT > .3) { visT = t; vis = wm.checkVisibility ? wm.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : !!wm.offsetParent;
      if (vis && fontsReady && wm.clientWidth && wm.clientWidth !== WM.builtW) build(); if (vis && WM.ready) measure(); }
    if (!vis || !WM.ready) return;
    const { cssW, cssH, d, fs, x0, x1 } = WM, L = light();
    c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, cssW, cssH); c.textBaseline = 'alphabetic';
    const top = ironBody(t);
    c.drawImage(WM.lipC, 0, 0, cssW, cssH);
    c.drawImage(WM.rimC, 0, 0, cssW, cssH);
    const s = sstep(.25, .85, env.dark), bright = clamp(Math.max(.5 + .5 * env.daylight, .45 + .4 * L.I, cssW < 220 ? .8 : 0));
    const k = WM.core.getContext('2d'); k.setTransform(1, 0, 0, 1, 0, 0); k.globalCompositeOperation = 'source-over'; k.globalAlpha = 1; k.clearRect(0, 0, WM.core.width, WM.core.height);
    if (s < .999) k.drawImage(WM.day, 0, 0);
    if (s > .001) { k.globalAlpha = s; k.drawImage(WM.night, 0, 0); k.globalAlpha = 1; }
    k.setTransform(d, 0, 0, d, 0, 0); k.globalCompositeOperation = 'source-atop';
    const hx = lerp(x0, x1, L.sx), gw = fs * .9, gg = k.createLinearGradient(hx - gw, top, hx + gw, WM.base), ga = .18 + .3 * L.I;
    gg.addColorStop(0, rgb(L.col, 0)); gg.addColorStop(.43, rgb(L.col, ga * .25)); gg.addColorStop(.5, rgb(mix(L.col, [255, 255, 255], .5), ga)); gg.addColorStop(.57, rgb(L.col, ga * .25)); gg.addColorStop(1, rgb(L.col, 0));
    k.fillStyle = gg; k.fillRect(0, 0, cssW, cssH);
    if (bright < 1) { k.fillStyle = `rgba(4,6,8,${(1 - bright) * .9})`; k.fillRect(0, 0, cssW, cssH); }
    k.setTransform(1, 0, 0, 1, 0, 0); k.globalCompositeOperation = 'source-over';
    c.drawImage(WM.core, 0, 0, cssW, cssH);
    lit(WM.bv, L.ux, L.uy, mix(L.col, [250, 255, 255], .4), .4 + .3 * L.I);
    lit(WM.bv, -L.ux, -L.uy, [0, 0, 0], .35);
    const sq = Math.round(s * 20) / 20;
    if (sq !== lastRivet) {
      lastRivet = sq; const p = (i) => rgb(mix(hex(INLAY.rivet.day[i]), hex(INLAY.rivet.night[i]), sq));
      root.style.setProperty('--rv-hi', p(0)); root.style.setProperty('--rv-mid', p(1)); root.style.setProperty('--rv-lo', p(2));
    }
  }
  const inst = { el: root, canvas: wm, build, draw, get ready() { return WM.ready; } };
  WORDMARKS.push(inst);
  if (fontsReady) build();
  return inst;
}
let fontsReady = false;
document.fonts.load('900 100px Cinzel').then(() => document.fonts.ready).then(() => { fontsReady = true; WORDMARKS.forEach((w) => w.build()); });
WC.Wordmark = Wordmark;
WC.wordmarks = WORDMARKS;

/* ======================================================================================= SKY LOOP
   WC.sky.start(): makes the scene canvas, vignette, grain, almanac (bottom right) and demo panel, then
   runs the frame loop (pauses when the tab is hidden). WC.sky.onFrame(fn(env, t, dt)) for page hooks. */
const hooks = [];
let started = false, last = performance.now(), running = false, lastUi = 0;
function buildAll() {
  W = innerWidth; H = innerHeight; DPR = Math.min(devicePixelRatio || 1, 1.5);
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  env.W = W; env.H = H; env.DPR = DPR;
  SKY.build(env); WEATHER.build(env);
}
function frame(now) {
  if (document.hidden) { running = false; return; }
  const dt = clamp((now - last) / 1000, 0, .05); last = now;
  const t = now / 1000;
  updateEnv(dt, t);
  SKY.update(env, dt);
  const x = ctx; x.setTransform(DPR, 0, 0, DPR, 0, 0);
  SKY.draw(x, env); WEATHER.drawBack(x, env); SKY.drawAir(x, env); SKY.drawVeil(x, env); SKY.drawBelow(x, env); WEATHER.drawFront(x, env);
  for (const w of WORDMARKS) w.draw(t);
  for (const h of hooks) h(env, t, dt);
  if (now - lastUi > 250) { lastUi = now; demoUi(); almanac(); }
  requestAnimationFrame(frame);
}
function loop() { if (running) return; running = true; last = performance.now(); requestAnimationFrame(frame); }
const el = (tag, attrs = {}, html = '') => { const e = document.createElement(tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (html) e.innerHTML = html; return e; };
WC.el = el;
WC.sky = {
  env, clk, setHour, setMonth, gameG,
  onFrame(fn) { hooks.push(fn); },
  start(opts = {}) {
    if (started) return; started = true;
    cv = el('canvas', { id: 'scene', 'aria-hidden': 'true' }); ctx = cv.getContext('2d');
    document.body.prepend(cv, el('div', { class: 'vignette' }), el('div', { class: 'grain' }));
    if (opts.almanac !== false) document.body.append(el('aside', { id: 'almanac', 'aria-live': 'off' }, '<div class="d" id="almD"></div><div class="m" id="almM"></div><div class="v">WebCockpit 0.2.6</div>'));
    document.body.append(el('div', { id: 'toast' }));
    if (opts.demo !== false) buildDemo();
    grain();
    buildAll(); updateEnv(0, performance.now() / 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) loop(); });
    let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { buildAll(); updateEnv(0, performance.now() / 1000); WORDMARKS.forEach((w) => w.build()); }, 120); });
    loop();
    handOff();
  },
};
/** Hands the intro animations over to plain styles when they end (base.css "#brand.in …"). */
function handOff() {
  for (const id of ['brand', 'menuPanel', 'quote', 'almanac']) { const e = document.getElementById(id); if (!e || e.dataset.handoff) continue; e.dataset.handoff = '1';
    if (qs.has('nointro')) e.classList.add('in'); else e.addEventListener('animationend', () => e.classList.add('in'), { once: true }); }
}
function grain() {
  const c = mk(160, 160), x = c.getContext('2d'), id = x.createImageData(160, 160);
  for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 40; }
  x.putImageData(id, 0, 0); document.documentElement.style.setProperty('--grain', `url(${c.toDataURL()})`);
}
WC.grain = grain;

/* ======================================================================================= ALMANAC */
const ord = (n) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
let almKey = '';
function almanac() {
  const d0 = document.getElementById('almD'); if (!d0) return;
  const e = env, g = Math.max(0, Math.floor(e.g)), yr = Math.floor(g / YEAR), wd = WEEKDAYS[(e.month * 30 + e.day - 1) % 7];
  const hh = Math.floor(e.h), mm = Math.floor((e.h - hh) * 60);
  const d = `${wd}, the ${ord(e.day)} of ${e.monthName}`, m = `${hh % 12 || 12}:${String(mm).padStart(2, '0')}${hh < 12 ? 'am' : 'pm'} · ${e.period} · T.A. ${yr}`;
  if (d + m === almKey) return; almKey = d + m;
  d0.textContent = d; document.getElementById('almM').textContent = m;
}

/* ======================================================================================= DEMO panel
   Bottom left, collapsed. Time, month, season, weather, moon, fast time, a readout; WC.demoExtra(html)
   adds page-specific controls (an element is returned). */
function buildDemo() {
  const demo = el('div', { id: 'demo' }, `
  <div class="body">
    <label>Time <input type="range" id="dTime" min="0" max="24" step="0.05"><span id="dTimeV"></span></label>
    <label>Month <select id="dMonth"></select><span></span></label>
    <div class="seasons"><span>Season</span><button data-s="0">winter</button><button data-s="1">spring</button><button data-s="2">summer</button><button data-s="3">autumn</button></div>
    <label>Weather <select id="dWeather"><option value="auto">auto (director)</option><option>clear</option><option value="fair">fair (light clouds)</option><option>clouds</option><option value="rain">rain (light)</option><option>storm</option><option>snow</option><option value="fog">fog (dawn mist)</option></select><span></span></label>
    <label>Moon <select id="dMoon"><option value="auto">real model</option></select><span></span></label>
    <div class="row2"><label style="display:flex;gap:6px;margin:0"><input type="checkbox" id="dFast"> fast time ×600</label><button id="dReal">real time</button></div>
    <div class="ro" id="dRo"></div>
    <div class="extra" id="dExtra"></div>
  </div>
  <button id="dToggle">DEMO ▸</button>`);
  document.body.append(demo);
  const g = (s) => demo.querySelector(s);
  g('#dToggle').addEventListener('click', () => { demo.classList.toggle('open'); g('#dToggle').textContent = demo.classList.contains('open') ? 'DEMO ▾' : 'DEMO ▸'; });
  if (qs.has('demo')) g('#dToggle').click();
  g('#dMonth').innerHTML = MONTHS.map((m, i) => `<option value="${i}">${m} · ${seasonOf(i)}</option>`).join('');
  g('#dMoon').innerHTML += PHASES.map((p, i) => `<option value="${i}">${p}</option>`).join('');
  g('#dTime').addEventListener('input', (e) => setHour(+e.target.value));
  g('#dMonth').addEventListener('change', (e) => setMonth(+e.target.value));
  demo.querySelectorAll('.seasons button').forEach((b) => b.addEventListener('click', () => setMonth(+b.dataset.s * 3 + 1)));
  g('#dWeather').addEventListener('change', (e) => { clk.weather = e.target.value; });
  g('#dMoon').addEventListener('change', (e) => { clk.phase = e.target.value; });
  g('#dFast').addEventListener('change', (e) => { const gg = gameG(); clk.speed = e.target.checked ? 600 : 1; rebase(gg); });
  g('#dReal').addEventListener('click', () => { clk.speed = 1; g('#dFast').checked = false; clk.weather = 'auto'; clk.phase = 'auto'; g('#dWeather').value = 'auto'; g('#dMoon').value = 'auto'; rebase(realG()); });
  g('#dWeather').value = clk.weather; g('#dMoon').value = clk.phase; g('#dFast').checked = clk.speed > 1;
}
WC.demoExtra = (html) => { let x = document.getElementById('dExtra'); if (!x) { buildDemoShell(); x = document.getElementById('dExtra'); } const d = el('div', {}, html); x.append(d); return d; };
function buildDemoShell() { // the in-game demo panel: only the extra section
  const demo = el('div', { id: 'demo' }, '<div class="body"><div class="extra" id="dExtra"></div></div><button id="dToggle">DEMO ▸</button>');
  document.body.append(demo);
  demo.querySelector('#dToggle').addEventListener('click', () => { demo.classList.toggle('open'); demo.querySelector('#dToggle').textContent = demo.classList.contains('open') ? 'DEMO ▾' : 'DEMO ▸'; });
  if (qs.has('demo')) demo.querySelector('#dToggle').click();
}
const f2 = (v) => v.toFixed(2).replace(/^0/, '');
function demoUi() {
  const demo = document.getElementById('demo'); if (!demo || !demo.classList.contains('open') || !document.getElementById('dTime')) return;
  const e = env, hh = Math.floor(e.h), mm = Math.floor((e.h - hh) * 60), wx = e.weather, w = e.wind, m = e.moon;
  const g = (s) => demo.querySelector(s);
  if (document.activeElement !== g('#dTime')) g('#dTime').value = e.h.toFixed(2);
  g('#dTimeV').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  if (document.activeElement !== g('#dMonth')) g('#dMonth').value = e.month;
  demo.querySelectorAll('.seasons button').forEach((b) => b.classList.toggle('on', SEASONS[+b.dataset.s] === e.season));
  const arrow = w.x > .03 ? '→ E' : w.x < -.03 ? '← W' : '·';
  g('#dRo').textContent =
    `${e.monthName} ${e.day} · ${e.season} · ${e.period}\n` +
    `sun elev ${e.e.toFixed(2)} · light: ${e.light.kind} ${f2(e.light.I)}\n` +
    `moon ${m.phase} (${m.level}/12) ${m.visible ? 'visible' : m.up ? 'up, hidden' : 'below'}\n` +
    `weather ${wx.auto ? 'auto → ' : ''}${wx.state}\n` +
    `wind ${arrow} ${f2(Math.abs(w.x))}`;
}

/* ======================================================================================= KEYS
   A stack of keyboard layers; the top one gets the keys. A layer: { key(e) → true when handled, back() }.
   Esc / Backspace not handled by key() call back(). In a text field only Esc reaches the stack (it blurs
   the field first; a second Esc goes back). While WC.busy (a transition) keys are swallowed. */
const layers = [];
WC.busy = false;
WC.keys = {
  push(layer) { layers.push(layer); return () => { const i = layers.indexOf(layer); if (i >= 0) layers.splice(i, 1); }; },
  get top() { return layers[layers.length - 1]; },
  layers,
};
WC.back = () => { const L = layers[layers.length - 1]; if (L && L.back) L.back(); };
addEventListener('keydown', (e) => {
  const t = e.target;
  if (t.closest && t.closest('#demo') && e.key !== 'Escape') return;
  if (t.matches && t.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select, [contenteditable]')) {
    if (e.key === 'Escape') { t.blur(); e.preventDefault(); }
    return;
  }
  if (WC.busy) { if (!e.ctrlKey && !e.metaKey) e.preventDefault(); return; }
  const L = layers[layers.length - 1]; if (!L) return;
  if (L.key && L.key(e)) { e.preventDefault(); return; }
  if ((e.key === 'Escape' || e.key === 'Backspace') && L.back) { L.back(); e.preventDefault(); }
});
/** Letter shortcuts: map {n: fn, …}; true when one fired. No modifiers. */
WC.shortcut = (e, map) => { if (e.ctrlKey || e.altKey || e.metaKey) return false; const f = map[e.key.length === 1 ? e.key.toLowerCase() : e.key]; if (!f) return false; f(e); return true; };
let flashTs = new WeakMap();
/** A short message in a .flash element (fades after `ms`). kind 'fail' tints it. */
WC.flash = (fl, msg, { kind = '', ms = 2200 } = {}) => {
  if (!fl) return; fl.textContent = msg; fl.classList.toggle('fail', kind === 'fail'); fl.classList.add('show');
  clearTimeout(flashTs.get(fl)); flashTs.set(fl, setTimeout(() => fl.classList.remove('show'), ms));
};
WC.toast = (html, ms = 2400) => { const t = document.getElementById('toast'); if (!t) return; t.innerHTML = html; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), ms); };

/** A selectable list over `root`'s `item` elements: .on marks the chosen one (restrained: the text brightens).
    opts: item ('.row'), onActivate(i, el), onChange(i, el), hover (select on hover), activateOn ('click'|'dblclick'),
    wrap. Returns { i, items, key(e), set(i), refresh() }. Rows may be re-rendered: call refresh(). */
WC.list = (root, opts = {}) => {
  const { item = '.row', onActivate, onChange, hover = false, activateOn = 'dblclick', wrap = false } = opts;
  const api = { i: 0, items: [] };
  api.set = (i, quiet = false) => {
    const n = api.items.length; if (!n) { api.i = 0; return; }
    api.i = wrap ? mod(i, n) : clamp(i, 0, n - 1);
    api.items.forEach((x, k) => x.classList.toggle('on', k === api.i));
    if (!quiet) api.items[api.i].scrollIntoView({ block: 'nearest' });
    if (onChange) onChange(api.i, api.items[api.i]);
  };
  api.refresh = () => { api.items = [...root.querySelectorAll(item)]; api.set(api.i, true); };
  const idx = (e) => { const r = e.target.closest(item); return r ? api.items.indexOf(r) : -1; };
  if (hover) root.addEventListener('pointerover', (e) => { const k = idx(e); if (k >= 0 && k !== api.i) api.set(k, true); });
  root.addEventListener('click', (e) => { const k = idx(e); if (k < 0) return; api.set(k, true); if (activateOn === 'click' && onActivate) onActivate(k, api.items[k]); });
  root.addEventListener('dblclick', (e) => { const k = idx(e); if (k >= 0 && activateOn === 'dblclick' && onActivate) onActivate(k, api.items[k]); });
  api.key = (e) => {
    switch (e.key) {
      case 'ArrowDown': api.set(api.i + 1); return true;
      case 'ArrowUp': api.set(api.i - 1); return true;
      case 'PageDown': api.set(api.i + 10); return true;
      case 'PageUp': api.set(api.i - 10); return true;
      case 'Home': api.set(0); return true;
      case 'End': api.set(api.items.length - 1); return true;
      case 'Enter': case ' ': if (onActivate && api.items.length) onActivate(api.i, api.items[api.i]); return true;
    }
    return false;
  };
  api.refresh();
  return api;
};

/* ======================================================================================= BOXES
   WC.decorate(root): for every .lp inside (or root itself) adds the four corner brackets, the hood
   (data-hood="Title"; data-hood="" → the plain plate with an engraved line) and Back (data-back). */
const BACK_SVG = '<svg viewBox="0 0 16 16"><path d="M9.8 3.2 5 8l4.8 4.8"/></svg>';
WC.decorate = (root = document) => {
  const boxes = root.matches && root.matches('.lp') ? [root] : [...root.querySelectorAll('.lp')];
  for (const b of boxes) {
    if (b.dataset.decorated) continue; b.dataset.decorated = '1';
    b.insertAdjacentHTML('afterbegin', '<i class="br b1"></i><i class="br b2"></i><i class="br b3"></i><i class="br b4"></i>');
    if ('hood' in b.dataset) {
      const h = el('div', { class: 'hood' + (b.dataset.hood ? '' : ' plain') }, b.dataset.hood ? `<span class="t">${b.dataset.hood}</span>` : '<i class="eng"></i>');
      b.children[3].after(h);
    }
    if ('back' in b.dataset) {
      const bb = el('button', { class: 'backbtn', 'aria-label': 'Back (Esc)', type: 'button' }, `${BACK_SVG}Back`);
      bb.addEventListener('click', () => WC.back());
      (b.querySelector('.hood') || b.children[3]).after(bb);
    }
  }
};

/* ======================================================================================= START MENU
   WC.startMenu({ onActivate(key) → true if the page handled it, profile: 'gibur' }) builds #stage:
   #brand (.wm, the full wordmark), #menuPanel (the Lykta panel, plain hood), #quote. Keys: ↑↓ Home End,
   Enter/Space, the letters E P S H L C A. Unhandled items flash "… — not in this mockup".
   Returns { stage, brand, panel, quote, wordmark, items, select(i), cur, flash(msg) }. */
const ICONS = {
  enter: '<svg class="ic" viewBox="0 0 22 22"><path d="M4.5 20V10.5a6.5 6.5 0 0 1 13 0V20"/><path d="M2.5 20h17"/><path d="M8 20v-8.5a3 3 0 0 1 6 0V20"/><path d="M12.4 16.4h.1"/></svg>',
  profile: '<svg class="ic" viewBox="0 0 18 18"><circle cx="9" cy="5.6" r="3"/><path d="M3 16c0-3.6 2.7-5.6 6-5.6s6 2 6 5.6"/></svg>',
  scripts: '<svg class="ic" viewBox="0 0 18 18"><path d="M5.5 2.5h8a2 2 0 0 1 2 2v1.5h-2"/><path d="M13.5 4.5v9a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-1.5h8v1.5a2 2 0 0 0 2 2"/><path d="M5.5 2.5a2 2 0 0 0-2 2v7.5"/><path d="M6.5 6.5h4.5M6.5 9h4.5"/></svg>',
  history: '<svg class="ic" viewBox="0 0 18 18"><path d="M4.5 2h9M4.5 16h9M5.5 2c0 4 7 5 7 7s-7 3-7 7M12.5 2c0 4-7 5-7 7s7 3 7 7"/></svg>',
  spotlights: '<svg class="ic" viewBox="0 0 18 18"><path d="M9 1.5l1.7 5.8 5.8 1.7-5.8 1.7L9 16.5l-1.7-5.8L1.5 9l5.8-1.7z"/></svg>',
  credits: '<svg class="ic" viewBox="0 0 18 18"><path d="M15.5 2.5C9 3 5.2 8 4 14.5L2.6 16.2"/><path d="M15.5 2.5c-.8 5.2-4.8 9.2-10.6 10.4"/><path d="M8.5 9.5l-2-1.2"/></svg>',
  about: '<svg class="ic" viewBox="0 0 18 18"><circle cx="9" cy="9" r="7"/><path d="M9 8.2v4.8M9 5.4v.1"/></svg>',
};
WC.ICONS = ICONS;
const QUOTES = [
  ['Not all those who wander are lost.', 'Bilbo Baggins'], ["It's a dangerous business, Frodo, going out of your door.", 'Bilbo Baggins'],
  ['The Road goes ever on and on.', 'Bilbo Baggins'], ['Faithless is he that says farewell when the road darkens.', 'Gimli'],
  ['All we have to decide is what to do with the time that is given us.', 'Gandalf'], ['Despair is only for those who see the end beyond all doubt.', 'Gandalf'],
  ['The world is indeed full of peril, and in it there are many dark places.', 'Haldir'], ['Courage is found in unlikely places.', 'Gildor Inglorion'],
];
WC.startMenu = (opts = {}) => {
  const profile = opts.profile ?? 'gibur';
  const stage = el('main', { id: 'stage' }, `
    <header id="brand" class="wm" aria-label="MUME Cockpit"></header>
    <section class="lp" id="menuPanel" aria-label="Start menu" data-hood="">
      <div class="win" id="menuWin">
        <ul class="menu" id="menu" role="menu">
          <li class="item prime" role="menuitem" data-k="enter">${ICONS.enter}<span class="lbl"><u class="sk">E</u>nter MUME</span></li>
          <li class="sep" role="separator" aria-hidden="true"></li>
          <li class="item" role="menuitem" data-k="profile">${ICONS.profile}<span class="lbl"><u class="sk">P</u>rofile</span></li>
          <li class="item" role="menuitem" data-k="scripts">${ICONS.scripts}<span class="lbl"><u class="sk">S</u>cripts</span>${profile ? `<span class="ctx">(${profile})</span>` : ''}</li>
          <li class="item" role="menuitem" data-k="history">${ICONS.history}<span class="lbl"><u class="sk">H</u>istory</span></li>
          <li class="item" role="menuitem" data-k="spotlights">${ICONS.spotlights}<span class="lbl">Spot<u class="sk">l</u>ights</span></li>
          <li class="item" role="menuitem" data-k="credits">${ICONS.credits}<span class="lbl"><u class="sk">C</u>redits</span></li>
          <li class="item" role="menuitem" data-k="about">${ICONS.about}<span class="lbl"><u class="sk">A</u>bout</span></li>
        </ul>
        <div class="flash" id="flash"></div>
      </div>
    </section>
    <blockquote id="quote"><p id="qtext"></p><span class="orn" aria-hidden="true"></span><cite id="qby"></cite></blockquote>`);
  const scene = document.getElementById('scene');
  if (scene) document.querySelector('.grain').after(stage); else document.body.prepend(stage);
  WC.decorate(stage);
  const brand = stage.querySelector('#brand'), panel = stage.querySelector('#menuPanel'), quoteEl = stage.querySelector('#quote');
  const wordmark = Wordmark(brand);
  const items = [...stage.querySelectorAll('#menu .item')];
  const api = { stage, brand, panel, quote: quoteEl, wordmark, items, cur: 0, active: true };
  api.select = (i) => { api.cur = mod(i, items.length); items.forEach((x, k) => x.classList.toggle('on', k === api.cur)); env.enter = api.cur === 0; };
  api.flash = (msg) => WC.flash(stage.querySelector('#flash'), msg, { ms: 1800 });
  const activate = (k) => {
    const key = items[k].dataset.k;
    if (opts.onActivate && opts.onActivate(key, items[k])) return;
    if (key === 'enter') { WC.toast('The way opens.<small>connecting to MUME would start here — not in this mockup</small>'); return; }
    api.flash(`${items[k].querySelector('.lbl').textContent.trim()} — not in this mockup`);
  };
  api.activate = activate;
  items.forEach((x, k) => { x.addEventListener('pointerenter', () => { if (api.active && k !== api.cur) api.select(k); }); x.addEventListener('click', () => { if (!api.active || WC.busy) return; api.select(k); activate(k); }); });
  const LETTERS = { e: 0, p: 1, s: 2, h: 3, l: 4, c: 5, a: 6 };
  api.layer = {
    key(e) {
      const k = e.key;
      if (k === 'ArrowDown') api.select(api.cur + 1); else if (k === 'ArrowUp') api.select(api.cur - 1);
      else if (k === 'Home') api.select(0); else if (k === 'End') api.select(items.length - 1);
      else if (k === 'Enter' || k === ' ') activate(api.cur);
      else if (!e.ctrlKey && !e.altKey && !e.metaKey && LETTERS[k.toLowerCase()] !== undefined) { const m = LETTERS[k.toLowerCase()]; api.select(m); activate(m); }
      else return false;
      return true;
    },
  };
  WC.keys.push(api.layer);
  handOff();
  api.select(qs.has('sel') ? +qs.get('sel') : 0);
  // quote A: the ink follows the sky behind it (the build derives it from the sky model instead)
  const q = QUOTES[qs.has('q') ? +qs.get('q') : Math.floor(Math.random() * QUOTES.length)];
  quoteEl.querySelector('#qtext').textContent = q[0]; quoteEl.querySelector('#qby').textContent = q[1];
  const p = quoteEl.querySelector('#qtext');
  const probe = mk(64, 3), px = probe.getContext('2d', { willReadFrequently: true });
  function sample() {
    if (document.hidden || !cv || !cv.width) return;
    const r = p.getBoundingClientRect(), k = cv.width / innerWidth; if (!r.width) return;
    // three thin rows of the sky under the text, scaled into a small CPU canvas (one readback)
    [.2, .5, .8].forEach((f, i) => px.drawImage(cv, r.left * k, (r.top + r.height * f) * k, r.width * k, 1, 0, i, 64, 1));
    const d = px.getImageData(0, 0, 64, 3).data;
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { sum += (.2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2]) / 255; n++; }
    if (!n) return;
    const L = sum / n, ink = quoteEl.classList.contains('ink');
    if (!ink && L > .54) quoteEl.classList.add('ink'); else if (ink && L < .46) quoteEl.classList.remove('ink');
  }
  setTimeout(sample, 400); setInterval(sample, 1500);
  return api;
};

/* ======================================================================================= IN-GAME
   WC.ingame({ bg: 'dark' | 'paper' }) — no sky: the backdrop is a real screenshot of the app in game view
   (base/ingame-dark.jpg, base/ingame-paper.jpg, 1440×900: game text left, the map, Timers, Group and Comm
   Lykta panes right, the menu bar bottom centre-right). Scaled to cover, anchored bottom left. The demo
   panel gets a Dark / Paper switch. Returns { setBg(b), markBar(id|null) } — markBar lights the bar icon of
   an open window ('profile' | 'scripts'). On Paper, body gets .paper (components turn light) and .paper-bg. */
const BAR_X = { weather: 740, profile: 782, scripts: 807, layout: 832, settings: 857, fullscreen: 892, power: 917 };
WC.ingame = (opts = {}) => {
  document.body.classList.add('ingame');
  grain();
  const bgEl = el('div', { class: 'igbg', 'aria-hidden': 'true' });
  document.body.prepend(bgEl);
  const fit = () => { const s = Math.max(innerWidth / 1440, innerHeight / 900); bgEl.style.transform = `scale(${s})`; };
  fit(); addEventListener('resize', fit);
  const api = {
    bg: 'dark',
    setBg(b) {
      api.bg = b === 'paper' ? 'paper' : 'dark';
      bgEl.style.backgroundImage = `url(${BASE_URL}ingame-${api.bg}.jpg)`;
      document.body.classList.toggle('paper-bg', api.bg === 'paper'); document.body.classList.toggle('paper', api.bg === 'paper');
      sw.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.bg === api.bg));
      if (opts.onBg) opts.onBg(api.bg);
    },
    markBar(id) { bgEl.querySelectorAll('.barmark').forEach((m) => m.remove()); if (id && BAR_X[id]) { const m = el('i', { class: 'barmark' }); m.style.left = BAR_X[id] + 'px'; bgEl.append(m); } },
  };
  const sw = WC.demoExtra('<div class="row2">Background <button data-bg="dark">Dark</button><button data-bg="paper">Paper</button></div>');
  sw.querySelectorAll('button').forEach((x) => x.addEventListener('click', () => api.setBg(x.dataset.bg)));
  api.setBg(opts.bg || qs.get('bg') || 'dark');
  // Esc closes the focused window (its close request), unless a page layer above handles it
  WC.keys.push({ key(e) { if (e.key !== 'Escape') return false; const f = document.querySelector('.wwin[data-focused]'); if (!f || !f._win) return false; f._win.close(); return true; } });
  // a press outside every window takes the focus away (as in the app: the keys go back to the game input)
  addEventListener('pointerdown', (e) => { if (!e.target.closest('.wwin') && !e.target.closest('#demo')) document.querySelectorAll('.wwin[data-focused]').forEach((w) => w.removeAttribute('data-focused')); }, true);
  return api;
};

/* WC.window(el, opts) — a movable, resizable in-game window. el: a .wwin.win-a or .wwin.win-b element with
   its content inside (it is moved into .w-body). opts: title, note (dim, after the title), x, y, w, h (px;
   else the inline style), minW, minH, onClose (default: hide). Drag the title bar to move, the edges and
   corners (and the grip) to resize; a press inside focuses and raises it. Returns { el, body, focus, close, rect }. */
let zTop = 100;
const X_SVG = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7"/></svg>';
WC.window = (w, opts = {}) => {
  const title = opts.title ?? w.dataset.title ?? 'Window', note = opts.note ?? w.dataset.note ?? '';
  const isA = w.classList.contains('win-a');
  const body = el('div', { class: 'w-body' }); while (w.firstChild) body.append(w.firstChild);
  const bar = isA
    ? el('div', { class: 'w-bar' }, `<div class="w-hood"><span class="w-t">${title}</span>${note ? `<span class="w-n">${note}</span>` : ''}</div><button class="w-x" type="button" aria-label="Close" title="Close">${X_SVG}</button>`)
    : el('div', { class: 'w-bar' }, `<span class="w-t">${title}</span><span class="w-n">${note}</span><button class="w-x" type="button" aria-label="Close" title="Close">${X_SVG}</button>`);
  w.append(...['b1', 'b2', 'b3', 'b4'].map((b) => el('i', { class: `wbr ${b}` })), bar, body);
  for (const e of ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se']) w.append(el('div', { class: 'w-edge', 'data-edge': e }));
  w.append(el('div', { class: 'w-grip', 'data-edge': 'se' }));
  w.setAttribute('role', 'dialog'); w.setAttribute('aria-label', note ? `${title} ${note}` : title);
  const minW = opts.minW ?? 340, minH = opts.minH ?? 220;
  const r = { x: opts.x ?? w.offsetLeft, y: opts.y ?? w.offsetTop, w: opts.w ?? w.offsetWidth, h: opts.h ?? w.offsetHeight };
  const apply = () => { w.style.left = r.x + 'px'; w.style.top = r.y + 'px'; w.style.width = r.w + 'px'; w.style.height = r.h + 'px'; };
  const fitIn = () => { r.w = Math.min(r.w, innerWidth); r.h = Math.min(r.h, innerHeight); r.x = clamp(r.x, 0, innerWidth - r.w); r.y = clamp(r.y, 0, innerHeight - r.h); };
  fitIn(); apply(); addEventListener('resize', () => { fitIn(); apply(); });
  const api = { el: w, body, rect: r };
  api.focus = () => { document.querySelectorAll('.wwin[data-focused]').forEach((x) => x !== w && x.removeAttribute('data-focused')); w.setAttribute('data-focused', ''); w.style.zIndex = ++zTop; };
  api.close = () => { if (opts.onClose) opts.onClose(api); else { w.hidden = true; w.removeAttribute('data-focused'); } };
  w._win = api;
  w.addEventListener('pointerdown', () => api.focus());
  bar.querySelector('.w-x').addEventListener('pointerdown', (e) => e.stopPropagation());
  bar.querySelector('.w-x').addEventListener('click', (e) => { e.stopPropagation(); api.close(); });
  const drag = (kind) => (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.w-x')) return;
    e.preventDefault(); api.focus();
    const x0 = e.clientX, y0 = e.clientY, s = { ...r }, tgt = e.currentTarget;
    try { tgt.setPointerCapture(e.pointerId); } catch (_) { /* synthetic */ }
    w.classList.add('dragging'); document.body.style.cursor = getComputedStyle(tgt).cursor;
    const move = (ev) => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      if (kind === 'move') { r.x = clamp(s.x + dx, 0, innerWidth - r.w); r.y = clamp(s.y + dy, 0, innerHeight - r.h); }
      else {
        if (kind.includes('e')) r.w = clamp(s.w + dx, minW, innerWidth - s.x);
        if (kind.includes('s')) r.h = clamp(s.h + dy, minH, innerHeight - s.y);
        if (kind.includes('w')) { const nx = clamp(s.x + dx, 0, s.x + s.w - minW); r.w = s.w + (s.x - nx); r.x = nx; }
        if (kind.includes('n')) { const ny = clamp(s.y + dy, 0, s.y + s.h - minH); r.h = s.h + (s.y - ny); r.y = ny; }
      }
      apply();
    };
    const up = () => { tgt.removeEventListener('pointermove', move); tgt.removeEventListener('pointerup', up); tgt.removeEventListener('pointercancel', up); w.classList.remove('dragging'); document.body.style.cursor = ''; };
    tgt.addEventListener('pointermove', move); tgt.addEventListener('pointerup', up); tgt.addEventListener('pointercancel', up);
  };
  bar.addEventListener('pointerdown', drag('move'));
  w.querySelectorAll('.w-edge, .w-grip').forEach((x) => x.addEventListener('pointerdown', drag(x.dataset.edge)));
  if (opts.focus !== false) api.focus();
  return api;
};

})();
