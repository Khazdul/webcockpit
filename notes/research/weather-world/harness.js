// World weather harness (v3). Several MODULES run at the same time and draw
// one combined scene. A director turns raw GMCP into a settled state (dwell)
// and smooth 0..1 mix values, so modules never see room-by-room flicker.
//
// MODULE CONTRACT
//   WX.module({
//     id: 'sky', title: 'Himmel',
//     init(env) {}, resize(env) {},
//     frame(env, dt, t) {},          // called every animation frame (<= 60 fps). The harness clears
//                                    // BOTH canvases before the first module, so every module redraws
//                                    // every frame. Expensive layers: render at a lower rate into your
//                                    // own offscreen canvas and blit it each frame.
//     onEvent(env, name, data) {},   // see EVENTS
//     destroy(env) {},
//   })
//   Modules draw in this order: sky, weather, fog, body (later = on top within a layer).
//
// env
//   W, H, dpr, back, front, panes, out, lines, protect, cell, noise, fbm, rnd, now  (as in v2;
//   back = behind text and panes, front = above everything; the harness masks the
//   prompt/input rows and the far left of both canvases after all modules ran)
//   raw      {weather, fog, light, position, clock, moonPhase, moonUp}   what GMCP just said
//            weather: ' ' '~' "'" '"' '*' or null (null = no sky: indoors/underground)
//            fog: '' '-' '='   light: '*' sun, '!' artificial, ')' moon, 'o' dark
//            position: standing resting sleeping stunned incapacitated dying
//            clock: 'day' | 'night' (from the almanac / Event.Sun)
//            moonPhase: 0..1 illuminated fraction; moonUp: bool (Event.Moon rise/set)
//   settled  same keys after the dwell filter: weather, fog and light only change after the
//            raw value has been stable for DWELL ms (3000). position, clock, moon are immediate.
//   mix      smoothed 0..1 values (exponential, ~2 s) — USE THESE for intensities:
//            outdoors  sky visible (settled.weather !== null)
//            (v4) the sky is chosen by the latest Event.Sun / Event.Moon, NOT by light;
//            light 'o' alone overrides it with the darkness sky. Exactly one of sun/moon/dark/evil
//            is 1 when outdoors:
//            sun       outdoors, sun up (clock day), light not 'o'          -> day sky
//            moon      outdoors, night, moon up, light not 'o'              -> moonlit night
//            dark      outdoors, night, no moon, light not 'o'              -> starry night
//            evil      outdoors, light 'o'                                  -> darkness sky
//            torch     light '!' (tinting only)
//            night     clock night
//            clouds    cloud cover from weather (~ .6, ' .85, " 1, * .8), times outdoors
//            rain      weather "'" or '"' (times outdoors)
//            heavy     weather '"' (times outdoors)
//            snow      weather '*' (times outdoors)
//            fog       '-' .5, '=' 1 (fog is reported outdoors only)
//            resting, sleeping, down (incapacitated .6 / dying 1)
//   moonPhase (also env.raw.moonPhase) and env.moonUp mirror the raw values.
//   shared   cross-module signals. weather writes shared.flash (0..1, lightning brightness this
//            frame) and shared.boltX (x of the current bolt); sky may light clouds with it.
//
// EVENTS (immediate, not dwelled; modules decide whether to show them indoors)
//   'sun.rise' 'sun.light' 'sun.set' 'sun.dark'  'moon.rise' 'moon.set'
//   'darkness.start' 'darkness.grow' 'darkness.shrink' 'darkness.end-soon' 'darkness.end'
//   'strike' (manual lightning)   'position' data {from, to}
//
// Budget: all modules together avg <= 1.0 ms, p95 <= 2 ms per frame at 1600x1000.

