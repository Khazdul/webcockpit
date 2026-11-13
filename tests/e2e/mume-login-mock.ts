// A mocked MUME that plays the login (round 54c, ADR 0141): the name
// prompt, the password prompt with ECHO off, then the game (GMCP
// `Char.Name`) for the right password or "Wrong password." and the
// password prompt again for a wrong one. Nothing reaches MUME.
//
// The texts and the order of the negotiation are what the repository's
// existing fixtures and tests show ("By what name do you wish to be
// known? ", `IAC WILL ECHO` with "Password: ", `IAC WONT ECHO` after it,
// "Reconnecting."); the refusal's text is a guess. The client's automatic
// login depends only on the name prompt's text and the ECHO negotiation.
import type { Page, WebSocketRoute } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const WONT = 252;
const SB = 250;
const SE = 240;
const GA = 249;
const ECHO = 1;
const GMCP = 201;

const gmcp = (pkg: string, data?: unknown): Buffer =>
  Buffer.concat([Buffer.from([IAC, SB, GMCP]), Buffer.from(data === undefined ? pkg : `${pkg} ${JSON.stringify(data)}`, 'utf8'), Buffer.from([IAC, SE])]);

export interface LoginMock {
  /** The lines each socket was sent, in order (pings, negotiation and the width commands left out). */
  sent: string[][];
  opened(): number;
  /** The newest socket. */
  server(): WebSocketRoute;
  /** Whether pings are answered (a dead link does not). */
  answer: boolean;
  /** The password MUME takes now (changing it makes the stored one wrong). */
  password: string;
}

export interface LoginMockOptions {
  /** The character, as MUME spells it. */
  name?: string;
  password?: string;
}

/** Routes MUME's socket to the mock. Call before the page connects. */
export async function loginMock(page: Page, opts: LoginMockOptions = {}): Promise<LoginMock> {
  const name = opts.name ?? 'Rasta';
  let server: WebSocketRoute | null = null;
  const m: LoginMock = { sent: [], opened: () => m.sent.length, server: () => server!, answer: true, password: opts.password ?? 'correct-horse-9' };
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    const lines: string[] = [];
    m.sent.push(lines);
    let stage: 'name' | 'password' | 'play' = 'name';
    const askPassword = (): void => ws.send(Buffer.concat([Buffer.from([IAC, WILL, ECHO]), Buffer.from('Password: '), Buffer.from([IAC, GA])]));
    ws.onMessage((raw) => {
      const t = (typeof raw === 'string' ? Buffer.from(raw) : raw).toString('latin1');
      if (t.includes('Core.Ping')) {
        if (m.answer) ws.send(gmcp('Core.Ping'));
        return;
      }
      if (t.startsWith('\xff')) return;
      for (const line of t.split(/\r?\n/).slice(0, -1)) {
        if (line.startsWith('change width')) continue;
        lines.push(line);
        if (stage === 'name') {
          stage = 'password';
          askPassword();
        } else if (stage === 'password') {
          if (line === m.password) {
            stage = 'play';
            ws.send(Buffer.concat([Buffer.from([IAC, WONT, ECHO]), Buffer.from('\r\nReconnecting.\r\n'), gmcp('Char.Name', { name, fullname: `${name} the Mock` }), Buffer.from('\r\noO>'), Buffer.from([IAC, GA])]));
          } else {
            ws.send(Buffer.concat([Buffer.from([IAC, WONT, ECHO]), Buffer.from('\r\nWrong password.\r\n')]));
            askPassword();
          }
        }
      }
    });
    ws.send(Buffer.concat([Buffer.from([IAC, WILL, GMCP]), Buffer.from('\r\n                              ***  MUME  ***\r\n\r\nBy what name do you wish to be known? '), Buffer.from([IAC, GA])]));
  });
  return m;
}
