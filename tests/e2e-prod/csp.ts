// The Content-Security-Policy collector (ADR 0144, "As built (stage 60):
// the CSP"): what csp.spec.ts uses to see every violation of the policy a
// page is served with, enforced or report-only. Not a spec.
//
// A violation is seen two ways, because neither sees everything:
//   - the `securitypolicyviolation` event, in every document of the page
//     (an init script; a report-only policy raises it too, with
//     disposition "report");
//   - the browser's own console message (Chromium: "... violates the
//     following Content Security Policy directive ..."; Firefox:
//     "Content-Security-Policy: ..."), which is all there is for a
//     violation by the page that an event does not tell of.
// What neither sees: a violation inside a worker while the policy is
// report-only (measured with Playwright 1.63's Chromium and Firefox: a worker's
// fetch that its policy would refuse raised no event in the page and no
// console message, of the page or of the worker). A worker takes its
// policy from its own script's answer, the same `_headers` rule. So the
// workers are checked by what they do when the policy is enforced
// (`WC_PROD_CSP=enforce` locally, playwright.prod.config.ts): the map
// loads and draws, the weather runs, a map file is read.
// There is no report endpoint on the server (it would cost Worker
// requests), so this walk is how violations are found.
import { type ConsoleMessage, type Page, type WebSocketRoute, expect } from '@playwright/test';

/** One violation, as short as it can be told apart. */
export interface CspWatch {
  /** Every violation so far, without repeats. */
  readonly violations: string[];
  /** Fails when there is any (after the page has had a moment to report). */
  clean(): Promise<void>;
}

const CONSOLE = /Content[ -]Security[ -]Policy/i;

/** Starts collecting on `page`. Call before the first `goto`. */
export async function watchCsp(page: Page): Promise<CspWatch> {
  const violations: string[] = [];
  const add = (v: string): void => {
    if (!violations.includes(v)) violations.push(v);
  };
  await page.exposeFunction('__wcCspViolation', add);
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      const where = e.sourceFile ? ` at ${e.sourceFile.replace(/^https?:\/\/[^/]+/, '')}:${e.lineNumber}` : '';
      const sample = e.sample ? ` sample ${JSON.stringify(e.sample)}` : '';
      const text = `${e.effectiveDirective} blocks ${e.blockedURI || '(nothing named)'}${where}${sample} [${e.disposition}]`;
      void (window as unknown as { __wcCspViolation(v: string): Promise<void> }).__wcCspViolation(text);
    });
  });
  const said = (m: ConsoleMessage): void => {
    if (CONSOLE.test(m.text())) add(`console: ${m.text().slice(0, 400)}`);
  };
  page.on('console', said);
  page.on('worker', (worker) => worker.on('console', said));
  return {
    violations,
    async clean() {
      // Events and console messages arrive a little after what caused them.
      await page.waitForTimeout(300);
      expect(violations, 'Content-Security-Policy violations').toEqual([]);
    },
  };
}

const IAC = 255;
const WILL = 251;
const SB = 250;
const SE = 240;
const GMCP = 201;

export interface MumeMock {
  /** Sends a line of game text. */
  say(text: string): void;
  /** Lets the character in (GMCP `Char.Name`). */
  login(): void;
  /** Lines the client sent (negotiation left out). */
  readonly sent: string[];
}

/**
 * Answers here what the page would send out and leave a trace with: every
 * request to https://mume.org (the link probe's HEAD,
 * src/net/link-probe.ts) gets an empty 200, and the usage beat
 * (`POST /api/beat`, src/cloud/beat.ts) a 204, so a walk of a deployed site
 * counts nothing there. The policy is still checked on both: the browser
 * checks `connect-src` before a request leaves the page. Call before the
 * first `goto`.
 */
export async function keepQuiet(page: Page): Promise<void> {
  await page.route('https://mume.org/**', (route) => route.fulfill({ status: 200, body: '' }));
  await page.route('**/api/beat', (route) => route.fulfill({ status: 204, body: '' }));
}

/**
 * Keeps the page off MUME (and quiet, `keepQuiet`): the game's socket is
 * answered by a mock (the name prompt; `look` gets a line back). The
 * socket itself is replaced in the page by Playwright, so `connect-src`
 * for it is checked apart, offline (csp.spec.ts). Call before the first
 * `goto`.
 */
export async function mockMume(page: Page): Promise<MumeMock> {
  let server: WebSocketRoute | null = null;
  const sent: string[] = [];
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.onMessage((m) => {
      const text = (typeof m === 'string' ? Buffer.from(m) : m).toString('latin1');
      if (text.startsWith('\xff')) return;
      sent.push(...text.split(/\r?\n/).filter(Boolean));
      if (text.includes('look\r\n')) ws.send(Buffer.from('A goblin is here.\r\n'));
    });
    ws.send(Buffer.concat([Buffer.from([IAC, WILL, GMCP]), Buffer.from('\r\nBy what name do you wish to be known? ')]));
  });
  await keepQuiet(page);
  return {
    sent,
    say: (text) => server!.send(Buffer.from(`${text}\r\n`)),
    login: () =>
      server!.send(Buffer.concat([Buffer.from([IAC, SB, GMCP]), Buffer.from('Char.Name {"name":"Tester","fullname":"Tester the Mock"}'), Buffer.from([IAC, SE])])),
  };
}
