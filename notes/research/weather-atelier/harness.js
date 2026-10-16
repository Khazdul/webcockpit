// Weather atelier harness. Owns the layout mock, the two canvases, the GMCP
// state simulator, the protect mask and the perf meter. Effects register
// themselves with WX.register({...}); see EFFECT CONTRACT below.
//
// EFFECT CONTRACT
//   {
//     id: 'rain-glass',            // unique, [a-z0-9-]
//     title: 'Regnruta',           // Swedish, 1-3 words, shown on the picker
//     note: 'one Swedish sentence for the owner',
//     preset: { weather: "'", fog: '', light: '*' },   // optional, applied when selected
//     fps: 60 | 30 | 15,           // optional frame cap (default 60)
//     manualClear: false,          // true = harness does NOT clear the canvases before frame()
//     init(env) {}, resize(env) {}, frame(env, dt, t) {},
//     onState(env, key, value, prev) {},   // key: 'weather' | 'fog' | 'light'
//     onEvent(env, name) {},               // 'sun.rise' | 'sun.set' | 'moon.rise' | 'darkness.start' | 'strike'
//     destroy(env) {}
//   }
// env (read-only unless noted):
//   W, H, dpr        stage size in CSS px; contexts are pre-scaled, draw in CSS px
//   back, front      CanvasRenderingContext2D: back is BEHIND all text and panes
//                    (pane borders, titles and the Map interior are opaque; empty
//                    pane interiors, the output area and gaps show back); front is ABOVE everything
//   panes            [{id, name, x, y, w, h, border}] border boxes in stage px; border = border width px
//   out              {x, y, w, h} output text area
//   lines            [{x, y, w, h}] line boxes of visible output text (stage px)
//   protect          {fadeTop, solidTop, left} mask geometry; harness erases both canvases there after frame()
//   cell             {w, h, font, size} monospace cell metrics; font is a ctx.font string
//   state            {weather, fog, light, changedAt} current simulated GMCP
//   noise(x, y)      smooth value noise 0..1;  fbm(x, y) two octaves
//   rnd(a, b)
//   now              performance.now() of this frame
// Rules: never touch the DOM per frame; keep frame() under ~1 ms on a laptop.

