// The mockups' states (stage 64, round 12). Runs in two places: in the review
// shell, where it only lists the states (window.MK_STATES), and inside the
// stage's document, where `window.MK` names the state to draw over the
// captured page (build/skel). Throwaway: the built DOM as captured, the new
// content in the built classes where they exist and in mk-* classes where not.
// Every name, title and number here is invented.
(function () {
  'use strict';

  const MK = window.MK || { view: 'd', icons: {} };
  const view = MK.view;
  const touch = view !== 'd';
  const ic = (name, cls) => ((MK.icons && MK.icons[name]) || '').replace('class="wc-lk-ic', 'class="wc-lk-ic ' + (cls || ''));
  // Glyphs the kit has not got, drawn in its manner (16 × 16, stroked paths).
  const glyph = (d, cls) => `<svg class="wc-lk-ic ${cls || ''}" viewBox="0 0 16 16" aria-hidden="true">${d.map((p) => `<path d="${p}"></path>`).join('')}</svg>`;
  const LINK = () => glyph(['M6.6 9.4 9.4 6.6', 'M7.3 4.6 8.5 3.4a2.7 2.7 0 0 1 3.8 3.8L11.1 8.4', 'M8.7 11.4 7.5 12.6a2.7 2.7 0 0 1-3.8-3.8L4.9 7.6']);
  const FLAG = () => glyph(['M4 14V2.6', 'M4 3.2h7.6L9.8 5.9l1.8 2.8H4']);
  const DOWN = () => glyph(['M8 2.2v8', 'M4.8 7 8 10.2 11.2 7', 'M2.5 13.5h11']);
  const COPY = () => ic('duplicate');
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  // ----------------------------------------------------------------- the words and data
  const T = {
    linkUrl: 'https://mumecockpit.com/r/Ab3dE5fG7hJk',
    linkShort: 'mumecockpit.com/r/Ab3dE5fG7hJk',
    anyone: 'Anyone with the link can watch this.',
    title0: 'Rasta · 26 September 2026',
    title: 'Clearing the ranger camp',
    desc: 'Norsy and Kuzzim join at the ford; the rangers first, then the acolytes. The pkill is at 41:20.',
    sender: 'fenwick',
    char: 'Rasta',
    level: 42,
    length: '1 h 15 min',
    date: '26 September 2026',
    dateShort: '26 Sep 2026',
    views: '37 views',
    size: '1.2 MB',
    abuse: 'abuse@mumecockpit.com',
  };
  const RULES = [
    'The log shows other players: no harassment.',
    'Nothing about people’s real lives.',
    'MUME’s own rules apply.',
    'You can take a run down whenever you like.',
    'We remove what breaks this.',
  ];
  const PUBS = [
    { title: 'Clearing the ranger camp', id: 'Ab3dE5fG7hJk', views: 37, date: '15 Nov 2026', size: '1.2 MB' },
    { title: 'Gibur and the Witch-king’s lieutenant', id: 'Qm7Rt2Lp9xWz', views: 112, date: '14 Nov 2026', size: '2.4 MB' },
    { title: 'First crossing of the Brandywine', id: 'Hn4Kc8Vb1sYe', views: 5, date: '10 Nov 2026', size: '0.6 MB' },
    { title: 'Trollshaws hoard run', id: 'Zp6Wd3Fg5uNa', views: 21, date: '3 Nov 2026', size: '1.9 MB', hidden: true },
  ];
  const REASONS = ['Harassment', 'Real-life information about someone', 'Breaks MUME’s rules', 'Other'];

  // ----------------------------------------------------------------- states
  const S = [];
  const add = (s) => S.push(Object.assign({ views: ['d', 'p'] }, s));
  const topic = (id, label) => (dir, dirLabel) => (o) => add(Object.assign({ topic: id, topicLabel: label, dir, dirLabel }, o));

  // 1. Link in the export editor
  {
    const t = topic('link', '1 · Link in the export editor');
    const a = t('a', 'a · A guest sees Link greyed');
    a({ id: 'link-a-guest', label: 'Guest', page: 'export', link: 'grey', note: 'Link is the third option of the format toggle (after HTML replay and Plain text, letter L), greyed for a guest. Pointing at it (desktop) or pressing it / L says “Log in to share” in the editor’s flash line.' });
    a({ id: 'link-a-in', label: 'Logged in, Link chosen', page: 'export', link: 'on', note: 'Logged in: Link chosen. The file row says Title (a link has no file name or extension); Export opens the share dialog.' });
    const b = t('b', 'b · Link hidden for a guest, a line under the toggle');
    b({ id: 'link-b-guest', label: 'Guest', page: 'export', link: 'hidden', note: 'A guest sees only HTML replay and Plain text, and under the toggle a quiet line: “Log in to share a run as a link.”' });
    b({ id: 'link-b-in', label: 'Logged in, Link chosen', page: 'export', link: 'on', note: 'Logged in: as a.' });
  }

  // 2. The share dialog
  {
    const t = topic('share', '2 · The share dialog');
    const a = t('a', 'a · The rules ticked inside the dialog');
    a({ id: 'share-a-form', label: 'First time (rules)', page: 'export', link: 'on', share: { k: 'form', rules: 'in' }, note: 'The first Create link of an account: the form with the rules in a well under it and a tick; Create link waits for the tick. The title is filled from the character and date (or the doc’s title when it has one).' });
    a({ id: 'share-a-again', label: 'Form (rules ticked before)', page: 'export', link: 'on', share: { k: 'form', typed: true }, note: 'Every later time: the form alone. Title and description as the player typed them; the size against 5 MB; the line that anyone with the link can watch it.' });
    a({ id: 'share-a-up', label: 'Uploading', page: 'export', link: 'on', share: { k: 'up' }, note: 'Create link pressed: stage 24’s bar in the dialog, the fields locked, Cancel still there.' });
    a({ id: 'share-a-done', label: 'The link', page: 'export', link: 'on', share: { k: 'done' }, note: 'The result: the link in a field of its own (selectable) with Copy, and where it can be found again. Done closes the dialog; the doc keeps no link.' });
    a({ id: 'share-a-big', label: 'Too large', page: 'export', link: 'on', share: { k: 'big' }, note: 'The payload is built before Create link, so the size is known in the form: 6.3 of 5 MB, the button off, and what to do.' });
    a({ id: 'share-a-quota', label: '150 reached', page: 'export', link: 'on', share: { k: 'quota' }, note: 'The server’s 413 pub_quota (or the account’s count known beforehand): the form’s error line and a way to the Account page.' });
    a({ id: 'share-a-offline', label: 'Offline', page: 'export', link: 'on', share: { k: 'offline' }, note: 'No network when Create link is pressed: the error line; the form stays filled, Create link can be pressed again.' });
    const b = t('b', 'b · The rules as a step before the form');
    b({ id: 'share-b-rules', label: 'First time: the rules', page: 'export', link: 'on', share: { k: 'rules' }, note: 'The first Export with Link opens the rules as a dialog of their own: the five lines, the tick, Continue. Once ticked (stored on the account) the form comes straight away.' });
    b({ id: 'share-b-form', label: 'Then the form', page: 'export', link: 'on', share: { k: 'form', typed: true }, note: 'The form, without the rules. Uploading, the link and the refusals are as in a.' });
    b({ id: 'share-b-done', label: 'The link', page: 'export', link: 'on', share: { k: 'done' }, note: 'As in a.' });
  }

  // 3. The watch page
  {
    const t = topic('watch', '3 · The watch page');
    const lst = (d) => [
      ['loading', 'Loading', 'The meta comes first (GET /api/pub/<id>), then the payload: the details are there while stage 24’s bar fills the frame.'],
      ['playing', 'Playing', d === 'a' ? 'A band over the frame: the title, then the character and level, length, date, views and sender, the description in one line (the rest in a tooltip); Report, Download as HTML and Back on the right. The replay fills the rest, exactly as the HTML file looks.' : 'The frame first, the whole width; under it a strip with the title, details and the description, and the three actions.'],
      ['owner', 'Hidden, its owner', 'A hidden run still opens for its sender, with a note saying why and that nobody else can watch it.'],
      ['removed', 'Removed', 'GET /api/pub/<id> answers 410: no frame, a small box with the words and Back.'],
      ['hidden', 'Hidden', '451: hidden after reports or by the admin.'],
      ['unknown', 'Unknown id', '404 (an id that never was, or not of the pattern).'],
      ['notyet', 'Flag off', 'The flag share is off: every link says the same, nothing is asked of the server but /api/config.'],
    ];
    for (const d of ['a', 'b']) {
      const x = t(d, d === 'a' ? 'a · A band over the frame' : 'b · The frame first, a strip under it');
      for (const [k, label, note] of lst(d)) x({ id: `watch-${d}-${k}`, label, page: 'watch', watch: { v: d, k }, note });
    }
  }

  // 4. Published runs on the Account page
  {
    const t = topic('pub', '4 · Published runs');
    const a = t('a', 'a · A section on the Account page');
    a({ id: 'pub-a-list', label: 'The list', page: 'account', pub: { v: 'a', k: 'list' }, note: 'A section after Sync: each run on two lines (title and figures; the link with Copy, Edit and Remove). The hidden run says so in the warning colour. The count against 150 and the bytes under the list.' });
    a({ id: 'pub-a-edit', label: 'Edit', page: 'account', pub: { v: 'a', k: 'edit' }, note: 'Edit: the title and the description in the kit’s dialog. The cut cannot change.' });
    a({ id: 'pub-a-remove', label: 'Remove', page: 'account', pub: { v: 'a', k: 'remove' }, note: 'Remove asks first, and says what the link will say afterwards.' });
    a({ id: 'pub-a-empty', label: 'Empty', page: 'account', pub: { v: 'a', k: 'empty' }, note: 'No published runs: one line saying where they are made.' });
    const b = t('b', 'b · A view of its own behind a row');
    b({ id: 'pub-b-row', label: 'The row on the Account page', page: 'account', pub: { v: 'b', k: 'row' }, note: 'The Account page gets one row: the count, the views, a hidden run named, and Published runs (U) to open the view.' });
    b({ id: 'pub-b-list', label: 'The view', page: 'account', pub: { v: 'b', k: 'list' }, note: 'A view of its own (Back to the Account page): the same rows with room for the description.' });
    b({ id: 'pub-b-edit', label: 'Edit', page: 'account', pub: { v: 'b', k: 'edit' }, note: 'As in a, over the view.' });
    b({ id: 'pub-b-remove', label: 'Remove', page: 'account', pub: { v: 'b', k: 'remove' }, note: 'As in a, over the view.' });
    b({ id: 'pub-b-empty', label: 'Empty', page: 'account', pub: { v: 'b', k: 'empty' }, note: 'The row says “None yet”; the view is not opened.' });
  }

  // 5. Report
  {
    const t = topic('report', '5 · Report');
    const a = t('a', 'The dialog on the watch page');
    a({ id: 'report-form', label: 'The dialog', page: 'watch', watch: { v: 'a', k: 'playing' }, report: 'form', note: 'Report (R) on the watch page, logged in: the four reasons as a list (one is chosen; the arrows walk it), an optional text of at most 500 characters, Send report. The replay pauses under it.' });
    a({ id: 'report-thanks', label: 'Thanks', page: 'watch', watch: { v: 'a', k: 'playing' }, report: 'thanks', note: 'Sent: the thanks, and what happens next. Close.' });
    a({ id: 'report-already', label: 'Already reported', page: 'watch', watch: { v: 'a', k: 'playing' }, report: 'already', note: 'The server’s 409 already_reported (or known from before): one line, Close.' });
    a({ id: 'report-guest', label: 'Logged out', page: 'watch', watch: { v: 'a', k: 'playing', guest: true }, report: 'guest', note: 'A guest presses Report: log in to report, or write to the abuse address (people without an account). Log in goes to the start page’s Account (and back here after).' });
  }

  // 6. Admin
  {
    const t = topic('admin', '6 · The admin’s report queue');
    const a = t('a', 'The admin page, plain tool look');
    a({ id: 'admin-queue', label: 'The queue', page: 'admin', admin: 'queue', views: ['d'], note: 'Reports first: open reports grouped by item, the most reported first; per item the title, sender and character, reasons with counts, the reporters, the newest text, Watch, and the actions. Then the totals and the newest admin_log rows; the stage 59 sections follow as today.' });
    a({ id: 'admin-confirm', label: 'Confirm Delete', page: 'admin', admin: 'confirm', views: ['d'], note: 'Every action asks first in a plain modal: what goes, and that the reports are marked handled. Delete (run or account) wants the item’s id or the account’s name typed.' });
    a({ id: 'admin-empty', label: 'Nothing open', page: 'admin', admin: 'empty', views: ['d'], note: 'No open reports: one line; the totals and the log as always.' });
  }

  window.MK_STATES = S.map((s) => ({ id: s.id, topic: s.topic, topicLabel: s.topicLabel, dir: s.dir, dirLabel: s.dirLabel, label: s.label, note: s.note, page: s.page, views: s.views, noshot: !!s.noshot }));
  if (!window.MK) return;

  // ------------------------------------------------------------------ apply
  const st = S.find((s) => s.id === MK.state) || S[0];
  const app = document.getElementById('app');
  const root = document.documentElement;
  root.classList.add('mk-' + view, touch ? 'mk-touch' : 'mk-mouse', 'mk-st-' + st.topic);

  // ------------------------------------------------------------ the kit's parts
  const U = (label, letter) => {
    if (!letter) return label;
    const i = label.toLowerCase().indexOf(letter.toLowerCase());
    return i < 0 ? label : label.slice(0, i) + `<u class="wc-sk">${label[i]}</u>` + label.slice(i + 1);
  };
  /** A GlassButton as the kit renders it. */
  const btn = (id, label, letter, o = {}) =>
    `<button type="button" class="wc-lk-btn${o.small ? ' is-small' : ''}${o.primary ? ' is-primary' : ''}${o.danger ? ' is-danger' : ''}${o.off ? ' is-disabled' : ''}" data-btn="${id}" tabindex="-1"${o.off ? ' aria-disabled="true"' : ''}>${o.icon || ''}<span>${U(label, letter)}</span></button>`;
  /** A Field / TextArea as the kit renders it. */
  const field = (o) =>
    `<label class="wc-lk-field${o.area ? ' is-area' : ''}${o.mono ? ' is-mono' : ''}${o.bad ? ' is-bad' : ''}" data-field="${o.id}"><span class="wc-lk-lbl">${o.label}</span>` +
    (o.area
      ? `<textarea class="wc-lk-input" rows="${o.rows || 3}" placeholder="${esc(o.ph || '')}"${o.off ? ' disabled' : ''}>${esc(o.value || '')}</textarea>`
      : `<input class="wc-lk-input" type="text" value="${esc(o.value || '')}" placeholder="${esc(o.ph || '')}"${o.off ? ' disabled' : ''}${o.readonly ? ' readonly' : ''}>`) +
    (o.hint ? `<span class="wc-lk-fhint">${o.hint}</span>` : '') +
    '</label>';
  const check = (label, on, cls) =>
    `<button type="button" class="wc-lk-check${on ? ' is-on' : ''} ${cls || ''}" role="checkbox" aria-checked="${on}" tabindex="-1"><span class="wc-lk-cbox" aria-hidden="true"></span><span class="wc-lk-clabel">${label}</span></button>`;
  const load = (frac, line) => `<div class="mk-load"><div class="mk-load-bar"><i style="transform: scaleX(${frac})"></i></div><div class="mk-load-l">${line}</div></div>`;
  const corners = '<i class="wc-lk-br wc-lk-b1"></i><i class="wc-lk-br wc-lk-b2"></i><i class="wc-lk-br wc-lk-b3"></i><i class="wc-lk-br wc-lk-b4"></i>';

  /** A dialog in the kit's markup (look-overlay.css), an overlay frame after `under`, centred over `box` (or the whole screen). */
  function dialog(under, box, o) {
    const r = box ? box.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    const html =
      `<div class="wc-frame" data-frame="9" data-overlay="" style="--wc-ov-l: ${r.left}px; --wc-ov-t: ${r.top}px; --wc-ov-w: ${r.width}px; --wc-ov-h: ${r.height}px;">` +
      `<div class="wc-lk-veil"><div class="wc-lk-dslot"><section class="wc-lk-dialog ${o.cls || ''}" data-dlg="${o.dlg}" role="dialog" aria-modal="true" aria-label="${o.title}" style="width: min(${o.width}px, 100%);">${corners}` +
      `<div class="wc-lk-hood"><span class="wc-lk-hood-t">${o.title}</span></div><div class="wc-lk-dwin"><div class="wc-lk-dialog-b">${o.body}</div>` +
      (o.err ? `<p class="wc-lk-dialog-err">${o.err}</p>` : '') +
      `<div class="wc-lk-btns wc-lk-dialog-btns">${o.buttons.join('')}</div></div></section></div></div></div>`;
    under.insertAdjacentHTML('afterend', html);
  }

  // ------------------------------------------------------------ the start page (export, account)
  const start = app.querySelector('.wc-start');
  let topFrame = null;
  if (start) {
    start.querySelector('.wc-start-skyhost').style.background = `#1b2340 url(${MK.sky}) center / cover no-repeat`;
    const okb = app.querySelector('.wc-okb-page');
    if (okb) okb.remove();
    app.style.removeProperty('--wc-okb-page-h');
    const frames = [...app.querySelectorAll('.wc-frame')];
    topFrame = frames.filter((f) => !f.hasAttribute('hidden') && !f.hasAttribute('data-overlay')).pop();
    const brand = start.querySelector('.wc-start-brand');
    const putBrand = () => brand && start.style.setProperty('--wc-brand-h', brand.offsetHeight + 'px');
    putBrand();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(putBrand);
  }
  const bigBox = () => topFrame.querySelector('.wc-lk-box');

  // ------------------------------------------------------------ 1. Link in the export editor
  if (st.link) {
    const exp = topFrame.querySelector('.wc-exp');
    const seg = exp.querySelector('.wc-exp-outs .wc-lk-seg');
    const html = seg.querySelector('[data-opt="HTML"]');
    const link = `<button type="button" class="wc-lk-opt${st.link === 'on' ? ' is-on' : ''}${st.link === 'grey' ? ' is-disabled' : ''}" role="radio" aria-checked="${st.link === 'on'}" aria-keyshortcuts="L" data-opt="LINK" tabindex="-1"${st.link === 'grey' ? ' aria-disabled="true"' : ''}>${LINK()}<span><u class="wc-sk">L</u>ink</span></button>`;
    if (st.link !== 'hidden') seg.insertAdjacentHTML('beforeend', link);
    if (st.link === 'on') {
      html.classList.remove('is-on');
      html.setAttribute('aria-checked', 'false');
      exp.dataset.format = 'link';
      exp.querySelector('.wc-exp-flabel').textContent = 'Title';
      exp.querySelector('.wc-exp-title').textContent = T.title0;
      exp.querySelector('.wc-exp-fn em').remove();
    }
    const flash = exp.querySelector('.wc-exp-flash');
    if (st.link === 'grey') {
      if (touch) flash.innerHTML = '<span>Log in to share. Account is on the start page.</span>';
      else {
        // The hover tip over the greyed option (the flash says the same when L is pressed).
        const opt = seg.querySelector('[data-opt="LINK"]');
        const host = exp;
        host.style.position = 'relative';
        const orr = opt.getBoundingClientRect();
        const hr = host.getBoundingClientRect();
        host.insertAdjacentHTML('beforeend', `<span class="mk-tip is-up" role="tooltip" style="left:${orr.left - hr.left + orr.width / 2}px;top:${orr.top - hr.top - 8}px">Log in to share</span>`);
      }
    }
    if (st.link === 'hidden') {
      const outs = exp.querySelector('.wc-exp-outs');
      outs.insertAdjacentHTML('afterend', `<p class="mk-guest-line">${LINK('mk-faint')}Log in to share a run as a link.</p>`);
      exp.querySelector('.wc-exp-row2').classList.add('mk-has-line');
    }
  }

  // ------------------------------------------------------------ 2. The share dialog
  if (st.share) {
    const k = st.share.k;
    const under = topFrame;
    const box = bigBox();
    if (k === 'rules') {
      dialog(under, box, {
        dlg: 'share-rules',
        title: 'Before you share',
        width: 500,
        cls: 'mk-share',
        body:
          `<p class="wc-lk-q">A shared run is shown to strangers.</p>` +
          `<ul class="mk-rules">${RULES.map((r) => `<li>${r}</li>`).join('')}</ul>` +
          `<div class="mk-tick">${check('I have read this and agree', false)}</div>` +
          `<p class="wc-lk-qn mk-once">Asked once for your account.</p>`,
        buttons: [btn('CANCEL', 'Cancel', 'C'), btn('CONTINUE', 'Continue', 'O', { primary: true, off: true })],
      });
    } else if (k === 'done') {
      dialog(under, box, {
        dlg: 'share',
        title: 'Link created',
        width: 540,
        cls: 'mk-share',
        body:
          `<p class="wc-lk-q">${T.title}</p>` +
          `<div class="mk-linkrow">${field({ id: 'link', label: 'The link', value: T.linkUrl, mono: true, readonly: true })}${btn('COPY', 'Copy', 'C', { icon: COPY(), primary: true })}</div>` +
          `<p class="mk-copied">Copied.</p>` +
          `<p class="wc-lk-qn">${T.anyone} You find it again, and can remove it, on the Account page under Published runs.</p>`,
        buttons: [btn('DONE', 'Done', 'D')],
      });
    } else {
      const typed = st.share.typed || ['up', 'big', 'quota', 'offline'].includes(k);
      const locked = k === 'up';
      const big = k === 'big';
      const sizeLine = big
        ? `<p class="mk-size is-over">${ic('save')}<span><b>6.3 MB</b> of 5 MB</span></p>`
        : `<p class="mk-size">${ic('save')}<span><b>${T.size}</b> of 5 MB</span><span class="mk-sizebar"><i style="width:24%"></i></span></p>`;
      const rules =
        st.share.rules === 'in'
          ? `<div class="mk-rulesbox"><p class="mk-rules-h">The rules, once for your account</p><ul class="mk-rules">${RULES.map((r) => `<li>${r}</li>`).join('')}</ul>${check('I have read this and agree', false)}</div>`
          : '';
      const errs = {
        big: 'Too large: a link holds at most 5 MB. Exclude more of the log and try again.',
        quota: 'You have 150 published runs, the most an account can hold. Remove one on the Account page first.',
        offline: 'Offline: the link could not be made. Try again when you are online.',
      };
      dialog(under, box, {
        dlg: 'share',
        title: 'Share as a link',
        width: 540,
        cls: 'mk-share' + (locked ? ' is-locked' : ''),
        body:
          field({ id: 'title', label: 'Title', value: typed ? T.title : T.title0, off: locked, hint: typed ? '' : 'From the character and date; yours to change.' }) +
          field({ id: 'desc', label: 'Description', area: true, rows: touch ? 3 : 3, value: typed ? T.desc : '', ph: 'Optional: what happens, who is in it', off: locked, hint: `<span class="mk-count-r">${typed ? T.desc.length : 0} / 500</span>` }) +
          sizeLine +
          `<p class="mk-anyone">${LINK()}<span>${T.anyone}</span></p>` +
          rules +
          (locked ? load(0.58, 'Uploading… 0.7 of 1.2 MB') : ''),
        err: errs[k],
        buttons: [
          btn('CANCEL', 'Cancel', 'C'),
          k === 'quota'
            ? btn('ACCOUNT', 'Open Account', 'A')
            : '',
          btn('CREATE', locked ? 'Creating…' : k === 'offline' ? 'Try again' : 'Create link', locked ? '' : k === 'offline' ? 'T' : 'L', { primary: true, icon: LINK(), off: locked || big || k === 'quota' || st.share.rules === 'in' }),
        ],
      });
    }
  }

  // ------------------------------------------------------------ 4. Published runs
  if (st.pub) {
    const p = st.pub;
    const form = topFrame.querySelector('.wc-ac-acct');
    const syncBox = form.querySelector('.wc-ac-sync');
    const rule = (id, title) => `<div class="wc-lk-rule" data-rule="${id}"><h3 class="wc-lk-sec">${title}</h3><i class="wc-lk-hair" aria-hidden="true"></i></div>`;
    const row = (r, wide) =>
      `<li class="wc-lk-row mk-pub${r.hidden ? ' is-hidden' : ''}" data-pub="${r.id}">` +
      `<div class="mk-pub-l1"><span class="mk-pub-t">${r.title}</span><span class="mk-pub-fig">${r.views} ${r.views === 1 ? 'view' : 'views'} · ${r.date} · ${r.size} · link only</span></div>` +
      (wide && !r.hidden ? `<div class="mk-pub-d">${r.id === PUBS[0].id ? T.desc : r.id === PUBS[1].id ? 'Carn Dûm with the whole warband; the lieutenant falls at 2:31:05.' : ''}</div>` : '') +
      (r.hidden ? `<div class="mk-pub-hid">${FLAG()}<span>Hidden after reports. Only you can watch it until we have looked.</span></div>` : '') +
      `<div class="mk-pub-l2"><span class="mk-pub-url" title="https://mumecockpit.com/r/${r.id}">/r/${r.id}</span>${btn('COPY', 'Copy', '', { small: true, icon: COPY() })}<span class="mk-pub-sp"></span>${btn('EDIT', 'Edit', '', { small: true, icon: ic('pencil') })}${btn('REMOVE', 'Remove', '', { small: true, danger: true, icon: ic('trash') })}</div>` +
      '</li>';
    const list = (wide) =>
      `<ul class="wc-lk-rows is-flat mk-pubs${wide ? ' is-wide' : ''}" aria-label="Published runs">${PUBS.map((r) => row(r, wide)).join('')}</ul>` +
      `<p class="wc-ac-small">4 of 150 · 6.1 MB · links do not count against your 50 MB.</p>`;
    const empty = `<p class="wc-ac-small mk-pub-empty">No published runs yet. In History, Export a session and choose <b>Link</b>.</p>`;

    let dlgBox = bigBox();
    if (p.v === 'a') {
      syncBox.insertAdjacentHTML('afterend', rule('published', 'Published runs') + (p.k === 'empty' ? empty : list(false)));
    } else if (p.k === 'row' || p.k === 'empty') {
      const none = p.k === 'empty';
      syncBox.insertAdjacentHTML(
        'afterend',
        rule('published', 'Published runs') +
          `<div class="mk-pubrow"><span class="mk-pubrow-w">${none ? '<b>None yet.</b> Export a session and choose Link.' : `<b>4 runs</b> · 175 views · <span class="mk-warn">1 hidden after reports</span>`}</span>${none ? '' : btn('PUBLISHED', 'Published runs', 'u', { small: true, icon: LINK() })}</div>`,
      );
    } else {
      // The view of its own: the Account page's box, its own title and body.
      const sec = topFrame.querySelector('.wc-ac-account');
      sec.setAttribute('aria-label', 'Published runs');
      sec.querySelector('.wc-lk-hood-t').textContent = 'Published runs';
      sec.classList.add('mk-pubview');
      form.innerHTML = `<div class="wc-ac-head"><span class="wc-ac-head-name">Published runs</span><span class="wc-ac-head-since">fenwick · 4 of 150 · 6.1 MB, not counted against your 50 MB</span></div>` + `<ul class="wc-lk-rows is-flat mk-pubs is-wide" aria-label="Published runs">${PUBS.map((r) => row(r, true)).join('')}</ul>`;
    }
    if (p.k === 'edit') {
      dialog(topFrame, dlgBox, {
        dlg: 'pub-edit',
        title: 'Edit',
        width: 520,
        cls: 'mk-share',
        body:
          field({ id: 'title', label: 'Title', value: T.title }) +
          field({ id: 'desc', label: 'Description', area: true, rows: 3, value: T.desc, hint: `<span class="mk-count-r">${T.desc.length} / 500</span>` }) +
          `<p class="wc-lk-qn mk-left">The run itself stays as it was cut. ${T.linkShort}</p>`,
        buttons: [btn('CANCEL', 'Cancel', 'C'), btn('SAVE', 'Save', 'S', { primary: true })],
      });
    }
    if (p.k === 'remove') {
      dialog(topFrame, dlgBox, {
        dlg: 'pub-remove',
        title: 'Remove',
        width: 480,
        body: `<p class="wc-lk-q">Remove “${T.title}”?</p><p class="wc-lk-qn">The link stops working; whoever opens it is told that the run was removed by its sender. This cannot be undone.</p>`,
        buttons: [btn('CANCEL', 'Cancel', 'C', { primary: true }), btn('REMOVE', 'Remove', 'R', { danger: true })],
      });
    }
  }

  // ------------------------------------------------------------ 3. The watch page
  if (st.page === 'watch') {
    const w = st.watch;
    const err = { removed: 1, hidden: 1, unknown: 1, notyet: 1 }[w.k];
    const meta = `<span class="mk-w-char">${T.char}</span> <span class="mk-w-lv">Level ${T.level}</span><i>·</i>${T.length}<i>·</i>${T.date}<i>·</i>${T.views}<i>·</i><span class="mk-w-by">shared by <b>${T.sender}</b></span>`;
    const acts =
      btn('REPORT', touch ? 'Report' : 'Report', 'R', { small: true, icon: FLAG() }) +
      btn('DOWNLOAD', touch ? 'Download' : 'Download as HTML', 'D', { small: true, icon: DOWN() }) +
      btn('BACK', 'Back', 'B', { small: true, icon: ic('back') });
    const fr = (MK.replay || {})[w.v];
    const frameIn =
      w.k === 'loading'
        ? `<div class="mk-w-wait">${load(0.33, 'Loading the run… 0.4 of 1.2 MB')}</div>`
        : `<img class="mk-w-img" alt="" src="${fr}">`;
    // The owner's note takes the description's line (a) or the details' line (b), so the frame keeps its size.
    const owner = w.k === 'owner' ? `<p class="mk-w-note">${FLAG()}<span><b>Hidden after reports.</b> Only you can watch it until we have looked; nothing is needed from you.</span></p>` : '';
    let page;
    if (err) {
      const words = {
        removed: ['This run was removed by its sender.', 'The link no longer leads anywhere.'],
        hidden: ['This run is hidden.', 'It was hidden after reports and waits for a look.'],
        unknown: ['There is no run at this link.', 'Check the address, or ask whoever sent it.'],
        notyet: ['This link does not work yet.', 'Shared runs open soon. Until then the link leads nowhere.'],
      }[w.k];
      page =
        `<div class="mk-w-page is-err"><section class="wc-lk-dialog mk-w-errbox" aria-label="Shared run">${corners}<div class="wc-lk-hood"><span class="wc-lk-hood-t">Shared run</span></div>` +
        `<div class="wc-lk-dwin"><div class="wc-lk-dialog-b"><p class="wc-lk-q">${words[0]}</p><p class="wc-lk-qn">${words[1]}</p></div><div class="wc-lk-btns wc-lk-dialog-btns">${btn('BACK', 'Back to MUME Cockpit', 'B', { primary: true, icon: ic('back') })}</div></div></section></div>`;
    } else if (w.v === 'a') {
      page =
        `<div class="mk-w-page is-a"><header class="mk-w-band"><div class="mk-w-id"><h1 class="mk-w-title">${T.title}</h1><p class="mk-w-meta">${meta}</p>` +
        (owner || `<p class="mk-w-desc" title="${esc(T.desc)}">${T.desc}</p>`) + `</div><div class="mk-w-acts">${acts}</div></header><div class="mk-w-frame">${frameIn}</div></div>`;
    } else {
      page =
        `<div class="mk-w-page is-b"><div class="mk-w-frame">${frameIn}</div><footer class="mk-w-strip"><div class="mk-w-id"><h1 class="mk-w-title">${T.title}</h1>` +
        (owner || `<p class="mk-w-meta">${meta}</p><p class="mk-w-desc">${T.desc}</p>`) + `</div><div class="mk-w-acts">${acts}</div></footer></div>`;
    }
    app.innerHTML = `<div class="wc-chrome wc-look mk-watch"><div class="wc-stack"><div class="wc-frame" data-frame="1">${page}</div></div></div>`;
    const under = app.querySelector('.wc-frame');

    // 5. Report
    if (st.report === 'form') {
      dialog(under, null, {
        dlg: 'report',
        title: 'Report this run',
        width: 500,
        cls: 'mk-share mk-report',
        body:
          `<p class="wc-lk-qn mk-left">What is wrong with “${T.title}”?</p>` +
          `<div class="mk-reasons" role="radiogroup" aria-label="Reason">${REASONS.map((r, i) => check(r, i === 1, 'mk-radio' + (i === 1 ? ' is-cur' : ''))).join('')}</div>` +
          field({ id: 'text', label: 'More (optional)', area: true, rows: 3, value: 'His real name and town are in the narrates around 38:10.', hint: '<span class="mk-count-r">55 / 500</span>' }) +
          `<p class="wc-lk-qn mk-left mk-small">The sender is not told who reported.</p>`,
        buttons: [btn('CANCEL', 'Cancel', 'C'), btn('SEND', 'Send report', 'S', { primary: true, icon: FLAG() })],
      });
    } else if (st.report === 'thanks') {
      dialog(under, null, {
        dlg: 'report',
        title: 'Report sent',
        width: 460,
        body: `<p class="wc-lk-q">Thank you.</p><p class="wc-lk-qn">We look at every report. A run that breaks the rules is removed; one that many report is hidden until then.</p>`,
        buttons: [btn('CLOSE', 'Close', 'C', { primary: true })],
      });
    } else if (st.report === 'already') {
      dialog(under, null, {
        dlg: 'report',
        title: 'Report this run',
        width: 440,
        body: `<p class="wc-lk-q">You have already reported this run.</p><p class="wc-lk-qn">One report per run is enough; it is in the queue.</p>`,
        buttons: [btn('CLOSE', 'Close', 'C', { primary: true })],
      });
    } else if (st.report === 'guest') {
      dialog(under, null, {
        dlg: 'report',
        title: 'Report this run',
        width: 480,
        body: `<p class="wc-lk-q">Log in to report.</p><p class="wc-lk-qn">Reports come from accounts, one per run. Without an account, write to <a class="mk-mail" href="mailto:${T.abuse}">${T.abuse}</a> with the link.</p>`,
        buttons: [btn('CLOSE', 'Close', 'C'), btn('LOGIN', 'Log in', 'L', { primary: true, icon: ic('person') })],
      });
    }
  }

  // ------------------------------------------------------------ 6. Admin
  if (st.page === 'admin') {
    const A = st.admin;
    const items =
      A === 'empty'
        ? []
        : [
            {
              title: 'Trollshaws hoard run',
              id: 'Zp6Wd3Fg5uNa',
              sender: 'fenwick',
              char: 'Rasta (L28)',
              state: 'hidden after 5 reports',
              reasons: [['Real-life information about someone', 3], ['Harassment', 2]],
              who: 'brego, elanor_s, hollin, quillon, tarnwise',
              newest: '“His real name and town are in the narrates around 38:10.” · 2 h ago',
              size: '1.9 MB · 21 views · 3 Nov',
            },
            {
              title: 'Orc raid on the Old Forest Road',
              id: 'Vt8Ky2Qa4mRc',
              sender: 'marrowfield',
              char: 'Ugluk (L33)',
              state: 'shown',
              reasons: [['Harassment', 2]],
              who: 'aldwyn, ferny_b',
              newest: '“The whole description mocks one player by name.” · 5 h ago',
              size: '0.8 MB · 64 views · 12 Nov',
            },
            {
              title: 'Ghost of Weathertop',
              id: 'Lc2Hn7Pw3eXo',
              sender: 'saelind',
              char: 'Saelind (L19)',
              state: 'shown',
              reasons: [['Other', 1]],
              who: 'brandagamba',
              newest: '“Copied from my own log without asking.” · yesterday',
              size: '0.5 MB · 9 views · 13 Nov',
            },
          ];
    const card = (it) =>
      `<article class="rq${it.state.startsWith('hidden') ? ' is-hidden' : ''}"><div class="rq-head"><h3>${it.title}</h3><span class="rq-state">${it.state}</span></div>` +
      `<p class="rq-who">by <b>${it.sender}</b> · ${it.char} · <code>${it.id}</code> · ${it.size}</p>` +
      `<p class="rq-reasons">${it.reasons.map(([r, n]) => `<span class="rq-r">${r} <b>${n}</b></span>`).join('')}</p>` +
      `<p class="rq-from muted">Reported by ${it.who}</p>` +
      `<p class="rq-text">${it.newest}</p>` +
      `<p class="rq-acts"><a href="#">Watch</a> ${it.state.startsWith('hidden') ? '<button>Restore</button>' : '<button>Hide</button>'} <button class="danger">Delete</button> <span class="sep"></span> <button>Dismiss reports</button> <button>Suspend ${it.sender}</button></p></article>`;
    const queue = items.length
      ? items.map(card).join('')
      : '<p class="muted">No open reports. The last one was handled 2026-11-15 14:02 UTC.</p>';
    const log = [
      ['2026-11-15 14:02', 'a3f9…c1', 'restore', 'run Kd5Ra8Tz2yBm', 'reports read; nothing wrong'],
      ['2026-11-15 09:41', 'a3f9…c1', 'delete', 'run Wf1Jx6Uv9cPq', 'a player’s address in the log'],
      ['2026-11-14 21:17', 'a3f9…c1', 'suspend', 'account grimbeorn', 'third harassment run'],
      ['2026-11-14 21:15', 'a3f9…c1', 'delete', 'run Bn3Sg7Hk4wLe', ''],
      ['2026-11-13 18:30', 'a3f9…c1', 'hide', 'run Pe9Dm2Cq6vTa', 'while I ask the sender'],
    ];
    app.innerHTML =
      `<header><h1>WebCockpit admin</h1><p id="status">Read 2026-11-15 16:40:12 UTC.</p></header><main class="mk-two">` +
      `<section class="mk-col1"><h2>Reports <span class="muted">${items.length ? '8 open on 3 runs' : 'none open'}</span></h2>${queue}</section>` +
      `<div class="mk-col2"><section><h2>Published runs</h2><dl class="figures"><div><dt>Runs</dt><dd>1,284</dd></div><div><dt>Stored</dt><dd>1.31 GB</dd></div><div><dt>New today</dt><dd>47</dd></div><div><dt>Hidden</dt><dd>1</dd></div><div><dt>Views today</dt><dd>2,906</dd></div></dl>` +
      `<p class="muted">R2 holds 10 GB free; published runs use 13 % of it. The largest: 4.8 MB.</p></section>` +
      `<section><h2>Admin log <span class="muted">the newest 5 of 100</span></h2><table class="log"><thead><tr><th>When (UTC)</th><th>Who</th><th>Action</th><th>Target</th><th>Note</th></tr></thead><tbody>${log.map((r) => `<tr>${r.map((c, i) => `<td${i === 1 ? ' class="mono"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></section></div>` +
      `<section class="mk-rest"><h2 class="muted">Online now · Today · Use today · The last 30 days · Devices · Flags</h2><p class="muted">As today (stage 59), under these.</p></section></main>` +
      (A === 'confirm'
        ? `<div class="modal-veil"><div class="modal" role="dialog" aria-modal="true"><h3>Delete “Trollshaws hoard run”?</h3><p>The run by <b>fenwick</b> (<code>Zp6Wd3Fg5uNa</code>, 1.9 MB) is deleted from R2 and its link says it was removed. Its 5 reports are marked handled and the action goes to the admin log.</p><label>Note for the log (optional)<input type="text" value="real name and town in the narrates"></label><label>Type the id to confirm<input type="text" value="Zp6Wd3Fg5uNa"></label><p class="modal-btns"><button>Cancel</button> <button class="danger solid">Delete run</button></p></div></div>`
        : '');
  }
})();
