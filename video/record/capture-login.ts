// Captures MUME's real welcome screen once, for the film's mocked login
// (ADR 0133 addendum):
//
//   node record/capture-login.ts            → private/mume-login.json (+ .png, .txt)
//
// Opens the client on the dev server and presses Enter MUME against the
// real server (wss://mume.org/ws-play/), through a Playwright proxy on the
// WebSocket. Only telnet negotiation and GMCP go from the client to the
// server (Core.Hello, Core.Supports.Set, keep-alive pings): anything with
// text outside IAC sequences is dropped and nothing is ever typed, so no
// name or password is sent. The server's bytes are kept with their times
// for a few seconds, then the page closes the connection. The result lives
// in the gitignored private/ (it is MUME's text, not ours).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { devServer } from '../../scripts/lib/dev-server.ts';
import { IAC, sleep, startMenu } from '../../scripts/lib/mume-feed.ts';
import { MODES, launch, newPage } from './lib/browser.ts';

const VIDEO = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(VIDEO, 'private');
const PORT = Number(process.env.WC_VIDEO_PORT ?? 5189);
/** How long the server's bytes are kept after the socket opens, ms. */
const LISTEN_MS = Number(process.env.WC_LOGIN_LISTEN_MS ?? 8000);

const SB = 250;
const SE = 240;

/** True when `b` is nothing but telnet commands and subnegotiations (no typed text). */
function negotiationOnly(b: Buffer): boolean {
  let i = 0;
  while (i < b.length) {
    if (b[i] !== IAC) return false;
    const cmd = b[i + 1];
    if (cmd === SB) {
      // to IAC SE
      let j = i + 2;
      while (j < b.length - 1 && !(b[j] === IAC && b[j + 1] === SE)) j += b[j] === IAC && b[j + 1] === IAC ? 2 : 1;
      if (j >= b.length - 1) return false;
      i = j + 2;
    } else if (cmd !== undefined && cmd >= 251 && cmd <= 254) i += 3;
    else i += 2;
  }
  return true;
}

const server = await devServer(PORT);
const browser = await launch(MODES['intel-1.5']!);
try {
  const { page } = await newPage(browser, MODES['intel-1.5']!, `http://localhost:${PORT}`);
  const frames: { t: number; b64: string }[] = [];
  const sent: string[] = [];
  let opened = 0;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    const real = ws.connectToServer();
    opened = Date.now();
    ws.onMessage((m) => {
      const b = Buffer.from(m);
      if (negotiationOnly(b)) {
        real.send(b);
        sent.push(b.toString('latin1').replace(/[^\x20-\x7e]/g, '·'));
      } else sent.push(`(dropped ${b.length} bytes)`);
    });
    real.onMessage((m) => {
      const b = Buffer.from(m);
      frames.push({ t: Date.now() - opened, b64: b.toString('base64') });
      ws.send(b);
    });
  });
  await page.goto('/');
  await startMenu(page);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /^login/.test(document.querySelector('.wc-app')?.getAttribute('data-status') ?? ''), undefined, { timeout: 20_000 });
  await sleep(LISTEN_MS);
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: join(OUT, 'mume-login.png') });
  await page.close();
  const all = Buffer.concat(frames.map((f) => Buffer.from(f.b64, 'base64')));
  writeFileSync(join(OUT, 'mume-login.json'), `${JSON.stringify({ capturedAt: new Date().toISOString(), url: 'wss://mume.org/ws-play/', frames }, null, 1)}\n`);
  // A readable copy: telnet commands shown as ‹IAC …›.
  writeFileSync(join(OUT, 'mume-login.txt'), all.toString('latin1').replace(/\xff([\xfb-\xfe].|\xfa[\s\S]*?\xff\xf0|.)/g, (s) => `‹${[...s].map((c) => c.charCodeAt(0)).join(' ')}›`));
  console.log(`${frames.length} frames, ${all.length} bytes from the server; sent to it: ${sent.length} messages`);
  for (const s of sent) console.log(`  → ${s.slice(0, 160)}`);
  console.log(`private/mume-login.json, .txt, .png`);
} finally {
  await browser.close();
  server?.kill();
}
