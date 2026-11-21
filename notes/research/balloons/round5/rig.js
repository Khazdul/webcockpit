// Kill notices, round 5: THE SHARED RIG (a mockup, not product code).
//
// Every passenger flies the same craft: an envelope that carries the rating,
// long ropes, a burner hung under the mouth, a flame that goes up INTO the
// mouth, a basket, and a sign hung on two cords under the basket. This file
// owns everything that is not specific to one people. A skin (one passenger)
// supplies the drawings and the character. See skins/dwarf.js for a full
// example; a new passenger is written from this comment plus that file.
//
//   Harness.register({ id, name, blurb, create: (ctx) => Rig.create(ctx, spec) });
//
// LAYOUT (Rig.K, px at scale 1; x is measured from the centre line in all
// helper coordinates, y from the top of the rig):
//   W 204        the rig's width            CX 102   the centre line
//   TOP 8        highest crown of a taut envelope (finials may reach y 0)
//   HG 112       the envelope's mouth (ellipse MRX 24 x MRY 5.5). Also the
//                hinge: the envelope leans about it, the car swings from it.
//   FY 136       the flame's root = the top of the burner. The burner hangs
//                from the mouth (it is in the envelope's frame, so the flame
//                always points into the mouth). Keep burner art inside about
//                x -40..40, y HG..FY+16.
//   RY 248       the basket's rim (half-width RIM 52). Ropes land on the rim
//                at x = +-R1 (51) and +-R2 (45).
//   SY 300       the sign's top edge. The sign is shown at SS (0.85): the rig
//                zooms it, so a skin writes its sign (width, board art,
//                paddings, type) at full size and it comes out 15 % smaller.
//   BY 277       no longer the car's bottom: just a y on the visible wall.
//   BD 326       the car's hidden bottom. The car is deeper than it looks:
//                its walls run straight on down to BD, behind the sign, so
//                the passenger plausibly fits and no floor is ever seen.
//                The sign (a later layer, at least 40 px tall) covers it.
//   RY + CY      (255) where the sign's two cords are fixed to the car: just
//                under the rim, at x = -+ sign.hx * SS, so the cords run
//                straight down in front of the car's wall to the sign.
//   MAXH 363     the whole rig with a three-line kill sign must fit in this.
// The passenger must stay below y = FY + 20 in every pose and may never
// cover x -16..16 above that line (the burner and the flame are there).
//
// LAYERS, back to front (each filtered drawing is painted once; the frame
// callback only writes transforms, opacity and the cord paths' d):
//   .rig-env     leans with the flight:  envelope art, glow inside it, glow in
//                the mouth, the FLAME (clipped by the mouth's upper edge),
//                the mouth's front lip, then the skin's burner
//   ropes + the skin's extra lines (svg paths redrawn per frame)
//   .rig-car     swings late:  [behind] clipped at the rim, basket, [front]
//   sign cords (redrawn per frame), then the sign
//
// Rig.create(ctx, spec) -> { show(notice), still(notice), clear() }
//
// spec:
//   id          css prefix, e.g. 'dwarf'. The root gets class "rig <id>-v" and
//               data-mood, data-kind, data-sky; the sign "rig-sign <id>-sign".
//   css         the skin's own stylesheet text (prefix every class with id).
//               Poses are best done as CSS variables per [data-mood], as in
//               the dwarf. Classes the rig toggles on the root: rig-at (it has
//               arrived at the readable spot), rig-off (leaving), rig-still
//               (the sheet), rig-rm (reduced motion: no transitions).
//               Variables a skin may set (per mood too): --rig-f1/--rig-f2
//               (flame outer/core), --rig-gl (glow, "r,g,b").
//   moods       optional list of moods the skin draws (default: all ten).
//   defs(u)     extra <defs> content (gradients, patterns) for this instance.
//               u is a unique number; put it in every id.
//   envelope(mood) -> { cond, art(geo, u) }
//               cond: the envelope's CONDITION, { sag 0..1, lop -1..1 (the
//               crown leans), taut 0..1, dents: [{ side: -1|1, t, depth,
//               span }] }. sag makes it smaller, lower, peaked and hollow;
//               taut makes it larger and fuller. geo = Rig.envelope(cond):
//                 geo.pt(k, t)        a point ON the surface: k -1..1 across
//                                     (sin of the longitude), t 0 crown .. 1 mouth
//                 geo.seam(k, t0, t1) a meridian (open path d)
//                 geo.lat(t, k0, k1)  a latitude (open path d, bows like the surface)
//                 geo.gore(k0, k1)    the panel between two seams (closed d)
//                 geo.band(t0, t1)    the band between two latitudes (closed d)
//                 geo.along(n)        n values of k, evenly spaced round the balloon
//                 geo.place(k, t, s)  a transform="" that sets a motif drawn about
//                                     0,0 on the surface, foreshortened and turned
//                 geo.patch(k, t, w, h, { fill, rot, stitch, rivets, hatch })
//                                     a mended patch with crude stitches or rivets
//                 geo.out             the silhouette (closed d), geo.top, geo.R
//               art returns { base, inside, over, under, html, lip }: base is
//               the fill; inside is svg markup clipped to the silhouette
//               (panels, bands, emblems; the rig adds the standard hatched
//               shading over it); over is unclipped (finials, lugs, fringes);
//               under is behind; html is extra positioned layers (a glowing
//               mark); lip is the colour of the mouth's front lip.
//   ropes       a cord: { kind: 'rope' | 'chain', dark, light, w }
//   burner(u)   html markup for the burner, in the envelope's frame. Build it
//               with Rig.kit.S / Z. Parts that move with burn must be their
//               own html layers (kit.Z); move them in life.frame().
//   lines       optional [{ cord, a(info, R), b(info, R) }]: more cords drawn
//               per frame between two points (a valve chain from the burner
//               to the basket). info.pe(x, y) / info.pc(x, y) give a point of
//               the envelope's / the car's frame in root px.
//   basket(u)   html markup of the basket (kit.S), in the car.
//   behind(u)   html markup of the passenger and props BEHIND the basket rim.
//   front(u)    html markup IN FRONT of the basket (hands on the rim, things
//               hung on it).
//   sign        { w, hx, cord, k, c, below, board({ w, h, hx, mood, kind, u }),
//                 pips(mood, notice) }
//               w: the sign's width and hx: half the distance between its
//               two hanging points, both at FULL size (the rig shows the
//               sign at K.SS). The cords start on the car at
//               (-+ hx * K.SS, RY + K.CY); bx / by override that, rarely
//               needed.
//               k, c: spring stiffness and damping (lower k = heavier, later).
//               board() returns svg markup for a board of exactly w x h (the
//               text has been measured), drawn 0,0..w,h; the cords end at
//               (w/2 -+ hx, -2) in the board's own px. pips() returns a small trusted <svg> for the
//               rating row. The rig fills the text (textContent only) into
//               .rig-tag .rig-title .rig-fig(.rig-unit) .rig-rate(.rig-word |
//               .rig-q) .rig-more inside .rig-text; style them under
//               .<id>-sign and colour them per [data-mood].
//   life(R)     the passenger's life -> { arrive(mood), leave(),
//               changed(mood, was), struck(), frame(info), stop() }, all
//               optional. R: { root, u, mood, q(sel), qa(sel), sign, notice }.
//               frame(info) runs every frame: info = { burn, lean, swing,
//               hang (deg, for things that dangle in the car), d, dt, now,
//               phase, pe, pc }. NO layout reads there.
//
// THE HEIGHT LIMIT. Every notice must end at or above y = MAXH (363). The
// rig sees to it: after the text is filled it measures the sign, and if the
// sign would end below MAXH it tightens the text in two steps (classes
// rig-fit1, then rig-fit2 on the sign: smaller title and figure, tighter
// leading; a long achievement text goes smaller and is clamped to four
// lines with an ellipsis), and as a last resort hangs the sign up to 5 px
// higher. The joined names (.rig-more) are always one line with an
// ellipsis. A normal three-line kill is never touched as long as the skin's
// sign is at most 73 px tall for it at full size (62 px as shown), so keep
// the skin's vertical padding at about 8 px. If a sign still does not fit,
// the rig says so with console.warn; fix the skin's sign css then.
// Type as shown (full size x 0.85): title 12.8, figure 21.3, unit 11.9,
// rating word 10.6, joined names 10.2, tag 10.2 px.
//
// WRITING A NEW PASSENGER: THE CHECKLIST
//   1. Do not edit rig.js or harness.js. Everything of yours goes in
//      skins/<id>.js; if the rig cannot do something, report it instead.
//   2. Decide the people's vocabulary first and write it as the header
//      comment of your file: materials, colours, motifs, what "the best"
//      means, the five-step envelope ladder and the five specials.
//   3. Supply, through Rig.create(ctx, spec): id, css, defs, envelope(mood)
//      for all ten moods, ropes, burner, basket, behind, front, sign
//      { board, pips, ... } and life. Copy the shape of skins/dwarf.js.
//   4. Layer order is fixed (see LAYERS): envelope, glows, flame, the
//      mouth's front lip, your burner, ropes, [behind], basket, [front],
//      sign cords, sign. The flame is the rig's: never draw your own and
//      never put anything of the passenger's over x -16..16 above y FY + 20.
//   5. The burner hangs from the envelope's mouth (it is in the envelope's
//      frame, drawn by burner(u) about x 0, y HG..FY+16). It cannot stand on
//      the basket. Draw its hangers yourself from about (-19, HG+4) and
//      (19, HG+4). It must read as "the thing that makes the flame".
//   6. Anything that moves every frame (a part that follows burn, a thing
//      that dangles, a wrapper that nods) must be its OWN html layer: a
//      kit.Z div with its svg inside, moved by style.transform / opacity in
//      life.frame() or by a css animation. Never change attributes or
//      styles INSIDE a filtered svg per frame (it is re-filtered each time);
//      short one-off css transitions inside one are tolerable.
//   7. Mood poses: css variables per [data-mood] on .<id>-v; poses that only
//      apply after arrival under .rig-at[data-mood=...]. No costumes, no
//      effects floating round the passenger; things held or done are fine.
//   8. Game strings never touch your code: the rig fills the sign with
//      textContent. Your board() and pips() return your own trusted svg.
//   9. THE DEEP CAR AND THE HUNG SIGN. Draw the car's walls from the rim
//      straight (or with the same gentle taper) down to K.BD, not to a floor:
//      no bottom edge, no underside, no feet. Continue the wall's own
//      texture all the way down; it is hidden by the sign but shows for a
//      moment at the sign's edges when the sign swings. Keep the wall at
//      K.SY at least 8 px a side narrower than the sign AS SHOWN
//      (sign.w * K.SS). Nothing may dangle under the car: such things hang
//      from hooks on the rim at the car's sides.
//      The sign hangs on two long cords from just under the rim. Draw the
//      two fixings (lugs, eye-bolts, cleats, a toggle through the weave) on
//      the wall's front at (-+ sign.hx * K.SS, K.RY + K.CY) and pass no
//      bx / by. Keep hands, and anything else on the front of the car, clear
//      of those two vertical lines. Write the sign at full size: w, hx, the
//      board, paddings and type are all scaled by the rig. In board(), put
//      the hanging hardware at (w/2 -+ hx, -2) using the hx you are given.
//  10. Check: node shot.mjs <id> <dir> night (and day) with no page errors,
//      look at the sheet, and watch the console for the rig's height warning.
//
// Rig.kit: INK, n, S(cls, x, y, w, h, body) an <svg> layer whose viewBox is
// that box of rig coordinates; SL(...) the same about a local origin (inside
// a Z); Z(cls, x, y, inner) a zero-size <div> at a point (for parts that turn
// or scale about it); G(u, body) the engraving group (wobbly pen + paper
// grain; ink stroke by default); P(u) / Q(u) the two hatch fills; filt(),
// hatch() to make more; ink2(d, w, colour) a dark line with a coloured core;
// mix / dark / light for tints; clock() for timers that stop with the notice.

