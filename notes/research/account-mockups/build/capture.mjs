// Captures the real look from a running dev server into build/skel/, so the
// mockups sit in the true DOM and CSS of the start page, a kit page and a
// kit dialog (desktop and phone). Throwaway tooling for the mockups only.
//
//   npx vite --port 5393 --strictPort      (never 5173)
//   node notes/research/account-mockups/build/capture.mjs [http://localhost:5393]
//
// Writes, per view (d = desktop, p = phone):
//   <v>-html.json            the <html> element's attributes (the theme's custom properties)
//   <v>-main|sub|dialog.html `#app` with the sky emptied (the sky is a still image here)
//   <v>-sky-main|sub.jpg     the sky alone
// and css.json (every stylesheet seen, in order), icons.json (the kit's
// icons by name), p-sheet.html + p-game.jpg (the phone's in-game menu sheet).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '../../../../node_modules/@playwright/test/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'skel');
const BASE = process.argv[2] ?? 'http://localhost:5393';
// One fixed dusk sky on every load (src/start/sky/params.ts).
const SKY = 'skyHour=19.1&skyMonth=0&skyDay=21&skyYear=3040&skyFreeze';
const U = `${BASE}/?${SKY}`;
fs.mkdirSync(out, { recursive: true });

// The stylesheets as the dev server serves them: the source text of each
// <style data-vite-dev-id> (the CSSOM's cssText loses shorthands that hold
// a var(), such as the iron's background).
const sheets = [];
async function collectCss(page) {
  const list = await page.evaluate(() => [...document.querySelectorAll('style')].map((s) => ({ id: s.getAttribute('data-vite-dev-id') || '', css: s.textContent })));
  for (const s of list) if (s.css && !sheets.some((x) => x.id === s.id && x.css === s.css)) sheets.push(s);
}

async function skeleton(page, v, name, sky) {
  await page.waitForTimeout(4000);
  await collectCss(page);
  if (sky) {
    const st = await page.addStyleTag({
      content: '.wc-start > :not(.wc-start-skyhost), .wc-okb-page, .wc-menu-host, .wc-ph-fs, [class*="fullscreen"] { visibility: hidden !important; }',
    });
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(out, `${v}-sky-${name}.jpg`), type: 'jpeg', quality: 74 });
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

async function htmlAttrs(page, v) {
  const attrs = await page.evaluate(() => Object.fromEntries([...document.documentElement.attributes].map((a) => [a.name, a.value])));
  fs.writeFileSync(path.join(out, `${v}-html.json`), JSON.stringify(attrs, null, 1));
}

const b = await chromium.launch();

// ---------------------------------------------------------------- desktop
{
  const c = await b.newContext({ viewport: { width: 1600, height: 1000 } });
  const p = await c.newPage();
  await p.goto(U);
  await p.waitForSelector('.wc-sm-item');
  await skeleton(p, 'd', 'main', true);
  await htmlAttrs(p, 'd');
  await p.keyboard.press('p');
  await skeleton(p, 'd', 'sub', true);
  await p.keyboard.press('n');
  await skeleton(p, 'd', 'dialog', false);
  // The kit gallery: the icons by name, and the controls' CSS.
  await p.goto(`${U}&kit=controls`);
  await p.waitForSelector('.wc-kitc-icons');
  await p.waitForTimeout(1500);
  await collectCss(p);
  const icons = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.wc-kitc-icons li[data-icon]')].map((li) => [li.dataset.icon, li.querySelector('svg').outerHTML])));
  const btnIcons = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.wc-lk-btn[data-btn]')].filter((x) => x.querySelector('svg')).map((x) => [x.dataset.btn, x.querySelector('svg').outerHTML])));
  const back = await p.evaluate(() => document.querySelector('.wc-lk-back').outerHTML);
  fs.writeFileSync(path.join(out, 'icons.json'), JSON.stringify({ icons, btnIcons, back }, null, 1));
  await p.goto(`${U}&kit=overlays`);
  await p.waitForTimeout(2000);
  await collectCss(p);
  await c.close();
}

// ------------------------------------------------------------------ phone
{
  const c = await b.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  await p.goto(U);
  await p.waitForSelector('.wc-sm-item');
  await skeleton(p, 'p', 'main', true);
  await htmlAttrs(p, 'p');
  await p.locator('.wc-sm-item[data-key="profile"]').tap();
  await skeleton(p, 'p', 'sub', true);
  await p.locator('[data-btn="NEW"]').first().tap();
  await skeleton(p, 'p', 'dialog', false);
  await p.goto(`${U}&kit=controls`);
  await p.waitForTimeout(2500);
  await collectCss(p);
  // The in-game menu sheet, over a mocked server's first prompt.
  await p.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    ws.send(Buffer.concat([Buffer.from([255, 251, 201]), Buffer.from('\r\nBy what name do you wish to be known? ')]));
  });
  await p.goto(U);
  await p.waitForSelector('.wc-sm-item');
  await p.waitForTimeout(1500);
  await p.locator('.wc-sm-item[data-key="enter"]').tap();
  await p.waitForTimeout(3000);
  await p.screenshot({ path: path.join(out, 'p-game.jpg'), type: 'jpeg', quality: 70 });
  await p.locator('.wc-ph-menu').tap();
  await p.waitForTimeout(1000);
  await collectCss(p);
  const sheet = await p.evaluate(() => {
    const el = document.querySelector('.wc-ph-sheet');
    const chain = [];
    for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      chain.unshift({ tag: n.tagName.toLowerCase(), attrs: Object.fromEntries([...n.attributes].map((a) => [a.name, a.value])) });
    }
    const sibs = [...el.parentElement.children].filter((x) => x !== el).map((x) => x.outerHTML.slice(0, 400));
    const cs = getComputedStyle(el);
    return { html: el.outerHTML, chain, sibs, pos: { position: cs.position, bottom: cs.bottom, left: cs.left, width: cs.width, height: cs.height } };
  });
  fs.writeFileSync(path.join(out, 'p-sheet.json'), JSON.stringify(sheet, null, 1));
  await p.screenshot({ path: path.join(out, 'p-sheet-real.jpg'), type: 'jpeg', quality: 70 });
  await c.close();
}
await b.close();
for (const s of sheets) s.id = s.id.replace(/^.*\/(src\/)/, '$1');
fs.writeFileSync(path.join(out, 'css.json'), JSON.stringify(sheets));
console.log(sheets.map((s) => `${s.id} ${s.css.length}`).join('\n'));
