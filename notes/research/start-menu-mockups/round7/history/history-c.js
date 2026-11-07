/* Round 7 · History · C "Liggaren" (the ledger by character). Left: the characters as a list (All first),
   each with level, sessions, hours and saved count — choosing one is the filter. Right: that character's
   sessions as cards in a grid (date, weekday and time, length, deeds, kept/expiry as a draining line,
   rating). The box foot is one action bar for the chosen card (Run log · Stats · Rate · Save · Export ·
   Delete) with Backup / Restore at its end. Stats replaces the cards (the character list stays).
   Keys: Tab / Shift+Tab switch between the characters and the cards; in the characters ↑↓ (or ←→);
   in the cards ←→↑↓ move in the grid, PgUp/PgDn/Home/End; Enter the run log; letters R T A S X D B O; Esc back. */
(() => {
'use strict';
const H = window.HD;
const KIND = () => window.HP.KIND_SVG;
function mount(page, opts = {}) {
  const win = page.querySelector('.win');
  const ERR = WC.qs.has('error');
  const ALL = ERR ? [] : H.SESSIONS;
  const phoneQ = matchMedia('(max-width: 760px)');
  const st = { ch: 0, zone: 'cards', sort: { key: 'date', dir: -1 }, list: [], cur: null };
  win.classList.add('ledg');
  win.insertAdjacentHTML('beforeend', `
    <div class="lg-main">
      <aside class="lg-chars"><h3 class="h-sec">Characters</h3><div class="rows flat lg-clist" role="listbox" aria-label="Characters"></div>
        <p class="h-storage lg-storage">${ERR ? '' : H.storageText()}</p></aside>
      <section class="lg-right">
        <div class="h-view" data-v="list">
          <div class="lg-top"><div class="lg-title"></div>
            <select class="select lg-sort" aria-label="Order">
              <option value="date:-1">Newest first</option><option value="date:1">Oldest first</option><option value="dur:-1">Longest</option>
              <option value="rating:-1">Best rated</option><option value="expires:1">Expires soonest</option><option value="time:1">Time of day</option></select></div>
          <div class="box-body lg-body"><div class="lg-grid" role="listbox" aria-label="Sessions"></div></div>
        </div>
        <div class="h-view" data-v="stats" hidden></div>
      </section>
    </div>
    <div class="box-foot lg-bar">
      <div class="btnrow lg-acts">${H.ACTIONS.map((a) => `<button class="ibtn ${a.cls || ''}" data-a="${a.id}">${a.icon}<span>${a.label}</span></button>`).join('')}</div>
      <span class="flash static h-flash"></span>
      <div class="btnrow lg-file">${H.FOOT_ACTIONS.map((a) => `<button class="ibtn small" data-a="${a.id}">${a.icon}<span>${a.label}</span></button>`).join('')}</div>
    </div>`);
  const $ = (s) => win.querySelector(s);
  const clist = $('.lg-clist'), grid = $('.lg-grid'), titleEl = $('.lg-title'), flashEl = $('.h-flash');
  const listView = $('[data-v="list"]'), statsView = $('[data-v="stats"]'), hoodT = page.querySelector('.hood .t');
  const flash = (m, kind) => WC.flash(flashEl, m, { kind, ms: kind === 'fail' ? 6000 : 3200 });
  const names = () => [...new Set(ALL.map((s) => s.character))].sort((a, b) => a.localeCompare(b));
  const dis = (a) => (a === 'backup' ? ALL.length === 0 : H.disabled(a, st.cur));
  const hours = (l) => Math.round(l.reduce((n, s) => n + (s.end - s.start), 0) / 3.6e6);
  function renderChars() {
    const ns = names();
    st.ch = Math.min(st.ch, ns.length);
    const rowOf = (name, l, i) => `<div class="row lg-crow ${i === st.ch ? 'on' : ''}" role="option" data-i="${i}">
        <span class="lg-cname">${name}</span>
        <span class="lg-cmeta dim">${name === 'All characters' ? `${l.length} sessions · ${hours(l)} h` : `Level ${Math.max(...l.map((s) => s.level))} · ${l.length} session${l.length > 1 ? 's' : ''} · ${hours(l)} h`}</span>
        ${l.some((s) => s.saved) ? `<span class="lg-csaved">${l.filter((s) => s.saved).length} saved</span>` : ''}
      </div>`;
    clist.innerHTML = ALL.length ? rowOf('All characters', ALL, 0) + ns.map((n, i) => rowOf(n, ALL.filter((s) => s.character === n), i + 1)).join('') : '<p class="lg-noch faint">No characters yet.</p>';
    clist.classList.toggle('zone', st.zone === 'chars');
  }
  clist.addEventListener('click', (e) => { const r = e.target.closest('.lg-crow'); if (r) { st.zone = 'chars'; chooseChar(+r.dataset.i); } });
  function chooseChar(i) { st.ch = Math.max(0, Math.min(names().length, i)); renderChars(); render(true); const on = clist.querySelector('.on'); on && on.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  $('.lg-sort').addEventListener('change', (e) => { const [k, d] = e.target.value.split(':'); st.sort = { key: k, dir: +d }; render(); });
  const deeds = (s) => {
    const k = KIND();
    return `<span class="lg-deed" title="Kills">${s.kills}<small>kills</small></span>${s.pkills ? `<span class="lg-deed pk" title="PvP kills"><i>${k.pkill}</i>${s.pkills}</span>` : ''}${s.deaths ? `<span class="lg-deed dead" title="Deaths"><i>${k.death}</i>${s.deaths}</span>` : ''}`;
  };
  function render(reset = false) {
    const filter = st.ch === 0 ? null : names()[st.ch - 1];
    st.list = H.sortSessions(ALL.filter((s) => !filter || s.character === filter), st.sort);
    const l = st.list;
    titleEl.innerHTML = ALL.length ? `<h2 class="lg-h">${filter || 'All characters'}</h2><p class="lg-sub">${l.length} session${l.length === 1 ? '' : 's'} · ${hours(l)} hours played · ${l.filter((s) => s.saved).length} saved</p>` : '<h2 class="lg-h">History</h2>';
    grid.innerHTML = l.length ? l.map((s) => `
      <div class="row lg-card ${s.saved ? 'saved' : ''} ${s.hasLog ? '' : 'nolog'}" role="option" data-id="${s.id}">
        <div class="lg-date"><b>${new Date(s.start).getDate()}</b><span>${new Date(s.start).toLocaleDateString('en-GB', { month: 'short' })}</span></div>
        <div class="lg-info">
          <div class="lg-l1">${new Date(s.start).toLocaleDateString('en-GB', { weekday: 'long' })} · ${H.fmtTime(s.start)}</div>
          <div class="lg-l2">${filter ? '' : `<span class="lg-who">${s.character}</span>`}<span class="lg-len">${H.fmtDur(s.end - s.start)}</span>${s.runs > 1 ? `<span class="dim">${s.runs} runs</span>` : ''}${s.hasLog ? '' : '<span class="faint">no log</span>'}</div>
          <div class="lg-deeds">${deeds(s)}</div>
        </div>
        <div class="lg-kept">${s.saved ? `<span class="gold">Saved</span>${s.rating ? `<span class="stars">${H.stars(s.rating)}</span>` : ''}` : `<span class="${s.expiresDays <= 2 ? 'soon' : 'dim'}">${s.expiresDays} day${s.expiresDays === 1 ? '' : 's'}</span>`}</div>
        ${s.saved ? '' : `<i class="lg-drain" style="--f:${s.expiresDays / 14}"></i>`}
      </div>`).join('') : `<div class="empty lg-empty">${ERR ? 'The runs could not be read.' : 'No runs recorded yet.'}<small>${ERR ? '' : 'Every session you play is kept here for 14 days; Save keeps it for good. Restore brings back a backup.'}</small></div>`;
    const id = st.cur && st.cur.id;
    list.refresh();
    const k = reset ? 0 : Math.max(0, l.findIndex((s) => s.id === id));
    list.set(k, true);
    if (!l.length) { st.cur = null; renderBar(); }
    grid.classList.toggle('zone', st.zone === 'cards');
  }
  function renderBar() { win.querySelectorAll('.lg-bar [data-a]').forEach((b) => { b.disabled = dis(b.dataset.a); }); }
  const cols = () => { const c = grid.querySelectorAll('.lg-card'); if (c.length < 2) return 1; const y = c[0].offsetTop; let n = 0; for (const x of c) { if (x.offsetTop !== y) break; n++; } return Math.max(1, n); };
  const list = WC.list(grid, { item: '.lg-card', onChange: (i) => { st.cur = st.list[i] || null; renderBar(); }, onActivate: () => act('log') });
  grid.addEventListener('pointerdown', () => { st.zone = 'cards'; clist.classList.remove('zone'); grid.classList.add('zone'); });
  win.querySelector('.lg-bar').addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b && !b.disabled) act(b.dataset.a); });
  function openStats(s) {
    listView.hidden = true; statsView.hidden = false; hoodT.textContent = 'Statistics';
    win.classList.add('in-stats');
    HP.stats(statsView, s, { onBack() { statsView.hidden = true; listView.hidden = false; hoodT.textContent = 'History'; win.classList.remove('in-stats'); list.set(list.i); } });
  }
  function act(a) {
    if (dis(a)) return;
    const s = st.cur;
    switch (a) {
      case 'log': return opts.onRunLog ? opts.onRunLog(s) : flash('The run log opens');
      case 'stats': return openStats(s);
      case 'rate': return HP.rate(page, s, (m) => { render(); renderChars(); flash(m); });
      case 'save': s.saved = true; s.expiresDays = null; render(); renderChars(); return flash('Saved.');
      case 'export': return phoneQ.matches ? flash('Export: desktop only.', 'fail') : flash('The Export editor opens here (its own mockup, Profiles group).');
      case 'delete': return HP.del(page, s, (m) => { renderChars(); render(); flash(m); });
      case 'backup': return flash('Saved webcockpit-runs-2026-11-07.jsonl.gz.');
      case 'restore': return WC.qs.has('restorefail') ? flash('Restore failed: this is not a WebCockpit runs backup.', 'fail') : flash('Restored 4 runs (2 already present).');
    }
  }
  function setZone(z) { st.zone = z; clist.classList.toggle('zone', z === 'chars'); grid.classList.toggle('zone', z === 'cards'); }
  const layer = {
    key(e) {
      if (e.key === 'Tab') { setZone(st.zone === 'cards' ? 'chars' : 'cards'); return true; }
      if (st.zone === 'chars') {
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { chooseChar(st.ch - 1); return true; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { chooseChar(st.ch + 1); return true; }
        if (e.key === 'Enter') { setZone('cards'); return true; }
      } else {
        const c = cols();
        if (e.key === 'ArrowLeft') { if (list.i % c === 0 && !phoneQ.matches) setZone('chars'); else list.set(list.i - 1); return true; }
        if (e.key === 'ArrowRight') { list.set(list.i + 1); return true; }
        if (e.key === 'ArrowDown') { list.set(list.i + c); return true; }
        if (e.key === 'ArrowUp') { list.set(list.i - c); return true; }
        if (list.key(e)) return true;
      }
      return WC.shortcut(e, Object.fromEntries(Object.entries(H.KEYMAP).map(([k, a]) => [k, () => act(a)])));
    },
  };
  renderChars(); render(true);
  if (ERR) setTimeout(() => flash('Could not read the runs: the database is blocked by another tab.', 'fail'), 600);
  const pick = WC.qs.get('pick'); if (pick) { const i = st.list.findIndex((s) => s.id === pick); if (i >= 0) list.set(i); }
  return { layer, act, list };
}
window.HISTC = { mount };
})();
