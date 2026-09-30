// DOM churn per component at the live rate (perf review D): how many DOM
// nodes each part of the screen creates per minute of play, i.e. the garbage
// the GC has to collect in a long session.
//
//   node perf/churn.ts [--browser chromium|firefox] [--speed 1] [--seconds 120] [--from 0.4] [--port 4238] [--no-build]
//
// Production `?bench`, profile khazdul, all panes on (map too). Loop 0 of the
// soak data is played from `from` × its length at `speed` (1 = the log's own
// pace, gaps capped at 2 s) with the commands typed; a MutationObserver per
// pane content element and on the output rows counts the nodes added
// (subtrees included) and removed. The scrollback is filled first.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { TRACE_CATEGORIES, formatTrace, summarizeTrace } from './trace-summary.ts';

const args = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : def;
};
const BROWSER = opt('browser', 'chromium');
const PORT = Number(opt('port', '4238'));
const SPEED = Number(opt('speed', '1'));
const SECONDS = Number(opt('seconds', '120'));
const FROM = Number(opt('from', '0.4'));
const TRACE = args.includes('--trace');
const OBSERVE = !args.includes('--no-observe');
const SCRATCH = '/tmp/claude-1000/-home-ole-proj-webcockpit/839d0ad2-3f20-4e68-a808-1e236720a92c/scratchpad/perf/D';
const root = new URL('..', import.meta.url).pathname;
if (!args.includes('--no-build')) execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'ignore' });
if (!existsSync(`${root}dist/__soak/loop0.bin`)) execFileSync('node', ['perf/soak-gen.ts'], { cwd: root, stdio: 'inherit' });

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
await page.evaluate(() => (window as any).__soak.load(0));
await page.evaluate(() => {
  const B = (window as any).__wcBench;
  B.connectFake();
  B.app.offline = false;
});
await page.waitForFunction(() => (window as any).__wcBench.app.writeBack?.target === 'khazdul', undefined, { timeout: 10000 });
console.log(`${BROWSER} ${browser.version()} loadavg ${readFileSync('/proc/loadavg', 'utf8').trim()}`);

// Fill the scrollback fast (to FROM × loop), then observe at SPEED.
const n = await page.evaluate(() => (window as any).__soak.loops[0].n);
const from = Math.floor(n * FROM);
await page.evaluate(([f]) => (window as any).__soak.play(0, 300, 0, f), [from]);
await page.evaluate(() => (window as any).__wcBench.drained());
if (TRACE && isChromium) await browser.startTracing(page, { categories: TRACE_CATEGORIES });
const res = await page.evaluate(
  async ({ from, speed, seconds, observe }) => {
    const B = (window as any).__wcBench;
    const S = (window as any).__soak;
    const count = (nodes: NodeList): number => {
      let k = 0;
      nodes.forEach((nd) => {
        k++;
        if (nd.nodeType === 1) {
          const w = document.createTreeWalker(nd, NodeFilter.SHOW_ALL);
          while (w.nextNode()) k++;
        }
      });
      return k;
    };
    const targets: Record<string, Element> = {};
    for (const p of document.querySelectorAll('.wc-pane')) targets[(p as HTMLElement).dataset.pane!] = p.querySelector('.wc-pane-content')!;
    targets.output = document.querySelector('.wc-output')!;
    targets.input = document.querySelector('.wc-input')!;
    const stats: Record<string, { added: number; removed: number; records: number }> = {};
    const obs: MutationObserver[] = [];
    for (const [name, el] of Object.entries(observe ? targets : {})) {
      const s = (stats[name] = { added: 0, removed: 0, records: 0 });
      const o = new MutationObserver((recs) => {
        for (const r of recs) {
          s.records++;
          if (r.type === 'childList') {
            s.added += count(r.addedNodes);
            s.removed += r.removedNodes.length;
          }
        }
      });
      o.observe(el, { childList: true, subtree: true, characterData: true });
      obs.push(o);
    }
    const L = S.loops[0];
    const t0 = performance.now();
    let to = from;
    while (to < L.n && L.at[to] - L.at[from] < seconds * 1000 * speed) to++;
    await S.play(0, speed, from, to);
    const wall = (performance.now() - t0) / 1000;
    obs.forEach((o) => o.disconnect());
    return { wall, frames: to - from, stats, rows: B.app.output.rows };
  },
  { from, speed: SPEED, seconds: SECONDS, observe: OBSERVE },
);
if (TRACE && isChromium) {
  const buf = await browser.stopTracing();
  if (args.includes('--save-trace')) writeFileSync(`${SCRATCH}/churn-${BROWSER}-x${SPEED}.trace.json`, buf);
  const t = summarizeTrace(buf, `churn x${SPEED} ${SECONDS}s`);
  (res as any).trace = t;
  console.log(formatTrace(t));
}
const perMin = (x: number): string => ((x * 60) / res.wall).toFixed(0);
console.log(`played ${res.frames} frames in ${res.wall.toFixed(1)} s (speed ${SPEED}); nodes added per minute (removed-subtree roots per minute), mutation records per minute:`);
for (const [k, s] of Object.entries(res.stats as Record<string, { added: number; removed: number; records: number }>)) {
  console.log(`  ${k.padEnd(10)} ${perMin(s.added).padStart(8)} (${perMin(s.removed)})  ${perMin(s.records)}`);
}
writeFileSync(`${SCRATCH}/churn-${BROWSER}-x${SPEED}${TRACE ? '-trace' : ''}.json`, JSON.stringify(res, null, 1));
await browser.close();
await new Promise<void>((r) => server.httpServer.close(() => r()));
