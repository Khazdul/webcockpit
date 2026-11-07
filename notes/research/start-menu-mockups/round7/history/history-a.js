/* Round 7 · History · A "Tabell och kort" — the layout study's History (layout/history.js), refined:
   the real Stats, Rate and Delete sub-pages (hpages.js), the run summary and the expiry in the card, the
   real flash texts, an error state (?error), Restore, Run log → player-a.html, Export → the Export editor.
   Keys: ←/→ the character filter, ↑↓ PgUp PgDn Home End the rows, Enter / double-click the run log,
   letters R T A S X D B O for the actions, Esc back. */
(() => {
'use strict';
const H = window.HD;
const COLS = [
  { key: 'char', title: 'Char' }, { key: 'date', title: 'Date' }, { key: 'time', title: 'Time' },
  { key: 'dur', title: 'Dur.' }, { key: 'expires', title: 'Expires' }, { key: 'rating', title: 'Rating' },
];
function mount(page, opts = {}) {
  const win = page.querySelector('.win');
  const phoneQ = matchMedia('(max-width: 760px)');
  const st = { pill: 0, sort: { key: 'date', dir: -1 }, list: [], cur: null };
  const ERR = WC.qs.has('error');
  const ALL = ERR ? [] : H.SESSIONS;
  win.classList.add('hist');
  win.insertAdjacentHTML('beforeend', `
    <div class="h-view" data-v="list">
      <div class="box-head hist-head">
        <div class="seg hist-pills" role="tablist" aria-label="Character"></div>
        <select class="select hist-sort" aria-label="Sort by">
          <option value="date:-1">Newest first</option><option value="date:1">Oldest first</option><option value="char:1">Character</option>
          <option value="dur:-1">Longest</option><option value="rating:-1">Rating</option><option value="expires:1">Expires soonest</option>
        </select>
      </div>
      <div class="hist-main">
        <div class="hist-tablewrap">
          <div class="tbl hist-tbl"><div class="th-row">${COLS.map((c) => `<span class="th sort" data-k="${c.key}">${c.title}</span>`).join('')}</div></div>
          <div class="box-body hist-body"><div class="tbl hist-tbl"><div class="rows flat hist-rows" role="listbox" aria-label="Sessions"></div></div></div>
        </div>
        <aside class="hist-card" aria-live="polite"></aside>
      </div>
      <div class="box-foot h-foot">
        <div class="btnrow">${H.FOOT_ACTIONS.map((a) => `<button class="ibtn small" data-a="${a.id}">${a.icon}<span>${a.label}</span></button>`).join('')}</div>
        <span class="flash static h-flash"></span>
        <span class="h-storage">${ERR ? '' : H.storageText()}</span>
      </div>
    </div>
    <div class="h-view" data-v="stats" hidden></div>`);
  const $ = (s) => win.querySelector(s);
  const listView = $('[data-v="list"]'), statsView = $('[data-v="stats"]');
  const pillsEl = $('.hist-pills'), rowsEl = $('.hist-rows'), card = $('.hist-card'), flashEl = $('.h-flash');
  const hoodT = page.querySelector('.hood .t');
  const flash = (m, kind) => WC.flash(flashEl, m, { kind, ms: kind === 'fail' ? 6000 : 3200 });
  const names = () => [...new Set(ALL.map((s) => s.character))].sort((a, b) => a.localeCompare(b));
  function renderPills() {
    const pills = ['All', ...names()];
    st.pill = Math.min(st.pill, pills.length - 1);
    pillsEl.innerHTML = pills.map((n, i) => `<button role="tab" aria-selected="${i === st.pill}" data-i="${i}">${n}</button>`).join('');
  }
  pillsEl.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) choosePill(+b.dataset.i); });
  function choosePill(i) { const n = names().length + 1; st.pill = Math.max(0, Math.min(n - 1, i)); renderPills(); render(true); }
  win.querySelectorAll('.th').forEach((th) => th.addEventListener('click', () => { st.sort = H.nextSort(st.sort, th.dataset.k); render(); }));
  $('.hist-sort').addEventListener('change', (e) => { const [k, d] = e.target.value.split(':'); st.sort = { key: k, dir: +d }; render(); });
  const list = WC.list(rowsEl, { item: '.row', onChange: (i) => { st.cur = st.list[i] || null; renderCard(); }, onActivate: () => act('log') });
  function render(resetCursor = false) {
    const filter = st.pill === 0 ? null : names()[st.pill - 1];
    st.list = H.sortSessions(ALL.filter((s) => !filter || s.character === filter), st.sort);
    win.querySelectorAll('.th').forEach((th) => { if (th.dataset.k === st.sort.key) th.dataset.dir = st.sort.dir; else delete th.dataset.dir; });
    rowsEl.innerHTML = st.list.length ? st.list.map((s) => `
      <div class="row" role="option" data-id="${s.id}">
        <span class="td h-char">${s.character}</span>
        <span class="td h-date">${H.fmtDate(s.start)}</span>
        <span class="td h-time">${H.fmtTime(s.start)}</span>
        <span class="td h-dur">${H.fmtDur(s.end - s.start)}</span>
        <span class="td h-exp ${s.saved ? 'gold' : s.expiresDays <= 2 ? 'soon' : 'dim'}">${s.saved ? 'Saved' : s.expiresDays + ' days'}</span>
        <span class="td h-rate stars">${s.saved && s.rating ? H.stars(s.rating) : ''}</span>
      </div>`).join('') : `<div class="empty">${ERR ? 'The runs could not be read.' : 'No runs recorded yet.'}</div>`;
    const id = st.cur && st.cur.id;
    list.refresh();
    const k = resetCursor ? 0 : Math.max(0, st.list.findIndex((s) => s.id === id));
    list.set(k, true);
    if (!st.list.length) { st.cur = null; renderCard(); }
  }
  const dis = (a) => (a === 'backup' ? ALL.length === 0 : H.disabled(a, st.cur));
  function renderCard() {
    const s = st.cur;
    card.innerHTML = s ? `
      <div class="hc-name">${s.character}<small>Level ${s.level}</small></div>
      <div class="hc-when">${H.LONG(s.start)} · ${H.fmtTime(s.start)}</div>
      <dl class="kv hc-kv">
        <dt>Duration</dt><dd>${H.fmtDurLong(s.end - s.start)} <span class="muted">· ${s.runs} run${s.runs > 1 ? 's' : ''}</span></dd>
        <dt>Deeds</dt><dd>${s.kills} kill${s.kills === 1 ? '' : 's'}${s.pkills ? ` · <span class="hc-pk">${s.pkills} PvP</span>` : ''}${s.deaths ? ` · <span class="hc-dead">${s.deaths} death${s.deaths > 1 ? 's' : ''}</span>` : ''}</dd>
        <dt>Kept</dt><dd>${s.saved ? `<span class="gold">Saved</span>${s.rating ? ` <span class="stars">${H.stars(s.rating)}</span>` : ''}` : `Expires in ${s.expiresDays} day${s.expiresDays === 1 ? '' : 's'}<i class="hc-gauge"><b style="width:${(s.expiresDays / 14) * 100}%"></b></i>`}</dd>
        <dt>Log</dt><dd>${s.hasLog ? 'Captured text' : '<span class="faint">No text captured</span>'}</dd>
      </dl>
      <div class="btncol hc-acts">${H.ACTIONS.map((a) => `<button class="ibtn ${a.cls || ''}" data-a="${a.id}" ${dis(a.id) ? 'disabled' : ''}>${a.icon}<span>${a.label}</span></button>`).join('')}</div>`
      : `<p class="empty hc-empty">${ALL.length ? 'No session chosen.' : 'Recorded sessions show here. Restore brings back a backup from another browser.'}</p>`;
    win.querySelector('[data-a="backup"]').disabled = dis('backup');
    if (phoneQ.matches) { const row = rowsEl.querySelector('.row.on'); if (row) row.after(card); else rowsEl.after(card); }
    else if (card.parentElement !== $('.hist-main')) $('.hist-main').append(card);
  }
  card.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b && !b.disabled) act(b.dataset.a); });
  win.querySelector('.h-foot').addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b && !b.disabled) act(b.dataset.a); });
  phoneQ.addEventListener('change', renderCard);
  let statsOpen = null;
  function openStats(s) {
    listView.hidden = true; statsView.hidden = false; hoodT.textContent = 'Statistics';
    statsOpen = HP.stats(statsView, s, { onBack() { statsView.hidden = true; listView.hidden = false; hoodT.textContent = 'History'; statsOpen = null; list.set(list.i); } });
  }
  function act(a) {
    if (dis(a)) return;
    const s = st.cur;
    switch (a) {
      case 'log': return opts.onRunLog ? opts.onRunLog(s) : flash('The run log opens');
      case 'stats': return openStats(s);
      case 'rate': return HP.rate(page, s, (m) => { render(); flash(m); });
      case 'save': s.saved = true; s.expiresDays = null; render(); return flash('Saved.');
      case 'export': return phoneQ.matches ? flash('Export: desktop only.', 'fail') : flash('The Export editor opens here (its own mockup, Profiles group).');
      case 'delete': return HP.del(page, s, (m) => { render(); renderPills(); flash(m); });
      case 'backup': return flash('Saved webcockpit-runs-2026-11-07.jsonl.gz.');
      case 'restore': return WC.qs.has('restorefail') ? flash('Restore failed: this is not a WebCockpit runs backup.', 'fail') : flash('Restored 4 runs (2 already present).');
    }
  }
  const layer = {
    key(e) {
      if (e.key === 'ArrowLeft') { choosePill(st.pill - 1); return true; }
      if (e.key === 'ArrowRight') { choosePill(st.pill + 1); return true; }
      if (list.key(e)) return true;
      return WC.shortcut(e, Object.fromEntries(Object.entries(H.KEYMAP).map(([k, a]) => [k, () => act(a)])));
    },
  };
  renderPills(); render(true);
  if (ERR) setTimeout(() => flash('Could not read the runs: the database is blocked by another tab.', 'fail'), 600);
  const pick = WC.qs.get('pick'); if (pick) { const i = st.list.findIndex((s) => s.id === pick); if (i >= 0) list.set(i); }
  return { layer, act, list, onShow() {}, get statsOpen() { return statsOpen; } };
}
window.HISTA = { mount };
})();
