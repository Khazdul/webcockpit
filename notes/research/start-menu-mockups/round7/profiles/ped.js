/* Round 7 · profiles · the Profile editor, shared by the three directions (editor-a/b/c.html).
   Real content from src/editor/frame.tsx + logic.ts (Inv §5.3–5.9, ADR 0104, 0105, 0119):
   - three views LITE · EDITOR · HELP (HELP lies over the other two; each open starts in LITE)
   - LITE: five kinds, the entry list (sorted by pattern, macros by key, new entries last, "+ New entry"),
     the detail (Pattern / Commands, the macro Key cell with key capture, the highlight styles and the
     Text / BG colour picker), the red validation note and the yellow warning, the sentinel prompt
   - applies by itself at the real commit points (leaving a field, another entry or kind, new / delete,
     a bound key, a colour); "Saved" (start page) / "Applied" (live, in game); held entries say why
   - EDITOR: the whole profile text (tt++), Modified, brace balance, Ln/Col, Ctrl+S, Ctrl+F / Ctrl+H
   - HELP: the manual, its section menu, n / p headings, Ctrl+F
   - leaving: Apply changes? (Y / N / keep editing) while live, Not applied: … (N / keep editing), Saving…
   Mockup keys (no hint rows; letters are marked in the labels): L E H views · A I G M S kinds · N new entry ·
   D or Del delete (list) · ↑↓ PgUp PgDn Home End · ←→ views / kinds · Enter into the entry · Tab moves on ·
   Esc steps out of a field, then leaves (asking first when something is not applied) · Ctrl+S apply.
   PED.mount(rootEl, { layout: 'a'|'b'|'c', live, name, within, active(), onLeave(info) }) → { layer, show(), el } */
