// The admin page's shell (stage 66, ADR 0157; the owner's pick 1b): the
// shared helpers, the confirmation modal, the views by the URL's hash and
// the side bar of grouped links (a row of links over the view under
// 900 px). page.ts joins this with the views' modules into one IIFE:
// SHELL_JS first (the helpers and `registerView`), then the views, then
// SHELL_BOOT_JS (the side bar, the router, the first load).
//
// Every text from the API goes in by textContent; nothing is parsed as HTML.
// String.raw keeps the backslashes of the regular expressions as written.

export const SHELL_CSS = String.raw`:root { color-scheme: light dark; --fg: #1d1d1f; --bg: #fafafa; --muted: #6b6b70; --line: #d8d8dc; --accent: #0b6bcb; --warn: #b25000; --bad: #b3261e; --ok: #0d7a4f; --side: #f0f0f2; --sel: #dbe8f7; --card: #ffffff; --track: #e6e8ec; }
@media (prefers-color-scheme: dark) { :root { --fg: #e8e8ea; --bg: #161618; --muted: #9a9aa0; --line: #38383c; --accent: #5aa7f0; --warn: #f0a050; --bad: #f2867e; --ok: #5cc596; --side: #1e1e21; --sel: #1d3550; --card: #1c1c1f; --track: #2c2c31; } }
* { box-sizing: border-box; }
body { margin: 0; font: 15px/1.45 system-ui, sans-serif; color: var(--fg); background: var(--bg); }
.app { display: flex; min-height: 100vh; }
.side { flex: 0 0 220px; background: var(--side); border-right: 1px solid var(--line); padding: 18px 10px; position: sticky; top: 0; height: 100vh; overflow-y: auto; }
.side h1 { font-size: 1.05rem; margin: 0 10px 2px; }
.side .where { margin: 0 10px 2px; font-size: .82rem; color: var(--muted); }
.side #status { margin: 0 10px 12px; font-size: .78rem; color: var(--muted); }
.nav a { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 6px; text-decoration: none; color: var(--fg); }
.nav a:hover { background: color-mix(in srgb, var(--sel) 60%, transparent); }
.nav a.on { background: var(--sel); color: var(--accent); font-weight: 600; }
.nav .grp { font-size: .72rem; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin: 14px 10px 4px; }
.cnt { font-size: .75rem; font-weight: 700; background: var(--warn); color: #fff; border-radius: 9px; padding: 0 6px; }
.cnt:empty { display: none; }
.main { flex: 1 1 auto; min-width: 0; padding: 16px 24px 40px; }
.main > * { max-width: 1360px; }
@media (max-width: 900px) {
  .app { display: block; }
  .side { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line); padding: 10px 12px; }
  .side h1, .side .where, .side #status { margin-left: 0; }
  .side #status { margin-bottom: 6px; }
  .nav { display: flex; flex-wrap: wrap; gap: 2px 4px; }
  .nav .grp { display: none; }
  .nav a { padding: 4px 9px; }
  .main { padding: 12px 16px 32px; }
}
h1 { font-size: 1.4rem; margin: 0 0 4px; }
h2 { font-size: 1.05rem; margin: 28px 0 8px; }
.view > h2:first-child, .vhead h2 { margin-top: 0; }
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
.tbox { overflow-x: auto; }
.over { color: var(--warn); font-weight: 600; }
button { font: inherit; padding: 2px 10px; cursor: pointer; }
button.primary { color: #fff; background: var(--accent); border: 1px solid var(--accent); border-radius: 3px; }
button.danger { color: #b3261e; }
button.danger.solid { color: #fff; background: #b3261e; border: 1px solid #8c1d17; }
button:disabled { cursor: default; opacity: .55; }
a { color: var(--accent); }
input, select { font: inherit; padding: 2px 6px; }
.note:empty { display: none; }
.note { color: var(--warn); margin-top: 6px; }
.small { font-size: .85rem; }
.tag { display: inline-block; font-size: .72rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; border-radius: 3px; padding: 1px 6px; margin-left: 6px; background: var(--sel); color: var(--accent); white-space: nowrap; vertical-align: middle; }
.tag.s { background: color-mix(in srgb, var(--warn) 20%, transparent); color: var(--warn); }
.tag.old { background: color-mix(in srgb, var(--fg) 10%, transparent); color: var(--muted); }
.bar { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; margin: 0 0 12px; }
.bar .end { margin-left: auto; }
.vhead { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px; margin: 0 0 12px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px 16px; }
.card h3 { margin: 0 0 8px; font-size: 1rem; }
.acts { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.warn { color: var(--warn); background: color-mix(in srgb, var(--warn) 14%, transparent); border-radius: 5px; padding: 6px 10px; font-size: .88rem; margin: 8px 0; }
.err { color: var(--bad); }
.err:empty { display: none; }
.modal-veil { position: fixed; inset: 0; background: rgba(0, 0, 0, .45); display: flex; align-items: center; justify-content: center; }
.modal { width: min(520px, 92vw); max-height: 90vh; overflow: auto; background: var(--bg); color: var(--fg); border-radius: 8px; padding: 18px 20px; box-shadow: 0 20px 60px rgba(0, 0, 0, .4); overflow-wrap: anywhere; }
.modal h3 { margin: 0 0 8px; }
.modal p, .modal ul { margin: 0 0 10px; }
.modal label { display: block; margin: 0 0 10px; font-size: .9rem; color: var(--muted); }
.modal input { display: block; width: 100%; margin-top: 3px; font: inherit; padding: 4px 6px; }
.modal-err { color: var(--warn); }
.modal-err:empty { display: none; }
.modal-btns { text-align: right; margin: 6px 0 0 !important; }
`;

