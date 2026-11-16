// The admin page's Accounts view and one account's view (stage 66, ADR
// 0157; the owner's picks 1b and 3a): every account in a table with search,
// a state filter, sortable columns and pages of 50; one account with its
// storage against its limits, its own limits, the clean-up (End all
// sessions, Suspend / Restore, Delete), its community and its log entries.

export const ACCOUNTS_CSS = `.accounts th button { font: inherit; font-weight: 600; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
.accounts th[aria-sort=ascending], .accounts th[aria-sort=descending] { color: var(--accent); }
.accounts td, .accounts th { white-space: nowrap; }
.accounts td:first-child { white-space: normal; overflow-wrap: anywhere; }
.pager { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: flex-end; margin-top: 10px; }
.acct-head h2 { font-size: 1.4rem; overflow-wrap: anywhere; }
.cols { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
.cols > div { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.cols > .wide { flex: 3 1 540px; }
.cols > .narrow { flex: 2 1 320px; }
.use { display: grid; grid-template-columns: 9em minmax(0, 1fr) auto; gap: 8px 12px; align-items: center; font-size: .9rem; }
.track { height: 10px; background: var(--track); border-radius: 3px; overflow: hidden; }
.fill { height: 10px; background: var(--accent); border-radius: 3px; }
.fill.hi { background: var(--warn); }
.use .v { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
dl.kv { display: grid; grid-template-columns: 10em 1fr; gap: 4px 12px; margin: 0; font-size: .9rem; }
dl.kv dt { color: var(--muted); }
dl.kv dd { margin: 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.card .log td { overflow-wrap: break-word; }
`;

