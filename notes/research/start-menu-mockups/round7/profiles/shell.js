/* Round 7 · profiles group · the host around the pages (throwaway mockup code).
   Start context:  the sky and the start menu → Profile → the Profile list (a stand-in in round 6's
                   #profilePanel style; the real list is built elsewhere) → a page in a normal box or in the
                   large box. The large box takes layout A's resting state: the wordmark flies to a tiny mark
                   top left (click it = Back), the box nearly fills the window.
   Game context:   ?ctx=game — the real game view (WC.ingame) and one movable/resizable window (WC.window).
   API (window.SHELL):
     SHELL.ctx                         'start' | 'game'
     SHELL.start({ onProfile, onHistory })        → menu
     SHELL.list({ onEdit, onImport, onExport })   → { el, show(instant), hide(), flash(msg, kind), layer, cur() }
     SHELL.big({ hood, id })            → { el, win, open({ instant, layer }), close(), setHood(t), shown }
     SHELL.normal({ hood, id, tall })   → { el, win, open({ instant, layer }), close(), shown }
     SHELL.dialog(opts)                 → a modal (see below)
     SHELL.game({ frame, title, note, x, y, w, h, onClose }) → { win (WC.window api), body, reopen() }
   Every page gets keys through WC.keys layers; Esc / Back pops to the previous view. */
