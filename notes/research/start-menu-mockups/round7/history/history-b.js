/* Round 7 · History · B "Krönikan" (the chronicle). Sessions under day headings, newest first, each a row
   with its time, character, a day band (where in the 24 hours it was played), duration, kept/expiry and
   rating. The chosen row opens in place: its summary and the six actions as a row of glass buttons. The
   character filter is a row of tabs; the order is a small segmented control (Newest · Oldest · Longest ·
   Rating · Expiring · A–Z); any order but Newest/Oldest drops the day headings. Stats replaces the
   chronicle inside the box; Rate and Delete are small boxes over it. Keys: ←/→ tabs, ↑↓ PgUp PgDn Home End
   rows, Enter the run log, letters R T A S X D B O, Esc back. */
(() => {
'use strict';
const H = window.HD;
const ORDERS = [
  { id: 'new', label: 'Newest', sort: { key: 'date', dir: -1 } }, { id: 'old', label: 'Oldest', sort: { key: 'date', dir: 1 } },
  { id: 'long', label: 'Longest', sort: { key: 'dur', dir: -1 } }, { id: 'rate', label: 'Rating', sort: { key: 'rating', dir: -1 } },
  { id: 'exp', label: 'Expiring', sort: { key: 'expires', dir: 1 } }, { id: 'az', label: 'A–Z', sort: { key: 'char', dir: 1 } },
];
function mount(page, opts = {}) {
  const win = page.querySelector('.win');
  const ERR = WC.qs.has('error');
  const ALL = ERR ? [] : H.SESSIONS;
  const st = { tab: 0, order: 0, list: [], cur: null };
  win.classList.add('chron');
  win.insertAdjacentHTML('beforeend', `
    <div class="h-view" data-v="list">
      <div class="box-head ch-head">
        <div class="tabs ch-tabs" role="tablist" aria-label="Character"></div>
        <div class="seg ch-order" role="tablist" aria-label="Order">${ORDERS.map((o, i) => `<button role="tab" data-i="${i}" aria-selected="${i === 0}">${o.label}</button>`).join('')}</div>
        <select class="select ch-order-sel" aria-label="Order">${ORDERS.map((o, i) => `<option value="${i}">${o.label}</option>`).join('')}</select>
      </div>
      <div class="ch-axis" aria-hidden="true"><span></span><span class="ch-axl">Time · character</span><span class="ch-ticks"><b>00</b><b>06</b><b>12</b><b>18</b><b>24</b></span><span class="ch-axl r">Length</span><span class="ch-axl">Kept</span><span class="ch-axl">Rating</span></div>
      <div class="box-body ch-body"><div class="ch-list" role="listbox" aria-label="Sessions"></div></div>
      <div class="box-foot h-foot">
        <div class="btnrow">${H.FOOT_ACTIONS.map((a) => `<button class="ibtn small" data-a="${a.id}">${a.icon}<span>${a.label}</span></button>`).join('')}</div>
        <span class="flash static h-flash"></span>
        <span class="h-storage">${ERR ? '' : H.storageText()}</span>
      </div>
    </div>
    <div class="h-view" data-v="stats" hidden></div>`);
  const $ = (s) => win.querySelector(s);
  const listView = $('[data-v="list"]'), statsView = $('[data-v="stats"]'), hoodT = page.querySelector('.hood .t');
  const tabsEl = $('.ch-tabs'), listEl = $('.ch-list'), flashEl = $('.h-flash'), orderEl = $('.ch-order'), orderSel = $('.ch-order-sel');
  const flash = (m, kind) => WC.flash(flashEl, m, { kind, ms: kind === 'fail' ? 6000 : 3200 });
  const names = () => [...new Set(ALL.map((s) => s.character))].sort((a, b) => a.localeCompare(b));
  const dis = (a) => (a === 'backup' ? ALL.length === 0 : H.disabled(a, st.cur));
  function renderTabs() {
    const tabs = ['All', ...names()];
    st.tab = Math.min(st.tab, tabs.length - 1);
    tabsEl.innerHTML = tabs.map((n, i) => `<button role="tab" aria-selected="${i === st.tab}" data-i="${i}">${n}</button>`).join('');
  }
  tabsEl.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) chooseTab(+b.dataset.i); });
  function chooseTab(i) { st.tab = Math.max(0, Math.min(names().length, i)); renderTabs(); render(true); tabsEl.querySelector('[aria-selected="true"]').scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  orderEl.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) chooseOrder(+b.dataset.i); });
  orderSel.addEventListener('change', () => chooseOrder(+orderSel.value));
  function chooseOrder(i) { st.order = i; orderEl.querySelectorAll('button').forEach((b, k) => b.setAttribute('aria-selected', String(k === i))); orderSel.value = i; render(); }
  const band = (s) => {
    const a = H.minutesOfDay(s.start) / 1440, w = (s.end - s.start) / 864e5;
    const seg = (x, ww) => `<i style="left:${(x * 100).toFixed(2)}%;width:${Math.max(.6, ww * 100).toFixed(2)}%"></i>`;
    return a + w <= 1 ? seg(a, w) : seg(a, 1 - a) + seg(0, a + w - 1);
  };
  const kept = (s) => s.saved ? `<span class="ch-saved">Saved</span>` : `<span class="ch-exp ${s.expiresDays <= 2 ? 'soon' : ''}">${H.ICON.hourglass}${s.expiresDays} day${s.expiresDays === 1 ? '' : 's'}</span>`;
  function rowHtml(s, showDate) {
    return `<div class="row ch-row" role="option" data-id="${s.id}">
      <div class="ch-line">
        <span class="ch-time">${showDate ? `<small>${H.SHORT(s.start)}</small>` : ''}${H.fmtTime(s.start)}</span>
        <span class="ch-char">${s.character}</span>
        <span class="ch-band">${band(s)}</span>
        <span class="ch-dur">${H.fmtDur(s.end - s.start)}</span>
        <span class="ch-kept">${kept(s)}</span>
        <span class="ch-rate stars">${s.saved && s.rating ? H.stars(s.rating) : ''}</span>
      </div>
      <div class="ch-open" aria-hidden="true"></div>
    </div>`;
  }
  function render(reset = false) {
    const filter = st.tab === 0 ? null : names()[st.tab - 1];
    const ord = ORDERS[st.order];
    st.list = H.sortSessions(ALL.filter((s) => !filter || s.character === filter), ord.sort);
    const byDay = ord.sort.key === 'date';
    let html = '', day = '';
    for (const s of st.list) {
      const d = H.DAYHEAD(s.start);
      if (byDay && d !== day) { day = d; html += `<div class="ch-day"><span>${d}</span></div>`; }
      html += rowHtml(s, !byDay);
    }
    listEl.innerHTML = st.list.length ? html : `<div class="empty">${ERR ? 'The runs could not be read.' : 'No runs recorded yet.'}<small>${ERR ? '' : 'Sessions are recorded as you play. Restore brings back a backup.'}</small></div>`;
    listEl.classList.toggle('flat', !byDay);
    const id = st.cur && st.cur.id;
    list.refresh();
    const k = reset ? 0 : Math.max(0, st.list.findIndex((s) => s.id === id));
    list.set(k, true);
    if (!st.list.length) { st.cur = null; }
    win.querySelector('[data-a="backup"]').disabled = dis('backup');
  }
  function fillOpen(row, s) {
    listEl.querySelectorAll('.ch-open').forEach((o) => { o.innerHTML = ''; o.setAttribute('aria-hidden', 'true'); });
    if (!row || !s) return;
    const o = row.querySelector('.ch-open');
    o.removeAttribute('aria-hidden');
    o.innerHTML = `<p class="ch-sum">Level ${s.level} · ${s.runs} run${s.runs > 1 ? 's' : ''} · ${H.fmtDurLong(s.end - s.start)} · ${s.kills} kills${s.pkills ? ` · <span class="hc-pk">${s.pkills} PvP</span>` : ''}${s.deaths ? ` · <span class="hc-dead">${s.deaths} death${s.deaths > 1 ? 's' : ''}</span>` : ''}${s.hasLog ? '' : ' · <span class="faint">no text captured</span>'}</p>
      <div class="btnrow ch-acts">${H.ACTIONS.map((a) => `<button class="ibtn small ${a.cls || ''}" data-a="${a.id}" ${dis(a.id) ? 'disabled' : ''}>${a.icon}<span>${a.label}</span></button>`).join('')}</div>`;
  }
  const list = WC.list(listEl, { item: '.row', onChange: (i, el) => { st.cur = st.list[i] || null; fillOpen(el, st.cur); }, onActivate: () => act('log') });
  listEl.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b && !b.disabled) { e.stopPropagation(); act(b.dataset.a); } });
  win.querySelector('.h-foot').addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b && !b.disabled) act(b.dataset.a); });
  function openStats(s) {
    listView.hidden = true; statsView.hidden = false; hoodT.textContent = 'Statistics';
    HP.stats(statsView, s, { onBack() { statsView.hidden = true; listView.hidden = false; hoodT.textContent = 'History'; list.set(list.i); } });
  }
  function act(a) {
    if (dis(a)) return;
    const s = st.cur;
    switch (a) {
      case 'log': return opts.onRunLog ? opts.onRunLog(s) : flash('The run log opens');
      case 'stats': return openStats(s);
      case 'rate': return HP.rate(page, s, (m) => { render(); flash(m); });
      case 'save': s.saved = true; s.expiresDays = null; render(); return flash('Saved.');
      case 'export': return matchMedia('(max-width: 760px)').matches ? flash('Export: desktop only.', 'fail') : flash('The Export editor opens here (its own mockup, Profiles group).');
      case 'delete': return HP.del(page, s, (m) => { render(); renderTabs(); flash(m); });
      case 'backup': return flash('Saved webcockpit-runs-2026-11-07.jsonl.gz.');
      case 'restore': return WC.qs.has('restorefail') ? flash('Restore failed: this is not a WebCockpit runs backup.', 'fail') : flash('Restored 4 runs (2 already present).');
    }
  }
  const layer = {
    key(e) {
      if (e.key === 'ArrowLeft') { chooseTab(st.tab - 1); return true; }
      if (e.key === 'ArrowRight') { chooseTab(st.tab + 1); return true; }
      if (list.key(e)) return true;
      return WC.shortcut(e, Object.fromEntries(Object.entries(H.KEYMAP).map(([k, a]) => [k, () => act(a)])));
    },
  };
  renderTabs(); render(true);
  if (ERR) setTimeout(() => flash('Could not read the runs: the database is blocked by another tab.', 'fail'), 600);
  const pick = WC.qs.get('pick'); if (pick) { const i = st.list.findIndex((s) => s.id === pick); if (i >= 0) list.set(i); }
  return { layer, act, list };
}
window.HISTB = { mount };
})();
