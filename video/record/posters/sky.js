// The posters' night sky: a canvas of stars, a faint milky band, grain and
// (optionally) the moon with its glow. Seeded, so a poster renders the same
// every time. `drawSky(canvas, { seed, moon: {x, y, r} | null, band })`.

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

window.drawSky = function drawSky(cv, o = {}) {
  const W = cv.width, H = cv.height;
  const g = cv.getContext('2d');
  const R = rng(o.seed ?? 7);
  const gauss = () => (R() + R() + R() + R() - 2) / 2;

  // the deep: navy at the top, near black low, a breath of violet
  const bg = g.createLinearGradient(0, 0, W * 0.3, H);
  bg.addColorStop(0, '#0b1326');
  bg.addColorStop(0.45, '#070b18');
  bg.addColorStop(1, '#030409');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const v = g.createRadialGradient(W * 0.7, H * 0.2, 0, W * 0.7, H * 0.2, W * 0.8);
  v.addColorStop(0, 'rgba(40,46,90,0.22)');
  v.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);

  // the band: a diagonal of haze and dust
  const band = o.band ?? { x0: -0.1, y0: 1.05, x1: 1.1, y1: -0.15, width: 0.16 };
  const bx = (t) => (band.x0 + (band.x1 - band.x0) * t) * W;
  const by = (t) => (band.y0 + (band.y1 - band.y0) * t) * H;
  const nx = -(band.y1 - band.y0) * H, ny = (band.x1 - band.x0) * W;
  const nl = Math.hypot(nx, ny);
  const ux = nx / nl, uy = ny / nl;
  const bw = band.width * Math.min(W, H) * 1.6;
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 900; i++) {
    const t = R();
    const d = gauss() * bw * 0.55;
    const x = bx(t) + ux * d, y = by(t) + uy * d;
    const r = (0.04 + R() * 0.09) * bw;
    const a = 0.02 + R() * 0.028;
    const c = g.createRadialGradient(x, y, 0, x, y, r);
    const warm = R() < 0.35;
    c.addColorStop(0, warm ? `rgba(160,140,170,${a})` : `rgba(120,140,200,${a})`);
    c.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = c;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  // dark lanes in the band
  g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 160; i++) {
    const t = R();
    const d = gauss() * bw * 0.25;
    const x = bx(t) + ux * d, y = by(t) + uy * d;
    const r = (0.03 + R() * 0.06) * bw;
    const c = g.createRadialGradient(x, y, 0, x, y, r);
    c.addColorStop(0, 'rgba(3,4,10,0.10)');
    c.addColorStop(1, 'rgba(3,4,10,0)');
    g.fillStyle = c;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  g.globalCompositeOperation = 'lighter';
  // the band's dust of tiny stars
  for (let i = 0; i < 9000; i++) {
    const t = R();
    const d = gauss() * bw * 0.6;
    const x = bx(t) + ux * d, y = by(t) + uy * d;
    const a = 0.08 + R() * 0.35;
    g.fillStyle = `rgba(210,220,255,${a})`;
    const s = R() < 0.9 ? 1 : 1.6;
    g.fillRect(x, y, s, s);
  }

  // stars: many faint, some bright, a few with a glow and rays
  const tint = () => {
    const k = R();
    return k < 0.15 ? [255, 214, 170] : k < 0.3 ? [175, 200, 255] : k < 0.36 ? [255, 180, 150] : [235, 240, 255];
  };
  const n = Math.round((W * H) / 1500);
  for (let i = 0; i < n; i++) {
    const x = R() * W, y = R() * H;
    const m = Math.pow(R(), 3.2);
    const [cr, cg, cb] = tint();
    const r = 0.5 + m * 2.6;
    const a = 0.25 + m * 0.75;
    g.fillStyle = `rgba(${cr},${cg},${cb},${a})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    if (m > 0.35) {
      const gr = r * 7;
      const c = g.createRadialGradient(x, y, 0, x, y, gr);
      c.addColorStop(0, `rgba(${cr},${cg},${cb},${0.22 * m})`);
      c.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = c;
      g.fillRect(x - gr, y - gr, 2 * gr, 2 * gr);
    }
    if (m > 0.86) {
      g.strokeStyle = `rgba(${cr},${cg},${cb},${0.25 * m})`;
      g.lineWidth = 1;
      const L = r * 9;
      g.beginPath();
      g.moveTo(x - L, y); g.lineTo(x + L, y);
      g.moveTo(x, y - L); g.lineTo(x, y + L);
      g.stroke();
    }
  }
  g.globalCompositeOperation = 'source-over';

  if (o.moon) drawMoon(g, o.moon, R);

  // grain
  const img = g.getImageData(0, 0, W, H);
  const p = img.data;
  for (let i = 0; i < p.length; i += 4) {
    const k = (R() - 0.5) * 7;
    p[i] += k; p[i + 1] += k; p[i + 2] += k;
  }
  g.putImageData(img, 0, 0);
}

function drawMoon(g, m, R) {
  const { x, y, r } = m;
  // the glow: wide and soft, then close
  g.globalCompositeOperation = 'lighter';
  for (const [rr, a] of [[r * 10, 0.16], [r * 4.5, 0.22], [r * 2.2, 0.28], [r * 1.4, 0.34]]) {
    const c = g.createRadialGradient(x, y, r * 0.8, x, y, rr);
    c.addColorStop(0, `rgba(225,230,245,${a})`);
    c.addColorStop(0.4, `rgba(170,185,225,${a * 0.35})`);
    c.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = c;
    g.fillRect(x - rr, y - rr, 2 * rr, 2 * rr);
  }
  g.globalCompositeOperation = 'source-over';
  // the disc
  g.save();
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.clip();
  const d = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r * 1.05);
  d.addColorStop(0, '#fbf8ef');
  d.addColorStop(0.6, '#e6e2d6');
  d.addColorStop(1, '#b9b6ad');
  g.fillStyle = d;
  g.fillRect(x - r, y - r, 2 * r, 2 * r);
  // maria: soft grey patches
  const maria = [[-0.25, -0.2, 0.42], [0.18, -0.32, 0.26], [0.3, 0.1, 0.3], [-0.05, 0.35, 0.22], [-0.42, 0.18, 0.2], [0.05, -0.02, 0.18]];
  for (const [mx, my, mr] of maria) {
    const cx = x + mx * r, cy = y + my * r, rr = mr * r;
    const c = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
    c.addColorStop(0, 'rgba(120,124,135,0.42)');
    c.addColorStop(0.7, 'rgba(130,134,145,0.22)');
    c.addColorStop(1, 'rgba(130,134,145,0)');
    g.fillStyle = c;
    g.fillRect(cx - rr, cy - rr, 2 * rr, 2 * rr);
  }
  // craters
  for (let i = 0; i < 70; i++) {
    const a = R() * Math.PI * 2, q = Math.sqrt(R()) * 0.92;
    const cx = x + Math.cos(a) * q * r, cy = y + Math.sin(a) * q * r;
    const cr = (0.015 + Math.pow(R(), 3) * 0.08) * r;
    g.fillStyle = 'rgba(110,110,115,0.25)';
    g.beginPath(); g.arc(cx, cy, cr, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,250,0.22)';
    g.beginPath(); g.arc(cx - cr * 0.3, cy - cr * 0.3, cr * 0.7, 0, Math.PI * 2); g.fill();
  }
  // the limb a little darker
  const l = g.createRadialGradient(x, y, r * 0.75, x, y, r);
  l.addColorStop(0, 'rgba(0,0,0,0)');
  l.addColorStop(1, 'rgba(60,60,80,0.25)');
  g.fillStyle = l;
  g.fillRect(x - r, y - r, 2 * r, 2 * r);
  g.restore();
}