(() => {
'use strict';
const KINDS = PDATA.KINDS, K = PDATA.KIND;
const COLORS = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
const STYLES = ['underscore', 'blink', 'reverse'];
const STYLE_LABEL = { underscore: 'Underscore', blink: 'Blink', reverse: 'Reverse' };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const phone = () => matchMedia('(max-width: 600px), (pointer: coarse)').matches;

/* ---------------------------------------------------------------- logic.ts, re-done for the mockup */
function colourOf(words, i) {
  let w = words[i]; if (w === undefined) return null; let bright = 0;
  if (w.toLowerCase() === 'light') { bright = 1; w = words[++i]; if (w === undefined) return null; }
  else if (w.toLowerCase() === 'dark') { w = words[++i]; if (w === undefined) return null; }
  const row = COLORS.indexOf(w.toLowerCase()); if (row < 0) return null;
  if (w[0] !== w[0].toLowerCase()) bright = 1;
  return { pick: { row, bright }, next: i + 1 };
}
function parseHL(body) {
  const words = body.trim().split(/[\s,]+/).filter(Boolean), s = { styles: [], fg: null, bg: null };
  let i = 0;
  while (i < words.length) {
    const lw = words[i].toLowerCase();
    if (STYLES.includes(lw)) { if (s.styles.includes(lw)) return null; s.styles.push(lw); i++; continue; }
    if (lw === 'b') { const c = colourOf(words, i + 1); if (!c || s.bg) return null; s.bg = c.pick; i = c.next; continue; }
    const c = colourOf(words, i); if (!c || s.fg) return null; s.fg = c.pick; i = c.next;
  }
  s.styles.sort((a, b) => STYLES.indexOf(a) - STYLES.indexOf(b));
  return s;
}
const cword = (p) => (p.bright ? COLORS[p.row][0].toUpperCase() + COLORS[p.row].slice(1) : COLORS[p.row]);
const serHL = (s) => [...STYLES.filter((x) => s.styles.includes(x)), ...(s.fg ? [cword(s.fg)] : []), ...(s.bg ? ['b ' + cword(s.bg)] : [])].join(' ');
const ansi = (p) => `var(--ansi-${p.row + 1 + (p.bright ? 8 : 0)})`;
function hlStyle(body) {
  const s = parseHL(body);
  if (!s || (!s.fg && !s.bg && !s.styles.length)) {
    const m = /<F([0-9a-f]{6})>/i.exec(body); if (m) return `color:#${m[1]}`;
    if (/bold/i.test(body)) { const t = parseHL(body.replace(/\bbold\b/i, '')); if (t) return hlStyleOf(t) + ';font-weight:700'; }
    return '';
  }
  return hlStyleOf(s);
}
function hlStyleOf(s) {
  let fg = s.fg ? ansi(s.fg) : null, bg = s.bg ? ansi(s.bg) : null;
  if (s.styles.includes('reverse')) [fg, bg] = [bg || 'var(--term-bg)', fg || 'var(--term-fg)'];
  return [fg && `color:${fg}`, bg && `background:${bg}`, s.styles.includes('underscore') && 'text-decoration:underline'].filter(Boolean).join(';');
}
function balanced(s) { let d = 0; for (let i = 0; i < s.length; i++) { if (s[i] === '\\') { i++; continue; } if (s[i] === '{') d++; else if (s[i] === '}') { d--; if (d < 0) return false; } } return d === 0; }
function validate(kind, e, visited = true) {
  const L = K[kind];
  if (e.pattern.trim() === '' && visited) return `${L.pattern} required`;
  if (!balanced(e.pattern)) return `Unbalanced braces in ${L.pattern}`;
  if (!balanced(e.body)) return `Unbalanced braces in ${L.body}`;
  return null;
}
const INPUT_KEYS = { 'Ctrl+A': 'moves to the start', 'Ctrl+E': 'moves to the end', 'Ctrl+U': 'clears the line', 'Ctrl+K': 'deletes to the end', 'Ctrl+W': 'deletes a word', 'Alt+B': 'moves a word left', 'Alt+F': 'moves a word right' };
function warnOf(kind, e) {
  if (kind === 'macro') {
    if (e.warn) return e.warn;
    if (INPUT_KEYS[e.pattern]) return `${e.pattern} overrides the input line (${INPUT_KEYS[e.pattern]}).`;
    if (/^(Shift\+)?[A-Z0-9]$/.test(e.pattern)) return `${e.pattern} overrides the input line (types text).`;
    return null;
  }
  if (kind === 'alias' && /^#help\b/.test(e.pattern.trim())) return '#help is a client command; this alias never runs.';
  return null;
}
function preview(body) {
  const lines = body.split('\n'); let i = 0; while (i < lines.length - 1 && !lines[i].trim()) i++;
  return lines[i] + (lines.slice(i + 1).some((l) => l.trim()) ? ' …' : '');
}
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const KEYORD = (k) => { const m = /^(?:(Ctrl)\+)?(?:(Alt)\+)?(?:(Shift)\+)?(.+)$/.exec(k) || []; const base = m[4] || k; const g = /^F\d+$/.test(base) ? 0 : /^Numpad/.test(base) ? 1 : /^[A-Z0-9]$/.test(base) ? 3 : /^\\/.test(base) ? 9 : 2; return [g, (m[1] ? 1 : 0) + (m[2] ? 2 : 0) + (m[3] ? 4 : 0), /^F\d+$/.test(base) ? +base.slice(1) : 0, base]; };
function sorted(kind, list, pinned) {
  const pin = new Set(pinned), rest = list.filter((e) => !pin.has(e.id));
  if (kind === 'macro') rest.sort((a, b) => { const x = KEYORD(a.pattern), y = KEYORD(b.pattern); for (let i = 0; i < 4; i++) { const c = typeof x[i] === 'number' ? x[i] - y[i] : cmp(x[i], y[i]); if (c) return c; } return 0; });
  else rest.sort((a, b) => cmp(a.pattern, b.pattern));
  return [...rest, ...pinned.map((id) => list.find((e) => e.id === id)).filter(Boolean)];
}
/** tt++ text → token spans (EDITOR, manual examples). */
function hlTT(src) {
  return src.split('\n').map((line) => {
    if (/^\s*#nop\b/i.test(line)) return `<span class="tk-c">${esc(line)}</span>`;
    let out = '', m; const re = /(#[a-zA-Z]+)|(<[FBfb][0-9a-fA-F]{3,6}>|<\d{3}>|<[a-fA-F]{3}>|<[gG]\d\d>)|(%[!]?[+]?\d*(?:\.\.\d*)?[a-zA-Z*?.+]|%\d+)|(\$\{?\w+\}?)|([{};])/g; let last = 0;
    while ((m = re.exec(line))) {
      out += esc(line.slice(last, m.index)); last = re.lastIndex;
      const cls = m[1] ? 'tk-k' : m[2] ? 'tk-s' : m[3] ? 'tk-n' : m[4] ? 'tk-v' : 'tk-o';
      out += `<span class="${cls}">${esc(m[0])}</span>`;
    }
    return out + esc(line.slice(last));
  });
}
window.PEDLIB = { hlTT, esc };

const IC = {
  plus: '<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"/></svg>',
  del: '<svg viewBox="0 0 16 16"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9"/></svg>',
  save: '<svg viewBox="0 0 16 16"><path d="M3 2.5h8l2 2v9H3z"/><path d="M5.5 2.5v3h5v-3M5.5 13.5v-4h5v4"/></svg>',
  find: '<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2l3.3 3.3"/></svg>',
  back: '<svg viewBox="0 0 16 16"><path d="M9.8 3.2 5 8l4.8 4.8"/></svg>',
  action: '<svg viewBox="0 0 18 18"><path d="M10 1.8 4 10h4.5L7.5 16.2 14 7.8H9.4z"/></svg>',
  alias: '<svg viewBox="0 0 18 18"><path d="M3 5.5h8.5M3 9h12M3 12.5h6.5"/><path d="M13 3.5l2.5 2-2.5 2"/></svg>',
  highlight: '<svg viewBox="0 0 18 18"><path d="M11.5 2.5l4 4-7 7H4.5v-4z"/><path d="M2.5 16h13"/></svg>',
  macro: '<svg viewBox="0 0 18 18"><rect x="2" y="4.5" width="14" height="9" rx="1.6"/><path d="M5 7.5h.1M8 7.5h.1M11 7.5h.1M5.5 10.5h7"/></svg>',
  substitute: '<svg viewBox="0 0 18 18"><path d="M3 6h10.5M11 3.5 13.5 6 11 8.5M15 12H4.5M7 9.5 4.5 12 7 14.5"/></svg>',
};

function mount(root, opts = {}) {
  const L = opts.layout || 'a', live = !!opts.live, word = live ? 'Applied' : 'Saved';
  const st = {
    view: 'lite', base: 'lite', kind: 'action', cur: {}, doc: PDATA.doc(), pinned: [], visited: new Set(), dirty: new Set(),
    held: null, savedAny: false, modified: false, text: '', sheet: false, helpSec: 0, find: null,
  };
  st.text = PDATA.text(st.doc);
  const ped = WC.el('div', { class: `ped ped-${L}` });
  root.append(ped);
  const viewsHtml = `<div class="seg ped-views" role="tablist" aria-label="View">
      <button role="tab" data-v="lite"><span><u class="sk">L</u>ite</span></button><button role="tab" data-v="editor"><span><u class="sk">E</u>ditor</span></button><button role="tab" data-v="help"><span><u class="sk">H</u>elp</span></button></div>`;
  const nameHtml = live ? `<span class="ped-live"><i></i>Connected · changes apply to the game</span>` : `<span class="ped-name">${opts.name || 'Gibur'}<small>tt++ profile</small></span>`;
  const footHtml = `<div class="box-foot ped-foot"><div class="btnrow ped-btns"></div><div class="ped-flash" role="status"></div><div class="ped-status"></div></div>`;
  const edHtml = `<div class="ped-ed" hidden>
      <div class="ped-find" hidden><input class="field mono" data-f="q" placeholder="Find" spellcheck="false"><span class="cnt"></span>
        <div class="seg" data-f="opts"><button data-o="case" title="Match case">Aa</button><button data-o="word" title="Whole word">W</button><button data-o="re" title="Regular expression">.*</button></div>
        <input class="field mono" data-f="r" placeholder="Replace" spellcheck="false" hidden><button class="ibtn small" data-f="one" hidden><span>Replace</span></button><button class="ibtn small" data-f="all" hidden><span>All</span></button></div>
      <div class="code ped-buf"><div class="ped-buf-in"><div class="code-gut"></div><pre class="code-src"></pre></div></div></div>`;
  const hpHtml = `<div class="ped-hp" hidden><nav class="ped-hmenu" aria-label="Sections"></nav><div class="ped-hwrap" style="flex:1;min-width:0;display:flex;flex-direction:column;min-height:0">
      <select class="select ped-hsel" aria-label="Section"></select>
      <div class="ped-find" data-help hidden><input class="field" data-f="hq" placeholder="Find in the manual" spellcheck="false"><span class="cnt"></span></div>
      <div class="ped-man" tabindex="-1"></div></div></div>`;
  const backHtml = `<button class="ibtn small keep-ic ped-back">${IC.back}<span></span></button>`;
  if (L === 'a') {
    ped.innerHTML = `<div class="box-head ped-head">${nameHtml}${viewsHtml}</div>
      <div class="ped-lite"><div class="tabs ped-kinds" role="tablist" aria-label="Kind"></div>
        <div class="ped-split"><div class="ped-listwrap"><div class="ped-th"><span></span><span></span></div><div class="box-body"><div class="rows flat ped-list ped-tbl" role="listbox" tabindex="0"></div></div></div>
        <div class="ped-detail">${backHtml}<div class="ped-dhost" style="flex:1;min-height:0;display:flex;flex-direction:column"></div></div></div></div>
      ${edHtml}${hpHtml}${footHtml}`;
  } else if (L === 'b') {
    ped.innerHTML = `<div class="box-head ped-head">${nameHtml}${viewsHtml}</div>
      <div class="ped-cols"><nav class="ped-rail" aria-label="Navigate"></nav>
        <div class="ped-main"><div class="ped-lite" style="flex:1;min-height:0;display:flex;flex-direction:column"><div class="box-body"><div class="rows flat ped-list" role="listbox" tabindex="0"></div></div></div>${edHtml}${hpHtml}</div>
        <div class="ped-detail">${backHtml}<div class="ped-dhost" style="flex:1;min-height:0;display:flex;flex-direction:column"></div></div></div>
      ${footHtml}`;
  } else {
    ped.innerHTML = `<div class="ped-headrow">${nameHtml}${viewsHtml}</div>
      <div class="ped-lite"><div class="ped-col"><div class="seg ped-kinds" role="tablist" aria-label="Kind"></div><div class="ped-th ped-tbl"><span></span><span></span></div><div class="box-body"><div class="rows flat ped-list ped-tbl" role="listbox" tabindex="0"></div></div></div></div>
      ${edHtml}${hpHtml}${footHtml}`;
  }
  const $ = (s) => ped.querySelector(s);
  const listEl = $('.ped-list'), kindsEl = $('.ped-kinds'), railEl = $('.ped-rail'), dhost = $('.ped-dhost'), flashEl = $('.ped-flash'), statusEl = $('.ped-status'), btnsEl = $('.ped-btns');
  const buf = { wrap: $('.ped-buf'), gut: $('.ped-buf .code-gut'), pre: $('.ped-buf .code-src'), ta: null };
  buf.ta = WC.el('textarea', { spellcheck: 'false', wrap: 'off', 'aria-label': 'Profile text', autocomplete: 'off' });
  buf.pre.append(buf.ta);
  let ftimer = 0;
  const flash = (m, kind = '', ms = 1600) => { flashEl.textContent = m; flashEl.className = 'ped-flash show ' + kind; clearTimeout(ftimer); ftimer = setTimeout(() => flashEl.classList.remove('show'), ms); };

  /* ------------------------------------------------------------ model helpers */
  const entries = (k = st.kind) => sorted(k, st.doc[k], st.pinned);
  const curOf = (k = st.kind) => { const id = st.cur[k]; const list = entries(k); if (id === 'new') return null; return list.find((e) => e.id === id) || list[0] || null; };
  const isNew = () => st.cur[st.kind] === 'new' || !entries().length;
  const find = (id) => { for (const k of KINDS) { const e = st.doc[k].find((x) => x.id === id); if (e) return [k, e]; } return [null, null]; };
  const visitedOf = (e) => !st.pinned.includes(e.id) || st.visited.has(e.id);

  /* ------------------------------------------------------------ apply (ADR 0105, simplified) */
  function commit(why = 'auto') {
    if (st.view === 'editor' && why === 'save') {
      if (!st.modified) return flash(live ? 'Nothing to apply.' : 'Nothing to save.');
      const open = (st.text.match(/(?<!\\)\{/g) || []).length - (st.text.match(/(?<!\\)\}/g) || []).length;
      if (open) { flash('Not applied: unbalanced braces in the profile text.', 'fail', 6000); return; }
      st.modified = false; st.savedAny = true; status(); return flash(word);
    }
    const bad = [];
    for (const id of [...st.dirty]) {
      const [k, e] = find(id);
      if (!e) { st.dirty.delete(id); continue; }
      if (e.pattern.trim() === '' && st.pinned.includes(id)) continue;   // an empty new entry waits (dropped silently)
      const r = validate(k, e);
      if (r) bad.push(`${r} (${K[k].one}${e.pattern.trim() ? ' ' + e.pattern.trim().slice(0, 24) : ''})`);
      else { st.dirty.delete(id); st.savedAny = true; if (why !== 'quiet') st._applied = true; }
    }
    st.held = bad[0] || null;
    if (st.held) flash('Not applied: ' + st.held, 'fail', 6000);
    else if (st._applied) { st._applied = false; flash(word); }
    else if (why === 'save') flash(live ? 'Nothing to apply.' : 'Nothing to save.');
    status(); renderList(false);
  }

  /* ------------------------------------------------------------ rendering */
  function renderViews() {
    ped.querySelectorAll('.ped-views button').forEach((b) => { const on = b.dataset.v === st.view; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
    ped.classList.toggle('v-lite', st.view === 'lite'); ped.classList.toggle('v-editor', st.view === 'editor'); ped.classList.toggle('v-help', st.view === 'help');
    $('.ped-lite').hidden = st.view !== 'lite';
    $('.ped-ed').hidden = st.view !== 'editor';
    $('.ped-hp').hidden = st.view !== 'help';
    if (L !== 'c') { const d = $('.ped-detail'); d.hidden = st.view !== 'lite'; }
    if (kindsEl && L === 'a') kindsEl.style.visibility = st.view === 'lite' ? '' : 'hidden';
    renderFootBtns(); status();
    if (L === 'b') renderRail();
  }
  function renderKinds() {
    if (!kindsEl) return;
    kindsEl.innerHTML = KINDS.map((k) => `<button role="tab" data-k="${k}" aria-selected="${k === st.kind}" tabindex="${k === st.kind ? 0 : -1}"><span>${K[k].label}</span><span class="n">${st.doc[k].length}</span></button>`).join('');
  }
  function renderRail() {
    if (!railEl) return;
    if (st.view === 'lite') {
      railEl.innerHTML = `<div class="rail-h">Kinds</div>` + KINDS.map((k) => `<div class="rail-it${k === st.kind ? ' on' : ''}" data-k="${k}" role="tab" aria-selected="${k === st.kind}">${IC[k]}<span>${K[k].label}</span><span class="n">${st.doc[k].length}</span></div>`).join('');
    } else if (st.view === 'editor') {
      const lines = st.text.split('\n');
      const marks = [['Variables', /^#variable/], ['Actions', /^#nop -+ actions/], ['Aliases', /^#nop -+ aliases/], ['Highlights', /^#nop -+ highlights/], ['Keys', /^#nop -+ keys/], ['Substitutes', /^#nop -+ substitutes/], ['Timers & events', /^#ticker/]];
      railEl.innerHTML = `<div class="rail-h">In the text</div>` + marks.map(([t, re]) => { const ln = lines.findIndex((l) => re.test(l)); return ln < 0 ? '' : `<div class="rail-it small" data-line="${ln}"><span>${t}</span><span class="n">${ln + 1}</span></div>`; }).join('');
    } else {
      let g = '';
      railEl.innerHTML = PDATA.help.map((s, i) => { const h = s.group !== g ? `${g ? '<div class="rail-sep"></div>' : ''}<div class="rail-h">${(g = s.group)}</div>` : ''; return `${h}<div class="rail-it small${s.heading.startsWith('#') ? ' cmd' : ''}${i === st.helpSec ? ' on' : ''}" data-sec="${i}"><span>${esc(s.heading)}</span></div>`; }).join('');
    }
  }
  function rowHtml(e, k) {
    const bad = validate(k, e, visitedOf(e)), warn = warnOf(k, e);
    const flag = bad ? '<i class="flag bad" title="' + esc(bad) + '"></i>' : warn ? '<i class="flag warn" title="' + esc(warn) + '"></i>' : '';
    const pat = k === 'macro' ? (e.pattern ? `<span class="kc${e.custom ? ' custom' : ''}">${esc(e.pattern)}</span>` : '<span class="kc custom">unbound</span>') : esc(e.pattern || ' ');
    const bodyTxt = esc(preview(e.body));
    const bod = k === 'highlight' ? `<span style="${hlStyle(e.body)}">${bodyTxt}</span>` : bodyTxt;
    if (L === 'b') return `<div class="row" role="option" data-id="${e.id}"><div class="l1">${flag}<span class="pat">${pat}</span></div><span class="bod">${bod || '&nbsp;'}</span></div>`;
    return `<div class="row" role="option" data-id="${e.id}"><span class="pat">${flag ? flag + ' ' : ''}${pat}</span><span class="bod">${bod}</span></div>`;
  }
  function renderList(scroll = true) {
    const k = st.kind, list = entries(k), lab = K[k];
    ped.querySelectorAll('.ped-th span').forEach((s, i) => (s.textContent = i ? lab.body : lab.pattern));
    if (!st.cur[k]) st.cur[k] = list[0] ? list[0].id : 'new';
    listEl.innerHTML = list.map((e) => rowHtml(e, k)).join('') + `<div class="row newrow" role="option" data-id="new">${IC.plus}<span>New ${lab.one}</span></div>`;
    markList(scroll);
  }
  function markList(scroll = true) {
    const id = String(isNew() ? 'new' : curOf().id), focused = zoneIs('list') || (L === 'c' && zoneIs('detail'));
    listEl.querySelectorAll('.row').forEach((r) => { const on = r.dataset.id === id; r.classList.toggle('on', on); r.classList.toggle('idle', on && !focused); r.classList.toggle('open', on && L === 'c'); r.setAttribute('aria-selected', on); });
    const r = listEl.querySelector('.row.on');
    if (L === 'c' && r) { const host = ensureOpenHost(); if (r.nextSibling !== host) r.after(host); }
    if (scroll && r) { r.scrollIntoView({ block: 'nearest' }); if (L === 'c') setTimeout(() => { const sc = r.closest('.box-body'); if (!sc) return; const rr = r.getBoundingClientRect(), hb = openHost.getBoundingClientRect(), sb = sc.getBoundingClientRect(); if (hb.bottom > sb.bottom) sc.scrollTop += Math.min(hb.bottom - sb.bottom + 8, rr.top - sb.top); }, 0); }
  }
  let openHost = null;
  function ensureOpenHost() { if (!openHost) { openHost = WC.el('div', { class: 'ped-open' }); } return openHost; }
  const detailHost = () => (L === 'c' ? ensureOpenHost() : dhost);
  function renderDetail() {
    const host = detailHost(), k = st.kind, e = curOf(), lab = K[k];
    const back = ped.querySelector('.ped-back span'); if (back) back.textContent = lab.title;
    if (isNew() || !e) {
      const n = st.doc[k].length;
      host.innerHTML = `<div class="ped-card"><div class="ped-prompt">${n ? `Press Enter to create a new ${lab.one}.` : `No ${lab.many} yet. Press N to add one.`}<br><button class="ibtn small" data-act="new">${IC.plus}<span><u class="sk">N</u>ew ${lab.one}</span></button></div></div>`;
      return;
    }
    const bad = validate(k, e, visitedOf(e)), warn = warnOf(k, e);
    let h = '<div class="ped-card">';
    if (k === 'macro') {
      const label = e.pattern ? (e.custom ? `Custom: ${esc(e.pattern)}` : esc(e.pattern)) : 'Press to bind…';
      h += `<label class="lbl">Key</label><div class="ped-keyrow"><button class="ped-keybtn${e.pattern && !e.custom ? '' : ' hint'}" data-act="capture" data-fld="key">${label}</button><span class="muted">${phone() ? 'Key capture: desktop only.' : 'Choose it, then press the key.'}</span></div>`;
    } else {
      h += `<label class="lbl" for="pf-p">${lab.pattern}</label><input class="field mono" id="pf-p" data-fld="pattern" value="${esc(e.pattern)}" spellcheck="false" autocomplete="off">`;
    }
    if (k === 'highlight') {
      const s = parseHL(e.body), sp = s || { styles: [], fg: null, bg: null };
      if (!s) h += `<p class="ped-verb">Kept as written: <code>${esc(e.body)}</code>. Choosing a style or colour replaces it.</p>`;
      h += `<label class="lbl">Style</label><div class="ped-styles">${STYLES.map((x) => `<label class="check"><input type="checkbox" class="chk" data-style="${x}"${sp.styles.includes(x) ? ' checked' : ''}> ${STYLE_LABEL[x]}</label>`).join('')}</div>`;
      const grid = (dim, cap) => `<div class="ped-sw-grid" data-dim="${dim}"><span class="cap">${cap}</span>${COLORS.map((c, r) => [0, 1].map((b) => { const p = sp[dim], on = p && p.row === r && p.bright === b; return `<button class="ped-sw${on ? ' on' : ''}" data-dim="${dim}" data-r="${r}" data-c="${b}" title="${b ? 'light ' : ''}${c}" style="background:var(--ansi-${r + 1 + b * 8})" aria-pressed="${!!on}"></button>`; }).join('')).join('')}</div>`;
      h += `<div class="ped-hl">${grid('fg', 'Text')}${grid('bg', 'Background')}</div>`;
      h += `<div class="ped-prev"><span class="lbl">Shows as</span><span class="pv" style="${hlStyle(e.body)}">${esc(e.pattern.replace(/^\*|\*$/g, '') || 'text')}</span></div>`;
    } else {
      h += `<label class="lbl" for="pf-b">${lab.body}</label><textarea class="field mono" id="pf-b" data-fld="body" spellcheck="false" autocomplete="off" wrap="off">${esc(e.body)}</textarea>`;
    }
    h += `<p class="ped-note bad"${bad ? '' : ' hidden'}>${esc(bad || '')}</p><p class="ped-note warn"${warn ? '' : ' hidden'}>${esc(warn || '')}</p></div>`;
    host.innerHTML = h;
  }
  function updateNotes() {
    const k = st.kind, e = curOf(); if (!e) return;
    const host = detailHost(), bad = validate(k, e, visitedOf(e)), warn = warnOf(k, e);
    const b = host.querySelector('.ped-note.bad'), w = host.querySelector('.ped-note.warn');
    if (b) { b.hidden = !bad; b.textContent = bad || ''; } if (w) { w.hidden = !warn; w.textContent = warn || ''; }
    const pv = host.querySelector('.pv'); if (pv) { pv.setAttribute('style', hlStyle(e.body)); pv.textContent = e.pattern.replace(/^\*|\*$/g, '') || 'text'; }
    const row = listEl.querySelector(`.row[data-id="${e.id}"]`);
    if (row) { const t = WC.el('div', {}, rowHtml(e, k)).firstChild; row.innerHTML = t.innerHTML; }
  }
  function renderFootBtns() {
    if (st.view === 'lite') btnsEl.innerHTML = `<button class="ibtn small" data-act="new">${IC.plus}<span><u class="sk">N</u>ew entry</span></button><button class="ibtn small danger" data-act="delete"${isNew() ? ' disabled' : ''}>${IC.del}<span><u class="sk">D</u>elete</span></button>`;
    else if (st.view === 'editor') btnsEl.innerHTML = `<button class="ibtn small primary" data-act="save">${IC.save}<span>${live ? 'Apply' : 'Save'}</span></button><button class="ibtn small" data-act="find">${IC.find}<span>Find</span></button>`;
    else btnsEl.innerHTML = `<button class="ibtn small" data-act="hfind">${IC.find}<span>Find</span></button>`;
  }
  function status() {
    if (st.view === 'editor') {
      const ta = buf.ta, pos = ta.selectionStart || 0, before = st.text.slice(0, pos), ln = before.split('\n').length, col = pos - before.lastIndexOf('\n');
      const open = (st.text.match(/(?<!\\)\{/g) || []).length - (st.text.match(/(?<!\\)\}/g) || []).length;
      statusEl.innerHTML = `${st.modified ? '<span class="mod">Modified</span>' : ''}${open > 0 ? `<span class="bal">${open} unclosed {</span>` : open < 0 ? `<span class="bal">${-open} stray }</span>` : ''}<span>Ln ${ln}, Col ${col}</span>`;
    } else if (st.view === 'lite') {
      statusEl.innerHTML = st.held ? `<span class="sv held"><i></i>Not applied</span>` : st.dirty.size ? `<span class="sv"><i style="background:var(--c-accent)"></i>Editing</span>` : `<span class="sv"><i></i>${live ? 'All applied' : 'All saved'}</span>`;
    } else statusEl.innerHTML = '';
    const db = btnsEl.querySelector('[data-act="delete"]'); if (db) db.disabled = isNew();
  }

  /* ------------------------------------------------------------ EDITOR buffer */
  function paintBuffer() {
    const lines = hlTT(st.text);
    const pos = buf.ta.selectionStart || 0, cur = st.text.slice(0, pos).split('\n').length - 1;
    buf.pre.querySelectorAll('.code-line').forEach((n) => n.remove());
    buf.pre.insertAdjacentHTML('afterbegin', lines.map((l, i) => `<span class="code-line${i === cur ? ' cur' : ''}${st.find && st.find.line === i ? ' hit' : ''}">${l || ' '}</span>`).join(''));
    buf.gut.textContent = lines.map((_, i) => i + 1).join('\n');
  }
  buf.ta.addEventListener('input', () => { st.text = buf.ta.value; st.modified = true; paintBuffer(); status(); if (L === 'b') renderRail(); });
  const caret = () => { const cur = st.text.slice(0, buf.ta.selectionStart).split('\n').length - 1; buf.pre.querySelectorAll('.code-line').forEach((n, i) => n.classList.toggle('cur', i === cur)); status(); };
  ['keyup', 'click', 'select'].forEach((ev) => buf.ta.addEventListener(ev, caret));
  function gotoLine(n) { const idx = st.text.split('\n').slice(0, n).join('\n').length + (n ? 1 : 0); buf.ta.focus(); buf.ta.setSelectionRange(idx, idx); caret(); const lh = parseFloat(getComputedStyle(buf.pre).lineHeight) || 21; buf.wrap.scrollTop = Math.max(0, n * lh - 40); }
  /* find / replace (Ctrl+F / Ctrl+H) */
  const fp = $('.ped-ed .ped-find'), fq = fp.querySelector('[data-f="q"]'), fr = fp.querySelector('[data-f="r"]'), fopt = { case: false, word: false, re: false };
  function matches() {
    const q = fq.value; if (!q) return [];
    let re; try { const src = fopt.re ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); re = new RegExp(fopt.word ? `\\b${src}\\b` : src, fopt.case ? 'g' : 'gi'); } catch (_) { return []; }
    const out = []; let m; while ((m = re.exec(st.text)) && out.length < 999) { out.push(m.index); if (!m[0].length) re.lastIndex++; } return out;
  }
  function findStep(dir = 1) {
    const ms = matches(), cnt = fp.querySelector('.cnt');
    if (!ms.length) { cnt.textContent = fq.value ? 'No results' : ''; st.find = null; paintBuffer(); return; }
    const pos = buf.ta.selectionStart || 0; let i = dir > 0 ? ms.findIndex((x) => x > (st.find ? st.find.at : pos - 1)) : -1;
    if (dir < 0) { for (let k = ms.length - 1; k >= 0; k--) if (ms[k] < (st.find ? st.find.at : pos)) { i = k; break; } }
    if (i < 0) i = dir > 0 ? 0 : ms.length - 1;
    const line = st.text.slice(0, ms[i]).split('\n').length - 1;
    st.find = { at: ms[i], line }; cnt.textContent = `${i + 1} of ${ms.length}`; paintBuffer();
    const lh = parseFloat(getComputedStyle(buf.pre).lineHeight) || 21; buf.wrap.scrollTop = Math.max(0, line * lh - buf.wrap.clientHeight / 3);
  }
  function openFind(replace) {
    fp.hidden = false; fp.querySelectorAll('[data-f="r"],[data-f="one"],[data-f="all"]').forEach((x) => (x.hidden = !replace));
    fq.focus(); fq.select(); if (fq.value) findStep(1);
  }
  fq.addEventListener('input', () => { st.find = null; findStep(1); });
  [fq, fr].forEach((inp) => inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (inp === fr && e.ctrlKey) replaceAll(); else if (inp === fr) replaceOne(); else findStep(e.shiftKey ? -1 : 1); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fp.hidden = true; st.find = null; paintBuffer(); buf.ta.focus(); }
  }));
  fp.querySelector('[data-f="opts"]').addEventListener('click', (e) => { const b = e.target.closest('[data-o]'); if (!b) return; fopt[b.dataset.o] = !fopt[b.dataset.o]; b.setAttribute('aria-selected', fopt[b.dataset.o]); st.find = null; findStep(1); });
  function replaceOne() { if (!st.find) return findStep(1); const ms = matches(); if (!ms.length) return; const q = fq.value; st.text = st.text.slice(0, st.find.at) + fr.value + st.text.slice(st.find.at + q.length); buf.ta.value = st.text; st.modified = true; status(); findStep(1); }
  function replaceAll() { const ms = matches(); if (!ms.length) return; let re; try { const src = fopt.re ? fq.value : fq.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); re = new RegExp(fopt.word ? `\\b${src}\\b` : src, fopt.case ? 'g' : 'gi'); } catch (_) { return; } st.text = st.text.replace(re, fr.value); buf.ta.value = st.text; st.modified = true; st.find = null; paintBuffer(); status(); fp.querySelector('.cnt').textContent = `${ms.length} replaced`; }
  fp.querySelector('[data-f="one"]').addEventListener('click', replaceOne);
  fp.querySelector('[data-f="all"]').addEventListener('click', replaceAll);

  /* ------------------------------------------------------------ HELP */
  const man = $('.ped-man'), hmenu = $('.ped-hmenu'), hsel = $('.ped-hsel');
  function renderHelp() {
    man.innerHTML = PDATA.help.map((s, i) => `<section data-sec="${i}"><h3${s.heading.startsWith('#') ? ' class="cmd"' : ''}>${esc(s.heading)}</h3>${(s.syntax || []).map((x) => `<div class="syn">${esc(x)}</div>`).join('')}${s.text.map((p) => `<p>${esc(p)}</p>`).join('')}${(s.ex || []).map((x) => `${x.note ? `<div class="exn">${esc(x.note)}</div>` : ''}<div class="code"><pre class="code-src">${hlTT(x.code).map((l) => `<span class="code-line">${l || ' '}</span>`).join('')}</pre></div>`).join('')}</section>`).join('');
    let g = '';
    hmenu.innerHTML = PDATA.help.map((s, i) => `${s.group !== g ? `<div class="g">${(g = s.group)}</div>` : ''}<span class="it${s.heading.startsWith('#') ? ' cmd' : ''}" data-sec="${i}">${esc(s.heading)}</span>`).join('');
    hsel.innerHTML = ['Introduction', 'Basics', 'Commands'].map((gr) => `<optgroup label="${gr}">${PDATA.help.map((s, i) => (s.group === gr ? `<option value="${i}">${esc(s.heading)}</option>` : '')).join('')}</optgroup>`).join('');
    markHelp();
  }
  function markHelp() {
    hmenu.querySelectorAll('.it').forEach((x) => x.classList.toggle('on', +x.dataset.sec === st.helpSec));
    if (railEl && st.view === 'help') railEl.querySelectorAll('.rail-it').forEach((x) => x.classList.toggle('on', +x.dataset.sec === st.helpSec));
    hsel.value = String(st.helpSec);
  }
  function goSec(i) { st.helpSec = Math.max(0, Math.min(PDATA.help.length - 1, i)); const s = man.querySelector(`section[data-sec="${st.helpSec}"]`); if (s) man.scrollTop = s.offsetTop - man.offsetTop; markHelp(); }
  man.addEventListener('scroll', () => { const top = man.scrollTop + man.offsetTop + 30; let k = 0; man.querySelectorAll('section').forEach((s, i) => { if (s.offsetTop <= top) k = i; }); if (k !== st.helpSec) { st.helpSec = k; markHelp(); } });
  hmenu.addEventListener('click', (e) => { const it = e.target.closest('[data-sec]'); if (it) goSec(+it.dataset.sec); });
  hsel.addEventListener('change', () => goSec(+hsel.value));
  const hfp = $('[data-help].ped-find'), hq = hfp.querySelector('input');
  function helpFind(step = 0) {
    man.querySelectorAll('mark').forEach((m) => m.replaceWith(m.textContent)); man.normalize();
    const q = hq.value.trim(); const cnt = hfp.querySelector('.cnt'); if (!q) { cnt.textContent = ''; return; }
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); let n = 0;
    man.querySelectorAll('p, h3, .syn').forEach((p) => { if (!re.test(p.textContent)) return; re.lastIndex = 0; p.innerHTML = esc(p.textContent).replace(new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (m) => (n++, `<mark>${m}</mark>`)); });
    const marks = man.querySelectorAll('mark'); st.hfi = marks.length ? ((st.hfi || 0) + step + marks.length) % marks.length : 0;
    cnt.textContent = marks.length ? `${st.hfi + 1} of ${marks.length}` : 'No results';
    if (marks[st.hfi]) { marks[st.hfi].style.outline = '1px solid var(--c-accent)'; man.scrollTop = marks[st.hfi].offsetTop - man.offsetTop - 60; }
  }
  hq.addEventListener('input', () => { st.hfi = 0; helpFind(0); });
  hq.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); helpFind(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hfp.hidden = true; hq.value = ''; helpFind(0); man.focus(); } });

  /* ------------------------------------------------------------ actions */
  function setView(v) {
    if (v === st.view) return;
    if (st.view === 'lite') commit();
    if (v === 'editor' && st.base !== 'editor') { st.text = PDATA.text(st.doc); buf.ta.value = st.text; }
    if (st.view === 'editor' && v === 'lite' && st.modified) { st.modified = false; st.savedAny = true; flash(word); }   // back in LITE, the text is applied
    if (v !== 'help') st.base = v;
    st.view = v; st.sheet = false; ped.classList.remove('sheet');
    renderViews();
    if (v === 'editor') { paintBuffer(); requestAnimationFrame(() => { buf.ta.setSelectionRange(0, 0); buf.ta.focus({ preventScroll: true }); buf.wrap.scrollTop = 0; buf.wrap.scrollLeft = 0; caret(); }); }
    if (v === 'help') { requestAnimationFrame(() => { goSec(st.helpSec); man.focus({ preventScroll: true }); }); }
    if (v === 'lite') { renderKinds(); renderList(); renderDetail(); focusList(); }
  }
  function setKind(k) {
    if (k === st.kind || st.view !== 'lite') return;
    commit(); st.kind = k; st.sheet = false; ped.classList.remove('sheet');
    renderKinds(); if (L === 'b') renderRail(); renderList(); renderDetail(); renderFootBtns(); status();
  }
  function select(id, opts2 = {}) {
    const prev = st.cur[st.kind];
    if (String(prev) !== String(id)) commit();
    st.cur[st.kind] = id === 'new' ? 'new' : +id;
    markList(); renderDetail(); status();
    if (opts2.open) openDetail();
  }
  function move(d) {
    const list = entries(), ids = [...list.map((e) => e.id), 'new'];
    let i = ids.findIndex((x) => String(x) === String(isNew() ? 'new' : curOf().id)); if (i < 0) i = 0;
    const j = Math.max(0, Math.min(ids.length - 1, d === 'home' ? 0 : d === 'end' ? ids.length - 1 : i + d));
    if (j !== i) select(ids[j]);
  }
  function openDetail() {
    if (isNew()) return newEntry();
    st.sheet = true; ped.classList.add('sheet');
    const f = detailHost().querySelector('[data-fld]'); if (f) f.focus({ preventScroll: L !== 'c' });
  }
  function closeSheet() { st.sheet = false; ped.classList.remove('sheet'); focusList(); }
  function newEntry() {
    if (st.view !== 'lite') return;
    const k = st.kind;
    if (k === 'macro' && phone()) return flash('Key capture: desktop only.', 'fail');
    commit();
    const e = { id: 9000 + Math.floor(Math.random() * 1e6), pattern: '', body: k === 'highlight' ? 'light yellow' : '' };
    st.doc[k].push(e); st.pinned.push(e.id); st.cur[k] = e.id; st.dirty.add(e.id);
    renderKinds(); if (L === 'b') renderRail(); renderList(); renderDetail(); renderFootBtns(); status();
    st.sheet = true; ped.classList.add('sheet');
    if (k === 'macro') capture(e, true);
    else { const f = detailHost().querySelector('[data-fld="pattern"]'); if (f) f.focus(); }
  }
  function del() {
    if (st.view !== 'lite' || isNew()) return;
    const k = st.kind, list = entries(), e = curOf(), i = list.indexOf(e), next = list[i + 1] || list[i - 1];
    st.doc[k] = st.doc[k].filter((x) => x !== e); st.pinned = st.pinned.filter((x) => x !== e.id); st.dirty.delete(e.id);
    st.cur[k] = next ? next.id : 'new'; st.savedAny = true;
    renderKinds(); if (L === 'b') renderRail(); renderList(); renderDetail(); renderFootBtns();
    st._applied = true; commit('auto');
  }
  /* key capture (Inv §5.6): a modal; Esc cancels (a new macro is removed) */
  const KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Insert', 'Delete', 'Tab', 'Backspace'];
  function keyName(e) {
    const c = e.code; let k = null;
    if (/^Key[A-Z]$/.test(c)) k = c.slice(3); else if (/^Digit\d$/.test(c)) k = c.slice(5); else if (/^F\d{1,2}$/.test(c)) k = c; else if (/^Numpad/.test(c)) k = c; else if (KEYS.includes(c)) k = c;
    if (!k) return null;
    return (e.ctrlKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '') + k;
  }
  function capture(e, auto = false) {
    if (phone()) return flash('Key capture: desktop only.', 'fail');
    const d = SHELL.dialog({
      hood: 'Bind key', within: opts.within, keycap: 'Press the key to bind…', p: auto ? 'For the new macro.' : `For the macro on ${esc(e.pattern || 'no key')}.`, err: '',
      buttons: [{ label: 'Cancel', run: (api) => cancel(api) }],
      keys(ev, api) {
        if (ev.key === 'Escape' && !ev.ctrlKey && !ev.altKey && !ev.shiftKey) { cancel(api); return true; }
        if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'NumLock', 'OS'].includes(ev.key)) return true;
        if (ev.getModifierState && ev.getModifierState('AltGraph')) { api.setErr('AltGr keys type text.'); return true; }
        if (ev.key === 'Enter' && !ev.ctrlKey && !ev.altKey) { api.setErr('Enter sends the input line.'); return true; }
        const n = keyName(ev);
        if (!n) { api.setErr('Unknown key.'); return true; }
        if (['Ctrl+W', 'Ctrl+T', 'Ctrl+N', 'Ctrl+Tab', 'Ctrl+Shift+W', 'Ctrl+Shift+T', 'Ctrl+Shift+N', 'Ctrl+Shift+Tab'].includes(n)) { api.setErr('The browser keeps that key.'); return true; }
        e.pattern = n; e.custom = false; e.warn = n === 'F5' ? 'F5 is also bound by script group-heal; this macro wins.' : null;
        st.dirty.add(e.id); api.close(); renderList(); renderDetail(); commit('quiet'); flash(`Bound to ${n}.`, '', 2000);
        setTimeout(() => { const f = detailHost().querySelector(auto ? '[data-fld="body"]' : '[data-fld="key"]'); if (f) f.focus(); }, 30);
        return true;
      },
    });
    function cancel(api) {
      api.close();
      if (auto) { st.doc.macro = st.doc.macro.filter((x) => x !== e); st.pinned = st.pinned.filter((x) => x !== e.id); st.dirty.delete(e.id); st.cur.macro = 'new'; renderKinds(); if (L === 'b') renderRail(); renderList(); renderDetail(); }
      setTimeout(() => focusList(), 30);
    }
  }
  /* leaving (ESC / Back): ask only while something is not applied */
  function leave() {
    if (st.dialog) return;
    commit('quiet');
    const done = (discard) => { st.dialog = null; if (opts.onLeave) opts.onLeave({ saved: st.savedAny && !discard, live, name: opts.name || 'Gibur' }); };
    const unapplied = st.view === 'editor' || st.base === 'editor' ? st.modified : false;
    if (unapplied && live) {
      st.dialog = SHELL.dialog({
        hood: 'Profile', within: opts.within, q: 'Apply changes to your profile?', p: 'They go into the running game.',
        buttons: [
          { label: '<u class="sk">Y</u>es, apply', cls: 'primary', key: 'y', run: (a) => { a.close(); const w = SHELL.dialog({ hood: 'Profile', within: opts.within, q: 'Applying…' }); setTimeout(() => { w.close(); st.modified = false; st.savedAny = true; done(false); }, WC.dur(700)); } },
          { label: '<u class="sk">N</u>o, discard', cls: 'danger', key: 'n', run: (a) => { a.close(); done(true); } },
          { label: 'Keep editing', run: (a) => { a.close(); st.dialog = null; } },
        ],
        onEsc: (a) => { a.close(); st.dialog = null; },
      });
      return;
    }
    if (unapplied) {   // not live: ESC saves, as before
      const w = SHELL.dialog({ hood: 'Profile', within: opts.within, q: 'Saving…' }); st.dialog = w;
      setTimeout(() => { w.close(); st.modified = false; st.savedAny = true; done(false); }, WC.dur(600));
      return;
    }
    if (st.held) { heldDialog(done); return; }
    done(false);
  }
  function heldDialog(done) {
    st.dialog = SHELL.dialog({
      hood: 'Profile', within: opts.within, q: `<span class="bad">Not applied: ${esc(st.held)}</span>`, p: 'Fix it to keep it, or leave without it.',
      buttons: [
        { label: '<u class="sk">N</u>o, discard', cls: 'danger', key: 'n', run: (a) => { a.close(); done && done(true); st.dialog = null; } },
        { label: 'Keep editing', run: (a) => { a.close(); st.dialog = null; } },
      ],
      onEsc: (a) => { a.close(); st.dialog = null; },
    });
  }

  /* ------------------------------------------------------------ events */
  ped.addEventListener('click', (e) => {
    const v = e.target.closest('.ped-views [data-v]'); if (v) return setView(v.dataset.v);
    const k = e.target.closest('[data-k]'); if (k && (k.closest('.ped-kinds') || k.closest('.ped-rail'))) { setKind(k.dataset.k); return; }
    const ln = e.target.closest('.ped-rail [data-line]'); if (ln) return gotoLine(+ln.dataset.line);
    const sec = e.target.closest('.ped-rail [data-sec]'); if (sec) return goSec(+sec.dataset.sec);
    const row = e.target.closest('.ped-list .row'); if (row) { select(row.dataset.id); if (row.dataset.id === 'new') newEntry(); else if (L === 'c' || ped.classList.contains('sheet') || narrow()) openDetail(); else focusList(); return; }
    const a = e.target.closest('[data-act]');
    if (a) {
      const act = a.dataset.act;
      if (act === 'new') newEntry(); else if (act === 'delete') del(); else if (act === 'save') commit('save'); else if (act === 'find') openFind(false);
      else if (act === 'hfind') { hfp.hidden = false; hq.focus(); }
      else if (act === 'capture') capture(curOf());
      return;
    }
    if (e.target.closest('.ped-back')) return closeSheet();
    const sw = e.target.closest('.ped-sw'); if (sw) { pickSwatch(sw); return; }
  });
  ped.addEventListener('dblclick', (e) => { const row = e.target.closest('.ped-list .row'); if (row && row.dataset.id !== 'new') openDetail(); });
  ped.addEventListener('change', (e) => { const c = e.target.closest('[data-style]'); if (c) { const ent = curOf(); const s = parseHL(ent.body) || { styles: [], fg: null, bg: null }; s.styles = c.checked ? [...s.styles, c.dataset.style] : s.styles.filter((x) => x !== c.dataset.style); ent.body = serHL(s); st.dirty.add(ent.id); renderDetail(); updateNotes(); commit(); } });
  function pickSwatch(sw) {
    const ent = curOf(); const s = parseHL(ent.body) || { styles: [], fg: null, bg: null }, dim = sw.dataset.dim, p = { row: +sw.dataset.r, bright: +sw.dataset.c };
    const same = s[dim] && s[dim].row === p.row && s[dim].bright === p.bright; s[dim] = same ? null : p; ent.body = serHL(s); st.dirty.add(ent.id);
    renderDetail(); updateNotes(); commit();
    const again = detailHost().querySelector(`.ped-sw[data-dim="${dim}"][data-r="${p.row}"][data-c="${p.bright}"]`); if (again) again.focus();
  }
  ped.addEventListener('input', (e) => {
    const f = e.target.closest('[data-fld]'); if (!f) return;
    const ent = curOf(); if (!ent) return;
    if (f.dataset.fld === 'pattern') ent.pattern = f.value.replace(/[\r\n]+/g, ' ');
    if (f.dataset.fld === 'body') ent.body = f.value;
    st.dirty.add(ent.id); updateNotes(); status();
  });
  ped.addEventListener('focusin', () => markList(false));
  ped.addEventListener('focusout', (e) => {
    const f = e.target.closest && e.target.closest('[data-fld="pattern"]'); if (f) { const ent = curOf(); if (ent) st.visited.add(ent.id); }
    if (e.target.closest && e.target.closest('[data-fld]') && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.ped-detail, .ped-open') === e.target.closest('.ped-detail, .ped-open') && e.relatedTarget.closest('[data-fld]'))) {
      if (st.dirty.size) { const ent = curOf(); const fresh = ent && st.pinned.includes(ent.id) && e.target.dataset.fld === 'pattern' && e.relatedTarget && e.relatedTarget.dataset && e.relatedTarget.dataset.fld === 'body' && !ent.body.trim(); if (!fresh) commit(); }
    }
    setTimeout(() => markList(false), 0);
  });
  // Ctrl+S / Ctrl+F / Ctrl+H reach the editor from inside text fields too (WC.keys leaves fields alone)
  ped.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    const k = e.key.toLowerCase();
    if (k === 's') { e.preventDefault(); e.stopPropagation(); if (st.view === 'lite') { const a = document.activeElement; if (a && a.blur && a.closest('[data-fld]')) { commit('save'); } else commit('save'); } else commit('save'); }
    else if (k === 'f' || k === 'h') { e.preventDefault(); e.stopPropagation(); if (st.view === 'editor') openFind(k === 'h'); else if (st.view === 'help' && k === 'f') { hfp.hidden = false; hq.focus(); } }
  }, true);
  if (opts.within) opts.within.addEventListener('pointerdown', (e) => { if (!ped.contains(e.target)) return; });
  document.addEventListener('pointerdown', (e) => { if (!ped.contains(e.target) && st.dirty.size && st.view === 'lite' && !e.target.closest('.dlg-veil')) commit(); }, true);

  /* ------------------------------------------------------------ keys (a WC.keys layer) */
  const narrow = () => ped.getBoundingClientRect().width <= (L === 'b' ? 640 : 680);
  function zoneIs(z) {
    const a = document.activeElement; if (!a || !ped.contains(a)) return z === 'list' && !ped.contains(a);
    if (z === 'list') return a === listEl;
    if (z === 'detail') return !!a.closest('.ped-detail, .ped-open');
    if (z === 'views') return !!a.closest('.ped-views');
    if (z === 'kinds') return !!a.closest('.ped-kinds, .ped-rail');
    return false;
  }
  function focusList() { if (st.view === 'lite') { listEl.focus({ preventScroll: true }); markList(false); } }
  function focusViews() { const b = ped.querySelector('.ped-views [aria-selected="true"]'); if (b) b.focus(); }
  function focusKinds() { const b = kindsEl ? kindsEl.querySelector('[aria-selected="true"]') : null; if (b) b.focus(); else focusList(); }
  function swatchKey(e) {
    const a = document.activeElement; if (!a || !a.classList.contains('ped-sw')) return false;
    let r = +a.dataset.r, c = +a.dataset.c, dim = a.dataset.dim;
    if (e.key === 'ArrowUp') r--; else if (e.key === 'ArrowDown') r++;
    else if (e.key === 'ArrowLeft') { if (c) c = 0; else if (dim === 'bg') { dim = 'fg'; c = 1; } else return true; }
    else if (e.key === 'ArrowRight') { if (!c) c = 1; else if (dim === 'fg') { dim = 'bg'; c = 0; } else return true; }
    else if (e.key === 'Enter' || e.key === ' ') { pickSwatch(a); return true; } else return false;
    r = Math.max(0, Math.min(6, r));
    const n = detailHost().querySelector(`.ped-sw[data-dim="${dim}"][data-r="${r}"][data-c="${c}"]`); if (n) n.focus();
    return true;
  }
  const layer = {
    key(e) {
      if (opts.active && !opts.active()) return false;
      const k = e.key, plain = !e.ctrlKey && !e.altKey && !e.metaKey;
      if (swatchKey(e)) return true;
      if (k === 'Escape') { if (st.sheet && narrow()) { closeSheet(); return true; } if (st.view === 'editor' && !fp.hidden) { fp.hidden = true; st.find = null; paintBuffer(); return true; } leave(); return true; }
      if (plain && !e.shiftKey && k.length === 1) {
        const l = k.toLowerCase();
        if (l === 'l') { setView('lite'); return true; } if (l === 'e') { setView('editor'); return true; } if (l === 'h') { setView('help'); return true; }
        if (st.view === 'lite') {
          const kk = KINDS.find((x) => K[x].key === l); if (kk) { setKind(kk); if (!zoneIs('kinds')) focusList(); return true; }
          if (l === 'n') { newEntry(); return true; }
          if (l === 'd') { del(); return true; }
        }
        if (st.view === 'help' && (l === 'n' || l === 'p')) { goSec(st.helpSec + (l === 'n' ? 1 : -1)); return true; }
      }
      if (st.view === 'help') {
        if (k === 'ArrowDown') { man.scrollTop += 48; return true; } if (k === 'ArrowUp') { man.scrollTop -= 48; return true; }
        if (k === 'PageDown') { man.scrollTop += man.clientHeight - 60; return true; } if (k === 'PageUp') { man.scrollTop -= man.clientHeight - 60; return true; }
        if (k === 'Home') { goSec(0); return true; } if (k === 'End') { goSec(PDATA.help.length - 1); return true; }
        if (k === 'ArrowLeft' || k === 'ArrowRight') { if (zoneIs('views')) setView(k === 'ArrowLeft' ? 'editor' : 'help'); return true; }
        return false;
      }
      if (st.view === 'editor') {
        if (zoneIs('views') && (k === 'ArrowLeft' || k === 'ArrowRight')) { setView(k === 'ArrowLeft' ? 'lite' : 'help'); return true; }
        if (k === 'ArrowDown' || k === 'Enter') { buf.ta.focus(); return true; }
        return false;
      }
      // LITE
      if (zoneIs('views')) {
        if (k === 'ArrowRight') { setView('editor'); return true; }
        if (k === 'ArrowDown' || k === 'Enter') { focusKinds(); return true; }
        return k === 'ArrowLeft';
      }
      if (zoneIs('kinds')) {
        const i = KINDS.indexOf(st.kind);
        if ((L !== 'b' && (k === 'ArrowLeft' || k === 'ArrowRight')) || (L === 'b' && (k === 'ArrowUp' || k === 'ArrowDown') && false)) { setKind(KINDS[Math.max(0, Math.min(4, i + (k === 'ArrowLeft' ? -1 : 1)))]); focusKinds(); return true; }
        if (k === 'ArrowUp') { focusViews(); return true; }
        if (k === 'ArrowDown' || k === 'Enter') { focusList(); return true; }
        return false;
      }
      if (zoneIs('detail')) {
        const a = document.activeElement;
        if (a && a.dataset.act === 'capture' && (k === 'Enter' || k === ' ')) { capture(curOf()); return true; }
        if (k === 'ArrowLeft' && !a.closest('.ped-styles')) { focusList(); return true; }
        return false;
      }
      // the list (also when nothing in the editor has the focus)
      if (k === 'Delete' && plain) { del(); return true; }
      if (k === 'ArrowDown') { focusList(); move(1); return true; }
      if (k === 'ArrowUp') { const first = isNew() ? !entries().length : entries()[0] === curOf(); if (first && zoneIs('list') && L !== 'b') { focusKinds(); return true; } focusList(); move(-1); return true; }
      if (k === 'PageDown') { move(10); return true; } if (k === 'PageUp') { move(-10); return true; }
      if (k === 'Home') { move('home'); return true; } if (k === 'End') { move('end'); return true; }
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        if (L === 'b' || (k === 'ArrowRight' && !isNew())) { if (k === 'ArrowRight' && !isNew()) { openDetail(); return true; } const i = KINDS.indexOf(st.kind); setKind(KINDS[Math.max(0, Math.min(4, i + (k === 'ArrowLeft' ? -1 : 1)))]); focusList(); return true; }
        const i = KINDS.indexOf(st.kind); setKind(KINDS[Math.max(0, Math.min(4, i + (k === 'ArrowLeft' ? -1 : 1)))]); focusList(); return true;
      }
      if (k === 'Enter' || k === ' ') { if (isNew()) newEntry(); else openDetail(); return true; }
      return false;
    },
    back() { leave(); },
  };

  /* ------------------------------------------------------------ start */
  renderKinds(); renderRail(); renderList(); renderDetail(); renderHelp(); renderViews();
  buf.ta.value = st.text; paintBuffer();
  const api = {
    el: ped, layer, st,
    show() { st.view = 'lite'; st.base = 'lite'; renderViews(); renderKinds(); renderRail(); renderList(); renderDetail(); setTimeout(focusList, 30); },
    setView, setKind, select: (pattern) => { const e = st.doc[st.kind].find((x) => x.pattern === pattern); if (e) select(e.id); },
    flash, capture: () => { const e = curOf(); if (st.kind === 'macro' && e) capture(e); },
    confirm: () => { st.view = 'editor'; st.base = 'editor'; st.modified = true; renderViews(); paintBuffer(); leave(); },
    held: () => { st.held = 'Unbalanced braces in Commands (alias gv)'; status(); heldDialog(() => { if (opts.onLeave) opts.onLeave({ saved: false, live }); }); },
    edit: (text) => { const e = curOf(); if (!e) return; e.body = text; st.dirty.add(e.id); renderDetail(); updateNotes(); status(); },
    openSheet: openDetail, commit,
  };
  return api;
}
window.PED = { mount, parseHL, serHL };
})();
