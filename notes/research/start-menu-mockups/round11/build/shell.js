// The review shell: rows of tabs (topic, direction, state), a view toggle
// (Desktop / Phone / Landscape / Tablet) and the stage (an <iframe srcdoc>
// built from MK_DATA). The address keeps the place:
// #<state>.<d|p|l|t>[.bare]  (bare: the stage only, for screenshots).
(function () {
  const all = window.MK_STATES;
  const states = MK_TOPICS ? all.filter((s) => MK_TOPICS.includes(s.topic)) : all;
  const uniq = (list, key, label) => {
    const out = [];
    for (const s of list) if (!out.some((g) => g.id === s[key])) out.push({ id: s[key], label: s[label] });
    return out;
  };
  const SIZE = { p: [390, 844] };

  const root = document.getElementById('sh-root');
  const frame = document.getElementById('sh-frame');
  const stage = document.getElementById('sh-stage');
  const elTopics = document.getElementById('sh-topics');
  const elDirs = document.getElementById('sh-dirs');
  const elStates = document.getElementById('sh-states');
  const elNote = document.getElementById('sh-note');

  let cur = { id: states[0].id, view: 'd', bare: false };
  const hash = () => {
    try {
      return decodeURIComponent(location.hash.replace(/^#/, ''));
    } catch (_) {
      return '';
    }
  };

  function parse() {
    const h = hash().split('.');
    const s = states.find((x) => x.id === h[0]);
    if (s) cur.id = s.id;
    for (const v of ['d', 'p']) if (h.includes(v)) cur.view = v;
    cur.bare = h.includes('bare');
  }

  // A desktop browser answers "fine pointer, hover" also in the phone's frame: the
  // pointer media queries are turned to the view's side.
  const TOUCH = [
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
    const k = view === 'd' ? 'd' : 'p';
    if (!cssFor[k]) {
      let c = MK_DATA.css;
      for (const [a, b] of k === 'p' ? TOUCH : DESK) c = c.split(a).join(b);
      cssFor[k] = c;
    }
    return cssFor[k];
  }

  function doc(s, view) {
    const mk = { state: s.id, view, sky: MK_DATA.sky[view], icons: MK_DATA.icons };
    const end = '</' + 'script>';
    return (
      `<!doctype html><html ${s.page === 'game' ? MK_DATA.gameAttrs[view] : MK_DATA.attrs[view]}><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css(view)}</style></head>` +
      `<body>${MK_DATA.skel[view][s.page]}<script>window.MK=${JSON.stringify(mk).replace(/</g, '\\u003c')};${end}` +
      `<script>${STATES_JS}${end}</body></html>`
    );
  }

  function fit() {
    const sz = SIZE[cur.view];
    if (!sz || cur.bare) {
      frame.style.transform = frame.style.width = frame.style.height = '';
      return;
    }
    frame.style.width = sz[0] + 'px';
    frame.style.height = sz[1] + 'px';
    const r = stage.getBoundingClientRect();
    const k = Math.min(1, (r.height - 24) / sz[1], (r.width - 16) / sz[0]);
    frame.style.transform = k < 1 ? `scale(${k})` : '';
  }

  function tabs(el, list, on, pick) {
    el.innerHTML = '';
    for (const g of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = g.label;
      b.setAttribute('aria-pressed', String(g.id === on));
      b.onclick = () => pick(g.id);
      el.append(b);
    }
  }

  function show() {
    const s = states.find((x) => x.id === cur.id);
    if (!s.views.includes(cur.view)) cur.view = s.views[0];
    root.classList.toggle('is-bare', cur.bare);
    stage.classList.toggle('is-framed', cur.view !== 'd');
    const inTopic = states.filter((x) => x.topic === s.topic);
    tabs(elTopics, uniq(states, 'topic', 'topicLabel'), s.topic, (id) => go(states.find((x) => x.topic === id).id));
    tabs(elDirs, uniq(inTopic, 'dir', 'dirLabel'), s.dir, (id) => {
      // The same state in the other direction, when it has one.
      const twin = inTopic.find((x) => x.dir === id && x.id === s.id.replace('-' + s.dir + '-', '-' + id + '-'));
      go((twin || inTopic.find((x) => x.dir === id)).id);
    });
    tabs(
      elStates,
      inTopic.filter((x) => x.dir === s.dir).map((x) => ({ id: x.id, label: x.label })),
      s.id,
      (id) => go(id),
    );
    for (const b of document.querySelectorAll('.sh-view button')) {
      b.setAttribute('aria-checked', String(b.dataset.view === cur.view));
      b.disabled = !s.views.includes(b.dataset.view);
    }
    elNote.innerHTML = `<b>${s.topicLabel} · ${s.dirLabel} · ${s.label}.</b> ${s.note || ''}`;
    fit();
    frame.srcdoc = doc(s, cur.view);
  }

  function go(id, view) {
    if (id) cur.id = id;
    if (view) cur.view = view;
    const h = `#${cur.id}.${cur.view}${cur.bare ? '.bare' : ''}`;
    try {
      if (location.hash !== h) history.replaceState(null, '', h);
    } catch (_) {
      /* a document without an address of its own (srcdoc): the place is not kept */
    }
    show();
  }

  for (const b of document.querySelectorAll('.sh-view button')) b.onclick = () => go(null, b.dataset.view);
  window.addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow) return;
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
  if (!hash() && window.innerWidth < 700) cur.view = 'p';
  show();
})();
