// The mockups' states (stage 63, round 11). Runs in two places: in the review
// shell, where it only lists the states (window.MK_STATES), and inside the
// stage's document, where `window.MK` names the state to draw over the
// captured page (build/skel). Throwaway: the built DOM as captured, the new
// content in the built classes where they exist and in mk-* classes where not.
(function () {
  'use strict';

  const MK = window.MK || { view: 'd', icons: {} };
  const view = MK.view;
  const touch = view !== 'd';
  const ic = (name, cls) => ((MK.icons && MK.icons[name]) || '').replace('class="wc-lk-ic', 'class="wc-lk-ic ' + (cls || ''));
  // The kit has no cloud icon: one drawn in its manner (16 × 16, a single stroked path).
  const CLOUD = 'M4.6 12.5h7.1a2.7 2.7 0 0 0 .4-5.4 3.9 3.9 0 0 0-7.5-.9 2.9 2.9 0 0 0 0 6.3z';
  const cloud = (cls) => `<svg class="wc-lk-ic mk-cloud ${cls || ''}" viewBox="0 0 16 16" aria-hidden="true"><path d="${CLOUD}"></path></svg>`;
  const cloudOff = (cls) => `<svg class="wc-lk-ic mk-cloud is-off ${cls || ''}" viewBox="0 0 16 16" aria-hidden="true"><path d="${CLOUD}"></path><path d="M2.5 2.5l11 11"></path></svg>`;

  // ----------------------------------------------------------------- the words
  const T = {
    full: 'Your cloud storage is full (49 of 50 MB).',
    kept: 'The run is saved on this device.',
    storage: 'This device 6.1 MB · Cloud 48 of 50 MB',
    notCounted: '3 sessions in the cloud are not counted',
    del: 'Delete this session? It is deleted on all your devices and in the cloud.',
  };

  // ----------------------------------------------------------------- states
  const S = [];
  const add = (s) => S.push(Object.assign({ views: ['d', 'p'] }, s));
  const topic = (id, label) => (dir, dirLabel) => (o) => add(Object.assign({ topic: id, topicLabel: label, dir, dirLabel }, o));

  // 1. "Does not fit"
  {
    const t = topic('fit', '1 · “Does not fit”');
    const a = t('a', 'a · The kit’s dialog where the save was asked');
    a({ id: 'fit-a-start', label: 'Start page, after an Exit', page: 'in', fit: 'start', note: 'Rated and saved in the Exit popup (desktop) or the exit sheet (phone): the upload runs once the game has ended, so the answer arrives on the start page. The kit’s dialog over the menu; Enter keeps the run on this device.' });
    a({ id: 'fit-a-history', label: 'History, Save or Rate', page: 'history', fit: 'history', note: 'Saved from History’s card: the dialog over History. Open History would lead where the player already is, so it is left out here.' });
    const b = t('b', 'b · Inline in the Exit popup and exit sheet, a dialog elsewhere');
    b({ id: 'fit-b-exit', label: 'Exit popup / exit sheet', page: 'game', fit: 'inline', note: 'The client knows the account’s use and the run’s size before the game ends, so the popup (desktop) and the exit sheet (phone) can say it as soon as a rating is given: the same words under the stars, and Download the run beside Exit. Exit still saves the run on this device. Elsewhere (History; a run that fills the cloud only once uploaded) the dialog of a.' });
    b({ id: 'fit-b-history', label: 'History (as a)', page: 'history', fit: 'history', note: 'Elsewhere b uses the dialog of a: History’s Save or Rate, and the start page when the cloud filled up only after the Exit (an upload of another device in between).' });
  }

  // 2. History
  {
    const t = topic('hist', '2 · History’s marks and storage line');
    const dirs = [
      ['a', 'a · A mark column with a tooltip, the size in a column'],
      ['b', 'b · A text tag in the row'],
    ];
    for (const [d, label] of dirs) {
      const x = t(d, label);
      x({ id: `hist-${d}-list`, label: 'The list', page: 'history', hist: { mode: d, chosen: 'device' }, note: d === 'a' ? 'A narrow first column: a cloud for a session only in the cloud, a struck cloud for a saved run not in the cloud, nothing for a run in step (and for unsaved runs, which never go up). The size of every session in a column of its own; the chosen row’s mark shows its tooltip. The foot’s storage line gives both stores.' : 'No new columns: a quiet tag beside the name says “in the cloud · 2.4 MB” or “not in the cloud”; a run in step and an unsaved run say nothing. The foot’s storage line gives both stores.' });
      x({ id: `hist-${d}-cloud`, label: 'A cloud-only session', page: 'history', hist: { mode: d, chosen: 'cloud' }, note: 'A session saved on another device, chosen: the card has everything the run item carries (level, deeds, rating) and says under Log that it is fetched when opened. Run log, Stats and Export fetch it first.' });
      x({ id: `hist-${d}-fetch`, label: 'Fetching', page: 'history', hist: { mode: d, chosen: 'cloud', fetch: true }, note: 'Run log pressed on the cloud-only session: stage 24’s bar in the card, bytes of the body over its size; the actions wait. Then the run log opens as for any session, and the mark goes.' });
      x({ id: `hist-${d}-offline`, label: 'Offline', page: 'history', hist: { mode: d, chosen: 'cloud', offline: true }, note: 'No network: the cloud-only rows are quieter and say so; the card says why Run log, Stats and Export cannot open it. Rate and Delete still work (they are item writes that wait for the network).' });
    }
  }

  // 3. Log out
  {
    const t = topic('logout', '3 · Log out with runs not in the cloud');
    t('a', 'a · One runs row, the reason in a second line')({ id: 'logout-a', label: 'Cloud full and too large', page: 'logout', logout: 'a', note: 'Round 9’s single saved-runs row, now “not in the cloud”, with the reasons in the quieter second line the changes row already uses (stage 62). The unsaved runs’ row as built.' });
    t('b', 'b · One row per reason')({ id: 'logout-b', label: 'Cloud full and too large', page: 'logout', logout: 'b', note: 'A row for each reason: “not in the cloud — cloud full” and “too large for the cloud”. The unsaved runs’ row as built.' });
  }

  // 4. Delete
  {
    const t = topic('delete', '4 · Delete, logged in');
    t('a', 'The built dialog, new words')({ id: 'delete-cloud', label: 'A saved session', page: 'delete', note: 'History’s Delete dialog as built; its warning says that the session goes on every device and in the cloud. A guest keeps today’s words.' });
  }

  // 5. The counts
  {
    const t = topic('count', '5 · The counts in Statistics, Spotlights and Diary');
    const a = t('a', 'Where the line sits');
    a({ id: 'count-spot', label: 'Spotlights', page: 'spot', count: 'spot', views: ['d'], note: 'In the foot, after “5 spotlights · 01:06”: what the reel leaves out, and Fetch all.' });
    a({ id: 'count-spot-fetch', label: 'Spotlights, fetching all', page: 'spot', count: 'spot', fetchAll: true, views: ['d'], note: 'Fetch all pressed: stage 24’s bar in the line’s place; the reel is built again when the sessions are here.' });
    a({ id: 'count-diary', label: 'Diary', page: 'diary', count: 'diary', views: ['d'], note: 'In the foot between Previous and Next.' });
    a({ id: 'count-stats', label: 'Statistics', page: 'stats', count: 'stats', views: ['d'], note: 'Under the head’s “Session details” line. Statistics shows one session, which is fetched when opened, so nothing in it is left out: the line here says only that other sessions exist (see the README).' });
    a({ id: 'count-phone', label: 'Phone (Spotlights)', page: 'spot', count: 'spot', views: ['p'], note: 'On a phone the line has no Fetch all: a phone never fetches a library by itself. Diary’s foot takes it the same way.' });
  }

  window.MK_STATES = S.map((s) => ({ id: s.id, topic: s.topic, topicLabel: s.topicLabel, dir: s.dir, dirLabel: s.dirLabel, label: s.label, note: s.note, page: s.page, views: s.views, noshot: !!s.noshot }));
  if (!window.MK) return;

  // ------------------------------------------------------------------ apply
  const st = S.find((s) => s.id === MK.state) || S[0];
  const app = document.getElementById('app');
  const root = document.documentElement;
  root.classList.add('mk-' + view, touch ? 'mk-touch' : 'mk-mouse', 'mk-st-' + st.topic);

  // ---------------------------------------------------------------- the game
  if (st.page === 'game') {
    if (!touch) {
      const pop = app.querySelector('.wc-pop-exit');
      pop.style.top = 'auto';
      pop.style.bottom = app.dataset.bottom + 'px';
      if (st.fit === 'inline') {
        pop.querySelector('.wc-pop-stars').insertAdjacentHTML('afterend', `<div class="wc-pop-warn mk-pop-full">${T.full} ${T.kept}</div>`);
        pop.querySelector('[data-act="exit"]').insertAdjacentHTML('beforebegin', '<button type="button" class="wc-pop-btn" data-act="download">Download the run<span class="wc-pop-k">D</span></button>');
        // Wider for the third button, its right edge where it was (over the menu bar's Exit).
        const right = parseFloat(pop.style.left) + pop.offsetWidth;
        pop.style.width = '420px';
        pop.style.maxWidth = 'none';
        pop.style.left = right - 420 + 'px';
      }
    } else if (st.fit === 'inline') {
      const card = app.querySelector('.wc-ph-exit-card');
      card.insertAdjacentHTML('beforeend', `<p class="mk-ph-full">${T.full} ${T.kept}</p><button type="button" class="wc-ph-rate-clear mk-ph-dl" tabindex="-1">Download the run</button>`);
    }
    return;
  }

  const start = app.querySelector('.wc-start');
  start.querySelector('.wc-start-skyhost').style.background = `#1b2340 url(${MK.sky}) center / cover no-repeat`;
  const okb = app.querySelector('.wc-okb-page');
  if (okb) okb.remove();
  app.style.removeProperty('--wc-okb-page-h');

  const frames = [...app.querySelectorAll('.wc-frame')];
  const topFrame = frames.filter((f) => !f.hasAttribute('hidden') && !f.hasAttribute('data-overlay')).pop() || frames.filter((f) => !f.hasAttribute('data-overlay')).pop();

  /** A dialog in the kit's markup (look-overlay.css), over the top frame's box. */
  function dialog(o) {
    // Over a page, its box; over the start menu, the whole screen (the menu panel is too small to hold it).
    const box = topFrame.querySelector('.wc-lk-box-large');
    const r = box ? box.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    const btns = o.buttons
      .map(
        (b) =>
          `<button type="button" class="wc-lk-btn${b.primary ? ' is-primary' : ''}" data-btn="${b.id}" tabindex="-1"><span>${b.label.replace(b.letter, `<u class="wc-sk">${b.letter}</u>`)}</span></button>`,
      )
      .join('');
    const corners = '<i class="wc-lk-br wc-lk-b1"></i><i class="wc-lk-br wc-lk-b2"></i><i class="wc-lk-br wc-lk-b3"></i><i class="wc-lk-br wc-lk-b4"></i>';
    const html =
      `<div class="wc-frame" data-frame="9" data-overlay="" style="--wc-ov-l: ${r.left}px; --wc-ov-t: ${r.top}px; --wc-ov-w: ${r.width}px; --wc-ov-h: ${r.height}px;">` +
      `<div class="wc-lk-veil"><div class="wc-lk-dslot"><section class="wc-lk-dialog" data-dlg="${o.dlg}" role="dialog" aria-modal="true" aria-label="${o.title}" style="width: min(${o.width}px, 100%);">${corners}` +
      `<div class="wc-lk-hood"><span class="wc-lk-hood-t">${o.title}</span></div><div class="wc-lk-dwin"><div class="wc-lk-dialog-b">${o.body}</div>` +
      `<div class="wc-lk-btns wc-lk-dialog-btns">${btns}</div></div></section></div></div></div>`;
    topFrame.insertAdjacentHTML('afterend', html);
  }

  // ------------------------------------------------------------ 1. does not fit
  if (st.fit === 'start' || st.fit === 'history') {
    const buttons = [{ id: 'DOWNLOAD', label: 'Download the run', letter: 'D' }];
    if (st.fit === 'start') buttons.push({ id: 'HISTORY', label: 'Open History', letter: 'H' });
    buttons.push({ id: 'KEEP', label: 'Keep on this device', letter: 'K', primary: true });
    dialog({
      dlg: 'run-full',
      title: 'Cloud storage full',
      width: 520,
      body:
        `<p class="wc-lk-q">${T.full}</p>` +
        `<p class="wc-lk-qn">${T.kept}</p>` +
        `<p class="mk-fit-run">${cloudOff()}<span><b>Gibur</b> · Saturday, 14 November · 4 h 4 min · 2.1 MB</span></p>`,
      buttons,
    });
  }

  // ------------------------------------------------------------ 2. History
  // The device's rows as captured; the demo's two expired September rows go
  // (the sweep at the next load would take them).
  const hist = (topFrame && topFrame.querySelector('.wc-hist')) || app.querySelector('.wc-hist');
  if (hist) {
    for (const tr of hist.querySelectorAll('.wc-lk-tr')) {
      const exp = tr.querySelector('.wc-hist-exp');
      if (exp && exp.textContent === '0 days') tr.remove();
    }
  }
  const SIZES = {
    'Gibur/2026-11-14': '2.1 MB',
    'Rasta/2026-11-12': '1.5 MB',
    'Gittan/2026-11-10': '0.7 MB',
    'Gibur/2026-11-09': '1.2 MB',
    'Aldereth/2026-11-07': '1.8 MB',
    'Rasta/2026-11-06': '0.6 MB',
    'Gibur/2026-11-05': '1.6 MB',
    'Aldereth/2026-11-04': '1.3 MB',
    'Gibur/2026-11-03': '1.9 MB',
    'Rasta/2026-09-26': '0.4 MB',
  };
  // Sessions saved on another device, only in the cloud (drawn).
  const CLOUD_ROWS = [
    { id: 'Gibur/2026-11-13', char: 'Gibur', date: '2026-11-13', time: '20:15', dur: '2h38m', stars: 4, size: '2.4 MB' },
    { id: 'Aldereth/2026-11-08', char: 'Aldereth', date: '2026-11-08', time: '21:02', dur: '1h51m', stars: 3, size: '1.6 MB' },
    { id: 'Rasta/2026-10-31', char: 'Rasta', date: '2026-10-31', time: '18:30', dur: '3h12m', stars: 5, size: '2.9 MB' },
  ];
  const DEVICE_ONLY = 'Gibur/2026-11-14';
  const stars = (n) => `<span class="wc-lk-stars" role="img" aria-label="${n} of 5"><span class="wc-lk-star-on">${'★'.repeat(n)}</span><span class="wc-lk-star-off">${'★'.repeat(5 - n)}</span></span>`;

  if (st.hist && hist) {
    const h = st.hist;
    const a = h.mode === 'a';
    const win = hist.querySelector('.wc-hist-win');
    const narrow = win && win.classList.contains('is-narrow');
    const tbody = hist.querySelector('.wc-lk-tbody');
    const wrap = hist.querySelector('.wc-hist-tablewrap');
    const card = hist.querySelector('.wc-hist-card');
    hist.classList.add('mk-hist-' + h.mode);
    if (h.offline) hist.classList.add('mk-offline');

    // The cloud-only rows, in date order.
    for (const c of CLOUD_ROWS) {
      const html =
        `<div class="wc-lk-tr mk-remote" role="row" data-id="${c.id}"><span class="wc-lk-td wc-hist-char">${c.char}</span><span class="wc-lk-td wc-hist-date">${c.date}</span>` +
        `<span class="wc-lk-td wc-hist-time">${c.time}</span><span class="wc-lk-td wc-hist-dur">${c.dur}</span><span class="wc-lk-td wc-hist-exp is-saved">Saved</span>` +
        `<span class="wc-lk-td wc-hist-rate">${stars(c.stars)}</span></div>`;
      const after = [...tbody.querySelectorAll('.wc-lk-tr')].find((tr) => (tr.querySelector('.wc-hist-date') || {}).textContent < c.date);
      if (after) after.insertAdjacentHTML('beforebegin', html);
      else tbody.insertAdjacentHTML('beforeend', html);
    }

    const sessionOf = (tr) => {
      const id = tr.dataset.id || '';
      return id.slice(0, id.indexOf('T') > 0 ? id.indexOf('T') : id.length);
    };
    const markTitle = {
      remote: (sz) => `In the cloud, not on this device · ${sz} · ${h.offline ? 'needs the network' : 'fetched when opened'}`,
      local: 'Saved on this device, not in the cloud: the cloud is full',
    };

    // Marks per row.
    if (a) {
      // Two new columns: the mark first, the size last.
      wrap.style.setProperty('--wc-hist-cols', narrow ? '' : '24px minmax(100px, 1fr) 106px 60px 70px 84px 92px 70px');
      const head = hist.querySelector('.wc-lk-throw');
      if (head) {
        head.insertAdjacentHTML('afterbegin', '<span class="wc-lk-th mk-th-mark" role="columnheader" title="Where the session is">' + cloud() + '</span>');
        head.insertAdjacentHTML('beforeend', '<span class="wc-lk-th is-sort mk-th-size" role="columnheader" data-key="size">Size</span>');
      }
    }
    for (const tr of tbody.querySelectorAll('.wc-lk-tr')) {
      const key = sessionOf(tr);
      const remote = tr.classList.contains('mk-remote');
      const local = key === DEVICE_ONLY;
      const saved = !!tr.querySelector('.wc-hist-exp.is-saved');
      const cr = CLOUD_ROWS.find((c) => c.id === key);
      const size = remote ? cr.size : SIZES[key] || '1.0 MB';
      if (a) {
        const mark = remote ? cloud(h.offline ? 'is-faint' : '') : local ? cloudOff() : '';
        const title = remote ? markTitle.remote(size) : local ? markTitle.local : saved ? 'In the cloud and on this device' : '';
        tr.insertAdjacentHTML('afterbegin', `<span class="wc-lk-td mk-td-mark" title="${title}">${mark}</span>`);
        tr.insertAdjacentHTML('beforeend', `<span class="wc-lk-td mk-td-size${remote ? ' is-remote' : ''}">${size}</span>`);
      } else {
        let tag = '';
        if (remote) tag = h.offline ? (narrow ? 'in the cloud · offline' : 'in the cloud · needs the network') : `in the cloud · ${size}`;
        else if (local) tag = 'not in the cloud';
        if (tag) {
          const cls = remote ? 'is-remote' : 'is-local';
          if (narrow) tr.insertAdjacentHTML('beforeend', `<span class="wc-lk-td mk-tag ${cls}">${tag}</span>`);
          else tr.querySelector('.wc-hist-char').insertAdjacentHTML('beforeend', `<span class="mk-tag ${cls}">${tag}</span>`);
        }
      }
    }

    // The chosen row and its card.
    const chosenKey = h.chosen === 'cloud' ? CLOUD_ROWS[0].id : DEVICE_ONLY;
    for (const tr of tbody.querySelectorAll('.wc-lk-tr')) tr.classList.remove('is-on', 'is-cur');
    const chosen = [...tbody.querySelectorAll('.wc-lk-tr')].find((tr) => sessionOf(tr) === chosenKey);
    chosen.classList.add('is-on', 'is-cur');
    if (narrow && card) chosen.after(card);
    if (a && !narrow && !touch) {
      const m = chosen.querySelector('.mk-td-mark');
      const title = m.getAttribute('title');
      // Rows paint in their own box (content-visibility), so the tip is laid over the table instead.
      const host = hist.querySelector('.wc-hist-main');
      host.style.position = 'relative';
      const mr = m.getBoundingClientRect();
      const hr = host.getBoundingClientRect();
      host.insertAdjacentHTML('beforeend', `<span class="mk-tip" role="tooltip" style="left:${mr.right - hr.left + 4}px;top:${mr.top - hr.top + mr.height / 2}px">${title}</span>`);
    }

    const kv = card.querySelector('.wc-hist-kv');
    const ddOf = (label) => {
      const dt = [...kv.querySelectorAll('dt')].find((x) => x.textContent === label);
      return dt && dt.nextElementSibling;
    };
    if (h.chosen === 'device') {
      // The device-only run: Kept says where it is.
      const kept = ddOf('Kept');
      kept.insertAdjacentHTML('beforeend', `<span class="mk-kept-note">${cloudOff()}not in the cloud: the cloud is full</span>`);
    } else {
      const c = CLOUD_ROWS[0];
      card.querySelector('.wc-hist-name').innerHTML = `${c.char}<small>Level 41</small>`;
      card.querySelector('.wc-hist-when').textContent = 'Friday, 13 November 2026 · 20:15';
      ddOf('Duration').innerHTML = '2 h 38 min <span class="wc-lk-dim">· 2 runs</span>';
      ddOf('Deeds').innerHTML = '14 kills · <span class="wc-hist-pk">1 pk</span>';
      ddOf('Kept').innerHTML = `<span class="wc-lk-gold">Saved</span> ${stars(c.stars)}`;
      const log = ddOf('Log');
      log.innerHTML = h.offline
        ? `<span class="mk-log-cloud">${cloud('is-faint')}In the cloud · ${c.size}</span><span class="mk-log-sub is-off">Needs the network to open</span>`
        : `<span class="mk-log-cloud">${cloud()}In the cloud · ${c.size}</span><span class="mk-log-sub">Fetched when opened</span>`;
      const acts = card.querySelector('.wc-hist-acts');
      const sav = acts.querySelector('[data-btn="SAVE"]');
      if (sav) sav.classList.add('is-disabled');
      if (h.fetch || h.offline) {
        for (const id of ['RUN LOG', 'STATS', 'EXPORT']) {
          const btn = acts.querySelector(`[data-btn="${id}"]`);
          if (btn) btn.classList.add('is-disabled');
        }
      }
      if (h.fetch) {
        for (const btn of acts.querySelectorAll('.wc-lk-btn')) btn.classList.add('is-disabled');
        acts.insertAdjacentHTML('beforebegin', `<div class="mk-load"><div class="mk-load-bar"><i style="transform: scaleX(0.56)"></i></div><div class="mk-load-l">Fetching from the cloud… 1.3 of 2.4 MB</div></div>`);
      }
    }

    // The storage line.
    const sto = hist.querySelector('.wc-hist-storage');
    if (sto) sto.textContent = T.storage;
    if (h.offline) {
      const fl = hist.querySelector('.wc-hist-flash');
      if (fl) fl.innerHTML = '<span class="is-fail">Offline: sessions in the cloud cannot be opened.</span>';
    }
  }

  if (st.fit === 'history' && hist) {
    const sto = hist.querySelector('.wc-hist-storage');
    if (sto) sto.textContent = 'This device 6.1 MB · Cloud 49 of 50 MB';
  }

  // ------------------------------------------------------------ 3. Log out
  if (st.logout) {
    const list = app.querySelector('[data-logout="some"] .wc-ac-dlist');
    const saved = list.querySelector('[data-row="saved"]');
    const save = ic('save');
    if (st.logout === 'a') {
      saved.outerHTML =
        `<li data-row="saved" class="is-two">${save}<span><span><b>3 saved runs</b> not in the cloud</span>` +
        `<span class="wc-ac-dkinds">2 cloud full · 1 too large for the cloud</span></span></li>`;
    } else {
      saved.outerHTML =
        `<li data-row="saved">${save}<span><b>2 saved runs</b> not in the cloud — cloud full</span></li>` +
        `<li data-row="toolarge">${save}<span><b>1 saved run</b> too large for the cloud</span></li>`;
    }
  }

  // ------------------------------------------------------------ 4. Delete
  if (st.page === 'delete') {
    const w = app.querySelector('[data-dlg="delete"] .wc-hd-warn');
    if (w) w.textContent = T.del;
  }

  // ------------------------------------------------------------ 5. The counts
  if (st.count) {
    const fetchBtn = touch ? '' : '<button type="button" class="wc-lk-btn is-small" data-btn="FETCHALL" tabindex="-1"><span><u class="wc-sk">F</u>etch all</span></button>';
    const line = st.fetchAll
      ? `<span class="mk-count is-busy"><span class="mk-load is-inline"><span class="mk-load-bar"><i style="transform: scaleX(0.38)"></i></span><span class="mk-load-l">Fetching 3 sessions… 2.6 of 6.9 MB</span></span></span>`
      : `<span class="mk-count">${cloud()}<span class="mk-count-t">${T.notCounted}</span>${fetchBtn}</span>`;
    if (st.count === 'spot') {
      const sum = topFrame.querySelector('.wc-spw-sum');
      sum.insertAdjacentHTML('afterend', line);
    } else if (st.count === 'diary') {
      const next = topFrame.querySelector('.wc-cred-foot [data-btn="next"]');
      next.insertAdjacentHTML('beforebegin', line);
    } else if (st.count === 'stats') {
      const head = topFrame.querySelector('.wc-hs-head');
      head.insertAdjacentHTML('beforeend', line);
    }
  }

  // The wordmark's height, for the pages' layout (the app measures it the same way).
  const brand = start.querySelector('.wc-start-brand');
  const putBrand = () => {
    if (brand) start.style.setProperty('--wc-brand-h', brand.offsetHeight + 'px');
  };
  putBrand();
  window.addEventListener('resize', putBrand);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(putBrand);
})();
