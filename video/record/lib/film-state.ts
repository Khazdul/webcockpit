// The browser state every scene of the film starts from (ADR 0133
// addendum): a fresh profile with the new-player defaults, then
//
//   - profiles: the bundled `khazdul` present (ADR 0024), `default` selected,
//     so a scene can pick khazdul on camera;
//   - weather effects off; no panes at all (the Settings scene switches on
//     Map, Timers and Group on camera; Comm is not used in the film);
//   - the five runs of the film backup restored (History, Spotlights,
//     Credits), as `restoreDemo` in scripts/screenshots.ts does;
//   - the page's date pinned to the evening of 2026-11-08 (FILM_NOW), so the
//     runs' dates read as they did, and MUME's clock just after midnight on
//     the start page (FILM_NIGHT), the sky `fair` (FILM_SKY: a few clouds,
//     the stars showing through).
//
// `filmPage` makes the page and prepares it on the start page; `freshStart`
// reloads the start page with the game clock set again, just before the
// camera rolls.
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { startMenu } from '../../../scripts/lib/mume-feed.ts';
import { FILM_BACKUP } from '../../feeds/film.ts';
import type { PageOptions } from './browser.ts';

/** The page's date: Sunday 2026-11-08, 19:40 local time. */
export const FILM_NOW = new Date(2026, 10, 8, 19, 40, 0).getTime();

const YEAR_S = 518_400;
const MONTH_S = 43_200;
const DAY_S = 1440;
/** MUME's clock on the start page: 00:05 on the 16th of Wedmath, T.A. 3039 (the middle of the night; a take runs on about 40 game minutes). */
export const FILM_NIGHT = 3039 * YEAR_S + 7 * MONTH_S + 15 * DAY_S + 5;
/** The start page's weather (`?skyWeather`, src/start/sky/params.ts): a few clouds, the stars still showing. */
export const FILM_SKY = 'fair';

/**
 * The page options a film scene passes to `newPage`. The page's
 * `Math.random` is seeded: seed 1 gives the start page the quote "Not all
 * those who wander are lost." (short: it leaves room for the lower third).
 */
export const FILM_PAGE: PageOptions = { now: FILM_NOW, moment: FILM_NIGHT, seed: 1 };

/** The dev hooks this file uses (`window.__wc`, src/main.ts), typed here (the app's types stay out of video/). */
interface FilmWindow {
  __wc?: {
    settings: { update(fn: (d: FilmSettings) => void): void };
    shell: { profiles: unknown };
    runs(): Promise<{ restore(b: Blob): Promise<unknown> }>;
  };
}
interface FilmSettings {
  weather: { enabled: boolean };
  panes: Record<'map' | 'timers' | 'group' | 'comm', { on: boolean }>;
  profile: string;
}

/** Where the page fetches the backup from (served from video/private/ by a route). */
const BACKUP_URL = '/__film/runs.jsonl.gz';

/** Opens the start page and prepares the film's state (see the top). Stays on the start page. */
export async function prepareFilm(page: Page): Promise<void> {
  await page.route(`**${BACKUP_URL}`, (r) => r.fulfill({ body: readFileSync(FILM_BACKUP), contentType: 'application/gzip' }));
  await page.goto('/');
  await startMenu(page);
  await page.waitForFunction(() => (window as unknown as FilmWindow).__wc !== undefined);
  await page.evaluate(async (url) => {
    const wc = (window as unknown as FilmWindow).__wc!;
    wc.settings.update((d) => {
      d.weather.enabled = false;
      d.panes.map.on = false;
      d.panes.timers.on = false;
      d.panes.group.on = false;
      d.panes.comm.on = false;
      d.profile = 'default';
    });
    const profiles = wc.shell.profiles as unknown as { init(): Promise<void>; get(n: string): Promise<unknown> };
    await profiles.init();
    if (!(await profiles.get('khazdul'))) throw new Error('the bundled khazdul profile is missing');
    const lib = await wc.runs();
    await lib.restore(await (await fetch(url)).blob());
  }, BACKUP_URL);
  // The settings are written to IndexedDB after a short debounce.
  await page.waitForTimeout(600);
}

/** Reloads the start page with MUME's clock at `moment` again (setup took a while) and the film's sky: the camera can roll. */
export async function freshStart(page: Page, moment: number = FILM_NIGHT, query = ''): Promise<void> {
  await page.evaluate((m) => {
    const now = Math.floor(Date.now() / 1000);
    localStorage.setItem('wc.clock', JSON.stringify({ epoch: now - m, precision: 'unset', lastSync: now, reason: null }));
  }, moment);
  await page.goto(`/?skyWeather=${FILM_SKY}${query ? `&${query}` : ''}`);
  await startMenu(page);
}

/**
 * A shooting star on the start page now (the dev server's `__wcSky.shoot`,
 * ADR 0133 addendum), starting at `x`, `y` (shares of the view), going
 * right (`dir` 1) or left, `angle` rad down.
 */
export async function shootingStar(page: Page, at: { x: number; y: number; dir: 1 | -1; angle: number }): Promise<void> {
  const ok = await page.evaluate((a) => {
    const sky = (globalThis as unknown as { __wcSky?: { shoot?: (p: typeof a) => void } }).__wcSky;
    if (!sky?.shoot) return false;
    sky.shoot(a);
    return true;
  }, at);
  if (!ok) throw new Error('no __wcSky.shoot: is this the dev server?');
}