(() => {
'use strict';
const qs = WC.qs;
const ctx = qs.get('ctx') === 'game' ? 'game' : 'start';
const EASE = 'cubic-bezier(.45,.05,.2,1)';
const S = (window.SHELL = { ctx, stack: [] });
let menu = null, mark = null;

/* ------------------------------------------------------------------ start scene */
S.start = (opts = {}) => {
  WC.sky.start();
  menu = WC.startMenu({ profile: 'gibur', onActivate(k) {
    if (k === 'profile' && opts.onProfile) { opts.onProfile(); return true; }
    if (k === 'history' && opts.onHistory) { opts.onHistory(); return true; }
    return false;
  } });
  mark = WC.el('div', { class: 'wm small bare', id: 'mark', title: 'Back (Esc)', 'aria-label': 'MUME Cockpit — back' });
  document.body.append(mark);
  WC.Wordmark(mark);
  mark.addEventListener('click', () => { if (!WC.busy) WC.back(); });
  S.menu = menu;
  return menu;
};

/* ------------------------------------------------------------------ the Profile list stand-in */
const CHECK = '<svg viewBox="0 0 16 16"><path d="M3 8.5l3.2 3.2L13 4.8"/></svg>';
const IC = {
  select: '<svg viewBox="0 0 16 16"><path d="M3 8.5l3.2 3.2L13 4.8"/></svg>',
  new: '<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"/></svg>',
  edit: '<svg viewBox="0 0 16 16"><path d="M10.5 2.5l3 3-8 8H2.5v-3z"/></svg>',
  rename: '<svg viewBox="0 0 16 16"><path d="M2.5 12.5h11M4 9.5l6-6 2 2-6 6H4z"/></svg>',
  del: '<svg viewBox="0 0 16 16"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9"/></svg>',
  import: '<svg viewBox="0 0 16 16"><path d="M8 2v8M4.8 7 8 10.2 11.2 7M2.5 13.5h11"/></svg>',
  export: '<svg viewBox="0 0 16 16"><path d="M8 10.2V2.2M4.8 5.4 8 2.2l3.2 3.2M2.5 13.5h11"/></svg>',
};
S.IC = IC;
S.list = (opts = {}) => {
  const box = WC.el('section', { class: 'lp box-normal nbox', id: 'plist', 'data-hood': 'Profile', 'data-back': '', 'aria-label': 'Profile' }, `
    <div class="win">
      <div class="rows pl-rows" role="listbox" aria-label="Profiles"></div>
      <div class="btnrow pl-btns">
        <button class="ibtn small" data-a="select">${IC.select}<span><u class="sk">S</u>elect</span></button>
        <button class="ibtn small" data-a="new">${IC.new}<span><u class="sk">N</u>ew</span></button>
        <button class="ibtn small primary" data-a="edit">${IC.edit}<span><u class="sk">E</u>dit</span></button>
        <button class="ibtn small" data-a="rename">${IC.rename}<span><u class="sk">R</u>ename</span></button>
        <button class="ibtn small" data-a="import">${IC.import}<span><u class="sk">I</u>mport</span></button>
        <button class="ibtn small" data-a="export">${IC.export}<span>E<u class="sk">x</u>port</span></button>
        <button class="ibtn small danger" data-a="delete">${IC.del}<span><u class="sk">D</u>elete</span></button>
      </div>
      <div class="pl-foot"><span class="flash" id="plFlash"></span></div>
    </div>`);
  document.body.append(box);
  WC.decorate(box);
  const rowsEl = box.querySelector('.pl-rows'), fl = box.querySelector('#plFlash');
  const P = PDATA.profiles;
  const render = () => {
    rowsEl.innerHTML = P.map((p) => `<div class="row" role="option"><span class="pl-name">${p.name}</span>${p.name === 'default' ? '<span class="pl-def">the starting profile</span>' : ''}${p.selected ? `<span class="pl-sel">${CHECK}Selected</span>` : ''}</div>`).join('');
    list.refresh();
    box.querySelector('[data-a="select"]').disabled = !!P[list.i].selected;
    box.querySelector('[data-a="rename"]').disabled = box.querySelector('[data-a="delete"]').disabled = P[list.i].name === 'default';
  };
  const flash = (m, kind) => WC.flash(fl, m, { kind, ms: 3200 });
  const list = WC.list(rowsEl, { onChange: () => { if (rowsEl.children.length) { box.querySelector('[data-a="select"]').disabled = !!P[list.i].selected; box.querySelector('[data-a="rename"]').disabled = box.querySelector('[data-a="delete"]').disabled = P[list.i].name === 'default'; } }, onActivate: (i) => (P[i].selected ? act('edit') : act('select')) });
  const cur = () => P[list.i];
  function act(a) {
    const b = box.querySelector(`[data-a="${a}"]`); if (b && b.disabled) return;
    const p = cur();
    switch (a) {
      case 'select': P.forEach((x) => (x.selected = x === p)); render(); return flash(`${p.name} is the selected profile.`);
      case 'edit': return opts.onEdit ? opts.onEdit(p.name) : flash('The profile editor — not in this mockup');
      case 'import': return opts.onImport ? opts.onImport() : flash('Import — not in this mockup');
      case 'export': return flash(`Exported ${p.name.toLowerCase()}.tt.`);
      case 'new': return flash('New profile (name, then Blank or Copy) — in the Profile list mockups');
      case 'rename': return flash(`Rename "${p.name}" — in the Profile list mockups`);
      case 'delete': return flash(`Delete profile '${p.name}'? — in the Profile list mockups`);
    }
  }
  box.querySelector('.pl-btns').addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b) act(b.dataset.a); });
  const start = P.findIndex((p) => p.selected);
  render(); list.set(start, true); render();
  const api = { el: box, flash, cur, act, shown: false };
  api.add = (name) => { if (!P.some((p) => p.name === name)) P.push({ name }); P.sort((a, b) => (a.name === 'default' ? -1 : b.name === 'default' ? 1 : a.name.localeCompare(b.name))); P.forEach((x) => (x.selected = x.name === name)); list.set(P.findIndex((x) => x.name === name), true); render(); };
  api.layer = { key: (e) => list.key(e) || WC.shortcut(e, { s: () => act('select'), n: () => act('new'), e: () => act('edit'), r: () => act('rename'), i: () => act('import'), x: () => act('export'), d: () => act('delete') }), back: () => api.hide() };
  let pop = null;
  api.show = (instant = false) => {
    if (instant) { document.body.classList.add('instant'); setTimeout(() => document.body.classList.remove('instant'), 50); }
    document.body.classList.add('sub'); box.classList.add('shown'); box.classList.remove('away');
    if (menu) menu.active = false;
    if (!pop) pop = WC.keys.push(api.layer);
    api.shown = true;
  };
  api.hide = () => { document.body.classList.remove('sub'); box.classList.remove('shown'); if (menu) { menu.active = true; menu.select(menu.cur); } if (pop) pop(); pop = null; api.shown = false; };
  api.away = (on) => box.classList.toggle('away', on);
  S.listApi = api;
  return api;
};

