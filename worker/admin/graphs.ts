// The admin page's graph views (stage 66, ADR 0157, the owner's pick 2b):
// Use, Storage and Sharing, drawn by the page itself as SVG.
//
// Interface with the page's shell (worker/admin/page.ts joins the strings):
// ADMIN_GRAPHS_JS runs inside the page's one IIFE, after the shell's
// helpers and before the boot, and may use only these names of the shell:
//
//   el(tag, text?, cls?)        an element, text by textContent
//   svg(tag, attrs?)            an SVG element (createElementNS), attributes set one by one
//   fmt(n)                      a whole number, en-GB grouping
//   size(bytes)                 '12.3 MB'
//   utc(ms)                     'YYYY-MM-DD HH:MM'
//   api(path)                   GET → Promise of the parsed JSON (rejects with Error(code))
//   registerView(name, view)    view = {title, group, render(root, params)}; root is an
//                               empty element of the main area, params the hash's rest
//
// ADMIN_GRAPHS_CSS is appended to the page's CSS.
//
// How it works: each view keeps its range in the hash (`#use/90d`, set with
// history.replaceState so the shell does not render twice) and reads
// `GET /api/admin/graphs?range=` once per open, range change or Reload. The
// answer becomes a list of graph models ({title, kind, xs, series, f, ...});
// a card draws a model small, and large (in place, the whole row) with a
// legend, direct end labels, a crosshair and tooltip moved by the pointer or
// the arrow keys, and a Table toggle. A missing metric is null: a gap in a
// line, no bar, '–' in the table. Colours come from classes (gr-s1 … gr-s3)
// and CSS tokens, never from style strings (the CSP); sizes by CSSOM.
// Everything from the API is set as text. No backslashes or backticks below:
// this is a template string.

