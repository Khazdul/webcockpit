// Q2/Q4 end to end: key → command on the wire, with a real WebSocket.
//
//   node perf/c-ws.ts [--browsers chromium,firefox] [--scenarios idle,help,burst,play]
//        [--keys 150] [--dist dist] [--coi 1] [--tag name] [--gecko 0|1]
//
// A local WebSocket server (perf/ws-server.ts, subprotocol `binary`, in this
// Node process) plays MUME: it sends a GMCP login, then the load, and
// timestamps every command it receives. The page connects the app's Session
// to it through a Socketish built like src/net/ws-transport.ts (so the
// ingest runs in real WebSocket message tasks, one per server message, as
// in live play, not in the replay socket's 8 ms slices). Node presses keys
// (Playwright) at random gaps; the server's receive time and Node's press
// time are on the same clock, so key → wire needs no clock sync.
//
// Loads (server side):
// - help:  one `help 24-bit colours` page (one WS message) every 150–450 ms.
// - burst: the whole big log in 16 KB messages, written at once (TCP and the
//          browser pace it), again 1 s after the socket drained.
// - play:  the busy 90 s play window (with GMCP) at speed 1.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { f, khazdulProfile, launch, loadavg, nodeEpoch, openApp, pause, pct, ROOT, startServer, stats, type BrowserName, maxOf } from './lib.ts';
import { analyse, clockOffset, collect, connectWs, install, pressKeys, reapplyProfile, resetCollect, type Collected } from './c-common.ts';
import { burstText, framesOf, helpPages, loginLog, playFrames } from './c-feeds.ts';
import { startWsServer, type WsConn } from './ws-server.ts';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i]!.replace(/^--/, ''), process.argv[i + 1] ?? '');
const browsers = (args.get('browsers') ?? 'chromium,firefox').split(',') as BrowserName[];
const scenarios = (args.get('scenarios') ?? 'idle,help,burst,play').split(',');
const KEYS = Number(args.get('keys') ?? 150);
const coi = (args.get('coi') ?? '1') === '1';
const dist = resolve(ROOT, args.get('dist') ?? 'dist');
const tag = args.get('tag') ?? '';
const doGecko = args.get('gecko') === '1';
const OUT = '/tmp/claude-1000/-home-ole-proj-webcockpit/839d0ad2-3f20-4e68-a808-1e236720a92c/scratchpad/perf/C';
const HTTP_PORT = Number(args.get('port') ?? 4227);
const WS_PORT = HTTP_PORT + 1;

const b64ToBytes = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));
const loginBytes = framesOf(loginLog(1790449200000000)).map((x) => b64ToBytes(x.b64));
const helpBytes = helpPages().map((p) => new TextEncoder().encode(p));
const play = playFrames(90);
const playBytes = play.frames.map((x) => ({ atMs: x.atMs, b: b64ToBytes(x.b64) }));
const burstBytes = scenarios.includes('burst') ? framesOf(burstText(), 0).map((x) => b64ToBytes(x.b64)) : [];

let conn: WsConn | null = null;
/** The page acknowledges the end-of-burst marker once it has processed it. */
let onAck: ((n: number) => void) | null = null;
let recv: { at: number; text: string }[] = [];
let connected: () => void = () => {};
const wss = await startWsServer({
  port: WS_PORT,
  onConnect(c) {
    conn = c;
    for (const b of loginBytes) c.send(b);
    connected();
  },
  onMessage(_c, data, at) {
    if (data[0] === 255) return; // telnet/GMCP, not a command
    const text = data.toString('utf8');
    if (text.startsWith('ACK ')) {
      onAck?.(Number(text.slice(4)));
      return;
    }
    recv.push({ at, text });
  },
});