/* ------------------------------------------------------------------ the large box (layout A) */
S.big = (opts = {}) => {
  const box = WC.el('section', { class: 'lp box-large bbox', id: opts.id || 'page', 'data-hood': opts.hood || 'Page', 'data-back': '', 'aria-label': opts.hood || 'Page' }, '<div class="win"></div>');
  document.body.append(box);
  WC.decorate(box);
  const api = { el: box, win: box.querySelector('.win'), shown: false };
  let pop = null, from = null;
  api.setHood = (t) => { box.querySelector('.hood .t').textContent = t; };
  api.open = async ({ instant = false, layer, onClose } = {}) => {
    if (api.shown || WC.busy) return;
    WC.busy = true; api.shown = true; api.onClose = onClose;
    from = S.listApi && S.listApi.shown ? 'list' : 'menu';
    if (menu) menu.active = false;
    if (instant) document.body.classList.add('instant');
    const prev = [...document.querySelectorAll('.bbox.cur')].filter((b) => b !== box);
    box.classList.add('cur');
    const wasPg = document.body.classList.contains('pg');
    document.body.classList.add('pg', 'pgv');
    if (S.listApi) S.listApi.el.classList.add('away');
    const D = instant ? 0 : WC.dur(1), anims = [];
    if (!wasPg && menu) {
      const brand = menu.brand, tiny = mark.querySelector('.wm-c');
      const fr = WC.rect(brand), to = tiny.getBoundingClientRect();
      if (WC.RM || instant) {
        anims.push(brand.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260 * D, fill: 'forwards' }));
        anims.push(mark.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260 * D, fill: 'forwards' }));
      } else {
        anims.push(brand.animate([{ transform: 'none', opacity: 1 }, { transform: WC.flyTo(fr, to), opacity: 1, offset: .78 }, { transform: WC.flyTo(fr, to), opacity: 0 }], { duration: 950 * D, easing: EASE, fill: 'forwards' }));
        anims.push(mark.animate([{ opacity: 0 }, { opacity: 0, offset: .72 }, { opacity: 1 }], { duration: 950 * D, fill: 'forwards' }));
      }
      S._brandAnims = anims.slice();
    }
    anims.push(box.animate([{ opacity: 0, transform: 'translateY(22px) scale(.985)' }, { opacity: 1, transform: 'none' }],
      { duration: (WC.RM ? 260 : 700) * D, delay: (WC.RM ? 0 : 180) * D, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }));
    for (const b of prev) anims.push(b.animate([{ opacity: 1 }, { opacity: 0 }], { duration: (instant ? 0 : 350) * D, fill: 'forwards' }));
    await Promise.all(anims.map((a) => a.finished));
    prev.forEach((b) => { b.classList.remove('cur'); b.getAnimations().forEach((a) => a.cancel()); });
    document.body.classList.add('landed'); document.body.classList.remove('instant');
    pop = WC.keys.push({ key: (e) => (layer && layer.key ? layer.key(e) : false), back: () => (layer && layer.back ? layer.back() : api.close()) });
    WC.busy = false;
  };
  api.close = async () => {
    if (!api.shown || WC.busy) return;
    WC.busy = true; pop && pop(); pop = null;
    const D = WC.dur(1), anims = [];
    anims.push(box.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(18px) scale(.985)' }], { duration: (WC.RM ? 220 : 450) * D, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' }));
    const otherBox = [...document.querySelectorAll('.bbox')].find((b) => b !== box && b._api && b._api.shown);
    const other = !!otherBox;
    if (otherBox) { otherBox.classList.add('cur'); anims.push(otherBox.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400 * D, delay: 120 * D, fill: 'backwards' })); }
    if (!other && menu) {
      document.body.classList.remove('landed');
      const brand = menu.brand, fr = WC.rect(brand), to = mark.querySelector('.wm-c').getBoundingClientRect();
      if (WC.RM) {
        anims.push(mark.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220 * D, fill: 'forwards' }));
        anims.push(brand.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260 * D, fill: 'forwards' }));
      } else {
        anims.push(mark.animate([{ opacity: 1 }, { opacity: 0, offset: .22 }, { opacity: 0 }], { duration: 900 * D, fill: 'forwards' }));
        anims.push(brand.animate([{ transform: WC.flyTo(fr, to), opacity: 0 }, { transform: WC.flyTo(fr, to), opacity: 1, offset: .2 }, { transform: 'none', opacity: 1 }], { duration: 900 * D, easing: EASE, fill: 'forwards' }));
      }
      setTimeout(() => { document.body.classList.remove('pg'); if (S.listApi) S.listApi.el.classList.remove('away'); }, (WC.RM ? 120 : 250) * D);
    }
    await Promise.all(anims.map((a) => a.finished));
    anims.forEach((a) => a.cancel());
    if (!other) { document.body.classList.remove('pgv'); (S._brandAnims || []).forEach((a) => a.cancel()); S._brandAnims = null; mark.getAnimations().forEach((a) => a.cancel()); }
    box.classList.remove('cur');
    api.shown = false;
    if (!other && menu && !(S.listApi && S.listApi.shown)) { menu.active = true; menu.select(menu.cur); }
    WC.busy = false;
    if (api.onClose) api.onClose();
  };
  box._api = api;
  return api;
};

