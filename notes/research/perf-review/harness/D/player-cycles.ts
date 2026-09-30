// Log player open / close cycles (perf review D, question 4).
//
//   node perf/player-cycles.ts [--browser chromium|firefox] [--cycles 15] [--port 4234] [--no-build] [--no-map]
//
// Production `?bench` page with perf/instrument.js. The player-host chunk is
// imported from dist/assets (the same module the shell loads on RUN LOG)
// and a PlayerHost plays the synthesized loop-2 capture (the owner's
// 3.2 MB log with GMCP, perf/soak-gen.ts) as a one-run chain, as History
// would. Each cycle: open, play 2 s at 8×, seek forward to 60 % (fast-
// forward), seek back to 30 % (App rebuilt), wait for paint, close (ESC
// path: `host.close()`). After every cycle: live timers / intervals /
// listeners / observers / workers (instrument.js), DOM element count,
// Chromium heap and DOM counters after a forced GC.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : def;
};
const BROWSER = opt('browser', 'chromium');
const PORT = Number(opt('port', '4234'));
const CYCLES = Number(opt('cycles', '15'));
const NO_MAP = args.includes('--no-map');
const SCRATCH = '/tmp/claude-1000/-home-ole-proj-webcockpit/839d0ad2-3f20-4e68-a808-1e236720a92c/scratchpad/perf/D';
const root = new URL('..', import.meta.url).pathname;
if (!args.includes('--no-build')) execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'ignore' });
const DIST = opt("dist", "dist");
if (!existsSync(`${root}${DIST}/__soak/loop2.log`)) execFileSync("node", ["perf/soak-gen.ts", `${root}${DIST}/__soak`], { cwd: root, stdio: "inherit" });
const chunk = readdirSync(`${root}${DIST}/assets`).find((f) => /^player-host-.*\.js$/.test(f));
// The shell's dynamic import loads the chunk's CSS through Vite's preload
// helper; importing the chunk directly needs the stylesheet added by hand.
const css = readdirSync(`${root}${DIST}/assets`).find((f) => /^player-host-.*\.css$/.test(f));
if (!chunk || !css) throw new Error('no player-host chunk');

const { chromium, firefox } = await import('@playwright/test');
const { preview } = await import('vite');
const server = await preview({ root, build: { outDir: DIST }, preview: { port: PORT, strictPort: true }, logLevel: 'warn' });
const isChromium = BROWSER === 'chromium';
const browser = await (isChromium ? chromium : firefox).launch(
  isChromium ? { args: ['--enable-gpu', '--use-angle=vulkan'] } : { firefoxUserPrefs: { 'layout.css.devPixelsPerPx': '2' } },
);
const ctx = await browser.newContext({ viewport: { width: 1728, height: 1050 }, ...(isChromium ? { deviceScaleFactor: 2 } : {}) });
await ctx.addInitScript({ path: new URL('./instrument.js', import.meta.url).pathname });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
const cdp = isChromium ? await ctx.newCDPSession(page) : null;
await page.goto(`http://localhost:${PORT}/?bench`);
await page.waitForFunction(() => (window as any).__wcBench?.app != null);
console.log(`${BROWSER} ${browser.version()} loadavg ${readFileSync('/proc/loadavg', 'utf8').trim()}`);
await page.evaluate(
  async ({ chunk, css, noMap }) => {
    const B = (window as any).__wcBench;
    if (noMap) B.settings.update({ panes: { map: { on: false } } });
    // Hide the bench cockpit (the shell hides it while the player shows).
    B.app.el.style.display = 'none';
    await new Promise((res, rej) => {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = `/assets/${css}`;
      l.onload = res;
      l.onerror = rej;
      document.head.appendChild(l);
    });
    const mod = await import(`/assets/${chunk}`);
    const text = await fetch('/__soak/loop2.log').then((r) => r.text());
    const us = Number(text.slice(0, 16));
    (window as any).__player = { PlayerHost: mod.PlayerHost, chain: [{ meta: { runId: 'Rasta/p', character: 'Rasta', startedUs: us, endedUs: null, sealed: true, bytes: text.length, lines: 0 }, text }] };
  },
  { chunk, css, noMap: NO_MAP },
);

const snap = async (cycle: number) => {
  const o: any = await page.evaluate(() => ({
    inst: (window as any).__inst.counts(),
    elements: document.getElementsByTagName('*').length,
    players: document.querySelectorAll('.wc-player').length,
    apps: document.querySelectorAll('.wc-app').length,
  }));
  if (cdp) {
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('HeapProfiler.collectGarbage');
    o.heap = ((await cdp.send('Runtime.getHeapUsage')) as any).usedSize;
    o.dom = await cdp.send('Memory.getDOMCounters');
  }
  o.cycle = cycle;
  return o;
};

const rows: any[] = [await snap(0)];
console.log(`cycle 0: ${JSON.stringify(rows[0])}`);
const t0 = Date.now();
for (let c = 1; c <= CYCLES; c++) {
  const t = await page.evaluate(async () => {
    const P = (window as any).__player;
    const B = (window as any).__wcBench;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const a = performance.now();
    let closed = false;
    const host = new P.PlayerHost({ root: document.getElementById('app') ?? document.body, settings: B.settings, onClose: () => (closed = true) });
    host.openChain(P.chain, [], { character: 'Rasta' });
    const eng = host.engine;
    eng.setSpeed(8);
    await wait(2000);
    const until = async (f: () => boolean, ms = 20000) => {
      const end = performance.now() + ms;
      while (!f() && performance.now() < end) await wait(20);
    };
    eng.seek(eng.duration * 0.6);
    await until(() => !eng.seeking);
    await wait(1500);
    eng.seek(eng.duration * 0.3);
    await until(() => !eng.seeking);
    await wait(1500);
    const builds = eng.buildCount;
    host.close();
    await wait(300);
    return { ms: performance.now() - a, builds, closed };
  });
  const s = await snap(c);
  s.run = t;
  rows.push(s);
  console.log(
    `cycle ${c}: ${t.ms.toFixed(0)} ms, builds ${t.builds}; players ${s.players}, apps ${s.apps}, elements ${s.elements}, timeouts ${s.inst.timeouts}, intervals ${s.inst.intervals}, listeners ${JSON.stringify(s.inst.listeners)}, ro ${s.inst.roObserving}/${s.inst.ro}, workers alive ${s.inst.workersAlive}/${s.inst.workers}, channels ${s.inst.channels}` +
      (cdp ? `, heap ${(s.heap / 1e6).toFixed(2)} MB, nodes ${s.dom.nodes}, docs ${s.dom.documents}, listeners ${s.dom.jsEventListeners}` : ''),
  );
}
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
writeFileSync(`${SCRATCH}/player-cycles-${BROWSER}${NO_MAP ? '-nomap' : ''}.json`, JSON.stringify(rows, null, 1));
await browser.close();
await new Promise<void>((r) => server.httpServer.close(() => r()));
