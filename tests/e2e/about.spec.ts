// Stage 47 (ADR 0132, Inv §3.11): About as one long leaf, round 7's A
// "Bladet". The small wordmark and `WebCockpit x.y.z (commit)` at the head,
// the contents rail that follows the reading, the section letters, the
// scroll keys (↑ ↓ 40 px, PgUp / PgDn / Space / Enter 85 % of the view,
// Home / End), the links (a new tab; the site's own files served,
// THIRD_PARTY_NOTICES.md among them), the seal at the end, Esc and Back.
// The phone's strip of section pills: phone-credits-about.spec.ts.
import { readFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { backTo, lookBox, morphDone, openFromMenu, openStart } from './look';

const menuSel = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden]) .wc-sm-item.is-sel .wc-sm-label');
const body = (page: Page) => lookBox(page).locator('.wc-about-body');
const rail = (page: Page) => lookBox(page).locator('.wc-about-rail');
const railOn = (page: Page) => rail(page).locator('.wc-about-row.is-on');
const scrollTop = (page: Page): Promise<number> => body(page).evaluate((b) => Math.round(b.scrollTop));
const view = (page: Page): Promise<number> => body(page).evaluate((b) => b.clientHeight);
const maxTop = (page: Page): Promise<number> => body(page).evaluate((b) => b.scrollHeight - b.clientHeight);
/** Where section `id`'s head sits under the top of the view (px). */
const headAt = (page: Page, id: string): Promise<number> =>
  page.evaluate((id) => {
    const b = document.querySelector('.wc-start .wc-frame:not([hidden]) .wc-about-body')!;
    const h = b.querySelector(`[data-sec="${id}"]`)!;
    return Math.round(h.getBoundingClientRect().top - b.getBoundingClientRect().top);
  }, id);

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function openAbout(page: Page): Promise<void> {
  await openFromMenu(page, 'about');
  await expect(lookBox(page).locator('.wc-lk-hood-t')).toHaveText('About');
  await morphDone(page);
}

const LETTERS = ['W', 'M', 'G', 'B', 'I', 'S', 'U', 'C', 'L'];
const SECTIONS = ['intro', 'mume', 'start', 'pvp', 'inside', 'settings', 'lua', 'credits', 'licence'];

test('the leaf: small wordmark and version, sections, rail with letters, seal; Esc leaves', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStart(page);
  await openAbout(page);
  await expect(lookBox(page)).toHaveClass(/wc-lk-box-large/);

  // The head: the small wordmark (MUME only), the version and the build commit.
  const head = lookBox(page).locator('.wc-about-head');
  await expect(head.locator('.wc-about-mark')).toBeVisible();
  const markH = await head.locator('.wc-about-mark').evaluate((e) => e.getBoundingClientRect().height);
  expect(markH).toBeLessThanOrEqual(80);
  const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
  await expect(head.locator('.wc-about-ver')).toHaveText(/^WebCockpit \d+\.\d+\.\d+( \([^)]+\))?$/);
  await expect(head.locator('.wc-about-ver')).toContainText(`WebCockpit ${version}`);
  // The intro as the lead-in, then the eight titled sections, key/value tables, the seal.
  await expect(lookBox(page).locator('.wc-about-lead').first()).toContainText('WebCockpit is a MUD client for MUME');
  await expect(lookBox(page).locator('.wc-about-sec')).toHaveCount(8);
  await expect(lookBox(page).locator('.wc-about-h')).toHaveText([
    /^MUME — MULTI-USERS IN MIDDLE-EARTH$/,
    'GETTING STARTED',
    'BUILT FOR PVP',
    'WHAT IS INSIDE',
    'SETTINGS',
    'LUA SCRIPTS',
    'CREDITS',
    'LICENCE',
  ]);
  await expect(lookBox(page).locator('[data-sec="inside"] .wc-lk-kv dt')).toHaveText(['Panes', 'Profile', 'Map', 'Weather', 'Runs', 'Phone']);
  await expect(lookBox(page).locator('[data-sec="credits"] .wc-lk-kv dt').first()).toHaveText('MMapper');
  await expect(lookBox(page).locator('.wc-about-colophon img')).toHaveCount(1);
  // The rail: nine rows, each with its letter; the intro lit at the top.
  await expect(rail(page)).toBeVisible();
  await expect(rail(page).locator('.wc-about-row')).toHaveCount(9);
  expect(await rail(page).locator('.wc-about-row u.wc-sk').allTextContents()).toEqual(LETTERS.map((l) => expect.stringMatching(new RegExp(`^${l}$`, 'i'))));
  expect(await rail(page).locator('.wc-about-row').evaluateAll((r) => r.map((e) => e.getAttribute('data-sec-link')))).toEqual(SECTIONS);
  await expect(railOn(page)).toHaveAttribute('data-sec-link', 'intro');
  // The pills strip is the narrow form: hidden here.
  await expect(lookBox(page).locator('.wc-lk-seg[aria-label="Contents"]')).toBeHidden();

  await page.keyboard.press('Escape');
  await expect(menuSel(page)).toHaveText('About');
  expect(errors).toEqual([]);
});