/* ------------------------------------------------------------------ a normal box (over the list's place) */
S.normal = (opts = {}) => {
  const box = WC.el('section', { class: 'lp box-normal nbox' + (opts.tall ? ' tall' : ''), id: opts.id || 'npage', 'data-hood': opts.hood || 'Page', 'data-back': '', 'aria-label': opts.hood || 'Page' }, '<div class="win"></div>');
  document.body.append(box);
  WC.decorate(box);
  const api = { el: box, win: box.querySelector('.win'), shown: false };
  let pop = null;
  api.open = ({ instant = false, layer, onClose } = {}) => {
    api.onClose = onClose;
    if (instant) { document.body.classList.add('instant'); setTimeout(() => document.body.classList.remove('instant'), 50); }
    document.body.classList.add('sub');
    if (menu) menu.active = false;
    if (S.listApi) { S.listApi.el.classList.add('away'); S.listApi.el.classList.remove('shown'); }
    box.classList.add('shown'); api.shown = true;
    pop = WC.keys.push({ key: (e) => (layer && layer.key ? layer.key(e) : false), back: () => (layer && layer.back ? layer.back() : api.close()) });
  };
  api.close = () => {
    pop && pop(); pop = null; box.classList.remove('shown'); api.shown = false;
    if (S.listApi && S.listApi.shown) { S.listApi.el.classList.remove('away'); S.listApi.el.classList.add('shown'); }
    else { document.body.classList.remove('sub'); if (menu) { menu.active = true; menu.select(menu.cur); } }
    if (api.onClose) api.onClose();
  };
  return api;
};

/* ------------------------------------------------------------------ dialogs
   SHELL.dialog({ hood, q, p, err, keycap, buttons: [{ label, cls, key, run }], within, onEsc, keys(e) })
   → { el, close(), setErr(t), setP(t) }. Esc runs onEsc (default: close). The buttons' letters fire. */
