// Long main-thread frames of one balloon against its phase changes (stage 79): PORT=<port> node phases.mjs <firefox|chromium> 0 great 14 headed
// Prints LATE: when the read began (rig-at), when the balloon changed layer, and every frame over 20 ms.
import { chromium, firefox } from '@playwright/test';

const [which = 'firefox', dsf = '1', kind = 'great', secs = '22', headed = '', css = ''] = process.argv.slice(2);
const port = process.env.PORT ?? '5199';
const browser = await (which === 'firefox' ? firefox : chromium).launch({ headless: !headed });
const ctx = await browser.newContext(headed ? { viewport: null } : { viewport: { width: 1728, height: 1080 }, deviceScaleFactor: Number(dsf) });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:${port}/?replay`);
await page.locator('.wc-app').waitFor();
await page.evaluate(() => window.__wc.settings.update({ weather: { enabled: true, balloons: true } }));
await page.locator('.wc-cockpit > .wc-balloons').first().waitFor({ state: 'attached' });
await page.addStyleTag({ content: css || '/**/' }); await page.waitForTimeout(2500); console.log(await page.evaluate(() => [devicePixelRatio, innerWidth, innerHeight, document.visibilityState, document.hasFocus()].join(' ')));
await page.evaluate(() => {
  const tr = (window.__tr = []);
  const loop = (ts) => {
    const b = document.querySelector('.wc-balloon');
    tr.push([ts, performance.now(), b ? 'translate3d(0px, 0px' + (b.parentElement.className.includes('sky') ? 'S' : 'F') + (b.querySelector('.rig-at') ? 'A' : '') : '']);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});
await page.waitForTimeout(1500);
await page.locator('.wc-input-field').fill(`#weather balloon ${kind}`);
await page.keyboard.press('Enter');
await page.waitForTimeout(Number(secs) * 1000);
const tr = await page.evaluate(() => window.__tr);
await browser.close();

const stats = (name, fr) => {
  if (fr.length < 3) return console.log(`  ${name}: no frames`);
  const gaps = fr.slice(1).map((f, i) => f[0] - fr[i][0]);
  const s = [...gaps].sort((a, b) => a - b);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const q = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1);
  console.log(`  ${name.padEnd(8)} ${String(fr.length).padStart(5)} frames  mean ${(1000 / mean).toFixed(1)} fps  median ${q(0.5)}  p95 ${q(0.95)}  p99 ${q(0.99)}  worst ${s.at(-1).toFixed(1)} ms  >20ms: ${gaps.filter((g) => g > 20).length}  >30ms: ${gaps.filter((g) => g > 30).length}`);
};
const first = tr.findIndex((f) => f[2]);
console.log(`${which} dsf ${dsf} ${kind}${headed ? ' headed' : ''}: timestamps e.g. ${tr.slice(5, 9).map((f) => f[0]).join(', ')}`);
stats('before', tr.slice(0, first));
const up = tr.slice(first).filter((f) => f[2]);
const t0 = up[0][0];
const seg = (a, b) => up.filter((f) => f[0] - t0 >= a * 1000 && f[0] - t0 < b * 1000);
stats('0-3s', seg(0, 3));
stats('3-6s', seg(3, 6));
stats('6-10s', seg(6, 10));
stats('10-14s', seg(10, 14));
stats('14-end', seg(14, 999));
// The y the page wrote per frame against a local quadratic fit of time: how unevenly the position steps.
const pos = up.map((f) => { const m = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(f[2]); return m ? [f[0], +m[1], +m[2]] : null; }).filter(Boolean);
let dupl = 0;
for (let i = 1; i < pos.length; i++) if (pos[i][1] === pos[i - 1][1] && pos[i][2] === pos[i - 1][2]) dupl++;
console.log(`  frames whose written position equals the frame before: ${dupl} of ${pos.length}`);
if (errors.length) console.log('PAGE ERRORS', errors);
{ const per = []; for (let i = 1; i < up.length; i++) { const s = Math.floor((up[i][0] - t0) / 1000); per[s] = (per[s] ?? 0) + (up[i][0] - up[i - 1][0] > 20 ? Math.round((up[i][0] - up[i - 1][0]) / 16.67) - 1 : 0); } console.log('  PERSEC (lost frames per s) ' + Array.from(per, (v) => v ?? 0).map((v) => String(v ?? 0).padStart(2)).join(' ')); }

{ const sky = up.find((f) => f[2].includes('S')), at = up.find((f) => f[2].includes('A')); const late = []; for (let i = 1; i < up.length; i++) { const g = up[i][0] - up[i - 1][0]; if (g > 20) late.push(`${((up[i - 1][0] - t0) / 1000).toFixed(2)}s(+${Math.round(g)}ms)`); }
  console.log(`  LATE rig-at at ${at ? ((at[0] - t0) / 1000).toFixed(2) : '-'} s, to sky at ${sky ? ((sky[0] - t0) / 1000).toFixed(2) : '-'} s; long frames: ${late.join(' ') || 'none'}`); }
