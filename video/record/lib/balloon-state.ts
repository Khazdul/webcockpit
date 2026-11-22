// The balloon film's browser state (video/manuscript-balloons.md draft 2,
// stage 76): Gittan at the fountain in Bree, at midday.
//
//   - a fresh profile: Weather effects on, Balloons off (switched on on
//     camera); no pane but the map, floating, framed, with the glass
//     background;
//   - the map exactly one text row (22 px) from the top and the right edge:
//     a float sits on whole cells (12 × 22 px here), so the page is 1918 px
//     wide (159 columns and 10 px over: 12 + 10 = 22) and lies 2 px into the
//     1920 px frame, whose left band is pure black anyway;
//   - MUME's clock at midday and the sky's own keys pinned to it
//     (`__weather.jump`); the room's weather, fog and light stay the game's;
//   - the page's Math.random gives a balloon the flight seed the scene
//     queued for it (`queueFlightSeed`): balloons.ts draws one number per
//     launch. Nothing else of a flight is touched.
import type { Page, WebSocketRoute } from '@playwright/test';
import { type DevWindow, GMCP, IAC, WILL, gmcpBytes, sleep, startMenu } from '../../../scripts/lib/mume-feed.ts';
import { freshStart, keepFilmClock } from './film-state.ts';

/** The page's width and place in the 1920 × 1080 frame, px (see the top). */
export const PAGE_PX = { width: 1918, x: 2 } as const;
/** The take's capture mode (browser.ts MODES): PAGE_PX.width over 1600 CSS px. */
export const BALLOON_MODE = 'intel-1918-png';

/** The 16th of Wedmath, T.A. 3039, 13:30: the middle of the day (dawn 5, night from 22). */
const MIDDAY = 3039 * 518_400 + 7 * 43_200 + 15 * 1440 + 13 * 60 + 30;
/** The sky pinned (src/weather/protocol.ts): the day's middle, no turn timed, no moon. */
const MIDDAY_SKY = { clock: 'day', sunU: 0.5, moonUp: false, moonU: -1, dayAt: -1, nightAt: -1, moonRiseAt: -1, moonSetAt: -1 } as const;

/** The page's options: 901 CSS px gives 49 rows and 1080 px at the mode's scale. */
export const BALLOON_PAGE = { moment: MIDDAY, seed: 7, viewport: { width: 1600, height: 901 } };

/** The map (cells): round 1's 30 × 13, a column and the 10 px left over from the right edge, a row from the top. */
const MAP = { x: 128, y: 1, w: 30, h: 13 } as const;

interface BalloonsApi {
  list(): BalloonInfo[];
}
/** balloons.ts `BalloonInfo`, what the checks read. */
export interface BalloonInfo {
  phase: string;
  kind: string;
  count: number;
  face: string;
  passenger: string;
}
interface FilmWindow {
  __flightSeeds: number[];
  __wc?: {
    settings: { update(fn: (d: FilmSettings) => void): void };
    app: { weather: { controller: { balloons(): Promise<BalloonsApi | null> } | null } | null };
  };
}
interface PaneList {
  id: string;
}
interface FilmSettings {
  weather: Record<string, boolean>;
  panes: Record<string, { on: boolean; border: boolean; glass: boolean }>;
  profile: string;
  layout: {
    docks: Record<string, { lanes: { panes: PaneList[] }[]; head: PaneList[]; tail: PaneList[] }>;
    floating: PaneList[];
  };
}

