// The admin page's Reports view (stage 64 C3, stage 65 C4; moved here in
// stage 66 with its behaviour unchanged): the report queue on the left; the
// community's and the published runs' totals, an account action by name and
// the newest admin log entries on the right. Stage 66 puts today's figures
// and the use estimate (stage 59) over the queue, and the 30-day table and
// the device splits under it, folded, until the Use view's graphs (C2)
// carry them. The view's element is kept in the page (`.kept`) so the
// minute's reload can update the side bar's count from any view.

export const REPORTS_HTML = `<div id="v-reports" class="kept" hidden>
  <section class="overview" aria-label="Today">
    <dl class="figures" id="online"></dl>
    <dl class="figures" id="today"></dl>
    <dl class="figures" id="unique"></dl>
    <p class="muted small">Today (UTC) <span id="today-day"></span> so far. Use against the free plan <span class="badge">estimate</span>, counted by the Worker itself; the exact numbers are in the <a href="https://dash.cloudflare.com/?to=/:account/workers-and-pages" rel="noopener noreferrer" target="_blank">Cloudflare dashboard</a>.</p>
    <table id="usage" class="usage"><thead><tr><th>What</th><th>Estimate</th><th>Limit a day</th><th>Share</th></tr></thead><tbody></tbody></table>
  </section>
  <div class="two">
    <section class="col1" id="reports">
      <h2>Reports <span class="muted" id="reports-count"></span></h2>
      <div id="queue"><p class="muted">Loading…</p></div>
    </section>
    <div class="col2">
      <section id="community-sec" hidden>
        <h2>Community</h2>
        <dl class="figures" id="community"></dl>
      </section>
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
        <p class="muted small">Suspend, restore or delete an account by its name, with or without reports. Each asks first. The Accounts view has every account.</p>
      </section>
      <section>
        <h2>Admin log <span class="muted" id="log-count"></span></h2>
        <p class="note" id="log-status"></p>
        <table class="log" id="log"><thead><tr><th>When (UTC)</th><th>Action</th><th>Target</th><th>Note</th></tr></thead><tbody></tbody></table>
        <p><button type="button" id="log-more" hidden>Show all</button> <a href="#log">The whole log</a></p>
      </section>
    </div>
  </div>
  <details class="rest">
    <summary>The last 30 days and the device splits</summary>
    <section>
      <h2>The last 30 days</h2>
      <table id="days"><thead><tr><th>Day (UTC)</th><th>Devices</th><th>New</th><th>Peak online</th><th>Peak playing</th><th>Play minutes</th><th>Beats</th></tr></thead><tbody></tbody></table>
    </section>
    <section>
      <h2>Devices by type, browser and version <span class="muted" id="split-day"></span></h2>
      <div class="splits" id="split"></div>
    </section>
  </details>
</div>`;

export const REPORTS_CSS = `.overview { display: flex; flex-wrap: wrap; gap: 6px 36px; align-items: flex-start; padding: 0 0 10px; border-bottom: 1px solid var(--line); }
.overview .figures { gap: 4px 20px; }
.overview .figures div { min-width: 5.5em; }
.overview .figures dd { font-size: 1.2rem; }
.overview p { flex: 1 1 100%; margin: 0; }
.overview .usage { width: auto; min-width: 28em; font-size: .88rem; }
.splits { display: flex; flex-wrap: wrap; gap: 24px; }
.splits table { width: auto; min-width: 12em; }
.two { display: grid; grid-template-columns: minmax(0, 1fr) 470px; gap: 0 32px; align-items: start; }
.col2 .figures { gap: 8px 22px; }
.col2 .figures div { min-width: 5.5em; }
@media (max-width: 1200px) { .two { grid-template-columns: minmax(0, 1fr); } .overview .usage { min-width: 0; width: 100%; } }
.rest { margin-top: 24px; }
.rest summary { cursor: pointer; color: var(--muted); }
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
.rq-kind { flex: none; font-size: .72rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; border-radius: 3px; padding: 1px 6px; background: color-mix(in srgb, var(--fg) 12%, transparent); }
.rq-kind.is-c { background: color-mix(in srgb, #2f6fb3 25%, transparent); }
.rq-kind.is-n { background: color-mix(in srgb, #8a5bb3 25%, transparent); }
.rq-quote { margin: 6px 0 2px; padding: 6px 10px; border-left: 3px solid var(--line); background: color-mix(in srgb, var(--fg) 5%, transparent); white-space: pre-wrap; overflow-wrap: anywhere; }
.rq-acts { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 8px !important; }
.rq-acts .sep { width: 12px; }
.log td, .log th { font-size: .8rem; padding: 3px 5px; text-align: left; overflow-wrap: break-word; }
.acct { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
`;

