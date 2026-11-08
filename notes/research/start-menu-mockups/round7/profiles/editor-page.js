/* Round 7 · profiles · wiring of an editor-<x>.html page: the start page (menu → Profile list → Edit → the
   editor in the large box) or ?ctx=game (the editor in an in-game window). Set window.PED_LAYOUT ('a'|'b'|'c')
   and window.PED_FRAME ('a'|'b', the default window frame in game) before loading this.
   URL: ?page=list|editor (open directly) · ?view=editor|help · ?kind=macro · ?sel=<pattern> · ?sheet (narrow:
   the entry open) · ?modal=confirm|held|capture · ?empty (no entries) · ?ctx=game&bg=paper&frame=a|b */
(() => {
'use strict';
const qs = WC.qs, LAYOUT = window.PED_LAYOUT || 'a';
let P = null;
function states(p, within) {
  if (qs.get('kind')) p.setKind(qs.get('kind'));
  if (qs.get('sel')) p.select(qs.get('sel'));
  if (qs.get('view')) p.setView(qs.get('view'));
  if (qs.has('sheet')) p.openSheet();
  if (qs.get('err') === '1') { p.edit('give %1 {to %2'); }
  const m = qs.get('modal');
  setTimeout(() => { if (m === 'confirm') p.confirm(); else if (m === 'held') p.held(); else if (m === 'capture') { p.setKind('macro'); p.select('F5'); p.capture(); } }, WC.dur(qs.has('nointro') ? 50 : 900));
}
function demo(p) {
  const d = WC.demoExtra(`<div class="row2">Show <button data-d="confirm">Apply prompt</button><button data-d="held">Not applied</button><button data-d="capture">Bind key</button><button data-d="bad">Bad entry</button></div>`);
  d.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => {
    const x = b.dataset.d;
    if (x === 'confirm') p.confirm(); else if (x === 'held') p.held();
    else if (x === 'capture') { p.setView('lite'); p.setKind('macro'); p.select('F5'); p.capture(); }
    else if (x === 'bad') { p.setView('lite'); p.setKind('alias'); p.select('gv'); }
  }));
}

if (SHELL.ctx === 'game') {
  const narrow = LAYOUT === 'c';
  const g = SHELL.game({ frame: window.PED_FRAME || 'b', title: 'Profile', note: 'Gibur', x: narrow ? 70 : 36, y: 36, w: narrow ? 660 : 870, h: 610,
    onClose: () => {}, onOpen: () => { if (P) P.show(); } });
  P = PED.mount(g.body, { layout: LAYOUT, live: true, name: 'Gibur', within: g.body, active: g.focused, onLeave: () => g.win.close() });
  WC.keys.push({ key: (e) => (g.focused() ? P.layer.key(e) : false), back: () => { if (g.focused()) P.layer.back(); } });
  P.show(); demo(P); states(P, g.body);
} else {
  const list = SHELL.list({ onEdit: (name) => openEditor(name, false) });
  SHELL.start({ onProfile: () => list.show() });
  WC.decorate();
  const big = SHELL.big({ hood: 'Profile' });
  let demoed = false;
  function openEditor(name, instant) {
    big.win.innerHTML = '';
    P = PED.mount(big.win, { layout: LAYOUT, live: false, name, onLeave: (info) => { big.close(); if (info.saved) setTimeout(() => list.flash(`Saved ${name}.`), WC.dur(500)); } });
    big.open({ instant, layer: P.layer });
    P.show();
    if (!demoed) { demoed = true; demo({ confirm: () => P.confirm(), held: () => P.held(), capture: () => P.capture(), setView: (v) => P.setView(v), setKind: (k) => P.setKind(k), select: (s) => P.select(s) }); }
    return P;
  }
  const page = qs.get('page');
  if (page === 'list' || page === 'editor') list.show(true);
  if (page === 'editor') { const p = openEditor('Gibur', true); states(p); }
}
})();
