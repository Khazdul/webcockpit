// MUME's login, mocked for the film (ADR 0133 addendum). The welcome screen
// is MUME's real one, captured once by record/capture-login.ts into the
// gitignored private/mume-login.json (re-run that script to refresh it):
// the server's bytes replayed with their timing, telnet negotiation and
// all. Then the mock plays MUME's side of a login:
//
//   the name line      → IAC WILL ECHO and "Password: " (the server takes
//                        over the echo: the client masks the input line)
//   the password line  → IAC WONT ECHO and a new line; the scene cuts away
//
// What follows the name is staged, not captured (capturing it would mean
// sending a name to the real server); it is what MUME sends for a known
// character. No real name or password is used: the scene types `Gittan`
// and a made-up password into a socket that goes nowhere.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page, WebSocketRoute } from '@playwright/test';
import { IAC, gmcpBytes } from '../../../scripts/lib/mume-feed.ts';

const CAPTURE = fileURLToPath(new URL('../../private/mume-login.json', import.meta.url));

const WILL = 251;
const WONT = 252;
const GA = 249;
const SB = 250;
const SE = 240;
const ECHO = 1;

export interface LoginMock {
  /** The server side of the socket, once the client connected. */
  server(): WebSocketRoute | null;
  /** Epoch ms of the login's moments (`open`, `banner`, `name`, `password`), for markers. */
  readonly at: Partial<Record<'open' | 'banner' | 'name' | 'password', number>>;
}

/** The text the client sent, telnet commands and subnegotiations removed. */
function textOf(b: Buffer): string {
  let out = '';
  for (let i = 0; i < b.length; i++) {
    if (b[i] !== IAC) {
      out += String.fromCharCode(b[i]!);
      continue;
    }
    const cmd = b[i + 1];
    if (cmd === IAC) {
      out += '\xff';
      i++;
    } else if (cmd === SB) {
      while (i < b.length - 1 && !(b[i] === IAC && b[i + 1] === SE)) i++;
      i++;
    } else if (cmd !== undefined && cmd >= WILL && cmd <= 254) i += 2;
    else i++;
  }
  return out;
}

/** Routes MUME's WebSocket to the mocked login. Register before Enter MUME. */
export async function mockMumeLogin(page: Page): Promise<LoginMock> {
  if (!existsSync(CAPTURE)) throw new Error('no private/mume-login.json: run `node record/capture-login.ts` once');
  const frames = (JSON.parse(readFileSync(CAPTURE, 'utf8')) as { frames: { t: number; b64: string }[] }).frames;
  let socket: WebSocketRoute | null = null;
  const at: LoginMock['at'] = {};
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    socket = ws;
    at.open = Date.now();
    for (const f of frames) {
      setTimeout(() => {
        ws.send(Buffer.from(f.b64, 'base64'));
        at.banner ??= Date.now();
      }, f.t);
    }
    let line = '';
    let stage: 'name' | 'password' | 'done' = 'name';
    ws.onMessage((m) => {
      const raw = Buffer.from(m);
      // the keep-alive answered, so the bar's link dot reads a good link
      if (raw.includes('Core.Ping')) ws.send(gmcpBytes('Core.Ping'));
      line += textOf(raw);
      let nl: number;
      while ((nl = line.indexOf('\n')) >= 0) {
        line = line.slice(nl + 1);
        if (stage === 'name') {
          stage = 'password';
          at.name = Date.now();
          setTimeout(() => ws.send(Buffer.concat([Buffer.from([IAC, WILL, ECHO]), Buffer.from('Password: ', 'latin1'), Buffer.from([IAC, GA])])), 260);
        } else if (stage === 'password') {
          stage = 'done';
          at.password = Date.now();
          setTimeout(() => ws.send(Buffer.concat([Buffer.from([IAC, WONT, ECHO]), Buffer.from('\r\n', 'latin1')])), 300);
        }
      }
    });
  });
  return { server: () => socket, at };
}
