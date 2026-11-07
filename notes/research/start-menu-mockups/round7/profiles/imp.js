/* Round 7 · profiles · Import, shared by import-a/b/c.html (throwaway mockup code).
   Real content from chrome/frames/import-load.ts, import-report.tsx and src/import (ADR 0073, 0076): the
   formats (TinTin++, JMC, Powwow, Mudlet), the detection signals, the counts, the file-wide warnings, the
   missing #read files, the items grouped Kept / Skipped / Warnings with file:line, reason and source, the
   short form for a native profile that needed no change, EDIT and OK (Esc = OK), the list's flashes
   ("Imported "gibur" from gibur.set.", "Import failed: …").
   The native file picker cannot be shown: Import "picks" the sample chosen in DEMO (or ?imp=jmc|mudlet|tintin|fail).
   IMP.start(layout) wires the page. */
(() => {
'use strict';
const qs = WC.qs, esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
let sample = qs.get('imp') || 'jmc';
const R = () => PDATA.imports[sample];
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const CHECK = '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="13"/><path d="M10 16.5l4.2 4.2L22.5 12"/></svg>';
const DROP = '<svg class="big" viewBox="0 0 36 36"><path d="M18 5v18M11 16l7 7 7-7"/><path d="M5 24v5a2 2 0 0 0 2 2h22a2 2 0 0 0 2-2v-5"/></svg>';
const IC = { edit: '<svg viewBox="0 0 16 16"><path d="M10.5 2.5l3 3-8 8H2.5v-3z"/></svg>', ok: '<svg viewBox="0 0 16 16"><path d="M3 8.5l3.2 3.2L13 4.8"/></svg>', open: '<svg viewBox="0 0 16 16"><path d="M2.5 4.5h4l1.5 1.5h5.5v6.5h-11z"/></svg>' };

function groups(r) {
  return [
    { id: 'kept', title: 'Kept', long: 'Kept as #nop', items: r.items.filter((i) => i.outcome === 'kept') },
    { id: 'skipped', title: 'Skipped', long: 'Skipped', items: r.items.filter((i) => i.outcome === 'skipped') },
    { id: 'warn', title: 'Warnings', long: 'Translated with a warning', items: r.items.filter((i) => i.outcome === 'translated' && i.warning) },
  ].filter((g) => g.items.length);
}
const why = (it) => `${esc(it.reason || it.outcome)}${it.warning ? `; <span class="w">${esc(it.warning)}</span>` : ''}`;
const src1 = (s) => { const l = s.split('\n').find((x) => x.trim()) || ''; return esc(l.trim()) + (s.trim().includes('\n') ? ' …' : ''); };
function headHtml(r, { counts = true, notes = true } = {}) {
  const from = r.files.length > 1 ? `from <b>${r.entry}</b> and ${plural(r.chosen.length - 1, 'more file')}` : `from <b>${r.chosen[0]}</b>`;
  let h = `<div class="imp-who"><span class="imp-name">${r.name}</span><span class="imp-from">${r.unchanged ? 'a new profile ' : 'a new profile '}${from}</span></div>`;
  h += `<div class="imp-fmt"><span class="f">${r.formatName}</span>${r.signals.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div>`;
  if (r.unchanged) return h;
  if (counts) h += `<div class="imp-counts"><div><b>${r.counts.translated}</b><span>Translated</span></div><div><b>${r.counts.kept}</b><span>Kept</span></div><div><b>${r.counts.skipped}</b><span>Skipped</span></div><div class="warn"><b>${r.counts.warnings}</b><span>Warnings</span></div></div>`;
  if (notes && (r.fileWarnings.length || r.missingFiles.length)) h += `<ul class="imp-notes">${r.fileWarnings.map((w) => `<li>${esc(w)}</li>`).join('')}${r.missingFiles.length ? `<li class="miss">Missing files: <span class="mono">${r.missingFiles.join(', ')}</span></li>` : ''}</ul>`;
  return h;
}
const unchangedHtml = (r) => `<div class="imp-ok">${CHECK}<span>${r.formatName}, ${r.lines} lines, nothing changed.<br><span class="muted" style="font-style:italic;font-size:16px">A WebCockpit profile as it is: every setting kept as written.</span></span></div>`;
function listHtml(r) {
  const gs = groups(r);
  if (!gs.length) return '<p class="imp-fine">Every setting was translated as it was.</p>';
  return gs.map((g) => `<div class="imp-grp">${g.title}<small>${g.items.length}</small></div>` + g.items.map((it) => `<div class="imp-it"><span class="at">${it.file}:${it.line}</span><span class="why">${why(it)}</span><span class="src">${src1(it.source)}</span></div>`).join('')).join('');
}
const footBtns = () => `<button class="ibtn" data-a="edit">${IC.edit}<span><u class="sk">E</u>dit</span></button><button class="ibtn primary" data-a="ok">${IC.ok}<span><u class="sk">O</u>K</span></button>`;

function demo(onPick) {
  const d = WC.demoExtra(`<div class="row2">Import <button data-s="jmc">JMC</button><button data-s="mudlet">Mudlet</button><button data-s="tintin">TinTin++</button><button data-s="fail">Error</button></div>`);
  const mark = () => d.querySelectorAll('[data-s]').forEach((b) => b.classList.toggle('on', b.dataset.s === sample));
  d.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => { sample = b.dataset.s; mark(); if (onPick) onPick(); }));
  mark();
}

