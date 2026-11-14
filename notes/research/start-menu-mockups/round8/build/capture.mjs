// Captures the real look from a running dev server into build/skel/, so the
// mockups sit in the true DOM and CSS of the start page and of the History,
// Spotlights and Credits pages (desktop, phone, phone landscape, tablet).
// Throwaway tooling for the mockups only (after notes/research/account-mockups).
//
//   npx vite --port 5394 --strictPort      (never 5173)
//   node notes/research/start-menu-mockups/round8/build/capture.mjs [http://localhost:5394]
//
// Writes, per view (d = desktop 1440 × 900, p = phone 390 × 844,
// l = phone landscape 844 × 390, t = tablet 820 × 1180):
//   <v>-html.json   the <html> element's attributes (the theme's custom properties)
//   <v>-<page>.html `#app` with the sky emptied; page = main | history | spotlights | diary
//   <v>-sky.jpg     the sky alone (a fixed dusk)
// and css.json (every stylesheet seen, in order), icons.json (the kit's icons by name).
// The run library is seeded first (seed.mjs), with the clock pinned.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '../../../../../node_modules/@playwright/test/index.mjs';
import { NOW, seed } from './seed.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'skel');
const BASE = process.argv[2] ?? 'http://localhost:5394';
// One fixed dusk sky on every load (src/start/sky/params.ts).
const SKY = 'skyHour=19.1&skyMonth=0&skyDay=21&skyYear=3040&skyFreeze';
const U = `${BASE}/?${SKY}`;
fs.mkdirSync(out, { recursive: true });

// The stylesheets as the dev server serves them: the source text of each
// <style data-vite-dev-id> (the CSSOM's cssText loses shorthands that hold a var()).
const sheets = [];
async function collectCss(page) {
  const list = await page.evaluate(() => [...document.querySelectorAll('style')].map((s) => ({ id: s.getAttribute('data-vite-dev-id') || '', css: s.textContent })));
  for (const s of list) if (s.css && !sheets.some((x) => x.id === s.id && x.css === s.css)) sheets.push(s);
}

async function skeleton(page, v, name, sky) {
  await page.waitForTimeout(3500);
  await collectCss(page);
  if (sky) {
    const st = await page.addStyleTag({
      content: '.wc-start > :not(.wc-start-skyhost), .wc-okb-page, .wc-menu-host, .wc-ph-fs, .wc-fs-btn, [class*="fullscreen"] { visibility: hidden !important; }',
    });
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(out, `${v}-sky.jpg`), type: 'jpeg', quality: 74 });
    await st.evaluate((el) => el.remove());
  }
  const html = await page.evaluate(() => {
    const app = document.getElementById('app').cloneNode(true);
    for (const h of app.querySelectorAll('.wc-start-skyhost')) h.innerHTML = '';
    for (const c of app.querySelectorAll('canvas')) c.remove();
    return app.outerHTML;
  });
  fs.writeFileSync(path.join(out, `${v}-${name}.html`), html);
}

const PAGES = [
  ['history', 'history', '.wc-hist .wc-lk-tr'],
  ['spotlights', 'spotlights', '.wc-spw-card'],
  ['credits', 'diary', '.wc-cred-book[data-ready="true"]'],
];

async function view(b, v, ctxOpts, touch, pages) {
  const c = await b.newContext(ctxOpts);
  const p = await c.newPage();
  p.on('pageerror', (e) => console.log(v, 'page error:', e.message));
  await p.clock.setSystemTime(NOW);
  await p.goto(U);
  await p.waitForSelector('.wc-sm-item');
  console.log(v, JSON.stringify(await seed(p)));
  await skeleton(p, v, 'main', true);
  const attrs = await p.evaluate(() => Object.fromEntries([...document.documentElement.attributes].map((a) => [a.name, a.value])));
  fs.writeFileSync(path.join(out, `${v}-html.json`), JSON.stringify(attrs, null, 1));
  for (const [key, name, ready] of pages ? PAGES : []) {
    const row = p.locator(`.wc-sm-item[data-key="${key}"]`);
    if (touch) await row.tap();
    else await row.click();
    await p.waitForSelector(`.wc-start .wc-frame:not([hidden]) ${ready}`);
    await skeleton(p, v, name, false);
    if (touch) await p.locator('.wc-start .wc-frame:not([hidden]) .wc-lk-back').first().tap();
    else await p.keyboard.press('Escape');
    await p.waitForSelector('.wc-start .wc-frame:not([hidden]) .wc-sm-item');
    await p.waitForTimeout(900);
  }
  return { c, p };
}

const b = await chromium.launch();

// ---------------------------------------------------------------- desktop
{
  const { c, p } = await view(b, 'd', { viewport: { width: 1440, height: 900 } }, false, true);
  // The kit gallery: the icons by name, and the controls' CSS (the tabs).
  await p.goto(`${U}&kit=controls`);
  await p.waitForSelector('.wc-kitc-icons');
  await p.waitForTimeout(1500);
  await collectCss(p);
  const icons = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.wc-kitc-icons li[data-icon]')].map((li) => [li.dataset.icon, li.querySelector('svg').outerHTML])));
  const tabs = await p.evaluate(() => document.querySelector('.wc-lk-tabs')?.outerHTML ?? '');
  fs.writeFileSync(path.join(out, 'icons.json'), JSON.stringify({ icons, tabs }, null, 1));
  await c.close();
}

// ------------------------------------------------------------------ phone
const phone = { ...devices['iPhone 13'], deviceScaleFactor: 2 };
{
  const { c, p } = await view(b, 'p', { ...phone, viewport: { width: 390, height: 844 } }, true, true);
  await p.goto(`${U}&kit=controls`);
  await p.waitForTimeout(2500);
  await collectCss(p);
  await c.close();
}
{
  const { c } = await view(b, 'l', { ...phone, viewport: { width: 844, height: 390 } }, true, false);
  await c.close();
}
{
  const { c } = await view(b, 't', { ...devices['iPad (gen 7)'], viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2 }, true, true);
  await c.close();
}
await b.close();
for (const s of sheets) s.id = s.id.replace(/^.*\/(src\/)/, '$1');
fs.writeFileSync(path.join(out, 'css.json'), JSON.stringify(sheets));
console.log(sheets.map((s) => `${s.id} ${s.css.length}`).join('\n'));
