// Why splitting a heavy page over frames did not help (c-ab run-budget):
// is a frame's rendering cost set by the rows it adds, or by what is on
// screen? One plain line per frame is appended (a) while the viewport is
// full of 24-bit colour rows and (b) while it holds plain text only.
//
//   node perf/c-render-probe.ts [--browsers chromium,firefox] [--n 30]
import { f, launch, loadavg, openApp, pause, pct, ROOT, startServer, type BrowserName } from './lib.ts';
import { helpPages } from './c-feeds.ts';
import { resolve } from 'node:path';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i]!.replace(/^--/, ''), process.argv[i + 1] ?? '');
const browsers = (args.get('browsers') ?? 'chromium,firefox').split(',') as BrowserName[];
const N = Number(args.get('n') ?? 30);
const server = await startServer(resolve(ROOT, 'dist'), 4221, true);
const help = helpPages();
console.log(`# one line per frame over a colour screen vs a plain screen, ${new Date().toISOString()}, loadavg ${loadavg()}`);

async function oneLineFrames(page: import('@playwright/test').Page, n: number): Promise<{ script: number[]; frame: number[] }> {
  const script: number[] = [];
  const frame: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = await page.evaluate((i) => (window as unknown as Record<string, any>).__wcBench.inject(`plain line ${i}\r\n`), i);
    script.push(r.script);
    frame.push(r.toPaint - (r.toFlush - r.script));
    await pause(60);
  }
  return { script, frame };
}

try {
  for (const name of browsers) {
    const browser = await launch(name);
    const page = await openApp(browser, name, 'http://127.0.0.1:4221');
    await page.evaluate(() => (window as unknown as Record<string, any>).__wcBench.connectFake());
    // (a) viewport full of colour rows.
    for (const p of help) await page.evaluate((t) => (window as unknown as Record<string, any>).__wcBench.inject(t), p);
    await pause(500);
    const colour = await oneLineFrames(page, N);
    // (b) push the colour rows out of view with plain text.
    let s = '';
    for (let i = 0; i < 120; i++) s += `A line of plain description text, number ${i}, about seventy characters.\r\n`;
    await page.evaluate((t) => (window as unknown as Record<string, any>).__wcBench.inject(t), s);
    await pause(500);
    const plain = await oneLineFrames(page, N);
    console.log(
      `- ${name} ${browser.version()}: one plain line per frame — over a colour screen: flush script median ${f(pct(colour.script, 50))} ms, frame (callback → rendered) median ${f(pct(colour.frame, 50))} / p95 ${f(pct(colour.frame, 95))} ms; over a plain screen: script ${f(pct(plain.script, 50))}, frame median ${f(pct(plain.frame, 50))} / p95 ${f(pct(plain.frame, 95))} ms`,
    );
    await browser.close();
  }
} finally {
  server.close();
}
