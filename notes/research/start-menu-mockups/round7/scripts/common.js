/* =====================================================================================================
   Round 7 · Scripts group · shared JS (needs ../base/base.js and data.js first). Throwaway mockup code.

   SC.lib          the script library (the six bundled scripts + two own ones), with the page's actions
   SC.helpHTML     the typeset @help (paragraphs, - items, term tables, preformatted runs, ## headings)
   SC.luaLines     Lua → highlighted lines (tk-* classes), block comments / long strings carried over
   SC.host         the context: ?ctx=start (the start page box, wordmark in the corner) or ?ctx=game
                   (an in-game window over the real game view, ?frame=a|b, ?bg=paper, ?win=small)
   SC.dialog       a sub-page as a plate over the content (New, Rename, Delete, Export, Import, Restore)
   SC.control      a setting's control (toggle, stepper, choice, text) with keys and mouse
   SC.editor       the code surface (textarea over highlighted lines; lint, completion, signature, hover, find)
   SC.manualHTML   a manual section as typeset HTML
   ===================================================================================================== */
(() => {
'use strict';
const SC = (window.SC = {});
const qs = new URLSearchParams(location.search);
SC.qs = qs;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
SC.esc = esc;
const $ = (s, r = document) => r.querySelector(s);
SC.$ = $;
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
SC.h = h;

/* ------------------------------------------------------------------------------------------- icons */
const I = {
  lock: '<svg viewBox="0 0 10 13" aria-hidden="true"><path d="M2.6 6V4.1a2.4 2.4 0 0 1 4.8 0V6" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x=".8" y="5.6" width="8.4" height="6.6" rx="1.2" fill="currentColor"/></svg>',
  plus: '<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"/></svg>',
  imp: '<svg viewBox="0 0 16 16"><path d="M8 2.5v8M4.8 7.5 8 10.7l3.2-3.2M3 13.5h10"/></svg>',
  exp: '<svg viewBox="0 0 16 16"><path d="M8 10.5v-8M4.8 5.5 8 2.3l3.2 3.2M3 13.5h10"/></svg>',
  book: '<svg viewBox="0 0 16 16"><path d="M8 4.2C6.6 3 4.6 2.6 2.5 2.8v9.6c2.1-.2 4.1.2 5.5 1.4 1.4-1.2 3.4-1.6 5.5-1.4V2.8C11.4 2.6 9.4 3 8 4.2zM8 4.2v9.6"/></svg>',
  edit: '<svg viewBox="0 0 16 16"><path d="M10.5 2.8l2.7 2.7-7.6 7.6-3.3.6.6-3.3z"/><path d="M9.2 4.1l2.7 2.7"/></svg>',
  ren: '<svg viewBox="0 0 16 16"><path d="M2.5 11.5h7M2.5 8h5M11.5 3.5v9M10 3.5h3M10 12.5h3"/></svg>',
  del: '<svg viewBox="0 0 16 16"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9"/></svg>',
  save: '<svg viewBox="0 0 16 16"><path d="M3 2.8h8.2l1.8 1.8v8.6H3z"/><path d="M5.2 2.8v3.4h5V2.8M5.2 13.2V9.4h5.6v3.8"/></svg>',
  find: '<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2l3.3 3.3"/></svg>',
  dup: '<svg viewBox="0 0 16 16"><rect x="5.5" y="5.5" width="7.5" height="7.5" rx="1"/><path d="M10.5 5.5V3.5a.9.9 0 0 0-1-1h-6a.9.9 0 0 0-1 1v6a.9.9 0 0 0 1 1h2"/></svg>',
  reset: '<svg viewBox="0 0 16 16"><path d="M3.2 8a4.8 4.8 0 1 0 1.5-3.5"/><path d="M4.4 2.2v2.7h2.7"/></svg>',
  back: '<svg viewBox="0 0 16 16"><path d="M9.8 3.2 5 8l4.8 4.8"/></svg>',
  fold: '<svg viewBox="0 0 10 10"><path d="M2 3.5 5 6.5l3-3"/></svg>',
  left: '<svg viewBox="0 0 10 10"><path d="M6.5 2 3.5 5l3 3"/></svg>',
  right: '<svg viewBox="0 0 10 10"><path d="M3.5 2l3 3-3 3"/></svg>',
  up: '<svg viewBox="0 0 16 16"><path d="M4 10l4-4 4 4"/></svg>',
  down: '<svg viewBox="0 0 16 16"><path d="M4 6l4 4 4-4"/></svg>',
  info: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.6"/><path d="M8 7.4v3.8M8 5.2v.1"/></svg>',
  x: '<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  rail: '<svg viewBox="0 0 16 16"><rect x="2.5" y="3" width="11" height="10" rx="1"/><path d="M10 3v10"/></svg>',
};
SC.I = I;
/** A glass button: label html may hold <u class="sk">; opts: kind ('primary'|'danger'), icon, small, disabled, title, id */
SC.btn = (label, o = {}) => `<button type="button" class="ibtn${label ? '' : ' keep-ic'}${o.kind ? ' ' + o.kind : ''}${o.small ? ' small' : ''}${o.cls ? ' ' + o.cls : ''}"${o.id ? ` id="${o.id}"` : ''}${o.act ? ` data-act="${o.act}"` : ''}${o.disabled ? ' disabled' : ''}${o.title ? ` title="${esc(o.title)}"` : ''}>${o.icon ? I[o.icon] : ''}<span>${label}</span></button>`;

/* ------------------------------------------------------------------------------------------- the library */
const SD = window.SD;
const LUA_LIBS = ['string', 'table', 'math', 'utf8', 'coroutine'];
const LUA_BASE = ['assert', 'error', 'getmetatable', 'ipairs', 'next', 'pairs', 'pcall', 'rawequal', 'rawget', 'rawlen', 'rawset', 'select', 'setmetatable', 'tonumber', 'tostring', 'type', 'xpcall', 'unpack'];
const KEYWORDS = new Set(['and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'goto', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while']);
const apiNames = new Set(Object.keys(SD.api).map((n) => n.split(/[.:]/)[0]));
const known = (w) => apiNames.has(w) || LUA_LIBS.includes(w) || LUA_BASE.includes(w);
SC.known = known;

const ctxGame = () => qs.get('ctx') === 'game' && innerWidth > 600;
const lineOf = (src, needle) => src.split('\n').findIndex((l) => l.includes(needle)) + 1;
const RESCUE_ERR = `rescue:${lineOf(SD.code.rescue, 'send("rescue "')}: attempt to concatenate a nil value (upvalue 'tank')`;
const TEMPLATE = (n) => `-- @name     ${n}\n-- @summary  What this script does\n-- @api      1\n-- @help     How to use it: one line per @help tag.\n\ntempTrigger("You are hungry.", function()\n  echo("Time to eat!")\nend)\n`;
const blankHeader = (n) => ({ name: n, summary: 'What this script does', api: 1, aliases: [], keys: [], settings: [], help: ['How to use it: one line per @help tag.'], problems: [] });

function makeLib() {
  const game = ctxGame();
  const empty = qs.has('empty');
  const mk = (name, o = {}) => {
    const header = SD.headers[name];
    return { name, header, bundled: !!o.bundled, readonly: !!o.bundled, enabled: o.enabled !== false, lastError: o.lastError || null, loadProblem: null,
      values: o.values || {}, running: game ? (o.enabled !== false && !o.lastError) : null, source: SD.code[name] || null };
  };
  let list = empty ? [] : [
    mk('almanac', { bundled: true }),
    mk('autoeat', { enabled: false, values: { food: 'apple' } }),
    mk('coinlooter', { bundled: true, values: { delay: 1.5 } }),
    mk('keymanager', { bundled: true }),
    mk('mapsearch', { bundled: true, enabled: false }),
    mk('mercenaries', { bundled: true, values: { cost: 20, warn: 10 } }),
    mk('readability', { bundled: true, values: { arrows: false } }),
    mk('rescue', { lastError: RESCUE_ERR }),
  ];
  const subs = new Set();
  const emit = () => subs.forEach((f) => f());
  const lib = {
    get list() { return list; },
    get: (n) => list.find((s) => s.name === n) || null,
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
    value: (s, d) => (d.name in s.values ? s.values[d.name] : d.default),
    changed: (s) => s.header.settings.some((d) => lib.value(s, d) !== d.default),
    toggle(s) { s.enabled = !s.enabled; s.running = game ? (s.enabled && !s.lastError) : null; emit();
      return s.enabled ? (game ? `${s.name} is on.` : `${s.name} is on. It runs when you enter MUME.`) : `${s.name} is off.`; },
    set(s, d, v) { if (v === d.default) delete s.values[d.name]; else s.values[d.name] = v; emit(); },
    reset(s) { const names = s.header.settings.filter((d) => lib.value(s, d) !== d.default).map((d) => d.name); s.values = {}; emit();
      return names.length ? `Reset ${names.join(', ')} to the default${names.length > 1 ? 's' : ''}.` : 'Nothing to reset.'; },
    nameError(n, from) {
      if (!n) return 'A name is needed.';
      if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(n)) return 'A letter, then letters, digits, _ or -.';
      if (n.length > 32) return 'At most 32 characters.';
      if (n !== from && list.some((s) => s.name.toLowerCase() === n.toLowerCase())) return `There is already a script named ${n}.`;
      return null;
    },
    create(n) { const s = { name: n, header: blankHeader(n), bundled: false, readonly: false, enabled: false, lastError: null, loadProblem: null, values: {}, running: game ? false : null, source: TEMPLATE(n) };
      list = [...list, s].sort((a, b) => a.name.localeCompare(b.name)); emit(); return s; },
    rename(s, n) { s.name = n; s.header = { ...s.header, name: n }; list.sort((a, b) => a.name.localeCompare(b.name)); emit(); },
    remove(s) { const i = list.indexOf(s); list = list.filter((x) => x !== s); emit(); return list[Math.min(i, list.length - 1)] || null; },
    importFile() { let n = 'healer'; if (list.some((s) => s.name === n)) n = 'healer-2';
      const s = { ...mk('rescue'), name: n, header: { ...SD.headers.rescue, name: n }, enabled: false, lastError: null, running: game ? false : null };
      list = [...list, s].sort((a, b) => a.name.localeCompare(b.name)); emit(); return s; },
  };
  return lib;
}
SC.lib = makeLib();

/** What a script is doing: { dot: on|wait|off|bad, text, cls, mark } (scripts-model.ts scriptState). */
SC.state = (s) => {
  const failed = !!(s.lastError || s.loadProblem);
  if (!s.enabled) return { dot: 'off', text: 'off', cls: '', mark: '' };
  if (s.running === true) return { dot: 'on', text: 'on · running', cls: 'ok', mark: 'on' };
  if (failed) return { dot: 'bad', text: 'on · not running', cls: 'bad', mark: 'bad' };
  if (s.running === null) return { dot: 'wait', text: 'on · runs when you enter MUME', cls: 'ok', mark: '' };
  return { dot: 'wait', text: 'on · starting', cls: 'ok', mark: '' };
};
SC.problem = (s) => (s.loadProblem ? `Cannot load: ${s.loadProblem}` : s.lastError);
SC.stateHTML = (s, o = {}) => { const st = SC.state(s); return `<span class="sc-st ${st.cls}"><i class="sc-dot ${st.dot}"></i>${st.text}</span>${s.bundled && !o.noRo ? `<span class="sc-ro">${I.lock}bundled · read-only</span>` : ''}`; };
SC.markHTML = (s) => { const st = SC.state(s); return st.mark === 'on' ? '<i class="sc-dot on" title="Running"></i>' : st.mark === 'bad' ? `<i class="sc-dot bad" title="${esc(SC.problem(s))}"></i>` : ''; };
SC.lockHTML = (s) => (s.bundled ? `<span class="sc-lock" title="Bundled with WebCockpit: read-only. Duplicate it to change it.">${I.lock}</span>` : '');
/** The problems block of the detail (load problem, last error, header problems). */
SC.problemsHTML = (s) => {
  const out = [];
  if (s.loadProblem) out.push(`Cannot load: ${esc(s.loadProblem)}`);
  if (s.lastError) { const m = /^([\w-]+:\d+): (.*)$/.exec(s.lastError); out.push(m ? `Last error: <span class="mono">${esc(m[1])}</span> ${esc(m[2])}` : `Last error: ${esc(s.lastError)}`); }
  for (const p of s.header.problems || []) out.push(`Header ${esc(p)}`);
  return out.map((t) => `<div class="sc-problem">${t}</div>`).join('');
};

/* ------------------------------------------------------------------------------------------- help typesetting (ADR 0121) */
const codeTerm = (t) => /^[a-z#$]|[<>[\]|]|^(F\d+|Ctrl|Alt|Shift)\b/.test(t);
SC.helpHTML = (lines, s) => {
  if (!lines || !lines.length) {
    const hd = s && s.header;
    const none = hd && (hd.summary || hd.settings.length || hd.aliases.length) ? 'No help.' : 'No help yet. Add @summary, @help, @alias, @key and @setting lines to the header.';
    return `<p class="sc-none">${none}</p>`;
  }
  const L = lines.map((raw) => { const t = raw.replace(/\t/g, '    '); const ind = t.length - t.trimStart().length; return { ind, text: t.trim() }; });
  const out = [];
  let i = 0;
  while (i < L.length) {
    const l = L[i];
    if (!l.text) { i++; continue; }
    if (l.ind === 0) {
      if (l.text.startsWith('## ')) { out.push(`<h4>${esc(l.text.slice(3))}</h4>`); i++; continue; }
      if (/^[-•] /.test(l.text)) {
        const items = [];
        while (i < L.length && L[i].ind === 0 && L[i].text && /^[-•] /.test(L[i].text)) {
          let t = L[i].text.slice(2); i++;
          while (i < L.length && L[i].ind === 0 && L[i].text && !/^[-•] /.test(L[i].text) && !L[i].text.startsWith('## ')) { t += ' ' + L[i].text; i++; }
          items.push(`<li>${esc(t)}</li>`);
        }
        out.push(`<ul>${items.join('')}</ul>`); continue;
      }
      let t = l.text; i++;
      while (i < L.length && L[i].ind === 0 && L[i].text && !/^[-•] /.test(L[i].text) && !L[i].text.startsWith('## ')) { t += ' ' + L[i].text; i++; }
      out.push(`<p>${esc(t)}</p>`); continue;
    }
    // an indented run: a term table, else preformatted
    const run = [];
    while (i < L.length && L[i].ind > 0 && L[i].text) { run.push(L[i]); i++; }
    const base = Math.min(...run.map((r) => r.ind));
    const rows = []; let table = true;
    for (const r of run) {
      if (r.ind === base) {
        const m = /^(\S(?:.*?\S)?)\s{2,}(\S.*)$/.exec(r.text);
        if (!m || /[.!?]$/.test(m[1])) { table = false; break; }
        rows.push([m[1], m[2]]);
      } else if (rows.length) rows[rows.length - 1][1] += ' ' + r.text; else { table = false; break; }
    }
    if (table && rows.length) out.push(`<dl class="t2">${rows.map(([a, b]) => `<dt class="${codeTerm(a) ? 'cmd' : ''}">${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl>`);
    else out.push(`<pre>${run.map((r) => esc(' '.repeat(r.ind - base) + r.text)).join('\n')}</pre>`);
  }
  return `<div class="sc-help">${out.join('')}</div>`;
};
/** Commands (@alias, @key) as a two-column grid; '' when none. */
SC.cmdsHTML = (s) => {
  const hd = s.header;
  if (!hd.aliases.length && !hd.keys.length) return '';
  return `<div class="sc-cmds">${hd.aliases.map((a) => `<span class="c">${esc(a.name)}</span><span class="t">${esc(a.text)}</span>`).join('')}${hd.keys.map((k) => `<span class="c"><span class="sc-key">${esc(k.key)}</span></span><span class="t">${esc(k.text)}</span>`).join('')}</div>`;
};

/* ------------------------------------------------------------------------------------------- Lua highlighting */
/** Highlighted HTML per line. `state` carries an open block comment / long string across lines. */
SC.luaLines = (src) => {
  const out = []; let open = null; // { cls, close }
  for (const line of src.split('\n')) {
    let i = 0, html = '';
    const push = (cls, t) => { html += cls ? `<span class="${cls}">${esc(t)}</span>` : esc(t); };
    if (open) {
      const j = line.indexOf(open.close);
      if (j < 0) { push(open.cls, line); out.push(html); continue; }
      push(open.cls, line.slice(0, j + open.close.length)); i = j + open.close.length; open = null;
    }
    while (i < line.length) {
      const rest = line.slice(i), c = line[i];
      let m;
      if ((m = /^--\[(=*)\[/.exec(rest))) { const close = `]${m[1]}]`, j = line.indexOf(close, i + m[0].length); if (j < 0) { push('tk-c', rest); open = { cls: 'tk-c', close }; i = line.length; } else { push('tk-c', line.slice(i, j + close.length)); i = j + close.length; } continue; }
      if (rest.startsWith('--')) { push('tk-c', rest); break; }
      if ((m = /^\[(=*)\[/.exec(rest))) { const close = `]${m[1]}]`, j = line.indexOf(close, i + m[0].length); if (j < 0) { push('tk-s', rest); open = { cls: 'tk-s', close }; i = line.length; } else { push('tk-s', line.slice(i, j + close.length)); i = j + close.length; } continue; }
      if (c === '"' || c === "'") { let j = i + 1; while (j < line.length && line[j] !== c) j += line[j] === '\\' ? 2 : 1; j = Math.min(line.length, j + 1); push('tk-s', line.slice(i, j)); i = j; continue; }
      if ((m = /^(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+)/.exec(rest)) && !/[\w.]/.test(line[i - 1] || '')) { push('tk-n', m[0]); i += m[0].length; continue; }
      if ((m = /^[A-Za-z_]\w*/.exec(rest))) { const w = m[0], prev = line[i - 1] || ''; push(KEYWORDS.has(w) ? 'tk-k' : (prev !== '.' && prev !== ':' && known(w)) ? 'tk-f' : '', w); i += w.length; continue; }
      if ((m = /^(==|~=|<=|>=|\.\.\.?|[=<>+\-*/%#^])/.exec(rest))) { push('tk-o', m[0]); i += m[0].length; continue; }
      push('', c); i++;
    }
    out.push(html);
  }
  return out;
};
/** A static code block (import preview, manual examples). */
SC.codeHTML = (src, o = {}) => {
  const lines = SC.luaLines(src);
  if (o.gutter === false) return `<pre class="code sc-code">${lines.map((l) => l || ' ').join('\n')}</pre>`;
  return `<div class="code sc-code"><div class="code-gut">${lines.map((_, i) => i + 1).join('\n')}</div><pre class="code-src">${lines.map((l) => `<span class="code-line">${l || ' '}</span>`).join('')}</pre></div>`;
};

/* ------------------------------------------------------------------------------------------- the host */
/**
 * SC.host({ title, note, frame: 'a'|'b', menuKey, build(root, host) → layer, onRootBack, canClose, open })
 * The page's content goes in `root` (.sc-root). `layer` = { key(e) → bool, back() → bool } — back returns
 * true when it handled Esc inside the page (a dialog, a zone); false → the host leaves the page.
 */
SC.host = (opts) => {
  const game = ctxGame();
  const root = h('<div class="sc-root"></div>');
  const host = { ctx: game ? 'game' : 'start', root, game, inlineBack: false };
  let layer = { key: () => false, back: () => false };
  const qsWith = (k, v) => { const u = new URLSearchParams(location.search); if (v === null) u.delete(k); else u.set(k, v); return '?' + u.toString(); };
  host.url = (file, extra = {}) => { const u = new URLSearchParams(); for (const k of ['ctx', 'bg', 'frame', 'win', 'rm', 'slow', 't', 'm', 'w']) if (qs.has(k)) u.set(k, qs.get(k)); u.set('open', ''); u.set('nointro', ''); for (const [k, v] of Object.entries(extra)) u.set(k, v); return `${file}?${u.toString().replace(/=(&|$)/g, '$1')}`; };
  host.go = (file, extra) => { location.href = host.url(file, extra); };

  if (game) {
    const ig = WC.ingame({});
    host.ig = ig;
    const frame = qs.get('frame') || opts.frame || 'a';
    const small = qs.get('win') === 'small';
    const w = h(`<div class="wwin win-${frame}" data-title="${esc(opts.title)}" data-note="${esc(opts.note || '')}"></div>`);
    w.append(root); document.body.append(w);
    const big = () => ({ x: 26, y: 24, w: Math.min(900, innerWidth - 52), h: Math.min(660, innerHeight - 80) });
    const sm = () => ({ x: 40, y: 60, w: 560, h: Math.min(480, innerHeight - 100) });
    const g = small ? sm() : big();
    const win = WC.window(w, { ...g, minW: 360, minH: 260, onClose: () => request() });
    host.win = win;
    ig.markBar('scripts');
    const show = () => { w.hidden = false; win.focus(); ig.markBar('scripts'); };
    const hide = () => { w.hidden = true; w.removeAttribute('data-focused'); ig.markBar(null); };
    const request = () => { if (opts.canClose && opts.canClose() === false) return; hide(); };
    host.close = hide;
    // the menu bar's Scripts icon in the backdrop: toggles the window (closed → open; focused → close request; else focus)
    const hot = h('<button class="sc-barhot" title="Scripts (the menu bar)" aria-label="Scripts window"></button>');
    hot.style.left = '807px';
    $('.igbg').append(hot);
    hot.addEventListener('pointerdown', (e) => e.stopPropagation(), true);
    hot.addEventListener('click', () => { if (w.hidden) show(); else if (w.hasAttribute('data-focused')) request(); else win.focus(); });
    const setRect = (r) => { Object.assign(win.rect, r); w.style.left = r.x + 'px'; w.style.top = r.y + 'px'; w.style.width = r.w + 'px'; w.style.height = r.h + 'px'; };
    const d = WC.demoExtra(`<div class="row2">Frame <button data-f="a">Lykta</button><button data-f="b">Glass</button></div><div class="row2">Window <button data-s="big">Large</button><button data-s="small">Small</button></div>`);
    d.querySelectorAll('[data-f]').forEach((b) => { b.classList.toggle('on', b.dataset.f === frame); b.addEventListener('click', () => { location.search = qsWith('frame', b.dataset.f); }); });
    d.querySelectorAll('[data-s]').forEach((b) => { b.classList.toggle('on', (b.dataset.s === 'small') === small); b.addEventListener('click', () => { d.querySelectorAll('[data-s]').forEach((x) => x.classList.toggle('on', x === b)); setRect(b.dataset.s === 'small' ? sm() : big()); show(); }); });
    const focused = () => w.hasAttribute('data-focused') && !w.hidden;
    WC.keys.push({ key: (e) => focused() && layer.key(e), back: () => { if (!focused()) return; if (!layer.back()) { if (opts.onRootBack) opts.onRootBack(); else request(); } } });
    host.setTitle = (t) => { const e = w.querySelector('.w-t'); if (e) e.textContent = t; };
    host.setNote = (t) => { const e = w.querySelector('.w-n'); if (e) e.textContent = t; else if (t) { const hd = w.querySelector('.w-hood, .w-bar'); hd.querySelector('.w-t').insertAdjacentHTML('afterend', `<span class="w-n">${esc(t)}</span>`); } };
    host.inlineBack = !!opts.depth;
    layer = opts.build(root, host) || layer;
    return host;
  }

  // ---- the start page: sky, menu, the large box, the wordmark lands in the corner (layout A's resting state)
  WC.sky.start();
  const menu = WC.startMenu({ onActivate(k) { if (k === (opts.menuKey || 'scripts')) { open(); return true; } } });
  const mark = h('<div class="wm small bare" id="mark" title="Start (Esc)" aria-label="MUME Cockpit — back to the start"></div>');
  const page = h(`<section class="lp box-large" id="page" data-hood="${esc(opts.title)}" data-back aria-label="${esc(opts.title)}"><div class="win"></div></section>`);
  page.querySelector('.win').append(root);
  document.body.append(mark, page);
  WC.decorate();
  WC.Wordmark(mark);
  const brand = menu.brand;
  host.menu = menu;
  host.setTitle = (t) => { const e = page.querySelector('.hood .t'); if (e) e.textContent = t; };
  host.setNote = () => {};
  const EASE = 'cubic-bezier(.45,.05,.2,1)';
  let pop = null, isOpen = false;
  mark.addEventListener('click', () => { if (isOpen && !WC.busy) leave(); });
  async function open(instant = false) {
    if (isOpen || WC.busy) return;
    WC.busy = true; isOpen = true; menu.active = false;
    if (instant) document.body.classList.add('instant');
    document.body.classList.add('pg', 'pgv');
    if (opts.onShow) opts.onShow();
    const from = WC.rect(brand), to = mark.querySelector('.wm-c').getBoundingClientRect();
    const D = instant ? 0 : WC.dur(1), anims = [];
    if (WC.RM || instant) {
      anims.push(brand.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260 * D, fill: 'forwards' }));
      anims.push(mark.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260 * D, fill: 'forwards' }));
    } else {
      anims.push(brand.animate([{ transform: 'none', opacity: 1 }, { transform: WC.flyTo(from, to), opacity: 1, offset: .78 }, { transform: WC.flyTo(from, to), opacity: 0 }], { duration: 950 * D, easing: EASE, fill: 'forwards' }));
      anims.push(mark.animate([{ opacity: 0 }, { opacity: 0, offset: .72 }, { opacity: 1 }], { duration: 950 * D, fill: 'forwards' }));
    }
    anims.push(page.animate([{ opacity: 0, transform: 'translateY(22px) scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: (WC.RM ? 260 : 700) * D, delay: (WC.RM ? 0 : 180) * D, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }));
    await Promise.all(anims.map((a) => a.finished));
    document.body.classList.add('landed'); document.body.classList.remove('instant');
    pop = WC.keys.push({ key: (e) => layer.key(e), back: () => { if (!layer.back()) { if (opts.onRootBack) opts.onRootBack(); else leave(); } } });
    WC.busy = false;
    if (opts.onOpened) opts.onOpened();
  }
  async function leave() {
    if (!isOpen || WC.busy) return;
    if (opts.canClose && opts.canClose() === false) return;
    WC.busy = true; pop && pop(); pop = null;
    document.body.classList.remove('landed');
    const from = WC.rect(brand), to = mark.querySelector('.wm-c').getBoundingClientRect();
    const D = WC.dur(1), anims = [];
    anims.push(page.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(18px) scale(.985)' }], { duration: (WC.RM ? 220 : 450) * D, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' }));
    if (WC.RM) {
      anims.push(mark.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220 * D, fill: 'forwards' }));
      anims.push(brand.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260 * D, fill: 'forwards' }));
    } else {
      anims.push(mark.animate([{ opacity: 1 }, { opacity: 0, offset: .22 }, { opacity: 0 }], { duration: 900 * D, fill: 'forwards' }));
      anims.push(brand.animate([{ transform: WC.flyTo(from, to), opacity: 0 }, { transform: WC.flyTo(from, to), opacity: 1, offset: .2 }, { transform: 'none', opacity: 1 }], { duration: 900 * D, easing: EASE, fill: 'forwards' }));
    }
    setTimeout(() => document.body.classList.remove('pg'), (WC.RM ? 120 : 250) * D);
    await Promise.all(anims.map((a) => a.finished));
    document.body.classList.remove('pgv');
    anims.forEach((a) => a.cancel());
    isOpen = false; menu.active = true; menu.select(menu.cur); WC.busy = false;
  }
  host.close = leave;
  host.open = open;
  layer = opts.build(root, host) || layer;
  menu.select(2);
  if (qs.has('open') || opts.open) open(true);
  return host;
};
/** The inline Back of a sub-page inside an in-game window (the box has its own, top left). */
SC.inlineBack = (host) => (host.inlineBack ? `<button type="button" class="backbtn sc-iback" style="position:static" data-act="back" aria-label="Back (Esc)">${I.back}Back</button>` : '');

/* ------------------------------------------------------------------------------------------- dialogs */
/**
 * SC.dialog(root, { title, html, wide, buttons: [{ label, kind, key, run, primary }], anyKeyCancels, onOpen(el) })
 * A sub-page as a plate over the content. Keys: the buttons' letters, Enter = the primary, Esc = cancel.
 */
SC.dialog = (root, o) => {
  const back = h(`<div class="sc-dlg-back"><div class="sc-dlg${o.wide ? ' wide' : ''}" role="dialog" aria-label="${esc(o.title)}"><div class="in"><h2>${esc(o.title)}</h2>${o.html}<div class="btnrow"></div></div></div></div>`);
  const row = back.querySelector('.btnrow');
  const close = () => { back.remove(); popKeys(); if (o.onClose) o.onClose(); };
  const btns = (o.buttons || []).map((b) => { const el = h(SC.btn(b.label, { kind: b.kind, icon: b.icon })); el.addEventListener('click', () => b.run ? b.run(close) : close()); row.append(el); return { ...b, el }; });
  back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
  root.append(back);
  const popKeys = WC.keys.push({
    key(e) {
      if (e.ctrlKey || e.altKey || e.metaKey) return false;
      const k = e.key.toLowerCase();
      const b = btns.find((x) => x.key && x.key === k);
      if (b) { b.el.click(); return true; }
      if (e.key === 'Enter') { const p = btns.find((x) => x.primary); if (p) { p.el.click(); return true; } }
      if (o.keys && o.keys(e)) return true;
      if (o.anyKeyCancels && !['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(e.key)) { close(); return true; }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const els = btns.map((x) => x.el); const i = els.indexOf(document.activeElement); const n = els[(i + (e.key === 'ArrowLeft' ? -1 : 1) + els.length) % els.length]; n && n.focus(); return true; }
      return false;
    },
    back: close,
  });
  const api = { el: back, close, btns };
  if (o.onOpen) o.onOpen(back, api);
  const f = back.querySelector('input'); if (f) setTimeout(() => f.focus(), 30);
  return api;
};

/** The page's common dialogs: New/Rename, Delete, Export, Import (a .lua), Restore (a backup). */
SC.dialogs = (root, lib, say, go) => ({
  name(mode, from, done) {
    const d = SC.dialog(root, {
      title: mode === 'create' ? 'New Script' : 'Rename Script',
      html: `<p class="q">${mode === 'create' ? 'Name of the new script:' : `Rename “${esc(from.name)}” to:`}</p><input class="field mono" maxlength="40" spellcheck="false" autocomplete="off" aria-label="Script name" value="${mode === 'rename' ? esc(from.name) : ''}" placeholder="myscript"><p class="n">A letter, then letters, digits, _ or -. At most 32.</p><div class="err"></div>`,
      buttons: [{ label: 'Cancel', run: (c) => c() }, { label: mode === 'create' ? 'Create' : 'Rename', kind: 'primary', primary: true, run: (c) => ok(c) }],
    });
    const f = d.el.querySelector('input'), er = d.el.querySelector('.err');
    const ok = (c) => {
      const n = f.value.trim();
      if (mode === 'rename' && n === from.name) return c();
      const e = lib.nameError(n, mode === 'rename' ? from.name : undefined);
      if (e) { er.textContent = e; f.classList.add('bad'); f.focus(); return; }
      c();
      if (mode === 'create') { const s = lib.create(n); done(s, 'create'); } else { lib.rename(from, n); say(`Renamed to ${n}.`); done(from, 'rename'); }
    };
    f.addEventListener('input', () => { er.textContent = ''; f.classList.remove('bad'); });
    f.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); ok(d.close); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); d.close(); } });
    if (mode === 'rename') setTimeout(() => f.select(), 40);
  },
  del(s, done) {
    SC.dialog(root, {
      title: 'Delete Script',
      html: `<p class="q">Delete script <b>${esc(s.name)}</b>?</p><p class="n">Its settings and saved data go too.</p>`,
      buttons: [{ label: 'Cancel', key: 'n', run: (c) => c() }, { label: '<u class="sk">Y</u>es, delete', kind: 'danger', key: 'y', icon: 'del', run: (c) => { c(); const next = lib.remove(s); say(`Deleted ${s.name}.`); done(next); } }],
      anyKeyCancels: true,
    });
  },
  exp(s) {
    const d = SC.dialog(root, {
      title: 'Export Scripts',
      html: `<div class="rows opts"><div class="row" data-k="one"><span class="sc-name">This script</span><span class="dim mono" style="font-size:12.5px">${esc(s.name)}.lua</span></div><div class="row" data-k="all"><span class="sc-name">All scripts and their data</span><span class="dim" style="font-style:italic">backup</span></div></div><p class="n">A backup holds your own scripts, every script's settings and saved data. Import reads it back.</p>`,
      buttons: [{ label: 'Cancel', run: (c) => c() }],
      keys: (e) => list.key(e),
    });
    const run = (i) => { d.close(); if (i === 0) say(`Exported ${s.name}.lua.`); else { const n = lib.list.filter((x) => !x.bundled).length; say(`Exported ${n} script${n === 1 ? '' : 's'} and all settings to webcockpit-scripts-2026-11-07.json.`); } };
    const list = WC.list(d.el.querySelector('.opts'), { onActivate: run, activateOn: 'click' });
  },
  imp(done) {
    const src = SD.code.rescue.replace(/rescue/g, 'healer').replace('Rescues the tank', 'Heals the tank').replace(/send\("healer " \.\. tank\)/, 'send("cast \'cure light\' " .. tank)');
    const d = SC.dialog(root, {
      title: 'Import Script', wide: true,
      html: `<p class="warn">This script can send commands to the game as you.</p><p class="n">Read <span class="mono" style="font-size:13px">healer.lua</span> before you import it. It is added turned off.</p>${SC.codeHTML(src)}`,
      buttons: [{ label: 'Cancel', run: (c) => c() }, { label: '<u class="sk">I</u>mport', kind: 'primary', key: 'i', primary: true, icon: 'imp', run: (c) => { c(); const s = lib.importFile(); say(`Imported ${s.name} from healer.lua. It is off until you turn it on.`); done(s); } }],
      keys: (e) => { const c = d.el.querySelector('.code'); if (e.key === 'y' || e.key === 'Y') { d.btns[1].el.click(); return true; } const step = { ArrowDown: 22, ArrowUp: -22, PageDown: c.clientHeight - 30, PageUp: -(c.clientHeight - 30) }[e.key]; if (step) { c.scrollTop += step; return true; } if (e.key === 'Home' || e.key === 'End') { c.scrollTop = e.key === 'Home' ? 0 : c.scrollHeight; return true; } return false; },
    });
  },
  restore(done) {
    SC.dialog(root, {
      title: 'Restore Scripts',
      html: `<p class="warn">These scripts can send commands to the game as you.</p><p class="q">Restore from <span class="mono" style="font-size:14px">webcockpit-scripts-2026-10-30.json</span>?</p><p class="n" style="margin-top:10px">3 scripts: autoeat, rescue, tankwatch</p><p class="n">Settings and saved data of 8 scripts.</p><p class="n" style="margin-top:10px;color:var(--c-faint)">Only what is missing is added; nothing here is replaced. Scripts are added turned off.</p>`,
      buttons: [{ label: 'Cancel', key: 'n', run: (c) => c() }, { label: '<u class="sk">R</u>estore', kind: 'primary', key: 'r', primary: true, run: (c) => { c(); say('Restored 1 script, 2 already present, settings and data of 8. Restored scripts are off.'); done(); } }],
      keys: (e) => { if (e.key === 'y' || e.key === 'Y') { SC.$('.sc-dlg .ibtn.primary').click(); return true; } return false; },
    });
  },
  /** IMPORT: the file picker (a mockup: a choice of two example files). */
  pick(done) {
    const d = SC.dialog(root, {
      title: 'Import',
      html: `<p class="n">The browser's file picker opens here (<span class="mono" style="font-size:13px">.lua</span> or a backup <span class="mono" style="font-size:13px">.json</span>). In this mockup, pick one:</p><div class="rows opts"><div class="row"><span class="mono" style="font-size:13px">healer.lua</span><span class="dim" style="margin-left:auto;font-style:italic">a script</span></div><div class="row"><span class="mono" style="font-size:13px">webcockpit-scripts-2026-10-30.json</span><span class="dim" style="margin-left:auto;font-style:italic">a backup</span></div></div>`,
      buttons: [{ label: 'Cancel', run: (c) => c() }],
      keys: (e) => list.key(e),
    });
    const list = WC.list(d.el.querySelector('.opts'), { activateOn: 'click', onActivate: (i) => { d.close(); if (i === 0) this.imp(done); else this.restore(done); } });
  },
});

