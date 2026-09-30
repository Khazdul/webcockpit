// Disconnect / reconnect cycles (perf review D, question 4).
//
//   node perf/reconnect.ts [--browser chromium|firefox] [--cycles 100] [--port 4233] [--no-build]
//
// Production `?bench` page with perf/instrument.js as an init script. The
// session's socket factory is a fake socket, so `#reconnect` and
// `connectLive()` work offline. Each cycle: connect (alternately
// `#reconnect` and `connectLive()`), the login GMCP (Char.Name, Vitals,
// Group.Set, Comm.Channel.List), ~150 frames of play (loop 2 of the soak
// data: text, Vitals, Room.Info, Comm, Group.*), then a drop (alternately a
// server close and `#disconnect`). Every 10 cycles: bus handlers, live
// timers / intervals / global listeners / observers / workers
// (instrument.js), output rows, IndexedDB record counts, and in Chromium the
// JS heap and DOM counters after a forced GC.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : def;
};
const BROWSER = opt('browser', 'chromium');
const PORT = Number(opt('port', '4233'));
const CYCLES = Number(opt('cycles', '100'));
const SCRATCH = '/tmp/claude-1000/-home-ole-proj-webcockpit/839d0ad2-3f20-4e68-a808-1e236720a92c/scratchpad/perf/D';
const root = new URL('..', import.meta.url).pathname;
if (!args.includes('--no-build')) execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'ignore' });
if (!existsSync(`${root}dist/__soak/loop2.bin`)) execFileSync('node', ['perf/soak-gen.ts'], { cwd: root, stdio: 'inherit' });

const { chromium, firefox } = await import('@playwright/test');
const { preview } = await import('vite');
const server = await preview({ root, preview: { port: PORT, strictPort: true }, logLevel: 'warn' });
const isChromium = BROWSER === 'chromium';
const browser = await (isChromium ? chromium : firefox).launch(isChromium ? {} : { firefoxUserPrefs: { 'layout.css.devPixelsPerPx': '2' } });
const ctx = await browser.newContext({ viewport: { width: 1728, height: 1050 }, ...(isChromium ? { deviceScaleFactor: 2 } : {}) });
await ctx.addInitScript({ path: new URL('./instrument.js', import.meta.url).pathname });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
const cdp = isChromium ? await ctx.newCDPSession(page) : null;
await page.goto(`http://localhost:${PORT}/?bench`);
await page.waitForFunction(() => (window as any).__wcBench?.app != null);
await page.evaluate(readFileSync(new URL('./soak-page.js', import.meta.url), 'utf8'));
await page.evaluate(() => (window as any).__soak.load(2));
console.log(`${BROWSER} ${browser.version()} loadavg ${readFileSync('/proc/loadavg', 'utf8').trim()}`);

// Fake socket factory; login preamble bytes.
await page.evaluate(() => {
  const B = (window as any).__wcBench;
  const app = B.app;
  const enc = new TextEncoder();
  const gmcp = (pkg: string, data: unknown) => [255, 250, 201, ...enc.encode(`${pkg} ${JSON.stringify(data)}`), 255, 240];
  (window as any).__pre = new Uint8Array([
    255, 251, 201, // IAC WILL GMCP
    ...gmcp('Comm.Channel.List', [{ name: 'tales', caption: 'Narrates', command: 'narrate' }]),
    ...gmcp('Char.Name', { name: 'Rasta', fullname: 'Rasta Fari' }),
    ...gmcp('Char.Vitals', { hp: 100, maxhp: 172, mana: 40, maxmana: 90, mp: 100, maxmp: 131, xp: 5770000, tp: 41500 }),
    ...gmcp('Group.Set', [{ id: 1, type: 'you', name: 'Rasta', label: 0 }, { id: 2, type: 'ally', name: 'Gibur', label: 0, hp: 100, maxhp: 140 }]),
    ...enc.encode('Welcome back.\r\n'),
  ]);
  (window as any).__socks = 0;
  app.session.setSocketFactory(() => {
    (window as any).__socks++;
    const s: any = {
      onOpen: null,
      onData: null,
      onClose: null,
      forceUtf8: true,
      connect() {
        setTimeout(() => s.onOpen?.(), 0);
      },
      send() {},
      close() {
        s.onClose?.('closed by client');
      },
    };
    B.sock = s;
    return s;
  });
  app.offline = false;
});

