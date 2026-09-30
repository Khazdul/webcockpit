// Can a Playwright Firefox open about:memory, minimize memory and measure?
//   node perf/probe-aboutmemory.ts
const { firefox } = await import('@playwright/test');
const b = await firefox.launch();
const ctx = await b.newContext();
const p = await ctx.newPage();
await p.setContent('<div id=x></div>');
await p.evaluate(() => {
  const d = document.getElementById('x')!;
  for (let i = 0; i < 20000; i++) {
    const r = document.createElement('div');
    r.textContent = 'row ' + i;
    d.appendChild(r);
  }
});
const m = await ctx.newPage();
try {
  await m.goto('about:memory', { waitUntil: 'commit', timeout: 10000 }).catch((e) => console.log('goto', String(e).slice(0, 200)));
  await m.waitForTimeout(3000);
  console.log('url', m.url());
  console.log('title', await m.title().catch((e) => String(e)));
  const buttons = await m.$$eval('button', (bs) => bs.map((x) => x.textContent));
  console.log('buttons', JSON.stringify(buttons));
  await m.click('text=Minimize memory usage');
  await m.waitForTimeout(3000);
  await m.click('text=Measure');
  await m.waitForTimeout(5000);
  const text = await m.evaluate(() => document.body.innerText);
  console.log(text.length, text.slice(0, 3000));
} catch (e) {
  console.log('failed', String(e));
}
await b.close();
