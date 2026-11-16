// The admin page's Log view (stage 66, ADR 0157 "The audit log cannot be
// changed afterwards"): every admin action newest first, 100 a page and
// older pages on asking, a kind filter and a search by target, and the
// chain's state over the whole log in the header. Entries from before stage
// 66 carry no seal and are marked "not sealed".

export const LOG_CSS = `.seal { display: inline-flex; align-items: center; gap: 6px; font-size: .88rem; border: 1px solid; border-radius: 5px; padding: 3px 10px; overflow-wrap: anywhere; }
.seal.ok { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 50%, transparent); background: color-mix(in srgb, var(--ok) 10%, transparent); }
.seal.bad { color: var(--bad); border-color: var(--bad); background: color-mix(in srgb, var(--bad) 12%, transparent); font-weight: 600; }
.audit td, .audit th { text-align: left; vertical-align: top; }
.audit td { overflow-wrap: anywhere; }
.audit td.ts, .audit td.act { white-space: nowrap; overflow-wrap: normal; }
.audit tr.old td { color: var(--muted); }
.k { font-size: .72rem; font-weight: 700; border-radius: 3px; padding: 1px 6px; text-transform: uppercase; letter-spacing: .04em; background: color-mix(in srgb, var(--fg) 10%, transparent); white-space: nowrap; }
.k.acc { background: color-mix(in srgb, var(--warn) 20%, transparent); }
.k.mod { background: color-mix(in srgb, var(--accent) 18%, transparent); }
.k.fl { background: color-mix(in srgb, var(--ok) 18%, transparent); }
.k.lim { background: color-mix(in srgb, #8a5bb3 22%, transparent); }
`;

