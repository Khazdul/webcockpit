// Body ("Kropp"): the character's position shown on the screen.
//   sleeping       "z z Z" letters float up from a quiet spot above the prompt,
//                  plus a gentle breathing darkening of the screen edges.
//   resting        a very faint, slow edge darkening (calm).
//   stunned        (v4) no full-screen flash. The impact hits the CORNERS/edges:
//                  a pale cold flare in the corners, split into a cool and a warm
//                  double image that jolts (damped shake) for ~0.4 s and a shaken
//                  dark edge vignette. DOM text never moves. While stunned: a
//                  slow, faint pulsing vignette.
//   incapacitated  blood spatters appear one by one near edges/corners,
//   dying          more and larger. (v4) A wide reddish wash over most of the
//                  screen pulses with the heartbeat (lub-dub) and shifts colour
//                  maroon -> scarlet on each beat; incapacitated slow and weak,
//                  dying faster and stronger. The centre stays light for text.
//                  When the player recovers, spatters dry (darken) and fade.
// All sprites (letters, vignettes, spatters) are built once at init/resize.
(() => {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sst = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const ease = (cur, tgt, dt, tau) => cur + (tgt - cur) * (1 - Math.exp(-dt / tau));
  const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

  const S = {
    ready: false, t: 0,
    sleep: 0, rest: 0, stun: 0, down: 0, dying: 0,   // eased state levels
    stunAt: -1e9,                                     // time (s) the stun impact started
    jx: 1, jy: 0,                                     // jolt direction of the current impact
    hb: 0,                                            // heartbeat phase (cycles)
    z: [], zNext: 0, zSeq: 0,
    spl: [], splNext: 0, sprites: [],
  };

  // ---------------- sprites ----------------
  function vignette(rgb, inner, power) {
    const w = 192, h = 120, c = mkCanvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w * 2 - 1, v = (y + 0.5) / h * 2 - 1;
      const r = Math.sqrt(u * u * 0.85 + v * v);
      const a = Math.pow(sst(inner, 1.42, r), power);
      const i = (y * w + x) * 4;
      d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = (a * 255) | 0;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  // Corner flare: strongest in the corners, a thin band along the edges, clear centre.
  function corners(rgb) {
    const w = 192, h = 120, c = mkCanvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = Math.abs((x + 0.5) / w * 2 - 1), v = Math.abs((y + 0.5) / h * 2 - 1);
      const edge = Math.max(sst(0.8, 1, u), sst(0.74, 1, v));
      const corner = sst(0.95, 1.41, Math.sqrt(u * u + v * v));
      const a = Math.min(1, corner * 0.95 + edge * edge * 0.45);
      const i = (y * w + x) * 4;
      d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = (a * 255) | 0;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  // Wide wash: covers most of the screen, lighter in the middle where text is.
  function wash(rgb) {
    const w = 160, h = 100, c = mkCanvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w * 2 - 1, v = (y + 0.5) / h * 2 - 1;
      const r = Math.sqrt(u * u * 0.8 + v * v);
      const a = 0.32 + 0.68 * Math.pow(sst(0.05, 1.35, r), 1.3);
      const i = (y * w + x) * 4;
      d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = (a * 255) | 0;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  function letters(env) {
    const size = Math.round((env.cell ? env.cell.size : 13) * 1.6), dpr = env.dpr;
    const font = (env.cell ? env.cell.font : '13px monospace').replace(/^[\d.]+px/, `${size}px`);
    const mk = (ch) => {
      const c = mkCanvas(size * dpr, size * 1.3 * dpr), g = c.getContext('2d');
      g.scale(dpr, dpr); g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#9aa6b6'; g.fillText(ch, size / 2, size * 0.65);
      return { c, w: size, h: size * 1.3 };
    };
    return { z: mk('z'), Z: mk('Z'), base: size };
  }

  // A blood spatter, drawn once: an irregular main blot, a few radial spikes
  // ending in droplets, satellite drops thrown in one main direction, maybe a
  // short drip running down. Fresh (dark glossy red) and dried (brown) versions.
  function spatter(seed, dpr) {
    let s = seed;
    const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const SZ = 190, c = mkCanvas(SZ * dpr, SZ * dpr), g = c.getContext('2d');
    g.scale(dpr, dpr);
    const cx = SZ / 2, cy = SZ / 2, r0 = 9 + R() * 9, dir = R() * TAU;
    const col = `rgb(${(84 + R() * 26) | 0},${(4 + R() * 6) | 0},${(6 + R() * 6) | 0})`;
    g.fillStyle = col;
    // main blot: noisy polygon
    const n = 30, ph1 = R() * TAU, ph2 = R() * TAU;
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      const along = Math.max(0, Math.cos(a - dir));
      const rr = r0 * (1 + 0.16 * Math.sin(a * 3 + ph1) + 0.1 * Math.sin(a * 7 + ph2) + 0.35 * along * along);
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath(); g.fill();
    // spikes: tapered streaks out of the blot, ending in a droplet
    const spikes = 3 + ((R() * 4) | 0);
    for (let k = 0; k < spikes; k++) {
      const a = dir + (R() - 0.5) * 2.2, len = r0 * (1.4 + R() * 2.2), wdt = r0 * (0.18 + R() * 0.2);
      const bx = cx + Math.cos(a) * r0 * 0.7, by = cy + Math.sin(a) * r0 * 0.7;
      const ex = cx + Math.cos(a) * (r0 + len), ey = cy + Math.sin(a) * (r0 + len);
      const px = -Math.sin(a) * wdt, py = Math.cos(a) * wdt;
      g.beginPath(); g.moveTo(bx + px, by + py); g.quadraticCurveTo((bx + ex) / 2 + px * 0.3, (by + ey) / 2 + py * 0.3, ex, ey);
      g.quadraticCurveTo((bx + ex) / 2 - px * 0.3, (by + ey) / 2 - py * 0.3, bx - px, by - py); g.closePath(); g.fill();
      g.beginPath(); g.arc(ex + Math.cos(a) * wdt * 0.6, ey + Math.sin(a) * wdt * 0.6, wdt * (0.7 + R() * 0.6), 0, TAU); g.fill();
    }
    // satellite droplets: thrown along dir, smaller with distance; some elongated
    const drops = 12 + ((R() * 16) | 0);
    for (let k = 0; k < drops; k++) {
      const a = dir + (R() - 0.5) * (R() < 0.75 ? 1.8 : 5.5);
      const d = r0 * (1.3 + Math.pow(R(), 0.8) * 4.2);
      const rad = Math.max(0.5, r0 * 0.24 * (1.25 - d / (r0 * 6)) * (0.4 + R()));
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      g.beginPath();
      if (R() < 0.35) g.ellipse(x, y, rad * 1.9, rad * 0.8, a, 0, TAU); else g.arc(x, y, rad, 0, TAU);
      g.fill();
    }
    // a drip running down from the blot
    if (R() < 0.55) {
      const dx = cx + (R() - 0.5) * r0, len = 10 + R() * 32, wd = 1.7 + R() * 1.6;
      g.beginPath(); g.moveTo(dx - wd, cy); g.lineTo(dx - wd * 0.7, cy + len); g.arc(dx, cy + len, wd * 1.2, Math.PI, 0, true);
      g.lineTo(dx + wd, cy); g.closePath(); g.fill();
    }
    // depth: darker rim on everything, a soft glossy highlight on the blot
    g.globalCompositeOperation = 'source-atop';
    const rim = g.createRadialGradient(cx, cy, r0 * 0.3, cx, cy, r0 * 1.3);
    rim.addColorStop(0, 'rgba(150,20,20,0.35)'); rim.addColorStop(1, 'rgba(30,0,0,0.4)');
    g.fillStyle = rim; g.fillRect(0, 0, SZ, SZ);
    const hl = g.createRadialGradient(cx - r0 * 0.35, cy - r0 * 0.4, 0, cx - r0 * 0.35, cy - r0 * 0.4, r0 * 0.6);
    hl.addColorStop(0, 'rgba(255,170,170,0.14)'); hl.addColorStop(1, 'rgba(255,190,190,0)');
    g.fillStyle = hl; g.fillRect(0, 0, SZ, SZ);
    // dried: brown, flatter
    const dc = mkCanvas(c.width, c.height), dg = dc.getContext('2d');
    dg.drawImage(c, 0, 0); dg.globalCompositeOperation = 'source-atop';
    dg.fillStyle = 'rgba(58,26,14,0.82)'; dg.fillRect(0, 0, dc.width, dc.height);
    return { fresh: c, dry: dc, size: SZ, r: r0 * 3.2 };
  }

  // ---------------- placement ----------------
  // z z z: a column above the prompt, right part of the output area, where
  // the text lines are shortest. Chosen at resize.
  function placeZ(env) {
    const out = env.out || { x: 0, y: 0, w: env.W, h: env.H };
    const ch = env.cell ? env.cell.h : 16, cw = env.cell ? env.cell.w : 8;
    const fadeTop = env.protect ? env.protect.fadeTop : env.H * 0.85;
    const rise = ch * 7;
    let best = null;
    for (let x = out.x + out.w * 0.45; x < out.x + out.w * 0.9; x += cw * 2) {
      for (let y0 = fadeTop - ch * 0.5; y0 > fadeTop - ch * 8 && y0 - rise > 0; y0 -= ch) {
        const x0 = x - cw, x1 = x + cw * 4, y1 = y0 - rise;
        let overlap = 0;
        for (const r of env.lines) {
          const ox = Math.min(x1, r.x + r.w) - Math.max(x0, r.x), oy = Math.min(y0 + ch, r.y + r.h) - Math.max(y1, r.y);
          if (ox > 0 && oy > 0) overlap += ox * oy;
        }
        for (const p of env.panes) {
          const ox = Math.min(x1 + cw * 2, p.x + p.w) - Math.max(x0, p.x), oy = Math.min(y0 + ch, p.y + p.h) - Math.max(y1, p.y);
          if (ox > 0 && oy > 0) overlap += ox * oy * 4;
        }
        const score = overlap + (fadeTop - y0) * cw * 2 + Math.abs(out.x + out.w * 0.8 - x) * cw * 0.6;
        if (!best || score < best.score) best = { score, x, y: y0 };
      }
    }
    S.zx = best ? best.x : out.x + out.w * 0.7;
    S.zy = best ? best.y : fadeTop - ch;
    S.zRise = rise;
  }

  function placeSpatter(env, sp) {
    const W = env.W, H = env.H, p = env.protect || { fadeTop: H * 0.85, left: 60 };
    const r = sp.r;
    let best = null;
    for (let k = 0; k < 24; k++) {
      const x = p.left + r * 0.6 + Math.random() * (W - p.left - r * 1.2);
      const y = r * 0.4 + Math.random() * (p.fadeTop - r * 1.4);
      // near edges and corners is better
      const de = Math.min(x - p.left, W - x, y, (p.fadeTop - y) * 1.5);
      let score = -de / Math.min(W, H) * 3;
      let dc = 1e9;
      for (const q of env.panes) for (const [qx, qy] of [[q.x, q.y], [q.x + q.w, q.y], [q.x, q.y + q.h], [q.x + q.w, q.y + q.h]]) dc = Math.min(dc, Math.hypot(qx - x, qy - y));
      score -= Math.min(1, dc / 160) * 0.5;
      // away from text lines
      for (const l of env.lines) {
        const ox = Math.min(x + r * 0.8, l.x + l.w) - Math.max(x - r * 0.8, l.x), oy = Math.min(y + r * 0.9, l.y + l.h) - Math.max(y - r * 0.6, l.y);
        if (ox > 0 && oy > 0) score -= (ox * oy) / (r * r) * 4;
      }
      // away from other spatters
      for (const o of S.spl) if (o.a > 0) { const d = Math.hypot(o.x - x, o.y - y); if (d < r * 2.2) score -= (1 - d / (r * 2.2)) * 2; }
      score += Math.random() * 0.25;
      if (!best || score > best.score) best = { score, x, y };
    }
    return best;
  }

  function spawnSpatter(env) {
    const sp = S.sprites[(Math.random() * S.sprites.length) | 0];
    const pos = placeSpatter(env, sp);
    let slot = S.spl.find((o) => o.a <= 0);
    if (!slot) { if (S.spl.length >= 18) return; slot = {}; S.spl.push(slot); }
    slot.sp = sp; slot.x = pos.x; slot.y = pos.y; slot.rot = Math.random() * TAU; slot.sc = 0.85 + Math.random() * 0.5;
    slot.born = S.t + Math.random() * 0.14; slot.a = 1; slot.dry = 0; slot.drying = false;
  }

  WX.module({
    id: 'body', title: 'Kropp',
    init(env) {
      S.vigDark = vignette([0, 0, 0], 0.55, 1.4);
      S.vigRed = vignette([120, 0, 4], 0.62, 1.5);
      S.cornCool = corners([214, 226, 240]);
      S.cornWarm = corners([240, 214, 196]);
      S.washDeep = wash([70, 0, 14]);
      S.washHot = wash([196, 22, 16]);
      S.sprites = [];
      for (let i = 0; i < 10; i++) S.sprites.push(spatter(9001 + i * 7717, env.dpr));
      S.ready = true;
    },
    resize(env) {
      if (!S.ready) return;
      S.L = letters(env);
      placeZ(env);
    },
    onEvent(env, name, data) {
      if (name !== 'position' || !data) return;
      if (data.to === 'stunned') { S.stunAt = S.t; const a = Math.random() * TAU; S.jx = Math.cos(a); S.jy = Math.sin(a) * 0.6; }
      if (data.to === 'sleeping') { S.zNext = S.t + 0.6; S.zSeq = 0; }
      if (data.to === 'incapacitated' || data.to === 'dying') S.splNext = Math.min(S.splNext, S.t + 0.25);
    },
    frame(env, dt) {
      if (!S.ready || !S.L) return;
      S.t += dt;
      const t = S.t, pos = env.settled.position, m = env.mix;
      S.sleep = m.sleeping; S.rest = m.resting; S.down = m.down;
      S.stun = ease(S.stun, pos === 'stunned' ? 1 : 0, dt, 0.8);
      S.dying = ease(S.dying, pos === 'dying' ? 1 : 0, dt, 1.2);
      const flashAge = t - S.stunAt;
      let anyBlood = false;
      for (let i = 0; i < S.spl.length; i++) if (S.spl[i].a > 0) { anyBlood = true; break; }
      if (S.sleep < 0.01 && S.rest < 0.01 && S.stun < 0.01 && S.down < 0.01 && flashAge > 3 && !anyBlood && !S.z.length) return;

      const fr = env.front, W = env.W, H = env.H;

      // ---------------- edge darkening: sleeping / resting / stunned ----------------
      const breathe = 0.5 + 0.5 * Math.sin(t * TAU / 5.5);
      let vd = S.sleep * (0.3 + 0.08 * breathe) + S.rest * 0.1 * (0.8 + 0.2 * breathe);
      if (S.stun > 0.01) {
        // slow pulse; held back until the flash's after-image has faded
        const pulse = Math.pow(0.5 + 0.5 * Math.sin(t * TAU / 2.6), 2);
        vd += S.stun * (0.12 + 0.16 * pulse) * sst(0.6, 2.2, flashAge);
      }
      if (vd > 0.005) { fr.globalAlpha = clamp(vd, 0, 1); fr.drawImage(S.vigDark, 0, 0, W, H); }

      // ---------------- z z Z ----------------
      if (S.sleep > 0.5 && t >= S.zNext) {
        const k = S.zSeq % 3;
        S.z.push({ born: t, big: k === 2, sway: Math.random() * TAU, dx: (k - 1) * 0.4 });
        S.zSeq++;
        S.zNext = t + (k === 2 ? 3.4 : 1.15);
      }
      if (S.z.length) {
        const L = S.L, life = 5.2;
        for (let i = S.z.length - 1; i >= 0; i--) {
          const z = S.z[i], age = t - z.born;
          if (age > life) { S.z.splice(i, 1); continue; }
          const p = age / life;
          const sz = (z.big ? 1.25 : 0.85) * (0.85 + 0.35 * p);
          const x = S.zx + p * 26 + Math.sin(age * 1.3 + z.sway) * 5 + z.dx * 8;
          const y = S.zy - p * S.zRise;
          const a = sst(0, 0.12, p) * (1 - sst(0.55, 1, p)) * 0.7 * Math.max(S.sleep, 0.25);
          if (a < 0.005) continue;
          const sp = z.big ? L.Z : L.z, w = sp.w * sz, h = sp.h * sz;
          fr.globalAlpha = a; fr.drawImage(sp.c, x - w / 2, y - h / 2, w, h);
        }
      }

      // ---------------- stun impact: corners, jolt, double image ----------------
      if (flashAge < 3) {
        const A = flashAge;
        // damped shake: a hard first kick, then a few quick wobbles
        const shake = Math.exp(-A / 0.16) * Math.cos(A * TAU * 9);
        const jdx = S.jx * 16 * shake, jdy = S.jy * 16 * shake;
        const hit = sst(0, 0.025, A);
        // shaken dark edge vignette (the world "closes in" for a moment)
        const da = 0.42 * hit * Math.exp(-A / 0.55);
        if (da > 0.004) {
          const g = 1.06;
          fr.globalAlpha = da; fr.drawImage(S.vigDark, -W * (g - 1) / 2 + jdx, -H * (g - 1) / 2 + jdy, W * g, H * g);
        }
        // corner flare, split into a cool and a warm copy that jolt apart and settle
        const fa = 0.75 * hit * Math.exp(-A / 0.22) + 0.12 * Math.exp(-A / 0.9) * (0.6 + 0.4 * Math.cos(A * TAU * 2.4));
        if (fa > 0.004) {
          const sep = 1 + 12 * Math.exp(-A / 0.35), g = 1.03;
          const x0 = -W * (g - 1) / 2, y0 = -H * (g - 1) / 2, w = W * g, h = H * g;
          fr.globalAlpha = fa * 0.62; fr.drawImage(S.cornCool, x0 + jdx + S.jx * sep, y0 + jdy + S.jy * sep, w, h);
          fr.globalAlpha = fa * 0.5; fr.drawImage(S.cornWarm, x0 - jdx * 0.6 - S.jx * sep, y0 - jdy * 0.6 - S.jy * sep, w, h);
        }
      }

      // ---------------- blood ----------------
      const target = pos === 'dying' ? 12 : pos === 'incapacitated' ? 6 : 0;
      let fresh = 0;
      for (const o of S.spl) if (o.a > 0 && !o.drying) fresh++;
      // all spatters land at once (owner v4), with a few ms of scatter so they read as one splash
      while (fresh < target) {
        const before = S.spl.length, free = S.spl.some((o) => o.a <= 0);
        spawnSpatter(env);
        if (!free && S.spl.length === before) break;
        fresh++;
      }
      if (target === 0 || fresh > target) {
        // recovering (or fewer wanted): start drying, oldest first, staggered
        let surplus = fresh - target;
        for (const o of S.spl) if (o.a > 0 && !o.drying && surplus > 0) { o.drying = true; o.dryAt = t + Math.random() * 2.5; surplus--; }
      }
      for (const o of S.spl) {
        if (o.a <= 0) continue;
        if (o.drying && t > o.dryAt) {
          o.dry = Math.min(1, o.dry + dt / 3.5);
          if (o.dry >= 1) o.a -= dt / 5;
        }
        if (o.a <= 0) continue;
        const age = t - o.born;
        const pop = sst(0, 0.16, age);                       // the splat lands quickly
        const sc = o.sc * (0.8 + 0.2 * pop);
        const a = clamp(o.a, 0, 1) * pop * 0.78;
        const sp = o.sp;
        const c = Math.cos(o.rot) * sc, s = Math.sin(o.rot) * sc, dpr = env.dpr;
        fr.setTransform(c * dpr, s * dpr, -s * dpr, c * dpr, o.x * dpr, o.y * dpr);
        if (o.dry < 1) { fr.globalAlpha = a * (1 - o.dry); fr.drawImage(sp.fresh, -sp.size / 2, -sp.size / 2, sp.size, sp.size); }
        if (o.dry > 0) { fr.globalAlpha = a * o.dry * 0.85; fr.drawImage(sp.dry, -sp.size / 2, -sp.size / 2, sp.size, sp.size); }
      }
      fr.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);

      // ---------------- heartbeat: wide red wash pulsing maroon -> scarlet ----------------
      const present = clamp(S.down / 0.6, 0, 1);
      if (present > 0.004) {
        const k = S.dying;                                   // 0 incapacitated .. 1 dying
        S.hb += dt / (1.75 - 0.7 * k);                        // period 1.75 s -> 1.05 s
        const ph = S.hb % 1;
        const beat = Math.exp(-Math.pow((ph - 0.06) / 0.055, 2)) + 0.55 * Math.exp(-Math.pow((ph - 0.27) / 0.065, 2));
        const glow = Math.min(1, beat);
        const base = present * (0.09 + 0.04 * k);             // constant deep maroon
        const hot = present * (0.05 + 0.1 * k) * glow;        // scarlet on each beat
        fr.globalAlpha = base * (1 - 0.35 * glow); fr.drawImage(S.washDeep, 0, 0, W, H);
        if (hot > 0.003) { fr.globalAlpha = hot; fr.drawImage(S.washHot, 0, 0, W, H); }
        const ra = present * (0.06 + 0.04 * k) + present * (0.06 + 0.16 * k) * glow;
        fr.globalAlpha = clamp(ra, 0, 1); fr.drawImage(S.vigRed, 0, 0, W, H);
      } else S.hb = 0;
      fr.globalAlpha = 1;
    },
    destroy() { S.ready = false; S.z.length = 0; S.spl.length = 0; },
  });
})();
