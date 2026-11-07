/* Round 7 · profiles · the Export editor and its input, shared by export-a/b/c.html (throwaway mockup code).
   Real content from chrome/frames/export-editor.tsx, export-input.tsx, export-model.ts (Inv §7.7, ADR 0019,
   0106, 0115): the log (lines, > commands, [SYSTEM] lines, ## comments, the end row), the cursor, a selection
   (drag, Shift+click, Shift+arrows; Esc clears it first), Exclude ↔ Include, Add / Edit / Delete comment,
   the title (file name) and Edit title, the two exports (HTML replay: player, map and comments; plain text)
   with the last one marked, the overview (excluded stretches, comments, event letters, the viewport), the
   summary (character and level; date and lines; excluded and comments), the flashes, Reading the log… and
   Could not read the log. The input: the comment (600 characters, counter, the ## preview as in the replay,
   "Holds the replay for N s.", empty = deleted on edit), the title (200, "File: ….html", empty = default).
   Keys: ↑↓ PgUp PgDn Home End (Shift extends) · X · C · E / Enter on a comment · D / Delete · T · H · P ·
   Tab log ↔ panel · Esc (selection, then back). Opened from History → Export (?page=export opens it). */
(() => {
'use strict';
const qs = WC.qs, esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const COMMENT_MAX = 600, TITLE_MAX = 200;
const IC = {
  excl: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5"/><path d="M4.2 11.8l7.6-7.6"/></svg>',
  incl: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5"/><path d="M5.3 8.3l1.9 1.9 3.6-3.8"/></svg>',
  cmt: '<svg viewBox="0 0 16 16"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/></svg>',
  edit: '<svg viewBox="0 0 16 16"><path d="M10.5 2.5l3 3-8 8H2.5v-3z"/></svg>',
  del: '<svg viewBox="0 0 16 16"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9"/></svg>',
  title: '<svg viewBox="0 0 16 16"><path d="M3 3.5h10M8 3.5v9.5M6 13h4"/></svg>',
  html: '<svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M6.5 6.2 9.8 8l-3.3 1.8z"/></svg>',
  text: '<svg viewBox="0 0 16 16"><path d="M4 2.5h5.5l2.5 2.5v8.5H4z"/><path d="M6 7.5h4M6 10h4"/></svg>',
  exp: '<svg viewBox="0 0 16 16"><path d="M8 10.2V2.2M4.8 5.4 8 2.2l3.2 3.2M2.5 13.5h11"/></svg>',
  x: '<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  bigHtml: '<svg viewBox="0 0 24 24"><rect x="2.5" y="4" width="19" height="15" rx="2"/><path d="M10 9l5 3-5 3z"/></svg>',
  bigTxt: '<svg viewBox="0 0 24 24"><path d="M6 2.5h8.5l3.5 3.5v15.5H6z"/><path d="M9 10h6M9 13.5h6M9 17h4"/></svg>',
};
const mark = (s) => esc(s).replace(/&lt;\/?F[0-9a-fA-F]{6}&gt;/g, '').replace(/&lt;([cgyrbwo])&gt;(.*?)&lt;\/\1&gt;/g, '<span class="l$1">$2</span>');
const plural = (n, w) => `${n.toLocaleString('en-US')} ${w}${n === 1 ? '' : 's'}`;
function commentLines(text, cols = 80) {
  const width = cols - 3, words = text.replace(/\s+/g, ' ').trim().slice(0, COMMENT_MAX).split(' ').filter(Boolean), out = []; let cur = '';
  for (const w of words) { if (!cur) cur = w; else if (cur.length + 1 + w.length <= width) cur += ' ' + w; else { out.push(cur); cur = w; } }
  if (cur) out.push(cur);
  return out.map((l) => '## ' + l);
}
const holdS = (t) => Math.round(Math.max(2.5, Math.min(10, 1 + t.replace(/\s+/g, ' ').trim().length / 30)));

function mount(win, o = {}) {
  const L = o.layout || 'a';
  const sess = o.session || { character: 'Rasta', level: 72, date: '2026-09-25', time: '22:03', lines: 70098 };
  const st = {
    entries: PDATA.exportLog().map((r) => (sess.character !== 'Rasta' ? { ...r, s: r.s.replace(/Rasta/g, sess.character) } : r)),
    comments: [], excl: new Set(), cursor: 0, anchor: null, zone: 'log', title: '', last: 'html', fail: false, input: null,
  };
  const find = (re) => st.entries.findIndex((r) => re.test(r.s));
  st.comments.push({ before: find(/narrates 'trolls spotted/), text: 'This log happened in the Trollshaws on Mersday. Ecthel and I ran into two trolls at the clearing; watch the flee, then the second try.' });
  const r0 = find(/You sit down and rest/); for (let i = r0; i < r0 + 4; i++) st.excl.add(i + 1);   // the four "You feel a bit better." lines
  const lv = find(/reached level/);
  const defTitle = `mume-${sess.character}-${sess.date}T${sess.time.replace(':', '-')}`;
  const title = () => (st.title.trim() ? st.title.trim() : defTitle);
  const fname = (f = st.last) => `${title()}.${f === 'html' ? 'html' : 'txt'}`;
  const ex = WC.el('div', { class: `exp exp-${L}` }); win.append(ex);

  if (o.state === 'loading' || o.state === 'failed') {
    ex.innerHTML = `<div class="exp-state${o.state === 'failed' ? ' bad' : ''}">${o.state === 'failed' ? 'Could not read the log: the run store could not be opened (IndexedDB is blocked in this window).' : 'Reading the log…'}</div>`;
    return { layer: { key: () => false, back: o.onBack }, el: ex };
  }

  /* ---------------------------------------------------------- items */
  let items = [];
  function build() {
    items = [];
    const byBefore = new Map(); st.comments.forEach((c, i) => { if (!byBefore.has(c.before)) byBefore.set(c.before, []); byBefore.get(c.before).push(i); });
    st.entries.forEach((_, e) => { (byBefore.get(e) || []).forEach((c) => items.push({ k: 'c', i: c })); items.push({ k: 'e', i: e }); });
    (byBefore.get(st.entries.length) || []).forEach((c) => items.push({ k: 'c', i: c }));
    items.push({ k: 'end' });
    st.cursor = Math.max(0, Math.min(items.length - 1, st.cursor));
  }
  const target = () => {
    if (st.anchor !== null) { const a = Math.min(st.anchor, st.cursor), b = Math.max(st.anchor, st.cursor); const es = items.slice(a, b + 1).filter((x) => x.k === 'e').map((x) => x.i); return es.length ? [es[0], es[es.length - 1]] : null; }
    const it = items[st.cursor]; return it && it.k === 'e' ? [it.i, it.i] : null;
  };
  const allExcl = () => { const t = target(); if (!t) return false; for (let e = t[0]; e <= t[1]; e++) if (!st.excl.has(e)) return false; return true; };
  const curComment = () => (items[st.cursor] && items[st.cursor].k === 'c' ? items[st.cursor].i : -1);
  const heading = () => { if (st.anchor !== null) { const t = target(); return `Selection · ${plural(t ? t[1] - t[0] + 1 : 0, 'line')}`; } const it = items[st.cursor]; return it.k === 'e' ? `Line · ${(it.i + 1).toLocaleString('en-US')}` : it.k === 'c' ? 'Comment' : 'End of log'; };
  const summary = () => ({ who: `${sess.character}`, lvl: `Level ${sess.level}`, when: `${sess.date} · ${plural(sess.lines, 'line')}`, counts: `${st.excl.size} excluded · ${plural(st.comments.length, 'comment')}` });

  /* ---------------------------------------------------------- skeleton per layout */
  const logHtml = `<div class="exp-log" tabindex="0" role="listbox" aria-label="Log" aria-multiselectable="true"></div>`;
  const mapHtml = `<div class="exp-map" aria-hidden="true"></div>`;
  const flashHtml = `<div class="exp-foot"><span class="flash"></span></div>`;
  if (L === 'a') {
    ex.innerHTML = `<div class="exp-main">${logHtml}${mapHtml}<aside class="exp-panel"></aside></div>${flashHtml}`;
  } else if (L === 'b') {
    ex.innerHTML = `<div class="box-head exp-bar"><span class="exp-who"></span><span class="exp-selhead"></span><div class="exp-tools"></div></div>
      <div class="exp-main">${logHtml}${mapHtml}</div>
      <div class="exp-foot2"><div class="exp-file"><label class="lbl">File</label><span class="fn" title="Edit title (T)"></span></div><div class="exp-outs"></div></div>${flashHtml}`;
  } else {
    ex.innerHTML = `<div class="exp-top"><span class="exp-who"></span><span class="sp"></span><span class="exp-fn" title="Edit title (T)"></span>
        <button class="ibtn small" data-a="title">${IC.title}<span>Edit <u class="sk">t</u>itle</span></button><button class="ibtn small primary" data-a="export">${IC.exp}<span>Export…</span></button></div>
      <div class="exp-tl" aria-hidden="true"></div>
      <div class="exp-main">${logHtml}<div class="exp-chip"></div><aside class="exp-drawer" aria-label="Export"></aside></div>${flashHtml}`;
  }
  const $ = (s) => ex.querySelector(s), logEl = $('.exp-log'), mapEl = $('.exp-map'), tlEl = $('.exp-tl'), flEl = $('.exp-foot .flash');
  const flash = (m, kind, ms = 2600) => WC.flash(flEl, m, { kind, ms });

  /* ---------------------------------------------------------- render */
  function rowHtml(it, idx) {
    if (it.k === 'end') return `<div class="er end" data-i="${idx}"><span class="tx">── end of log ──</span></div>`;
    if (it.k === 'c') return `<div class="er cm" data-i="${idx}"><span class="tx">${commentLines(st.comments[it.i].text).map(esc).join('\n')}</span></div>`;
    const r = st.entries[it.i];
    return `<div class="er ${r.t === 'out' ? 'out' : r.t === 'sys' ? 'sys' : ''}${st.excl.has(it.i) ? ' x' : ''}" data-i="${idx}"><span class="tx">${mark(r.s)}</span></div>`;
  }
  function renderLog() {
    build();
    logEl.innerHTML = items.map(rowHtml).join('');
    if (st.input && st.input.inline) placeInline();
    marks(); renderMap();
  }
  function marks(scroll = true) {
    const a = st.anchor === null ? -1 : Math.min(st.anchor, st.cursor), b = st.anchor === null ? -1 : Math.max(st.anchor, st.cursor);
    logEl.querySelectorAll('.er').forEach((r) => { const i = +r.dataset.i; r.classList.toggle('cur', i === st.cursor); r.classList.toggle('sel', i >= a && i <= b && items[i].k === 'e'); });
    const cur = logEl.querySelector('.er.cur');
    if (scroll && cur) { const lr = logEl.getBoundingClientRect(), cr = cur.getBoundingClientRect(); if (cr.top < lr.top + 8) logEl.scrollTop -= lr.top + 8 - cr.top; else if (cr.bottom > lr.bottom - 8) logEl.scrollTop += cr.bottom - lr.bottom + 8; }
    renderSide(); renderChip(); thumb();
  }
  function renderSide() {
    const s = summary(), ce = curComment() >= 0, t = target(), inc = allExcl();
    const ex1 = `<button class="ibtn small" data-a="exclude"${t ? '' : ' disabled'}>${inc ? IC.incl : IC.excl}<span>${inc ? '<u class="sk">I</u>nclude' : 'E<u class="sk">x</u>clude'}</span></button>`;
    if (L === 'a') {
      $('.exp-panel').innerHTML = `<div class="exp-sum"><div class="who">${s.who}<small>${s.lvl}</small></div><div class="ln">${s.when}</div><div class="ln">${s.counts}</div></div>
        <h3 class="h-sec">${heading()}</h3><div class="btncol">${ex1.replace('ibtn small', 'ibtn')}
          <button class="ibtn" data-a="comment">${IC.cmt}<span>Add <u class="sk">c</u>omment</span></button>
          <button class="ibtn${ce ? '' : ' exp-ghost'}" data-a="edit"${ce ? '' : ' tabindex="-1"'}>${IC.edit}<span><u class="sk">E</u>dit comment</span></button>
          <button class="ibtn danger${ce ? '' : ' exp-ghost'}" data-a="delete"${ce ? '' : ' tabindex="-1"'}>${IC.del}<span><u class="sk">D</u>elete comment</span></button></div>
        <h3 class="h-sec">Title</h3><div class="exp-ttl">${esc(title())}<em>.${st.last === 'html' ? 'html' : 'txt'}</em></div>
        <div class="btncol"><button class="ibtn" data-a="title">${IC.title}<span>Edit <u class="sk">t</u>itle</span></button></div>
        <h3 class="h-sec">Export</h3><div class="btncol">
          <button class="ibtn primary${st.last === 'html' ? ' last' : ''}" data-a="html">${IC.html}<span><u class="sk">H</u>TML replay</span><span class="sub">player, map, comments</span></button>
          <button class="ibtn${st.last === 'text' ? ' last' : ''}" data-a="text">${IC.text}<span><u class="sk">P</u>lain text</span><span class="sub">.txt</span></button></div>
        <div class="exp-legend"><i style="background:var(--sel-bar)"></i><span>selected</span><i style="background:var(--excl)"></i><span>excluded</span><i style="background:var(--cmt)"></i><span>## comment</span></div>`;
    } else if (L === 'b') {
      $('.exp-who').innerHTML = `${s.who}<small>${s.lvl} · ${s.when} · ${s.counts}</small>`;
      $('.exp-selhead').textContent = heading();
      $('.exp-tools').innerHTML = `${ex1}<button class="ibtn small" data-a="comment">${IC.cmt}<span>Add <u class="sk">c</u>omment</span></button><button class="ibtn small" data-a="edit"${ce ? '' : ' disabled'}>${IC.edit}<span><u class="sk">E</u>dit</span></button><button class="ibtn small danger" data-a="delete"${ce ? '' : ' disabled'}>${IC.del}<span><u class="sk">D</u>elete</span></button>`;
      if (!(st.input && st.input.kind === 'title')) $('.exp-file').innerHTML = `<label class="lbl">File</label><span class="fn" data-a="title" title="Edit title (T)">${esc(title())}<em>.${st.last === 'html' ? 'html' : 'txt'}</em></span><button class="ibtn small" data-a="title">${IC.title}<span>Edit <u class="sk">t</u>itle</span></button>`;
      $('.exp-outs').innerHTML = `<button class="ibtn primary${st.last === 'html' ? ' last' : ''}" data-a="html" title="Player, map and comments">${IC.html}<span><u class="sk">H</u>TML replay</span></button><button class="ibtn${st.last === 'text' ? ' last' : ''}" data-a="text" title="Plain text (.txt)">${IC.text}<span><u class="sk">P</u>lain text</span></button>`;
    } else {
      $('.exp-who').innerHTML = `${s.who}<small>${s.lvl} · ${s.when} · ${s.counts}</small>`;
      $('.exp-fn').textContent = fname();
      if (st.input && st.input.kind === 'export') drawer('export');
    }
  }
  function renderChip() {
    if (L !== 'c') return;
    const chip = $('.exp-chip'), ce = curComment() >= 0, t = target(), inc = allExcl();
    if (st.input) { chip.hidden = true; return; }
    chip.hidden = false;
    chip.innerHTML = `<span class="t">${heading()}</span>${t ? `<button class="ibtn small" data-a="exclude">${inc ? IC.incl : IC.excl}<span>${inc ? '<u class="sk">I</u>nclude' : 'E<u class="sk">x</u>clude'}</span></button>` : ''}${ce ? `<button class="ibtn small" data-a="edit">${IC.edit}<span><u class="sk">E</u>dit</span></button><button class="ibtn small danger" data-a="delete">${IC.del}<span><u class="sk">D</u>elete</span></button>` : `<button class="ibtn small" data-a="comment">${IC.cmt}<span><u class="sk">C</u>omment</span></button>`}`;
    const a = st.anchor === null ? st.cursor : Math.min(st.anchor, st.cursor);
    const row = logEl.querySelector(`.er[data-i="${a}"]`);
    if (row) { const lr = logEl.getBoundingClientRect(), rr = row.getBoundingClientRect(); const top = Math.max(6, Math.min(lr.height - 44, rr.top - lr.top - 40)); chip.style.top = (rr.top - lr.top < 46 ? Math.min(lr.height - 44, rr.bottom - lr.top + 6) : top) + 'px'; }
  }
  /* the overview: vertical strip (A, B) or the timeline (C) */
  function renderMap() {
    const n = items.length;
    const pos = (i) => (i / n) * 100;
    let h = '';
    // excluded stretches (merged)
    let s0 = -1;
    items.forEach((it, i) => { const x = it.k === 'e' && st.excl.has(it.i); if (x && s0 < 0) s0 = i; if ((!x || i === n - 1) && s0 >= 0) { const e1 = x ? i + 1 : i; h += L === 'c' ? `<i class="x" style="left:${pos(s0)}%;width:${pos(e1) - pos(s0)}%"></i>` : `<i class="x" style="top:${pos(s0)}%;height:${Math.max(.6, pos(e1) - pos(s0))}%"></i>`; s0 = -1; } });
    items.forEach((it, i) => { if (it.k === 'c') h += L === 'c' ? `<i class="c" style="left:${pos(i)}%"></i>` : `<i class="c" style="top:${pos(i)}%"></i>`; });
    const li = items.findIndex((it) => it.k === 'e' && it.i === lv);
    if (li >= 0) h += L === 'c' ? `<i class="l" style="left:${pos(li)}%" title="Level 73">L</i>` : `<i class="l" style="top:${pos(li)}%" title="Level 73">L</i>`;
    if (L === 'c') {
      const [hh, mm] = sess.time.split(':').map(Number), start = hh * 60 + mm, dur = 144;
      for (let m = Math.ceil(start / 30) * 30; m < start + dur; m += 30) { const p = ((m - start) / dur) * 100, t = `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; h = `<span class="tick" style="left:${p}%"><b>${t}</b></span>` + h; }
      tlEl.innerHTML = h + '<span class="win"></span>';
    } else if (mapEl) mapEl.innerHTML = h + '<span class="thumb"></span>';
    thumb();
  }
  function thumb() {
    const H = logEl.scrollHeight || 1, a = logEl.scrollTop / H, b = (logEl.scrollTop + logEl.clientHeight) / H;
    const t = L === 'c' ? tlEl && tlEl.querySelector('.win') : mapEl && mapEl.querySelector('.thumb');
    if (!t) return;
    if (L === 'c') { t.style.left = a * 100 + '%'; t.style.width = Math.max(1.5, (b - a) * 100) + '%'; } else { t.style.top = a * 100 + '%'; t.style.height = Math.max(3, (b - a) * 100) + '%'; }
  }
  logEl.addEventListener('scroll', () => { thumb(); if (L === 'c') renderChip(); });
  const strip = L === 'c' ? tlEl : mapEl;
  if (strip) strip.addEventListener('pointerdown', (e) => {
    const r = strip.getBoundingClientRect(), f = (ev) => Math.max(0, Math.min(1, L === 'c' ? (ev.clientX - r.left) / r.width : (ev.clientY - r.top) / r.height));
    const go = (ev) => { logEl.scrollTop = f(ev) * logEl.scrollHeight - logEl.clientHeight / 2; };
    go(e); strip.setPointerCapture(e.pointerId);
    const mv = (ev) => go(ev), up = () => { strip.removeEventListener('pointermove', mv); strip.removeEventListener('pointerup', up); const i = Math.round(f(e) * (items.length - 1)); };
    strip.addEventListener('pointermove', mv); strip.addEventListener('pointerup', up);
  });

  /* ---------------------------------------------------------- selection: mouse */
  let drag = null;
  logEl.addEventListener('pointerdown', (e) => {
    const row = e.target.closest('.er'); if (!row || e.button !== 0 || e.target.closest('.exp-inline')) return;
    logEl.focus({ preventScroll: true }); st.zone = 'log'; ex.classList.remove('z-panel');
    const i = +row.dataset.i;
    if (e.shiftKey) { if (st.anchor === null) st.anchor = st.cursor; st.cursor = i; marks(false); return; }
    st.anchor = null; st.cursor = i; marks(false);
    drag = { from: i, id: e.pointerId, moved: false };
  });
  logEl.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const el = document.elementFromPoint(e.clientX, Math.max(logEl.getBoundingClientRect().top + 2, Math.min(logEl.getBoundingClientRect().bottom - 2, e.clientY)));
    const row = el && el.closest && el.closest('.er'); if (!row) return;
    const i = +row.dataset.i; if (i === drag.from && !drag.moved) return;
    drag.moved = true; st.anchor = drag.from; st.cursor = i; marks(false);
    const r = logEl.getBoundingClientRect(); if (e.clientY < r.top + 10) logEl.scrollTop -= 21; else if (e.clientY > r.bottom - 10) logEl.scrollTop += 21;
  });
  addEventListener('pointerup', () => { drag = null; });

  /* ---------------------------------------------------------- actions */
  function act(a) {
    if (st.input && a !== 'export') return;
    const t = target(), ci = curComment();
    switch (a) {
      case 'exclude': {
        if (!t) return;
        const inc = allExcl(); for (let e = t[0]; e <= t[1]; e++) inc ? st.excl.delete(e) : st.excl.add(e);
        const n = t[1] - t[0] + 1; renderLog(); return flash(`${inc ? 'Included' : 'Excluded'} ${plural(n, 'line')}.`);
      }
      case 'comment': {
        const a2 = st.anchor === null ? st.cursor : Math.min(st.anchor, st.cursor), it = items[a2];
        const before = it.k === 'e' ? it.i : it.k === 'c' ? st.comments[it.i].before : st.entries.length;
        return input('comment', '', (text) => { const v = text.replace(/\s+/g, ' ').trim(); if (!v) return; st.comments.push({ before, text: v }); st.anchor = null; renderLog(); const ni = items.findIndex((x) => x.k === 'c' && x.i === st.comments.length - 1); st.cursor = ni; marks(); }, { at: a2 });
      }
      case 'edit':
        if (ci < 0) return;
        return input('comment', st.comments[ci].text, (text) => { const v = text.replace(/\s+/g, ' ').trim(); if (!v) { st.comments.splice(ci, 1); renderLog(); flash('Comment deleted.'); return; } st.comments[ci].text = v; renderLog(); }, { at: st.cursor, edit: true });
      case 'delete':
        if (ci < 0) return;
        st.comments.splice(ci, 1); st.anchor = null; renderLog(); return flash('Comment deleted.');
      case 'title':
        return input('title', title() === defTitle ? defTitle : st.title, (text) => { const v = text.replace(/\s+/g, ' ').trim(); st.title = v === defTitle ? '' : v; renderSide(); flash(v ? `Title: ${title()}` : 'The default title.'); });
      case 'html': case 'text': return doExport(a);
      case 'export': return drawer('export');
    }
  }
  function doExport(f) {
    if (st.fail) return flash('Export failed: the browser blocked the download.', 'fail', 4000);
    if (f === 'html') { flash('Building the replay…', '', 900); setTimeout(() => { st.last = 'html'; renderSide(); flash(`Exported ${fname('html')}`); }, WC.dur(900)); }
    else { st.last = 'text'; renderSide(); flash(`Exported ${fname('text')}`); }
  }
  ex.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b && !b.disabled && !b.classList.contains('exp-ghost')) act(b.dataset.a); });

  /* ---------------------------------------------------------- the input (A dialog, B inline, C drawer) */
  function composer(kind, initial, opts) {
    const isC = kind === 'comment', max = isC ? COMMENT_MAX : TITLE_MAX;
    const el = WC.el('div', { class: 'exp-comp' }, `
      <label class="lbl">${isC ? (opts.edit ? 'Edit comment' : 'Add comment') : 'Export title'}</label>
      ${isC ? `<textarea class="field" maxlength="${max}" spellcheck="true" placeholder="What happened here…"></textarea>` : `<input class="field mono" maxlength="${max}" spellcheck="false">`}
      <div class="cnt"><span class="hint"></span><span class="n"></span></div>
      ${isC ? '<div class="pv"></div><p class="hold"></p>' : '<p class="file"></p>'}
      <div class="btnrow"><button class="ibtn small" data-c="cancel"><span>Cancel</span></button><button class="ibtn small primary" data-c="save"><span>Save</span></button></div>`);
    const f = el.querySelector('.field'); f.value = initial;
    const upd = () => {
      const v = f.value, c = v.replace(/\s+/g, ' ').trim();
      el.querySelector('.n').textContent = `${isC ? c.length : v.length} / ${max}`;
      el.querySelector('.cnt').classList.toggle('full', (isC ? c.length : v.length) >= max);
      if (isC) {
        const pv = el.querySelector('.pv');
        if (c) { pv.classList.remove('empty'); pv.textContent = commentLines(c).join('\n'); el.querySelector('.hold').textContent = `Holds the replay for ${holdS(c)} s.`; }
        else { pv.classList.add('empty'); pv.textContent = opts.edit ? 'An empty comment is deleted.' : 'Type the comment.'; el.querySelector('.hold').textContent = ''; }
      } else {
        el.querySelector('.file').innerHTML = c ? `File: <b>${esc(c)}.${st.last === 'html' ? 'html' : 'txt'}</b>` : 'Empty: the default title.';
      }
    };
    f.addEventListener('input', () => { if (isC && f.value.includes('\n')) f.value = f.value.replace(/\r\n|[\r\n\t]/g, ' '); upd(); });
    f.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); opts.save(f.value); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); opts.cancel(); }
      else if (e.ctrlKey && e.key.toLowerCase() === 'u') { e.preventDefault(); f.value = ''; upd(); }
    });
    el.querySelector('[data-c="save"]').onclick = () => opts.save(f.value);
    el.querySelector('[data-c="cancel"]').onclick = () => opts.cancel();
    upd();
    setTimeout(() => { f.focus(); if (isC) f.setSelectionRange(f.value.length, f.value.length); else f.select(); }, 60);
    return el;
  }
  function input(kind, initial, onSave, where = {}) {
    if (st.input) return;
    const close = () => { const i = st.input; st.input = null; if (i && i.cleanup) i.cleanup(); renderSide(); renderChip(); logEl.focus({ preventScroll: true }); };
    const save = (v) => { close(); onSave(v); };
    if (L === 'a' || (L === 'b' && kind === 'export')) {
      const veil = WC.el('div', { class: 'dlg-veil', role: 'dialog', 'aria-modal': 'true' }, `<section class="lp dlg exp-dlg" data-hood="${kind === 'comment' ? (where.edit ? 'Edit comment' : 'Add comment') : 'Export title'}"><div class="win"></div></section>`);
      document.body.append(veil); WC.decorate(veil); requestAnimationFrame(() => veil.classList.add('show'));
      const c = composer(kind, initial, { ...where, save, cancel: close });
      c.querySelector('.lbl').remove();
      veil.querySelector('.win').append(c);
      const pop = WC.keys.push({ key: (e) => { if (e.key === 'Escape') { close(); return true; } return true; } });
      st.input = { kind, cleanup: () => { pop(); veil.classList.remove('show'); setTimeout(() => veil.remove(), 260); } };
    } else if (L === 'b') {
      if (kind === 'title') {
        const file = $('.exp-file');
        file.innerHTML = '<label class="lbl">File</label>';
        const c = composer('title', initial, { save, cancel: close });
        const fld = c.querySelector('.field'); fld.style.flex = '1';
        const hint = WC.el('span', { class: 'hint' }); const fileP = c.querySelector('.file'); hint.append(...fileP.childNodes);
        fld.addEventListener('input', () => { hint.innerHTML = c.querySelector('.file').innerHTML; });
        file.append(fld, hint, c.querySelector('[data-c="save"]'), c.querySelector('[data-c="cancel"]'));
        c.querySelector('.file') && (hint.innerHTML = c.querySelector('.file').innerHTML);
        st.input = { kind, cleanup: () => {} };
        renderSide();
      } else {
        const wrap = WC.el('div', { class: 'exp-inline' });
        wrap.append(composer(kind, initial, { ...where, save, cancel: close }));
        st.input = { kind, inline: wrap, at: where.at, edit: where.edit, cleanup: () => { wrap.remove(); renderLog(); } };
        placeInline();
      }
    } else {
      st.input = { kind, cleanup: () => { $('.exp-drawer').classList.remove('open'); } };
      drawer(kind, composer(kind, initial, { ...where, save, cancel: close }));
    }
    renderChip();
  }
  function placeInline() {
    const i = st.input, row = logEl.querySelector(`.er[data-i="${i.at}"]`);
    if (!row) return;
    if (i.edit) { row.hidden = true; row.after(i.inline); } else row.before(i.inline);
    i.inline.scrollIntoView({ block: 'nearest' });
  }
  function drawer(kind, content) {
    const d = $('.exp-drawer'); if (!d) return;
    if (kind === 'export') {
      if (!st.input) st.input = { kind: 'export', cleanup: () => d.classList.remove('open') };
      d.innerHTML = `<button class="ibtn small icon x" data-dx aria-label="Close">${IC.x}</button><h3 class="h-page">Export</h3>
        <div class="exp-comp"><label class="lbl">Title</label><p class="exp-ttl" style="margin:0 0 4px">${esc(title())}</p></div>
        <div class="outs"><button class="out" data-o="html">${IC.bigHtml}<b><u class="sk">H</u>TML replay</b>${st.last === 'html' ? '<em>last</em>' : ''}<span>A page with the player, the map and the comments.</span></button>
        <button class="out" data-o="text">${IC.bigTxt}<b><u class="sk">P</u>lain text</b>${st.last === 'text' ? '<em>last</em>' : ''}<span>The log as a .txt file, without the excluded lines.</span></button></div>`;
      d.querySelectorAll('[data-o]').forEach((b) => (b.onclick = () => doExport(b.dataset.o)));
      d.querySelector('[data-dx]').onclick = () => { const i = st.input; st.input = null; i && i.cleanup(); renderChip(); logEl.focus(); };
    } else {
      d.innerHTML = `<h3 class="h-page">${kind === 'comment' ? 'Comment' : 'Title'}</h3>`;
      d.append(content);
    }
    d.classList.add('open');
  }

  /* ---------------------------------------------------------- keys */
  function move(to, ext) { if (ext) { if (st.anchor === null) st.anchor = st.cursor; } else st.anchor = null; st.cursor = Math.max(0, Math.min(items.length - 1, to)); marks(); }
  const page = () => Math.max(1, Math.floor(logEl.clientHeight / 21) - 2);
  const layer = {
    key(e) {
      if (o.active && !o.active()) return false;
      const k = e.key, plain = !e.ctrlKey && !e.altKey && !e.metaKey;
      if (st.input) { if (k === 'Escape' && st.input.kind === 'export') { const i = st.input; st.input = null; i.cleanup(); renderChip(); return true; } if (st.input.kind === 'export' && plain && (k === 'h' || k === 'p')) { doExport(k === 'h' ? 'html' : 'text'); return true; } return k === 'Escape'; }
      if (k === 'Escape') { if (st.anchor !== null) { st.anchor = null; marks(); return true; } if (o.onBack) o.onBack(); return true; }
      if (k === 'Tab' && L === 'a') { st.zone = st.zone === 'log' ? 'panel' : 'log'; ex.classList.toggle('z-panel', st.zone === 'panel'); if (st.zone === 'panel') { const b = ex.querySelector('.exp-panel .ibtn:not([disabled]):not(.exp-ghost)'); b && b.focus(); } else logEl.focus(); return true; }
      if (st.zone === 'panel' && (k === 'ArrowUp' || k === 'ArrowDown')) { const bs = [...ex.querySelectorAll('.exp-panel .ibtn:not([disabled]):not(.exp-ghost)')]; const i = bs.indexOf(document.activeElement); const n = bs[Math.max(0, Math.min(bs.length - 1, i + (k === 'ArrowDown' ? 1 : -1)))]; n && n.focus(); return true; }
      if (st.zone === 'panel' && k === 'Enter') return false;
      if (plain && k.length === 1) {
        const m = { x: 'exclude', i: 'exclude', c: 'comment', e: 'edit', d: 'delete', t: 'title', h: 'html', p: 'text' }[k.toLowerCase()];
        if (m) { if (k.toLowerCase() === 'i' && !allExcl()) return true; act(m); return true; }
      }
      if (k === 'Delete' && plain) { act('delete'); return true; }
      if (k === 'ArrowDown') { move(st.cursor + 1, e.shiftKey); return true; } if (k === 'ArrowUp') { move(st.cursor - 1, e.shiftKey); return true; }
      if (k === 'PageDown') { move(st.cursor + page(), e.shiftKey); return true; } if (k === 'PageUp') { move(st.cursor - page(), e.shiftKey); return true; }
      if (k === 'Home') { move(0, e.shiftKey); return true; } if (k === 'End') { move(items.length - 1, e.shiftKey); return true; }
      if (k === 'Enter') { if (curComment() >= 0) act('edit'); return true; }
      return false;
    },
    back() { if (st.anchor !== null) { st.anchor = null; marks(); return; } if (o.onBack) o.onBack(); },
  };

  renderLog();
  const api = {
    el: ex, layer, st,
    show() { renderLog(); setTimeout(() => { logEl.focus({ preventScroll: true }); thumb(); renderChip(); }, 40); },
    demo(x) {
      if (x === 'select') { const a = find(/You attack the large hill troll/); const ia = items.findIndex((it) => it.k === 'e' && it.i === a); st.anchor = ia; st.cursor = ia + 4; marks(); }
      if (x === 'comment') { const c = items.findIndex((it) => it.k === 'c'); st.cursor = c; st.anchor = null; marks(); }
      if (x === 'excluded') { const e1 = items.findIndex((it) => it.k === 'e' && st.excl.has(it.i)); st.anchor = e1; st.cursor = e1 + 3; marks(); }
      if (x === 'add') { act('comment'); }
      if (x === 'edit') { const c = items.findIndex((it) => it.k === 'c'); st.cursor = c; st.anchor = null; marks(); act('edit'); }
      if (x === 'title') act('title');
      if (x === 'export') act(L === 'c' ? 'export' : 'html');
      if (x === 'fail') { st.fail = !st.fail; flash(st.fail ? 'The next export fails (mockup switch).' : 'Exports work again.'); }
    },
  };
  return api;
}

/* ---------------------------------------------------------- the page: start menu → History → Export */
function start(layout) {
  SHELL.start({ onHistory: () => openHistory() });
  WC.decorate();
  const bigH = SHELL.big({ hood: 'History', id: 'histBox' });
  const H = HISTORY.mount(bigH.win);
  const bigE = SHELL.big({ hood: 'Export', id: 'expBox' });
  let E = null;
  const phone = () => matchMedia('(max-width: 760px)').matches;
  function openExport(instant, sess) {
    bigE.win.innerHTML = '';
    const state = qs.has('loading') ? 'loading' : qs.has('failed') ? 'failed' : null;
    E = mount(bigE.win, { layout, session: sess, state, onBack: () => bigE.close() });
    bigE.open({ instant, layer: E.layer });
    E.show && E.show();
    return E;
  }
  function sessFromHistory() {
    const row = bigH.win.querySelector('.hist-rows .row.on'); if (!row) return undefined;
    const c = row.querySelector('.h-char').textContent.trim(), d = row.querySelector('.h-date').textContent.trim(), t = row.querySelector('.h-time').textContent.trim();
    const lvl = (bigH.win.querySelector('.hc-name small') || {}).textContent || 'Level 72';
    return { character: c, level: +lvl.replace(/\D/g, '') || 72, date: d, time: t, lines: 41000 + (c.length * 7919) % 30000 };
  }
  const tryExport = () => {
    const b = bigH.win.querySelector('.hist-card [data-a="export"]');
    if (b && b.disabled) return false;
    if (phone()) return false;   // History says "Export: desktop only."
    openExport(false, sessFromHistory()); return true;
  };
  bigH.win.addEventListener('click', (e) => { const b = e.target.closest('[data-a="export"]'); if (b && !b.disabled && !phone()) { e.stopPropagation(); openExport(false, sessFromHistory()); } }, true);
  const layerH = { key: (e) => { if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'x' && tryExport()) return true; return H.layer.key(e); }, back: () => bigH.close() };
  function openHistory(instant) { H.onShow(); bigH.open({ instant, layer: layerH }); }
  const dm = WC.demoExtra(`<div class="row2">Show <button data-d="select">Selection</button><button data-d="comment">On a comment</button><button data-d="excluded">Excluded</button></div>
    <div class="row2">Input <button data-d="add">Add comment</button><button data-d="edit">Edit comment</button><button data-d="title">Title</button><button data-d="export">Export</button><button data-d="fail">Export fails</button></div>`);
  dm.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => { if (E && bigE.shown) E.demo(b.dataset.d); }));
  const pg = qs.get('page');
  if (pg === 'history' || pg === 'export') openHistory(true);
  if (pg === 'export') {
    setTimeout(() => {
      openExport(true, { character: 'Rasta', level: 72, date: '2026-09-25', time: '22:03', lines: 70098 });
      if (qs.get('demo2')) setTimeout(() => qs.get('demo2').split(',').forEach((x) => E.demo(x)), 120);
    }, 30);
  }
}
window.EXP = { mount, start };
})();
