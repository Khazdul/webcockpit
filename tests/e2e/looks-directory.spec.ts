// The directory of shared looks against a stubbed API (stage 80 part E,
// ADR 0173; `?cloudtest` and `page.route`, as cloud-stats.spec.ts): a live
// login without MUME (mume-login-mock.ts) reports the character's kinds and
// asks for the group's players; a member's row draws its look; with the
// flag off no look request is made at all; a fixture replay never reports
// or asks; the switch off sends the DELETE; a 409 shows in the picker.
// The two-device test against the real Worker is tests/e2e-worker/looks-dir-worker.spec.ts.
import { type Page, type Request, expect, test } from '@playwright/test';
import { type LoginMock, loginMock } from './mume-login-mock';

test.use({ viewport: { width: 1440, height: 900 } });

const field = (page: Page) => page.locator('.wc-input-slot .wc-input-field');
const tkd = (page: Page, id: number) => page.locator(`.wc-pane[data-pane="group"] .wc-gp-row[data-key="m${id}"] .wc-gp-tkd`);
const wire = (s: string): number[] => [...Buffer.from(s, 'utf8')];
const gmcp = (pkg: string, data: unknown): number[] => [255, 250, 201, ...wire(`${pkg} ${JSON.stringify(data)}`), 255, 240];
const play = (m: LoginMock, ...parts: number[][]): void => void m.server().send(Buffer.from(parts.flat()));
const MEMBERS = [
  { id: 2, type: 'ally', name: 'Glorfindel', hp: 70, maxhp: 160, position: 'standing' },
  { id: 3, type: 'ally', name: 'Strangerx', hp: 70, maxhp: 160, position: 'standing' },
  { id: 4, type: 'npc', name: 'a trained horse', label: 'HORSE', position: 'standing' },
];

interface Stub {
  requests: Request[];
  looks(): { method: string; path: string; body: unknown; cookie: string | undefined }[];
}

/** `/api/*`: the flags, and the look routes (204, or `put`'s status; find answers `rows`). */
async function stub(page: Page, o: { looks: boolean; put?: number; rows?: Record<string, unknown> }): Promise<Stub> {
  const requests: Request[] = [];
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    requests.push(req);
    const path = new URL(req.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/config') return json({ flags: o.looks ? { looks: true } : {} });
    if (path === '/api/look/find') return json({ looks: o.rows ?? {} });
    if (path === '/api/look' || path === '/api/u/look') {
      const status = req.method() === 'PUT' ? (o.put ?? 204) : 204;
      return status === 204 ? route.fulfill({ status: 204 }) : json({ error: 'look_owned' }, status);
    }
    return json({ error: 'not_found' }, 404);
  });
  return {
    requests,
    looks: () =>
      requests
        .filter((r) => new URL(r.url()).pathname.includes('/look'))
        .map((r) => ({ method: r.method(), path: new URL(r.url()).pathname, body: r.postData() ? r.postDataJSON() : undefined, cookie: r.headers().cookie })),
  };
}

/** Logs in by hand on the mock (with `?cloudtest`), Group and Character shown; then the game's StatusVars and the group. */
async function login(page: Page): Promise<LoginMock> {
  const m = await loginMock(page);
  await page.goto('/?cloudtest');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.evaluate(() => window.__wc!.settings.update({ character: { fetchInfo: false }, panes: { character: { on: true }, group: { on: true } } }));
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await expect(field(page)).toBeFocused();
  await page.keyboard.type('rasta');
  await page.keyboard.press('Enter');
  await expect(field(page)).toHaveClass(/\bwc-masked\b/);
  await page.keyboard.type(m.password);
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^playing/);
  play(m, gmcp('Char.StatusVars', { race: 'Man', subrace: 'Dunadan', level: 30 }), gmcp('Group.Set', MEMBERS));
  await expect(tkd(page, 2)).toBeVisible();
  return m;
}

test('flag off: no look request at all, live in the game with a group', async ({ page }) => {
  const api = await stub(page, { looks: false });
  await login(page);
  await page.waitForTimeout(2500);
  expect(api.looks()).toEqual([]);
  // The members follow the rows without the directory: the neutral figure.
  await expect(tkd(page, 2)).toHaveAttribute('data-look', 'drawn:neutral:-');
});

