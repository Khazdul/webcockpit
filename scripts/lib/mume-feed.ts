// A mocked MUME session for scripted browser runs: the telnet and GMCP
// bytes, the gameplay feed built from the repository's fixtures
// (tests/fixtures/*.log, invented names), the mocked WebSocket login, the
// pinned game date and the weather dev hook (src/weather/dev.ts).
//
// Shared by the README screenshots (scripts/screenshots.ts) and the
// presentation film's recorder (video/record/, ADR 0133). Nothing here
// reaches the real server: `connect` routes wss://mume.org/ws-play/ to the
// page's own feed. `play` sends a feed at once (screenshots) or paced, with
// visible typing (the film).
//
// Self-contained on purpose: the page's dev hooks (`window.__wc`,
// `window.__weather`) are typed locally (`DevWindow`), so a package outside
// the root tsconfig (video/) can import this file without the app's types.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { BrowserContext, Page, WebSocketRoute } from '@playwright/test';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------ telnet feed

export const IAC = 255;
const SB = 250;
const SE = 240;
export const WILL = 251;
const GA = 249;
export const GMCP = 201;

export const gmcpBytes = (body: string): Buffer => Buffer.concat([Buffer.from([IAC, SB, GMCP]), Buffer.from(body, 'utf8'), Buffer.from([IAC, SE])]);

