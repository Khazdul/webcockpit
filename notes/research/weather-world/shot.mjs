// usage: node shot.mjs '<state json for WX.jump>' <out.png> [waitMs] [jsBeforeWait] [onlyModules comma list]
// example: node shot.mjs '{"weather":"\"","light":")","clock":"night"}' /abs/wx3/shots/x.png 3000 "WX.emit('strike')" weather
import { chromium } from '/home/ole/proj/webcockpit/node_modules/playwright/index.mjs';
import fs from 'fs';
const [,, state = '{}', out = 'shot.png', wait = '2500', pre = '', only = ''] = process.argv;
const dir = new URL('.', import.meta.url).pathname;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const name = '_wrapped' + process.pid + '.html';
fs.writeFileSync(dir + name, '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + fs.readFileSync(dir + 'index.html', 'utf8') + '</body></html>');
await p.goto('file://' + dir + name);
await p.waitForTimeout(400);
if (only) await p.evaluate((only) => { const keep = only.split(','); document.querySelectorAll('#modList input').forEach(i => { if (!keep.includes(i.id.slice(4))) i.click(); }); }, only);
await p.evaluate((s) => WX.jump(JSON.parse(s)), state);
if (pre) await p.evaluate(pre);
await p.waitForTimeout(+wait);
await p.screenshot({ path: out });
console.log('perf:', await p.textContent('#perf')); if (errs.length) console.log('ERRORS:', errs.join('\n'));
fs.unlinkSync(dir + name);
await b.close();
