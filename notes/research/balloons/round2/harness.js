// Kill notices, round 2: the shared test stage (a mockup, not product code).
//
// A SKIN is one visual direction. A skin file is a classic script that calls
//
//   Harness.register({
//     id: 'raven',                 // matches the file name's word
//     name: 'The Raven',           // tab label
//     blurb: 'One or two sentences for the owner.',
//     create(ctx) { return { show(notice), still(notice), clear() }; },
//   });
//
// create(ctx) is called once, when the skin's tab is first chosen. It returns:
//   show(notice)  -> { update(notice) }   play the notice on the stage. update()
//                    is called when more kills join the same notice (the sign
//                    then says "3 kills", the summed XP, the best mood).
//   still(notice) -> HTMLElement          the same notice at rest (no flight, no
//                    entrance), for the sheet under the stage. At most ~230 px
//                    wide and ~300 px tall. Ambient loops (a flame) may run.
//   clear()                               remove everything from the stage now.
//
// A NOTICE (the product's SignContent, src/weather/balloons/feed.ts):
//   kind   'kill' | 'levelup' | 'death' | 'achievement'
//   mood   'poor' | 'meh' | 'good' | 'great' | 'superb' | 'calibrating' | 'pvp'
//          | 'levelup' | 'death' | 'achievement'
//   title  kill: the mob's name ("An orc scout", "*Grimbold the Orc*") or
//          "4 kills"; achievement: its text (up to 120 chars); else ''
//   big    kill: the XP, formatted ("12,400"); levelup: "Level 23!";
//          death: "You died"; achievement: ''
//   unit   'xp' for a kill, else ''
//   label  kill: 'Poor' | 'Meh' | 'Good' | 'Great' | 'Superb' | 'PvP' | ''
//          ('' while unrated); achievement: 'Achievement'; else ''
//   more   joined kills: the last three names, " · " between; else ''
//   count  the number of kills on the notice (1 unless joined)
// Every string comes from the game: set it with textContent, never innerHTML.
//
// ctx:
//   ctx.front, ctx.sky   two layers over the stage (absolute, inset 0,
//                        pointer-events none). front is over the game text and
//                        under the prompt; sky is behind the game text.
//   ctx.lane()           { x0, x1, top, bottom, w, h } in stage px: the part of
//                        the screen where the sky shows (right of the game
//                        text, above the prompt). Notices belong here.
//   ctx.size()           { w, h } of the stage.
//   ctx.skyMode()        'night' | 'dusk' | 'day' | 'overcast' (the backdrop the
//                        owner picked; a skin must read on all four).
//   ctx.reduced          prefers-reduced-motion.
//   ctx.rng(seed)        a seeded random function, 0..1.
//   ctx.pace()           the time multiplier (1 quick, 0.5 as in the game).
//   ctx.fly(el, opts)    the hot-air-balloon flight, for skins that rise:
//                        opts { w, h, frame?({ lean, swing, phase, t }) }
//                        w, h: the element's size in px. It rises from under
//                        the prompt to a readable spot low in the lane, stays
//                        about 6 s, then drifts up and away, shrinking and
//                        fading, and is removed. frame() gets the lean of the
//                        whole rig and the lagging swing of what hangs under
//                        it, in degrees, and the phase ('arrive' | 'read' |
//                        'leave'). Returns { extend(ms), gone, end() } (extend adds
//                        readable time when a kill joins; gone is a Promise;
//                        end() removes it now: call it from clear()).
//   ctx.el(tag, cls, text?)   a small element helper.
//   ctx.svg(markup)      parses trusted SVG markup of your own (no game text)
//                        into an SVGElement.
//
// CSS: a skin adds its own <style> once (Harness.css(id, text)); prefix every
// class with the skin id (.raven-…). Fonts loaded by the page: Cinzel 500/700,
// Cormorant Garamond 500/600 + italics, Cormorant SC 600, IM Fell English
// (+ italic), IM Fell English SC, JetBrains Mono 400/600.

