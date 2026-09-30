// DOM census of a payload in a variant: rows, gradient rows, spans, CSS text size.
//   node perf/census.ts [--variant bgrow] [--payload p24b] [--browser firefox] [--port 4206]
import { launch, openBench, startServer, type BrowserName } from './lib.ts';
import { installPerf } from './page-helpers.ts';
import { oneShot, payloads } from './payloads.ts';

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1]! : d;
};
const PORT = Number(arg('port', '4206'));
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
const server = await startServer(new URL('./dists/', import.meta.url).pathname, PORT);
const l = await launch(arg('browser', 'firefox') as BrowserName);
try {
  const page = await openBench(l, `http://127.0.0.1:${PORT}/${arg('variant', 'bgrow')}/?bench`);
  await page.evaluate(installPerf);
  await page.evaluate(() => (window as any).__perf.connect());
  for (const name of arg('payload', 'p24a,p24b').split(',')) {
    const before = await page.evaluate(() => document.querySelectorAll('.wc-rows .wc-row').length);
    const p = payloads().find((x) => x.name === name)!;
    await page.evaluate((s) => (window as any).__perf.inject(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))), b64(oneShot(p.lines)));
    await page.evaluate(() => (window as any).__perf.drained());
    const c = await page.evaluate((b) => {
      const rows = [...document.querySelectorAll<HTMLElement>('.wc-rows .wc-row')].slice(b);
      const grad = rows.filter((r) => r.style.backgroundImage.includes('gradient'));
      return {
        rows: rows.length,
        gradientRows: grad.length,
        spans: rows.reduce((a, r) => a + r.querySelectorAll('span').length, 0),
        spanRows: rows.filter((r) => r.querySelector('span')).map((r) => `${r.textContent!.slice(0, 20)}… (${r.querySelectorAll('span').length})`).slice(0, 8),
        cssBytes: grad.reduce((a, r) => a + (r.getAttribute('style') ?? '').length, 0),
      };
    }, before);
    console.log(name, JSON.stringify(c));
  }
} finally {
  await l.browser.close();
  server.close();
}
