/* Round 7 · history group · the page shell (throwaway mockup code).
   The sky, the start menu behind the page, and the big-page layout A resting state (layout/a-corner.html):
   the wordmark small in the top-left corner over the box, Back / Esc closes the page to the start menu
   (the wordmark flies back), H on the menu opens it again. The page opens at once unless ?menu.
   SHELL.init({ key, page, layer, onShow }) → { open, close, menu, isOpen }  (page: the .lp.box-large) */
(() => {
'use strict';
const EASE = 'cubic-bezier(.45,.05,.2,1)';
function init(opts) {
  const { key, page } = opts;
  WC.sky.start();
  const menu = WC.startMenu({ onActivate(k) { if (k === key) { open(); return true; } } });
  WC.decorate();
  const mark = WC.el('div', { class: 'wm small bare', id: 'mark', title: 'Start (Esc)', 'aria-label': 'MUME Cockpit — back to the start' });
  document.body.prepend(mark);
  WC.Wordmark(mark);
  const brand = menu.brand;
  let pop = null, isOpen = false;
  mark.addEventListener('click', () => { if (isOpen && !WC.busy) close(); });
  async function open(instant = false) {
    if (isOpen || WC.busy) return;
    WC.busy = true; isOpen = true; menu.active = false;
    if (opts.onShow) opts.onShow();
    if (instant) document.body.classList.add('instant');
    document.body.classList.add('pg', 'pgv');
    const from = WC.rect(brand), to = mark.querySelector('.wm-c').getBoundingClientRect();
    const D = instant ? 0 : WC.dur(1), anims = [];
    if (WC.RM || instant) {
      anims.push(brand.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260 * D, fill: 'forwards' }));
      anims.push(mark.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260 * D, fill: 'forwards' }));
    } else {
      anims.push(brand.animate([{ transform: 'none', opacity: 1 }, { transform: WC.flyTo(from, to), opacity: 1, offset: .78 }, { transform: WC.flyTo(from, to), opacity: 0 }], { duration: 950 * D, easing: EASE, fill: 'forwards' }));
      anims.push(mark.animate([{ opacity: 0 }, { opacity: 0, offset: .72 }, { opacity: 1 }], { duration: 950 * D, fill: 'forwards' }));
    }
    anims.push(page.animate([{ opacity: 0, transform: 'translateY(22px) scale(.985)' }, { opacity: 1, transform: 'none' }],
      { duration: (WC.RM ? 260 : 700) * D, delay: (WC.RM ? 0 : 180) * D, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }));
    await Promise.all(anims.map((a) => a.finished));
    document.body.classList.add('landed'); document.body.classList.remove('instant');
    pop = WC.keys.push({ key: (e) => opts.layer.key(e), back: () => (opts.layer.back ? opts.layer.back() : close()) });
    WC.busy = false;
  }
  async function close() {
    if (!isOpen || WC.busy) return;
    WC.busy = true; pop && pop(); pop = null;
    document.body.classList.remove('landed');
    const from = WC.rect(brand), to = mark.querySelector('.wm-c').getBoundingClientRect();
    const D = WC.dur(1), anims = [];
    anims.push(page.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(18px) scale(.985)' }], { duration: (WC.RM ? 220 : 450) * D, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' }));
    if (WC.RM) {
      anims.push(mark.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220 * D, fill: 'forwards' }));
      anims.push(brand.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260 * D, fill: 'forwards' }));
    } else {
      anims.push(mark.animate([{ opacity: 1 }, { opacity: 0, offset: .22 }, { opacity: 0 }], { duration: 900 * D, fill: 'forwards' }));
      anims.push(brand.animate([{ transform: WC.flyTo(from, to), opacity: 0 }, { transform: WC.flyTo(from, to), opacity: 1, offset: .2 }, { transform: 'none', opacity: 1 }], { duration: 900 * D, easing: EASE, fill: 'forwards' }));
    }
    setTimeout(() => document.body.classList.remove('pg'), (WC.RM ? 120 : 250) * D);
    await Promise.all(anims.map((a) => a.finished));
    document.body.classList.remove('pgv');
    anims.forEach((a) => a.cancel());
    isOpen = false; menu.active = true; menu.select(menu.cur); WC.busy = false;
  }
  if (!WC.qs.has('menu')) open(true);
  return { open, close, menu, get isOpen() { return isOpen; } };
}
window.SHELL = { init };
})();