let loadRun = false;
let loadTimer: ReturnType<typeof setTimeout> | null = null;
let bursts = 0;
function startLoad(scen: string): void {
  loadRun = true;
  const c = conn!;
  if (scen === 'help') {
    let i = 0;
    const step = () => {
      if (!loadRun) return;
      c.send(helpBytes[i++ % helpBytes.length]!);
      loadTimer = setTimeout(step, 150 + Math.random() * 300);
    };
    loadTimer = setTimeout(step, 100);
  } else if (scen === 'burst') {
    // One burst, then wait until the page has processed its end marker
    // (the page acks it), then 1 s, then the next. Chromium pushes back
    // through the socket, Firefox buffers everything, so the socket alone
    // cannot pace the load.
    const go = () => {
      if (!loadRun) return;
      const n = ++bursts;
      for (const b of burstBytes) c.send(b);
      c.send(new TextEncoder().encode(`PERF-BURST-END-${n}\r\n`));
      onAck = (k) => {
        if (k !== n) return;
        onAck = null;
        loadTimer = setTimeout(go, 1000);
      };
    };
    go();
  } else if (scen === 'play') {
    const t0 = performance.now();
    const span = playBytes.at(-1)!.atMs + 1000;
    let i = 0;
    const step = () => {
      if (!loadRun) return;
      for (;;) {
        const lap = Math.floor(i / playBytes.length);
        const fr = playBytes[i % playBytes.length]!;
        const due = t0 + lap * span + fr.atMs;
        const wait = due - performance.now();
        if (wait > 1) {
          loadTimer = setTimeout(step, wait);
          return;
        }
        c.send(fr.b);
        i++;
      }
    };
    step();
  }
}
function stopLoad(): void {
  loadRun = false;
  if (loadTimer) clearTimeout(loadTimer);
}

