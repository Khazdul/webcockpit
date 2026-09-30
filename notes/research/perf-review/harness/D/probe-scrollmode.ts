// Entering / leaving scroll mode at full scrollback (perf review D).
//
//   node perf/probe-scrollmode.ts [--browser chromium|firefox] [--port 4236] [--fix]
//
// `.wc-scroller.wc-scrolled { scrollbar-color: auto }` (src/ui/ui.css) toggles
// an inherited property on the scroller when the user scrolls back (PgUp,
// wheel) and when they return to the tail. Every row then gets its style
// recalculated. Fills the output with N rows (2 000 and 20 000) from loop 0,
// then times the frame after pageUp() (enter), pageUp() (already scrolled),
// toTail() (leave): from the call to after that frame's paint. `--fix`
// injects `.wc-rows { scrollbar-color: auto }`, which stops the inherited
// change at the rows container.

import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : def;
};
const BROWSER = opt('browser', 'chromium');
const PORT = Number(opt('port', '4236'));
const FIX = args.includes('--fix');
const root = new URL('..', import.meta.url).pathname;
const { chromium, firefox } = await import('@playwright/test');
const { preview } = await import('vite');
const server = await preview({ root, preview: { port: PORT, strictPort: true }, logLevel: 'warn' });
const isChromium = BROWSER === 'chromium';
const browser = await (isChromium ? chromium : firefox).launch(isChromium ? {} : { firefoxUserPrefs: { 'layout.css.devPixelsPerPx': '2' } });
console.log(`${BROWSER} ${browser.version()} fix ${FIX} loadavg ${readFileSync('/proc/loadavg', 'utf8').trim()}`);
for (const rows of [2000, 20000]) {
  const ctx = await browser.newContext({ viewport: { width: 1728, height: 1050 }, ...(isChromium ? { deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}/?bench`);
  await page.waitForFunction(() => (window as any).__wcBench?.app != null);
  await page.evaluate(() => (window as any).__wcBench.settings.update({ panes: { map: { on: false } } }));
  await page.evaluate(readFileSync(new URL('./soak-page.js', import.meta.url), 'utf8'));
  await page.evaluate(() => (window as any).__soak.load(0));
  await page.evaluate(() => (window as any).__wcBench.connectFake());
  if (FIX) await page.addStyleTag({ content: '.wc-rows { scrollbar-color: auto; }' });
  const r = await page.evaluate(async (want) => {
    const B = (window as any).__wcBench;
    const L = (window as any).__soak.loops[0];
    let i = 0;
    while (B.app.output.rows < want && i < L.n) {
      const stop = performance.now() + 8;
      while (performance.now() < stop && i < L.n && B.app.output.rows < want) {
        if (L.len[i] > 0) B.sock.onData(L.bytes.subarray(L.off[i], L.off[i] + L.len[i]));
        i++;
      }
      await new Promise((res) => requestAnimationFrame(res));
    }
    await B.drained();
    const out = B.app.output;
    const ch = new MessageChannel();
    const afterPaint = () =>
      new Promise<number>((res) => {
        requestAnimationFrame(() => {
          ch.port1.onmessage = () => res(performance.now());
          ch.port2.postMessage(null);
        });
      });
    const time = async (f: () => void) => {
      await new Promise((res) => setTimeout(res, 300));
      const t0 = performance.now();
      f();
      const t1 = await afterPaint();
      return +(t1 - t0).toFixed(1);
    };
    const res: Record<string, number[]> = { enter: [], again: [], leave: [] };
    for (let k = 0; k < 5; k++) {
      res.enter!.push(await time(() => out.pageUp()));
      res.again!.push(await time(() => out.pageUp()));
      res.leave!.push(await time(() => out.toTail()));
    }
    return { rows: out.rows, elements: document.getElementsByTagName('*').length, res };
  }, rows);
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  console.log(
    `rows ${r.rows} (elements ${r.elements}): enter scroll mode med ${med(r.res.enter!)} ms [${r.res.enter!.join(', ')}]; pageUp while scrolled med ${med(r.res.again!)} [${r.res.again!.join(', ')}]; leave med ${med(r.res.leave!)} [${r.res.leave!.join(', ')}]`,
  );
  await ctx.close();
}
await browser.close();
await new Promise<void>((res) => server.httpServer.close(() => res()));
