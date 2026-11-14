// The two spaces in the browser (ADR 0150, stage 61 B1): a page whose
// `wc.space` names an account reads that account's database, never the
// device's; without it the device's things are back; the map is the
// device's in both. Nothing logs in here: the test puts the page in the
// account's space by writing `wc.space` before the load, as the account
// flows will (part C).

import { type Page, expect, test } from '@playwright/test';

const SPACE = JSON.stringify({ nameKey: 'e2espace', state: 'open' });

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__wc?.shell !== undefined);
}

/** The profile and user script names the page's stores read. */
async function things(page: Page): Promise<{ profiles: string[]; scripts: string[]; map: string }> {
  return page.evaluate(async () => {
    const shell = window.__wc!.shell;
    await shell.scripts.init();
    return {
      profiles: (await shell.profiles.list()).map((p) => p.name),
      scripts: shell.scripts
        .list()
        .filter((s) => !s.bundled)
        .map((s) => s.name),
      map: (await shell.maps.current()).name,
    };
  });
}

test('an account space shows none of the device things, and back', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  // The device's own things, and an imported map in the device's database.
  await page.evaluate(async () => {
    const shell = window.__wc!.shell;
    await shell.profiles.init();
    await shell.profiles.create('guestonly', '#nop');
    await shell.scripts.init();
    await shell.scripts.create('guestscript', '-- @api 1');
    await shell.scripts.flush();
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.open('webcockpit');
      r.onsuccess = () => {
        const tx = r.result.transaction('maps', 'readwrite');
        tx.objectStore('maps').put({ key: 'current', name: 'e2e-map.mm2', size: 3, date: 1, bytes: new Uint8Array([1, 2, 3]).buffer, hash: 'e2e' });
        tx.oncomplete = () => {
          r.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      r.onerror = () => reject(r.error);
    });
  });
  const device = await things(page);
  expect(device.profiles).toContain('guestonly');
  expect(device.scripts).toContain('guestscript');
  expect(device.map).toBe('e2e-map.mm2');

  // Into the account's space.
  await page.evaluate((s) => localStorage.setItem('wc.space', s), SPACE);
  await page.reload();
  await ready(page);
  const account = await things(page);
  expect(account.profiles).not.toContain('guestonly');
  expect(account.profiles).toEqual(['default', 'khazdul']);
  expect(account.scripts).toEqual([]);
  expect(account.map).toBe('e2e-map.mm2');
  await page.evaluate(async () => {
    const shell = window.__wc!.shell;
    await shell.profiles.create('accountonly', '#nop');
    await shell.scripts.create('accountscript', '-- @api 1');
    await shell.scripts.flush();
  });
  const dbs = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
  expect(dbs).toEqual(expect.arrayContaining(['webcockpit', 'webcockpit-u-e2espace']));
  // The Profile page reads the same store: the account's profile is listed, the device's is not.
  expect((await things(page)).profiles).toContain('accountonly');

  // Back to the device's space.
  await page.evaluate(() => localStorage.removeItem('wc.space'));
  await page.reload();
  await ready(page);
  const back = await things(page);
  expect(back.profiles).toContain('guestonly');
  expect(back.profiles).not.toContain('accountonly');
  expect(back.scripts).toContain('guestscript');
  expect(back.scripts).not.toContain('accountscript');
  expect(back.map).toBe('e2e-map.mm2');

  // And the account's are still in its own database.
  await page.evaluate((s) => localStorage.setItem('wc.space', s), SPACE);
  await page.reload();
  await ready(page);
  const again = await things(page);
  expect(again.profiles).toContain('accountonly');
  expect(again.scripts).toEqual(['accountscript']);
});

test('another tab on the start page follows a change of space by reloading', async ({ context }) => {
  const a = await context.newPage();
  const b = await context.newPage();
  await a.goto('/');
  await b.goto('/');
  await ready(a);
  await ready(b);
  await b.evaluate(() => ((window as unknown as { __mark: number }).__mark = 1));
  // A write that keeps the space (a locked copy is the device's) is no change.
  await a.evaluate(() => localStorage.setItem('wc.space', JSON.stringify({ nameKey: 'e2espace', state: 'locked' })));
  await a.waitForTimeout(300);
  expect(await b.evaluate(() => (window as unknown as { __mark?: number }).__mark)).toBe(1);
  // Into the account's space: b reloads to the start menu.
  const reloaded = b.waitForEvent('load');
  await a.evaluate((s) => localStorage.setItem('wc.space', s), SPACE);
  await reloaded;
  await ready(b);
  expect(await b.evaluate(() => (window as unknown as { __mark?: number }).__mark)).toBeUndefined();
});