/* ------------------------------------------------------------------------------------------- setting controls */
/**
 * SC.control(decl, value, onSet(v, say)) → { el, adjust(dir -1|0|1), type(ch), editing() }
 * boolean: a toggle · number: ◂ value ▸ unit (click the value or a digit to type) · choice: a segmented
 * control · string: a text well (Enter or click edits). Saved at once through onSet.
 */
SC.control = (d, v, onSet) => {
  const el = h('<span class="sc-ctl"></span>');
  let val = v, ed = null;
  const fmt = (x) => (typeof x === 'number' ? String(Number(x.toPrecision(12))) : String(x));
  const clamp = (x) => (d.min !== undefined && x < d.min ? d.min : d.max !== undefined && x > d.max ? d.max : x);
  const step = (x, dir) => { const st = d.step || 1, k = x / st, on = Math.abs(k - Math.round(k)) < 1e-9; const n = (dir > 0 ? (on ? Math.round(k) + 1 : Math.ceil(k)) : on ? Math.round(k) - 1 : Math.floor(k)) * st; return clamp(Number(n.toPrecision(12))); };
  const set = (x, say) => { if (x === val) return; val = x; render(); onSet(x, say); };
  const api = { el, get value() { return val; }, editing: () => !!ed };
  function startEdit(text, selectAll) {
    if (d.type !== 'number' && d.type !== 'string') return;
    const inp = h(`<input class="${d.type === 'number' ? 'sc-val' : 'sc-str'}" spellcheck="false" autocomplete="off" aria-label="${esc(d.name)}">`);
    inp.value = text;
    const target = el.querySelector(d.type === 'number' ? '.sc-val' : '.sc-str');
    target.replaceWith(inp); ed = inp; inp.focus();
    if (selectAll) inp.select(); else inp.setSelectionRange(inp.value.length, inp.value.length);
    const finish = (keep) => {
      if (!ed) return; ed = null;
      if (keep) {
        if (d.type === 'number') { const t = inp.value.trim(), n = Number(t); if (t === '' || !Number.isFinite(n)) { render(); onSet(null, `${d.name} must be a number.`); return; } set(clamp(n), true); }
        else set(inp.value, true);
      }
      render();
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } else if (e.key === 'Tab') finish(true); });
    inp.addEventListener('blur', () => finish(true));
  }
  function render() {
    if (d.type === 'boolean') {
      el.innerHTML = `<input type="checkbox" class="tog" ${val ? 'checked' : ''} aria-label="${esc(d.name)}"><span class="sw-t">${val ? 'On' : 'Off'}</span>`;
      el.querySelector('input').addEventListener('change', (e) => set(e.target.checked));
    } else if (d.type === 'number') {
      el.innerHTML = `<button type="button" class="sc-step" data-d="-1" aria-label="Less" ${d.min !== undefined && val <= d.min ? 'disabled' : ''}>${I.left}</button><button type="button" class="sc-val" title="Click to type a value${d.min !== undefined ? ` (${fmt(d.min)}–${fmt(d.max)})` : ''}">${fmt(val)}</button><button type="button" class="sc-step" data-d="1" aria-label="More" ${d.max !== undefined && val >= d.max ? 'disabled' : ''}>${I.right}</button>${d.unit ? `<span class="sc-unit">${esc(d.unit)}</span>` : ''}`;
      el.querySelectorAll('.sc-step').forEach((b) => b.addEventListener('click', () => set(step(val, +b.dataset.d))));
      el.querySelector('.sc-val').addEventListener('click', () => startEdit(fmt(val), true));
    } else if (d.type === 'choice') {
      el.innerHTML = `<span class="seg" role="radiogroup">${d.options.map((o) => `<button type="button" role="radio" aria-selected="${o === val}">${esc(fmt(o))}</button>`).join('')}</span>${d.unit ? `<span class="sc-unit">${esc(d.unit)}</span>` : ''}`;
      el.querySelectorAll('.seg button').forEach((b, i) => b.addEventListener('click', () => set(d.options[i])));
    } else {
      el.innerHTML = `<button type="button" class="sc-str" title="Click to edit">${esc(val)}</button>`;
      el.querySelector('.sc-str').addEventListener('click', () => startEdit(String(val), false));
    }
  }
  api.adjust = (dir) => {
    if (d.type === 'boolean') return set(!val);
    if (d.type === 'number') { if (dir === 0) return startEdit(fmt(val), true); return set(step(val, dir)); }
    if (d.type === 'choice') { const o = d.options, i = o.indexOf(val); return set(dir === 0 ? o[(i + 1) % o.length] : o[Math.max(0, Math.min(o.length - 1, i + dir))]); }
    if (dir === 0) startEdit(String(val), false);
  };
  api.type = (ch) => { if (d.type === 'number') startEdit(ch, false); };
  api.reset = (x) => { val = x; render(); };
  render();
  return api;
};
/** A settings list: rows of name · control · label (+ "default …" when changed). Returns { el, rows, refresh() }. */
SC.settings = (s, lib, say, o = {}) => {
  const el = h('<div class="sc-sets"></div>');
  const rows = s.header.settings.map((d) => {
    const row = h(`<div class="sc-set" data-k="set:${d.name}"><span class="k">${esc(d.name)}<i class="sc-chg" hidden title="Not the default"></i></span><span class="ctlslot"></span><span class="lab">${esc(d.label || '')}<span class="def" hidden></span></span></div>`);
    const ctl = SC.control(d, lib.value(s, d), (v, msg) => {
      if (v === null) { say(msg, 'fail'); return; }
      lib.set(s, d, v); mark();
      if (msg === true) say(`${d.name} = ${typeof v === 'number' ? Number(v.toPrecision(12)) : v}${d.unit ? ' ' + d.unit : ''}`);
      if (o.onChange) o.onChange();
    });
    row.querySelector('.ctlslot').replaceWith(ctl.el);
    const fmtDef = () => (d.type === 'boolean' ? (d.default ? 'on' : 'off') : `${d.default}${d.unit ? ' ' + d.unit : ''}`);
    const mark = () => { const ch = lib.value(s, d) !== d.default; row.querySelector('.sc-chg').hidden = !ch; const df = row.querySelector('.def'); df.hidden = !ch; df.textContent = `default ${fmtDef()}`; };
    mark();
    row.addEventListener('pointerdown', () => o.onFocus && o.onFocus(`set:${d.name}`));
    el.append(row);
    return { d, row, ctl, mark };
  });
  if (!rows.length) el.innerHTML = '<p class="sc-none">No settings.</p>';
  return { el, rows, refresh() { rows.forEach((r) => { r.ctl.reset(lib.value(s, r.d)); r.mark(); }); } };
};