const Harness = (() => {
  const SKINS = [];
  const made = new Map();
  let current = null, skyMode = 'night', pace = 1, slot = 0;
  const $ = (id) => document.getElementById(id);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const rng = (seed) => {
    let a = (seed >>> 0) || 1;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // ---- sample notices (the product's samples) ----
  const fmt = (n) => n.toLocaleString('en-US');
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const WORD = { poor: 'Poor', meh: 'Meh', good: 'Good', great: 'Great', superb: 'Superb', calibrating: '', pvp: 'PvP' };
  const KILLS = {
    poor: ['a field mouse', 140], meh: ['a ragged wolf', 1100], good: ['an orc scout', 1900],
    great: ['an Uruk-hai tracker', 3700], superb: ['a cave troll', 12400],
    calibrating: ['a black squirrel', 260], pvp: ['*Grimbold the Orc*', 6200],
  };
  const kill = (mood) => ({ kind: 'kill', mood, title: cap(KILLS[mood][0]), big: fmt(KILLS[mood][1]), unit: 'xp', label: WORD[mood], more: '', count: 1 });
  const BURST = [['an orc scout', 1900, 'good'], ['a ragged wolf', 1100, 'meh'], ['an Uruk-hai tracker', 3700, 'great'], ['a snaga', 900, 'meh']];
  const RANK = ['calibrating', 'poor', 'meh', 'good', 'great', 'superb', 'pvp'];
  const joined = (n) => {
    const part = BURST.slice(0, n);
    if (n === 1) return { kind: 'kill', mood: part[0][2], title: cap(part[0][0]), big: fmt(part[0][1]), unit: 'xp', label: WORD[part[0][2]], more: '', count: 1 };
    const mood = part.map((p) => p[2]).sort((a, b) => RANK.indexOf(b) - RANK.indexOf(a))[0];
    return { kind: 'kill', mood, title: `${n} kills`, big: fmt(part.reduce((s, p) => s + p[1], 0)), unit: 'xp', label: WORD[mood], more: part.slice(-3).map((p) => p[0]).join(' · '), count: n };
  };
  const blank = { title: '', big: '', unit: '', label: '', more: '', count: 1 };
  const MOMENTS = {
    levelup: { ...blank, kind: 'levelup', mood: 'levelup', big: 'Level 23!' },
    death: { ...blank, kind: 'death', mood: 'death', big: 'You died' },
    achievement: { ...blank, kind: 'achievement', mood: 'achievement', label: 'Achievement', title: 'You have explored every room of the Old Forest, from the Withywindle to the Barrow-downs.' },
  };
  const sample = (ev) => (KILLS[ev] ? kill(ev) : MOMENTS[ev]);
  const SHEET = ['calibrating', 'poor', 'meh', 'good', 'great', 'superb', 'pvp', 'burst', 'levelup', 'death', 'achievement'];
  const CAPTION = { calibrating: 'Unrated kill', poor: 'Poor kill', meh: 'Meh kill', good: 'Good kill', great: 'Great kill', superb: 'Superb kill', pvp: 'Player kill', burst: 'Four kills joined', levelup: 'Level up', death: 'Death', achievement: 'Achievement' };

  // ---- geometry ----
  const size = () => ({ w: $('stage').clientWidth, h: $('stage').clientHeight });
  const lane = () => {
    const { w, h } = size();
    const textEnd = Math.min($('out').offsetWidth, w);
    // Wide: the strip right of the text. Narrow: the right half, over the text's end.
    let x0 = textEnd + 8;
    if (w - x0 < 260) x0 = Math.max(0, w - Math.max(260, w * 0.5));
    return { x0, x1: w - 8, top: 0, bottom: h - 34, w: w - 8 - x0, h: h - 34 };
  };

  // ---- the flight (a short version of src/weather/balloons/flight.ts) ----
  function fly(el, o) {
    const { w, h } = o, L = lane(), S = size();
    const r = rng((Math.random() * 1e9) | 0);
    const span = Math.max(0, L.w - w);
    const rx = L.x0 + span * [0.04, 0.96, 0.5][slot++ % 3];
    const ry = Math.max(8, L.bottom - h - 12);
    const y0 = S.h + 8;
    const A = 3200, LEAVE = 15000;
    let read = 6000;
    const amp = 5 + r() * 5, w1 = 0.0005 + r() * 0.0003;
    const dir = r() < 0.5 ? -1 : 1;
    const dx = dir * (40 + r() * Math.min(160, span * 0.6)), endS = 0.28 + r() * 0.3;
    const yEnd = -h * 0.5 + r() * L.h * 0.25;
    Object.assign(el.style, { position: 'absolute', left: '0', top: '0', width: w + 'px', willChange: 'transform, opacity', transformOrigin: '50% 40%' });
    $('l-front').append(el);
    let res; const gone = new Promise((f) => (res = f));
    let t = 0, last = performance.now(), px = rx, swing = 0, sv = 0, inSky = false, dead = false;
    const end = () => { if (dead) return; dead = true; el.remove(); res(); };
    if (reduced) {
      el.style.transform = `translate(${rx}px,${ry}px)`;
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
      o.frame?.({ lean: 0, swing: 0, phase: 'read', t: 0 });
      const wait = () => { if ((t += 250) >= read) { el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400 }).onfinish = end; } else setTimeout(wait, 250); };
      setTimeout(wait, 250);
      return { extend: (ms) => { read = Math.min(9000, read + ms); }, gone, end };
    }
    const step = (now) => {
      if (dead) return;
      const dt = Math.min(50, now - last); last = now; t += dt * pace;
      let x, y, s = 1, op = 1, phase;
      if (t < A) {
        const u = t / A, e = 1 - Math.pow(1 - u, 3);
        x = rx; y = y0 + (ry - y0) * e; s = 0.7 + 0.3 * e; op = Math.min(1, u * 5); phase = 'arrive';
      } else if (t < A + read) {
        const tt = t - A, k = Math.min(1, tt / 1500);
        x = rx + Math.sin(tt * w1 * 2) * amp * k; y = ry - tt * 0.0025 + Math.sin(tt * 0.0012) * 2.5 * k; phase = 'read';
      } else {
        const tt = t - A - read, u = Math.min(1, tt / LEAVE), e = u * u * (3 - 2 * u), q = 1 - Math.pow(1 - u, 2);
        const ys = ry - read * 0.0025;
        x = rx + dx * e + Math.sin((read + tt) * w1 * 2) * amp * (1 + u); y = ys + (yEnd - ys) * (u * 0.35 + e * 0.65) + Math.sin(tt * 0.0012) * 2.5;
        s = 1 - (1 - endS) * q; op = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1; phase = 'leave';
        if (!inSky && u > 0.1) { inSky = true; $('l-sky').append(el); }
        if (u >= 1) return end();
      }
      const vx = (x - px) / Math.max(1, dt); px = x;
      const lean = Math.max(-6, Math.min(6, vx * 90));
      // the hanging part: a damped spring toward the lean, kicked as the arrival stops
      const target = -lean * 1.4 + (phase === 'read' && t - A < 60 ? 3 : 0);
      sv += ((target - swing) * 0.004 - sv * 0.06) * dt * 0.06; swing += sv * dt * 0.06;
      el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${s.toFixed(3)})`;
      el.style.opacity = op.toFixed(2);
      o.frame?.({ lean, swing: swing + Math.sin(t * 0.0016) * 1.2, phase, t });
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return { extend: (ms) => { read = Math.min(9000, read + ms); }, gone, end };
  }

  // ---- helpers for skins ----
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const svg = (markup) => { const t = document.createElement('template'); t.innerHTML = markup.trim(); return t.content.firstElementChild; };
  const css = (id, text) => { if ($('css-' + id)) return; const s = document.createElement('style'); s.id = 'css-' + id; s.textContent = text; document.head.append(s); };
  const ctx = { get front() { return $('l-front'); }, get sky() { return $('l-sky'); }, lane, size, skyMode: () => skyMode, reduced, rng, pace: () => pace, fly, el, svg };

  // ---- the sky backdrop ----
  const SKY = {
    night: ['#050813', '#0b1226', '#151d38'], dusk: ['#141833', '#5b3850', '#c9764a'],
    day: ['#2f5f93', '#5f93bd', '#9cc0d6'], overcast: ['#3d444d', '#5d656e', '#858c93'],
  };
  function paintSky() {
    const cv = $('skycv'), { w, h } = size(), d = Math.min(2, devicePixelRatio || 1);
    cv.width = w * d; cv.height = h * d;
    const g = cv.getContext('2d'); g.scale(d, d);
    const c = SKY[skyMode], gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, c[0]); gr.addColorStop(0.6, c[1]); gr.addColorStop(1, c[2]);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const r = rng(7);
    if (skyMode === 'night' || skyMode === 'dusk') {
      const n = skyMode === 'night' ? 150 : 40;
      for (let i = 0; i < n; i++) {
        const x = r() * w, y = r() * h * (skyMode === 'night' ? 0.95 : 0.5), m = r();
        g.globalAlpha = 0.25 + m * 0.6; g.fillStyle = m > 0.9 ? '#ffe9c4' : '#dfe6ff';
        g.beginPath(); g.arc(x, y, m > 0.93 ? 1.3 : 0.7, 0, 7); g.fill();
      }
      g.globalAlpha = 1;
    }
    if (skyMode !== 'night') {
      const n = skyMode === 'overcast' ? 16 : 6;
      for (let i = 0; i < n; i++) {
        const x = r() * w, y = r() * h * 0.8, rw = 120 + r() * 220, rh = 18 + r() * 30;
        const cg = g.createRadialGradient(x, y, 0, x, y, rw);
        const col = skyMode === 'dusk' ? '255,190,150' : skyMode === 'day' ? '255,255,255' : '200,205,212';
        cg.addColorStop(0, `rgba(${col},${skyMode === 'overcast' ? 0.22 : 0.3})`); cg.addColorStop(1, `rgba(${col},0)`);
        g.save(); g.translate(x, y); g.scale(1, rh / rw); g.translate(-x, -y); g.fillStyle = cg; g.beginPath(); g.arc(x, y, rw, 0, 7); g.fill(); g.restore();
      }
    }
  }

  // ---- game text ----
  const LINES = [
    ['room', 'The Old Forest Road'], ['', 'The road runs on under the eaves of the wood, narrow and overgrown.'],
    ['mob', 'An orc scout stands here, sniffing the air.'], ['cmd', '> kill orc'],
    ['', 'You slash an orc scout\'s left arm and tickle it.'], ['', 'An orc scout hits your body and scratches it.'],
    ['', 'You pierce an orc scout\'s head extremely hard and shatter it.'], ['dead', 'An orc scout is dead! R.I.P.'],
    ['xp', 'You receive your share of experience.'], ['say', 'Thorin tells the group \'next one north\''], ['cmd', '> north'],
    ['room', 'A Clearing in the Wood'], ['', 'Tall grey trunks ring a patch of trampled grass. A cold fire-pit lies here.'],
    ['mob', 'A ragged wolf snarls at you.'],
  ];
  function paintText() {
    const out = $('out'); out.textContent = '';
    for (let i = 0; i < 3; i++) for (const [c, t] of LINES) out.append(el('div', c, t));
  }

  // ---- wiring ----
  const skin = () => {
    if (!made.has(current.id)) made.set(current.id, current.create(ctx));
    return made.get(current.id);
  };
  let burstTimers = [];
  function fire(ev) {
    if (ev === 'clear') { burstTimers.forEach(clearTimeout); burstTimers = []; skin().clear(); return; }
    if (ev === 'burst') {
      const h = skin().show(joined(1));
      for (let i = 2; i <= 4; i++) burstTimers.push(setTimeout(() => h && h.update && h.update(joined(i)), 650 * (i - 1) / pace));
      return;
    }
    skin().show(sample(ev));
  }
  function paintSheet() {
    const sh = $('sheet'); sh.textContent = ''; sh.dataset.sky = skyMode;
    for (const ev of SHEET) {
      const cell = el('div', 'cell'), pic = el('div', 'pic');
      try { pic.append(skin().still(ev === 'burst' ? joined(4) : sample(ev))); } catch (e) { pic.append(el('div', '', String(e))); console.error(e); }
      cell.append(pic, el('div', 'cap', CAPTION[ev])); sh.append(cell);
    }
  }
  function choose(id) {
    if (current) { burstTimers.forEach(clearTimeout); burstTimers = []; try { skin().clear(); } catch (e) { console.error(e); } }
    current = SKINS.find((s) => s.id === id) || SKINS[0];
    if (!current) return;
    for (const b of $('tabs').children) b.setAttribute('aria-pressed', String(b.dataset.id === current.id));
    $('blurb').textContent = current.blurb || '';
    paintSheet();
    try { localStorage.setItem('kn2-skin', current.id); } catch { /* private window */ }
  }
  function setSky(m) {
    skyMode = m; paintSky();
    for (const b of $('skies').querySelectorAll('[data-sky]')) b.setAttribute('aria-pressed', String(b.dataset.sky === m));
    if (current) paintSheet();
  }
  function setPace(p) {
    pace = p;
    for (const b of $('skies').querySelectorAll('[data-pace]')) b.setAttribute('aria-pressed', String(Number(b.dataset.pace) === p));
  }
  function start() {
    paintText(); setSky('night'); setPace(1);
    SKINS.forEach((s, i) => {
      const b = el('button'); b.id = 'tab-' + s.id; b.dataset.id = s.id; b.append(el('i', '', String(i + 1)), s.name);
      b.onclick = () => choose(s.id); $('tabs').append(b);
    });
    $('keys').onclick = (e) => { const b = e.target.closest('[data-ev]'); if (b) fire(b.dataset.ev); };
    $('skies').onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.sky) setSky(b.dataset.sky); else setPace(Number(b.dataset.pace));
    };
    addEventListener('keydown', (e) => { const n = Number(e.key); if (n >= 1 && n <= SKINS.length && !e.ctrlKey && !e.metaKey && !e.altKey) choose(SKINS[n - 1].id); });
    addEventListener('resize', paintSky);
    let saved = null; try { saved = localStorage.getItem('kn2-skin'); } catch { /* private window */ }
    choose((location.hash || '').slice(1) || saved || (SKINS[0] && SKINS[0].id));
  }

  return { register: (s) => SKINS.push(s), start, css, fire, choose, setSky, setPace, sample, joined };
})();
