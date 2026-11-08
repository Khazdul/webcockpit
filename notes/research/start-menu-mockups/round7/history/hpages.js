/* Round 7 · history group · History's sub-pages, shared by the three History directions (throwaway).
   HP.stats(win, session, { onBack, layout })   Statistics ("Session details") inside the big box's window
   HP.rate(host, session, done)                 the Rate dialog (0–5 stars) over the page
   HP.del(host, session, done)                  the Delete confirmation (Y deletes, any other key cancels)
   Each pushes its own WC.keys layer and pops it when it closes. Needs base.js and hdata.js. */
(() => {
'use strict';
const H = window.HD;
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const KIND_SVG = {
  death: '<svg viewBox="0 0 24 24"><path d="M12 3.5c-4 0-7 2.9-7 6.8 0 2.3 1.1 4.1 2.8 5.1V19a1 1 0 0 0 1 1h6.4a1 1 0 0 0 1-1v-3.6c1.7-1 2.8-2.8 2.8-5.1 0-3.9-3-6.8-7-6.8z M8.4 10.8a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0z M13 10.8a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0z M10.7 20v-2.2 M13.3 20v-2.2"/></svg>',
  pkill: '<svg viewBox="0 0 24 24"><path d="M4 4l9.5 9.5 M11.5 15.5l4-4 M14 14l4.5 4.5 M20 4l-9.5 9.5 M8.5 11.5l4 4 M10 14l-4.5 4.5"/></svg>',
  achievement: '<svg viewBox="0 0 24 24"><path d="M12 3.8l2.5 5.1 5.6.8-4.05 3.95.95 5.6L12 16.6l-5 2.65.95-5.6L3.9 9.7l5.6-.8z"/></svg>',
  level: '<svg viewBox="0 0 24 24"><path d="M6.5 12.5l5.5-5.5 5.5 5.5 M6.5 18l5.5-5.5 5.5 5.5"/></svg>',
};

// ------------------------------------------------------------------ Statistics
const KCOLS = [{ k: 'name', t: 'Kills', a: 'l' }, { k: 'n', t: 'N', a: 'r' }, { k: 'xpPer', t: 'XP/N', a: 'r' }, { k: 'xpTotal', t: 'XP tot', a: 'r' }];
const PCOLS = [{ k: 'label', t: 'PvPs', a: 'l' }, { k: 'n', t: 'N', a: 'r' }, { k: 'xp', t: 'XP', a: 'r' }];
function spark(values, w = 420, h = 74) {
  const max = Math.max(1, ...values), n = values.length, dx = w / (n - 1);
  const pts = values.map((v, i) => [i * dx, h - (v / max) * (h - 6) - 1]);
  let d = `M0 ${h} L` + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L') + ` L${w} ${h} Z`;
  let l = 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L');
  return { d, l, max };
}
function stats(win, s, opts = {}) {
  const m = H.statsOf(s);
  const st = { focus: 2, ks: { key: 'xpTotal', dir: -1 }, ps: { key: 'xp', dir: -1 } };
  const el = WC.el('div', { class: 'st' });
  const loading = WC.qs.has('statsloading'), failed = WC.qs.has('statsfail');
  el.innerHTML = `
    <div class="st-head">
      <div class="st-who"><span class="st-name">${esc(s.character)}</span><span class="st-lvl">Level ${s.level}</span></div>
      <div class="st-when">Session details · ${H.LONG(s.start)} · ${H.fmtTime(s.start)} · ${H.fmtDur(s.end - s.start)} · ${s.runs} run${s.runs > 1 ? 's' : ''}${s.saved && s.rating ? ` · <span class="stars">${H.stars(s.rating)}</span>` : ''}</div>
    </div>
    <div class="st-body box-body">
      ${loading || failed ? `<p class="empty ${failed ? 'bad' : ''}">${failed ? 'Could not read the session: the run data is damaged.' : 'Loading…'}</p>` : `
      <div class="st-grid">
        <section class="st-sec" data-t="0"><h3 class="h-sec">Allies</h3><div class="st-scroll scroll st-allies">${m.allies.length ? m.allies.map((a) => `<span class="st-ally"><i>♦</i>${a}</span>`).join('') : '<span class="faint st-none">Played alone.</span>'}</div></section>
        <section class="st-sec" data-t="1"><h3 class="h-sec">Achievements</h3><div class="st-scroll scroll st-ach">${m.milestones.length ? m.milestones.map((x) => `<div class="st-mile ${x.kind}"><i>${x.kind === 'level' ? KIND_SVG.level : KIND_SVG.achievement}</i><span>${esc(x.text.slice(2))}</span><span class="st-at">${H.fmtClock(x.at)}</span></div>`).join('') : '<span class="faint st-none">None this session.</span>'}</div></section>
        <section class="st-sec" data-t="2"><div class="st-tbl" data-tbl="k"></div></section>
        <section class="st-sec" data-t="3"><div class="st-tbl" data-tbl="p"></div></section>
        <section class="st-sec st-chart"><h3 class="h-sec">XP per hour</h3>${chart(m.xph, m.durMs, 'xp')}</section>
        <section class="st-sec st-chart"><h3 class="h-sec">TP per hour</h3>${chart(m.tph, m.durMs, 'tp')}</section>
        <section class="st-sec st-ruler-sec">${ruler(m)}</section>
      </div>`}
    </div>`;
  win.append(el);
  function chart(vals, dur, cls) {
    const { d, l, max } = spark(vals);
    return `<div class="st-spark ${cls}"><div class="st-y"><span>${H.fmtK(max)}</span><span>${H.fmtK(max / 2)}</span><span>0</span></div>
      <svg viewBox="0 0 420 74" preserveAspectRatio="none"><path class="ar" d="${d}"/><path class="ln" d="${l}"/></svg>
      <div class="st-x"><span>00:00</span><span>${H.fmtClock(dur)}</span></div></div>`;
  }
  function ruler(mm) {
    const r = mm.ruler;
    if (!r) return '<p class="empty st-noxp">No XP data.</p>';
    const f = (xp) => Math.max(0, Math.min(1, (xp - r.fromXp) / (r.toXp - r.fromXp))) * 100;
    const a = f(Math.min(r.startXp, r.nowXp)), b = f(Math.max(r.startXp, r.nowXp)), loss = r.delta < 0;
    return `<h3 class="h-sec">Experience</h3><div class="st-ruler ${loss ? 'loss' : ''}">
      <div class="st-rlabel" style="left:${a}%;width:${b - a}%"><span>${loss ? '−' : ''}${H.fmtK(Math.abs(r.delta))} XP</span></div>
      <div class="st-rtrack"><i class="st-rband" style="left:${a}%;width:${b - a}%"></i>${r.levels.map((x) => `<b style="left:${f(x.xp)}%"></b>`).join('')}</div>
      <div class="st-rmarks">${r.levels.map((x, i) => `<span style="left:${f(x.xp)}%" class="${i === r.levels.length - 1 ? 'end' : ''}">${x.L}</span>`).join('')}</div></div>`;
  }
  function renderTables() {
    const kt = el.querySelector('[data-tbl="k"]'), pt = el.querySelector('[data-tbl="p"]');
    if (!kt) return;
    const sortRows = (rows, so) => [...rows].sort((x, y) => { const d = typeof x[so.key] === 'string' ? x[so.key].localeCompare(y[so.key]) : x[so.key] - y[so.key]; return d * so.dir; });
    const head = (cols, so, w) => `<div class="st-th" data-w="${w}">${cols.map((c) => `<span class="${c.a === 'r' ? 'r' : ''}" data-k="${c.k}" ${so.key === c.k ? `data-dir="${so.dir}"` : ''}>${c.t}</span>`).join('')}</div>`;
    const kr = sortRows(m.kills, st.ks), pr = sortRows(m.pvps, st.ps);
    kt.innerHTML = head(KCOLS, st.ks, 'k') + `<div class="st-rows scroll">${kr.length ? kr.map((k) => `<div class="st-tr"><span>${k.name}</span><span class="r">${k.n}</span><span class="r">${H.fmtK(k.xpPer)}</span><span class="r">${H.fmtK(k.xpTotal)}</span></div>`).join('') : '<div class="st-tr faint"><span>No kills.</span></div>'}</div>`
      + (m.killTotal.n ? `<div class="st-tr st-total"><span>Total</span><span class="r">${m.killTotal.n}</span><span></span><span class="r">${H.fmtK(m.killTotal.xp)}</span></div>` : '');
    pt.innerHTML = head(PCOLS, st.ps, 'p') + `<div class="st-rows scroll">${pr.length ? pr.map((k) => `<div class="st-tr"><span class="st-pk"><i>${KIND_SVG.pkill}</i>${esc(k.label)}</span><span class="r">${k.n}</span><span class="r">${H.fmtK(k.xp)}</span></div>`).join('') : '<div class="st-tr faint"><span>No PvP this session.</span></div>'}</div>`
      + (m.pvpTotal.n ? `<div class="st-tr st-total"><span>Total</span><span class="r">${m.pvpTotal.n}</span><span class="r">${H.fmtK(m.pvpTotal.xp)}</span></div>` : '');
    kt.querySelectorAll('.st-th span').forEach((h) => h.addEventListener('click', () => { st.ks = sortNext(st.ks, h.dataset.k); st.focus = 2; renderTables(); }));
    pt.querySelectorAll('.st-th span').forEach((h) => h.addEventListener('click', () => { st.ps = sortNext(st.ps, h.dataset.k); st.focus = 3; renderTables(); }));
    focus();
  }
  const sortNext = (cur, key) => cur.key === key ? { key, dir: -cur.dir } : { key, dir: key === 'name' || key === 'label' ? 1 : -1 };
  function focus() { el.querySelectorAll('.st-sec[data-t]').forEach((x) => x.classList.toggle('focus', +x.dataset.t === st.focus)); }
  el.querySelectorAll('.st-sec[data-t]').forEach((x) => x.addEventListener('pointerdown', () => { st.focus = +x.dataset.t; focus(); }));
  renderTables();
  const scroller = () => { const sec = el.querySelector(`.st-sec[data-t="${st.focus}"]`); return sec && (sec.querySelector('.st-rows') || sec.querySelector('.st-scroll')); };
  const layer = {
    key(e) {
      if (e.key === 'Tab') { st.focus = (st.focus + (e.shiftKey ? 3 : 1)) % 4; focus(); return true; }
      const sc = scroller(); if (!sc) return false;
      const row = 27;
      if (e.key === 'ArrowDown') sc.scrollBy(0, row); else if (e.key === 'ArrowUp') sc.scrollBy(0, -row);
      else if (e.key === 'PageDown') sc.scrollBy(0, sc.clientHeight); else if (e.key === 'PageUp') sc.scrollBy(0, -sc.clientHeight);
      else if (e.key === 'Home') sc.scrollTo(0, 0); else if (e.key === 'End') sc.scrollTo(0, sc.scrollHeight);
      else return false;
      return true;
    },
    back() { close(); },
  };
  const pop = WC.keys.push(layer);
  function close() { pop(); el.remove(); opts.onBack && opts.onBack(); }
  return { el, close };
}

// ------------------------------------------------------------------ dialogs
/** A small Lykta box over the page (a dim veil over the big box's window). keys(e) → true when handled. */
function dialog(host, { hood, html, cls = '', keys, onClose }) {
  const veil = WC.el('div', { class: 'hp-veil' });
  veil.innerHTML = `<section class="lp hp-dlg ${cls}" data-hood="${hood}" role="dialog" aria-label="${hood}"><div class="win">${html}</div></section>`;
  host.append(veil);
  WC.decorate(veil);
  const box = veil.querySelector('.hp-dlg');
  box.animate([{ opacity: 0, transform: 'translateY(10px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: WC.dur(320), easing: 'cubic-bezier(.2,.8,.2,1)' });
  veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration: WC.dur(240) });
  let pop = WC.keys.push({ key: (e) => keys(e), back: () => close() });
  veil.addEventListener('pointerdown', (e) => { if (e.target === veil) close(); });
  function close() { if (!pop) return; pop(); pop = null; veil.remove(); onClose && onClose(); }
  return { box, close };
}
const sessLine = (s) => `${esc(s.character)} · ${H.LONG(s.start)} · ${H.fmtTime(s.start)} · ${H.fmtDur(s.end - s.start)}`;
function rate(host, s, done) {
  let v = s.saved ? s.rating : 0;
  const STAR = '<svg viewBox="0 0 24 24"><path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.45 6.2 20.5l1.1-6.45-4.7-4.6 6.5-.95z"/></svg>';
  const d = dialog(host, {
    hood: 'Rate the session', cls: 'hp-rate',
    html: `<p class="hp-line">${sessLine(s)}</p>
      <div class="hp-stars" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map((i) => `<button type="button" role="radio" data-v="${i}" aria-label="${i} star${i > 1 ? 's' : ''}">${STAR}</button>`).join('')}</div>
      <p class="hp-val"></p>
      <div class="btnrow hp-btns"><button class="ibtn primary" data-a="save"><span><u class="sk">S</u>ave</span></button><button class="ibtn" data-a="cancel"><span>Cancel</span></button></div>`,
    keys(e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') set(v - 1); else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') set(v + 1);
      else if (/^[0-5]$/.test(e.key)) set(+e.key);
      else if (e.key === 'Enter' || e.key === 's' || e.key === 'S' || e.key === ' ') commit();
      else return false;
      return true;
    },
  });
  const btns = [...d.box.querySelectorAll('.hp-stars button')], val = d.box.querySelector('.hp-val');
  function set(n) { v = Math.max(0, Math.min(5, n)); btns.forEach((b, i) => b.classList.toggle('lit', i < v)); val.textContent = v ? ['', 'One star', 'Two stars', 'Three stars', 'Four stars', 'Five stars'][v] : 'No rating — the session is still saved'; }
  btns.forEach((b) => { b.addEventListener('click', () => set(+b.dataset.v === v ? 0 : +b.dataset.v)); b.addEventListener('pointerenter', () => btns.forEach((x, i) => x.classList.toggle('peek', i < +b.dataset.v))); });
  d.box.querySelector('.hp-stars').addEventListener('pointerleave', () => btns.forEach((x) => x.classList.remove('peek')));
  d.box.querySelector('[data-a="save"]').addEventListener('click', commit);
  d.box.querySelector('[data-a="cancel"]').addEventListener('click', () => d.close());
  function commit() { s.saved = true; s.rating = v; s.expiresDays = null; d.close(); done(v > 0 ? `Rated ${H.stars(v)}.` : 'Saved, no rating.'); }
  set(v);
  return d;
}
function del(host, s, done) {
  const d = dialog(host, {
    hood: 'Delete session', cls: 'hp-del',
    html: `<dl class="kv hp-kv"><dt>Character</dt><dd>${esc(s.character)}</dd><dt>Date</dt><dd>${H.LONG(s.start)}</dd><dt>Time</dt><dd>${H.fmtTime(s.start)}</dd>
        <dt>Duration</dt><dd>${H.fmtDurLong(s.end - s.start)}</dd><dt>Runs</dt><dd>${s.runs}</dd>${s.saved ? `<dt>Saved</dt><dd class="gold">yes${s.rating ? ` <span class="stars">${H.stars(s.rating)}</span>` : ''}</dd>` : ''}</dl>
      <p class="hp-warn">This will permanently delete the session's logs and run data. This cannot be undone.</p>
      <div class="btnrow hp-btns"><button class="ibtn danger" data-a="yes">${H.ICON.del}<span><u class="sk">Y</u>es, delete</span></button><button class="ibtn" data-a="cancel"><span>Keep it</span></button></div>`,
    keys(e) {
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return true;
      if ((e.key === 'y' || e.key === 'Y') && !e.ctrlKey && !e.metaKey && !e.altKey) yes(); else d.close();
      return true;
    },
  });
  d.box.querySelector('[data-a="yes"]').addEventListener('click', yes);
  d.box.querySelector('[data-a="cancel"]').addEventListener('click', () => d.close());
  function yes() { d.close(); const i = H.SESSIONS.indexOf(s); if (i >= 0) H.SESSIONS.splice(i, 1); done('Session deleted.'); }
  return d;
}
window.HP = { stats, rate, del, dialog, KIND_SVG, esc };
})();