export const ADMIN_GRAPHS_JS = `
  var GR_RANGES = [['24h', '24 h'], ['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['all', 'All']];
  var GR_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var GR_KINDS = ['Runs', 'Published', 'Small items'];

  function grRangeOf(params) {
    var p = Array.isArray(params) ? params[0] : String(params == null ? '' : params).split('/')[0];
    for (var i = 0; i < GR_RANGES.length; i++) if (GR_RANGES[i][0] === p) return p;
    return '30d';
  }
  function grRangeLabel(r) {
    for (var i = 0; i < GR_RANGES.length; i++) if (GR_RANGES[i][0] === r) return GR_RANGES[i][1];
    return r;
  }
  /** 'YYYY-MM-DD' → '16 Nov'. */
  function grShortDay(iso) {
    var p = String(iso).split('-');
    return Number(p[2]) + ' ' + (GR_MONTHS[Number(p[1]) - 1] || '');
  }
  /** '15 Nov 16:00', or '15 Nov' for a day. */
  function grWhen(ms, daily) {
    var u = utc(ms);
    return grShortDay(u.slice(0, 10)) + (daily ? '' : ' ' + u.slice(11));
  }
  function grNum(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function grR(v) { return Math.round(v * 10) / 10; }
  /** A round step (1, 2 or 5 × 10^n) at or above raw. */
  function grStep(raw) {
    if (!(raw > 0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }
  /** Ticks from 0 to a round top at or above max, about n steps. */
  function grTicks(max, n, whole) {
    var step = grStep(max / n);
    if (whole && step < 1) step = 1;
    var count = Math.max(1, Math.ceil(max / step - 1e-9));
    var t = [];
    for (var i = 0; i <= count; i++) t.push(i * step);
    return t;
  }
  function grPct(v, total) {
    if (!total) return '0 %';
    var p = (100 * v) / total;
    return p > 0 && p < 1 ? '<1 %' : Math.round(p) + ' %';
  }

  // --- Models ---

  /** A model over the answer's days: o.series = [{name, c, metric} | {name, c, get(m)}]. */
  function grDaysModel(g, o) {
    var m = { xHead: 'Day', f: fmt, kind: 'line' };
    for (var k in o) m[k] = o[k];
    m.xs = g.days.map(function (d) {
      return { axis: grShortDay(d.day), label: d.day + (d.final ? '' : ', so far'), partial: !d.final };
    });
    m.series = o.series.map(function (s, si) {
      return {
        name: s.name,
        c: s.c || si + 1,
        vals: g.days.map(function (d) { return s.get ? s.get(d.m || {}) : grNum((d.m || {})[s.metric]); }),
      };
    });
    return grFinish(m);
  }

  /** The empty state, and the big figure: the newest whole day, today's so far beside it. */
  function grFinish(m) {
    var n = m.xs.length, any = false;
    m.series.forEach(function (s) { s.vals.forEach(function (v) { if (v != null) any = true; }); });
    if (!any && !m.empty) m.empty = m.emptyText || 'No figures in this range yet.';
    if (m.big !== undefined || m.empty) return m;
    function at(i) {
      if (m.kind !== 'stack') return m.series[0].vals[i];
      var sum = null;
      m.series.forEach(function (s) { if (s.vals[i] != null) sum = (sum || 0) + s.vals[i]; });
      return sum;
    }
    var last = -1, today = -1;
    for (var i = n - 1; i >= 0; i--) {
      if (at(i) == null) continue;
      if (m.xs[i].partial) { if (today < 0) today = i; } else { last = i; break; }
    }
    var sub = [];
    if (last >= 0) {
      m.big = m.f(at(last));
      sub.push(m.xs[last].axis);
      if (m.kind !== 'stack') {
        m.series.slice(1).forEach(function (s) { if (s.vals[last] != null) sub.push(s.name + ' ' + m.f(s.vals[last])); });
      }
      if (today >= 0) sub.push('today so far ' + m.f(at(today)));
    } else {
      m.big = today >= 0 ? m.f(at(today)) : '–';
      if (today >= 0) sub.push('today so far');
    }
    m.sub = sub.join(' · ');
    return m;
  }

  function grOnlineModel(g) {
    var pts = g.online || [], b = g.bucketMinutes || 5, n = pts.length;
    var daily = b >= 1440;
    var m = {
      id: 'online', title: 'Online and playing', kind: 'line', f: fmt, xHead: daily ? 'Day' : 'Time (UTC)',
      desc: b <= 5 ? 'each 5-minute sample' : daily ? 'the highest of each day' : 'the highest of each ' + (b < 60 ? b + ' minutes' : b === 60 ? 'hour' : b / 60 + ' hours'),
      xs: pts.map(function (p) {
        var u = utc(p.ts);
        return { axis: daily || g.range !== '24h' ? grShortDay(u.slice(0, 10)) : u.slice(11), label: daily ? u.slice(0, 10) : u + ' UTC', partial: false };
      }),
      series: [
        { name: 'Online', c: 1, vals: pts.map(function (p) { return grNum(p.online); }) },
        { name: 'Playing', c: 2, vals: pts.map(function (p) { return grNum(p.playing); }) },
      ],
      emptyText: 'No samples in this range.',
    };
    if (n > 1) {
      var t0 = pts[0].ts, t1 = pts[n - 1].ts;
      m.pos = function (i) { return (pts[i].ts - t0) / (t1 - t0); };
      m.brk = function (i) { return i > 0 && pts[i].ts - pts[i - 1].ts > 1.5 * b * 60000; };
    }
    if (n) {
      var hi = 0;
      for (var i = 1; i < n; i++) if ((pts[i].online || 0) > (pts[hi].online || 0)) hi = i;
      m.big = fmt(pts[n - 1].online || 0);
      m.sub = 'online, latest · highest ' + fmt(pts[hi].online || 0) + ' at ' + grWhen(pts[hi].ts, daily);
    }
    return grFinish(m);
  }

  /** A horizontal bar list of a split: the six largest and Other. */
  function grSplitModel(id, title, split) {
    var all = [], total = 0;
    for (var k in split || {}) {
      var v = grNum(split[k]);
      if (v == null || v <= 0) continue;
      all.push({ key: k, v: v });
      total += v;
    }
    all.sort(function (a, b) { return b.v - a.v || (a.key < b.key ? -1 : 1); });
    var rows = all.slice(0, all.length > 7 ? 6 : 7);
    if (all.length > 7) {
      var rest = 0;
      all.slice(6).forEach(function (r) { rest += r.v; });
      rows.push({ key: 'Other', v: rest, other: true });
    }
    return {
      id: id, title: title, kind: 'hbar', rows: rows, all: all, total: total,
      desc: 'share of the devices of the range’s days',
      empty: all.length ? '' : 'No devices in this range yet.',
    };
  }

  function grLargestModel(g) {
    var rows = (g.largest || []).map(function (a) {
      var parts = [grNum(a.runBytes) || 0, grNum(a.pubBytes) || 0, grNum(a.itemBytes) || 0];
      return { name: String(a.name), parts: parts, total: parts[0] + parts[1] + parts[2] };
    });
    return {
      id: 'largest', title: 'The ten largest accounts', kind: 'top', rows: rows,
      series: GR_KINDS.map(function (name, i) { return { name: name, c: i + 1 }; }),
      desc: 'by bytes now; a name opens the account',
      empty: rows.length ? '' : 'No accounts store anything yet.',
    };
  }

  // --- Drawing ---

  /** The SVG of a line, bar or stacked bar model, and the geometry the hover needs. */
  function grPlot(m, large, width) {
    var W = large ? width : 440, H = large ? (W > 600 ? 300 : 230) : 140;
    var n = m.xs.length, k = m.series.length, stack = m.kind === 'stack', bars = m.kind !== 'line';
    var max = 0, i;
    for (i = 0; i < n; i++) {
      var sum = 0;
      m.series.forEach(function (s) {
        var v = s.vals[i];
        if (v == null) return;
        if (stack) sum += v; else if (v > max) max = v;
      });
      if (stack && sum > max) max = sum;
    }
    var ticks = grTicks(max > 0 ? max : 1, large ? 4 : 2, m.f === fmt);
    var top = ticks[ticks.length - 1];
    var tlabs = ticks.map(function (t) { return m.f(t); });
    var cw = large ? 7 : 6.6;
    var L = 10 + cw * Math.max.apply(null, tlabs.map(function (t) { return t.length; }));
    var ends = [];
    if (large && !bars && k <= 4) {
      m.series.forEach(function (s) {
        for (var j = n - 1; j >= 0; j--) {
          if (s.vals[j] != null) { ends.push({ s: s, j: j, text: s.name + ' ' + m.f(s.vals[j]) }); return; }
        }
      });
    }
    var R = 12;
    ends.forEach(function (e) { R = Math.max(R, 14 + cw * e.text.length); });
    R = Math.min(R, W / 3);
    var T = 10, B = 22, w = W - L - R, h = H - T - B, sw = w / Math.max(n, 1);
    var frac = m.pos || function (j) { return (j + 0.5) / n; };
    function X(j) { return L + w * frac(j); }
    function Y(v) { return T + h - (h * v) / top; }
    var root = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': m.title, 'class': 'gr-svg' + (large ? ' is-large' : '') });
    function txt(x, y, text, anchor, cls) {
      var t = svg('text', { x: grR(x), y: grR(y), 'text-anchor': anchor, 'class': cls });
      t.textContent = text;
      root.append(t);
      return t;
    }
    var gd = '';
    ticks.forEach(function (t, j) {
      var y = grR(Y(t));
      gd += 'M' + grR(L) + ' ' + y + 'H' + grR(L + w);
      txt(L - 6, y + 4, tlabs[j], 'end', 'gr-ylab');
    });
    root.append(svg('path', { d: gd, 'class': 'gr-gl' }));
    var nl = Math.min(n, large ? (W > 600 ? 6 : 4) : 3), seen = {};
    for (var q = 0; q < nl; q++) {
      var ix = nl === 1 ? n - 1 : Math.round((q * (n - 1)) / (nl - 1));
      if (seen[ix]) continue;
      seen[ix] = 1;
      txt(Math.min(Math.max(X(ix), L + 18), L + w - 18), H - 6, m.xs[ix].axis, 'middle', 'gr-xlab');
    }
    var p = { svg: root, W: W, H: H, L: L, T: T, w: w, h: h, n: n, sw: sw, X: X, Y: Y, bars: bars };

    if (bars) {
      var gap = sw > 4 ? 2 : sw > 2 ? 1 : 0;
      var inner = sw - gap;
      var bw = Math.max(0.6, stack ? inner : (inner - gap * (k - 1)) / k);
      var acc = [], topS = [];
      for (i = 0; i < n; i++) {
        acc.push(0);
        topS.push(-1);
        m.series.forEach(function (s, si) { if (s.vals[i] > 0) topS[i] = si; });
      }
      m.series.forEach(function (s, si) {
        var d = '', dp = '';
        for (var j = 0; j < n; j++) {
          var v = s.vals[j];
          if (v == null || v <= 0) continue;
          var x = L + sw * j + gap / 2 + (stack ? 0 : si * (bw + gap));
          var y0, y1;
          if (stack) {
            y0 = Y(acc[j]) - (acc[j] > 0 ? gap : 0);
            acc[j] += v;
            y1 = Y(acc[j]);
          } else {
            y0 = Y(0);
            y1 = Y(v);
          }
          if (y0 - y1 < 0.3) continue;
          var path = grBar(x, y0, y1, bw, !stack || topS[j] === si);
          if (m.xs[j].partial) dp += path; else d += path;
        }
        var cls = 'gr-barp gr-s' + s.c;
        if (d) root.append(svg('path', { d: d, 'class': cls }));
        if (dp) root.append(svg('path', { d: dp, 'class': cls + ' is-sofar' }));
      });
    } else {
      m.series.forEach(function (s) {
        var cls = 'gr-s' + s.c, d = '', dd = '', prev = -1;
        for (var j = 0; j < n; j++) {
          var v = s.vals[j];
          if (v == null) { prev = -1; continue; }
          var pt = grR(X(j)) + ' ' + grR(Y(v));
          var joined = prev >= 0 && !(m.brk && m.brk(j));
          if (joined && m.xs[j].partial) dd += 'M' + grR(X(prev)) + ' ' + grR(Y(s.vals[prev])) + 'L' + pt;
          else if (joined) d += 'L' + pt;
          else d += 'M' + pt;
          if (!joined) {
            var next = j + 1 < n && s.vals[j + 1] != null && !(m.brk && m.brk(j + 1));
            if (!next) root.append(svg('circle', { cx: grR(X(j)), cy: grR(Y(v)), r: 2.5, 'class': 'gr-pt ' + cls }));
          }
          prev = j;
        }
        if (d) root.append(svg('path', { d: d, 'class': 'gr-line ' + cls }));
        if (dd) root.append(svg('path', { d: dd, 'class': 'gr-line is-sofar ' + cls }));
      });
      ends.forEach(function (e) { e.y = Y(e.s.vals[e.j]) + 4; });
      ends.sort(function (a, b) { return a.y - b.y; });
      for (i = 1; i < ends.length; i++) if (ends[i].y < ends[i - 1].y + 14) ends[i].y = ends[i - 1].y + 14;
      var over = ends.length ? ends[ends.length - 1].y - (T + h + 4) : 0;
      ends.forEach(function (e) {
        txt(L + w + 8, over > 0 ? e.y - over : e.y, e.text, 'start', 'gr-dl');
      });
    }
    return p;
  }

  /** A bar from y0 (base) up to y1, its top corners rounded. */
  function grBar(x, y0, y1, bw, round) {
    var r = round ? Math.min(3, bw / 2, y0 - y1) : 0;
    var s = 'M' + grR(x) + ' ' + grR(y0) + 'V' + grR(y1 + r);
    if (r) s += 'Q' + grR(x) + ' ' + grR(y1) + ' ' + grR(x + r) + ' ' + grR(y1);
    s += 'H' + grR(x + bw - r);
    if (r) s += 'Q' + grR(x + bw) + ' ' + grR(y1) + ' ' + grR(x + bw) + ' ' + grR(y1 + r);
    return s + 'V' + grR(y0) + 'Z';
  }

  /** The crosshair (lines) or band (bars) and the tooltip; pointer and arrow keys. */
  function grHover(m, p, plot) {
    var root = p.svg, cur = -1;
    var mark = p.bars
      ? svg('rect', { y: grR(p.T), height: grR(p.h), width: grR(p.sw), x: 0, 'class': 'gr-band', visibility: 'hidden' })
      : svg('line', { x1: 0, x2: 0, y1: grR(p.T), y2: grR(p.T + p.h), 'class': 'gr-cross', visibility: 'hidden' });
    root.insertBefore(mark, root.firstChild);
    var dots = p.bars ? [] : m.series.map(function (s) {
      var c = svg('circle', { cx: 0, cy: 0, r: 4, 'class': 'gr-dot gr-s' + s.c, visibility: 'hidden' });
      root.append(c);
      return c;
    });
    var tip = el('div', null, 'gr-tip');
    tip.hidden = true;
    tip.setAttribute('aria-live', 'polite');
    plot.append(tip);
    plot.tabIndex = 0;
    plot.setAttribute('aria-label', m.title + ': the arrow keys move through the values');

    function show(i) {
      if (i < 0 || i >= p.n) return;
      cur = i;
      var x = p.X(i);
      if (p.bars) {
        mark.setAttribute('x', String(grR(p.L + p.sw * i)));
      } else {
        mark.setAttribute('x1', String(grR(x)));
        mark.setAttribute('x2', String(grR(x)));
        m.series.forEach(function (s, si) {
          var v = s.vals[i];
          dots[si].setAttribute('visibility', v == null ? 'hidden' : 'visible');
          if (v != null) {
            dots[si].setAttribute('cx', String(grR(x)));
            dots[si].setAttribute('cy', String(grR(p.Y(v))));
          }
        });
      }
      mark.setAttribute('visibility', 'visible');
      tip.replaceChildren(el('div', m.xs[i].label, 'gr-tip-h'));
      var total = null;
      m.series.forEach(function (s) {
        var v = s.vals[i];
        if (v != null) total = (total || 0) + v;
        var row = el('div', null, 'gr-tip-r');
        row.append(el('span', null, 'gr-key gr-s' + s.c), el('b', v == null ? '–' : m.f(v)), el('span', v == null ? s.name + ' (no figure)' : s.name));
        tip.append(row);
      });
      if (m.kind === 'stack' && m.series.length > 1) {
        var tr = el('div', null, 'gr-tip-r');
        tr.append(el('span', null, 'gr-key'), el('b', total == null ? '–' : m.f(total)), el('span', 'Total'));
        tip.append(tr);
      }
      tip.hidden = false;
      var fr = x / p.W;
      tip.style.left = grR(fr * 100) + '%';
      tip.classList.toggle('is-left', fr > 0.55);
    }
    function hide() {
      cur = -1;
      tip.hidden = true;
      mark.setAttribute('visibility', 'hidden');
      dots.forEach(function (d) { d.setAttribute('visibility', 'hidden'); });
    }
    root.addEventListener('pointermove', function (e) {
      var r = root.getBoundingClientRect();
      if (!r.width) return;
      var x = ((e.clientX - r.left) / r.width) * p.W, best = 0, bd = Infinity;
      for (var i = 0; i < p.n; i++) {
        var dx = Math.abs(p.X(i) - x);
        if (dx < bd) { bd = dx; best = i; }
      }
      show(best);
    });
    root.addEventListener('pointerleave', hide);
    plot.addEventListener('blur', hide);
    plot.addEventListener('keydown', function (e) {
      var i;
      if (e.key === 'ArrowLeft') i = cur < 0 ? p.n - 1 : cur - 1;
      else if (e.key === 'ArrowRight') i = cur < 0 ? p.n - 1 : cur + 1;
      else if (e.key === 'Home') i = 0;
      else if (e.key === 'End') i = p.n - 1;
      else if (e.key === 'Escape') { hide(); return; }
      else return;
      e.preventDefault();
      show(Math.max(0, Math.min(p.n - 1, i)));
    });
  }

  function grLegend(series) {
    var lg = el('div', null, 'gr-legend');
    series.forEach(function (s) {
      var it = el('span');
      it.append(el('i', null, 'gr-sw gr-s' + s.c), s.name);
      lg.append(it);
    });
    return lg;
  }

  function grHbars(m, large) {
    var box = el('div', null, 'gr-hb' + (large ? ' is-large' : ''));
    var max = m.rows.length ? m.rows[0].v : 0;
    m.rows.forEach(function (r) { if (r.v > max) max = r.v; });
    m.rows.forEach(function (r) {
      var k = el('span', r.key, 'gr-hb-k' + (r.other ? ' muted' : ''));
      k.title = r.key;
      var track = el('div', null, 'gr-hb-t');
      var fill = el('div', null, 'gr-hb-f gr-s1');
      fill.style.width = (max ? (100 * r.v) / max : 0) + '%';
      track.append(fill);
      box.append(k, track, el('span', grPct(r.v, m.total), 'gr-hb-v'));
    });
    return box;
  }

  function grTop(m) {
    var box = el('div', null, 'gr-top');
    var max = 0;
    m.rows.forEach(function (r) { if (r.total > max) max = r.total; });
    m.rows.forEach(function (r) {
      var a = el('a', r.name, 'gr-top-n');
      a.href = '#account/' + encodeURIComponent(r.name);
      var seg = el('div', null, 'gr-seg');
      r.parts.forEach(function (v, i) {
        if (!(v > 0)) return;
        var s = el('i', null, 'gr-s' + (i + 1));
        s.style.width = (max ? (100 * v) / max : 0) + '%';
        s.title = GR_KINDS[i] + ' ' + size(v);
        seg.append(s);
      });
      box.append(a, seg, el('span', size(r.total), 'gr-hb-v'));
    });
    return box;
  }

  function grTable(m) {
    var box = el('div', null, 'gr-tablebox');
    var t = el('table', null, 'gr-table');
    var hr = el('tr');
    function body(cells) {
      var tr = el('tr');
      cells.forEach(function (c) { tr.append(el('td', c)); });
      t.append(tr);
    }
    if (m.kind === 'hbar') {
      ['Value', 'Devices', 'Share'].forEach(function (h) { hr.append(el('th', h)); });
      t.append(hr);
      m.all.forEach(function (r) { body([r.key, fmt(r.v), grPct(r.v, m.total)]); });
    } else if (m.kind === 'top') {
      ['Account'].concat(GR_KINDS, ['In all']).forEach(function (h) { hr.append(el('th', h)); });
      t.append(hr);
      m.rows.forEach(function (r) { body([r.name, size(r.parts[0]), size(r.parts[1]), size(r.parts[2]), size(r.total)]); });
    } else {
      var stack = m.kind === 'stack' && m.series.length > 1;
      hr.append(el('th', m.xHead));
      m.series.forEach(function (s) { hr.append(el('th', s.name)); });
      if (stack) hr.append(el('th', 'Total'));
      t.append(hr);
      for (var i = m.xs.length - 1; i >= 0; i--) {
        var cells = [m.xs[i].label], total = null;
        m.series.forEach(function (s) {
          var v = s.vals[i];
          if (v != null) total = (total || 0) + v;
          cells.push(v == null ? '–' : m.f(v));
        });
        if (stack) cells.push(total == null ? '–' : m.f(total));
        body(cells);
      }
    }
    box.append(t);
    return box;
  }

  /** A card: the model small; a click opens it large in place (one at a time per view). */
  function grCard(m, ctx) {
    var card = el('section', null, 'gr-card' + (m.empty ? ' is-empty' : ''));
    card.setAttribute('data-graph', m.id);
    var head = el('div', null, 'gr-head');
    var open = el('button', 'Open', 'gr-open');
    open.type = 'button';
    open.setAttribute('aria-expanded', 'false');
    open.hidden = !!m.empty;
    head.append(el('h3', m.title), open);
    var body = el('div', null, 'gr-cardbody');
    card.append(head, body);
    var isOpen = false;
    var series = m.series || [];

    function graphic(large) {
      if (m.kind === 'hbar') return grHbars(m, large);
      if (m.kind === 'top') return grTop(m);
      if (!large) return grPlot(m, false).svg;
      var width = Math.max(340, Math.min(1200, (card.clientWidth || 1030) - 30));
      var p = grPlot(m, true, width);
      var plot = el('div', null, 'gr-plot');
      plot.append(p.svg);
      grHover(m, p, plot);
      return plot;
    }
    function small() {
      var tb = head.querySelector('.gr-tbtn');
      if (tb) tb.remove();
      body.replaceChildren();
      if (m.big !== undefined && !m.empty) {
        var big = el('div', m.big, 'gr-big');
        if (m.sub) big.append(el('small', m.sub));
        body.append(big);
      }
      if (m.empty) { body.append(el('p', m.empty, 'muted gr-empty')); if (m.note) body.append(el('p', m.note, 'muted gr-note')); return; }
      if (series.length >= 2) body.append(grLegend(series));
      body.append(graphic(false));
      if (m.note) body.append(el('p', m.note, 'muted gr-note'));
    }
    function large() {
      body.replaceChildren();
      var bar = el('div', null, 'gr-ltop');
      if (m.desc) bar.append(el('span', m.desc, 'muted gr-desc'));
      if (series.length >= 2) bar.append(grLegend(series));
      var tb = el('button', 'Table', 'gr-tbtn');
      tb.type = 'button';
      tb.setAttribute('aria-pressed', 'false');
      head.insertBefore(tb, open);
      var holder = el('div', null, 'gr-holder');
      body.append(bar, holder);
      if (m.note) body.append(el('p', m.note, 'muted gr-note'));
      var table = false;
      function draw() { holder.replaceChildren(table ? grTable(m) : graphic(true)); }
      tb.addEventListener('click', function () {
        table = !table;
        tb.setAttribute('aria-pressed', String(table));
        tb.textContent = table ? 'Graph' : 'Table';
        draw();
      });
      draw();
    }
    function toggle(want) {
      if (want === isOpen || (want && m.empty)) return;
      if (want && ctx.close) ctx.close();
      isOpen = want;
      card.classList.toggle('is-open', want);
      open.textContent = want ? 'Close' : 'Open';
      open.setAttribute('aria-expanded', String(want));
      ctx.close = want ? function () { toggle(false); } : null;
      if (want) large(); else small();
    }
    open.addEventListener('click', function (e) { e.stopPropagation(); toggle(!isOpen); });
    card.addEventListener('click', function (e) {
      if (isOpen) return;
      var t = e.target;
      if (t && t.closest && t.closest('a, button')) return;
      toggle(true);
    });
    small();
    return card;
  }

  function grFigures(pairs) {
    var dl = el('dl', null, 'gr-figs');
    pairs.forEach(function (p) {
      var d = el('div');
      d.append(el('dt', p[0]), el('dd', p[1]));
      dl.append(d);
    });
    return dl;
  }
  function grCards(models, ctx) {
    var box = el('div', null, 'gr-cards');
    models.forEach(function (m) { box.append(grCard(m, ctx)); });
    return box;
  }

  // --- The views ---

  function grUse(g, ctx) {
    var split = g.split || {};
    return [grCards([
      grOnlineModel(g),
      grDaysModel(g, { id: 'devices', title: 'Devices a day', desc: 'different devices seen in the day', series: [{ name: 'A day', metric: 'devices', c: 1 }] }),
      grDaysModel(g, {
        id: 'devices-wm', title: 'Devices a week and a month', desc: 'different devices seen in the last 7 and 30 days',
        series: [{ name: '7 days', metric: 'devices_7d', c: 2 }, { name: '30 days', metric: 'devices_30d', c: 3 }],
      }),
      grDaysModel(g, {
        id: 'new', title: 'New devices and accounts', kind: 'bars', desc: 'a day',
        series: [{ name: 'New devices', metric: 'new_devices', c: 1 }, { name: 'New accounts', metric: 'new_accounts', c: 2 }],
      }),
      grDaysModel(g, { id: 'play', title: 'Play minutes a day', kind: 'bars', desc: 'minutes in the game, all devices', series: [{ name: 'Minutes', metric: 'play_minutes' }] }),
      grSplitModel('types', 'Device types', split.type),
      grSplitModel('browsers', 'Browsers', split.browser),
      grSplitModel('versions', 'Client versions', split.version),
    ], ctx)];
  }

  function grStorage(g, ctx) {
    var s = g.storage || {};
    var item = grNum(s.itemBytes) || 0, run = grNum(s.runBytes) || 0, pub = grNum(s.pubBytes) || 0;
    var total = grDaysModel(g, {
      id: 'storage', title: 'Storage in total', kind: 'stack', f: size, desc: 'bytes at the end of each day; today now',
      series: [{ name: 'Runs', metric: 'run_bytes', c: 1 }, { name: 'Published', metric: 'pub_bytes', c: 2 }, { name: 'Small items', metric: 'item_bytes', c: 3 }],
      note: 'History begins with stage 66; a day without figures is a gap.',
      emptyText: 'No storage history yet: it begins with stage 66’s first roll-up.',
    });
    if (!total.empty) { total.big = size(item + run + pub); total.sub = 'now'; }
    var accounts = grDaysModel(g, { id: 'accounts', title: 'Accounts', desc: 'accounts at the end of each day', series: [{ name: 'Accounts', metric: 'accounts' }] });
    if (!accounts.empty) { accounts.big = fmt(grNum(s.accounts) || 0); accounts.sub = 'now'; }
    return [
      grFigures([
        ['In all', size(item + run + pub)], ['Small items', size(item)], ['Runs', size(run)],
        ['Published runs', size(pub)], ['Accounts', fmt(grNum(s.accounts) || 0)],
      ]),
      grCards([total, grLargestModel(g), accounts], ctx),
    ];
  }

  function grSharing(g, ctx) {
    var s = g.sharing || {};
    function n(v) { return fmt(grNum(v) || 0); }
    return [
      grFigures([
        ['Published runs', n(s.pubs)], ['In the Hall of Fame', n(s.listed)], ['Hidden', n(s.hidden)], ['Votes', n(s.votes)],
        ['Comments', n(s.comments)], ['Notes', n(s.notes)], ['Open reports', n(s.openReports)],
      ]),
      grCards([
        grDaysModel(g, {
          id: 'published', title: 'Runs published a day', kind: 'stack', desc: 'by a link only, or to the Hall of Fame',
          series: [
            { name: 'Link', c: 1, get: function (d) { var p = grNum(d.pubs_new); return p == null ? null : Math.max(0, p - (grNum(d.listed_new) || 0)); } },
            { name: 'Hall of Fame', c: 2, metric: 'listed_new' },
          ],
        }),
        grDaysModel(g, { id: 'votes', title: 'Votes a day', kind: 'bars', series: [{ name: 'Votes', metric: 'votes' }] }),
        grDaysModel(g, {
          id: 'comments', title: 'Comments and notes a day', kind: 'bars',
          series: [{ name: 'Comments', metric: 'comments', c: 1 }, { name: 'Notes', metric: 'notes', c: 2 }],
        }),
        grDaysModel(g, { id: 'reports', title: 'Reports a day', kind: 'bars', series: [{ name: 'Reports', metric: 'reports' }] }),
        grDaysModel(g, { id: 'views', title: 'Views a day', kind: 'bars', desc: 'published runs opened', series: [{ name: 'Views', metric: 'views' }] }),
      ], ctx),
    ];
  }

  function grView(name, title, build) {
    registerView(name, {
      title: title,
      group: 'numbers',
      render: function (root, params) {
        var range = grRangeOf(params), seq = 0, ctx = {};
        var bar = el('div', null, 'gr-bar');
        var group = el('div', null, 'gr-range');
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', 'Range');
        var buttons = GR_RANGES.map(function (r) {
          var b = el('button', r[1]);
          b.type = 'button';
          b.setAttribute('data-range', r[0]);
          b.addEventListener('click', function () {
            if (range === r[0]) return;
            range = r[0];
            try { history.replaceState(null, '', '#' + name + '/' + range); } catch (e) { /* the view still loads */ }
            load();
          });
          group.append(b);
          return b;
        });
        var reload = el('button', 'Reload', 'gr-reload');
        reload.type = 'button';
        reload.addEventListener('click', function () { load(); });
        var status = el('span', '', 'muted gr-status');
        bar.append(group, reload, status);
        var body = el('div', null, 'gr-body');
        root.append(bar, body);

        function load() {
          var mine = ++seq;
          buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-range') === range)); });
          status.className = 'muted gr-status';
          status.textContent = 'Loading…';
          api('/api/admin/graphs?range=' + encodeURIComponent(range)).then(function (g) {
            if (mine !== seq) return;
            g.days = Array.isArray(g.days) ? g.days : [];
            g.online = Array.isArray(g.online) ? g.online : [];
            ctx.close = null;
            var parts = [];
            if (!g.days.length) parts.push(el('p', 'No days rolled up yet: the first roll-up runs after midnight UTC.', 'muted gr-notice'));
            body.replaceChildren.apply(body, parts.concat(build(g, ctx)));
            var span = g.days.length ? g.days[0].day + ' – ' + g.days[g.days.length - 1].day + ' · ' : '';
            status.textContent = grRangeLabel(range) + ' · ' + span + 'read ' + utc(g.now || Date.now()) + ' UTC · today so far is live';
          }, function (e) {
            if (mine !== seq) return;
            status.className = 'gr-status gr-err';
            status.textContent = 'Could not load the graphs (' + (e && e.message ? e.message : 'error') + ').';
          });
        }
        load();
      },
    });
  }

  grView('use', 'Use', grUse);
  grView('storage', 'Storage', grStorage);
  grView('sharing', 'Sharing', grSharing);
`;

