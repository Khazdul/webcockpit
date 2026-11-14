// The admin page (spec §7.9, ADR 0148 "The admin page"): its own small
// page, served by the Worker only after the Access check (access.ts). A
// tool, not part of the TUI: plain and readable, nothing from the app, no
// external scripts. Three files, so the CSP can be `'self'` without
// inline code: /admin (this HTML), /admin/admin.css, /admin/admin.js.
// They are strings here because the router also runs under Node (the
// static server), where a text import of an .html file does not exist.
// The script builds the page from /api/admin/stats with textContent only.

export const ADMIN_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self'",
  "img-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

export const ADMIN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>WebCockpit admin</title>
<link rel="stylesheet" href="/admin/admin.css">
<script src="/admin/admin.js" defer></script>
</head>
<body>
<header>
  <h1>WebCockpit admin</h1>
  <p id="status">Loading…</p>
</header>
<main>
  <section>
    <h2>Online now</h2>
    <dl class="figures" id="online"></dl>
  </section>
  <section>
    <h2>Today <span class="muted" id="today-day"></span></h2>
    <dl class="figures" id="today"></dl>
    <dl class="figures" id="unique"></dl>
  </section>
  <section>
    <h2>Use today against the free plan <span class="badge">estimate</span></h2>
    <p class="muted">Counted by the Worker itself from beats, samples and roll-up rows; not Cloudflare's figures.
      The exact numbers are in the <a href="https://dash.cloudflare.com/?to=/:account/workers-and-pages" rel="noopener noreferrer" target="_blank">Cloudflare dashboard</a>.</p>
    <table id="usage"><thead><tr><th>What</th><th>Estimate</th><th>Limit a day</th><th>Share</th></tr></thead><tbody></tbody></table>
  </section>
  <section>
    <h2>The last 30 days</h2>
    <table id="days"><thead><tr><th>Day (UTC)</th><th>Devices</th><th>New</th><th>Peak online</th><th>Peak playing</th><th>Play minutes</th><th>Beats</th></tr></thead><tbody></tbody></table>
  </section>
  <section>
    <h2>Devices by type, browser and version <span class="muted" id="split-day"></span></h2>
    <div class="splits" id="split"></div>
  </section>
  <section>
    <h2>Flags</h2>
    <table id="flags"><thead><tr><th>Flag</th><th>Now</th><th>Default</th><th></th></tr></thead><tbody></tbody></table>
  </section>
