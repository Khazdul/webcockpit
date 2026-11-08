/* Round 7 · Scripts group · the script editor's shared logic (needs common.js). Throwaway mockup code.
   SE.mount(root, host, L) runs the editor in a layout L made by a direction:
     L.code      the element for the code surface
     L.status    the status line (state, then the first problem) · L.pos  "Modified · Ln 12, Col 5"
     L.flash     a .flash element · L.findSlot  where the find panel goes · L.onDiags(list) optional
     buttons anywhere in root with data-act = save | find | manual | duplicate | back
   ?s=<script> (default rescue) · &new (the template NEW opens) · the DEMO panel shows the pop-ups. */
(() => {
'use strict';
const SE = (window.SE = {});
const { esc, h, I } = SC;
const SRC = { label: { syntax: 'Syntax error', header: 'Header', runtime: 'Runtime error (saved version)' } };
SE.diagText = (d) => `Ln ${d.line}: ${SRC.label[d.source]}: ${d.message}`;

SE.mount = (root, host, L) => {
  const lib = SC.lib;
  let s = lib.get(SC.qs.get('sc') || 'rescue') || lib.get('rescue');
  if (SC.qs.has('new') && !lib.get(SC.qs.get('sc'))) s = lib.create(SC.qs.get('sc') || 'myscript');
  const file = L.file;
  let saved = s.source || '', diags = [], flashT = null, pos = { line: 1, col: 1 }, ready = false;
  const ro = () => s.readonly;
  const say = (m, kind, ms = 3200) => { WC.flash(L.flash, m, { kind, ms }); };
  const ed = SC.editor(L.code, {
    text: saved, readOnly: ro(), sigPopup: L.sigPopup,
    onChange: () => paint(),
    onCursor: (p) => { pos = p; paint(); },
    onDiags: (ds) => { diags = ds; paint(); if (L.onDiags && ready) L.onDiags(ds, ed); },
    onSave: () => save(), onFind: (rep) => openFind(rep), onManual: (n) => manual(n), onEsc: () => back(), onTab: () => { const d = root.querySelector('[data-act="duplicate"]'); if (d) d.focus(); },
  });
  if (s.lastError) { const m = /^[\w-]+:(\d+): (.*)$/.exec(s.lastError); if (m) ed.setRuntime({ line: +m[1], message: m[2], source: 'runtime' }); }
  const dirty = () => !ro() && ed.text !== saved;
  ready = true;
  if (L.onDiags) L.onDiags(diags, ed);
  function paint() {
    if (!ready) return;
    const st = SC.state(s), d = diags.find((x) => x.source !== 'runtime') || diags[0];
    const prob = d ? SE.diagText(d) : (!dirty() && SC.problem(s)) || ((s.header.problems || [])[0] ? `Header ${s.header.problems[0]}` : '');
    if (L.status) L.status.innerHTML = `<span class="sc-st ${st.cls}"><i class="sc-dot ${st.dot}"></i>${st.text}</span>${prob ? `<span class="se-prob" title="${esc(prob)}">${esc(prob)}</span>` : ''}`;
    if (L.pos) L.pos.innerHTML = `${dirty() ? '<span class="se-mod">Modified</span><span class="se-sep">·</span>' : ''}Ln ${pos.line}, Col ${pos.col}`;
    root.querySelectorAll('[data-act="save"]').forEach((b) => { b.disabled = ro() || !dirty(); });
    root.classList.toggle('dirty', dirty());
    if (L.onPaint) L.onPaint({ s, dirty: dirty(), diags, pos, ed });
  }
  function save() {
    if (ro()) { say('Read-only: Duplicate makes your own copy.', 'fail'); return false; }
    saved = ed.text; s.source = saved;
    if (s.lastError) { s.lastError = null; s.running = host.game ? s.enabled : null; ed.setRuntime(null); }
    const live = diags.find((x) => x.source === 'syntax');
    say(live ? `Saved. ${SE.diagText(live)}` : s.enabled ? 'Saved. The script reloads.' : 'Saved. Turn it on in the list to run it.', live ? 'fail' : '', live ? 6000 : 3200);
    paint(); return true;
  }
  function duplicate() {
    const n = `${s.name}-copy`;
    host.go(`editor-${file}.html`, { sc: n, dup: s.name });
  }
  if (SC.qs.has('dup')) { // the copy DUPLICATE opened (in the app: a new editor in its place)
    const from = lib.get(SC.qs.get('dup'));
    if (from) { s = lib.create(SC.qs.get('sc')); s.source = from.source; s.header = { ...from.header, name: s.name }; saved = s.source; ed.ta.value = saved; ed.ta.readOnly = false; L.code.classList.remove('ro'); ed.render(); setTimeout(() => say(`Duplicated as ${s.name}. This copy is yours to edit.`), 300); }
  }
  const pageUrl = () => [`page-${file}.html`, { sc: s.name }];
  function leave() { host.go(...pageUrl()); }
  function back() {
    if (ed.closePop()) return true;
    if (findEl && !findEl.hidden) { closeFind(); return true; }
    if (dirty()) { confirmClose(); return true; }
    leave(); return true;
  }
  function confirmClose(then) {
    SC.dialog(root, {
      title: 'Unsaved changes',
      html: `<p class="q">Save changes to <b>${esc(s.name)}</b>?</p>`,
      buttons: [
        { label: 'Keep editing', run: (c) => { c(); ed.focus(); } },
        { label: '<u class="sk">N</u>o, discard', key: 'n', kind: 'danger', run: (c) => { c(); saved = ed.text; (then || leave)(); } },
        { label: '<u class="sk">Y</u>es, save', key: 'y', kind: 'primary', primary: true, icon: 'save', run: (c) => { const b = c; root.querySelector('.sc-dlg h2').textContent = 'Saving…'; setTimeout(() => { b(); save(); (then || leave)(); }, 350); } },
      ],
    });
  }
  SE.confirm = confirmClose;
  function manual(name) {
    const go = () => host.go(`manual-${file === 'b' ? 'b' : 'a'}.html`, { at: name || '', from: `editor-${file}`, sc: s.name });
    go();
  }
  // ---- find / replace
  let findEl = null;
  function buildFind() {
    findEl = h(`<div class="sc-find" role="search" hidden>
      <div class="fr"><label class="lbl" for="fq">Find</label><input class="field mono" id="fq" spellcheck="false" autocomplete="off" placeholder="text or pattern"><span class="cnt" id="fcnt"></span>
        <span class="seg" aria-label="Options"><button type="button" data-t="cs" aria-selected="false" title="Case (Alt+C)">Case</button><button type="button" data-t="word" aria-selected="false" title="Whole word (Alt+W)">Word</button><button type="button" data-t="re" aria-selected="false" title="Regex (Alt+R)">Regex</button></span>
        ${SC.btn('', { act: 'fprev', icon: 'up', small: true, cls: 'icon', title: 'Previous (Shift+Enter)' })}${SC.btn('', { act: 'fnext', icon: 'down', small: true, cls: 'icon', title: 'Next (Enter)' })}${SC.btn('', { act: 'fclose', icon: 'x', small: true, cls: 'icon', title: 'Close (Esc)' })}</div>
      <div class="fr" id="frep"><label class="lbl" for="fr">Replace</label><input class="field mono" id="fr" spellcheck="false" autocomplete="off" placeholder="with">${SC.btn('Replace', { act: 'frep1', small: true })}${SC.btn('All', { act: 'frepall', small: true })}<span class="sc-grow"></span></div></div>`);
    findEl.querySelectorAll('.ibtn.icon').forEach((b) => { b.style.width = '28px'; b.style.padding = '0'; });
    L.findSlot.append(findEl);
    if (ro()) findEl.querySelector('#frep').hidden = true;
    const fq = findEl.querySelector('#fq'), fr = findEl.querySelector('#fr'), cnt = findEl.querySelector('#fcnt');
    const show = (r) => { cnt.classList.toggle('bad', !!r.bad); cnt.textContent = r.bad ? 'Bad regex' : !fq.value ? '' : r.n ? `${r.at} of ${r.n}${r.n >= 1000 ? '+' : ''}` : 'No matches'; };
    const run = () => show(ed.find({ q: fq.value, rep: fr.value }));
    fq.addEventListener('input', run); fr.addEventListener('input', () => ed.find({ rep: fr.value }));
    findEl.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => { const on = b.getAttribute('aria-selected') !== 'true'; b.setAttribute('aria-selected', on); ed.find({ [b.dataset.t]: on }); run(); }));
    const keys = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFind(); return; }
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (e.target === fr && !e.shiftKey && (e.ctrlKey || e.altKey)) { ed.replace(true); run(); return; } if (e.target === fr) { ed.replace(false); run(); return; } show(ed.findStep(e.shiftKey ? -1 : 1)); return; }
      if (e.altKey && /^[cwr]$/i.test(e.key)) { e.preventDefault(); findEl.querySelector(`[data-t="${{ c: 'cs', w: 'word', r: 're' }[e.key.toLowerCase()]}"]`).click(); return; }
      if ((e.ctrlKey || e.metaKey) && /^[fh]$/i.test(e.key)) { e.preventDefault(); e.stopPropagation(); (e.key.toLowerCase() === 'h' && !ro() ? fr : fq).focus(); return; }
      if ((e.ctrlKey || e.metaKey) && /^s$/i.test(e.key)) { e.preventDefault(); e.stopPropagation(); save(); }
    };
    fq.addEventListener('keydown', keys); fr.addEventListener('keydown', keys);
    findEl.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act; if (a === 'fprev' || a === 'fnext') show(ed.findStep(a === 'fprev' ? -1 : 1)); else if (a === 'fclose') closeFind(); else if (a === 'frep1') { ed.replace(false); run(); } else if (a === 'frepall') { const n = ed.replace(true); say(`Replaced ${n}.`); run(); } });
    findEl._run = run;
  }
  function openFind(rep, q) {
    if (!findEl) buildFind();
    findEl.hidden = false; root.classList.add('finding');
    const fq = findEl.querySelector('#fq');
    const sel = ed.ta.value.slice(ed.ta.selectionStart, ed.ta.selectionEnd);
    if (q !== undefined) fq.value = q; else if (sel && !sel.includes('\n')) fq.value = sel;
    findEl._run();
    const f = rep && !ro() ? findEl.querySelector('#fr') : fq; f.focus(); f.select();
  }
  function closeFind() { if (!findEl) return; findEl.hidden = true; root.classList.remove('finding'); ed.find({ q: '' }); ed.focus(); }
  SE.openFind = openFind;
  // ---- buttons
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled || b.closest('.sc-find') || b.closest('.sc-dlg')) return;
    const a = b.dataset.act;
    if (a === 'save') { save(); ed.focus(); } else if (a === 'find') openFind(false); else if (a === 'manual') manual(ed.nameAtCursor()); else if (a === 'duplicate') duplicate(); else if (a === 'back') back();
  });
  // ---- the DEMO panel: the pop-ups and states on demand
  const at = (needle, dc = 0) => { const ls = ed.text.split('\n'); const i = ls.findIndex((l) => l.includes(needle)); return i < 0 ? null : { line: i + 1, col: ls[i].indexOf(needle) + 1 + dc }; };
  const demo = {
    comp() { const p = at('tempTimer(3') || at('tempTimer(') || { line: 3, col: 1 }; ed.goto(p.line, p.col + 4); ed.completion(); },
    sig() { const p = at('tempTimer(3, ') || at('tempTimer(settings') || at('tempTimer('); if (!p) return; ed.goto(p.line, p.col + 13); ed.signature(true); },
    hover() { const p = at('registerAnonymousEventHandler') || at('tempRegexTrigger') || at('send('); if (!p) return; ed.goto(p.line, p.col); setTimeout(() => ed.hover(ed.text.split('\n')[p.line - 1].slice(p.col - 1).match(/^\w+/)[0], p.line, p.col + 3), 150); },
    find() { openFind(false, 'tank'); },
    err() { if (ro()) return say('Read-only: Duplicate makes your own copy.', 'fail'); const p = at('busy = true') || at('send("eat "'); if (!p) return; const ls = ed.text.split('\n'); ls[p.line - 1] = ls[p.line - 1].replace('busy = true', 'busy = = true'); ed.ta.value = ls.join('\n'); ed.render(); ed.goto(p.line + 2, 3); ed.ta.dispatchEvent(new Event('input')); ed.recheck(0); },
    unsaved() { if (ro()) return; if (!dirty()) { const p = at('local busy = false'); ed.ta.value = ed.text.replace('local busy = false', 'local busy = false\nlocal last = nil'); ed.render(); ed.ta.dispatchEvent(new Event('input')); if (p) ed.goto(p.line + 1, 17); } back(); },
  };
  SE.demo = demo;
  const dp = WC.demoExtra('<div class="row2">Show <button data-d="comp">Completion</button><button data-d="sig">Signature</button><button data-d="hover">Hover</button></div><div class="row2"><button data-d="find">Find</button><button data-d="err">Syntax error</button><button data-d="unsaved">Unsaved → Esc</button></div><div class="row2">Script <button data-s="rescue">rescue</button><button data-s="coinlooter">coinlooter (bundled)</button><button data-s="autoeat">autoeat</button></div>');
  dp.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); setTimeout(() => demo[b.dataset.d](), 30); }));
  dp.querySelectorAll('[data-s]').forEach((b) => { b.classList.toggle('on', b.dataset.s === s.name); b.addEventListener('click', () => host.go(`editor-${file}.html`, { sc: b.dataset.s })); });
  if (SC.qs.has('demo-state')) setTimeout(() => demo[SC.qs.get('demo-state')](), 500);
  paint();
  setTimeout(() => { ed.focus(); const p = SC.qs.get('line'); if (p) ed.goto(+p, 1); }, 60);
  return {
    s, ed, save, back, paint, dirty, openFind,
    layer: {
      key(e) {
        const mod = e.ctrlKey || e.metaKey;
        if (mod && /^s$/i.test(e.key)) { save(); return true; }
        if (mod && /^[fh]$/i.test(e.key)) { openFind(e.key.toLowerCase() === 'h'); return true; }
        if (e.key === 'F1') { manual(null); return true; }
        if (e.key === 'Tab' && !mod) { ed.focus(); return true; }
        return false;
      },
      back() { return back(); },
    },
    canClose: () => { if (dirty()) { confirmClose(() => host.close()); return false; } return true; },
  };
};
})();
