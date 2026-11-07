/* Round 7 · layout review · the History page content, shared by the three directions (a-, b-, c-*.html).
   Real content from src/chrome/frames/history.tsx + history-model.ts (Inv §7.4):
   - filter pills: All + one per character with sessions (alphabetical); choosing one filters at once
   - columns Char · Date · Time · Dur. · Expires · Rating; a header click sorts (same column flips; a new
     one starts at text ▲ / the rest ▼); default Date ▼; Expires and Rating keep the saved sessions on top
   - Expires: "Saved" in gold, else "<N> days" (14-day retention from the oldest run); Rating: N gold stars,
     blank when unsaved or 0
   - actions Run log · Stats · Rate · Save · Export · Delete · Backup · Restore with the real disabled rules
     (Run log / Export need a captured log, Save is off when saved, Backup needs runs); Export is desktop only
   - the flash row (Saved., Saved webcockpit-runs-2026-11-07.jsonl.gz., Export: desktop only.) and the
     storage line; the empty state "No runs recorded yet." (?empty)
   Mockup choices (not in the app today): ←/→ move the filter at any time (no Tab zones), ↑↓ the rows,
   letters for the actions; click selects a row, double-click / Enter opens the run log; the chosen session
   is shown in a side card with its actions (desktop), or the card opens under the chosen row (phone).
   Usage: const h = HISTORY.mount(winEl) → { layer, onShow() } ; winEl is a box's .win. */
