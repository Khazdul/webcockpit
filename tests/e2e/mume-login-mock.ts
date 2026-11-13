// A mocked MUME that plays the login (round 54c, ADR 0141): the banner and
// the name prompt, the account password prompt with ECHO off, then the game
// (GMCP `Char.Name`) for the right password, or a refusal and the password
// prompt again for a wrong one. Nothing reaches MUME.
//
// The texts are those of the one real login in the reference logs (a text
// log, so without the telnet negotiation): the banner's last lines, "By
// what name do you wish to be known? ", a blank line and "Account
// password: ", two blank lines and "Reconnecting.". That the server turns
// ECHO off for the password (`IAC WILL ECHO`, `IAC WONT ECHO` after it) is
// from the repository's own tests, and the refusal's text is a guess. The
// client's automatic login depends only on the name prompt's text and the
// ECHO negotiation.
//
// How a connection ends: `lose()` closes with code 1006 (what a browser
// reports for a link that went away with no close from the server) and
// `quit()` with 1000 (the server closed it itself: quit, rent, an idle
// kick). `goodbye()` sends GMCP `Core.Goodbye` first.
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
  /** While true, MUME asks one more thing after the password and lets the character in at the next line (an invented question, for a login that is not name, password, game). */
  question: boolean;
  /** While true, a new connection shows the name prompt twice, as the live game was seen to (2026-11-13). */
  promptTwice: boolean;
  /** The link is lost: the newest socket closes as a browser reports a connection that went away (code 1006). */
  lose(): void;
  /** The session ends on the server's side (quit, rent, an idle kick): a close of its own (code 1000). */
  quit(): void;
  /** As `quit`, with GMCP `Core.Goodbye` first. */
  goodbye(): void;
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
  const m: LoginMock = {
    sent: [],
    opened: () => m.sent.length,
    server: () => server!,
    answer: true,
    password: opts.password ?? 'correct-horse-9',
    question: false,
    promptTwice: false,
    lose: () => void server!.close({ code: 1006 }),
    quit: () => void server!.close({ code: 1000 }),
    goodbye: () => {
      server!.send(gmcp('Core.Goodbye', 'Goodbye.'));
      void server!.close({ code: 1000 });
    },
  };
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    const lines: string[] = [];
    m.sent.push(lines);
    let stage: 'name' | 'password' | 'question' | 'play' = 'name';
    const letIn = (): void => {
      stage = 'play';
      ws.send(Buffer.concat([Buffer.from('\r\n\r\nReconnecting.\r\n'), gmcp('Char.Name', { name, fullname: `${name} the Mock` }), Buffer.from('\r\noO>'), Buffer.from([IAC, GA])]));
    };
    const askPassword = (): void => ws.send(Buffer.concat([Buffer.from('\r\n'), Buffer.from([IAC, WILL, ECHO]), Buffer.from('Account password: '), Buffer.from([IAC, GA])]));
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
        if (stage === 'question') letIn();
        else if (stage === 'name') {
          stage = 'password';
          askPassword();
        } else if (stage === 'password') {
          if (line === m.password) {
            ws.send(Buffer.from([IAC, WONT, ECHO]));
            if (m.question) {
              stage = 'question';
              ws.send(Buffer.concat([Buffer.from('\r\nPress return to go on: '), Buffer.from([IAC, GA])]));
            } else letIn();
          } else {
            ws.send(Buffer.concat([Buffer.from([IAC, WONT, ECHO]), Buffer.from('\r\nWrong password.\r\n')]));
            askPassword();
          }
        }
      }
    });
    ws.send(Buffer.concat([Buffer.from([IAC, WILL, GMCP]), Buffer.from(
          '\r\n                               ***  MUME IX  ***\r\n\r\nIf you have never played MUME before, type NEW to create a new character,\r\nor ? for help.\r\n\r\nBy what name do you wish to be known? ',
        ), Buffer.from([IAC, GA])]));
    if (m.promptTwice) ws.send(Buffer.concat([Buffer.from('\r\nBy what name do you wish to be known? '), Buffer.from([IAC, GA])]));
  });
  return m;
}
