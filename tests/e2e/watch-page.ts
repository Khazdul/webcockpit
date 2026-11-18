// What the watch page's specs share (stage 64 C2): the fakes on a page, a
// seeded run, the way in and the locators. Not a spec. Used by
// watch-page.spec.ts (desktop, Chromium and Firefox) and
// phone-watch-page.spec.ts.
//
// The page talks to the account fake (cloud-account-fake.ts) with the
// flags `accounts` and `share` on, and to the pub fake beside it
// (cloud-pub-fake.ts), on the dev server with `?cloudtest`.

import { type FrameLocator, type Locator, type Page, expect } from '@playwright/test';
import { type FakeAccountApi, fakeAccountApi, seedAccount } from './cloud-account-fake';
import { type FakePubs, demoPayload, fakePubApi } from './cloud-pub-fake';

export const SENDER = 'fenwick';
export const WATCHER = 'Norsy';
export const ID = 'Ab3dE5fG7hJk';

export interface WatchSetup {
  api: FakeAccountApi;
  pubs: FakePubs;
}

/** The fakes on `page`, with one seeded run (`ID`, by `SENDER`). */
export async function setUp(page: Page, o: { share?: boolean; gallery?: boolean } = {}): Promise<WatchSetup> {
  const api = await fakeAccountApi(page);
  api.server.flags = { accounts: true, share: o.share ?? true, ...(o.gallery ? { gallery: true } : {}) };
  const pubs = await fakePubApi(page, api);
  pubs.add({
    id: ID,
    owner: SENDER,
    title: 'Clearing the ranger camp',
    description: 'Norsy and Kuzzim join at the ford; the rangers first, then the acolytes.',
    character: 'Rasta',
    level: 42,
    lengthS: 4500,
    views: 37,
    payload: demoPayload(),
  });
  return { api, pubs };
}

/** Logs the page in as `name` (an account on the fake, its session, the page's hint). */
export async function logIn(page: Page, s: WatchSetup, name: string): Promise<void> {
  await seedAccount(s.api.server, name, 'correct horse battery');
  s.api.server.logInBrowser(s.api.browser, name);
  await page.addInitScript((n) => localStorage.setItem('wc.account', JSON.stringify({ name: n })), name);
}

/** Opens the watch page of `id` (`query` starts with `&`). */
export async function openWatch(page: Page, id = ID, query = ''): Promise<void> {
  await page.goto(`/r/${id}?cloudtest${query}`);
}

export const band = (page: Page): Locator => page.locator('.wc-watch-band');
/** The stage 65 frame around the page (the start menu's sub-page box). */
export const watchBox = (page: Page): Locator => page.locator('.wc-watch-box');
export const watchBtn = (page: Page, id: string): Locator => page.locator(`.wc-watch [data-btn="${id}"]`);
export const endBox = (page: Page): Locator => page.locator('.wc-watch [data-watch="end"]');
export const replay = (page: Page): FrameLocator => page.frameLocator('.wc-watch-slot iframe');
export const dialog = (page: Page, dlg: string): Locator => page.locator(`.wc-watch [data-dlg="${dlg}"]`);

/** Waits until the replay plays in the frame. */
export async function playing(page: Page): Promise<void> {
  await expect(page.locator('.wc-watch-page[data-watch="playing"]')).toBeVisible({ timeout: 20_000 });
  await expect(replay(page).locator('.wc-player')).toBeVisible({ timeout: 20_000 });
}

/**
 * The run's poster (stage 73, ADR 0162) in the frame: every shared run
 * opens under it, paused at the start. A click on it starts the run.
 */
export const poster = (page: Page): Locator => replay(page).locator('.wc-poster');

/** Clicks the poster away (the run starts) and waits until it has gone. */
export async function startRun(page: Page): Promise<void> {
  await expect(poster(page)).toBeVisible({ timeout: 20_000 });
  await poster(page).click();
  await expect(poster(page)).toHaveCount(0);
}

/** The replay in the frame is paused (`data-playing` of its Play key, src/player/view.ts). */
export async function pausedInFrame(page: Page): Promise<void> {
  await expect(replay(page).locator('.wc-pc-play')).toHaveAttribute('data-playing', 'false', { timeout: 20_000 });
}

/** The state box's two lines. */
export async function expectEnd(page: Page, first: string, second?: string): Promise<void> {
  await expect(endBox(page).locator('.wc-lk-q')).toHaveText(first);
  if (second !== undefined) await expect(endBox(page).locator('.wc-lk-qn')).toHaveText(second);
  await expect(endBox(page).locator('[data-btn="BACK"]')).toContainText('Back to MUME Cockpit');
}

/** A guest watches the seeded run: the band's words, the replay, one view. */
export async function guestWatches(page: Page, s: WatchSetup): Promise<void> {
  await openWatch(page);
  await playing(page);
  await expect(band(page).locator('[data-watch="title"]')).toHaveText('Clearing the ranger camp');
  // No level (owner's feedback on stage 65, ADR 0155 W1), though the meta has 42.
  await expect(band(page).locator('[data-watch="meta"]')).toHaveText(/^Rasta·1 h 15 min·26 September 2026·37 views·shared by fenwick$/);
  await expect(watchBtn(page, 'REPORT')).toBeVisible();
  // No Download as HTML (W1).
  await expect(watchBtn(page, 'DOWNLOAD')).toHaveCount(0);
  await expect(watchBtn(page, 'BACK')).toBeVisible();
  // The view, once.
  await expect.poll(() => s.pubs.views.length).toBe(1);
  await page.waitForTimeout(500);
  expect(s.pubs.viewRequests).toHaveLength(1);
  expect(s.pubs.views[0]!.id).toBe(ID);
  // The device id is the statistics' own (made now: the page had none).
  const device = await page.evaluate(() => localStorage.getItem('wc.device'));
  expect(s.pubs.views[0]!.device).toBe(device);
}

/** The iframe's element is the page's fullscreen element. */
export const frameIsFullscreen = (page: Page): Promise<boolean> =>
  page.evaluate(() => document.fullscreenElement !== null && document.fullscreenElement === document.querySelector('.wc-watch-slot iframe'));

/** The frame covers the whole window, the band under it (what is on top at the band's middle is the frame). */
export async function frameFillsWindow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const f = document.querySelector('.wc-watch-slot iframe')!.getBoundingClientRect();
    const b = document.querySelector('.wc-watch-band')!.getBoundingClientRect();
    const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return f.x <= 0 && f.y <= 0 && f.width >= innerWidth - 1 && f.height >= innerHeight - 1 && top?.tagName === 'IFRAME';
  });
}

/** Makes the frame's document say it has no element fullscreen (as the iPhone's Safari). */
export async function noFrameFullscreen(page: Page): Promise<void> {
  const f = page.frames().find((x) => x.url().endsWith('/r/frame'))!;
  await f.evaluate(() => Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false, configurable: true }));
}
