// The mockups' states (stage 67, round 8). Runs in two places: in the review
// shell, where it only lists the states (window.MK_STATES), and inside the
// stage's document, where `window.MK` names the state to draw over the
// captured page (build/skel). Throwaway: a simplified DOM in the real classes.
(function () {
  'use strict';

  const MK = window.MK || { view: 'd', icons: {} };
  const view = MK.view;
  const touch = view !== 'd';
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const ic = (name, cls) => ((MK.icons && MK.icons[name]) || '').replace('class="wc-lk-ic', 'class="wc-lk-ic ' + (cls || ''));

  // ------------------------------------------------------------ the owner row
  const NAME = 'ole';
  const LONG = 'olevongertten';
  const NAME20 = 'olevongertten_arda20'; // 20 characters: NAME_MAX_LENGTH of shared/cloud/api.ts

  /** who: the heading; st: the state in words; mark: ok | sync | off | warn | lock | key | none; news: reactions; act: the state is the action (log in). */
  const OWNER = {
    guest: { who: 'On this device', st: 'log in', mark: 'key', act: true, label: 'Guest', cap: 'guest' },
    guest2: { who: 'This device only', st: 'log in', mark: 'key', act: true, label: 'Guest · wording 2', cap: 'guest, wording 2' },
    guest3: { who: 'Not logged in', st: 'kept on this device', mark: 'key', label: 'Guest · wording 3', cap: 'guest, wording 3' },
    name: { who: NAME, st: '', mark: 'none', label: 'Name only', cap: 'name only (before sync exists)' },
    synced: { who: NAME, st: 'synced', mark: 'ok', label: 'Synced', cap: 'synced' },
    syncing: { who: NAME, st: 'syncing', mark: 'sync', label: 'Syncing', cap: 'syncing' },
    offline: { who: NAME, st: 'offline', mark: 'off', label: 'Offline', cap: 'offline' },
    full: { who: NAME, st: 'storage full', mark: 'warn', label: 'Needs attention', cap: 'needs attention' },
    locked: { who: NAME, st: 'logged out here', mark: 'lock', label: 'Locked copy', cap: 'a locked copy, logged out' },
    news: { who: NAME, st: 'synced', mark: 'ok', news: '2 new', label: 'Reactions', cap: 'with a reactions mark' },
    long: { who: LONG, st: 'storage full', mark: 'warn', news: '2 new', label: 'Longest text', cap: 'the longest text' },
    name20: { who: NAME20, st: 'synced', mark: 'ok', label: '20-letter name', cap: 'the longest name allowed (20)' },
  };
  const OWNER_ORDER = ['guest', 'guest2', 'guest3', 'name', 'synced', 'syncing', 'offline', 'full', 'locked', 'news', 'long', 'name20'];
  const MARK_WORDS = { ok: 'synced', sync: 'syncing', off: 'offline', warn: 'needs attention' };

  function mark(m) {
    if (m === 'none') return '<i class="mk-mark is-none"></i>';
    if (m === 'key' || m === 'lock') return ic(m, 'mk-mark-ic');
    return `<i class="mk-mark is-${m}" title="${MARK_WORDS[m]}"></i>`;
  }
  const cue = () => `<span class="mk-own-cue">${touch ? '' : '<kbd class="mk-kbd">U</kbd>'}<i class="mk-chev" aria-hidden="true"></i></span>`;

  /** The owner row in a direction's own build. */
  function ownerRow(dir, key, sel) {
    const o = OWNER[key];
    const who = `<span class="mk-own-who">${esc(o.who)}</span>`;
    const st = o.st ? `<span class="mk-own-st${o.act ? ' is-act' : ''}">${esc(o.st)}</span>` : '';
    const news = o.news ? `<span class="mk-own-new">${esc(o.news)}</span>` : '';
    const dot = '<i class="mk-dot">·</i>';
    const attrs = `role="menuitem" data-key="owner" aria-keyshortcuts="U" title="${o.act || key === 'guest3' || key === 'locked' ? 'Log in' : 'Account'} (U)"`;
    const cls = `wc-sm-item mk-own mk-own-${dir} is-${key}${sel ? ' is-sel' : ''}`;
    if (dir === 'a') {
      // A heading line: the mark in the icons' column, the name, the state, the cue at the right end.
      return `<li class="${cls}" ${attrs}><span class="mk-own-m">${mark(o.mark)}</span><span class="mk-own-t">${who}${st ? dot + st : ''}${news ? dot + news : ''}</span>${cue()}</li>`;
    }
    if (dir === 'b') {
      // A plate: a quiet glass button in the kit's language.
      return `<li class="${cls}" ${attrs}><span class="wc-lk-btn is-small keep-ic mk-chip${sel ? ' is-sel' : ''}"><span class="mk-own-m">${mark(o.mark)}</span><span class="mk-own-t">${who}${st ? dot + st : ''}${news ? dot + news : ''}</span>${cue()}</span></li>`;
    }
    // C: the box's title bar: the name left, the state right.
    return `<li class="${cls}" ${attrs}><span class="mk-own-t">${who}</span><span class="mk-own-r">${news}${st}<span class="mk-own-m">${mark(o.mark)}</span></span>${cue()}</li>`;
  }

  // ----------------------------------------------------------------- states
  const S = [];
  const add = (s) => S.push(s);
  const DIRS = [
    ['a', 'A · rule and diamond'],
    ['b', 'B · space only'],
    ['c', 'C · a frame per zone'],
  ];
  const DIR_NOTE = {
    a: 'Zones parted by the rule with the diamond; the owner row is a heading line with the state mark in the icons’ column and a key cap and chevron at its right end.',
    b: 'No rules: air and type weight. The owner row is a glass plate; Profile, Scripts and History hang from it on a fine bracket.',
    c: 'Each zone an inset of its own; the owner row is the title bar of the “mine” inset, the name left and the state right.',
  };

  for (const [d, dl] of DIRS) {
    const m = (id, label, note, o, views) =>
      add(Object.assign({ id: `menu-${d}-${id}`, topic: 'menu', topicLabel: 'Menu', dir: d, dirLabel: dl, label, note: note + ' ' + DIR_NOTE[d], page: 'main', kind: 'menu', views: views || ['d', 'p'] }, o));
    m('f1', 'Form 1 · before accounts', 'Flags accounts and gallery off: no owner row, no Community.', { owner: null, com: null });
    m('f2-guest', 'Form 2 · guest', 'Accounts on, nobody logged in.', { owner: 'guest', com: null });
    m('f2-name', 'Form 2 · logged in', 'Accounts on, before sync exists: the name alone.', { owner: 'name', com: null });
    m('f3', 'Form 3 · community', 'Logged in and synced, Community with its counter. The cursor rests on Enter MUME, the default.', { owner: 'synced', com: '3 new' }, ['d', 'p', 'l']);
    m('f3-guest', 'Form 3 · guest', 'A guest sees the Community and its counter too.', { owner: 'guest', com: '3 new' });
    m('f3-nocount', 'Form 3 · no counter', 'Nothing new in the Community.', { owner: 'synced', com: '' });
    m('f3-cur-owner', 'Cursor on the owner row', 'The menu cursor (keyboard or a resting mouse) on the owner row: it lights as a row does.', { owner: 'synced', com: '3 new', sel: 'owner' });
    m('f3-com-strong', 'Community stronger', 'Variant for pick 1: Community in the primary tone with the counter as a badge.', { owner: 'synced', com: '3 new', strong: true });
    m('f3-cur-com', 'Cursor on Community', 'The cursor on Community (the quiet weight).', { owner: 'synced', com: '3 new', sel: 'community' });
    m('f3-about-under', 'About under the panel', 'Variant for pick 4: About as a small line under the panel instead of its last row.', { owner: 'synced', com: '3 new', under: true });
    m('f1-about-under', 'Form 1 · About under', 'Variant for pick 4 in the form every player gets first.', { owner: null, com: null, under: true });
    m('f3-long', 'Longest text · 360', 'Pick 7: “olevongertten · storage full · 2 new” in today’s 360 px panel.', { owner: 'long', com: '3 new' });
    m('f3-long-400', 'Longest text · 400', 'Pick 7: the same in a 400 px panel.', { owner: 'long', com: '3 new', wide: true });
    m('f3-name20', '20-letter name · 360', 'The longest name the account pages allow (20 characters), 360 px.', { owner: 'name20', com: '3 new' });
  }

  for (const [d, dl] of DIRS) {
    const base = { topic: 'owner', topicLabel: 'Owner row', dir: d, dirLabel: dl, page: 'main' };
    add(Object.assign({ id: `owner-${d}-sheet`, label: 'All states', note: 'Every state of the owner row at the panel’s true width (336 px inside a 360 px panel). ' + DIR_NOTE[d], kind: 'sheet', views: ['d', 'p'] }, base));
    for (const k of OWNER_ORDER) {
      add(Object.assign({ id: `owner-${d}-${k}`, label: OWNER[k].label, note: `The menu with the owner row “${[OWNER[k].who, OWNER[k].st, OWNER[k].news].filter(Boolean).join(' · ')}”.`, kind: 'menu', owner: k, com: '3 new', views: ['d', 'p'], noshot: true }, base));
    }
  }

  const PLACES = [
    ['p1', 'P1 · above the page’s head', 'The strip has a row of its own in the band Back already stands in, under the hood; the page’s own head is untouched below it.'],
    ['p2', 'P2 · in the page’s head', 'The tabs share the row of the page’s own head (History’s pills, the Spotlights filter row, the book’s chapters).'],
  ];
  const TABS = [
    ['sessions', 'Sessions', 'history'],
    ['spotlights', 'Spotlights', 'spotlights'],
    ['diary', 'Diary', 'diary'],
  ];
  for (const [pl, pll, pnote] of PLACES) {
    for (const [t, tl, page] of TABS) {
      add({ id: `history-${pl}-${t}`, topic: 'history', topicLabel: 'History', dir: pl, dirLabel: pll, label: tl, note: pnote + ' Keys 1 2 3 change tab.', page, kind: 'tabs', place: pl, tab: t, views: pl === 'p1' ? ['d', 'p', 't'] : ['d', 'p'] });
    }
    add({ id: `history-${pl}-hover`, topic: 'history', topicLabel: 'History', dir: pl, dirLabel: pll, label: 'Pointer on a tab', note: 'Sessions is the active tab, the pointer rests on Spotlights, Diary is inactive.', page: 'history', kind: 'tabs', place: pl, tab: 'sessions', hover: 'spotlights', views: ['d', 'p'] });
  }

  window.MK_STATES = S.map((s) => ({ id: s.id, topic: s.topic, topicLabel: s.topicLabel, dir: s.dir, dirLabel: s.dirLabel, label: s.label, note: s.note, page: s.page, views: s.views, noshot: !!s.noshot }));
  if (!window.MK) return;

  // ------------------------------------------------------------------ apply
  const st = S.find((s) => s.id === MK.state) || S[0];
  const app = document.getElementById('app');
  const start = app.querySelector('.wc-start');
  const root = document.documentElement;
  start.querySelector('.wc-start-skyhost').style.background = `#1b2340 url(${MK.sky}) center / cover no-repeat`;
  root.classList.add('mk-' + view, touch ? 'mk-touch' : 'mk-mouse');
  const okb = app.querySelector('.wc-okb-page');
  if (okb) okb.remove();
  app.style.removeProperty('--wc-okb-page-h');

  // The rows of the real menu, by key (their own icons and labels).
  const realMenu = app.querySelector('.wc-sm');
  const REAL = {};
  for (const li of realMenu.querySelectorAll('.wc-sm-item')) {
    li.classList.remove('is-sel');
    li.removeAttribute('aria-current');
    REAL[li.dataset.key] = li;
  }
  function row(key, sel, cls, go) {
    const li = REAL[key].cloneNode(true);
    if (sel) li.classList.add('is-sel');
    if (cls) li.classList.add(...cls.split(' '));
    if (go) li.dataset.go = go;
    return li.outerHTML;
  }
  function community(count, sel, strong) {
    return (
      `<li class="wc-sm-item mk-com${strong ? ' is-strong' : ''}${sel ? ' is-sel' : ''}" role="menuitem" data-key="community" aria-keyshortcuts="C">` +
      ic('star', 'wc-sm-ic') +
      `<span class="wc-sm-label"><u class="wc-sk">C</u>ommunity</span>${count ? `<span class="mk-count">${esc(count)}</span>` : ''}</li>`
    );
  }
  function about(sel) {
    const li = REAL.about.cloneNode(true);
    li.classList.add('mk-foot');
    if (sel) li.classList.add('is-sel');
    const svg = li.querySelector('svg');
    if (svg) svg.remove();
    return li.outerHTML;
  }
  const SEP = '<li class="wc-sm-sep" role="separator" aria-hidden="true"></li>';
  const GAP = '<li class="mk-gap" role="separator" aria-hidden="true"></li>';

  /** The menu's rows for a direction. o: owner (a key of OWNER or null), com (the counter, '' for none, null for no Community), sel, strong, under. */
  function menuHtml(dir, o) {
    const sel = o.sel || 'enter';
    const own = o.owner ? ownerRow(dir, o.owner, sel === 'owner') : '';
    const mine = (cls) => row('profile', sel === 'profile', cls) + row('scripts', sel === 'scripts', cls) + row('history', sel === 'history', cls, 'history-p1-sessions');
    const com = o.com !== null && o.com !== undefined ? community(o.com, sel === 'community', o.strong) : '';
    const foot = o.under ? '' : about(sel === 'about');
    const enter = row('enter', sel === 'enter');
    if (dir === 'a') return enter + SEP + own + mine('') + (com ? SEP + com : '') + foot;
    if (dir === 'b') return enter + GAP + own + mine(own ? 'mk-in' : '') + (com ? GAP + com : '') + (foot ? '<li class="mk-gap is-small" aria-hidden="true"></li>' + foot : '');
    return (
      `<li class="mk-zone mk-z-play"><ul class="mk-zrows">${enter}</ul></li>` +
      `<li class="mk-zone mk-z-mine${own ? ' has-owner' : ''}"><ul class="mk-zrows">${own}${mine('')}</ul></li>` +
      (com ? `<li class="mk-zone mk-z-all${o.strong ? ' is-strong' : ''}"><ul class="mk-zrows">${com}</ul></li>` : '') +
      foot
    );
  }

  const stack = start.querySelector('.wc-stack');
  const frames = stack.querySelectorAll(':scope > .wc-frame');

  if (st.kind === 'menu') {
    const dir = st.dir;
    realMenu.className = `wc-sm mk-menu mk-${dir}`;
    realMenu.innerHTML = menuHtml(dir, st);
    const win = realMenu.closest('.wc-sm-win');
    win.classList.add('mk-win-' + dir);
    if (!st.under) win.classList.add('mk-has-foot');
    if (st.under) {
      realMenu.closest('.wc-sm-panel').insertAdjacentHTML('afterend', `<div class="mk-about-under" role="link" title="About (A)"><u class="wc-sk">A</u>bout</div>`);
    }
    if (st.wide) start.style.setProperty('--wc-panel-w', '400px');
  } else if (st.kind === 'sheet') {
    // Every owner row state at the panel's true inner width, in one box.
    const dir = st.dir;
    root.classList.add('mk-sheetpage');
    const slice = (k) =>
      `<figure class="mk-slice"><figcaption>${esc(OWNER[k].cap)}</figcaption><ul class="wc-sm mk-menu mk-${dir} mk-slice-menu">` +
      (dir === 'c'
        ? `<li class="mk-zone mk-z-mine has-owner"><ul class="mk-zrows">${ownerRow(dir, k, false)}${touch ? '' : row('profile')}</ul></li>`
        : row('enter', false, 'mk-ghost') + ownerRow(dir, k, false) + (touch ? '' : row('profile', false, dir === 'b' ? 'mk-in' : ''))) +
      `</ul></figure>`;
    const selSlice =
      `<figure class="mk-slice"><figcaption>the cursor on it</figcaption><ul class="wc-sm mk-menu mk-${dir} mk-slice-menu">` +
      (dir === 'c'
        ? `<li class="mk-zone mk-z-mine has-owner"><ul class="mk-zrows">${ownerRow(dir, 'synced', true)}${touch ? '' : row('profile')}</ul></li>`
        : row('enter', false, 'mk-ghost') + ownerRow(dir, 'synced', true) + (touch ? '' : row('profile', false, dir === 'b' ? 'mk-in' : ''))) +
      `</ul></figure>`;
    const BR = '<i class="wc-lk-br wc-lk-b1"></i><i class="wc-lk-br wc-lk-b2"></i><i class="wc-lk-br wc-lk-b3"></i><i class="wc-lk-br wc-lk-b4"></i>';
    app.querySelector('.wc-sm-stage').innerHTML =
      `<section class="wc-lk-box wc-lk-box-normal mk-sheetbox">${BR}<div class="wc-lk-hood"><span class="wc-lk-hood-t">Owner row · ${dir.toUpperCase()}</span></div>` +
      `<div class="wc-lk-win mk-sheetwin"><div class="mk-sheet">${OWNER_ORDER.map(slice).join('')}${touch ? '' : selSlice}</div></div></section>`;
  } else if (st.kind === 'tabs') {
    const box = app.querySelector('.wc-frame:not([hidden]) .wc-lk-box');
    const win = box.querySelector(':scope > .wc-lk-win');
    box.querySelector('.wc-lk-hood-t').textContent = 'History';
    box.setAttribute('aria-label', 'History');
    box.querySelector('.wc-lk-back').dataset.go = 'menu-a-f3';
    root.classList.add('mk-tabs-' + st.place, 'mk-tab-' + st.tab);
    const tabs =
      `<div class="wc-lk-tabs mk-tabs" role="tablist" aria-label="History">` +
      TABS.map(
        ([t, label], i) =>
          `<button type="button" class="wc-lk-tab${t === st.tab ? ' is-on' : ''}${t === st.hover ? ' mk-hover' : ''}" role="tab" aria-selected="${t === st.tab}" aria-keyshortcuts="${i + 1}" tabindex="-1" data-go="history-${st.place}-${t}">` +
          `${touch ? '' : `<kbd class="mk-tk">${i + 1}</kbd>`}<span>${label}</span></button>`,
      ).join('') +
      `</div>`;
    const head = win.querySelector('.wc-lk-bhead');
    if (st.place === 'p1') {
      win.insertAdjacentHTML('afterbegin', `<div class="mk-strip">${tabs}</div>`);
    } else if (touch && view !== 't') {
      // A phone's head rows are full: the tabs stand in Back's row, right of it.
      box.insertAdjacentHTML('beforeend', `<div class="mk-backrow">${tabs}</div>`);
    } else {
      head.classList.add('mk-head-tabs');
      head.insertAdjacentHTML('afterbegin', tabs);
    }
  }

  // The wordmark's height, for the pages' layout (the app measures it the same way).
  const brand = start.querySelector('.wc-start-brand');
  const putBrand = () => {
    if (brand && view !== 'l') start.style.setProperty('--wc-brand-h', brand.offsetHeight + 'px');
  };
  putBrand();
  window.addEventListener('resize', putBrand);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(putBrand);

  // The menu cursor follows the mouse, as in the app (a move selects the row).
  if (st.kind === 'menu' && !touch) {
    document.addEventListener('mousemove', (e) => {
      const li = e.target.closest && e.target.closest('.wc-sm-item');
      if (!li || li.classList.contains('is-sel')) return;
      for (const x of document.querySelectorAll('.wc-sm-item.is-sel, .mk-chip.is-sel')) x.classList.remove('is-sel');
      li.classList.add('is-sel');
      const chip = li.querySelector('.mk-chip');
      if (chip) chip.classList.add('is-sel');
    });
  }

  // Clicks that lead somewhere: ask the shell for that state.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-go]');
    if (a) {
      e.preventDefault();
      parent.postMessage({ mkGo: a.dataset.go }, '*');
    }
  });
})();
