// Stage 80 part E (ADR 0173): the directory of shared looks through the real
// local Worker, on two browser contexts (two players, logged out). Each logs
// in to a mocked MUME (tests/e2e/mume-login-mock.ts: nothing reaches MUME)
// with a character of its own; A chose a library token, B is automatic
// with its sex known. Both report; then each has the other in its group:
// A sees B's engraved drawing for B's race and sex, B sees A's library
// token, and a third name that never reported is the neutral figure. A's
// switch off removes A's row: the Worker answers no row for it.
//
// The two projects share one local D1: names are unique per run and
// project, letters only, and each context has an address of its own.

import { type Browser, type BrowserContext, type Page, type TestInfo, expect, test } from '@playwright/test';
import { type LoginMock, loginMock } from '../e2e/mume-login-mock';

test.use({ viewport: { width: 1440, height: 900 } });

const projectIndex = (info: TestInfo): number => info.config.projects.findIndex((p) => p.name === info.project.name);
const field = (page: Page) => page.locator('.wc-input-slot .wc-input-field');
const tkd = (page: Page, id: number) => page.locator(`.wc-pane[data-pane="group"] .wc-gp-row[data-key="m${id}"] .wc-gp-tkd`);
const wire = (s: string): number[] => [...Buffer.from(s, 'utf8')];
const gmcp = (pkg: string, data: unknown): number[] => [255, 250, 201, ...wire(`${pkg} ${JSON.stringify(data)}`), 255, 240];
const play = (m: LoginMock, ...parts: number[][]): void => void m.server().send(Buffer.from(parts.flat()));

/** Letters only: a number in base 26 as a–z. */
const letters = (n: number): string => {
  let s = '';
  do {
    s = String.fromCharCode(97 + (n % 26)) + s;
    n = Math.floor(n / 26);
  } while (n > 0);
  return s;
};

async function device(browser: Browser, address: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { 'CF-Connecting-IP': address } });
  return { ctx, page: await ctx.newPage() };
}

/** A live login on the mock as `name` (with `?cloudtest`: the API is allowed under webdriver), Group and Character shown. */
async function enter(page: Page, name: string): Promise<LoginMock> {
  const m = await loginMock(page, { name });
  await page.goto('/?cloudtest');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.evaluate(() => window.__wc!.settings.update({ character: { fetchInfo: false }, panes: { character: { on: true }, group: { on: true } } }));
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await expect(field(page)).toBeFocused();
  await page.keyboard.type(name.toLowerCase());
  await page.keyboard.press('Enter');
  await expect(field(page)).toHaveClass(/\bwc-masked\b/);
  await page.keyboard.type(m.password);
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^playing/);
  return m;
}

/** What the Worker answers for `names` (the page's own origin, as the client asks). */
async function find(page: Page, names: string[]): Promise<Record<string, unknown>> {
  return page.evaluate(async (n) => {
    const res = await fetch('/api/look/find', { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json', 'X-WC': '1' }, body: JSON.stringify({ names: n }) });
    return ((await res.json()) as { looks: Record<string, unknown> }).looks;
  }, names);
}

test('two players in one group see each other’s reported look and library token; a third name is the neutral figure', async ({ browser }, info) => {
  test.setTimeout(180_000);
  const ip = (n: number): string => `10.81.${projectIndex(info)}.${n}`;
  const tag = letters(Date.now() % 26 ** 6) + letters(projectIndex(info) + 1);
  const A = `Aa${tag}`;
  const B = `Bb${tag}`;
  const C = `Cc${tag}`;
  const lower = (s: string) => s.toLowerCase();

  const a = await device(browser, ip(1));
  const b = await device(browser, ip(2));
  const ma = await enter(a.page, A);
  const mb = await enter(b.page, B);

  // A: an elf with a library token; B: a dwarf, female (the sex as the info poll would set it).
  await a.page.evaluate((n) => window.__wc!.app.looks!.choose(n, { src: 'lib', id: 'elf-f-noldor' }, true), A);
  play(ma, gmcp('Char.StatusVars', { race: 'Elf', subrace: 'Noldo', level: 30 }));
  play(mb, gmcp('Char.StatusVars', { race: 'Dwarf', subrace: 'Longbeard', level: 30 }));
  await b.page.evaluate(() => window.__wc!.app.game.applySex('female'));

  await expect
    .poll(() => find(a.page, [A, B]), { timeout: 20_000 })
    .toEqual({
      [lower(A)]: { race: 'elf', subrace: 'noldo', sex: null, token: 'elf-f-noldor' },
      [lower(B)]: { race: 'dwarf', subrace: 'longbeard', sex: 'female', token: null },
    });
  // Each client's key is its own, and not the heartbeat's device id.
  const keyA = await a.page.evaluate(() => localStorage.getItem('wc.lookKey'));
  const keyB = await b.page.evaluate(() => localStorage.getItem('wc.lookKey'));
  expect(keyA).toBeTruthy();
  expect(keyA).not.toBe(keyB);

  // The groups: each has the other and C, who never reported.
  const v = { hp: 70, maxhp: 160, position: 'standing' };
  play(ma, gmcp('Group.Set', [{ id: 2, type: 'ally', name: B, ...v }, { id: 3, type: 'ally', name: C, ...v }]));
  play(mb, gmcp('Group.Set', [{ id: 2, type: 'ally', name: A, ...v }, { id: 3, type: 'ally', name: C, ...v }]));
  await expect(tkd(a.page, 2)).toHaveAttribute('data-look', 'drawn:longbeard:female', { timeout: 15_000 });
  await expect(tkd(b.page, 2)).toHaveAttribute('data-look', 'lib:elf-f-noldor', { timeout: 15_000 });
  await expect(tkd(a.page, 3)).toHaveAttribute('data-look', 'drawn:neutral:-');
  await expect(tkd(b.page, 3)).toHaveAttribute('data-look', 'drawn:neutral:-');
  // The picker's source line for a member says where the look comes from.
  await tkd(b.page, 2).click();
  await expect(b.page.locator('[data-dlg="look"]')).toContainText('Shared by the player');
  await b.page.keyboard.press('Escape');

  // A's switch off: A's row goes.
  await a.page.evaluate(() => window.__wc!.settings.update({ character: { shareLook: false } }));
  await expect.poll(() => find(b.page, [A, B]), { timeout: 15_000 }).toEqual({ [lower(B)]: { race: 'dwarf', subrace: 'longbeard', sex: 'female', token: null } });

  await a.ctx.close();
  await b.ctx.close();
});