const snap = async (cycle: number) => {
  const o: any = await page.evaluate(async () => {
    const B = (window as any).__wcBench;
    const app = B.app;
    const idb = await (window as any).__soak.idb();
    return {
      bus: app.bus.total(),
      inst: (window as any).__inst.counts(),
      rows: app.output.rows,
      elements: document.getElementsByTagName('*').length,
      state: app.session.state,
      idb: idb.counts,
      usage: idb.usage,
      socks: (window as any).__socks,
    };
  });
  if (cdp) {
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('HeapProfiler.collectGarbage');
    o.heap = ((await cdp.send('Runtime.getHeapUsage')) as any).usedSize;
    o.dom = await cdp.send('Memory.getDOMCounters');
  }
  o.cycle = cycle;
  return o;
};

const rows: any[] = [];
rows.push(await snap(0));
let frame = 0;
const t0 = Date.now();
for (let c = 1; c <= CYCLES; c++) {
  frame = await page.evaluate(async ({ c, frame }) => {
    const B = (window as any).__wcBench;
    const app = B.app;
    const S = (window as any).__soak;
    const L = S.loops[2];
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const until = async (f: () => boolean) => {
      for (let i = 0; i < 200 && !f(); i++) await wait(5);
    };
    if (c % 2 === 0) app.onCommand('#reconnect');
    else app.connectLive();
    await until(() => app.session.state === 'login');
    B.sock.onData((window as any).__pre);
    await until(() => app.session.state === 'playing');
    // ~150 frames of play, typed commands included
    let i = frame;
    for (let k = 0; k < 150; k++, i = (i + 1) % L.n) {
      const t = L.sent.get(i);
      if (t !== undefined) B.keyToSend(t);
      else if (L.len[i] > 0) B.sock.onData(L.bytes.subarray(L.off[i], L.off[i] + L.len[i]));
      if (k % 10 === 0) await wait(4);
    }
    await B.drained();
    if (c % 2 === 0) B.sock.close();
    else app.onCommand('#disconnect');
    await until(() => app.session.state === 'disconnected');
    await wait(30);
    return i;
  }, { c, frame });
  if (c % 10 === 0) {
    await page.evaluate(() => new Promise((r) => setTimeout(r, 2500))); // let recorder/archives settle
    const s = await snap(c);
    rows.push(s);
    console.log(
      `cycle ${c}: bus ${s.bus}, timeouts ${s.inst.timeouts}, intervals ${s.inst.intervals}, listeners ${JSON.stringify(s.inst.listeners)}, ro ${s.inst.roObserving}, workers ${s.inst.workersAlive}, channels ${s.inst.channels}` +
        (cdp ? `, heap ${(s.heap / 1e6).toFixed(2)} MB, nodes ${s.dom.nodes}, listeners ${s.dom.jsEventListeners}` : '') +
        `, rows ${s.rows}, elements ${s.elements}, idb runs ${s.idb.runs} chunks ${s.idb.runChunks} comm ${s.idb.comm} events ${s.idb.runEvents}`,
    );
  }
}
const intervals = await page.evaluate(() => (window as any).__inst.intervalSites());
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s; live intervals: ${JSON.stringify(intervals)}`);
writeFileSync(`${SCRATCH}/reconnect-${BROWSER}.json`, JSON.stringify(rows, null, 1));
await browser.close();
await new Promise<void>((r) => server.httpServer.close(() => r()));
