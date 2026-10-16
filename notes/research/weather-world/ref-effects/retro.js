// Retro family: weather as retro computer art.
//   retro-demo     — 1992 demoscene pixel art: 1/4 resolution, strict EGA palette,
//                    ordered Bayer 4x4 dithering, pixel clouds/sun/moon/mountains.
//   retro-teletext — teletext/ANSI mosaic sky, cell-aligned sextant blocks.
//   retro-fosfor   — CRT phosphor glyph weather with burn-in persistence.
(() => {
  // ---------------------------------------------------------------- shared
  const BAYER = new Float32Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16));
  const EGA = [
    [0, 0, 0], [0, 0, 170], [0, 170, 0], [0, 170, 170], [170, 0, 0], [170, 0, 170], [170, 85, 0], [170, 170, 170],
    [85, 85, 85], [85, 85, 255], [85, 255, 85], [85, 255, 255], [255, 85, 85], [255, 85, 255], [255, 255, 85], [255, 255, 255],
  ];
  const EGA32 = new Uint32Array(16);
  const EGACSS = [];
  EGA.forEach(([r, g, b], i) => { EGA32[i] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0; EGACSS[i] = `rgb(${r},${g},${b})`; });
  // Two-colour ordered dither LUT (32^3): for every RGB cell, the best pair of
  // palette colours and the mix ratio, preferring neighbouring shades.
  const ALLOWED = [0, 1, 3, 4, 6, 7, 8, 9, 11, 12, 14, 15]; // no greens/magentas in this sky
  let LA = null, LB, LT;
  function buildLUT() {
    LA = new Uint8Array(32768); LB = new Uint8Array(32768); LT = new Uint8Array(32768);
    const pairs = [];
    for (let i = 0; i < ALLOWED.length; i++) for (let j = i; j < ALLOWED.length; j++) {
      const A = EGA[ALLOWED[i]], B = EGA[ALLOWED[j]];
      const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2];
      pairs.push([ALLOWED[i], ALLOWED[j], A, dx, dy, dz, dx * dx + dy * dy + dz * dz]);
    }
    for (let r = 0; r < 32; r++) for (let g = 0; g < 32; g++) for (let b = 0; b < 32; b++) {
      const R = r * 8.23, G = g * 8.23, B = b * 8.23; let best = 1e12, bi = 0, bt = 0;
      for (let k = 0; k < pairs.length; k++) {
        const [, , A, dx, dy, dz, L] = pairs[k];
        let t = L ? ((R - A[0]) * dx + (G - A[1]) * dy + (B - A[2]) * dz) / L : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const er = R - A[0] - dx * t, eg = G - A[1] - dy * t, eb = B - A[2] - dz * t;
        const e = er * er * 0.3 + eg * eg * 0.45 + eb * eb * 0.25 + L * 0.06 * t * (1 - t) * 4 * 0.5;
        if (e < best) { best = e; bi = k; bt = t; }
      }
      const q = (r << 10) | (g << 5) | b;
      LA[q] = pairs[bi][0]; LB[q] = pairs[bi][1]; LT[q] = Math.round(bt * 255);
    }
  }
  function ditherIdx(r, g, b, x, y) {
    let R = r >> 3, G = g >> 3, B = b >> 3;
    R = R < 0 ? 0 : R > 31 ? 31 : R; G = G < 0 ? 0 : G > 31 ? 31 : G; B = B < 0 ? 0 : B > 31 ? 31 : B;
    const q = (R << 10) | (G << 5) | B;
    return LT[q] > BAYER[((y & 3) << 2) | (x & 3)] * 255 ? LB[q] : LA[q];
  }
  const bay = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };
  // static sprites are promoted to ImageBitmaps (much cheaper to draw than a
  // canvas source); until the bitmap exists the canvas itself is used
  const BMP = (cv) => {
    if (cv._bmp) return cv._bmp;
    if (!cv._req && typeof createImageBitmap === 'function') { cv._req = 1; createImageBitmap(cv).then((b) => { if (cv._req === 1) cv._bmp = b; }, () => {}); }
    return cv;
  };
  const unBMP = (cv) => { if (cv._bmp && cv._bmp.close) cv._bmp.close(); cv._bmp = null; cv._req = 0; };
  let seed = 1;
  const srnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // Smoothed weather mix shared by all effects in this family.
  function mixTargets(st) {
    const w = st.weather;
    return {
      cover: w === ' ' ? 0.12 : w === '~' ? 0.72 : w === "'" ? 0.88 : w === '"' ? 1 : 0.8,
      over: w === ' ' ? 0 : w === '~' ? 0.22 : w === "'" ? 0.6 : w === '"' ? 0.92 : 0.62,
      rain: w === "'" ? 0.5 : w === '"' ? 1 : 0,
      heavy: w === '"' ? 1 : 0,
      snow: w === '*' ? 1 : 0,
      fog: st.fog === '-' ? 0.5 : st.fog === '=' ? 1 : 0,
      day: st.light === '*' ? 1 : 0,
      moon: st.light === ')' ? 1 : 0,
      torch: st.light === '!' ? 1 : 0,
    };
  }
  function newMix(st) { return Object.assign({}, mixTargets(st)); }
  let tgCache = null, tgW = '', tgF = '', tgL = '';
  function stepMix(m, st, dt, tau) {
    if (!tgCache || st.weather !== tgW || st.fog !== tgF || st.light !== tgL) { tgCache = mixTargets(st); tgW = st.weather; tgF = st.fog; tgL = st.light; }
    const tg = tgCache; const k = 1 - Math.exp(-dt / tau);
    for (const key in tg) { const d = tg[key] - m[key]; m[key] = Math.abs(d) < 0.002 ? tg[key] : m[key] + d * k; }
  }
  function skyBottomOf(env) {
    let top = env.H;
    for (const l of env.lines) if (l.y < top) top = l.y;
    return Math.max(env.H * 0.16, Math.min(top - env.cell.h * 1.2, env.H * 0.42));
  }

  // ================================================================ DEMOSCEN
  const S = 4; // chunky pixel size in CSS px
  const demo = (() => {
    let lw = 0, lh = 0, hy = 0, fadeRow = 0;
    let low, lc, sky, skyC, skyImg, skyU32, skyKey = '';
    const mtnH0 = 22, mtnCache = new Map();
    let mtn, mtnC, mtnImg, mtnU32, mtnH, mtnH2, mtnKey = -1, mtnFar, farC, farImg, farU32;
    let bfog, bfogC, bfogImg, bfogU32, bfogField, bfogRow0 = 0;
    let fog, fogC, fogImg, fogU32, fogField, fogSpans = [], fogKey = '', fogScroll = 0, fogTick = 0;
    let textMask, roof;
    let clouds = [];
    const stars = [];
    let mix, sunPos = { x: 0, y: 0 };
    const spriteCache = new Map();
    // particles
    const RMAX = 220, SMAX = 160, PMAX = 140;
    const rx = new Float32Array(RMAX), ry = new Float32Array(RMAX), rv = new Float32Array(RMAX), rl = new Uint8Array(RMAX), ralive = new Uint8Array(RMAX), rstop = new Float32Array(RMAX);
        const sbin = new Uint8Array(SMAX), sxi = new Int16Array(SMAX), sx = new Float32Array(SMAX), sy = new Float32Array(SMAX), sv = new Float32Array(SMAX), sph = new Float32Array(SMAX), salive = new Uint8Array(SMAX), sstop = new Float32Array(SMAX), sfar = new Uint8Array(SMAX);
    const px = new Float32Array(PMAX), py = new Float32Array(PMAX), pvx = new Float32Array(PMAX), pvy = new Float32Array(PMAX), plife = new Float32Array(PMAX), pcol = new Uint8Array(PMAX);
    let caps = [];
    let bolt = null, nextStrike = 8, flash = 0, glowPulse = 0, glowSign = 0;
    let rainSheets = [], snowSheets = [], rainRight = 0; const sheetOff = new Float32Array(10);
    let prepStage = 0, prepDt = 0, justPrepped = false, lastBoltSig = 0, stampPending = false, stampFull = false, pendingBand = false, fullPending = false, bandNo = 0, shaftPhase = 0, shaftL, shaftH, frameNo = 0, time = 0, tickAcc = 0, needFull = true, lowerDirty = false, frontDirty = true;

    function buildSky(env) {
      // per-row colour, dithered
      const day = mix.day, ov = mix.over, glow = Math.max(glowPulse, 0);
      const fl = flash;
      const key = [Math.round(day * 24), Math.round(ov * 24), Math.round(glow * 16), Math.round(fl * 10), Math.round(mix.moon * 8)].join();
      if (key === skyKey) return; skyKey = key;
      for (let y = 0; y < hy; y++) {
        const t = y / Math.max(1, hy - 1);
        const t2 = t * t;
        // clear day / clear night / overcast day / overcast night, top->horizon
        let r = lerp(0, lerp(0, 20, t2), day), g = lerp(0, lerp(0, 40, t2), day), b = lerp(lerp(4, 58, t2), lerp(30, 175, t), day);
        b += mix.moon * (1 - day) * 25 * t2;
        const or = lerp(lerp(0, 10, t2), lerp(4, 30, t2), day), og = lerp(lerp(0, 10, t2), lerp(4, 30, t2), day), ob = lerp(lerp(2, 18, t2), lerp(8, 42, t2), day);
        r = lerp(r, or, ov); g = lerp(g, og, ov); b = lerp(b, ob, ov);
        // sunset band near horizon
        const gw = glow * Math.pow(t, 2.2) * (1 - ov * 0.6) * Math.sqrt(clamp01(day * 1.5));
        r += 170 * gw; g += 50 * gw; b -= 50 * gw;
        // lightning flash
        r += 150 * fl; g += 150 * fl; b += 190 * fl;
        // fade to black for the last rows so the band blends into the land
        const row = y * lw;
        const p0 = EGA32[ditherIdx(r, g, b, 0, y)], p1 = EGA32[ditherIdx(r, g, b, 1, y)], p2 = EGA32[ditherIdx(r, g, b, 2, y)], p3 = EGA32[ditherIdx(r, g, b, 3, y)];
        const pat = [p0, p1, p2, p3];
        for (let x = 0; x < lw; x++) skyU32[row + x] = pat[x & 3];
      }
      skyC.putImageData(skyImg, 0, 0);
    }

    function buildMountains() {
      const key = Math.round(mix.snow * 6) * 4 + (mix.day > 0.5 ? 2 : 0) + (mix.over > 0.4 ? 1 : 0);
      if (key === mtnKey) return; mtnKey = key;
      const hit = mtnCache.get(key);
      if (hit) { mtn = hit[0]; mtnFar = hit[1]; return; }
      const h = mtnH0;
      mtn = mkCanvas(lw, h); mtnFar = mkCanvas(lw, h);
      mtnC = mtn.getContext('2d'); farC = mtnFar.getContext('2d');
      mtnU32.fill(0); farU32.fill(0);
      mtnCache.set(key, [mtn, mtnFar]);
      const ov = mix.over;
      const snowLine = mix.snow * 0.55;
      for (let x = 0; x < lw; x++) {
        const far = mtnH2[x], near = mtnH[x];
        for (let y = 0; y < h; y++) {
          const fromBottom = h - y;
          let c = -1;
          if (fromBottom <= near) {
            c = 0;
            const depth = (near - fromBottom) / Math.max(1, near); // 0 at ridge
            if (depth < snowLine && near > 6 && bay(x, y) < 1 - depth / Math.max(0.01, snowLine) * 0.9) c = mix.day > 0.5 ? 7 : 8;
            else if (fromBottom === Math.floor(near) && (mix.day < 0.5 || ov > 0.4)) c = 8; // moonlit / hazy rim
          } else if (fromBottom <= far) {
            const depth = (far - fromBottom) / Math.max(1, far);
            const hazeC = ov > 0.4 ? 8 : 1;
            c = hazeC === 8 ? (depth < 0.1 || bay(x, y) < 0.75 - depth * 0.6 ? 8 : 0) : (depth < 0.12 || fromBottom === Math.floor(far) ? hazeC : bay(x, y) < 0.3 - depth * 0.3 ? hazeC : 0);
            if (depth < snowLine * 0.8 && far > 9 && bay(x + 1, y) < 0.6) c = mix.day > 0.5 ? 7 : 8;
            if (c >= 0) farU32[y * lw + x] = EGA32[c];
            continue;
          }
          if (c >= 0) mtnU32[y * lw + x] = EGA32[c];
        }
      }
      mtnC.putImageData(mtnImg, 0, 0); farC.putImageData(farImg, 0, 0);
    }

    function buildFog(force) {
      const amt = mix.fog;
      const key = Math.round(amt * 8) + '|' + (mix.torch > 0.5 ? 1 : 0) + '|' + (mix.day > 0.5 ? 1 : 0);
      if (!force && key === fogKey) return; fogKey = key;
      const c1 = EGA32[mix.day > 0.5 ? 8 : 8], c2 = EGA32[mix.torch > 0.5 ? 6 : mix.day > 0.5 ? 7 : 8];
      // valley mist in the sky band
      const i0 = bfogRow0 * lw;
      bfogU32.fill(0, i0);
      if (amt > 0.01) {
        const n = bfogField.length, a = 0.55 + amt * 0.75;
        for (let i = i0; i < n; i++) {
          const v = bfogField[i] * a;
          if (v <= 0) continue;
          const x = i % lw, y = (i / lw) | 0, b = bay(x, y);
          if (v > b) bfogU32[i] = v - 0.6 > b ? c2 : c1;
        }
      }
      bfogC.putImageData(bfogImg, 0, 0, 0, bfogRow0, lw, hy + 1 - bfogRow0);
      // thick fog: one slow, sparse bank across the output
      for (let k = 0; k < fogSpans.length; k += 2) fogU32.fill(0, fogSpans[k] * lw, fogSpans[k + 1] * lw);
      const a2 = clamp01((amt - 0.55) / 0.45) * 0.55;
      if (a2 > 0.01) {
        for (let k = 0; k < fogSpans.length; k += 2) for (let i = fogSpans[k] * lw; i < fogSpans[k + 1] * lw; i++) {
          const v = fogField[i] * a2;
          if (v <= 0) continue;
          const x = i % lw, y = (i / lw) | 0;
          if (v > bay(x, y)) fogU32[i] = c1;
        }
      }
      for (let k = 0; k < fogSpans.length; k += 2) fogC.putImageData(fogImg, 0, 0, 0, fogSpans[k], lw, fogSpans[k + 1] - fogSpans[k]);
    }

    function makeCloudShape(w, h, puffs) {
      const dens = new Float32Array(w * h), shade = new Float32Array(w * h);
      const base = h - 2;
      const D = (x, y) => {
        let d = 0;
        for (const p of puffs) { const dx = (x - p.x) / p.r, dy = (y - p.y) / (p.r * 0.85); const v = 1 - Math.sqrt(dx * dx + dy * dy); if (v > d) d = v; }
        if (y > base) d *= clamp01(1 - (y - base) / 1.5);
        return d;
      };
      const nx = srnd() * 100;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const n = (WX.env.noise(nx + x * 0.5, y * 0.5) - 0.5) * 0.18;
        const d0 = D(x, y), d = d0 + n * clamp01(d0 * 6);
        const i = y * w + x;
        dens[i] = clamp01(d / 0.12);
        // self-shadowing: light comes from the upper left
        const occl = D(x - 2, y - 2.5);
        let sh = 1 - clamp01(occl * 2.0);
        sh = 0.15 + 0.85 * sh;
        sh *= 1 - 0.55 * clamp01((y - h * 0.5) / (h * 0.5));
        shade[i] = clamp01(sh);
      }
      return { dens, shade };
    }

    function makeClouds() {
      clouds = [];
      seed = 4242;
      const N = 9;
      for (let i = 0; i < N; i++) {
        const far = i < 4;
        const w = far ? 24 + ((srnd() * 16) | 0) : 42 + ((srnd() * 34) | 0);
        const h = far ? 10 + ((srnd() * 3) | 0) : 16 + ((srnd() * 7) | 0);
        const puffs = [];
        const np = far ? 3 + ((srnd() * 2) | 0) : 4 + ((srnd() * 3) | 0);
        for (let k = 0; k < np; k++) {
          const u = (k + 0.5) / np;
          const peak = 1 - Math.abs(u - 0.5) * 1.5;
          const r = (h * 0.42) * (0.55 + peak * 0.6) * (0.85 + srnd() * 0.3);
          puffs.push({ x: 3 + u * (w - 6) + (srnd() - 0.5) * 2, y: h - 2 - r * 0.7, r });
        }
        const sh = makeCloudShape(w, h, puffs);
        const cv = mkCanvas(w, h), ctx = cv.getContext('2d');
        const img = ctx.createImageData(w, h);
        clouds.push({ w, h, far, ...sh, cv, ctx, img, u32: new Uint32Array(img.data.buffer), x: (i / N + srnd() * 0.08) * lw * 1.3, yRel: far ? 0.05 + srnd() * 0.3 : 0.2 + srnd() * 0.55, speed: far ? 0.7 + srnd() * 0.5 : 1.6 + srnd() * 1.4, order: srnd(), pres: 0, key: -1, lx: -9999 });
      }
      const ord = clouds.map((c, i) => i).sort((a, b) => clouds[a].order - clouds[b].order);
      ord.forEach((ci, r) => { clouds[ci].rank = (r + 0.5) / clouds.length; });
      for (const c of clouds) c.pres = c.rank < (mix ? mix.cover : 0) ? 1 : 0;
      clouds[1].rank = 0.01; // the lone fair-weather cloud
      for (const c of clouds) if (c !== clouds[1] && c.rank < 0.15) c.rank = 0.15;
      clouds[1].yRel = 0.25;
    }

    function cloudColours() {
      const day = mix.day, ov = mix.over;
      // lit / shadow RGB: fair cumulus -> rain grey -> storm slate; night = moonlit greys
      let lr = lerp(lerp(70, 120, mix.moon), lerp(235, 150, ov), day), lg = lerp(lerp(70, 120, mix.moon), lerp(235, 150, ov), day), lb = lerp(lerp(95, 150, mix.moon), lerp(240, 162, ov), day);
      let dr = lerp(12, lerp(95, 50, ov), day), dg = lerp(12, lerp(100, 50, ov), day), db = lerp(30, lerp(140, 62, ov), day);
      const hv = mix.heavy;
      lr = lerp(lr, lr * 0.6, hv); lg = lerp(lg, lg * 0.6, hv); lb = lerp(lb, lb * 0.65, hv);
      dr *= 1 - 0.55 * hv; dg *= 1 - 0.55 * hv; db *= 1 - 0.45 * hv;
      const g = Math.max(glowPulse, 0) * Math.sqrt(clamp01(day * 1.5));
      lr += 80 * g; lg += 18 * g; lb -= 50 * g; dr += 30 * g;
      return [lr, lg, lb, dr, dg, db];
    }

    const shadeLUT = new Uint32Array(33 * 16);
    function colourKey(col) { let k = 0; for (let i = 0; i < 6; i++) k = k * 48 + Math.max(0, Math.min(47, Math.round(col[i] / 10))); return k; }
    function renderCloud(c, col, colKey, presQ) {
      const key = colKey * 17 + presQ;
      if (key === c.key) return false; c.key = key;
      const { w, h, dens, shade, u32 } = c;
      const pres = presQ / 16;
      const far = c.far ? 0.75 : 1;
      // 33 shade levels x 16 Bayer cells, dithered once
      for (let l = 0; l <= 32; l++) {
        const sv = l / 32;
        for (let k = 0; k < 16; k++) shadeLUT[l * 16 + k] = EGA32[ditherIdx((col[3] + (col[0] - col[3]) * sv) * far, (col[4] + (col[1] - col[4]) * sv) * far, (col[5] + (col[2] - col[5]) * sv) * far, k & 3, k >> 2)];
      }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, bk = ((y & 3) << 2) | (x & 3);
        if (dens[i] < 0.5 || pres <= BAYER[bk]) { u32[i] = 0; continue; }
        u32[i] = shadeLUT[((shade[i] * 32 + 0.5) | 0) * 16 + bk];
      }
      c.ctx.putImageData(c.img, 0, 0);
      return true;
    }

    // kind 's' sun / 'm' moon; lvl 2 = clear sky, 1 = veiled behind overcast
    function sunSprite(kind, lvl, frame) {
      const k = kind + lvl + '/' + frame;
      let cv = spriteCache.get(k);
      if (cv) return cv;
      const R = 16; cv = mkCanvas(R * 2 + 1, R * 2 + 1);
      const ctx = cv.getContext('2d'); const img = ctx.createImageData(cv.width, cv.height); const u = new Uint32Array(img.data.buffer);
      for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
        const d = Math.sqrt(x * x + y * y); let c = -1; const b = bay(x + R, y + R);
        if (kind === 's') {
          if (lvl === 2) {
            if (d <= 4.6) c = d < 2.4 ? 15 : (x + y < -2 ? 15 : 14);
            else if (d <= 5.5) c = 6;
            else {
              const a = Math.atan2(y, x) + frame * (Math.PI / 32);
              const ray = Math.abs(Math.sin(a * 4));
              if (d > 7 && d < 10.5 && ray > 0.93) c = d < 9 ? 14 : 6;
            }
          } else {
            if (d <= 4.6) c = d < 3.4 ? 7 : (b < 0.5 ? 7 : 8);
            else if (d <= 7 && b < 0.25) c = 8;
          }
        } else {
          // gibbous moon with a few maria
          if (d <= 4.6) {
            const sx2 = x + 3.0, sy2 = y - 1.0, ds = Math.sqrt(sx2 * sx2 + sy2 * sy2);
            const maria = (x === 1 && y === -2) || (x === 2 && y === -1) || (x === 2 && y === 2) || (x === -1 && y === 1);
            if (ds > 4.3) c = lvl === 2 ? (maria ? 7 : 15) : (maria ? 8 : 7);
            else if (ds > 3.5) c = b < 0.5 ? (lvl === 2 ? 7 : 8) : 0;
          } else if (lvl === 2 && d < 8 && b < 0.18) c = 1;
        }
        if (c >= 0) u[(y + R) * cv.width + x + R] = EGA32[c];
      }
      ctx.putImageData(img, 0, 0);
      spriteCache.set(k, cv);
      return cv;
    }

    function computeRoof(env) {
      roof = new Float32Array(lw).fill(env.protect.solidTop / S);
      for (const p of env.panes) {
        const c0 = Math.max(0, Math.floor(p.x / S)), c1 = Math.min(lw - 1, Math.floor((p.x + p.w) / S));
        for (let c = c0; c <= c1; c++) if (p.y / S < roof[c]) roof[c] = p.y / S;
      }
    }
    function roofBelow(env, x, y) {
      let r = env.protect.solidTop / S; const X = x * S;
      for (const p of env.panes) if (X >= p.x && X <= p.x + p.w && p.y / S > y + 0.5 && p.y / S < r) r = p.y / S;
      return r;
    }
    function paneAtTop(env, x) {
      const X = x * S; let best = null;
      for (const p of env.panes) if (X >= p.x && X <= p.x + p.w && (!best || p.y < best.y)) best = p;
      return best;
    }

    function makeCaps(env) {
      caps = env.panes.map((p) => {
        const c0 = Math.floor(p.x / S), c1 = Math.floor((p.x + p.w - 1) / S), n = c1 - c0 + 1;
        const t0 = p.x + 1.6 * env.cell.size - 2, t1 = t0 + (p.name.length + 0.8) * env.cell.w + 4;
        const block = new Uint8Array(n);
        for (let i = 0; i < n; i++) { const X = (c0 + i) * S; if (X + S > t0 && X < t1) block[i] = 1; }
        const cv = mkCanvas(n, 6);
        const ctx = cv.getContext('2d'); const img = ctx.createImageData(n, 6);
        return { p, c0, n, h: new Float32Array(n), block, cv, ctx, img, u32: new Uint32Array(img.data.buffer), dirty: true, any: false };
      });
    }
    function capFor(x) {
      for (const c of caps) if (x >= c.c0 && x < c.c0 + c.n && Math.abs(c.p.y / S - roof[x]) < 0.6) return c;
      return null;
    }
    function renderCap(c) {
      c.u32.fill(0); let any = false;
      for (let i = 0; i < c.n; i++) {
        const h = Math.floor(c.h[i]); if (h <= 0) continue; any = true;
        for (let k = 0; k < h && k < 6; k++) {
          const y = 5 - k; const top = k === h - 1;
          c.u32[y * c.n + i] = EGA32[top ? (mix.day > 0.5 ? 15 : 7) : (mix.day > 0.5 ? 7 : 8)];
        }
      }
      c.ctx.putImageData(c.img, 0, 0); c.dirty = false; c.any = any;
    }

    // returns true when the flake died (landed)
    function moveFlake(i, dt) {
      sy[i] += sv[i] * dt; sph[i] += dt * (1.2 + sv[i] * 0.05);
      const xx = Math.round(sx[i] + Math.sin(sph[i]) * 2.2 - time * 2), x = ((xx % lw) + lw) % lw;
      sxi[i] = x;
      if (sy[i] < sstop[i]) return false;
      const cap = !sfar[i] && capFor(x);
      if (cap) {
        const j = x - cap.c0;
        if (!cap.block[j]) {
          cap.h[j] = Math.min(5, cap.h[j] + 0.5); cap.dirty = true;
          for (let d = -1; d <= 1; d += 2) { const k = j + d; if (k >= 0 && k < cap.n && !cap.block[k] && cap.h[j] - cap.h[k] > 1.5) { cap.h[j] -= 0.5; cap.h[k] += 0.5; } }
        }
      }
      salive[i] = 0;
      return true;
    }
    function bandSnow(tdt) {
      const snowN = Math.floor(mix.snow * SMAX);
      let alive = 0;
      for (let i = 0; i < SMAX; i++) alive += salive[i];
      for (let i = 0; i < SMAX; i++) {
        if (!salive[i]) {
          if (alive >= snowN || Math.random() > 0.25) continue;
          alive++;
          salive[i] = 1; sx[i] = Math.random() * lw; sy[i] = -Math.random() * 4; sfar[i] = Math.random() < 0.45 ? 1 : 0; sv[i] = sfar[i] ? 5 + Math.random() * 4 : 9 + Math.random() * 7; sph[i] = Math.random() * 6.28;
          sstop[i] = roof[sx[i] | 0];
        }
        if (sy[i] <= hy && tdt > 0) {
          const ox0 = sxi[i], oy0 = sy[i] | 0;
          moveFlake(i, tdt);
          if (sy[i] > hy + 1) salive[i] = 0;
          const ny = sy[i] | 0, nx = sxi[i];
          dirty(Math.min(ox0, nx), Math.min(oy0, ny), Math.abs(nx - ox0) + 1, Math.abs(ny - oy0) + 1);
        }
      }
    }

    const DRM = 160, dr4 = new Int16Array(4 * DRM); let dn = 0;
    function dirty(x, y, w, h) { if (dn >= DRM) { dn = 999; return; } const o = dn * 4; dr4[o] = x; dr4[o + 1] = y; dr4[o + 2] = w; dr4[o + 3] = h; dn++; }
    function stampBand(env, full) {
      const g = env.back;
      g.imageSmoothingEnabled = false;
      if (full || dn > DRM) {
        g.clearRect(0, 0, env.W, (hy + 1) * S);
        g.drawImage(low, 0, 0, lw, hy + 1, 0, 0, lw * S, (hy + 1) * S);
      } else {
        // only the rectangles that changed since the last band stamp
        for (let k = 0; k < dn; k++) {
          const o = k * 4; let x = dr4[o], y = dr4[o + 1], w = dr4[o + 2], h = dr4[o + 3];
          if (x < 0) { w += x; x = 0; } if (y < 0) { h += y; y = 0; }
          if (x + w > lw) w = lw - x; if (y + h > hy + 1) h = hy + 1 - y;
          if (w <= 0 || h <= 0) continue;
          g.clearRect(x * S, y * S, w * S, h * S);
          g.drawImage(low, x, y, w, h, x * S, y * S, w * S, h * S);
        }
      }
      dn = 0;
    }
    function spawnPart(x, y, vx, vy, life, col) {
      for (let i = 0; i < PMAX; i++) if (plife[i] <= 0) { px[i] = x; py[i] = y; pvx[i] = vx; pvy[i] = vy; plife[i] = life; pcol[i] = col; return; }
    }

    function makeBolt(env, fromX) {
      const x0 = fromX != null ? fromX : (env.protect.left / S + 20 + Math.random() * (lw * 0.55));
      const y0 = Math.max(3, hy * (0.25 + Math.random() * 0.25));
      // target: prefer a pane roof (the panes catch the strike) or the land
      let tx, ty, hitPane = null;
      if (Math.random() < 0.55 && env.panes.length) {
        const p = env.panes[(Math.random() * env.panes.length) | 0];
        tx = (p.x + p.w * (0.2 + Math.random() * 0.6)) / S; ty = roof[Math.min(lw - 1, Math.max(0, tx | 0))]; hitPane = paneAtTop(env, tx | 0);
      } else { tx = x0 + (Math.random() - 0.5) * 50; ty = hy + 2 + Math.random() * 6; }
      const pts = [[x0, y0], [tx, ty]];
      const subdiv = (arr, disp) => {
        const out = [arr[0]];
        for (let i = 1; i < arr.length; i++) {
          const a = arr[i - 1], b = arr[i];
          out.push([(a[0] + b[0]) / 2 + (Math.random() - 0.5) * disp, (a[1] + b[1]) / 2 + (Math.random() - 0.5) * disp * 0.25], b);
        }
        return out;
      };
      let path = pts, disp = Math.abs(ty - y0) * 0.45 + 10;
      for (let k = 0; k < 6; k++) { path = subdiv(path, disp); disp *= 0.55; }
      const raster = (path) => {
        const px = [];
        for (let i = 1; i < path.length; i++) {
          let x0 = Math.round(path[i - 1][0]), y0 = Math.round(path[i - 1][1]); const x1 = Math.round(path[i][0]), y1 = Math.round(path[i][1]);
          const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
          for (;;) { px.push(x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
        }
        return px;
      };
      const main = raster(path);
      const branches = [];
      const nb = 2 + ((Math.random() * 3) | 0);
      for (let k = 0; k < nb; k++) {
        const i = 4 + ((Math.random() * (path.length * 0.6)) | 0); const a = path[Math.min(path.length - 2, i)];
        const len = 8 + Math.random() * 22, ang = Math.PI / 2 + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.6);
        let bp = [a, [a[0] + Math.cos(ang) * len, a[1] + Math.sin(ang) * len]], d = len * 0.5;
        for (let s = 0; s < 4; s++) { bp = subdiv(bp, d); d *= 0.55; }
        branches.push({ px: raster(bp), at: i / path.length });
      }
      bolt = { main, branches, t: 0, hitPane, tx, ty, sparked: false };
      flash = 1;
    }

    // advance the strike; returns a signature that changes when the picture does
    function stepBolt(dt) {
      if (!bolt) { flash = 0; return 0; }
      bolt.t += dt; const t = bolt.t;
      if (t > 0.75) { bolt = null; flash = 0; return 1; }
      bolt.grow = clamp01(t / 0.13);
      // flicker envelope: on, brief off, on, decay
      bolt.on = t < 0.26 || (t > 0.33 && t < 0.5) || (t > 0.56 && t < 0.62);
      bolt.late = t > 0.5;
      flash = bolt.on ? (t < 0.2 ? 1 : 0.6) : 0;
      return 2 + (bolt.on ? 4 : 0) + (bolt.late ? 8 : 0) + Math.round(bolt.grow * 3) * 16;
    }
    function drawBolt(g) {
      if (!bolt.on) return;
      const grow = bolt.grow, late = bolt.late;
      const n = Math.floor(bolt.main.length / 2 * grow);
      const m = bolt.main;
      g.beginPath();
      for (const br of bolt.branches) {
        if (grow < br.at) continue;
        const k = Math.floor(br.px.length / 2 * clamp01((grow - br.at) / (1 - br.at + 0.01) * 1.4));
        for (let i = 0; i < k; i++) g.rect(br.px[i * 2] * S, br.px[i * 2 + 1] * S, S, S);
      }
      g.fillStyle = EGACSS[late ? 1 : 9]; g.fill();
      if (!late) { g.beginPath(); for (let i = 0; i < n; i++) g.rect(m[i * 2] * S + S, m[i * 2 + 1] * S, S, S); g.fillStyle = EGACSS[11]; g.fill(); }
      g.beginPath();
      for (let i = 0; i < n; i++) g.rect(m[i * 2] * S, m[i * 2 + 1] * S, S, S);
      g.fillStyle = EGACSS[late ? 9 : 15]; g.fill();
      if (grow >= 1 && !bolt.sparked) {
        bolt.sparked = true;
        if (bolt.hitPane) for (let k = 0; k < 18; k++) spawnPart(bolt.tx, bolt.ty - 0.5, (Math.random() - 0.5) * 50, -10 - Math.random() * 40, 0.25 + Math.random() * 0.45, [15, 14, 11, 14, 12][k % 5]);
      }
    }

    return {
      id: 'retro-demo', title: 'Demoscen', family: 'Retro',
      note: 'Vädret som ett kärleksfullt gjort demo från 1992: EGA-palett, Bayer-dither och pixelmoln över bergen – prova solnedgång, ösregn med blixt och snö som lägger sig på panelerna.',
      preset: { weather: '~', fog: '', light: '*' },
      fps: 15,
      manualClear: true,
      init(env) { needFull = true; frontDirty = true; if (!LA) buildLUT(); mix = newMix(env.state); time = 0; bolt = null; flash = 0; glowPulse = 0; },
      resize(env) {
        lw = Math.ceil(env.W / S); lh = Math.ceil(env.H / S);
        hy = Math.max(10, Math.floor(skyBottomOf(env) / S));
        fadeRow = Math.min(lh, Math.ceil(env.protect.solidTop / S));
        low = mkCanvas(lw, hy + 1); lc = low.getContext('2d');
        sky = mkCanvas(lw, hy); skyC = sky.getContext('2d'); skyImg = skyC.createImageData(lw, hy); skyU32 = new Uint32Array(skyImg.data.buffer); skyKey = '';
        // mountains (two ranges) along the horizon
        const mh = mtnH0; mtnCache.clear(); mtn = mkCanvas(lw, mh); mtnC = mtn.getContext('2d'); mtnImg = mtnC.createImageData(lw, mh); mtnU32 = new Uint32Array(mtnImg.data.buffer); mtnKey = -1;
        mtnFar = mkCanvas(lw, mh); farC = mtnFar.getContext('2d'); farImg = farC.createImageData(lw, mh); farU32 = new Uint32Array(farImg.data.buffer);
        mtnH = new Float32Array(lw); mtnH2 = new Float32Array(lw);
        for (let x = 0; x < lw; x++) {
          const n1 = env.noise(x * 0.045, 3.1), n2 = env.noise(x * 0.11, 7.7), n3 = env.noise(x * 0.3, 1.3);
          mtnH[x] = Math.max(1, 2 + Math.pow(n1, 1.6) * 13 + n2 * 3 + n3 * 1.2);
          const f1 = env.noise(x * 0.028 + 40, 9.2), f2 = env.noise(x * 0.09 + 40, 2.2);
          mtnH2[x] = Math.max(1, 5 + Math.pow(f1, 1.3) * 15 + f2 * 3);
        }
        // fog field: horizontally tileable noise, gathered in drifting bands
        fog = mkCanvas(lw, lh); fogC = fog.getContext('2d'); fogImg = fogC.createImageData(lw, lh); fogU32 = new Uint32Array(fogImg.data.buffer);
        fogField = new Float32Array(lw * lh);
        const bands = [[hy + (fadeRow - hy) * 0.58, 6, 1]];
        fogSpans = [];
        let spanStart = -1;
        for (let y = 0; y < fadeRow; y++) {
          let prof = 0;
          for (const [c, hw, wgt] of bands) { const d = (y - c) / hw; prof = Math.max(prof, Math.exp(-d * d) * wgt); }
          if (prof < 0.08) prof = 0;
          if (prof > 0 && spanStart < 0) spanStart = y;
          if (prof === 0 && spanStart >= 0) { fogSpans.push(spanStart, y); spanStart = -1; }
          if (!prof) continue;
          for (let x = 0; x < lw; x++) {
            const u = x / lw;
            const f = (xx) => env.fbm(xx * 0.035, y * 0.16) * 0.8 + env.noise(xx * 0.1 + 50, y * 0.3) * 0.2;
            const v = lerp(f(x), f(x - lw), u);
            fogField[y * lw + x] = clamp01((v - 0.3) * 2.2) * prof;
          }
        }
        if (spanStart >= 0) fogSpans.push(spanStart, fadeRow);
        // band mist: hugs the valleys between the two mountain ranges
        bfog = mkCanvas(lw, hy + 1); bfogC = bfog.getContext('2d'); bfogImg = bfogC.createImageData(lw, hy + 1); bfogU32 = new Uint32Array(bfogImg.data.buffer);
        bfogField = new Float32Array(lw * (hy + 1)); bfogRow0 = 0;
        for (let y = 0; y <= hy; y++) {
          const d1 = (y - (hy - 4)) / 4.5, d2 = (y - (hy - 13)) / 3.5;
          const prof = Math.max(Math.exp(-d1 * d1), 0.7 * Math.exp(-d2 * d2));
          if (prof < 0.05) { if (y < hy - 10) bfogRow0 = y + 1; continue; }
          for (let x = 0; x < lw; x++) {
            const u = x / lw;
            const f = (xx) => env.fbm(xx * 0.05, y * 0.3 + 9) * 0.85 + env.noise(xx * 0.15 + 20, y * 0.5) * 0.15;
            (bfogField[y * lw + x] = clamp01((lerp(f(x), f(x - lw), u) - 0.28) * 2.0) * prof);
          }
        }
        fogKey = '';
        // text mask: keep anything under text dim
        textMask = new Uint8Array(lw * lh);
        for (const l of env.lines) {
          const x0 = Math.max(0, Math.floor(l.x / S) - 1), x1 = Math.min(lw - 1, Math.ceil((l.x + l.w) / S)), y0 = Math.max(0, Math.floor(l.y / S)), y1 = Math.min(lh - 1, Math.ceil((l.y + l.h) / S));
          for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) textMask[y * lw + x] = 1;
        }
        // distant rain shafts: dashed columns, scrolled down at tick rate
        const mkShaft = (step, c2) => {
          const cv = mkCanvas(64, hy + 12), x2 = cv.getContext('2d'); const img = x2.createImageData(64, hy + 12), u = new Uint32Array(img.data.buffer);
          for (let x = 0; x < 64; x += step) { const ph = (x * 5) % 8; for (let y = 0; y < hy + 12; y++) if (((y + ph) & 7) < 3) u[y * 64 + x + ((y >> 3) & 1 ? 0 : 0)] = EGA32[((y + ph) & 7) === 2 ? c2 : 1]; }
          x2.putImageData(img, 0, 0); return cv;
        };
        shaftL = mkShaft(4, 1); shaftH = mkShaft(2, 9);
        // rain / snow sheets: 256px tiles of chunky streaks, wrapped seamlessly
        const mkSheet = (n, l0, l1, slant, tail, head, snow) => {
          const T = 256, cv = mkCanvas(T, T), x2 = cv.getContext('2d');
          seed = 31 + n * 7 + l0;
          for (let k = 0; k < n; k++) {
            const cx = ((srnd() * T / S) | 0) * S, cy = ((srnd() * T / S) | 0) * S, L = l0 + ((srnd() * (l1 - l0 + 1)) | 0);
            if (snow) { x2.fillStyle = EGACSS[srnd() < 0.3 ? head : tail]; x2.fillRect(cx, cy, S, S); continue; }
            for (let j = 0; j < L; j++) {
              const px = ((cx - Math.floor(j * slant) * S) % T + T) % T, py = ((cy - j * S) % T + T) % T;
              x2.fillStyle = EGACSS[j === 0 ? head : tail]; x2.fillRect(px, py, S, S);
            }
          }
          return env.back.createPattern(cv, 'repeat');
        };
        rainSheets = [];
        for (const [t, h] of [[1, 9], [8, 6]]) rainSheets.push(mkSheet(9, 3, 5, 0.12, t, t, false), mkSheet(8, 5, 8, 0.16, t, h, false), mkSheet(10, 8, 12, 0.3, t, h, false));
        snowSheets = [mkSheet(13, 1, 1, 0, 7, 8, true), mkSheet(8, 1, 1, 0, 15, 7, true)];
        rainRight = env.W;
        for (const p of env.panes) if (p.y < (hy + 1) * S) rainRight = Math.min(rainRight, p.x);
        computeRoof(env);
        makeCaps(env);
        makeClouds();
        stars.length = 0; seed = 99;
        for (let i = 0; i < 70; i++) {
          const x = (srnd() * lw) | 0, y = (srnd() * hy * 0.85) | 0;
          stars.push({ x, y, thr: srnd(), tw: srnd(), big: srnd() < 0.08 });
        }
        sunPos = { x: Math.round(Math.min(lw * 0.42, (env.panes.length ? Math.min(...env.panes.map((p) => p.x)) / S : lw) - 40)), y: Math.round(hy * 0.42) };
        ralive.fill(0); salive.fill(0); plife.fill(0); needFull = true; frontDirty = true;
        spriteCache.clear();
        // pre-warm everything a first frame would otherwise build
        skyKey = ''; mtnKey = -1;
        { const m0 = mix; for (const d of [0, 1]) for (const o of [0, 1]) { mix = Object.assign({}, m0, { day: d, over: o, snow: 0 }); buildMountains(); } mix = m0; mtnKey = -1; }
        buildSky(env); buildMountains(); buildFog(true);
        const col = cloudColours(), ck = colourKey(col);
        for (const c of clouds) renderCloud(c, col, ck, Math.round(c.pres * 16));
        for (let f = 0; f < 16; f++) sunSprite('s', 2, f);
        sunSprite('s', 1, 0); sunSprite('m', 1, 0); sunSprite('m', 2, 0);
        // let the JIT see the frame path once before the meter does
        for (let k = 0; k < 6; k++) { tickAcc = 1; this.frame(env, 0.001, 0); }
        tickAcc = 0; needFull = true; frontDirty = true;
      },
      onState(env, key, v, prev) {
        if (key === 'light' && (v === '*') !== (prev === '*')) { glowSign = 1; }
      },
      onEvent(env, name) {
        if (name === 'strike') makeBolt(env);
        if (name === 'sun.rise' || name === 'sun.set') glowSign = 1;
      },
      frame(env, dt, t) {
        frameNo++; time += dt;
        stepMix(mix, env.state, dt, 1.6);
        // sunrise/sunset glow follows the day transition, peaking mid-way
        const dayMid = 4 * mix.day * (1 - mix.day);
        if (glowSign) { glowPulse = Math.max(glowPulse, dayMid * 1.6); if (dayMid < 0.02 && (mix.day === 0 || mix.day === 1)) glowSign = 0; }
        glowPulse = Math.max(dayMid * 1.4, glowPulse - dt * 0.25);
        if (!glowSign && dayMid < 0.02) glowPulse = Math.max(0, glowPulse - dt * 0.5);
        const bs = stepBolt(dt), boltChanged = bs !== lastBoltSig; lastBoltSig = bs;
        if (mix.heavy > 0.7 && !bolt) { nextStrike -= dt; if (nextStrike <= 0) { makeBolt(env); nextStrike = 7 + Math.random() * 14; } }

        // Calm skies redraw the band at ~6 Hz (chunky 1992 stepping); anything
        // moving every frame (rain, snow, fog, a strike) forces a full redraw.
        const g = env.back;
        let rainAlive = 0, snowAlive = 0;
        for (let i = 0; i < RMAX; i++) rainAlive += ralive[i];
        for (let i = 0; i < SMAX; i++) snowAlive += salive[i];
        tickAcc += dt;
        if (mix.fog > 0.01) fogScroll = (fogScroll + dt * 2.2) % (lw * 10);
        const tick = tickAcc >= 0.3 && prepStage === 0; let tdt = 0; if (tick) { tdt = tickAcc; tickAcc = 0; shaftPhase++; prepDt += tdt; }
                // clouds always advance; their drawn position is quantised
        for (let i = 0; i < clouds.length; i++) {
          const c = clouds[i];
          const want = c.rank < mix.cover ? 1 : 0;
          c.pres += (want - c.pres) * (1 - Math.exp(-dt / 1.3));
          if (Math.abs(want - c.pres) < 0.02) c.pres = want;
          c.x -= c.speed * (1 + mix.heavy * 1.5) * dt;
          if (c.x < -c.w) c.x += lw + c.w;
        }
        // the band holds the distant landscape; near rain lives below it.
        // A tick prepares the band (palette, sprites, flakes); the next frame
        // composes and stamps it, so no single frame carries both costs.
        const lowerDyn = rainAlive > 0 || mix.rain > 0.005 || snowAlive > 0 || mix.snow > 0.005 || !!bolt || mix.fog > 0.55;
        if (lowerDyn || lowerDirty || needFull) { g.clearRect(0, (hy + 1) * S, env.W, env.H); lowerDirty = lowerDyn; }
        // band preparation is spread over a few frames, one heavy job each
        justPrepped = false;
        if ((tick && prepStage === 0) || needFull) prepStage = 1;
        if (prepStage === 1 || needFull) { const sk = skyKey; buildSky(env); if (sk !== skyKey) fullPending = true; prepStage = 2; }
        else if (prepStage === 2) { const mk = mtnKey; buildMountains(); if (mk !== mtnKey) fullPending = true; prepStage = 3; }
        else if (prepStage === 3 || prepStage === 4) {
          const col = cloudColours(), ck = colourKey(col);
          for (let i = 0; i < clouds.length; i++) {
            const c = clouds[(i + bandNo) % clouds.length];
            if (c.pres >= 0.03 && renderCloud(c, col, ck, Math.round(c.pres * 16))) { fullPending = true; break; }
          }
          bandNo++;
          if (prepStage === 4) {
            if (mix.snow > 0.005 || snowAlive) bandSnow(prepDt);
            if (mix.fog > 0.01 && (bandNo & 7) < 2) fullPending = true;
            if (glowPulse > 0 || (mix.day > 0 && mix.day < 1) || (mix.moon > 0 && mix.moon < 1)) fullPending = true;
            pendingBand = true; prepStage = 0; prepDt = 0; justPrepped = true;
          } else prepStage = 4;
        }
        if (needFull) { buildMountains(); pendingBand = true; prepStage = 0; }
        if (stampPending && !boltChanged) { stampBand(env, stampFull); stampPending = false; stampFull = false; }
        const immediate = needFull;
        const redrawBand = boltChanged || needFull || (pendingBand && prepStage === 0 && !justPrepped);
        let fullBand = needFull || boltChanged || fullPending;
        needFull = false;
        if (redrawBand) {
          pendingBand = false; fullPending = false;
          if (boltChanged) buildSky(env);
          lc.clearRect(0, 0, lw, hy + 1);
          lc.drawImage(sky, 0, 0);
          // stars
          const night = (1 - mix.day) * (1 - mix.over * 0.92) * (1 - mix.fog * 0.6);
          if (night > 0.02) {
            for (let si = 0; si < 3; si++) {
              lc.beginPath();
              for (const s of stars) {
                if (s.thr > night * (mix.moon > 0.5 ? 0.7 : 1)) continue;
                if (si === 0 && Math.random() < 0.08) { s.tw = Math.random(); dirty(s.x - 1, s.y - 1, 3, 3); }
                const c = s.tw > 0.85 ? 0 : s.tw > 0.3 ? 1 : 2;
                if (c === si) lc.rect(s.x, s.y, 1, 1);
                if (si === 2 && s.big && s.tw > 0.85) { lc.rect(s.x - 1, s.y, 1, 1); lc.rect(s.x + 1, s.y, 1, 1); lc.rect(s.x, s.y - 1, 1, 1); lc.rect(s.x, s.y + 1, 1, 1); }
              }
              lc.fillStyle = EGACSS[si === 0 ? 15 : si === 1 ? 7 : 8]; lc.fill();
            }
          }
          // sun and moon rise/set behind the mountains
          const lvl = mix.over + mix.fog * 0.5 > 0.5 ? 1 : 2;
          if (mix.day > 0.01) {
            const spr = sunSprite('s', lvl, lvl === 2 ? Math.floor(time * 3) % 16 : 0);
            const y = Math.round(sunPos.y + (1 - mix.day) * (hy - sunPos.y + 6));
            const vis = Math.min(33, hy - (y - 16));
            if (vis > 0) { lc.drawImage(spr, 0, 0, 33, vis, sunPos.x - 16, y - 16, 33, vis); if (lvl === 2) dirty(sunPos.x - 16, y - 16, 33, vis); }
          }
          if (mix.moon > 0.01) {
            const spr = sunSprite('m', lvl, 0);
            const y = Math.round(sunPos.y - 3 + (1 - mix.moon) * (hy - sunPos.y + 9));
            const vis = Math.min(33, hy - (y - 16));
            if (vis > 0) lc.drawImage(spr, 0, 0, 33, vis, sunPos.x + 26 - 16, y - 16, 33, vis);
          }
          // clouds: far layer, mountains, near layer
          for (let i = 0; i < clouds.length; i++) {
            const c = clouds[i];
            if (i === 4) {
              lc.drawImage(mtnFar, 0, hy - mtn.height);
              if (mix.fog > 0.01) { const o = Math.floor(fogScroll * 1.6) % lw; lc.drawImage(bfog, o, 0); lc.drawImage(bfog, o - lw, 0); }
              lc.drawImage(mtn, 0, hy - mtn.height);
            }
            if (c.pres < 0.03) { if (c.lx !== -9999) { fullBand = true; c.lx = -9999; } continue; }
            if (c.key < 0) renderCloud(c, cloudColours(), -2, Math.round(c.pres * 16));
            const y = Math.round(c.yRel * (hy - c.h - 4)), x = Math.round(c.x);
            const raining = !c.far && mix.rain > 0.05;
            if (x !== c.lx || raining) {
              const x0 = Math.min(x, c.lx), x1 = Math.max(x, c.lx) + c.w + 2, y1 = raining ? hy + 1 : y + c.h;
              dirty(x0 - 2, y, x1 - x0 + 2, y1 - y);
              if (x0 < 0 || x1 > lw) dirty(x0 + lw + c.w - 2, y, x1 - x0 + 2, y1 - y);
              if (c.x + c.w > lw || c.lx + c.w > lw) dirty(x0 - lw - c.w - 2, y, x1 - x0 + 2, y1 - y);
              c.lx = x;
            }
            if (!c.far && mix.rain > 0.05) {
              const sh = mix.heavy > 0.5 ? shaftH : shaftL, top = y + c.h - 3, hh = hy + 1 - top, oy = (shaftPhase * 3) % 8;
              for (let sx0 = x + 4; sx0 < x + c.w - 4; sx0 += 64) { const ww = Math.min(64, x + c.w - 4 - sx0); if (hh > 0 && ww > 0) lc.drawImage(sh, 0, 8 - oy, ww, hh, sx0 - Math.round((hy - top) * 0.15 * mix.heavy), top, ww, hh); }
            }
            lc.drawImage(c.cv, x, y);
            if (c.x + c.w > lw) lc.drawImage(c.cv, x - lw - c.w, y);
          }
          if (mix.snow > 0.005 || snowAlive) {
            for (let pass = 0; pass < 2; pass++) {
              lc.beginPath();
              for (let i = 0; i < SMAX; i++) if (salive[i] && sy[i] <= hy && sy[i] >= 0 && sfar[i] === pass) lc.rect(sxi[i], sy[i] | 0, 1, 1);
              lc.fillStyle = EGACSS[pass ? 7 : 15]; lc.fill();
            }
          }
          if (mix.fog > 0.6) { const o = Math.floor(lw - (fogScroll * 2.3) % lw); lc.globalAlpha = 1; lc.drawImage(bfog, o, -3); lc.drawImage(bfog, o - lw, -3); }
          if (boltChanged || immediate) stampBand(env, fullBand); else { stampPending = true; stampFull = stampFull || fullBand; }
        }
        if (++fogTick % 3 === 0 || fogKey === '') buildFog(false);
        // fog banks drift sideways, drawn only where bands exist
        if (mix.fog > 0.55 && lowerDyn) {
          const o = Math.floor(fogScroll) % lw;
          for (let k = 0; k < fogSpans.length; k += 2) {
            const y0 = fogSpans[k], hh = fogSpans[k + 1] - y0;
            g.drawImage(fog, 0, y0, lw - o, hh, o * S, y0 * S, (lw - o) * S, hh * S);
            if (o > 0) g.drawImage(fog, lw - o, y0, o, hh, 0, y0 * S, o * S, hh * S);
          }
        }
        if (bolt) drawBolt(g);
        // rain and snow below the horizon: pre-drawn sheets of chunky streaks and
        // flakes scrolled as patterns (the classic parallax trick), in the open
        // area left of the panes; the panes shelter what is under them
        const y0 = (hy + 1) * S, hh = env.protect.solidTop - y0;
        const torch = mix.torch > 0.5;
        if (hh > 0) {
          const lay = (pat, vx, vy, k) => {
            sheetOff[k * 2] = (sheetOff[k * 2] + vx * dt) % 256; sheetOff[k * 2 + 1] = (sheetOff[k * 2 + 1] + vy * dt) % 256;
            const ox = Math.round(sheetOff[k * 2] / S) * S, oy = Math.round(sheetOff[k * 2 + 1] / S) * S;
            g.save(); g.translate(ox, oy); g.fillStyle = pat; g.fillRect(-ox, y0 - oy, rainRight, hh); g.restore();
          };
          const set = torch ? 1 : 0;
          if (mix.rain > 0.04) lay(rainSheets[set * 3], -20 - 40 * mix.heavy, 190, 0);
          if (mix.rain > 0.3) lay(rainSheets[set * 3 + 1], -30 - 60 * mix.heavy, 270, 1);
          if (mix.heavy > 0.5) lay(rainSheets[set * 3 + 2], -110, 360, 2);
          if (mix.snow > 0.04) {
            const sw = Math.sin(time * 0.7) * 10;
            lay(snowSheets[0], (Math.sin(time * 0.9) * 14 - 6), 34, 3);
            if (mix.snow > 0.4) lay(snowSheets[1], (Math.cos(time * 0.7) * 22 - 10) + sw, 58, 4);
            // flakes that reach a pane ledge add to its drift
            for (let k = 0; k < 2; k++) if (Math.random() < mix.snow * 0.9) {
              const cap = caps[(Math.random() * caps.length) | 0];
              if (cap && Math.abs(cap.p.y / S - roof[Math.min(lw - 1, cap.c0 + 1)]) < 0.6) {
                const j = (Math.random() * cap.n) | 0;
                if (!cap.block[j]) { cap.h[j] = Math.min(5, cap.h[j] + 0.5); cap.dirty = true; for (let d = -1; d <= 1; d += 2) { const q = j + d; if (q >= 0 && q < cap.n && !cap.block[q] && cap.h[j] - cap.h[q] > 1.5) { cap.h[j] -= 0.5; cap.h[q] += 0.5; } } }
              }
            }
          }
        }
        // drip particles (from pane bottoms) as short streaks
        g.beginPath();
        for (let i = 0; i < RMAX; i++) {
          if (!ralive[i]) continue;
          ry[i] += rv[i] * dt; rv[i] += 60 * dt;
          if (ry[i] >= rstop[i]) { ralive[i] = 0; continue; }
          const y = ry[i] | 0, xi = rx[i] | 0;
          g.rect(xi * S, (y - 1) * S, S, 2 * S);
        }
        g.fillStyle = EGACSS[torch ? 6 : 9]; g.fill();
        // drips from pane bottoms when it rains
        if (mix.rain > 0.2 && Math.random() < mix.rain * 0.5) {
          const p = env.panes[(Math.random() * env.panes.length) | 0];
          const x = (p.x + 6 + Math.random() * (p.w - 12)) / S, y = (p.y + p.h) / S;
          for (let i = 0; i < RMAX; i++) if (!ralive[i]) { ralive[i] = 1; rx[i] = x; ry[i] = y + 1; rv[i] = 30; rl[i] = 2; rstop[i] = roofBelow(env, x, y); break; }
        }
        // FRONT: snow caps on pane ledges, splashes, sparks
        const f = env.front; f.imageSmoothingEnabled = false;
        const melting = mix.snow < 0.3;
        let partAlive = 0;
        for (let i = 0; i < PMAX; i++) if (plife[i] > 0) partAlive++;
        let capChanged = false;
        for (const c of caps) {
          if (melting && c.any && Math.random() < 0.5) { const j = (Math.random() * c.n) | 0; if (c.h[j] > 0) { c.h[j] = Math.max(0, c.h[j] - 1); c.dirty = true; } }
          if (c.dirty && tick) { renderCap(c); capChanged = true; }
        }
        if (!(partAlive || capChanged || frontDirty)) return;
        f.clearRect(0, 0, env.W, env.H);
        frontDirty = partAlive > 0;
        for (const c of caps) if (c.any) f.drawImage(c.cv, c.c0 * S, c.p.y + c.p.border - 6 * S, c.n * S, 6 * S);
        for (let i = 0; i < PMAX; i++) {
          if (plife[i] <= 0) continue;
          plife[i] -= dt; pvy[i] += 140 * dt; px[i] += pvx[i] * dt; py[i] += pvy[i] * dt;
          f.fillStyle = EGACSS[pcol[i]]; f.fillRect(Math.round(px[i]) * S, Math.round(py[i]) * S, S, S);
        }
      },
      destroy() {},
    };
  })();
  WX.register(demo);

  // ================================================================ FOSFOR
  // A monochrome CRT: weather as glyphs on the text grid, phosphor burn-in
  // (the layer is faded, never cleared), scanlines only inside the layer.
  const fosfor = (() => {
    const CLOUDS = [
      ['   .--.', ' .(    ).', '(___.__)_)'],
      ['      _  _', '    ( `   )_', '   (    )    `)', ' (_   (_ .  _) _)'],
      ['        .-~~-.', '  .-~~-(      )-.', ' (                )', '  `-.__.-~~-.__.-\''],
      ['      .--.', '   .-(    )--.', '  (   .  .    )', '   `--\'`--\'--\''],
      ['   .-~-.', '  (     )_', ' (_ __ ___)'],
    ];
    const SUN = ['    \\  |  /', "  '. .---. .'", ' -- (     ) --', "  .' '---' '.", '    /  |  \\'];
    const MOON = ['  .-"-.', ' /  o  \\', '|  o  . |', ' \\  .  /', "  '-.-'"];
    let cw = 8, ch = 16, ox = 0, oy = 0, nc = 0, nr = 0, hr = 0, firstTextRow = 0, font = '';
    let mix, frameNo = 0, time = 0;
    let fade, fadeFront, textCell, roofRow, ridge = null, ridgeRows = 3;
    const sprites = new Map();
    let clouds = [], stars = [];
    // drops
    const DMAX = 260;
    const dc = new Float32Array(DMAX), dr = new Float32Array(DMAX), dv = new Float32Array(DMAX), dalive = new Uint8Array(DMAX), dkind = new Uint8Array(DMAX), dstop = new Int16Array(DMAX), dph = new Float32Array(DMAX);
    const qx = new Float32Array(DMAX), qy = new Float32Array(DMAX), qk = new Uint8Array(DMAX), qd = new Uint8Array(DMAX); let qn = 0;
    const SPL = 80; const spc = new Float32Array(SPL), spr = new Float32Array(SPL), splife = new Float32Array(SPL), spch = new Uint8Array(SPL);
    let caps = [];
    let bolt = null, nextStrike = 6, flick = 0, fogOff = 0, lowerDirty = 0, frontDirty = 0;
    let sinceScene = 0, sceneClock = 0, sceneStep = 0, sceneKey = -1, sceneDirty = true, needScene = true, scan = null;
    let phos = [80, 255, 130];

    const colX = (c) => ox + c * cw, rowY = (r) => oy + r * ch;
    const rgb = (a) => `rgba(${phos[0]},${phos[1]},${phos[2]},${a})`;
    let rgbCore = '', rgbDim = '', rgbHalo = '';
    function setPhos(p) { phos = p; rgbCore = rgb(0.95); rgbDim = rgb(0.32); rgbHalo = rgb(0.2); }

    // one glyph sprite with baked bloom; keyed by text + phosphor colour
    function glyphSprite(text, bright) {
      const key = text + '|' + phos.join() + '|' + (bright ? 1 : 0);
      let cv = sprites.get(key);
      if (cv) return cv;
      const pad = 6;
      cv = mkCanvas(Math.ceil(text.length * cw) + pad * 2, Math.ceil(ch) + pad * 2);
      const g = cv.getContext('2d');
      g.font = font; g.textBaseline = 'middle';
      g.shadowColor = rgb(0.9); g.shadowBlur = bright ? 7 : 4;
      g.fillStyle = bright ? `rgb(${Math.min(255, phos[0] + 120)},255,${Math.min(255, phos[2] + 90)})` : rgb(1);
      for (let i = 0; i < text.length; i++) if (text[i] !== ' ') g.fillText(text[i], pad + i * cw, pad + ch / 2 + 1);
      g.shadowBlur = 0; g.globalAlpha = 0.6;
      for (let i = 0; i < text.length; i++) if (text[i] !== ' ') g.fillText(text[i], pad + i * cw, pad + ch / 2 + 1);
      sprites.set(key, cv);
      return cv;
    }
    // multi-line art; shade fills the interior of clouds ('░' rain, '▒' storm)
    function artSprite(lines, shade) {
      const memo = lines._memo || (lines._memo = {});
      const mk = shade + (phos[0] | 0);
      if (memo[mk] && sprites.has(memo[mk].k)) return memo[mk].cv;
      const key = lines.join('\n') + '|' + shade + '|' + phos.join();
      if (sprites.has(key)) { memo[mk] = { k: key, cv: sprites.get(key) }; return memo[mk].cv; }
      let cv = sprites.get(key);
      if (cv) return cv;
      const pad = 6, w = Math.max(...lines.map((l) => l.length));
      cv = mkCanvas(Math.ceil(w * cw) + pad * 2, Math.ceil(lines.length * ch) + pad * 2);
      const g = cv.getContext('2d');
      g.font = font; g.textBaseline = 'middle';
      const draw = () => lines.forEach((l, r) => {
        for (let i = 0; i < l.length; i++) if (l[i] !== ' ') g.fillText(l[i], pad + i * cw, pad + r * ch + ch / 2 + 1);
      });
      if (shade) {
        g.fillStyle = rgb(0.32);
        lines.forEach((l, r) => {
          const a = l.search(/\S/), b = l.length - 1 - [...l].reverse().join('').search(/\S/);
          for (let i = a + 1; i < b; i++) if (l[i] === ' ' && r > 0) g.fillText(shade, pad + i * cw, pad + r * ch + ch / 2 + 1);
        });
      }
      g.shadowColor = rgb(0.9); g.shadowBlur = 5; g.fillStyle = rgb(1); draw();
      g.shadowBlur = 0; g.globalAlpha = 0.55; draw();
      sprites.set(key, cv);
      return cv;
    }

    function makeRidge(env) {
      // ASCII mountains: heights 0..2 per column
      const h = new Int8Array(nc + 1);
      let dir = 1, run = 0;
      seed = 4711;
      for (let c = 0; c <= nc; c++) {
        if (c === 0) { h[0] = 0; continue; }
        if (run <= 0) { const r = srnd(); dir = r < 0.3 ? 0 : (h[c - 1] >= 2 ? -1 : h[c - 1] <= 0 ? 1 : (r < 0.6 ? 1 : -1)); run = dir === 0 ? 2 + ((srnd() * 7) | 0) : 1 + ((srnd() * 3) | 0); }
        h[c] = Math.max(0, Math.min(2, h[c - 1] + dir)); run--;
        if (h[c] === h[c - 1] && dir !== 0) run = 0;
      }
      const rows = [[], [], []].map(() => new Array(nc).fill(' '));
      for (let c = 0; c < nc; c++) {
        const a = h[c], b = h[c + 1];
        if (b > a) rows[2 - a][c] = '/';
        else if (b < a) rows[2 - b][c] = '\\';
        else rows[2 - a][c] = '_';
      }
      ridge = rows.map((r) => r.join(''));
    }

    function makeCaps(env) {
      caps = env.panes.map((p) => {
        const c0 = Math.max(0, Math.ceil((p.x - ox) / cw)), c1 = Math.min(nc - 1, Math.floor((p.x + p.w - ox) / cw) - 1);
        const t0 = p.x + 1.6 * env.cell.size - 2, t1 = t0 + (p.name.length + 0.8) * cw + 4;
        const n = Math.max(0, c1 - c0 + 1), h = new Uint8Array(n), block = new Uint8Array(n);
        for (let i = 0; i < n; i++) { const X = colX(c0 + i); if (X + cw > t0 && X < t1) block[i] = 1; }
        return { p, c0, n, h, block };
      });
    }

    function makeBolt(env) {
      let c = Math.round(firstVisibleCol(env) + 8 + Math.random() * (Math.min(nc, (env.panes.length ? Math.min(...env.panes.map((p) => p.x)) - ox : env.out.w) / cw) - 20));
      let r = Math.max(2, hr - 6 - ((Math.random() * 3) | 0));
      const target = Math.min(firstTextRow + 6 + ((Math.random() * 10) | 0), nr - 4);
      const cells = [];
      const walk = (c, r, len, main) => {
        let dir = 0;
        for (let k = 0; k < len; k++) {
          const turn = Math.random();
          dir = turn < 0.33 ? -1 : turn < 0.66 ? 1 : 0;
          const glyph = dir < 0 ? '/' : dir > 0 ? '\\' : '|';
          cells.push(c, r, glyph.charCodeAt(0), main ? 1 : 0, k);
          c += dir; r += 1;
          if (main && Math.random() < 0.12 && k > 2) walk(c, r, 3 + ((Math.random() * 5) | 0), false);
        }
      };
      walk(c, r, target - r, true);
      bolt = { cells, t: 0 };
      flick = 1;
    }
    function warmSprites() {
      for (const sh of ['', '░', '▒']) for (const a of CLOUDS) artSprite(a, sh);
      artSprite(SUN, ''); artSprite(MOON, ''); ridge.cv = artSprite(ridge, '');
      for (const g of ['.', '+', '*', ',', '/', '\\', '|']) { glyphSprite(g, false); glyphSprite(g, true); }
    }
    function drawScene(env) {
      const g = env.back, bot = rowY(hr + 1);
      g.clearRect(0, 0, env.W, bot);
      const bright = 0.55 + 0.35 * mix.day;
      const night = (1 - mix.day) * (1 - mix.over * 0.9);
      if (night > 0.05) {
        // stars as tiny rect glyphs: '.' dot, '+' cross, '*' big cross; they twinkle on the step clock
        g.beginPath();
        for (const s of stars) {
          if (s.thr > night) continue;
          const tw = 0.5 + 0.5 * Math.sin(sceneStep * 1.9 + s.ph * 7);
          if (tw < 0.3) continue;
          const x = colX(s.c) + cw * 0.5, y = rowY(s.r) + ch * 0.55;
          if (s.g === '.') g.rect(x - 0.8, y + 1.2, 1.6, 1.6);
          else { const L = s.g === '*' ? cw * 0.42 : cw * 0.3; g.rect(x - 0.65, y - L, 1.3, L * 2); g.rect(x - L, y - 0.65, L * 2, 1.3); }
        }
        g.fillStyle = rgb(0.8); g.fill();
      }
      g.globalAlpha = 0.42 + 0.2 * mix.day;
      g.drawImage(BMP(ridge.cv), ox - 6, rowY(hr - 2) - 6);
      // sun / moon rise and set behind the ridge, a whole row at a time
      const bodyCol = Math.round(nc * 0.42);
      const body = (art, amt, dc0) => {
        if (amt < 0.02) return;
        const spr = artSprite(art, '');
        const rTop = Math.max(0, hr - 8) + Math.round((1 - amt) * (art.length + 3));
        const visRows = Math.max(0, Math.min(art.length, hr - 1 - rTop));
        if (!visRows) return;
        g.globalAlpha = bright * (1 - mix.over * 0.55) * (0.5 + 0.5 * amt);
        const sh = Math.min(spr.height, Math.ceil(6 + visRows * ch));
        g.drawImage(BMP(spr), 0, 0, spr.width, sh, Math.round(colX(bodyCol + dc0) - 6), Math.round(rowY(rTop) - 6), spr.width, sh);
      };
      body(SUN, mix.day, 0);
      body(MOON, mix.moon, 4);
      const shade = mix.heavy > 0.5 ? '▒' : mix.rain > 0.2 || mix.snow > 0.5 ? '░' : '';
      const rainy = mix.rain > 0.15, snowy = mix.snow > 0.3;
      for (const c of clouds) {
        if (c.pres < 0.03) continue;
        const art = CLOUDS[c.t];
        g.globalAlpha = Math.min(1, c.pres * 1.15) * (0.5 + 0.4 * mix.day + 0.1 * mix.moon);
        g.drawImage(BMP(artSprite(art, shade)), colX(Math.round(c.c)) - 6, rowY(c.r) - 6);
        // rain or snow hanging under the cloud, re-dealt on every step
        if ((rainy || snowy) && c.pres > 0.5) {
          const w = art[art.length - 1].length, r0 = c.r + art.length;
          g.beginPath();
          for (let r = r0; r < hr + 1; r++) for (let k = 1; k < w - 1; k++) {
            if (((k * 7 + r * 3 + sceneStep * 5 + c.t) % (mix.heavy > 0.5 ? 3 : 5)) !== 0) continue;
            const x = colX(Math.round(c.c) + k - Math.floor((r - r0) * (mix.heavy > 0.5 ? 0.5 : 0))) + cw * 0.5, y = rowY(r);
            if (snowy) g.rect(x - 0.8, y + ch * 0.5, 1.6, 1.6); else g.rect(x - 0.6, y + ch * 0.15, 1.2, ch * (mix.heavy > 0.5 ? 0.7 : 0.35));
          }
          g.globalAlpha = 1; g.fillStyle = rgb(0.45 * c.pres); g.fill();
        }
      }
      if (mix.fog > 0.02) {
        for (let k = 0; k < 2; k++) {
          g.globalAlpha = 0.55 * Math.min(1, mix.fog * 1.4);
          const off = ((fogOff * (k % 2 ? 1 : -1)) % 40 + 40) % 40;
          g.drawImage(BMP(glyphSprite(fogRow(env, k), false)), colX(-off) - 6, rowY(k ? hr - 3 : hr - 1) - 6);
        }
      }
      if (bolt) drawBoltCells(g, true);
      if (flick > 0) { g.globalAlpha = 1; g.fillStyle = rgb(0.12 * flick); g.fillRect(0, 0, env.W, bot); }
      // scanlines inside the layer
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = scan; g.fillRect(0, 0, env.W, bot); g.globalCompositeOperation = 'source-over';
    }
    function drawBoltCells(g, band) {
      const cl = bolt.cells, grow = Math.min(1, bolt.t / 0.1) * 40;
      for (let k = 0; k < cl.length; k += 5) {
        if (cl[k + 4] > grow) continue;
        const c = cl[k], r = cl[k + 1];
        if ((r <= hr) !== band) continue;
        if (r >= roofRow[Math.max(0, Math.min(nc - 1, c))]) continue;
        g.globalAlpha = cl[k + 3] ? 1 : 0.6;
        g.drawImage(BMP(glyphSprite(String.fromCharCode(cl[k + 2]), !!cl[k + 3])), colX(c) - 6, rowY(r) - 6);
      }
      g.globalAlpha = 1;
    }
    function firstVisibleCol(env) { return Math.ceil((env.protect.left - ox) / cw); }

    return {
      id: 'retro-fosfor', title: 'Fosfor', family: 'Retro',
      note: 'Vädret som tecken på en grön fosforskärm med efterglöd och scanlines – prova ösregn (blixten bränner in sig), snö på panelkanterna, dimma och fackla (bärnstensskärm).',
      preset: { weather: "'", fog: '', light: ')' },
      fps: 15,
      manualClear: true,
      init(env) { mix = newMix(env.state); frameNo = 0; time = 0; bolt = null; flick = 0; },
      resize(env) {
        cw = env.cell.w; ch = env.cell.h; font = env.cell.font;
        ox = env.out.x + 2;
        const first = env.lines.length ? env.lines.reduce((a, l) => Math.min(a, l.y), 1e9) : env.H * 0.3;
        oy = first - Math.ceil(first / ch) * ch;
        nc = Math.ceil((env.W - ox) / cw); nr = Math.ceil((env.H - oy) / ch);
        firstTextRow = Math.round((first - oy) / ch);
        hr = Math.max(4, firstTextRow - 2); // ridge bottom row
        sprites.clear();
        setPhos(env.state.light === '!' ? [255, 176, 60] : [80, 255, 130]);
        // fade pattern: uniform decay + darker every third line (scanlines)
        const tile = mkCanvas(4, 3), tg = tile.getContext('2d');
        tg.fillStyle = 'rgba(0,0,0,0.30)'; tg.fillRect(0, 0, 4, 3);
        tg.fillStyle = 'rgba(0,0,0,0.62)'; tg.fillRect(0, 2, 4, 1);
        fade = env.back.createPattern(tile, 'repeat');
        const tile2 = mkCanvas(4, 3), tg2 = tile2.getContext('2d');
        tg2.fillStyle = 'rgba(0,0,0,0.45)'; tg2.fillRect(0, 0, 4, 3);
        fadeFront = env.front.createPattern(tile2, 'repeat');
        const tile3 = mkCanvas(4, 3), tg3 = tile3.getContext('2d');
        tg3.fillStyle = 'rgba(0,0,0,0.5)'; tg3.fillRect(0, 2, 4, 1);
        scan = env.back.createPattern(tile3, 'repeat');
        needScene = true; sceneKey = -1;
        // text cells stay dim behind text
        textCell = new Uint8Array(nc * nr);
        for (const l of env.lines) {
          const r = Math.round((l.y - oy) / ch); if (r < 0 || r >= nr) continue;
          const c0 = Math.max(0, Math.floor((l.x - ox) / cw)), c1 = Math.min(nc - 1, Math.ceil((l.x + l.w - ox) / cw));
          for (let c = c0; c <= c1; c++) textCell[r * nc + c] = 1;
        }
        roofRow = new Int16Array(nc).fill(Math.floor((env.protect.solidTop - oy) / ch));
        for (const p of env.panes) {
          const c0 = Math.max(0, Math.floor((p.x - ox) / cw)), c1 = Math.min(nc - 1, Math.floor((p.x + p.w - ox) / cw));
          const r = Math.floor((p.y - oy) / ch) - 0;
          for (let c = c0; c <= c1; c++) if (r < roofRow[c]) roofRow[c] = r;
        }
        makeRidge(env); makeCaps(env);
        seed = 777; clouds = [];
        for (let i = 0; i < 6; i++) clouds.push({ t: i % CLOUDS.length, c: srnd() * nc, r: Math.max(0, Math.round(srnd() * Math.max(1, hr - 9))), v: 0.35 + srnd() * 0.5, rank: (i + 0.5) / 6, pres: 0, acc: 0 });
        clouds[0].rank = 0.01;
        for (const c of clouds) c.pres = c.rank < mix.cover ? 1 : 0;
        stars = [];
        for (let i = 0; i < 24; i++) stars.push({ c: (srnd() * nc) | 0, r: (srnd() * Math.max(1, hr - 3)) | 0, g: srnd() < 0.15 ? '+' : srnd() < 0.2 ? '*' : '.', thr: srnd(), ph: srnd() * 6 });
        dalive.fill(0); splife.fill(0);
        warmSprites();
        for (let k = 0; k < 4; k++) { fogRows[k] = null; glyphSprite(fogRow(env, k), false); }
        env.back.clearRect(0, 0, env.W, env.H); env.front.clearRect(0, 0, env.W, env.H);
      },
      onState(env, key, v) { if (key === 'light') { const want = v === '!' ? [255, 176, 60] : [80, 255, 130]; if (want[0] !== phos[0]) { setPhos(want); sprites.clear(); warmSprites(); } } },
      onEvent(env, name) { if (name === 'strike') makeBolt(env); },
      frame(env, dt) {
        frameNo++; time += dt;
        stepMix(mix, env.state, dt, 1.6);
        const b = env.back, f = env.front;

        // The sky band is a static 'page': it is redrawn only when something in
        // it changes, on a slow step clock (clouds move a whole cell at a time).
        sceneClock += dt;
        sinceScene += dt;
        if (sceneClock >= 1.2) {
          sceneClock = 0; sceneStep++;
          for (const c of clouds) {
            c.acc += c.v * (1 + mix.heavy) * 1.2;
            if (c.acc >= 1) { const k = Math.floor(c.acc); c.acc -= k; c.c -= k; const w = CLOUDS[c.t][0].length + 6; if (c.c < -w) c.c += nc + w; }
          }
          if (mix.fog > 0.02) fogOff += 1;
          sceneDirty = true;
        }
        let sk = (phos[0] | 0) + Math.round(mix.day * 6) * 7 + Math.round(mix.moon * 6) * 59 + Math.round(mix.over * 4) * 503 + Math.round(mix.fog * 4) * 4001 + (mix.heavy > 0.5 ? 2 : mix.rain > 0.2 || mix.snow > 0.5 ? 1 : 0) * 30011;
        for (const c of clouds) {
          const want = c.rank < mix.cover ? 1 : 0;
          c.pres += (want - c.pres) * (1 - Math.exp(-dt / 1.4));
          sk = (sk * 31 + Math.round(c.pres * 5)) % 1e9;
        }
        if (sk !== sceneKey && sinceScene > 0.3) { sceneKey = sk; sceneDirty = true; }
        if (sceneDirty || needScene) { drawScene(env); sceneDirty = false; needScene = false; sinceScene = 0; }
        // thick fog also lies in bands across the output
        if (mix.fog > 0.6) {
          for (let k = 2; k < 4; k++) {
            const rr = k === 2 ? firstTextRow + 6 : firstTextRow + 18; if (rr >= nr) continue;
            b.globalAlpha = 0.2 * Math.min(1, (mix.fog - 0.6) * 4);
            const off = ((fogOff * (k % 2 ? 1 : -1)) % 40 + 40) % 40;
            b.drawImage(BMP(glyphSprite(fogRow(env, k), false)), colX(-off) - 6, rowY(rr) - 6);
          }
        }
        // rain and snow: glyphs falling cell by cell
        const rainN = Math.floor(mix.rain * DMAX * (0.6 - 0.1 * mix.heavy));
        const snowN = Math.floor(mix.snow * DMAX * 0.3);
        let rain = 0, snow = 0;
        for (let i = 0; i < DMAX; i++) if (dalive[i]) { if (dkind[i] === 2) snow++; else rain++; }
        let tries = 14;
        for (let i = 0; i < DMAX; i++) {
          if (!dalive[i]) {
            if (tries <= 0 || (rain >= rainN && snow >= snowN)) continue;
            tries--;
            if (rain < rainN && Math.random() < 0.6) {
              const c = (Math.random() * nc) | 0, r = rain < rainN * 0.6 || Math.random() < 0.3 ? hr + 1 + ((Math.random() * Math.max(1, roofRow[c] - hr - 2)) | 0) : hr + 1;
              if (roofRow[c] <= r + 1) continue;
              dalive[i] = 1; dkind[i] = mix.heavy > 0.5 && Math.random() < 0.6 ? 1 : 0; dc[i] = c; dr[i] = r; dv[i] = dkind[i] ? 2 : 1; dstop[i] = roofRow[c] - 1; rain++;
            } else if (snow < snowN && Math.random() < 0.2) {
              const c = (Math.random() * nc) | 0;
              if (roofRow[c] <= hr + 2) continue;
              dalive[i] = 1; dkind[i] = 2; dc[i] = c; dr[i] = hr + 1 + (snow < snowN * 0.5 ? (Math.random() * (roofRow[c] - hr - 2)) | 0 : 0); dv[i] = 0.25 + Math.random() * 0.2; dph[i] = Math.random() * 6; dstop[i] = roofRow[c] - 1; snow++;
            }
            continue;
          }
          dr[i] += dv[i];
          if (dkind[i] === 1) dc[i] -= 0.5;
          if (dkind[i] === 2) { dph[i] += 0.12; if (Math.random() < 0.06) dc[i] += Math.random() < 0.5 ? -1 : 1; }
          const c = Math.round(dc[i]), r = Math.floor(dr[i]);
          if (c < 0 || c >= nc) { dalive[i] = 0; continue; }
          const stop = Math.min(dstop[i], roofRow[c] - 1);
          if (r >= stop) {
            dalive[i] = 0;
            if (stop < firstTextRow + 40 && roofRow[c] < nr - 3) {
              if (dkind[i] === 2) landSnow(c);
              else if (Math.random() < 0.5) for (let k = 0; k < SPL; k++) if (splife[k] <= 0) { spc[k] = c + (Math.random() < 0.5 ? -1 : 1); spr[k] = stop; splife[k] = 0.25; spch[k] = Math.random() < 0.5 ? 0 : 1; break; }
            }
            continue;
          }
          if (r < 0) continue;
          // queue the head; drawn below in a few batched passes
          const q = qn++;
          qx[q] = colX(c); qy[q] = rowY(r); qk[q] = dkind[i] === 2 ? (dv[i] > 0.36 ? 3 : 2) : dkind[i] === 1 || mix.heavy > 0.3 ? 1 : 0; qd[q] = textCell[r * nc + c];
        }
        // glyph heads as rects: '|' long bar, "'" tick, '.' dot, '*' cross; halo then core
        for (let pass = 0; pass < 4; pass++) {
          const dimP = pass & 1, core = pass >> 1;
          if (pass < 2) continue; // core only: the phosphor afterglow is the halo
          const hw = 1.5;
          b.beginPath();
          for (let q = 0; q < qn; q++) {
            if (qd[q] !== dimP) continue;
            const x = qx[q] + cw * 0.5, y = qy[q];
            switch (qk[q]) {
              case 1: b.rect(x - hw / 2, y + ch * 0.12, hw, ch * 0.78); break;
              case 0: b.rect(x - hw / 2, y + ch * 0.12, hw, ch * 0.38); break;
              case 2: b.rect(x - hw / 2 - 0.4, y + ch * 0.62 - hw / 2, hw + 0.8, hw + 0.8); break;
              default: b.rect(x - hw / 2, y + ch * 0.25, hw, ch * 0.5); b.rect(x - cw * 0.32, y + ch * 0.5 - hw / 2, cw * 0.64, hw);
            }
          }
          b.fillStyle = core ? (dimP ? rgbDim : rgbCore) : rgbHalo; b.fill();
        }
        qn = 0;
        // lightning: burns in, then the afterglow fades it out
        if (mix.heavy > 0.7 && !bolt) { nextStrike -= dt; if (nextStrike <= 0) { makeBolt(env); nextStrike = 6 + Math.random() * 12; } }
        if (bolt) {
          const was = bolt.t < 0.2 || (bolt.t > 0.27 && bolt.t < 0.34);
          bolt.t += dt;
          const on = bolt.t < 0.2 || (bolt.t > 0.27 && bolt.t < 0.34);
          if (on) drawBoltCells(b, false);
          if (on !== was || bolt.t < 0.12) sceneDirty = true;
          if (bolt.t > 0.5) { bolt = null; sceneDirty = true; }
        }
        b.globalAlpha = 1;
        // CRT flicker on a strike: a short phosphor wash over the whole tube
        if (flick > 0) {
          f.fillStyle = rgb(0.05 * flick); f.fillRect(0, 0, env.W, env.H);
          flick = flick > 0.6 ? 0.35 : 0; // on, dim, off
          sceneDirty = true;
        }
        // phosphor decay + scanlines in one pass, applied after drawing so the
        // fill is the frame's last operation; only rows that can hold glyphs
        const dyn = rain + snow > 0;
        const busy = dyn || mix.rain > 0.005 || mix.snow > 0.005 || mix.fog > 0.4 || bolt || flick > 0;
        lowerDirty = busy ? 20 : lowerDirty - 1;
        if (busy || lowerDirty > 0) {
          const y0 = rowY(hr + 1);
          b.globalCompositeOperation = 'destination-out';
          b.fillStyle = fade; b.fillRect(0, y0, env.W, env.protect.solidTop - y0);
          b.globalCompositeOperation = 'source-over';
        }
        if (mix.snow > 0.3 && Math.random() < mix.snow * 0.7) { const c = (Math.random() * nc) | 0; if (roofRow[c] <= hr) landSnow(c); }
        // FRONT: splashes and snow on the pane ledges
        for (let k = 0; k < SPL; k++) {
          if (splife[k] <= 0) continue;
          splife[k] -= dt;
          f.globalAlpha = 0.8; f.drawImage(BMP(glyphSprite(spch[k] ? '.' : ',', false)), colX(spc[k]) - 6, rowY(spr[k]) - 6 - (0.25 - splife[k]) * 30);
        }
        for (const cp of caps) {
          if (!cp.n) continue;
          if (mix.snow < 0.3 && Math.random() < 0.1) { const j = (Math.random() * cp.n) | 0; if (cp.h[j]) cp.h[j]--; }
          f.globalAlpha = 0.9;
          for (let j = 0; j < cp.n; j++) if (cp.h[j]) f.drawImage(BMP(glyphSprite(SNOWCAP[cp.h[j]], false)), colX(cp.c0 + j) - 6, cp.p.y + cp.p.border - ch - 6 + 2);
        }
        f.globalAlpha = 1;
        let frontBusy = flick > 0;
        for (let k = 0; k < SPL && !frontBusy; k++) if (splife[k] > 0) frontBusy = true;
        for (const cp of caps) for (let j = 0; j < cp.n && !frontBusy; j++) if (cp.h[j]) frontBusy = true;
        if (frontBusy || frontDirty > 0) {
          frontDirty = frontBusy ? 20 : frontDirty - 1;
          f.globalCompositeOperation = 'destination-out'; f.fillStyle = fadeFront; f.fillRect(0, 0, env.W, env.protect.solidTop); f.globalCompositeOperation = 'source-over';
        }
      },
      destroy() {},
    };

    function landSnow(c) {
      for (const cp of caps) {
        if (c < cp.c0 || c >= cp.c0 + cp.n || roofRow[c] !== Math.floor((cp.p.y - oy) / ch)) continue;
        const j = c - cp.c0; if (cp.block[j]) return;
        if (cp.h[j] < 4) cp.h[j]++;
        return;
      }
    }
    function fogRow(env, k) {
      if (!fogRows[k]) {
        let s = '';
        const n = nc + 48;
        for (let c = 0; c < n; c++) { const v = env.noise(c * 0.13 + k * 31, k * 3.7); s += v > 0.62 ? '≈' : v > 0.5 ? '~' : v > 0.42 ? '-' : ' '; }
        fogRows[k] = s;
      }
      return fogRows[k];
    }
  })();
  const SNOWCAP = ['', '.', '_', '▄', '█'];
  const fogRows = [];
  WX.register(fosfor);
})();
