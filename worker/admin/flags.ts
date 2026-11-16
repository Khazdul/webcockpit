// The admin page's "Flags and limits" view (stage 66, ADR 0157; the
// owner's pick 4b): today's flags and their switches (stage 59), and the
// default limits for every account, edited without a release. An account
// with a limit of its own keeps it.

export const FLAGS_CSS = `.flags { width: auto; min-width: 28em; }
.flags-sec, .defaults-sec { margin-bottom: 24px; }
@media (max-width: 900px) { .flags { min-width: 0; width: 100%; } }
`;

export const FLAGS_JS = String.raw`
  // --- Flags and limits ---

  function renderFlagsView(root) {
    var head = el('div', null, 'vhead');
    head.append(el('h2', 'Flags and limits'), reloadButton());
    root.append(head);

    var fsec = el('section', null, 'card flags-sec');
    fsec.append(el('h3', 'Flags'));
    var fmsg = el('p', '', 'err');
    fmsg.setAttribute('role', 'alert');
    var ft = el('table', null, 'flags');
    ft.id = 'flags';
    var fhr = el('tr');
    ['Flag', 'Now', 'Default', ''].forEach(function (h) { fhr.append(el('th', h)); });
    var fthead = el('thead');
    fthead.append(fhr);
    var ftbody = el('tbody');
    ft.append(fthead, ftbody);
    fsec.append(ft, fmsg, el('p', 'A switch takes effect within 30 seconds and goes to the admin log.', 'muted small'));

    var dsec = el('section', null, 'card defaults-sec');
    dsec.append(el('h3', 'Default limits for every account'), el('p', 'An account with a limit of its own keeps it. A changed default reaches every other account within a minute; nothing stored is removed.', 'muted small'));
    var dbody = el('div');
    dbody.append(el('p', 'Loading…', 'muted'));
    dsec.append(dbody);
    root.append(fsec, dsec);

    function loadFlags() {
      return api('/api/admin/stats').then(function (s) {
        ftbody.replaceChildren();
        Object.keys(s.flags).forEach(function (name) {
          var f = s.flags[name];
          var tr = el('tr');
          var b = button(f.value ? 'Turn off' : 'Turn on', '', function () {
            b.disabled = true;
            fmsg.textContent = '';
            write('PUT', '/api/admin/flags/' + encodeURIComponent(name), { value: !f.value }).then(loadFlags, function (e) {
              fmsg.textContent = 'Could not set ' + name + ': ' + e.message;
              b.disabled = false;
            });
          });
          var td = el('td');
          td.append(b);
          tr.append(el('td', name), el('td', f.value ? 'on' : 'off'), el('td', (f.default ? 'on' : 'off') + (f.override === null ? '' : ' (overridden)')), td);
          ftbody.append(tr);
        });
      }, function (e) {
        fmsg.textContent = 'Could not read the flags: ' + e.message;
      });
    }

    function loadDefaults() {
      return api('/api/admin/limits').then(function (lim) { drawDefaults(lim); }, function (e) {
        dbody.replaceChildren(el('p', 'Could not read the default limits: ' + e.message, 'err'));
      });
    }

    function drawDefaults(lim) {
      var t = el('table', null, 'limits');
      var hr = el('tr');
      ['Limit', 'Built in', 'Default now'].forEach(function (h) { hr.append(el('th', h)); });
      var thead = el('thead');
      thead.append(hr);
      var tbody = el('tbody');
      var inputs = {};
      LIMITS.forEach(function (def) {
        var f = def[0];
        var input = limitInput(def, lim.defaults[f] !== lim.builtIn[f] ? lim.defaults[f] : null, lim.builtIn[f]);
        inputs[f] = input;
        var td = el('td');
        td.append(input);
        var tr = el('tr');
        tr.append(el('td', def[1]), el('td', limitText(def[2], lim.builtIn[f])), td);
        tbody.append(tr);
      });
      t.append(thead, tbody);
      var msg = el('p', '', 'err');
      msg.setAttribute('role', 'alert');
      var overridden = LIMITS.some(function (def) { return lim.defaults[def[0]] !== lim.builtIn[def[0]]; });

      var save = button('Save defaults', 'primary', function () {
        msg.textContent = '';
        var r = readLimits(inputs, lim.builtIn);
        if (r.errors.length) {
          msg.textContent = r.errors.join(' ');
          return;
        }
        var defaults = {};
        var after = {};
        LIMITS.forEach(function (def) {
          var f = def[0];
          if (f in r.values && r.values[f] !== lim.builtIn[f]) defaults[f] = r.values[f];
          after[f] = f in defaults ? defaults[f] : lim.builtIn[f];
        });
        var lines = limitChanges(lim.defaults, after);
        if (!lines.length) {
          msg.textContent = 'Nothing to save: the defaults are as they are.';
          return;
        }
        confirmModal({
          title: 'Change the default limits?',
          body: [el('p', 'For every account without a limit of its own:'), changeList(lines), el('p', 'Nothing stored is removed; a lower limit refuses the writes that would grow past it.')],
          ok: 'Save defaults',
          done: 'Default limits saved.',
          after: rerender,
          run: function (note) { return write('PUT', '/api/admin/limits', withNote({ defaults: isEmpty(defaults) ? null : defaults }, note)); },
        });
      });
      var reset = button('Back to built in', '', function () {
        confirmModal({
          title: 'Back to the built-in limits?',
          body: [el('p', 'Every default goes back to the value built into the Worker:'), changeList(limitChanges(lim.defaults, lim.builtIn))],
          ok: 'Back to built in',
          done: 'Default limits back to built in.',
          after: rerender,
          run: function (note) { return write('PUT', '/api/admin/limits', withNote({ defaults: null }, note)); },
        });
      });
      reset.disabled = !overridden;
      var acts = el('div', null, 'acts');
      acts.append(save, reset);
      var box = el('div', null, 'tbox');
      box.append(t);
      dbody.replaceChildren(box, el('p', 'Empty: the built-in value holds. Sizes in MB (1 MB = 1,048,576 bytes, as everywhere on this page); B, KB and GB work too. At most 20 × the built-in value.', 'muted small limits-help'), msg, acts);
    }

    loadFlags();
    loadDefaults();
  }

  registerView('flags', { title: 'Flags and limits', group: 'site', render: renderFlagsView });
`;