/** Into the game at the pinned midday, MUME's socket mocked (nothing reaches mume.org). Returns the server's side. */
export async function enterFountain(page: Page): Promise<WebSocketRoute> {
  await keepFilmClock(page);
  await page.context().addInitScript(() => {
    const w = window as unknown as FilmWindow;
    const random = Math.random;
    w.__flightSeeds = [];
    Math.random = () => {
      // only the launch's own draw, and only while the scene has a seed waiting
      if (w.__flightSeeds.length && /\/balloons\/balloons\.ts/.test((new Error().stack ?? '').split('\n')[2] ?? '')) return w.__flightSeeds.shift()! / 2 ** 32;
      return random();
    };
  });
  let server: WebSocketRoute | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.onMessage((m) => {
      if (Buffer.from(m).includes('Core.Ping')) ws.send(gmcpBytes('Core.Ping'));
    });
    ws.send(Buffer.from([IAC, WILL, GMCP]));
    // MUME's UTF-8 (CHARSET, RFC 2066: a request the client accepts): the table's rules and any accented name
    ws.send(Buffer.concat([Buffer.from([IAC, 250, 42, 1]), Buffer.from(';UTF-8', 'latin1'), Buffer.from([IAC, 240])]));
  });
  await page.goto('/');
  await startMenu(page);
  await page.waitForFunction(() => (window as unknown as FilmWindow).__wc !== undefined);
  await page.evaluate((map) => {
    (window as unknown as FilmWindow).__wc!.settings.update((d) => {
      d.weather.enabled = true;
      d.weather.balloons = false;
      for (const p of Object.values(d.panes)) if (p) p.on = false;
      Object.assign(d.panes.map!, { on: true, border: true, glass: true });
      d.profile = 'default';
      for (const dock of Object.values(d.layout.docks)) {
        dock.head = dock.head.filter((p) => p.id !== 'map');
        dock.tail = dock.tail.filter((p) => p.id !== 'map');
        for (const l of dock.lanes) l.panes = l.panes.filter((p) => p.id !== 'map');
      }
      d.layout.floating = [...d.layout.floating.filter((f) => f.id !== 'map'), { id: 'map', ...map }];
    });
  }, MAP);
  // the settings are written to IndexedDB after a short debounce
  await sleep(600);
  await freshStart(page, MIDDAY);
  // (Enter MUME before the start surface has booted prints "Offline replay mode.": ADR 0133)
  await sleep(1500);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /^login/.test(document.querySelector('.wc-app')?.getAttribute('data-status') ?? ''));
  await page.locator('.wc-pane-map .wc-pane-content[data-map-state="loaded"]').waitFor({ timeout: 15000 });
  await page.evaluate(async (pin) => {
    const w = window as unknown as DevWindow;
    await w.__wc!.weather();
    w.__weather!.jump(pin);
  }, MIDDAY_SKY);
  if (!server) throw new Error('the game socket did not open');
  return server;
}

/** The next launch's flight seed. */
export async function queueFlightSeed(page: Page, seed: number): Promise<void> {
  await page.evaluate((s) => void (window as unknown as FilmWindow).__flightSeeds.push(s), seed);
}

/** The seeds no launch has taken yet. */
export async function seedsLeft(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as FilmWindow).__flightSeeds.length);
}

/** The balloons up now (balloons.ts `list`); none while Balloons is off. */
export async function balloonList(page: Page): Promise<BalloonInfo[]> {
  return page.evaluate(async () => {
    const b = await (window as unknown as FilmWindow).__wc!.app.weather!.controller!.balloons();
    return b ? b.list() : [];
  });
}

/** One balloon as the page shows it: its id in the take, its box in video px, its opacity. */
export type Seen = [id: number, x: number, y: number, w: number, h: number, opacity: number];

/** The balloons in the DOM that are in the window and not faded out, and how many flights there are in all. */
export async function balloonsSeen(page: Page): Promise<{ all: number; seen: Seen[] }> {
  return page.evaluate((offX) => {
    const w = window as unknown as { __ids?: WeakMap<Element, number>; __nextId?: number };
    const ids = (w.__ids ??= new WeakMap());
    const els = document.querySelectorAll<HTMLElement>('.wc-balloon');
    const k = devicePixelRatio;
    const seen: [number, number, number, number, number, number][] = [];
    for (const el of els) {
      if (!ids.has(el)) ids.set(el, (w.__nextId = (w.__nextId ?? -1) + 1));
      const b = el.getBoundingClientRect();
      const o = Number(el.style.opacity || 0);
      if (o <= 0.02 || b.right <= 0 || b.left >= innerWidth || b.bottom <= 0 || b.top >= innerHeight) continue;
      const r = (v: number): number => Math.round(v * 100) / 100;
      seen.push([ids.get(el)!, r(b.x * k + offX), r(b.y * k), r(b.width * k), r(b.height * k), o]);
    }
    return { all: els.length, seen };
  }, PAGE_PX.x);
}