S.dialog = (o) => {
  const veil = WC.el('div', { class: 'dlg-veil' + (o.within ? ' inbox' : ''), role: 'dialog', 'aria-modal': 'true' }, `
    <section class="lp dlg" data-hood="${o.hood || ''}"><div class="win">
      ${o.q ? `<p class="dlg-q">${o.q}</p>` : ''}
      ${o.keycap ? `<div class="keycap"><i class="pulse"></i>${o.keycap}</div>` : ''}
      <p class="dlg-p">${o.p || ''}</p>
      ${o.err !== undefined ? `<p class="dlg-err">${o.err}</p>` : ''}
      ${o.buttons && o.buttons.length ? `<div class="btnrow">${o.buttons.map((b, i) => `<button class="ibtn ${b.cls || ''}" data-i="${i}"><span>${b.label}</span></button>`).join('')}</div>` : ''}
    </div></section>`);
  (o.within || document.body).append(veil);
  WC.decorate(veil);
  requestAnimationFrame(() => veil.classList.add('show'));
  let pop = null;
  const api = { el: veil };
  api.close = () => { pop && pop(); pop = null; veil.classList.remove('show'); setTimeout(() => veil.remove(), 260); };
  api.setErr = (t) => { const e = veil.querySelector('.dlg-err'); if (e) e.textContent = t; };
  api.setP = (t) => { veil.querySelector('.dlg-p').textContent = t; };
  veil.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => o.buttons[+b.dataset.i].run(api)));
  pop = WC.keys.push({
    key(e) {
      if (o.keys && o.keys(e, api)) return true;
      if (e.key === 'Escape') { (o.onEsc || (() => api.close()))(api); return true; }
      for (const b of o.buttons || []) if (b.key && !e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === b.key) { b.run(api); return true; }
      return true;   // modal: swallow the rest
    },
  });
  return api;
};

/* ------------------------------------------------------------------ in-game window */
const BAR_X = { profile: 782, scripts: 807 };
S.game = (o = {}) => {
  const frame = qs.get('frame') === 'a' || qs.get('frame') === 'b' ? qs.get('frame') : (o.frame || 'b');
  const ig = WC.ingame({ bg: qs.get('bg') || 'dark' });
  const w = WC.el('div', { class: `wwin win-${frame}`, 'data-title': o.title || 'Profile', 'data-note': o.note || '' });
  w.style.cssText = `left:${o.x ?? 40}px;top:${o.y ?? 40}px;width:${o.w ?? 760}px;height:${o.h ?? 560}px`;
  document.body.append(w);
  const win = WC.window(w, { onClose: () => { w.hidden = true; w.removeAttribute('data-focused'); ig.markBar(null); if (o.onClose) o.onClose(); } });
  ig.markBar('profile');
  const bg = document.querySelector('.igbg');
  const spot = WC.el('i', { class: 'reopen', title: 'Profile (menu bar)' }); spot.style.left = BAR_X.profile + 'px'; bg.append(spot);
  const api = { ig, win, body: win.body, frame };
  api.reopen = () => { w.hidden = false; win.focus(); ig.markBar('profile'); if (o.onOpen) o.onOpen(); };
  spot.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (w.hidden) api.reopen(); else if (w.hasAttribute('data-focused')) win.close(); else win.focus(); });
  WC.demoExtra(`<div class="row2">Frame <button data-f="a" class="${frame === 'a' ? 'on' : ''}">A Lyktfönster</button><button data-f="b" class="${frame === 'b' ? 'on' : ''}">B Glasfönster</button></div>`)
    .querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { const u = new URL(location.href); u.searchParams.set('frame', b.dataset.f); u.searchParams.set('bg', ig.bg); location.replace(u); }));
  api.focused = () => w.hasAttribute('data-focused') && !w.hidden;
  return api;
};
})();
