// Q4: can a small WebSocket send be held back by the browser's TCP stack
// (Nagle + delayed ACK)? The page sends three small messages 2 ms apart
// while the server stays silent (so its ACKs may be delayed); if Nagle were
// on, the 2nd and 3rd would wait for the ACK of the 1st (tens of ms on
// Linux). Also: does anything after ws.send need the page's main thread?
// The page sends, then blocks its main thread for 50 ms; the server's
// receive time shows whether the bytes left during the block.
//
//   node perf/c-nagle.ts [--browsers chromium,firefox]
import { f, launch, loadavg, nodeEpoch, pause, pct, startServer, ROOT, type BrowserName, maxOf } from './lib.ts';
import { startWsServer } from './ws-server.ts';
import { resolve } from 'node:path';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i]!.replace(/^--/, ''), process.argv[i + 1] ?? '');
const browsers = (args.get('browsers') ?? 'chromium,firefox').split(',') as BrowserName[];
let recv: { at: number; text: string }[] = [];
const wss = await startWsServer({ port: 4226, onConnect() {}, onMessage(_c, d, at) { recv.push({ at, text: d.toString() }); } });
const http = await startServer(resolve(ROOT, 'dist'), 4225, false);
console.log(`# ws.send timing, ${new Date().toISOString()}, loadavg ${loadavg()}`);
try {
  for (const name of browsers) {
    const browser = await launch(name);
    const page = await (await browser.newContext()).newPage();
    await page.goto('http://127.0.0.1:4225/LICENSE.txt').catch(() => page.goto('http://127.0.0.1:4225/'));
    await page.evaluate(
      () =>
        new Promise<void>((ok) => {
          const ws = new WebSocket('ws://127.0.0.1:4226', ['binary']);
          ws.binaryType = 'arraybuffer';
          (window as unknown as { __ws: WebSocket }).__ws = ws;
          ws.onopen = () => ok();
        }),
    );
    // Clock offset page epoch − node epoch.
    let best = { rtt: Infinity, off: 0 };
    for (let i = 0; i < 40; i++) {
      const t0 = nodeEpoch();
      const tp = await page.evaluate(() => performance.timeOrigin + performance.now());
      const t1 = nodeEpoch();
      if (t1 - t0 < best.rtt) best = { rtt: t1 - t0, off: tp - (t0 + t1) / 2 };
    }
    // 1) Three messages 2 ms apart, server silent.
    recv = [];
    const sent: number[][] = [];
    for (let r = 0; r < 40; r++) {
      const t = await page.evaluate(
        (r) =>
          new Promise<number[]>((ok) => {
            const ws = (window as unknown as { __ws: WebSocket }).__ws;
            const enc = new TextEncoder();
            const ts: number[] = [];
            let i = 0;
            const tick = () => {
              ts.push(performance.timeOrigin + performance.now());
              ws.send(enc.encode(`r${r}m${i}\r\n`));
              if (++i < 3) setTimeout(tick, 2);
              else ok(ts);
            };
            tick();
          }),
        r,
      );
      sent.push(t);
      await pause(150);
    }
    await pause(300);
    const gapsB: number[] = [];
    const lat: number[] = [];
    for (let r = 0; r < sent.length; r++) {
      for (let i = 0; i < 3; i++) {
        const m = recv.find((x) => x.text === `r${r}m${i}\r\n`);
        if (m) lat.push(m.at - (sent[r]![i]! - best.off));
      }
      const a = recv.find((x) => x.text === `r${r}m0\r\n`);
      const c = recv.find((x) => x.text === `r${r}m2\r\n`);
      if (a && c) gapsB.push(c.at - a.at - (sent[r]![2]! - sent[r]![0]!));
    }
    console.log(`\n## ${name} ${browser.version()} (sync rtt ${f(best.rtt)} ms)`);
    console.log(`- send → server receive, small messages 2 ms apart: median ${f(pct(lat, 50))} / p95 ${f(pct(lat, 95))} / max ${f(maxOf(lat))} ms (n=${lat.length}); extra delay of the 3rd vs the 1st: median ${f(pct(gapsB, 50))} / max ${f(maxOf(gapsB))} ms`);
    // 2) Send, then block the main thread 50 ms.
    recv = [];
    const blk: number[] = [];
    for (let r = 0; r < 20; r++) {
      const t = await page.evaluate((r) => {
        const ws = (window as unknown as { __ws: WebSocket }).__ws;
        const t0 = performance.timeOrigin + performance.now();
        ws.send(new TextEncoder().encode(`b${r}\r\n`));
        const until = performance.now() + 50;
        while (performance.now() < until) {
          /* busy */
        }
        return t0;
      }, r);
      blk.push(t);
      await pause(100);
    }
    await pause(200);
    const during: number[] = [];
    for (let r = 0; r < blk.length; r++) {
      const m = recv.find((x) => x.text === `b${r}\r\n`);
      if (m) during.push(m.at - (blk[r]! - best.off));
    }
    console.log(`- send, then main thread blocked 50 ms: send → server receive median ${f(pct(during, 50))} / max ${f(maxOf(during))} ms (n=${during.length}); < 50 ms means the bytes left while the page was still busy`);
    await browser.close();
  }
} finally {
  wss.close();
  http.close();
}
process.exit(0);
