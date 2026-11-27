// Stage 80 part D (ADR 0172): own images through the real local Worker, on
// two browser contexts (two devices) of one account. A makes the account
// (the device's looks move in), adds an image in the picker (the crop, Save
// image) and uses it as the portrait and as a member's Group token; B logs
// in and has both, as the portrait and as the token. B removes the image:
// the dialog says who uses it, the looks go back to automatic, and A has
// that after a sync. Then the server's refusals with a plain message on the
// shelf: an image over the size (`item_too_large`) and the 51st image
// (`too_many_items`), each kept on the device.
//
// The two projects share one local D1: names are unique per run, and each
// context has an address of its own (the API's limits per address).

import { type Browser, type BrowserContext, type Page, type TestInfo, expect, test } from '@playwright/test';
import { btn, field, fillCreate, frame, link, openAccount, openStart, pageOf, shownCode, watchErrors } from '../e2e/account-pages';
import { account, awayFromMenu, getIdb, logIn, owner, putIdb, spaceDbOf, syncNow } from '../e2e/sync-pages';
import { stubTurnstile } from '../e2e/turnstile-stub';

test.use({ viewport: { width: 1440, height: 900 } });

const FACE = 'tests/fixtures/looks/face.png';
const DEMO = '/?cloudtest&fixture=gmcp-demo.log&speed=0';
const projectIndex = (info: TestInfo): number => info.config.projects.findIndex((p) => p.name === info.project.name);

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

const disc = (p: Page) => p.locator('.wc-pane-character .wc-cc-disc');
const dlg = (p: Page) => p.locator('[data-dlg="look"]');
const tk = (p: Page) => p.locator('.wc-pane[data-pane="group"] .wc-gp-row[data-key="m2"] .wc-gp-tk');
const emit = (p: Page, pkg: string, data: unknown) =>
  p.evaluate(([k, d]) => window.__wc!.app.bus.emit('gmcp', { pkg: k as string, key: (k as string).toLowerCase(), data: d }), [pkg, data] as const);

/** The demo in the cockpit (the page's space), Character and Group on, Glorfindel in the group. */
async function cockpit(p: Page): Promise<void> {
  await p.goto(DEMO);
  await p.waitForFunction(() => window.__wc?.app !== undefined);
  await p.evaluate(() => window.__wc!.settings.update({ panes: { character: { on: true }, group: { on: true } }, character: { height: 'auto' } }));
  await expect.poll(() => p.evaluate(() => window.__wc!.app.game.char.view().name)).toBe('Rasta');
  await expect.poll(() => p.evaluate(() => window.__wc!.app.looks!.images!.ready.then(() => true))).toBe(true);
  await emit(p, 'Group.Set', [{ id: 2, type: 'ally', name: 'Glorfindel', hp: 70, maxhp: 160, mana: 70, maxmana: 100, mp: 90, maxmp: 110, position: 'standing' }]);
  await expect(tk(p)).toBeVisible();
}

async function openMine(p: Page, who: 'self' | 'member'): Promise<void> {
  await (who === 'self' ? disc(p) : tk(p)).click();
  await expect(dlg(p)).toBeVisible();
  await dlg(p).locator('[role="tab"][data-tab="mine"]').click();
}

/** The start page's Account page and Sync now (from the cockpit: a page load to the start). */
async function syncFromStart(p: Page): Promise<void> {
  await openStart(p);
  await account(p);
  await syncNow(p);
}

/** A sync that may end `full` (a refused push): Sync now, then wait until the image's record says why. */
async function syncRefused(p: Page, db: string, id: string): Promise<string> {
  await openStart(p);
  await account(p);
  const section = frame(p).locator('[data-sync]');
  await expect(section).not.toHaveAttribute('data-sync', 'syncing', { timeout: 10_000 });
  await btn(p, 'SYNCNOW').click();
  let why = '';
  await expect
    .poll(
      async () => {
        const rows = (await getIdb(p, db, 'sync')) as { kind?: string; rec?: { key?: string; state?: string; full?: string } }[];
        why = rows.find((r) => r.kind === 'lookImage' && r.rec?.key === id && r.rec.state === 'full')?.rec?.full ?? '';
        return why;
      },
      { timeout: 20_000 },
    )
    .not.toBe('');
  return why;
}