/* ------------------------------------------------------------------------------------------- the manual */
/** One manual section as HTML (heading, syntax, text with items / Parameters / Returns, examples). */
SC.manualHTML = (sec, i, o = {}) => {
  const out = [`<section data-i="${i}" id="m${i}"><h2 class="${sec.group !== 'guide' ? 'api' : ''}">${esc(sec.heading)}</h2>`];
  if (sec.syntax) out.push(`<div class="syn">${sec.syntax.map(esc).join('\n')}</div>`);
  const t = sec.text || [];
  for (let k = 0; k < t.length; k++) {
    const line = t[k];
    if (line === 'Parameters:') {
      const ps = [];
      while (t[k + 1] && t[k + 1].startsWith('- ')) { k++; const m = /^- (\S+) \(([^)]*)\): (.*)$/.exec(t[k]); if (m) ps.push(`<dt>${esc(m[1])}<i>${esc(m[2])}</i></dt><dd>${esc(m[3])}</dd>`); else ps.push(`<dt></dt><dd>${esc(t[k].slice(2))}</dd>`); }
      out.push(`<div class="lbl3">Parameters</div><dl class="params">${ps.join('')}</dl>`); continue;
    }
    if (line.startsWith('Returns: ')) { out.push(`<div class="lbl3">Returns</div><p>${esc(line.slice(9))}</p>`); continue; }
    if (line.startsWith('- ')) {
      const items = [];
      while (k < t.length && t[k].startsWith('- ')) {
        const it = t[k].slice(2), m = /^([A-Za-z_][\w.]*):(.*)$/.exec(it);
        const target = m && o.linkOf ? o.linkOf(m[1]) : -1;
        items.push(target >= 0 ? `<li><a class="lk" href="#m${target}" data-go="${target}">${esc(m[1])}</a>:${esc(m[2])}</li>` : `<li>${esc(it)}</li>`);
        k++;
      }
      k--; out.push(`<ul>${items.join('')}</ul>`); continue;
    }
    out.push(`<p>${esc(line)}</p>`);
  }
  for (const ex of sec.examples || []) {
    if (ex.note) out.push(`<p class="note">${esc(ex.note)}</p>`);
    out.push(ex.lang === 'lua' ? SC.codeHTML(ex.code, { gutter: false }) : `<pre class="code sc-code">${esc(ex.code)}</pre>`);
  }
  out.push('</section>');
  return out.join('');
};
SC.GROUPS = { guide: 'Guide', reference: 'API reference', lua: 'Lua reference' };
/** Find in a rendered manual: wraps matches in <mark>; returns the marks. */
SC.markText = (rootEl, q, { cs = false, word = false, re = false } = {}) => {
  rootEl.querySelectorAll('mark').forEach((m) => m.replaceWith(...m.childNodes));
  rootEl.normalize();
  if (!q) return { marks: [], bad: false };
  let rx;
  try { rx = new RegExp(re ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), cs ? 'g' : 'gi'); } catch (_) { return { marks: [], bad: true }; }
  if (word) rx = new RegExp(`\\b(?:${rx.source})\\b`, rx.flags);
  const marks = [];
  const walk = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
  const nodes = []; while (walk.nextNode()) nodes.push(walk.currentNode);
  for (const n of nodes) {
    const s = n.nodeValue; rx.lastIndex = 0; let m, at = 0; const frag = document.createDocumentFragment(); let any = false;
    while ((m = rx.exec(s)) && marks.length < 1000) { if (!m[0]) { rx.lastIndex++; continue; } any = true; frag.append(s.slice(at, m.index)); const mk = document.createElement('mark'); mk.textContent = m[0]; frag.append(mk); marks.push(mk); at = m.index + m[0].length; }
    if (any) { frag.append(s.slice(at)); n.replaceWith(frag); }
  }
  return { marks, bad: false };
};

