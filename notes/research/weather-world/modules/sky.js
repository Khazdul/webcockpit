// Sky module (v4): everything above the weather, on the back layer.
//  - a muted sky that fades out at ~43 % of the height, lighter toward one side
//    (sun / moon / starry night / darkness sky from env.mix), nothing indoors
//  - a faint cirrus texture that gives way when real clouds come in
//  - a perspective cloud deck seen from below in the top ~35 %: big near clouds
//    overhead, small ones toward the horizon, drifting slowly; lit by lightning
//  - stars, and shooting stars that cross the whole screen
//  - a big moon with its real phase that rises, drifts across and sets
//  - sunrise / sunset moments with rays and pane shadow wedges
//  - Event.Darkness: a red ominous bleed from the top and the corners
(() => {
  'use strict';

  // ---------------------------------------------------------------- moon timing
  // In MUME one game hour is one real minute and the moon is up for many game hours.
  // MOON_CROSS_S is the real-game crossing time; DEMO_SPEED compresses it for the demo
  // (full crossing in ~90 s). Set DEMO_SPEED = 1 for real-game pacing.
  const MOON_CROSS_S = 600;
  const DEMO_SPEED = MOON_CROSS_S / 90;
  const MOON_HOLD = 0.86;        // while still up, the moon slows to a halt here (low in the west)
  const MOON_START = 0.55;       // where the moon is when the page loads with the moon already up

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sst = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const ease = (cur, tgt, dt, tau) => cur + (tgt - cur) * (1 - Math.exp(-dt / tau));
  const lerp = (a, b, k) => a + (b - a) * k;
  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }

  // ---------------------------------------------------------------- palettes
  // cloud-base colours seen from below: lit (thin, sun-side edges) / shadow (thick base), opacity
  const PAL = [
    { lit: [214, 216, 218], sh: [118, 122, 130], op: 0.78 },  // 0 day
    { lit: [128, 131, 136], sh: [58, 61, 67], op: 0.86 },     // 1 overcast
    { lit: [250, 196, 136], sh: [112, 78, 86], op: 0.82 },    // 2 gold
    { lit: [236, 112, 92], sh: [74, 34, 56], op: 0.84 },      // 3 crimson
    { lit: [110, 108, 150], sh: [34, 34, 60], op: 0.8 },      // 4 dusk
    { lit: [104, 113, 132], sh: [18, 21, 30], op: 0.86 },     // 5 moon
    { lit: [34, 37, 44], sh: [10, 11, 14], op: 0.84 },        // 6 dark
    { lit: [70, 34, 34], sh: [16, 7, 9], op: 0.88 },         // 7 evil
  ];
  const NP = PAL.length;

  // sky colours: top, horizon, top alpha. Muted, a little desaturated.
  const SKY = {
    day:   { top: [58, 86, 120], hor: [124, 138, 154], a: 0.62 },
    grey:  { top: [62, 66, 73], hor: [96, 99, 104], a: 0.56 },
    moon:  { top: [16, 24, 44], hor: [48, 58, 80], a: 0.66 },
    night: { top: [4, 6, 16], hor: [12, 15, 28], a: 0.75 },
    evil:  { top: [20, 3, 6], hor: [66, 14, 14], a: 0.78 },
  };
  const SKW = 48, SKH = 40;   // sky image resolution (stretched to W x skyH)
  const DS = 4;               // cloud deck: css px per deck px
  const BF = 56;              // cloud deck: frames per rebuild (spread work), cross-faded

  // ------------------------------------------------------------ misc sprites
  function glowSprite(r, rgb, a0) {
    const c = mkCanvas(r * 2, r * 2), g = c.getContext('2d');
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, `rgba(${rgb},${a0})`); gr.addColorStop(0.25, `rgba(${rgb},${a0 * 0.45})`);
    gr.addColorStop(0.6, `rgba(${rgb},${a0 * 0.12})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2); return c;
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

  // The moon: surface (albedo + normals) is computed once; the phase is a cheap relight.
  // a few named-looking craters: x, y, radius (unit disc)
  const CRATERS = [-0.18, 0.62, 0.09, 0.42, -0.35, 0.07, -0.55, -0.2, 0.06, 0.12, 0.18, 0.05, 0.6, 0.35, 0.08, -0.3, -0.62, 0.05, 0.25, 0.75, 0.05];
  function MoonSurface(R, noise) {
    const S = 2, w = Math.ceil(R * 2 * S + 4), cx = w / 2, r = R * S;
    const n = w * w, alb = new Float32Array(n), nx = new Float32Array(n), nz = new Float32Array(n), cov = new Float32Array(n);
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cx) / r, q = dx * dx + dy * dy;
      if (q > 1.02) continue;
      const i = y * w + x, z = Math.sqrt(Math.max(0, 1 - q));
      // rotated, multi-octave noise so the maria do not follow the noise grid
      const rx = dx * 0.8 - dy * 0.6, ry = dx * 0.6 + dy * 0.8;
      const wx = rx + (noise(rx * 3 + 7, ry * 3 + 2) - 0.5) * 0.35, wy = ry + (noise(rx * 3 + 13, ry * 3 + 5) - 0.5) * 0.35;
      const m = noise(wx * 1.9 + 4, wy * 1.9 + 9) * 0.55 + noise(wx * 4.1 + 1, wy * 4.1 + 3) * 0.3 + noise(wx * 8.3 + 5, wy * 8.3 + 1) * 0.15;
      const mar = sst(0.46, 0.7, m) * 0.24;
      let cr = 0;
      for (let k = 0; k < CRATERS.length; k += 3) {
        const ex = dx - CRATERS[k], ey = dy - CRATERS[k + 1], cd = Math.sqrt(ex * ex + ey * ey) / CRATERS[k + 2];
        if (cd < 1.25) cr += cd < 0.85 ? 0.07 * (1 - cd * 0.5) : -0.1 * sst(1.25, 1.0, cd) * sst(0.85, 0.95, cd);
      }
      const fine = (noise(rx * 22 + 3, ry * 22 + 11) - 0.5) * 0.07;
      alb[i] = clamp(1 - mar - cr + fine, 0, 1);
      nx[i] = dx; nz[i] = z;
      cov[i] = clamp((1.02 - q) * 40, 0, 1);
    }
    this.R = R; this.S = S; this.w = w; this.alb = alb; this.nx = nx; this.nz = nz; this.cov = cov;
    this.cv = mkCanvas(w, w); this.g = this.cv.getContext('2d');
    this.img = this.g.createImageData(w, w);
    this.phase = -1;
  }
  // f = illuminated fraction 0..1 (lit side on the right: waxing as seen from the north)
  MoonSurface.prototype.relight = function (f) {
    if (Math.abs(f - this.phase) < 0.002) return;
    this.phase = f;
    const cosA = 1 - 2 * f, sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const sx = sinA, sz = -cosA; // sun direction (x right, z toward the viewer)
    const o = this.img.data, n = this.w * this.w, { alb, nx, nz, cov } = this;
    for (let i = 0; i < n; i++) {
      const c = cov[i], j = i * 4;
      if (c <= 0) { o[j + 3] = 0; continue; }
      const d = nx[i] * sx + nz[i] * sz;
      const lit = sst(-0.07, 0.11, d);
      const limb = 0.62 + 0.38 * Math.sqrt(nz[i]);
      const v = alb[i] * (0.055 + 0.945 * lit * limb * (0.72 + 0.28 * Math.sqrt(Math.max(0, d))));
      o[j] = 224 * v + 9; o[j + 1] = 229 * v + 11; o[j + 2] = 238 * v + 17; o[j + 3] = 255 * c;
    }
    this.g.putImageData(this.img, 0, 0);
  };

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

  // convex hull of 8 points (monotone chain), filled — pane shadow wedges
  // convex hull of 8 points (monotone chain), filled — pane shadow wedges
  const HI = new Int32Array(8), HU = new Int32Array(17), CX = new Float32Array(4), CY = new Float32Array(4);
  function hullFill(g, pts) {
    for (let i = 0; i < 8; i++) HI[i] = i;
    for (let i = 1; i < 8; i++) { const v = HI[i]; let j = i - 1; while (j >= 0 && (pts[HI[j] * 2] > pts[v * 2] || (pts[HI[j] * 2] === pts[v * 2] && pts[HI[j] * 2 + 1] > pts[v * 2 + 1]))) { HI[j + 1] = HI[j]; j--; } HI[j + 1] = v; }
    const cr = (o, a, b) => (pts[a * 2] - pts[o * 2]) * (pts[b * 2 + 1] - pts[o * 2 + 1]) - (pts[a * 2 + 1] - pts[o * 2 + 1]) * (pts[b * 2] - pts[o * 2]);
    let k = 0;
    for (let i = 0; i < 8; i++) { while (k >= 2 && cr(HU[k - 2], HU[k - 1], HI[i]) <= 0) k--; HU[k++] = HI[i]; }
    for (let i = 6, t = k + 1; i >= 0; i--) { while (k >= t && cr(HU[k - 2], HU[k - 1], HI[i]) <= 0) k--; HU[k++] = HI[i]; }
    g.beginPath(); g.moveTo(pts[HU[0] * 2], pts[HU[0] * 2 + 1]);
    for (let i = 1; i < k - 1; i++) g.lineTo(pts[HU[i] * 2], pts[HU[i] * 2 + 1]);
    g.closePath(); g.fill();
  }

  // ================================================================ engine
  function Sky(env) {
    this.T = 0;
    this.noise = env.noise;
    this.palW = new Float32Array(NP); this.palT = new Float32Array(NP);
    this.col = new Float32Array(3);
    this.cover = 0; this.wet = 0; this.fogK = 1;
    this.first = true;
    this.moment = null;
    this.dark = null; this.darkG = 0;
    this.lift = null;
    this.shoot = { on: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, next: 5 };
    this.starSpr = starSprite();
    this.glint = edgeGlint();
    this.halo = glowSprite(130, '170,190,235', 0.22);
    // moon state: u = position along the crossing (0 east/right .. 1 west/left), -1 = not in the sky
    this.u = env.moonUp ? MOON_START : -1;
    this.moonSet = null;
    this.moonPres = env.moonUp ? 1 : 0;
    this.moonVis = 0; this.mVisNow = 0;
    this.mx = 0; this.my = 0;
    // sky image (SKW x SKH), rewritten only when its inputs change
    this.sky = mkCanvas(SKW, SKH); this.skg = this.sky.getContext('2d');
    this.skimg = this.skg.createImageData(SKW, SKH);
    this.skyNow = new Float32Array(10); this.skyLast = new Float32Array(10).fill(-1); this.cirK = 0;
    this.sideU = 0.82;
    // cloud deck world offset (the camera drifts over a static noise field)
    this.ox = 0; this.oz = 0;
    this.pts = new Float32Array(16);
    this.S = new Float32Array(2);
  }
  const SP = Sky.prototype;

  SP.resize = function (env) {
    const W = env.W, H = env.H;
    this.W = W; this.H = H;
    // text protection map: soft blobs where output lines are
    const s = 1 / 8, pw = Math.ceil(W * s) + 2, ph = Math.ceil(H * s) + 2;
    const a = mkCanvas(pw, ph), g = a.getContext('2d');
    g.fillStyle = '#000';
    let firstY = env.out.y + env.out.h;
    for (const l of env.lines) {
      g.fillRect((l.x - env.cell.w * 1.5) * s, (l.y - env.cell.h * 0.6) * s, (l.w + env.cell.w * 3) * s, (l.h + env.cell.h * 1.2) * s);
      if (l.y < firstY) firstY = l.y;
    }
    const b = mkCanvas(pw, ph), gb = b.getContext('2d');
    try { gb.filter = 'blur(2.5px)'; } catch (e) {}
    gb.drawImage(a, 0, 0); gb.filter = 'none'; gb.globalAlpha = 0.6; gb.drawImage(a, 0, 0);
    this.protectImg = b; this.pS = s;
    this.firstY = firstY;
    this.skyH = H * 0.43;
    // star regions: empty top of the output column and empty pane interiors
    const regs = [];
    const top = { x: env.protect.left + 10, y: 6, w: env.out.x + env.out.w - env.protect.left - 16, h: firstY - env.cell.h * 1.2 - 6 };
    if (top.h > 30) regs.push(top);
    for (const p of env.panes) {
      if (p.name === 'Map') continue;
      const bd = p.border + 4;
      if (p.w > 2 * bd + 20 && p.h > 2 * bd + 20) regs.push({ x: p.x + bd, y: p.y + bd, w: p.w - 2 * bd, h: p.h - 2 * bd });
    }
    let area = 0; for (const r of regs) area += r.w * r.h;
    const n = Math.min(420, Math.round(area / 2100));
    const R = rng(777);
    // dim stars are baked into two layers that breathe out of step (cheap twinkle);
    // the few bright ones are drawn one by one with their own twinkle
    const d = env.dpr;
    this.starL = [mkCanvas(W * d, H * d), mkCanvas(W * d, H * d)];
    const gl = this.starL.map((c) => { const q = c.getContext('2d'); q.setTransform(d, 0, 0, d, 0, 0); q.fillStyle = '#dfe7ff'; return q; });
    const big = [];
    for (let i = 0; i < n && regs.length; i++) {
      let u = R() * area, r = regs[0];
      for (const q of regs) { if (u < q.w * q.h) { r = q; break; } u -= q.w * q.h; }
      const k = R();
      const x = Math.round(r.x + R() * r.w) + 0.5, y = Math.round(r.y + R() * r.h) + 0.5;
      const br = 0.4 + Math.pow(R(), 1.8) * 0.6, ph2 = R() * TAU, fr = 0.6 + R() * 2.6;
      if (k > 0.965) { big.push(x, y, br, ph2, fr); continue; }
      const cls = k > 0.7 ? 1 : 0, q = gl[i & 1], sz = cls ? 2 : 1.3;
      q.globalAlpha = Math.min(1, br * (cls ? 1.1 : 0.85));
      q.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    }
    this.big = new Float32Array(big); this.nBig = big.length / 5;
    // moon: big, phase-correct
    const MR = Math.round(clamp(H * 0.05, 30, 56));
    if (!this.moon || this.moon.R !== MR) { this.moon = new MoonSurface(MR, env.noise); }
    this.moon.phase = -1;
    // moon path: rises on the right behind the pane column, peaks high, sets on the left into the text horizon
    const comm = env.panes.find((p) => p.name === 'Comm');
    const xR = comm ? comm.x + comm.w * 0.42 : W * 0.86;
    const xL = env.protect.left + W * 0.07;
    const yR = comm ? Math.min(H * 0.62, comm.y + comm.h * 0.4) : H * 0.6;
    const yL = firstY + MR * 0.6;
    const yTop = Math.max(MR + 14, H * 0.085);
    this.mpath = { xR, xL, yR, yL, yTop };
    this.textRight = env.out.x + env.out.w;
    // darkness / lift gradients (back layer)
    const bk = env.back;
    this.gTopRed = bk.createLinearGradient(0, 0, 0, H * 0.45);
    this.gTopRed.addColorStop(0, 'rgba(120,10,18,.85)'); this.gTopRed.addColorStop(0.45, 'rgba(70,6,12,.4)'); this.gTopRed.addColorStop(1, 'rgba(40,4,8,0)');
    this.gRightRed = bk.createRadialGradient(W, 0, 0, W, 0, H * 0.95);
    this.gRightRed.addColorStop(0, 'rgba(130,10,18,.8)'); this.gRightRed.addColorStop(0.45, 'rgba(80,6,12,.35)'); this.gRightRed.addColorStop(1, 'rgba(40,4,8,0)');
    this.gLeftRed = bk.createRadialGradient(0, 0, 0, 0, 0, H * 0.6);
    this.gLeftRed.addColorStop(0, 'rgba(110,8,14,.7)'); this.gLeftRed.addColorStop(1, 'rgba(40,4,8,0)');
    this.gLift = bk.createLinearGradient(0, 0, 0, H * 0.3);
    this.gLift.addColorStop(0, 'rgba(180,190,215,.5)'); this.gLift.addColorStop(0.5, 'rgba(140,150,180,.14)'); this.gLift.addColorStop(1, 'rgba(120,130,160,0)');
    this.skyLast[0] = -1;
    this.setupDeck(env);
    this.bakeCirrus(env);
  };

  SP.onEvent = function (env, name) {
    if (name === 'sun.rise' || name === 'sun.set') {
      this.moment = { kind: name === 'sun.rise' ? 'rise' : 'set', t0: this.T, dur: name === 'sun.rise' ? 9 : 10 };
    } else if (name === 'moon.rise') {
      this.u = 0; this.moonSet = null; this.moonPres = 1;
    } else if (name === 'moon.set') {
      if (this.u >= 0) this.moonSet = { u0: this.u, t0: this.T, dur: 7 + 16 * (1 - this.u) };
    } else if (name === 'darkness.start' || name === 'darkness.grow') {
      this.dark = { t0: this.T, k: name === 'darkness.start' ? 1 : 0.85 };
      this.lift = null;
    } else if (name === 'darkness.shrink' || name === 'darkness.end' || name === 'darkness.end-soon') {
      const k = name === 'darkness.end' ? 1 : name === 'darkness.shrink' ? 0.75 : 0.4;
      if (this.dark) { const t = this.T - this.dark.t0; if (t < 4.2) this.dark.t0 = this.T - 4.2; } // cut the hold short
      this.lift = { t0: this.T, k, dur: 2.2 + k * 1.4 };
    }
  };

  // ------------------------------------------------------------------ frame
  SP.frame = function (env, dt) {
    this.T += dt;
    const T = this.T, m = env.mix;
    const out = m.outdoors;
    const oo = Math.max(out, 0.001);
    // sky weights (v4: exactly one of sun/moon/dark/evil is 1 outdoors); indoors: treat as night
    let wSun = m.sun, wMoon = m.moon, wNight = m.dark, wEvil = m.evil;
    const ws = wSun + wMoon + wNight + wEvil;
    if (ws > 0.001) { wSun /= ws; wMoon /= ws; wNight /= ws; wEvil /= ws; } else wNight = 1;
    // weather, relative to being outdoors (mix.clouds etc. are already multiplied by outdoors)
    const cover = clamp(m.clouds / oo, 0, 1);
    const wet = clamp((m.rain * 0.75 + m.heavy * 0.25 + m.snow * 0.55) / oo + cover * 0.1, 0, 1);
    // a jump (WX.jump / page load) snaps clouds instead of fading them from the old state
    if (Math.abs(cover - this.cover) > 0.12) this.first = true;
    this.cover = cover; this.wet = wet;
    this.fogK = 1 - m.fog * 0.55;

    // cloud palette
    const t = this.palT; t.fill(0);
    t[0] += wSun * (1 - wet * 0.85); t[1] += wSun * wet * 0.85;
    t[5] += wMoon * (1 - wet * 0.5); t[6] += wMoon * wet * 0.5 + wNight; t[7] += wEvil;
    // sunrise / sunset moment
    let mP = -1, mI = 0;
    const M = this.moment;
    if (M) {
      mP = (T - M.t0) / M.dur;
      if (mP >= 1) { this.moment = null; mP = -1; }
      else {
        const e1 = sst(0, 0.06, mP) * (1 - sst(0.94, 1, mP)) * out;
        for (let i = 0; i < NP; i++) t[i] *= 1 - e1;
        keyPal(M.kind === 'rise' ? RISE_K : SET_K, mP, t, e1);
        mI = M.kind === 'rise' ? sst(0.04, 0.3, mP) * (1 - sst(0.62, 1, mP)) : sst(0, 0.14, mP) * (1 - sst(0.6, 1, mP));
        keyCol(M.kind === 'rise' ? RISE_C : SET_C, mP, this.col);
      }
    }
    if (this.first) this.palW.set(t);
    const pTau = M ? 0.35 : 0.6;
    for (let i = 0; i < NP; i++) this.palW[i] = ease(this.palW[i], t[i], dt, pTau);

    const b = env.back;
    this.skyColour(env, wSun, wMoon, wNight, wEvil, mI, out);
    const rays = mI > 0.002 && out > 0.02;
    if (rays) { this.drawRaysBack(env, mP, mI * out); this.protectText(b, 0.88); }
    this.drawStars(b, env, wMoon, wNight, out);
    this.drawMoon(b, env, dt, wMoon, wNight, out);
    this.drawCirrus(b, env, wSun, wMoon, wEvil, mI, out);
    this.drawDeck(b, env, dt, out);
    if (this.dark) this.drawDark(b, env, out);
    if (this.lift) this.drawLift(b, env, out);
    this.protectText(b, 0.72);
    // the sky goes underneath everything drawn so far, unprotected: it is faint
    this.drawSky(b, env, wSun, wMoon, wEvil, mI);
    this.drawShoot(b, env, dt, out);
    if (rays) this.drawRaysFront(env, mP, mI * out);
    if (mI > 0.002 && out < 0.98) this.drawIndoorTint(env, mI * (1 - out));
    this.drawGlints(env.front, env);
    this.first = false;
  };

  SP.protectText = function (b, a) {
    b.globalCompositeOperation = 'destination-out';
    b.globalAlpha = a; b.drawImage(this.protectImg, 0, 0, this.protectImg.width / this.pS, this.protectImg.height / this.pS);
    b.globalAlpha = 1; b.globalCompositeOperation = 'source-over';
  };

  // ---------------------------------------------------------- sky gradient
  SP.skyColour = function (env, wSun, wMoon, wNight, wEvil, mI, out) {
    const s = this.skyNow, wet = this.wet;
    let tr = 0, tg = 0, tb = 0, hr = 0, hg = 0, hb = 0, a = 0;
    const acc = (P, w) => { if (w < 0.0005) return; tr += P.top[0] * w; tg += P.top[1] * w; tb += P.top[2] * w; hr += P.hor[0] * w; hg += P.hor[1] * w; hb += P.hor[2] * w; a += P.a * w; };
    // wet days go grey; rain dims the moonlit sky a little
    acc(SKY.day, wSun * (1 - wet * 0.8)); acc(SKY.grey, wSun * wet * 0.8);
    acc(SKY.moon, wMoon * (1 - wet * 0.45)); acc(SKY.night, wNight + wMoon * wet * 0.45);
    acc(SKY.evil, wEvil);
    // the darkness sky breathes slowly
    if (wEvil > 0.01) a *= 1 + 0.1 * wEvil * Math.sin(this.T * 0.7);
    // sunrise/sunset: the moment colour takes over
    if (mI > 0.002) {
      const c = this.col, k = mI * 0.75;
      tr = lerp(tr, c[0] * 0.7, k); tg = lerp(tg, c[1] * 0.7, k); tb = lerp(tb, c[2] * 0.7, k);
      hr = lerp(hr, c[0], k); hg = lerp(hg, c[1], k); hb = lerp(hb, c[2], k); a = lerp(a, 0.62, k);
    }
    // lightning lights up the whole sky for a blink
    const fl = clamp(env.shared.flash || 0, 0, 1) * out;
    if (fl > 0.01) {
      const k = fl * 0.5;
      tr = lerp(tr, 180, k); tg = lerp(tg, 188, k); tb = lerp(tb, 212, k);
      hr = lerp(hr, 196, k); hg = lerp(hg, 204, k); hb = lerp(hb, 226, k); a = lerp(a, 0.75, k);
    }
    a *= out * this.fogK * (1 - 0.2 * this.cover);
    this.hor0 = hr; this.hor1 = hg; this.hor2 = hb;
    s[0] = tr; s[1] = tg; s[2] = tb; s[3] = hr; s[4] = hg; s[5] = hb; s[6] = a;
  };
  SP.drawSky = function (b, env, wSun, wMoon, wEvil, mI) {
    const s = this.skyNow, tr = s[0], tg = s[1], tb = s[2], hr = s[3], hg = s[4], hb = s[5], a = s[6];
    if (a < 0.004) return;
    // the light side: the moon when it is visible, the sun's side during a moment, else the east
    let su = 0.8;
    if (this.mVisNow > 0.05) su = lerp(su, clamp(this.mx / env.W, 0, 1), clamp(this.mVisNow * 1.5, 0, 1));
    if (mI > 0.002) su = lerp(su, clamp(this.S[0] / env.W, 0, 1), clamp(mI * 2, 0, 1));
    this.sideU = ease(this.sideU, su, 1 / 60, 0.5);
    const side = 0.22 + 0.1 * wSun + 0.12 * wMoon - 0.1 * wEvil;
    s[7] = this.sideU * 100; s[8] = side * 100; s[9] = this.cirK * 2000;
    const L = this.skyLast;
    let diff = 0; for (let i = 0; i < 10; i++) diff += Math.abs(s[i] - L[i]);
    this.skyTick = (this.skyTick || 0) + 1;
    if ((diff > 0.8 || Math.abs(a - L[6]) > 0.002) && (this.skyTick >= 4 || diff > 40 || this.first)) {
      L.set(s); this.skyTick = 0;
      const o = this.skimg.data, sx = this.sideU;
      for (let y = 0; y < SKH; y++) {
        const v = y / (SKH - 1), k = sst(0, 0.9, v);
        const fade = Math.pow(1 - sst(0, 1, v), 1.25);
        const r0 = lerp(tr, hr, k), g0 = lerp(tg, hg, k), b0 = lerp(tb, hb, k);
        for (let x = 0; x < SKW; x++) {
          const u = x / (SKW - 1), du = u - sx;
          // lighter toward one side, strongest a bit above the fade-out (like a real sky)
          const sk = side * Math.exp(-du * du / 0.16) * (0.35 + 0.65 * k);
          const j = (y * SKW + x) * 4;
          o[j] = r0 + (hr * 1.25 + 30 - r0) * sk; o[j + 1] = g0 + (hg * 1.2 + 26 - g0) * sk; o[j + 2] = b0 + (hb * 1.15 + 22 - b0) * sk;
          o[j + 3] = 255 * a * fade * (1 + sk * 0.6) * (0.9 + 0.1 * (1 - Math.abs(du)));
        }
      }
      this.skg.putImageData(this.skimg, 0, 0);
      // compose sky + cirrus once into a low-res canvas; one blit per frame after that
      const C = this.skyCg, cw = this.skyCv.width, ch = this.skyCv.height;
      C.clearRect(0, 0, cw, ch);
      C.drawImage(this.sky, 0, 0, SKW, SKH, 0, 0, cw, ch);
      if (this.cirK > 0.002) { C.globalAlpha = Math.min(1, this.cirK / Math.max(a, 0.05)); C.drawImage(this.cirrus, 0, 0); C.globalAlpha = 1; }
    }
    b.globalCompositeOperation = 'destination-over';
    b.drawImage(this.skyCv, 0, 0, this.skyCv.width, this.skyCv.height, 0, 0, this.skyCv.width * 3, this.skyCv.height * 3);
    b.globalCompositeOperation = 'source-over';
  };

  // ------------------------------------------------------------- cirrus
  // Thin streaks of high cloud on a perspective plane, converging toward a vanishing point.
  // Baked once per resize; drawn very faintly and only when the real clouds are few.
  SP.bakeCirrus = function (env) {
    const W = env.W, hY = this.hY, sc = 3;
    const cw = Math.ceil(W / sc), ch = Math.ceil(hY * 1.05 / sc);
    const c = mkCanvas(cw, ch), g = c.getContext('2d'), img = g.createImageData(cw, ch), o = img.data;
    const N = this.noise, f = W * 0.6, cx = W * 0.62, ca = Math.cos(0.45), sa = Math.sin(0.45);
    const hz = hY * 1.05;
    for (let py = 0; py < ch; py++) {
      const y = (py + 0.5) * sc, hy = hz - y;
      if (hy < 4) continue;
      const Z = f / hy, rowA = sst(0, 0.45, hy / hz) * (0.55 + 0.45 * sst(0.2, 1, hy / hz));
      for (let px = 0; px < cw; px++) {
        const X = ((px + 0.5) * sc - cx) * Z / f * 1.6;
        const A = X * ca + Z * sa, B = -X * sa + Z * ca;
        // patches where cirrus lives
        const patch = sst(0.48, 0.72, N(A * 0.35 + 3.1, B * 0.5 + 7.7));
        if (patch <= 0) continue;
        // fine streaks: ridged noise stretched along A
        const n1 = N(A * 0.25 + 11, B * 4.5 + N(A * 0.7, B * 1.5) * 1.4);
        const r1 = 1 - Math.abs(n1 * 2 - 1);
        const st = Math.pow(r1, 5) * (0.55 + 0.45 * N(A * 1.2 + 5, B * 2));
        const v = st * patch * rowA;
        if (v < 0.01) continue;
        const j = (py * cw + px) * 4;
        o[j] = 236; o[j + 1] = 240; o[j + 2] = 246; o[j + 3] = 255 * Math.min(1, v * 1.3);
      }
    }
    g.putImageData(img, 0, 0);
    this.cirrus = c;
    this.skyCv = mkCanvas(cw, Math.ceil(this.skyH / sc)); this.skyCg = this.skyCv.getContext('2d');
  };
  SP.drawCirrus = function (b, env, wSun, wMoon, wEvil, mI, out) {
    const k = out * this.fogK * (1 - sst(0.08, 0.5, this.cover)) * (wSun * 0.05 + wMoon * 0.03 + mI * 0.05) * (1 - wEvil);
    // baked into the sky canvas (see drawSky); only its strength is decided here
    this.cirK = k < 0.003 ? 0 : k;
  };

  // ---------------------------------------------------------------- cloud deck
  // A flat cloud layer above the viewer, ray-cast per deck pixel: rows near the top look
  // straight up at big near cloud bases, rows toward the horizon (~35 % down) see far,
  // small, hazy clouds. Rebuilt row by row over BF frames into one buffer while the
  // previous two buffers cross-fade, so the work never spikes.
  SP.setupDeck = function (env) {
    const W = env.W, H = env.H;
    this.hY = Math.round(H * 0.36);
    const dw = Math.ceil(W / DS), dh = Math.ceil(this.hY / DS);
    this.dw = dw; this.dh = dh;
    this.dP = mkCanvas(dw, dh); this.dN = mkCanvas(dw, dh); this.dC = mkCanvas(dw, dh); this.dF = mkCanvas(dw, dh);
    this.gP = this.dP.getContext('2d'); this.gN = this.dN.getContext('2d'); this.gC = this.dC.getContext('2d'); this.gF = this.dF.getContext('2d');
    this.bimg = this.gN.createImageData(dw, dh);
    const f = W * 0.55, cx = W * 0.5;
    this.rZ = new Float32Array(dh); this.rA = new Float32Array(dh); this.rH = new Float32Array(dh);
    for (let r = 0; r < dh; r++) {
      const hy = this.hY - (r + 0.5) * DS, q = hy / this.hY;
      this.rZ[r] = f / Math.max(hy, 1);
      this.rA[r] = sst(0.1, 0.5, q);          // fade into the horizon
      this.rH[r] = 1 - sst(0.2, 0.85, q);       // haze toward the horizon
    }
    this.cX = new Float32Array(dw); this.rowD = new Float32Array(dw);
    for (let c = 0; c < dw; c++) this.cX[c] = ((c + 0.5) * DS - cx) / f;
    this.bRow = 0; this.built = 0; this.bk = { th: 0.9, a: 0, lit: [0, 0, 0], sh: [0, 0, 0], hz: [0, 0, 0], ox: 0, oz: 0 };
    this.deckEmpty = true;
  };
  SP.deckParams = function () {
    const p = this.bk, cov = this.cover;
    p.th = cov < 0.6 ? 0.9 - cov * 0.47 : 0.618 - (cov - 0.6) * 0.85;
    p.a = sst(0.02, 0.3, cov);
    let w = 0; const l = p.lit, s = p.sh; l[0] = l[1] = l[2] = s[0] = s[1] = s[2] = 0; let op = 0;
    for (let i = 0; i < NP; i++) {
      const k = this.palW[i]; if (k < 0.002) continue;
      const P = PAL[i]; w += k; op += P.op * k;
      for (let c = 0; c < 3; c++) { l[c] += P.lit[c] * k; s[c] += P.sh[c] * k; }
    }
    if (w > 0) { for (let c = 0; c < 3; c++) { l[c] /= w; s[c] /= w; } op /= w; }
    p.a *= op;
    p.hz[0] = this.hor0 || 0; p.hz[1] = this.hor1 || 0; p.hz[2] = this.hor2 || 0;
    p.ox = this.ox; p.oz = this.oz;
  };
  SP.buildRows = function (r0, r1) {
    const p = this.bk, N = this.noise, o = this.bimg.data, dw = this.dw;
    const th = p.th, A = p.a, l = p.lit, s = p.sh, hz = p.hz, S = 0.62;
    for (let r = r0; r < r1; r++) {
      const Z = this.rZ[r], ra = this.rA[r] * A, hzk = this.rH[r] * 0.7;
      const base = r * dw * 4;
      if (ra < 0.004) { for (let c = 0; c < dw; c++) o[base + c * 4 + 3] = 0; continue; }
      const w = Z * S + p.oz, detail = clamp(3.2 / Z, 0.2, 1);
      const RB = this.rowD, K = 10, gk = clamp(0.32 / (K * DS * Z * S / (this.W * 0.55)), 0.5, 4) * 2.2;
      for (let c = 0; c < dw; c++) {
        const j = base + c * 4;
        const u = this.cX[c] * Z * S + p.ox;
        const d0 = N(u, w), d2 = RB[c < K ? 0 : c - K]; RB[c] = d0;
        if (d0 * 0.6 + 0.4 < th - 0.02) { o[j + 3] = 0; continue; }
        let d = d0 * 0.6 + N(u * 2.13 + 5.2, w * 2.13 + 1.3) * 0.28 + N(u * 4.7 + 9.1, w * 4.7 + 3.3) * 0.12 * detail + 0.06 * (1 - detail);
        const a = sst(th - 0.01, th + 0.09, d);
        if (a < 0.01) { o[j + 3] = 0; continue; }
        // underside light: thin parts and the side facing the light glow, thick bases are dark
        const thick = sst(th, th + 0.32, d);
        let li = 0.92 - 0.8 * thick + (d0 - d2) * gk + (1 - sst(th, th + 0.07, d)) * 0.3;
        li = li < 0 ? 0 : li > 1 ? 1 : li;
        const R = s[0] + (l[0] - s[0]) * li, G = s[1] + (l[1] - s[1]) * li, B = s[2] + (l[2] - s[2]) * li;
        o[j] = R + (hz[0] - R) * hzk; o[j + 1] = G + (hz[1] - G) * hzk; o[j + 2] = B + (hz[2] - B) * hzk;
        o[j + 3] = 255 * ra * a * (0.82 + 0.18 * thick);
      }
    }
  };
  SP.drawDeck = function (b, env, dt, out) {
    // slow drift: the deck comes in from the horizon and slides a little to the right
    const wind = 1 + this.wet * 0.6;
    this.ox += 0.014 * wind * dt; this.oz += 0.04 * wind * dt;
    const rows = this.dh;
    if (this.first) {
      // snap: build the whole deck now into both buffers
      this.deckParams(); this.buildRows(0, rows);
      this.gN.putImageData(this.bimg, 0, 0); this.gP.clearRect(0, 0, this.dw, rows); this.gP.drawImage(this.dN, 0, 0);
      this.bRow = 0; this.deckEmpty = this.bk.a < 0.004;
    } else if (!(this.deckEmpty && this.cover < 0.02)) {
      if (this.bRow === 0) this.deckParams();
      const n = Math.ceil(rows / BF), r1 = Math.min(rows, this.bRow + n);
      this.buildRows(this.bRow, r1); this.bRow = r1;
      if (this.bRow >= rows) {
        const t = this.dP; this.dP = this.dN; this.dN = t; const g = this.gP; this.gP = this.gN; this.gN = g;
        this.gN.putImageData(this.bimg, 0, 0);
        this.deckEmpty = this.bk.a < 0.004;
        this.bRow = 0;
      }
    }
    const fA = out * (0.4 + 0.6 * this.fogK);
    if (fA < 0.01 || (this.deckEmpty && this.cover < 0.02)) return;
    // cross-fade previous -> newest by build progress (additive, so the sum stays exact)
    const k = this.bRow / rows, C = this.gC;
    C.globalCompositeOperation = 'copy'; C.globalAlpha = 1 - k; C.drawImage(this.dP, 0, 0);
    C.globalCompositeOperation = 'lighter'; C.globalAlpha = k; C.drawImage(this.dN, 0, 0);
    C.globalCompositeOperation = 'source-over'; C.globalAlpha = 1;
    const dW = this.dw * DS, dH = this.dh * DS;
    b.globalAlpha = fA; b.drawImage(this.dC, 0, 0, dW, dH);
    // lightning: the cloud bases light up, most near the bolt
    const fl = clamp(env.shared.flash || 0, 0, 1) * out;
    if (fl > 0.02) {
      // flash mask = the cloud shapes, tinted by a soft radial falloff around the bolt
      // (a faint wash everywhere, strongest where the bolt leaves the clouds)
      const F = this.gF, bx = env.shared.boltX;
      F.globalCompositeOperation = 'copy'; F.globalAlpha = 1; F.drawImage(this.dC, 0, 0);
      F.globalCompositeOperation = 'source-in';
      if (typeof bx === 'number') {
        const cx = bx / DS, cy = this.dh * 0.8, r = (env.W * 0.42) / DS;
        const gr = F.createRadialGradient(cx, cy, 0, cx, cy, r);
        gr.addColorStop(0, 'rgba(228,234,255,1)'); gr.addColorStop(0.3, 'rgba(222,230,255,.62)');
        gr.addColorStop(0.65, 'rgba(216,226,255,.3)'); gr.addColorStop(1, 'rgba(210,222,255,.22)');
        F.fillStyle = gr;
      } else F.fillStyle = 'rgba(222,230,255,.45)';
      F.fillRect(0, 0, this.dw, this.dh);
      F.globalCompositeOperation = 'source-over';
      b.globalCompositeOperation = 'lighter';
      b.globalAlpha = Math.min(1, fl * 1.1); b.drawImage(this.dF, 0, 0, dW, dH);
      b.globalCompositeOperation = 'source-over';
    }
    b.globalAlpha = 1;
  };

  // ----------------------------------------------------------------- stars
  SP.drawStars = function (b, env, wMoon, wNight, out) {
    const vis = out * (wNight + wMoon * 0.6) * (1 - sst(0.4, 0.8, this.cover)) * (0.25 + 0.75 * this.fogK)
      * clamp(1 - this.palW[0] - this.palW[2] * 0.7 - this.palW[3] * 0.5 - this.palW[7], 0, 1) * (1 - 0.85 * this.darkG);
    this.starVis = vis;
    if (vis < 0.01) return;
    const T = this.T, W = env.W, H = env.H;
    b.globalAlpha = vis * (0.8 + 0.2 * Math.sin(T * 1.3));
    b.drawImage(this.starL[0], 0, 0, W, H);
    b.globalAlpha = vis * (0.8 + 0.2 * Math.sin(T * 1.9 + 2.1));
    b.drawImage(this.starL[1], 0, 0, W, H);
    const S = this.big;
    for (let i = 0; i < this.nBig; i++) {
      const o = i * 5;
      const tw = (0.72 + 0.28 * Math.sin(T * S[o + 4] + S[o + 3])) * (0.85 + 0.15 * Math.sin(T * S[o + 4] * 2.7 + S[o + 3] * 3.1));
      const a = S[o + 2] * tw * vis;
      if (a < 0.04) continue;
      b.globalAlpha = a; b.drawImage(this.starSpr, S[o] - 12, S[o + 1] - 12);
    }
    b.globalAlpha = 1;
  };

  // A shooting star now and then on clear nights: a long, shallow path across the whole
  // screen (over the text and behind the pane borders) that glides out past the edge.
  SP.launchShoot = function (env) {
    const sh = this.shoot, W = env.W, H = env.H, ltr = Math.random() < 0.35;
    const sp = 760 + Math.random() * 380;
    const ang = (0.05 + Math.random() * 0.1) * Math.PI;   // shallow, slightly downward
    sh.vx = Math.cos(ang) * sp * (ltr ? 1 : -1); sh.vy = Math.sin(ang) * sp;
    sh.x = ltr ? W * (-0.05 + Math.random() * 0.35) : W * (0.65 + Math.random() * 0.4);
    sh.y = H * (0.02 + Math.random() * 0.2);
    sh.age = 0; sh.on = true;
  };
  SP.drawShoot = function (b, env, dt, out) {
    const sh = this.shoot, vis = this.starVis || 0;
    if (!sh.on) {
      sh.next -= dt;
      if (sh.next <= 0) {
        sh.next = 9 + Math.random() * 18;
        if (vis > 0.3 && out > 0.5) this.launchShoot(env);
      }
      return;
    }
    sh.age += dt;
    const hx = sh.x + sh.vx * sh.age, hy = sh.y + sh.vy * sh.age;
    const tl = Math.min(sh.age, 0.2);
    const tx = hx - sh.vx * tl, ty = hy - sh.vy * tl;
    if (tx < -40 || tx > env.W + 40 || ty > env.H * 0.8 || sh.age > 4) { sh.on = false; return; }
    // fade in quickly; burn a little brighter mid-flight; dim with the star field
    const fade = sst(0, 0.18, sh.age) * (0.75 + 0.25 * Math.sin(Math.min(1, sh.age / 1.6) * Math.PI)) * clamp(vis * 1.2, 0.35, 1);
    const gr = b.createLinearGradient(tx, ty, hx, hy);
    gr.addColorStop(0, 'rgba(190,205,255,0)'); gr.addColorStop(0.75, 'rgba(215,228,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
    b.strokeStyle = gr; b.lineCap = 'round';
    b.beginPath(); b.moveTo(tx, ty); b.lineTo(hx, hy);
    b.globalAlpha = fade * 0.22; b.lineWidth = 4; b.stroke();
    b.globalAlpha = fade * 0.85; b.lineWidth = 1.3; b.stroke();
    b.globalAlpha = fade; b.drawImage(this.starSpr, hx - 12, hy - 12);
    b.globalAlpha = 1;
  };

  // ------------------------------------------------------------------ moon
  SP.stepMoon = function (env, dt) {
    if (this.moonSet) {
      const s = this.moonSet, p = (this.T - s.t0) / s.dur;
      if (p >= 1) { this.moonSet = null; this.u = -1; }
      else this.u = lerp(s.u0, 1, sst(0, 1, p) * 0.6 + p * 0.4);
    } else if (env.moonUp) {
      if (this.u < 0) { this.u = MOON_START; this.moonPres = 0; } // moon is up but we never saw it rise
      const slow = this.u < MOON_HOLD - 0.1 ? 1 : clamp((MOON_HOLD - this.u) / 0.1, 0, 1);
      this.u += dt * DEMO_SPEED / MOON_CROSS_S * slow;
    }
    const want = this.u >= 0 && (env.moonUp || this.moonSet) ? 1 : 0;
    this.moonPres = ease(this.moonPres, want, dt, 1.5);
    if (!want && this.moonPres < 0.01) this.u = -1;
  };
  SP.moonPos = function (u) {
    const P = this.mpath, th = Math.PI * u;
    const cx = (P.xR + P.xL) / 2, rx = (P.xR - P.xL) / 2;
    const yb = lerp(P.yR, P.yL, u), ry = (P.yR + P.yL) / 2 - P.yTop;
    this.mx = cx + rx * Math.cos(th);
    this.my = yb - ry * Math.sin(th);
  };
  SP.drawMoon = function (b, env, dt, wMoon, wNight, out) {
    this.stepMoon(env, dt);
    const light = out * clamp(wMoon + wNight * 0.65, 0, 1) * (1 - this.palW[0] - this.palW[2] * 0.8 - this.palW[3] * 0.5 - this.palW[7]);
    const tgt = Math.max(0, light) * (1 - 0.8 * sst(0.75, 1, this.cover)) * (0.35 + 0.65 * this.fogK) * (1 - 0.7 * (this.darkG || 0));
    this.moonVis = ease(this.moonVis, tgt, dt, 1.2);
    const u = this.u;
    if (u < 0 || this.moonVis * this.moonPres < 0.01) { this.mVisNow = 0; return; }
    this.moonPos(u);
    const x = this.mx, y = this.my, mo = this.moon;
    // rising: fade in behind the panes; setting: sink into the horizon above the text
    let a = this.moonVis * this.moonPres * sst(0, 0.05, u);
    if (x < this.textRight) a *= 1 - sst(this.firstY - mo.R * 2.4, this.firstY + mo.R * 0.2, y);
    this.mVisNow = a;
    if (a < 0.01) return;
    mo.relight(clamp(env.moonPhase, 0, 1));
    const ph = 0.25 + 0.75 * clamp(env.moonPhase, 0, 1);
    const hs = mo.R / 24; // halo scales with the moon
    b.globalAlpha = a * ph;
    b.drawImage(this.halo, x - 130 * hs, y - 130 * hs, 260 * hs, 260 * hs);
    b.globalAlpha = a * 0.55 * ph;
    b.drawImage(this.halo, x - 300 * hs, y - 300 * hs, 600 * hs, 600 * hs);
    b.globalAlpha = a;
    const s = mo.w / mo.S;
    b.drawImage(mo.cv, x - s / 2, y - s / 2, s, s);
    b.globalAlpha = 1;
  };
  SP.drawGlints = function (f, env) {
    const v = this.mVisNow || 0;
    if (v < 0.02) return;
    const R = this.moon.R * 0.6, x = this.mx, y = this.my;
    const pk = 0.3 + 0.7 * clamp(env.moonPhase, 0, 1);
    f.globalCompositeOperation = 'lighter';
    for (const p of env.panes) {
      const dyEdge = p.y - y;
      const dx = x < p.x ? p.x - x : x > p.x + p.w ? x - (p.x + p.w) : 0;
      const near = Math.exp(-(dyEdge * dyEdge) / (R * R * 2.2)) * Math.exp(-(dx * dx) / (R * R * 5));
      const wide = 0.35 * sst(-10, 120, dyEdge) * Math.exp(-(dx * dx) / 40000);
      const a = v * pk * Math.min(1, near * 1.2 + wide) * 0.9;
      if (a < 0.02) continue;
      const cx = clamp(x, p.x + 10, p.x + p.w - 10);
      const gw = 90 + near * 160 + wide * 200;
      const x0 = Math.max(p.x, cx - gw / 2), x1 = Math.min(p.x + p.w, cx + gw / 2);
      if (x1 - x0 < 2) continue;
      const sx0 = (x0 - (cx - gw / 2)) / gw * 256, sx1 = (x1 - (cx - gw / 2)) / gw * 256;
      f.globalAlpha = a * 0.75;
      f.drawImage(this.glint, sx0, 0, sx1 - sx0, 12, x0, p.y - 5.5, x1 - x0, 12);
      if (near > 0.25) { f.globalAlpha = (near - 0.25) * v * pk; f.drawImage(this.starSpr, cx - 12, p.y - 11.5); }
    }
    f.globalAlpha = 1; f.globalCompositeOperation = 'source-over';
  };

  // --------------------------------------------------------- dawn / dusk rays
  SP.sunPos = function (kind, p, W, H, out) {
    const q = sst(0, 1, p);
    if (kind === 'rise') { out[0] = W * (1.07 - 0.2 * q); out[1] = H * (0.06 - 0.5 * q); }
    else { out[0] = W * (0.22 - 0.3 * q); out[1] = H * (-0.42 + 0.5 * q); }
  };
  SP.drawIndoorTint = function (env, k) {
    // indoors the sun is only heard of: a faint warm (rise) or cooling (set) band along the top
    const f = env.back, c = this.col, H = env.H * 0.13;
    const g = f.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},.5)`); g.addColorStop(1, `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},0)`);
    f.globalAlpha = k * 0.32; f.fillStyle = g; f.fillRect(0, 0, env.W, H); f.globalAlpha = 1;
  };
  SP.drawRaysFront = function (env, p, I) {
    const W = env.W, H = env.H, M = this.moment, S = this.S, f = env.front;
    const c = this.col, rgb = `${c[0] | 0},${c[1] | 0},${c[2] | 0}`;
    const wetK = 1 - 0.65 * this.wet;
    const far = Math.hypot(Math.max(S[0], W - S[0]), H - S[1]);
    const near = Math.max(0, -S[1]);
    const front = M.kind === 'rise' ? lerp(near, far * 1.05, sst(0.08, 0.75, p)) : lerp(far * 1.05, near, sst(0.1, 0.85, p));
    const bw = far * 0.28;
    const gr = f.createRadialGradient(S[0], S[1], Math.max(0, front - bw), S[0], S[1], front + bw);
    gr.addColorStop(0, `rgba(${rgb},0)`); gr.addColorStop(0.5, `rgba(${rgb},1)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    f.globalAlpha = 0.085 * I * wetK; f.fillStyle = gr; f.fillRect(0, 0, W, H);
    f.globalCompositeOperation = 'lighter';
    const col = `rgb(${rgb})`;
    for (const q of env.panes) {
      const cx = q.x + q.w / 2, cy = q.y + q.h / 2;
      const d = Math.hypot(cx - S[0], cy - S[1]);
      const prox = 0.35 + 0.65 * Math.exp(-((d - front) * (d - front)) / (bw * bw * 0.8));
      const a = I * prox * wetK * this.fogK;
      if (a < 0.02) continue;
      // warm rim along the top edge and down the side facing the sun (solid strokes: no per-pane gradients)
      const side = S[0] > cx ? q.x + q.w - 0.75 : q.x + 0.75;
      f.strokeStyle = col;
      f.globalAlpha = a * 0.16; f.lineWidth = 5;
      f.beginPath(); f.moveTo(q.x, q.y + 1.5); f.lineTo(q.x + q.w, q.y + 1.5); f.stroke();
      f.globalAlpha = a * 0.6; f.lineWidth = 1.2;
      f.beginPath(); f.moveTo(q.x, q.y + 0.6); f.lineTo(q.x + q.w, q.y + 0.6); f.stroke();
      f.globalAlpha = a * 0.35;
      f.beginPath(); f.moveTo(side, q.y); f.lineTo(side, q.y + q.h * 0.6); f.stroke();
    }
    f.globalAlpha = 1; f.globalCompositeOperation = 'source-over';
  };
  SP.drawRaysBack = function (env, p, I) {
    const W = env.W, H = env.H, M = this.moment, g = env.back, S = this.S;
    this.sunPos(M.kind, p, W, H, S);
    const c = this.col;
    const rgb = `${(c[0] + (255 - c[0]) * 0.35) | 0},${(c[1] + (255 - c[1]) * 0.35) | 0},${(c[2] + (255 - c[2]) * 0.3) | 0}`;
    const k = I * (1 - 0.65 * this.wet) * this.fogK * (M.kind === 'set' ? 0.62 : 1.25);
    g.globalCompositeOperation = 'lighter';
    const sx = S[0], sy = S[1];
    const far = Math.hypot(Math.max(sx, W - sx), H - sy);
    const gl = g.createRadialGradient(sx, sy, 0, sx, sy, far * 0.75);
    gl.addColorStop(0, `rgba(${rgb},.5)`); gl.addColorStop(0.3, `rgba(${rgb},.16)`); gl.addColorStop(0.6, `rgba(${rgb},.06)`); gl.addColorStop(1, `rgba(${rgb},0)`);
    g.globalAlpha = k; g.fillStyle = gl; g.fillRect(0, 0, W, H);
    const hs = g.createRadialGradient(sx, sy, 0, sx, sy, H * 0.45);
    hs.addColorStop(0, 'rgba(255,250,235,.9)'); hs.addColorStop(0.12, `rgba(${rgb},.55)`); hs.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = hs; g.fillRect(Math.max(0, sx - H * 0.45), Math.max(0, sy - H * 0.45), H * 0.9, H * 0.9);
    const rg = g.createRadialGradient(sx, sy, 0, sx, sy, far * 1.05);
    rg.addColorStop(0, `rgba(${rgb},1)`); rg.addColorStop(0.55, `rgba(${rgb},.62)`); rg.addColorStop(1, `rgba(${rgb},.05)`);
    g.fillStyle = rg;
    let a0 = 1e9, a1 = -1e9;
    for (let i = 0; i < 4; i++) { const a = Math.atan2((i > 1 ? H : 0) - sy, (i & 1 ? W : 0) - sx); a0 = Math.min(a0, a); a1 = Math.max(a1, a); }
    const T = this.T, N = 15, L = far * 1.2;
    const core = new Path2D();
    for (let i = 0; i < N; i++) {
      const r1 = Math.sin(i * 12.9898 + 3) * 43758.5453, j = r1 - Math.floor(r1);
      const a = a0 + (a1 - a0) * (i + 0.5 + (j - 0.5) * 0.7) / N + Math.sin(T * 0.15 + i) * 0.006;
      const wd = 0.008 + j * 0.03;
      const al = (0.3 + 0.7 * ((j * 7.3) % 1)) * (0.7 + 0.3 * Math.sin(T * (0.5 + j) + i * 2.1));
      // wide soft beam per ray (own flicker); the bright cores are gathered into one path
      g.globalAlpha = k * al * 0.5;
      g.beginPath(); g.moveTo(sx, sy);
      g.lineTo(sx + Math.cos(a - wd) * L, sy + Math.sin(a - wd) * L);
      g.lineTo(sx + Math.cos(a + wd) * L, sy + Math.sin(a + wd) * L);
      g.closePath(); g.fill();
      const ww = wd * 0.4;
      core.moveTo(sx, sy);
      core.lineTo(sx + Math.cos(a - ww) * L, sy + Math.sin(a - ww) * L);
      core.lineTo(sx + Math.cos(a + ww) * L, sy + Math.sin(a + ww) * L);
      core.closePath();
    }
    g.globalAlpha = k * 0.62; g.fill(core);
    g.globalAlpha = 1;
    // pane shadows: soft wedges behind each pane, away from the sun
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';
    const pts = this.pts;
    for (let pass = 0; pass < 2; pass++) {
      const ox = pass ? -18 : 18;
      g.globalAlpha = 0.45;
      for (const q of env.panes) {
        CX[0] = CX[3] = q.x; CX[1] = CX[2] = q.x + q.w; CY[0] = CY[1] = q.y; CY[2] = CY[3] = q.y + q.h;
        for (let i = 0; i < 4; i++) {
          const dx = CX[i] - (sx + ox), dy = CY[i] - sy, dl = Math.hypot(dx, dy) || 1;
          pts[i * 2] = CX[i]; pts[i * 2 + 1] = CY[i];
          pts[8 + i * 2] = CX[i] + dx / dl * 4000; pts[8 + i * 2 + 1] = CY[i] + dy / dl * 4000;
        }
        hullFill(g, pts);
      }
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  };

  // --------------------------------------------------- darkness: red bleed
  SP.drawDark = function (b, env, out) {
    const d = this.dark, t = this.T - d.t0;
    // bleed in ~2.2 s, hold, recede by ~6.6 s
    const grow = sst(0, 2.2, t), recede = sst(4.2, 6.6, t);
    if (t > 6.8) { this.dark = null; this.darkG = 0; return; }
    const g = grow * (1 - recede) * d.k;
    this.darkG = g * (0.4 + 0.6 * out);
    const k = g * (0.55 + 0.45 * out); // indoors: weaker, the sky is far away
    const W = env.W, H = env.H;
    // red bleed from the top and the corners, slowly pulsing
    const pulse = 0.88 + 0.12 * Math.sin(t * 2.6);
    b.globalAlpha = k * pulse; b.fillStyle = this.gTopRed; b.fillRect(0, 0, W, H * 0.45);
    b.globalAlpha = k * 0.9 * pulse; b.fillStyle = this.gRightRed; b.fillRect(W - H * 0.95, 0, H * 0.95, H * 0.95);
    b.globalAlpha = k * 0.6; b.fillStyle = this.gLeftRed; b.fillRect(0, 0, H * 0.6, H * 0.6);
    b.globalAlpha = 1;
  };
  SP.drawLift = function (b, env, out) {
    const L = this.lift, p = (this.T - L.t0) / L.dur;
    if (p >= 1) { this.lift = null; return; }
    const W = env.W, H = env.H, k = L.k * (0.5 + 0.5 * out);
    // a thin red remnant draws back up over the edge...
    const red = (1 - sst(0, 0.55, p)) * k;
    if (red > 0.01) {
      b.save();
      b.globalAlpha = red * 0.8; b.fillStyle = this.gTopRed;
      b.scale(1, Math.max(0.05, 1 - sst(0, 0.7, p)));
      b.fillRect(0, 0, W, H * 0.45);
      b.restore();
    }
    // ...and a pale, cool light breathes in from the top
    const lit = Math.sin(Math.PI * sst(0.1, 1, p)) * k;
    if (lit > 0.01) { b.globalAlpha = lit * 0.7; b.fillStyle = this.gLift; b.fillRect(0, 0, W, H * 0.3); }
    b.globalAlpha = 1;
  };

  // ------------------------------------------------------------ registration
  let sky = null;
  WX.module({
    id: 'sky', title: 'Himmel',
    init(env) { sky = new Sky(env); },
    resize(env) { if (sky) sky.resize(env); },
    frame(env, dt) { if (sky && sky.protectImg) sky.frame(env, dt); },
    onEvent(env, name) { if (sky) sky.onEvent(env, name); },
    destroy() { sky = null; },
  });
})();