(() => {
'use strict';
const NOW = new Date(2026, 10, 7, 1, 30).getTime();   // fixed "now" so every screenshot agrees
const DAY = 864e5;
// [character, 'YYYY-MM-DD HH:MM', minutes, saved, rating, runs, hasLog, level]
const RAW = [
  ['Gibur', '2026-11-06 21:12', 221, false, 0, 2, true, 41],
  ['Gibur', '2026-11-05 19:40', 125, true, 4, 1, true, 40],
  ['Taube', '2026-11-05 12:03', 48, false, 0, 1, true, 22],
  ['Rasta', '2026-11-04 22:15', 72, false, 0, 1, true, 74],
  ['Gibur', '2026-11-03 20:30', 298, true, 5, 3, true, 40],
  ['Gibur', '2026-11-01 21:00', 200, false, 0, 1, true, 39],
  ['Rasta', '2026-10-31 23:40', 122, false, 0, 2, true, 74],
  ['Melker', '2026-10-31 09:14', 3, false, 0, 1, false, 3],
  ['Taube', '2026-10-30 20:10', 93, true, 0, 1, true, 21],
  ['Gibur', '2026-10-29 19:55', 167, false, 0, 1, true, 38],
  ['Gittan', '2026-10-28 21:22', 65, false, 0, 1, true, 17],
  ['Gibur', '2026-10-27 20:05', 302, false, 0, 2, true, 37],
  ['Rasta', '2026-10-26 15:19', 38, false, 0, 1, true, 73],
  ['Gibur', '2026-10-25 22:41', 110, false, 0, 1, true, 36],
  ['Taube', '2026-10-24 19:03', 135, false, 0, 1, true, 20],
  ['Gibur', '2026-10-18 20:20', 372, true, 5, 3, true, 34],
  ['Rasta', '2026-10-12 21:00', 144, true, 3, 1, true, 73],
  ['Gittan', '2026-10-03 19:40', 161, true, 2, 2, true, 15],
  ['Gibur', '2026-09-29 21:54', 243, true, 4, 1, true, 28],
  ['Rasta', '2026-09-26 21:00', 302, true, 4, 1, true, 73],
  ['Rasta', '2026-09-25 22:03', 144, true, 5, 2, true, 72],
  ['Melker', '2026-09-25 21:54', 7, true, 0, 2, true, 2],
  ['Taube', '2026-09-14 18:30', 190, true, 3, 1, true, 14],
];
const parse = (s) => { const [d, t] = s.split(' '), [y, m, dd] = d.split('-').map(Number), [h, mi] = t.split(':').map(Number); return new Date(y, m - 1, dd, h, mi).getTime(); };
const SESSIONS = WC.qs.has('empty') ? [] : RAW.map(([c, st, min, saved, rating, runs, hasLog, level], i) => {
  const start = parse(st);
  return { id: 's' + i, character: c, start, end: start + min * 6e4, saved, rating, runs, hasLog, level,
    expiresDays: saved ? null : Math.max(0, Math.ceil((start + 14 * DAY - NOW) / DAY)) };
});

// ---- history-model.ts, re-done for the mockup
const p2 = (n) => String(n).padStart(2, '0');
const fmtDate = (t) => { const d = new Date(t); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const fmtTime = (t) => { const d = new Date(t); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const fmtDur = (ms) => { const m = Math.max(0, Math.round(ms / 6e4)); return m >= 60 ? `${Math.floor(m / 60)}h${p2(m % 60)}m` : `${m}m`; };
const stars = (n) => '★'.repeat(Math.max(0, Math.min(5, n)));
const LONG = (t) => new Date(t).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const minutesOfDay = (t) => { const d = new Date(t); return d.getHours() * 60 + d.getMinutes(); };
function sortSessions(list, { key, dir }) {
  const cmp = (a, b) => {
    if (key === 'expires' || key === 'rating') {
      if (a.saved !== b.saved) return a.saved ? -1 : 1;
      if (key === 'rating') return (a.rating - b.rating) * dir;
      return ((a.expiresDays ?? 0) - (b.expiresDays ?? 0)) * dir;
    }
    if (key === 'char') return a.character.localeCompare(b.character) * dir;
    if (key === 'date') return (a.start - b.start) * dir;
    if (key === 'time') return (minutesOfDay(a.start) - minutesOfDay(b.start)) * dir;
    return ((a.end - a.start) - (b.end - b.start)) * dir;
  };
  return [...list].sort((a, b) => cmp(a, b) || b.start - a.start);
}
const nextSort = (cur, key) => cur.key === key ? { key, dir: cur.dir > 0 ? -1 : 1 } : { key, dir: key === 'char' ? 1 : -1 };

const ICON = {
  play: '<svg viewBox="0 0 16 16"><path d="M4.5 3.2 12.5 8l-8 4.8z"/></svg>',
  stats: '<svg viewBox="0 0 16 16"><path d="M2.5 13.5h11M4.5 11V7.5M8 11V4M11.5 11V6"/></svg>',
  star: '<svg viewBox="0 0 16 16"><path d="M8 2.2l1.8 3.7 4 .6-2.9 2.8.7 4L8 11.4l-3.6 1.9.7-4L2.2 6.5l4-.6z"/></svg>',
  save: '<svg viewBox="0 0 16 16"><path d="M3 2.5h8l2 2v9H3z"/><path d="M5.5 2.5v3h5v-3M5.5 13.5v-4h5v4"/></svg>',
  export: '<svg viewBox="0 0 16 16"><path d="M8 10.2V2.2M4.8 5.4 8 2.2l3.2 3.2M2.5 13.5h11"/></svg>',
  del: '<svg viewBox="0 0 16 16"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9"/></svg>',
  backup: '<svg viewBox="0 0 16 16"><path d="M8 2v8M4.8 7 8 10.2 11.2 7M2.5 13.5h11"/></svg>',
  restore: '<svg viewBox="0 0 16 16"><path d="M3 8a5 5 0 1 0 1.6-3.7"/><path d="M3 2.5v3h3"/></svg>',
};
const ACTIONS = [
  { id: 'log', label: '<u class="sk">R</u>un log', key: 'r', icon: ICON.play, cls: 'primary' },
  { id: 'stats', label: 'S<u class="sk">t</u>ats', key: 't', icon: ICON.stats },
  { id: 'rate', label: 'R<u class="sk">a</u>te', key: 'a', icon: ICON.star },
  { id: 'save', label: '<u class="sk">S</u>ave', key: 's', icon: ICON.save },
  { id: 'export', label: 'E<u class="sk">x</u>port', key: 'x', icon: ICON.export },
  { id: 'delete', label: '<u class="sk">D</u>elete', key: 'd', icon: ICON.del, cls: 'danger' },
];
const COLS = [
  { key: 'char', title: 'Char' }, { key: 'date', title: 'Date' }, { key: 'time', title: 'Time' },
  { key: 'dur', title: 'Dur.' }, { key: 'expires', title: 'Expires' }, { key: 'rating', title: 'Rating' },
];

function mount(win) {
  const phoneQ = matchMedia('(max-width: 760px)');
  const st = { pill: 0, sort: { key: 'date', dir: -1 }, list: [], cur: null };
  win.classList.add('hist');
  win.insertAdjacentHTML('beforeend', `
    <div class="box-head hist-head">
      <div class="seg hist-pills" role="tablist" aria-label="Character"></div>
      <select class="select hist-sort" aria-label="Sort by">
        <option value="date:-1">Newest first</option><option value="date:1">Oldest first</option><option value="char:1">Character</option>
        <option value="dur:-1">Longest</option><option value="rating:-1">Rating</option><option value="expires:1">Expires soonest</option>
      </select>
    </div>
    <div class="hist-main">
      <div class="hist-tablewrap">
        <div class="tbl hist-tbl">
          <div class="th-row">${COLS.map((c) => `<span class="th sort${c.key === 'rating' ? '' : ''}" data-k="${c.key}">${c.title}</span>`).join('')}</div>
        </div>
        <div class="box-body hist-body"><div class="tbl hist-tbl"><div class="rows flat hist-rows" role="listbox" aria-label="Sessions"></div></div></div>
      </div>
      <aside class="hist-card" aria-live="polite"></aside>
    </div>
    <div class="box-foot hist-foot">
      <div class="btnrow">
        <button class="ibtn small" data-a="backup">${ICON.backup}<span><u class="sk">B</u>ackup</span></button>
        <button class="ibtn small" data-a="restore">${ICON.restore}<span>Rest<u class="sk">o</u>re</span></button>
      </div>
      <span class="flash static hist-flash"></span>
      <span class="hist-storage">${SESSIONS.length ? 'Storage: 46 MB of 299 GB' : 'Storage: 12 KB of 299 GB'}</span>
    </div>`);
  const $ = (s) => win.querySelector(s);
  const pillsEl = $('.hist-pills'), rowsEl = $('.hist-rows'), card = $('.hist-card'), flashEl = $('.hist-flash');
  const flash = (m, kind) => WC.flash(flashEl, m, { kind, ms: 3000 });
  const names = () => [...new Set(SESSIONS.map((s) => s.character))].sort((a, b) => a.localeCompare(b));
  function renderPills() {
    const pills = ['All', ...names()];
    st.pill = Math.min(st.pill, pills.length - 1);
    pillsEl.innerHTML = pills.map((n, i) => `<button role="tab" aria-selected="${i === st.pill}" data-i="${i}">${n}</button>`).join('');
  }
  pillsEl.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) choosePill(+b.dataset.i); });
  function choosePill(i) { const n = names().length + 1; st.pill = Math.max(0, Math.min(n - 1, i)); renderPills(); render(true); }
  win.querySelectorAll('.th').forEach((th) => th.addEventListener('click', () => { st.sort = nextSort(st.sort, th.dataset.k); render(); }));
  $('.hist-sort').addEventListener('change', (e) => { const [k, d] = e.target.value.split(':'); st.sort = { key: k, dir: +d }; render(); });
  const list = WC.list(rowsEl, { item: '.row', onChange: (i) => { st.cur = st.list[i] || null; renderCard(); }, onActivate: () => act('log') });
  function render(resetCursor = false) {
    const filter = st.pill === 0 ? null : names()[st.pill - 1];
    st.list = sortSessions(SESSIONS.filter((s) => !filter || s.character === filter), st.sort);
    win.querySelectorAll('.th').forEach((th) => { if (th.dataset.k === st.sort.key) th.dataset.dir = st.sort.dir; else delete th.dataset.dir; });
    rowsEl.innerHTML = st.list.length ? st.list.map((s) => `
      <div class="row" role="option" data-id="${s.id}">
        <span class="td h-char">${s.character}</span>
        <span class="td h-date mono">${fmtDate(s.start)}</span>
        <span class="td h-time mono">${fmtTime(s.start)}</span>
        <span class="td h-dur mono">${fmtDur(s.end - s.start)}</span>
        <span class="td h-exp ${s.saved ? 'gold' : 'dim'}">${s.saved ? 'Saved' : s.expiresDays + ' days'}</span>
        <span class="td h-rate stars">${s.saved && s.rating ? stars(s.rating) : ''}</span>
      </div>`).join('') : '<div class="empty">No runs recorded yet.</div>';
    const id = st.cur && st.cur.id;
    list.refresh();
    let k = resetCursor ? 0 : Math.max(0, st.list.findIndex((s) => s.id === id));
    list.set(k, true);
    if (!st.list.length) { st.cur = null; renderCard(); }
  }
  function disabled(a) {
    const s = st.cur;
    switch (a) {
      case 'log': case 'export': return !s || !s.hasLog;
      case 'stats': case 'rate': case 'delete': return !s;
      case 'save': return !s || s.saved;
      case 'backup': return SESSIONS.length === 0;
      default: return false;
    }
  }
  function renderCard() {
    const s = st.cur;
    card.innerHTML = s ? `
      <div class="hc-name">${s.character}<small>Level ${s.level}</small></div>
      <div class="hc-when">${LONG(s.start)} · ${fmtTime(s.start)}</div>
      <dl class="kv hc-kv">
        <dt>Duration</dt><dd>${fmtDur(s.end - s.start)} <span class="muted">· ${s.runs} run${s.runs > 1 ? 's' : ''}</span></dd>
        <dt>Kept</dt><dd>${s.saved ? '<span class="gold">Saved</span>' : `<span>Expires in ${s.expiresDays} day${s.expiresDays === 1 ? '' : 's'}</span>`}</dd>
        <dt>Rating</dt><dd>${s.saved && s.rating ? `<span class="stars">${stars(s.rating)}</span>` : '<span class="faint">—</span>'}</dd>
        <dt>Log</dt><dd>${s.hasLog ? 'Captured text' : '<span class="faint">No text captured</span>'}</dd>
      </dl>
      <div class="btncol hc-acts">${ACTIONS.map((a) => `<button class="ibtn ${a.cls || ''}" data-a="${a.id}" ${disabled(a.id) ? 'disabled' : ''}>${a.icon}<span>${a.label}</span></button>`).join('')}</div>`
      : `<p class="empty hc-empty">${SESSIONS.length ? 'No session chosen.' : 'Recorded sessions show here. Restore brings back a backup.'}</p>`;
    win.querySelector('[data-a="backup"]').disabled = disabled('backup');
    // phone: the card opens under the chosen row
    if (phoneQ.matches) { const row = rowsEl.querySelector('.row.on'); if (row) row.after(card); else rowsEl.after(card); }
    else if (card.parentElement !== $('.hist-main')) $('.hist-main').append(card);
  }
  card.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b && !b.disabled) act(b.dataset.a); });
  win.querySelector('.hist-foot').addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b && !b.disabled) act(b.dataset.a); });
  phoneQ.addEventListener('change', renderCard);
  function act(a) {
    if (disabled(a)) return;
    const s = st.cur;
    switch (a) {
      case 'log': return flash(`The log player opens on ${s.character}, ${fmtDate(s.start)} — not in this mockup`);
      case 'stats': return flash('Session statistics — not in this mockup');
      case 'rate': return flash('Rate the session (0–5 stars) — not in this mockup');
      case 'save': s.saved = true; s.expiresDays = null; render(); return flash('Saved.');
      case 'export': return phoneQ.matches ? flash('Export: desktop only.', 'fail') : flash('The export editor — not in this mockup');
      case 'delete': return flash('Delete session (Y deletes, any other key cancels) — not in this mockup');
      case 'backup': return flash('Saved webcockpit-runs-2026-11-07.jsonl.gz.');
      case 'restore': return flash('Restore: choose a backup file — not in this mockup');
    }
  }
  const layer = {
    key(e) {
      if (e.key === 'ArrowLeft') { choosePill(st.pill - 1); return true; }
      if (e.key === 'ArrowRight') { choosePill(st.pill + 1); return true; }
      if (list.key(e)) return true;
      return WC.shortcut(e, { r: () => act('log'), t: () => act('stats'), a: () => act('rate'), s: () => act('save'), x: () => act('export'), d: () => act('delete'), b: () => act('backup'), o: () => act('restore') });
    },
  };
  renderPills(); render(true);
  return { layer, onShow() { st.pill = 0; renderPills(); render(true); } };
}
window.HISTORY = { mount, SESSIONS };
})();
