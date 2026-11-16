// What the Community page's specs share (stage 65 C1): the fakes on a
// page with the flags `accounts`, `share`, `gallery` and `runes`, seeded
// runs, notes and MUME's boxes, the way in and the locators. Not a spec.
// Used by community-page.spec.ts (desktop, Chromium and Firefox) and
// phone-community-page.spec.ts.
//
// The page talks to the account fake (cloud-account-fake.ts, its block
// "The community") and, for Report on a note, to the pub fake beside it
// (cloud-pub-fake.ts), on the dev server with `?cloudtest`.
//
// Screenshots: `WC_COMMUNITY_SHOTS=<dir>` writes each state's picture
// there (desktop 1440 × 900, phone 390 × 844 and 320 × 568); without it
// nothing is written.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { type Locator, type Page, expect } from '@playwright/test';
import type { Config } from '../../shared/cloud/api';
import { SKY } from './account-pages';
import { type FakeAccountApi, FakeAccountServer, type SeedFields, fakeAccountApi } from './cloud-account-fake';
import { type FakePubs, fakePubApi } from './cloud-pub-fake';

export const ME = 'fenwick';
export const SENDERS = ['marrowfield', 'brego', 'saelind', 'quillon', 'hollin'] as const;
const HOUR = 3_600_000;

const TITLES = [
  'Gibur and the Witch-king’s lieutenant',
  'Orc raid on the Old Forest Road',
  'Holding the Fords of Isen',
  'Ghost of Weathertop',
  'Clearing the ranger camp',
  'Three trolls at the Last Bridge',
  'Lost in Mirkwood, found by spiders',
  'The siege of the Osgiliath bridge',
  'A quiet night in Bree',
  'Ambush below Caradhras',
  'Barrow-downs by moonlight',
  'Racing the sun to Rivendell',
];

export interface CommunitySetup {
  api: FakeAccountApi;
  pubs: FakePubs;
  server: FakeAccountServer;
  /** The seeded runs, newest listed first. */
  runs: string[];
}

let fields: SeedFields | null = null;

/** One registration's fields for every seeded account (its password is not used: logins are by session). */
async function seedFields(): Promise<SeedFields> {
  if (fields) return fields;
  const { prepareRegistration } = await import('../../src/cloud/crypto/account');
  fields = (await prepareRegistration('fenwick', 'correct horse battery')).request as unknown as SeedFields;
  return fields;
}

/**
 * The fakes on `page`: the accounts `ME` and `SENDERS`, `runs` listed runs
 * (one an hour back from now, the senders in turn, `ME`'s every sixth),
 * votes, comments and views on some. `flags` replaces the community's.
 */
export async function setUp(page: Page, o: { runs?: number; flags?: Config['flags']; mume?: boolean; notes?: boolean } = {}): Promise<CommunitySetup> {
  const api = await fakeAccountApi(page);
  const server = api.server;
  server.flags = { accounts: true, share: true, gallery: true, runes: true, ...o.flags };
  const f = await seedFields();
  for (const n of [ME, ...SENDERS]) server.seed(n, f, { created: server.now() - 30 * 24 * HOUR });
  const pubs = await fakePubApi(page, api);
  const runs: string[] = [];
  const n = o.runs ?? 23;
  const t = server.now();
  for (let i = 0; i < n; i++) {
    const sender = i % 6 === 5 ? ME : SENDERS[i % SENDERS.length]!;
    const id = server.addPub(sender, {
      title: TITLES[i % TITLES.length]! + (i >= TITLES.length ? ` ${Math.floor(i / TITLES.length) + 1}` : ''),
      description: i === 0 ? 'Down the ford at dusk; the orcs came early.\nKuzzim held the bank.' : '',
      character: ['Gibur', 'Ugluk', 'Eothain', 'Saelind', 'Rasta', 'Pip'][i % 6]!,
      level: 9 + ((i * 7) % 33),
      lengthS: 600 + ((i * 1337) % 14_000),
      listed: true,
      listedAt: t - (i + 1) * HOUR - 2 * 24 * HOUR,
      views: (i * 37) % 400,
      created: t - (i + 1) * HOUR - 2 * 24 * HOUR,
    });
    runs.push(id);
  }
  // Stars and comments on a few.
  for (let i = 0; i < Math.min(n, 8); i++) {
    for (let v = 0; v < (i % 4) + 1; v++) server.addVote(SENDERS[(i + v + 1) % SENDERS.length]!, runs[i]!, 3 + ((i + v) % 3));
    for (let c = 0; c < i % 3; c++) server.addComment(SENDERS[c]!, runs[i]!, 'Nice fight.');
  }
  if (o.notes !== false) {
    server.addNote('hollin', 'anyone up for Moria tonight? 20:00 by the west gate, bring light and a healer', { ago: 2 * 60_000 });
    server.addNote('saelind', 'thanks to whoever left the lembas at the Prancing Pony', { ago: 14 * 60_000 });
    server.addNote('brego', 'the Fords of Isen log is up: two hours, three fights', { ago: 2 * HOUR });
  }
  if (o.mume !== false) {
    server.mume = {
      west: [
        { name: 'Eothain', race: 'Man', class: 'warrior' },
        { name: 'Arwenel', race: 'Elf', class: 'ranger' },
        { name: 'Durlin', race: 'Dwarf', class: 'warrior' },
        { name: 'Morwen', race: 'Man', class: 'mage' },
        { name: 'Celebrin', race: 'Elf', class: 'cleric' },
        { name: 'Sixth', race: 'Hobbit', class: 'thief' },
        { name: 'Haldoran', race: 'Elf', class: 'warrior' },
        { name: 'Beregond', race: 'Man', class: 'warrior' },
        { name: 'Tolman', race: 'Hobbit', class: 'ranger' },
        { name: 'Dwalin', race: 'Dwarf', class: 'cleric' },
        { name: 'Eleventh', race: 'Man', class: 'thief' },
      ],
      dark: [
        { name: 'Grishvak', race: 'Orc', class: 'warrior' },
        { name: 'Ugluk', race: 'Uruk-hai', class: 'warrior' },
        { name: 'Shagrat', race: 'Orc', class: 'thief' },
        { name: 'Lurtz', race: 'Troll', class: 'warrior' },
        { name: 'Gorbag', race: 'Orc', class: 'mage' },
        { name: 'Snaga', race: 'Orc', class: 'thief' },
        { name: 'Mauhur', race: 'Uruk-hai', class: 'warrior' },
        { name: 'Bolg', race: 'Orc', class: 'warrior' },
        { name: 'Gothmog', race: 'Troll', class: 'cleric' },
      ],
      players: 38,
    };
  }
  return { api, pubs, server, runs };
}