/* ------------------------------------------------------------------------------------------- the code surface */
const SNIPPETS = [
  { label: 'function', detail: 'function name(…) … end', text: 'function name()\n  \nend' },
  { label: 'if', detail: 'if … then … end', text: 'if cond then\n  \nend' },
  { label: 'for', detail: 'for i = 1, n do … end', text: 'for i = 1, n do\n  \nend' },
  { label: 'for', detail: 'for k, v in pairs(t) do … end', text: 'for k, v in pairs(t) do\n  \nend' },
  { label: 'local', detail: '', text: 'local ' },
];
const LUA_NAMES = [...LUA_BASE, 'print', ...LUA_LIBS, 'string.format', 'string.find', 'string.match', 'string.gsub', 'string.sub', 'string.lower', 'string.upper', 'table.insert', 'table.remove', 'table.concat', 'table.sort', 'math.floor', 'math.max', 'math.min', 'math.random'];
/**
 * SC.editor(el, { text, readOnly, name, onChange(text), onCursor({line,col}), onDiags(list), onSave(), onManual(name), onEsc() → bool })
 * el gets the code surface. Returns an api: { text, setDiags, find(open), completion(), signature(), hover(name, line, col), focus(), ... }
 */
SC.editor = (el, o) => {
  el.classList.add('sc-ed'); if (o.readOnly) el.classList.add('ro');
  el.innerHTML = '<div class="sc-ed-scroll"><div class="sc-ed-inner"><div class="sc-ed-gut"></div><div class="sc-ed-code"><pre class="sc-ed-hl"></pre><textarea class="sc-ed-ta" spellcheck="false" autocomplete="off" autocapitalize="off" wrap="off" aria-label="Lua source"></textarea></div></div></div>';
  const sc = el.querySelector('.sc-ed-scroll'), gut = el.querySelector('.sc-ed-gut'), code = el.querySelector('.sc-ed-code'), hl = el.querySelector('.sc-ed-hl'), ta = el.querySelector('.sc-ed-ta');
  ta.value = o.text; ta.readOnly = !!o.readOnly; ta.setSelectionRange(0, 0);
  // measure the cell
  const probe = h('<span style="position:absolute;visibility:hidden;white-space:pre">' + 'M'.repeat(50) + '</span>'); hl.append(probe);
  let cw = probe.getBoundingClientRect().width / 50 || 8.1; probe.remove();
  const lh = parseFloat(getComputedStyle(el).getPropertyValue('--lh')) || 21.6;
  let diags = [], marks = [], markAt = -1, lastCur = 1, pop = null, popKind = null;
  const api = { el, ta, get text() { return ta.value; } };
  const lines = () => ta.value.split('\n');
  const posOf = (off) => { const t = ta.value.slice(0, off); const l = t.split('\n'); return { line: l.length, col: l[l.length - 1].length + 1 }; };
  const offOf = (line, col) => { const ls = lines(); let o2 = 0; for (let i = 0; i < line - 1; i++) o2 += ls[i].length + 1; return o2 + col - 1; };
  const xy = (line, col) => ({ x: 14 + (col - 1) * cw, y: 10 + (line - 1) * lh });
  function render() {
    const ls = SC.luaLines(ta.value), cur = posOf(ta.selectionStart).line;
    const dl = new Map(); for (const d of diags) if (!dl.has(d.line)) dl.set(d.line, d);
    hl.innerHTML = ls.map((l, i) => { const d = dl.get(i + 1); return `<div class="${i + 1 === cur ? 'cur ' : ''}${d ? (d.source === 'runtime' ? 'rt' : 'err') : ''}">${l || ' '}</div>`; }).join('');
    gut.innerHTML = ls.map((_, i) => { const d = dl.get(i + 1); return `<div class="${i + 1 === cur ? 'cur ' : ''}${d ? (d.source === 'runtime' ? 'rt' : 'err') : ''}">${i + 1}</div>`; }).join('');
    const maxLen = Math.max(...ta.value.split('\n').map((l) => l.length));
    ta.style.width = (maxLen + 4) * cw + 38 + 'px'; ta.style.height = ls.length * lh + 'px';
    code.querySelectorAll('.sc-ul, .sc-mk, .sc-bm').forEach((x) => x.remove());
    for (const d of diags) if (d.from !== undefined) { const p = xy(d.line, d.from + 1); code.append(Object.assign(h('<i class="sc-ul"></i>'), { style: `left:${p.x}px;top:${p.y + lh - 3}px;width:${Math.max(1, d.to - d.from) * cw}px` })); }
    marks.forEach((m, i) => { const p = xy(m.line, m.col); code.append(Object.assign(h(`<i class="sc-mk${i === markAt ? ' now' : ''}"></i>`), { style: `left:${p.x - 1}px;top:${p.y + 1}px;width:${m.len * cw + 2}px;height:${lh - 2}px` })); });
    lastCur = cur;
  }
  api.render = render;
  const cursor = () => { const p = posOf(ta.selectionStart); if (o.onCursor) o.onCursor(p); if (p.line !== lastCur) render(); };
  // --- live errors: a light checker (block balance, unfinished strings) — the real one compiles with Lua
  let lintT = null;
  function lint() {
    const out = [], stack = [], ls = lines();
    let inBlock = null;
    ls.forEach((raw, i) => {
      let line = raw;
      if (inBlock) { const j = line.indexOf(inBlock); if (j < 0) return; line = ' '.repeat(j + inBlock.length) + line.slice(j + inBlock.length); inBlock = null; }
      let s = '', k = 0;
      while (k < line.length) {
        const r = line.slice(k);
        let m;
        if ((m = /^--\[(=*)\[/.exec(r))) { const cl = `]${m[1]}]`, j = line.indexOf(cl, k + m[0].length); if (j < 0) { inBlock = cl; break; } s += ' '.repeat(j + cl.length - k); k = j + cl.length; continue; }
        if (r.startsWith('--')) break;
        if ((m = /^\[(=*)\[/.exec(r))) { const cl = `]${m[1]}]`, j = line.indexOf(cl, k + m[0].length); if (j < 0) { inBlock = cl; break; } s += ' '.repeat(j + cl.length - k); k = j + cl.length; continue; }
        if (r[0] === '"' || r[0] === "'") { let j = k + 1; while (j < line.length && line[j] !== r[0]) j += line[j] === '\\' ? 2 : 1; if (j >= line.length) { out.push({ line: i + 1, from: k, to: line.length, message: `unfinished string near '${line.slice(k)}'`, source: 'syntax' }); s += ' '.repeat(line.length - k); k = line.length; break; } s += ' '.repeat(j + 1 - k); k = j + 1; continue; }
        s += line[k]; k++;
      }
      const re = /\b(function|if|for|while|repeat|do|end|until)\b/g; let m;
      while ((m = re.exec(s))) {
        const w = m[1];
        if (w === 'do' && stack.length && stack[stack.length - 1].w !== 'do' && stack[stack.length - 1].line === i + 1 && /for|while/.test(stack[stack.length - 1].w)) continue;
        if (w === 'end' || w === 'until') { if (!stack.length) out.push({ line: i + 1, from: m.index, to: m.index + w.length, message: `'<eof>' expected near '${w}'`, source: 'syntax' }); else stack.pop(); }
        else stack.push({ w, line: i + 1 });
      }
      const eq = /=\s*=(?!=)/.exec(s.replace(/==|~=|<=|>=/g, '  '));
      if (eq) out.push({ line: i + 1, from: eq.index + eq[0].length - 1, to: eq.index + eq[0].length, message: "unexpected symbol near '='", source: 'syntax' });
    });
    if (stack.length) { const b = stack[stack.length - 1]; out.push({ line: ls.length, message: `'${b.w === 'repeat' ? 'until' : 'end'}' expected (to close '${b.w}' at line ${b.line}) near <eof>`, source: 'syntax', eof: true }); }
    return out;
  }
  const publish = () => { const live = lint().slice(0, 1); const rt = api.runtime && !api.dirtyLine(api.runtime.line) ? [api.runtime] : []; diags = [...live, ...rt].sort((a, b) => a.line - b.line); render(); if (o.onDiags) o.onDiags(diags); };
  api.dirtyLine = () => false;
  api.setRuntime = (d) => { api.runtime = d; publish(); };
  api.recheck = (ms = 300) => { clearTimeout(lintT); lintT = setTimeout(() => { const l = lint(); const eof = l.find((x) => x.eof); if (eof && document.activeElement === ta) { lintT = setTimeout(publish, 1200); } else publish(); }, ms); };
  // --- popups
  const closePop = () => { if (pop) { pop.remove(); pop = null; popKind = null; return true; } return false; };
  api.closePop = closePop;
  api.popKind = () => popKind;
  const place = (p, line, col, above) => {
    code.append(p); const q = xy(line, col);
    let x = q.x - 4, y = above ? q.y - p.offsetHeight - 4 : q.y + lh + 2;
    if (above && y < sc.scrollTop) y = q.y + lh + 2;
    const maxX = sc.scrollLeft + sc.clientWidth - p.offsetWidth - 8; x = Math.max(sc.scrollLeft + 4, Math.min(x, maxX));
    if (!above && y + p.offsetHeight > sc.scrollTop + sc.clientHeight) y = Math.max(sc.scrollTop + 2, q.y - p.offsetHeight - 4);
    p.style.left = x + 'px'; p.style.top = y + 'px';
  };
  const docHTML = (n, d, active = -1) => {
    if (!d) return '';
    let sig = esc(d.sig);
    if (active >= 0 && d.params && d.params[active]) { const pn = d.params[active].name; sig = sig.replace(new RegExp(`([(,] ?\\[?)(${pn})\\b`), '$1<span class="act">$2</span>'); }
    const ps = active >= 0 ? (d.params && d.params[active] ? [d.params[active]] : []) : d.params || [];
    return `<div class="sig">${sig}</div>${active < 0 || !ps.length ? `<div>${esc(d.doc)}</div>` : ''}${ps.length ? `${active < 0 ? '<div class="lbl2">Parameters</div>' : ''}${ps.map((p) => `<div class="p"><span class="pn">${esc(p.name)}</span> <i>(${esc(p.type)})</i> ${esc(p.doc)}</div>`).join('')}` : ''}${active < 0 && d.returns ? `<div class="lbl2">Returns</div><div class="p">${esc(d.returns)}</div>` : ''}${active < 0 && d.example ? `<pre>${SC.luaLines(d.example).join('\n')}</pre>` : ''}`;
  };
  api.docHTML = docHTML;
  const wordAt = (off) => { const v = ta.value; let a = off, b = off; while (a > 0 && /[\w.:]/.test(v[a - 1])) a--; while (b < v.length && /[\w]/.test(v[b])) b++; return { a, b, w: v.slice(a, b) }; };
  api.nameAtCursor = () => { const w = wordAt(ta.selectionStart).w; return SD.api[w] ? w : null; };
  // completion
  let comp = null;
  api.completion = () => {
    closePop();
    const wa = wordAt(ta.selectionStart), a = wa.a, w = ta.value.slice(a, ta.selectionStart);
    const pre = w.split(/[.:]/).pop().toLowerCase(), full = w.toLowerCase();
    const cands = [
      ...Object.entries(SD.api).map(([n, d]) => ({ label: n, kind: d.kind, detail: d.kind === 'function' ? d.sig.slice(d.sig.indexOf('(')).replace(/ → .*/, '') : d.kind === 'table' ? 'namespace' : '', doc: d })),
      ...LUA_NAMES.map((n) => ({ label: n, kind: LUA_LIBS.includes(n) ? 'table' : 'function', detail: LUA_LIBS.includes(n) ? 'library' : '', lua: true })),
      ...SNIPPETS.map((s) => ({ label: s.label, kind: 'keyword', detail: s.detail, snip: s.text })),
    ].filter((c) => (full.includes('.') || full.includes(':') ? c.label.toLowerCase().startsWith(full) : c.label.toLowerCase().startsWith(pre)) && pre.length >= 1);
    if (!cands.length) return false;
    cands.sort((x, y) => (x.lua ? 1 : 0) - (y.lua ? 1 : 0) || x.label.localeCompare(y.label));
    const ic = { function: 'ƒ', table: '{}', variable: 'v', keyword: 'k', tag: '@' };
    const p = h(`<div class="sc-pop sc-comp-pop"><div class="in sc-comp"><ul role="listbox">${cands.slice(0, 40).map((c, i) => `<li data-i="${i}" class="${i ? '' : 'on'}"><span class="ic">${ic[c.kind] || '·'}</span><span><b>${esc(c.label.slice(0, w.length))}</b>${esc(c.label.slice(w.length))}</span><span class="d">${esc(c.detail)}</span></li>`).join('')}</ul><div class="sc-doc"></div></div></div>`);
    pop = p; popKind = 'comp';
    comp = { cands: cands.slice(0, 40), i: 0, a, len: wa.b - a };
    const showDoc = () => { const c = comp.cands[comp.i], dd = p.querySelector('.sc-doc'); dd.innerHTML = c.doc ? docHTML(c.label, c.doc) : c.snip ? `<div class="sig">${esc(c.snip.replace(/\n/g, ' ⏎ '))}</div><div class="p">A snippet: Tab moves between its fields.</div>` : `<div class="sig">${esc(c.label)}</div><div class="p">Lua ${c.kind === 'table' ? 'library' : 'function'}. F1 opens its entry in the manual.</div>`; dd.hidden = false; };
    showDoc();
    p.querySelectorAll('li').forEach((li) => { li.addEventListener('mousedown', (e) => { e.preventDefault(); comp.i = +li.dataset.i; accept(); }); });
    const cp = posOf(a);
    place(p, cp.line, cp.col, false);
    api._compMove = (dir) => { comp.i = Math.max(0, Math.min(comp.cands.length - 1, comp.i + dir)); p.querySelectorAll('li').forEach((li, i) => li.classList.toggle('on', i === comp.i)); p.querySelector('li.on').scrollIntoView({ block: 'nearest' }); showDoc(); };
    return true;
  };
  function accept() {
    const c = comp.cands[comp.i]; const ins = c.snip || c.label;
    ta.setRangeText(ins, comp.a, comp.a + comp.len, 'end');
    if (c.snip) { const k = ins.indexOf(c.label === 'function' ? 'name' : c.label === 'if' ? 'cond' : c.label === 'for' ? (ins.includes('pairs') ? 'k' : 'i') : ''); if (k >= 0) ta.setSelectionRange(comp.a + k, comp.a + k + (c.label === 'function' ? 4 : c.label === 'if' ? 4 : 1)); }
    closePop(); changed();
  }
  // signature help: inside a call of a known function
  /** The call the cursor is in: { name, active (parameter), at (offset of the name) } or null. */
  api.callAt = () => {
    const off = ta.selectionStart, v = ta.value; let depth = 0, commas = 0, k = off - 1;
    for (; k >= 0 && k > off - 2000; k--) { const c = v[k]; if (c === ')') depth++; else if (c === '(') { if (!depth) break; depth--; } else if (c === ',' && !depth) commas++; else if (c === '\n' && k < off - 400) break; }
    if (k < 0 || v[k] !== '(') return null;
    const nm = wordAt(k).w, d = SD.api[nm];
    if (!d || !d.params) return null;
    return { name: nm, active: Math.min(commas, d.params.length - 1), at: k - nm.length };
  };
  api.signature = (force) => {
    const c = api.callAt();
    if (o.sigPopup === false) return !!c;
    if (!c) { if (popKind === 'sig') closePop(); return false; }
    const nm = c.name, d = SD.api[nm], commas = c.active, k = c.at + nm.length;
    if (popKind === 'comp') return false;
    closePop();
    const p = h(`<div class="sc-pop"><div class="in sc-doc">${docHTML(nm, d, Math.min(commas, d.params.length - 1))}</div></div>`);
    pop = p; popKind = 'sig';
    const at = posOf(k - nm.length); place(p, at.line, at.col, true);
    return true;
  };
  api.hover = (name, line, col) => { closePop(); const d = SD.api[name]; if (!d) return; const p = h(`<div class="sc-pop"><div class="in sc-doc">${docHTML(name, d)}</div></div>`); pop = p; popKind = 'hover'; place(p, line, col, false); };
  api.lintPop = (d) => { closePop(); const p = h(`<div class="sc-pop"><div class="in sc-doc lint"><span class="src">${d.source === 'runtime' ? 'Runtime error (saved version)' : d.source === 'header' ? 'Header' : 'Syntax error'}</span>${esc(d.message)}</div></div>`); pop = p; popKind = 'lint'; place(p, d.line, (d.from || 0) + 1, false); };
  // mouse hover: API names and error marks
  let hovT = null;
  code.addEventListener('mousemove', (e) => {
    clearTimeout(hovT);
    const r = code.getBoundingClientRect(), line = Math.floor((e.clientY - r.top - 10) / lh) + 1, col = Math.floor((e.clientX - r.left - 14) / cw) + 1;
    hovT = setTimeout(() => {
      const ls = lines(); if (line < 1 || line > ls.length) return;
      const d = diags.find((x) => x.line === line && (x.from === undefined || (col - 1 >= x.from && col - 1 <= x.to)));
      if (d) { if (popKind !== 'lint') api.lintPop(d); return; }
      const off = offOf(line, Math.min(col, ls[line - 1].length + 1)); const { w } = wordAt(off);
      if (SD.api[w]) { if (popKind !== 'hover') api.hover(w, line, Math.max(1, col - 2)); }
      else if (popKind === 'hover' || popKind === 'lint') closePop();
    }, 380);
  });
  code.addEventListener('mouseleave', () => { clearTimeout(hovT); if (popKind === 'hover' || popKind === 'lint') closePop(); });
  gut.addEventListener('mousemove', (e) => { const r = gut.getBoundingClientRect(), line = Math.floor((e.clientY - r.top - 10) / lh) + 1; const d = diags.find((x) => x.line === line); if (d && popKind !== 'lint') api.lintPop(d); });
  // --- find
  let fq = { q: '', cs: false, word: false, re: false, rep: '' };
  api.findQuery = () => fq;
  api.find = (q) => {
    fq = { ...fq, ...q }; marks = []; markAt = -1;
    if (!fq.q) { render(); return { n: 0, at: 0 }; }
    let rx; try { rx = new RegExp(fq.re ? fq.q : fq.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), fq.cs ? 'g' : 'gi'); if (fq.word) rx = new RegExp(`\\b(?:${rx.source})\\b`, rx.flags); } catch (_) { render(); return { bad: true }; }
    lines().forEach((l, i) => { rx.lastIndex = 0; let m; while ((m = rx.exec(l)) && marks.length < 1000) { if (!m[0]) { rx.lastIndex++; continue; } marks.push({ line: i + 1, col: m.index + 1, len: m[0].length }); } });
    const cur = posOf(ta.selectionStart); markAt = marks.findIndex((m) => m.line > cur.line || (m.line === cur.line && m.col >= cur.col)); if (markAt < 0 && marks.length) markAt = 0;
    render(); return { n: marks.length, at: markAt + 1 };
  };
  api.findStep = (dir) => {
    if (!marks.length) return { n: 0, at: 0 };
    markAt = (markAt + dir + marks.length) % marks.length; const m = marks[markAt];
    const p = xy(m.line, m.col); const top = p.y - sc.clientHeight / 3; sc.scrollTop = Math.max(0, top); if (p.x > sc.scrollLeft + sc.clientWidth - 60 || p.x < sc.scrollLeft) sc.scrollLeft = Math.max(0, p.x - 80);
    const off = offOf(m.line, m.col); ta.setSelectionRange(off, off + m.len);
    render(); return { n: marks.length, at: markAt + 1 };
  };
  api.replace = (all) => {
    if (o.readOnly || !marks.length) return 0;
    if (all) { const n = marks.length; let rx = new RegExp(fq.re ? fq.q : fq.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), fq.cs ? 'g' : 'gi'); if (fq.word) rx = new RegExp(`\\b(?:${rx.source})\\b`, rx.flags); ta.value = ta.value.replace(rx, fq.rep); changed(); api.find({}); return n; }
    const m = marks[Math.max(0, markAt)]; const off = offOf(m.line, m.col); ta.setRangeText(fq.rep, off, off + m.len, 'end'); changed(); api.find({}); return 1;
  };
  // --- typing
  function changed() { if (o.onChange) o.onChange(ta.value); api.recheck(); render(); cursor(); }
  ta.addEventListener('input', () => {
    changed();
    const { w } = wordAt(ta.selectionStart);
    if (popKind === 'comp') { if (w.length) api.completion(); else closePop(); }
    else if (/^[A-Za-z_][\w]{1,}$/.test(w.split(/[.:]/).pop() || '') && w.length >= 3) api.completion();
    else api.signature();
  });
  ['keyup', 'click', 'select'].forEach((ev) => ta.addEventListener(ev, () => { cursor(); if (popKind !== 'comp' && ev !== 'select') api.signature(); }));
  ta.addEventListener('blur', () => { if (popKind === 'comp') closePop(); });
  ta.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (popKind === 'comp') {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); api._compMove(e.key === 'ArrowDown' ? 1 : -1); return; }
      if (e.key === 'PageDown' || e.key === 'PageUp') { e.preventDefault(); api._compMove(e.key === 'PageDown' ? 9 : -9); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); accept(); return; }
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (closePop()) return; if (o.onEsc) o.onEsc(); return; }
    if (mod && e.key === ' ') { e.preventDefault(); if (e.shiftKey) api.signature(true); else api.completion(); return; }
    if (mod && (e.key === 's' || e.key === 'S')) { e.preventDefault(); e.stopPropagation(); o.onSave && o.onSave(); return; }
    if (mod && (e.key === 'f' || e.key === 'F' || e.key === 'h' || e.key === 'H')) { e.preventDefault(); e.stopPropagation(); o.onFind && o.onFind(e.key.toLowerCase() === 'h'); return; }
    if (e.key === 'F1') { e.preventDefault(); e.stopPropagation(); o.onManual && o.onManual(api.nameAtCursor()); return; }
    if (e.key === 'Tab' && !mod) {
      e.preventDefault(); if (o.readOnly) { o.onTab && o.onTab(e.shiftKey); return; }
      const s = ta.selectionStart, en = ta.selectionEnd, v = ta.value;
      if (s === en && !e.shiftKey) { ta.setRangeText('  ', s, s, 'end'); }
      else { const a = v.lastIndexOf('\n', s - 1) + 1; const seg = v.slice(a, en); const out = seg.split('\n').map((l) => (e.shiftKey ? l.replace(/^ {1,2}/, '') : '  ' + l)).join('\n'); ta.setRangeText(out, a, en, 'select'); }
      changed(); return;
    }
    if (e.key === 'Enter' && !mod && !o.readOnly) {
      const s = ta.selectionStart, v = ta.value, a = v.lastIndexOf('\n', s - 1) + 1, line = v.slice(a, s), ind = /^\s*/.exec(line)[0];
      const opens = /^\s*(local\s+)?function\b.*\)\s*$|\bthen\s*$|\bdo\s*$|function\s*\([^)]*\)\s*$/.test(line);
      e.preventDefault();
      if (opens) {
        const rest = v.slice(s); const nextInd = /^\n?(\s*)/.exec(rest.slice(rest.indexOf('\n') + 1))[1] || '';
        const hasEnd = nextInd.length === ind.length && /^\s*end\b/.test(rest.slice(rest.indexOf('\n') + 1));
        ta.setRangeText('\n' + ind + '  ' + (hasEnd ? '' : '\n' + ind + 'end' + (/function\s*\([^)]*\)\s*$/.test(line) && /\(\s*[^)]*function/.test(line) ? ')' : '')), s, ta.selectionEnd, 'end');
        if (!hasEnd) ta.selectionStart = ta.selectionEnd = s + 1 + ind.length + 2;
      } else ta.setRangeText('\n' + ind, s, ta.selectionEnd, 'end');
      changed(); return;
    }
  });
  sc.addEventListener('scroll', () => { if (popKind === 'hover' || popKind === 'lint') closePop(); });
  api.focus = () => ta.focus({ preventScroll: true });
  api.goto = (line, col = 1) => { const off = offOf(line, col); ta.focus({ preventScroll: true }); ta.setSelectionRange(off, off); const p = xy(line, col); sc.scrollTop = Math.max(0, p.y - sc.clientHeight / 3); cursor(); render(); };
  api.place = (line, col) => api.goto(line, col);
  api.markSaved = () => {};
  render(); cursor(); publish();
  return api;
};
})();