export const LOG_JS = String.raw`
  // --- Log: the audit log ---

  var LOG = { kind: '', q: '' };
  var LOG_KINDS = [['', 'All'], ['moderation', 'Moderation'], ['accounts', 'Accounts'], ['limits', 'Limits'], ['flags', 'Flags']];

  /** An action's kind as the Log shows it: [name, class]. */
  function logKind(action) {
    var a = String(action);
    var p = a.split('.')[0];
    if (p === 'pub' || p === 'comment' || p === 'note') return ['Moderation', 'mod'];
    if (a === 'account.limits' || p === 'limits') return ['Limits', 'lim'];
    if (p === 'account') return ['Account', 'acc'];
    if (p === 'flag') return ['Flag', 'fl'];
    return [p, ''];
  }
  /** The target cell: an account's name links to its page; a run, comment or note is named. */
  function logTarget(e) {
    var p = String(e.action).split('.')[0];
    var td = el('td');
    if (p === 'account') td.append(link(e.target, accountHash(e.target)));
    else td.textContent = (p === 'pub' ? 'run ' : p === 'comment' ? 'comment ' : p === 'note' ? 'note ' : '') + e.target;
    return td;
  }
  /** Rows of the log; o.compact leaves out Kind and By (one account's card). */
  function logRows(tbody, entries, o) {
    entries.forEach(function (e) {
      var tr = el('tr', null, e.sealed === false ? 'old' : '');
      tr.dataset.id = String(e.id);
      var k = logKind(e.action);
      tr.append(el('td', utc(e.ts), 'ts'));
      if (!o.compact) {
        var kc = el('td');
        kc.append(el('span', k[0], 'k' + (k[1] ? ' ' + k[1] : '')));
        tr.append(kc);
      }
      tr.append(el('td', e.action, 'act'), logTarget(e));
      var note = el('td', e.note);
      if (e.sealed === false) note.append(el('span', 'not sealed', 'tag old'));
      tr.append(note);
      if (!o.compact) tr.append(el('td', e.by || '—', 'muted'));
      tbody.append(tr);
    });
  }
  function logTable(entries, o) {
    var t = el('table', null, 'audit' + (o.compact ? ' log' : ''));
    var hr = el('tr');
    (o.compact ? ['When (UTC)', 'Action', 'Target', 'Note'] : ['When (UTC)', 'Kind', 'Action', 'Target', 'Note', 'By']).forEach(function (h) { hr.append(el('th', h)); });
    var thead = el('thead');
    thead.append(hr);
    var tbody = el('tbody');
    logRows(tbody, entries, o);
    t.append(thead, tbody);
    return t;
  }
  /**
   * The chain's state: intact (green), broken (red, with every entry that
   * does not match, as many as the Worker lists, and their count), or
   * unkeyed (red: the Worker has no secret key, so the seals prove only order).
   */
  function chainBadge(c) {
    var b = el('span', null, 'seal ' + (c.state === 'intact' ? 'ok' : 'bad'));
    b.setAttribute('role', 'status');
    var sealedText = plural(c.sealed, 'sealed entry', 'sealed entries');
    var parts;
    if (c.state === 'intact') parts = ['Sealed and intact · ' + sealedText];
    else if (c.state === 'unkeyed') parts = ['Not keyed: the Worker has no AUTH_PEPPER, so anyone could have made these seals · ' + sealedText];
    else {
      var ids = Array.isArray(c.broken) && c.broken.length ? c.broken : c.brokenAt === null || c.brokenAt === undefined ? [] : [c.brokenAt];
      var n = typeof c.brokenCount === 'number' ? c.brokenCount : ids.length;
      var list = ids.map(function (id) { return '#' + id; }).join(', ');
      parts = ['Broken: ' + plural(n, 'entry does', 'entries do') + ' not match' + (list ? ' (' + list + (n > ids.length ? ', …' : '') + ')' : '') + ' · ' + sealedText];
    }
    if (c.unsealed) parts.push(fmt(c.unsealed) + ' not sealed (before stage 66)');
    b.append(parts.join(' · '));
    if (c.head) {
      b.append(' · newest seal ');
      b.append(el('code', c.head));
    }
    return b;
  }

  function logPath(before) {
    var p = '/api/admin/log';
    var q = [];
    if (before !== null && before !== undefined) q.push('before=' + encodeURIComponent(before));
    if (LOG.kind) q.push('kind=' + encodeURIComponent(LOG.kind));
    if (LOG.q) q.push('q=' + encodeURIComponent(LOG.q));
    return p + (q.length ? '?' + q.join('&') : '');
  }

  function renderLogView(root) {
    var head = el('div', null, 'vhead');
    head.append(el('h2', 'Audit log'));
    var badge = el('span');
    head.append(badge, el('span', 'Nothing here can be changed or removed; a change made outside the page shows as broken.', 'muted small'));
    var bar = el('div', null, 'bar');
    var kind = el('select');
    kind.name = 'kind';
    LOG_KINDS.forEach(function (k) {
      var o = el('option', k[1]);
      o.value = k[0];
      kind.append(o);
    });
    kind.value = LOG.kind;
    var kindLabel = el('label', 'Kind ');
    kindLabel.append(kind);
    var search = el('input');
    search.type = 'search';
    search.name = 'q';
    search.maxLength = 64;
    search.placeholder = 'name or id';
    search.value = LOG.q;
    var searchLabel = el('label', 'Target ');
    searchLabel.append(search);
    bar.append(kindLabel, searchLabel, reloadButton());
    var msg = el('p', '', 'err');
    msg.setAttribute('role', 'alert');
    var box = el('div', null, 'tbox');
    var t = logTable([], {});
    var tbody = t.querySelector('tbody');
    box.append(t);
    var foot = el('div', null, 'pager');
    var shown = el('span', '', 'muted');
    var older = button('Older', '', function () { load(next); });
    older.hidden = true;
    foot.append(shown, older);
    root.append(head, bar, msg, box, foot);

    var next = null;
    var count = 0;
    var timer = null;
    kind.addEventListener('change', function () { LOG.kind = kind.value; load(null); });
    search.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var q = search.value.trim();
        if (q === LOG.q) return;
        LOG.q = q;
        load(null);
      }, 300);
    });

    // Only the newest read draws (review fix CR3): a slow answer to an older filter is dropped.
    var seq = 0;
    function load(before) {
      var mine = ++seq;
      msg.textContent = '';
      older.disabled = true;
      return api(logPath(before)).then(function (d) {
        if (mine !== seq) return;
        var entries = Array.isArray(d.entries) ? d.entries : [];
        if (before === null) {
          tbody.replaceChildren();
          count = 0;
        }
        logRows(tbody, entries, {});
        count += entries.length;
        if (!count) {
          var tr = el('tr');
          var td = el('td', LOG.kind || LOG.q ? 'No entry matches.' : 'Nothing in the log yet.', 'muted');
          td.colSpan = 6;
          tr.append(td);
          tbody.append(tr);
        }
        if (d.chain) badge.replaceWith((badge = chainBadge(d.chain)));
        next = d.next;
        shown.textContent = (count ? '1–' + fmt(count) : '0') + ' of ' + fmt(d.total);
        older.hidden = next === null || next === undefined;
        older.disabled = false;
      }, function (e) {
        if (mine !== seq) return;
        msg.textContent = 'Could not read the log: ' + e.message;
        older.disabled = false;
      });
    }
    load(null);
  }

  registerView('log', { title: 'Log', group: 'look', render: renderLogView });
`;