/** Logs the page in as `ME` (a session on the fake, the page's hint). */
export async function logIn(page: Page, s: CommunitySetup, name: string = ME): Promise<void> {
  s.server.logInBrowser(s.api.browser, name);
  await page.addInitScript((n) => localStorage.setItem('wc.account', JSON.stringify({ name: n })), name);
}

export const start = (page: Page): Locator => page.locator('.wc-start');
export const communityRow = (page: Page): Locator => page.locator('.wc-start .wc-sm-item[data-key="community"]');
/** The Community page's box. */
export const cm = (page: Page): Locator => page.locator('.wc-start .wc-frame:not([hidden]) .wc-cy');
export const rows = (page: Page): Locator => cm(page).locator('.wc-cy-row');
export const head = (page: Page, sort: string): Locator => cm(page).locator(`.wc-cy-th[data-sort="${sort}"]`);
export const pager = (page: Page): Locator => cm(page).locator('.wc-cy-paget');
export const runes = (page: Page): Locator => cm(page).locator('.wc-cy-runes');
export const notes = (page: Page): Locator => runes(page).locator('.wc-cy-note');
export const noteField = (page: Page): Locator => runes(page).locator('[data-field="note"] textarea');
export const box = (page: Page, name: string): Locator => cm(page).locator(`[data-box="${name}"]`);
export const btnIn = (scope: Locator, id: string): Locator => scope.locator(`[data-btn="${id}"]`);
export const dialog = (page: Page, dlg: string): Locator => page.locator(`.wc-start .wc-frame:not([hidden]) [data-dlg="${dlg}"]`);

/** The start page with the fakes (`query` starts with `&`). */
export async function openStart(page: Page, query = ''): Promise<void> {
  await page.goto(`/?cloudtest&${SKY}${query}`);
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
}

/** The start page, then C: the Community page with its list (the phone: its dashboard's newest runs). */
export async function openCommunity(page: Page, query = ''): Promise<void> {
  await openStart(page, query);
  await expect(communityRow(page)).toBeVisible();
  await page.keyboard.press('c');
  await expect(cm(page)).toBeVisible();
  await expect(cm(page).locator('.wc-cy-list, [data-box="newest"]').first()).not.toHaveAttribute('data-state', 'loading');
}

/** A picture of the state (only with `WC_COMMUNITY_SHOTS=<dir>`). */
export async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.WC_COMMUNITY_SHOTS;
  if (!dir) return;
  await page.waitForTimeout(2000);
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.jpg`), type: 'jpeg', quality: 72, scale: 'css' });
}

/**
 * The wide page's two columns (owner's feedback round 3, ADR 0155): the
 * list's rule (the heading row's bottom edge, over the first log) and the
 * top edge of Log of the day on one line (±0.5 px); the players' figure at
 * least 10 px below the window's inner top edge; Back clear of the
 * headings (4 px of air above them) and of the figure.
 */
export async function columnsAligned(page: Page): Promise<void> {
  await expect(box(page, 'day')).toBeVisible();
  await expect(box(page, 'players')).toBeVisible();
  const g = await cm(page).evaluate((el) => {
    const r = (q: string) => el.querySelector(q)!.getBoundingClientRect();
    const win = el.querySelector(':scope > .wc-lk-win')!;
    const inner = win.getBoundingClientRect().top + parseFloat(getComputedStyle(win).borderTopWidth);
    const back = r(':scope > .wc-lk-back');
    const heads = [...el.querySelectorAll('.wc-cy-throw .wc-cy-th, .wc-cy-throw .wc-cy-search')].map((e) => e.getBoundingClientRect().top);
    const pl = r('[data-box="players"]');
    return {
      rule: r('.wc-cy-throw').bottom,
      day: r('[data-box="day"]').top,
      figure: r('.wc-cy-players-n').top - inner,
      backBottom: back.bottom,
      headsTop: Math.min(...heads),
      backMeetsFigure: back.right > pl.left && back.left < pl.right && back.bottom > pl.top && back.top < pl.bottom,
    };
  });
  expect(Math.abs(g.rule - g.day), `the list's rule (${g.rule}) and Log of the day (${g.day}) on one line`).toBeLessThanOrEqual(0.5);
  expect(g.figure, 'the players’ figure below the window’s inner top').toBeGreaterThanOrEqual(10);
  expect(g.headsTop - g.backBottom, 'air between Back and the headings').toBeGreaterThanOrEqual(4);
  expect(g.backMeetsFigure, 'Back clear of the players’ figure').toBe(false);
}