/** A prompt as replay-socket.ts tells one: visible text ending in `>`, short. */
export const isPrompt = (raw: string): boolean => {
  const vis = raw.replace(/\x1b\[[0-9;]*m/g, '').trim();
  return vis.length > 0 && vis.length < 80 && vis.endsWith('>');
};

/** One server line: a prompt goes without a newline and ends with GA. */
export const lineBytes = (raw: string): Buffer =>
  isPrompt(raw) ? Buffer.concat([Buffer.from(raw, 'utf8'), Buffer.from([IAC, GA])]) : Buffer.from(`${raw}\r\n`, 'utf8');

/**
 * A feed step: bytes from the server, or a command typed into the input
 * line. `mark` names the step for a recorder's timeline (the film). `at`
 * (ms from the start of `play`) times it: the bytes go then, a command's
 * Enter lands then (its typing starts before); untimed steps follow the
 * pace's delays.
 */
export type Step = ({ out: Buffer } | { cmd: string }) & { mark?: string; at?: number };

/** The body of each line of a fixture log (timestamps dropped). */
export function fixture(name: string): string[] {
  return readFileSync(`${ROOT}tests/fixtures/${name}`, 'utf8')
    .split('\n')
    .filter((l) => l.length >= 17)
    .map((l) => l.slice(17));
}

/**
 * Fixture lines → steps. GMCP records become telnet GMCP, `> cmd` lines are
 * typed. `descs`: a room's description from its Room.Info is shown under
 * the room name (the fixtures keep only the name; MUME prints both).
 */
export function toSteps(lines: readonly string[], o: { descs?: boolean; gmcp?: (pkg: string) => boolean } = {}): Step[] {
  const steps: Step[] = [];
  let buf: Buffer[] = [];
  let desc: string | null = null;
  // Commands typed ahead (`n;n;n`) wait for the prompt before them, so each echo sits on its prompt.
  const ahead: string[] = [];
  const flush = (): void => {
    if (buf.length) steps.push({ out: Buffer.concat(buf) });
    buf = [];
  };
  for (const l of lines) {
    if (l.startsWith('> ')) {
      flush();
      if (steps.length && 'cmd' in steps.at(-1)!) ahead.push(l.slice(2));
      else steps.push({ cmd: l.slice(2) });
    } else if (l.startsWith('\x1bGMCP ')) {
      const body = l.slice(6);
      const pkg = body.split(' ')[0]!;
      if (o.gmcp && !o.gmcp(pkg)) continue;
      if (pkg === 'Room.Info' && o.descs) desc = (JSON.parse(body.slice(pkg.length + 1)) as { desc?: string }).desc ?? null;
      buf.push(gmcpBytes(body));
    } else if (/^\x1b[A-Z]/.test(l)) {
      continue; // other client records (VIEW, SIZE, …)
    } else {
      buf.push(lineBytes(l));
      if (desc !== null && l.startsWith('\x1b[32m')) {
        for (const d of desc.replace(/\n+$/, '').split('\n')) buf.push(lineBytes(d));
        desc = null;
      }
      if (isPrompt(l)) {
        flush();
        const next = ahead.shift();
        if (next !== undefined) steps.push({ cmd: next });
      }
    }
  }
  flush();
  return steps;
}

/** Unsolicited channel text: GMCP, then an empty line, the text, an empty line, the prompt. */
export function comm(channel: string, talker: string, text: string, colour = ''): Step {
  const g = gmcpBytes(`Comm.Channel.Text ${JSON.stringify({ channel, talker, 'talker-type': 'player', text })}`);
  const shown = colour ? `\x1b[${colour}m${text}\x1b[0m` : text;
  return { out: Buffer.concat([g, lineBytes(''), lineBytes(shown), lineBytes(''), lineBytes('*=>')]) };
}

/** How much of the fight on Hill Road the feed plays. */
export type Fight = 'none' | 'mid' | 'full';

/**
 * The fight of gmcp-demo.log (`kill scout` to the achievement), moved to
 * Bree: the orc scout becomes a half-orc ruffian who arrives first. Its
 * Group GMCP is dropped (other ids than this feed's group). `mid` stops
 * while the ruffian is wounded.
 */
export function fightSteps(fight: Fight): Step[] {
  if (fight === 'none') return [];
  const demo = fixture('gmcp-demo.log').map((l) =>
    l.replace(/an orc scout/g, 'a half-orc ruffian').replace(/An orc scout/g, 'A half-orc ruffian').replace(/scout/g, 'ruffian'),
  );
  const from = demo.indexOf('> kill ruffian');
  const to = fight === 'mid' ? demo.indexOf('Gibur grins at the ruffian wickedly.') - 3 : demo.indexOf('> narrate ruffian down at the ford');
  const arrive: Step = { out: Buffer.concat([lineBytes(''), lineBytes('\x1b[31mA half-orc ruffian arrives from the north.\x1b[0m'), lineBytes(''), lineBytes('*=>')]) };
  return [arrive, ...toSteps(demo.slice(from, to), { gmcp: (pkg) => !pkg.startsWith('Group.') })];
}

/** The channel talk of the gameplay feed, in the order it comes. */
export function feedTalk(): Step[] {
  return [
    comm('tales', 'Gibur', "Gibur narrates 'orcs gathering at the ford'", '33'),
    comm('tells', 'Gibur', "Gibur tells you 'meet me at the Pony, bring the merc'", '32'),
    comm('says', 'Dori', "Dori says 'I can smell them' in Khuzdul.", '36'),
    comm('questions', 'Ecthel', "Ecthel asks 'anyone near Rivendell?'", '33'),
    comm('songs', 'Lindir', "Lindir sings 'A Elbereth Gilthoniel'", '33'),
    comm('tells', 'Gibur', "Gibur tells you 'more coming, 2 trolls'", '32'),
  ];
}

/** Dori and the pony join Rasta's group (Group.Add). */
export function feedFriends(): Step {
  return {
    out: Buffer.concat([
      gmcpBytes(`Group.Add ${JSON.stringify({ id: 4, type: 'ally', name: 'Dori', label: 0, hp: 118, 'hp-string': 'Fine', maxhp: 150, mana: 0, 'mana-string': 'Full', maxmana: 0, mp: 96, 'mp-string': 'Rested', maxmp: 120 })}`),
      gmcpBytes(`Group.Add ${JSON.stringify({ id: 5, type: 'npc', name: 'a sturdy pony', label: 'PONY', hp: 90, 'hp-string': 'Healthy', maxhp: 90, mana: 0, 'mana-string': 'Full', maxmana: 0, mp: 40, 'mp-string': 'Tired', maxmp: 120 })}`),
    ]),
  };
}

/** The parts of the gameplay feed, for a feed that plays them its own way (the film). */
export function feedParts(): { login: Step[]; spells: Step[]; walk: Step[] } {
  const map = fixture('map-demo.log');
  const firstMove = map.indexOf('> n');
  const timers = fixture('timers-demo.log');
  const spellsFrom = timers.indexOf('> arm');
  const spellsTo = timers.indexOf('> store fireb');
  return {
    login: toSteps(map.slice(0, firstMove), { descs: true }),
    spells: toSteps(timers.slice(spellsFrom, spellsTo), { gmcp: () => false }),
    walk: toSteps(map.slice(firstMove), { descs: true }),
  };
}

/**
 * The gameplay feed: Rasta logs in on the Old East Road in Bree (map-demo),
 * casts his spells (timers-demo, without its login and GMCP), walks Bree
 * with room descriptions while friends talk on the channels, and ends up
 * on Hill Road, where `fight` may add a fight. All names are the fixtures'
 * invented ones.
 */
export function gameFeed(fight: Fight = 'none'): Step[] {
  const { login, spells, walk } = feedParts();
  const talk = feedTalk();
  // A channel message after every few moves.
  const mixed: Step[] = [];
  let moves = 0;
  for (const s of walk) {
    mixed.push(s);
    if ('cmd' in s && ++moves % 5 === 0 && talk.length) mixed.push(talk.shift()!);
  }
  return [...login, feedFriends(), ...spells, ...mixed, ...talk, ...fightSteps(fight)];
}

// ------------------------------------------------------------ the page

/** The page's dev hooks (dev server only), typed here so this file needs none of the app's types. */
export interface DevWindow {
  __wc?: { weather(): Promise<unknown>; settings: { get(): { layout: unknown }; update(p: unknown): void } };
  __weather?: { jump(p: Pin): void; set(p: Pin): void; unpin(): void; setSpeed(k: number): void; emit(e: string, data?: unknown): void };
}

/** The start page's menu, Enter MUME chosen (the new look, stage 42: tests/e2e/look.ts `openStart`). */
export async function startMenu(page: Page): Promise<void> {
  await page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label', { hasText: 'Enter MUME' }).waitFor();
}

/**
 * MUME's date, pinned so a run does not change with the real date (a game
 * year is six real days): the seasonal map tiles and the start page's sky
 * and date line follow it. 16:00 on the 15th of Wedmath (late summer), year
 * 3039. Saved as the browser's clock (src/gmcp/clock.ts, `wc.clock`) with
 * the precision still `unset`, as on a new install, unless the page saved
 * one of its own.
 */
export const GAME_MOMENT_S = 3039 * 518_400 + 7 * 43_200 + 14 * 1440 + 16 * 60;

/** Pins MUME's date (GAME_MOMENT_S) in every page of `ctx`. */
export async function pinGameMoment(ctx: BrowserContext, moment = GAME_MOMENT_S): Promise<void> {
  await ctx.addInitScript((m) => {
    try {
      if (localStorage.getItem('wc.clock')) return;
      const now = Math.floor(Date.now() / 1000);
      localStorage.setItem('wc.clock', JSON.stringify({ epoch: now - m, precision: 'unset', lastSync: now, reason: null }));
    } catch {
      // No storage (a file: page): the real date.
    }
  }, moment);
}

/**
 * How `play` sends a feed. The defaults are the screenshots' (as fast as the
 * page takes it, commands inserted whole); the film types and waits.
 */
export interface Pace {
  /** ms between typed keys; 0 inserts the command whole. */
  typeDelay?: number;
  /** ms after a command's Enter. */
  afterCmd?: number;
  /** ms after server bytes. */
  afterOut?: number;
  /** ms before a command is typed (a player's pause). */
  beforeCmd?: number;
  /** Called as each step begins (a recorder's markers). */
  onStep?: (s: Step, i: number) => void | Promise<void>;
}

const FAST: Required<Omit<Pace, 'onStep'>> = { typeDelay: 0, afterCmd: 30, afterOut: 40, beforeCmd: 0 };

/**
 * Routes MUME's WebSocket to a mock (nothing reaches the real server), opens
 * the start page, runs `prepare` there (before the cockpit is built: a
 * layout change after the feed would rewrap its text), presses Enter MUME
 * and waits for the login. Returns the server side of the socket.
 */
export async function connect(page: Page, prepare?: (page: Page) => Promise<void>): Promise<WebSocketRoute> {
  let server: WebSocketRoute | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    // Core.Ping answered at once, so the bar's link dot reads a good link (not "no answer").
    ws.onMessage((m) => {
      if (Buffer.from(m).includes('Core.Ping')) ws.send(gmcpBytes('Core.Ping'));
    });
    ws.send(Buffer.from([IAC, WILL, GMCP]));
  });
  await page.goto('/');
  await startMenu(page);
  await prepare?.(page);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /^login/.test(document.querySelector('.wc-app')?.getAttribute('data-status') ?? ''));
  return server!;
}

