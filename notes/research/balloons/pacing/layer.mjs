// What a layer change costs, on its own, during the read: node layer.mjs <firefox|chromium> <reparent|zindex|none>
import { chromium, firefox } from '@playwright/test';
const [which = 'firefox', mode = 'reparent'] = process.argv.slice(2);
const browser = await (which === 'firefox' ? firefox : chromium).launch({ headless: false });
const page = await (await browser.newContext({ viewport: null })).newPage();
await page.goto('http://localhost:5199/?replay');
await page.locator('.wc-app').waitFor();
await page.evaluate(() => window.__wc.settings.update({ weather: { enabled: true, balloons: true } }));
await page.locator('.wc-cockpit > .wc-balloons').first().waitFor({ state: 'attached' });
await page.waitForTimeout(1500); if (mode.startsWith('zindex')) await page.evaluate(() => { document.querySelector('.wc-cockpit').style.isolation = 'isolate'; document.querySelector('canvas.wc-weather-back').style.zIndex = '-2'; }); await page.waitForTimeout(1000);
await page.locator('.wc-input-field').fill('#weather balloon great');
await page.keyboard.press('Enter');
const res = await page.evaluate((mode) => new Promise((done) => {
  const tr = []; let t0 = 0, acted = 0, info = '';
  const loop = (ts) => {
    t0 ||= ts; tr.push(ts);
    const b = document.querySelector('.wc-balloon');
    if (!acted && b && b.querySelector('.rig-at')) acted = -ts; // read began
    if (acted < 0 && ts + acted > 1200) {
      acted = ts;
      const front = document.querySelector('.wc-balloons-front'), sky = document.querySelector('.wc-balloons-sky'), back = document.querySelector('canvas.wc-weather-back');
      if (mode === 'reparent') sky.append(b);
      if (mode === 'zindex') { front.style.zIndex = '-1'; info = getComputedStyle(document.querySelector('.wc-cockpit')).isolation + '/' + getComputedStyle(document.querySelector('.wc-cockpit')).zIndex + '/' + getComputedStyle(document.querySelector('.wc-cockpit')).contain; }
      if (mode === 'zindex-pre') front.style.zIndex = '-1';
    }
    if (acted > 0 && ts - acted > 700) { const late = []; for (let i = 1; i < tr.length; i++) if (tr[i] - tr[i - 1] > 20) late.push(`${Math.round(tr[i - 1] - acted)}ms(+${Math.round(tr[i] - tr[i - 1])})`); return done(late.filter((s) => Math.abs(parseInt(s)) < 700).join(' ') + ' ' + info); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}), mode);
await page.screenshot({ path: `layer-${mode}.png` });
await browser.close();
console.log(`  ${which} ${mode.padEnd(9)} long frames within 0.7 s of the change (ms from it): ${res.trim() || 'none'}`);
