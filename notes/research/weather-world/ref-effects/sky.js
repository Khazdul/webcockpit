// Sky family: real clouds on the back layer, dawn/dusk light moments,
// a night sky with stars, a rising moon and shooting stars, and a darkness
// spell that creeps in as ink. One shared engine, three entry points.
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sst = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const ease = (cur, tgt, dt, tau) => cur + (tgt - cur) * (1 - Math.exp(-dt / tau));
  const lerp = (a, b, k) => a + (b - a) * k;
  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }

  // ---------------------------------------------------------------- palettes
  // lit / shadow / rim colour of cloud sprites, opacity baked into the sprite,
  // and the faint sky tint behind them.
  const PAL = [
    { lit: [240, 244, 250], sh: [96, 106, 124], rim: [255, 255, 255], rk: 0.42, op: 0.6, sky: [10, 28, 56], skyA: 0.55 },  // 0 day
    { lit: [146, 153, 164], sh: [40, 44, 52], rim: [180, 186, 196], rk: 0.10, op: 0.66, sky: [22, 25, 30], skyA: 0.85 },     // 1 overcast
    { lit: [255, 210, 150], sh: [104, 64, 84], rim: [255, 176, 84], rk: 0.95, op: 0.6, sky: [58, 26, 36], skyA: 0.35 },      // 2 gold
    { lit: [244, 118, 96], sh: [62, 24, 52], rim: [255, 84, 58], rk: 1.0, op: 0.6, sky: [66, 12, 30], skyA: 0.35 },          // 3 crimson
    { lit: [100, 108, 160], sh: [26, 28, 56], rim: [150, 160, 236], rk: 0.55, op: 0.52, sky: [12, 16, 48], skyA: 0.65 },     // 4 dusk
    { lit: [104, 120, 148], sh: [12, 16, 27], rim: [206, 222, 255], rk: 0.95, op: 0.86, sky: [5, 10, 26], skyA: 0.65 },      // 5 moon
    { lit: [44, 49, 58], sh: [8, 10, 13], rim: [74, 84, 100], rk: 0.30, op: 0.6, sky: [3, 5, 9], skyA: 0.5 },              // 6 dark
  ];
  const NP = PAL.length;
  const SS = 0.75; // sprite resolution (sprite px per css px)

  // ------------------------------------------------------------- cloud shapes
  function buildShape(kind, seed, noise) {
    const R = rng(seed * 7919 + 13);
    const bw = kind === 'sm' ? 64 + R() * 60 : kind === 'cu' ? 170 + R() * 150 : 320 + R() * 300;
    const P = [];
    const add = (x, y, r) => P.push(x, y, r);
    if (kind === 'st') {
      const n1 = 10 + ((R() * 8) | 0);
      for (let i = 0; i < n1; i++) { const u = 0.05 + 0.9 * i / (n1 - 1) + (R() - 0.5) * 0.04; const r = bw * (0.035 + R() * 0.035); add(u * bw, -r * 0.3 + (R() - 0.5) * 5, r); }
      for (let i = 0; i < 6; i++) { const u = 0.15 + R() * 0.7; const r = bw * (0.04 + R() * 0.04); add(u * bw, -bw * 0.035 - r * 0.4, r); }
    } else {
      const n1 = kind === 'sm' ? 3 + ((R() * 2) | 0) : 4 + ((R() * 4) | 0);
      for (let i = 0; i < n1; i++) {
        const u = 0.12 + 0.76 * i / (n1 - 1) + (R() - 0.5) * 0.06, bell = 1 - Math.abs(u - 0.5) * 1.3;
        const r = bw * (0.09 + 0.08 * bell + R() * 0.03); add(u * bw, -r * 0.45, r);
      }
      const n2 = kind === 'sm' ? 1 + ((R() * 2) | 0) : 2 + ((R() * 3) | 0);
      for (let i = 0; i < n2; i++) { const u = 0.28 + R() * 0.44; const r = bw * (0.13 + R() * 0.07); add(u * bw, -bw * 0.08 - r * 0.55, r); }
      if (kind === 'cu') {
        const n3 = 1 + ((R() * 2) | 0);
        for (let i = 0; i < n3; i++) { const u = 0.36 + R() * 0.28; const r = bw * (0.11 + R() * 0.06); add(u * bw, -bw * 0.2 - r * 0.5, r); }
      }
    }
    // cauliflower bumps on the upper surface
    const nb = kind === 'sm' ? 10 : kind === 'cu' ? 26 : 16;
    const base = P.length / 3;
    for (let k = 0; k < nb; k++) {
      const j = ((R() * base) | 0) * 3;
      const a = -Math.PI * (0.08 + 0.84 * R()), pr = P[j + 2];
      const rr = pr * (kind === 'st' ? 0.35 + R() * 0.2 : 0.26 + R() * 0.22);
      add(P[j] + Math.cos(a) * pr * 0.8, P[j + 1] + Math.sin(a) * pr * 0.8, rr);
    }
    let x0 = 1e9, x1 = -1e9, y0 = 1e9;
    for (let i = 0; i < P.length; i += 3) { x0 = Math.min(x0, P[i] - P[i + 2]); x1 = Math.max(x1, P[i] + P[i + 2]); y0 = Math.min(y0, P[i + 1] - P[i + 2]); }
    const y1 = kind === 'st' ? 14 : 5;
    x0 -= 4; x1 += 4; y0 -= 4;
    const gw = Math.ceil((x1 - x0) * SS), gh = Math.ceil((y1 - y0) * SS);
    const n = gw * gh, D = new Float32Array(n), SL = new Float32Array(n);
    const lx = -0.28, ly = -0.96, lz = 0.45, ll = Math.hypot(lx, ly, lz);
    const cloudH = -y0;
    const ns = seed * 3.7;
    for (let py = 0; py < gh; py++) {
      const y = y0 + (py + 0.5) / SS;
      for (let px = 0; px < gw; px++) {
        const x = x0 + (px + 0.5) / SS;
        let mx = 0, sum = 0, nx = 0, ny = 0, ws = 0;
        for (let i = 0; i < P.length; i += 3) {
          const dx = x - P[i], dy = y - P[i + 1], r = P[i + 2];
          const q = (dx * dx + dy * dy) / (r * r);
          if (q < 1) { const v = 1 - q; sum += v; if (v > mx) mx = v; const w = v * v * v; nx += dx / r * w; ny += dy / r * w; ws += w; }
        }
        if (ws > 0) { nx /= ws; ny /= ws; }
        // sphere shading of the dominant puff: every bulge gets its own lit cap
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        SL[py * gw + px] = clamp((nx * lx + ny * ly + nz * lz) / ll, 0, 1);
        let d = mx + 0.3 * (sum - mx);
        if (d <= 0) continue;
        const bo = kind === 'st' ? noise(x * 0.035 + ns, 3.1) * 16 - 6 : noise(x * 0.05 + ns, 7.3) * 3 - 1;
        d *= sst(bo + 3, bo - 6, y);
        d += (noise(x * 0.07 + ns, y * 0.07) * 0.65 + noise(x * 0.16, y * 0.16 + ns) * 0.35 - 0.5) * 0.2;
        D[py * gw + px] = d > 0 ? d : 0;
      }
    }
    // lighting: occlusion toward the light (from above, slightly left)
    const A = new Float32Array(n), L = new Float32Array(n), RM = new Float32Array(n);
    const steps = [3, 6, 10, 16, 24], wts = [0.3, 0.28, 0.25, 0.2, 0.15];
    for (let py = 0; py < gh; py++) {
      const y = y0 + (py + 0.5) / SS;
      const hf = clamp(-y / cloudH, 0, 1);
      for (let px = 0; px < gw; px++) {
        const i = py * gw + px, d = D[i];
        if (d <= 0.02) continue;
        let occ = 0;
        for (let k = 0; k < steps.length; k++) {
          const sx = (px + lx * steps[k] * SS) | 0, sy = (py + ly * steps[k] * SS) | 0;
          if (sx >= 0 && sy >= 0 && sx < gw && sy < gh) occ += Math.min(D[sy * gw + sx], 1) * wts[k];
        }
        const a = sst(0.04, 0.17, d);
        const x = x0 + (px + 0.5) / SS;
        let l = (0.4 * SL[i] + 0.6 * Math.exp(-occ * 1.3)) * (kind === 'st' ? 0.7 + 0.3 * hf : 0.5 + 0.5 * hf);
        l = 0.05 + 1.3 * l;
        l *= 0.86 + 0.28 * noise(x * 0.05 + ns, y * 0.05);
        A[i] = a * (0.62 + 0.38 * sst(0.0, 0.5, d));
        L[i] = clamp(l, 0, 1);
        RM[i] = a * (1 - sst(0.04, 0.42, d)) * (0.35 + 0.65 * Math.exp(-occ * 2.2));
      }
    }
    return { gw, gh, cw: gw / SS, ch: gh / SS, A, L, RM, sprites: new Array(NP).fill(null) };
  }

  function paint(sh, pi) {
    if (sh.sprites[pi]) return sh.sprites[pi];
    const p = PAL[pi], c = mkCanvas(sh.gw, sh.gh), g = c.getContext('2d');
    const img = g.createImageData(sh.gw, sh.gh), o = img.data;
    const { A, L, RM } = sh;
    for (let i = 0, n = sh.gw * sh.gh; i < n; i++) {
      const a = A[i]; if (a <= 0.003) continue;
      const l = L[i], r = RM[i] * p.rk, j = i * 4;
      o[j] = Math.min(255, p.sh[0] + (p.lit[0] - p.sh[0]) * l + p.rim[0] * r);
      o[j + 1] = Math.min(255, p.sh[1] + (p.lit[1] - p.sh[1]) * l + p.rim[1] * r);
      o[j + 2] = Math.min(255, p.sh[2] + (p.lit[2] - p.sh[2]) * l + p.rim[2] * r);
      o[j + 3] = Math.min(255, 255 * p.op * (a * (0.78 + 0.32 * l) + r * 0.35));
    }
    g.putImageData(img, 0, 0);
    sh.sprites[pi] = c;
    return c;
  }

  // shared, built once per page
  let SHAPES = null;
  const KINDS = [];
  function ensureShapes(env) {
    if (SHAPES) return;
    SHAPES = [];
    let seed = 1;
    const push = (kind, cnt) => { for (let i = 0; i < cnt; i++) { SHAPES.push(buildShape(kind, seed++, env.noise)); KINDS.push(kind); } };
    push('sm', 8); push('cu', 11); push('st', 14);
    // paint every palette up front: lazy painting mid-moment would spike frames
    for (const sh of SHAPES) for (let p = 0; p < NP; p++) paint(sh, p);
  }

  // ------------------------------------------------------------ sprites misc
  function glowSprite(r, rgb, a0) {
    const c = mkCanvas(r * 2, r * 2), g = c.getContext('2d');
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, `rgba(${rgb},${a0})`); gr.addColorStop(0.25, `rgba(${rgb},${a0 * 0.45})`);
    gr.addColorStop(0.6, `rgba(${rgb},${a0 * 0.12})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2); return c;
  }
  function moonSprite(R, noise) {
    const S = 2, c = mkCanvas(R * 2 * S + 4, R * 2 * S + 4), g = c.getContext('2d');
    const cx = c.width / 2, cy = c.height / 2, r = R * S;
    const img = g.createImageData(c.width, c.height), o = img.data;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r, q = dx * dx + dy * dy;
      if (q > 1.02) continue;
      const z = Math.sqrt(Math.max(0, 1 - q));
      // maria: large dark patches; small craters
      const m = noise(dx * 2.2 + 4, dy * 2.2 + 9) * 0.7 + noise(dx * 5 + 1, dy * 5 + 3) * 0.3;
      const mar = sst(0.5, 0.72, m) * 0.2;
      const cr = sst(0.74, 0.86, noise(dx * 9 + 20, dy * 9 + 7)) * 0.08;
      const limb = 0.62 + 0.38 * Math.pow(z, 0.5);
      // slight gibbous phase: shade the left limb
      const ph = sst(-1.15, -0.55, dx + (1 - z) * 0.3);
      const v = limb * (1 - mar - cr) * (0.25 + 0.75 * ph);
      const j = (y * c.width + x) * 4;
      o[j] = 222 * v + 10; o[j + 1] = 228 * v + 12; o[j + 2] = 238 * v + 18;
      o[j + 3] = 255 * clamp((1.02 - q) * 40, 0, 1);
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  function starSprite() {
    const c = mkCanvas(24, 24), g = c.getContext('2d');
    const gr = g.createRadialGradient(12, 12, 0, 12, 12, 7);
    gr.addColorStop(0, 'rgba(235,242,255,1)'); gr.addColorStop(0.3, 'rgba(200,215,255,.35)'); gr.addColorStop(1, 'rgba(200,215,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 24, 24);
    const h = g.createLinearGradient(0, 0, 24, 0);
    h.addColorStop(0, 'rgba(210,225,255,0)'); h.addColorStop(0.5, 'rgba(225,235,255,.7)'); h.addColorStop(1, 'rgba(210,225,255,0)');
    g.fillStyle = h; g.fillRect(0, 11.5, 24, 1);
    const v = g.createLinearGradient(0, 0, 0, 24);
    v.addColorStop(0, 'rgba(210,225,255,0)'); v.addColorStop(0.5, 'rgba(225,235,255,.7)'); v.addColorStop(1, 'rgba(210,225,255,0)');
    g.fillStyle = v; g.fillRect(11.5, 0, 1, 24);
    return c;
  }
  function edgeGlint() {
    const c = mkCanvas(256, 12), g = c.getContext('2d');
    const h = g.createLinearGradient(0, 0, 256, 0);
    h.addColorStop(0, 'rgba(255,255,255,0)'); h.addColorStop(0.5, 'rgba(255,255,255,1)'); h.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = h; g.globalAlpha = 0.22; g.fillRect(0, 2, 256, 8); g.globalAlpha = 0.5; g.fillRect(0, 4, 256, 4);
    g.globalAlpha = 1; g.fillRect(0, 5.5, 256, 1.2);
    return c;
  }

  // -------------------------------------------------------- moment colours
  const RISE_K = [[0, 6], [0.18, 4], [0.34, 3], [0.55, 2], [0.85, 0], [1, 0]];
  const SET_K = [[0, 0], [0.16, 2], [0.42, 3], [0.68, 4], [0.92, 6], [1, 6]];
  const RISE_C = [[0, [90, 60, 150]], [0.2, [230, 110, 140]], [0.4, [255, 170, 80]], [0.7, [255, 222, 160]], [1, [255, 244, 220]]];
  const SET_C = [[0, [255, 196, 96]], [0.2, [255, 150, 60]], [0.45, [232, 56, 52]], [0.7, [150, 48, 110]], [0.88, [50, 64, 150]], [1, [24, 32, 90]]];
  function keyPal(K, p, out, m) {
    for (let i = 0; i < K.length - 1; i++) if (p <= K[i + 1][0]) {
      const k = sst(0, 1, (p - K[i][0]) / (K[i + 1][0] - K[i][0]));
      out[K[i][1]] += (1 - k) * m; out[K[i + 1][1]] += k * m; return;
    }
    out[K[K.length - 1][1]] += m;
  }
  function keyCol(K, p, out) {
    for (let i = 0; i < K.length - 1; i++) if (p <= K[i + 1][0]) {
      const k = (p - K[i][0]) / (K[i + 1][0] - K[i][0]);
      for (let c = 0; c < 3; c++) out[c] = lerp(K[i][1][c], K[i + 1][1][c], k); return;
    }
    for (let c = 0; c < 3; c++) out[c] = K[K.length - 1][1][c];
  }

  const COVER = { ' ': 0.22, '~': 0.6, "'": 0.92, '"': 1, '*': 0.86 };
  const WET = { ' ': 0, '~': 0.12, "'": 0.75, '"': 1, '*': 0.55 };
  const FOGK = { '': 1, '-': 0.7, '=': 0.4 };
  const LAYERS = [
    { sc: 0.55, spd: 4, am: 0.72, y0: 0.0, y1: 0.24 },
    { sc: 0.8, spd: 8, am: 0.88, y0: 0.04, y1: 0.5 },
    { sc: 1.05, spd: 14, am: 1, y0: 0.08, y1: 0.8 },
  ];

  // ================================================================ engine
  function Sky(env, cfg) {
    ensureShapes(env);
    this.cfg = cfg;
    this.T = 0;
    this.frameNo = 0;
    const st = env.state;
    this.cover = (COVER[st.weather] ?? 0.5) + (cfg.coverBias || 0);
    this.wet = WET[st.weather] ?? 0;
    this.fogK = FOGK[st.fog] ?? 1;
    this.night = st.light === ')' || st.light === 'o' ? 1 : 0;
    this.moonL = st.light === ')' ? 1 : 0;
    this.palW = new Float32Array(NP); this.palT = new Float32Array(NP);
    this.baseTarget(env.state); this.palW.set(this.palT);
    this.col = new Float32Array(3);
    // cloud instances
    const R = rng(4242);
    this.cl = [];
    for (let i = 0; i < SHAPES.length; i++) {
      const kind = KINDS[i];
      let layer = (R() * 3) | 0;
      if (kind === 'st') layer = R() < 0.45 ? 0 : 1 + (R() < 0.5 ? 1 : 0);
      const Ly = LAYERS[layer];
      const idx = kind === 'sm' ? i : kind === 'cu' ? i - 8 : i - 19;
      const min = kind === 'sm' ? idx * 0.026 : kind === 'cu' ? 0.18 + idx * 0.042 : 0.62 + idx * 0.025;
      this.cl.push({ sh: SHAPES[i], kind, layer, sc: Ly.sc * (0.85 + R() * 0.3), spd: Ly.spd * (0.8 + R() * 0.4), am: Ly.am,
        xF: R(), yF: kind === 'st' ? lerp(Ly.y0, Ly.y0 + (Ly.y1 - Ly.y0) * 0.7, R()) : lerp(Ly.y0, Ly.y1, R()), min, vis: 0, x: 0 });
      if (kind === 'st') this.cl[this.cl.length - 1].sc *= 1.25;
    }
    this.cl.sort((a, b) => a.layer - b.layer);
    for (const c of this.cl) c.vis = this.cloudTarget(c);
    this.moment = null;
    this.dark = null;
    this.moonAnim = null;
    this.moonVis = this.moonL;
    this.shoot = { on: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0, next: cfg.firstShoot || 6 };
    this.starSpr = starSprite();
    this.glint = edgeGlint();
    this.halo = glowSprite(130, '170,190,235', 0.22);
    this.moonR = 24;
    this.moonImg = moonSprite(this.moonR, env.noise);
    this.noiseFn = env.noise;
    if (cfg.autoRise) this.pendingEvent = { name: cfg.autoRise, at: 0.8 };
  }
  const SP = Sky.prototype;

  SP.baseTarget = function (st) {
    const t = this.palT; t.fill(0);
    const wet = WET[st.weather] ?? 0;
    if (st.light === '*') { t[0] = 1 - wet * 0.85; t[1] = wet * 0.85; }
    else if (st.light === ')') { t[5] = 1 - wet * 0.5; t[6] = wet * 0.5; }
    else t[6] = 1;
  };
  SP.cloudTarget = function (c) {
    const cov = this.cover * (this.cfg.cloudMul ?? 1);
    let v = sst(c.min, c.min + 0.1, cov);
    if (c.kind === 'sm') v *= 1 - sst(0.72, 0.88, cov);
    return v;
  };

  SP.resize = function (env) {
    const W = env.W, H = env.H;
    this.W = W; this.H = H;
    for (const c of this.cl) { c.x = c.xF * (W + 400) - 300; c.y = c.yF * H; }
    // text protection map: soft blobs where output lines are
    const s = 1 / 8, pw = Math.ceil(W * s) + 2, ph = Math.ceil(H * s) + 2;
    const a = mkCanvas(pw, ph), g = a.getContext('2d');
    g.fillStyle = '#000';
    let firstY = env.out.y + env.out.h, maxR = 0;
    for (const l of env.lines) {
      g.fillRect((l.x - env.cell.w * 1.5) * s, (l.y - env.cell.h * 0.6) * s, (l.w + env.cell.w * 3) * s, (l.h + env.cell.h * 1.2) * s);
      if (l.y < firstY) firstY = l.y; if (l.x + l.w > maxR) maxR = l.x + l.w;
    }
    const b = mkCanvas(pw, ph), gb = b.getContext('2d');
    try { gb.filter = 'blur(2.5px)'; } catch (e) {}
    gb.drawImage(a, 0, 0); gb.filter = 'none'; gb.globalAlpha = 0.6; gb.drawImage(a, 0, 0);
    this.protectImg = b; this.pS = s;
    this.firstY = firstY;
    // star regions: empty top of the output area and empty pane interiors
    const regs = [];
    const top = { x: env.protect.left + 10, y: 6, w: env.out.x + env.out.w - env.protect.left - 16, h: firstY - env.cell.h * 1.2 - 6 };
    if (top.h > 30) regs.push(top);
    this.topReg = top.h > 30 ? top : null;
    for (const p of env.panes) {
      if (p.name === 'Map') continue;
      const bd = p.border + 4;
      if (p.w > 2 * bd + 20 && p.h > 2 * bd + 20) regs.push({ x: p.x + bd, y: p.y + bd, w: p.w - 2 * bd, h: p.h - 2 * bd });
    }
    this.regs = regs;
    let area = 0; for (const r of regs) area += r.w * r.h;
    const n = Math.min(420, Math.round(area / 2100));
    const R = rng(777);
    this.nStars = n;
    this.stars = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      let u = R() * area, r = regs[0];
      for (const q of regs) { if (u < q.w * q.h) { r = q; break; } u -= q.w * q.h; }
      const big = R();
      this.stars[i * 6] = Math.round(r.x + R() * r.w) + 0.5;
      this.stars[i * 6 + 1] = Math.round(r.y + R() * r.h) + 0.5;
      this.stars[i * 6 + 2] = big > 0.965 ? 2 : big > 0.7 ? 1 : 0; // class
      this.stars[i * 6 + 3] = 0.4 + Math.pow(R(), 1.8) * 0.6; // base brightness
      this.stars[i * 6 + 4] = R() * TAU;
      this.stars[i * 6 + 5] = 0.6 + R() * 2.6;
    }
    // moon path: from below the Comm pane, up behind the pane column, to the open sky left of the Map
    const comm = env.panes.find((p) => p.name === 'Comm');
    const map = env.panes.find((p) => p.name === 'Map');
    const endX = map ? Math.max(env.protect.left + 60, map.x - W * 0.12) : W * 0.42;
    const endY = Math.max(48, Math.min(H * 0.12, (this.topReg ? this.topReg.y + this.topReg.h * 0.45 : H * 0.12)));
    this.mp = comm
      ? [comm.x + comm.w * 0.3, comm.y + comm.h + 30, comm.x + comm.w * 0.18, -H * 0.12, endX, endY]
      : [W * 0.85, H * 0.9, W * 0.7, H * 0.08, endX, endY];
    // ray canvas (half res)
    // darkness edge gradients
    const fx = env.front;
    this.gTop = fx.createLinearGradient(0, 0, 0, H * 0.35);
    this.gTop.addColorStop(0, 'rgba(4,2,8,.9)'); this.gTop.addColorStop(1, 'rgba(4,2,8,0)');
    this.gRight = fx.createLinearGradient(W, 0, W * 0.72, 0);
    this.gRight.addColorStop(0, 'rgba(4,2,8,.9)'); this.gRight.addColorStop(1, 'rgba(4,2,8,0)');
    if (this.dark) this.buildTendrils();
  };

  SP.onState = function (env, key, v) {
    if (key === 'light' && this.moonAnim && v !== ')') this.moonAnim = null;
  };
  SP.onEvent = function (env, name) {
    if (name === 'sun.rise' || name === 'sun.set') {
      this.moment = { kind: name === 'sun.rise' ? 'rise' : 'set', t0: this.T, dur: name === 'sun.rise' ? 9 : 10 };
    } else if (name === 'moon.rise') {
      this.moonAnim = { t0: this.T, dur: 17 };
      this.moonVis = 1;
    } else if (name === 'darkness.start') {
      this.dark = { t0: this.T, seed: (Math.random() * 1000) | 0 };
      this.buildTendrils();
    }
  };

  // ------------------------------------------------------------------ frame
  SP.frame = function (env, dt) {
    this.T += dt; this.frameNo++;
    const T = this.T, st = env.state, cfg = this.cfg;
    if (this.pendingEvent && T > this.pendingEvent.at) {
      const n = this.pendingEvent.name; this.pendingEvent = null;
      // one-off: press the real event button so the simulated GMCP light follows
      const btn = document.querySelector(`#gEvents [data-e="${n}"]`);
      if (btn) btn.click(); else this.onEvent(env, n);
    }
    // ease global state
    this.cover = ease(this.cover, (COVER[st.weather] ?? 0.5) + (cfg.coverBias || 0), dt, 2.5);
    this.wet = ease(this.wet, WET[st.weather] ?? 0, dt, 2.5);
    this.fogK = ease(this.fogK, FOGK[st.fog] ?? 1, dt, 2);
    this.night = ease(this.night, st.light === ')' || st.light === 'o' ? 1 : 0, dt, 2.5);
    this.moonL = ease(this.moonL, st.light === ')' ? 1 : 0, dt, 2.5);
    this.baseTarget(st);
    let mP = -1, mI = 0;
    const M = this.moment;
    if (M) {
      mP = (T - M.t0) / M.dur;
      if (mP >= 1) { this.moment = null; mP = -1; }
      else {
        const env1 = sst(0, 0.06, mP) * (1 - sst(0.94, 1, mP));
        const t = this.palT; for (let i = 0; i < NP; i++) t[i] *= 1 - env1;
        keyPal(M.kind === 'rise' ? RISE_K : SET_K, mP, t, env1);
        mI = M.kind === 'rise' ? sst(0.04, 0.3, mP) * (1 - sst(0.62, 1, mP)) : sst(0, 0.14, mP) * (1 - sst(0.6, 1, mP));
        keyCol(M.kind === 'rise' ? RISE_C : SET_C, mP, this.col);
      }
    }
    const pTau = M ? 0.35 : 2.2;
    for (let i = 0; i < NP; i++) this.palW[i] = ease(this.palW[i], this.palT[i], dt, pTau);

    const b = env.back;
    const rays = cfg.rays && mI > 0.002;
    if (rays) { this.drawRaysBack(env, mP, mI); this.protectText(b, 0.88); }
    this.drawSkyTint(b, env);
    if (cfg.stars) this.drawStars(b, env, dt);
    if (cfg.moon) this.drawMoon(b, env, dt);
    this.drawClouds(b, env, dt);
    // keep the text readable: soften everything under output lines
    this.protectText(b, 0.78);
    if (rays) this.drawRaysFront(env, mP, mI);
    if (cfg.moon) this.drawGlints(env.front, env);
    if (this.dark) this.drawDark(env.front, env);
  };

  SP.protectText = function (b, a) {
    b.globalCompositeOperation = 'destination-out';
    b.globalAlpha = a; b.drawImage(this.protectImg, 0, 0, this.protectImg.width / this.pS, this.protectImg.height / this.pS);
    b.globalAlpha = 1; b.globalCompositeOperation = 'source-over';
  };
  SP.drawSkyTint = function (b, env) {
    let r = 0, g = 0, bl = 0, a = 0, s = 0;
    for (let i = 0; i < NP; i++) { const w = this.palW[i]; if (w < 0.001) continue; const p = PAL[i]; r += p.sky[0] * w; g += p.sky[1] * w; bl += p.sky[2] * w; a += p.skyA * w; s += w; }
    if (s < 0.01) return;
    r /= s; g /= s; bl /= s; a = (a / s) * (this.cfg.skyMul ?? 1) * (0.55 + 0.45 * this.fogK);
    const gr = b.createLinearGradient(0, 0, 0, env.H * 0.62);
    gr.addColorStop(0, `rgba(${r | 0},${g | 0},${bl | 0},${a.toFixed(3)})`);
    gr.addColorStop(0.55, `rgba(${r | 0},${g | 0},${bl | 0},${(a * 0.35).toFixed(3)})`);
    gr.addColorStop(1, `rgba(${r | 0},${g | 0},${bl | 0},0)`);
    b.fillStyle = gr; b.fillRect(0, 0, env.W, env.H * 0.62);
  };

  SP.drawClouds = function (b, env, dt) {
    const W = env.W;
    // top two palettes
    let b1 = 0, b2 = -1, w1 = -1, w2 = -1;
    for (let i = 0; i < NP; i++) { const w = this.palW[i]; if (w > w1) { b2 = b1; w2 = w1; b1 = i; w1 = w; } else if (w > w2) { b2 = i; w2 = w; } }
    let lo = b1, hi = -1, kHi = 0;
    if (b2 >= 0 && w2 > 0.02) { lo = Math.min(b1, b2); hi = Math.max(b1, b2); kHi = this.palW[hi] / (w1 + w2); }
    const wind = 1 + this.wet * 0.8;
    const fogA = this.fogK * (this.cfg.cloudAlpha ?? 1);
    for (let i = 0; i < this.cl.length; i++) {
      const c = this.cl[i];
      c.vis = ease(c.vis, this.cloudTarget(c), dt, 2.2);
      const w = c.sh.cw * c.sc, h = c.sh.ch * c.sc;
      c.x += c.spd * wind * dt;
      if (c.x > W + 20) c.x = -w - 20 - Math.random() * 120;
      if (c.vis < 0.01) continue;
      const a = c.vis * c.am * fogA;
      const x = c.x, y = c.y - h * 0.6;
      if (hi < 0) { b.globalAlpha = a; b.drawImage(paint(c.sh, lo), x, y, w, h); }
      else {
        if (kHi < 0.98) { b.globalAlpha = a * (1 - kHi); b.drawImage(paint(c.sh, lo), x, y, w, h); }
        b.globalAlpha = a * kHi; b.drawImage(paint(c.sh, hi), x, y, w, h);
      }
    }
    b.globalAlpha = 1;
  };

  SP.drawStars = function (b, env, dt) {
    // a darkness spell swallows the stars too
    const dk = this.dark ? this.darkG || 0 : 0;
    const vis = this.night * (1 - sst(0.45, 0.85, this.cover)) * (0.25 + 0.75 * this.fogK) * (1 - this.palW[0] - this.palW[2] * 0.7) * (1 - 0.85 * dk);
    if (vis > 0.01) {
      const T = this.T, S = this.stars, n = this.nStars;
      b.fillStyle = '#dfe7ff';
      for (let i = 0; i < n; i++) {
        const o = i * 6, cls = S[o + 2];
        let tw = 0.72 + 0.28 * Math.sin(T * S[o + 5] + S[o + 4]);
        tw *= 0.85 + 0.15 * Math.sin(T * S[o + 5] * 2.7 + S[o + 4] * 3.1);
        const a = S[o + 3] * tw * vis;
        if (a < 0.04) continue;
        if (cls === 2) {
          b.globalAlpha = a; b.drawImage(this.starSpr, S[o] - 12, S[o + 1] - 12);
        } else {
          b.globalAlpha = Math.min(1, a * (cls ? 1.1 : 0.85));
          const s = cls ? 2 : 1.3;
          b.fillRect(S[o] - s / 2, S[o + 1] - s / 2, s, s);
        }
      }
      b.globalAlpha = 1;
    }
    // shooting star
    const sh = this.shoot;
    if (!sh.on) {
      sh.next -= dt;
      if (sh.next <= 0) {
        sh.next = 9 + Math.random() * 14;
        const r = this.topReg || this.regs[0];
        if (r && vis > 0.25) {
          sh.on = true; sh.age = 0; sh.life = 0.55 + Math.random() * 0.35;
          sh.x = r.x + r.w * (0.35 + Math.random() * 0.6); sh.y = r.y + r.h * Math.random() * 0.4;
          const ang = Math.PI * (0.7 + Math.random() * 0.08), sp = 560 + Math.random() * 300;
          sh.vx = Math.cos(ang) * sp; sh.vy = Math.sin(ang) * sp;
        }
      }
    } else {
      sh.age += dt;
      if (sh.age > sh.life) sh.on = false;
      else {
        const k = sh.age / sh.life, fade = Math.sin(k * Math.PI);
        const hx = sh.x + sh.vx * sh.age, hy = sh.y + sh.vy * sh.age;
        const tl = Math.min(sh.age, 0.13);
        const tx = hx - sh.vx * tl, ty = hy - sh.vy * tl;
        const gr = b.createLinearGradient(tx, ty, hx, hy);
        gr.addColorStop(0, 'rgba(200,215,255,0)'); gr.addColorStop(0.8, 'rgba(215,228,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
        b.strokeStyle = gr; b.lineCap = 'round';
        b.globalAlpha = fade * 0.9 * Math.max(vis, 0.3); b.lineWidth = 1.4;
        b.beginPath(); b.moveTo(tx, ty); b.lineTo(hx, hy); b.stroke();
        b.globalAlpha = fade * 0.25 * Math.max(vis, 0.3); b.lineWidth = 4;
        b.stroke();
        b.globalAlpha = fade * Math.max(vis, 0.3); b.drawImage(this.starSpr, hx - 12, hy - 12);
        b.globalAlpha = 1;
      }
    }
  };

  SP.moonPos = function () {
    const m = this.mp;
    let p = 1;
    if (this.moonAnim) {
      p = (this.T - this.moonAnim.t0) / this.moonAnim.dur;
      if (p >= 1) { this.moonAnim = null; p = 1; }
      else p = sst(0, 1, p) * 0.7 + p * 0.3;
    }
    const u = 1 - p;
    this.mx = u * u * m[0] + 2 * u * p * m[2] + p * p * m[4];
    this.my = u * u * m[1] + 2 * u * p * m[3] + p * p * m[5];
    this.mProg = p;
  };
  SP.drawMoon = function (b, env, dt) {
    const tgt = this.moonL * (1 - 0.8 * sst(0.75, 1, this.cover)) * (0.3 + 0.7 * this.fogK);
    this.moonVis = ease(this.moonVis, this.moonAnim ? Math.max(tgt, 0.9) : tgt, dt, 1.8);
    if (this.moonVis < 0.01) return;
    this.moonPos();
    const R = this.moonR, x = this.mx, y = this.my;
    b.globalAlpha = this.moonVis;
    b.drawImage(this.halo, x - 130, y - 130);
    b.globalAlpha = this.moonVis * 0.55;
    b.drawImage(this.halo, x - 260, y - 260, 520, 520);
    b.globalAlpha = this.moonVis;
    const s = this.moonImg.width / 2;
    b.drawImage(this.moonImg, x - s / 2, y - s / 2, s, s);
    b.globalAlpha = 1;
  };
  SP.drawGlints = function (f, env) {
    if (this.moonVis < 0.02 || this.mx === undefined) return;
    const R = this.moonR, x = this.mx, y = this.my;
    f.globalCompositeOperation = 'lighter';
    for (const p of env.panes) {
      const dyEdge = p.y - y; // >0: moon above the edge
      const dx = x < p.x ? p.x - x : x > p.x + p.w ? x - (p.x + p.w) : 0;
      const near = Math.exp(-(dyEdge * dyEdge) / (R * R * 2.2)) * Math.exp(-(dx * dx) / (R * R * 5));
      const wide = 0.35 * sst(-10, 120, dyEdge) * Math.exp(-(dx * dx) / 40000);
      const a = this.moonVis * Math.min(1, near * 1.2 + wide) * 0.9;
      if (a < 0.02) continue;
      const cx = clamp(x, p.x + 10, p.x + p.w - 10);
      const gw = 90 + near * 160 + wide * 200;
      // clip the glint to the border's own length
      const x0 = Math.max(p.x, cx - gw / 2), x1 = Math.min(p.x + p.w, cx + gw / 2);
      if (x1 - x0 < 2) continue;
      const sx0 = (x0 - (cx - gw / 2)) / gw * 256, sx1 = (x1 - (cx - gw / 2)) / gw * 256;
      f.globalAlpha = a * 0.75;
      f.drawImage(this.glint, sx0, 0, sx1 - sx0, 12, x0, p.y - 5.5, x1 - x0, 12);
      if (near > 0.25) { f.globalAlpha = (near - 0.25) * this.moonVis; f.drawImage(this.starSpr, cx - 12, p.y - 11.5); }
    }
    f.globalAlpha = 1; f.globalCompositeOperation = 'source-over';
  };

  // --------------------------------------------------------- dawn / dusk rays
  SP.sunPos = function (kind, p, W, H, out) {
    // rise: low on the right edge, climbing over the top; set: sinks to the left edge
    if (kind === 'rise') { const q = sst(0, 1, p); out[0] = W * (1.07 - 0.2 * q); out[1] = H * (0.06 - 0.5 * q); }
    else { const q = sst(0, 1, p); out[0] = W * (0.22 - 0.3 * q); out[1] = H * (-0.42 + 0.5 * q); }
  };
  SP.drawRaysFront = function (env, p, I) {
    const W = env.W, H = env.H, M = this.moment, S = this._S, f = env.front;
    const c = this.col, rgb = `${c[0] | 0},${c[1] | 0},${c[2] | 0}`;
    const wetK = 1 - 0.65 * this.wet;
    // the light front sweeping across the whole client (front layer, faint)
    const far = Math.hypot(Math.max(S[0], W - S[0]), H - S[1]);
    const near = Math.max(0, -S[1]);
    const front = M.kind === 'rise' ? lerp(near, far * 1.05, sst(0.08, 0.75, p)) : lerp(far * 1.05, near, sst(0.1, 0.85, p));
    const bw = far * 0.28;
    const gr = f.createRadialGradient(S[0], S[1], Math.max(0, front - bw), S[0], S[1], front + bw);
    gr.addColorStop(0, `rgba(${rgb},0)`); gr.addColorStop(0.5, `rgba(${rgb},1)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    f.globalAlpha = 0.085 * I * wetK; f.fillStyle = gr; f.fillRect(0, 0, W, H);
    // panes catch a warm rim on the edges facing the sun
    f.globalCompositeOperation = 'lighter';
    for (const q of env.panes) {
      const cx = q.x + q.w / 2, cy = q.y + q.h / 2;
      const d = Math.hypot(cx - S[0], cy - S[1]);
      const prox = 0.35 + 0.65 * Math.exp(-((d - front) * (d - front)) / (bw * bw * 0.8));
      const a = I * prox * wetK * this.fogK;
      if (a < 0.02) continue;
      const side = S[0] > cx ? q.x + q.w - 0.75 : q.x + 0.75;
      const tg = f.createLinearGradient(S[0] > cx ? q.x + q.w : q.x, 0, S[0] > cx ? q.x : q.x + q.w, 0);
      tg.addColorStop(0, `rgba(${rgb},1)`); tg.addColorStop(1, `rgba(${rgb},0.15)`);
      f.strokeStyle = tg;
      f.globalAlpha = a * 0.22; f.lineWidth = 5;
      f.beginPath(); f.moveTo(q.x, q.y + 1.5); f.lineTo(q.x + q.w, q.y + 1.5); f.stroke();
      f.globalAlpha = a * 0.9; f.lineWidth = 1.2;
      f.beginPath(); f.moveTo(q.x, q.y + 0.6); f.lineTo(q.x + q.w, q.y + 0.6); f.stroke();
      const vg = f.createLinearGradient(0, q.y, 0, q.y + q.h);
      vg.addColorStop(0, `rgba(${rgb},1)`); vg.addColorStop(1, `rgba(${rgb},0)`);
      f.strokeStyle = vg; f.globalAlpha = a * 0.7;
      f.beginPath(); f.moveTo(side, q.y); f.lineTo(side, q.y + q.h); f.stroke();
    }
    f.globalAlpha = 1; f.globalCompositeOperation = 'source-over';
  };
  // rays + glow drawn straight into the back layer (first, so clouds sit over them),
  // then pane shadows erased out of them
  SP.drawRaysBack = function (env, p, I) {
    const W = env.W, H = env.H, M = this.moment, g = env.back;
    const S = this._S || (this._S = new Float32Array(2));
    this.sunPos(M.kind, p, W, H, S);
    const c = this.col;
    // beams are the light itself: lift the moment colour toward white
    const rgb = `${(c[0] + (255 - c[0]) * 0.35) | 0},${(c[1] + (255 - c[1]) * 0.35) | 0},${(c[2] + (255 - c[2]) * 0.3) | 0}`;
    // a near sun (sunset starts high on the left, close to the text) needs less punch
    const k = I * (1 - 0.65 * this.wet) * this.fogK * (M.kind === 'set' ? 0.62 : 1.25);
    g.globalCompositeOperation = 'lighter';
    const sx = S[0], sy = S[1];
    const far = Math.hypot(Math.max(sx, W - sx), H - sy);
    // glow from the sun beyond the top edge
    const gl = g.createRadialGradient(sx, sy, 0, sx, sy, far * 0.75);
    gl.addColorStop(0, `rgba(${rgb},.5)`); gl.addColorStop(0.3, `rgba(${rgb},.16)`); gl.addColorStop(0.6, `rgba(${rgb},.06)`); gl.addColorStop(1, `rgba(${rgb},0)`);
    g.globalAlpha = k; g.fillStyle = gl; g.fillRect(0, 0, W, H);
    // the sun's hot spot where it sits behind the edge
    const hs = g.createRadialGradient(sx, sy, 0, sx, sy, H * 0.45);
    hs.addColorStop(0, `rgba(255,250,235,.9)`); hs.addColorStop(0.12, `rgba(${rgb},.55)`); hs.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = hs; g.fillRect(Math.max(0, sx - H * 0.45), Math.max(0, sy - H * 0.45), H * 0.9, H * 0.9);
    // rays
    const rg = g.createRadialGradient(sx, sy, 0, sx, sy, far * 1.05);
    rg.addColorStop(0, `rgba(${rgb},1)`); rg.addColorStop(0.55, `rgba(${rgb},.62)`); rg.addColorStop(1, `rgba(${rgb},.05)`);
    g.fillStyle = rg;
    let a0 = 1e9, a1 = -1e9;
    for (const [cx, cy] of [[0, 0], [W, 0], [0, H], [W, H]]) { const a = Math.atan2(cy - sy, cx - sx); a0 = Math.min(a0, a); a1 = Math.max(a1, a); }
    const T = this.T, N = 15, L = far * 1.2;
    for (let i = 0; i < N; i++) {
      const r1 = Math.sin(i * 12.9898 + 3) * 43758.5453, j = r1 - Math.floor(r1);
      const a = a0 + (a1 - a0) * (i + 0.5 + (j - 0.5) * 0.7) / N + Math.sin(T * 0.15 + i) * 0.006;
      const wd = 0.008 + j * 0.03;
      const al = (0.3 + 0.7 * ((j * 7.3) % 1)) * (0.7 + 0.3 * Math.sin(T * (0.5 + j) + i * 2.1));
      for (let pass = 0; pass < 2; pass++) {
        const ww = pass ? wd * 0.4 : wd;
        g.globalAlpha = k * (pass ? al * 0.9 : al * 0.5);
        g.beginPath(); g.moveTo(sx, sy);
        g.lineTo(sx + Math.cos(a - ww) * L, sy + Math.sin(a - ww) * L);
        g.lineTo(sx + Math.cos(a + ww) * L, sy + Math.sin(a + ww) * L);
        g.closePath(); g.fill();
      }
    }
    g.globalAlpha = 1;
    // pane shadows: soft wedges behind each pane, away from the sun
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';
    const pts = this._pts || (this._pts = new Float32Array(16));
    for (let pass = 0; pass < 2; pass++) {
      const ox = pass ? -18 : 18;
      g.globalAlpha = 0.45;
      for (const q of env.panes) {
        CX[0] = CX[3] = q.x; CX[1] = CX[2] = q.x + q.w; CY[0] = CY[1] = q.y; CY[2] = CY[3] = q.y + q.h;
        const X = CX, Y = CY;
        for (let i = 0; i < 4; i++) {
          const dx = X[i] - (sx + ox), dy = Y[i] - sy, dl = Math.hypot(dx, dy) || 1;
          pts[i * 2] = X[i]; pts[i * 2 + 1] = Y[i];
          pts[8 + i * 2] = X[i] + dx / dl * 4000; pts[8 + i * 2 + 1] = Y[i] + dy / dl * 4000;
        }
        hullFill(g, pts);
      }
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  };
  // convex hull of 8 points (monotone chain), filled
  const HI = new Int32Array(8), HU = new Int32Array(17), CX = new Float32Array(4), CY = new Float32Array(4);
  function hullFill(g, pts) {
    for (let i = 0; i < 8; i++) HI[i] = i;
    // insertion sort by x then y
    for (let i = 1; i < 8; i++) { const v = HI[i]; let j = i - 1; while (j >= 0 && (pts[HI[j] * 2] > pts[v * 2] || (pts[HI[j] * 2] === pts[v * 2] && pts[HI[j] * 2 + 1] > pts[v * 2 + 1]))) { HI[j + 1] = HI[j]; j--; } HI[j + 1] = v; }
    const cr = (o, a, b) => (pts[a * 2] - pts[o * 2]) * (pts[b * 2 + 1] - pts[o * 2 + 1]) - (pts[a * 2 + 1] - pts[o * 2 + 1]) * (pts[b * 2] - pts[o * 2]);
    let k = 0;
    for (let i = 0; i < 8; i++) { while (k >= 2 && cr(HU[k - 2], HU[k - 1], HI[i]) <= 0) k--; HU[k++] = HI[i]; }
    for (let i = 6, t = k + 1; i >= 0; i--) { while (k >= t && cr(HU[k - 2], HU[k - 1], HI[i]) <= 0) k--; HU[k++] = HI[i]; }
    g.beginPath(); g.moveTo(pts[HU[0] * 2], pts[HU[0] * 2 + 1]);
    for (let i = 1; i < k - 1; i++) g.lineTo(pts[HU[i] * 2], pts[HU[i] * 2 + 1]);
    g.closePath(); g.fill();
  }

  // ------------------------------------------------------- darkness: ink
  const TK = 22;
  SP.buildTendrils = function () {
    const W = this.W, H = this.H, R = rng(this.dark.seed + 1);
    const td = [];
    const mk = (x, y, ang, len, w0, parent) => td.push({ x, y, ang, len, w0, ph: R() * 100, curl: (R() < 0.5 ? -1 : 1) * (0.6 + R() * 0.8), delay: R() * 0.25 + (parent ? 0.25 : 0) });
    for (let i = 0; i < 11; i++) { const x = W * (0.06 + 0.92 * (i + R() * 0.8) / 11); mk(x, -6, Math.PI / 2 + (R() - 0.5) * 0.9, 120 + R() * 220, 16 + R() * 22); }
    for (let i = 0; i < 7; i++) { const y = H * (0.04 + 0.62 * (i + R() * 0.8) / 7); mk(W + 6, y, Math.PI + (R() - 0.5) * 0.9, 110 + R() * 200, 16 + R() * 20); }
    this.td = td;
    this.tp = new Float32Array(td.length * TK * 2);
    this.tn = new Float32Array(td.length * TK * 2);
    this.tnc = new Int32Array(td.length);
    // per-step bend: smooth random walk, fixed per spell
    this.tj = new Float32Array(td.length * TK);
    for (let i = 0; i < td.length; i++) for (let k = 0; k < TK; k++) this.tj[i * TK + k] = (this.noiseFn(td[i].ph + k * 0.28, i * 3.3) - 0.5) * 0.7;
  };
  SP.drawDark = function (f, env) {
    const d = this.dark, t = this.T - d.t0;
    const grow = sst(0, 2.6, t), recede = sst(5.2, 8.2, t);
    if (t > 8.4) { this.dark = null; return; }
    const g = grow * (1 - recede);
    this.darkG = g;
    // edge darkening
    f.globalAlpha = g * 0.75; f.fillStyle = this.gTop; f.fillRect(0, 0, env.W, env.H * 0.35);
    f.fillStyle = this.gRight; f.fillRect(env.W * 0.72, 0, env.W * 0.28, env.H);
    const td = this.td, P = this.tp, NO = this.tn, NN = this.tnc, J = this.tj;
    for (let i = 0; i < td.length; i++) {
      const q = td[i];
      const gi = clamp((g - q.delay * (1 - recede)) / (1 - q.delay), 0, 1);
      const vis = Math.pow(gi, 0.8);
      NN[i] = 0;
      if (vis < 0.02) continue;
      const n = Math.max(2, Math.round(vis * TK));
      NN[i] = n;
      let x = q.x, y = q.y, a = q.ang;
      const step = q.len / TK, o = i * TK * 2, jo = i * TK;
      for (let k = 0; k < n; k++) {
        P[o + k * 2] = x; P[o + k * 2 + 1] = y;
        const kk = k / TK;
        a += J[jo + k] + Math.sin(this.T * 0.9 + k * 0.5 + q.ph) * 0.05 + q.curl * 0.75 * kk * kk * kk;
        x += Math.cos(a) * step; y += Math.sin(a) * step;
      }
      // half-width normals, computed once and scaled per pass
      for (let k = 0; k < n; k++) {
        const k2 = Math.min(n - 1, k + 1), k0 = Math.max(0, k - 1);
        const dx = P[o + k2 * 2] - P[o + k0 * 2], dy = P[o + k2 * 2 + 1] - P[o + k0 * 2 + 1], dl = Math.hypot(dx, dy) || 1;
        const w = q.w0 * 0.5 * Math.pow(1 - k / n, 0.9) * (0.6 + 0.4 * vis);
        NO[o + k * 2] = -dy / dl * w; NO[o + k * 2 + 1] = dx / dl * w;
      }
    }
    // one path for all tendrils, filled twice: an offset violet copy gives the ink a glossy rim
    // that reads even over the black background, then the ink core on top
    const path = new Path2D();
    for (let i = 0; i < td.length; i++) {
      const n = NN[i]; if (!n) continue;
      const o = i * TK * 2;
      path.moveTo(P[o] + NO[o], P[o + 1] + NO[o + 1]);
      for (let k = 1; k < n; k++) path.lineTo(P[o + k * 2] + NO[o + k * 2], P[o + k * 2 + 1] + NO[o + k * 2 + 1]);
      for (let k = n - 1; k >= 0; k--) path.lineTo(P[o + k * 2] - NO[o + k * 2], P[o + k * 2 + 1] - NO[o + k * 2 + 1]);
      path.closePath();
    }
    f.fillStyle = 'rgb(120,80,190)';
    f.globalAlpha = 0.5 * g;
    f.translate(-2, -2); f.fill(path);
    f.globalAlpha = 0.22 * g;
    f.translate(4, 4); f.fill(path);
    f.translate(-2, -2);
    f.fillStyle = 'rgb(4,2,8)'; f.globalAlpha = 0.95;
    f.fill(path);
    f.globalAlpha = 1;
  };

  // ------------------------------------------------------------ registration
  function makeEffect(def, cfg) {
    let sky = null;
    WX.register(Object.assign({ family: 'Himmel', fps: 30 }, def, {
      init(env) { sky = new Sky(env, cfg); },
      resize(env) { if (sky) sky.resize(env); },
      frame(env, dt) { if (sky) sky.frame(env, dt); },
      onState(env, k, v, p) { if (sky) sky.onState(env, k, v, p); },
      onEvent(env, n) { if (sky) sky.onEvent(env, n); },
      destroy() { sky = null; },
    }));
  }

  makeEffect({
    id: 'sky-clouds', title: 'Molnhimmel',
    note: 'Riktiga moln i tre djup driver bakom texten och syns genom tomma paneler; byt väder (klart/moln/regn) och ljus (sol/måne/mörker), prova Sun set.',
    preset: { weather: '~', fog: '', light: '*' },
  }, { stars: false, moon: false, rays: false });

  makeEffect({
    id: 'sky-dawn', title: 'Gryning',
    note: 'Soluppgång och solnedgång som ögonblick: ljusstrålar faller bakom panelerna, som kastar skuggkilar, och kanterna glöder; tryck Sun rise och Sun set.',
    preset: { weather: ' ', fog: '', light: 'o' },
  }, { stars: false, moon: false, rays: true, coverBias: 0.18, autoRise: 'sun.rise' });

  makeEffect({
    id: 'sky-night', title: 'Natthimmel',
    note: 'Stjärnhimmel i tomma ytor, månen glider upp bakom panelerna och glänser i kanterna, ibland ett stjärnfall; prova Moon rise och Darkness.',
    preset: { weather: ' ', fog: '', light: ')' },
  }, { stars: true, moon: true, rays: false, coverBias: 0.05, cloudAlpha: 0.9, skyMul: 1.1, firstShoot: 3.2, autoRise: 'moon.rise' });
})();
