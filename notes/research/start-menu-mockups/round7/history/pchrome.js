/* Round 7 · history group · the player chrome in three layouts, for the run log and the HTML replay
   (throwaway mockup code; real behaviour from src/player/view.ts, ADR 0114).
   PC.mount({ layout, mode, sky, mark }) builds the page, creates the GAME engine and the controls:
     layout 'a'  "Ramen": the player in the large box (sky round it), the vertical rail inside the stage's right
                 edge, the controls as a glass bar in the box's foot, the wordmark small in the corner.
     layout 'b'  "Teatern": the player fills the window (no sky, no box), a hood plate hangs from the top edge
                 with the title, Back top left, the controls in a small Lykta panel bottom right; the chrome
                 fades 6 s after the last activity while playing (as today).
     layout 'c'  "Tidslinjen": the player in the large box (no wordmark, the box to the edges), a horizontal
                 timeline across the foot (run segments, markers above, a rivet playhead), controls under it.
   mode 'log' (History → Run log: Back / Esc return to History) or 'replay' (the exported file: no Back,
   Fullscreen with F, export comments with holds, the export title).
   URL: ?loading (the load wait) · ?error (the log cannot be read) · ?paused · ?pos=MM (start minute) ·
   ?pop=panes|display · ?ended · ?cover=0 (replay without the title card) · ?from=<url> (Back goes there). */
