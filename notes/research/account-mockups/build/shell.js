// The review shell: tabs over the groups and their states, a desktop/phone
// toggle, and the stage (an <iframe srcdoc> built from MK_DATA). The
// address keeps the place: #<state>.<d|p>[.bare]  (bare: the stage only,
// for screenshots).
(function () {
  const all = window.MK_STATES;
  const states = MK_GROUPS ? all.filter((s) => MK_GROUPS.includes(s.group)) : all;
  const groups = [];
  for (const s of states) if (!groups.some((g) => g.id === s.group)) groups.push({ id: s.group, label: s.groupLabel });

  const frame = document.getElementById('sh-frame');
  const stage = document.getElementById('sh-stage');
  const elGroups = document.getElementById('sh-groups');
  const elStates = document.getElementById('sh-states');
  const elNote = document.getElementById('sh-note');

  let cur = { id: states[0].id, view: 'd', bare: false };

  function parse() {
    const h = decodeURIComponent(location.hash.replace(/^#/, '')).split('.');
    const s = states.find((x) => x.id === h[0]);
    if (s) cur.id = s.id;
    if (h.includes('p')) cur.view = 'p';
    else if (h.includes('d')) cur.view = 'd';
    cur.bare = h.includes('bare');
  }

  const PHONE = [
    ['(pointer: coarse)', '(min-width: 0px)'],
    ['(pointer: fine)', '(max-width: 0px)'],
    ['(hover: hover)', '(max-width: 0px)'],
    ['(hover: none)', '(min-width: 0px)'],
  ];
  const DESK = [
    ['(pointer: coarse)', '(max-width: 0px)'],
    ['(pointer: fine)', '(min-width: 0px)'],
    ['(hover: hover)', '(min-width: 0px)'],
    ['(hover: none)', '(max-width: 0px)'],
  ];
  const STATES_JS = document.getElementById('mk-states').textContent;
  const cssFor = {};
  function css(view) {
    if (!cssFor[view]) {
      let c = MK_DATA.css;
      for (const [a, b] of view === 'p' ? PHONE : DESK) c = c.split(a).join(b);
      cssFor[view] = c;
    }
    return cssFor[view];
  }

  function doc(id, view) {
    const mk = { state: id, view, sky: MK_DATA.sky[view], game: MK_DATA.game, icons: MK_DATA.icons, sheet: MK_DATA.sheet };
    const end = '</' + 'script>';
    return (
      `<!doctype html><html ${MK_DATA.attrs[view]}><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css(view)}</style></head>` +
      `<body>${MK_DATA.skel[view]}<script>window.MK=${JSON.stringify(mk).replace(/</g, '\\u003c')};${end}` +
      `<script>${STATES_JS}${end}</body></html>`
    );
  }

  function fit() {
    if (cur.view !== 'p' || cur.bare) {
      frame.style.transform = '';
      return;
    }
    const r = stage.getBoundingClientRect();
    const k = Math.min(1, (r.height - 24) / 844, (r.width - 8) / 390);
    frame.style.transform = k < 1 ? `scale(${k})` : '';
  }

  function show() {
    const s = states.find((x) => x.id === cur.id);
    // A phone-only state shows in the phone view.
    if (s.only && s.only !== cur.view) cur.view = s.only;
    document.body.classList.toggle('is-bare', cur.bare);
    stage.classList.toggle('is-phone', cur.view === 'p');
    elGroups.innerHTML = '';
    for (const g of groups) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = g.label;
      b.setAttribute('aria-pressed', String(g.id === s.group));
      b.onclick = () => go(states.find((x) => x.group === g.id).id);
      elGroups.append(b);
    }
    elStates.innerHTML = '';
    for (const x of states.filter((x) => x.group === s.group)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = x.label;
      b.setAttribute('aria-pressed', String(x.id === s.id));
      b.onclick = () => go(x.id);
      elStates.append(b);
    }
    for (const b of document.querySelectorAll('.sh-view button')) b.setAttribute('aria-checked', String(b.dataset.view === cur.view));
    elNote.innerHTML = `<b>${s.groupLabel} · ${s.label}.</b> ${s.note || ''}`;
    fit();
    frame.srcdoc = doc(s.id, cur.view);
  }

  function go(id, view) {
    if (id) cur.id = id;
    if (view) cur.view = view;
    const h = `#${cur.id}.${cur.view}${cur.bare ? '.bare' : ''}`;
    if (location.hash !== h) history.replaceState(null, '', h);
    show();
  }

  for (const b of document.querySelectorAll('.sh-view button')) b.onclick = () => go(null, b.dataset.view);
  window.addEventListener('message', (e) => {
    const to = e.data && e.data.mkGo;
    if (to && states.some((x) => x.id === to)) go(to);
  });
  window.addEventListener('hashchange', () => {
    parse();
    show();
  });
  window.addEventListener('resize', fit);
  parse();
  // A narrow window (a phone) starts in the phone view.
  if (!location.hash && window.innerWidth < 700) cur.view = 'p';
  show();
})();