test('flag on: the report holds kinds only, the ask the players only; a row draws the member', async ({ page }) => {
  const api = await stub(page, { looks: true, rows: { glorfindel: { race: 'elf', subrace: 'noldo', sex: 'male', token: 'elf-m-mage' } } });
  await login(page);
  await expect.poll(() => api.looks().map((l) => `${l.method} ${l.path}`), { timeout: 10_000 }).toEqual(expect.arrayContaining(['PUT /api/look', 'POST /api/look/find']));
  const put = api.looks().find((l) => l.method === 'PUT')!;
  const key = await page.evaluate(() => localStorage.getItem('wc.lookKey'));
  expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(key).not.toBe(await page.evaluate(() => localStorage.getItem('wc.device')));
  expect(put.body).toEqual({ key, name: 'rasta', race: 'human', subrace: 'dunadan', sex: null, token: null });
  expect(put.cookie).toBeUndefined();
  expect(api.looks().find((l) => l.method === 'POST')!.body).toEqual({ names: ['glorfindel', 'strangerx'] });
  await expect(tkd(page, 2)).toHaveAttribute('data-look', 'lib:elf-m-mage');
  await expect(tkd(page, 3)).toHaveAttribute('data-look', 'drawn:neutral:-');
  // Once per character and session: a vitals update and the same StatusVars again send nothing.
  const n = api.looks().length;
  await page.waitForTimeout(1000);
  expect(api.looks().length).toBe(n);
});

test('flag on: the switch off sends the DELETE with the key; on again reports', async ({ page }) => {
  const api = await stub(page, { looks: true });
  await login(page);
  await expect.poll(() => api.looks().filter((l) => l.method === 'PUT').length, { timeout: 10_000 }).toBe(1);
  await page.evaluate(() => window.__wc!.settings.update({ character: { shareLook: false } }));
  await expect.poll(() => api.looks().filter((l) => l.method === 'DELETE').length).toBe(1);
  const key = await page.evaluate(() => localStorage.getItem('wc.lookKey'));
  expect(api.looks().find((l) => l.method === 'DELETE')!.body).toEqual({ key });
  await page.evaluate(() => window.__wc!.settings.update({ character: { shareLook: true } }));
  await expect.poll(() => api.looks().filter((l) => l.method === 'PUT').length).toBe(2);
});

test('flag on: a 409 is not sent again, and the picker says the look is shared from elsewhere', async ({ page }) => {
  const api = await stub(page, { looks: true, put: 409 });
  await login(page);
  await expect.poll(() => api.looks().filter((l) => l.method === 'PUT').length, { timeout: 10_000 }).toBe(1);
  await page.locator('.wc-pane-character .wc-cc-disc').click();
  const dlg = page.locator('[data-dlg="look"]');
  await expect(dlg).toBeVisible();
  await expect(dlg.locator('.wc-looks-share')).toContainText('Shared from another device or account');
  await dlg.locator('[role="tab"][data-tab="lib"]').click();
  await dlg.locator('.wc-looks-it[data-id="elf-f-noldor"]').click();
  await dlg.locator('[data-btn="USE"]').click();
  await page.waitForTimeout(1500);
  expect(api.looks().filter((l) => l.method === 'PUT').length).toBe(1);
});

test('flag on: a fixture replay never reports or asks', async ({ page }) => {
  const api = await stub(page, { looks: true });
  await page.goto('/?cloudtest&fixture=gmcp-demo.log&speed=0');
  await page.waitForFunction(() => window.__wc?.app !== undefined);
  await page.evaluate(() => window.__wc!.settings.update({ panes: { character: { on: true }, group: { on: true } } }));
  await expect.poll(() => page.evaluate(() => window.__wc!.app.game.char.view().name)).toBe('Rasta');
  await page.evaluate((members) => window.__wc!.app.bus.emit('gmcp', { pkg: 'Group.Set', key: 'group.set', data: members }), MEMBERS);
  await expect(tkd(page, 2)).toBeVisible();
  await page.waitForTimeout(2500);
  expect(api.looks()).toEqual([]);
});