export const REPORTS_JS = `
  // --- Reports: today's figures (stage 59) and the queue (stage 64, 65) ---

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
    document.getElementById('online-now').textContent = fmt(s.online.total) + ' online';
    figures('online', [['Online now', s.online.total], ['Start page', s.online.menu], ['Playing', s.online.playing], ['Replay', s.online.replay]]);
    document.getElementById('today-day').textContent = s.today.day;
    figures('today', [['Devices today', s.today.devices], ['New devices', s.today.newDevices], ['Peak online', s.today.peakOnline], ['Peak playing', s.today.peakPlaying], ['Play minutes', s.today.playMinutes], ['Beats', s.today.beats]]);
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
  }

  function load() {
    return getJson('/api/admin/stats').then(function (s) {
      render(s);
      statusEl.textContent = 'Read ' + new Date(s.now).toISOString().replace('T', ' ').slice(0, 19) + ' UTC.';
    }).catch(function (e) {
      statusEl.textContent = 'Could not read the numbers: ' + e.message;
    });
  }

  var REASONS = [
    ['harassment', 'Harassment'],
    ['real_life', 'Real-life information about someone'],
    ['rules', 'Breaks MUME’s rules'],
    ['other', 'Other'],
  ];
  /** R2's free storage, bytes. */
  var R2_FREE = 10e9;
  var LOG_SHOWN = 20;
  var logStatus = document.getElementById('log-status');
  var logMore = document.getElementById('log-more');
  var logEntries = [];
  var logAll = false;

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
    document.getElementById('reports-count').textContent = items.length ? fmt(open) + ' open on ' + byKind(items) : 'none open';
    var count = document.getElementById('nav-count');
    if (count) {
      count.textContent = open ? fmt(open) : '';
      count.title = open ? fmt(open) + ' open reports' : '';
    }
    var queue = document.getElementById('queue');
    queue.replaceChildren();
    if (!items.length) {
      var last = logEntries.filter(function (e) { return String(e.action).indexOf('pub.') === 0; })[0];
      queue.append(el('p', 'No open reports.' + (last ? ' The last action on a run: ' + utc(last.ts) + ' UTC.' : ''), 'muted'));
    } else items.forEach(function (it) { queue.append(card(it)); });

    // The community's totals (stage 65 C4), when the Worker sends them.
    var c = d.community;
    document.getElementById('community-sec').hidden = !c;
    if (c) figures('community', [['Listed', c.listed], ['Comments', c.comments], ['Notes', c.notes], ['Votes', c.votes]]);

    var p = d.pubs || { count: 0, bytes: 0, today: 0 };
    figures('pubs', [['Runs', p.count], ['Stored', size(p.bytes)], ['New today', p.today]]);
    document.getElementById('pubs-r2').textContent = 'R2 holds 10 GB free; published runs use ' + ((100 * p.bytes) / R2_FREE).toFixed(1) + ' % of it.';
  }

  var KINDS = { run: ['run', 'runs', 'Run', ''], comment: ['comment', 'comments', 'Comment', 'is-c'], note: ['note', 'notes', 'Note', 'is-n'] };
  function kindOf(it) { return KINDS[it.kind] ? it.kind : 'run'; }
  /** "2 runs", or with more than one kind "3 items · 1 run, 1 comment, 1 note". */
  function byKind(items) {
    var n = { run: 0, comment: 0, note: 0 };
    items.forEach(function (it) { n[kindOf(it)]++; });
    var parts = Object.keys(n).filter(function (k) { return n[k]; });
    if (parts.length === 1) return plural(n[parts[0]], KINDS[parts[0]][0], KINDS[parts[0]][1]);
    return plural(items.length, 'item', 'items') + ' · ' + parts.map(function (k) { return plural(n[k], KINDS[k][0], KINDS[k][1]); }).join(', ');
  }
  function kindTag(it) { var k = KINDS[kindOf(it)]; return el('span', k[2], 'rq-kind' + (k[3] ? ' ' + k[3] : '')); }
  function whyHidden(it) {
    return it.state !== 'hidden' ? 'shown' : it.hiddenReason === 'reports' ? 'Hidden after 5 reports' : it.hiddenReason === 'admin' ? 'Hidden by the admin' : 'hidden';
  }
  /** The reasons with their counts, the reporters' count (never their names) and the newest report's text. */
  function reportLines(art, it) {
    var reasons = el('p', null, 'rq-reasons');
    REASONS.forEach(function (r) {
      var n = it.reasons[r[0]];
      if (!n) return;
      var s = el('span', r[1] + ' ', 'rq-r');
      s.append(el('b', fmt(n)));
      reasons.append(s);
    });
    var from = el('p', 'Reported by ' + plural(it.reporters, 'account', 'accounts') + ' · the newest ' + utc(it.newest) + ' UTC (' + ago(it.newest) + ')', 'rq-from muted');
    art.append(reasons, from);
    if (it.text) art.append(el('p', '“' + it.text + '”', 'rq-text'));
  }

  function card(it) {
    if (kindOf(it) !== 'run') return itemCard(it);
    var hidden = it.state === 'hidden';
    var art = el('article', null, 'rq' + (hidden ? ' is-hidden' : ''));
    art.dataset.id = it.target;
    var head = el('div', null, 'rq-head');
    // Why it is hidden (review fixes): the reports or the admin's Hide.
    head.append(kindTag(it), el('h3', it.title), el('span', whyHidden(it), 'rq-state'));
    var meta = el('span', '', 'rq-meta');
    var who = para(['by ', el('b', it.sender || '(no account)'), ' · ', el('code', it.target), meta], 'rq-who');
    art.append(head, who);
    reportLines(art, it);

    var acts = el('p', null, 'rq-acts');
    var watch = el('a', 'Watch');
    watch.href = '/r/' + encodeURIComponent(it.target) + '?admin';
    watch.target = '_blank';
    watch.rel = 'noopener noreferrer';
    acts.append(watch);
    if (hidden) acts.append(button('Restore', '', function () { pubAction(it, 'restore'); }));
    else acts.append(button('Hide', '', function () { pubAction(it, 'hide'); }));
    acts.append(button('Delete', 'danger', function () { pubAction(it, 'delete'); }), el('span', null, 'sep'));
    acts.append(button('Dismiss reports', '', function () { pubAction(it, 'dismiss'); }));
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

  /** A comment's or a note's card (stage 65 C4): its whole text quoted, the writer, a comment's run. */
  function itemCard(it) {
    var kind = kindOf(it);
    var hidden = it.state === 'hidden';
    var art = el('article', null, 'rq' + (hidden ? ' is-hidden' : ''));
    art.dataset.id = it.target;
    art.dataset.kind = kind;
    var head = el('div', null, 'rq-head');
    head.append(kindTag(it), el('h3', kind === 'comment' ? 'on ' + quoted(it.title || '(untitled run)') : 'on Random Runes'), el('span', whyHidden(it), 'rq-state'));
    var who = ['by ', el('b', it.sender || '(no account)'), ' · ', el('code', it.target)];
    if (kind === 'comment' && it.pub) who.push(' · on the run ', el('code', it.pub));
    art.append(head, el('blockquote', it.content || '', 'rq-quote'), para(who, 'rq-who'));
    reportLines(art, it);

    var acts = el('p', null, 'rq-acts');
    if (kind === 'comment' && it.pub) {
      var open = el('a', 'Open run');
      open.href = '/r/' + encodeURIComponent(it.pub) + '?admin';
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
      acts.append(open);
    }
    if (hidden) acts.append(button('Restore', '', function () { itemAction(it, 'restore'); }));
    else acts.append(button('Hide', '', function () { itemAction(it, 'hide'); }));
    acts.append(button('Delete', 'danger', function () { itemAction(it, 'delete'); }), el('span', null, 'sep'));
    acts.append(button('Dismiss reports', '', function () { itemAction(it, 'dismiss'); }));
    if (it.sender) acts.append(button('Suspend ' + it.sender, '', function () { accountAction(it.sender, 'suspend'); }));
    art.append(acts);
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
      tr.append(el('td', utc(e.ts)), el('td', a.slice(dot + 1)), el('td', (kind === 'pub' ? 'run ' : kind === 'account' ? 'account ' : kind === 'comment' ? 'comment ' : kind === 'note' ? 'note ' : '') + e.target), el('td', e.note));
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

  function pubAction(it, kind) {
    var n = openCount(it);
    var handled = 'Its ' + plural(n, 'open report is', 'open reports are') + ' marked handled and the action goes to the admin log.';
    var by = ['The run by ', el('b', it.sender || '(no account)'), ' (', el('code', it.target), it.bytes ? ', ' + size(it.bytes) : '', ')'];
    var spec = {
      hide: { title: 'Hide ' + quoted(it.title) + '?', what: ' stops playing for everyone but its sender; its link says it is hidden.', ok: 'Hide run', action: 'hide', done: 'Hidden: ' },
      restore: { title: 'Show ' + quoted(it.title) + ' again?', what: ' plays for everyone again.', ok: 'Restore run', action: 'restore', done: 'Shown again: ' },
      dismiss: { title: 'Dismiss the reports on ' + quoted(it.title) + '?', what: ' stays as it is' + (it.state === 'hidden' ? ', hidden' : '') + '; later reports queue it here but no longer hide it.', ok: 'Dismiss reports', action: 'dismiss', done: 'Reports dismissed: ' },
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
        return post('/api/admin/pub/' + encodeURIComponent(it.target), withNote({ action: spec.action }, note));
      },
    });
  }

  /** Hide, Restore, Dismiss reports or Delete on a comment or a note (stage 65 C4); Delete needs no typed id. */
  function itemAction(it, action) {
    var kind = kindOf(it);
    var word = kind === 'comment' ? 'comment' : 'note';
    var n = openCount(it);
    var handled = 'Its ' + plural(n, 'open report is', 'open reports are') + ' marked handled and the action goes to the admin log.';
    var shown = it.state !== 'hidden';
    var count = kind === 'comment' && shown ? ' The run’s comment count goes down by one.' : '';
    var spec = {
      hide: { title: 'Hide this ' + word + '?', what: 'It disappears for everyone, its writer too; you still see it here.' + count, ok: 'Hide ' + word, done: 'Hidden: ' },
      restore: { title: 'Show this ' + word + ' again?', what: 'It shows for everyone again; later reports queue it here but no longer hide it.' + (kind === 'comment' ? ' The run’s comment count goes up by one.' : ''), ok: 'Restore ' + word, done: 'Shown again: ' },
      dismiss: { title: 'Dismiss the reports on this ' + word + '?', what: 'It stays as it is' + (shown ? '' : ', hidden') + '; later reports queue it here but no longer hide it.', ok: 'Dismiss reports', done: 'Reports dismissed: ' },
      delete: { title: 'Delete this ' + word + '?', what: 'The ' + word + ' is deleted; no text is kept.' + count + ' This cannot be undone.', ok: 'Delete ' + word, done: 'Deleted: ', danger: true },
    }[action];
    var by = ['By ', el('b', it.sender || '(no account)'), kind === 'comment' ? ' on ' + quoted(it.title || '(untitled run)') + '.' : ' on Random Runes.'];
    return confirmModal({
      title: spec.title,
      body: [el('blockquote', it.content || '', 'rq-quote'), para(by), el('p', spec.what), el('p', handled)],
      ok: spec.ok,
      danger: spec.danger,
      done: spec.done + word + ' ' + it.target,
      run: function (note) {
        return post('/api/admin/' + word + '/' + encodeURIComponent(it.target), withNote({ action: action }, note));
      },
    });
  }

  /**
   * Suspend, Restore, Delete (the name typed, any case) or End all sessions
   * (stage 66) on an account. after: what to reload (the queue when absent).
   */
  function accountAction(name, action, after) {
    var b = el('b', name);
    var spec = {
      suspend: { title: 'Suspend ' + name + '?', what: [b, ' keeps its sync but cannot share, edit its links or report until it is restored. Its published runs stay unless they are hidden.'], ok: 'Suspend account', done: 'Suspended: ' },
      restore: { title: 'Restore ' + name + '?', what: [b, ' can share and report again.'], ok: 'Restore account', done: 'Restored: ' },
      delete: { title: 'Delete the account ' + name + '?', what: ['Everything ', b, ' stores goes: its synced items, run bodies and published runs (their links say removed); its sessions end and its name stays reserved. This cannot be undone.'], ok: 'Delete account', done: 'Deleted the account ', danger: true },
      'end-sessions': { title: 'End every session of ' + name + '?', what: [b, ' is signed out on every device; nothing it stores changes. For a lost device or a shared password.'], ok: 'End all sessions', done: 'Sessions ended: ' },
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
      after: after,
      run: function (note, confirm) {
        var body = { action: action };
        if (confirm !== undefined) body.confirm = confirm;
        return post('/api/admin/account/' + encodeURIComponent(name), withNote(body, note));
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

  registerView('reports', {
    title: 'Reports',
    group: 'look',
    box: 'v-reports',
    render: function (root, params, booting) { if (!booting) loadAll(); },
  });
`;
