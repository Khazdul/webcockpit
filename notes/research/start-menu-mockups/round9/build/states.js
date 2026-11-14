// The mockups' states (stage 61, round 9). Runs in two places: in the review
// shell, where it only lists the states (window.MK_STATES), and inside the
// stage's document, where `window.MK` names the state to draw over the
// captured page (build/skel). Throwaway: a simplified DOM in the real classes,
// the new content in classes of its own (mk-*).
(function () {
  'use strict';

  const MK = window.MK || { view: 'd', icons: {}, owner: [] };
  const view = MK.view;
  const touch = view !== 'd';
  const ic = (name, cls) => ((MK.icons && MK.icons[name]) || '').replace('class="wc-lk-ic', 'class="wc-lk-ic ' + (cls || ''));

  const NAME = 'ole';
  const W = (n) => `<b class="wc-ac-who">${n}</b>`;

  // ----------------------------------------------------------------- the words
  // (Tightened from the brief where noted in README.md.)
  const T = {
    moved: `Moved into ${NAME}: 4 profiles, 2 scripts. This device is back at its starting set.`,
    moving: `Moving 6 things into ${NAME}… 3 of 6`,
    movewait: `4 things moved into ${NAME}. 2 scripts still to move: they go when the server can be reached, and stay on this device until then.`,
    locked: `3 changes are not in the account ${NAME} yet. They are kept on this device until you log in.`,
    loggedOut: `Logged out. Everything is in your account ${NAME}.`,
    lost: `You were logged out of ${NAME} on this device.`,
    deleted: `The account ${NAME} was deleted.`,
    both: `warrior was changed on two devices. Both are kept: warrior and warrior (from phone, 14 Nov).`,
    afterDelete: `The account ${NAME} is deleted. Its profiles and scripts are this device’s now.`,
  };

  // ----------------------------------------------------------------- states
  const S = [];
  const add = (s) => S.push(Object.assign({ views: ['d', 'p'] }, s));
  const topic = (id, label) => (dir, dirLabel) => (o) => add(Object.assign({ topic: id, topicLabel: label, dir, dirLabel }, o));

  // 1. After Create account
  {
    const t = topic('moved', '1 · After Create account');
    const a = t('a', 'a · The start menu’s message line');
    a({ id: 'moved-a-done', label: 'Moved', page: 'in', owner: 'synced', flash: T.moved, note: 'Create account reloads to the start menu (ADR 0150); the line says what moved. The message line grows to two or three lines for it.' });
    a({ id: 'moved-a-running', label: 'Moving', page: 'in', owner: 'syncing', flash: T.moving, note: 'The move still running when the start menu shows: the count on the message line, the owner row “syncing”.' });
    a({ id: 'moved-a-waiting', label: 'Waiting for the network', page: 'in', owner: 'offline', flash: T.movewait, note: 'Part of the move could not reach the server: what is left stays on the device and goes later. The owner row “offline”.' });
    const b = t('b', 'b · A receipt on the Account page');
    b({ id: 'moved-b-done', label: 'Moved', page: 'account', sync: 'synced', receipt: 'done', note: 'A receipt above the sync section, as the Import page’s: what moved, counted and named, with OK. Needs the reload to land on the Account page instead of the start menu.' });
    b({ id: 'moved-b-running', label: 'Moving', page: 'account', sync: 'syncing', receipt: 'running', note: 'The same receipt while the move runs: a count and the names still to go.' });
    b({ id: 'moved-b-waiting', label: 'Waiting for the network', page: 'account', sync: 'offline', receipt: 'waiting', note: 'Part of the move waits for the server; the receipt says what is left and that it stays on the device.' });
    const c = t('c', 'c · A line in the Account page’s sync section');
    c({ id: 'moved-c-done', label: 'Moved', page: 'account', sync: 'synced', moveLine: 'done', note: 'One line in the sync section (point 7), under the state: quiet, and still there when the player looks later.' });
  }

  // 2. The locked copy
  {
    const t = topic('locked', '2 · The locked copy');
    t('a', 'a · Under the owner row')({ id: 'locked-a', label: 'Notice', page: 'main', owner: 'locked', lock: 'under', note: 'The device’s space; the owner row in its locked state, the notice right under it inside the panel, Log in and Remove beside it.' });
    t('b', 'b · A card below the panel')({ id: 'locked-b', label: 'Notice', page: 'main', owner: 'locked', lock: 'card', note: 'The notice as a card of its own where the quote stands; the panel is as for a guest apart from the owner row.' });
    t('c', 'c · The message line')({ id: 'locked-c', label: 'Notice', page: 'main', owner: 'locked', lock: 'line', note: 'The notice on the menu’s message line, with Log in and Remove as links in it (the line today takes no pointer or keys).' });
    t('d', 'Remove’s question')({ id: 'locked-remove', label: 'Remove?', page: 'main', owner: 'locked', lock: 'under', dialog: 'remove', note: 'Remove asks first and names what is lost. Keep is the default (Enter); Remove is red. No download in the locked state.' });
  }

  // 3. The start menu's messages
  {
    const t = topic('msg', '3 · The start menu’s messages');
    const a = t('a', 'a · Plain line (today’s flash)');
    const b = t('b', 'b · With the owner row’s mark');
    for (const [k, label, text, mark, short] of [
      ['out', 'Logged out', T.loggedOut, 'dot', 'logged out. Everything is in your account.'],
      ['lost', 'Session lost', T.lost, 'ring', 'you were logged out on this device.'],
      ['deleted', 'Account deleted', T.deleted, 'diamond', 'this account was deleted.'],
    ]) {
      a({ id: `msg-a-${k}`, label, page: 'main', owner: 'guest', flash: text, note: 'Today’s message line: the orange serif italic, centred between History and About.' });
      b({ id: `msg-b-${k}`, label, page: 'main', owner: 'guest', flashOwn: { mark, short }, note: 'The line in the owner row’s own language: its mark, the name in the small caps, the words in the plain serif italic, no orange glow.' });
    }
  }

  // 4. The Log out dialog
  {
    const t = topic('logout', '4 · The Log out dialog')('a', 'First form');
    t({ id: 'logout-all', label: 'All in the account', page: 'logout', sync: 'synced', logout: 'all', note: 'Everything is in the account: one question, Enter logs out.' });
    t({ id: 'logout-some', label: 'Something not in it', page: 'logout', sync: 'offline', logout: 'some', note: 'A row each for what is not in the account; Stay logged in is the default (Enter), Download gives the exports, Log out anyway is red.' });
    t({ id: 'logout-refused', label: 'Refused (another tab)', page: 'logout', sync: 'synced', logout: 'refused', note: 'A game runs in another tab: no log out, the reason, OK.' });
    t({ id: 'logout-syncing', label: 'Syncing first', page: 'logout', sync: 'syncing', logout: 'syncing', note: 'Log out syncs what is waiting before it asks; a second or two, Cancel only.' });
  }

  // 5. Keep both
  {
    const t = topic('both', '5 · Keep both');
    t('a', 'a · The start menu’s message line')({ id: 'both-a', label: 'Message', page: 'in', owner: 'synced', note2: 'warrior', flash: T.both, note: 'After a sync that kept both copies: the message line names both.' });
    t('b', 'b · A mark on the Profile page')({ id: 'both-b', label: 'Profile page', page: 'profiles', both: true, note: 'The Profile page’s list: the new copy carries a mark (“kept both”) until it is opened or renamed; the page’s own message line names both.' });
  }

  // 6. Delete account
  {
    const t = topic('delete', '6 · Delete account')('a', 'The new text');
    t({ id: 'delete-dialog', label: 'Dialog', page: 'delete', note: 'The dialog’s “What stays” paragraph replaced by “What happens on this device”.' });
    t({ id: 'delete-after', label: 'Afterwards', page: 'main', owner: 'guest', flash: T.afterDelete, note: 'Back on the start menu in the device’s space, with the handed-back things.' });
  }

  // 7. The Account page's sync section
  {
    const t = topic('sync', '7 · The Account page’s sync section')('a', 'One design');
    t({ id: 'sync-synced', label: 'Synced', page: 'account', sync: 'synced', note: 'The sync section under the head: the state with its mark, the counts, the storage bar and Sync now (S).' });
    t({ id: 'sync-syncing', label: 'Syncing', page: 'account', sync: 'syncing', note: 'While it syncs: the breathing mark, Sync now greyed.' });
    t({ id: 'sync-offline', label: 'Offline', page: 'account', sync: 'offline', note: 'Offline: when it last synced and what waits on this device.' });
    t({ id: 'sync-full', label: 'Storage full', page: 'account', sync: 'full', note: 'Needs attention: the amber diamond, the bar full, what to do.' });
  }

  window.MK_STATES = S.map((s) => ({ id: s.id, topic: s.topic, topicLabel: s.topicLabel, dir: s.dir, dirLabel: s.dirLabel, label: s.label, note: s.note, page: s.page, views: s.views, noshot: !!s.noshot }));
  if (!window.MK) return;

  // ------------------------------------------------------------------ apply
  const st = S.find((s) => s.id === MK.state) || S[0];
  const app = document.getElementById('app');
  const start = app.querySelector('.wc-start');
  const root = document.documentElement;
  start.querySelector('.wc-start-skyhost').style.background = `#1b2340 url(${MK.sky}) center / cover no-repeat`;
  root.classList.add('mk-' + view, touch ? 'mk-touch' : 'mk-mouse', 'mk-st-' + st.topic);
  const okb = app.querySelector('.wc-okb-page');
  if (okb) okb.remove();
  app.style.removeProperty('--wc-okb-page-h');
  const shown = () => app.querySelector('.wc-stack > .wc-frame:not([hidden]), .wc-stack > .wc-frame[data-overlay]');

  /** A kit button. o: primary, danger, small, sel, off, icon, key (the letter to underline, first match). */
  function btn(label, o = {}) {
    const cls = ['wc-lk-btn', o.primary && 'is-primary', o.danger && 'is-danger', o.small && 'is-small', o.sel && 'is-sel', o.off && 'is-disabled'].filter(Boolean).join(' ');
    let text = label;
    if (o.key) {
      const i = label.toLowerCase().indexOf(o.key.toLowerCase());
      if (i >= 0) text = `${label.slice(0, i)}<u class="wc-sk">${label[i]}</u>${label.slice(i + 1)}`;
    }
    return `<button type="button" class="${cls}" tabindex="-1"${o.off ? ' aria-disabled="true"' : ''}>${o.icon ? ic(o.icon) : ''}<span>${text}</span></button>`;
  }
  const mark = (m) => `<span class="wc-so-mark mk-m is-${m}" aria-hidden="true"></span>`;
  const rule = (title) => `<div class="wc-lk-rule mk-rule"><h3 class="wc-lk-sec">${title}</h3><i class="wc-lk-hair" aria-hidden="true"></i></div>`;

  // ------------------------------------------------------------ the owner row
  const OWNER = {};
  for (const h of MK.owner || []) {
    const k = (h.match(/data-state="([a-z]+)"/) || [])[1];
    if (k && !OWNER[k]) OWNER[k] = h;
  }
  function setOwner(state) {
    const li = app.querySelector('.wc-sm-item[data-key="owner"]');
    if (li && OWNER[state]) li.outerHTML = OWNER[state];
  }
  if (st.owner) setOwner(st.owner);
  if (st.note2) {
    const n = app.querySelector('.wc-sm-item[data-key="profile"] .wc-sm-note');
    if (n) n.textContent = `(${st.note2})`;
  }
  // (The menu cursor rests on Enter MUME, the default.)

  // ------------------------------------------------------------ the message line
  const win = app.querySelector('.wc-sm-win');
  const flashEl = app.querySelector('.wc-sm-flash');
  /** Lets the message line take as many lines as it needs, and About make room for it. */
  function growFlash() {
    if (!flashEl || !win) return;
    flashEl.classList.add('mk-wrap');
    const put = () => {
      win.style.setProperty('--wc-sm-flash-h', Math.max(18, flashEl.offsetHeight) + 'px');
    };
    put();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(put);
  }
  if (st.flash && flashEl) {
    flashEl.innerHTML = `<span class="is-ok">${st.flash}</span>`;
    growFlash();
  }
  if (st.flashOwn && flashEl) {
    flashEl.innerHTML = `<span class="mk-fl-own">${mark(st.flashOwn.mark)}<span class="mk-fl-name">${NAME}</span><span class="mk-fl-t"><span class="mk-fl-sep"> · </span>${st.flashOwn.short}</span></span>`;
    growFlash();
  }

  // ------------------------------------------------------------ the locked copy's notice
  if (st.lock) {
    const acts = `${btn('Log in', { small: true, key: 'l' })}${btn('Remove', { small: true, danger: true, key: 'r' })}`;
    const text = `3 changes are not in the account <b>${NAME}</b> yet. They are kept on this device until you log in.`;
    const ownerLi = app.querySelector('.wc-sm-item[data-key="owner"]');
    if (st.lock === 'under' && ownerLi) {
      ownerLi.insertAdjacentHTML('afterend', `<li class="mk-lock" role="note"><p class="mk-lock-t">${text}</p><div class="mk-lock-b">${acts}</div></li>`);
    } else if (st.lock === 'card') {
      const quote = app.querySelector('.wc-sm-quote');
      const card = `<div class="mk-lockcard" role="note"><div class="mk-lockcard-h">${ic('lock')}<span>${NAME}</span><span class="mk-lockcard-s">· kept on this device</span></div><p class="mk-lock-t">${text}</p><div class="mk-lock-b">${acts}</div></div>`;
      if (quote) quote.outerHTML = card;
    } else if (st.lock === 'line' && flashEl) {
      flashEl.innerHTML = `<span class="is-ok">${T.locked} <span class="mk-fl-acts"><button type="button" class="wc-lk-link mk-fl-link" tabindex="-1"><u class="wc-sk">L</u>og in</button><span class="mk-fl-dot">·</span><button type="button" class="wc-lk-link mk-fl-link is-danger" tabindex="-1"><u class="wc-sk">R</u>emove</button></span></span>`;
      growFlash();
    }
  }

  // ------------------------------------------------------------ dialogs
  const BR = '<i class="wc-lk-br wc-lk-b1"></i><i class="wc-lk-br wc-lk-b2"></i><i class="wc-lk-br wc-lk-b3"></i><i class="wc-lk-br wc-lk-b4"></i>';
  function dialogHtml(title, body, buttons, width) {
    return (
      `<div class="wc-lk-veil"><div class="wc-lk-dslot"><section class="wc-lk-dialog mk-dlg" role="dialog" aria-modal="true" aria-label="${title}"${width ? ` style="width: min(${width}px, 100%);"` : ''}>${BR}` +
      `<div class="wc-lk-hood"><span class="wc-lk-hood-t">${title}</span></div><div class="wc-lk-dwin"><div class="wc-lk-dialog-b">${body}</div>` +
      (buttons ? `<div class="wc-lk-btns wc-lk-dialog-btns">${buttons}</div>` : '') +
      `</div></section></div></div>`
    );
  }
  /** A dialog over the start menu: the menu's frame goes under, as the stack does for a dialog. */
  function overMenu(html) {
    const stack = app.querySelector('.wc-stack');
    const f1 = stack.querySelector(':scope > .wc-frame');
    f1.setAttribute('hidden', '');
    f1.setAttribute('data-under', '');
    f1.setAttribute('inert', '');
    stack.classList.add('has-overlay');
    stack.insertAdjacentHTML('beforeend', `<div class="wc-frame" data-frame="9" data-overlay="">${html}</div>`);
    // (No --wc-ov-*: the dialog is wider than the panel, so it centres in the whole veil.)
  }
  /** Replaces the captured dialog (Log out, Delete) with ours, in its frame. */
  function replaceDialog(html) {
    const veil = app.querySelector('.wc-lk-veil');
    veil.outerHTML = html;
  }

  if (st.dialog === 'remove') {
    const body =
      `<p class="wc-lk-q">Remove ${W(NAME + '’s')} copy from this device?</p>` +
      `<p class="wc-lk-qn">3 changes that are not in the account are lost:</p>` +
      `<ul class="mk-dlist"><li>${ic('person')}<span>the profile <b>warrior</b></span></li><li>${ic('scroll')}<span>the scripts <b>autoloot</b> and <b>hunt</b></span></li></ul>` +
      `<p class="mk-dnote">To keep them, log in to ${NAME} instead.</p>`;
    overMenu(dialogHtml('Remove copy', `<div class="wc-ac-dlg">${body}</div>`, btn('Keep', { primary: true, sel: true, key: 'k' }) + btn('Remove', { danger: true, key: 'r' }), 460));
  }

  if (st.logout) {
    let body, buttons, width;
    if (st.logout === 'all') {
      body = `<p class="wc-lk-q">Log out of ${W(NAME)} on this device?</p><p class="wc-lk-qn">Everything is in your account. It is removed from this device, and you are back on this device’s own profiles, scripts and runs.</p>`;
      buttons = btn('Cancel', { key: 'c' }) + btn('Log out', { primary: true, sel: true, key: 'l' });
      width = 480;
    } else if (st.logout === 'some') {
      body =
        `<p class="wc-lk-q">Log out of ${W(NAME)} on this device?</p>` +
        `<p class="wc-lk-qn">Not everything is in your account yet. Logging out removes these from this device:</p>` +
        `<ul class="mk-dlist is-rows">` +
        `<li>${mark('ring')}<span><b>2 changes</b> not synced <i>(the server could not be reached)</i></span></li>` +
        `<li>${ic('save')}<span><b>1 saved run</b> on this device only</span></li>` +
        `<li>${ic('hourglass')}<span><b>3 unsaved runs</b> of the last 14 days — <button type="button" class="wc-lk-link mk-inlink" tabindex="-1">open <u class="wc-sk">H</u>istory</button> to save them</span></li>` +
        `</ul>`;
      body = `<div class="wc-ac-dlg">${body}</div>`;
      buttons = btn('Stay logged in', { primary: true, sel: true, key: 's' }) + btn('Download', { key: 'd', icon: 'export' }) + btn('Log out anyway', { danger: true, key: 'l' });
      width = 560;
    } else if (st.logout === 'refused') {
      body = `<p class="wc-lk-q">A game is running in another tab.</p><p class="wc-lk-qn">Log out when it has ended.</p>`;
      buttons = btn('OK', { primary: true, sel: true, key: 'o' });
      width = 420;
    } else {
      body = `<p class="wc-lk-q">Log out of ${W(NAME)} on this device?</p><p class="mk-dwork">${mark('pulse')}<span>Syncing before you log out… 2 changes</span></p>`;
      buttons = btn('Cancel', { sel: true, key: 'c' });
      width = 480;
    }
    replaceDialog(dialogHtml('Log out', body, buttons, width));
  }

  if (st.page === 'delete') {
    const ps = app.querySelectorAll('.wc-ac-dtxt');
    const last = ps[ps.length - 1];
    if (last) {
      last.innerHTML = `<b>What happens on this device:</b> your profiles and scripts in <b>${NAME}</b> come back to this device as its own. A name that exists on both sides keeps both.`;
      last.classList.add('mk-new');
    }
  }

  // ------------------------------------------------------------ the Account page
  const SYNC = {
    synced: { m: 'dot', w: '<b>Synced</b> · 2 minutes ago', used: '140 KB', frac: 0.07 },
    syncing: { m: 'pulse', w: '<b>Syncing…</b>', used: '140 KB', frac: 0.07, off: true },
    offline: { m: 'ring', w: '<b>Offline</b> · last synced at 14:02', used: '140 KB', frac: 0.07, note: '2 changes wait on this device. They go when the server can be reached.' },
    full: { m: 'diamond', w: '<b>Cloud storage full</b>', used: '2 MB', frac: 1, full: true, note: '1 change is kept on this device until there is room. Delete a profile or script you no longer need.' },
  };
  if (st.page === 'account' || st.page === 'logout' || st.page === 'delete') {
    const s = SYNC[st.sync || 'synced'];
    const counts = st.receipt === 'running' ? '9 profiles · 4 scripts' : '12 profiles · 5 scripts';
    let move = '';
    if (st.moveLine === 'done') move = `<p class="mk-sync-move">${ic('check')}<span>Moved here from this device when the account was made: <b>4 profiles, 2 scripts</b>.</span></p>`;
    const section =
      rule('Sync') +
      `<div class="mk-sync${s.full ? ' is-full' : ''}">` +
      `<div class="mk-sync-st">${mark(s.m)}<span class="mk-sync-w">${s.w}</span>${btn('Sync now', { small: true, key: 's', icon: 'reset', off: s.off })}</div>` +
      `<div class="mk-sync-n"><span>${counts}</span><span class="mk-sync-kb">${s.used} of 2 MB</span></div>` +
      `<div class="mk-bar" role="img" aria-label="${s.used} of 2 MB"><i style="width:${Math.max(s.frac * 100, 1.5)}%"></i></div>` +
      (s.note ? `<p class="wc-ac-small mk-sync-note">${s.note}</p>` : '') +
      move +
      `</div>`;
    const head = app.querySelector('.wc-ac-head');
    let receipt = '';
    if (st.receipt) {
      const R = {
        done: {
          h: `Moved into ${NAME}`,
          i: 'check',
          rows: [
            ['4', 'profiles', 'warrior, mage, gibur, rasta'],
            ['2', 'scripts', 'autoloot, hunt'],
          ],
          n: 'This device is back at its starting set: logged out, it has default and khazdul.',
        },
        running: {
          h: `Moving into ${NAME}… 3 of 6`,
          i: 'reset',
          rows: [
            ['3', 'moved', 'warrior, mage, gibur'],
            ['3', 'to go', 'rasta, autoloot, hunt'],
          ],
          n: 'Each thing leaves this device only when the account has it.',
        },
        waiting: {
          h: `4 of 6 moved into ${NAME}`,
          i: 'check',
          rows: [
            ['4', 'profiles', 'warrior, mage, gibur, rasta'],
            ['2', 'scripts to go', 'autoloot, hunt'],
          ],
          n: 'The 2 scripts move when the server can be reached; they stay on this device until then.',
        },
      }[st.receipt];
      receipt =
        `<section class="mk-rcpt${st.receipt === 'waiting' ? ' is-wait' : ''}" role="status"><div class="mk-rcpt-h">${ic(R.i, 'mk-rcpt-ic')}<span>${R.h}</span></div>` +
        `<ul class="mk-rcpt-l">${R.rows.map(([n, k, w]) => `<li><span class="mk-rcpt-n">${n}</span><span class="mk-rcpt-k">${k}</span><span class="mk-rcpt-w">${w}</span></li>`).join('')}</ul>` +
        `<div class="mk-rcpt-f"><p class="wc-ac-small">${R.n}</p>${st.receipt === 'running' ? '' : btn('OK', { small: true, sel: true, key: 'o' })}</div></section>`;
    }
    if (head) head.insertAdjacentHTML('afterend', receipt + section);
    // The page is taller now: the box takes the tall form and its body scrolls, as the page does on a short screen (useTallPage).
    const box = app.querySelector('.wc-ac-account');
    if (box && !box.classList.contains('is-tall')) {
      box.classList.add('is-tall');
      box.closest('.wc-lk-sub')?.classList.add('is-tall');
      box.querySelector('.wc-ac-body')?.classList.add('wc-lk-scroll');
    }
  }

  // ------------------------------------------------------------ the Profile page: keep both
  if (st.both) {
    const list = app.querySelector('.wc-pl-list');
    const rows = [...list.querySelectorAll('.wc-pl-row')];
    const plain = rows[1].cloneNode(true);
    const mk = (name, time, o = {}) => {
      const li = plain.cloneNode(true);
      li.dataset.name = name;
      li.querySelector('.wc-pl-n').textContent = name;
      li.querySelector('.wc-pl-time').textContent = time;
      if (o.tag) li.querySelector('.wc-pl-name').insertAdjacentHTML('beforeend', `<span class="wc-pl-sub"><small class="wc-pl-tag mk-both-tag">${o.tag}</small></span>`);
      if (o.sel) li.querySelector('.wc-pl-name').insertAdjacentHTML('beforeend', `<span class="wc-pl-sub"><small class="wc-pl-tag">Selected</small></span>`);
      return li;
    };
    // The cursor (and its buttons) on the new copy.
    const cur = rows[0];
    const acts = cur.querySelector('.wc-pl-acts');
    rows[0].classList.remove('is-on', 'is-selected');
    rows[0].removeAttribute('aria-current');
    if (acts) acts.remove();
    rows[0].querySelector('.wc-pl-sub')?.remove();
    const fresh = mk('warrior (from phone, 14 Nov)', '3 hours ago', { tag: 'kept both' });
    fresh.classList.add('is-on');
    if (acts) {
      for (const b of acts.querySelectorAll('.is-disabled')) {
        b.classList.remove('is-disabled');
        b.removeAttribute('aria-disabled');
        b.removeAttribute('title');
      }
      fresh.querySelector('.wc-pl-time').before(acts);
    }
    list.append(mk('mage', '2 days ago'), mk('warrior', 'just now', { sel: true }), fresh);
    const fl = app.querySelector('.wc-frame:not([hidden]) .wc-pl-btns + .wc-lk-flash, .wc-frame:not([hidden]) .wc-lk-flash');
    if (fl) {
      fl.innerHTML = `<span class="is-ok">warrior was changed on two devices. Both are kept.</span>`;
      fl.classList.add('mk-wrap');
    }
  }

  // The wordmark's height, for the pages' layout (the app measures it the same way).
  const brand = start.querySelector('.wc-start-brand');
  const putBrand = () => {
    if (brand) start.style.setProperty('--wc-brand-h', brand.offsetHeight + 'px');
  };
  putBrand();
  window.addEventListener('resize', putBrand);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(putBrand);
  void shown;
})();