export const SHELL_JS = String.raw`
  // --- The shell (stage 66): helpers, the modal, the views ---
  var statusEl = document.getElementById('status');
  var modStatus = document.getElementById('mod-status');
  var viewHost = document.getElementById('view');
  var openModal = null;

  function el(tag, text, cls) {
    var e = document.createElement(tag);
    if (text !== undefined && text !== null) e.textContent = String(text);
    if (cls) e.className = cls;
    return e;
  }
  /** An SVG element, its attributes set one by one (never parsed). */
  function svg(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, String(attrs[k])); });
    return e;
  }
  function fmt(n) { return Number(n).toLocaleString('en-GB'); }
  function size(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + ' GB';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + ' MB';
    if (n >= 1e3) return Math.round(n / 1e3) + ' KB';
    return n + ' B';
  }
  function utc(ms) { return new Date(ms).toISOString().replace('T', ' ').slice(0, 16); }
  function dayOf(ms) { return ms ? new Date(ms).toISOString().slice(0, 10) : '—'; }
  function ago(ms) {
    var s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 90) return 'just now';
    if (s < 5400) return Math.round(s / 60) + ' min ago';
    if (s < 129600) return Math.round(s / 3600) + ' h ago';
    return Math.round(s / 86400) + ' days ago';
  }
  function seen(ms) { return ms ? ago(ms) : 'never'; }
  function plural(n, one, many) { return fmt(n) + ' ' + (n === 1 ? one : many); }
  function quoted(t) { return '“' + t + '”'; }
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
  function link(text, hash) {
    var a = el('a', text);
    a.href = hash;
    return a;
  }
  function accountHash(name) { return '#account/' + encodeURIComponent(name); }
  function settle(p) {
    return p.then(function (v) { return { ok: true, v: v }; }, function (e) { return { ok: false, e: e }; });
  }

  var ERRORS = {
    not_found: 'no such run or account',
    gone: 'the run is already removed',
    confirm_required: 'the name typed does not match',
    conflict: 'the account changed meanwhile; try again',
    forbidden: 'refused (X-WC or Origin)',
    bad_request: 'the server did not accept it',
    unavailable: 'the database is unavailable',
  };
  /** A failed answer as an Error: the API's code in words, the status and the code. */
  function failure(res) {
    return res.json().then(function (b) { return b && typeof b.error === 'string' ? b.error : ''; }, function () { return ''; }).then(function (code) {
      var e = new Error((ERRORS[code] || 'HTTP ' + res.status) + (code ? ' (' + res.status + ' ' + code + ')' : ''));
      e.code = code || 'http_' + res.status;
      e.status = res.status;
      throw e;
    });
  }
  /** A read of the stage 59 and 64 kind: 'HTTP 503' on a failure. */
  function getJson(path) {
    return fetch(path, { headers: { Accept: 'application/json' } }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }
  /** GET → the parsed JSON; a failure rejects with the API's code in words. */
  function api(path) {
    return fetch(path, { headers: { Accept: 'application/json' } }).then(function (res) {
      if (!res.ok) return failure(res);
      return res.json();
    });
  }
  /** A write: same origin, X-WC: 1, JSON; resolves to the answer's JSON (null on 204). */
  function write(method, path, body) {
    return fetch(path, {
      method: method,
      headers: { 'Content-Type': 'application/json', 'X-WC': '1' },
      body: JSON.stringify(body),
    }).then(function (res) {
      if (!res.ok) return failure(res);
      if (res.status === 204) return null;
      return res.text().then(function (t) { return t ? JSON.parse(t) : null; });
    });
  }
  function post(path, body) { return write('POST', path, body); }
  function withNote(body, note) {
    if (note) body.note = note;
    return body;
  }

  /**
   * A modal that asks first. o: {title, body: [nodes], typed?: what must be
   * typed, typedLabel, fold?: compare without case, ok: button text, danger?,
   * run(note, typed) → Promise, done: the line after it, after?: what to
   * reload (the report queue when absent)}.
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
        return o.after ? o.after() : loadModeration();
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

  // --- The views by the URL's hash ---

  /** name → {title, group, render(root, params), nav?: the link it lights, box?: a kept element's id} */
  var views = {};
  var viewOrder = [];
  var GROUPS = [['look', 'Look after'], ['numbers', 'Numbers'], ['site', 'Site']];
  var current = null;
  var keepStatus = false;
  function registerView(name, view) {
    if (!views[name]) viewOrder.push(name);
    views[name] = view;
  }
  /** Goes to a hash; the status line stays (the result of an action). */
  function navigate(hash) {
    keepStatus = true;
    if (location.hash === hash) route();
    else location.hash = hash;
  }
  /** Reloads the current view (after an action). */
  function rerender() {
    keepStatus = true;
    route();
  }
  /** A small Reload button for a view's bar. */
  function reloadButton() { return button('Reload', '', rerender); }
`;