export const ACCOUNTS_JS = String.raw`
  // --- Accounts: the list ---

  var ACC = { q: '', state: 'all', sort: 'seen', dir: 'desc', page: 1 };
  /** [heading, sort key or null, cell(row) → text or node, first direction] */
  var ACC_COLS = [
    ['Name', 'name', function (a) {
      var td = el('td');
      td.append(link(a.name, accountHash(a.name)));
      if (a.ownLimits) td.append(el('span', 'limits', 'tag'));
      return td;
    }, 'asc'],
    ['State', 'state', function (a) { return a.state === 'suspended' ? el('span', 'suspended', 'tag s') : el('span', a.state, 'muted'); }, 'asc'],
    ['Created', 'created', function (a) { return dayOf(a.created); }, 'desc'],
    ['Last seen', 'seen', function (a) { return seen(a.lastSeen); }, 'desc'],
    ['Items', 'items', function (a) { return fmt(a.items); }, 'desc'],
    ['Runs', 'runs', function (a) { return fmt(a.runs); }, 'desc'],
    ['Published', 'pubs', function (a) { return fmt(a.pubs); }, 'desc'],
    ['Bytes', 'bytes', function (a) { return size(a.bytes); }, 'desc'],
    ['Sessions', null, function (a) { return fmt(a.sessions); }, 'desc'],
  ];

  function accountsPath() {
    var p = '/api/admin/accounts?';
    if (ACC.q) p += 'q=' + encodeURIComponent(ACC.q) + '&';
    return p + 'state=' + ACC.state + '&sort=' + ACC.sort + '&dir=' + ACC.dir + '&page=' + ACC.page;
  }

  function renderAccounts(root) {
    var head = el('div', null, 'vhead');
    head.append(el('h2', 'Accounts'));
    var bar = el('div', null, 'bar');
    var search = el('input');
    search.type = 'search';
    search.name = 'q';
    search.maxLength = 20;
    search.placeholder = 'part of a name';
    search.value = ACC.q;
    var searchLabel = el('label', 'Search ');
    searchLabel.append(search);
    var state = el('select');
    state.name = 'state';
    [['all', 'All'], ['active', 'Active'], ['suspended', 'Suspended']].forEach(function (o) {
      var opt = el('option', o[1]);
      opt.value = o[0];
      state.append(opt);
    });
    state.value = ACC.state;
    var stateLabel = el('label', 'State ');
    stateLabel.append(state);
    var totals = el('span', '', 'muted end totals');
    bar.append(searchLabel, stateLabel, reloadButton(), totals);
    var msg = el('p', '', 'err');
    msg.setAttribute('role', 'alert');
    var box = el('div', null, 'tbox');
    var pager = el('div', null, 'pager');
    root.append(head, bar, msg, box, pager);

    var timer = null;
    search.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var q = search.value.trim();
        if (q === ACC.q) return;
        ACC.q = q;
        ACC.page = 1;
        load();
      }, 300);
    });
    state.addEventListener('change', function () {
      ACC.state = state.value;
      ACC.page = 1;
      load();
    });

    function load() {
      msg.textContent = '';
      return api(accountsPath()).then(function (d) {
        draw(d);
      }, function (e) {
        msg.textContent = 'Could not read the accounts: ' + e.message;
      });
    }

    function draw(d) {
      var list = Array.isArray(d.accounts) ? d.accounts : [];
      totals.textContent = plural(d.totals.accounts, 'account', 'accounts') + ' · ' + size(d.totals.bytes) + ' in all';
      var t = el('table', null, 'accounts');
      var tr = el('tr');
      ACC_COLS.forEach(function (c) {
        var th = el('th');
        th.scope = 'col';
        if (c[1]) {
          var on = ACC.sort === c[1];
          th.setAttribute('aria-sort', on ? (ACC.dir === 'asc' ? 'ascending' : 'descending') : 'none');
          var b = button(c[0] + (on ? (ACC.dir === 'asc' ? ' ▴' : ' ▾') : ''), '', function () {
            if (ACC.sort === c[1]) ACC.dir = ACC.dir === 'asc' ? 'desc' : 'asc';
            else {
              ACC.sort = c[1];
              ACC.dir = c[3];
            }
            ACC.page = 1;
            load();
          });
          b.dataset.sort = c[1];
          th.append(b);
        } else th.textContent = c[0];
        tr.append(th);
      });
      var thead = el('thead');
      thead.append(tr);
      var tbody = el('tbody');
      list.forEach(function (a) {
        var row = el('tr');
        ACC_COLS.forEach(function (c) {
          var v = c[2](a);
          if (v instanceof Node && v.tagName === 'TD') row.append(v);
          else {
            var td = el('td');
            td.append(v);
            row.append(td);
          }
        });
        tbody.append(row);
      });
      if (!list.length) {
        var none = el('tr');
        var td = el('td', ACC.q || ACC.state !== 'all' ? 'No account matches.' : 'No accounts yet.', 'muted');
        td.colSpan = ACC_COLS.length;
        none.append(td);
        tbody.append(none);
      }
      t.append(thead, tbody);
      box.replaceChildren(t);

      pager.replaceChildren();
      var size_ = d.pageSize || 50;
      var pages = Math.max(1, Math.ceil(d.total / size_));
      var from = d.total ? (d.page - 1) * size_ + 1 : 0;
      pager.append(el('span', fmt(from) + '–' + fmt(from ? from + list.length - 1 : 0) + ' of ' + fmt(d.total) + ' · page ' + fmt(d.page) + ' of ' + fmt(pages), 'muted'));
      var prev = button('Previous', '', function () { ACC.page = d.page - 1; load(); });
      prev.disabled = d.page <= 1;
      var next = button('Next', '', function () { ACC.page = d.page + 1; load(); });
      next.disabled = d.page >= pages;
      pager.append(prev, next);
    }

    load();
  }

  registerView('accounts', { title: 'Accounts', group: 'look', render: renderAccounts });

  // --- One account ---

  function panel(title, cls) {
    var s = el('section', null, 'card' + (cls ? ' ' + cls : ''));
    s.append(el('h3', title));
    return s;
  }
  function useBar(name, used, limit, kind) {
    var pct = limit > 0 ? (100 * used) / limit : used > 0 ? 100 : 0;
    var track = el('div', null, 'track');
    track.setAttribute('role', 'meter');
    track.setAttribute('aria-label', name);
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', String(limit));
    track.setAttribute('aria-valuenow', String(used));
    var fill = el('div', null, 'fill' + (pct >= 80 ? ' hi' : ''));
    fill.style.width = Math.min(100, pct).toFixed(1) + '%';
    track.append(fill);
    var v = el('span', limitText(kind, used) + ' of ' + limitText(kind, limit), 'v' + (used > limit ? ' over' : ''));
    return [el('span', name), track, v];
  }

  function renderAccount(root, name) {
    var back = para([link('← Accounts', '#accounts')]);
    var msg = el('p', 'Loading…', 'muted');
    root.append(back, msg);
    if (!name) {
      msg.textContent = 'No account named.';
      return;
    }
    api('/api/admin/account/' + encodeURIComponent(name)).then(function (d) {
      msg.remove();
      drawAccount(root, d);
    }, function (e) {
      msg.className = 'err';
      msg.textContent = e.status === 404 ? 'No account named ' + quoted(name) + '.' : 'Could not read the account: ' + e.message;
    });
  }

  function drawAccount(root, d) {
    var a = d.account;
    var lim = d.limits;
    var head = el('div', null, 'vhead acct-head');
    head.append(el('h2', a.name));
    head.append(el('span', a.state + ' · created ' + dayOf(a.created) + ' · last seen ' + seen(a.lastSeen), 'muted'));
    if (a.state === 'suspended') head.append(el('span', 'suspended', 'tag s'));
    if (!isEmpty(lim.own)) head.append(el('span', 'limits of its own', 'tag'));
    var cols = el('div', null, 'cols');
    var wide = el('div', null, 'wide');
    var narrow = el('div', null, 'narrow');
    cols.append(wide, narrow);
    root.append(head, cols);

    // Storage against its limits.
    var useCard = panel('Storage against its limits');
    var use = el('div', null, 'use');
    [
      ['Small items', a.items, lim.effective.items, 'n'],
      ['Item bytes', a.itemBytes, lim.effective.itemBytes, 'b'],
      ['Runs', a.runBytes, lim.effective.runBytes, 'b'],
      ['Published runs', a.pubs, lim.effective.sharedRuns, 'n'],
    ].forEach(function (r) { useBar(r[0], r[1], r[2], r[3]).forEach(function (n) { use.append(n); }); });
    useCard.append(use);
    wide.append(useCard, limitsCard(a, lim));

    // Clean up (the owner's pick 3a).
    var clean = panel('Clean up');
    var after = function () { rerender(); };
    var acts = el('div', null, 'acts');
    acts.append(
      button('End all sessions', '', function () { accountAction(a.name, 'end-sessions', after); }),
      a.state === 'suspended'
        ? button('Restore…', '', function () { accountAction(a.name, 'restore', after); })
        : button('Suspend…', '', function () { accountAction(a.name, 'suspend', after); }),
      button('Delete account…', 'danger', function () { accountAction(a.name, 'delete', function () { navigate('#accounts'); }); }),
    );
    clean.append(acts, el('p', 'Each asks first. Delete wants the name typed and removes everything the account owns (D1 and R2); its name stays reserved.', 'muted small'));

    // In the community.
    var com = panel('In the community');
    var kv = el('dl', null, 'kv');
    var c = d.community;
    [
      ['Published runs', fmt(a.pubs) + ' (' + fmt(c.listed) + ' in the Hall of Fame) · ' + size(a.pubBytes)],
      ['Votes cast', fmt(c.votes)],
      ['Comments', fmt(c.comments)],
      ['Notes', fmt(c.notes)],
      ['Reports made', fmt(c.reportsMade)],
      ['Open reports on it', fmt(c.reportsOpen)],
      ['Sessions', fmt(d.sessions.count) + (d.sessions.lastUsed ? ' · last used ' + ago(d.sessions.lastUsed) : '')],
    ].forEach(function (p) { kv.append(el('dt', p[0]), el('dd', p[1])); });
    com.append(kv);

    // Its log entries.
    var logCard = panel('Log');
    var entries = Array.isArray(d.log) ? d.log : [];
    if (entries.length) logCard.append(logTable(entries, { compact: true }));
    else logCard.append(el('p', 'Nothing in the log about it.', 'muted small'));
    narrow.append(clean, com, logCard);
  }

  /** The Limits card: the default, this account's own value (an input) and its use per limit. */
  function limitsCard(a, lim) {
    var s = panel('Limits');
    var t = el('table', null, 'limits');
    var help = el('p', 'Empty: the default holds and follows it. Sizes in MB (1 MB = 1,048,576 bytes); KB and GB work too. A limit under what the account uses removes nothing; writes that would grow past it are refused.', 'muted small limits-help');
    var hr = el('tr');
    ['Limit', 'Default', 'This account', 'In use'].forEach(function (h) { hr.append(el('th', h)); });
    var thead = el('thead');
    thead.append(hr);
    var tbody = el('tbody');
    var inputs = {};
    LIMITS.forEach(function (def) {
      var tr = el('tr');
      var input = limitInput(def, lim.own[def[0]], lim.defaults[def[0]]);
      inputs[def[0]] = input;
      var td = el('td');
      td.append(input);
      tr.append(el('td', def[1]), el('td', limitText(def[2], lim.defaults[def[0]])), td, el('td', def[3] ? limitText(def[2], a[def[3]]) : ''));
      tbody.append(tr);
    });
    t.append(thead, tbody);
    var msg = el('p', '', 'err');
    msg.setAttribute('role', 'alert');
    var save = button('Save limits', 'primary', function () {
      msg.textContent = '';
      var r = readLimits(inputs, lim.builtIn);
      if (r.errors.length) {
        msg.textContent = r.errors.join(' ');
        return;
      }
      // Values equal to the default are not the account's own: they follow it.
      var own = {};
      var eff = {};
      LIMITS.forEach(function (def) {
        var f = def[0];
        if (f in r.values && r.values[f] !== lim.defaults[f]) own[f] = r.values[f];
        eff[f] = f in own ? own[f] : lim.defaults[f];
      });
      var lines = limitChanges(lim.effective, eff);
      if (!lines.length && JSON.stringify(own) === JSON.stringify(ownOrdered(lim.own))) {
        msg.textContent = 'Nothing to save: the limits are as they are.';
        return;
      }
      var warnings = [];
      LIMITS.forEach(function (def) {
        if (def[3] && eff[def[0]] < a[def[3]]) warnings.push(def[1] + ' ' + limitText(def[2], eff[def[0]]) + ' is under what ' + a.name + ' uses (' + limitText(def[2], a[def[3]]) + '). Nothing is removed; writes that would grow past it are refused.');
      });
      var body = [para(['The limits of ', el('b', a.name), ' change:']), lines.length ? changeList(lines) : el('p', 'Its own values are set equal to the defaults; they follow the defaults from now on.')];
      warnings.forEach(function (w) { body.push(el('p', w, 'warn')); });
      confirmModal({
        title: 'Save the limits of ' + a.name + '?',
        body: body,
        ok: 'Save limits',
        done: 'Limits saved: ' + a.name,
        after: rerender,
        run: function (note) {
          return write('PUT', '/api/admin/account/' + encodeURIComponent(a.name) + '/limits', withNote({ limits: isEmpty(own) ? null : own }, note));
        },
      });
    });
    var reset = button('Reset to defaults', '', function () {
      confirmModal({
        title: 'Reset the limits of ' + a.name + '?',
        body: [para([el('b', a.name), ' gets the defaults for every limit and follows them from now on.']), changeList(limitChanges(lim.effective, lim.defaults))],
        ok: 'Reset to defaults',
        done: 'Limits back to the defaults: ' + a.name,
        after: rerender,
        run: function (note) {
          return write('PUT', '/api/admin/account/' + encodeURIComponent(a.name) + '/limits', withNote({ limits: null }, note));
        },
      });
    });
    reset.disabled = isEmpty(lim.own);
    var acts = el('div', null, 'acts');
    acts.append(save, reset);
    var box = el('div', null, 'tbox');
    box.append(t);
    s.append(box, help, msg, acts);
    return s;
  }
  function ownOrdered(own) {
    var o = {};
    LIMITS.forEach(function (def) { if (own && def[0] in own) o[def[0]] = own[def[0]]; });
    return o;
  }

  registerView('account', { title: 'Account', group: null, nav: 'accounts', render: renderAccount });
`;
