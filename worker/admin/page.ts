// The admin page (spec §7.9, ADR 0148 "The admin page"): its own small
// page, served by the Worker only after the Access check (access.ts). A
// tool, not part of the TUI: plain and readable, nothing from the app, no
// external scripts. Three files, so the CSP can be `'self'` without
// inline code: /admin (this HTML), /admin/admin.css, /admin/admin.js.
// They are strings here because the router also runs under Node (the
// static server), where a text import of an .html file does not exist.
// The script builds the page from /api/admin/stats with textContent only.
// Stage 64 (ADR 0154 "Admin", round 12's point 6) puts the moderation
// first, in two columns: the report queue on the left; the published
// runs' totals, an account action by name and the admin log on the right;
// the stage 59 sections follow under both. Every action asks first in a
// modal of the page; nothing from the API is ever parsed as HTML.

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
<p id="mod-status" class="note" role="status"></p>
<main class="two">
  <section class="col1" id="reports">
    <h2>Reports <span class="muted" id="reports-count"></span></h2>
    <div id="queue"><p class="muted">Loading…</p></div>
  </section>
  <div class="col2">
    <section>
      <h2>Published runs</h2>
      <dl class="figures" id="pubs"></dl>
      <p class="muted" id="pubs-r2"></p>
    </section>
    <section>
      <h2>An account</h2>
      <form id="acct" class="acct" autocomplete="off">
        <label>Name <input id="acct-name" type="text" maxlength="40" spellcheck="false"></label>
        <select id="acct-action" aria-label="Action">
          <option value="suspend">Suspend</option>
          <option value="restore">Restore</option>
          <option value="delete">Delete</option>
        </select>
        <button type="submit">Go on…</button>
      </form>
      <p class="muted small">Suspend, restore or delete an account by its name, with or without reports. Each asks first.</p>
    </section>
    <section>
      <h2>Admin log <span class="muted" id="log-count"></span></h2>
      <p class="note" id="log-status"></p>
      <table class="log" id="log"><thead><tr><th>When (UTC)</th><th>Action</th><th>Target</th><th>Note</th></tr></thead><tbody></tbody></table>
      <p><button type="button" id="log-more" hidden>Show all</button></p>
    </section>
  </div>
  <div class="rest">
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
  </div>
