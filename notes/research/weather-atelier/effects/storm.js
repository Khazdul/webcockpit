// Storm family: lightning.
//   storm-bolt   realistic branching strike (stepped leader, return stroke, re-strikes, afterglow)
//   storm-ascii  retro terminal lightning drawn cell by cell with phosphor persistence
//   storm-heat   distant heat lightning: cloud-internal flashes behind the panes
(() => {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const R = Math.random;
  const rr = (a, b) => a + R() * (b - a);
  const mkCv = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
  // how dramatic the light state makes a flash: day is muted, night is full
  const nightOf = (l) => (l === '*' ? 0.42 : l === '!' ? 0.75 : 1);
  const rainOf = (w) => (w === '"' ? 1 : w === "'" ? 0.5 : 0);

  // multi-octave noise built on the harness value noise
  function fbm4(env, x, y) {
    return env.noise(x, y) * 0.5 + env.noise(x * 2.1 + 3.7, y * 2.1 + 9.1) * 0.27 +
      env.noise(x * 4.3 + 11, y * 4.3 + 2) * 0.15 + env.noise(x * 8.7 + 5, y * 8.7 + 21) * 0.08;
  }

  // Cloud texture lit from within. Low resolution; drawn scaled up so bilinear smoothing softens it.
  function cloudSprite(env, w, h, seed, core, edge, opts) {
    const c = mkCv(w, h), g = c.getContext('2d'), id = g.createImageData(w, h), d = id.data;
    const top = opts && opts.top; // sky flash: light comes from the top edge, wide
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const nx = x / w * 2 - 1, ny = y / h * 2 - 1;
      let fall;
      if (top) fall = clamp(1 - y / h, 0, 1) ** 1.6 * clamp(1 - Math.abs(nx) ** 2.2, 0, 1);
      else fall = clamp(1 - Math.sqrt(nx * nx + ny * ny), 0, 1) ** 1.25;
      const n = fbm4(env, x * 0.045 + seed, y * 0.07 + seed * 0.61);
      const dens = clamp((n - 0.3) * 2.2, 0, 1);
      const lit = fall * (0.25 + 0.75 * dens);
      const hot = clamp(lit * lit * 1.6, 0, 1);
      const i = (y * w + x) * 4;
      d[i] = edge[0] + (core[0] - edge[0]) * hot;
      d[i + 1] = edge[1] + (core[1] - edge[1]) * hot;
      d[i + 2] = edge[2] + (core[2] - edge[2]) * hot;
      d[i + 3] = 255 * clamp(lit * (top ? 1.0 : 1.15), 0, 1);
    }
    g.putImageData(id, 0, 0);
    return c;
  }


  // Cumulus bank: one density field, several lighting variants (the light moves inside the cloud).
  function cumulusSet(env, w, h, seed, lights) {
    const dens = new Float32Array(w * h), shade = new Float32Array(w * h);
    let rs = seed * 9301 + 49297;
    const rnd = () => ((rs = (rs * 9301 + 49297) % 233280) / 233280);
    const blobs = [];
    const nb = 7 + ((rnd() * 4) | 0);
    for (let i = 0; i < nb; i++) {
      const t = i / (nb - 1);
      const r = h * (0.2 + 0.22 * Math.sin(t * Math.PI) + rnd() * 0.12);
      blobs.push([w * (0.1 + 0.8 * t) + (rnd() - 0.5) * w * 0.06, h * 0.62 - r * (0.35 + rnd() * 0.4), r]);
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let d = 0;
      for (const [bx, by, br] of blobs) { const q = 1 - Math.hypot(x - bx, (y - by) * 1.15) / br; if (q > d) d = q; }
      if (y > h * 0.66) d *= clamp(1 - (y - h * 0.66) / (h * 0.14), 0, 1); // flat-ish base
      const n = fbm4(env, x * 0.03 + seed, y * 0.045 + seed * 0.37);
      const ex = Math.min(x / w, 1 - x / w) / 0.14, ey = Math.min(y / h, 1 - y / h) / 0.1;
      const win = clamp(ex, 0, 1) * clamp(ey, 0, 1);
      const v = clamp((d + (n - 0.5) * 0.6) / 0.28, 0, 1) * win * win * (3 - 2 * win);
      dens[y * w + x] = v * v * (3 - 2 * v);
      shade[y * w + x] = 0.55 + 0.75 * (fbm4(env, x * 0.06 + seed * 2, y * 0.08) - 0.35);
    }
    return lights.map(([lx, ly, rad]) => {
      const c = mkCv(w, h), g = c.getContext('2d'), id = g.createImageData(w, h), D = id.data;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, a = dens[i]; if (a <= 0.003) continue;
        const L = Math.exp(-Math.hypot(x - lx * w, (y - ly * h) * 1.4) / (rad * w));
        const lit = clamp(L * shade[i] * 1.6, 0, 1);
        const o = i * 4;
        D[o] = 70 + 185 * Math.min(1, lit * 1.25); D[o + 1] = 55 + 180 * lit; D[o + 2] = 150 + 105 * Math.min(1, lit * 1.4);
        D[o + 3] = 255 * a * (0.12 + 0.88 * lit);
      }
      g.putImageData(id, 0, 0);
      return c;
    });
  }

  function radialSprite(size, stops) {
    const c = mkCv(size, size), g = c.getContext('2d'), r = size / 2;
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    for (const [o, col] of stops) gr.addColorStop(o, col);
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    return c;
  }

  // Line boxes we must keep legible: a strike punches a soft dark hole behind them.
  function linesIn(env, x0, y0, x1, y1) {
    const out = [];
    for (const l of env.lines) if (l.x < x1 && l.x + l.w > x0 && l.y < y1 && l.y + l.h > y0) out.push(l);
    return out;
  }
  function shieldLines(ctx, list, a) {
    if (!list.length || a <= 0.01) return;
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = a; ctx.fillStyle = '#000';
    for (let i = 0; i < list.length; i++) { const l = list[i]; ctx.fillRect(l.x - 3, l.y - 1, l.w + 6, l.h + 2); }
    ctx.restore();
  }

  // ---------------------------------------------------------------- rain streaks (shared)
  function makeRain(n) {
    return { n, x: new Float32Array(n), y: new Float32Array(n), s: new Float32Array(n), l: new Float32Array(n), styles: [] };
  }
  function seedRain(rn, env) {
    for (let i = 0; i < rn.n; i++) { rn.x[i] = R() * env.W; rn.y[i] = R() * env.H; rn.s[i] = rr(0.75, 1.3); rn.l[i] = rr(0.6, 1.35); }
    rn.styles.length = 0;
    for (let k = 0; k <= 20; k++) rn.styles.push(`rgba(${150 + k * 4},${168 + k * 4},${205 + k * 2},${(0.04 + k * 0.03).toFixed(3)})`);
  }
  function drawRain(ctx, rn, env, dt, amt, glow) {
    const n = (rn.n * amt) | 0; if (n < 1) return;
    const W = env.W, H = env.H, sp = 1150 * dt, sl = 0.17, Lb = 10 + 14 * amt;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      let y = rn.y[i] + sp * rn.s[i], x = rn.x[i] + sp * rn.s[i] * sl;
      if (y > H + 30) { y -= H + 60; x = R() * W; }
      if (x > W) x -= W;
      rn.y[i] = y; rn.x[i] = x;
      const L = Lb * rn.l[i];
      ctx.moveTo(x, y); ctx.lineTo(x - L * sl, y - L);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = rn.styles[clamp(Math.round(glow * 20), 0, 20)];
    ctx.stroke();
  }

  // ================================================================= storm-bolt
  (() => {
    const rain = makeRain(240);
    let rainAmt = 0, timer = 0, acc = 0, frontDirty = false, dimK = 1;
    let sky = null, flare = null, strike = null, wash = null;
    // reusable scratch canvases for the per-strike renders
    let spCv = null, lowA = null, lowB = null, lowC = null;
    const sparks = { n: 28, x: new Float32Array(28), y: new Float32Array(28), vx: new Float32Array(28), vy: new Float32Array(28), age: 0, on: false };

    function schedule(env, first) {
      const w = env.state.weather;
      if (first) { timer = 1.3; return; }
      timer = w === '"' ? rr(8, 25) : w === "'" ? rr(28, 70) : Infinity;
    }

    // --- bolt geometry ----------------------------------------------------
    // segs: flat array [ax, ay, bx, by, width, dist, intensity, depth] per segment
    function subdiv(ax, ay, bx, by, rough, minLen, out) {
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
      if (len < minLen) { out.push(bx, by); return; }
      const off = (R() - 0.5) * rough * len;
      const mx = (ax + bx) / 2 - (dy / len) * off, my = (ay + by) / 2 + (dx / len) * off;
      subdiv(ax, ay, mx, my, rough, minLen, out); subdiv(mx, my, bx, by, rough, minLen, out);
    }
    const gauss = () => (R() + R() + R() - 1.5) * 1.15;
    // tortuous random walk toward the end point, then fine midpoint jitter
    function tortuous(ax, ay, bx, by, spread, stepMin, stepMax, out) {
      let x = ax, y = ay, guard = 0;
      out.push(x, y);
      for (;;) {
        const dx = bx - x, dy = by - y, dist = Math.hypot(dx, dy);
        const st = rr(stepMin, stepMax);
        if (dist < st * 1.4 || ++guard > 400) { subdiv(x, y, bx, by, 0.3, 4, out); return; }
        const ang = Math.atan2(dy, dx) + gauss() * spread;
        const nx = x + Math.cos(ang) * st, ny = y + Math.sin(ang) * st;
        subdiv(x, y, nx, ny, 0.32, 4, out);
        x = nx; y = ny;
      }
    }
    function channel(segs, ax, ay, bx, by, w0, depth, d0, inten, budget) {
      const pts = [];
      tortuous(ax, ay, bx, by, depth ? 0.75 : 0.62, depth ? 5 : 7, depth ? 16 : 24, pts);
      const n = pts.length / 2 - 1; let d = d0;
      const base = Math.atan2(by - ay, bx - ax);
      for (let i = 0; i < n; i++) {
        const px = pts[i * 2], py = pts[i * 2 + 1], qx = pts[i * 2 + 2], qy = pts[i * 2 + 3];
        const f = i / n;
        const w = depth === 0 ? w0 * (1 - 0.5 * f) : w0 * Math.pow(1 - f, 0.85);
        const sl = Math.hypot(qx - px, qy - py);
        segs.push(px, py, qx, qy, w, d, inten, depth);
        d += sl;
        const pb = depth === 0 ? 0.045 * (1.35 - f) : depth === 1 ? 0.04 * (1 - f) : 0.03 * (1 - f);
        if (depth < 3 && budget.n > 0 && i > 2 && f < 0.88 && R() < pb) {
          budget.n--;
          const side = R() < 0.5 ? -1 : 1;
          const ang = clamp(base + side * rr(0.35, 1.0), 0.25, Math.PI - 0.25);
          const remain = Math.hypot(bx - px, by - py);
          const L = Math.max(18, remain * rr(0.18, 0.55) * (depth ? 0.75 : 1));
          channel(segs, qx, qy, qx + Math.cos(ang) * L, qy + Math.sin(ang) * L, Math.max(0.7, w * 0.62), depth + 1, d, inten * 0.5, budget);
        }
      }
      return d;
    }

    function pickTarget(env) {
      const W = env.W, p = env.protect;
      const ledges = env.panes.filter((q) => q.y > 60 && q.name !== 'Map');
      const comm = env.panes.find((q) => q.name === 'Comm');
      let textRight = env.out.x + 40;
      for (const l of env.lines) if (l.y < p.fadeTop - 40) textRight = Math.max(textRight, l.x + l.w);
      const gx0 = textRight + 40, gx1 = env.out.x + env.out.w - 30;
      const u = R();
      if (u < 0.34 && ledges.length) {
        const q = ledges[(R() * ledges.length) | 0];
        return { x: q.x + q.border + R() * (q.w - 2 * q.border), y: q.y + q.border * 0.5, ledge: true };
      }
      if (u < 0.55 && comm) return { x: comm.x + comm.w * rr(0.25, 0.75), y: comm.y + comm.h - comm.border - 1, ledge: false };
      if (gx1 - gx0 > 60) return { x: rr(gx0, gx1), y: p.fadeTop + rr(10, 40), ledge: false };
      return { x: W * rr(0.45, 0.7), y: p.fadeTop + 20, ledge: false };
    }

    function startStrike(env) {
      const tg = pickTarget(env);
      const map = env.panes.find((q) => q.name === 'Map');
      let x0 = 0;
      for (let k = 0; k < 8; k++) {
        x0 = clamp(tg.x + (tg.ledge ? rr(-110, 110) : rr(-260, 220)), env.W * 0.3, env.W - 20);
        if (!map || x0 < map.x - 30 || x0 > map.x + map.w + 30 || (!tg.ledge && R() < 0.08)) break;
      }
      const y0 = -8;
      const segs = [];
      const mainLen = channel(segs, x0, y0, tg.x, tg.y, rr(2.4, 3.1), 0, 0, 1, { n: 22 });
      const nk = nightOf(env.state.light);
      const fog = env.state.fog === '=' ? 0.7 : env.state.fog === '-' ? 0.85 : 1;
      // bbox
      let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
      for (let i = 0; i < segs.length; i += 8) {
        bx0 = Math.min(bx0, segs[i], segs[i + 2]); bx1 = Math.max(bx1, segs[i], segs[i + 2]);
        by0 = Math.min(by0, segs[i + 1], segs[i + 3]); by1 = Math.max(by1, segs[i + 1], segs[i + 3]);
      }
      const pad = 70;
      bx0 = Math.floor(bx0 - pad); by0 = Math.floor(Math.max(-pad, by0 - pad)); bx1 = Math.ceil(bx1 + pad); by1 = Math.ceil(by1 + pad);
      const sw = bx1 - bx0, sh = by1 - by0, dpr = env.dpr;

      // --- Path2D buckets by (intensity level, width) for the leader and the stroke
      const lead = [new Path2D(), new Path2D()];
      const nseg = segs.length / 8;
      const order = new Float32Array(nseg);
      for (let k = 0; k < nseg; k++) order[k] = segs[k * 8 + 5];
      const buckets = new Map();
      for (let i = 0; i < segs.length; i += 8) {
        const lev = segs[i + 7] | 0, wq = Math.round(segs[i + 4] * 3);
        const key = lev * 64 + wq;
        let b = buckets.get(key); if (!b) { b = { p: new Path2D(), w: wq / 3, lev, inten: segs[i + 6] }; buckets.set(key, b); }
        b.p.moveTo(segs[i], segs[i + 1]); b.p.lineTo(segs[i + 2], segs[i + 3]);
      }
      // --- render the return stroke once
      if (!spCv) { spCv = mkCv(1, 1); lowA = mkCv(1, 1); lowB = mkCv(1, 1); lowC = mkCv(1, 1); }
      spCv.width = Math.ceil(sw * dpr); spCv.height = Math.ceil(sh * dpr);
      const g = spCv.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, -bx0 * dpr, -by0 * dpr);
      g.lineCap = 'round'; g.lineJoin = 'round';
      const q = 4; // low-res glow scale
      lowA.width = Math.ceil(sw / q) + 2; lowA.height = Math.ceil(sh / q) + 2;
      lowB.width = lowA.width; lowB.height = lowA.height; lowC.width = lowA.width; lowC.height = lowA.height;
      const ga = lowA.getContext('2d');
      ga.setTransform(1 / q, 0, 0, 1 / q, -bx0 / q, -by0 / q); ga.lineCap = 'round'; ga.lineJoin = 'round';
      for (const b of buckets.values()) {
        ga.strokeStyle = `rgba(${b.lev ? 150 : 175},${b.lev ? 120 : 160},255,${(b.lev ? 0.5 * b.inten : 1).toFixed(3)})`;
        ga.lineWidth = b.w * 5 + 6; ga.stroke(b.p);
      }
      const gb = lowB.getContext('2d'); gb.filter = 'blur(2.5px)'; gb.drawImage(lowA, 0, 0); gb.filter = 'none';
      const gc = lowC.getContext('2d'); gc.filter = 'blur(9px)'; gc.drawImage(lowA, 0, 0); gc.filter = 'none';
      g.globalCompositeOperation = 'lighter';
      g.save(); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.globalAlpha = 0.9 * fog; g.drawImage(lowC, 0, 0, lowC.width * q, lowC.height * q);
      g.globalAlpha = 0.8; g.drawImage(lowB, 0, 0, lowB.width * q, lowB.height * q);
      g.restore();
      for (const b of buckets.values()) { // inner blue-white sheath
        g.strokeStyle = `rgba(165,185,255,${(0.42 * (b.lev ? b.inten * 1.4 : 1)).toFixed(3)})`;
        g.lineWidth = b.w * 2.6 + 1.5; g.stroke(b.p);
      }
      g.globalCompositeOperation = 'source-over';
      for (const b of buckets.values()) { // white-hot core
        g.strokeStyle = b.lev === 0 ? '#ffffff' : `rgba(235,240,255,${clamp(b.inten * 1.7, 0.25, 1).toFixed(3)})`;
        g.lineWidth = Math.max(0.6, b.w * (b.lev ? 0.85 : 1)); g.stroke(b.p);
      }
      // afterglow: only the main channel, violet, from the blurred buffer
      const ag = lowA.getContext('2d');
      ag.setTransform(1, 0, 0, 1, 0, 0); ag.clearRect(0, 0, lowA.width, lowA.height);
      ag.setTransform(1 / q, 0, 0, 1 / q, -bx0 / q, -by0 / q);
      for (const b of buckets.values()) if (b.lev === 0) { ag.strokeStyle = 'rgb(170,110,255)'; ag.lineWidth = b.w * 3 + 4; ag.stroke(b.p); }
      for (const b of buckets.values()) if (b.lev === 0) { ag.strokeStyle = 'rgb(235,215,255)'; ag.lineWidth = b.w * 0.9; ag.stroke(b.p); }

      // --- envelope: return stroke plus 1-3 re-strikes
      const strokes = [0, 1]; // [time, peak] pairs
      const nre = 1 + ((R() * 3) | 0);
      let t = 0;
      for (let k = 0; k < nre; k++) { t += rr(0.06, 0.14); strokes.push(t, rr(0.6, 0.95)); }
      const tLead = rr(0.085, 0.14);
      const sweep = 12; // leader steps
      // --- rim light per pane (front layer)
      const rims = [];
      const fxx = (x) => clamp(x, bx0, bx1);
      for (const p of env.panes) {
        // nearest main-channel point to the pane
        let best = 1e9, nx = 0, ny = 0;
        for (let i = 0; i < segs.length; i += 32) {
          if (segs[i + 7] !== 0) continue;
          const x = segs[i], y = segs[i + 1];
          const dx = x < p.x ? p.x - x : x > p.x + p.w ? x - p.x - p.w : 0;
          const dy = y < p.y ? p.y - y : y > p.y + p.h ? y - p.y - p.h : 0;
          const dd = Math.hypot(dx, dy);
          if (dd < best) { best = dd; nx = x; ny = y; }
        }
        const k = 1 / (1 + best / 160);
        if (k < 0.12) continue;
        const behind = best === 0;
        const rim = new Path2D(), band = new Path2D(), b = p.border;
        const L = nx < p.x + p.w / 2, Rt = !L;
        if (behind || L) { rim.moveTo(p.x + 0.75, p.y + p.h); rim.lineTo(p.x + 0.75, p.y + 0.75); band.moveTo(p.x + b / 2, p.y + p.h); band.lineTo(p.x + b / 2, p.y + b / 2); }
        if (behind || Rt) { rim.moveTo(p.x + p.w - 0.75, p.y + 0.75); rim.lineTo(p.x + p.w - 0.75, p.y + p.h); band.moveTo(p.x + p.w - b / 2, p.y + b / 2); band.lineTo(p.x + p.w - b / 2, p.y + p.h); }
        rim.moveTo(p.x, p.y + 0.75); rim.lineTo(p.x + p.w, p.y + 0.75);
        band.moveTo(p.x, p.y + b / 2); band.lineTo(p.x + p.w, p.y + b / 2);
        const gr = env.front.createRadialGradient(nx, ny, 0, nx, ny, Math.max(260, p.h * 0.9));
        gr.addColorStop(0, 'rgba(235,240,255,1)'); gr.addColorStop(0.45, 'rgba(170,175,255,0.75)'); gr.addColorStop(1, 'rgba(120,110,255,0.08)');
        rims.push({ rim, band, gr, k: k * (behind ? 1.15 : 1), b });
      }
      strike = {
        segs, order, nseg, mainLen, tLead, sweep, el: 0, strokes, end: t + rr(0.7, 1.0),
        bx0, by0, sw, sh, q, x0, tx: tg.x, ty: tg.y, ledge: tg.ledge, nk, fog, rims,
        shield: linesIn(env, bx0 + pad * 0.5, by0, bx1 - pad * 0.5, by1),
        skyShield: linesIn(env, x0 - 560, 0, x0 + 560, env.H * 0.6),
      };
      sparks.on = false;
    }

    function bright(s, t) { // stroke brightness at time t after the return stroke
      let b = 0; const st = s.strokes;
      for (let i = 0; i < st.length; i += 2) {
        const d = t - st[i];
        if (d >= 0) b = Math.max(b, st[i + 1] * (d < 0.012 ? 1 : Math.exp(-(d - 0.012) / 0.045)));
      }
      return b;
    }

    function drawLeader(ctx, s) {
      const prog = clamp(s.el / s.tLead, 0, 1);
      const reach = Math.ceil(prog * s.sweep) / s.sweep * s.mainLen; // stepped advance
      const segs = s.segs;
      ctx.lineCap = 'round';
      const glow = new Path2D(), tip = new Path2D();
      for (let k = 0, i = 0; k < s.nseg; k++, i += 8) {
        const d = segs[i + 5];
        if (d > reach) continue;
        glow.moveTo(segs[i], segs[i + 1]); glow.lineTo(segs[i + 2], segs[i + 3]);
        if (d > reach - s.mainLen / s.sweep * 1.3) { tip.moveTo(segs[i], segs[i + 1]); tip.lineTo(segs[i + 2], segs[i + 3]); }
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(130,120,255,${(0.16 * s.nk).toFixed(3)})`; ctx.lineWidth = 5; ctx.stroke(glow);
      ctx.strokeStyle = `rgba(190,200,255,${(0.38 + 0.2 * s.nk).toFixed(3)})`; ctx.lineWidth = 1; ctx.stroke(glow);
      ctx.strokeStyle = 'rgba(235,240,255,0.95)'; ctx.lineWidth = 1.6; ctx.stroke(tip);
      ctx.globalCompositeOperation = 'source-over';
    }

    function drawStrike(env, dt) {
      const s = strike, b = env.back, f = env.front;
      s.el += dt;
      if (s.el < s.tLead) {
        drawLeader(b, s);
        // faint sky flicker while the leader probes
        if (sky) {
          b.globalCompositeOperation = 'lighter';
          b.globalAlpha = (0.05 + 0.05 * R()) * s.nk;
          b.drawImage(sky, s.x0 - 520, -30, 1040, env.H * 0.55);
          b.globalAlpha = 1; b.globalCompositeOperation = 'source-over';
        }
        return 0;
      }
      const t = s.el - s.tLead;
      if (t > s.end) { strike = null; return 0; }
      const B = bright(s, t);
      const last = s.strokes[s.strokes.length - 2];
      const A = t < last ? 0.22 : 0.22 * Math.exp(-(t - last) / 0.28);
      // sky flash: clouds above lit from inside
      const flashK = (0.35 + 0.55 * s.nk) * (2 - s.fog);
      b.globalCompositeOperation = 'lighter';
      if (sky && B > 0.03) {
        b.globalAlpha = clamp(B * flashK * 0.75, 0, 1);
        b.drawImage(sky, s.x0 - 560, -40, 1120, env.H * 0.62);
      }
      if (B > 0.05 && wash) { // the whole sky blinks for an instant
        b.globalAlpha = clamp(B * B * flashK * 0.12, 0, 1); b.fillStyle = wash; b.fillRect(0, 0, env.W, env.H * 0.85);
      }
      // the bolt
      const sx = s.bx0, sy = s.by0;
      const V = Math.max(B, A);
      if (A > 0.01) { b.globalAlpha = A * 0.6; b.drawImage(lowA, sx, sy, lowA.width * s.q, lowA.height * s.q); }
      if (V > 0.02) { b.globalAlpha = clamp(V * (0.8 + 0.35 * s.nk) * s.fog, 0, 1); b.drawImage(spCv, sx, sy, s.sw, s.sh); }
      b.globalAlpha = 1; b.globalCompositeOperation = 'source-over';
      shieldLines(b, s.shield, 0.85);
      if (B > 0.03) shieldLines(b, s.skyShield, 0.6);
      // rim light on pane borders (front)
      if (B > 0.04) {
        f.lineCap = 'butt';
        for (const r of s.rims) {
          f.strokeStyle = r.gr;
          f.globalAlpha = clamp(B * r.k * 0.35, 0, 1); f.lineWidth = r.b; f.stroke(r.band);
          f.globalAlpha = clamp(B * r.k * 1.1, 0, 1); f.lineWidth = 1.5; f.stroke(r.rim);
        }
        f.globalAlpha = 1;
      }
      // impact on a ledge: flare and sparks
      if (s.ledge) {
        if (!sparks.on && t < 0.05) {
          sparks.on = true; sparks.age = 0;
          for (let i = 0; i < sparks.n; i++) {
            const a = rr(-Math.PI * 0.95, -Math.PI * 0.05), v = rr(60, 340);
            sparks.x[i] = s.tx; sparks.y[i] = s.ty; sparks.vx[i] = Math.cos(a) * v; sparks.vy[i] = Math.sin(a) * v;
          }
        }
        if (B > 0.03 && flare) { f.globalCompositeOperation = 'lighter'; f.globalAlpha = clamp(B, 0, 1); f.drawImage(flare, s.tx - 48, s.ty - 48, 96, 96); f.globalAlpha = 1; f.globalCompositeOperation = 'source-over'; }
      }
      return 1;
    }

    function drawSparks(f, dt) {
      sparks.age += dt;
      const life = 0.65;
      if (sparks.age > life) { sparks.on = false; return; }
      f.beginPath();
      for (let i = 0; i < sparks.n; i++) {
        const x = sparks.x[i], y = sparks.y[i];
        sparks.vy[i] += 700 * dt;
        sparks.x[i] += sparks.vx[i] * dt; sparks.y[i] += sparks.vy[i] * dt;
        f.moveTo(x, y); f.lineTo(sparks.x[i], sparks.y[i]);
      }
      const a = 1 - sparks.age / life;
      f.strokeStyle = `rgba(${220 + (35 * a) | 0},${200 + (50 * a) | 0},255,${(a * 0.95).toFixed(3)})`;
      f.lineWidth = 1.3; f.lineCap = 'round'; f.stroke();
    }

    WX.register({
      id: 'storm-bolt',
      title: 'Blixtnedslag',
      family: 'Åska',
      note: 'Förgrenad blixt som slår ner bakom panelerna och lyser upp deras kanter – kommer av sig själv i ösregn (oftast på natten), tryck ⚡ Blixt för att slå direkt.',
      preset: { weather: '"', fog: '', light: 'o' },
      fps: 60,
      manualClear: true,
      init(env) {
        strike = null; sparks.on = false; acc = 1;
        rainAmt = rainOf(env.state.weather);
        if (!sky) {
          sky = cloudSprite(env, 220, 90, 7.3, [235, 238, 255], [110, 100, 200], { top: true });
          flare = radialSprite(96, [[0, 'rgba(255,255,255,1)'], [0.12, 'rgba(225,230,255,0.9)'], [0.4, 'rgba(150,140,255,0.3)'], [1, 'rgba(110,90,255,0)']]);
        }
        schedule(env, true);
      },
      resize(env) {
        seedRain(rain, env);
        wash = env.back.createLinearGradient(0, 0, 0, env.H * 0.85);
        wash.addColorStop(0, 'rgba(205,210,255,1)'); wash.addColorStop(0.5, 'rgba(150,150,240,0.45)'); wash.addColorStop(1, 'rgba(120,110,230,0)'); strike = null; sparks.on = false; env.back.clearRect(0, 0, env.W, env.H); env.front.clearRect(0, 0, env.W, env.H); acc = 1; },
      onState(env, key) { if (key === 'weather') { const old = timer; schedule(env, false); if (old < timer) timer = old; } },
      onEvent(env, name) { if (name === 'strike') startStrike(env); },
      frame(env, dt) {
        const want = rainOf(env.state.weather);
        rainAmt += (want - rainAmt) * Math.min(1, dt * 0.6);
        dimK += (nightOf(env.state.light) - dimK) * Math.min(1, dt * 0.5);
        timer -= dt;
        if (timer <= 0) { if (!strike) startStrike(env); schedule(env, false); }
        acc += dt;
        const busy = strike || sparks.on;
        if (!busy && !frontDirty && acc < 1 / 30 - 0.003) return; // idle: rain at 30 fps, skip the frame entirely
        const step = acc; acc = 0;
        const b = env.back, f = env.front;
        b.clearRect(0, 0, env.W, env.H);
        if (frontDirty) { f.clearRect(0, 0, env.W, env.H); frontDirty = false; }
        let lit = 0;
        if (strike && strike.el >= strike.tLead) lit = bright(strike, strike.el - strike.tLead);
        // rain: barely there at night until the flash catches it
        const base = 0.16 + 0.16 * (1 - dimK);
        if (rainAmt > 0.01) drawRain(b, rain, env, step, rainAmt, base + lit * 0.55 * dimK);
        if (strike) { drawStrike(env, step); frontDirty = true; }
        if (sparks.on) { drawSparks(f, step); frontDirty = true; }
      },
      destroy(env) { strike = null; sparks.on = false; },
    });
  })();

  // ================================================================= storm-ascii
  (() => {
    // glyph set and phosphor palette (white-hot -> cyan -> blue -> violet -> gone)
    const GL = ['│', '╱', '╲', '┼', '·', '*'];
    const G_V = 0, G_L = 1, G_R = 2, G_X = 3, G_DOT = 4, G_STAR = 5;
    const PAL = ['#ffffff', '#e4f8ff', '#b4ecff', '#7ddcff', '#48bdfa', '#3b8cf0', '#4c62dc', '#4d45b4', '#3c2f86', '#271f58'];
    const NL = PAL.length, INV = NL; // atlas row NL = inverted video
    const MAXC = 900;
    const cc = new Int16Array(MAXC), cr = new Int16Array(MAXC), cg = new Uint8Array(MAXC), ck = new Uint8Array(MAXC);
    const ct = new Float32Array(MAXC);
    let nc = 0;
    let atlas = null, aw = 0, ah = 0, pad = 0;
    let cw = 8, ch = 16, gx = 0, gy = 0, cols = 0, rows = 0, occ = null, lineAt = null;
    let st = null, timer = 0, rainAmt = 0, dimK = 1;
    const RN = 70;
    const rc = new Int16Array(RN), ry = new Float32Array(RN), rv = new Float32Array(RN);
    const STEP = 0.0042; // seconds per cell of the leader

    function buildAtlas(env) {
      cw = env.cell.w; ch = env.cell.h;
      const dpr = env.dpr; pad = 6;
      aw = Math.ceil(cw + pad * 2); ah = Math.ceil(ch + pad * 2);
      atlas = mkCv(aw * GL.length * dpr, ah * (NL + 1) * dpr);
      const g = atlas.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.font = env.cell.font; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      const m = g.measureText('│');
      const asc = m.actualBoundingBoxAscent || env.cell.size * 0.93, des = m.actualBoundingBoxDescent || env.cell.size * 0.24;
      const sy = ch / (asc + des);
      for (let lv = 0; lv <= NL; lv++) for (let k = 0; k < GL.length; k++) {
        const x0 = k * aw, y0 = lv * ah;
        g.save();
        if (lv === INV) {
          g.fillStyle = '#dff3ff'; g.shadowColor = 'rgba(140,210,255,0.9)'; g.shadowBlur = 6;
          g.fillRect(x0 + pad, y0 + pad, cw, ch);
          g.shadowBlur = 0; g.fillStyle = '#0b1030';
        } else {
          g.fillStyle = PAL[lv];
          if (lv < 6) { g.shadowColor = PAL[Math.min(NL - 1, lv + 3)]; g.shadowBlur = lv < 2 ? 7 : 4; }
        }
        g.translate(x0 + pad + cw / 2, y0 + pad + asc * sy);
        g.scale(1, sy);
        g.fillText(GL[k], 0, 0);
        if (lv < 2 && lv !== INV) g.fillText(GL[k], 0, 0); // double pass: hotter core
        g.restore();
      }
    }

    function buildGrid(env) {
      const l0 = env.lines[0];
      gx = l0 ? l0.x : env.out.x + 2; gx -= Math.floor(gx / cw) * cw;
      gy = l0 ? l0.y - (ch - l0.h) / 2 : 0; gy -= Math.floor(gy / ch) * ch;
      cols = Math.floor((env.W - gx) / cw);
      rows = Math.max(1, Math.floor((env.protect.fadeTop - gy) / ch) + 1);
      occ = new Uint8Array(cols * rows); lineAt = new Int16Array(rows).fill(-1);
      env.lines.forEach((l, i) => {
        const r = Math.round((l.y + l.h / 2 - gy) / ch - 0.5); if (r < 0 || r >= rows) return;
        const c0 = Math.max(0, Math.floor((l.x - gx) / cw)), c1 = Math.min(cols, Math.ceil((l.x + l.w - gx) / cw));
        for (let c = c0; c < c1; c++) occ[r * cols + c] = 1;
      });
      for (const p of env.panes) {
        const solid = p.name === 'Map';
        const c0 = Math.max(0, Math.floor((p.x - gx) / cw)), c1 = Math.min(cols, Math.ceil((p.x + p.w - gx) / cw));
        const r0 = Math.max(0, Math.floor((p.y - gy) / ch)), r1 = Math.min(rows, Math.ceil((p.y + p.h - gy) / ch));
        for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
          const x = gx + c * cw, y = gy + r * ch;
          const inner = x >= p.x + p.border && x + cw <= p.x + p.w - p.border && y >= p.y + p.border && y + ch <= p.y + p.h - p.border;
          if (solid || !inner) occ[r * cols + c] = 2;
        }
      }
    }

    function put(c, r, g, t, k) {
      if (nc >= MAXC || c < 0 || c >= cols || r < 0 || r >= rows) return;
      cc[nc] = c; cr[nc] = r; cg[nc] = g; ct[nc] = t; ck[nc] = k; nc++;
    }

    // Zigzag walk with a pen on half-cell x units (p2): odd = cell centre, even = cell edge.
    // '╲' enters at the left edge and leaves at the right, '╱' the reverse, '│' runs through the centre,
    // so alternating diagonals join up exactly. Returns where it ended.
    function walk(p2, r, dir, maxLen, kind, t, budget) {
      let i = 0, run = 1 + ((R() * 3) | 0), c = 0;
      const drift = kind ? 0 : walkDrift;
      while (i++ < maxLen) {
        if (r >= rows) return { c, r: rows - 1, t, hit: 0 };
        if (--run <= 0) {
          const u = R();
          dir = dir !== 0 ? (u < 0.62 ? -dir : u < 0.82 ? 0 : dir) : (R() < 0.5 + drift ? 1 : -1);
          if (dir === -Math.sign(drift) && R() < Math.abs(drift) * 1.6) dir = -dir;
          run = dir === 0 ? 1 + ((R() * 2) | 0) : 1 + ((R() * (kind ? 3 : 4)) | 0);
        }
        if (dir === 0 && (p2 & 1) === 0) p2 += R() < 0.5 ? -1 : 1;
        if (dir !== 0 && (p2 & 1) === 1) p2 += dir;
        p2 = clamp(p2, 3, cols * 2 - 4);
        c = dir === 0 ? (p2 - 1) >> 1 : dir > 0 ? p2 >> 1 : (p2 >> 1) - 1;
        const o = occ[r * cols + c];
        if (o === 1) return { c, r, t, hit: 1 };
        const g = dir < 0 ? G_L : dir > 0 ? G_R : G_V;
        const fork = kind < 2 && budget.n > 0 && i > 3 && R() < (kind ? 0.08 : 0.13 * (1.3 - r / rows));
        put(c, r, fork && g === G_V ? G_X : g, t, kind);
        p2 += dir * 2;
        if (fork) {
          budget.n--;
          const bd = dir === 0 ? (R() < 0.5 ? -1 : 1) : -dir;
          walk(p2, r + 1, bd, kind ? 2 + ((R() * 5) | 0) : 5 + ((R() * 12) | 0), kind + 1, t + STEP, budget);
        }
        t += STEP; r++;
      }
      return { c, r, t, hit: 0 };
    }

    let walkDrift = 0;
    function startStrike(env) {
      if (!occ) return;
      nc = 0; walkDrift = rr(-0.3, 0.3);
      // start column: free from the top rows, mostly over the open right half of the output
      let c0 = 0;
      for (let k = 0; k < 30; k++) {
        c0 = (cols * rr(0.35, 0.97)) | 0;
        if (occ[c0] === 0 && occ[cols + c0] === 0) break;
      }
      const end = walk(c0 * 2 + 1, 0, 0, rows + 40, 0, 0, { n: 10 });
      // end of the main channel: a splash
      const tR = end.t + 0.02;
      const splash = [];
      if (end.hit === 0) for (let k = -3; k <= 3; k++) if (k) splash.push(end.c + k);
      let inv = null;
      if (end.hit === 1) { // struck a line of text: invert a run of it
        let a = end.c, b = end.c;
        while (a > 0 && occ[end.r * cols + a - 1] === 1 && end.c - a < 6) a--;
        while (b < cols - 1 && occ[end.r * cols + b + 1] === 1 && b - end.c < 9) b++;
        inv = { r: end.r, a, b };
      }
      const re = [];
      let t = 0.11;
      for (let k = 0, n = 1 + ((R() * 2.4) | 0); k < n; k++) { re.push(t); t += rr(0.07, 0.12); }
      st = { el: 0, tR, end, splash, inv, re, nk: nightOf(env.state.light), dur: tR + t + 1.4 };
    }

    // phosphor level of a cell at strike time tau; -1 = invisible
    function level(i, tau) {
      const t0 = ct[i]; if (tau < t0) return -1;
      const k = ck[i];
      if (tau < st.tR) { // leader
        const age = tau - t0;
        if (age < 0.012) return INV;
        if (age < 0.035) return 2;
        return k === 0 ? 5 : 6 + k;
      }
      const s = tau - st.tR;
      if (k === 2 && s > 0.5) return -1;
      // return stroke and re-strikes: inverted video on the main channel
      if (s < 0.05) return k === 0 ? INV : 1;
      for (let j = 0; j < st.re.length; j++) { const d = s - st.re[j]; if (d >= 0 && d < 0.035) return k === 0 ? INV : 2; }
      const dec = k === 0 ? 0.11 : 0.07;
      const lv = 1 + Math.floor((s - 0.05) / dec) + k;
      return lv >= NL ? -1 : lv;
    }

    function blit(ctx, g, lv, c, r) {
      ctx.drawImage(atlas, g * aw * dprA, lv * ah * dprA, aw * dprA, ah * dprA, gx + c * cw - pad, gy + r * ch - pad, aw, ah);
    }
    let dprA = 1;

    WX.register({
      id: 'storm-ascii',
      title: 'Terminalblixt',
      family: 'Åska',
      note: 'En blixt i ren textgrafik: tecken för tecken ner genom skärmen med inverterad video och fosforefterglöd – tryck ⚡ Blixt, och låt den gärna slå ner i texten.',
      preset: { weather: '"', fog: '', light: 'o' },
      fps: 30,
      init(env) { st = null; timer = 1.2; rainAmt = rainOf(env.state.weather); },
      resize(env) {
        dprA = env.dpr; buildAtlas(env); buildGrid(env); st = null;
        for (let i = 0; i < RN; i++) { rc[i] = (R() * cols) | 0; ry[i] = R() * rows; rv[i] = rr(26, 40); }
      },
      onEvent(env, name) { if (name === 'strike') startStrike(env); },
      frame(env, dt) {
        if (!atlas) return;
        const b = env.back;
        rainAmt += (rainOf(env.state.weather) - rainAmt) * Math.min(1, dt * 0.6);
        dimK += (nightOf(env.state.light) - dimK) * Math.min(1, dt * 0.5);
        timer -= dt;
        if (timer <= 0) {
          if (!st) startStrike(env);
          const w = env.state.weather; timer = w === '"' ? rr(8, 25) : w === "'" ? rr(28, 70) : Infinity;
        }
        let flash = 0;
        if (st) {
          st.el += dt;
          const s = st.el - st.tR;
          if (s >= 0 && s < 0.05) flash = 1; else for (const r0 of st.re) if (s >= r0 && s < r0 + 0.035) flash = 0.6;
        }
        // rain: dashed '╎' strokes that fall cell by cell (one batched path), lit by the flash
        const nr = (RN * rainAmt) | 0;
        if (nr) {
          b.beginPath();
          const x0 = gx + cw / 2 - 0.5, dh = ch * 0.3;
          for (let i = 0; i < nr; i++) {
            ry[i] += rv[i] * dt;
            if (ry[i] >= rows) { ry[i] -= rows; rc[i] = (R() * cols) | 0; }
            const r = ry[i] | 0, c = rc[i];
            if (occ[r * cols + c]) continue;
            const x = x0 + c * cw, y = gy + r * ch;
            b.rect(x, y + ch * 0.12, 1, dh); b.rect(x, y + ch * 0.58, 1, dh);
          }
          b.fillStyle = PAL[flash ? 3 : dimK > 0.9 ? 8 : 7];
          b.fill();
        }
        if (!st) return;
        const tau = st.el;
        if (tau > st.dur) { st = null; return; }
        // screen flash, stepped like an old CRT
        if (flash) {
          b.fillStyle = flash === 1 ? `rgba(120,170,255,${(0.05 + 0.07 * st.nk).toFixed(3)})` : 'rgba(110,150,255,0.05)';
          b.fillRect(0, 0, env.W, env.protect.fadeTop);
        }
        for (let i = 0; i < nc; i++) {
          const lv = level(i, tau); if (lv < 0) continue;
          blit(b, cg[i], lv, cc[i], cr[i]);
        }
        const s = tau - st.tR;
        if (s >= 0) {
          // splash at the ground
          if (st.splash.length && s < 0.45) {
            const lv = Math.min(NL - 1, 1 + ((s / 0.06) | 0));
            for (let k = 0; k < st.splash.length; k++) {
              const c = st.splash[k], d = Math.abs(c - st.end.c);
              if (s < d * 0.03) continue;
              blit(b, d < 2 ? G_STAR : G_DOT, Math.min(NL - 1, lv + d), c, st.end.r);
            }
          }
          // struck text: inverted video, then the phosphor bleeds out
          if (st.inv && s < 0.7) {
            const iv = st.inv;
            const x = gx + iv.a * cw, y = gy + iv.r * ch, w = (iv.b - iv.a + 1) * cw;
            let col;
            if (s < 0.09) col = 'rgba(225,243,255,0.92)';
            else if (s < 0.2) col = 'rgba(110,200,255,0.75)';
            else if (s < 0.33) col = 'rgba(60,120,235,0.6)';
            else if (s < 0.48) col = 'rgba(70,60,190,0.45)';
            else col = 'rgba(50,35,130,0.3)';
            b.fillStyle = col; b.fillRect(x, y, w, ch);
          }
        }
      },
      destroy() { st = null; },
    });
  })();

  // ================================================================= storm-heat
  (() => {
    const clouds = [];
    let timer = 0, act = 0, k = 0, ev = null;
    const MAXP = 6;
    // a flash cluster: a few pulses inside one cloud bank, sometimes wandering
    function trigger(env, strong) {
      const W = env.W, H = env.H;
      const w = rr(560, 820) * (strong ? 1.15 : 1);
      ev = {
        el: 0, set: clouds[(R() * clouds.length) | 0], x: rr(W * 0.2, W * 0.9), y: rr(-H * 0.02, H * 0.2), w, h: w * 0.5,
        p: [], nk: nightOf(env.state.light), flip: R() < 0.5,
      };
      let t = 0;
      const n = 2 + ((R() * (strong ? 4 : 3)) | 0);
      for (let i = 0; i < Math.min(n, MAXP); i++) {
        ev.p.push({ t, a: rr(0.5, 1) * (strong ? 1.2 : 1), tau: rr(0.05, 0.13), v: (R() * 3) | 0 });
        t += rr(0.06, 0.26);
      }
      ev.dur = t + 0.5;
      ev.shield = linesIn(env, ev.x - w, ev.y - ev.h, ev.x + w, ev.y + ev.h);
    }
    function rate(env) {
      const w = env.state.weather, l = env.state.light, night = l !== '*';
      if (w === '*') return Infinity;
      if (w === '"' || w === "'") return rr(3, 9);
      if (w === '~') return rr(4, 11);
      return night ? rr(6, 15) : Infinity; // clear warm nights: classic heat lightning
    }
    WX.register({
      id: 'storm-heat',
      title: 'Kornblixt',
      family: 'Åska',
      note: 'Avlägsen kornblixt: inga blixtar, bara moln som lyser upp inifrån bakom panelerna – bäst på natten i mulet väder, ⚡ Blixt tänder en direkt.',
      preset: { weather: '~', fog: '', light: 'o' },
      fps: 30,
      init(env) {
        if (!clouds.length) {
          const L = [[0.3, 0.5, 0.22], [0.62, 0.42, 0.18], [0.5, 0.6, 0.35]];
          clouds.push(cumulusSet(env, 300, 150, 3.1, L), cumulusSet(env, 300, 150, 41.7, L));
        }
        ev = null; timer = 1.0; act = 1;
      },
      onEvent(env, name) { if (name === 'strike') trigger(env, true); },
      frame(env, dt) {
        const want = env.state.weather === '*' ? 0 : 1;
        act += (want - act) * Math.min(1, dt * 0.5);
        timer -= dt;
        if (timer <= 0) { if (!ev && act > 0.3) trigger(env, false); timer = rate(env); }
        if (!ev) return;
        ev.el += dt;
        if (ev.el > ev.dur) { ev = null; return; }
        const b = env.back, fog = env.state.fog === '=' ? 1.25 : 1;
        b.globalCompositeOperation = 'lighter';
        let any = 0;
        for (let i = 0; i < ev.p.length; i++) {
          const p = ev.p[i], d = ev.el - p.t;
          if (d < 0) continue;
          const a = p.a * (d < 0.02 ? d / 0.02 : Math.exp(-(d - 0.02) / p.tau)) * (0.3 + 0.7 * ev.nk) * act;
          if (a < 0.01) continue;
          any = Math.max(any, a);
          const w = ev.w * fog, h = ev.h * fog;
          b.globalAlpha = clamp(a, 0, 1);
          const cv = ev.set[p.v];
          if (ev.flip) { b.save(); b.translate(ev.x, 0); b.scale(-1, 1); b.drawImage(cv, -w / 2, ev.y - h / 2, w, h); b.restore(); }
          else b.drawImage(cv, ev.x - w / 2, ev.y - h / 2, w, h);
        }
        b.globalAlpha = 1; b.globalCompositeOperation = 'source-over';
        if (any > 0.02) shieldLines(b, ev.shield, 0.5);
      },
      destroy() { ev = null; },
    });
  })();
})();