/** Plays `steps` on the mocked connection: server bytes sent, commands typed into the input line. */
export async function play(page: Page, server: WebSocketRoute, steps: readonly Step[], pace: Pace = {}): Promise<void> {
  const p = { ...FAST, ...pace };
  const input = page.locator('.wc-input-field');
  const t0 = Date.now();
  for (const [i, s] of steps.entries()) {
    if (s.at !== undefined) {
      // a command's typing (one key per typeDelay, then Enter) ends at its time
      const lead = 'cmd' in s ? s.cmd.length * p.typeDelay + 40 : 0;
      const wait = t0 + s.at - lead - Date.now();
      if (wait > 0) await sleep(wait);
    } else if ('cmd' in s && p.beforeCmd) await sleep(p.beforeCmd);
    await p.onStep?.(s, i);
    if ('cmd' in s) {
      await input.focus();
      if (p.typeDelay > 0) await page.keyboard.type(s.cmd, { delay: p.typeDelay });
      else await page.keyboard.insertText(s.cmd);
      await page.keyboard.press('Enter');
      if (s.at === undefined) await sleep(p.afterCmd);
    } else {
      server.send(s.out);
      if (s.at === undefined) await sleep(p.afterOut);
    }
  }
}

/** Logs in through the mocked WebSocket and plays `steps` at once (see `connect`, `play`); the input line left empty. */
export async function live(page: Page, steps: readonly Step[], prepare?: (page: Page) => Promise<void>): Promise<WebSocketRoute> {
  const server = await connect(page, prepare);
  await play(page, server, steps);
  // The input line keeps the last command; a screenshot shows it empty.
  await page.locator('.wc-input-field').fill('');
  return server;
}

// ------------------------------------------------------------ weather

/** The weather dev hook; resolves once the effects run. */
export async function weather(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const w = await (window as unknown as DevWindow).__wc!.weather();
    if (!w) throw new Error('weather effects did not start');
  });
}

export type Pin = Record<string, unknown>;
/** Outdoors, standing, no clock-driven turn or moon (the demo's SCENE). */
export const SCENE: Pin = { fog: '', light: '', position: 'standing', dayAt: -1, nightAt: -1, moonRiseAt: -1, moonSetAt: -1 };
export const DAY: Pin = { clock: 'day', light: '*', sunU: 0.5, moonUp: false, moonU: -1 };
export const NIGHT: Pin = { clock: 'night', light: ')', sunU: -1 };

/** Pins weather values at once (`__weather.jump`). */
export async function jump(page: Page, pin: Pin): Promise<void> {
  await page.evaluate((p) => (window as unknown as DevWindow).__weather!.jump(p), pin);
}