test('own images across two devices of one account: the portrait and the token, a removal, the refused ones', async ({ browser }, info) => {
  test.setTimeout(300_000);
  const ip = (n: number): string => `10.80.${projectIndex(info)}.${n}`;
  const name = `look${Date.now().toString(36).slice(-6)}`;
  const DB = spaceDbOf(name);

  // A: the device has a library look for Rasta; Create account moves it in.
  const a = await device(browser, ip(1));
  const errorsA = watchErrors(a.page);
  await openStart(a.page);
  await a.page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((r) => {
      const q = indexedDB.open('webcockpit');
      q.onsuccess = () => r(q.result);
    });
    const t = db.transaction('looks', 'readwrite');
    t.objectStore('looks').put({ names: { thorin: { look: { src: 'lib', id: 'elf-f-noldor' }, at: Date.now() - 60_000 } } }, 'looks');
    await new Promise((r) => (t.oncomplete = r));
    db.close();
  });
  await createAccount(a.page, name);
  expect(((await getIdb(a.page, DB, 'looks'))[0] as { names: Record<string, unknown> }).names).toHaveProperty('thorin');

  // A adds an image in the picker and uses it for Rasta and for Glorfindel.
  await cockpit(a.page);
  await openMine(a.page, 'self');
  await expect(dlg(a.page).locator('.wc-looks-count')).toContainText('0 of 50 images');
  await dlg(a.page).locator('.wc-looks-file').setInputFiles(FACE);
  await expect(dlg(a.page).locator('[data-mine="crop"]')).toBeVisible();
  await dlg(a.page).locator('[data-btn="CROP-SAVE"]').click();
  await expect(dlg(a.page).locator('.wc-looks-slot.is-full')).toHaveCount(1);
  await dlg(a.page).locator('[data-btn="USE"]').click();
  await expect(disc(a.page)).toHaveAttribute('data-art', 'own');
  await openMine(a.page, 'member');
  await dlg(a.page).locator('.wc-looks-slot.is-full').first().click();
  await dlg(a.page).locator('[data-btn="USE"]').click();
  await expect(tk(a.page).locator('.wc-gp-tkd.is-own img')).toHaveAttribute('src', /^data:image\/webp;base64,/);
  const id = await a.page.evaluate(() => (window.__wc!.app.looks!.stored('rasta') as { id: string }).id);
  await a.page.waitForTimeout(300);
  await syncFromStart(a.page);

  // B logs in: the image and the looks are there, as the portrait and as the token.
  const b = await device(browser, ip(2));
  const errorsB = watchErrors(b.page);
  await openStart(b.page);
  await logIn(b.page, name);
  await expect.poll(async () => (await getIdb(b.page, DB, 'lookImages')).map((r) => r.id)).toEqual([id]);
  const looksB = ((await getIdb(b.page, DB, 'looks'))[0] as { names: Record<string, { look: unknown }> }).names;
  expect(looksB.rasta?.look).toEqual({ src: 'own', id });
  expect(looksB.glorfindel?.look).toEqual({ src: 'own', id });
  expect(looksB.thorin?.look).toEqual({ src: 'lib', id: 'elf-f-noldor' });
  await cockpit(b.page);
  await expect(disc(b.page)).toHaveAttribute('data-art', 'own');
  await expect(disc(b.page).locator('img.wc-cc-photo')).toHaveAttribute('src', /^data:image\/webp;base64,/);
  await expect(tk(b.page).locator('.wc-gp-tkd.is-own img')).toHaveAttribute('src', /^data:image\/webp;base64,/);
  const shots = process.env.WC_LOOKS_SHOT_DIR;
  if (shots) {
    await b.page.locator('.wc-pane-character').screenshot({ path: `${shots}/worker-b-portrait-${info.project.name}.png` });
    await b.page.locator('.wc-pane[data-pane="group"]').screenshot({ path: `${shots}/worker-b-token-${info.project.name}.png` });
  }

  // B removes it: two characters use it, both go back to automatic, here and (after a sync) on A.
  await openMine(b.page, 'self');
  await expect(dlg(b.page).locator('.wc-looks-slot.is-full').first()).toHaveAttribute('aria-pressed', 'true');
  await dlg(b.page).locator('[data-btn="REMOVE"]').click();
  await expect(dlg(b.page).locator('.wc-looks-rm.is-ask')).toContainText('2 characters use this image (Glorfindel, Rasta). They go back to automatic.');
  await dlg(b.page).locator('[data-btn="REMOVE-YES"]').click();
  await expect(dlg(b.page).locator('.wc-looks-count')).toContainText('0 of 50 images');
  await dlg(b.page).locator('[data-btn="CANCEL"]').click();
  await expect(disc(b.page)).toHaveAttribute('data-look', 'auto');
  await b.page.waitForTimeout(300);
  await syncFromStart(b.page);
  await syncFromStart(a.page);
  await expect.poll(async () => (await getIdb(a.page, DB, 'lookImages')).length).toBe(0);
  const looksA = ((await getIdb(a.page, DB, 'looks'))[0] as { names: Record<string, { look: unknown }> }).names;
  expect([looksA.rasta?.look, looksA.glorfindel?.look, looksA.thorin?.look]).toEqual([{ src: 'auto' }, { src: 'auto' }, { src: 'lib', id: 'elf-f-noldor' }]);
  await cockpit(a.page);
  await expect(disc(a.page)).toHaveAttribute('data-look', 'auto');
  await expect(tk(a.page).locator('.wc-gp-tkd.is-own')).toHaveCount(0);

  // The server refuses an image over the size (one not made by this client's encoder): a plain message, kept here.
  const big = 'AbigImageOfFortyKBxxxx';
  const noise = await a.page.evaluate(() => {
    const b = new Uint8Array(40_002);
    crypto.getRandomValues(b);
    b.set([0x52, 0x49, 0x46, 0x46]); // RIFF
    let s = '';
    for (const x of b) s += String.fromCharCode(x);
    return btoa(s);
  });
  await putIdb(a.page, DB, 'lookImages', [{ id: big, label: 'too big', webp: noise, created: Date.now() }]);
  expect(await syncRefused(a.page, DB, big)).toBe('item_too_large');
  await cockpit(a.page);
  await openMine(a.page, 'self');
  await expect(dlg(a.page).locator('.wc-looks-msg')).toHaveText('“too big” is not in your account: it is larger than the account takes for one image. It stays on this device.');
  await expect(dlg(a.page).locator(`.wc-looks-slot[data-id="${big}"]`)).toHaveAttribute('data-refused', 'item_too_large');
  await dlg(a.page).locator(`.wc-looks-slot[data-id="${big}"]`).click();
  await dlg(a.page).locator('[data-btn="REMOVE"]').click();
  await expect(dlg(a.page).locator('.wc-looks-rm.is-ask')).toContainText('No character uses this image.');
  await dlg(a.page).locator('[data-btn="REMOVE-YES"]').click();
  await dlg(a.page).locator('[data-btn="CANCEL"]').click();

  // Fifty go in; the 51st is refused (too_many_items), with a plain message, and kept here.
  await a.ctx.setExtraHTTPHeaders({ 'CF-Connecting-IP': ip(4) });
  const small = await a.page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    c.getContext('2d')!.fillRect(0, 0, 4, 4);
    const blob = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), 'image/webp', 0.8));
    let s = '';
    for (const x of new Uint8Array(await blob.arrayBuffer())) s += String.fromCharCode(x);
    return btoa(s);
  });
  const ids = Array.from({ length: 51 }, (_, i) => `${String(i).padStart(2, '0')}fiftyoneimagesxxxxxx`);
  await putIdb(
    a.page,
    DB,
    'lookImages',
    ids.map((x, i) => ({ id: x, label: `image ${i + 1}`, webp: small, created: Date.now() + i })),
  );
  const refusedOne = await (async () => {
    await openStart(a.page);
    await account(a.page);
    await btn(a.page, 'SYNCNOW').click();
    let found = '';
    await expect
      .poll(
        async () => {
          const rows = (await getIdb(a.page, DB, 'sync')) as { kind?: string; rec?: { key?: string; state?: string; full?: string; rev?: number } }[];
          const look = rows.filter((r) => r.kind === 'lookImage');
          const full = look.find((r) => r.rec?.state === 'full');
          found = full ? `${full.rec?.key}:${full.rec?.full}` : '';
          return look.filter((r) => (r.rec?.rev ?? 0) > 0 && r.rec?.state === 'synced').length === 50 ? found : '';
        },
        { timeout: 60_000 },
      )
      .not.toBe('');
    return found;
  })();
  const [refusedId, why] = refusedOne.split(':');
  expect(why).toBe('too_many_items');
  await cockpit(a.page);
  await openMine(a.page, 'self');
  const label = await a.page.evaluate((x) => window.__wc!.app.looks!.images!.get(x!)?.label, refusedId);
  await expect(dlg(a.page).locator('.wc-looks-msg')).toHaveText(`“${label}” is not in your account: the account already has as many images as it may. It stays on this device.`);
  await expect(dlg(a.page).locator('.wc-looks-count')).toContainText('51 of 50 images');
  // A full shelf: Add image asks to remove one first.
  await dlg(a.page).locator('[data-btn="ADD"]').click();
  await expect(dlg(a.page).locator('.wc-looks-msg')).toHaveText('Your shelf is full (50 of 50). Remove an image first.');
  await dlg(a.page).locator('[data-btn="CANCEL"]').click();

  expect(errorsA).toEqual([]);
  expect(errorsB).toEqual([]);
  await a.ctx.close();
  await b.ctx.close();
});