const Rig = (() => {
  const NS = 'http://www.w3.org/2000/svg', INK = '#23170f', D = Math.PI / 180;
  const K = Object.freeze({ W: 204, CX: 102, TOP: 8, HG: 112, MRX: 24, MRY: 5.5, ER: 80, FY: 136, RY: 248, RIM: 52, R1: 51, R2: 45, BY: 277, BD: 326, SY: 300, SS: .85, CY: 7, MAXH: 363 });
  const { W, CX, HG, MRX, MRY, FY, RY, BY, SY, SS } = K;
  const n = (v) => +v.toFixed(1), n2 = (v) => +v.toFixed(2);
  const pp = (p) => `${n(p[0])},${n(p[1])}`;
  let uid = 0, serial = 0;

  // ---- the engraving kit ----
  // The pen wobble (a displacement), a blotchy ink tone and paper grain, kept inside the drawing.
  const filt = (id, o = {}) => `<filter id="${id}" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="${o.freq ?? .06}" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="${o.scale ?? 1.5}" xChannelSelector="R" yChannelSelector="G" result="d"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .16 0 0 0 0 .09 0 0 0 0 .04 1.5 0 0 0 -.7" result="b"/><feTurbulence type="fractalNoise" baseFrequency="${o.grain ?? .8}" numOctaves="2" seed="11"/><feColorMatrix type="matrix" values="0 0 0 0 .14 0 0 0 0 .08 0 0 0 0 .04 0 1.2 0 0 -.56" result="g"/><feMerge result="m"><feMergeNode in="b"/><feMergeNode in="g"/></feMerge><feComposite in="m" in2="d" operator="in" result="mc"/><feMerge><feMergeNode in="d"/><feMergeNode in="mc"/></feMerge></filter>`;
  const hatch = (id, rot, gap, op, sw = .55) => `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${gap}" height="${gap}" patternTransform="rotate(${rot})"><path d="M0,.5H${gap}" stroke="${INK}" stroke-width="${sw}" opacity="${op}"/></pattern>`;
  const defs = (u, extra = '') => `<svg class="rig-defs" xmlns="${NS}" width="0" height="0" aria-hidden="true"><defs>${filt('rgf' + u)}${hatch('rgp' + u, 38, 3, .6)}${hatch('rgq' + u, -52, 3.4, .5)}${extra}</defs></svg>`;
  const P = (u) => `url(#rgp${u})`, Q = (u) => `url(#rgq${u})`;
  const S = (cls, x, y, w, h, body) => `<svg class="rig-s ${cls}" xmlns="${NS}" style="left:${CX + x}px;top:${y}px" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}">${body}</svg>`;
  const SL = (cls, x, y, w, h, body) => `<svg class="rig-s ${cls}" xmlns="${NS}" style="left:${x}px;top:${y}px" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}">${body}</svg>`;
  const Z = (cls, x, y, inner = '') => `<div class="rig-z ${cls}" style="left:${CX + x}px;top:${y}px">${inner}</div>`;
  const G = (u, body, extra = '') => `<g filter="url(#rgf${u})" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round" ${extra}>${body}</g>`;
  const ink2 = (d, w, col, extra = '') => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${n2(w + 1.5)}" ${extra}/><path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" ${extra}/>`;
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  const dark = (h, t = .3) => mix(h, '#1a110b', t), light = (h, t = .3) => mix(h, '#f6ecd4', t);
  // timers that die with the notice
  const clock = () => {
    let dead = false; const ts = new Set();
    return { later(fn, ms) { const t = setTimeout(() => { ts.delete(t); if (!dead) fn(); }, ms); ts.add(t); }, stop() { dead = true; ts.forEach(clearTimeout); ts.clear(); }, get dead() { return dead; } };
  };

  // ---- the envelope's geometry, by condition ----
  function envelope(c = {}) {
    const sag = c.sag || 0, lop = c.lop || 0, taut = c.taut || 0, dents = c.dents || [];
    const top = K.TOP + 6 + sag * 20 - taut * 3, H = HG - top;
    const R = K.ER * (.95 - .11 * sag + .05 * taut), m = MRX / R;
    const c0 = .38 + .12 * sag, ex = 2 + .35 * taut - .4 * sag, pw = 1.3 - .2 * sag + .2 * taut;
    // the profile: a dome down to the widest point, then the taper to the mouth
    const f = (t) => {
      if (t <= c0) return Math.pow(Math.max(0, 1 - Math.pow((c0 - t) / c0, ex)), 1 / ex);
      const s = (t - c0) / (1 - c0);
      return m + (1 - m) * (1 - Math.pow(s, pw)) - sag * .1 * Math.sin(Math.PI * s);
    };
    const side = (t, sd) => {
      let w = R * f(t) * (1 + sd * lop * .07 * (1 - t * t * t));
      for (const d of dents) if (d.side === sd) w -= d.depth * Math.exp(-(((t - d.t) / d.span) ** 2)) * (1 - t ** 8);
      return Math.max(0, w);
    };
    const cx = (t) => lop * 11 * Math.pow(1 - t, 1.4);
    const bow = (t) => .1 + .13 * t * t;                       // latitudes bow down, most at the mouth
    const pt = (k, t) => {
      const w = side(t, k < 0 ? -1 : 1), wm = (side(t, -1) + side(t, 1)) / 2;
      return [cx(t) + k * w, top + H * t + bow(t) * wm * Math.sqrt(Math.max(0, 1 - k * k))];
    };
    const line = (pts) => 'M' + pts.map(pp).join('L');
    const seamPts = (k, t0 = 0, t1 = 1, N = 14) => Array.from({ length: N + 1 }, (_, i) => pt(k, t0 + (t1 - t0) * i / N));
    const latPts = (t, k0 = -1, k1 = 1, N = 16) => { const a0 = Math.asin(k0), a1 = Math.asin(k1); return Array.from({ length: N + 1 }, (_, i) => pt(Math.sin(a0 + (a1 - a0) * i / N), t)); };
    const smooth = (p, ox = 0) => {
      let d = `M${n(p[0][0] + ox)},${n(p[0][1])}`;
      for (let i = 0; i < p.length - 1; i++) {
        const a = p[Math.max(0, i - 1)], b = p[i], e = p[i + 1], g = p[Math.min(p.length - 1, i + 2)];
        d += `C${n(b[0] + (e[0] - a[0]) / 6 + ox)},${n(b[1] + (e[1] - a[1]) / 6)} ${n(e[0] - (g[0] - b[0]) / 6 + ox)},${n(e[1] - (g[1] - b[1]) / 6)} ${n(e[0] + ox)},${n(e[1])}`;
      }
      return d;
    };
    const N = 26, L = [], Rr = [];
    for (let i = 0; i <= N; i++) { const t = Math.pow(i / N, 1.8); L.push(pt(-1, t)); Rr.push(pt(1, t)); }
    const ring = L.slice().reverse().concat(Rr.slice(1));
    const close = (ox) => `A${MRX},${MRY} 0 0 1 ${n(ring[0][0] + ox)},${n(ring[0][1])}Z`;
    const place = (k, t, s = 1) => {
      const [x, y] = pt(k, t), a = pt(k, Math.max(0, t - .03)), b = pt(k, Math.min(1, t + .03));
      return `translate(${n(x)},${n(y)}) rotate(${n(-Math.atan2(b[0] - a[0], b[1] - a[1]) / D)}) scale(${n2(s * Math.max(.3, Math.sqrt(1 - k * k)))},${s})`;
    };
    const along = (num, k0 = -.94, k1 = .94) => { const a0 = Math.asin(k0), a1 = Math.asin(k1); return Array.from({ length: num }, (_, i) => Math.sin(a0 + (a1 - a0) * (num === 1 ? .5 : i / (num - 1)))); };
    const patch = (k, t, w, h, o = {}) => {
      const x = w / 2, y = h / 2, q = [[-x, -y + 1], [x - 1, -y], [x, y - 1.5], [-x + 1.5, y]];
      let st = '';
      for (let i = 0; i < 4; i++) {
        const a = q[i], b = q[(i + 1) % 4], len = Math.hypot(b[0] - a[0], b[1] - a[1]), cnt = Math.max(2, Math.round(len / (o.gap || 4.5)));
        const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
        for (let j = 0; j < cnt; j++) {
          const v = (j + .5) / cnt, px = a[0] + (b[0] - a[0]) * v, py = a[1] + (b[1] - a[1]) * v, sk = j % 2 ? .9 : -.7;
          st += o.rivets ? `<circle cx="${n(px + nx * 2.2)}" cy="${n(py + ny * 2.2)}" r="1.1" fill="${o.stitch || '#c9c2b0'}" stroke-width=".5"/>` : `M${n(px + nx * 2.4 + sk)},${n(py + ny * 2.4)}L${n(px - nx * 2.4 - sk)},${n(py - ny * 2.4)}`;
        }
      }
      const dq = `M${q.map(pp).join('L')}Z`;
      return `<g transform="${place(k, t)} rotate(${o.rot || 0})"><path d="${dq}" fill="${o.fill || '#8a7a5c'}" stroke-width="1"/>${o.hatch ? `<path d="M${pp(q[0])}L0,${-y}L1,${y}L${pp(q[3])}Z" fill="${o.hatch}" stroke="none"/>` : ''}${o.rivets ? st : `<path d="${st}" fill="none" stroke="${o.stitch || INK}" stroke-width="${o.sw || .9}"/>`}</g>`;
    };
    return {
      cond: c, top, R, pt, place, along, patch, hw: side,
      out: smooth(ring) + close(0), outAbs: smooth(ring, CX) + close(CX),
      seam: (k, t0, t1) => line(seamPts(k, t0, t1)),
      lat: (t, k0, k1) => line(latPts(t, k0, k1)),
      gore: (k0, k1, t0 = 0, t1 = 1) => line([...seamPts(k0, t0, t1), ...seamPts(k1, t0, t1).reverse()]) + 'Z',
      band: (t0, t1, k0 = -1, k1 = 1) => line([...latPts(t0, k0, k1), ...latPts(t1, k0, k1).reverse()]) + 'Z',
      // where the four ropes leave the envelope (matching the rim at -R1, -R2, R2, R1)
      attach: [pt(-.95, .7), pt(-.74, .82), pt(.74, .82), pt(.95, .7)],
    };
  }

  // the envelope as one filtered drawing: skin art + the standard shading, outline, rope rings, the dark mouth
  function envMarkup(geo, a, u) {
    const cid = `rgv${u}-${++serial}`;
    const shade = `<g stroke="none"><path d="${geo.gore(-1, -.42)}" fill="url(#rgp${u})"/><path d="${geo.gore(-1, -.76)}" fill="url(#rgq${u})"/><path d="${geo.gore(-1, -.6)}" fill="#000" opacity=".13"/><path d="${geo.band(.8, 1)}" fill="#000" opacity=".2"/><path d="${geo.band(.1, .46, .6, .86)}" fill="#fff" opacity=".2"/></g>`;
    const rings = geo.attach.map((p) => `<circle cx="${n(p[0])}" cy="${n(p[1])}" r="2.3" fill="none" stroke-width="2.2"/><circle cx="${n(p[0])}" cy="${n(p[1])}" r="2.3" fill="none" stroke="${a.ring || '#9aa2a8'}" stroke-width=".9"/>`).join('');
    return S('rig-rim rig-envs', -W / 2, 0, W, HG + 10, `<defs><clipPath id="${cid}"><path d="${geo.out}"/></clipPath></defs>${G(u, `${a.under || ''}<g clip-path="url(#${cid})"><path d="${geo.out}" fill="${a.base || '#8b6b47'}" stroke="none"/>${a.inside || ''}${shade}</g><path d="${geo.out}" fill="none" stroke-width="1.3"/>${a.over || ''}${rings}<ellipse cx="0" cy="${HG}" rx="${MRX}" ry="${MRY}" fill="#170f0a" stroke-width="1.1"/>`)}`);
  }

  const GO = { night: .9, dusk: .65, day: .3, overcast: .42 };
  const BASE = `
.rig{position:relative;width:${W}px;pointer-events:none;--k:1;--rig-f1:#f08a2c;--rig-f2:#ffe9a8;--rig-gl:255,176,96;--rig-lip:#8d949b}
.rig *{box-sizing:border-box}
.rig-defs{position:absolute;left:0;top:0}
.rig-a{position:absolute;left:0;top:0;width:${W}px;height:0}
.rig-z{position:absolute;width:0;height:0}
.rig-s{position:absolute;overflow:visible;display:block}
.rig-s *{transform-box:view-box}
.rig[data-sky=night] .rig-rim{filter:drop-shadow(0 0 .7px rgba(255,230,186,.5))}
.rig[data-sky=dusk] .rig-rim{filter:drop-shadow(0 0 .6px rgba(255,226,190,.3))}
.rig-env,.rig-car{will-change:transform;transform-origin:${CX}px ${HG}px}
.rig-envb{transform-origin:${CX}px ${HG}px;animation:rig-eb 5.2s ease-in-out infinite alternate}
.rig-eglow{position:absolute;left:0;top:0;width:${W}px;height:${HG + 8}px;opacity:0;will-change:opacity;background:radial-gradient(78px 92px at ${CX}px ${HG + 6}px,rgba(var(--rig-gl),.66),rgba(var(--rig-gl),.22) 55%,rgba(var(--rig-gl),0))}
.rig-mglow{position:absolute;left:${CX - MRX + 1}px;top:${HG - MRY + .6}px;width:${2 * MRX - 2}px;height:${2 * MRY - 1.2}px;border-radius:50%;opacity:0;will-change:opacity;background:radial-gradient(closest-side,rgba(255,246,214,.95),rgba(var(--rig-gl),.9) 50%,rgba(var(--rig-gl),.35))}
.rig-flc{position:absolute;left:0;top:0;width:${W}px;height:${RY}px;clip-path:path("M0,${HG + 80}V${HG}H${CX - MRX}A${MRX},${MRY} 0 0 1 ${CX + MRX},${HG}H${W}V${HG + 80}Z")}
.rig-halo{position:absolute;left:-24px;top:-34px;width:48px;height:48px;border-radius:50%;opacity:0;will-change:opacity;background:radial-gradient(closest-side,rgba(var(--rig-gl),.6),rgba(var(--rig-gl),0))}
.rig-fl{will-change:transform,opacity;transform-origin:0 0}
.rig-fk{transform-origin:0 0;animation:rig-fk .41s ease-in-out infinite alternate}
.rig-fk+.rig-fk{animation-duration:.29s}
.rig-fk svg{left:-14px;top:-64px}
.rig-f1{fill:var(--rig-f1);stroke:rgba(150,60,10,.75);stroke-width:.8}.rig-f2{fill:var(--rig-f2)}
.rig-lipc{stroke:var(--rig-lip)}
.rig-lines{left:0;top:0}
.rig-cord use{fill:none;stroke-linecap:round}
.rig-cord-chain .c0{stroke:var(--cl);stroke-width:calc(var(--cw)*.55);opacity:.75}
.rig-cord-chain .c1{stroke:var(--cd);stroke-width:calc(var(--cw)*1.75);stroke-dasharray:2.2 4.6}
.rig-cord-chain .c2{stroke:var(--cl);stroke-width:var(--cw);stroke-dasharray:2.2 4.6}
.rig-cord-chain .c3{stroke:var(--cd);stroke-width:.8px;stroke-dasharray:1.8 5;stroke-dashoffset:-.2}
.rig-cord-rope .c0{stroke:var(--cd);stroke-width:calc(var(--cw) + 1.3px)}
.rig-cord-rope .c1{stroke:var(--cl);stroke-width:var(--cw);stroke-dasharray:3 1;stroke-linecap:butt}
.rig-clip{position:absolute;left:-40px;top:-60px;width:${W + 80}px;height:${RY + 5 + 60}px;overflow:hidden}
.rig-in{position:absolute;left:40px;top:60px;width:${W}px;height:0}
.rig-sign{position:absolute;top:${SY}px;transform-origin:50% 0;will-change:transform;text-align:center;font-family:"Cormorant Garamond",Georgia,serif;color:#ece5d2}
.rig-zoom{position:relative}
.rig-board{position:absolute;inset:0}
.rig-board svg{position:absolute;left:0;top:0;overflow:visible;display:block}
.rig-text{position:relative;padding:8px 10px}
.rig-text>div:empty{display:none}
.rig-tag{font:500 12px/1.3 Cinzel,Georgia,serif;letter-spacing:.24em;margin-right:-.24em;text-transform:uppercase}
.rig-title{font:italic 600 15px/1.07 "Cormorant Garamond",Georgia,serif;text-wrap:balance;overflow-wrap:anywhere}
.rig-fig{font:600 25px/.96 "Cormorant Garamond",Georgia,serif;font-variant-numeric:lining-nums;white-space:nowrap}
.rig-unit{font:italic 500 14px/1 "Cormorant Garamond",Georgia,serif;margin-left:3px}
.rig-rate{display:flex;justify-content:center;align-items:center;gap:6px;min-height:14px;margin-top:1px}
.rig-rate svg{display:block;overflow:visible}
.rig-word{font:400 12.5px/1 "IM Fell English SC","IM Fell English",Georgia,serif;letter-spacing:.16em;margin-right:-.16em}
.rig-q{font:italic 400 14px/1 "IM Fell English",Georgia,serif}
.rig-more{font:italic 500 12px/1.1 "Cormorant Garamond",Georgia,serif;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rig-fit1 .rig-title{font-size:14px!important;line-height:1!important}
.rig-fit1 .rig-fig{font-size:22px!important;line-height:.95!important}
.rig-fit1 .rig-unit{font-size:13px!important}
.rig-fit1 .rig-rate{margin-top:0!important;min-height:13px!important}
.rig-fit1 .rig-more{margin-top:1px!important;line-height:1.05!important}
.rig-fit1 .rig-tag{line-height:1.15!important}
.rig-fit1[data-kind=achievement] .rig-title{font-size:12.5px!important;line-height:1.05!important;text-wrap:wrap}
.rig-fit2 .rig-title{font-size:13.5px!important}
.rig-fit2 .rig-fig{font-size:20px!important}
.rig-fit2[data-kind=achievement] .rig-text{padding-left:8px!important;padding-right:8px!important}
.rig-fit2 .rig-tag{line-height:1.1!important}
.rig-fit2[data-kind=achievement] .rig-title{font-size:12px!important;line-height:1.04!important;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden}
.rig-still{margin:0 auto}
.rig-rm *,.rig-rm *::before,.rig-rm *::after{transition:none!important;animation:none!important}
@keyframes rig-eb{from{transform:scale(1,1)}to{transform:scale(1.012,.99)}}
@keyframes rig-fk{0%{transform:scale(1,1) skewX(0)}45%{transform:scale(.9,1.08) skewX(5deg)}100%{transform:scale(1.06,.93) skewX(-5deg)}}
`;
  const FLAME = `<div class="rig-z rig-fk">${SL('', -14, -64, 28, 66, '<path class="rig-f1" d="M0,0C-9,-2 -12,-11 -7,-21C-6,-15 -3,-16 -4,-29C-1,-39 -2,-50 2,-62C4,-48 9,-38 8,-24C10,-13 8,-3 0,0Z"/>')}</div><div class="rig-z rig-fk">${SL('', -14, -64, 28, 66, '<path class="rig-f2" d="M0,-1C-5,-3 -6,-10 -2,-19C0,-27 1,-36 2,-45C5,-32 6,-18 5,-9C4,-4 2,-1 0,-1Z"/>')}</div>`;
  const LIP = `M${-MRX},${HG}A${MRX},${MRY} 0 0 0 ${MRX},${HG}`;
  const cordG = (pid, c = {}) => {
    const kind = c.kind === 'chain' ? 'chain' : 'rope', cnt = kind === 'chain' ? 4 : 2;
    let s = ''; for (let i = 0; i < cnt; i++) s += `<use href="#${pid}" class="c${i}"/>`;
    return `<g class="rig-cord rig-cord-${kind}" style="--cd:${c.dark || '#17120e'};--cl:${c.light || '#c9b07c'};--cw:${c.w || 1.5}px"><defs><path id="${pid}"/></defs>${s}</g>`;
  };

  // signs whose text was measured before the web fonts arrived are fitted again
  const REFIT = new Set();
  const refit = () => REFIT.forEach((f) => f());
  if (document.fonts) { document.fonts.ready.then(refit); document.fonts.addEventListener?.('loadingdone', refit); }
  let host = null;
  const measure = (R) => {
    if (R.root.isConnected) return R.sign.offsetHeight;
    if (!host) { host = document.createElement('div'); host.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none'; }
    document.body.append(host); host.append(R.root);
    const h = R.sign.offsetHeight;
    R.root.remove(); host.remove();
    return h;
  };

  function create(ctx, spec) {
    const id = spec.id, E = ctx.el, live = new Set();
    Harness.css('rig', BASE);
    if (spec.css) Harness.css(id, spec.css);
    const MOODS = spec.moods || ['calibrating', 'poor', 'meh', 'good', 'great', 'superb', 'pvp', 'levelup', 'death', 'achievement'];
    const norm = (m) => (MOODS.includes(m) ? m : 'calibrating');
    const sg = { w: 158, hx: 58, k: 13, c: 1.9, below: 4, cord: {}, ...spec.sign };
    // the sign is shown at K.SS; its cords run near vertical from just under the rim
    const SWZ = sg.w * SS, HXZ = sg.hx * SS;
    if (sg.bx == null) sg.bx = HXZ;
    if (sg.by == null) sg.by = RY + K.CY;
    const extra = spec.lines || [];

    function setEnv(R, mood, fade) {
      const e = spec.envelope(mood) || {}, geo = envelope(e.cond), art = e.art ? e.art(geo, R.u) : {};
      const layer = ctx.svg(`<div class="rig-a rig-envl">${envMarkup(geo, art, R.u)}${art.html || ''}</div>`);
      const old = R.envl;
      R.envh.append(layer); R.envl = layer; R.geo = geo;
      R.eglow.style.clipPath = `path("${geo.outAbs}")`;
      R.root.style.setProperty('--rig-lip', art.lip || '#8d949b');
      if (!old) return;
      if (fade && !ctx.reduced) {
        layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320 });
        old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, fill: 'forwards' }).onfinish = () => old.remove();
      } else old.remove();
    }

    // the sign's text: every string is the game's, so textContent only
    function fill(R, nt) {
      const mood = norm(nt.mood), b = R.text, ach = nt.kind === 'achievement';
      R.notice = nt;
      for (const el of [R.root, R.sign]) { el.dataset.mood = mood; el.dataset.kind = nt.kind; }
      b.textContent = '';
      if (ach) b.append(E('div', 'rig-tag', nt.label));
      b.append(E('div', 'rig-title', nt.title));
      const fig = E('div', 'rig-fig', nt.big);
      if (nt.unit) fig.append(E('span', 'rig-unit', nt.unit));
      b.append(fig);
      if (nt.kind === 'kill') {
        const r = E('div', 'rig-rate'), pips = sg.pips && sg.pips(mood, nt);
        if (pips) r.append(ctx.svg(pips));
        r.append(nt.label ? E('span', 'rig-word', nt.label) : E('span', 'rig-q', '?'));
        b.append(r);
      } else if (!ach && nt.label) b.append(E('div', 'rig-tag', nt.label));
      b.append(E('div', 'rig-more', nt.more));
      return mood;
    }
    // the board is drawn to the measured text (never called from the frame callback)
    function fit(R) {
      // the height limit: tighten the text in two steps until the sign ends at or above MAXH
      R.sign.classList.remove('rig-fit1', 'rig-fit2');
      let h = Math.ceil(measure(R));                      // real px, after the zoom
      for (const cls of ['rig-fit1', 'rig-fit2']) { if (SY + h < K.MAXH) break; R.sign.classList.add(cls); h = Math.ceil(measure(R)); }
      // last resort: the sign hangs up to 5 px higher
      R.lift = Math.max(0, Math.min(5, SY + h - K.MAXH + 1));
      R.sign.style.top = SY - R.lift + 'px';
      if (SY - R.lift + h >= K.MAXH && R.warned !== h) { R.warned = h; console.warn(`Rig: the ${id} sign for "${R.notice.kind}/${R.mood}" ends at y ${SY - R.lift + h}, below MAXH ${K.MAXH}. Reduce the sign's padding or type in the skin.`); }
      const bh = Math.round(h / SS), key = `${bh}|${R.mood}|${R.notice.kind}`;   // the board's height in the skin's own (unscaled) px
      if (key !== R.fitKey) {
        R.fitKey = key;
        const art = sg.board ? sg.board({ w: sg.w, h: bh, hx: sg.hx, mood: R.mood, kind: R.notice.kind, u: R.u }) : `<rect width="${sg.w}" height="${bh}" fill="#2a2420" stroke="${INK}"/>`;
        R.board.replaceChildren(ctx.svg(`<svg class="rig-rim" xmlns="${NS}" width="${sg.w}" height="${bh}" viewBox="0 0 ${sg.w} ${bh}">${art}</svg>`));
      }
      R.h = SY - R.lift + h + sg.below;
      R.root.style.height = R.h + 'px';
    }

    function build(nt) {
      const u = ++uid;
      const lines = [spec.ropes || {}, ...extra.map((l) => l.cord || {})].map((c, i) => cordG(`rgl${u}-${i}`, c)).join('');
      const root = ctx.svg(`<div class="rig ${id}-v">${defs(u, spec.defs ? spec.defs(u) : '')}
<div class="rig-a rig-env"><div class="rig-a rig-envb"><div class="rig-a rig-envh"></div></div><div class="rig-eglow"></div><div class="rig-mglow"></div>
<div class="rig-flc"><div class="rig-z" style="left:${CX}px;top:${FY}px"><div class="rig-halo"></div><div class="rig-z rig-fl">${FLAME}</div></div></div>
${S('rig-lip', -MRX - 3, HG - 2, 2 * MRX + 6, MRY + 6, `<path d="${LIP}" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/><path class="rig-lipc" d="${LIP}" fill="none" stroke-width="1.9" stroke-linecap="round"/>`)}
<div class="rig-a rig-burner">${spec.burner ? spec.burner(u) : ''}</div></div>
<svg class="rig-s rig-lines" xmlns="${NS}" width="${W}" height="10">${lines}</svg>
<div class="rig-a rig-car"><div class="rig-clip"><div class="rig-in">${spec.behind ? spec.behind(u) : ''}</div></div>${spec.basket ? spec.basket(u) : ''}${spec.front ? spec.front(u) : ''}</div>
<svg class="rig-s rig-lines" xmlns="${NS}" width="${W}" height="10">${cordG(`rgl${u}-s`, sg.cord)}</svg>
</div>`);
      const q = (s) => root.querySelector(s), qa = (s) => [...root.querySelectorAll(s)];
      const sign = E('div', `rig-sign ${id}-sign`), zoom = E('div', 'rig-zoom'), board = E('div', 'rig-board'), text = E('div', 'rig-text');
      sign.style.width = SWZ + 'px'; sign.style.left = (W - SWZ) / 2 + 'px';
      zoom.style.width = sg.w + 'px'; zoom.style.zoom = SS;
      zoom.append(board, text); sign.append(zoom); root.append(sign);
      const R = {
        root, u, q, qa, sign, board, text, mood: norm(nt.mood), notice: nt, h: 0, lift: 0, fitKey: '', geo: null, envl: null,
        env: q('.rig-env'), envh: q('.rig-envh'), car: q('.rig-car'), eglow: q('.rig-eglow'), mglow: q('.rig-mglow'), halo: q('.rig-halo'), fl: q('.rig-fl'),
        ropeP: q(`#rgl${u}-0`), extraP: extra.map((_, i) => q(`#rgl${u}-${i + 1}`)), hangP: q(`#rgl${u}-s`),
      };
      R.mood = fill(R, nt);
      setEnv(R, R.mood, false);
      root.dataset.sky = ctx.skyMode();
      root.style.setProperty('--k', 1 / ctx.pace());
      if (ctx.reduced) root.classList.add('rig-rm');
      fit(R);
      const refitMe = () => { if (R.root.isConnected) fit(R); else if (performance.now() - born > 4000) REFIT.delete(refitMe); };
      const born = performance.now();
      REFIT.add(refitMe); R.forget = () => REFIT.delete(refitMe);
      R.life = (spec.life && spec.life(R)) || {};
      return R;
    }

    // ---- every frame: the lean, the car swinging late, the ropes, the sign on its two cords, the flame ----
    function animator(R, quiet) {
      let last = 0, sx = 0, sv = 0, ph = quiet ? 'read' : '';
      const go = GO[ctx.skyMode()] || .5, AR = BY - HG, life = R.life;
      const att = R.geo.attach.map((p) => p.slice()), rim = [-K.R1, -K.R2, K.R2, K.R1];
      let ce = 1, se = 0, c = 1, s = 0;
      const pe = (x, y) => [CX + x * ce - (y - HG) * se, HG + x * se + (y - HG) * ce];
      const pc = (x, y) => [CX + x * c - (y - HG) * s, HG + x * s + (y - HG) * c];
      const info = { burn: .15, lean: 0, swing: 0, hang: 0, d: 0, dt: .016, now: 0, phase: 'read', pe, pc };
      R.kick = (v) => { sv += v; };
      return (f) => {
        const now = performance.now(), dt = last ? Math.min(.05, (now - last) / 1000) : .016; last = now;
        const ea = f.lean * .8, phi = f.swing;
        ce = Math.cos(ea * D); se = Math.sin(ea * D); c = Math.cos(phi * D); s = Math.sin(phi * D);
        R.env.style.transform = `rotate(${ea.toFixed(2)}deg)`;
        R.car.style.transform = `rotate(${phi.toFixed(2)}deg)`;
        // the ropes, hinged at both ends (their upper ends follow a changed envelope)
        const tg = R.geo.attach, e = Math.min(1, dt * 7);
        let d = '';
        for (let i = 0; i < 4; i++) {
          att[i][0] += (tg[i][0] - att[i][0]) * e; att[i][1] += (tg[i][1] - att[i][1]) * e;
          d += `M${pp(pe(att[i][0], att[i][1]))}L${pp(pc(rim[i], RY - 1))}`;
        }
        R.ropeP.setAttribute('d', d);
        // the sign: a heavy thing on two cords, following the basket late
        const bx = -AR * s, SYe = SY - R.lift, LC = Math.max(3, SYe - sg.by), DM = Math.min(LC * .65, 3.5);
        sv += ((bx + f.swing * .7 - f.lean * .6 - sx) * sg.k * 1.6 - sv * sg.c * 1.9) * dt; sx += sv * dt;
        const dd = Math.max(-DM, Math.min(DM, sx - bx)), th = Math.asin(dd / LC), dy = -LC * (1 - Math.cos(th)) + AR * (c - 1), X = bx + dd;
        const rot = phi * .4 + dd * .35, cr = Math.cos(rot * D), sr = Math.sin(rot * D), lo = 2 * SS;
        R.sign.style.transform = `translate(${X.toFixed(1)}px,${dy.toFixed(1)}px) rotate(${rot.toFixed(2)}deg)`;
        const h1 = [CX + X - HXZ * cr - lo * sr, SYe + dy - HXZ * sr - lo * cr], h2 = [CX + X + HXZ * cr - lo * sr, SYe + dy + HXZ * sr - lo * cr];
        R.hangP.setAttribute('d', `M${pp(pc(-sg.bx, sg.by))}L${pp(h1)}M${pp(pc(sg.bx, sg.by))}L${pp(h2)}`);
        // the flame and its light: from burn alone
        const b = Math.max(0, Math.min(1, f.burn));
        R.fl.style.transform = `scale(${(.5 + .55 * b).toFixed(2)},${(.15 + .85 * b).toFixed(2)})`;
        R.fl.style.opacity = (.72 + .28 * b).toFixed(2);
        R.halo.style.opacity = (b * b * go).toFixed(2);
        R.mglow.style.opacity = (.12 + .88 * b).toFixed(2);
        R.eglow.style.opacity = (Math.pow(b, 1.3) * go).toFixed(2);
        info.burn = b; info.lean = ea; info.swing = phi; info.hang = -phi + dd * 2.4; info.d = dd; info.dt = dt; info.now = now; info.phase = f.phase;
        if (life.frame) life.frame(info);
        for (let i = 0; i < extra.length; i++) R.extraP[i].setAttribute('d', `M${pp(extra[i].a(info, R))}L${pp(extra[i].b(info, R))}`);
        if (f.phase !== ph) {
          ph = f.phase;
          if (ph === 'read') { R.root.classList.add('rig-at'); if (life.arrive) life.arrive(R.mood); }
          if (ph === 'leave' && !ctx.reduced) { R.root.classList.add('rig-off'); if (life.leave) life.leave(); }
        }
      };
    }
    const REST = { lean: 0, swing: 0, phase: 'read', t: 0, vy: 0, burn: .15 };
    const stop = (R) => { if (R.life.stop) R.life.stop(); R.forget(); };

    return {
      show(nt) {
        const R = build(nt);
        const fl = ctx.fly(R.root, { w: W, h: R.h, frame: animator(R, false) });
        const rec = { fl, R }; live.add(rec);
        fl.gone.then(() => { stop(R); live.delete(rec); });
        return {
          update(nn) {
            if (!R.root.isConnected) return;
            const was = R.mood;
            R.mood = fill(R, nn); fit(R);
            if (was !== R.mood) setEnv(R, R.mood, true);
            fl.extend(700);
            if (ctx.reduced) return;
            // struck like a bell
            R.sign.animate([0, 1.3, -1.1, .8, -.6, .4, -.2, 0].map((x, i) => ({ transform: `translate(${x}px,${i === 1 ? .8 : 0}px) rotate(${x * .3}deg)` })), { duration: 430, easing: 'linear', composite: 'add' });
            if (R.life.struck) R.life.struck();
            if (was !== R.mood && R.root.classList.contains('rig-at') && R.life.changed) R.life.changed(R.mood, was);
          },
        };
      },
      still(nt) {
        const R = build(nt), fr = animator(R, true);
        R.root.classList.add('rig-at', 'rig-still');
        fr(REST);
        if (R.life.arrive && !ctx.reduced) R.life.arrive(R.mood);
        if (!ctx.reduced) {
          const t0 = performance.now(), ph = Math.random() * 6;
          let seen = false;
          const loop = (now) => {
            if (R.root.isConnected) seen = true; else if (seen || now - t0 > 3000) return stop(R);
            const t = now - t0;
            fr({ lean: Math.sin(t * .0007 + ph) * .6, swing: Math.sin(t * .0011 + ph) * .8 + Math.sin(t * .0023) * .25, phase: 'read', t, vy: 0, burn: .15 + .05 * Math.sin(t * .003) });
            requestAnimationFrame(loop);
          };
          requestAnimationFrame(loop);
        }
        return R.root;
      },
      clear() {
        for (const r of [...live]) { stop(r.R); r.fl.end(); }
        live.clear();
      },
    };
  }

  return { K, INK, create, envelope, kit: { INK, NS, n, n2, pp, S, SL, Z, G, P, Q, filt, hatch, ink2, mix, dark, light, clock } };
})();
