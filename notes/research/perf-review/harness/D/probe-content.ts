// Is a slower probe late in the soak session age or content? (perf review D)
//
//   node perf/probe-content.ts [--browser firefox|chromium] [--order 0,1,2,0] [--port 4239] [--no-build]
//
// One `?bench` page (khazdul, all panes on). For each loop k in `order`:
// refill the scrollback with ~26 000 lines of loop k from its middle (at max
// speed, commands typed), then run the soak probe (the same fixed std frames,
// 24-bit colour block, burst, key → send). If the last entry (a repeat of
// the first) is as fast as the first, a slowdown seen after loop k is the
// content, not the session's age.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : def;
};
const BROWSER = opt('browser', 'firefox');
const PORT = Number(opt('port', '4239'));
const ORDER = opt('order', '0,1,2,0').split(',').map(Number);
const SCRATCH = '/tmp/claude-1000/-home-ole-proj-webcockpit/839d0ad2-3f20-4e68-a808-1e236720a92c/scratchpad/perf/D';
const root = new URL('..', import.meta.url).pathname;
if (!args.includes('--no-build')) execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'ignore' });

const { chromium, firefox } = await import('@playwright/test');
const { preview } = await import('vite');
const server = await preview({ root, preview: { port: PORT, strictPort: true }, logLevel: 'warn' });
const isChromium = BROWSER === 'chromium';
const browser = await (isChromium ? chromium : firefox).launch(
  isChromium ? { args: ['--enable-gpu', '--use-angle=vulkan'] } : { firefoxUserPrefs: { 'layout.css.devPixelsPerPx': '2' } },
);
const ctx = await browser.newContext({ viewport: { width: 1728, height: 1050 }, ...(isChromium ? { deviceScaleFactor: 2 } : {}) });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`http://localhost:${PORT}/?bench`);
await page.waitForFunction(() => (window as any).__wcBench?.app != null);
await page.waitForFunction(async () => ((await (window as any).__wcBench.app.profiles?.get('khazdul')) ?? null) !== null);
await page.evaluate(() => (window as any).__wcBench.settings.update({ profile: 'khazdul' }));
await page.evaluate(readFileSync(new URL('./soak-page.js', import.meta.url), 'utf8'));
for (const k of new Set(ORDER)) await page.evaluate((k) => (window as any).__soak.load(k), k);
await page.evaluate(() => {
  const B = (window as any).__wcBench;
  B.connectFake();
  B.app.offline = false;
});
// The login preamble is at the start of loop 0.
await page.evaluate(() => (window as any).__soak.play(0, 1000, 0, 50));
console.log(`${BROWSER} ${browser.version()} loadavg ${readFileSync('/proc/loadavg', 'utf8').trim()}`);
const out: unknown[] = [];
for (const k of ORDER) {
  const r = await page.evaluate(async (k) => {
    const S = (window as any).__soak;
    const L = S.loops[k];
    const from = Math.floor(L.n * 0.5);
    // ~26 000 lines: frames until the output has had that many rows added
    const B = (window as any).__wcBench;
    let to = from;
    let bytes = 0;
    while (to < L.n && bytes < 2_600_000) bytes += L.len[to++];
    await S.play(k, 400, from, to);
    await B.drained();
    const p = await S.probe({ idleMs: 3000 });
    return { k, rows: B.app.output.rows, spans: document.querySelectorAll('.wc-output span').length, elements: document.getElementsByTagName('*').length, p };
  }, k);
  out.push(r);
  const p = (r as any).p;
  console.log(
    `after loop ${k}: rows ${(r as any).rows}, spans ${(r as any).spans}, elements ${(r as any).elements}; std flush med ${p.std.script.med.toFixed(2)} p95 ${p.std.script.p95.toFixed(2)}, frame med ${p.std.frame.med.toFixed(2)} p95 ${p.std.frame.p95.toFixed(2)}; rgb ${p.rgb.script.med.toFixed(1)}/${p.rgb.frame.med.toFixed(1)}; burst ${p.burst.ms.toFixed(0)} ms gapMax ${p.burst.gapMax.toFixed(1)}; key med ${p.key.med.toFixed(3)} p99 ${p.key.p99.toFixed(3)}; load ${readFileSync('/proc/loadavg', 'utf8').split(' ')[0]}`,
  );
}
writeFileSync(`${SCRATCH}/probe-content-${BROWSER}.json`, JSON.stringify(out, null, 1));
await browser.close();
await new Promise<void>((r) => server.httpServer.close(() => r()));