(() => {
  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  const cvB = $('cvBack'), cvF = $('cvFront');
  const back = cvB.getContext('2d'), front = cvF.getContext('2d');

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

  const state = { weather: "'", fog: '', light: '*', changedAt: 0 };
  const env = {
    W: 0, H: 0, dpr: 1, back, front, panes: [], out: null, lines: [], protect: null,
    cell: null, state, noise, fbm, rnd: (a, b) => a + Math.random() * (b - a), now: 0,
  };

  const effects = [];
  let cur = null, running = true, lastT = 0, acc = 0;
  const times = [];

  const WXMSG = { ' ': 'The clouds disappear.', '~': 'The sky is getting cloudy.', "'": 'It starts to rain.', '"': 'The rain is pouring down.', '*': 'It starts to snow.' };
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
    env.panes = [...stage.querySelectorAll('.pane')]
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({ id: el.id, name: el.dataset.name, ...rel(el.getBoundingClientRect(), s), border: parseFloat(getComputedStyle(el).borderTopWidth) }));
    const out = $('out');
    env.out = rel(out.getBoundingClientRect(), s);
    env.lines = [];
    for (const p of out.querySelectorAll('p')) {
      if (p.id === 'prompt' || p.classList.contains('inp') || !p.textContent.trim()) continue;
      const range = document.createRange(); range.selectNodeContents(p);
      for (const r of range.getClientRects()) if (r.width > 2 && r.bottom > s.top) env.lines.push(rel(r, s));
    }
    const pr = $('prompt').getBoundingClientRect();
    const solidTop = pr.top - s.top - 2;
    env.protect = { solidTop, fadeTop: solidTop - 3.5 * parseFloat(getComputedStyle(stage).fontSize), left: Math.min(90, env.W * 0.05) };
    const fs = parseFloat(getComputedStyle(stage).fontSize);
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

  function clearAll() { back.clearRect(0, 0, env.W, env.H); front.clearRect(0, 0, env.W, env.H); }

  function applyMask(ctx) {
    const p = env.protect;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1;
    const g = ctx.createLinearGradient(0, p.fadeTop, 0, p.solidTop);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = g; ctx.fillRect(0, p.fadeTop, env.W, p.solidTop - p.fadeTop);
    ctx.fillStyle = '#000'; ctx.fillRect(0, p.solidTop, env.W, env.H - p.solidTop + 2);
    const gl = ctx.createLinearGradient(0, 0, p.left, 0);
    gl.addColorStop(0, 'rgba(0,0,0,.85)'); gl.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gl; ctx.fillRect(0, 0, p.left, p.fadeTop);
    ctx.restore();
  }

  function frame(t) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dtRaw = Math.min(0.1, (t - lastT) / 1000 || 0); lastT = t;
    if (!cur) return;
    const cap = cur.fps || 60;
    acc += dtRaw;
    if (cap < 60 && acc < 1 / cap - 0.004) return;
    const dt = Math.min(0.1, acc); acc = 0;
    env.now = t;
    const t0 = performance.now();
    if (!cur.manualClear) clearAll();
    try { cur.frame(env, dt, t); } catch (e) { console.error(e); }
    applyMask(back); applyMask(front);
    const ms = performance.now() - t0;
    times.push(ms); if (times.length > 180) times.shift();
    if ((t | 0) % 15 === 0 || times.length % 20 === 0) showPerf();
  }
  function showPerf() {
    if (!times.length) return;
    const sorted = [...times].sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    $('perf').innerHTML = `ritning <b>${avg.toFixed(2)} ms</b> snitt · ${p95.toFixed(2)} ms p95 · ${cur.fps || 60} fps-tak`;
  }

  function select(id) {
    if (cur && cur.destroy) cur.destroy(env);
    clearAll();
    cur = effects.find((e) => e.id === id) || null;
    times.length = 0; $('perf').textContent = '';
    document.querySelectorAll('#fxList button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === (cur ? cur.id : ''))));
    $('fxTitle').innerHTML = cur ? `<b>${cur.title}</b>` : '<b>Av</b>';
    $('fxNote').textContent = cur ? cur.note : 'Inga effekter. Så här ser klienten ut idag.';
    if (cur) {
      if (cur.preset) for (const k of ['weather', 'fog', 'light']) if (k in cur.preset) setState(k, cur.preset[k], true);
      try { cur.init && cur.init(env); cur.resize && cur.resize(env); } catch (e) { console.error(e); }
      try { history.replaceState(null, '', '#' + cur.id); } catch (e) {}
    }
    syncButtons();
  }

  function setState(key, v, silent) {
    const prev = state[key]; state[key] = v; state.changedAt = performance.now();
    $('wxMsg').textContent = (WXMSG[state.weather] || '') + (FOGMSG[state.fog] || '');
    $('prompt').textContent = `${state.light}#${state.weather.trim()}${state.fog} S> `;
    $('sunIcon').textContent = state.light === '*' ? '☼' : state.light === ')' ? '☾' : '·';
    syncButtons();
    if (prev !== v && cur && cur.onState) try { cur.onState(env, key, v, prev); } catch (e) { console.error(e); }
  }
  function syncButtons() {
    for (const [gid, key] of [['gWeather', 'weather'], ['gFog', 'fog'], ['gLight', 'light']])
      document.querySelectorAll(`#${gid} button`).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === state[key])));
  }

  function wire() {
    for (const [gid, key] of [['gWeather', 'weather'], ['gFog', 'fog'], ['gLight', 'light']])
      $(gid).addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (b) setState(key, b.dataset.v); });
    $('gEvents').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-e]'); if (!b) return;
      const name = b.dataset.e;
      if (name === 'sun.rise') setState('light', '*');
      if (name === 'sun.set' || name === 'darkness.start') setState('light', 'o');
      if (name === 'moon.rise') setState('light', ')');
      if (cur && cur.onEvent) try { cur.onEvent(env, name); } catch (err) { console.error(err); }
    });
    $('btnPause').addEventListener('click', () => {
      running = !running; $('btnPause').textContent = running ? 'Pausa' : 'Spela';
      if (running) { lastT = performance.now(); requestAnimationFrame(frame); }
    });
    const list = $('fxList');
    const mk = (id, title, family) => {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.id = id; b.setAttribute('role', 'tab');
      b.innerHTML = `<span>${title}</span><small>${family}</small>`;
      b.addEventListener('click', () => select(id)); list.appendChild(b);
    };
    mk('', 'Av', 'ingen effekt');
    for (const e of effects) mk(e.id, e.title, e.family || '');
    let pending = 0;
    new ResizeObserver(() => { cancelAnimationFrame(pending); pending = requestAnimationFrame(() => { measure(); if (cur && cur.resize) try { cur.resize(env); } catch (e) { console.error(e); } }); }).observe(stage);
  }

  window.WX = {
    register(e) { effects.push(e); },
    start() {
      const go = () => {
        measure(); wire(); setState('weather', state.weather, true);
        const want = (location.hash || '').slice(1);
        select(effects.some((e) => e.id === want) ? want : (effects[0] ? effects[0].id : ''));
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) { running = false; $('btnPause').textContent = 'Spela'; }
        lastT = performance.now(); requestAnimationFrame(frame);
      };
      (document.fonts ? document.fonts.ready : Promise.resolve()).then(go);
    },
    env,
  };
})();