function start(layout) {
  const list = SHELL.list({ onImport: () => onImport() });
  SHELL.start({ onProfile: () => list.show() });
  WC.decorate();
  const done = (r) => { list.add(r.name); setTimeout(() => list.flash(`Imported "${r.name}" from ${r.entry}.`), WC.dur(300)); };
  const editFlash = (fl, r) => WC.flash(fl, `The profile editor opens on ${r.name} — see the editor mockups`, { ms: 2600 });
  let onImport, reopen;

  if (layout === 'a') {
    const box = SHELL.normal({ hood: 'Import report', id: 'impA', tall: true });
    const show = (instant) => {
      const r = R();
      box.win.innerHTML = `<div class="imp imp-a"><div class="box-head imp-head">${headHtml(r)}</div>${r.unchanged ? unchangedHtml(r) : `<div class="box-body">${listHtml(r)}</div>`}<div class="box-foot imp-foot"><span class="flash"></span>${footBtns()}</div></div>`;
      const body = box.win.querySelector('.box-body'), fl = box.win.querySelector('.flash');
      const ok = () => { box.close(); done(r); };
      box.win.querySelector('[data-a="ok"]').onclick = ok; box.win.querySelector('[data-a="edit"]').onclick = () => editFlash(fl, r);
      box.open({ instant, layer: { key(e) {
        const sc = (y) => { if (body) body.scrollTop += y; return true; };
        if (e.key === 'ArrowDown') return sc(44); if (e.key === 'ArrowUp') return sc(-44);
        if (e.key === 'PageDown') return sc(body ? body.clientHeight - 40 : 0); if (e.key === 'PageUp') return sc(body ? -(body.clientHeight - 40) : 0);
        if (e.key === 'Home') return sc(-1e6); if (e.key === 'End') return sc(1e6);
        if (e.key === 'Enter') { ok(); return true; }
        return WC.shortcut(e, { e: () => editFlash(fl, r), o: ok });
      }, back: ok } });
    };
    onImport = () => {
      if (sample === 'fail') return list.flash(`Import failed: ${R().error}`, 'fail');
      list.flash(`Reading ${R().chosen.join(', ')}…`);
      setTimeout(() => show(false), WC.dur(700));
    };
    reopen = () => { if (box.shown) { box.close(); } if (sample !== 'fail') show(true); else list.flash(`Import failed: ${R().error}`, 'fail'); };
  }

  if (layout === 'b') {
    const big = SHELL.big({ hood: 'Import report' });
    let st = null;
    const render = () => {
      const r = R(), gs = groups(r);
      st = { r, gs, tab: 0, row: 0 };
      const files = r.chosen.map((f) => { const added = r.fileWarnings.some((w) => w.startsWith(f) && /added at the end/.test(w)); return `<li class="${added ? 'added' : ''}"><i>${added ? '+' : '✓'}</i>${f}<em>${f === r.entry ? 'the main file' : added ? 'added at the end' : 'read by #read'}</em></li>`; }).join('')
        + r.missingFiles.map((f) => `<li class="miss"><i>✕</i>${f}<em>missing (#read)</em></li>`).join('');
      const c = r.counts, tot = c.translated + c.kept + c.skipped || 1;
      big.win.innerHTML = `<div class="imp imp-b">
        <aside class="imp-side">${headHtml(r, { counts: false, notes: false })}
          <h3 class="h-sec">Files</h3><ul class="imp-files">${files}</ul>
          ${r.unchanged ? '' : `<h3 class="h-sec">Settings</h3><div class="imp-bar"><i class="t" style="width:${(c.translated / tot) * 100}%"></i><i class="k" style="width:${(c.kept / tot) * 100}%"></i><i class="s" style="width:${(c.skipped / tot) * 100}%"></i></div>
          <div class="imp-legend"><i class="t" style="background:color-mix(in srgb,var(--c-ok) 70%,transparent)"></i><span>Translated</span><b>${c.translated}</b><i style="background:color-mix(in srgb,var(--c-accent) 75%,transparent)"></i><span>Kept as #nop</span><b>${c.kept}</b><i style="background:color-mix(in srgb,var(--c-dim) 70%,transparent)"></i><span>Skipped</span><b>${c.skipped}</b><i style="background:none;border:1px solid var(--c-accent)"></i><span>Warnings</span><b class="gold">${c.warnings}</b></div>`}
          ${r.fileWarnings.length ? `<h3 class="h-sec">For the whole profile</h3><ul class="imp-notes">${r.fileWarnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
        </aside>
        <section class="imp-main">${r.unchanged ? unchangedHtml(r) : gs.length ? `
          <div class="tabs" role="tablist">${gs.map((g, i) => `<button role="tab" data-t="${i}" aria-selected="${i === 0}"><span class="lg">${g.long}</span><span class="sh">${g.title}</span><span class="n">${g.items.length}</span></button>`).join('')}</div>
          <div class="tbl"><div class="th-row"><span class="th">File</span><span class="th r">Line</span><span class="th why">Why</span></div></div>
          <div class="box-body"><div class="tbl"><div class="rows flat" role="listbox"></div></div></div>
          <div class="imp-src"><label class="lbl">Source</label><div class="code"><pre class="code-src"></pre></div><p class="note"></p></div>` : '<p class="imp-fine">Every setting was translated as it was.</p>'}
        </section>
        <div class="box-foot imp-foot"><span class="flash"></span>${footBtns()}</div></div>`;
      big.win.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => tab(+b.dataset.t));
      big.win.querySelector('[data-a="ok"]').onclick = ok; big.win.querySelector('[data-a="edit"]').onclick = () => editFlash(big.win.querySelector('.flash'), r);
      if (gs.length && !r.unchanged) tab(0);
    };
    const rowsEl = () => big.win.querySelector('.imp-b .rows');
    let lst = null;
    function tab(i) {
      st.tab = Math.max(0, Math.min(st.gs.length - 1, i));
      big.win.querySelectorAll('[data-t]').forEach((b) => b.setAttribute('aria-selected', +b.dataset.t === st.tab));
      const g = st.gs[st.tab];
      rowsEl().innerHTML = g.items.map((it) => `<div class="row" role="option"><span class="td mono">${it.file}</span><span class="td mono r">${it.line}</span><span class="td why">${why(it)}</span></div>`).join('');
      if (!lst) lst = WC.list(rowsEl(), { onChange: (k) => source(k), activateOn: 'click' }); else lst.refresh();
      lst.set(0, true); source(0);
    }
    function source(k) {
      const it = st.gs[st.tab].items[k]; if (!it) return;
      big.win.querySelector('.imp-src .code-src').innerHTML = PEDLIB ? PEDLIB.hlTT(it.source).map((l) => `<span class="code-line">${l || ' '}</span>`).join('') : esc(it.source);
      big.win.querySelector('.imp-src .note').innerHTML = `<b>${it.file}:${it.line}</b> · ${why(it)}${it.outcome === 'kept' ? ' — kept in the profile as #nop, so nothing is lost.' : ''}`;
    }
    const ok = () => { big.close(); big.onClose = null; done(st.r); };
    const layer = { key(e) {
      if (st.r.unchanged || !st.gs.length) return WC.shortcut(e, { e: () => editFlash(big.win.querySelector('.flash'), st.r), o: ok }) || (e.key === 'Enter' && (ok(), true));
      if (e.key === 'ArrowLeft') { tab(st.tab - 1); return true; } if (e.key === 'ArrowRight') { tab(st.tab + 1); return true; }
      if (lst && ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) return lst.key(e);
      if (e.key === 'Enter') { ok(); return true; }
      return WC.shortcut(e, { e: () => editFlash(big.win.querySelector('.flash'), st.r), o: ok });
    }, back: ok };
    const show = (instant) => { lst = null; render(); big.open({ instant, layer }); };
    onImport = () => {
      if (sample === 'fail') return list.flash(`Import failed: ${R().error}`, 'fail');
      list.flash(`Reading ${R().chosen.join(', ')}…`);
      setTimeout(() => show(false), WC.dur(700));
    };
    reopen = () => { if (big.shown) { lst = null; render(); if (sample === 'fail') { big.close(); list.flash(`Import failed: ${R().error}`, 'fail'); } } else if (sample !== 'fail') show(true); else list.flash(`Import failed: ${R().error}`, 'fail'); };
  }

  if (layout === 'c') {
    const box = SHELL.normal({ hood: 'Import', id: 'impC' });
    let stage = 'pick', r = null;
    const fmts = `<div class="imp-fmts">
        <div><b>TinTin++</b><span>.tin .tt .txt</span><em>and WebCockpit profiles</em></div>
        <div><b>JMC</b><span>.set</span><em>with the files it #reads</em></div>
        <div><b>Powwow</b><span>.pow .txt</span><em>definitions file</em></div>
        <div><b>Mudlet</b><span>.xml .mpackage .zip</span><em>profile saves, packages</em></div></div>`;
    const render = () => {
      box.el.classList.toggle('tall', stage === 'report');
      if (stage === 'pick' || stage === 'error') {
        box.win.innerHTML = `<div class="imp imp-c">
          <p class="lead">Settings from another client become a new profile. Choose the main file together with the files it #reads.</p>
          <div class="imp-drop" tabindex="-1">${DROP}<p>Drop the files here</p><button class="ibtn primary" data-a="choose">${IC.open}<span><u class="sk">C</u>hoose files…</span></button></div>
          ${stage === 'error' ? `<div class="imp-err"><p>Import failed: ${esc(R().error)}</p><span class="mono">${R().chosen.join(', ')}</span></div>` : fmts}
        </div>`;
        const drop = box.win.querySelector('.imp-drop');
        box.win.querySelector('[data-a="choose"]').onclick = choose;
        drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
        drop.addEventListener('dragleave', () => drop.classList.remove('over'));
        drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); choose(); });
      } else if (stage === 'reading') {
        box.win.innerHTML = `<div class="imp imp-c"><div class="imp-reading"><p>Reading ${R().chosen.map((f) => `<span class="mono" style="font-style:normal;font-size:13.5px">${f}</span>`).join(', ')}…</p><div class="bar"><i></i></div></div></div>`;
      } else {
        const gs = groups(r);
        const sum = r.unchanged ? '' : `<p class="imp-sum"><b>${r.counts.translated}</b> settings were translated, <b>${r.counts.kept}</b> kept as #nop, <b>${r.counts.skipped}</b> skipped${r.counts.warnings ? `, and <b>${r.counts.warnings}</b> need a look` : ''}.</p>`;
        box.win.innerHTML = `<div class="imp imp-c"><div class="box-head">${headHtml(r, { counts: false })}</div>
          <div class="box-body" style="margin-top:12px;padding-right:6px">${r.unchanged ? unchangedHtml(r) : sum + `<div class="imp-acc">${gs.map((g, i) => `<details${i === 0 ? ' open' : ''}><summary>${g.long}<span class="d"></span><span class="n">${g.items.length}</span></summary><div class="inner">${g.items.map((it) => `<div class="imp-it"><span class="at">${it.file}:${it.line}</span><span class="why">${why(it)}</span><span class="src">${src1(it.source)}</span></div>`).join('')}</div></details>`).join('') || '<p class="imp-fine">Every setting was translated as it was.</p>'}</div>`}</div>
          <div class="box-foot imp-foot"><span class="flash"></span>${footBtns()}</div></div>`;
        box.win.querySelector('[data-a="ok"]').onclick = ok; box.win.querySelector('[data-a="edit"]').onclick = () => editFlash(box.win.querySelector('.flash'), r);
      }
    };
    function choose() {
      stage = 'reading'; render();
      setTimeout(() => { if (sample === 'fail') { stage = 'error'; render(); return; } r = R(); stage = 'report'; render(); }, WC.dur(900));
    }
    const ok = () => { box.close(); done(r); stage = 'pick'; };
    const layer = { key(e) {
      if (stage === 'pick' || stage === 'error') return WC.shortcut(e, { c: choose }) || (e.key === 'Enter' && (choose(), true));
      if (stage !== 'report') return true;
      const body = box.win.querySelector('.box-body'); const sc = (y) => { body.scrollTop += y; return true; };
      if (e.key === 'ArrowDown') return sc(44); if (e.key === 'ArrowUp') return sc(-44);
      if (e.key === 'PageDown') return sc(body.clientHeight - 40); if (e.key === 'PageUp') return sc(-(body.clientHeight - 40));
      if (e.key === 'Enter') { ok(); return true; }
      return WC.shortcut(e, { e: () => editFlash(box.win.querySelector('.flash'), r), o: ok });
    }, back: () => { if (stage === 'report') ok(); else { box.close(); stage = 'pick'; } } };
    onImport = () => { stage = 'pick'; render(); box.open({ layer }); };
    reopen = () => { if (!box.shown) { stage = 'pick'; render(); box.open({ instant: true, layer }); } if (qs.has('report') || stage === 'report' || stage === 'error') { if (sample === 'fail') { stage = 'error'; render(); } else { r = R(); stage = 'report'; render(); } } };
  }

  demo(() => reopen && (SHELL.listApi.shown ? reopen() : null));
  const page = qs.get('page');
  if (page === 'list' || page === 'report' || page === 'import') list.show(true);
  if (page === 'report' || page === 'import') {
    if (layout === 'c' && page === 'report') { qs.set('report', '1'); }
    reopen();
  }
}
window.IMP = { start };
})();