(() => {
'use strict';
const P = {
  start: 'M6 5v14 M19 5.5L9.5 12l9.5 6.5z', back: 'M5.6 9.4A7.2 7.2 0 1 1 5 13.4 M5 4.6v4.8h4.8', fwd: 'M18.4 9.4A7.2 7.2 0 1 0 19 13.4 M19 4.6v4.8h-4.8',
  play: 'M8 5.2l11 6.8-11 6.8z', pause: 'M8.5 5.5v13 M15.5 5.5v13', panes: 'M4 4h16v16H4z M14 4v16 M14 12h6',
  display: 'M4 7h9 M17 7h3 M15 4.5v5 M4 12h3 M11 12h9 M9 9.5v5 M4 17h11 M19 17h1 M17 14.5v5', fs: 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5',
  fsx: 'M9 4v5H4 M15 4v5h5 M20 15h-5v5 M4 15h5v5', prev: 'M14.5 6l-6 6 6 6', next: 'M9.5 6l6 6-6 6', close: 'M6 6l12 12M18 6L6 18',
};
const ic = (name, extra = '') => `<svg class="pl-ic" viewBox="0 0 24 24"><path d="${P[name]}"/>${extra}</svg>`;
const ten = (dir) => ic(dir, '<text x="12" y="15.6" text-anchor="middle">10</text>');
const KIND = { death: '#e06c6c', pkill: '#e0915a', achievement: '#e3b341', level: '#7fbf7f' };
const kindIc = (k) => window.HP ? HP.KIND_SVG[k].replace('<svg ', `<svg class="pl-ki" style="stroke:${KIND[k]}" `) : '';
const THEMES = [['default', 'Default', '#000000'], ['dark', 'Dark', '#000000'], ['teal', 'Teal', '#002b36'], ['paper', 'Paper', '#f4ecd8'], ['sepia', 'Sepia', '#2b1b12'], ['slate', 'Slate', '#1c2128']];
const FONTS = [['default', 'Default'], ['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']];
const LONG = (t) => new Date(t).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const p2 = (n) => String(n).padStart(2, '0');

function mount(o) {
  const { layout, mode } = o;
  const replay = mode === 'replay';
  const qs = WC.qs;
  const S = GAME.SESSION;
  const fmt = GAME.fmtClock;
  document.body.classList.add('pl-body', 'pl-' + layout, replay ? 'pl-replay' : 'pl-log');
  if (o.sky) WC.sky.start({ almanac: false });
  else { document.body.classList.add('pl-dark'); WC.grain(); }
  const TITLE = 'Ugluk at the Ford';
  const who = `${S.character}`;
  const when = `${LONG(S.start)} · ${p2(new Date(S.start).getHours())}:${p2(new Date(S.start).getMinutes())}`;
  // ---------------------------------------------------------------- the frame
  let root, win;
  if (layout === 'a' || layout === 'c') {
    root = WC.el('section', { class: `lp box-large pl pl-${layout}${o.mark ? ' has-mark' : ''}`, 'data-hood': replay ? 'Replay' : 'Run log', ...(replay ? {} : { 'data-back': '' }), 'aria-label': replay ? 'Replay' : 'Run log' });
    root.innerHTML = `<div class="win">
      <div class="box-head pl-head"><div class="pl-who">${replay ? `<span class="pl-title">${TITLE}</span><span class="pl-meta">${who} · Level ${S.level} · ${when}</span>` : `<span class="pl-name">${who}</span><span class="pl-meta">Level ${S.level} · <span class="pl-runtxt">Run 1 of 2</span> · ${when}</span>`}</div><div class="pl-state" aria-live="polite"></div></div>
      <div class="pl-stage"></div>
      <div class="box-foot pl-foot"></div></div>`;
    document.body.append(root);
    WC.decorate(root);
    win = root.querySelector('.win');
    if (o.mark) { const m = WC.el('a', { class: 'wm small bare', id: 'mark', title: replay ? 'Made with WebCockpit' : 'Start', 'aria-label': 'MUME Cockpit' }); document.body.prepend(m); WC.Wordmark(m); if (!replay) m.addEventListener('click', goBack); }
  } else {
    root = WC.el('div', { class: 'pl pl-b' });
    root.innerHTML = `<div class="pl-stage"></div>
      <div class="pl-fade pl-top"><div class="pl-plate"><i class="rv"></i><span class="pl-pt">${replay ? `<b>${TITLE}</b><em>${who} · Level ${S.level} · ${new Date(S.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</em>` : `<b>${who}</b><em>Level ${S.level} · <span class="pl-runtxt">Run 1 of 2</span> · ${new Date(S.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · ${p2(new Date(S.start).getHours())}:${p2(new Date(S.start).getMinutes())}</em>`}</span><i class="rv"></i></div></div>
      ${replay ? '' : '<button class="backbtn pl-fade pl-back" type="button" aria-label="Back to History (Esc)"><svg viewBox="0 0 16 16"><path d="M9.8 3.2 5 8l4.8 4.8"/></svg>Back</button>'}
      <section class="lp pl-panel pl-fade" data-hood=""><div class="win pl-foot"></div></section>`;
    document.body.append(root);
    WC.decorate(root);
    win = root;
    const bb = root.querySelector('.pl-back'); if (bb) bb.addEventListener('click', goBack);
  }
  const stageEl = root.querySelector('.pl-stage'), foot = root.querySelector('.pl-foot');
  // ---------------------------------------------------------------- loading / error
  if (qs.has('error')) {
    stageEl.innerHTML = `<div class="pl-msg"><p class="pl-msg-t">${replay ? 'This replay could not be read.' : 'This log could not be opened.'}</p><p class="pl-msg-d">${replay ? 'The file is damaged or incomplete (the payload does not decode). Ask for a new copy.' : 'Run 2 of 2 is missing a chunk of its text. The statistics are still there.'}</p>${replay ? '' : '<button class="ibtn" id="errBack"><svg viewBox="0 0 16 16"><path d="M9.8 3.2 5 8l4.8 4.8"/></svg><span>Back to History</span></button>'}</div>`;
    foot.innerHTML = '';
    root.classList.add('pl-failed');
    if (replay) root.querySelectorAll('.pl-title, .pl-pt b').forEach((t) => { t.textContent = 'WebCockpit replay'; });
    root.querySelectorAll('.pl-pt em').forEach((t) => { t.textContent = ''; });
    const eb = document.getElementById('errBack'); if (eb) eb.addEventListener('click', goBack);
    WC.keys.push({ key: () => false, back: goBack });
    return {};
  }
  const eng = GAME.create(stageEl, { comments: replay, start: qs.has('pos') ? +qs.get('pos') * 60000 : replay ? 0 : undefined, autoplay: false });
  // ---------------------------------------------------------------- controls
  const btn = (act, title, inner, cls = '') => `<button class="ibtn icon pl-b-${act} ${cls}" type="button" data-act="${act}" title="${title}" aria-label="${title}">${inner}</button>`;
  const transport = `<div class="pl-tr">${btn('start', 'To the start (Home)', ic('start'))}${btn('back', 'Back 10 s (←)', ten('back'))}${btn('play', 'Play / pause (Space)', ic('pause'), 'pl-play')}${btn('fwd', 'Forward 10 s (→)', ten('fwd'))}</div>`;
  const stepper = `<div class="pl-speed" title="Speed (1–6)">${btn('slower', 'Slower (1–6)', ic('prev'), 'pl-sm')}<span class="pl-spv">1×</span>${btn('faster', 'Faster (1–6)', ic('next'), 'pl-sm')}</div>`;
  const seg = `<div class="seg pl-seg" role="radiogroup" aria-label="Speed">${GAME.SPEEDS.map((s, i) => `<button role="radio" data-sp="${s}" title="${s}× (${i + 1})">${s === .25 ? '¼' : s === .5 ? '½' : s}×</button>`).join('')}</div>`;
  const time = '<span class="pl-time"><b class="pl-now">00:00</b><span class="pl-of"> / </span><span class="pl-dur">0:00</span></span>';
  const tail = `<div class="pl-tail">${btn('panes', 'Panes', ic('panes'))}${btn('display', 'Display: font size and colours', ic('display'))}${btn('fs', replay ? 'Fullscreen (F)' : 'Fullscreen', ic('fs'))}</div>`;
  if (layout === 'c') {
    foot.innerHTML = `<div class="pl-track" role="slider" aria-label="Position" tabindex="-1"><div class="pl-marks"></div><div class="pl-groove"><div class="pl-runs"></div><i class="pl-done"></i><i class="pl-ph"></i></div><div class="pl-runlbl"></div><div class="pl-hint" hidden></div></div>
      <div class="pl-bar"><div class="pl-left">${time}</div>${transport}<div class="pl-right">${seg}${tail}</div></div>`;
  } else {
    foot.innerHTML = `<div class="pl-bar">${transport}${stepper}${time}<span class="pl-grow"></span>${tail}</div>`;
    stageEl.insertAdjacentHTML('beforeend', '<div class="pl-marks pl-vmarks"></div><div class="pl-rail" role="slider" aria-label="Position"><div class="pl-groove"><i class="pl-done"></i></div><i class="pl-ph"></i></div><div class="pl-hint" hidden></div>');
  }
  stageEl.insertAdjacentHTML('beforeend', '<div class="pl-tip" hidden></div>');
  // popups (one at a time, above the controls)
  const pops = {};
  const popHtml = { panes: () => `<div class="pl-plist">${eng.paneList().map((p) => `<label class="check pl-prow"><span>${p.label}</span><input type="checkbox" class="tog" data-pane="${p.id}" ${p.on ? 'checked' : ''}></label>`).join('')}</div>
      <div class="pl-popfoot"><button class="ibtn small" data-reset ${eng.canReset() ? '' : 'disabled'}><span>Reset layout</span></button></div>`,
    display: () => `<label class="lbl">Font size</label><div class="seg pl-fseg">${FONTS.map(([id, l]) => `<button data-font="${id}" aria-selected="${eng.font === id}">${l}</button>`).join('')}</div>
      <label class="lbl" style="margin-top:14px">Colours</label><div class="pl-sws">${THEMES.map(([id, l, bg]) => `<button class="pl-sw ${eng.theme === id ? 'on' : ''}" data-theme="${id}"><i style="background:${bg}"></i><span>${l}</span></button>`).join('')}</div>` };
  for (const name of ['panes', 'display']) {
    const el = WC.el('section', { class: 'lp pl-pop', 'data-hood': name === 'panes' ? 'Panes' : 'Display', role: 'dialog', 'aria-label': name, hidden: '' });
    el.innerHTML = '<div class="win"></div>';
    (layout === 'b' ? root : win).append(el);
    WC.decorate(el);
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => {
      const t = e.target;
      if (t.matches('[data-pane]')) { eng.togglePane(t.dataset.pane); renderPop(); }
      const f = t.closest('[data-font]'); if (f) { eng.setFont(f.dataset.font); renderPop(); }
      const th = t.closest('[data-theme]'); if (th) { eng.setTheme(th.dataset.theme); renderPop(); }
      const rs = t.closest('[data-reset]'); if (rs && !rs.disabled) { eng.resetPanes(); renderPop(); }
    });
    pops[name] = el;
  }
  let openPop = null;
  function renderPop() { if (!openPop) return; pops[openPop].querySelector('.win').innerHTML = popHtml[openPop](); }
  function setPop(name) {
    if (openPop) { pops[openPop].hidden = true; foot.querySelector(`[data-act="${openPop}"]`).classList.remove('on'); }
    openPop = openPop === name ? null : name;
    if (openPop) { pops[openPop].hidden = false; foot.querySelector(`[data-act="${openPop}"]`).classList.add('on'); renderPop(); }
    root.classList.toggle('pop-open', !!openPop);
    touch();
  }
  // ---------------------------------------------------------------- actions
  const act = (a) => {
    switch (a) {
      case 'start': eng.seek(0); break;
      case 'back': eng.skip(-10000); break;
      case 'fwd': eng.skip(10000); break;
      case 'play': cover ? startFromCover() : eng.toggle(); break;
      case 'slower': eng.speedStep(-1); break;
      case 'faster': eng.speedStep(1); break;
      case 'panes': case 'display': setPop(a); break;
      case 'fs': toggleFs(); break;
    }
    render();
  };
  foot.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  foot.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) { e.stopPropagation(); touch(); act(b.dataset.act); } const sp = e.target.closest('[data-sp]'); if (sp) { eng.setSpeed(+sp.dataset.sp); render(); } });
  function toggleFs() { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => WC.toast('Fullscreen<small>not allowed in this frame</small>')); }
  document.addEventListener('fullscreenchange', () => { const b = foot.querySelector('[data-act="fs"]'); const on = !!document.fullscreenElement; b.innerHTML = ic(on ? 'fsx' : 'fs'); b.title = on ? `Exit fullscreen${replay ? ' (F)' : ''}` : `Fullscreen${replay ? ' (F)' : ''}`; });
  function goBack() {
    const from = qs.get('from') || `history-${layout === 'b' ? 'b' : layout === 'c' ? 'c' : 'a'}.html?nointro&pick=s0`;
    if (replay) return;
    document.body.classList.add('pl-leaving');
    setTimeout(() => { location.href = from; }, WC.dur(260));
  }
  // ---------------------------------------------------------------- rail / timeline
  const railEl = stageEl.querySelector('.pl-rail') || foot.querySelector('.pl-track');
  const vertical = layout !== 'c';
  const doneEl = railEl.querySelector('.pl-done'), headEl = railEl.querySelector('.pl-ph'), hintEl = (vertical ? stageEl : foot).querySelector('.pl-hint');
  const marksEl = (vertical ? stageEl : foot).querySelector('.pl-marks'), tipEl = stageEl.querySelector('.pl-tip');
  const PAD = vertical ? 10 : 0;
  const frac = (ms) => Math.max(0, Math.min(1, ms / eng.duration));
  const offsetAt = (e) => { const r = railEl.querySelector('.pl-groove').getBoundingClientRect(); const f = vertical ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width; return Math.max(0, Math.min(1, f)) * eng.duration; };
  let drag = null;
  railEl.addEventListener('pointerdown', (e) => { if (e.button) return; e.preventDefault(); railEl.setPointerCapture(e.pointerId); drag = offsetAt(e); hint(e, drag); render(); });
  railEl.addEventListener('pointermove', (e) => { if (drag !== null) { drag = offsetAt(e); hint(e, drag); render(); } else hint(e, offsetAt(e)); });
  railEl.addEventListener('pointerup', (e) => { if (drag === null) return; const t = drag; drag = null; hintEl.hidden = true; eng.seek(t); touch(); render(); });
  railEl.addEventListener('pointerleave', () => { if (drag === null) hintEl.hidden = true; });
  function hint(e, ms) {
    hintEl.textContent = fmt(ms); hintEl.hidden = false;
    const host = (vertical ? stageEl : foot).getBoundingClientRect();
    if (vertical) hintEl.style.top = `${e.clientY - host.top}px`; else hintEl.style.left = `${e.clientX - host.left}px`;
  }
  // markers: one per slot (18 px), the kinds of the slot side by side; a tip lists the events
  function renderMarks() {
    const g = railEl.querySelector('.pl-groove').getBoundingClientRect();
    const span = vertical ? g.height : g.width; if (!span) return;
    const slots = new Map();
    for (const m of eng.marks) { const k = Math.round(frac(m.offset) * span / 18); const s = slots.get(k) || { at: m.offset, kinds: new Set(), tips: [] }; s.kinds.add(m.kind); s.tips.push(m.tip); s.at = Math.min(s.at, m.offset); slots.set(k, s); }
    const host = (vertical ? stageEl : foot).getBoundingClientRect();
    marksEl.innerHTML = [...slots.values()].map((s) => {
      const px = vertical ? g.top - host.top + frac(s.at) * span : g.left - host.left + frac(s.at) * span;
      return `<button class="pl-mark" type="button" style="${vertical ? 'top' : 'left'}:${px.toFixed(1)}px" data-at="${s.at}" data-tip="${s.tips.join('\n')}" aria-label="${s.tips.join('; ')}">${['achievement', 'death', 'pkill', 'level'].filter((k) => s.kinds.has(k)).map(kindIc).join('')}</button>`;
    }).join('') + (layout === 'c' && eng.comments.length ? eng.comments.map((cm) => `<i class="pl-cmk" style="left:${(g.left - host.left + frac(cm.at) * span).toFixed(1)}px" title="Note: ${cm.text}"></i>`).join('') : '');
    if (layout === 'c') {
      const rl = foot.querySelector('.pl-runlbl'), runs = foot.querySelector('.pl-runs');
      const f1 = frac(S.runs[0]) * 100;
      runs.innerHTML = `<i style="left:${f1}%"></i>`;
      rl.innerHTML = `<span style="left:0;width:${f1}%">Run 1</span><span style="left:${f1}%;width:${100 - f1}%">Run 2</span>`;
    }
  }
  marksEl.addEventListener('click', (e) => { const m = e.target.closest('.pl-mark'); if (m) { e.stopPropagation(); eng.seek(+m.dataset.at); touch(); render(); } });
  marksEl.addEventListener('mousedown', (e) => e.preventDefault());
  marksEl.addEventListener('pointerover', (e) => {
    const m = e.target.closest('.pl-mark'); if (!m) return;
    tipEl.innerHTML = m.dataset.tip.split('\n').map((t) => `<div>${t.replace(/\*/g, '<span class="pl-ast">*</span>')}</div>`).join('');
    tipEl.hidden = false;
    const host = stageEl.getBoundingClientRect(), r = m.getBoundingClientRect();
    if (vertical) { tipEl.style.top = `${r.top - host.top + r.height / 2}px`; tipEl.style.right = `${host.right - r.left + 8}px`; tipEl.style.left = ''; tipEl.style.bottom = ''; }
    else { tipEl.style.left = `${Math.min(host.width - 260, Math.max(8, r.left - host.left + r.width / 2 - 120))}px`; tipEl.style.bottom = '8px'; tipEl.style.top = ''; tipEl.style.right = ''; }
  });
  marksEl.addEventListener('pointerout', (e) => { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('.pl-mark')) tipEl.hidden = true; });
  // ---------------------------------------------------------------- render
  const nowEl = foot.querySelector('.pl-now'), durEl = foot.querySelector('.pl-dur'), spv = foot.querySelector('.pl-spv'), stateEl = root.querySelector('.pl-state');
  durEl.textContent = fmt(eng.duration);
  let sig = '';
  function render() {
    const pos = drag ?? eng.pos, f = frac(pos);
    if (vertical) { const g = railEl.querySelector('.pl-groove'); const h = g.clientHeight; doneEl.style.height = `${(f * h).toFixed(1)}px`; headEl.style.top = `${(PAD + f * h).toFixed(1)}px`; }
    else { doneEl.style.width = `${(f * 100).toFixed(3)}%`; headEl.style.left = `${(f * 100).toFixed(3)}%`; }
    const s2 = `${eng.playing}|${eng.speed}|${fmt(pos)}|${eng.run}|${eng.hold > 0}`;
    if (s2 === sig) return; sig = s2;
    nowEl.textContent = fmt(pos);
    const pb = foot.querySelector('[data-act="play"]');
    if (pb.dataset.playing !== String(eng.playing)) { pb.dataset.playing = String(eng.playing); pb.innerHTML = ic(eng.playing ? 'pause' : 'play'); pb.setAttribute('aria-label', eng.playing ? 'Pause' : 'Play'); }
    if (spv) { spv.textContent = `${eng.speed}×`; foot.querySelector('[data-act="slower"]').disabled = eng.speed === GAME.SPEEDS[0]; foot.querySelector('[data-act="faster"]').disabled = eng.speed === GAME.SPEEDS[5]; }
    foot.querySelectorAll('[data-sp]').forEach((b) => b.setAttribute('aria-selected', String(+b.dataset.sp === eng.speed)));
    root.querySelectorAll('.pl-runtxt').forEach((x) => { x.textContent = `Run ${eng.run + 1} of 2`; });
    if (stateEl) stateEl.textContent = eng.ended ? 'End of the log' : eng.playing ? (eng.hold > 0 ? 'A note — the log waits' : eng.speed === 1 ? 'Playing' : `Playing at ${eng.speed}×`) : 'Paused';
    root.classList.toggle('is-playing', eng.playing);
  }
  eng.on((w) => { if (w === 'note') renderNote(); render(); if (w === 'state' && !eng.playing) show(); if (w === 'state' && eng.playing) touch(); });
  // replay: the note card during a comment's hold (proposal: the ## rows stay in the text as today)
  const noteEl = replay ? WC.el('div', { class: 'pl-note', hidden: '' }) : null;
  if (noteEl) stageEl.append(noteEl);
  function renderNote() { if (!noteEl) return; if (eng.note) { noteEl.innerHTML = `<span class="pl-note-k">${S.character}'s note</span><p>${eng.note.text}</p>`; noteEl.hidden = false; } else noteEl.hidden = true; }
  // ---------------------------------------------------------------- auto-hide (layout b)
  let hideT = null;
  function show() { root.classList.remove('chrome-hidden'); }
  function touch() {
    show(); clearTimeout(hideT);
    if (layout !== 'b' || !eng.playing || openPop) return;
    hideT = setTimeout(() => { if (eng.playing && !openPop && drag === null) root.classList.add('chrome-hidden'); }, qs.has('fasthide') ? 1500 : 6000);
  }
  addEventListener('pointermove', touch); addEventListener('pointerdown', touch);
  // ---------------------------------------------------------------- keys
  WC.keys.push({
    key(e) {
      touch();
      if (cover) { if (e.key === ' ' || e.key === 'Enter') { startFromCover(); return true; } if (e.key === 'f' || e.key === 'F') { toggleFs(); return true; } return false; }
      if (e.key === 'Escape' && openPop) { setPop(openPop); return true; }
      if (e.ctrlKey || e.altKey || e.metaKey) return false;
      switch (e.key) {
        case ' ': eng.toggle(); break;
        case 'ArrowLeft': eng.skip(-10000); break;
        case 'ArrowRight': eng.skip(10000); break;
        case 'Home': eng.seek(0); break;
        case 'ArrowUp': eng.moveCursor(-1); break;
        case 'ArrowDown': eng.moveCursor(1); break;
        case 'PageUp': eng.moveCursor(-20); break;
        case 'PageDown': eng.moveCursor(20); break;
        case 'End': eng.moveCursor(Infinity); break;
        case 'f': case 'F': if (!replay) return false; toggleFs(); break;
        case 'Escape': if (replay) { if (document.fullscreenElement) document.exitFullscreen(); return true; } goBack(); break;
        default: { const n = e.key.length === 1 ? e.key.charCodeAt(0) - 49 : -1; if (n >= 0 && n < 6) eng.setSpeed(GAME.SPEEDS[n]); else return false; }
      }
      render();
      return true;
    },
    back() { if (openPop) setPop(openPop); else goBack(); },
  });
  addEventListener('pointerdown', (e) => { if (openPop && !e.target.closest('.pl-pop') && !e.target.closest('[data-act="panes"],[data-act="display"]')) setPop(openPop); });
  // ---------------------------------------------------------------- the replay's title card
  let cover = null;
  function startFromCover() { if (!cover) return; const c = cover; cover = null; c.classList.add('gone'); setTimeout(() => c.remove(), WC.dur(500)); root.classList.remove('has-cover'); eng.play(); render(); }
  if (replay && o.cover && qs.get('cover') !== '0') {
    cover = WC.el('div', { class: 'pl-cover' });
    cover.innerHTML = `<div class="pl-cv"><p class="pl-cv-k">A MUME replay</p><h1 class="pl-cv-t">${TITLE}</h1><span class="orn-rule"></span>
      <p class="pl-cv-m">${S.character} · Level ${S.level}<br>${LONG(S.start)}<br>${fmt(S.duration)} · 2 runs · ${eng.comments.length} notes</p>
      <button class="ibtn primary pl-cv-play" type="button">${ic('play')}<span>Play</span></button></div>`;
    stageEl.append(cover); root.classList.add('has-cover');
    cover.querySelector('.pl-cv-play').addEventListener('click', startFromCover);
  }
  // ---------------------------------------------------------------- start
  const begin = () => {
    renderMarks(); render();
    if (qs.has('ended')) { eng.seek(eng.duration); }
    else if (!cover && !qs.has('paused')) eng.play();
    if (qs.has('pop')) setPop(qs.get('pop'));
    render();
  };
  if (qs.has('loading')) {
    const l = WC.el('div', { class: 'pl-loading' }, `<p>${replay ? 'Opening the replay…' : 'Loading the log…'}</p><i class="pl-ld"><b></b></i>`);
    stageEl.append(l); root.classList.add('is-loading');
    setTimeout(() => { l.remove(); root.classList.remove('is-loading'); begin(); }, +(qs.get('loading') || 2200));
  } else requestAnimationFrame(begin);
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { renderMarks(); sig = ''; render(); }, 80); });
  (function loop() { render(); requestAnimationFrame(loop); })();
  window.PLAYER = { eng, setPop, act, root };
  return { eng, root };
}
window.PC = { mount };
})();
