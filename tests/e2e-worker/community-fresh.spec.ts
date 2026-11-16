// Stage 65, owner's feedback 4 (W4, ADR 0155 "As built (stage 65, owner's
// feedback: W4, freshness)"), against the real local Worker with its Cache
// API (`npm run test:sync-worker`): what the owner met on staging.
//
// (a) A and B (each logged in, each a browser of its own, B a fresh
//     "private" context) write notes after both opened the board: B's
//     reload shows the whole board, its own note and A's, not the answer
//     the Worker kept from before.
// (b) A guest that opened the Community page before A listed a run sees
//     the run when it opens the page again, and after a reload.
//
// Before the fix both failed for the 60 s of the Worker's cache (and the
// browser's own max-age=60): nothing a reload or re-entry did could pass it.

import { type Browser, type BrowserContext, type Page, type TestInfo, expect, test } from '@playwright/test';
import { btn, dialog, field, fillCreate, link, openAccount, pageOf, shownCode, watchErrors } from '../e2e/account-pages';
import { btnIn, cm, noteField, notes, openCommunity, rows, runes } from '../e2e/community';
import { exp, openEditor, restoreDemo } from '../e2e/community-pub';
import { pinDemoClock } from '../e2e/demo-clock';
import { awayFromMenu, owner } from '../e2e/sync-pages';
import { stubTurnstile } from '../e2e/turnstile-stub';

test.use({ viewport: { width: 1440, height: 900 } });

const projectIndex = (info: TestInfo): number => info.config.projects.findIndex((p) => p.name === info.project.name);

/** A browser context of its own (a fresh one: as a private window), its requests from `address` (the limits per address). */
async function device(browser: Browser, address: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { 'CF-Connecting-IP': address } });
  const page = await ctx.newPage();
  await stubTurnstile(page, { auto: true });
  return { ctx, page };
}

async function createAccount(page: Page, name: string): Promise<void> {
  await openAccount(page);
  await link(page, 'create').click();
  await fillCreate(page, name);
  await expect(btn(page, 'CREATE')).not.toHaveAttribute('aria-disabled', 'true');
  await btn(page, 'CREATE').click();
  await expect(pageOf(page, 'code')).toBeVisible({ timeout: 30_000 });
  const code = await shownCode(page);
  await field(page, 'last').fill(code.slice(-4));
  await awayFromMenu(page);
  await field(page, 'last').press('Enter');
  await expect.poll(() => owner(page), { timeout: 30_000 }).toMatch(new RegExp(`${name}.*synced`, 'i'));
}

async function writeNote(page: Page, text: string): Promise<void> {
  await expect(runes(page)).toBeVisible();
  await noteField(page).click();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await expect(notes(page).filter({ hasText: text })).toHaveCount(1, { timeout: 15_000 });
}

/** Off the Community page (Esc; a first Esc may only leave the note field). */
async function leave(page: Page): Promise<void> {
  await expect(async () => {
    await page.keyboard.press('Escape');
    await expect(cm(page)).toHaveCount(0, { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
}

/** The board's notes as shown, once it is loaded. */
async function boardTexts(page: Page): Promise<string[]> {
  await expect(runes(page).locator('.wc-cy-none', { hasText: 'Loading' })).toHaveCount(0, { timeout: 15_000 });
  return notes(page).locator('.wc-cy-note-t').allTextContents();
}

test('fresh community data: a logged-in player sees the whole board after a reload; a guest sees a new listing on re-entry and reload', async ({ browser }, info) => {
  test.setTimeout(300_000);
  const ip = (n: number): string => `10.66.${projectIndex(info)}.${n}`;
  const suffix = Date.now().toString(36).slice(-6);
  const nameA = `fra${suffix}`;
  const nameB = `frb${suffix}`;

  const a = await device(browser, ip(1));
  const b = await device(browser, ip(2));
  const g = await device(browser, ip(3));
  const errors = [watchErrors(a.page), watchErrors(b.page), watchErrors(g.page)];
  await pinDemoClock(a.page);
  await createAccount(a.page, nameA);
  await restoreDemo(a.page);
  await createAccount(b.page, nameB);

  // Everybody opens the Community page first: the Worker keeps its answers.
  // (The other project's run, on the same Worker, left a run and notes: only the newest are asserted.)
  await openCommunity(g.page);
  await expect(cm(g.page).locator('.wc-cy-list')).not.toHaveAttribute('data-state', 'loading', { timeout: 15_000 });
  await openCommunity(b.page);
  await boardTexts(b.page);
  await openCommunity(a.page);
  await boardTexts(a.page);

  // (a) A writes, then B; B's reload shows both (and its own is still there).
  const noteA = `From A ${suffix}`;
  const noteB = `From B ${suffix}`;
  await writeNote(a.page, noteA);
  await writeNote(b.page, noteB);
  await openCommunity(b.page);
  await expect.poll(async () => (await boardTexts(b.page)).slice(0, 2), { timeout: 10_000 }).toEqual([`${nameB}: ${noteB}`, `${nameA}: ${noteA}`]);
  // The guest's page opened again: the whole board too.
  await leave(g.page);
  await g.page.keyboard.press('c');
  await expect.poll(async () => (await boardTexts(g.page)).slice(0, 2), { timeout: 10_000 }).toEqual([`${nameB}: ${noteB}`, `${nameA}: ${noteA}`]);

  // (b) A lists a run to the Hall of Fame.
  await leave(a.page);
  await openEditor(a.page);
  await a.page.keyboard.press('f');
  await expect(exp(a.page)).toHaveAttribute('data-format', 'hof');
  await btn(a.page, 'EXPORT').click();
  const share = dialog(a.page, 'share');
  await share.locator('[data-field="title"] input').fill('Fresh at the ford');
  await share.locator('[data-field="rules"]').click();
  await btn(a.page, 'PUBLISH').click();
  const done = dialog(a.page, 'share-done');
  await expect(done.locator('.wc-lk-hood-t')).toHaveText('Published', { timeout: 30_000 });
  const id = /\/r\/([A-Za-z0-9_-]{12})$/.exec(await done.locator('[data-field="link"] input').inputValue())?.[1];
  expect(id).toBeDefined();
  await btnIn(done, 'DONE').click();

  // The guest leaves the page and opens it again: the run is there at once.
  await leave(g.page);
  await g.page.keyboard.press('c');
  await expect(cm(g.page).locator('.wc-cy-list')).toHaveAttribute('data-state', 'list', { timeout: 10_000 });
  await expect(rows(g.page).first()).toHaveAttribute('data-id', id!);
  // And after a reload.
  await openCommunity(g.page);
  await expect(cm(g.page).locator('.wc-cy-list')).toHaveAttribute('data-state', 'list', { timeout: 10_000 });
  await expect(rows(g.page).first()).toHaveAttribute('data-id', id!);

  for (const e of errors) expect(e).toEqual([]);
  await a.ctx.close();
  await b.ctx.close();
  await g.ctx.close();
});