test('keys: ↓ a line, PgDn / Space / Enter a page, PgUp, Home / End; the rail follows the reading', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStart(page);
  await openAbout(page);
  const h = await view(page);
  expect(await scrollTop(page)).toBe(0);

  await page.keyboard.press('ArrowDown');
  await expect.poll(() => scrollTop(page)).toBe(40);
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => scrollTop(page)).toBe(0);
  await page.keyboard.press('PageDown');
  await expect.poll(() => scrollTop(page)).toBeGreaterThan(Math.round(h * 0.85) - 3);
  expect(await scrollTop(page)).toBeLessThan(Math.round(h * 0.85) + 3);
  await page.keyboard.press('Space');
  await expect.poll(() => scrollTop(page)).toBeGreaterThan(Math.round(h * 1.7) - 5);
  await page.keyboard.press('Enter');
  await expect.poll(() => scrollTop(page)).toBeGreaterThan(Math.round(h * 2.55) - 8);
  await page.keyboard.press('PageUp');
  await expect.poll(() => scrollTop(page)).toBeLessThan(Math.round(h * 1.7) + 8);
  // The rail follows: the lit row is a section past the intro by now.
  await expect(railOn(page)).not.toHaveAttribute('data-sec-link', 'intro');

  // The spy: a section whose head has passed a third of the view is lit.
  await body(page).evaluate((b) => {
    const s = b.querySelector<HTMLElement>('[data-sec="inside"]')!;
    b.scrollTop += s.getBoundingClientRect().top - b.getBoundingClientRect().top - 40;
  });
  await expect(railOn(page)).toHaveAttribute('data-sec-link', 'inside');
  await expect(railOn(page)).toHaveAttribute('aria-current', 'true');

  // End: the last section and the seal; Home: back to the top.
  await page.keyboard.press('End');
  await expect.poll(async () => (await maxTop(page)) - (await scrollTop(page))).toBeLessThanOrEqual(1);
  await expect(railOn(page)).toHaveAttribute('data-sec-link', 'licence');
  await expect(lookBox(page).locator('.wc-about-colophon img')).toBeInViewport();
  await page.keyboard.press('Home');
  await expect.poll(() => scrollTop(page)).toBe(0);
  await expect(railOn(page)).toHaveAttribute('data-sec-link', 'intro');

  await backTo(page);
  await expect(menuSel(page)).toHaveText('About');
  expect(errors).toEqual([]);
});

test('a letter or a rail click jumps to its section, which stays lit', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStart(page);
  await openAbout(page);

  // C: Credits.
  await page.keyboard.press('c');
  await expect(railOn(page)).toHaveAttribute('data-sec-link', 'credits');
  await expect.poll(() => headAt(page, 'credits')).toBeLessThan(60);
  expect(await headAt(page, 'credits')).toBeGreaterThanOrEqual(0);
  await page.waitForTimeout(400);
  await expect(railOn(page)).toHaveAttribute('data-sec-link', 'credits');
  // G: Getting started (upwards).
  await page.keyboard.press('g');
  await expect(railOn(page)).toHaveAttribute('data-sec-link', 'start');
  await expect.poll(() => headAt(page, 'start')).toBeLessThan(60);
  // A rail click.
  await rail(page).locator('.wc-about-row[data-sec-link="mume"]').click();
  await expect(railOn(page)).toHaveAttribute('data-sec-link', 'mume');
  await expect.poll(() => headAt(page, 'mume')).toBeLessThan(60);
  // W: back to the top.
  await page.keyboard.press('w');
  await expect.poll(() => scrollTop(page)).toBe(0);
  await expect(railOn(page)).toHaveAttribute('data-sec-link', 'intro');
  expect(errors).toEqual([]);
});

test('links open in a new tab; the licence and the third-party notices are served at the site root', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStart(page);
  await openAbout(page);
  const links = lookBox(page).locator('.wc-about-leaf a');
  expect(await links.count()).toBeGreaterThanOrEqual(8);
  for (const a of await links.all()) {
    await expect(a).toHaveAttribute('target', '_blank');
    await expect(a).toHaveAttribute('rel', /noopener/);
  }
  const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
  for (const site of ['https://mume.org', 'https://discord.gg/', 'https://github.com/MUME/MMapper', 'https://github.com/Khazdul/webcockpit', 'https://tintin.mudhalla.net'])
    expect(hrefs.some((h) => h.startsWith(site))).toBe(true);

  // The site's own files, under the base path; each one is served.
  for (const file of ['LICENSE.txt', 'fonts/README.md', 'THIRD_PARTY_NOTICES.md']) {
    const a = lookBox(page).locator(`.wc-about-leaf a[href$="/${file}"]`);
    await expect(a).toHaveCount(1);
    const res = await page.request.get(new URL((await a.getAttribute('href'))!, page.url()).href);
    expect(res.status()).toBe(200);
  }
  // The notices link is the last line of Licence.
  const notices = lookBox(page).locator('[data-sec="licence"] a[href$="/THIRD_PARTY_NOTICES.md"]');
  await expect(notices).toHaveText('THIRD_PARTY_NOTICES.md');
  const res = await page.request.get(new URL((await notices.getAttribute('href'))!, page.url()).href);
  expect(await res.text()).toMatch(/Cormorant Garamond/);
  // Game commands are set in the terminal font, not links.
  await expect(lookBox(page).locator('.wc-about-cmd')).toContainText(['pray to the tower hills', 'help newbie', 'who ranger', '#help', '?safe']);
});