export const SHELL_BOOT_JS = String.raw`
  // --- The side bar, the router and the first load ---

  function parseHash() {
    var h = location.hash.replace(/^#/, '');
    var i = h.indexOf('/');
    var name = i < 0 ? h : h.slice(0, i);
    var rest = i < 0 ? '' : h.slice(i + 1);
    try { rest = decodeURIComponent(rest); } catch (e) { /* kept as written */ }
    return views[name] ? { name: name, params: rest } : { name: 'reports', params: '' };
  }

  var navLinks = {};
  function buildNav() {
    var nav = document.getElementById('nav');
    nav.replaceChildren();
    GROUPS.forEach(function (g) {
      var names = viewOrder.filter(function (n) { return views[n].group === g[0]; });
      if (!names.length) return;
      nav.append(el('div', g[1], 'grp'));
      names.forEach(function (n) {
        var a = link(views[n].title, '#' + n);
        a.dataset.view = n;
        if (n === 'reports') {
          var c = el('span', '', 'cnt');
          c.id = 'nav-count';
          a.append(c);
          a.firstChild.textContent = views[n].title + ' ';
        }
        navLinks[n] = a;
        nav.append(a);
      });
    });
  }
  function markNav(name) {
    Object.keys(navLinks).forEach(function (n) {
      var on = n === name;
      navLinks[n].classList.toggle('on', on);
      if (on) navLinks[n].setAttribute('aria-current', 'page');
      else navLinks[n].removeAttribute('aria-current');
    });
  }

  var booting = true;
  function route() {
    if (!viewHost.isConnected) {
      // An older page's script (a test's earlier boot): stop listening.
      window.removeEventListener('hashchange', route);
      return;
    }
    var r = parseHash();
    var v = views[r.name];
    if (openModal) openModal();
    if (!keepStatus) modStatus.textContent = '';
    keepStatus = false;
    current = r;
    document.title = 'WebCockpit admin · ' + v.title;
    markNav(v.nav || r.name);
    Array.prototype.forEach.call(document.querySelectorAll('.kept'), function (k) { k.hidden = k.id !== v.box; });
    var root = el('div', null, 'view');
    root.dataset.view = r.name;
    viewHost.replaceChildren(root);
    viewHost.hidden = !!v.box;
    v.render(root, r.params, booting);
  }

  function envName() {
    var h = location.hostname;
    if (/^staging\./.test(h)) return 'staging';
    if (h === 'localhost' || h === '' || /^127\./.test(h) || /\.localhost$/.test(h)) return 'local';
    return 'production';
  }
  document.getElementById('env').textContent = envName();

  buildNav();
  window.addEventListener('hashchange', route);
  route();
  booting = false;
  // Stats and the queue once for the header and the side bar's count, then
  // every minute while Reports is open (ADR 0157: no polling elsewhere).
  loadAll();
  var timer = setInterval(function () {
    if (!viewHost.isConnected) { clearInterval(timer); return; }
    if (current && current.name === 'reports') loadAll();
  }, 60000);
`;