</main>
</body>
</html>
`;

export const ADMIN_CSS = `:root { color-scheme: light dark; --fg: #1d1d1f; --bg: #fafafa; --muted: #6b6b70; --line: #d8d8dc; --accent: #0b6bcb; --warn: #b25000; }
@media (prefers-color-scheme: dark) { :root { --fg: #e8e8ea; --bg: #161618; --muted: #9a9aa0; --line: #38383c; --accent: #5aa7f0; --warn: #f0a050; } }
* { box-sizing: border-box; }
body { margin: 0; padding: 16px; font: 15px/1.45 system-ui, sans-serif; color: var(--fg); background: var(--bg); }
header, main, .note { max-width: 1360px; margin: 0 auto; }
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
.note:empty { display: none; }
.note { color: var(--warn); margin-top: 6px; }
.small { font-size: .85rem; }
main.two { display: grid; grid-template-columns: minmax(0, 1fr) 470px; gap: 0 32px; align-items: start; }
.rest { grid-column: 1 / -1; }
.col2 .figures { gap: 8px 22px; }
.col2 .figures div { min-width: 5.5em; }
@media (max-width: 900px) { main.two { grid-template-columns: minmax(0, 1fr); } }
.rq { border: 1px solid var(--line); border-radius: 6px; padding: 8px 12px; margin: 0 0 10px; background: color-mix(in srgb, var(--bg) 92%, var(--fg) 8%); overflow-wrap: anywhere; }
.rq.is-hidden { border-left: 4px solid var(--warn); }
.rq-head { display: flex; align-items: baseline; gap: 12px; }
.rq-head h3 { margin: 0; font-size: 1.02rem; }
.rq-state { font-size: .8rem; font-weight: 600; color: var(--muted); border: 1px solid var(--line); border-radius: 4px; padding: 0 6px; white-space: nowrap; }
.rq.is-hidden .rq-state { color: var(--warn); border-color: var(--warn); }
.rq p { margin: 4px 0 0; }
.rq code, .modal code { font-size: .9em; }
.rq-reasons { display: flex; flex-wrap: wrap; gap: 6px; }
.rq-r { font-size: .88rem; border-radius: 4px; padding: 1px 7px; background: color-mix(in srgb, var(--warn) 14%, transparent); }
.rq-r b { margin-left: 3px; }
.rq-from { font-size: .88rem; }
.rq-text { font-style: italic; white-space: pre-wrap; }
.rq-acts { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 8px !important; }
.rq-acts .sep { width: 12px; }
button.danger { color: #b3261e; }
button.danger.solid { color: #fff; background: #b3261e; border: 1px solid #8c1d17; }
button:disabled { cursor: default; opacity: .55; }
.log td, .log th { font-size: .8rem; padding: 3px 5px; text-align: left; overflow-wrap: break-word; }
.acct { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.acct input, .acct select { font: inherit; padding: 2px 6px; }
.modal-veil { position: fixed; inset: 0; background: rgba(0, 0, 0, .45); display: flex; align-items: center; justify-content: center; }
.modal { width: min(520px, 92vw); max-height: 90vh; overflow: auto; background: var(--bg); color: var(--fg); border-radius: 8px; padding: 18px 20px; box-shadow: 0 20px 60px rgba(0, 0, 0, .4); overflow-wrap: anywhere; }
.modal h3 { margin: 0 0 8px; }
.modal p { margin: 0 0 10px; }
.modal label { display: block; margin: 0 0 10px; font-size: .9rem; color: var(--muted); }
.modal input { display: block; width: 100%; margin-top: 3px; font: inherit; padding: 4px 6px; }
.modal-err { color: var(--warn); }
.modal-err:empty { display: none; }
.modal-btns { text-align: right; margin: 6px 0 0 !important; }
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
      d.append(el('dt', p[0]), el('dd', typeof p[1] === 'number' ? fmt(p[1]) : p[1]));
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

  // --- Moderation (stage 64, ADR 0154 "Admin"): the queue, the totals, the log, the actions ---

  var REASONS = [
    ['harassment', 'Harassment'],
    ['real_life', 'Real-life information about someone'],
    ['rules', 'Breaks MUME’s rules'],
    ['other', 'Other'],
  ];
  /** R2's free storage, bytes. */
  var R2_FREE = 10e9;
  var LOG_SHOWN = 20;
  var ERRORS = {
    not_found: 'no such run or account',
    gone: 'the run is already removed',
    confirm_required: 'the name typed does not match',
    conflict: 'the account changed meanwhile; try again',
    forbidden: 'refused (X-WC or Origin)',
    bad_request: 'the server did not accept it',
    unavailable: 'the database is unavailable',
  };
  var modStatus = document.getElementById('mod-status');
  var logStatus = document.getElementById('log-status');
  var logMore = document.getElementById('log-more');
  var logEntries = [];
  var logAll = false;
  var openModal = null;

  function utc(ms) { return new Date(ms).toISOString().replace('T', ' ').slice(0, 16); }
  function ago(ms) {
    var s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 90) return 'just now';
    if (s < 5400) return Math.round(s / 60) + ' min ago';
    if (s < 129600) return Math.round(s / 3600) + ' h ago';
    return Math.round(s / 86400) + ' days ago';
  }
  function size(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + ' GB';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + ' MB';
    if (n >= 1e3) return Math.round(n / 1e3) + ' KB';
    return n + ' B';
  }
  function plural(n, one, many) { return fmt(n) + ' ' + (n === 1 ? one : many); }
  /** A paragraph of text and nodes. */
  function para(parts, cls) {
    var p = el('p', null, cls);
    parts.forEach(function (x) { p.append(x); });
    return p;
  }
  function button(text, cls, onClick) {
    var b = el('button', text, cls);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function getJson(path) {
    return fetch(path, { headers: { Accept: 'application/json' } }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }
  /** A write: same origin, X-WC: 1; 204 or an error carrying the API's code in words. */
  function post(path, body) {
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-WC': '1' },
      body: JSON.stringify(body),
    }).then(function (res) {
      if (res.ok) return;
      return res.json().then(function (b) { return b && typeof b.error === 'string' ? b.error : ''; }, function () { return ''; }).then(function (code) {
        throw new Error((ERRORS[code] || 'HTTP ' + res.status) + (code ? ' (' + res.status + ' ' + code + ')' : ''));
      });
    });
  }
  function settle(p) {
    return p.then(function (v) { return { ok: true, v: v }; }, function (e) { return { ok: false, e: e }; });
  }

  function loadModeration() {
    return Promise.all([settle(getJson('/api/admin/reports')), settle(getJson('/api/admin/log'))]).then(function (r) {
      if (r[1].ok) {
        logEntries = Array.isArray(r[1].v.entries) ? r[1].v.entries : [];
        logStatus.textContent = '';
        renderLog();
      } else logStatus.textContent = 'Could not read the log: ' + r[1].e.message;
      if (r[0].ok) renderReports(r[0].v);
      else {
        document.getElementById('reports-count').textContent = '';
        document.getElementById('queue').replaceChildren(el('p', 'Could not read the reports: ' + r[0].e.message, 'note'));
      }
    });
  }

  function openCount(it) {
    var n = 0;
    REASONS.forEach(function (r) { n += Number(it.reasons[r[0]] || 0); });
    return n;
  }

  function renderReports(d) {
    var items = Array.isArray(d.items) ? d.items : [];
    var open = 0;
    items.forEach(function (it) { open += openCount(it); });
    document.getElementById('reports-count').textContent = items.length ? fmt(open) + ' open on ' + plural(items.length, 'run', 'runs') : 'none open';
    var queue = document.getElementById('queue');
    queue.replaceChildren();
    if (!items.length) {
      var last = logEntries.filter(function (e) { return String(e.action).indexOf('pub.') === 0; })[0];
      queue.append(el('p', 'No open reports.' + (last ? ' The last action on a run: ' + utc(last.ts) + ' UTC.' : ''), 'muted'));
    } else items.forEach(function (it) { queue.append(card(it)); });

    var p = d.pubs || { count: 0, bytes: 0, today: 0 };
    figures('pubs', [['Runs', p.count], ['Stored', size(p.bytes)], ['New today', p.today]]);
    document.getElementById('pubs-r2').textContent = 'R2 holds 10 GB free; published runs use ' + ((100 * p.bytes) / R2_FREE).toFixed(1) + ' % of it.';
  }

  function card(it) {
    var hidden = it.state === 'hidden';
    var art = el('article', null, 'rq' + (hidden ? ' is-hidden' : ''));
    art.dataset.id = it.target;
    var head = el('div', null, 'rq-head');
    head.append(el('h3', it.title), el('span', hidden ? 'hidden' : 'shown', 'rq-state'));
    var meta = el('span', '', 'rq-meta');
    var who = para(['by ', el('b', it.sender || '(no account)'), ' · ', el('code', it.target), meta], 'rq-who');
    var reasons = el('p', null, 'rq-reasons');
    REASONS.forEach(function (r) {
      var n = it.reasons[r[0]];
      if (!n) return;
      var s = el('span', r[1] + ' ', 'rq-r');
      s.append(el('b', fmt(n)));
      reasons.append(s);
    });
    var from = el('p', 'Reported by ' + plural(it.reporters, 'account', 'accounts') + ' · the newest ' + utc(it.newest) + ' UTC (' + ago(it.newest) + ')', 'rq-from muted');
    art.append(head, who, reasons, from);
    if (it.text) art.append(el('p', '“' + it.text + '”', 'rq-text'));

    var acts = el('p', null, 'rq-acts');
    var watch = el('a', 'Watch');
    watch.href = '/r/' + encodeURIComponent(it.target) + '?admin';
    watch.target = '_blank';
    watch.rel = 'noopener noreferrer';
    acts.append(watch);
    if (hidden) acts.append(button('Restore', '', function () { pubAction(it, 'restore'); }));
    else acts.append(button('Hide', '', function () { pubAction(it, 'hide'); }));
    acts.append(button('Delete', 'danger', function () { pubAction(it, 'delete'); }), el('span', null, 'sep'));
    if (!hidden) acts.append(button('Dismiss reports', '', function () { pubAction(it, 'dismiss'); }));
    if (it.sender) acts.append(button('Suspend ' + it.sender, '', function () { accountAction(it.sender, 'suspend'); }));
    art.append(acts);

    // The run's details (character, size, views, date) come from its meta; best effort.
    getJson('/api/admin/pub/' + encodeURIComponent(it.target)).then(function (m) {
      it.bytes = m.bytes;
      meta.textContent =
        (m.character ? ' · ' + m.character + (typeof m.level === 'number' ? ' (L' + m.level + ')' : '') : '') +
        ' · ' + size(m.bytes) + ' · ' + plural(m.views, 'view', 'views') + ' · ' + new Date(m.created).toISOString().slice(0, 10);
    }, function () {});
    return art;
  }

  function renderLog() {
    var body = document.querySelector('#log tbody');
    body.replaceChildren();
    var shown = logAll ? logEntries : logEntries.slice(0, LOG_SHOWN);
    shown.forEach(function (e) {
      var a = String(e.action);
      var dot = a.indexOf('.');
      var kind = a.slice(0, dot);
      var tr = el('tr');
      tr.append(el('td', utc(e.ts)), el('td', a.slice(dot + 1)), el('td', (kind === 'pub' ? 'run ' : kind === 'account' ? 'account ' : '') + e.target), el('td', e.note));
      body.append(tr);
    });
    if (!logEntries.length) {
      var tr = el('tr');
      var td = el('td', 'Nothing in the log yet.', 'muted');
      td.colSpan = 4;
      tr.append(td);
      body.append(tr);
    }
    document.getElementById('log-count').textContent = logEntries.length > shown.length || logAll ? 'the newest ' + shown.length + ' of ' + logEntries.length : '';
    logMore.hidden = logEntries.length <= LOG_SHOWN;
    logMore.textContent = logAll ? 'Show fewer' : 'Show all ' + logEntries.length;
  }
  logMore.addEventListener('click', function () { logAll = !logAll; renderLog(); });

  // --- The confirmations ---

  /**
   * A modal that asks first. o: {title, body: [nodes], typed?: what must be
   * typed, typedLabel, fold?: compare without case, ok: button text, danger?,
   * run(note) → Promise, done: the line after it}.
   */
  function confirmModal(o) {
    if (openModal) openModal();
    var veil = el('div', null, 'modal-veil');
    var box = el('div', null, 'modal');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'modal-title');
    var h = el('h3', o.title);
    h.id = 'modal-title';
    box.append(h);
    o.body.forEach(function (n) { box.append(n); });
    var note = el('input');
    note.type = 'text';
    note.maxLength = 500;
    note.name = 'note';
    var noteLabel = el('label', 'Note for the log (optional)');
    noteLabel.append(note);
    box.append(noteLabel);
    var typed = null;
    if (o.typed) {
      typed = el('input');
      typed.type = 'text';
      typed.name = 'confirm';
      typed.spellcheck = false;
      typed.autocomplete = 'off';
      var typedLabel = el('label', o.typedLabel);
      typedLabel.append(typed);
      box.append(typedLabel);
    }
    var err = el('p', '', 'modal-err');
    err.setAttribute('role', 'alert');
    var cancel = button('Cancel', '', close);
    var ok = button(o.ok, o.danger ? 'danger solid' : '', go);
    box.append(err, para([cancel, ' ', ok], 'modal-btns'));
    veil.append(box);

    function matches() {
      if (!typed) return true;
      var v = typed.value.trim();
      return o.fold ? v.toLowerCase() === o.typed.toLowerCase() : v === o.typed;
    }
    function close() {
      veil.remove();
      if (openModal === close) openModal = null;
    }
    function go() {
      if (!matches()) return;
      ok.disabled = true;
      cancel.disabled = true;
      err.textContent = '';
      o.run(note.value.trim(), typed ? typed.value.trim() : undefined).then(function () {
        close();
        modStatus.textContent = o.done;
        return loadModeration();
      }, function (e) {
        err.textContent = 'Could not do it: ' + e.message;
        ok.disabled = !matches();
        cancel.disabled = false;
      });
    }
    ok.disabled = !matches();
    if (typed) typed.addEventListener('input', function () { ok.disabled = !matches(); });
    veil.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !cancel.disabled) close();
      else if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT' && !ok.disabled) go();
    });
    document.body.append(veil);
    openModal = close;
    (typed || note).focus();
    return veil;
  }

  function quoted(t) { return '“' + t + '”'; }

  function pubAction(it, kind) {
    var n = openCount(it);
    var handled = 'Its ' + plural(n, 'open report is', 'open reports are') + ' marked handled and the action goes to the admin log.';
    var by = ['The run by ', el('b', it.sender || '(no account)'), ' (', el('code', it.target), it.bytes ? ', ' + size(it.bytes) : '', ')'];
    var spec = {
      hide: { title: 'Hide ' + quoted(it.title) + '?', what: ' stops playing for everyone but its sender; its link says it is hidden.', ok: 'Hide run', action: 'hide', done: 'Hidden: ' },
      restore: { title: 'Show ' + quoted(it.title) + ' again?', what: ' plays for everyone again.', ok: 'Restore run', action: 'restore', done: 'Shown again: ' },
      dismiss: { title: 'Dismiss the reports on ' + quoted(it.title) + '?', what: ' stays as it is.', ok: 'Dismiss reports', action: 'restore', done: 'Reports dismissed: ' },
      delete: { title: 'Delete ' + quoted(it.title) + '?', what: ' is deleted from R2 and its link says it was removed. This cannot be undone.', ok: 'Delete run', action: 'delete', done: 'Deleted: ', danger: true },
    }[kind];
    return confirmModal({
      title: spec.title,
      body: [para(by.concat([spec.what])), el('p', handled)],
      typed: kind === 'delete' ? it.target : null,
      typedLabel: 'Type the id to confirm',
      ok: spec.ok,
      danger: spec.danger,
      done: spec.done + it.title,
      run: function (note) {
        var body = { action: spec.action };
        if (note) body.note = note;
        return post('/api/admin/pub/' + encodeURIComponent(it.target), body);
      },
    });
  }

  function accountAction(name, action) {
    var b = el('b', name);
    var spec = {
      suspend: { title: 'Suspend ' + name + '?', what: [b, ' keeps its sync but cannot share, edit its links or report until it is restored. Its published runs stay unless they are hidden.'], ok: 'Suspend account', done: 'Suspended: ' },
      restore: { title: 'Restore ' + name + '?', what: [b, ' can share and report again.'], ok: 'Restore account', done: 'Restored: ' },
      delete: { title: 'Delete the account ' + name + '?', what: ['Everything ', b, ' stores goes: its synced items, run bodies and published runs (their links say removed); its sessions end and its name stays reserved. This cannot be undone.'], ok: 'Delete account', done: 'Deleted the account ', danger: true },
    }[action];
    return confirmModal({
      title: spec.title,
      body: [para(spec.what), el('p', 'The action goes to the admin log.')],
      typed: action === 'delete' ? name : null,
      typedLabel: 'Type the account’s name to confirm',
      fold: true,
      ok: spec.ok,
      danger: spec.danger,
      done: spec.done + name,
      run: function (note, confirm) {
        var body = { action: action };
        if (confirm !== undefined) body.confirm = confirm;
        if (note) body.note = note;
        return post('/api/admin/account/' + encodeURIComponent(name), body);
      },
    });
  }

  document.getElementById('acct').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = document.getElementById('acct-name').value.trim();
    if (!name) {
      modStatus.textContent = 'Type an account name first.';
      return;
    }
    accountAction(name, document.getElementById('acct-action').value);
  });

  function loadAll() {
    load();
    loadModeration();
  }
  loadAll();
  setInterval(loadAll, 60000);
})();
`;
