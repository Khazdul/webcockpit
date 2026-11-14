// The mockups' states (stage 60). Runs in two places: in the review shell,
// where it only lists the states (window.MK_STATES), and inside the stage's
// document, where `window.MK` names the state to draw over the captured
// start page (build/skel). Throwaway: a simplified DOM in the real classes.
(function () {
  'use strict';

  const NAME = 'olev';
  const CODE = ['K7QM', '2XHD', '9FTP', 'WB4N', '6RCE', '3YJA'];

  // ---------------------------------------------------------------- helpers
  const MK = window.MK || { view: 'd', icons: {} };
  const phone = MK.view === 'p';
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const ic = (name) => (MK.icons && MK.icons[name]) || '';
  const KEY_ICON = '<svg class="wc-lk-ic" viewBox="0 0 18 18" aria-hidden="true"><circle cx="5.8" cy="12.2" r="3.3"></circle><path d="M8.2 9.8 15.6 2.4M12.4 5.6l2.2 2.2M14.4 3.6l1.6 1.6"></path></svg>';
  const BR = '<i class="wc-lk-br wc-lk-b1"></i><i class="wc-lk-br wc-lk-b2"></i><i class="wc-lk-br wc-lk-b3"></i><i class="wc-lk-br wc-lk-b4"></i>';

  /** A label with its key letter marked, as the kit's KeyLabel. No letter on a phone. */
  function kl(text, letter) {
    if (!letter || phone) return esc(text);
    const i = text.toLowerCase().indexOf(letter.toLowerCase());
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + '<u class="wc-sk">' + esc(text[i]) + '</u>' + esc(text.slice(i + 1));
  }

  /** A glass button. o: key, primary, danger, disabled, sel (the keyboard is on it), small, icon, go, cls, id. */
  function btn(label, o) {
    o = o || {};
    const cls = ['wc-lk-btn'];
    if (o.primary) cls.push('is-primary');
    if (o.danger) cls.push('is-danger');
    if (o.disabled) cls.push('is-disabled');
    if (o.sel) cls.push('is-sel');
    if (o.small) cls.push('is-small');
    if (o.cls) cls.push(o.cls);
    return (
      `<button type="button" class="${cls.join(' ')}" tabindex="-1"${o.go ? ` data-go="${o.go}"` : ''}${o.id ? ` id="${o.id}"` : ''}${o.disabled ? ' aria-disabled="true"' : ''}>` +
      (o.icon ? ic(o.icon) : '') +
      `<span>${kl(label, o.key)}</span></button>`
    );
  }

  /** A text field. o: value, type, placeholder, hint, err, ok, mono, focus, disabled, id, max. */
  function field(label, o) {
    o = o || {};
    const cls = ['wc-lk-field'];
    if (o.mono) cls.push('is-mono');
    if (o.err) cls.push('is-bad');
    if (o.cls) cls.push(o.cls);
    const under = o.err
      ? `<span class="wc-lk-ferr">${o.err}</span>`
      : o.ok
        ? `<span class="wc-lk-fhint mk-fok">${o.ok}</span>`
        : o.hint
          ? `<span class="wc-lk-fhint">${o.hint}</span>`
          : '';
    return (
      `<label class="${cls.join(' ')}"><span class="wc-lk-lbl">${esc(label)}</span>` +
      `<input class="wc-lk-input" type="${o.type || 'text'}" value="${esc(o.value || '')}" placeholder="${esc(o.placeholder || '')}" spellcheck="false" autocomplete="off" autocapitalize="off"` +
      `${o.max ? ` maxlength="${o.max}"` : ''}${o.focus ? ' data-focus' : ''}${o.disabled ? ' disabled' : ''}${o.id ? ` id="${o.id}"` : ''}${o.err ? ' aria-invalid="true"' : ''}>` +
      (o.after || '') +
      under +
      '</label>'
    );
  }

  const rule = (title, extra) => `<div class="wc-lk-rule"><h3 class="wc-lk-sec">${esc(title)}</h3><i class="wc-lk-hair" aria-hidden="true"></i>${extra || ''}</div>`;
  const link = (text, go) => `<a href="#" class="mk-link"${go ? ` data-go="${go}"` : ''}>${text}</a>`;
  const toggle = (label, on) =>
    `<button type="button" class="wc-lk-toggle${on ? ' is-on' : ''}" role="switch" aria-checked="${on}" tabindex="-1"><span class="wc-lk-groove" aria-hidden="true"><i class="wc-lk-knob"></i></span><span class="wc-lk-tstate" aria-hidden="true">${on ? 'On' : 'Off'}</span><span class="wc-lk-tlabel" aria-hidden="true">${label}</span></button>`;

  /** The sync state mark (a placeholder for stage 61's): ok | sync | off | warn. */
  const MARKS = { ok: 'in step', sync: 'syncing…', off: 'offline', warn: 'needs attention' };
  const mark = (m) => `<i class="mk-mark is-${m}" title="${MARKS[m]}" aria-label="${MARKS[m]}"></i>`;

  /** The Turnstile widget's box, 300 × 65 as Cloudflare draws it. */
  const turnstile = (done) =>
    `<div class="mk-turnstile${done ? ' is-done' : ''}" role="img" aria-label="Turnstile widget placeholder, 300 by 65"><i class="mk-ts-box"></i><span class="mk-ts-t">${done ? 'Success!' : 'Verify you are human'}</span><span class="mk-ts-b">Turnstile<br><small>300 × 65 placeholder</small></span></div>`;

  /** The calm "Working…" state while the key is derived. */
  const working = (text) =>
    `<div class="mk-work" role="status"><div class="mk-work-t">Working…</div><div class="mk-work-bar"><i></i></div><div class="mk-work-s">${text || (phone ? 'Making your key on this phone. This takes a few seconds.' : 'Making your key on this device. About a second.')}</div></div>`;

  /** A kit page's box. o: title, width, cls, back (state to go to), win (HTML). */
  function box(o) {
    return (
      `<section class="wc-lk-box wc-lk-box-normal mk-box ${o.cls || ''}" style="width:min(${o.width || 460}px,100%)" aria-label="${esc(o.title)}">${BR}` +
      `<div class="wc-lk-hood"><span class="wc-lk-hood-t">${esc(o.title)}</span></div>` +
      `<button type="button" class="wc-lk-back" tabindex="-1" aria-label="Back (Esc)" title="Back (Esc)" data-go="${o.back || 'a-out'}">${ic('back')}Back</button>` +
      `<div class="wc-lk-win mk-win">${o.scroll ? `<div class="wc-lk-bbody wc-lk-scroll mk-scrollbody">${o.win}</div>` : o.win}</div></section>`
    );
  }

  /** A kit dialog. o: title, width, body, btns. */
  function dialog(o) {
    return (
      `<section class="wc-lk-dialog mk-dialog" role="dialog" aria-modal="true" aria-label="${esc(o.title)}"${o.width ? ` style="width:min(${o.width}px,100%)"` : ''}>${BR}` +
      `<div class="wc-lk-hood"><span class="wc-lk-hood-t">${esc(o.title)}</span></div>` +
      `<div class="wc-lk-dwin"><div class="wc-lk-dialog-b">${o.body}</div><div class="wc-lk-btns wc-lk-dialog-btns">${o.btns}</div></div></section>`
    );
  }

  // ------------------------------------------------------- start page: entry
  /** Variant A: a menu row, between Spotlights and Credits. */
  function entryRow(who, m, sel) {
    const note = who ? `(${esc(who)})${m ? mark(m) : ''}` : '(log in)';
    return (
      `<li class="wc-sm-item mk-row-account${sel ? ' is-sel' : ''}" role="menuitem" data-key="account" aria-keyshortcuts="U" data-go="${who ? 'acct' : 'login-empty'}">` +
      KEY_ICON.replace('wc-lk-ic', 'wc-lk-ic wc-sm-ic') +
      `<span class="wc-sm-label">Acco<u class="wc-sk">u</u>nt</span><span class="wc-sm-note">${note}</span></li>`
    );
  }

  /** Variant B: a quiet line in a corner (bottom left on a desktop, top left on a phone). */
  function entryCorner(who, m) {
    const head = who ? esc(who) : phone ? 'Account' : 'Acco<u class="wc-sk">u</u>nt';
    const sub = who ? `${mark(m)}${MARKS[m]}${m === 'ok' ? '' : ''}` : 'not logged in · log in';
    return `<div class="mk-corner" role="link" tabindex="-1" data-go="${who ? 'acct' : 'login-empty'}" aria-keyshortcuts="U"><span class="mk-corner-d">${head}${who && !phone ? '<kbd class="mk-kbd">U</kbd>' : ''}</span><span class="mk-corner-m">${sub}</span></div>`;
  }

  /** Variant C: a strip at the foot of the Profiles page. */
  function entryStrip(who, m) {
    if (!who) {
      return `<div class="mk-strip"><span class="mk-strip-t">Profiles are kept in this browser only. With an account they follow you to your other devices.</span><span class="mk-strip-b">${btn('Log in', { key: 'l', small: true, go: 'login-empty' })}${btn('Create account', { key: 'c', small: true, go: 'create-empty' })}</span></div>`;
    }
    const txt = { ok: 'In step with your account.', sync: 'Syncing with your account…', off: 'Offline. Changes are kept here and sent later.', warn: 'Cloud storage full: new changes stay on this device.' }[m];
    return `<div class="mk-strip"><span class="mk-strip-t">${mark(m)}<b>${esc(who)}</b> · ${txt}</span><span class="mk-strip-b">${btn('Account', { key: 'u', small: true, go: 'acct' })}</span></div>`;
  }

  // ----------------------------------------------------------------- pages
  const lead = (t) => `<p class="wc-lk-lead mk-lead">${t}</p>`;
  const formErr = (t) => `<p class="mk-formerr" role="alert">${t}</p>`;

  function loginPage(s) {
    const dis = s === 'working' || s === 'locked';
    const filled = s !== 'empty';
    let mid = '';
    if (s === 'error') mid = formErr('Wrong user name or password.');
    if (s === 'turnstile') mid = formErr('Wrong user name or password.') + `<p class="mk-small">Three wrong tries. Show that you are a person, then try again.</p>` + turnstile(false);
    if (s === 'locked')
      mid = `<div class="mk-wait" role="alert"><div class="mk-wait-t">Too many wrong tries</div><div class="mk-wait-c" data-countdown="872">14:32</div><p class="mk-small">Nobody can log in to this name until the time is up, from any device. Nothing is wrong with the account.</p></div>`;
    const foot = s === 'working' ? working() : `<div class="wc-lk-btns mk-btns">${btn('Log in', { primary: true, disabled: s === 'locked' || s === 'empty', go: 'login-working' })}</div>`;
    return box({
      title: 'Log in',
      width: 440,
      cls: 'mk-login',
      win:
        field('User name', { value: filled ? NAME : '', mono: true, focus: s === 'empty', disabled: dis, placeholder: '' }) +
        field('Password', { value: filled ? (s === 'working' || s === 'locked' ? 'correct horse battery' : s === 'filled' ? 'correct horse battery' : '') : '', type: 'password', disabled: dis, focus: s === 'error' || s === 'turnstile' || s === 'filled' }) +
        mid +
        foot +
        `<div class="mk-links">${link('Create account', 'create-empty')}<i>·</i>${link('Forgot password', 'recover-empty')}</div>`,
    });
  }

  const POINTS = [
    ['What is stored', 'Your profiles, scripts, settings and saved runs, encrypted on this device before they are sent.'],
    ['What we can see', 'Your user name, when you were last here, and how much you store. Not the contents.'],
    ['What is never stored', 'Your MUME name and password.'],
    ['What is public', 'Your user name, if you publish a run or comment on one.'],
    ['No e-mail', 'So there is no “forgot password” mail. You get a recovery code next: keep it.'],
    ['Yours to delete', 'The account and everything in it, at any time.'],
  ];
  const points = () => `<ol class="mk-points">${POINTS.map(([h, t]) => `<li><b>${h}.</b> ${t}</li>`).join('')}</ol>`;

  function strength(n) {
    const words = ['', 'weak', 'fair', 'good', 'strong'];
    return `<span class="mk-strength is-${n}" aria-label="Strength: ${words[n]}"><i></i><i></i><i></i><i></i><em>${words[n]}</em></span>`;
  }

  function createForm(s) {
    const dis = s === 'working';
    const nameV = s === 'empty' ? '' : s === 'bad' ? 'Olev the Great' : NAME;
    const pwV = s === 'empty' ? '' : s === 'bad' ? 'hunter2' : 'correct horse battery';
    const pw2V = s === 'empty' ? '' : s === 'bad' ? 'hunter3' : 'correct horse battery';
    return (
      field('User name', {
        value: nameV,
        mono: true,
        max: 20,
        disabled: dis,
        focus: s === 'empty' || s === 'taken',
        hint: '3–20 of a–z 0–9 _ - · public · cannot be changed later',
        err: s === 'bad' ? 'Only a–z, 0–9, _ and -. No spaces or capitals.' : s === 'taken' ? `The name ${NAME} is taken. Try another.` : '',
      }) +
      field('Password', {
        value: pwV,
        type: 'password',
        disabled: dis,
        focus: s === 'filled',
        hint: 'At least 10 characters. Long beats odd: a few words do well.',
        ok: s === 'filled' || s === 'working' || s === 'taken' ? strength(4) + ' 21 characters' : '',
        err: s === 'bad' ? strength(1) + ' 7 characters: at least 10.' : '',
      }) +
      field('Password again', { value: pw2V, type: 'password', disabled: dis, err: s === 'bad' ? 'The two passwords differ.' : '' }) +
      `<p class="mk-warn"><b>Not your MUME password.</b> The account never needs it, and it should not be in two places.</p>`
    );
  }

  /** Create account, variant 1: everything on one page (two columns on a desktop). */
  function createPage(s) {
    const foot =
      s === 'working'
        ? working()
        : `<div class="mk-foot-l">${turnstile(s === 'filled' || s === 'taken')}</div><div class="mk-foot-r"><div class="wc-lk-btns mk-btns">${btn('Create account', { primary: true, disabled: s === 'empty' || s === 'bad', go: 'create-working' })}</div><div class="mk-alt">${link('I have an account: log in', 'login-empty')}</div></div>`;
    return box({
      title: 'Create account',
      width: 860,
      cls: 'mk-create',
      scroll: true,
      back: 'login-empty',
      win:
        `<div class="mk-cols"><div class="mk-col">${createForm(s)}</div>` +
        `<div class="mk-col mk-col-points">${rule('What happens to your data')}${points()}</div></div>` +
        `<div class="mk-create-foot${s === 'working' ? ' is-working' : ''}">${foot}</div>`,
    });
  }

  /** Create account, variant 2: two steps, the six points first. */
  function create2Page(step, s) {
    if (step === 1) {
      return box({
        title: 'Create account',
        width: 520,
        cls: 'mk-create2',
        back: 'login-empty',
        win:
          `<div class="mk-step">Step 1 of 2 · Before you start</div>` +
          points() +
          `<div class="wc-lk-btns mk-btns">${btn('Go on', { primary: true, sel: !phone, go: 'create2-form' })}</div>` +
          `<div class="mk-links">${link('I have an account: log in', 'login-empty')}</div>`,
      });
    }
    return box({
      title: 'Create account',
      width: 460,
      cls: 'mk-create2',
      back: 'create2-points',
      win:
        `<div class="mk-step">Step 2 of 2 · Name and password</div>` +
        createForm(s) +
        turnstile(s === 'filled') +
        `<div class="wc-lk-btns mk-btns">${btn('Create account', { primary: true, disabled: s === 'empty', go: 'code-shown' })}</div>`,
    });
  }

  function codeBlock() {
    return `<div class="wc-lk-well mk-code" aria-label="Recovery code">${CODE.map((g) => `<span>${g}</span>`).join('<i>-</i>')}</div>`;
  }

  function codePage(s, renew) {
    const done = s === 'confirmed';
    return box({
      title: 'Recovery code',
      width: 640,
      cls: 'mk-codepage',
      back: renew ? 'acct' : '',
      win:
        lead(renew ? `Your new recovery code. The old one has stopped working.` : `The account <b>${NAME}</b> is made. This is its recovery code.`) +
        codeBlock() +
        `<div class="wc-lk-btns mk-btns mk-code-btns">${btn('Copy', { icon: 'duplicate', key: 'c', id: 'mk-copy' })}${btn('Download as a text file', { icon: 'export', key: 'd' })}</div>` +
        `<div class="wc-lk-flash" role="status">${s === 'copied' ? '<span class="is-ok">Copied.</span>' : ''}</div>` +
        `<p class="mk-only"><b>This is the only way back</b> if you forget the password. We cannot reset it and cannot read your data: there is no e-mail and no back door.</p>` +
        `<p class="mk-small">It is shown this once. Keep it where you keep other keys: a password manager, or on paper. You can make a new one later on the Account page.</p>` +
        `<p class="mk-confirm-t">To show that you have kept it, type its last group.</p><div class="mk-confirm">` +
        field('Last group', { mono: true, max: 4, value: done ? CODE[5] : '', focus: !done, id: 'mk-last', placeholder: '····', cls: 'mk-last' }) +
        `<div class="wc-lk-btns">${btn('Continue', { primary: true, disabled: !done, sel: done && !phone, id: 'mk-continue', go: 'acct' })}</div></div>`,
    });
  }

  function recoverPage(s) {
    const dis = s === 'working';
    const filled = s !== 'empty';
    const foot =
      s === 'working'
        ? working(phone ? 'Making your new key on this phone. This takes a few seconds.' : 'Making your new key on this device. About a second.')
        : turnstile(s === 'filled') + `<div class="wc-lk-btns mk-btns">${btn('Set new password', { primary: true, disabled: s === 'empty', go: 'recover-working' })}</div>`;
    return box({
      title: 'Recovery',
      width: 480,
      cls: 'mk-recover',
      scroll: true,
      back: 'login-empty',
      win:
        lead('With your recovery code you set a new password. Your data stays as it is.') +
        field('User name', { value: filled ? NAME : '', mono: true, disabled: dis, focus: s === 'empty' }) +
        field('Recovery code', {
          value: filled ? (s === 'error' ? 'K7QM-2XHD-9FTP-WB4N-6RCE-3YJ4' : CODE.join('-')) : '',
          mono: true,
          disabled: dis,
          placeholder: 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX',
          hint: s === 'error' ? '' : 'Six groups of four. Dashes and capitals do not matter.',
          focus: s === 'error',
        }) +
        (s === 'error' ? formErr('Wrong user name or recovery code.') : '') +
        `<div class="mk-pair">` +
        field('New password', { value: filled ? 'a new long password' : '', type: 'password', disabled: dis, ok: filled ? strength(3) + ' 19 characters' : '', hint: 'At least 10 characters. Not your MUME password.' }) +
        field('New password again', { value: filled ? 'a new long password' : '', type: 'password', disabled: dis }) +
        `</div>` +
        foot +
        `<p class="mk-small mk-foot-note">Every device is logged out, this one logs in. The recovery code stays the same.</p>` +
        `<p class="mk-small mk-foot-note"><b>Lost the code too?</b> Then nobody can open the cloud copy, us included. What is on your devices is untouched: make a new account and it goes there.</p>`,
    });
  }

  // ---------------------------------------------------------- account page
  function bar(label, used, limit, unit, frac, full) {
    return (
      `<div class="mk-bar${full ? ' is-full' : ''}"><div class="mk-bar-h"><span>${label}</span><span class="mk-bar-n">${used} of ${limit} ${unit}</span></div>` +
      `<div class="mk-bar-g" role="img" aria-label="${used} of ${limit} ${unit}"><i style="width:${Math.max(frac * 100, 1.2)}%"></i></div></div>`
    );
  }

  function accountPage(s) {
    const full = s === 'full';
    const head =
      `<div class="mk-acct-head"><div class="mk-acct-id"><span class="mk-acct-name">${NAME}</span><span class="mk-acct-since">Account since 14 November 2026</span></div>` +
      `<div class="mk-acct-sync">${
        full ? `${mark('warn')}<span><b>Needs attention:</b> cloud storage full</span>` : `${mark('ok')}<span>In step · synced 2 minutes ago</span>`
      }${btn('Sync now', { key: 's', small: true, icon: 'reset' })}</div></div>`;
    const storage =
      rule('Storage') +
      bar('Profiles, scripts and settings', '0.1', '2', 'MB', 0.05) +
      (full ? bar('Saved runs', '50', '50', 'MB', 1, true) : bar('Saved runs', '12', '50', 'MB', 0.24)) +
      (full ? `<p class="mk-small mk-attn">New runs stay on this device until there is room. Delete old runs in History, or unpublish some.</p>` : '');
    const row = (cur, name, when, i) =>
      `<li class="wc-lk-row${cur ? ' is-on is-cur' : ''}" data-i="${i}"><span class="mk-dev-n">${name}</span>` +
      (i === 0 ? `<span class="mk-dev-this">this device</span>` : `<span class="wc-lk-dim wc-lk-mono mk-dev-t">${when}</span>${btn('End', { small: true, key: cur ? 'e' : '', go: 'd-end' })}`) +
      `</li>`;
    const devices =
      rule('Devices', btn('End all others', { small: true, key: 'o', go: 'd-endall' })) +
      `<ul class="wc-lk-rows is-flat mk-devs">${row(false, 'Firefox on Linux', '', 0)}${row(!phone, 'Safari on iPhone', '3 days ago', 1)}${row(false, 'Chrome on Windows', '5 weeks ago', 2)}</ul>`;
    const secure =
      rule('Password and recovery') +
      `<div class="wc-lk-btns mk-left">${btn('Change password', { key: 'p', icon: 'lock', go: 'd-password' })}${btn('New recovery code', { key: 'r', icon: 'reset', go: 'd-newcode' })}</div>` +
      `<p class="mk-small">Both ask for your password.</p>`;
    const notices = rule('Notices') + `<div class="mk-left">${toggle('Notices of new gallery runs', true)}</div>`;
    const data =
      rule('Your data on this device') +
      `<div class="mk-data"><div>${btn('Download everything', { key: 'd', icon: 'export' })}<p class="mk-small">Profiles, a scripts backup and a runs backup, as files.</p></div>` +
      `<div>${btn('Safety copy as files', { key: 'f', icon: 'backup' })}<p class="mk-small">What this device held before its first sync.</p></div></div>`;
    const leave =
      rule('Leaving') +
      `<div class="mk-leave">${btn('Log out', { key: 'l', go: 'd-logout' })}<span class="mk-leave-gap"></span>${btn('Delete account', { danger: true, small: true, go: 'd-delete' })}</div>`;
    return box({
      title: 'Account',
      width: 900,
      cls: 'mk-acct',
      back: 'a-in',
      win:
        head +
        `<div class="wc-lk-bbody wc-lk-scroll mk-acct-body"><div class="mk-cols"><div class="mk-col">${storage}${devices}</div><div class="mk-col">${secure}${notices}${data}${leave}</div></div></div>`,
    });
  }

  // --------------------------------------------------------------- dialogs
  const q = (t) => `<p class="wc-lk-q">${t}</p>`;
  const dtxt = (t) => `<p class="mk-dtxt">${t}</p>`;
  const radio = (on, head, text) => `<div class="mk-radio${on ? ' is-on' : ''}" role="radio" aria-checked="${on}"><i class="mk-radio-o"></i><div><b>${head}</b><span>${text}</span></div></div>`;

  const DIALOGS = {
    logout: (s) =>
      dialog({
        title: 'Log out',
        width: 500,
        body:
          q(`Log out of <b>${NAME}</b> on this device?`) +
          `<div class="mk-radios" role="radiogroup" aria-label="The data on this device">` +
          radio(s !== 'remove', kl('Keep the data on this device', 'k'), 'Your profiles, scripts and runs stay here and work as before. They stop following the account.') +
          radio(s === 'remove', kl('Remove it from this device', 'r'), 'Takes the account’s profiles, scripts, settings and runs out of this browser. The account keeps its copy.') +
          `</div>` +
          (s === 'remove' ? `<p class="mk-formerr">2 changes on this device are not synced yet. Removing now loses them.</p>` : ''),
        btns: btn('Cancel', { go: 'acct' }) + (s === 'remove' ? btn('Log out and remove', { danger: true, go: 'a-out' }) : btn('Log out', { primary: true, sel: !phone, go: 'a-out' })),
      }),
    delete: (s) =>
      dialog({
        title: 'Delete account',
        width: 520,
        body:
          q(`Delete the account <b>${NAME}</b>?`) +
          dtxt('This removes, at once and for good:') +
          `<ul class="mk-list"><li>everything stored in the account: profiles, scripts, settings and saved runs</li><li>the runs you have published, and your ratings and comments</li><li>the login on every device</li></ul>` +
          dtxt(`The name <b>${NAME}</b> is never given out again, to you or anyone. What is in this browser stays here.`) +
          field('Password', { type: 'password', value: s === 'ready' ? 'correct horse battery' : '', focus: s !== 'ready' }) +
          field(`Type the user name to confirm`, { mono: true, value: s === 'ready' ? NAME : '', placeholder: NAME }),
        btns: btn('Cancel', { sel: !phone && s !== 'ready', go: 'acct' }) + btn('Delete account', { danger: true, disabled: s !== 'ready', go: 'a-out' }),
      }),
    end: () =>
      dialog({
        title: 'End session',
        body: q('End the session on <b>Safari on iPhone</b>?') + dtxt('That device is logged out. The data on it stays there, and it can log in again with the password.'),
        btns: btn('Cancel', { go: 'acct' }) + btn('End', { primary: true, sel: !phone, go: 'acct' }),
      }),
    endall: () =>
      dialog({
        title: 'End all others',
        body: q('End the sessions on the 2 other devices?') + dtxt('Only this device stays logged in. Do this if a device is lost; then change the password.'),
        btns: btn('Cancel', { go: 'acct' }) + btn('End 2 sessions', { primary: true, sel: !phone, go: 'acct' }),
      }),
    password: (s) =>
      dialog({
        title: 'Change password',
        width: 460,
        body:
          field('Current password', { type: 'password', value: s === 'working' ? 'correct horse battery' : '', focus: s !== 'working', disabled: s === 'working' }) +
          field('New password', { type: 'password', value: s === 'working' ? 'a new long password' : '', disabled: s === 'working', hint: 'At least 10 characters. Not your MUME password.', ok: s === 'working' ? strength(3) + ' 19 characters' : '' }) +
          field('New password again', { type: 'password', value: s === 'working' ? 'a new long password' : '', disabled: s === 'working' }) +
          (s === 'working' ? working() : `<p class="mk-small">Your other devices are logged out. The recovery code stays the same.</p>`),
        btns: s === 'working' ? btn('Cancel', { disabled: true }) + btn('Change', { primary: true, disabled: true }) : btn('Cancel', { go: 'acct' }) + btn('Change', { primary: true, go: 'd-password-working' }),
      }),
    newcode: () =>
      dialog({
        title: 'New recovery code',
        width: 460,
        body:
          q('Make a new recovery code?') +
          dtxt('The old code stops working at once. The new one is shown once, as the first was.') +
          field('Password', { type: 'password', focus: true }),
        btns: btn('Cancel', { go: 'acct' }) + btn('Make new code', { primary: true, go: 'd-newcode-shown' }),
      }),
  };

  // ----------------------------------------------------------------- states
  // kind: main (the start menu) | page (a kit page) | dialog (over the Account page) | sheet (the phone's in-game menu).
  const S = [];
  const add = (group, groupLabel, id, label, note, o) => S.push(Object.assign({ group, groupLabel, id, label, note }, o));

  const A = 'A · a menu row';
  const A_NOTE =
    'A seventh row, <b>Account</b>, between Spotlights and Credits (your things above, the client’s below), with the free key letter <b>U</b>. It reads as the Profile row does: the name in brackets. The box grows by one row; nothing else moves but the quote under it.';
  add('entry-a', A, 'a-out', 'Logged out', A_NOTE + ' Flag off: the row is absent and the page is today’s.', { kind: 'main', row: [null] });
  add('entry-a', A, 'a-in', 'Logged in · in step', A_NOTE, { kind: 'main', row: [NAME, 'ok'] });
  add('entry-a', A, 'a-sync', 'Syncing', A_NOTE + ' The mark breathes slowly while a sync runs.', { kind: 'main', row: [NAME, 'sync'] });
  add('entry-a', A, 'a-off', 'Offline', A_NOTE, { kind: 'main', row: [NAME, 'off'] });
  add('entry-a', A, 'a-warn', 'Needs attention', A_NOTE + ' What needs attention is said on the Account page.', { kind: 'main', row: [NAME, 'warn'] });
  add('entry-a', A, 'a-sel', 'The row chosen', A_NOTE + ' Here with the cursor on it.', { kind: 'main', row: [NAME, 'ok'], sel: true });
  add('entry-a', A, 'a-sheet', 'Phone: in-game menu', 'Phone only, and a question: should the in-game menu sheet also carry an Account row? (The start page is one tap away through Exit session; the mockup shows what the row would cost.)', {
    kind: 'sheet',
    only: 'p',
  });

  const B = 'B · a quiet corner line';
  const B_NOTE =
    'No menu row. Two quiet lines in the corner opposite the almanac (bottom left on a desktop; top left on a phone, where the bottom is the almanac’s), in the almanac’s own type. The key <b>U</b> opens it; a click or tap does too. The menu and the quote are untouched.';
  add('entry-b', B, 'b-out', 'Logged out', B_NOTE + ' Flag off: nothing there.', { kind: 'main', corner: [null] });
  add('entry-b', B, 'b-in', 'Logged in · in step', B_NOTE, { kind: 'main', corner: [NAME, 'ok'] });
  add('entry-b', B, 'b-sync', 'Syncing', B_NOTE, { kind: 'main', corner: [NAME, 'sync'] });
  add('entry-b', B, 'b-off', 'Offline', B_NOTE, { kind: 'main', corner: [NAME, 'off'] });
  add('entry-b', B, 'b-warn', 'Needs attention', B_NOTE, { kind: 'main', corner: [NAME, 'warn'] });

  const C = 'C · inside Profiles';
  const C_NOTE = 'The start page is exactly today’s. The account lives at the foot of the Profiles page (P), where what it syncs is listed.';
  add('entry-c', C, 'c-start', 'Start page (unchanged)', C_NOTE + ' Nothing on the start page says whether you are logged in.', { kind: 'main' });
  add('entry-c', C, 'c-out', 'Profiles · logged out', C_NOTE, { kind: 'profiles', strip: [null] });
  add('entry-c', C, 'c-in', 'Profiles · logged in', C_NOTE, { kind: 'profiles', strip: [NAME, 'ok'] });
  add('entry-c', C, 'c-sync', 'Profiles · syncing', C_NOTE, { kind: 'profiles', strip: [NAME, 'sync'] });
  add('entry-c', C, 'c-off', 'Profiles · offline', C_NOTE, { kind: 'profiles', strip: [NAME, 'off'] });
  add('entry-c', C, 'c-warn', 'Needs attention', C_NOTE + ' Only when something needs you does the start page speak: a pill at the top right, where the update notice already sits.', {
    kind: 'main',
    pill: 'Account needs attention',
  });

  const L = 'Log in';
  add('login', L, 'login-empty', 'Empty', 'The cursor starts in the name. Tab moves on, Enter logs in, Esc goes back. No key letters here: letters are text.', { kind: 'page', html: () => loginPage('empty'), kb: true });
  add('login', L, 'login-filled', 'Filled in', 'Ready: Enter logs in.', { kind: 'page', html: () => loginPage('filled'), kb: true });
  add('login', L, 'login-working', 'Working…', 'While the key is made from the password (PBKDF2, in a Web Worker): about a second on a desktop, several on a phone. A slow, even bar and a sentence that says how long. WebCrypto gives no real progress, so the bar runs on the time the device took last (or a first guess).', {
    kind: 'page',
    html: () => loginPage('working'),
  });
  add('login', L, 'login-error', 'Wrong name or password', 'One message for both. The password is cleared and has the cursor; the name stays.', { kind: 'page', html: () => loginPage('error'), kb: true });
  add('login', L, 'login-turnstile', 'After three failures', 'The Turnstile box comes in above the button (300 × 65, Cloudflare’s own drawing; here a placeholder).', { kind: 'page', html: () => loginPage('turnstile') });
  add('login', L, 'login-locked', '15-minute wait', 'Ten failures for one name in 15 minutes. A countdown, and the reason in plain words. The same is shown for a name that does not exist.', { kind: 'page', html: () => loginPage('locked') });

  const CR = 'Create account · one page';
  const CR_NOTE = 'Variant 1: the form and the six points side by side on a desktop (nothing scrolls), one column on a phone (fields, the six points, Turnstile, the button).';
  add('create', CR, 'create-empty', 'Empty', CR_NOTE, { kind: 'page', html: () => createPage('empty'), tall: true });
  add('create', CR, 'create-filled', 'Filled in', CR_NOTE + ' The strength hint counts length first.', { kind: 'page', html: () => createPage('filled'), tall: true });
  add('create', CR, 'create-bad', 'Not valid', CR_NOTE + ' Each field says its own fault as you leave it.', { kind: 'page', html: () => createPage('bad'), tall: true });
  add('create', CR, 'create-taken', 'Name taken', CR_NOTE + ' Whether a name is free is only known when Create is pressed (the server must not let names be listed), so this comes after the Working state.', {
    kind: 'page',
    html: () => createPage('taken'),
    tall: true,
  });
  add('create', CR, 'create-working', 'Working…', CR_NOTE, { kind: 'page', html: () => createPage('working'), tall: true });
  add('create', CR, 'create-end', 'Phone: scrolled to the end', 'Phone only: the foot of the page, with the Turnstile box and the button.', { kind: 'page', html: () => createPage('filled'), tall: true, only: 'p', scrollEnd: true });
  add('create', CR, 'create-typing', 'Phone: typing', 'Phone only: the page with our keyboard up, in the password field.', { kind: 'page', html: () => createPage('filled'), tall: true, kb: true, only: 'p', scrollTo: 'input[type=password]' });

  const C2 = 'Create account · two steps';
  const C2_NOTE = 'Variant 2: the six points alone first, then a short form. Slower by one key press, but the points are read and each phone page is short.';
  add('create2', C2, 'create2-points', 'Step 1: the six points', C2_NOTE, { kind: 'page', html: () => create2Page(1) });
  add('create2', C2, 'create2-form', 'Step 2: empty', C2_NOTE, { kind: 'page', html: () => create2Page(2, 'empty'), kb: true });
  add('create2', C2, 'create2-filled', 'Step 2: filled in', C2_NOTE, { kind: 'page', html: () => create2Page(2, 'filled') });

  const RC = 'Recovery code';
  const RC_NOTE = 'Shown once, right after the account is made. There is no Back and Esc does nothing: the only way on is to type the last group.';
  add('code', RC, 'code-shown', 'Shown', RC_NOTE + ' (Try it: type 3YJA.)', { kind: 'page', html: () => codePage('shown'), noBack: true });
  add('code', RC, 'code-copied', 'Copied', RC_NOTE, { kind: 'page', html: () => codePage('copied'), noBack: true });
  add('code', RC, 'code-confirmed', 'Last group typed', RC_NOTE + ' Continue is lit and Enter presses it.', { kind: 'page', html: () => codePage('confirmed'), noBack: true });
  add('code', RC, 'code-typing', 'Phone: typing', 'Phone only: the confirmation with our keyboard up.', { kind: 'page', html: () => codePage('shown'), noBack: true, kb: true, only: 'p', scrollTo: '#mk-last' });

  const RV = 'Recovery';
  const RV_NOTE = 'From “Forgot password”. Name, the recovery code, a new password twice, Turnstile.';
  add('recover', RV, 'recover-empty', 'Empty', RV_NOTE, { kind: 'page', html: () => recoverPage('empty'), tall: true });
  add('recover', RV, 'recover-filled', 'Filled in', RV_NOTE, { kind: 'page', html: () => recoverPage('filled'), tall: true });
  add('recover', RV, 'recover-working', 'Working…', RV_NOTE, { kind: 'page', html: () => recoverPage('working'), tall: true });
  add('recover', RV, 'recover-error', 'Wrong name or code', RV_NOTE + ' One message for both, as on Log in. Failures count toward the name’s 15-minute wait.', { kind: 'page', html: () => recoverPage('error'), tall: true });

  add('recover', RV, 'recover-end', 'Phone: scrolled to the end', 'Phone only: the foot of the page.', { kind: 'page', html: () => recoverPage('filled'), tall: true, only: 'p', scrollEnd: true });

  const AC = 'Account';
  const AC_NOTE =
    'One page, grouped from everyday to rare: who and sync state at the head; Storage and Devices on the left; Password and recovery, Notices, Your data and Leaving on the right. On a phone the same groups in one column, in that order. Delete account is last, small and has no key letter.';
  add('account', AC, 'acct', 'In step', AC_NOTE, { kind: 'page', html: () => accountPage('ok'), tall: true });
  add('account', AC, 'acct-full', 'Needs attention', AC_NOTE + ' Here: cloud storage full. The head says what, the bar shows where.', { kind: 'page', html: () => accountPage('full'), tall: true });
  add('account', AC, 'acct-end', 'Phone: scrolled to the end', 'Phone only: the foot of the page, where Leaving is.', { kind: 'page', html: () => accountPage('ok'), tall: true, only: 'p', scrollEnd: true });

  const DG = 'Dialogs';
  const dlg = (id, label, note, f, o) => add('dialogs', DG, id, label, note, Object.assign({ kind: 'dialog', under: () => accountPage('ok'), html: f }, o));
  dlg('d-logout', 'Log out', 'The choice is on the dialog, with keeping as the default. K and R choose; Enter logs out.', () => DIALOGS.logout('keep'));
  dlg('d-logout-remove', 'Log out · remove', 'Removing is the dangerous choice: the button turns red, and unsynced changes are counted.', () => DIALOGS.logout('remove'));
  dlg('d-delete', 'Delete account', 'The password and the typed name. The cursor rests on Cancel; Delete has no key letter and is dead until both fields are right.', () => DIALOGS.delete('empty'), { kb: true });
  dlg('d-delete-ready', 'Delete · ready', 'Both fields right: Delete is live.', () => DIALOGS.delete('ready'));
  dlg('d-end', 'End session', 'From End on a device row.', () => DIALOGS.end());
  dlg('d-endall', 'End all others', 'From End all others.', () => DIALOGS.endall());
  dlg('d-password', 'Change password', 'The current password, the new one twice.', () => DIALOGS.password('empty'), { kb: true });
  dlg('d-password-working', 'Change password · working', 'The same calm Working state as on Log in.', () => DIALOGS.password('working'));
  dlg('d-newcode', 'New recovery code', 'Asks for the password (the key cannot be re-wrapped without it), then shows the code page again.', () => DIALOGS.newcode(), { kb: true });
  add('dialogs', DG, 'd-newcode-shown', 'New code shown', 'The same page as after Create account, with its own first line.', { kind: 'page', html: () => codePage('shown', true), noBack: true });

  window.MK_STATES = S.map((s) => ({ id: s.id, group: s.group, groupLabel: s.groupLabel, label: s.label, note: s.note, only: s.only || '' }));
  if (!window.MK) return;

  // ------------------------------------------------------------------ apply
  const st = S.find((s) => s.id === MK.state) || S[0];
  const app = document.getElementById('app');
  const start = app.querySelector('.wc-start');
  const stack = start.querySelector('.wc-stack');
  const frames = stack.querySelectorAll(':scope > .wc-frame');
  const f1 = frames[0];
  const f2 = frames[1];
  const f3 = frames[2];
  const okb = app.querySelector('.wc-okb-page');
  start.querySelector('.wc-start-skyhost').style.background = `#1b2340 url(${MK.sky}) center / cover no-repeat`;
  document.documentElement.classList.add(phone ? 'mk-p' : 'mk-d');

  const kbUp = phone && st.kb;
  if (!kbUp) {
    if (okb) okb.remove();
    app.style.removeProperty('--wc-okb-page-h');
  } else {
    // As the app does while its keyboard is up on a page: the page ends at the keys.
    document.documentElement.classList.add('wc-okb-pg');
  }

  function showMain() {
    start.classList.remove('is-sub');
    start.classList.add('is-main');
    start.dataset.lkBox = 'menu';
    stack.classList.remove('has-overlay');
    f1.hidden = false;
    f2.remove();
    f3.remove();
    const menu = f1.querySelector('.wc-sm');
    for (const li of menu.querySelectorAll('.wc-sm-item')) {
      li.classList.toggle('is-sel', li.dataset.key === 'enter');
      li.removeAttribute('aria-current');
    }
    return menu;
  }

  function showPage(html, opts) {
    stack.classList.remove('has-overlay');
    f1.hidden = true;
    f2.hidden = false;
    f2.removeAttribute('inert');
    f2.removeAttribute('data-under');
    f3.remove();
    const sub = f2.querySelector('.wc-lk-sub');
    if (html) sub.innerHTML = html;
    if (opts && opts.tall && phone) {
      sub.classList.add('is-tall', 'mk-tall');
      start.classList.add('mk-tallpage');
    }
    return sub;
  }

  if (st.kind === 'main') {
    const menu = showMain();
    if (st.row) {
      const credits = menu.querySelector('[data-key="credits"]');
      credits.insertAdjacentHTML('beforebegin', entryRow(st.row[0], st.row[1], st.sel));
      if (st.sel) menu.querySelector('[data-key="enter"]').classList.remove('is-sel');
    }
    if (st.corner) start.querySelector('.wc-start-scenery').insertAdjacentHTML('beforeend', entryCorner(st.corner[0], st.corner[1]));
    if (st.pill) start.insertAdjacentHTML('beforeend', `<div class="wc-start-pills" role="status"><button type="button" class="wc-start-pill is-update" data-go="acct-full">${st.pill}</button></div>`);
  } else if (st.kind === 'profiles') {
    const sub = showPage(null);
    sub.querySelector('.wc-lk-win .wc-lk-flash').insertAdjacentHTML('beforebegin', entryStrip(st.strip[0], st.strip[1]));
    sub.querySelector('.wc-lk-back').dataset.go = 'c-start';
  } else if (st.kind === 'page') {
    const sub = showPage(st.html(), st);
    if (st.noBack) sub.querySelector('.wc-lk-back').remove();
  } else if (st.kind === 'dialog') {
    f1.hidden = true;
    const sub = f2.querySelector('.wc-lk-sub');
    sub.innerHTML = st.under();
    if (phone) {
      sub.classList.add('is-tall', 'mk-tall');
      start.classList.add('mk-tallpage');
    }
    f3.querySelector('.wc-lk-dslot').innerHTML = st.html();
    const place = () => {
      const b = sub.querySelector('.wc-lk-box').getBoundingClientRect();
      const o = start.getBoundingClientRect();
      f3.style.setProperty('--wc-ov-l', b.left - o.left + 'px');
      f3.style.setProperty('--wc-ov-t', b.top - o.top + 'px');
      f3.style.setProperty('--wc-ov-w', b.width + 'px');
      f3.style.setProperty('--wc-ov-h', Math.min(b.height, o.height - (b.top - o.top)) + 'px');
    };
    place();
    window.addEventListener('resize', place);
    setTimeout(place, 300);
  } else if (st.kind === 'sheet') {
    // The phone's in-game menu sheet, over a still of the game, with an Account row.
    app.innerHTML =
      `<div class="wc-app" style="position:absolute;inset:0;background:#000 url(${MK.game}) center / cover no-repeat"><div class="wc-cockpit" data-phone-game="" style="position:absolute;inset:0;background:none">` +
      `<div class="wc-ph-menu-host"><div class="wc-look wc-ph-menu-surface" data-view="sheet"><button type="button" class="wc-ph-scrim" tabindex="-1" aria-label="Close menu"></button>${MK.sheet}</div></div></div></div>`;
    const prof = app.querySelector('[data-row="profile"]');
    const row = prof.cloneNode(true);
    row.dataset.row = 'account';
    row.querySelector('svg').outerHTML = KEY_ICON.replace('wc-lk-ic', row.querySelector('svg').getAttribute('class') || 'wc-ph-ico');
    row.querySelector('.wc-ph-row-t').textContent = 'Account';
    row.querySelector('.wc-ph-row-v').innerHTML = NAME + ' ' + mark('ok');
    prof.after(row);
  }

  // The wordmark's height, for the pages' layout (the app measures it the same way).
  const brand = start.querySelector('.wc-start-brand');
  const putBrand = () => brand && start.style.setProperty('--wc-brand-h', brand.offsetHeight + 'px');
  putBrand();
  window.addEventListener('resize', putBrand);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(putBrand);

  // Clicks that lead somewhere: ask the shell for that state.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-go]');
    if (a) {
      e.preventDefault();
      if (a.classList.contains('is-disabled')) return;
      parent.postMessage({ mkGo: a.dataset.go }, '*');
      return;
    }
    if (e.target.closest('a[href="#"]')) e.preventDefault();
  });

  // The recovery code's confirmation works: the last group lights Continue.
  const last = document.getElementById('mk-last');
  const cont = document.getElementById('mk-continue');
  if (last && cont) {
    last.addEventListener('input', () => {
      const ok = last.value.trim().toUpperCase() === CODE[5];
      cont.classList.toggle('is-disabled', !ok);
      cont.classList.toggle('is-sel', ok);
    });
  }
  const copy = document.getElementById('mk-copy');
  if (copy) copy.addEventListener('click', () => (document.querySelector('.mk-codepage .wc-lk-flash').innerHTML = '<span class="is-ok">Copied.</span>'));

  // The wait's countdown runs.
  const cd = document.querySelector('[data-countdown]');
  if (cd) {
    let n = Number(cd.dataset.countdown);
    setInterval(() => {
      n = Math.max(0, n - 1);
      cd.textContent = Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0');
    }, 1000);
  }

  // Where the keyboard is: the marked field, shown as focused.
  const foc = document.querySelector('[data-focus]');
  if (foc) {
    foc.classList.add('mk-focus');
    if (!phone) {
      try {
        foc.focus({ preventScroll: true });
        const v = foc.value.length;
        if (foc.type !== 'password') foc.setSelectionRange(v, v);
      } catch (_) {
        /* shown by .mk-focus */
      }
    }
  }
  if (st.scrollTo) {
    const el = document.querySelector(st.scrollTo);
    if (el) el.scrollIntoView({ block: 'center' });
  }
  if (st.scrollEnd) {
    for (const sc of document.querySelectorAll('.wc-lk-bbody.wc-lk-scroll')) sc.scrollTop = sc.scrollHeight;
    const sub = document.querySelector('.wc-lk-sub');
    if (sub) sub.scrollTop = sub.scrollHeight;
  }
})();
