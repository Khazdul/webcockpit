// Rain family: "Regnruta" (rain on the glass), "Takdropp" (rain on the pane
// ledges, eaves dripping) and "Teckenregn" (cell-aligned glyph rain).
(() => {
  // ------------------------------------------------------------------ shared
  const LIGHTS = {
    '*': [178, 196, 216, 1.0],   // daylight: neutral steel grey
    ')': [150, 186, 240, 0.92],  // moon: cool silver blue
    'o': [104, 124, 156, 0.62],  // darkness: dim
    '!': [240, 178, 112, 0.9],   // torch: warm highlights
  };
  const VIS = { '': 1, '-': 0.7, '=': 0.42 };
  const TAU = Math.PI * 2;

  function mkS() {
    return { rain: 0, heavy: 0, vis: 1, r: 178, g: 196, b: 216, lum: 1, flash: 0, wind: 0, t: 0 };
  }
  function targets(env) {
    const w = env.state.weather;
    return [(w === "'" || w === '"') ? 1 : 0, w === '"' ? 1 : 0];
  }
  function snapS(s, env) {
    const [tr, th] = targets(env); s.rain = tr; s.heavy = th;
    const L = LIGHTS[env.state.light] || LIGHTS['*'];
    s.r = L[0]; s.g = L[1]; s.b = L[2]; s.lum = L[3];
    s.vis = VIS[env.state.fog] ?? 1;
  }
  function stepS(s, env, dt) {
    const [tr, th] = targets(env);
    const k = 1 - Math.exp(-dt / 1.5);
    s.rain += (tr - s.rain) * k; s.heavy += (th - s.heavy) * k;
    const L = LIGHTS[env.state.light] || LIGHTS['*'];
    const kl = 1 - Math.exp(-dt / 1.1);
    s.r += (L[0] - s.r) * kl; s.g += (L[1] - s.g) * kl; s.b += (L[2] - s.b) * kl; s.lum += (L[3] - s.lum) * kl;
    s.vis += ((VIS[env.state.fog] ?? 1) - s.vis) * kl;
    s.flash = Math.max(0, s.flash - dt * 2.6);
    s.t += dt;
    // gusts only matter in heavy rain
    const g = env.noise(s.t * 0.32, 3.7);
    const gust = Math.max(0, g - 0.42) * 2.4;
    s.wind = 0.025 + s.heavy * (0.1 + gust * 0.42);
  }
  const rgba = (s, a, lift) => {
    const l = lift || 0;
    return `rgba(${(s.r + (255 - s.r) * l) | 0},${(s.g + (255 - s.g) * l) | 0},${(s.b + (255 - s.b) * l) | 0},${a.toFixed(3)})`;
  };
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };

  // A water drop seen on dark glass: faint lens body, bright refracted
  // crescent at the bottom, specular glint top-left. Rendered at three sizes
  // so small drops are not aliased by a large downscale.
  function dropSprite(S, rgb) {
    const c = canvas(S, S), x = c.getContext('2d'), R = S * 0.41, h = S / 2;
    const [r, g, b] = rgb;
    const lr = (r + 255) >> 1, lg = (g + 255) >> 1, lb = (b + 255) >> 1;
    x.translate(h, h);
    let gr = x.createRadialGradient(0, R * 0.2, R * 0.1, 0, 0, R);
    gr.addColorStop(0, `rgba(${r},${g},${b},0.02)`);
    gr.addColorStop(0.7, `rgba(${r},${g},${b},0.07)`);
    gr.addColorStop(0.93, `rgba(${r},${g},${b},0.26)`);
    gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = gr; x.beginPath(); x.arc(0, 0, R, 0, TAU); x.fill();
    // crescent on its own layer
    const t = canvas(S, S), y = t.getContext('2d'); y.translate(h, h);
    gr = y.createLinearGradient(0, -R, 0, R);
    gr.addColorStop(0, `rgba(${lr},${lg},${lb},0)`);
    gr.addColorStop(0.5, `rgba(${lr},${lg},${lb},0.05)`);
    gr.addColorStop(1, `rgba(${lr},${lg},${lb},0.85)`);
    y.fillStyle = gr; y.beginPath(); y.arc(0, 0, R * 0.92, 0, TAU); y.fill();
    y.globalCompositeOperation = 'destination-out';
    gr = y.createRadialGradient(0, -R * 0.2, R * 0.55, 0, -R * 0.2, R * 0.86);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    y.fillStyle = gr; y.beginPath(); y.arc(0, -R * 0.2, R * 0.9, 0, TAU); y.fill();
    x.drawImage(t, -h, -h);
    // rim
    x.strokeStyle = `rgba(${lr},${lg},${lb},0.1)`; x.lineWidth = Math.max(0.6, S / 40);
    x.beginPath(); x.arc(0, 0, R * 0.97, Math.PI * 1.05, Math.PI * 1.95); x.stroke();
    // specular
    gr = x.createRadialGradient(-R * 0.36, -R * 0.4, 0, -R * 0.36, -R * 0.4, R * 0.3);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.beginPath(); x.arc(-R * 0.36, -R * 0.4, R * 0.3, 0, TAU); x.fill();
    gr = x.createRadialGradient(R * 0.28, R * 0.5, 0, R * 0.28, R * 0.5, R * 0.14);
    gr.addColorStop(0, `rgba(${lr},${lg},${lb},0.5)`); gr.addColorStop(1, `rgba(${lr},${lg},${lb},0)`);
    x.fillStyle = gr; x.beginPath(); x.arc(R * 0.28, R * 0.5, R * 0.14, 0, TAU); x.fill();
    return c;
  }
  function dropSet(rgb) { return [dropSprite(12, rgb), dropSprite(28, rgb), dropSprite(72, rgb)]; }
  // draw a drop of radius r at x,y; stretch > 1 elongates vertically (sliding / hanging)
  function drawDrop(ctx, set, x, y, r, stretch) {
    const spr = r < 2.4 ? set[0] : r < 6 ? set[1] : set[2];
    const s = r / 0.41;  // sprite size giving radius r
    const sh = s * stretch;
    ctx.drawImage(spr, x - s / 2, y - sh / 2 - (sh - s) * 0.25, s, sh);
  }

  // Sprite sets per light key, built lazily, crossfaded on change.
  function tintCache() {
    const m = {};
    return (key) => m[key] || (m[key] = dropSet(LIGHTS[key] || LIGHTS['*']));
  }

  // ------------------------------------------------- far streak field (back)
  // Shared by Regnruta and Takdropp. Three depth layers, one path per layer.
  function Streaks(n) {
    return { n, x: new Float32Array(n), y: new Float32Array(n), v: new Float32Array(n), alive: new Uint8Array(n), hit: null };
  }
  function seedStreaks(P, env, count) {
    for (let i = 0; i < P.n; i++) {
      P.x[i] = Math.random() * env.W; P.y[i] = Math.random() * env.H;
      P.v[i] = 0.85 + Math.random() * 0.3; P.alive[i] = i < count ? 1 : 0;
    }
  }
  // cfg: speeds[3], lens[3], alphas[3], widths[3]; ledge(i, prevY) -> true to recycle
  function drawStreaks(ctx, P, env, s, dt, count, cfg, ledge) {
    const W = env.W, span = env.H + 120, yEnd = env.protect.fadeTop + 30;
    const wind = s.wind;
    for (let L = 0; L < 3; L++) {
      const a = cfg.alphas[L];
      if (a <= 0.003) continue;
      ctx.strokeStyle = rgba(s, a, cfg.lift || 0); ctx.lineWidth = cfg.widths[L];
      ctx.beginPath();
      const sp = cfg.speeds[L], ln = cfg.lens[L];
      for (let i = L; i < P.n; i += 3) {
        if (!P.alive[i]) {
          if (i < count && Math.random() < dt * 2) { P.alive[i] = 1; P.y[i] = -Math.random() * span * 0.5 - 40; P.x[i] = Math.random() * (W + 200) - 100; }
          continue;
        }
        const vy = sp * P.v[i], py = P.y[i];
        P.y[i] = py + vy * dt; P.x[i] += vy * wind * dt;
        let x = P.x[i], y = P.y[i];
        if (y > yEnd || (ledge && ledge(x, py, y))) {
          y = P.y[i] = y - span - Math.random() * 60;
          x = P.x[i] = Math.random() * (W + 300) - 150 - wind * 600;
          if (i >= count) { P.alive[i] = 0; continue; }
        }
        if (x < -20 || x > W + 20 || y < -ln) continue;
        const l = ln * P.v[i];
        ctx.moveTo(x, y); ctx.lineTo(x - wind * l, y - l);
      }
      ctx.stroke();
    }
  }

  // ================================================================ Regnruta
  (() => {
    const N = 150;                   // glass drop pool
    const dx = new Float32Array(N), dy = new Float32Array(N), dr = new Float32Array(N), dv = new Float32Array(N);
    const dst = new Uint8Array(N);   // 0 free, 1 resting, 2 sliding
    const dseed = new Float32Array(N), dage = new Float32Array(N), dacc = new Float32Array(N), dpx = new Float32Array(N), dpy = new Float32Array(N);
    const far = Streaks(300);
    const s = mkS();
    const setFor = tintCache(); let sprites, prevSet = null, curKey = '*', fadeSet = 1;
    // trails left by sliding drops: polylines that fade out
    const TN = 18, TP = 220;
    const tx = new Float32Array(TN * TP), ty = new Float32Array(TN * TP), tn = new Int16Array(TN), tage = new Float32Array(TN), tw = new Float32Array(TN), tlive = new Uint8Array(TN);
    const dtr = new Int8Array(N).fill(-1);
    function trailStart(i) {
      let k = -1, oldest = -1;
      for (let j = 0; j < TN; j++) { if (!tlive[j]) { k = j; break; } if (tlive[j] === 2 && tage[j] > oldest) { oldest = tage[j]; k = j; } }
      if (k < 0) { dtr[i] = -1; return; }
      tlive[k] = 1; tn[k] = 1; tage[k] = 0; tw[k] = dr[i] * 0.85; tx[k * TP] = dx[i]; ty[k * TP] = dy[i] - dr[i] * 0.3; dtr[i] = k;
    }
    function trailEnd(i) { const k = dtr[i]; if (k >= 0 && tlive[k] === 1) tlive[k] = 2; dtr[i] = -1; }
    function trailPush(i) {
      const k = dtr[i]; if (k < 0) return;
      const n = tn[k], lx = tx[k * TP + n - 1], ly = ty[k * TP + n - 1], y = dy[i] - dr[i] * 0.3;
      if ((dx[i] - lx) * (dx[i] - lx) + (y - ly) * (y - ly) < 9) return;
      if (n >= TP) { trailEnd(i); trailStart(i); return; }
      tx[k * TP + n] = dx[i]; ty[k * TP + n] = y; tn[k] = n + 1;
    }
    let grid = null, gw = 0, gh = 0; const GS = 10;
    let spawnAcc = 0;

    function buildGrid(env) {
      gw = Math.ceil(env.W / GS); gh = Math.ceil(env.H / GS);
      grid = new Float32Array(gw * gh);
      const firstLine = env.lines.length ? Math.min(...env.lines.map((l) => l.y)) : env.H;
      const pr = env.protect;
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
        const x = i * GS + GS / 2, y = j * GS + GS / 2;
        let w;
        if (y > pr.fadeTop - 30 || x < pr.left) w = 0;
        else {
          w = 0.3;
          let inPane = false;
          for (const p of env.panes) if (x > p.x && x < p.x + p.w && y > p.y && y < p.y + p.h) { inPane = true; w = p.id === 'pMap' ? 0.45 : 1; }
          if (!inPane) {
            if (y < firstLine - 8) w = 1;
            for (const l of env.lines) if (x > l.x - 6 && x < l.x + l.w + 6 && y > l.y - 3 && y < l.y + l.h + 3) { w = 0.05; break; }
          }
          w *= 1.15 - 0.75 * (y / env.H);
        }
        grid[j * gw + i] = Math.max(0, w);
      }
    }
    function spot(env, out) {
      for (let k = 0; k < 8; k++) {
        const x = Math.random() * env.W, y = Math.random() * env.H;
        const w = grid[((y / GS) | 0) * gw + ((x / GS) | 0)];
        if (Math.random() < w) { out[0] = x; out[1] = y; return true; }
      }
      return false;
    }
    const tmp = [0, 0];
    function place(x, y, r) {
      // merge into a touching resting drop if any
      for (let j = 0; j < N; j++) {
        if (dst[j] === 0) continue;
        const ex = dx[j] - x, ey = dy[j] - y, rr = (dr[j] + r) * 0.85;
        if (ex * ex + ey * ey < rr * rr) {
          const a1 = dr[j] * dr[j], a2 = r * r, A = a1 + a2;
          dx[j] = (dx[j] * a1 + x * a2) / A; dy[j] = (dy[j] * a1 + y * a2) / A; dr[j] = Math.sqrt(A);
          return;
        }
      }
      let f = -1;
      for (let j = 0; j < N; j++) if (dst[j] === 0) { f = j; break; }
      if (f < 0) { f = (Math.random() * N) | 0; if (dst[f] === 2) return; }
      dx[f] = x; dy[f] = y; dr[f] = r; dv[f] = 0; dst[f] = 1; dseed[f] = Math.random() * 100; dage[f] = 0; dacc[f] = 0;
      dpx[f] = x; dpy[f] = y;
    }
    function spawn(env, big) {
      if (!spot(env, tmp)) return;
      const q = Math.random();
      const r = 1 + Math.pow(q, 1.8) * (big ? 6.5 : 4 + s.heavy * 1.2);
      place(tmp[0], tmp[1], r);
      // heavy rain: an impact leaves a little spatter around the drop
      if (!big && Math.random() < s.heavy * 0.45) {
        const n = 2 + ((Math.random() * 3) | 0);
        for (let k = 0; k < n; k++) {
          const a = Math.random() * TAU, d = r + 2 + Math.random() * 7;
          place(tmp[0] + Math.cos(a) * d, tmp[1] + Math.sin(a) * d * 0.8, 0.5 + Math.random() * 0.7);
        }
      }
    }

    function prefill(env) {
      dst.fill(0);
      const n = 60 + 50 * s.heavy;
      for (let i = 0; i < n * s.rain; i++) spawn(env, Math.random() < 0.35);
      tlive.fill(0); dtr.fill(-1);
    }

    WX.register({
      id: 'rain-glass', title: 'Regnruta', family: 'Regn', fps: 30,
      note: 'Regn på skärmens glas: droppar pärlar sig, slås ihop och rinner ibland ner med ett blankt spår, med tunna regnstrimmor långt bak; prova regn mot ösregn, och måne eller fackla för droppens ljus.',
      preset: { weather: "'", fog: '', light: ')' },
      init(env) {
        snapS(s, env); curKey = env.state.light; sprites = setFor(curKey); prevSet = null;
        seedStreaks(far, env, Math.round(s.rain * (70 + 200 * s.heavy)));
      },
      resize(env) {
        buildGrid(env);
        prefill(env);
      },
      onState(env, key, v) {
        if (key === 'light' && v !== curKey) { prevSet = sprites; curKey = v; sprites = setFor(v); fadeSet = 0; }
      },
      onEvent(env, name) { if (name === 'strike') s.flash = 1; },
      frame(env, dt) {
        stepS(s, env, dt);
        const rain = s.rain, heavy = s.heavy;
        fadeSet = Math.min(1, fadeSet + dt / 1.4);

        // ---- far streaks, behind everything
        const cnt = Math.round(rain * (70 + 200 * heavy));
        const v = s.vis * (0.55 + 0.45 * s.lum) * (1 + s.flash * 1.5);
        drawStreaks(env.back, far, env, s, dt, cnt, {
          speeds: [520 + 300 * heavy, 760 + 400 * heavy, 1000 + 520 * heavy],
          lens: [7 + 10 * heavy, 11 + 16 * heavy, 16 + 26 * heavy],
          alphas: [0.07 * v, 0.1 * v, 0.14 * v * (0.6 + 0.4 * s.vis)],
          widths: [0.6, 0.8, 1],
        }, null);

        // ---- glass drops
        spawnAcc += dt * rain * (2.2 + 9 * heavy);
        while (spawnAcc > 1) { spawnAcc -= 1; spawn(env, false); }
        const slideR = 6.6 - 1.6 * heavy;
        let sliding = 0; for (let i = 0; i < N; i++) if (dst[i] === 2) sliding++;
        const maxSlide = 1 + Math.round(5 * heavy);
        const fadeTop = env.protect.fadeTop;
        const dry = (1 - rain) * 0.09;
        for (let i = 0; i < N; i++) {
          const st = dst[i]; if (!st) continue;
          dage[i] += dt;
          if (dry > 0) { dr[i] -= dry * dt * (0.6 + (dseed[i] % 1)); if (dr[i] < 0.45) { dst[i] = 0; trailEnd(i); continue; } }
          if (st === 1) {
            if (dr[i] > slideR && sliding < maxSlide && Math.random() < dt * (0.5 + heavy)) { sliding++; dst[i] = 2; dv[i] = 10; trailStart(i); }
            continue;
          }
          // sliding: stick-slip motion
          const go = env.noise(dage[i] * 2.3, dseed[i]) > 0.38 ? 1 : 0.06;
          const target = (34 + dr[i] * 16) * go * (0.8 + 0.4 * heavy);
          dv[i] += (target - dv[i]) * Math.min(1, dt * 6);
          const ox = dx[i], oy = dy[i];
          dy[i] += dv[i] * dt;
          dx[i] += (env.noise(dy[i] * 0.09, dseed[i] + 9) - 0.5) * dv[i] * dt * 0.55 + s.wind * 6 * dt;
          trailPush(i);
          dacc[i] += dy[i] - oy;
          if (dacc[i] > 6) {
            dacc[i] = 0;
            if (Math.random() < 0.45 && dr[i] > 2.4) {
              const tr = 0.5 + Math.random() * 0.8;
              const nr = Math.sqrt(Math.max(0, dr[i] * dr[i] - tr * tr * 0.6)); dr[i] = nr;
              let f = -1; for (let j = 0; j < N; j++) if (dst[j] === 0) { f = j; break; }
              if (f >= 0) { dx[f] = ox + (Math.random() - 0.5); dy[f] = oy - dr[i] * 0.6; dr[f] = tr; dst[f] = 1; dseed[f] = Math.random() * 100; dage[f] = 0; dv[f] = 0; }
            }
          }
          // absorb resting drops in the path
          for (let j = 0; j < N; j++) {
            if (j === i || dst[j] !== 1) continue;
            const ex = dx[j] - dx[i], ey = dy[j] - dy[i], rr = dr[i] + dr[j] * 0.6;
            if (ey > -dr[i] * 2 && ex * ex + ey * ey < rr * rr) {
              dr[i] = Math.sqrt(dr[i] * dr[i] + dr[j] * dr[j]); dst[j] = 0; dv[i] *= 1.15;
            }
          }
          if (dr[i] < 2) { dst[i] = 1; dv[i] = 0; trailEnd(i); }
          if (dy[i] > fadeTop + 10) { dst[i] = 0; trailEnd(i); }
        }

        // ---- render
        const f = env.front;
        f.lineCap = 'round'; f.lineJoin = 'round';
        for (let k = 0; k < TN; k++) {
          if (!tlive[k]) continue;
          if (tlive[k] === 2) { tage[k] += dt * (1 + 2 * (1 - rain)); if (tage[k] > 12) { tlive[k] = 0; continue; } }
          const n = tn[k]; if (n < 2) continue;
          const a = (1 - tage[k] / 12) * (0.6 + 0.4 * s.lum), o = k * TP;
          f.beginPath(); f.moveTo(tx[o], ty[o]);
          for (let j = 1; j < n; j++) f.lineTo(tx[o + j], ty[o + j]);
          f.strokeStyle = rgba(s, 0.07 * a, 0.3); f.lineWidth = tw[k] * 1.3; f.stroke();
          f.strokeStyle = rgba(s, 0.09 * a, 0.6); f.lineWidth = 0.7; f.stroke();
        }
        f.lineCap = 'butt';
        const ga = Math.min(1, (0.62 + 0.38 * s.lum) * (1 + s.flash * 0.9));
        for (let pass = 0; pass < (prevSet && fadeSet < 1 ? 2 : 1); pass++) {
          const set = pass === 0 ? sprites : prevSet;
          f.globalAlpha = ga * (pass === 0 ? fadeSet : 1 - fadeSet);
          for (let i = 0; i < N; i++) {
            if (!dst[i]) continue;
            const st = dst[i] === 2 ? 1 + Math.min(0.45, dv[i] / 220) : 1;
            drawDrop(f, set, dx[i], dy[i], dr[i], st);
          }
        }
        f.globalAlpha = 1;
      },
      destroy() { dst.fill(0); },
    });
  })();

  // ================================================================ Takdropp
  (() => {
    const far = Streaks(360);
    const s = mkS();
    const setFor = tintCache(); let sprites;
    let panes = [];                 // ledge records
    // splash particles
    const PN = 420;
    const px = new Float32Array(PN), py = new Float32Array(PN), pvx = new Float32Array(PN), pvy = new Float32Array(PN), pl = new Float32Array(PN), pfloor = new Float32Array(PN);
    let pHead = 0;
    // falling drips
    const DN = 70;
    const fx = new Float32Array(DN), fy = new Float32Array(DN), fv = new Float32Array(DN), fr = new Float32Array(DN), fa = new Uint8Array(DN);
    // rivulets running down pane sides
    const RN = 14;
    const rx = new Float32Array(RN), ry = new Float32Array(RN), rv = new Float32Array(RN), rp = new Int16Array(RN), rside = new Int8Array(RN), ra = new Uint8Array(RN), rseed = new Float32Array(RN), ry0 = new Float32Array(RN);
    let glint = null;
    let splashBudget = 0;

    function splash(x, y, big) {
      const n = big ? 6 : 2 + ((Math.random() * 2.2) | 0);
      for (let k = 0; k < n; k++) {
        const i = pHead; pHead = (pHead + 1) % PN;
        px[i] = x + (Math.random() - 0.5) * 2; py[i] = y - 0.5;
        const a = (Math.random() - 0.5) * 2.4;
        const sp = (big ? 70 : 45) + Math.random() * (big ? 90 : 60);
        pvx[i] = Math.sin(a) * sp * 0.9 + s.wind * 40; pvy[i] = -Math.cos(a) * sp - 20;
        pl[i] = 0.22 + Math.random() * (big ? 0.35 : 0.2); pfloor[i] = y;
      }
    }
    // ledge test for far streaks: true if the drop hit a pane (top or side)
    function ledge(x, py0, y) {
      for (let k = 0; k < panes.length; k++) {
        const p = panes[k];
        if (x < p.x || x > p.x2 || y < p.y || y > p.y2) continue;
        if (py0 <= p.y + 1) {
          p.wetIn += 1;
          if (splashBudget > 0 && Math.random() < 0.55) { splashBudget--; splash(x, p.y, false); }
        }
        return true;
      }
      return false;
    }
    function buildPanes(env) {
      panes = env.panes.map((p) => {
        const eaves = [p.x + 1.2, p.x + p.w - 1.2];
        const n = Math.max(1, Math.round(p.w / 95));
        for (let k = 0; k < n; k++) eaves.push(p.x + p.w * (0.12 + 0.76 * ((k + Math.random() * 0.8) / n)));
        return {
          id: p.id, x: p.x, y: p.y, x2: p.x + p.w, y2: p.y + p.h, w: p.w, h: p.h, bw: p.border,
          wet: 0, wetIn: 0, eaves: Float32Array.from(eaves), bead: Float32Array.from(eaves, () => Math.random()),
          rate: Float32Array.from(eaves, () => 0.5 + Math.random()), gp: Math.random(),
        };
      });
    }
    function drip(x, y, r) {
      for (let i = 0; i < DN; i++) if (!fa[i]) { fa[i] = 1; fx[i] = x; fy[i] = y; fv[i] = 30; fr[i] = r; return; }
    }
    function makeGlint() {
      const c = canvas(128, 6), x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 128, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 2, 128, 1.4);
      x.globalAlpha = 0.25; x.fillRect(0, 0, 128, 6);
      return c;
    }

    WX.register({
      id: 'rain-ledge', title: 'Takdropp', family: 'Regn', fps: 60,
      note: 'Regnet faller bakom klienten och slår mot panelernas överkanter: små stänk på kanterna, vattnet rinner längs sidorna och droppar från hörn och underkanter; ösregn ger vindbyar och blanka, våta kanter, och efter regnet droppar det en stund till.',
      preset: { weather: '"', fog: '', light: ')' },
      init(env) {
        snapS(s, env); sprites = setFor(env.state.light); glint = makeGlint();
        pl.fill(0); fa.fill(0); ra.fill(0);
      },
      resize(env) {
        buildPanes(env);
        for (const p of panes) p.wet = s.rain * (0.5 + 0.5 * s.heavy);
        seedStreaks(far, env, Math.round(s.rain * (110 + 250 * s.heavy)));
        for (let i = 0; i < far.n; i++) if (ledge(far.x[i], -1e9, far.y[i])) far.y[i] -= env.H + 120;
        for (const p of panes) p.wetIn = 0;
      },
      onState(env, key, v) { if (key === 'light') sprites = setFor(v); },
      onEvent(env, name) { if (name === 'strike') s.flash = 1; },
      frame(env, dt) {
        stepS(s, env, dt);
        const rain = s.rain, heavy = s.heavy, b = env.back, f = env.front;
        const lumA = 0.55 + 0.45 * s.lum;
        splashBudget = Math.ceil(dt * rain * (25 + 110 * heavy));

        // ---- rain behind the client; stops on pane tops
        const cnt = Math.round(rain * (110 + 250 * heavy));
        const v = s.vis * lumA * (1 + s.flash * 1.6);
        drawStreaks(b, far, env, s, dt, cnt, {
          speeds: [560 + 320 * heavy, 820 + 420 * heavy, 1100 + 560 * heavy],
          lens: [8 + 9 * heavy, 13 + 15 * heavy, 19 + 26 * heavy],
          alphas: [0.08 * v, 0.13 * v, 0.2 * v * (0.55 + 0.45 * s.vis)],
          widths: [0.6, 0.85, 1.1], lift: 0.1,
        }, ledge);

        // ---- wetness per pane, eaves, rivulets
        const fadeTop = env.protect.fadeTop;
        for (let k = 0; k < panes.length; k++) {
          const p = panes[k];
          const inflow = p.wetIn / Math.max(40, p.w) * 1.4; p.wetIn = 0;
          p.wet = Math.min(1, p.wet + inflow * 0.06 + rain * dt * 0.03) * (1 - dt * (0.012 + 0.02 * (1 - rain)));
          if (p.y2 > fadeTop - 4) { /* bottom edge in the masked zone: no eaves */ }
          else for (let e = 0; e < p.eaves.length; e++) {
            p.bead[e] += dt * p.wet * p.rate[e] * (0.18 + 0.75 * heavy) * (e < 2 ? 1.5 : 1);
            if (p.bead[e] >= 1) { p.bead[e] = Math.random() * 0.15; drip(p.eaves[e], p.y2 + 3, 1.6 + Math.random() * 0.8); }
          }
          // start a rivulet down a side now and then
          if (Math.random() < dt * p.wet * (0.12 + 0.6 * heavy)) {
            for (let i = 0; i < RN; i++) if (!ra[i]) {
              ra[i] = 1; rp[i] = k; rside[i] = Math.random() < 0.5 ? 0 : 1; ry0[i] = ry[i] = p.y + 1; rv[i] = 0; rseed[i] = Math.random() * 50;
              rx[i] = rside[i] ? p.x2 - 0.6 : p.x + 0.6; break;
            }
          }
        }

        // ---- wet sheen along ledges (front)
        f.lineWidth = 1;
        for (let k = 0; k < panes.length; k++) {
          const p = panes[k]; const a = p.wet * (0.1 + 0.22 * heavy) * lumA;
          if (a < 0.01) continue;
          f.strokeStyle = rgba(s, a, 0.35);
          f.beginPath(); f.moveTo(p.x + 0.5, p.y2 - 0.5); f.lineTo(p.x + 0.5, p.y + 0.5); f.lineTo(p.x2 - 0.5, p.y + 0.5); f.lineTo(p.x2 - 0.5, p.y2 - 0.5); f.stroke();
          // a slow glint travelling along the wet top edge
          p.gp += dt * (0.05 + 0.05 * heavy);
          const gx = p.x - 120 + ((p.gp % 1.6) / 1.6) * (p.w + 240);
          const g0 = Math.max(p.x, gx - 64), g1 = Math.min(p.x2, gx + 64);
          if (g1 > g0) {
            f.globalAlpha = Math.min(1, p.wet * (0.25 + 0.6 * heavy) * lumA * (1 + s.flash));
            f.drawImage(glint, g0 - gx + 64, 0, g1 - g0, 6, g0, p.y - 2.2, g1 - g0, 6);
            f.globalAlpha = 1;
          }
        }

        // ---- splash particles
        f.strokeStyle = rgba(s, Math.min(1, 0.62 * lumA * (1 + s.flash)), 0.45);
        f.lineWidth = 1.1; f.lineCap = 'round';
        f.beginPath();
        for (let i = 0; i < PN; i++) {
          if (pl[i] <= 0) continue;
          pl[i] -= dt;
          pvy[i] += 620 * dt; px[i] += pvx[i] * dt; py[i] += pvy[i] * dt;
          if (py[i] > pfloor[i] + 1) { pl[i] = 0; continue; }
          f.moveTo(px[i] - pvx[i] * 0.014, py[i] - pvy[i] * 0.014); f.lineTo(px[i], py[i]);
        }
        f.stroke(); f.lineCap = 'butt';

        // ---- rivulets: beads crawling down the pane sides
        for (let i = 0; i < RN; i++) {
          if (!ra[i]) continue;
          const p = panes[rp[i]]; if (!p) { ra[i] = 0; continue; }
          const go = env.noise(ry[i] * 0.04, rseed[i]) > 0.35 ? 1 : 0.08;
          rv[i] += ((25 + 60 * heavy) * go - rv[i]) * Math.min(1, dt * 5);
          ry[i] += rv[i] * dt;
          const yEnd = Math.min(p.y2, fadeTop);
          if (ry[i] >= yEnd) {
            ra[i] = 0;
            if (p.y2 < fadeTop - 4) p.bead[rside[i]] = Math.min(1.2, p.bead[rside[i]] + 0.45);
            continue;
          }
          const tl = Math.min(ry[i] - ry0[i], 40);
          const g = f.createLinearGradient(0, ry[i] - tl, 0, ry[i]);
          g.addColorStop(0, rgba(s, 0, 0.3)); g.addColorStop(1, rgba(s, 0.32 * lumA, 0.3));
          f.strokeStyle = g; f.lineWidth = 1.2; f.beginPath(); f.moveTo(rx[i], ry[i] - tl); f.lineTo(rx[i], ry[i]); f.stroke();
          drawDrop(f, sprites, rx[i], ry[i], 1.6, 1.2);
        }

        // ---- hanging beads under the eaves
        f.globalAlpha = Math.min(1, 0.9 * lumA + s.flash * 0.3);
        for (let k = 0; k < panes.length; k++) {
          const p = panes[k];
          if (p.y2 > fadeTop - 4 || p.wet < 0.02) continue;
          for (let e = 0; e < p.eaves.length; e++) {
            const bb = Math.min(1, p.bead[e]); if (bb < 0.15) continue;
            const r = 0.8 + 2.1 * bb, st = 1 + Math.max(0, bb - 0.6) * 1.4;
            drawDrop(f, sprites, p.eaves[e], p.y2 + r * st * 0.8, r, st);
          }
        }

        // ---- falling drips
        for (let i = 0; i < DN; i++) {
          if (!fa[i]) continue;
          const oy = fy[i];
          fv[i] += 1150 * dt; fy[i] += fv[i] * dt; fx[i] += s.wind * fv[i] * dt * 0.25;
          if (fy[i] > fadeTop + 20) { fa[i] = 0; continue; }
          let hit = false;
          for (let k = 0; k < panes.length; k++) {
            const p = panes[k];
            if (fx[i] >= p.x && fx[i] <= p.x2 && oy <= p.y && fy[i] > p.y) { splash(fx[i], p.y, true); p.wet = Math.min(1, p.wet + 0.01); hit = true; break; }
          }
          if (hit) { fa[i] = 0; continue; }
          const tl = Math.min(fv[i] * 0.03, 22);
          f.strokeStyle = rgba(s, 0.22 * lumA, 0.3); f.lineWidth = 1;
          f.beginPath(); f.moveTo(fx[i], fy[i] - tl); f.lineTo(fx[i], fy[i]); f.stroke();
          drawDrop(f, sprites, fx[i], fy[i], fr[i], 1 + Math.min(0.8, fv[i] / 500));
        }
        f.globalAlpha = 1;
      },
      destroy() { pl.fill(0); fa.fill(0); ra.fill(0); },
    });
  })();

  // ============================================================== Teckenregn
  (() => {
    const N = 320;
    const col = new Float32Array(N), row = new Float32Array(N), spd = new Float32Array(N), alive = new Uint8Array(N), kind = new Uint8Array(N);
    const SN = 80;   // splashes
    const sx = new Float32Array(SN), sy = new Float32Array(SN), sf = new Float32Array(SN), sa = new Uint8Array(SN);
    const BN = 40;   // eave drips: hang then fall
    const bx = new Float32Array(BN), by = new Float32Array(BN), bv = new Float32Array(BN), bt = new Float32Array(BN), ba = new Uint8Array(BN), bfloor = new Float32Array(BN);
    const s = mkS();
    const GLYPHS = ["'", '.', ',', '|', '\\', '/', ':', '`', 'o', '¦'];
    const GI = {}; GLYPHS.forEach((g, i) => (GI[g] = i));
    let atlas = null, aw = 0, ah = 0, atlasRGB = [0, 0, 0];
    let cw = 8, ch = 16, cols = 0, rows = 0, occ = null, panes = [];

    // Drop patterns: [dRow, dCol, glyph, alphaLevel]
    // 0 light with trail, 1 light, 2 heavy straight, 3 heavy leaning, 4 heavy gust
    const PAT = [
      [[0, 0, "'", 0], [-1, 0, "'", 2]],
      [[0, 0, "'", 0]],
      [[0, 0, '|', 0], [-1, 0, '|', 1], [-2, 0, '¦', 2]],
      [[0, 0, '\\', 0], [-1, 0, '|', 1], [-2, -1, '`', 2]],
      [[0, 0, '\\', 0], [-1, -1, '\\', 1], [-2, -2, '`', 2]],
    ];
    const ALV = [1, 0.5, 0.24];
    function buildAtlas(env) {
      const d = env.dpr;
      aw = Math.ceil(cw * d); ah = Math.ceil(ch * d);
      atlas = canvas(aw * GLYPHS.length, ah * 3);
      const x = atlas.getContext('2d');
      x.font = env.cell.font.replace(/^[\d.]+px/, (m) => parseFloat(m) * d + 'px');
      x.textBaseline = 'middle'; x.textAlign = 'center';
      x.fillStyle = `rgb(${s.r | 0},${s.g | 0},${s.b | 0})`;
      for (let l = 0; l < 3; l++) { x.globalAlpha = ALV[l]; GLYPHS.forEach((g, i) => x.fillText(g, i * aw + aw / 2, l * ah + ah / 2)); }
      atlasRGB = [s.r, s.g, s.b];
    }
    function glyph(ctx, g, c, r, l) {
      // c,r are cell coordinates; r may be fractional for ledge-aligned glyphs
      ctx.drawImage(atlas, GI[g] * aw, (l || 0) * ah, aw, ah, Math.round(c * cw), Math.round(r * ch), aw / dpr, ah / dpr);
    }
    let dpr = 1, lw = 1;
    function vg(P, g, c, r) {
      const x0 = Math.round(c * cw), y0 = Math.round(r * ch), xc = x0 + Math.round(cw / 2) - 0.5;
      switch (g) {
        case '|': P.moveTo(xc, y0 + ch * 0.06); P.lineTo(xc, y0 + ch * 0.94); break;
        case '¦': P.moveTo(xc, y0 + ch * 0.08); P.lineTo(xc, y0 + ch * 0.42); P.moveTo(xc, y0 + ch * 0.58); P.lineTo(xc, y0 + ch * 0.92); break;
        case '\\': P.moveTo(x0 + cw * 0.18, y0 + ch * 0.1); P.lineTo(x0 + cw * 0.82, y0 + ch * 0.9); break;
        case "'": P.moveTo(xc, y0 + ch * 0.12); P.lineTo(xc, y0 + ch * 0.4); break;
        case '.': P.moveTo(xc, y0 + ch * 0.7); P.lineTo(xc, y0 + ch * 0.7 + lw * 1.3); break;
        case '`': P.moveTo(xc - cw * 0.18, y0 + ch * 0.14); P.lineTo(xc + cw * 0.08, y0 + ch * 0.34); break;
      }
    }
    function respawn(i, top) {
      row[i] = top ? -Math.random() * rows * 0.5 - 1 : Math.random() * rows;
      col[i] = Math.random() * (cols + 20) - 10 - s.wind * rows * 0.5;
      kind[i] = Math.random() < s.heavy ? 1 : 0;
      spd[i] = kind[i] ? 26 + Math.random() * 12 : 11 + Math.random() * 6;
    }
    function free(r, c) {
      if (r < 0 || c < 0 || r >= rows || c >= cols) return false;
      return !occ[r * cols + c];
    }
    function addSplash(c, y) {
      for (let i = 0; i < SN; i++) if (!sa[i]) { sa[i] = 1; sx[i] = c; sy[i] = y; sf[i] = 0; return; }
    }

    WX.register({
      id: 'rain-tui', title: 'Teckenregn', family: 'Regn', fps: 15,
      note: 'Retroregn i teckenrutnätet: \' och | faller bakom texten i stålblått och stänker . och \' på panelkanterna, ösregn lutar i vindbyarna och droppar från panelernas underkant.',
      preset: { weather: '"', fog: '', light: ')' },
      init(env) { snapS(s, env); sa.fill(0); ba.fill(0); },
      resize(env) {
        cw = env.cell.w; ch = env.cell.h; dpr = env.dpr; lw = Math.max(1, Math.round(env.cell.size / 12 * dpr) / dpr);
        cols = Math.ceil(env.W / cw); rows = Math.ceil(env.H / ch);
        occ = new Uint8Array(cols * rows);
        for (const l of env.lines) {
          const c0 = Math.floor(l.x / cw), c1 = Math.ceil((l.x + l.w) / cw), r0 = Math.floor(l.y / ch), r1 = Math.ceil((l.y + l.h) / ch);
          for (let r = r0; r < r1; r++) for (let c = c0 - 1; c <= c1; c++) if (r >= 0 && r < rows && c >= 0 && c < cols) occ[r * cols + c] = 1;
        }
        panes = env.panes.map((p) => ({ x: p.x, y: p.y, x2: p.x + p.w, y2: p.y + p.h, ry: p.y / ch, c0: Math.ceil(p.x / cw), c1: Math.floor((p.x + p.w) / cw) - 1, acc: Math.random() }));
        buildAtlas(env);
        const cnt = Math.round(s.rain * (90 + 180 * s.heavy));
        for (let i = 0; i < N; i++) { alive[i] = i < cnt ? 1 : 0; respawn(i, false); }
      },
      onEvent(env, name) { if (name === 'strike') s.flash = 1; },
      frame(env, dt) {
        stepS(s, env, dt);
        if (Math.abs(atlasRGB[0] - s.r) + Math.abs(atlasRGB[1] - s.g) + Math.abs(atlasRGB[2] - s.b) > 6) buildAtlas(env);
        const b = env.back, f = env.front, heavy = s.heavy, rain = s.rain;
        const cnt = Math.round(rain * (90 + 180 * heavy));
        const lumA = (0.55 + 0.45 * s.lum) * (1 + s.flash * 1.4);
        const wind = s.wind * 1.1;           // columns per row
        const fadeRow = env.protect.fadeTop / ch;

        // ---- falling glyphs, behind the client; text cells are skipped.
        // Glyphs are drawn as vector strokes shaped like the monospace '|', '\\',
        // "'" and '.' (identical at this size, and three strokes per frame
        // instead of hundreds of drawImage calls).
        const P = [new Path2D(), new Path2D(), new Path2D()];
        for (let i = 0; i < N; i++) {
          if (!alive[i]) {
            if (i < cnt && Math.random() < dt * 1.5) { alive[i] = 1; respawn(i, true); }
            continue;
          }
          const r0 = row[i];
          row[i] += spd[i] * dt; col[i] += wind * spd[i] * dt * (kind[i] ? 1 : 0.4);
          const c = Math.round(col[i]);
          // ledge hits: a share of the drops splash on pane tops
          for (let k = 0; k < panes.length; k++) {
            const p = panes[k];
            if (c >= p.c0 && c <= p.c1 && r0 < p.ry && row[i] >= p.ry) {
              if (Math.random() < 0.45) { addSplash(c, p.y); row[i] = 1e9; }
              break;
            }
          }
          if (row[i] > fadeRow + 2) { if (i < cnt) respawn(i, true); else alive[i] = 0; continue; }
          const r = Math.floor(row[i]);
          const wj = wind + (i % 7) * 0.025 - 0.075;   // per-drop jitter: gusts sweep in, not snap
          const cells = PAT[kind[i] ? (wj > 0.42 ? 4 : wj > 0.2 ? 3 : 2) : (i & 3) ? 1 : 0];
          for (let k = 0; k < cells.length; k++) {
            const q = cells[k];
            if (free(r + q[0], c + q[1])) vg(P[q[3]], q[2], c + q[1], r + q[0]);
          }
        }
        b.lineWidth = lw; b.lineCap = 'butt';
        const ba0 = Math.min(1, s.vis * lumA * 0.55);
        for (let l = 0; l < 3; l++) { b.strokeStyle = rgba(s, ba0 * ALV[l], 0); b.stroke(P[l]); }

        // ---- eave drips: a '.' gathers under the pane, then a "'" falls
        for (let k = 0; k < panes.length; k++) {
          const p = panes[k];
          if (p.y2 > env.protect.fadeTop - ch) continue;
          p.acc += dt * rain * (0.25 + 1.1 * heavy);
          if (p.acc > 1) {
            p.acc = Math.random() * 0.3;
            for (let i = 0; i < BN; i++) if (!ba[i]) {
              ba[i] = 1; bx[i] = Math.random() < 0.4 ? (Math.random() < 0.5 ? p.c0 : p.c1) : p.c0 + 1 + Math.floor(Math.random() * (p.c1 - p.c0 - 1));
              by[i] = p.y2; bv[i] = 0; bt[i] = 0; bfloor[i] = env.protect.fadeTop;
              for (const q of panes) if (q !== p && bx[i] >= q.c0 && bx[i] <= q.c1 && q.y > p.y2 && q.y < bfloor[i]) bfloor[i] = q.y;
              break;
            }
          }
        }
        f.globalAlpha = Math.min(1, 0.75 * lumA);
        for (let i = 0; i < BN; i++) {
          if (!ba[i]) continue;
          bt[i] += dt;
          if (bt[i] < 0.6) { glyph(f, bt[i] < 0.3 ? '.' : ':', bx[i], by[i] / ch - 0.35); continue; }
          bv[i] += 520 * dt; by[i] += bv[i] * dt;
          if (by[i] >= bfloor[i]) { ba[i] = 0; if (bfloor[i] < env.protect.fadeTop) addSplash(bx[i], bfloor[i]); continue; }
          glyph(f, bv[i] > 220 ? '|' : "'", bx[i], by[i] / ch - 0.5);
        }

        // ---- splashes on ledges (front): . then ' ' then . .
        f.globalAlpha = Math.min(1, 0.8 * lumA);
        for (let i = 0; i < SN; i++) {
          if (!sa[i]) continue;
          const st = sf[i] | 0, c = sx[i], y = sy[i] / ch;
          if (st === 0) glyph(f, '.', c, y - 0.8);
          else if (st === 1) { glyph(f, "'", c - 1, y - 0.85); glyph(f, "'", c + 1, y - 0.85); }
          else if (st === 2) { f.globalAlpha *= 0.55; glyph(f, '.', c - 2, y - 0.75); glyph(f, '.', c + 2, y - 0.75); f.globalAlpha = Math.min(1, 0.8 * lumA); }
          sf[i] += dt * 15;
          if (sf[i] >= 3) sa[i] = 0;
        }
        f.globalAlpha = 1;
      },
      destroy() { sa.fill(0); ba.fill(0); },
    });
  })();
})();
