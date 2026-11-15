// The mockups' states (stage 62, round 10). Runs in two places: in the review
// shell, where it only lists the states (window.MK_STATES), and inside the
// stage's document, where `window.MK` names the state to draw over the
// captured page (build/skel). Throwaway: the built DOM as captured, the new
// content in the built classes where they exist and in mk-* classes where not.
(function () {
  'use strict';

  const MK = window.MK || { view: 'd', icons: {} };
  const view = MK.view;
  const touch = view !== 'd';
  const ic = (name, cls) => ((MK.icons && MK.icons[name]) || '').replace('class="wc-lk-ic', 'class="wc-lk-ic ' + (cls || ''));

  // This device's type and the other device's label, by view: a phone only
  // ever takes a phone's settings (ADR 0152: settings per device type).
  const TYPE = touch ? 'phone' : 'desktop';
  const FROM = touch ? 'phone, Safari' : 'desktop, Chrome';
  const OTHERS = touch ? 'desktop and tablet' : 'tablet and phone';

  // ----------------------------------------------------------------- the words
  const T = {
    pulled: `Settings from ${FROM}.`,
    pulledLater: `Settings from ${FROM}, held until the game ended.`,
    follows: `Follows the account: profiles, scripts, settings for ${TYPE} (this device), ${OTHERS}, script data, Comm history (7 days), timers.`,
  };

  // ----------------------------------------------------------------- states
  const S = [];
  const add = (s) => S.push(Object.assign({ views: ['d', 'p'] }, s));
  const topic = (id, label) => (dir, dirLabel) => (o) => add(Object.assign({ topic: id, topicLabel: label, dir, dirLabel }, o));

  // 1. Log out with things not in the account
  {
    const t = topic('logout', '1 · Log out, what is not in the account');
    const a = t('a', 'a · One changes row, the kinds under it');
    a({ id: 'logout-a-changes', label: 'Changes only', page: 'logoutsome', logout: { form: 'a' }, note: 'Round 9’s single row as built (“4 changes not synced”), with a second, quieter line naming the kinds.' });
    a({ id: 'logout-a-runs', label: 'With runs', page: 'logoutsome', logout: { form: 'a', runs: true }, note: 'The same with the runs’ rows (built, stage 61): the changes stay one row among three.' });
    const b = t('b', 'b · A row per kind');
    b({ id: 'logout-b-changes', label: 'Changes only', page: 'logoutsome', logout: { form: 'b' }, note: 'One row per kind, each with the offline ring; why it is not synced moves to the lead line.' });
    b({ id: 'logout-b-runs', label: 'With runs', page: 'logoutsome', logout: { form: 'b', runs: true }, note: 'The same with the runs’ rows: five rows, and the dialog grows tall on a phone.' });
    t('r', 'For reference')({ id: 'logout-all', label: 'All in the account', page: 'logout', note: 'Everything is in the account: the built dialog, unchanged.' });
  }

  // 2. Settings pulled while the start menu shows
  {
    const t = topic('pulled', '2 · Settings pulled on the start menu');
    const a = t('a', 'a · Applied quietly');
    a({ id: 'pulled-a-before', label: 'Before', page: 'in', note: 'The start menu before the pull: Profile shows the profile picked on this device (“default”).' });
    a({ id: 'pulled-a-after', label: 'After', page: 'in', profile: 'warrior', note: 'After the pull, nothing said: the only trace on the start menu is Profile’s note (“warrior”, picked on the other desktop). Look, panes and layout show only in the game: the start menu draws none of them.' });
    t('b', 'b · Applied, with a message')({ id: 'pulled-b', label: 'Applied', page: 'in', profile: 'warrior', flash: T.pulled, note: 'Applied at once, and the message line says where the settings came from (the device’s label, as the Account page’s Devices list has it).' });
    t('c', 'c · After the game, when they waited')({ id: 'pulled-c', label: 'Back from the game', page: 'in', profile: 'warrior', flash: T.pulledLater, note: 'They came during play, waited (nothing is swapped during play), and are applied when the start page shows again. The message says why now.' });
  }

  // 3. The Account page's sync section
  {
    const t = topic('sync', '3 · The Account page’s sync section');
    t('a', 'a · A line naming what follows')({ id: 'sync-a', label: 'Synced', page: 'account', follows: true, note: 'One added line under the bar: what follows the account. The device type in use is named first, with “(this device)”.' });
    t('b', 'b · As built')({ id: 'sync-b', label: 'Synced', page: 'account', note: 'The built section, unchanged (only the counts are filled in, as on a used account).' });
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

  // ------------------------------------------------------------ the start menu
  if (st.profile) {
    const n = app.querySelector('.wc-sm-item[data-key="profile"] .wc-sm-note');
    if (n) n.textContent = `(${st.profile})`;
  }
  const win = app.querySelector('.wc-sm-win');
  const flashEl = app.querySelector('.wc-sm-flash');
  if (st.flash && flashEl && win) {
    flashEl.innerHTML = `<span class="is-ok">${st.flash}</span>`;
    // As the built line does (start-main.tsx useFlashRoom): About makes room for it.
    const put = () => win.style.setProperty('--wc-sm-flash-h', Math.max(18, Math.ceil(flashEl.offsetHeight)) + 'px');
    put();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(put);
  }

  // ------------------------------------------------------------ Log out
  if (st.logout) {
    const dlg = app.querySelector('[data-logout="some"]');
    const list = dlg && dlg.querySelector('.wc-ac-dlist');
    const lead = dlg && dlg.querySelector('.wc-lk-qn');
    const ring = '<span class="wc-so-mark is-ring" aria-hidden="true"></span>';
    let rows = '';
    if (st.logout.form === 'a') {
      rows =
        `<li data-row="changes" class="mk-two">${ring}<span><span><b>4 changes</b> not synced <i>(the server could not be reached)</i></span>` +
        `<span class="mk-kinds">2 profiles · settings · Comm history, today</span></span></li>`;
    } else {
      if (lead) lead.textContent = 'Not everything is in your account yet: the server could not be reached. Logging out removes these from this device:';
      rows =
        `<li data-row="profile">${ring}<span><b>2 profiles</b> not synced</span></li>` +
        `<li data-row="settings">${ring}<span><b>Settings for ${TYPE}</b> not synced</span></li>` +
        `<li data-row="comm">${ring}<span><b>Comm history of today</b> not synced</span></li>`;
    }
    if (st.logout.runs) {
      rows +=
        `<li data-row="saved">${ic('save')}<span><b>1 saved run</b> on this device only</span></li>` +
        `<li data-row="unsaved">${ic('hourglass')}<span><b>3 unsaved runs</b> of the last 14 days — <button type="button" class="wc-lk-link wc-ac-inlink" tabindex="-1">open <u class="wc-sk">H</u>istory</button> to save them</span></li>`;
    }
    if (list) list.innerHTML = rows;
  }

  // ------------------------------------------------------------ the Account page
  if (st.page === 'account') {
    const n = app.querySelector('.wc-ac-sync-n > span:first-child');
    if (n) n.textContent = '12 profiles · 5 scripts';
    const kb = app.querySelector('.wc-ac-sync-kb');
    if (kb) kb.textContent = kb.textContent.replace(/^\S+ \S+/, '310 KB');
    const bar = app.querySelector('.wc-ac-bar i');
    if (bar) bar.style.width = '15%';
    if (st.follows) {
      const sync = app.querySelector('.wc-ac-sync');
      if (sync) sync.insertAdjacentHTML('beforeend', `<p class="wc-ac-small mk-follows">${T.follows}</p>`);
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
})();