</main>
</body>
</html>
`;

export const ADMIN_CSS = `:root { color-scheme: light dark; --fg: #1d1d1f; --bg: #fafafa; --muted: #6b6b70; --line: #d8d8dc; --accent: #0b6bcb; --warn: #b25000; }
@media (prefers-color-scheme: dark) { :root { --fg: #e8e8ea; --bg: #161618; --muted: #9a9aa0; --line: #38383c; --accent: #5aa7f0; --warn: #f0a050; } }
* { box-sizing: border-box; }
body { margin: 0; padding: 16px; font: 15px/1.45 system-ui, sans-serif; color: var(--fg); background: var(--bg); }
header, main { max-width: 960px; margin: 0 auto; }
h1 { font-size: 1.4rem; margin: 0 0 4px; }
h2 { font-size: 1.05rem; margin: 28px 0 8px; }
.muted { color: var(--muted); font-weight: normal; }
.badge { font-size: .75rem; font-weight: 600; color: var(--warn); border: 1px solid var(--warn); border-radius: 4px; padding: 0 5px; vertical-align: middle; }
.figures { display: flex; flex-wrap: wrap; gap: 8px 28px; margin: 0; }
.figures div { min-width: 7em; }
.figures dt { color: var(--muted); font-size: .85rem; }
.figures dd { margin: 0; font-size: 1.5rem; font-variant-numeric: tabular-nums; }
table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
th, td { text-align: right; padding: 4px 8px; border-bottom: 1px solid var(--line); }
th:first-child, td:first-child { text-align: left; }
th { font-weight: 600; color: var(--muted); font-size: .85rem; }
section { overflow-x: auto; }
.splits { display: flex; flex-wrap: wrap; gap: 24px; }
.splits table { width: auto; min-width: 12em; }
.over { color: var(--warn); font-weight: 600; }
button { font: inherit; padding: 2px 10px; cursor: pointer; }
a { color: var(--accent); }
`;

export const ADMIN_JS = `'use strict';
(function () {
  var statusEl = document.getElementById('status');
  function el(tag, text, cls) {
    var e = document.createElement(tag);
    if (text !== undefined && text !== null) e.textContent = String(text);
    if (cls) e.className = cls;
    return e;
  }
  function fmt(n) { return Number(n).toLocaleString('en-GB'); }
  function figures(id, pairs) {
    var dl = document.getElementById(id);
    dl.replaceChildren();
    pairs.forEach(function (p) {
      var d = el('div');
      d.append(el('dt', p[0]), el('dd', fmt(p[1])));
      dl.append(d);
    });
  }
  function rows(id, list) {
    var body = document.querySelector('#' + id + ' tbody');
    body.replaceChildren();
    list.forEach(function (cells) {
      var tr = el('tr');
      cells.forEach(function (c) { tr.append(c instanceof Node ? wrap(c) : el('td', c)); });
      body.append(tr);
    });
  }
  function wrap(node) { var td = el('td'); td.append(node); return td; }
  function splitTable(title, obj) {
    var t = el('table');
    var head = el('tr');
    head.append(el('th', title), el('th', 'Devices'));
    t.append(head);
    Object.keys(obj).sort(function (a, b) { return obj[b] - obj[a]; }).forEach(function (k) {
      var tr = el('tr');
      tr.append(el('td', k), el('td', fmt(obj[k])));
      t.append(tr);
    });
    return t;
  }

  function render(s) {
    figures('online', [['Total', s.online.total], ['Start page', s.online.menu], ['Playing', s.online.playing], ['Replay', s.online.replay]]);
    document.getElementById('today-day').textContent = s.today.day;
    figures('today', [['Devices', s.today.devices], ['New devices', s.today.newDevices], ['Peak online', s.today.peakOnline], ['Peak playing', s.today.peakPlaying], ['Play minutes', s.today.playMinutes], ['Beats', s.today.beats]]);
    figures('unique', [['Devices, 7 days', s.weekly], ['Devices, 30 days', s.monthly]]);

    var u = s.usage;
    function share(v, limit) {
      var pct = limit ? (100 * v) / limit : 0;
      return el('span', pct.toFixed(1) + ' %', pct >= 80 ? 'over' : '');
    }
    rows('usage', [
      ['Worker requests', fmt(u.requests), fmt(u.limits.requests), share(u.requests, u.limits.requests)],
      ['D1 rows written', fmt(u.rowsWritten), fmt(u.limits.rowsWritten), share(u.rowsWritten, u.limits.rowsWritten)],
      ['D1 rows read', fmt(u.rowsRead), fmt(u.limits.rowsRead), share(u.rowsRead, u.limits.rowsRead)],
    ]);

    rows('days', s.days.length ? s.days.map(function (d) {
      return [d.day, fmt(d.devices), fmt(d.newDevices), fmt(d.peakOnline), fmt(d.peakPlaying), fmt(d.playMinutes), fmt(d.beats)];
    }) : [['No days rolled up yet (the roll-up runs at 00:10 UTC).', '', '', '', '', '', '']]);

    var split = document.getElementById('split');
    split.replaceChildren();
    document.getElementById('split-day').textContent = s.split ? s.split.day : '';
    if (s.split) split.append(splitTable('Type', s.split.type), splitTable('Browser', s.split.browser), splitTable('Version', s.split.version));
    else split.append(el('p', 'Shown after the first roll-up.', 'muted'));

    rows('flags', Object.keys(s.flags).map(function (name) {
      var f = s.flags[name];
      var b = el('button', f.value ? 'Turn off' : 'Turn on');
      b.addEventListener('click', function () { setFlag(name, !f.value, b); });
      return [name, f.value ? 'on' : 'off', (f.default ? 'on' : 'off') + (f.override === null ? '' : ' (overridden)'), b];
    }));
  }

  function load() {
    return fetch('/api/admin/stats', { headers: { Accept: 'application/json' } }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (s) {
      render(s);
      statusEl.textContent = 'Read ' + new Date(s.now).toISOString().replace('T', ' ').slice(0, 19) + ' UTC.';
    }).catch(function (e) {
      statusEl.textContent = 'Could not read the numbers: ' + e.message;
    });
  }

  function setFlag(name, value, button) {
    button.disabled = true;
    fetch('/api/admin/flags/' + encodeURIComponent(name), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-WC': '1' },
      body: JSON.stringify({ value: value }),
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return load();
    }).catch(function (e) {
      statusEl.textContent = 'Could not set ' + name + ': ' + e.message;
      button.disabled = false;
    });
  }

  load();
  setInterval(load, 60000);
})();
`;