const server = await startServer(dist, HTTP_PORT, coi);
const base = `http://127.0.0.1:${HTTP_PORT}`;
const profile = khazdulProfile();
const report: string[] = [];
const L = (s: string) => {
  console.log(s);
  report.push(s);
};
L(`# Key → wire with a real WebSocket (Q2/Q4), ${new Date().toISOString()}`);
L(`dist ${dist}; coi ${coi}; keys per scenario ${KEYS}; loadavg ${loadavg()}`);
L(`play feed: ${play.info}; burst: ${burstBytes.length} messages of ≤ 16 KB`);
const raw: Record<string, unknown> = {};
try {
  for (const name of browsers) {
    const geckoOut = `${OUT}/gecko-ws-${tag || 'run'}-${Date.now()}.json`;
    const browser = await launch(
      name,
      name === 'firefox' && doGecko
        ? {
            env: {
              MOZ_PROFILER_STARTUP: '1',
              MOZ_PROFILER_SHUTDOWN: geckoOut,
              MOZ_PROFILER_STARTUP_FEATURES: 'js,ipcmessages',
              MOZ_PROFILER_STARTUP_FILTERS: 'GeckoMain,Compositor,Renderer,DOM Worker,Socket Thread',
              MOZ_PROFILER_STARTUP_INTERVAL: '1',
              MOZ_PROFILER_STARTUP_ENTRIES: '200000000',
            },
          }
        : {},
    );
    L(`\n## ${name} ${browser.version()} (headless, DPR 2, 1728×1000${name === 'chromium' ? ', GPU' : ''})`);
    for (const scen of scenarios) {
      const page = await openApp(browser, name, base);
      if (!(await page.evaluate(install, profile))) throw new Error('install failed');
      const up = new Promise<void>((r) => (connected = r));
      await page.evaluate(connectWs, `ws://127.0.0.1:${WS_PORT}`);
      await up;
      await pause(600);
      if (!(await page.evaluate(reapplyProfile))) console.warn('profile: F1/Backquote macros not bound');
      await page.evaluate(() => {
        const w = window as unknown as Record<string, any>;
        w.__wcBench.app.bus.on('text.line', (l: { text: string }) => {
          if (l.text.startsWith('PERF-BURST-END-')) w.__ws.ws.send(`ACK ${l.text.slice(15)}`);
        });
      });
      const state = await page.evaluate(() => (window as unknown as Record<string, any>).__wcBench.app.session.state);
      const off = await clockOffset(page);
      await page.evaluate(resetCollect);
      await page.evaluate(() => performance.mark('c-sync'));
      const syncPage = await page.evaluate(() => performance.getEntriesByName('c-sync').at(-1)!.startTime);
      recv = [];
      bursts = 0;
      if (scen !== 'idle') startLoad(scen);
      await pause(scen === 'burst' ? 300 : 600);
      const la0 = loadavg();
      const nk = await pressKeys(page, KEYS);
      const la1 = loadavg();
      stopLoad();
      await pause(1500);
      const off2 = await clockOffset(page);
      const c = (await page.evaluate(collect)) as Collected;
      L(`\n### ${name} / ws-${scen}  (session ${state}; loadavg ${la0} → ${la1}; sync rtt ${f(off.rtt)}/${f(off2.rtt)} ms)`);
      analyse(name, scen, c, nk, (off.off + off2.off) / 2, L);
      // Key → wire: pair the page's command sends with the server's receives (same order).
      const cmdSends = c.sends.filter((s) => !s.gm);
      const offAvg = (off.off + off2.off) / 2;
      const pageToNode = (t: number) => t + c.timeOrigin - offAvg;
      const n = Math.min(cmdSends.length, recv.length);
      if (cmdSends.length !== recv.length) L(`  (note: ${cmdSends.length} command sends in the page, ${recv.length} received by the server)`);
      const sendToWire: number[] = [];
      const bySendT = new Map<number, number>();
      for (let i = 0; i < n; i++) {
        sendToWire.push(recv[i]!.at - pageToNode(cmdSends[i]!.t));
        bySendT.set(cmdSends[i]!.t, recv[i]!.at);
      }
      const keyToWire: number[] = [];
      const keyToWireByKind = new Map<string, number[]>();
      const nn = Math.min(c.keys.length, nk.length);
      for (let i = 0; i < nn; i++) {
        const k = c.keys[i]!;
        if (!k.send) continue;
        const at = bySendT.get(k.send);
        if (at === undefined) continue;
        const d = at - nk[i]!.nodeT;
        keyToWire.push(d);
        const arr = keyToWireByKind.get(nk[i]!.kind) ?? [];
        arr.push(d);
        keyToWireByKind.set(nk[i]!.kind, arr);
      }
      const s1 = stats(sendToWire);
      const s2 = stats(keyToWire);
      L(`  - socket.send → server receive (clock-synced): median ${f(s1.median)} / p95 ${f(s1.p95)} / max ${f(s1.max)} ms (n=${s1.n})`);
      L(`  - Node press → server receive (same clock): median ${f(s2.median)} / p95 ${f(s2.p95)} / p99 ${f(s2.p99)} / max ${f(s2.max)} ms (n=${s2.n}); by key: ${[...keyToWireByKind].map(([k, v]) => `${k} ${f(pct(v, 50))}/${f(pct(v, 95))}`).join(', ')}`);
      if (c.msgs.length) {
        const md = c.msgs.map((m) => m[1]);
        L(`  - WebSocket message tasks: ${c.msgs.length}; onmessage duration median ${f(pct(md, 50))} / p95 ${f(pct(md, 95))} / max ${f(maxOf(md))} ms; bytes median ${pct(c.msgs.map((m) => m[2]), 50)}${scen === 'burst' ? `; bursts sent ${bursts}` : ''}`);
      }
      raw[`${name}/${scen}`] = { c, nk, off, off2, syncPage, recv };
      await page.context().close();
    }
    await browser.close();
    if (name === 'firefox' && doGecko) L(`gecko profile: ${geckoOut}`);
  }
} finally {
  server.close();
  wss.close();
}
const stamp = Date.now();
writeFileSync(`${OUT}/ws-${tag || 'run'}-${stamp}.md`, report.join('\n') + '\n');
writeFileSync(`${OUT}/ws-${tag || 'run'}-${stamp}.json`, JSON.stringify(raw));
console.log(`\nwrote ${OUT}/ws-${tag || 'run'}-${stamp}.md`);
process.exit(0);