export const ADMIN_GRAPHS_CSS = `
:root { --gr1: #2a78d6; --gr2: #eb6834; --gr3: #1baf7a; --gr-card: #fff; --gr-gl: #e6e6ea; --gr-track: #eef0f3; --gr-tip: #1d1d1f; --gr-tip-fg: #fff; }
@media (prefers-color-scheme: dark) { :root { --gr1: #3987e5; --gr2: #d95926; --gr3: #199e70; --gr-card: #1e1e21; --gr-gl: #2e2e33; --gr-track: #2a2a2f; --gr-tip: #ececef; --gr-tip-fg: #161618; } }
.gr-s1 { --c: var(--gr1); }
.gr-s2 { --c: var(--gr2); }
.gr-s3 { --c: var(--gr3); }
.gr-bar { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; margin: 0 0 14px; }
.gr-range { display: inline-flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.gr-range button { border: 0; border-right: 1px solid var(--line); border-radius: 0; background: var(--gr-card); color: var(--fg); padding: 4px 12px; font-size: .9rem; }
.gr-range button:last-child { border-right: 0; }
.gr-range button[aria-pressed="true"] { background: var(--accent); color: var(--bg); }
.gr-status { font-size: .88rem; }
.gr-err { color: var(--warn); }
.gr-notice { margin: 0 0 12px; }
.gr-figs { display: flex; flex-wrap: wrap; gap: 8px 28px; margin: 0 0 14px; }
.gr-figs dt { color: var(--muted); font-size: .82rem; }
.gr-figs dd { margin: 0; font-size: 1.45rem; font-variant-numeric: tabular-nums; }
.gr-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(360px, 100%), 1fr)); gap: 14px; margin: 0 0 18px; }
.gr-card { min-width: 0; background: var(--gr-card); border: 1px solid var(--line); border-radius: 8px; padding: 10px 14px 8px; cursor: pointer; }
.gr-card.is-open, .gr-card.is-empty { cursor: auto; }
.gr-card.is-open { grid-column: 1 / -1; }
.gr-head { display: flex; align-items: baseline; gap: 8px; }
.gr-head h3 { margin: 0; font-size: .92rem; font-weight: 600; }
.gr-card.is-open .gr-head h3 { font-size: 1rem; }
.gr-open, .gr-tbtn { font-size: .8rem; }
.gr-head h3 { margin-right: auto; }
.gr-big { font-size: 1.6rem; line-height: 1.25; font-variant-numeric: tabular-nums; }
.gr-big small { font-size: .8rem; color: var(--muted); margin-left: 6px; }
.gr-legend { display: flex; flex-wrap: wrap; gap: 2px 12px; font-size: .8rem; margin: 2px 0; }
.gr-sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; background: var(--c); }
.gr-ltop { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 14px; margin: 2px 0 6px; }
.gr-desc { font-size: .85rem; }
.gr-note, .gr-empty { font-size: .8rem; margin: 4px 0 2px; }
.gr-empty { font-size: .9rem; margin: 10px 0; }
.gr-svg { display: block; width: 100%; height: auto; }
.gr-svg text { font: 11px system-ui, sans-serif; fill: var(--muted); }
.gr-svg.is-large text { font-size: 12px; }
.gr-svg text.gr-dl { fill: var(--fg); font-weight: 600; }
.gr-gl { stroke: var(--gr-gl); stroke-width: 1; fill: none; }
.gr-line { stroke: var(--c); stroke-width: 2; fill: none; stroke-linejoin: round; stroke-linecap: round; }
.gr-line.is-sofar { stroke-dasharray: 4 3; }
.gr-pt, .gr-barp { fill: var(--c); }
.gr-barp.is-sofar { fill-opacity: .45; }
.gr-cross { stroke: var(--fg); stroke-width: 1; stroke-dasharray: 3 3; }
.gr-band { fill: var(--fg); fill-opacity: .08; }
.gr-dot { fill: var(--c); stroke: var(--gr-card); stroke-width: 2; }
.gr-plot { position: relative; }
.gr-plot:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.gr-tip { position: absolute; top: 4px; transform: translateX(12px); background: var(--gr-tip); color: var(--gr-tip-fg); font-size: .8rem; border-radius: 5px; padding: 5px 8px; pointer-events: none; white-space: nowrap; z-index: 2; }
.gr-tip.is-left { transform: translateX(calc(-100% - 12px)); }
.gr-tip-h { font-weight: 600; margin-bottom: 2px; }
.gr-tip-r b { margin-right: 5px; font-variant-numeric: tabular-nums; }
.gr-key { display: inline-block; width: 12px; height: 2px; margin-right: 6px; vertical-align: middle; background: var(--c, currentColor); }
.gr-hb, .gr-top { display: grid; grid-template-columns: minmax(4em, 7em) minmax(0, 1fr) auto; gap: 5px 8px; align-items: center; font-size: .84rem; margin: 6px 0 8px; }
.gr-top { grid-template-columns: minmax(5em, 9em) minmax(0, 1fr) auto; }
.gr-hb.is-large { font-size: .9rem; }
.gr-hb-k, .gr-top-n { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gr-hb-t { height: 10px; background: var(--gr-track); border-radius: 3px; }
.gr-hb-f { height: 10px; background: var(--c); border-radius: 3px; }
.gr-hb-v { text-align: right; font-variant-numeric: tabular-nums; }
.gr-seg { display: flex; gap: 2px; height: 12px; }
.gr-seg i { display: block; height: 12px; min-width: 2px; border-radius: 2px; background: var(--c); }
.gr-tablebox { max-height: 420px; overflow: auto; }
.gr-table td:first-child { white-space: nowrap; }
@media (max-width: 600px) { .gr-range button { padding: 4px 8px; } .gr-card { padding: 8px 10px 6px; } }
`;
