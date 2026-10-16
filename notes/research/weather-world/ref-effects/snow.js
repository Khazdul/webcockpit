// Snow family for the weather atelier.
//   snow-drift  "Snödrivor" — parallax snow that settles as soft drifts on pane ledges
//   snow-ansi   "Snöstorm"  — cell-aligned ANSI blizzard with gusts and block-char drifts
//   snow-frost  "Frost"     — ice ferns growing from pane corners in snowy darkness
(() => {
  const FAMILY = 'Snö';

  // ---------------------------------------------------------------- helpers
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function makeCanvas(w, h, dpr) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * dpr)); c.height = Math.max(1, Math.ceil(h * dpr));
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { c, g, w, h };
  }

  function softDot(r, dpr, hard, c) {
    const s = Math.ceil(r * 2 + 2);
    const k = makeCanvas(s, s, dpr);
    const gr = k.g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, r);
    const col = `${c[0] | 0},${c[1] | 0},${c[2] | 0}`;
    gr.addColorStop(0, `rgba(${col},1)`);
    gr.addColorStop(hard, `rgba(${col},.85)`);
    gr.addColorStop(1, `rgba(${col},0)`);
    k.g.fillStyle = gr; k.g.fillRect(0, 0, s, s);
    return k;
  }

  // Light palettes: [snowTop, snowBottom, edge, flake] as rgb triplets.
  const PAL = {
    '*': [[246, 249, 255], [168, 184, 206], [255, 255, 255], [236, 241, 250]],
    ')': [[206, 220, 242], [96, 114, 146], [236, 244, 255], [200, 214, 238]],
    'o': [[132, 142, 158], [54, 60, 72], [166, 176, 194], [146, 156, 172]],
    '!': [[246, 230, 206], [130, 104, 84], [255, 228, 180], [240, 222, 196]],
  };
  function makePalette(light) { return (PAL[light] || PAL['*']).map((c) => c.slice()); }
  function stepPalette(cur, light, k) {
    const tgt = PAL[light] || PAL['*']; let moved = 0;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      const d = tgt[i][j] - cur[i][j]; if (d > 0.5 || d < -0.5) moved = 1;
      cur[i][j] += d * k;
    }
    return moved;
  }
  const rgb = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

  // Free space above each pane's top border (stage top or the pane above it).
  function headroom(env, p) {
    let above = 0;
    for (const q of env.panes) {
      if (q === p) continue;
      const qb = q.y + q.h;
      if (qb <= p.y + 1 && q.x < p.x + p.w && q.x + q.w > p.x) above = Math.max(above, qb);
    }
    return p.y - above;
  }
  // Title label box of a pane (".pt": left 1.6em, top -1.05em, padding .4em).
  function titleBox(env, p) {
    const fs = env.cell.size;
    const x0 = p.x + p.border + 1.6 * fs, w = (p.name || '').length * env.cell.w + 0.8 * fs;
    const y0 = p.y + p.border - 1.05 * fs;
    return { x0, x1: x0 + w, y0, y1: y0 + 1.2 * fs };
  }

  // Far snow as two scrolling pattern tiles: dense, nearly free per frame.
  function makeTiles(env, col) {
    const d = env.dpr, out = [];
    const spec = [[300, 70, 0.7, 1.15, 0.55, 13], [420, 55, 1.0, 1.7, 0.8, 22]];
    for (const [S, n, r0, r1, a1, speed] of spec) {
      const k = makeCanvas(S, S, d);
      for (let i = 0; i < n; i++) {
        const x = Math.random() * S, y = Math.random() * S, r = r0 + Math.random() * (r1 - r0);
        const a = (0.35 + Math.random() * 0.65) * a1;
        for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
          const gx = x + ox, gy = y + oy;
          if (gx < -3 || gx > S + 3 || gy < -3 || gy > S + 3) continue;
          k.g.fillStyle = rgb(col, a);
          k.g.beginPath(); k.g.arc(gx, gy, r, 0, 6.2832); k.g.fill();
        }
      }
      const pat = env.back.createPattern(k.c, 'repeat');
      pat.setTransform(new DOMMatrix([1 / d, 0, 0, 1 / d, 0, 0]));
      out.push({ S, pat, speed, ox: Math.random() * S, oy: Math.random() * S });
    }
    return out;
  }
  function drawTiles(ctx, tiles, env, dt, wind, alpha) {
    for (const T of tiles) {
      T.oy = (T.oy + T.speed * dt) % T.S;
      T.ox = ((T.ox + wind * dt * T.speed / 40) % T.S + T.S) % T.S;
    }
    if (alpha <= 0.01) return;
    ctx.globalAlpha = alpha;
    for (const T of tiles) {
      ctx.save(); ctx.translate(T.ox, T.oy); ctx.fillStyle = T.pat;
      ctx.fillRect(-T.ox, -T.oy, env.W, env.H); ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------- drift ledges
  function buildLedges(env) {
    const out = [];
    for (const p of env.panes) {
      const head = headroom(env, p), over = 3, sink = p.border * 0.55;
      const x0 = Math.floor(p.x - over), n = Math.ceil(p.x + p.w + over) - x0;
      const cap = clamp(head - 1.5 + sink, 2, 15);
      const capArr = new Float32Array(n);
      const tb = titleBox(env, p);
      for (let i = 0; i < n; i++) {
        const x = x0 + i + 0.5;
        const e = Math.min(x - (p.x - over), p.x + p.w + over - x);
        let c = cap * Math.sqrt(clamp(e / 8, 0, 1)) * (0.72 + 0.28 * env.noise(x * 0.035, p.y * 0.1));
        if (x > tb.x0 - 1 && x < tb.x1 + 1) c = 0;
        capArr[i] = c;
      }
      out.push({ p, x0, n, base: p.y + sink, cap, capArr, h: new Float32Array(n),
        dirty: true, empty: true, slideT: 4 + Math.random() * 6 });
    }
    return out;
  }
  function depositBump(L, cx, amount, r) {
    const h = L.h, cap = L.capArr, n = L.n;
    const i0 = Math.max(0, (cx - r * 2) | 0), i1 = Math.min(n - 1, (cx + r * 2) | 0);
    for (let i = i0; i <= i1; i++) {
      const d = (i - cx) / r;
      const v = h[i] + amount * Math.exp(-d * d);
      h[i] = v > cap[i] ? cap[i] : v;
    }
    L.dirty = true;
  }
  // Angle-of-repose relaxation keeps drifts soft and rounded.
  function relax(L, iters) {
    const h = L.h, cap = L.capArr, n = L.n;
    for (let k = 0; k < iters; k++) {
      for (let i = 0; i < n - 1; i++) {
        const d = h[i] - h[i + 1];
        if (d > 0.9) { const m = (d - 0.9) * 0.3; h[i] -= m; h[i + 1] += m; }
        else if (d < -0.9) { const m = (-d - 0.9) * 0.3; h[i] += m; h[i + 1] -= m; }
      }
    }
    for (let i = 0; i < n; i++) if (h[i] > cap[i]) h[i] = cap[i];
  }
  // All drifts live in one atlas canvas covering the ledges' bounding box.
  function makeAtlas(env, ledges) {
    if (!ledges.length) return null;
    let ax0 = 1e9, ax1 = -1e9, ay0 = 1e9, ay1 = -1e9;
    for (const L of ledges) {
      ax0 = Math.min(ax0, L.x0); ax1 = Math.max(ax1, L.x0 + L.n);
      ay0 = Math.min(ay0, L.base - L.cap - 4); ay1 = Math.max(ay1, L.base + 3);
    }
    const A = makeCanvas(ax1 - ax0, ay1 - ay0, env.dpr); A.x = ax0; A.y = ay0;
    return A;
  }
  function drawStrip(L, A, pal) {
    const g = A.g, h = L.h, n = L.n, ox = L.x0 - A.x, by = L.base - A.y;
    g.clearRect(ox, by - L.cap - 4, n, L.cap + 7);
    let any = 0; for (let i = 0; i < n; i++) if (h[i] > 0.35) { any = 1; break; }
    L.empty = !any; L.dirty = false;
    if (!any) return;
    g.beginPath(); g.moveTo(ox, by);
    for (let i = 0; i < n; i++) g.lineTo(ox + i + 0.5, by - (h[i] > 0.35 ? h[i] : 0));
    g.lineTo(ox + n, by); g.closePath();
    const gr = g.createLinearGradient(0, by - L.cap, 0, by + 1);
    gr.addColorStop(0, rgb(pal[0], 0.97));
    gr.addColorStop(0.5, rgb(pal[0], 0.9));
    gr.addColorStop(1, rgb(pal[1], 0.9));
    g.fillStyle = gr; g.fill();
    g.beginPath(); let pen = 0;
    for (let i = 0; i < n; i++) {
      const v = h[i];
      if (v > 0.7) { const y = by - v + 0.5; if (!pen) { g.moveTo(ox + i + 0.5, y); pen = 1; } else g.lineTo(ox + i + 0.5, y); }
      else pen = 0;
    }
    g.strokeStyle = rgb(pal[2], 0.9); g.lineWidth = 1; g.stroke();
  }

  // Path over the visible output lines; used to thin out back-layer snow behind text.
  function linesPath(env) {
    const P = new Path2D();
    for (const l of env.lines) P.rect(l.x - 2, l.y + 1, l.w + 4, l.h - 2);
    return P;
  }
  function shieldText(ctx, path, a) {
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = a;
    ctx.fillStyle = '#000'; ctx.fill(path); ctx.restore();
  }

  function pool(n) {
    return { n, x: new Float32Array(n), y: new Float32Array(n), v: new Float32Array(n),
      s: new Uint8Array(n), ph: new Float32Array(n), a: new Uint8Array(n) };
  }

  // ======================================================= 1. Snödrivor
  {
    const NM = 54, NN = 10;
    let M, N, ledges, atlas, tiles, pal, amt, sprNear, sprClump, sprPuff, clumps, puffs, glints;
    let rr, wind, sprT, stripT, envRef, shield;

    function seed(P, i, top, sp0, sp1, nS) {
      P.x[i] = Math.random() * (envRef.W + 80) - 40;
      P.y[i] = top ? -10 - Math.random() * 40 : Math.random() * envRef.H;
      P.v[i] = sp0 + Math.random() * (sp1 - sp0);
      P.s[i] = (Math.random() * nS) | 0;
      P.ph[i] = Math.random() * 6.283;
      P.a[i] = Math.random() < amt ? 1 : 0;
    }
    function makeSprites(env) {
      const d = env.dpr, c = pal[3];
      sprNear = softDot(6, d, 0.12, c); sprClump = softDot(2.4, d, 0.5, pal[0]); sprPuff = softDot(1.5, d, 0.3, c);
      tiles = makeTiles(env, c);
    }

    WX.register({
      id: 'snow-drift', title: 'Snödrivor', family: FAMILY, fps: 30,
      note: 'Snö i tre djup som lägger sig som drivor på panelernas överkanter och ibland rasar ner i pudrande klumpar; låt den falla en halv minut, byt sedan ljus eller väder så smälter drivorna bort.',
      preset: { weather: '*', fog: '', light: ')' },
      init(env) {
        envRef = env;
        pal = makePalette(env.state.light);
        amt = env.state.weather === '*' ? 1 : 0;
        M = pool(NM); N = pool(NN);
        clumps = []; puffs = []; glints = []; wind = 0; sprT = 0; stripT = 0; ledges = null;
        for (let i = 0; i < 6; i++) clumps.push({ on: 0, x: 0, y: 0, vx: 0, vy: 0, y0: 0, stop: 0, r: 2 });
        for (let i = 0; i < 80; i++) puffs.push({ on: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, r: 1 });
        for (let i = 0; i < 10; i++) glints.push({ on: 0, x: 0, y: 0, life: 0 });
      },
      resize(env) {
        envRef = env; makeSprites(env);
        for (let i = 0; i < NM; i++) seed(M, i, false, 30, 50, 3);
        for (let i = 0; i < NN; i++) seed(N, i, false, 90, 140, 1);
        const old = ledges; ledges = buildLedges(env);
        if (old) for (const L of ledges) {
          const o = old.find((q) => q.p.id === L.p.id);
          if (o) for (let i = 0; i < L.n && i < o.n; i++) L.h[i] = Math.min(o.h[i], L.capArr[i]);
        }
        atlas = makeAtlas(env, ledges); shield = linesPath(env);
        for (const L of ledges) drawStrip(L, atlas, pal);
        rr = 0;
      },
      frame(env, dt, t) {
        const W = env.W, H = env.H, b = env.back, f = env.front, st = env.state;
        const snowing = st.weather === '*';
        amt += ((snowing ? 1 : 0) - amt) * Math.min(1, dt / 3);
        const palMoving = stepPalette(pal, st.light, Math.min(1, dt / 2.5));
        sprT -= dt; if (palMoving && sprT <= 0) { makeSprites(env); sprT = 0.5; }
        const ts = t / 1000;
        wind = (env.noise(ts * 0.08, 3.1) - 0.5) * 70 + 8;
        const fogDim = st.fog === '=' ? 0.45 : st.fog === '-' ? 0.75 : 1;
        const dark = st.light === 'o' ? 0.75 : 1;
        const vis = amt * fogDim * dark;

        // ---- far layers (back)
        drawTiles(b, tiles, env, dt, wind, vis);

        // ---- mid layer (back): soft flakes that land on ledges
        const nL = ledges.length;
        for (let i = 0; i < NM; i++) {
          const y0 = M.y[i];
          let y = y0 + M.v[i] * dt;
          let x = M.x[i] + (wind * 0.65 + Math.sin(M.ph[i] + ts * 1.3) * 13) * dt;
          let landed = false;
          if (M.a[i] && snowing) {
            for (let k = 0; k < nL; k++) {
              const L = ledges[k]; const ci = (x - L.x0) | 0;
              if (ci < 0 || ci >= L.n || L.capArr[ci] <= 0) continue;
              const sy = L.base - L.h[ci] - 1;
              if (y0 < sy && y >= sy) { depositBump(L, ci, 0.6, 2.2); landed = true; break; }
            }
          }
          if (landed || y > H + 4) { seed(M, i, true, 30, 50, 3); y = M.y[i]; x = M.x[i]; }
          if (x < -40) x += W + 80; else if (x > W + 40) x -= W + 80;
          M.y[i] = y; M.x[i] = x;
        }
        if (vis > 0.01) {
          b.beginPath();
          for (let i = 0; i < NM; i++) if (M.a[i]) { const r = 1.7 + M.s[i] * 0.45, x = M.x[i], y = M.y[i]; b.moveTo(x + r, y); b.arc(x, y, r, 0, 6.2832); }
          b.fillStyle = rgb(pal[3], 0.3 * vis); b.fill();
          b.beginPath();
          for (let i = 0; i < NM; i++) if (M.a[i]) { const r = 0.75 + M.s[i] * 0.2; b.rect(M.x[i] - r, M.y[i] - r, r * 2, r * 2); }
          b.fillStyle = rgb(pal[3], 0.85 * vis); b.fill();
        }

        shieldText(b, shield, 0.7);

        // ---- drift growth / melt
        if (snowing) {
          const rate = 0.3 * amt;
          for (let k = 0; k < nL; k++) {
            const L = ledges[k];
            for (let want = rate * dt * L.n / 1.9; want > 0; want -= 1) {
              if (Math.random() >= want) continue;
              const ci = Math.random() * L.n, fill = L.h[ci | 0] / (L.capArr[ci | 0] + 0.01);
              if (Math.random() > fill * fill) depositBump(L, ci, 0.3 + Math.random() * 0.25, 2.5 + Math.random() * 2);
            }
          }
        } else {
          const k = Math.exp(-dt / 6.5);
          for (let j = 0; j < nL; j++) {
            const L = ledges[j], h = L.h; if (L.empty) continue;
            for (let i = 0; i < L.n; i++) { const v = h[i] * k - 0.04 * dt; h[i] = v > 0 ? v : 0; }
            L.dirty = true;
          }
        }
        stripT -= dt;
        if (nL && stripT <= 0) { // relax + redraw one ledge every ~3 frames
          stripT = 0.09; rr = (rr + 1) % nL; const L = ledges[rr];
          if (L.dirty || (palMoving && !L.empty)) { relax(L, 4); drawStrip(L, atlas, pal); }
        }

        // ---- clumps slide off full pane ends and burst into powder
        for (let k = 0; k < nL; k++) {
          const L = ledges[k];
          if ((L.slideT -= dt) > 0) continue;
          L.slideT = 6 + Math.random() * 12;
          if (!snowing) continue;
          const right = Math.random() < 0.5, w = 16;
          let mass = 0;
          for (let j = 0; j < w; j++) {
            const i = right ? L.n - 1 - j : j;
            const take = L.h[i] * 0.75 * (1 - j / w);
            L.h[i] -= take; mass += take;
          }
          if (mass < 14) continue;
          L.dirty = true;
          const c = clumps.find((q) => !q.on); if (!c) continue;
          c.on = 1; c.x = right ? L.x0 + L.n - 3 : L.x0 + 3; c.y = L.base - 3;
          c.vx = (right ? 1 : -1) * (8 + Math.random() * 12); c.vy = 6;
          c.stop = 26 + Math.random() * 46; c.y0 = c.y; c.r = clamp(mass / 18, 1.4, 2.4);
        }
        const fa = clamp(amt * 1.2 + 0.2, 0, 1);
        for (const c of clumps) {
          if (!c.on) continue;
          c.vy += 300 * dt; c.x += c.vx * dt; c.y += c.vy * dt;
          f.globalAlpha = fa;
          const s = sprClump.w * c.r * 0.6;
          f.drawImage(sprClump.c, c.x - s / 2, c.y - s / 2, s, s);
          f.drawImage(sprClump.c, c.x - s * 0.1, c.y - s * 0.9, s * 0.6, s * 0.6);
          if (c.y - c.y0 > c.stop) {
            c.on = 0;
            for (let j = 0, m = 0; j < puffs.length && m < 22; j++) {
              const q = puffs[j]; if (q.on) continue; m++;
              const a = Math.random() * 6.283, sp = 12 + Math.random() * 40;
              q.on = 1; q.x = c.x; q.y = c.y; q.vx = Math.cos(a) * sp + c.vx * 0.4; q.vy = Math.sin(a) * sp * 0.6 + c.vy * 0.12;
              q.life = 0; q.max = 0.8 + Math.random() * 0.9; q.r = 0.7 + Math.random() * 1.1;
            }
          }
        }
        for (const q of puffs) {
          if (!q.on) continue;
          q.life += dt; if (q.life > q.max) { q.on = 0; continue; }
          const dk = Math.exp(-dt * 3.2); q.vx = q.vx * dk + wind * 0.03; q.vy = q.vy * dk + 12 * dt;
          q.x += q.vx * dt; q.y += q.vy * dt;
          const u = q.life / q.max;
          f.globalAlpha = 0.7 * (1 - u) * fa;
          const s = sprPuff.w * q.r * (1 + u * 1.6); f.drawImage(sprPuff.c, q.x - s / 2, q.y - s / 2, s, s);
        }

        // ---- drifts (front: they rest on the borders)
        f.globalAlpha = 1;
        if (atlas) f.drawImage(atlas.c, atlas.x, atlas.y, atlas.w, atlas.h);
        // glints on the crest
        const glow = st.light === '*' ? 1 : st.light === '!' ? 0.85 : st.light === ')' ? 0.6 : 0;
        if (glow > 0 && nL) {
          if (Math.random() < dt * 4) {
            const g = glints.find((q) => !q.on);
            const L = ledges[(Math.random() * nL) | 0]; const ci = (Math.random() * L.n) | 0;
            if (g && L.h[ci] > 2.5) { g.on = 1; g.x = L.x0 + ci + 0.5; g.y = L.base - L.h[ci] + 0.8; g.life = 0; }
          }
          f.fillStyle = rgb(pal[2], 1);
          for (const g of glints) {
            if (!g.on) continue; g.life += dt; if (g.life > 0.8) { g.on = 0; continue; }
            const u = Math.sin(Math.PI * g.life / 0.8);
            f.globalAlpha = u * glow;
            f.fillRect(g.x - 0.6, g.y - 0.6, 1.2, 1.2);
            f.globalAlpha = u * glow * 0.4;
            f.fillRect(g.x - 2.5 * u, g.y - 0.25, 5 * u, 0.5); f.fillRect(g.x - 0.25, g.y - 2.5 * u, 0.5, 5 * u);
          }
        } else for (const g of glints) g.on = 0;

        // ---- near layer (front): a few big out-of-focus flakes drifting past
        const sn = sprNear;
        for (let i = 0; i < NN; i++) {
          let y = N.y[i] + N.v[i] * dt;
          let x = N.x[i] + (wind * 1.3 + Math.sin(N.ph[i] + ts * 0.7) * 22) * dt;
          if (y > H + 20) { seed(N, i, true, 90, 140, 1); y = N.y[i]; x = N.x[i]; }
          if (x < -40) x += W + 80; else if (x > W + 40) x -= W + 80;
          N.y[i] = y; N.x[i] = x;
          if (N.a[i] && vis > 0.01) {
            f.globalAlpha = (0.12 + 0.025 * (i % 5)) * vis;
            f.drawImage(sn.c, x - sn.w / 2, y - sn.h / 2, sn.w, sn.h);
          }
        }
        f.globalAlpha = 1;
      },
    });
  }

  // ======================================================= 2. Snöstorm (ANSI)
  {
    // ANSI-ish colours per light: [far, mid, near, drift, driftTop]
    const APAL = {
      '*': [[112, 112, 112], [168, 168, 168], [255, 255, 255], [208, 208, 208], [255, 255, 255]],
      ')': [[74, 88, 116], [136, 156, 196], [222, 232, 255], [170, 186, 216], [232, 240, 255]],
      'o': [[58, 58, 62], [100, 102, 108], [156, 158, 166], [118, 120, 128], [160, 162, 170]],
      '!': [[104, 88, 70], [176, 152, 120], [255, 232, 192], [204, 182, 150], [255, 236, 200]],
    };
    const NF = 210, GCH = ['.', '·', '+', '*', '-', '~', '='];
    const GLY = [[0, 0, 1], [1, 2, 1], [3, 3, 2]], GUST = [[0, 0, 0], [4, 4, 1], [5, 5, 4]];
    let ledgeY0 = 0, ledgeY1 = 0, P, occ, cols, rows, gx0, gy0, cw, ch, ledges, apal, amt, wind, gust, spray, meltT, depT, glyphs;

    // Rasterise each glyph once in the stage font and keep it as device-pixel
    // runs (strong + faint coverage). Drawing a glyph is then a few path rects,
    // far cheaper than fillText/drawImage per flake.
    function buildGlyphs(env) {
      const d = env.dpr, W = Math.ceil(cw * d), H = Math.ceil(ch * d);
      const k = document.createElement('canvas'); k.width = W; k.height = H;
      const g = k.getContext('2d', { willReadFrequently: true });
      glyphs = GCH.map((c) => {
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H); g.setTransform(d, 0, 0, d, 0, 0);
        g.font = env.cell.font; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(c, 0, ch / 2);
        const px = g.getImageData(0, 0, W, H).data, strong = [], weak = [];
        for (let y = 0; y < H; y++) for (const [lo, hi, arr] of [[150, 256, strong], [50, 150, weak]]) {
          let run = -1;
          for (let x = 0; x <= W; x++) {
            const a = x < W ? px[(y * W + x) * 4 + 3] : 0, on = a >= lo && a < hi;
            if (on && run < 0) run = x;
            else if (!on && run >= 0) { arr.push(run / d, y / d, (x - run) / d, 1 / d); run = -1; }
          }
        }
        return [new Float32Array(mergeRuns(strong)), new Float32Array(mergeRuns(weak))];
      });
    }
    // Merge runs with identical x/width on consecutive rows into taller rects.
    function mergeRuns(a) {
      const out = [];
      for (let i = 0; i < a.length; i += 4) {
        let j = out.length - 4, merged = false;
        for (; j >= 0; j -= 4) {
          if (out[j] === a[i] && out[j + 2] === a[i + 2] && Math.abs(out[j + 1] + out[j + 3] - a[i + 1]) < 1e-6) { out[j + 3] += a[i + 3]; merged = true; break; }
        }
        if (!merged) out.push(a[i], a[i + 1], a[i + 2], a[i + 3]);
      }
      return out;
    }
    function addGlyph(ctx, gi, lvl, x, y) {
      const R = glyphs[gi][lvl];
      for (let j = 0; j < R.length; j += 4) ctx.rect(x + R[j], y + R[j + 1], R[j + 2], R[j + 3]);
    }
    const col = [];

    function makeAPal(light) { return (APAL[light] || APAL['*']).map((c) => c.slice()); }
    function stepAPal(k, light) {
      const tgt = APAL[light] || APAL['*'];
      for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) apal[i][j] += (tgt[i][j] - apal[i][j]) * k;
      for (let i = 0; i < 5; i++) col[i] = `rgb(${apal[i][0] | 0},${apal[i][1] | 0},${apal[i][2] | 0})`;
    }
    function seedA(env, i, top) {
      const d = Math.random(); const depth = d < 0.45 ? 0 : d < 0.8 ? 1 : 2;
      P.d[i] = depth;
      P.x[i] = top ? Math.random() * (env.W * 1.3) - env.W * 0.3 : Math.random() * env.W;
      P.y[i] = top ? -ch * (1 + Math.random() * 3) : Math.random() * env.H;
      P.v[i] = (depth === 0 ? 26 : depth === 1 ? 46 : 78) * (0.8 + Math.random() * 0.4);
      P.g[i] = (Math.random() * 3) | 0;
      P.a[i] = Math.random() < amt ? 1 : 0;
    }
    function cellOf(x, y) {
      const c = Math.floor((x - gx0) / cw), r = Math.floor((y - gy0) / ch);
      if (c < 0 || r < 0 || c >= cols || r >= rows) return -1;
      return r * cols + c;
    }
    function markRect(x0, y0, x1, y1, v) {
      const c0 = Math.max(0, Math.floor((x0 - gx0) / cw)), c1 = Math.min(cols - 1, Math.floor((x1 - gx0 - 0.01) / cw));
      const r0 = Math.max(0, Math.floor((y0 - gy0) / ch)), r1 = Math.min(rows - 1, Math.floor((y1 - gy0 - 0.01) / ch));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) occ[r * cols + c] = v;
    }

    WX.register({
      id: 'snow-ansi', title: 'Snöstorm', family: FAMILY, fps: 30,
      note: 'Teckensnö i terminalens rutnät som aldrig ritas över text, med vindbyar som sveper fram och blåser snön av panelkanterna där den byggs upp med blocktecken ▁▂▃▄.',
      preset: { weather: '*', fog: '', light: '*' },
      init(env) {
        amt = env.state.weather === '*' ? 1 : 0;
        apal = makeAPal(env.state.light); stepAPal(1, env.state.light);
        P = { x: new Float32Array(NF), y: new Float32Array(NF), v: new Float32Array(NF), d: new Uint8Array(NF), g: new Uint8Array(NF), a: new Uint8Array(NF),
          cell: new Int32Array(NF), gl: new Uint8Array(NF) };
        spray = []; for (let i = 0; i < 60; i++) spray.push({ on: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, ch: 1, k: 1, len: 1 });
        gust = { on: 0, x: 0, dir: 1, str: 0, wait: 3 + Math.random() * 3 };
        wind = 0; meltT = 0; depT = 0; ledges = null;
      },
      resize(env) {
        cw = env.cell.w; ch = env.cell.h; buildGlyphs(env);
        gx0 = ((env.out.x + 2) % cw + cw) % cw - cw;
        const l0 = env.lines[0];
        gy0 = l0 ? ((l0.y - (ch - l0.h) / 2) % ch + ch) % ch - ch : 0;
        cols = Math.ceil((env.W - gx0) / cw) + 1; rows = Math.ceil((env.H - gy0) / ch) + 1;
        occ = new Uint8Array(cols * rows);
        for (const l of env.lines) markRect(l.x, l.y + 2, l.x + l.w, l.y + l.h - 2, 1);
        let lowest = 0;
        for (const p of env.panes) {
          const b = p.border;
          markRect(p.x, p.y, p.x + p.w, p.y + b, 2); markRect(p.x, p.y + p.h - b, p.x + p.w, p.y + p.h, 2);
          markRect(p.x, p.y, p.x + b, p.y + p.h, 2); markRect(p.x + p.w - b, p.y, p.x + p.w, p.y + p.h, 2);
          const tb = titleBox(env, p); markRect(tb.x0, tb.y0, tb.x1, tb.y1, 2);
          if (p.name === 'Map') markRect(p.x, p.y, p.x + p.w, p.y + p.h, 2);
          lowest = Math.max(lowest, p.y + p.h);
        }
        markRect(env.out.x + env.out.w, lowest + 2, env.W, env.H, 2); // status lines
        // ledges in cell columns
        const old = ledges; ledges = [];
        for (const p of env.panes) {
          const c0 = Math.ceil((p.x - gx0) / cw), c1 = Math.floor((p.x + p.w - gx0) / cw) - 1;
          if (c1 < c0) continue;
          const n = c1 - c0 + 1, sink = p.border * 0.5;
          const maxL = clamp(Math.floor((headroom(env, p) - 1 + sink) / (ch / 8)), 1, 5);
          const cap = new Uint8Array(n), tb = titleBox(env, p);
          for (let i = 0; i < n; i++) {
            const x = gx0 + (c0 + i) * cw;
            const e = Math.min(i, n - 1 - i);
            cap[i] = e === 0 ? Math.max(1, maxL - 2) : e === 1 ? Math.max(1, maxL - 1) : maxL;
            if (e > 1) cap[i] = Math.max(1, maxL - Math.floor(env.noise(x * 0.045, p.y * 0.1) * 2.6));
            if (x + cw > tb.x0 && x < tb.x1) cap[i] = 0;
          }
          const L = { p, c0, n, base: p.y + sink, cap, lv: new Uint8Array(n) };
          const o = old && old.find((q) => q.p.id === p.id);
          if (o) for (let i = 0; i < n && i < o.n; i++) L.lv[i] = Math.min(o.lv[i], cap[i]);
          ledges.push(L);
        }
        ledgeY0 = 1e9; ledgeY1 = -1e9;
        for (const L of ledges) { ledgeY0 = Math.min(ledgeY0, L.base - ch); ledgeY1 = Math.max(ledgeY1, L.base + 1); }
        for (let i = 0; i < NF; i++) seedA(env, i, false);
      },
      frame(env, dt, t) {
        const W = env.W, H = env.H, b = env.back, f = env.front, st = env.state;
        const snowing = st.weather === '*';
        amt += ((snowing ? 1 : 0) - amt) * Math.min(1, dt / 3);
        stepAPal(Math.min(1, dt / 2.5), st.light);
        const ts = t / 1000;
        wind = 34 + (env.noise(ts * 0.1, 7.7) - 0.5) * 70;

        // ---- gusts: a front that sweeps across the stage
        const G = gust;
        if (!G.on) {
          G.wait -= dt;
          if (G.wait <= 0 && amt > 0.5) { G.on = 1; G.dir = wind >= 0 ? 1 : -1; G.x = G.dir > 0 ? -300 : W + 300; G.str = 0.7 + Math.random() * 0.5; }
        } else {
          G.x += G.dir * 620 * dt;
          if (G.x > W + 400 || G.x < -400) { G.on = 0; G.wait = 7 + Math.random() * 10; }
        }
        const gustAt = (x) => {
          if (!G.on) return 0;
          const d = (x - G.x) * G.dir; // behind the front is negative
          if (d > 80 || d < -520) return 0;
          return G.str * (d > 0 ? 1 - d / 80 : 1 + d / 520);
        };

        // ---- flakes
        const fogDim = st.fog === '=' ? 0.5 : 1;
        const nL = ledges.length;
        for (let i = 0; i < NF; i++) {
            const pass = P.d[i];
            P.cell[i] = -1;
            const y0 = P.y[i], gs = gustAt(P.x[i]);
            const fac = pass === 0 ? 0.5 : pass === 1 ? 0.8 : 1.2;
            let x = P.x[i] + (wind + gs * 240) * fac * dt;
            let y = y0 + P.v[i] * (1 - gs * 0.5) * dt;
            if (pass > 0 && P.a[i] && snowing && y >= ledgeY0 && y0 <= ledgeY1) {
              for (let k = 0; k < nL; k++) {
                const L = ledges[k], ci = Math.floor((x - gx0) / cw) - L.c0;
                if (ci < 0 || ci >= L.n || L.lv[ci] >= L.cap[ci]) continue;
                const sy = L.base - L.lv[ci] * ch / 8;
                if (y0 < sy && y >= sy) { if (Math.random() < 0.6) L.lv[ci]++; y = H + 99; break; }
              }
            }
            if (y > H + ch) { seedA(env, i, true); continue; }
            if (x > W + cw * 2) x -= W + cw * 4; else if (x < -cw * 2) x += W + cw * 4;
            P.x[i] = x; P.y[i] = y;
            if (!P.a[i]) continue;
            const cell = cellOf(x, y);
            if (cell < 0 || occ[cell]) continue;
            P.cell[i] = cell; P.gl[i] = gs > 0.55 ? GUST[pass][P.g[i]] : GLY[pass][P.g[i]];
        }
        for (let pass = 0; pass < 3; pass++) for (let lvl = 0; lvl < (pass ? 2 : 1); lvl++) {
          b.beginPath();
          for (let i = 0; i < NF; i++) {
            const cell = P.cell[i]; if (cell < 0 || P.d[i] !== pass) continue;
            addGlyph(b, P.gl[i], lvl, gx0 + (cell % cols) * cw, gy0 + ((cell / cols) | 0) * ch);
          }
          b.fillStyle = col[pass]; b.globalAlpha = (pass === 0 ? fogDim : 1) * (lvl ? 0.5 : 1); b.fill();
        }
        b.globalAlpha = 1;

        // ---- ledges: background deposition, settling, gust erosion, melt
        depT -= dt;
        const doDep = depT <= 0; if (doDep) depT = 0.25;
        meltT -= dt;
        const doMelt = !snowing && meltT <= 0; if (doMelt) meltT = 0.6;
        for (let k = 0; k < nL; k++) {
          const L = ledges[k], lv = L.lv, cap = L.cap, n = L.n;
          if (doDep && snowing) for (let j = 0; j < 4; j++) { const i = (Math.random() * n) | 0; if (lv[i] < cap[i] && Math.random() < 0.7) lv[i]++; }
          if (doMelt) for (let i = 0; i < n; i++) if (lv[i] && Math.random() < 0.3) lv[i]--;
          // sandpile: never more than 2 eighths between neighbours
          for (let i = 0; i < n - 1; i++) {
            if (lv[i] > lv[i + 1] + 2 && lv[i + 1] < cap[i + 1]) { lv[i]--; lv[i + 1]++; }
            else if (lv[i + 1] > lv[i] + 2 && lv[i] < cap[i]) { lv[i + 1]--; lv[i]++; }
          }
          // the gust front strips snow off the ledge as spray
          if (G.on) {
            const ci = Math.floor((G.x - gx0) / cw) - L.c0;
            if (ci >= 0 && ci < n && lv[ci] > 1 && Math.random() < 0.55 * G.str) {
              lv[ci]--;
              for (let m = 0; m < 2; m++) {
                const s = spray.find((q) => !q.on); if (!s) break;
                s.on = 1; s.x = gx0 + (L.c0 + ci) * cw; s.y = L.base - lv[ci] * ch / 8 - 2;
                s.vx = G.dir * (180 + Math.random() * 200); s.vy = -30 - Math.random() * 50;
                s.life = 0; s.max = 0.5 + Math.random() * 0.6; s.ch = Math.random() < 0.5 ? 1 : 0; s.k = 2;
              }
            }
          }
        }
        // wind made visible: faint wisps riding the gust
        if (G.on && Math.random() < 0.55) {
          const s = spray.find((q) => !q.on);
          if (s) {
            s.on = 1; s.x = G.x - G.dir * Math.random() * 360; s.y = Math.random() * (env.protect.fadeTop - 20);
            s.vx = G.dir * (380 + Math.random() * 200); s.vy = (Math.random() - 0.5) * 16;
            s.life = 0; s.max = 0.5 + Math.random() * 0.5; s.ch = Math.random() < 0.5 ? 5 : 4; s.k = 0;
            s.len = 3 + ((Math.random() * 5) | 0);
          }
        }

        // ---- spray + wisps (back layer, cell-snapped)
        for (const s of spray) {
          if (!s.on) continue;
          s.life += dt; if (s.life > s.max) { s.on = 0; continue; }
          s.vy += (s.k === 2 ? 90 : 0) * dt; s.x += s.vx * dt; s.y += s.vy * dt;
          const cell = cellOf(s.x, s.y); if (cell < 0 || occ[cell] === 1) continue;
          const u = s.life / s.max, cx = gx0 + (cell % cols) * cw, cy = gy0 + ((cell / cols) | 0) * ch;
          b.fillStyle = col[s.k];
          if (s.k === 0) { // a wisp: a short run of ~ or - trailing behind its head
            const r0 = (cell / cols) | 0;
            b.globalAlpha = Math.sin(Math.PI * u) * 0.8; b.beginPath();
            for (let j = 0; j < s.len; j++) {
              const c = (cell % cols) - j * G.dir;
              if (c < 0 || c >= cols || occ[r0 * cols + c] === 1) continue;
              addGlyph(b, s.ch, 0, gx0 + c * cw, cy);
            }
            b.fill();
          } else {
            b.globalAlpha = u > 0.6 ? 0.55 : 1;
            b.beginPath(); addGlyph(b, s.ch, 0, cx, cy); b.fill();
          }
        }
        b.globalAlpha = 1;

        // ---- settled snow as eighth blocks (front: it sits on the border)
        const e8 = ch / 8;
        f.fillStyle = col[3];
        f.beginPath();
        for (let k = 0; k < nL; k++) {
          const L = ledges[k];
          for (let i = 0; i < L.n; i++) if (L.lv[i]) { const hh = L.lv[i] * e8; f.rect(gx0 + (L.c0 + i) * cw, L.base - hh, cw, hh); }
        }
        f.fill();
        f.fillStyle = col[4];
        f.beginPath();
        for (let k = 0; k < nL; k++) {
          const L = ledges[k];
          for (let i = 0; i < L.n; i++) if (L.lv[i]) f.rect(gx0 + (L.c0 + i) * cw, L.base - L.lv[i] * e8, cw, 1);
        }
        f.fill();
      },
    });
  }

  // ======================================================= 3. Frost
  {
    const FCOL = { ')': [214, 230, 255], 'o': [160, 178, 206], '*': [230, 238, 250], '!': [240, 226, 210] };
    let frost, sites, tips, rrT, stateF, meltP, alphaF, tiles, amt, glints, ends, pal, wind;
    const GW = [0.9, 0.7, 0.55], GA = [0.5, 0.42, 0.3];
    let rrI = 0, titles = [];

    function wantFrost(st) { return st.weather === '*' && (st.light === 'o' || st.light === ')'); }

    // A site is a corner (sx, sy = inward signs) or a stretch of top edge
    // (sy only). Fronds root along the edges, leaning away from the corner.
    function addCorner(cx, cy, sx, sy, R, n) {
      const S = { cx, cy, R, started: 0, roots: [] };
      const diag = Math.atan2(sy, sx);
      S.roots.push({ x: cx + sx * 2, y: cy + sy * 2, ang: diag + (Math.random() - 0.5) * 0.2, len: R * (0.85 + Math.random() * 0.15) });
      for (let i = 0; i < n; i++) {
        const d = R * 0.75 * Math.pow(Math.random(), 1.3) + 3, tilt = 0.12 + Math.random() * 0.6;
        const len = R * (1 - (d / R) * 0.7) * (0.45 + Math.random() * 0.5);
        if (i % 2) S.roots.push({ x: cx + sx * d, y: cy + sy * 1.5, ang: Math.atan2(sy * Math.cos(tilt), sx * Math.sin(tilt)), len });
        else S.roots.push({ x: cx + sx * 1.5, y: cy + sy * d, ang: Math.atan2(sy * Math.sin(tilt), sx * Math.cos(tilt)), len });
      }
      sites.push(S);
    }
    function addEdge(x0, x1, y, R, n) {
      const S = { cx: (x0 + x1) / 2, cy: y, R: Math.max(R, (x1 - x0) / 2), started: 0, roots: [] };
      for (let i = 0; i < n; i++) {
        const u = Math.random(), x = x0 + (x1 - x0) * u, mid = 1 - Math.abs(u * 2 - 1);
        const sx = Math.random() < 0.5 ? 1 : -1, tilt = Math.random() * 0.7;
        S.roots.push({ x, y: y + 1, ang: Math.atan2(Math.cos(tilt), sx * Math.sin(tilt)), len: R * (0.35 + mid * 0.65) * (0.6 + Math.random() * 0.4) });
      }
      sites.push(S);
    }
    function buildSites(env) {
      sites = []; tips = []; ends = []; rrI = 0;
      titles = env.panes.map((p) => titleBox(env, p));
      for (const p of env.panes) {
        if (p.name === 'Map') continue;
        const b = p.border, x0 = p.x + b, y0 = p.y + b, x1 = p.x + p.w - b, y1 = p.y + p.h - b;
        const R = clamp(Math.min(p.w, p.h) * 0.36, 45, 100);
        addCorner(x0, y0, 1, 1, R, 7);
        addCorner(x1, y0, -1, 1, R * 0.8, 5);
        if (y1 < env.protect.fadeTop - 10) { addCorner(x0, y1, 1, -1, R * 0.75, 5); addCorner(x1, y1, -1, -1, R * 0.95, 7); }
      }
      // along the top edge of the output area, where there is no text
      const mapL = Math.min(...env.panes.map((p) => p.x));
      for (let x = env.protect.left + 40; x < mapL - 80; x += 170) addEdge(x, Math.min(x + 150, mapL - 30), 0, 70 + Math.random() * 35, 6);
      for (const S of sites) S.order = Math.random();
    }
    function startSite(S) {
      S.started = 1;
      for (const r of S.roots) tips.push(stem(r.x, r.y, r.ang, r.len));
    }
    function stem(x, y, ang, len) {
      return { x, y, ang, left: len, len, gen: 0, next: 2 + Math.random() * 2, fork: 10 + Math.random() * 14,
        side: Math.random() < 0.5 ? 1 : -1, curl: (Math.random() - 0.5) * 0.03 };
    }
    function barb(x, y, ang, len, gen) {
      return { x, y, ang, left: len, len, gen, next: 1.6 + Math.random() * 1.5, fork: 1e9,
        side: Math.random() < 0.5 ? 1 : -1, curl: 0 };
    }
    // One growth step for a tip: advance, then sprout barbs (60°, ice-like) and forks.
    function growTip(T, paths) {
      const step = T.gen === 0 ? 1.5 : 1.2;
      const nx = T.x + Math.cos(T.ang) * step, ny = T.y + Math.sin(T.ang) * step;
      paths[T.gen].push(T.x, T.y, nx, ny);
      T.x = nx; T.y = ny; T.left -= step;
      if (T.gen === 0) T.ang += T.curl + (Math.random() - 0.5) * 0.05;
      if (T.gen === 0) {
        if ((T.fork -= step) <= 0 && T.left > 14) {
          T.fork = 12 + Math.random() * 18;
          if (Math.random() < 0.55) tips.push(stem(T.x, T.y, T.ang + (Math.random() < 0.5 ? 1 : -1) * (0.45 + Math.random() * 0.3), T.left * (0.55 + Math.random() * 0.25)));
        }
        if ((T.next -= step) <= 0) {
          T.next = 2.2 + Math.random() * 1.4;
          const len = (2.5 + T.left * 0.3) * (0.5 + Math.random() * 0.5);
          tips.push(barb(T.x, T.y, T.ang + T.side * 1.0472, len, 1));
          if (Math.random() < 0.6) tips.push(barb(T.x, T.y, T.ang - T.side * 1.0472, len * (0.7 + Math.random() * 0.3), 1));
          T.side = -T.side;
        }
      } else if (T.gen === 1 && T.len > 6) {
        if ((T.next -= step) <= 0) {
          T.next = 2.2 + Math.random() * 1.6;
          tips.push(barb(T.x, T.y, T.ang + T.side * 1.0472, (1.2 + T.left * 0.3) * (0.6 + Math.random() * 0.5), 2));
          T.side = -T.side;
        }
      }
      if (T.left <= 0 && T.gen === 0 && ends.length < 400) ends.push(T.x, T.y);
    }

    WX.register({
      id: 'snow-frost', title: 'Frost', family: FAMILY, fps: 30,
      note: 'När det snöar i mörker eller månsken växer iskristaller långsamt ut från panelernas hörn och längs skärmens överkant; tänd facklan eller låt solen gå upp så drar frosten sig tillbaka.',
      preset: { weather: '*', fog: '', light: ')' },
      init(env) {
        amt = env.state.weather === '*' ? 1 : 0;
        stateF = 'idle'; meltP = 0; alphaF = 0; rrT = 0; wind = 0; frost = null;
        pal = (FCOL[env.state.light] || FCOL[')']).slice();
        glints = []; for (let i = 0; i < 6; i++) glints.push({ on: 0, x: 0, y: 0, life: 0 });
      },
      resize(env) {
        frost = makeCanvas(env.W, env.H, env.dpr);
        tiles = makeTiles(env, [200, 212, 232]);
        buildSites(env); stateF = 'idle'; meltP = 0;
      },
      frame(env, dt, t) {
        const st = env.state, f = env.front, b = env.back;
        amt += ((st.weather === '*' ? 1 : 0) - amt) * Math.min(1, dt / 3);
        wind = (env.noise(t / 1000 * 0.08, 9.1) - 0.5) * 50 + 6;
        const dark = st.light === 'o' ? 0.6 : st.light === ')' ? 0.85 : 1;
        drawTiles(b, tiles, env, dt, wind, amt * dark * 0.85);
        const want = wantFrost(st);

        if (stateF === 'idle' && want) { stateF = 'grow'; pal = (FCOL[st.light] || FCOL[')']).slice(); }
        if (stateF === 'grow' && !want) { stateF = 'melt'; meltP = 0; }
        alphaF += ((stateF === 'grow' ? 1 : stateF === 'melt' ? 1 - meltP * meltP : 0) - alphaF) * Math.min(1, dt / 2);

        if (stateF === 'grow') {
          // wake sites gradually so growth ripples across the screen
          rrT += dt;
          for (const S of sites) if (!S.started && S.order < rrT / 4) startSite(S);
          const g = frost.g, BUDGET = 240;
          let steps = 0, scanned = 0;
          const paths = [[], [], []];
          while (steps < BUDGET && scanned < tips.length) {
            if (rrI >= tips.length) rrI = 0;
            const T = tips[rrI++]; scanned++;
            if (T.left <= 0) continue;
            growTip(T, paths); steps++;
            if (T.gen > 0 && T.left > 0 && steps < BUDGET) { growTip(T, paths); steps++; }
          }
          if (steps) {
            g.lineCap = 'round';
            for (let k = 0; k < 3; k++) {
              const P = paths[k]; if (!P.length) continue;
              g.beginPath();
              for (let j = 0; j < P.length; j += 4) { g.moveTo(P[j], P[j + 1]); g.lineTo(P[j + 2], P[j + 3]); }
              if (k === 0) { g.strokeStyle = rgb(pal, 0.04); g.lineWidth = 2.6; g.stroke(); }
              g.strokeStyle = rgb(pal, GA[k]); g.lineWidth = GW[k]; g.stroke();
            }
            for (const tb of titles) g.clearRect(tb.x0 - 2, tb.y0, tb.x1 - tb.x0 + 4, tb.y1 - tb.y0);
          }
          // drop finished tips now and then
          if (tips.length > 400 && Math.random() < 0.03) { tips = tips.filter((q) => q.left > 0); rrI = 0; }
        } else if (stateF === 'melt') {
          meltP = Math.min(1, meltP + dt / 9);
          const g = frost.g;
          // retreat toward the corners: erase one site per frame (round robin)
          const S = sites[rrI++ % sites.length];
          if (S && S.started) {
            const r = S.R * 1.1 * (1 - meltP);
            const gr = g.createRadialGradient(S.cx, S.cy, Math.max(0, r - 6), S.cx, S.cy, r + 16);
            gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.8)');
            g.save(); g.globalCompositeOperation = 'destination-out';
            g.fillStyle = gr; g.fillRect(S.cx - S.R * 1.3, S.cy - S.R * 1.3, S.R * 2.6, S.R * 2.6);
            g.restore();
          }
          if (meltP >= 1) {
            frost.g.clearRect(0, 0, frost.w, frost.h);
            buildSites(env); stateF = 'idle'; rrT = 0;
          }
        }

        if (alphaF > 0.01 && stateF !== 'idle') {
          f.globalAlpha = alphaF * (st.light === 'o' ? 0.8 : 1);
          f.drawImage(frost.c, 0, 0, frost.w, frost.h);
          // moonlight catching the crystal tips
          if (st.light === ')' && stateF === 'grow' && ends.length) {
            if (Math.random() < dt * 3) {
              const gl = glints.find((q) => !q.on), j = ((Math.random() * ends.length / 2) | 0) * 2;
              if (gl) { gl.on = 1; gl.x = ends[j]; gl.y = ends[j + 1]; gl.life = 0; }
            }
            f.fillStyle = '#eef4ff';
            for (const gl of glints) {
              if (!gl.on) continue; gl.life += dt; if (gl.life > 1) { gl.on = 0; continue; }
              const u = Math.sin(Math.PI * gl.life);
              f.globalAlpha = u * 0.9; f.fillRect(gl.x - 0.6, gl.y - 0.6, 1.2, 1.2);
              f.globalAlpha = u * 0.35; f.fillRect(gl.x - 3 * u, gl.y - 0.25, 6 * u, 0.5); f.fillRect(gl.x - 0.25, gl.y - 3 * u, 0.5, 6 * u);
            }
          }
          f.globalAlpha = 1;
        }
      },
    });
  }
})();
