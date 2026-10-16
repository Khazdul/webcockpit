// usage: node shot.mjs <effectId> <out.png> [waitMs] [js-to-eval-before-wait]
import { chromium } from '/home/ole/proj/webcockpit/node_modules/playwright/index.mjs';
const [,, id='', out='shot.png', wait='2500', pre=''] = process.argv;
const dir = new URL('.', import.meta.url).pathname;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs=[]; p.on('pageerror', e=>errs.push(String(e))); p.on('console', m=>{ if(m.type()==='error') errs.push(m.text()); });
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + (await import('fs')).readFileSync(dir+'index.html','utf8') + '</body></html>';
(await import('fs')).writeFileSync(dir+'_wrapped.html', html);
await p.goto('file://' + dir + '_wrapped.html#' + id);
await p.waitForTimeout(400);
if (pre) await p.evaluate(pre);
await p.waitForTimeout(+wait);
await p.screenshot({ path: out });
console.log('perf:', await p.textContent('#perf')); if(errs.length) console.log('ERRORS:', errs.join('\n'));
await b.close();
