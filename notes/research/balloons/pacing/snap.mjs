// Does a balloon render at sub-pixel positions, or snap? node snap.mjs <firefox|chromium> <dsf> [axis=y] [css='']
// Freezes one readable balloon, moves it 0.1 CSS px at a time, and compares the screenshots part by part.
import { chromium, firefox } from '@playwright/test';
import sharp from 'sharp';

const [which = 'firefox', dsfS = '2', axis = 'y', css = ''] = process.argv.slice(2);
const dsf = Number(dsfS);
const port = process.env.PORT ?? '5199';
const browser = await (which === 'firefox' ? firefox : chromium).launch();
const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 }, deviceScaleFactor: dsf });
const page = await ctx.newPage();
await page.addInitScript(() => { window.__raf = window.requestAnimationFrame.bind(window); });
await page.goto(`http://localhost:${port}/?replay`);
await page.locator('.wc-app').waitFor();
await page.evaluate(() => window.__wc.settings.update({ weather: { enabled: true, balloons: true } }));
await page.locator('.wc-cockpit > .wc-balloons').first().waitFor({ state: 'attached' });
await page.waitForTimeout(2500);
await page.locator('.wc-input-field').fill('#weather balloon great');
await page.keyboard.press('Enter');
await page.waitForTimeout(7600);
const base = await page.evaluate((css) => {
  window.requestAnimationFrame = () => 0;
  for (const a of document.getAnimations()) a.pause();
  const st = document.createElement('style');
  st.textContent = `.wc-game, canvas, .wc-input { visibility: hidden !important } body, .wc-cockpit { background: #223 !important } ${css}`;
  document.head.append(st);
  const b = document.querySelector('.wc-balloon');
  const m = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(b.style.transform);
  const q = (s) => { const r = b.querySelector(s).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
  return { x: Math.round(+m[1]), y: Math.round(+m[2]), tr: b.style.transform, layer: b.parentElement.className, parts: { envelope: q('.rig-envs'), sign: q('.rig-text'), car: q('.rig-car') }, box: (() => { const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })() };
}, css);
console.log(`${which} dsf ${dsf} axis ${axis} ${css ? '[' + css + ']' : ''}: ${base.layer}, was ${base.tr}`); console.log(JSON.stringify(base.parts), JSON.stringify(base.box));
const clip = { x: Math.floor(base.box.x) - 20, y: Math.floor(base.box.y) - 20, width: Math.ceil(base.box.w) + 40, height: Math.ceil(base.box.h) + 40 };
const shots = [];
const N = 21;
for (let k = 0; k < N; k++) {
  await page.evaluate(([x, y]) => new Promise((res) => {
    document.querySelector('.wc-balloon').style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(1.0000)`;
    window.__raf(() => window.__raf(() => window.__raf(res)));
  }), axis === 'x' ? [base.x + k * Number(process.env.STEP ?? 0.1), base.y] : [base.x, base.y + k * Number(process.env.STEP ?? 0.1)]);
  const png = await page.screenshot({ clip });
  if (k === 0 || k === N - 1) (await import('node:fs')).writeFileSync(`shot-${which}-${dsf}-${k}.png`, png);
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  shots.push({ data, w: info.width, h: info.height });
}
await browser.close();
// Rigid? Shot k+1 moved back by the step should equal shot k where the step is whole device pixels.
const sc = shots[0].w / clip.width, STEP = Number(process.env.STEP ?? 0.1);
const R = { x0: 30, y0: 30, x1: shots[0].w - 30, y1: shots[0].h - 30 };
const cmp = (a, b, dx, dy) => { let s = 0, n = 0, big = 0; for (let y = R.y0; y < R.y1; y++) for (let x = R.x0; x < R.x1; x++) { const d = Math.abs(a.data[y * a.w + x] - b.data[(y + dy) * a.w + x + dx]); s += d; n++; if (d > 24) big++; } return [s / n, (100 * big) / n]; };
const out = [];
for (let k = 0; k + 1 < shots.length; k++) { const sh = Math.round(STEP * sc); const [m, big] = axis === 'x' ? cmp(shots[k], shots[k + 1], sh, 0) : cmp(shots[k], shots[k + 1], 0, sh); out.push(`${m.toFixed(2)}/${big.toFixed(1)}%`); }
console.log(`  step ${STEP} css px (image scale ${sc}): mean abs difference / share of pixels off by >24 of 255, after moving back:`);
console.log('  ' + out.slice(0, 10).join('  '));