(() => {
  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  const cvB = $('cvBack'), cvF = $('cvFront');
  const back = cvB.getContext('2d'), front = cvF.getContext('2d');
  const DWELL = 3000;

  const P = new Uint8Array(512);
  { const p = [...Array(256).keys()]; let s = 1234567;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) P[i] = p[i & 255]; }
  const sm = (t) => t * t * (3 - 2 * t);
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const h = (a, b) => P[(P[a & 255] + b) & 255] / 255;
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    const u = sm(xf), v = sm(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const fbm = (x, y) => noise(x, y) * 0.65 + noise(x * 2.03 + 17, y * 2.03 + 5) * 0.35;

  const raw = { weather: "'", fog: '', light: ')', position: 'standing', clock: 'night', moonPhase: 0.8, moonUp: true };
  const settled = { ...raw };
  const pendingSince = { weather: 0, fog: 0, light: 0 };
  const MIXKEYS = ['outdoors', 'sun', 'moon', 'torch', 'night', 'dark', 'evil', 'clouds', 'rain', 'heavy', 'snow', 'fog', 'resting', 'sleeping', 'down'];
  const mix = Object.fromEntries(MIXKEYS.map((k) => [k, 0]));
  const env = {
    W: 0, H: 0, dpr: 1, back, front, panes: [], out: null, lines: [], protect: null, cell: null,
    shared: { flash: 0 }, raw, settled, mix, noise, fbm, rnd: (a, b) => a + Math.random() * (b - a), now: 0,
    get moonPhase() { return raw.moonPhase; }, get moonUp() { return raw.moonUp; },
  };

  const modules = [];
  const enabled = {};
  const times = [], modTimes = {};
  let running = true, lastT = 0;

  const WXMSG = { ' ': 'The clouds disappear.', '~': 'The sky is getting cloudy.', "'": 'It starts to rain.', '"': 'The rain is pouring down.', '*': 'It starts to snow.', null: 'You enter the Grand Hallway.' };
  const FOGMSG = { '-': ' A light fog rolls in.', '=': ' A thick fog covers the land.' };

  function rel(r, s) { return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height }; }
  function measure() {
    const s = stage.getBoundingClientRect();
    env.dpr = Math.min(2, window.devicePixelRatio || 1);
    env.W = s.width; env.H = s.height;
    for (const [cv, ctx] of [[cvB, back], [cvF, front]]) {
      cv.width = Math.round(env.W * env.dpr); cv.height = Math.round(env.H * env.dpr);
      ctx.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
    }
    env.panes = [...stage.querySelectorAll('.pane')].filter((el) => el.offsetParent !== null)
      .map((el) => ({ id: el.id, name: el.dataset.name, ...rel(el.getBoundingClientRect(), s), border: parseFloat(getComputedStyle(el).borderTopWidth) }));
    const out = $('out');
    env.out = rel(out.getBoundingClientRect(), s);
    env.lines = [];
    for (const p of out.querySelectorAll('p')) {
      if (p.id === 'prompt' || p.classList.contains('inp') || !p.textContent.trim()) continue;
      const range = document.createRange(); range.selectNodeContents(p);
      for (const r of range.getClientRects()) if (r.width > 2 && r.bottom > s.top) env.lines.push(rel(r, s));
    }
    const fs = parseFloat(getComputedStyle(stage).fontSize);
    const solidTop = $('prompt').getBoundingClientRect().top - s.top - 2;
    env.protect = { solidTop, fadeTop: solidTop - 3.5 * fs, left: Math.min(90, env.W * 0.05) };
    const font = `${fs}px ${getComputedStyle(stage).fontFamily}`;
    back.font = font;
    env.cell = { w: back.measureText('MMMMMMMMMM').width / 10, h: fs * 1.28, font, size: fs };
    drawMap();
  }
  function drawMap() {
    const cv = $('mapCv'); if (!cv || !cv.offsetParent) return;
    const r = cv.getBoundingClientRect(); const d = env.dpr;
    cv.width = r.width * d; cv.height = r.height * d;
    const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0);
    g.fillStyle = '#2b2e31'; g.fillRect(0, 0, r.width, r.height);
    const sz = r.width / 8.2; let seed = 7; const rr = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const rooms = [[3,0],[4,0],[5,0],[6,0],[3,1],[4,1],[5,1],[6,1],[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[0,4],[1,4],[3,4],[4,4],[5,4],[6,4],[7,4]];
    for (const [cx, cy] of rooms) {
      const x = cx * sz + 4, y = cy * sz + 6;
      g.fillStyle = rr() < .2 ? '#8a7a7c' : '#a9a9a9'; g.fillRect(x, y, sz - 1, sz - 1);
      for (let i = 0; i < 40; i++) { g.fillStyle = rr() < .5 ? '#c8c8c8' : '#888'; g.fillRect(x + rr() * sz, y + rr() * sz, 1.2, 1.2); }
      if (rr() < .55) { g.strokeStyle = '#c03030'; g.lineWidth = 1.4; const m = sz * .32, ox = x + sz * .5, oy = y + sz * .4;
        g.beginPath(); g.moveTo(ox - m / 2, oy - m / 2); g.lineTo(ox + m / 2, oy + m / 2); g.moveTo(ox + m / 2, oy - m / 2); g.lineTo(ox - m / 2, oy + m / 2); g.stroke(); }
    }
    g.strokeStyle = '#eee'; g.lineWidth = 1.3; g.beginPath();
    g.moveTo(0, sz * 1.5); g.lineTo(sz * 1.2, sz * 2.6); g.lineTo(sz * 3, sz * 2.2);
    g.moveTo(sz * 5.5, 0); g.lineTo(sz * 5, sz * 1.3); g.stroke();
    g.strokeStyle = '#e0e000'; g.lineWidth = 2; g.strokeRect(3 * sz + 6, 2 * sz + 8, sz - 5, sz - 5);
    g.fillStyle = '#2040c0'; g.font = `bold ${sz * .6}px sans-serif`; g.fillText('R', 3 * sz + 10, 2 * sz + sz * .72);
  }

  function applyMask(ctx) {
    const p = env.protect;
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1;
    const g = ctx.createLinearGradient(0, p.fadeTop, 0, p.solidTop);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = g; ctx.fillRect(0, p.fadeTop, env.W, p.solidTop - p.fadeTop);
    ctx.fillStyle = '#000'; ctx.fillRect(0, p.solidTop, env.W, env.H - p.solidTop + 2);
    const gl = ctx.createLinearGradient(0, 0, p.left, 0);
    gl.addColorStop(0, 'rgba(0,0,0,.85)'); gl.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gl; ctx.fillRect(0, 0, p.left, p.fadeTop);
    ctx.restore();
  }

  // ---------------- director ----------------
  function settle(now) {
    for (const k of ['weather', 'fog', 'light']) {
      if (raw[k] === settled[k]) { pendingSince[k] = 0; continue; }
      if (!pendingSince[k]) pendingSince[k] = now;
      if (now - pendingSince[k] >= DWELL) { settled[k] = raw[k]; pendingSince[k] = 0; }
    }
    settled.position = raw.position; settled.clock = raw.clock; settled.moonPhase = raw.moonPhase; settled.moonUp = raw.moonUp;
  }
  function targets() {
    const s = settled, out = s.weather !== null ? 1 : 0, day = s.clock === 'day', dk = s.light === 'o';
    return {
      // v4: the sky comes from the last Event.Sun/Event.Moon (clock, moonUp); the only light
      // flag that matters is 'o', which overrides everything with the darkness sky.
      outdoors: out, sun: out && day && !dk ? 1 : 0, moon: out && !day && s.moonUp && !dk ? 1 : 0,
      torch: s.light === '!' ? 1 : 0, night: day ? 0 : 1,
      dark: out && !day && !s.moonUp && !dk ? 1 : 0, evil: out && dk ? 1 : 0,
      clouds: out * ({ '~': .6, "'": .85, '"': 1, '*': .8 }[s.weather] || 0),
      rain: out * (s.weather === "'" || s.weather === '"' ? 1 : 0), heavy: out * (s.weather === '"' ? 1 : 0),
      snow: out * (s.weather === '*' ? 1 : 0), fog: s.fog === '-' ? .5 : s.fog === '=' ? 1 : 0,
      resting: s.position === 'resting' ? 1 : 0, sleeping: s.position === 'sleeping' ? 1 : 0,
      down: s.position === 'dying' ? 1 : s.position === 'incapacitated' ? .6 : 0,
    };
  }
  function stepMix(dt) {
    const t = targets(), k = 1 - Math.exp(-dt / 0.9);
    for (const key of MIXKEYS) mix[key] += (t[key] - mix[key]) * k;
  }

  function frame(t) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (t - lastT) / 1000 || 0); lastT = t;
    env.now = t;
    settle(t); stepMix(dt);
    const t0 = performance.now();
    back.clearRect(0, 0, env.W, env.H); front.clearRect(0, 0, env.W, env.H);
    for (const m of modules) {
      if (!enabled[m.id]) continue;
      const m0 = performance.now();
      back.save(); front.save();
      try { m.frame(env, dt, t); } catch (e) { console.error(m.id, e); }
      back.restore(); front.restore();
      const arr = modTimes[m.id] || (modTimes[m.id] = []);
      arr.push(performance.now() - m0); if (arr.length > 180) arr.shift();
    }
    applyMask(back); applyMask(front);
    times.push(performance.now() - t0); if (times.length > 180) times.shift();
    if (times.length % 15 === 0) showPerf(t);
  }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const p95 = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length * 0.95)] || 0; };
  function showPerf(now) {
    const per = modules.filter((m) => enabled[m.id]).map((m) => `${m.id} ${avg(modTimes[m.id] || []).toFixed(2)}`).join(' · ');
    $('perf').innerHTML = `totalt <b>${avg(times).toFixed(2)} ms</b> snitt, ${p95(times).toFixed(2)} p95 · ${per}`;
    const show = (v) => (v === null ? 'null' : JSON.stringify(v));
    const pend = ['weather', 'fog', 'light'].filter((k) => pendingSince[k]).map((k) => `${k} ${show(raw[k])} om ${((DWELL - (now - pendingSince[k])) / 1000).toFixed(1)} s`);
    $('stateLine').innerHTML = `<b>Gäller:</b> weather ${show(settled.weather)} · fog ${show(settled.fog)} · light ${show(settled.light)} · ${settled.position} · ${settled.clock}` + (pend.length ? ` <span style="color:var(--amber)">· väntar: ${pend.join(', ')}</span>` : '');
  }

  // ---------------- UI ----------------
  function emit(name, data) { for (const m of modules) if (enabled[m.id] && m.onEvent) try { m.onEvent(env, name, data); } catch (e) { console.error(m.id, e); } }
  function setRaw(key, v) {
    const prev = raw[key]; raw[key] = v;
    if (key === 'weather' || key === 'fog') $('wxMsg').textContent = (WXMSG[raw.weather] || '') + (FOGMSG[raw.fog] || '');
    $('prompt').textContent = `${raw.light}${raw.weather === null ? '[' : '.'}${(raw.weather || '').trim()}${raw.fog} S> `;
    $('sunIcon').textContent = raw.clock === 'day' ? '☼' : '☾';
    if (key === 'position' && prev !== v) emit('position', { from: prev, to: v });
    sync();
  }
  function sync() {
    const map = [['gWeather', 'weather'], ['gFog', 'fog'], ['gLight', 'light'], ['gPosition', 'position'], ['gClock', 'clock'], ['gPhase', 'moonPhase']];
    for (const [gid, key] of map) document.querySelectorAll(`#${gid} button`).forEach((b) => {
      const v = b.dataset.v === 'null' ? null : key === 'moonPhase' ? +b.dataset.v : b.dataset.v;
      b.setAttribute('aria-pressed', String(v === raw[key]));
    });
  }
  function wire() {
    const map = [['gWeather', 'weather'], ['gFog', 'fog'], ['gLight', 'light'], ['gPosition', 'position'], ['gClock', 'clock'], ['gPhase', 'moonPhase']];
    for (const [gid, key] of map) $(gid).addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]'); if (!b) return;
      setRaw(key, b.dataset.v === 'null' ? null : key === 'moonPhase' ? +b.dataset.v : b.dataset.v);
    });
    $('gEvents').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-e]'); if (!b) return;
      const n = b.dataset.e;
      if (n === 'sun.rise' || n === 'sun.light') setRaw('clock', 'day');
      if (n === 'sun.set' || n === 'sun.dark') setRaw('clock', 'night');
      if (n === 'moon.rise') setRaw('moonUp', true);
      if (n === 'moon.set') setRaw('moonUp', false);
      emit(n);
    });
    $('btnPause').addEventListener('click', () => {
      running = !running; $('btnPause').textContent = running ? 'Pausa' : 'Spela';
      if (running) { lastT = performance.now(); requestAnimationFrame(frame); }
    });
    // Walk through ten rooms quickly, then stop in the starting room's conditions.
    $('btnRun').addEventListener('click', () => {
      const home = { weather: raw.weather, light: raw.light };
      const rooms = [['!', null], ['*', ' '], ['!', null], ['o', null], ['*', '~'], ['!', null], [')', ' '], ['!', null], ['*', ' '], ['!', null]];
      rooms.forEach(([l, w], i) => setTimeout(() => { setRaw('light', l); setRaw('weather', w); }, i * 550));
      setTimeout(() => { setRaw('light', home.light); setRaw('weather', home.weather); }, rooms.length * 550);
    });
    const list = $('modList');
    for (const m of modules) {
      enabled[m.id] = true;
      const l = document.createElement('label');
      l.innerHTML = `<input type="checkbox" checked id="mod-${m.id}"> ${m.title} <small>${m.id}</small>`;
      l.querySelector('input').addEventListener('change', (e) => { enabled[m.id] = e.target.checked; });
      list.appendChild(l);
    }
    let pending = 0;
    new ResizeObserver(() => { cancelAnimationFrame(pending); pending = requestAnimationFrame(() => {
      measure(); for (const m of modules) if (m.resize) try { m.resize(env); } catch (e) { console.error(m.id, e); } }); }).observe(stage);
  }

  window.WX = {
    module(m) { modules.push(m); },
    // for screenshots/tests: set raw and settled immediately, mix too
    jump(state) { Object.assign(raw, state); Object.assign(settled, raw); const t = targets(); for (const k of MIXKEYS) mix[k] = t[k]; setRaw('weather', raw.weather); },
    emit, env,
    start() {
      (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
        measure(); wire();
        const t = targets(); for (const k of MIXKEYS) mix[k] = t[k];
        for (const m of modules) try { m.init && m.init(env); m.resize && m.resize(env); } catch (e) { console.error(m.id, e); }
        setRaw('weather', raw.weather);
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) { running = false; $('btnPause').textContent = 'Spela'; }
        lastT = performance.now(); requestAnimationFrame(frame);
      });
    },
  };
})();
