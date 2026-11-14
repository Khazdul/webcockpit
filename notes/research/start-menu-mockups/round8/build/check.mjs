// Says which owner row texts are cut (an ellipsis on the name) in each
// direction, at 360 and 400 px, desktop and phone; and the panel's height
// per form. Reads the combined file. Usage: node build/check.mjs
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '../../../../../node_modules/@playwright/test/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = pathToFileURL(path.join(here, '..', 'start-menu-round8.html')).href;
const b = await chromium.launch();
for (const [v, vp] of [['d', { width: 1440, height: 900 }], ['p', { width: 390, height: 844 }]]) {
  const page = await (await b.newContext({ viewport: vp })).newPage();
  const states = await (await page.goto(file), page.evaluate(() => window.MK_STATES));
  const cut = {};
  for (const s of states.filter((x) => x.topic === 'owner' && !x.id.endsWith('sheet'))) {
    for (const w of [360, 400]) {
      await page.goto('about:blank');
      await page.goto(`${file}#${s.id}.${v}.bare`);
      const f = page.frameLocator('#sh-frame');
      await f.locator('.mk-own-who').waitFor();
      await page.evaluate(() => document.getElementById('sh-frame').contentDocument.fonts.ready);
      const r = await f.locator('.wc-start').evaluate((el, w) => {
        el.style.setProperty('--wc-panel-w', w + 'px');
        const who = el.querySelector('.mk-own-who');
        return { cut: who.scrollWidth > who.clientWidth + 0.5, shown: who.clientWidth, need: who.scrollWidth };
      }, w);
      const [, dir, key] = s.id.split('-');
      (cut[key] ??= {})[`${dir}${w}`] = r.cut ? `CUT ${r.shown}/${r.need}` : 'fits';
    }
  }
  console.log(v === 'd' ? 'desktop' : 'phone');
  console.table(cut);
  const h = {};
  for (const s of states.filter((x) => x.topic === 'menu' && /-(f1|f2-guest|f3|f3-about-under)$/.test(x.id))) {
    await page.goto('about:blank');
    await page.goto(`${file}#${s.id}.${v}.bare`);
    const f = page.frameLocator('#sh-frame');
    await f.locator('.wc-sm-panel').waitFor();
    await page.evaluate(() => document.getElementById('sh-frame').contentDocument.fonts.ready);
    const r = await f.locator('.wc-start').evaluate((el) => {
      const p = el.querySelector('.wc-sm-panel').getBoundingClientRect();
      const q = el.querySelector('.wc-sm-quote').getBoundingClientRect();
      const a = el.querySelector('.wc-start-almanac').getBoundingClientRect();
      return `${Math.round(p.height)} (ends ${Math.round(p.bottom)}; quote ${Math.round(q.top)}-${Math.round(q.bottom)}; almanac from ${Math.round(a.top)})`;
    });
    h[s.id] = r;
  }
  console.table(h);
}
await b.close();
