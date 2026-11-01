import { chromium, phoneCtx, live, startPage, sleep, OUT } from './lib.ts';
const OF = '.wc-overlay .wc-frame:not([hidden])';
const b = await chromium.launch();
{ const { ctx, page } = await phoneCtx(b); await startPage(page); await sleep(3500); await page.screenshot({ path: OUT + '01-start-dark.png' });
  const m = await page.evaluate(() => [...document.querySelectorAll('.wc-start .wc-frame:not([hidden]) .wc-mrow')].map((e) => { const r = e.getBoundingClientRect(); return `${e.textContent?.trim()} ${Math.round(r.width)}x${Math.round(r.height)}`; }));
  console.log('start rows', m);
  await page.setViewportSize({ width: 844, height: 390 }); await sleep(3000); await page.screenshot({ path: OUT + '54-landscape-start.png' });
  await ctx.close(); }
const { ctx, page } = await phoneCtx(b);
await live(page); await sleep(800);
const box = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].slice(0, 8).map((e) => { const r = e.getBoundingClientRect(); return `${(e.textContent ?? '').trim().slice(0, 12)} ${Math.round(r.width)}x${Math.round(r.height)}`; }), sel);
console.log('tabs', await box('.wc-phone-tab'));
console.log('menu-btn', await box('.wc-menu-btn'));
console.log('input', await box('.wc-input-slot'));
console.log('fs', await page.evaluate(() => [...document.querySelectorAll('[class*=fullscreen], [class*=wc-fs]')].map((e) => e.className + ' ' + JSON.stringify(e.getBoundingClientRect()))));
await page.locator('.wc-phone-tab[data-tab="comm"]').tap(); await sleep(400);
console.log('comm chips', await box('.wc-pane[data-pane="comm"] [data-chan], .wc-pane[data-pane="comm"] .wc-comm-tab'));
await page.locator('.wc-phone-tab[data-tab="game"]').tap();
await page.locator('.wc-menu-btn').tap(); await sleep(500);
console.log('esc rows', await box(`${OF} .wc-mrow`));
console.log('esc footer btns', await box(`${OF} .wc-esc-btn`));
await page.locator(`${OF} .wc-mrow[data-key="exit"] .wc-label`).tap(); await sleep(500);
console.log('exit footer btns', await box(`${OF} .wc-esc-btn`), await box(`${OF} .wc-star, ${OF} [data-star]`));
await page.keyboard.press('Escape'); await sleep(300);
await page.locator(`${OF} .wc-mrow[data-key="options"] .wc-label`).tap(); await sleep(400);
await page.locator(`${OF} .wc-mrow[data-key="panes"] .wc-label`).tap(); await sleep(400);
const keys = await page.locator(`${OF} .wc-mrow`).evaluateAll((els) => els.map((e) => e.getAttribute('data-key')));
let n = 55;
for (const k of keys) {
  if (!k || k === 'back') continue;
  await page.locator(`${OF} .wc-mrow[data-key="${k}"] .wc-label`).tap(); await sleep(600);
  const f = `${n++}-esc-options-panes-${k}.png`; await page.screenshot({ path: OUT + f }); console.log(f);
  await page.keyboard.press('Escape'); await sleep(400);
}
// appearance: tap a cycler row to see what a tap does
await page.keyboard.press('Escape'); await sleep(300);
await page.locator(`${OF} .wc-mrow[data-key="appearance"] .wc-label`).tap(); await sleep(400);
const before = await page.locator(`${OF} .wc-mrow`).nth(1).textContent();
await page.locator(`${OF} .wc-mrow`).nth(1).locator('.wc-label').tap(); await sleep(400);
const after = await page.locator(`${OF} .wc-mrow`).nth(1).textContent();
console.log('tap on cycler row:', before, '->', after);
await page.locator(`${OF} .wc-mrow`).nth(1).locator('.wc-label').tap(); await sleep(400);
console.log('second tap:', await page.locator(`${OF} .wc-mrow`).nth(1).textContent());
await ctx.close(); await b.close();
